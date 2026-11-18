// 📺 The scrolling stat ticker along the bottom of every page, like the one on TV: the week's stat leaders (ticker-data.js,
// built by build_leaders.js) and, while games are on, live scores and yardage leaders (/api/live).
// It can be turned off with its ✕, in the 👤 menu or on the Leaders page. That choice follows the signed-in profile
// (the 'ticker' pref); signed out, this browser remembers it. Other code uses window.VMTicker.isOn() / .set(true or false).
// Going to another page keeps its place: the position, the pause and the data are kept for this tab in sessionStorage.
// 🚨 Two joke headlines (breaking.js) ride along on each loop, and a new pair comes up every 10 minutes.
(function () {
  const SPEED = 62, LIVE_MS = 30e3, IDLE_MS = 5 * 60e3, DATA_MS = 30 * 60e3, FRESH_MS = 10 * 60e3, NEWS_MS = 10 * 60e3; // pixels a second; how often to check for news
  const canFetch = location.protocol.startsWith('http');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

  const tab = { get: k => { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} } };

  function isOn() {
    const pref = window.VM?.profile() ? window.VM.pref('ticker') : undefined;
    return pref === undefined ? ls.get('vm.ticker') !== 'off' : pref !== false;
  }
  function set(on) {
    ls.set('vm.ticker', on ? 'on' : 'off');
    window.VM?.setPref('ticker', on);
    apply();
    window.dispatchEvent(new CustomEvent('vm:ticker', { detail: on }));
  }

  const CSS = `#vmticker { position: fixed; left: 0; right: 0; bottom: 0; z-index: 15; height: 36px; display: flex; align-items: stretch; background: #0a101c; color: #eef2f8;
      border-top: 2px solid #f5b301; font: 600 13px/34px system-ui, -apple-system, "Segoe UI", sans-serif; font-variant-numeric: tabular-nums; box-shadow: 0 -6px 18px rgba(0,0,0,.28); }
    body.vt-on { padding-bottom: 36px; } body.vt-on .vmtoasts { bottom: 52px; }
    #vmticker a { color: inherit; text-decoration: none; }
    #vmticker .vt-tag { flex: none; display: flex; align-items: center; gap: 7px; padding: 0 14px 0 12px; background: #f5b301; color: #0a101c; font-weight: 850; font-size: 12px; letter-spacing: .05em; text-transform: uppercase; white-space: nowrap;
      clip-path: polygon(0 0, 100% 0, calc(100% - 10px) 100%, 0 100%); padding-right: 22px; }
    #vmticker .vt-tag small { font-size: 10.5px; font-weight: 700; opacity: .72; letter-spacing: .03em; }
    #vmticker.is-live .vt-tag { background: #e11d2e; color: #fff; }
    #vmticker .vt-dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; animation: vtpulse 1.3s ease-in-out infinite; }
    @keyframes vtpulse { 50% { opacity: .25; } }
    #vmticker .vt-view { flex: 1; min-width: 0; overflow: hidden; }
    #vmticker .vt-track { display: flex; width: max-content; animation: vtmove var(--vt-time, 80s) linear infinite; }
    @keyframes vtmove { to { transform: translateX(-50%); } }
    #vmticker:hover .vt-track, #vmticker:focus-within .vt-track, #vmticker.paused .vt-track { animation-play-state: paused; }
    #vmticker .vt-copy { display: flex; flex: none; min-width: 100vw; white-space: nowrap; }
    #vmticker .vt-item { display: inline-flex; align-items: center; gap: 13px; padding: 0 22px 0 16px; border-right: 1px solid rgba(255,255,255,.14); }
    #vmticker a.vt-item:hover .vt-cat { color: #fff; text-decoration: underline; }
    #vmticker .vt-cat { color: #f5b301; font-size: 11.5px; font-weight: 850; letter-spacing: .07em; }
    #vmticker .vt-row { display: inline-flex; align-items: center; gap: 5px; font-weight: 550; }
    #vmticker .vt-row i { font-style: normal; color: #8f9db3; font-size: 11.5px; }
    #vmticker .vt-row img { width: 17px; height: 17px; object-fit: contain; }
    #vmticker .vt-row b { color: #fff; font-weight: 850; margin-left: 2px; }
    #vmticker .vt-game b { font-weight: 850; } #vmticker .vt-game .lose { color: #9aa8bd; font-weight: 600; }
    #vmticker .vt-clock { color: #ff8a93; font-size: 11.5px; font-weight: 800; } #vmticker .vt-clock.fin { color: #9aa8bd; }
    #vmticker .vt-news { gap: 9px; color: #fff; font-weight: 650; } #vmticker .vt-bk { background: #e11d2e; color: #fff; font-size: 11px; font-weight: 900; letter-spacing: .08em; line-height: 1; padding: 4px 7px; border-radius: 2px; }
    #vmticker .vt-btn { flex: none; width: 34px; border: 0; border-left: 1px solid rgba(255,255,255,.14); background: #0a101c; color: #b8c4d6; cursor: pointer; font-size: 13px; line-height: 1; }
    #vmticker .vt-btn:hover, #vmticker .vt-btn:focus-visible { background: #1b2740; color: #fff; }
    .vt-note { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 60; background: #0a101c; color: #eef2f8; border: 1px solid #f5b301; border-radius: 999px; padding: 6px 14px; font: 600 12.5px system-ui, sans-serif; box-shadow: 0 6px 18px rgba(0,0,0,.3); }
    @media (max-width: 640px) { #vmticker .vt-tag small { display: none; } #vmticker .vt-tag { padding-left: 9px; padding-right: 18px; } #vmticker .vt-btn { width: 30px; } }
    @media (prefers-reduced-motion: reduce) { #vmticker .vt-view { overflow-x: auto; scrollbar-width: none; } #vmticker .vt-track { animation: none; } #vmticker .vt-dot { animation: none; } }
    @media print { #vmticker { display: none; } body.vt-on { padding-bottom: 0; } }`;

  const kept = tab.get('vm.tickerData'), keptLive = tab.get('vm.tickerLive');
  let T = window.NFL_TICKER || kept?.T || null, live = keptLive && Date.now() - keptLive.at < 60e3 ? keptLive.live : null, el = null, pending = null, pollTimer = null, dataTimer = null, newsTimer = null, shown = '';

  const logo = (t, src) => (src ? `<img src="${esc(src.replace('/i/teamlogos/', '/combiner/i?img=/i/teamlogos/').replace(/\.png$/, '.png&w=48&h=48'))}" alt="${esc(t)}" loading="lazy" onerror="this.remove()">` : esc(t));
  const liveLabel = { pass: 'LIVE PASS', rush: 'LIVE RUSH', rec: 'LIVE REC' };
  function itemsHtml() {
    const out = [];
    if (live?.anyLive) {
      // the games on right now first, then the ones already over
      const games = live.games.filter(g => g.state !== 'pre').sort((a, b) => (a.state === 'in' ? 0 : 1) - (b.state === 'in' ? 0 : 1));
      for (const g of games) {
        const on = g.state === 'in', aw = g.away.score >= g.home.score, hw = g.home.score >= g.away.score;
        out.push(`<a class="vt-item vt-game" href="leaders.html"><span class="vt-row">${logo(g.away.abbr, g.away.logo)}<span class="${aw ? '' : 'lose'}">${esc(g.away.abbr)} <b class="${aw ? '' : 'lose'}">${g.away.score ?? 0}</b></span></span>
          <span class="vt-row">${logo(g.home.abbr, g.home.logo)}<span class="${hw ? '' : 'lose'}">${esc(g.home.abbr)} <b class="${hw ? '' : 'lose'}">${g.home.score ?? 0}</b></span></span>
          <span class="vt-clock ${on ? '' : 'fin'}">${esc(g.detail)}${on && g.redzone ? ' 🔴' : ''}</span></a>`);
      }
      for (const [cat, rows] of Object.entries(live.top || {})) if (rows.length) out.push(`<a class="vt-item" href="leaders.html"><span class="vt-cat">${liveLabel[cat]}</span>${rows.map((r, i) => `<span class="vt-row"><i>${i + 1}</i>${esc(r.name)} <span style="color:#9aa8bd">${esc(r.team)}</span> <b>${r.yds}</b></span>`).join('')}</a>`);
    }
    // two headlines per loop, the same for everybody until the next pair comes up
    const news = T?.news || [], slot = Math.floor(Date.now() / NEWS_MS) * 2, flash = i => (news.length ? `<span class="vt-item vt-news" title="Satire. None of this happened."><span class="vt-bk">🚨 BREAKING</span>${esc(news[(slot + i) % news.length])}</span>` : '');
    if (T && !T.none) T.items.forEach((it, n) => { if (n === 2) out.push(flash(0)); if (n === 5) out.push(flash(1)); out.push(`<a class="vt-item" href="leaders.html#${esc(it.key)}"><span class="vt-cat">${esc(it.label)}</span>${it.rows.map(([name, team, v], i) => `<span class="vt-row"><i>${i + 1}</i>${logo(team, T.logos[team])}${esc(name)} <b>${esc(v)}</b></span>`).join('')}</a>`); });
    return out.join('');
  }
  const tagHtml = () => (live?.anyLive ? '<span class="vt-dot"></span>Live'
    : T && !T.none ? `${esc(T.label)} leaders<small>${esc(T.tag)} · ${esc(T.status)}</small>` : '');

  // ---------- keeping its place between pages ----------
  function savePos() {
    if (!el || el.hidden) return;
    const track = el.querySelector('.vt-track'), view = el.querySelector('.vt-view'), a = track.getAnimations()[0], w = track.firstChild?.offsetWidth || 0;
    const dur = a?.effect.getComputedTiming().duration;
    tab.set('vm.tickerPos', { px: a && dur ? ((a.currentTime % dur) / dur) * w : view.scrollLeft, at: Date.now(), moving: a?.playState === 'running', paused: el.classList.contains('paused') });
  }
  function restorePos() {
    const p = tab.get('vm.tickerPos'); if (!p) return;
    const track = el.querySelector('.vt-track'), a = track.getAnimations()[0], w = track.firstChild.offsetWidth;
    if (!a) { el.querySelector('.vt-view').scrollLeft = p.px; return; }
    const px = p.px + (p.moving && !p.paused ? ((Date.now() - p.at) / 1000) * SPEED : 0); // it kept rolling while the page loaded
    a.currentTime = ((px % w) / w) * a.effect.getComputedTiming().duration;
  }
  window.addEventListener('pagehide', savePos);
  window.addEventListener('pageshow', e => { if (e.persisted && el) restorePos(); }); // back / forward

  function paint(html, restore = false) {
    const track = el.querySelector('.vt-track');
    track.innerHTML = `<div class="vt-copy">${html}</div>` + (still.matches ? '' : `<div class="vt-copy" aria-hidden="true">${html.replace(/<a /g, '<a tabindex="-1" ')}</div>`);
    track.style.setProperty('--vt-time', `${Math.max(20, Math.round(track.firstChild.offsetWidth / SPEED))}s`);
    if (restore) restorePos();
  }
  function update() {
    if (!el) return;
    const html = itemsHtml();
    el.hidden = !html;
    document.body.classList.toggle('vt-on', !!html);
    const wentLive = el.classList.contains('is-live') !== !!live?.anyLive; // kickoff or the final whistle: show it right away
    el.classList.toggle('is-live', !!live?.anyLive);
    el.querySelector('.vt-tag').innerHTML = tagHtml();
    if (html === shown) return;
    const first = !shown; shown = html;
    if (first || wentLive || still.matches) { pending = null; paint(html, first); } else pending = html; // new numbers go in when the loop comes around, so it never jumps
  }

  function mount() {
    if (el) return;
    if (!document.getElementById('vt-css')) { const st = Object.assign(document.createElement('style'), { id: 'vt-css', textContent: CSS }); document.head.appendChild(st); }
    el = Object.assign(document.createElement('div'), { id: 'vmticker', hidden: true });
    el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'NFL stat leaders');
    el.innerHTML = `<a class="vt-tag" href="leaders.html" title="Open the stat leaders page"></a><div class="vt-view"><div class="vt-track"></div></div>
      <button type="button" class="vt-btn" id="vtPause" title="Pause the ticker" aria-label="Pause the ticker">❚❚</button><button type="button" class="vt-btn" id="vtOff" title="Turn the ticker off" aria-label="Turn the ticker off">✕</button>`;
    document.body.appendChild(el);
    el.querySelector('.vt-track').addEventListener('animationiteration', () => { if (pending) { paint(pending); pending = null; } });
    el.querySelector('#vtPause').onclick = e => { const p = el.classList.toggle('paused'); e.currentTarget.textContent = p ? '▶' : '❚❚'; e.currentTarget.title = p ? 'Play the ticker' : 'Pause the ticker'; e.currentTarget.setAttribute('aria-label', e.currentTarget.title); };
    el.querySelector('#vtOff').onclick = () => {
      set(false);
      const n = Object.assign(document.createElement('div'), { className: 'vt-note', textContent: 'Ticker off. Turn it back on in the 👤 menu.' });
      document.body.appendChild(n); setTimeout(() => n.remove(), 4500);
    };
    if (tab.get('vm.tickerPos')?.paused) { const b = el.querySelector('#vtPause'); el.classList.add('paused'); b.textContent = '▶'; b.title = 'Play the ticker'; b.setAttribute('aria-label', b.title); }
    el.classList.toggle('is-live', !!live?.anyLive);
    shown = ''; update(); poll();
    dataTimer = setInterval(loadData, DATA_MS);
    newsTimer = setInterval(update, 60e3);
  }
  function unmount() {
    clearTimeout(pollTimer); clearInterval(dataTimer); clearInterval(newsTimer);
    el?.remove(); el = null; shown = ''; pending = null;
    document.body.classList.remove('vt-on');
  }
  function apply() { isOn() ? load() : unmount(); }

  // ---------- the data: the week's leaders, and live games when there are any ----------
  function loadData() {
    if (document.hidden) return Promise.resolve();
    return new Promise(res => {
      const s = Object.assign(document.createElement('script'), { src: `ticker-data.js?t=${Date.now()}` });
      s.onload = () => { T = window.NFL_TICKER || T; tab.set('vm.tickerData', { at: Date.now(), T }); s.remove(); update(); res(); };
      s.onerror = () => { s.remove(); res(); };
      document.head.appendChild(s);
    });
  }
  async function poll() {
    clearTimeout(pollTimer);
    if (!canFetch || !el) return;
    if (!document.hidden) { try { const r = await (await fetch('/api/live')).json(); if (r.ok) { live = r; tab.set('vm.tickerLive', { at: Date.now(), live: r }); update(); } } catch { /* no live section */ } }
    if (el) pollTimer = setTimeout(poll, live?.anyLive ? LIVE_MS : IDLE_MS);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && el) poll(); });
  async function load() {
    if (el) return;
    if (!T) await loadData(); else if (!kept || Date.now() - kept.at > FRESH_MS) loadData(); // the copy from the last page is good for a while
    if (isOn()) mount();
  }

  window.VMTicker = { isOn, set };
  window.addEventListener('vm:prefs', apply);
  window.addEventListener('vm:profile', apply);
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', apply) : apply();
})();
