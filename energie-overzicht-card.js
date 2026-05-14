/**
 * energie-overzicht-card
 * ─────────────────────────────────────────────────────────────────────────────
 * Installatie:
 *   1. Kopieer naar /config/www/energie-overzicht-card.js
 *   2. Instellingen → Dashboards → ⋮ → Bronnen beheren → Toevoegen:
 *        URL:  /local/energie-overzicht-card.js
 *        Type: JavaScript module
 *   3. Herlaad browser (Ctrl+Shift+R)
 *   4. Kaart toevoegen → zoek "Energie Overzicht"
 *
 * Berekeningen:
 *   solar_used  = solar_production - solar_return   (solar direct gebruikt thuis)
 *   total_use   = grid_consume + solar_used          (totaal verbruik thuis)
 *   pct_solar   = solar_used / total_use * 100       (% van solar in verbruik)
 *   pct_grid    = grid_consume / total_use * 100     (% van grid in verbruik)
 *   selfpct     = solar_used / total_use * 100       (zelfvoorzieningsgraad)
 *   eigen_pct   = solar_used / solar_production * 100
 *   return_pct  = solar_return / solar_production * 100
 *
 * Configuratie (YAML):
 *   type: custom:energie-overzicht-card
 *   unit: kW                          # kW of W (standaard kW)
 *   max_solar: 8                      # max verwachte solar productie (kW/W) voor arc schaal
 *   entities:
 *     grid_consume:       sensor.dsmr_reading_electricity_currently_delivered
 *     solar_production:   sensor.p1_solar_production
 *     solar_return:       sensor.dsmr_reading_electricity_currently_returned
 */

const DEFAULT_CFG = {
  unit: 'kW',
  max_solar: 8,
  entities: {
    grid_consume:     'sensor.dsmr_reading_electricity_currently_delivered',
    solar_production: 'sensor.p1_solar_production',
    solar_return:     'sensor.dsmr_reading_electricity_currently_returned',
  },
};

const C_GREEN  = '#639922';
const C_BLUE   = '#378ADD';
const C_ORANGE = '#BA7517';
const C_TRACK  = 'rgba(128,128,128,0.15)';

