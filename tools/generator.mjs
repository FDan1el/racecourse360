#!/usr/bin/env node
/* ============================================================
   generator.mjs — Racecourse360 statikus oldalgenerátor
   ------------------------------------------------------------
   Három üzemmód:

     node generator.mjs --slugok
         Slug-JAVASLATOT ír a slug-javaslat.json fájlba, és
         listázza az ütközéseket. NEM módosít semmit.
         A javaslatot KÉZZEL kell jóváhagyni és bemásolni az
         app.js-be, mert a slug utána fagyasztott: ha később
         megváltozna, minden indexelt URL és külső link eltörne.

     node generator.mjs --ellenoriz
         Csak validál, nem generál. Ezt futtatja a CI.

     node generator.mjs --general
         Validál, majd legenerálja a teljes statikus oldalfát.
         Ha a validálás hibát talál, NEM generál semmit —
         fél-kész állapot nem kerülhet ki.

   Az app.js-t NEM importáljuk (böngészőre írt kód, DOM-ot
   érint). Helyette a két adatblokkot szövegesen kivágjuk és
   külön értékeljük ki. Így a generátor nem függ attól, hogy
   az app.js logikai része éppen fut-e.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GYOKER = path.resolve(__dirname, '..');
const APP_JS = path.join(GYOKER, 'js', 'app.js');
const ORSZAGOK_JSON = path.join(__dirname, 'orszagok.json');
const KIMENET = path.join(GYOKER, 'dist');
const BAZIS_URL = 'https://racecourse360.com';

const NYELVEK = ['hu', 'en', 'de', 'fr', 'sv', 'es', 'it', 'ja', 'zh', 'ar'];
const ALAP_NYELV = 'en';           // x-default és tartalék
const JOBBRA_IRO = ['ar'];          // dir="rtl"

/* ============================================================
   1. ADATBEOLVASÁS
   ============================================================ */

function blokkotKivag(forras, deklaracio) {
    const kezd = forras.indexOf(deklaracio);
    if (kezd === -1) throw new Error(`Nem található: ${deklaracio}`);
    // A nyitó { keresése, majd zárójel-számlálás a végéig.
    let i = forras.indexOf('{', kezd);
    if (i === -1) throw new Error(`Hiányzó { ennél: ${deklaracio}`);
    let melyseg = 0, idezojel = null, escape = false;
    for (let j = i; j < forras.length; j++) {
        const c = forras[j];
        if (escape) { escape = false; continue; }
        if (c === '\\') { escape = true; continue; }
        if (idezojel) { if (c === idezojel) idezojel = null; continue; }
        if (c === '"' || c === "'" || c === '`') { idezojel = c; continue; }
        if (c === '{' || c === '[') melyseg++;
        else if (c === '}' || c === ']') {
            melyseg--;
            if (melyseg === 0) return forras.slice(i, j + 1);
        }
    }
    throw new Error(`Lezáratlan blokk: ${deklaracio}`);
}

function adatBeolvas() {
    if (!fs.existsSync(APP_JS)) {
        throw new Error(`Nem található az app.js itt: ${APP_JS}`);
    }
    const forras = fs.readFileSync(APP_JS, 'utf8');
    const tdSzoveg = blokkotKivag(forras, 'const trackDatabase');
    const cmSzoveg = blokkotKivag(forras, 'const countryMeta');
    // Üres sandbox: az adatblokkok tiszta objektumliterálok, nincs
    // bennük függvényhívás, tehát nem tudnak mellékhatást okozni.
    const ctx = vm.createContext(Object.create(null));
    const trackDatabase = vm.runInContext(`(${tdSzoveg})`, ctx);
    const countryMeta = vm.runInContext(`(${cmSzoveg})`, ctx);
    return { trackDatabase, countryMeta };
}

