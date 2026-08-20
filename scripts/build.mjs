// Static site generator for 林氏租屋.
// Reads data/site.json + data/listings.csv, writes docs/*.html (GitHub Pages serves /docs on main).
// Re-run this after editing the CSV (later: after re-exporting the Google Sheet as CSV over data/listings.csv).

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, cpSync } from 'node:fs';
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

function readListingsRaw() {
  const text = readFileSync(path.join(ROOT, 'data/listings.csv'), 'utf8');
  return parseCSV(text);
}

// ---- filter facets ----

const TAG_DEFS = [
  { key: 'subsidy', label: '可租補' },
  { key: 'cat', label: '可貓' },
  { key: 'dog', label: '可狗' },
  { key: 'elevator', label: '有電梯' },
  { key: 'parking', label: '有車位' },
  { key: 'balcony', label: '有陽台' },
  { key: 'flatutility', label: '台水電' },
];

const PRICE_BUCKETS = [
  { key: 'p1', label: '8,000以下', test: (p) => p < 8000 },
  { key: 'p2', label: '8,000-12,000', test: (p) => p >= 8000 && p < 12000 },
  { key: 'p3', label: '12,000-16,000', test: (p) => p >= 12000 && p < 16000 },
  { key: 'p4', label: '16,000-20,000', test: (p) => p >= 16000 && p < 20000 },
  { key: 'p5', label: '20,000以上', test: (p) => p >= 20000 },
];

// Full 29-district list, matching the reference site (71rent.com) so every
// Taichung district is filterable even before a listing in it exists.
const TAICHUNG_DISTRICTS = [
  '北屯區', '西屯區', '南屯區', '北區', '西區', '中區', '南區', '東區',
  '太平區', '大里區', '霧峰區', '烏日區', '豐原區', '大雅區', '潭子區', '神岡區',
  '大肚區', '龍井區', '沙鹿區', '梧棲區', '清水區', '大甲區', '外埔區', '大安區',
  '后里區', '石岡區', '東勢區', '新社區', '和平區',
].map((a) => ({ key: a, label: a }));

const LAYOUT_BUCKETS = [
  { key: 'studio', label: '套房' },
  { key: '1', label: '1房' },
  { key: '2', label: '2房' },
  { key: '3plus', label: '3房以上' },
];

function fmtPrice(n) {
  return `NT$ ${n.toLocaleString('en-US')}`;
}

function layoutBucket(text) {
  const t = String(text ?? '');
  if (t.includes('套房') || t.includes('雅房')) return 'studio';
  const m = t.match(/(\d+)\s*房/);
  if (!m) return 'studio';
  const n = parseInt(m[1], 10);
  if (n >= 3) return '3plus';
  return String(n);
}

function priceBucket(n) {
  const b = PRICE_BUCKETS.find((b) => b.test(n));
  return b ? b.key : 'p5';
}

function enrichListing(raw) {
  const priceNum = Number(raw.price) || 0;
  const tags = TAG_DEFS.filter((t) => (raw[`tag_${t.key}`] || '').trim() !== '').map((t) => t.key);
  const photos = (raw.photos || '').split('|').map((p) => p.trim()).filter(Boolean);
  return {
    ...raw,
    published: (raw.status || '').trim().toLowerCase() === 'published',
    priceNum,
    priceDisplay: fmtPrice(priceNum),
    layoutKey: layoutBucket(raw.layout),
    priceKey: priceBucket(priceNum),
    tags,
    photos,
    searchBlob: `${raw.area} ${raw.addr} ${raw.name}`.toLowerCase(),
  };
}

// Everything in the CSV, published or not (status anything other than exactly
// "published" is treated as draft/not-ready — fails closed on purpose: a typo
// or blank status must never accidentally go public).
function readAllListings() {
  return readListingsRaw().map(enrichListing);
}

// Only what's actually confirmed vacant and cleared to list — this is what
// the built site (docs/) is generated from.
function readListings() {
  return readAllListings().filter((l) => l.published);
}

function uniqueAreas(listings) {
  return [...new Set(listings.map((l) => l.area).filter(Boolean))];
}

const icon = {
  house: (size = 40, stroke = '#C9A98A', w = 1.6) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"></path><path d="M5.5 10v9a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-9"></path><path d="M10 20v-6h4v6"></path></svg>`,
  pin: (size = 13, stroke = '#7A6A57') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-7.2-7-12a7 7 0 0 1 14 0c0 4.8-7 12-7 12z"></path><circle cx="12" cy="9" r="2.5"></circle></svg>`,
  search: () =>
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B4A88F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
  close: () =>
    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="5" x2="19" y2="19"></line><line x1="19" y1="5" x2="5" y2="19"></line></svg>`,
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

function pageShell({ title, desc, base = '', extraScript = '', body }) {
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
${extraScript}
</body>
</html>
`;
}

function tagBadges(listing) {
  if (!listing.tags.length) return '';
  return `<div class="badges tags">
            ${listing.tags.map((k) => `<span class="badge tag-badge">${esc(TAG_DEFS.find((t) => t.key === k).label)}</span>`).join('\n            ')}
          </div>`;
}

function cardImg(listing, base = '') {
  if (listing.photos.length) {
    return `<img src="${base}assets/photos/${listing.id}/${esc(listing.photos[0])}" alt="${esc(listing.name)}" loading="lazy">`;
  }
  return icon.house(40);
}

