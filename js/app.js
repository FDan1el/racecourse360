/* ==========================================================
   Racecourse360 – ALKALMAZÁSLOGIKA
   ==========================================================
   3D földgömb (Globe.gl), 2D térkép (Leaflet), menük,
   nyelvváltás, cookie-kezelés, adatlapok.

   Az adatok a js/data.js-ben vannak, azt ez a fájl csak
   OLVASSA (trackDatabase, countryMeta) – ezért az adatok
   módosítása nem érinti ezt a fájlt, és viszont.

   FONTOS: a data.js-t az index.html ELŐBB tölti be,
   mint ezt a fájlt – a sorrend nem cserélhető fel.
   ========================================================== */

// ================================================================
// 1) PÁLYA-ADATBÁZIS
// ================================================================
const DATA_ISO_CODES = Object.keys(trackDatabase); // ["SWE", "FRA"]

let currentFilter = 'all';
let currentIso = null;

// ================================================================
// 2) ORSZÁG-AZONOSÍTÁS JAVÍTVA
// A Natural Earth 110m GeoJSON-ban Franciaországnál (és néhány más
// országnál) az ISO_A3 mező hibásan "-99" lehet a helyes "FRA" helyett
// (ismert, dokumentált adathiba a tengerentúli megyék miatt). Ezért
// az ADM0_A3 mezőt is megnézzük tartalék azonosítóként.
// ================================================================
function resolveIso(properties) {
    if (properties.ISO_A3 && properties.ISO_A3 !== '-99') return properties.ISO_A3;
    if (properties.ADM0_A3 && properties.ADM0_A3 !== '-99') return properties.ADM0_A3;
    return properties.ISO_A3; // ha semmi nem jó, marad az eredeti (lehet "-99")
}

// ================================================================
// 3) 3D FÖLDGÖMB
// ================================================================

// A látogató saját eszközének helyi ideje alapján döntjük el, hogy
// nappali (világos) vagy éjszakai (sötét) Föld-textúrát mutatunk.
// 6:00-18:00 között nappali, egyébként éjszakai textúra.
// ==========================================================
// FÖLDGÖMB TEXTÚRÁK
// Mind NASA-eredetű, KÖZKINCS (public domain) kép, a
// three-globe CDN-jéről – ingyenes, attribúció nem kötelező,
// de illendő (lásd README).
//
//   earth-blue-marble.jpg  NASA Blue Marble Next Generation –
//                          valósághű, "Google Earth"-szerű nappali kép
//   earth-night.jpg        NASA Black Marble / Earth at Night –
//                          a városok fényei éjszaka
//   earth-topology.png     domborzati bump-map: a hegyek plasztikusak
//   earth-water.png        vízmaszk: az óceán csillog, a szárazföld nem
// ==========================================================
const TEX_BASE  = 'https://unpkg.com/three-globe/example/img/';
const TEX_DAY   = TEX_BASE + 'earth-blue-marble.jpg';
const TEX_NIGHT = TEX_BASE + 'earth-night.jpg';
const TEX_BUMP  = TEX_BASE + 'earth-topology.png';
const TEX_WATER = TEX_BASE + 'earth-water.png';

function pickGlobeTexture() {
    const hour = new Date().getHours();
    const isDaytime = hour >= 6 && hour < 18;
    return isDaytime ? TEX_DAY : TEX_NIGHT;
}

const world = Globe()
    (document.getElementById('globeViz'))
    .globeImageUrl(pickGlobeTexture())
    .bumpImageUrl(TEX_BUMP)
    .backgroundImageUrl(TEX_BASE + 'night-sky.png')
    .lineHoverPrecision(0)
    .polygonSideColor(() => 'rgba(15, 23, 42, 0.5)')
    .polygonStrokeColor(() => '#1e293b')
    .polygonCapColor(feat => polygonColor(feat, null))
    .polygonAltitude(0.01)
    .polygonLabel(({ properties }) => {
        const iso = resolveIso(properties);
        if (!DATA_ISO_CODES.includes(iso)) return null;
        const meta = countryMeta[iso];
        const count = trackDatabase[iso].length;
        return `
            <div style="background:#0f172a;color:white;padding:8px 12px;border-radius:8px;border:1px solid #334155;">
                <strong>${meta ? meta.name : iso}</strong><br/>
                <span style="color:#f59e0b;font-size:0.85rem;">🏁 ${count} dokumentált versenypálya</span>
            </div>
        `;
    })
    .onPolygonHover(hoverD => {
        world.polygonAltitude(d => {
            const iso = resolveIso(d.properties);
            if (!DATA_ISO_CODES.includes(iso)) return 0.01;
            return d === hoverD ? 0.06 : 0.01;
        });
        world.polygonCapColor(d => polygonColor(d, hoverD));
    })
    .onPolygonClick(polygon => {
        const iso = resolveIso(polygon.properties);
        if (!DATA_ISO_CODES.includes(iso)) return;
        goToCountry(iso);
    });

