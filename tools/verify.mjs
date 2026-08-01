#!/usr/bin/env node
/**
 * ============================================================
 *  RACECOURSE360 – automatikus adatellenőrző
 * ============================================================
 *
 *  MIT CSINÁL:
 *    1) Kiolvassa a pályákat az app.js trackDatabase-éből
 *    2) Minden URL-t leellenőriz (létezik-e, hova irányít át)
 *    3) Wikidata-ból lekéri: alapítás éve, hivatalos honlap, koordináta
 *    4) Wikipédia-cikket keres hozzá (sv/fi/it/de/... + en)
 *    5) Összeveti a saját adatunkkal és jelenti az ELTÉRÉSEKET
 *
 *  MIT NEM CSINÁL:
 *    - SOHA nem írja át az app.js-t. Csak jelentést készít.
 *    - Nem "találja ki" a hiányzó adatot. Ami nincs, az null marad.
 *
 *  HASZNÁLAT:
 *    node verify.mjs                 → minden ország
 *    node verify.mjs SWE             → csak Svédország
 *    node verify.mjs SWE FIN ITA     → több ország
 *    node verify.mjs --links-only    → csak linkellenőrzés (gyors)
 *    node verify.mjs --coords CHE    → KOORDINÁTA-MÓD (lásd lent)
 *
 *  KOORDINÁTA-MÓD (--coords):
 *    Az adatbázis bővítésének a koordináta a szűk keresztmetszete.
 *    Ez a mód három független forrásból gyűjt (szövetségi adatlap,
 *    Wikidata, OpenStreetMap), majd ÖSSZEVETI őket. Csak akkor
 *    javasol értéket, ha legalább kettő egyetért 1 km-en belül.
 *    Ha eltérnek, nem választ – jelzi, hogy emberi döntés kell.
 *    Azt is megmondja, ha a MEGLÉVŐ koordinátánk gyanús.
 *
 *  KIMENET (a ./eredmeny/ mappába):
 *    - eltéresek.csv     → Excelben megnyitható, ezt kell átnézni
 *    - koordinatak.csv   → koordináta-módban ez készül
 *    - reszletes.json    → minden nyers találat, gépi feldolgozáshoz
 *    - osszefoglalo.txt  → rövid statisztika
 *
 *  KÖVETELMÉNY: Node.js 18 vagy újabb (a beépített fetch miatt)
 * ============================================================
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

// ---------- BEÁLLÍTÁSOK ----------

/**
 * Megkeresi a fájlt a szokásos helyeken.
 * Így a szkript működik akkor is, ha a repo gyökerében van, és akkor is,
 * ha a tools/ almappában – a GitHub Actions a gyökérből indítja.
 * Környezeti változóval mindig felülírható.
 */
function keresFajl(fajlNev, kornyezetiValtozo) {
  const kv = process.env[kornyezetiValtozo];
  if (kv) return kv;
  for (const j of [`./${fajlNev}`, `../${fajlNev}`, `../../${fajlNev}`]) {
    if (existsSync(j)) return j;
  }
  return `./${fajlNev}`;
}

const CONFIG = {
  appJsPath: keresFajl('app.js', 'APPJS_PATH'),
  outDir: process.env.OUT_DIR || './eredmeny',
  // Az ÚJ, még fel nem vett pályák jelöltlistája (--new / --only-new)
  ujPalyakPath: keresFajl('uj_palyak.json', 'UJ_PALYAK_PATH'),
  // Udvariassági várakozás kérések között (ms). Ne vidd 200 alá.
  delayMs: 350,
  // Hány másodperc után adjuk fel egy oldal betöltését
  timeoutMs: 12000,
  // A Wikidata és Wikipédia elvárja, hogy azonosítsuk magunkat
  userAgent: 'Racecourse360-DataCheck/1.0 (https://racecourses360.com; kapcsolat: info@racecourses360.com)',
};

// Melyik nyelvű Wikipédiában/Wikidatában keressük az adott ország pályáit.
// A gép először a helyi nyelven keres, mert ott van a legtöbb adat.
const ORSZAG_NYELV = {
  SWE: ['sv'], FIN: ['fi'], NOR: ['no', 'nb'], DNK: ['da'], DEU: ['de'],
  AUT: ['de'], CHE: ['de', 'fr'], ITA: ['it'], FRA: ['fr'], ESP: ['es', 'ca'],
  NLD: ['nl'], BEL: ['nl', 'fr'], POL: ['pl'], CZE: ['cs'], SVK: ['sk'],
  HUN: ['hu'], SVN: ['sl'], SRB: ['sr'], EST: ['et'], LTU: ['lt'],
  USA: ['en'], CAN: ['en', 'fr'], AUS: ['en'], NZL: ['en'], GBR: ['en'],
  IRL: ['en'], MLT: ['en', 'mt'],
};

// Wikidata tulajdonság-azonosítók (ezek stabilak, nem változnak)
const WD = {
  alapitas: 'P571',      // inception – alapítás időpontja
  honlap: 'P856',        // official website
  koordinata: 'P625',    // coordinate location
  orszag: 'P17',         // country
  telepules: 'P131',     // located in administrative entity
  megszunt: 'P576',      // dissolved/abolished – ha ez ki van töltve, a pálya BEZÁRT
};

// ---------- SEGÉDFÜGGVÉNYEK ----------
const varj = (ms) => new Promise((r) => setTimeout(r, ms));

async function keres(url, opts = {}) {
  const vezerlo = new AbortController();
  const ido = setTimeout(() => vezerlo.abort(), CONFIG.timeoutMs);
  try {
    const valasz = await fetch(url, {
      ...opts,
      signal: vezerlo.signal,
      headers: { 'User-Agent': CONFIG.userAgent, ...(opts.headers || {}) },
    });
    return valasz;
  } finally {
    clearTimeout(ido);
  }
}

async function jsonKeres(url) {
  const v = await keres(url);
  if (!v.ok) throw new Error(`HTTP ${v.status}`);
  return v.json();
}

