// 🎯 Pick'em: pick every game of the week against the spread.
// A correct pick pays BASE points for free, plus SEASON_COINS 🪙 coins for the current Ultimate Team season (a small
// edge in seasonal mode for good pickers). You can also stake any number of points on a pick: the stake comes off your
// balance when you lock in (so nobody ends up below zero), a win pays it back doubled, a push gives it back, and a loss
// keeps it. A pick is final once it's locked in: no changes, and the line at that moment is the one that counts. Locking
// in a game shows everyone else's picks on it (before kickoff, only to people who've locked in that game themselves).
// Picks are settled from the schedule's final scores, so a week settles with the next data refresh.
// Each profile keeps its picks in a "pickem" section: { <season>: { <game id>: { team, line, stake, at, res?, paid? } } }
// (line is the home team's spread as nflverse writes it: 3.5 = home favored by 3.5).
const fs = require('fs');
const path = require('path');
const profiles = require('./profiles');
const { currentSeason } = require('./fetch');

const BASE = 100, SEASON_COINS = 25;
const ROUND = { WC: 'Wild Card', DIV: 'Divisional round', CON: 'Conference Championships', SB: 'Super Bowl' };
const RAW = path.join(__dirname, 'data', 'raw');

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [h, ...data] = rows.filter(r => r.length > 1);
  return data.map(r => Object.fromEntries(h.map((k, j) => [k, r[j] ?? ''])));
}
// kickoff: the schedule gives the date and time in US Eastern
const NY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' });
function kickoff(day, time) {
  const [y, m, d] = day.split('-').map(Number), [hh, mm] = (time || '13:00').split(':').map(Number), utc = Date.UTC(y, m - 1, d, hh, mm);
  for (const off of [5, 4]) { const t = utc + off * 3600e3; if (+NY.format(t) === hh) return t; } // EST or EDT
  return utc + 5 * 3600e3;
}
// this season's schedule, re-read when a refresh rewrites it
let SCHED = null, stamp = 0, TEAMS = {};
function schedule() {
  const f = path.join(RAW, 'games.csv'); let m = 0; try { m = fs.statSync(f).mtimeMs; } catch { return []; }
  if (m !== stamp) {
    const season = currentSeason(), n = v => (v === '' || v === 'NA' ? null : +v);
    SCHED = parseCsv(fs.readFileSync(f, 'utf8')).filter(g => +g.season === season).map(g => ({
      id: g.game_id, season, week: +g.week, label: ROUND[g.game_type] || `Week ${g.week}`, kick: kickoff(g.gameday, g.gametime),
      away: g.away_team, home: g.home_team, line: n(g.spread_line), as: n(g.away_score), hs: n(g.home_score),
    })).sort((a, b) => a.kick - b.kick);
    try { TEAMS = Object.fromEntries(parseCsv(fs.readFileSync(path.join(RAW, 'teams_colors_logos.csv'), 'utf8')).map(t => [t.team_abbr, { name: t.team_name, logo: t.team_logo_espn, color: t.team_color }])); } catch {}
    stamp = m;
  }
  return SCHED;
}
const final = g => g.as !== null && g.hs !== null;
// the result of a pick: W, L or P(ush)
const resultOf = (pick, g) => { const margin = g.hs - g.as; if (margin === pick.line) return 'P'; return (margin > pick.line) === (pick.team === g.home) ? 'W' : 'L'; };
const seasonOf = p => ((p.pickem ||= {})[currentSeason()] ||= {});

// pay out every pick whose game is final (each profile is saved once, and only if something changed)
function settle() {
  const games = Object.fromEntries(schedule().map(g => [g.id, g]));
  for (const p0 of profiles.all()) {
    const mine = p0.pickem?.[currentSeason()]; if (!mine) continue;
    const due = Object.entries(mine).filter(([id, pk]) => !pk.res && games[id] && final(games[id]));
    if (!due.length) continue;
    const p = profiles.load(p0.id), picks = seasonOf(p), unlocked = [];
    for (const [id] of due) {
      const pk = picks[id], g = games[id]; if (pk.res) continue;
      pk.res = resultOf(pk, g);
      const label = `${pk.team} ${lineFor(pk.team, g, pk.line)} (${g.label})`;
      if (pk.res === 'W') {
        if (pk.stake) { profiles.credit(p, pk.stake, `Pick'em: stake back, ${label}`, { refund: true }); profiles.credit(p, pk.stake, `Pick'em: stake won, ${label}`); }
        profiles.credit(p, BASE, `Pick'em: correct pick, ${label}`, { boost: true });
        pk.paid = BASE + 2 * (pk.stake || 0);
        pk.coins = require('./ultimate_api').seasonCoins(p, SEASON_COINS); // (required here: ultimate_api loads after this file)
        p.counters.pe_wins = (p.counters.pe_wins || 0) + 1;
        if (pk.stake >= 250) profiles.award(p, 'pe_big', unlocked);
      } else if (pk.res === 'P' && pk.stake) { profiles.credit(p, pk.stake, `Pick'em: push, stake back, ${label}`, { refund: true }); pk.paid = pk.stake; }
      else pk.paid = 0;
      // a perfect week: 8+ picks, every one of them right
      const wk = Object.entries(picks).filter(([gid]) => games[gid]?.week === g.week && games[gid]?.season === g.season);
      if (wk.length >= 8 && wk.every(([, x]) => x.res === 'W') && schedule().filter(x => x.week === g.week).every(final)) profiles.award(p, 'pe_perfect', unlocked);
    }
    profiles.checkGoals(p, unlocked);
    profiles.save(p);
  }
}
// "KC -3.5" / "BUF +3.5" / "PK" from the picked team's side
function lineFor(team, g, line = g.line) {
  if (line === null) return 'no line';
  const own = team === g.home ? -line : line;
  return own === 0 ? 'PK' : (own > 0 ? '+' : '') + own;
}

