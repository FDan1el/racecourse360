#!/usr/bin/env node
/* ============================================================
   statusz.mjs — pályastátusz ellenőrzése több forrásból
   ------------------------------------------------------------
   MIT CSINÁL ÉS MIT NEM

   Csinál: bizonyítékot gyűjt arról, hogy egy pálya szerepelt-e
   versenynaptárban, mit ír róla a saját honlapja, és mit mond a
   Wikipédia. Ezekből JAVASLATOT ad, és munkalistát ír ki.

   NEM csinál: nem írja át a trackDatabase-t, és nem dönt
   státuszt. A hiányzás ugyanis NEM bizonyítja a bezárást – egy
   pálya kimaradhat idényen kívül, felújítás alatt, vagy mert
   évente csak egyszer, vásári alkalommal versenyeznek rajta.
   A döntés emberi marad.

   FORRÁSFÜGGETLENSÉG
   A koordinátáknál bevált elv itt is érvényes: két forrás
   ugyanabból a családból nem számít két megerősítésnek. Ezért a
   források családokba vannak sorolva, és a javaslat azt nézi,
   HÁNY CSALÁD erősíti meg ugyanazt.

   ROBOTS.TXT
   Minden tartománynál lekérdezzük és betartjuk. Ha tilt, a
   forrás kimarad – nem "gyorsabban", hanem egyáltalán nem
   kérdezzük. Ez nem opció, hanem a projekt alapszabálya.

   Használat:
     node tools/statusz.mjs --orszag AUS
     node tools/statusz.mjs --orszag AUS --limit 5   (próbafutás)

   Kimenet:
     tools/statusz-jelentes.md    olvasható munkalista
     tools/statusz-jelentes.json  gépi feldolgozáshoz
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GYOKER = path.resolve(__dirname, '..');
const APP_JS = path.join(GYOKER, 'js', 'app.js');

/* ------------------------------------------------------------
   BEÁLLÍTÁSOK
   ------------------------------------------------------------ */

/* Azonosítjuk magunkat. Ez nem udvariasság: több szolgáltató
   blokkol ismeretlen vagy hiányzó azonosítót, és a kapcsolatfelvételi
   cím adja meg nekik a lehetőséget, hogy szóljanak, ha zavarunk. */
const AZONOSITO =
    'Racecourse360-StatusCheck/1.0 (+https://racecourse360.com; info@racecourse360.com)';

/* Kérések közötti szünet. SZÁNDÉKOSAN lassú: a feladat nem
   sürgős, kézzel indul, és a források kímélése fontosabb, mint a
   futásidő. Egy teljes ausztrál kör így is percek alatt lefut. */
const SZUNET_MP = 2.5;

/* Ennyi hónap után számít gyanúsnak, ha nincs versenynyom. */
const GYANUS_HONAP = 12;

/* Egy kérés időkorlátja – ha egy szerver nem válaszol, ne
   akassza meg az egész futást. */
const IDOKORLAT_MP = 20;

/* ------------------------------------------------------------
   FORRÁSCSALÁDOK
   ------------------------------------------------------------
   A `csalad` mező a lényeg: két azonos családú forrás NEM ad
   független megerősítést. A szövetségi oldalak egy családba
   tartoznak, mert egymástól veszik át az adatot.
   ------------------------------------------------------------ */
const FORRASOK = {
    AUS: [
        { nev: 'Harness Racing Australia', csalad: 'szovetseg',
          url: 'https://www.harness.org.au/racing/results/',
          tipus: 'naptar' },
        { nev: 'HRA (legacy)', csalad: 'szovetseg',
          url: 'https://legacy.harness.org.au/results/index.cfm',
          tipus: 'naptar' },
        { nev: 'Harness Racing Victoria', csalad: 'allami-szovetseg',
          url: 'https://www.thetrots.com.au/', tipus: 'naptar' },
        { nev: 'Harness Racing NSW', csalad: 'allami-szovetseg',
          url: 'https://www.hrnsw.com.au/', tipus: 'naptar' },
        { nev: 'Racing Queensland', csalad: 'allami-szovetseg',
          url: 'https://www.racingqueensland.com.au/racing', tipus: 'naptar' },
        { nev: 'SA Harness', csalad: 'allami-szovetseg',
          url: 'https://satrots.com.au/', tipus: 'naptar' },
        { nev: 'Racing WA', csalad: 'allami-szovetseg',
          url: 'https://racingwa.com.au/racing/harness-racing', tipus: 'naptar' },
        { nev: 'Tasracing', csalad: 'allami-szovetseg',
          url: 'https://tasracing.com.au/', tipus: 'naptar' },
        { nev: 'Wikipédia', csalad: 'enciklopedia',
          url: 'https://en.wikipedia.org/wiki/Harness_racing_in_Australia',
          tipus: 'hatter' },
    ]
};

