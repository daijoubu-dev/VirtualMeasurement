// Builds app/boxscores.js for the matchup page: the real box score of every finished game this season (player lines and
// team stats), from nflverse's weekly player and team stats. The page loads it only when you open a finished game.
// nflverse publishes a week's stats a day or two after its games, so the newest games can be missing for a bit.
// Usage: node build_box.js   (needs data/raw/stats_player_week_<season>.csv.gz and stats_team_week_<season>.csv from fetch.js)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { currentSeason } = require('./fetch');

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
const RAW = path.join(__dirname, 'data', 'raw');
const read = f => { const p = path.join(RAW, f); if (!fs.existsSync(p)) return []; const b = fs.readFileSync(p); return parseCsv((f.endsWith('.gz') ? zlib.gunzipSync(b) : b).toString('utf8')); };
const n = v => (v === '' || v === 'NA' || v === undefined ? 0 : +v || 0);

const season = +process.argv[2] || currentSeason();
const players = read(`stats_player_week_${season}.csv.gz`), teams = read(`stats_team_week_${season}.csv`);
const games = {};
const gameOf = id => (games[id] ||= { teams: {}, players: {} });

// team stats: yards, first downs, turnovers, penalties (columns are listed once in COLS.team)
for (const r of teams) {
  if (!r.game_id || !r.team) continue;
  const to = n(r.passing_interceptions) + n(r.sack_fumbles_lost) + n(r.rushing_fumbles_lost) + n(r.receiving_fumbles_lost);
  const netPass = n(r.passing_yards) + n(r.sack_yards_lost); // sack yards are stored as a negative number
  gameOf(r.game_id).teams[r.team] = [
    n(r.passing_first_downs) + n(r.rushing_first_downs), netPass + n(r.rushing_yards), netPass, n(r.rushing_yards),
    n(r.completions), n(r.attempts), n(r.carries), n(r.sacks_suffered), -n(r.sack_yards_lost), to, n(r.penalties), n(r.penalty_yards),
    n(r.attempts) + n(r.carries) + n(r.sacks_suffered),
  ];
}
// player lines by category; a player shows up in every category he has numbers in
for (const r of players) {
  if (!r.game_id || !r.team) continue;
  const P = (gameOf(r.game_id).players[r.team] ||= { pass: [], rush: [], rec: [], def: [], kick: [], punt: [], ret: [] });
  const nm = r.player_display_name || r.player_name, pos = r.position || '', id = r.player_id || ''; // id: links to the player's career stats
  if (n(r.attempts)) P.pass.push([nm, n(r.completions), n(r.attempts), n(r.passing_yards), n(r.passing_tds), n(r.passing_interceptions), n(r.sacks_suffered), Math.round(n(r.passing_epa) * 10) / 10, id]);
  if (n(r.carries)) P.rush.push([nm, pos, n(r.carries), n(r.rushing_yards), n(r.rushing_tds), n(r.rushing_fumbles_lost), id]);
  if (n(r.targets) || n(r.receptions)) P.rec.push([nm, pos, n(r.receptions), n(r.targets), n(r.receiving_yards), n(r.receiving_tds), id]);
  const tkl = n(r.def_tackles_solo) + n(r.def_tackle_assists), sk = n(r.def_sacks), int = n(r.def_interceptions), pd = n(r.def_pass_defended), ff = n(r.def_fumbles_forced);
  if (tkl || sk || int || pd || ff) P.def.push([nm, pos, tkl, sk, n(r.def_tackles_for_loss), n(r.def_qb_hits), int, pd, ff, n(r.def_tds), id]);
  if (n(r.fg_att) || n(r.pat_att)) P.kick.push([nm, n(r.fg_made), n(r.fg_att), n(r.fg_long), n(r.pat_made), n(r.pat_att), id]);
  if (n(r.pt_att)) P.punt.push([nm, n(r.pt_att), n(r.pt_yards), n(r.pt_long), n(r.pt_inside_20), id]);
  if (n(r.kickoff_returns) || n(r.punt_returns)) P.ret.push([nm, n(r.kickoff_returns), n(r.kickoff_return_yards), n(r.punt_returns), n(r.punt_return_yards), n(r.special_teams_tds), id]);
}
// biggest contributors first
for (const g of Object.values(games)) for (const P of Object.values(g.players)) {
  P.pass.sort((a, b) => b[2] - a[2]); P.rush.sort((a, b) => b[3] - a[3] || b[2] - a[2]); P.rec.sort((a, b) => b[4] - a[4] || b[2] - a[2]);
  P.def.sort((a, b) => b[2] + b[3] * 3 + b[6] * 4 - (a[2] + a[3] * 3 + a[6] * 4)); P.ret.sort((a, b) => b[2] + b[4] - a[2] - a[4]);
}
const COLS = {
  team: ['fd', 'yds', 'pass', 'rush', 'cmp', 'att', 'car', 'sk', 'skyds', 'to', 'pen', 'penyds', 'plays'],
  pass: ['name', 'cmp', 'att', 'yds', 'td', 'int', 'sk', 'epa', 'id'], rush: ['name', 'pos', 'car', 'yds', 'td', 'fum', 'id'],
  rec: ['name', 'pos', 'rec', 'tgt', 'yds', 'td', 'id'], def: ['name', 'pos', 'tkl', 'sk', 'tfl', 'qbh', 'int', 'pd', 'ff', 'td', 'id'],
  kick: ['name', 'fgm', 'fga', 'lng', 'xpm', 'xpa', 'id'], punt: ['name', 'n', 'yds', 'lng', 'in20', 'id'], ret: ['name', 'kr', 'kryds', 'pr', 'pryds', 'td', 'id'],
};
fs.writeFileSync(path.join(__dirname, 'app', 'boxscores.js'), 'window.NFL_BOX = ' + JSON.stringify({ season, cols: COLS, games }) + ';\n');
const size = fs.statSync(path.join(__dirname, 'app', 'boxscores.js')).size;
console.log(`app/boxscores.js: ${Object.keys(games).length} games from ${season} (${Math.round(size / 1024)} KB)`);
