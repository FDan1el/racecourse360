/**
 * ============================================================
 *  RACECOURSE360 – jelszavas védelem a fejlesztés idejére
 * ============================================================
 *
 *  MIT CSINÁL
 *  Böngészős jelszókérést (HTTP Basic Auth) tesz az oldal elé.
 *  Amíg nincs helyes jelszó, senki nem látja a tartalmat –
 *  sem látogató, sem keresőmotor.
 *
 *  HOL VAN A JELSZÓ
 *  NEM ebben a fájlban. A Cloudflare "Secret" tárolójában, mert
 *  ez a fájl a GitHubon van, és oda jelszót írni súlyos hiba.
 *  Beállítás: Worker → Settings → Variables and Secrets →
 *             Add → Type: Secret → Name: SITE_PASSWORD
 *
 *  HOGYAN KAPCSOLD KI, HA ÉLESRE MÉSZ
 *  Töröld a SITE_PASSWORD secretet. Ha nincs jelszó beállítva,
 *  a Worker átengedi a forgalmat – az oldal nyilvános lesz.
 *  (Ez szándékos: így nem tudod véletlenül kizárni magad.)
 * ============================================================
 */

// A felhasználónév fix; csak a jelszó titkos.
const FELHASZNALO = 'racecourse';

export default {
  async fetch(request, env) {
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
