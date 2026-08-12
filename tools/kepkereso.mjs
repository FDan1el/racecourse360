#!/usr/bin/env node
/**
 * kepkereso.mjs — Racecourse360 képkereső (Wikimedia Commons)
 *
 * MIÉRT ÉPP A COMMONS
 * -------------------
 * Két dolog miatt ez az egyetlen forrás, amit használhatunk:
 *  1) INGYENES ÉS SZABAD LICENC. A racecourse360.com hirdetéseket és
 *     partnerlinkeket futtat, tehát kereskedelmi felhasználás - egy
 *     Google-képtalálat jogilag NEM tehető ki. A Commons képei
 *     CC/PD licencűek, forrásmegjelöléssel jogszerűen közölhetők.
 *  2) GÉPPEL OLVASHATÓ METAADAT. A Commons API visszaadja a szerzőt
 *     és a licencet is, tehát a kötelező attribúció automatikusan,
 *     hibamentesen összeáll - nem kézzel kell másolgatni.
 *
 * AMIT A SZKRIPT NEM TUD
 * ----------------------
 * NEM LÁTJA a képeket. Nem tudja eldönteni, hogy tribün, pályakép,
 * ló-portré vagy egy távoli utcarészlet van rajta. Csak szűrni tud
 * fájlnév/leírás alapján (térkép, címer, logó, alaprajz kiesik).
 *
 * EZÉRT a végeredmény egy HTML-GALÉRIA: minden pályához 1-6 jelölt,
 * egymás mellett, licenccel. Egy görgetéssel átnézhető, és a kiválasztott
 * képek egy kattintással JSON-be másolhatók.
 * A "melyik kép jó" döntés EMBERI - ez szándékos, nem hiányosság.
 *
 * FUTTATÁS
 *   npm install                 (nincs külső függőség, csak Node 18+)
 *   node tools/kepkereso.mjs                 -> FRA, minden pálya
 *   node tools/kepkereso.mjs FRA 40          -> csak az első 40
 *   node tools/kepkereso.mjs SRB
 *
 * KIMENET (soronként frissül, megszakítás esetén sem vész el)
 *   eredmeny/kepek.json      — nyers találatok, gépi feldolgozásra
 *   eredmeny/kepgaléria.html — EZT NYISD MEG böngészőben, itt válogatsz
 */

import fs from 'fs';
import path from 'path';

// --- Beállítások ---
const API = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT = 'racecourse360-kepkereso/1.0 (https://racecourse360.com; info@racecourse360.com)';
const TALALAT_PER_PALYA = 6;
const VARAKOZAS_MS = 400;      // a Commons megengedő, de ne éljünk vissza vele
const kimenetMappa = 'eredmeny';
const APP_JS = 'js/app.js';

/* KIZÁRÓ SZŰRŐK
   Ezek a fájlnevek/leírások SOSEM pályaképek: térképek, címerek,
   logók, alaprajzok, aláírások. Kiszűrésük nélkül a galéria fele
   használhatatlan találat lenne. */
const TILTOTT_MINTAK = [
   /\.svg$/i, /\.pdf$/i, /\.ogv$/i, /\.webm$/i,
   /map|carte|plan|karte|mapa/i,
   /coat[_ ]of[_ ]arms|blason|wappen|escudo/i,
   /logo|logotype|icon|symbol/i,
   /flag|drapeau|flagge/i,
   /signature|seal|stamp|timbre/i,
   /diagram|schema|graph|chart/i,
];

const varj = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ékezet nélküli, kisbetűs alak az összevetéshez. */
function normal(s) {
   return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
}

/** Commons API hívás, egyszerű újrapróbálkozással. */
async function commons(params) {
   const url = new URL(API);
   Object.entries({ format: 'json', formatversion: '2', ...params })
      .forEach(([k, v]) => url.searchParams.set(k, v));

   for (let probalkozas = 0; probalkozas < 3; probalkozas++) {
      try {
         const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
         if (resp.ok) {
            await varj(VARAKOZAS_MS);
            return await resp.json();
         }
      } catch {
         // újrapróbáljuk
      }
      await varj(1500);
   }
   return null;
}

