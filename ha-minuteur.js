/**
 * Ha-Minuteur — carte Home Assistant « minuteur Android »
 * Roues hh:mm:ss (glisser haut/bas, boucle 23→00) · Démarrer · Stop → Réinitialiser
 * Import lit autonome (HA 2026 : window.LitElement n'existe plus en globals).
 * Auteur : TaTa pour Alexis — v1.1.0, 14/11/2026
 */
import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit@3.3.1/+esm";
const R = 46;            // px, hauteur d'une ligne de roue
const WHEEL_H = 208;     // px, hauteur visible d'une roue (réduite d'un quart)
const PAD = (WHEEL_H - R) / 2;  // ressort haut/bas pour centrer
const BODY_H = WHEEL_H + 68;    // hauteur FIXE du corps (la tuile ne change jamais de taille)

class HaMinuteur extends LitElement {
  static get properties() {
    return {
      _mode: { state: true },     // idle | running | paused | done
      _remain: { state: true },
      _endAt: { state: true },
    };
  }

  setConfig(config) {
    this._config = Object.assign({ title: 'Minuteur', notify: true, beep: true }, config || {});
    this._mode = 'idle';
    this._remain = 0;
    this._vals = { colH: 0, colM: 0, colS: 0 };
    this._endAt = null;
    this._centered = false;
  }

  set hass(h) { this._hass = h; this._firstHass(); }

  getCardSize() { return 5; }

  static get styles() {
    return css`
      ha-card { padding: 16px 20px 18px; }
      .body { height:${BODY_H}px; display:flex; flex-direction:column; }
      .fill { flex:1; display:flex; flex-direction:column; justify-content:center; }
      .head { display:flex; align-items:center; gap:9px; color:var(--secondary-text-color);
              font-size:15px; font-weight:500; margin-bottom:2px; }
      .sub2 { color:var(--secondary-text-color); font-size:12.5px; margin-bottom:14px; }
      .wheels { position:relative; display:flex; justify-content:center; gap:4px; }
      .band { position:absolute; left:6px; right:6px; top:${(WHEEL_H/2-R/2)}px; height:${R}px;
              background:var(--primary-color); opacity:.10;
              border-top:1.5px solid var(--primary-color);
              border-bottom:1.5px solid var(--primary-color);
              border-radius:10px; pointer-events:none; z-index:0; }
      .wheel { position:relative; width:88px; height:${WHEEL_H}px; overflow:hidden; z-index:1; }
      .col  { overflow-y:auto; scrollbar-width:none; height:100%; scroll-snap-type:y proximity; }
      .col::-webkit-scrollbar { display:none; }
      .pad { height:${PAD}px; }
      .d { height:${R}px; line-height:${R}px; text-align:center; font-size:34px; font-weight:500;
           color:var(--secondary-text-color); opacity:.30; scroll-snap-align:center;
           transition:opacity .12s; user-select:none; }
      .d.p1 { opacity:.55; color:var(--primary-text-color); }
      .d.p2 { opacity:.18; color:var(--primary-text-color); }
      .d.sel { color:var(--primary-text-color); font-weight:600; opacity:1; }
      .lbl { position:absolute; bottom:2px; left:0; right:0; text-align:center; font-size:11px;
             letter-spacing:.14em; text-transform:uppercase; color:var(--secondary-text-color);
             pointer-events:none; }
      .sep { font-size:30px; font-weight:600; color:var(--primary-text-color);
             margin-top:${(WHEEL_H-R)/2}px; }
      .cnt { font-size:46px; font-weight:600; color:var(--primary-text-color); text-align:center;
             font-variant-numeric:tabular-nums; margin-top:8px; letter-spacing:.02em; }
      .sub { color:var(--secondary-text-color); font-size:13px; text-align:center; margin:6px 0 2px; }
      .bt { display:flex; gap:12px; margin-top:16px; }
      .btn { flex:1; height:50px; border-radius:25px; font-size:16.5px; font-weight:600;
             display:flex; align-items:center; justify-content:center; gap:8px; border:none;
             cursor:pointer; font-family:inherit; }
      .btn ha-icon { --mdc-icon-size:20px; }
      .btn.start { background:var(--primary-color); color:var(--text-on-primary,#fff); }
      .btn.stop  { background:var(--error-color,#E53935); color:#fff; }
      .btn.reset { background:var(--accent-color,#ff9800); color:#fff; }
      .btn.dis   { opacity:.30; pointer-events:none; filter:grayscale(85%); }
      .cnt.term { animation:mflash 1.1s ease 3; }
      @keyframes mflash {
        0%,100% { color:var(--error-color,#E53935); }
        50% { color:var(--accent-color,#ff9800); }
      }
    `;
  }