// ── SVG arc helpers ───────────────────────────────────────────────────────────
function polar(cx, cy, r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}
function arcPath(cx, cy, r, a1, a2) {
  if (a2 - a1 >= 359.99) a2 = a1 + 359.98;
  if (a2 - a1 < 0.5) return '';
  const s = polar(cx, cy, r, a1), e = polar(cx, cy, r, a2);
  const lg = (a2 - a1) > 180 ? 1 : 0;
  return `M${s[0].toFixed(2)} ${s[1].toFixed(2)} A${r} ${r} 0 ${lg} 1 ${e[0].toFixed(2)} ${e[1].toFixed(2)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hoofd card
// ─────────────────────────────────────────────────────────────────────────────
class EnergieOverzichtCard extends HTMLElement {

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass   = null;
    this._built  = false;
  }

  setConfig(config) {
    this._config = {
      ...DEFAULT_CFG,
      ...config,
      entities: { ...DEFAULT_CFG.entities, ...(config.entities || {}) },
    };
    if (this._built) this._update();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) { this._build(); this._built = true; }
    this._update();
  }

  static getConfigElement() { return document.createElement('energie-overzicht-card-editor'); }
  static getStubConfig() { return { ...DEFAULT_CFG }; }

  // ── Styles ────────────────────────────────────────────────────────────────
  _css() {
    return `
      :host { display: block; font-family: var(--primary-font-family, sans-serif); }
      ha-card { overflow: hidden; }
      .page { padding: 16px; display: flex; flex-direction: column; gap: 12px; }

      /* Hero */
      .hero { background: var(--secondary-background-color); border-radius: 14px; padding: 18px 16px 14px; }
      .hero-label { font-size: 11px; color: var(--secondary-text-color); text-transform: uppercase;
                    letter-spacing: .07em; margin-bottom: 6px; }
      .hero-val { font-size: 36px; font-weight: 500; color: var(--primary-text-color);
                  letter-spacing: -1px; line-height: 1; }
      .hero-unit { font-size: 18px; color: var(--secondary-text-color); }
      .hero-sub { font-size: 12px; color: var(--secondary-text-color); margin-top: 6px; }
      .chips { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
      .chip { display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 500;
              padding: 5px 10px; border-radius: 20px; }

      /* Section card */
      .scard { background: var(--card-background-color, var(--primary-background-color));
               border: 0.5px solid var(--divider-color); border-radius: 14px; padding: 16px 14px 14px; }
      .scard-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
      .scard-title { font-size: 11px; color: var(--secondary-text-color); text-transform: uppercase;
                     letter-spacing: .07em; font-weight: 500; }
      .prod-badge { font-size: 12px; font-weight: 500; color: #3B6D11; background: #EAF3DE;
                    padding: 4px 11px; border-radius: 20px; }

      /* Arc */
      .arc-outer { position: relative; width: 100%; display: flex; justify-content: center; margin-bottom: 8px; }
      .arc-center { position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
                    text-align: center; pointer-events: none; white-space: nowrap; }
      .arc-center-val { font-size: 13px; font-weight: 500; color: var(--primary-text-color); }
      .arc-center-sub { font-size: 10px; color: var(--secondary-text-color); margin-top: 1px; }

      /* Seg stats */
      .seg-stats { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 6px; margin-top: 4px; }
      .seg-stat { background: var(--secondary-background-color); border-radius: 10px;
                  padding: 10px 6px; text-align: center; }
      .seg-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-bottom: 5px; }
      .seg-val { font-size: 13px; font-weight: 500; color: var(--primary-text-color); display: block; }
      .seg-label { font-size: 10px; color: var(--secondary-text-color); margin-top: 2px; }
      .seg-pct { font-size: 10px; font-weight: 500; margin-top: 2px; }

      /* Source rows */
      .src-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
      .src-row:last-child { margin-bottom: 0; }
      .src-icon { width: 36px; height: 36px; border-radius: 10px; display: flex;
                  align-items: center; justify-content: center; flex-shrink: 0; }
      .src-body { flex: 1; min-width: 0; }
      .src-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px; }
      .src-name { font-size: 13px; color: var(--primary-text-color); font-weight: 500; }
      .src-pct-label { font-size: 12px; font-weight: 500; }
      .src-track { height: 5px; border-radius: 3px; background: var(--divider-color); overflow: hidden; }
      .src-fill { height: 100%; border-radius: 3px; transition: width .6s ease; }
      .src-sub { font-size: 11px; color: var(--secondary-text-color); margin-top: 3px; }
    `;
  }

  // ── SVG iconen ────────────────────────────────────────────────────────────
  _iconSun(color, size = 18) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
      stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2" x2="12" y2="5.5"/><line x1="12" y1="18.5" x2="12" y2="22"/>
      <line x1="4.93" y1="4.93" x2="7.35" y2="7.35"/><line x1="16.65" y1="16.65" x2="19.07" y2="19.07"/>
      <line x1="2" y1="12" x2="5.5" y2="12"/><line x1="18.5" y1="12" x2="22" y2="12"/>
      <line x1="4.93" y1="19.07" x2="7.35" y2="16.65"/><line x1="16.65" y1="7.35" x2="19.07" y2="4.93"/>
    </svg>`;
  }
  _iconGrid(color, size = 18) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
      stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
    </svg>`;
  }
  _iconReturn(color, size = 13) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
      stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="17 1 21 5 17 9"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <polyline points="7 23 3 19 7 15"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>`;
  }

  // ── DOM opbouw (eenmalig) ─────────────────────────────────────────────────
  _build() {
    const r = this.shadowRoot;
    r.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = this._css();
    r.appendChild(style);

    const card = document.createElement('ha-card');
    card.innerHTML = `
      <div class="page">

        <!-- Hero -->
        <div class="hero">
          <div class="hero-label">Totaal verbruik</div>
          <div class="hero-val"><span id="h-total">—</span> <span class="hero-unit" id="h-unit">kW</span></div>
          <div class="hero-sub" id="h-sub">— van grid · — van solar</div>
          <div class="chips">
            <div class="chip" style="background:#EAF3DE;color:#3B6D11" id="chip-solar">
              ${this._iconSun('#3B6D11', 13)}
              <span id="chip-solar-txt">—% solar</span>
            </div>
            <div class="chip" style="background:#E6F1FB;color:#185FA5" id="chip-grid">
              ${this._iconGrid('#185FA5', 13)}
              <span id="chip-grid-txt">—% grid</span>
            </div>
            <div class="chip" style="background:#FAEEDA;color:#854F0B" id="chip-ret">
              ${this._iconReturn('#854F0B')}
              <span id="chip-ret-txt">— terug</span>
            </div>
          </div>
        </div>

        <!-- Solar overzicht -->
        <div class="scard">
          <div class="scard-head">
            <span class="scard-title">Solar overzicht</span>
            <span class="prod-badge" id="prod-badge">— productie</span>
          </div>
          <div class="arc-outer">
            <svg id="arc-svg" width="260" height="148" viewBox="0 0 260 148" aria-hidden="true">
              <path id="arc-bg"    fill="none" stroke-linecap="round"/>
              <path id="arc-eigen" fill="none" stroke-linecap="round"/>
              <path id="arc-ret"   fill="none" stroke-linecap="round"/>
              <circle id="arc-dot" r="5.5"
                fill="var(--primary-text-color)"
                stroke="var(--card-background-color, var(--primary-background-color))"
                stroke-width="2.5"/>
            </svg>
            <div class="arc-center">
              <div class="arc-center-val" id="arc-val">—%</div>
              <div class="arc-center-sub">eigen gebruik</div>
            </div>
          </div>
          <div class="seg-stats">
            <div class="seg-stat">
              <span class="seg-dot" style="background:${C_GREEN}"></span>
              <span class="seg-val" id="seg-eigen">—</span>
              <div class="seg-label">Direct gebruikt</div>
              <div class="seg-pct" style="color:#3B6D11" id="seg-eigen-pct">—</div>
            </div>
            <div class="seg-stat">
              <span class="seg-dot" style="background:${C_BLUE}"></span>
              <span class="seg-val" id="seg-ret">—</span>
              <div class="seg-label">Teruggeleverd</div>
              <div class="seg-pct" style="color:#185FA5" id="seg-ret-pct">—</div>
            </div>
            <div class="seg-stat">
              <span class="seg-dot" style="background:${C_ORANGE}"></span>
              <span class="seg-val" id="seg-self">—%</span>
              <div class="seg-label">Zelfvoorzienend</div>
              <div class="seg-pct" style="color:#854F0B">van totaal</div>
            </div>
          </div>
        </div>

        <!-- Herkomst verbruik -->
        <div class="scard">
          <div class="scard-title" style="margin-bottom:14px">Herkomst verbruik</div>
          <div class="src-row">
            <div class="src-icon" style="background:#EAF3DE">${this._iconSun('#3B6D11')}</div>
            <div class="src-body">
              <div class="src-top">
                <span class="src-name">Solar</span>
                <span class="src-pct-label" style="color:#3B6D11" id="src-solar-pct">—%</span>
              </div>
              <div class="src-track">
                <div class="src-fill" id="src-solar-bar" style="background:${C_GREEN}"></div>
              </div>
              <div class="src-sub" id="src-solar-sub">—</div>
            </div>
          </div>
          <div class="src-row">
            <div class="src-icon" style="background:#E6F1FB">${this._iconGrid('#185FA5')}</div>
            <div class="src-body">
              <div class="src-top">
                <span class="src-name">Grid</span>
                <span class="src-pct-label" style="color:#185FA5" id="src-grid-pct">—%</span>
              </div>
              <div class="src-track">
                <div class="src-fill" id="src-grid-bar" style="background:${C_BLUE}"></div>
              </div>
              <div class="src-sub" id="src-grid-sub">—</div>
            </div>
          </div>
        </div>

      </div>`;
    r.appendChild(card);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  _val(entityId) {
    if (!entityId || !this._hass) return 0;
    const s = this._hass.states[entityId];
    if (!s) return 0;
    const n = parseFloat(s.state);
    return isNaN(n) ? 0 : n;
  }

  _fmt(val, unit) {
    if (unit === 'kW') return val.toFixed(2) + ' kW';
    return Math.round(val) + ' W';
  }

  _setArc(id, a1, a2, color, sw) {
    const el = this.shadowRoot.getElementById(id);
    if (!el) return;
    const d = arcPath(130, 132, 104, a1, a2);
    el.setAttribute('d', d || 'M0 0');
    el.setAttribute('stroke', d ? color : 'none');
    el.setAttribute('stroke-width', sw || 16);
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke-linecap', 'round');
  }

  // ── Update ────────────────────────────────────────────────────────────────
  _update() {
    if (!this._hass || !this._built) return;
    const r    = this.shadowRoot;
    const q    = id => r.getElementById(id);
    const cfg  = this._config;
    const unit = cfg.unit || 'kW';
    const ents = cfg.entities || {};

    const gridConsume  = this._val(ents.grid_consume);
    const solarProd    = this._val(ents.solar_production);
    const solarReturn  = Math.min(this._val(ents.solar_return), solarProd);
    const solarUsed    = Math.max(0, solarProd - solarReturn);
    const totalUse     = gridConsume + solarUsed;

    const pctSolar  = totalUse > 0 ? Math.round(solarUsed   / totalUse  * 100) : 0;
    const pctGrid   = totalUse > 0 ? Math.round(gridConsume / totalUse  * 100) : 0;
    const pctSelf   = totalUse > 0 ? Math.round(solarUsed   / totalUse  * 100) : 0;
    const pctEigen  = solarProd > 0 ? Math.round(solarUsed  / solarProd * 100) : 0;
    const pctRetS   = solarProd > 0 ? Math.round(solarReturn/ solarProd * 100) : 0;

    // Hero
    if (q('h-total'))       q('h-total').textContent      = this._fmt(totalUse, unit);
    if (q('h-unit'))        q('h-unit').textContent       = '';
    if (q('h-sub'))         q('h-sub').textContent        = `${this._fmt(gridConsume, unit)} van grid · ${this._fmt(solarUsed, unit)} van solar`;
    if (q('chip-solar-txt')) q('chip-solar-txt').textContent = `${pctSolar}% solar`;
    if (q('chip-grid-txt'))  q('chip-grid-txt').textContent  = `${pctGrid}% grid`;
    if (q('chip-ret-txt'))   q('chip-ret-txt').textContent   = `${this._fmt(solarReturn, unit)} terug`;

    // Solar badge
    if (q('prod-badge')) q('prod-badge').textContent = `${this._fmt(solarProd, unit)} productie`;

    // Arc
    const maxSolar = parseFloat(cfg.max_solar) || 8;
    const SPAN = 180, S = 180;
    const eigenDeg  = Math.min(solarUsed   / maxSolar, 1) * SPAN;
    const retDeg    = Math.min(solarReturn / maxSolar, 1) * SPAN;
    const solarDeg  = Math.min(solarProd   / maxSolar, 1) * SPAN;

    this._setArc('arc-bg',    S, S + SPAN, C_TRACK, 16);
    this._setArc('arc-eigen', S, S + eigenDeg, C_GREEN, 16);
    this._setArc('arc-ret',   S + eigenDeg, S + eigenDeg + retDeg, C_BLUE, 16);

    const dotPos = polar(130, 132, 104, S + solarDeg);
    const dot = q('arc-dot');
    if (dot) { dot.setAttribute('cx', dotPos[0].toFixed(1)); dot.setAttribute('cy', dotPos[1].toFixed(1)); }

    if (q('arc-val'))       q('arc-val').textContent       = `${pctEigen}%`;
    if (q('seg-eigen'))     q('seg-eigen').textContent     = this._fmt(solarUsed, unit);
    if (q('seg-ret'))       q('seg-ret').textContent       = this._fmt(solarReturn, unit);
    if (q('seg-self'))      q('seg-self').textContent      = `${pctSelf}%`;
    if (q('seg-eigen-pct')) q('seg-eigen-pct').textContent = `${pctEigen}% van productie`;
    if (q('seg-ret-pct'))   q('seg-ret-pct').textContent   = `${pctRetS}% van productie`;

    // Bronverdeling
    if (q('src-solar-pct')) q('src-solar-pct').textContent   = `${pctSolar}%`;
    if (q('src-grid-pct'))  q('src-grid-pct').textContent    = `${pctGrid}%`;
    if (q('src-solar-bar')) q('src-solar-bar').style.width   = `${pctSolar}%`;
    if (q('src-grid-bar'))  q('src-grid-bar').style.width    = `${pctGrid}%`;
    if (q('src-solar-sub')) q('src-solar-sub').textContent   = `${this._fmt(solarUsed, unit)} van de ${this._fmt(totalUse, unit)} totaal`;
    if (q('src-grid-sub'))  q('src-grid-sub').textContent    = `${this._fmt(gridConsume, unit)} van de ${this._fmt(totalUse, unit)} totaal`;
  }

  getCardSize() { return 5; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Visuele editor
// ─────────────────────────────────────────────────────────────────────────────
class EnergieOverzichtCardEditor extends HTMLElement {

  setConfig(config) {
    this._config = {
      ...DEFAULT_CFG,
      ...config,
      entities: { ...DEFAULT_CFG.entities, ...(config.entities || {}) },
    };
    if (this._built) this._populate();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) { this._build(); this._built = true; }
  }

  _fire(config) {
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
  }

  _build() {
    const ents = this._hass
      ? Object.keys(this._hass.states).filter(e => e.startsWith('sensor.')).sort()
      : [];

    this.innerHTML = `
      <style>
        .ed { padding: 4px 0; font-family: var(--primary-font-family, sans-serif); }
        .ib { font-size: 11px; color: var(--secondary-text-color);
              background: var(--secondary-background-color);
              border-radius: 0 8px 8px 0; padding: 9px 12px; margin-bottom: 16px;
              border-left: 3px solid #639922; line-height: 1.6; }
        .section { font-size: 11px; font-weight: 500; color: var(--secondary-text-color);
                   text-transform: uppercase; letter-spacing: .06em; margin: 14px 0 8px; }
        .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 6px; }
        .fi { display: flex; flex-direction: column; gap: 3px; }
        label { font-size: 11px; color: var(--secondary-text-color); display: flex; align-items: center; gap: 4px; }
        .be { font-size: 9px; padding: 1px 5px; border-radius: 10px; background: #E6F1FB; color: #185FA5; }
        .bc { font-size: 9px; padding: 1px 5px; border-radius: 10px; background: #EAF3DE; color: #3B6D11; }
        input[type=text], input[type=number], select {
          padding: 6px 8px; border-radius: 8px; font-size: 12px;
          border: 1px solid var(--divider-color);
          background: var(--secondary-background-color);
          color: var(--primary-text-color); width: 100%; }
        input:focus, select:focus { outline: none; border-color: #639922; }
        .hi { font-size: 10px; color: var(--disabled-text-color); margin-top: 1px; }
        .divider { height: 0.5px; background: var(--divider-color); margin: 14px 0; }
      </style>
      <div class="ed">
        <div class="ib">
          Vul de entities in. De card berekent zelfstandig solar direct gebruikt,
          percentages en zelfvoorzieningsgraad.
        </div>
        <datalist id="el">
          ${ents.map(e => `<option value="${e}">`).join('')}
        </datalist>

        <div class="section">Instellingen</div>
        <div class="g2">
          <div class="fi">
            <label>Eenheid sensor</label>
            <select id="unit">
              <option value="kW">kW (DSMR standaard)</option>
              <option value="W">W (direct)</option>
            </select>
          </div>
          <div class="fi">
            <label>Max solar productie</label>
            <input type="number" id="max_solar" min="0.1" step="0.5" placeholder="8"/>
            <div class="hi">Voor arc schaal (in gekozen eenheid)</div>
          </div>
        </div>

        <div class="divider"></div>
        <div class="section">Entities</div>

        <div class="g2">
          <div class="fi">
            <label>Grid afname <span class="be">entiteit</span></label>
            <input type="text" list="el" id="grid_consume" placeholder="sensor.…"/>
            <div class="hi">currently_delivered (totaal)</div>
          </div>
          <div class="fi">
            <label>Solar productie <span class="be">entiteit</span></label>
            <input type="text" list="el" id="solar_production" placeholder="sensor.…"/>
            <div class="hi">totale opbrengst omvormer</div>
          </div>
          <div class="fi" style="grid-column:span 2">
            <label>Teruglevering <span class="be">entiteit</span></label>
            <input type="text" list="el" id="solar_return" placeholder="sensor.…"/>
            <div class="hi">currently_returned (totaal) — solar direct gebruikt = productie − teruglevering</div>
          </div>
        </div>
      </div>`;

    this._built = true;
    this._populate();

    this.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('change', () => this._save());
      el.addEventListener('input',  () => this._save());
    });
  }

  _populate() {
    if (!this._built) return;
    const cfg  = this._config || {};
    const ents = cfg.entities || {};
    const set  = (id, val) => { const el = this.querySelector(`#${id}`); if (el && val !== undefined) el.value = val; };
    set('unit',             cfg.unit);
    set('max_solar',        cfg.max_solar);
    set('grid_consume',     ents.grid_consume);
    set('solar_production', ents.solar_production);
    set('solar_return',     ents.solar_return);
  }

  _save() {
    const g  = id => this.querySelector(`#${id}`)?.value || '';
    this._fire({
      ...this._config,
      unit:      g('unit') || 'kW',
      max_solar: parseFloat(g('max_solar')) || 8,
      entities: {
        grid_consume:     g('grid_consume'),
        solar_production: g('solar_production'),
        solar_return:     g('solar_return'),
      },
    });
  }
}

// ── Registreren ───────────────────────────────────────────────────────────────
customElements.define('energie-overzicht-card', EnergieOverzichtCard);
customElements.define('energie-overzicht-card-editor', EnergieOverzichtCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type:        'energie-overzicht-card',
  name:        'Energie Overzicht',
  description: 'Totaal verbruik, solar overzicht met arc, bronverdeling en zelfvoorzieningsgraad',
  preview:     true,
});
