#!/usr/bin/env node
/* ============================================================
   statusz.mjs — pályastátusz ellenőrzése több forráscsaládból
   ------------------------------------------------------------
   MIT CSINÁL ÉS MIT NEM

   Csinál: bizonyítékot gyűjt arról, hogy egy pálya szerepelt-e
   versenynaptárban, mit ír róla a saját honlapja, a Wikidata és
   az OpenStreetMap. Ezekből JAVASLATOT ad és munkalistát ír.

   NEM csinál: nem írja át a trackDatabase-t. A hiányzás ugyanis
   NEM bizonyítja a bezárást – egy pálya kimaradhat idényen kívül,
   felújítás alatt, vagy mert évente egyszer versenyeznek rajta.

   ------------------------------------------------------------
   FORRÁSCSALÁDOK — miért öt, és miért pont ezek

   1. SZÖVETSÉG    a hivatalos naptár. Teljes, de nem hibátlan:
                   a bezárt pályák sokáig bennmaradnak a listákban.
   2. FOGADÁS      a fogadóoldalak PONTOSABBAK a versenynapokra,
                   mert náluk pénz múlik rajta. Egy elmaradt
                   versenynap ott azonnal hiba.
   3. ENCIKLOPÉDIA Wikidata + Wikipédia. Itt van a bezárás DÁTUMA,
                   amit a szövetségi oldal ritkán közöl.
   4. TÉRKÉP       OpenStreetMap. Egy lebontott pálya innen eltűnik
                   vagy átcímkéződik – erős fizikai jelzés.
   5. SAJÁT HONLAP a pálya-adatlapon már tárolt ownSite. Ha a
                   domain halott, az önmagában beszédes.

   A cél nem a források SZÁMA, hanem a FÜGGETLENSÉGE: nyolc
   szövetségi oldal egymástól veszi át az adatot, tehát egyetlen
   megerősítésnek számít.

   ------------------------------------------------------------
   ROBOTS.TXT: minden tartománynál lekérdezzük és betartjuk. Ha
   nem elérhető, azt NEM tekintjük engedélynek.

   Használat:
     node tools/statusz.mjs --orszag AUS
     node tools/statusz.mjs --orszag AUS --limit 5
     node tools/statusz.mjs --orszag AUS --honapok 6
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GYOKER = path.resolve(__dirname, '..');
const APP_JS = path.join(GYOKER, 'js', 'app.js');

const AZONOSITO =
    'Racecourse360-StatusCheck/1.0 (+https://racecourse360.com; info@racecourse360.com)';

const SZUNET_MP = 2.0;
const GYANUS_HONAP = 12;
const IDOKORLAT_MP = 25;
const SAJAT_HONLAP_MAX = 60;

/* ============================================================
   FORRÁSOK
   ------------------------------------------------------------
   tipus:
     'lista'    – egy oldal, amin SOK pálya szerepel. Egyszer
                  töltjük le, és minden pályanevet keresünk benne.
     'sparql'   – Wikidata lekérdezés (JSON).
     'overpass' – OpenStreetMap lekérdezés (JSON).
   ============================================================ */

/** Az elmúlt N hónap havi eredményoldalai. Ez a fő jelzés. */
function haviNaptarak(honapok) {
    const ki = [];
    const most = new Date();
    for (let i = 0; i < honapok; i++) {
        const d = new Date(most.getFullYear(), most.getMonth() - i, 1);
        const ho = String(d.getMonth() + 1).padStart(2, '0');
        const ev = d.getFullYear();
        ki.push({
            nev: `HRA eredmények ${ev}-${ho}`,
            csalad: 'szovetseg',
            tipus: 'lista',
            datum: d,
            url: `https://natsite.harness.org.au/racing/results/` +
                 `?month=${ho}&year=${ev}&state=all&search_type=monthly&activeTab=tab`
        });
    }
    return ki;
}

