/**
 * ============================================================
 *  RACECOURSE360 – Cloudflare Worker
 * ============================================================
 *
 *  HÁROM DOLGOT CSINÁL, EBBEN A SORRENDBEN
 *
 *  1) IDŐJÁRÁS-VÉGPONT (/api/idojaras)
 *     Továbbhív a MET Norway felé, és a választ megszűrve adja
 *     vissza. Miért nem hívjuk közvetlenül a böngészőből:
 *       · a MET Norway kéri, hogy proxyzzunk – enélkül a
 *         látogatók IP-címei az ő szervereiken naplózódnának;
 *       · azonosítható User-Agent fejlécet követelnek, amit a
 *         böngésző nem tud beállítani;
 *       · így tudunk gyorsítótárazni, ami náluk feltétel.
 *
 *  2) BELSŐ FÁJLOK ELREJTÉSE (mindig aktív)
 *     A wrangler.jsonc a repo GYÖKERÉT publikálja statikus
 *     tartalomként ("directory": "."). Ez kényelmes, de azt
 *     jelenti, hogy alapból MINDEN fájl letölthető lenne –
 *     köztük a munkafájlok is:
 *         /uj_palyak.json      406 jelölt pálya
 *         /javaslatok.json     1179 javaslat
 *         /tools/verify.mjs    a teljes ellenőrző szkript
 *     Ezek gépi feldolgozásra kész adathalmazok. A Felhasználási
 *     feltételek tiltják az adatbázis lényeges részének kimásolását,
 *     de a tiltás keveset ér, ha mi magunk tesszük közzé őket egy
 *     letölthető URL-en. A robots.txt itt NEM elég: az csak jelzés,
 *     amit a rosszhiszemű bot figyelmen kívül hagy.
 *
 *  3) JELSZAVAS VÉDELEM (csak ha van SITE_PASSWORD)
 *     Böngészős jelszókérés (HTTP Basic Auth) az egész oldal elé.
 *
 *  HOL A JELSZÓ
 *     NEM ebben a fájlban. A Cloudflare "Secret" tárolójában, mert
 *     ez a fájl a GitHubon van, és oda jelszót írni súlyos hiba.
 *     Beállítás: Worker → Settings → Variables and Secrets →
 *     Add → Type: Secret → Name: SITE_PASSWORD
 *
 *  HOGYAN KAPCSOLD KI, HA ÉLESRE MÉSZ
 *     Töröld a SITE_PASSWORD secretet. Ha nincs jelszó beállítva,
 *     a Worker átengedi a forgalmat – az oldal nyilvános lesz.
 *     (Ez szándékos: így nem tudod véletlenül kizárni magad.)
 *     A belső fájlok elrejtése ettől FÜGGETLENÜL megmarad.
 * ============================================================
 */

// A felhasználónév fix; csak a jelszó titkos.
const FELHASZNALO = 'racecourse';

/* ============================================================
   IDŐJÁRÁS – MET Norway (Meteorologisk institutt)
   ------------------------------------------------------------
   Licenc: CC BY 4.0 – kereskedelmi használatra is szabad,
   FELTÜNTETÉSSEL. A feltüntetés az oldalon jelenik meg
   (lásd app.js: az időjárás-sor alatti forrásmegjelölés).

   A MET három dolgot kér, és a betartásukat ellenőrzik:
     1. azonosítható User-Agent, elérhetőséggel – generikus vagy
        hiányzó azonosító esetén BLOKKOLNAK, nem lassítanak;
     2. ésszerű forgalom – ezért gyorsítótárazunk;
     3. ne kérdezzük gyakrabban, mint ahogy az adat frissül.
   ============================================================ */

const MET_AZONOSITO =
    'Racecourse360/1.0 (https://racecourse360.com; info@racecourse360.com)';

/* 30 perc. A MET modellje ennél ritkábban frissül, tehát ennél
   sűrűbben kérdezni fölösleges terhelés lenne. */
const IDOJARAS_CACHE_MP = 1800;

/**
 * A koordináta kerekítése 2 tizedesre (kb. 1 km pontosság).
 *
 * Két okból:
 *   · a MET kifejezetten kéri, hogy ne küldjünk fölösleges
 *     tizedeseket – a modell felbontása úgyis durvább;
 *   · a kerekítés drasztikusan javítja a gyorsítótár-találatot:
 *     az azonos pályához érkező kérések ugyanarra a kulcsra
 *     esnek, tehát egyetlen továbbhívás sok látogatót kiszolgál.
 */
function kerekit(szam) {
    return Math.round(szam * 100) / 100;
}

/**
 * Az időjárás-végpont kiszolgálása.
 *
 * Visszatérés: kicsi, megszűrt JSON – nem a MET teljes válasza.
 * Ez tudatos: a teljes válasz több száz kilobájt (kilenc napra
 * óránkénti bontásban), nekünk viszont egyetlen pillanat kell.
 */
