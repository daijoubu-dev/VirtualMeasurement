// Builds app/data.js (used by app/index.html) from the CSVs in data/ and the PFR files in data/raw/.
// Usage: node build_app.js   (run build.js first)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { PFR_FIRST, PLAYER_FIRST } = require('./fetch');

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
const read = (...p) => {
  const f = path.join(__dirname, 'data', ...p);
  return fs.existsSync(f) ? parseCsv(fs.readFileSync(f, 'utf8')) : [];
};
const num = v => (v === '' || v === undefined ? 0 : Number(v));
const r3 = v => Math.round(v * 1000) / 1000;

// Same relocation mapping build.js applies to team_games.csv
const TEAM_FIX = { STL: 'LA', SD: 'LAC', OAK: 'LV' };
const fixTeam = t => TEAM_FIX[t] || t;
const dropbacks = tg => num(tg.attempts) + num(tg.sacks_suffered);

// Stats the app compares on. Each returns [numerator, denominator] for one game; the season-to-date
// value is sum(num) / sum(den), so per-play rates are weighted by plays, not averaged per game.
// `tag` makes the stat a team identity tag. `pfr` stats only exist from 2018 on.
const STATS = [
  { key: 'pf', label: 'Points for', group: 'box', better: 'high', fmt: 1,
    val: g => [num(g.tg.points_for), 1], tag: { name: 'scoring O', metric: 'points per game' } },
  { key: 'pa', label: 'Points against', group: 'box', better: 'low', fmt: 1,
    val: g => [num(g.tg.points_against), 1], tag: { name: 'scoring DEF', metric: 'points allowed per game' } },
  { key: 'pass', label: 'Pass yds', group: 'box', better: 'high', fmt: 1, val: g => [num(g.tg.passing_yards), 1] },
  { key: 'rush', label: 'Rush yds', group: 'box', better: 'high', fmt: 1, val: g => [num(g.tg.rushing_yards), 1] },
  { key: 'pass_alw', label: 'Pass yds allowed', group: 'box', better: 'low', fmt: 1, val: g => [num(g.o.passing_yards), 1] },
  { key: 'rush_alw', label: 'Rush yds allowed', group: 'box', better: 'low', fmt: 1, val: g => [num(g.o.rushing_yards), 1] },
  { key: 'to_diff', label: 'Turnover diff', group: 'box', better: 'high', fmt: 2,
    val: g => [num(g.tg.takeaways) - num(g.tg.turnovers), 1], tag: { name: 'turnover margin', metric: 'takeaways minus giveaways per game' } },
  { key: 'pass_epa', label: 'Pass EPA / dropback', group: 'epa', better: 'high', fmt: 3,
    val: g => [num(g.tg.passing_epa), num(g.tg.attempts) + num(g.tg.sacks_suffered)], tag: { name: 'passing game', metric: 'EPA per dropback' } },
  { key: 'rush_epa', label: 'Rush EPA / carry', group: 'epa', better: 'high', fmt: 3,
    val: g => [num(g.tg.rushing_epa), num(g.tg.carries)], tag: { name: 'run game', metric: 'EPA per carry' } },
  { key: 'def_pass_epa', label: 'Pass EPA allowed', group: 'epa', better: 'low', fmt: 3,
    val: g => [num(g.o.passing_epa), num(g.o.attempts) + num(g.o.sacks_suffered)], tag: { name: 'pass DEF', metric: 'EPA allowed per opponent dropback' } },
  { key: 'def_rush_epa', label: 'Rush EPA allowed', group: 'epa', better: 'low', fmt: 3,
    val: g => [num(g.o.rushing_epa), num(g.o.carries)], tag: { name: 'run DEF', metric: 'EPA allowed per opponent carry' } },
  { key: 'big_pass', label: '20+ yd completions / dropback', group: 'more', better: 'high', fmt: 3, pct: true,
    val: g => [num(g.tg.passing_20), dropbacks(g.tg)], tag: { name: 'big-play passing', metric: '20+ yard completions per dropback' } },
  { key: 'big_run', label: '10+ yd runs / carry', group: 'more', better: 'high', fmt: 3, pct: true,
    val: g => [num(g.tg.rushing_10), num(g.tg.carries)], tag: { name: 'explosive runs', metric: '10+ yard runs per carry' } },
  { key: 'big_alw', label: 'Big plays allowed / play', group: 'more', better: 'low', fmt: 3, pct: true,
    val: g => [num(g.o.passing_20) + num(g.o.rushing_10), dropbacks(g.o) + num(g.o.carries)],
    tag: { name: 'big-play DEF', metric: 'opponent 20+ yard completions and 10+ yard runs per play' } },
  { key: 'sack_def', label: 'Sack rate (DEF)', group: 'more', better: 'high', fmt: 3, pct: true,
    val: g => [num(g.o.sacks_suffered), dropbacks(g.o)], tag: { name: 'sack DEF', metric: 'sacks per opponent dropback' } },
  { key: 'sack_off', label: 'Sack rate allowed', group: 'more', better: 'low', fmt: 3, pct: true,
    val: g => [num(g.tg.sacks_suffered), dropbacks(g.tg)], tag: { name: 'sack avoidance', metric: 'sacks taken per dropback' } },
  { key: 'cpoe', label: 'QB CPOE', group: 'more', better: 'high', fmt: 2,
    // CPOE is a per-game percentage, weighted by attempts; blank in some older games
    val: g => (g.tg.passing_cpoe === '' ? null : [num(g.tg.passing_cpoe) * num(g.tg.attempts), num(g.tg.attempts)]),
    tag: { name: 'QB accuracy', metric: 'completion % over expected (CPOE)' } },
  { key: 'fd_off', label: 'First downs / play', group: 'more', better: 'high', fmt: 3, pct: true,
    val: g => [num(g.tg.passing_first_downs) + num(g.tg.rushing_first_downs), dropbacks(g.tg) + num(g.tg.carries)],
    tag: { name: 'chain-moving O', metric: 'first downs per offensive play' } },
  { key: 'fd_def', label: 'First downs allowed / play', group: 'more', better: 'low', fmt: 3, pct: true,
    val: g => [num(g.o.passing_first_downs) + num(g.o.rushing_first_downs), dropbacks(g.o) + num(g.o.carries)],
    tag: { name: 'first-down DEF', metric: 'first downs allowed per opponent play' } },
  { key: 'pen_yds', label: 'Penalty yds', group: 'more', better: 'low', fmt: 1,
    val: g => [num(g.tg.penalty_yards), 1], tag: { name: 'discipline', metric: 'penalty yards per game' } },
  { key: 'fg_pct', label: 'Field goal %', group: 'more', better: 'high', fmt: 3, pct: true,
    val: g => [num(g.tg.fg_made), num(g.tg.fg_att)], tag: { name: 'kicking game', metric: 'field goal percentage' } },
  { key: 'pressure', label: 'Pressure rate', group: 'pfr', better: 'high', fmt: 3, pct: true,
    val: g => (g.theirs ? [g.theirs.pressured, num(g.o.attempts) + num(g.o.sacks_suffered)] : null),
    tag: { name: 'pass rush', metric: 'pressure rate (pressures per opponent dropback, PFR)' } },
  { key: 'pressure_alw', label: 'Pressure allowed', group: 'pfr', better: 'low', fmt: 3, pct: true,
    val: g => (g.mine ? [g.mine.pressured, num(g.tg.attempts) + num(g.tg.sacks_suffered)] : null),
    tag: { name: 'pass protection', metric: 'pressure rate allowed (pressures per dropback, PFR)' } },
  { key: 'blitz', label: 'Blitz rate', group: 'pfr', better: 'high', fmt: 3, pct: true,
    val: g => (g.theirs ? [g.theirs.blitzed, num(g.o.attempts) + num(g.o.sacks_suffered)] : null),
    tag: { name: 'blitz rate', metric: 'blitzes per opponent dropback (PFR)', descriptive: true } },
];