// ---------- 1. LÉPÉS: adatbázis beolvasása ----------
async function beolvasAdatbazis() {
  let kod;
  try {
    kod = await fs.readFile(CONFIG.appJsPath, 'utf8');
  } catch (e) {
    // Beszédes hibaüzenet: megmutatjuk, hol keresgéltünk és mi van itt
    let tartalom = '(nem olvasható)';
    try {
      const lista = await fs.readdir('.');
      tartalom = lista.filter((f) => !f.startsWith('.')).join(', ') || '(üres)';
    } catch { /* nem baj */ }
    throw new Error(
      `Nem találom az app.js-t.\n`
      + `  Keresett útvonal:   ${CONFIG.appJsPath}\n`
      + `  Aktuális könyvtár:  ${process.cwd()}\n`
      + `  Itt ezek vannak:    ${tartalom}\n\n`
      + `  MEGOLDÁS: az app.js-nek a repo gyökerében kell lennie,\n`
      + `  a verify.mjs-nek pedig a tools/ mappában.\n`
      + `  Vagy add meg kézzel:  APPJS_PATH=eleresi/ut/app.js node tools/verify.mjs ...`
    );
  }
  const kezdet = kod.indexOf('const trackDatabase');
  const veg = kod.indexOf('const countryMeta');
  if (kezdet < 0 || veg < 0) {
    throw new Error('Nem találom a trackDatabase-t vagy a countryMeta-t az app.js-ben.');
  }
  const reszlet = kod.slice(kezdet, veg).replace('const trackDatabase =', 'return ');
  // eslint-disable-next-line no-new-func
  const db = new Function(reszlet)();
  return db;
}

// ---------- 2. LÉPÉS: linkellenőrzés ----------

/**
 * Megnézi, hogy ebben a környezetben egyáltalán lehet-e tetszőleges oldalt lekérni.
 *
 * MIÉRT KELL EZ: a StackBlitz / Replit / böngészőalapú környezetek nem engednek
 * tetszőleges külső oldalt lekérni (CORS-korlátozás). Ott MINDEN link "halottnak"
 * látszana, ami hamis riasztásokhoz vezetne. Inkább kihagyjuk, mint hogy rosszul jelezzünk.
 */
async function kornyezetTeszt() {
  const tesztCimek = [
    'https://www.travsport.se/',
    'https://example.com/',
  ];
  for (const cim of tesztCimek) {
    try {
      const v = await keres(cim, { method: 'GET', redirect: 'follow' });
      if (v.ok || v.status < 500) return { mukodik: true };
    } catch { /* próbáljuk a következőt */ }
  }
  return { mukodik: false };
}

async function linkEllenorzes(url) {
  if (!url) return { statusz: 'nincs-url' };
  try {
    // Először HEAD-del próbálkozunk (gyorsabb), ha nem megy, GET
    let v;
    try {
      v = await keres(url, { method: 'HEAD', redirect: 'follow' });
      if (v.status === 405 || v.status === 501) throw new Error('HEAD nem támogatott');
    } catch {
      v = await keres(url, { method: 'GET', redirect: 'follow' });
    }

    const vegsoUrl = v.url;
    const atiranyitott = new URL(vegsoUrl).hostname !== new URL(url).hostname;

    return {
      statusz: v.ok ? 'el' : 'hiba',
      httpKod: v.status,
      vegsoUrl,
      atiranyitott,
      // Ez a leggyanúsabb eset: a domain már valaki másé (parkolt / eladó / más cég)
      gyanus: atiranyitott && !new URL(vegsoUrl).hostname.includes(
        new URL(url).hostname.replace(/^www\./, '').split('.')[0]
      ),
    };
  } catch (hiba) {
    const uzenet = String(hiba.message || hiba);
    return {
      statusz: 'halott',
      hibaUzenet: uzenet,
      // DNS-hiba = a domain NEM LÉTEZIK. Ez a legerősebb jel, hogy kitalált cím.
      domainNemLetezik: /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(uzenet),
    };
  }
}

// ---------- 3. LÉPÉS: Wikidata ----------
async function wikidataKereses(nev, nyelvek) {
  const talalatok = [];
  for (const nyelv of nyelvek) {
    const url = 'https://www.wikidata.org/w/api.php?action=wbsearchentities'
      + `&search=${encodeURIComponent(nev)}&language=${nyelv}&uselang=${nyelv}`
      + '&limit=5&format=json&origin=*';
    try {
      const adat = await jsonKeres(url);
      for (const t of adat.search || []) {
        if (!talalatok.find((x) => x.id === t.id)) {
          talalatok.push({ id: t.id, cimke: t.label, leiras: t.description || '' });
        }
      }
    } catch { /* nyelvenként elnézzük a hibát */ }
    await varj(CONFIG.delayMs);
  }
  return talalatok;
}

async function wikidataEntitas(qid) {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
  const adat = await jsonKeres(url);
  const e = adat.entities[qid];
  const allitas = (p) => e.claims?.[p]?.[0]?.mainsnak?.datavalue?.value;

  const alapitasNyers = allitas(WD.alapitas);
  const ev = alapitasNyers?.time
    ? parseInt(String(alapitasNyers.time).replace(/^[+-]/, '').slice(0, 4), 10)
    : null;

  const koord = allitas(WD.koordinata);

  return {
    qid,
    cimke: e.labels?.hu?.value || e.labels?.en?.value || null,
    leiras: e.descriptions?.hu?.value || e.descriptions?.en?.value || null,
    alapitasEve: ev,
    honlap: allitas(WD.honlap) || null,
    lat: koord?.latitude ?? null,
    lng: koord?.longitude ?? null,
    // Ha van "megszűnt" dátuma, akkor a pálya NEM aktív!
    megszunt: e.claims?.[WD.megszunt] ? true : false,
    wikipediaCikkek: Object.keys(e.sitelinks || {})
      .filter((k) => k.endsWith('wiki'))
      .map((k) => k.replace('wiki', '')),
  };
}