function card(listing, base = '') {
  return `      <a class="card" href="${base}listings/${listing.id}.html" style="color:inherit;"
        data-area="${esc(listing.area)}" data-price="${listing.priceKey}" data-layout="${listing.layoutKey}"
        data-tags="${listing.tags.join(' ')}" data-search="${esc(listing.searchBlob)}">
        <div class="card-img">${cardImg(listing, base)}</div>
        <div class="card-body">
          <div class="tag-area">${esc(listing.area)}</div>
          <h3>${esc(listing.name)}</h3>
          <div class="addr-row">${icon.pin(13)}<span>${esc(listing.addr)}</span></div>
          <div class="badges">
            <span class="badge">${esc(listing.size)}</span>
            <span class="badge">${esc(listing.layout)}</span>
          </div>
          ${tagBadges(listing)}
          <div class="price-row">
            <div class="price">${esc(listing.priceDisplay)}<small>/月</small></div>
            <span class="view">查看詳情 →</span>
          </div>
        </div>
      </a>`;
}

function filterChipRow(group, items) {
  return `      <div class="chip-row" data-filter-group="${group}">
${items.map((it) => `        <button type="button" class="chip" data-value="${esc(it.key)}">${esc(it.label)}</button>`).join('\n')}
      </div>`;
}

function buildIndex(site, listings) {
  const body = `${topbar(site, 'index.html')}

  <div class="hero">
    <h1 class="heading">精選出租物件</h1>
    <p>${esc(site.tagline)}</p>
  </div>

  <div class="filter-bar">
    <div class="search-box">${icon.search()}<input type="text" id="search-input" placeholder="搜尋地區、路名、關鍵字"></div>

    <div class="filter-group">
      <div class="filter-label">地區</div>
${filterChipRow('area', TAICHUNG_DISTRICTS)}
    </div>
    <div class="filter-group">
      <div class="filter-label">租金</div>
${filterChipRow('price', PRICE_BUCKETS)}
    </div>
    <div class="filter-group">
      <div class="filter-label">格局</div>
${filterChipRow('layout', LAYOUT_BUCKETS)}
    </div>
    <div class="filter-group">
      <div class="filter-label">特色</div>
${filterChipRow('tag', TAG_DEFS)}
    </div>

    <div class="filter-footer">
      <span id="result-count" class="result-count"></span>
      <button type="button" id="clear-filters" class="clear-filters">清除篩選</button>
    </div>
  </div>

  <div class="grid" id="listing-grid">
${listings.map((l) => card(l)).join('\n')}
  </div>

${footer(site)}`;
  return pageShell({
    title: `${site.brand}｜精選出租物件`,
    desc: site.tagline,
    extraScript: '<script src="assets/filter.js" defer></script>',
    body,
  });
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
    <div class="gallery-main">${
      listing.photos.length
        ? `<img src="${base}assets/photos/${listing.id}/${esc(listing.photos[0])}" alt="${esc(listing.name)}">`
        : icon.house(56)
    }</div>
    <div class="thumb-grid">
      ${
        listing.photos.length > 1
          ? listing.photos
              .slice(1)
              .map((p) => `<div class="thumb"><img src="${base}assets/photos/${listing.id}/${esc(p)}" alt="${esc(listing.name)}" loading="lazy"></div>`)
              .join('\n      ')
          : [1, 2, 3, 4].map(() => `<div class="thumb">${icon.house(26)}</div>`).join('\n      ')
      }
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
        ${tagBadges(listing)}
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
      <div class="inquiry-price">${esc(listing.priceDisplay)}<small>/月</small></div>
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
  return pageShell({ title: `${esc(listing.name)}｜${site.brand}`, desc: `${listing.area} ${listing.addr}・${listing.size}・${listing.priceDisplay}/月`, base, body });
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
  const all = readAllListings();
  const listings = all.filter((l) => l.published);
  const drafts = all.filter((l) => !l.published);

  mkdirSync(path.join(SITE, 'listings'), { recursive: true });
  mkdirSync(path.join(SITE, 'assets'), { recursive: true });
  copyFileSync(path.join(ROOT, 'assets/style.css'), path.join(SITE, 'assets/style.css'));
  copyFileSync(path.join(ROOT, 'assets/filter.js'), path.join(SITE, 'assets/filter.js'));
  if (!existsSync(path.join(SITE, '.nojekyll'))) writeFileSync(path.join(SITE, '.nojekyll'), '');

  writeFileSync(path.join(SITE, 'index.html'), buildIndex(site, listings));
  writeFileSync(path.join(SITE, 'about.html'), buildAbout(site));
  writeFileSync(path.join(SITE, 'contact.html'), buildContact(site));
  for (const l of listings) {
    if (!l.id) continue;
    writeFileSync(path.join(SITE, 'listings', `${l.id}.html`), buildDetail(site, l));
    // Only published listings' photos get copied into the public output —
    // a draft's photos must not end up in docs/ even if the files exist locally.
    const srcPhotoDir = path.join(ROOT, 'assets/photos', l.id);
    if (l.photos.length && existsSync(srcPhotoDir)) {
      cpSync(srcPhotoDir, path.join(SITE, 'assets/photos', l.id), { recursive: true });
    }
  }

  console.log(`built: index.html, about.html, contact.html, listings/{${listings.map((l) => l.id).join(',')}}.html`);
  console.log(`areas: ${uniqueAreas(listings).join(', ')}`);
  if (drafts.length) {
    const desc = drafts.map((l) => `${l.id} (${l.status || 'blank'})`).join(', ');
    console.log(`skipped ${drafts.length} non-published listing(s), not built: ${desc}`);
  }
}

main();