const teamGames = read('team_games.csv');
const allGames = read('games.csv');
const currentSeason = Math.max(...allGames.map(g => +g.season));
const tgByKey = new Map(teamGames.map(tg => [`${tg.game_id}|${tg.team}`, tg]));

// PFR QB-level counts summed to the offense (a defense's numbers are its opponents' offensive numbers)
const adv = new Map(); // game_id|offense team -> {blitzed, pressured}
for (let yr = PFR_FIRST; yr <= currentSeason; yr++) {
  for (const r of read('raw', `advstats_week_pass_${yr}.csv`)) {
    const k = `${r.game_id}|${fixTeam(r.team)}`;
    const a = adv.get(k) || { blitzed: 0, pressured: 0 };
    a.blitzed += num(r.times_blitzed); a.pressured += num(r.times_pressured);
    adv.set(k, a);
  }
}

// Display name per team-season (e.g. OAK in 2018, LV in 2020)
const displayName = new Map();
for (const g of allGames) {
  displayName.set(`${g.season}|${fixTeam(g.home_team)}`, g.home_team);
  displayName.set(`${g.season}|${fixTeam(g.away_team)}`, g.away_team);
}
// Final record + playoff finish per team-season
const finish = new Map(read('team_seasons.csv').map(r => [`${r.season}|${r.team}`,
  `${r.wins}-${r.losses}${+r.ties ? '-' + r.ties : ''} · ${r.season_finish}`]));

