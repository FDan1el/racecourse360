# Racecourse360 – projektállapot és átadás

**Frissítve:** 2026-08-08 · **Adatbázis: 393 pálya / 29 ország**
**`app.js` MD5:** `a811ab6fb12a8f4064af5a9a69312dc0` (ezzel ellenőrizhető, hogy a jó fájl van-e nálad — ez a mezőérték a 2026-08-04-es állapotra vonatkozik, a mai `POLY_ALT_CLICK`-módosítás után újraszámolandó)

> **EZT A FÁJLT ÉS AZ `app.js`-T TEDD FEL A PROJEKT TUDÁSBÁZISÁBA**, ne csak
> egy beszélgetésbe. A csevegés kontextusa nem öröklődik az új beszélgetésbe,
> a projekt-fájlokat viszont minden beszélgetés látja.

---

## 1. HOL TARTUNK

| | |
|---|---|
| Pályák | **393** (377 aktív · 12 bezárt · 3 inaktív · 1 ellenőrzendő) |
| Országok | 29 |
| Jelöltlista (`uj_palyak.json`) | 406 tétel, ebből **355 még nincs fent** |

**Legnagyobb országok:** FRA 95 · AUS 42 · FIN 37 · USA 37 · SWE 33 · CAN 29 · ITA 26

**Legnagyobb hátralék a jelöltlistán:** FRA 167 · AUS 78 · RUS 26 · SRB 19 ·
NZL 14 · GBR 13 · FIN 12 · AUT 11 · IRL 11 · PRT 10 · NLD 9 · DEU 9 · USA 5 ·
CAN 4 · CHE 3 · ESP 3 · LVA 3 · BEL 2 · LTU 2 · SVN 1 · UKR 1 · ITA 1 · POL 1 · EST 1

*(A pontos, teljes `uj_palyak.json`-ból számolt darabszámok 2026-08-08-án
frissültek — korábban csak becsült/töredékes adatok voltak.)*

**FONTOS FELFEDEZÉS (2026-08-08):** a jelöltlista FRA és AUS **kivételével**
egyetlen tétele sem tartalmaz koordinátát (`lat`/`lng` mező sehol) — csak
nevet, várost, néha címet vagy irányítószámot. Emiatt egyik sem illeszthető
be közvetlenül, mindegyiknél előbb geokódolás kell (lásd 2. pont, új munkafolyamat).

### Mezőnkénti kitöltöttség (393 pályából)

| Mező | Kitöltve | Hiányzik |
|---|---|---|
| `org` | 75% | 100 |
| `operatorSite` | 62% | 148 |
| `length` | 41% | 230 |
| `founded` | 31% | 271 |
| `direction` | 16% | 332 |
| `finalStraight` / `openStretch` | 7% | 365 |
| `turnRadius` | 4% | 376 |
| `surface`, `width`, `image` | 1% | ~390 |

---

## 2. MUNKAFOLYAMAT-VÁLTÁS (2026-08-08) — EZ AZ AKTUÁLIS TERV

Az adatgyűjtés és -ellenőrzés **három különálló eszközre** oszlik szét.
A `verify.mjs` jelenlegi koordináta- és felfedező-logikáját ki kell vezetni
két új szkriptbe. **Ez felülírja a korábbi, lentebb (2a. pontban) archivált tervet.**

### 1) `verify.mjs` (havi, meglévő szkript — SZŰKÍTETT feladatkör)

- MOSTANTÓL CSAK: meglévő pályák **bezárásának** ellenőrzése + **történeti
  adatok** (alapítás éve, névváltozások, jogelődök) gyűjtése, minél több
  forrásból.
- NEM keres új pályát, NEM geokódol.
- Kivezetendő belőle: `overpassFelfedezes()`, `koordCimAlapjan()`,
  `koordOverpass()`, `koordOverpassTelepules()`, `koordGeoNames()` — ezek
  a #2 és #3 szkriptbe költöznek.

