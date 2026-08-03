# Racecourse360 – projektstruktúra

> **Fájlnév-megjegyzés:** ez a fájl korábban `READMI.md` néven volt a repóban.
> A GitHub csak a `README.md`-t jeleníti meg automatikusan a repo főoldalán,
> ezért át lett nevezve. A régi `READMI.md` törölhető.

## Projektszerkezet

```
racecourse360/
├── index.html                  Szerkezet + a három beágyazott kép (logó, 2 ikon)
├── robots.txt                  Bot-szabályok
├── worker.js                   Cloudflare Worker: jelszó + belső fájlok elrejtése
├── wrangler.jsonc              Cloudflare deploy-konfiguráció
├── README.md                   Ez a fájl
│
├── css/
│   └── styles.css              DIZÁJN – minden megjelenés és méretezés
├── js/
│   └── app.js                  MOTOR – adat (1. szakasz) + logika (2. szakasz)
│
├── uj_palyak.json              Jelöltlista (406 pálya, még nincs az adatbázisban)
├── javaslatok.json             Javaslatok (POTLAS / UJ_PALYA / UTKOZES)
│
├── tools/
│   └── verify.mjs              Ellenőrző és adatgyűjtő szkript
│
└── .github/workflows/
    ├── havi-ellenorzes.yml     Havi automatikus adatellenőrzés
    └── koordinata-gyujtes.yml  Kézzel indítható koordináta-kampány
```

**Fontos:** az `uj_palyak.json`, a `javaslatok.json` és a `tools/` mappa
**belső munkafájl** – a `worker.js` 404-gyel elrejti őket a nyilvánosság elől.
Részletek lentebb, a *Telepítés* szakaszban.

## Melyik fájlt nyisd meg?

| Mit akarsz módosítani? | Fájl | Hol pontosan |
|---|---|---|
| Pálya adatát, új országot | `js/app.js` | **1. SZAKASZ – ADAT** |
| Térkép, földgömb, menük működése | `js/app.js` | **2. SZAKASZ – LOGIKA** |
| Színek, méretek, mobil elrendezés | `css/styles.css` | – |
| Menüpontok, modalok szövege | `index.html` | – |
| Logó vagy ikon képe | `index.html` | a `<img src="data:image/png;base64,...">` tagek |
| Bot-szabályok | `robots.txt` | – |
| Mi legyen elrejtve a nyilvánosság elől | `worker.js` | `belsoFajl()` függvény |

Az `app.js` két szakasza élesen elválik: a logika csak **olvassa** az
adatot. A szakaszhatárt a `2. SZAKASZ – LOGIKA` fejléc jelöli – adat
módosításánál efölött, működés-változtatásnál ez alatt dolgozz.

## Miért a HTML-ben vannak a képek?

A logó és az ikonok base64-ként az `index.html`-be vannak ágyazva
`<img>` tagként. Két ok:

1. **Nem kell PNG-t feltölteni** – a projekt kizárólag szöveges
   fájlokból telepíthető, minden tartalom másolható-beilleszthető.
2. **Ez a megoldás bizonyítottan működik.** Korábban CSS
   háttérképként próbáltuk (külön `images.css`), de a logók nem
   jelentek meg. Az `<img>` tag rendelkezik saját, belső
   mérettel, ezért a flex-elrendezésű fejlécben nem tud
   összezsugorodni – egy üres `<span>` háttérképpel viszont igen.

A `styles.css` csak a **méretezést** tartalmazza (`.logo-img`,
`.btn-icon`), a képadatot nem – így a dizájn-fájl olvasható méretű marad.

## Új ország felvétele

Az `app.js` **1. szakaszában**, két helyen:

1. A `trackDatabase`-be egy új ISO-kulcs a pályák tömbjével
2. A `countryMeta`-ba a hozzá tartozó bejegyzés

A logika automatikusan felismeri: megjelenik a földgömbön, a Pályák
menüben és a 2D térképen – további kódmódosítás nélkül.

## Egy pálya mezői

| Mező | Jelentés |
|---|---|
| `name`, `city`, `lat`, `lng` | alapadatok (kötelező) |
| `region` | állam/tartomány/régió – lásd lentebb |
| `status` | `"active"` / `"inactive"` / `"unknown"` / `"closed"` |
| `founded`, `length` | szám vagy `null` |
| `trotSince` | ha az ügetőverseny később indult, mint az alapítás |
| `direction` | `"left"` / `"right"` / `null` |
| `surface` | talaj (pl. `"homok"`, `"salak"`) |
| `width`, `finalStraight`, `turnRadius` | méretek méterben |
| `openStretch` | `true` / `false` – van-e előzősáv |
| `org` | üzemeltető vagy szervezet neve |
| `ownSite` | a pálya saját honlapja vagy `null` |
| `operatorSite`, `operatorName` | üzemeltetői/szervezeti oldal vagy `null` |
| `note` | történet, megjegyzések és **forrásmegjelölés** |
| `image` | `{ url, license, attribution, verified }` vagy hiányzik |

