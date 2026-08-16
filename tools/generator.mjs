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
/* ============================================================
   SZÖVEGES SZEKCIÓK
   ------------------------------------------------------------
   Három önálló szekció, három külön menüponttal. A szövegek
   SZÁNDÉKOSAN külön .md fájlokban élnek, nem az app.js-ben: így
   bármikor írhatók és javíthatók anélkül, hogy a pályaadatbázishoz
   hozzá kellene nyúlni.

       tortenelem/{nyelv}/{orszag}.md   → /{nyelv}/history/{orszag}/
       versenyek/{nyelv}/{verseny}.md   → /{nyelv}/races/{verseny}/
       fajta/{nyelv}/{lo}.md            → /{nyelv}/breeding/{lo}/

   TELJESSÉGI SZABÁLY: egy cikk CSAK akkor generálódik, ha mind a
   tíz nyelven megvan. Ha akár egy nyelv hiányzik, a cikk egyik
   nyelven sem jelenik meg, és a szkript jelzi, mi hiányzik.

   Ennek oka: a hiányos nyelvi lefedettség rosszabb, mint a
   hiány. Egy hreflang, ami nem létező oldalra mutat, hibás
   jelzés a keresőnek; a féllábon álló szekció pedig a látogatót
   is elveszíti. Így viszont ami kikerül, az minden nyelven kész.
   ============================================================ */
const SZEKCIOK = {
    history:  { mappa: 'tortenelem', utvonal: 'history',  cimkeKulcs: 'history' },
    races:    { mappa: 'versenyek',  utvonal: 'races',    cimkeKulcs: 'races' },
    breeding: { mappa: 'fajta',      utvonal: 'breeding', cimkeKulcs: 'breeding' }
};
/* A KIMENET a repó GYÖKERE, nem egy dist/ almappa.
   Ennek oka a wrangler.jsonc beállítása: az assets.directory
   értéke ".", vagyis a Worker a repó gyökerét szolgálja ki.
   Ha dist/-be generálnánk, az oldalak a /dist/hu/tracks/...
   címen lennének elérhetők, miközben a canonical és a hreflang
   a /hu/tracks/... címre mutat – ez önmagával inkonzisztens
   állapot lenne. */