/* ------------------------------------------------------------
   ROBOTS.TXT
   ------------------------------------------------------------ */

const robotsGyorsitotar = new Map();

/**
 * Egy tartomány robots.txt-jének lekérése és értelmezése.
 *
 * SZÁNDÉKOSAN EGYSZERŰ értelmező: a `User-agent: *` és a saját
 * azonosítónkra vonatkozó `Disallow` sorokat nézi. Nem kezel
 * mintaillesztést a szabvány minden finomságával – ahol
 * bizonytalan, ott a TILTÁS felé téved, nem az engedély felé.
 */
async function robotsEngedi(url) {
    const u = new URL(url);
    const kulcs = u.origin;

    if (!robotsGyorsitotar.has(kulcs)) {
        let szoveg = '';
        try {
            const v = await keres(kulcs + '/robots.txt');
            szoveg = v.ok ? await v.text() : '';
        } catch (e) {
            /* Ha a robots.txt nem érhető el, azt NEM tekintjük
               engedélynek. Inkább kihagyjuk a forrást. */
            robotsGyorsitotar.set(kulcs, { hiba: true, tiltott: [] });
            return { engedi: false, ok: 'robots.txt nem érhető el' };
        }
        robotsGyorsitotar.set(kulcs, robotsErtelmez(szoveg));
    }

    const r = robotsGyorsitotar.get(kulcs);
    if (r.hiba) return { engedi: false, ok: 'robots.txt nem érhető el' };

    const ut = u.pathname;
    for (const tilt of r.tiltott) {
        if (tilt === '/') return { engedi: false, ok: 'teljes tiltás' };
        if (tilt && ut.startsWith(tilt)) {
            return { engedi: false, ok: `tiltott útvonal: ${tilt}` };
        }
    }
    return { engedi: true };
}

