// Builds analysis-ready CSVs in data/ from the raw nflverse files in data/raw/.
// Usage: node build.js [first_season] [last_season]   (run fetch.js first)
const fs = require('fs');
const path = require('path');
const { currentSeason } = require('./fetch');

const FIRST = Number(process.argv[2] || 1999);
const LAST = Number(process.argv[3] || currentSeason());
const RAW = path.join(__dirname, 'data', 'raw');
const OUT = path.join(__dirname, 'data');

// ---------- CSV helpers ----------
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...data] = rows.filter(r => r.length > 1 || r[0] !== '');
  return data.map(r => Object.fromEntries(header.map((h, j) => [h, r[j] ?? ''])));
}

function readCsv(file) {
  const p = path.join(RAW, file);
  return fs.existsSync(p) ? parseCsv(fs.readFileSync(p, 'utf8')) : [];
}

function writeCsv(file, rows) {
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const esc = v => {
    if (v === null || v === undefined || (typeof v === 'number' && !isFinite(v))) return '';
    const s = typeof v === 'number' && !Number.isInteger(v) ? String(Math.round(v * 10000) / 10000) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))];
  fs.writeFileSync(path.join(OUT, file), lines.join('\n') + '\n');
  console.log(`  ${file.padEnd(26)} ${rows.length} rows x ${cols.length} cols`);
}

