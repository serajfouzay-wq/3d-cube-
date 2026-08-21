import { WORLDS, BRAND, LOCALES, SURFACE } from '../core/config.js';
import { store } from '../core/store.js';
import { bus, EV } from '../core/bus.js';
import { t, stat, setLocale, getLocale, applyDOM } from '../i18n/i18n.js';

const CLASS_KEY = {
  [SURFACE.GAS]: 'classes.gas',
  [SURFACE.TERRA]: 'classes.terra',
  [SURFACE.OCEAN]: 'classes.ocean',
  [SURFACE.MACHINE]: 'classes.machine',
  [SURFACE.ICE]: 'classes.ice',
};

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  HUD — all DOM chrome
 * ═══════════════════════════════════════════════════════════════════════
 *  Builds the world index and the language switcher from config (so adding a
 *  sixth world or a fifth language requires no markup), then subscribes to the
 *  bus. It never reaches into the 3D layer; it only emits intent and reacts to
 *  state, which is what makes the two halves independently replaceable.
 */
export class HUD {
  constructor({ onSelect, onRelease, onMuteToggle }) {
    this.onSelect = onSelect;
    this.onRelease = onRelease;
    this.onMuteToggle = onMuteToggle;

    this.el = {
      index:      document.getElementById('world-index'),
      dossier:    document.getElementById('dossier'),
      dName:      document.querySelector('[data-dossier="name"]'),
      dCode:      document.querySelector('[data-dossier="code"]'),
      dEpithet:   document.querySelector('[data-dossier="epithet"]'),
      dBrief:     document.querySelector('[data-dossier="brief"]'),
      dClass:     document.querySelector('[data-dossier="class"]'),
      dStats:     document.querySelector('[data-dossier="stats"]'),
      dArt:       document.querySelector('[data-dossier="art"]'),
      dLock:      document.querySelector('[data-dossier="lock"]'),
      dLockLabel: document.querySelector('[data-dossier="lock-label"]'),
      langWrap:   document.getElementById('lang-switch'),
      audioBtn:   document.getElementById('audio-toggle'),
      menuBtn:    document.getElementById('menu-toggle'),
      menu:       document.getElementById('menu'),
      brandName:  document.querySelector('[data-brand="name"]'),
      brandVer:   document.querySelector('[data-brand="version"]'),
      brandYear:  document.querySelector('[data-brand="year"]'),
      scanBar:    document.getElementById('scan-bar'),
      hint:       document.getElementById('hint'),
    };

    this._buildIndex();
    this._buildLanguages();
    this._bindControls();
    this._subscribe();

    this.el.brandName.textContent = BRAND.name;
    this.el.brandVer.textContent = BRAND.version;
    this.el.brandYear.textContent = String(BRAND.year);

    this.retranslate();
  }

  /* ── Construction ─────────────────────────────────────────────────── */

  _buildIndex() {
    this.indexItems = WORLDS.map((cfg, i) => {
      const li = document.createElement('li');
      li.className = 'world-index__item';
      li.style.setProperty('--world-accent', cfg.palette.accent);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'world-index__btn';
      btn.dataset.cursor = 'link';
      btn.innerHTML = `
        <span class="world-index__marker" aria-hidden="true"></span>
        <span class="world-index__num">${String(i + 1).padStart(2, '0')}</span>
        <span class="world-index__label">
          <span class="world-index__name"></span>
          <span class="world-index__epithet"></span>
        </span>
      `;
      btn.addEventListener('click', () => this.onSelect?.(i));
      btn.addEventListener('pointerenter', () => bus.emit(EV.UI_SOUND, { id: 'hover' }));

      li.appendChild(btn);
      this.el.index.appendChild(li);

      return {
        li, btn,
        name: btn.querySelector('.world-index__name'),
        epithet: btn.querySelector('.world-index__epithet'),
      };
    });
  }

