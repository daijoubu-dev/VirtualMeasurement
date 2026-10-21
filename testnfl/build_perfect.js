// Builds app/perfect.js for the 17-0 page: the best player-seasons since 1999 at every position, each with a grade
// (1–99, how good that season was compared with every qualified season at the position), plus every team-season's
// offensive line (players' stats can't rate linemen, so the line is picked as a unit).
// Usage: node build_perfect.js   (needs data/raw/stats_player_reg_*.csv from fetch.js and data/team_seasons.csv from build.js)
const fs = require('fs');
const path = require('path');
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
const read = (...p) => { const f = path.join(__dirname, 'data', ...p); return fs.existsSync(f) ? parseCsv(fs.readFileSync(f, 'utf8')) : []; };
const n = v => (v === '' || v === 'NA' || v === undefined ? 0 : +v || 0);
const r0 = v => Math.round(v).toLocaleString('en-US');

const FIRST = 1999, LAST = currentSeason() - 1; // completed seasons only
// Position groups, what counts as a full-time season there, a per-game value, and the stat line shown in the app
const GROUPS = {
  QB: { pos: ['QB'], qual: s => s.att >= 200 && s.g >= 8, value: s => (s.pepa + s.repa) / s.g,
    line: s => `${r0(s.pyd)} yds, ${s.ptd} TD, ${s.int} INT${s.ryd >= 300 ? `, ${r0(s.ryd)} rush` : ''}`, keep: 450 },
  RB: { pos: ['RB', 'FB', 'HB'], qual: s => s.car >= 120, value: s => (s.ryd + s.recyd) / s.g * 0.08 + (s.rtd + s.rectd) / s.g * 4 + (s.repa + s.cepa) / s.g * 0.5,
    line: s => `${r0(s.ryd)} rush yds, ${s.rtd + s.rectd} TD, ${r0(s.recyd)} rec yds`, keep: 450 },
  // nflverse has no targets for 2003–08: receivers from those years qualify on catches instead
  WR: { pos: ['WR'], qual: s => s.tgt >= 60 || (!s.tgt && s.rec >= 35), value: s => s.recyd / s.g * 0.08 + s.rectd / s.g * 4 + s.cepa / s.g * 0.5,
    line: s => `${s.rec} rec, ${r0(s.recyd)} yds, ${s.rectd} TD`, keep: 800 },
  TE: { pos: ['TE'], qual: s => s.tgt >= 40 || (!s.tgt && s.rec >= 25), value: s => s.recyd / s.g * 0.08 + s.rectd / s.g * 4 + s.cepa / s.g * 0.5,
    line: s => `${s.rec} rec, ${r0(s.recyd)} yds, ${s.rectd} TD`, keep: 340 },
  DL: { pos: ['DE', 'DT', 'NT', 'DL', 'EDGE'], qual: s => s.g >= 10 && s.tkl >= 15, value: s => (s.sk * 4 + s.qbh + s.tfl * 1.5 + s.ff * 3 + s.pd) / s.g,
    line: s => `${s.sk} sacks, ${s.tfl} TFL, ${s.ff} FF`, keep: 550 },
  LB: { pos: ['LB', 'ILB', 'MLB', 'OLB'], qual: s => s.g >= 10 && s.tkl >= 50, value: s => (s.solo * 0.5 + s.ast * 0.25 + s.tfl * 1.5 + s.sk * 4 + s.dint * 5 + s.pd * 1.5 + s.ff * 3) / s.g,
    line: s => `${s.tkl} tkl, ${s.sk} sacks, ${s.dint} INT`, keep: 400 },
  DB: { pos: ['CB', 'DB', 'S', 'SS', 'FS', 'SAF'], qual: s => s.g >= 10 && s.tkl >= 30, value: s => (s.dint * 5 + s.pd * 1.5 + s.ff * 3 + s.sk * 3 + s.tfl + s.dtd * 6 + s.solo * 0.2) / s.g,
    line: s => `${s.dint} INT, ${s.pd} PD, ${s.tkl} tkl`, keep: 550 },
  K: { pos: ['K'], qual: s => s.fga >= 15, value: s => ((s.fgm - 0.84 * s.fga) * 3 + s.fg50) / s.g,
    line: s => `${s.fgm}/${s.fga} FG, long ${s.fglong}`, keep: 160 },
};

