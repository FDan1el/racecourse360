/* TELJES ADATBÁZIS-ELLENŐRZÉS.
 *
 * Azokat a hibatípusokat keresi, amiket a mostani munka során kézzel
 * találtam, de most az EGÉSZ adatbázison, nem csak az új rekordokon:
 *   1. dupla slug
 *   2. KÖZELI KOORDINÁTÁK egy országon belül -> rejtett duplikátum
 *      (így derült ki a Mori/San Marone és a turkui Metsämäki)
 *   3. koordináta az ország határain KÍVÜL -> félrevitt jelölő
 *      (így derült ki, hogy a Mori rekord Trentinóba volt írva)
 *   4. hiányzó kötelező mezők
 *   5. érvénytelen status / direction érték
 *   6. azonos nevek
 */
import fs from 'fs';

const s = fs.readFileSync('js/app.js', 'utf8');
const a = s.indexOf('const trackDatabase');
const v = s.indexOf('const countryMeta', a);
const db = eval('(' + s.slice(a, v).replace(/^const trackDatabase\s*=\s*/, '').replace(/;\s*$/, '') + ')');

/* Durva befoglaló téglalapok: [latMin, latMax, lngMin, lngMax].
   Szándékosan BŐK, hogy csak a valódi elvétéseket fogják meg. */
const BBOX = {
    SWE: [55.0, 69.3, 10.8, 24.3],
    /* FRANCIAORSZÁG: a tengerentúli megyék (Guadeloupe, Martinique,
       Réunion, Francia Guyana) jogilag Franciaország, és van is ott
       pályánk, ezért a téglalap szándékosan nagyon bő. Nélküle a
       guadeloupe-i és a martinique-i rekord vakriasztást adott. */
    FRA: [-21.5, 51.2, -61.9, 55.9],
    ITA: [35.4, 47.2, 6.5, 18.6], FIN: [59.6, 70.2, 19.0, 31.7],
    NOR: [57.9, 71.3, 4.0, 31.2], POL: [48.9, 55.0, 14.0, 24.2],
    CZE: [48.5, 51.1, 12.0, 18.9], SVK: [47.7, 49.7, 16.8, 22.6],
    HUN: [45.7, 48.7, 16.0, 22.9], EST: [57.5, 59.8, 21.7, 28.3],
    DNK: [54.5, 57.8, 8.0, 15.3], DEU: [47.2, 55.1, 5.8, 15.1],
    AUT: [46.3, 49.1, 9.5, 17.2], NLD: [50.7, 53.6, 3.3, 7.3],
    ESP: [27.6, 43.9, -18.2, 4.4], BEL: [49.4, 51.6, 2.5, 6.5],
    GBR: [49.8, 61.0, -8.7, 1.9], IRL: [51.3, 55.5, -10.6, -5.9],
    LTU: [53.8, 56.5, 20.9, 26.9], LVA: [55.6, 58.1, 20.9, 28.3],
    MLT: [35.7, 36.1, 14.1, 14.6], ROU: [43.5, 48.3, 20.2, 29.8],
    SRB: [42.2, 46.2, 18.8, 23.1], SVN: [45.4, 46.9, 13.3, 16.7],
    CHE: [45.8, 47.9, 5.9, 10.6], UKR: [44.3, 52.4, 22.1, 40.3],
    RUS: [41.1, 77.0, 19.0, 180.0], USA: [18.9, 71.5, -179.2, -66.9],
    CAN: [41.6, 83.2, -141.1, -52.6], AUS: [-43.7, -9.1, 112.9, 153.7],
    NZL: [-47.3, -34.0, 166.3, 178.6], ARG: [-55.1, -21.7, -73.6, -53.6],
    /* PORTUGÁLIA: a téglalap az Azori-szigeteket és Madeirát is tartalmazza,
       mert azok is Portugália – ugyanaz a logika, mint a francia tengerentúli
       megyéknél. Ügetőpálya ma csak a szárazföldön van. */
    PRT: [30.0, 42.2, -31.3, -6.2],
};

const JO_STATUS = new Set(['active', 'inactive', 'unknown', 'closed', 'historical']);
const JO_IRANY = new Set(['left', 'right', null]);