// ---------- 4. LÉPÉS: összevetés ----------
function osszevet(sajat, wd, linkAllapot) {
  const elteresek = [];

  // -- alapítási év --
  if (wd?.alapitasEve && sajat.founded && wd.alapitasEve !== sajat.founded) {
    elteresek.push({
      mezo: 'founded',
      sulyossag: 'ELTÉRÉS',
      sajatErtek: sajat.founded,
      kulsoErtek: wd.alapitasEve,
      forras: `Wikidata ${wd.qid}`,
      teendo: 'Emberi döntés kell: melyik a helyes? (Gyakori csapda: az EGYESÜLET alapítása vs. a PÁLYA megnyitása két külön évszám!)',
    });
  }
  if (!sajat.founded && wd?.alapitasEve) {
    elteresek.push({
      mezo: 'founded',
      sulyossag: 'PÓTOLHATÓ',
      sajatErtek: null,
      kulsoErtek: wd.alapitasEve,
      forras: `Wikidata ${wd.qid}`,
      teendo: 'Hiányzó adat, a Wikidata tud egyet. Kell mellé 2. forrás is a felvétel előtt.',
    });
  }

  // -- hivatalos honlap --
  if (wd?.honlap && sajat.ownSite) {
    const a = wd.honlap.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    const b = sajat.ownSite.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    if (a !== b) {
      elteresek.push({
        mezo: 'ownSite',
        sulyossag: 'ELTÉRÉS',
        sajatErtek: sajat.ownSite,
        kulsoErtek: wd.honlap,
        forras: `Wikidata ${wd.qid}`,
        teendo: 'Két különböző hivatalos cím. Melyik él? Lásd a linkellenőrzés oszlopot.',
      });
    }
  }
  if (!sajat.ownSite && wd?.honlap) {
    elteresek.push({
      mezo: 'ownSite',
      sulyossag: 'PÓTOLHATÓ',
      sajatErtek: null,
      kulsoErtek: wd.honlap,
      forras: `Wikidata ${wd.qid}`,
      teendo: 'Nálunk null, a Wikidata ad honlapot. Ellenőrizni, hogy tényleg a pályáé-e.',
    });
  }

  // -- koordináta --
  if (wd?.lat != null && sajat.lat != null) {
    const tavKm = tavolsag(sajat.lat, sajat.lng, wd.lat, wd.lng);
    if (tavKm > 2) {
      elteresek.push({
        mezo: 'lat/lng',
        sulyossag: tavKm > 25 ? 'SÚLYOS ELTÉRÉS' : 'ELTÉRÉS',
        sajatErtek: `${sajat.lat}, ${sajat.lng}`,
        kulsoErtek: `${wd.lat}, ${wd.lng}`,
        forras: `Wikidata ${wd.qid}`,
        teendo: `${tavKm.toFixed(1)} km eltérés. 25 km felett szinte biztos, hogy rossz helyre mutat a térképünk VAGY rossz entitáshoz párosítottunk.`,
      });
    }
  }

  // -- BEZÁRT-e a pálya? --
  if (wd?.megszunt && sajat.status === 'active') {
    elteresek.push({
      mezo: 'status',
      sulyossag: 'SÚLYOS ELTÉRÉS',
      sajatErtek: 'active',
      kulsoErtek: 'megszűnt (P576 kitöltve)',
      forras: `Wikidata ${wd.qid}`,
      teendo: 'A Wikidata szerint ez a pálya MÁR NEM MŰKÖDIK, nálunk aktívként szerepel. Sürgős ellenőrzés!',
    });
  }

  // -- linkellenőrzés eredménye --
  if (linkAllapot?.domainNemLetezik) {
    elteresek.push({
      mezo: 'ownSite',
      sulyossag: 'SÚLYOS ELTÉRÉS',
      sajatErtek: sajat.ownSite,
      kulsoErtek: 'a domain nem létezik (DNS-hiba)',
      forras: 'közvetlen HTTP-ellenőrzés',
      teendo: 'Ez a cím KITALÁLT vagy elavult. Törlendő vagy javítandó.',
    });
  } else if (linkAllapot?.gyanus) {
    elteresek.push({
      mezo: 'ownSite',
      sulyossag: 'ELTÉRÉS',
      sajatErtek: sajat.ownSite,
      kulsoErtek: `átirányít ide: ${linkAllapot.vegsoUrl}`,
      forras: 'közvetlen HTTP-ellenőrzés',
      teendo: 'Idegen domainre irányít át — lehet, hogy a domain lejárt és más vette meg.',
    });
  } else if (linkAllapot?.statusz === 'hiba') {
    elteresek.push({
      mezo: 'ownSite',
      sulyossag: 'ELTÉRÉS',
      sajatErtek: sajat.ownSite,
      kulsoErtek: `HTTP ${linkAllapot.httpKod}`,
      forras: 'közvetlen HTTP-ellenőrzés',
      teendo: 'A cím nem tölt be rendesen.',
    });
  }

  return elteresek;
}

// Két koordináta közti távolság km-ben (Haversine)
function tavolsag(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180)
    * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// A legjobb Wikidata-találat kiválasztása.
// Óvatosak vagyunk: ha nem elég egyértelmű, inkább NEM párosítunk.
function legjobbTalalat(talalatok, palyaNev) {
  const kulcsszavak = /(racecourse|racetrack|raceway|hippodrome|ippodromo|travbana|ravirata|trabrennbahn|hipodrom|raviradat|harness|horse|lóver|ügető|trav|paceway)/i;
  const relevans = talalatok.filter(
    (t) => kulcsszavak.test(t.leiras) || kulcsszavak.test(t.cimke)
  );
  if (relevans.length === 0) return null;
  // Pontos névegyezés előnyt élvez
  const pontos = relevans.find(
    (t) => t.cimke.toLowerCase() === palyaNev.toLowerCase()
  );
  return pontos || relevans[0];
}

/* ============================================================
   KOORDINÁTA-MODUL
   ============================================================

   MIÉRT KELL: az adatbázis bővítésének a koordináta a szűk
   keresztmetszete. Pályanevet, címet, honlapot sok forrás ad,
   de lat/lng-t alig — és azt SOHA nem szabad találgatni, mert
   egy rossz koordináta rosszabb, mint egy hiányzó.

   HOGYAN MŰKÖDIK: több független forrásból próbál koordinátát
   szerezni, majd ÖSSZEVETI őket. Csak akkor javasol értéket,
   ha legalább két forrás 1 km-en belül egyetért. Ha eltérnek,
   NEM VÁLASZT — jelzi, hogy emberi döntés kell.

   AMIT SOSEM CSINÁL:
   - nem ír az app.js-be
   - nem választ egyetlen, meg nem erősített forrás alapján
   - nem "kerekít" település-koordinátára, ha a pálya nincs meg
     (a településközpont NEM a pálya helye!)
   ============================================================ */

// Mekkora eltérésig tekintünk két koordinátát azonosnak (km)
const KOORD_EGYEZES_KM = 1.0;
// E fölött már gyanús, hogy más objektumot találtunk (km)
const KOORD_GYANUS_KM = 5.0;