async function idojarasValasz(url) {
    const lat = kerekit(parseFloat(url.searchParams.get('lat')));
    const lon = kerekit(parseFloat(url.searchParams.get('lon')));

    /* Érvényesség-ellenőrzés. E nélkül a végpont tetszőleges
       kéréseket továbbítana – a MET felé mi felelünk a
       forgalomért, tehát nem engedhetünk át szemetet. */
    if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
        lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return new Response(JSON.stringify({ hiba: 'ervenytelen-koordinata' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
    }

    const metUrl =
        `https://api.met.no/weatherapi/locationforecast/2.0/compact` +
        `?lat=${lat}&lon=${lon}`;

    let valasz;
    try {
        valasz = await fetch(metUrl, {
            headers: {
                'User-Agent': MET_AZONOSITO,
                'Accept': 'application/json',
            },
            /* A Cloudflare élhálózata tárolja el a választ. A kulcs
               a teljes URL, ami a kerekített koordinátát tartalmazza. */
            cf: { cacheTtl: IDOJARAS_CACHE_MP, cacheEverything: true },
        });
    } catch (e) {
        return idojarasHiba('halozati-hiba');
    }

    if (!valasz.ok) return idojarasHiba('met-' + valasz.status);

    let adat;
    try {
        adat = await valasz.json();
    } catch (e) {
        return idojarasHiba('ertelmezesi-hiba');
    }

    /* A MET válaszának szerkezete:
         properties.timeseries[0].data.instant.details  – MOST
         properties.timeseries[0].data.next_1_hours     – a következő óra
       Az elsőt vesszük: az a legközelebbi előrejelzési pont. */
    const elso = adat?.properties?.timeseries?.[0];
    if (!elso) return idojarasHiba('nincs-adat');

    const r = elso.data?.instant?.details || {};
    const kov = elso.data?.next_1_hours || elso.data?.next_6_hours || {};

    const eredmeny = {
        // Hőmérséklet Celsiusban
        homerseklet: szam(r.air_temperature),
        // Szél m/s-ban, ahogy a MET adja
        szel: szam(r.wind_speed),
        // Széllökés – nincs mindig
        szellokes: szam(r.wind_speed_of_gust),
        // Szélirány fokban (0 = északról fúj)
        szelirany: szam(r.wind_from_direction),
        // Csapadék mm-ben, a következő időszakra
        csapadek: szam(kov.details?.precipitation_amount),
        // Páratartalom
        paratartalom: szam(r.relative_humidity),
        /* A MET saját jelkódja (pl. "clearsky_day", "rain").
           Ebből választ ikont a felület – a MET ikonkészletét
           NEM töltjük le, saját, egyszerű ikonokat rajzolunk. */
        jel: kov.summary?.symbol_code || null,
        // Az előrejelzés időpontja (ISO)
        ido: elso.time || null,
    };

    return new Response(JSON.stringify(eredmeny), {
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            /* A böngésző is tárolja – így a popup ismételt
               megnyitása nem indít új kérést. */
            'Cache-Control': `public, max-age=${IDOJARAS_CACHE_MP}`,
            'X-Robots-Tag': 'noindex, nofollow',
        },
    });
}

/** Szám vagy null – a hiányzó mezőket nem találgatjuk. */
function szam(ertek) {
    return (typeof ertek === 'number' && Number.isFinite(ertek)) ? ertek : null;
}

/**
 * Hibaválasz.
 *
 * 200-as státusszal tér vissza, hibajelzéssel a törzsben. Ok: a
 * felület számára az időjárás NEM kritikus – ha nincs adat, a sor
 * egyszerűen nem jelenik meg. Egy 500-as válasz a böngésző
 * konzoljában hibaként villogna, ami félrevezető: nem az oldal
 * romlott el, csak egy külső szolgáltatás nem válaszolt.
 */
function idojarasHiba(ok) {
    return new Response(JSON.stringify({ hiba: ok }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=120',
        },
    });
}

/**
 * TILTÓLISTA – mi NE legyen nyilvánosan letölthető.
 *
 * MIÉRT TILTÓLISTA ÉS NEM ENGEDÉLYEZŐ LISTA:
 * az engedélyező lista biztonságosabb elv, de itt törékenyebb –
 * minden új kép, betűtípus vagy adatfájl felvételekor módosítani
 * kellene a Workert, és ha elfelejtjük, az oldal némán elromlik.
 * A tiltólista rosszabb esetben túl keveset rejt el, az engedélyező
 * lista rosszabb esetben működésképtelenné teszi az oldalt.
 * Itt az utóbbi a nagyobb kár.
 */

// Pontos útvonalak (a kezdő / -rel együtt, kisbetűsítve hasonlítjuk)
const TILTOTT_UTVONALAK = new Set([
    '/uj_palyak.json',
    '/javaslatok.json',
    '/wrangler.jsonc',
    '/worker.js',
    '/package.json',
    '/package-lock.json',
]);

// Mappák: minden, ami ezekkel kezdődik
const TILTOTT_MAPPAK = [
    '/tools/',
    '/.github/',
    '/node_modules/',
    '/eredmeny/',            // a verify.mjs kimenete, ha valaha commitolnánk
    '/eredmeny-jeloltek/',
    '/eredmeny-felfedezes/',
    /* A szöveges források: a generátor ezekből készíti a cikkeket,
       de maguk a .md fájlok nem publikusak. A .md kiterjesztés
       amúgy is tiltott, ez csak kettős biztosítás. */
    '/tortenelem/',
    '/versenyek/',
    '/fajta/',
];

