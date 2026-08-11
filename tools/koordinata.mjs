#!/usr/bin/env node
/**
 * koordinata.mjs v4 — Racecourse360 térkép-alapú koordináta-kereső
 *
 * MIÉRT KELLETT v4 (a v3 futás tanulsága)
 * ---------------------------------------
 * A v3 soronként 1-2 Overpass-lekérdezést küldött → ~460 kérés. A nyilvános
 * Overpass ezt rate-limitálta, és a szkript NÉMÁN üres listát kapott:
 * 233 sorból 232-nél "nulla találat" jött ki, ami nem valós eredmény volt.
 *
 * A v4 megoldása: EGYETLEN országos lekérdezés. Egyszer lekérjük Franciaország
 * ÖSSZES pálya-objektumát, fájlba mentjük, és a párosítás utána HELYBEN fut,
 * hálózat nélkül. Így nincs rate-limit, és a futás percekben mérhető.
 *
 * FORRÁSOK
 * 1) Overpass — egyetlen országos lekérdezés, gyorsítótárazva fájlba
 *    (eredmeny/osm_palyak.json). Újrafuttatásnál nem tölti le újra.
 * 2) Nominatim — a pálya NEVÉRE keres. A korábbi futás eredményét
 *    újrahasznosítja, ha megtalálja (eredmeny/koordinatak.json), így
 *    233 fölösleges lekérdezést megspórolunk.
 *
 * ÁLLAPOTOK (erősség szerint)
 *   KET_FORRAS_EGYEZIK   — a névkeresés és az OSM-objektum ugyanoda mutat
 *   OSM_OBJEKTUM_NEVVEL  — OSM pálya-objektum, erős névegyezés
 *   NEV_POI              — csak a névkeresés talált (POI a térképen)
 *   KOZELI_OSM_OBJEKTUM  — van pálya-objektum a közelben, gyenge névegyezés
 *   NINCS_TALALAT        — semmi
 *
 * FUTTATÁS
 *   npm install xlsx
 *   node tools/koordinata.mjs
 *   node tools/koordinata.mjs tools/Racecourse_360.xlsx "Franciaország"
 *
 * KIMENET (soronként frissül)
 *   eredmeny/koordinatak.json / .csv
 *   eredmeny/kezi_ellenorzes.csv
 *   eredmeny/osm_palyak.json      — az országos OSM-lista (gyorsítótár)
 */

import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

// --- Beállítások ---
const NEV_EGYEZES_HATAR = 0.35;
const EGYEZES_TAVOLSAG_M = 3000;   // két forrás ennyin belül = egyezik
const KOZELSEG_HATAR_M = 12000;    // ilyen közel keresünk OSM-objektumot
const NOMINATIM_VARAKOZAS_MS = 1200;
const USER_AGENT = 'racecourse360-koordinata-kereso/4.0 (kutatasi celra)';
const ALAP_EXCEL = 'tools/Racecourse_360.xlsx';
const ORSZAG_KOD = 'fr';
const ORSZAG_NEV = 'France';
const kimenetMappa = 'eredmeny';
const OSM_CACHE = path.join(kimenetMappa, 'osm_palyak.json');

// FONTOS: csak TELJES BOLYGÓ adatbázisú szerverek szerepelhetnek itt!
// A korábbi verzióban benne volt az overpass.osm.ch, ami KIZÁRÓLAG svájci
// adatot szolgál ki — "sikeresen" válaszolt, de csak svájci objektumokkal,
// és emiatt az egész francia futás használhatatlan lett.
const OVERPASS_SZERVEREK = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// Ennél kevesebb találat esetén NEM fogadjuk el a választ, hanem megyünk
// a következő szerverre. Franciaországban több száz pálya-objektum van;
// ha ennél lényegesen kevesebb jön, valami baj van a forrással.
const MINIMALIS_ELVART_OBJEKTUM = 150;

// --- Segédfüggvények ---
const varj = (ms) => new Promise((r) => setTimeout(r, ms));

