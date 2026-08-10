#!/usr/bin/env node
/**
 * koordinata.mjs v3 — Racecourse360 térkép-alapú koordináta-kereső
 *
 * MI VÁLTOZOTT a v2-höz képest (a levágott futás tanulságai):
 *
 * 1) SORONKÉNTI MENTÉS — minden egyes sor után azonnal ír a lemezre.
 *    Ha a futás megszakad (timeout, hálózat, bármi), a addigi eredmény MEGVAN.
 * 2) FOLYTATHATÓ — újraindításkor beolvassa a korábbi eredményt, és csak
 *    a még feldolgozatlan sorokkal foglalkozik. Nem kezdi elölről.
 * 3) TÖBB KERESÉSI STRATÉGIA — nem csak egy módon próbálkozik:
 *      A) Nominatim: rákeres magára a PÁLYA NEVÉRE (sok hippodrome POI-ként
 *         szerepel a térképen) — ez a v2-ből teljesen hiányzott
 *      B) Overpass: pálya-objektum a település körül, előbb 5, aztán 15 km
 *      C) ha A és B egyezik → erős megerősítés
 *    Így sokkal nagyobb az esély, hogy legalább VALAMIT talál minden sorra.
 * 4) SZERVER-FAILOVER — 3 különböző Overpass-szerver, ha az egyik lassú/hibás
 * 5) TELEPÜLÉS-GYORSÍTÓTÁR — ugyanazt a települést nem kérdezi le kétszer
 *
 * ÁLLAPOTOK (erősség szerint csökkenő sorrendben)
 *   KET_FORRAS_EGYEZIK   — a névkeresés és az OSM-objektum ugyanoda mutat
 *   OSM_OBJEKTUM_NEVVEL  — OSM pálya-objektum, erős névegyezés
 *   NEV_POI              — a térképen POI-ként megvan a pálya neve
 *   EGYETLEN_JELOLT      — 1 pálya-objektum a körzetben, gyenge névegyezés
 *   TOBB_JELOLT          — több jelölt, nincs egyértelmű névegyezés
 *   NINCS_TALALAT        — semmi
 *
 * FUTTATÁS
 *   npm install xlsx
 *   node tools/koordinata.mjs
 *   node tools/koordinata.mjs tools/Racecourse_360.xlsx "Franciaország"
 *
 * KIMENET (folyamatosan frissül futás közben!)
 *   eredmeny/koordinatak.json     — minden feldolgozott sor
 *   eredmeny/koordinatak.csv
 *   eredmeny/kezi_ellenorzes.csv  — amit kézzel kell megnézni
 */

import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

// --- Beállítások ---
const SUGAR_SZUK_M = 5000;         // első próbálkozás
const SUGAR_TAG_M = 15000;         // ha szűken nincs semmi
const NEV_EGYEZES_HATAR = 0.35;
const EGYEZES_TAVOLSAG_M = 2000;   // két forrás ennyin belül = egyezik
const NOMINATIM_VARAKOZAS_MS = 1100;
const OVERPASS_VARAKOZAS_MS = 1200;
const USER_AGENT = 'racecourse360-koordinata-kereso/3.0 (kutatasi celra)';
const ALAP_EXCEL = 'tools/Racecourse_360.xlsx';
const ORSZAG_KOD = 'fr';
const ORSZAG_NEV = 'France';
const kimenetMappa = 'eredmeny';

// Több Overpass-szerver: ha az egyik lassú vagy hibázik, jön a következő.
const OVERPASS_SZERVEREK = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];
let aktualisSzerver = 0;

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
  'saint', 'st', 'sur', 'sous', 'en', 'et',
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