function orszagokBeolvas() {
    if (!fs.existsSync(ORSZAGOK_JSON)) {
        throw new Error(`Hiányzik: ${ORSZAGOK_JSON}`);
    }
    return JSON.parse(fs.readFileSync(ORSZAGOK_JSON, 'utf8'));
}

/* ============================================================
   2. SLUG-KÉPZÉS
   ------------------------------------------------------------
   FONTOS: ez csak JAVASLATOT ad. A véglegesített slug az
   app.js-ben, adatmezőként él, és onnan olvassuk vissza.
   ============================================================ */

// Amit az NFD-normalizálás nem old meg (nem kombináló ékezetek).
const KULON_BETUK = {
    'ß': 'ss', 'æ': 'ae', 'ø': 'o', 'œ': 'oe', 'đ': 'd', 'ð': 'd',
    'ł': 'l', 'þ': 'th', 'ħ': 'h', 'ı': 'i', 'ŋ': 'ng', 'ẞ': 'ss'
};

// Cirill → latin (tudományos átírás, ékezetek nélkül).
const CIRILL = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z',
    'и':'i','й':'j','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r',
    'с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh',
    'щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'ju','я':'ja',
    // ukrán / szerb eltérések
    'і':'i','ї':'ji','є':'je','ґ':'g','ђ':'dj','ј':'j','љ':'lj','њ':'nj',
    'ћ':'c','џ':'dz'
};

function slugKepzes(szoveg) {
    let s = String(szoveg).toLowerCase();
    s = s.replace(/[\u0400-\u04FF]/g, ch => (ch in CIRILL ? CIRILL[ch] : '?'));
    s = s.replace(/[^\u0000-\u007F]/g, ch => (ch in KULON_BETUK ? KULON_BETUK[ch] : ch));
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s;
}

/**
 * Van-e a slugban olyan karakter, amit nem tudtunk kezelni?
 * Ilyenkor emberi döntés kell (pl. japán/kínai név átírása),
 * a szkript nem találgat.
 */
function slugGyanus(eredeti, slug) {
    if (!slug) return 'üres slug';
    if (slug.includes('?')) return 'ismeretlen cirill karakter';
    // Ha az eredetiben van CJK/arab/héber írásjel, kézi átírás kell.
    if (/[\u3000-\u9FFF\u4E00-\u9FFF\uAC00-\uD7AF\u0600-\u06FF]/.test(eredeti)) {
        return 'nem latin írásrendszer – kézi átírás kell';
    }
    return null;
}

/* ============================================================
   3. HOSSZMEGJELENÍTÉS
   ------------------------------------------------------------
   A length MINDIG méterben tárolt. A mérföld kizárólag
   megjelenítési réteg, és leképezési tábla — nem osztás:
   a sportág törtekben beszél ("fél mérföldes bullring"),
   a naiv m/1609 csúnya tizedeseket adna.
   ============================================================ */

const MERFOLD_TABLA = {
    402:  '1/4 mile',
    805:  '1/2 mile',
    1006: '5/8 mile',
    1207: '3/4 mile',
    1408: '7/8 mile',
    1609: '1 mile',
    2012: '1 1/4 miles',
    3219: '2 miles'
};

function hosszSzoveg(meter, egyseg, figyelmeztetesek, palyaNev) {
    if (meter === null || meter === undefined) return null;
    if (egyseg !== 'imperial') return `${meter} m`;
    const nev = MERFOLD_TABLA[meter];
    if (!nev) {
        figyelmeztetesek.push(
            `Ismeretlen mérföldérték: ${meter} m (${palyaNev}) – méterben jelenik meg`
        );
        return `${meter} m`;
    }
    return `${nev} (${meter} m)`;
}

/* ============================================================
   4. FORDÍTÁSOK
   ------------------------------------------------------------
   Csak hu és en van kitöltve. A hiányzó nyelv az ALAP_NYELV-re
   esik vissza, és a generátor JELZI a hiányt — így látszik,
   mennyi fordítás van hátra, de a generálás nem áll meg.
   ============================================================ */