/** Egy keresési kifejezésre visszaadja a Commons képtalálatokat. */
async function keres(kifejezes) {
   const json = await commons({
      action: 'query',
      generator: 'search',
      gsrsearch: kifejezes,
      gsrnamespace: '6',              // 6 = File: névtér
      gsrlimit: String(TALALAT_PER_PALYA * 2),
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|size',
      iiurlwidth: '420',
   });

   const oldalak = json?.query?.pages || [];
   const talalatok = [];

   for (const o of oldalak) {
      const ii = o.imageinfo?.[0];
      if (!ii) continue;

      const cim = o.title.replace(/^File:/, '');
      if (TILTOTT_MINTAK.some((m) => m.test(cim))) continue;
      // A nagyon kicsi képek jellemzően ikonok/bélyegek
      if (ii.width && ii.width < 480) continue;

      const em = ii.extmetadata || {};
      const tisztit = (v) => String(v || '')
         .replace(/<[^>]+>/g, '')
         .replace(/\s+/g, ' ')
         .trim();

      talalatok.push({
         fajl: cim,
         fajlOldal: ii.descriptionurl,
         elonezet: ii.thumburl,
         szelesseg: ii.width,
         magassag: ii.height,
         licenc: tisztit(em.LicenseShortName?.value) || 'ismeretlen',
         szerzo: tisztit(em.Artist?.value) || null,
         leiras: tisztit(em.ImageDescription?.value).slice(0, 160) || null,
      });
   }
   return talalatok;
}

