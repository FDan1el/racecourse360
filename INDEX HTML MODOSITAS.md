# index.html — két rövid módosítás

A „Rólunk / Kontakt" szövegek fordítása **nem** igényel HTML-szerkesztést:
azokat az `app.js` írja be futásidőben, az aktuális nyelven. A meglévő
magyar szöveg a HTML-ben maradhat — betöltéskor felülíródik.

Egyetlen dolgot kell beszúrni:

---

## A „Történelem" menüpont

Keresd meg ezt a részt (a `hamburgerMenu` blokkban):

```html
<div class="dropdown-menu" id="hamburgerMenu">
<button onclick="openTracksMenu()" data-i18n="menuTracks">Pályák</button>
<button onclick="openInfo('about')" data-i18n="menuAbout">Rólunk</button>
<button onclick="openInfo('contact')" data-i18n="menuContact">Kontakt</button>
</div>
```

Szúrd be a „Pályák" sor UTÁN ezt az egy sort:

```html
<button onclick="openHistoryMenu()" data-i18n="menuHistory">Történelem</button>
```

Az eredmény:

```html
<div class="dropdown-menu" id="hamburgerMenu">
<button onclick="openTracksMenu()" data-i18n="menuTracks">Pályák</button>
<button onclick="openHistoryMenu()" data-i18n="menuHistory">Történelem</button>
<button onclick="openInfo('about')" data-i18n="menuAbout">Rólunk</button>
<button onclick="openInfo('contact')" data-i18n="menuContact">Kontakt</button>
</div>
```

---

## Megjegyzés

A menüpont egyelőre 404-re visz, mert a `/history/` oldalak generálása
még nincs befejezve. A menüpont maga viszont már működik és fordítva
jelenik meg mind a tíz nyelven.
