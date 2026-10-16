/*! a11ybookclub-shelf v1.5.1 | Accessibility Book Club | MIT */
/* ==========================================================================
   ACCESSIBILITY BOOK CLUB · 3D SHELF
   - Source of truth: the .shelf_book-item list above (the Webflow Collection List).
   - The canvas is aria-hidden. All meaning lives in HTML:
     view toggle, Prev/Next, markers, the Open button, the detail panel,
     and a polite live region.
   - Patterns: toggle buttons (aria-pressed), roving tabindex markers,
     live region status. WCAG 2.2 AA targets noted inline.
   ========================================================================== */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js';

/* ---------- Config ---------- */
const CONFIG = {
  coverHeight: 2.0,         // every book is normalized to this height (world units)
  gap: 0.05,                // space between books in the stack
  fov: 30,
  openDuration: 1.0,        // seconds for the lift-and-turn
  stackBg: '#17140f',
  stackFg: '#f5f1ea',
  fallbackTimeoutMs: 15000, // if the scene still isn't up (very slow connection), show the list
};

const root = document.documentElement;
const reduceMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reduceMotion = reduceMotionQuery.matches;
reduceMotionQuery.addEventListener('change', e => { reduceMotion = e.matches; });

/* ==========================================================================
   1. VIEW TOGGLE (works even if the 3D part never loads)
   ========================================================================== */
const viewButtons = [...document.querySelectorAll('[data-view-btn]')];
function setView(view, { save = true } = {}) {
  root.dataset.view = view;
  viewButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.viewBtn === view)));
  if (save) { try { localStorage.setItem('abc-shelf-view', view); } catch (e) {} }
  if (shelf) shelf.setActive(view === 'shelf');
}
viewButtons.forEach(b => b.addEventListener('click', () => setView(b.dataset.viewBtn)));
viewButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.viewBtn === root.dataset.view)));

let shelf = null;

/* ==========================================================================
   2. READ BOOKS FROM THE LIST
   ========================================================================== */
/* Webflow outputs empty CMS bindings with class w-dyn-bind-empty; treat those as missing */
const txt = n => (n && !n.classList.contains('w-dyn-bind-empty') ? n.textContent.trim() : '');
/* Three or more people in one author field ("A, B, C and D" or "A, B and C, editors (39 authors)"):
   use "A et al." where space is tight (spine, current-book bar, markers, announcements). */