// --- Nominatim (általános kereső) ---
async function nominatim(kereses) {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(kereses)}&format=json&limit=5` +
      `&countrycodes=${ORSZAG_KOD}&extratags=1`;
    const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!resp.ok) return [];
    const json = await resp.json();
    return (json || []).map((t) => ({
      lat: parseFloat(t.lat),
      lon: parseFloat(t.lon),
      nev: t.display_name,
      tipus: t.type,
      osztaly: t.class,
    }));
  } catch {
    return [];
  } finally {
    await varj(NOMINATIM_VARAKOZAS_MS);
  }
}

// --- Település gyorsítótár ---
const telepulesCache = new Map();

async function telepulesKoordinata(telepules) {
  const kulcs = nevNormalizalas(telepules);
  if (telepulesCache.has(kulcs)) return telepulesCache.get(kulcs);
  const talalatok = await nominatim(`${telepules}, ${ORSZAG_NEV}`);
  const eredmeny = talalatok[0] || null;
  telepulesCache.set(kulcs, eredmeny);
  return eredmeny;
}

// --- Overpass, szerver-failoverrel ---
async function overpass(query) {
  for (let probalkozas = 0; probalkozas < OVERPASS_SZERVEREK.length; probalkozas++) {
    const szerver = OVERPASS_SZERVEREK[aktualisSzerver];
    try {
      const vezerlo = new AbortController();
      const idozito = setTimeout(() => vezerlo.abort(), 60000);
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
      if (resp.ok) {
        const json = await resp.json();
        await varj(OVERPASS_VARAKOZAS_MS);
        return json?.elements || [];
      }
    } catch {
      // megyünk a következő szerverre
    }
    aktualisSzerver = (aktualisSzerver + 1) % OVERPASS_SZERVEREK.length;
    await varj(OVERPASS_VARAKOZAS_MS);
  }
  return [];
}

async function palyaObjektumok(lat, lon, sugarM) {
  const query = `
    [out:json][timeout:50];
    (
      nwr(around:${sugarM},${lat},${lon})["leisure"="track"]["sport"~"equestrian|horse_racing"];
      nwr(around:${sugarM},${lat},${lon})["landuse"="racetrack"];
      nwr(around:${sugarM},${lat},${lon})["sport"="horse_racing"];
      nwr(around:${sugarM},${lat},${lon})["name"~"hippodrome|trot",i];
    );
    out center tags;
  `.trim();

  const elemek = await overpass(query);
  const talalatok = [];
  const latottak = new Set();
  for (const el of elemek) {
    const elLat = el.lat ?? el.center?.lat;
    const elLon = el.lon ?? el.center?.lon;
    if (elLat == null || elLon == null) continue;
    const kulcs = `${elLat.toFixed(3)},${elLon.toFixed(3)}`;
    if (latottak.has(kulcs)) continue;
    latottak.add(kulcs);
    talalatok.push({
      lat: elLat,
      lon: elLon,
      osmNev: el.tags?.name || null,
      osmTipus: el.type,
      osmId: el.id,
      tav_m: Math.round(tavolsagMeter(lat, lon, elLat, elLon)),
    });
  }
  return talalatok;
}

// --- Egy sor feldolgozása ---
async function sorFeldolgozasa(sor) {
  const nev = sor['Név'] ?? '';
  const telepules = sor['Település'] ?? '';

  const e = {
    ...sor,
    koord_allapot: null,
    koord_lat: null,
    koord_lon: null,
    koord_forras: null,
    koord_osm_nev: null,
    koord_osm_azonosito: null,
    koord_nevegyezes: null,
    koord_jeloltek_szama: null,
    koord_jeloltek: null,
    koord_megjegyzes: null,
  };

  // --- A) Rákeresünk magára a pálya nevére a térképen ---
  let nevTalalat = null;
  if (nev) {
    const keresesek = [
      `${nev}, ${telepules}, ${ORSZAG_NEV}`,
      `${nev}, ${ORSZAG_NEV}`,
    ];
    for (const k of keresesek) {
      const talalatok = await nominatim(k);
      if (talalatok.length > 0) {
        nevTalalat = talalatok[0];
        break;
      }
    }
  }

  // --- B) Település + Overpass ---
  const kozpont = telepules ? await telepulesKoordinata(telepules) : null;
  let jeloltek = [];
  if (kozpont) {
    jeloltek = await palyaObjektumok(kozpont.lat, kozpont.lon, SUGAR_SZUK_M);
    if (jeloltek.length === 0) {
      jeloltek = await palyaObjektumok(kozpont.lat, kozpont.lon, SUGAR_TAG_M);
    }
  }

  e.koord_jeloltek_szama = jeloltek.length;
  e.koord_jeloltek = jeloltek
    .map((j) => `${j.osmNev || 'névtelen'} (${j.tav_m} m)`)
    .join(' | ');

  // Legjobb OSM-jelölt kiválasztása névegyezés alapján
  let legjobb = null;
  for (const j of jeloltek) {
    const h = nevHasonlosag(nev, j.osmNev);
    const pont = h * 1000 - j.tav_m / 1000;
    if (!legjobb || pont > legjobb._pont) legjobb = { ...j, _h: h, _pont: pont };
  }

  // --- C) Döntés ---
  if (nevTalalat && legjobb) {
    const d = tavolsagMeter(nevTalalat.lat, nevTalalat.lon, legjobb.lat, legjobb.lon);
    if (d <= EGYEZES_TAVOLSAG_M) {
      e.koord_allapot = 'KET_FORRAS_EGYEZIK';
      e.koord_lat = legjobb.lat;   // az OSM-objektum pontosabb, mint a POI-pont
      e.koord_lon = legjobb.lon;
      e.koord_forras = 'Nominatim névkeresés + Overpass OSM-objektum';
      e.koord_megjegyzes =
        `A névkeresés és az OSM pálya-objektum ${Math.round(d)} m-re van ` +
        `egymástól — egyeznek. OSM: "${legjobb.osmNev || 'névtelen'}".`;
    }
  }

  if (!e.koord_allapot && legjobb && legjobb._h >= NEV_EGYEZES_HATAR) {
    e.koord_allapot = 'OSM_OBJEKTUM_NEVVEL';
    e.koord_lat = legjobb.lat;
    e.koord_lon = legjobb.lon;
    e.koord_forras = 'Overpass OSM-objektum (névegyezés)';
    e.koord_megjegyzes = `OSM pálya-objektum erős névegyezéssel: "${legjobb.osmNev}".`;
  }

  if (!e.koord_allapot && nevTalalat) {
    e.koord_allapot = 'NEV_POI';
    e.koord_lat = nevTalalat.lat;
    e.koord_lon = nevTalalat.lon;
    e.koord_forras = 'Nominatim névkeresés';
    e.koord_megjegyzes =
      `A pálya neve POI-ként megvan a térképen ("${nevTalalat.nev}"), de ` +
      `OSM pálya-objektum nem erősítette meg. Ellenőrizd.`;
  }

  if (!e.koord_allapot && legjobb) {
    if (jeloltek.length === 1) {
      e.koord_allapot = 'EGYETLEN_JELOLT';
      e.koord_megjegyzes =
        `1 pálya-objektum a körzetben ("${legjobb.osmNev || 'névtelen'}"), ` +
        `gyenge névegyezés. Valószínűleg ez az, de nézd meg.`;
    } else {
      e.koord_allapot = 'TOBB_JELOLT';
      e.koord_megjegyzes =
        `${jeloltek.length} jelölt, nincs egyértelmű névegyezés. ` +
        `Válassz a "koord_jeloltek" oszlopból.`;
    }
    e.koord_lat = legjobb.lat;
    e.koord_lon = legjobb.lon;
    e.koord_forras = 'Overpass OSM-objektum (bizonytalan)';
  }

  if (!e.koord_allapot) {
    e.koord_allapot = 'NINCS_TALALAT';
    e.koord_megjegyzes = kozpont
      ? `Sem a névre, sem a térképi objektumokra nincs találat ${telepules} körül.`
      : `A "${telepules}" települést sem sikerült geokódolni.`;
  }

  if (legjobb) {
    e.koord_osm_nev = legjobb.osmNev;
    e.koord_osm_azonosito = `${legjobb.osmTipus}/${legjobb.osmId}`;
    e.koord_nevegyezes = Number(legjobb._h.toFixed(2));
  }

  return e;
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

function mentes(eredmenyek) {
  if (!fs.existsSync(kimenetMappa)) fs.mkdirSync(kimenetMappa, { recursive: true });
  fs.writeFileSync(
    path.join(kimenetMappa, 'koordinatak.json'),
    JSON.stringify(eredmenyek, null, 2),
    'utf-8'
  );
  csvKiiras(eredmenyek, path.join(kimenetMappa, 'koordinatak.csv'));
  const jok = new Set(['KET_FORRAS_EGYEZIK', 'OSM_OBJEKTUM_NEVVEL']);
  csvKiiras(
    eredmenyek.filter((e) => !jok.has(e.koord_allapot)),
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
  console.log(`${sorok.length} sor beolvasva.`);

  // --- Folytatás korábbi futásból ---
  const jsonUt = path.join(kimenetMappa, 'koordinatak.json');
  let eredmenyek = [];
  if (fs.existsSync(jsonUt)) {
    try {
      eredmenyek = JSON.parse(fs.readFileSync(jsonUt, 'utf-8'));
      console.log(`Korábbi futás betöltve: ${eredmenyek.length} sor kész.`);
    } catch {
      console.log('A korábbi eredményfájl sérült, elölről kezdjük.');
      eredmenyek = [];
    }
  }

  const keszKulcsok = new Set(
    eredmenyek.map((e) => `${e['Település']}|${e['Név']}`)
  );

  let i = 0;
  for (const sor of sorok) {
    i++;
    const kulcs = `${sor['Település']}|${sor['Név']}`;
    if (keszKulcsok.has(kulcs)) continue;

    const cimke = sor['Név'] || sor['Település'] || '(névtelen)';
    process.stdout.write(`[${i}/${sorok.length}] ${cimke} ... `);

    let e;
    try {
      e = await sorFeldolgozasa(sor);
    } catch (hiba) {
      e = { ...sor, koord_allapot: 'HIBA', koord_megjegyzes: String(hiba) };
    }
    eredmenyek.push(e);
    keszKulcsok.add(kulcs);
    console.log(e.koord_allapot);

    mentes(eredmenyek);   // <<< minden sor után azonnal mentünk
  }

  const ossz = {};
  for (const e of eredmenyek) ossz[e.koord_allapot] = (ossz[e.koord_allapot] || 0) + 1;
  console.log('\n--- ÖSSZESÍTÉS ---');
  for (const [a, db] of Object.entries(ossz)) console.log(`${a}: ${db}`);
  console.log(`\nKimentve: ${kimenetMappa}/koordinatak.csv, .json, kezi_ellenorzes.csv`);
}

main().catch((hiba) => {
  console.error('Váratlan hiba:', hiba);
  process.exit(1);
});
