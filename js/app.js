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
        { name: "Jägersro", city: "Malmö", lat: 55.5699, lng: 13.0697, founded: 1907, status: "active", length: 1000, direction: "left", org: "Skånska Travsällskapet / Svensk Travsport", ownSite: "https://www.travsport.se/travbanor/jagersro/", operatorSite: null, operatorName: null, note: "Svédország legrégebbi pályája; egyetlen kombinált ügető-galopp aréna" },
        { name: "Solvalla", city: "Stockholm", lat: 59.3666, lng: 17.9397, founded: 1927, status: "active", length: 1000, direction: "left", org: "Stockholms Travsällskap / Svensk Travsport", ownSite: "https://www.solvalla.se/", operatorSite: null, operatorName: null, note: "Skandinávia legnagyobb pályája; az Elitloppet otthona", image: { url: "https://commons.wikimedia.org/wiki/File:Solvalla_1.JPG", license: "CC BY-SA 3.0", attribution: "Jan Ainali", verified: true } },
        { name: "Åbytravet", city: "Mölndal", lat: 57.6500, lng: 12.0017, founded: 1936, status: "active", length: 1000, direction: "left", org: "Svensk Travsport", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Svédország 2. legnagyobb pályája" },
        { name: "Färjestad", city: "Karlstad", lat: 59.4085, lng: 13.5006, founded: 1936, status: "active", length: 1000, direction: "left", org: "Svensk Travsport", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Unionstravet – közös svéd-norvég futam", image: { url: "https://commons.wikimedia.org/wiki/File:Färjestad_Travbana.JPG", license: "CC BY-SA 3.0", attribution: "Janee", verified: true } },
        { name: "Bergsåkers travbana", city: "Sundsvall", lat: 62.4151, lng: 17.2269, founded: 1932, status: "active", length: 1000, direction: "left", org: "Norrlands Travsällskap / Svensk Travsport", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", finalStraight: 200, width: 21.5, openStretch: false, note: "Svédország 3. legrégebbi pályája. Svensk Travsport adatai: 1000 m, 200 m célegyenes (az ország egyik leghosszabbja), 21,5 m szélesség, nincs open stretch. Az ország harmadik legrégebbi pályája, 1932. június 24-én avatták; a Norrlands Travsällskap egy évvel korábban alakult. Solvalla, Åby és Jägersro után a negyedik legnagyobb svéd pálya." },
        { name: "Axevalla travbana", city: "Axvall", lat: 58.4006, lng: 13.5642, founded: 1956, status: "active", length: 1000, direction: "left", org: "Svensk Travsport", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Az ország leghosszabb célegyenese" },
        { name: "Sundbyholms travbana", city: "Eskilstuna", lat: 59.4388, lng: 16.6138, founded: 1955, status: "active", length: 1000, direction: "left", org: "Sörmlands Travsällskap", ownSite: "https://www.sundbyholm.com/", operatorSite: null, operatorName: null, note: "A Breeders' Crown döntőinek helyszíne 2008 óta" },
        { name: "Bodentravet", city: "Boden", lat: 65.8133, lng: 21.7057, founded: 1944, status: "active", length: 1000, direction: "left", org: "Norrbottens Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Svédország legészakibb travbanája" },
        { name: "Gävletravet", city: "Gävle", lat: 60.6885, lng: 17.1384, founded: 1938, status: "active", length: 1000, direction: "left", org: "Gefle-Dala Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "\"Sveriges snabbaste bana\" – az ország leggyorsabb pályája" },
        { name: "Hagmyren", city: "Hudiksvall", lat: 61.7729, lng: 17.1145, founded: 1956, status: "active", length: 1000, direction: "left", org: "Norra Hälsinglands Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "A legendás Nordin fivérek szülőföldje" },
        { name: "Halmstadtravet", city: "Halmstad", lat: 56.6905, lng: 12.9277, founded: 1969, status: "active", length: 1000, direction: "left", org: "Hallands Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Sprintermästaren futam helyszíne" },
        { name: "Hotingtravet", city: "Hoting", lat: 64.0875, lng: 16.2358, founded: 1967, status: "active", length: 800, direction: "left", org: "Västra Ångermanlands Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Évi mindössze 3 versenynap" },
        { name: "Kalmartravet", city: "Kalmar", lat: 56.6680, lng: 16.2717, founded: 1965, status: "active", length: 1000, direction: "left", org: "Sydöstra Sveriges Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Sibylla svéd hercegnő nyitotta meg" },
        { name: "Karlshamnstravet", city: "Asarum", lat: 56.2228, lng: 14.8313, founded: 1993, status: "active", length: 800, direction: "left", org: "Blekinge Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "A nézők a pálya belső terében állnak" },
        { name: "Fornaboda travbana", city: "Lindesberg", lat: 59.6295, lng: 15.1741, founded: 1951, status: "active", length: 1000, direction: "left", org: "Lindes Travklubb", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Korábban a befagyott Lindessjön tavon versenyeztek" },
        { name: "Lyckseletravet", city: "Lycksele", lat: 64.5521, lng: 18.7160, founded: 1955, status: "active", length: 1000, direction: "left", org: "Lycksele Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Nyári lóhét a helyi közösségi élet csúcspontja" },
        { name: "Mantorp Hästsportarena", city: "Mantorp", lat: 58.3695, lng: 15.2837, founded: 1965, status: "active", length: 1000, direction: "left", org: "Östergötlands Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "A legendás Ina Scot nevű ló itt van eltemetve" },
        { name: "Ovallatravet", city: "Oviken", lat: 62.9978, lng: 14.3773, founded: 1971, status: "active", length: 800, direction: "left", org: "Ovikens Travklubb", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "800 m-es kispálya" },
        { name: "Romme travbana", city: "Borlänge", lat: 60.4529, lng: 15.5005, founded: 1955, status: "active", length: 1000, direction: "left", org: "Svensk Travsport", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Rommeheatet – melegvérűek futama" },
        { name: "Rättviks travbana", city: "Rättvik", lat: 60.9021, lng: 15.1156, founded: 1955, status: "active", length: 1000, direction: "left", org: "Siljans Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Itt indult Olle Goop, Svédország legsikeresebb hajtójának pályafutása" },
        { name: "Skellefteåtravet", city: "Skellefteå", lat: 64.7325, lng: 20.9492, founded: 1952, status: "active", length: 1000, direction: "left", org: "Skellefteortens Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Az egyik két svéd pálya \"open stretch\" előzősávval" },
        { name: "Solänget", city: "Örnsköldsvik", lat: 63.2861, lng: 18.6352, founded: 1952, status: "active", length: 1004, direction: "left", org: "Svensk Travsport", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Mellanbana kategóriájú pálya" },
        { name: "Tingsrydtravet", city: "Tingsryd", lat: 56.5118, lng: 14.9960, founded: 2003, status: "active", length: 1609, direction: "left", org: "Svensk Travsport", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Svédország egyetlen \"mile\" (1609 m) pályája", image: { url: "https://commons.wikimedia.org/wiki/File:Tingsryd_Travbana.JPG", license: "Public domain (PD-self)", attribution: "CHG", verified: true } },
        { name: "Umåkers travbana", city: "Umeå", lat: 63.8209, lng: 20.1779, founded: 1944, status: "active", length: 1000, direction: "left", org: "Svensk Travsport", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Egész évben rendeznek itt versenyt" },
        { name: "Vaggerydstravet", city: "Vaggeryd", lat: 57.5226, lng: 14.1117, founded: 1995, status: "active", length: 1000, direction: "left", org: "Jönköping-Vaggeryds Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "SmålandsMästaren futam helyszíne" },
        { name: "Visbytravet", city: "Gotland", lat: 57.6175, lng: 18.3288, founded: 1948, status: "active", length: 1000, direction: "left", org: "Gotlands Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Szigeti pálya, csak nyáron üzemel" },
        { name: "Åmålstravet", city: "Åmål", lat: 59.0335, lng: 12.7051, founded: 1953, status: "active", length: 800, direction: "right", org: "Dalslands Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Az egyetlen pálya, ahol jobbkéz irányban versenyeznek" },
        { name: "Årjängstravet", city: "Årjäng", lat: 59.3900, lng: 12.1557, founded: 1936, status: "active", length: 1000, direction: "left", org: "Nordmarkens Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Sokak szerint Svédország legszebb ügetőpályája" },
        { name: "Örebrotravet", city: "Örebro", lat: 59.2191, lng: 15.1611, founded: 1954, status: "active", length: 1000, direction: "left", org: "Örebro Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Örebro Int'l – 3140 m-es stayer-futam" },
        { name: "Östersundstravet", city: "Östersund", lat: 63.1643, lng: 14.6730, founded: 1936, status: "active", length: 1000, direction: "left", org: "Jämtlands Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Az ország 2. leghosszabb célegyenese" },
        { name: "Bollnästravet", city: "Bollnäs", lat: 61.3403, lng: 16.3356, founded: 1955, status: "active", length: 1000, direction: "left", org: "Svensk Travsport", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "Hälsingland régió egyik pályája" },
        { name: "Dannero travbana", city: "Kramfors", lat: 63.0207, lng: 17.8045, founded: 1958, status: "active", length: 1000, direction: "left", org: "Ådalens Travsällskap", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "2005-ös tűz után teljesen megújult" },
        { name: "Arvika travbana", city: "Arvika", lat: 59.6574, lng: 12.6221, founded: 1954, status: "active", length: 800, direction: "left", org: "Wermlands Trafvarsällskap (1882)", ownSite: null, operatorSite: "https://www.travsport.se/", operatorName: "Svensk Travsport", note: "A Wermlands Trafvarsällskap (1882) Svédország legrégebbi ügető-egyesülete" }
    ],
    FRA: [
        { name: "Hippodrome de Aurillac", city: "Aurillac", lat: 44.9085741, lng: 2.428881, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: SUD-OUEST. LeTrot-azonosító: 1501. Adatlap: https://www.letrot.com/hippodromes/aurillac/1501. Koordináta forrása: OpenStreetMap (Nominatim) + GeoNames (12495056). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Bollene", city: "Bollene", lat: 44.287895618431, lng: 4.7617875231637, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: SUD-EST. LeTrot-azonosító: 8402. Adatlap: https://www.letrot.com/hippodromes/bollene/8402. Koordináta forrása: Wikidata Q48759538 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Deauville-Clairefontaine", city: "Deauville-Clairefontaine", lat: 49.34611111, lng: 0.05694444, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: BASSE-NORMANDIE. LeTrot-azonosító: 1403. Adatlap: https://www.letrot.com/hippodromes/deauville-clairefontaine/1403. Koordináta forrása: Wikidata Q3135875 + Wikipédia (fr) – Hippodrome de Deauville-Clairefontaine + GeoNames (8378947). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Dieppe", city: "Dieppe", lat: 49.910603, lng: 1.09447, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: HAUTE-NORMANDIE ET ILE DE FRANCE. LeTrot-azonosító: 7608. Adatlap: https://www.letrot.com/hippodromes/dieppe/7608. Koordináta forrása: Wikidata Q3135872 + OpenStreetMap (Nominatim) + Wikipédia (fr) – Hippodrome de Dieppe. Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Landivisiau", city: "Landivisiau", lat: 48.53732, lng: -4.05162, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: OUEST. LeTrot-azonosító: 2904. Adatlap: https://www.letrot.com/hippodromes/landivisiau/2904. Koordináta forrása: Wikidata Q120209317 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Bacqueville-En-Caux", city: "Bacqueville-En-Caux", lat: 49.78915, lng: 1.00382, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: HAUTE-NORMANDIE ET ILE DE FRANCE. LeTrot-azonosító: 7603. Adatlap: https://www.letrot.com/hippodromes/bacqueville-en-caux/7603. Koordináta forrása: Wikidata Q3135855 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Bagnoles de L'Orne", city: "Bagnoles de L'Orne", lat: 48.56141429, lng: -0.41758776, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: BASSE-NORMANDIE. LeTrot-azonosító: 6103. Adatlap: https://www.letrot.com/hippodromes/bagnoles-de-l-orne/6103. Koordináta forrása: Wikidata Q112660013 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Bernay", city: "Bernay", lat: 49.08594, lng: 0.611957, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: HAUTE-NORMANDIE ET ILE DE FRANCE. LeTrot-azonosító: 2701. Adatlap: https://www.letrot.com/hippodromes/bernay/2701. Koordináta forrása: Wikidata Q3135859 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Carcassonne", city: "Carcassonne", lat: 43.223055555555554, lng: 2.373611111111111, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: SUD-OUEST. LeTrot-azonosító: 1101. Adatlap: https://www.letrot.com/hippodromes/carcassonne/1101. Koordináta forrása: Wikidata Q3135952 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Carentan", city: "Carentan", lat: 49.31315, lng: -1.237115, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: BASSE-NORMANDIE. LeTrot-azonosító: 5005. Adatlap: https://www.letrot.com/hippodromes/carentan/5005. Koordináta forrása: Wikidata Q3135867 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Carpentras", city: "Carpentras", lat: 44.037581, lng: 5.06474018, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: SUD-EST. LeTrot-azonosító: 8403. Adatlap: https://www.letrot.com/hippodromes/carpentras/8403. Koordináta forrása: Wikidata Q3135916 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Castillonnes", city: "Castillonnes", lat: 44.65879, lng: 0.60481, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: SUD-OUEST. LeTrot-azonosító: 4702. Adatlap: https://www.letrot.com/hippodromes/castillonnes/4702. Koordináta forrása: Wikidata Q120235055 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Challans", city: "Challans", lat: 46.83045661, lng: -1.88904762, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: OUEST. LeTrot-azonosító: 8501. Adatlap: https://www.letrot.com/hippodromes/challans/8501. Koordináta forrása: Wikidata Q112659960 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Chalons-En-Champagne", city: "Chalons-En-Champagne", lat: 48.9215546, lng: 4.3004715, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: EST. LeTrot-azonosító: 5101. Adatlap: https://www.letrot.com/hippodromes/chalons-en-champagne/5101. Koordináta forrása: Wikidata Q112659993 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Chartres", city: "Chartres", lat: 48.45181280136668, lng: 1.5101480376720429, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: HAUTE-NORMANDIE ET ILE DE FRANCE. LeTrot-azonosító: 2801. Adatlap: https://www.letrot.com/hippodromes/chartres/2801. Koordináta forrása: Wikidata Q3135870 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Chateauroux", city: "Chateauroux", lat: 46.813034, lng: 1.669005, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: CENTRE-EST. LeTrot-azonosító: 3601. Adatlap: https://www.letrot.com/hippodromes/chateauroux/3601. Koordináta forrása: Wikidata Q3135981 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Chatelaillon-La Rochelle", city: "Chatelaillon-La Rochelle", lat: 46.0748, lng: -1.07948, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: SUD-OUEST. LeTrot-azonosító: 1702. Adatlap: https://www.letrot.com/hippodromes/chatelaillon-la-rochelle/1702. Koordináta forrása: Wikidata Q104873604 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Chatillon-Sur-Chalaronne", city: "Chatillon-Sur-Chalaronne", lat: 46.1256837, lng: 4.9640494, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: CENTRE-EST. LeTrot-azonosító: 101. Adatlap: https://www.letrot.com/hippodromes/chatillon-sur-chalaronne/101. Koordináta forrása: Wikidata Q112660001 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Cluny", city: "Cluny", lat: 46.436457, lng: 4.670237, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: CENTRE-EST. LeTrot-azonosító: 7101. Adatlap: https://www.letrot.com/hippodromes/cluny/7101. Koordináta forrása: Wikidata Q120292334 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Compiegne", city: "Compiegne", lat: 49.411759, lng: 2.843206, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: NORD. LeTrot-azonosító: 6001. Adatlap: https://www.letrot.com/hippodromes/compiegne/6001. Koordináta forrása: Wikidata Q3135986 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Cordemais", city: "Cordemais", lat: 47.28362517, lng: -1.87960625, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: OUEST. LeTrot-azonosító: 4405. Adatlap: https://www.letrot.com/hippodromes/cordemais/4405. Koordináta forrása: Wikidata Q112659962 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Dreux", city: "Dreux", lat: 48.76667007244882, lng: 1.3638389003276823, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: HAUTE-NORMANDIE ET ILE DE FRANCE. LeTrot-azonosító: 2802. Adatlap: https://www.letrot.com/hippodromes/dreux/2802. Koordináta forrása: Wikidata Q3135873 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Durtal", city: "Durtal", lat: 47.66298, lng: -0.225894, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: ANJOU-MAINE. LeTrot-azonosító: 4907. Adatlap: https://www.letrot.com/hippodromes/durtal/4907. Koordináta forrása: Wikidata Q112573173 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Feurs", city: "Feurs", lat: 45.73986897, lng: 4.22125305, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: CENTRE-EST. LeTrot-azonosító: 4201. Adatlap: https://www.letrot.com/hippodromes/feurs/4201. Koordináta forrása: Wikidata Q112660003 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Fontainebleau", city: "Fontainebleau", lat: 48.434055, lng: 2.685755, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: PARIS. LeTrot-azonosító: 7701. Adatlap: https://www.letrot.com/hippodromes/fontainebleau/7701. Koordináta forrása: Wikidata Q3135876 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Graignes", city: "Graignes", lat: 49.24074594, lng: -1.20849609, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: BASSE-NORMANDIE. LeTrot-azonosító: 5008. Adatlap: https://www.letrot.com/hippodromes/graignes/5008. Koordináta forrása: Wikidata Q3135990 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Gramat", city: "Gramat", lat: 44.78115, lng: 1.75765, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: SUD-OUEST. LeTrot-azonosító: 4601. Adatlap: https://www.letrot.com/hippodromes/gramat/4601. Koordináta forrása: Wikidata Q3135989 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de L'Isle-sur-la Sorgue", city: "L'Isle-sur-la Sorgue", lat: 43.89950041, lng: 5.06504059, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: SUD-EST. LeTrot-azonosító: 8405. Adatlap: https://www.letrot.com/hippodromes/l-isle-sur-la-sorgue/8405. Koordináta forrása: Wikidata Q3135842 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de La Capelle", city: "La Capelle", lat: 49.967301, lng: 3.921202, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: NORD. LeTrot-azonosító: 202. Adatlap: https://www.letrot.com/hippodromes/la-capelle/202. Koordináta forrása: Wikidata Q3135961 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de La Ferte-Vidame", city: "La Ferte-Vidame", lat: 48.622255, lng: 0.894997, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: HAUTE-NORMANDIE ET ILE DE FRANCE. LeTrot-azonosító: 2804. Adatlap: https://www.letrot.com/hippodromes/la-ferte-vidame/2804. Koordináta forrása: Wikidata Q3135953 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de La Teste", city: "La Teste", lat: 44.59525, lng: -1.12423, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: SUD-OUEST. LeTrot-azonosító: 3303. Adatlap: https://www.letrot.com/hippodromes/la-teste/3303. Koordináta forrása: Wikidata Q112659941 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Laon", city: "Laon", lat: 49.54842158, lng: 3.65110874, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: NORD. LeTrot-azonosító: 203. Adatlap: https://www.letrot.com/hippodromes/laon/203. Koordináta forrása: Wikidata Q3135848 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Limoges", city: "Limoges", lat: 45.87333, lng: 1.21248, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: SUD-OUEST. LeTrot-azonosító: 8702. Adatlap: https://www.letrot.com/hippodromes/limoges/8702. Koordináta forrása: Wikidata Q3135923 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Lisieux", city: "Lisieux", lat: 49.150509, lng: 0.271694, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: BASSE-NORMANDIE. LeTrot-azonosító: 1407. Adatlap: https://www.letrot.com/hippodromes/lisieux/1407. Koordináta forrása: Wikidata Q3135963 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Mansle", city: "Mansle", lat: 45.87895, lng: 0.18424, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: SUD-OUEST. LeTrot-azonosító: 1607. Adatlap: https://www.letrot.com/hippodromes/mansle/1607. Koordináta forrása: Wikidata Q112659946 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Meslay-Du-Maine", city: "Meslay-Du-Maine", lat: 47.9503, lng: -0.53301, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: ANJOU-MAINE. LeTrot-azonosító: 5307. Adatlap: https://www.letrot.com/hippodromes/meslay-du-maine/5307. Koordináta forrása: Wikidata Q3135939 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Molieres", city: "Molieres", lat: 47.751015, lng: -0.74459, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: ANJOU-MAINE. LeTrot-azonosító: 5308. Adatlap: https://www.letrot.com/hippodromes/molieres/5308. Koordináta forrása: Wikidata Q112336835 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Montauban", city: "Montauban", lat: 44.0402, lng: 1.34066, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: SUD-OUEST. LeTrot-azonosító: 8203. Adatlap: https://www.letrot.com/hippodromes/montauban/8203. Koordináta forrása: Wikidata Q30740869 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Morlaix", city: "Morlaix", lat: 48.584576, lng: -3.79488, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: OUEST. LeTrot-azonosító: 2905. Adatlap: https://www.letrot.com/hippodromes/morlaix/2905. Koordináta forrása: Wikidata Q112654915 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Moulins", city: "Moulins", lat: 46.57826, lng: 3.3131, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: CENTRE-EST. LeTrot-azonosító: 303. Adatlap: https://www.letrot.com/hippodromes/moulins/303. Koordináta forrása: Wikidata Q97577264 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Moulins-La-Marche", city: "Moulins-La-Marche", lat: 48.6573, lng: 0.48298, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: BASSE-NORMANDIE. LeTrot-azonosító: 6112. Adatlap: https://www.letrot.com/hippodromes/moulins-la-marche/6112. Koordináta forrása: Wikidata Q3135834 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Nancy", city: "Nancy", lat: 48.654, lng: 6.14245, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: EST. LeTrot-azonosító: 5401. Adatlap: https://www.letrot.com/hippodromes/nancy/5401. Koordináta forrása: Wikidata Q3135897 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Neuille-Pont-Pierre", city: "Neuille-Pont-Pierre", lat: 47.542821, lng: 0.536541, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: ANJOU-MAINE. LeTrot-azonosító: 3702. Adatlap: https://www.letrot.com/hippodromes/neuille-pont-pierre/3702. Koordináta forrása: Wikidata Q112573380 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Nimes", city: "Nimes", lat: 43.8295, lng: 4.40326, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: SUD-EST. LeTrot-azonosító: 3001. Adatlap: https://www.letrot.com/hippodromes/nimes/3001. Koordináta forrása: Wikidata Q3135970 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Nort-Sur-Erdre", city: "Nort-Sur-Erdre", lat: 47.4236, lng: -1.50223, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: OUEST. LeTrot-azonosító: 4414. Adatlap: https://www.letrot.com/hippodromes/nort-sur-erdre/4414. Koordináta forrása: Wikidata Q63349746 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Ploermel", city: "Ploermel", lat: 47.9242, lng: -2.38167, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: OUEST. LeTrot-azonosító: 5605. Adatlap: https://www.letrot.com/hippodromes/ploermel/5605. Koordináta forrása: Wikidata Q17347061 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Pontivy", city: "Pontivy", lat: 48.0549207, lng: -2.9275775, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: OUEST. LeTrot-azonosító: 5606. Adatlap: https://www.letrot.com/hippodromes/pontivy/5606. Koordináta forrása: Wikidata Q17347056 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Pornichet", city: "Pornichet", lat: 47.26175, lng: -2.33101, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: OUEST. LeTrot-azonosító: 4418. Adatlap: https://www.letrot.com/hippodromes/pornichet/4418. Koordináta forrása: Wikidata Q3135907 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Redon", city: "Redon", lat: 47.64609188, lng: -2.10495472, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: OUEST. LeTrot-azonosító: 3508. Adatlap: https://www.letrot.com/hippodromes/redon/3508. Koordináta forrása: Wikidata Q112659981 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Reims", city: "Reims", lat: 49.2343, lng: 4.01093, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: EST. LeTrot-azonosító: 5102. Adatlap: https://www.letrot.com/hippodromes/reims/5102. Koordináta forrása: Wikidata Q3135944 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Rostrenen", city: "Rostrenen", lat: 48.2510265, lng: -3.334887, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: OUEST. LeTrot-azonosító: 2209. Adatlap: https://www.letrot.com/hippodromes/rostrenen/2209. Koordináta forrása: Wikidata Q112659982 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Sable-Sur-Sarthe", city: "Sable-Sur-Sarthe", lat: 47.833162, lng: -0.329484, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: ANJOU-MAINE. LeTrot-azonosító: 7210. Adatlap: https://www.letrot.com/hippodromes/sable-sur-sarthe/7210. Koordináta forrása: Wikidata Q112573146 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Saint-Aubin-Les-Elbeuf", city: "Saint-Aubin-Les-Elbeuf", lat: 49.308421, lng: 1.0199, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: HAUTE-NORMANDIE ET ILE DE FRANCE. LeTrot-azonosító: 7609. Adatlap: https://www.letrot.com/hippodromes/saint-aubin-les-elbeuf/7609. Koordináta forrása: Wikidata Q3135912 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Saint-Galmier", city: "Saint-Galmier", lat: 45.59834584, lng: 4.29473715, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: CENTRE-EST. LeTrot-azonosító: 4203. Adatlap: https://www.letrot.com/hippodromes/saint-galmier/4203. Koordináta forrása: Wikidata Q112660008 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Saint-Jean-De-Monts", city: "Saint-Jean-De-Monts", lat: 46.81444, lng: -2.13222, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: OUEST. LeTrot-azonosító: 8507. Adatlap: https://www.letrot.com/hippodromes/saint-jean-de-monts/8507. Koordináta forrása: Wikidata Q3135935 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Saint-Malo", city: "Saint-Malo", lat: 48.6428, lng: -1.99861, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: OUEST. LeTrot-azonosító: 3510. Adatlap: https://www.letrot.com/hippodromes/saint-malo/3510. Koordináta forrása: Wikidata Q3135896 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Saint-Omer", city: "Saint-Omer", lat: 50.7267, lng: 2.23843, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: NORD. LeTrot-azonosító: 6206. Adatlap: https://www.letrot.com/hippodromes/saint-omer/6206. Koordináta forrása: Wikidata Q3135969 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Saint-Pierre-La-Cour", city: "Saint-Pierre-La-Cour", lat: 48.11379, lng: -1.01452, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: ANJOU-MAINE. LeTrot-azonosító: 5312. Adatlap: https://www.letrot.com/hippodromes/saint-pierre-la-cour/5312. Koordináta forrása: Wikidata Q112572900 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Sainte-Marie-Du-Mont", city: "Sainte-Marie-Du-Mont", lat: 49.411339, lng: -1.181875, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: BASSE-NORMANDIE. LeTrot-azonosító: 5016. Adatlap: https://www.letrot.com/hippodromes/sainte-marie-du-mont/5016. Koordináta forrása: Wikidata Q3135955 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Senonnes", city: "Senonnes", lat: 47.79734, lng: -1.20124, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: ANJOU-MAINE. LeTrot-azonosító: 5314. Adatlap: https://www.letrot.com/hippodromes/senonnes/5314. Koordináta forrása: Wikidata Q112573073 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Sille-Le-Guillaume", city: "Sille-Le-Guillaume", lat: 48.20207, lng: -0.13506, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: ANJOU-MAINE. LeTrot-azonosító: 7211. Adatlap: https://www.letrot.com/hippodromes/sille-le-guillaume/7211. Koordináta forrása: Wikidata Q112573207 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Toulouse", city: "Toulouse", lat: 43.58982, lng: 1.40663, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: SUD-OUEST. LeTrot-azonosító: 3103. Adatlap: https://www.letrot.com/hippodromes/toulouse/3103. Koordináta forrása: Wikidata Q3135947 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Tours-Chambray", city: "Tours-Chambray", lat: 47.3311, lng: 0.712074, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: ANJOU-MAINE. LeTrot-azonosító: 3704. Adatlap: https://www.letrot.com/hippodromes/tours-chambray/3704. Koordináta forrása: Wikidata Q3135926 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Vertou", city: "Vertou", lat: 47.15431, lng: -1.47071, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: OUEST. LeTrot-azonosító: 4420. Adatlap: https://www.letrot.com/hippodromes/vertou/4420. Koordináta forrása: Wikidata Q105716305 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Vic-Fezensac", city: "Vic-Fezensac", lat: 43.7747, lng: 0.30304, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: SUD-OUEST. LeTrot-azonosító: 3209. Adatlap: https://www.letrot.com/hippodromes/vic-fezensac/3209. Koordináta forrása: Wikidata Q112659953 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Vitre", city: "Vitre", lat: 48.11026807, lng: -1.19425893, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: OUEST. LeTrot-azonosító: 3511. Adatlap: https://www.letrot.com/hippodromes/vitre/3511. Koordináta forrása: Wikidata Q112659985 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Vitteaux", city: "Vitteaux", lat: 47.400678, lng: 4.512561, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: CENTRE-EST. LeTrot-azonosító: 2101. Adatlap: https://www.letrot.com/hippodromes/vitteaux/2101. Koordináta forrása: Wikidata Q112660010 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Vittel", city: "Vittel", lat: 48.21731268116452, lng: 5.938501449851645, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Régiós szövetség: EST. LeTrot-azonosító: 8801. Adatlap: https://www.letrot.com/hippodromes/vittel/8801. Koordináta forrása: Wikidata Q112659995 + OpenStreetMap (Nominatim). Pálya forrása: LeTrot hivatalos pályajegyzék (letrot.com/hippodromes), 2026-07" },
        { name: "Hippodrome de Vincennes", city: "Párizs", lat: 48.8212, lng: 2.4517, founded: 1863, status: "active", length: 1975, direction: "left", org: "SETF (Société d'Encouragement à l'Elevage du Trotteur Français)", ownSite: "https://www.vincennes-hippodrome.com/fr/", operatorSite: null, operatorName: null, note: "A trot \"temploma\" – itt rendezik a Prix d'Amérique-et. Két salakpálya (mâchefer), MINDKETTŐ CORDE À GAUCHE (balkéz): a Grande Piste 1975 m, a Petite Piste 1325 m. A nagy pálya emelkedője a célegyenessel szemközti oldalon, 1000 m-re a céltól, egyedülállóan szelektívvé teszi" },
        { name: "Hippodrome d'Enghien-Soisy", city: "Soisy-sous-Montmorency", lat: 48.9805, lng: 2.2917, founded: 1879, status: "active", length: 1300, direction: "left", org: "SECF (Société d'Encouragement du Cheval Français)", ownSite: "https://www.hippodrome-enghien.com/", operatorSite: null, operatorName: null, note: "Franciaország 2. legnagyobb ügetőpályája" },
        { name: "Hippodrome de Rambouillet", city: "Rambouillet", lat: 48.6366, lng: 1.8508, founded: 1880, status: "active", length: null, direction: null, org: "France Trot / Cheval Français", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Családias, erdőszéli pálya" },
        { name: "Hippodrome de Caen (la Prairie)", city: "Caen", lat: 49.1748, lng: -0.3641, founded: 1839, status: "active", length: 1955, direction: "right", org: "SECF (Société d'Encouragement du Cheval Français)", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Az egyik legelső kizárólag ügető célú francia pálya" },
        { name: "Hippodrome de Cabourg", city: "Cabourg", lat: 49.2801, lng: -0.1211, founded: 1928, status: "active", length: 1275, direction: "right", org: "SECF (Société d'Encouragement du Cheval Français)", ownSite: "https://www.hippodrome-cabourg.com/", operatorSite: null, operatorName: null, note: "\"A normandiai kis Vincennes\"" },
        { name: "Hippodrome de Bellevue-la-Forêt", city: "Laval", lat: 48.0384, lng: -0.7953, founded: 1921, status: "active", length: 1250, direction: "left", org: "Société des courses de Laval", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Nyugat-franciaországi regionális referenciapálya" },
        { name: "Hippodrome de Nantes", city: "Nantes", lat: 47.2457, lng: -1.5626, founded: 1875, status: "active", length: null, direction: null, org: "Société des Courses de Nantes", ownSite: "https://www.hippodrome-nantes.fr/historique", operatorSite: null, operatorName: null, note: "A Grand National du Trot egyik állomása" },
        { name: "Hippodrome de Châteaubriant", city: "Châteaubriant", lat: 47.7376, lng: -1.3922, founded: 1980, status: "active", length: null, direction: null, org: "Association des Courses Hippiques de Châteaubriant", ownSite: "https://www.hippodrome-chateaubriant.fr/", operatorSite: null, operatorName: null, note: "Első kategóriás, mindhárom diszciplínát befogadó pólus" },
        { name: "Hippodrome de Pontchâteau", city: "Pontchâteau", lat: 47.4459, lng: -2.1315, founded: 1889, status: "active", length: 1225, direction: "left", org: "Société des Courses de Pontchâteau", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Vincennes fontos \"előszoba\" pályája" },
        { name: "Hippodrome d'Angers-Écouflant", city: "Écouflant", lat: 47.4978, lng: -0.5078, founded: 1847, status: "active", length: null, direction: null, org: "Société des Courses d'Angers", ownSite: "https://hippodrome-angers.com/hippodrome", operatorSite: null, operatorName: null, note: "\"Equures\" lójólléti minősítés (2024)" },
        { name: "Hippodrome de la Côte d'Azur", city: "Cagnes-sur-Mer", lat: 43.6485, lng: 7.1462, founded: 1952, status: "active", length: 1288, direction: null, org: "Société des Courses de Cagnes-sur-Mer", ownSite: "http://www.hippodrome-cotedazur.fr/fr/", operatorSite: null, operatorName: null, note: "A francia téli lóversenyzés egyik központja" },
        { name: "Hippodrome de Vichy-Bellerive", city: "Bellerive-sur-Allier", lat: 46.1305, lng: 3.4072, founded: 1875, status: "active", length: null, direction: null, org: "France Trot / Cheval Français", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Az Allier folyó partján, márciustól szeptemberig" },
        { name: "Hippodrome de Divonne-les-Bains", city: "Divonne-les-Bains", lat: 46.3503, lng: 6.1563, founded: 1965, status: "active", length: 1220, direction: "left", org: "Société des Courses de Divonne-les-Bains", ownSite: null, operatorSite: "https://www.letrot.com/", operatorName: "LeTrot", note: "Az egyetlen francia pálya a Genfi-tó medencéjében" },
        { name: "Hippodrome d'Agen-La Garenne", city: "Agen", lat: 44.1762, lng: 0.5978, founded: 1850, status: "active", length: 1190, direction: "right", org: "Société des Courses d'Agen", ownSite: "https://hippodrome-agen.fr/", operatorSite: null, operatorName: null, note: "1975-ben itt rendezték az első kizárólag nőknek szóló futamot" }
    ],
    ITA: [
        { name: "Ippodromo di Agnano", city: "Napoli", lat: 40.8371, lng: 14.1671, founded: 1935, status: "active", length: 1000, direction: null, org: "New Agnano Arena & Races Srl", ownSite: "https://www.ippodromoagnano.it/", operatorSite: null, operatorName: null, note: "Dél-Olaszország ügetősportjának központja; 1947 óta itt rendezik a Gran Premio Lotteria di Agnano-t; itt futotta 2002-ben Varenne, minden idők legjobb olasz ügetője, a máig megdöntetlen pályarekordot" },
        { name: "Ippodromo Snai San Siro (trotto)", city: "Milánó", lat: 45.4810, lng: 9.1373, founded: null, status: "active", length: null, direction: null, org: "Snaitech S.p.A.", ownSite: null, operatorSite: "https://www.ippodromisnai.it/", operatorName: "Snaitech (Ippodromi Snai hálózat)", note: "Az 1920-as években épült nagy milánói lósport-komplexum ügetőrésze; koncertek és nagyrendezvények helyszíneként is ismert" },
        { name: "Ippodromo dell'Arcoveggio", city: "Bologna", lat: 44.5179, lng: 11.3451, founded: null, status: "active", length: null, direction: null, org: "HippoGroup Cesenate S.p.A.", ownSite: null, operatorSite: "https://www.hippogroupcesenate.it/", operatorName: "HippoGroup Cesenate S.p.A.", note: "Ugyanaz a társaság (HippoGroup Cesenate) üzemelteti, mint a cesenai Savio-t; nyáron szabadtéri moziként is funkcionál a pálya belső területén" },
        { name: "Ippodromo delle Capannelle", city: "Róma", lat: 41.8256, lng: 12.5630, founded: 1881, status: "active", length: null, direction: null, org: "Roma Capitale (tulajdonos) / HippoGroup Roma Capannelle Srl (üzemeltető)", ownSite: null, operatorSite: "https://www.hippogroup.it/", operatorName: "HippoGroup (országos hálózat)", note: "Olaszország legrégebbi versenypályája (1881); 1926-ig kizárólag galopp, 2014 óta a galopppálya belsejében kialakított külön pályán ügetőversenyeket is rendeznek a bezárt Tor di Valle pálya öröksége nyomán" },
        { name: "Ippodromo del Mediterraneo", city: "Siracusa", lat: 37.0014, lng: 15.1922, founded: null, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "Szicília egyetlen jelentős versenypályája, festői környezetben" },
        { name: "Ippodromo di Vinovo (Stupinigi)", city: "Vinovo (Torino)", lat: 44.9785, lng: 7.6121, founded: null, status: "active", length: null, direction: null, org: "HippoGroup Torinese S.p.A.", ownSite: "http://www.ippodromovinovo.it/", operatorSite: "https://www.hippogroup.it/", operatorName: "HippoGroup (országos hálózat)", note: "Piemont vezető ügetőpályája, a Stupinigi-i vadászkastély közelében" },
        { name: "Ippodromo San Paolo", city: "Montegiorgio", lat: 43.1168, lng: 13.5743, founded: null, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: "http://www.sanpaolo.ippodromo.it/", operatorSite: null, operatorName: null, note: "Márche régió referenciapályája, itt rendezik a Palio dei Comuni versenyt" },
        { name: "Ippodromo dei Sauri", city: "Castelluccio dei Sauri (Foggia)", lat: 41.3075, lng: 15.4548, founded: null, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "Dél-olasz vidéki pálya, karácsonyi rendezvényekről és családbarát programjairól ismert" },
        { name: "Ippodromo del Savio", city: "Cesena", lat: 44.1434, lng: 12.2297, founded: 1922, status: "active", length: 800, direction: null, org: "HippoGroup Cesenate S.p.A.", ownSite: null, operatorSite: "https://www.hippogroupcesenate.it/", operatorName: "HippoGroup Cesenate S.p.A.", note: "1927 óta itt rendezik a Campionato Europeo di Trotto-t (Európa-bajnokság), amelynek egyedülálló formátuma van: két azonos versenyszámmal induló prova, majd egy közvetlen párbaj (race-off) a végső győztesért" },
        { name: "Ippodromo Paolo VI", city: "Taranto", lat: 40.5376, lng: 17.3052, founded: null, status: "inactive", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: "https://ippodromopaolosesto.com/", operatorSite: null, operatorName: null, note: "Puglia régió ügetőpályája. STÁTUSZ (2026 nyara): jogi bizonytalanság – a Masaf 2026-ban visszavonta az üzemeltető társaság elismerését, miután a létesítményt végrehajtási árverésen adták el; a helyzet rendeződésétől függően újraindulhat" },
        { name: "Ippodromo della Favorita", city: "Palermo", lat: 38.1520, lng: 13.3453, founded: null, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "A Favorita történelmi park belsejében, a várost övező hegyek lábánál; nemrég újították fel" },
        { name: "Ippodromo dei Pini", city: "Follonica", lat: 42.9429, lng: 10.7745, founded: null, status: "inactive", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: "http://www.ippodromodeipini.it/", operatorSite: null, operatorName: null, note: "Toszkán tengerparti pálya. STÁTUSZ (2026 nyara): egész 2026-ban zárva tart; az önkormányzat új pályázatot tervez 2027-re, de egy módosított településrendezési terv más célú hasznosítást is megenged a területnek" },
        { name: "Ippodromo della Ghirlandina", city: "Modena", lat: 44.6077, lng: 10.9179, founded: null, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "Teljes felújításon esett át, ma luxus éttermet (Antica Moka) is magába foglaló, Olaszország egyik legszebb pályájának tartott létesítmény" },
        { name: "Ippodromo Euroitalia", city: "Casarano (Lecce)", lat: 40.0375, lng: 18.1665, founded: null, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "Salento régió pályája, korábban az 1990-es években nagyobb jelentőséggel bírt" },
        { name: "Ippodromo Snai Sesana", city: "Montecatini Terme", lat: 43.8819, lng: 10.7644, founded: 1916, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "Olaszország egyik mindössze három pályája (Trieszt, Padova mellett), amely 1922-ben már létezett és azóta is az eredeti helyén működik" },
        { name: "Ippodromo Sant'Artemio", city: "Treviso", lat: 45.6936, lng: 12.2558, founded: null, status: "active", length: null, direction: null, org: "Nordest Ippodromi S.p.A.", ownSite: null, operatorSite: "https://www.nordestippodromi.com/", operatorName: "Nordest Ippodromi S.p.A.", note: "Veneto régió pályája, galopp és ügető versenyeknek egyaránt otthont ad; 2026-tól ide (és Padovába) helyezték át a bezárt trieszti Montebello versenynapjait is" },
        { name: "Ippodromo del Garigliano", city: "Santi Cosma e Damiano (Latina)", lat: 41.2502, lng: 13.8067, founded: null, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "Csak nyáron üzemelő, családbarát vidéki pálya a Garigliano folyó mentén" },
        { name: "Ippodromo del Visarno Cesare Meli", city: "Firenze", lat: 43.7806, lng: 11.2239, founded: null, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: "https://www.visarno.it/", operatorSite: null, operatorName: null, note: "A Cascine parkban található; koncertek (pl. Guns N' Roses, Imagine Dragons) kedvelt helyszíne is" },
        { name: "Ippodromo dei Fiori", city: "Villanova d'Albenga (Savona)", lat: 44.0425, lng: 8.1233, founded: null, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "Ligur riviéra pályája, esti versenyekkel és látványos tengerparti panorámával" },
        { name: "Ippodromo delle Padovanelle (V.S. Breda)", city: "Padova", lat: 45.4248, lng: 11.9337, founded: 1901, status: "active", length: null, direction: null, org: "Gruppo Coppiello snc", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "Olaszország egyik mindössze három pályája (Trieszt, Montecatini mellett), amely 1922-ben már létezett és azóta is az eredeti helyén működik; 2011-ben pénzügyi okokból ideiglenesen felfüggesztették a versenyeket, 2013 óta újra aktív" },
        { name: "Ippodromo Valentinia", city: "Pontecagnano Faiano (Salerno)", lat: 40.6015, lng: 14.9018, founded: null, status: "active", length: null, direction: null, org: "Valentinia S.r.l.", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "Dél-olasz pálya Salerno közelében" },
        { name: "Ippodromo Montebello", city: "Trieste", lat: 45.6386, lng: 13.7943, founded: 1892, status: "closed", length: null, direction: null, org: "Nordest Ippodromi S.p.A. (korábbi üzemeltető)", ownSite: null, operatorSite: "https://www.nordestippodromi.com/", operatorName: "Nordest Ippodromi S.p.A. (korábbi üzemeltető)", note: "Olaszország legrégebbi, folyamatosan az eredeti helyén működő versenypályája volt (1892 óta). STÁTUSZ (2026 nyara): a Nordest Ippodromi Spa 2026 elején végleg lemondott az üzemeltetésről, a Masaf visszavonta az engedélyt, a versenyeket Trevisóba és Padovába helyezték át; a régió 30 millió eurót különített el a terület más célú (sportcitadella) átalakítására – a visszatérés lóversenyzéshez valószínűtlen" },
        { name: "Ippodromo Cirigliano", city: "Aversa (Caserta)", lat: 40.9587, lng: 14.2039, founded: null, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "Campania régió pályája, egykor Aversa városának fontos központja volt" },
        { name: "Ippodromo San Marone", city: "Civitanova Marche (Macerata)", lat: 43.3374, lng: 13.6775, founded: null, status: "active", length: null, direction: null, org: "Masaf – Direzione Generale Ippica", ownSite: null, operatorSite: "https://new.trottoweb.com/", operatorName: "TrottoWeb – versenynaptár", note: "Dombtetőn fekvő pálya, panorámás kilátással a tengerre és a hegyekre" },
        { name: "Ippodromo Cesare Fiaschi", city: "Ferrara", lat: 44.8260, lng: 11.6142, founded: null, status: "active", length: null, direction: null, org: "Nordest Ippodromi S.p.A.", ownSite: null, operatorSite: "https://www.nordestippodromi.com/", operatorName: "Nordest Ippodromi S.p.A.", note: "Emilia-Romagna régió pályája; a Nordest Ippodromi Spa több mint 20 éve kezeli (egy rövid, üzemeltető-váltás miatti szünettől eltekintve), Trieszttel és Trevisóval közös hálózatban" }
    ],
    FIN: [
        { name: "Haapajärven ravirata", city: "Haapajärvi", lat: 63.7442409, lng: 25.3501997, founded: 1949, status: "active", length: null, direction: null, org: "Haapajärven Ravi ry", ownSite: null, operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + GeoNames (13231750). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Halsuan ravirata", city: "Halsua", lat: 63.4701104, lng: 24.1621995, founded: null, status: "active", length: null, direction: null, org: "Halsuan Hevosjalostusyhdistys ry", ownSite: null, operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + OpenStreetMap (Nominatim) + GeoNames (12941901). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Härmän ravirata", city: "Härmä", lat: 63.25277778, lng: 22.84694444, founded: 1934, status: "active", length: null, direction: null, org: "Härmän Ravirata Oy", ownSite: "https://harman-ravirata.webnode.fi", operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + Wikidata Q18659263 + Wikipédia (fi) – Härmän ravirata + GeoNames (12937441). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Kannuksen ravirata", city: "Kannus", lat: 63.8917157, lng: 23.9206896, founded: null, status: "active", length: null, direction: null, org: "Kannuksen keskusravirata Oy", ownSite: null, operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + GeoNames (13187417). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Kokkolan ravirata", city: "Kokkola", lat: 63.8245106, lng: 23.0593203, founded: null, status: "active", length: null, direction: null, org: "Kokkolanseudun Hippos ry", ownSite: "https://kokkolanravit.fi/", operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: OpenStreetMap (Nominatim) + GeoNames (13184703). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Suonenjoen ravirata", city: "Suonenjoki", lat: 62.6410142, lng: 27.0873064, founded: null, status: "active", length: null, direction: null, org: "Suonenjoen Hevosystäväinseura ry", ownSite: "https://www.suonenjoenravirata.fi", operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: OpenStreetMap (Nominatim) + GeoNames (13174791). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "PowerParkin ravirata", city: "Kauhava", lat: 63.232667, lng: 22.8343533, founded: 2016, status: "active", length: null, direction: null, org: "Powerparkin ravirata", ownSite: "https://nordicking.fi", operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + OpenStreetMap (Nominatim). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Kaukosen ravirata", city: "Kaukonen", lat: 67.4896893, lng: 24.9103611, founded: null, status: "active", length: 800, direction: null, org: "Kittilän Hevosystävät ry", ownSite: null, operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap. Finnország legészakibb pályája, kb. 150 m célegyenessel.. Koordináta forrása: Nominatim (postai cím) + Wikidata Q132366082. Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Kausalan ravirata", city: "Kausala", lat: 60.8892041, lng: 26.3579558, founded: 1924, status: "active", length: null, direction: null, org: "Iitin Hevosystäväinseura ry", ownSite: "https://www.iitinhys.fi/", operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + Wikidata Q18680758. Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Kokemäen ravirata", city: "Kokemäki", lat: 61.2020569, lng: 22.2749421, founded: null, status: "active", length: null, direction: null, org: "Sataravi Oy", ownSite: "https://www.sataravi.fi/", operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + Wikidata Q11872139 + OpenStreetMap (Nominatim). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Kurtakon ravirata", city: "Kolari", lat: 67.4115326, lng: 24.1099989, founded: 1966, status: "active", length: null, direction: null, org: "Ylläksen Ravi ry", ownSite: null, operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + Wikidata Q132366131 + OpenStreetMap (Nominatim). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Lieksan ravirata", city: "Lieksa", lat: 63.300204, lng: 30.0791641, founded: null, status: "active", length: null, direction: null, org: "Pielisjärven Hevosystäväinseura ry", ownSite: "https://www.lieksanravirata.fi", operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + OpenStreetMap (Nominatim). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Loviisan ravirata", city: "Loviisa", lat: 60.4601486, lng: 26.2233908, founded: null, status: "active", length: null, direction: null, org: "Itä-Uudenmaan Oriyhdistys ry", ownSite: "https://www.loviisanravit.fi/", operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap. Finnország legdélibb pályája.. Koordináta forrása: Nominatim (postai cím) + Wikidata Q18660623 + OpenStreetMap (Nominatim). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Ålandstravet", city: "Mariehamn", lat: 60.13, lng: 19.94777778, founded: null, status: "active", length: null, direction: null, org: "Ålands Hästsportförening r.f.", ownSite: "https://alandstravet.com/", operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Wikidata Q18660708 + OpenStreetMap (Nominatim). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Riihimäen ravirata", city: "Riihimäki", lat: 60.7548493, lng: 24.7726123, founded: null, status: "active", length: null, direction: null, org: "Riihimäen Raviseura ry", ownSite: "https://www.riihimaenravit.fi/", operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + Wikidata Q18661713 + OpenStreetMap (Nominatim). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Sodankylän ravirata", city: "Sodankylä", lat: 67.401525, lng: 26.6731729, founded: null, status: "active", length: null, direction: null, org: "Lapin Ravi ry", ownSite: null, operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + Wikidata Q132365965 + OpenStreetMap (Nominatim). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Vieremän ravirata", city: "Vieremä", lat: 63.684472, lng: 27.0731695, founded: null, status: "active", length: null, direction: null, org: "Ylä-Savon Hippos ry", ownSite: "https://www.vieremanravirata.fi/", operatorSite: null, operatorName: null, note: "Kesärata (nyári pálya) – szezonális működés, évi 1-6 versenynap.. Koordináta forrása: Nominatim (postai cím) + Wikidata Q11901185 + OpenStreetMap (Nominatim). Pálya forrása: Suomen Hippos ry (hippos.fi) kesäradat-lista, 2026-07" },
        { name: "Vermo Areena", city: "Espoo (Helsinki)", lat: 60.2152, lng: 24.8392, founded: null, status: "active", length: null, direction: null, org: "Vermon Ravirata Oy", ownSite: "http://www.vermo.fi", operatorSite: null, operatorName: null, note: "Finnország központi (nemzeti) versenypályája; évi kb. 40 szerdai versenynap. Kiemelt futamok: Finlandia-Ajo, Suuri Suomalainen Derby, Käpylä Grand Prix" },
        { name: "Pilvenmäki", city: "Forssa", lat: 60.8069, lng: 23.5833, founded: null, status: "active", length: null, direction: null, org: "Forssan Seudun Hippos ry", ownSite: "http://www.pilvenmaki.fi", operatorSite: null, operatorName: null, note: "Kanta-Häme régió edzőközpontja és versenypályája. Kiemelt futamok: Pilvenmäki Special, Tammavaltikka, Pilvenmäki Maraton" },
        { name: "Joensuun ravirata (Linnunlahti)", city: "Joensuu", lat: 62.5982, lng: 29.7307, founded: null, status: "active", length: null, direction: null, org: "Joensuun Ravirata Oy", ownSite: "http://www.joensuunravirata.fi", operatorSite: null, operatorName: null, note: "Több mint 100 éves történelmű pálya, híres izgalmas hajrá-versenyeiről. Kiemelt futam: Joensuu-Ajo" },
        { name: "Killeri", city: "Jyväskylä", lat: 62.2450, lng: 25.6729, founded: null, status: "active", length: null, direction: null, org: "Keski-Suomen Ravirata Oy", ownSite: "http://www.killeri.fi", operatorSite: null, operatorName: null, note: "Festői tóparti fekvés (Killerjärvi mellett); évi 20+ versenynap. Kiemelt futamok: Killerin Eliitti, Keskisuomalainen Derby" },
        { name: "Kainuun ravirata", city: "Kajaani", lat: 64.2788, lng: 27.8473, founded: null, status: "active", length: null, direction: null, org: "Racetrack Kainuu Oy", ownSite: "http://www.kainuunravirata.fi", operatorSite: null, operatorName: null, note: "Egyedi vöröses borítású pálya, amit sokan Finnország legszebb versenypályájának tartanak; önkéntes munkával üzemeltetve" },
        { name: "Kaustinen (Nikula)", city: "Kaustinen", lat: 63.5816, lng: 23.5790, founded: null, status: "active", length: null, direction: null, org: "Kaustisen Seudun Raviseura ry", ownSite: "https://kaustisenravit.fi", operatorSite: null, operatorName: null, note: "A híres Kaustinen Folk Music Festival régiójában; kiemelt futamok: Pelimanni-ravit, Festivaaliravit" },
        { name: "Kouvolan ravirata", city: "Kouvola", lat: 60.8848, lng: 26.7033, founded: 1910, status: "active", length: null, direction: null, org: "Valkealan hevosystäväinseura ry", ownSite: "http://www.kouvolanravirata.com/", operatorSite: null, operatorName: null, note: "Az 1910-es évek eleje óta ugyanazon a helyen működik – Finnország 2. legrégebbi, folyamatosan azonos helyszínű pályája. 2026-ban itt rendezték a UET Elite Circuit Kymi Grand Prix-t" },
        { name: "Kuopion ravirata (Sorsasalo)", city: "Kuopio", lat: 62.9670, lng: 27.6805, founded: null, status: "active", length: null, direction: null, org: "Kuopion ravirata", ownSite: "http://www.kuopionravirata.fi", operatorSite: null, operatorName: null, note: "Évi kb. 25 versenynap. Kiemelt futam: Kuopio Stakes" },
        { name: "Jokimaa", city: "Lahti", lat: 60.9385, lng: 25.6089, founded: null, status: "active", length: null, direction: null, org: "Lahden hevosystäväinseura ry", ownSite: "https://www.jokimaanravit.fi/", operatorSite: null, operatorName: null, note: "Évi 30+ versenynap, közel 100 ló edz a területén. Fő eseménye a háromnapos Suur-Hollola-ravit" },
        { name: "Lappeen ravirata", city: "Lappeenranta", lat: 61.0363, lng: 28.1039, founded: 1973, status: "active", length: null, direction: null, org: "Lappeenrannan Ravirata Oy", ownSite: "https://www.lappeenravit.fi/", operatorSite: null, operatorName: null, note: "1973 óta rendeznek itt versenyt. Kiemelt futam: Villinmiehen Tammakilpailu" },
        { name: "Mikkelin ravirata", city: "Mikkeli", lat: 61.7037, lng: 27.2436, founded: null, status: "active", length: null, direction: null, org: "Mikkelin ravirata Oy", ownSite: "http://www.mikkelinravirata.fi/", operatorSite: null, operatorName: null, note: "Világhírű \"rekordpálya\" – számos világ-, Európa- és Finnország-rekord született itt. 1979 óta rendszeres nagyversenyek helyszíne (St Michel-ajo, 1981 óta)" },
        { name: "Äimäraution ravirata", city: "Oulu", lat: 64.9815, lng: 25.4690, founded: 1908, status: "active", length: null, direction: null, org: "Pohjolan Hevosystävät ry", ownSite: "http://oulunravit.fi", operatorSite: null, operatorName: null, note: "Finnország legrégebbi versenypályája (1908 óta). Kiemelt futamok: Oulu Express, Number One" },
        { name: "Porin ravirata", city: "Pori", lat: 61.4670, lng: 21.8116, founded: null, status: "active", length: null, direction: null, org: "Porin Ravit Oy", ownSite: "http://porinravit.fi", operatorSite: null, operatorName: null, note: "Városközponthoz közeli, dinamikus rendezvényhelyszín. Kiemelt futamok: Kultaloimi, St. Leger, Satakunta-ajo" },
        { name: "Rovaniemen ravirata (Mäntyvaara)", city: "Rovaniemi", lat: 66.5113, lng: 25.6037, founded: 1976, status: "active", length: null, direction: null, org: "Rovaniemen Ravirata Oy", ownSite: "https://rovaniemenravirata.fi/", operatorSite: null, operatorName: null, note: "1976 óta rendeznek itt versenyt; Finnország legészakibb pályája, amfiteátrum-szerű, egyedülálló lelátóval. Kiemelt futam: Arctic Horse Race" },
        { name: "Seinäjoen ravikeskus", city: "Seinäjoki", lat: 62.8011, lng: 22.8544, founded: null, status: "active", length: null, direction: null, org: "Etelä-Pohjanmaan hevosjalostusliitto ry", ownSite: "https://www.seinajoenravikeskus.fi/", operatorSite: null, operatorName: null, note: "Évi közel 30 versenynap. Kiemelt nemzetközi futam: Seinäjoki Race" },
        { name: "Teivon ravirata", city: "Tampere (Ylöjärvi)", lat: 61.5292, lng: 23.6263, founded: null, status: "active", length: null, direction: null, org: "Tampereen Ravirata Oy", ownSite: "http://www.teivo.fi", operatorSite: null, operatorName: null, note: "Finnország 2. legnagyobb pályája versenynapok száma szerint; 2026-ban ünnepelte 50 éves fennállását és itt rendezték a Kuninkuusravit (a finn \"királyi versenyek\", Finnország legnagyobb sportrendezvénye, kb. 50 000 nézővel)" },
        { name: "Laivakankaan ravirata", city: "Tornio", lat: 65.8196, lng: 24.3606, founded: 1974, status: "active", length: null, direction: null, org: "Länsi-Lapin Hevosystävät ry", ownSite: "https://laivakangas.fi/", operatorSite: null, operatorName: null, note: "1974 óta rendeznek itt versenyt; a pályát felújították, ma az egyik leggyorsabb finn pálya. Kiemelt futamok: Midnight Cup, Lady Cup" },
        { name: "Metsämäen ravirata", city: "Turku", lat: 60.4933, lng: 22.3496, founded: 1978, status: "active", length: null, direction: null, org: "Turun Hippos ry", ownSite: "https://www.turunhippos.fi/", operatorSite: null, operatorName: null, note: "1978 óta működik. Kiemelt futam: Pohjoismaiden mestaruus (skandináv bajnokság)" },
        { name: "Ylivieskan ravirata (Keskinen)", city: "Ylivieska", lat: 64.1113, lng: 24.5105, founded: null, status: "active", length: null, direction: null, org: "Pohjanmaan Ravi ry", ownSite: "http://www.ylivieskanravit.fi/", operatorSite: null, operatorName: null, note: "1997-ben itt rendezték a Kuninkuusravit. Kiemelt futamok: Ruunakunkkarit (hidegvérű heréltek), Malja-ajo" }
    ],
    NOR: [
        { name: "Bjerke Travbane", city: "Oslo", lat: 59.9409, lng: 10.8104, founded: 1928, status: "active", length: null, direction: null, org: "Det Norske Travselskap (DNT)", ownSite: null, operatorSite: "https://www.travsport.no/", operatorName: "Det Norske Travselskap (DNT)", note: "Norvégia nemzeti főpályája, évi 100+ versenynappal; itt van a DNT (Det Norske Travselskap, alapítva 1875) központja is. Koncerthelyszínként is használt (pl. AC/DC, Tons of Rock fesztivál). Oslo fő pályája, 1928 óta. A DNT (Det Norske Travselskap) 1875-ben alakult." },
        { name: "Bergen Travpark", city: "Breistein (Bergen)", lat: 60.4847, lng: 5.3858, founded: 1985, status: "active", length: null, direction: null, org: "Bergen Travpark", ownSite: null, operatorSite: "https://www.travsport.no/", operatorName: "Det Norske Travselskap (DNT)", note: "Nyugat-Norvégia vezető ügetőpályája. 1985-ben váltotta a korábbi, 500 m-es nesttuni pályát (1926–1985)." },
        { name: "Biri Travbane", city: "Biri", lat: 60.9579, lng: 10.6254, founded: 1985, status: "active", length: null, direction: null, org: "Biri Travbane", ownSite: null, operatorSite: "https://www.travsport.no/", operatorName: "Det Norske Travselskap (DNT)", note: "Tóparti fekvésű pálya Gjøvik közelében. 1985-ben nyílt, a korábbi 550 m-es Vikodden helyett." },
        { name: "Forus Travbane", city: "Stavanger", lat: 58.8911, lng: 5.7254, founded: 1920, status: "active", length: null, direction: null, org: "Forus Travbane", ownSite: null, operatorSite: "https://www.travsport.no/", operatorName: "Det Norske Travselskap (DNT)", note: "Nyugat-Norvégia (Stavanger-régió) egyetlen ügetőpályája; koncerthelyszínként is működik. 1920-ban nyílt – a Klosterskogennel és a Momarkennel egy évben." },
        { name: "Harstad Travpark", city: "Harstad", lat: 68.7883, lng: 16.4591, founded: 1995, status: "active", length: null, direction: null, org: "Harstad Travpark", ownSite: null, operatorSite: "https://www.travsport.no/", operatorName: "Det Norske Travselskap (DNT)", note: "Észak-Norvégia egyik pályája, a sarkkörön túl. 1995-ben nyílt. A világ legészakibb, egész évben üzemelő ügetőpályája." },
        { name: "Jarlsberg Travbane", city: "Sem (Tønsberg)", lat: 59.2787, lng: 10.3694, founded: 1935, status: "active", length: null, direction: null, org: "Jarlsberg Travbane", ownSite: null, operatorSite: "https://www.travsport.no/", operatorName: "Det Norske Travselskap (DNT)", note: "Vestfold megye vezető ügetőpályája. 1935-ben nyílt." },
        { name: "Klosterskogen Travbane", city: "Skien", lat: 59.1903, lng: 9.5992, founded: 1920, status: "active", length: null, direction: null, org: "AS Klosterskogen Travbane", ownSite: null, operatorSite: "https://www.travsport.no/", operatorName: "Det Norske Travselskap (DNT)", note: "Húsvéti versenyeiről ismert, élénk hangulatú pálya. 1920-ban nyílt." },
        { name: "Momarken Travbane", city: "Mysen", lat: 59.5691, lng: 11.3340, founded: 1920, status: "active", length: null, direction: null, org: "Momarken Travbane", ownSite: null, operatorSite: "https://www.travsport.no/", operatorName: "Det Norske Travselskap (DNT)", note: "Kelet-Norvégia (Østfold megye) pályája. 1920-ban nyílt. FIGYELEM: a DNT Trav2025 stratégiája szerint a pálya eladása vagy bezárása napirenden van – státusza figyelendő." },
        { name: "Sørlandets Travpark", city: "Kristiansand", lat: 58.1810, lng: 8.1508, founded: 1988, status: "active", length: null, direction: null, org: "Sørlandets Travpark AS", ownSite: null, operatorSite: "https://www.travsport.no/", operatorName: "Det Norske Travselskap (DNT)", note: "Dél-Norvégia vezető ügetőpályája. 1988-ban nyílt a korábbi Hortemo helyett; a nyitónapon kb. 30 000 néző volt jelen." },
        { name: "Leangen Travbane", city: "Trondheim", lat: 63.4300, lng: 10.4711, founded: 1931, status: "closed", length: null, direction: null, org: "Leangen Travbane", ownSite: null, operatorSite: "https://www.travsport.no/", operatorName: "Det Norske Travselskap (DNT)", note: "Közép-Norvégia pályája volt, 1931-től. STÁTUSZ: a pályát eladták, és a 2022-es szezon után a Varig Orkla Arena váltotta fel – ez azonban NEM névváltozás, hanem MÁSIK pálya, az Orkla-völgyben, nem Trondheimben. A DNT hivatalos totalizatőrös pályalistáján a Varig Orkla Arena szerepel, a Leangen nem. JAVÍTVA (2026-07): a két pálya korábban egy rekordba volt vonva. A Varig Orkla Arena külön rekordként veendő fel, amint megbízható koordináta rendelkezésre áll – addig nem vesszük fel, mert a helyét nem találgatjuk" },
        { name: "Drammen Travbane", city: "Drammen", lat: 59.7551, lng: 10.1154, founded: 1955, status: "closed", length: 800, direction: null, org: "Det Norske Travselskap (korábbi üzemeltető)", ownSite: null, operatorSite: "https://www.travsport.no/", operatorName: "Det Norske Travselskap (DNT)", note: "1955-ben nyílt, 800 m-es pálya. STÁTUSZ: 2019-ben véglegesen bezárt – az utolsó szezonja volt, miután évtizedekig motorsport-, kutyakiállítás- és ügető-helyszínként is szolgált" }
    ],
    POL: [
        { name: "Tor Wyścigów Konnych Służewiec", city: "Varsó", lat: 52.1652, lng: 21.0159, founded: 1939, status: "active", length: 2300, direction: null, org: "Tor Służewiec Sp. z o.o.", ownSite: null, operatorSite: "https://pkwk.org/", operatorName: "Polski Klub Wyścigów Konnych", note: "ELLENŐRZVE (2026): AKTÍV, ügetőversennyel is. Lengyelország legnagyobb és legrégebbi lóversenypályája (1939), történelmi műemlék. Elsődlegesen galopp, de a lengyel szaksajtó szerint Varsóban, Wrocławban és Sopotban egyaránt több tucat ügetőfutamot rendeznek szezononként. MEGJEGYZÉS: Lengyelország nem UET-tagország, ezért a nemzetközi ügető-nyilvántartásokban nem szerepel – a sport mégis létezik, hazai szervezésben" },
        { name: "Wrocławski Tor Wyścigów Konnych – Partynice", city: "Wrocław", lat: 51.0552, lng: 17.0007, founded: 1833, status: "active", length: null, direction: null, org: "Gmina Wrocław (önkormányzati fenntartású)", ownSite: "https://www.torpartynice.pl/", operatorSite: null, operatorName: null, note: "ELLENŐRZVE (2026): AKTÍV, rendszeres nemzetközi ügetőfutamokkal. 1833 óta rendeznek itt versenyt. A 2026-os szezon április 12-én indult (a látogatói rekord 21 000 fő volt 2022-ben, ingyenes belépéssel). Igazolt 2026-os ügetőfutamok: Nagroda Otwarcia Sezonu Kłusaczego (május 1., 20 000 zł), Puchar Pierwszego Maja (2400 m, francia ügetők), Puchar Światowego Dnia Krwiodawstwa (június 14.). Lengyelország három versenypályája közül az EGYETLEN, ahol akadályversenyt is rendeznek" },
        { name: "Hipodrom Sopot", city: "Sopot", lat: 54.4280, lng: 18.5706, founded: null, status: "active", length: null, direction: null, org: "Hipodrom Sopot", ownSite: null, operatorSite: "https://pkwk.org/", operatorName: "Polski Klub Wyścigów Konnych", note: "VISSZAHELYEZVE ÖNKORREKCIÓ UTÁN: korábban tévesen kivettem a listából, mert csak lovassport-központként (Longines FEI Jumping Nations Cup) azonosítottam. A lengyel szaksajtó szerint azonban Sopot Lengyelország három versenypályájának egyike, ahol szezononként több tucat ügetőfutamot is rendeznek Varsó és Wrocław mellett. Vegyes profil: díjugratás + lóverseny" },
        { name: "Krakowski Tor Wyścigów Konnych (Buczków)", city: "Buczków (Krakkó mellett)", lat: 50.0458, lng: 20.5645, founded: null, status: "unknown", length: null, direction: null, org: "Krakowski Tor Wyścigów Konnych", ownSite: null, operatorSite: "https://pkwk.org/", operatorName: "Polski Klub Wyścigów Konnych", note: "STÁTUSZ: ELLENŐRZENDŐ – ez a listánk egyetlen megoldatlan tétele. Lengyel ügető-specifikus forráslisták kłusaki (ügető) pályaként említik, DE a lengyel szaksajtó következetesen csak HÁROM versenypályát nevez meg az országban (Varsó-Służewiec, Wrocław-Partynice, Sopot). Ez alapján Buczków legfeljebb kisebb edző- vagy alkalmi helyszín lehet, nem hivatalos versenypálya. A megerősítéshez helyi/lengyel nyelvű forrás vagy közvetlen megkeresés kellene" }
    ],
    CZE: [
        { name: "Velká Chuchle (Chuchle Arena Praha)", city: "Prága", lat: 50.0092, lng: 14.3893, founded: 1906, status: "active", length: null, direction: "right", org: "Chuchle Arena Praha / Česká Klusácká Asociace", ownSite: "https://www.dostihy.cz/", operatorSite: "http://www.czetra.cz/", operatorName: "Česká Klusácká Asociace", note: "ELLENŐRZVE (2026, több forrás): AKTÍV ÜGETŐPÁLYA. 1906. szeptember 28-án nyílt. ITT VAN A CSEH ÜGETŐSZÖVETSÉG (Česká Klusácká Asociace) SZÉKHELYE, és a cseh ügetőfutamok túlnyomó többségét is itt rendezik. Galopp és ügető egyaránt; évi kb. 20 versenynap április-októberben, 2026-ra 13 versenynap tervezve. KÜLÖNLEGESSÉG: a világon mindössze két pályán versenyeznek jobbkéz (óramutató járása szerinti) irányban – Velká Chuchlén és a berlini pályán. A legrégebbi ma is kiírt futam a Cena prezidenta republiky (1920, T. G. Masaryk tiszteletére)" },
        { name: "Hipodrom Bravantice", city: "Bravantice (Ostrava mellett)", lat: 49.7613, lng: 18.0921, founded: 2014, status: "active", length: 1000, direction: null, org: "Hipodrom Central a.s. (Jiří Svoboda)", ownSite: "https://www.dostihyostrava.cz/", operatorSite: "http://www.czetra.cz/", operatorName: "Česká Klusácká Asociace", note: "ELLENŐRZVE (2026, több forrás): AKTÍV, KIZÁRÓLAG ÜGETŐPÁLYA. 2014 áprilisában nyílt, a SVÉD SOLVALLA mintájára építve – pontos kanyarívekkel, 16 ló számára elegendő szélességgel két sorban. 40 hektár, 200 lóbox, 10 000 fős kapacitás, többfunkciós tribün kilátótoronnyal. 2026-ban TÖBB VERSENYNAPOT rendez, mint a prágai Velká Chuchle (kb. 10/év) – nemzetközi részvétellel (holland, osztrák, német, svéd, ukrán versenyzők). A pályán mért időket nemzetközileg elismerik, Franciaországot is beleértve. Kiemelt esemény: České klusácké derby (2026. augusztus 29.). Ingyenes belépés és parkolás; a futamokat YouTube-on streamelik" }
    ],
    SVK: [
        { name: "Závodisko Bratislava – Starý háj (Petržalka)", city: "Pozsony", lat: 48.1165, lng: 17.1216, founded: null, status: "inactive", length: 2800, direction: null, org: "Závodisko, š.p. Bratislava", ownSite: null, operatorSite: "https://www.harness.sk/", operatorName: "Trotting Slovakia", note: "STÁTUSZ: a hivatalos ügető-üzemeltetés 2012-ben leállt; azóta csak alkalmi, lelkesedők (pl. a Klusácka asociácia Slovenska / Trotting Slovakia) által szervezett emlék- és díjfutamok vannak (pl. Szlovák Ügető Derby, rendszertelen időközönként). A hagyomány 1953-ig nyúlik vissza (Csehszlovák Ügető Derby)" }
    ],
    HUN: [
        { name: "Kincsem Park", city: "Budapest", lat: 47.4972, lng: 19.1218, founded: 1925, status: "active", length: null, direction: null, org: "Kincsem Nemzeti Kft.", ownSite: null, operatorSite: "https://kincsempark.hu/", operatorName: "Kincsem Park", trotSince: 2004, note: "Magyarország egyetlen aktív, kombinált galopp- és ügetőpályája; mindkét szakágban rendszeres versenynaptárral. A pálya 1925-ben nyílt; az ügetősport 2004-ben költözött ide." }
    ],
    EST: [
        { name: "Tallinna Hipodroom", city: "Tallinn", lat: 59.4323, lng: 24.7055, founded: 1923, status: "closed", length: null, direction: null, org: "korábbi üzemeltető ismeretlen", ownSite: null, operatorSite: null, operatorName: null, note: "1923 óta működött. STÁTUSZ: 2022-ben véglegesen bezárt, a területet irodaházként építik be. FONTOS KORREKCIÓ: az észt ügetősport ettől NEM szűnt meg – az Eesti Traaviliit UET-tagszövetség 2025-ben 84 futamot rendezett 1 pályán, tehát létezik egy másik, aktív helyszín, amit még azonosítani kell. Litvániában is 2 aktív ügetőpálya van (Lithuania National Trotting League, UET-tag)" }
    ],
    USA: [
        { name: "Batavia Downs", city: "Batavia, NY", lat: 43.0097, lng: -78.2050, founded: null, status: "active", length: 805, direction: null, org: "Western Regional OTB", ownSite: "https://www.bataviadownsgaming.com/live-racing/", operatorSite: null, operatorName: null, note: "Amerika egyik legrégebbi téli versenynaptáras pályája; kaszinóval egybeépítve. Pontosan fél mérföld (0,80 km). Az USA legrégebbi villanyfényes ügetőpályája, 1940.09.20-i megnyitással." },
        { name: "Buffalo Raceway", city: "Hamburg, NY", lat: 42.7359, lng: -78.8152, founded: null, status: "active", length: null, direction: null, org: "USTA", ownSite: "http://www.buffaloraceway.com", operatorSite: null, operatorName: null, note: "Az Erie County Fairgrounds területén; tavaszi-nyári versenyszezon" },
        { name: "The Mint Gaming Hall – Cumberland Run", city: "Corbin, KY", lat: 36.9248, lng: -84.0565, founded: null, status: "active", length: null, direction: null, org: "USTA", ownSite: null, operatorSite: "https://www.ustrotting.com/track-information/", operatorName: "USTA – pályainformációk", note: "Kentucky egyik újabb, kaszinóval egybeépített ügetőpályája" },
        { name: "First Tracks Cumberland", city: "Cumberland, ME", lat: 43.8119, lng: -70.2888, founded: null, status: "active", length: null, direction: null, org: "USTA", ownSite: null, operatorSite: "https://www.ustrotting.com/track-information/", operatorName: "USTA – pályainformációk", note: "Maine állam egyik két aktív pályája" },
        { name: "Dover Downs", city: "Dover, DE", lat: 39.1890, lng: -75.5306, founded: null, status: "active", length: null, direction: null, org: "Dover Downs Gaming & Entertainment", ownSite: "https://casinos.ballys.com/dover/harness-racing.htm", operatorSite: null, operatorName: null, note: "A Dover Downs Hotel & Casino komplexum része, a NASCAR-pályával (Dover Motor Speedway) közös területen" },
        { name: "Harrah's Hoosier Park", city: "Anderson, IN", lat: 40.0694, lng: -85.6408, founded: null, status: "active", length: 1408, direction: null, org: "Caesars Entertainment", ownSite: "https://www.caesars.com/harrahs-hoosier-park/racing", operatorSite: null, operatorName: null, note: "Indiana állam vezető ügetőpályája, kaszinóval. Hét-nyolcad mérföldes pálya, passzoló sávval (passing lane)." },
        { name: "Harrah's Philadelphia", city: "Chester, PA", lat: 39.8505, lng: -75.3492, founded: null, status: "active", length: null, direction: null, org: "Caesars Entertainment", ownSite: "https://www.caesars.com/harrahs-philly/racing", operatorSite: null, operatorName: null, note: "Delaware folyó partján, Philadelphiához közel" },
        { name: "Harrington Raceway", city: "Harrington, DE", lat: 38.9120, lng: -75.5730, founded: null, status: "active", length: null, direction: null, org: "Harrington Raceway & Casino", ownSite: "https://harringtonraceway.com/home/", operatorSite: null, operatorName: null, note: "Delaware állami vásárterület része" },
        { name: "Hawthorne Race Course", city: "Cicero, IL", lat: 41.8286, lng: -87.7511, founded: 1891, status: "active", length: 1609, direction: null, org: "Hawthorne Race Course Inc.", ownSite: "http://www.hawthorneracecourse.com/", operatorSite: null, operatorName: null, note: "Chicago környékének történelmi pályája (1891 óta); mind galopp, mind ügető versenyeknek otthont ad. Egy mérföldes pálya; télen ügető-, egyébként galoppversenyek." },
        { name: "Historic Track – Goshen", city: "Goshen, NY", lat: 41.4024, lng: -74.3210, founded: 1838, status: "active", length: null, direction: null, org: "Goshen Historic Track Inc.", ownSite: "http://www.goshenhistorictrack.com/", operatorSite: null, operatorName: null, note: "Amerika legrégebbi, folyamatosan használt ügetőpályája (1838 óta); a Harness Racing Museum & Hall of Fame otthona, évente csak pár versenynappal (jellemzően július 4. körül)" },
        { name: "Hollywood Casino at The Meadows", city: "Washington, PA", lat: 40.2206, lng: -80.2020, founded: null, status: "active", length: null, direction: null, org: "Penn Entertainment", ownSite: "https://www.hollywoodmeadows.com/racing", operatorSite: null, operatorName: null, note: "Pittsburgh közelében; élő ügetőverseny a kaszinóval egybeépítve" },
        { name: "Hollywood Gaming at Dayton Raceway", city: "Dayton, OH", lat: 39.8168, lng: -84.1725, founded: null, status: "active", length: null, direction: null, org: "Penn Entertainment", ownSite: "https://www.hollywooddaytonraceway.com/racing", operatorSite: null, operatorName: null, note: "Ohio állam egyik újabb, kaszinó-integrált pályája" },
        { name: "Bangor Raceway", city: "Bangor, ME", lat: 44.7907, lng: -68.7833, founded: null, status: "active", length: null, direction: null, org: "Hollywood Casino Bangor", ownSite: "http://www.hollywoodcasinobangor.com/Racing", operatorSite: null, operatorName: null, note: "Maine állam másik aktív pályája" },
        { name: "Little Brown Jug Race Track", city: "Delaware, OH", lat: 40.3165, lng: -83.0718, founded: null, status: "active", length: null, direction: null, org: "Delaware County Fairgrounds", ownSite: "http://www.littlebrownjug.com", operatorSite: null, operatorName: null, note: "A híres Little Brown Jug (3 éves ügető csődörök egyik legrangosabb amerikai futama) hivatalos helyszíne, évi néhány versenynappal a megyei vásár idején" },
        { name: "Meadowlands Racetrack", city: "East Rutherford, NJ", lat: 40.8200, lng: -74.0715, founded: 1976, status: "active", length: 1609, direction: null, org: "Meadowlands Racing & Entertainment", ownSite: "https://playmeadowlands.com/", operatorSite: null, operatorName: null, note: "Az amerikai ügetősport legrangosabb, \"mile\" (1609 m) méretű pályája; itt rendezik a Hambletonian-t, az amerikai ügetősport Kentucky Derbyjének megfelelő, legrangosabb futamát" },
        { name: "Miami Valley Raceway", city: "Lebanon, OH", lat: 39.4433, lng: -84.3201, founded: null, status: "active", length: null, direction: null, org: "Miami Valley Gaming", ownSite: "https://miamivalleygaming.com/racing/", operatorSite: null, operatorName: null, note: "Ohio állam egyik kaszinó-integrált pályája" },
        { name: "Mohegan Sun Pocono (Pocono Downs)", city: "Wilkes-Barre, PA", lat: 41.2695, lng: -75.8222, founded: null, status: "active", length: 1006, direction: null, org: "Mohegan Gaming & Entertainment", ownSite: "http://www.poconodowns.com", operatorSite: null, operatorName: null, note: "Pennsylvania északkeleti részének vezető ügetőpályája. Öt-nyolcad mérföldes, megbocsátó oválpálya – a hátulról érkező lovaknak kedvez." },
        { name: "Monticello Raceway", city: "Monticello, NY", lat: 41.6688, lng: -74.7145, founded: null, status: "active", length: null, direction: null, org: "Monticello Raceway Management", ownSite: "https://www.monticellocasinoandraceway.com/", operatorSite: null, operatorName: null, note: "A Catskills régió pályája; a látogatói vélemények szerint az utóbbi években leromlott állapotban van, jövője bizonytalan" },
        { name: "Northfield Park", city: "Northfield, OH", lat: 41.3485, lng: -81.5243, founded: 1957, status: "active", length: 805, direction: null, org: "MTR Gaming Group / Northfield Park Associates", ownSite: "http://www.northfieldpark.com", operatorSite: null, operatorName: null, note: "Cleveland közelében; egyike a legtöbb versenynapot rendező amerikai ügetőpályáknak (gyakorlatilag egész évben). Fél mérföldes bullring – itt a hajtók jellemzően korán támadnak, szemben a Yonkersben szokásos várakozó taktikával." },
        { name: "Northville Downs (Barry Expo Center)", city: "Hastings, MI", lat: 42.6770, lng: -85.3953, founded: null, status: "active", length: null, direction: null, org: "Northville Downs", ownSite: "http://www.northvilledowns.com/", operatorSite: null, operatorName: null, note: "A hagyományos detroiti Northville Downs pálya 2024-es bezárása után ideiglenesen a Barry Expo Centerben rendezik a versenyeket" },
        { name: "Oak Grove Racing, Gaming & Hotel", city: "Oak Grove, KY", lat: 36.6586, lng: -87.4393, founded: null, status: "active", length: null, direction: null, org: "Kentucky Downs / Oak Grove", ownSite: "https://www.oakgrovegaming.com/racing", operatorSite: null, operatorName: null, note: "Kentucky-Tennessee határ menti, kaszinóval egybeépített pálya" },
        { name: "Ocean Downs", city: "Berlin, MD", lat: 38.3522, lng: -75.1633, founded: null, status: "active", length: null, direction: null, org: "Ocean Downs Casino", ownSite: "https://www.oceandowns.com/racing/", operatorSite: null, operatorName: null, note: "Maryland tengerparti régiójának (Ocean City közelében) pályája; híres a szerdai \"$1 Wednesdays\" akciós versenynapjairól" },
        { name: "Plainridge Park", city: "Plainville, MA", lat: 42.0322, lng: -71.3044, founded: null, status: "active", length: null, direction: null, org: "Penn Entertainment", ownSite: "http://www.plainridgeparkcasino.com/racing", operatorSite: null, operatorName: null, note: "Massachusetts állam egyetlen aktív ügetőpályája" },
        { name: "The Red Mile", city: "Lexington, KY", lat: 38.0426, lng: -84.5198, founded: 1875, status: "active", length: 1609, direction: null, org: "Red Mile Gaming & Racing", ownSite: "http://www.redmileracing.com/", operatorSite: null, operatorName: null, note: "1875 óta működik; a világ egyik leggyorsabb, \"mile\" méretű pályája, számos ügető-világrekord született itt" },
        { name: "Rosecroft Raceway", city: "Fort Washington, MD", lat: 38.7969, lng: -76.9625, founded: 1949, status: "active", length: null, direction: null, org: "Rosecroft Raceway", ownSite: "http://www.rosecroft.com", operatorSite: null, operatorName: null, note: "Washington D.C. közelében; 1949 óta működő pálya" },
        { name: "Running Aces Casino, Hotel & Racetrack", city: "Columbus, MN", lat: 45.2447, lng: -93.0339, founded: null, status: "active", length: null, direction: null, org: "Running Aces", ownSite: "https://runaces.com/racing/", operatorSite: null, operatorName: null, note: "Minnesota állam egyetlen aktív ügetőpályája; élő versenyek keddenként, csütörtökönként és vasárnaponként május-szeptember között" },
        { name: "Saratoga Harness Racing", city: "Saratoga Springs, NY", lat: 43.0620, lng: -73.7742, founded: null, status: "active", length: null, direction: null, org: "Saratoga Casino Hotel", ownSite: "https://saratogacasino.com/racing/", operatorSite: null, operatorName: null, note: "A híres Saratoga Springs galoppváros ügető-testvérpályája" },
        { name: "Eldorado Gaming Scioto Downs", city: "Columbus, OH", lat: 39.8395, lng: -82.9974, founded: null, status: "active", length: 1006, direction: null, org: "Caesars Entertainment", ownSite: "https://www.caesars.com/scioto-downs/racing", operatorSite: null, operatorName: null, note: "Ohio állam fővárosának ügetőpályája. Öt-nyolcad mérföldes pálya, kiemelkedő minőségű futófelülettel és megdöntött kanyarokkal." },
        { name: "Shenandoah Downs", city: "Woodstock, VA", lat: 38.8732, lng: -78.5230, founded: null, status: "active", length: null, direction: null, org: "Shenandoah County Fairgrounds", ownSite: null, operatorSite: "https://www.ustrotting.com/track-information/", operatorName: "USTA – pályainformációk", note: "Virginia állam vidéki hangulatú, vásártéri pályája" },
        { name: "Tioga Downs", city: "Nichols, NY", lat: 42.0240, lng: -76.4131, founded: null, status: "active", length: null, direction: null, org: "Tioga Downs Casino Resort", ownSite: "https://tiogadowns.com/racing/", operatorSite: null, operatorName: null, note: "New York állam déli részének kaszinó-integrált pályája" },
        { name: "Vernon Downs", city: "Vernon, NY", lat: 43.0668, lng: -75.5280, founded: 1953, status: "active", length: 1408, direction: null, org: "American Racing & Entertainment LLC (Jeff Gural)", ownSite: "https://vernondowns.com/racing/", operatorSite: null, operatorName: null, note: "ELLENŐRZVE (2026): AKTÍV. A 2026-os szezon nyitva (péntek-szombat 17:05, július-augusztusban csütörtök is); eredmények június végéig igazolva. 1953-ban nyílt; 2004-ben csődbe ment és bezárt, 2006-ban Jeff Gural vásárolta meg és újraindította. 2025-ben a 72. szezonját zárta. 7/8 mérföldes pályája New York állam legjobb versenyfelületének tartják. Kiemelt futamok: Zweig Memorial Trot, Empire Breeders Classic. MEGJEGYZÉS: a pálya visszatérően pénzügyi nehézségekkel küzd (2023-ban WARN-bejelentés 250 fő elbocsátásáról, adókedvezmény-vitával), de a bezárás nem valósult meg" },
        { name: "Yonkers Raceway (Empire City)", city: "Yonkers, NY", lat: 40.9195, lng: -73.8650, founded: 1899, status: "active", length: 805, direction: null, org: "MGM Resorts / Empire City Casino", ownSite: "https://empirecitycasino.mgmresorts.com/en/racing.html", operatorSite: null, operatorName: null, note: "Amerika legrégebbi, folyamatosan üzemelő versenypályája (1899 óta) egyes források szerint; New York City közvetlen közelében. Fél mérföldes bullring-pálya – az 1899-ben alapított Empire City Race Track utódja. A szűk kanyarok miatt a rajthely és a hajtó szerepe kiemelten fontos." }
    ],
    CAN: [
        { name: "Woodbine Mohawk Park", city: "Campbellville, ON", lat: 43.4966, lng: -80.0006, founded: null, status: "active", length: 1409, direction: null, org: "Woodbine Entertainment Group", ownSite: "https://woodbine.com/mohawk/", operatorSite: null, operatorName: null, note: "Kanada vezető ügetőpályája; itt rendezik a Canadian Trotting Classic-ot (1976 óta) és a Canadian Pacing Derby-t, valamint a Mohawk Million-t. Elements Casino Mohawk kaszinóval egybeépítve" },
        { name: "The Raceway at Western Fair District", city: "London, ON", lat: 42.9900, lng: -81.2187, founded: null, status: "active", length: null, direction: null, org: "Western Fair District", ownSite: "http://www.westernfairdistrict.com/gaming/raceway", operatorSite: null, operatorName: null, note: "Ontario délnyugati részének vezető ügetőpályája; a Camluck Classic helyszíne" },
        { name: "Flamboro Downs", city: "Dundas (Hamilton), ON", lat: 43.3101, lng: -80.0769, founded: null, status: "active", length: null, direction: null, org: "Great Canadian Entertainment", ownSite: "http://www.flamborodowns.com", operatorSite: null, operatorName: null, note: "Hamilton közelében, kaszinóval egybeépítve" },
        { name: "Georgian Downs", city: "Innisfil, ON", lat: 44.2924, lng: -79.6871, founded: null, status: "active", length: null, direction: null, org: "Great Canadian Entertainment", ownSite: "http://www.georgiandowns.com/", operatorSite: null, operatorName: null, note: "Nyári szezonban keddi és vasárnapi versenynapokkal; a 400-as autópálya mellett" },
        { name: "Grand River Raceway", city: "Elora, ON", lat: 43.6739, lng: -80.4317, founded: null, status: "active", length: null, direction: null, org: "Grand River Agricultural Society", ownSite: "https://grandriverraceway.com/", operatorSite: null, operatorName: null, note: "Modern, akadálymentes létesítmény kaszinóval; ingyenes belépéssel" },
        { name: "Hanover Raceway", city: "Hanover, ON", lat: 44.1458, lng: -81.0270, founded: null, status: "active", length: null, direction: null, org: "Hanover Raceway", ownSite: "http://www.hanoverraceway.com/", operatorSite: null, operatorName: null, note: "Kisvárosi, családias hangulatú pálya kaszinóval és étteremmel" },
        { name: "Clinton Raceway", city: "Clinton, ON", lat: 43.6201, lng: -81.5366, founded: null, status: "active", length: null, direction: null, org: "Clinton Raceway", ownSite: "http://www.clintonraceway.com", operatorSite: null, operatorName: null, note: "2026-ban itt rendezték a Nemzeti Hajtóbajnokságot (National Driving Championship); vasárnapi versenynapok, a pálya belsejében két baseball-pálya" },
        { name: "Dresden Raceway", city: "Dresden, ON", lat: 42.5818, lng: -82.1830, founded: null, status: "active", length: null, direction: null, org: "Dresden Raceway", ownSite: "http://dresden-raceway.ca/", operatorSite: null, operatorName: null, note: "Kis, barátságos vidéki pálya vasárnapi versenynapokkal" },
        { name: "Kawartha Downs", city: "Cavan-Monaghan (Peterborough), ON", lat: 44.2080, lng: -78.3935, founded: null, status: "active", length: null, direction: null, org: "Kawartha Downs", ownSite: "https://www.kawarthadowns.com/events/harness-racing", operatorSite: null, operatorName: null, note: "Szombat esti versenynapok nyáron; egyéb rendezvényeknek (autókiállítás, tacskóverseny) is otthont ad" },
        { name: "Leamington Raceway", city: "Leamington, ON", lat: 42.0598, lng: -82.5961, founded: null, status: "active", length: null, direction: null, org: "Leamington Raceway", ownSite: "http://www.lakeshorehorseraceway.com/", operatorSite: null, operatorName: null, note: "Vasárnapi, családbarát versenynapok" },
        { name: "Hiawatha Horse Park", city: "Sarnia, ON", lat: 42.9874, lng: -82.3272, founded: null, status: "active", length: null, direction: null, org: "Hiawatha Horse Park", ownSite: "http://hiawathahorsepark.ca/", operatorSite: null, operatorName: null, note: "Heti egy versenynap; golf-driving range is működik a területen" },
        { name: "Rideau Carleton Raceway", city: "Ottawa, ON", lat: 45.2951, lng: -75.6058, founded: 1962, status: "closed", length: null, direction: null, org: "Hard Rock International (51%) / Rideau Carleton Raceway Holdings (49%)", ownSite: "http://www.rcr.net/", operatorSite: null, operatorName: null, note: "1962. szeptember 1-jén nyílt, 5500 fős kapacitással; a Frank Ryan Memorial Trot és a Des Smith Classic Pace otthona volt. STÁTUSZ: 2026 márciusában véglegesen bezárt – a helyszín ma Hard Rock Hotel & Casino Ottawa néven működik tovább, lóverseny nélkül" },
        { name: "Hippodrome 3R", city: "Trois-Rivières, QC", lat: 46.3453, lng: -72.5595, founded: null, status: "active", length: null, direction: null, org: "Hippodrome 3R", ownSite: "https://hippodrome3r.ca/", operatorSite: null, operatorName: null, note: "Québec tartomány EGYETLEN megmaradt versenypályája, egyben a legrégebbi is; a Coupe de l'Avenir helyszíne. A montreali, gatineau-i és québec-városi hippodromok mind bezártak" },
        { name: "Century Downs Racetrack and Casino", city: "Rocky View County (Calgary), AB", lat: 51.2014, lng: -113.9806, founded: null, status: "active", length: null, direction: null, org: "Century Casinos", ownSite: "https://www.cnty.com/centurydowns", operatorSite: null, operatorName: null, note: "Calgary közelében; Alberta tartomány egyik vezető pályája" },
        { name: "Century Mile Racetrack and Casino", city: "Edmonton International Airport, AB", lat: 53.3146, lng: -113.5601, founded: null, status: "active", length: 1609, direction: null, org: "Century Casinos", ownSite: "https://www.cnty.com/centurymile", operatorSite: null, operatorName: null, note: "Egy mérföldes pálya az edmontoni repülőtér mellett; a korábbi Northlands Park utódja" },
        { name: "The Track on 2", city: "Lacombe County, AB", lat: 52.4522, lng: -113.7929, founded: null, status: "active", length: 1609, direction: null, org: "Alberta Standardbred Horse Association (ASHA)", ownSite: "https://www.thetrackon2.com", operatorSite: null, operatorName: null, note: "Egy mérföldes közép-alberta-i pálya; tavaszi és nyári versenyszezonnal" },
        { name: "Fraser Downs (Elements Casino Surrey)", city: "Surrey, BC", lat: 49.1123, lng: -122.7293, founded: 1976, status: "closed", length: null, direction: null, org: "Great Canadian Entertainment", ownSite: null, operatorSite: "https://standardbredcanada.ca/content/links-racetracks.html", operatorName: "Standardbred Canada – pályalinkek", note: "British Columbia egyetlen ügetőpályája volt, 1976 óta. STÁTUSZ: 2025. augusztus 15-én a Great Canadian Entertainment azonnali hatállyal bezárta a pályát, az istállókat és a háttérlétesítményt; a versenypálya burkolatát felszedték. Az Elements Casino Surrey és a lelátó továbbra is nyitva. A terület a Cloverdale Fairgrounds átépítési tervének része. Forrás: Standardbred Canada, CBC News (2025.08.)" },
        { name: "Marquis Downs", city: "Saskatoon, SK", lat: 52.0941, lng: -106.6779, founded: null, status: "closed", length: null, direction: null, org: "Prairieland Park", ownSite: null, operatorSite: "https://standardbredcanada.ca/content/links-racetracks.html", operatorName: "Standardbred Canada – pályalinkek", note: "STÁTUSZ: 2021 óta nincs lóverseny a helyszínen – a területet átalakították, ma a Saskatoon-i labdarúgó-stadion (Nutrien Park) áll rajta. A Standardbred Canada nyilvántartásában még szerepel történeti rekordok miatt" },
        { name: "Yorkton Exhibition", city: "Yorkton, SK", lat: 51.2109, lng: -102.4902, founded: null, status: "active", length: null, direction: null, org: "Yorkton Exhibition Association", ownSite: null, operatorSite: "https://standardbredcanada.ca/content/links-racetracks.html", operatorName: "Standardbred Canada – pályalinkek", note: "Vásártéri pálya; chuckwagon- és szekérversenyek is zajlanak itt" },
        { name: "Red Shores Racetrack & Casino", city: "Charlottetown, PE", lat: 46.2466, lng: -63.1169, founded: null, status: "active", length: null, direction: null, org: "Red Shores", ownSite: "http://www.redshores.ca", operatorSite: null, operatorName: null, note: "Prince Edward Island fő pályája; a P.E.I. Free-For-All Series és a Gold Cup & Saucer otthona" },
        { name: "Red Shores Summerside Raceway", city: "Summerside, PE", lat: 46.3998, lng: -63.7996, founded: null, status: "active", length: null, direction: null, org: "Red Shores", ownSite: "http://www.redshores.ca", operatorSite: null, operatorName: null, note: "A Red Shores hálózat második pályája PEI-n, sportkomplexummal egybeépítve" },
        { name: "Truro Raceway", city: "Truro, NS", lat: 45.3764, lng: -63.2700, founded: null, status: "active", length: null, direction: null, org: "Truro Raceway", ownSite: "http://www.truroraceway.ca/", operatorSite: null, operatorName: null, note: "Nova Scotia vezető ügetőpályája; a lelátót és az éttermet nemrég teljesen felújították" },
        { name: "Inverness Raceway", city: "Inverness, NS", lat: 46.2271, lng: -61.3007, founded: null, status: "active", length: null, direction: null, org: "Inverness Raceway", ownSite: null, operatorSite: "https://standardbredcanada.ca/content/links-racetracks.html", operatorName: "Standardbred Canada – pályalinkek", note: "Cape Breton-szigeti pálya; az Atlantic Sires Stakes (ATSS) egyik állomása, kiváló közösségi hangulattal" },
        { name: "Northside Downs", city: "North Sydney, NS", lat: 46.2094, lng: -60.2692, founded: null, status: "active", length: null, direction: null, org: "Northside Downs", ownSite: null, operatorSite: "https://standardbredcanada.ca/content/links-racetracks.html", operatorName: "Standardbred Canada – pályalinkek", note: "Cape Breton-sziget másik pályája; ingyenes belépéssel, családias hangulattal" },
        { name: "Exhibition Park Raceway", city: "Saint John, NB", lat: 45.3134, lng: -66.0203, founded: null, status: "active", length: null, direction: null, org: "Exhibition Park", ownSite: null, operatorSite: "https://standardbredcanada.ca/content/links-racetracks.html", operatorName: "Standardbred Canada – pályalinkek", note: "New Brunswick tartomány pályája a Saint John-i vásártéren" },
        { name: "Fredericton Raceway", city: "Fredericton, NB", lat: 45.9608, lng: -66.6564, founded: null, status: "active", length: null, direction: null, org: "Fredericton Raceway", ownSite: null, operatorSite: "https://standardbredcanada.ca/content/links-racetracks.html", operatorName: "Standardbred Canada – pályalinkek", note: "New Brunswick tartomány fővárosának ügetőpályája" },
        { name: "St. John's Racing & Entertainment Centre", city: "Goulds (St. John's), NL", lat: 47.4460, lng: -52.7643, founded: null, status: "closed", length: null, direction: null, org: "korábbi üzemeltető: St. John's Racing & Entertainment Centre Inc.", ownSite: null, operatorSite: "https://standardbredcanada.ca/content/links-racetracks.html", operatorName: "Standardbred Canada – pályalinkek", note: "ELLENŐRZVE (több forrás): VÉGLEGESEN BEZÁRT. Newfoundland tartomány egyetlen versenypályája volt. Kronológia: 2015. december 31-én bejelentették, hogy 2016-ban nem lesz sem élő, sem szimulcast fogadás; 2016 júniusában a lótulajdonosok kilakoltatási értesítést kaptak, az istállókat júliusban bezárták. Brett Whelan igazgató a CBC-nek: \"Az ökonómia a fő ok... be kellett zárnunk, mert a lóállomány az előző év egyötödére csökkent.\" A tartományi képviselőház ezt követően hatályon kívül helyezte az Atlantic Provinces Harness Racing Commission Actet. MEGJEGYZÉS: a Standardbred Canada pályalistájában elavult bejegyzésként még szerepel" }
    ],
    AUS: [
        { name: "Melton Entertainment Park (Tabcorp Park)", city: "Melton, VIC", lat: -37.6969, lng: 144.5989, founded: 2009, status: "active", length: 1000, direction: null, org: "Harness Racing Victoria", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Victoria állam fő pályája, 2009. július 5-én nyílt meg, felváltva a korábbi Moonee Valley-i pályát. Éttermekkel, szállodával és konferenciaközponttal; az A G Hunter Cup és a Victoria Cup otthona" },
        { name: "Club Menangle (Menangle Park Paceway)", city: "Menangle Park, NSW", lat: -34.1032, lng: 150.7446, founded: 1914, status: "active", length: 1400, direction: null, org: "NSW Harness Racing Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", trotSince: 1953, note: "Új-Dél-Wales fő pályája; a Miracle Mile Pace otthona, Ausztrália egyik legrangosabb ügetőfutamáé. Az Australian Pacing Gold (APG) három tulajdonos klubjának egyike. 1914-ben GALOPP-pályaként nyílt; a NSW Harness Racing Club 1952-ben vásárolta meg, ügetőpályaként 1953. szeptember 26-án avatták. 2008-ban Tabcorp Parkként újranyitott, 2010-ben vette át a Harold Parktól Sydney fő ügetőpályájának szerepét." },
        { name: "Albion Park Raceway", city: "Brisbane, QLD", lat: -27.4393, lng: 153.0465, founded: null, status: "active", length: null, direction: null, org: "Albion Park Harness Racing Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Queensland fő pályája; a Blacks A Fake Queensland Championship helyszíne. Az APG három tulajdonos klubjának egyike" },
        { name: "Gloucester Park", city: "East Perth, WA", lat: -31.9580, lng: 115.8811, founded: null, status: "active", length: null, direction: null, org: "Gloucester Park Harness Racing", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Nyugat-Ausztrália fő pályája, Perth belvárosában; a West Australian Derby otthona. Keddi és pénteki versenynapokon ingyenes belépés, családbarát hangulattal" },
        { name: "Globe Derby Park", city: "Adelaide, SA", lat: -34.7964, lng: 138.5914, founded: null, status: "active", length: null, direction: null, org: "South Australian Trotting Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Dél-Ausztrália fő ügetőpályája" },
        { name: "Redcliffe Paceway", city: "Redcliffe, QLD", lat: -27.2311, lng: 153.1072, founded: null, status: "active", length: null, direction: null, org: "Redcliffe Harness Racing Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Queensland második legfontosabb pályája; nemrég felújítva" },
        { name: "Bathurst Paceway", city: "Bathurst, NSW", lat: -33.4514, lng: 149.5747, founded: null, status: "active", length: null, direction: null, org: "Bathurst Harness Racing Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Az éves Gold Crown sorozat otthona; ingyenes belépés a versenynapokon" },
        { name: "Newcastle Paceway", city: "New Lambton, NSW", lat: -32.9189, lng: 151.7278, founded: null, status: "active", length: null, direction: null, org: "Newcastle Harness Racing Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Új-Dél-Wales egyik regionális központja" },
        { name: "Bendigo Harness Racing Club", city: "Junortoun, VIC", lat: -36.7691, lng: 144.3345, founded: null, status: "active", length: null, direction: null, org: "Bendigo Harness Racing Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Victoria egyik vezető vidéki pályája; a Red Hot Summer koncertsorozat helyszíne is" },
        { name: "Ballarat & District Trotting Club", city: "Redan (Ballarat), VIC", lat: -37.5765, lng: 143.8305, founded: 1861, status: "active", length: null, direction: null, org: "Ballarat & District Trotting Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "A Ballarat and Creswick Trotting Club 1861-ben alakult – ez volt AUSZTRÁLIA ELSŐ, kifejezetten ügetősport népszerűsítésére létrehozott klubja" },
        { name: "Shepparton Harness Racing Club", city: "Kialla, VIC", lat: -36.4475, lng: 145.3892, founded: null, status: "active", length: null, direction: null, org: "Shepparton Harness Racing Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Victoria északi részének regionális pályája" },
        { name: "Cranbourne Harness Racing Club", city: "Cranbourne, VIC", lat: -38.1180, lng: 145.2801, founded: null, status: "active", length: null, direction: null, org: "Cranbourne Harness Racing Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Melbourne délkeleti agglomerációjának pályája" },
        { name: "Pinjarra Paceway", city: "Pinjarra, WA", lat: -32.6438, lng: 115.8664, founded: null, status: "active", length: null, direction: null, org: "Pinjarra Harness Racing Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Nyugat-Ausztrália egyik legnépszerűbb vidéki pályája, hétfői versenynapokkal" },
        { name: "Bunbury Trotting Club", city: "Carey Park (Bunbury), WA", lat: -33.3557, lng: 115.6551, founded: null, status: "active", length: null, direction: null, org: "Bunbury Trotting Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Donaldson Park; Nyugat-Ausztrália délnyugati régiójának pályája" },
        { name: "Northam Race Club", city: "Northam, WA", lat: -31.6400, lng: 116.6999, founded: null, status: "active", length: null, direction: null, org: "Northam Race Club", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "A Northam Cup otthona; Perth-től kb. 1 óra 20 percre" },
        { name: "Mowbray Racecourse", city: "Launceston, TAS", lat: -41.4039, lng: 147.1373, founded: null, status: "active", length: null, direction: null, org: "Tasracing", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Tasmania északi részének fő versenypályája" },
        { name: "Elwick Racecourse", city: "Glenorchy (Hobart), TAS", lat: -42.8254, lng: 147.2892, founded: null, status: "active", length: null, direction: null, org: "Tasracing", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Tasmania déli részének fő pályája, a fővárosban" },
        { name: "Devonport Racing Club", city: "Spreyton, TAS", lat: -41.2120, lng: 146.3388, founded: null, status: "active", length: null, direction: null, org: "Tasracing", ownSite: null, operatorSite: "https://www.harness.org.au/", operatorName: "Harness Racing Australia", note: "Minden időjárásban használható pálya; a Devonport Cup otthona" }
    ],
    NZL: [
        { name: "Addington Raceway", city: "Christchurch", lat: -43.5440, lng: 172.6000, founded: null, status: "active", length: null, direction: null, org: "New Zealand Metropolitan Trotting Club", ownSite: null, operatorSite: "https://hrnz.co.nz/", operatorName: "Harness Racing New Zealand", note: "Új-Zéland vezető ügetőpályája; a New Zealand Trotting Cup otthona, az ország legrangosabb ügetőfutamáé. Rendezvényközponttal egybeépítve" },
        { name: "Alexandra Park Raceway", city: "Auckland", lat: -36.8923, lng: 174.7762, founded: null, status: "active", length: null, direction: null, org: "Auckland Trotting Club", ownSite: null, operatorSite: "https://hrnz.co.nz/", operatorName: "Harness Racing New Zealand", note: "Az Északi-sziget vezető pályája, Auckland belvárosához közel; az Auckland Trotting Cup helyszíne" },
        { name: "Cambridge Raceway", city: "Cambridge", lat: -37.8810, lng: 175.4571, founded: null, status: "active", length: null, direction: null, org: "Cambridge Harness Racing Club", ownSite: null, operatorSite: "https://hrnz.co.nz/", operatorName: "Harness Racing New Zealand", note: "Waikato régió fő pályája; lakóautós parkolóhellyel és sportbárral" },
        { name: "Ashburton Raceway", city: "Ashburton", lat: -43.8886, lng: 171.7645, founded: null, status: "active", length: null, direction: null, org: "Ashburton Trotting Club", ownSite: null, operatorSite: "https://hrnz.co.nz/", operatorName: "Harness Racing New Zealand", note: "Canterbury régió vidéki pályája" },
        { name: "Ascot Park Raceway", city: "Invercargill", lat: -46.4010, lng: 168.3910, founded: null, status: "active", length: null, direction: null, org: "Southland Harness Racing Club", ownSite: null, operatorSite: "https://hrnz.co.nz/", operatorName: "Harness Racing New Zealand", note: "Új-Zéland (és a világ) egyik legdélibb versenypályája" },
        { name: "Methven Racecourse", city: "Methven", lat: -43.6227, lng: 171.6432, founded: null, status: "active", length: null, direction: null, org: "Methven Trotting Club", ownSite: null, operatorSite: "https://hrnz.co.nz/", operatorName: "Harness Racing New Zealand", note: "Festői, hófödte hegyekre néző pálya a Déli-Alpok lábánál; termálfürdő közvetlenül mellette" },
        { name: "Rangiora Racecourse", city: "Fernside (Rangiora)", lat: -43.2933, lng: 172.5685, founded: null, status: "active", length: null, direction: null, org: "Canterbury Park Trotting Club", ownSite: null, operatorSite: "https://hrnz.co.nz/", operatorName: "Harness Racing New Zealand", note: "A Rangiora karácsonyi versenynapjairól ismert, ingyenes belépéssel" },
        { name: "Central Southland Raceway", city: "Winton", lat: -46.1150, lng: 168.3176, founded: null, status: "active", length: null, direction: null, org: "Central Southland Harness Racing Club", ownSite: null, operatorSite: "https://hrnz.co.nz/", operatorName: "Harness Racing New Zealand", note: "Vidéki pálya, évente már csak néhány versenynappal" },
        { name: "Forbury Park Raceway", city: "Dunedin", lat: -45.9051, lng: 170.4876, founded: 1900, status: "closed", length: null, direction: null, org: "Forbury Park Trotting Club (korábbi)", ownSite: null, operatorSite: "https://hrnz.co.nz/", operatorName: "Harness Racing New Zealand", note: "Otago régió történelmi ügetőpályája volt. STÁTUSZ: 2021-ben véglegesen bezárt pénzügyi okokból, a területet lakóövezetté alakítják" }
    ],
    DNK: [
        { name: "Charlottenlund Travbane (Lunden)", city: "Charlottenlund (Koppenhága)", lat: 55.7545, lng: 12.5868, founded: 1891, status: "active", length: 950, direction: "left", org: "Det Danske Travselskab", ownSite: "https://www.travbanen.dk/", operatorSite: null, operatorName: null, note: "ÉSZAK-EURÓPA LEGRÉGEBBI ÜGETŐPÁLYÁJA (1891). A Copenhagen Cup (1928 óta) és a Dansk Trav Derby otthona. 950 m, 22 m széles, 200 m célegyenes, balkéz. Ikonikus történelmi tornyaival, a Charlottenlundi erdő mellett" },
        { name: "Jydsk Væddeløbsbane", city: "Aarhus", lat: 56.1279, lng: 10.1960, founded: null, status: "active", length: null, direction: null, org: "Jydsk Væddeløbsbane", ownSite: "https://www.jvb-aarhus.dk/", operatorSite: null, operatorName: null, note: "Aarhus déli részén, a Marselisborg-erdők mellett; egész évben ügető, áprilistól októberig galopp is" },
        { name: "Billund Trav", city: "Billund", lat: 55.7289, lng: 9.1320, founded: 1971, status: "closed", length: 1200, direction: null, org: "Billund Trav A/S", ownSite: null, operatorSite: "https://www.trav.dk/", operatorName: "Dansk Travsports Centralforbund", note: "Korábban Sydjysk Væddeløbsbane néven; a megnyitó versenynapon kb. 15 000 néző volt jelen. 1200 m, 250 m célegyenes. STÁTUSZ: az utolsó versenynap 2021. október 23-án volt; a területet a Kirkbi A/S vásárolta meg, ma lakónegyed épül rajta. Ezzel Dániában 7 ügetőpálya maradt. Forrás: Dansk Hestevæddeløb (2021)" },
        { name: "Fyens Væddeløbsbane", city: "Odense", lat: 55.3756, lng: 10.3493, founded: null, status: "active", length: 1000, direction: null, org: "Fyens Væddeløbsbane", ownSite: "https://www.fvb-odense.dk/", operatorSite: null, operatorName: null, note: "Odense nyugati részén; galopp és ügető egyaránt. 1000 m, 19,5 m széles, 250 m célegyenes" },
        { name: "Skive Trav", city: "Skive", lat: 56.5316, lng: 9.0333, founded: null, status: "active", length: null, direction: null, org: "Skive Trav", ownSite: "https://www.skive-trav.dk/", operatorSite: null, operatorName: null, note: "Itt versenyzett a legendás dán ügető, Tarok" },
        { name: "Racing Arena Aalborg", city: "Aalborg", lat: 57.0532, lng: 9.8766, founded: null, status: "active", length: null, direction: null, org: "Aalborg Væddeløbsbane", ownSite: "https://www.aav.dk/", operatorSite: null, operatorName: null, note: "Észak-Jylland pályája, Spar Nord Arena néven is ismert" },
        { name: "Nykøbing F. Travbane", city: "Nykøbing Falster", lat: 54.7274, lng: 11.9171, founded: null, status: "active", length: null, direction: null, org: "Nykøbing F. Travbane", ownSite: "https://www.nyktrav.dk/", operatorSite: null, operatorName: null, note: "Falster szigetének pályája, Dánia déli részén" },
        { name: "Bornholms Brand Park", city: "Aakirkeby (Bornholm)", lat: 55.1261, lng: 14.9208, founded: null, status: "active", length: null, direction: null, org: "Bornholms Brand Park", ownSite: "https://www.bornholmsbrandpark.dk/", operatorSite: null, operatorName: null, note: "Bornholm szigetének ügetőpályája a Balti-tengeren" }
    ],
    DEU: [
        { name: "Trabrennbahn Pfarrkirchen", city: "Pfarrkirchen", lat: 48.43251667, lng: 12.938, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: "https://www.hvtonline.de/", operatorName: "Hauptverband für Traberzucht (HVT)", note: "Koordináta forrása: OpenStreetMap (Nominatim) + Wikipédia (de) – Pfarrkirchen. Pálya forrása: Hauptverband für Traberzucht (hvtonline.de) 2026-os versenynaptár" },
        { name: "Trabrennbahn Berlin-Mariendorf", city: "Berlin", lat: 52.4273, lng: 13.3906, founded: null, status: "active", length: null, direction: null, org: "Berliner Trabrenn-Verein e.V.", ownSite: null, operatorSite: "https://www.hvtonline.de/", operatorName: "HVT – Hauptverband für Traberzucht", note: "Németország legrangosabb ügetőpályája, a Deutsches Traber-Derby otthona; a HVT (szövetség) központi elszámolóhelye is itt működik" },
        { name: "Trabrennbahn Berlin-Karlshorst", city: "Berlin", lat: 52.4760, lng: 13.5267, founded: null, status: "active", length: 1609, direction: null, org: "Trabrennbahn Karlshorst", ownSite: null, operatorSite: "https://www.hvtonline.de/", operatorName: "HVT – Hauptverband für Traberzucht", note: "Berlin második pályája, 1609 m-es (mile) távokkal; havi bolhapiacnak is otthont ad" },
        { name: "Trabrennbahn Gelsenkirchen", city: "Gelsenkirchen", lat: 51.5049, lng: 7.0559, founded: 1912, status: "active", length: null, direction: null, org: "Gelsentrab", ownSite: null, operatorSite: "https://www.hvtonline.de/", operatorName: "HVT – Hauptverband für Traberzucht", note: "Németország egyik legnagyobb ügetőpályája, a Ruhr-vidék központjában; a versenynaptár egyik legaktívabb helyszíne" },
        { name: "Trabrennbahn München-Daglfing", city: "München", lat: 48.1421, lng: 11.6576, founded: null, status: "active", length: null, direction: null, org: "Münchener Traber-Zucht- und Rennverein", ownSite: null, operatorSite: "https://www.hvtonline.de/", operatorName: "HVT – Hauptverband für Traberzucht", note: "Bajorország fő ügetőpályája; havonta kétszer versenynap, nőknek és gyerekeknek ingyenes belépéssel" },
        { name: "Trabrennbahn Mönchengladbach", city: "Mönchengladbach", lat: 51.2325, lng: 6.4911, founded: null, status: "active", length: null, direction: null, org: "Verein zur Förderung des Rheinischen Trabrennsportes e.V.", ownSite: "http://www.mgtrab.de/", operatorSite: null, operatorName: null, note: "ELLENŐRZVE (2026): AKTÍV, DE VESZÉLYEZTETETT. 2026-ra 13 versenynapot terveztek (a január 25-i és március 15-i elmaradt); kiemelt futamok: Großer Preis der Stadt Mönchengladbach (július 19.), Großer Preis des Rheinischen Karnevals (november 15.). A pálya a Niers folyó mellett, a repülőtér szomszédságában fekszik. FENYEGETÉS: a város 2027-től ipari-kereskedelmi övezetté alakítaná a 232 hektáros területet; a \"Go4Gewerbe\" tartományi programból 2,3 millió eurós állami garanciát kapott erre. A bérleti szerződést a város évente csak egy évre hosszabbítja, így nincs tervezési biztonság. A HVT (német ügetőszövetség) elnöke levélben kérte NRW miniszterelnökét a pálya megőrzésére" },
        { name: "Trabrennbahn Bahrenfeld", city: "Hamburg", lat: 53.5765, lng: 9.8925, founded: null, status: "active", length: null, direction: null, org: "Hamburger Renn-Club", ownSite: null, operatorSite: "https://www.hvtonline.de/", operatorName: "HVT – Hauptverband für Traberzucht", note: "Észak-Németország fő pályája; nagyszabású koncerthelyszínként is ismert (Ed Sheeran, Foo Fighters, Robbie Williams)" },
        { name: "Trabrennbahn Straubing", city: "Straubing", lat: 48.8699, lng: 12.5626, founded: null, status: "active", length: null, direction: null, org: "Straubinger Trabrennverein", ownSite: null, operatorSite: "https://www.hvtonline.de/", operatorName: "HVT – Hauptverband für Traberzucht", note: "Alsó-bajorországi, történelmi hangulatú pálya" }
    ],
    AUT: [
        { name: "Trabrennbahn Krieau", city: "Bécs", lat: 48.2106, lng: 16.4143, founded: 1878, status: "active", length: 1000, direction: "left", org: "Wiener Trabrenn-Verein", ownSite: null, operatorSite: "https://www.krieau.at/", operatorName: "Wiener Trabrenn-Verein", note: "1878. szeptember 29-én nyílt – EURÓPA MÁSODIK LEGRÉGEBBI ÜGETŐPÁLYÁJA; csak a moszkvai Központi Hippodrom (1834) idősebb nála. Ma is eredeti helyén működik, a bécsi Leopoldstadt kerületben, a Prater park mellett. Az Osztrák Ügető Derby és a Graf Kálmán Hunyady Memorial otthona (utóbbi magyar vonatkozású névadóval). 1000 m, homokos talaj; a Traberzentrale besorolásában A-kategóriás pálya (A: min. 1000 m, B: min. 800 m). Évi 20+ versenynappal Ausztria legnagyobb versenyszervezője; a 141. osztrák derbit 2026. június 21-én rendezték" }
    ],
    NLD: [
        { name: "Victoria Park Wolvega", city: "Wolvega (Frízföld)", lat: 52.8834, lng: 6.0097, founded: 1964, status: "active", length: 1000, direction: null, org: "Victoria Park Wolvega", ownSite: "https://www.victoriaparkwolvega.nl/", operatorSite: null, operatorName: null, note: "HOLLANDIA VEZETŐ ÜGETŐPÁLYÁJA, sokak szerint Európa egyik legszebbje. 1964 óta; 1000 m-es pálya. Kiemelt futamok: Prijs der Giganten, Derby der Vierjarigen, Championnat des Trotteurs Français" },
        { name: "Alkmaar ZEturf Arena", city: "Alkmaar (Észak-Holland)", lat: 52.6212, lng: 4.7325, founded: null, status: "active", length: null, direction: null, org: "Drafbaan Alkmaar", ownSite: null, operatorSite: "https://www.victoriaparkwolvega.nl/", operatorName: "Victoria Park Wolvega", note: "Hollandia második legfontosabb ügetőpályája; kompakt, de élénk hangulatú. MEGJEGYZÉS: a látogatói visszajelzések szerint az utóbbi években csökkent a versenynapok száma" }
    ],
    ESP: [
        { name: "Gran Hipódromo de Andalucía", city: "Dos Hermanas (Sevilla)", lat: 37.31519844, lng: -5.9524855, founded: 2002, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: null, operatorName: null, note: "ANDALÚZIA – nem baleári! 155 hektár, kb. 5000 fő befogadóképesség; a Junta de Andalucía támogatja.. Koordináta forrása: OpenStreetMap (Nominatim) + Wikipédia (es) – Gran Hipódromo de Andalucía. Pálya forrása: FECT / Turismo de Sevilla" },
        { name: "Hipódromo Son Pardo", city: "Palma de Mallorca", lat: 39.5965, lng: 2.6574, founded: null, status: "active", length: null, direction: null, org: "Hipódromo Son Pardo", ownSite: null, operatorSite: "https://www.federaciobaleardetrot.com/", operatorName: "Federació Balear de Trot", note: "Spanyolország vezető ügetőpályája; a Baleár-szigetek ügetőhagyománya egyedülálló az országban. Nyáron jellemzően vasárnaponként, ingyenes belépéssel" },
        { name: "Hipòdrom de Manacor", city: "Manacor (Mallorca)", lat: 39.5787, lng: 3.2169, founded: null, status: "active", length: null, direction: null, org: "Hipòdrom de Manacor", ownSite: null, operatorSite: "https://www.federaciobaleardetrot.com/", operatorName: "Federació Balear de Trot", note: "Mallorca keleti részének pályája; a helyi közösségi élet fontos találkozóhelye, esti versenynapokkal" },
        { name: "Hipòdrom Municipal de Maó", city: "Maó (Menorca)", lat: 39.8628, lng: 4.2567, founded: null, status: "active", length: null, direction: null, org: "Hipòdrom Municipal de Maó", ownSite: null, operatorSite: "https://www.federaciobaleardetrot.com/", operatorName: "Federació Balear de Trot", note: "Menorca fő ügetőpályája; rendszeres vasárnapi versenynapok, minitrote (póni) futamokkal is. Erős helyi közösségi hagyomány, alacsony tétekkel és családbarát hangulattal" },
        { name: "Hipòdrom Torre del Ram", city: "Ciutadella (Menorca)", lat: 40.0112, lng: 3.8022, founded: null, status: "active", length: null, direction: null, org: "Hipòdrom Torre del Ram", ownSite: null, operatorSite: "https://www.federaciobaleardetrot.com/", operatorName: "Federació Balear de Trot", note: "Menorca nyugati végén; vasárnap esti versenynapok (17:30-21:00), belépés kb. 6 euró, gyerekeknek ingyenes. A nézők a pálya körüli falon ülve követik a futamokat. JAVÍTVA (2026-07): korábban tévesen a hipodromsantrafel.com cím szerepelt itt, ami az ibizai Sant Rafel pálya honlapja – törölve, saját honlap forrás nélkül nem vehető fel" }
    ],
    BEL: [
        { name: "Hippodrome de Wallonie", city: "Ghlin (Mons)", lat: 50.4801, lng: 3.9248, founded: 1999, status: "active", length: null, direction: null, org: "Hippodrome de Wallonie / Mons SA", ownSite: "https://hippodromedewallonie.be/", operatorSite: null, operatorName: null, note: "Belgium vezető ügetőpályája és Vallónia egyetlen versenypályája. 1999-ben alapította a Fédération Nationale du Trot és a Vallon Régió. Évi 55 versenynap: 40 ügető (kb. 360 futam) + 15 galopp. Itt versenyzett Bold Eagle, Timoko, Ready Cash és Love You is. Kiemelt futamok: Grand Prix de Wallonie, Grand Prix de la Toussaint. Nemzetközi patkolóiskola és lóversenyszakmai képzőközpont is működik a területén" },
        { name: "Hippodroom Kuurne", city: "Kuurne", lat: 50.8599, lng: 3.2782, founded: null, status: "active", length: null, direction: null, org: "Fédération Belge des Courses Hippiques", ownSite: null, operatorSite: "https://www.trotting.be", operatorName: "Fédération Belge des Courses Hippiques", note: "Flandriai ügetőpálya Kortrijk közelében" },
        { name: "Hippodroom Waregem", city: "Waregem", lat: 50.8853, lng: 3.4416, founded: null, status: "active", length: null, direction: null, org: "Hippodroom Waregem", ownSite: "http://www.hippodroomwaregem.be/", operatorSite: null, operatorName: null, note: "40 000 fős befogadóképesség; a Waregem Koerse (Great Flanders Steeple Chase) helyszíne. Vegyes profil: telivér és ügető egyaránt" },
        { name: "Hippodroom Tongeren (Jeker)", city: "Tongeren", lat: 50.7687, lng: 5.4579, founded: null, status: "active", length: null, direction: null, org: "Fédération Belge des Courses Hippiques", ownSite: null, operatorSite: "https://www.trotting.be", operatorName: "Fédération Belge des Courses Hippiques", note: "Limburg tartomány ügetőpályája, a Jeker folyó mentén" }
    ],
    GBR: [
        { name: "Boughrood", city: "Boughrood", lat: 52.045, lng: -3.2714, founded: null, status: "active", length: null, direction: null, org: "British Harness Racing Club (BHRC)", ownSite: null, operatorSite: null, operatorName: null, note: "Koordináta forrása: Nominatim (irányítószám) + Wikipédia (en) – Boughrood. Pálya forrása: British Harness Racing Club (bhrc.org.uk) versenynaptár, 2026-07" },
        { name: "Eardisley", city: "Eardisley", lat: 52.139, lng: -3.008, founded: null, status: "active", length: null, direction: null, org: "British Harness Racing Club (BHRC)", ownSite: null, operatorSite: null, operatorName: null, note: "Koordináta forrása: Nominatim (irányítószám) + OpenStreetMap (Nominatim) + Wikipédia (en) – Eardisley. Pálya forrása: British Harness Racing Club (bhrc.org.uk) versenynaptár, 2026-07" },
        { name: "Ivington", city: "Ivington", lat: 52.2033, lng: -2.772, founded: null, status: "active", length: null, direction: null, org: "British Harness Racing Club (BHRC)", ownSite: null, operatorSite: null, operatorName: null, note: "Koordináta forrása: Nominatim (irányítószám) + Wikipédia (en) – Ivington. Pálya forrása: British Harness Racing Club (bhrc.org.uk) versenynaptár, 2026-07" },
        { name: "Kilnsey", city: "Kilnsey", lat: 54.10638889, lng: -2.04166667, founded: null, status: "active", length: null, direction: null, org: "British Harness Racing Club (BHRC)", ownSite: null, operatorSite: null, operatorName: null, note: "Koordináta forrása: Nominatim (irányítószám) + Wikipédia (en) – Kilnsey. Pálya forrása: British Harness Racing Club (bhrc.org.uk) versenynaptár, 2026-07" },
        { name: "Lampeter", city: "Lampeter", lat: 52.1202, lng: -4.0821, founded: null, status: "active", length: null, direction: null, org: "British Harness Racing Club (BHRC)", ownSite: null, operatorSite: null, operatorName: null, note: "Koordináta forrása: Nominatim (irányítószám) + Wikipédia (en) – Lampeter. Pálya forrása: British Harness Racing Club (bhrc.org.uk) versenynaptár, 2026-07" },
        { name: "Pikehall", city: "Pikehall", lat: 53.129, lng: -1.715, founded: null, status: "active", length: null, direction: null, org: "British Harness Racing Club (BHRC)", ownSite: null, operatorSite: null, operatorName: null, note: "Koordináta forrása: Nominatim (irányítószám) + Wikipédia (en) – Pikehall. Pálya forrása: British Harness Racing Club (bhrc.org.uk) versenynaptár, 2026-07" },
        { name: "Talgarreg", city: "Talgarreg", lat: 52.134114, lng: -4.300419, founded: null, status: "active", length: null, direction: null, org: "British Harness Racing Club (BHRC)", ownSite: null, operatorSite: null, operatorName: null, note: "Koordináta forrása: Nominatim (irányítószám) + Wikipédia (en) – Talgarreg. Pálya forrása: British Harness Racing Club (bhrc.org.uk) versenynaptár, 2026-07" },
        { name: "Tregaron", city: "Tregaron", lat: 52.21962, lng: -3.93517, founded: null, status: "active", length: null, direction: null, org: "British Harness Racing Club (BHRC)", ownSite: null, operatorSite: null, operatorName: null, note: "Koordináta forrása: Nominatim (irányítószám) + Wikipédia (en) – Tregaron. Pálya forrása: British Harness Racing Club (bhrc.org.uk) versenynaptár, 2026-07" },
        { name: "Wolsingham", city: "Wolsingham", lat: 54.731, lng: -1.882, founded: null, status: "active", length: null, direction: null, org: "British Harness Racing Club (BHRC)", ownSite: null, operatorSite: null, operatorName: null, note: "Koordináta forrása: Nominatim (irányítószám) + Wikipédia (en) – Wolsingham. Pálya forrása: British Harness Racing Club (bhrc.org.uk) versenynaptár, 2026-07" },
        { name: "Wolverhampton Racecourse", city: "Wolverhampton", lat: 52.604, lng: -2.1451, founded: null, status: "active", length: 1006, direction: null, org: "BHRC (vegyes: főleg galopp)", ownSite: null, operatorSite: null, operatorName: null, note: "Öt-nyolcad mérföldes pálya. Elsősorban galopp-pálya, alkalmi ügetőfutamokkal.. Koordináta forrása: Nominatim (irányítószám) + Wikidata Q16903614 + OpenStreetMap (Nominatim). Pálya forrása: British Harness Racing Club (bhrc.org.uk) versenynaptár, 2026-07" },
        { name: "Tir Prince Raceway", city: "Towyn, Wales", lat: 53.3036, lng: -3.5291, founded: null, status: "active", length: null, direction: null, org: "Tir Prince Raceway", ownSite: null, operatorSite: "https://www.trotbritaingb.com/", operatorName: "Trot Britain", note: "Nagy-Britannia legjelentősebb ügetőpályája, Észak-Walesben; piaccal és vidámparkkal egybeépítve, élénk családi hangulattal" },
        { name: "Corbiewood Stadium (Haugh Field)", city: "Bannockburn (Stirling), Skócia", lat: 56.0827, lng: -3.9134, founded: null, status: "active", length: null, direction: null, org: "Corbiewood Stadium", ownSite: null, operatorSite: "https://www.trotbritaingb.com/", operatorName: "Trot Britain", note: "Skócia ügetőpályája; a brit ügetősport egyik történelmi központja. FIGYELEM: a BHRC versenynaptárában \"Haugh Field\" néven szerepel (irányítószám: FK7 0LW) – UGYANAZ A PÁLYA, brit bővítéskor nem szabad külön rekordként felvenni. A BHRC egy közleménye szerint a pálya időszakosan zárva volt; aktuális státusza ellenőrizendő" }
    ],
    IRL: [
        { name: "Portmarnock Raceway", city: "Portmarnock (Dublin)", lat: 53.4256, lng: -6.1316, founded: 1969, status: "active", length: null, direction: null, org: "Irish Harness Racing Association (IHRA)", ownSite: "http://portmarnockraceway.ie/", operatorSite: "https://www.irishharnessracing.com", operatorName: "Irish Harness Racing Association", note: "ELLENŐRZVE (2026): AKTÍV. 1969-ben nyílt, 2004-ben bezárt (a területet lakóparknak adták el, ami a 2008-as válság miatt sosem épült meg), majd 7 év szünet után 2011 júniusában újraindult. Ma évi 20+ versenynap. Létesítmények: klubház, bár, játszótér, bukmékerállások. Kiemelt események: All Ireland Series (Pace és Trot döntők), Vincent Delaney Memorial. FIGYELEM: a koordináta csak településszintű közelítés – a pálya pontos helye még ellenőrizendő" },
        { name: "Annaghmore Raceway", city: "Craigavon, Észak-Írország", lat: 54.4665, lng: -6.6043, founded: null, status: "active", length: null, direction: null, org: "Irish Harness Racing Association (IHRA)", ownSite: null, operatorSite: "https://www.irishharnessracing.com", operatorName: "Irish Harness Racing Association", note: "ÉSZAK-ÍRORSZÁG (Egyesült Királyság) EGYETLEN ÜGETŐPÁLYÁJA, de a sziget egészére kiterjedő IHRA szervezésében versenyez – ezért szerepel az ír listában, nem a britben. A 2026-os IHRA versenynaptár egyik legaktívabb helyszíne (június 27-i versenynap igazolva)" }
    ],
    LTU: [
        { name: "Lazdijai Hippodrome (Bukta)", city: "Bukta, Lazdijai", lat: 54.2419, lng: 23.5270, founded: null, status: "active", length: null, direction: null, org: "Lithuania National Trotting League", ownSite: null, operatorSite: "https://www.ristunusportas.lt", operatorName: "Lithuania National Trotting League", note: "Litvánia fő ügetőpályája és a nemzeti szövetség székhelye. FONTOS: ez cáfolja azt a korábbi feltevést, hogy a Baltikumban nincs ügetősport – Litvánia UET-tagország, 2025-ben 65 futammal, 2 pályán" }
    ],
    MLT: [
        { name: "Ta' Xħajma Racetrack", city: "Xewkija (Gozo)", lat: 36.03778, lng: 14.26667, founded: null, status: "active", length: 1000, direction: null, org: "Gozo Horse Racing Association", ownSite: null, operatorSite: null, operatorName: null, note: "Gozo szigetének egyetlen versenypályája, kb. 1 km hosszú. A Gozo Horse Racing Association kéthetente rendez itt hétvégi versenyeket, valamint különleges eseményeket (Arka Races, Bailey's Heats). A gozói versenyzés a római kocsiversenyre emlékeztet: a hajtó kétkerekű gigen ül. FELVÉVE (2026-07): a máltai ellenőrzés során derült ki, hogy az adatbázisból hiányzott" },
        { name: "Marsa Racetrack (Malta Equidrome)", city: "Marsa", lat: 35.8779, lng: 14.4873, founded: 1868, status: "active", length: null, direction: null, org: "Malta Racing Club", ownSite: "https://www.maltaracingclub.com", operatorSite: null, operatorName: null, note: "Málta egyetlen versenypályája, szinte kizárólag ügetőprofillal: 2025-ben 350 futam, 728 versenyző lóval – kiemelkedően intenzív használat egyetlen pályán. A Malta Racing Club UET-tagszövetség. A klub 1868-ban alakult, a pályát 1981-ben építették újjá 2000 férőhelyes tribünnel. 2019 júliusában a parlament 65 éves koncessziót adott a terület fejlesztésére – azóta a helyszín Malta Equidrome néven is fut, a versenynaptárt a Malta Equidrome állítja össze a Malta Racing Clubbal egyeztetve" }
    ],
    SRB: [
        { name: "Beogradski hipodrom", city: "Belgrád", lat: 44.7857, lng: 20.4253, founded: null, status: "active", length: 1000, direction: "right", org: "Srpski Kasački Savez", ownSite: null, operatorSite: "https://www.serbia-trot.org.rs", operatorName: "Srpski Kasački Savez", surface: "zúzalék", finalStraight: 200, width: 30, trotSince: 1930, note: "Szerbia fő versenypályája, a Careva Ćuprija városrészben. A hipodromot hivatalosan 1914. június 28-án nyitották – éppen a szarajevói merénylet napján –, ezért az első világháború kitörése miatt mindössze EGY NAPIG működött. UKSS műszaki adatok: 1000 m ellipszis, 200 m célegyenes, 30 m széles, fehér kőzúzalék burkolat (2008-ban újranasúlyozva), jobb kézre. FIGYELEM AZ ÉVSZÁMOKRA: a Wikipédia szerint ügetőversenyeket 1930 óta rendeznek itt, a pálya saját közlése szerint viszont a DEDIKÁLT ügetőpálya csak 1952-ben készült el, és az első futamokat azon abban az évben rendezték. A kettő nem zárja ki egymást: 1930-tól valószínűleg a galopp-pályán vagy ideiglenes helyszínen futottak. A trotSince ezért 1930 (a legkorábbi megerősített ügetőverseny), de a pálya építése 1952." },
        { name: "Hipodrom Subotica", city: "Szabadka (Subotica)", lat: 46.0915, lng: 19.6439, founded: null, status: "active", length: 1020, direction: "left", org: "Srpski Kasački Savez", ownSite: null, operatorSite: "https://www.serbia-trot.org.rs", operatorName: "Srpski Kasački Savez", surface: "zúzalék", finalStraight: 180, note: "Vajdasági versenypálya a magyar határ közelében; galopp és ügető futamoknak egyaránt otthont ad. UKSS műszaki adatok: 1020 m, 180 m célegyenes, talaj: zúzalék." }
    ],
    SVN: [
        { name: "Hipodrom Ljutomer", city: "Ljutomer", lat: 46.5216, lng: 16.1886, founded: 1874, status: "active", length: 1000, direction: null, org: "Kasaški klub Ljutomer", ownSite: "https://kasaskiklub-ljutomer.si/", operatorSite: "https://kasaska-zveza.si/", operatorName: "Kasaška zveza Slovenije", note: "A SZLOVÉN ÜGETŐSPORT BÖLCSŐJE. Az első ismert kasaška dirka 1874. szeptember 12-én zajlott a Murska-mezőn, a lukavcei kereszttől a ljutomeri Globetka-hídig; a klub 2024-ben ünnepelte 150 éves fennállását. 1000 m-es pálya, fedett lelátóval 1000 néző számára. Évi 6 versenynap; itt rendezik a Slovenski kasaški derbit és a 3 éves kasačok országos bajnokságát. Saját kis múzeummal" },
        { name: "Hipodrom Stožice", city: "Ljubljana", lat: 46.0856, lng: 14.5253, founded: 1957, status: "active", length: null, direction: null, org: "Kasaški klub Stožice Ljubljana", ownSite: null, operatorSite: "https://kasaska-zveza.si/", operatorName: "Kasaška zveza Slovenije", note: "1957-ben épült. A főváros ügetőpályája, a Sava folyó mellett. Itt rendezik a Ljubljanska milja nemzetközi futamot, a szlovén ügetőnaptár legerősebb versenyét. 2025 augusztusában itt zajlottak az első versenyek a Kasaška zveza Slovenije új szabályzata szerint. A pálya körül disc-golf, íjászat és játszótér is működik" },
        { name: "Hipodrom Kamnica", city: "Kamnica (Maribor)", lat: 46.5726, lng: 15.6238, founded: null, status: "active", length: 800, direction: null, org: "Konjeniški center Hipodrom Kamnica Maribor", ownSite: "https://www.hipodrom-kamnica.si/", operatorSite: "https://kasaska-zveza.si/", operatorName: "Kasaška zveza Slovenije", note: "96 503 m²-es komplexum a Pohorje-hegység panorámájával; a kasaška pálya külső köre 800 m. Nemzetközi ügetőversenyeknek és díjugratásnak egyaránt otthont ad – itt rendezik a Sredozemski pokal (Mediterrán Kupa) futamot. Évekig alacsony aktivitás után újjáéledt: lovasiskola, Jockey's club étterem, gyerekprogramok" },
        { name: "Hipodrom Šentjernej", city: "Šentjernej", lat: 45.8374, lng: 15.3350, founded: null, status: "active", length: null, direction: null, org: "Kasaški klub Šentjernej", ownSite: null, operatorSite: "https://kasaska-zveza.si/", operatorName: "Kasaška zveza Slovenije", note: "Alsó-Krajna (Dolenjska) ügetőpályája; a Šampionat Slovenije egyik visszatérő helyszíne. Egy helyi blog szerint a látogatottság az utóbbi években csökkent" },
        { name: "Hipodrom Brege (Krško)", city: "Leskovec pri Krškem", lat: 45.9152, lng: 15.5042, founded: null, status: "active", length: 1000, direction: null, org: "Konjeniški klub Posavje Krško", ownSite: null, operatorSite: "https://kasaska-zveza.si/", operatorName: "Kasaška zveza Slovenije", note: "Nyári pálya 1000 m-es körrel, kis lelátóval. Évente jellemzően EGYETLEN versenynapot rendez; az év többi részében más rendezvényeknek ad otthont" },
        { name: "Hipodrom Komenda", city: "Komenda", lat: 46.2053, lng: 14.5439, founded: null, status: "active", length: null, direction: null, org: "Konjeniški klub Komenda", ownSite: null, operatorSite: "https://kasaska-zveza.si/", operatorName: "Kasaška zveza Slovenije", note: "Ljubljanától északra; 2025 szeptemberében hét futamot rendezett egyetlen versenynapon, korábbi derbi-győztesekről elnevezett versenyekkel. Mezőgazdasági vásárnak is helyszíne" },
        { name: "Hipodrom Polena", city: "Lenart v Slovenskih goricah", lat: 46.5737, lng: 15.8244, founded: null, status: "active", length: null, direction: null, org: "Kasaško društvo Slovenske gorice Lenart", ownSite: null, operatorSite: "https://kasaska-zveza.si/", operatorName: "Kasaška zveza Slovenije", note: "A ŠRC Polena sportkomplexum része: a kasaška steza mellett futballpálya, strandröplabda, mászófal és kutyafuttató is található. Ingyenes parkolóval" },
        { name: "Hipodrom Ig (Iška vas)", city: "Ig", lat: 45.9405, lng: 14.5101, founded: null, status: "active", length: null, direction: null, org: "Konjerejsko društvo Krim", ownSite: null, operatorSite: "https://kasaska-zveza.si/", operatorName: "Kasaška zveza Slovenije", note: "A Ljubljanai-láp (Ljubljansko barje) déli szélén. FIGYELEM: a fenntartó neve Konjerejsko društvo KRIM – több forrás tévesen \"Konjeniško društvo Ig\" néven említi" }
    ],
    CHE: [
        { name: "Pferderennbahn Schachen Aarau", city: "Aarau", lat: 47.391716, lng: 8.028264, founded: null, status: "active", length: 1200, direction: "left", org: "Aargauischer Rennverein (ARV)", ownSite: "http://www.aarauturf.ch", operatorSite: "https://suisse-trot.ch/", operatorName: "Suisse Trot", note: "Balkezes füves pálya, kb. 1200 m, 350 m célegyenessel, 16-18 m szélességgel, 4%-os kanyardőléssel. Ügetőfutamok szalagos rajttal (Bänderstart), emellett síkfutam, gátfutam, vadászverseny és cross-country. Akadályversenyeiről ismert; a pályán vizesárok és mobil Auteuil-gát is van. Évi kb. 4 versenynap. Cím: Schwimmbadstrasse 18, 5001 Aarau. Forrás: Suisse Trot hivatalos pályajegyzék + horseracing.ch (2026-07)" },
        { name: "Parkrennbahn Zürich-Dielsdorf", city: "Dielsdorf (Zürich)", lat: 47.4889814, lng: 8.4714242, founded: null, status: "active", length: 1400, direction: "left", org: "Rennverein Zürich (RVZ)", ownSite: "http://www.pferderennen-zuerich.ch", operatorSite: "https://suisse-trot.ch/", operatorName: "Suisse Trot", note: "Balkezes füves parkpálya. Nagy pálya kb. 1400 m, kis pálya kb. 1150 m, külön vadászpályával. Ügetőfutamok szalagos és autós rajttal is, emellett síkfutam és vadászverseny. Évi 3-5 versenynap. Fő futama a Grand Prix Jockey Club. Cím: Neeracherstrasse 20, 8157 Dielsdorf. Forrás: Suisse Trot hivatalos pályajegyzék + horseracing.ch (2026-07)" },
        { name: "Hippodrome IENA Avenches", city: "Avenches", lat: 46.8836, lng: 7.0109, founded: null, status: "active", length: null, direction: null, org: "Suisse Trot", ownSite: "https://suisse-trot.ch/", operatorSite: null, operatorName: null, note: "Svájc fő ügetőpályája és a Suisse Trot nemzeti szövetség székhelye. Az IENA (Institut équestre national) területén; póni-ügetőiskolát is működtet gyerekeknek" },
        { name: "Pferderennbahn Frauenfeld", city: "Frauenfeld", lat: 47.5702, lng: 8.9035, founded: null, status: "active", length: null, direction: null, org: "Suisse Trot", ownSite: null, operatorSite: "https://suisse-trot.ch/", operatorName: "Suisse Trot", note: "Német-svájci versenypálya Thurgau kantonban; vegyes profil" }
    ],
    UKR: [
        { name: "Київський іподром", city: "Kijev", lat: 50.3755317, lng: 30.4603905, founded: null, status: "active", length: 1600, direction: null, org: null, ownSite: null, operatorSite: null, operatorName: null, note: "Háború alatt is működik, kb. 300 ló. FIGYELEM: légiriadó esetén a látogatóknak el kell hagyniuk a területet.. Koordináta forrása: Nominatim (postai cím) + OpenStreetMap (Nominatim) + Wikipédia (uk) – Київський іподром. Pálya forrása: KP Kijevi Hippodrom hivatalos közlése" },
    ],
    RUS: [
        { name: "Центральный Московский ипподром", city: "Moszkva", lat: 55.77872, lng: 37.55976, founded: 1834, status: "active", length: null, direction: null, org: null, ownSite: "https://cmh.ru", operatorSite: null, operatorName: "AO Rosippodromy (szövetségi tulajdon)", note: "Az AO \"Rosippodromy\" szövetségi holdinghoz tartozik.. Koordináta forrása: Wikidata Q2382815 + Wikipédia (ru) – Центральный Московский ипподром. Pálya forrása: AO Rosippodromy hivatalos pályajegyzék" },
        { name: "Омский ипподром", city: "Omszk", lat: 54.963536, lng: 73.400495, founded: null, status: "active", length: null, direction: null, org: null, ownSite: null, operatorSite: null, operatorName: "AO Rosippodromy (szövetségi tulajdon)", note: "Az AO \"Rosippodromy\" szövetségi holdinghoz tartozik.. Koordináta forrása: OpenStreetMap (Nominatim) + Wikipédia (ru) – Омский ипподром. Pálya forrása: AO Rosippodromy hivatalos pályajegyzék" },
    ],
};

const countryMeta = {
    SWE: { name: "Sweden", hasGallop: false, hasTrot: true, flag: "🇸🇪", orgSite: "https://www.travsport.se/", orgSiteLabel: "Svensk Travsport" },
    FRA: { name: "France", hasGallop: true,  hasTrot: true, flag: "🇫🇷", orgSite: "https://www.letrot.com/", orgSiteLabel: "LeTrot" },
    ITA: { name: "Italy",  hasGallop: true,  hasTrot: true, flag: "🇮🇹", orgSite: "https://new.trottoweb.com/", orgSiteLabel: "TrottoWeb – versenynaptár", orgSiteAlt: "https://www.politicheagricole.it/", orgSiteAltLabel: "Masaf – hivatalos minisztériumi oldal" },
    FIN: { name: "Finland", hasGallop: false, hasTrot: true, flag: "🇫🇮", orgSite: "https://www.hippos.fi/", orgSiteLabel: "Suomen Hippos ry" },
    NOR: { name: "Norway",  hasGallop: true,  hasTrot: true, flag: "🇳🇴", orgSite: "https://www.travsport.no/", orgSiteLabel: "Det Norske Travselskap (DNT)" },
    POL: { name: "Poland", hasGallop: true, hasTrot: true, flag: "🇵🇱", orgSite: "https://pkwk.org/", orgSiteLabel: "Polski Klub Wyścigów Konnych" },
    CZE: { name: "Czech Republic", hasGallop: true, hasTrot: true, flag: "🇨🇿", orgSite: "http://www.czetra.cz/", orgSiteLabel: "Česká Klusácká Asociace (UET-tag)" },
    SVK: { name: "Slovakia", hasGallop: true, hasTrot: true, flag: "🇸🇰", orgSite: "https://www.harness.sk/", orgSiteLabel: "Trotting Slovakia (nem UET-tag)" },
    HUN: { name: "Hungary", hasGallop: true, hasTrot: true, flag: "🇭🇺", orgSite: "https://kincsempark.hu/", orgSiteLabel: "Kincsem Park" },
    EST: { name: "Estonia", hasGallop: false, hasTrot: true, flag: "🇪🇪", orgSite: "https://www.hipodroom.ee/", orgSiteLabel: "Eesti Traaviliit MTÜ (UET-tag)" },
    USA: { name: "United States", hasGallop: true, hasTrot: true, flag: "🇺🇸", orgSite: "https://www.ustrotting.com/", orgSiteLabel: "USTA (United States Trotting Association)" },
    CAN: { name: "Canada", hasGallop: true, hasTrot: true, flag: "🇨🇦", orgSite: "https://standardbredcanada.ca/", orgSiteLabel: "Standardbred Canada" },
    AUS: { name: "Australia", hasGallop: true, hasTrot: true, flag: "🇦🇺", orgSite: "https://www.harness.org.au/", orgSiteLabel: "Harness Racing Australia" },
    NZL: { name: "New Zealand", hasGallop: true, hasTrot: true, flag: "🇳🇿", orgSite: "https://hrnz.co.nz/", orgSiteLabel: "Harness Racing New Zealand" },
    DNK: { name: "Denmark", hasGallop: true, hasTrot: true, flag: "🇩🇰", orgSite: "https://www.trav.dk/", orgSiteLabel: "Dansk Travsports Centralforbund" },
    DEU: { name: "Germany", hasGallop: true, hasTrot: true, flag: "🇩🇪", orgSite: "https://www.hvtonline.de/", orgSiteLabel: "HVT (Hauptverband für Traberzucht)" },
    AUT: { name: "Austria", hasGallop: true, hasTrot: true, flag: "🇦🇹", orgSite: "https://www.krieau.at/", orgSiteLabel: "Wiener Trabrenn-Verein" },
    NLD: { name: "Netherlands", hasGallop: true, hasTrot: true, flag: "🇳🇱", orgSite: "https://www.victoriaparkwolvega.nl/", orgSiteLabel: "Victoria Park Wolvega (vezető pálya)" },
    ESP: { name: "Spain", hasGallop: true, hasTrot: true, flag: "🇪🇸", orgSite: "https://www.federaciobaleardetrot.com/", orgSiteLabel: "Federació Balear de Trot" },
    BEL: { name: "Belgium", hasGallop: true, hasTrot: true, flag: "🇧🇪", orgSite: "https://www.trotting.be", orgSiteLabel: "Fédération Belge des Courses Hippiques" },
    GBR: { name: "Great Britain", hasGallop: true, hasTrot: true, flag: "🇬🇧", orgSite: "https://www.trotbritaingb.com/", orgSiteLabel: "Trot Britain" },
    IRL: { name: "Ireland", hasGallop: true, hasTrot: true, flag: "🇮🇪", orgSite: "https://www.irishharnessracing.com", orgSiteLabel: "Irish Harness Racing Association" },
    LTU: { name: "Lithuania", hasGallop: false, hasTrot: true, flag: "🇱🇹", orgSite: "https://www.ristunusportas.lt", orgSiteLabel: "Lithuania National Trotting League" },
    MLT: { name: "Malta", hasGallop: false, hasTrot: true, flag: "🇲🇹", orgSite: "https://www.maltaracingclub.com", orgSiteLabel: "Malta Racing Club" },
    SRB: { name: "Serbia", hasGallop: true, hasTrot: true, flag: "🇷🇸", orgSite: "https://www.serbia-trot.org.rs", orgSiteLabel: "Srpski Kasački Savez" },
    SVN: { name: "Slovenia", hasGallop: false, hasTrot: true, flag: "🇸🇮", orgSite: "https://kasaska-zveza.si/", orgSiteLabel: "Kasaška zveza Slovenije" },
    CHE: { name: "Switzerland", hasGallop: true, hasTrot: true, flag: "🇨🇭", orgSite: "https://suisse-trot.ch/", orgSiteLabel: "Suisse Trot" },
    UKR: { name: "Ukraine", hasGallop: true, hasTrot: true, flag: "\u{1F1FA}\u{1F1E6}", orgSite: null, orgSiteLabel: "KP Kijevi Hippodrom" },
    RUS: { name: "Russia", hasGallop: true, hasTrot: true, flag: "\u{1F1F7}\u{1F1FA}", orgSite: "https://rosippodromy.ru/", orgSiteLabel: "AO Rosippodromy (szövetségi pályaholding)" },
};


/* ==========================================================
   2. SZAKASZ – LOGIKA
   ========================================================== */

// A státusz-feliratok itt, a logika ELEJÉN vannak definiálva, hogy
// egy későbbi hiba (pl. a földgömb betöltésénél) ne akadályozza meg
// a menük működését. Korábban ez a lenti sorokban volt, és egy
// földgömb-hiba miatt inicializálatlan maradt.
const STATUS_TEXT = {
    active:   { label: 'Aktív',                        cls: 'st-active' },
    inactive: { label: 'Inaktív / felfüggesztve',      cls: 'st-inactive' },
    unknown:  { label: 'Ismeretlen – ellenőrzendő',    cls: 'st-unknown' },
    closed:   { label: 'Véglegesen bezárt',            cls: 'st-closed' }
};

// ================================================================
// 1) PÁLYA-ADATBÁZIS
// ================================================================
const DATA_ISO_CODES = Object.keys(trackDatabase); // ["SWE", "FRA"]

let currentFilter = 'all';
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

function pickGlobeTexture() {
    return isNightMode ? TEX_NIGHT : TEX_DAY;
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
    .polygonSideColor(() => 'rgba(216, 154, 94, 0.18)')  // konyak = ügető
    .polygonStrokeColor(feat => polygonStroke(feat))
    .polygonCapColor(feat => polygonColor(feat, null))
    .polygonAltitude(POLY_ALT_BASE)
    .polygonLabel(({ properties }) => {
        const iso = resolveIso(properties);
        if (!DATA_ISO_CODES.includes(iso)) return null;
        const meta = countryMeta[iso];
        const count = trackDatabase[iso].length;
        return `
            <div style="background:#0f172a;color:white;padding:8px 12px;border-radius:8px;border:1px solid #334155;">
                <strong>${meta ? meta.name : iso}</strong><br/>
                <span style="color:#D89A5E;font-size:0.85rem;">🏁 ${count} dokumentált versenypálya</span>
            </div>
        `;
    })
    // Az emelkedés/szín változása animálva, hogy ne "pattogjon".
    // 220 ms: érezhetően sima, de nem lomha.
    .polygonsTransitionDuration(220)
    .onPolygonHover(hoverD => {
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
    .onPolygonClick(polygon => {
        const iso = resolveIso(polygon.properties);
        if (!DATA_ISO_CODES.includes(iso)) return;
        goToCountry(iso);
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

    // Rámutatás: finom arany visszajelzés, de CSAK ott, ahol van adat
    // (különben félrevezető lenne, hogy kattinthatónak tűnik)
    if (hasData && feat === hoverD) return 'rgba(125, 211, 252, 0.7)';

    // ÜGETŐ SZŰRŐ AKTÍV: az adatolt országok kék kitöltést kapnak
    if (currentFilter === 'trot') {
        const meta = countryMeta[iso] || {};
        // ÜGETŐ = KONYAK. (Galopp = racing zöld, majd: 'rgba(95, 191, 142, 0.5)')
        if (hasData && meta.hasTrot) return 'rgba(216, 154, 94, 0.5)';
        return 'rgba(0, 0, 0, 0)';   // a többi marad hártya
    }

    // ALAPÁLLAPOT: teljesen átlátszó kitöltés minden országon.
    // A "hártya" hatást a határvonalak adják (lásd polygonStroke).
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

// Csak akkor állítjuk a vezérlést, ha a földgömb tényleg létrejött
if (world && world.controls) {
    world.controls().autoRotate = true;
    world.controls().autoRotateSpeed = 0.4;
    world.controls().enableDamping = true;
    world.controls().dampingFactor = 0.1;
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
function prepareMap(iso) {
    initLeafletIfNeeded();

    const tracks = trackDatabase[iso];
    const meta = countryMeta[iso] || { name: iso };

    markerLayerGroup.clearLayers();
    const bounds = [];
    tracks.forEach(t => {
        const statusClass = t.status || 'active';
        const icon = L.divIcon({ className: '', html: `<div class="track-marker ${statusClass}"></div>`, iconSize: [16, 16] });
        const marker = L.marker([t.lat, t.lng], { icon }).addTo(markerLayerGroup);
        marker.bindPopup(buildPopupHtml(t, meta, iso));
        bounds.push([t.lat, t.lng]);
    });

    // A konténer opacity:0, de a méretei megvannak, ezért a Leaflet
    // helyesen tud méretezni és nézetet illeszteni már most.
    leafletMap.invalidateSize();
    if (bounds.length) {
        // animate: false - a beállítás NE legyen látható mozgás,
        // hiszen a térkép még nem látszik.
        leafletMap.fitBounds(bounds, { padding: [60, 60], maxZoom: 7, animate: false });
    }
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

    const statusLabels = {
        active: "Aktív",
        inactive: "Inaktív / felfüggesztve",
        unknown: "Ismeretlen – ellenőrzés szükséges",
        closed: "Végleg bezárt"
    };
    const status = t.status || "active";
    const statusLabel = statusLabels[status] || "Aktív";

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
        if (!meter) return "nincs adat";
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

    // Haladási irány. A pályát a lovak szemszögéből nézzük:
    //   "left"  = balkéz  = az óramutató járásával ELLENTÉTES (a
    //             nemzetközi ügetősportban ez az elterjedtebb)
    //   "right" = jobbkéz = az óramutató járásával MEGEGYEZŐ
    // Csak ott jelenik meg érték, ahol tényleges forrásunk van;
    // egyébként őszintén "nincs adat".
    const DIRECTION_TEXT = {
        left:  'balkéz (óramutatóval ellentétes)',
        right: 'jobbkéz (óramutató szerinti)'
    };
    const directionText = DIRECTION_TEXT[t.direction] || "nincs adat";

    // Alapítás éve. Ha a pálya korábban épült, mint amikor ügetőversenyt
    // kezdtek ott rendezni, MINDKETTŐT megmutatjuk – különben félrevezető.
    // (Menangle 1914-ben galopp-pályaként nyílt, ügetőpályaként 1953-ban.)
    const foundedText = t.founded
        ? (t.trotSince && t.trotSince !== t.founded
            ? `${t.founded} <span class="popup-sub-inline">(ügetőverseny ${t.trotSince} óta)</span>`
            : String(t.founded))
        : (t.trotSince
            ? `<span class="popup-sub-inline">ügetőverseny ${t.trotSince} óta</span>`
            : "nincs pontos adat");

    // --- Linkek ---
    const linkOf = (url, extra = '') => `<a href="${url}" target="_blank" rel="noopener"${extra}>${url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>`;

    // 1. szint: a pálya saját honlapja
    const ownSiteText = t.ownSite ? linkOf(t.ownSite) : "nincs saját honlap";

    // 2. szint: üzemeltető honlapja (csak ha van ilyen adat)
    const operatorRow = t.operatorSite
        ? `<div class="popup-row"><b>Üzemeltető honlapja:</b> ${linkOf(t.operatorSite)}${t.operatorName ? `<span class="popup-sub">${t.operatorName}</span>` : ''}</div>`
        : '';

    // 3. szint: országos versenyszervezet - mindig megjelenik
    const orgSiteText = meta.orgSite ? linkOf(meta.orgSite) : "nincs adat";

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

    return `
        <div class="popup-card">
            ${imageBlock}
            <div class="popup-head">
                <span class="popup-status ${status}" title="${statusLabel}"></span>
                <span class="popup-status-text">${statusLabel}</span>
                <span class="popup-name">${t.name}</span>
                <span class="popup-flag">${zaszloHtml(orszagKod, meta.flag)}</span>
            </div>
            <div class="popup-body">
                <div class="popup-row"><b>Település:</b> ${t.city}</div>
                <div class="popup-row"><b>Alapítás éve:</b> ${foundedText}</div>
                <div class="popup-row"><b>Pálya hossza:</b> ${lengthText}</div>
                <div class="popup-row"><b>Haladási irány:</b> ${directionText}</div>
                <div class="popup-row"><b>Szervezet:</b> ${t.org || 'nincs adat'}</div>
                <div class="popup-row"><b>Pálya honlapja:</b> ${ownSiteText}</div>
                ${operatorRow}
                <div class="popup-row"><b>${meta.orgSiteLabel || 'Versenyszervezet'}:</b> ${orgSiteText}</div>
                ${altSiteRow}
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
    document.getElementById('instructionBar').style.opacity = '1';
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
    closeAllDropdowns();   // új munkamenet: a menük bezáródnak
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

// Modal bezárása háttérre kattintva
document.getElementById('legalModal').addEventListener('click', (e) => {
    if (e.target.id === 'legalModal') closeLegal();
});

// ================================================================
// 12) LEGÖRDÜLŐ MENÜK (nyelvválasztó + hamburger)
// ================================================================
function toggleDropdown(id) {
    const menu = document.getElementById(id);
    const isOpen = menu.classList.contains('open');
    // Minden más dropdown bezárása, mielőtt megnyitnánk az újat
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
    if (!isOpen) menu.classList.add('open');
}

// A nyitott menü bezárul, ha bárhova MÁSHOVA kattintunk.
// A .dropdown-wrap-on belüli kattintást kihagyjuk, különben a menü
// megnyitása után azonnal be is csukódna (a gomb is a wrap-on belül van).
document.addEventListener('click', (esemeny) => {
    if (esemeny.target.closest('.dropdown-wrap')) return;
    document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
});

// Escape billentyűre is bezárul – billentyűzetről is kezelhető legyen
document.addEventListener('keydown', (esemeny) => {
    if (esemeny.key === 'Escape') {
        document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
    }
});

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

// 1) Mellékattintás
document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-wrap')) closeAllDropdowns();
});

// 2) Escape billentyű - a nyitott panelekre és modalokra is
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeAllDropdowns();
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
    closeAllDropdowns();   // új munkamenet: a menük bezáródnak
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
document.getElementById('infoModal').addEventListener('click', (e) => {
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
          menuTracks: "Pályák", menuAbout: "Rólunk", menuContact: "Kontakt", instruction: "Kapcsold be az Ügető szűrőt a pályákkal rendelkező országok megjelenítéséhez" },
    en: { back: "Back to the globe", legalTitle: "Privacy / Legal", menu: "Menu", lang: "Language",
          menuTracks: "Pályák", menuAbout: "About us", menuContact: "Contact", instruction: "Enable the Trotting filter to reveal countries with racecourse data" },
    de: { back: "Zurück zum Globus", legalTitle: "Datenschutz / Impressum", menu: "Menü", lang: "Sprache",
          menuTracks: "Pályák", menuAbout: "Über uns", menuContact: "Kontakt", instruction: "Aktiviere den Trab-Filter, um Länder mit Rennbahndaten anzuzeigen" },
    fr: { back: "Retour au globe", legalTitle: "Confidentialité / Mentions légales", menu: "Menu", lang: "Langue",
          menuTracks: "Pályák", menuAbout: "À propos", menuContact: "Contact", instruction: "Activez le filtre Trot pour afficher les pays avec des données" },
    sv: { back: "Tillbaka till jordgloben", legalTitle: "Integritet / Juridisk info", menu: "Meny", lang: "Språk",
          menuTracks: "Pályák", menuAbout: "Om oss", menuContact: "Kontakt", instruction: "Aktivera travfiltret för att visa länder med banor" },
    es: { back: "Volver al globo", legalTitle: "Privacidad / Aviso legal", menu: "Menú", lang: "Idioma",
          menuTracks: "Pályák", menuAbout: "Sobre nosotros", menuContact: "Contacto", instruction: "Activa el filtro de trote para mostrar los países con datos" },
    it: { back: "Torna al globo", legalTitle: "Privacy / Note legali", menu: "Menu", lang: "Lingua",
          menuTracks: "Pályák", menuAbout: "Chi siamo", menuContact: "Contatti", instruction: "Attiva il filtro Trotto per mostrare i paesi con dati" },
    ja: { back: "地球儀に戻る", legalTitle: "プライバシー / 法的情報", menu: "メニュー", lang: "言語",
          menuTracks: "Pályák", menuAbout: "私たちについて", menuContact: "お問い合わせ", instruction: "「速歩」フィルターをオンにすると、データのある国が表示されます" },
    zh: { back: "返回地球", legalTitle: "隐私 / 法律信息", menu: "菜单", lang: "语言",
          menuTracks: "Pályák", menuAbout: "关于我们", menuContact: "联系我们", instruction: "开启「快步」筛选以显示有数据的国家" },
    ar: { back: "العودة إلى الكرة الأرضية", legalTitle: "الخصوصية / قانوني", menu: "القائمة", lang: "اللغة",
          menuTracks: "Pályák", menuAbout: "من نحن", menuContact: "اتصل بنا", instruction: "شغّل مرشح الهرولة لعرض الدول التي تتوفر لها بيانات" }
};

function setLanguage(code, btn, isManual = true) {
    const t = translations[code] || translations.hu;

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
    // A gomb felirata az AKTUÁLIS nyelv rövidítése (HU, EN, DE...) –
    // így egy pillantásra látszik, milyen nyelven van az oldal.
    const langBtn = document.getElementById('langBtn');
    if (langBtn) langBtn.textContent = String(code).toUpperCase();

    setText('[data-i18n="menuTracks"]', t.menuTracks);
    setText('[data-i18n="menuAbout"]', t.menuAbout);
    setText('[data-i18n="menuContact"]', t.menuContact);
    setText('#instructionBar', t.instruction);

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

    const isos = Object.keys(trackDatabase).sort((a, b) => {
        const na = (countryMeta[a] && countryMeta[a].name) || a;
        const nb = (countryMeta[b] && countryMeta[b].name) || b;
        return na.localeCompare(nb);
    });

    const html = isos.map(iso => {
        const meta = countryMeta[iso] || { name: iso };
        const tracks = trackDatabase[iso] || [];
        const rows = tracks.map((t, idx) => {
            const st = STATUS_TEXT[t.status || 'active'] || STATUS_TEXT.active;
            return '<button class="tp-track" onclick="jumpToTrack(\'' + iso + '\',' + idx + ')">'
                 + '<span class="tp-tname">' + t.name + '</span>'
                 + '<span class="tp-tmeta">' + t.city + '</span>'
                 + '<span class="tp-status ' + st.cls + '"><span class="tp-dot"></span>' + st.label + '</span>'
                 + '</button>';
        }).join('');
        // Zászló szándékosan nincs - a kérésnek megfelelően csak az országnév
        return '<button class="tp-country" onclick="toggleCountryGroup(this)">'
             + '<span>' + meta.name + '</span>'
             + '<span><span class="tp-count">' + tracks.length + ' pálya</span> <span class="tp-arrow">&#9654;</span></span>'
             + '</button>'
             + '<div class="tp-tracks">' + rows + '</div>';
    }).join('');

    body.innerHTML = html;
}

function toggleCountryGroup(btnEl) {
    const list = btnEl.nextElementSibling;
    const isOpen = list.classList.contains('open');
    // Csak egy ország legyen nyitva egyszerre - átláthatóbb
    document.querySelectorAll('#tracksPanelBody .tp-tracks').forEach(el => el.classList.remove('open'));
    document.querySelectorAll('#tracksPanelBody .tp-country').forEach(el => el.classList.remove('open'));
    if (!isOpen) { list.classList.add('open'); btnEl.classList.add('open'); }
}

function openTracksMenu() {
    try {
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
        buildTracksMenu();   // mindig újraépítjük, hogy friss legyen
        const panel = document.getElementById('tracksPanel');
        if (panel) panel.classList.add('open');
    } catch (err) {
        console.error('[RC360] A Pályák menü megnyitása nem sikerült:', err);
    }
}
function closeTracksMenu() {
    document.getElementById('tracksPanel').classList.remove('open');
}

// Egy konkrét pályára navigál: ha kell, előbb betölti az ország
// térképnézetét, majd rázoomol és megnyitja a felugró adatlapot.
function jumpToTrack(iso, idx) {
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