const shortAuthor = name => {
  const people = name.replace(/,?\s*editors?\b.*$/i, '').split(/,\s*|\s+and\s+/).filter(Boolean);
  return people.length > 2 ? `${people[0]} et al.` : name;
};
const initialsOf = name => {
  // Several people in one field ("A, B and C, editors (39 authors)"): use the first person's initials
  const first = name.split(/,|\s+and\s+|\(/)[0];
  const p = first.split(/\s+/).filter(w => /^[A-Za-zÀ-ɏ]/.test(w));
  return p.length ? (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() : '';
};

/** Tidy the CMS output for BOTH views: compose the author line, drop empty author cards,
    swap missing headshots for initials, hide empty buy links, placeholder for missing covers. */
function tidy(el) {
  const authorEl = el.querySelector('.shelf_book-author');
  const a1 = txt(authorEl), a2 = (el.dataset.author2 || '').trim();
  if (authorEl && a2 && !a1.includes(a2)) authorEl.textContent = a1 ? `${a1} and ${a2}` : a2;

  el.querySelectorAll('[data-authors] .shelf_author').forEach(card => {
    const name = txt(card.querySelector('.shelf_author-name'));
    if (!name) { card.remove(); return; }
    // Headshots and employer logos are not used (too many missing); remove any left in the markup
    card.querySelectorAll('.shelf_author-photo, .shelf_author-initials, .shelf_author-logo').forEach(n => n.remove());
  });
  const summary = el.querySelector('.shelf_book-more summary [data-summary-label]');
  if (summary) summary.textContent = el.querySelectorAll('[data-authors] .shelf_author').length > 1 ? 'Details and authors' : 'Details and author';

  // Book page link: the Collection Page link can publish as "#"; rebuild it from the bound slug
  const titleLink = el.querySelector('.shelf_book-title a');
  const slug = (el.dataset.slug || '').trim();
  if (titleLink && slug) {
    const h = titleLink.getAttribute('href');
    // Anything that isn't a real book page ("#", "detail_books", empty) gets /books/<slug>
    if (!h || !/\/books\/[^/#?]+/.test(h)) titleLink.setAttribute('href', `/books/${slug}`);
  }

  // Inline links inside rich text use the site's underlined link class, so they are
  // distinguishable from surrounding text without relying on color (SC 1.4.1)
  el.querySelectorAll('[data-details] a').forEach(a => a.classList.add('text-style-link'));

  const buy = el.querySelector('.shelf_book-buy');
  if (buy) { const h = buy.getAttribute('href'); if (!h || h === '#' || buy.classList.contains('w-dyn-bind-empty')) buy.remove(); }

  const cover = el.querySelector('img.shelf_book-cover');
  if (cover && (cover.classList.contains('w-dyn-bind-empty') || !cover.getAttribute('src'))) {
    const ph = document.createElement('div');
    ph.className = 'shelf_book-cover shelf_cover-placeholder'; ph.setAttribute('aria-hidden', 'true');
    ph.textContent = txt(el.querySelector('.shelf_book-title')) + ' · Coming soon';
    cover.replaceWith(ph);
  }
}

const books = [...document.querySelectorAll('[data-book-list] .shelf_book-item')].map((el, i) => {
  tidy(el);
  const q = s => el.querySelector(s);
  const cover = q('img.shelf_book-cover');
  const buy = q('.shelf_book-buy');
  const titleLink = q('.shelf_book-title a');
  const details = q('[data-details]');
  const pages = parseInt(el.dataset.pages, 10) || parseInt(((details && details.textContent) || '').match(/Print length\s+(\d+)/i)?.[1], 10) || 260;
  return {
    index: i,
    el,
    title: el.dataset.title || txt(q('.shelf_book-title')),
    subtitle: el.dataset.subtitle || txt(q('.shelf_book-subtitle')),
    author: el.dataset.author || txt(q('.shelf_book-author')),
    authorShort: shortAuthor(el.dataset.author || txt(q('.shelf_book-author'))),
    cover: el.dataset.cover || (cover ? cover.getAttribute('src') : ''),
    spineImage: el.dataset.spineImage || '',
    spineColor: (el.dataset.spineColor || '').trim(),
    buy: el.dataset.buy || (buy ? buy.getAttribute('href') : ''),
    url: el.dataset.url || (titleLink ? titleLink.getAttribute('href') : '#'),
    desc: txt(q('[data-desc]')),
    // Thicker books for longer books: 148 pages reads slim, 572 pages reads chunky
    thickness: Math.max(0.16, Math.min(0.4, 0.1 + pages * 0.00052)),
  };
});

/* ==========================================================================
   3. COLOR + CONTRAST HELPERS (SC 1.4.3, 1.4.11)
   ========================================================================== */
const hexToRgb = h => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
function luminance([r, g, b]) {
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const LIGHT = [250, 247, 242], DARK = [23, 20, 15];

/** Given a background color, return { bg, fg } with fg/bg >= target.
    Picks light or dark text, then nudges the background (never the text) until it passes. */
/** Open-book panel colors: always a light tint of the cover with near-black text.
    The tint lightens until the text reaches 7:1, so body text, links and the black
    focus ring all pass on every cover (SC 1.4.3, 1.4.6, 1.4.11). */
const INK = [20, 20, 20];
function lightPair(rgb, target = 7) {
  let bg = rgb.slice();
  for (let i = 0; i < 60 && contrast(INK, bg) < target; i++) bg = mix(bg, [255, 255, 255], 0.05);
  return { bg, fg: INK, ratio: contrast(INK, bg) };
}
function accessiblePair(rgb, target = 4.5) {
  let bg = rgb.slice();
  const useLight = contrast(LIGHT, bg) >= contrast(DARK, bg);
  const fg = useLight ? LIGHT : DARK;
  const toward = useLight ? [0, 0, 0] : [255, 255, 255];
  for (let i = 0; i < 40 && contrast(fg, bg) < target; i++) bg = mix(bg, toward, 0.06);
  return { bg, fg, ratio: contrast(fg, bg) };
}

/** Dominant color: average weighted toward saturated pixels, so a red cover reads as red, not grey. */
function dominantColor(img) {
  const c = document.createElement('canvas'); c.width = c.height = 24;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, 24, 24);
  const d = x.getImageData(0, 0, 24, 24).data;
  let r = 0, g = 0, b = 0, w = 0;
  for (let i = 0; i < d.length; i += 4) {
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    const wt = 0.15 + sat * sat;
    r += d[i] * wt; g += d[i + 1] * wt; b += d[i + 2] * wt; w += wt;
  }
  return [r / w, g / w, b / w];
}

/** Edge color: the average of the cover's spine-side edge, so the spine reads
    as the same printed sheet wrapping around the book. */
function edgeColor(img) {
  const c = document.createElement('canvas'); c.width = 8; c.height = 64;
  const x = c.getContext('2d', { willReadFrequently: true });
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  x.drawImage(img, 0, 0, Math.max(2, w * 0.04), h, 0, 0, 8, 64);   // left 4% of the cover
  const d = x.getImageData(0, 0, 8, 64).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  return [r / n, g / n, b / n];
}
/** Text color for an exact background: whichever of light/dark passes. One of them always clears 4.5:1. */
function textOn(bg) { return contrast(LIGHT, bg) >= contrast(DARK, bg) ? LIGHT : DARK; }

/* ==========================================================================
   4. TEXTURE MAKERS (canvas: spine, generated cover, paper edges)
   ========================================================================== */
const FONT = '"Atkinson Hyperlegible", system-ui, sans-serif';

/** Paper edge: cream with fine page lines */
function paperTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#efe7d6'; x.fillRect(0, 0, 256, 64);
  for (let y = 0; y < 64; y += 2) { x.fillStyle = `rgba(120,100,70,${0.05 + Math.random() * 0.06})`; x.fillRect(0, y, 256, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** One 128px speckle tile, made once and reused by every spine (fast on slow phones) */
let _grain;
function grainTile() {
  if (_grain) return _grain;
  _grain = document.createElement('canvas'); _grain.width = _grain.height = 128;
  const x = _grain.getContext('2d'); const img = x.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() < 0.5 ? 0 : 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 10;   // ~4% alpha
  }
  x.putImageData(img, 0, 0); return _grain;
}

/** Generated cover for books without artwork yet */
function generatedCover(book, aspect = 2 / 3) {
  const H = 1024, W = Math.round(H * aspect);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const base = hexToRgb(book.spineColor || '#0b5d63');
  const { bg, fg } = accessiblePair(base, 7);
  x.fillStyle = rgbToHex(bg); x.fillRect(0, 0, W, H);
  x.fillStyle = rgbToHex(fg); x.textBaseline = 'top';
  x.font = `700 64px ${FONT}`;
  wrapText(x, book.title, 60, 160, W - 120, 74);
  x.font = `400 36px ${FONT}`;
  x.fillText(book.author, 60, H - 180);
  x.font = `700 28px ${FONT}`;
  x.fillText('COMING SOON', 60, H - 110);
  return c;
}
function wrapText(x, text, left, top, maxW, lineH) {
  const words = text.split(' '); let line = '', y = top;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (x.measureText(test).width > maxW && line) { x.fillText(line, left, y); line = w; y += lineH; }
    else line = test;
  }
  x.fillText(line, left, y);
}

/** Spine: a solid wrap in the cover's own edge color (or the CMS Spine Color / Spine Image),
    with a little paper grain, author on the left, title in the middle, mark on the right.
    Drawn landscape, then rotated into the portrait canvas the box face expects. */
function spineTexture(book, coverImg) {
  const L = 2048;                                                  // length along the spine
  const T = Math.max(160, Math.round(L * book.thickness / CONFIG.coverHeight)); // across the spine
  const c = document.createElement('canvas'); c.width = T; c.height = L;
  const x = c.getContext('2d');
  x.translate(T, 0); x.rotate(Math.PI / 2);                        // now draw in landscape: width L, height T

  // 1. Background color: CMS override, else the cover's edge
  let bg;
  if (book.spineColor) bg = hexToRgb(book.spineColor);
  else if (book.spineImgEl) bg = dominantColor(book.spineImgEl);
  else bg = edgeColor(coverImg);
  book.spineRgb = bg;

  if (book.spineImgEl) {
    x.drawImage(book.spineImgEl, 0, 0, L, T);                      // designer-supplied spine art, used as is
  } else {
    x.fillStyle = rgbToHex(bg); x.fillRect(0, 0, L, T);
    // paper grain: a small repeating speckle tile, so it reads as printed board, not flat plastic
    x.fillStyle = x.createPattern(grainTile(), 'repeat'); x.fillRect(0, 0, L, T);
    // soft rounding at the fold edges
    const g = x.createLinearGradient(0, 0, 0, T);
    g.addColorStop(0, 'rgba(0,0,0,.16)'); g.addColorStop(.12, 'rgba(0,0,0,0)');
    g.addColorStop(.88, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.2)');
    x.fillStyle = g; x.fillRect(0, 0, L, T);
  }
  if (book.spineImgEl) { const im = new THREE.CanvasTexture(c); im.colorSpace = THREE.SRGBColorSpace; return im; }

  // 2. Text: exact spine color is kept; text flips light/dark to pass 4.5:1 (SC 1.4.3)
  const fg = rgbToHex(textOn(bg));
  x.fillStyle = fg; x.strokeStyle = fg; x.textBaseline = 'middle';
  const mid = T / 2 + 2, pad = 90;
  const authorShort = book.authorShort.replace(/^Edited by /, '');

  const authorSize = Math.min(64, Math.round(T * 0.24));
  x.font = `400 ${authorSize}px ${FONT}`;
  x.fillText(fitText(x, authorShort, L * 0.3), pad, mid);

  let size = Math.min(84, Math.round(T * 0.32));
  x.font = `700 ${size}px ${FONT}`;
  const maxTitle = L * 0.48;
  while (x.measureText(book.title).width > maxTitle && size > 40) { size -= 2; x.font = `700 ${size}px ${FONT}`; }
  x.fillText(fitText(x, book.title, maxTitle), L * 0.38, mid);

  // 3. Mark: a small open book in a circle, the club's colophon
  const r = Math.min(46, T * 0.2), cx = L - pad - r, cy = mid;
  x.lineWidth = Math.max(4, r * 0.12);
  x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.moveTo(cx - r * .55, cy - r * .25); x.quadraticCurveTo(cx - r * .25, cy - r * .45, cx, cy - r * .2);
  x.quadraticCurveTo(cx + r * .25, cy - r * .45, cx + r * .55, cy - r * .25); x.lineTo(cx + r * .55, cy + r * .4);
  x.quadraticCurveTo(cx + r * .25, cy + r * .2, cx, cy + r * .45); x.quadraticCurveTo(cx - r * .25, cy + r * .2, cx - r * .55, cy + r * .4);
  x.closePath(); x.stroke();
  x.beginPath(); x.moveTo(cx, cy - r * .2); x.lineTo(cx, cy + r * .45); x.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}
function fitText(x, text, maxW) {
  if (x.measureText(text).width <= maxW) return text;
  let t = text; while (t.length > 1 && x.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

/* ==========================================================================
   5. THE SHELF
   ========================================================================== */
class Shelf {
  constructor(section, books) {
    this.section = section;
    // Remember the last input type so programmatic focus only shows a ring for keyboard users
    this.lastInput = 'keyboard';
    document.addEventListener('pointerdown', () => { this.lastInput = 'pointer'; }, true);
    document.addEventListener('keydown', () => { this.lastInput = 'keyboard'; }, true);
    this.books = books;
    this.stage = section.querySelector('.shelf__stage');
    this.canvas = section.querySelector('.shelf__canvas');
    this.statusEl = section.querySelector('[data-status]');
    this.openBtn = section.querySelector('[data-open]');
    this.prevBtn = section.querySelector('[data-prev]');
    this.nextBtn = section.querySelector('[data-next]');
    this.countEl = section.querySelector('.shelf__count');
    this.markersEl = section.querySelector('.shelf__markers');
    this.detail = section.querySelector('.shelf__detail');

    this.current = 0;          // index of the book in the middle
    this.scroll = 0;           // animated position (float)
    this.open = false;         // true when a book is in detail view
    this.t = 0;                // 0 = stack, 1 = detail
    this.active = root.dataset.view === 'shelf';
    this.engaged = false;      // mouse wheel only moves the stack after the visitor clicks into it
    this.hover = -1;
    // Detail view tilt: the open book turns toward the pointer (radians, eased in the frame loop)
    this.tilt = { x: 0, y: 0 };
    this.tiltTarget = { x: 0, y: 0 };
    this.band = { mid: 0, half: 1.5 };   // replaced with measured values in resize()

    this.initRenderer();
    this.buildMarkers();
    this.bindControls();
    this.updateControls({ announce: false });
  }

  /* ----- Renderer, camera, lights ----- */
  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));   // pixel ratio capped at 2
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;   // no tone curve: spines and covers keep their printed colors
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CONFIG.fov, 1, 0.1, 100);

    // Soft key light from the upper left, warm fill from below, like a reading lamp
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3028, 1.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.95); key.position.set(-2, 3, 6); this.scene.add(key);
    // Soft fill from the front and below so the bottom page edge reads as paper when the book tilts
    const fill = new THREE.DirectionalLight(0xfff4e6, 0.6); fill.position.set(0.5, -5, 1.5); this.scene.add(fill);

    this.paper = paperTexture();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.last = performance.now();

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.stage);
    this.resize();
  }

  resize() {
    this.fitStageToStack();
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;   // canvas sits below the instructions row
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Pull the camera back on narrow screens so a whole spine always fits
    const tan = Math.tan(THREE.MathUtils.degToRad(CONFIG.fov / 2));
    this.narrow = w <= 760;
    // Spine fills about half the stage width (85% on phones), but never taller than 7 books of stage
    const share = this.narrow ? 0.68 : 0.46;
    const zForWidth = ((CONFIG.coverHeight / share) / this.camera.aspect) / (2 * tan);
    const zMin = ((7 * 0.24) / 0.8) / (2 * tan);
    this.camera.position.set(0, 0, Math.max(zForWidth, zMin));
    this.visH = 2 * this.camera.position.z * tan;
    // Band the stack may occupy, in world units at the stack's depth (z = 0).
    // Top: 20px below the canvas edge. Bottom: 20px above the control bar. Extra pad covers
    // perspective (books below eye level show their top face) and the current book sliding forward.
    const wpp = this.visH / h;                                   // world units per CSS pixel
    const bar = this.section.querySelector('.shelf__bar');
    const canvasTop = this.canvas.getBoundingClientRect().top;
    const barTopPx = bar ? bar.getBoundingClientRect().top - canvasTop : h - 100;
    const top = this.visH / 2 - 20 * wpp;
    const bottom = this.visH / 2 - (barTopPx - 20) * wpp;
    const pad = 0.22;                                            // room for the current book sliding toward the camera
    this.band = { mid: (top + bottom) / 2, half: Math.max(0.3, (top - bottom) / 2 - pad) };
    this.camera.updateProjectionMatrix();
  }

  /* Phones: make the stage tall enough to show every book at once.
     At phone widths the camera sizes each spine to 68% of the width, so pixels per world unit is
     known from the width alone; the stage height is the stack in pixels plus room for the
     instructions row above and the control bar below. Desktop keeps the scrolling stack. */
  fitStageToStack() {
    const sw = this.stage.clientWidth;
    if (sw > 760 || !this.stackHeight) { this.stage.style.removeProperty('--stage-h'); return; }
    const ppu = (sw * 0.68) / CONFIG.coverHeight;                    // CSS px per world unit
    const bar = this.section.querySelector('.shelf__bar');
    const barH = bar ? bar.offsetHeight : 64;
    const instructionsH = 52;                                         // 3.25rem row above the canvas
    const pad = 0.7;                                                  // world units: perspective faces + current book sliding forward
    const need = Math.ceil((this.stackHeight + pad) * ppu + instructionsH + 20 + barH + 40);
    const current = parseFloat(this.stage.style.getPropertyValue('--stage-h')) || 0;
    if (Math.abs(current - need) > 2) this.stage.style.setProperty('--stage-h', need + 'px');   // guard: no resize loop
  }

  /* ----- Load covers and build one mesh per book ----- */
  async build() {
    await document.fonts.load(`700 40px ${FONT}`).catch(() => {});
    const loadImg = src => new Promise((res, rej) => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => res(im); im.onerror = rej; im.src = src;
    });

    await Promise.all(this.books.map(async (book, i) => {
      // Cover: real image or generated
      let coverSrc;
      try { coverSrc = book.cover ? await loadImg(book.cover) : generatedCover(book); }
      catch (e) { coverSrc = generatedCover(book); }
      if (book.spineImage) { try { book.spineImgEl = await loadImg(book.spineImage); } catch (e) {} }

      const aspect = (coverSrc.naturalWidth || coverSrc.width) / (coverSrc.naturalHeight || coverSrc.height);
      const coverTex = new THREE.Texture(coverSrc); coverTex.colorSpace = THREE.SRGBColorSpace; coverTex.anisotropy = 8; coverTex.needsUpdate = true;

      // Detail panel colors from the cover's dominant color, checked to 4.5:1
      book.pair = lightPair(dominantColor(coverSrc));

      const mat = (opts) => new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0, ...opts }); // matte printed board
      const paperMat = mat({ map: this.paper, roughness: 0.9 });
      const printed = map => new THREE.MeshBasicMaterial({ map });   // unlit: true colors, no gray cast
      const spineMat = printed(spineTexture(book, coverSrc));
      // We don't design the back cover: it's a plain wrap in the spine color
      const backMat = mat({ color: new THREE.Color().setRGB(...book.spineRgb.map(v => v / 255), THREE.SRGBColorSpace) });
      // Box faces: +x page edge, -x spine, +y/-y page edges, +z front cover, -z back cover
      const materials = [
        paperMat,
        spineMat,
        paperMat, paperMat,
        printed(coverTex),
        backMat,
      ];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materials);
      mesh.scale.set(CONFIG.coverHeight * aspect, CONFIG.coverHeight, book.thickness);
      mesh.userData.index = i;
      // a little hand-placed wobble so the stack doesn't look machine-made
      book.jitter = { x: (Math.random() - 0.5) * 0.08, r: (Math.random() - 0.5) * 0.035 };
      book.mesh = mesh;
      this.scene.add(mesh);
    }));

    this.meshes = this.books.map(b => b.mesh);
    this.layout(); this.resize();
    this.section.classList.add('is-ready');
    this.ready = true;
    this.loop();
  }

  /* ----- Stack layout: each book sits on the one below, gaps included ----- */
  layout() {
    let y = 0;
    this.centers = this.books.map(b => { const c = y + b.thickness / 2; y += b.thickness + CONFIG.gap; return c; });
    this.stackHeight = y - CONFIG.gap;
  }

  /* ----- Poses ----- */
  // Stack: lying flat, spine toward the camera
  stackPose(book, i, out) {
    const n = this.books.length;
    // Short stacks stay centered and still; long stacks follow the current book
    // The stack scrolls to keep the current book centered, clamped so the frame never shows empty space
    // past the first or last book once the stack is taller than the frame
    const lo = Math.floor(this.scroll), hi = Math.min(n - 1, lo + 1), f = this.scroll - lo;
    let center = this.centers[lo] + (this.centers[hi] - this.centers[lo]) * f;
    // Usable band: from just under the top edge to just above the control bar (measured in resize()).
    // Clamp so the first and last books land fully inside that band, with padding, never under the bar.
    const { mid, half } = this.band;
    if (this.stackHeight > half * 2) center = Math.max(half, Math.min(this.stackHeight - half, center));
    else center = this.stackHeight / 2;
    const pull = Math.max(0, 1 - Math.abs(i - this.scroll));          // 1 for the current book, eased between
    const hover = i === this.hover && !this.open && i !== this.current ? 1 : 0;
    out.pos.set(
      book.jitter.x + pull * (this.narrow ? 0.1 : 0.3) + hover * 0.08,  // current book slides out to the right (less on phones so it stays in frame)
      mid - (this.centers[i] - center),                                // centered in the band above the control bar
      pull * 0.15 + hover * 0.05
    );
    out.quat.setFromEuler(new THREE.Euler(0, Math.PI / 2, Math.PI / 2 + book.jitter.r, 'ZYX'));
    return out;
  }
  // Detail: upright, cover forward, turned slightly so the spine shows
  detailPose(book, out) {
    // Place the book at the depth where its cover fills ~62% of the frame height (70% on phones)
    const tan = Math.tan(THREE.MathUtils.degToRad(CONFIG.fov / 2));
    const dist = (CONFIG.coverHeight / (this.narrow ? 0.7 : 0.62)) / (2 * tan);
    const z = this.camera.position.z - dist;
    const visH = 2 * dist * tan;
    const visW = visH * this.camera.aspect;
    out.pos.set(this.narrow ? 0 : -visW * 0.22, this.narrow ? 0.05 : 0, z);
    out.quat.setFromEuler(new THREE.Euler(-0.14 + this.tilt.x, 0.5 + this.tilt.y, 0.02));
    return out;
  }

  /* ----- Frame loop ----- */
  loop() {
    const pose = () => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion() });
    const a = pose(), b = pose();
    const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // easeInOutCubic

    const tick = () => {
      requestAnimationFrame(tick);
      if (!this.active || document.hidden) return;   // don't burn battery in list view
      const now = performance.now(); const dt = Math.min((now - this.last) / 1000, 0.1); this.last = now;

      // Scroll glides toward the current book (instant under reduced motion)
      const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 9);
      this.scroll += (this.current - this.scroll) * k;

      // Open / close progress
      const target = this.open ? 1 : 0;
      if (reduceMotion) this.t = target;
      else this.t += Math.sign(target - this.t) * Math.min(Math.abs(target - this.t), dt / CONFIG.openDuration);
      const e = ease(this.t);

      // Tilt eases toward the pointer target. Off under reduced motion (SC 2.3.3).
      const tk = reduceMotion ? 1 : 1 - Math.exp(-dt * 5);
      const tx = reduceMotion || !this.open ? 0 : this.tiltTarget.x;
      const ty = reduceMotion || !this.open ? 0 : this.tiltTarget.y;
      this.tilt.x += (tx - this.tilt.x) * tk;
      this.tilt.y += (ty - this.tilt.y) * tk;

      // Open sequence stages follow the book: color once it's past halfway, text once it has landed
      if (this.open) {
        if (this.t >= 0.55) this.section.classList.add('is-colored');
        if (this.t >= 1) this.section.classList.add('is-revealed');
      }

      this.books.forEach((book, i) => {
        this.stackPose(book, i, a);
        if (i === this.current) {
          this.detailPose(book, b);
          a.pos.lerp(b.pos, e);
          a.quat.slerp(b.quat, e);
        } else {
          // others slide out above and below
          a.pos.y += Math.sign(i - this.current) * -e * this.visH * 1.6;   // well clear of the frame
        }
        // ease toward the target pose so hover lifts are smooth
        const m = book.mesh, s = reduceMotion ? 1 : 1 - Math.exp(-dt * 14);
        m.position.lerp(a.pos, i === this.current && this.t > 0 && this.t < 1 ? 1 : s);
        m.quaternion.slerp(a.quat, i === this.current && this.t > 0 && this.t < 1 ? 1 : s);
        // Once a book is open, only that book is drawn (no neighbors peeking in on short phone stages)
        m.visible = i === this.current || e < 0.98;
      });

      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  /* ----- HTML controls ----- */
  buildMarkers() {
    this.markers = this.books.map((book, i) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', `${book.title} by ${book.authorShort}`);
      btn.addEventListener('click', () => this.goTo(i, { focusMarker: true }));
      li.append(btn); this.markersEl.append(li);
      return btn;
    });
  }

  bindControls() {
    // Prev / Next use aria-disabled at the ends so focus is never lost
    this.prevBtn.addEventListener('click', () => this.goTo(this.current - 1));
    this.nextBtn.addEventListener('click', () => this.goTo(this.current + 1));
    this.openBtn.addEventListener('click', () => this.openBook());
    this.section.querySelector('[data-back]').addEventListener('click', () => this.closeBook());

    // Keyboard: arrows, Home/End move the stack; Enter opens via the button; Escape closes
    this.section.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.open) { e.preventDefault(); this.closeBook(); return; }
      if (this.open) return;
      const onMarker = this.markers.includes(document.activeElement);
      const map = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      if (e.key in map) { e.preventDefault(); this.goTo(this.current + map[e.key], { focusMarker: onMarker }); }
      else if (e.key === 'Home') { e.preventDefault(); this.goTo(0, { focusMarker: onMarker }); }
      else if (e.key === 'End') { e.preventDefault(); this.goTo(this.books.length - 1, { focusMarker: onMarker }); }
    });

    // Pointer: hover, click to select/open, drag to browse
    let down = null;
    this.canvas.addEventListener('pointerdown', e => {
      this.engaged = true;
      down = { x: e.clientX, y: e.clientY, start: this.current, type: e.pointerType, moved: false };
    });
    this.canvas.addEventListener('pointermove', e => {
      this.setPointer(e);
      const hit = this.open ? -1 : this.pick();
      if (hit !== this.hover) { this.hover = hit; this.canvas.classList.toggle('is-hovering', hit >= 0); }
      // Touch in detail view: a sideways drag turns the book (vertical drags still scroll the page)
      if (this.open && down && down.type === 'touch') {
        this.tiltTarget.y = Math.max(-0.4, Math.min(0.4, (e.clientX - down.x) / 160 * 0.4));
        return;
      }
      if (!down || this.open) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      // Touch: horizontal swipe only (vertical stays page scroll). Mouse: vertical drag.
      const delta = down.type === 'touch' ? -dx : dy;
      const stepPx = down.type === 'touch' ? 60 : 40;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) down.moved = true;
      const idx = Math.max(0, Math.min(this.books.length - 1, down.start + Math.round(-delta / stepPx) * (down.type === 'touch' ? -1 : 1)));
      if (idx !== this.current) this.goTo(idx);
    });
    const end = e => {
      if (down && !down.moved && !this.open) {
        this.setPointer(e);
        const hit = this.pick();
        if (hit >= 0) { if (hit === this.current) this.openBook(); else this.goTo(hit); }
      }
      down = null;
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', () => { down = null; });
    // Mouse or pen in detail view: the book turns to face the pointer, anywhere over the open section.
    // Pointer right of the book shows more spine, pointer below shows the top edge, above shows the bottom.
    this.section.addEventListener('pointermove', e => {
      if (!this.open || e.pointerType === 'touch' || !this.meshes) return;
      this.setPointer(e);
      const c = this.books[this.current].mesh.position.clone().project(this.camera);   // book center in screen space
      const dx = Math.max(-1, Math.min(1, (this.pointer.x - c.x) / 0.7));
      const dy = Math.max(-1, Math.min(1, (this.pointer.y - c.y) / 0.7));
      this.tiltTarget.y = dx * 0.42;                                 // yaw range about 0.08 to 0.92 rad, never past the spine
      this.tiltTarget.x = Math.max(-0.2, Math.min(0.16, -dy * 0.24));  // with the base angle, the bottom edge shows most of the time
    });
    this.section.addEventListener('pointerleave', () => { this.tiltTarget.x = 0; this.tiltTarget.y = 0; });
    this.canvas.addEventListener('pointerleave', () => { this.hover = -1; this.engaged = false; this.canvas.classList.remove('is-hovering'); });

    // Wheel / trackpad over the stage moves through the books. At the first or last book the wheel
    // goes back to the page, so the stage is never a scroll trap (SC 2.1.2).
    let wheelAcc = 0, wheelLock = 0;
    this.canvas.addEventListener('wheel', e => {
      if (this.open) return;
      const dir = Math.sign(e.deltaY);
      const atEnd = (dir > 0 && this.current === this.books.length - 1) || (dir < 0 && this.current === 0);
      if (atEnd) return;               // let the page scroll
      e.preventDefault();
      wheelAcc += e.deltaY;
      const now = performance.now();
      if (Math.abs(wheelAcc) > 40 && now > wheelLock) { this.goTo(this.current + dir); wheelAcc = 0; wheelLock = now + 140; }
    }, { passive: false });
  }

  setPointer(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  pick() {
    if (!this.meshes) return -1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.meshes)[0];
    return hit ? hit.object.userData.index : -1;
  }

  goTo(i, { focusMarker = false } = {}) {
    if (this.open) return;
    const next = Math.max(0, Math.min(this.books.length - 1, i));
    if (next === this.current && !focusMarker) return;
    this.current = next;
    this.updateControls({ announce: !focusMarker });
    if (focusMarker) this.markers[next].focus();
  }

  updateControls({ announce = true } = {}) {
    const book = this.books[this.current];
    const n = this.books.length;
    this.openBtn.querySelector('.shelf__open-title').textContent = book.title;
    this.openBtn.querySelector('.shelf__open-author').textContent = book.authorShort;
    this.countEl.textContent = `${this.current + 1} of ${n}`;
    this.prevBtn.setAttribute('aria-disabled', String(this.current === 0));
    this.nextBtn.setAttribute('aria-disabled', String(this.current === n - 1));
    // Roving tabindex: one tab stop for all markers
    this.markers.forEach((m, i) => {
      m.tabIndex = i === this.current ? 0 : -1;
      if (i === this.current) m.setAttribute('aria-current', 'true'); else m.removeAttribute('aria-current');
    });
    if (announce) this.announce(`${book.title} by ${book.authorShort}, ${this.current + 1} of ${n}`);
  }

  // Debounced so holding an arrow key doesn't flood the screen reader
  announce(text) {
    clearTimeout(this._announceT);
    this._announceT = setTimeout(() => { this.statusEl.textContent = text; }, 350);
  }

  /* ----- Detail view ----- */
  openBook() {
    if (this.open) return;
    const book = this.books[this.current];
    const d = this.detail;
    d.querySelector('.detail__title').textContent = book.title;
    const sub = d.querySelector('.detail__subtitle'); sub.textContent = book.subtitle; sub.hidden = !book.subtitle;
    const edited = /,\s*editors?\b/i.test(book.author);
    d.querySelector('.detail__author').textContent = book.author.startsWith('Edited') ? book.author
      : edited ? `Edited by ${book.author.replace(/,\s*editors?\b\s*/i, ' ').replace(/\s+/g, ' ').trim()}`
      : `By ${book.author}`;
    d.querySelector('.detail__desc').textContent = book.desc;
    const buy = d.querySelector('[data-detail-buy]');
    buy.hidden = !book.buy; buy.href = book.buy || '#';
    buy.innerHTML = `Buy on Amazon<span class="sr-only">: ${escapeHtml(book.title)}</span>`;
    // Facts and author cards are copied from the book's own list item (the CMS is the source)
    const facts = book.el.querySelector('[data-details]');
    d.querySelector('[data-detail-facts]').innerHTML = facts ? facts.innerHTML : '';
    const authors = [...book.el.querySelectorAll('[data-authors] .shelf_author')];
    const holder = d.querySelector('[data-detail-authors]');
    holder.replaceChildren(...authors.map(a => a.cloneNode(true)));
    const heading = d.querySelector('[data-detail-authors-heading]');
    heading.hidden = !authors.length;
    heading.textContent = authors.length > 1 ? 'About the authors' : 'About the author';
    const more = d.querySelector('[data-detail-more]');
    more.href = book.url;
    more.innerHTML = `About this book<span class="sr-only">: ${escapeHtml(book.title)}</span>`;

    // Section takes the cover's color; pair is pre-checked to 4.5:1
    // Applied by the .is-colored stage, not right away
    this.section.style.setProperty('--open-bg', rgbToHex(book.pair.bg));
    this.section.style.setProperty('--open-fg', rgbToHex(book.pair.fg));
    // Safety net: if frames stall (background tab, GPU hiccup), still show everything
    clearTimeout(this._revealT);
    this._revealT = setTimeout(() => { if (this.open) this.section.classList.add('is-colored', 'is-revealed'); }, 2500);

    this.open = true; this.hover = -1;
    this.section.classList.add('is-open');
    d.hidden = false;
    // Desktop: if the panel is taller than the stage, the stage grows (no inner scroll box to get lost in)
    if (!this.narrow) {
      const extra = d.scrollHeight - this.stage.clientHeight;
      if (extra > 0) this.section.style.paddingBottom = extra + 'px';
    }
    const title = d.querySelector('.detail__title');
    if (this.lastInput === 'pointer') {
      title.setAttribute('data-pointer-focus', '');
      // A keypress after a mouse open means the visitor switched to keyboard: show the ring again
      const showRing = () => title.removeAttribute('data-pointer-focus');
      title.addEventListener('keydown', showRing, { once: true });
      title.addEventListener('blur', showRing, { once: true });
    } else {
      title.removeAttribute('data-pointer-focus');
    }
    title.focus({ preventScroll: true });   // focus moves to the heading of what just opened
    this.statusEl.textContent = '';
  }

  closeBook() {
    if (!this.open) return;
    this.open = false;
    this.tiltTarget.x = 0; this.tiltTarget.y = 0;
    this.detail.hidden = true;
    this.section.style.paddingBottom = '';
    clearTimeout(this._revealT);
    this.section.classList.remove('is-open', 'is-colored', 'is-revealed');
    ['--open-bg', '--open-fg'].forEach(p => this.section.style.removeProperty(p));
    this.openBtn.focus();                         // focus returns to where the visitor was
  }

  setActive(on) { this.active = on; if (on) { this.last = performance.now(); this.resize(); } }
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ==========================================================================
   6. BOOT
   ========================================================================== */
if (root.dataset.webgl === 'yes' && books.length) {
  const section = document.getElementById('shelf');
  // Safety net: if the scene never arrives (CDN down, GPU error), fall back to the list for this visit
  const fallback = setTimeout(() => {
    if (!shelf?.ready) { root.dataset.webgl = 'no'; setView('list', { save: false }); }
  }, CONFIG.fallbackTimeoutMs);
  try {
    shelf = new Shelf(section, books);
    await shelf.build();
    clearTimeout(fallback);
    window.__shelf = shelf; // handy for testing in the console
  } catch (err) {
    console.error('Shelf failed, showing list', err);
    clearTimeout(fallback);
    root.dataset.webgl = 'no';
    setView('list', { save: false });
  }
}
