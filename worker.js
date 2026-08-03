/**
 * ============================================================
 *  RACECOURSE360 – Cloudflare Worker
 * ============================================================
 *
 *  KÉT DOLGOT CSINÁL, EBBEN A SORRENDBEN
 *
 *  1) BELSŐ FÁJLOK ELREJTÉSE (mindig aktív)
 *     A wrangler.jsonc a repo GYÖKERÉT publikálja statikus
 *     tartalomként ("directory": "."). Ez kényelmes, de azt
 *     jelenti, hogy alapból MINDEN fájl letölthető lenne –
 *     köztük a munkafájlok is:
 *         /uj_palyak.json    406 jelölt pálya
 *         /javaslatok.json   1179 javaslat
 *         /tools/verify.mjs  a teljes ellenőrző szkript
 *     Ezek gépi feldolgozásra kész adathalmazok. A Felhasználási
 *     feltételek tiltják az adatbázis lényeges részének kimásolását,
 *     de a tiltás keveset ér, ha mi magunk tesszük közzé őket egy
 *     letölthető URL-en. A robots.txt itt NEM elég: az csak jelzés,
 *     amit a rosszhiszemű bot figyelmen kívül hagy.
 *
 *  2) JELSZAVAS VÉDELEM (csak ha van SITE_PASSWORD)
 *     Böngészős jelszókérés (HTTP Basic Auth) az egész oldal elé.
 *
 *  HOL A JELSZÓ
 *  NEM ebben a fájlban. A Cloudflare "Secret" tárolójában, mert
 *  ez a fájl a GitHubon van, és oda jelszót írni súlyos hiba.
 *  Beállítás: Worker → Settings → Variables and Secrets →
 *             Add → Type: Secret → Name: SITE_PASSWORD
 *
 *  HOGYAN KAPCSOLD KI, HA ÉLESRE MÉSZ
 *  Töröld a SITE_PASSWORD secretet. Ha nincs jelszó beállítva,
 *  a Worker átengedi a forgalmat – az oldal nyilvános lesz.
 *  (Ez szándékos: így nem tudod véletlenül kizárni magad.)
 *  A belső fájlok elrejtése ettől FÜGGETLENÜL megmarad.
 * ============================================================
 */

// A felhasználónév fix; csak a jelszó titkos.
const FELHASZNALO = 'racecourse';

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

    // ---- 1) BELSŐ FÁJLOK ----
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

    // ---- 2) JELSZAVAS VÉDELEM ----
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