const SZOTAR = {
    hu: {
        tracks: 'Pályák', track: 'Versenypálya', city: 'Település',
        founded: 'Alapítva', length: 'Pályahossz', direction: 'Futásirány',
        status: 'Státusz', org: 'Szervezet', site: 'Hivatalos honlap',
        region: 'Régió', na: 'N/A', globe: 'Megnézem a földgömbön',
        countries: 'Országok', history: 'Történet',
        left: 'balra', right: 'jobbra',
        st_active: 'Aktív', st_inactive: 'Inaktív / felfüggesztve',
        st_unknown: 'Ismeretlen – ellenőrzendő', st_closed: 'Véglegesen bezárt',
        desc: (n, v, o) => `${n} ügetőpálya (${v}, ${o}) – elhelyezkedés, alapadatok és státusz a Racecourse360 nemzetközi pályaadatbázisában.`,
        listDesc: (o, db) => `${o} ügetőpályái – ${db} dokumentált versenypálya elhelyezkedéssel, alapadatokkal és státusszal.`
    },
    en: {
        tracks: 'Tracks', track: 'Racecourse', city: 'Town',
        founded: 'Founded', length: 'Track length', direction: 'Direction',
        status: 'Status', org: 'Organisation', site: 'Official website',
        region: 'Region', na: 'N/A', globe: 'View on the globe',
        countries: 'Countries', history: 'History',
        left: 'left-handed', right: 'right-handed',
        st_active: 'Active', st_inactive: 'Inactive / suspended',
        st_unknown: 'Unknown – to be verified', st_closed: 'Permanently closed',
        desc: (n, v, o) => `${n} harness racing track (${v}, ${o}) – location, key facts and status in the Racecourse360 international track database.`,
        listDesc: (o, db) => `Harness racing tracks in ${o} – ${db} documented racecourses with location, key facts and status.`
    }
};

function sz(nyelv, kulcs) {
    const s = SZOTAR[nyelv] || SZOTAR[ALAP_NYELV];
    return (s && s[kulcs] !== undefined) ? s[kulcs] : SZOTAR[ALAP_NYELV][kulcs];
}

/* ============================================================
   5. VALIDÁLÁS
   ============================================================ */

function validal(trackDatabase, countryMeta, orszagok) {
    const hibak = [];
    const figyelmeztetesek = [];

    for (const iso of Object.keys(trackDatabase)) {
        if (!orszagok[iso]) {
            hibak.push(`Hiányzó orszagok.json bejegyzés: ${iso}`);
            continue;
        }
        if (!countryMeta[iso]) {
            figyelmeztetesek.push(`Hiányzó countryMeta bejegyzés: ${iso}`);
        }
        const o = orszagok[iso];
        if (!o.slug) hibak.push(`Hiányzó országslug: ${iso}`);
        if (!['metric', 'imperial'].includes(o.units)) {
            hibak.push(`Érvénytelen units (${o.units}): ${iso}`);
        }
        for (const ny of NYELVEK) {
            if (!o.nev || o.nev[ny] === undefined) {
                hibak.push(`Hiányzó nev kulcs (${ny}): ${iso}`);
            } else if (o.nev[ny] === null) {
                figyelmeztetesek.push(`Nincs országnév-fordítás (${ny}): ${iso}`);
            }
        }

        // Slug-ütközés országon belül
        const latott = new Map();
        for (const p of trackDatabase[iso]) {
            if (!p.slug) {
                hibak.push(`Hiányzó slug: ${iso} / ${p.name}`);
                continue;
            }
            if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug)) {
                hibak.push(`Érvénytelen slug formátum: ${iso} / ${p.name} → "${p.slug}"`);
            }
            if (latott.has(p.slug)) {
                hibak.push(
                    `Slug-ütközés ${iso}: "${p.slug}" → ${latott.get(p.slug)} ÉS ${p.name}`
                );
            }
            latott.set(p.slug, p.name);
        }
    }

    // Fordítási lefedettség
    for (const ny of NYELVEK) {
        if (!SZOTAR[ny]) figyelmeztetesek.push(`Nincs felületi szótár: ${ny} (${ALAP_NYELV} lesz)`);
    }

    return { hibak, figyelmeztetesek };
}

