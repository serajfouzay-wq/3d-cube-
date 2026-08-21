import { bus, EV } from '../core/bus.js';
import { store } from '../core/store.js';
import { LOCALES } from '../core/config.js';

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  Localisation engine
 * ═══════════════════════════════════════════════════════════════════════
 *  Design notes:
 *  • Dictionaries are flat-ish nested objects; keys are resolved by dot path.
 *  • Every lookup falls back through: active locale → 'en' → the supplied
 *    default → the key itself. A missing translation degrades, never breaks.
 *  • DOM binding is declarative via data-i18n attributes, so adding a string
 *    to the HUD never requires touching this file.
 *  • The 3D layer never renders glyphs itself — world labels are HTML
 *    overlays projected onto screen space. That is a deliberate choice: it
 *    means Arabic shaping and CJK glyph coverage are handled by the browser's
 *    text stack instead of a baked SDF font atlas, so switching language
 *    cannot produce tofu or broken ligatures in the scene.
 */

const dictionaries = new Map();
let active = 'en';

export function register(code, dict) {
  dictionaries.set(code, dict);
}

function resolve(dict, path) {
  if (!dict) return undefined;
  let node = dict;
  for (const part of path.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return typeof node === 'string' || typeof node === 'number' ? node : undefined;
}

/** Replaces {name} style placeholders. */
function interpolate(str, params) {
  if (!params) return str;
  return String(str).replace(/\{(\w+)\}/g, (m, k) =>
    params[k] !== undefined ? params[k] : m);
}

export function t(key, params, fallback) {
  const hit =
    resolve(dictionaries.get(active), key) ??
    resolve(dictionaries.get('en'), key) ??
    fallback ??
    key;
  return interpolate(hit, params);
}

/** True when the key exists in the active or fallback dictionary. */
export function has(key) {
  return resolve(dictionaries.get(active), key) !== undefined ||
         resolve(dictionaries.get('en'), key) !== undefined;
}

export const getLocale = () => active;
export const getMeta = (code = active) =>
  LOCALES.find((l) => l.code === code) || LOCALES[0];
export const getDir = () => getMeta().dir;

/* ── Locale-aware number + unit formatting ────────────────────────────── */

const numberCache = new Map();
function formatter(opts) {
  const key = active + JSON.stringify(opts);
  if (!numberCache.has(key)) {
    numberCache.set(key, new Intl.NumberFormat(active, opts));
  }
  return numberCache.get(key);
}

export const num = (value, opts = {}) => formatter(opts).format(value);

/** Formats a stat value with its localised unit, e.g. "1.34 g" / "1٫34 ج". */
export function stat(kind, value) {
  switch (kind) {
    case 'period':   return t('units.days',     { value: num(value) });
    case 'gravity':  return t('units.gravity',  { value: num(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
    case 'moons':    return num(value);
    case 'temp':     return t('units.kelvin',   { value: num(value) });
    case 'diameter': return t('units.km',       { value: num(value) });
    default:         return num(value);
  }
}

/* ── DOM binding ──────────────────────────────────────────────────────── */

/**
 * Applies translations to every [data-i18n] node under `root`.
 *   data-i18n="hud.worlds"                → textContent
 *   data-i18n-attr="aria-label:hud.mute"  → attribute (comma separated pairs)
 *   data-i18n-html="legal.copy"           → innerHTML (trusted dictionary only)
 */
export function applyDOM(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(',')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });
}

export function setLocale(code, { silent = false } = {}) {
  const meta = LOCALES.find((l) => l.code === code);
  if (!meta) return false;

  active = code;
  store.locale = code;
  numberCache.clear();

  const html = document.documentElement;
  html.lang = code;
  html.dir = meta.dir;
  html.dataset.font = meta.font;      // swaps the font stack in CSS
  html.dataset.locale = code;

  try { localStorage.setItem('aetherion.locale', code); } catch { /* private mode */ }

  applyDOM();
  if (!silent) bus.emit(EV.LOCALE, { locale: code, dir: meta.dir, meta });
  return true;
}

/** Picks the best starting locale: saved → browser → English. */
export function detectLocale() {
  let saved = null;
  try { saved = localStorage.getItem('aetherion.locale'); } catch { /* ignore */ }
  if (saved && LOCALES.some((l) => l.code === saved)) return saved;

  for (const nav of navigator.languages || [navigator.language || 'en']) {
    const base = String(nav).toLowerCase().split('-')[0];
    if (LOCALES.some((l) => l.code === base)) return base;
  }
  return 'en';
}

export async function initI18n() {
  const modules = await Promise.all(
    LOCALES.map((l) => import(`./locales/${l.code}.js`).then((m) => [l.code, m.default]))
  );
  for (const [code, dict] of modules) register(code, dict);
  setLocale(detectLocale(), { silent: true });
}
