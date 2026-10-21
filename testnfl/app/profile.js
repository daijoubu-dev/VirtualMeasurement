// 👤 Profiles, achievements and points on every page.
// Pages report what happens through window.VM:
//   VM.count('sb_sims')          add to a counter          VM.add('takes', 'qb|Josh Allen')   collect something
//   VM.unlock('perfect')         unlock an achievement directly
// Events are batched to the server ("testnfl profiles" next to the app, see profiles.js), which decides what unlocks and awards
// the points; unlocks pop up as toasts. Without a profile, or when the page is opened as a file (no server), events are
// simply ignored.
// 🔑 Signing in takes the profile's PIN (4 digits and 1 letter). The server answers with a token that this browser keeps
// and sends with every change (VM.headers()); a profile made before PINs gets one the first time someone signs in to it.
// ⚙ Per-profile settings (favorite team, the matchup page's stats…) live on the server: VM.pref('fav') reads them right
// away from this browser's copy, VM.setPref('fav', 'KC') saves them, and a 'vm:prefs' event fires when they change
// (signing in or out, or the server's copy arriving). Signing in or out also fires 'vm:profile'.
(function () {
  const API = '/api/profiles', canTrack = location.protocol.startsWith('http');
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };
  let me = ls.get('vm.profile') || '', token = ls.get('vm.token') || '';
  if (!token) me = ''; // signed in before PINs existed: sign in again
  let prefs = (() => { try { return me ? JSON.parse(ls.get('vm.prefs') || '{}') : {}; } catch { return {}; } })();
  let queue = [], timer = null, balance = null, name = '';
  const sentItems = new Set(); // set items already sent from this page (the server ignores repeats anyway)
  const headers = () => ({ 'Content-Type': 'application/json', ...(token ? { 'X-VM-Token': token } : {}) });
  const post = (url, body) => fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body) }).then(r => r.json());
  function push(e) {
    if (!canTrack || !me) return;
    if (e.type === 'add') { const k = e.key + '|' + e.item; if (sentItems.has(k)) return; sentItems.add(k); }
    queue.push(e); clearTimeout(timer); timer = setTimeout(flush, 400);
  }
  async function flush() {
    if (!queue.length || !me) return;
    const events = queue; queue = [];
    try {
      const r = await post(`${API}/${me}/track`, { events });
      if (!r.ok) { if (/sign in/i.test(r.error || '')) signedOut(); return; }
      balance = r.balance; draw(); window.dispatchEvent(new CustomEvent("vm:update", { detail: r }));
      r.unlocked.forEach((a, i) => setTimeout(() => toast(a), i * 700));
    } catch { /* offline: drop it */ }
  }
  window.addEventListener('pagehide', () => { if (queue.length && me && navigator.sendBeacon) navigator.sendBeacon(`${API}/${me}/track`, new Blob([JSON.stringify({ events: queue, token })], { type: 'application/json' })); });

  // ---------- ⚙ per-profile settings ----------
  let prefTimer = null, prefDirty = {};
  const samePrefs = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});
  function setPrefs(next, fire = true) {
    const changed = !samePrefs(prefs, next);
    prefs = next || {}; ls.set('vm.prefs', me ? JSON.stringify(prefs) : null);
    if (changed && fire) window.dispatchEvent(new CustomEvent('vm:prefs', { detail: prefs }));
  }
  function setPref(key, value) {
    if (!me) return false;
    setPrefs({ ...prefs, [key]: value }, false);
    prefDirty[key] = value; clearTimeout(prefTimer);
    prefTimer = setTimeout(() => { const b = prefDirty; prefDirty = {}; post(`${API}/${me}/prefs`, b).catch(() => {}); }, 500);
    return true;
  }

  window.VM = {
    count: (key, n = 1) => push({ type: 'count', key, n }),
    add: (key, item) => push({ type: 'add', key, item: String(item) }),
    unlock: key => push({ type: 'unlock', key }),
    profile: () => me, balance: () => balance, name: () => name,
    headers, auth: () => (me && token ? `${me}:${token}` : ''), // for requests the pages make themselves
    pref: key => (me ? prefs[key] : undefined), setPref,
    toast: a => toast(a), setBalance: b => { balance = b; draw(); }, // for pages that talk to the server themselves (Ultimate Team)
    spend: async (amount, reason) => { const r = await post(`${API}/${me}/spend`, { amount, reason }); if (r.ok) { balance = r.balance; draw(); } return r; },
    signedOut: () => signedOut(),
  };

  // ---------- header widget ----------
  const css = `.vmprof { position: relative; display: inline-flex; align-items: center; margin-left: 8px; font-size: 13px; }
    .vmprof > button { border: 1px solid var(--border); background: var(--soft); color: var(--text); border-radius: 999px; padding: 4px 12px; cursor: pointer; font-weight: 650; white-space: nowrap; }
    .vmprof > button:hover { border-color: var(--accent); } .vmprof .pts { color: var(--gold); margin-left: 6px; }
    .vmpanel { position: absolute; right: 0; top: calc(100% + 6px); z-index: 40; width: 270px; max-width: calc(100vw - 24px); background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.25); }
    .vmpanel h4 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
    .vmpanel .who { display: flex; justify-content: space-between; width: 100%; border: 1px solid transparent; background: none; color: var(--text); padding: 5px 8px; border-radius: 6px; cursor: pointer; text-align: left; }
    .vmpanel .who:hover { background: var(--soft); } .vmpanel .who.on { border-color: var(--accent); }
    .vmpanel .who span { color: var(--gold); font-variant-numeric: tabular-nums; }
    .vmpanel form { display: flex; gap: 6px; margin: 8px 0; flex-wrap: wrap; } .vmpanel input { flex: 1; min-width: 0; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border); background: var(--panel); color: var(--text); }
    .vmpanel input.pin { flex: 0 0 76px; text-transform: uppercase; letter-spacing: .12em; font-variant-numeric: tabular-nums; }
    .vmpanel form button, .vmpanel .lnk { border: 1px solid var(--border); background: var(--soft); color: var(--text); border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px; text-decoration: none; }
    .vmpanel .pinbox { border: 1px solid var(--accent); border-radius: 8px; padding: 8px; margin: 6px 0; font-size: 12px; }
    .vmpanel .hint { font-size: 11.5px; color: var(--muted); }
    .vmpanel .err { color: var(--loss); font-size: 12px; min-height: 0; } .vmpanel .row { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
    .vmtoasts { position: fixed; right: 16px; bottom: 16px; z-index: 60; display: flex; flex-direction: column; gap: 8px; }
    .vmtoast { background: var(--panel); border: 1px solid var(--gold); border-radius: 12px; padding: 10px 14px; box-shadow: 0 8px 24px rgba(0,0,0,.3); min-width: 260px; animation: vmin .35s ease; }
    .vmtoast .k { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--gold); font-weight: 700; } .vmtoast .n { font-weight: 800; font-size: 15px; } .vmtoast .d { font-size: 12px; color: var(--muted); }
    @keyframes vmin { from { transform: translateY(12px); opacity: 0; } to { transform: none; opacity: 1; } }`;
  let box, panelOpen = false, profilesCache = [], pinFor = null, pinErr = '';
  function toast(a) {
    let t = document.querySelector('.vmtoasts'); if (!t) { t = Object.assign(document.createElement('div'), { className: 'vmtoasts' }); document.body.appendChild(t); }
    const el = Object.assign(document.createElement('div'), { className: 'vmtoast' });
    el.innerHTML = `<div class="k">🏆 Achievement unlocked · +${a.pts} pts</div><div class="n">${a.icon} ${a.name}</div><div class="d">${a.desc}</div>`;
    t.appendChild(el); setTimeout(() => el.remove(), 5500);
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PIN_HINT = '4 digits and 1 letter, like 4821K';
  function pinBox(p) {
    return `<div class="pinbox"><form id="vmPin">${p.pin ? `<b>PIN for ${esc(p.name)}</b>` : `<b>${esc(p.name)} has no PIN yet.</b> <span class="hint">Pick one now; you'll need it to sign in from now on.</span>`}
      <input class="pin" id="vmPinIn" maxlength="5" autocomplete="off" placeholder="1234A" autofocus><button type="submit">${p.pin ? 'Sign in' : 'Set PIN'}</button></form>
      <div class="hint">${PIN_HINT}</div>${pinErr ? `<div class="err">${esc(pinErr)}</div>` : ''}</div>`;
  }
  function draw() {
    if (!box) return;
    const focusPin = document.activeElement?.id === 'vmPinIn';
    box.innerHTML = `<button type="button" id="vmprofBtn" title="Profile, achievements and points">👤 ${me && name ? esc(name) : 'Sign in'}${me && balance !== null ? `<span class="pts">${(window.VM.adjust ? window.VM.adjust(balance) : balance).toLocaleString()} pts</span>` : ''}</button>`
      + (panelOpen ? `<div class="vmpanel">
        <h4>Profiles</h4>${profilesCache.map(p => `<button type="button" class="who ${p.id === me ? 'on' : ''}" data-vmid="${p.id}">${esc(p.name)}${p.pin ? '' : ' <small class="hint">(no PIN)</small>'}<span>${p.balance.toLocaleString()} pts</span></button>${pinFor === p.id ? pinBox(p) : ''}`).join('') || '<div class="d" style="font-size:12px;color:var(--muted)">No profiles yet.</div>'}
        <form id="vmNew"><input id="vmName" maxlength="24" placeholder="New profile name"><input class="pin" id="vmNewPin" maxlength="5" autocomplete="off" placeholder="PIN"><button type="submit">Create</button></form>
        <div class="hint">New profiles need a PIN: ${PIN_HINT}.</div><div class="err" id="vmErr"></div>
        <div class="row"><a class="lnk" href="achievements.html">🏆 Achievements</a>${me ? '<button type="button" class="lnk" id="vmOut">Sign out</button>' : ''}</div></div>` : '');
    if (focusPin || pinFor) document.getElementById('vmPinIn')?.focus();
  }
  function signedOut() {
    me = ''; token = ''; name = ''; balance = null;
    ls.set('vm.profile', null); ls.set('vm.token', null); setPrefs({}); draw();
    window.dispatchEvent(new CustomEvent('vm:profile', { detail: '' }));
  }
  async function loadMe() {
    if (!me) { name = ''; balance = null; return draw(); }
    try {
      const r = await (await fetch(`${API}/${me}`)).json();
      if (r.ok) { name = r.profile.name; balance = r.profile.balance; setPrefs(r.profile.prefs || {}); }
      else return signedOut();
    } catch {}
    draw();
  }
  async function openPanel() {
    panelOpen = true; pinFor = null; pinErr = ''; draw();
    try { profilesCache = (await (await fetch(API)).json()).profiles || []; } catch { profilesCache = []; }
    draw();
  }
  // signed in: remember the profile and its token, load its settings, tell the page
  function signedIn(id, tok, profile) {
    me = id; token = tok; ls.set('vm.profile', id); ls.set('vm.token', tok);
    panelOpen = false; pinFor = null; sentItems.clear();
    if (profile) { name = profile.name; balance = profile.balance; setPrefs(profile.prefs || {}); }
    draw();
    window.dispatchEvent(new CustomEvent('vm:profile', { detail: id }));
    window.VM.add('pages', page);
  }
  const page = (location.pathname.split('/').pop() || 'index.html').replace('.html', '') || 'index';
  function init() {
    if (!canTrack) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    box = Object.assign(document.createElement('div'), { className: 'vmprof' });
    (document.querySelector('header') || document.body).appendChild(box);
    box.addEventListener('click', async e => {
      if (e.target.closest('#vmprofBtn')) { panelOpen ? (panelOpen = false, draw()) : openPanel(); return; }
      const w = e.target.closest('[data-vmid]');
      if (w) { if (w.dataset.vmid === me) { panelOpen = false; return draw(); } pinFor = pinFor === w.dataset.vmid ? null : w.dataset.vmid; pinErr = ''; return draw(); }
      if (e.target.id === 'vmOut') { const [id, tok] = [me, token]; signedOut(); panelOpen = false; draw(); post(`${API}/${id}/logout`, { token: tok }).catch(() => {}); }
    });
    box.addEventListener('submit', async e => {
      e.preventDefault();
      if (e.target.id === 'vmPin') {
        const id = pinFor, r = await post(`${API}/${id}/login`, { pin: document.getElementById('vmPinIn').value }).catch(() => ({ ok: false, error: "The server didn't answer." }));
        if (!r.ok) { pinErr = r.error; return draw(); }
        return signedIn(id, r.token, r.profile);
      }
      const r = await post(API, { name: document.getElementById('vmName').value, pin: document.getElementById('vmNewPin').value }).catch(() => ({ ok: false, error: "The server didn't answer." }));
      if (!r.ok) { document.getElementById('vmErr').textContent = r.error; return; }
      signedIn(r.profile.id, r.token, r.profile); r.unlocked.forEach(toast);
    });
    document.addEventListener('click', e => { if (panelOpen && !e.composedPath().includes(box)) { panelOpen = false; draw(); } });
    loadMe().then(() => window.VM.add('pages', page));
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