/* ============================================================
   6. SLUG-JAVASLAT MÓD
   ============================================================ */

function slugJavaslat(trackDatabase) {
    const eredmeny = {};
    const utkozesek = [];
    const kezi = [];

    for (const [iso, palyak] of Object.entries(trackDatabase)) {
        const latott = new Map();
        eredmeny[iso] = [];
        for (const p of palyak) {
            const javasolt = p.slug || slugKepzes(p.name);
            const gond = slugGyanus(p.name, javasolt);
            if (gond) kezi.push({ iso, name: p.name, javasolt, ok: gond });
            if (latott.has(javasolt)) {
                utkozesek.push({
                    iso, slug: javasolt,
                    elso: latott.get(javasolt), masodik: p.name,
                    tipp: 'régióval vagy településsel egyértelműsítsd'
                });
            }
            latott.set(javasolt, p.name);
            eredmeny[iso].push({
                name: p.name,
                city: p.city ?? null,
                region: p.region ?? null,
                slug: javasolt,
                mar_veglegesitve: Boolean(p.slug)
            });
        }
    }
    return { eredmeny, utkozesek, kezi };
}

/* ============================================================
   7. HTML-SABLONOK
   ============================================================ */

const esc = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function hreflangSorok(utvonalFn) {
    const sorok = NYELVEK.map(ny =>
        `  <link rel="alternate" hreflang="${ny}" href="${BAZIS_URL}${utvonalFn(ny)}">`
    );
    sorok.push(`  <link rel="alternate" hreflang="x-default" href="${BAZIS_URL}${utvonalFn(ALAP_NYELV)}">`);
    return sorok.join('\n');
}

function fejlec({ nyelv, cim, leiras, kanonikus, utvonalFn, extraFej = '' }) {
    const dir = JOBBRA_IRO.includes(nyelv) ? ' dir="rtl"' : '';
    return `<!DOCTYPE html>
<html lang="${nyelv}"${dir}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(cim)}</title>
  <meta name="description" content="${esc(leiras)}">
  <link rel="canonical" href="${BAZIS_URL}${kanonikus}">
${hreflangSorok(utvonalFn)}
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(cim)}">
  <meta property="og:description" content="${esc(leiras)}">
  <meta property="og:url" content="${BAZIS_URL}${kanonikus}">
  <meta property="og:site_name" content="Racecourse360">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="stylesheet" href="/css/statikus.css">
${extraFej}</head>
<body>
`;
}

const LABLEC = `<footer class="rc-lablec">
  <p>&copy; 2026 Racecourse360 &mdash; Candidus Solution Kft.</p>
</footer>
</body>
</html>
`;