  render() {
    const c = this._config || {};
    return html`
      <ha-card>
        <div class="head"><ha-icon icon="mdi:timer-outline"></ha-icon><span>${c.title}</span></div>
        ${this._mode === 'idle' ? this._renderWheels() : this._renderCountdown()}
      </ha-card>
    `;
  }

  _renderWheels() {
    const wheel = (id, lbl) => html`
      <div class="wheel">
        <div class="col" id="${id}" @scroll=${(e) => this._onScroll(e, id)}>
          <div class="pad"></div>
          ${repeat3(id)}
          <div class="pad"></div>
        </div>
        <div class="lbl">${lbl}</div>
      </div>`;
    return html`
      <div class="body">
        <div class="sub2">Régler l'heure en glissant haut / bas</div>
        <div class="wheels">
          <div class="band"></div>
          ${wheel('colH', 'heures')}${sep()}${wheel('colM', 'min')}${sep()}${wheel('colS', 'sec')}
        </div>
        <div class="bt" style="margin-top:auto">
        <button class="btn start" @click=${() => this._start()}>
          <ha-icon icon="mdi:play"></ha-icon><span>Démarrer</span></button>
        <button class="btn stop dis"><ha-icon icon="mdi:stop-circle"></ha-icon><span>Stop</span></button>
        </div>
      </div>
    `;
  }