function polygonColor(feat, hoverD) {
    const iso = resolveIso(feat.properties);
    if (!DATA_ISO_CODES.includes(iso)) return 'rgba(30, 41, 59, 0.25)';

    if (feat === hoverD) return '#f59e0b';

    const meta = countryMeta[iso] || {};

    // Csak az "Ügető" szűrőnek van tényleges színe - erre van megbízható
    // adatunk. A "Galopp" szűrő egyelőre inaktív (nincs hozzá megbízható
    // ország-szintű adatunk), ezért nem kap piros színt.
    if (currentFilter === 'trot') return meta.hasTrot ? 'rgba(56, 189, 248, 0.55)' : 'rgba(30, 41, 59, 0.25)';

    // Alapállapot: teljesen átlátszó, amíg nincs aktív szűrő kiválasztva -
    // így a saját adatbázisunkban szereplő országok "élénken" látszanak
    // (a globe eredeti textúrája átüt), megkülönböztetve az adat nélküli,
    // szürkére tompított országoktól, de nincs félrevezető szín-jelzés.
    return 'rgba(255, 255, 255, 0)';
}

fetch('https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson')
    .then(res => res.json())
    .then(countries => world.polygonsData(countries.features))
    .catch(err => console.error('Országhatár GeoJSON betöltési hiba:', err));

// ================================================================
// 4) VEZÉRLÉS - EGYSZERŰ, JÓL BEVÁLT BEÁLLÍTÁSOK
// Szándékosan nincs egyedi eseménykezelő-trükk (pl. auto-forgás
// leállítása kattintásra) - ez a szabványos three.js OrbitControls
// autoRotate + enableDamping kombináció, ami magától is helyesen
// kezeli a felhasználói húzást/nagyítást auto-forgás mellett.
// ================================================================
world.controls().autoRotate = true;
world.controls().autoRotateSpeed = 0.4;
world.controls().enableDamping = true;
world.controls().dampingFactor = 0.1;

// ================================================================
// 4b) KÉPERNYŐ-FORGATÁS / ÁTMÉRETEZÉS KEZELÉSE
// Enélkül a Globe.gl vászna (canvas) a régi, elforgatás előtti
// méretben ragad be, és a képernyő fele feketén marad. Ezt javítja:
// a földgömb ÉS a Leaflet térkép is újra méretezi magát, amikor a
// böngésző ablakmérete vagy a telefon tájolása megváltozik.
// ================================================================
function handleViewportResize() {
    world.width(window.innerWidth).height(window.innerHeight);
    if (leafletMap) {
        // Kis késleltetés kell, mert mobilon a forgás után egy röpke
        // pillanatig még a régi méretet jelenti be a böngésző
        setTimeout(() => leafletMap.invalidateSize(), 200);
    }
}
window.addEventListener('resize', handleViewportResize);
window.addEventListener('orientationchange', () => {
    // A tájolásváltás eseménye néha a méretváltozás ELŐTT tüzel el,
    // ezért egy röpke késleltetéssel újra lefuttatjuk
    setTimeout(handleViewportResize, 300);
});

// ================================================================
// 5) ORSZÁG KÖZÉPPONT SZÁMÍTÁSA A SAJÁT ADATAINKBÓL
// ================================================================
function getCountryCenter(iso) {
    const tracks = trackDatabase[iso];
    const avgLat = tracks.reduce((s, t) => s + t.lat, 0) / tracks.length;
    const avgLng = tracks.reduce((s, t) => s + t.lng, 0) / tracks.length;
    return { lat: avgLat, lng: avgLng };
}

// ================================================================
// 6) ÁTVÁLTÁS 3D FÖLDGÖMBRŐL 2D TÉRKÉPRE
// ================================================================
function goToCountry(iso) {
    currentIso = iso;
    const center = getCountryCenter(iso);

    document.getElementById('filterContainer').classList.add('disabled');
    document.getElementById('instructionBar').style.opacity = '0';

    world.pointOfView({ lat: center.lat, lng: center.lng, altitude: 0.35 }, 1600);

    setTimeout(() => showMap(iso), 1600);
}

// ================================================================
// 7) 2D LEAFLET TÉRKÉP
// ================================================================
let leafletMap = null;
let currentTileLayer = null;
let labelsLayer = null;
const markerLayerGroup = L.layerGroup();