function palyaOldal({ nyelv, palya, iso, orszag, countryMeta, figyelmeztetesek }) {
    const orszagNev = orszag.nev[nyelv] || orszag.nev[ALAP_NYELV];
    const utvonalFn = ny => `/${ny}/tracks/${orszag.slug}/${palya.slug}/`;
    const kanonikus = utvonalFn(nyelv);
    const cim = `${palya.name} – ${palya.city ?? orszagNev}, ${orszagNev} | Racecourse360`;
    const leiras = sz(nyelv, 'desc')(palya.name, palya.city ?? orszagNev, orszagNev);

    const hossz = hosszSzoveg(palya.length, orszag.units, figyelmeztetesek, palya.name);
    const irany = palya.direction === 'left' ? sz(nyelv, 'left')
                : palya.direction === 'right' ? sz(nyelv, 'right') : null;
    const statusz = sz(nyelv, 'st_' + (palya.status || 'unknown'));

    // A megjelenítendő mezők LISTÁBÓL jönnek, nem hardkódolt sorokból —
    // új mező felvételéhez elég ezt a tömböt bővíteni.
    const mezok = [
        [sz(nyelv, 'city'), palya.city],
        [sz(nyelv, 'region'), palya.region],
        [sz(nyelv, 'founded'), palya.founded],
        [sz(nyelv, 'length'), hossz],
        [sz(nyelv, 'direction'), irany],
        [sz(nyelv, 'status'), statusz]
    ];

    const sorok = mezok.map(([cimke, ertek]) =>
        `      <tr><th>${esc(cimke)}</th><td>${esc(ertek ?? sz(nyelv, 'na'))}</td></tr>`
    ).join('\n');

    const honlap = palya.ownSite
        ? `<p class="rc-link"><a href="${esc(palya.ownSite)}" rel="noopener nofollow" target="_blank">${esc(sz(nyelv, 'site'))}</a></p>`
        : '';

    const jsonld = {
        '@context': 'https://schema.org',
        '@type': 'SportsActivityLocation',
        name: palya.name,
        address: {
            '@type': 'PostalAddress',
            addressLocality: palya.city ?? undefined,
            addressCountry: iso
        },
        geo: {
            '@type': 'GeoCoordinates',
            latitude: palya.lat,
            longitude: palya.lng
        },
        url: `${BAZIS_URL}${kanonikus}`
    };
    if (palya.founded) jsonld.foundingDate = String(palya.founded);
    if (palya.ownSite) jsonld.sameAs = palya.ownSite;

    const extraFej = `  <script type="application/ld+json">${JSON.stringify(jsonld)}</script>\n`;

    return fejlec({ nyelv, cim, leiras, kanonikus, utvonalFn, extraFej }) +
`<main class="rc-palya">
  <nav class="rc-morzsa">
    <a href="/${nyelv}/tracks/">${esc(sz(nyelv, 'countries'))}</a> &rsaquo;
    <a href="/${nyelv}/tracks/${orszag.slug}/">${esc(orszagNev)}</a>
  </nav>
  <h1>${esc(palya.name)}</h1>
  <table class="rc-adatok">
    <tbody>
${sorok}
    </tbody>
  </table>
  ${honlap}
  <p class="rc-globe"><a href="/?track=${esc(iso)}:${esc(palya.slug)}">${esc(sz(nyelv, 'globe'))}</a></p>
</main>
` + LABLEC;
}

function orszagOldal({ nyelv, iso, orszag, palyak }) {
    const orszagNev = orszag.nev[nyelv] || orszag.nev[ALAP_NYELV];
    const utvonalFn = ny => `/${ny}/tracks/${orszag.slug}/`;
    const kanonikus = utvonalFn(nyelv);
    const cim = `${orszagNev} – ${sz(nyelv, 'tracks')} | Racecourse360`;
    const leiras = sz(nyelv, 'listDesc')(orszagNev, palyak.length);

    // Csak lista, beágyazott térkép nélkül (döntés szerint).
    const elemek = [...palyak]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(p => `      <li><a href="/${nyelv}/tracks/${orszag.slug}/${p.slug}/">${esc(p.name)}</a>` +
                  (p.city ? ` <span class="rc-varos">${esc(p.city)}</span>` : '') + `</li>`)
        .join('\n');

    return fejlec({ nyelv, cim, leiras, kanonikus, utvonalFn }) +
`<main class="rc-lista">
  <nav class="rc-morzsa"><a href="/${nyelv}/tracks/">${esc(sz(nyelv, 'countries'))}</a></nav>
  <h1>${esc(orszagNev)}</h1>
  <ul class="rc-palyalista">
${elemek}
  </ul>
</main>
` + LABLEC;
}