// Within-season z-scores (so eras compare fairly), then a percentile across every qualified season → grade 1–99
function grade(list) {
  const bySeason = {};
  for (const x of list) (bySeason[x.season] ||= []).push(x);
  for (const xs of Object.values(bySeason)) {
    const m = xs.reduce((a, x) => a + x.v, 0) / xs.length, sd = Math.sqrt(xs.reduce((a, x) => a + (x.v - m) ** 2, 0) / xs.length) || 1;
    xs.forEach(x => (x.z = (x.v - m) / sd));
  }
  list.sort((a, b) => a.z - b.z).forEach((x, i) => (x.grade = Math.max(1, Math.round(1 + 98 * i / Math.max(1, list.length - 1)))));
  return list.sort((a, b) => b.z - a.z);
}

const pools = Object.fromEntries(Object.keys(GROUPS).map(k => [k, []]));
for (let season = FIRST; season <= LAST; season++) {
  for (const r of read('raw', `stats_player_reg_${season}.csv`)) {
    const s = {
      id: r.player_id, name: r.player_display_name || r.player_name, pos: r.position, season, team: r.recent_team, g: n(r.games),
      att: n(r.attempts), pyd: n(r.passing_yards), ptd: n(r.passing_tds), int: n(r.passing_interceptions || r.interceptions), pepa: n(r.passing_epa),
      car: n(r.carries), ryd: n(r.rushing_yards), rtd: n(r.rushing_tds), repa: n(r.rushing_epa),
      rec: n(r.receptions), tgt: n(r.targets), recyd: n(r.receiving_yards), rectd: n(r.receiving_tds), cepa: n(r.receiving_epa),
      solo: n(r.def_tackles_solo), ast: n(r.def_tackle_assists || r.def_tackles_with_assist), tfl: n(r.def_tackles_for_loss), sk: n(r.def_sacks), qbh: n(r.def_qb_hits),
      dint: n(r.def_interceptions), pd: n(r.def_pass_defended), ff: n(r.def_fumbles_forced), dtd: n(r.def_tds),
      fgm: n(r.fg_made), fga: n(r.fg_att), fglong: n(r.fg_long), fg50: n(r.fg_made_50_59) + n(r.fg_made_60_),
    };
    if (!s.id || !s.g) continue;
    s.tkl = s.solo + s.ast;
    // 3-4 outside linebackers who rush the passer play like edge rushers
    const key = s.pos === 'OLB' && s.sk >= 5 ? 'DL' : Object.keys(GROUPS).find(k => GROUPS[k].pos.includes(s.pos));
    if (!key || !GROUPS[key].qual(s)) continue;
    pools[key].push({ ...s, v: GROUPS[key].value(s), line: GROUPS[key].line(s) });
  }
}
const out = {}, graded = {}; // graded: every qualified season by group (Ultimate Team collections take whole rosters from it)
const sample = (all, keep) => { const top = Math.round(keep * 0.6), rest = all.slice(top), step = Math.max(1, rest.length / (keep - top));
  return [...all.slice(0, top), ...Array.from({ length: Math.min(keep - top, rest.length) }, (_, i) => rest[Math.floor(i * step)])]; };
for (const [k, list] of Object.entries(pools)) {
  // the best seasons, plus an even sample of the rest so there are cheaper options at every grade for the salary cap
  const all = graded[k] = grade(list);
  out[k] = sample(all, GROUPS[k].keep).map(x => [x.id, x.name, x.season, x.team, x.grade, x.line]);
}
const extra = {}; // Ultimate Team-only player cards (collection rosters outside the sample above)
// Offensive lines, one per team-season: sack rate allowed (lower is better), yards per carry and rushing EPA per carry
const ts = read('team_seasons.csv').filter(t => +t.season >= FIRST && +t.season <= LAST && n(t.reg_carries) > 0);
const ol = ts.map(t => {
  const sr = n(t.reg_sacks_suffered) / Math.max(1, n(t.reg_attempts) + n(t.reg_sacks_suffered)), ypc = n(t.reg_rushing_yards) / n(t.reg_carries), epa = n(t.reg_rushing_epa) / n(t.reg_carries);
  return { id: 'OL-' + t.team + '-' + t.season, name: `${t.team} O-line`, season: +t.season, team: t.team, sr, ypc, epa, v: 0, line: `${(100 * sr).toFixed(1)}% sack rate, ${ypc.toFixed(1)} yds/carry` };
});
// value = -sack rate z + yards per carry z / 2 + rush EPA z (each within its season)
for (const k of ['sr', 'ypc', 'epa']) {
  const by = {}; ol.forEach(x => (by[x.season] ||= []).push(x));
  for (const xs of Object.values(by)) {
    const m = xs.reduce((a, x) => a + x[k], 0) / xs.length, sd = Math.sqrt(xs.reduce((a, x) => a + (x[k] - m) ** 2, 0) / xs.length) || 1;
    xs.forEach(x => (x.v += ((x[k] - m) / sd) * (k === 'sr' ? -1 : k === 'ypc' ? 0.5 : 1)));
  }
}
ol.forEach(x => (x.season = x.season)); // grade() works on .v
out.OL = grade(ol).map(x => [x.id, x.name, x.season, x.team, x.grade, x.line]);