/**
 * 4. FORRÁS – pontos cím / irányítószám alapú geokódolás
 *
 * Ez a legerősebb forrás ÚJ pályáknál, mert a szövetségek gyakran
 * pontos postai címet adnak, még ha koordinátát nem is:
 *   - a BHRC mind a 20 brit pályához irányítószámot ad (pl. LL22 9NW)
 *   - a Suomen Hippos mind a 25 finn nyári pályához utcacímet
 *   - a Suisse Trot mind a 8 svájci pályához címet
 *
 * Strukturált lekérdezést használunk (külön mezők), nem szabad szöveget –
 * így sokkal pontosabb. Irányítószám esetén az különösen erős.
 */
async function koordCimAlapjan(palya) {
  const cim = palya.address || palya.cim;
  const irsz = palya.postalCode || palya.irsz;
  if (!cim && !irsz) return null;

  const p = new URLSearchParams({ format: 'json', limit: '3', addressdetails: '1' });
  if (irsz) p.set('postalcode', irsz);
  if (cim) p.set('street', cim);
  if (palya.city) p.set('city', String(palya.city).replace(/\s*\(.*?\)\s*/g, '').trim());
  if (palya.countryCode2) p.set('countrycodes', palya.countryCode2);

  try {
    const adat = await jsonKeres(`https://nominatim.openstreetmap.org/search?${p}`);
    if (!Array.isArray(adat) || adat.length === 0) return null;
    const t = adat[0];

    // Irányítószám önmagában egy KÖRZETET jelöl, nem pontot – ezt jelezzük.
    // Utcacímmel együtt viszont pontos.
    const csakIrsz = irsz && !cim;
    return {
      forras: csakIrsz ? 'Nominatim (irányítószám)' : 'Nominatim (postai cím)',
      lat: parseFloat(t.lat),
      lng: parseFloat(t.lon),
      megbizhatosag: csakIrsz ? 'közepes' : 'magas',
      megjegyzes: csakIrsz
        ? `FIGYELEM: csak irányítószám alapján – a körzet közepét adja, nem feltétlenül a pálya pontos helyét. ${t.display_name?.slice(0, 70) || ''}`
        : (t.display_name?.slice(0, 90) || null),
    };
  } catch {
    return null;
  }
}

/**
 * 1. FORRÁS – Wikidata (P625 koordináta)
 * Univerzális, géppel olvasható, forrásmegjelöléssel.
 */
async function koordWikidata(palya, nyelvek) {
  const talalatok = await wikidataKereses(palya.name, nyelvek);
  const valasztott = legjobbTalalat(talalatok, palya.name);
  if (!valasztott) return null;
  try {
    const e = await wikidataEntitas(valasztott.id);
    if (e.lat == null) return null;
    return {
      forras: `Wikidata ${e.qid}`,
      lat: e.lat,
      lng: e.lng,
      megbizhatosag: 'magas',
      megjegyzes: e.cimke || null,
    };
  } catch {
    return null;
  }
}

/**
 * 2. FORRÁS – OpenStreetMap / Nominatim
 *
 * FONTOS: a Nominatim használati feltételei max. 1 kérés/másodperc,
 * és kötelező az azonosítható User-Agent. A CONFIG.delayMs ezt
 * betartja. Kereskedelmi tömeges használathoz saját példány kell.
 *
 * Elsődlegesen a PÁLYÁT keressük (leisure=track, sport=horse_racing),
 * NEM a települést. Ha csak a település jön vissza, azt eldobjuk.
 */
async function koordOSM(palya) {
  const q = encodeURIComponent(`${palya.name}, ${palya.city || ''}`);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=5&addressdetails=1&extratags=1`;
  try {
    const adat = await jsonKeres(url);
    if (!Array.isArray(adat) || adat.length === 0) return null;

    // Csak olyan találat érdekel, ami tényleg versenypálya-szerű objektum.
    // A "city"/"town"/"village" típusú találat a TELEPÜLÉS, nem a pálya → eldobjuk.
    const jo = adat.find((t) => {
      const oszt = `${t.class}/${t.type}`.toLowerCase();
      const nev = (t.display_name || '').toLowerCase();
      const telepulesTipus = /place\/(city|town|village|hamlet|suburb|municipality)/.test(oszt);
      if (telepulesTipus) return false;
      return /leisure|sport|racetrack|raceway|horse/.test(oszt)
        || /racecourse|racetrack|raceway|hippodrom|ippodromo|travbana|ravirata|trabrennbahn|rennbahn|hipodrom|paceway/.test(nev);
    });
    if (!jo) return null;

    return {
      forras: 'OpenStreetMap (Nominatim)',
      lat: parseFloat(jo.lat),
      lng: parseFloat(jo.lon),
      megbizhatosag: 'közepes',
      megjegyzes: jo.display_name?.slice(0, 90) || null,
    };
  } catch {
    return null;
  }
}

/**
 * 3. FORRÁS – szövetségi oldalak beágyazott térképlinkjei
 *
 * Sok nemzeti szövetség "útvonaltervezés" linket tesz a pálya
 * adatlapjára, és abban ott a koordináta. Pl. a horseracing.ch
 * GoogleMap-linkje: ...&x_kord=47.3917&y_kord=8.0282
 *
 * Ez a leggyorsabb és legpontosabb forrás, mert MAGA A SZÖVETSÉG
 * adta meg — de oldalanként külön mintát kell hozzá írni.
 * Új ország felvételekor ide kell új mintát tenni.
 */
const OLDAL_MINTAK = [
  {
    nev: 'horseracing.ch (Suisse Trot / Galopp Schweiz)',
    orszagok: ['CHE'],
    // a pálya adatlapjának URL-je a pálya nevéből/városából
    url: (p) => {
      const kulcs = (p.city || p.name).toLowerCase()
        .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z]/g, '');
      return `https://www.horseracing.ch/rennen-ch/rennbahnen/${kulcs}/`;
    },
    // koordináta kinyerése a HTML-ből
    minta: /x_kord=(-?\d+\.\d+)&y_kord=(-?\d+\.\d+)/,
  },
  // ÚJ MINTÁK IDE. Példa a szerkezetre:
  // {
  //   nev: 'valamely-szovetseg.xx',
  //   orszagok: ['XXX'],
  //   url: (p) => `https://...`,
  //   minta: /lat[=:"\s]+(-?\d+\.\d+)[,&\s"]+lng[=:"\s]+(-?\d+\.\d+)/,
  // },
];