// TÉRKÉP-CSEMPÉK - kizárólag szabadon, kereskedelmi célra is használható
// források, megfelelő attribúcióval:
//  - OpenStreetMap standard: ODbL licenc, attribúcióval kereskedelmi célra is szabad
//  - OpenTopoMap: OSM adat + SRTM domborzat, CC-BY-SA, szintén szabad
// (A korábbi Esri World Imagery műholdréteg eltávolítva: az ArcGIS Online
//  felhasználási feltételei kereskedelmi használatnál külön tisztázást igényelnek.)
const TILE_STREET = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR_STREET = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function initLeafletIfNeeded() {
    if (leafletMap) return;
    leafletMap = L.map('mapViz', { zoomControl: false, attributionControl: true }).setView([50, 10], 5);
    L.control.zoom({ position: 'bottomleft' }).addTo(leafletMap);
    markerLayerGroup.addTo(leafletMap);
    setBaseLayer('street');
}

// Egyetlen alapréteg: OpenStreetMap (ODbL, kereskedelmi célra is szabad).
// A domborzati váltó eltávolítva - nem adott érdemi információt.
function setBaseLayer() {
    initLeafletIfNeeded();
    if (currentTileLayer) leafletMap.removeLayer(currentTileLayer);
    currentTileLayer = L.tileLayer(TILE_STREET, { attribution: ATTR_STREET, maxZoom: 19 }).addTo(leafletMap);
}

function showMap(iso) {
    initLeafletIfNeeded();

    const tracks = trackDatabase[iso];
    const meta = countryMeta[iso] || { name: iso };

    document.getElementById('globeLayer').classList.add('hidden');
    document.getElementById('mapLayer').classList.add('visible');
    document.getElementById('backBtn').classList.add('visible');

    markerLayerGroup.clearLayers();
    const bounds = [];
    tracks.forEach((t, idx) => {
        const statusClass = t.status || 'active';
        const icon = L.divIcon({ className: '', html: `<div class="track-marker ${statusClass}"></div>`, iconSize: [16, 16] });
        const marker = L.marker([t.lat, t.lng], { icon }).addTo(markerLayerGroup);
        marker.bindPopup(buildPopupHtml(t, meta));
        bounds.push([t.lat, t.lng]);
    });

    setTimeout(() => {
        leafletMap.invalidateSize();
        // Zoom-korlát: egy pályás (vagy nagyon közeli pályákat tartalmazó)
        // országnál a fitBounds extrém közelre nagyítana. A maxZoom
        // biztosítja, hogy az alap nézet hasonló léptékű legyen, mint
        // egy több pályás országnál - a látogató látja a környezetet is.
        leafletMap.fitBounds(bounds, { padding: [60, 60], maxZoom: 7 });
    }, 100);
}