const FORRASOK = {
    AUS: (honapok) => [
        /* --- 1. SZÖVETSÉG --- */
        ...haviNaptarak(honapok),
        { nev: 'HRA pályajegyzék', csalad: 'szovetseg', tipus: 'lista',
          url: 'https://natsite.harness.org.au/racing/tracks/' },
        { nev: 'HRA versenynaptár', csalad: 'szovetseg', tipus: 'lista',
          url: 'https://natsite.harness.org.au/racing/meeting-calendar/' },

        /* --- Állami szövetségek: KÜLÖN CSALÁD, mert saját naptárat
               vezetnek, és néha pontosabbak a helyi eseményekben --- */
        { nev: 'Harness Racing NSW', csalad: 'allami', tipus: 'lista',
          url: 'https://www.hrnsw.com.au/' },
        { nev: 'Racing Queensland', csalad: 'allami', tipus: 'lista',
          url: 'https://www.racingqueensland.com.au/racing' },
        { nev: 'Tasracing', csalad: 'allami', tipus: 'lista',
          url: 'https://tasracing.com.au/' },
        { nev: 'SA Harness', csalad: 'allami', tipus: 'lista',
          url: 'https://satrots.com.au/' },

        /* --- 2. FOGADÁS ---
               Pontosabb a versenynapokra, mert náluk pénz múlik
               rajta. Több szolgáltató, mert egyik-másik blokkolhat. */
        { nev: 'Punters.com.au', csalad: 'fogadas', tipus: 'lista',
          url: 'https://www.punters.com.au/form-guide/harness/' },
        { nev: 'Racenet harness', csalad: 'fogadas', tipus: 'lista',
          url: 'https://www.racenet.com.au/harness-racing' },
        { nev: 'OffTrackBetting', csalad: 'fogadas', tipus: 'lista',
          url: 'https://www.offtrackbetting.com/results/460/australia-harness-(1).html' },
        { nev: 'TAB harness', csalad: 'fogadas', tipus: 'lista',
          url: 'https://www.tab.com.au/racing/meetings/today/H' },

        /* --- 3. ENCIKLOPÉDIA --- */
        { nev: 'Wikipédia (AUS ügető)', csalad: 'enciklopedia', tipus: 'lista',
          url: 'https://en.wikipedia.org/wiki/Harness_racing_in_Australia' },
        { nev: 'Wikidata', csalad: 'enciklopedia', tipus: 'sparql', orszagQ: 'Q408' },

        /* --- 4. TÉRKÉP --- */
        { nev: 'OpenStreetMap', csalad: 'terkep', tipus: 'overpass', orszagKod: 'AU' }
    ]
};

/* ============================================================
   ROBOTS.TXT
   ============================================================ */

const robotsGyorsitotar = new Map();

async function robotsEngedi(url) {
    const u = new URL(url);
    const kulcs = u.origin;
    if (!robotsGyorsitotar.has(kulcs)) {
        try {
            const v = await keres(kulcs + '/robots.txt');
            robotsGyorsitotar.set(kulcs,
                v.ok ? robotsErtelmez(await v.text()) : { hiba: true, tiltott: [] });
        } catch (e) {
            robotsGyorsitotar.set(kulcs, { hiba: true, tiltott: [] });
        }
    }
    const r = robotsGyorsitotar.get(kulcs);
    if (r.hiba) return { engedi: false, ok: 'robots.txt nem érhető el' };
    const ut = u.pathname;
    for (const tilt of r.tiltott) {
        if (tilt === '/') return { engedi: false, ok: 'teljes tiltás' };
        if (tilt && ut.startsWith(tilt)) return { engedi: false, ok: `tiltva: ${tilt}` };
    }
    return { engedi: true };
}

