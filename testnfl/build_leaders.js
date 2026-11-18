// Builds the weekly stat leaders from nflverse's weekly player stats:
//   app/leaders.js      every week of this season, top 10 in each category (the Leaders page, loaded only there)
//   app/ticker-data.js  the week on show, top 3 in the main categories (the scrolling ticker on every page, so it stays tiny)
// Which week is on show: the newest week whose SUNDAY games are in the stats. So a Thursday game alone doesn't flip it
// (after Thursday you still see last week), the Sunday refresh moves it to the current week, and Monday's refresh
// completes that week, which then stays up as "last week" until the next Sunday.
// Usage: node build_leaders.js [season]   (needs data/raw/games.csv and stats_player_week_<season>.csv.gz from fetch.js)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { currentSeason } = require('./fetch');
const { headlines } = require('./breaking');

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
const plural = (v, w) => `${v} ${w}${v === 1 ? '' : 's'}`;

function passerRating(r) {
  const att = n(r.attempts); if (!att) return 0;
  const c = x => Math.max(0, Math.min(2.375, x));
  return ((c((n(r.completions) / att - 0.3) * 5) + c((n(r.passing_yards) / att - 3) * 0.25) + c((n(r.passing_tds) / att) * 20) + c(2.375 - (n(r.passing_interceptions) / att) * 25)) / 6) * 100;
}
const totalTd = r => n(r.rushing_tds) + n(r.receiving_tds) + n(r.def_tds) + n(r.special_teams_tds);
const passLine = r => `${n(r.completions)}/${n(r.attempts)}, ${plural(n(r.passing_tds), 'TD')}${n(r.passing_interceptions) ? `, ${n(r.passing_interceptions)} INT` : ''}`;
const rushLine = r => `${n(r.carries)} car, ${(n(r.rushing_yards) / Math.max(1, n(r.carries))).toFixed(1)} avg${n(r.rushing_tds) ? `, ${plural(n(r.rushing_tds), 'TD')}` : ''}`;
const recLine = r => `${n(r.receptions)} rec on ${n(r.targets)} tgt${n(r.receiving_tds) ? `, ${plural(n(r.receiving_tds), 'TD')}` : ''}`;
const defLine = r => [n(r.def_tackles_solo) + n(r.def_tackle_assists) && `${n(r.def_tackles_solo) + n(r.def_tackle_assists)} tkl`, n(r.def_sacks) && `${n(r.def_sacks)} sk`, n(r.def_tackles_for_loss) && `${n(r.def_tackles_for_loss)} TFL`, n(r.def_interceptions) && `${n(r.def_interceptions)} INT`, n(r.def_pass_defended) && `${n(r.def_pass_defended)} PD`].filter(Boolean).join(', ');