const KIMENET = GYOKER;
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
    /* A ZÁSZLÓK is az app.js-ből jönnek, nem másoljuk át ide.
       Egy helyen élnek, így nem fordulhat elő, hogy a földgömb és
       a statikus oldalak MÁS zászlót mutatnak ugyanannak az
       országnak. Az IIFE-t (azonnal lefutó függvény) külön kell
       kezelni, mert nem egyszerű objektumliterál. */
    let zaszlok = {};
    const zm = forras.match(/const ZASZLO_SVG = \(\(\) => \{[\s\S]*?\n\}\)\(\);/);
    if (zm) {
        try {
            zaszlok = vm.runInContext(zm[0] + '\nZASZLO_SVG', ctx);
        } catch (e) {
            // A zászlók hiánya nem végzetes: a listák nélkülük is
            // működnek, csak szegényebbek. Ne álljon meg emiatt.
            console.warn('Figyelem: a zászlók nem olvashatók ki az app.js-ből.');
        }
    }

    return { trackDatabase, countryMeta, zaszlok };
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
    /* 11/16 mérföld – ritka, de valós méret. A Century Downs (Alberta)
       hivatalosan ilyen: a Standardbred Canada pályajegyzéke
       "CENTURY DOWNS -- 11/16 MILES" alakban tünteti fel.
       11/16 × 1609 = 1106 m, ami pontosan egyezik az adatunkkal. */
    1106: '11/16 mile',
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
        tracks: "Pályák",
        track: "ügetőpálya",
        city: "Település",
        region: "Régió",
        founded: "Alapítás éve",
        length: "Pálya hossza",
        direction: "Irány",
        status: "Státusz",
        org: "Szervezet",
        site: "Pálya honlapja",
        na: "N/A",
        globe: "Megnézem a földgömbön",
        countries: "Országok",
        history: "Történelem",
        historyOf: "ügetősport története",
        left: "balra",
        right: "jobbra",
        st_active: "Aktív",
        st_inactive: "Inaktív / felfüggesztve",
        st_unknown: "Ismeretlen – ellenőrzendő",
        st_closed: "Véglegesen bezárt",
        desc: (n,v,o) => `${n} (${v}, ${o}) – ügetőpálya elhelyezkedése, alapadatai és státusza a Racecourse360 nemzetközi pályaadatbázisában.`,
        listDesc: (o,db) => `${o} ügetőpályái – ${db} dokumentált versenypálya elhelyezkedéssel, alapadatokkal és státusszal.`,
        races: "Versenyek",
        breeding: "Fajtatörténet",
        sources: "Források",
        feedback: "Pontatlanságot talált? Írjon nekünk:",
        sectionDesc: (cimke, n) => `${cimke} – ${n} feldolgozott téma a Racecourse360 nemzetközi ügetőgyűjteményében.`,
        historyListDesc: (n) => `Az ügetősport története országonként – ${n} ország feldolgozott anyaga a Racecourse360 gyűjteményében.`
    },
    en: {
        tracks: "Tracks",
        track: "harness racing track",
        city: "Town",
        region: "Region",
        founded: "Founded",
        length: "Track length",
        direction: "Direction",
        status: "Status",
        org: "Organisation",
        site: "Track website",
        na: "N/A",
        globe: "View on the globe",
        countries: "Countries",
        history: "History",
        historyOf: "harness racing history",
        left: "left-handed",
        right: "right-handed",
        st_active: "Active",
        st_inactive: "Inactive / suspended",
        st_unknown: "Unknown – to be verified",
        st_closed: "Permanently closed",
        desc: (n,v,o) => `${n} (${v}, ${o}) – harness racing track location, key facts and status in the Racecourse360 international track database.`,
        listDesc: (o,db) => `Harness racing tracks in ${o} – ${db} documented racecourses with location, key facts and status.`,
        races: "Races",
        breeding: "Breed history",
        sources: "Sources",
        feedback: "Spotted an error? Write to us:",
        sectionDesc: (cimke, n) => `${cimke} – ${n} topics covered in the Racecourse360 international harness racing collection.`,
        historyListDesc: (n) => `The history of harness racing by country – ${n} countries covered in the Racecourse360 collection.`
    },
    de: {
        tracks: "Bahnen",
        track: "Trabrennbahn",
        city: "Ort",
        region: "Region",
        founded: "Gegründet",
        length: "Bahnlänge",
        direction: "Laufrichtung",
        status: "Status",
        org: "Verband",
        site: "Website der Bahn",
        na: "N/A",
        globe: "Auf dem Globus ansehen",
        countries: "Länder",
        history: "Geschichte",
        historyOf: "Geschichte des Trabrennsports",
        left: "linksherum",
        right: "rechtsherum",
        st_active: "Aktiv",
        st_inactive: "Inaktiv / ausgesetzt",
        st_unknown: "Unbekannt – zu prüfen",
        st_closed: "Dauerhaft geschlossen",
        desc: (n,v,o) => `${n} (${v}, ${o}) – Lage, Eckdaten und Status der Trabrennbahn in der internationalen Bahndatenbank Racecourse360.`,
        listDesc: (o,db) => `Trabrennbahnen in ${o} – ${db} dokumentierte Bahnen mit Lage, Eckdaten und Status.`,
        races: "Rennen",
        breeding: "Zuchtgeschichte",
        sources: "Quellen",
        feedback: "Fehler entdeckt? Schreiben Sie uns:",
        sectionDesc: (cimke, n) => `${cimke} – ${n} Themen in der internationalen Trabrennsport-Sammlung von Racecourse360.`,
        historyListDesc: (n) => `Die Geschichte des Trabrennsports nach Ländern – ${n} Länder in der Racecourse360-Sammlung.`
    },
    fr: {
        tracks: "Hippodromes",
        track: "hippodrome de trot",
        city: "Commune",
        region: "Région",
        founded: "Fondé en",
        length: "Longueur de la piste",
        direction: "Sens de course",
        status: "Statut",
        org: "Organisation",
        site: "Site de l'hippodrome",
        na: "N/A",
        globe: "Voir sur le globe",
        countries: "Pays",
        history: "Histoire",
        historyOf: "histoire du trot",
        left: "main gauche",
        right: "main droite",
        st_active: "En activité",
        st_inactive: "Inactif / suspendu",
        st_unknown: "Inconnu – à vérifier",
        st_closed: "Définitivement fermé",
        desc: (n,v,o) => `${n} (${v}, ${o}) – situation, données clés et statut de l'hippodrome de trot dans la base internationale Racecourse360.`,
        listDesc: (o,db) => `Hippodromes de trot en ${o} – ${db} pistes documentées avec situation, données clés et statut.`,
        races: "Courses",
        breeding: "Histoire de la race",
        sources: "Sources",
        feedback: "Une erreur ? Écrivez-nous :",
        sectionDesc: (cimke, n) => `${cimke} – ${n} sujets traités dans la collection internationale de trot Racecourse360.`,
        historyListDesc: (n) => `L'histoire du trot par pays – ${n} pays traités dans la collection Racecourse360.`
    },
    sv: {
        tracks: "Banor",
        track: "travbana",
        city: "Ort",
        region: "Region",
        founded: "Grundad",
        length: "Banlängd",
        direction: "Löpriktning",
        status: "Status",
        org: "Organisation",
        site: "Banans webbplats",
        na: "N/A",
        globe: "Visa på jordgloben",
        countries: "Länder",
        history: "Historia",
        historyOf: "travsportens historia",
        left: "vänster",
        right: "höger",
        st_active: "Aktiv",
        st_inactive: "Inaktiv / pausad",
        st_unknown: "Okänd – behöver kontrolleras",
        st_closed: "Permanent stängd",
        desc: (n,v,o) => `${n} (${v}, ${o}) – travbanans läge, fakta och status i Racecourse360:s internationella bandatabas.`,
        listDesc: (o,db) => `Travbanor i ${o} – ${db} dokumenterade banor med läge, fakta och status.`,
        races: "Lopp",
        breeding: "Rasens historia",
        sources: "Källor",
        feedback: "Hittat ett fel? Skriv till oss:",
        sectionDesc: (cimke, n) => `${cimke} – ${n} ämnen i Racecourse360:s internationella travsamling.`,
        historyListDesc: (n) => `Travsportens historia land för land – ${n} länder i Racecourse360:s samling.`
    },
    es: {
        tracks: "Hipódromos",
        track: "hipódromo de trote",
        city: "Localidad",
        region: "Región",
        founded: "Fundado en",
        length: "Longitud de la pista",
        direction: "Sentido de carrera",
        status: "Estado",
        org: "Organización",
        site: "Sitio web del hipódromo",
        na: "N/A",
        globe: "Ver en el globo",
        countries: "Países",
        history: "Historia",
        historyOf: "historia del trote",
        left: "a izquierdas",
        right: "a derechas",
        st_active: "Activo",
        st_inactive: "Inactivo / suspendido",
        st_unknown: "Desconocido – por verificar",
        st_closed: "Cerrado definitivamente",
        desc: (n,v,o) => `${n} (${v}, ${o}) – ubicación, datos clave y estado del hipódromo de trote en la base internacional Racecourse360.`,
        listDesc: (o,db) => `Hipódromos de trote en ${o} – ${db} pistas documentadas con ubicación, datos clave y estado.`,
        races: "Carreras",
        breeding: "Historia de la raza",
        sources: "Fuentes",
        feedback: "¿Ha visto un error? Escríbanos:",
        sectionDesc: (cimke, n) => `${cimke} – ${n} temas en la colección internacional de trote de Racecourse360.`,
        historyListDesc: (n) => `La historia del trote por países – ${n} países en la colección Racecourse360.`
    },
    it: {
        tracks: "Ippodromi",
        track: "ippodromo del trotto",
        city: "Località",
        region: "Regione",
        founded: "Fondato nel",
        length: "Lunghezza della pista",
        direction: "Senso di marcia",
        status: "Stato",
        org: "Organizzazione",
        site: "Sito dell'ippodromo",
        na: "N/A",
        globe: "Vedi sul globo",
        countries: "Paesi",
        history: "Storia",
        historyOf: "storia del trotto",
        left: "sinistrorso",
        right: "destrorso",
        st_active: "Attivo",
        st_inactive: "Inattivo / sospeso",
        st_unknown: "Sconosciuto – da verificare",
        st_closed: "Chiuso definitivamente",
        desc: (n,v,o) => `${n} (${v}, ${o}) – posizione, dati principali e stato dell'ippodromo del trotto nel database internazionale Racecourse360.`,
        listDesc: (o,db) => `Ippodromi del trotto in ${o} – ${db} piste documentate con posizione, dati principali e stato.`,
        races: "Corse",
        breeding: "Storia della razza",
        sources: "Fonti",
        feedback: "Hai notato un errore? Scrivici:",
        sectionDesc: (cimke, n) => `${cimke} – ${n} argomenti nella raccolta internazionale sul trotto di Racecourse360.`,
        historyListDesc: (n) => `La storia del trotto per paese – ${n} paesi nella raccolta Racecourse360.`
    },
    ja: {
        tracks: "競馬場",
        track: "繋駕速歩競走場",
        city: "所在地",
        region: "地域",
        founded: "開設年",
        length: "走路の長さ",
        direction: "走行方向",
        status: "状況",
        org: "団体",
        site: "競馬場の公式サイト",
        na: "N/A",
        globe: "地球儀で見る",
        countries: "国",
        history: "歴史",
        historyOf: "繋駕速歩競走の歴史",
        left: "左回り",
        right: "右回り",
        st_active: "開催中",
        st_inactive: "休止中",
        st_unknown: "不明 – 要確認",
        st_closed: "閉鎖",
        desc: (n,v,o) => `${n}（${v}、${o}）– 繋駕速歩競走場の所在地、基本データ、開催状況を Racecourse360 の国際競馬場データベースで。`,
        listDesc: (o,db) => `${o}の繋駕速歩競走場 – 所在地・基本データ・開催状況を掲載した${db}か所の競走場。`,
        races: "レース",
        breeding: "品種の歴史",
        sources: "出典",
        feedback: "誤りにお気づきですか。ご連絡ください：",
        sectionDesc: (cimke, n) => `${cimke} – Racecourse360 の国際繋駕速歩競走コレクション収録の${n}項目。`,
        historyListDesc: (n) => `国別の繋駕速歩競走の歴史 – Racecourse360 収録の${n}か国。`
    },
    zh: {
        tracks: "赛马场",
        track: "轻驾车赛马场",
        city: "所在地",
        region: "地区",
        founded: "建立年份",
        length: "赛道长度",
        direction: "跑行方向",
        status: "状态",
        org: "组织",
        site: "赛马场网站",
        na: "N/A",
        globe: "在地球仪上查看",
        countries: "国家",
        history: "历史",
        historyOf: "轻驾车赛马历史",
        left: "左转",
        right: "右转",
        st_active: "运营中",
        st_inactive: "暂停运营",
        st_unknown: "未知 – 待核实",
        st_closed: "已永久关闭",
        desc: (n,v,o) => `${n}（${v}，${o}）– 轻驾车赛马场的位置、基本资料与运营状态，收录于 Racecourse360 国际赛马场数据库。`,
        listDesc: (o,db) => `${o}的轻驾车赛马场 – 共${db}处，附位置、基本资料与运营状态。`,
        races: "赛事",
        breeding: "品种历史",
        sources: "来源",
        feedback: "发现错误？请联系我们：",
        sectionDesc: (cimke, n) => `${cimke} – Racecourse360 国际轻驾车赛马专题收录${n}个主题。`,
        historyListDesc: (n) => `各国轻驾车赛马历史 – Racecourse360 收录${n}个国家。`
    },
    ar: {
        tracks: "المضامير",
        track: "مضمار سباق الهرولة",
        city: "البلدة",
        region: "المنطقة",
        founded: "سنة التأسيس",
        length: "طول المضمار",
        direction: "اتجاه السباق",
        status: "الحالة",
        org: "الهيئة",
        site: "موقع المضمار",
        na: "N/A",
        globe: "عرض على الكرة الأرضية",
        countries: "الدول",
        history: "التاريخ",
        historyOf: "تاريخ سباق الهرولة",
        left: "يسار",
        right: "يمين",
        st_active: "نشط",
        st_inactive: "متوقف مؤقتًا",
        st_unknown: "غير معروف – قيد التحقق",
        st_closed: "مغلق نهائيًا",
        desc: (n,v,o) => `${n} (${v}، ${o}) – موقع مضمار سباق الهرولة وبياناته الأساسية وحالته في قاعدة بيانات Racecourse360 الدولية.`,
        listDesc: (o,db) => `مضامير سباق الهرولة في ${o} – ${db} مضمارًا موثقًا مع الموقع والبيانات الأساسية والحالة.`,
        races: "السباقات",
        breeding: "تاريخ السلالة",
        sources: "المصادر",
        feedback: "لاحظت خطأً؟ راسلنا:",
        sectionDesc: (cimke, n) => `${cimke} – ${n} موضوعًا في مجموعة Racecourse360 الدولية لسباقات الهرولة.`,
        historyListDesc: (n) => `تاريخ سباق الهرولة حسب الدولة – ${n} دولة في مجموعة Racecourse360.`
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
   6/B. SLUG BEÍRÁSA AZ APP.JS-BE
   ------------------------------------------------------------
   A jóváhagyott slug-javaslat.json alapján beírja a slug mezőt
   az app.js rekordjaiba, közvetlenül a name mező után.

   Biztonsági elvek:
     · A rekordot NÉV + TELEPÜLÉS párosra azonosítjuk. Ha egy
       tétel nem pontosan egyszer található meg, a szkript
       HIBÁVAL LEÁLL és semmit nem ír ki.
     · Ha egy rekordban már van slug, azt NEM írjuk felül – a
       slug fagyasztott, egy véletlen felülírás eltörné az
       indexelt URL-eket.
     · Íráskor a fájlhossz-változást összevetjük a várttal.

   A neveket JSON.stringify-jal alakítjuk forrásalakra, mert
   négy francia pálya neve idézőjelet tartalmaz (pl.
   Hippodrome "le Vieux Château") – ezek a forrásban escape-elve
   szerepelnek, sima szövegkereséssel nem találhatók meg.
   ============================================================ */

function slugBeir(irjunk) {
    const javaslatFajl = path.join(__dirname, 'slug-javaslat.json');
    if (!fs.existsSync(javaslatFajl)) {
        console.error(`Hiányzik: ${javaslatFajl}`);
        console.error('Előbb futtasd: node tools/generator.mjs --slugok');
        process.exit(1);
    }
    const javaslat = JSON.parse(fs.readFileSync(javaslatFajl, 'utf8'));
    let forras = fs.readFileSync(APP_JS, 'utf8');
    const eredetiHossz = forras.length;

    let sorok = forras.split('\n');
    const hibak = [];
    const beirt = [];
    let marVolt = 0;
    let hosszValtozas = 0;

    for (const [iso, palyak] of Object.entries(javaslat)) {
        for (const t of palyak) {
            const nevMinta = `name: ${JSON.stringify(t.name)}`;
            const varosMinta = t.city === null ? null : `city: ${JSON.stringify(t.city)}`;

            const talalatok = [];
            sorok.forEach((sor, i) => {
                if (!sor.includes(nevMinta)) return;
                if (varosMinta && !sor.includes(varosMinta)) return;
                talalatok.push(i);
            });

            if (talalatok.length === 0) {
                hibak.push(`NEM TALÁLHATÓ: ${iso} / ${t.name} @ ${t.city ?? '—'}`);
                continue;
            }
            if (talalatok.length > 1) {
                hibak.push(
                    `TÖBBSZÖRÖS TALÁLAT (${talalatok.length}): ${iso} / ${t.name} ` +
                    `@ ${t.city ?? '—'} – kézi ellenőrzés kell`
                );
                continue;
            }

            const i = talalatok[0];
            if (/\bslug:\s*"/.test(sorok[i])) { marVolt++; continue; }

            // A minta a `name: "X",` alak – a záró vesszővel együtt.
            // A cserében ezért a vesszőt PÓTOLNI kell a slug után is,
            // különben a következő mező (city) elé nem kerül elválasztó,
            // és a fájl szintaktikailag elromlik.
            const slugJson = JSON.stringify(t.slug);
            sorok[i] = sorok[i].replace(`${nevMinta},`, `${nevMinta}, slug: ${slugJson},`);
            hosszValtozas += `, slug: ${slugJson}`.length;
            beirt.push({ iso, name: t.name, slug: t.slug, sor: i + 1 });
        }
    }

    console.log(`\nSlug beírása – app.js: ${APP_JS}`);
    console.log(`Beírható: ${beirt.length} | Már volt slug: ${marVolt} | Hiba: ${hibak.length}`);

    if (hibak.length) {
        console.error(`\nHIBA (${hibak.length}) – NEM írtunk semmit:`);
        for (const h of hibak.slice(0, 30)) console.error(`  ✗ ${h}`);
        if (hibak.length > 30) console.error(`  … és további ${hibak.length - 30}`);
        process.exit(1);
    }

    if (!irjunk) {
        console.log('\nPRÓBA mód – semmit nem írtunk ki.');
        for (const b of beirt.slice(0, 5)) {
            console.log(`  [sor ${b.sor}] ${b.name} → "${b.slug}"`);
        }
        if (beirt.length > 5) console.log(`  … és további ${beirt.length - 5}`);
        console.log('\nAz élesítéshez a "slug-beir" módot válaszd.');
        return;
    }

    forras = sorok.join('\n');
    const tenyleges = forras.length - eredetiHossz;
    if (tenyleges !== hosszValtozas) {
        console.error(
            `\nBIZTONSÁGI HIBA: a fájl ${tenyleges} bájttal változott, ` +
            `de ${hosszValtozas} volt a várt. NEM írunk.`
        );
        process.exit(1);
    }

    fs.writeFileSync(APP_JS, forras, 'utf8');
    console.log(`\nKiírva. ${beirt.length} slug beírva az app.js-be.`);
    console.log('Következő lépés: ellenoriz, majd general.');
}

/* ============================================================
   SZÖVEGES CIKKEK BEOLVASÁSA
   ------------------------------------------------------------
   A fájl eleje opcionálisan tartalmazhat fejlécet (front matter):

       ---
       cim: A magyar ügetősport története
       leiras: Az 1870-es évektől napjainkig – ...
       forrasok: MLSZ évkönyv 2019; UET archívum
       ---

       ## Kezdetek
       Szövegtörzs Markdown formában…

   A `forrasok` mező nem jelenik meg feltűnően, de utólag
   visszakereshető, honnan jött egy állítás. Ha kiderül, hogy egy
   forrás megbízhatatlan, tudni lehet, mely cikkeket kell átnézni.
   Ugyanaz a logika, mint az ATADAS.md az adatváltozásoknál.
   ============================================================ */

function cikketBeolvas(mappa, nyelv, slug) {
    const fajl = path.join(GYOKER, mappa, nyelv, `${slug}.md`);
    if (!fs.existsSync(fajl)) return null;

    const nyers = fs.readFileSync(fajl, 'utf8').trim();
    if (!nyers) return null;   // létező, de üres fájl = nincs tartalom

    let fejlec = {};
    let torzs = nyers;

    const m = nyers.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (m) {
        for (const sor of m[1].split(/\r?\n/)) {
            const p = sor.indexOf(':');
            if (p > 0) fejlec[sor.slice(0, p).trim()] = sor.slice(p + 1).trim();
        }
        torzs = m[2].trim();
    }

    if (!torzs) return null;
    return { fejlec, torzs };
}

/**
 * Egy szekció összes cikkének összegyűjtése, TELJESSÉGI ELLENŐRZÉSSEL.
 *
 * Végigmegy az összes nyelvi mappán, összeszedi a létező slugokat,
 * majd minden slugnál megnézi, megvan-e MIND A TÍZ nyelven.
 * Ami hiányos, az kimarad – és bekerül a hiánylistába.
 */
function szekciotBeolvas(kulcs) {
    const szek = SZEKCIOK[kulcs];
    const gyoker = path.join(GYOKER, szek.mappa);
    const kesz = {};      // slug -> { nyelv: {fejlec, torzs} }
    const hianyos = [];

    if (!fs.existsSync(gyoker)) return { kesz, hianyos };

    // Az összes előforduló slug összegyűjtése minden nyelvből
    const slugok = new Set();
    for (const ny of NYELVEK) {
        const mappa = path.join(gyoker, ny);
        if (!fs.existsSync(mappa)) continue;
        for (const f of fs.readdirSync(mappa)) {
            if (f.endsWith('.md')) slugok.add(f.slice(0, -3));
        }
    }

    for (const slug of [...slugok].sort()) {
        const nyelvenkent = {};
        const hiany = [];
        for (const ny of NYELVEK) {
            const t = cikketBeolvas(szek.mappa, ny, slug);
            if (t) nyelvenkent[ny] = t; else hiany.push(ny);
        }
        if (hiany.length) {
            hianyos.push({ szekcio: kulcs, slug, hiany });
        } else {
            kesz[slug] = nyelvenkent;
        }
    }
    return { kesz, hianyos };
}

/**
 * Egyszerű Markdown → HTML átalakítás.
 *
 * SZÁNDÉKOSAN minimális: csak azt kezeli, amire egy történeti
 * szövegnek szüksége van (címsorok, bekezdések, kiemelés, listák,
 * linkek, idézet). Nem hozunk be külső csomagot egyetlen
 * szövegtípus kedvéért – kevesebb függőség, kevesebb kockázat.
 *
 * A HTML-t escape-eljük ELŐSZÖR, így a szövegben lévő < > &
 * karakterek nem törhetik el az oldalt, és nyers HTML sem
 * kerülhet be a Markdown-fájlokból.
 */
function markdownHtml(szoveg, ctx) {
    const sorok = esc(szoveg).split(/\r?\n/);
    const ki = [];
    let listaNyitva = false;
    let bekezdes = [];

    const bekezdestZar = () => {
        if (bekezdes.length) {
            ki.push(`<p>${bekezdes.join(' ')}</p>`);
            bekezdes = [];
        }
    };
    const listatZar = () => {
        if (listaNyitva) { ki.push('</ul>'); listaNyitva = false; }
    };

    for (const sor of sorok) {
        const s = sor.trim();

        if (!s) { bekezdestZar(); listatZar(); continue; }

        const cim = s.match(/^(#{2,4})\s+(.*)$/);
        if (cim) {
            bekezdestZar(); listatZar();
            const szint = cim[1].length;   // ## → h2, ### → h3, #### → h4
            ki.push(`<h${szint}>${sorbelso(cim[2])}</h${szint}>`);
            continue;
        }

        const elem = s.match(/^[-*]\s+(.*)$/);
        if (elem) {
            bekezdestZar();
            if (!listaNyitva) { ki.push('<ul>'); listaNyitva = true; }
            ki.push(`<li>${sorbelso(elem[1])}</li>`);
            continue;
        }

        /* PÁLYAHIVATKOZÁS:  @palya: slug
           ------------------------------------------------------------
           A szerző csak a pálya slugját írja le egy külön sorban; a
           linket, a feliratát és a fordítását a generátor állítja elő.
           Így nem kell tíz nyelvi fájlba ugyanazt a hosszú URL-t
           bemásolni, és elgépelés sem juthat élesbe: ha a slug nem
           létezik az adatbázisban, a generálás HIBÁVAL leáll. */
        const palyaHiv = s.match(/^@palya:\s*([a-z0-9-]+)$/);
        if (palyaHiv) {
            bekezdestZar(); listatZar();
            ki.push(palyaLinkHtml(palyaHiv[1], ctx));
            continue;
        }

        const idezet = s.match(/^&gt;\s*(.*)$/);
        if (idezet) {
            bekezdestZar(); listatZar();
            ki.push(`<blockquote>${sorbelso(idezet[1])}</blockquote>`);
            continue;
        }

        bekezdes.push(sorbelso(s));
    }
    bekezdestZar(); listatZar();
    return ki.join('\n');
}

/* ============================================================
   PÁLYAHIVATKOZÁS FELOLDÁSA
   ------------------------------------------------------------
   A @palya: jelölésből teljes hivatkozást épít:
     · link a STATIKUS adatlapra (a kereső ezt járja be), és
     · link a FÖLDGÖMBRE, az adott pályára fókuszálva.

   A slugot a TELJES adatbázisban keressük, nem csak az adott
   országban: egy francia országcikkben is állhat hivatkozás egy
   belga pályára, ha a történet úgy kívánja.

   Ha a slug nem található, a generálás HIBÁVAL leáll. Ez tudatos:
   egy néma törött link rosszabb, mint egy megállított futás –
   utóbbi kijavítható, előbbi hónapokig észrevétlen maradhat.
   ============================================================ */

/** Globális slug-index. A general() tölti fel, egyszer. */
let PALYA_INDEX = null;

function palyaIndexEpit(trackDatabase, orszagok) {
    PALYA_INDEX = new Map();
    for (const [iso, palyak] of Object.entries(trackDatabase)) {
        const o = orszagok[iso];
        if (!o) continue;
        for (const t of palyak) {
            if (t.slug) PALYA_INDEX.set(t.slug, { iso, orszagSlug: o.slug, palya: t });
        }
    }
}

function palyaLinkHtml(slug, ctx) {
    const talalat = PALYA_INDEX && PALYA_INDEX.get(slug);
    if (!talalat) {
        throw new Error(
            `Ismeretlen pálya-hivatkozás: "@palya: ${slug}" ` +
            `(${(ctx && ctx.honnan) || 'ismeretlen fájl'}). ` +
            `Ellenőrizd a slugot az adatbázisban.`
        );
    }
    const nyelv = (ctx && ctx.nyelv) || ALAP_NYELV;
    const { iso, orszagSlug, palya } = talalat;
    return `<p class="rc-palyalink">` +
        `<a href="/${nyelv}/tracks/${orszagSlug}/${slug}/">${esc(palya.name)} &rsaquo;</a>` +
        `<a class="rc-globe-link" href="/?track=${iso}:${slug}">${esc(sz(nyelv, 'globe'))}</a>` +
        `</p>`;
}

/** Soron belüli formázás: **félkövér**, *dőlt*, [szöveg](cím) */
function sorbelso(s) {
    return s
        // [szöveg](cím) → <a href="cím">szöveg</a>
        // Csak http/https címet fogadunk el, hogy a Markdown-fájlból
        // ne kerülhessen be javascript: vagy data: séma.
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
                 (_, szoveg, cim) => `<a href="${cim}" rel="noopener">${szoveg}</a>`)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

/**
 * Az első bekezdés kinyerése meta description-nek.
 * A leírás ~155 karakternél hosszabb része a találatban úgyis
 * levágódik, ezért SZÓHATÁRON rövidítünk – a félbevágott szó
 * igénytelennek hat a keresőtalálatban.
 */
function elsoBekezdes(torzs, maxHossz = 155) {
    const elso = torzs
        .split(/\r?\n\s*\r?\n/)
        .map(b => b.trim())
        .find(b => b && !b.startsWith('#') && !b.startsWith('@palya:'));
    if (!elso) return '';
    const tiszta = elso
        .replace(/[#*>]/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
    if (tiszta.length <= maxHossz) return tiszta;
    return tiszta.slice(0, tiszta.lastIndexOf(' ', maxHossz)).trim() + '…';
}

/* ============================================================
   7. HTML-SABLONOK
   ============================================================ */

const esc = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * hreflang sorok.
 *
 * A nyelvLista opcionális: ha meg van adva, CSAK azokra a nyelvekre
 * generálunk hreflang-ot, amelyeken az oldal ténylegesen létezik.
 * Ez a történeti oldalaknál lényeges, ahol egy ország szövege
 * lehet, hogy csak magyarul és angolul van meg. Nem létező oldalra
 * mutató hreflang hibás jelzés – a kereső 404-et talál, és az egész
 * nyelvi csoportot megbízhatatlannak minősítheti.
 */
function hreflangSorok(utvonalFn, nyelvLista) {
    const lista = nyelvLista && nyelvLista.length ? nyelvLista : NYELVEK;
    const sorok = lista.map(ny =>
        `  <link rel="alternate" hreflang="${ny}" href="${BAZIS_URL}${utvonalFn(ny)}">`
    );
    // Az x-default az angolra mutat, ha van angol változat;
    // egyébként a lista első elemére.
    const alap = lista.includes(ALAP_NYELV) ? ALAP_NYELV : lista[0];
    sorok.push(`  <link rel="alternate" hreflang="x-default" href="${BAZIS_URL}${utvonalFn(alap)}">`);
    return sorok.join('\n');
}

function fejlec({ nyelv, cim, leiras, kanonikus, utvonalFn, nyelvLista, extraFej = '' }) {
    const dir = JOBBRA_IRO.includes(nyelv) ? ' dir="rtl"' : '';
    return `<!DOCTYPE html>
<html lang="${nyelv}"${dir}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(cim)}</title>
  <meta name="description" content="${esc(leiras)}">
  <link rel="canonical" href="${BAZIS_URL}${kanonikus}">
${hreflangSorok(utvonalFn, nyelvLista)}
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(cim)}">
  <meta property="og:description" content="${esc(leiras)}">
  <meta property="og:url" content="${BAZIS_URL}${kanonikus}">
  <meta property="og:site_name" content="Racecourse360">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#1E110B">
  <link rel="icon" href="/favicon/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16x16.png">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="48x48" href="/favicon/favicon-48x48.png">
  <link rel="icon" type="image/png" sizes="96x96" href="/favicon/favicon-96x96.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/favicon/favicon-192x192.png">
  <link rel="apple-touch-icon" href="/favicon/apple-touch-icon.png">
  <link rel="manifest" href="/favicon/site.webmanifest">
  <meta name="msapplication-TileImage" content="/favicon/mstile-150x150.png">
  <meta name="msapplication-TileColor" content="#1E110B">
  <link rel="stylesheet" href="/css/statikus.css">
${extraFej}</head>
<body>
${oldalFejlec(nyelv)}`;
}

/* ============================================================
   OLDALFEJLÉC
   ------------------------------------------------------------
   A statikus oldalakon eddig NEM volt fejléc: aki a keresőből
   érkezett egy pálya-adatlapra, csak egy morzsamenüt és egy címet
   látott. Nem derült ki, hol jár, és nem volt hova továbbmenni.

   A logó SZÖVEGBŐL épül, nem képből. Ennek oka: a földgömb
   logója base64-ként az index.html-ben él, és egy külön képfájl
   új hálózati kérést jelentene minden oldalon – 5570 oldalnál ez
   érezhető. A betűs változat azonnal megjelenik, nulla kéréssel,
   és a márka betűképe (RACECOURSE + arany 360.com) így is
   felismerhető.
   ============================================================ */
function oldalFejlec(nyelv) {
    const menu = [
        ['tracks',   'tracks'],
        ['history',  'history'],
        ['races',    'races'],
        ['breeding', 'breeding']
    ].map(([ut, kulcs]) =>
        `<a href="/${nyelv}/${ut}/">${esc(sz(nyelv, kulcs))}</a>`
    ).join('');

    /* A LOGÓ az eredeti képfájl, a repó GYÖKERÉBŐL: /logo.png
       ------------------------------------------------------------
       Ugyanaz a kép, mint a földgömb fejlécében – így a két felület
       egységes márkaképet mutat. Külön erőforrásként (nem base64
       beágyazva), mert 5570 oldalról van szó: a böngésző egyszer
       tölti le, utána gyorsítótárból veszi.

       A width/height attribútum megadása fontos: e nélkül a kép
       betöltésekor "megugrik" az elrendezés, ami rontja a Core Web
       Vitals mutatót. Az eredeti arány 846:132, ebből 150×23 pixel. */
    return `<header class="rc-fejlec">
  <div class="rc-fejlec-belso">
    <a class="rc-logo" href="/?lang=${nyelv}">
      <img src="/logo.png" alt="Racecourse360" width="150" height="23" decoding="async">
    </a>
    <nav class="rc-fonav">${menu}</nav>
  </div>
</header>
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

function orszagOldal({ nyelv, iso, orszag, palyak, zaszlok }) {
    const zaszlo = (zaszlok && zaszlok[iso])
        ? `<span class="rc-flag rc-flag-nagy" aria-hidden="true">${zaszlok[iso]}</span>` : '';
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
  <h1 class="rc-cim-zaszloval">${zaszlo}${esc(orszagNev)}</h1>
  <ul class="rc-palyalista">
${elemek}
  </ul>
</main>
` + LABLEC;
}

function orszaglistaOldal({ nyelv, orszagok, trackDatabase, zaszlok }) {
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
    /* A zászló az app.js-ből jön (egy forrás), és aria-hidden:
       díszítő elem, az országnév adja a jelentést – képernyőolvasó
       ne mondja fel kétszer ugyanazt. */
    const elemek = isok.map(iso => {
        const o = orszagok[iso];
        const nev = o.nev[nyelv] || o.nev[ALAP_NYELV];
        const z = (zaszlok && zaszlok[iso])
            ? `<span class="rc-flag" aria-hidden="true">${zaszlok[iso]}</span>` : '';
        return `      <li><a href="/${nyelv}/tracks/${o.slug}/">${z}` +
               `<span class="rc-oszagnev">${esc(nev)}</span>` +
               `<span class="rc-db">${trackDatabase[iso].length}</span></a></li>`;
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
   SZÖVEGES OLDALAK SABLONJA
   ============================================================ */

function cikkOldal({ nyelv, szekcioKulcs, slug, tartalom, orszag, palyak }) {
    const szek = SZEKCIOK[szekcioKulcs];
    const utvonalFn = ny => `/${ny}/${szek.utvonal}/${slug}/`;
    const kanonikus = utvonalFn(nyelv);

    /* A CÍM a fájl fejlécéből jön. Ha nincs megadva, országoknál az
       országnévből képezzük – a versenyeknél és lovaknál viszont
       NEM találgatunk, mert ott a slug nem feltétlenül olvasható
       címként (pl. "prix-d-amerique"). */
    const cim = tartalom.fejlec.cim ||
        (orszag ? `${orszag.nev[nyelv] || orszag.nev[ALAP_NYELV]} – ${szek.cimkeKulcs === 'history' ? sz(nyelv, 'historyOf') : sz(nyelv, szek.cimkeKulcs)}`
                : slug);
    const leiras = tartalom.fejlec.leiras || elsoBekezdes(tartalom.torzs);

    const jsonld = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: cim,
        description: leiras,
        inLanguage: nyelv,
        mainEntityOfPage: `${BAZIS_URL}${kanonikus}`,
        publisher: { '@type': 'Organization', name: 'Racecourse360', url: BAZIS_URL }
    };
    if (orszag) {
        jsonld.about = { '@type': 'Country', name: orszag.nev[nyelv] || orszag.nev[ALAP_NYELV] };
    }
    const extraFej = `  <script type="application/ld+json">${JSON.stringify(jsonld)}</script>\n`;

    /* ADATBÁZIS-KAPCSOLAT
       Ez a szekció valódi hozzáadott értéke: a történeti szöveg
       mellé odatesszük, amit CSAK a mi adatbázisunk tud – hány
       pálya van az országban, mennyi aktív, melyik a legrégebbi.
       Ez nem kézzel írt szöveg, hanem a trackDatabase-ből számolt
       adat, tehát mindig naprakész marad. */
    let adatDoboz = '';
    if (orszag && palyak && palyak.length) {
        const aktiv = palyak.filter(p => (p.status || 'active') === 'active').length;
        const evek = palyak.map(p => p.founded).filter(Boolean);
        const legregebbi = evek.length ? Math.min(...evek) : null;
        adatDoboz =
`  <aside class="rc-adatdoboz">
    <dl>
      <div><dt>${esc(sz(nyelv, 'tracks'))}</dt><dd>${palyak.length}</dd></div>
      <div><dt>${esc(sz(nyelv, 'st_active'))}</dt><dd>${aktiv}</dd></div>` +
      (legregebbi ? `\n      <div><dt>${esc(sz(nyelv, 'founded'))}</dt><dd>${legregebbi}</dd></div>` : '') +
`
    </dl>
    <p><a href="/${nyelv}/tracks/${orszag.slug}/">${esc(sz(nyelv, 'tracks'))} &rsaquo;</a></p>
  </aside>`;
    }

    const forrasok = tartalom.fejlec.forrasok
        ? `  <p class="rc-forras">${esc(sz(nyelv, 'sources'))}: ${esc(tartalom.fejlec.forrasok)}</p>`
        : '';

    return fejlec({ nyelv, cim, leiras, kanonikus, utvonalFn, extraFej }) +
`<main class="rc-cikkoldal">
  <nav class="rc-morzsa">
    <a href="/${nyelv}/${szek.utvonal}/">${esc(sz(nyelv, szek.cimkeKulcs))}</a>
  </nav>
  <h1>${esc(cim)}</h1>
${adatDoboz}
  <article class="rc-cikk">
${markdownHtml(tartalom.torzs, { nyelv, honnan: `${szek.mappa}/${nyelv}/${slug}.md` })}
  </article>
${forrasok}
  <p class="rc-visszajelzes">${esc(sz(nyelv, 'feedback'))}
    <a href="mailto:info@racecourse360.com">info@racecourse360.com</a></p>
</main>
` + LABLEC;
}

/* ============================================================
   NYELVI GYÖKÉR — átirányítás a földgömbre
   ------------------------------------------------------------
   A /hu/, /en/, /de/ … címek eddig 404-et adtak: a hierarchiában
   lyuk volt a /hu/tracks/ fölött. Aki a keresőből egy mély
   oldalra érkezett és felfelé navigált, semmit nem talált.

   A megoldás NEM külön nyitólap: a földgömb a projekt legerősebb
   vizuális eleme, oda érdemes irányítani a látogatót. Ez az oldal
   ezért csak átvezet a gyökérre, az adott nyelvet beállítva.

   Miért nem szerver-oldali 301: a Worker statikus fájlokat
   szolgál ki, és egy átirányítási szabályt kézzel kellene
   karbantartani tíz nyelvre. Így a generátor gondoskodik róla.

   Két rétegű a megoldás, mert egyik sem elég önmagában:
     · <link rel="canonical"> a gyökérre – a keresőnek jelzi,
       hogy ez nem önálló tartalom, hanem a főoldal;
     · meta refresh + JS – a látogatót ténylegesen átviszi.
   A noindex SZÁNDÉKOS: ez az oldal nem tartalom, nem is akarjuk
   a találatok között látni.
   ============================================================ */
function nyelviGyoker(nyelv) {
    const dir = JOBBRA_IRO.includes(nyelv) ? ' dir="rtl"' : '';
    const cel = `/?lang=${nyelv}`;
    return `<!DOCTYPE html>
<html lang="${nyelv}"${dir}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, follow">
  <title>Racecourse360</title>
  <link rel="canonical" href="${BAZIS_URL}/">
  <meta http-equiv="refresh" content="0; url=${cel}">
  <link rel="icon" href="/favicon/favicon.ico" sizes="any">
  <script>window.location.replace(${JSON.stringify(cel)});</script>
  <link rel="stylesheet" href="/css/statikus.css">
</head>
<body>
<main class="rc-lista">
  <p><a href="${cel}">Racecourse360 &rsaquo;</a></p>
</main>
</body>
</html>
`;
}

function cikkLista({ nyelv, szekcioKulcs, elemek }) {
    const szek = SZEKCIOK[szekcioKulcs];
    const utvonalFn = ny => `/${ny}/${szek.utvonal}/`;
    const kanonikus = utvonalFn(nyelv);
    const cimke = sz(nyelv, szek.cimkeKulcs);
    const cim = `${cimke} | Racecourse360`;
    const leiras = sz(nyelv, 'sectionDesc')(cimke, elemek.length);

    const sorok = elemek
        .sort((a, b) => a.cim.localeCompare(b.cim))
        .map(e => `      <li><a href="/${nyelv}/${szek.utvonal}/${e.slug}/">${esc(e.cim)}</a></li>`)
        .join('\n');

    return fejlec({ nyelv, cim: cimke, leiras, kanonikus, utvonalFn }) +
`<main class="rc-lista">
  <h1>${esc(cimke)}</h1>
  <ul class="rc-orszaglista">
${sorok}
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
   A KORÁBBI KIMENET CÉLZOTT TAKARÍTÁSA
   ------------------------------------------------------------
   KRITIKUS: a KIMENET a repó GYÖKERE. Egy `rm -rf KIMENET`
   letörölné az index.html-t, a js/ és css/ mappát, a tools/-t –
   gyakorlatilag az egész projektet.

   Ezért NEM a kimeneti könyvtárat töröljük, hanem PONTOSAN
   azokat az elemeket, amiket mi magunk hoztunk létre:
     · a nyelvi mappákat (hu/, en/, de/ …) – de csak azokat,
       amik a NYELVEK listában szerepelnek,
     · a sitemap-*.xml fájlokat és a sitemap.xml-t.

   Minden más érintetlen marad. Ha egy nyelvi kód később
   kikerülne a NYELVEK listából, annak a mappáját kézzel kell
   törölni – ez tudatos döntés: a szkript inkább hagyjon ott
   valamit, mint hogy tévedésből töröljön.
   ============================================================ */
/* A projekt saját mappái és fájljai. Ezeket a takarítás SOHA nem
   érintheti, még akkor sem, ha valaki tévedésből felvenné őket a
   NYELVEK listába. A `js` és a `css` ugyanis szintén 2-3 betűs,
   tehát a puszta hosszellenőrzés nem lenne elég védelem. */
const VEDETT = new Set([
    'js', 'css', 'img', 'kep', 'kepek', 'tools', 'src', 'lib',
    'api', 'doc', 'docs', 'bin', 'dev', 'www'
]);

function korabbiKimenetTakaritasa() {
    const torolt = [];

    for (const ny of NYELVEK) {
        // Kettős védelem: a nyelvi kód csak 2-3 kisbetű lehet, ÉS nem
        // szerepelhet a védett nevek között.
        if (!/^[a-z]{2,3}$/.test(ny)) {
            throw new Error(`Gyanús nyelvi kód, nem törlünk: "${ny}"`);
        }
        if (VEDETT.has(ny)) {
            throw new Error(
                `A "${ny}" a projekt saját mappája, nem nyelvi kód. ` +
                `Ellenőrizd a NYELVEK listát – nem törlünk semmit.`
            );
        }
        const mappa = path.join(KIMENET, ny);
        // Csak akkor törlünk, ha tényleg MAPPA (nem fájl, nem symlink).
        if (fs.existsSync(mappa) && fs.lstatSync(mappa).isDirectory()) {
            fs.rmSync(mappa, { recursive: true, force: true });
            torolt.push(`${ny}/`);
        }
    }

    for (const f of fs.readdirSync(KIMENET)) {
        if (/^sitemap(-[a-z]{2,3})?\.xml$/.test(f)) {
            fs.rmSync(path.join(KIMENET, f), { force: true });
            torolt.push(f);
        }
    }

    return torolt;
}

/* ============================================================
   9. GENERÁLÁS
   ============================================================ */

function ir(relUtvonal, tartalom) {
    const teljes = path.join(KIMENET, relUtvonal);
    fs.mkdirSync(path.dirname(teljes), { recursive: true });
    fs.writeFileSync(teljes, tartalom, 'utf8');
}

function general(trackDatabase, countryMeta, orszagok, zaszlok) {
    const figyelmeztetesek = [];
    let oldalDb = 0;
    const sitemapFajlok = [];

    /* A pálya-slugok indexe: ebből oldjuk fel a @palya: jelöléseket.
       Egyszer épül fel, minden cikk ezt használja. */
    palyaIndexEpit(trackDatabase, orszagok);

    /* A három szöveges szekció beolvasása. A teljességi ellenőrzés
       itt fut le: ami nincs meg mind a tíz nyelven, az KIMARAD. */
    const szekcioAdat = {};
    for (const kulcs of Object.keys(SZEKCIOK)) {
        const { kesz, hianyos } = szekciotBeolvas(kulcs);
        szekcioAdat[kulcs] = kesz;
        for (const h of hianyos) {
            figyelmeztetesek.push(
                `KIMARADT (${h.szekcio}/${h.slug}) – hiányzó nyelv: ${h.hiany.join(', ')}`
            );
        }
    }

    for (const nyelv of NYELVEK) {
        const urlek = [`/${nyelv}/tracks/`];

        /* Nyelvi gyökér: /hu/, /en/ … – átirányít a földgömbre.
           SZÁNDÉKOSAN nem kerül a sitemapbe: noindex oldal, a
           keresőnek nincs mit kezdenie vele. */
        ir(`${nyelv}/index.html`, nyelviGyoker(nyelv));
        oldalDb++;

        ir(`${nyelv}/tracks/index.html`,
            orszaglistaOldal({ nyelv, orszagok, trackDatabase, zaszlok }));
        oldalDb++;

        for (const [iso, palyak] of Object.entries(trackDatabase)) {
            const orszag = orszagok[iso];
            if (!orszag) continue;

            ir(`${nyelv}/tracks/${orszag.slug}/index.html`,
                orszagOldal({ nyelv, iso, orszag, palyak, zaszlok }));
            urlek.push(`/${nyelv}/tracks/${orszag.slug}/`);
            oldalDb++;

            for (const palya of palyak) {
                ir(`${nyelv}/tracks/${orszag.slug}/${palya.slug}/index.html`,
                    palyaOldal({ nyelv, palya, iso, orszag, countryMeta, figyelmeztetesek }));
                urlek.push(`/${nyelv}/tracks/${orszag.slug}/${palya.slug}/`);
                oldalDb++;
            }
        }

        /* SZÖVEGES SZEKCIÓK
           Csak azok a szekciók kapnak listaoldalt, amelyekben van
           legalább egy kész cikk – üres listaoldal nem generálódik. */
        for (const [kulcs, cikkek] of Object.entries(szekcioAdat)) {
            const slugok = Object.keys(cikkek);
            if (!slugok.length) continue;
            const szek = SZEKCIOK[kulcs];
            const elemek = [];

            for (const slug of slugok) {
                const tartalom = cikkek[slug][nyelv];
                // Országtörténetnél az adatbázis-adatokat is átadjuk.
                const iso = kulcs === 'history'
                    ? Object.keys(orszagok).find(i => orszagok[i].slug === slug)
                    : null;
                const orszag = iso ? orszagok[iso] : null;
                const palyak = iso ? (trackDatabase[iso] || []) : null;

                ir(`${nyelv}/${szek.utvonal}/${slug}/index.html`,
                    cikkOldal({ nyelv, szekcioKulcs: kulcs, slug, tartalom, orszag, palyak }));
                urlek.push(`/${nyelv}/${szek.utvonal}/${slug}/`);
                oldalDb++;

                elemek.push({
                    slug,
                    cim: tartalom.fejlec.cim ||
                         (orszag ? (orszag.nev[nyelv] || orszag.nev[ALAP_NYELV]) : slug)
                });
            }

            ir(`${nyelv}/${szek.utvonal}/index.html`,
                cikkLista({ nyelv, szekcioKulcs: kulcs, elemek }));
            urlek.push(`/${nyelv}/${szek.utvonal}/`);
            oldalDb++;
        }

        const fajl = `sitemap-${nyelv}.xml`;
        ir(fajl, sitemapXml(urlek));
        sitemapFajlok.push(fajl);
    }

    ir('sitemap.xml', sitemapIndexXml(sitemapFajlok));

    /* A robots.txt-t a generátor SZÁNDÉKOSAN NEM írja.
       ------------------------------------------------------------
       A gyökérben lévő robots.txt kézzel karbantartott, 175 soros
       fájl: nevesített keresőmotor-csoportokat, SEO-elemző és
       AI-tréning botok tiltását, valamint a belső munkafájlok
       (uj_palyak.json, javaslatok.json, tools/) kizárását tartalmazza.
       Egy generált, kétsoros változat mindezt megsemmisítené.

       Az indexelés elleni védelmet fejlesztési fázisban amúgy sem a
       robots.txt adja, hanem a Worker Basic Auth-ja: oda egyetlen
       bot sem jut be, függetlenül attól, mi áll a robots.txt-ben.

       A meglévő fájl már hivatkozik a sitemap.xml-re, amit ez a
       szkript most ténylegesen létre is hoz – tehát a kettő
       összeillik, nincs teendő. */

    // A mérföld-figyelmeztetések ismétlődnek nyelvenként — egyszeresítjük.
    const egyedi = [...new Set(figyelmeztetesek)];
    return { oldalDb, figyelmeztetesek: egyedi };
}

/* ============================================================
   10. BELÉPÉSI PONT
   ============================================================ */

function main() {
    const mod = process.argv[2] || '--ellenoriz';
    const { trackDatabase, countryMeta, zaszlok } = adatBeolvas();

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

    if (mod === '--slug-proba' || mod === '--slug-beir') {
        slugBeir(mod === '--slug-beir');
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
        console.error('Használat: --slugok | --slug-proba | --slug-beir | --ellenoriz | --general');
        process.exit(1);
    }

    const torolt = korabbiKimenetTakaritasa();
    if (torolt.length) {
        console.log(`Korábbi kimenet törölve: ${torolt.join(', ')}`);
    }
    const eredmeny = general(trackDatabase, countryMeta, orszagok, zaszlok);
    console.log(`Generálva: ${eredmeny.oldalDb} oldal + ${NYELVEK.length} sitemap`);
    console.log(`Kimenet: ${KIMENET}`);
    if (eredmeny.figyelmeztetesek.length) {
        console.log(`\nHosszmegjelenítési figyelmeztetés:`);
        for (const f of eredmeny.figyelmeztetesek) console.log(`  · ${f}`);
    }
    console.log('\nEmlékeztető: a robots.txt érintetlen maradt (kézzel karbantartott).');
}

main();