function robotsErtelmez(szoveg) {
    const tiltott = [];
    let rank = false;
    for (const nyers of szoveg.split(/\r?\n/)) {
        const sor = nyers.replace(/#.*$/, '').trim();
        const k = sor.indexOf(':');
        if (k < 0) continue;
        const kulcs = sor.slice(0, k).trim().toLowerCase();
        const ertek = sor.slice(k + 1).trim();
        if (kulcs === 'user-agent') {
            const ua = ertek.toLowerCase();
            rank = (ua === '*' || AZONOSITO.toLowerCase().includes(ua));
        } else if (kulcs === 'disallow' && rank && ertek) {
            tiltott.push(ertek);
        }
    }
    return { hiba: false, tiltott };
}

/* ============================================================
   HÁLÓZAT
   ============================================================ */

const var_ = (mp) => new Promise(r => setTimeout(r, mp * 1000));

async function keres(url, opciok = {}) {
    const ctrl = new AbortController();
    const ora = setTimeout(() => ctrl.abort(), IDOKORLAT_MP * 1000);
    try {
        return await fetch(url, {
            headers: {
                'User-Agent': AZONOSITO,
                'Accept': opciok.json ? 'application/json' : 'text/html,application/json',
                ...(opciok.fejlec || {})
            },
            method: opciok.method || 'GET',
            body: opciok.body,
            signal: ctrl.signal,
            redirect: 'follow'
        });
    } finally {
        clearTimeout(ora);
    }
}

function szovegge(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ');
}

/* ============================================================
   KÜLÖNLEGES FORRÁSOK
   ============================================================ */

/**
 * WIKIDATA — itt van a bezárás DÁTUMA (P576), amit a szövetségi
 * oldalak ritkán közölnek. Egyszer fut, és az ország ÖSSZES
 * ügetőpályáját hozza – nem pályánként kérdezünk.
 */
async function wikidataLekerdez(orszagQ, naplo) {
    const sparql = `
SELECT ?palya ?palyaLabel ?nyitas ?bezaras WHERE {
  ?palya wdt:P31/wdt:P279* wd:Q1777138 .
  ?palya wdt:P17 wd:${orszagQ} .
  OPTIONAL { ?palya wdt:P571 ?nyitas . }
  OPTIONAL { ?palya wdt:P576 ?bezaras . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`.trim();

    const url = 'https://query.wikidata.org/sparql?format=json&query=' +
        encodeURIComponent(sparql);
    try {
        const v = await keres(url, { json: true });
        if (!v.ok) { naplo.push(`  HIBA ${v.status}: Wikidata`); return null; }
        const j = await v.json();
        const sorok = (j.results?.bindings || []).map(b => ({
            nev: b.palyaLabel?.value || '',
            nyitas: b.nyitas?.value?.slice(0, 10) || null,
            bezaras: b.bezaras?.value?.slice(0, 10) || null
        })).filter(x => x.nev);
        naplo.push(`  OK (${sorok.length} tétel): Wikidata`);
        return sorok;
    } catch (e) {
        naplo.push(`  HIBA: Wikidata – ${e.message.slice(0, 50)}`);
        return null;
    }
}

/**
 * OPENSTREETMAP — egy lebontott pálya innen eltűnik vagy
 * átcímkéződik. FIZIKAI jelzés, független a nyilvántartástól.
 *
 * Országhatár szerint kérdezünk (ISO3166-1), nem regionális
 * szerverről: a regionális szerverek korábban rossz országhoz
 * tartozó objektumokat adtak vissza.
 */
async function overpassLekerdez(orszagKod, naplo) {
    const q = `
[out:json][timeout:90];
area["ISO3166-1"="${orszagKod}"][admin_level=2]->.a;
(
  nwr["leisure"="track"]["sport"~"horse_racing|harness_racing"](area.a);
  nwr["name"~"[Pp]aceway|[Tt]rotting|[Hh]arness"](area.a);
);
out center tags;`.trim();

    try {
        const v = await keres('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: 'data=' + encodeURIComponent(q),
            fejlec: { 'Content-Type': 'application/x-www-form-urlencoded' },
            json: true
        });
        if (!v.ok) { naplo.push(`  HIBA ${v.status}: OpenStreetMap`); return null; }
        const j = await v.json();
        const elemek = (j.elements || []).map(e => ({
            nev: e.tags?.name || '',
            /* A disused: és abandoned: előtag az OSM-ben azt jelenti,
               hogy az objektum megvan, de már nem használják. */
            elhagyott: Object.keys(e.tags || {}).some(k =>
                k.startsWith('disused') || k.startsWith('abandoned'))
        })).filter(e => e.nev);
        naplo.push(`  OK (${elemek.length} objektum): OpenStreetMap`);
        return elemek;
    } catch (e) {
        naplo.push(`  HIBA: OpenStreetMap – ${e.message.slice(0, 50)}`);
        return null;
    }
}

/** SAJÁT HONLAP — ha a domain halott, az önmagában beszédes. */
async function sajatHonlap(url) {
    try {
        const v = await keres(url);
        if (!v.ok) return { el: false, ok: `HTTP ${v.status}` };
        const szoveg = szovegge(await v.text());
        const ev = new Date().getFullYear();
        return {
            el: true,
            friss: szoveg.includes(String(ev)) || szoveg.includes(String(ev - 1))
        };
    } catch (e) {
        return { el: false, ok: e.message.slice(0, 50) };
    }
}