// the week on show: the one with the next kickoff (once the season's done, its last week)
function weekOf(games, now = Date.now()) {
  const next = games.find(g => g.kick > now) || games[games.length - 1];
  return next ? next.week : null;
}
function view(pid, authed, wantWeek) {
  settle();
  const games = schedule(), now = Date.now(), weeks = [...new Set(games.filter(g => g.kick <= now || g.line !== null).map(g => g.week))];
  const week = weeks.includes(+wantWeek) ? +wantWeek : weekOf(games, now), wk = games.filter(g => g.week === week);
  const all = profiles.all(), me = pid ? all.find(p => p.id === pid) : null;
  const mine = me?.pickem?.[currentSeason()] || {};
  // everyone's picks on a game show once you've locked in your own pick on it, or once it has kicked off
  const seen = g => g.kick <= now || (authed && mine[g.id]);
  const pickedBy = g => (seen(g) ? all.map(p => ({ name: p.name, team: p.pickem?.[currentSeason()]?.[g.id]?.team })).filter(x => x.team) : null);
  const out = wk.map(g => ({ ...g, state: final(g) ? 'final' : g.kick <= now ? 'locked' : 'open', mine: authed || g.kick <= now ? mine[g.id] || null : null, crowd: pickedBy(g) }));
  // the season's standings: W-L-P and the points picks have won or lost
  const board = all.map(p => {
    const picks = Object.entries(p.pickem?.[currentSeason()] || {}), done = picks.filter(([, x]) => x.res);
    const n = r => done.filter(([, x]) => x.res === r).length, inWeek = done.filter(([id]) => games.find(g => g.id === id)?.week === week);
    return { pid: p.id, name: p.name, w: n('W'), l: n('L'), p: n('P'), net: done.reduce((s, [, x]) => s + (x.paid || 0) - (x.stake || 0), 0),
      ww: inWeek.filter(([, x]) => x.res === 'W').length, wl: inWeek.filter(([, x]) => x.res === 'L').length };
  }).filter(r => r.w + r.l + r.p > 0).sort((a, b) => b.net - a.net || b.w - a.w || a.l - b.l);
  return { season: currentSeason(), week, label: wk[0]?.label || `Week ${week}`, weeks, games: out, board, base: BASE, coins: SEASON_COINS, teams: TEAMS, balance: me?.balance ?? null };
}

// locking in a pick: { game, team, stake (any whole number of points, 0 for none) }. It can't be changed afterwards.
function pick(id, body) {
  const g = schedule().find(x => x.id === body.game);
  if (!g) throw new Error('No such game.');
  if (g.kick <= Date.now()) throw new Error('That game has kicked off: picks are locked.');
  if (g.line === null) throw new Error('No line for that game yet. Check back after the next refresh.');
  if (body.team !== g.home && body.team !== g.away) throw new Error('Pick one of the two teams.');
  const stake = Number(body.stake || 0);
  if (!Number.isInteger(stake) || stake < 0) throw new Error('The stake is a whole number of points (0 for none).');
  const p = profiles.load(id), picks = seasonOf(p);
  if (picks[g.id]) throw new Error("You've already locked in this game.");
  if (stake > p.balance) throw new Error(`Not enough points for that stake: you have ${p.balance}.`);
  if (stake) profiles.credit(p, -stake, `Pick'em stake: ${body.team} ${lineFor(body.team, g)}, ${g.away} @ ${g.home}`);
  picks[g.id] = { team: body.team, line: g.line, stake, at: new Date().toISOString() };
  const unlocked = [];
  profiles.award(p, 'pe_first', unlocked);
  profiles.save(p);
  const all = profiles.all(), crowd = all.map(x => ({ name: x.name, team: x.pickem?.[currentSeason()]?.[g.id]?.team })).filter(x => x.team);
  return { pick: picks[g.id], balance: p.balance, unlocked, crowd };
}

//   GET  /api/pickem[?pid=…&week=…]   the week's games, your picks and the standings
//   POST /api/pickem/<id>/pick         {game, team, stake}   (final: no changes afterwards)
function handle(req, url, body, authed) {
  const q = new URL(req.url, 'http://x').searchParams, [, , , id, action] = url.split('/');
  if (req.method === 'GET') return view(q.get('pid'), authed(q.get('pid')), q.get('week'));
  if (req.method === 'POST' && id && action === 'pick') return pick(id, body || {});
  throw new Error("Unknown pick'em request.");
}
module.exports = { handle, settle, resultOf, kickoff, lineFor, BASE };
