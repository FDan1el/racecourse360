#!/usr/bin/env node
/**
 * koordinata.mjs — Racecourse360 cím-alapú koordináta-kereső
 *
 * CÉL: kizárólag geokódol — a már leellenőrzött, konkrét címekből
 * koordinátát keres, több független forrással megerősítve.
 * NEM keres pályát, NEM dönt adatok helyességéről, NEM tippel.
 *
 * FORRÁSOK (3, egymástól független):
 * 1) BAN — Base Adresse Nationale (api-adresse.data.gouv.fr), francia állami
 * 2) Nominatim (OpenStreetMap címkeresője)
 * 3) Overpass API (OSM nyers adatai) — a megerősített cím 1,5 km-es
 *    körzetében tényleges pálya-objektumot keres; ha névileg egyezőt talál,
 *    AZT vesszük fel, mert pontosabb, mint a postacím.
 *
 * Egyezés szabálya: BAN + Nominatim max 1000 m-re lehet egymástól.
 *
 * FUTTATÁS (a repó gyökeréből):
 *   npm install xlsx
 *   node tools/koordinata.mjs
 *     -> alapból tools/Racecourse_360.xlsx, "Franciaország" munkalap
 *   node tools/koordinata.mjs tools/Racecourse_360.xlsx "Franciaország"
 *   node tools/koordinata.mjs https://raw.githubusercontent.com/FDan1el/racecourse360/main/tools/Racecourse_360.xlsx
 *
 * KIMENET: eredmeny/koordinatak.csv és eredmeny/koordinatak.json
 *
 * SEBESSÉG: szándékosan lassú (Nominatim 1,1 mp, Overpass 1,6 mp várakozás).
 * Ne állítsd feljebb — a Nominatim letilthatja az IP-t visszaélésnél.
 */

import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

// --- Beállítások ---
const TAVOLSAG_HATAR_M = 1000;
const OVERPASS_KERESESI_SUGAR_M = 1500;
const NOMINATIM_VARAKOZAS_MS = 1100;
const BAN_VARAKOZAS_MS = 300;
const OVERPASS_VARAKOZAS_MS = 1600;
const USER_AGENT = 'racecourse360-koordinata-kereso/1.0 (kutatasi celra)';
const OVERPASS_VEGPONT = 'https://overpass-api.de/api/interpreter';
const ALAP_EXCEL = 'tools/Racecourse_360.xlsx';
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

function cimTisztitas(nyersCim) {
  if (!nyersCim) return '';
  return String(nyersCim).replace(/\r?\n/g, ', ').replace(/\s+/g, ' ').trim();
}

function nevNormalizalas(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function nevHasonlosag(a, b) {
  const szavakA = new Set(nevNormalizalas(a).split(' ').filter(Boolean));
  const szavakB = new Set(nevNormalizalas(b).split(' ').filter(Boolean));
  if (szavakA.size === 0 || szavakB.size === 0) return 0;
  let kozos = 0;
  for (const sz of szavakA) if (szavakB.has(sz)) kozos++;
  return kozos / Math.max(szavakA.size, szavakB.size);
}

// --- Forrás 1: BAN ---
async function keresesBAN(cim) {
  try {
    const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(cim)}&limit=1`;
    const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!resp.ok) return null;
    const json = await resp.json();
    const talalat = json?.features?.[0];
    if (!talalat) return null;
    const [lon, lat] = talalat.geometry.coordinates;
    return { forras: 'BAN', lat, lon, cimszoveg: talalat.properties?.label ?? null };
  } catch (hiba) {
    return null;
  } finally {
    await varj(BAN_VARAKOZAS_MS);
  }
}

// --- Forrás 2: Nominatim ---
async function keresesNominatim(cim, orszagKod = 'fr') {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(cim)}&format=json&limit=1` +
      (orszagKod ? `&countrycodes=${orszagKod}` : '');
    const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!resp.ok) return null;
    const json = await resp.json();
    const talalat = json?.[0];
    if (!talalat) return null;
    return {
      forras: 'Nominatim',
      lat: parseFloat(talalat.lat),
      lon: parseFloat(talalat.lon),
      cimszoveg: talalat.display_name ?? null,
    };
  } catch (hiba) {
    return null;
  } finally {
    await varj(NOMINATIM_VARAKOZAS_MS);
  }
}