// Egy pálya felugró adatlapjának felépítése: két fül -
// "Általános" (zászló, alapítás, hossz, szervezet, honlap) és
// "Történet és érdekességek" (a note mező szövege)
function buildPopupHtml(t, meta) {
    // ================================================================
    // ADATLAP
    // 1. fül ("Általános"): teljes adattal, a hármas link-struktúrával
    // 2. fül ("Történet"): SZÁNDÉKOSAN INAKTÍV - a történeti leírások
    //    kézi visszaellenőrzése folyamatban van. Ha egy pálya történetét
    //    ellenőrizted, vedd fel az adott sorhoz a "historyVerified: true"
    //    mezőt, és a fül automatikusan aktívvá válik.
    // ================================================================

    const statusLabels = {
        active: "Aktív",
        inactive: "Inaktív / felfüggesztve",
        unknown: "Ismeretlen – ellenőrzés szükséges",
        closed: "Végleg bezárt"
    };
    const status = t.status || "active";
    const statusLabel = statusLabels[status] || "Aktív";

    const lengthText = t.length ? `${t.length} m` : "nincs adat";
    const foundedText = t.founded ? t.founded : "nincs pontos adat";

    // 1. szint: a pálya saját honlapja
    const ownSiteText = t.ownSite
        ? `<a href="${t.ownSite}" target="_blank" rel="noopener">${t.ownSite.replace(/^https?:\/\//, '')}</a>`
        : "nincs saját honlap";

    // 2. szint: üzemeltető honlapja (csak ha van ilyen adat)
    const operatorRow = t.operatorSite
        ? `<div class="popup-row"><b>Üzemeltető honlapja:</b> <a href="${t.operatorSite}" target="_blank" rel="noopener">${t.operatorSite.replace(/^https?:\/\//, '')}</a>${t.operatorName ? ` <span style="color:#64748b;font-size:0.72rem;">(${t.operatorName})</span>` : ''}</div>`
        : '';

    // 3. szint: országos versenyszervezet - mindig megjelenik
    const orgSiteText = meta.orgSite
        ? `<a href="${meta.orgSite}" target="_blank" rel="noopener">${meta.orgSite.replace(/^https?:\/\//, '')}</a>`
        : "nincs adat";

    const altSiteRow = meta.orgSiteAlt
        ? `<div class="popup-row" style="font-size:0.72rem;color:#64748b;"><b>${meta.orgSiteAltLabel || 'Egyéb hivatalos link'}:</b> <a href="${meta.orgSiteAlt}" target="_blank" rel="noopener" style="color:#64748b;">${meta.orgSiteAlt.replace(/^https?:\/\//, '')}</a></div>`
        : '';

    // Történet-fül: csak akkor kattintható, ha a történet ellenőrzött
    const histReady = !!t.historyVerified;
    const histBtn = histReady
        ? `<button class="popup-tab-btn" onclick="switchPopupTab(this, 'history')">Történet</button>`
        : `<button class="popup-tab-btn disabled" title="A történeti leírás ellenőrzése folyamatban van">Történet</button>`;
    const histContent = histReady
        ? `<div class="popup-row">${t.note}</div>`
        : `<div class="popup-row" style="color:#94a3b8;font-size:0.78rem;">A pálya történeti leírásának ellenőrzése folyamatban van.</div>`;

    return `
        <div class="popup-card">
            <span class="popup-status ${status}" title="${statusLabel}"></span>
            <span class="popup-flag">${meta.flag || ''}</span>
            <div class="popup-title">${t.name}</div>
            <div class="popup-tabs">
                <button class="popup-tab-btn active" onclick="switchPopupTab(this, 'general')">Általános</button>
                ${histBtn}
            </div>
            <div class="popup-tab-content active" data-tab="general">
                <div class="popup-row"><b>Státusz:</b> ${statusLabel}</div>
                <div class="popup-row"><b>Település:</b> ${t.city}</div>
                <div class="popup-row"><b>Alapítás éve:</b> ${foundedText}</div>
                <div class="popup-row"><b>Pálya hossza:</b> ${lengthText}</div>
                <div class="popup-row"><b>Szervezet:</b> ${t.org}</div>
                <div class="popup-row"><b>Pálya honlapja:</b> ${ownSiteText}</div>
                ${operatorRow}
                <div class="popup-row"><b>${meta.orgSiteLabel || 'Versenyszervezet'}:</b> ${orgSiteText}</div>
                ${altSiteRow}
            </div>
            <div class="popup-tab-content" data-tab="history">
                ${histContent}
            </div>
        </div>
    `;
}

function switchPopupTab(btnEl, tabName) {
    if (btnEl.classList.contains('disabled')) return; // inaktív fül: nincs teendő
    const card = btnEl.closest('.popup-card');
    card.querySelectorAll('.popup-tab-btn').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
    card.querySelectorAll('.popup-tab-content').forEach(c => {
        c.classList.toggle('active', c.dataset.tab === tabName);
    });
}

function focusTrack(idx) {
    const t = trackDatabase[currentIso][idx];
    leafletMap.setView([t.lat, t.lng], 11, { animate: true });
    markerLayerGroup.eachLayer(m => {
        const ll = m.getLatLng();
        if (Math.abs(ll.lat - t.lat) < 0.0001 && Math.abs(ll.lng - t.lng) < 0.0001) {
            m.openPopup();
        }
    });
}