// Kiterjesztések: fejlesztői/dokumentációs fájlok
// FIGYELEM: a .geojson SZÁNDÉKOSAN nincs itt – az app.js a
// data/countries.geojson és data/regions.geojson fájlokat tartalék
// forrásként tölti be, ha a CDN-ek nem elérhetők.
const TILTOTT_KITERJESZTESEK = [
    '.md',
    '.mjs',
    '.py',
    '.yml',
    '.yaml',
    '.jsonc',
    '.xlsx',
    '.docx',
    '.toml',
    '.log',
];

/**
 * Eldönti, hogy egy útvonal belső munkafájlra mutat-e.
 */
function belsoFajl(utvonal) {
    const u = utvonal.toLowerCase();

    if (TILTOTT_UTVONALAK.has(u)) return true;
    if (TILTOTT_MAPPAK.some((mappa) => u.startsWith(mappa))) return true;
    if (TILTOTT_KITERJESZTESEK.some((kit) => u.endsWith(kit))) return true;

    // Rejtett fájlok (.env, .git, .DS_Store ...) – bármely szinten
    if (u.split('/').some((resz) => resz.startsWith('.') && resz.length > 1)) return true;

    return false;
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // ---- 1) IDŐJÁRÁS-VÉGPONT ----
        /* A jelszóellenőrzés ELŐTT áll. Ok: fejlesztés alatt a
           böngésző nem minden esetben küldi újra a Basic Auth
           fejlécet a háttérkérésekhez, és az időjárás enélkül
           némán elmaradna – nehezen felderíthető hibát okozva.

           Nyilvánosan sem kockázatos: csak koordinátára válaszol,
           érvényesített tartományban, és a MET adata amúgy is
           bárki számára szabadon elérhető. */
        if (url.pathname === '/api/idojaras') {
            return idojarasValasz(url);
        }

        // ---- 2) BELSŐ FÁJLOK ----
        // 404-et adunk, nem 403-at: a 403 elárulná, hogy a fájl LÉTEZIK,
        // csak tiltott. A 404 semmit nem árul el.
        if (belsoFajl(url.pathname)) {
            return new Response('Not found', {
                status: 404,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'X-Robots-Tag': 'noindex, nofollow',
                    'Cache-Control': 'no-store',
                },
            });
        }

        // ---- 3) JELSZAVAS VÉDELEM ----
        const jelszo = env.SITE_PASSWORD;

        // Ha nincs jelszó beállítva, az oldal nyilvános.
        // Így egy elrontott secret nem zár ki véglegesen.
        if (!jelszo) {
            return env.ASSETS.fetch(request);
        }

        const fejlec = request.headers.get('Authorization');
        if (fejlec && ellenoriz(fejlec, jelszo)) {
            return env.ASSETS.fetch(request);
        }

        // Nincs vagy rossz a jelszó → a böngésző feldobja a beléptető ablakot
        return new Response('Ez az oldal fejlesztés alatt áll.', {
            status: 401,
            headers: {
                'WWW-Authenticate': 'Basic realm="Racecourse360 – fejlesztés alatt", charset="UTF-8"',
                'Content-Type': 'text/plain; charset=utf-8',
                // A keresőmotoroknak is szólunk, hogy ne indexeljék
                'X-Robots-Tag': 'noindex, nofollow',
            },
        });
    },
};

/**
 * A Basic Auth fejléc ellenőrzése.
 *
 * FONTOS: időzítés-független összehasonlítást használunk. A sima
 * === összehasonlítás az első eltérő karakternél megáll, és a
 * futásidő különbségéből elvileg kitalálható a jelszó. Ez itt
 * alacsony kockázat, de a helyes megoldás nem kerül többe.
 */
function ellenoriz(fejlec, vartJelszo) {
    if (!fejlec.startsWith('Basic ')) return false;

    let dekodolt;
    try {
        dekodolt = atob(fejlec.slice(6));
    } catch {
        return false;
    }

    const valaszto = dekodolt.indexOf(':');
    if (valaszto < 0) return false;

    const felhasznalo = dekodolt.slice(0, valaszto);
    const jelszo = dekodolt.slice(valaszto + 1);

    return biztonsagosEgyezes(felhasznalo, FELHASZNALO)
        && biztonsagosEgyezes(jelszo, vartJelszo);
}

function biztonsagosEgyezes(a, b) {
    const kodolo = new TextEncoder();
    const x = kodolo.encode(a);
    const y = kodolo.encode(b);

    // A hosszkülönbség önmagában is elárulna valamit, de a
    // tartalmat így sem szivárogtatjuk ki.
    if (x.length !== y.length) return false;

    let elteres = 0;
    for (let i = 0; i < x.length; i++) elteres |= x[i] ^ y[i];
    return elteres === 0;
}