const hibak = [];
const figyelmek = [];
const slugok = new Map();
const nevek = new Map();
let ossz = 0;

function tav(a1, g1, a2, g2) {
    const R = 6371, r = Math.PI / 180;
    const dA = (a2 - a1) * r, dG = (g2 - g1) * r;
    const x = Math.sin(dA / 2) ** 2
        + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dG / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
}

for (const [iso, arr] of Object.entries(db)) {
    ossz += arr.length;

    for (const r of arr) {
        const cim = iso + '/' + (r.name || '(névtelen)');

        /* --- 4) kötelező mezők --- */
        for (const k of ['name', 'slug', 'city', 'status']) {
            if (r[k] === undefined || r[k] === null || r[k] === '') {
                hibak.push('HIÁNYZÓ MEZŐ (' + k + '): ' + cim);
            }
        }

        /* --- 5) érvényes értékek --- */
        if (!JO_STATUS.has(r.status)) hibak.push('ÉRVÉNYTELEN status "' + r.status + '": ' + cim);
        if (r.direction !== undefined && !JO_IRANY.has(r.direction)) {
            hibak.push('ÉRVÉNYTELEN direction "' + r.direction + '": ' + cim);
        }

        /* --- 1) dupla slug --- */
        if (slugok.has(r.slug)) hibak.push('DUPLA SLUG "' + r.slug + '": ' + slugok.get(r.slug) + ' <-> ' + cim);
        else slugok.set(r.slug, cim);

        /* --- 6) azonos nevek --- */
        const nk = (r.name || '').toLowerCase().trim();
        if (nevek.has(nk)) figyelmek.push('AZONOS NÉV: ' + nevek.get(nk) + ' <-> ' + cim);
        else nevek.set(nk, cim);

        /* --- koordináta-érvényesség --- */
        if (typeof r.lat !== 'number' || typeof r.lng !== 'number') {
            figyelmek.push('NINCS KOORDINÁTA: ' + cim + (r.status === 'active' ? '  (AKTÍV!)' : ''));
            continue;
        }
        if (r.lat < -90 || r.lat > 90 || r.lng < -180 || r.lng > 180) {
            hibak.push('ÉRTELMEZHETETLEN KOORDINÁTA: ' + cim);
            continue;
        }
        if (r.lat === 0 && r.lng === 0) hibak.push('NULLA-SZIGET (0,0): ' + cim);

        /* --- 3) országon kívüli koordináta --- */
        const b = BBOX[iso];
        if (b && (r.lat < b[0] || r.lat > b[1] || r.lng < b[2] || r.lng > b[3])) {
            hibak.push('ORSZÁGON KÍVÜLI KOORDINÁTA: ' + cim
                + '  (' + r.lat.toFixed(4) + ', ' + r.lng.toFixed(4) + ')');
        }
    }

    /* --- 2) közeli koordináták egy országon belül --- */
    for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
            const x = arr[i], y = arr[j];
            if (typeof x.lat !== 'number' || typeof y.lat !== 'number') continue;
            const d = tav(x.lat, x.lng, y.lat, y.lng);
            if (d < 1.5) {
                figyelmek.push('KÖZELI KOORDINÁTA (' + Math.round(d * 1000) + ' m): '
                    + iso + '/' + x.name + '  <->  ' + y.name
                    + '  [' + x.status + '/' + y.status + ']');
            }
        }
    }
}

console.log('=== ÖSSZESÍTÉS ===');
console.log('országok: ' + Object.keys(db).length + ', rekord: ' + ossz);
const aktiv = Object.values(db).flat().filter((r) => r.status === 'active').length;
console.log('aktív: ' + aktiv);

console.log('\n=== HIBÁK (' + hibak.length + ') ===');
hibak.forEach((h) => console.log('  ' + h));
if (!hibak.length) console.log('  nincs');

console.log('\n=== FIGYELMEZTETÉSEK (' + figyelmek.length + ') ===');
figyelmek.forEach((h) => console.log('  ' + h));
if (!figyelmek.length) console.log('  nincs');