/* ============================================================
   ADATOK ÉS EGYEZTETÉS
   ============================================================ */

function adatBeolvas() {
    const forras = fs.readFileSync(APP_JS, 'utf8');
    const m = forras.match(/const trackDatabase = (\{[\s\S]*?\n\});/);
    if (!m) throw new Error('A trackDatabase nem olvasható ki az app.js-ből.');
    return vm.runInNewContext('(' + m[1] + ')');
}

const norm = (s) => String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * A pálya azonosítására használható nevek. A naptárak a KLUB
 * rövid nevét írják ("Melton", nem "Melton Entertainment Park"),
 * ezért több változatot próbálunk.
 */
function keresoKulcsok(palya) {
    const k = new Set();
    const nev = String(palya.name || '');
    k.add(norm(nev));
    k.add(norm(nev.replace(/\s*\(.*?\)\s*/g, ' ')));
    k.add(norm(nev.replace(
        /\b(paceway|racecourse|raceway|park|trotting club|harness racing club|race club|racing club|showground[s]?|entertainment)\b/gi, '')));
    k.add(norm(String(palya.city || '').replace(/,\s*[A-Z]{2,3}\s*$/, '')));
    return [...k].filter(x => x.length >= 4);
}

function datumokKornyezetbol(szoveg, kulcs) {
    const datumok = [];
    const re = new RegExp(kulcs.split('').join('\\s*'), 'gi');
    let m, n = 0;
    while ((m = re.exec(szoveg)) !== null && n++ < 40) {
        const k = szoveg.slice(Math.max(0, m.index - 130), m.index + 170);
        const d1 = k.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/);
        const d2 = k.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
        const d3 = k.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
        let d = null;
        if (d2) d = new Date(`${d2[1]}-${d2[2]}-${d2[3]}`);
        else if (d1) d = new Date(`${d1[1]} ${d1[2]} ${d1[3]}`);
        else if (d3) d = new Date(`${d3[3]}-${String(d3[2]).padStart(2,'0')}-${String(d3[1]).padStart(2,'0')}`);
        if (d && !isNaN(d) && d.getFullYear() > 2000) datumok.push(d);
    }
    return datumok;
}

/* A "closed" önmagában megtévesztő ("nominations closed"), ezért
   csak beszédes párosításokat keresünk. */
const BEZARAS_JELEK = [
    'permanently closed', 'no longer race', 'no longer hosts',
    'ceased racing', 'ceased operations', 'last meeting was',
    'closed in 20', 'shut down', 'racing has ended',
    'final meeting', 'defunct', 'no longer operates', 'has been closed'
];

function bezarasJel(szoveg, kulcs) {
    const re = new RegExp(kulcs.split('').join('\\s*'), 'gi');
    let m, n = 0;
    while ((m = re.exec(szoveg)) !== null && n++ < 25) {
        const k = szoveg.slice(Math.max(0, m.index - 220), m.index + 280).toLowerCase();
        for (const jel of BEZARAS_JELEK) if (k.includes(jel)) return jel;
    }
    return null;
}

/* ============================================================
   FŐ FUTÁS
   ============================================================ */