async function koordOldalMinta(palya, orszagKod) {
  for (const m of OLDAL_MINTAK) {
    if (!m.orszagok.includes(orszagKod)) continue;
    try {
      const url = m.url(palya);
      const v = await keres(url, { method: 'GET' });
      if (!v.ok) continue;
      const html = await v.text();
      const t = html.match(m.minta);
      if (!t) continue;
      return {
        forras: m.nev,
        lat: parseFloat(t[1]),
        lng: parseFloat(t[2]),
        megbizhatosag: 'magas',
        megjegyzes: `szövetségi adatlap: ${url}`,
      };
    } catch { /* megyünk a következő mintára */ }
  }
  return null;
}

/**
 * A források összevetése.
 *
 * Ez a modul lényege: NEM választunk, hanem egyeztetünk.
 * - 2+ forrás egyetért (<1 km) → JAVASOLHATÓ
 * - csak 1 forrás van          → MEGERŐSÍTENDŐ (nem elég!)
 * - a források eltérnek        → ÜTKÖZÉS, emberi döntés kell
 */
function koordOsszevet(talalatok, sajatLat, sajatLng) {
  const jo = talalatok.filter((t) => t && Number.isFinite(t.lat) && Number.isFinite(t.lng));
  if (jo.length === 0) {
    return { allapot: 'NINCS TALÁLAT', javasolt: null, reszletek: [] };
  }

  // Ha már van saját koordinátánk, azt is bevonjuk az összevetésbe
  const sajat = (Number.isFinite(sajatLat) && Number.isFinite(sajatLng))
    ? { forras: 'jelenlegi app.js', lat: sajatLat, lng: sajatLng, megbizhatosag: 'meglévő' }
    : null;

  if (jo.length === 1) {
    const egy = jo[0];
    if (sajat) {
      const d = tavolsag(sajat.lat, sajat.lng, egy.lat, egy.lng);
      if (d <= KOORD_EGYEZES_KM) {
        return { allapot: 'MEGERŐSÍTVE', javasolt: null, tavolsagKm: d, reszletek: [sajat, egy],
                 teendo: 'A meglévő koordinátánkat egy külső forrás megerősíti. Nincs teendő.' };
      }
      return { allapot: 'ÜTKÖZÉS', javasolt: null, tavolsagKm: d, reszletek: [sajat, egy],
               teendo: `A külső forrás ${d.toFixed(1)} km-re tér el a mienktől. Emberi döntés kell: melyik a pálya valódi helye?` };
    }
    return { allapot: 'MEGERŐSÍTENDŐ', javasolt: egy, reszletek: [egy],
             teendo: 'Csak EGY forrás adott koordinátát. A 2+ forrás szabály miatt ez önmagában nem elég a felvételhez – keress hozzá második, független megerősítést.' };
  }

  // Több forrás: megnézzük, egyetértenek-e
  let maxTav = 0;
  for (let i = 0; i < jo.length; i++) {
    for (let j = i + 1; j < jo.length; j++) {
      maxTav = Math.max(maxTav, tavolsag(jo[i].lat, jo[i].lng, jo[j].lat, jo[j].lng));
    }
  }

  if (maxTav <= KOORD_EGYEZES_KM) {
    // Egyetértenek → a legmegbízhatóbb forrást javasoljuk
    const rang = { magas: 0, 'közepes': 1, alacsony: 2 };
    const legjobb = [...jo].sort((a, b) => (rang[a.megbizhatosag] ?? 9) - (rang[b.megbizhatosag] ?? 9))[0];
    if (sajat) {
      const d = tavolsag(sajat.lat, sajat.lng, legjobb.lat, legjobb.lng);
      if (d > KOORD_EGYEZES_KM) {
        return { allapot: 'SAJÁT ADAT GYANÚS', javasolt: legjobb, tavolsagKm: d,
                 reszletek: [sajat, ...jo],
                 teendo: `${jo.length} független forrás egyetért egymással, de a mi koordinátánk ${d.toFixed(1)} km-re van tőlük. Valószínűleg a MI adatunk hibás.` };
      }
      return { allapot: 'MEGERŐSÍTVE', javasolt: null, reszletek: [sajat, ...jo],
               teendo: 'Több forrás megerősíti a meglévő koordinátánkat. Nincs teendő.' };
    }
    return { allapot: 'JAVASOLHATÓ', javasolt: legjobb, reszletek: jo,
             teendo: `${jo.length} független forrás egyetért (max. ${maxTav.toFixed(2)} km eltérés). Felvehető, de a pálya azonosságát érdemes szemre is ellenőrizni.` };
  }

  return { allapot: 'ÜTKÖZÉS', javasolt: null, tavolsagKm: maxTav, reszletek: jo,
           teendo: `A források ${maxTav.toFixed(1)} km-re térnek el egymástól${maxTav > KOORD_GYANUS_KM ? ' – ilyen távolságnál valószínű, hogy valamelyik MÁS objektumot talált (pl. azonos nevű települést)' : ''}. Emberi döntés kell.` };
}

/**
 * Koordináta-gyűjtés egy pályára, mindhárom forrásból.
 */
async function koordinataGyujtes(palya, orszagKod, nyelvek) {
  const talalatok = [];

  // A szövetségi adatlap a legjobb – ezzel kezdünk
  const oldal = await koordOldalMinta(palya, orszagKod);
  if (oldal) talalatok.push(oldal);
  await varj(CONFIG.delayMs);

  // Pontos cím / irányítószám – új pályáknál ez a legerősebb
  const cim = await koordCimAlapjan(palya);
  if (cim) talalatok.push(cim);
  await varj(CONFIG.delayMs);

  const wd = await koordWikidata(palya, nyelvek);
  if (wd) talalatok.push(wd);
  await varj(CONFIG.delayMs);

  const osm = await koordOSM(palya);
  if (osm) talalatok.push(osm);
  await varj(CONFIG.delayMs);

  return koordOsszevet(talalatok, palya.lat, palya.lng);
}