// ---------- Ultimate Team staff cards (not used by 17-0): head coaches and stadiums, from the schedule ----------
const sched = read('raw', 'games.csv').filter(g => +g.season >= FIRST && +g.season <= LAST && g.home_score !== '' && g.away_score !== '');
// 🧢 Head coaches: one card per coach-team-season (8+ regular-season games), graded on win %, point differential and
// playoff wins, each compared within its season
const POST_ROUND = { WC: 'Wild Card', DIV: 'Divisional', CON: 'Conference title game', SB: 'Super Bowl' };
const coach = new Map();
for (const g of sched) for (const side of ['home', 'away']) {
  const name = g[`${side}_coach`], team = g[`${side}_team`]; if (!name) continue;
  const us = n(g[`${side}_score`]), them = n(g[`${side === 'home' ? 'away' : 'home'}_score`]), key = `${name}|${team}|${g.season}`;
  const c = coach.get(key) || coach.set(key, { name, team, season: +g.season, w: 0, l: 0, t: 0, diff: 0, gp: 0, pw: 0, last: '', sb: false }).get(key);
  if (g.game_type === 'REG') { c.gp++; c.diff += us - them; us > them ? c.w++ : us < them ? c.l++ : c.t++; }
  else { if (us > them) { c.pw++; if (g.game_type === 'SB') c.sb = true; } else c.last = POST_ROUND[g.game_type] || ''; }
}
const coaches = [...coach.values()].filter(c => c.gp >= 8).map(c => {
  const pct = (c.w + c.t / 2) / c.gp, dpg = c.diff / c.gp;
  const fin = c.sb ? 'won the Super Bowl 🏆' : c.last ? `lost in the ${c.last}` : c.pw ? '' : 'missed the playoffs';
  return { id: 'HC-' + c.name.toLowerCase().replace(/[^a-z]+/g, '-') + '-' + c.team, name: c.name, season: c.season, team: c.team,
    v: pct + dpg * 0.02 + c.pw * 0.07 + (c.sb ? 0.12 : 0), line: `${c.w}-${c.l}${c.t ? '-' + c.t : ''}, ${dpg >= 0 ? '+' : ''}${dpg.toFixed(1)} a game${fin ? ', ' + fin : ''}` };
});
// 🏟️ Stadiums: one card per stadium and home team (3+ seasons of home games), graded on how much better that team did
// there than on the road in the same seasons (home-field edge), with a bump for the cold, loud outdoor places.
// Each card also keeps its roof and its typical December temperature, which the game sim uses for weather.
const venue = new Map(), road = new Map();
for (const g of sched) {
  if (g.game_type !== 'REG') continue;
  const hm = n(g.home_score) - n(g.away_score);
  const r = road.get(`${g.away_team}|${g.season}`) || road.set(`${g.away_team}|${g.season}`, { m: 0, gp: 0 }).get(`${g.away_team}|${g.season}`); r.m -= hm; r.gp++;
  if (g.location !== 'Home' || !g.stadium_id) continue;
  const key = `${g.stadium_id}|${g.home_team}`;
  const v = venue.get(key) || venue.set(key, { sid: g.stadium_id, team: g.home_team, name: '', s0: 9999, s1: 0, gp: 0, w: 0, m: 0, seasons: new Set(), roof: '', surface: '', temps: [] }).get(key);
  v.gp++; v.m += hm; if (hm > 0) v.w++; v.seasons.add(g.season);
  if (+g.season >= v.s1) { v.name = g.stadium; v.roof = g.roof; v.surface = g.surface; } // its newest name
  v.s0 = Math.min(v.s0, +g.season); v.s1 = Math.max(v.s1, +g.season);
  const month = +String(g.gameday).slice(5, 7);
  if ((month === 12 || month === 1) && g.temp !== '' && g.temp !== 'NA') v.temps.push(n(g.temp));
}
const stadiums = [...venue.values()].filter(v => v.gp >= 24).map(v => {
  const rd = [...v.seasons].map(s => road.get(`${v.team}|${s}`)).filter(Boolean), roadM = rd.reduce((a, r) => a + r.m, 0) / Math.max(1, rd.reduce((a, r) => a + r.gp, 0));
  const edge = v.gp ? v.m / v.gp - roadM : 0, dome = v.roof === 'dome' || v.roof === 'closed' || v.roof === 'open';
  const dec = v.temps.length ? Math.round(v.temps.reduce((a, b) => a + b, 0) / v.temps.length) : null;
  const cold = !dome && dec !== null ? Math.max(0, 45 - dec) : 0;
  const roofTxt = v.roof === 'dome' ? 'Dome' : dome ? 'Retractable roof' : 'Open air';
  return { id: 'ST-' + v.sid + '-' + v.team, name: v.name, season: v.s0 === v.s1 ? String(v.s0) : `${v.s0}–${String(v.s1).slice(2)}`, team: v.team, sortSeason: v.s1,
    v: edge + cold * 0.08 + (v.w / v.gp) * 2, x: { roof: dome ? (v.roof === 'dome' ? 'dome' : 'retractable') : 'outdoors', dec: dome ? 72 : dec, edge: Math.round(edge * 10) / 10 },
    line: `${roofTxt}${!dome && dec !== null ? ` · ${dec}° in Dec` : ''} · home ${edge >= 0 ? '+' : ''}${edge.toFixed(1)} vs road` };
});
// grade() compares within a season; stadiums all compare with each other (it sorts the list, so seasons are kept by card)
const gradeAll = list => { const keep = new Map(list.map(x => [x, x.season])); list.forEach(x => (x.season = 0)); grade(list); list.forEach(x => (x.season = keep.get(x))); return list.sort((a, b) => b.grade - a.grade); };
const staff = {
  HC: grade(coaches).map(x => [x.id, x.name, x.season, x.team, x.grade, x.line]),
  ST: gradeAll(stadiums).map(x => [x.id, x.name, x.season, x.team, x.grade, x.line, x.x]),
};

