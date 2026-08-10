#!/usr/bin/env node
/**
 * koordinata.mjs v2 — Racecourse360 térkép-alapú koordináta-kereső
 *
 * VÁLTOZÁS a v1-hez képest: a POSTACÍMET NEM HASZNÁLJUK.
 * Kizárólag ingyenes TÉRKÉPI forrásból dolgozunk, mert a francia postai
 * formátum (BP xxxx, Cedex, többsoros cím) a geokódolókat félrevezette,
 * és a postacím amúgy is gyakran a klub irodáját adja meg, nem a pályát.
 *
 * FORRÁSOK
 * 1) Nominatim (OSM) — CSAK a TELEPÜLÉST geokódolja (város-szinten megbízható)
 * 2) Overpass API (OSM nyers adatai) — a település körül valódi pálya-
 *    objektumot keres: leisure=track, landuse=racetrack, sport=horse_racing,
 *    illetve "hippodrome" nevű objektumokat.
 *
 * A találatokat a pálya NEVÉVEL párosítjuk (Excel "Név" oszlop).
 *
 * ÁLLAPOTOK
 *   TERKEP_MEGEROSITETT  — OSM-objektum, erős névegyezés → beépíthető
 *   EGYETLEN_JELOLT      — pontosan 1 pálya-objektum a körzetben, de gyenge
 *                          névegyezés → valószínű, de nézd meg
 *   TOBB_JELOLT          — több pálya-objektum, nincs egyértelmű névegyezés
 *   NINCS_OSM_OBJEKTUM   — a térképen nincs jelölve pálya a körzetben
 *   NINCS_TELEPULES      — a települést sem sikerült geokódolni
 *
 * FUTTATÁS
 *   npm install xlsx
 *   node tools/koordinata.mjs
 *   node tools/koordinata.mjs tools/Racecourse_360.xlsx "Franciaország"
 *
 * KIMENET
 *   eredmeny/koordinatak.csv        — minden sor
 *   eredmeny/koordinatak.json       — ugyanaz gépi feldolgozásra
 *   eredmeny/kezi_ellenorzes.csv    — CSAK a kézi ellenőrzést igénylő sorok
 */

import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

// --- Beállítások ---
const KERESESI_SUGAR_M = 10000;      // ekkora körben keresünk a településtől
const NEV_EGYEZES_HATAR = 0.35;      // efelett fogadjuk el automatikusan
const NOMINATIM_VARAKOZAS_MS = 1100;
const OVERPASS_VARAKOZAS_MS = 1600;
const USER_AGENT = 'racecourse360-koordinata-kereso/2.0 (kutatasi celra)';
const OVERPASS_VEGPONT = 'https://overpass-api.de/api/interpreter';
const ALAP_EXCEL = 'tools/Racecourse_360.xlsx';
const ORSZAG_KOD = 'fr';
const ORSZAG_NEV = 'France';
const kimenetMappa = 'eredmeny';

// --- Segédfüggvények ---
function varj(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

// Ezek a szavak szinte minden pályanévben szerepelnek, ezért nem hordoznak
// megkülönböztető információt — kihagyjuk az összevetésből.
const TOLTELEK_SZAVAK = new Set([
  'hippodrome', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd',
  'racecourse', 'raceway', 'champ', 'courses', 'societe', 'saint', 'st',
]);

function kulcsSzavak(s) {
  return new Set(
    nevNormalizalas(s)
      .split(' ')
      .filter((sz) => sz && sz.length > 2 && !TOLTELEK_SZAVAK.has(sz))
  );
}

/** Névhasonlóság a megkülönböztető kulcsszavak alapján (0..1). */
function nevHasonlosag(a, b) {
  const szavakA = kulcsSzavak(a);
  const szavakB = kulcsSzavak(b);
  if (szavakA.size === 0 || szavakB.size === 0) return 0;
  let kozos = 0;
  for (const sz of szavakA) if (szavakB.has(sz)) kozos++;
  return kozos / Math.min(szavakA.size, szavakB.size);
}

// --- 1) Település geokódolása (Nominatim) ---
async function telepulesKoordinata(telepules) {
  try {
    const q = `${telepules}, ${ORSZAG_NEV}`;
    const url =
      `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=${ORSZAG_KOD}`;
    const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!resp.ok) return null;
    const json = await resp.json();
    const t = json?.[0];
    if (!t) return null;
    return { lat: parseFloat(t.lat), lon: parseFloat(t.lon), nev: t.display_name };
  } catch (hiba) {
    return null;
  } finally {
    await varj(NOMINATIM_VARAKOZAS_MS);
  }
}