// ================================================================
// 8) SZŰRŐ
// ================================================================
function setFilter(type, btn) {
    // A "Galopp" szűrő egyelőre inaktív - nincs hozzá megbízható,
    // ország-szintű adatunk, ezért a gomb jelenleg nem csinál semmit.
    if (type === 'gallop') return;

    // Kapcsoló (toggle) viselkedés: ha ugyanarra az already aktív gombra
    // kattintasz, visszaáll az alapállapotra (mindkét szakág, saját színén)
    if (currentFilter === type) {
        currentFilter = 'all';
        btn.classList.remove('active');
    } else {
        currentFilter = type;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    world.polygonsData(world.polygonsData());
}

// ================================================================
// 9) VISSZA A FÖLDGÖMBHÖZ
// ================================================================
function resetToGlobe() {
    currentIso = null;

    document.getElementById('mapLayer').classList.remove('visible');
    document.getElementById('globeLayer').classList.remove('hidden');
    document.getElementById('backBtn').classList.remove('visible');
    document.getElementById('filterContainer').classList.remove('disabled');
    document.getElementById('instructionBar').style.opacity = '1';

    world.pointOfView({ lat: 20, lng: 0, altitude: 2.2 }, 1400);
}

// ================================================================
// 10) COOKIE-CONSENT KEZELÉS
// A döntést localStorage-ben tároljuk (ez a szokásos, elvárt módszer
// cookie-hozzájárulás perzisztálására - ez a fájl a saját szerveren
// fut majd, nem a Claude előnézetben).
// ================================================================

// KAPCSOLÓ: ha beállítottad a CookieYes-t (lásd a <head>-ben lévő
// utasítást), állítsd ezt true-ra - ekkor a saját, egyszerű bannerünk
// automatikusan nem jelenik meg, mert a CookieYes saját, TCF-kompatibilis
// bannere veszi át a szerepét. Amíg false, a saját bannerünk fut
// (jó a Booking-affiliate jelzésre, de ÖNMAGÁBAN NEM elég AdSense-hez).
const USE_COOKIEYES = true;

const COOKIE_CONSENT_KEY = 'rc360_cookie_consent'; // értéke: "accepted" | "rejected"

function initCookieBanner() {
    if (USE_COOKIEYES) return; // a CookieYes saját bannere kezeli ezt

    let stored = null;
    try { stored = localStorage.getItem(COOKIE_CONSENT_KEY); } catch (e) { /* localStorage nem elérhető */ }

    if (!stored) {
        document.getElementById('cookieBanner').classList.add('visible');
    } else if (stored === 'accepted') {
        loadAdsAndAffiliateScripts();
    }
    // ha "rejected": nem csinálunk semmit, a hirdetési/affiliate scriptek nem töltődnek be
}

function setCookieConsent(accepted) {
    try { localStorage.setItem(COOKIE_CONSENT_KEY, accepted ? 'accepted' : 'rejected'); } catch (e) { /* nem elérhető */ }
    document.getElementById('cookieBanner').classList.remove('visible');
    if (accepted) loadAdsAndAffiliateScripts();
}

// A GDPR megköveteli, hogy a hozzájárulás visszavonása/módosítása
// ugyanolyan könnyű legyen, mint a megadása - ez a gomb bármikor,
// bárhonnan (lábléc, jogi modal) újra megnyitja a döntési sávot.
function reopenCookieBanner() {
    closeLegal();
    if (USE_COOKIEYES) {
        // A CookieYes saját "Cookie Settings" felülete nyílik meg,
        // ha a CookieYes widget be van állítva (window.cookieyes API)
        if (window.cookieyes) { window.cookieyes.showSettings(); }
        return;
    }
    document.getElementById('cookieBanner').classList.add('visible');
}

// Ide kell majd behelyettesíteni a tényleges hirdetési/affiliate scripteket
// (pl. Google AdSense, Booking.com affiliate pixel). Ez a függvény
// KIZÁRÓLAG akkor fut le, ha a látogató elfogadta a sütiket - eddig a
// pontig szándékosan üres/placeholder.
function loadAdsAndAffiliateScripts() {
    console.log('[RC360] Hirdetési/affiliate hozzájárulás megadva - ide kerülnek majd a valós script-betöltések.');
    // Példa (kikommentezve, cseréld a saját azonosítóidra):
    // const s = document.createElement('script');
    // s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXX';
    // s.async = true;
    // document.head.appendChild(s);
}

// ================================================================
// 11) JOGI MODAL (Adatvédelem / Impresszum)
// ================================================================
function openLegal(tab) {
    document.getElementById('legalModal').classList.add('visible');
    switchLegalTab(tab || 'privacy');
}

function closeLegal() {
    document.getElementById('legalModal').classList.remove('visible');
}

function switchLegalTab(tab) {
    document.getElementById('legalTabPrivacy').classList.toggle('active', tab === 'privacy');
    document.getElementById('legalTabImpresszum').classList.toggle('active', tab === 'impresszum');
    document.getElementById('legalTabTerms').classList.toggle('active', tab === 'terms');
    document.querySelectorAll('.legal-tab-content').forEach(el => {
        el.classList.toggle('active', el.dataset.legal === tab);
    });
}

// Modal bezárása háttérre kattintva
document.getElementById('legalModal').addEventListener('click', (e) => {
    if (e.target.id === 'legalModal') closeLegal();
});

// ================================================================
// 12) LEGÖRDÜLŐ MENÜK (nyelvválasztó + hamburger)
// ================================================================
function toggleDropdown(id) {
    const menu = document.getElementById(id);
    const isOpen = menu.classList.contains('open');
    // Minden más dropdown bezárása, mielőtt megnyitnánk az újat
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
    if (!isOpen) menu.classList.add('open');
}

// Kattintás máshova -> minden dropdown bezáródik
document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-wrap')) {
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
    }
});

// ================================================================
// 13) RÓLUNK / KONTAKT MODAL
// ================================================================
function openInfo(tab) {
    document.getElementById('infoModal').classList.add('visible');
    switchInfoTab(tab || 'about');
}
function closeInfo() {
    document.getElementById('infoModal').classList.remove('visible');
}
function switchInfoTab(tab) {
    document.getElementById('infoTabAbout').classList.toggle('active', tab === 'about');
    document.getElementById('infoTabContact').classList.toggle('active', tab === 'contact');
    document.querySelectorAll('.legal-tab-content[data-info]').forEach(el => {
        el.classList.toggle('active', el.dataset.info === tab);
    });
}
document.getElementById('infoModal').addEventListener('click', (e) => {
    if (e.target.id === 'infoModal') closeInfo();
});