// ---------- 🏆 Ultimate Team collections: legendary teams. Collect the team's cards (from its own team pack or any
// pack), turn them in once for points and a Mythic 99 edition of its star. Players from the team's roster who aren't in
// the 17-0 sample above go into "extra" (Ultimate Team only, so 17-0 doesn't change). ----------
const LEGENDS = [ // [team (schedule code), season, name, story, star]
  ['STL', 1999, 'Greatest Show on Turf', 'From grocery bagger to MVP: Warner, Faulk and a track meet every Sunday.', 'Kurt Warner'],
  ['BAL', 2000, '2000 Ravens defense', 'Allowed 165 points in 16 games, a record. Trent Dilfer won a ring.', 'Ray Lewis'],
  ['TB', 2002, '2002 Buccaneers', 'Tampa 2 at its peak: four pick-sixes in the playoffs, three in the Super Bowl.', 'Derrick Brooks'],
  ['PIT', 2005, '2005 Steelers', 'A 6 seed that won three road games and One for the Thumb.', 'Troy Polamalu'],
  ['IND', 2006, '2006 Colts', 'Peyton finally gets his ring, in the rain in Miami.', 'Peyton Manning'],
  ['NE', 2007, '2007 Patriots', '16-0, 589 points, 50 Brady TDs, 23 for Moss. Then the helmet catch.', 'Randy Moss'],
  ['NO', 2009, '2009 Saints', 'Who Dat. The onside kick to open the second half.', 'Drew Brees'],
  ['GB', 2010, '2010 Packers', 'A 6 seed, a pile of injuries and the Lombardi coming home to Titletown.', 'Aaron Rodgers'],
  ['NYG', 2011, '2011 Giants', '9-7 and beat the Patriots in the Super Bowl again.', 'Eli Manning'],
  ['SEA', 2013, 'Legion of Boom', 'Best defense of the decade, 43-8 over the record-setting Broncos.', 'Richard Sherman'],
  ['CAR', 2015, '2015 Panthers', '15-1, Superman dabs, an MVP season.', 'Cam Newton'],
  ['DEN', 2015, 'No Fly Zone', 'Von Miller took the Super Bowl over, and Peyton rode off with a ring.', 'Von Miller'],
  ['ATL', 2016, '2016 Falcons', 'The best offense in the league. Do not mention 28–3.', 'Matt Ryan'],
  ['PHI', 2017, '2017 Eagles', 'Philly Special. Underdog masks. A backup QB beat Brady.', 'Zach Ertz'],
  ['BAL', 2019, '2019 Ravens', 'Lamar\'s unanimous MVP and the best rushing season ever.', 'Lamar Jackson'],
  ['SF', 2019, '2019 49ers', 'Shanahan\'s machine: Kittle, Deebo and a defensive line that ate.', 'George Kittle'],
  ['LA', 2021, '2021 Rams', 'Kupp\'s triple crown, Donald\'s ring, all in at SoFi.', 'Cooper Kupp'],
  ['KC', 2022, '2022 Chiefs', 'Mahomes on one ankle, MVP and a second ring.', 'Patrick Mahomes'],
  ['DET', 2023, '2023 Lions', 'Kneecaps. Detroit\'s first division title in 30 years.', 'Amon-Ra St. Brown'],
  ['PHI', 2024, '2024 Eagles', 'Saquon\'s 2,000 yards and a Super Bowl blowout of the Chiefs.', 'Saquon Barkley'],
  ['STL', 2001, 'Greatest Show, take two', '14-2 and favored by two touchdowns in the Super Bowl. Then a young Tom Brady happened.', 'Marshall Faulk'],
  ['IND', 2004, '2004 Colts', 'Peyton\'s 49 touchdown passes broke Marino\'s record.', 'Peyton Manning'],
  ['SEA', 2005, '2005 Seahawks', 'Shaun Alexander\'s 28 touchdowns, an MVP and a trip to Super Bowl XL.', 'Shaun Alexander'],
  ['SD', 2006, '2006 Chargers', 'LaDainian Tomlinson\'s record 31 touchdowns and a 14-2 season.', 'LaDainian Tomlinson'],
  ['NE', 2010, '2010 Patriots', '14-2 and a unanimous MVP for Brady: 36 touchdowns, 4 picks.', 'Tom Brady'],
  ['GB', 2011, '2011 Packers', '15-1 and Rodgers\' 45-touchdown MVP season.', 'Aaron Rodgers'],
  ['MIN', 2012, '2012 Vikings', 'Adrian Peterson ran for 2,097 yards on a rebuilt knee.', 'Adrian Peterson'],
  ['DEN', 2013, '2013 Broncos', '606 points, a record. Peyton threw 55 touchdowns.', 'Peyton Manning'],
  ['KC', 2018, '2018 Chiefs', 'Mahomes\' first year as the starter: 50 touchdowns and an MVP.', 'Patrick Mahomes'],
  ['LA', 2018, '2018 Rams', 'McVay\'s offense and Aaron Donald\'s 20.5 sacks.', 'Aaron Donald'],
  ['BAL', 2023, '2023 Ravens', 'Lamar\'s second MVP and the league\'s best record.', 'Lamar Jackson'],
  ['DET', 2024, '2024 Lions', '15-2, the best season in franchise history.', 'Jahmyr Gibbs'],
].filter(([, s]) => s <= LAST);
// …plus every Super Bowl champion since 1999 that isn't on the list (star: its best card)
const TEAMS = Object.fromEntries(read('raw', 'teams_colors_logos.csv').map(t => [t.team_abbr, t]));
const roman = n => [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']].reduce((s, [v, r]) => { while (n >= v) { s += r; n -= v; } return s; }, '');
for (const g of sched.filter(g => g.game_type === 'SB')) {
  const hw = n(g.home_score) > n(g.away_score), team = hw ? g.home_team : g.away_team, opp = hw ? g.away_team : g.home_team, season = +g.season;
  if (LEGENDS.some(([t, s]) => t === team && s === season)) continue;
  const reg = sched.filter(x => x.game_type === 'REG' && +x.season === season && (x.home_team === team || x.away_team === team));
  const w = reg.filter(x => (x.home_team === team) === (n(x.home_score) > n(x.away_score)) && x.home_score !== x.away_score).length;
  const ties = reg.filter(x => x.home_score === x.away_score).length;
  const score = `${Math.max(n(g.home_score), n(g.away_score))}–${Math.min(n(g.home_score), n(g.away_score))}`;
  LEGENDS.push([team, season, `${season} ${TEAMS[team]?.team_nick || team}`, `Won Super Bowl ${roman(season - 1965)}, ${score} over the ${TEAMS[opp]?.team_nick || opp}, after ${[8, 11, 18].includes(w) ? 'an' : 'a'} ${w}-${reg.length - w - ties}${ties ? '-' + ties : ''} season.`, null]);
}
LEGENDS.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
const ALIAS = { STL: ['STL', 'LA'], SD: ['SD', 'LAC'], OAK: ['OAK', 'LV'] }; // player stats use today's team codes
const inPool = new Set([...Object.values(out), ...Object.values(extra)].flat().map(r => `${r[0]}|${r[2]}`));
const collections = [];
for (const [team, season, name, story, starName] of LEGENDS) {
  const codes = ALIAS[team] || [team], mine = x => codes.includes(x.team) && x.season === season;
  const players = Object.entries(graded).filter(([g]) => g !== 'K').flatMap(([g, list]) => list.filter(mine).map(x => ({ g, x })));
  const line = ol.filter(mine).map(x => ({ g: 'OL', x })), hc = grade(coaches.slice()).filter(mine).map(x => ({ g: 'HC', x })).slice(0, 1);
  const star = players.find(p => p.x.name === starName) || players.sort((a, b) => b.x.grade - a.x.grade)[0];
  if (!star) continue;
  // the star, the coach, then the team's best cards: 8 in all
  const set = [star, ...hc, ...players.filter(p => p !== star).sort((a, b) => b.x.grade - a.x.grade)].slice(0, 7);
  if (line.length && set.length < 8) set.push(line[0]);
  if (set.length < 5) continue;
  for (const { g, x } of set) if (g !== 'HC' && g !== 'OL' && !inPool.has(`${x.id}|${x.season}`)) { (extra[g] ||= []).push([x.id, x.name, x.season, x.team, x.grade, x.line]); inPool.add(`${x.id}|${x.season}`); }
  collections.push({ id: `${team}-${season}`, name, story, team, season, cards: set.map(({ x }) => `${x.id}|${x.season}`), star: `${star.x.id}|${star.x.season}` });
}

// 📸 headshots for the Ultimate Team cards, stored short as "espnId|nfl" (either part can be empty; see UT.photos for the
// addresses): ESPN keeps photos of many retired players that NFL.com only has a silhouette for, NFL.com has some ESPN
// doesn't, so the page tries ESPN, then NFL.com ('p:' or 'u:' + image id, the player's newest), then the team logo.
// Team logos (by today's team code) are also for coach, stadium and O-line cards.
const nflHead = {}, used = new Set([...Object.values(out), ...Object.values(extra)].flat().map(r => r[0]));
for (let season = FIRST; season <= LAST; season++) for (const r of read('raw', `stats_player_reg_${season}.csv`)) {
  const m = used.has(r.player_id) && String(r.headshot_url).match(/static\.www\.nfl\.com\/image\/(private|upload)\/f_auto,q_auto\/league\/([a-z0-9]+)$/);
  if (m) nflHead[r.player_id] = (m[1] === 'private' ? 'p:' : 'u:') + m[2];
}
const espnId = Object.fromEntries(read('raw', 'players.csv').filter(p => used.has(p.gsis_id) && /^\d+$/.test(p.espn_id)).map(p => [p.gsis_id, p.espn_id]));
const heads = Object.fromEntries([...used].filter(id => espnId[id] || nflHead[id]).map(id => [id, `${espnId[id] || ''}|${nflHead[id] || ''}`]));
const logos = Object.fromEntries(Object.values(TEAMS).map(t => [t.team_abbr, t.team_logo_espn]).filter(([, l]) => l));

const data = { first: FIRST, last: LAST, cols: ['id', 'name', 'season', 'team', 'grade', 'line', 'x'], groups: out, staff, extra, collections, heads, logos };
fs.writeFileSync(path.join(__dirname, 'app', 'perfect.js'), 'window.NFL_PERFECT = ' + JSON.stringify(data) + ';\n');
console.log(`app/perfect.js: ${Object.entries({ ...out, ...staff }).map(([k, v]) => `${k} ${v.length}`).join(', ')}, ${collections.length} collections (+${Object.values(extra).flat().length} roster cards) (${FIRST}–${LAST})`);