// ---------- Season-to-date snapshots: snaps[season|team].s[k-1] = profile after k games ----------
const byTeamSeason = new Map();
for (const tg of teamGames) {
  const k = `${tg.season}|${tg.team}`;
  if (!byTeamSeason.has(k)) byTeamSeason.set(k, []);
  byTeamSeason.get(k).push(tg);
}
const snaps = {};
const gamesBefore = new Map(); // game_id|team -> games played before this game
for (const [k, list] of byTeamSeason) {
  list.sort((a, b) => a.gameday.localeCompare(b.gameday));
  const nums = STATS.map(() => 0), dens = STATS.map(() => 0);
  let w = 0, l = 0, t = 0;
  const s = [];
  list.forEach((tg, i) => {
    gamesBefore.set(`${tg.game_id}|${tg.team}`, i);
    const ctx = { tg, o: tgByKey.get(`${tg.game_id}|${tg.opponent}`) || {},
      mine: adv.get(`${tg.game_id}|${tg.team}`), theirs: adv.get(`${tg.game_id}|${tg.opponent}`) };
    STATS.forEach((st, j) => {
      const v = st.val(ctx);
      if (v && v[1]) { nums[j] += v[0]; dens[j] += v[1]; }
    });
    if (tg.result === 'W') w++; else if (tg.result === 'L') l++; else t++;
    s.push([`${w}-${l}${t ? '-' + t : ''}`, nums.map((n, j) => (dens[j] ? r3(n / dens[j]) : null))]);
  });
  snaps[k] = { name: displayName.get(k) || k.split('|')[1], fin: finish.get(k) || '', s };
}

// League mean/sd of end-of-season (or to-date) values, per season, for era-adjusted z-scores
const norms = {};
const seasons = [...new Set(teamGames.map(t => +t.season))].sort();
for (const season of seasons) {
  const finals = Object.entries(snaps).filter(([k]) => k.startsWith(season + '|')).map(([, v]) => v.s[v.s.length - 1][1]);
  const mean = [], sd = [];
  STATS.forEach((_, j) => {
    const vals = finals.map(f => f[j]).filter(v => v !== null);
    if (!vals.length) { mean.push(null); sd.push(null); return; }
    const m = vals.reduce((a, v) => a + v, 0) / vals.length;
    mean.push(r3(m)); sd.push(r3(Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / vals.length)) || 1);
  });
  norms[season] = { mean, sd };
}

// ---------- Historical games: both teams' snapshot going into the game ----------
const games = [];
for (const g of allGames) {
  if (g.home_score === '') continue;
  const home = fixTeam(g.home_team), away = fixTeam(g.away_team);
  const hgp = gamesBefore.get(`${g.game_id}|${home}`), agp = gamesBefore.get(`${g.game_id}|${away}`);
  if (!hgp || !agp) continue; // a team's first game has no profile yet
  games.push([+g.season, g.game_type === 'REG' ? +g.week : g.game_type, home, away, +g.home_score, +g.away_score,
    g.spread_line === '' ? null : +g.spread_line, g.location === 'Neutral' ? 1 : 0, hgp, agp, +g.div_game]);
}

