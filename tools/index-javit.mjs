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