// ================================================================
// 14) NYELVVÁLASZTÁS
// Fontos, őszinte korlát: ez a felhasználói felület kulcs-elemeit
// (gombok, feliratok) fordítja le, NEM a pálya-adatbázis részletes
// leírásait (100+ pálya jegyzete) - az egy külön, nagy volumenű
// fordítási feladat lenne.
// ================================================================
const translations = {
    hu: { back: "Vissza a földgömbhöz", legalTitle: "Adatvédelem / Impresszum", menu: "Menü", lang: "Nyelv / Language",
          menuTracks: "Pályák", menuAbout: "Rólunk", menuContact: "Kontakt", instruction: "💡 Válassz egy színezett országot a versenypályák megtekintéséhez!" },
    en: { back: "Back to the globe", legalTitle: "Privacy / Legal", menu: "Menu", lang: "Language",
          menuTracks: "Pályák", menuAbout: "About us", menuContact: "Contact", instruction: "💡 Select a colored country to view its racecourses!" },
    de: { back: "Zurück zum Globus", legalTitle: "Datenschutz / Impressum", menu: "Menü", lang: "Sprache",
          menuTracks: "Pályák", menuAbout: "Über uns", menuContact: "Kontakt", instruction: "💡 Wähle ein farbiges Land, um die Rennbahnen zu sehen!" },
    fr: { back: "Retour au globe", legalTitle: "Confidentialité / Mentions légales", menu: "Menu", lang: "Langue",
          menuTracks: "Pályák", menuAbout: "À propos", menuContact: "Contact", instruction: "💡 Choisissez un pays coloré pour voir ses hippodromes !" },
    sv: { back: "Tillbaka till jordgloben", legalTitle: "Integritet / Juridisk info", menu: "Meny", lang: "Språk",
          menuTracks: "Pályák", menuAbout: "Om oss", menuContact: "Kontakt", instruction: "💡 Välj ett färgat land för att se dess travbanor!" },
    es: { back: "Volver al globo", legalTitle: "Privacidad / Aviso legal", menu: "Menú", lang: "Idioma",
          menuTracks: "Pályák", menuAbout: "Sobre nosotros", menuContact: "Contacto", instruction: "💡 ¡Selecciona un país coloreado para ver sus hipódromos!" },
    it: { back: "Torna al globo", legalTitle: "Privacy / Note legali", menu: "Menu", lang: "Lingua",
          menuTracks: "Pályák", menuAbout: "Chi siamo", menuContact: "Contatti", instruction: "💡 Seleziona un paese colorato per vedere i suoi ippodromi!" },
    ja: { back: "地球儀に戻る", legalTitle: "プライバシー / 法的情報", menu: "メニュー", lang: "言語",
          menuTracks: "Pályák", menuAbout: "私たちについて", menuContact: "お問い合わせ", instruction: "💡 色付きの国を選んで競馬場を見てみましょう！" },
    zh: { back: "返回地球", legalTitle: "隐私 / 法律信息", menu: "菜单", lang: "语言",
          menuTracks: "Pályák", menuAbout: "关于我们", menuContact: "联系我们", instruction: "💡 选择一个彩色国家查看其赛马场！" },
    ar: { back: "العودة إلى الكرة الأرضية", legalTitle: "الخصوصية / قانوني", menu: "القائمة", lang: "اللغة",
          menuTracks: "Pályák", menuAbout: "من نحن", menuContact: "اتصل بنا", instruction: "💡 اختر دولة ملونة لعرض مضامير السباق فيها!" }
};

function setLanguage(code, btn, isManual = true) {
    const t = translations[code] || translations.hu;

    document.querySelector('#backBtn .full-text').textContent = t.back;
    document.getElementById('legalInfoBtn').title = t.legalTitle;
    document.getElementById('hamburgerBtn').title = t.menu;
    document.getElementById('langBtn').title = t.lang;
    const tracksBtn = document.querySelector('[data-i18n="menuTracks"]');
    if (tracksBtn && t.menuTracks) tracksBtn.textContent = '🏁 ' + t.menuTracks;
    document.querySelector('[data-i18n="menuAbout"]').textContent = t.menuAbout;
    document.querySelector('[data-i18n="menuContact"]').textContent = t.menuContact;
    document.getElementById('instructionBar').textContent = t.instruction;

    // Arab nyelvnél jobbról-balra irányítás a fejléc jobb oldali csoportjára
    document.documentElement.dir = (code === 'ar') ? 'rtl' : 'ltr';

    document.querySelectorAll('#langMenu button').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));

    // Ha a látogató KÉZZEL választott nyelvet, azt eltároljuk, hogy a
    // következő látogatáskor ezt tiszteletben tartsuk, és NE írja felül
    // az automatikus országfelismerés.
    if (isManual) {
        try { localStorage.setItem('rc360_lang_manual', code); } catch (e) { /* nem elérhető */ }
    }
}