function orszaglistaOldal({ nyelv, orszagok, trackDatabase }) {
    const utvonalFn = ny => `/${ny}/tracks/`;
    const kanonikus = utvonalFn(nyelv);
    const cim = `${sz(nyelv, 'countries')} | Racecourse360`;
    const isok = Object.keys(trackDatabase)
        .filter(iso => orszagok[iso])
        .sort((a, b) => {
            const na = orszagok[a].nev[nyelv] || orszagok[a].nev[ALAP_NYELV];
            const nb = orszagok[b].nev[nyelv] || orszagok[b].nev[ALAP_NYELV];
            return na.localeCompare(nb);
        });
    const osszes = isok.reduce((n, iso) => n + trackDatabase[iso].length, 0);
    const leiras = sz(nyelv, 'listDesc')(
        isok.length + ' ' + sz(nyelv, 'countries').toLowerCase(), osszes
    );
    const elemek = isok.map(iso => {
        const o = orszagok[iso];
        const nev = o.nev[nyelv] || o.nev[ALAP_NYELV];
        return `      <li><a href="/${nyelv}/tracks/${o.slug}/">${esc(nev)}</a> ` +
               `<span class="rc-db">${trackDatabase[iso].length}</span></li>`;
    }).join('\n');

    return fejlec({ nyelv, cim, leiras, kanonikus, utvonalFn }) +
`<main class="rc-lista">
  <h1>${esc(sz(nyelv, 'countries'))}</h1>
  <ul class="rc-orszaglista">
${elemek}
  </ul>
</main>
` + LABLEC;
}

/* ============================================================
   8. SITEMAP
   ============================================================ */

