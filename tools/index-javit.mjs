#!/usr/bin/env node
/* ============================================================
   index-javit.mjs — EGYSZERI javítás az index.html-en
   ------------------------------------------------------------
   Két blokkot cserél ki:

     1. A hamburger menü gombjait VALÓDI <a href> linkekre.
        Ok: a főoldal a legerősebb oldal, de a keresőrobot csak
        <a href>-et követ. Gombokkal a statikus szekciók "árván"
        lógnak – csak a sitemapből derül ki, hogy léteznek.

     2. A nyelvválasztó zászlóit az SVG-rendszerre.
        Ok: a régi CSS-gradiens szabályok (.flag.h3 stb.) kikerültek
        a styles.css-ből az SVG-re való áttéréskor, így a zászlók
        üresen jelennének meg.

   MIÉRT KÜLÖN SZKRIPT, és miért nem írjuk újra a fájlt:
   az index.html ~100 KB, és nagyrészt base64-kódolt képadat
   (logó, két ló-ikon). Egy teljes újraírásnál a képadat némán
   sérülhetne. Ez a szkript CSAK a két szöveges blokkhoz nyúl,
   a base64-hez hozzá sem ér.

   Használat:
     node tools/index-javit.mjs --proba   megmutatja, mit tenne
     node tools/index-javit.mjs --ir      ténylegesen módosít

   A szkript a futás után törölhető – egyszeri javítás.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.resolve(__dirname, '..', 'index.html');

/* ------------------------------------------------------------
   1. HAMBURGER MENÜ
   ------------------------------------------------------------ */
const MENU_UJ = `<div class="dropdown-menu" id="hamburgerMenu">
<a href="/hu/tracks/" data-szekcio="tracks" data-i18n="menuTracks" onclick="return jumpTracksPanel(event)">Pályák</a>
<a href="/hu/history/" data-szekcio="history" data-i18n="menuHistory" onclick="szekcioMenuZar()">Történelem</a>
<a href="/hu/races/" data-szekcio="races" data-i18n="menuRaces" onclick="szekcioMenuZar()">Versenyek</a>
<a href="/hu/breeding/" data-szekcio="breeding" data-i18n="menuBreeding" onclick="szekcioMenuZar()">Fajtatörténet</a>
<button onclick="openInfo('about')" data-i18n="menuAbout">Rólunk</button>
<button onclick="openInfo('contact')" data-i18n="menuContact">Kontakt</button>
</div>`;

/* ------------------------------------------------------------
   2. NYELVVÁLASZTÓ
   A zászlórajzokat az app.js tölti be (NYELV_ZASZLO + ZASZLO_SVG),
   itt csak a helyüket jelöljük ki.
   ------------------------------------------------------------ */
const NYELVEK = [
    ['en', 'English'], ['de', 'Deutsch'], ['fr', 'Français'],
    ['sv', 'Svenska'], ['es', 'Español'], ['it', 'Italiano'],
    ['ja', '日本語'],  ['zh', '中文'],    ['ar', 'العربية'],
    ['hu', 'Magyar']
];

const LANG_UJ = '<div class="dropdown-menu" id="langMenu">\n' +
    NYELVEK.map(([kod, nev]) =>
        `<button onclick="setLanguage('${kod}', this)">` +
        `<span class="flag" data-lang-flag="${kod}"></span> ${nev}</button>`
    ).join('\n') + '\n</div>';

const FAVICON_LINKEK = `  <link rel="icon" href="/favicon/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16x16.png">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="48x48" href="/favicon/favicon-48x48.png">
  <link rel="icon" type="image/png" sizes="96x96" href="/favicon/favicon-96x96.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/favicon/favicon-192x192.png">
  <link rel="apple-touch-icon" href="/favicon/apple-touch-icon.png">
  <link rel="manifest" href="/favicon/site.webmanifest">
  <meta name="msapplication-TileImage" content="/favicon/mstile-150x150.png">
  <meta name="msapplication-TileColor" content="#1E110B">`;

/* ============================================================ */