// key, name, ticker label, group, decimals, value of a player's week, the line under their name
const CATS = [
  ['pyd', 'Passing yards', 'PASS YDS', 'offense', 0, r => n(r.passing_yards), passLine],
  ['ptd', 'Passing touchdowns', 'PASS TD', 'offense', 0, r => n(r.passing_tds), r => `${n(r.passing_yards)} yds, ${passLine(r)}`],
  ['rating', 'Passer rating (15+ attempts)', 'RATING', 'offense', 1, r => (n(r.attempts) >= 15 ? passerRating(r) : 0), r => `${n(r.passing_yards)} yds, ${passLine(r)}`],
  ['ryd', 'Rushing yards', 'RUSH YDS', 'offense', 0, r => n(r.rushing_yards), rushLine],
  ['rtd', 'Rushing touchdowns', 'RUSH TD', 'offense', 0, r => n(r.rushing_tds), r => `${n(r.rushing_yards)} yds, ${rushLine(r)}`],
  ['recyd', 'Receiving yards', 'REC YDS', 'offense', 0, r => n(r.receiving_yards), recLine],
  ['rec', 'Receptions', 'CATCHES', 'offense', 0, r => n(r.receptions), r => `${n(r.receiving_yards)} yds on ${n(r.targets)} tgt`],
  ['rectd', 'Receiving touchdowns', 'REC TD', 'offense', 0, r => n(r.receiving_tds), r => `${n(r.receiving_yards)} yds, ${recLine(r)}`],
  ['scrim', 'Yards from scrimmage', 'SCRIM YDS', 'offense', 0, r => n(r.rushing_yards) + n(r.receiving_yards), r => `${n(r.rushing_yards)} rush, ${n(r.receiving_yards)} rec`],
  ['td', 'Total touchdowns', 'TOTAL TD', 'offense', 0, totalTd, r => `${n(r.rushing_tds)} rush, ${n(r.receiving_tds)} rec`],
  ['sk', 'Sacks', 'SACKS', 'defense', 1, r => n(r.def_sacks), defLine],
  ['tkl', 'Tackles', 'TACKLES', 'defense', 0, r => n(r.def_tackles_solo) + n(r.def_tackle_assists), defLine],
  ['tfl', 'Tackles for loss', 'TFL', 'defense', 0, r => n(r.def_tackles_for_loss), defLine],
  ['dint', 'Interceptions', 'INT', 'defense', 0, r => n(r.def_interceptions), defLine],
  ['pd', 'Passes defended', 'PD', 'defense', 0, r => n(r.def_pass_defended), defLine],
  ['ff', 'Forced fumbles', 'FF', 'defense', 0, r => n(r.def_fumbles_forced), defLine],
  ['fgm', 'Field goals made', 'FG', 'special', 0, r => n(r.fg_made), r => `${n(r.fg_made)}/${n(r.fg_att)}, long ${n(r.fg_long)}`],
  ['ret', 'Return yards', 'RET YDS', 'special', 0, r => n(r.kickoff_return_yards) + n(r.punt_return_yards), r => `${n(r.kickoff_returns)} KR, ${n(r.punt_returns)} PR`],
  ['fpts', 'Fantasy points (PPR)', 'FANTASY', 'fantasy', 1, r => n(r.fantasy_points_ppr), r => [n(r.passing_yards) && `${n(r.passing_yards)} pass`, n(r.rushing_yards) && `${n(r.rushing_yards)} rush`, n(r.receiving_yards) && `${n(r.receiving_yards)} rec`, totalTd(r) + n(r.passing_tds) && plural(totalTd(r) + n(r.passing_tds), 'TD')].filter(Boolean).join(', ')],
];
const TICKER_CATS = ['pyd', 'ryd', 'recyd', 'td', 'sk', 'tkl', 'dint', 'fpts'], TOP = 10, TICKER_TOP = 3;
const ROUND = { WC: 'Wild Card', DIV: 'Divisional', CON: 'Conference Championships', SB: 'Super Bowl' };

// The week to show: the newest one with a Sunday game in the stats. weeks: [{ week, sunday (a Sunday game has stats) }]
const pickWeek = weeks => [...weeks].sort((a, b) => b.week - a.week).find(w => w.sunday) || null;

