// Builds app/chartdata.js for the Charts page: one row per player (or team) per period (season to date = week 0, plus
// each week of the current season; last season as a whole), combining every free source we download:
//   nflverse weekly player stats (EPA, target share, air yards, WOPR, RACR...), NFL Next Gen Stats (separation, time to
//   throw, rush yards over expected...), Pro Football Reference advanced stats (drops, broken tackles, yards after
//   contact, and the defender stats: passer rating allowed, pressures, missed tackles) and PFR snap counts.
// PFR uses its own player ids; nflverse's players.csv maps them to ours.
// Usage: node build_charts.js   (needs data/raw from fetch.js)
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
  return (data || []).map(r => Object.fromEntries(header.map((h, j) => [h, r[j] ?? ''])));
}
const RAW = path.join(__dirname, 'data', 'raw');
const read = f => { const p = path.join(RAW, f); if (!fs.existsSync(p)) return []; const buf = fs.readFileSync(p); return parseCsv((f.endsWith('.gz') ? zlib.gunzipSync(buf) : buf).toString('utf8')); };
const n = v => (v === '' || v === 'NA' || v === undefined || v === null ? 0 : +v || 0);
const TEAM_FIX = { LAR: 'LA', STL: 'LA', SD: 'LAC', OAK: 'LV', JAC: 'JAX', WSH: 'WAS', GNB: 'GB', KAN: 'KC', NWE: 'NE', NOR: 'NO', SFO: 'SF', TAM: 'TB', LVR: 'LV', SDG: 'LAC', RAM: 'LA', CRD: 'ARI', RAV: 'BAL', HTX: 'HOU', CLT: 'IND', OTI: 'TEN', RAI: 'LV' };
const fixTeam = t => TEAM_FIX[t] || t;
const div = (a, b) => (b ? a / b : null);
const r3 = v => (typeof v === 'string' ? v : v === null || v === undefined || !isFinite(v) ? null : Math.round(v * 1000) / 1000);
const rating = (cmp, att, yds, td, int) => { // NFL passer rating
  if (!att) return null; const c = x => Math.max(0, Math.min(2.375, x));
  return ((c((cmp / att - 0.3) * 5) + c((yds / att - 3) * 0.25) + c((td / att) * 20) + c(2.375 - (int / att) * 25)) / 6) * 100;
};

const CUR = currentSeason(), SEASONS = [CUR - 1, CUR];
// PFR id → our (gsis) id, name and position
const PFR = new Map();
for (const p of read('players.csv')) if (p.pfr_id && p.gsis_id) PFR.set(p.pfr_id, { id: p.gsis_id, name: p.display_name, pos: p.position });
// Next Gen Stats by season|week|id
const NGS = {};
for (const kind of ['receiving', 'passing', 'rushing']) {
  NGS[kind] = new Map();
  for (const r of read(`ngs_${kind}.csv.gz`)) if (r.season_type === 'REG' && SEASONS.includes(+r.season)) NGS[kind].set(`${r.season}|${r.week}|${r.player_gsis_id}`, r);
}

const out = { seasons: SEASONS, current: CUR, weeks: {}, kinds: {} };
const KINDS = {
  receiving: ['targets', 'receptions', 'rec_yards', 'rec_td', 'catch_pct', 'tshare', 'airshare', 'wopr', 'racr', 'adot', 'yac_per_rec', 'epa', 'epa_per_target', 'fd_per_target',
    'separation', 'cushion', 'yacoe', 'drops', 'drop_pct', 'broken_tackles', 'rating_when_targeted', 'snap_pct', 'targets_per_snap', 'fpts_per_game'],
  passing: ['attempts', 'dropbacks', 'cmp_pct', 'pass_yards', 'pass_td', 'ints', 'sacks', 'ypa', 'epa', 'epa_per_db', 'epa_per_play', 'cpoe', 'ttt', 'aggressiveness',
    'iay', 'cay', 'air_to_sticks', 'bad_throw_pct', 'pressure_pct', 'sack_pct', 'td_pct', 'int_pct', 'rush_yards', 'fpts_per_game'],
  rushing: ['carries', 'rush_yards', 'ypc', 'rush_td', 'epa', 'epa_per_carry', 'fd_per_carry', 'ryoe_per_att', 'ryoe', 'efficiency', 'stacked_pct', 'ttlos',
    'ybc_per_att', 'yac_per_att', 'broken_tackles', 'bt_per_touch', 'targets', 'receptions', 'snap_pct', 'touches_per_snap', 'fpts_per_game'],
  defense: ['def_snaps', 'snap_pct', 'targets', 'cmp_allowed', 'cmp_pct_allowed', 'yds_per_target', 'rating_allowed', 'adot_against', 'yac_allowed', 'td_allowed', 'ints',
    'pressures', 'sacks', 'hurries', 'qb_hits', 'blitzes', 'pressures_per_snap', 'tackles', 'missed_tackles', 'missed_tackle_pct'],
  teams: ['off_epa_play', 'def_epa_play', 'pass_epa_db', 'rush_epa_carry', 'def_pass_epa_db', 'def_rush_epa_carry', 'ppg', 'papg', 'diff_pg', 'yds_play', 'def_yds_play', 'pass_rate'],
};
for (const k of Object.keys(KINDS)) out.kinds[k] = { cols: KINDS[k], rows: [] };