function main() {
    const mod = process.argv[2] || '--proba';
    if (!['--proba', '--ir'].includes(mod)) {
        console.error('Használat: node tools/index-javit.mjs --proba | --ir');
        process.exit(1);
    }
    if (!fs.existsSync(INDEX)) {
        console.error(`Nem található: ${INDEX}`);
        process.exit(1);
    }

    let s = fs.readFileSync(INDEX, 'utf8');
    const eredetiHossz = s.length;
    const kesz = [];
    const hibak = [];

    /* --- 1. Menü ---
       NEM pontos szövegre illesztünk, hanem a blokk HATÁRAIRA.
       Oka: a fájlban a behúzás, a sortörések vagy a szóközök
       eltérhetnek attól, amit a GitHub-nézet mutat, és egy pontos
       egyezésre épülő csere ilyenkor némán elbukik. A nyitó tag
       és a lezáró </div> közötti teljes tartalmat cseréljük. */
    if (s.includes('data-szekcio=')) {
        kesz.push('A hamburger menü MÁR javítva van – kihagyva.');
    } else {
        const mKezd = s.indexOf('<div class="dropdown-menu" id="hamburgerMenu">');
        if (mKezd === -1) {
            hibak.push('A hamburger menü blokkja (id="hamburgerMenu") nem található.');
        } else {
            // A blokk vége: az utolsó ismert menüpont utáni </div>.
            const utolso = s.indexOf("openInfo('contact')", mKezd);
            if (utolso === -1) {
                hibak.push(
                    'A hamburger menüben nem található a "Kontakt" bejegyzés.\n' +
                    '      Lehet, hogy a menü időközben átalakult. Ellenőrizd kézzel.'
                );
            } else {
                const mVeg = s.indexOf('</div>', utolso);
                if (mVeg === -1) {
                    hibak.push('A hamburger menü blokkja nincs lezárva.');
                } else {
                    s = s.slice(0, mKezd) + MENU_UJ + s.slice(mVeg + 6);
                    kesz.push('Hamburger menü: gombok → <a href> linkek (+3 új menüpont)');
                }
            }
        }
    }

    /* --- 2. Nyelvválasztó ---
       Itt NEM pontos szövegre illesztünk, hanem a blokk határaira:
       a nyelvi nevek (English, Deutsch…) változatlanok, de a
       zászló-span-ek formája eltérhet. A nyitó és záró tag közötti
       teljes tartalmat cseréljük. */
    const langKezd = s.indexOf('<div class="dropdown-menu" id="langMenu">');
    if (s.includes('data-lang-flag=')) {
        kesz.push('A nyelvválasztó MÁR javítva van – kihagyva.');
    } else if (langKezd !== -1) {
        // A blokk vége: az utolsó nyelvi gomb utáni </div>
        const utolso = s.indexOf("setLanguage('hu'", langKezd);
        if (utolso === -1) {
            hibak.push('A nyelvválasztóban nem található a magyar bejegyzés.');
        } else {
            const langVeg = s.indexOf('</div>', utolso);
            if (langVeg === -1) {
                hibak.push('A nyelvválasztó blokkja nincs lezárva.');
            } else {
                s = s.slice(0, langKezd) + LANG_UJ + s.slice(langVeg + 6);
                kesz.push('Nyelvválasztó: CSS-gradiens zászlók → SVG-helyőrzők');
            }
        }
    } else {
        hibak.push('A nyelvválasztó blokkja (id="langMenu") nem található.');
    }

    /* --- 3. theme-color ---
       A böngésző a státuszsáv (és Androidon a rendszersáv) mögé
       ezt a színt teszi. Enélkül a saját alapértelmezését használja,
       ezért a fejléc FÖLÖTT megtörik a felület: egy idegen színű
       sáv jelenik meg a márkaszín helyett.

       Az érték a fejléc háttere (#1E110B), így a két felület
       egybefolyik – ahogy a jól kivitelezett mobiloldalakon. */
    if (s.includes('name="theme-color"')) {
        kesz.push('A theme-color MÁR be van állítva – kihagyva.');
    } else {
        /* Beszúrási pont: a viewport meta után, ha van; egyébként
           közvetlenül a <head> nyitó tag után. Így akkor is működik,
           ha a fejrész szerkezete később változik. */
        let vpVeg = -1;
        const vp = s.indexOf('<meta name="viewport"');
        if (vp !== -1) {
            vpVeg = s.indexOf('>', vp) + 1;
        } else {
            const head = s.indexOf('<head>');
            if (head !== -1) vpVeg = head + '<head>'.length;
        }
        if (vpVeg === -1) {
            hibak.push('Nem található <head> vagy viewport meta – nincs hova tenni a theme-color-t.');
        } else {
            s = s.slice(0, vpVeg) +
                '\n<meta name="theme-color" content="#1E110B">' +
                s.slice(vpVeg);
            kesz.push('theme-color hozzáadva (#1E110B) – a státuszsáv a fejléc színét kapja');
        }
    }

    /* --- 4. AUTOMATIKUS TELEFONSZÁM-FELISMERÉS KIKAPCSOLÁSA ---
       Az iOS Safari a számsorozatokat magától telefonszámmá
       alakítja, és kék, aláhúzott linket csinál belőlük. Ezért
       jelent meg az Impresszumban az ADÓSZÁM (23845730-2-13)
       kattintható linkként, idegen kék színnel.

       Ez nem CSS-sel javítható – a böngésző a HTML-be szúrja be
       a linket. A format-detection meta kapcsolja ki. */
    if (s.includes('name="format-detection"')) {
        kesz.push('A telefonszám-felismerés MÁR ki van kapcsolva – kihagyva.');
    } else {
        const fd = s.indexOf('<head>');
        if (fd === -1) {
            hibak.push('Nem található <head> – nincs hova tenni a format-detection metát.');
        } else {
            const be = fd + '<head>'.length;
            s = s.slice(0, be) +
                '\n<meta name="format-detection" content="telephone=no">' +
                s.slice(be);
            kesz.push('Automatikus telefonszám-felismerés kikapcsolva (adószám nem lesz link)');
        }
    }

    /* --- 4. FAVICONOK ---
       A favicon nem javítja a rangsorolást, de a TALÁLATI LISTÁBAN
       megjelenik az oldal neve mellett – ettől felismerhetőbb és
       megbízhatóbb a bejegyzés, ami a kattintási arányban számít.

       A Google legalább 48×48 pixeles ikont vár, és azt is
       megköveteli, hogy az ikon crawlolható címen legyen (nem
       tiltja a robots.txt). Ezért adjuk meg a 48-as és a nagyobb
       méreteket is, nem csak a klasszikus 16/32-t. */
    if (s.includes('rel="icon"')) {
        kesz.push('A faviconok MÁR be vannak kötve – kihagyva.');
    } else {
        const fKezd = s.indexOf('<head>');
        if (fKezd === -1) {
            hibak.push('Nem található <head> – nincs hova tenni a faviconokat.');
        } else {
            const be = fKezd + '<head>'.length;
            s = s.slice(0, be) + '\n' + FAVICON_LINKEK + s.slice(be);
            kesz.push('Faviconok bekötve (ico + 5 png + apple-touch + manifest)');
        }
    }

    /* --- 4. Diagnosztikai doboz eltávolítása ---
       A #geoStatus az országhatárok betöltési állapotát mutatta
       fejlesztés közben (mobilon nincs fejlesztői konzol). A hiba
       megoldódott, a doboz viszont az éles felületen is látszik.

       Az app.js MINDEN hivatkozása getElementById + null-ellenőrzés
       (`if (!doboz) return`), ezért az elem eltávolítása nem okoz
       hibát – a hibakezelő kód egyszerűen csendben kihagyja. */
    const gsKezd = s.indexOf('<div id="geoStatus"');
    if (gsKezd === -1) {
        kesz.push('A diagnosztikai doboz MÁR nincs benne – kihagyva.');
    } else {
        const gsVeg = s.indexOf('</div>', gsKezd);
        if (gsVeg === -1) {
            hibak.push('A #geoStatus doboz nincs lezárva.');
        } else {
            s = s.slice(0, gsKezd) + s.slice(gsVeg + 6);
            kesz.push('Diagnosztikai doboz (#geoStatus) eltávolítva');
        }
    }

    /* --- Jelentés --- */
    console.log(`\nindex.html: ${INDEX}`);
    for (const k of kesz) console.log(`  ✓ ${k}`);
    if (hibak.length) {
        console.error(`\nHIBA (${hibak.length}) – NEM írtunk semmit:`);
        for (const h of hibak) console.error(`  ✗ ${h}`);
        process.exit(1);
    }

    /* --- Biztonsági ellenőrzés ---
       A base64 képadatnak ÉRINTETLENÜL kell maradnia. Ha a
       `data:image` előfordulások száma változna, valami elromlott. */
    const eredeti = fs.readFileSync(INDEX, 'utf8');
    const kepEredeti = (eredeti.match(/data:image\/png;base64,/g) || []).length;
    const kepUj = (s.match(/data:image\/png;base64,/g) || []).length;
    if (kepEredeti !== kepUj) {
        console.error(
            `\nBIZTONSÁGI HIBA: a beágyazott képek száma ${kepEredeti} → ${kepUj} ` +
            `változott. NEM írunk.`
        );
        process.exit(1);
    }

    if (mod === '--proba') {
        console.log(`\nPRÓBA mód – semmit nem írtunk ki.`);
        console.log(`Méretváltozás lenne: ${s.length - eredetiHossz} bájt`);
        console.log(`Beágyazott képek: ${kepUj} (változatlan)`);
        console.log('\nAz élesítéshez: node tools/index-javit.mjs --ir');
        return;
    }

    fs.writeFileSync(INDEX, s, 'utf8');
    console.log(`\nKiírva. Méretváltozás: ${s.length - eredetiHossz} bájt`);
    console.log(`Beágyazott képek: ${kepUj} (érintetlen)`);
    console.log('\nA szkript egyszeri javítás – futás után törölhető.');
}

main();
