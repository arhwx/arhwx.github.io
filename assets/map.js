const COLORS = { atm: "#2946c8", branch: "#d6382b" };
const IRAQ_BOUNDS = L.latLngBounds([28.8, 38.5], [37.8, 49.3]);

const CITIES = [
  { en: "Baghdad", ku: "بەغدا", lat: 33.315, lng: 44.366 },
  { en: "Erbil", ku: "هەولێر", lat: 36.19, lng: 44.01 },
  { en: "Sulaymaniyah", ku: "سلێمانی", lat: 35.56, lng: 45.43 },
  { en: "Duhok", ku: "دهۆک", lat: 36.86, lng: 42.99 },
  { en: "Zakho", ku: "زاخۆ", lat: 37.14, lng: 42.69 },
  { en: "Basra", ku: "بەسرە", lat: 30.51, lng: 47.81 },
  { en: "Mosul", ku: "مووسڵ", lat: 36.34, lng: 43.13 },
  { en: "Kirkuk", ku: "کەرکووک", lat: 35.47, lng: 44.39 },
  { en: "Najaf", ku: "نەجەف", lat: 32.03, lng: 44.34 },
  { en: "Karbala", ku: "کەربەلا", lat: 32.61, lng: 44.03 },
  { en: "Hillah", ku: "حیللە", lat: 32.48, lng: 44.43 },
  { en: "Ramadi", ku: "ڕەمادی", lat: 33.42, lng: 43.3 },
  { en: "Fallujah", ku: "فەللوجە", lat: 33.35, lng: 43.78 },
  { en: "Halabja", ku: "هەڵەبجە", lat: 35.18, lng: 45.99 },
  { en: "Sharazoor", ku: "شارەزوور", lat: 35.315, lng: 45.685 },
  { en: "Sayid Sadiq", ku: "سەیدسادق", lat: 35.35, lng: 45.86 },
  { en: "Darbandikhan", ku: "دەربەندیخان", lat: 35.11, lng: 45.69 },
  { en: "Nasiriyah", ku: "ناسریە", lat: 31.05, lng: 46.26 },
  { en: "Amarah", ku: "عەمارە", lat: 31.84, lng: 47.14 },
  { en: "Diwaniyah", ku: "دیوانیە", lat: 31.99, lng: 44.92 },
  { en: "Kut", ku: "کوت", lat: 32.51, lng: 45.82 },
  { en: "Samawah", ku: "سەماوە", lat: 31.31, lng: 45.28 },
  { en: "Baqubah", ku: "بەعقوبە", lat: 33.75, lng: 44.64 },
  { en: "Tikrit", ku: "تکریت", lat: 34.61, lng: 43.68 },
  { en: "Koya", ku: "کۆیە", lat: 36.08, lng: 44.63 },
  { en: "Soran", ku: "سۆران", lat: 36.65, lng: 44.55 },
  { en: "Shaqlawa", ku: "شەقڵاوە", lat: 36.4, lng: 44.32 },
  { en: "Akre", ku: "ئاکرێ", lat: 36.74, lng: 43.89 },
  { en: "Amedi", ku: "ئامێدی", lat: 37.09, lng: 43.49 },
  { en: "Bardarash", ku: "بەردەڕەش", lat: 36.51, lng: 43.58 },
  { en: "Chamchamal", ku: "چەمچەماڵ", lat: 35.53, lng: 44.83 },
  { en: "Ranya", ku: "ڕانیە", lat: 36.25, lng: 44.88 },
  { en: "Kalar", ku: "کەلار", lat: 34.63, lng: 45.32 },
  { en: "Umm Qasr", ku: "ئوم قەسر", lat: 30.03, lng: 47.93 },
  { en: "Qurnah", ku: "قورنە", lat: 31.02, lng: 47.43 },
  { en: "Rumaila", ku: "ڕومەیلە", lat: 30.6, lng: 47.25 },
];
const CITY_RADIUS_KM = 45;