// Every completed game (including week 1, unlike `games`): real records, head-to-heads and ATS leaderboards.
// The matchup page's head-to-head panel looks back H2H_SEASONS seasons.
const H2H_SEASONS = 5;
const results = allGames
  .filter(g => g.home_score !== '')
  .map(g => [+g.season, g.game_type === 'REG' ? +g.week : g.game_type, g.gameday, fixTeam(g.home_team), fixTeam(g.away_team),
    +g.home_score, +g.away_score, g.spread_line === '' ? null : +g.spread_line]);

const upcoming = allGames
  .filter(g => +g.season === currentSeason && g.home_score === '')
  .map(g => ({ week: g.game_type === 'REG' ? +g.week : g.game_type, day: g.gameday,
    home: fixTeam(g.home_team), away: fixTeam(g.away_team), spread: g.spread_line === '' ? null : +g.spread_line, div: +g.div_game,
    total: g.total_line === '' ? null : +g.total_line, homeMl: g.home_moneyline === '' ? null : +g.home_moneyline,
    awayMl: g.away_moneyline === '' ? null : +g.away_moneyline, roof: g.roof, stadium: g.stadium }));
const nextWeek = upcoming.length ? upcoming[0].week : null;
// Every unplayed regular-season game this season, for strength-of-schedule-ahead: [week, home, away]
const remaining = upcoming.filter(u => typeof u.week === 'number').map(u => [u.week, u.home, u.away]);
// ---------- Team context for fun tags: QB/coach history, Super Bowls, streaks ----------
// Since 1999 only (that's where the schedule data starts), so careers that began earlier are partly missing.
const played = allGames.filter(g => g.home_score !== '').sort((a, b) => a.gameday.localeCompare(b.gameday));
const qbFirst = new Map(), coachTeamFirst = new Map(), qbStarts = new Map(), sbQb = new Map(), sbCoach = new Map(), sbTeam = new Map();
const pushTo = (m, k, v) => m.set(k, [...(m.get(k) || []), v]);
for (const g of played) {
  for (const side of ['home', 'away']) {
    const team = fixTeam(g[side + '_team']), qb = g[side + '_qb_name'], coach = g[side + '_coach'];
    if (qb && !qbFirst.has(qb)) qbFirst.set(qb, +g.season);
    if (qb) qbStarts.set(qb, (qbStarts.get(qb) || 0) + 1);
    if (coach && !coachTeamFirst.has(coach + '|' + team)) coachTeamFirst.set(coach + '|' + team, +g.season);
  }
  if (g.game_type === 'SB') {
    const w = +g.home_score > +g.away_score ? 'home' : 'away';
    pushTo(sbQb, g[w + '_qb_name'], +g.season); pushTo(sbCoach, g[w + '_coach'], +g.season); pushTo(sbTeam, fixTeam(g[w + '_team']), +g.season);
  }
}
const context = {};
for (const team of Object.keys(snaps).filter(k => k.startsWith(currentSeason + '|')).map(k => k.split('|')[1])) {
  const mine = played.filter(g => +g.season === currentSeason && (fixTeam(g.home_team) === team || fixTeam(g.away_team) === team));
  const last = mine[mine.length - 1], side = last && fixTeam(last.home_team) === team ? 'home' : 'away';
  const qb = last ? last[side + '_qb_name'] : '', coach = last ? last[side + '_coach'] : '';
  // Current streak: consecutive wins (+) or losses (-) ending with the latest game
  let streak = 0;
  for (let i = mine.length - 1; i >= 0; i--) {
    const g = mine[i], s = fixTeam(g.home_team) === team ? +g.home_score - +g.away_score : +g.away_score - +g.home_score;
    const r = Math.sign(s); if (!r || (streak && Math.sign(streak) !== r)) break; streak += r;
  }
  // QBs who started for this team this season (a change shows up as more than one)
  const qbs = [...new Set(mine.map(g => g[(fixTeam(g.home_team) === team ? 'home' : 'away') + '_qb_name']))];
  context[team] = { qb, coach, qbs, streak, qbSb: sbQb.get(qb) || [], coachSb: sbCoach.get(coach) || [],
    qbFirst: qbFirst.get(qb), qbStarts: qbStarts.get(qb) || 0, coachFirst: coachTeamFirst.get(coach + '|' + team),
    teamSb: sbTeam.get(team) || [], prevFin: snaps[(currentSeason - 1) + '|' + team]?.fin || '' };
}

