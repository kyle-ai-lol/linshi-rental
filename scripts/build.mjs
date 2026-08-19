// Static site generator for 林氏租屋.
// Reads data/site.json + data/listings.csv, writes site/*.html.
// Re-run this after editing the CSV (later: after re-exporting the Google Sheet as CSV over data/listings.csv).

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'docs'); // GitHub Pages serves straight from /docs on main

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Minimal RFC4180-ish CSV parser: handles quoted fields, embedded commas/newlines, "" as escaped quote.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  const filtered = rows.filter((r) => r.some((v) => v.trim() !== ''));
  const header = filtered[0];
  return filtered.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, idx) => { obj[h.trim()] = (r[idx] ?? '').trim(); });
    return obj;
  });
}

function readSite() {
  return JSON.parse(readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
}

function readListings() {
  const text = readFileSync(path.join(ROOT, 'data/listings.csv'), 'utf8');
  return parseCSV(text);
}

const icon = {
  house: (size = 40, stroke = '#C9A98A', w = 1.6) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"></path><path d="M5.5 10v9a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-9"></path><path d="M10 20v-6h4v6"></path></svg>`,
  pin: (size = 13, stroke = '#7A6A57') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-7.2-7-12a7 7 0 0 1 14 0c0 4.8-7 12-7 12z"></path><circle cx="12" cy="9" r="2.5"></circle></svg>`,
  search: () =>
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B4A88F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
  chevron: () =>
    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#B4A88F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
  phone: () =>
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7A6A57" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2C10.5 21 3 13.5 3 6a2 2 0 0 1 2-2z"></path></svg>`,
  chat: () =>
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7A6A57" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5h16v11H9l-4 3.5v-3.5H4z"></path></svg>`,
  mail: () =>
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7A6A57" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5.5" width="17" height="13" rx="2"></rect><path d="M4 6.5 12 13l8-6.5"></path></svg>`,
  link: () =>
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7A6A57" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15 15 9"></path><path d="M8 17H6a4 4 0 0 1 0-8h2"></path><path d="M16 7h2a4 4 0 0 1 0 8h-2"></path></svg>`,
  clock: () =>
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7A6A57" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3.5 2"></path></svg>`,
  person: () =>
    `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#C9A98A" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"></circle><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"></path></svg>`,
  speech: () =>
    `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#B4623E" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5h16v11H9l-4 3.5v-3.5H4z"></path></svg>`,
  camera: () =>
    `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#B4623E" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"></path><circle cx="12" cy="13" r="3.5"></circle></svg>`,
  pinAccent: () =>
    `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#B4623E" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-7.2-7-12a7 7 0 0 1 14 0c0 4.8-7 12-7 12z"></path><circle cx="12" cy="9" r="2.5"></circle></svg>`,
};

function nav(active, base = '') {
  const items = [
    ['index.html', '物件列表'],
    ['about.html', '關於我'],
    ['contact.html', '聯絡方式'],
  ];
  return `<div class="nav">${items
    .map(([href, label]) => `<a href="${base}${href}"${active === href ? ' class="active"' : ''}>${label}</a>`)
    .join('\n      ')}</div>`;
}

function topbar(site, active, base = '') {
  return `  <div class="topbar">
    <div class="brand heading"><a href="${base}index.html" style="color:inherit;">${esc(site.brand)}</a></div>
    ${nav(active, base)}
  </div>`;
}

function footer(site, base = '') {
  const c = site.contact;
  return `  <div class="footer">
    <div class="footer-brand">
      <h4>${esc(site.brand)}</h4>
      <p>${esc(site.tagline)}</p>
    </div>
    <div class="footer-contact">
      <div>電話｜${esc(c.phone)}</div>
      <div>LINE｜${esc(c.line)}</div>
      <div>Email｜${esc(c.email)}</div>
      <div>IG｜${esc(c.ig)}</div>
      <div>脆｜${esc(c.threads)}</div>
    </div>
  </div>`;
}

function pageShell({ title, desc, base = '', body }) {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lora:wght@500;600;700&family=Nunito+Sans:wght@400;600;700&display=swap">
<link rel="stylesheet" href="${base}assets/style.css">
</head>
<body>
<div class="page">
${body}
</div>
</body>
</html>
`;
}

function card(listing, base = '') {
  return `      <a class="card" href="${base}listings/${listing.id}.html" style="color:inherit;">
        <div class="card-img">${icon.house(40)}</div>
        <div class="card-body">
          <div class="tag-area">${esc(listing.area)}</div>
          <h3>${esc(listing.name)}</h3>
          <div class="addr-row">${icon.pin(13)}<span>${esc(listing.addr)}</span></div>
          <div class="badges">
            <span class="badge">${esc(listing.size)}</span>
            <span class="badge">${esc(listing.layout)}</span>
          </div>
          <div class="price-row">
            <div class="price">${esc(listing.price)}<small>/月</small></div>
            <span class="view">查看詳情 →</span>
          </div>
        </div>
      </a>`;
}

function buildIndex(site, listings) {
  const body = `${topbar(site, 'index.html')}

  <div class="hero">
    <h1 class="heading">精選出租物件</h1>
    <p>${esc(site.tagline)}</p>
  </div>

  <div class="filter-bar">
    <div class="filter-row">
      <div class="search-box">${icon.search()}<input type="text" placeholder="搜尋區域、物件關鍵字"></div>
      <div class="filter-pill"><span>區域：不限</span>${icon.chevron()}</div>
      <div class="filter-pill"><span>坪數：不限</span>${icon.chevron()}</div>
      <div class="filter-pill"><span>租金：不限</span>${icon.chevron()}</div>
    </div>
    <div class="chip-row">
      <div class="chip active">全部</div>
      <div class="chip">近捷運</div>
      <div class="chip">可養寵物</div>
      <div class="chip">已含家具</div>
    </div>
  </div>

  <div class="grid">
${listings.map((l) => card(l)).join('\n')}
  </div>

${footer(site)}`;
  return pageShell({ title: `${site.brand}｜精選出租物件`, desc: site.tagline, body });
}

function buildDetail(site, listing) {
  const base = '../';
  const body = `${topbar(site, 'index.html', base)}

  <div class="breadcrumb">
    <a href="${base}index.html">物件列表</a>
    <span class="sep">›</span>
    <span class="current">${esc(listing.name)}</span>
  </div>

  <div class="gallery">
    <div class="gallery-main">${icon.house(56)}</div>
    <div class="thumb-grid">
      ${[1, 2, 3, 4].map(() => `<div class="thumb">${icon.house(26)}</div>`).join('\n      ')}
    </div>
  </div>

  <div class="detail-row">
    <div class="detail-main">
      <div class="detail-title">
        <div class="tag-area">${esc(listing.area)}</div>
        <h1 class="heading">${esc(listing.name)}</h1>
        <div class="addr-row">${icon.pin(14)}<span>${esc(listing.addr)}</span></div>
        <div class="badges" style="margin-top:4px;">
          <span class="badge">${esc(listing.size)}</span>
          <span class="badge">${esc(listing.layout)}</span>
        </div>
      </div>

      <div class="divider"></div>

      <div class="spec-grid">
        <div class="spec"><span>坪數</span><span>${esc(listing.size)}</span></div>
        <div class="spec"><span>格局</span><span>${esc(listing.layout)}</span></div>
        <div class="spec"><span>樓層</span><span>${esc(listing.floor)}</span></div>
        <div class="spec"><span>朝向</span><span>${esc(listing.orientation)}</span></div>
        <div class="spec"><span>車位</span><span>${esc(listing.parking)}</span></div>
        <div class="spec"><span>寵物</span><span>${esc(listing.pets)}</span></div>
      </div>

      <div class="divider"></div>

      <div class="description">${esc(listing.description)}</div>
    </div>

    <div class="inquiry-card">
      <div class="inquiry-price">${esc(listing.price)}<small>/月</small></div>
      <a class="btn-solid" href="${base}contact.html">預約看房</a>
      <div class="divider" style="margin:20px 0;"></div>
      <div class="contact-lines">
        <div class="row">${icon.phone()}<span>${esc(site.contact.phone)}</span></div>
        <div class="row">${icon.chat()}<span>${esc(site.contact.line)}</span></div>
        <div class="row">${icon.mail()}<span>${esc(site.contact.email)}</span></div>
      </div>
      <div class="map-box">${icon.pinAccent()}<span>〔地圖位置示意〕</span></div>
    </div>
  </div>

${footer(site, base)}`;
  return pageShell({ title: `${esc(listing.name)}｜${site.brand}`, desc: `${listing.area} ${listing.addr}・${listing.size}・${listing.price}/月`, base, body });
}

function buildAbout(site) {
  const a = site.about;
  const avatarInner = a.avatar
    ? `<img src="assets/${esc(a.avatar)}" alt="${esc(a.name)}">`
    : icon.person();
  const body = `${topbar(site, 'about.html')}

  <div class="about-hero">
    <div class="avatar">${avatarInner}</div>
    <div>
      <h1 class="heading">${esc(a.name)}</h1>
      <div class="role">${esc(a.role)}</div>
    </div>
  </div>

  <div class="features">
${a.features
  .map(
    (f, i) => `    <div class="feature-card">
      ${[icon.speech, icon.camera, icon.pinAccent][i % 3]()}
      <h4>${esc(f.title)}</h4>
      <p>${esc(f.desc)}</p>
    </div>`
  )
  .join('\n')}
  </div>

  <div class="cta-banner">
    <div class="msg">想了解更多物件，或想約時間看房？</div>
    <a class="btn-pill" href="contact.html">聯絡我</a>
  </div>

${footer(site)}`;
  return pageShell({ title: `關於我｜${site.brand}`, desc: `${a.name}・${a.role}`, body });
}

function buildContact(site) {
  const c = site.contact;
  const body = `${topbar(site, 'contact.html')}

  <div class="hero">
    <h1 class="heading">聯絡我</h1>
    <p>有想詢問的物件，或想預約看房時間，歡迎透過以下方式聯絡</p>
  </div>

  <div class="contact-row">
    <div class="contact-info">
      <div class="row">${icon.phone()}<span>電話｜${esc(c.phone)}</span></div>
      <div class="row">${icon.chat()}<span>LINE｜${esc(c.line)}</span></div>
      <div class="row">${icon.mail()}<span>Email｜${esc(c.email)}</span></div>
      <div class="row">${icon.link()}<span>IG｜${esc(c.ig)}</span></div>
      <div class="row">${icon.link()}<span>脆｜${esc(c.threads)}</span></div>
      <div class="row">${icon.clock()}<span>服務時間｜${esc(c.hours)}</span></div>
    </div>

    <form class="contact-form" onsubmit="return false;">
      <div class="form-field"><label>姓名</label><input type="text" placeholder="請輸入姓名"></div>
      <div class="form-field"><label>電話</label><input type="text" placeholder="方便聯絡的電話"></div>
      <div class="form-field"><label>想詢問的物件</label><input type="text" placeholder="例如：示意物件 A"></div>
      <div class="form-field"><label>留言</label><textarea rows="4" placeholder="想了解的細節、方便看房的時間等"></textarea></div>
      <button class="btn-solid" type="submit">送出詢問</button>
    </form>
  </div>

${footer(site)}`;
  return pageShell({ title: `聯絡我｜${site.brand}`, desc: `${site.brand} 聯絡方式`, body });
}

function main() {
  const site = readSite();
  const listings = readListings();

  mkdirSync(path.join(SITE, 'listings'), { recursive: true });
  mkdirSync(path.join(SITE, 'assets'), { recursive: true });
  copyFileSync(path.join(ROOT, 'assets/style.css'), path.join(SITE, 'assets/style.css'));
  if (!existsSync(path.join(SITE, '.nojekyll'))) writeFileSync(path.join(SITE, '.nojekyll'), '');

  writeFileSync(path.join(SITE, 'index.html'), buildIndex(site, listings));
  writeFileSync(path.join(SITE, 'about.html'), buildAbout(site));
  writeFileSync(path.join(SITE, 'contact.html'), buildContact(site));
  for (const l of listings) {
    if (!l.id) continue;
    writeFileSync(path.join(SITE, 'listings', `${l.id}.html`), buildDetail(site, l));
  }

  console.log(`built: index.html, about.html, contact.html, listings/{${listings.map((l) => l.id).join(',')}}.html`);
}

main();