const map = L.map("map", {
  renderer: L.canvas({ tolerance: 10 }),
  maxBounds: IRAQ_BOUNDS.pad(0.05),
  maxBoundsViscosity: 1.0,
  minZoom: 6,
});
map.fitBounds(IRAQ_BOUNDS);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
}).addTo(map);

const state = { atm: true, branch: true, banks: new Set(), lang: "ku" };
let sites = [];
let markers = [];
let bankList = [];

fetch("/data/all_locations.json")
  .then((r) => r.json())
  .then((data) => {
    sites = data;
    const seen = new Map();
    for (const s of sites) {
      for (const b of s.banks) {
        const e = seen.get(b.bank_en) || { en: b.bank_en, ku: b.bank_ku || b.bank_en, count: 0 };
        e.count++;
        seen.set(b.bank_en, e);
      }
    }
    bankList = [...seen.values()];
    bankList.forEach((b) => state.banks.add(b.en));
    assignCities();
    renderBankList();
    renderCityList();
    markers = sites.map(makeMarker);
    render();
  });

function distKm(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

function assignCities() {
  for (const c of CITIES) c.count = 0;
  for (const s of sites) {
    let best = null;
    let bestD = CITY_RADIUS_KM;
    for (const c of CITIES) {
      const d = distKm(+s.latitude, +s.longitude, c.lat, c.lng);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    if (best) best.count++;
  }
}

function renderCityList() {
  const el = document.getElementById("cities");
  el.innerHTML = "";
  const list = CITIES.filter((c) => c.count > 0).sort((a, b) =>
    state.lang === "en" ? a.en.localeCompare(b.en, "en") : a.ku.localeCompare(b.ku, "ckb")
  );
  for (const c of list) {
    const btn = document.createElement("button");
    btn.className = "city-row";
    const nameSpan = document.createElement("span");
    nameSpan.dir = "auto";
    nameSpan.textContent = state.lang === "en" ? c.en : c.ku;
    btn.appendChild(nameSpan);
    const n = document.createElement("span");
    n.className = "n";
    n.textContent = c.count;
    btn.appendChild(n);
    btn.onclick = () => {
      citiesPanel.classList.remove("open");
      map.setView([c.lat, c.lng], 13);
    };
    el.appendChild(btn);
  }
}

const branchIcon = L.divIcon({
  className: "branch-marker",
  iconSize: [16, 16],
});

function makeMarker(site) {
  const m =
    site.type === "branch"
      ? L.marker([site.latitude, site.longitude], { icon: branchIcon })
      : L.circleMarker([site.latitude, site.longitude], {
          radius: 7,
          weight: 2,
          color: "#ffffff",
          fillColor: COLORS.atm,
          fillOpacity: 0.9,
        });
  m.bindPopup(() => popupHtml(site), { maxWidth: 280 });
  return m;
}

function siteName(site) {
  return site.name_ku || site.name_ar || site.name;
}

function popupHtml(site) {
  const primary = siteName(site);
  const rtl = /[؀-ۿ]/.test(primary);
  const label = site.type === "branch" ? "\u{1F3E6} لق · branch" : "\u{1F3E7} ATM";
  let html = `<span class="kind">${label}</span>`;
  html += `<span class="name" dir="${rtl ? "rtl" : "ltr"}">${esc(primary)}</span>`;
  const secondary = site.location_name || (primary !== site.name ? site.name : "");
  if (secondary) html += `<span class="kind">${esc(secondary)}</span>`;
  const bankNames = site.banks
    .map((b) => (b.bank_ku && b.bank_ku !== b.bank_en ? `${esc(b.bank_ku)} (${esc(b.bank_en)})` : esc(b.bank_en)))
    .join("، ");
  html += `<div class="banks" dir="auto">${bankNames}</div>`;
  html += `<a class="dir-btn" href="https://www.google.com/maps/dir/?api=1&destination=${site.latitude},${site.longitude}" target="_blank" rel="noopener">&#129517; ئاراستە · Directions</a>`;
  return html;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function visible(site) {
  if (!state[site.type]) return false;
  return site.banks.some((b) => state.banks.has(b.bank_en));
}

function render() {
  let atms = 0;
  let branches = 0;
  sites.forEach((site, i) => {
    const show = visible(site);
    if (show && !map.hasLayer(markers[i])) markers[i].addTo(map);
    if (!show && map.hasLayer(markers[i])) markers[i].remove();
    if (show) site.type === "branch" ? branches++ : atms++;
  });
  document.getElementById("count").textContent = `${atms} ATM · ${branches} لق`;
}

function renderBankList() {
  const banksEl = document.getElementById("banks");
  banksEl.innerHTML = "";
  const sorted = [...bankList].sort((a, b) =>
    state.lang === "en" ? a.en.localeCompare(b.en, "en") : a.ku.localeCompare(b.ku, "ckb")
  );
  for (const bank of sorted) {
    const l = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = state.banks.has(bank.en);
    box.onchange = () => {
      box.checked ? state.banks.add(bank.en) : state.banks.delete(bank.en);
      render();
    };
    l.appendChild(box);
    const nameSpan = document.createElement("span");
    nameSpan.dir = "auto";
    nameSpan.textContent = state.lang === "en" ? bank.en : bank.ku;
    l.appendChild(nameSpan);
    const n = document.createElement("span");
    n.className = "n";
    n.textContent = bank.count;
    l.appendChild(n);
    banksEl.appendChild(l);
  }
}

function setLang(lang) {
  state.lang = lang;
  document.getElementById("langKu").setAttribute("aria-pressed", lang === "ku");
  document.getElementById("langEn").setAttribute("aria-pressed", lang === "en");
  renderBankList();
  renderCityList();
}
document.getElementById("langKu").onclick = () => setLang("ku");
document.getElementById("langEn").onclick = () => setLang("en");

document.getElementById("all").onclick = () => {
  bankList.forEach((b) => state.banks.add(b.en));
  renderBankList();
  render();
};
document.getElementById("none").onclick = () => {
  state.banks.clear();
  renderBankList();
  render();
};

function bindToggle(id, key) {
  const btn = document.getElementById(id);
  btn.onclick = () => {
    state[key] = !state[key];
    btn.setAttribute("aria-pressed", state[key]);
    render();
  };
}
bindToggle("atmBtn", "atm");
bindToggle("branchBtn", "branch");

const panel = document.getElementById("banksPanel");
const citiesPanel = document.getElementById("citiesPanel");

function updateFade(el) {
  const end = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
  el.classList.toggle("at-end", end);
}
panel.addEventListener("scroll", () => updateFade(panel));
citiesPanel.addEventListener("scroll", () => updateFade(citiesPanel));

document.getElementById("banksBtn").onclick = () => {
  citiesPanel.classList.remove("open");
  panel.classList.toggle("open");
  updateFade(panel);
};
document.getElementById("closeBanks").onclick = () => panel.classList.remove("open");
document.getElementById("citiesBtn").onclick = () => {
  panel.classList.remove("open");
  citiesPanel.classList.toggle("open");
  updateFade(citiesPanel);
};
document.getElementById("closeCities").onclick = () => citiesPanel.classList.remove("open");

const notice = document.getElementById("notice");
if (!localStorage.getItem("noticeOk")) notice.hidden = false;
document.getElementById("noticeOk").onclick = () => {
  localStorage.setItem("noticeOk", "1");
  notice.hidden = true;
};

let meMarker = null;
document.getElementById("locateBtn").onclick = () => {
  if (!window.isSecureContext) {
    return alert("location only works on the https version of this site");
  }
  if (!navigator.geolocation) {
    return alert("location is not available on this device");
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      if (meMarker) meMarker.remove();
      meMarker = L.circleMarker(ll, {
        radius: 9,
        weight: 3,
        color: "#ffffff",
        fillColor: "#0b8043",
        fillOpacity: 1,
      }).addTo(map);
      map.setView(ll, 14);
    },
    (err) => {
      if (err.code === 1) {
        alert("location was denied, allow it in your browser settings");
      } else if (err.code === 3) {
        alert("finding your location took too long, try again");
      } else {
        alert("could not get your location right now");
      }
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
};