function robotsErtelmez(szoveg) {
    const tiltott = [];
    let rank = false;   // épp minket érintő blokkban vagyunk-e

    for (const nyers of szoveg.split(/\r?\n/)) {
        const sor = nyers.replace(/#.*$/, '').trim();
        if (!sor) continue;
        const ketto = sor.indexOf(':');
        if (ketto < 0) continue;

        const kulcs = sor.slice(0, ketto).trim().toLowerCase();
        const ertek = sor.slice(ketto + 1).trim();

        if (kulcs === 'user-agent') {
            const ua = ertek.toLowerCase();
            rank = (ua === '*' || AZONOSITO.toLowerCase().includes(ua));
        } else if (kulcs === 'disallow' && rank) {
            tiltott.push(ertek);
        }
    }
    return { hiba: false, tiltott };
}

/* ------------------------------------------------------------
   HÁLÓZAT
   ------------------------------------------------------------ */

function var_(mp) {
    return new Promise(r => setTimeout(r, mp * 1000));
}

async function keres(url) {
    const ctrl = new AbortController();
    const ora = setTimeout(() => ctrl.abort(), IDOKORLAT_MP * 1000);
    try {
        return await fetch(url, {
            headers: { 'User-Agent': AZONOSITO, 'Accept': 'text/html,application/json' },
            signal: ctrl.signal,
            redirect: 'follow'
        });
    } finally {
        clearTimeout(ora);
    }
}

/* ------------------------------------------------------------
   ADATOK
   ------------------------------------------------------------ */

function adatBeolvas() {
    const forras = fs.readFileSync(APP_JS, 'utf8');
    const m = forras.match(/const trackDatabase = (\{[\s\S]*?\n\});/);
    if (!m) throw new Error('A trackDatabase nem olvasható ki az app.js-ből.');
    return vm.runInNewContext('(' + m[1] + ')');
}

/** Ékezet- és írásjelmentes alak az összehasonlításhoz. */
function norm(s) {
    return String(s || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * A pálya azonosítására használható nevek.
 *
 * A versenynaptárak a KLUB nevét írják, nem a pályáét ("Melton",
 * nem "Melton Entertainment Park"), ezért több változatot
 * próbálunk: a teljes nevet, a zárójel előtti részt, és a
 * települést.
 */
function keresoKulcsok(palya) {
    const k = new Set();
    const nev = String(palya.name || '');
    k.add(norm(nev));
    k.add(norm(nev.replace(/\s*\(.*?\)\s*/g, ' ')));
    k.add(norm(nev.replace(/\b(paceway|racecourse|raceway|park|trotting club|harness racing club|race club|racing club|showground[s]?)\b/gi, '')));
    const varos = String(palya.city || '').replace(/,\s*[A-Z]{2,3}\s*$/, '');
    k.add(norm(varos));
    return [...k].filter(x => x.length >= 4);
}

/* ------------------------------------------------------------
   BIZONYÍTÉKGYŰJTÉS
   ------------------------------------------------------------ */

/**
 * Egy forrás letöltése és feldolgozása.
 *
 * Nyers szöveget adunk vissza, nem szerkezetet: a források
 * felépítése gyakran változik, és egy törékeny értelmező némán
 * rossz eredményt adna. A szöveges keresés durvább, de nem
 * hazudik: ha a pálya neve szerepel az oldalon, az tény.
 */
async function forrastLetolt(forras, naplo) {
    const eng = await robotsEngedi(forras.url);
    if (!eng.engedi) {
        naplo.push(`  KIHAGYVA (robots.txt): ${forras.nev} – ${eng.ok}`);
        return null;
    }

    await var_(SZUNET_MP);

    try {
        const v = await keres(forras.url);
        if (!v.ok) {
            naplo.push(`  HIBA ${v.status}: ${forras.nev}`);
            return null;
        }
        const html = await v.text();
        naplo.push(`  OK (${Math.round(html.length / 1024)} kB): ${forras.nev}`);
        /* A HTML-címkéket eltávolítjuk: minket a látható szöveg
           érdekel, nem a jelölés. */
        return html
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ');
    } catch (e) {
        naplo.push(`  HIBA: ${forras.nev} – ${e.message}`);
        return null;
    }
}

/**
 * Dátumok kigyűjtése a szöveg azon részéből, ahol a pálya neve
 * szerepel. Így nemcsak azt tudjuk, hogy említik, hanem azt is,
 * MIKORRA vonatkozik az említés.
 */
function datumokKornyezetbol(szoveg, kulcs) {
    const datumok = [];
    const re = new RegExp(kulcs.split('').join('\\s*'), 'gi');
    let m;
    while ((m = re.exec(szoveg)) !== null) {
        const kornyezet = szoveg.slice(Math.max(0, m.index - 120), m.index + 160);
        /* Formátumok: "13 Jun 2026", "2026-06-13", "13/06/2026" */
        const d1 = kornyezet.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/);
        const d2 = kornyezet.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
        const d3 = kornyezet.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
        let d = null;
        if (d2) d = new Date(`${d2[1]}-${d2[2]}-${d2[3]}`);
        else if (d1) d = new Date(`${d1[1]} ${d1[2]} ${d1[3]}`);
        else if (d3) d = new Date(`${d3[3]}-${String(d3[2]).padStart(2,'0')}-${String(d3[1]).padStart(2,'0')}`);
        if (d && !isNaN(d) && d.getFullYear() > 2000) datumok.push(d);
        if (datumok.length > 30) break;   // elég a minta
    }
    return datumok;
}

/* Bezárásra utaló kifejezések. A "closed" önmagában megtévesztő
   (pl. "closed for nominations"), ezért csak a beszédes
   párosításokat keressük. */
const BEZARAS_JELEK = [
    'permanently closed', 'no longer race', 'no longer hosts',
    'ceased racing', 'ceased operations', 'last meeting was',
    'closed in 20', 'shut down', 'racing has ended',
    'final meeting', 'defunct'
];

function bezarasJel(szoveg, kulcs) {
    const re = new RegExp(kulcs.split('').join('\\s*'), 'gi');
    let m;
    while ((m = re.exec(szoveg)) !== null) {
        const k = szoveg.slice(Math.max(0, m.index - 200), m.index + 260).toLowerCase();
        for (const jel of BEZARAS_JELEK) {
            if (k.includes(jel)) return jel;
        }
    }
    return null;
}

/* ------------------------------------------------------------
   FŐ FUTÁS
   ------------------------------------------------------------ */

async function futtat(iso, limit) {
    const trackDatabase = adatBeolvas();
    const palyak = trackDatabase[iso];
    if (!palyak) throw new Error(`Ismeretlen országkód: ${iso}`);

    const forrasok = FORRASOK[iso];
    if (!forrasok) {
        throw new Error(
            `Nincs forráslista ehhez: ${iso}. ` +
            `Vedd fel a FORRASOK objektumba, majd futtasd újra.`
        );
    }

    const naplo = [];
    console.log(`\n${iso}: ${palyak.length} pálya, ${forrasok.length} forrás\n`);
    console.log('Források letöltése (lassan, a szerverek kímélése miatt)…');

    /* A forrásokat EGYSZER töltjük le, nem pályánként. 42 pálya ×
       9 forrás = 378 kérés lenne, ami udvariatlan és fölösleges:
       ugyanaz az oldal tartalmazza az összes pályát. */
    const letoltott = [];
    for (const f of forrasok) {
        const szoveg = await forrastLetolt(f, naplo);
        if (szoveg) letoltott.push({ ...f, szoveg });
    }
    naplo.forEach(s => console.log(s));

    if (!letoltott.length) {
        console.error('\nEgyetlen forrás sem volt elérhető. Nincs mit kiértékelni.');
        process.exit(1);
    }

    const most = new Date();
    const hatar = new Date(most.getTime() - GYANUS_HONAP * 30.44 * 86400000);
    const eredmenyek = [];

    const vizsgalt = limit ? palyak.slice(0, limit) : palyak;
    console.log(`\nKiértékelés: ${vizsgalt.length} pálya…`);

    for (const p of vizsgalt) {
        const kulcsok = keresoKulcsok(p);
        const bizonyitek = [];
        const csaladok = new Set();
        let legutobbi = null;
        let bezaras = null;

        for (const f of letoltott) {
            let talalt = false;
            for (const k of kulcsok) {
                if (!f.szoveg.toLowerCase().includes(k)) continue;
                talalt = true;
                for (const d of datumokKornyezetbol(f.szoveg, k)) {
                    if (!legutobbi || d > legutobbi) legutobbi = d;
                }
                const b = bezarasJel(f.szoveg, k);
                if (b && !bezaras) bezaras = { forras: f.nev, jel: b };
            }
            if (talalt) {
                bizonyitek.push({ forras: f.nev, csalad: f.csalad, tipus: f.tipus });
                csaladok.add(f.csalad);
            }
        }

        /* JAVASLAT
           A "független családok száma" a döntő, nem a találatoké:
           nyolc szövetségi oldal ugyanazt az adatot veheti át. */
        let javaslat, szin, indok;
        if (bezaras) {
            javaslat = 'closed'; szin = 'piros';
            indok = `bezárásra utaló szöveg (${bezaras.forras}): "${bezaras.jel}"`;
        } else if (legutobbi && legutobbi >= hatar) {
            javaslat = 'active'; szin = 'zöld';
            indok = `versenynyom: ${legutobbi.toISOString().slice(0,10)}`;
        } else if (legutobbi) {
            const ho = Math.round((most - legutobbi) / (30.44 * 86400000));
            javaslat = 'inactive'; szin = 'sárga';
            indok = `utolsó nyom ${ho} hónapja (${legutobbi.toISOString().slice(0,10)})`;
        } else if (csaladok.size >= 2) {
            javaslat = 'unknown'; szin = 'sárga';
            indok = `${csaladok.size} forráscsalád említi, de dátum nélkül`;
        } else {
            javaslat = 'unknown'; szin = 'sárga';
            indok = 'nincs elég bizonyíték – kézi ellenőrzés kell';
        }

        eredmenyek.push({
            nev: p.name, slug: p.slug || null, varos: p.city || null,
            jelenlegi: p.status || 'active',
            javaslat, szin, indok,
            csaladok: [...csaladok],
            forrasok: bizonyitek.map(b => b.forras),
            legutobbi: legutobbi ? legutobbi.toISOString().slice(0,10) : null
        });
    }
    return { iso, eredmenyek, naplo, letoltott: letoltott.map(f => f.nev) };
}

/* ------------------------------------------------------------
   JELENTÉS
   ------------------------------------------------------------ */

function jelentestIr(adat) {
    const { iso, eredmenyek, letoltott } = adat;
    const elteres = eredmenyek.filter(e => e.javaslat !== e.jelenlegi);

    const s = [];
    s.push(`# Státuszellenőrzés — ${iso}\n`);
    s.push(`Futtatva: ${new Date().toISOString().slice(0,16).replace('T',' ')}\n`);
    s.push(`Vizsgált pálya: **${eredmenyek.length}** · Elérhető forrás: **${letoltott.length}**\n`);
    s.push(`\nFelhasznált források:\n`);
    letoltott.forEach(n => s.push(`- ${n}`));

    s.push(`\n## Fontos: ez JAVASLAT, nem döntés\n`);
    s.push(`A hiányzás nem bizonyítja a bezárást. Egy pálya kimaradhat idényen`);
    s.push(`kívül, felújítás alatt, vagy mert évente csak egyszer versenyeznek rajta.`);
    s.push(`A szkript nem írja át az adatbázist – a döntés a tiéd.\n`);

    s.push(`\n## Eltérés a jelenlegi státusztól (${elteres.length})\n`);
    if (!elteres.length) s.push('_Nincs eltérés._\n');
    for (const e of elteres) {
        const j = { 'piros': '🔴', 'sárga': '🟡', 'zöld': '🟢' }[e.szin] || '';
        s.push(`### ${j} ${e.nev}`);
        s.push(`- Jelenlegi: \`${e.jelenlegi}\` → Javasolt: \`${e.javaslat}\``);
        s.push(`- Indok: ${e.indok}`);
        s.push(`- Forráscsaládok: ${e.csaladok.join(', ') || '—'}`);
        s.push(`- Források: ${e.forrasok.join(', ') || '—'}\n`);
    }

    s.push(`\n## Teljes lista\n`);
    s.push(`| Pálya | Jelenlegi | Javasolt | Utolsó nyom | Indok |`);
    s.push(`|---|---|---|---|---|`);
    for (const e of eredmenyek) {
        const j = { 'piros': '🔴', 'sárga': '🟡', 'zöld': '🟢' }[e.szin] || '';
        s.push(`| ${j} ${e.nev} | \`${e.jelenlegi}\` | \`${e.javaslat}\` | ${e.legutobbi || '—'} | ${e.indok} |`);
    }

    fs.writeFileSync(path.join(__dirname, 'statusz-jelentes.md'), s.join('\n'), 'utf8');
    fs.writeFileSync(path.join(__dirname, 'statusz-jelentes.json'),
        JSON.stringify(adat, null, 2), 'utf8');
}

/* ------------------------------------------------------------ */

async function main() {
    const argv = process.argv.slice(2);
    const ertek = (nev) => {
        const i = argv.indexOf(nev);
        return (i >= 0 && argv[i + 1]) ? argv[i + 1] : null;
    };

    const iso = (ertek('--orszag') || '').toUpperCase();
    const limit = parseInt(ertek('--limit'), 10) || 0;

    if (!iso) {
        console.error('Használat: node tools/statusz.mjs --orszag AUS [--limit 5]');
        console.error('Elérhető országok: ' + Object.keys(FORRASOK).join(', '));
        process.exit(1);
    }

    const adat = await futtat(iso, limit);
    jelentestIr(adat);

    const e = adat.eredmenyek;
    const szam = (sz) => e.filter(x => x.szin === sz).length;
    console.log(`\n🟢 ${szam('zöld')}   🟡 ${szam('sárga')}   🔴 ${szam('piros')}`);
    console.log(`Eltérés a jelenlegitől: ${e.filter(x => x.javaslat !== x.jelenlegi).length}`);
    console.log(`\nJelentés: tools/statusz-jelentes.md`);
    console.log('A szkript NEM módosította az adatbázist.');
}

main().catch(e => {
    console.error('\nHIBA:', e.message);
    process.exit(1);
});