// ================================================================
// 15) AUTOMATIKUS ORSZÁG-FELISMERÉS ÉS NYELVVÁLASZTÁS
// Ingyenes, kulcs nélküli IP-geolokációs szolgáltatással (ipwho.is)
// megállapítjuk, melyik országból érkezik a látogató, és ez alapján
// automatikusan beállítjuk a felület nyelvét - kivéve, ha korábban
// már kézzel választott nyelvet (azt mindig tiszteletben tartjuk).
// ================================================================
const COUNTRY_TO_LANG = {
    HU: 'hu', GB: 'en', US: 'en', IE: 'en', AU: 'en', CA: 'en',
    DE: 'de', AT: 'de', CH: 'de',
    FR: 'fr', BE: 'fr',
    SE: 'sv',
    ES: 'es', MX: 'es', AR: 'es',
    IT: 'it',
    JP: 'ja',
    CN: 'zh', TW: 'zh', HK: 'zh',
    SA: 'ar', AE: 'ar', EG: 'ar', QA: 'ar'
};

async function detectAndSetLanguage() {
    let manual = null;
    try { manual = localStorage.getItem('rc360_lang_manual'); } catch (e) { /* nem elérhető */ }

    if (manual) {
        // A látogató korábban már kézzel választott nyelvet - azt használjuk,
        // nem írjuk felül automatikus felismeréssel.
        setLanguage(manual, null, false);
        return;
    }

    try {
        const res = await fetch('https://ipwho.is/');
        const data = await res.json();
        if (data && data.success !== false && data.country_code) {
            const langCode = COUNTRY_TO_LANG[data.country_code] || 'en';
            setLanguage(langCode, null, false);
        }
    } catch (e) {
        // Ha a geolokációs szolgáltatás nem elérhető, egyszerűen
        // magyar marad az alapértelmezett felület - nincs hibaüzenet,
        // a felhasználó ettől még bármikor kézzel válthat nyelvet.
        console.log('[RC360] Automatikus nyelvfelismerés nem elérhető, alapértelmezett marad.');
    }
}


// ================================================================
// 16) PÁLYÁK BÖNGÉSZŐ (hamburger menü -> Pályák)
// Háromszintű: menü -> országok -> pályák. Oldalról nyílik be,
// hogy ne fedje el a térkép közepét.
// ================================================================
const STATUS_TEXT = {
    active:   { label: 'Aktív',                        cls: 'st-active' },
    inactive: { label: 'Inaktív / felfüggesztve',      cls: 'st-inactive' },
    unknown:  { label: 'Ismeretlen – ellenőrzendő',    cls: 'st-unknown' },
    closed:   { label: 'Véglegesen bezárt',            cls: 'st-closed' }
};

function buildTracksMenu() {
    const body = document.getElementById('tracksPanelBody');
    if (!body) { console.error('[RC360] tracksPanelBody nem található'); return; }

    const isos = Object.keys(trackDatabase).sort((a, b) => {
        const na = (countryMeta[a] && countryMeta[a].name) || a;
        const nb = (countryMeta[b] && countryMeta[b].name) || b;
        return na.localeCompare(nb);
    });

    const html = isos.map(iso => {
        const meta = countryMeta[iso] || { name: iso };
        const tracks = trackDatabase[iso] || [];
        const rows = tracks.map((t, idx) => {
            const st = STATUS_TEXT[t.status || 'active'] || STATUS_TEXT.active;
            return '<button class="tp-track" onclick="jumpToTrack(\'' + iso + '\',' + idx + ')">'
                 + '<span class="tp-tname">' + t.name + '</span>'
                 + '<span class="tp-tmeta">' + t.city + '</span>'
                 + '<span class="tp-status ' + st.cls + '"><span class="tp-dot"></span>' + st.label + '</span>'
                 + '</button>';
        }).join('');
        // Zászló szándékosan nincs - a kérésnek megfelelően csak az országnév
        return '<button class="tp-country" onclick="toggleCountryGroup(this)">'
             + '<span>' + meta.name + '</span>'
             + '<span><span class="tp-count">' + tracks.length + ' pálya</span> <span class="tp-arrow">&#9654;</span></span>'
             + '</button>'
             + '<div class="tp-tracks">' + rows + '</div>';
    }).join('');

    body.innerHTML = html;
}