const num = v => (v === '' || v === undefined || v === 'NA' ? null : Number(v));
const round = (v, d = 3) => (v === null || !isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const PLAYOFF_ROUNDS = ['WC', 'DIV', 'CON', 'SB'];

// ---------- Load ----------
const seasons = [];
for (let y = FIRST; y <= LAST; y++) seasons.push(y);

const games = readCsv('games.csv').filter(g => +g.season >= FIRST && +g.season <= LAST);
const weekStats = seasons.flatMap(y => readCsv(`stats_team_week_${y}.csv`));
const regStats = seasons.flatMap(y => readCsv(`stats_team_reg_${y}.csv`));
const postStats = seasons.flatMap(y => readCsv(`stats_team_post_${y}.csv`));

// nflverse uses LA for the Rams in stats files and schedules alike; normalize old relocations just in case
const TEAM_FIX = { STL: 'LA', SD: 'LAC', OAK: 'LV' };
const fixTeam = t => TEAM_FIX[t] || t;

const statsByGameTeam = new Map(weekStats.map(s => [`${s.game_id}|${fixTeam(s.team)}`, s]));

// Opponent stats to attach to each team-game (i.e. what the defense allowed)
const OPP_COLS = ['passing_yards', 'passing_tds', 'passing_interceptions', 'passing_epa', 'sacks_suffered',
  'carries', 'rushing_yards', 'rushing_tds', 'rushing_epa', 'fumbles_lost_total', 'penalties', 'penalty_yards'];

// ---------- 1) games.csv: one row per game ----------
console.log('Writing:');
writeCsv('games.csv', games);

// ---------- 2) team_games.csv: one row per team per played game ----------
const teamGames = [];
for (const g of games) {
  if (g.home_score === '' || g.away_score === '') continue; // not played yet
  for (const side of ['home', 'away']) {
    const other = side === 'home' ? 'away' : 'home';
    const team = fixTeam(g[`${side}_team`]);
    const opp = fixTeam(g[`${other}_team`]);
    const pf = +g[`${side}_score`], pa = +g[`${other}_score`];
    // spread_line is the home team's expected margin (positive = home favored)
    const spread = num(g.spread_line) === null ? null : (side === 'home' ? 1 : -1) * num(g.spread_line);
    const s = statsByGameTeam.get(`${g.game_id}|${team}`) || {};
    const o = statsByGameTeam.get(`${g.game_id}|${opp}`) || {};

    const row = {
      game_id: g.game_id, season: +g.season, game_type: g.game_type, week: +g.week, gameday: g.gameday,
      team, opponent: opp, home_away: g.location === 'Neutral' ? 'neutral' : side,
      div_game: +g.div_game, points_for: pf, points_against: pa, margin: pf - pa,
      result: pf > pa ? 'W' : pf < pa ? 'L' : 'T', overtime: +g.overtime,
      expected_margin: spread, ats_margin: spread === null ? null : pf - pa - spread,
      covered: spread === null ? null : (pf - pa - spread > 0 ? 1 : pf - pa - spread < 0 ? 0 : 0.5),
      moneyline: num(g[`${side}_moneyline`]), total_line: num(g.total_line),
      rest_days: num(g[`${side}_rest`]), qb: g[`${side}_qb_name`], coach: g[`${side}_coach`],
      roof: g.roof, surface: g.surface, temp: num(g.temp), wind: num(g.wind),
    };
    for (const [k, v] of Object.entries(s)) {
      if (['season', 'week', 'team', 'season_type', 'game_id', 'opponent_team'].includes(k) || k.endsWith('_list')) continue;
      row[k] = num(v) ?? (v === '' ? null : v);
    }
    row.turnovers = (num(s.passing_interceptions) ?? 0) + (num(s.fumbles_lost_total) ?? 0);
    for (const c of OPP_COLS) row[`opp_${c}`] = num(o[c]);
    row.takeaways = (num(o.passing_interceptions) ?? 0) + (num(o.fumbles_lost_total) ?? 0);
    teamGames.push(row);
  }
}
teamGames.sort((a, b) => a.season - b.season || a.team.localeCompare(b.team) || a.week - b.week);
writeCsv('team_games.csv', teamGames);

// ---------- Season outcome per team (regular-season record + playoff finish) ----------
const outcome = new Map(); // key season|team
const key = (s, t) => `${s}|${t}`;
for (const tg of teamGames) {
  const k = key(tg.season, tg.team);
  if (!outcome.has(k)) outcome.set(k, { w: 0, l: 0, t: 0, pf: 0, pa: 0, playoffGames: [], ats: 0, atsN: 0 });
  const o = outcome.get(k);
  if (tg.game_type === 'REG') {
    o[tg.result.toLowerCase()]++; o.pf += tg.points_for; o.pa += tg.points_against;
    if (tg.covered !== null) { o.ats += tg.covered; o.atsN++; }
  } else o.playoffGames.push(tg);
}
function playoffFinish(season, team) {
  const o = outcome.get(key(season, team));
  if (!o || !o.playoffGames.length) {
    // Season still running (no playoff games played league-wide yet) -> unknown
    const anyPost = games.some(g => +g.season === season && g.game_type !== 'REG' && g.home_score !== '');
    return { made_playoffs: anyPost ? 0 : null, playoff_wins: anyPost ? 0 : null, season_finish: anyPost ? 'Missed playoffs' : 'In progress', first_round_bye: anyPost ? 0 : null };
  }
  const pg = o.playoffGames.sort((a, b) => a.week - b.week);
  const last = pg[pg.length - 1];
  const wins = pg.filter(g => g.result === 'W').length;
  let finish;
  if (last.result === 'W' && last.game_type === 'SB') finish = 'Won SB';
  else if (last.result === 'W') finish = `Won ${last.game_type} (in progress)`;
  else finish = `Lost ${last.game_type}`;
  return { made_playoffs: 1, playoff_wins: wins, season_finish: finish, first_round_bye: pg[0].game_type === 'DIV' ? 1 : 0 };
}

// ---------- 3) team_week_situation.csv: cumulative state after each regular-season game ----------
// This is the "situation" table for the historizer: e.g. find teams that were 3-5 with a
// negative point differential after 8 games, then look at final_wins / season_finish.
const situation = [];
const byTeamSeason = new Map();
for (const tg of teamGames.filter(t => t.game_type === 'REG')) {
  const k = key(tg.season, tg.team);
  if (!byTeamSeason.has(k)) byTeamSeason.set(k, []);
  byTeamSeason.get(k).push(tg);
}
const CUM = ['passing_yards', 'rushing_yards', 'passing_epa', 'rushing_epa', 'turnovers', 'takeaways', 'def_sacks',
  'opp_passing_yards', 'opp_rushing_yards', 'opp_passing_epa', 'opp_rushing_epa', 'penalty_yards'];
for (const [k, list] of byTeamSeason) {
  const [season, team] = k.split('|');
  const fin = outcome.get(k);
  const po = playoffFinish(+season, team);
  const c = { w: 0, l: 0, t: 0, pf: 0, pa: 0, ats: 0, atsN: 0, streak: 0, last3: [] };
  const sums = Object.fromEntries(CUM.map(x => [x, 0]));
  list.forEach((tg, i) => {
    const gp = i + 1;
    c[tg.result.toLowerCase()]++; c.pf += tg.points_for; c.pa += tg.points_against;
    if (tg.covered !== null) { c.ats += tg.covered; c.atsN++; }
    c.streak = tg.result === 'W' ? Math.max(c.streak, 0) + 1 : tg.result === 'L' ? Math.min(c.streak, 0) - 1 : 0;
    c.last3.push(tg.margin); if (c.last3.length > 3) c.last3.shift();
    for (const x of CUM) sums[x] += tg[x] ?? 0;
    const row = {
      season: +season, team, week: tg.week, games_played: gp,
      wins: c.w, losses: c.l, ties: c.t, win_pct: round((c.w + c.t / 2) / gp),
      record: `${c.w}-${c.l}${c.t ? '-' + c.t : ''}`,
      points_for: c.pf, points_against: c.pa, point_diff: c.pf - c.pa,
      ppg: round(c.pf / gp, 2), papg: round(c.pa / gp, 2), point_diff_per_game: round((c.pf - c.pa) / gp, 2),
      // Pythagorean expectation (NFL exponent 2.37): how good the team "really" is vs its record
      pythag_win_pct: round(c.pf ** 2.37 / (c.pf ** 2.37 + c.pa ** 2.37)),
      streak: c.streak, last3_margin: c.last3.reduce((a, b) => a + b, 0),
      ats_win_pct: c.atsN ? round(c.ats / c.atsN) : null,
    };
    for (const x of CUM) row[`${x}_per_game`] = round(sums[x] / gp, 3);
    row.turnover_diff = sums.takeaways - sums.turnovers;
    // What eventually happened that season (the "outcome" to compare against)
    const regDone = list.length >= (+season >= 2021 ? 17 : 16);
    Object.assign(row, {
      final_wins: regDone ? fin.w : null, final_losses: regDone ? fin.l : null, final_ties: regDone ? fin.t : null,
      rest_of_season_wins: regDone ? fin.w - c.w : null,
      ...po,
    });
    situation.push(row);
  });
}
situation.sort((a, b) => a.season - b.season || a.team.localeCompare(b.team) || a.games_played - b.games_played);
writeCsv('team_week_situation.csv', situation);

// ---------- 4) team_seasons.csv: one row per team-season ----------
const teamSeasons = [];
for (const s of regStats) {
  const team = fixTeam(s.team), season = +s.season;
  const o = outcome.get(key(season, team)) || { w: 0, l: 0, t: 0, pf: 0, pa: 0, ats: 0, atsN: 0 };
  const gp = o.w + o.l + o.t;
  const row = {
    season, team, games: gp, wins: o.w, losses: o.l, ties: o.t,
    win_pct: gp ? round((o.w + o.t / 2) / gp) : null,
    points_for: o.pf, points_against: o.pa, point_diff: o.pf - o.pa,
    pythag_win_pct: gp ? round(o.pf ** 2.37 / (o.pf ** 2.37 + o.pa ** 2.37)) : null,
    ats_win_pct: o.atsN ? round(o.ats / o.atsN) : null,
    ...playoffFinish(season, team),
  };
  for (const [k, v] of Object.entries(s)) {
    if (['season', 'team', 'season_type', 'games'].includes(k) || k.endsWith('_list')) continue;
    row[`reg_${k}`] = num(v) ?? (v === '' ? null : v);
  }
  teamSeasons.push(row);
}
// Previous-season context helps with "similar situation" matching (e.g. last year's wins)
const tsKey = new Map(teamSeasons.map(r => [key(r.season, r.team), r]));
for (const r of teamSeasons) {
  const prev = tsKey.get(key(r.season - 1, r.team));
  r.prev_season_wins = prev ? prev.wins : null;
  r.prev_season_finish = prev ? prev.season_finish : null;
}
teamSeasons.sort((a, b) => a.season - b.season || a.team.localeCompare(b.team));
writeCsv('team_seasons.csv', teamSeasons);

// Postseason team totals, kept separate since they're small samples
writeCsv('team_postseason_stats.csv', postStats.map(s => {
  const r = {};
  for (const [k, v] of Object.entries(s)) if (!k.endsWith('_list')) r[k] = num(v) ?? (v === '' ? null : v);
  r.team = fixTeam(s.team);
  return r;
}));