async function futtat(iso, limit, honapok) {
    const trackDatabase = adatBeolvas();
    const palyak = trackDatabase[iso];
    if (!palyak) throw new Error(`Ismeretlen országkód: ${iso}`);
    if (!FORRASOK[iso]) {
        throw new Error(`Nincs forráslista ehhez: ${iso}. Vedd fel a FORRASOK objektumba.`);
    }

    const forrasok = FORRASOK[iso](honapok);
    const naplo = [];
    console.log(`\n${iso}: ${palyak.length} pálya · ${forrasok.length} forrás · ${honapok} hónap\n`);
    console.log('Források letöltése (lassan, a szerverek kímélése miatt)…');

    const listak = [];
    let wikidata = null, osm = null;

    for (const f of forrasok) {
        if (f.tipus === 'sparql') {
            await var_(SZUNET_MP);
            wikidata = await wikidataLekerdez(f.orszagQ, naplo);
            continue;
        }
        if (f.tipus === 'overpass') {
            await var_(SZUNET_MP);
            osm = await overpassLekerdez(f.orszagKod, naplo);
            continue;
        }
        const eng = await robotsEngedi(f.url).catch(() => ({ engedi: false, ok: 'hibás URL' }));
        if (!eng.engedi) { naplo.push(`  KIHAGYVA: ${f.nev} – ${eng.ok}`); continue; }
        await var_(SZUNET_MP);
        try {
            const v = await keres(f.url);
            if (!v.ok) { naplo.push(`  HIBA ${v.status}: ${f.nev}`); continue; }
            const szoveg = szovegge(await v.text());
            if (szoveg.length < 500) { naplo.push(`  ÜRES: ${f.nev}`); continue; }
            naplo.push(`  OK (${Math.round(szoveg.length / 1024)} kB): ${f.nev}`);
            listak.push({ ...f, szoveg });
        } catch (e) {
            naplo.push(`  HIBA: ${f.nev} – ${e.message.slice(0, 50)}`);
        }
    }
    /* A RÉSZLETES NAPLÓ FÁJLBA MEGY, nem a konzolra.
       Ok: a GitHub Actions naplója így is olvasható marad, és a
       részletek a jelentésben visszakereshetők. A konzolra csak
       az kerül, ami döntést igényel: a nem elérhető források. */
    const gond = naplo.filter(x => !x.includes('  OK ('));
    if (gond.length) {
        console.log(`\nNem elérhető források (${gond.length}):`);
        gond.forEach(x => console.log(x));
    }
    console.log(`\nElérhető: ${naplo.length - gond.length} / ${naplo.length} forrás`);

    if (!listak.length && !wikidata && !osm) {
        console.error('\nEgyetlen forrás sem volt elérhető.');
        process.exit(1);
    }

    /* --- Saját honlapok: pályánként EGY kérés, korlátozott számban --- */
    const honlapok = new Map();
    const sajatosak = palyak.filter(p => p.ownSite).slice(0, SAJAT_HONLAP_MAX);
    if (sajatosak.length) {
        process.stdout.write(`\nSaját honlapok (${sajatosak.length})… `);
        for (const p of sajatosak) {
            const eng = await robotsEngedi(p.ownSite).catch(() => ({ engedi: false, ok: 'hibás URL' }));
            if (!eng.engedi) { honlapok.set(p.name, { el: null, ok: eng.ok }); continue; }
            await var_(SZUNET_MP);
            honlapok.set(p.name, await sajatHonlap(p.ownSite));
        }
        console.log(`  élő: ${[...honlapok.values()].filter(h => h.el).length} / ${honlapok.size}`);
    }

    /* --- Kiértékelés --- */
    const most = new Date();
    const hatar = new Date(most.getTime() - GYANUS_HONAP * 30.44 * 86400000);
    const eredmenyek = [];
    const vizsgalt = limit ? palyak.slice(0, limit) : palyak;

    console.log(`\nKiértékelés: ${vizsgalt.length} pálya…`);

    for (const p of vizsgalt) {
        const kulcsok = keresoKulcsok(p);
        const csaladok = new Set();
        const forrasNevek = [];
        let legutobbi = null, bezaras = null, wdBezaras = null, osmElhagyott = false;

        for (const f of listak) {
            let talalt = false;
            for (const k of kulcsok) {
                if (!f.szoveg.toLowerCase().includes(k)) continue;
                talalt = true;
                /* Havi naptárnál a HÓNAP maga a dátum – megbízhatóbb,
                   mint a szövegből kibányászott érték. */
                if (f.datum && (!legutobbi || f.datum > legutobbi)) legutobbi = f.datum;
                for (const d of datumokKornyezetbol(f.szoveg, k)) {
                    if (d <= most && (!legutobbi || d > legutobbi)) legutobbi = d;
                }
                const b = bezarasJel(f.szoveg, k);
                if (b && !bezaras) bezaras = { forras: f.nev, jel: b };
            }
            if (talalt) { csaladok.add(f.csalad); forrasNevek.push(f.nev); }
        }

        if (wikidata) {
            for (const w of wikidata) {
                const wn = norm(w.nev);
                if (kulcsok.some(k => wn.includes(k) || k.includes(wn))) {
                    csaladok.add('enciklopedia'); forrasNevek.push('Wikidata');
                    if (w.bezaras) wdBezaras = w.bezaras;
                }
            }
        }
        if (osm) {
            for (const o of osm) {
                if (kulcsok.some(k => norm(o.nev).includes(k))) {
                    csaladok.add('terkep'); forrasNevek.push('OSM');
                    if (o.elhagyott) osmElhagyott = true;
                }
            }
        }
        const h = honlapok.get(p.name);
        if (h && h.el) { csaladok.add('sajat-honlap'); forrasNevek.push('saját honlap'); }

        /* --- JAVASLAT --- */
        let javaslat, szin, indok;
        if (wdBezaras) {
            javaslat = 'closed'; szin = 'piros';
            indok = `Wikidata megszűnési dátum: ${wdBezaras}`;
        } else if (bezaras) {
            javaslat = 'closed'; szin = 'piros';
            indok = `bezárásra utaló szöveg (${bezaras.forras}): "${bezaras.jel}"`;
        } else if (osmElhagyott) {
            javaslat = 'inactive'; szin = 'sárga';
            indok = 'OpenStreetMap: elhagyott/használaton kívüli jelölés';
        } else if (legutobbi && legutobbi >= hatar) {
            javaslat = 'active'; szin = 'zöld';
            indok = `versenynyom: ${legutobbi.toISOString().slice(0, 10)}`;
        } else if (legutobbi) {
            const ho = Math.round((most - legutobbi) / (30.44 * 86400000));
            javaslat = 'inactive'; szin = 'sárga';
            indok = `utolsó nyom ${ho} hónapja (${legutobbi.toISOString().slice(0, 10)})`;
        } else if (h && h.el === false) {
            javaslat = 'unknown'; szin = 'sárga';
            indok = `nincs versenynyom, és a saját honlap sem él (${h.ok})`;
        } else if (csaladok.size >= 2) {
            javaslat = 'unknown'; szin = 'sárga';
            indok = `${csaladok.size} forráscsalád említi, de versenydátum nélkül`;
        } else {
            javaslat = 'unknown'; szin = 'sárga';
            indok = 'nincs elég bizonyíték – kézi ellenőrzés kell';
        }

        eredmenyek.push({
            nev: p.name, slug: p.slug || null, varos: p.city || null,
            jelenlegi: p.status || 'active', javaslat, szin, indok,
            csaladok: [...csaladok], forrasok: [...new Set(forrasNevek)],
            legutobbi: legutobbi ? legutobbi.toISOString().slice(0, 10) : null,
            sajatHonlap: h ? (h.el === true ? 'él'
                : h.el === false ? `halott (${h.ok})` : `kihagyva (${h.ok})`) : null
        });
    }

    const hasznaltForrasok = [
        ...listak.map(f => f.nev),
        ...(wikidata ? ['Wikidata'] : []),
        ...(osm ? ['OpenStreetMap'] : [])
    ];
    return { iso, honapok, eredmenyek, hasznaltForrasok, naplo };
}