/**
 * ÚJ PÁLYÁK jelöltlistájának beolvasása.
 *
 * Ezek azok a pályák, amiket az ellenőrzés során hivatalos szövetségi
 * forrásokban megtaláltunk, de az app.js-be még NEM kerültek be –
 * pontosan azért, mert koordináta nélkül nem szabad felvenni őket.
 *
 * A fájl formátuma (uj_palyak.json):
 *   [{ countryCode, countryCode2, name, city, address, postalCode,
 *      org, ownSite, length, direction, founded, note, forras }]
 *
 * Csak a name + countryCode kötelező. Minél több cím-adat van,
 * annál pontosabb lesz a geokódolás.
 */
async function beolvasUjPalyak(fajl) {
  let txt;
  try {
    txt = await fs.readFile(fajl, 'utf8');
  } catch (e) {
    let tartalom = '(nem olvasható)';
    try {
      const lista = await fs.readdir('.');
      tartalom = lista.filter((f) => !f.startsWith('.')).join(', ') || '(üres)';
    } catch { /* nem baj */ }
    throw new Error(
      `Nem találom a jelöltlistát (uj_palyak.json).\n`
      + `  Keresett útvonal:   ${fajl}\n`
      + `  Aktuális könyvtár:  ${process.cwd()}\n`
      + `  Itt ezek vannak:    ${tartalom}\n\n`
      + `  MEGOLDÁS: töltsd fel az uj_palyak.json-t a repo gyökerébe,\n`
      + `  az app.js mellé. Ez tartalmazza a felveendő pályák listáját.`
    );
  }
  try {
    const lista = JSON.parse(txt);
    if (!Array.isArray(lista)) throw new Error('a fájl nem tömböt tartalmaz');
    return lista;
  } catch (e) {
    throw new Error(`A jelöltlista hibás (${fajl}): ${e.message}`);
  }
}

/**
 * Beilleszthető app.js rekord generálása egy megtalált koordinátához.
 * Csak akkor hívjuk, ha az állapot JAVASOLHATÓ.
 * Amit nem tudunk, az null marad – NEM töltjük ki találgatással.
 */
function appJsRekord(p, lat, lng, forrasSzoveg) {
  const s = (v) => (v == null || v === '' ? 'null' : `"${String(v).replace(/"/g, '\\"')}"`);
  const n = (v) => (v == null || v === '' ? 'null' : Number(v));
  const jegyzet = [p.note, `Koordináta forrása: ${forrasSzoveg}`, p.forras ? `Pálya forrása: ${p.forras}` : null]
    .filter(Boolean).join('. ');
  return `        { name: ${s(p.name)}, city: ${s(p.city)}, lat: ${lat}, lng: ${lng}, `
    + `founded: ${n(p.founded)}, status: "active", length: ${n(p.length)}, `
    + `direction: ${s(p.direction)}, org: ${s(p.org)}, ownSite: ${s(p.ownSite)}, `
    + `operatorSite: ${s(p.operatorSite)}, operatorName: ${s(p.operatorName)}, `
    + `note: ${s(jegyzet)} },`;
}

/**
 * Koordináta-mód főprogramja: node verify.mjs --coords [ORSZÁGKÓD...]
 */
/**
 * Duplikáció-vizsgálat.
 *
 * FIGYELEM: nem elég egyszerű előtag-egyezést nézni! A pályanevek nagy
 * részében ott van egy általános szó (Pferderennbahn, Hipodrom, Ippodromo,
 * Trabrennbahn, ravirata, travbana...), amitől két teljesen KÜLÖNBÖZŐ pálya
 * is egyezőnek látszana. Ezért előbb kivágjuk ezeket a szavakat, és csak a
 * megkülönböztető részt hasonlítjuk össze.
 */
const ALTALANOS_SZAVAK = /\b(pferderennbahn|trabrennbahn|rennbahn|hippodrome|hipodrom|hipódromo|ippodromo|racecourse|racetrack|raceway|paceway|drafbaan|travbana|travbane|ravirata|ravikeskus|skrejcels|hipodromo|parkrennbahn|stadium|park|arena)\b/gi;