// --- 2) Pálya-objektumok keresése a térképen (Overpass) ---
async function palyaObjektumok(lat, lon, sugarM = KERESESI_SUGAR_M) {
  try {
    const query = `
      [out:json][timeout:60];
      (
        nwr(around:${sugarM},${lat},${lon})["leisure"="track"]["sport"~"equestrian|horse_racing"];
        nwr(around:${sugarM},${lat},${lon})["landuse"="racetrack"];
        nwr(around:${sugarM},${lat},${lon})["sport"="horse_racing"];
        nwr(around:${sugarM},${lat},${lon})["name"~"hippodrome",i];
      );
      out center tags;
    `.trim();

    const resp = await fetch(OVERPASS_VEGPONT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: 'data=' + encodeURIComponent(query),
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    const elemek = json?.elements || [];

    const talalatok = [];
    const latottak = new Set();
    for (const el of elemek) {
      const elLat = el.lat ?? el.center?.lat;
      const elLon = el.lon ?? el.center?.lon;
      if (elLat == null || elLon == null) continue;
      // Ugyanaz a pálya gyakran több objektumként is szerepel (way + relation),
      // ezért a nagyjából azonos helyen lévő duplikátumokat összevonjuk.
      const kulcs = `${elLat.toFixed(3)},${elLon.toFixed(3)}`;
      if (latottak.has(kulcs)) continue;
      latottak.add(kulcs);
      talalatok.push({
        lat: elLat,
        lon: elLon,
        osmNev: el.tags?.name || null,
        osmTipus: el.type,
        osmId: el.id,
        tavolsagATelepulestol_m: Math.round(tavolsagMeter(lat, lon, elLat, elLon)),
      });
    }
    return talalatok;
  } catch (hiba) {
    return [];
  } finally {
    await varj(OVERPASS_VARAKOZAS_MS);
  }
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
    koord_osm_nev: null,
    koord_osm_tipus: null,
    koord_osm_id: null,
    koord_nevegyezes: null,
    koord_tavolsag_telepulestol_m: null,
    koord_jeloltek_szama: null,
    koord_jeloltek: null,
    koord_megjegyzes: null,
  };

  if (!telepules) {
    e.koord_allapot = 'NINCS_TELEPULES';
    e.koord_megjegyzes = 'Nincs kitöltve a Település oszlop.';
    return e;
  }

  const kozpont = await telepulesKoordinata(telepules);
  if (!kozpont) {
    e.koord_allapot = 'NINCS_TELEPULES';
    e.koord_megjegyzes = `A "${telepules}" települést nem sikerült geokódolni.`;
    return e;
  }

  const jeloltek = await palyaObjektumok(kozpont.lat, kozpont.lon);
  e.koord_jeloltek_szama = jeloltek.length;
  e.koord_jeloltek = jeloltek
    .map((j) => `${j.osmNev || 'névtelen'} (${j.tavolsagATelepulestol_m} m)`)
    .join(' | ');

  if (jeloltek.length === 0) {
    e.koord_allapot = 'NINCS_OSM_OBJEKTUM';
    e.koord_megjegyzes =
      `${KERESESI_SUGAR_M / 1000} km-en belül nincs pálya-objektum a térképen ` +
      `(${telepules}). Kézi keresés kell.`;
    return e;
  }

  // Rangsorolás: névegyezés dominál, döntetlennél a közelebbi nyer.
  let legjobb = null;
  let legjobbPont = -Infinity;
  for (const j of jeloltek) {
    const hasonlosag = nevHasonlosag(nev, j.osmNev);
    const pont = hasonlosag * 1000 - j.tavolsagATelepulestol_m / 1000;
    if (pont > legjobbPont) {
      legjobbPont = pont;
      legjobb = { ...j, nevHasonlosag: hasonlosag };
    }
  }

  e.koord_lat = legjobb.lat;
  e.koord_lon = legjobb.lon;
  e.koord_osm_nev = legjobb.osmNev;
  e.koord_osm_tipus = legjobb.osmTipus;
  e.koord_osm_id = legjobb.osmId;
  e.koord_nevegyezes = Number(legjobb.nevHasonlosag.toFixed(2));
  e.koord_tavolsag_telepulestol_m = legjobb.tavolsagATelepulestol_m;

  if (legjobb.nevHasonlosag >= NEV_EGYEZES_HATAR) {
    e.koord_allapot = 'TERKEP_MEGEROSITETT';
    e.koord_megjegyzes =
      `OSM pálya-objektum, erős névegyezés ("${legjobb.osmNev}"), ` +
      `${legjobb.tavolsagATelepulestol_m} m-re ${telepules} központjától. ` +
      `OSM ${legjobb.osmTipus}/${legjobb.osmId}, ${new Date().toISOString().slice(0, 10)}.`;
  } else if (jeloltek.length === 1) {
    e.koord_allapot = 'EGYETLEN_JELOLT';
    e.koord_megjegyzes =
      `Pontosan 1 pálya-objektum van a körzetben ("${legjobb.osmNev || 'névtelen'}"), ` +
      `de a név nem egyezik erősen. Valószínűleg ez az, de ellenőrizd. ` +
      `OSM ${legjobb.osmTipus}/${legjobb.osmId}.`;
  } else {
    e.koord_allapot = 'TOBB_JELOLT';
    e.koord_megjegyzes =
      `${jeloltek.length} pálya-objektum van a körzetben, egyik neve sem egyezik ` +
      `egyértelműen. Válaszd ki kézzel a "koord_jeloltek" oszlopból.`;
  }

  return e;
}

