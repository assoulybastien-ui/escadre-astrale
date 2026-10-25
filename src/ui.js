// ============================================================
//  ESCADRE ASTRALE — interface, boucle de jeu, sauvegarde (v5 : raid lead)
// ============================================================
(() => {
  const G = GAME;
  const R3 = window.R3 || { init() { }, resize() { }, setInsets() { }, setMode() { }, bindFight() { }, unbind() { }, update() { }, handleEvents() { }, select() { }, selectEnemy() { }, placing() { }, onTap() { }, showBoss() { }, nameplates: () => [], marker() { } };
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const KEY = 'escadre-astrale-v5';
  const DIFF_ORDER = ['normal', 'heroique', 'mythique'];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/ ([%:»!?;])/g, '&nbsp;$1').replace(/« /g, '«&nbsp;').replace(/(\d) (s|m|k)\b/g, '$1&nbsp;$2');
  const fmtPct = v => v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
  const k = v => v >= 1e6 ? (v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' M' : Math.round(v / 1000) + 'k';
  const ROLE_FR = { tank: 'Tank', heal: 'Soigneur', dps: 'DPS' };
  const C = G.CLASSES, SP = G.SPELLS;

  // ---------- icônes ----------
  const I = {
    taunt: '<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/>',
    kick: '<circle cx="12" cy="12" r="8"/><path d="M6.4 6.4l11.2 11.2"/>',
    shield: '<path d="M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z"/>',
    wall: '<path d="M3 20V8l9-5 9 5v12z"/><path d="M3 13h18M8 8v5M16 8v5M12 13v7"/>',
    quake: '<path d="M2 16l4-4 3 3 4-6 3 4 3-2 3 3"/><path d="M3 21h18"/>',
    swarm: '<circle cx="6" cy="7" r="1.6"/><circle cx="12" cy="5" r="1.6"/><circle cx="18" cy="8" r="1.6"/><circle cx="8" cy="13" r="1.6"/><circle cx="15" cy="13" r="1.6"/><path d="M12 15v6M9 18h6"/>',
    purge: '<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/><path d="M9 14l2 2 4-4"/>',
    prism: '<path d="M12 3l8 15H4z"/><path d="M12 3v15" opacity=".5"/>',
    rez: '<path d="M12 11v10M8 14.5h8"/><ellipse cx="12" cy="6.5" rx="3" ry="3.8"/>',
    wave: '<path d="M2 15c2.5-3 5-3 7.5 0s5 3 7.5 0 3-1.5 5-1.5"/><path d="M2 9c2.5-3 5-3 7.5 0s5 3 7.5 0 3-1.5 5-1.5" opacity=".6"/>',
    dash: '<path d="M3 12h9M3 7h6M3 17h6"/><path d="M13 5l7 7-7 7"/>',
    whirl: '<path d="M12 12a2 2 0 1 1 2-2 4 4 0 1 1-4-4 6 6 0 1 1 6 6 8 8 0 0 1-8 8"/>',
    shout: '<path d="M4 10v4h4l6 5V5L8 10z"/><path d="M17 8a5 5 0 0 1 0 8M19.5 5.5a8.5 8.5 0 0 1 0 13"/>',
    snipe: '<circle cx="12" cy="12" r="7"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
    turret: '<path d="M5 21h12M8 21l1.5-6h3l1.5 6"/><rect x="6" y="9" width="9" height="6"/><path d="M15 12h7"/>',
    dome: '<path d="M3 18a9 9 0 0 1 18 0z"/><path d="M3 18h18M12 9v9M7 11.5l2 6.5M17 11.5l-2 6.5" opacity=".6"/>',
    chain: '<path d="M9 15l6-6"/><path d="M11 6l1.5-1.5a3.5 3.5 0 0 1 5 5L16 11M13 18l-1.5 1.5a3.5 3.5 0 0 1-5-5L8 13"/>',
    pack: '<circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><path d="M4 4l5 5M20 4l-5 5M4 20l5-5M20 20l-5-5"/>',
    stop: '<rect x="6" y="6" width="12" height="12"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    lock: '<rect x="5" y="11" width="14" height="10"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    sword: '<path d="M5 19L18 6l1.5-2.5L17 5 4 18zM4 15l5 5"/>',
    cross: '<path d="M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z"/>',
    star: '<path d="M12 3l2.2 6.8H21l-5.5 4 2.1 6.7L12 16.4l-5.6 4.1 2.1-6.7-5.5-4h6.8z"/>',
    gardien: '<path d="M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z"/><path d="M12 7v9" opacity=".6"/>',
    titan: '<path d="M4 4h11v6H4z"/><path d="M15 7h3M9.5 10v11"/>',
    medic: '<path d="M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z"/>',
    seraphe: '<path d="M12 3l2.2 6.8H21l-5.5 4 2.1 6.7L12 16.4l-5.6 4.1 2.1-6.7-5.5-4h6.8z"/>',
    maree: '<path d="M2 15c2.5-3 5-3 7.5 0s5 3 7.5 0 3-1.5 5-1.5"/><path d="M12 3c2 3 4 5 4 7.5a4 4 0 0 1-8 0C8 8 10 6 12 3z"/>',
    lameombre: '<path d="M5 19L19 5M19 19L5 5"/><path d="M3 17l4 4M21 17l-4 4" opacity=".6"/>',
    fracasseur: '<path d="M12 2l2.2 3.2V15h-4.4V5.2z"/><path d="M7 15h10M12 15v7"/>',
    spectre: '<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v6M12 15.5v6M2.5 12h6M15.5 12h6"/>',
    bricoleur: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  };
  const ROLE_IC = { tank: 'shield', heal: 'cross', dps: 'sword' };
  const svg = (name, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${I[name] || I.star}</svg>`;
  const CALL_LABEL = { spread: 'Écarter', stack: 'Packer', move: 'Sortir', kick: 'Interruption', taunt: 'Provocation', focus: 'Switch', cd: 'Gros CD', heal: 'Soins', dispel: 'Purge', pos: 'Placement', tank: 'Tank' };
  // sorts à mettre en avant selon l'appel d'une capacité (mode Normal)
  const CALL_SPELLS = { kick: ['kick'], taunt: ['provoc', 'egide', 'carapace'], dispel: ['purge'], cd: ['nuee', 'dome'], heal: ['nuee', 'vague'], tank: ['provoc', 'seisme'], focus: ['tir', 'pas', 'tourelle'] };

  // ---------- son ----------
  let st;
  const SND = (() => {
    let ctx = null, master = null;
    function ensure() {
      if (!st || !st.sound) return null;
      if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.3; master.connect(ctx.destination); } catch (e) { return null; } }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(f, d, type = 'sine', v = 0.3, slide = 0, delay = 0) {
      const c = ensure(); if (!c) return;
      const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.linearRampToValueAtTime(f + slide, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.05);
    }
    function noise(d, v, freq) {
      const c = ensure(); if (!c) return;
      const n = Math.floor(c.sampleRate * d), buf = c.createBuffer(1, n, c.sampleRate), data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'lowpass'; f.frequency.value = freq || 800; g.gain.value = v; s.buffer = buf; s.connect(f); f.connect(g); g.connect(master); s.start();
    }
    return {
      unlock: ensure,
      alert() { tone(880, 0.12, 'triangle', 0.2); tone(1318, 0.2, 'triangle', 0.18, 0, 0.11); },
      danger() { tone(196, 0.4, 'sawtooth', 0.12, -60); tone(392, 0.25, 'square', 0.05); },
      boom() { noise(0.6, 0.5, 500); tone(70, 0.5, 'sine', 0.3, -30); },
      small() { noise(0.18, 0.22, 1400); },
      kick() { tone(1700, 0.06, 'square', 0.09); tone(2400, 0.08, 'triangle', 0.1, 0, 0.04); },
      sel() { tone(1240, 0.04, 'triangle', 0.06); },
      order() { tone(620, 0.06, 'triangle', 0.1); tone(930, 0.06, 'triangle', 0.08, 0, 0.05); },
      cast() { tone(523, 0.12, 'triangle', 0.12); tone(784, 0.18, 'triangle', 0.11, 0, 0.08); },
      no() { tone(180, 0.12, 'square', 0.07); },
      death() { tone(320, 0.3, 'sine', 0.12, -160); },
      win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, 'triangle', 0.18, 0, i * 0.13)); },
      lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.5, 'sine', 0.18, 0, i * 0.18)); },
    };
  })();

  // ---------- sauvegarde ----------
  const DEFAULT_SEL = ['kaelith', 'brakka', 'nym4', 'iriel', 'somna', 'vex', 'rhun', 'ashka', 'kiro', 'senn'];
  function fresh() {
    return {
      v: 5, lead: null, diff: 'normal', boss: 'vorr', sel: DEFAULT_SEL.slice(),
      pool: Object.fromEntries(G.POOL.map(p => [p.id, { pow: 1, parts: 0, loot: 0 }])),
      kills: Object.fromEntries(G.BOSSES.map(b => [b.id, { normal: 0, heroique: 0, mythique: 0 }])), best: {}, sound: true,
      groups: null, place: {}, talents: {}, newTier: false,
    };
  }
  function load() {
    const d = fresh();
    try {
      const raw = localStorage.getItem(KEY); if (!raw) return d;
      const s = JSON.parse(raw);
      const out = Object.assign(d, s);
      out.pool = Object.assign(fresh().pool, s.pool || {});
      out.kills = Object.assign(fresh().kills, s.kills || {});
      return out;
    } catch (e) { return d; }
  }
  st = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { } }
  const person = id => { const p = G.POOL.find(x => x.id === id); return Object.assign({}, p, st.pool[id]); };
  function bossUnlocked(bi, d) {
    // le Mythique s'ouvre quand tout le raid est vaincu en Héroïque (les trois paliers de talents sont alors ouverts)
    if (d === 'mythique' && !G.BOSSES.every(b => st.kills[b.id].heroique > 0)) return { ok: false, why: 'Vaincre les 4 boss en Héroïque' };
    if (bi > 0 && !(st.kills[G.BOSSES[bi - 1].id][d] > 0)) return { ok: false, why: 'Vaincre ' + G.BOSSES[bi - 1].name + ' en ' + G.DIFFS[d].name };
    const di = DIFF_ORDER.indexOf(d);
    if (di > 0 && !(st.kills[G.BOSSES[bi].id][DIFF_ORDER[di - 1]] > 0)) return { ok: false, why: 'Vaincre ce boss en ' + G.DIFFS[DIFF_ORDER[di - 1]].name };
    return { ok: true };
  }

  // ---------- talents : paliers ouverts selon les victoires ----------
  const killCount = () => G.BOSSES.reduce((a, b) => a + DIFF_ORDER.filter(d => st.kills[b.id][d] > 0).length, 0);
  const tiersOpen = () => DATA.TALENT_TIERS.filter(n => killCount() >= n).length;
  const talFx = cls => DATA.talentFx(cls, st.talents[cls], tiersOpen());

  // ---------- navigation ----------
  const SCREENS = ['loading', 'perso', 'hub', 'roster', 'talents', 'journal', 'fight', 'report', 'loot'];
  let current = 'hub';
  function show(name) {
    current = name;
    SCREENS.forEach(s => { const el = $('#' + s); if (el) el.hidden = s !== name; });
    hideSpellTip();
    R3.setMode(name === 'fight' ? 'fight' : 'hub');
    if (name === 'hub') renderHub();
    if (name === 'fight') requestAnimationFrame(measureHud);
    checkRotate();
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) { save(); show(b.dataset.go); } });
  function confirmBox(title, text, yes, cb) {
    $('#cfTitle').textContent = title; $('#cfText').textContent = text; $('#cfYes').textContent = yes; $('#confirm').hidden = false;
    $('#cfYes').onclick = () => { $('#confirm').hidden = true; cb(); };
    $('#cfNo').onclick = () => { $('#confirm').hidden = true; };
  }

  // ---------- raid lead ----------
  $('#persoBack').onclick = () => show('hub');
  $('#persoOk').onclick = () => {
    const name = ($('#heroName').value || '').trim().slice(0, 14) || 'Capitaine';
    st.lead = { name }; save(); SND.unlock(); show('hub');
  };
  function openPerso() { $('#heroName').value = st.lead ? st.lead.name : ''; $('#persoBack').hidden = !st.lead; show('perso'); }

  // ---------- composition ----------
  function compInfo(ids) {
    const ps = ids.map(person);
    const c = { tank: 0, heal: 0, dps: 0, melee: 0, ranged: 0 };
    ps.forEach(p => { const cl = C[p.cls]; c[cl.role]++; if (cl.role === 'dps') c[cl.range]++; });
    const pow = ps.reduce((a, p) => a + p.pow, 0) / Math.max(1, ps.length);
    const warn = [];
    if (ids.length !== 10) warn.push('Il faut 10 persos (' + ids.length + ' sélectionnés).');
    if (c.tank < 2) warn.push('Il faut au moins deux tanks.');
    if (c.heal < 2) warn.push('Il faut au moins deux soigneurs.');
    const valid = ids.length === 10 && c.tank >= 2 && c.heal >= 2;
    // sorts apportés
    const present = new Set(ps.map(p => p.cls)), spells = [];
    for (const cl of G.CLASS_ORDER) if (present.has(cl)) for (const id of C[cl].spells) { let s = spells.find(x => x.id === id); if (!s) { s = { id, n: 0 }; spells.push(s); } }
    for (const s of spells) s.n = ps.filter(p => SP[s.id].classes.includes(p.cls)).length;
    return { c, pow, warn, valid, spells };
  }
  function rolesHtml(c) { return `<div class="roles"><i><span class="dot tank"></span>${c.tank} tank${c.tank > 1 ? 's' : ''}</i><i><span class="dot heal"></span>${c.heal} soigneur${c.heal > 1 ? 's' : ''}</i><i><span class="dot dps"></span>${c.dps} DPS <small style="color:var(--ink-3)">(${c.melee} mêlée · ${c.ranged} distance)</small></i></div>`; }
  function spellChips(spells) { return `<div class="kit-spells">${spells.map(s => `<span data-sp="${s.id}" role="button" tabindex="0">${svg(SP[s.id].icon)}${esc(SP[s.id].name)}${s.n > 1 ? ' ×' + s.n : ''}</span>`).join('')}</div>`; }

  // ---------- bulle d'explication d'un sort ----------
  // Équipe et placement : un toucher. En combat : appui long (le combat continue, la bulle laisse passer les touchers).
  let tipFor = null, tipT = 0;
  function spellTip(id, anchor, opts = {}) {
    const sp = SP[id], tip = $('#spellTip'), counts = opts.counts || {};
    const cls = sp.classes.filter(c => counts[c]), n = cls.reduce((a, c) => a + counts[c], 0);
    const who = cls.map(c => `<i style="color:${C[c].color}">${esc(C[c].name)}${counts[c] > 1 ? ' ×' + counts[c] : ''}</i>`).join(' · ');
    // talents choisis qui modifient ce sort
    const tals = []; const open = tiersOpen();
    for (const c of cls) (DATA.TALENTS[c] || []).forEach((tier, k) => { const j = (st.talents[c] || [])[k]; const ta = k < open && j != null ? tier[j] : null; if (ta && ((ta.fx.cd || {})[id] != null || (ta.fx.sp || {})[id])) tals.push(ta.name); });
    tip.innerHTML = `<div class="st-h">${svg(sp.icon)}<b>${esc(sp.name)}</b><span class="num">recharge ${sp.cd} s</span></div>`
      + (n ? `<p class="st-who">${who} · ${n} charge${n > 1 ? 's' : ''}</p>` : '')
      + `<p>${esc(sp.desc)}</p><p class="st-how"><b>Comment :</b> ${esc(sp.how)}</p>`
      + (tals.length ? `<p class="st-tal"><b>Talents :</b> ${esc(tals.join(' · '))}</p>` : '');
    tip.classList.toggle('pass', !!opts.pass);
    tip.style.left = '0px'; tip.style.top = '0px'; tip.hidden = false;
    // au-dessus du sort, sans dépasser le bord droit de son conteneur (zone sûre de l'iPhone)
    const a = anchor.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, m = 8;
    const right = opts.edge ? opts.edge.getBoundingClientRect().right : innerWidth - m;
    const x = Math.max(m, Math.min(a.left + a.width / 2 - w / 2, right - w));
    let y = a.top - h - 8; if (y < m) y = Math.min(a.bottom + 8, innerHeight - h - m);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
    clearTimeout(tipT); tipFor = anchor;
  }
  function hideSpellTip() { clearTimeout(tipT); tipFor = null; const t = $('#spellTip'); if (t) t.hidden = true; }
  document.addEventListener('pointerdown', e => { if (tipFor && !tipFor.contains(e.target) && !$('#spellTip').contains(e.target)) hideSpellTip(); }, true);
  $('#spellTip').addEventListener('click', hideSpellTip);

  // ---------- HUB ----------
  function renderHub() {
    if (!st.lead) return openPerso();
    const tk = st.kills;
    const kills = killCount();
    $('#heroCard').innerHTML = `<span class="sigil" style="background:#c9a24a22;color:#f2d68c">${svg('star')}</span>
      <div class="who"><b>${esc(st.lead.name)}</b><small>Raid lead · ${kills}/12 victoires</small></div>
      <button type="button" id="btnPerso">Changer ›</button>`;
    $('#btnPerso').onclick = openPerso;
    $$('#diffPick button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.diff === st.diff)));
    const bi = G.BOSSES.findIndex(b => b.id === st.boss);
    $('#bossList').innerHTML = G.BOSSES.map((b, i) => {
      const un = bossUnlocked(i, st.diff), kk = st.kills[b.id];
      return `<button class="bcard" data-boss="${b.id}" aria-pressed="${b.id === st.boss}" ${un.ok ? '' : 'disabled'} aria-label="${esc(b.name)}">
        <span class="n num">${String(i + 1).padStart(2, '0')}</span><b>${esc(b.name)}</b>
        ${un.ok ? `<span class="st">${DIFF_ORDER.map(d => `<i class="${kk[d] ? 'k' : ''}" title="${G.DIFFS[d].name}"></i>`).join('')}</span>` : `<span class="lock">${svg('lock', 'style="width:11px;height:11px;vertical-align:-1px"')} verrouillé</span>`}
      </button>`;
    }).join('');
    const B = G.BOSSES[bi], un = bossUnlocked(bi, st.diff), ci = compInfo(st.sel);
    $('#raidSum').innerHTML = `<p class="boss-line"><b>${esc(B.name)}</b>, ${esc(B.title)}<span class="focus">. ${esc(B.focus)}</span></p>
      <div class="row1">${rolesHtml(ci.c)}<span class="num" style="color:var(--ink-2)">Puiss. ${Math.round(ci.pow * 100)}</span></div>
      ${ci.warn.length ? `<p class="warn">${esc(ci.warn[0])}</p>` : ''}`;
    const pull = $('#btnPull');
    pull.disabled = !un.ok || !ci.valid;
    pull.textContent = !un.ok ? un.why : !ci.valid ? 'Composition incomplète' : 'Affronter ' + B.name;
    $('#btnTalents').textContent = st.newTier ? 'Talents •' : 'Talents';
    $('#btnTalents').classList.toggle('notify', !!st.newTier);
    $('#btnSound').textContent = 'Son : ' + (st.sound ? 'activé' : 'coupé');
    $('#btnGfx').textContent = 'Graphismes : ' + gfxLabel();
    R3.showBoss(B.model);
  }
  $('#diffPick').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; st.diff = b.dataset.diff; const bi = G.BOSSES.findIndex(x => x.id === st.boss); if (!bossUnlocked(bi, st.diff).ok) { const first = G.BOSSES.find((x, i) => bossUnlocked(i, st.diff).ok); if (first) st.boss = first.id; } save(); renderHub(); });
  $('#bossList').addEventListener('click', e => { const b = e.target.closest('.bcard'); if (!b || b.disabled) return; st.boss = b.dataset.boss; save(); renderHub(); });
  $('#btnRoster').onclick = () => { renderRoster(); show('roster'); };
  $('#btnJournal').onclick = () => { jBoss = st.boss; renderJournal(); show('journal'); };
  $('#btnTalents').onclick = () => { st.newTier = false; save(); renderTalents(); show('talents'); };

  // ---------- TALENTS ----------
  let talCls = null;
  function renderTalents() {
    const open = tiersOpen(), kc = killCount();
    if (!talCls) talCls = (st.sel[0] && person(st.sel[0]).cls) || 'gardien';
    $('#talPts').textContent = open + '/3 paliers';
    $('#talTabs').innerHTML = G.CLASS_ORDER.map(c => `<button data-c="${c}" aria-selected="${c === talCls}"${c === talCls ? ` style="color:${C[c].color};border-bottom-color:${C[c].color}"` : ''}>${esc(C[c].name)}${open && (st.talents[c] || []).slice(0, open).some(x => x == null) && st.sel.some(id => person(id).cls === c) ? ' •' : ''}</button>`).join('');
    const ch = st.talents[talCls] || [], cl = C[talCls];
    const inRaid = st.sel.map(person).filter(p => p.cls === talCls).map(p => p.name);
    let h = `<section class="jsec"><div class="prose"><p><b style="color:${cl.color}">${esc(cl.name)}</b> · ${esc(cl.race)}. Les talents valent pour tous les ${esc(cl.name)} de l’escadre${inRaid.length ? ' (dans le raid : ' + esc(inRaid.join(', ')) + ')' : ' (aucun dans le raid actuel)'}.</p><p>Un palier s’ouvre à ${DATA.TALENT_TIERS.join(', ')} victoires : tu en as <b>${kc}</b>. Tu peux changer tes choix à tout moment hors combat.</p></div></section>`;
    DATA.TALENTS[talCls].forEach((tier, k) => {
      const lock = k >= open;
      h += `<section class="tier jsec"><h3>Palier ${k + 1}<small>${lock ? 'Débloqué à ' + DATA.TALENT_TIERS[k] + ' victoires' : ch[k] == null ? 'Choisis un talent' : 'Actif'}</small></h3><div class="tier-row two">${tier.map((ta, j) => `<button class="tal" data-t="${k}" data-j="${j}" aria-pressed="${!lock && ch[k] === j}" ${lock ? 'disabled' : ''}><b>${esc(ta.name)}</b><span>${esc(ta.desc)}</span></button>`).join('')}</div></section>`;
    });
    $('#talBody').innerHTML = h;
  }
  $('#talTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; talCls = b.dataset.c; renderTalents(); });
  $('#talBody').addEventListener('click', e => {
    const b = e.target.closest('.tal'); if (!b || b.disabled) return;
    const k = +b.dataset.t, j = +b.dataset.j, ch = (st.talents[talCls] ||= [null, null, null]);
    ch[k] = ch[k] === j ? null : j; save(); SND.sel(); renderTalents();
  });
  $('#btnPull').onclick = () => { SND.unlock(); startFight(); };
  $('#btnSound').onclick = () => { st.sound = !st.sound; save(); renderHub(); if (st.sound) SND.unlock(); };
  const GFX = ['auto', 'ultra', 'haute', 'moyenne', 'basse'];
  const gfxLabel = () => ({ auto: 'Auto', ultra: 'Ultra', haute: 'Haute', moyenne: 'Moyenne', basse: 'Basse' }[st.gfx || 'auto']);
  function cycleGfx() { st.gfx = GFX[(GFX.indexOf(st.gfx || 'auto') + 1) % GFX.length]; save(); if (R3.setQuality) R3.setQuality(st.gfx); }
  $('#btnGfx').onclick = () => { cycleGfx(); renderHub(); };
  $('#btnReset').onclick = () => confirmBox('Réinitialiser', 'Toute la progression (butin, victoires, placements, groupes) sera effacée de cet appareil.', 'Tout effacer', () => { st = fresh(); save(); openPerso(); });

  // ---------- ROSTER ----------
  function renderRoster() {
    const sel = st.sel, ci = compInfo(sel);
    $('#rosterCount').textContent = sel.length + '/10';
    $('#compSummary').innerHTML = rolesHtml(ci.c) + `<p class="lbl" style="margin:2px 0 0">Sorts de la barre · touche un sort pour le détail</p>` + spellChips(ci.spells) + `<p class="comp-warn" style="color:${ci.warn.length ? 'var(--amber)' : 'var(--good)'}">${esc(ci.warn[0] || 'Composition valide.')}</p>`;
    $('#rosterOk').disabled = !ci.valid;
    $('#rosterList').innerHTML = G.POOL.map(p0 => {
      const p = person(p0.id), cl = C[p.cls], on = sel.includes(p.id);
      return `<div class="rcard ${on ? 'sel' : ''}" data-id="${p.id}" role="button" tabindex="0" aria-pressed="${on}">
        <div class="sigil" style="background:${cl.color}22;color:${cl.color}">${svg(p.cls)}</div>
        <div class="rname">${esc(p.name)} <small><span class="dot ${cl.role}"></span> ${esc(cl.name)} · ${esc(cl.race)}</small></div>
        <div class="check">${on ? '✓' : ''}</div>
        <div class="rstats"><span>${esc(cl.spells.map(s => SP[s].name).join(' · '))}</span><span>Puiss. <b class="num">${Math.round(p.pow * 100)}</b></span>${p.parts ? `<span><b>${p.parts}</b> part${p.parts > 1 ? 's' : ''}</span>` : ''}</div>
      </div>`;
    }).join('');
  }
  $('#rosterList').addEventListener('click', e => {
    const c = e.target.closest('.rcard'); if (!c) return;
    const id = c.dataset.id, sel = st.sel;
    if (sel.includes(id)) st.sel = sel.filter(x => x !== id);
    else if (sel.length < 10) sel.push(id);
    else { $('#compSummary .comp-warn:last-child').textContent = 'Raid complet : retire d’abord quelqu’un.'; return; }
    save(); renderRoster();
  });
  $('#rosterList').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('rcard')) { e.preventDefault(); e.target.click(); } });
  $('#compSummary').addEventListener('click', e => {
    const c = e.target.closest('[data-sp]'); if (!c) return;
    if (tipFor === c) { hideSpellTip(); return; }
    const counts = {}; for (const id of st.sel) { const cl = person(id).cls; counts[cl] = (counts[cl] || 0) + 1; }
    spellTip(c.dataset.sp, c, { counts, edge: $('#compSummary') });
  });
  $('#rosterAuto').onclick = () => { st.sel = DEFAULT_SEL.slice(); save(); renderRoster(); };
  $('#rosterOk').onclick = () => { save(); show('hub'); };

  // ---------- JOURNAL ----------
  let jBoss = 'vorr';
  function abilMeta(a, D) {
    const m = D.dmgMult;
    const t = a.every >= 900 ? 'À l’entrée en phase' : (a.first === 0 ? 'Dès l’entrée en phase, puis toutes les ' + a.every + ' s' : 'Première à ' + a.first + ' s, puis toutes les ' + a.every + ' s');
    let x = '';
    switch (a.kind) {
      case 'buster': x = k(a.dmg * m) + ' sur le tank, ×' + String(a.mult).replace('.', ',') + ' par cumul'; break;
      case 'raidcast': x = 'Incantation ' + String(a.cast).replace('.', ',') + ' s · ' + k(a.dmg * m) + ' à tout le raid'; break;
      case 'frontal': x = k(a.dmg * m) + ' dans un cône de ' + a.range + ' m'; break;
      case 'dots': x = a.count + ' cibles · ' + k(a.dps * m) + '/s' + (a.explode ? ' · explose à expiration' : ''); break;
      case 'zones': x = a.count + ' zones · s’arment en ' + String(a.arm).replace('.', ',') + ' s · ' + k(a.dps * m) + '/s dedans'; break;
      case 'marks': x = a.count + ' marques · explosion après ' + a.time + ' s · ' + k(a.dmg * m); break;
      case 'soak': x = k(a.dmg * m) + ' à partager · ' + (a.need || 4) + ' persos minimum'; break;
      case 'adds': x = a.count + ' × ' + k(a.hp * (D.addMult || 1)) + ' PV'; break;
      case 'beam': x = k(a.dps * m) + '/s dans le rayon'; break;
      case 'pulse': x = 'Aspiration de ' + a.pull + ' m · cœur : ' + k(a.dps * m) + '/s'; break;
      case 'fissures': x = a.count + ' lignes · éruption après ' + String(a.arm).replace('.', ',') + ' s · ' + k(a.dps * m) + '/s dedans'; break;
      case 'half': x = 'Alerte de ' + String(a.warn).replace('.', ',') + ' s · ' + a.dur + ' s de feu ou de gel · ' + k(a.dps * m) + '/s du mauvais côté'; break;
      case 'sweep': x = 'Alerte de ' + String(a.warn).replace('.', ',') + ' s · balayage de ' + String(a.dur).replace('.', ',') + ' s · ' + k(a.dps * m) + '/s dans un rayon'; break;
      case 'holes': x = a.count + ' dalles · chute après ' + String(a.arm).replace('.', ',') + ' s · ' + k(a.dps * m) + '/s dans un trou'; break;
    }
    return t + (x ? ' · ' + x : '');
  }
  function renderJournal() {
    $('#jBoss').innerHTML = G.BOSSES.map(b => `<button data-b="${b.id}" aria-selected="${b.id === jBoss}">${esc(b.name)}</button>`).join('') + `<button data-b="classes" aria-selected="${jBoss === 'classes'}">Classes et sorts</button>`;
    let h = '';
    if (jBoss === 'classes') {
      h += `<section class="jsec"><h3>Comment jouer</h3><div class="prose"><p>Les persos attaquent et soignent seuls, mais <b>ne bougent que sur tes ordres</b>. Ils ne sortent jamais seuls d’une zone ; en revanche, en se recollant au boss, ils évitent d’y entrer.</p><p>Chaque sort de la barre a une <b>charge par porteur vivant</b> : deux Gardiens, deux Provocations. Le sort part du porteur le plus proche de la cible.</p><p>Pour savoir ce que fait un sort : <b>touche-le pendant le placement</b>, ou <b>appui long</b> dessus en combat (le combat continue).</p><p><b>Talents</b> : chaque victoire rapproche du palier suivant (1, 4 et 8 victoires). Choisis-les dans l’écran Talents, classe par classe ; ils valent pour tous les persos de la classe. Le Mythique s’ouvre quand les 4 boss sont vaincus en Héroïque.</p><p>Les soigneurs soignent à <b>16 m</b>. Un cadre grisé à gauche = hors de portée de tout soigneur.</p></div></section>`;
      for (const id of G.CLASS_ORDER) {
        const cl = C[id];
        h += `<article class="abil panel cut"><div class="abil-h"><b style="color:${cl.color}">${esc(cl.name)}</b><span class="tag ${cl.role === 'tank' ? 'tank' : cl.role === 'heal' ? 'heal' : 'pos'}">${ROLE_FR[cl.role]} · ${cl.range === 'melee' ? 'mêlée' : 'distance'}</span></div><p>${esc(cl.race)}. ${esc(cl.blurb)}</p><div class="spell-list">${cl.spells.map(s => `<div>${svg(SP[s].icon)}<span><b>${esc(SP[s].name)}</b> · recharge ${SP[s].cd} s<br>${esc(SP[s].desc)}<br><i>${esc(SP[s].how)}</i></span></div>`).join('')}</div></article>`;
      }
    } else {
      const B = G.resolveBoss(G.BOSSES.find(b => b.id === jBoss), st.diff);
      const D = G.DIFFS[st.diff];
      h += `<div class="diff-pick" id="jDiff">${DIFF_ORDER.map(d => `<button data-diff="${d}" aria-checked="${d === st.diff}">${G.DIFFS[d].name}</button>`).join('')}</div>`;
      h += `<section class="jsec"><h3>${esc(B.name)}<small>${esc(B.title)} · ${k(B.hp * D.hpMult)} PV · enrage ${G.fmtT(B.enrage * D.enrageMult)}</small></h3><div class="prose"><p>${esc(B.lore)}</p><p><b>À retenir :</b> ${esc(B.focus)}</p></div></section>`;
      B.phases.forEach((ph, i) => {
        const from = i === 0 ? 100 : Math.round(B.phases[i - 1].to * 100), to = Math.round(ph.to * 100);
        h += `<section class="jsec"><h3>Phase ${i + 1} · ${esc(ph.name)}<small>${from} → ${to} %${ph.invuln ? ' · invulnérable ' + ph.invuln + ' s' : ''}${ph.dmgMult ? ' · dégâts +' + Math.round((ph.dmgMult - 1) * 100) + ' %' : ''}</small></h3>`;
        if (ph.collapse) h += `<article class="abil panel cut"><div class="abil-h"><b>Effondrement</b><span class="tag move">${esc(CALL_LABEL.move)}</span></div><p>À l’entrée en phase, le bord de l’arène s’écroule dans la lave. Il reste ${String(ph.collapse).replace('.', ',')} m autour du centre, marqués par un cercle de feu. Ramène tout le monde à l’intérieur, placement compris : au-delà, la lave brûle très fort.</p><span class="meta">${ph.collapseDelay || 4} s pour rentrer</span></article>`;
        for (const id in ph.abilities) { const a = ph.abilities[id]; h += `<article class="abil panel cut"><div class="abil-h"><b>${esc(a.name)}</b><span class="tag ${a.call}">${esc(CALL_LABEL[a.call] || a.call)}</span></div><p>${esc(a.desc)}</p>${a.kind !== 'meleeStack' ? `<span class="meta">${esc(abilMeta(a, D))}</span>` : ''}</article>`; }
        if (ph.aura) h += `<article class="abil panel cut"><div class="abil-h"><b>${B.id === 'nyxar' ? 'Effondrement du Noyau' : 'Faim d’Azhal'}</b><span class="tag cd">Course DPS</span></div><p>Dégâts continus sur tout le raid qui augmentent chaque seconde de la phase. Cri de guerre ici.</p></article>`;
        h += `</section>`;
      });
      if (B.link) h += `<section class="jsec"><h3>Lien stellaire</h3><div class="prose"><p>Si les Jumelles restent à moins de <b>${B.link.dist} m</b> l’une de l’autre plus de 4 s, elles frappent 50 % plus fort et brûlent tout le raid. Garde les deux tanks aux deux bouts de l’arène.</p></div></section>`;
      h += `<section class="jsec"><h3>Butin<small>${D.loot} objets en ${D.name}, +${Math.round(D.lootPow * 100)} % de puissance chacun</small></h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Objet</th><th>Emplacement</th><th>Pour</th></tr></thead><tbody>${G.LOOT[B.id].map(l => `<tr><td>${esc(l.name)}</td><td>${esc(l.slot)}</td><td>${esc(FOR[l.for])}</td></tr>`).join('')}</tbody></table></div></section>`;
    }
    $('#jBody').innerHTML = h;
    const jd = $('#jDiff'); if (jd) jd.onclick = e => { const b = e.target.closest('button'); if (!b) return; st.diff = b.dataset.diff; save(); renderJournal(); };
    $('#journal .page-scroll').scrollTop = 0;
  }
  $('#jBoss').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; jBoss = b.dataset.b; renderJournal(); });

  // ============================================================
  //  COMBAT
  // ============================================================
  let S = null, running = false, paused = false, acc = 0, pre = 0, endTimer = 0, lastSetup = null;
  const STEP = 0.05;
  const els = {};
  const UI = { sel: new Set(), enemy: null, queue: false, pack: false, placing: null, fixFor: -1, orders: 0, casts: 0 };

  function defaultGroups(S) {
    const by = f => S.raiders.filter(f).map(r => r.id);
    return [
      { name: 'Tanks', ids: by(r => r.role === 'tank') },
      { name: 'Soins', ids: by(r => r.role === 'heal') },
      { name: 'Mêlée', ids: by(r => r.role === 'dps' && r.range === 'melee') },
      { name: 'Distance', ids: by(r => r.role === 'dps' && r.range === 'ranged') },
    ];
  }
  function startFight(setup) {
    setup = setup || { bossId: st.boss, diff: st.diff, raid: st.sel.slice() };
    const ci = compInfo(setup.raid); if (!ci.valid) return;
    const raid = setup.raid.map(id => { const p = person(id); return { id: p.id, name: p.name, cls: p.cls, pow: p.pow, tal: talFx(p.cls) }; });
    S = G.createFight({ bossId: setup.bossId, diff: setup.diff, raid, seed: (Date.now() % 1e9) | 0 });
    // placement mémorisé pour ce boss
    const saved = st.place[setup.bossId];
    if (saved) for (const r of S.raiders) { const p = saved.find(q => q.id === r.id); if (p) { r.pos = { x: p.x, z: p.z }; r.anchor = { x: p.x, z: p.z }; } }
    lastSetup = setup;
    if (!st.groups || !st.groups.length) st.groups = defaultGroups(S);
    Object.assign(UI, { sel: new Set(), enemy: null, queue: false, pack: false, placing: null, fixFor: -1, orders: 0, casts: 0 });
    R3.bindFight(S); R3.select([]); R3.selectEnemy(null);
    buildHud();
    running = true; paused = false; acc = 0; pre = 0; endTimer = 0;
    $('#pause').hidden = true; $('#prep').hidden = false;
    show('fight');
  }
  function doPull() {
    if (!S || S.started || pre > 0) return;
    st.place[lastSetup.bossId] = S.raiders.map(r => ({ id: r.id, x: +r.pos.x.toFixed(2), z: +r.pos.z.toFixed(2) }));
    save();
    $('#prep').hidden = true; pre = 3.2; hideSpellTip();
    showAlert('Pull dans 3', 'phase'); SND.alert();
  }
  $('#prepPull').onclick = () => { SND.unlock(); doPull(); };
  $('#prepReset').onclick = () => { if (!S || S.started) return; const P = G.defaultPlacement(S); S.raiders.forEach((r, i) => { r.pos = { x: P[i].x, z: P[i].z }; r.anchor = { x: P[i].x, z: P[i].z }; r.orders = []; }); toast('Placement conseillé', true); };

  function buildHud() {
    $('#bName').textContent = S.B.twins ? 'Séla et Néria' : S.B.name;
    $('#bTicks').innerHTML = S.B.phases.slice(0, -1).map(ph => `<b style="left:${ph.to * 100}%"></b>`).join('');
    const cols = BOSS_BAR[S.B.id] || ['#7a3bd6', '#c46bff'];
    $('#bBar').style.setProperty('--b1', cols[0]); $('#bBar').style.setProperty('--b2', cols[1]);
    // cadres de raid
    $('#frames').innerHTML = S.raiders.map(r => `<button class="uf" data-i="${r.i}" aria-label="${esc(r.name)}"><span class="hp"><i style="background-color:${C[r.cls].color}"></i><u></u></span><span class="n">${svg(ROLE_IC[r.role])}${esc(r.name)}</span><span class="deb"></span></button>`).join('');
    els.frames = $$('#frames .uf').map(el => ({ el, hp: el.querySelector('.hp i'), ab: el.querySelector('.hp u'), deb: el.querySelector('.deb'), last: '', cls: '' }));
    // plaques
    $('#plates').innerHTML = S.raiders.map(r => `<div class="pl" data-i="${r.i}"><span class="ic ${r.role}">${svg(ROLE_IC[r.role])}</span><span class="bar"><i style="background:${C[r.cls].color}"></i></span><span class="mk">!</span></div>`).join('');
    els.plates = $$('#plates .pl').map(el => ({ el, bar: el.querySelector('.bar i'), cls: '' }));
    // barre de sorts
    const bar = G.spellBar(S);
    const cols2 = Math.min(8, Math.max(4, Math.ceil(bar.length / 2)));
    $('#spells').style.setProperty('--cols', cols2);
    $('#spells').innerHTML = bar.map(b => { const cl = C[SP[b.id].classes.find(c => S.raiders.some(r => r.cls === c))]; return `<button class="sp" data-sp="${b.id}" aria-label="${esc(b.name)}" style="--c:${cl.color};--c2:${cl.color}33"><span class="cdov"></span>${svg(b.icon)}<span class="l">${esc(b.name)}</span><span class="ch num"></span><span class="cdt"></span></button>`; }).join('');
    els.spells = {}; $$('#spells .sp').forEach(b => { els.spells[b.dataset.sp] = { el: b, ov: b.querySelector('.cdov'), ch: b.querySelector('.ch'), cdt: b.querySelector('.cdt'), last: '' }; });
    document.documentElement.style.setProperty('--spw', (cols2 * 45 + 8) + 'px');
    renderGroups(); renderSelbar();
  }
  const BOSS_BAR = { vorr: ['#b4481c', '#ffa040'], jumelles: ['#c99a2a', '#9fd0ff'], nyxar: ['#7a3bd6', '#c46bff'], azhal: ['#3b2a9e', '#9b6bff'] };
  function measureHud() {
    if (current !== 'fight') return;
    const top = $('#hudTop').getBoundingClientRect().bottom;
    const left = $('#frames').getBoundingClientRect().right;
    const bottom = window.innerHeight - Math.min($('#groups').getBoundingClientRect().top, $('#spells').getBoundingClientRect().top);
    R3.setInsets(top + 2, bottom + 2, left + 2);
  }
  function checkRotate() { const r = $('#rotate'); if (r) r.hidden = !(current === 'fight' && window.innerHeight > window.innerWidth); }

  // ---------- sélection ----------
  function syncSel() { if (!UI.sel.size) { UI.queue = false; UI.pack = false; } R3.select([...UI.sel]); renderSelbar(); renderGroups(); }
  function clearSel() { UI.sel.clear(); syncSel(); }
  function toggleSel(i) { if (UI.sel.has(i)) UI.sel.delete(i); else UI.sel.add(i); SND.sel(); syncSel(); }
  const selAlive = () => [...UI.sel].filter(i => S.raiders[i] && S.raiders[i].alive);
  function setEnemy(ref) { UI.enemy = ref; R3.selectEnemy(ref); renderSelbar(); }

  function renderSelbar() {
    const b = $('#selbar'); if (!S) return;
    if (UI.placing) { b.innerHTML = `<span class="hint">Touche le sol : ${esc(SP[UI.placing].name)}</span><button class="sb" data-a="cancel">${svg('close')}Annuler</button>`; return; }
    if (UI.fixFor >= 0) { b.innerHTML = `<span class="hint">Touche l’allié que ${esc(S.raiders[UI.fixFor].name)} doit soigner</span><button class="sb" data-a="cancel">${svg('close')}Annuler</button>`; return; }
    const sel = [...UI.sel].map(i => S.raiders[i]);
    let h = '';
    if (sel.length) {
      h += `<span class="who">${sel.slice(0, 6).map(r => `<i style="background:${C[r.cls].color}"></i>`).join('')}${sel.length === 1 ? esc(sel[0].name) : sel.length + ' persos'}</span>`;
      h += `<button class="sb${UI.queue ? ' on' : ''}" data-a="queue" aria-pressed="${UI.queue}">${svg('chain')}File</button>`;
      if (sel.length > 1) h += `<button class="sb${UI.pack ? ' on' : ''}" data-a="pack" aria-pressed="${UI.pack}">${svg('pack')}Serrer</button>`;
      if (sel.length === 1 && sel[0].role === 'heal' && sel[0].alive) {
        const m = sel[0].healMode;
        h += `<button class="sb${m === 'tanks' ? ' on' : ''}" data-a="mode" data-m="tanks">Tanks</button><button class="sb${m === 'raid' ? ' on' : ''}" data-a="mode" data-m="raid">Raid</button><button class="sb${m === 'cible' ? ' on' : ''}" data-a="mode" data-m="cible">${m === 'cible' && sel[0].healFix >= 0 ? esc(S.raiders[sel[0].healFix].name) : 'Cible'}</button>`;
      }
      if (S.started) h += `<button class="sb ico" data-a="stop" aria-label="Arrêter">${svg('stop')}</button>`;
      h += `<button class="sb ico" data-a="clear" aria-label="Désélectionner">${svg('close')}</button>`;
    } else if (UI.enemy) {
      const E = G.enemyRef(S, UI.enemy);
      if (E) h += `<span class="who" style="color:#ff9a8a">Cible : ${esc(E.name)}</span><button class="sb ico" data-a="noenemy" aria-label="Retirer la cible">${svg('close')}</button>`;
    }
    b.innerHTML = h;
  }
  $('#selbar').addEventListener('click', e => {
    const btn = e.target.closest('.sb'); if (!btn || !S) return;
    const a = btn.dataset.a;
    if (a === 'cancel') { UI.placing = null; UI.fixFor = -1; R3.placing(null); renderSelbar(); syncSpellArmed(); return; }
    if (a === 'queue') UI.queue = !UI.queue;
    if (a === 'pack') UI.pack = !UI.pack;
    if (a === 'clear') { clearSel(); return; }
    if (a === 'noenemy') { setEnemy(null); return; }
    if (a === 'stop') { const idx = selAlive(); G.order(S, { type: 'stop', idx }); toast('Ordres annulés', true); }
    if (a === 'mode') {
      const h = [...UI.sel][0];
      if (btn.dataset.m === 'cible') { UI.fixFor = h; renderSelbar(); return; }
      const res = G.setHealMode(S, h, btn.dataset.m); toast(res.text, res.ok);
    }
    renderSelbar();
  });

  // ---------- groupes mémorisés ----------
  function renderGroups() {
    if (!S || !st.groups) return;
    $('#groups').innerHTML = st.groups.map((g, k) => {
      const rs = g.ids.map(id => S.raiders.find(r => r.id === id)).filter(Boolean);
      const on = rs.length && rs.filter(r => r.alive).every(r => UI.sel.has(r.i)) && rs.some(r => r.alive);
      return `<button class="grp${on ? ' on' : ''}" data-g="${k}"><b>${esc(g.name || 'Groupe ' + (k + 1))}</b><span class="dots">${rs.map(r => `<i class="${r.alive ? '' : 'dead'}" style="background:${C[r.cls].color}"></i>`).join('') || '<small style="font-size:9px;color:var(--ink-3)">vide</small>'}</span></button>`;
    }).join('');
  }
  let grpPress = null;
  $('#groups').addEventListener('pointerdown', e => {
    const b = e.target.closest('.grp'); if (!b) return;
    const kk = +b.dataset.g;
    grpPress = { k: kk, t: setTimeout(() => {
      grpPress.long = true;
      const ids = [...UI.sel].map(i => S.raiders[i].id);
      st.groups[kk] = { name: ids.length ? groupName(ids) : 'Groupe ' + (kk + 1), ids };
      save(); renderGroups(); const nb = $('#groups').children[kk]; if (nb) nb.classList.add('saving');
      toast(ids.length ? 'Groupe ' + (kk + 1) + ' enregistré' : 'Groupe ' + (kk + 1) + ' vidé', true); SND.order();
    }, 480) };
  });
  const endPress = e => {
    if (!grpPress) return; clearTimeout(grpPress.t);
    const g = grpPress; grpPress = null;
    if (g.long || e.type === 'pointercancel' || !S) return;
    const rs = st.groups[g.k].ids.map(id => S.raiders.find(r => r.id === id)).filter(r => r && r.alive);
    if (!rs.length) { toast('Groupe vide : appui long pour y ranger la sélection', false); return; }
    const allIn = rs.every(r => UI.sel.has(r.i));
    if (allIn && UI.sel.size === rs.length) UI.sel.clear(); else { UI.sel = new Set(rs.map(r => r.i)); }
    UI.placing = null; SND.sel(); syncSel();
  };
  $('#groups').addEventListener('pointerup', endPress); $('#groups').addEventListener('pointercancel', endPress);
  $('#groups').addEventListener('contextmenu', e => e.preventDefault());
  function groupName(ids) {
    const rs = ids.map(id => S.raiders.find(r => r.id === id)).filter(Boolean);
    const roles = new Set(rs.map(r => r.role === 'dps' ? r.range : r.role));
    if (roles.size === 1) return { tank: 'Tanks', heal: 'Soins', melee: 'Mêlée', ranged: 'Distance' }[[...roles][0]];
    if (rs.length <= 2) return rs.map(r => r.name).join(' + ');
    return rs.length + ' persos';
  }

  // ---------- entrées ----------
  $('#frames').addEventListener('click', e => {
    const f = e.target.closest('.uf'); if (!f || !S || paused || S.over) return;
    handlePick({ kind: 'raider', i: +f.dataset.i }, null);
  });
  R3.onTap(info => { if (!S || !running || paused || S.over || current !== 'fight') return; handlePick(info.pick, info.ground); });
  function handlePick(pk, ground) {
    if (UI.placing) {
      const g = ground || (pk && pk.kind === 'raider' ? S.raiders[pk.i].pos : pk ? (G.enemyRef(S, pk.kind === 'body' ? { kind: 'body', k: pk.k } : { kind: 'add', id: pk.id }) || {}).pos : null);
      if (!g) return;
      const id = UI.placing; UI.placing = null; R3.placing(null);
      castSpell(id, { x: g.x, z: g.z }); renderSelbar(); syncSpellArmed(); return;
    }
    if (UI.fixFor >= 0) {
      if (pk && pk.kind === 'raider' && S.raiders[pk.i].alive) { const res = G.setHealMode(S, UI.fixFor, 'cible', pk.i); toast(res.text, res.ok); SND.order(); }
      UI.fixFor = -1; renderSelbar(); return;
    }
    if (pk && pk.kind === 'raider') { toggleSel(pk.i); return; }
    if (pk && (pk.kind === 'body' || pk.kind === 'add')) {
      const ref = pk.kind === 'body' ? { kind: 'body', k: pk.k } : { kind: 'add', id: pk.id };
      setEnemy(ref);
      const idx = selAlive();
      if (idx.length && S.started) {
        const res = G.order(S, { type: 'attack', idx, target: ref });
        if (res.ok) { UI.orders++; SND.order(); toast(res.text, true); const E = G.enemyRef(S, ref); if (E) R3.marker(E.pos.x, E.pos.z, '#ff6a5a'); if (!UI.queue) clearSel(); }
      } else SND.sel();
      return;
    }
    if (ground) {
      const idx = selAlive();
      if (idx.length) {
        G.order(S, { type: 'move', idx, x: ground.x, z: ground.z, queue: UI.queue, pack: UI.pack });
        UI.orders++; SND.order(); R3.marker(ground.x, ground.z, S.started ? '#66d8ff' : '#f2d68c');
        if (!UI.queue) clearSel();
      } else if (UI.enemy) setEnemy(null);
    }
  }
  function castSpell(id, ground) {
    const res = G.cast(S, id, { sel: [...UI.sel], enemy: UI.enemy, ground });
    if (res.code === 'ground') { UI.placing = id; R3.placing(id); renderSelbar(); syncSpellArmed(); return; }
    if (res.text) toast(res.text, res.ok);
    if (res.ok) { UI.casts++; SND.cast(); const b = els.spells[id]; if (b) flashEl(b.el); } else SND.no();
  }
  function syncSpellArmed() { for (const id in els.spells) els.spells[id].el.classList.toggle('armed', UI.placing === id); }
  // appui long sur un sort : sa bulle d'explication, sans le lancer
  let spPress = null, spSkip = 0;   // spSkip : heure du relâché d'un appui long, dont le clic qui suit est ignoré
  function fightTip(b) {
    const counts = {}; for (const r of S.raiders) if (r.alive) counts[r.cls] = (counts[r.cls] || 0) + 1;
    spellTip(b.dataset.sp, b, { counts, edge: $('#spells'), pass: true });
  }
  $('#spells').addEventListener('pointerdown', e => {
    const b = e.target.closest('.sp'); if (!b || !S) return;
    if (spPress) clearTimeout(spPress.t);
    spPress = { b, long: false, t: setTimeout(() => { spPress.long = true; fightTip(b); SND.sel(); }, 420) };
  });
  const endSpPress = e => {
    if (!spPress) return; clearTimeout(spPress.t);
    if (spPress.long) { spSkip = Date.now(); if (S && S.started) tipT = setTimeout(hideSpellTip, 5000); }
    spPress = null;
  };
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => $('#spells').addEventListener(t, endSpPress));
  $('#spells').addEventListener('contextmenu', e => e.preventDefault());
  $('#spells').addEventListener('click', e => {
    const b = e.target.closest('.sp'); if (!b || !S || !running || paused || S.over) return;
    if (spSkip && Date.now() - spSkip < 500) { spSkip = 0; return; }   // l'appui long a montré la bulle : pas de lancement
    spSkip = 0;
    if (S.started) hideSpellTip();
    SND.unlock();
    const id = b.dataset.sp;
    if (UI.placing === id) { UI.placing = null; R3.placing(null); renderSelbar(); syncSpellArmed(); return; }
    if (!S.started) { if (tipFor === b) hideSpellTip(); else fightTip(b); return; }
    if (SP[id].target === 'ground') {
      const it = G.spellBar(S).find(x => x.id === id);
      if (!it.alive) { toast('Aucun porteur en vie', false); SND.no(); return; }
      if (!it.ready) { toast(SP[id].name + ' en recharge', false); SND.no(); return; }
      UI.placing = id; UI.fixFor = -1; R3.placing(id); renderSelbar(); syncSpellArmed(); return;
    }
    castSpell(id);
  });
  function flashEl(el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  $('#btnPause').onclick = () => { if (!S || !running) return; paused = true; syncPause(); $('#pause').hidden = false; };
  $('#pResume').onclick = () => { paused = false; $('#pause').hidden = true; };
  $('#pSound').onclick = () => { st.sound = !st.sound; save(); syncPause(); };
  $('#pGfx').onclick = () => { cycleGfx(); syncPause(); };
  $('#pWipe').onclick = () => {
    if (!S) return; $('#pause').hidden = true; paused = false;
    if (!S.started) { quitFight(); return; }
    for (const r of S.raiders) if (r.alive) { r.alive = false; r.hp = 0; S.events.push({ type: 'death', i: r.i }); }
    S.over = true; S.result = 'wipe'; S.endT = S.t; S.called = true; S.events.push({ type: 'end', result: 'wipe' });
  };
  function quitFight() { $('#pause').hidden = true; paused = false; running = false; S = null; R3.unbind(); show('hub'); }
  $('#pQuit').onclick = quitFight;
  function syncPause() { $('#pSound').textContent = 'Son : ' + (st.sound ? 'activé' : 'coupé'); $('#pGfx').textContent = 'Graphismes : ' + gfxLabel(); }

  // ---------- alertes ----------
  let alertT = 0;
  function showAlert(text, level, call) {
    const a = $('#alert');
    const hint = S && S.D.hints && call && CALL_LABEL[call] && level !== 'phase' ? `<small>${esc(CALL_LABEL[call])}</small>` : '';
    a.className = 'alert show ' + (level || 'warn');
    a.innerHTML = esc(text) + hint;
    alertT = 2.6;
    if (S && S.D.hints && call && CALL_SPELLS[call]) for (const id of CALL_SPELLS[call]) { const b = els.spells && els.spells[id]; if (b) { b.el.classList.add('hot'); setTimeout(() => b.el.classList.remove('hot'), 3200); } }
  }
  let toastT = 0;
  function toast(text, ok) { if (!text) return; const t = $('#toast'); t.textContent = text; t.className = 'toast show ' + (ok ? 'ok' : 'bad'); toastT = 1.8; }
  function uiEvents(ev) {
    for (const e of ev) {
      switch (e.type) {
        case 'alert': showAlert(e.text, e.level, e.call); (e.level === 'danger' ? SND.danger : SND.alert)(); break;
        case 'interrupt': SND.kick(); break;
        case 'raidHit': SND.boom(); flash(0.16); break;
        case 'markExplode': case 'dotExplode': SND.small(); break;
        case 'soakHit': case 'orbExplode': SND.boom(); break;
        case 'busterHit': if (e.stacks >= 3) SND.boom(); else SND.small(); break;
        case 'death': SND.death(); UI.sel.delete(e.i); if (UI.sel.size === 0) syncSel(); else syncSel(); break;
        case 'phase': SND.boom(); flash(0.3); break;
        case 'nova': SND.boom(); flash(0.9); break;
        case 'addDie': if (UI.enemy && UI.enemy.kind === 'add' && UI.enemy.id === e.id) setEnemy(null); break;
        case 'end':
          endTimer = 2.8; UI.placing = null; R3.placing(null);
          if (e.result === 'kill') { SND.win(); showAlert(S.B.name + ' est vaincu', 'good'); flash(0.45); }
          else { SND.lose(); showAlert(S.called ? 'Wipe appelé' : 'Le raid est anéanti', 'danger'); }
          break;
      }
    }
  }
  function flash(v) { const f = $('#fade'); f.style.transition = 'none'; f.style.opacity = v; requestAnimationFrame(() => { f.style.transition = 'opacity 0.8s'; f.style.opacity = 0; }); }

  // ---------- mise à jour du HUD ----------
  let hudAcc = 0, barAcc = 0;
  function hpColor(p) { return p > 0.5 ? '' : p > 0.25 ? '#ffc04a' : '#ff4a4a'; }
  function updateHud(dt) {
    if (!S) return;
    hudAcc += dt; barAcc += dt;
    $('#fClock').textContent = G.fmtT(S.t);
    $('#fPhase').textContent = S.started ? 'Phase ' + (S.phase + 1) : 'Placement';
    const pct = Math.max(0, S.hp / S.maxHp);
    $('#bHp').style.transform = `scaleX(${pct})`;
    $('#bPct').textContent = fmtPct(pct * 100);
    $('#bShield').hidden = !(S.adds.some(a => a.alive && (a.type === 'echo' || a.type === 'guardian')) || S.t < S.invulnUntil);
    // incantations
    const cs = [];
    if (!S.over) {
      for (const b of S.bodies) if (b.cast) cs.push({ name: (S.bodies.length > 1 ? b.name + ' : ' : '') + b.cast.name, k: (S.t - b.cast.start) / (b.cast.end - b.cast.start), cls: b.cast.interruptible ? 'kick' : b.cast.kind === 'buster' ? 'buster' : '' });
      for (const a of S.adds) if (a.alive && a.cast) cs.push({ name: a.name + ' : ' + a.cast.name, k: (S.t - a.cast.start) / (a.cast.end - a.cast.start), cls: 'kick' });
    }
    const castsEl = $('#casts');
    if (castsEl.children.length !== cs.length) castsEl.innerHTML = cs.map(() => '<div class="cast"><i></i><span></span></div>').join('');
    cs.forEach((c, i) => { const el = castsEl.children[i]; el.className = 'cast ' + c.cls; el.firstChild.style.transform = `scaleX(${Math.min(1, c.k)})`; el.lastChild.textContent = c.name + (c.cls === 'kick' ? ' · interruptible' : ''); });
    const live = S.adds.filter(a => a.alive);
    $('#adds').innerHTML = live.map(a => `<span class="ab ${a.type}${a.type === 'guardian' && (S.raiders[a.target] || {}).role !== 'tank' ? ' loose' : ''}"><i style="transform:scaleX(${a.hp / a.maxHp})"></i></span>`).join('');
    if (hudAcc > 0.2) {
      hudAcc = 0;
      const tv = S.started ? G.timersView(S).filter(t => t.left <= 30).slice(0, 5) : [];
      $('#timers').innerHTML = tv.map(t => `<div class="tb ${t.call} ${t.left < 5 ? 'soon' : ''}"><i style="transform:scaleX(${Math.max(0, Math.min(1, t.left / 30))})"></i><span>${esc(t.name)}</span>${S.D.hints && CALL_LABEL[t.call] ? `<em>${CALL_LABEL[t.call]}</em>` : ''}<span class="num">${Math.ceil(Math.max(0, t.left))}</span></div>`).join('');
    }
    // portée des soins
    const healers = S.raiders.filter(r => r.alive && r.role === 'heal');
    // cadres
    S.raiders.forEach((r, i) => {
      const f = els.frames[i]; if (!f) return;
      const hp = r.hp / r.maxHp;
      f.hp.style.transform = `scaleX(${Math.max(0, hp)})`;
      const ab = r.absorb > 0 && S.t < r.absorbUntil ? Math.min(1, r.absorb / r.maxHp) : 0;
      f.ab.style.transform = `scaleX(${ab})`; f.ab.style.left = Math.min(100, hp * 100) + '%';
      const tanking = r.alive && G.isTanking(S, r);
      const oor = r.alive && !healers.some(h => G.dist(h.pos, r.pos) <= G.HEAL_RANGE);
      const cls = 'uf' + (r.alive ? '' : ' dead') + (tanking ? ' tanking' : '') + (UI.sel.has(i) ? ' sel' : '') + (oor ? ' oor' : '') + (r.alive && hp < 0.3 ? ' low' : '') + (UI.fixFor >= 0 ? ' fixpick' : '');
      if (f.cls !== cls) { f.el.className = cls; f.cls = cls; }
      const stn = Object.values(r.stacks).reduce((a, b) => Math.max(a, b.n), 0);
      const deb = (r.alive && stn ? `<span class="fr">${stn}</span>` : '') + (r.alive && r.mark ? '<span class="mk">!</span>' : '') + (r.alive && r.debuffs.some(d => d.dispel) ? '<span class="ds">P</span>' : '');
      if (deb !== f.last) { f.deb.innerHTML = deb; f.last = deb; }
    });
    // plaques au-dessus des têtes
    const np = R3.nameplates();
    for (const p of np) {
      const e = els.plates[p.i]; if (!e) continue; const r = S.raiders[p.i];
      e.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
      e.el.style.visibility = p.vis ? 'visible' : 'hidden';
      const hp = Math.max(0, r.hp / r.maxHp);
      e.bar.style.transform = `scaleX(${hp})`;
      const cls = 'pl' + (UI.sel.has(p.i) ? ' sel' : '') + (r.alive ? '' : ' dead') + (r.alive && r.mark ? ' marked' : '') + (r.alive && r.debuffs.some(d => d.dispel) ? ' debuff' : '');
      if (cls !== e.cls) { e.el.className = cls; e.cls = cls; }
    }
    // sorts
    if (barAcc > 0.1) {
      barAcc = 0;
      for (const b of G.spellBar(S)) {
        const e = els.spells[b.id]; if (!e) continue;
        const ready = b.ready, cdLeft = ready ? 0 : b.next;
        e.ov.style.setProperty('--p', cdLeft > 0 ? Math.min(100, cdLeft / b.cd * 100) + '%' : '0%');
        const key = b.alive + '/' + ready + '/' + Math.ceil(cdLeft);
        if (key !== e.last) {
          e.last = key;
          e.ch.textContent = b.alive > 1 || (b.total > 1 && b.alive) ? ready : '';
          e.cdt.textContent = !ready && b.alive ? Math.ceil(cdLeft) : '';
          e.el.classList.toggle('na', !b.alive);
          e.el.classList.toggle('empty', b.alive > 0 && !ready);
        }
      }
    }
  }

  // ---------- boucle ----------
  let last = performance.now(), manual = false;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!manual) tick(dt);
    requestAnimationFrame(frame);
  }
  function tick(dt) {
    let visDt = dt;
    if (S && running) {
      if (paused) visDt = 0;
      else {
        if (pre > 0) {
          const before = Math.ceil(pre); pre -= dt; const after = Math.ceil(pre);
          if (after !== before && after > 0) { showAlert('Pull dans ' + after, 'phase'); SND.sel(); }
          if (pre <= 0) { pre = 0; G.pull(S); showAlert('Pull !', 'warn'); SND.alert(); }
        } else if (S.started) {
          acc += dt;
          let n = 0; while (acc >= STEP && n < 12) { G.step(S, STEP); acc -= STEP; n++; }
        }
        if (S.events.length) { const ev = S.events.splice(0); R3.handleEvents(ev); uiEvents(ev); }
        if (endTimer > 0) { endTimer -= dt; if (endTimer <= 0) finishFight(); }
      }
    }
    if (alertT > 0) { alertT -= dt; if (alertT <= 0) $('#alert').classList.remove('show'); }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('#toast').classList.remove('show'); }
    try { R3.update(visDt); } catch (e) { console.error(e); }
    if (S && current === 'fight') { try { updateHud(dt); } catch (e) { console.error(e); } }
  }

  // ---------- RAPPORT ----------
  let lootPlan = null, lootBoss = null;
  function finishFight() {
    running = false;
    const R = S;
    lootPlan = null;
    let newTier = false;
    if (R.result === 'kill') {
      const before = tiersOpen();
      st.kills[R.B.id][R.D.key] = (st.kills[R.B.id][R.D.key] || 0) + 1;
      if (tiersOpen() > before) { st.newTier = true; newTier = true; }
      const key = R.B.id + '_' + R.D.key; if (!st.best[key] || R.endT < st.best[key]) st.best[key] = R.endT;
      save();
      const roster = lastSetup.raid.map(id => { const p = person(id); return { id, name: p.name, cls: p.cls, pow: p.pow, parts: p.parts }; });
      lootPlan = G.rollLoot(R.B.id, roster, R.D.key, G.mulberry32((Date.now() % 1e9) | 0));
      lootBoss = R.B;
    }
    renderReport(R, newTier);
    show('report');
  }
  function meter(rows) {
    const max = Math.max(1, ...rows.map(r => r.v));
    return `<div class="meter">${rows.map(r => `<div class="mrow"><span class="nm">${esc(r.name)}</span><span class="bar"><i style="width:${(r.v / max * 100).toFixed(1)}%;background:${r.color}"></i></span><span class="v">${r.label}</span></div>`).join('')}</div>`;
  }
  function renderReport(R, newTier) {
    const kill = R.result === 'kill', dur = Math.max(1, R.endT), pct = Math.max(0, R.hp / R.maxHp * 100);
    const ins = G.analyze(R);
    const deaths = R.deaths.filter(d => !R.called || d.t < R.endT - 0.01);
    let h = `<div class="verdict ${kill ? 'kill' : 'wipe'}"><p class="eyebrow">${R.D.name} · ${esc(R.B.name)}</p><h2>${kill ? 'Victoire' : 'Wipe à ' + fmtPct(pct)}</h2><p>${kill ? 'Vaincu en ' + G.fmtT(dur) + '. ' + (deaths.length ? deaths.length + ' mort' + (deaths.length > 1 ? 's' : '') + ' en route.' : 'Aucun mort, propre.') : (R.called ? 'Wipe appelé' : 'Raid anéanti') + ' en phase ' + (R.phase + 1) + ' après ' + G.fmtT(dur) + '.'}</p>${newTier ? `<p class="new-tier">Nouveau palier de talents débloqué : choisis-les dans l’écran Talents.</p>` : ''}</div>`;
    const raidDps = R.raiders.reduce((a, r) => a + r.stats.dmg, 0) / dur;
    const spells = Object.values(R.spellUse).reduce((a, b) => a + b, 0);
    h += `<div class="kpis"><div class="kpi panel cut"><b>${G.fmtT(dur)}</b><span>Durée</span></div><div class="kpi panel cut"><b>${deaths.length}</b><span>Morts</span></div><div class="kpi panel cut"><b>${UI.orders}</b><span>Ordres</span></div><div class="kpi panel cut"><b>${spells}</b><span>Sorts</span></div></div>`;
    h += `<section class="jsec"><h3>Analyse</h3>`;
    h += ins.length ? ins.map(i => `<div class="ins panel ${i.sev >= 5 ? 'hi' : ''}"><span class="sev"></span><b>${esc(i.title)}</b><p>${esc(i.text)}</p></div>`).join('') : `<div class="ins panel"><span class="sev" style="background:var(--good)"></span><b>Rien à redire</b><p>Mécaniques propres. Tente la difficulté au-dessus.</p></div>`;
    h += `</section>`;
    if (deaths.length) h += `<section class="jsec"><h3>Morts<small>${deaths.length}</small></h3><div class="deaths">${deaths.slice(0, 14).map(d => `<div><span class="num">${G.fmtT(d.t)}</span><b>${esc(d.name)}</b><span>${esc(d.cause)}</span></div>`).join('')}${deaths.length > 14 ? `<div><span></span><span></span><span>… et ${deaths.length - 14} autres</span></div>` : ''}</div></section>`;
    const row = (r, v) => ({ name: r.name, v, color: C[r.cls].color });
    const dps = R.raiders.map(r => row(r, r.stats.dmg / dur)).sort((a, b) => b.v - a.v).map(r => Object.assign(r, { label: Math.round(r.v).toLocaleString('fr-FR') }));
    const hps = R.raiders.filter(r => r.stats.heal > 1000).map(r => row(r, r.stats.heal / dur)).sort((a, b) => b.v - a.v).map(r => Object.assign(r, { label: Math.round(r.v).toLocaleString('fr-FR') }));
    h += `<section class="jsec"><h3>Dégâts par seconde<small>raid : ${(raidDps / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}k</small></h3>${meter(dps)}</section><section class="jsec"><h3>Soins par seconde</h3>${meter(hps)}</section>`;
    const av = R.raiders.map(r => Object.assign(row(r, r.stats.avoid), { color: '#ff4f6a' })).filter(r => r.v > 500).sort((a, b) => b.v - a.v).slice(0, 10).map(r => Object.assign(r, { label: k(r.v) }));
    if (av.length) h += `<section class="jsec"><h3>Dégâts évitables subis<small>qui aurait dû bouger</small></h3>${meter(av)}</section>`;
    $('#repBody').innerHTML = h;
    $('#repFoot').innerHTML = kill ? `<button class="btn primary" id="rLoot">Distribuer le butin</button>` : `<button class="btn" id="rHub">Citadelle</button><button class="btn" id="rComp">Composer</button><button class="btn primary" id="rRetry">Retenter</button>`;
    const rl = $('#rLoot'); if (rl) rl.onclick = () => { renderLoot(); show('loot'); };
    const rr = $('#rRetry'); if (rr) rr.onclick = () => { SND.unlock(); R3.unbind(); startFight(lastSetup); };
    const rc = $('#rComp'); if (rc) rc.onclick = () => { R3.unbind(); S = null; renderRoster(); show('roster'); };
    const rh = $('#rHub'); if (rh) rh.onclick = () => { R3.unbind(); S = null; show('hub'); };
    $('#report .page-scroll').scrollTop = 0;
  }

  // ---------- BUTIN ----------
  const FOR = { all: 'Tous', tank: 'Tanks', heal: 'Soigneurs', dps: 'Tous DPS', ranged: 'DPS distance', melee: 'DPS mêlée', support: 'Tanks et soigneurs' };
  function renderLoot() {
    if (!lootPlan) return;
    $('#lootTitle').textContent = 'Butin · ' + lootBoss.name;
    $('#lootBody').innerHTML = `<p class="rules">${lootPlan.length} objets, +${Math.round(lootPlan[0] ? lootPlan[0].bonus * 100 : 0)} % de puissance chacun. Le système propose selon les parts d’équité ; touche un autre nom pour changer.</p>` +
      lootPlan.map((L, i) => `<article class="loot panel cut"><div class="loot-h"><b>${esc(L.item.name)}</b><small>${esc(L.item.slot)} · ${esc(FOR[L.item.for])}</small></div>
        <p class="why">${L.winner ? 'Proposé à <b style="color:var(--amber)">' + esc(person(L.winner).name) + '</b> : ' + esc(L.reason) : 'Personne n’est éligible : objet démantelé.'}</p>
        <div class="cands">${L.candidates.map(c => `<button class="cand" data-i="${i}" data-id="${c.id}" aria-pressed="${c.id === L.winner}"><span class="dot" style="background:${C[c.cls].color}"></span>${esc(c.name)} <span class="num">${c.parts} pt · ${Math.round(c.pow * 100)}</span></button>`).join('')}</div></article>`).join('') +
      `<p class="rules">Une part par victoire sans objet. Priorité au plus grand nombre de parts, puis au plus faible en puissance, puis au tirage. Recevoir un objet remet les parts à zéro.</p>`;
  }
  $('#lootBody').addEventListener('click', e => { const b = e.target.closest('.cand'); if (!b) return; const L = lootPlan[+b.dataset.i]; L.winner = b.dataset.id; L.reason = 'attribution manuelle du raid lead.'; renderLoot(); });
  $('#lootOk').onclick = () => {
    if (lootPlan) {
      const winners = new Set();
      for (const L of lootPlan) if (L.winner) { const p = st.pool[L.winner]; p.pow = Math.min(1.8, +(p.pow + L.bonus).toFixed(3)); p.parts = 0; p.loot = (p.loot || 0) + 1; winners.add(L.winner); }
      for (const id of lastSetup.raid) if (!winners.has(id)) st.pool[id].parts = (st.pool[id].parts || 0) + 1;
      save();
    }
    lootPlan = null; R3.unbind(); S = null;
    const bi = G.BOSSES.findIndex(b => b.id === st.boss);
    if (bi < G.BOSSES.length - 1 && bossUnlocked(bi + 1, st.diff).ok) st.boss = G.BOSSES[bi + 1].id;
    save(); show('hub');
  };

  // ---------- démarrage ----------
  R3.init($('#gl'));
  if (R3.setQuality && st.gfx && st.gfx !== 'auto') R3.setQuality(st.gfx);
  if (!window.R3) { const n = document.createElement('p'); n.className = 'boss-line'; n.style.color = 'var(--amber)'; n.textContent = 'Le moteur 3D n’a pas pu se charger : le jeu reste jouable, sans la scène.'; $('.hub-body').prepend(n); }
  window.addEventListener('resize', () => { R3.resize(); checkRotate(); requestAnimationFrame(measureHud); });
  window.addEventListener('orientationchange', () => setTimeout(() => { R3.resize(); checkRotate(); measureHud(); }, 250));
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('visibilitychange', () => { if (document.hidden && S && running && S.started && !S.over) { paused = true; syncPause(); $('#pause').hidden = false; } });
  function enterGame() { if (st.lead) show('hub'); else openPerso(); }
  function startLoad() {
    $('#loadRetry').hidden = true;
    const p = R3.load ? R3.load(f => { $('#loadFill').style.transform = `scaleX(${f})`; $('#loadTxt').textContent = 'Chargement des modèles et des textures… ' + Math.round(f * 100) + ' %'; }) : Promise.resolve();
    p.then(() => { $('#loadTxt').textContent = 'Prêt.'; setTimeout(enterGame, 150); })
      .catch(err => { $('#loadTxt').textContent = 'Un fichier n’a pas pu être chargé (' + (err && err.message || 'erreur') + '). Vérifie ta connexion puis réessaie.'; $('#loadRetry').hidden = false; });
  }
  $('#loadRetry').onclick = startLoad;
  show('loading'); startLoad();
  requestAnimationFrame(frame);
  window.__escadre = { manual(on) { manual = on; if (on) measureHud(); }, advance(dt, n) { for (let j = 0; j < (n || 1); j++) tick(dt); }, state: () => S, ui: UI, pick: handlePick, cast: castSpell, pull: () => { doPull(); pre = 0.01; }, finish() { if (S && S.over) { endTimer = 0; finishFight(); } }, ff(sec) { if (!S) return; pre = 0; if (!S.started) G.pull(S); for (let t = 0; t < sec && !S.over; t += STEP) G.step(S, STEP); const ev = S.events.splice(0); R3.handleEvents(ev); uiEvents(ev); } };
})();