  _buildLanguages() {
    this.langButtons = LOCALES.map((loc) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lang-switch__btn';
      b.dataset.locale = loc.code;
      b.dataset.cursor = 'link';
      b.textContent = loc.short;
      b.title = loc.label;
      b.setAttribute('lang', loc.code);
      b.addEventListener('click', () => {
        if (getLocale() === loc.code) return;
        setLocale(loc.code);
        bus.emit(EV.UI_SOUND, { id: 'toggle' });
      });
      this.el.langWrap.appendChild(b);
      return b;
    });
    this._syncLanguages();
  }

  _syncLanguages() {
    const active = getLocale();
    this.langButtons.forEach((b) => {
      const on = b.dataset.locale === active;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  _bindControls() {
    this.el.audioBtn.addEventListener('click', () => {
      const muted = this.onMuteToggle?.();
      this.el.audioBtn.classList.toggle('is-muted', !!muted);
      this.el.audioBtn.setAttribute('aria-label', t(muted ? 'hud.unmute' : 'hud.mute'));
    });

    this.el.menuBtn.addEventListener('click', () => this.setMenu(!store.menuOpen));
    this.el.menu.querySelectorAll('[data-menu-close]').forEach((b) =>
      b.addEventListener('click', () => this.setMenu(false)));

    document.querySelectorAll('[data-action="release"]').forEach((b) =>
      b.addEventListener('click', () => this.onRelease?.()));

    // Hovering any interactive chrome plays the same cue as hovering a world.
    document.querySelectorAll('[data-cursor]').forEach((el) =>
      el.addEventListener('pointerenter', () => bus.emit(EV.UI_SOUND, { id: 'hover' })));

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && store.menuOpen) this.setMenu(false);
    });
  }

  _subscribe() {
    bus.on(EV.VIEW, () => this._syncView());
    bus.on(EV.HOVER, ({ index }) => this._syncHover(index));
    bus.on(EV.LOCALE, () => this.retranslate());
    bus.on(EV.SCAN_PROGRESS, ({ t: p }) => this._syncScan(p));
    bus.on(EV.SCAN_CANCEL, () => this._syncScan(0));
    bus.on(EV.SCAN_DONE, ({ index }) => {
      this._syncScan(0);
      if (store.focusIndex === index) this.renderDossier(index);
      this.indexItems[index]?.li.classList.add('is-scanned');
    });
  }

  /* ── State sync ───────────────────────────────────────────────────── */

  setMenu(open) {
    store.menuOpen = open;
    this.el.menu.classList.toggle('is-open', open);
    this.el.menu.setAttribute('aria-hidden', String(!open));
    this.el.menuBtn.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('menu-open', open);
    bus.emit(EV.MENU, { open });
    bus.emit(EV.UI_SOUND, { id: 'toggle' });
  }

  _syncHover(index) {
    this.indexItems.forEach((item, i) =>
      item.li.classList.toggle('is-hovered', i === index));
  }

  _syncView() {
    const focused = store.view === 'focus';
    document.body.classList.toggle('is-focused', focused);
    this.indexItems.forEach((item, i) =>
      item.li.classList.toggle('is-active', focused && store.focusIndex === i));

    this.el.dossier.classList.toggle('is-open', focused);
    this.el.dossier.setAttribute('aria-hidden', String(!focused));
    if (focused) this.renderDossier(store.focusIndex);
  }

  _syncScan(p) {
    this.el.scanBar.style.setProperty('--scan', String(p));
    this.el.scanBar.classList.toggle('is-active', p > 0.001);
  }

  /* ── Dossier ──────────────────────────────────────────────────────── */

  renderDossier(index) {
    const cfg = WORLDS[index];
    if (!cfg) return;

    const unlocked = store.scanned.has(index);
    const name = t(`worlds.${cfg.id}.name`, null, cfg.name);

    this.el.dossier.style.setProperty('--world-accent', cfg.palette.accent);
    this.el.dossier.style.setProperty('--world-atmo', cfg.palette.atmo);
    this.el.dName.textContent = name;
    this.el.dCode.textContent = cfg.code;
    this.el.dEpithet.textContent = t(`worlds.${cfg.id}.epithet`);
    this.el.dBrief.textContent = t(`worlds.${cfg.id}.brief`);
    this.el.dClass.textContent = t(CLASS_KEY[cfg.surface.type] || 'classes.terra');

    // Stats are the scan reward — locked until the world has been surveyed.
    // Status line always shows state; the badge is the call to action, so it
    // is only meaningful while the world is still locked.
    this.el.dossier.classList.toggle('is-unlocked', unlocked);
    this.el.dLockLabel.textContent = t(unlocked ? 'panel.unlocked' : 'panel.locked');
    this.el.dLock.textContent = t('panel.scan');
    this.el.dLock.hidden = unlocked;

    const rows = [
      ['panel.period',   stat('period', cfg.stats.period)],
      ['panel.gravity',  stat('gravity', cfg.stats.gravity)],
      ['panel.moons',    stat('moons', cfg.stats.moons)],
      ['panel.temp',     stat('temp', cfg.stats.temp)],
      ['panel.diameter', stat('diameter', cfg.stats.diameter)],
    ];
    this.el.dStats.innerHTML = rows.map(([key, value]) => `
      <div class="stat">
        <dt class="stat__key">${t(key)}</dt>
        <dd class="stat__value">${unlocked ? value : '••••'}</dd>
      </div>
    `).join('');

    // Dossier art is lazy — these plates are multi-megabyte and most visitors
    // will never open every world.
    if (cfg.art) {
      this.el.dArt.hidden = false;
      if (this.el.dArt.dataset.src !== cfg.art) {
        this.el.dArt.dataset.src = cfg.art;
        this.el.dArt.style.backgroundImage = '';
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          if (this.el.dArt.dataset.src !== cfg.art) return;   // focus changed
          this.el.dArt.style.backgroundImage = `url("${cfg.art}")`;
          this.el.dArt.classList.add('is-loaded');
        };
        img.onerror = () => { this.el.dArt.hidden = true; };
        img.src = cfg.art;
      }
    } else {
      this.el.dArt.hidden = true;
    }
    this.el.dArt.setAttribute('aria-label', name);
  }

  /* ── Localisation ─────────────────────────────────────────────────── */

  /** Called on every locale change: static strings, lists, and the dossier. */
  retranslate() {
    applyDOM();
    this._syncLanguages();

    this.indexItems.forEach((item, i) => {
      const cfg = WORLDS[i];
      item.name.textContent = t(`worlds.${cfg.id}.name`, null, cfg.name);
      item.epithet.textContent = t(`worlds.${cfg.id}.epithet`);
      item.btn.setAttribute('aria-label', t(`worlds.${cfg.id}.name`, null, cfg.name));
    });

    this.el.audioBtn.setAttribute('aria-label', t(store.muted ? 'hud.unmute' : 'hud.mute'));
    if (store.view === 'focus') this.renderDossier(store.focusIndex);
  }
}