/** A trackDatabase egy országának kiolvasása az app.js-ből. */
function palyakBeolvasasa(iso) {
   const src = fs.readFileSync(APP_JS, 'utf-8');
   const kezd = src.indexOf(`    ${iso}: [`);
   if (kezd === -1) throw new Error(`Nincs "${iso}" ország az app.js-ben.`);
   const utana = src.slice(kezd + 10);
   const kov = utana.search(/^    [A-Z]{3}: \[/m);
   const blokk = kov === -1 ? utana : utana.slice(0, kov);

   const mezo = (r, k) => {
      const m = r.match(new RegExp(`${k}:\\s*"([^"]*)"`));
      return m ? m[1] : null;
   };
   return (blokk.match(/\{[^{}]*\}/g) || []).map((r) => ({
      nev: mezo(r, 'name'),
      varos: mezo(r, 'city'),
      vanKepe: /image:\s*\{/.test(r),
   })).filter((x) => x.nev);
}

/** HTML-galéria: ebben válogat a felhasználó. */
function galeriaKiiras(eredmenyek, iso) {
   const kartyak = eredmenyek.map((e, idx) => {
      if (e.talalatok.length === 0) {
         return `<section class="palya ures">
        <h2>${e.nev} <small>${e.varos || ''}</small></h2>
        <p class="nincs">Nincs használható találat a Commonson.</p>
      </section>`;
      }
      const kepek = e.talalatok.map((t, i) => `
        <figure>
          <label>
            <input type="checkbox" data-palya="${idx}" data-kep="${i}">
            <img src="${t.elonezet}" alt="" loading="lazy">
          </label>
          <figcaption>
            <a href="${t.fajlOldal}" target="_blank" rel="noopener">${t.fajl}</a><br>
            <b>${t.licenc}</b>${t.szerzo ? ` &middot; ${t.szerzo}` : ''}<br>
            <span class="meret">${t.szelesseg}&times;${t.magassag}</span>
            ${t.leiras ? `<span class="leiras">${t.leiras}</span>` : ''}
          </figcaption>
        </figure>`).join('');
      return `<section class="palya">
        <h2>${e.nev} <small>${e.varos || ''}</small></h2>
        <div class="kepek">${kepek}</div>
      </section>`;
   }).join('\n');

   const html = `<!DOCTYPE html>
<html lang="hu"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Racecourse360 – képválogató (${iso})</title>
<style>
 body{background:#1a0f0a;color:#f0e6dd;font:15px/1.5 system-ui,sans-serif;margin:0;padding:16px 16px 120px}
 h1{color:#D89A5E;font-size:1.3rem}
 .sugo{background:#3E2318;border:1px solid #D89A5E55;padding:12px 16px;border-radius:4px;margin-bottom:20px;font-size:0.9rem}
 .palya{border-top:1px solid #D89A5E33;padding:14px 0}
 .palya h2{font-size:1rem;margin:0 0 8px}
 .palya h2 small{color:#c9b8a8;font-weight:400}
 .nincs{color:#a89383;font-size:0.85rem;margin:0}
 .kepek{display:flex;gap:12px;overflow-x:auto;padding-bottom:6px}
 figure{margin:0;flex:0 0 240px;background:#2a1810;border-radius:4px;overflow:hidden}
 figure img{width:100%;height:150px;object-fit:cover;display:block;cursor:pointer}
 figure input{position:absolute;margin:8px;transform:scale(1.5);z-index:2;cursor:pointer}
 figure label{position:relative;display:block}
 input:checked + img{outline:4px solid #22c55e;outline-offset:-4px}
 figcaption{padding:7px 9px;font-size:0.7rem;line-height:1.35;color:#c9b8a8;word-break:break-word}
 figcaption a{color:#D89A5E}
 .meret{color:#7d6b5c}
 .leiras{display:block;margin-top:3px;color:#a89383}
 #sav{position:fixed;left:0;right:0;bottom:0;background:#3E2318;border-top:1px solid #D89A5E;padding:12px 16px;display:flex;gap:12px;align-items:center}
 button{background:#D89A5E;color:#1a0f0a;border:none;padding:10px 18px;border-radius:3px;font-weight:700;cursor:pointer}
 #db{color:#c9b8a8;font-size:0.85rem}
 textarea{position:fixed;left:-9999px}
</style></head><body>
<h1>Racecourse360 – képválogató (${iso})</h1>
<div class="sugo">
 Jelöld be azokat a képeket, amelyek a <b>pályát vagy a tribünt</b> mutatják.
 Ami ló-portré, díjátadó, utcakép vagy nem odavaló, azt hagyd üresen.
 A végén a lenti gombbal másold ki a kijelölést, és küldd vissza a chatbe.
</div>
${kartyak}
<div id="sav">
 <button onclick="masol()">Kijelölés másolása</button>
 <span id="db">0 kép kijelölve</span>
</div>
<textarea id="ta"></textarea>
<script>
const adat = ${JSON.stringify(eredmenyek)};
const frissit = () => {
  document.getElementById('db').textContent =
    document.querySelectorAll('input:checked').length + ' kép kijelölve';
};
document.addEventListener('change', frissit);
function masol(){
  const ki = [];
  document.querySelectorAll('input:checked').forEach(cb => {
    const p = adat[cb.dataset.palya];
    const t = p.talalatok[cb.dataset.kep];
    ki.push({ nev: p.nev, varos: p.varos, fajlOldal: t.fajlOldal,
              licenc: t.licenc, szerzo: t.szerzo });
  });
  const ta = document.getElementById('ta');
  ta.value = JSON.stringify(ki, null, 1);
  ta.select(); document.execCommand('copy');
  alert(ki.length + ' kép kimásolva a vágólapra.');
}
</script>
</body></html>`;
   fs.writeFileSync(path.join(kimenetMappa, 'kepgaleria.html'), html, 'utf-8');
}

// --- Fő program ---
async function main() {
   const iso = (process.argv[2] || 'FRA').toUpperCase();
   const limit = process.argv[3] ? parseInt(process.argv[3], 10) : Infinity;

   const palyak = palyakBeolvasasa(iso).filter((p) => !p.vanKepe).slice(0, limit);
   console.log(`${iso}: ${palyak.length} pálya kép nélkül.\n`);

   if (!fs.existsSync(kimenetMappa)) fs.mkdirSync(kimenetMappa, { recursive: true });

   const eredmenyek = [];
   let i = 0;

   for (const p of palyak) {
      i++;
      process.stdout.write(`[${i}/${palyak.length}] ${p.nev} ... `);

      /* KÉT KERESÉS, csökkenő szigorúsággal.
         Előbb a pálya pontos nevére, aztán a településre + "hippodrome".
         A második azért kell, mert a Commonson sok kép nem a hivatalos
         pályanévvel, hanem a város nevével van feltöltve. */
      const keresesek = [
         `"${p.nev}"`,
         p.varos ? `hippodrome ${p.varos}` : null,
      ].filter(Boolean);

      const latott = new Set();
      const talalatok = [];
      for (const k of keresesek) {
         if (talalatok.length >= TALALAT_PER_PALYA) break;
         for (const t of await keres(k)) {
            if (latott.has(t.fajl)) continue;
            latott.add(t.fajl);
            talalatok.push(t);
            if (talalatok.length >= TALALAT_PER_PALYA) break;
         }
      }

      eredmenyek.push({ nev: p.nev, varos: p.varos, talalatok });
      console.log(`${talalatok.length} találat`);

      // soronkénti mentés: egy megszakadt futás sem vész kárba
      fs.writeFileSync(
         path.join(kimenetMappa, 'kepek.json'),
         JSON.stringify(eredmenyek, null, 1),
         'utf-8'
      );
      galeriaKiiras(eredmenyek, iso);
   }

   const vanTalalat = eredmenyek.filter((e) => e.talalatok.length > 0).length;
   console.log(`\n--- ÖSSZESÍTÉS ---`);
   console.log(`Van jelölt kép:  ${vanTalalat} pálya`);
   console.log(`Nincs találat:   ${eredmenyek.length - vanTalalat} pálya`);
   console.log(`\nNyisd meg: ${kimenetMappa}/kepgaleria.html`);
}

main().catch((h) => { console.error('Váratlan hiba:', h); process.exit(1); });