### A `region` mező (állam / tartomány / régió)

Azoknál az országoknál, ahol sok pálya van, a pályák `region` mezőt is
kapnak. Ilyenkor a **Pályák menü háromszintűvé válik**:
Ország → Állam/Régió → Pálya. A 2D térképen pedig megjelennek a
régióhatárok, és rájuk kattintva szűrni lehet.

| Ország | Mit tartalmaz a `region` | Darab |
|---|---|---|
| USA | állam rövidítése (`"NY"`, `"CA"`) | 15 |
| CAN | tartomány rövidítése (`"ON"`, `"PE"`) | 10 |
| AUS | állam rövidítése (`"VIC"`, `"NSW"`) | 6 |
| FRA | hivatalos francia régió neve (`"Normandie"`) | 12 |

Ahol nincs `region` mező, ott a régi, lapos Ország → Pálya lista marad –
ez nem hiba, hanem szándékos: kevés pályánál a plusz szint csak zavarna.

## Státuszok és színek

| Érték | Jelentés | Szín |
|---|---|---|
| `active` | Aktív | zöld |
| `inactive` | Inaktív / felfüggesztve | narancs |
| `unknown` | Ismeretlen – ellenőrzendő | citromsárga |
| `closed` | Véglegesen bezárt | piros |

A bezárt pályákat **nem töröljük** az adatbázisból – historikus értékük van
(pl. Freehold Raceway, Cal Expo, Rideau Carleton).

## Az adat megbízhatósági szabálya

> **Minimum 2 független forrás adatpontonként, vagy `null`.**

A „független" itt azt jelenti, hogy a források nem ugyanarra az alapadatbázisra
épülnek. A `verify.mjs` ezt forráscsaládokkal (`szovetseg`, `wikidata`,
`wikipedia`, `osm`, `geonames`, …) kényszeríti ki: két Wikidata-alapú találat
nem számít megerősítésnek.

**Koordinátát soha nem tippelünk.** Ha nincs 2 egyező forrás, a pálya marad a
jelöltlistán (`uj_palyak.json`), amíg elő nem kerül a második forrás.

Kivétel: a **hivatalos szövetségi adatlapokról** származó technikai adatok
(hossz, irány, talaj) egyetlen forrásból is elfogadhatók – pl. USTA, HRA,
Standardbred Canada, LeTrot. Ezt a `note` mezőben mindig jelöljük.

⚠️ **Óvatosan a „hivatalos" forrásokkal is:** a Cal Expo (Sacramento) tévesen
`active`-ként került be, mert az USTA pályajegyzéke elavult volt – a pálya
2025 májusa óta zárva. A státuszt ezért **soha nem gépeljük automatikusan**.

## Földgömb-textúrák

A bal szélen lévő 🌙/☀️ gomb váltja a nappali és éjszakai módot.

| Mód | Textúra | Forrás |
|---|---|---|
| Nappali | `earth-blue-marble.jpg` | NASA Blue Marble Next Generation |
| Éjszakai | `earth-night.jpg` (tartalék: `earth-dark.jpg`) | NASA Black Marble |
| Domborzat | `earth-topology.png` | NASA topográfia (bump-map) |

**Mind NASA-eredetű közkincs (public domain)** – kereskedelmi célra is
szabadon használható. A three-globe CDN-jéről töltődnek be.

Az induló mód a látogató helyi ideje szerint áll be (6:00–18:00 nappali).
Az éjszakai textúrát a kód **teszteli betöltés előtt**, és csak a ténylegesen
elérhetőt használja – így egy hiányzó fájl nem tudja elrontani a földgömböt.

## Külső függőségek (CDN)

- **Globe.gl** – 3D földgömb (verzió nélkül hivatkozva, tartalék: jsDelivr)
- **Leaflet 1.9.4** – 2D térkép (tartalék: jsDelivr)
- **OpenStreetMap** csempék (ODbL, attribúcióval; tartalék: openstreetmap.de)
- **Natural Earth** országhatárok és admin-1 régióhatárok (közkincs, 3 CDN-lánc)
- **CookieYes** – cookie-hozzájárulás (a `<head>`-ben, saját azonosítóval)