/* ============================================================
   JELENTÉS
   ============================================================ */

function jelentestIr(adat) {
    const { iso, eredmenyek, hasznaltForrasok, honapok } = adat;
    const elteres = eredmenyek.filter(e => e.javaslat !== e.jelenlegi);
    const csaladSzam = new Set(eredmenyek.flatMap(e => e.csaladok)).size;

    const s = [];
    s.push(`# Státuszellenőrzés — ${iso}\n`);
    s.push(`Futtatva: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · ` +
           `vizsgált időszak: ${honapok} hónap\n`);
    s.push(`Pálya: **${eredmenyek.length}** · Elérhető forrás: **${hasznaltForrasok.length}** · ` +
           `Forráscsalád: **${csaladSzam}**\n`);

    s.push(`\n## Ez JAVASLAT, nem döntés\n`);
    s.push(`A hiányzás nem bizonyítja a bezárást: egy pálya kimaradhat idényen kívül,`);
    s.push(`felújítás alatt, vagy mert évente egyszer versenyeznek rajta. A szkript`);
    s.push(`nem írja át az adatbázist.\n`);

    s.push(`\n## Felhasznált források\n`);
    hasznaltForrasok.forEach(n => s.push(`- ${n}`));

    s.push(`\n## Eltérés a jelenlegi státusztól (${elteres.length})\n`);
    if (!elteres.length) s.push('_Nincs eltérés._\n');
    for (const e of elteres) {
        const j = { 'piros': '🔴', 'sárga': '🟡', 'zöld': '🟢' }[e.szin] || '';
        s.push(`### ${j} ${e.nev}`);
        s.push(`- Jelenlegi: \`${e.jelenlegi}\` → Javasolt: \`${e.javaslat}\``);
        s.push(`- Indok: ${e.indok}`);
        s.push(`- Forráscsaládok (${e.csaladok.length}): ${e.csaladok.join(', ') || '—'}`);
        if (e.sajatHonlap) s.push(`- Saját honlap: ${e.sajatHonlap}`);
        s.push('');
    }

    s.push(`\n## Teljes lista\n`);
    s.push(`| Pálya | Most | Javasolt | Utolsó nyom | Családok | Indok |`);
    s.push(`|---|---|---|---|---|---|`);
    for (const e of eredmenyek) {
        const j = { 'piros': '🔴', 'sárga': '🟡', 'zöld': '🟢' }[e.szin] || '';
        s.push(`| ${j} ${e.nev} | \`${e.jelenlegi}\` | \`${e.javaslat}\` | ` +
               `${e.legutobbi || '—'} | ${e.csaladok.length} | ${e.indok} |`);
    }

    fs.writeFileSync(path.join(__dirname, 'statusz-jelentes.md'), s.join('\n'), 'utf8');
    fs.writeFileSync(path.join(__dirname, 'statusz-jelentes.json'),
        JSON.stringify(adat, null, 2), 'utf8');

    /* CSV — táblázatkezelőben nyitható, szűrhető, rendezhető.
       A "Döntés" oszlop SZÁNDÉKOSAN üres: oda írod be, mit
       fogadsz el. Az UTF-8 BOM az Excel miatt kell, enélkül az
       ékezetes betűk elromlanak. */
    const csvSor = (m) => m.map(c => {
        const v = String(c ?? '');
        return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(';');

    const csv = ['\uFEFF' + csvSor([
        'Jelzés', 'Pálya', 'Település', 'Jelenlegi', 'Javasolt', 'Eltérés',
        'Utolsó nyom', 'Családok', 'Források', 'Saját honlap', 'Indok', 'Döntés'
    ])];
    for (const e of eredmenyek) {
        csv.push(csvSor([
            { piros: 'PIROS', 'sárga': 'SARGA', 'zöld': 'ZOLD' }[e.szin] || '',
            e.nev, e.varos, e.jelenlegi, e.javaslat,
            e.javaslat !== e.jelenlegi ? 'IGEN' : '',
            e.legutobbi, e.csaladok.length, e.csaladok.join(', '),
            e.sajatHonlap, e.indok, ''
        ]));
    }
    fs.writeFileSync(path.join(__dirname, 'statusz-jelentes.csv'), csv.join('\n'), 'utf8');
}

/* ============================================================ */

async function main() {
    const argv = process.argv.slice(2);
    const ertek = (n) => { const i = argv.indexOf(n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : null; };

    const iso = (ertek('--orszag') || '').toUpperCase();
    const limit = parseInt(ertek('--limit'), 10) || 0;
    const honapok = parseInt(ertek('--honapok'), 10) || GYANUS_HONAP;

    if (!iso) {
        console.error('Használat: node tools/statusz.mjs --orszag AUS [--limit 5] [--honapok 12]');
        console.error('Elérhető: ' + Object.keys(FORRASOK).join(', '));
        process.exit(1);
    }

    const adat = await futtat(iso, limit, honapok);
    jelentestIr(adat);

    const e = adat.eredmenyek;
    const db = (sz) => e.filter(x => x.szin === sz).length;
    console.log(`\n🟢 ${db('zöld')}   🟡 ${db('sárga')}   🔴 ${db('piros')}`);
    console.log(`Eltérés: ${e.filter(x => x.javaslat !== x.jelenlegi).length}`);
    console.log('\nJelentés: tools/statusz-jelentes.xlsx (színezett) · .csv · .md');
    console.log('A szkript NEM módosította az adatbázist.');
}

main().catch(e => { console.error('\nHIBA:', e.message); process.exit(1); });