// --- Munkafüzet beolvasása lemezről vagy URL-ről ---
async function munkafuzetBeolvasas(utvonal) {
  if (/^https?:\/\//i.test(utvonal)) {
    console.log(`Letöltés: ${utvonal}`);
    const resp = await fetch(utvonal, { headers: { 'User-Agent': USER_AGENT } });
    if (!resp.ok) throw new Error(`Nem sikerült letölteni (HTTP ${resp.status})`);
    return XLSX.read(Buffer.from(await resp.arrayBuffer()), { type: 'buffer' });
  }
  if (!fs.existsSync(utvonal)) throw new Error(`A fájl nem található: ${utvonal}`);
  return XLSX.readFile(utvonal);
}

function csvKiiras(sorok, utvonal) {
  if (sorok.length === 0) {
    fs.writeFileSync(utvonal, '', 'utf-8');
    return;
  }
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

// --- Fő program ---
async function main() {
  const bemenetiFajl = process.argv[2] || ALAP_EXCEL;
  const munkalapNev = process.argv[3] || 'Franciaország';

  console.log(`Beolvasás: ${bemenetiFajl} (munkalap: "${munkalapNev}")`);
  const munkafuzet = await munkafuzetBeolvasas(bemenetiFajl);
  const munkalap = munkafuzet.Sheets[munkalapNev];
  if (!munkalap) {
    console.error(`Nincs "${munkalapNev}" munkalap. Elérhető: ${munkafuzet.SheetNames.join(', ')}`);
    process.exit(1);
  }

  const sorok = XLSX.utils.sheet_to_json(munkalap, { defval: null });
  console.log(`${sorok.length} sor beolvasva.\n`);

  const eredmenyek = [];
  let i = 0;
  for (const sor of sorok) {
    i++;
    const cimke = sor['Név'] || sor['Település'] || '(névtelen)';
    process.stdout.write(`[${i}/${sorok.length}] ${cimke} ... `);
    const e = await sorFeldolgozasa(sor);
    eredmenyek.push(e);
    console.log(e.koord_allapot);
  }

  const osszesites = {};
  for (const e of eredmenyek) {
    osszesites[e.koord_allapot] = (osszesites[e.koord_allapot] || 0) + 1;
  }
  console.log('\n--- ÖSSZESÍTÉS ---');
  for (const [a, db] of Object.entries(osszesites)) console.log(`${a}: ${db}`);

  if (!fs.existsSync(kimenetMappa)) fs.mkdirSync(kimenetMappa, { recursive: true });

  fs.writeFileSync(
    path.join(kimenetMappa, 'koordinatak.json'),
    JSON.stringify(eredmenyek, null, 2),
    'utf-8'
  );
  csvKiiras(eredmenyek, path.join(kimenetMappa, 'koordinatak.csv'));

  // Kézi ellenőrzést igénylő sorok külön fájlba
  const kezi = eredmenyek.filter((e) => e.koord_allapot !== 'TERKEP_MEGEROSITETT');
  csvKiiras(kezi, path.join(kimenetMappa, 'kezi_ellenorzes.csv'));

  console.log(`\nKimentve az "${kimenetMappa}" mappába:`);
  console.log('  koordinatak.csv / .json  — minden sor');
  console.log(`  kezi_ellenorzes.csv      — ${kezi.length} sor, ezeket nézd át kézzel`);
  console.log(
    '\nAutomatikusan csak a TERKEP_MEGEROSITETT sorok építhetők be.\n' +
      'Az EGYETLEN_JELOLT sorok nagy eséllyel jók, de emberi szem kell rájuk.'
  );
}

main().catch((hiba) => {
  console.error('Váratlan hiba:', hiba);
  process.exit(1);
});
