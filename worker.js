const FELHASZNALO = 'racecourse';

export default {
  async fetch(request, env) {
    const jelszo = env.SITE_PASSWORD;

    if (!jelszo) {
      return env.ASSETS.fetch(request);
    }

    const fejlec = request.headers.get('Authorization');
    if (fejlec && ellenoriz(fejlec, jelszo)) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Ez az oldal fejlesztes alatt all.', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Racecourse360", charset="UTF-8"',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  },
};

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
  if (x.length !== y.length) return false;
  let elteres = 0;
  for (let i = 0; i < x.length; i++) elteres |= x[i] ^ y[i];
  return elteres === 0;
}