### 2) Koordináta-kereső szkript (eseti futás, pl. `tools/koordinata.mjs`)

- **Bemenet:** Excel/JSON lista, amelyben a pálya neve + a Dániel által
  **MÁR LEELLENŐRZÖTT, konkrét címe** szerepel.
- **Feladat KIZÁRÓLAG:** cím → koordináta geokódolás, **2 független
  forrással megerősítve** (1 km-es tűréssel), a meglévő „soha nem
  tippelünk” szabály szerint.
- NEM keresgél pályát, NEM dönt adatok helyességéről — tisztán geokódoló modul.
- **Munkafolyamat:** Dániel feltölti az Excelt → szkript kiegészíti
  koordinátával → utána kerül be az `app.js`-be / a honlapra.

### 3) Felfedező szkript (időszakos, NEM havi, NEM kell gyorsnak lennie —
   az alaposság fontosabb a sebességnél; pl. `tools/felfedezo.mjs`)

Feladatköre a **meglévő** pályákhoz, minél több forrásból:

- technikai adatok: hossz, célegyenes, kanyarsugár, irány, talaj
- **futásnem**: tisztán ügető / tisztán galopp / **VEGYES HASZNÁLATÚ**
  (hosszú távon fontos mező — pl. Cagnes-Sur-Mer, Musselburgh, Wellington
  Oostende típusú pályák, ahol ügető ÉS galopp futamok is vannak)
- **versenytípus**: **poroszka (pacer)** vs. **ügető (trotter)** — főleg
  USA/Kanada/Ausztrália/Új-Zéland pályáknál releváns
- **ügető lovaglás** (under-saddle / „monté” stílus, szulki nélkül) — főleg
  skandináv/egyes európai hagyományú pályáknál különbözik a hagyományos
  szulkis ügetéstől
- ide tartozik a korábban tervezett **`--sanity` épelméjűség-ellenőrzés**
  is (lásd 2a. pont), mivel ez is a meglévő pályák technikai mezőit
  validálja, nem újakat keres

### Adatszerkezet-bővítés (`app.js`, `trackDatabase`)

Új mezők bevezetése szükséges:

- `futasnem`: `"ügető"` | `"galopp"` | `"vegyes"`
- `stilus`: `"trot"` | `"pace"` | `"monte"` | `"vegyes"`

### Új pályák felkutatása (kandidátumok)

Mostantól **MANUÁLISAN történik** (Dániel végzi) — a szkriptek nem
keresnek önállóan új helyszínt saját kezdeményezésre.

A `uj_palyak.json` listát **Franciaország (FRA) és Ausztrália (AUS)
kivételével** dolgozzuk fel — ez a két ország külön, manuális munkával
halad, mert:
- a hazai jelöltek között nincs koordináta,
- a kis, ismeretlen helyszínek (pl. brit BHRC-pályák) megbízhatóan nem
  találhatók automatikus keresővel — teszt: 9 `places_search` lekérdezésből
  csak **1 egyértelmű, megbízható találat** (Amman Valley Trotting Club),
  a többi vagy nincs találat, vagy **rossz létesítményre** mutat (pl.
  „York Harness Raceway” keresésre a hírneves York Racecourse galopppálya
  jött vissza, más irányítószámmal).

---

### 2a. ARCHÍVUM — a 2026-08-04-es terv (részben felülírva a fentivel)

*Ezt a részt a fenti 2. pont váltja fel, de a `--sanity` logika tartalma
(lásd lent) átkerül a 3-as felfedező szkriptbe, ezért itt hagyjuk
referenciának.*

**`--sanity` – épelméjűség-ellenőrzés, ellenőrzések:**

- Ha két pályánál **azonos a `length` + `finalStraight` + `turnRadius`
  hármas** → gyanús összepárosítás *(ez volt a Carrick ↔ Canberra eset)*