Minden külső forrásnak van tartalékútvonala. A `geoStatus` doboz a képernyőn
mutatja, hányadik forrásból sikerült betölteni a határokat.

## Telepítés

Statikus oldal, build nélkül. A teljes szerkezetet fel kell tölteni.

⚠️ **A GitHub feltöltésnél a „Commit directly to the main branch"
opciót válaszd** – ha pull requestet készít, a fájlok külön ágra
kerülnek, és a Cloudflare a régi állapotot szolgálja ki.

### Jelszavas védelem (fejlesztés idejére)

A `worker.js` HTTP Basic Auth-ot tesz az oldal elé, **ha** be van állítva a
`SITE_PASSWORD` secret:

```
Worker → Settings → Variables and Secrets → Add
  Type: Secret     Name: SITE_PASSWORD     Value: <a jelszó>
```

Felhasználónév: `racecourse`. A jelszó **soha nem kerül a repóba**.
Élesítéskor egyszerűen töröld a secretet – ha nincs jelszó, az oldal nyilvános.

### Belső fájlok elrejtése (mindig aktív)

A `wrangler.jsonc` a repo gyökerét publikálja, ezért a `worker.js`
útvonalszűrője 404-gyel elrejti a munkafájlokat:

- `/uj_palyak.json`, `/javaslatok.json`
- `/tools/`, `/.github/`
- minden `.md`, `.mjs`, `.py`, `.yml`, `.jsonc`, `.xlsx` fájl
- rejtett fájlok (`.env`, `.git`, …)

A `data/*.geojson` **szándékosan nincs** blokkolva – az `app.js` tartalék
határforrásként használja.

Új publikálandó fájltípusnál ellenőrizd a `belsoFajl()` tiltólistát,
nehogy véletlenül elrejtse.

### Helyi tesztelés

Kell hozzá szerver (a `file://` protokollon a külső GeoJSON-betöltés
CORS-hibára fut):

```bash
python3 -m http.server 8000
# majd: http://localhost:8000
```

Ez a `worker.js`-t **nem** futtatja – helyben tehát nincs jelszó és nincs
útvonalszűrés sem. A Worker viselkedésének teszteléséhez `wrangler dev` kell.

## Adatellenőrző szkript (`tools/verify.mjs`)

GitHub Actionsből fut (lásd `.github/workflows/`), de helyben is indítható.

| Kapcsoló | Mit csinál |
|---|---|
| *(nincs)* | Linkek és Wikidata-státusz ellenőrzése a meglévő pályákra |
| `--coords` | Koordináták ellenőrzése |
| `--coords --only-new` | Csak a jelöltlista (`uj_palyak.json`) pályáira |
| `--coords --new` | Meglévő + jelölt együtt |
| `--fill` | Hiányzó mezők pótlása (alapítás, hossz, irány, talaj, …) |
| `--fill --new` | Ua., a jelöltekre is |
| `--discover` | Ismeretlen pályák keresése a Wikidatában |
| `--javaslatok` | A `javaslatok.json` feldolgozása |

Országszűrés: a kapcsolók után szóközzel, pl. `node tools/verify.mjs --fill SWE FIN`

**A szkript soha nem írja felül az `app.js`-t.** Kész, beilleszthető
rekordokat generál – a beillesztés emberi döntés. Ez szándékos: egy
magabiztos gépi javítás rosszabb, mint egy bevallott hiány.

## Adatforrások, jogi megjegyzés

Az adatok nyilvános forrásokból (nemzeti ügetőszövetségek, UET
tagnyilvántartás, hivatalos pályalisták, sajtó) származnak, saját
szerkesztésben, több forrás kereszthivatkozásával.

A koordináták **OpenStreetMap/Nominatim, Wikidata, Wikipedia és GeoNames**
forrásokból származnak – mind szabadon felhasználható, kereskedelmi célra is.
A `note` mező pályánként megjelöli, melyik forrásokból lett megerősítve.

A `robots.txt` tiltja az AI-tréning és scraper botokat, a Felhasználási
feltételek pedig az adatbázis lényeges részének kimásolását. Ezek jogi és
jelzésértékű védelmek; a technikai védelmet a `worker.js` útvonalszűrője és a
Cloudflare bot-szabályai adják.

## Üzemeltető

Candidus Solution Kft. · 2040 Budaörs, Domb utca 14. · Adószám: 23845730-2-13
info@racecourse360.com · privacy@racecourse360.com
