// Stats engine for index.html: team profiles, look-alike matching, tags, archetypes, counters.
// Load after data.js; exposes window.GLT.
window.GLT = (function (D) {
  const S = D.stats;
  const K = Object.fromEntries(S.map((s, j) => [s.key, j]));

  // ---------- tag tiers (rank out of 32) ----------
  const TIERS = [
    { max: 3, cls: 'top3', label: 'Top 3', style: 'Top 3' },
    { max: 5, cls: 'great', label: 'Great', style: 'High' },
    { max: 10, cls: 'good', label: 'Good', style: 'High' },
    { max: 22, cls: 'avg', label: 'Average', style: 'Average' },
    { max: 29, cls: 'bad', label: 'Bad', style: 'Low' },
    { max: 32, cls: 'bottom3', label: 'Bottom 3', style: 'Bottom 3' },
  ];
  const TIER_KEY = 'Top 3 = 1st–3rd · Great = 4th–5th · Good = 6th–10th · Average = 11th–22nd · Bad = 23rd–29th · Bottom 3 = 30th–32nd';
  const tierIndex = rank => TIERS.findIndex(t => rank <= t.max);

  // d is the root-mean-square z-score gap across the compared stats: 0 = identical, ~1.4 = two random teams.
  // exp(-d²) puts identical at 100%, a random pairing near 15%, and genuinely close matches at 60%+.
  const similarityPct = d => Math.round(100 * Math.exp(-d * d));

  // ---------- profiles ----------
  // A team is always measured against its cohort: every team in the same season after the same number
  // of games. Ranks drive the tags; z-scores (distance from the cohort mean) drive look-alike matching.
  function cohortStats(cohort) { // cohort: [{key, rec, avg}] -> Map key -> {ranks (scaled to 32), z, wrank}
    const out = new Map(cohort.map(c => [c.key, { ranks: [], z: [] }]));
    const wp = c => { const [w, l, t = 0] = c.rec.split('-').map(Number); return (w + t / 2) / ((w + l + t) || 1); };
    const wps = cohort.map(wp);
    cohort.forEach((c, i) => {
      out.get(c.key).wrank = cohort.length > 1 ? Math.round(1 + wps.filter(x => x > wps[i]).length * 31 / (cohort.length - 1)) : 16;
    });
    S.forEach((s, j) => {
      const vals = cohort.map(c => c.avg[j]).filter(v => v !== null);
      const mean = vals.reduce((a, v) => a + v, 0) / (vals.length || 1);
      const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / (vals.length || 1)) || 1;
      for (const c of cohort) {
        const v = c.avg[j], o = out.get(c.key);
        if (v === null) { o.ranks[j] = null; o.z[j] = null; continue; }
        const r = 1 + vals.filter(x => (s.better === 'high' ? x > v : x < v)).length;
        o.ranks[j] = vals.length > 1 ? Math.round(1 + (r - 1) * 31 / (vals.length - 1)) : 16;
        o.z[j] = (v - mean) / sd;
      }
    });
    return out;
  }
  const cohortCache = new Map();
  function historicalCohort(season, gp) {
    const ck = `${season}|${gp}`;
    if (!cohortCache.has(ck)) {
      cohortCache.set(ck, cohortStats(Object.entries(D.snaps).filter(([k, v]) => k.startsWith(season + '|') && v.s.length >= gp)
        .map(([k, v]) => ({ key: k, rec: v.s[gp - 1][0], avg: v.s[gp - 1][1] }))));
    }
    return cohortCache.get(ck);
  }
  const profCache = new Map();
  function profile(season, team, gp) { // a team's numbers, z-scores and ranks after `gp` games
    const key = `${season}|${team}`, pk = `${key}|${gp}`;
    if (profCache.has(pk)) return profCache.get(pk);
    const snap = D.snaps[key], [rec, avg] = snap.s[gp - 1];
    const p = { season, team, name: snap.name, fin: snap.fin, gp, rec, avg, ...historicalCohort(season, gp).get(key) };
    profCache.set(pk, p);
    return p;
  }
  // Current teams are measured against each other on their latest numbers (bye weeks mean gp can differ by one)
  const current = {};
  {
    const latest = t => { const s = D.snaps[`${D.currentSeason}|${t}`].s; return { gp: s.length, rec: s[s.length - 1][0], avg: s[s.length - 1][1] }; };
    const stats = cohortStats(D.teams.map(t => ({ key: t, rec: latest(t).rec, avg: latest(t).avg })));
    for (const t of D.teams) current[t] = { season: D.currentSeason, team: t, name: t, fin: '', ...latest(t), ...stats.get(t) };
  }

  // ---------- look-alike matching ----------
  function compare(q, h, idx) { // squared z distance between two profiles over the chosen stats
    let sq = 0, n = 0;
    for (const j of idx) {
      if (q.z[j] === null || h.z[j] === null) continue;
      sq += (q.z[j] - h.z[j]) ** 2; n++;
    }
    return { sq, n };
  }
  function score(parts) {
    const n = parts.reduce((a, p) => a + p.n, 0);
    const d = n ? Math.sqrt(parts.reduce((a, p) => a + p.sq, 0) / n) : Infinity;
    return { pct: similarityPct(d), sort: d };
  }
  // Most similar past games to "qa @ qb", from seasons [since, before)
  function findMatches(qa, qb, { idx, since, before, minGp, topN, venueMatters }) {
    const out = [];
    for (const [season, week, home, away, hs, as, , neutral, hgp, agp] of D.games) {
      if (season < since || season >= before || hgp < minGp || agp < minGp) continue;
      const ph = profile(season, home, hgp), pa = profile(season, away, agp);
      // A-like team as the away side matches "A @ B"; the flipped orientation only when venue is ignored
      let best = score([compare(qa, pa, idx), compare(qb, ph, idx)]), aHome = false;
      if (!venueMatters || neutral) {
        const s2 = score([compare(qa, ph, idx), compare(qb, pa, idx)]);
        if (s2.sort < best.sort) { best = s2; aHome = true; }
      }
      const aPts = aHome ? hs : as, bPts = aHome ? as : hs;
      out.push({ ...best, season, week, aHome, aP: aHome ? ph : pa, bP: aHome ? pa : ph, aPts, bPts, margin: aPts - bPts });
    }
    return out.sort((x, y) => x.sort - y.sort).slice(0, topN);
  }
  // Most similar past teams to q at the same number of games played
  function findLookalikes(q, { idx, since, before, limit }) {
    const out = [];
    for (const [key, snap] of Object.entries(D.snaps)) {
      const season = +key.split('|')[0];
      if (season < since || season >= before || snap.s.length < q.gp) continue;
      const h = profile(season, key.split('|')[1], q.gp);
      out.push({ ...score([compare(q, h, idx)]), h });
    }
    return out.sort((x, y) => x.sort - y.sort).slice(0, limit);
  }
  const lineText = (team, line) => `${team} ${line > 0 ? '+' : line < 0 ? '−' : ''}${line === 0 ? 'PK' : Math.abs(line)}`;

  // ---------- archetypes: compound tags built from stat ranks ----------
  const rk = (p, k) => p.ranks[K[k]] ?? NaN; // NaN fails every comparison, so missing data never matches
  const val = (p, k) => p.avg[K[k]];
  const netEff = p => (rk(p, 'pass_epa') + rk(p, 'rush_epa') + rk(p, 'def_pass_epa') + rk(p, 'def_rush_epa')) / 4;
  const ARCHETYPES = [
    // the whole team
    { key: 'juggernaut', icon: '💪', name: 'Juggernaut', desc: 'Top 5 in points scored AND points allowed',
      test: p => rk(p, 'pf') <= 5 && rk(p, 'pa') <= 5 },
    { key: 'complete', icon: '🧩', name: 'Complete team', desc: 'Top 12 in passing, running, pass DEF and run DEF efficiency',
      test: p => ['pass_epa', 'rush_epa', 'def_pass_epa', 'def_rush_epa'].every(k => rk(p, k) <= 12) },
    { key: 'glass', icon: '💥', name: 'Glass cannon', desc: 'Top 8 passing game, bottom 10 pass DEF',
      test: p => rk(p, 'pass_epa') <= 8 && rk(p, 'def_pass_epa') >= 23 },
    { key: 'deffirst', icon: '🛡️', name: 'Defense-first', desc: 'Top 8 pass DEF and top 10 scoring DEF, bottom 13 passing game',
      test: p => rk(p, 'def_pass_epa') <= 8 && rk(p, 'pa') <= 10 && rk(p, 'pass_epa') >= 20 },
    { key: 'papertiger', icon: '🐯', name: 'Paper tiger', desc: 'Top 10 record, below-average efficiency on both sides',
      test: p => p.wrank <= 10 && netEff(p) >= 17 },
    { key: 'unlucky', icon: '🍀', name: 'Better than their record', desc: 'Bottom 13 record, top 13 efficiency on both sides',
      test: p => p.wrank >= 20 && netEff(p) <= 13 },
    { key: 'tank', icon: '🚜', name: 'Tank watch', desc: 'Bottom 4 record and bottom 9 efficiency',
      test: p => p.wrank >= 29 && netEff(p) >= 24 },
    // offense
    { key: 'scoring', icon: '🎯', name: 'Points machine', desc: 'Top 3 in points scored with a top 6 passing game',
      test: p => rk(p, 'pf') <= 3 && rk(p, 'pass_epa') <= 6 },
    { key: 'airraid', icon: '✈️', name: 'Air raid', desc: 'Top 8 passing game with a bottom 10 run game',
      test: p => rk(p, 'pass_epa') <= 8 && rk(p, 'rush_epa') >= 23 },
    { key: 'ground', icon: '🚂', name: 'Ground and pound', desc: 'Top 8 run game with a bottom 13 passing game',
      test: p => rk(p, 'rush_epa') <= 8 && rk(p, 'pass_epa') >= 20 },
    { key: 'bigplay', icon: '🎆', name: 'Big-play machine', desc: 'Top 5 in 20+ yard completions and top 8 in 10+ yard runs',
      test: p => rk(p, 'big_pass') <= 5 && rk(p, 'big_run') <= 8 },
    { key: 'methodical', icon: '🐢', name: 'Methodical', desc: 'Top 6 at moving the chains, bottom 15 in big plays',
      test: p => rk(p, 'fd_off') <= 6 && rk(p, 'big_pass') >= 18 },
    { key: 'boombust', icon: '🎲', name: 'Boom or bust', desc: 'Top 6 big-play passing, bottom 15 at moving the chains',
      test: p => rk(p, 'big_pass') <= 6 && rk(p, 'fd_off') >= 18 },
    { key: 'fortress', icon: '🏰', name: 'Pocket fortress', desc: 'Top 3 at avoiding sacks',
      test: p => rk(p, 'sack_off') <= 3 },
    { key: 'sieve', icon: '🧀', name: 'Sieve O-line', desc: 'Bottom 5 in sack rate allowed',
      test: p => rk(p, 'sack_off') >= 28 },
    // defense
    { key: 'nofly', icon: '🚫', name: 'No-fly zone', desc: 'Top 3 pass DEF and top 8 in pass yards allowed',
      test: p => rk(p, 'def_pass_epa') <= 3 && rk(p, 'pass_alw') <= 8 },
    { key: 'brickwall', icon: '🧱', name: 'Brick wall', desc: 'Top 3 run DEF and top 8 in rush yards allowed',
      test: p => rk(p, 'def_rush_epa') <= 3 && rk(p, 'rush_alw') <= 8 },
    { key: 'benddont', icon: '🪢', name: "Bend don't break", desc: 'Bottom 13 in first downs allowed, but top 10 in points allowed',
      test: p => rk(p, 'fd_def') >= 20 && rk(p, 'pa') <= 10 },
    { key: 'sackmachine', icon: '💨', name: 'Sack machine', desc: 'Top 5 sack rate on defense',
      test: p => rk(p, 'sack_def') <= 5 },
    { key: 'blitz', icon: '⚡', name: 'Blitz-happy', desc: 'Top 3 blitz rate (PFR)',
      test: p => rk(p, 'blitz') <= 3 },
    { key: 'leaky', icon: '🚰', name: 'Leaky defense', desc: 'Bottom 5 in big plays allowed and bottom 8 in points allowed',
      test: p => rk(p, 'big_alw') >= 28 && rk(p, 'pa') >= 25 },
    // ball security and details
    { key: 'ballhawks', icon: '🦅', name: 'Ball hawks', desc: 'Top 3 turnover margin',
      test: p => rk(p, 'to_diff') <= 3 },
    { key: 'giveaway', icon: '🎁', name: 'Turnover-prone', desc: 'Bottom 3 turnover margin',
      test: p => rk(p, 'to_diff') >= 30 },
    { key: 'tofueled', icon: '🎰', name: 'Turnover-fueled', desc: 'Top 5 turnover margin with below-average efficiency',
      test: p => rk(p, 'to_diff') <= 5 && netEff(p) >= 15 },
    { key: 'clean', icon: '🧼', name: 'Squeaky clean', desc: 'Top 3 fewest penalty yards',
      test: p => rk(p, 'pen_yds') <= 3 },
    { key: 'undisciplined', icon: '🚩', name: 'Flag magnets', desc: 'Bottom 5 in penalty yards',
      test: p => rk(p, 'pen_yds') >= 28 },
    // scoring style
    { key: 'shootout', icon: '🎢', name: 'Shootout team', desc: 'Top 8 in points scored, bottom 8 in points allowed',
      test: p => rk(p, 'pf') <= 8 && rk(p, 'pa') >= 25 },
    { key: 'rockfight', icon: '🪨', name: 'Rock fight', desc: 'Bottom 10 in points scored, top 10 in points allowed',
      test: p => rk(p, 'pf') >= 23 && rk(p, 'pa') <= 10 },
    { key: 'lockdown', icon: '🔒', name: 'Lockdown D', desc: 'Top 3 in points allowed',
      test: p => rk(p, 'pa') <= 3 },
    { key: 'ditch', icon: '🕳️', name: 'Offense in a ditch', desc: 'Bottom 3 in points scored',
      test: p => rk(p, 'pf') >= 30 },
    { key: 'balanced', icon: '⚖️', name: 'Balanced attack', desc: 'Top 10 in both passing and running efficiency',
      test: p => rk(p, 'pass_epa') <= 10 && rk(p, 'rush_epa') <= 10 },
    // passing
    { key: 'surgical', icon: '🩺', name: 'Surgical passing', desc: 'Top 3 QB accuracy (CPOE) with a top 8 passing game',
      test: p => rk(p, 'cpoe') <= 3 && rk(p, 'pass_epa') <= 8 },
    { key: 'erratic', icon: '🌀', name: 'Erratic passing', desc: 'Bottom 3 QB accuracy (CPOE)',
      test: p => rk(p, 'cpoe') >= 30 },
    { key: 'deep', icon: '🏹', name: 'Deep threat', desc: 'Top 3 in 20+ yard completions per dropback',
      test: p => rk(p, 'big_pass') <= 3 },
    { key: 'stalling', icon: '🐌', name: 'Stalling offense', desc: 'Bottom 3 at moving the chains',
      test: p => rk(p, 'fd_off') >= 30 },
    // running
    { key: 'homerun', icon: '🏃', name: 'Home-run hitters', desc: 'Top 3 in 10+ yard runs per carry',
      test: p => rk(p, 'big_run') <= 3 },
    // defense
    { key: 'terror', icon: '🌪️', name: 'Pass-rush terror', desc: 'Top 3 pressure rate and top 8 sack rate',
      test: p => rk(p, 'pressure') <= 3 && rk(p, 'sack_def') <= 8 },
    { key: 'burnable', icon: '🔥', name: 'Burnable secondary', desc: 'Bottom 3 pass DEF',
      test: p => rk(p, 'def_pass_epa') >= 30 },
    { key: 'runthrough', icon: '🚪', name: 'Run-through D', desc: 'Bottom 3 run DEF',
      test: p => rk(p, 'def_rush_epa') >= 30 },
    { key: 'chainsallowed', icon: '🔗', name: 'Can’t get off the field', desc: 'Bottom 3 in first downs allowed',
      test: p => rk(p, 'fd_def') >= 30 },
    // winning profiles: good across the board rather than extreme at one thing
    { key: 'contender', icon: '🏅', name: 'Contender', desc: 'Top 6 record with top 10 efficiency on both sides of the ball',
      test: p => p.wrank <= 6 && netEff(p) <= 10 },
    { key: 'frontrunner', icon: '🥇', name: 'Front-runner', desc: 'Top 3 record in the league',
      test: p => p.wrank <= 3 },
    { key: 'twoway', icon: '🤝', name: 'Two-way team', desc: 'Top 10 in both points scored and points allowed',
      test: p => rk(p, 'pf') <= 10 && rk(p, 'pa') <= 10 },
    { key: 'trench', icon: '🦾', name: 'Trench bullies', desc: 'Top 8 run game and top 8 in rush yards allowed',
      test: p => rk(p, 'rush_epa') <= 8 && rk(p, 'rush_alw') <= 8 },
    { key: 'disciplinedwin', icon: '🫡', name: 'Disciplined winner', desc: 'Top 8 record and top 8 fewest penalty yards',
      test: p => p.wrank <= 8 && rk(p, 'pen_yds') <= 8 },
    { key: 'explosive', icon: '🚀', name: 'Explosive offense', desc: 'Top 8 in points scored plus top 6 in deep passing or long runs',
      test: p => rk(p, 'pf') <= 8 && (rk(p, 'big_pass') <= 6 || rk(p, 'big_run') <= 6) },
    { key: 'drivemachine', icon: '⛓️', name: 'Drive machine', desc: 'Top 8 at moving the chains and top 8 in points scored',
      test: p => rk(p, 'fd_off') <= 8 && rk(p, 'pf') <= 8 },
    { key: 'cleanpocket', icon: '🧘', name: 'Clean-pocket passing', desc: 'Top 8 passing game and top 8 at avoiding sacks',
      test: p => rk(p, 'pass_epa') <= 8 && rk(p, 'sack_off') <= 8 },
    { key: 'disruptive', icon: '🌩️', name: 'Disruptive D', desc: 'Top 8 pressure rate and top 8 turnover margin',
      test: p => rk(p, 'pressure') <= 8 && rk(p, 'to_diff') <= 8 },
    { key: 'offthefield', icon: '🚦', name: 'Get-off-the-field D', desc: 'Top 5 in first downs allowed and top 8 in points allowed',
      test: p => rk(p, 'fd_def') <= 5 && rk(p, 'pa') <= 8 },
    { key: 'mistakefree', icon: '🧠', name: 'Mistake-free', desc: 'Top 5 turnover margin and top 10 at avoiding sacks',
      test: p => rk(p, 'to_diff') <= 5 && rk(p, 'sack_off') <= 10 },
    { key: 'automatic', icon: '🦵', name: 'Automatic kicker', desc: 'Field goals made at 95%+ and top 3 in FG %',
      test: p => rk(p, 'fg_pct') <= 3 && val(p, 'fg_pct') >= 0.95 },
    { key: 'shanky', icon: '😬', name: 'Shaky kicker', desc: 'Field goals made under 75% (bottom 3)',
      test: p => rk(p, 'fg_pct') >= 30 && val(p, 'fg_pct') < 0.75 },
  ];
  // Groups for the archetype map
  const ARCH_GROUPS = {
    'Whole team': ['contender', 'frontrunner', 'twoway', 'trench', 'disciplinedwin', 'juggernaut', 'complete', 'glass', 'deffirst', 'papertiger', 'unlucky', 'tank', 'shootout', 'rockfight'],
    Offense: ['scoring', 'explosive', 'drivemachine', 'cleanpocket', 'balanced', 'airraid', 'ground', 'bigplay', 'deep', 'homerun', 'surgical', 'methodical', 'boombust',
      'erratic', 'stalling', 'ditch', 'fortress', 'sieve'],
    Defense: ['lockdown', 'offthefield', 'disruptive', 'nofly', 'brickwall', 'terror', 'sackmachine', 'blitz', 'benddont', 'leaky', 'burnable', 'runthrough', 'chainsallowed'],
    'Ball security & details': ['mistakefree', 'ballhawks', 'giveaway', 'tofueled', 'clean', 'undisciplined', 'automatic', 'shanky'],
  };
  for (const [group, keys] of Object.entries(ARCH_GROUPS)) for (const k of keys) { const a = ARCHETYPES.find(x => x.key === k); if (a) a.group = group; }
  for (const a of ARCHETYPES) a.group ||= 'Other'; // any new archetype not yet placed in a group
  const ARCH_FIRST = 2006, ARCH_MIN_GP = 4;
  const archetypesOf = p => (p.gp >= ARCH_MIN_GP ? ARCHETYPES.filter(a => a.test(p)) : []);

  // How past teams that fit an archetype at the same point in their season finished (computed per games-played)
  const outcomeCache = new Map();
  // before: only seasons earlier than this count (the Super Bowl odds backtest uses it to avoid peeking ahead)
  function archetypeOutcomes(gp, before = D.currentSeason) { // key -> {n, playoffs, app, sb, wins, examples}
    const ck = gp + '|' + before;
    if (outcomeCache.has(ck)) return outcomeCache.get(ck);
    const out = Object.fromEntries(ARCHETYPES.map(a => [a.key, { n: 0, playoffs: 0, app: 0, sb: 0, wins: 0, list: [] }]));
    for (const [key, snap] of Object.entries(D.snaps)) {
      const season = +key.split('|')[0];
      if (season < ARCH_FIRST || season >= before || snap.s.length < Math.max(gp, ARCH_MIN_GP) || !snap.fin) continue;
      const p = profile(season, key.split('|')[1], Math.max(gp, ARCH_MIN_GP));
      const wins = +snap.fin.split('-')[0], made = !/Missed/.test(snap.fin), sb = /Won SB/.test(snap.fin), app = /SB/.test(snap.fin);
      for (const a of archetypesOf(p)) {
        const o = out[a.key];
        o.n++; o.wins += wins; if (made) o.playoffs++; if (app) o.app++; if (sb) o.sb++;
        o.list.push({ label: `${season} ${snap.name}`, sb, wins });
      }
    }
    for (const o of Object.values(out)) { // most famous examples first: champions, then most wins
      o.examples = o.list.sort((x, y) => y.sb - x.sb || y.wins - x.wins).slice(0, 3).map(x => x.label + (x.sb ? ' 🏆' : ''));
      delete o.list;
    }
    outcomeCache.set(ck, out);
    return out;
  }

  // ---------- counters: one team's unit strength meets the opponent's unit weakness ----------
  const COUNTERS = [
    { key: 'passmis', name: 'Pass O vs weak pass D', desc: (x, y) => `${x}'s top 8 passing game vs ${y}'s bottom 8 pass DEF`,
      test: (x, y) => rk(x, 'pass_epa') <= 8 && rk(y, 'def_pass_epa') >= 25 },
    { key: 'runmis', name: 'Run O vs weak run D', desc: (x, y) => `${x}'s top 8 run game vs ${y}'s bottom 8 run DEF`,
      test: (x, y) => rk(x, 'rush_epa') <= 8 && rk(y, 'def_rush_epa') >= 25 },
    { key: 'chains', name: 'Chain movers vs soft D', desc: (x, y) => `${x}'s top 8 first-down rate vs ${y}'s bottom 8 first-down DEF`,
      test: (x, y) => rk(x, 'fd_off') <= 8 && rk(y, 'fd_def') >= 25 },
    { key: 'bigplay', name: 'Big plays vs leaky D', desc: (x, y) => `${x}'s top 8 big-play passing vs ${y}'s bottom 8 big-play DEF`,
      test: (x, y) => rk(x, 'big_pass') <= 8 && rk(y, 'big_alw') >= 25 },
    { key: 'sackmis', name: 'Pass rush vs sieve O-line', desc: (x, y) => `${x}'s top 8 sack rate vs ${y}'s bottom 8 sack rate allowed`,
      test: (x, y) => rk(x, 'sack_def') <= 8 && rk(y, 'sack_off') >= 25 },
    { key: 'pressmis', name: 'Pressure vs leaky protection', desc: (x, y) => `${x}'s top 8 pressure rate vs ${y}'s bottom 8 pressure allowed`,
      test: (x, y) => rk(x, 'pressure') <= 8 && rk(y, 'pressure_alw') >= 25 },
    { key: 'blitzmis', name: 'Blitz vs leaky protection', desc: (x, y) => `${x}'s top 8 blitz rate vs ${y}'s bottom 8 pressure allowed`,
      test: (x, y) => rk(x, 'blitz') <= 8 && rk(y, 'pressure_alw') >= 25 },
    { key: 'passwall', name: 'Elite pass D vs elite pass O', desc: (x, y) => `${x}'s top 5 pass DEF vs ${y}'s top 5 passing game`,
      test: (x, y) => rk(x, 'def_pass_epa') <= 5 && rk(y, 'pass_epa') <= 5 },
    { key: 'runwall', name: 'Elite run D vs elite run O', desc: (x, y) => `${x}'s top 5 run DEF vs ${y}'s top 5 run game`,
      test: (x, y) => rk(x, 'def_rush_epa') <= 5 && rk(y, 'rush_epa') <= 5 },
    { key: 'toedge', name: 'Turnover edge', desc: (x, y) => `${x}'s top 6 turnover margin vs ${y}'s bottom 6`,
      test: (x, y) => rk(x, 'to_diff') <= 6 && rk(y, 'to_diff') >= 27 },
    { key: 'discipline', name: 'Disciplined vs undisciplined', desc: (x, y) => `${x}'s top 6 discipline vs ${y}'s bottom 6`,
      test: (x, y) => rk(x, 'pen_yds') <= 6 && rk(y, 'pen_yds') >= 27 },
  ];
  const countersOf = (x, y) => (x.gp >= ARCH_MIN_GP && y.gp >= ARCH_MIN_GP ? COUNTERS.filter(c => c.test(x, y)) : []);
  let counterRec = null;
  function counterRecords() { // key -> {w, l, avgMargin}: how the team holding the edge did in that game, since 2006
    if (counterRec) return counterRec;
    counterRec = Object.fromEntries(COUNTERS.map(c => [c.key, { w: 0, l: 0, marginSum: 0, n: 0 }]));
    for (const [season, , home, away, hs, as, , , hgp, agp] of D.games) {
      if (season < ARCH_FIRST || season >= D.currentSeason || hgp < ARCH_MIN_GP || agp < ARCH_MIN_GP) continue;
      const ph = profile(season, home, hgp), pa = profile(season, away, agp);
      for (const [x, y, margin] of [[ph, pa, hs - as], [pa, ph, as - hs]]) {
        for (const c of countersOf(x, y)) {
          const r = counterRec[c.key];
          if (margin > 0) r.w++; else if (margin < 0) r.l++;
          r.marginSum += margin; r.n++;
        }
      }
    }
    for (const r of Object.values(counterRec)) r.avgMargin = r.n ? r.marginSum / r.n : 0;
    return counterRec;
  }

  // ---------- strength of schedule: opponents already played and still to play ----------
  // Both use opponents' CURRENT records. A team faced twice counts twice. Rank 1 = hardest of 32.
  const SOS_LABELS = [[4, 'Brutal'], [10, 'Tough'], [22, 'Average'], [28, 'Soft'], [32, 'Cupcake']];
  const sosLabel = rank => SOS_LABELS.find(([max]) => rank <= max)[1];
  let sosCache = null;
  function scheduleStrength() { // team -> {played, beat, ahead}: each {w, l, t, pct, rank, opps}
    if (sosCache) return sosCache;
    const blank = () => ({ w: 0, l: 0, t: 0, opps: [] });
    const out = Object.fromEntries(D.teams.map(t => [t, { played: blank(), beat: blank(), ahead: blank() }]));
    const addOpp = (side, team, opp) => {
      const s = out[team]?.[side], r = current[opp]?.rec; if (!s || !r) return;
      const [w, l, t = 0] = r.split('-').map(Number);
      s.w += w; s.l += l; s.t += t; s.opps.push(opp);
    };
    for (const [season, week, , home, away, hs, as] of D.results) {
      if (season !== D.currentSeason || typeof week !== 'number') continue;
      addOpp('played', home, away); addOpp('played', away, home);
      // "beat": the combined record of the teams a team has beaten (quality of wins)
      if (hs > as) addOpp('beat', home, away); else if (as > hs) addOpp('beat', away, home);
    }
    for (const [, home, away] of D.remaining || []) { addOpp('ahead', home, away); addOpp('ahead', away, home); }
    for (const side of ['played', 'beat', 'ahead']) {
      const all = Object.values(out).map(x => x[side]);
      for (const s of all) s.pct = s.w + s.l + s.t ? (s.w + s.t / 2) / (s.w + s.l + s.t) : 0;
      for (const s of all) s.rank = 1 + all.filter(o => o.pct > s.pct).length;
    }
    return (sosCache = out);
  }
  const fmtRecord = s => `${s.w}–${s.l}${s.t ? '–' + s.t : ''}`;
  const fmtPct = p => p.toFixed(3).replace(/^0/, '');
  const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

  // ---------- context tags: QB, coach, streaks, history (from the schedule data, 1999 on) ----------
  function contextTags(team) {
    const c = D.context?.[team]; if (!c) return [];
    const out = [], yrs = a => a.join(', ');
    const last = D.currentSeason - 1;
    if (c.teamSb.includes(last)) out.push({ icon: '👑', label: 'Defending champs', tip: `Won the Super Bowl last season (${last}).`, cls: 'gold' });
    if (c.qbSb.length) out.push({ icon: '🏆', label: `SB-winning QB`, tip: `${c.qb} has won the Super Bowl as a starter: ${yrs(c.qbSb)}.`, cls: 'gold' });
    if (c.coachSb.length) out.push({ icon: '🏆', label: `SB-winning coach`, tip: `${c.coach} has won the Super Bowl: ${yrs(c.coachSb)}.`, cls: 'gold' });
    if (c.qbFirst === D.currentSeason) out.push({ icon: '🆕', label: 'Rookie QB', tip: `${c.qb}'s first season as a starter.`, cls: 'info' });
    else if (c.qbStarts >= 150) out.push({ icon: '🎖️', label: 'Veteran QB', tip: `${c.qb} has ${c.qbStarts} starts (counting from 1999).`, cls: 'info' });
    if (c.qbs.length > 1) out.push({ icon: '🔄', label: `${c.qbs.length} QBs this year`, tip: `Starters this season: ${c.qbs.join(', ')}.`, cls: 'warn' });
    if (c.coachFirst === D.currentSeason) out.push({ icon: '🧢', label: 'First-year coach', tip: `${c.coach}'s first season with ${team}.`, cls: 'info' });
    if (c.streak >= 3) out.push({ icon: '🔥', label: `Won ${c.streak} straight`, tip: `${team} has won its last ${c.streak} games.`, cls: 'hot' });
    if (c.streak <= -3) out.push({ icon: '🧊', label: `Lost ${-c.streak} straight`, tip: `${team} has lost its last ${-c.streak} games.`, cls: 'cold' });
    const rec = current[team]?.rec;
    if (rec && /^\d+-0$/.test(rec) && +rec.split('-')[0] >= 3) out.push({ icon: '💯', label: 'Undefeated', tip: `${team} is ${rec}.`, cls: 'hot' });
    if (rec && /^0-\d+$/.test(rec) && +rec.split('-')[1] >= 3) out.push({ icon: '🫥', label: 'Winless', tip: `${team} is ${rec}.`, cls: 'cold' });
    if (c.prevFin) out.push({ icon: '📅', label: `Last year: ${c.prevFin.replace(' · ', ', ')}`, tip: `${team}'s ${last} season.`, cls: 'plain' });
    return out;
  }

  // ---------- Super Bowl odds: stat look-alikes + record + archetypes + counters ----------
  // For each team: how did similar past teams finish? Blended, nudged by counter edges, then scaled so the league
  // adds up (14 playoff teams, 2 Super Bowl teams, 1 champion). A fun estimate, not a betting line.
  const OUTCOMES = ['po', 'app', 'sb']; // made playoffs, reached the Super Bowl, won it
  const finOf = fin => ({ po: !/Missed/.test(fin), app: /SB/.test(fin), sb: /Won SB/.test(fin) });
  const BASE = { po: 12.5 / 32, app: 2 / 32, sb: 1 / 32 }; // league base rates (12 playoff teams before 2020, 14 since)
  const PRIOR = 8; // pseudo-teams at the base rate, so tiny samples don't swing to 0% or 100%
  const shrink = (hits, n, k) => (hits + PRIOR * BASE[k]) / (n + PRIOR);
  // Blend of the three components. Tested on 2008–25 champions (each season using only earlier seasons): record alone
  // was the best single predictor, so it gets the biggest share; look-alikes and archetypes add flavor.
  const WEIGHTS = { looks: 0.3, record: 0.5, arch: 0.2 };
  const COUNTER_SCALE = 0.8, COUNTER_CAP = 0.15; // counter edges move a team's odds by at most ±15%
  const SB_GAME_TILT = 0.5; // how much point margin tilts the Super Bowl game itself (0 = pure coin flip)

  // 1) Stat look-alikes: the 40 closest past teams after the same games, weighted by similarity²
  function lookalikeRates(p, idx, before) {
    const list = findLookalikes(p, { idx, since: +Object.keys(D.norms)[0], before, limit: 40 }).filter(x => x.h.fin && !/In progress/.test(x.h.fin));
    const acc = { w: 0, po: 0, app: 0, sb: 0 };
    for (const x of list) {
      const w = (x.pct / 100) ** 2, f = finOf(x.h.fin);
      acc.w += w; for (const k of OUTCOMES) acc[k] += w * f[k];
    }
    const champ = list.find(x => /Won SB/.test(x.h.fin));
    return { ...Object.fromEntries(OUTCOMES.map(k => [k, (acc[k] + PRIOR * BASE[k] * 0.25) / (acc.w + PRIOR * 0.25)])), n: list.length, champ };
  }
  // 2) Record: every past team with the same record after the same number of games
  const recordCache = new Map();
  function recordRates(rec, gp, before) {
    const ck = `${gp}|${before}`;
    if (!recordCache.has(ck)) {
      const m = new Map();
      for (const [key, snap] of Object.entries(D.snaps)) {
        const season = +key.split('|')[0];
        if (season >= before || snap.s.length < gp || !snap.fin || /In progress/.test(snap.fin)) continue;
        const r = snap.s[gp - 1][0], t = m.get(r) || { n: 0, po: 0, app: 0, sb: 0 }, f = finOf(snap.fin);
        t.n++; for (const k of OUTCOMES) t[k] += f[k];
        m.set(r, t);
      }
      recordCache.set(ck, m);
    }
    const t = recordCache.get(ck).get(rec) || { n: 0, po: 0, app: 0, sb: 0 };
    return { ...Object.fromEntries(OUTCOMES.map(k => [k, shrink(t[k], t.n, k)])), n: t.n };
  }
  // 3) Archetypes: average of how teams wearing each of this team's archetypes finished
  function archetypeRates(p, before) {
    const mine = archetypesOf(p); if (!mine.length) return { ...BASE, n: 0 };
    const out = archetypeOutcomes(Math.max(p.gp, ARCH_MIN_GP), before), r = { po: 0, app: 0, sb: 0 };
    for (const a of mine) {
      const o = out[a.key];
      r.po += shrink(o.playoffs, o.n, 'po'); r.app += shrink(o.app, o.n, 'app'); r.sb += shrink(o.sb, o.n, 'sb');
    }
    return { po: r.po / mine.length, app: r.app / mine.length, sb: r.sb / mine.length, n: mine.length };
  }
  // 4) Counters: net unit-vs-unit edges against the rest of the league, weighted by how often each edge wins
  function counterNet(p, all) {
    const rec = counterRecords(), edge = c => { const r = rec[c.key]; return r.w + r.l ? r.w / (r.w + r.l) - 0.5 : 0; };
    let net = 0;
    for (const q of all) {
      if (q === p) continue;
      for (const c of countersOf(p, q)) net += edge(c);
      for (const c of countersOf(q, p)) net -= edge(c);
    }
    return net / Math.max(1, all.length - 1);
  }
  // Scale a list of probabilities to a target total, keeping each one under a cap
  function scaleTo(vals, total, cap) {
    let v = vals.slice();
    for (let i = 0; i < 20; i++) {
      const free = v.map((x, j) => (x >= cap ? 0 : x)), fixed = v.filter(x => x >= cap).length * cap;
      const sum = free.reduce((a, b) => a + b, 0); if (!sum) break;
      const f = (total - fixed) / sum;
      v = v.map(x => (x >= cap ? cap : Math.min(cap, x * f)));
      if (Math.abs(v.reduce((a, b) => a + b, 0) - total) < 1e-6) break;
    }
    return v;
  }
  // teams: [{team, p}] (every team in one season at its current point); returns odds per team, best first
  function titleOdds(teams, { idx, before = D.currentSeason } = {}) {
    const all = teams.map(t => t.p);
    const rows = teams.map(({ team, p }) => {
      const looks = lookalikeRates(p, idx, before), record = recordRates(p.rec, p.gp, before), arch = archetypeRates(p, before);
      const net = counterNet(p, all), mult = 1 + Math.max(-COUNTER_CAP, Math.min(COUNTER_CAP, net * COUNTER_SCALE));
      const raw = Object.fromEntries(OUTCOMES.map(k => [k, (WEIGHTS.looks * looks[k] + WEIGHTS.record * record[k] + WEIGHTS.arch * arch[k]) * mult]));
      return { team, p, looks, record, arch, net, mult, raw };
    });
    const totals = { po: teams.length >= 32 ? 14 : teams.length * 14 / 32, app: 2, sb: 1 };
    for (const k of ['po', 'app']) {
      const scaled = scaleTo(rows.map(r => r.raw[k]), totals[k], k === 'po' ? 0.99 : 0.9);
      rows.forEach((r, i) => { r[k] = scaled[i]; });
    }
    // Winning it all = reaching the Super Bowl x winning that one game, so the title odds stay consistent with
    // the reach odds. The game is close to a coin flip, tilted by point margin (points scored vs allowed,
    // against the league) compared with the other conference's likely representative.
    const strength = r => (r.p.z[K.pf] ?? 0) - (r.p.z[K.pa] ?? 0); // pa: higher z = allows more, so subtract
    const confOf = r => D.teamInfo?.[r.team]?.conf;
    for (const r of rows) {
      const others = rows.filter(o => confOf(o) && confOf(o) !== confOf(r));
      const w = others.reduce((t, o) => t + o.app, 0) || 1;
      r.sbOpp = others.reduce((t, o) => t + o.app * strength(o), 0) / w; // the likely opponent's strength
      r.strength = strength(r);
      r.sbGame = 1 / (1 + Math.exp(-SB_GAME_TILT * (r.strength - r.sbOpp))); // chance to win the game itself
      r.raw.sb = r.app * r.sbGame;
    }
    const sbScaled = scaleTo(rows.map(r => r.raw.sb), totals.sb, 0.75);
    rows.forEach((r, i) => { r.sb = Math.min(sbScaled[i], r.app); r.po = Math.max(r.po, r.app); }); // win ≤ reach ≤ playoffs
    return rows.sort((a, b) => b.sb - a.sb);
  }

  return { titleOdds, WEIGHTS, SB_GAME_TILT, S, K, TIERS, TIER_KEY, tierIndex, similarityPct, profile, current, compare, score, findMatches, findLookalikes, lineText,
    firstSeason: +Object.keys(D.norms)[0], ARCHETYPES, ARCH_GROUPS, archetypesOf, archetypeOutcomes, ARCH_FIRST,
    COUNTERS, countersOf, counterRecords, contextTags, scheduleStrength, sosLabel, fmtRecord, fmtPct, ordinal };
})(window.NFL_DATA);
