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
 *    node verify.mjs --javaslatok    → a docx-adatok hitelesítése
 *    node verify.mjs --fill          → hiányzó adatok a MEGLÉVŐ pályákhoz
 *    node verify.mjs --fill --new    → meglévő ÉS jelölt pályák
 *    node verify.mjs --fill --only-new → csak a jelöltek
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
 *
 * A projektek háromféleképpen szoktak épülni:
 *   - minden a gyökérben:        app.js
 *   - klasszikus almappákkal:    js/app.js, css/styles.css
 *   - src-alapú:                 src/app.js, assets/js/app.js
 * Mindegyiket végignézzük, és a szkript működik akkor is, ha a tools/
 * almappából indul, meg akkor is, ha a repo gyökeréből (GitHub Actions).
 *
 * Környezeti változóval mindig felülírható, pl.:
 *   APPJS_PATH=js/app.js node tools/verify.mjs --coords
 */
function keresFajl(fajlNev, kornyezetiValtozo) {
  const kv = process.env[kornyezetiValtozo];
  if (kv) return kv;

  const gyokerek = ['.', '..', '../..'];
  const almappak = ['', 'js', 'src', 'assets/js', 'public/js', 'static/js', 'scripts', 'data'];

  for (const gy of gyokerek) {
    for (const alm of almappak) {
      const utvonal = [gy, alm, fajlNev].filter(Boolean).join('/');
      if (existsSync(utvonal)) return utvonal;
    }
  }
  return `./${fajlNev}`;
}

