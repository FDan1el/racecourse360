# Szöveges szekciók — Történelem / Versenyek / Fajtatörténet

## URL-szerkezet

```
/{nyelv}/history/                    Történelem – áttekintő
/{nyelv}/history/{orszag}/           országtörténet
/{nyelv}/races/                      Versenyek – áttekintő
/{nyelv}/races/{verseny}/            versenysorozat
/{nyelv}/breeding/                   Fajtatörténet – áttekintő
/{nyelv}/breeding/{lo}/              fajta / meghatározó ló
```

## Hova kerülnek a szövegek

```
tortenelem/{nyelv}/{orszag-slug}.md
versenyek/{nyelv}/{verseny-slug}.md
fajta/{nyelv}/{slug}.md
```

Az országtörténetnél a slug **egyezzen** az `orszagok.json` slugjával
(`hungary`, `france`, `united-states`) — így tudja a generátor
hozzákapcsolni az adatbázis-adatokat.

## Fájlformátum

```markdown
---
cim: A magyar ügetősport története
leiras: Az 1870-es évektől napjainkig – pályák, versenyek, fordulópontok.
forrasok: UET archívum; MLSZ évkönyv 2019
---

## Kezdetek

Szövegtörzs. Használható **félkövér**, *dőlt*, [link](https://pelda.hu).

- felsorolás
- második elem

## Folytatás

További szakaszok.
```

- `cim` — a `<title>` és a `<h1>`. Ha hiányzik, országnál az országnév.
- `leiras` — a meta description. Ha hiányzik, az első bekezdésből képződik.
- `forrasok` — az oldal alján jelenik meg, halványan. Nem kötelező,
  de utólagos visszakereséshez hasznos: ha egy forrásról kiderül,
  hogy megbízhatatlan, tudni fogod, mely cikkeket kell átnézni.

Támogatott Markdown: `##`-`####` címsorok, bekezdés, `- ` felsorolás,
`> ` idézet, `**félkövér**`, `*dőlt*`, `[szöveg](http…)`.

## TELJESSÉGI SZABÁLY

**Egy cikk csak akkor jelenik meg, ha mind a tíz nyelven megvan.**

Ha akár egy nyelv hiányzik, a cikk egyik nyelven sem generálódik, és a
szkript kiírja, mi hiányzik:

```
KIMARADT (breeding/trotteur-francais) – hiányzó nyelv: de, fr, sv, …
```

Ennek oka: a hiányos nyelvi lefedettség rosszabb, mint a hiány. Egy
`hreflang`, ami nem létező oldalra mutat, hibás jelzés a keresőnek — és
a féllábon álló szekció a látogatót is elveszíti.

Így viszont nem kell megvárni az összes cikket az első megjelenéssel:
ami elkészül, az azonnal kimehet, mind a tíz nyelven, teljesen.

## Az adatbázis-kapcsolat

Az **országtörténeti** oldalak automatikusan megkapják a `trackDatabase`
adatait: hány pálya van az országban, mennyi aktív, mikor alapították a
legrégebbit. Ezt nem kell megírni — számolódik, és mindig naprakész.

Ez a szekció valódi hozzáadott értéke: a történet és az adatbázis
összekapcsolása. Egy szövetségi oldal ezt nem tudja, mert csak a saját
országát ismeri.

## Menü

Három külön menüpont az `index.html`-ben, a „Pályák" után:

```html
<button onclick="openHistoryMenu()"  data-i18n="menuHistory">Történelem</button>
<button onclick="openRacesMenu()"    data-i18n="menuRaces">Versenyek</button>
<button onclick="openBreedingMenu()" data-i18n="menuBreeding">Fajtatörténet</button>
```

A feliratokat a JS írja felül nyelvváltáskor.

## Ami még hiányzik

A `css/statikus.css` nem tartalmaz szabályt az új elemekhez:
`.rc-cikkoldal`, `.rc-cikk`, `.rc-adatdoboz`, `.rc-forras`,
`.rc-visszajelzes`. Az oldalak működnek, de a cikkek tipográfiája és
az adatdoboz formázatlan. Ezt még el kell készíteni.