- `turnRadius > length/4` → geometriailag lehetetlen
- `finalStraight > length/2` → lehetetlen
- `2 × finalStraight + 2 × π × turnRadius` ne térjen el 15%-nál jobban a
  `length`-től → ovális pálya alapképlete, önmagában kiszűri a rossz
  párosításokat

**`--munkalista` – célzott kézi begyűjtés támogatása** (a manuális
pályakeresésre való áttéréssel ez már kevésbé releváns, de a technikai
mezők hiánylistájához a 3-as szkriptben még hasznos lehet):

```
Ország | Pálya | Hiányzó mezők | Közvetlen URL
AUS | Busselton | length,finalStraight,coords | harness.org.au/tracks/busselton/
```

### AMIT NEM CSINÁLUNK

A `direction` automatikus kitöltése (pl. „AUS/NZL szinte mind balkezes”).
Pont ez a fajta magabiztos gépi kitöltés vezetett a Cal Expo-hibához.
Maradjon `null`.

---

## 3. ADATSZABÁLYOK

1. **Koordinátát SOHA nem tippelünk.** 2 egyező forrás 1 km-en belül, vagy
   marad a jelöltlistán.
2. **Minimum 2 független forrás** adatpontonként – két Wikidata-alapú találat
   nem megerősítés.
3. **Kivétel:** hivatalos szövetségi adatlap technikai adatai (hossz,
   célegyenes, kanyarsugár, előzősáv) **1 forrásból is elfogadhatók** –
   HRA, USTA, Standardbred Canada, LeTrot. A `note`-ban mindig jelöljük
   a forrást és a dátumot.
4. **A `status` mezőt soha nem gépeljük automatikusan.** A Cal Expo tévesen
   `active` volt egy elavult USTA-jegyzék miatt – valójában 2025.05.02. óta zárva.
5. **Bezárt pályát nem törlünk** (`status: "closed"`), historikus értéke van.

---

## 4. MI KÉSZÜLT EL (hogy ne csináljuk újra)

### Ausztrália – 20 új pálya (2026-08-04)

Bacchus Marsh · Bankstown Paceway · Benalla · Birchip · Blayney · Boort ·
Bridgetown · Broken Hill · Bulli · Burnie · Byford · Canberra (EPIC) ·
Carrick Park · Charlton · Cobram · Collie · Coolamon · Donald · Dubbo · Kellerberrin

**Négy összepárosítási hibát javítottunk** beillesztés közben. A képernyőképek
időbélyeg-sorszáma dönti el, melyik `TRACK DATA` melyik címhez tartozik
(előbb a cím, aztán lefelé görgetve az adat):

| Pálya | Hibás volt | Helyes |
|---|---|---|
| Bulli | 602/85/51 | **738/145/71** (IMG_6522 cím → IMG_6523 adat) |
| Broken Hill | üres | **602/85/51** (IMG_6520 → IMG_6521, PIC NE050349) |
| Carrick Park | 812/173 | **1000/180** (IMG_6536 → IMG_6537) |
| Canberra (EPIC) | üres | **812/173/74** (IMG_6534 → IMG_6535, PIC NG750154) |

Ez feloldotta a „Carrick ↔ Canberra ütközést”: nem sablonhiba volt a
forrásoldalon, hanem a képsorrend csúszott el egy lépéssel.

**Hiányzik még Ausztráliából: Busselton (WA)** – Adelaide St, Busselton WA 6280,
656 m / 100 m célegyenes, előzősáv nincs (IMG_6531–6532). Koordináta nincs meg.

### Korábbi eredmények

- 22 pálya beépítve a 11. koordináta-futásból (AUT 1, USA 4, AUS 4, FRA 12, GBR 1)
- **The Loop** (Winnipeg) – Manitoba első pályája · **Woodstock Connell Park** (NB)
- **Hippodrome de Villereal** (FRA)
- 11 kanadai pálya hossz-adata (Standardbred Canada, mérföld→méter)
- 7 ausztrál pálya technikai adata (Bathurst, Bendigo, Ballarat, Cranbourne,
  Bunbury, Devonport, Cowra) – **ezek KÉSZEK, ne bántsd**