function tavolsagMeter(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nevNormalizalas(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const TOLTELEK = new Set([
  'hippodrome', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd',
  'racecourse', 'raceway', 'champ', 'courses', 'course', 'societe',
  'saint', 'st', 'sur', 'sous', 'en', 'et', 'aux', 'au',
]);

function kulcsSzavak(s) {
  return new Set(
    nevNormalizalas(s).split(' ').filter((w) => w.length > 2 && !TOLTELEK.has(w))
  );
}

function nevHasonlosag(a, b) {
  const A = kulcsSzavak(a);
  const B = kulcsSzavak(b);
  if (A.size === 0 || B.size === 0) return 0;
  let kozos = 0;
  for (const w of A) if (B.has(w)) kozos++;
  return kozos / Math.min(A.size, B.size);
}

// --- EGYETLEN országos Overpass-lekérdezés, gyorsítótárral ---
async function osmPalyakLetoltese() {
  if (fs.existsSync(OSM_CACHE)) {
    try {
      const lista = JSON.parse(fs.readFileSync(OSM_CACHE, 'utf-8'));
      if (Array.isArray(lista) && lista.length >= MINIMALIS_ELVART_OBJEKTUM) {
        console.log(`OSM-lista a gyorsítótárból: ${lista.length} objektum.`);
        return lista;
      }
      console.log(
        `A gyorsítótárban csak ${lista?.length ?? 0} objektum van (elvárt legalább ` +
          `${MINIMALIS_ELVART_OBJEKTUM}) — eldobjuk és újra letöltjük.`
      );
    } catch {
      console.log('A gyorsítótár sérült, újra letöltjük.');
    }
  }

  // Országhatár szerint kérdezünk, NEM téglalappal: a francia befoglaló
  // doboz beleveszi Svájcot, Belgiumot, Németország egy részét is.
  const query = `
    [out:json][timeout:600];
    area["ISO3166-1"="FR"]["admin_level"="2"]->.fr;
    (
      nwr(area.fr)["leisure"="track"]["sport"~"equestrian|horse_racing"];
      nwr(area.fr)["landuse"="racetrack"];
      nwr(area.fr)["sport"="horse_racing"];
      nwr(area.fr)["name"~"[Hh]ippodrome"];
    );
    out center tags;
  `.trim();

  console.log('Országos OSM-lekérdezés indul (ez 1-5 perc is lehet)...');

  for (let i = 0; i < OVERPASS_SZERVEREK.length; i++) {
    const szerver = OVERPASS_SZERVEREK[i];
    console.log(`  próba: ${szerver}`);
    try {
      const vezerlo = new AbortController();
      const idozito = setTimeout(() => vezerlo.abort(), 900000); // 15 perc
      const resp = await fetch(szerver, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: 'data=' + encodeURIComponent(query),
        signal: vezerlo.signal,
      });
      clearTimeout(idozito);

      if (!resp.ok) {
        console.log(`  sikertelen (HTTP ${resp.status}) — jön a következő szerver`);
        await varj(5000);
        continue;
      }

      const json = await resp.json();
      const elemek = json?.elements || [];
      const lista = [];
      for (const el of elemek) {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (lat == null || lon == null) continue;
        lista.push({
          lat,
          lon,
          nev: el.tags?.name || null,
          tipus: el.type,
          id: el.id,
        });
      }

      // ÉPELMÉJŰSÉG-ELLENŐRZÉS: ha gyanúsan kevés objektum jött, a szerver
      // valószínűleg részleges vagy regionális adatot adott (ez történt a
      // svájci szerverrel). Ilyenkor NEM fogadjuk el, megyünk tovább.
      if (lista.length < MINIMALIS_ELVART_OBJEKTUM) {
        console.log(
          `  GYANÚS: csak ${lista.length} objektum jött (elvárt legalább ` +
            `${MINIMALIS_ELVART_OBJEKTUM}). Ezt a választ ELDOBJUK, ` +
            `jön a következő szerver.`
        );
        await varj(5000);
        continue;
      }

      if (!fs.existsSync(kimenetMappa)) fs.mkdirSync(kimenetMappa, { recursive: true });
      fs.writeFileSync(OSM_CACHE, JSON.stringify(lista, null, 2), 'utf-8');
      console.log(`  siker: ${lista.length} objektum letöltve és elmentve.`);
      return lista;
    } catch (hiba) {
      console.log(`  hiba: ${hiba.message || hiba} — jön a következő szerver`);
      await varj(5000);
    }
  }

  console.log(
    'FIGYELEM: az országos OSM-lekérdezés MINDEN szerveren megbukott.\n' +
      'A futás folytatódik, de csak a névkeresésre támaszkodhatunk.'
  );
  return [];
}

// --- Nominatim névkeresés ---
async function nominatimNevre(nev, telepules) {
  const keresesek = [
    `${nev}, ${telepules}, ${ORSZAG_NEV}`,
    `${nev}, ${ORSZAG_NEV}`,
  ];
  for (const k of keresesek) {
    try {
      const url =
        `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(k)}&format=json&limit=1&countrycodes=${ORSZAG_KOD}`;
      const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (resp.ok) {
        const json = await resp.json();
        if (json?.[0]) {
          await varj(NOMINATIM_VARAKOZAS_MS);
          return {
            lat: parseFloat(json[0].lat),
            lon: parseFloat(json[0].lon),
            nev: json[0].display_name,
          };
        }
      }
    } catch {
      // megyünk tovább
    }
    await varj(NOMINATIM_VARAKOZAS_MS);
  }
  return null;
}

// --- Legjobb OSM-jelölt kiválasztása a helyi listából ---
function legjobbOsmJelolt(osmLista, nev, horgonyLat, horgonyLon) {
  let legjobb = null;
  let legjobbPont = -Infinity;
  const jeloltek = [];

  for (const o of osmLista) {
    const tav =
      horgonyLat != null
        ? tavolsagMeter(horgonyLat, horgonyLon, o.lat, o.lon)
        : null;
    const h = nevHasonlosag(nev, o.nev);

    // Csak akkor jöhet szóba, ha vagy közel van a horgonyhoz,
    // vagy erősen egyezik a neve.
    const kozel = tav != null && tav <= KOZELSEG_HATAR_M;
    if (!kozel && h < 0.6) continue;

    jeloltek.push({ ...o, tav_m: tav != null ? Math.round(tav) : null, h });

    // Pontozás: a névegyezés dominál, a távolság finomhangol.
    const pont = h * 1000 - (tav != null ? tav / 1000 : 50);
    if (pont > legjobbPont) {
      legjobbPont = pont;
      legjobb = { ...o, tav_m: tav != null ? Math.round(tav) : null, h };
    }
  }

  return { legjobb, jeloltek };
}

// --- Kiírás ---
function csvKiiras(sorok, utvonal) {
  if (sorok.length === 0) return fs.writeFileSync(utvonal, '', 'utf-8');
  const oszlopok = Object.keys(sorok[0]);
  const csv = [oszlopok.join(';')];
  for (const s of sorok) {
    csv.push(
      oszlopok
        .map((o) => `"${String(s[o] ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""')}"`)
        .join(';')
    );
  }
  fs.writeFileSync(utvonal, csv.join('\n'), 'utf-8');
}

const BIZTOS = new Set(['KET_FORRAS_EGYEZIK', 'OSM_OBJEKTUM_NEVVEL']);

function mentes(eredmenyek) {
  if (!fs.existsSync(kimenetMappa)) fs.mkdirSync(kimenetMappa, { recursive: true });
  fs.writeFileSync(
    path.join(kimenetMappa, 'koordinatak.json'),
    JSON.stringify(eredmenyek, null, 2),
    'utf-8'
  );
  csvKiiras(eredmenyek, path.join(kimenetMappa, 'koordinatak.csv'));
  csvKiiras(
    eredmenyek.filter((e) => !BIZTOS.has(e.koord_allapot)),
    path.join(kimenetMappa, 'kezi_ellenorzes.csv')
  );
}

async function munkafuzetBeolvasas(utvonal) {
  if (/^https?:\/\//i.test(utvonal)) {
    const resp = await fetch(utvonal, { headers: { 'User-Agent': USER_AGENT } });
    if (!resp.ok) throw new Error(`Letöltés sikertelen (HTTP ${resp.status})`);
    return XLSX.read(Buffer.from(await resp.arrayBuffer()), { type: 'buffer' });
  }
  if (!fs.existsSync(utvonal)) throw new Error(`Nincs ilyen fájl: ${utvonal}`);
  return XLSX.readFile(utvonal);
}

/** Korábbi futásból kinyeri a már meglévő Nominatim-találatokat. */
function korabbiNominatimTalalatok() {
  const ut = path.join(kimenetMappa, 'koordinatak.json');
  const terkep = new Map();
  if (!fs.existsSync(ut)) return terkep;
  try {
    const regi = JSON.parse(fs.readFileSync(ut, 'utf-8'));
    for (const r of regi) {
      const kulcs = `${r['Település']}|${r['Név']}`;
      // A NEV_POI és KET_FORRAS_EGYEZIK sorokban a névkeresés eredménye van.
      if (
        (r.koord_allapot === 'NEV_POI' || r.koord_allapot === 'KET_FORRAS_EGYEZIK') &&
        r.koord_lat != null
      ) {
        terkep.set(kulcs, { lat: r.koord_lat, lon: r.koord_lon, nev: r.koord_osm_nev });
      }
    }
  } catch {
    // ha sérült, egyszerűen nem használjuk
  }
  return terkep;
}

// --- Fő program ---
async function main() {
  const bemenetiFajl = process.argv[2] || ALAP_EXCEL;
  const munkalapNev = process.argv[3] || 'Franciaország';

  console.log(`Beolvasás: ${bemenetiFajl} (munkalap: "${munkalapNev}")`);
  const munkafuzet = await munkafuzetBeolvasas(bemenetiFajl);
  const munkalap = munkafuzet.Sheets[munkalapNev];
  if (!munkalap) {
    console.error(`Nincs "${munkalapNev}" munkalap. Van: ${munkafuzet.SheetNames.join(', ')}`);
    process.exit(1);
  }
  const sorok = XLSX.utils.sheet_to_json(munkalap, { defval: null });
  console.log(`${sorok.length} sor beolvasva.\n`);

  // 1) Egyetlen országos OSM-lekérdezés
  const osmLista = await osmPalyakLetoltese();

  // 2) Korábbi Nominatim-eredmények újrahasznosítása
  const regiNominatim = korabbiNominatimTalalatok();
  if (regiNominatim.size > 0) {
    console.log(`\nKorábbi névkeresési találatok újrahasznosítva: ${regiNominatim.size} db.`);
  }
  console.log('');

  const eredmenyek = [];
  let i = 0;

  for (const sor of sorok) {
    i++;
    const nev = sor['Név'] ?? '';
    const telepules = sor['Település'] ?? '';
    const kulcs = `${telepules}|${nev}`;
    process.stdout.write(`[${i}/${sorok.length}] ${nev || telepules} ... `);

    const e = {
      ...sor,
      koord_allapot: null,
      koord_lat: null,
      koord_lon: null,
      koord_forras: null,
      koord_osm_nev: null,
      koord_osm_azonosito: null,
      koord_nevegyezes: null,
      koord_tavolsag_m: null,
      koord_jeloltek_szama: null,
      koord_jeloltek: null,
      koord_megjegyzes: null,
    };

    try {
      // A) Névkeresés — korábbi eredmény, vagy új lekérdezés
      let nevTalalat = regiNominatim.get(kulcs) || null;
      if (!nevTalalat && nev) {
        nevTalalat = await nominatimNevre(nev, telepules);
      }

      // B) OSM-objektum a helyi listából
      const horgonyLat = nevTalalat?.lat ?? null;
      const horgonyLon = nevTalalat?.lon ?? null;
      const { legjobb, jeloltek } = legjobbOsmJelolt(
        osmLista,
        nev,
        horgonyLat,
        horgonyLon
      );

      e.koord_jeloltek_szama = jeloltek.length;
      e.koord_jeloltek = jeloltek
        .slice(0, 6)
        .map((j) => `${j.nev || 'névtelen'}${j.tav_m != null ? ` (${j.tav_m} m)` : ''}`)
        .join(' | ');

      if (legjobb) {
        e.koord_osm_nev = legjobb.nev;
        e.koord_osm_azonosito = `${legjobb.tipus}/${legjobb.id}`;
        e.koord_nevegyezes = Number(legjobb.h.toFixed(2));
        e.koord_tavolsag_m = legjobb.tav_m;
      }

      // C) Döntés
      if (nevTalalat && legjobb && legjobb.tav_m != null && legjobb.tav_m <= EGYEZES_TAVOLSAG_M) {
        e.koord_allapot = 'KET_FORRAS_EGYEZIK';
        e.koord_lat = legjobb.lat;
        e.koord_lon = legjobb.lon;
        e.koord_forras = 'Nominatim névkeresés + OSM pálya-objektum';
        e.koord_megjegyzes =
          `A névkeresés és az OSM-objektum ${legjobb.tav_m} m-re van egymástól — ` +
          `egyeznek. OSM: "${legjobb.nev || 'névtelen'}".`;
      } else if (legjobb && legjobb.h >= NEV_EGYEZES_HATAR) {
        e.koord_allapot = 'OSM_OBJEKTUM_NEVVEL';
        e.koord_lat = legjobb.lat;
        e.koord_lon = legjobb.lon;
        e.koord_forras = 'OSM pálya-objektum (névegyezés)';
        e.koord_megjegyzes = `OSM pálya-objektum erős névegyezéssel: "${legjobb.nev}".`;
      } else if (nevTalalat) {
        e.koord_allapot = 'NEV_POI';
        e.koord_lat = nevTalalat.lat;
        e.koord_lon = nevTalalat.lon;
        e.koord_forras = 'Nominatim névkeresés';
        e.koord_megjegyzes =
          'A pálya neve megvan a térképen, de OSM pálya-objektum nem erősítette meg. Ellenőrizd.';
      } else if (legjobb) {
        e.koord_allapot = 'KOZELI_OSM_OBJEKTUM';
        e.koord_lat = legjobb.lat;
        e.koord_lon = legjobb.lon;
        e.koord_forras = 'OSM pálya-objektum (bizonytalan)';
        e.koord_megjegyzes =
          `Van pálya-objektum a közelben ("${legjobb.nev || 'névtelen'}"), de a név ` +
          `nem egyezik erősen. Ellenőrizd.`;
      } else {
        e.koord_allapot = 'NINCS_TALALAT';
        e.koord_megjegyzes = 'Sem a névkeresés, sem az OSM-lista nem adott találatot.';
      }
    } catch (hiba) {
      e.koord_allapot = 'HIBA';
      e.koord_megjegyzes = String(hiba);
    }

    eredmenyek.push(e);
    console.log(e.koord_allapot);
    mentes(eredmenyek);
  }

  const ossz = {};
  for (const e of eredmenyek) ossz[e.koord_allapot] = (ossz[e.koord_allapot] || 0) + 1;
  console.log('\n--- ÖSSZESÍTÉS ---');
  for (const [a, db] of Object.entries(ossz)) console.log(`${a}: ${db}`);

  const biztos = eredmenyek.filter((e) => BIZTOS.has(e.koord_allapot)).length;
  console.log(`\nKözvetlenül beépíthető: ${biztos} pálya.`);
  console.log(`Kézi ellenőrzés: ${eredmenyek.length - biztos} pálya (kezi_ellenorzes.csv).`);
}

main().catch((hiba) => {
  console.error('Váratlan hiba:', hiba);
  process.exit(1);
});
