// 🏈 The career pop-up: every regular season a player has had since 1999, with a tab per stat category and career
// totals. Shared by the Players, Matchups (box score names) and Charts (dots) pages: VMCareer.open(playerId, { cat })
// opens it, on the stat category given if the player has it. It loads careers.js (and players.js, for the player's name,
// position and photo, on pages that don't already have it) the first time it's needed, and brings its own window and styles.
// The stat columns (CATS) and derived stats (derive) live here too, and the Players page uses them for its tables.
(function () {
  const D = () => window.NFL_DATA || {};
  const $ = id => document.getElementById(id);
  const info = t => D().teamInfo?.[t] || {};
  const logo = (t, cls = 'slogo') => (info(t).logo ? `<img class="${cls}" src="${info(t).logo}" alt="" loading="lazy" onerror="this.remove()">` : '');
  // NFL headshots are ~3400px originals; ask their image server for a small face-centered crop instead
  const thumb = u => u.replace('f_auto,q_auto', 'f_auto,q_auto,w_96,h_96,c_thumb,g_face');
  const head = p => (p.headshot ? `<img class="head" src="${thumb(p.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : '<span class="head"></span>');

  // Team games played so far (qualifying minimums are per team game, like the NFL's own)
  const teamGames = t => D().snaps?.[`${D().currentSeason}|${t}`]?.s.length || 0;


  const div = (a, b) => (b ? a / b : 0);
  function derive(p) { // also used for the career pop-up's seasons and totals
    return {
    ...p,
    tkl: p.solo + p.ast,
    cmpPct: 100 * div(p.cmp, p.att), ypa: div(p.pyd, p.att), pydG: div(p.pyd, p.g), tdPct: 100 * div(p.ptd, p.att), intPct: 100 * div(p.int, p.att),
    rating: passerRating(p),
    ypc: div(p.ryd, p.car), rydG: div(p.ryd, p.g),
    ypr: div(p.recyd, p.rec), recydG: div(p.recyd, p.g), catchPct: 100 * div(p.rec, p.tgt), tsharePct: 100 * p.tshare,
    fgPct: 100 * div(p.fgm, p.fga), xpPct: 100 * div(p.xpm, p.xpa), kpts: 3 * p.fgm + p.xpm,
    puntAvg: div(p.puntyd, p.punts),
    retyd: p.kryd + p.pryd,
    fptsG: div(p.fpts, p.g),
    scrim: p.ryd + p.recyd,
    };
  }
  function passerRating(p) { // NFL passer rating
    if (!p.att) return 0;
    const c = x => Math.max(0, Math.min(2.375, x));
    const a = c((p.cmp / p.att - 0.3) * 5), b = c((p.pyd / p.att - 3) * 0.25), t = c((p.ptd / p.att) * 20), i = c(2.375 - (p.int / p.att) * 25);
    return ((a + b + t + i) / 6) * 100;
  }


  // ---------- categories: which players belong, which columns, default sort ----------
  // col: [key, label, tooltip, decimals ('' = whole number)]
  const CATS = [
    { id: 'passing', title: 'Passing', has: p => p.att > 0, sort: 'pyd',
      qual: { test: p => p.att >= 14 * teamGames(p.team), text: '14 pass attempts per team game' },
      cols: [['g', 'G', 'Games played'], ['cmp', 'CMP', 'Completions'], ['att', 'ATT', 'Pass attempts'], ['cmpPct', 'CMP%', 'Completion percentage', 1],
        ['pyd', 'YDS', 'Passing yards'], ['ypa', 'Y/A', 'Yards per pass attempt', 1], ['pydG', 'Y/G', 'Passing yards per game', 1], ['ptd', 'TD', 'Passing touchdowns'],
        ['tdPct', 'TD%', 'Touchdown passes per attempt', 1], ['int', 'INT', 'Interceptions thrown'], ['intPct', 'INT%', 'Interceptions per attempt', 1],
        ['sk', 'SACK', 'Times sacked'], ['cpoe', 'CPOE', 'Completion % over expected: how much more often passes are caught than an average QB would manage on the same throws', 1],
        ['rating', 'RTG', 'NFL passer rating (0–158.3)', 1]] },
    { id: 'rushing', title: 'Rushing', has: p => p.car > 0, sort: 'ryd',
      qual: { test: p => p.car >= 6.25 * teamGames(p.team), text: '6.25 carries per team game' },
      cols: [['g', 'G', 'Games played'], ['car', 'CAR', 'Rushing attempts (carries)'], ['ryd', 'YDS', 'Rushing yards'], ['ypc', 'AVG', 'Yards per carry', 1],
        ['rydG', 'Y/G', 'Rushing yards per game', 1], ['rtd', 'TD', 'Rushing touchdowns'], ['fum', 'FUM', 'Fumbles lost']] },
    { id: 'receiving', title: 'Receiving', has: p => p.tgt > 0, sort: 'recyd',
      qual: { test: p => p.rec >= 1.875 * teamGames(p.team), text: '1.875 receptions per team game' },
      cols: [['g', 'G', 'Games played'], ['rec', 'REC', 'Receptions'], ['tgt', 'TGT', 'Times targeted'], ['catchPct', 'CTCH%', 'Catch rate: receptions per target', 1],
        ['recyd', 'YDS', 'Receiving yards'], ['ypr', 'AVG', 'Yards per reception', 1], ['recydG', 'Y/G', 'Receiving yards per game', 1],
        ['rectd', 'TD', 'Receiving touchdowns'], ['tsharePct', 'TGT%', "Target share: share of the team's targets", 1]] },
    { id: 'defense', title: 'Defense', has: p => p.tkl + p.dsk + p.dint + p.pd + p.ff > 0, sort: 'tkl',
      cols: [['g', 'G', 'Games played'], ['tkl', 'TOT', 'Total tackles (solo + assisted)'], ['solo', 'SOLO', 'Solo tackles'], ['ast', 'AST', 'Assisted tackles'],
        ['tfl', 'TFL', 'Tackles for loss'], ['dsk', 'SACK', 'Sacks', 1], ['qbh', 'QBH', 'Quarterback hits'], ['dint', 'INT', 'Interceptions'],
        ['pd', 'PD', 'Passes defended'], ['ff', 'FF', 'Forced fumbles'], ['dtd', 'TD', 'Defensive touchdowns']] },
    { id: 'kicking', title: 'Kicking', has: p => p.fga + p.xpa > 0, sort: 'fgm',
      qual: { test: p => p.fga >= teamGames(p.team), text: '1 field goal attempt per team game' },
      cols: [['g', 'G', 'Games played'], ['fgm', 'FGM', 'Field goals made'], ['fga', 'FGA', 'Field goals attempted'], ['fgPct', 'FG%', 'Field goal percentage', 1],
        ['fglong', 'LNG', 'Longest field goal made'], ['xpm', 'XPM', 'Extra points made'], ['xpa', 'XPA', 'Extra points attempted'],
        ['xpPct', 'XP%', 'Extra point percentage', 1], ['kpts', 'PTS', 'Points scored kicking (3 × FG + XP)']] },
    { id: 'punting', title: 'Punting', has: p => p.punts > 0, sort: 'puntyd',
      qual: { test: p => p.punts >= 3.125 * teamGames(p.team), text: '3.125 punts per team game' },
      cols: [['g', 'G', 'Games played'], ['punts', 'PUNTS', 'Punts'], ['puntyd', 'YDS', 'Punting yards'], ['puntAvg', 'AVG', 'Yards per punt', 1]] },
    { id: 'returns', title: 'Returns', has: p => p.kryd + p.pryd > 0, sort: 'retyd',
      cols: [['g', 'G', 'Games played'], ['kryd', 'KR YDS', 'Kickoff return yards'], ['pryd', 'PR YDS', 'Punt return yards'], ['retyd', 'TOTAL', 'Total return yards']] },
    { id: 'fantasy', title: 'Fantasy (PPR)', has: p => p.fpts !== 0, sort: 'fpts',
      cols: [['g', 'G', 'Games played'], ['fpts', 'PTS', 'Fantasy points, PPR scoring (1 point per reception)', 1], ['fptsG', 'PTS/G', 'Fantasy points per game', 1],
        ['pyd', 'PASS YDS', 'Passing yards'], ['ptd', 'PASS TD', 'Passing touchdowns'], ['ryd', 'RUSH YDS', 'Rushing yards'], ['rtd', 'RUSH TD', 'Rushing touchdowns'],
        ['rec', 'REC', 'Receptions'], ['recyd', 'REC YDS', 'Receiving yards'], ['rectd', 'REC TD', 'Receiving touchdowns']] },
  ];


  // ---------- loading players.js / careers.js on demand ----------
  const scripts = {};
  const loadScript = (src, global) => (window[global] ? Promise.resolve(window[global]) : scripts[src] ||= new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src });
    s.onload = () => resolve(window[global]);
    s.onerror = () => { delete scripts[src]; reject(new Error(src + ' not found')); };
    document.head.appendChild(s);
  }));
  const loadCareers = () => loadScript('careers.js', 'NFL_CAREERS');
  let byId = null;
  const loadPlayers = () => loadScript('players.js', 'NFL_PLAYERS').catch(() => null);
  function findPlayer(id) {
    const P = window.NFL_PLAYERS; if (!P) return null;
    if (!byId) byId = new Map(P.rows.map(r => Object.fromEntries(P.cols.map((c, i) => [c, r[i]]))).filter(p => p.id && p.name).map(p => [p.id, p]));
    return byId.get(id) || null;
  }

  // ---------- the window (added to the page the first time it opens) ----------
  const CSS = `#career { position: fixed; inset: 0; z-index: 25; background: rgba(0,0,0,.45); display: flex; align-items: flex-start; justify-content: center; padding: 40px 16px; overflow: auto; }
    #career[hidden] { display: none; }
    #career > .panel { width: 100%; max-width: 1100px; margin: 0; position: relative; text-align: left; }
    #career .close { position: absolute; top: 10px; right: 12px; border: 0; background: none; font-size: 22px; line-height: 1; cursor: pointer; color: var(--muted); }
    #career .close:hover { color: var(--text); }
    #career .chead { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding-right: 30px; }
    #career .chead .head { height: 64px; width: 64px; margin: 0; }
    #career .chead b { font-size: 20px; display: block; }
    #career .stints { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
    #career .stint { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--border); border-radius: 999px; padding: 3px 10px 3px 6px; font-size: 13px; }
    #career .stint img { height: 18px; width: 18px; object-fit: contain; }
    #career .stint .muted { font-size: 12px; }
    #career .ccats { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
    #career .ccats button { border: 1px solid var(--border); background: var(--panel); color: var(--text); border-radius: 999px; padding: 6px 16px; cursor: pointer; font-weight: 600; }
    #career .ccats button:hover { border-color: var(--accent); }
    #career .ccats button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
    #career .empty { padding: 30px; text-align: center; color: var(--muted); }
    #career .muted { color: var(--muted); }
    #career .scroll { overflow-x: auto; }
    #career table.stat { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
    #career .stat th, #career .stat td { padding: 6px 8px; border-bottom: 1px solid var(--border); text-align: right; white-space: nowrap; }
    #career .stat th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); font-weight: 600; }
    #career .stat td.l, #career .stat th.l { text-align: left; }
    #career .stat tr:hover td { background: var(--soft); }
    #career .slogo { height: 16px; width: 16px; object-fit: contain; vertical-align: -3px; margin-right: 4px; }
    #career .head { border-radius: 50%; object-fit: cover; background: var(--soft); }
    #career .ctable td.tm { white-space: nowrap; }
    #career .ctable td.tm .slogo:not(:first-child) { margin-left: 6px; }
    #career .ctable tr.tot td { font-weight: 700; border-top: 2px solid var(--border); background: var(--soft); }
    #career .ctable .yr { font-weight: 600; }`;
  function ensureWindow() {
    if ($('career')) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = Object.assign(document.createElement('div'), { id: 'career', hidden: true });
    el.innerHTML = `<div class="panel" role="dialog" aria-modal="true">
      <button class="close" id="cclose" title="Close (Esc)">×</button>
      <div class="chead" id="chead"></div>
      <div class="stints" id="stints"></div>
      <div class="ccats" id="ccats"></div>
      <div class="scroll"><table class="stat ctable" id="ctable"></table></div></div>`;
    document.body.appendChild(el);
    $('cclose').addEventListener('click', closeCareer);
    el.addEventListener('click', e => {
      if (e.target === el) return closeCareer();
      const c = cPlayer?.cats.find(x => x.id === e.target.closest('#ccats button')?.dataset.c);
      if (c) { cCat = c; renderCareer(); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.hidden) closeCareer(); });
  }

  let cPlayer, cCat;
  const POS_CAT = { QB: 'passing', RB: 'rushing', FB: 'rushing', WR: 'receiving', TE: 'receiving', K: 'kicking', P: 'punting' };
  // A season's teams: one code, or [[team, games], ...] when traded mid-season
  const seasonTeams = r => (Array.isArray(r.teams) ? r.teams : [[r.teams, r.g]]);

  async function openCareer(id, opts = {}) {
    $('career').hidden = false; document.body.style.overflow = 'hidden';
    $('chead').innerHTML = ''; $('stints').innerHTML = ''; $('ccats').innerHTML = '';
    $('ctable').innerHTML = '<tr><td class="empty">Loading career stats…</td></tr>';
    await loadPlayers(); // the name, position and photo (already loaded on the Players and Charts pages)
    const p = findPlayer(id) || { id, name: opts.name || 'Player', pos: opts.pos || '', team: opts.team || '' };
    if ($('career').hidden) return; // closed while loading
    window.VM && VM.add('careers', id); // 🏆
    $('chead').innerHTML = `${head(p)}<div><b>${p.name}</b><span class="muted">${p.pos} · ${info(p.team).name || p.team}</span></div>`;
    $('stints').innerHTML = ''; $('ccats').innerHTML = '';
    $('ctable').innerHTML = '<tr><td class="empty">Loading career stats…</td></tr>';
    let C;
    try { C = await loadCareers(); } catch { $('ctable').innerHTML = '<tr><td class="empty">Career stats aren\'t built yet: run node fetch.js, then node build_app.js.</td></tr>'; return; }
    if ($('career').hidden) return; // closed while loading
    const seasons = (C.players[id] || []).map(([season, teams, ...v]) => derive({ season, teams, ...Object.fromEntries(C.cols.map((c, i) => [c, v[i] || 0])) }));
    // Career totals: counting stats add up; CPOE is weighted by attempts; longest FG is the max; target share has no career value
    const sum = Object.fromEntries(C.cols.map(c => [c, seasons.reduce((n, s) => n + s[c], 0)]));
    sum.cpoe = div(seasons.reduce((n, s) => n + s.cpoe * s.att, 0), sum.att);
    sum.fglong = Math.max(0, ...seasons.map(s => s.fglong));
    const total = { ...derive(sum), tsharePct: null };
    // Stints with each team, in order (a trade year counts toward both teams)
    const stints = [];
    for (const s of seasons) for (const [t, g] of seasonTeams(s)) {
      const last = stints[stints.length - 1];
      if (last?.team === t) { last.to = s.season; last.g += g; } else stints.push({ team: t, from: s.season, to: s.season, g });
    }
    const cats = CATS.filter(c => seasons.some(c.has));
    cPlayer = { p, seasons, total, stints, cats };
    cCat = cats.find(c => c.id === opts.cat) || cats.find(c => c.id === POS_CAT[p.pos]) || cats.find(c => c.id === 'defense') || cats[0];
    renderCareer();
  }

  function renderCareer() {
    const { seasons, total, stints, cats } = cPlayer;
    const yrs = s => (s.from === s.to ? s.from : `${s.from}–${s.to}`);
    $('stints').innerHTML = stints.length ? `<span class="muted" style="align-self:center;font-size:13px">Teams</span>` + stints.map(s =>
      `<span class="stint" data-tip="<b>${info(s.team).name || s.team}</b>${yrs(s)}: ${s.g} game${s.g === 1 ? '' : 's'}">${logo(s.team, '')}<b>${s.team}</b><span class="muted">${yrs(s)}</span></span>`).join('') : '';
    if (!seasons.length) { $('ctable').innerHTML = '<tr><td class="empty">No regular-season stats on record.</td></tr>'; return; }
    $('ccats').innerHTML = cats.map(c => `<button data-c="${c.id}" class="${c === cCat ? 'on' : ''}">${c.title}</button>`).join('');
    const fmt = (v, d) => (v === null || !isFinite(v) ? '–' : d ? v.toFixed(d) : Math.round(v).toLocaleString());
    const cells = r => cCat.cols.map(([k, , , d]) => `<td>${fmt(r[k], d)}</td>`).join('');
    const teamCell = s => seasonTeams(s).map(([t, g]) => `<span${Array.isArray(s.teams) ? ` data-tip="<b>${info(t).name || t}</b>${g} game${g === 1 ? '' : 's'}"` : ''}>${logo(t)}${t}</span>`).join(' ');
    $('ctable').innerHTML = `<tr><th class="l">Season</th><th class="l">Team</th>${cCat.cols.map(([k, label, tip]) => `<th data-tip="<b>${label}</b>${tip}."><span class="tipped">${label}</span></th>`).join('')}</tr>` +
      seasons.map(s => `<tr><td class="l yr">${s.season}</td><td class="l tm">${teamCell(s)}</td>${cells(s)}</tr>`).join('') +
      `<tr class="tot"><td class="l">Career</td><td class="l">${seasons.length} season${seasons.length === 1 ? '' : 's'}</td>${cells(total)}</tr>`;
  }

  function closeCareer() { if ($('career')) $('career').hidden = true; document.body.style.overflow = ''; }


  window.VMCareer = { CATS, derive, div, teamGames, head, thumb, open: (id, opts) => { ensureWindow(); return openCareer(id, opts); }, close: closeCareer };
})();