function toggleCountryGroup(btnEl) {
    const list = btnEl.nextElementSibling;
    const isOpen = list.classList.contains('open');
    // Csak egy ország legyen nyitva egyszerre - átláthatóbb
    document.querySelectorAll('#tracksPanelBody .tp-tracks').forEach(el => el.classList.remove('open'));
    document.querySelectorAll('#tracksPanelBody .tp-country').forEach(el => el.classList.remove('open'));
    if (!isOpen) { list.classList.add('open'); btnEl.classList.add('open'); }
}

function openTracksMenu() {
    try {
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
        buildTracksMenu();   // mindig újraépítjük, hogy friss legyen
        const panel = document.getElementById('tracksPanel');
        if (panel) panel.classList.add('open');
    } catch (err) {
        console.error('[RC360] A Pályák menü megnyitása nem sikerült:', err);
    }
}
function closeTracksMenu() {
    document.getElementById('tracksPanel').classList.remove('open');
}

// Egy konkrét pályára navigál: ha kell, előbb betölti az ország
// térképnézetét, majd rázoomol és megnyitja a felugró adatlapot.
function jumpToTrack(iso, idx) {
    closeTracksMenu();
    const t = trackDatabase[iso][idx];

    const openIt = () => {
        leafletMap.setView([t.lat, t.lng], 12, { animate: true });
        markerLayerGroup.eachLayer(m => {
            const ll = m.getLatLng();
            if (Math.abs(ll.lat - t.lat) < 0.0001 && Math.abs(ll.lng - t.lng) < 0.0001) m.openPopup();
        });
    };

    if (currentIso === iso && document.getElementById('mapLayer').classList.contains('visible')) {
        openIt();
    } else {
        currentIso = iso;
        document.getElementById('filterContainer').classList.add('disabled');
        document.getElementById('instructionBar').style.opacity = '0';
        showMap(iso);
        setTimeout(openIt, 500);
    }
}

// ================================================================
// 17) NAPPALI / ÉJSZAKAI FÖLDGÖMB MÓD (kézi váltás)
// Induláskor a látogató helyi ideje dönt (lásd pickGlobeTexture),
// de innen bármikor felülírható.
// ================================================================
let isDayMode = (new Date().getHours() >= 6 && new Date().getHours() < 18);

function applyDayNightIcon() {
    const b = document.getElementById('btnDayNight');
    // Ha NAPPALI mód van, holdat mutatunk (arra lehet váltani), és viszont
    if (isDayMode) { b.textContent = '\ud83c\udf19'; b.title = 'Váltás éjszakai módra'; }
    else           { b.textContent = '\u2600\ufe0f'; b.title = 'Váltás nappali módra'; }
}

function toggleDayNight() {
    isDayMode = !isDayMode;
    world.globeImageUrl(isDayMode ? TEX_DAY : TEX_NIGHT);
    applyGlobeMaterial();
    applyDayNightIcon();

// Az anyagbeállítás a jelenet felépülése után fut le
setTimeout(applyGlobeMaterial, 300);
}

// A földgömb anyagának finomhangolása. Ez adja a "Google Earth"-hatást:
// plasztikus domborzat + csillogó óceán. Éjszakai módban a csillogást
// visszavesszük, hogy a városfények érvényesüljenek.
function applyGlobeMaterial() {
    try {
        const mat = world.globeMaterial();
        if (!mat) return;

        // Domborzat mélysége: nappal erősebb, éjjel finomabb
        mat.bumpScale = isDayMode ? 12 : 4;

        // Vízcsillogás – csak akkor, ha a THREE globálisan elérhető.
        // (A globe.gl saját three-t csomagol; ha nincs külön betöltve,
        //  ezt a lépést csendben kihagyjuk, a gömb ettől is szép marad.)
        if (typeof THREE !== 'undefined' && !mat._waterMapLoaded) {
            new THREE.TextureLoader().load(TEX_WATER, texture => {
                mat.specularMap = texture;
                mat.specular = new THREE.Color(isDayMode ? '#4a5568' : '#1a2332');
                mat.shininess = isDayMode ? 14 : 6;
                mat._waterMapLoaded = true;
                mat.needsUpdate = true;
            });
        } else if (typeof THREE !== 'undefined' && mat.specular) {
            mat.specular = new THREE.Color(isDayMode ? '#4a5568' : '#1a2332');
            mat.shininess = isDayMode ? 14 : 6;
            mat.needsUpdate = true;
        }
    } catch (err) {
        console.log('[RC360] A földgömb anyagbeállítása kihagyva:', err.message);
    }
}

applyDayNightIcon();

// Indításkor ellenőrizzük a cookie-hozzájárulás állapotát
initCookieBanner();

// Indításkor megpróbáljuk automatikusan felismerni a látogató országát/nyelvét
detectAndSetLanguage();
