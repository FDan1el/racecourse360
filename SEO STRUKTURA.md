# Racecourse360 — SEO struktúra és URL-szerkezet

Státusz: **elfogadott specifikáció** (v2)
Előzmény: az v1 két pontban tévedett — az adatbázis ISO **alpha-3** kódokat
használ (nem alpha-2), és a `length` mindig **méterben** tárolt, tehát a
mérföld származtatott érték.

---

## 1. Rögzített döntések

| # | Döntés |
|---|--------|
| 1 | Az útvonalszegmensek **nem fordulnak le** — stabil, angol alapú slug (`/tracks/france/`), a lokalizáció a nyelvi prefixből és a tartalomból jön |
| 2 | A `slug` **adatmező**, nem futásidőben számított érték; egyszer születik és változatlan |
| 3 | A pályák nevét **soha nem fordítjuk le** — csak írásrendszert váltunk (cirill→latin, kínai→pinyin) ott, ahol muszáj |
| 4 | A **pályaadatok** (mezőnevek, státusz, leírás) viszont teljesen lokalizáltak |
| 5 | A történeti tartalom útvonala: `/history/` |
| 6 | Az országoldalak **csak listák** — nincs beágyazott térkép |
| 7 | Mérföldet használó országokban a hossz mérföldben, utána zárójelben méterben |

---

## 2. URL-szerkezet

```
/                                        interaktív földgömb (változatlan)
/{lang}/                                 nyelvi kezdőlap
/{lang}/tracks/                          országlista
/{lang}/tracks/{country}/                ország: pályalista (csak lista)
/{lang}/tracks/{country}/{track}/        PÁLYA ADATLAP
/{lang}/history/                         történeti áttekintő
/{lang}/history/{country}/               ország történeti oldala
```

Nyelvek: `hu en de fr sv es it ja zh ar`
`hreflang` minden oldalon mind a 10 változatra + `x-default` → `en`.

Példa:
```
/hu/tracks/france/vincennes/
/ja/tracks/france/vincennes/
```

---

## 3. Sémabővítés — `trackDatabase`

Egyetlen új kötelező mező pályánként:

```js
slug: "vincennes"
```

A meglévő `futasnem`, `stilus`, `region` mezők változatlanok. A `region`
**nem kerül** az URL-be (vannak `null` értékek, és a besorolás később
pontosodhat) — szűrésre/csoportosításra használható az országlistán belül.

### Slug-képzés (egyszeri generálás, utána fagyasztva)

1. kisbetűsítés
2. Unicode NFD normalizálás, kombináló ékezetek eldobása
   (`é→e`, `ü→u`, `å→a`, `ø→o`, `ç→c`)
3. külön szabály, amit az NFD nem old meg: `ß→ss`, `æ→ae`, `œ→oe`, `đ→d`, `ł→l`
4. cirill → latin (tudományos átírás), kínai → pinyin ékezet nélkül,
   japán → Hepburn-rōmaji
5. minden nem `[a-z0-9]` karakter → kötőjel, többszörös kötőjel összevonva,
   kezdő/záró kötőjel levágva

**Ütközéskor a generátor hibával leáll**, nem told fel automatikusan `-2`
utótaggal. Az ütközést kézzel oldod fel (jellemzően régióval):

```
/en/tracks/france/laval-mayenne/
/en/tracks/france/laval-isere/
```

Indoklás: az automatikus feloldás azt jelentené, hogy a szkript dönt egy
véglegesen fagyasztott URL-ről — ez ellentmond a „soha ne találgass" elvnek.

---

## 4. `orszagok.json`

Az ISO alpha-3 kód marad a belső kulcs (illeszkedik a `countryMeta`-hoz).
Az URL-slug beszédes angol név.

```json
{
  "FRA": {
    "slug": "france",
    "units": "metric",
    "nev": { "hu": "Franciaország", "en": "France", "de": null, ... }
  }
}
```

- `slug` — az URL országszegmense, **fagyasztott**
- `units` — `"metric"` vagy `"imperial"`, a hosszmegjelenítést vezérli
- `nev` — a 10 nyelvű megjelenítendő név; `null` = még nincs fordítás,
  a generátor ilyenkor az angolra esik vissza (és jelzi a hiányt)

Jelenleg `imperial`: **USA, CAN, GBR, IRL**.
Ausztrália és Új-Zéland szándékosan `metric`.

---

## 5. Hosszmegjelenítés

A `length` **mindig méterben tárolt** — ez a kánon, ezen nem változtatunk.
A mérföld kizárólag megjelenítési réteg.

`units: "metric"` → `1609 m`

`units: "imperial"` → a bevett ügetősport-nevezéktan, utána zárójelben méter:

| méter | megjelenítés |
|-------|--------------|
| 805 | `1/2 mile (805 m)` |
| 1006 | `5/8 mile (1006 m)` |
| 1207 | `3/4 mile (1207 m)` |
| 1408 | `7/8 mile (1408 m)` |
| 1609 | `1 mile (1609 m)` |

**Ez leképezési tábla, nem osztás.** A sportág törtekben beszél
(„fél mérföldes bullring"), és a naiv `m / 1609` csúnya tizedeseket adna.
A táblában nem szereplő értéknél a generátor `X m` formában ír ki és
**figyelmeztet** — így egy új, szokatlan hosszúságú amerikai pálya nem
csúszik át némán rossz felirattal.

---

## 6. Bővíthetőség — ez a lényeg

A cél, hogy egy új pálya felvétele **csak adatfelvétel legyen**, kódmódosítás
nélkül. Ehhez három szabály:

### 6.1 Új pálya meglévő országban
Egyetlen teendő: a rekord felvétele a `trackDatabase`-be, benne a `slug`-gal.
A generátor a következő futáskor legyártja mind a 10 nyelvű oldalt, beteszi
az országlistába és a sitemapbe. **Semmi más nem kell.**

### 6.2 Új ország
1. új kulcs a `countryMeta`-ban (meglévő gyakorlat szerint)
2. új bejegyzés az `orszagok.json`-ban: `slug`, `units`, legalább `hu` + `en` név
3. a pályák felvétele

A generátor **leáll hibával**, ha olyan ISO kód van a `trackDatabase`-ben,
amihez nincs `orszagok.json` bejegyzés. Így nem lehet véletlenül slug nélküli
országot élesíteni.

### 6.3 Új nyelv
Egy helyen kell bővíteni: a `LANGS` tömbben és a fordítási szótárban.
Az URL-szerkezet nem változik (ez a „B" változat haszna), a hiányzó
országnevek automatikusan angolra esnek vissza.

### 6.4 Új mező a pályasémán
A generátor sablonja mezőlista alapján dolgozik, nem hardkódolt sorokból.
Egy új mező megjelenítéséhez a mezőlistát kell bővíteni — a nyilvános/rejtett
besorolás egy helyen dől el.

**Továbbra sem jelenik meg** az adatlapon: `finalStraight`, `width`,
`openStretch`, `turnRadius`, `surface`.

---

## 7. Generátor — `generator.mjs`

Illeszkedik a meglévő háromhoz (`verify.mjs`, `koordinata.mjs`, `felfedezo.mjs`).

Futási sorrend:
1. beolvassa a `trackDatabase`-t és az `orszagok.json`-t
2. **validál** — leáll, ha: hiányzó `slug`, slug-ütközés országon belül,
   ismeretlen ISO kód, ismeretlen mérföldérték imperial országban
3. pályaoldalak generálása (pálya × nyelv)
4. ország- és nyelvi listaoldalak
5. `sitemap.xml` nyelvenként + sitemap index
6. összefoglaló: hány oldal, hány figyelmeztetés, mely fordítások hiányoznak

A validáció **a generálás előtt**, egy lépésben fut le — így vagy minden
kimenet konzisztens, vagy semmi nem generálódik. Fél-kész állapot nem
kerülhet ki.

### Pálya-adatlap tartalma

- `<h1>` — a pálya neve, **eredeti alakjában, fordítás nélkül**
- `title` — `{Pálya} – {Város}, {Ország} | Racecourse360`
- `meta description` — adatokból generált 1–2 mondat, lokalizált
- `canonical`, 10 `hreflang`, `x-default`
- JSON-LD `SportsActivityLocation`: koordináták, cím, alapítási év, státusz
- lokalizált mezőnevek és státuszfeliratok
- hossz a 5. pont szerinti egységben
- link a földgömbre az adott pályára fókuszálva
- link a hivatalos szervezethez

---

## 8. Fejlesztési fázis

Amíg az oldal nem publikus:

- `robots.txt`: `User-agent: *` / `Disallow: /`
- Basic Auth marad a Workerben
- **nincs** sitemap-beküldés a Search Console-ba
- a generátor futhat, az oldalak tesztelhetők — de nem indexelhetők

### Élesítési ellenőrzőlista

1. Basic Auth kivétele a Workerből
2. `robots.txt` → `Allow`, benne a sitemap URL-je
3. Search Console property + sitemap beküldés
4. bent maradt `noindex` meta ellenőrzése
5. trotheritage.com → `/{lang}/history/` 301

---

## 9. Következő lépés

Az `orszagok.json` váza elkészült (29 ország, slug + units + magyar és angol
név). Hiányzik még:

- a 8 további nyelv országnevei (`null` értékek)
- az 521 pálya `slug` mezője — ezt a generátor első futása javasolhatja,
  de a véglegesítés kézi jóváhagyással történjen, mert utána fagyasztott