  _renderCountdown() {
    const running = this._mode === 'running';
    const sub = running
      ? (this._endAt
        ? 'fin ' + new Date(this._endAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : '')
      : (this._mode === 'done' ? 'minuteur terminé' : 'figé au stop');
    return html`
      <div class="body">
        <div class="fill">
          <div class="cnt ${this._mode === 'done' ? 'term' : ''}">${this._fmt(this._remain)}</div>
          <div class="sub">${sub}</div>
        </div>
        <div class="bt">
        ${running
          ? html`<button class="btn stop" @click=${() => this._stop()}><ha-icon icon="mdi:stop-circle"></ha-icon><span>Stop</span></button>`
          : html`<button class="btn reset" @click=${() => this._reset()}><ha-icon icon="mdi:restart"></ha-icon><span>Réinitialiser</span></button>`}
        </div>
      </div>
    `;
  }

  _fmt(t) {
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const p = (x) => String(x).padStart(2, '0');
    return (h > 0 ? p(h) + ':' : '') + p(m) + ':' + p(s);
  }

  /* ————— mécanique des roues ————— */

  _firstHass() {
    if (this._mode === 'idle' && !this._centered) { this._centered = true; setTimeout(() => this._centerAll(), 80); }
  }

  updated(changed) {
    if (changed.has('_mode') && this._mode === 'idle') setTimeout(() => this._centerAll(), 40);
  }

  _centerAll() {
    ['colH', 'colM', 'colS'].forEach((id) => {
      const col = this.renderRoot.querySelector('#' + id);
      if (!col) return;
      col.style.scrollBehavior = 'auto';
      const n = COL_N[id];
      col.scrollTop = (n + (this._vals[id] || 0)) * R;   // point de snap de la copie centrale
      this._sel(id, COL_N[id], false);
    });
  }

  _onScroll(e, id) { this._sel(id, COL_N[id], true); }

  _sel(id, n, fromScroll) {
    const col = this.renderRoot.querySelector('#' + id);
    if (!col) return;
    col.style.scrollBehavior = 'auto';
    const rows = col.querySelectorAll('.d');
    const total = rows.length;              // 3n
    // convention snap : la ligne k est sélectionnée quand scrollTop = k * R
    let idx = Math.round(col.scrollTop / R);
    idx = Math.max(1, Math.min(total - 2, idx));
    // boucle silencieuse : si on sort de la copie centrale [n ; 2n-1], on y reboucle.
    // Re-paint SYNCHRONE : le rAF ne tourne pas sur un onglet caché (tablette murale).
    if (idx < n || idx > 2 * n - 1) {
      const shift = idx < n ? +1 : -1;
      col.scrollTop = (idx + shift * n) * R;
      return this._sel(id, n, false);
    }
    const v = ((idx - n) % n + n) % n;
    rows.forEach((d, i) => {
      const dist = Math.abs(i - idx);
      d.classList.toggle('sel', dist === 0);
      d.classList.toggle('p1', dist === 1);
      d.classList.toggle('p2', dist === 2);
    });
    this._vals[id] = v;
  }

  /* ————— actions ————— */

  _total() { return this._vals.colH * 3600 + this._vals.colM * 60 + this._vals.colS; }

  _start() {
    const total = this._total();
    if (total <= 0) return;
    clearInterval(this._tick);
    this._remain = total;
    this._endAt = Date.now() + total * 1000;
    this._mode = 'running';
    this._tick = setInterval(() => this._onTick(), 400);
  }

  _onTick() {
    const left = Math.max(0, Math.round((this._endAt - Date.now()) / 1000));
    if (left === this._remain) return;
    this._remain = left;
    if (left <= 0) this._done();
  }

  _stop() {
    clearInterval(this._tick);
    this._tick = null;
    this._mode = 'paused';
  }

  _reset() {
    clearInterval(this._tick);
    this._tick = null;
    this._remain = 0;
    this._endAt = null;
    this._vals = { colH: 0, colM: 0, colS: 0 };
    this._mode = 'idle';
  }

  /* ————— fin de course ————— */

  _done() {
    clearInterval(this._tick);
    this._tick = null;
    this._mode = 'done';
    const c = this._config || {};
    if (c.beep) this._beep();
    if (c.notify && this._hass) {
      try {
        this._hass.callService(
          'persistent_notification', 'create',
          { title: c.title, message: 'Le minuteur a terminé (réglage ' + this._fmt(this._total()) + ').' }
        );
      } catch (e) { /* silencieux */ }
    }
  }

  _beep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const notes = [
        [660.0, 0.0, 1.5],  [880.0, 0.28, 1.6],   // carillon E5 → A5, deux fois
        [660.0, 1.9, 1.5],  [880.0, 2.18, 1.7],
      ];
      notes.forEach(([f, when, dur]) => {
        this._tone(ctx, f, when, dur, 'sine', 0.20);
        this._tone(ctx, f * 2, when, dur * 0.85, 'sine', 0.05);
      });
      this._tone(ctx, 220, 0.0, 2.6, 'sine', 0.06);
      setTimeout(() => { try { ctx.close(); } catch (e) {} }, 3200);
    } catch (e) { /* audio bloqué : le flash visuel reste */ }
  }

  _tone(ctx, f, when, dur, type, gain) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(gain, ctx.currentTime + when);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime + when); o.stop(ctx.currentTime + when + dur);
  }

  static getStubConfig() { return { title: 'Minuteur' }; }
}

/* — helpers de template + enregistrement — */
const COL_N = { colH: 24, colM: 60, colS: 60 };

function sep() { return html`<div class="sep">:</div>`; }

function repeat3(id) {
  const n = COL_N[id];
  const rows = [];
  for (let v = 0; v < n; v++) {
    rows.push(html`<div class="d" data-v="${v}">${String(v).padStart(2, '0')}</div>`);
  }
  return [...rows, ...rows, ...rows];
}

window.customElements.define('ha-minuteur', HaMinuteur);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'ha-minuteur',
  name: 'Minuteur Android',
  description: 'Roues hh:mm:ss · Démarrer · Stop → Réinitialiser',
});