// Team names, colors and logo links (nflverse); includes old codes like OAK/SD/STL for historical teams
const teamInfo = Object.fromEntries(read('raw', 'teams_colors_logos.csv').map(r => [r.team_abbr, {
  name: r.team_name, nick: r.team_nick, conf: r.team_conf, division: r.team_division, colors: [r.team_color, r.team_color2, r.team_color3].filter(Boolean), logo: r.team_logo_espn }]));

const currentTeams = Object.keys(snaps).filter(k => k.startsWith(currentSeason + '|')).map(k => k.split('|')[1]).sort();

const data = {
  built: new Date().toISOString(), currentSeason, pfrFirst: PFR_FIRST,
  lastGame: allGames.filter(g => g.home_score !== '').reduce((m, g) => (g.gameday > m ? g.gameday : m), ''),
  lastWeek: Math.max(...teamGames.filter(t => +t.season === currentSeason && t.game_type === 'REG').map(t => +t.week)),
  stats: STATS.map(({ val, ...rest }) => rest),
  teams: currentTeams, context, teamInfo, norms, snaps, games, results, h2hSince: currentSeason - H2H_SEASONS, upcoming: upcoming.filter(u => u.week === nextWeek), remaining,
};
// ---------- Player season stats for the Players page (separate file: it's only needed there) ----------
const PLAYER_COLS = {
  id: 'player_id', name: 'player_display_name', pos: 'position', headshot: 'headshot_url', team: 'recent_team', g: 'games',
  cmp: 'completions', att: 'attempts', pyd: 'passing_yards', ptd: 'passing_tds', int: 'passing_interceptions', sk: 'sacks_suffered', cpoe: 'passing_cpoe',
  car: 'carries', ryd: 'rushing_yards', rtd: 'rushing_tds', fum: 'fumbles_lost_total',
  rec: 'receptions', tgt: 'targets', recyd: 'receiving_yards', rectd: 'receiving_tds', tshare: 'target_share',
  solo: 'def_tackles_solo', ast: 'def_tackle_assists', tfl: 'def_tackles_for_loss', dsk: 'def_sacks', qbh: 'def_qb_hits',
  dint: 'def_interceptions', pd: 'def_pass_defended', ff: 'def_fumbles_forced', dtd: 'def_tds',
  fgm: 'fg_made', fga: 'fg_att', fglong: 'fg_long', xpm: 'pat_made', xpa: 'pat_att', punts: 'pt_att', puntyd: 'pt_yards',
  kryd: 'kickoff_return_yards', pryd: 'punt_return_yards', fpts: 'fantasy_points_ppr',
};
const TEXT_COLS = new Set(['id', 'name', 'pos', 'headshot', 'team']);
const playerRows = read('raw', `stats_player_reg_${currentSeason}.csv`).map(r => Object.entries(PLAYER_COLS).map(([k, c]) => {
  if (TEXT_COLS.has(k)) return k === 'team' ? fixTeam(r[c]) : r[c];
  const v = r[c] === '' ? 0 : +r[c];
  return Math.round(v * 100) / 100;
}));
// lw = the last regular-season week each player appeared in (from the weekly file), so the Super Bowl sim can bench
// players who are hurt or benched right now (e.g. a starting QB who hasn't played the last two weeks)
const lastPlayed = new Map();
const wkNow = path.join(__dirname, 'data', 'raw', `stats_player_week_${currentSeason}.csv.gz`);
if (fs.existsSync(wkNow)) {
  for (const line of zlib.gunzipSync(fs.readFileSync(wkNow)).toString('utf8').split('\n')) {
    const m = line.match(/,(\d{4}),(\d+),REG,/); if (!m) continue;
    const id = line.slice(0, line.indexOf(','));
    lastPlayed.set(id, Math.max(lastPlayed.get(id) || 0, +m[2]));
  }
}
playerRows.forEach(r => r.push(lastPlayed.get(r[0]) ?? ''));
// Current injuries from the weekly injury reports: each player's latest status (for the most recent report week) and
// how many games in a row he has already been Out. injuries = { id: [status, injury, reportWeek, gamesMissed, practice] }.
// A player who was Out and is now listed without a game status is practicing again: 'Returning'.
const injuries = {};
const injRows = read('raw', `injuries_${currentSeason}.csv`).filter(r => r.season_type === 'REG' && r.gsis_id);
const injWeek = Math.max(0, ...injRows.map(r => +r.week));
const byPlayer = new Map();
for (const r of injRows) { if (!byPlayer.has(r.gsis_id)) byPlayer.set(r.gsis_id, []); byPlayer.get(r.gsis_id).push(r); }
for (const [id, list] of byPlayer) {
  list.sort((a, b) => +a.week - +b.week);
  const latest = list[list.length - 1]; if (+latest.week !== injWeek) continue; // not on this week's report: healthy
  // games already missed: consecutive earlier weeks he was listed Out, counting back from last week
  let missed = 0;
  for (let i = list.length - 2, wk = injWeek - 1; i >= 0 && +list[i].week === wk && list[i].report_status === 'Out'; i--, wk--) missed++;
  const prevOut = list.length > 1 && list[list.length - 2].report_status === 'Out';
  const status = latest.report_status || (prevOut ? 'Returning' : '');
  if (!status) continue;
  injuries[id] = [status, latest.report_primary_injury || latest.practice_primary_injury || '', injWeek, missed, latest.practice_status || ''];
}
fs.writeFileSync(path.join(__dirname, 'app', 'players.js'),
  'window.NFL_PLAYERS = ' + JSON.stringify({ season: currentSeason, cols: [...Object.keys(PLAYER_COLS), 'lw'], rows: playerRows, injuries, injWeek }) + ';\n');
