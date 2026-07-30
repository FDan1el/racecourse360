# Racecourse360 – projektstruktúra

## Fájlszerkezet

```
index.html              A HTML-váz: szerkezet, menük, modalok. Logika NINCS benne.
robots.txt              Bot-szabályok (keresők engedve, scraper/AI botok tiltva)

css/
  styles.css            MINDEN megjelenés: elrendezés, színek, mobil
                        breakpointok, ÉS a base64-ként beágyazott képek

js/
  data.js               ADATRÉTEG – csak a pályák és országok adata
  app.js                ALKALMAZÁSLOGIKA – földgömb, térkép, menük, i18n, cookie

export_db.py            A data.js-t Excel-adatbázisba exportálja
```

## A szétválasztás logikája

A lényeg, hogy **egy változtatás egy réteget érintsen**:

| Mit akarsz módosítani? | Melyik fájlt nyisd meg? |
|---|---|
| Pálya adatát javítani, újat felvenni, országot bővíteni | `js/data.js` |
| Térkép, földgömb, menük működése | `js/app.js` |
| Színek, méretek, mobil elrendezés, logó, ikonok | `css/styles.css` |
| Menüpontok, modalok szövege, HTML-szerkezet | `index.html` |

**Fontos szabály**: az `app.js` csak **olvassa** a `trackDatabase` és `countryMeta`
változókat, de nem definiálja őket. Ezért az adat bővítése soha nem tudja
elrontani a logikát, és fordítva.

## Betöltési sorrend

Az `index.html` végén:

```html
<script src="js/data.js"></script>   <!-- ELŐBB: definiálja az adatot -->
<script src="js/app.js"></script>    <!-- UTÁNA: felhasználja -->
```

Ez a sorrend **nem cserélhető fel** – az `app.js` a betöltés pillanatában
már használja az adatot (pl. a földgömb színezésénél).

## Új ország felvétele

Csak a `js/data.js`-ben, két helyen:

1. A `trackDatabase`-be egy új ISO-kulcs a pályák tömbjével:
   ```js
   NOR: [
       { name: "...", city: "...", lat: 0, lng: 0, founded: null,
         status: "active", length: null, org: "...",
         ownSite: null, operatorSite: null, operatorName: null,
         note: "..." }
   ],
   ```
2. A `countryMeta`-ba a hozzá tartozó bejegyzés:
   ```js
   NOR: { name: "Norway", hasGallop: true, hasTrot: true, flag: "🇳🇴",
          orgSite: "https://...", orgSiteLabel: "..." },
   ```

Az `app.js` automatikusan felismeri: megjelenik a földgömbön, a Pályák
menüben és a 2D térképen – kódmódosítás nélkül.

## Státuszok

| Érték | Jelentés | Szín |
|---|---|---|
| `active` | Aktív | zöld |
| `inactive` | Inaktív / felfüggesztve | narancs |
| `unknown` | Ismeretlen – ellenőrzendő | citromsárga |
| `closed` | Véglegesen bezárt | piros |

## Adatlapok: a történet fül

A felugró adatlap "Történet" füle alapból **inaktív**. Ha egy pálya
történeti leírását kézzel ellenőrizted, add hozzá a `historyVerified: true`
mezőt az adott pályához a `data.js`-ben – csak annál az egy pályánál válik
aktívvá a fül.

## Excel-export

```bash
python3 export_db.py js/data.js racecourse360_adatbazis.xlsx
```

Három munkalapot készít: `Palyak` (teljes lista), `Orszagok` (összesítés),
`Hianyzo adatok` (amit még ki kell tölteni).

## Miért base64 a képek?

A logó és az ikonok NEM külön PNG-fájlok, hanem base64-ként vannak
beágyazva a `css/styles.css` végére. Így a teljes projekt **kizárólag
szöveges fájlokból** telepíthető – nem kell bináris képet feltölteni,
minden fájl tartalma másolható-beilleszthető.

Ezért a HTML-ben `<span>` elemek hordozzák a képeket CSS
háttérképként, nem `<img>` tagek. A méretezés az `images.css`-ben
van (a logó képaránya kb. 6,41:1).

## Telepítés

Statikus oldal, build nélkül. A teljes mappát fel kell tölteni – a
Cloudflare Pages a mappaszerkezetet megtartva szolgálja ki.

Helyi teszteléshez **kell** egy egyszerű szerver (a `file://` protokollon
a külső GeoJSON-betöltés CORS-hibára fut):

```bash
python3 -m http.server 8000
# majd: http://localhost:8000
```

## Földgömb-textúrák

A 3D földgömb két üzemmódban működik (a bal alsó 🌙/☀️ gomb váltja):

| Mód | Textúra | Forrás |
|---|---|---|
| Nappali | `earth-blue-marble.jpg` | NASA Blue Marble Next Generation |
| Éjszakai | `earth-night.jpg` | NASA Black Marble / Earth at Night (városfények) |
| Domborzat | `earth-topology.png` | NASA topográfia (bump-map) |
| Vízmaszk | `earth-water.png` | óceán-csillogás (specular map) |

**Licenc: mind NASA-eredetű KÖZKINCS (public domain)** – szabadon
használható kereskedelmi célra is, díj nélkül. Attribúció nem
jogi követelmény, de illendő; a NASA kéri, hogy ne keltsük azt a
látszatot, mintha ők támogatnák a szolgáltatást.

A textúrák a three-globe CDN-jéről töltődnek be, nincs helyi másolat.

Az induló mód a látogató eszközének helyi ideje szerint áll be
(6:00–18:00 között nappali), de kézzel bármikor váltható.

## Külső függőségek (CDN-ről)

- **THREE r128** – 3D motor (a vízcsillogás-effekthez kell, a globe.gl előtt töltődik)
- **Globe.gl** – 3D földgömb
- **Leaflet 1.9.4** – 2D térkép
- **OpenStreetMap** csempék (ODbL licenc, attribúcióval)
- **CookieYes** – cookie-hozzájárulás (a `<head>`-ben, saját azonosítóval)

## Adatforrások és jogi megjegyzés

Az adatok nyilvánosan elérhető forrásokból (nemzeti ügetőszövetségek,
UET tagnyilvántartás, hivatalos pályalisták, sajtó) származnak, saját
szerkesztésben, több forrás kereszthivatkozásával. A koordináták
Google Places nyilvános helyadatokból származnak – **kereskedelmi
felhasználás előtt ezt érdemes tisztázni vagy OpenStreetMap/Nominatim
alapúra cserélni**.