for (const S of SEASONS) {
  const weekly = read(`stats_player_week_${S}.csv.gz`).filter(r => r.season_type === 'REG');
  const weeks = [...new Set(weekly.map(r => +r.week))].sort((a, b) => a - b);
  out.weeks[S] = weeks;
  const periods = S === CUR ? [0, ...weeks] : [0];
  // PFR and snap counts, keyed by our id
  const pfr = {};
  for (const kind of ['pass', 'rec', 'rush', 'def']) pfr[kind] = read(`advstats_week_${kind}_${S}.csv`).filter(r => r.game_type === 'REG').map(r => ({ ...r, id: PFR.get(r.pfr_player_id)?.id, wk: +r.week }));
  const snaps = read(`snap_counts_${S}.csv`).filter(r => r.game_type === 'REG').map(r => ({ ...r, id: PFR.get(r.pfr_player_id)?.id, wk: +r.week, team: fixTeam(r.team) }));
  // team snaps per game: the most anyone on the team played (QBs and linemen play every snap)
  const teamSnaps = {};
  for (const r of snaps) { const k = `${r.team}|${r.wk}`; const t = teamSnaps[k] ||= { o: 0, d: 0 }; t.o = Math.max(t.o, n(r.offense_snaps)); t.d = Math.max(t.d, n(r.defense_snaps)); }
  const teamWeeks = {};
  for (const r of read(`stats_team_week_${S}.csv`).filter(r => r.season_type === 'REG')) (teamWeeks[fixTeam(r.team)] ||= []).push(r);
  const games = read('games.csv').filter(g => +g.season === S && g.game_type === 'REG' && g.home_score !== '');

  for (const P of periods) {
    const inP = r => P === 0 || +r.week === P || r.wk === P;
    const ngs = (kind, id) => NGS[kind].get(`${S}|${P}|${id}`);
    // ---- players: sums over the period ----
    const pl = new Map();
    for (const r of weekly.filter(inP)) {
      const x = pl.get(r.player_id) || { id: r.player_id, name: r.player_display_name, pos: r.position, team: '', wk: -1, g: 0, s: {} };
      if (+r.week > x.wk) { x.wk = +r.week; x.team = fixTeam(r.team); }
      x.g++;
      for (const k of ['attempts', 'completions', 'passing_yards', 'passing_tds', 'passing_interceptions', 'sacks_suffered', 'passing_epa', 'passing_air_yards', 'carries', 'rushing_yards', 'rushing_tds',
        'rushing_epa', 'rushing_first_downs', 'receptions', 'targets', 'receiving_yards', 'receiving_tds', 'receiving_air_yards', 'receiving_yards_after_catch', 'receiving_epa', 'receiving_first_downs', 'fantasy_points_ppr'])
        x.s[k] = (x.s[k] || 0) + n(r[k]);
      pl.set(r.player_id, x);
    }
    // team totals for the shares
    const tt = {};
    for (const x of pl.values()) { const t = tt[x.team] ||= { tgt: 0, ay: 0 }; t.tgt += x.s.targets; t.ay += x.s.receiving_air_yards; }
    const sumPfr = (kind, id, keys) => { const s = { games: 0 }; for (const r of pfr[kind]) if (r.id === id && inP(r)) { s.games++; for (const k of keys) s[k] = (s[k] || 0) + n(r[k]); } return s; };
    const snapsOf = (id, side) => { let me = 0, team = 0; for (const r of snaps) if (r.id === id && inP(r)) { me += n(r[side === 'o' ? 'offense_snaps' : 'defense_snaps']); team += teamSnaps[`${r.team}|${r.wk}`]?.[side] || 0; } return { me, team }; };
    const base = x => [S, P, x.id, x.name, x.team, x.pos];

    for (const x of pl.values()) {
      const s = x.s, fpg = div(s.fantasy_points_ppr, x.g);
      // receiving
      if (s.targets > 0 && ['WR', 'TE', 'RB', 'FB'].includes(x.pos)) {
        const g = ngs('receiving', x.id), pr = sumPfr('rec', x.id, ['receiving_drop', 'receiving_broken_tackles']), sn = snapsOf(x.id, 'o');
        // passer rating when targeted, from PFR's per-game rating weighted by that game's targets
        let rw = 0, rt = 0; for (const r of pfr.rec) if (r.id === x.id && inP(r) && r.receiving_rat !== '') { const t = n(weekly.find(w => w.player_id === x.id && +w.week === r.wk)?.targets); rw += n(r.receiving_rat) * t; rt += t; }
        const ts = div(s.targets, tt[x.team]?.tgt), as = div(s.receiving_air_yards, tt[x.team]?.ay);
        out.kinds.receiving.rows.push([...base(x), s.targets, s.receptions, s.receiving_yards, s.receiving_tds, div(100 * s.receptions, s.targets), ts === null ? null : 100 * ts, as === null ? null : 100 * as,
          ts === null || as === null ? null : 1.5 * ts + 0.7 * as, div(s.receiving_yards, s.receiving_air_yards), div(s.receiving_air_yards, s.targets), div(s.receiving_yards_after_catch, s.receptions),
          s.receiving_epa, div(s.receiving_epa, s.targets), div(s.receiving_first_downs, s.targets),
          g ? n(g.avg_separation) : null, g ? n(g.avg_cushion) : null, g ? n(g.avg_yac_above_expectation) : null,
          pr.games ? pr.receiving_drop : null, pr.games ? div(100 * pr.receiving_drop, s.receptions + pr.receiving_drop) : null, pr.games ? pr.receiving_broken_tackles : null, rt ? rw / rt : null,
          sn.team ? 100 * sn.me / sn.team : null, sn.me ? div(s.targets, sn.me) * 100 : null, fpg].map(r3));
      }
      // passing
      if (s.attempts > 0 && x.pos === 'QB') {
        const g = ngs('passing', x.id), pr = sumPfr('pass', x.id, ['passing_bad_throws', 'times_pressured', 'times_blitzed']), db = s.attempts + s.sacks_suffered;
        out.kinds.passing.rows.push([...base(x), s.attempts, db, div(100 * s.completions, s.attempts), s.passing_yards, s.passing_tds, s.passing_interceptions, s.sacks_suffered, div(s.passing_yards, s.attempts),
          s.passing_epa, div(s.passing_epa, db), div(s.passing_epa + s.rushing_epa, db + s.carries),
          g ? n(g.completion_percentage_above_expectation) : null, g ? n(g.avg_time_to_throw) : null, g ? n(g.aggressiveness) : null, g ? n(g.avg_intended_air_yards) : null, g ? n(g.avg_completed_air_yards) : null, g ? n(g.avg_air_yards_to_sticks) : null,
          pr.games ? div(100 * pr.passing_bad_throws, s.attempts) : null, pr.games ? div(100 * pr.times_pressured, db) : null,
          div(100 * s.sacks_suffered, db), div(100 * s.passing_tds, s.attempts), div(100 * s.passing_interceptions, s.attempts), s.rushing_yards, fpg].map(r3));
      }
      // rushing
      if (s.carries > 0 && x.pos !== 'QB') {
        const g = ngs('rushing', x.id), pr = sumPfr('rush', x.id, ['carries', 'rushing_yards_before_contact', 'rushing_yards_after_contact', 'rushing_broken_tackles', 'receiving_broken_tackles']), sn = snapsOf(x.id, 'o');
        const touches = s.carries + s.receptions;
        out.kinds.rushing.rows.push([...base(x), s.carries, s.rushing_yards, div(s.rushing_yards, s.carries), s.rushing_tds, s.rushing_epa, div(s.rushing_epa, s.carries), div(s.rushing_first_downs, s.carries),
          g ? n(g.rush_yards_over_expected_per_att) : null, g ? n(g.rush_yards_over_expected) : null, g ? n(g.efficiency) : null, g ? n(g.percent_attempts_gte_eight_defenders) : null, g ? n(g.avg_time_to_los) : null,
          pr.games ? div(pr.rushing_yards_before_contact, pr.carries) : null, pr.games ? div(pr.rushing_yards_after_contact, pr.carries) : null,
          pr.games ? pr.rushing_broken_tackles + pr.receiving_broken_tackles : null, pr.games ? div(100 * (pr.rushing_broken_tackles + pr.receiving_broken_tackles), touches) : null,
          s.targets, s.receptions, sn.team ? 100 * sn.me / sn.team : null, sn.me ? 100 * touches / sn.me : null, fpg].map(r3));
      }
    }
    // ---- defenders (PFR) ----
    const dk = ['def_targets', 'def_completions_allowed', 'def_yards_allowed', 'def_receiving_td_allowed', 'def_ints', 'def_air_yards_completed', 'def_yards_after_catch', 'def_times_blitzed',
      'def_times_hurried', 'def_times_hitqb', 'def_sacks', 'def_pressures', 'def_tackles_combined', 'def_missed_tackles'];
    const defs = new Map();
    for (const r of pfr.def.filter(r => r.id && inP(r))) {
      const x = defs.get(r.id) || { id: r.id, wk: -1, team: '', s: { adotw: 0 } };
      if (r.wk > x.wk) { x.wk = r.wk; x.team = fixTeam(r.team); }
      for (const k of dk) x.s[k] = (x.s[k] || 0) + n(r[k]);
      x.s.adotw += n(r.def_adot) * n(r.def_targets);
      defs.set(r.id, x);
    }
    for (const x of defs.values()) {
      const s = x.s, who = [...PFR.values()].find(p => p.id === x.id) || {}, sn = snapsOf(x.id, 'd');
      if (!sn.me) continue;
      out.kinds.defense.rows.push([S, P, x.id, who.name || x.id, x.team, who.pos || '', sn.me, sn.team ? 100 * sn.me / sn.team : null, s.def_targets, s.def_completions_allowed,
        div(100 * s.def_completions_allowed, s.def_targets), div(s.def_yards_allowed, s.def_targets),
        rating(s.def_completions_allowed, s.def_targets, s.def_yards_allowed, s.def_receiving_td_allowed, s.def_ints), div(s.adotw, s.def_targets), s.def_yards_after_catch, s.def_receiving_td_allowed, s.def_ints,
        s.def_pressures, s.def_sacks, s.def_times_hurried, s.def_times_hitqb, s.def_times_blitzed, div(100 * s.def_pressures, sn.me), s.def_tackles_combined, s.def_missed_tackles,
        div(100 * s.def_missed_tackles, s.def_tackles_combined + s.def_missed_tackles)].map(r3));
    }
    // ---- teams: offense from their own rows, defense from their opponents' ----
    for (const [team, rows] of Object.entries(teamWeeks)) {
      const mine = rows.filter(inP), opp = Object.values(teamWeeks).flat().filter(r => fixTeam(r.opponent_team) === team && inP(r));
      if (!mine.length) continue;
      const sum = (list, k) => list.reduce((a, r) => a + n(r[k]), 0);
      const agg = list => { const db = sum(list, 'attempts') + sum(list, 'sacks_suffered'), car = sum(list, 'carries');
        return { db, car, pe: sum(list, 'passing_epa'), re: sum(list, 'rushing_epa'), yds: sum(list, 'passing_yards') + sum(list, 'rushing_yards') }; };
      const o = agg(mine), d = agg(opp);
      const gs = games.filter(g => (g.home_team === team || g.away_team === team) && (P === 0 || +g.week === P));
      const pf = gs.reduce((a, g) => a + n(g.home_team === team ? g.home_score : g.away_score), 0), pa = gs.reduce((a, g) => a + n(g.home_team === team ? g.away_score : g.home_score), 0);
      out.kinds.teams.rows.push([S, P, team, team, team, 'TEAM', div(o.pe + o.re, o.db + o.car), div(d.pe + d.re, d.db + d.car), div(o.pe, o.db), div(o.re, o.car), div(d.pe, d.db), div(d.re, d.car),
        div(pf, gs.length), div(pa, gs.length), div(pf - pa, gs.length), div(o.yds, o.db + o.car), div(d.yds, d.db + d.car), div(100 * o.db, o.db + o.car)].map(r3));
    }
  }
}
fs.writeFileSync(path.join(__dirname, 'app', 'chartdata.js'), 'window.NFL_CHARTS = ' + JSON.stringify(out) + ';\n');
const size = fs.statSync(path.join(__dirname, 'app', 'chartdata.js')).size;
console.log(`app/chartdata.js: ${Object.entries(out.kinds).map(([k, v]) => `${k} ${v.rows.length}`).join(', ')} rows, ${Math.round(size / 1024)} KB`);