console.log(`injury report week ${injWeek}: ${Object.keys(injuries).length} players listed`);

// ---------- Next Gen Stats for the Players page charts (app/ngs.js) ----------
// This season and last, regular season, week 0 = season to date plus each week. Per kind:
// { cols, rows: [[season, week, id, name, team, pos, ...metrics]] }
const NGS = {
  receiving: ['avg_separation', 'avg_cushion', 'avg_intended_air_yards', 'percent_share_of_intended_air_yards', 'catch_percentage', 'avg_yac', 'avg_expected_yac', 'avg_yac_above_expectation', 'targets', 'receptions', 'yards', 'rec_touchdowns'],
  passing: ['avg_time_to_throw', 'aggressiveness', 'avg_completed_air_yards', 'avg_intended_air_yards', 'avg_air_yards_differential', 'avg_air_yards_to_sticks', 'completion_percentage', 'expected_completion_percentage', 'completion_percentage_above_expectation', 'passer_rating', 'attempts', 'pass_yards', 'pass_touchdowns', 'interceptions'],
  rushing: ['efficiency', 'percent_attempts_gte_eight_defenders', 'avg_time_to_los', 'rush_attempts', 'rush_yards', 'avg_rush_yards', 'expected_rush_yards', 'rush_yards_over_expected', 'rush_yards_over_expected_per_att', 'rush_pct_over_expected', 'rush_touchdowns'],
};
const ngsOut = { seasons: [currentSeason - 1, currentSeason] };
for (const [kind, cols] of Object.entries(NGS)) {
  const f = path.join(__dirname, 'data', 'raw', `ngs_${kind}.csv.gz`);
  if (!fs.existsSync(f)) continue;
  const rows = parseCsv(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'))
    .filter(r => r.season_type === 'REG' && +r.season >= currentSeason - 1)
    .map(r => [+r.season, +r.week, r.player_gsis_id, r.player_display_name, fixTeam(r.team_abbr), r.player_position,
      ...cols.map(c => (r[c] === '' || r[c] === 'NA' ? null : Math.round(+r[c] * 1000) / 1000))]);
  ngsOut[kind] = { cols, rows };
}
fs.writeFileSync(path.join(__dirname, 'app', 'ngs.js'), 'window.NFL_NGS = ' + JSON.stringify(ngsOut) + ';\n');
console.log(`app/ngs.js: ${Object.entries(ngsOut).filter(([k]) => k !== 'seasons').map(([k, v]) => `${k} ${v.rows.length}`).join(', ')} rows`);
console.log(`app/players.js: ${playerRows.length} players`);

// ---------- Career stats for the Players page's player pop-up (loaded only when someone clicks a player) ----------
// Every regular season since PLAYER_FIRST for each player on the current season's list, as
// { cols, players: { id: [[season, teams, ...stats], ...] } }. teams is a team code, or [[team, games], ...] in order
// when a mid-season trade split the season (from the weekly files). Zero stats are left as array holes ([1,,3]) to keep
// the file small, so it's a JS file, not JSON.
const CAREER_COLS = ['g', 'cmp', 'att', 'pyd', 'ptd', 'int', 'sk', 'cpoe', 'car', 'ryd', 'rtd', 'fum', 'rec', 'tgt', 'recyd', 'rectd', 'tshare',
  'solo', 'ast', 'tfl', 'dsk', 'qbh', 'dint', 'pd', 'ff', 'dtd', 'fgm', 'fga', 'fglong', 'xpm', 'xpa', 'punts', 'puntyd', 'kryd', 'pryd', 'fpts'];
const careerIds = new Set(playerRows.map(r => r[0]).filter(Boolean));
const careers = {};
for (let yr = PLAYER_FIRST; yr <= currentSeason; yr++) {
  // Teams per player from the weekly file: only the leading columns matter, so match them instead of parsing every field
  const teams = new Map();
  const wk = path.join(__dirname, 'data', 'raw', `stats_player_week_${yr}.csv.gz`);
  if (fs.existsSync(wk)) {
    for (const line of zlib.gunzipSync(fs.readFileSync(wk)).toString('utf8').split('\n')) {
      const id = line.slice(0, line.indexOf(','));
      if (!careerIds.has(id)) continue;
      const m = line.match(/,(\d{4}),(\d+),REG,[^,]*,([^,]*),/);
      if (!m) continue;
      if (!teams.has(id)) teams.set(id, []);
      teams.get(id).push([+m[2], fixTeam(m[3])]);
    }
  }
  for (const r of read('raw', `stats_player_reg_${yr}.csv`)) {
    if (!careerIds.has(r.player_id)) continue;
    const games = new Map();
    for (const [, t] of (teams.get(r.player_id) || []).sort((a, b) => a[0] - b[0])) games.set(t, (games.get(t) || 0) + 1);
    const team = games.size > 1 ? [...games] : fixTeam(r.recent_team);
    const stats = CAREER_COLS.map(k => Math.round(num(r[PLAYER_COLS[k]]) * 100) / 100 || '');
    while (stats.length && stats[stats.length - 1] === '') stats.pop();
    (careers[r.player_id] ||= []).push([yr, team, ...stats]);
  }
}
const careerJs = 'window.NFL_CAREERS = ' + JSON.stringify({ cols: CAREER_COLS, players: careers }).replace(/(?<=[,[])""(?=[,\]])/g, '') + ';\n';
fs.writeFileSync(path.join(__dirname, 'app', 'careers.js'), careerJs);
console.log(`app/careers.js: ${Object.keys(careers).length} players, ${Object.values(careers).reduce((n, c) => n + c.length, 0)} player-seasons, ${Math.round(careerJs.length / 1024)} KB`);

fs.mkdirSync(path.join(__dirname, 'app'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'app', 'data.js'), 'window.NFL_DATA = ' + JSON.stringify(data) + ';\n');
const kb = Math.round(fs.statSync(path.join(__dirname, 'app', 'data.js')).size / 1024);
console.log(`app/data.js: ${games.length} historical games, ${Object.keys(snaps).length} team-seasons, ${currentTeams.length} ${currentSeason} teams, ${data.upcoming.length} upcoming games (week ${nextWeek}), ${kb} KB`);