// --- Forrás 3: Overpass (OSM pálya-objektum a cím közelében) ---
async function keresesOverpassKozelben(lat, lon, nev, sugarM = OVERPASS_KERESESI_SUGAR_M) {
  try {
    const query = `
      [out:json][timeout:25];
      (
        nwr(around:${sugarM},${lat},${lon})["leisure"="track"]["sport"~"equestrian|horse_racing"];
        nwr(around:${sugarM},${lat},${lon})["landuse"="racetrack"];
        nwr(around:${sugarM},${lat},${lon})["sport"="horse_racing"];
        nwr(around:${sugarM},${lat},${lon})["name"~"hippodrome|trot",i];
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
    if (!resp.ok) return null;
    const json = await resp.json();
    const elemek = json?.elements || [];
    if (elemek.length === 0) return null;

    let legjobb = null;
    let legjobbPontszam = -1;
    for (const el of elemek) {
      const elLat = el.lat ?? el.center?.lat;
      const elLon = el.lon ?? el.center?.lon;
      if (elLat == null || elLon == null) continue;
      const elNev = el.tags?.name || '';
      const hasonlosag = nevHasonlosag(nev, elNev);
      const tav = tavolsagMeter(lat, lon, elLat, elLon);
      const pontszam = hasonlosag * 1000 - tav / 1000;
      if (pontszam > legjobbPontszam) {
        legjobbPontszam = pontszam;
        legjobb = {
          forras: 'Overpass',
          lat: elLat,
          lon: elLon,
          osmNev: elNev || null,
          osmTipus: el.type,
          osmId: el.id,
          nevHasonlosag: hasonlosag,
          tavolsagACimtol_m: Math.round(tav),
        };
      }
    }
    return legjobb;
  } catch (hiba) {
    return null;
  } finally {
    await varj(OVERPASS_VARAKOZAS_MS);
  }
}

// --- Egy sor feldolgozása ---
async function sorFeldolgozasa(sor) {
  const nev = sor['Név'] ?? '';
  const cim = cimTisztitas(sor['Cím']);

  const eredmenySor = {
    ...sor,
    koord_allapot: null,
    koord_lat: null,
    koord_lon: null,
    koord_tavolsag_m: null,
    koord_ban_lat: null,
    koord_ban_lon: null,
    koord_nominatim_lat: null,
    koord_nominatim_lon: null,
    koord_overpass_lat: null,
    koord_overpass_lon: null,
    koord_overpass_osm_nev: null,
    koord_megjegyzes: null,
  };

  if (!cim) {
    eredmenySor.koord_allapot = 'NINCS_CIM';
    eredmenySor.koord_megjegyzes = 'Nincs kitöltve a Cím oszlop — kézzel ellenőrizendő.';
    return eredmenySor;
  }

  const [ban, nominatim] = await Promise.all([
    keresesBAN(cim),
    keresesNominatim(`${cim}, France`, 'fr'),
  ]);

  if (ban) {
    eredmenySor.koord_ban_lat = ban.lat;
    eredmenySor.koord_ban_lon = ban.lon;
  }
  if (nominatim) {
    eredmenySor.koord_nominatim_lat = nominatim.lat;
    eredmenySor.koord_nominatim_lon = nominatim.lon;
  }

  if (ban && nominatim) {
    const d = tavolsagMeter(ban.lat, ban.lon, nominatim.lat, nominatim.lon);
    eredmenySor.koord_tavolsag_m = Math.round(d);

    if (d <= TAVOLSAG_HATAR_M) {
      eredmenySor.koord_lat = ban.lat;
      eredmenySor.koord_lon = ban.lon;
      eredmenySor.koord_allapot = 'MEGEROSITETT';
      eredmenySor.koord_megjegyzes =
        `2 forrás egyezik (${Math.round(d)} m eltérés). ` +
        `Forrás: BAN + Nominatim, ${new Date().toISOString().slice(0, 10)}.`;

      const overpass = await keresesOverpassKozelben(ban.lat, ban.lon, nev);
      if (overpass) {
        eredmenySor.koord_overpass_lat = overpass.lat;
        eredmenySor.koord_overpass_lon = overpass.lon;
        eredmenySor.koord_overpass_osm_nev = overpass.osmNev;
      }

      if (overpass && overpass.nevHasonlosag >= 0.3) {
        eredmenySor.koord_lat = overpass.lat;
        eredmenySor.koord_lon = overpass.lon;
        eredmenySor.koord_allapot = 'MEGEROSITETT_OSM_PONTOSITVA';
        eredmenySor.koord_megjegyzes =
          `BAN+Nominatim egyezik (${Math.round(d)} m), ÉS az Overpass talált ` +
          `OSM-objektumot ("${overpass.osmNev || 'névtelen'}", ` +
          `${overpass.tavolsagACimtol_m} m-re a címtől) — ezt a pontosabb helyet vettük fel.`;
      } else {
        eredmenySor.koord_megjegyzes +=
          ' Overpass: nem talált egyértelműen egyező OSM pálya-objektumot, a cím-koordináta maradt.';
      }
    } else {
      eredmenySor.koord_allapot = 'ELLENORIZENDO_ELTERES';
      eredmenySor.koord_megjegyzes =
        `A 2 forrás ${Math.round(d)} méterre van egymástól ` +
        `(határ: ${TAVOLSAG_HATAR_M} m) — kézi ellenőrzés kell.`;
    }
  } else if (ban || nominatim) {
    const egyetlen = ban || nominatim;
    eredmenySor.koord_allapot = 'CSAK_1_FORRAS';
    eredmenySor.koord_megjegyzes =
      `Csak a(z) ${egyetlen.forras} adott találatot — ez önmagában NEM elég, második forrás kell.`;
  } else {
    eredmenySor.koord_allapot = 'NINCS_TALALAT';
    eredmenySor.koord_megjegyzes =
      'Egyik forrás sem talált semmit — ellenőrizd a cím helyességét, vagy keress kézzel.';
  }

  return eredmenySor;
}

// --- Munkafüzet beolvasása lemezről vagy URL-ről ---
async function munkafuzetBeolvasas(utvonal) {
  if (/^https?:\/\//i.test(utvonal)) {
    console.log(`Letöltés: ${utvonal}`);
    const resp = await fetch(utvonal, { headers: { 'User-Agent': USER_AGENT } });
    if (!resp.ok) throw new Error(`Nem sikerült letölteni (HTTP ${resp.status}): ${utvonal}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    return XLSX.read(buf, { type: 'buffer' });
  }
  if (!fs.existsSync(utvonal)) throw new Error(`A fájl nem található: ${utvonal}`);
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
    console.error(
      `Nincs "${munkalapNev}" nevű munkalap. Elérhető: ${munkafuzet.SheetNames.join(', ')}`
    );
    process.exit(1);
  }

  const sorok = XLSX.utils.sheet_to_json(munkalap, { defval: null });
  console.log(`${sorok.length} sor beolvasva.\n`);

  const eredmenyek = [];
  let feldolgozva = 0;

  for (const sor of sorok) {
    feldolgozva++;
    const nev = sor['Név'] || sor['Település'] || '(névtelen sor)';
    process.stdout.write(`[${feldolgozva}/${sorok.length}] ${nev} ... `);
    const eredmeny = await sorFeldolgozasa(sor);
    eredmenyek.push(eredmeny);
    console.log(eredmeny.koord_allapot);
  }

  const osszesites = {};
  for (const e of eredmenyek) {
    osszesites[e.koord_allapot] = (osszesites[e.koord_allapot] || 0) + 1;
  }
  console.log('\n--- ÖSSZESÍTÉS ---');
  for (const [allapot, darab] of Object.entries(osszesites)) {
    console.log(`${allapot}: ${darab}`);
  }

  if (!fs.existsSync(kimenetMappa)) fs.mkdirSync(kimenetMappa, { recursive: true });

  const jsonUtvonal = path.join(kimenetMappa, 'koordinatak.json');
  fs.writeFileSync(jsonUtvonal, JSON.stringify(eredmenyek, null, 2), 'utf-8');

  const oszlopok = Object.keys(eredmenyek[0] || {});
  const csvSorok = [oszlopok.join(';')];
  for (const e of eredmenyek) {
    csvSorok.push(
      oszlopok
        .map((o) => {
          const sztring = String(e[o] ?? '').replace(/\r?\n/g, ' ');
          return `"${sztring.replace(/"/g, '""')}"`;
        })
        .join(';')
    );
  }
  const csvUtvonal = path.join(kimenetMappa, 'koordinatak.csv');
  fs.writeFileSync(csvUtvonal, csvSorok.join('\n'), 'utf-8');

  console.log(`\nKimentve:\n  ${jsonUtvonal}\n  ${csvUtvonal}`);
  console.log(
    '\nCsak a MEGEROSITETT és MEGEROSITETT_OSM_PONTOSITVA sorokat építsd be\n' +
      'automatikusan az app.js-be. A többi kézi ellenőrzést igényel.'
  );
}

main().catch((hiba) => {
  console.error('Váratlan hiba:', hiba);
  process.exit(1);
});