function nevKulcs(nev) {
  return String(nev || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(ALTALANOS_SZAVAK, ' ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Egy névhez TÖBB kulcsot állítunk elő, mert a zárójeles rész gyakran
 * alternatív nevet takar: "Corbiewood Stadium (Haugh Field)" – ez UGYANAZ
 * a pálya, amit a BHRC "Haugh Field" néven listáz. Ha a zárójeles részt
 * eldobnánk, a duplikáció észrevétlen maradna.
 */
function nevKulcsok(nev) {
  const kulcsok = new Set();
  const fo = nevKulcs(nev);
  if (fo) kulcsok.add(fo);
  // zárójelen belüli alternatív nevek
  for (const m of String(nev || '').matchAll(/\((.*?)\)/g)) {
    const alt = nevKulcs(m[1]);
    if (alt && alt.length >= 3) kulcsok.add(alt);
  }
  // "A – B" vagy "A / B" alakú kettős nevek
  for (const resz of String(nev || '').split(/\s[–\-/]\s/)) {
    const k = nevKulcs(resz);
    if (k && k.length >= 3) kulcsok.add(k);
  }
  return [...kulcsok];
}

function marAdatbazisban(uj, meglevoLista) {
  const ujKulcsok = nevKulcsok(uj.name).filter((k) => k.length >= 3);
  if (ujKulcsok.length === 0) return false;
  const ujVaros = nevKulcs(uj.city);

  for (const t of meglevoLista) {
    const regiKulcsok = nevKulcsok(t.name);
    const regiVaros = nevKulcs(t.city);

    for (const a of ujKulcsok) {
      for (const b of regiKulcsok) {
        if (!b) continue;
        if (a === b) return true;                                   // pontos egyezés
        // Részleges egyezés CSAK elég hosszú, megkülönböztető résznél
        if (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a))) return true;
        // Azonos település + hasonló kezdet → gyanús
        if (ujVaros && regiVaros && (ujVaros.includes(regiVaros) || regiVaros.includes(ujVaros))
            && (a.startsWith(b.slice(0, 5)) || b.startsWith(a.slice(0, 5)))) return true;
      }
    }
  }
  return false;
}

async function koordinataMod(db, orszagok, opciok = {}) {
  console.log('KOORDINÁTA-MÓD\n');
  console.log('Négy forrásból gyűjt (szövetségi adatlap, postai cím, Wikidata, OSM),');
  console.log('majd összeveti őket. Csak akkor javasol értéket, ha 2+ forrás egyetért.\n');

  // ---- feldolgozandó pályák összeállítása ----
  const feladat = [];

  // A) MEGLÉVŐ pályák – a saját koordinátáink ellenőrzésére
  if (!opciok.csakUj) {
    for (const orszag of orszagok) {
      for (const p of (db[orszag] || [])) {
        feladat.push({ tipus: 'meglévő', orszagKod: orszag, palya: p });
      }
    }
  }

  // B) ÚJ pályák – a jelöltlistából, amiknek MÉG NINCS koordinátájuk
  if (opciok.ujPalyakFajl) {
    const lista = await beolvasUjPalyak(opciok.ujPalyakFajl);
    const szuk = orszagok.length && orszagok.length < Object.keys(db).length;
    for (const p of lista) {
      if (szuk && !orszagok.includes(p.countryCode)) continue;
      // Ha már benne van az adatbázisban, kihagyjuk (duplikáció-védelem)
      if (marAdatbazisban(p, db[p.countryCode] || [])) {
        console.log(`  (kihagyva, már az adatbázisban: ${p.countryCode} – ${p.name})`);
        continue;
      }
      feladat.push({ tipus: 'ÚJ', orszagKod: p.countryCode, palya: p });
    }
  }

  if (feladat.length === 0) {
    console.log('Nincs feldolgozandó pálya. Használd a --new kapcsolót a jelöltlistához.');
    return;
  }

  console.log(`Feldolgozandó: ${feladat.length} pálya `
    + `(${feladat.filter((f) => f.tipus === 'ÚJ').length} új, `
    + `${feladat.filter((f) => f.tipus === 'meglévő').length} meglévő)\n`);

  const eredmenyek = [];
  let n = 0;
  for (const f of feladat) {
    n++;
    const jel = f.tipus === 'ÚJ' ? '+' : ' ';
    process.stdout.write(`[${String(n).padStart(3)}/${feladat.length}]${jel} ${f.orszagKod} – ${f.palya.name} ... `);
    const nyelvek = [...(ORSZAG_NYELV[f.orszagKod] || []), 'en'];
    const r = await koordinataGyujtes(f.palya, f.orszagKod, nyelvek);
    eredmenyek.push({ tipus: f.tipus, orszag: f.orszagKod, palya: f.palya.name, adat: f.palya, ...r });
    console.log(r.allapot);
  }

  await fs.mkdir(CONFIG.outDir, { recursive: true });

  // ---- CSV a kézi átnézéshez ----
  const csvSor = (m) => m.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';');
  const rang = { 'SAJÁT ADAT GYANÚS': 0, 'ÜTKÖZÉS': 1, 'JAVASOLHATÓ': 2, 'MEGERŐSÍTENDŐ': 3, 'NINCS TALÁLAT': 4, 'MEGERŐSÍTVE': 5 };
  const sorok = [csvSor(['Típus', 'Állapot', 'Ország', 'Pálya', 'Javasolt lat', 'Javasolt lng', 'Források', 'Teendő'])];
  for (const e of [...eredmenyek].sort((a, b) => (rang[a.allapot] ?? 9) - (rang[b.allapot] ?? 9))) {
    sorok.push(csvSor([
      e.tipus, e.allapot, e.orszag, e.palya,
      e.javasolt?.lat ?? '', e.javasolt?.lng ?? '',
      (e.reszletek || []).map((r) => `${r.forras}: ${r.lat?.toFixed?.(5)}, ${r.lng?.toFixed?.(5)}`).join(' | '),
      e.teendo ?? '',
    ]));
  }
  await fs.writeFile(path.join(CONFIG.outDir, 'koordinatak.csv'), '\uFEFF' + sorok.join('\r\n'), 'utf8');
  await fs.writeFile(path.join(CONFIG.outDir, 'koordinatak.json'), JSON.stringify(eredmenyek, null, 1), 'utf8');

  // ---- Beilleszthető app.js rekordok, országonként csoportosítva ----
  const kesz = eredmenyek.filter((e) => e.tipus === 'ÚJ' && e.allapot === 'JAVASOLHATÓ' && e.javasolt);
  if (kesz.length) {
    const perOrszag = {};
    for (const e of kesz) (perOrszag[e.orszag] ||= []).push(e);

    const ki = [
      '// ============================================================',
      '// BEILLESZTHETŐ app.js REKORDOK',
      `// Készült: ${new Date().toLocaleString('hu-HU')}`,
      '//',
      '// Ezek azok az ÚJ pályák, amelyeknél legalább két független',
      '// forrás egyetértett a koordinátában (1 km-en belül).',
      '//',
      '// MIELŐTT BEILLESZTED:',
      '//  1. Nyisd meg a koordinátát térképen és nézd meg, tényleg',
      '//     versenypálya látszik-e ott. A gép nem lát, csak számol.',
      '//  2. Ellenőrizd, hogy a pálya nincs-e már benne más néven.',
      '//  3. A null mezőket NE töltsd ki találgatással.',
      '// ============================================================',
      '',
    ];
    for (const [orsz, lista] of Object.entries(perOrszag)) {
      ki.push(`// ---------- ${orsz} (${lista.length} pálya) ----------`);
      for (const e of lista) {
        const forrasok = (e.reszletek || []).map((r) => r.forras).join(' + ');
        ki.push(appJsRekord(e.adat, e.javasolt.lat, e.javasolt.lng, forrasok));
      }
      ki.push('');
    }
    await fs.writeFile(path.join(CONFIG.outDir, 'beilleszthető_rekordok.js'), ki.join('\n'), 'utf8');
  }

  // ---- összegzés ----
  const szam = eredmenyek.reduce((a, e) => {
    const k = `${e.tipus} / ${e.allapot}`;
    a[k] = (a[k] || 0) + 1; return a;
  }, {});
  console.log('\n=== ÖSSZEGZÉS ===');
  for (const [k, v] of Object.entries(szam).sort()) console.log(`  ${k.padEnd(34)} ${v}`);
  console.log('\nEredmény:');
  console.log('  eredmeny/koordinatak.csv              – teljes lista, ezt nézd át');
  if (kesz.length) {
    console.log(`  eredmeny/beilleszthető_rekordok.js    – ${kesz.length} kész rekord, kézi jóváhagyás után beilleszthető`);
  }
  console.log('\nFONTOS: a szkript SEMMIT nem írt az app.js-be.');
  console.log('A "JAVASOLHATÓ" sorok is emberi jóváhagyást igényelnek – nyisd meg őket térképen.');
}