- **Cal Expo → `closed`** (2025.05.02.) + **Big Fresno Fair** felvéve
- **Flamboro Downs koordinátája javítva** – 4,3 km-rel el volt tolva

### Három téves riasztás megjelölve a `note`-ban

A havi ellenőrzés SÚLYOS-ként jelzi őket, de **a mi adatunk a helyes**:

| Pálya | Miért téves |
|---|---|
| Shenandoah Downs (USA) | A szkript a nyugat-virginiai, 1976-ban bezárt azonos nevűhöz párosít |
| Porin ravirata (FIN) | A Wikidata koordinátája hibás (Luvia környékére mutat) |
| Ippodromo della Favorita (ITA) | A Wikidata `P576` elavult – 2021-ben újranyitott |

### Megoldott kódhibák

- **A Pályák menü** azért nem működött, mert az `index.html`-ben a
  `<script src="js/app.js">` **a `#legalModal` div ELŐTT** áll → a
  `getElementById('legalModal').addEventListener(...)` `null`-on hívott metódust
  → top-level `TypeError` → minden alatta lévő `let`/`const` inicializálatlan maradt.
  Javítva: `esemenytKot()` segédfüggvény + `aktualisNyelv` a fájl tetejére víve.
- **A `#tracksPanel`** bezárt állapotban elnyelte a koppintást (z-index 800,
  csak `transform`-mal eltolva) → `pointer-events: none` + `visibility: hidden`.
- **A `wrangler.jsonc` nem tűri a kommenteket** → `[ERROR] ValueExpected`.
- **A régió-színezés (állam/tartomány) el lett vetve** – vizuálisan nem vált be.
  A `region` mező benne maradt az adatban, de sehol nem használjuk.
- **Fejléc keskenyítve**: 64px (asztali) / 56px (álló) / 44px (fekvő), egysoros.

### Elvetett források (megvizsgálva, nem éri meg)

- **finn `hippos.fi`** – nincs központi táblázat, 25 pályából 2-nél van méter-adat
- **német `hvtonline.de`** – versenynaptár, nem műszaki adatlap
- **Casino City (WA-pályák)** – két, 65 km-re lévő városra (Collie, Bridgetown)
  gyakorlatilag azonos hosszúsági fokot adott (~116.1587°). Önálló forrásként
  NE fogadjuk el WA-pályáknál.

### UI-módosítás (2026-08-08)

- `POLY_ALT_CLICK` (kattintáskori kiemelkedés magassága a globuszon):
  `0.075` → **`0.0375`** (a korábbi érték fele, felhasználói kérésre).
  A `POLY_ALT_BASE` (0.008) és `POLY_ALT_HOVER` (0.025) változatlan.

---

## 5. AZ ÚJ BESZÉLGETÉS INDÍTÁSA

**Töltsd fel a PROJEKT tudásbázisába (nem csak a csevegésbe):**
1. `app.js` (393 pálya, a `POLY_ALT_CLICK` javítással)
2. ez a fájl (`ATADAS.md`)

**A csevegésbe, ha az adott feladathoz kell:**
- `uj_palyak.json`, `javaslatok.json` – jelöltlistához (FRA és AUS nélkül
  dolgozzuk fel, lásd 2. pont)
- a Dániel által ellenőrzött cím-lista (Excel) – a koordináta-kereső
  szkripthez
- `verify.mjs` – ha a szkriptet szét kell választani a három új eszközre
- `index.html`, `styles.css` – ha UI-hoz nyúlunk
- képernyőképek – **külön képként**, ZIP-ből nem olvashatók

**Indító üzenet:** „Racecourse360, folytatjuk. Olvasd el az ATADAS.md-t.
Kezdjünk neki a [verify.mjs szétválasztásának / koordináta-szkriptnek /
felfedező szkriptnek] – választd ki, melyikkel."