function sitemapXml(urlek) {
    const sorok = urlek.map(u => `  <url><loc>${BAZIS_URL}${u}</loc></url>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sorok}
</urlset>
`;
}

function sitemapIndexXml(fajlok) {
    const sorok = fajlok.map(f =>
        `  <sitemap><loc>${BAZIS_URL}/${f}</loc></sitemap>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sorok}
</sitemapindex>
`;
}

/* ============================================================
   9. GENERÁLÁS
   ============================================================ */

function ir(relUtvonal, tartalom) {
    const teljes = path.join(KIMENET, relUtvonal);
    fs.mkdirSync(path.dirname(teljes), { recursive: true });
    fs.writeFileSync(teljes, tartalom, 'utf8');
}

function general(trackDatabase, countryMeta, orszagok) {
    const figyelmeztetesek = [];
    let oldalDb = 0;
    const sitemapFajlok = [];

    for (const nyelv of NYELVEK) {
        const urlek = [`/${nyelv}/tracks/`];

        ir(`${nyelv}/tracks/index.html`,
            orszaglistaOldal({ nyelv, orszagok, trackDatabase }));
        oldalDb++;

        for (const [iso, palyak] of Object.entries(trackDatabase)) {
            const orszag = orszagok[iso];
            if (!orszag) continue;

            ir(`${nyelv}/tracks/${orszag.slug}/index.html`,
                orszagOldal({ nyelv, iso, orszag, palyak }));
            urlek.push(`/${nyelv}/tracks/${orszag.slug}/`);
            oldalDb++;

            for (const palya of palyak) {
                ir(`${nyelv}/tracks/${orszag.slug}/${palya.slug}/index.html`,
                    palyaOldal({ nyelv, palya, iso, orszag, countryMeta, figyelmeztetesek }));
                urlek.push(`/${nyelv}/tracks/${orszag.slug}/${palya.slug}/`);
                oldalDb++;
            }
        }

        const fajl = `sitemap-${nyelv}.xml`;
        ir(fajl, sitemapXml(urlek));
        sitemapFajlok.push(fajl);
    }

    ir('sitemap.xml', sitemapIndexXml(sitemapFajlok));

    // Fejlesztési fázis: az oldal NEM indexelhető.
    // Élesítéskor ezt kell átírni (lásd SEO_STRUKTURA.md, 8. pont).
    ir('robots.txt', `User-agent: *\nDisallow: /\n`);

    // A mérföld-figyelmeztetések ismétlődnek nyelvenként — egyszeresítjük.
    const egyedi = [...new Set(figyelmeztetesek)];
    return { oldalDb, figyelmeztetesek: egyedi };
}

/* ============================================================
   10. BELÉPÉSI PONT
   ============================================================ */

function main() {
    const mod = process.argv[2] || '--ellenoriz';
    const { trackDatabase, countryMeta } = adatBeolvas();

    if (mod === '--slugok') {
        const { eredmeny, utkozesek, kezi } = slugJavaslat(trackDatabase);
        const ki = path.join(__dirname, 'slug-javaslat.json');
        fs.writeFileSync(ki, JSON.stringify(eredmeny, null, 2), 'utf8');
        const osszes = Object.values(eredmeny).reduce((n, a) => n + a.length, 0);
        const kesz = Object.values(eredmeny).flat().filter(x => x.mar_veglegesitve).length;

        console.log(`\nSlug-javaslat: ${osszes} pálya (${kesz} már véglegesítve)`);
        console.log(`Kiírva: ${ki}`);

        if (kezi.length) {
            console.log(`\nKÉZI DÖNTÉST IGÉNYEL (${kezi.length}):`);
            for (const k of kezi) console.log(`  ${k.iso}  ${k.name} → "${k.javasolt}"  [${k.ok}]`);
        }
        if (utkozesek.length) {
            console.log(`\nÜTKÖZÉS (${utkozesek.length}):`);
            for (const u of utkozesek) {
                console.log(`  ${u.iso}  "${u.slug}"  ← ${u.elso}  ÉS  ${u.masodik}`);
                console.log(`      ${u.tipp}`);
            }
        }
        if (!kezi.length && !utkozesek.length) console.log('\nNincs ütközés, nincs kézi eset.');
        console.log('\nA javaslat NEM került be az app.js-be – kézi jóváhagyás után másold be.');
        return;
    }

    const orszagok = orszagokBeolvas();
    const { hibak, figyelmeztetesek } = validal(trackDatabase, countryMeta, orszagok);

    if (figyelmeztetesek.length) {
        console.log(`\nFigyelmeztetés (${figyelmeztetesek.length}):`);
        for (const f of figyelmeztetesek.slice(0, 40)) console.log(`  · ${f}`);
        if (figyelmeztetesek.length > 40) {
            console.log(`  … és további ${figyelmeztetesek.length - 40}`);
        }
    }

    if (hibak.length) {
        console.error(`\nHIBA (${hibak.length}) – a generálás NEM indul el:`);
        for (const h of hibak.slice(0, 40)) console.error(`  ✗ ${h}`);
        if (hibak.length > 40) console.error(`  … és további ${hibak.length - 40}`);
        console.error('\nJavítsd a hibákat, majd futtasd újra.');
        process.exit(1);
    }

    console.log('\nValidálás rendben.');
    if (mod === '--ellenoriz') return;

    if (mod !== '--general') {
        console.error(`Ismeretlen mód: ${mod}`);
        console.error('Használat: --slugok | --ellenoriz | --general');
        process.exit(1);
    }

    fs.rmSync(KIMENET, { recursive: true, force: true });
    const eredmeny = general(trackDatabase, countryMeta, orszagok);
    console.log(`Generálva: ${eredmeny.oldalDb} oldal + ${NYELVEK.length} sitemap`);
    console.log(`Kimenet: ${KIMENET}`);
    if (eredmeny.figyelmeztetesek.length) {
        console.log(`\nHosszmegjelenítési figyelmeztetés:`);
        for (const f of eredmeny.figyelmeztetesek) console.log(`  · ${f}`);
    }
    console.log('\nEmlékeztető: a robots.txt Disallow-ra van állítva (fejlesztési fázis).');
}

main();