function build(season) {
  const schedule = read('games.csv').filter(g => +g.season === season), players = read(`stats_player_week_${season}.csv.gz`).filter(r => r.game_id);
  const statGames = new Set(players.map(r => r.game_id)), weeks = new Map();
  for (const g of schedule) {
    const w = weeks.get(+g.week) || weeks.set(+g.week, { week: +g.week, type: g.game_type, games: 0, played: 0, sunday: false }).get(+g.week);
    w.games++;
    if (statGames.has(g.game_id)) { w.played++; if (g.weekday === 'Sunday') w.sunday = true; }
  }
  const people = {}, list = [];
  for (const w of [...weeks.values()].filter(x => x.played).sort((a, b) => a.week - b.week)) {
    const rows = players.filter(r => +r.week === w.week), cats = {};
    for (const [key, , , , , value, line] of CATS) {
      cats[key] = rows.map(r => ({ r, v: value(r) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v || a.r.player_display_name.localeCompare(b.r.player_display_name)).slice(0, TOP)
        .map(({ r, v }) => {
          const m = String(r.headshot_url).match(/static\.www\.nfl\.com\/image\/(private|upload)\/f_auto,q_auto\/league\/([a-z0-9]+)$/);
          people[r.player_id] ||= [r.player_display_name || r.player_name, String(r.player_name).replace(/^([A-Za-z'-]+\.)(?=\S)/, '$1 '), r.position || '', m ? `${m[1][0]}:${m[2]}` : ''];
          return [r.player_id, r.team, Math.round(v * 10) / 10, line(r)];
        });
    }
    list.push({ week: w.week, label: ROUND[w.type] || `Week ${w.week}`, type: w.type, games: w.games, played: w.played, done: w.played >= w.games, sunday: w.sunday, cats });
  }
  const show = pickWeek(list);
  const teams = Object.fromEntries(read('teams_colors_logos.csv').map(t => [t.team_abbr, { name: t.team_name, nick: t.team_nick, logo: t.team_logo_espn, color: t.team_color }]));
  // who's who right now, for the ticker's 🚨 headlines: each team's starter and coach in its latest game
  const ctx = { season, week: show?.week ?? 0, qb: {}, coach: {}, playerTeam: {}, nick: Object.fromEntries(Object.entries(teams).map(([t, x]) => [t, x.nick])),
    rows: players.filter(r => +r.week === show?.week), games: schedule.filter(g => +g.week === show?.week) };
  for (const g of schedule.filter(x => x.home_score !== '').sort((a, b) => +a.week - +b.week)) for (const s of ['home', 'away']) { ctx.qb[g[`${s}_team`]] = g[`${s}_qb_name`]; ctx.coach[g[`${s}_team`]] = g[`${s}_coach`]; }
  for (const r of [...players].sort((a, b) => +a.week - +b.week)) ctx.playerTeam[r.player_display_name] = r.team;
  return { ctx, season, show: show ? show.week : null, cats: CATS.map(([key, name, short, group, dec]) => ({ key, name, short, group, dec })), weeks: list, people, teams };
}

function tickerData(L, news = []) {
  const w = L.weeks.find(x => x.week === L.show); if (!w) return { season: L.season, none: true };
  const used = new Set(), logos = {};
  const items = TICKER_CATS.map(key => {
    const c = L.cats.find(x => x.key === key);
    const rows = w.cats[key].slice(0, TICKER_TOP).map(([id, team, v]) => { used.add(team); return [L.people[id][1], team, c.dec ? v.toFixed(v % 1 ? 1 : 0) : String(v), id]; });
    return { key, label: c.short, rows };
  }).filter(x => x.rows.length);
  for (const t of used) if (L.teams[t]?.logo) logos[t] = L.teams[t].logo;
  return { season: L.season, week: w.week, label: w.label, tag: w.done ? 'Last week' : 'This week', status: w.done ? 'Final' : `${w.played} of ${w.games} games`, items, logos, news };
}

module.exports = { pickWeek, build, tickerData };

if (require.main === module) {
  const { ctx, ...L } = build(+process.argv[2] || currentSeason()), T = tickerData(L, L.show ? headlines(ctx) : []), app = path.join(__dirname, 'app');
  fs.writeFileSync(path.join(app, 'leaders.js'), 'window.NFL_LEADERS = ' + JSON.stringify(L) + ';\n');
  fs.writeFileSync(path.join(app, 'ticker-data.js'), 'window.NFL_TICKER = ' + JSON.stringify(T) + ';\n');
  const kb = f => Math.round(fs.statSync(path.join(app, f)).size / 1024);
  console.log(`app/leaders.js: ${L.weeks.length} weeks of ${L.season} (${kb('leaders.js')} KB); ticker shows ${T.none ? 'nothing yet' : `${T.label}, ${T.status}, ${T.news.length} headlines`} (${kb('ticker-data.js')} KB)`);
}
