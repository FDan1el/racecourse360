# Racecourse360 – projektstruktúra

## Négy fájl

```
index.html          Szerkezet + a három beágyazott kép (logó, 2 ikon)
css/styles.css      DIZÁJN – minden megjelenés és méretezés
js/app.js           MOTOR – adat (1. szakasz) + logika (2. szakasz)
robots.txt          Bot-szabályok
```

## Melyik fájlt nyisd meg?

| Mit akarsz módosítani? | Fájl | Hol pontosan |
|---|---|---|
| Pálya adatát, új országot | `js/app.js` | **1. SZAKASZ – ADAT** |
| Térkép, földgömb, menük működése | `js/app.js` | **2. SZAKASZ – LOGIKA** |
| Színek, méretek, mobil elrendezés | `css/styles.css` | – |
| Menüpontok, modalok szövege | `index.html` | – |
| Logó vagy ikon képe | `index.html` | a `<img src="data:image/png;base64,...">` tagek |

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
| `status` | `"active"` / `"inactive"` / `"unknown"` / `"closed"` |
| `founded`, `length` | szám vagy `null` |
| `org` | üzemeltető vagy szervezet neve |
| `ownSite` | a pálya saját honlapja vagy `null` |
| `operatorSite`, `operatorName` | üzemeltetői/szervezeti oldal vagy `null` |
| `note` | történet és megjegyzések |
| `historyVerified: true` | ha ellenőrzött, a "Történet" fül aktívvá válik |

## Státuszok és színek

| Érték | Jelentés | Szín |
|---|---|---|
| `active` | Aktív | zöld |
| `inactive` | Inaktív / felfüggesztve | narancs |
| `unknown` | Ismeretlen – ellenőrzendő | citromsárga |
| `closed` | Véglegesen bezárt | piros |

## Földgömb-textúrák

A bal alsó 🌙/☀️ gomb váltja a nappali és éjszakai módot.

| Mód | Textúra | Forrás |
|---|---|---|
| Nappali | `earth-blue-marble.jpg` | NASA Blue Marble Next Generation |
| Éjszakai | `earth-night.jpg` | NASA Black Marble (városfények) |
| Domborzat | `earth-topology.png` | NASA topográfia (bump-map) |
| Vízmaszk | `earth-water.png` | óceán-csillogás (specular map) |

**Mind NASA-eredetű közkincs (public domain)** – kereskedelmi célra is
szabadon használható. A three-globe CDN-jéről töltődnek be.

Az induló mód a látogató helyi ideje szerint áll be (6:00–18:00 nappali).

## Külső függőségek (CDN)

- **THREE r128** – 3D motor (a vízcsillogáshoz; a globe.gl **előtt** töltődik)
- **Globe.gl** – 3D földgömb
- **Leaflet 1.9.4** – 2D térkép
- **OpenStreetMap** csempék (ODbL, attribúcióval)
- **CookieYes** – cookie-hozzájárulás (a `<head>`-ben, saját azonosítóval)

## Telepítés

Statikus oldal, build nélkül. A teljes szerkezetet fel kell tölteni.

⚠️ **A GitHub feltöltésnél a "Commit directly to the main branch"
opciót válaszd** – ha pull requestet készít, a fájlok külön ágra
kerülnek, és a Cloudflare a régi állapotot szolgálja ki.

Helyi teszteléshez **kell** szerver (a `file://` protokollon a külső
GeoJSON-betöltés CORS-hibára fut):

```bash
python3 -m http.server 8000
# majd: http://localhost:8000
```

## Excel-export

```bash
python3 export_db.py js/app.js racecourse360_adatbazis.xlsx
```

## Adatforrások, jogi megjegyzés

Az adatok nyilvános forrásokból (nemzeti ügetőszövetségek, UET
tagnyilvántartás, hivatalos pályalisták, sajtó) származnak, saját
szerkesztésben, több forrás kereszthivatkozásával. A koordináták
Google Places nyilvános helyadatokból – **kereskedelmi felhasználás
előtt ezt érdemes tisztázni vagy OpenStreetMap/Nominatim alapúra
cserélni**.
