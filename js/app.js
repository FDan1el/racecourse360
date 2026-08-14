/* ============================================================
   KORAI HIBAJELZŐ  (a fájl legelső végrehajtott kódja)
   ------------------------------------------------------------
   MIÉRT VAN ITT: ha a betöltés során BÁRHOL hiba keletkezik a
   top-level kódban, a böngésző megállítja a script futását. Minden
   hiba UTÁNI let/const inicializálatlan marad, és a felhasználó
   csak érthetetlen tüneteket lát (pl. "Cannot access 'X' before
   initialization"), amikor később rákattint valamire.

   Mobilon nem lehet fejlesztői konzolt nyitni, ezért ez a kezelő a
   képernyőn látható #geoStatus dobozba írja ki a VALÓDI hibát és a
   PONTOS SORSZÁMOT. Így egy képernyőkép elég a hibakereséshez.
   ============================================================ */
window.addEventListener('error', function (esemeny) {
    try {
        var doboz = document.getElementById('geoStatus');
        if (!doboz) return;
        var hol = (esemeny.lineno ? (' [sor ' + esemeny.lineno + ':' + (esemeny.colno || 0) + ']') : '');
        doboz.textContent = 'BETÖLTÉSI HIBA: ' + (esemeny.message || 'ismeretlen') + hol;
        doboz.style.display = 'block';
        doboz.style.color = '#fca5a5';
        doboz.style.borderColor = '#ef4444';
        doboz.style.zIndex = '950';
    } catch (e) { /* a hibajelző soha ne okozzon újabb hibát */ }
});

/* A felület nyelve. SZÁNDÉKOSAN a fájl tetején van deklarálva:
   korábban lentebb állt, és ha felette bárhol hiba keletkezett, ez a
   változó inicializálatlan (TDZ) állapotban maradt - ilyenkor a
   Pályák menü megnyitása "Cannot access 'aktualisNyelv' before
   initialization" hibával elszállt. Itt fent ez nem fordulhat elő. */
let aktualisNyelv = 'hu';

/* ==========================================================
   Racecourse360 – MOTOR (adat + alkalmazáslogika)
   ==========================================================
   Két jól elkülönített szakasz:

     1. SZAKASZ – ADAT
        trackDatabase : a versenypályák országonként
        countryMeta   : országos metaadatok és szervezeti linkek
        Itt módosíts, ha pályát javítasz vagy újat veszel fel.

     2. SZAKASZ – LOGIKA
        3D földgömb (Globe.gl), 2D térkép (Leaflet), menük,
        nyelvváltás, cookie-kezelés, adatlapok.
        Itt módosíts, ha a működésen változtatsz.

   A két szakasz között NINCS átfedés: a logika csak OLVASSA
   az adatot. A szakaszhatárt a "2. SZAKASZ" fejléc jelöli.

   Egy pálya mezői:
     name, city, lat, lng          alapadatok (kötelező)
     status                        "active" | "inactive" | "unknown" | "closed"
     founded, length               szám vagy null
     org                           üzemeltető/szervezet neve
     ownSite                       a pálya saját honlapja vagy null
     operatorSite, operatorName    üzemeltetői/szervezeti oldal vagy null
     note                          történet és megjegyzések
     historyVerified: true         ha ellenőrzött, a "Történet" fül aktív lesz
     trotSince                     mióta rendeznek ott ÜGETŐVERSENYT, ha ez
                                    ELTÉR a pálya alapításától. Sok pálya
                                    galoppra épült, és később kapott ügetőt:
                                      Menangle:  1914 galopp → 1953 ügető
                                      Belgrád:   1914 pálya  → 1930 ügető
                                      Kincsem:   1925 pálya  → 2004 ügető
                                    Ha megegyezik az alapítással, marad null.
     surface                       "homok" | "fű" | "zúzalék" | "salak" | null
     width                         a pálya szélessége méterben, vagy null
     openStretch                   true, ha van külön előzősáv a célegyenesben
                                    ("open stretch"). Skandináv sajátosság,
                                    ami érdemben megváltoztatja a taktikát.
     turnRadius                    a kanyar sugara méterben. Sehol máshol nem
                                    szerepel, pedig sokat elárul: a kis sugár
                                    éles kanyart jelent, ami más taktikát kíván.
                                    Forrás: Harness Racing Australia adatlapok.
     finalStraight                 a célegyenes hossza méterben, vagy null.
                                    A szerb UKSS és a svájci szövetség közli;
                                    a pálya jellegét sokat elárulja (a rövid
                                    célegyenes élesebb versenyt jelent).
     image                         { url, license, attribution, verified } vagy null
                                    - url: Wikimedia Commons fájloldal (sosem a nyers
                                      fájl-URL, mindig a leírólap, ami a licencet mutatja)
                                    - license: pontosan a Commons oldalon feltüntetett
                                      licenc-szöveg (pl. "CC BY-SA 3.0", "Public domain (PD-self)")
                                    - attribution: fotós/feltöltő neve, vagy null, ha
                                      még nem azonosított (SOHA nem találgatjuk)
                                    - verified: true, ha vizuálisan megerősítve, hogy a
                                      kép kizárólag épületet/pályát mutat, felismerhető
                                      emberek vagy 1-2 ló nélkül; egyébként false
   ========================================================== */


/* ==========================================================
   1. SZAKASZ – ADAT
   ========================================================== */

const trackDatabase = {
    SWE: [
        { name: "Jägersro", slug: "jagersro", city: "Malmö", lat: 55.5699, lng: 13.0697, founded: 1907, status: "active", length: 1000, direction: "left", org: "Skånska Travsällskapet / Svensk Travsport", ownSite: "https://www.travsport.se/travbanor/jagersro/", operatorSite: null, operatorName: null, note: "Svédország legrégebbi pályája; egyetlen kombinált ügető-galopp aréna" },
        { name: "Solvalla", slug: "solvalla", city: "Stockholm", lat: 59.3666, lng: 17.9397, founded: 1927, status: "active", length: 1000, direction: "left", org: "Stockholms Travsällskap / Svensk Travsport", ownSite: "https://www.solvalla.se/", operatorSite: null, operatorName: null, note: "Skandinávia legnagyobb pályája; az Elitloppet otthona", image: { url: "https://commons.wikimedia.org/wiki/File:Solvalla_1.JPG", license: "CC BY-SA 3.0", attribution: "Jan Ainali", verified: true } },
        { name: "Åbytravet", slug: "abytravet", city: "Mölndal", lat: 57.6500, lng: 12.0017, founded: 1936, status: "active", length: 1000, direction: "left", org: "Svensk Travsport", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Svédország 2. legnagyobb pályája" },
        { name: "Färjestad", slug: "farjestad", city: "Karlstad", lat: 59.4085, lng: 13.5006, founded: 1936, status: "active", length: 1000, direction: "left", org: "Svensk Travsport", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Unionstravet – közös svéd-norvég futam", image: { url: "https://commons.wikimedia.org/wiki/File:Färjestad_Travbana.JPG", license: "CC BY-SA 3.0", attribution: "Janee", verified: true } },
        { name: "Bergsåkers travbana", slug: "bergsakers-travbana", city: "Sundsvall", lat: 62.4151, lng: 17.2269, founded: 1932, status: "active", length: 1000, direction: "left", org: "Norrlands Travsällskap / Svensk Travsport", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", finalStraight: 200, width: 21.5, openStretch: false, note: "Svédország 3. legrégebbi pályája. Svensk Travsport adatai: 1000 m, 200 m célegyenes (az ország egyik leghosszabbja), 21,5 m szélesség, nincs open stretch. Az ország harmadik legrégebbi pályája, 1932. június 24-én avatták; a Norrlands Travsällskap egy évvel korábban alakult. Solvalla, Åby és Jägersro után a negyedik legnagyobb svéd pálya." },
        { name: "Axevalla travbana", slug: "axevalla-travbana", city: "Axvall", lat: 58.4006, lng: 13.5642, founded: 1956, status: "active", length: 1000, direction: "left", org: "Svensk Travsport", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Az ország leghosszabb célegyenese" },
        { name: "Sundbyholms travbana", slug: "sundbyholms-travbana", city: "Eskilstuna", lat: 59.4388, lng: 16.6138, founded: 1955, status: "active", length: 1000, direction: "left", org: "Sörmlands Travsällskap", ownSite: "https://www.sundbyholm.com/", operatorSite: null, operatorName: null, note: "A Breeders' Crown döntőinek helyszíne 2008 óta" },
        { name: "Bodentravet", slug: "bodentravet", city: "Boden", lat: 65.8133, lng: 21.7057, founded: 1944, status: "active", length: 1000, direction: "left", org: "Norrbottens Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Svédország legészakibb travbanája" },
        { name: "Gävletravet", slug: "gavletravet", city: "Gävle", lat: 60.6885, lng: 17.1384, founded: 1938, status: "active", length: 1000, direction: "left", org: "Gefle-Dala Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "\"Sveriges snabbaste bana\" – az ország leggyorsabb pályája" },
        { name: "Hagmyren", slug: "hagmyren", city: "Hudiksvall", lat: 61.7729, lng: 17.1145, founded: 1956, status: "active", length: 1000, direction: "left", org: "Norra Hälsinglands Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "A legendás Nordin fivérek szülőföldje" },
        { name: "Halmstadtravet", slug: "halmstadtravet", city: "Halmstad", lat: 56.6905, lng: 12.9277, founded: 1969, status: "active", length: 1000, direction: "left", org: "Hallands Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Sprintermästaren futam helyszíne" },
        { name: "Hotingtravet", slug: "hotingtravet", city: "Hoting", lat: 64.0875, lng: 16.2358, founded: 1967, status: "active", length: 800, direction: "left", org: "Västra Ångermanlands Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Évi mindössze 3 versenynap" },
        { name: "Kalmartravet", slug: "kalmartravet", city: "Kalmar", lat: 56.6680, lng: 16.2717, founded: 1965, status: "active", length: 1000, direction: "left", org: "Sydöstra Sveriges Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Sibylla svéd hercegnő nyitotta meg" },
        { name: "Karlshamnstravet", slug: "karlshamnstravet", city: "Asarum", lat: 56.2228, lng: 14.8313, founded: 1993, status: "active", length: 800, direction: "left", org: "Blekinge Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "A nézők a pálya belső terében állnak" },
        { name: "Fornaboda travbana", slug: "fornaboda-travbana", city: "Lindesberg", lat: 59.6295, lng: 15.1741, founded: 1951, status: "active", length: 1000, direction: "left", org: "Lindes Travklubb", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Korábban a befagyott Lindessjön tavon versenyeztek" },
        { name: "Lyckseletravet", slug: "lyckseletravet", city: "Lycksele", lat: 64.5521, lng: 18.7160, founded: 1955, status: "active", length: 1000, direction: "left", org: "Lycksele Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Nyári lóhét a helyi közösségi élet csúcspontja" },
        { name: "Mantorp Hästsportarena", slug: "mantorp-hastsportarena", city: "Mantorp", lat: 58.3695, lng: 15.2837, founded: 1965, status: "active", length: 1000, direction: "left", org: "Östergötlands Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "A legendás Ina Scot nevű ló itt van eltemetve" },
        { name: "Ovallatravet", slug: "ovallatravet", city: "Oviken", lat: 62.9978, lng: 14.3773, founded: 1971, status: "active", length: 800, direction: "left", org: "Ovikens Travklubb", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "800 m-es kispálya" },
        { name: "Romme travbana", slug: "romme-travbana", city: "Borlänge", lat: 60.4529, lng: 15.5005, founded: 1955, status: "active", length: 1000, direction: "left", org: "Svensk Travsport", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Rommeheatet – melegvérűek futama" },
        { name: "Rättviks travbana", slug: "rattviks-travbana", city: "Rättvik", lat: 60.9021, lng: 15.1156, founded: 1955, status: "active", length: 1000, direction: "left", org: "Siljans Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Itt indult Olle Goop, Svédország legsikeresebb hajtójának pályafutása" },
        { name: "Skellefteåtravet", slug: "skellefteatravet", city: "Skellefteå", lat: 64.7325, lng: 20.9492, founded: 1952, status: "active", length: 1000, direction: "left", org: "Skellefteortens Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Az egyik két svéd pálya \"open stretch\" előzősávval" },
        { name: "Solänget", slug: "solanget", city: "Örnsköldsvik", lat: 63.2861, lng: 18.6352, founded: 1952, status: "active", length: 1004, direction: "left", org: "Svensk Travsport", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Mellanbana kategóriájú pálya" },
        { name: "Tingsrydtravet", slug: "tingsrydtravet", city: "Tingsryd", lat: 56.5118, lng: 14.9960, founded: 2003, status: "active", length: 1609, direction: "left", org: "Svensk Travsport", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Svédország egyetlen \"mile\" (1609 m) pályája", image: { url: "https://commons.wikimedia.org/wiki/File:Tingsryd_Travbana.JPG", license: "Public domain (PD-self)", attribution: "CHG", verified: true } },
        { name: "Umåkers travbana", slug: "umakers-travbana", city: "Umeå", lat: 63.8209, lng: 20.1779, founded: 1944, status: "active", length: 1000, direction: "left", org: "Svensk Travsport", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Egész évben rendeznek itt versenyt" },
        { name: "Vaggerydstravet", slug: "vaggerydstravet", city: "Vaggeryd", lat: 57.5226, lng: 14.1117, founded: 1995, status: "active", length: 1000, direction: "left", org: "Jönköping-Vaggeryds Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "SmålandsMästaren futam helyszíne" },
        { name: "Visbytravet", slug: "visbytravet", city: "Gotland", lat: 57.6175, lng: 18.3288, founded: 1948, status: "active", length: 1000, direction: "left", org: "Gotlands Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Szigeti pálya, csak nyáron üzemel" },
        { name: "Åmålstravet", slug: "amalstravet", city: "Åmål", lat: 59.0335, lng: 12.7051, founded: 1953, status: "active", length: 800, direction: "right", org: "Dalslands Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Az egyetlen pálya, ahol jobbkéz irányban versenyeznek" },
        { name: "Årjängstravet", slug: "arjangstravet", city: "Årjäng", lat: 59.3900, lng: 12.1557, founded: 1936, status: "active", length: 1000, direction: "left", org: "Nordmarkens Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Sokak szerint Svédország legszebb ügetőpályája" },
        { name: "Örebrotravet", slug: "orebrotravet", city: "Örebro", lat: 59.2191, lng: 15.1611, founded: 1954, status: "active", length: 1000, direction: "left", org: "Örebro Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Örebro Int'l – 3140 m-es stayer-futam" },
        { name: "Östersundstravet", slug: "ostersundstravet", city: "Östersund", lat: 63.1643, lng: 14.6730, founded: 1936, status: "active", length: 1000, direction: "left", org: "Jämtlands Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Az ország 2. leghosszabb célegyenese" },
        { name: "Bollnästravet", slug: "bollnastravet", city: "Bollnäs", lat: 61.3403, lng: 16.3356, founded: 1955, status: "active", length: 1000, direction: "left", org: "Svensk Travsport", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Hälsingland régió egyik pályája" },
        { name: "Dannero travbana", slug: "dannero-travbana", city: "Kramfors", lat: 63.0207, lng: 17.8045, founded: 1958, status: "active", length: 1000, direction: "left", org: "Ådalens Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "2005-ös tűz után teljesen megújult" },
        { name: "Arvika travbana", slug: "arvika-travbana", city: "Arvika", lat: 59.6574, lng: 12.6221, founded: 1954, status: "active", length: 800, direction: "left", org: "Wermlands Trafvarsällskap (1882)", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "A Wermlands Trafvarsällskap (1882) Svédország legrégebbi ügető-egyesülete" }
    ],
    FRA: [
        { name: "Hippodrome de la Prairie Malicorne", slug: "hippodrome-de-la-prairie-malicorne", city: "Abbeville", region: "Nord", lat: 50.094916, lng: 1.815045, founded: 1880, status: "active", length: 1400, width: 17, direction: "left", surface: "fű", ownSite: "https://www.hippodrome-abbeville.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome d'Agen", slug: "hippodrome-d-agen", city: "Agen-La Garenne", region: "Sud-Ouest", lat: 44.175247, lng: 0.600713, founded: 1973, status: "active", length: 1180, width: 20, direction: "right", surface: "homok", ownSite: "https://www.hippodrome-agen.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Martinet", slug: "hippodrome-du-martinet", city: "Agon-Coutainville", region: "Basse-Normandie", lat: 49.050693, lng: -1.595755, founded: null, status: "active", length: 1250, width: 20, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Marlioz", slug: "hippodrome-de-marlioz", city: "Aix-Les-Bains", region: "Centre-Est", lat: 45.671099, lng: 5.906337, founded: null, status: "active", length: 1540, width: 24, direction: "right", surface: "fű", ownSite: "https://www.hippodrome-aixlesbains.com/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Vignetta", slug: "hippodrome-de-vignetta", city: "Ajaccio", region: "Corse", lat: 41.928231, lng: 8.786992, founded: null, status: "active", length: 1070, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome d'Alençon", slug: "hippodrome-d-alencon", city: "Alencon", region: "Basse-Normandie", lat: 48.440671, lng: 0.090082, founded: null, status: "active", length: 1200, width: 23, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Petit Saint-Jean", slug: "hippodrome-du-petit-saint-jean", city: "Amiens", region: "Nord", lat: 49.895135, lng: 2.269663, founded: null, status: "active", length: 1100, width: 24, direction: "right", surface: "puccolan", ownSite: "https://www.hippodrome-amiens.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome d'Eventard", slug: "hippodrome-d-eventard", city: "Angers", region: "Anjou-Maine", lat: 47.497334, lng: -0.508141, founded: null, status: "active", length: 1427, width: null, direction: "right", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Tourette", slug: "hippodrome-de-la-tourette", city: "Angouleme", region: "Sud-Ouest", lat: 45.620939, lng: 0.132268, founded: null, status: "active", length: 1000, width: null, direction: "right", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Pays d'Argentan", slug: "hippodrome-du-pays-d-argentan", city: "Argentan", region: "Basse-Normandie", lat: 48.753961, lng: -0.001225, founded: null, status: "active", length: 1325, width: null, direction: "right", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome des Hauts Blancs-Monts", slug: "hippodrome-des-hauts-blancs-monts", city: "Arras", region: "Nord", lat: 50.29377, lng: 2.737119, founded: 1884, status: "active", length: 1050, width: 20, direction: "right", surface: "fű", ownSite: "https://www.hippodrome-arras.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome La Ribère", slug: "hippodrome-la-ribere", city: "Auch", region: "Sud-Ouest", lat: 43.666353, lng: 0.597943, founded: null, status: "active", length: 1050, width: null, direction: "right", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome Georges du Breil", slug: "hippodrome-georges-du-breil", city: "Aurillac", region: "Sud-Ouest", lat: 44.908632, lng: 2.428859, founded: null, status: "active", length: 1950, width: 16, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Roberty", slug: "hippodrome-de-roberty", city: "Avignon - Le Pontet", region: "Sud-Est", lat: 43.970647, lng: 4.869281, founded: null, status: "active", length: 1460, width: 18, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome des Grèves", slug: "hippodrome-des-greves", city: "Avranches", region: "Basse-Normandie", lat: 48.678051, lng: -1.391948, founded: null, status: "active", length: 1200, width: 12, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Pierreville", slug: "hippodrome-de-pierreville", city: "Bacqueville-En-Caux", region: "Île-de-France – Haute-Normandie", lat: 49.789584, lng: 1.005068, founded: null, status: "active", length: 950, width: 17, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Luchon", slug: "hippodrome-de-luchon", city: "Bagneres-De-Luchon", region: "Sud-Ouest", lat: 42.79976, lng: 0.600391, founded: null, status: "active", length: 1850, width: 19, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Bagnoles-de-l'Orne", slug: "hippodrome-de-bagnoles-de-l-orne", city: "Bagnoles De L'Orne", region: "Basse-Normandie", lat: 48.561406, lng: -0.417441, founded: null, status: "active", length: 1075, width: 20, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Borde-Vieille", slug: "hippodrome-de-borde-vieille", city: "Beaumont De Lomagne", region: "Sud-Ouest", lat: 43.888587, lng: 1.008931, founded: null, status: "active", length: 1115, width: null, direction: "right", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Prée", slug: "hippodrome-de-la-pree", city: "Beaupreau", region: "Anjou-Maine", lat: 47.19524, lng: -0.996101, founded: null, status: "active", length: 1050, width: null, direction: "left", surface: "fű", ownSite: "https://www.hippodrome-beaupreau.fr/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Molière", slug: "hippodrome-de-la-moliere", city: "Berck-Sur-Mer", region: "Nord", lat: 50.523915, lng: 1.606323, founded: null, status: "active", length: 1200, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome Victor Lebrun", slug: "hippodrome-victor-lebrun", city: "Bernay", region: "Île-de-France – Haute-Normandie", lat: 49.085909, lng: 0.612064, founded: null, status: "active", length: 1310, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome des Fleurs", slug: "hippodrome-des-fleurs", city: "Biarritz", region: "Sud-Ouest", lat: 43.471591, lng: -1.552804, founded: null, status: "active", length: 803, width: 20, direction: "right", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Casatorra", slug: "hippodrome-de-casatorra", city: "Biguglia", region: "Corse", lat: 42.618216, lng: 9.44037, founded: null, status: "active", length: 1060, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome des Trois Pipes", slug: "hippodrome-des-trois-pipes", city: "Bihorel-Les-Rouen", region: "Île-de-France – Haute-Normandie", lat: 49.459575, lng: 1.118567, founded: null, status: "active", length: 1075, width: null, direction: "right", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Bouvron", slug: "hippodrome-de-bouvron", city: "Blain-Bouvron-Le Gavre", region: "Ouest", lat: 48.200745, lng: -0.136541, founded: null, status: "active", length: 1550, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Levade", slug: "hippodrome-de-la-levade", city: "Bollene", region: "Sud-Est", lat: 44.287996, lng: 4.76203, founded: null, status: "active", length: 1050, width: 24, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Bouscat", slug: "hippodrome-du-bouscat", city: "Bordeaux - Le Bouscat", region: "Sud-Ouest", lat: 44.872921, lng: -0.628094, founded: 1836, status: "active", length: 1525, width: null, direction: "right", surface: "homok", ownSite: "https://www.hippodromebordeauxlebouscat.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Bourigny", slug: "hippodrome-de-bourigny", city: "Bourigny", region: "Basse-Normandie", lat: 48.79832, lng: -1.151135, founded: null, status: "active", length: 1010, width: 13, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome Gabriel Lefranc", slug: "hippodrome-gabriel-lefranc", city: "Brehal", region: "Basse-Normandie", lat: 48.899992, lng: -1.561075, founded: null, status: "active", length: 1065, width: 18, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Cabourg", slug: "hippodrome-de-cabourg", city: "Cabourg", region: "Basse-Normandie", lat: 49.279187, lng: -0.120021, founded: null, status: "active", length: 1275, width: null, direction: "right", surface: "homok", ownSite: "https://www.hippodrome-cabourg.com/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Prairie", slug: "hippodrome-de-la-prairie", city: "Caen", region: "Basse-Normandie", lat: 49.177817, lng: -0.363918, founded: 1845, status: "active", length: 1954, width: 20, direction: "right", surface: "homok", ownSite: "https://www.hippodrome-caen.com/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Côte d'Azur", slug: "hippodrome-de-la-cote-d-azur", city: "Cagnes-Sur-Mer", region: "Sud-Est", lat: 43.649276, lng: 7.145364, founded: 1952, status: "active", length: 1288, width: 35, direction: "left", surface: "homok", ownSite: "https://www.hippodrome-cotedazur.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Fajeole", slug: "hippodrome-de-la-fajeole", city: "Carcassonne", region: "Sud-Ouest", lat: 43.223424, lng: 2.373823, founded: null, status: "active", length: 1200, width: 16, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Russie", slug: "hippodrome-de-la-russie", city: "Carentan", region: "Basse-Normandie", lat: 49.312169, lng: -1.238405, founded: null, status: "active", length: 1300, width: 15, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Penalan", slug: "hippodrome-de-penalan", city: "Carhaix", region: "Ouest", lat: 48.313918, lng: -3.588134, founded: null, status: "active", length: 1200, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Saint-Ponchon", slug: "hippodrome-de-saint-ponchon", city: "Carpentras", region: "Sud-Est", lat: 44.037248, lng: 5.064368, founded: null, status: "active", length: 1240, width: 22, direction: "right", surface: "fű", ownSite: "https://www.hippodrome-carpentras.com/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Marchès", slug: "hippodrome-de-marches", city: "Castelsarrasin", region: "Sud-Ouest", lat: 44.059337, lng: 1.095466, founded: null, status: "active", length: 1060, width: 16, direction: "right", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Baron", slug: "hippodrome-de-baron", city: "Castera-Verduzan", region: "Sud-Ouest", lat: 43.829061, lng: 0.433545, founded: null, status: "active", length: 1280, width: null, direction: "right", surface: "salak", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Sarlande", slug: "hippodrome-de-sarlande", city: "Castillonnes", region: "Sud-Ouest", lat: 44.658608, lng: 0.604051, founded: null, status: "active", length: 1050, width: 16, direction: "right", surface: "puccolane", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Cavaillon", slug: "hippodrome-de-cavaillon", city: "Cavaillon", region: "Sud-Est", lat: 43.821064, lng: 5.042098, founded: null, status: "active", length: 1200, width: 20, direction: "right", surface: "puccolane", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Douze", slug: "hippodrome-de-la-douze", city: "Cazaubon", region: "Sud-Ouest", lat: 43.938156, lng: -0.088992, founded: null, status: "active", length: 1165, width: 20, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome des Noues", slug: "hippodrome-des-noues", city: "Challans", region: "Ouest", lat: 46.830352, lng: -1.888899, founded: null, status: "active", length: 1000, width: null, direction: "right", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Mont-Choisy", slug: "hippodrome-du-mont-choisy", city: "Chalons-En-Champagne", region: "Est", lat: 48.921598, lng: 4.300329, founded: null, status: "active", length: 1210, width: null, direction: "left", surface: "fű", ownSite: "https://www.hippodromedereims.com/revivez-leur-histoire", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Chartres", slug: "hippodrome-de-chartres", city: "Chartres", region: "Île-de-France – Haute-Normandie", lat: 48.451802, lng: 1.509502, founded: null, status: "active", length: 1003, width: 20, direction: "left", surface: "homok", ownSite: "https://www.hippodrome-chartres.com/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Bonlieu", slug: "hippodrome-de-bonlieu", city: "Chateau-Du-Loir", region: "Anjou-Maine", lat: 47.679975, lng: 0.452478, founded: null, status: "active", length: 1175, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome La Maroutière - St-Fort", slug: "hippodrome-la-maroutiere-st-fort", city: "Chateau-Gontier", region: "Anjou-Maine", lat: 47.805864, lng: -0.700852, founded: null, status: "active", length: null, width: null, direction: null, surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Métairie Neuve", slug: "hippodrome-de-la-metairie-neuve", city: "Chateaubriant", region: "Ouest", lat: 47.738455, lng: -1.390218, founded: 1980, status: "active", length: 1400, width: 24, direction: "right", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Petit Valençay", slug: "hippodrome-du-petit-valencay", city: "Chateauroux", region: "Centre-Est", lat: 46.812579, lng: 1.668608, founded: 1883, status: "active", length: 1750, width: 20, direction: "right", surface: "fű", ownSite: "https://www.hippodrome-chateauroux.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Haut-Rillon", slug: "hippodrome-du-haut-rillon", city: "Chatelaillon-La Rochelle", region: "Sud-Ouest", lat: 46.075086, lng: -1.076619, founded: 1928, status: "active", length: 1144, width: 18, direction: "left", surface: "homok", ownSite: "https://www.hippodrome-chatelaillonplage.fr/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Bel Air", slug: "hippodrome-de-bel-air", city: "Chatillon-Sur-Chalaronne", region: "Centre-Est", lat: 46.125614, lng: 4.963957, founded: null, status: "active", length: 1000, width: 20, direction: "left", surface: "salak", ownSite: "https://www.hippodromebelair.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Glacerie", slug: "hippodrome-de-la-glacerie", city: "Cherbourg", region: "Basse-Normandie", lat: 49.606344, lng: -1.602997, founded: null, status: "active", length: 1200, width: 24, direction: "left", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Grigny", slug: "hippodrome-de-grigny", city: "Chinon - Richelieu", region: "Anjou-Maine", lat: 47.15589, lng: 0.221315, founded: null, status: "active", length: 1400, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Clenet", slug: "hippodrome-de-clenet", city: "Cholet", region: "Anjou-Maine", lat: 47.019791, lng: -0.888763, founded: null, status: "active", length: 1255, width: null, direction: "right", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Bellecroix", slug: "hippodrome-de-bellecroix", city: "Cluny", region: "Centre-Est", lat: 46.437589, lng: 4.669053, founded: 1880, status: "active", length: 1250, width: 18, direction: "left", surface: "fű", ownSite: "https://www.hippodrome-cluny.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Putois", slug: "hippodrome-du-putois", city: "Compiegne", region: "Nord", lat: 49.411304, lng: 2.843395, founded: 1876, status: "active", length: 2200, width: null, direction: "left", surface: "fű", ownSite: "https://www.hippodrome-compiegne.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Loire", slug: "hippodrome-de-la-loire", city: "Cordemais", region: "Ouest", lat: 47.283637, lng: -1.879949, founded: null, status: "active", length: 1240, width: null, direction: "left", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Touche", slug: "hippodrome-de-la-touche", city: "Craon", region: "Anjou-Maine", lat: 47.836907, lng: -0.933833, founded: 1848, status: "active", length: 1281, width: null, direction: "right", surface: "fű", ownSite: "https://www.courses-craon.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Clairefontaine", slug: "hippodrome-de-clairefontaine", city: "Deauville-Clairefontaine", region: "Basse-Normandie", lat: 49.346143, lng: 0.057118, founded: null, status: "active", length: 1350, width: null, direction: "right", surface: "fű", ownSite: "https://www.hippodrome-deauville-clairefontaine.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Rouxmesnil-Bouteilles", slug: "hippodrome-de-rouxmesnil-bouteilles", city: "Dieppe", region: "Île-de-France – Haute-Normandie", lat: 49.909078, lng: 1.095721, founded: 1852, status: "active", length: 2000, width: null, direction: "right", surface: "fű", ownSite: "https://www.hippodrome-dieppe.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de l'Aublette", slug: "hippodrome-de-l-aublette", city: "Dinan", region: "Ouest", lat: 48.445792, lng: -2.084554, founded: null, status: "active", length: 1300, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Grand Genève-Divonne", slug: "hippodrome-du-grand-geneve-divonne", city: "Divonne-Les-Bains", region: "Centre-Est", lat: 46.350457, lng: 6.153543, founded: 1965, status: "active", length: 1212, width: 16, direction: "left", surface: "puccolane", ownSite: "https://www.hippodromedivonnelesbains.com/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Croix des Landes", slug: "hippodrome-de-la-croix-des-landes", city: "Domfront", region: "Basse-Normandie", lat: 48.59143, lng: -0.620465, founded: null, status: "unknown", length: 950, width: 15, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome d'Angerville", slug: "hippodrome-d-angerville", city: "Dozule", region: "Basse-Normandie", lat: 49.242783, lng: -0.036865, founded: null, status: "active", length: 1075, width: 20, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Flonville", slug: "hippodrome-de-flonville", city: "Dreux", region: "Île-de-France – Haute-Normandie", lat: 48.765731, lng: 1.363292, founded: null, status: "closed", length: null, width: null, direction: null, surface: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Carrière", slug: "hippodrome-de-la-carriere", city: "Durtal", region: "Anjou-Maine", lat: 47.662505, lng: -0.224857, founded: null, status: "active", length: 1745, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Bergeyre", slug: "hippodrome-de-la-bergeyre", city: "Eauze", region: "Sud-Ouest", lat: 43.81505, lng: 0.128544, founded: null, status: "active", length: 1100, width: 22, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome Pierre Provost", slug: "hippodrome-pierre-provost", city: "Ecommoy", region: "Anjou-Maine", lat: 47.821328, lng: 0.283736, founded: null, status: "active", length: 1209, width: null, direction: "right", surface: "fű", ownSite: "https://hippodromeecommoy.wixsite.com/hippodromeecommoy", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome d'Enghien-Soisy", slug: "hippodrome-d-enghien-soisy", city: "Enghien", region: "Île-de-France – Haute-Normandie", lat: 48.984181, lng: 2.289003, founded: null, status: "active", length: 1300, width: 25, direction: "left", surface: "homok", ownSite: "https://www.hippodrome-enghien.com/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome Les Bigodières", slug: "hippodrome-les-bigodieres", city: "Erbray", region: "Ouest", lat: 47.66424, lng: -1.309498, founded: null, status: "active", length: 1220, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome d'Evreux-Navarre", slug: "hippodrome-d-evreux-navarre", city: "Evreux-Navarre", region: "Île-de-France – Haute-Normandie", lat: 49.009657, lng: 1.113206, founded: null, status: "active", length: 1645, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Parc", slug: "hippodrome-du-parc", city: "Feurs", region: "Centre-Est", lat: 45.738845, lng: 4.221529, founded: 1925, status: "active", length: 1300, width: 20, direction: "left", surface: "homok", ownSite: "https://www.hippodromedefeurs.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Réchou", slug: "hippodrome-du-rechou", city: "Fleurance", region: "Sud-Ouest", lat: 43.842949, lng: 0.675705, founded: null, status: "active", length: 1000, width: 18, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Solle", slug: "hippodrome-de-la-solle", city: "Fontainebleau", region: "Île-de-France – Haute-Normandie", lat: 48.434474, lng: 2.681594, founded: null, status: "active", length: 1420, width: null, direction: "right", surface: "fű", ownSite: "https://www.hippodrome-fontainebleau.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Grande Marche", slug: "hippodrome-de-la-grande-marche", city: "Fougeres", region: "Ouest", lat: 48.328839, lng: -1.197142, founded: null, status: "active", length: 1525, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome Georges Pinsard", slug: "hippodrome-georges-pinsard", city: "Francheville-La Barre", region: "Île-de-France – Haute-Normandie", lat: 44.908632, lng: 2.428859, founded: null, status: "active", length: 1125, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Marais", slug: "hippodrome-du-marais", city: "Gabarret", region: "Sud-Ouest", lat: 43.965325, lng: -0.010332, founded: null, status: "active", length: 1400, width: 15, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Pérauderie", slug: "hippodrome-de-la-perauderie", city: "Gemozac", region: "Sud-Ouest", lat: 45.570926, lng: -0.680749, founded: null, status: "active", length: 1000, width: 16, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Genêts", slug: "hippodrome-de-genets", city: "Genets", region: "Basse-Normandie", lat: 48.678051, lng: -1.391948, founded: null, status: "active", length: null, width: null, direction: null, surface: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Mont Louvet", slug: "hippodrome-du-mont-louvet", city: "Gournay-En-Bray", region: "Île-de-France – Haute-Normandie", lat: 49.502901, lng: 1.670299, founded: 1888, status: "active", length: 1115, width: null, direction: "right", surface: "homok", ownSite: "https://hippodrome-mauquenchy.fr/hippodrome-de-gournay-en-bray/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome \"le Vieux Château\"", slug: "hippodrome-le-vieux-chateau", city: "Graignes", region: "Basse-Normandie", lat: 49.240664, lng: -1.208339, founded: null, status: "active", length: 1034, width: 22, direction: "left", surface: "homok", ownSite: "https://www.hippodromedegraignes.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Tumulus", slug: "hippodrome-du-tumulus", city: "Gramat", region: "Sud-Ouest", lat: 44.781624, lng: 1.758189, founded: null, status: "active", length: 1200, width: 16, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Belle Etoile", slug: "hippodrome-de-la-belle-etoile", city: "Grand Fougeray", region: "Ouest", lat: 47.722792, lng: -1.716728, founded: null, status: "active", length: 1222, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Longueville-Bréville", slug: "hippodrome-de-longueville-breville", city: "Granville", region: "Basse-Normandie", lat: 48.862593, lng: -1.573018, founded: null, status: "active", length: 1400, width: 20, direction: "right", surface: "fű", ownSite: "https://hippodrome-de-granville.jimdosite.com/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Marianne", slug: "hippodrome-de-marianne", city: "Grenade-Sur-Garonne", region: "Sud-Ouest", lat: 43.752736, lng: 1.282154, founded: 1964, status: "active", length: 1175, width: 20, direction: "left", surface: "salak", ownSite: "https://hippodromegrenade.com/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Hattaie-Guer", slug: "hippodrome-de-la-hattaie-guer", city: "Guer-Coetquidan", region: "Ouest", lat: 47.902361, lng: -2.131149, founded: null, status: "active", length: null, width: null, direction: null, surface: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome Ar Plijadur", slug: "hippodrome-ar-plijadur", city: "Guerlesquin", region: "Ouest", lat: 48.508002, lng: -3.584087, founded: null, status: "active", length: 1125, width: null, direction: "right", surface: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Bel Orme", slug: "hippodrome-du-bel-orme", city: "Guingamp", region: "Ouest", lat: 48.548519, lng: -3.096756, founded: null, status: "active", length: 1200, width: null, direction: "right", surface: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Plage", slug: "hippodrome-de-la-plage", city: "Hyeres", region: "Sud-Est", lat: 43.078508, lng: 6.151373, founded: 1890, status: "active", length: 1200, width: 20, direction: "right", surface: "puccolane", ownSite: "https://www.hippodromedehyeres.fr/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Rochardière", slug: "hippodrome-de-la-rochardiere", city: "Jallais", region: "Anjou-Maine", lat: 47.177306, lng: -0.868897, founded: null, status: "active", length: 1350, width: null, direction: "left", surface: "fű", ownSite: "https://www.lescourseshippiquesdejallais.sitew.com/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Quint", slug: "hippodrome-du-quint", city: "Jarnac", region: "Sud-Ouest", lat: 45.679302, lng: -0.181491, founded: null, status: "active", length: 1100, width: 15, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Saint-Jean-des-Près", slug: "hippodrome-de-saint-jean-des-pres", city: "Josselin", region: "Ouest", lat: 47.94059, lng: -2.537145, founded: null, status: "active", length: 1200, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Lachamps", slug: "hippodrome-de-lachamps", city: "Jullianges", region: "Centre-Est", lat: 45.300115, lng: 3.792819, founded: null, status: "active", length: 900, width: 17, direction: "right", surface: "salak", ownSite: "https://www.hippodrome-jullianges.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Cale", slug: "hippodrome-de-la-cale", city: "Jullouville-Les-Pins", region: "Basse-Normandie", lat: 48.778488, lng: -1.57068, founded: null, status: "active", length: 1250, width: null, direction: "right", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome Régional de Guadeloupe", slug: "hippodrome-regional-de-guadeloupe", city: "Karukera (Guadeloupe)", region: "DROM-COM", lat: 16.483179, lng: -61.464943, founded: null, status: "active", length: 1200, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Saint-Gervais", slug: "hippodrome-de-saint-gervais", city: "L'Isle Sur La Sorgue", region: "Sud-Est", lat: 43.899578, lng: 5.064469, founded: null, status: "active", length: null, width: null, direction: null, surface: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Thiérache", slug: "hippodrome-de-la-thierache", city: "La Capelle", region: "Nord", lat: 49.967507, lng: 3.92139, founded: null, status: "active", length: 1609, width: 20, direction: "left", surface: "homok", ownSite: "https://www.hippodromelacapelle.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome \"les Glerches\"", slug: "hippodrome-les-glerches", city: "La Chartre-Sur-Le-Loir", region: "Anjou-Maine", lat: 47.736605, lng: 0.569299, founded: null, status: "active", length: 1100, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Montgelly", slug: "hippodrome-de-montgelly", city: "La Clayette", region: "Centre-Est", lat: 46.301959, lng: 4.296649, founded: 1876, status: "active", length: 1200, width: 16, direction: "right", surface: "fű", ownSite: "https://www.hippodrome-laclayette.com/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Pipe-Souris", slug: "hippodrome-de-pipe-souris", city: "La Ferte-Vidame", region: "Île-de-France – Haute-Normandie", lat: 48.621817, lng: 0.894225, founded: null, status: "active", length: 1025, width: 18, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Pré-Naval", slug: "hippodrome-de-pre-naval", city: "La Gacilly", region: "Ouest", lat: 47.747124, lng: -2.118963, founded: null, status: "active", length: 1400, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Montboury", slug: "hippodrome-de-montboury", city: "La Guerche De Bretagne", region: "Ouest", lat: 47.931471, lng: -1.219967, founded: null, status: "active", length: 1050, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Mijéma", slug: "hippodrome-de-mijema", city: "La Reole", region: "Sud-Ouest", lat: 44.575324, lng: -0.019424, founded: null, status: "active", length: null, width: null, direction: null, surface: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Gâtinière", slug: "hippodrome-de-la-gatiniere", city: "La Roche-Posay", region: "Anjou-Maine", lat: 46.80384, lng: 0.811814, founded: null, status: "active", length: 1140, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome des Terres-Noires", slug: "hippodrome-des-terres-noires", city: "La Roche-Sur-Yon", region: "Ouest", lat: 46.690548, lng: -1.443563, founded: null, status: "active", length: 1420, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Béquet", slug: "hippodrome-du-bequet", city: "La Teste", region: "Sud-Ouest", lat: 44.594327, lng: -1.125572, founded: null, status: "active", length: 1500, width: null, direction: "right", surface: "homok", ownSite: "https://www.hippodrome-lateste.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Croas-al-Leurion", slug: "hippodrome-de-croas-al-leurion", city: "Landivisiau", region: "Ouest", lat: 48.537383, lng: -4.052013, founded: null, status: "active", length: 1215, width: null, direction: "right", surface: "fű", ownSite: "https://www.hippodrome-landivisiau.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Bidane", slug: "hippodrome-de-la-bidane", city: "Langon-Libourne", region: "Sud-Ouest", lat: 44.518865, lng: -0.230844, founded: 1980, status: "active", length: 1280, width: 24, direction: "left", surface: "homok", ownSite: "https://www.hippodromelangon.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Demi-Lune", slug: "hippodrome-de-la-demi-lune", city: "Lannemezan-Vic Bigorre", region: "Sud-Ouest", lat: 43.109865, lng: 0.410415, founded: null, status: "active", length: 1312, width: 16, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Laon", slug: "hippodrome-de-laon", city: "Laon", region: "Nord", lat: 49.548457, lng: 3.650864, founded: null, status: "active", length: 1300, width: 17, direction: "left", surface: "salak", ownSite: "https://www.hippodrome-laon.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Bellevue-la-Forêt", slug: "hippodrome-de-bellevue-la-foret", city: "Laval", region: "Anjou-Maine", lat: 48.036607, lng: -0.794112, founded: 1985, status: "active", length: 1250, width: null, direction: "left", surface: "homok", ownSite: "https://www.hippodrome-laval.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome Serge Charles", slug: "hippodrome-serge-charles", city: "Le Croise-Laroche", region: "Nord", lat: 50.667102, lng: 3.093132, founded: 1931, status: "active", length: 1662, width: 22, direction: "left", surface: "salak", ownSite: "https://www.croise-laroche.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Sagne", slug: "hippodrome-de-la-sagne", city: "Le Dorat", region: "Sud-Ouest", lat: 46.186387, lng: 1.054649, founded: null, status: "active", length: 1500, width: 14, direction: "right", surface: "fű", ownSite: "https://www.hippodromedorat.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de l'Isle-Briand", slug: "hippodrome-de-l-isle-briand", city: "Le Lion D'Angers", region: "Anjou-Maine", lat: 47.629004, lng: -0.706881, founded: 1946, status: "active", length: 1625, width: null, direction: "left", surface: "fű", ownSite: "https://www.coursesdulion.com/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome des Hunaudières", slug: "hippodrome-des-hunaudieres", city: "Le Mans", region: "Anjou-Maine", lat: 47.948056, lng: 0.222717, founded: null, status: "active", length: 1350, width: 25, direction: "left", surface: "homok", ownSite: "https://www.hippodumans.fr.st", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de l'Anse de Moidrey", slug: "hippodrome-de-l-anse-de-moidrey", city: "Le Mont-Saint-Michel-Pontorson", region: "Basse-Normandie", lat: 48.585226, lng: -1.514326, founded: null, status: "active", length: 1200, width: null, direction: "right", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome Henri Bonnel", slug: "hippodrome-henri-bonnel", city: "Le Neubourg", region: "Île-de-France – Haute-Normandie", lat: 49.138148, lng: 0.901918, founded: null, status: "active", length: 804, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Chaussée", slug: "hippodrome-de-la-chaussee", city: "Le Pertre", region: "Ouest", lat: 48.042686, lng: -1.030783, founded: null, status: "active", length: 1300, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Bergerie", slug: "hippodrome-de-la-bergerie", city: "Le Pin-Au-Haras", region: "Basse-Normandie", lat: 48.735189, lng: 0.191467, founded: null, status: "active", length: 2000, width: null, direction: "right", surface: "fű", ownSite: "https://www.www.coursesdupin.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Fontaine", slug: "hippodrome-de-la-fontaine", city: "Le Sap", region: "Basse-Normandie", lat: 48.877311, lng: 0.350926, founded: null, status: "active", length: 1195, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Touquet", slug: "hippodrome-du-touquet", city: "Le Touquet", region: "Nord", lat: 50.524363, lng: 1.608118, founded: 1925, status: "active", length: 1600, width: null, direction: "right", surface: "fű", ownSite: "https://www.hippodrome-letouquet.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome René Tomasini", slug: "hippodrome-rene-tomasini", city: "Les Andelys", region: "Île-de-France – Haute-Normandie", lat: 49.237897, lng: 1.414459, founded: null, status: "unknown", length: 1450, width: 17, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de La Malbrande", slug: "hippodrome-de-la-malbrande", city: "Les Sables D'Olonne", region: "Ouest", lat: 46.474253, lng: -1.686664, founded: null, status: "active", length: 1260, width: null, direction: "left", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Lignières-en-Berry", slug: "hippodrome-de-lignieres-en-berry", city: "Lignieres En Berry", region: "Centre-Est", lat: 46.765105, lng: 2.16951, founded: 1879, status: "active", length: 1300, width: null, direction: "left", surface: "puccolane", ownSite: "https://www.hippodrome-lignieres.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Limoges - Texonniéras", slug: "hippodrome-de-limoges-texonnieras", city: "Limoges", region: "Sud-Ouest", lat: 45.870396, lng: 1.215811, founded: null, status: "active", length: null, width: null, direction: null, surface: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Lisieux Normandie", slug: "hippodrome-de-lisieux-normandie", city: "Lisieux", region: "Basse-Normandie", lat: 49.150374, lng: 0.271228, founded: 1975, status: "active", length: 1248, width: null, direction: "right", surface: "homok", ownSite: "https://www.hippodromedelisieux.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Calouet", slug: "hippodrome-de-calouet", city: "Loudeac", region: "Ouest", lat: 48.159076, lng: -2.759044, founded: null, status: "active", length: 1250, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de La Chataîgneraie", slug: "hippodrome-de-la-chataigneraie", city: "Luxe", region: "Sud-Ouest", lat: 45.886402, lng: 0.135779, founded: null, status: "active", length: 880, width: 25, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Lyon-La Soie", slug: "hippodrome-de-lyon-la-soie", city: "Lyon (A La Soie)", region: "Centre-Est", lat: 45.766715, lng: 4.922665, founded: null, status: "active", length: 1200, width: 20, direction: "right", surface: "puccolane", ownSite: "https://www.leshippodromesdelyon.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Parilly", slug: "hippodrome-de-parilly", city: "Lyon (A Parilly)", region: "Centre-Est", lat: 45.720429, lng: 4.906231, founded: 1965, status: "active", length: 1204, width: 15, direction: "left", surface: "puccolane", ownSite: "https://www.leshippodromesdelyon.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome des Chaumes", slug: "hippodrome-des-chaumes", city: "Machecoul", region: "Ouest", lat: 46.996545, lng: -1.837225, founded: null, status: "active", length: 1211, width: 24, direction: "left", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome Départemental de Carrère", slug: "hippodrome-departemental-de-carrere", city: "Madinina (Martinique)", region: "DROM-COM", lat: 14.587718, lng: -60.991729, founded: null, status: "active", length: 1200, width: 18, direction: "left", surface: "fű", ownSite: "http://hippodromedecarrere.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Champion", slug: "hippodrome-du-champion", city: "Mansle", region: "Sud-Ouest", lat: 45.879034, lng: 0.18412, founded: null, status: "active", length: 800, width: 16, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Parc Borély", slug: "hippodrome-du-parc-borely", city: "Marseille (A Borely)", region: "Sud-Est", lat: 45.808185, lng: 4.719222, founded: null, status: "active", length: 1375, width: 24, direction: "left", surface: "puccolane", ownSite: "https://www.hippodromesmarseille.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Pont de Vivaux", slug: "hippodrome-du-pont-de-vivaux", city: "Marseille (A Vivaux)", region: "Sud-Est", lat: 43.28142, lng: 5.417221, founded: 1927, status: "active", length: 1000, width: 18, direction: "left", surface: "homok", ownSite: "https://www.hippodromesmarseille.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Mauquenchy", slug: "hippodrome-de-mauquenchy", city: "Mauquenchy", region: "Île-de-France – Haute-Normandie", lat: 49.589456, lng: 1.452263, founded: null, status: "active", length: 1300, width: null, direction: "left", surface: "puccolane", ownSite: "https://hippodrome-mauquenchy.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "L'hippodrome Maure De Bretagne", slug: "l-hippodrome-maure-de-bretagne", city: "Maure De Bretagne", region: "Ouest", lat: 47.890871, lng: -2.022924, founded: 1973, status: "active", length: 1300, width: null, direction: "left", surface: "homok", ownSite: "https://lhippodrome-maure.com/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome \"les Vélizes\"", slug: "hippodrome-les-velizes", city: "Mauron", region: "Ouest", lat: 48.09127, lng: -2.285585, founded: null, status: "active", length: 1200, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome des Feux", slug: "hippodrome-des-feux", city: "Meral", region: "Anjou-Maine", lat: 47.948318, lng: -0.978764, founded: null, status: "active", length: 1350, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Bretonnière", slug: "hippodrome-de-la-bretonniere", city: "Meslay-Du-Maine", region: "Anjou-Maine", lat: 47.950062, lng: -0.533229, founded: null, status: "active", length: 1614, width: null, direction: "right", surface: "salak", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Bouilhaguet", slug: "hippodrome-de-bouilhaguet", city: "Miramont De Guyenne", region: "Sud-Ouest", lat: 44.597789, lng: 0.351919, founded: null, status: "active", length: 1000, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Château", slug: "hippodrome-du-chateau", city: "Molieres", region: "Anjou-Maine", lat: 47.75163, lng: -0.744779, founded: null, status: "active", length: 1175, width: null, direction: "right", surface: "fű", ownSite: "https://hippodrome-molieres.com/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome des Collines du Perche", slug: "hippodrome-des-collines-du-perche", city: "Mondoubleau", region: "Anjou-Maine", lat: 48.103586, lng: 0.77831, founded: null, status: "active", length: 1060, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Coulon", slug: "hippodrome-de-coulon", city: "Monflanquin", region: "Sud-Ouest", lat: 44.527559, lng: 0.752939, founded: null, status: "active", length: 950, width: 14, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome Lucien Pradié Marsalès", slug: "hippodrome-lucien-pradie-marsales", city: "Monpazier", region: "Sud-Ouest", lat: 44.690418, lng: 0.888863, founded: null, status: "active", length: 830, width: 18, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Brune", slug: "hippodrome-de-la-brune", city: "Mont-de-Marsan", region: "Sud-Ouest", lat: 43.919738, lng: -0.508344, founded: null, status: "active", length: 1200, width: null, direction: "left", surface: "fű", ownSite: "https://www.hippodrome-montdemarsan.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome \"les Allègres\"", slug: "hippodrome-les-allegres", city: "Montauban", region: "Sud-Ouest", lat: 44.039991, lng: 1.339577, founded: null, status: "active", length: 1120, width: 25, direction: "right", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Crouée", slug: "hippodrome-de-la-crouee", city: "Montier-En-Der", region: "Est", lat: 48.478375, lng: 4.764082, founded: null, status: "active", length: 1350, width: null, direction: "right", surface: "fű", ownSite: "https://www.hippodrome-est.fr/hippodrome-Montier", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome René Gounin", slug: "hippodrome-rene-gounin", city: "Montignac-Charente", region: "Sud-Ouest", lat: 45.785901, lng: 0.110327, founded: null, status: "active", length: 1220, width: 20, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome Montluçon-Communauté", slug: "hippodrome-montlucon-communaute", city: "Montlucon-Neris Les Bains", region: "Centre-Est", lat: 46.323443, lng: 2.602043, founded: null, status: "active", length: 1327, width: 15, direction: "right", surface: "fű", ownSite: "https://www.hippodrome-montlucon.com/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Perche Sarthois", slug: "hippodrome-du-perche-sarthois", city: "Montmirail", region: "Anjou-Maine", lat: 48.103962, lng: 0.777567, founded: null, status: "active", length: 1012, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Langolvas", slug: "hippodrome-de-langolvas", city: "Morlaix", region: "Ouest", lat: 48.584181, lng: -3.795454, founded: null, status: "active", length: 1450, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome des Gâteaux", slug: "hippodrome-des-gateaux", city: "Moulins", region: "Centre-Est", lat: 46.575663, lng: 3.314126, founded: null, status: "active", length: 2000, width: null, direction: "right", surface: "fű", ownSite: "https://www.allier-auvergne-tourisme.com/equipement/moulins/hippodrome/3947495", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome Jean Gabin", slug: "hippodrome-jean-gabin", city: "Moulins-La-Marche", region: "Basse-Normandie", lat: 48.657476, lng: 0.483043, founded: null, status: "active", length: 1050, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Nancy-Brabois", slug: "hippodrome-de-nancy-brabois", city: "Nancy", region: "Est", lat: 48.653795, lng: 6.141935, founded: 1933, status: "active", length: 1180, width: null, direction: "right", surface: "salak", ownSite: "https://www.hippodromenancy.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Petit Port", slug: "hippodrome-du-petit-port", city: "Nantes", region: "Ouest", lat: 47.248542, lng: -1.563471, founded: 1875, status: "active", length: 1411, width: null, direction: "left", surface: "homok", ownSite: "https://www.hippodrome-nantes.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Poillé", slug: "hippodrome-de-poille", city: "Neuille-Pont-Pierre", region: "Anjou-Maine", lat: 47.542816, lng: 0.535979, founded: 1894, status: "active", length: 1059, width: null, direction: "left", surface: "homok", ownSite: "https://ste-hippique.wixsite.com/hippodrome-npp", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome des Courbiers", slug: "hippodrome-des-courbiers", city: "Nimes", region: "Sud-Est", lat: 43.829953, lng: 4.40288, founded: null, status: "active", length: 1200, width: 18, direction: "right", surface: "fű", ownSite: "https://www.hippodrome-nimes.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Romague", slug: "hippodrome-de-romague", city: "Niort", region: "Ouest", lat: 46.299429, lng: -0.454094, founded: null, status: "active", length: 1100, width: 18, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Beaumont", slug: "hippodrome-de-beaumont", city: "Nort-Sur-Erdre", region: "Ouest", lat: 47.423232, lng: -1.503365, founded: null, status: "active", length: 1400, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Ligonnière", slug: "hippodrome-de-la-ligonniere", city: "Nuille-Sur-Vicoin", region: "Anjou-Maine", lat: 47.989887, lng: -0.78964, founded: null, status: "active", length: 1050, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome d'Oraison", slug: "hippodrome-d-oraison", city: "Oraison", region: "Sud-Est", lat: 43.922491, lng: 5.902665, founded: null, status: "active", length: 1000, width: null, direction: "right", surface: "fű", ownSite: "https://www.hippodrome-d-oraison.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de l'Ile Arrault", slug: "hippodrome-de-l-ile-arrault", city: "Orleans", region: "Île-de-France – Haute-Normandie", lat: 47.893298, lng: 1.884914, founded: null, status: "active", length: 1220, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Varenne", slug: "hippodrome-de-la-varenne", city: "Paray-Le-Monial", region: "Centre-Est", lat: 46.465317, lng: 4.09635, founded: null, status: "active", length: 1147, width: 18, direction: "right", surface: "puccolane", ownSite: "https://www.hippodrome-paraylemonial.com/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Parc de Fresnay", slug: "hippodrome-du-parc-de-fresnay", city: "Plesse", region: "Ouest", lat: 47.558073, lng: -1.894408, founded: null, status: "active", length: 1400, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome Saint-Efflam", slug: "hippodrome-saint-efflam", city: "Plestin-Les-Greves", region: "Ouest", lat: 48.669834, lng: -3.603201, founded: 1901, status: "active", length: 1200, width: null, direction: "right", surface: "homok", ownSite: "https://hippodromeplestin.com/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Malleville", slug: "hippodrome-de-malleville", city: "Ploermel", region: "Ouest", lat: 47.924157, lng: -2.381326, founded: null, status: "active", length: 1300, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la plage Saint-Sieu", slug: "hippodrome-de-la-plage-saint-sieu", city: "Ploubalay", region: "Ouest", lat: 48.60826, lng: -2.156681, founded: null, status: "active", length: 1150, width: null, direction: "left", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Baie de Kernic", slug: "hippodrome-de-la-baie-de-kernic", city: "Plouescat", region: "Ouest", lat: 48.656322, lng: -4.207398, founded: null, status: "active", length: 1000, width: null, direction: "right", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Calvaire - Magdeleine", slug: "hippodrome-du-calvaire-magdeleine", city: "Pontchateau", region: "Ouest", lat: 47.445481, lng: -2.131213, founded: null, status: "active", length: 1225, width: null, direction: "left", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Kernivinen", slug: "hippodrome-de-kernivinen", city: "Pontivy", region: "Ouest", lat: 48.054464, lng: -2.927512, founded: 1930, status: "active", length: 1200, width: null, direction: "right", surface: "fű", ownSite: "https://www.hippodromepontivy.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Côte d'Amour", slug: "hippodrome-de-la-cote-d-amour", city: "Pornichet", region: "Ouest", lat: 47.261563, lng: -2.330452, founded: 1907, status: "active", length: 1250, width: 28, direction: "left", surface: "homok", ownSite: "https://www.hippodrome-pornichet.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome des Pins", slug: "hippodrome-des-pins", city: "Portbail", region: "Basse-Normandie", lat: 49.334493, lng: -1.715579, founded: null, status: "active", length: 1200, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Calzarello", slug: "hippodrome-de-calzarello", city: "Prunelli Di Fium'Orbo", region: "Corse", lat: 41.992913, lng: 9.433782, founded: null, status: "active", length: 1400, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Resto", slug: "hippodrome-du-resto", city: "Questembert", region: "Ouest", lat: 47.691501, lng: -2.443654, founded: null, status: "active", length: 1380, width: null, direction: "right", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Villeneuve", slug: "hippodrome-de-la-villeneuve", city: "Rambouillet", region: "Île-de-France – Haute-Normandie", lat: 48.637685, lng: 1.854093, founded: null, status: "active", length: 1700, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Rânes", slug: "hippodrome-de-ranes", city: "Ranes", region: "Basse-Normandie", lat: 48.641937, lng: -0.216116, founded: null, status: "active", length: 975, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Rive", slug: "hippodrome-de-la-rive", city: "Redon", region: "Ouest", lat: 47.646966, lng: -2.10518, founded: null, status: "active", length: 1300, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Champagne", slug: "hippodrome-de-la-champagne", city: "Reims", region: "Est", lat: 49.233765, lng: 4.005436, founded: 1952, status: "active", length: 1156, width: 18, direction: "right", surface: "homok", ownSite: "https://www.hippodromedereims.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome Fleuri du Val de Loire", slug: "hippodrome-fleuri-du-val-de-loire", city: "Rochefort-Sur-Loire", region: "Anjou-Maine", lat: 47.366736, lng: -0.648856, founded: null, status: "active", length: 1330, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Quenropers", slug: "hippodrome-de-quenropers", city: "Rostrenen", region: "Ouest", lat: 48.250925, lng: -3.33433, founded: null, status: "active", length: 1310, width: null, direction: "right", surface: "fű", ownSite: "https://hippodrome-rostrenen.fr/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de La Palmyre", slug: "hippodrome-de-la-palmyre", city: "Royan-Atlantique", region: "Sud-Ouest", lat: 45.690568, lng: -1.168885, founded: 1960, status: "active", length: 1425, width: 18, direction: "right", surface: "fű", ownSite: "https://www.hippodromeroyan.fr/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Prairie du Château", slug: "hippodrome-de-la-prairie-du-chateau", city: "Sable-Sur-Sarthe", region: "Anjou-Maine", lat: 47.833158, lng: -0.329526, founded: null, status: "active", length: 1260, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome des Brûlins", slug: "hippodrome-des-brulins", city: "Saint-Aubin-Les-Elbeuf", region: "Île-de-France – Haute-Normandie", lat: 49.304254, lng: 1.018658, founded: null, status: "active", length: 1160, width: 20, direction: "left", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Baie", slug: "hippodrome-de-la-baie", city: "Saint-Brieuc", region: "Ouest", lat: 48.458117, lng: -2.71507, founded: null, status: "active", length: 1164, width: 20, direction: "right", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome Joseph Desjoyaux", slug: "hippodrome-joseph-desjoyaux", city: "Saint-Galmier", region: "Centre-Est", lat: 45.59906, lng: 4.297187, founded: 1899, status: "active", length: 1200, width: 25, direction: "right", surface: "puccolane", ownSite: "https://www.hippodrome-saint-galmier.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de l'Atlantique", slug: "hippodrome-de-l-atlantique", city: "Saint-Jean-De-Monts", region: "Ouest", lat: 46.814321, lng: -2.131628, founded: null, status: "active", length: 1200, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Marville", slug: "hippodrome-de-marville", city: "Saint-Malo", region: "Ouest", lat: 48.642426, lng: -1.998635, founded: null, status: "active", length: 1360, width: 20, direction: "right", surface: "homok", ownSite: "https://www.hippodrome-saintmalo.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome des Bruyères", slug: "hippodrome-des-bruyeres", city: "Saint-Omer", region: "Nord", lat: 50.72703, lng: 2.240345, founded: null, status: "active", length: 1000, width: 25, direction: "left", surface: "salak", ownSite: "https://www.hippodromedesaintomer.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome le Tilleul", slug: "hippodrome-le-tilleul", city: "Saint-Pierre-La-Cour", region: "Anjou-Maine", lat: 48.113819, lng: -1.014326, founded: null, status: "active", length: 1000, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Madeleine", slug: "hippodrome-de-la-madeleine", city: "Sainte-Marie-Du-Mont", region: "Basse-Normandie", lat: 49.411079, lng: -1.182302, founded: null, status: "active", length: null, width: null, direction: null, surface: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Crau", slug: "hippodrome-de-la-crau", city: "Salon De Provence", region: "Sud-Est", lat: 43.638948, lng: 5.032511, founded: null, status: "active", length: 1326, width: 20, direction: "right", surface: "puccolane", ownSite: "https://www.hippodrome-salon-de-provence.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Sault", slug: "hippodrome-de-sault", city: "Sault", region: "Sud-Est", lat: 44.10412, lng: 5.423269, founded: null, status: "active", length: 850, width: 10, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Verrie", slug: "hippodrome-de-verrie", city: "Saumur", region: "Anjou-Maine", lat: 47.251444, lng: -0.17355, founded: null, status: "active", length: 1500, width: 20, direction: "left", surface: "fű", ownSite: "https://www.hippodromedesaumur.fr/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Touchelais", slug: "hippodrome-de-la-touchelais", city: "Savenay", region: "Ouest", lat: 47.367429, lng: -1.932404, founded: null, status: "active", length: 1150, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome des Patis", slug: "hippodrome-des-patis", city: "Savigny-Sur-Braye", region: "Anjou-Maine", lat: 47.874483, lng: 0.805275, founded: null, status: "active", length: 1060, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Lorie", slug: "hippodrome-de-la-lorie", city: "Segre", region: "Anjou-Maine", lat: 47.675764, lng: -0.843645, founded: null, status: "active", length: 1225, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Boudré", slug: "hippodrome-de-boudre", city: "Seiches-Sur-Le-Loir", region: "Anjou-Maine", lat: 47.614989, lng: -0.381336, founded: null, status: "active", length: null, width: null, direction: null, surface: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Senonnes-Pouancé", slug: "hippodrome-de-senonnes-pouance", city: "Senonnes", region: "Anjou-Maine", lat: 47.796798, lng: -1.200926, founded: null, status: "active", length: 1600, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Forêt", slug: "hippodrome-de-la-foret", city: "Sille-Le-Guillaume", region: "Anjou-Maine", lat: 48.200745, lng: -0.136541, founded: null, status: "active", length: 1370, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Hoerdt", slug: "hippodrome-de-hoerdt", city: "Strasbourg", region: "Est", lat: 48.684149, lng: 7.787907, founded: null, status: "active", length: 1280, width: 20, direction: "right", surface: "salak", ownSite: "https://www.hippodrome-strasbourg.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Villeneuve", slug: "hippodrome-de-villeneuve", city: "Thouars", region: "Ouest", lat: 47.016701, lng: -0.203871, founded: null, status: "active", length: 1213, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de La Cépière", slug: "hippodrome-de-la-cepiere", city: "Toulouse", region: "Sud-Ouest", lat: 43.589808, lng: 1.405756, founded: 1856, status: "active", length: 1275, width: null, direction: "right", surface: "homok", ownSite: "https://www.hippodrome-toulouse.com", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome les Genets", slug: "hippodrome-les-genets", city: "Tours-Chambray", region: "Anjou-Maine", lat: 47.331435, lng: 0.713407, founded: 1845, status: "active", length: 1300, width: 20, direction: "right", surface: "fű", ownSite: "https://hippodrome-chambray-les-tours.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Soulancerre", slug: "hippodrome-de-soulancerre", city: "Trie-Sur-Baise", region: "Sud-Ouest", lat: 43.325558, lng: 0.368856, founded: null, status: "active", length: 1025, width: 20, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Flaran", slug: "hippodrome-de-flaran", city: "Valence-Sur-Baise", region: "Sud-Ouest", lat: 43.891332, lng: 0.371955, founded: null, status: "active", length: null, width: null, direction: null, surface: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome Claire Fontaine", slug: "hippodrome-claire-fontaine", city: "Valognes", region: "Basse-Normandie", lat: 49.490757, lng: -1.461977, founded: null, status: "active", length: 1000, width: null, direction: "left", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome André Cadoret", slug: "hippodrome-andre-cadoret", city: "Vannes", region: "Ouest", lat: 47.63701, lng: -2.725592, founded: null, status: "active", length: 1840, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Portillon", slug: "hippodrome-du-portillon", city: "Vertou", region: "Ouest", lat: 47.15348, lng: -1.469972, founded: null, status: "active", length: 1200, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la Forêt de Vibraye", slug: "hippodrome-de-la-foret-de-vibraye", city: "Vibraye", region: "Anjou-Maine", lat: 48.058984, lng: 0.688517, founded: null, status: "active", length: 1175, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome des Acacias", slug: "hippodrome-des-acacias", city: "Vic-Bigorre", region: "Sud-Ouest", lat: 43.377991, lng: 0.047367, founded: null, status: "unknown", length: null, width: null, direction: null, surface: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Gimat", slug: "hippodrome-de-gimat", city: "Vic-Fezensac", region: "Sud-Ouest", lat: 43.774226, lng: 0.303409, founded: null, status: "active", length: 1100, width: 16, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Vichy-Bellerive", slug: "hippodrome-de-vichy-bellerive", city: "Vichy", region: "Centre-Est", lat: 46.130112, lng: 3.407116, founded: 1875, status: "active", length: 1319, width: null, direction: "right", surface: "homok", ownSite: "https://www.coursesvichy.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Saultchevreuil", slug: "hippodrome-de-saultchevreuil", city: "Villedieu-Les-Poeles", region: "Basse-Normandie", lat: 48.836485, lng: -1.227582, founded: null, status: "active", length: 800, width: null, direction: "right", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Sangruère", slug: "hippodrome-de-sangruere", city: "Villeneuve-Sur-Lot", region: "Sud-Ouest", lat: 44.407548, lng: 0.761227, founded: null, status: "active", length: 1150, width: 16, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome du Pesquié-Bas", slug: "hippodrome-du-pesquie-bas", city: "Villereal", region: "Sud-Ouest", lat: 44.64191, lng: 0.745882, founded: null, status: "active", length: 869, width: 20, direction: "right", surface: "homok", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Vincennes Hippodrome de Paris", slug: "vincennes-hippodrome-de-paris", city: "Vincennes", region: "Île-de-France – Haute-Normandie", lat: 48.820485, lng: 2.450281, founded: 1863, status: "active", length: null, width: 30, direction: "right", surface: null, ownSite: "https://www.vincennes-hippodrome.com/", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome Robert Auvray", slug: "hippodrome-robert-auvray", city: "Vire Normandie", region: "Basse-Normandie", lat: 48.850478, lng: -0.900002, founded: 1974, status: "active", length: 1275, width: null, direction: "right", surface: "homok", ownSite: "http://www.hippodrome-vire-normandie.fr", operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome Saint-Etienne", slug: "hippodrome-saint-etienne", city: "Vitre", region: "Ouest", lat: 48.11015, lng: -1.194134, founded: null, status: "active", length: 1250, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Marcilly", slug: "hippodrome-de-marcilly", city: "Vitteaux", region: "Centre-Est", lat: 47.400377, lng: 4.511511, founded: null, status: "active", length: null, width: null, direction: null, surface: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Vittel", slug: "hippodrome-de-vittel", city: "Vittel", region: "Est", lat: 48.214505, lng: 5.94222, founded: null, status: "active", length: 1600, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de la hardt", slug: "hippodrome-de-la-hardt", city: "Wissembourg", region: null, lat: 49.0173, lng: 7.987234, founded: null, status: "active", length: null, width: null, direction: null, surface: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" },
        { name: "Hippodrome de Viseo", slug: "hippodrome-de-viseo", city: "Zonza", region: "Corse", lat: 41.76394, lng: 9.201055, founded: null, status: "active", length: 950, width: null, direction: "right", surface: "fű", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot" }
    ],
    ITA: [
        { name: "Ippodromo Mori", slug: "ippodromo-mori", city: "Mori (Trentino)", lat: 43.337709, lng: 13.6771285, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: null, operatorName: null, note: "Wikidata leírás: horse_racing / track | Nevesített olasz ippodromo – ellenőrizendő.. Koordináta forrása: OpenStreetMap (Nominatim) + GeoNames (10288438). Pálya forrása: Overpass/OSM OSM-way-102217742 (felfedező mód, 2026-08-01). A koordináta (43.3377, 13.6771) alapján a Marche régióban, Civitanova Marche közelében – a település megerősítése szükséges." },
        { name: "Ippodromo di Agnano", slug: "ippodromo-di-agnano", city: "Napoli", lat: 40.8371, lng: 14.1671, founded: 1935, status: "active", length: 1000, direction: null, org: "New Agnano Arena & Races Srl", ownSite: "https://www.ippodromoagnano.it/", operatorSite: null, operatorName: null, note: "Dél-Olaszország ügetősportjának központja; 1947 óta itt rendezik a Gran Premio Lotteria di Agnano-t; itt futotta 2002-ben Varenne, minden idők legjobb olasz ügetője, a máig megdöntetlen pályarekordot" },
        { name: "Ippodromo Snai San Siro (trotto)", slug: "ippodromo-snai-san-siro-trotto", city: "Milánó", lat: 45.4810, lng: 9.1373, founded: null, status: "active", length: null, direction: null, org: "Snaitech S.p.A.", ownSite: null, operatorSite: "https://www.ippodromisnai.it/", operatorName: "Snaitech (Ippodromi Snai hálózat)", note: "Az 1920-as években épült nagy milánói lósport-komplexum ügetőrésze; koncertek és nagyrendezvények helyszíneként is ismert" },
        { name: "Ippodromo dell'Arcoveggio", slug: "ippodromo-dell-arcoveggio", city: "Bologna", lat: 44.5179, lng: 11.3451, founded: null, status: "active", length: null, direction: null, org: "HippoGroup Cesenate S.p.A.", ownSite: null, operatorSite: "https://www.hippogroupcesenate.it/", operatorName: "HippoGroup Cesenate S.p.A.", note: "Ugyanaz a társaság (HippoGroup Cesenate) üzemelteti, mint a cesenai Savio-t; nyáron szabadtéri moziként is funkcionál a pálya belső területén" },
        { name: "Ippodromo delle Capannelle", slug: "ippodromo-delle-capannelle", city: "Róma", lat: 41.8256, lng: 12.5630, founded: 1881, status: "active", length: null, direction: null, org: "Roma Capitale (tulajdonos) / HippoGroup Roma Capannelle Srl (üzemeltető)", ownSite: null, operatorSite: "https://www.hippogroup.it/", operatorName: "HippoGroup (országos hálózat)", note: "Olaszország legrégebbi versenypályája (1881); 1926-ig kizárólag galopp, 2014 óta a galopppálya belsejében kialakított külön pályán ügetőversenyeket is rendeznek a bezárt Tor di Valle pálya öröksége nyomán" },
        { name: "Ippodromo del Mediterraneo", slug: "ippodromo-del-mediterraneo", city: "Siracusa", lat: 37.0014, lng: 15.1922, founded: null, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb", note: "Szicília egyetlen jelentős versenypályája, festői környezetben" },
        { name: "Ippodromo di Vinovo (Stupinigi)", slug: "ippodromo-di-vinovo-stupinigi", city: "Vinovo (Torino)", lat: 44.9785, lng: 7.6121, founded: null, status: "active", length: null, direction: null, org: "HippoGroup Torinese S.p.A.", ownSite: "http://www.ippodromovinovo.it/", operatorSite: "https://www.hippogroup.it/", operatorName: "HippoGroup (országos hálózat)", note: "Piemont vezető ügetőpályája, a Stupinigi-i vadászkastély közelében" },
        { name: "Ippodromo San Paolo", slug: "ippodromo-san-paolo", city: "Montegiorgio", lat: 43.1168, lng: 13.5743, founded: null, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: "http://www.sanpaolo.ippodromo.it/", operatorSite: null, operatorName: null, note: "Márche régió referenciapályája, itt rendezik a Palio dei Comuni versenyt" },
        { name: "Ippodromo dei Sauri", slug: "ippodromo-dei-sauri", city: "Castelluccio dei Sauri (Foggia)", lat: 41.3075, lng: 15.4548, founded: null, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "Dél-olasz vidéki pálya, karácsonyi rendezvényekről és családbarát programjairól ismert" },
        { name: "Ippodromo del Savio", slug: "ippodromo-del-savio", city: "Cesena", lat: 44.1434, lng: 12.2297, founded: 1922, status: "active", length: 800, direction: null, org: "HippoGroup Cesenate S.p.A.", ownSite: null, operatorSite: "https://www.hippogroupcesenate.it/", operatorName: "HippoGroup Cesenate S.p.A.", note: "1927 óta itt rendezik a Campionato Europeo di Trotto-t (Európa-bajnokság), amelynek egyedülálló formátuma van: két azonos versenyszámmal induló prova, majd egy közvetlen párbaj (race-off) a végső győztesért" },
        { name: "Ippodromo Paolo VI", slug: "ippodromo-paolo-vi", city: "Taranto", lat: 40.5376, lng: 17.3052, founded: null, status: "inactive", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: "https://ippodromopaolosesto.com/", operatorSite: null, operatorName: null, note: "Puglia régió ügetőpályája. STÁTUSZ (2026 nyara): jogi bizonytalanság – a Masaf 2026-ban visszavonta az üzemeltető társaság elismerését, miután a létesítményt végrehajtási árverésen adták el; a helyzet rendeződésétől függően újraindulhat" },
        { name: "Ippodromo della Favorita", slug: "ippodromo-della-favorita", city: "Palermo", lat: 38.1520, lng: 13.3453, founded: null, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "A Favorita történelmi park belsejében, a várost övező hegyek lábánál; nemrég újították fel TÉVES RIASZTÁS-VÉDELEM (2026-08): a havi ellenőrzés szerint a Wikidata Q3801699 megszűntként jelöli (P576 kitöltve) – ez ELAVULT. A pálya 2017-ben valóban bezárt (maffiaügy miatti antimafia-tiltás), de 2021 májusában a Sipet üzemeltetésében ÚJRANYITOTT. A 2026-os naptár 40 versenynapot tartalmaz szeptembertől májusig, épül az esti világítás is. Az \"active\" státusz HELYES, ne módosítsd." },
        { name: "Ippodromo dei Pini", slug: "ippodromo-dei-pini", city: "Follonica", lat: 42.9429, lng: 10.7745, founded: null, status: "inactive", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: "http://www.ippodromodeipini.it/", operatorSite: null, operatorName: null, note: "Toszkán tengerparti pálya. STÁTUSZ (2026 nyara): egész 2026-ban zárva tart; az önkormányzat új pályázatot tervez 2027-re, de egy módosított településrendezési terv más célú hasznosítást is megenged a területnek" },
        { name: "Ippodromo della Ghirlandina", slug: "ippodromo-della-ghirlandina", city: "Modena", lat: 44.6077, lng: 10.9179, founded: null, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "Teljes felújításon esett át, ma luxus éttermet (Antica Moka) is magába foglaló, Olaszország egyik legszebb pályájának tartott létesítmény" },
        { name: "Ippodromo Euroitalia", slug: "ippodromo-euroitalia", city: "Casarano (Lecce)", lat: 40.0375, lng: 18.1665, founded: null, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "Salento régió pályája, korábban az 1990-es években nagyobb jelentőséggel bírt" },
        { name: "Ippodromo Snai Sesana", slug: "ippodromo-snai-sesana", city: "Montecatini Terme", lat: 43.8819, lng: 10.7644, founded: 1916, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "Olaszország egyik mindössze három pályája (Trieszt, Padova mellett), amely 1922-ben már létezett és azóta is az eredeti helyén működik" },
        { name: "Ippodromo Sant'Artemio", slug: "ippodromo-sant-artemio", city: "Treviso", lat: 45.6936, lng: 12.2558, founded: null, status: "active", length: null, direction: null, org: "Nordest Ippodromi S.p.A.", ownSite: null, operatorSite: "https://www.nordestippodromi.com/", operatorName: "Nordest Ippodromi S.p.A.", note: "Veneto régió pályája, galopp és ügető versenyeknek egyaránt otthont ad; 2026-tól ide (és Padovába) helyezték át a bezárt trieszti Montebello versenynapjait is" },
        { name: "Ippodromo del Garigliano", slug: "ippodromo-del-garigliano", city: "Santi Cosma e Damiano (Latina)", lat: 41.2502, lng: 13.8067, founded: null, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "Csak nyáron üzemelő, családbarát vidéki pálya a Garigliano folyó mentén" },
        { name: "Ippodromo del Visarno Cesare Meli", slug: "ippodromo-del-visarno-cesare-meli", city: "Firenze", lat: 43.7806, lng: 11.2239, founded: null, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: "https://www.visarno.it/", operatorSite: null, operatorName: null, note: "A Cascine parkban található; koncertek (pl. Guns N' Roses, Imagine Dragons) kedvelt helyszíne is" },
        { name: "Ippodromo dei Fiori", slug: "ippodromo-dei-fiori", city: "Villanova d'Albenga (Savona)", lat: 44.0425, lng: 8.1233, founded: null, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "Ligur riviéra pályája, esti versenyekkel és látványos tengerparti panorámával" },
        { name: "Ippodromo delle Padovanelle (V.S. Breda)", slug: "ippodromo-delle-padovanelle-v-s-breda", city: "Padova", lat: 45.4248, lng: 11.9337, founded: 1901, status: "active", length: null, direction: null, org: "Gruppo Coppiello snc", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "Olaszország egyik mindössze három pályája (Trieszt, Montecatini mellett), amely 1922-ben már létezett és azóta is az eredeti helyén működik; 2011-ben pénzügyi okokból ideiglenesen felfüggesztették a versenyeket, 2013 óta újra aktív" },
        { name: "Ippodromo Valentinia", slug: "ippodromo-valentinia", city: "Pontecagnano Faiano (Salerno)", lat: 40.6015, lng: 14.9018, founded: null, status: "active", length: null, direction: null, org: "Valentinia S.r.l.", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "Dél-olasz pálya Salerno közelében" },
        { name: "Ippodromo Montebello", slug: "ippodromo-montebello", city: "Trieste", lat: 45.6386, lng: 13.7943, founded: 1892, status: "closed", length: null, direction: null, org: "Nordest Ippodromi S.p.A. (korábbi üzemeltető)", ownSite: null, operatorSite: "https://www.nordestippodromi.com/", operatorName: "Nordest Ippodromi S.p.A. (korábbi üzemeltető)", note: "Olaszország legrégebbi, folyamatosan az eredeti helyén működő versenypályája volt (1892 óta). STÁTUSZ (2026 nyara): a Nordest Ippodromi Spa 2026 elején végleg lemondott az üzemeltetésről, a Masaf visszavonta az engedélyt, a versenyeket Trevisóba és Padovába helyezték át; a régió 30 millió eurót különített el a terület más célú (sportcitadella) átalakítására – a visszatérés lóversenyzéshez valószínűtlen" },
        { name: "Ippodromo Cirigliano", slug: "ippodromo-cirigliano", city: "Aversa (Caserta)", lat: 40.9587, lng: 14.2039, founded: null, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "Campania régió pályája, egykor Aversa városának fontos központja volt" },
        { name: "Ippodromo San Marone", slug: "ippodromo-san-marone", city: "Civitanova Marche (Macerata)", lat: 43.3374, lng: 13.6775, founded: null, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "Dombtetőn fekvő pálya, panorámás kilátással a tengerre és a hegyekre" },
        { name: "Ippodromo Cesare Fiaschi", slug: "ippodromo-cesare-fiaschi", city: "Ferrara", lat: 44.8260, lng: 11.6142, founded: null, status: "active", length: null, direction: null, org: "Nordest Ippodromi S.p.A.", ownSite: null, operatorSite: "https://www.nordestippodromi.com/", operatorName: "Nordest Ippodromi S.p.A.", note: "Emilia-Romagna régió pályája; a Nordest Ippodromi Spa több mint 20 éve kezeli (egy rövid, üzemeltető-váltás miatti szünettől eltekintve), Trieszttel és Trevisóval közös hálózatban" }
    ],
    FIN: [
        { name: "Metsämäki racetrack", slug: "metsamaki-racetrack", city: "Turku", lat: 60.495, lng: 22.346944444444443, founded: 1978, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: null, operatorName: null, note: "Wikidata leírás: harness racing venue in Turku, Finland. Koordináta forrása: Wikidata Q111133483 + GeoNames (12657774). Pálya forrása: Wikidata Q111133483 (felfedező mód, 2026-08-01). A Wikidata leírása szerint harness racing venue in Turku – a turkui ügetőpálya." },
        { name: "Haapajärven ravirata", slug: "haapajarven-ravirata", city: "Haapajärvi", lat: 63.7442409, lng: 25.3501997, founded: 1949, status: "active", length: null, direction: null, org: "Haapajärven Ravi ry", ownSite: null, operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + GeoNames (13231750). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Halsuan ravirata", slug: "halsuan-ravirata", city: "Halsua", lat: 63.4701104, lng: 24.1621995, founded: null, status: "active", length: null, direction: null, org: "Halsuan Hevosjalostusyhdistys ry", ownSite: null, operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + OpenStreetMap (Nominatim) + GeoNames (12941901). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Härmän ravirata", slug: "harman-ravirata", city: "Härmä", lat: 63.25277778, lng: 22.84694444, founded: 1934, status: "active", length: null, direction: null, org: "Härmän Ravirata Oy", ownSite: "https://harman-ravirata.webnode.fi", operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + Wikidata Q18659263 + Wikipédia (fi) – Härmän ravirata + GeoNames (12937441). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Kannuksen ravirata", slug: "kannuksen-ravirata", city: "Kannus", lat: 63.8917157, lng: 23.9206896, founded: null, status: "active", length: null, direction: null, org: "Kannuksen keskusravirata Oy", ownSite: null, operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + GeoNames (13187417). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Kokkolan ravirata", slug: "kokkolan-ravirata", city: "Kokkola", lat: 63.8245106, lng: 23.0593203, founded: null, status: "active", length: null, direction: null, org: "Kokkolanseudun Hippos ry", ownSite: "https://kokkolanravit.fi/", operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: OpenStreetMap (Nominatim) + GeoNames (13184703). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Suonenjoen ravirata", slug: "suonenjoen-ravirata", city: "Suonenjoki", lat: 62.6410142, lng: 27.0873064, founded: null, status: "active", length: null, direction: null, org: "Suonenjoen Hevosystäväinseura ry", ownSite: "https://www.suonenjoenravirata.fi", operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: OpenStreetMap (Nominatim) + GeoNames (13174791). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "PowerParkin ravirata", slug: "powerparkin-ravirata", city: "Kauhava", lat: 63.232667, lng: 22.8343533, founded: 2016, status: "active", length: null, direction: null, org: "Powerparkin ravirata", ownSite: "https://nordicking.fi", operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + OpenStreetMap (Nominatim). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Kaukosen ravirata", slug: "kaukosen-ravirata", city: "Kaukonen", lat: 67.4896893, lng: 24.9103611, founded: null, status: "active", length: 800, direction: null, org: "Kittilän Hevosystävät ry", ownSite: null, operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap. Finnország legészakibb pályája, kb. 150 m célegyenessel.. Koordináta forrása: Nominatim (postai cím) + Wikidata Q132366082. Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Kausalan ravirata", slug: "kausalan-ravirata", city: "Kausala", lat: 60.8892041, lng: 26.3579558, founded: 1924, status: "active", length: null, direction: null, org: "Iitin Hevosystäväinseura ry", ownSite: "https://www.iitinhys.fi/", operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + Wikidata Q18680758. Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Kokemäen ravirata", slug: "kokemaen-ravirata", city: "Kokemäki", lat: 61.2020569, lng: 22.2749421, founded: null, status: "active", length: null, direction: null, org: "Sataravi Oy", ownSite: "https://www.sataravi.fi/", operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + Wikidata Q11872139 + OpenStreetMap (Nominatim). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Kurtakon ravirata", slug: "kurtakon-ravirata", city: "Kolari", lat: 67.4115326, lng: 24.1099989, founded: 1966, status: "active", length: null, direction: null, org: "Ylläksen Ravi ry", ownSite: null, operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + Wikidata Q132366131 + OpenStreetMap (Nominatim). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Lieksan ravirata", slug: "lieksan-ravirata", city: "Lieksa", lat: 63.300204, lng: 30.0791641, founded: null, status: "active", length: null, direction: null, org: "Pielisjärven Hevosystäväinseura ry", ownSite: "https://www.lieksanravirata.fi", operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + OpenStreetMap (Nominatim). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Loviisan ravirata", slug: "loviisan-ravirata", city: "Loviisa", lat: 60.4601486, lng: 26.2233908, founded: null, status: "active", length: null, direction: null, org: "Itä-Uudenmaan Oriyhdistys ry", ownSite: "https://www.loviisanravit.fi/", operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap. Finnország legdélibb pályája.. Koordináta forrása: Nominatim (postai cím) + Wikidata Q18660623 + OpenStreetMap (Nominatim). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Ålandstravet", slug: "alandstravet", city: "Mariehamn", lat: 60.13, lng: 19.94777778, founded: null, status: "active", length: null, direction: null, org: "Ålands Hästsportförening r.f.", ownSite: "https://alandstravet.com/", operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Wikidata Q18660708 + OpenStreetMap (Nominatim). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Riihimäen ravirata", slug: "riihimaen-ravirata", city: "Riihimäki", lat: 60.7548493, lng: 24.7726123, founded: null, status: "active", length: null, direction: null, org: "Riihimäen Raviseura ry", ownSite: "https://www.riihimaenravit.fi/", operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + Wikidata Q18661713 + OpenStreetMap (Nominatim). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Sodankylän ravirata", slug: "sodankylan-ravirata", city: "Sodankylä", lat: 67.401525, lng: 26.6731729, founded: null, status: "active", length: null, direction: null, org: "Lapin Ravi ry", ownSite: null, operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + Wikidata Q132365965 + OpenStreetMap (Nominatim). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Vieremän ravirata", slug: "viereman-ravirata", city: "Vieremä", lat: 63.684472, lng: 27.0731695, founded: null, status: "active", length: null, direction: null, org: "Ylä-Savon Hippos ry", ownSite: "https://www.vieremanravirata.fi/", operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + Wikidata Q11901185 + OpenStreetMap (Nominatim). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Vermo Areena", slug: "vermo-areena", city: "Espoo (Helsinki)", lat: 60.2152, lng: 24.8392, founded: null, status: "active", length: null, direction: null, org: "Vermon Ravirata Oy", ownSite: "http://www.vermo.fi", operatorSite: null, operatorName: null, note: "Finnország központi (nemzeti) versenypályája; évi kb. 40 szerdai versenynap. Kiemelt futamok: Finlandia-Ajo, Suuri Suomalainen Derby, Käpylä Grand Prix" },
        { name: "Pilvenmäki", slug: "pilvenmaki", city: "Forssa", lat: 60.8069, lng: 23.5833, founded: null, status: "active", length: null, direction: null, org: "Forssan Seudun Hippos ry", ownSite: "http://www.pilvenmaki.fi", operatorSite: null, operatorName: null, note: "Kanta-Häme régió edzőközpontja és versenypályája. Kiemelt futamok: Pilvenmäki Special, Tammavaltikka, Pilvenmäki Maraton" },
        { name: "Joensuun ravirata (Linnunlahti)", slug: "joensuun-ravirata-linnunlahti", city: "Joensuu", lat: 62.5982, lng: 29.7307, founded: null, status: "active", length: null, direction: null, org: "Joensuun Ravirata Oy", ownSite: "http://www.joensuunravirata.fi", operatorSite: null, operatorName: null, note: "Több mint 100 éves történelmű pálya, híres izgalmas hajrá-versenyeiről. Kiemelt futam: Joensuu-Ajo" },
        { name: "Killeri", slug: "killeri", city: "Jyväskylä", lat: 62.2450, lng: 25.6729, founded: null, status: "active", length: null, direction: null, org: "Keski-Suomen Ravirata Oy", ownSite: "http://www.killeri.fi", operatorSite: null, operatorName: null, note: "Festői tóparti fekvés (Killerjärvi mellett); évi 20+ versenynap. Kiemelt futamok: Killerin Eliitti, Keskisuomalainen Derby" },
        { name: "Kainuun ravirata", slug: "kainuun-ravirata", city: "Kajaani", lat: 64.2788, lng: 27.8473, founded: null, status: "active", length: null, direction: null, org: "Racetrack Kainuu Oy", ownSite: "http://www.kainuunravirata.fi", operatorSite: null, operatorName: null, note: "Egyedi vöröses borítású pálya, amit sokan Finnország legszebb versenypályájának tartanak; önkéntes munkával üzemeltetve" },
        { name: "Kaustinen (Nikula)", slug: "kaustinen-nikula", city: "Kaustinen", lat: 63.5816, lng: 23.5790, founded: null, status: "active", length: null, direction: null, org: "Kaustisen Seudun Raviseura ry", ownSite: "https://kaustisenravit.fi", operatorSite: null, operatorName: null, note: "A híres Kaustinen Folk Music Festival régiójában; kiemelt futamok: Pelimanni-ravit, Festivaaliravit" },
        { name: "Kouvolan ravirata", slug: "kouvolan-ravirata", city: "Kouvola", lat: 60.8848, lng: 26.7033, founded: 1910, status: "active", length: null, direction: null, org: "Valkealan hevosystäväinseura ry", ownSite: "http://www.kouvolanravirata.com/", operatorSite: null, operatorName: null, note: "Az 1910-es évek eleje óta ugyanazon a helyen működik – Finnország 2. legrégebbi, folyamatosan azonos helyszínű pályája. 2026-ban itt rendezték a UET Elite Circuit Kymi Grand Prix-t" },
        { name: "Kuopion ravirata (Sorsasalo)", slug: "kuopion-ravirata-sorsasalo", city: "Kuopio", lat: 62.9670, lng: 27.6805, founded: null, status: "active", length: null, direction: null, org: "Kuopion ravirata", ownSite: "http://www.kuopionravirata.fi", operatorSite: null, operatorName: null, note: "Évi kb. 25 versenynap. Kiemelt futam: Kuopio Stakes" },
        { name: "Jokimaa", slug: "jokimaa", city: "Lahti", lat: 60.9385, lng: 25.6089, founded: null, status: "active", length: null, direction: null, org: "Lahden hevosystäväinseura ry", ownSite: "https://www.jokimaanravit.fi/", operatorSite: null, operatorName: null, note: "Évi 30+ versenynap, közel 100 ló edz a területén. Fő eseménye a háromnapos Suur-Hollola-ravit" },
        { name: "Lappeen ravirata", slug: "lappeen-ravirata", city: "Lappeenranta", lat: 61.0363, lng: 28.1039, founded: 1973, status: "active", length: null, direction: null, org: "Lappeenrannan Ravirata Oy", ownSite: "https://www.lappeenravit.fi/", operatorSite: null, operatorName: null, note: "1973 óta rendeznek itt versenyt. Kiemelt futam: Villinmiehen Tammakilpailu" },
        { name: "Mikkelin ravirata", slug: "mikkelin-ravirata", city: "Mikkeli", lat: 61.7037, lng: 27.2436, founded: null, status: "active", length: null, direction: null, org: "Mikkelin ravirata Oy", ownSite: "http://www.mikkelinravirata.fi/", operatorSite: null, operatorName: null, note: "Világhírű \"rekordpálya\" – számos világ-, Európa- és Finnország-rekord született itt. 1979 óta rendszeres nagyversenyek helyszíne (St Michel-ajo, 1981 óta)" },
        { name: "Äimäraution ravirata", slug: "aimaraution-ravirata", city: "Oulu", lat: 64.9815, lng: 25.4690, founded: 1908, status: "active", length: null, direction: null, org: "Pohjolan Hevosystävät ry", ownSite: "http://oulunravit.fi", operatorSite: null, operatorName: null, note: "Finnország legrégebbi versenypályája (1908 óta). Kiemelt futamok: Oulu Express, Number One" },
        { name: "Porin ravirata", slug: "porin-ravirata", city: "Pori", lat: 61.4670, lng: 21.8116, founded: null, status: "active", length: null, direction: null, org: "Porin Ravit Oy", ownSite: "http://porinravit.fi", operatorSite: null, operatorName: null, note: "Városközponthoz közeli, dinamikus rendezvényhelyszín. Kiemelt futamok: Kultaloimi, St. Leger, Satakunta-ajo TÉVES RIASZTÁS-VÉDELEM (2026-08): a havi ellenőrzés 27 km eltérést jelez a Wikidata Q11888685 alapján – a WIKIDATA hibás. A pálya Pori Impola városrészében van, a belváros közvetlen közelében (Ravintie 1, 28130 Pori), amit a porinravit.fi és a fi.wikipedia is megerősít. A Wikidata koordinátája délnyugatra, Luvia környékére mutat. A mi koordinátánk HELYES, ne módosítsd." },
        { name: "Rovaniemen ravirata (Mäntyvaara)", slug: "rovaniemen-ravirata-mantyvaara", city: "Rovaniemi", lat: 66.5113, lng: 25.6037, founded: 1976, status: "active", length: null, direction: null, org: "Rovaniemen Ravirata Oy", ownSite: "https://rovaniemenravirata.fi/", operatorSite: null, operatorName: null, note: "1976 óta rendeznek itt versenyt; Finnország legészakibb pályája, amfiteátrum-szerű, egyedülálló lelátóval. Kiemelt futam: Arctic Horse Race" },
        { name: "Seinäjoen ravikeskus", slug: "seinajoen-ravikeskus", city: "Seinäjoki", lat: 62.8011, lng: 22.8544, founded: null, status: "active", length: null, direction: null, org: "Etelä-Pohjanmaan hevosjalostusliitto ry", ownSite: "https://www.seinajoenravikeskus.fi/", operatorSite: null, operatorName: null, note: "Évi közel 30 versenynap. Kiemelt nemzetközi futam: Seinäjoki Race" },
        { name: "Teivon ravirata", slug: "teivon-ravirata", city: "Tampere (Ylöjärvi)", lat: 61.5292, lng: 23.6263, founded: null, status: "active", length: null, direction: null, org: "Tampereen Ravirata Oy", ownSite: "http://www.teivo.fi", operatorSite: null, operatorName: null, note: "Finnország 2. legnagyobb pályája versenynapok száma szerint; 2026-ban ünnepelte 50 éves fennállását és itt rendezték a Kuninkuusravit (a finn \"királyi versenyek\", Finnország legnagyobb sportrendezvénye, kb. 50 000 nézővel)" },
        { name: "Laivakankaan ravirata", slug: "laivakankaan-ravirata", city: "Tornio", lat: 65.8196, lng: 24.3606, founded: 1974, status: "active", length: null, direction: null, org: "Länsi-Lapin Hevosystävät ry", ownSite: "https://laivakangas.fi/", operatorSite: null, operatorName: null, note: "1974 óta rendeznek itt versenyt; a pályát felújították, ma az egyik leggyorsabb finn pálya. Kiemelt futamok: Midnight Cup, Lady Cup" },
        { name: "Metsämäen ravirata", slug: "metsamaen-ravirata", city: "Turku", lat: 60.4933, lng: 22.3496, founded: 1978, status: "active", length: null, direction: null, org: "Turun Hippos ry", ownSite: "https://www.turunhippos.fi/", operatorSite: null, operatorName: null, note: "1978 óta működik. Kiemelt futam: Pohjoismaiden mestaruus (skandináv bajnokság)" },
        { name: "Ylivieskan ravirata (Keskinen)", slug: "ylivieskan-ravirata-keskinen", city: "Ylivieska", lat: 64.1113, lng: 24.5105, founded: null, status: "active", length: null, direction: null, org: "Pohjanmaan Ravi ry", ownSite: "http://www.ylivieskanravit.fi/", operatorSite: null, operatorName: null, note: "1997-ben itt rendezték a Kuninkuusravit. Kiemelt futamok: Ruunakunkkarit (hidegvérű heréltek), Malja-ajo" }
    ],
    NOR: [
        { name: "Bjerke Travbane", slug: "bjerke-travbane", city: "Oslo", lat: 59.9409, lng: 10.8104, founded: 1928, status: "active", length: null, direction: null, org: "Det Norske Travselskap (DNT)", ownSite: null, operatorSite: "https://www.travsport.no/", operatorName: "Det Norske Travselskap (DNT)", note: "Norvégia nemzeti főpályája, évi 100+ versenynappal; itt van a DNT (Det Norske Travselskap, alapítva 1875) központja is. Koncerthelyszínként is használt (pl. AC/DC, Tons of Rock fesztivál). Oslo fő pályája, 1928 óta. A DNT (Det Norske Travselskap) 1875-ben alakult." },
        { name: "Bergen Travpark", slug: "bergen-travpark", city: "Breistein (Bergen)", lat: 60.4847, lng: 5.3858, founded: 1985, status: "active", length: null, direction: null, org: "Bergen Travpark", ownSite: null, operatorSite: "https://www.travsport.no/", operatorName: "Det Norske Travselskap (DNT)", note: "Nyugat-Norvégia vezető ügetőpályája. 1985-ben váltotta a korábbi, 500 m-es nesttuni pályát (1926–1985)." },
        { name: "Biri Travbane", slug: "biri-travbane", city: "Biri", lat: 60.9579, lng: 10.6254, founded: 1985, status: "active", length: null, direction: null, org: "Biri Travbane", ownSite: null, operatorSite: "https://www.travsport.no/", operatorName: "Det Norske Travselskap (DNT)", note: "Tóparti fekvésű pálya Gjøvik közelében. 1985-ben nyílt, a korábbi 550 m-es Vikodden helyett." },
        { name: "Forus Travbane", slug: "forus-travbane", city: "Stavanger", lat: 58.8911, lng: 5.7254, founded: 1920, status: "active", length: null, direction: null, org: "Forus Travbane", ownSite: null, operatorSite: "https://www.travsport.no/", operatorName: "Det Norske Travselskap (DNT)", note: "Nyugat-Norvégia (Stavanger-régió) egyetlen ügetőpályája; koncerthelyszínként is működik. 1920-ban nyílt – a Klosterskogennel és a Momarkennel egy évben." },
        { name: "Harstad Travpark", slug: "harstad-travpark", city: "Harstad", lat: 68.7883, lng: 16.4591, founded: 1995, status: "active", length: null, direction: null, org: "Harstad Travpark", ownSite: null, operatorSite: "https://www.travsport.no/", operatorName: "Det Norske Travselskap (DNT)", note: "Észak-Norvégia egyik pályája, a sarkkörön túl. 1995-ben nyílt. A világ legészakibb, egész évben üzemelő ügetőpályája." },
        { name: "Jarlsberg Travbane", slug: "jarlsberg-travbane", city: "Sem (Tønsberg)", lat: 59.2787, lng: 10.3694, founded: 1935, status: "active", length: null, direction: null, org: "Jarlsberg Travbane", ownSite: null, operatorSite: "https://www.travsport.no/", operatorName: "Det Norske Travselskap (DNT)", note: "Vestfold megye vezető ügetőpályája. 1935-ben nyílt." },
        { name: "Klosterskogen Travbane", slug: "klosterskogen-travbane", city: "Skien", lat: 59.1903, lng: 9.5992, founded: 1920, status: "active", length: null, direction: null, org: "AS Klosterskogen Travbane", ownSite: null, operatorSite: "https://www.travsport.no/", operatorName: "Det Norske Travselskap (DNT)", note: "Húsvéti versenyeiről ismert, élénk hangulatú pálya. 1920-ban nyílt." },
        { name: "Momarken Travbane", slug: "momarken-travbane", city: "Mysen", lat: 59.5691, lng: 11.3340, founded: 1920, status: "active", length: null, direction: null, org: "Momarken Travbane", ownSite: null, operatorSite: "https://www.travsport.no/", operatorName: "Det Norske Travselskap (DNT)", note: "Kelet-Norvégia (Østfold megye) pályája. 1920-ban nyílt. FIGYELEM: a DNT Trav2025 stratégiája szerint a pálya eladása vagy bezárása napirenden van – státusza figyelendő." },
        { name: "Sørlandets Travpark", slug: "sorlandets-travpark", city: "Kristiansand", lat: 58.1810, lng: 8.1508, founded: 1988, status: "active", length: null, direction: null, org: "Sørlandets Travpark AS", ownSite: null, operatorSite: "https://www.travsport.no/", operatorName: "Det Norske Travselskap (DNT)", note: "Dél-Norvégia vezető ügetőpályája. 1988-ban nyílt a korábbi Hortemo helyett; a nyitónapon kb. 30 000 néző volt jelen." },
        { name: "Leangen Travbane", slug: "leangen-travbane", city: "Trondheim", lat: 63.4300, lng: 10.4711, founded: 1931, status: "closed", length: null, direction: null, org: "Leangen Travbane", ownSite: null, operatorSite: "https://www.travsport.no/", operatorName: "Det Norske Travselskap (DNT)", note: "Közép-Norvégia pályája volt, 1931-től. STÁTUSZ: a pályát eladták, és a 2022-es szezon után a Varig Orkla Arena váltotta fel – ez azonban NEM névváltozás, hanem MÁSIK pálya, az Orkla-völgyben, nem Trondheimben. A DNT hivatalos totalizatőrös pályalistáján a Varig Orkla Arena szerepel, a Leangen nem. JAVÍTVA (2026-07): a két pálya korábban egy rekordba volt vonva. A Varig Orkla Arena külön rekordként veendő fel, amint megbízható koordináta rendelkezésre áll – addig nem vesszük fel, mert a helyét nem találgatjuk" },
        { name: "Drammen Travbane", slug: "drammen-travbane", city: "Drammen", lat: 59.7551, lng: 10.1154, founded: 1955, status: "closed", length: 800, direction: null, org: "Det Norske Travselskap (korábbi üzemeltető)", ownSite: null, operatorSite: "https://www.travsport.no/", operatorName: "Det Norske Travselskap (DNT)", note: "1955-ben nyílt, 800 m-es pálya. STÁTUSZ: 2019-ben véglegesen bezárt – az utolsó szezonja volt, miután évtizedekig motorsport-, kutyakiállítás- és ügető-helyszínként is szolgált" }
    ],
    POL: [
        { name: "Tor Wyścigów Konnych Służewiec", slug: "tor-wyscigow-konnych-sluzewiec", city: "Varsó", lat: 52.1652, lng: 21.0159, founded: 1939, status: "active", length: 2300, direction: null, org: "Tor Służewiec Sp. z o.o.", ownSite: null, operatorSite: "https://pkwk.org/", operatorName: "Polski Klub Wyścigów Konnych", note: "ELLENŐRZVE (2026): AKTÍV, ügetőversennyel is. Lengyelország legnagyobb és legrégebbi lóversenypályája (1939), történelmi műemlék. Elsődlegesen galopp, de a lengyel szaksajtó szerint Varsóban, Wrocławban és Sopotban egyaránt több tucat ügetőfutamot rendeznek szezononként. MEGJEGYZÉS: Lengyelország nem UET-tagország, ezért a nemzetközi ügető-nyilvántartásokban nem szerepel – a sport mégis létezik, hazai szervezésben" },
        { name: "Wrocławski Tor Wyścigów Konnych – Partynice", slug: "wroclawski-tor-wyscigow-konnych-partynice", city: "Wrocław", lat: 51.0552, lng: 17.0007, founded: 1833, status: "active", length: null, direction: null, org: "Gmina Wrocław (önkormányzati fenntartású)", ownSite: "https://www.torpartynice.pl/", operatorSite: null, operatorName: null, note: "ELLENŐRZVE (2026): AKTÍV, rendszeres nemzetközi ügetőfutamokkal. 1833 óta rendeznek itt versenyt. A 2026-os szezon április 12-én indult (a látogatói rekord 21 000 fő volt 2022-ben, ingyenes belépéssel). Igazolt 2026-os ügetőfutamok: Nagroda Otwarcia Sezonu Kłusaczego (május 1., 20 000 zł), Puchar Pierwszego Maja (2400 m, francia ügetők), Puchar Światowego Dnia Krwiodawstwa (június 14.). Lengyelország három versenypályája közül az EGYETLEN, ahol akadályversenyt is rendeznek" },
        { name: "Hipodrom Sopot", slug: "hipodrom-sopot", city: "Sopot", lat: 54.4280, lng: 18.5706, founded: null, status: "active", length: null, direction: null, org: "Hipodrom Sopot", ownSite: null, operatorSite: "https://pkwk.org/", operatorName: "Polski Klub Wyścigów Konnych", note: "VISSZAHELYEZVE ÖNKORREKCIÓ UTÁN: korábban tévesen kivettem a listából, mert csak lovassport-központként (Longines FEI Jumping Nations Cup) azonosítottam. A lengyel szaksajtó szerint azonban Sopot Lengyelország három versenypályájának egyike, ahol szezononként több tucat ügetőfutamot is rendeznek Varsó és Wrocław mellett. Vegyes profil: díjugratás + lóverseny" },
        { name: "Krakowski Tor Wyścigów Konnych (Buczków)", slug: "krakowski-tor-wyscigow-konnych-buczkow", city: "Buczków (Krakkó mellett)", lat: 50.0458, lng: 20.5645, founded: null, status: "unknown", length: null, direction: null, org: "Krakowski Tor Wyścigów Konnych", ownSite: null, operatorSite: "https://pkwk.org/", operatorName: "Polski Klub Wyścigów Konnych", note: "STÁTUSZ: ELLENŐRZENDŐ – ez a listánk egyetlen megoldatlan tétele. Lengyel ügető-specifikus forráslisták kłusaki (ügető) pályaként említik, DE a lengyel szaksajtó következetesen csak HÁROM versenypályát nevez meg az országban (Varsó-Służewiec, Wrocław-Partynice, Sopot). Ez alapján Buczków legfeljebb kisebb edző- vagy alkalmi helyszín lehet, nem hivatalos versenypálya. A megerősítéshez helyi/lengyel nyelvű forrás vagy közvetlen megkeresés kellene" }
    ],
    CZE: [
        { name: "Velká Chuchle (Chuchle Arena Praha)", slug: "velka-chuchle-chuchle-arena-praha", city: "Prága", lat: 50.0092, lng: 14.3893, founded: 1906, status: "active", length: null, direction: "right", org: "Chuchle Arena Praha / Česká Klusácká Asociace", ownSite: "https://www.dostihy.cz/", operatorSite: "http://www.czetra.cz/", operatorName: "Česká Klusácká Asociace", note: "ELLENŐRZVE (2026, több forrás): AKTÍV ÜGETŐPÁLYA. 1906. szeptember 28-án nyílt. ITT VAN A CSEH ÜGETŐSZÖVETSÉG (Česká Klusácká Asociace) SZÉKHELYE, és a cseh ügetőfutamok túlnyomó többségét is itt rendezik. Galopp és ügető egyaránt; évi kb. 20 versenynap április-októberben, 2026-ra 13 versenynap tervezve. KÜLÖNLEGESSÉG: a világon mindössze két pályán versenyeznek jobbkéz (óramutató járása szerinti) irányban – Velká Chuchlén és a berlini pályán. A legrégebbi ma is kiírt futam a Cena prezidenta republiky (1920, T. G. Masaryk tiszteletére)" },
        { name: "Hipodrom Bravantice", slug: "hipodrom-bravantice", city: "Bravantice (Ostrava mellett)", lat: 49.7613, lng: 18.0921, founded: 2014, status: "active", length: 1000, direction: null, org: "Hipodrom Central a.s. (Jiří Svoboda)", ownSite: "https://www.dostihyostrava.cz/", operatorSite: "http://www.czetra.cz/", operatorName: "Česká Klusácká Asociace", note: "ELLENŐRZVE (2026, több forrás): AKTÍV, KIZÁRÓLAG ÜGETŐPÁLYA. 2014 áprilisában nyílt, a SVÉD SOLVALLA mintájára építve – pontos kanyarívekkel, 16 ló számára elegendő szélességgel két sorban. 40 hektár, 200 lóbox, 10 000 fős kapacitás, többfunkciós tribün kilátótoronnyal. 2026-ban TÖBB VERSENYNAPOT rendez, mint a prágai Velká Chuchle (kb. 10/év) – nemzetközi részvétellel (holland, osztrák, német, svéd, ukrán versenyzők). A pályán mért időket nemzetközileg elismerik, Franciaországot is beleértve. Kiemelt esemény: České klusácké derby (2026. augusztus 29.). Ingyenes belépés és parkolás; a futamokat YouTube-on streamelik" }
    ],
    SVK: [
        { name: "Závodisko Bratislava – Starý háj (Petržalka)", slug: "zavodisko-bratislava-stary-haj-petrzalka", city: "Pozsony", lat: 48.1165, lng: 17.1216, founded: null, status: "inactive", length: 2800, direction: null, org: "Závodisko, š.p. Bratislava", ownSite: null, operatorSite: "https://www.harness.sk/", operatorName: "Trotting Slovakia", note: "STÁTUSZ: a hivatalos ügető-üzemeltetés 2012-ben leállt; azóta csak alkalmi, lelkesedők (pl. a Klusácka asociácia Slovenska / Trotting Slovakia) által szervezett emlék- és díjfutamok vannak (pl. Szlovák Ügető Derby, rendszertelen időközönként). A hagyomány 1953-ig nyúlik vissza (Csehszlovák Ügető Derby)" }
    ],
    HUN: [
        { name: "Kincsem Park", slug: "kincsem-park", city: "Budapest", lat: 47.4972, lng: 19.1218, founded: 1925, status: "active", length: null, direction: null, org: "Kincsem Nemzeti Kft.", ownSite: null, operatorSite: "https://kincsempark.hu/", operatorName: "Kincsem Park", trotSince: 2004, note: "Magyarország egyetlen aktív, kombinált galopp- és ügetőpályája; mindkét szakágban rendszeres versenynaptárral. A pálya 1925-ben nyílt; az ügetősport 2004-ben költözött ide." }
    ],
    EST: [
        { name: "Tallinna Hipodroom", slug: "tallinna-hipodroom", city: "Tallinn", lat: 59.4323, lng: 24.7055, founded: 1923, status: "closed", length: null, direction: null, org: "korábbi üzemeltető ismeretlen", ownSite: null, operatorSite: null, operatorName: null, note: "1923 óta működött. STÁTUSZ: 2022-ben véglegesen bezárt, a területet irodaházként építik be. FONTOS KORREKCIÓ: az észt ügetősport ettől NEM szűnt meg – az Eesti Traaviliit UET-tagszövetség 2025-ben 84 futamot rendezett 1 pályán, tehát létezik egy másik, aktív helyszín, amit még azonosítani kell. Litvániában is 2 aktív ügetőpálya van (Lithuania National Trotting League, UET-tag)" }
    ],
    USA: [
        { name: "Batavia Downs", slug: "batavia-downs", city: "Batavia, NY", region: "NY", lat: 43.0097, lng: -78.2050, founded: null, status: "active", length: 805, direction: null, org: "Western Regional OTB", ownSite: "https://www.bataviadownsgaming.com/live-racing/", operatorSite: null, operatorName: null, note: "Amerika egyik legrégebbi téli versenynaptáras pályája; kaszinóval egybeépítve. Pontosan fél mérföld (0,80 km). Az USA legrégebbi villanyfényes ügetőpályája, 1940.09.20-i megnyitással. USTA hivatalos besorolás: fél mérföldes pálya (805 m). Cím: 8315 Park Rd, Batavia, NY 14020." },
        { name: "Buffalo Raceway", slug: "buffalo-raceway", city: "Hamburg, NY", region: "NY", lat: 42.7359, lng: -78.8152, founded: null, status: "active", length: 805, direction: null, org: "USTA", ownSite: "http://www.buffaloraceway.com", operatorSite: null, operatorName: null, note: "Az Erie County Fairgrounds területén; tavaszi-nyári versenyszezon. USTA hivatalos besorolás: fél mérföldes pálya (805 m). Cím: 5600 McKinley Pkwy, Hamburg, NY 14075." },
        { name: "The Mint Gaming Hall – Cumberland Run", slug: "the-mint-gaming-hall-cumberland-run", city: "Corbin, KY", region: "KY", lat: 36.9248, lng: -84.0565, founded: null, status: "active", length: 1006, direction: null, org: "USTA", ownSite: null, operatorSite: "https://www.ustrotting.com/track-information/", operatorName: "USTA – pályainformációk", note: "Kentucky egyik újabb, kaszinóval egybeépített ügetőpályája. USTA hivatalos besorolás: öt-nyolcad mérföldes pálya (1006 m). Cím: 777 Winners Ln, Corbin, KY 40701." },
        { name: "First Tracks Cumberland", slug: "first-tracks-cumberland", city: "Cumberland, ME", region: "ME", lat: 43.8119, lng: -70.2888, founded: null, status: "active", length: 805, direction: null, org: "USTA", ownSite: null, operatorSite: "https://www.ustrotting.com/track-information/", operatorName: "USTA – pályainformációk", note: "Maine állam egyik két aktív pályája. USTA hivatalos besorolás: fél mérföldes pálya (805 m). Cím: 175 Blanchard Rd, Cumberland, ME 04021." },
        { name: "Dover Downs", slug: "dover-downs", city: "Dover, DE", region: "DE", lat: 39.1890, lng: -75.5306, founded: null, status: "active", length: 1006, direction: null, org: "Dover Downs Gaming & Entertainment", ownSite: "https://casinos.ballys.com/dover/harness-racing.htm", operatorSite: null, operatorName: null, note: "A Dover Downs Hotel & Casino komplexum része, a NASCAR-pályával (Dover Motor Speedway) közös területen. USTA hivatalos besorolás: öt-nyolcad mérföldes pálya (1006 m). Cím: 1131 N DuPont Hwy, Dover, DE 19901." },
        { name: "Harrah's Hoosier Park", slug: "harrah-s-hoosier-park", city: "Anderson, IN", region: "IN", lat: 40.0694, lng: -85.6408, founded: null, status: "active", length: 1408, direction: null, org: "Caesars Entertainment", ownSite: "https://www.caesars.com/harrahs-hoosier-park/racing", operatorSite: null, operatorName: null, note: "Indiana állam vezető ügetőpályája, kaszinóval. Hét-nyolcad mérföldes pálya, passzoló sávval (passing lane). USTA hivatalos besorolás: hét-nyolcad mérföldes pálya (1408 m). Cím: 4500 Dan Patch Circle, Anderson, IN 46013." },
        { name: "Harrah's Philadelphia", slug: "harrah-s-philadelphia", city: "Chester, PA", region: "PA", lat: 39.8505, lng: -75.3492, founded: null, status: "active", length: 1006, direction: null, org: "Caesars Entertainment", ownSite: "https://www.caesars.com/harrahs-philly/racing", operatorSite: null, operatorName: null, note: "Delaware folyó partján, Philadelphiához közel. USTA hivatalos besorolás: öt-nyolcad mérföldes pálya (1006 m). Cím: 777 Harrah's Blvd, Chester, PA 19013." },
        { name: "Harrington Raceway", slug: "harrington-raceway", city: "Harrington, DE", region: "DE", lat: 38.9120, lng: -75.5730, founded: null, status: "active", length: 805, direction: null, org: "Harrington Raceway & Casino", ownSite: "https://harringtonraceway.com/home/", operatorSite: null, operatorName: null, note: "Delaware állami vásárterület része. USTA hivatalos besorolás: fél mérföldes pálya (805 m). Cím: 18500 S DuPont Hwy, Harrington, DE 19952." },
        { name: "Hawthorne Race Course", slug: "hawthorne-race-course", city: "Cicero, IL", region: "IL", lat: 41.8286, lng: -87.7511, founded: 1891, status: "active", length: 1609, direction: null, org: "Hawthorne Race Course Inc.", ownSite: "http://www.hawthorneracecourse.com/", operatorSite: null, operatorName: null, note: "Chicago környékének történelmi pályája (1891 óta); mind galopp, mind ügető versenyeknek otthont ad. Egy mérföldes pálya; télen ügető-, egyébként galoppversenyek. USTA hivatalos besorolás: egy mérföldes pálya (1609 m). Cím: 3501 S Laramie, Stickney/Cicero, IL 60804." },
        { name: "Historic Track – Goshen", slug: "historic-track-goshen", city: "Goshen, NY", region: "NY", lat: 41.4024, lng: -74.3210, founded: 1838, status: "active", length: 805, direction: null, org: "Goshen Historic Track Inc.", ownSite: "http://www.goshenhistorictrack.com/", operatorSite: null, operatorName: null, note: "Amerika legrégebbi, folyamatosan használt ügetőpályája (1838 óta); a Harness Racing Museum & Hall of Fame otthona, évente csak pár versenynappal (jellemzően július 4. körül). USTA hivatalos besorolás: fél mérföldes pálya (805 m). Cím: Park Place, Goshen, NY 10924." },
        { name: "Hollywood Casino at The Meadows", slug: "hollywood-casino-at-the-meadows", city: "Washington, PA", region: "PA", lat: 40.2206, lng: -80.2020, founded: null, status: "active", length: 1006, direction: null, org: "Penn Entertainment", ownSite: "https://www.hollywoodmeadows.com/racing", operatorSite: null, operatorName: null, note: "Pittsburgh közelében; élő ügetőverseny a kaszinóval egybeépítve. USTA hivatalos besorolás: öt-nyolcad mérföldes pálya (1006 m). Cím: 210 Racetrack Rd, Washington, PA 15301." },
        { name: "Hollywood Gaming at Dayton Raceway", slug: "hollywood-gaming-at-dayton-raceway", city: "Dayton, OH", region: "OH", lat: 39.8168, lng: -84.1725, founded: null, status: "active", length: 1006, direction: null, org: "Penn Entertainment", ownSite: "https://www.hollywooddaytonraceway.com/racing", operatorSite: null, operatorName: null, note: "Ohio állam egyik újabb, kaszinó-integrált pályája. USTA hivatalos besorolás: öt-nyolcad mérföldes pálya (1006 m). Cím: 777 Hollywood Blvd, Dayton, OH 45414." },
        { name: "Bangor Raceway", slug: "bangor-raceway", city: "Bangor, ME", region: "ME", lat: 44.7907, lng: -68.7833, founded: null, status: "active", length: 805, direction: null, org: "Hollywood Casino Bangor", ownSite: "http://www.hollywoodcasinobangor.com/Racing", operatorSite: null, operatorName: null, note: "Maine állam másik aktív pályája. USTA hivatalos besorolás: fél mérföldes pálya (805 m). Cím: Main St, Bangor, ME 04401." },
        { name: "Little Brown Jug Race Track", slug: "little-brown-jug-race-track", city: "Delaware, OH", region: "OH", lat: 40.3165, lng: -83.0718, founded: null, status: "active", length: 805, direction: null, org: "Delaware County Fairgrounds", ownSite: "http://www.littlebrownjug.com", operatorSite: null, operatorName: null, note: "A híres Little Brown Jug (3 éves ügető csődörök egyik legrangosabb amerikai futama) hivatalos helyszíne, évi néhány versenynappal a megyei vásár idején. USTA hivatalos besorolás: fél mérföldes pálya (805 m). Cím: 236 Pennsylvania Ave, Delaware, OH 43015." },
        { name: "Meadowlands Racetrack", slug: "meadowlands-racetrack", city: "East Rutherford, NJ", region: "NJ", lat: 40.8200, lng: -74.0715, founded: 1976, status: "active", length: 1609, direction: null, org: "Meadowlands Racing & Entertainment", ownSite: "https://playmeadowlands.com/", operatorSite: null, operatorName: null, note: "Az amerikai ügetősport legrangosabb, \"mile\" (1609 m) méretű pályája; itt rendezik a Hambletonian-t, az amerikai ügetősport Kentucky Derbyjének megfelelő, legrangosabb futamát" },
        { name: "Miami Valley Raceway", slug: "miami-valley-raceway", city: "Lebanon, OH", region: "OH", lat: 39.4433, lng: -84.3201, founded: null, status: "active", length: 1006, direction: null, org: "Miami Valley Gaming", ownSite: "https://miamivalleygaming.com/racing/", operatorSite: null, operatorName: null, note: "Ohio állam egyik kaszinó-integrált pályája. USTA hivatalos besorolás: öt-nyolcad mérföldes pálya (1006 m). Cím: SR 63, Lebanon, OH 45036." },
        { name: "Mohegan Sun Pocono (Pocono Downs)", slug: "mohegan-sun-pocono-pocono-downs", city: "Wilkes-Barre, PA", region: "PA", lat: 41.2695, lng: -75.8222, founded: null, status: "active", length: 1006, direction: null, org: "Mohegan Gaming & Entertainment", ownSite: "http://www.poconodowns.com", operatorSite: null, operatorName: null, note: "Pennsylvania északkeleti részének vezető ügetőpályája. Öt-nyolcad mérföldes, megbocsátó oválpálya – a hátulról érkező lovaknak kedvez. USTA hivatalos besorolás: öt-nyolcad mérföldes pálya (1006 m). Cím: 1280 Hwy 315, Wilkes-Barre, PA 18702." },
        { name: "Monticello Raceway", slug: "monticello-raceway", city: "Monticello, NY", region: "NY", lat: 41.6688, lng: -74.7145, founded: null, status: "active", length: 805, direction: null, org: "Monticello Raceway Management", ownSite: "https://www.monticellocasinoandraceway.com/", operatorSite: null, operatorName: null, note: "A Catskills régió pályája; a látogatói vélemények szerint az utóbbi években leromlott állapotban van, jövője bizonytalan. USTA hivatalos besorolás: fél mérföldes pálya (805 m). Cím: 204 Route 17B, Monticello, NY 12701." },
        { name: "Northfield Park", slug: "northfield-park", city: "Northfield, OH", region: "OH", lat: 41.3485, lng: -81.5243, founded: 1957, status: "active", length: 805, direction: null, org: "MTR Gaming Group / Northfield Park Associates", ownSite: "http://www.northfieldpark.com", operatorSite: null, operatorName: null, note: "Cleveland közelében; egyike a legtöbb versenynapot rendező amerikai ügetőpályáknak (gyakorlatilag egész évben). Fél mérföldes bullring – itt a hajtók jellemzően korán támadnak, szemben a Yonkersben szokásos várakozó taktikával. USTA hivatalos besorolás: fél mérföldes pálya (805 m). Cím: 10777 Northfield Rd, Northfield, OH 44067." },
        { name: "Northville Downs (Barry Expo Center)", slug: "northville-downs-barry-expo-center", city: "Hastings, MI", region: "MI", lat: 42.6770, lng: -85.3953, founded: null, status: "active", length: 805, direction: null, org: "Northville Downs", ownSite: "http://www.northvilledowns.com/", operatorSite: null, operatorName: null, note: "A hagyományos detroiti Northville Downs pálya 2024-es bezárása után ideiglenesen a Barry Expo Centerben rendezik a versenyeket. USTA hivatalos besorolás: fél mérföldes pálya (805 m). Cím: 1350 M-37 Hwy, Hastings, MI 49058." },
        { name: "Oak Grove Racing, Gaming & Hotel", slug: "oak-grove-racing-gaming-hotel", city: "Oak Grove, KY", region: "KY", lat: 36.6586, lng: -87.4393, founded: null, status: "active", length: 1006, direction: null, org: "Kentucky Downs / Oak Grove", ownSite: "https://www.oakgrovegaming.com/racing", operatorSite: null, operatorName: null, note: "Kentucky-Tennessee határ menti, kaszinóval egybeépített pálya. USTA hivatalos besorolás: öt-nyolcad mérföldes pálya (1006 m). Cím: 777 Winners Way, Oak Grove, KY 42262." },
        { name: "Ocean Downs", slug: "ocean-downs", city: "Berlin, MD", region: "MD", lat: 38.3522, lng: -75.1633, founded: null, status: "active", length: 805, direction: null, org: "Ocean Downs Casino", ownSite: "https://www.oceandowns.com/racing/", operatorSite: null, operatorName: null, note: "Maryland tengerparti régiójának (Ocean City közelében) pályája; híres a szerdai \"$1 Wednesdays\" akciós versenynapjairól. USTA hivatalos besorolás: fél mérföldes pálya (805 m). Cím: 10218 Racetrack Rd, Berlin, MD 21811." },
        { name: "Plainridge Park", slug: "plainridge-park", city: "Plainville, MA", region: "MA", lat: 42.0322, lng: -71.3044, founded: null, status: "active", length: 1006, direction: null, org: "Penn Entertainment", ownSite: "http://www.plainridgeparkcasino.com/racing", operatorSite: null, operatorName: null, note: "Massachusetts állam egyetlen aktív ügetőpályája. USTA hivatalos besorolás: öt-nyolcad mérföldes pálya (1006 m). Cím: 301 Washington St, Plainville, MA 02762." },
        { name: "The Red Mile", slug: "the-red-mile", city: "Lexington, KY", region: "KY", lat: 38.0426, lng: -84.5198, founded: 1875, status: "active", length: 1609, direction: null, org: "Red Mile Gaming & Racing", ownSite: "http://www.redmileracing.com/", operatorSite: null, operatorName: null, note: "1875 óta működik; a világ egyik leggyorsabb, \"mile\" méretű pályája, számos ügető-világrekord született itt" },
        { name: "Rosecroft Raceway", slug: "rosecroft-raceway", city: "Fort Washington, MD", region: "MD", lat: 38.7969, lng: -76.9625, founded: 1949, status: "active", length: 1006, direction: null, org: "Rosecroft Raceway", ownSite: "http://www.rosecroft.com", operatorSite: null, operatorName: null, note: "Washington D.C. közelében; 1949 óta működő pálya. USTA hivatalos besorolás: öt-nyolcad mérföldes pálya (1006 m). Cím: 6336 Rosecroft Dr, Fort Washington, MD 20744." },
        { name: "Running Aces Casino, Hotel & Racetrack", slug: "running-aces-casino-hotel-racetrack", city: "Columbus, MN", region: "MN", lat: 45.2447, lng: -93.0339, founded: null, status: "active", length: 1006, direction: null, org: "Running Aces", ownSite: "https://runaces.com/racing/", operatorSite: null, operatorName: null, note: "Minnesota állam egyetlen aktív ügetőpályája; élő versenyek keddenként, csütörtökönként és vasárnaponként május-szeptember között. USTA hivatalos besorolás: öt-nyolcad mérföldes pálya (1006 m). Cím: 15201 Zurich St NE, Columbus, MN 55025." },
        { name: "Saratoga Harness Racing", slug: "saratoga-harness-racing", city: "Saratoga Springs, NY", region: "NY", lat: 43.0620, lng: -73.7742, founded: null, status: "active", length: 805, direction: null, org: "Saratoga Casino Hotel", ownSite: "https://saratogacasino.com/racing/", operatorSite: null, operatorName: null, note: "A híres Saratoga Springs galoppváros ügető-testvérpályája. USTA hivatalos besorolás: fél mérföldes pálya (805 m). Cím: 342 Jefferson St, Saratoga Springs, NY 12866." },
        { name: "Eldorado Gaming Scioto Downs", slug: "eldorado-gaming-scioto-downs", city: "Columbus, OH", region: "OH", lat: 39.8395, lng: -82.9974, founded: null, status: "active", length: 1006, direction: null, org: "Caesars Entertainment", ownSite: "https://www.caesars.com/scioto-downs/racing", operatorSite: null, operatorName: null, note: "Ohio állam fővárosának ügetőpályája. Öt-nyolcad mérföldes pálya, kiemelkedő minőségű futófelülettel és megdöntött kanyarokkal. USTA hivatalos besorolás: öt-nyolcad mérföldes pálya (1006 m). Cím: 6000 S High St, Columbus, OH 43207." },
        { name: "Shenandoah Downs", slug: "shenandoah-downs", city: "Woodstock, VA", region: "VA", lat: 38.8732, lng: -78.5230, founded: null, status: "active", length: 805, direction: null, org: "Shenandoah County Fairgrounds", ownSite: null, operatorSite: "https://www.ustrotting.com/track-information/", operatorName: "USTA – pályainformációk", note: "Virginia állam vidéki hangulatú, vásártéri pályája. USTA hivatalos besorolás: fél mérföldes pálya (805 m). Cím: 300 Fairground Rd, Woodstock, VA 22664. TÉVES RIASZTÁS-VÉDELEM (2026-08): a havi ellenőrzés 75,6 km eltérést jelez a Wikidata Q7494164 alapján – ez TÉVEDÉS, mert az a Q-azonosító a NYUGAT-VIRGINIAI, Charles Town melletti, 1976-ban bezárt AZONOS NEVŰ pályára vonatkozik. A miénk a virginiai Woodstockban lévő, 2016-ban indult, ma is aktív pálya (Shenandoah County Fairgrounds, 300 Fairground Rd, Woodstock, VA 22664). A mi koordinátánk HELYES, ne módosítsd." },
        { name: "Tioga Downs", slug: "tioga-downs", city: "Nichols, NY", region: "NY", lat: 42.0240, lng: -76.4131, founded: null, status: "active", length: 1006, direction: null, org: "Tioga Downs Casino Resort", ownSite: "https://tiogadowns.com/racing/", operatorSite: null, operatorName: null, note: "New York állam déli részének kaszinó-integrált pályája. USTA hivatalos besorolás: öt-nyolcad mérföldes pálya (1006 m). Cím: 2384 West River Rd, Nichols, NY 13812." },
        { name: "Vernon Downs", slug: "vernon-downs", city: "Vernon, NY", region: "NY", lat: 43.0668, lng: -75.5280, founded: 1953, status: "active", length: 1408, direction: null, org: "American Racing & Entertainment LLC (Jeff Gural)", ownSite: "https://vernondowns.com/racing/", operatorSite: null, operatorName: null, note: "ELLENŐRZVE (2026): AKTÍV. A 2026-os szezon nyitva (péntek-szombat 17:05, július-augusztusban csütörtök is); eredmények június végéig igazolva. 1953-ban nyílt; 2004-ben csődbe ment és bezárt, 2006-ban Jeff Gural vásárolta meg és újraindította. 2025-ben a 72. szezonját zárta. 7/8 mérföldes pályája New York állam legjobb versenyfelületének tartják. Kiemelt futamok: Zweig Memorial Trot, Empire Breeders Classic. MEGJEGYZÉS: a pálya visszatérően pénzügyi nehézségekkel küzd (2023-ban WARN-bejelentés 250 fő elbocsátásáról, adókedvezmény-vitával), de a bezárás nem valósult meg. USTA hivatalos besorolás: hét-nyolcad mérföldes pálya (1408 m). Cím: 4229 Stahlman Rd, Vernon, NY 13476." },
        { name: "Yonkers Raceway (Empire City)", slug: "yonkers-raceway-empire-city", city: "Yonkers, NY", region: "NY", lat: 40.9195, lng: -73.8650, founded: 1899, status: "active", length: 805, direction: null, org: "MGM Resorts / Empire City Casino", ownSite: "https://empirecitycasino.mgmresorts.com/en/racing.html", operatorSite: null, operatorName: null, note: "Amerika legrégebbi, folyamatosan üzemelő versenypályája (1899 óta) egyes források szerint; New York City közvetlen közelében. Fél mérföldes bullring-pálya – az 1899-ben alapított Empire City Race Track utódja. A szűk kanyarok miatt a rajthely és a hajtó szerepe kiemelten fontos. USTA hivatalos besorolás: fél mérföldes pálya (805 m). Cím: 810 Yonkers Ave, Yonkers, NY 10704." },
        { name: "Cal Expo", slug: "cal-expo", city: "Sacramento, CA", region: "CA", lat: 38.595337, lng: -121.43423, founded: null, status: "closed", length: null, direction: null, org: null, ownSite: null, operatorSite: null, operatorName: null, note: "HIBAJAVÍTÁS: korábban tévesen \"active\"-ként vettük fel egy elavult USTA-jegyzék alapján. VALÓJÁBAN: az ügetőverseny 2025. május 2-án véglegesen megszűnt itt – a Cal Expo Igazgatótanácsa felmondta a bérleti szerződést a Watch and Wager LLC üzemeltetővel (emelkedő üzemeltetési költségek, csökkenő lóállomány, az észak-kaliforniai élő versenyzés visszaszorulása miatt). Az utolsó versenynap után a helyszín California legrégebbi (54 éves) ügetőpályájaként zárt be; a terület továbbra is otthont ad a California State Fairnek és más rendezvényeknek. Az ügetőverseny Kaliforniában azóta a Big Fresno Fair helyszínére költözött. Forrás: Cal Expo hivatalos közlemény (2025.04.25.), CBS News, Harness Racing Update (2025.05.02.)" },
        { name: "Big Fresno Fair (Fresno Fairgrounds)", slug: "big-fresno-fair-fresno-fairgrounds", city: "Fresno, CA", region: "CA", lat: 36.7318, lng: -119.7486, founded: null, status: "active", length: 1609, direction: null, org: "Watch and Wager, LLC", ownSite: "https://www.fresnofair.com/", operatorSite: "https://www.harnessracing.com/", operatorName: "USTA", note: "Kalifornia jelenleg EGYETLEN engedélyezett ügetőhelyszíne – a Cal Expo (Sacramento) 2025. május 2-i bezárása után a California Horse Racing Board a Big Fresno Fairnek (Brian I. Tatarian Grandstand) ítélte oda a versenynapokat. A Watch and Wager LLC (ugyanaz az üzemeltető, mint korábban Cal Expo-nál) kétéves bérleti szerződést kötött; az első szezon 2026. november/december–2027. május között zajlik, hétvégi (szombat-vasárnap) versenynapokkal – ez az első ügetőverseny Fresnóban több mint 100 éve. Egy mérföldes pálya (galopp/negyedmérföldes lovasversenyekre épült, korábban nem rendeztek itt ügetőt). Koordináta forrása: Wikidata Q106512783 + Tripomatic (~0,2 km-en belül egyeznek). Pálya forrása: U.S. Trotting News (2025.11.19.), The Business Journal (2026.01.23.), SJV Sun (2026.01.23.)" },
        { name: "Indiana State Fairgrounds", slug: "indiana-state-fairgrounds", city: "Indianapolis, IN", region: "IN", lat: 39.8284106, lng: -86.1335306, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.harnessracing.com/", operatorName: "USTA", note: "Vásári pálya (fair track), szezonális működéssel. Koordináta forrása: Nominatim (postai cím) + Wikipédia (en) – Indiana State Fair. Pálya forrása: USTA hivatalos pályajegyzék (harnessracing.com/find-a-track), 2026-07" },
        { name: "Illinois State Fairgrounds", slug: "illinois-state-fairgrounds", city: "Springfield, IL", region: "IL", lat: 39.834495, lng: -89.6425469, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.harnessracing.com/", operatorName: "USTA", note: "Vásári pálya (fair track), szezonális működéssel. Koordináta forrása: Nominatim (postai cím) + Wikidata Q5999743. Pálya forrása: USTA hivatalos pályajegyzék (harnessracing.com/find-a-track), 2026-07" },
        { name: "Freehold Raceway", slug: "freehold-raceway", city: "Freehold, NJ", region: "NJ", lat: 40.2567711, lng: -74.2879992, founded: null, status: "closed", length: 805, direction: null, org: null, ownSite: null, operatorSite: null, operatorName: null, note: "BEZÁRT: az utolsó versenynap 2024. december 28-án volt, 170 év után. Az USA legrégebbi versenypályája volt (1854). A területre bevásárló- és lakóövezet készül. Koordináta forrása: Nominatim (postai cím) + Wikidata Q5500913 + OpenStreetMap (Nominatim) + Wikipédia (en) – Freehold Raceway + GeoNames (5098286). Pálya forrása: USTA hivatalos pályajegyzék (harnessracing.com/find-a-track), 2026-07 + sajtóbeszámolók (2024.12.)" }
    ],
    CAN: [
        { name: "Woodbine Mohawk Park", slug: "woodbine-mohawk-park", city: "Campbellville, ON", region: "ON", lat: 43.4966, lng: -80.0006, founded: null, status: "active", length: 1408, direction: null, org: "Woodbine Entertainment Group", ownSite: "https://woodbine.com/mohawk/", operatorSite: null, operatorName: null, note: "Kanada vezető ügetőpályája; itt rendezik a Canadian Trotting Classic-ot (1976 óta) és a Canadian Pacing Derby-t, valamint a Mohawk Million-t. Elements Casino Mohawk kaszinóval egybeépítve. USTA hivatalos besorolás: hét-nyolcad mérföldes pálya (1408 m)." },
        { name: "The Raceway at Western Fair District", slug: "the-raceway-at-western-fair-district", city: "London, ON", region: "ON", lat: 42.9900, lng: -81.2187, founded: null, status: "active", length: 805, direction: null, org: "Western Fair District", ownSite: "http://www.westernfairdistrict.com/gaming/raceway", operatorSite: null, operatorName: null, note: "Ontario délnyugati részének vezető ügetőpályája; a Camluck Classic helyszíne. USTA hivatalos besorolás: fél mérföldes pálya (805 m)." },
        { name: "Flamboro Downs", slug: "flamboro-downs", city: "Dundas (Hamilton), ON", region: "ON", lat: 43.3001, lng: -80.0258, founded: null, status: "active", length: 805, direction: null, org: "Great Canadian Entertainment", ownSite: "http://www.flamborodowns.com", operatorSite: null, operatorName: null, note: "Hamilton közelében, kaszinóval egybeépítve. USTA hivatalos besorolás: fél mérföldes pálya (805 m). KOORDINÁTA-JAVÍTÁS (2026-08): a korábbi 43.3101, -80.0769 érték 4,3 km-rel nyugatra mutatott. A helyes pozíció a 967 Highway 5 W, Dundas cím alapján 43.3001, -80.0258 – megerősítve Overpass/OSM + Nominatim + térképes helyadat egyezésével." },
        { name: "Georgian Downs", slug: "georgian-downs", city: "Innisfil, ON", region: "ON", lat: 44.2924, lng: -79.6871, founded: null, status: "active", length: 1006, direction: null, org: "Great Canadian Entertainment", ownSite: "http://www.georgiandowns.com/", operatorSite: null, operatorName: null, note: "Nyári szezonban keddi és vasárnapi versenynapokkal; a 400-as autópálya mellett. Öt-nyolcad mérföldes pálya (5/8 mile). Forrás: Standardbred Canada hivatalos pályakönyvtár, 2026-08" },
        { name: "Grand River Raceway", slug: "grand-river-raceway", city: "Elora, ON", region: "ON", lat: 43.6739, lng: -80.4317, founded: null, status: "active", length: 1006, direction: null, org: "Grand River Agricultural Society", ownSite: "https://grandriverraceway.com/", operatorSite: null, operatorName: null, note: "Modern, akadálymentes létesítmény kaszinóval; ingyenes belépéssel. Öt-nyolcad mérföldes pálya (5/8 mile). Forrás: Standardbred Canada hivatalos pályakönyvtár, 2026-08" },
        { name: "Hanover Raceway", slug: "hanover-raceway", city: "Hanover, ON", region: "ON", lat: 44.1458, lng: -81.0270, founded: null, status: "active", length: 805, direction: null, org: "Hanover Raceway", ownSite: "http://www.hanoverraceway.com/", operatorSite: null, operatorName: null, note: "Kisvárosi, családias hangulatú pálya kaszinóval és étteremmel. Fél mérföldes pálya (1/2 mile). Forrás: Standardbred Canada hivatalos pályakönyvtár, 2026-08" },
        { name: "Clinton Raceway", slug: "clinton-raceway", city: "Clinton, ON", region: "ON", lat: 43.6201, lng: -81.5366, founded: null, status: "active", length: 805, direction: null, org: "Clinton Raceway", ownSite: "http://www.clintonraceway.com", operatorSite: null, operatorName: null, note: "2026-ban itt rendezték a Nemzeti Hajtóbajnokságot (National Driving Championship); vasárnapi versenynapok, a pálya belsejében két baseball-pálya. Fél mérföldes pálya (1/2 mile). Forrás: Standardbred Canada hivatalos pályakönyvtár, 2026-08" },
        { name: "Dresden Raceway", slug: "dresden-raceway", city: "Dresden, ON", region: "ON", lat: 42.5818, lng: -82.1830, founded: null, status: "active", length: 805, direction: null, org: "Dresden Raceway", ownSite: "http://dresden-raceway.ca/", operatorSite: null, operatorName: null, note: "Kis, barátságos vidéki pálya vasárnapi versenynapokkal. Fél mérföldes pálya (1/2 mile). Forrás: Standardbred Canada hivatalos pályakönyvtár, 2026-08" },
        { name: "Kawartha Downs", slug: "kawartha-downs", city: "Cavan-Monaghan (Peterborough), ON", region: "ON", lat: 44.2080, lng: -78.3935, founded: null, status: "active", length: 1006, direction: null, org: "Kawartha Downs", ownSite: "https://www.kawarthadowns.com/events/harness-racing", operatorSite: null, operatorName: null, note: "Szombat esti versenynapok nyáron; egyéb rendezvényeknek (autókiállítás, tacskóverseny) is otthont ad. Öt-nyolcad mérföldes pálya (5/8 mile). Forrás: Standardbred Canada hivatalos pályakönyvtár, 2026-08" },
        { name: "Leamington Raceway", slug: "leamington-raceway", city: "Leamington, ON", region: "ON", lat: 42.0598, lng: -82.5961, founded: null, status: "active", length: 805, direction: null, org: "Leamington Raceway", ownSite: "http://www.lakeshorehorseraceway.com/", operatorSite: null, operatorName: null, note: "Vasárnapi, családbarát versenynapok. USTA hivatalos besorolás: fél mérföldes pálya (805 m)." },
        { name: "Hiawatha Horse Park", slug: "hiawatha-horse-park", city: "Sarnia, ON", region: "ON", lat: 42.9874, lng: -82.3272, founded: null, status: "active", length: 1006, direction: null, org: "Hiawatha Horse Park", ownSite: "http://hiawathahorsepark.ca/", operatorSite: null, operatorName: null, note: "Heti egy versenynap; golf-driving range is működik a területen. USTA hivatalos besorolás: öt-nyolcad mérföldes pálya (1006 m)." },
        { name: "Rideau Carleton Raceway", slug: "rideau-carleton-raceway", city: "Ottawa, ON", region: "ON", lat: 45.2951, lng: -75.6058, founded: 1962, status: "closed", length: 1006, direction: null, org: "Hard Rock International (51%) / Rideau Carleton Raceway Holdings (49%)", ownSite: "http://www.rcr.net/", operatorSite: null, operatorName: null, note: "1962. szeptember 1-jén nyílt, 5500 fős kapacitással; a Frank Ryan Memorial Trot és a Des Smith Classic Pace otthona volt. STÁTUSZ: 2026 márciusában véglegesen bezárt – a helyszín ma Hard Rock Hotel & Casino Ottawa néven működik tovább, lóverseny nélkül. USTA hivatalos besorolás: öt-nyolcad mérföldes pálya (1006 m)." },
        { name: "Hippodrome 3R", slug: "hippodrome-3r", city: "Trois-Rivières, QC", region: "QC", lat: 46.3453, lng: -72.5595, founded: null, status: "active", length: null, direction: null, org: "Hippodrome 3R", ownSite: "https://hippodrome3r.ca/", operatorSite: null, operatorName: null, note: "Québec tartomány EGYETLEN megmaradt versenypályája, egyben a legrégebbi is; a Coupe de l'Avenir helyszíne. A montreali, gatineau-i és québec-városi hippodromok mind bezártak" },
        { name: "Century Downs Racetrack and Casino", slug: "century-downs-racetrack-and-casino", city: "Rocky View County (Calgary), AB", region: "AB", lat: 51.2014, lng: -113.9806, founded: null, status: "active", length: 1106, direction: null, org: "Century Casinos", ownSite: "https://www.cnty.com/centurydowns", operatorSite: null, operatorName: null, note: "Calgary közelében; Alberta tartomány egyik vezető pályája. 11/16 mérföldes pálya (ritka méret). Forrás: Standardbred Canada hivatalos pályakönyvtár, 2026-08" },
        { name: "Century Mile Racetrack and Casino", slug: "century-mile-racetrack-and-casino", city: "Edmonton International Airport, AB", region: "AB", lat: 53.3146, lng: -113.5601, founded: null, status: "active", length: 1609, direction: null, org: "Century Casinos", ownSite: "https://www.cnty.com/centurymile", operatorSite: null, operatorName: null, note: "Egy mérföldes pálya az edmontoni repülőtér mellett; a korábbi Northlands Park utódja" },
        { name: "The Track on 2", slug: "the-track-on-2", city: "Lacombe County, AB", region: "AB", lat: 52.4522, lng: -113.7929, founded: null, status: "active", length: 1609, direction: null, org: "Alberta Standardbred Horse Association (ASHA)", ownSite: "https://www.thetrackon2.com", operatorSite: null, operatorName: null, note: "Egy mérföldes közép-alberta-i pálya; tavaszi és nyári versenyszezonnal" },
        { name: "Fraser Downs (Elements Casino Surrey)", slug: "fraser-downs-elements-casino-surrey", city: "Surrey, BC", region: "BC", lat: 49.1123, lng: -122.7293, founded: 1976, status: "closed", length: null, direction: null, org: "Great Canadian Entertainment", ownSite: null, operatorSite: "https://standardbredcanada.ca/content/links-racetracks.html", operatorName: "Standardbred Canada – pályalinkek", note: "British Columbia egyetlen ügetőpályája volt, 1976 óta. STÁTUSZ: 2025. augusztus 15-én a Great Canadian Entertainment azonnali hatállyal bezárta a pályát, az istállókat és a háttérlétesítményt; a versenypálya burkolatát felszedték. Az Elements Casino Surrey és a lelátó továbbra is nyitva. A terület a Cloverdale Fairgrounds átépítési tervének része. Forrás: Standardbred Canada, CBC News (2025.08.)" },
        { name: "Marquis Downs", slug: "marquis-downs", city: "Saskatoon, SK", region: "SK", lat: 52.0941, lng: -106.6779, founded: null, status: "closed", length: null, direction: null, org: "Prairieland Park", ownSite: null, operatorSite: "https://standardbredcanada.ca/content/links-racetracks.html", operatorName: "Standardbred Canada – pályalinkek", note: "STÁTUSZ: 2021 óta nincs lóverseny a helyszínen – a területet átalakították, ma a Saskatoon-i labdarúgó-stadion (Nutrien Park) áll rajta. A Standardbred Canada nyilvántartásában még szerepel történeti rekordok miatt" },
        { name: "Yorkton Exhibition", slug: "yorkton-exhibition", city: "Yorkton, SK", region: "SK", lat: 51.2109, lng: -102.4902, founded: null, status: "active", length: null, direction: null, org: "Yorkton Exhibition Association", ownSite: null, operatorSite: "https://standardbredcanada.ca/content/links-racetracks.html", operatorName: "Standardbred Canada – pályalinkek", note: "Vásártéri pálya; chuckwagon- és szekérversenyek is zajlanak itt" },
        { name: "The Loop", slug: "the-loop", city: "Winnipeg, MB", region: "MB", lat: 49.889, lng: -97.3326, founded: 2023, status: "active", length: 805, direction: null, org: "Manitoba Standardbred", ownSite: null, operatorSite: "https://standardbredcanada.ca/content/links-racetracks.html", operatorName: "Standardbred Canada – pályalinkek", note: "Manitoba tartomány egyetlen ügetőpályája; 2023-ban nyílt a winnipegi Red River Exhibition Park (3977 Portage Ave) területén. Fél mérföldes pálya a Standardbred Canada besorolása szerint. Koordináta forrása: Wikipédia (en) – Red River Exhibition (49.8861, -97.3272) + OpenStreetMap (Nominatim) (49.8919, -97.3379) – a két forrás ~1 km-en belül egyezik, a park mérete (480 acre) miatt elfogadható eltérés. Pálya forrása: Standardbred Canada pályalista, 2026-08 (postai cím: 3977 Portage Ave, Winnipeg, MB R3K 2E8)" },
        { name: "Red Shores Racetrack & Casino", slug: "red-shores-racetrack-casino", city: "Charlottetown, PE", region: "PE", lat: 46.2466, lng: -63.1169, founded: null, status: "active", length: 805, direction: null, org: "Red Shores", ownSite: "http://www.redshores.ca", operatorSite: null, operatorName: null, note: "Prince Edward Island fő pályája; a P.E.I. Free-For-All Series és a Gold Cup & Saucer otthona. Fél mérföldes pálya (1/2 mile), hivatalos neve a szövetségi listában \"Charlottetown Driving Park\". Forrás: Standardbred Canada hivatalos pályakönyvtár, 2026-08" },
        { name: "Red Shores Summerside Raceway", slug: "red-shores-summerside-raceway", city: "Summerside, PE", region: "PE", lat: 46.3998, lng: -63.7996, founded: null, status: "active", length: 805, direction: null, org: "Red Shores", ownSite: "http://www.redshores.ca", operatorSite: null, operatorName: null, note: "A Red Shores hálózat második pályája PEI-n, sportkomplexummal egybeépítve. Fél mérföldes pálya (1/2 mile), hivatalos neve a szövetségi listában \"Summerside Raceway\". Forrás: Standardbred Canada hivatalos pályakönyvtár, 2026-08" },
        { name: "Truro Raceway", slug: "truro-raceway", city: "Truro, NS", region: "NS", lat: 45.3764, lng: -63.2700, founded: null, status: "active", length: 805, direction: null, org: "Truro Raceway", ownSite: "http://www.truroraceway.ca/", operatorSite: null, operatorName: null, note: "Nova Scotia vezető ügetőpályája; a lelátót és az éttermet nemrég teljesen felújították. Fél mérföldes pálya (1/2 mile). Forrás: Standardbred Canada hivatalos pályakönyvtár, 2026-08" },
        { name: "Inverness Raceway", slug: "inverness-raceway", city: "Inverness, NS", region: "NS", lat: 46.2271, lng: -61.3007, founded: null, status: "active", length: 805, direction: null, org: "Inverness Raceway", ownSite: null, operatorSite: "https://standardbredcanada.ca/content/links-racetracks.html", operatorName: "Standardbred Canada – pályalinkek", note: "Cape Breton-szigeti pálya; az Atlantic Sires Stakes (ATSS) egyik állomása, kiváló közösségi hangulattal. USTA hivatalos besorolás: fél mérföldes pálya (805 m)." },
        { name: "Northside Downs", slug: "northside-downs", city: "North Sydney, NS", region: "NS", lat: 46.2094, lng: -60.2692, founded: null, status: "active", length: 805, direction: null, org: "Northside Downs", ownSite: null, operatorSite: "https://standardbredcanada.ca/content/links-racetracks.html", operatorName: "Standardbred Canada – pályalinkek", note: "Cape Breton-sziget másik pályája; ingyenes belépéssel, családias hangulattal. Fél mérföldes pálya (1/2 mile). Forrás: Standardbred Canada hivatalos pályakönyvtár, 2026-08" },
        { name: "Exhibition Park Raceway", slug: "exhibition-park-raceway", city: "Saint John, NB", region: "NB", lat: 45.3134, lng: -66.0203, founded: null, status: "active", length: null, direction: null, org: "Exhibition Park", ownSite: null, operatorSite: "https://standardbredcanada.ca/content/links-racetracks.html", operatorName: "Standardbred Canada – pályalinkek", note: "New Brunswick tartomány pályája a Saint John-i vásártéren" },
        { name: "Fredericton Raceway", slug: "fredericton-raceway", city: "Fredericton, NB", region: "NB", lat: 45.9608, lng: -66.6564, founded: null, status: "active", length: null, direction: null, org: "Fredericton Raceway", ownSite: null, operatorSite: "https://standardbredcanada.ca/content/links-racetracks.html", operatorName: "Standardbred Canada – pályalinkek", note: "New Brunswick tartomány fővárosának ügetőpályája" },
        { name: "Woodstock Connell Park", slug: "woodstock-connell-park", city: "Woodstock, NB", region: "NB", lat: 46.1620, lng: -67.588, founded: null, status: "active", length: 805, direction: null, org: null, ownSite: null, operatorSite: "https://standardbredcanada.ca/content/links-racetracks.html", operatorName: "Standardbred Canada – pályalinkek", note: "FIGYELEM: két Woodstock nevű pálya létezik – az ontariói inaktív/régi, ez az új-brunswicki aktív. Fél mérföldes pálya a Standardbred Canada besorolása szerint. Koordináta forrása: Wikipédia (en) – Woodstock High School, 144 Connell Park Rd (46.16267, -67.58731) + woodstocknb.ca – kemping, 120 Connell Park Rd (46.16141, -67.58864); a két cím körbeveszi a pálya 141-es címét, ~0,17 km-en belül egyeznek. Pálya forrása: Standardbred Canada pályalista, 2026-08 (postai cím: 141 Connell Park Road, Woodstock, NB, E7M 1M5)" },
        { name: "St. John's Racing & Entertainment Centre", slug: "st-john-s-racing-entertainment-centre", city: "Goulds (St. John's), NL", region: "NL", lat: 47.4460, lng: -52.7643, founded: null, status: "closed", length: null, direction: null, org: "korábbi üzemeltető: St. John's Racing & Entertainment Centre Inc.", ownSite: null, operatorSite: "https://standardbredcanada.ca/content/links-racetracks.html", operatorName: "Standardbred Canada – pályalinkek", note: "ELLENŐRZVE (több forrás): VÉGLEGESEN BEZÁRT. Newfoundland tartomány egyetlen versenypályája volt. Kronológia: 2015. december 31-én bejelentették, hogy 2016-ban nem lesz sem élő, sem szimulcast fogadás; 2016 júniusában a lótulajdonosok kilakoltatási értesítést kaptak, az istállókat júliusban bezárták. Brett Whelan igazgató a CBC-nek: \"Az ökonómia a fő ok... be kellett zárnunk, mert a lóállomány az előző év egyötödére csökkent.\" A tartományi képviselőház ezt követően hatályon kívül helyezte az Atlantic Provinces Harness Racing Commission Actet. MEGJEGYZÉS: a Standardbred Canada pályalistájában elavult bejegyzésként még szerepel" }
    ],
    AUS: [
        { name: "Melton Entertainment Park (Tabcorp Park)", slug: "melton-entertainment-park-tabcorp-park", city: "Melton, VIC", region: "VIC", lat: -37.6969, lng: 144.5989, founded: 2009, status: "active", length: 1000, direction: null, org: "Harness Racing Victoria", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Victoria állam fő pályája, 2009. július 5-én nyílt meg, felváltva a korábbi Moonee Valley-i pályát. Éttermekkel, szállodával és konferenciaközponttal; az A G Hunter Cup és a Victoria Cup otthona" },
        { name: "Club Menangle (Menangle Park Paceway)", slug: "club-menangle-menangle-park-paceway", city: "Menangle Park, NSW", region: "NSW", lat: -34.1032, lng: 150.7446, founded: 1914, status: "active", length: 1400, direction: null, org: "NSW Harness Racing Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", trotSince: 1953, note: "Új-Dél-Wales fő pályája; a Miracle Mile Pace otthona, Ausztrália egyik legrangosabb ügetőfutamáé. Az Australian Pacing Gold (APG) három tulajdonos klubjának egyike. 1914-ben GALOPP-pályaként nyílt; a NSW Harness Racing Club 1952-ben vásárolta meg, ügetőpályaként 1953. szeptember 26-án avatták. 2008-ban Tabcorp Parkként újranyitott, 2010-ben vette át a Harold Parktól Sydney fő ügetőpályájának szerepét." },
        { name: "Albion Park Raceway", slug: "albion-park-raceway", city: "Brisbane, QLD", region: "QLD", lat: -27.4393, lng: 153.0465, founded: null, status: "active", length: null, direction: null, org: "Albion Park Harness Racing Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Queensland fő pályája; a Blacks A Fake Queensland Championship helyszíne. Az APG három tulajdonos klubjának egyike" },
        { name: "Gloucester Park", slug: "gloucester-park", city: "East Perth, WA", region: "WA", lat: -31.9580, lng: 115.8811, founded: null, status: "active", length: null, direction: null, org: "Gloucester Park Harness Racing", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Nyugat-Ausztrália fő pályája, Perth belvárosában; a West Australian Derby otthona. Keddi és pénteki versenynapokon ingyenes belépés, családbarát hangulattal" },
        { name: "Globe Derby Park", slug: "globe-derby-park", city: "Adelaide, SA", region: "SA", lat: -34.7964, lng: 138.5914, founded: null, status: "active", length: null, direction: null, org: "South Australian Trotting Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Dél-Ausztrália fő ügetőpályája" },
        { name: "Redcliffe Paceway", slug: "redcliffe-paceway", city: "Redcliffe, QLD", region: "QLD", lat: -27.2311, lng: 153.1072, founded: null, status: "active", length: null, direction: null, org: "Redcliffe Harness Racing Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Queensland második legfontosabb pályája; nemrég felújítva" },
        { name: "Bathurst Paceway", slug: "bathurst-paceway", city: "Bathurst, NSW", region: "NSW", lat: -33.4514, lng: 149.5747, founded: null, status: "active", length: 1065, finalStraight: 186, turnRadius: 109, openStretch: true, direction: null, org: "Bathurst Harness Racing Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Az éves Gold Crown sorozat otthona; ingyenes belépés a versenynapokon Műszaki adatok a Harness Racing Australia hivatalos pálya-adatlapjáról (harness.org.au), 2026-08: pályahossz 1065 m, célegyenes 186 m, kanyarsugár 109 m, előzősáv (sprint lane) van." },
        { name: "Newcastle Paceway", slug: "newcastle-paceway", city: "New Lambton, NSW", region: "NSW", lat: -32.9189, lng: 151.7278, founded: null, status: "active", length: null, direction: null, org: "Newcastle Harness Racing Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Új-Dél-Wales egyik regionális központja" },
        { name: "Bendigo Harness Racing Club", slug: "bendigo-harness-racing-club", city: "Junortoun, VIC", region: "VIC", lat: -36.7691, lng: 144.3345, founded: null, status: "active", length: 1000, finalStraight: 185, turnRadius: 110, openStretch: true, direction: null, org: "Bendigo Harness Racing Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Victoria egyik vezető vidéki pályája; a Red Hot Summer koncertsorozat helyszíne is Műszaki adatok a Harness Racing Australia hivatalos pálya-adatlapjáról (harness.org.au), 2026-08: pályahossz 1000 m, célegyenes 185 m, kanyarsugár 110 m, előzősáv (sprint lane) van." },
        { name: "Ballarat & District Trotting Club", slug: "ballarat-district-trotting-club", city: "Redan (Ballarat), VIC", region: "VIC", lat: -37.5765, lng: 143.8305, founded: 1861, status: "active", length: 1000, finalStraight: 248, turnRadius: 80, openStretch: false, direction: null, org: "Ballarat & District Trotting Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "A Ballarat and Creswick Trotting Club 1861-ben alakult – ez volt AUSZTRÁLIA ELSŐ, kifejezetten ügetősport népszerűsítésére létrehozott klubja Műszaki adatok a Harness Racing Australia hivatalos pálya-adatlapjáról (harness.org.au), 2026-08: pályahossz 1000 m, célegyenes 248 m, kanyarsugár 80 m, előzősáv (sprint lane) nincs." },
        { name: "Shepparton Harness Racing Club", slug: "shepparton-harness-racing-club", city: "Kialla, VIC", region: "VIC", lat: -36.4475, lng: 145.3892, founded: null, status: "active", length: null, direction: null, org: "Shepparton Harness Racing Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Victoria északi részének regionális pályája" },
        { name: "Cranbourne Harness Racing Club", slug: "cranbourne-harness-racing-club", city: "Cranbourne, VIC", region: "VIC", lat: -38.1180, lng: 145.2801, founded: null, status: "active", length: 946, finalStraight: 221, turnRadius: 80, openStretch: true, direction: null, org: "Cranbourne Harness Racing Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Melbourne délkeleti agglomerációjának pályája Műszaki adatok a Harness Racing Australia hivatalos pálya-adatlapjáról (harness.org.au), 2026-08: pályahossz 946 m, célegyenes 221 m, kanyarsugár 80 m, előzősáv (sprint lane) van." },
        { name: "Pinjarra Paceway", slug: "pinjarra-paceway", city: "Pinjarra, WA", region: "WA", lat: -32.6438, lng: 115.8664, founded: null, status: "active", length: null, direction: null, org: "Pinjarra Harness Racing Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Nyugat-Ausztrália egyik legnépszerűbb vidéki pályája, hétfői versenynapokkal" },
        { name: "Bunbury Trotting Club", slug: "bunbury-trotting-club", city: "Carey Park (Bunbury), WA", region: "WA", lat: -33.3557, lng: 115.6551, founded: null, status: "active", length: 960, finalStraight: 205, turnRadius: 87, openStretch: true, direction: null, org: "Bunbury Trotting Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Donaldson Park; Nyugat-Ausztrália délnyugati régiójának pályája Műszaki adatok a Harness Racing Australia hivatalos pálya-adatlapjáról (harness.org.au), 2026-08: pályahossz 960 m, célegyenes 205 m, kanyarsugár 87 m, előzősáv (sprint lane) van." },
        { name: "Northam Race Club", slug: "northam-race-club", city: "Northam, WA", region: "WA", lat: -31.6400, lng: 116.6999, founded: null, status: "active", length: null, direction: null, org: "Northam Race Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "A Northam Cup otthona; Perth-től kb. 1 óra 20 percre" },
        { name: "Mowbray Racecourse", slug: "mowbray-racecourse", city: "Launceston, TAS", region: "TAS", lat: -41.4039, lng: 147.1373, founded: null, status: "active", length: null, direction: null, org: "Tasracing", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Tasmania északi részének fő versenypályája" },
        { name: "Elwick Racecourse", slug: "elwick-racecourse", city: "Glenorchy (Hobart), TAS", region: "TAS", lat: -42.8254, lng: 147.2892, founded: null, status: "active", length: null, direction: null, org: "Tasracing", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Tasmania déli részének fő pályája, a fővárosban" },
        { name: "Devonport Racing Club", slug: "devonport-racing-club", city: "Spreyton, TAS", region: "TAS", lat: -41.2120, lng: 146.3388, founded: null, status: "active", length: 735, finalStraight: 110, turnRadius: 83, openStretch: false, direction: null, org: "Tasracing", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Minden időjárásban használható pálya; a Devonport Cup otthona Műszaki adatok a Harness Racing Australia hivatalos pálya-adatlapjáról (harness.org.au), 2026-08: pályahossz 735 m, célegyenes 110 m, kanyarsugár 83 m, előzősáv (sprint lane) nincs." },
        { name: "Cowra", slug: "cowra", city: "Cowra, NSW", region: "NSW", lat: -33.83388889, lng: 148.7, founded: null, status: "active", length: 813, finalStraight: 150, openStretch: false, direction: null, org: null, ownSite: null, operatorSite: "https://harness.org.au/", operatorName: "Harness Racing Australia", note: "New South Wales állam. A HRA adatlapján elérhető: Circumference (pályahossz), Straights (célegyenes), Radius On Turns (kanyarsugár), Sprint Lane (előzősáv), pontos cím és kapcsolat. Koordináta forrása: OpenStreetMap (Nominatim) + Wikipédia (en) – Cowra. Pálya forrása: Harness Racing Australia hivatalos pályajegyzék (harness.org.au), 2026-08 Műszaki adatok a Harness Racing Australia hivatalos pálya-adatlapjáról (harness.org.au), 2026-08: pályahossz 813 m, célegyenes 150 m, előzősáv (sprint lane) nincs." },
        { name: "Gawler", slug: "gawler", city: "Gawler, SA", region: "SA", lat: -34.59805556, lng: 138.745, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://harness.org.au/", operatorName: "Harness Racing Australia", note: "South Australia állam. A HRA adatlapján elérhető: Circumference (pályahossz), Straights (célegyenes), Radius On Turns (kanyarsugár), Sprint Lane (előzősáv), pontos cím és kapcsolat. Koordináta forrása: OpenStreetMap (Nominatim) + Wikipédia (en) – Gawler. Pálya forrása: Harness Racing Australia hivatalos pályajegyzék (harness.org.au), 2026-08" },
        { name: "Kapunda", slug: "kapunda", city: "Kapunda, SA", region: "SA", lat: -34.33888889, lng: 138.91666667, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://harness.org.au/", operatorName: "Harness Racing Australia", note: "South Australia állam. A HRA adatlapján elérhető: Circumference (pályahossz), Straights (célegyenes), Radius On Turns (kanyarsugár), Sprint Lane (előzősáv), pontos cím és kapcsolat. Koordináta forrása: OpenStreetMap (Nominatim) + Wikipédia (en) – Kapunda. Pálya forrása: Harness Racing Australia hivatalos pályajegyzék (harness.org.au), 2026-08" },
        { name: "Port Pirie", slug: "port-pirie", city: "Port Pirie, SA", region: "SA", lat: -33.18583333, lng: 138.01694444, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://harness.org.au/", operatorName: "Harness Racing Australia", note: "South Australia állam. A HRA adatlapján elérhető: Circumference (pályahossz), Straights (célegyenes), Radius On Turns (kanyarsugár), Sprint Lane (előzősáv), pontos cím és kapcsolat. Koordináta forrása: OpenStreetMap (Nominatim) + Wikipédia (en) – Port Pirie. Pálya forrása: Harness Racing Australia hivatalos pályajegyzék (harness.org.au), 2026-08" },
        { name: "Bacchus Marsh", slug: "bacchus-marsh", city: "Bacchus Marsh, VIC", region: "VIC", lat: -37.6994, lng: 144.4031, founded: null, status: "active", length: 802, finalStraight: 200, openStretch: false, direction: null, org: null, ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Cím: Bacchus Marsh-Balliang Rd, VIC 3340. Koordináta forrása: OpenStreetMap/Mapcarta ('Bacchus Marsh Racecourse and Recreation Reserve', way 974478305) + Mypacer POI-adatbázis. Pálya és műszaki adatok forrása: Harness Racing Australia hivatalos pálya-adatlap (harness.org.au), 2026-08." },
        { name: "Bankstown Paceway", slug: "bankstown-paceway", city: "Bankstown, NSW", region: "NSW", lat: -33.9327, lng: 151.0083, founded: null, status: "active", length: 805, finalStraight: 187, turnRadius: 68, openStretch: false, direction: null, org: null, ownSite: "https://www.bankstownpaceway.com.au", operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Cím: 178 Eldridge Road, Bankstown NSW 2200. Koordináta forrása: Casino City geo-tag + Bing helyi POI-adatbázis (~220 m-en belül). Pálya és műszaki adatok forrása: Harness Racing Australia hivatalos pálya-adatlap (harness.org.au), 2026-08." },
        { name: "Benalla", slug: "benalla", city: "Benalla, VIC", region: "VIC", lat: -36.526, lng: 145.9841, founded: null, status: "active", length: 1084, finalStraight: 316, turnRadius: 72, openStretch: false, direction: null, org: null, ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Cím: Midland Highway, Benalla VIC 3672. Koordináta forrása: Mypacer/OSM-objektum (5809 Midland Hwy) + Facebook-üzletlisting (5835 Midland Hwy, ugyanaz az útszakasz). Pálya és műszaki adatok forrása: Harness Racing Australia hivatalos pálya-adatlap (harness.org.au), 2026-08." },
        { name: "Birchip", slug: "birchip", city: "Birchip, VIC", region: "VIC", lat: -35.9696, lng: 142.928, founded: null, status: "active", length: 805, openStretch: false, direction: null, org: null, ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Cím: Berriwillock Road, Birchip VIC 3483 (postai cím: 109 Cummings Ave). Koordináta forrása: Google Places ('Birchip Harness Track') - telefonszám (+61 3 5492 2616) pontosan egyezik a hivatalos adatlappal. A célegyenes és a kanyarsugár a HRA adatlapján N/A. Pálya és műszaki adatok forrása: Harness Racing Australia hivatalos pálya-adatlap (harness.org.au), 2026-08." },
        { name: "Blayney", slug: "blayney", city: "Blayney, NSW", region: "NSW", lat: -33.5185, lng: 149.2605, founded: null, status: "active", length: 763, finalStraight: 124, turnRadius: 74, openStretch: false, direction: null, org: null, ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Cím: 27-29 Adelaide Lane, Blayney NSW 2799. PIC-szám (NE045881) alapján azonosítva. KOORDINÁTA MEGERŐSÍTENDŐ: csak 'Blayney Showground' Google-találat érhető el, a cím/telefon nem igazolható vissza rá - térképen ellenőrizendő. Pálya és műszaki adatok forrása: Harness Racing Australia hivatalos pálya-adatlap (harness.org.au), 2026-08." },
        { name: "Boort", slug: "boort", city: "Boort, VIC", region: "VIC", lat: -36.1094, lng: 143.7292, founded: null, status: "active", length: 712, finalStraight: 151, turnRadius: 64, openStretch: true, direction: null, org: "Boort Trotting Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Cím: 35 Malone Street, Boort VIC 3537. Koordináta forrása: Google Places ('Boort Trotting Club', pontos cím-egyezés) + Mypacer/OSM ('Boort Showgrounds', ~150 m-en belül). Pálya és műszaki adatok forrása: Harness Racing Australia hivatalos pálya-adatlap (harness.org.au), 2026-08." },
        { name: "Bridgetown", slug: "bridgetown", city: "Bridgetown, WA", region: "WA", lat: -33.9384, lng: 116.1577, founded: null, status: "active", length: 814, finalStraight: 164, turnRadius: 77, openStretch: false, direction: null, org: "Bridgetown Harness Racing Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Cím: Bridgetown Greater Sports Ground, Les Woodhead Ave, Bridgetown WA 6255. Koordináta forrása: Google Places ('Bridgetown Sports Ground'). FIGYELEM: a Casino City geo-tagje ehhez a pályához gyanúsan azonos hosszúsági fokot adott, mint a Collie-pályához (mindkettő kb. 116.1587 fok), pedig a két város kb. 65 km-re van - ezt a forrást ezért NEM használtuk. Pálya és műszaki adatok forrása: Harness Racing Australia hivatalos pálya-adatlap (harness.org.au), 2026-08." },
        { name: "Broken Hill", slug: "broken-hill", city: "Broken Hill, NSW", region: "NSW", lat: -31.9474, lng: 141.461, founded: null, status: "active", length: 602, finalStraight: 85, turnRadius: 51, openStretch: false, direction: null, org: null, ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Cím: Corner Williams & Warnock Streets, Broken Hill NSW 2881 (Rocky Baker Memorial Oval Paceway). PIC-szám: NE050349. Koordináta forrása: Google Places ('Harness Racing In The Hill', pontos cím-egyezés). Pálya és műszaki adatok forrása: Harness Racing Australia hivatalos pálya-adatlap (harness.org.au), 2026-08." },
        { name: "Bulli", slug: "bulli", city: "Bulli, NSW", region: "NSW", lat: -34.3303, lng: 150.9111, founded: null, status: "active", length: 738, finalStraight: 145, turnRadius: 71, openStretch: false, direction: null, org: null, ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Cím: PO Box 104, Bulli NSW 2516. KOORDINÁTA MEGERŐSÍTENDŐ: nincs önálló Google-találat 'Bulli Trotting Club'-ra - ez a szomszédos 'Bulli Greyhounds' (Grevillea Park Rd) koordinátája, közös sporttelepet feltételezve (a telefon-előhívó egyezik: 4267). Térképen ellenőrizendő. Pálya és műszaki adatok forrása: Harness Racing Australia hivatalos pálya-adatlap (harness.org.au), 2026-08." },
        { name: "Burnie", slug: "burnie", city: "Wivenhoe, TAS", region: "TAS", lat: -41.0679, lng: 145.9314, founded: null, status: "active", length: 607, finalStraight: 95, openStretch: false, direction: null, org: null, ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Cím: 1-7 Pearl Street, Wivenhoe TAS 7320 (Wivenhoe Showground). Koordináta forrása: Google Places ('Burnie Paceway - Harness Racing', pontos cím-egyezés) + második találat ('Burnie Harness Racing Club', ~180 m-en belül). A kanyarsugár a HRA adatlapján N/A. Pálya és műszaki adatok forrása: Harness Racing Australia hivatalos pálya-adatlap (harness.org.au), 2026-08." },
        { name: "Byford", slug: "byford", city: "Byford, WA", region: "WA", lat: -32.2155, lng: 115.9949, founded: null, status: "active", length: 816, finalStraight: 208, openStretch: false, direction: null, org: "Byford Harness Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "EDZŐ- ÉS PRÓBAPÁLYA, nem hagyományos versenypálya: a hivatalos adatlap szerint 'TRIALS 50 SUNDAYS', a létesítmény elsősorban tréning célú (jog track, úszómedence lovaknak, sand track, 100 boksz). Cím: Lot 37 Binshaw Avenue, Byford WA 6122. Koordináta forrása: Google Places ('Byford Trotters Training Complex'). Pálya és műszaki adatok forrása: Harness Racing Australia hivatalos pálya-adatlap (harness.org.au), 2026-08." },
        { name: "Canberra (EPIC)", slug: "canberra-epic", city: "Mitchell, ACT", region: "ACT", lat: -35.2306, lng: 149.1462, founded: null, status: "active", length: 812, finalStraight: 173, turnRadius: 74, openStretch: false, direction: null, org: null, ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Cím: Exhibition Park in Canberra (EPIC), Flemington Road, Mitchell ACT 2602. PIC-szám: NG750154. Koordináta forrása: Google Places ('Harness Racing ACT', Plover Grandstand) - telefonszám (+61 2 6241 3911) pontosan egyezik a hivatalos adatlappal. Pálya és műszaki adatok forrása: Harness Racing Australia hivatalos pálya-adatlap (harness.org.au), 2026-08." },
        { name: "Carrick Park", slug: "carrick-park", city: "Carrick, TAS", region: "TAS", lat: -41.5358, lng: 147.0121, founded: null, status: "active", length: 1000, finalStraight: 180, openStretch: false, direction: null, org: "Carrick Park Pacing Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Cím: East Street, Carrick TAS 7291. Koordináta forrása: Google Places ('Carrick Park Pacing Club', pontos cím-egyezés). A kanyarsugár a HRA adatlapján N/A. Pálya és műszaki adatok forrása: Harness Racing Australia hivatalos pálya-adatlap (harness.org.au), 2026-08." },
        { name: "Charlton", slug: "charlton", city: "Charlton, VIC", region: "VIC", lat: -36.2626, lng: 143.3587, founded: null, status: "active", length: 960, finalStraight: 200, turnRadius: 82, openStretch: true, direction: null, org: null, ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Cím: Charlton Park, Mildura Way, Charlton VIC 3525. Koordináta forrása: Google Places ('HRV Charlton') + második találat ('Charlton Harness Racing Track', ~150 m-re) ugyanazon a telepen. Pálya és műszaki adatok forrása: Harness Racing Australia hivatalos pálya-adatlap (harness.org.au), 2026-08." },
        { name: "Cobram", slug: "cobram", city: "Cobram, VIC", region: "VIC", lat: -35.9039, lng: 145.6347, founded: null, status: "active", length: 1008, finalStraight: 200, turnRadius: 97, openStretch: true, direction: null, org: "Cobram & District Harness Racing Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Cím: Racecourse Road, Cobram VIC 3644. Koordináta forrása: Google Places ('Cobram & District Harness Racing Club') - telefonszám (+61 3 5872 1297) pontosan egyezik a hivatalos adatlappal. Pálya és műszaki adatok forrása: Harness Racing Australia hivatalos pálya-adatlap (harness.org.au), 2026-08." },
        { name: "Collie", slug: "collie", city: "Collie, WA", region: "WA", lat: -33.357, lng: 116.1601, founded: null, status: "active", length: 644, finalStraight: 135, openStretch: false, direction: null, org: "Collie Harness Racing Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Cím: Bridge St, Collie WA 6225 (Wallsend Paceway). Koordináta forrása: Google Places, pontos cím-egyezés. A Casino City geo-tagje gyanús volt (lásd a Bridgetown-rekord megjegyzését), ezért NEM azt használtuk. A kanyarsugár a HRA adatlapján N/A. Pálya és műszaki adatok forrása: Harness Racing Australia hivatalos pálya-adatlap (harness.org.au), 2026-08." },
        { name: "Coolamon", slug: "coolamon", city: "Coolamon, NSW", region: "NSW", lat: -34.8096, lng: 147.1826, founded: null, status: "active", length: 1053, finalStraight: 245, openStretch: false, direction: null, org: null, ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Cím: Darling Street, Coolamon NSW 2701. Koordináta forrása: Google Places ('Coolamon Harness Racing') - telefonszám (+61 427 200 873) pontosan egyezik a hivatalos adatlappal. A kanyarsugár a HRA adatlapján N/A. Pálya és műszaki adatok forrása: Harness Racing Australia hivatalos pálya-adatlap (harness.org.au), 2026-08." },
        { name: "Donald", slug: "donald", city: "Donald, VIC", region: "VIC", lat: -36.3611, lng: 142.9963, founded: null, status: "active", length: 903, openStretch: false, direction: null, org: null, ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Cím: Racecourse Road, Donald VIC 3480. Koordináta forrása: Google Places ('Donald Racecourse', pontos cím-egyezés). A célegyenes és a kanyarsugár a HRA adatlapján N/A. Pálya és műszaki adatok forrása: Harness Racing Australia hivatalos pálya-adatlap (harness.org.au), 2026-08." },
        { name: "Dubbo", slug: "dubbo", city: "Dubbo, NSW", region: "NSW", lat: -32.2469, lng: 148.6162, founded: null, status: "active", length: 805, finalStraight: 121, turnRadius: 76, openStretch: false, direction: null, org: "Dubbo Harness Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Cím: 191 Fitzroy Street, Dubbo Showground, Dubbo NSW 2830. PIC-szám: NJ224985. Koordináta forrása: Google Places ('Dubbo Showground', pontos cím-egyezés). Pálya és műszaki adatok forrása: Harness Racing Australia hivatalos pálya-adatlap (harness.org.au), 2026-08." },
        { name: "Kellerberrin", slug: "kellerberrin", city: "Kellerberrin, WA", region: "WA", lat: -31.6282, lng: 117.712, founded: null, status: "active", length: 806, finalStraight: 144, openStretch: true, direction: null, org: null, ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "KÖRZETI KLUB: az adatlapon Cunderdin, Trayning és Merredin kupák is szerepelnek, ezért a pálya pontos hivatalos neve bizonytalan. Cím: Lot 260 Connelly Street, Kellerberrin WA 6410. Koordináta forrása: Google Places ('Kellerberrin & Districts Club', pontos cím-egyezés). A kanyarsugár a HRA adatlapján N/A. Pálya és műszaki adatok forrása: Harness Racing Australia hivatalos pálya-adatlap (harness.org.au), 2026-08." }
    ],
    NZL: [
        { name: "Addington Raceway", slug: "addington-raceway", city: "Christchurch", lat: -43.5440, lng: 172.6000, founded: null, status: "active", length: null, direction: null, org: "New Zealand Metropolitan Trotting Club", ownSite: null, operatorSite: "https://hrnz.co.nz/", operatorName: "Harness Racing New Zealand", note: "Új-Zéland vezető ügetőpályája; a New Zealand Trotting Cup otthona, az ország legrangosabb ügetőfutamáé. Rendezvényközponttal egybeépítve" },
        { name: "Alexandra Park Raceway", slug: "alexandra-park-raceway", city: "Auckland", lat: -36.8923, lng: 174.7762, founded: null, status: "active", length: null, direction: null, org: "Auckland Trotting Club", ownSite: null, operatorSite: "https://hrnz.co.nz/", operatorName: "Harness Racing New Zealand", note: "Az Északi-sziget vezető pályája, Auckland belvárosához közel; az Auckland Trotting Cup helyszíne" },
        { name: "Cambridge Raceway", slug: "cambridge-raceway", city: "Cambridge", lat: -37.8810, lng: 175.4571, founded: null, status: "active", length: null, direction: null, org: "Cambridge Harness Racing Club", ownSite: null, operatorSite: "https://hrnz.co.nz/", operatorName: "Harness Racing New Zealand", note: "Waikato régió fő pályája; lakóautós parkolóhellyel és sportbárral" },
        { name: "Ashburton Raceway", slug: "ashburton-raceway", city: "Ashburton", lat: -43.8886, lng: 171.7645, founded: null, status: "active", length: null, direction: null, org: "Ashburton Trotting Club", ownSite: null, operatorSite: "https://hrnz.co.nz/", operatorName: "Harness Racing New Zealand", note: "Canterbury régió vidéki pályája" },
        { name: "Ascot Park Raceway", slug: "ascot-park-raceway", city: "Invercargill", lat: -46.4010, lng: 168.3910, founded: null, status: "active", length: null, direction: null, org: "Southland Harness Racing Club", ownSite: null, operatorSite: "https://hrnz.co.nz/", operatorName: "Harness Racing New Zealand", note: "Új-Zéland (és a világ) egyik legdélibb versenypályája" },
        { name: "Methven Racecourse", slug: "methven-racecourse", city: "Methven", lat: -43.6227, lng: 171.6432, founded: null, status: "active", length: null, direction: null, org: "Methven Trotting Club", ownSite: null, operatorSite: "https://hrnz.co.nz/", operatorName: "Harness Racing New Zealand", note: "Festői, hófödte hegyekre néző pálya a Déli-Alpok lábánál; termálfürdő közvetlenül mellette" },
        { name: "Rangiora Racecourse", slug: "rangiora-racecourse", city: "Fernside (Rangiora)", lat: -43.2933, lng: 172.5685, founded: null, status: "active", length: null, direction: null, org: "Canterbury Park Trotting Club", ownSite: null, operatorSite: "https://hrnz.co.nz/", operatorName: "Harness Racing New Zealand", note: "A Rangiora karácsonyi versenynapjairól ismert, ingyenes belépéssel" },
        { name: "Central Southland Raceway", slug: "central-southland-raceway", city: "Winton", lat: -46.1150, lng: 168.3176, founded: null, status: "active", length: null, direction: null, org: "Central Southland Harness Racing Club", ownSite: null, operatorSite: "https://hrnz.co.nz/", operatorName: "Harness Racing New Zealand", note: "Vidéki pálya, évente már csak néhány versenynappal" },
        { name: "Forbury Park Raceway", slug: "forbury-park-raceway", city: "Dunedin", lat: -45.9051, lng: 170.4876, founded: 1900, status: "closed", length: null, direction: null, org: "Forbury Park Trotting Club (korábbi)", ownSite: null, operatorSite: "https://hrnz.co.nz/", operatorName: "Harness Racing New Zealand", note: "Otago régió történelmi ügetőpályája volt. STÁTUSZ: 2021-ben véglegesen bezárt pénzügyi okokból, a területet lakóövezetté alakítják" }
    ],
    DNK: [
        { name: "Charlottenlund Travbane (Lunden)", slug: "charlottenlund-travbane-lunden", city: "Charlottenlund (Koppenhága)", lat: 55.7545, lng: 12.5868, founded: 1891, status: "active", length: 950, direction: "left", org: "Det Danske Travselskab", ownSite: "https://www.travbanen.dk/", operatorSite: null, operatorName: null, note: "ÉSZAK-EURÓPA LEGRÉGEBBI ÜGETŐPÁLYÁJA (1891). A Copenhagen Cup (1928 óta) és a Dansk Trav Derby otthona. 950 m, 22 m széles, 200 m célegyenes, balkéz. Ikonikus történelmi tornyaival, a Charlottenlundi erdő mellett" },
        { name: "Jydsk Væddeløbsbane", slug: "jydsk-vaeddelobsbane", city: "Aarhus", lat: 56.1279, lng: 10.1960, founded: null, status: "active", length: null, direction: null, org: "Jydsk Væddeløbsbane", ownSite: "https://www.jvb-aarhus.dk/", operatorSite: null, operatorName: null, note: "Aarhus déli részén, a Marselisborg-erdők mellett; egész évben ügető, áprilistól októberig galopp is" },
        { name: "Billund Trav", slug: "billund-trav", city: "Billund", lat: 55.7289, lng: 9.1320, founded: 1971, status: "closed", length: 1200, direction: null, org: "Billund Trav A/S", ownSite: null, operatorSite: "https://www.trav.dk/", operatorName: "Dansk Travsports Centralforbund", note: "Korábban Sydjysk Væddeløbsbane néven; a megnyitó versenynapon kb. 15 000 néző volt jelen. 1200 m, 250 m célegyenes. STÁTUSZ: az utolsó versenynap 2021. október 23-án volt; a területet a Kirkbi A/S vásárolta meg, ma lakónegyed épül rajta. Ezzel Dániában 7 ügetőpálya maradt. Forrás: Dansk Hestevæddeløb (2021)" },
        { name: "Fyens Væddeløbsbane", slug: "fyens-vaeddelobsbane", city: "Odense", lat: 55.3756, lng: 10.3493, founded: null, status: "active", length: 1000, direction: null, org: "Fyens Væddeløbsbane", ownSite: "https://www.fvb-odense.dk/", operatorSite: null, operatorName: null, note: "Odense nyugati részén; galopp és ügető egyaránt. 1000 m, 19,5 m széles, 250 m célegyenes" },
        { name: "Skive Trav", slug: "skive-trav", city: "Skive", lat: 56.5316, lng: 9.0333, founded: null, status: "active", length: null, direction: null, org: "Skive Trav", ownSite: "https://www.skive-trav.dk/", operatorSite: null, operatorName: null, note: "Itt versenyzett a legendás dán ügető, Tarok" },
        { name: "Racing Arena Aalborg", slug: "racing-arena-aalborg", city: "Aalborg", lat: 57.0532, lng: 9.8766, founded: null, status: "active", length: null, direction: null, org: "Aalborg Væddeløbsbane", ownSite: "https://www.aav.dk/", operatorSite: null, operatorName: null, note: "Észak-Jylland pályája, Spar Nord Arena néven is ismert" },
        { name: "Nykøbing F. Travbane", slug: "nykobing-f-travbane", city: "Nykøbing Falster", lat: 54.7274, lng: 11.9171, founded: null, status: "active", length: null, direction: null, org: "Nykøbing F. Travbane", ownSite: "https://www.nyktrav.dk/", operatorSite: null, operatorName: null, note: "Falster szigetének pályája, Dánia déli részén" },
        { name: "Bornholms Brand Park", slug: "bornholms-brand-park", city: "Aakirkeby (Bornholm)", lat: 55.1261, lng: 14.9208, founded: null, status: "active", length: null, direction: null, org: "Bornholms Brand Park", ownSite: "https://www.bornholmsbrandpark.dk/", operatorSite: null, operatorName: null, note: "Bornholm szigetének ügetőpályája a Balti-tengeren" }
    ],
    DEU: [
        { name: "Trabrennbahn Pfarrkirchen", slug: "trabrennbahn-pfarrkirchen", city: "Pfarrkirchen", lat: 48.43251667, lng: 12.938, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.hvtonline.de/", operatorName: "Hauptverband für Traberzucht (HVT)", note: "Koordináta forrása: OpenStreetMap (Nominatim) + Wikipédia (de) – Pfarrkirchen. Pálya forrása: Hauptverband für Traberzucht (hvtonline.de) 2026-os versenynaptár" },
        { name: "Trabrennbahn Berlin-Mariendorf", slug: "trabrennbahn-berlin-mariendorf", city: "Berlin", lat: 52.4273, lng: 13.3906, founded: null, status: "active", length: null, direction: null, org: "Berliner Trabrenn-Verein e.V.", ownSite: null, operatorSite: "https://www.hvtonline.de/", operatorName: "HVT – Hauptverband für Traberzucht", note: "Németország legrangosabb ügetőpályája, a Deutsches Traber-Derby otthona; a HVT (szövetség) központi elszámolóhelye is itt működik" },
        { name: "Trabrennbahn Berlin-Karlshorst", slug: "trabrennbahn-berlin-karlshorst", city: "Berlin", lat: 52.4760, lng: 13.5267, founded: null, status: "active", length: 1609, direction: null, org: "Trabrennbahn Karlshorst", ownSite: null, operatorSite: "https://www.hvtonline.de/", operatorName: "HVT – Hauptverband für Traberzucht", note: "Berlin második pályája, 1609 m-es (mile) távokkal; havi bolhapiacnak is otthont ad" },
        { name: "Trabrennbahn Gelsenkirchen", slug: "trabrennbahn-gelsenkirchen", city: "Gelsenkirchen", lat: 51.5049, lng: 7.0559, founded: 1912, status: "active", length: null, direction: null, org: "Gelsentrab", ownSite: null, operatorSite: "https://www.hvtonline.de/", operatorName: "HVT – Hauptverband für Traberzucht", note: "Németország egyik legnagyobb ügetőpályája, a Ruhr-vidék központjában; a versenynaptár egyik legaktívabb helyszíne" },
        { name: "Trabrennbahn München-Daglfing", slug: "trabrennbahn-munchen-daglfing", city: "München", lat: 48.1421, lng: 11.6576, founded: null, status: "active", length: null, direction: null, org: "Münchener Traber-Zucht- und Rennverein", ownSite: null, operatorSite: "https://www.hvtonline.de/", operatorName: "HVT – Hauptverband für Traberzucht", note: "Bajorország fő ügetőpályája; havonta kétszer versenynap, nőknek és gyerekeknek ingyenes belépéssel" },
        { name: "Trabrennbahn Mönchengladbach", slug: "trabrennbahn-monchengladbach", city: "Mönchengladbach", lat: 51.2325, lng: 6.4911, founded: null, status: "active", length: null, direction: null, org: "Verein zur Förderung des Rheinischen Trabrennsportes e.V.", ownSite: "http://www.mgtrab.de/", operatorSite: null, operatorName: null, note: "ELLENŐRZVE (2026): AKTÍV, DE VESZÉLYEZTETETT. 2026-ra 13 versenynapot terveztek (a január 25-i és március 15-i elmaradt); kiemelt futamok: Großer Preis der Stadt Mönchengladbach (július 19.), Großer Preis des Rheinischen Karnevals (november 15.). A pálya a Niers folyó mellett, a repülőtér szomszédságában fekszik. FENYEGETÉS: a város 2027-től ipari-kereskedelmi övezetté alakítaná a 232 hektáros területet; a \"Go4Gewerbe\" tartományi programból 2,3 millió eurós állami garanciát kapott erre. A bérleti szerződést a város évente csak egy évre hosszabbítja, így nincs tervezési biztonság. A HVT (német ügetőszövetség) elnöke levélben kérte NRW miniszterelnökét a pálya megőrzésére" },
        { name: "Trabrennbahn Bahrenfeld", slug: "trabrennbahn-bahrenfeld", city: "Hamburg", lat: 53.5765, lng: 9.8925, founded: null, status: "active", length: null, direction: null, org: "Hamburger Renn-Club", ownSite: null, operatorSite: "https://www.hvtonline.de/", operatorName: "HVT – Hauptverband für Traberzucht", note: "Észak-Németország fő pályája; nagyszabású koncerthelyszínként is ismert (Ed Sheeran, Foo Fighters, Robbie Williams)" },
        { name: "Trabrennbahn Straubing", slug: "trabrennbahn-straubing", city: "Straubing", lat: 48.8699, lng: 12.5626, founded: null, status: "active", length: null, direction: null, org: "Straubinger Trabrennverein", ownSite: null, operatorSite: "https://www.hvtonline.de/", operatorName: "HVT – Hauptverband für Traberzucht", note: "Alsó-bajorországi, történelmi hangulatú pálya" }
    ],
    AUT: [
        { name: "Trabrennbahn Krieau", slug: "trabrennbahn-krieau", city: "Bécs", lat: 48.2106, lng: 16.4143, founded: 1878, status: "active", length: 1000, direction: "left", org: "Wiener Trabrenn-Verein", ownSite: null, operatorSite: "https://www.krieau.at/", operatorName: "Wiener Trabrenn-Verein", note: "1878. szeptember 29-én nyílt – EURÓPA MÁSODIK LEGRÉGEBBI ÜGETŐPÁLYÁJA; csak a moszkvai Központi Hippodrom (1834) idősebb nála. Ma is eredeti helyén működik, a bécsi Leopoldstadt kerületben, a Prater park mellett. Az Osztrák Ügető Derby és a Graf Kálmán Hunyady Memorial otthona (utóbbi magyar vonatkozású névadóval). 1000 m, homokos talaj; a Traberzentrale besorolásában A-kategóriás pálya (A: min. 1000 m, B: min. 800 m). Évi 20+ versenynappal Ausztria legnagyobb versenyszervezője; a 141. osztrák derbit 2026. június 21-én rendezték" },
        { name: "Welser Trabrennbahn", slug: "welser-trabrennbahn", city: "Wels", lat: 48.149663, lng: 14.014183, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: null, operatorName: "Traberzentrale", note: "Ausztria legnagyobb B-pályás versenyszervezője, évi 10+ versenynappal. 64 000 m², fedett tribün, ingyenes belépés. Koordináta forrása: Overpass/OSM település (relation/6360136) + OpenStreetMap (Nominatim). Pálya forrása: Traberzentrale 2026-os versenynaptár" }
    ],
    NLD: [
        { name: "Victoria Park Wolvega", slug: "victoria-park-wolvega", city: "Wolvega (Frízföld)", lat: 52.8834, lng: 6.0097, founded: 1964, status: "active", length: 1000, direction: null, org: "Victoria Park Wolvega", ownSite: "https://www.victoriaparkwolvega.nl/", operatorSite: null, operatorName: null, note: "HOLLANDIA VEZETŐ ÜGETŐPÁLYÁJA, sokak szerint Európa egyik legszebbje. 1964 óta; 1000 m-es pálya. Kiemelt futamok: Prijs der Giganten, Derby der Vierjarigen, Championnat des Trotteurs Français" },
        { name: "Alkmaar ZEturf Arena", slug: "alkmaar-zeturf-arena", city: "Alkmaar (Észak-Holland)", lat: 52.6212, lng: 4.7325, founded: null, status: "active", length: null, direction: null, org: "Drafbaan Alkmaar", ownSite: null, operatorSite: "https://www.victoriaparkwolvega.nl/", operatorName: "Victoria Park Wolvega", note: "Hollandia második legfontosabb ügetőpályája; kompakt, de élénk hangulatú. MEGJEGYZÉS: a látogatói visszajelzések szerint az utóbbi években csökkent a versenynapok száma" }
    ],
    ESP: [
        { name: "Gran Hipódromo de Andalucía", slug: "gran-hipodromo-de-andalucia", city: "Dos Hermanas (Sevilla)", lat: 37.31519844, lng: -5.9524855, founded: 2002, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: null, operatorName: null, note: "ANDALÚZIA – nem baleári! 155 hektár, kb. 5000 fő befogadóképesség; a Junta de Andalucía támogatja.. Koordináta forrása: OpenStreetMap (Nominatim) + Wikipédia (es) – Gran Hipódromo de Andalucía. Pálya forrása: FECT / Turismo de Sevilla" },
        { name: "Hipódromo Son Pardo", slug: "hipodromo-son-pardo", city: "Palma de Mallorca", lat: 39.5965, lng: 2.6574, founded: null, status: "active", length: null, direction: null, org: "Hipódromo Son Pardo", ownSite: null, operatorSite: "https://www.federaciobaleardetrot.com/", operatorName: "Federació Balear de Trot", note: "Spanyolország vezető ügetőpályája; a Baleár-szigetek ügetőhagyománya egyedülálló az országban. Nyáron jellemzően vasárnaponként, ingyenes belépéssel" },
        { name: "Hipòdrom de Manacor", slug: "hipodrom-de-manacor", city: "Manacor (Mallorca)", lat: 39.5787, lng: 3.2169, founded: null, status: "active", length: null, direction: null, org: "Hipòdrom de Manacor", ownSite: null, operatorSite: "https://www.federaciobaleardetrot.com/", operatorName: "Federació Balear de Trot", note: "Mallorca keleti részének pályája; a helyi közösségi élet fontos találkozóhelye, esti versenynapokkal" },
        { name: "Hipòdrom Municipal de Maó", slug: "hipodrom-municipal-de-mao", city: "Maó (Menorca)", lat: 39.8628, lng: 4.2567, founded: null, status: "active", length: null, direction: null, org: "Hipòdrom Municipal de Maó", ownSite: null, operatorSite: "https://www.federaciobaleardetrot.com/", operatorName: "Federació Balear de Trot", note: "Menorca fő ügetőpályája; rendszeres vasárnapi versenynapok, minitrote (póni) futamokkal is. Erős helyi közösségi hagyomány, alacsony tétekkel és családbarát hangulattal" },
        { name: "Hipòdrom Torre del Ram", slug: "hipodrom-torre-del-ram", city: "Ciutadella (Menorca)", lat: 40.0112, lng: 3.8022, founded: null, status: "active", length: null, direction: null, org: "Hipòdrom Torre del Ram", ownSite: null, operatorSite: "https://www.federaciobaleardetrot.com/", operatorName: "Federació Balear de Trot", note: "Menorca nyugati végén; vasárnap esti versenynapok (17:30-21:00), belépés kb. 6 euró, gyerekeknek ingyenes. A nézők a pálya körüli falon ülve követik a futamokat. JAVÍTVA (2026-07): korábban tévesen a hipodromsantrafel.com cím szerepelt itt, ami az ibizai Sant Rafel pálya honlapja – törölve, saját honlap forrás nélkül nem vehető fel" }
    ],
    BEL: [
        { name: "Hippodrome de Wallonie", slug: "hippodrome-de-wallonie", city: "Ghlin (Mons)", lat: 50.4801, lng: 3.9248, founded: 1999, status: "active", length: null, direction: null, org: "Hippodrome de Wallonie / Mons SA", ownSite: "https://hippodromedewallonie.be/", operatorSite: null, operatorName: null, note: "Belgium vezető ügetőpályája és Vallónia egyetlen versenypályája. 1999-ben alapította a Fédération Nationale du Trot és a Vallon Régió. Évi 55 versenynap: 40 ügető (kb. 360 futam) + 15 galopp. Itt versenyzett Bold Eagle, Timoko, Ready Cash és Love You is. Kiemelt futamok: Grand Prix de Wallonie, Grand Prix de la Toussaint. Nemzetközi patkolóiskola és lóversenyszakmai képzőközpont is működik a területén" },
        { name: "Hippodroom Kuurne", slug: "hippodroom-kuurne", city: "Kuurne", lat: 50.8599, lng: 3.2782, founded: null, status: "active", length: null, direction: null, org: "Fédération Belge des Courses Hippiques", ownSite: null, operatorSite: "https://www.trotting.be", operatorName: "Fédération Belge des Courses Hippiques", note: "Flandriai ügetőpálya Kortrijk közelében" },
        { name: "Hippodroom Waregem", slug: "hippodroom-waregem", city: "Waregem", lat: 50.8853, lng: 3.4416, founded: null, status: "active", length: null, direction: null, org: "Hippodroom Waregem", ownSite: "http://www.hippodroomwaregem.be/", operatorSite: null, operatorName: null, note: "40 000 fős befogadóképesség; a Waregem Koerse (Great Flanders Steeple Chase) helyszíne. Vegyes profil: telivér és ügető egyaránt" },
        { name: "Hippodroom Tongeren (Jeker)", slug: "hippodroom-tongeren-jeker", city: "Tongeren", lat: 50.7687, lng: 5.4579, founded: null, status: "active", length: null, direction: null, org: "Fédération Belge des Courses Hippiques", ownSite: null, operatorSite: "https://www.trotting.be", operatorName: "Fédération Belge des Courses Hippiques", note: "Limburg tartomány ügetőpályája, a Jeker folyó mentén" }
    ],
    GBR: [
        { name: "Boughrood", slug: "boughrood", city: "Boughrood", lat: 52.045, lng: -3.2714, founded: null, status: "active", length: null, direction: null, org: "British Harness Racing Club (BHRC)", ownSite: null, operatorSite: null, operatorName: null, note: "Koordináta forrása: Nominatim (irányítószám) + Wikipédia (en) – Boughrood. Pálya forrása: British Harness Racing Club (bhrc.org.uk) versenynaptár, 2026-07" },
        { name: "Eardisley", slug: "eardisley", city: "Eardisley", lat: 52.139, lng: -3.008, founded: null, status: "active", length: null, direction: null, org: "British Harness Racing Club (BHRC)", ownSite: null, operatorSite: null, operatorName: null, note: "Koordináta forrása: Nominatim (irányítószám) + OpenStreetMap (Nominatim) + Wikipédia (en) – Eardisley. Pálya forrása: British Harness Racing Club (bhrc.org.uk) versenynaptár, 2026-07" },
        { name: "Ivington", slug: "ivington", city: "Ivington", lat: 52.2033, lng: -2.772, founded: null, status: "active", length: null, direction: null, org: "British Harness Racing Club (BHRC)", ownSite: null, operatorSite: null, operatorName: null, note: "Koordináta forrása: Nominatim (irányítószám) + Wikipédia (en) – Ivington. Pálya forrása: British Harness Racing Club (bhrc.org.uk) versenynaptár, 2026-07" },
        { name: "Kilnsey", slug: "kilnsey", city: "Kilnsey", lat: 54.10638889, lng: -2.04166667, founded: null, status: "active", length: null, direction: null, org: "British Harness Racing Club (BHRC)", ownSite: null, operatorSite: null, operatorName: null, note: "Koordináta forrása: Nominatim (irányítószám) + Wikipédia (en) – Kilnsey. Pálya forrása: British Harness Racing Club (bhrc.org.uk) versenynaptár, 2026-07" },
        { name: "Lampeter", slug: "lampeter", city: "Lampeter", lat: 52.1202, lng: -4.0821, founded: null, status: "active", length: null, direction: null, org: "British Harness Racing Club (BHRC)", ownSite: null, operatorSite: null, operatorName: null, note: "Koordináta forrása: Nominatim (irányítószám) + Wikipédia (en) – Lampeter. Pálya forrása: British Harness Racing Club (bhrc.org.uk) versenynaptár, 2026-07" },
        { name: "Pikehall", slug: "pikehall", city: "Pikehall", lat: 53.129, lng: -1.715, founded: null, status: "active", length: null, direction: null, org: "British Harness Racing Club (BHRC)", ownSite: null, operatorSite: null, operatorName: null, note: "Koordináta forrása: Nominatim (irányítószám) + Wikipédia (en) – Pikehall. Pálya forrása: British Harness Racing Club (bhrc.org.uk) versenynaptár, 2026-07" },
        { name: "Talgarreg", slug: "talgarreg", city: "Talgarreg", lat: 52.134114, lng: -4.300419, founded: null, status: "active", length: null, direction: null, org: "British Harness Racing Club (BHRC)", ownSite: null, operatorSite: null, operatorName: null, note: "Koordináta forrása: Nominatim (irányítószám) + Wikipédia (en) – Talgarreg. Pálya forrása: British Harness Racing Club (bhrc.org.uk) versenynaptár, 2026-07" },
        { name: "Tregaron", slug: "tregaron", city: "Tregaron", lat: 52.21962, lng: -3.93517, founded: null, status: "active", length: null, direction: null, org: "British Harness Racing Club (BHRC)", ownSite: null, operatorSite: null, operatorName: null, note: "Koordináta forrása: Nominatim (irányítószám) + Wikipédia (en) – Tregaron. Pálya forrása: British Harness Racing Club (bhrc.org.uk) versenynaptár, 2026-07" },
        { name: "Wolsingham", slug: "wolsingham", city: "Wolsingham", lat: 54.731, lng: -1.882, founded: null, status: "active", length: null, direction: null, org: "British Harness Racing Club (BHRC)", ownSite: null, operatorSite: null, operatorName: null, note: "Koordináta forrása: Nominatim (irányítószám) + Wikipédia (en) – Wolsingham. Pálya forrása: British Harness Racing Club (bhrc.org.uk) versenynaptár, 2026-07" },
        { name: "Wolverhampton Racecourse", slug: "wolverhampton-racecourse", city: "Wolverhampton", lat: 52.604, lng: -2.1451, founded: null, status: "active", length: 1006, direction: null, org: "BHRC (vegyes: főleg galopp)", ownSite: null, operatorSite: null, operatorName: null, note: "Öt-nyolcad mérföldes pálya. Elsősorban galopp-pálya, alkalmi ügetőfutamokkal.. Koordináta forrása: Nominatim (irányítószám) + Wikidata Q16903614 + OpenStreetMap (Nominatim). Pálya forrása: British Harness Racing Club (bhrc.org.uk) versenynaptár, 2026-07" },
        { name: "Tir Prince Raceway", slug: "tir-prince-raceway", city: "Towyn, Wales", lat: 53.3036, lng: -3.5291, founded: null, status: "active", length: null, direction: null, org: "Tir Prince Raceway", ownSite: null, operatorSite: "https://www.trotbritaingb.com/", operatorName: "Trot Britain", note: "Nagy-Britannia legjelentősebb ügetőpályája, Észak-Walesben; piaccal és vidámparkkal egybeépítve, élénk családi hangulattal" },
        { name: "Corbiewood Stadium (Haugh Field)", slug: "corbiewood-stadium-haugh-field", city: "Bannockburn (Stirling), Skócia", lat: 56.0827, lng: -3.9134, founded: null, status: "active", length: null, direction: null, org: "Corbiewood Stadium", ownSite: null, operatorSite: "https://www.trotbritaingb.com/", operatorName: "Trot Britain", note: "Skócia ügetőpályája; a brit ügetősport egyik történelmi központja. FIGYELEM: a BHRC versenynaptárában \"Haugh Field\" néven szerepel (irányítószám: FK7 0LW) – UGYANAZ A PÁLYA, brit bővítéskor nem szabad külön rekordként felvenni. A BHRC egy közleménye szerint a pálya időszakosan zárva volt; aktuális státusza ellenőrizendő" },
        { name: "Musselburgh Racecourse", slug: "musselburgh-racecourse", city: "Musselburgh, Skócia", lat: 55.947, lng: -3.03949, founded: 1816, status: "active", length: null, direction: "right", org: "Scottish HRC / BHRC - http://www.bhrc.org.uk", ownSite: "https://www.musselburgh-racecourse.co.uk", operatorSite: null, operatorName: null, note: "Elsősorban galopppálya, de évente egy alkalommal a BHRC szervezésében ügetőversenynek (Musselburgh Pace) ad otthont – hasonlóan a listán szereplő Wolverhamptonhoz. A racecourse360.docx táblázatából. AZ ADATOK MEGERŐSÍTETLENEK – a docx bizonyítottan tartalmaz hibát. Ellenőrizendő a --fill és a --javaslatok móddal. Koordináta forrása: Wikidata Q6943106 + OpenStreetMap (Nominatim) + Wikipédia (en) – Musselburgh Racecourse + GeoNames (8378825). Pálya forrása: racecourse360.docx (saját táblázat) – megerősítetlen" }
    ],
    IRL: [
        { name: "Portmarnock Raceway", slug: "portmarnock-raceway", city: "Portmarnock (Dublin)", lat: 53.4256, lng: -6.1316, founded: 1969, status: "active", length: null, direction: null, org: "Irish Harness Racing Association (IHRA)", ownSite: "http://portmarnockraceway.ie/", operatorSite: "https://www.irishharnessracing.com", operatorName: "Irish Harness Racing Association", note: "ELLENŐRZVE (2026): AKTÍV. 1969-ben nyílt, 2004-ben bezárt (a területet lakóparknak adták el, ami a 2008-as válság miatt sosem épült meg), majd 7 év szünet után 2011 júniusában újraindult. Ma évi 20+ versenynap. Létesítmények: klubház, bár, játszótér, bukmékerállások. Kiemelt események: All Ireland Series (Pace és Trot döntők), Vincent Delaney Memorial. FIGYELEM: a koordináta csak településszintű közelítés – a pálya pontos helye még ellenőrizendő" },
        { name: "Annaghmore Raceway", slug: "annaghmore-raceway", city: "Craigavon, Észak-Írország", lat: 54.4665, lng: -6.6043, founded: null, status: "active", length: null, direction: null, org: "Irish Harness Racing Association (IHRA)", ownSite: null, operatorSite: "https://www.irishharnessracing.com", operatorName: "Irish Harness Racing Association", note: "ÉSZAK-ÍRORSZÁG (Egyesült Királyság) EGYETLEN ÜGETŐPÁLYÁJA, de a sziget egészére kiterjedő IHRA szervezésében versenyez – ezért szerepel az ír listában, nem a britben. A 2026-os IHRA versenynaptár egyik legaktívabb helyszíne (június 27-i versenynap igazolva)" }
    ],
    LTU: [
        { name: "Lazdijai Hippodrome (Bukta)", slug: "lazdijai-hippodrome-bukta", city: "Bukta, Lazdijai", lat: 54.2419, lng: 23.5270, founded: null, status: "active", length: null, direction: null, org: "Lithuania National Trotting League", ownSite: null, operatorSite: "https://www.ristunusportas.lt", operatorName: "Lithuania National Trotting League", note: "Litvánia fő ügetőpályája és a nemzeti szövetség székhelye. FONTOS: ez cáfolja azt a korábbi feltevést, hogy a Baltikumban nincs ügetősport – Litvánia UET-tagország, 2025-ben 65 futammal, 2 pályán" }
    ],
    MLT: [
        { name: "Ta' Xħajma Racetrack", slug: "ta-xhajma-racetrack", city: "Xewkija (Gozo)", lat: 36.03778, lng: 14.26667, founded: null, status: "active", length: 1000, direction: null, org: "Gozo Horse Racing Association", ownSite: null, operatorSite: null, operatorName: null, note: "Gozo szigetének egyetlen versenypályája, kb. 1 km hosszú. A Gozo Horse Racing Association kéthetente rendez itt hétvégi versenyeket, valamint különleges eseményeket (Arka Races, Bailey's Heats). A gozói versenyzés a római kocsiversenyre emlékeztet: a hajtó kétkerekű gigen ül. FELVÉVE (2026-07): a máltai ellenőrzés során derült ki, hogy az adatbázisból hiányzott" },
        { name: "Marsa Racetrack (Malta Equidrome)", slug: "marsa-racetrack-malta-equidrome", city: "Marsa", lat: 35.8779, lng: 14.4873, founded: 1868, status: "active", length: null, direction: null, org: "Malta Racing Club", ownSite: "https://www.maltaracingclub.com", operatorSite: null, operatorName: null, note: "Málta egyetlen versenypályája, szinte kizárólag ügetőprofillal: 2025-ben 350 futam, 728 versenyző lóval – kiemelkedően intenzív használat egyetlen pályán. A Malta Racing Club UET-tagszövetség. A klub 1868-ban alakult, a pályát 1981-ben építették újjá 2000 férőhelyes tribünnel. 2019 júliusában a parlament 65 éves koncessziót adott a terület fejlesztésére – azóta a helyszín Malta Equidrome néven is fut, a versenynaptárt a Malta Equidrome állítja össze a Malta Racing Clubbal egyeztetve" }
    ],
    ROU: [
        // Románia egyetlen két aktív ügetőpályája. Forrás: trapas.ro, az
        // Asociația Calului de Trap oldala – ez Románia hivatalos
        // Stud-Book hatósága a trapper fajtára (ANZ 2/2019. sz. elismerés),
        // tehát szövetségi elsődleges forrás.
        { name: "Hipodromul Ploiești", slug: "hipodromul-ploiesti", city: "Ploiești", lat: 44.9118195, lng: 26.0428042, founded: 1961, status: "active", length: 1200, direction: "left", surface: "homok", org: "CSM Ploiești", ownSite: "https://hipodromulploiesti.ro/" },
        // Az ügetőpálya a Herghelia Mangalia (ménes) területén fekszik,
        // amelyet a Romsilva üzemeltet. Műszaki adatait a Comisia Tehnică
        // a Curselor de Trap homologációs tanúsítványa rögzíti (2023).
        { name: "Hipodromul Hergheliei Mangalia", slug: "hipodromul-hergheliei-mangalia", city: "Mangalia", lat: 43.8523436, lng: 28.5910513, founded: 1973, status: "active", length: 1066, width: 16, direction: "right", surface: "homok", org: "Romsilva – Herghelia Mangalia" },
    ],
    SRB: [
        { name: "Beogradski hipodrom", slug: "beogradski-hipodrom", city: "Belgrád", lat: 44.7857, lng: 20.4253, founded: null, status: "active", length: 1000, direction: "right", org: "Srpski Kasački Savez", ownSite: null, operatorSite: "https://www.serbia-trot.org.rs", operatorName: "Srpski Kasački Savez", surface: "zúzalék", finalStraight: 200, width: 30, trotSince: 1930, note: "Szerbia fő versenypályája, a Careva Ćuprija városrészben. A hipodromot hivatalosan 1914. június 28-án nyitották – éppen a szarajevói merénylet napján –, ezért az első világháború kitörése miatt mindössze EGY NAPIG működött. UKSS műszaki adatok: 1000 m ellipszis, 200 m célegyenes, 30 m széles, fehér kőzúzalék burkolat (2008-ban újranasúlyozva), jobb kézre. FIGYELEM AZ ÉVSZÁMOKRA: a Wikipédia szerint ügetőversenyeket 1930 óta rendeznek itt, a pálya saját közlése szerint viszont a DEDIKÁLT ügetőpálya csak 1952-ben készült el, és az első futamokat azon abban az évben rendezték. A kettő nem zárja ki egymást: 1930-tól valószínűleg a galopp-pályán vagy ideiglenes helyszínen futottak. A trotSince ezért 1930 (a legkorábbi megerősített ügetőverseny), de a pálya építése 1952." },
        { name: "Hipodrom Subotica", slug: "hipodrom-subotica", city: "Szabadka (Subotica)", lat: 46.0915, lng: 19.6439, founded: null, status: "active", length: 1020, direction: "left", org: "Srpski Kasački Savez", ownSite: null, operatorSite: "https://www.serbia-trot.org.rs", operatorName: "Srpski Kasački Savez", surface: "zúzalék", finalStraight: 180, note: "Vajdasági versenypálya a magyar határ közelében; galopp és ügető futamoknak egyaránt otthont ad. UKSS műszaki adatok: 1020 m, 180 m célegyenes, talaj: zúzalék." }
    ],
    SVN: [
        { name: "Hipodrom Ljutomer", slug: "hipodrom-ljutomer", city: "Ljutomer", lat: 46.5216, lng: 16.1886, founded: 1874, status: "active", length: 1000, direction: null, org: "Kasaški klub Ljutomer", ownSite: "https://kasaskiklub-ljutomer.si/", operatorSite: "https://kasaska-zveza.si/", operatorName: "Kasaška zveza Slovenije", note: "A SZLOVÉN ÜGETŐSPORT BÖLCSŐJE. Az első ismert kasaška dirka 1874. szeptember 12-én zajlott a Murska-mezőn, a lukavcei kereszttől a ljutomeri Globetka-hídig; a klub 2024-ben ünnepelte 150 éves fennállását. 1000 m-es pálya, fedett lelátóval 1000 néző számára. Évi 6 versenynap; itt rendezik a Slovenski kasaški derbit és a 3 éves kasačok országos bajnokságát. Saját kis múzeummal" },
        { name: "Hipodrom Stožice", slug: "hipodrom-stozice", city: "Ljubljana", lat: 46.0856, lng: 14.5253, founded: 1957, status: "active", length: null, direction: null, org: "Kasaški klub Stožice Ljubljana", ownSite: null, operatorSite: "https://kasaska-zveza.si/", operatorName: "Kasaška zveza Slovenije", note: "1957-ben épült. A főváros ügetőpályája, a Sava folyó mellett. Itt rendezik a Ljubljanska milja nemzetközi futamot, a szlovén ügetőnaptár legerősebb versenyét. 2025 augusztusában itt zajlottak az első versenyek a Kasaška zveza Slovenije új szabályzata szerint. A pálya körül disc-golf, íjászat és játszótér is működik" },
        { name: "Hipodrom Kamnica", slug: "hipodrom-kamnica", city: "Kamnica (Maribor)", lat: 46.5726, lng: 15.6238, founded: null, status: "active", length: 800, direction: null, org: "Konjeniški center Hipodrom Kamnica Maribor", ownSite: "https://www.hipodrom-kamnica.si/", operatorSite: "https://kasaska-zveza.si/", operatorName: "Kasaška zveza Slovenije", note: "96 503 m²-es komplexum a Pohorje-hegység panorámájával; a kasaška pálya külső köre 800 m. Nemzetközi ügetőversenyeknek és díjugratásnak egyaránt otthont ad – itt rendezik a Sredozemski pokal (Mediterrán Kupa) futamot. Évekig alacsony aktivitás után újjáéledt: lovasiskola, Jockey's club étterem, gyerekprogramok" },
        { name: "Hipodrom Šentjernej", slug: "hipodrom-sentjernej", city: "Šentjernej", lat: 45.8374, lng: 15.3350, founded: null, status: "active", length: null, direction: null, org: "Kasaški klub Šentjernej", ownSite: null, operatorSite: "https://kasaska-zveza.si/", operatorName: "Kasaška zveza Slovenije", note: "Alsó-Krajna (Dolenjska) ügetőpályája; a Šampionat Slovenije egyik visszatérő helyszíne. Egy helyi blog szerint a látogatottság az utóbbi években csökkent" },
        { name: "Hipodrom Brege (Krško)", slug: "hipodrom-brege-krsko", city: "Leskovec pri Krškem", lat: 45.9152, lng: 15.5042, founded: null, status: "active", length: 1000, direction: null, org: "Konjeniški klub Posavje Krško", ownSite: null, operatorSite: "https://kasaska-zveza.si/", operatorName: "Kasaška zveza Slovenije", note: "Nyári pálya 1000 m-es körrel, kis lelátóval. Évente jellemzően EGYETLEN versenynapot rendez; az év többi részében más rendezvényeknek ad otthont" },
        { name: "Hipodrom Komenda", slug: "hipodrom-komenda", city: "Komenda", lat: 46.2053, lng: 14.5439, founded: null, status: "active", length: null, direction: null, org: "Konjeniški klub Komenda", ownSite: null, operatorSite: "https://kasaska-zveza.si/", operatorName: "Kasaška zveza Slovenije", note: "Ljubljanától északra; 2025 szeptemberében hét futamot rendezett egyetlen versenynapon, korábbi derbi-győztesekről elnevezett versenyekkel. Mezőgazdasági vásárnak is helyszíne" },
        { name: "Hipodrom Polena", slug: "hipodrom-polena", city: "Lenart v Slovenskih goricah", lat: 46.5737, lng: 15.8244, founded: null, status: "active", length: null, direction: null, org: "Kasaško društvo Slovenske gorice Lenart", ownSite: null, operatorSite: "https://kasaska-zveza.si/", operatorName: "Kasaška zveza Slovenije", note: "A ŠRC Polena sportkomplexum része: a kasaška steza mellett futballpálya, strandröplabda, mászófal és kutyafuttató is található. Ingyenes parkolóval" },
        { name: "Hipodrom Ig (Iška vas)", slug: "hipodrom-ig-iska-vas", city: "Ig", lat: 45.9405, lng: 14.5101, founded: null, status: "active", length: null, direction: null, org: "Konjerejsko društvo Krim", ownSite: null, operatorSite: "https://kasaska-zveza.si/", operatorName: "Kasaška zveza Slovenije", note: "A Ljubljanai-láp (Ljubljansko barje) déli szélén. FIGYELEM: a fenntartó neve Konjerejsko društvo KRIM – több forrás tévesen \"Konjeniško društvo Ig\" néven említi" }
    ],
    CHE: [
        { name: "Hippodrome de Saignelégier", slug: "hippodrome-de-saignelegier", city: "Saignelégier", lat: 47.2533981, lng: 6.9970934, founded: null, status: "active", length: 800, direction: null, org: null, ownSite: "http://www.marcheconcours.ch", operatorSite: "https://suisse-trot.ch/", operatorName: "Suisse Trot", note: "Groupement Hippique du Jura. FIGYELEM: a francia LeTrot is nyilvántartja (azonosító 9727), mert francia versenyeket is rendez – de a pálya SVÁJCI.. Koordináta forrása: Overpass/OSM település (way/230111925) + Nominatim (postai cím). Pálya forrása: Suisse Trot (suisse-trot.ch) hivatalos hippodrom-jegyzék, 2026-07" },
        { name: "Pferderennbahn Schachen Aarau", slug: "pferderennbahn-schachen-aarau", city: "Aarau", lat: 47.391716, lng: 8.028264, founded: null, status: "active", length: 1200, direction: "left", org: "Aargauischer Rennverein (ARV)", ownSite: "http://www.aarauturf.ch", operatorSite: "https://suisse-trot.ch/", operatorName: "Suisse Trot", note: "Balkezes füves pálya, kb. 1200 m, 350 m célegyenessel, 16-18 m szélességgel, 4%-os kanyardőléssel. Ügetőfutamok szalagos rajttal (Bänderstart), emellett síkfutam, gátfutam, vadászverseny és cross-country. Akadályversenyeiről ismert; a pályán vizesárok és mobil Auteuil-gát is van. Évi kb. 4 versenynap. Cím: Schwimmbadstrasse 18, 5001 Aarau. Forrás: Suisse Trot hivatalos pályajegyzék + horseracing.ch (2026-07)" },
        { name: "Parkrennbahn Zürich-Dielsdorf", slug: "parkrennbahn-zurich-dielsdorf", city: "Dielsdorf (Zürich)", lat: 47.4889814, lng: 8.4714242, founded: null, status: "active", length: 1400, direction: "left", org: "Rennverein Zürich (RVZ)", ownSite: "http://www.pferderennen-zuerich.ch", operatorSite: "https://suisse-trot.ch/", operatorName: "Suisse Trot", note: "Balkezes füves parkpálya. Nagy pálya kb. 1400 m, kis pálya kb. 1150 m, külön vadászpályával. Ügetőfutamok szalagos és autós rajttal is, emellett síkfutam és vadászverseny. Évi 3-5 versenynap. Fő futama a Grand Prix Jockey Club. Cím: Neeracherstrasse 20, 8157 Dielsdorf. Forrás: Suisse Trot hivatalos pályajegyzék + horseracing.ch (2026-07)" },
        { name: "Hippodrome IENA Avenches", slug: "hippodrome-iena-avenches", city: "Avenches", lat: 46.8836, lng: 7.0109, founded: null, status: "active", length: null, direction: null, org: "Suisse Trot", ownSite: "https://suisse-trot.ch/", operatorSite: null, operatorName: null, note: "Svájc fő ügetőpályája és a Suisse Trot nemzeti szövetség székhelye. Az IENA (Institut équestre national) területén; póni-ügetőiskolát is működtet gyerekeknek" },
        { name: "Pferderennbahn Frauenfeld", slug: "pferderennbahn-frauenfeld", city: "Frauenfeld", lat: 47.5702, lng: 8.9035, founded: null, status: "active", length: null, direction: null, org: "Suisse Trot", ownSite: null, operatorSite: "https://suisse-trot.ch/", operatorName: "Suisse Trot", note: "Német-svájci versenypálya Thurgau kantonban; vegyes profil" }
    ],
    UKR: [
        { name: "Київський іподром", slug: "kijivskij-ipodrom", city: "Kijev", lat: 50.3755317, lng: 30.4603905, founded: null, status: "active", length: 1600, direction: null, org: null, ownSite: null, operatorSite: null, operatorName: null, note: "Háború alatt is működik, kb. 300 ló. FIGYELEM: légiriadó esetén a látogatóknak el kell hagyniuk a területet.. Koordináta forrása: Nominatim (postai cím) + OpenStreetMap (Nominatim) + Wikipédia (uk) – Київський іподром. Pálya forrása: KP Kijevi Hippodrom hivatalos közlése" },
    ],
    RUS: [
        { name: "Центральный Московский ипподром", slug: "centralnyj-moskovskij-ippodrom", city: "Moszkva", lat: 55.77872, lng: 37.55976, founded: 1834, status: "active", length: null, direction: null, org: null, ownSite: "https://cmh.ru", operatorSite: null, operatorName: "AO Rosippodromy (szövetségi tulajdon)", note: "Az AO \"Rosippodromy\" szövetségi holdinghoz tartozik.. Koordináta forrása: Wikidata Q2382815 + Wikipédia (ru) – Центральный Московский ипподром. Pálya forrása: AO Rosippodromy hivatalos pályajegyzék" },
        { name: "Омский ипподром", slug: "omskij-ippodrom", city: "Omszk", lat: 54.963536, lng: 73.400495, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: null, operatorName: "AO Rosippodromy (szövetségi tulajdon)", note: "Az AO \"Rosippodromy\" szövetségi holdinghoz tartozik.. Koordináta forrása: OpenStreetMap (Nominatim) + Wikipédia (ru) – Омский ипподром. Pálya forrása: AO Rosippodromy hivatalos pályajegyzék" },
    ],
};

const countryMeta = {
    SWE: { name: "Sweden", hasGallop: false, hasTrot: true, flag: "🇸🇪", orgSite: "https://www.travsport.se/", orgSiteLabel: "Svensk Travsport" },
    FRA: { name: "France", hasGallop: true,  hasTrot: true, flag: "🇫🇷", orgSite: "https://www.fnch.fr/", orgSiteLabel: null, orgSiteName: "Fédération Nationale des Courses Hippiques (FNCH)", raceOrgSite: "https://www.letrot.com/", raceOrgLabel: null, raceOrgName: "Société d'Encouragement à l'élevage du Trotteur Français (SETF)" },
    ITA: { name: "Italy",  hasGallop: true,  hasTrot: true, flag: "🇮🇹", orgSite: "https://new.trottoweb.com/", orgSiteLabel: "TrottoWeb – versenynaptár", orgSiteAlt: "https://www.politicheagricole.it/", orgSiteAltLabel: "Masaf" },
    FIN: { name: "Finland", hasGallop: false, hasTrot: true, flag: "🇫🇮", orgSite: "https://www.hippos.fi/", orgSiteLabel: "Suomen Hippos ry" },
    NOR: { name: "Norway",  hasGallop: true,  hasTrot: true, flag: "🇳🇴", orgSite: "https://www.travsport.no/", orgSiteLabel: "Det Norske Travselskap (DNT)" },
    POL: { name: "Poland", hasGallop: true, hasTrot: true, flag: "🇵🇱", orgSite: "https://pkwk.org/", orgSiteLabel: "Polski Klub Wyścigów Konnych" },
    CZE: { name: "Czech Republic", hasGallop: true, hasTrot: true, flag: "🇨🇿", orgSite: "http://www.czetra.cz/", orgSiteLabel: "Česká Klusácká Asociace" },
    SVK: { name: "Slovakia", hasGallop: true, hasTrot: true, flag: "🇸🇰", orgSite: "https://www.harness.sk/", orgSiteLabel: "Trotting Slovakia" },
    HUN: { name: "Hungary", hasGallop: true, hasTrot: true, flag: "🇭🇺", orgSite: "https://kincsempark.hu/", orgSiteLabel: "Kincsem Park" },
    EST: { name: "Estonia", hasGallop: false, hasTrot: true, flag: "🇪🇪", orgSite: "https://www.hipodroom.ee/", orgSiteLabel: "Eesti Traaviliit MTÜ" },
    USA: { name: "United States", hasGallop: true, hasTrot: true, flag: "🇺🇸", orgSite: "https://www.ustrotting.com/", orgSiteLabel: "USTA (United States Trotting Association)" },
    CAN: { name: "Canada", hasGallop: true, hasTrot: true, flag: "🇨🇦", orgSite: "https://standardbredcanada.ca/", orgSiteLabel: "Standardbred Canada" },
    AUS: { name: "Australia", hasGallop: true, hasTrot: true, flag: "🇦🇺", orgSite: "https://www.harness.org.au/", orgSiteLabel: "Harness Racing Australia" },
    NZL: { name: "New Zealand", hasGallop: true, hasTrot: true, flag: "🇳🇿", orgSite: "https://hrnz.co.nz/", orgSiteLabel: "Harness Racing New Zealand" },
    DNK: { name: "Denmark", hasGallop: true, hasTrot: true, flag: "🇩🇰", orgSite: "https://www.trav.dk/", orgSiteLabel: "Dansk Travsports Centralforbund" },
    DEU: { name: "Germany", hasGallop: true, hasTrot: true, flag: "🇩🇪", orgSite: "https://www.hvtonline.de/", orgSiteLabel: "HVT (Hauptverband für Traberzucht)" },
    AUT: { name: "Austria", hasGallop: true, hasTrot: true, flag: "🇦🇹", orgSite: "https://www.krieau.at/", orgSiteLabel: "Wiener Trabrenn-Verein" },
    NLD: { name: "Netherlands", hasGallop: true, hasTrot: true, flag: "🇳🇱", orgSite: "https://www.victoriaparkwolvega.nl/", orgSiteLabel: "Victoria Park Wolvega" },
    ESP: { name: "Spain", hasGallop: true, hasTrot: true, flag: "🇪🇸", orgSite: "https://www.federaciobaleardetrot.com/", orgSiteLabel: "Federació Balear de Trot" },
    BEL: { name: "Belgium", hasGallop: true, hasTrot: true, flag: "🇧🇪", orgSite: "https://www.trotting.be", orgSiteLabel: "Fédération Belge des Courses Hippiques" },
    GBR: { name: "Great Britain", hasGallop: true, hasTrot: true, flag: "🇬🇧", orgSite: "https://www.trotbritaingb.com/", orgSiteLabel: "Trot Britain" },
    IRL: { name: "Ireland", hasGallop: true, hasTrot: true, flag: "🇮🇪", orgSite: "https://www.irishharnessracing.com", orgSiteLabel: "Irish Harness Racing Association" },
    LTU: { name: "Lithuania", hasGallop: false, hasTrot: true, flag: "🇱🇹", orgSite: "https://www.ristunusportas.lt", orgSiteLabel: "Lithuania National Trotting League" },
    MLT: { name: "Malta", hasGallop: false, hasTrot: true, flag: "🇲🇹", orgSite: "https://www.maltaracingclub.com", orgSiteLabel: "Malta Racing Club" },
    ROU: { name: "Romania", hasGallop: true, hasTrot: true, flag: "🇷🇴", orgSite: "https://www.trapas.ro/", orgSiteLabel: "Asociația Calului de Trap" },
    SRB: { name: "Serbia", hasGallop: true, hasTrot: true, flag: "🇷🇸", orgSite: "https://www.serbia-trot.org.rs", orgSiteLabel: "Srpski Kasački Savez" },
    SVN: { name: "Slovenia", hasGallop: false, hasTrot: true, flag: "🇸🇮", orgSite: "https://kasaska-zveza.si/", orgSiteLabel: "Kasaška zveza Slovenije" },
    CHE: { name: "Switzerland", hasGallop: true, hasTrot: true, flag: "🇨🇭", orgSite: "https://suisse-trot.ch/", orgSiteLabel: "Suisse Trot" },
    UKR: { name: "Ukraine", hasGallop: true, hasTrot: true, flag: "\u{1F1FA}\u{1F1E6}", orgSite: null, orgSiteLabel: "KP Kyivskyi Ippodrom" },
    RUS: { name: "Russia", hasGallop: true, hasTrot: true, flag: "\u{1F1F7}\u{1F1FA}", orgSite: "https://rosippodromy.ru/", orgSiteLabel: "AO Rosippodromy" },
};


/* ==========================================================
   2. SZAKASZ – LOGIKA
   ========================================================== */

// A státusz-feliratok itt, a logika ELEJÉN vannak definiálva, hogy
// egy későbbi hiba (pl. a földgömb betöltésénél) ne akadályozza meg
// a menük működését. Korábban ez a lenti sorokban volt, és egy
// földgömb-hiba miatt inicializálatlan maradt.
/* ============================================================
   ADATLAP-SZÓTÁR  (popup, pályalista, státuszok)
   ------------------------------------------------------------
   Korábban ezek a feliratok MAGYARUL voltak beégetve a kódba,
   így egy angol vagy német látogató is magyar mezőneveket látott.
   Itt egy helyen, nyelvenként állnak.

   FONTOS: a PÁLYANEVEKET soha nem fordítjuk – csak a mezőneveket,
   státuszokat és irányokat. A pálya neve az adat része.
   ============================================================ */
/* ============================================================
   RÓLUNK / KONTAKT SZÖVEGEK
   ------------------------------------------------------------
   Korábban ez a két szöveg az index.html-be volt beégetve,
   MAGYARUL – vagyis egy angol vagy japán látogató is magyar
   szöveget kapott. Itt most mind a tíz nyelven áll.

   A pályaszám és az országszám {p} és {o} helyőrzővel szerepel,
   és FUTÁSIDŐBEN, a trackDatabase-ből számolódik. Így soha nem
   avul el: a korábbi szövegben "27 ország 230 pályája" állt,
   miközben már 30 ország 523 pályája volt az adatbázisban.
   ============================================================ */
const INFO_SZOTAR = {
    hu: {
        about: "Rólunk",
        contact: "Kontakt",
        p1: "A <b>Racecourse360</b> célja, hogy egyetlen, könnyen áttekinthető térképen mutassa be a nemzetközi ügetőversenypályákat – azok elhelyezkedését, alapadatait, működési státuszát és történetét.",
        p2: "Jelenleg <b>{o} ország {p} versenypályája</b> szerepel az adatbázisunkban, Skandináviától Ausztráliáig. Minden adatot nyilvánosan elérhető forrásokból (nemzeti ügetőszövetségek, a UET tagnyilvántartása, hivatalos pályalisták, sajtó) gyűjtünk össze, több forrás kereszthivatkozásával, saját szerkesztésben.",
        p3: "Az adatbázis folyamatosan épül és pontosodik. A pályák státuszát négy szinten jelöljük – aktív, felfüggesztett, ellenőrzés alatt, illetve véglegesen bezárt. Ahol egy adat nem megerősített, azt inkább jelöljük, mint hogy pontatlanságot közöljünk.",
        p4: "<b>Független oldal.</b> Nem állunk kapcsolatban a bemutatott versenypályákkal, üzemeltetőkkel vagy szövetségekkel. A hivatalos versenynaptárakért mindig az adott pálya saját honlapja az irányadó.",
        cGen: "Általános megkeresés, adatjavítás, együttműködés",
        cPriv: "Adatvédelem, GDPR-kérelmek",
        cOp: "Üzemeltető",
        cNote: "Ha egy pálya adatában pontatlanságot talál, vagy hiányzó pályát szeretne jelezni, kérjük, írjon nekünk – a visszajelzéseket köszönettel fogadjuk és beépítjük."
    },
    en: {
        about: "About us",
        contact: "Contact",
        p1: "<b>Racecourse360</b> sets out to present the world's harness racing tracks on a single, clear map – their location, key facts, operating status and history.",
        p2: "The database currently covers <b>{p} racecourses in {o} countries</b>, from Scandinavia to Australia. All data is compiled from publicly available sources (national trotting federations, the UET membership register, official track lists, press), cross-referenced across several sources and edited in-house.",
        p3: "The database is continually growing and being refined. Track status is recorded at four levels – active, suspended, under verification, and permanently closed. Where a fact is not confirmed, we mark it as such rather than publish something inaccurate.",
        p4: "<b>An independent site.</b> We are not affiliated with the racecourses, operators or federations listed here. For official race calendars, the track's own website is always authoritative.",
        cGen: "General enquiries, corrections, partnerships",
        cPriv: "Privacy, GDPR requests",
        cOp: "Operator",
        cNote: "If you spot an inaccuracy or know of a track we have missed, please write to us – feedback is very welcome and we act on it."
    },
    de: {
        about: "Über uns",
        contact: "Kontakt",
        p1: "<b>Racecourse360</b> zeigt die Trabrennbahnen der Welt auf einer einzigen, übersichtlichen Karte – Lage, Eckdaten, Betriebsstatus und Geschichte.",
        p2: "Derzeit umfasst die Datenbank <b>{p} Rennbahnen in {o} Ländern</b>, von Skandinavien bis Australien. Alle Angaben stammen aus öffentlich zugänglichen Quellen (nationale Trabrennverbände, UET-Mitgliederverzeichnis, offizielle Bahnlisten, Presse), mehrfach abgeglichen und redaktionell aufbereitet.",
        p3: "Die Datenbank wächst und wird laufend präzisiert. Der Status wird auf vier Stufen erfasst – aktiv, ausgesetzt, in Prüfung, dauerhaft geschlossen. Nicht bestätigte Angaben kennzeichnen wir lieber, als Ungenaues zu veröffentlichen.",
        p4: "<b>Unabhängige Seite.</b> Wir stehen in keiner Verbindung zu den aufgeführten Bahnen, Betreibern oder Verbänden. Für offizielle Rennkalender ist stets die Website der jeweiligen Bahn maßgeblich.",
        cGen: "Allgemeine Anfragen, Korrekturen, Kooperationen",
        cPriv: "Datenschutz, DSGVO-Anfragen",
        cOp: "Betreiber",
        cNote: "Wenn Ihnen eine Ungenauigkeit auffällt oder eine Bahn fehlt, schreiben Sie uns bitte – wir freuen uns über Rückmeldungen und arbeiten sie ein."
    },
    fr: {
        about: "À propos",
        contact: "Contact",
        p1: "<b>Racecourse360</b> présente les hippodromes de trot du monde entier sur une seule carte claire – situation, données clés, statut d'exploitation et histoire.",
        p2: "La base couvre actuellement <b>{p} hippodromes dans {o} pays</b>, de la Scandinavie à l'Australie. Toutes les données proviennent de sources publiques (fédérations nationales de trot, registre des membres de l'UET, listes officielles, presse), recoupées et éditées par nos soins.",
        p3: "La base s'enrichit et se précise en continu. Le statut est indiqué à quatre niveaux – en activité, suspendu, à vérifier, définitivement fermé. Lorsqu'une donnée n'est pas confirmée, nous préférons le signaler plutôt que publier une information inexacte.",
        p4: "<b>Site indépendant.</b> Nous ne sommes affiliés à aucun des hippodromes, exploitants ou fédérations cités. Pour les calendriers officiels, le site de l'hippodrome fait toujours foi.",
        cGen: "Demandes générales, corrections, partenariats",
        cPriv: "Confidentialité, demandes RGPD",
        cOp: "Exploitant",
        cNote: "Si vous constatez une inexactitude ou connaissez un hippodrome manquant, écrivez-nous – vos retours sont les bienvenus et pris en compte."
    },
    sv: {
        about: "Om oss",
        contact: "Kontakt",
        p1: "<b>Racecourse360</b> visar världens travbanor på en enda överskådlig karta – läge, fakta, driftstatus och historia.",
        p2: "Databasen omfattar för närvarande <b>{p} banor i {o} länder</b>, från Skandinavien till Australien. Alla uppgifter är hämtade från offentliga källor (nationella travförbund, UET:s medlemsregister, officiella banlistor, press), korsrefererade och redigerade av oss.",
        p3: "Databasen byggs ut och förfinas löpande. Status anges på fyra nivåer – aktiv, pausad, under kontroll och permanent stängd. När en uppgift inte är bekräftad markerar vi det hellre än publicerar något oriktigt.",
        p4: "<b>Oberoende sajt.</b> Vi har ingen koppling till banorna, operatörerna eller förbunden som nämns. För officiella tävlingskalendrar gäller alltid banans egen webbplats.",
        cGen: "Allmänna frågor, rättelser, samarbeten",
        cPriv: "Integritet, GDPR-förfrågningar",
        cOp: "Operatör",
        cNote: "Om du hittar ett fel eller känner till en bana som saknas, hör gärna av dig – vi tar tacksamt emot återkoppling."
    },
    es: {
        about: "Sobre nosotros",
        contact: "Contacto",
        p1: "<b>Racecourse360</b> presenta los hipódromos de trote del mundo en un único mapa claro: ubicación, datos clave, estado operativo e historia.",
        p2: "La base de datos abarca actualmente <b>{p} hipódromos en {o} países</b>, de Escandinavia a Australia. Todos los datos proceden de fuentes públicas (federaciones nacionales de trote, registro de miembros de la UET, listas oficiales, prensa), contrastados y editados por nosotros.",
        p3: "La base crece y se precisa continuamente. El estado se indica en cuatro niveles: activo, suspendido, en verificación y cerrado definitivamente. Cuando un dato no está confirmado, preferimos señalarlo antes que publicar algo inexacto.",
        p4: "<b>Sitio independiente.</b> No estamos afiliados a los hipódromos, operadores ni federaciones mencionados. Para los calendarios oficiales, la web del hipódromo es siempre la referencia.",
        cGen: "Consultas generales, correcciones, colaboraciones",
        cPriv: "Privacidad, solicitudes RGPD",
        cOp: "Operador",
        cNote: "Si detecta una inexactitud o conoce un hipódromo que falte, escríbanos: agradecemos los comentarios y los incorporamos."
    },
    it: {
        about: "Chi siamo",
        contact: "Contatti",
        p1: "<b>Racecourse360</b> presenta gli ippodromi del trotto di tutto il mondo su un'unica mappa chiara: posizione, dati principali, stato operativo e storia.",
        p2: "La banca dati comprende attualmente <b>{p} ippodromi in {o} paesi</b>, dalla Scandinavia all'Australia. Tutti i dati provengono da fonti pubbliche (federazioni nazionali del trotto, registro soci UET, elenchi ufficiali, stampa), verificati su più fonti e curati da noi.",
        p3: "La banca dati cresce e si affina di continuo. Lo stato è indicato su quattro livelli: attivo, sospeso, in verifica e chiuso definitivamente. Quando un dato non è confermato, preferiamo segnalarlo piuttosto che pubblicare informazioni imprecise.",
        p4: "<b>Sito indipendente.</b> Non siamo affiliati agli ippodromi, ai gestori o alle federazioni citati. Per i calendari ufficiali fa sempre fede il sito dell'ippodromo.",
        cGen: "Richieste generali, correzioni, collaborazioni",
        cPriv: "Privacy, richieste GDPR",
        cOp: "Gestore",
        cNote: "Se nota un'imprecisione o conosce un ippodromo mancante, ci scriva: i riscontri sono benvenuti e vengono recepiti."
    },
    ja: {
        about: "私たちについて",
        contact: "お問い合わせ",
        p1: "<b>Racecourse360</b> は、世界の繋駕速歩競走場を一枚の見やすい地図にまとめています。所在地、基本データ、開催状況、そして歴史。",
        p2: "現在、データベースには<b>{o}か国の{p}競走場</b>が収録されています（北欧からオーストラリアまで）。すべてのデータは公開情報（各国速歩競走連盟、UET会員名簿、公式競走場一覧、報道）から収集し、複数の情報源で照合のうえ独自に編集しています。",
        p3: "データベースは継続的に拡充・精査されています。開催状況は4段階（開催中・休止中・確認中・閉鎖）で示します。未確認の情報は、不正確な内容を掲載するより、その旨を明示する方針です。",
        p4: "<b>独立したサイトです。</b> 掲載している競走場・運営者・連盟とは一切関係がありません。公式の開催日程は、必ず各競走場の公式サイトをご確認ください。",
        cGen: "一般のお問い合わせ・データ訂正・協業",
        cPriv: "プライバシー、GDPR に関するご請求",
        cOp: "運営者",
        cNote: "データの誤りにお気づきの場合、または未掲載の競走場をご存じの場合は、ぜひご連絡ください。ご意見は歓迎し、反映いたします。"
    },
    zh: {
        about: "关于我们",
        contact: "联系我们",
        p1: "<b>Racecourse360</b> 旨在用一张清晰的地图呈现全球轻驾车赛马场——位置、基本资料、运营状态与历史。",
        p2: "数据库目前收录<b>{o}个国家的{p}处赛马场</b>，从北欧到澳大利亚。所有资料均来自公开来源（各国轻驾车赛马协会、UET 会员名录、官方赛马场名单、新闻报道），经多方交叉核对并由我们自行编辑。",
        p3: "数据库持续扩充与完善。赛马场状态分为四级：运营中、暂停、待核实、已永久关闭。若某项资料未获确认，我们宁可标注说明，也不发布不准确的内容。",
        p4: "<b>独立网站。</b> 我们与所列赛马场、运营方或协会均无隶属关系。官方赛程请以各赛马场自身网站为准。",
        cGen: "一般咨询、资料更正、合作",
        cPriv: "隐私与 GDPR 请求",
        cOp: "运营方",
        cNote: "若您发现资料有误，或知道尚未收录的赛马场，欢迎与我们联系——我们感谢并会采纳您的反馈。"
    },
    ar: {
        about: "من نحن",
        contact: "اتصل بنا",
        p1: "يهدف <b>Racecourse360</b> إلى عرض مضامير سباق الهرولة حول العالم على خريطة واحدة واضحة – الموقع والبيانات الأساسية وحالة التشغيل والتاريخ.",
        p2: "تضم قاعدة البيانات حاليًا <b>{p} مضمارًا في {o} دولة</b>، من إسكندنافيا إلى أستراليا. جُمعت جميع البيانات من مصادر متاحة للجمهور (الاتحادات الوطنية، سجل أعضاء UET، القوائم الرسمية، الصحافة)، مع المقارنة بين عدة مصادر وتحريرها داخليًا.",
        p3: "تتوسع قاعدة البيانات وتزداد دقة باستمرار. تُسجَّل الحالة على أربعة مستويات: نشط، متوقف مؤقتًا، قيد التحقق، ومغلق نهائيًا. وحين لا تكون المعلومة مؤكدة، نفضّل الإشارة إلى ذلك بدل نشر معلومة غير دقيقة.",
        p4: "<b>موقع مستقل.</b> لا تربطنا أي صلة بالمضامير أو المشغّلين أو الاتحادات المذكورة. وللاطلاع على الروزنامة الرسمية، يبقى موقع المضمار نفسه هو المرجع.",
        cGen: "الاستفسارات العامة والتصحيحات والشراكات",
        cPriv: "الخصوصية وطلبات اللائحة العامة لحماية البيانات",
        cOp: "المشغّل",
        cNote: "إذا لاحظت خطأً أو كنت تعرف مضمارًا غير مُدرَج، فيرجى مراسلتنا – نرحّب بالملاحظات ونأخذها بعين الاعتبار."
    }
};

/** Az aktuális ország- és pályaszám az adatbázisból. */
function adatSzamok() {
    const isok = Object.keys(trackDatabase);
    return { o: isok.length, p: isok.reduce((n, i) => n + trackDatabase[i].length, 0) };
}

/** Egy INFO szöveg lekérése, a helyőrzők behelyettesítésével. */
function info(kulcs) {
    const d = INFO_SZOTAR[aktualisNyelv] || INFO_SZOTAR.en;
    const sz = (d && d[kulcs] !== undefined) ? d[kulcs] : (INFO_SZOTAR.en[kulcs] || '');
    const n = adatSzamok();
    return sz.replace('{o}', n.o).replace('{p}', n.p);
}

/** A Rólunk / Kontakt modal tartalmának felépítése az aktuális nyelven. */
function infoModalFrissit() {
    const EMAIL_INFO = 'info@racecourse360.com';
    const EMAIL_PRIV = 'privacy@racecourse360.com';
    const CEG = 'Candidus Solution Kft.<br>2040 Budaörs, Domb utca 14.<br>Magyarország';

    const fulAbout = document.getElementById('infoTabAbout');
    const fulContact = document.getElementById('infoTabContact');
    if (fulAbout) fulAbout.textContent = info('about');
    if (fulContact) fulContact.textContent = info('contact');

    const a = document.querySelector('[data-info="about"]');
    if (a) a.innerHTML =
        `<h2>${info('about')}</h2>` +
        `<p>${info('p1')}</p><p>${info('p2')}</p>` +
        `<p>${info('p3')}</p><p>${info('p4')}</p>` +
        `<p><b>${info('cOp')}:</b> Candidus Solution Kft. (2040 Budaörs, Domb utca 14.)</p>` +
        `<p style="margin-top:14px;font-size:0.8rem;color:#94a3b8;">${info('cNote')} ` +
        `<a href="mailto:${EMAIL_INFO}">${EMAIL_INFO}</a></p>`;

    const c = document.querySelector('[data-info="contact"]');
    if (c) c.innerHTML =
        `<h2>${info('contact')}</h2>` +
        `<p><b>${info('cGen')}:</b><br><a href="mailto:${EMAIL_INFO}">${EMAIL_INFO}</a></p>` +
        `<p><b>${info('cPriv')}:</b><br><a href="mailto:${EMAIL_PRIV}">${EMAIL_PRIV}</a></p>` +
        `<p><b>${info('cOp')}:</b><br>${CEG}</p>` +
        `<p style="margin-top:14px;font-size:0.8rem;color:#94a3b8;">${info('cNote')}</p>`;
}

const ADATLAP_SZOTAR = {
    hu: { menuTracks: "Pályák", city: "Település", region: "Régió", founded: "Alapítás éve", length: "Pálya hossza", direction: "Irány", dirLeft: "balra", dirRight: "jobbra", surface: "Pálya talaja", ownSite: "Pálya honlapja", operatorSite: "Üzemeltető honlapja", org: "Szervezet", status: "Státusz", stActive: "Aktív", stInactive: "Inaktív / felfüggesztve", stUnknown: "Ismeretlen – ellenőrzendő", stClosed: "Véglegesen bezárt", detailPage: "Részletes adatlap", globeLink: "Megnézem a földgömbön", countries: "Országok", history: "Történelem", historyOf: "ügetősport története", trackWord: "ügetőpálya", dirLeftLong: "balkéz (óramutatóval ellentétes)", dirRightLong: "jobbkéz (óramutató szerinti)", sfGrass: "fű", sfSand: "homok", sfCinder: "salak", sfGravel: "zúzalék", sfPozzolana: "puccolán", orgNational: "Országos szervezet", orgRacing: "Versenyek szervezése", orgGeneric: "Versenyszervezet", noOwnSite: "nincs saját honlap", noExact: "nincs pontos adat", trotSince: "ügetőverseny {} óta", na: "nincs adat" },
    en: { menuTracks: "Tracks", city: "Town", region: "Region", founded: "Founded", length: "Track length", direction: "Direction", dirLeft: "left-handed", dirRight: "right-handed", surface: "Track surface", ownSite: "Track website", operatorSite: "Operator website", org: "Organisation", status: "Status", stActive: "Active", stInactive: "Inactive / suspended", stUnknown: "Unknown – to be verified", stClosed: "Permanently closed", detailPage: "Full details", globeLink: "View on the globe", countries: "Countries", history: "History", historyOf: "harness racing history", trackWord: "harness racing track", dirLeftLong: "left-handed (anti-clockwise)", dirRightLong: "right-handed (clockwise)", sfGrass: "turf", sfSand: "sand", sfCinder: "cinder", sfGravel: "crushed stone", sfPozzolana: "pozzolana", orgNational: "National body", orgRacing: "Racing organiser", orgGeneric: "Racing body", noOwnSite: "no dedicated website", noExact: "no exact data", trotSince: "harness racing since {}", na: "no data" },
    de: { menuTracks: "Bahnen", city: "Ort", region: "Region", founded: "Gegründet", length: "Bahnlänge", direction: "Laufrichtung", dirLeft: "linksherum", dirRight: "rechtsherum", surface: "Bahnbelag", ownSite: "Website der Bahn", operatorSite: "Website des Betreibers", org: "Verband", status: "Status", stActive: "Aktiv", stInactive: "Inaktiv / ausgesetzt", stUnknown: "Unbekannt – zu prüfen", stClosed: "Dauerhaft geschlossen", detailPage: "Vollständige Daten", globeLink: "Auf dem Globus ansehen", countries: "Länder", history: "Geschichte", historyOf: "Geschichte des Trabrennsports", trackWord: "Trabrennbahn", dirLeftLong: "linksherum (gegen den Uhrzeigersinn)", dirRightLong: "rechtsherum (im Uhrzeigersinn)", sfGrass: "Gras", sfSand: "Sand", sfCinder: "Schlacke", sfGravel: "Schotter", sfPozzolana: "Puzzolanerde", orgNational: "Nationaler Verband", orgRacing: "Rennveranstalter", orgGeneric: "Rennverband", noOwnSite: "keine eigene Website", noExact: "keine genauen Angaben", trotSince: "Trabrennen seit {}", na: "keine Angabe" },
    fr: { menuTracks: "Hippodromes", city: "Commune", region: "Région", founded: "Fondé en", length: "Longueur de la piste", direction: "Sens de course", dirLeft: "main gauche", dirRight: "main droite", surface: "Nature de la piste", ownSite: "Site de l'hippodrome", operatorSite: "Site de l'exploitant", org: "Organisation", status: "Statut", stActive: "En activité", stInactive: "Inactif / suspendu", stUnknown: "Inconnu – à vérifier", stClosed: "Définitivement fermé", detailPage: "Fiche détaillée", globeLink: "Voir sur le globe", countries: "Pays", history: "Histoire", historyOf: "histoire du trot", trackWord: "hippodrome de trot", dirLeftLong: "main gauche (sens antihoraire)", dirRightLong: "main droite (sens horaire)", sfGrass: "herbe", sfSand: "sable", sfCinder: "cendrée", sfGravel: "gravillon", sfPozzolana: "pouzzolane", orgNational: "Organisme national", orgRacing: "Organisateur des courses", orgGeneric: "Organisme de courses", noOwnSite: "pas de site propre", noExact: "donnée exacte inconnue", trotSince: "courses de trot depuis {}", na: "non renseigné" },
    sv: { menuTracks: "Banor", city: "Ort", region: "Region", founded: "Grundad", length: "Banlängd", direction: "Löpriktning", dirLeft: "vänster", dirRight: "höger", surface: "Banunderlag", ownSite: "Banans webbplats", operatorSite: "Operatörens webbplats", org: "Organisation", status: "Status", stActive: "Aktiv", stInactive: "Inaktiv / pausad", stUnknown: "Okänd – behöver kontrolleras", stClosed: "Permanent stängd", detailPage: "Fullständig information", globeLink: "Visa på jordgloben", countries: "Länder", history: "Historia", historyOf: "travsportens historia", trackWord: "travbana", dirLeftLong: "vänster (moturs)", dirRightLong: "höger (medurs)", sfGrass: "gräs", sfSand: "sand", sfCinder: "slagg", sfGravel: "grus", sfPozzolana: "pozzolan", orgNational: "Nationellt förbund", orgRacing: "Tävlingsarrangör", orgGeneric: "Tävlingsorganisation", noOwnSite: "ingen egen webbplats", noExact: "exakt uppgift saknas", trotSince: "travlopp sedan {}", na: "uppgift saknas" },
    es: { menuTracks: "Hipódromos", city: "Localidad", region: "Región", founded: "Fundado en", length: "Longitud de la pista", direction: "Sentido de carrera", dirLeft: "a izquierdas", dirRight: "a derechas", surface: "Superficie", ownSite: "Sitio web del hipódromo", operatorSite: "Sitio web del operador", org: "Organización", status: "Estado", stActive: "Activo", stInactive: "Inactivo / suspendido", stUnknown: "Desconocido – por verificar", stClosed: "Cerrado definitivamente", detailPage: "Ficha completa", globeLink: "Ver en el globo", countries: "Países", history: "Historia", historyOf: "historia del trote", trackWord: "hipódromo de trote", dirLeftLong: "a izquierdas (sentido antihorario)", dirRightLong: "a derechas (sentido horario)", sfGrass: "hierba", sfSand: "arena", sfCinder: "ceniza", sfGravel: "grava", sfPozzolana: "puzolana", orgNational: "Organismo nacional", orgRacing: "Organizador de carreras", orgGeneric: "Organismo de carreras", noOwnSite: "sin sitio propio", noExact: "sin dato exacto", trotSince: "carreras de trote desde {}", na: "sin datos" },
    it: { menuTracks: "Ippodromi", city: "Località", region: "Regione", founded: "Fondato nel", length: "Lunghezza della pista", direction: "Senso di marcia", dirLeft: "sinistrorso", dirRight: "destrorso", surface: "Fondo della pista", ownSite: "Sito dell'ippodromo", operatorSite: "Sito del gestore", org: "Organizzazione", status: "Stato", stActive: "Attivo", stInactive: "Inattivo / sospeso", stUnknown: "Sconosciuto – da verificare", stClosed: "Chiuso definitivamente", detailPage: "Scheda completa", globeLink: "Vedi sul globo", countries: "Paesi", history: "Storia", historyOf: "storia del trotto", trackWord: "ippodromo del trotto", dirLeftLong: "sinistrorso (antiorario)", dirRightLong: "destrorso (orario)", sfGrass: "erba", sfSand: "sabbia", sfCinder: "scoria", sfGravel: "pietrisco", sfPozzolana: "pozzolana", orgNational: "Ente nazionale", orgRacing: "Organizzatore delle corse", orgGeneric: "Organismo delle corse", noOwnSite: "nessun sito proprio", noExact: "dato esatto non disponibile", trotSince: "corse al trotto dal {}", na: "dato non disponibile" },
    ja: { menuTracks: "競馬場", city: "所在地", region: "地域", founded: "開設年", length: "走路の長さ", direction: "走行方向", dirLeft: "左回り", dirRight: "右回り", surface: "走路面", ownSite: "競馬場の公式サイト", operatorSite: "運営者のサイト", org: "団体", status: "状況", stActive: "開催中", stInactive: "休止中", stUnknown: "不明 – 要確認", stClosed: "閉鎖", detailPage: "詳細データ", globeLink: "地球儀で見る", countries: "国", history: "歴史", historyOf: "繋駕速歩競走の歴史", trackWord: "繋駕速歩競走場", dirLeftLong: "左回り（反時計回り）", dirRightLong: "右回り（時計回り）", sfGrass: "芝", sfSand: "砂", sfCinder: "シンダー", sfGravel: "砕石", sfPozzolana: "ポッツォラーナ", orgNational: "統括団体", orgRacing: "競走主催", orgGeneric: "競走団体", noOwnSite: "公式サイトなし", noExact: "正確なデータなし", trotSince: "{}年から繋駕速歩競走", na: "データなし" },
    zh: { menuTracks: "赛马场", city: "所在地", region: "地区", founded: "建立年份", length: "赛道长度", direction: "跑行方向", dirLeft: "左转", dirRight: "右转", surface: "赛道地面", ownSite: "赛马场网站", operatorSite: "运营方网站", org: "组织", status: "状态", stActive: "运营中", stInactive: "暂停运营", stUnknown: "未知 – 待核实", stClosed: "已永久关闭", detailPage: "详细资料", globeLink: "在地球仪上查看", countries: "国家", history: "历史", historyOf: "轻驾车赛马历史", trackWord: "轻驾车赛马场", dirLeftLong: "左转（逆时针）", dirRightLong: "右转（顺时针）", sfGrass: "草地", sfSand: "沙地", sfCinder: "煤渣", sfGravel: "碎石", sfPozzolana: "火山灰", orgNational: "全国机构", orgRacing: "赛事组织", orgGeneric: "赛事机构", noOwnSite: "无独立网站", noExact: "无确切数据", trotSince: "自{}年起举办轻驾车赛马", na: "暂无数据" },
    ar: { menuTracks: "المضامير", city: "البلدة", region: "المنطقة", founded: "سنة التأسيس", length: "طول المضمار", direction: "اتجاه السباق", dirLeft: "يسار", dirRight: "يمين", surface: "أرضية المضمار", ownSite: "موقع المضمار", operatorSite: "موقع المشغّل", org: "الهيئة", status: "الحالة", stActive: "نشط", stInactive: "متوقف مؤقتًا", stUnknown: "غير معروف – قيد التحقق", stClosed: "مغلق نهائيًا", detailPage: "التفاصيل الكاملة", globeLink: "عرض على الكرة الأرضية", countries: "الدول", history: "التاريخ", historyOf: "تاريخ سباق الهرولة", trackWord: "مضمار سباق الهرولة", dirLeftLong: "يسار (عكس عقارب الساعة)", dirRightLong: "يمين (مع عقارب الساعة)", sfGrass: "عشب", sfSand: "رمل", sfCinder: "خبث", sfGravel: "حصى", sfPozzolana: "البوزولانا", orgNational: "الهيئة الوطنية", orgRacing: "منظّم السباقات", orgGeneric: "هيئة السباقات", noOwnSite: "لا يوجد موقع خاص", noExact: "لا توجد بيانات دقيقة", trotSince: "سباقات الهرولة منذ {}", na: "لا توجد بيانات" }
};

/** Egy felirat lekérése az aktuális nyelven. Hiány esetén angolra esik vissza. */
function ui(kulcs) {
    const d = ADATLAP_SZOTAR[aktualisNyelv] || ADATLAP_SZOTAR.en;
    return (d && d[kulcs] !== undefined) ? d[kulcs] : (ADATLAP_SZOTAR.en[kulcs] || '');
}

/* A státuszfeliratok FÜGGVÉNNYEL készülnek, nem konstansként.
   Ha konstans lenne, a betöltéskori nyelven ragadna, és későbbi
   nyelvváltáskor magyarul maradna. */
function statuszSzoveg(kulcs) {
    const map = {
        active:   { szotar: 'stActive',   cls: 'st-active' },
        inactive: { szotar: 'stInactive', cls: 'st-inactive' },
        unknown:  { szotar: 'stUnknown',  cls: 'st-unknown' },
        closed:   { szotar: 'stClosed',   cls: 'st-closed' }
    };
    const e = map[kulcs] || map.active;
    return { label: ui(e.szotar), cls: e.cls };
}

// ================================================================
// 1) PÁLYA-ADATBÁZIS
// ================================================================
const DATA_ISO_CODES = Object.keys(trackDatabase); // ["SWE", "FRA"]

let currentFilter = 'all';

/**
 * Van-e ténylegesen kiválasztott szakág?
 *
 * A currentFilter alapértéke 'all', ami NEM azt jelenti, hogy minden
 * szakág aktív – hanem hogy egyik sincs kiválasztva. Ez a névválasztás
 * félrevezető volt, és okozott is hibát: a 2D térkép szakágválasztás
 * nélkül is felugrott. Ez a függvény egy helyre gyűjti a vizsgálatot.
 */
function vanSzakag() {
    return currentFilter === 'trot' || currentFilter === 'gallop';
}
let currentIso = null;

// ================================================================
// 2) ORSZÁG-AZONOSÍTÁS JAVÍTVA
// A Natural Earth 110m GeoJSON-ban Franciaországnál (és néhány más
// országnál) az ISO_A3 mező hibásan "-99" lehet a helyes "FRA" helyett
// (ismert, dokumentált adathiba a tengerentúli megyék miatt). Ezért
// az ADM0_A3 mezőt is megnézzük tartalék azonosítóként.
// ================================================================
function resolveIso(properties) {
    if (properties.ISO_A3 && properties.ISO_A3 !== '-99') return properties.ISO_A3;
    if (properties.ADM0_A3 && properties.ADM0_A3 !== '-99') return properties.ADM0_A3;
    return properties.ISO_A3; // ha semmi nem jó, marad az eredeti (lehet "-99")
}

// ================================================================
// 3) 3D FÖLDGÖMB
// ================================================================

// A látogató saját eszközének helyi ideje alapján döntjük el, hogy
// nappali (világos) vagy éjszakai (sötét) Föld-textúrát mutatunk.
// 6:00-18:00 között nappali, egyébként éjszakai textúra.
// ==========================================================
// FÖLDGÖMB TEXTÚRÁK
// ==========================================================
// Mind NASA-eredetű KÖZKINCS (public domain) kép, a three-globe
// CDN-jéről – ingyenes, kereskedelmi célra is használható.
//
// IGAZOLT fájlnevek (a globe.gl SAJÁT hivatalos példájában
// szerepelnek, ezért biztosan léteznek):
//   earth-blue-marble.jpg  NASA Blue Marble – valósághű, "Google
//                          Earth"-szerű nappali kép
//   earth-topology.png     domborzati bump-map: a hegyek plasztikusak
//   earth-dark.jpg         sötét Föld (városfények NÉLKÜL)
//   night-sky.png          csillagos háttér
//
// VÁROSFÉNYES ÉJSZAKAI KÉP: két jelöltet próbálunk sorban
//   1. earth-night.jpg a CDN-ről (léte nem igazolt)
//   2. NASA Earth Observatory, Black Marble 2012 (közvetlen URL,
//      közkincs) – itt a CORS-fejléc hiánya lehet akadály
// Egyik sem épül be fixen: a kód teszteli őket, és csak a valóban
// betölthetőt használja. Ha egyik sem megy, az earth-dark.jpg marad,
// tehát a földgömb sosem tud tőle elromlani.
// ==========================================================
const TEX_BASE  = 'https://unpkg.com/three-globe/example/img/';
const TEX_DAY   = TEX_BASE + 'earth-blue-marble.jpg';
const TEX_BUMP  = TEX_BASE + 'earth-topology.png';
const TEX_NIGHT_FALLBACK = TEX_BASE + 'earth-dark.jpg';

// Éjszakai textúra jelöltek, PRIORITÁSI SORRENDBEN.
// Mindkét első jelölt NASA Black Marble (Earth at Night) – városfényekkel.
// KÖZKINCS (public domain), kereskedelmi célra is szabadon használható.
const TEX_NIGHT_CANDIDATES = [
    // 1) A three-globe CDN-je – ha létezik, ez a leggyorsabb (nem igazolt)
    TEX_BASE + 'earth-night.jpg',
    // 2) Közvetlenül a NASA Earth Observatory-ról: Black Marble 2012,
    //    3600x1800 px. Kockázat: a NASA szervere nem biztos, hogy küld
    //    CORS-fejlécet, ami a WebGL-textúrához kell. Ha nem, a lánc
    //    továbblép. Méret miatt mobilon lassabb lehet a betöltése.
    'https://eoimages.gsfc.nasa.gov/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.3600x1800.jpg'
];

// Az éjszakai textúra kezdetben a biztos, városfények nélküli változat.
let TEX_NIGHT = TEX_NIGHT_FALLBACK;

// ==========================================================
// NAPPAL / ÉJSZAKA ÁLLAPOT
// ==========================================================
// Induláskor a látogató HELYI IDEJE dönt (6:00-18:00 = nappal),
// de a bal oldali gombbal bármikor átváltható.
//
// FONTOS a sorrend: ez a változó 'let', ami NEM hoistolódik, ezért
// a Globe inicializálása (ami meghívja a pickGlobeTexture-t) ELŐTT
// kell deklarálni - különben "Cannot access before initialization"
// hibát kapnánk, és a földgömb egyáltalán nem jönne létre.
const _startHour = new Date().getHours();
let isNightMode = (_startHour < 6 || _startHour >= 18);

// Öntesztelő láncolt betöltés: sorra megpróbáljuk a jelölteket, és az
// ELSŐ MŰKÖDŐT használjuk. Ha egyik sem jön be, marad a tartalék.
// A földgömb rajzolását ez nem blokkolja - a háttérben fut.
(function probeNightTexture(index) {
    index = index || 0;
    if (index >= TEX_NIGHT_CANDIDATES.length) {
        console.log('[RC360] Városfényes textúra nem elérhető, marad az earth-dark.jpg.');
        return;
    }
    const url = TEX_NIGHT_CANDIDATES[index];
    const probe = new Image();
    probe.crossOrigin = 'anonymous';   // CORS-teszt: a WebGL is így kéri majd
    probe.onload = function () {
        TEX_NIGHT = url;
        console.log('[RC360] Városfényes éjszakai textúra betöltve:', url);
        // Ha ÉPP éjszakai módban vagyunk, azonnal lecseréljük a
        // gömb textúráját a most elérhetővé vált, városfényesre.
        // (A probe aszinkron, ezért futhat a gömb létrejötte után is.)
        if (typeof world !== 'undefined' && world && isNightMode) {
            world.globeImageUrl(TEX_NIGHT);
        }
    };
    probe.onerror = function () {
        console.log('[RC360] Nem használható éjszakai textúra:', url, '- próbálom a következőt.');
        probeNightTexture(index + 1);
    };
    probe.src = url;
})();

// A polygonok magassága. Az emelkedés szándékosan kicsi és MINDIG
// ugyanennyi, hogy a hatás egyenletes legyen minden országnál.
const POLY_ALT_BASE  = 0.008;   // alaphelyzet: szinte a felszínen
const POLY_ALT_HOVER = 0.025;   // rámutatásnál: finom, de érzékelhető
const POLY_ALT_CLICK = 0.0375;  // kattintásnál: a korábbi érték fele

function pickGlobeTexture() {
    return isNightMode ? TEX_NIGHT : TEX_DAY;
}

// ==========================================================
//  FORGATÁS-ÉRZÉKELÉS
// ==========================================================
//  A gömb pörgetése közben a rámutatás-kezelést kikapcsoljuk.
//  Enélkül forgatás közben az országok sorra felvillannak és
//  kiemelkednek, ami zavaró és feleslegesen terheli a rajzolást.
//  A rövid utóidő (140 ms) azért kell, hogy a mozgás LEÁLLÁSA után
//  se villanjon fel azonnal az, ami épp a kurzor alá csúszott.
let globeForog = false;
let forgasIdozito = null;

function forgatasJelzes() {
    globeForog = true;
    clearTimeout(forgasIdozito);
    forgasIdozito = setTimeout(() => { globeForog = false; }, 140);
}

/**
 * Forog-e éppen a gömb – akár magától, akár mert húzzák?
 *
 * Az AUTOMATIKUS forgás a főképernyő alapállapota. Amíg az tart, a kurzor
 * ne "találjon el" országokat: a gömb csúszik alatta, és sorra villannának
 * fel a címkék olyan országokról, amikre a látogató rá sem mutatott.
 * Kattintani viszont lehet – az szándékos művelet.
 */
function gombForog() {
    if (globeForog) return true;
    return !!(world && world.controls() && world.controls().autoRotate);
}

/**
 * Szakág választása ELŐTT: kattintásra nem ugrunk 2D térképre,
 * csak kiírjuk, mennyi pálya van ott – és hogy mit kell tenni.
 */
/**
 * ORSZÁG-INFÓ ABLAK (szakágválasztás előtt)
 *
 * A gömb saját címkéje csak RÁMUTATÁSKOR látszik, és a kurzor
 * elmozdulásakor eltűnik. Kattintásnál viszont maradó visszajelzés kell,
 * amit a látogató el tud olvasni – ezért ezt külön, saját ablakban
 * jelenítjük meg.
 *
 * Magától bezárul, ha máshova kattintunk vagy Escape-et nyomunk.
 */
function orszagInfoAblak(iso, esemeny) {
    // Minden más felület bezárul – egyszerre csak egy dolog látszik
    zarjMindentKiveve('orszagInfo');

    // A gömb forgása MEGÁLL, amíg az ablak nyitva van.
    // Enélkül a forgás alatt sorra a kurzor alá csúsznak az országok,
    // és úgy tűnik, mintha magától kattintgatna – közben az ablak
    // tartalma is folyton cserélődne.
    forgatasLeallit();

    const meta = countryMeta[iso] || { name: iso };
    const db = trackDatabase[iso] || [];
    const szam = db.length;

    let doboz = document.getElementById('orszagInfo');
    if (!doboz) {
        doboz = document.createElement('div');
        doboz.id = 'orszagInfo';
        document.body.appendChild(doboz);
    }

    doboz.innerHTML = `
        <button class="oi-close" onclick="zarOrszagInfo()" aria-label="Bezárás">✕</button>
        <div class="oi-name">${orszagNev(iso)}</div>
        <div class="oi-count">🏁 ${szam} dokumentált <b>ügető</b> versenypálya</div>
        <div class="oi-hint">
            A megtekintéshez válassz szakágat:<br>
            kattints fent az <b>Ügető</b> gombra
        </div>`;
    // Az ablakot a KATTINTÁS HELYÉHEZ igazítjuk, nem a képernyő aljára.
    // Így ott jelenik meg, ahová a látogató néz, és nem tűnik külön,
    // független sávnak. A széleknél visszahúzzuk, hogy ne lógjon ki.
    if (esemeny && esemeny.clientX != null) {
        const SZEL = 280, MAGAS = 150, PEREM = 12;
        let x = esemeny.clientX - SZEL / 2;
        let y = esemeny.clientY + 18;
        x = Math.max(PEREM, Math.min(x, window.innerWidth - SZEL - PEREM));
        if (y + MAGAS > window.innerHeight - PEREM) y = esemeny.clientY - MAGAS - 12;
        doboz.style.left = x + 'px';
        doboz.style.top = y + 'px';
        doboz.classList.add('at-cursor');
    }
    doboz.classList.add('open');
}

function zarOrszagInfo() {
    const d = document.getElementById('orszagInfo');
    if (d) d.classList.remove('open');
    forgatasIndit();
}

/** A gömb automatikus forgásának leállítása (pl. ablak nyitásakor). */
function forgatasLeallit() {
    if (world && world.controls()) world.controls().autoRotate = false;
}

/** A forgás visszaindítása – csak akkor, ha nincs nyitott ablak. */
function forgatasIndit() {
    const d = document.getElementById('orszagInfo');
    if (d && d.classList.contains('open')) return;
    if (world && world.controls()) world.controls().autoRotate = true;
}

/**
 * KATTINTÁSKORI KIEMELKEDÉS
 *
 * A kiválasztott ország kiemelkedik a gömb síkjából, majd visszaereszkedik.
 * Ez nem díszítés: visszajelzés arról, hogy a kattintás célba ért – enélkül
 * a látogató nem tudja, sikerült-e.
 *
 * A két lépcsős időzítés adja a minőségérzetet:
 *   - felfelé 260 ms (gyors, határozott – a kattintásra azonnal reagál)
 *   - lefelé 420 ms (lassabb, lágy – nem "visszapattan", hanem leül)
 * A globe.gl a polygonsTransitionDuration értékét használja, ezért azt
 * menet közben állítjuk át, majd visszaállítjuk az eredetire.
 */
const POLY_TRANS_ALAP = 220;

function kiemelkedesAnimacio(feat, utana) {
    if (!world) { if (utana) utana(); return; }

    world.polygonsTransitionDuration(600);
    world.polygonAltitude(d => (d === feat ? POLY_ALT_CLICK : POLY_ALT_BASE));

    setTimeout(() => {
        world.polygonsTransitionDuration(900);
        world.polygonAltitude(d => {
            const iso = resolveIso(d.properties);
            return DATA_ISO_CODES.includes(iso) ? POLY_ALT_BASE : POLY_ALT_BASE;
        });
        setTimeout(() => world.polygonsTransitionDuration(POLY_TRANS_ALAP), 900);
    }, 780);

    if (utana) setTimeout(utana, 520);   // a művelet a csúcs közelében indul
}

let world;
try {
    // Előbb ellenőrizzük, hogy a könyvtár egyáltalán betöltődött-e.
    // Ez volt a korábbi hiba forrása: egy nem létező CDN-útvonal miatt
    // a Globe egyszerűen nem létezett, és a hibaüzenet félrevezető volt.
    if (typeof Globe === 'undefined') {
        throw new Error('a globe.gl könyvtár nem töltődött be (CDN-hiba?)');
    }
world = Globe()
    (document.getElementById('globeViz'))
    .globeImageUrl(pickGlobeTexture())
    .bumpImageUrl(TEX_BUMP)
    .backgroundImageUrl(TEX_BASE + 'night-sky.png')
    .lineHoverPrecision(0)
        // Az oldalfal színe követi az állapotot: szakág nélkül SEMLEGES,
    // különben a hártya konyakos árnyalatot kapna, ami szakágat sugallna.
    .polygonSideColor(() => vanSzakag()
        ? 'rgba(216, 154, 94, 0.18)'      // konyak = ügető
        : 'rgba(255, 255, 255, 0.10)')    // semleges
    .polygonStrokeColor(feat => polygonStroke(feat))
    .polygonCapColor(feat => polygonColor(feat, null))
    .polygonAltitude(POLY_ALT_BASE)
    .polygonLabel(({ properties }) => {
        // FONTOS: ezt a címkét a globe.gl MAGA jeleníti meg rámutatáskor,
        // függetlenül az onPolygonHover kezelőnktől. Ezért a forgás-tiltást
        // ITT is meg kell ismételni – különben a gömb pörgetése közben
        // sorra felvillannak a címkék az alattuk elhaladó országokról.
        if (gombForog()) return null;

        // Nyitott ország-ablaknál sincs címke: az ablak a maradó
        // visszajelzés, a mellette felvillanó címke csak zavarna.
        const info = document.getElementById('orszagInfo');
        if (info && info.classList.contains('open')) return null;

        const iso = resolveIso(properties);
        if (!DATA_ISO_CODES.includes(iso)) return null;
        const meta = countryMeta[iso];
        const count = trackDatabase[iso].length;
        // A rámutatás-címke CSAK a pályaszámot mutatja. Az utasítás a
        // kattintásra felugró ablakba került – így nem jelenik meg
        // kétszer, két különböző helyen.
        return `
            <div style="background:rgba(62,35,24,0.97);color:#f0e6dd;padding:10px 14px;
                        border-radius:4px;border:1px solid rgba(216,154,94,0.4);
                        box-shadow:0 8px 24px -8px rgba(0,0,0,0.75);max-width:250px;">
                <strong style="font-size:0.95rem;">${orszagNev(iso)}</strong><br/>
                <span style="color:#D89A5E;font-size:0.85rem;">🏁 ${count} dokumentált <b>ügető</b> versenypálya</span>
            </div>
        `;
    })
    // Az emelkedés/szín változása animálva, hogy ne "pattogjon".
    // 220 ms: érezhetően sima, de nem lomha.
    .polygonsTransitionDuration(220)
    .onPolygonHover(hoverD => {
        // A forgatás közben NEM reagálunk a rámutatásra. Enélkül a gömb
        // pörgetésekor az országok sorra felvillannak és kiemelkednek,
        // ami zavaró és lassítja is a megjelenítést.
        if (gombForog()) return;
        // Nyitott ország-ablaknál sem: különben a mögötte mozgó kurzor
        // folyamatosan cserélné a kiemelt országot.
        const info = document.getElementById('orszagInfo');
        if (info && info.classList.contains('open')) return;
        world.polygonAltitude(d => {
            const iso = resolveIso(d.properties);
            if (!DATA_ISO_CODES.includes(iso)) return POLY_ALT_BASE;
            // Finom, egyenletes kiemelkedés - mindig ugyanennyi,
            // országtól függetlenül, hogy szabályos legyen a hatás.
            return d === hoverD ? POLY_ALT_HOVER : POLY_ALT_BASE;
        });
        world.polygonCapColor(d => polygonColor(d, hoverD));
        world.polygonStrokeColor(d => polygonStroke(d));
    })
    .onGlobeReady(() => {
        // A vezérlők eseményeire kötjük a forgatás-jelzést
        const c = world.controls();
        if (c) { c.addEventListener('start', forgatasJelzes);
                 c.addEventListener('change', forgatasJelzes); }
    })
    .onPolygonClick((polygon, esemeny) => {
        // Országra kattintva új munkamenet indul: a nyitott menük
        // bezárulnak. (A goToCountry() ezt magától is megteszi, de a
        // szakág nélküli ág nem hívja meg – ezért kell ide is.)
        closeAllDropdowns();

        const iso = resolveIso(polygon.properties);
        if (!DATA_ISO_CODES.includes(iso)) return;

        // Ha még nincs kiválasztva szakág, NEM ugrunk 2D térképre.
        // Ilyenkor csak megmutatjuk, hány pálya van ott, és jelezzük,
        // hogy előbb szakágat kell választani.
        // FIGYELEM: a currentFilter alapértéke 'all', NEM null –
        // ezért itt kifejezetten arra kell vizsgálni, hogy van-e
        // TÉNYLEGES szakág kiválasztva.
        if (!vanSzakag()) {
            // Szakág nélkül nem megyünk 2D térképre: kiemelkedik az ország,
            // és felugrik egy maradó ablak a pályaszámmal és a teendővel.
            kiemelkedesAnimacio(polygon);
            orszagInfoAblak(iso, esemeny);
            return;
        }
        kiemelkedesAnimacio(polygon, () => goToCountry(iso));
    });
} catch (err) {
    // Ha a 3D földgömb bármi miatt nem tud elindulni, a hiba NE állítsa
    // meg a szkriptet: a menük, a 2D térkép és az adatlapok működjenek.
    console.error('[RC360] A 3D földgömb inicializálása nem sikerült:', err);
    // A hibát az oldalon is kiírjuk, hogy fejlesztői konzol nélkül is látszódjon
    window.addEventListener('DOMContentLoaded', function () {
        const el = document.getElementById('geoStatus');
        if (el) {
            el.textContent = 'A 3D földgömb nem indult el: ' + err.message;
            el.className = 'fail';
        }
    });
}

/* ============================================================
   ORSZÁGNEVEK A FELÜLET NYELVÉN
   ------------------------------------------------------------
   A countryMeta csak ANGOL nevet tárol. Egy magyar felületen a
   "Sweden" felirat zavaró, tíz nyelvnél pedig már komoly hiba:
   a japán vagy arab változaton is angolul jelenne meg.

   Itt csak azok az országok szerepelnek, amelyekhez van adatunk.
   Amelyik nyelv hiányzik, ott automatikusan az angol névre esünk
   vissza – így soha nem marad üres a mező.

   ⚠️ A japán, kínai és arab neveket ANYANYELVI BESZÉLŐVEL érdemes
   ellenőriztetni, mielőtt élesbe kerülnek. A latin betűs nyelvek
   (hu, de, fr, sv, es, it) megbízhatóak.
   ============================================================ */
const ORSZAGNEVEK = {
    SWE: { hu:'Svédország', de:'Schweden', fr:'Suède', sv:'Sverige', es:'Suecia', it:'Svezia', ja:'スウェーデン', zh:'瑞典', ar:'السويد' },
    NOR: { hu:'Norvégia', de:'Norwegen', fr:'Norvège', sv:'Norge', es:'Noruega', it:'Norvegia', ja:'ノルウェー', zh:'挪威', ar:'النرويج' },
    FIN: { hu:'Finnország', de:'Finnland', fr:'Finlande', sv:'Finland', es:'Finlandia', it:'Finlandia', ja:'フィンランド', zh:'芬兰', ar:'فنلندا' },
    DNK: { hu:'Dánia', de:'Dänemark', fr:'Danemark', sv:'Danmark', es:'Dinamarca', it:'Danimarca', ja:'デンマーク', zh:'丹麦', ar:'الدنمارك' },
    FRA: { hu:'Franciaország', de:'Frankreich', fr:'France', sv:'Frankrike', es:'Francia', it:'Francia', ja:'フランス', zh:'法国', ar:'فرنسا' },
    ITA: { hu:'Olaszország', de:'Italien', fr:'Italie', sv:'Italien', es:'Italia', it:'Italia', ja:'イタリア', zh:'意大利', ar:'إيطاليا' },
    DEU: { hu:'Németország', de:'Deutschland', fr:'Allemagne', sv:'Tyskland', es:'Alemania', it:'Germania', ja:'ドイツ', zh:'德国', ar:'ألمانيا' },
    AUT: { hu:'Ausztria', de:'Österreich', fr:'Autriche', sv:'Österrike', es:'Austria', it:'Austria', ja:'オーストリア', zh:'奥地利', ar:'النمسا' },
    CHE: { hu:'Svájc', de:'Schweiz', fr:'Suisse', sv:'Schweiz', es:'Suiza', it:'Svizzera', ja:'スイス', zh:'瑞士', ar:'سويسرا' },
    NLD: { hu:'Hollandia', de:'Niederlande', fr:'Pays-Bas', sv:'Nederländerna', es:'Países Bajos', it:'Paesi Bassi', ja:'オランダ', zh:'荷兰', ar:'هولندا' },
    BEL: { hu:'Belgium', de:'Belgien', fr:'Belgique', sv:'Belgien', es:'Bélgica', it:'Belgio', ja:'ベルギー', zh:'比利时', ar:'بلجيكا' },
    ESP: { hu:'Spanyolország', de:'Spanien', fr:'Espagne', sv:'Spanien', es:'España', it:'Spagna', ja:'スペイン', zh:'西班牙', ar:'إسبانيا' },
    GBR: { hu:'Egyesült Királyság', de:'Vereinigtes Königreich', fr:'Royaume-Uni', sv:'Storbritannien', es:'Reino Unido', it:'Regno Unito', ja:'イギリス', zh:'英国', ar:'المملكة المتحدة' },
    IRL: { hu:'Írország', de:'Irland', fr:'Irlande', sv:'Irland', es:'Irlanda', it:'Irlanda', ja:'アイルランド', zh:'爱尔兰', ar:'أيرلندا' },
    POL: { hu:'Lengyelország', de:'Polen', fr:'Pologne', sv:'Polen', es:'Polonia', it:'Polonia', ja:'ポーランド', zh:'波兰', ar:'بولندا' },
    CZE: { hu:'Csehország', de:'Tschechien', fr:'Tchéquie', sv:'Tjeckien', es:'Chequia', it:'Cechia', ja:'チェコ', zh:'捷克', ar:'التشيك' },
    SVK: { hu:'Szlovákia', de:'Slowakei', fr:'Slovaquie', sv:'Slovakien', es:'Eslovaquia', it:'Slovacchia', ja:'スロバキア', zh:'斯洛伐克', ar:'سلوفاكيا' },
    HUN: { hu:'Magyarország', de:'Ungarn', fr:'Hongrie', sv:'Ungern', es:'Hungría', it:'Ungheria', ja:'ハンガリー', zh:'匈牙利', ar:'المجر' },
    SVN: { hu:'Szlovénia', de:'Slowenien', fr:'Slovénie', sv:'Slovenien', es:'Eslovenia', it:'Slovenia', ja:'スロベニア', zh:'斯洛文尼亚', ar:'سلوفينيا' },
    SRB: { hu:'Szerbia', de:'Serbien', fr:'Serbie', sv:'Serbien', es:'Serbia', it:'Serbia', ja:'セルビア', zh:'塞尔维亚', ar:'صربيا' },
    EST: { hu:'Észtország', de:'Estland', fr:'Estonie', sv:'Estland', es:'Estonia', it:'Estonia', ja:'エストニア', zh:'爱沙尼亚', ar:'إستونيا' },
    LTU: { hu:'Litvánia', de:'Litauen', fr:'Lituanie', sv:'Litauen', es:'Lituania', it:'Lituania', ja:'リトアニア', zh:'立陶宛', ar:'ليتوانيا' },
    MLT: { hu:'Málta', de:'Malta', fr:'Malte', sv:'Malta', es:'Malta', it:'Malta', ja:'マルタ', zh:'马耳他', ar:'مالطا' },
    RUS: { hu:'Oroszország', de:'Russland', fr:'Russie', sv:'Ryssland', es:'Rusia', it:'Russia', ja:'ロシア', zh:'俄罗斯', ar:'روسيا' },
    UKR: { hu:'Ukrajna', de:'Ukraine', fr:'Ukraine', sv:'Ukraina', es:'Ucrania', it:'Ucraina', ja:'ウクライナ', zh:'乌克兰', ar:'أوكرانيا' },
    USA: { hu:'Egyesült Államok', de:'Vereinigte Staaten', fr:'États-Unis', sv:'USA', es:'Estados Unidos', it:'Stati Uniti', ja:'アメリカ合衆国', zh:'美国', ar:'الولايات المتحدة' },
    CAN: { hu:'Kanada', de:'Kanada', fr:'Canada', sv:'Kanada', es:'Canadá', it:'Canada', ja:'カナダ', zh:'加拿大', ar:'كندا' },
    AUS: { hu:'Ausztrália', de:'Australien', fr:'Australie', sv:'Australien', es:'Australia', it:'Australia', ja:'オーストラリア', zh:'澳大利亚', ar:'أستراليا' },
    NZL: { hu:'Új-Zéland', de:'Neuseeland', fr:'Nouvelle-Zélande', sv:'Nya Zeeland', es:'Nueva Zelanda', it:'Nuova Zelanda', ja:'ニュージーランド', zh:'新西兰', ar:'نيوزيلندا' },
};

/**
 * Az ország neve a felület AKTUÁLIS nyelvén.
 * Ha nincs fordítás, az angol névre esünk vissza – így soha nem marad üres.
 */
function orszagNev(iso) {
    const forditas = ORSZAGNEVEK[iso];
    const nyelv = (typeof aktualisNyelv !== 'undefined' && aktualisNyelv) ? aktualisNyelv : 'hu';
    if (forditas && forditas[nyelv]) return forditas[nyelv];
    const meta = countryMeta[iso];
    return (meta && meta.name) || iso;
}

// ==========================================================
// A FÖLDGÖMB MEGJELENÍTÉSI LOGIKÁJA
// ==========================================================
// Rögzített felhasználói folyamat:
//
//  1. MEGÉRKEZÉS (alapállapot, nincs aktív szűrő)
//     A látogató egy átlátszó, "hártya" jellegű réteget lát a
//     földgömbön, amelyen CSAK az országhatárok vonalai látszanak.
//     Nincs kitöltés, nincs színezés - a Föld textúrája szabadon
//     átüt. Így semmi nem sugall félrevezető adatot.
//
//  2. ÜGETŐ SZŰRŐ BEKAPCSOLÁSA
//     Ekkor - és csak ekkor - jelenik meg a kék szín azokon az
//     országokon, amelyekhez tényleges pálya-adatunk van.
//     A többi ország marad a hártya-állapotban.
//
//  3. KATTINTÁS
//     A kijelölt országra kattintva a földgömb belezoomol, majd
//     átúszik az ország 2D térképére a pályákkal.
//
//  GALOPP SZŰRŐ: adatfeltöltésig KIKAPCSOLVA (lásd setFilter).
// ==========================================================

function polygonColor(feat, hoverD) {
    const iso = resolveIso(feat.properties);
    const hasData = DATA_ISO_CODES.includes(iso);

    // RÁMUTATÁS: semleges, nagyon halvány fehér – szándékosan NEM kék.
    // A kék korábban azt sugallta, hogy a szín jelent valamit (pl. galoppot),
    // holott csak visszajelzés. A semleges fehér nem téveszt meg.
    //
    // Ha már ki van választva a szakág, a rámutatás CSAK egy árnyalattal
    // világosít a konyakon – nem vált színt, mert a szín ott már információt hordoz.
    if (hasData && feat === hoverD) {
        return currentFilter === 'trot'
            ? 'rgba(232, 186, 140, 0.62)'    // világosabb konyak
            : 'rgba(255, 255, 255, 0.14)';   // semleges, alig látható
    }

    if (currentFilter === 'trot') {
        const meta = countryMeta[iso] || {};
        // ÜGETŐ = KONYAK. (Galopp = racing zöld, majd: 'rgba(95, 191, 142, 0.5)')
        if (hasData && meta.hasTrot) return 'rgba(216, 154, 94, 0.5)';
        return 'rgba(0, 0, 0, 0)';   // a többi marad hártya
    }

    // ALAPÁLLAPOT (nincs kiválasztva szakág):
    // Az adatolt országok halvány, áttetsző FEHÉR hártyát kapnak – ugyanúgy
    // láthatók, mint a szakág-választás utáni konyak kitöltés, csak semleges
    // színnel. Így már az első pillantásra látszik, hol van pálya, anélkül
    // hogy a szín bármelyik szakágat sugallná.
    if (hasData) return 'rgba(255, 255, 255, 0.16)';

    // Ahol nincs adatunk, ott teljesen átlátszó marad.
    return 'rgba(0, 0, 0, 0)';
}

// A határvonalak adják a "hártya" hatást: alapállapotban MINDEN ország
// körvonala látszik halványan, így a látogató érzékeli a réteget.
function polygonStroke(feat) {
    const iso = resolveIso(feat.properties);
    const hasData = DATA_ISO_CODES.includes(iso);

    // Szűrő aktív: az adatolt országok határa kiemelten világít,
    // a többi visszahalványul, hogy a kijelölés egyértelmű legyen.
    if (currentFilter === 'trot') {
        return hasData ? '#7dd3fc' : 'rgba(148, 163, 184, 0.18)';
    }

    // Alapállapot: egységes, halvány határvonal MINDEN országon.
    // Ez a "hártya" - jelzi, hogy interaktív réteg van a gömbön,
    // de nem tesz különbséget adat szerint.
    return 'rgba(148, 163, 184, 0.45)';
}

// Határvonal színe. EZ a fő vizuális jelzés arról, hogy egy ország
// kattintható-e: az adatolt országok világos kék körvonalat kapnak,
// a többi országnak nincs látható határa.

// ==========================================================
// ORSZÁGHATÁROK (GeoJSON)
// ==========================================================
// FONTOS TANULSÁG: a korábbi verzióban a letöltés és a MEGJELENÍTÉS
// ugyanabban a .then() blokkban volt. Ha a megjelenítés hibázott,
// azt a .catch() letöltési hibának hitte, és továbblépett a
// következő forrásra - így mind a négy forrás "elhasalt", pedig a
// letöltés valójában sikerült.
//
// Ezért most a két lépés SZÉT VAN VÁLASZTVA:
//   - a fetch hibája  -> következő forrás
//   - a rajzolás hibája -> külön jelzés, NEM vált forrást
// ==========================================================
const GEOJSON_SOURCES = [
    'https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson',
    'https://cdn.jsdelivr.net/gh/vasturiano/globe.gl@master/example/datasets/ne_110m_admin_0_countries.geojson',
    'https://cdn.statically.io/gh/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson',
    'data/countries.geojson'
];

function setGeoStatus(text, cls) {
    const el = document.getElementById('geoStatus');
    if (!el) return;
    el.textContent = text;
    el.className = cls || '';
}

// A LETÖLTÖTT adat kirajzolása. Külön függvény, hogy az itt keletkező
// hiba SOHA ne keveredjen össze a hálózati hibával.
function renderCountries(countries, url, index) {
    try {
        if (!world) {
            setGeoStatus('A határok letöltődtek, de a 3D földgömb nem jött létre. '
                + 'A Pályák menü és a 2D térkép működik.', 'warn');
            return;
        }

        world.polygonsData(countries.features);

        const recognised = countries.features
            .filter(f => DATA_ISO_CODES.includes(resolveIso(f.properties))).length;

        const msg = 'Betöltve: ' + countries.features.length + ' poligon | felismert: '
                  + recognised + '/' + DATA_ISO_CODES.length + ' | forrás ' + (index + 1);
        console.log('[RC360] ' + msg, url);

        if (recognised === 0) {
            setGeoStatus(msg + ' — FIGYELEM: egyetlen országot sem sikerült azonosítani.', 'warn');
        } else {
            setGeoStatus(msg, 'ok');
            setTimeout(() => {
                const el = document.getElementById('geoStatus');
                if (el) { el.style.transition = 'opacity 1s'; el.style.opacity = '0'; }
            }, 10000);
        }
    } catch (err) {
        // Rajzolási hiba: NEM váltunk forrást, mert az adat megvan
        console.error('[RC360] A határok kirajzolása nem sikerült:', err);
        setGeoStatus('A határok letöltődtek, de a kirajzolás hibára futott: '
            + err.message, 'fail');
    }
}

function loadCountries(index) {
    index = index || 0;

    if (index >= GEOJSON_SOURCES.length) {
        setGeoStatus('Egyetlen forrás sem elérhető (hálózati hiba). '
            + 'A Pályák menü és a 2D térkép működik.', 'fail');
        return;
    }

    const url = GEOJSON_SOURCES[index];
    setGeoStatus('Letöltés (' + (index + 1) + '/' + GEOJSON_SOURCES.length + ')…');

    fetch(url)
        .then(res => {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(countries => {
            if (!countries || !countries.features) throw new Error('hibás GeoJSON szerkezet');
            // A rajzolást SETTIMEOUT-tal indítjuk: így kikerül ebből a
            // Promise-láncból, és egy rajzolási hiba nem tudja többé
            // "letöltési hibának" álcázni magát.
            setTimeout(() => renderCountries(countries, url, index), 0);
        })
        .catch(err => {
            console.log('[RC360] Forrás nem elérhető:', url, '-', err.message);
            loadCountries(index + 1);
        });
}

// Globális hibafigyelő: ha bárhol futásidejű hiba keletkezik, az
// állapotjelzőben megjelenik. Így a hibakeresés konzol nélkül is megy.
window.addEventListener('error', function (e) {
    const el = document.getElementById('geoStatus');
    if (el && !el.classList.contains('ok')) {
        el.textContent = 'JS hiba: ' + e.message + ' (' + (e.filename || '').split('/').pop() + ':' + e.lineno + ')';
        el.className = 'fail';
    }
});

loadCountries();

// ================================================================
// 4) VEZÉRLÉS - EGYSZERŰ, JÓL BEVÁLT BEÁLLÍTÁSOK
// Szándékosan nincs egyedi eseménykezelő-trükk (pl. auto-forgás
// leállítása kattintásra) - ez a szabványos three.js OrbitControls
// autoRotate + enableDamping kombináció, ami magától is helyesen
// kezeli a felhasználói húzást/nagyítást auto-forgás mellett.
// ================================================================
// Domborzat-mélység: a globe.gl saját globeMaterial() API-ján
// keresztül, KÜLSŐ THREE KÖNYVTÁR NÉLKÜL. (A vízcsillogás-effekt
// szándékosan kimaradt: ahhoz globális THREE kellene, ami korábban
// ütközött a globe.gl beépített three-jével és megölte a földgömböt.)
if (world && world.globeMaterial) {
    try {
        const gm = world.globeMaterial();
        if (gm) gm.bumpScale = 10;
    } catch (err) {
        console.log('[RC360] A domborzat-mélység beállítása kihagyva:', err.message);
    }
}

// Csak akkor állítjuk a vezérlést, ha a földgömb tényleg létrejött.
//
// MIÉRT VAN TRY/CATCH: a `world.controls` létezik FÜGGVÉNYKÉNT akkor is,
// ha a globe.gl belül még nem hozta létre a vezérlő objektumot - ilyenkor
// a world.controls() undefined-ot ad, és a .autoRotate = true értékadás
// TypeError-t dob. Ez a hiba a fájl TETEJÉN, top-level kódban keletkezett,
// ezért MEGÖLTE a teljes további betöltést: minden ez alatti let/const
// (köztük az aktualisNyelv) inicializálatlan maradt, és a felhasználó
// csak annyit látott, hogy "Cannot access 'aktualisNyelv' before
// initialization", amikor megnyitotta a Pályák menüt.
// Egyetlen, nem kritikus vizuális beállítás soha nem akadályozhatja meg
// az oldal többi részének működését.
if (world && typeof world.controls === 'function') {
    try {
        const ctrl = world.controls();
        if (ctrl) {
            ctrl.autoRotate = true;
            ctrl.autoRotateSpeed = 0.4;
            ctrl.enableDamping = true;
            ctrl.dampingFactor = 0.1;
        } else {
            console.log('[RC360] A földgömb vezérlője még nem áll készen - az automatikus forgás kimarad.');
        }
    } catch (err) {
        console.log('[RC360] A földgömb vezérlésének beállítása kihagyva:', err.message);
    }
}

// ================================================================
// 4b) KÉPERNYŐ-FORGATÁS / ÁTMÉRETEZÉS KEZELÉSE
// Enélkül a Globe.gl vászna (canvas) a régi, elforgatás előtti
// méretben ragad be, és a képernyő fele feketén marad. Ezt javítja:
// a földgömb ÉS a Leaflet térkép is újra méretezi magát, amikor a
// böngésző ablakmérete vagy a telefon tájolása megváltozik.
// ================================================================
// ==========================================================
// KÉPERNYŐ-ÁTMÉRETEZÉS ÉS -ELFORDÍTÁS KEZELÉSE
// ==========================================================
// A WebGL-vászon nem méretezi át magát automatikusan. Ha ez
// elmarad, a képernyő egy része feketén marad.
//
// Miért ilyen összetett: mobilon az elfordítás után a böngésző
// NEM azonnal jelenti be az új méretet - van, ahol 100 ms,
// van, ahol 600 ms is kell hozzá. Egyetlen késleltetett
// hívás ezért kevés. Ezért:
//   1. a KONTÉNER tényleges méretét olvassuk (nem a window-t)
//   2. több időpontban is újrapróbálunk
//   3. ResizeObserver-rel a tényleges méretváltozásra is figyelünk
// ==========================================================
function applyViewportSize() {
    const container = document.getElementById('globeViz');
    if (!container) return;

    // A konténer TÉNYLEGES mérete a mérvadó, nem a window.innerWidth:
    // mobilon az utóbbi az elfordítás után egy ideig még a régi értéket adja.
    const w = container.clientWidth  || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    if (world && w > 0 && h > 0) {
        world.width(w).height(h);
    }
    if (leafletMap) {
        leafletMap.invalidateSize();
    }
}

// Több időpontban újrapróbálunk, mert a böngésző késve jelenti
// be a végleges méretet elfordítás után.
function handleViewportResize() {
    applyViewportSize();
    [80, 250, 500, 900].forEach(ms => setTimeout(applyViewportSize, ms));
}

window.addEventListener('resize', handleViewportResize);
window.addEventListener('orientationchange', handleViewportResize);

// A Screen Orientation API pontosabb jelzést ad, ahol elérhető
if (screen.orientation && screen.orientation.addEventListener) {
    screen.orientation.addEventListener('change', handleViewportResize);
}

// A legmegbízhatóbb: közvetlenül a konténer méretváltozására figyelünk.
// Ez akkor is elsül, ha semmilyen esemény nem jelezte a változást
// (pl. böngésző-címsor eltűnése görgetéskor mobilon).
if (typeof ResizeObserver !== 'undefined') {
    const globeContainer = document.getElementById('globeViz');
    if (globeContainer) {
        new ResizeObserver(() => applyViewportSize()).observe(globeContainer);
    }
}

// ================================================================
// 5) ORSZÁG KÖZÉPPONT SZÁMÍTÁSA A SAJÁT ADATAINKBÓL
// ================================================================
function getCountryCenter(iso) {
    const tracks = trackDatabase[iso];
    const avgLat = tracks.reduce((s, t) => s + t.lat, 0) / tracks.length;
    const avgLng = tracks.reduce((s, t) => s + t.lng, 0) / tracks.length;
    return { lat: avgLat, lng: avgLng };
}

// ================================================================
// 6) ÁTVÁLTÁS 3D FÖLDGÖMBRŐL 2D TÉRKÉPRE
// ================================================================
function goToCountry(iso) {
    // Új munkamenet indul: a nyitott menük és panelek bezáródnak
    closeAllDropdowns();
    closeTracksMenu();

    currentIso = iso;
    const center = getCountryCenter(iso);

    document.getElementById('filterContainer').classList.add('disabled');
    document.getElementById('instructionBar').style.opacity = '0';

    // ---- 1. FÁZIS: a földgömb "belezoomol" a kiválasztott országba ----
    // Enyhén rövidebb, mint korábban, hogy ne érződjön lomhának.
    const ZOOM_MS = 1300;
    if (world) world.pointOfView({ lat: center.lat, lng: center.lng, altitude: 0.32 }, ZOOM_MS);

    // ---- 2. FÁZIS: a 2D térkép ELŐKÉSZÍTÉSE, még láthatatlanul ----
    // Ez a kulcs a szakadásmentes átmenethez: mire a térkép megjelenik,
    // már a helyes nézeten áll, tehát nincs látható "beugrás".
    // 250 ms-mal a zoom vége előtt indítjuk, hogy a csempéknek legyen
    // idejük betölteni.
    setTimeout(() => prepareMap(iso), Math.max(0, ZOOM_MS - 250));

    // ---- 3. FÁZIS: átúsztatás ----
    setTimeout(() => revealMap(), ZOOM_MS);
}

// ================================================================
// 7) 2D LEAFLET TÉRKÉP
// ================================================================
let leafletMap = null;
let currentTileLayer = null;
let labelsLayer = null;
const markerLayerGroup = L.layerGroup();

// TÉRKÉP-CSEMPÉK - kizárólag szabadon, kereskedelmi célra is használható
// források, megfelelő attribúcióval:
//  - OpenStreetMap standard: ODbL licenc, attribúcióval kereskedelmi célra is szabad
//  - OpenTopoMap: OSM adat + SRTM domborzat, CC-BY-SA, szintén szabad
// (A korábbi Esri World Imagery műholdréteg eltávolítva: az ArcGIS Online
//  felhasználási feltételei kereskedelmi használatnál külön tisztázást igényelnek.)
// ==========================================================
// TÉRKÉPCSEMPÉK
// ==========================================================
// FONTOS JOGI MEGJEGYZÉS: az OpenStreetMap saját csempeszervere
// (tile.openstreetmap.org) INGYENES, DE a használati szabályzata
// kifejezetten korlátozza a nagy forgalmú és kereskedelmi
// felhasználást – blokkolhatnak. Reklámbevételes oldalnál ez
// valós kockázat.
//
// Éles, növekvő forgalomnál javasolt saját/fizetett csempeszolgáltató
// (pl. MapTiler, Stadia Maps, Thunderforest – mindegyiknek van
// ingyenes kvótája), vagy Cloudflare-proxy cache-eléssel.
//
// Amíg ez nem történik meg, tartalékként a szabadon használható
// OSM-tükröket használjuk láncban.
const TILE_STREET = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_STREET_FALLBACK = 'https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png';
const ATTR_STREET = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function initLeafletIfNeeded() {
    if (leafletMap) return;
    leafletMap = L.map('mapViz', { zoomControl: false, attributionControl: true }).setView([50, 10], 5);
    L.control.zoom({ position: 'bottomleft' }).addTo(leafletMap);
    markerLayerGroup.addTo(leafletMap);
    setBaseLayer('street');
}

// Egyetlen alapréteg: OpenStreetMap (ODbL, kereskedelmi célra is szabad).
// A domborzati váltó eltávolítva - nem adott érdemi információt.
function setBaseLayer() {
    initLeafletIfNeeded();
    if (currentTileLayer) leafletMap.removeLayer(currentTileLayer);

    let tileErrors = 0;
    let switched = false;

    currentTileLayer = L.tileLayer(TILE_STREET, { attribution: ATTR_STREET, maxZoom: 19 });

    // Ha egymás után több csempe is hibára fut, átváltunk a tartalék
    // szerverre. Így egy szolgáltató-kimaradás nem üríti ki a térképet.
    currentTileLayer.on('tileerror', function () {
        tileErrors++;
        if (tileErrors > 6 && !switched) {
            switched = true;
            console.log('[RC360] Sok csempehiba – átváltás a tartalék csempeszerverre.');
            leafletMap.removeLayer(currentTileLayer);
            currentTileLayer = L.tileLayer(TILE_STREET_FALLBACK, {
                attribution: ATTR_STREET, maxZoom: 19, subdomains: 'abc'
            }).addTo(leafletMap);
        }
    });

    currentTileLayer.addTo(leafletMap);
}

// A térkép felépítése MÉG LÁTHATATLANUL: markerek, adatlapok és a
// helyes nézet beállítása. Így a megjelenítés pillanatában már minden
// a helyén van - nincs villanás, nincs beugró pásztázás.
// A jelölők (pöttyök) kirajzolása.
function renderMarkers(iso) {
    const meta = countryMeta[iso] || { name: iso };
    const tracks = trackDatabase[iso] || [];

    markerLayerGroup.clearLayers();
    tracks.forEach(t => {
        const statusClass = t.status || 'active';
        const icon = L.divIcon({ className: '', html: `<div class="track-marker ${statusClass}"></div>`, iconSize: [16, 16] });
        const marker = L.marker([t.lat, t.lng], { icon }).addTo(markerLayerGroup);
        marker.bindPopup(buildPopupHtml(t, meta, iso));

        // MUNKAMENET: az adatlap megnyitása is EGY munkamenet - ilyenkor
        // minden más nyitott felület (legördülő menü, Pályák panel,
        // ország-ablak, modal) bezárul. Enélkül az adatlap és a menü
        // egyszerre látszott, egymásra csúszva.
        marker.on('popupopen', () => {
            zarjMindentKiveve('adatlap');
            utasitasSavElrejt();
        });
        // Ha az utolsó adatlap is bezárult, visszatér az utasítássáv
        marker.on('popupclose', () => {
            // Késleltetés: ha a felhasználó EGYIK adatlapról a MÁSIKRA
            // kattint, a bezárás és a nyitás közvetlenül egymás után fut.
            // Villanás nélkül csak akkor mutatjuk újra a sávot, ha tényleg
            // nem nyílt ki közben másik adatlap.
            setTimeout(() => {
                if (!leafletMap || !document.querySelector('.leaflet-popup')) {
                    utasitasSavMutat(iso);
                }
            }, 60);
        });
    });
    return tracks;
}

/* ------------------------------------------------------------
   UTASÍTÁSSÁV a 2D térképen
   ------------------------------------------------------------
   MIÉRT KELL: a térképre érkezve a felhasználó pöttyöket lát, de
   semmi nem mondja meg, hogy rájuk kell kattintani, és azt sem,
   hogy hány pálya van egyáltalán dokumentálva az országban.
   Ez a sáv mindkettőt megmondja, és eltűnik, amint megnyílik egy
   adatlap - onnantól már nem tanít, csak zavarna.
   ------------------------------------------------------------ */
// Az utasítássáv szövegei. KÜLÖN tábla, mert a translations objektum a
// fejléc gombjait fordítja - ez viszont csak a 2D térképen jelenik meg.
const MAP_UTASITAS = {
    hu: { hint: 'Koppints egy pöttyre a pálya adatlapjához', db: 'dokumentált pálya', aktiv: 'aktív', nemAktiv: 'nem aktív' },
    en: { hint: 'Tap a dot to open the racecourse details', db: 'documented racecourses', aktiv: 'active', nemAktiv: 'inactive' },
    de: { hint: 'Tippe auf einen Punkt für die Bahndaten', db: 'dokumentierte Rennbahnen', aktiv: 'aktiv', nemAktiv: 'inaktiv' },
    fr: { hint: 'Touchez un point pour voir la fiche', db: 'hippodromes documentés', aktiv: 'actifs', nemAktiv: 'inactifs' },
    sv: { hint: 'Tryck på en punkt för banans uppgifter', db: 'dokumenterade banor', aktiv: 'aktiva', nemAktiv: 'inaktiva' },
    es: { hint: 'Toca un punto para ver la ficha', db: 'hipódromos documentados', aktiv: 'activos', nemAktiv: 'inactivos' },
    it: { hint: 'Tocca un punto per la scheda', db: 'ippodromi documentati', aktiv: 'attivi', nemAktiv: 'inattivi' },
    ja: { hint: '点をタップして競馬場の詳細を表示', db: '件の登録済み競馬場', aktiv: '稼働中', nemAktiv: '休止中' },
    zh: { hint: '点击圆点查看赛马场资料', db: '个已收录赛马场', aktiv: '运营中', nemAktiv: '已停用' },
    ar: { hint: 'انقر على نقطة لعرض بيانات المضمار', db: 'مضمار موثق', aktiv: 'نشط', nemAktiv: 'غير نشط' },
};

function utasitasSavMutat(iso) {
    const sav = document.getElementById('instructionBar');
    if (!sav) return;

    const tracks = trackDatabase[iso] || [];
    const orszag = orszagNev(iso);
    const t = MAP_UTASITAS[aktualisNyelv] || MAP_UTASITAS.hu;

    const aktiv = tracks.filter(x => (x.status || 'active') === 'active').length;
    const bezart = tracks.length - aktiv;

    sav.innerHTML = t.hint
        + ' &nbsp;&middot;&nbsp; <b>' + orszag + '</b>: '
        + tracks.length + ' ' + t.db
        + (bezart > 0
            ? ' <span class="ib-sub">(' + aktiv + ' ' + t.aktiv + ', ' + bezart + ' ' + t.nemAktiv + ')</span>'
            : '');

    // Az index.html-ben inline display:none van rajta (korábban ki volt
    // vezetve a felületről) - ezt itt oldjuk fel.
    sav.style.display = '';
    sav.style.opacity = '1';
}

function utasitasSavElrejt() {
    const sav = document.getElementById('instructionBar');
    if (!sav) return;
    sav.style.opacity = '0';
}

function prepareMap(iso) {
    initLeafletIfNeeded();

    const tracks = renderMarkers(iso);
    const bounds = tracks.map(t => [t.lat, t.lng]);

    // A konténer opacity:0, de a méretei megvannak, ezért a Leaflet
    // helyesen tud méretezni és nézetet illeszteni már most.
    leafletMap.invalidateSize();
    if (bounds.length) {
        // animate: false - a beállítás NE legyen látható mozgás,
        // hiszen a térkép még nem látszik.
        leafletMap.fitBounds(bounds, { padding: [60, 60], maxZoom: 7, animate: false });
    }

    // Nincs kiválasztott pálya -> jöjjön az utasítás és a pályaszám
    utasitasSavMutat(iso);
}

// Az előkészített térkép megjelenítése: a földgömb és a térkép
// EGYSZERRE úsztat (CSS opacity-átmenet), így nincs fekete villanás.
function revealMap() {
    setDayNightButtonVisible(false);   // 2D nézetben nincs mit váltani
    document.getElementById('globeLayer').classList.add('hidden');
    document.getElementById('mapLayer').classList.add('visible');
    document.getElementById('backBtn').classList.add('visible');

    // Az átúsztatás után egy utolsó méret-ellenőrzés: ha a látogató
    // közben átméretezte az ablakot vagy forgatta a telefont, ez
    // helyrehozza. Nem mozgatja a nézetet, csak a vásznat igazítja.
    setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 650);
}

// Visszafelé kompatibilis belépési pont (a Pályák menü ezt hívja):
// előkészít ÉS azonnal meg is jelenít.
function showMap(iso) {
    prepareMap(iso);
    revealMap();
}

// Egy pálya felugró adatlapjának felépítése: két fül -
// "Általános" (zászló, alapítás, hossz, szervezet, honlap) és
// "Történet és érdekességek" (a note mező szövege)
/**
 * ZÁSZLÓ MEGJELENÍTÉSE
 *
 * MIÉRT NEM EGYSZERŰEN EMOJI: a zászló-emojik Windowson EGYÁLTALÁN nem
 * jelennek meg – ott csak a két országbetű látszik ("HU"), ami elrontja
 * a megjelenést. iOS-en és macOS-en szépen renderelődnek, ezért könnyű
 * elnézni a hibát.
 *
 * MEGOLDÁS: a sávos zászlókat CSS-ből rajzoljuk (egységes forma és méret
 * minden platformon). Az összetettebbeket (csillagok, kereszt, címer)
 * emojiként hagyjuk – ott a CSS-rajz úgysem lenne hiteles.
 */
const ZASZLO_SAVOK = {
    // Vízszintes háromsávos
    HUN: ['h3', '#CE2939', '#FFFFFF', '#477050'],
    DEU: ['h3', '#000000', '#DD0000', '#FFCE00'],
    NLD: ['h3', '#AE1C28', '#FFFFFF', '#21468B'],
    AUT: ['h3', '#ED2939', '#FFFFFF', '#ED2939'],
    RUS: ['h3', '#FFFFFF', '#0039A6', '#D52B1E'],
    EST: ['h3', '#0072CE', '#000000', '#FFFFFF'],
    LTU: ['h3', '#FDB913', '#006A44', '#C1272D'],
    LVA: ['h3', '#9E3039', '#FFFFFF', '#9E3039'],
    ESP: ['h3', '#AA151B', '#F1BF00', '#AA151B'],
    SRB: ['h3', '#C6363C', '#0C4076', '#FFFFFF'],
    SVN: ['h3', '#FFFFFF', '#0000A0', '#D50000'],
    SVK: ['h3', '#FFFFFF', '#0B4EA2', '#EE1C25'],
    // Vízszintes kétsávos
    UKR: ['h2', '#0057B7', '#FFD700'],
    POL: ['h2', '#FFFFFF', '#DC143C'],
    // Függőleges háromsávos
    FRA: ['v3', '#002395', '#FFFFFF', '#ED2939'],
    ITA: ['v3', '#008C45', '#F4F5F0', '#CD212A'],
    IRL: ['v3', '#169B62', '#FFFFFF', '#FF883E'],
    BEL: ['v3', '#000000', '#FDDA24', '#EF3340'],
    ROU: ['v3', '#002B7F', '#FCD116', '#CE1126'],
    // A többi (SWE, NOR, DNK, FIN – skandináv kereszt; USA, GBR, CAN, AUS,
    // NZL, CHE, MLT, CZE, PRT – összetett) marad emoji.
};

function zaszloHtml(orszagKod, emoji) {
    const s = ZASZLO_SAVOK[orszagKod];
    if (!s) return emoji || '';       // összetett zászló: marad emoji
    const [tipus, ...szinek] = s;
    const valtozok = szinek.map((c, i) => `--c${i + 1}:${c}`).join(';');
    return `<span class="flag ${tipus}" style="${valtozok}"></span>`;
}

function buildPopupHtml(t, meta, orszagKod) {
    // ================================================================
    // ADATLAP
    // Egyetlen nézet, fülek nélkül. (A korábbi "Történet" fül eltávolítva.)
    //
    // KÉP: csak akkor jelenik meg, ha van megerősített (verified: true)
    // képünk. Ha nincs, a TELJES képdoboz kimarad - nem hagyunk üres
    // keretet. A Commons Special:FilePath stabil, dokumentált végpont,
    // ami közvetlenül a kép fájlját adja vissza megadott szélességben.
    // ================================================================

    const status = t.status || "active";
    const statusLabel = statuszSzoveg(status).label;

    // ============================================================
    //  PÁLYAHOSSZ
    // ------------------------------------------------------------
    //  Az angolszász ügetősportban a pályát MÉRFÖLDBEN mérik, és a
    //  pályákat is így osztályozzák: "half-mile track", "five-eighths",
    //  "one-mile track". Ez nem átváltás kérdése, hanem SZAKMAI
    //  MEGNEVEZÉS – egy amerikai hajtónak a "805 m" semmit nem mond,
    //  a "half-mile" viszont azonnal megmondja a kanyarok élességét.
    //
    //  Ezért ezekben az országokban a mérföld áll elöl, a méter
    //  zárójelben. Máshol fordítva.
    //  FIGYELEM: Ausztrália és Új-Zéland NEM tartozik ide! Ők a metrikus
    //  átállás óta MÉTERBEN mérik a pályát – a Menangle "1400 metres",
    //  a Melton "1000 metres". Ha mérföldben írnánk ki, az félrevezető
    //  lenne az ottani olvasónak.
    // ============================================================
    const MERFOLD_ORSZAGOK = ['USA', 'CAN', 'GBR', 'IRL'];
    const MERFOLD_M = 1609.344;
    // A ténylegesen használt szabványos pályaméretek
    const MERFOLD_TORTEK = [
        [0.5,   'fél mérföld',        'half-mile'],
        [0.625, 'öt-nyolcad mérföld', 'five-eighths'],
        [0.75,  'háromnegyed mérföld', 'three-quarter'],
        [0.875, 'hét-nyolcad mérföld', 'seven-eighths'],
        [1,     'egy mérföld',        'one-mile'],
        [1.25,  'másfél mérföld körül', ''],
    ];

    function hosszSzoveg(meter, orszagKod) {
        if (!meter) return "N/A";
        if (!MERFOLD_ORSZAGOK.includes(orszagKod)) return `${meter} m`;

        const arany = meter / MERFOLD_M;
        // 3% tűrés: a pályák ritkán pontosan szabványosak
        const talalat = MERFOLD_TORTEK.find(([t]) => Math.abs(arany - t) / t < 0.03);
        if (talalat) {
            const [, magyar, angol] = talalat;
            return `${magyar}${angol ? ` <span class="popup-sub-inline">(${angol})</span>` : ''}`
                 + ` <span class="popup-sub-inline">– ${meter} m</span>`;
        }
        // Nem szabványos méret: mérföldben is megadjuk, de nem nevezzük el
        return `${arany.toFixed(2)} mérföld <span class="popup-sub-inline">(${meter} m)</span>`;
    }

    const lengthText = hosszSzoveg(t.length, orszagKod);

    /* ================================================================
       ORSZÁGFÜGGŐ ADATLAP-SÉMA
       ================================================================
       A pályaadatok NEM egységesek országonként: Franciaországra
       (LeTrot) van teljes, egy forrásból származó adatsorunk - régió,
       talaj, irány, hossz -, máshol viszont ezek nagyrészt hiányoznak.
       Egy közös, "gazdag" séma ezért a többi országnál csupa "N/A"-t
       mutatna, ami rosszabb, mintha a mező meg sem jelenne.

       Ezért: a bővített séma EGYELŐRE csak Franciaországnál fut. Ahogy
       egy-egy ország adatai összeállnak, az ISO-kódját ide kell
       felvenni - a megjelenítő kódot nem kell újraírni.

       A régi séma szövegei (ui('na'), ui('noOwnSite')) szintén
       megmaradnak a többi országnál, hogy a megjelenés ne törjön meg
       félúton. */
    const BOVITETT_ADATLAP = ['FRA'];
    const bovitett = BOVITETT_ADATLAP.includes(orszagKod);

    /* PÁLYA TALAJA (csak a bővített sémában)
       Az adatbázisban az értékek kisbetűvel és részben eltérő
       írásmóddal szerepelnek (pl. "puccolane" / "puccolan"), mert több
       forrásból, több menetben kerültek be. A megjelenítést itt
       egységesítjük, az adatot magát NEM írjuk át - így a forrásérték
       visszakereshető marad.

       A puccolán vulkáni eredetű, porózus kőzetliszt; a francia
       ügetőpályák jellemző, minden időben futható borítása. Zárójelben
       megadjuk a francia nevet is, mert a szaksajtóban így szerepel. */
    // A talajérték az ADATBAN magyarul szerepel ("fű", "homok", …) –
    // ez a magyar nyelvű adatgyűjtés öröksége. Az adatot nem írjuk át,
    // csak MEGJELENÍTÉSKOR képezzük le a felület nyelvére.
    const SURFACE_TEXT = {
        'fű':        ui('sfGrass'),
        'homok':     ui('sfSand'),
        'salak':     ui('sfCinder'),
        'zúzalék':   ui('sfGravel'),
        'puccolane': ui('sfPozzolana'),
        'puccolan':  ui('sfPozzolana'),
    };
    const surfaceText = t.surface
        ? (SURFACE_TEXT[String(t.surface).trim().toLowerCase()]
           || String(t.surface).trim())
        : "N/A";

    // Haladási irány. A pályát a lovak szemszögéből nézzük:
    //   "left"  = balkéz  = az óramutató járásával ELLENTÉTES (a
    //             nemzetközi ügetősportban ez az elterjedtebb)
    //   "right" = jobbkéz = az óramutató járásával MEGEGYEZŐ
    // Csak ott jelenik meg érték, ahol tényleges forrásunk van;
    // egyébként őszintén ui('na').
    const DIRECTION_TEXT = {
        left:  ui('dirLeftLong'),
        right: ui('dirRightLong')
    };
    const directionText = DIRECTION_TEXT[t.direction] || (bovitett ? "N/A" : ui('na'));

    // Alapítás éve. Ha a pálya korábban épült, mint amikor ügetőversenyt
    // kezdtek ott rendezni, MINDKETTŐT megmutatjuk – különben félrevezető.
    // (Menangle 1914-ben galopp-pályaként nyílt, ügetőpályaként 1953-ban.)
    const foundedText = t.founded
        ? (t.trotSince && t.trotSince !== t.founded
            ? `${t.founded} <span class="popup-sub-inline">(${ui('trotSince').replace('{}', t.trotSince)})</span>`
            : String(t.founded))
        : (t.trotSince
            ? `<span class="popup-sub-inline">${ui('trotSince').replace('{}', t.trotSince)}</span>`
            : (bovitett ? "N/A" : ui('noExact')));

    // --- Linkek ---
    const linkOf = (url, extra = '') => `<a href="${url}" target="_blank" rel="noopener"${extra}>${url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>`;

    // 1. szint: a pálya saját honlapja
    const ownSiteText = t.ownSite
        ? linkOf(t.ownSite)
        : (bovitett ? "N/A" : ui('noOwnSite'));

    /* ÜZEMELTETŐ HONLAPJA - csak a RÉGI sémában.
       A bővített (francia) sémában szándékosan nincs: ott az üzemeltető
       minden pályánál ugyanaz a LeTrot, amit a "Versenyek szervezése"
       sor amúgy is megmutat, tehát csak ismétlés lenne. */
    const operatorRow = (!bovitett && t.operatorSite)
        ? `<div class="popup-row"><b>${ui('operatorSite')}:</b> ${linkOf(t.operatorSite)}${t.operatorName ? `<span class="popup-sub">${t.operatorName}</span>` : ''}</div>`
        : '';

    // 2. RÉGIÓ: csak a régió NEVE jelenik meg, link nélkül. A regionális
    // szövetségeknek nincs egységes, megbízható saját honlapjuk, ezért
    // szándékosan nem linkelünk - a név viszont szakmailag informatív
    // (pl. Franciaországban a "Fédération Ouest" a versenynaptárt is
    // meghatározza).
    const regionRow = t.region
        ? `<div class="popup-row"><b>${ui('region')}:</b> ${t.region}</div>`
        : '';

    /* SZERVEZETI SOROK
       BŐVÍTETT séma: a szervezet TELJES NEVE a link FÖLÉ kerül, külön
       sorba - nem a végére sűrítve. A hivatalos nevek ugyanis hosszúak
       (pl. "Société d'Encouragement à l'élevage du Trotteur Français"),
       és a link mögé zsúfolva olvashatatlanná préselődtek.

       RÉGI séma: marad az eredeti, egysoros forma (link, alatta halvány
       névvel) - így a többi ország adatlapja pontosan úgy néz ki, mint
       a francia bővítés előtt. */
    const szervezetSor = (cimke, nev, url) => {
        if (!url && !nev) return '';
        const nevSor = nev ? `<span class="popup-org-name">${nev}</span>` : '';
        const linkSor = `<span class="popup-org-link">${url ? linkOf(url) : 'N/A'}</span>`;
        return `<div class="popup-row popup-row-org"><b>${cimke}:</b><span class="popup-org">${nevSor}${linkSor}</span></div>`;
    };

    // 3. szint: országos szervezet - mindig megjelenik
    const orgSiteText = meta.orgSite ? linkOf(meta.orgSite) : ui('na');
    const orgRow = bovitett
        ? szervezetSor(
            meta.orgSiteLabel || ui('orgGeneric'),
            meta.orgSiteName,
            meta.orgSite
          )
        : `<div class="popup-row"><b>${meta.orgSiteLabel || ui('orgGeneric')}:</b> ${orgSiteText}${meta.orgSiteName ? `<span class="popup-sub">${meta.orgSiteName}</span>` : ''}</div>`;

    // 3/b. VERSENYEK SZERVEZÉSE: ahol az országos szervezet (pl. FNCH)
    // és a tényleges versenyszervező (pl. SETF/LeTrot) KÜLÖNVÁLIK, ott
    // mindkettőt megmutatjuk - egyébként ez a sor kimarad.
    const raceOrgRow = meta.raceOrgSite
        ? szervezetSor(
            meta.raceOrgLabel || ui('orgRacing'),
            meta.raceOrgName,
            meta.raceOrgSite
          )
        : '';

    const altSiteRow = meta.orgSiteAlt
        ? `<div class="popup-row popup-row-alt"><b>${meta.orgSiteAltLabel || 'Egyéb hivatalos link'}:</b> ${linkOf(meta.orgSiteAlt)}</div>`
        : '';

    // --- Kép: a teljes doboz csak akkor létezik, ha van megerősített kép ---
    const img = t.image;
    let imageBlock = '';
    if (img && img.verified && img.url) {
        // A Commons fájloldal URL-jéből előállítjuk a közvetlen kép-URL-t.
        // Special:FilePath = stabil, dokumentált végpont, width paraméterrel.
        const fajlNev = img.url.split('/wiki/File:')[1] || img.url.split('/wiki/Fájl:')[1];
        if (fajlNev) {
            const kepUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${fajlNev}?width=640`;
            imageBlock = `
            <div class="popup-image-box">
                <img src="${kepUrl}" alt="${t.name}" loading="lazy"
                     onerror="this.closest('.popup-image-box').remove()">
                <div class="popup-image-credit">
                    Kép: <a href="${img.url}" target="_blank" rel="noopener">Wikimedia Commons</a>${img.attribution ? ` – ${img.attribution}` : ''} (${img.license})
                </div>
            </div>`;
        }
    }

    /* TALAJ SOR A RÉGI SÉMÁHOZ - csak ha VAN adat.
       A bővített sémában a talaj mindig kiírásra kerül (ott teljes az
       adatsor), a többi országnál viszont 523-ból csak ~50 pályánál van
       talajadat. Ha itt is fix sor lenne, 470 adatlapon jelenne meg egy
       "N/A" - ez rosszabb, mintha a mező meg sem jelenne. Ezért a sor
       csak akkor kerül a DOM-ba, ha ténylegesen van mit mutatni. */
    const surfaceRow = (!bovitett && t.surface)
        ? `<div class="popup-row"><b>${ui('surface')}:</b> ${surfaceText}</div>`
        : '';

    /* FEJLÉC
       BŐVÍTETT séma: a település a zászló előtt, a fejléc jobb szélén.
       RÉGI séma: a fejlécben csak a név és a zászló van, a település
       az első adatsorba kerül - pontosan úgy, ahogy a francia bővítés
       előtt volt. */
    const fejlecVege = bovitett
        ? `<span class="popup-head-right">
                    ${t.city ? `<span class="popup-city">${t.city}</span>` : ''}
                    <span class="popup-flag">${zaszloHtml(orszagKod, meta.flag)}</span>
                </span>`
        : `<span class="popup-flag">${zaszloHtml(orszagKod, meta.flag)}</span>`;

    /* TÖRZS
       A két séma külön épül fel, mert nemcsak a mezők sorrendje, hanem
       a mezőkészlet is más (talaj és régió csak a bővítettben van). */
    const torzs = bovitett
        ? `
                <div class="popup-row"><b>${ui('founded')}:</b> ${foundedText}</div>
                <div class="popup-row"><b>${ui('length')}:</b> ${lengthText}</div>
                <div class="popup-row"><b>${ui('surface')}:</b> ${surfaceText}</div>
                <div class="popup-row"><b>${ui('direction')}:</b> ${directionText}</div>
                <div class="popup-row"><b>${ui('ownSite')}:</b> ${ownSiteText}</div>
                ${regionRow}
                ${orgRow}
                ${raceOrgRow}
                ${altSiteRow}`
        : `
                <div class="popup-row"><b>${ui('city')}:</b> ${t.city || ui('na')}</div>
                <div class="popup-row"><b>${ui('founded')}:</b> ${foundedText}</div>
                <div class="popup-row"><b>${ui('length')}:</b> ${lengthText}</div>
                ${surfaceRow}
                <div class="popup-row"><b>${ui('direction')}:</b> ${directionText}</div>
                <div class="popup-row"><b>${ui('org')}:</b> ${t.org || ui('na')}</div>
                <div class="popup-row"><b>${ui('ownSite')}:</b> ${ownSiteText}</div>
                ${operatorRow}
                ${orgRow}
                ${altSiteRow}`;

    return `
        <div class="popup-card">
            ${imageBlock}
            <div class="popup-head">
                <span class="popup-status ${status}" title="${statusLabel}"></span>
                <span class="popup-status-text">${statusLabel}</span>
                <span class="popup-name">${t.name}</span>
                ${fejlecVege}
            </div>
            <div class="popup-body">${torzs}
                <div class="popup-row popup-adatlap">
                    <a href="${statikusUrl(orszagKod, t)}">${ui('detailPage')} &rsaquo;</a>
                </div>
            </div>
        </div>
    `;
}

// (A korábbi switchPopupTab() eltávolítva: az adatlapon már nincsenek fülek.)

// ================================================================
// 8) SZŰRŐ
// ================================================================
function setFilter(type, btn) {
    // ==========================================================
    // GALOPP SZŰRŐ: KIKAPCSOLVA ADATFELTÖLTÉSIG
    // ==========================================================
    // Az adatbázisunk jelenleg KIZÁRÓLAG ügetőpályákat tartalmaz.
    // Amíg nincs megbízható, ország-szintű galopp-adatunk, a gomb
    // szándékosan nem csinál semmit - nem állítunk olyat, amit nem
    // tudunk alátámasztani. A gomb helye viszont megvan a jövőre.
    // AKTIVÁLÁSHOZ: töröld az alábbi sort, és vedd fel a galopp-
    // adatokat a countryMeta hasGallop mezőibe + a trackDatabase-be.
    if (type === 'gallop') return;

    // Kapcsoló (toggle) viselkedés: ha ugyanarra az already aktív gombra
    // kattintasz, visszaáll az alapállapotra (mindkét szakág, saját színén)
    if (currentFilter === type) {
        currentFilter = 'all';
        btn.classList.remove('active');
    } else {
        currentFilter = type;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    if (world) {
        world.polygonStrokeColor(d => polygonStroke(d));
        world.polygonsData(world.polygonsData());
    }
}

// ================================================================
// 9) VISSZA A FÖLDGÖMBHÖZ
// ================================================================
function resetToGlobe() {
    // Munkamenet vége: minden nyitott felület bezáródik
    closeAllDropdowns();
    closeTracksMenu();

    currentIso = null;
    // A földgömb kameráját MÁR MOST visszaindítjuk, még a keresztúsztatás
    // alatt - így mire a gömb láthatóvá válik, már úton van kifelé,
    // nem pedig ott ragad, ahol a belezoomolás véget ért.
    if (world) world.pointOfView({ lat: 20, lng: 0, altitude: 2.2 }, 1500);

    setDayNightButtonVisible(true);    // vissza a földgömbre: újra látszik
    document.getElementById('mapLayer').classList.remove('visible');
    document.getElementById('globeLayer').classList.remove('hidden');
    document.getElementById('backBtn').classList.remove('visible');
    document.getElementById('filterContainer').classList.remove('disabled');
    // A földgömbön nincs utasítássáv - ott az ország fölé húzott címke tanít
    document.getElementById('instructionBar').style.display = 'none';
}

// ================================================================
// 10) COOKIE-CONSENT KEZELÉS
// A döntést localStorage-ben tároljuk (ez a szokásos, elvárt módszer
// cookie-hozzájárulás perzisztálására - ez a fájl a saját szerveren
// fut majd, nem a Claude előnézetben).
// ================================================================

// KAPCSOLÓ: ha beállítottad a CookieYes-t (lásd a <head>-ben lévő
// utasítást), állítsd ezt true-ra - ekkor a saját, egyszerű bannerünk
// automatikusan nem jelenik meg, mert a CookieYes saját, TCF-kompatibilis
// bannere veszi át a szerepét. Amíg false, a saját bannerünk fut
// (jó a Booking-affiliate jelzésre, de ÖNMAGÁBAN NEM elég AdSense-hez).
const USE_COOKIEYES = true;

const COOKIE_CONSENT_KEY = 'rc360_cookie_consent'; // értéke: "accepted" | "rejected"

function initCookieBanner() {
    if (USE_COOKIEYES) return; // a CookieYes saját bannere kezeli ezt

    let stored = null;
    try { stored = localStorage.getItem(COOKIE_CONSENT_KEY); } catch (e) { /* localStorage nem elérhető */ }

    if (!stored) {
        document.getElementById('cookieBanner').classList.add('visible');
    } else if (stored === 'accepted') {
        loadAdsAndAffiliateScripts();
    }
    // ha "rejected": nem csinálunk semmit, a hirdetési/affiliate scriptek nem töltődnek be
}

function setCookieConsent(accepted) {
    try { localStorage.setItem(COOKIE_CONSENT_KEY, accepted ? 'accepted' : 'rejected'); } catch (e) { /* nem elérhető */ }
    document.getElementById('cookieBanner').classList.remove('visible');
    if (accepted) loadAdsAndAffiliateScripts();
}

// A GDPR megköveteli, hogy a hozzájárulás visszavonása/módosítása
// ugyanolyan könnyű legyen, mint a megadása - ez a gomb bármikor,
// bárhonnan (lábléc, jogi modal) újra megnyitja a döntési sávot.
function reopenCookieBanner() {
    closeLegal();
    if (USE_COOKIEYES) {
        // A CookieYes saját "Cookie Settings" felülete nyílik meg,
        // ha a CookieYes widget be van állítva (window.cookieyes API)
        if (window.cookieyes) { window.cookieyes.showSettings(); }
        return;
    }
    document.getElementById('cookieBanner').classList.add('visible');
}

// Ide kell majd behelyettesíteni a tényleges hirdetési/affiliate scripteket
// (pl. Google AdSense, Booking.com affiliate pixel). Ez a függvény
// KIZÁRÓLAG akkor fut le, ha a látogató elfogadta a sütiket - eddig a
// pontig szándékosan üres/placeholder.
function loadAdsAndAffiliateScripts() {
    console.log('[RC360] Hirdetési/affiliate hozzájárulás megadva - ide kerülnek majd a valós script-betöltések.');
    // Példa (kikommentezve, cseréld a saját azonosítóidra):
    // const s = document.createElement('script');
    // s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXX';
    // s.async = true;
    // document.head.appendChild(s);
}

// ================================================================
// 11) JOGI MODAL (Adatvédelem / Impresszum)
// ================================================================
function openLegal(tab) {
    zarjMindentKiveve('modal');   // új munkamenet: minden más bezárul
    document.getElementById('legalModal').classList.add('visible');
    switchLegalTab(tab || 'privacy');
}

function closeLegal() {
    document.getElementById('legalModal').classList.remove('visible');
}

function switchLegalTab(tab) {
    document.getElementById('legalTabPrivacy').classList.toggle('active', tab === 'privacy');
    document.getElementById('legalTabImpresszum').classList.toggle('active', tab === 'impresszum');
    document.getElementById('legalTabTerms').classList.toggle('active', tab === 'terms');
    document.querySelectorAll('.legal-tab-content').forEach(el => {
        el.classList.toggle('active', el.dataset.legal === tab);
    });
}

/* ------------------------------------------------------------
   BIZTONSÁGOS ESEMÉNYKÖTÉS
   ------------------------------------------------------------
   MIÉRT KELL: az index.html-ben a <script src="js/app.js"> tag a
   #legalModal és a #cookieBanner ELŐTT áll, ezért a script futásakor
   ezek az elemek MÉG NEM LÉTEZNEK. A régi kód közvetlenül hívta a
   document.getElementById('legalModal').addEventListener(...) sort,
   ami null-on hívott metódust -> TypeError.

   Ez top-level kódban keletkezett, ezért MEGÁLLÍTOTTA a teljes további
   betöltést: minden ez alatti let/const inicializálatlan maradt, és a
   Pályák menü "Cannot access 'aktualisNyelv' before initialization"
   hibával elszállt. Egyetlen hiányzó elem nem béníthatja meg az oldalt.

   Megoldás: ha az elem még nincs meg, megvárjuk a DOMContentLoaded-ot.
   ------------------------------------------------------------ */
function esemenytKot(elemId, esemeny, kezelo) {
    const kot = () => {
        const el = document.getElementById(elemId);
        if (el) {
            el.addEventListener(esemeny, kezelo);
        } else {
            console.log('[RC360] A(z) #' + elemId + ' elem nem található - az esemény kötése kimarad.');
        }
    };
    if (document.getElementById(elemId)) {
        kot();
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', kot, { once: true });
    } else {
        kot();   // a DOM már kész, de az elem tényleg hiányzik
    }
}

// Modal bezárása háttérre kattintva
esemenytKot('legalModal', 'click', (e) => {
    if (e.target.id === 'legalModal') closeLegal();
});

// ================================================================
// 12) LEGÖRDÜLŐ MENÜK (nyelvválasztó + hamburger)
// ================================================================
function toggleDropdown(id) {
    const menu = document.getElementById(id);
    const isOpen = menu.classList.contains('open');
    // Minden MÁS felület bezárul (ország-ablak, panelek, modalok is)
    zarjMindentKiveve('dropdown');
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
    if (!isOpen) menu.classList.add('open');
}

// ==========================================================
// A LEGÖRDÜLŐ MENÜK ZÁRÓDÁSA
// ==========================================================
// NEM automatikus (nem záródik magától időzítővel vagy azzal, hogy
// az egér elhagyja). Csak akkor csukódik be, ha a látogató
// ténylegesen máshová figyel:
//   1. mellékattintás / -koppintás
//   2. Escape billentyű
//   3. másik munkamenet indul az oldalon (ország kiválasztása,
//      pálya megnyitása, modal, visszatérés a földgömbhöz)
// ==========================================================

function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
}

/* ============================================================
   MUNKAMENET-KEZELÉS
   ------------------------------------------------------------
   ALAPELV: egyszerre EGY felület legyen nyitva.

   Korábban minden nyitó függvény külön-külön zárta be a többit –
   ezért fordulhatott elő, hogy a legördülő menü és az ország-ablak
   egyszerre látszott, egymásra csúszva.

   Mostantól minden nyitó függvény ELŐBB meghívja ezt, és megmondja,
   mit hagyjon nyitva. Ha új felület kerül az oldalra, elég ide
   felvenni – nem kell minden nyitó függvényt átírni.
   ============================================================ */
function zarjMindentKiveve(mitHagyjunk) {
    if (mitHagyjunk !== 'dropdown') closeAllDropdowns();

    if (mitHagyjunk !== 'orszagInfo') {
        const d = document.getElementById('orszagInfo');
        if (d) d.classList.remove('open');
        // A gömb forgása csak akkor indul újra, ha tényleg bezárult
        if (mitHagyjunk !== 'terkep') forgatasIndit();
    }

    if (mitHagyjunk !== 'tracks') {
        const t = document.getElementById('tracksPanel');
        if (t && t.classList.contains('open')) t.classList.remove('open');
    }

    if (mitHagyjunk !== 'modal') {
        const info = document.getElementById('infoModal');
        if (info) info.classList.remove('visible');
        const legal = document.getElementById('legalModal');
        if (legal) legal.classList.remove('visible');
    }

    // ADATLAP (Leaflet popup) - ez korábban KIMARADT a munkamenet-kezelésből,
    // ezért maradhatott nyitva a legördülő menüvel vagy a Pályák panellel
    // egyszerre. Most már minden más munkamenet bezárja.
    if (mitHagyjunk !== 'adatlap' && typeof leafletMap !== 'undefined' && leafletMap) {
        leafletMap.closePopup();
    }
}

// 1) Mellékattintás / -koppintás
//
// MIÉRT 'pointerdown' ÉS 'click' EGYARÁNT:
//   - A 'click' a WebGL-vászonról (földgömb) nem mindig jut el ide,
//     mert a globe.gl saját eseménykezelője elnyelheti.
//   - Érintőképernyőn a 'click' késleltetve érkezik, vagy elmarad.
//   - A 'pointerdown' viszont egér, érintés és toll esetén is azonnal fut.
// A kettő együtt lefedi az összes esetet; a kétszeri bezárás ártalmatlan.
//
// A 'capture: true' azért kell, mert a capture szakasz a dokumentumtól
// LEFELÉ halad, tehát még azelőtt megkapjuk az eseményt, hogy bárki
// lentebb megállíthatná a terjedését.
function menuBezaroKezelo(e) {
    // A target nem mindig Element (lehet szövegcsomópont is),
    // ilyenkor a closest() hibára futna és megállítaná a kezelőt.
    const cel = e.target instanceof Element ? e.target : null;
    if (cel && cel.closest('.dropdown-wrap')) return;
    closeAllDropdowns();
}
document.addEventListener('pointerdown', menuBezaroKezelo, { capture: true });
document.addEventListener('click', menuBezaroKezelo, { capture: true });

// 2) Escape billentyű - a nyitott panelekre és modalokra is
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeAllDropdowns();
    zarOrszagInfo();
    const tracks = document.getElementById('tracksPanel');
    if (tracks && tracks.classList.contains('open')) closeTracksMenu();
    const legal = document.getElementById('legalModal');
    if (legal && legal.classList.contains('visible')) closeLegal();
    const info = document.getElementById('infoModal');
    if (info && info.classList.contains('visible')) closeInfo();
});

// ================================================================
// 13) RÓLUNK / KONTAKT MODAL
// ================================================================
function openInfo(tab) {
    infoModalFrissit();
    zarjMindentKiveve('modal');   // új munkamenet: minden más bezárul
    document.getElementById('infoModal').classList.add('visible');
    switchInfoTab(tab || 'about');
}
function closeInfo() {
    document.getElementById('infoModal').classList.remove('visible');
}
function switchInfoTab(tab) {
    document.getElementById('infoTabAbout').classList.toggle('active', tab === 'about');
    document.getElementById('infoTabContact').classList.toggle('active', tab === 'contact');
    document.querySelectorAll('.legal-tab-content[data-info]').forEach(el => {
        el.classList.toggle('active', el.dataset.info === tab);
    });
}
esemenytKot('infoModal', 'click', (e) => {
    if (e.target.id === 'infoModal') closeInfo();
});

// ================================================================
// 14) NYELVVÁLASZTÁS
// Fontos, őszinte korlát: ez a felhasználói felület kulcs-elemeit
// (gombok, feliratok) fordítja le, NEM a pálya-adatbázis részletes
// leírásait (100+ pálya jegyzete) - az egy külön, nagy volumenű
// fordítási feladat lenne.
// ================================================================
const translations = {
    hu: { back: "Vissza a földgömbhöz", legalTitle: "Adatvédelem / Impresszum", menu: "Menü", lang: "Nyelv / Language",
          menuTracks: "Pályák", menuHistory: "Történelem", menuAbout: "Rólunk", menuContact: "Kontakt", instruction: "Kapcsold be az Ügető szűrőt a pályákkal rendelkező országok megjelenítéséhez" },
    en: { back: "Back to the globe", legalTitle: "Privacy / Legal", menu: "Menu", lang: "Language",
          menuTracks: "Tracks", menuHistory: "History", menuAbout: "About us", menuContact: "Contact", instruction: "Enable the Trotting filter to reveal countries with racecourse data" },
    de: { back: "Zurück zum Globus", legalTitle: "Datenschutz / Impressum", menu: "Menü", lang: "Sprache",
          menuTracks: "Bahnen", menuHistory: "Geschichte", menuAbout: "Über uns", menuContact: "Kontakt", instruction: "Aktiviere den Trab-Filter, um Länder mit Rennbahndaten anzuzeigen" },
    fr: { back: "Retour au globe", legalTitle: "Confidentialité / Mentions légales", menu: "Menu", lang: "Langue",
          menuTracks: "Hippodromes", menuHistory: "Histoire", menuAbout: "À propos", menuContact: "Contact", instruction: "Activez le filtre Trot pour afficher les pays avec des données" },
    sv: { back: "Tillbaka till jordgloben", legalTitle: "Integritet / Juridisk info", menu: "Meny", lang: "Språk",
          menuTracks: "Banor", menuHistory: "Historia", menuAbout: "Om oss", menuContact: "Kontakt", instruction: "Aktivera travfiltret för att visa länder med banor" },
    es: { back: "Volver al globo", legalTitle: "Privacidad / Aviso legal", menu: "Menú", lang: "Idioma",
          menuTracks: "Hipódromos", menuHistory: "Historia", menuAbout: "Sobre nosotros", menuContact: "Contacto", instruction: "Activa el filtro de trote para mostrar los países con datos" },
    it: { back: "Torna al globo", legalTitle: "Privacy / Note legali", menu: "Menu", lang: "Lingua",
          menuTracks: "Ippodromi", menuHistory: "Storia", menuAbout: "Chi siamo", menuContact: "Contatti", instruction: "Attiva il filtro Trotto per mostrare i paesi con dati" },
    ja: { back: "地球儀に戻る", legalTitle: "プライバシー / 法的情報", menu: "メニュー", lang: "言語",
          menuTracks: "競馬場", menuHistory: "歴史", menuAbout: "私たちについて", menuContact: "お問い合わせ", instruction: "「速歩」フィルターをオンにすると、データのある国が表示されます" },
    zh: { back: "返回地球", legalTitle: "隐私 / 法律信息", menu: "菜单", lang: "语言",
          menuTracks: "赛马场", menuHistory: "历史", menuAbout: "关于我们", menuContact: "联系我们", instruction: "开启「快步」筛选以显示有数据的国家" },
    ar: { back: "العودة إلى الكرة الأرضية", legalTitle: "الخصوصية / قانوني", menu: "القائمة", lang: "اللغة",
          menuTracks: "المضامير", menuHistory: "التاريخ", menuAbout: "من نحن", menuContact: "اتصل بنا", instruction: "شغّل مرشح الهرولة لعرض الدول التي تتوفر لها بيانات" }
};

// A felület aktuális nyelve – az országnevek fordításához kell
aktualisNyelv = 'hu';   // a deklaráció a fájl TETEJÉN van, lásd ott az indoklást

function setLanguage(code, btn, isManual = true) {
    const t = translations[code] || translations.hu;
    aktualisNyelv = code;

    // Segédfüggvények: ha egy elem hiányzik (pl. mert a felület
    // átalakult), NE dobjon hibát - egyszerűen kihagyja.
    // Korábban itt egy nem létező '#backBtn .full-text' elemre
    // hivatkoztunk, ami MINDEN nyelvváltást összeomlasztott volna.
    const setTitle = (id, val) => {
        const el = document.getElementById(id);
        if (el && val) el.title = val;
    };
    const setText = (sel, val) => {
        const el = document.querySelector(sel);
        if (el && val) el.textContent = val;
    };

    // A "Vissza" gomb csak ikon, szöveg nélkül - a fordítás a
    // tooltipbe kerül.
    setTitle('backBtn', t.back);
    setTitle('legalInfoBtn', t.legalTitle);
    setTitle('hamburgerBtn', t.menu);
    setTitle('langBtn', t.lang);
    // Ha épp nyitva van a Pályák panel, újraépítjük – különben a régi
    // nyelven maradnának benne az országnevek.
    const tp = document.getElementById('tracksPanel');
    if (tp && tp.classList.contains('open') && typeof buildTracksMenu === 'function') {
        try { buildTracksMenu(); } catch (e) { /* ne állítsa meg a nyelvváltást */ }
    }
    // A gomb felirata az AKTUÁLIS nyelv rövidítése (HU, EN, DE...) –
    // így egy pillantásra látszik, milyen nyelven van az oldal.
    const langBtn = document.getElementById('langBtn');
    if (langBtn) langBtn.textContent = String(code).toUpperCase();

    setText('[data-i18n="menuTracks"]', t.menuTracks);
    setText('[data-i18n="menuHistory"]', t.menuHistory);
    setText('[data-i18n="menuAbout"]', t.menuAbout);
    setText('[data-i18n="menuContact"]', t.menuContact);
    // Az utasítássáv el lett távolítva a főképernyőről – az utasítás
    // mostantól az ország fölé húzott címkében jelenik meg.

    // A Rólunk / Kontakt szövegek is kövessék a nyelvváltást.
    infoModalFrissit();

    // Arab nyelvnél jobbról-balra irányítás a fejléc jobb oldali csoportjára
    document.documentElement.dir = (code === 'ar') ? 'rtl' : 'ltr';

    document.querySelectorAll('#langMenu button').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));

    // Ha a látogató KÉZZEL választott nyelvet, azt eltároljuk, hogy a
    // következő látogatáskor ezt tiszteletben tartsuk, és NE írja felül
    // az automatikus országfelismerés.
    if (isManual) {
        try { localStorage.setItem('rc360_lang_manual', code); } catch (e) { /* nem elérhető */ }
    }
}

// ================================================================
// 15) AUTOMATIKUS ORSZÁG-FELISMERÉS ÉS NYELVVÁLASZTÁS
// Ingyenes, kulcs nélküli IP-geolokációs szolgáltatással (ipwho.is)
// megállapítjuk, melyik országból érkezik a látogató, és ez alapján
// automatikusan beállítjuk a felület nyelvét - kivéve, ha korábban
// már kézzel választott nyelvet (azt mindig tiszteletben tartjuk).
// ================================================================
const COUNTRY_TO_LANG = {
    HU: 'hu', GB: 'en', US: 'en', IE: 'en', AU: 'en', CA: 'en',
    DE: 'de', AT: 'de', CH: 'de',
    FR: 'fr', BE: 'fr',
    SE: 'sv',
    ES: 'es', MX: 'es', AR: 'es',
    IT: 'it',
    JP: 'ja',
    CN: 'zh', TW: 'zh', HK: 'zh',
    SA: 'ar', AE: 'ar', EG: 'ar', QA: 'ar'
};

async function detectAndSetLanguage() {
    let manual = null;
    try { manual = localStorage.getItem('rc360_lang_manual'); } catch (e) { /* nem elérhető */ }

    if (manual) {
        // A látogató korábban már kézzel választott nyelvet - azt használjuk,
        // nem írjuk felül automatikus felismeréssel.
        setLanguage(manual, null, false);
        return;
    }

    try {
        // Időtúllépés: ha a geolokációs szolgáltatás lassú vagy nem
        // válaszol, 3 másodperc után feladjuk. Enélkül a kérés
        // percekig lóghatna a háttérben.
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        const res = await fetch('https://ipwho.is/', { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (data && data.success !== false && data.country_code) {
            const langCode = COUNTRY_TO_LANG[data.country_code] || 'en';
            setLanguage(langCode, null, false);
        }
    } catch (e) {
        // Ha a geolokációs szolgáltatás nem elérhető, egyszerűen
        // magyar marad az alapértelmezett felület - nincs hibaüzenet,
        // a felhasználó ettől még bármikor kézzel válthat nyelvet.
        console.log('[RC360] Automatikus nyelvfelismerés nem elérhető, alapértelmezett marad.');
    }
}


// ================================================================
// 16) PÁLYÁK BÖNGÉSZŐ (hamburger menü -> Pályák)
// Háromszintű: menü -> országok -> pályák. Oldalról nyílik be,
// hogy ne fedje el a térkép közepét.
// ================================================================

function buildTracksMenu() {
    const body = document.getElementById('tracksPanelBody');
    if (!body) { console.error('[RC360] tracksPanelBody nem található'); return; }

    // A rendezés a LEFORDÍTOTT név szerint történik, különben magyar
    // felületen angol ábécésorrendben jelennének meg az országok.
    // A localeCompare a felület nyelvét kapja meg, hogy az ékezetes
    // betűk (á, ö, ü, š) a helyes sorrendbe kerüljenek.
    const isos = Object.keys(trackDatabase).sort((a, b) =>
        orszagNev(a).localeCompare(orszagNev(b), aktualisNyelv || 'hu'));

    // FONTOS: minden ország FELDOLGOZÁSA külön try/catch-ben történik.
    // Korábban egyetlen hibás pálya-rekord (pl. hiányzó mező) az EGÉSZ
    // listát kiüríthette, mert a dobott hiba megszakította a teljes
    // .map()-et, mielőtt bármi is body.innerHTML-be került volna - a
    // felhasználó ekkor semmit nem látott a "Pályák" menüben, hibaüzenet
    // nélkül. Mostantól egy hibás ország kimarad (és a konzolba ír),
    // a többi ország listája viszont megjelenik.
    const reszek = [];
    for (const iso of isos) {
        try {
            reszek.push(buildOrszagBlokk(iso));
        } catch (err) {
            console.error('[RC360] Hiba a "' + iso + '" ország pályalistájának felépítésekor - '
                + 'ez az ország kimarad a menüből, a többi rendben megjelenik:', err);
        }
    }

    if (reszek.length === 0) {
        body.innerHTML = '<p style="color:#f87171;padding:12px;">'
            + 'A pályalista felépítése hibára futott. Nézd meg a böngésző konzolját '
            + '(F12 → Console) a részletekért.</p>';
        console.error('[RC360] buildTracksMenu: EGYETLEN ország sem épült fel - '
            + 'ellenőrizd a trackDatabase/countryMeta adatok épségét.');
        return;
    }

    body.innerHTML = reszek.join('');
}

// Egyetlen ország blokkjának felépítése (ország-gomb + pályalista/régiók).
// KÜLÖN függvénybe kiemelve, hogy a buildTracksMenu országonként tudja
// elkapni a hibát (lásd fent).
function buildOrszagBlokk(iso) {
    const tracks = trackDatabase[iso] || [];

    // LAPOS LISTA: Ország -> Pálya.
    // A korábbi háromszintű (Ország -> Állam/Régió -> Pálya) változat
    // vissza lett vonva a régió-színezéssel együtt: kevesebb mozgó
    // alkatrész, kevesebb hibalehetőség. A `region` mező benne marad az
    // adatban - ha később mégis kellene, van mire építeni.
    const rows = tracks.map((t, idx) => {
        const st = statuszSzoveg(t.status || 'active');
        // VALÓDI LINK, nem gomb. Két okból:
        //   1) A keresőrobot csak <a href>-et követ. Gombbal a statikus
        //      pálya-oldalak "árva" oldalak lennének: csak a sitemapből
        //      derülne ki, hogy léteznek, ami sokkal gyengébb jelzés.
        //   2) A látogató új lapon is megnyithatja, és akkor a teljes
        //      adatlapot kapja.
        // A jumpToTrack a kattintást elfogja (preventDefault), így a
        // MEGSZOKOTT viselkedés marad: nincs oldalbetöltés, a földgömb
        // a helyén marad. Csak új lapon / középső gombbal navigál el.
        const url = statikusUrl(iso, t);
        return '<a class="tp-track" href="' + url + '"'
             + ' onclick="return jumpToTrack(\'' + iso + '\',' + idx + ', event)">'
             + '<span class="tp-tname">' + t.name + '</span>'
             + '<span class="tp-tmeta">' + t.city + '</span>'
             + '<span class="tp-status ' + st.cls + '"><span class="tp-dot"></span>' + st.label + '</span>'
             + '</a>';
    }).join('');

    // Zászló szándékosan nincs - a kérésnek megfelelően csak az országnév
    return '<button class="tp-country" onclick="toggleCountryGroup(this)">'
         + '<span>' + orszagNev(iso) + '</span>'
         + '<span><span class="tp-count">' + tracks.length + ' pálya</span> <span class="tp-arrow">&#9654;</span></span>'
         + '</button>'
         + '<div class="tp-tracks">' + rows + '</div>';
}

function toggleCountryGroup(btnEl) {
    const list = btnEl.nextElementSibling;
    const isOpen = list.classList.contains('open');
    // Csak egy ország legyen nyitva egyszerre - átláthatóbb
    document.querySelectorAll('#tracksPanelBody .tp-tracks').forEach(el => el.classList.remove('open'));
    document.querySelectorAll('#tracksPanelBody .tp-country').forEach(el => el.classList.remove('open'));
    if (!isOpen) { list.classList.add('open'); btnEl.classList.add('open'); }
}

// Régió-szintű kinyitás/becsukás - ugyanaz a "csak egy legyen nyitva" elv,
// de csak a SAJÁT ország dobozán belül, hogy más ország állapotát ne
// érintse (a felhasználó egyszerre több országot is nyitva tarthat, ha a
// tp-country szint azt engedné - jelenleg nem engedi, de a régió-szint
// önmagában konzisztens marad, ha ez később változna).

/**
 * TÖRTÉNELEM menüpont.
 *
 * A pályalistával ellentétben ez VALÓDI navigáció: a történeti
 * tartalom statikus oldalakon él, nem a földgömb adatában. Nincs
 * mit „azonnal" megjeleníteni, tehát nincs értelme elfogni a
 * kattintást.
 *
 * A menüt előbb bezárjuk, hogy visszalépéskor ne maradjon nyitva.
 */
function openHistoryMenu() {
    // A projektben nincs closeAllMenus() – a legördülőket mindenhol
    // ezzel az egy sorral zárják. Ugyanazt a mintát követjük.
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
    const nyelv = aktualisNyelv || 'hu';
    window.location.href = '/' + nyelv + '/history/';
}

/* ============================================================
   ÉRKEZÉS A STATIKUS ADATLAPRÓL  (?track=ISO:slug)
   ------------------------------------------------------------
   A statikus pálya-oldalakon lévő „Megnézem a földgömbön" gomb
   ilyen címre mutat:  /?track=FRA:hippodrome-de-cabourg

   E nélkül a kezelés nélkül a látogató az ALAPÁLLAPOTÚ földgömbre
   érkezne: szakág nincs kiválasztva, a pálya nem látszik sehol –
   vagyis a gomb nem csinálna semmit. Ezért itt:

     1) bekapcsoljuk az ügető szűrőt (ez kell ahhoz, hogy az
        országok egyáltalán megjelenjenek),
     2) megnyitjuk az adott ország 2D térképét,
     3) ráugrunk a pályára és kinyitjuk az adatlapját.

   A paramétert a feldolgozás után KITÖRÖLJÜK a címsorból
   (replaceState), hogy frissítéskor ne induljon újra az egész,
   és hogy a megosztott link tiszta maradjon.
   ============================================================ */
function erkezesStatikusOldalrol() {
    const p = new URLSearchParams(window.location.search).get('track');
    if (!p) return;

    const ketto = p.indexOf(':');
    if (ketto < 1) return;
    const iso = p.slice(0, ketto);
    const slug = p.slice(ketto + 1);

    const palyak = trackDatabase[iso];
    if (!palyak) return;
    const idx = palyak.findIndex(t => t.slug === slug);
    if (idx < 0) return;   // ismeretlen slug – csendben a földgömbön maradunk

    // A cím megtisztítása, még mielőtt bármi hosszabb elindulna.
    window.history.replaceState({}, '', window.location.pathname);

    const inditas = () => {
        // Az ügető szűrő bekapcsolása. A setFilter kapcsolóként
        // működik, ezért csak akkor hívjuk, ha még nem ez az aktív –
        // különben épp kikapcsolnánk.
        if (currentFilter !== 'trot') {
            const gomb = document.querySelector('.filter-btn.btn-trot');
            setFilter('trot', gomb);
        }
        // A jumpToTrack esemény nélkül hívva nem navigál sehova,
        // csak megnyitja a térképet és az adatlapot.
        jumpToTrack(iso, idx);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(inditas, 300), { once: true });
    } else {
        setTimeout(inditas, 300);
    }
}

erkezesStatikusOldalrol();

/* ============================================================
   STATIKUS OLDALAK URL-JE
   ------------------------------------------------------------
   A generator.mjs által előállított, kereshető adatlapok címe:

       /{nyelv}/tracks/{orszag-slug}/{palya-slug}/

   Az országslug forrása a tools/orszagok.json – itt csak a
   ténylegesen szükséges leképezést tartjuk, hogy a földgömb ne
   függjön egy külön fájl betöltésétől.

   FONTOS: ha új ország kerül az adatbázisba, ezt a táblát is
   bővíteni kell, KÜLÖNBEN a link a listaoldalra esik vissza.
   A generátor validálása ezt nem tudja ellenőrizni (az csak a
   tools/orszagok.json-t nézi), ezért érdemes a kettőt együtt
   frissíteni.
   ============================================================ */
const ORSZAG_SLUG = {
    SWE: 'sweden', FRA: 'france', ITA: 'italy', FIN: 'finland',
    NOR: 'norway', POL: 'poland', CZE: 'czech-republic', SVK: 'slovakia',
    HUN: 'hungary', EST: 'estonia', USA: 'united-states', CAN: 'canada',
    AUS: 'australia', NZL: 'new-zealand', DNK: 'denmark', DEU: 'germany',
    AUT: 'austria', NLD: 'netherlands', ESP: 'spain', BEL: 'belgium',
    GBR: 'great-britain', IRL: 'ireland', LTU: 'lithuania', MLT: 'malta',
    SRB: 'serbia', SVN: 'slovenia', CHE: 'switzerland', UKR: 'ukraine',
    RUS: 'russia', ROU: 'romania'
};

function statikusUrl(iso, palya) {
    const nyelv = aktualisNyelv || 'hu';
    const oSlug = ORSZAG_SLUG[iso];
    // Ha bármelyik hiányzik, az országlistára esünk vissza – törött
    // link soha ne keletkezzen.
    if (!oSlug) return '/' + nyelv + '/tracks/';
    if (!palya || !palya.slug) return '/' + nyelv + '/tracks/' + oSlug + '/';
    return '/' + nyelv + '/tracks/' + oSlug + '/' + palya.slug + '/';
}

/* ------------------------------------------------------------
   KÉPERNYŐN LÁTHATÓ DIAGNOSZTIKA
   ------------------------------------------------------------
   MIÉRT KELL: mobilon nem lehet fejlesztői konzolt nyitni, ezért
   ha valami elromlik, a felhasználó csak annyit lát, hogy "nem
   működik" - a hiba oka rejtve marad. Ez a függvény a már meglévő
   #geoStatus dobozba írja ki az állapotot, ami a képernyő alján
   látszik. Ha minden rendben, 4 másodperc után eltűnik.
   ------------------------------------------------------------ */
function allapotKiir(szoveg, hiba) {
    const doboz = document.getElementById('geoStatus');
    if (!doboz) return;
    doboz.textContent = szoveg;
    doboz.style.display = 'block';
    doboz.style.color = hiba ? '#fca5a5' : '';
    doboz.style.zIndex = '900';
    if (!hiba) {
        clearTimeout(allapotKiir._id);
        allapotKiir._id = setTimeout(() => { doboz.style.display = 'none'; }, 4000);
    }
}

function openTracksMenu() {
    try {
        const panel = document.getElementById('tracksPanel');
        if (!panel) {
            allapotKiir('HIBA: a #tracksPanel elem nincs az index.html-ben', true);
            return;
        }

        zarjMindentKiveve('tracks');
        buildTracksMenu();
        panel.classList.add('open');

        // Ellenőrizzük, hogy tényleg megtelt-e és tényleg nyitva van-e
        const body = document.getElementById('tracksPanelBody');
        const hossz = body ? body.innerHTML.length : 0;
        const nyitva = panel.classList.contains('open');
        const orszagDb = Object.keys(trackDatabase).length;
        let palyaDb = 0;
        for (const v of Object.values(trackDatabase)) palyaDb += v.length;

        if (hossz === 0) {
            allapotKiir('HIBA: a Pályák lista ÜRES maradt (' + orszagDb + ' ország, ' + palyaDb + ' pálya az adatban)', true);
        } else if (!nyitva) {
            allapotKiir('HIBA: a lista felépült, de a panel nem nyílt ki (CSS-gond?)', true);
        } else {
            allapotKiir('Pályák: ' + orszagDb + ' ország, ' + palyaDb + ' pálya betöltve', false);
        }
    } catch (err) {
        allapotKiir('HIBA a Pályák menüben: ' + (err && err.message ? err.message : err), true);
        console.error('[RC360] A Pályák menü megnyitása nem sikerült:', err);
    }
}
function closeTracksMenu() {
    const p = document.getElementById('tracksPanel');
    if (p) p.classList.remove('open');
}

// Egy konkrét pályára navigál: ha kell, előbb betölti az ország
// térképnézetét, majd rázoomol és megnyitja a felugró adatlapot.
function jumpToTrack(iso, idx, esemeny) {
    // A lista elemei valódi <a href> linkek (a keresőrobot miatt), de a
    // MEGSZOKOTT viselkedés az azonnali térképre ugrás, oldalbetöltés
    // nélkül. Ezért a kattintást itt elfogjuk.
    //
    // KIVÉTEL: ha a látogató szándékosan új lapon akarja megnyitni
    // (Ctrl/Cmd+kattintás, középső egérgomb, Shift), NEM avatkozunk be –
    // ilyenkor a böngésző a statikus adatlapot nyitja meg, ami helyes.
    if (esemeny) {
        const ujLap = esemeny.ctrlKey || esemeny.metaKey ||
                      esemeny.shiftKey || esemeny.button === 1;
        if (ujLap) return true;   // hagyjuk a böngészőre
        esemeny.preventDefault();
    }

    closeTracksMenu();
    const t = trackDatabase[iso][idx];

    const openIt = () => {
        leafletMap.setView([t.lat, t.lng], 12, { animate: true });
        markerLayerGroup.eachLayer(m => {
            const ll = m.getLatLng();
            if (Math.abs(ll.lat - t.lat) < 0.0001 && Math.abs(ll.lng - t.lng) < 0.0001) m.openPopup();
        });
    };

    if (currentIso === iso && document.getElementById('mapLayer').classList.contains('visible')) {
        openIt();
    } else {
        currentIso = iso;
        document.getElementById('filterContainer').classList.add('disabled');
        document.getElementById('instructionBar').style.opacity = '0';
        showMap(iso);
        setTimeout(openIt, 500);
    }
    return false;   // az onclick="return jumpToTrack(...)" így nem navigál
}

// ================================================================
// NAPPAL / ÉJSZAKA KAPCSOLÓ
// ================================================================
// A gomb a bal szélen, függőlegesen középen található.
// Az ikon a CÉLÁLLAPOTOT mutatja: nappal a holdat (arra lehet
// váltani), éjszaka a napot. A tooltip és az aria-label mindig
// kimondja a műveletet, hogy ne lehessen félreérteni.
// ================================================================

// A gomb megjelenésének szinkronizálása az állapottal.
// Külön függvény, hogy induláskor és váltáskor is ugyanaz fusson.
function syncDayNightButton() {
    const btn = document.getElementById('dayNightBtn');
    if (!btn) return;

    btn.dataset.mode = isNightMode ? 'night' : 'day';

    // A felirat MINDIG a műveletet írja le, nem az állapotot
    const label = isNightMode ? 'Váltás világos Földre' : 'Váltás éjszakai Földre';
    btn.title = label;
    btn.setAttribute('aria-label', label);
}

function toggleDayNight() {
    isNightMode = !isNightMode;

    if (world) {
        world.globeImageUrl(pickGlobeTexture());
    }
    syncDayNightButton();
}

// A gomb csak a 3D földgömb nézetben látszik - a 2D térképen
// nincs mit váltani, ezért ott elrejtjük.
function setDayNightButtonVisible(visible) {
    const btn = document.getElementById('dayNightBtn');
    if (btn) btn.classList.toggle('hidden', !visible);
}

// Induláskor beállítjuk a gombot a helyi idő szerinti állapotra
syncDayNightButton();

// Indításkor ellenőrizzük a cookie-hozzájárulás állapotát
initCookieBanner();

// Indításkor megpróbáljuk automatikusan felismerni a látogató országát/nyelvét
detectAndSetLanguage();