const CONFIG = {
  appJsPath: keresFajl('app.js', 'APPJS_PATH'),
  outDir: process.env.OUT_DIR || './eredmeny',
  // Az ÚJ, még fel nem vett pályák jelöltlistája (--new / --only-new)
  ujPalyakPath: keresFajl('uj_palyak.json', 'UJ_PALYAK_PATH'),
  // A docx-ből származó beépítési javaslatok (--javaslatok mód)
  javaslatokPath: keresFajl('javaslatok.json', 'JAVASLATOK_PATH'),
  // Udvariassági várakozás kérések között (ms). Ne vidd 200 alá.
  delayMs: 350,
  // Hány másodperc után adjuk fel egy oldal betöltését
  timeoutMs: 12000,
  // A Wikidata és Wikipédia elvárja, hogy azonosítsuk magunkat
  userAgent: 'Racecourse360-DataCheck/1.0 (https://racecourse360.com; kapcsolat: info@racecourse360.com)',
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
  // Az adatbázisban még NEM szereplő országok (a jelöltlistán viszont igen):
  RUS: ['ru'], PRT: ['pt'], LVA: ['lv'], UKR: ['uk'],
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

/**
 * KISZOLGÁLÓNKÉNTI SEBESSÉGKORLÁT
 *
 * A Nominatim használati feltételei ABSZOLÚT MAXIMUM 1 kérés/másodpercet
 * engednek. A korábbi 350 ms-os általános várakozás ezt megsértette volna
 * (kb. 3 kérés/mp), ami egyrészt szabálysértés, másrészt ideiglenes tiltást
 * vonhat maga után – ami "NINCS TALÁLAT"-ként jelentkezne, holott
 * valójában a szerver utasított vissza minket.
 *
 * Ezért minden kiszolgálóhoz külön minimális várakozást tartunk.
 */
const HOST_KORLAT = {
  'nominatim.openstreetmap.org': 1100,   // hivatalos: max 1 kérés/mp
  'www.wikidata.org': 300,
  'overpass-api.de': 1500,
  'secure.geonames.org': 400,   // óránként 1000 kérés a korlát
  'archive.org': 500,
  'harness.org.au': 900,
  'www.thetrots.com.au': 800,
  'www.hrnsw.com.au': 800,
  'www.letrot.com': 800,
  'en.wikipedia.org': 300, 'fr.wikipedia.org': 300, 'de.wikipedia.org': 300,
  'sv.wikipedia.org': 300, 'fi.wikipedia.org': 300, 'it.wikipedia.org': 300,   // közösségi szolgáltatás – legyünk kíméletesek
  'query.wikidata.org': 1500,
  'commons.wikimedia.org': 300,
};
const utolsoKeres = new Map();

async function hostVarakozas(url) {
  let host;
  try { host = new URL(url).hostname; } catch { return; }
  const min = HOST_KORLAT[host] ?? CONFIG.delayMs;
  const elozo = utolsoKeres.get(host) || 0;
  const eltelt = Date.now() - elozo;
  if (eltelt < min) await varj(min - eltelt);
  utolsoKeres.set(host, Date.now());
}

async function keres(url, opts = {}) {
  await hostVarakozas(url);
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

/**
 * Üzemeltető szervezet a Wikidatából.
 * P137 = operator (üzemeltető), P127 = owned by (tulajdonos).
 * Az operator a pontosabb: a tulajdonos gyakran önkormányzat vagy állam,
 * miközben a versenyeket egy egyesület vagy társaság szervezi.
 */
async function wikidataSzervezet(palya, nyelvek) {
  const talalatok = await wikidataKereses(palya.name, nyelvek);
  const valasztott = legjobbTalalat(talalatok, palya.name);
  if (!valasztott) return null;
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*`
      + `&ids=${valasztott.id}&props=claims`;
    const adat = await jsonKeres(url);
    const claims = adat.entities?.[valasztott.id]?.claims || {};
    const qidOf = (p) => claims[p]?.[0]?.mainsnak?.datavalue?.value?.id || null;
    const szervezetQid = qidOf('P137') || qidOf('P127');
    if (!szervezetQid) return null;

    // A QID-hez lekérjük a nevet ÉS a honlapját (P856) is – ugyanabból a
    // lekérdezésből, plusz hálózati költség nélkül. A honlap az üzemeltető
    // SAJÁT oldala, ami eltérhet a pálya saját honlapjától (ownSite) –
    // pl. amikor egy versenyszervezet több pályát is üzemeltet.
    await varj(CONFIG.delayMs);
    const nevUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*`
      + `&ids=${szervezetQid}&props=labels|claims&languages=${[...nyelvek, 'en'].join('|')}`;
    const nevAdat = await jsonKeres(nevUrl);
    const labels = nevAdat.entities?.[szervezetQid]?.labels || {};
    const nev = (labels.en || Object.values(labels)[0] || {}).value;
    if (!nev) return null;

    const szervezetClaims = nevAdat.entities?.[szervezetQid]?.claims || {};
    const operatorSite = szervezetClaims['P856']?.[0]?.mainsnak?.datavalue?.value || null;

    return {
      forras: `Wikidata ${valasztott.id} → ${szervezetQid}`,
      csalad: 'wikidata',
      org: nev,
      // Csak akkor adjuk vissza, ha van érték – a --fill mód úgyis
      // csak a hiányzó mezőket kéri, de a hívó oldalon egyszerűbb, ha
      // a null mező nem szerepel a válaszban.
      ...(operatorSite ? { operatorSite } : {}),
      megbizhatosag: 'magas',
    };
  } catch {
    return null;
  }
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
      csalad: 'osm',   // ugyanabból az OSM-adatbázisból jön, mint a koordOSM!
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
 * 5. FORRÁS – Overpass API (OpenStreetMap objektum-lekérdezés)
 *
 * MIÉRT MÁS, MINT A NOMINATIM: a Nominatim CÍMRE keres, és ha nem találja
 * a pontos helyet, visszaadja a település közepét. Pontosan ez történt az
 * Eardisley-nél: a HR3 6PW irányítószám a FALU közepét adta, nem a pályát.
 *
 * Az Overpass ezzel szemben a ténylegesen FELTÉRKÉPEZETT OBJEKTUMOT keresi:
 *   leisure=track + sport=horse_racing / harness_racing / equestrian
 * Vagy megtalálja a felrajzolt versenypályát, vagy semmit nem ad vissza –
 * településre SOHA nem téved.
 *
 * FONTOS KORLÁT: az Overpass is OpenStreetMap-adatból dolgozik, mint a
 * Nominatim. Ugyanaz a forrásbázis. A hibázási módjuk viszont gyökeresen
 * más (felrajzolt pálya kontra címtalálat), ezért külön forráscsaládként
 * kezeljük – de ezt a korlátot tudni kell.
 */
const ORSZAG_ISO2 = {
  AUS: 'AU', NZL: 'NZ', USA: 'US', CAN: 'CA', FRA: 'FR', ITA: 'IT',
  DEU: 'DE', SWE: 'SE', NOR: 'NO', FIN: 'FI', DNK: 'DK', GBR: 'GB',
  IRL: 'IE', NLD: 'NL', BEL: 'BE', AUT: 'AT', CHE: 'CH', ESP: 'ES',
  PRT: 'PT', POL: 'PL', CZE: 'CZ', SVK: 'SK', HUN: 'HU', SVN: 'SI',
  SRB: 'RS', EST: 'EE', LVA: 'LV', LTU: 'LT', RUS: 'RU', UKR: 'UA',
  MLT: 'MT',
};

const OVERPASS_VEGPONT = 'https://overpass-api.de/api/interpreter';

async function overpassLekerdezes(ql) {
  const v = await keres(OVERPASS_VEGPONT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(ql),
  });
  if (!v.ok) throw new Error(`Overpass HTTP ${v.status}`);
  const adat = await v.json();
  return (adat.elements || []).map((e) => ({
    tipus: e.type,
    id: e.id,
    // pont esetén lat/lon, vonal/kapcsolat esetén a "center" a súlypont
    lat: e.lat ?? e.center?.lat ?? null,
    lng: e.lon ?? e.center?.lon ?? null,
    cimkek: e.tags || {},
  })).filter((x) => x.lat != null);
}

/** A pályanévből használható keresőmintát csinál (az általános szavak nélkül). */
function overpassNevMinta(nev) {
  const tiszta = String(nev || '')
    .replace(/\(.*?\)/g, ' ')
    .replace(ALTALANOS_SZAVAK, ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .trim();
  // a leghosszabb, megkülönböztető szó a legjobb keresőkulcs
  const szavak = tiszta.split(/\s+/).filter((sz) => sz.length >= 4);
  if (szavak.length === 0) return null;
  return szavak.sort((a, b) => b.length - a.length)[0];
}

async function koordOverpass(palya, orszagKod) {
  const iso2 = ORSZAG_ISO2[orszagKod];
  const minta = overpassNevMinta(palya.name);
  if (!iso2 || !minta) return null;

  // Csak versenypálya-jellegű objektumokat kérünk, a névre szűrve.
  const ql = `[out:json][timeout:40];
area["ISO3166-1"="${iso2}"][admin_level=2]->.o;
(
  nwr["name"~"${minta}",i]["leisure"="track"](area.o);
  nwr["name"~"${minta}",i]["sport"~"horse_racing|harness_racing|equestrian",i](area.o);
  nwr["name"~"${minta}",i]["landuse"="recreation_ground"]["sport"~"horse",i](area.o);
);
out center 8;`;

  try {
    const talalatok = await overpassLekerdezes(ql);
    if (talalatok.length === 0) return null;

    // Ha több találat van, a legjobban illeszkedő nevűt választjuk
    const kulcs = nevKulcs(palya.name);
    const pontszam = (t) => {
      const n = nevKulcs(t.cimkek.name || '');
      if (!n) return 0;
      if (n === kulcs) return 3;
      if (n.includes(kulcs) || kulcs.includes(n)) return 2;
      return 1;
    };
    const legjobb = [...talalatok].sort((a, b) => pontszam(b) - pontszam(a))[0];

    return {
      forras: `Overpass/OSM (${legjobb.tipus}/${legjobb.id})`,
      csalad: 'osm-objektum',
      lat: legjobb.lat,
      lng: legjobb.lng,
      // Magas megbízhatóság: ez egy FELRAJZOLT versenypálya, nem címtalálat
      megbizhatosag: 'magas',
      megjegyzes: `OSM-címkék: ${Object.entries(legjobb.cimkek)
        .filter(([k]) => ['name', 'leisure', 'sport', 'landuse'].includes(k))
        .map(([k, v]) => `${k}=${v}`).join(', ')}`,
    };
  } catch {
    return null;
  }
}

/**
 * Overpass-alapú FELFEDEZÉS: egy ország ÖSSZES feltérképezett ügetőpályája.
 * Ez az ausztrál helyzet megoldása – nem kell névlista a szövetségtől.
 */
/**
 * TELEPÜLÉS-ALAPÚ Overpass-keresés.
 *
 * MIÉRT KELL: a francia pályák nagy részének NEM a településről van a neve.
 * Le Mans-ban a pálya "Hippodrome des Hunaudières", Sault-ban "du Deffends",
 * Issigeac-ban "des Eguières". A LeTrot-listából viszont csak a települést
 * tudjuk – ezért a névre keresés csődöt mond.
 *
 * Ez a függvény a TELEPÜLÉSEN BELÜL keres versenypálya-objektumot, névtől
 * függetlenül. Ha egyetlen ilyen van, az szinte biztosan a keresett pálya.
 * Ha több, nem választunk – jelezzük, hogy kézi döntés kell.
 */
async function koordOverpassTelepules(palya, orszagKod) {
  const iso2 = ORSZAG_ISO2[orszagKod];
  const varos = String(palya.city || '').replace(/\s*\(.*?\)\s*/g, '').split(/[,/]/)[0].trim();
  if (!iso2 || !varos || varos.length < 3) return null;

  const ql = `[out:json][timeout:60];
area["ISO3166-1"="${iso2}"][admin_level=2]->.o;
area["name"="${varos.replace(/"/g, '')}"](area.o)->.v;
(
  nwr["leisure"="track"]["sport"~"horse_racing|harness_racing|equestrian",i](area.v);
  nwr["sport"="harness_racing"](area.v);
  nwr["name"~"hippodrome|ippodromo|trabrennbahn|racecourse",i]["leisure"="track"](area.v);
);
out center 6;`;

  try {
    const talalatok = await overpassLekerdezes(ql);
    if (talalatok.length === 0) return null;

    // Ha több különböző helyen van találat, NEM választunk.
    // Egy rossz koordináta rosszabb, mint a hiányzó.
    const kulonbozo = talalatok.filter((t, i) =>
      talalatok.findIndex((u) => tavolsag(t.lat, t.lng, u.lat, u.lng) < 1) === i);
    if (kulonbozo.length > 1) return null;

    const t = kulonbozo[0];
    return {
      forras: `Overpass/OSM település (${t.tipus}/${t.id})`,
      csalad: 'osm-objektum',
      lat: t.lat,
      lng: t.lng,
      megbizhatosag: 'közepes',   // település-alapú, ezért óvatosabb
      megjegyzes: `${varos} területén egyetlen versenypálya-objektum: `
                + `${t.cimkek.name || '(névtelen)'} [${t.cimkek.sport || t.cimkek.leisure}]`,
    };
  } catch {
    return null;
  }
}

/**
 * NAGY ORSZÁGOK FELOSZTÁSA a felfedezéshez.
 *
 * TANULSÁG AZ ÉLES FUTÁSBÓL: az USA, Kanada, Ausztrália és Franciaország
 * NULLA találatot adott, miközben ott biztosan van feltérképezett pálya.
 * Az ok: egy kontinensnyi területen a generikus címke-keresés túllépi az
 * Overpass 120 másodperces korlátját, és a lekérdezés némán elhasal.
 *
 * Megoldás: ezeknél az országoknál közigazgatási egységenként kérdezünk.
 */
const NAGY_ORSZAGOK = {
  AUS: ['New South Wales', 'Victoria', 'Queensland', 'South Australia',
        'Western Australia', 'Tasmania', 'Northern Territory',
        'Australian Capital Territory'],
  USA: ['New York', 'Pennsylvania', 'Ohio', 'Indiana', 'Illinois', 'Michigan',
        'Kentucky', 'Maryland', 'Delaware', 'New Jersey', 'Maine',
        'Massachusetts', 'Minnesota', 'Virginia', 'California'],
  CAN: ['Ontario', 'Quebec', 'Alberta', 'British Columbia', 'Manitoba',
        'Saskatchewan', 'Nova Scotia', 'New Brunswick',
        'Prince Edward Island', 'Newfoundland and Labrador'],
  FRA: ['Normandie', 'Bretagne', 'Pays de la Loire', 'Nouvelle-Aquitaine',
        'Occitanie', 'Auvergne-Rhône-Alpes', 'Grand Est', 'Hauts-de-France',
        "Provence-Alpes-Côte d'Azur", 'Centre-Val de Loire',
        'Bourgogne-Franche-Comté', 'Île-de-France', 'Corse'],
  RUS: ['Moscow', 'Moscow Oblast', 'Rostov Oblast', 'Krasnodar Krai',
        'Omsk Oblast', 'Novosibirsk Oblast', 'Tatarstan', 'Bashkortostan'],
};

async function overpassFelfedezes(orszagKod) {
  const iso2 = ORSZAG_ISO2[orszagKod];
  if (!iso2) return [];

  // Nagy országnál régiónként kérdezünk, hogy ne lépjük túl az időkorlátot
  const regiok = NAGY_ORSZAGOK[orszagKod];
  const lekerdezesek = regiok
    ? regiok.map((r) => `[out:json][timeout:90];
area["ISO3166-1"="${iso2}"][admin_level=2]->.o;
area["name"="${r.replace(/"/g, '')}"](area.o)->.r;
(
  nwr["sport"="harness_racing"](area.r);
  nwr["leisure"="track"]["sport"="horse_racing"](area.r);
);
out center 150;`)
    : [`[out:json][timeout:120];
area["ISO3166-1"="${iso2}"][admin_level=2]->.o;
(
  nwr["sport"="harness_racing"](area.o);
  nwr["leisure"="track"]["sport"="horse_racing"](area.o);
  nwr["leisure"="track"]["sport"="equestrian"](area.o);
);
out center 300;`];

  const osszes = [];
  for (const ql of lekerdezesek) {
    try {
      const t = await overpassLekerdezes(ql);
      osszes.push(...t);
    } catch (e) {
      console.log(`    (Overpass részlekérdezés hiba: ${e.message})`);
    }
    if (lekerdezesek.length > 1) await varj(CONFIG.delayMs);
  }

  // Duplikátumok kiszűrése (a régiók határán átlógó objektumok)
  const egyedi = osszes.filter((t, i) =>
    osszes.findIndex((u) => u.tipus === t.tipus && u.id === t.id) === i);

  return egyedi
    .filter((t) => t.cimkek.name)          // névtelen objektum nem használható
    .map((t) => ({
      qid: `OSM-${t.tipus}-${t.id}`,
      name: t.cimkek.name,
      leiras: [t.cimkek.sport, t.cimkek.leisure].filter(Boolean).join(' / '),
      lat: t.lat,
      lng: t.lng,
      ownSite: t.cimkek.website || t.cimkek['contact:website'] || null,
      founded: t.cimkek.start_date ? parseInt(String(t.cimkek.start_date).slice(0, 4), 10) : null,
      honnan: 'Overpass/OSM',
    }));
}

/**
 * 6. FORRÁS – Wikipédia cikk
 *
 * MIÉRT KÜLÖN A WIKIDATÁTÓL: bár rokon projektek, a Wikipédia-cikkeket
 * MÁS szerkesztők írják, más forrásokból, és a két adat gyakran eltér.
 * Sok cikkben van koordináta és alapítási év, ami a Wikidatába sosem
 * került be. Ezért külön családként kezeljük.
 *
 * AMIT AD: koordináta, alapítási év.
 * Az alapítási év azért értékes, mert a jelenlegi adatbázisban több
 * száz helyen null – és a szövegből gyakran kiolvasható.
 */
async function wikipediaCikk(palya, nyelvek) {
  for (const nyelv of nyelvek) {
    const url = `https://${nyelv}.wikipedia.org/w/api.php`
      + '?action=query&format=json&origin=*&prop=coordinates|extracts'
      + '&exintro=1&explaintext=1&colimit=1'
      + `&titles=${encodeURIComponent(palya.name)}&redirects=1`;
    try {
      const adat = await jsonKeres(url);
      const lapok = adat.query?.pages || {};
      for (const kulcs of Object.keys(lapok)) {
        if (kulcs === '-1') continue;          // nincs ilyen cikk
        const lap = lapok[kulcs];
        const koord = lap.coordinates?.[0];
        const szoveg = lap.extract || '';

        // Alapítási év a bevezető szövegből.
        // Óvatosan: csak akkor fogadjuk el, ha nyitás/alapítás szó van mellette,
        // különben bármelyik évszámot elkapnánk a szövegből.
        //
        // FONTOS: a szórend nyelvenként más! Az angolban és a franciában a
        // kulcsszó áll elöl ("opened in 1969"), a németben és a magyarban
        // viszont az évszám ("1878 eröffnet", "1925-ben megnyílt").
        // Ezért MINDKÉT irányban keresünk.
        const KULCSSZAVAK = [
          'opened', 'founded', 'established', 'inaugurated', 'built',      // en
          'ouvert', 'ouverture', 'fondé', 'inauguré', 'créé',               // fr
          'eröffnet', 'gegründet', 'erbaut', 'errichtet',                   // de
          'invigd', 'grundad', 'öppnade', 'anlagd',                         // sv
          'avattiin', 'perustettu', 'rakennettu',                           // fi
          'inaugurato', 'fondato', 'costruito',                             // it
          'megnyílt', 'megnyitott', 'alapítva', 'alapított', 'épült',       // hu
          'åpnet', 'grunnlagt', 'åbnede', 'grundlagt',                      // no/da
          'abierto', 'fundado', 'inaugurado',                               // es/pt
          'otwarty', 'założony',                                            // pl
        ].join('|');
        const EV = '(1[5-9]\\d\\d|20[0-2]\\d)';

        let ev = null;
        // a) kulcsszó ... évszám   (angol, francia, olasz...)
        let m = new RegExp(`(?:${KULCSSZAVAK})[^.]{0,40}?\\b${EV}\\b`, 'i').exec(szoveg);
        // b) évszám ... kulcsszó   (német, magyar, skandináv szórend)
        if (!m) m = new RegExp(`\\b${EV}\\b[^.]{0,40}?(?:${KULCSSZAVAK})`, 'i').exec(szoveg);
        if (m) ev = parseInt(m[1], 10);

        // --- PÁLYAHOSSZ a szövegből ---
        // A cikkek jellemzően így írják: "1000 metre track", "a 1 000 m
        // hosszú pálya", "piste de 1 300 mètres", "one-mile oval".
        // A mértékegység KÖTELEZŐ a mintában, különben bármelyik számot
        // elkapnánk (nézőszám, díjazás, évszám).
        let hossz = null;
        const hm = new RegExp(
          '(\\d[\\d\\s.,]{2,7})\\s*(?:m\\b|meter|metre|méter|meter|metri|mètres?)', 'i').exec(szoveg);
        if (hm) {
          const n = Math.round(parseFloat(hm[1].replace(/[\s.]/g, '').replace(',', '.')));
          if (n >= 500 && n <= 3000) hossz = n;
        }
        // Angolszász megnevezések
        if (!hossz) {
          if (/\bhalf[- ]mile\b/i.test(szoveg)) hossz = 805;
          else if (/\bfive[- ]eighths?\b/i.test(szoveg)) hossz = 1006;
          else if (/\bseven[- ]eighths?\b/i.test(szoveg)) hossz = 1408;
          else if (/\bone[- ]mile\b|\bmile[- ]long\b/i.test(szoveg)) hossz = 1609;
        }

        // --- HALADÁSI IRÁNY a szövegből ---
        // FIGYELEM a szóhasználatra: az "anticlockwise" (óramutatóval
        // ELLENTÉTES) = BAL kéz. A "left-handed" is bal. Ezért az
        // "anti"/"counter" előtagot ELŐBB kell vizsgálni, különben a
        // "clockwise" részlet miatt jobbnak olvasnánk.
        let irany = null;
        if (/anti-?clockwise|counter-?clockwise|left-?handed|links(kurs|herum)|à gauche|balra|bal kéz/i.test(szoveg)) {
          irany = 'left';
        } else if (/\bclockwise\b|right-?handed|rechts(kurs|herum)|à droite|jobbra|jobb kéz/i.test(szoveg)) {
          irany = 'right';
        }

        if (koord || ev || hossz || irany) {
          return {
            forras: `Wikipédia (${nyelv}) – ${lap.title}`,
            csalad: 'wikipedia',
            lat: koord?.lat ?? null,
            lng: koord?.lon ?? null,
            founded: ev,
            length: hossz,
            direction: irany,
            megbizhatosag: koord ? 'magas' : 'közepes',
            megjegyzes: `https://${nyelv}.wikipedia.org/wiki/${encodeURIComponent(lap.title)}`,
          };
        }
      }
    } catch { /* nyelvenként elnézzük */ }
    await varj(CONFIG.delayMs);
  }
  return null;
}

async function koordWikipedia(palya, nyelvek) {
  const t = await wikipediaCikk(palya, nyelvek);
  // Koordináta-forrásként csak akkor használható, ha tényleg van koordináta
  return (t && t.lat != null) ? t : null;
}

/**
 * 7. FORRÁS – GeoNames
 *
 * MIÉRT ÉRTÉKES: ez az EGYETLEN koordináta-forrásunk, ami sem az
 * OpenStreetMapre, sem a Wikidatára nem épül. A GeoNames több mint száz
 * különböző adatforrást aggregál (nemzeti névtárak, katonai térképészet,
 * statisztikai hivatalok). Vagyis VALÓDI független családot ad.
 *
 * FELTÉTEL: ingyenes regisztráció a geonames.org-on, és a felhasználónevet
 * a GEONAMES_USER környezeti változóba kell tenni. GitHub Actionsben:
 * Settings → Secrets and variables → Actions → New repository secret.
 * Ha nincs beállítva, a forrás egyszerűen kimarad – nem hiba.
 *
 * KORLÁT: napi 20 000, óránként 1 000 kérés. A 346 jelöltre bőven elég.
 * LICENC: CC-BY – forrásmegjelölés kötelező (a rekord note mezőjébe kerül).
 */
async function koordGeoNames(palya, orszagKod) {
  const felhasznalo = process.env.GEONAMES_USER;
  if (!felhasznalo) return null;   // nincs beállítva → kihagyjuk

  const p = new URLSearchParams({
    q: palya.name,
    maxRows: '10',
    username: felhasznalo,
    style: 'FULL',
  });
  const iso2 = ORSZAG_ISO2[orszagKod];
  if (iso2) p.set('country', iso2);

  try {
    const adat = await jsonKeres(`https://secure.geonames.org/searchJSON?${p}`);

    // A GeoNames hibát is 200-as státusszal küldhet, a törzsben
    if (adat.status) {
      throw new Error(`GeoNames: ${adat.status.message || 'ismeretlen hiba'}`);
    }
    const talalatok = adat.geonames || [];
    if (talalatok.length === 0) return null;

    // A GeoNames "feature code"-okkal osztályozza az objektumokat.
    // Minket a versenypálya-szerűek érdekelnek – a település (P.PPL*)
    // találatot KI KELL SZŰRNI, különben ugyanabba a csapdába esünk,
    // mint az Eardisley-nél: a falu közepét kapnánk a pálya helyett.
    const JO_KODOK = ['RCTR', 'RECG', 'STDM', 'SPA', 'AMTH'];  // racetrack, recreation ground, stadium
    const TELEPULES = /^PPL/;

    const relevans = talalatok.filter((t) => {
      if (TELEPULES.test(t.fcode || '')) return false;
      return JO_KODOK.includes(t.fcode)
        || /racecourse|racetrack|raceway|hippodrom|ippodromo|travbana|ravirata|trabrennbahn|paceway/i.test(t.name || '');
    });
    if (relevans.length === 0) return null;

    // A legjobban illeszkedő nevű találat
    const kulcs = nevKulcs(palya.name);
    const pontszam = (t) => {
      const n = nevKulcs(t.name || '');
      if (!n) return 0;
      if (n === kulcs) return 3;
      if (n.includes(kulcs) || kulcs.includes(n)) return 2;
      return 1;
    };
    const legjobb = [...relevans].sort((a, b) => pontszam(b) - pontszam(a))[0];

    return {
      forras: `GeoNames (${legjobb.geonameId})`,
      csalad: 'geonames',
      lat: parseFloat(legjobb.lat),
      lng: parseFloat(legjobb.lng),
      megbizhatosag: JO_KODOK.includes(legjobb.fcode) ? 'magas' : 'közepes',
      megjegyzes: `${legjobb.name} [${legjobb.fcode || '?'}] – forrás: GeoNames (CC-BY)`,
    };
  } catch {
    return null;
  }
}

/**
 * 8. FORRÁS – Internet Archive (Wayback Machine)
 *
 * MIT AD: státusz-jelzést, nem koordinátát.
 *
 * MIÉRT: a bezárt pályák a legkárosabb hibatípus – a látogató elutazik
 * egy helyre, ami már nincs. A Billund, a Fraser Downs és a Forbury Park
 * mind így maradt bent aktívként.
 *
 * HOGYAN: ha egy pálya honlapját évek óta nem archiválták, az erős jel,
 * hogy a site megszűnt – és vele valószínűleg a pálya is.
 *
 * FONTOS KORLÁT: ez KÖZVETETT bizonyíték. Egy élő pálya is elhanyagolhatja
 * a honlapját. Ezért NEM állít státuszt, csak GYANÚT jelez, amit ember
 * ellenőriz. Kulcs nem kell hozzá, ingyenes.
 */
async function statuszArchive(palya) {
  if (!palya.ownSite) return null;
  try {
    const url = 'https://archive.org/wayback/available?url='
      + encodeURIComponent(palya.ownSite.replace(/^https?:\/\//, ''));
    const adat = await jsonKeres(url);
    const pillanat = adat.archived_snapshots?.closest;
    if (!pillanat || !pillanat.timestamp) {
      return {
        forras: 'Internet Archive',
        csalad: 'archive',
        statuszGyanu: 'nincs-archivum',
        megjegyzes: 'A Wayback Machine egyáltalán nem ismeri ezt a címet – '
                  + 'ellenőrizni kell, hogy létezik-e egyáltalán.',
      };
    }
    // formátum: YYYYMMDDhhmmss
    const ev = parseInt(String(pillanat.timestamp).slice(0, 4), 10);
    const most = new Date().getFullYear();
    const kora = most - ev;

    if (kora >= 3) {
      return {
        forras: 'Internet Archive',
        csalad: 'archive',
        statuszGyanu: 'elavult',
        utolsoArchivalas: ev,
        megjegyzes: `A honlapot utoljára ${ev}-ban archiválták (${kora} éve). `
                  + 'Ez GYANÚ, nem bizonyíték: egy működő pálya is elhanyagolhatja a honlapját. Ellenőrizendő.',
      };
    }
    return {
      forras: 'Internet Archive',
      csalad: 'archive',
      statuszGyanu: null,
      utolsoArchivalas: ev,
      megjegyzes: `Utolsó archiválás: ${ev} – a honlap élőnek tűnik.`,
    };
  } catch {
    return null;
  }
}

/**
 * 9. FORRÁS – Wikimedia Commons képkeresés KOORDINÁTA alapján
 *
 * MIT AD: képet, nem koordinátát.
 *
 * MIÉRT ÍGY: a névre keresés gyengén működött (a svéd körben a 33 pályából
 * alig néhányhoz találtunk képet). A Commons viszont tud HELY szerint
 * keresni – és most MINDEN pályánknak van koordinátája.
 *
 * A licencet is visszaadja, ami kötelező feltétel a felhasználáshoz.
 */
async function kepCommons(palya, sugarMeter = 800) {
  if (palya.lat == null || palya.lng == null) return null;
  try {
    const p = new URLSearchParams({
      action: 'query', format: 'json', origin: '*',
      generator: 'geosearch',
      ggscoord: `${palya.lat}|${palya.lng}`,
      ggsradius: String(sugarMeter),
      ggslimit: '20',
      ggsnamespace: '6',                       // csak fájlok
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
    });
    const adat = await jsonKeres(`https://commons.wikimedia.org/w/api.php?${p}`);
    const lapok = Object.values(adat.query?.pages || {});
    if (lapok.length === 0) return null;

    const kepek = lapok.map((l) => {
      const info = l.imageinfo?.[0] || {};
      const meta = info.extmetadata || {};
      return {
        cim: l.title,
        url: info.descriptionurl || null,
        licenc: meta.LicenseShortName?.value || null,
        szerzo: (meta.Artist?.value || '').replace(/<[^>]+>/g, '').trim() || null,
      };
    }).filter((k) => k.url && k.licenc);

    // A kereskedelmileg NEM használható licenceket kiszűrjük.
    // Inkább egy képpel kevesebb, mint egy jogi probléma.
    const TILTOTT = /non-?commercial|\bNC\b|fair use|no derivat|\bND\b/i;
    const jok = kepek.filter((k) => !TILTOTT.test(k.licenc));
    if (jok.length === 0) return null;

    return {
      forras: 'Wikimedia Commons (geosearch)',
      csalad: 'commons',
      kepek: jok,
      megjegyzes: `${jok.length} szabad licencű kép ${sugarMeter} m-en belül. `
                + 'FIGYELEM: a hely alapján talált kép nem biztos, hogy a pályát ábrázolja – szemre ellenőrizendő.',
    };
  } catch {
    return null;
  }
}

/* ============================================================
   SZÖVETSÉGI MŰSZAKI ADATOK
   ------------------------------------------------------------
   MIÉRT: az adatbázis 344 pályájából 266-nál hiányzik a hossz,
   298-nál az irány. Ez a legnagyobb TARTALMI hiány – a koordináták
   már megvannak, az adatlapok viszont üresek.

   A Wikidata és a Wikipédia ezeket ritkán tartalmazza. A nemzeti
   szövetségek viszont MINDIG közlik – csak oldalanként más formában.

   Ez a tábla oldalanként írja le, hogyan kell kiolvasni. Új ország
   felvétele = egy új bejegyzés; a gyűjtő logikához nem kell nyúlni.

   HOGYAN TALÁLD MEG A MINTÁT: nyisd meg egy pálya adatlapját a
   szövetség oldalán, nézd meg, milyen szöveggel közlik a hosszt
   ("1.975 m", "ca 1400 m", "1 350 m"), és írj rá reguláris kifejezést.
   ============================================================ */

/**
 * INDEX-ALAPÚ URL-FELOLDÁS
 *
 * A travsport.se URL-je régiót is tartalmaz:
 *   /vara-travbanor/norra-sverige/bergsaker
 *
 * Pályánként nem tudjuk, melyik régióba tartozik – és találgatni rossz
 * ötlet lenne (5 régió × 33 pálya = 165 felesleges kérés).
 *
 * Ehelyett EGYSZER letöltjük a pályajegyzéket, kigyűjtjük belőle az összes
 * hivatkozást, és abból építünk név → URL térképet. Utána minden pálya
 * feloldása ingyenes.
 */
const indexGyorsitotar = new Map();

async function indexBolFeloldas(minta, palya) {
  const kulcsSzo = minta.indexUrl;
  if (!indexGyorsitotar.has(kulcsSzo)) {
    const terkep = new Map();
    try {
      const v = await keres(minta.indexUrl, { method: 'GET' });
      if (v.ok) {
        const html = await v.text();
        for (const m of html.matchAll(minta.indexMinta)) {
          const utvonal = m[0].replace(/^["']|["']$/g, '');
          const nev = utvonal.split('/').filter(Boolean).pop();
          if (nev) terkep.set(nev.toLowerCase(), utvonal);
        }
      }
    } catch { /* üres térképpel megyünk tovább */ }
    indexGyorsitotar.set(kulcsSzo, terkep);
    if (terkep.size) console.log(`    (${minta.nev}: ${terkep.size} pálya az indexből)`);
  }

  const terkep = indexGyorsitotar.get(kulcsSzo);
  if (terkep.size === 0) return null;

  // A pálya nevéből képzett kulccsal keresünk az indexben
  const jeloltek = [
    String(palya.name || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/travbana|travet|trav\b/g, '').replace(/[^a-z]/g, ''),
    String(palya.city || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, ''),
  ].filter(Boolean);

  for (const j of jeloltek) {
    if (terkep.has(j)) return new URL(terkep.get(j), minta.indexUrl).href;
    // részleges egyezés, ha az index más alakot használ
    for (const [k, u] of terkep) {
      if (k.includes(j) || j.includes(k)) return new URL(u, minta.indexUrl).href;
    }
  }
  return null;
}

const MUSZAKI_MINTAK = [
  // ============================================================
  //  travsport.se – KIKAPCSOLVA, robots.txt tiltás miatt
  // ------------------------------------------------------------
  //  A Svensk Travsport oldala pontosan azt adná, ami hiányzik:
  //    Längd: 1000 m | Upplopp: 200 m | Bredd: 21,5 m
  //    Open stretch: Nej | Webbplats: www.bergsaker.com
  //
  //  DE a robots.txt tiltja az automatizált lekérdezést, és a projekt
  //  módszertana szerint ezt MINDIG tiszteletben tartjuk. Egy adat
  //  megszerzése nem ér annyit, hogy megsértsük egy szövetség
  //  kifejezett kérését.
  //
  //  A kód alább maradt, hogy ne kelljen újraírni, ha a helyzet változik:
  //    - ha a Svensk Travsport ad API-t vagy írásos engedélyt
  //    - ha nyílt adatként közzéteszik a pályajegyzéket
  //  Akkor elég az `aktiv: false`-t `true`-ra állítani.
  //
  //  ADDIG: a svéd pályák műszaki adatait KÉZZEL kell felvinni, a
  //  travsport.se oldalait böngészőből olvasva. Ez teljesen rendben
  //  van – a tiltás a gépi tömeges lekérésre vonatkozik, nem arra,
  //  hogy egy ember megnézi az oldalt.
  // ============================================================
  {
    nev: 'travsport.se (Svensk Travsport)',
    aktiv: false,                        // robots.txt tiltás – lásd fent
    orszagok: ['SWE'],
    indexUrl: 'https://www.travsport.se/vara-travbanor/',
    indexMinta: /\/vara-travbanor\/[a-z-]+\/[a-z0-9-]+/g,
    // Az oldal "Fakta" blokkja így néz ki:
    //   Banförkortning: B
    //   Längd: 1000 m
    //   Bredd: 21,5 m (2140 m), 21,0 m (1640 m)
    //   Upplopp: 200 m
    //   Open stretch: Nej
    kiolvas: (html) => {
      const e = {};

      const h = /Längd:\s*(\d[\d\s.]{2,6})\s*m\b/i.exec(html);
      if (h) {
        const n = parseInt(h[1].replace(/[\s.]/g, ''), 10);
        if (n >= 500 && n <= 3000) e.length = n;
      }

      // "Upplopp" = célegyenes. Ez a svéd pályák egyik legfontosabb jellemzője:
      // a hosszabb célegyenes több előzési lehetőséget ad.
      const cel = /Upplopp:\s*(\d{2,4})\s*m\b/i.exec(html);
      if (cel) e.finalStraight = parseInt(cel[1], 10);

      // "Bredd" = pályaszélesség. Több érték is lehet, távonként megadva –
      // az elsőt vesszük. A svéd tizedesjel VESSZŐ: "21,5 m" = 21.5 m.
      const szel = /Bredd:\s*(\d{1,2})[,.](\d)\s*m/i.exec(html);
      if (szel) e.width = parseFloat(`${szel[1]}.${szel[2]}`);

      // "Open stretch" = külön előzősáv a célegyenesben. Skandináv sajátosság,
      // ami érdemben megváltoztatja a verseny taktikáját.
      const os = /Open\s*stretch:\s*(Ja|Nej)/i.exec(html);
      if (os) e.openStretch = /ja/i.test(os[1]);

      // A svéd pályák többségénél nálunk ownSite: null – ez pótolhatja
      const web = /Webbplats:\s*((?:https?:\/\/)?[\w.-]+\.[a-z]{2,})/i.exec(html);
      if (web) e.ownSite = web[1].startsWith('http') ? web[1] : `https://${web[1]}`;

      // Svédországban minden ügetőpálya bal kézre fut, EGY kivétellel:
      // az Åmålstravet 2011 óta jobb kézre. Ezt NEM tippeljük meg innen –
      // az irányt külön, forrásból kell megerősíteni.

      return e;
    },
  },
  {
    nev: 'harness.org.au (Harness Racing Australia)',
    orszagok: ['AUS'],
    // A HRA minden pálya adatlapján közli a "TRACK DATA" blokkot:
    //   Circumference: 823.34m      → pályahossz
    //   Straights: 165m             → célegyenes
    //   Radius On Turns: 75m        → kanyarsugár (új mező)
    //   Sprint Lane: Yes            → előzősáv (= open stretch)
    //   Field Limits / Front Line   → indulószám
    // Plusz pontos cím, telefon, e-mail és a szokásos versenynapok.
    //
    // A pálya URL-jét a listaoldalról oldjuk fel, mert a szerkezetet
    // nem ismerjük biztosan (a lista "Wagga, NSW" alakban hivatkozik).
    indexUrl: 'https://harness.org.au/tracks/',
    indexMinta: /\/tracks\/[a-z0-9-]+/g,
    kiolvas: (html) => {
      const e = {};

      // "Circumference: 823.34m" – TIZEDESJEGGYEL, ami fontos:
      // a 823,34 m nem kerek szám, tehát valódi mérés, nem becslés.
      const h = /Circumference:?\s*([\d.,]+)\s*m\b/i.exec(html);
      if (h) {
        const n = Math.round(parseFloat(h[1].replace(',', '')));
        if (n >= 400 && n <= 3000) e.length = n;
      }

      // "Straights: 165m" – a célegyenes
      const cel = /Straights?:?\s*(\d{2,4})\s*m\b/i.exec(html);
      if (cel) e.finalStraight = parseInt(cel[1], 10);

      // "Radius On Turns: 75m" – a kanyar sugara. Ez SEHOL MÁSHOL nem
      // szerepel, pedig sokat elárul: a kis sugár éles kanyart jelent.
      const sugar = /Radius\s*On\s*Turns:?\s*(\d{1,3})\s*m\b/i.exec(html);
      if (sugar) e.turnRadius = parseInt(sugar[1], 10);

      // "Sprint Lane: Yes" – ez az ausztrál neve az előzősávnak,
      // ami Skandináviában "open stretch"
      const sav = /Sprint\s*Lane:?\s*(Yes|No)/i.exec(html);
      if (sav) e.openStretch = /yes/i.test(sav[1]);

      return e;
    },
  },
  {
    nev: 'serbia-trot.org.rs (Kasački savez Srbije)',
    orszagok: ['SRB'],
    // Az UKSS EGYETLEN oldalon közli minden pálya műszaki adatát, táblázatban.
    // Ezért nem pályánként kérdezünk, hanem egyszer letöltjük a táblázatot,
    // és abból keressük ki a sorunkat. Ez kíméletesebb is: 1 kérés 19 helyett.
    indexUrl: 'https://www.serbia-trot.org.rs/hipodrom.asp',
    tablazatos: true,
    kiolvasSor: (sor, palya) => {
      // A nevek eltérhetnek: nálunk "Beogradski hipodrom", az UKSS-nél
      // "Hipodrom Beograd". Ezért MINDKÉT irányban egyeztetünk, és az
      // első szót is elfogadjuk (beogradski ↔ beograd).
      const kulcs = nevKulcs(palya.name);
      if (!kulcs) return null;
      const sorKulcs = nevKulcs(sor);
      const elsoSzo = kulcs.split(' ')[0];
      const egyezik = sorKulcs.includes(kulcs)
                   || kulcs.includes(sorKulcs.split(' ')[0])
                   || (elsoSzo.length >= 5 && sorKulcs.includes(elsoSzo.slice(0, 6)));
      if (!egyezik) return null;
      const e = {};

      // "914 m", "1.020 m", "999,8 m" – a szerb tizedesjel VESSZŐ
      // FIGYELEM: a Požarevac hossza "1460,62 m" – KÉT tizedesjegy.
      // Az első változat csak egyet engedett, ezért ott nem talált semmit.
      const h = /\b(\d{3,4}(?:[,.]\d{1,2})?)\s*m\b/.exec(sor);
      if (h) {
        const n = Math.round(parseFloat(h[1].replace(',', '.')));
        if (n >= 500 && n <= 3000) e.length = n;
      }
      // A célegyenes ("ciljna prava") a szerb pályákon 140–200 m
      const celek = [...sor.matchAll(/\b(1[0-9]\d|200)\s*m\b/g)]
        .map((x) => parseInt(x[1], 10)).filter((x) => x !== e.length);
      if (celek.length) e.finalStraight = celek[0];

      // Talaj: rizla = zúzalék, trava = fű, pesak = homok
      if (/rizl/i.test(sor)) e.surface = 'zúzalék';
      else if (/trav/i.test(sor)) e.surface = 'fű';
      else if (/pes[ak]/i.test(sor)) e.surface = 'homok';

      // Irány: levo = bal, desno = jobb
      if (/\bdesno\b/i.test(sor)) e.direction = 'right';
      else if (/\blevo\b/i.test(sor)) e.direction = 'left';

      // Az UKSS hivatalos A/B besorolása
      const kat = /\b([AB])\s*kategorij/i.exec(sor);
      if (kat) e.trackCategory = kat[1].toUpperCase();

      return Object.keys(e).length ? e : null;
    },
  },
  {
    nev: 'horseracing.ch (Suisse Trot / Galopp Schweiz)',
    orszagok: ['CHE'],
    url: (p) => {
      const kulcs = (p.city || p.name).toLowerCase()
        .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z]/g, '');
      return `https://www.horseracing.ch/rennen-ch/rennbahnen/${kulcs}/`;
    },
    // Az oldal így közli: "Linkskurs Gras", "Grosse Bahn ca 1400 m",
    // "Kleine Bahn ca 1150 m", "Zielgerade 350 m"
    kiolvas: (html) => {
      const e = {};
      const h = /(?:grosse\s+bahn|bahn)\s*(?:ca\.?\s*)?(\d[\d\s.']{2,6})\s*m\b/i.exec(html);
      if (h) {
        const n = parseInt(h[1].replace(/[\s.']/g, ''), 10);
        if (n >= 500 && n <= 3000) e.length = n;
      }
      const cel = /zielgerade\s*(?:ca\.?\s*)?(\d{2,4})\s*m\b/i.exec(html);
      if (cel) e.finalStraight = parseInt(cel[1], 10);
      if (/linkskurs/i.test(html)) e.direction = 'left';
      else if (/rechtskurs/i.test(html)) e.direction = 'right';
      if (/\bgras\b|rasen/i.test(html)) e.surface = 'fű';
      else if (/sand/i.test(html)) e.surface = 'homok';
      return e;
    },
  },
  // ÚJ ORSZÁG IDE. Amit érdemes tudni a már feltérképezett forrásokról:
  //
  //  travsport.se (SWE)  – minden pályához közli a hosszt és a célegyenest.
  //                        A 33 svéd pálya adata már ellenőrzött, de a
  //                        HTML-szerkezetet még nem néztük meg.
  //  serbia-trot.org.rs  – hossz, célegyenes, A/B kategória, talaj, irány.
  //                        A 19 szerb pálya adata kézzel már megvan.
  //  hvtonline.de (DEU)  – a versenykiírásokban szerepel a hossz.
  //  hippos.fi (FIN)     – a nyári pályáknál cím van, hossz ritkán.
  //
  //  Szerkezet:
  //  {
  //    nev: 'valamely-szovetseg.xx',
  //    orszagok: ['XXX'],
  //    url: (p) => `https://...`,
  //    kiolvas: (html) => ({ length, direction, surface, finalStraight }),
  //  },
];

/**
 * Táblázatos műszaki forrás gyorsítótára.
 *
 * Egyes szövetségek EGYETLEN oldalon közlik minden pálya adatát
 * (pl. a szerb UKSS 19 pályát egy táblázatban). Ilyenkor kíméletlenség
 * lenne pályánként lekérdezni – egyszer letöltjük, és soronként keresünk.
 */
const tablazatGyorsitotar = new Map();

async function tablazatSorai(minta) {
  if (!tablazatGyorsitotar.has(minta.indexUrl)) {
    let sorok = [];
    try {
      const v = await keres(minta.indexUrl, { method: 'GET' });
      if (v.ok) {
        const html = await v.text();
        // A táblázatsorokat soronként bontjuk: <tr> vagy sortörés mentén
        sorok = html
          .replace(/<\/tr>/gi, '\n')
          .replace(/<[^>]+>/g, ' ')
          .split('\n')
          .map((x) => x.replace(/\s+/g, ' ').trim())
          .filter((x) => x.length > 10);
      }
    } catch { /* üres listával megyünk tovább */ }
    tablazatGyorsitotar.set(minta.indexUrl, sorok);
    if (sorok.length) console.log(`    (${minta.nev}: ${sorok.length} sor a táblázatból)`);
  }
  return tablazatGyorsitotar.get(minta.indexUrl);
}

async function muszakiSzovetseg(palya, orszagKod) {
  for (const m of MUSZAKI_MINTAK) {
    if (m.aktiv === false) continue;      // pl. robots.txt tiltás miatt kikapcsolva
    if (!m.orszagok.includes(orszagKod)) continue;
    try {
      // HÁROMFÉLE forrás-szerkezet:
      //  1) táblázatos – egy oldal, minden pálya (szerb UKSS)
      //  2) index-alapú – jegyzékből oldjuk fel a pálya URL-jét
      //  3) közvetlen – a névből képzett URL
      if (m.tablazatos) {
        const sorok = await tablazatSorai(m);
        for (const sor of sorok) {
          const e = m.kiolvasSor(sor, palya);
          if (e) {
            return {
              forras: `${m.nev} (${m.indexUrl})`,
              csalad: 'szovetseg',
              megbizhatosag: 'magas',
              ...e,
            };
          }
        }
        continue;
      }

      const url = m.indexUrl ? await indexBolFeloldas(m, palya) : m.url(palya);
      if (!url) continue;

      const v = await keres(url, { method: 'GET' });
      if (!v.ok) continue;
      const html = (await v.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const e = m.kiolvas(html);
      if (!e || Object.keys(e).length === 0) continue;
      return {
        forras: `${m.nev} (${url})`,
        csalad: 'szovetseg',
        megbizhatosag: 'magas',
        ...e,
      };
    } catch { /* megyünk a következő mintára */ }
  }
  return null;
}

/**
 * 13. FORRÁS – Harness Racing NSW (hrnsw.com.au)
 *
 * Új-Dél-Wales 29 pályával a második legnagyobb ausztrál állam.
 * A klubjegyzék elérhető, és klubonként külön oldal van:
 *   /clubs-associations/clubs-1/wagga-hrc
 *
 * A "HRC" a Harness Racing Club rövidítése – ez a névképzés kulcsa.
 */
async function hrnswAdatlap(palya) {
  const kulcs = String(palya.name || palya.city || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/harness|racing|club|paceway|raceway|park|trotting|nsw|hrc/g, ' ')
    .trim().replace(/[^a-z\s]/g, '').replace(/\s+/g, '-');
  if (!kulcs || kulcs.length < 3) return null;

  const url = `https://www.hrnsw.com.au/clubs-associations/clubs-1/${kulcs}-hrc`;
  try {
    const v = await keres(url, { method: 'GET' });
    if (!v.ok) return null;
    const html = (await v.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const e = { forras: `Harness Racing NSW (${url})`, csalad: 'szovetseg', megbizhatosag: 'magas' };

    const klub = /([A-Z][A-Za-z' -]{3,40}?Harness Racing Club(?:\s+Inc(?:orporated)?)?)\b/.exec(html);
    if (klub) e.org = klub[1].replace(/\s+/g, ' ').trim();

    // Ausztrál cím: az irányítószám a horgony (NSW + 4 számjegy)
    const cim = /([A-Z0-9][^|]{5,80}?\bNSW\s+\d{4})/.exec(html);
    if (cim) e.cim = cim[1].replace(/\s+/g, ' ').trim();

    if (!e.org && !e.cim) return null;
    return e;
  } catch {
    return null;
  }
}

/**
 * 12. FORRÁS – Harness Racing Victoria (thetrots.com.au)
 *
 * MIÉRT KELL: a harness.org.au (a szövetségi gyűjtőoldal) botvédelemmel
 * blokkol, ezért a 78 hiányzó ausztrál pályához nem jutunk el rajta.
 * Az ÁLLAMI szövetségek viszont elérhetők – és Victoria adja a legtöbbet:
 * 32 pálya, ami az ausztrál hiány több mint harmada.
 *
 * MIT AD: pontos utcacímet és a klub nevét.
 *   Racetrack: Charlton Park, 17 Calder Hwy, Charlton VIC 3525
 *   Club: Charlton Harness Racing Club Inc
 *
 * MIT NEM AD: pályahosszt és irányt. Azok csak a blokkolt harness.org.au
 * adatlapjain vannak (Circumference / Straights / Sprint Lane).
 *
 * A címből koordinátát csinálunk – ezért ez egyszerre 'szervezet' és
 * 'koordinata' forrás.
 */
async function thetrotsAdatlap(palya) {
  const kulcs = String(palya.name || palya.city || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/harness|racing|club|paceway|raceway|park|trotting|inc/g, ' ')
    .replace(/[^a-z]/g, '');
  if (!kulcs || kulcs.length < 3) return null;

  const url = `https://www.thetrots.com.au/racing/venues/${kulcs}/`;
  try {
    const v = await keres(url, { method: 'GET' });
    if (!v.ok) return null;
    const html = (await v.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    const e = { forras: `Harness Racing Victoria (${url})`, csalad: 'szovetseg', megbizhatosag: 'magas' };

    // A klub neve az oldal elején áll: "Charlton Harness Racing Club Inc"
    // FIGYELEM a mohó illesztésre: a "[A-Za-z ]*" záró rész továbbfutott
    // a következő szavakra ("... Club Inc Club Information President Joey..."),
    // ezért a végét pontosan lezárjuk: az "Inc"/"Incorporated" vagy semmi.
    const klub = /([A-Z][A-Za-z' -]{3,40}?(?:Harness Racing Club|Trotting Club|Pacing Club)(?:\s+Inc(?:orporated)?)?)\b/
      .exec(html);
    if (klub) e.org = klub[1].replace(/\s+/g, ' ').trim();

    // "Racetrack ... 17 Calder Hwy Charlton VIC 3525"
    // Az irányítószám a horgony: 4 számjegy az állam rövidítése után.
    const cim = /Racetrack\s+(.{5,90}?\b(?:VIC|NSW|QLD|SA|WA|TAS|NT|ACT)\s+\d{4})/i.exec(html);
    if (cim) e.cim = cim[1].replace(/\s+/g, ' ').trim();

    if (!e.org && !e.cim) return null;
    return e;
  } catch {
    return null;
  }
}

/**
 * A thetrots.com.au címéből koordináta.
 * Két lépés: előbb az adatlap, aztán a cím geokódolása.
 */
async function koordThetrots(palya, orszagKod) {
  if (orszagKod !== 'AUS') return null;
  // Előbb Victoria, aztán NSW – a két legnagyobb állam adja
  // az ausztrál pályák kétharmadát.
  let adat = await thetrotsAdatlap(palya);
  if (!adat || !adat.cim) {
    await varj(CONFIG.delayMs);
    adat = await hrnswAdatlap(palya);
  }
  if (!adat || !adat.cim) return null;
  await varj(CONFIG.delayMs);
  const k = await koordCimAlapjan({ address: adat.cim, city: null, countryCode2: 'au' });
  if (!k) return null;
  return {
    ...k,
    forras: `${adat.forras} → cím: ${adat.cim}`,
    // A család marad 'osm', mert a KOORDINÁTÁT a Nominatim adta.
    // A cím viszont a szövetségtől van, ezért megbízhatóbb, mint egy
    // puszta névkeresés – ezt a megjegyzésben jelezzük.
    megjegyzes: `A címet a Harness Racing Victoria adta meg: ${adat.cim}`,
  };
}

/**
 * 11. FORRÁS – LeTrot pálya-adatlap (hossz, irány, talaj)
 *
 * MIÉRT FONTOS: az adatbázisban 273 pályánál hiányzik a hossz és 298-nál
 * az irány. A LeTrot minden francia pálya adatlapján közli ezeket:
 *
 *   Vincennes:  "Pistes homologuées : 1.975 m. (GP); 1.325 m. (PP)
 *                Corde à gauche"
 *   Le Mans:    "piste de trot en sable de 1 350 m"
 *
 * A francia szám-formátum PONTTAL tagol ezresével (1.975 m = 1975 m),
 * ami könnyen félreolvasható – erre külön figyelünk.
 *
 * MIT AD: hossz, irány, talaj. Koordinátát NEM.
 */
async function letrotAdatlap(palya) {
  // A LeTrot-azonosító a jegyzetbe került a jelöltlista építésekor
  const m = /LeTrot-azonosító:\s*(\d+)/.exec(palya.note || '');
  const url = /Adatlap:\s*(https?:\/\/\S+)/.exec(palya.note || '')?.[1]
           || (m ? null : null);
  if (!url) return null;

  try {
    const v = await keres(url, { method: 'GET' });
    if (!v.ok) return null;
    const html = (await v.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    const eredmeny = { forras: `LeTrot adatlap (${url})`, csalad: 'szovetseg', megbizhatosag: 'magas' };

    // --- Hossz ---
    // A francia jegyzés "1.975 m" vagy "1 350 m" alakú; a pont EZRES-elválasztó,
    // NEM tizedesjel. Ha tizedesként olvasnánk, 1,975 métert kapnánk.
    const hosszMinta = /(?:pistes?\s+homologu[ée]es?|piste\s+de\s+trot|corde[^.]{0,30})?[^.]{0,40}?(\d[\d\s.]{2,7})\s*m\b/i;
    const hm = hosszMinta.exec(html);
    if (hm) {
      const szam = parseInt(hm[1].replace(/[\s.]/g, ''), 10);
      // Épeszű tartomány: 500–3000 m. Ezen kívül elírás vagy más adat.
      if (szam >= 500 && szam <= 3000) eredmeny.length = szam;
    }

    // --- Irány ---
    if (/corde\s+à\s+gauche/i.test(html)) eredmeny.direction = 'left';
    else if (/corde\s+à\s+droite/i.test(html)) eredmeny.direction = 'right';

    // --- Talaj ---
    if (/en\s+sable|piste\s+en\s+sable/i.test(html)) eredmeny.surface = 'homok';
    else if (/gazon|en\s+herbe/i.test(html)) eredmeny.surface = 'fű';
    else if (/mâchefer|machefer|cendr[ée]e/i.test(html)) eredmeny.surface = 'salak';

    if (!eredmeny.length && !eredmeny.direction && !eredmeny.surface) return null;
    return eredmeny;
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
      csalad: 'wikidata',
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
      csalad: 'osm',
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
        csalad: 'szovetseg',
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

  // Több forrás: megkeressük a LEGNAGYOBB EGYETÉRTŐ CSOPORTOT (klasztert).
  //
  // MIÉRT NEM a legnagyobb páronkénti távolságot nézzük: ha három forrásból
  // kettő tökéletesen egyetért és a harmadik 2 km-re van, az NEM ütközés,
  // hanem egy kilógó érték. (Valós eset: a Wolverhamptonnál a Wikidata és az
  // OSM méterre egyezett, csak az irányítószám-alapú találat lógott ki –
  // az az irányítószám-körzet közepét adta, nem a pályát.)
  const klaszterek = [];
  for (const t of jo) {
    let betett = false;
    for (const k of klaszterek) {
      if (tavolsag(k[0].lat, k[0].lng, t.lat, t.lng) <= KOORD_EGYEZES_KM) {
        k.push(t); betett = true; break;
      }
    }
    if (!betett) klaszterek.push([t]);
  }
  klaszterek.sort((a, b) => b.length - a.length);
  const fo = klaszterek[0];
  const kilogok = jo.filter((t) => !fo.includes(t));

  if (fo.length >= 2) {
    // FÜGGETLENSÉG-ELLENŐRZÉS
    //
    // Nem elég, hogy két forrás egyetért – KÜLÖNBÖZŐ adatbázisból kell jönniük.
    // A "postai cím" és az "OpenStreetMap" találat egyaránt Nominatim-alapú,
    // vagyis UGYANABBÓL az OSM-adatbázisból. Ha ott rossz a hely, mindkettő
    // ugyanazt a hibát adja – ez látszategyetértés, nem megerősítés.
    //
    // Valós eset: az Eardisley-nél az irányítószám és az OSM-keresés is a FALU
    // közepét adta vissza, nem a versenypályát. Két "egyetértő" forrás, egy hiba.
    const csaladok = new Set(fo.map((t) => t.csalad || t.forras));
    const fuggetlen = csaladok.size >= 2;

    const rang = { magas: 0, 'közepes': 1, alacsony: 2 };
    const legjobb = [...fo].sort((a, b) => (rang[a.megbizhatosag] ?? 9) - (rang[b.megbizhatosag] ?? 9))[0];

    const kilogoSzoveg = kilogok.length
      ? ` ${kilogok.length} forrás kilóg (${kilogok.map((k) => k.forras).join(', ')}) – ezt a szkript figyelmen kívül hagyta.`
      : '';

    if (sajat) {
      const d = tavolsag(sajat.lat, sajat.lng, legjobb.lat, legjobb.lng);
      if (d > KOORD_EGYEZES_KM) {
        return { allapot: fuggetlen ? 'SAJÁT ADAT GYANÚS' : 'MEGERŐSÍTENDŐ', javasolt: legjobb, tavolsagKm: d,
                 reszletek: [sajat, ...jo],
                 teendo: fuggetlen
                   ? `${fo.length} FÜGGETLEN forrás egyetért egymással, de a mi koordinátánk ${d.toFixed(1)} km-re van tőlük. Valószínűleg a MI adatunk hibás.${kilogoSzoveg}`
                   : `${fo.length} forrás egyetért és ${d.toFixed(1)} km-re van a mienktől, DE mindegyik ugyanabból az adatbázisból (${[...csaladok][0]}) jön – ez nem független megerősítés. Kell egy másik típusú forrás.${kilogoSzoveg}` };
      }
      return { allapot: 'MEGERŐSÍTVE', javasolt: null, reszletek: [sajat, ...jo],
               teendo: `Több forrás megerősíti a meglévő koordinátánkat. Nincs teendő.${kilogoSzoveg}` };
    }

    if (!fuggetlen) {
      return { allapot: 'MEGERŐSÍTENDŐ', javasolt: legjobb, reszletek: jo,
               teendo: `${fo.length} találat egyetért, DE mindegyik ugyanabból az adatbázisból (${[...csaladok][0]}) származik – ez látszategyetértés, nem független megerősítés. `
                     + `Tipikus csapda: az irányítószám és az OSM-keresés is a TELEPÜLÉS közepét adja vissza, nem a pályát. `
                     + `Kell egy másik típusú forrás (Wikidata vagy szövetségi adatlap).${kilogoSzoveg}` };
    }

    return { allapot: 'JAVASOLHATÓ', javasolt: legjobb, reszletek: jo,
             teendo: `${fo.length} FÜGGETLEN forrás egyetért (${[...csaladok].join(' + ')}).${kilogoSzoveg} Felvehető, de a pálya azonosságát érdemes szemre is ellenőrizni.` };
  }

  // Nincs két egyetértő forrás: minden találat külön helyre mutat
  let maxTav = 0;
  for (let i = 0; i < jo.length; i++) {
    for (let j = i + 1; j < jo.length; j++) {
      maxTav = Math.max(maxTav, tavolsag(jo[i].lat, jo[i].lng, jo[j].lat, jo[j].lng));
    }
  }
  return { allapot: 'ÜTKÖZÉS', javasolt: null, tavolsagKm: maxTav, reszletek: jo,
           teendo: `Egyik forrás sem erősíti meg a másikat; a legnagyobb eltérés ${maxTav.toFixed(1)} km${maxTav > KOORD_GYANUS_KM ? ' – ilyen távolságnál valószínű, hogy valamelyik MÁS objektumot talált (pl. azonos nevű települést)' : ''}. Emberi döntés kell.` };
}

/**
 * Koordináta-gyűjtés egy pályára, mindhárom forrásból.
 */
/* ============================================================
   FORRÁS-NYILVÁNTARTÁS
   ------------------------------------------------------------
   MIÉRT: eddig minden forrás kézzel volt bekötve a gyűjtésbe.
   Ez 4-5 forrásig működik, azon túl kezelhetetlen – főleg mert
   a következő feladatok NEM koordinátáról szólnak (bezárás,
   alapítási év, kép, versenynaptár).

   Itt minden forrás EGY BEJEGYZÉS, ami maga deklarálja:
     - mit tud szolgáltatni (`ad`)
     - hol használható (`orszagok`)
     - melyik adatbázisból dolgozik (`csalad`)

   Új forrás felvétele = egy új bejegyzés. A gyűjtő logikához
   nem kell hozzányúlni.

   A `csalad` a legfontosabb mező: két AZONOS családú találat
   nem számít független megerősítésnek. Az Eardisley-eset
   megmutatta, hogy öt forrás ugyanabból az adatbázisból nem
   ér többet egynél.
   ============================================================ */

const FORRASOK = [
  {
    nev: 'Szövetségi adatlap',
    csalad: 'szovetseg',
    ad: ['koordinata'],
    orszagok: (kod) => OLDAL_MINTAK.some((m) => m.orszagok.includes(kod)),
    megbizhatosag: 'magas',
    // MIÉRT ELSŐ: maga a szövetség adta meg, ennél pontosabb nincs
    sorrend: 1,
    lekerdez: (palya, ctx) => koordOldalMinta(palya, ctx.orszagKod),
  },
  {
    nev: 'Overpass / OSM objektum',
    csalad: 'osm-objektum',
    ad: ['koordinata'],
    orszagok: (kod) => !!ORSZAG_ISO2[kod],
    megbizhatosag: 'magas',
    // MIÉRT ERŐS: a felrajzolt pályát keresi, nem címet –
    // településre soha nem téved
    sorrend: 2,
    lekerdez: (palya, ctx) => koordOverpass(palya, ctx.orszagKod),
  },
  {
    nev: 'Overpass – település alapján',
    csalad: 'osm-objektum',
    // Akkor segít, amikor a pálya NEVE más, mint a településé.
    // A francia pályák nagy részénél pontosan ez a helyzet:
    // Le Mans-ban "Hunaudières", Sault-ban "Deffends", Issigeac-ban "Eguières".
    ad: ['koordinata'],
    orszagok: (kod) => !!ORSZAG_ISO2[kod],
    alkalmazhato: (palya) => !!palya.city,
    megbizhatosag: 'közepes',
    sorrend: 2.5,
    lekerdez: (palya, ctx) => koordOverpassTelepules(palya, ctx.orszagKod),
  },
  {
    nev: 'Postai cím / irányítószám',
    csalad: 'osm',
    ad: ['koordinata'],
    orszagok: () => true,
    // csak akkor van értelme, ha van cím-adat
    alkalmazhato: (palya) => !!(palya.address || palya.cim || palya.postalCode || palya.irsz),
    megbizhatosag: 'közepes',
    sorrend: 3,
    lekerdez: (palya) => koordCimAlapjan(palya),
  },
  {
    nev: 'Wikidata',
    csalad: 'wikidata',
    ad: ['koordinata', 'alapitas', 'honlap', 'statusz'],
    orszagok: () => true,
    megbizhatosag: 'magas',
    sorrend: 4,
    lekerdez: (palya, ctx) => koordWikidata(palya, ctx.nyelvek),
    // A Wikidata a koordinátán kívül alapítási évet is ad (P571)
  },
  {
    nev: 'OpenStreetMap névkeresés',
    csalad: 'osm',
    ad: ['koordinata'],
    orszagok: () => true,
    megbizhatosag: 'közepes',
    sorrend: 5,
    lekerdez: (palya) => koordOSM(palya),
  },
  {
    nev: 'Wikipédia cikk',
    csalad: 'wikipedia',
    // A Wikidatával rokon, DE más szerkesztők írják, más forrásokból –
    // ezért külön család, és valódi független megerősítést ad.
    ad: ['koordinata', 'alapitas', 'hossz', 'irany'],
    orszagok: () => true,
    megbizhatosag: 'magas',
    sorrend: 6,
    lekerdez: (palya, ctx) => wikipediaCikk(palya, ctx.nyelvek),
  },
  {
    nev: 'Wikidata – üzemeltető szervezet',
    csalad: 'wikidata',
    // A P137 (operator) és P127 (owned by) tulajdonságokból.
    // Az adatbázisban 76 pályánál hiányzik a szervezet.
    ad: ['szervezet', 'uzemelteto_honlap'],
    orszagok: () => true,
    megbizhatosag: 'magas',
    sorrend: 6.5,
    lekerdez: (palya, ctx) => wikidataSzervezet(palya, ctx.nyelvek),
  },
  {
    nev: 'GeoNames',
    csalad: 'geonames',
    // AZ EGYETLEN forrás, ami sem OSM-re, sem Wikidatára nem épül.
    // Több mint száz adatforrást aggregál – valódi független család.
    ad: ['koordinata'],
    orszagok: () => true,
    // Csak akkor fut, ha be van állítva a GEONAMES_USER
    alkalmazhato: () => !!process.env.GEONAMES_USER,
    megbizhatosag: 'magas',
    sorrend: 7,
    lekerdez: (palya, ctx) => koordGeoNames(palya, ctx.orszagKod),
  },
  {
    nev: 'Internet Archive',
    csalad: 'archive',
    // Nem koordinátát ad, hanem GYANÚT: ha egy honlapot évek óta nem
    // archiváltak, valószínű, hogy a pálya megszűnt.
    ad: ['statusz'],
    orszagok: () => true,
    alkalmazhato: (palya) => !!palya.ownSite,
    megbizhatosag: 'közepes',
    sorrend: 8,
    lekerdez: (palya) => statuszArchive(palya),
  },
  {
    nev: 'Szövetségi műszaki adatlap',
    csalad: 'szovetseg',
    // A legmegbízhatóbb forrás a hosszra és az irányra: maga a szövetség.
    // Országonként más HTML, ezért a MUSZAKI_MINTAK táblából dolgozik.
    ad: ['hossz', 'irany', 'talaj', 'celegyenes', 'szelesseg', 'honlap', 'kanyarsugar', 'elozosav'],
    orszagok: (kod) => MUSZAKI_MINTAK.some((m) => m.aktiv !== false && m.orszagok.includes(kod)),
    megbizhatosag: 'magas',
    sorrend: 10.5,
    lekerdez: (palya, ctx) => muszakiSzovetseg(palya, ctx.orszagKod),
  },
  {
    nev: 'LeTrot adatlap (hossz/irány/talaj)',
    csalad: 'szovetseg',
    // Nem koordinátát ad, hanem MŰSZAKI ADATOT: az adatbázisban 273 pályánál
    // hiányzik a hossz és 298-nál az irány – ez a legnagyobb tartalmi hiány.
    ad: ['hossz', 'irany', 'talaj'],
    orszagok: (kod) => kod === 'FRA',
    alkalmazhato: (palya) => /letrot\.com\/hippodromes/.test(palya.note || ''),
    megbizhatosag: 'magas',
    sorrend: 11,
    lekerdez: (palya) => letrotAdatlap(palya),
  },
  {
    nev: 'Ausztrál állami szövetségek (VIC + NSW)',
    csalad: 'szovetseg',
    ad: ['szervezet'],
    orszagok: (kod) => kod === 'AUS',
    megbizhatosag: 'magas',
    sorrend: 11.5,
    lekerdez: async (palya) => {
      const vic = await thetrotsAdatlap(palya);
      if (vic && vic.org) return vic;
      await varj(CONFIG.delayMs);
      return hrnswAdatlap(palya);
    },
  },
  {
    nev: 'Harness Racing Victoria – cím alapján',
    csalad: 'osm',
    // A koordinátát a Nominatim adja, DE a címet a szövetség –
    // ezért pontosabb, mint egy puszta névkeresés.
    ad: ['koordinata'],
    orszagok: (kod) => kod === 'AUS',
    megbizhatosag: 'magas',
    sorrend: 2.7,
    lekerdez: (palya, ctx) => koordThetrots(palya, ctx.orszagKod),
  },
  {
    nev: 'Wikimedia Commons (hely szerint)',
    csalad: 'commons',
    // Nem névre keres, hanem KOORDINÁTÁRA – ezért működik ott is,
    // ahol a névkeresés csődöt mondott.
    ad: ['kep'],
    orszagok: () => true,
    alkalmazhato: (palya) => palya.lat != null && palya.lng != null,
    megbizhatosag: 'közepes',
    sorrend: 9,
    lekerdez: (palya) => kepCommons(palya),
  },
];

/**
 * Lekérdezi az összes olyan forrást, ami a kért adatot tudja szolgáltatni.
 *
 * @param {string} mit  – pl. 'koordinata'
 */
async function forrasokLekerdezese(mit, palya, ctx) {
  const alkalmas = FORRASOK
    .filter((f) => f.ad.includes(mit))
    .filter((f) => f.orszagok(ctx.orszagKod))
    .filter((f) => !f.alkalmazhato || f.alkalmazhato(palya))
    .sort((a, b) => (a.sorrend ?? 99) - (b.sorrend ?? 99));

  const talalatok = [];
  for (const f of alkalmas) {
    try {
      const eredmeny = await f.lekerdez(palya, ctx);
      if (eredmeny) {
        // A forrás saját mezői elsőbbséget élveznek, de a nyilvántartásból
        // pótoljuk, amit nem adott meg
        talalatok.push({
          csalad: f.csalad,
          megbizhatosag: f.megbizhatosag,
          ...eredmeny,
        });
      }
    } catch (e) {
      // Egy forrás hibája NEM állíthatja meg a többit
      if (ctx.reszletes) console.log(`      (${f.nev} hiba: ${e.message})`);
    }
    await varj(CONFIG.delayMs);
  }
  return talalatok;
}

/**
 * Induláskor kiírja, mely források aktívak – és ami fontosabb,
 * MELYEK MARADNAK KI ÉS MIÉRT.
 *
 * Enélkül egy kikapcsolt forrás némán hiányzik, és a gyengébb
 * eredményt könnyű az adatokra fogni a beállítás helyett.
 */
function forrasAllapotKiiras() {
  const aktiv = [];
  const kimarad = [];

  for (const f of FORRASOK) {
    // A globális (nem pályafüggő) előfeltételeket nézzük
    if (f.nev === 'GeoNames' && !process.env.GEONAMES_USER) {
      kimarad.push([f.nev, 'nincs GEONAMES_USER beállítva – lásd HASZNALAT.md']);
      continue;
    }
    aktiv.push(f);
  }

  const csaladok = new Set(aktiv.map((f) => f.csalad));
  console.log(`Források: ${aktiv.length} aktív, ${csaladok.size} független családban`);
  if (kimarad.length) {
    for (const [nev, ok] of kimarad) {
      console.log(`  KIMARAD: ${nev} – ${ok}`);
    }
    console.log('  (Ettől még minden működik, csak eggyel kevesebb független megerősítés.)');
  }
  console.log('');
}

async function koordinataGyujtes(palya, orszagKod, nyelvek) {
  // A forrásokat a nyilvántartás kezeli – itt már nincs kézi bekötés.
  const talalatok = await forrasokLekerdezese('koordinata', palya, { orszagKod, nyelvek });
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
  // FONTOS: a [^a-z0-9] szűrő a CIRILL, GÖRÖG és egyéb nem latin betűket
  // is kidobta, így a "Центральный Московский ипподром" ÜRES kulcsot adott.
  // Emiatt a duplikáció-védelem sem működött: a moszkvai, omszki és kijevi
  // pálya másodszor is jelöltként jött vissza, pedig már bent volt.
  // A \p{L} (bármely betű) és \p{N} (bármely szám) Unicode-osztályokkal
  // minden írásrendszer működik.
  return String(nev || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(ALTALANOS_SZAVAK, ' ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
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

/* ============================================================
   FELFEDEZŐ MÓD (--discover)
   ------------------------------------------------------------
   MIRE VALÓ: van, hogy egy ország pályalistáját nem tudjuk
   megszerezni – az ausztrál harness.org.au például botvédelemmel
   blokkol. Ilyenkor a Wikidata felől közelítünk: egyetlen
   SPARQL-lekérdezéssel megkérdezzük, milyen ügetőpályákat ismer
   az adott országban – NÉVVEL ÉS KOORDINÁTÁVAL együtt.

   MIT NEM CSINÁL: ez NEM helyettesíti a szövetségi listát.
   A Wikidata hiányos lehet, és bárki szerkesztheti. A találatok
   jelöltek, amiket ugyanúgy ellenőrizni kell.
   ============================================================ */

// Az országnevet a lekérdezésben angol címkével kötjük, hogy ne
// kelljen Wikidata-azonosítókat (Q-számokat) fejből tudni.
const ORSZAG_ANGOL_NEV = {
  AUS: 'Australia', NZL: 'New Zealand', USA: 'United States',
  CAN: 'Canada', FRA: 'France', ITA: 'Italy', DEU: 'Germany',
  SWE: 'Sweden', NOR: 'Norway', FIN: 'Finland', DNK: 'Denmark',
  GBR: 'United Kingdom', IRL: 'Ireland', NLD: 'Netherlands',
  BEL: 'Belgium', AUT: 'Austria', CHE: 'Switzerland', ESP: 'Spain',
  PRT: 'Portugal', POL: 'Poland', CZE: 'Czech Republic', SVK: 'Slovakia',
  HUN: 'Hungary', SVN: 'Slovenia', SRB: 'Serbia', EST: 'Estonia',
  LVA: 'Latvia', LTU: 'Lithuania', RUS: 'Russia', UKR: 'Ukraine',
  MLT: 'Malta',
};

// Ezekre a szavakra szűrünk a Wikidata leírásában/címkéjében.
// Szándékosan bő, mert országonként más az elnevezés.
const UGETO_KULCSSZAVAK = [
  'harness racing', 'harness race', 'trotting', 'paceway',
  'standardbred', 'hippodrome', 'ippodromo', 'travbana', 'ravirata',
  'trabrennbahn', 'hipodrom',
];

async function wikidataFelfedezes(orszagKod) {
  const orszagNev = ORSZAG_ANGOL_NEV[orszagKod];
  if (!orszagNev) {
    throw new Error(`Nem ismerem az országkód angol nevét: ${orszagKod}. `
      + 'Vedd fel az ORSZAG_ANGOL_NEV táblába.');
  }

  // FONTOS TANULSÁG: az első változat "minden objektum ebben az országban,
  // aminek van koordinátája" halmazból indult, és CSAK UTÁNA szűrt szövegre.
  // Ez milliós nagyságrend – a Wikidata 60 másodperc után megszakítja,
  // és a lekérdezés némán nulla eredményt adott.
  //
  // Ehelyett a SPORTÁG (P641) felől indulunk, ami nagyon szelektív:
  // előbb megkeressük a "harness racing" / "horse racing" sportágakat,
  // és csak az ezekhez kötött helyszíneket nézzük.
  const query = `
    SELECT DISTINCT ?item ?itemLabel ?coord ?leiras ?honlap ?alapitas WHERE {
      # 1) a releváns sportágak (szelektív halmaz, néhány elem)
      ?sport rdfs:label ?sportNev .
      FILTER(LANG(?sportNev) = "en")
      FILTER(CONTAINS(LCASE(?sportNev), "harness racing")
          || CONTAINS(LCASE(?sportNev), "horse racing")
          || CONTAINS(LCASE(?sportNev), "trotting"))

      # 2) csak az ezekhez a sportágakhoz kötött helyszínek
      ?item wdt:P641 ?sport ;
            wdt:P17 ?orszag ;
            wdt:P625 ?coord .
      ?orszag rdfs:label "${orszagNev}"@en .

      OPTIONAL { ?item schema:description ?leiras . FILTER(LANG(?leiras) = "en") }
      OPTIONAL { ?item wdt:P856 ?honlap }
      OPTIONAL { ?item wdt:P571 ?alapitas }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT 400`;

  const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query);
  const v = await keres(url, { headers: { Accept: 'application/sparql-results+json' } });
  if (!v.ok) throw new Error(`Wikidata SPARQL hiba: HTTP ${v.status}`);
  const adat = await v.json();

  return (adat.results?.bindings || []).map((b) => {
    // a koordináta "Point(hosszúság szélesség)" alakban jön
    const m = /Point\(([-\d.]+)\s+([-\d.]+)\)/.exec(b.coord?.value || '');
    return {
      qid: (b.item?.value || '').split('/').pop(),
      name: b.itemLabel?.value || null,
      leiras: b.leiras?.value || null,
      lng: m ? parseFloat(m[1]) : null,
      lat: m ? parseFloat(m[2]) : null,
      ownSite: b.honlap?.value || null,
      founded: b.alapitas?.value ? parseInt(String(b.alapitas.value).slice(0, 4), 10) : null,
      honnan: 'Wikidata',
    };
  }).filter((x) => x.lat != null);
}

/**
 * Felfedező mód főprogramja: node verify.mjs --discover AUS
 *
 * Összeveti a Wikidata találatait a saját adatbázisunkkal, és külön
 * listázza, ami NÁLUNK MÉG NINCS MEG.
 */
/**
 * A felfedezés találatainak osztályozása.
 *
 * TANULSÁG AZ ELSŐ ÉLES FUTÁSBÓL: az OSM `sport=horse_racing` címke
 * NEM különbözteti meg az ügetőt a galopptól, és a Wikidata "horse racing
 * venue" leírása sem. A 108 találatból csak 22 volt valóban ügetőpálya:
 *   - 23 galopp-pálya (Leopardstown, Curragh, Ellerslie, Riccarton...)
 *   - 24 lovasklub vagy edzőpálya (Circolo Ippico, Reitbahn, jízdárna...)
 *   - a többi névtelen vagy azonosíthatatlan
 *
 * Ezért a nyers találatot MINDIG osztályozni kell, mielőtt jelöltlistára
 * kerül. Egy galopp-pálya felvétele ügetőpályaként rosszabb, mint a hiány.
 */
const UGETO_JELZO = /harness|trotting|trabrenn|paceway|raceway|harddraver|draf|travbana|travbane|ravirata|kasač|ügető|rysak|klusák|\btrav\b/i;
const GALOPP_JELZO = /galopp|galop|steeplechase|jockey|thoroughbred|flat racing/i;
const NEM_VERSENYPALYA = /circolo ippico|\basd\b|reitbahn|reitplatz|ovalbahn|jezdeck|jízdárna|parkur|stajnia|rancho|farma|tor treningowy|tor konny|bieżnia|oefenbaan|galoppatoio|pista equestre|tondino|stado ogierów|turistick|equine|speedway|riding (club|school|arena)|manege/i;

// VERSENYEK, nem versenypályák.
//
// TANULSÁG AZ ÉLES FUTÁSBÓL: az ausztrál felfedezés hat találatából négy
// VERSENY volt, nem pálya – "Melbourne Cup", "Victoria Derby", "Crown Oaks",
// "Champions Stakes". Mind ugyanazt a koordinátát adta (Flemington), mert a
// Wikidata a helyszínt köti hozzájuk. Ha bekerülnének, négy azonos helyen
// álló, nem létező "pálya" jelenne meg a térképen.
const VERSENY_NEV = /\b(cup|derby|oaks|stakes|classic|trophy|prix|preis|pokal|memorial|championship|grand national|gold cup)\b/i;

function felfedezesOsztalyoz(talalat) {
  const nev = talalat.name || '';
  const leiras = talalat.leiras || '';
  const szoveg = `${nev} ${leiras}`;

  if (!nev || /^Q\d+$/.test(nev.trim())) {
    return { kategoria: 'nevtelen', indok: 'Nincs használható név (csak azonosító).' };
  }
  if (NEM_VERSENYPALYA.test(nev)) {
    return { kategoria: 'nem-versenypalya', indok: 'Lovasklub, edzőpálya vagy manézs – nem versenypálya.' };
  }
  if (VERSENY_NEV.test(nev)) {
    return { kategoria: 'verseny', indok: 'Ez egy VERSENY neve, nem pályáé (a Wikidata a helyszínt köti hozzá).' };
  }
  if (GALOPP_JELZO.test(szoveg)) {
    return { kategoria: 'galopp', indok: 'Galopp-pályára utaló jelzés.' };
  }
  if (UGETO_JELZO.test(szoveg)) {
    return { kategoria: 'ugeto', indok: 'Ügetőre utaló jelzés a névben vagy leírásban.' };
  }
  // Általános név ("Ippodromo", "Racecourse") – lehet bármi
  return { kategoria: 'bizonytalan', indok: 'Nincs egyértelmű jelzés – kézi ellenőrzés kell.' };
}

async function felfedezoMod(db, orszagok) {
  console.log('FELFEDEZŐ MÓD\n');
  console.log('A Wikidatától kérdezzük meg, milyen ügetőpályákat ismer az adott');
  console.log('országban. Hasznos ott, ahol a szövetségi lista nem elérhető.\n');

  const mind = [];
  for (const orszag of orszagok) {
    process.stdout.write(`${orszag} ... `);

    // FONTOS: a két forrást KÜLÖN kezeljük. A korábbi változatban egy
    // Wikidata-hiba "continue"-val átugrotta az EGÉSZ országot, így az
    // Overpass sem futott le – pedig az önállóan is működik.
    let talalatok = [];
    try {
      talalatok = await wikidataFelfedezes(orszag);
    } catch (e) {
      console.log(`(Wikidata hiba: ${e.message}) `);
    }
    await varj(CONFIG.delayMs);

    // Az Overpass-szal is megkérdezzük: mit ismer a feltérképezett OSM-adat?
    // Ez az ausztrál helyzet megoldása – nem kell névlista a szövetségtől.
    const osmTalalatok = await overpassFelfedezes(orszag);
    await varj(CONFIG.delayMs);

    // Összefésülés: ha ugyanaz a pálya mindkettőben megvan, egyszer szerepeljen
    for (const o of osmTalalatok) {
      const mar = talalatok.some((w) => tavolsag(w.lat, w.lng, o.lat, o.lng) < 1);
      if (!mar) talalatok.push(o);
    }

    const meglevo = db[orszag] || [];
    // Osztályozás: a galopp-pályákat és a lovasklubokat kiszűrjük
    for (const t of talalatok) Object.assign(t, felfedezesOsztalyoz(t));
    const ujak = talalatok.filter((t) => !marAdatbazisban(t, meglevo));
    console.log(`${talalatok.length} találat (Wikidata: ${talalatok.length - osmTalalatok.length}, OSM: ${osmTalalatok.length}), ebből ${ujak.length} nálunk MÉG NINCS`);
    for (const t of ujak) {
      mind.push({ orszag, ...t });
    }
    await varj(CONFIG.delayMs);
  }

  await fs.mkdir(CONFIG.outDir, { recursive: true });

  // CSV
  const csvSor = (m) => m.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';');
  const sorok = [csvSor(['Kategória', 'Ország', 'Forrás', 'Azonosító', 'Név', 'Leírás', 'lat', 'lng', 'Alapítás', 'Honlap', 'Indoklás'])];
  for (const t of mind) {
    sorok.push(csvSor([t.kategoria || '?', t.orszag, t.honnan || 'Wikidata', t.qid, t.name, t.leiras, t.lat, t.lng, t.founded, t.ownSite, t.indok || '']));
  }
  await fs.writeFile(path.join(CONFIG.outDir, 'felfedezes.csv'), '\uFEFF' + sorok.join('\r\n'), 'utf8');

  // Közvetlenül a jelöltlistába illeszthető formátum
  // CSAK az ügető és a bizonytalan kerül jelöltlistára – a galopp-pályák
  // és a lovasklubok nem valók ebbe az adatbázisba.
  const jeloltek = mind.filter((t) => t.kategoria === 'ugeto' || t.kategoria === 'bizonytalan').map((t) => ({
    countryCode: t.orszag,
    countryCode2: null,
    name: t.name,
    city: null,
    address: null, postalCode: null,
    org: null, ownSite: t.ownSite,
    operatorSite: null, operatorName: null,
    length: null, direction: null, founded: t.founded,
    note: t.leiras ? `Wikidata leírás: ${t.leiras}` : null,
    forras: `${t.honnan || 'Wikidata'} ${t.qid} (felfedező mód, ${new Date().toISOString().slice(0, 10)})`,
    // A felfedezés MAGA adja a koordinátát – de ez EGYETLEN forrás,
    // ezért a koordináta-módnak még meg kell erősítenie.
    felfedezettLat: t.lat, felfedezettLng: t.lng,
  }));
  await fs.writeFile(path.join(CONFIG.outDir, 'felfedezett_jeloltek.json'),
    JSON.stringify(jeloltek, null, 1), 'utf8');

  const kategoriak = mind.reduce((a, t) => { a[t.kategoria] = (a[t.kategoria] || 0) + 1; return a; }, {});
  console.log(`\n=== ${mind.length} olyan találat, ami nálunk még nincs meg ===`);
  console.log('Kategória szerint:');
  for (const [k, v] of Object.entries(kategoriak).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(18)} ${v}`);
  }
  console.log('  (Jelöltlistára csak az "ugeto" és a "bizonytalan" kerül.)');
  console.log();
  for (const t of mind) {
    console.log(`  ${t.orszag}  ${(t.name || '').slice(0, 40).padEnd(40)} ${t.lat?.toFixed(4)}, ${t.lng?.toFixed(4)}`);
  }
  console.log('\nEredmény:');
  console.log('  eredmeny/felfedezes.csv             – áttekintéshez');
  console.log('  eredmeny/felfedezett_jeloltek.json  – az uj_palyak.json-hoz fűzhető');
  console.log('\nFONTOS: a Wikidata EGYETLEN forrás, és bárki szerkesztheti.');
  console.log('A koordinátákat a --coords móddal kell megerősíttetni, mielőtt bekerülnek.');
}

/**
 * ADAT-KIEGÉSZÍTŐ MÓD: node verify.mjs --fill
 *
 * MIÉRT: az adatbázis 344 pályájából 273-nál hiányzik a hossz, 298-nál az
 * irány, 239-nél az alapítási év. Ez a legnagyobb TARTALMI hiány – a
 * koordináták már megvannak, az adatlapok viszont üresek.
 *
 * Ez a mód csak azokat a mezőket keresi, amik ténylegesen hiányoznak,
 * és NEM ír semmit az app.js-be – javaslatot készít emberi jóváhagyásra.
 */
async function kiegeszitoMod(db, orszagok, opciok = {}) {
  console.log('ADAT-KIEGÉSZÍTŐ MÓD\n');
  forrasAllapotKiiras();

  // AZ ADATLAP MINDEN SORA. A sorrend a fontosságot követi: ami az
  // adatlapon feljebb van és többet mond, az kerül előre.
  const MEZOK = [
    ['founded', 'alapitas'],        // Alapítás éve
    ['length', 'hossz'],            // Pálya hossza
    ['direction', 'irany'],         // Haladási irány
    ['org', 'szervezet'],           // Szervezet
    ['ownSite', 'honlap'],          // Pálya honlapja
    ['operatorSite', 'uzemelteto_honlap'], // Üzemeltető honlapja (ha eltér a pálya sajátjától)
    // Nem az adatlapon, de a szakmai értéke nagy:
    ['surface', 'talaj'],
    ['finalStraight', 'celegyenes'],
    ['width', 'szelesseg'],
    ['turnRadius', 'kanyarsugar'],   // csak ott, ahol a forrás közli (jelenleg: AUS, harness.org.au)
    ['openStretch', 'elozosav'],     // ua.
    // KÉZZEL MARADÓ MEZŐK (szándékosan NINCS itt):
    //   operatorName – az org-gal átfedésben van (egyesület vs. felettes
    //     szervezet), a kettő közti választás emberi döntés
    //   trotSince – történeti kutatás, nincs megbízható automatikus forrás
    //   image, status – lásd HASZNALAT.md: vizuális/emberi megerősítés kell
  ];

  const eredmenyek = [];
  let n = 0;
  const feladat = [];

  // A) MÁR BEÉPÍTETT pályák
  if (!opciok.csakUj) {
    for (const orszag of orszagok) {
      for (const p of (db[orszag] || [])) {
        const hianyzo = MEZOK.filter(([mezo]) => p[mezo] == null);
        if (hianyzo.length) feladat.push({ tipus: 'meglévő', orszag, palya: p, hianyzo });
      }
    }
  }

  // B) JELÖLT pályák – ezeknél is ugyanúgy hiányoznak az adatok, sőt
  //    jellemzően többük. Érdemes MÁR A FELVÉTEL ELŐTT összegyűjteni,
  //    hogy ne üres adatlappal kerüljenek be.
  if (opciok.jeloltekIs) {
    let jeloltek = [];
    try {
      jeloltek = await beolvasUjPalyak(CONFIG.ujPalyakPath);
    } catch (e) {
      console.log(`(A jelöltlistát nem sikerült beolvasni: ${e.message})\n`);
    }
    const szuk = orszagok.length && orszagok.length < Object.keys(db).length;
    for (const p of jeloltek) {
      if (szuk && !orszagok.includes(p.countryCode)) continue;
      // Ha időközben már bekerült az adatbázisba, kihagyjuk
      if (marAdatbazisban(p, db[p.countryCode] || [])) continue;
      const hianyzo = MEZOK.filter(([mezo]) => p[mezo] == null);
      if (hianyzo.length) feladat.push({ tipus: 'JELÖLT', orszag: p.countryCode, palya: p, hianyzo });
    }
  }

  const megl = feladat.filter((f) => f.tipus === 'meglévő').length;
  const jel = feladat.filter((f) => f.tipus === 'JELÖLT').length;
  console.log(`${feladat.length} pálya, amelynél hiányzik legalább egy mező`
    + ` (${megl} meglévő, ${jel} jelölt).\n`);

  for (const f of feladat) {
    n++;
    const jelzo = f.tipus === 'JELÖLT' ? '+' : ' ';
    process.stdout.write(`[${String(n).padStart(4)}/${feladat.length}]${jelzo} `
      + `${f.orszag} – ${String(f.palya.name).slice(0, 30).padEnd(32)} `);
    const nyelvek = [...(ORSZAG_NYELV[f.orszag] || []), 'en'];
    const talalt = {};

    for (const [mezo, kepesseg] of f.hianyzo) {
      const t = await forrasokLekerdezese(kepesseg, f.palya, { orszagKod: f.orszag, nyelvek });
      // Csak akkor fogadjuk el, ha legalább egy forrás adott értéket.
      // Ha többen is, és ELTÉRNEK, azt jelezzük – nem választunk.
      const ertekek = t.map((x) => x[mezo]).filter((v) => v != null);
      const egyediek = [...new Set(ertekek)];
      if (egyediek.length === 1) {
        talalt[mezo] = { ertek: egyediek[0], forrasok: t.map((x) => x.forras) };
      } else if (egyediek.length > 1) {
        talalt[mezo] = { ertek: null, utkozes: egyediek, forrasok: t.map((x) => x.forras) };
      }
    }

    const db_talalt = Object.values(talalt).filter((x) => x.ertek != null).length;
    console.log(db_talalt ? `${db_talalt} mező` : 'nincs találat');
    if (Object.keys(talalt).length) {
      eredmenyek.push({ tipus: f.tipus, orszag: f.orszag, palya: f.palya.name, talalt });
    }
  }

  await fs.mkdir(CONFIG.outDir, { recursive: true });
  const csvSor = (m) => m.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';');
  const sorok = [csvSor(['Típus', 'Ország', 'Pálya', 'Mező', 'Javasolt érték', 'Ütközés', 'Források'])];
  for (const e of eredmenyek) {
    for (const [mezo, adat] of Object.entries(e.talalt)) {
      sorok.push(csvSor([e.tipus, e.orszag, e.palya, mezo, adat.ertek ?? '',
        adat.utkozes ? adat.utkozes.join(' / ') : '', (adat.forrasok || []).join(' | ')]));
    }
  }
  await fs.writeFile(path.join(CONFIG.outDir, 'kiegeszites.csv'), '\uFEFF' + sorok.join('\r\n'), 'utf8');
  await fs.writeFile(path.join(CONFIG.outDir, 'kiegeszites.json'),
    JSON.stringify(eredmenyek, null, 1), 'utf8');

  const talaltDb = eredmenyek.reduce((a, e) =>
    a + Object.values(e.talalt).filter((x) => x.ertek != null).length, 0);
  const utkozes = eredmenyek.reduce((a, e) =>
    a + Object.values(e.talalt).filter((x) => x.utkozes).length, 0);
  console.log(`\n=== ${talaltDb} kitölthető mező, ${utkozes} ütközés ===`);
  console.log('Eredmény: eredmeny/kiegeszites.csv');
  console.log('\nFONTOS: a szkript SEMMIT nem írt az app.js-be.');
}

/* ============================================================
   JAVASLAT-ELLENŐRZŐ MÓD: node verify.mjs --javaslatok
   ------------------------------------------------------------
   MIRE VALÓ: a racecourse360.docx 363 rekordjából 817 olyan
   adatelem jött ki, amit be lehetne emelni az adatbázisba.
   De a docx bizonyítottan tartalmaz hibát (kitalált URL-ek,
   az egyesület alapítása a pálya megnyitása helyett, rossz
   irány az Åmålnál), ezért vakon nem vehető át semmi.

   AMIT NEM CSINÁLUNK: nem találgatunk arról, melyik érték
   "életszerű". Az 1000 m a skandináv szabvány, a 804 m pedig
   pontosan fél mérföld – ezek NEM gyanús kerek számok, hanem
   valós szabványméretek. A kerekség önmagában semmit nem árul el.

   AMIT CSINÁLUNK: minden javasolt értéket FÜGGETLEN FORRÁSSAL
   vetünk össze, és négy ítélet közül adunk egyet.
   ============================================================ */

async function javaslatEllenorzoMod(db, orszagok) {
  console.log('JAVASLAT-ELLENŐRZŐ MÓD\n');
  forrasAllapotKiiras();

  let javaslatok;
  try {
    const txt = await fs.readFile(CONFIG.javaslatokPath, 'utf8');
    javaslatok = JSON.parse(txt);
  } catch (e) {
    throw new Error(
      `Nem találom a javaslatlistát.\n`
      + `  Keresett útvonal:  ${CONFIG.javaslatokPath}\n`
      + `  Aktuális könyvtár: ${process.cwd()}\n\n`
      + `  Ez a fájl a docx-elemzésből készül, és azt tartalmazza,\n`
      + `  mely mezőket lehetne kitölteni a docx adataiból.`
    );
  }

  const szuk = orszagok.length && orszagok.length < Object.keys(db).length;
  const feladat = javaslatok.filter((x) => !szuk || orszagok.includes(x.countryCode));
  console.log(`${feladat.length} javaslat ellenőrzése.\n`);

  const eredmenyek = [];
  let n = 0;
  for (const jav of feladat) {
    n++;
    process.stdout.write(`[${String(n).padStart(4)}/${feladat.length}] `
      + `${jav.countryCode} ${jav.name.slice(0, 26).padEnd(28)} ${jav.mezo.padEnd(10)} `);

    const nyelvek = [...(ORSZAG_NYELV[jav.countryCode] || []), 'en'];
    let itelet, indok, forrasok = [];

    // --- HONLAP: nem forrásból ellenőrizzük, hanem MEGNYITJUK ---
    if (jav.mezo === 'ownSite') {
      const allapot = await linkEllenorzes(jav.javasolt);
      forrasok = ['közvetlen HTTP-ellenőrzés'];
      if (allapot.domainNemLetezik) {
        itelet = 'ELVETENDŐ';
        indok = 'A domain NEM LÉTEZIK (DNS-hiba). Ez kitalált vagy régen megszűnt cím.';
      } else if (allapot.gyanus) {
        itelet = 'ELLENŐRIZENDŐ';
        indok = `Idegen domainre irányít át: ${allapot.vegsoUrl}. Lehet, hogy a domain lejárt.`;
      } else if (allapot.statusz === 'el') {
        itelet = 'JÓVÁHAGYHATÓ';
        indok = `A cím él (HTTP ${allapot.httpKod}).`;
      } else {
        itelet = 'ELLENŐRIZENDŐ';
        indok = `Nem tölt be rendesen (${allapot.statusz}${allapot.httpKod ? ', HTTP ' + allapot.httpKod : ''}).`;
      }
    } else {
      // --- A TÖBBI MEZŐ: független forrásokat kérdezünk ---
      const talalatok = await forrasokLekerdezese(jav.kepesseg, jav, {
        orszagKod: jav.countryCode, nyelvek,
      });
      const ertekek = talalatok
        .map((t) => ({ forras: t.forras, csalad: t.csalad, ertek: t[jav.mezo] }))
        .filter((t) => t.ertek != null);
      forrasok = ertekek.map((e) => `${e.forras}: ${e.ertek}`);

      if (ertekek.length === 0) {
        itelet = 'MEGERŐSÍTETLEN';
        indok = 'Egyetlen független forrás sem adott értéket erre a mezőre. '
              + 'Ez NEM jelenti, hogy a javaslat hibás – csak azt, hogy nem tudtuk ellenőrizni.';
      } else {
        // Egyezik-e valamelyik forrás a javaslattal?
        const egyezik = ertekek.filter((e) => ertekekEgyeznek(jav.mezo, e.ertek, jav.javasolt));
        const eltero = ertekek.filter((e) => !ertekekEgyeznek(jav.mezo, e.ertek, jav.javasolt));

        if (egyezik.length > 0 && eltero.length === 0) {
          itelet = 'JÓVÁHAGYHATÓ';
          indok = `${egyezik.length} független forrás megerősíti.`;
        } else if (egyezik.length > 0) {
          itelet = 'ELLENŐRIZENDŐ';
          indok = `${egyezik.length} forrás megerősíti, de ${eltero.length} MÁST mond `
                + `(${eltero.map((e) => e.ertek).join(', ')}). Emberi döntés kell.`;
        } else {
          itelet = 'ELVETENDŐ';
          indok = `Minden forrás mást mond: ${eltero.map((e) => e.ertek).join(', ')}. `
                + 'A javasolt érték valószínűleg hibás.';
        }
      }
    }

    eredmenyek.push({ ...jav, itelet, indok, forrasok });
    console.log(itelet);
  }

  await fs.mkdir(CONFIG.outDir, { recursive: true });
  const csvSor = (m) => m.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';');
  const rang = { 'ELVETENDŐ': 0, 'ELLENŐRIZENDŐ': 1, 'JÓVÁHAGYHATÓ': 2, 'MEGERŐSÍTETLEN': 3 };
  const sorok = [csvSor(['Ítélet', 'Típus', 'Ország', 'Pálya', 'Mező',
    'Jelenlegi érték', 'Javasolt érték', 'Források', 'Indoklás'])];
  for (const e of [...eredmenyek].sort((a, b) => (rang[a.itelet] ?? 9) - (rang[b.itelet] ?? 9))) {
    sorok.push(csvSor([e.itelet, e.tipus, e.countryCode, e.name, e.mezo,
      e.jelenlegi ?? '(üres)', e.javasolt, (e.forrasok || []).join(' | '), e.indok]));
  }
  await fs.writeFile(path.join(CONFIG.outDir, 'javaslat_ellenorzes.csv'),
    '\uFEFF' + sorok.join('\r\n'), 'utf8');
  await fs.writeFile(path.join(CONFIG.outDir, 'javaslat_ellenorzes.json'),
    JSON.stringify(eredmenyek, null, 1), 'utf8');

  const szam = eredmenyek.reduce((a, e) => { a[e.itelet] = (a[e.itelet] || 0) + 1; return a; }, {});
  console.log('\n=== ÖSSZEGZÉS ===');
  for (const k of ['JÓVÁHAGYHATÓ', 'ELLENŐRIZENDŐ', 'ELVETENDŐ', 'MEGERŐSÍTETLEN']) {
    if (szam[k]) console.log(`  ${k.padEnd(16)} ${szam[k]}`);
  }
  console.log('\nEredmény: eredmeny/javaslat_ellenorzes.csv');
  console.log('\nFONTOS: a szkript SEMMIT nem írt az app.js-be.');
  console.log('A "JÓVÁHAGYHATÓ" tételek is emberi jóváhagyást igényelnek.');
}

/**
 * Két érték egyezik-e? Mezőnként más a tűrés.
 *
 * A hossznál 2% eltérés belefér: a források néha kerekítenek
 * (1006 m és 1005 m ugyanaz az öt-nyolcad mérföldes pálya),
 * és a hitelesített hossz is változhat felújítás után.
 */
function ertekekEgyeznek(mezo, a, b) {
  if (a == null || b == null) return false;
  if (mezo === 'length') {
    // 2% tűrés. VÁLLALT KOMPROMISSZUM: ezzel az 1000 m (skandináv szabvány)
    // és az 1006 m (öt-nyolcad mérföld) egyezőnek számít, pedig elvben két
    // külön szabvány. A gyakorlatban viszont a források ugyanazt a pályát
    // is írják 1000-nek és 1006-nak – szigorúbb tűréssel az 1609/1600
    // (egy mérföld, kétféle kerekítés) is elbukna, ami rosszabb lenne.
    // Aki szigorítani akar, itt állítsa 0.005-re.
    const x = Number(a), y = Number(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    return Math.abs(x - y) / Math.max(x, y) <= 0.02;
  }
  if (mezo === 'founded') return Number(a) === Number(b);
  if (mezo === 'surface') {
    // "Homok", "Sandbahn", "Dirt" – ugyanaz háromféleképpen.
    // A toldalékokat (Sand-BAHN, sand-track) le kell vágni, különben a
    // "Sandbahn" nem egyezne a "Homok"-kal, pedig ugyanaz.
    const norm = (v) => {
      let x = String(v).toLowerCase()
        .replace(/bahn|track|piste|pálya|palya|felület|felulet/g, ' ');
      if (/homok|sand|dirt|sable|sabbia|arena/.test(x)) return 'homok';
      if (/fű|fu\b|grass|gras|trava|gazon|erba|herbe/.test(x)) return 'fu';
      if (/zúzalék|zuzalek|rizl|kavics|gravel|schotter/.test(x)) return 'zuzalek';
      if (/salak|cinder|mâchefer|machefer|cendr/.test(x)) return 'salak';
      return x.replace(/[^a-z]/g, '');
    };
    return norm(a) === norm(b);
  }
  return String(a).toLowerCase() === String(b).toLowerCase();
}

async function koordinataMod(db, orszagok, opciok = {}) {
  console.log('KOORDINÁTA-MÓD\n');
  forrasAllapotKiiras();
  console.log('Több forrásból gyűjt, majd összeveti őket. Csak akkor javasol értéket,');
  console.log('ha legalább KÉT KÜLÖNBÖZŐ CSALÁDBÓL származó forrás egyetért 1 km-en belül.\n');

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
  const felfedez = argv.includes('--discover');
  const kiegeszit = argv.includes('--fill');
  const javaslatok = argv.includes('--javaslatok');
  const ujPalyakKert = argv.includes('--new');
  const csakUj = argv.includes('--only-new');
  const orszagSzuro = argv.filter((a) => !a.startsWith('--')).map((a) => a.toUpperCase());

  console.log('Racecourse360 – adatellenőrzés indul\n');

  const db = await beolvasAdatbazis();
  const orszagok = orszagSzuro.length ? orszagSzuro : Object.keys(db);

  // Felfedező mód: a Wikidatától kérdezzük, milyen pályákat ismer
  if (felfedez) {
    await felfedezoMod(db, orszagok);
    return;
  }

  // Adat-kiegészítő mód: a hiányzó hossz/irány/talaj/alapítás keresése
  if (kiegeszit) {
    await kiegeszitoMod(db, orszagok, {
      // --new  → a jelölt pályákat is nézze
      // --only-new → CSAK a jelölteket
      jeloltekIs: ujPalyakKert || csakUj,
      csakUj,
    });
    return;
  }

  // Javaslat-ellenőrző mód: a docx-ből jövő adatok hitelesítése
  if (javaslatok) {
    await javaslatEllenorzoMod(db, orszagok);
    return;
  }

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