// ---------- FŐPROGRAM ----------
async function main() {
  const argv = process.argv.slice(2);
  const csakLinkek = argv.includes('--links-only');
  const csakKoord = argv.includes('--coords');
  const ujPalyakKert = argv.includes('--new');
  const csakUj = argv.includes('--only-new');
  const orszagSzuro = argv.filter((a) => !a.startsWith('--')).map((a) => a.toUpperCase());

  console.log('Racecourse360 – adatellenőrzés indul\n');

  const db = await beolvasAdatbazis();
  const orszagok = orszagSzuro.length ? orszagSzuro : Object.keys(db);

  // Koordináta-mód: külön fut, nem keveredik a többi ellenőrzéssel
  if (csakKoord) {
    const k = await kornyezetTeszt();
    if (!k.mukodik) {
      console.error('HIBA: ez a környezet nem enged tetszőleges oldalt lekérni (CORS/hálózati korlát).');
      console.error('A koordináta-módhoz valódi Node.js környezet kell – futtasd a saját gépeden.');
      process.exit(1);
    }
    await koordinataMod(db, orszagok, {
      ujPalyakFajl: (ujPalyakKert || csakUj) ? CONFIG.ujPalyakPath : null,
      csakUj,
    });
    return;
  }

  await fs.mkdir(CONFIG.outDir, { recursive: true });

  const mindenEredmeny = [];
  const mindenElteres = [];
  let feldolgozott = 0;
  const osszes = orszagok.reduce((s, o) => s + (db[o]?.length || 0), 0);

  for (const orszag of orszagok) {
    const palyak = db[orszag];
    if (!palyak) {
      console.log(`  ! Ismeretlen országkód: ${orszag} – kihagyva`);
      continue;
    }
    const nyelvek = [...(ORSZAG_NYELV[orszag] || []), 'en'];

    for (const palya of palyak) {
      feldolgozott++;
      process.stdout.write(
        `[${String(feldolgozott).padStart(3)}/${osszes}] ${orszag} – ${palya.name} ... `
      );

      const eredmeny = { orszag, nev: palya.name, sajat: palya };

      // linkellenőrzés
      eredmeny.link = await linkEllenorzes(palya.ownSite);
      await varj(CONFIG.delayMs);

      if (!csakLinkek) {
        const talalatok = await wikidataKereses(palya.name, nyelvek);
        const valasztott = legjobbTalalat(talalatok, palya.name);
        eredmeny.wikidataJeloltek = talalatok;
        if (valasztott) {
          try {
            eredmeny.wikidata = await wikidataEntitas(valasztott.id);
          } catch { eredmeny.wikidata = null; }
          await varj(CONFIG.delayMs);
        } else {
          eredmeny.wikidata = null;
          eredmeny.megjegyzes = 'Nincs egyértelmű Wikidata-találat – kézi keresés kell.';
        }
      }

      const elteresek = osszevet(palya, eredmeny.wikidata, eredmeny.link);
      eredmeny.elteresek = elteresek;
      mindenEredmeny.push(eredmeny);
      elteresek.forEach((e) => mindenElteres.push({ orszag, palya: palya.name, ...e }));

      console.log(elteresek.length ? `${elteresek.length} eltérés` : 'rendben');
    }
  }

  // ---- kimenetek ----
  await fs.writeFile(
    path.join(CONFIG.outDir, 'reszletes.json'),
    JSON.stringify(mindenEredmeny, null, 1),
    'utf8'
  );

  // CSV (Excel-barát: BOM + pontosvessző)
  const csvSor = (mezok) => mezok
    .map((m) => `"${String(m ?? '').replace(/"/g, '""')}"`)
    .join(';');
  const csv = [
    csvSor(['Súlyosság', 'Ország', 'Pálya', 'Mező', 'Saját értékünk', 'Külső forrás értéke', 'Forrás', 'Teendő']),
    ...mindenElteres
      .sort((a, b) => {
        const rang = { 'SÚLYOS ELTÉRÉS': 0, 'ELTÉRÉS': 1, 'PÓTOLHATÓ': 2 };
        return (rang[a.sulyossag] ?? 9) - (rang[b.sulyossag] ?? 9);
      })
      .map((e) => csvSor([
        e.sulyossag, e.orszag, e.palya, e.mezo,
        e.sajatErtek, e.kulsoErtek, e.forras, e.teendo,
      ])),
  ].join('\r\n');
  await fs.writeFile(path.join(CONFIG.outDir, 'elteresek.csv'), '\uFEFF' + csv, 'utf8');

  // összefoglaló
  const szamlalo = mindenElteres.reduce((acc, e) => {
    acc[e.sulyossag] = (acc[e.sulyossag] || 0) + 1;
    return acc;
  }, {});
  const nincsTalalat = mindenEredmeny.filter((e) => !e.wikidata).length;
  const halottLink = mindenEredmeny.filter((e) => e.link?.domainNemLetezik).length;

  const osszefoglalo = [
    '=== RACECOURSE360 – ELLENŐRZÉSI ÖSSZEFOGLALÓ ===',
    `Készült: ${new Date().toLocaleString('hu-HU')}`,
    `Vizsgált pályák: ${mindenEredmeny.length}`,
    '',
    '-- Talált eltérések --',
    ...Object.entries(szamlalo).map(([k, v]) => `  ${k}: ${v}`),
    '',
    `Nem létező domain (kitalált cím): ${halottLink}`,
    `Nincs Wikidata-találat (kézi munka kell): ${nincsTalalat}`,
    '',
    'KÖVETKEZŐ LÉPÉS:',
    '  Nyisd meg az eredmeny/elteresek.csv fájlt Excelben.',
    '  Fentről lefelé haladj: a SÚLYOS ELTÉRÉS sorok vannak elöl.',
    '',
    'FIGYELEM: ez a szkript SEMMIT nem írt át az app.js-ben.',
    'Minden változtatás emberi döntés marad.',
  ].join('\n');

  await fs.writeFile(path.join(CONFIG.outDir, 'osszefoglalo.txt'), osszefoglalo, 'utf8');

  console.log('\n' + osszefoglalo);
}

main().catch((e) => {
  console.error('\nHIBA:', e.message);
  process.exit(1);
});
