// 🃏 Ultimate Team, shared by the page (window.VM_UT) and the server (require): cards, rarities, packs, lineup ratings,
// game plans (tactics) and the game sim. The server opens the packs and plays the games (seeded, so a saved game replays
// exactly), the page only shows them.
// A card is one player-season from the 17-0 pool (app/perfect.js), saved on the profile as a snapshot:
//   { u: unique id, k: 'playerId|season', g: group (QB, RB, WR, TE, OL, DL, LB, DB, HC, ST), n: name, s: season, t: team, gr: grade, l: stat line, x?: extras }
// Staff cards: 🧢 HC is a head coach's season (a better coach adds a little to both units and makes your game plan's
// edges bigger and its weak spots smaller); 🏟️ ST is a stadium (more home-field edge when you host, plus its weather).
(function (root) {
  // ---------- lineup: the same eleven spots as 17-0, plus a coach and a stadium ----------
  const SLOTS = [['QB', 'QB'], ['RB', 'RB'], ['WR1', 'WR'], ['WR2', 'WR'], ['TE', 'TE'], ['OL', 'OL'],
    ['DL1', 'DL'], ['DL2', 'DL'], ['LB', 'LB'], ['DB1', 'DB'], ['DB2', 'DB'], ['HC', 'HC'], ['ST', 'ST']];
  const STAFF = ['HC', 'ST'];
  const REQUIRED = SLOTS.filter(([s]) => !STAFF.includes(s)); // the eleven players; staff spots are optional
  const GROUPS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'HC', 'ST'];
  const NAMES = { QB: 'Quarterback', RB: 'Running back', WR: 'Wide receiver', TE: 'Tight end', OL: 'Offensive line', DL: 'Pass rusher', LB: 'Linebacker', DB: 'Defensive back', HC: 'Head coach', ST: 'Stadium' };
  // 17-0's weights: each group's spots in order of importance (the better card at a position gets the bigger share)
  const OFF_W = { QB: [0.36], OL: [0.22], WR: [0.14, 0.10], RB: [0.10], TE: [0.08] };
  const DEF_W = { DL: [0.28, 0.22], LB: [0.18], DB: [0.18, 0.14] };
  const BACKUP = 25;     // an empty player spot plays like a backup
  const NO_COACH = 40;   // no coach card: an interim coach
  const HFA = 1.5, SD = 9.5; // home field without a stadium card; one team's game-to-game swing in points

  // ---------- rarity (by grade) and packs ----------
  const RARITY = [
    { key: 'common', name: 'Common', min: 0, color: '#9aa3b0', sell: 2 },
    { key: 'rare', name: 'Rare', min: 60, color: '#3b82f6', sell: 6 },
    { key: 'epic', name: 'Epic', min: 80, color: '#a855f7', sell: 20 },
    { key: 'legendary', name: 'Legendary', min: 90, color: '#eab308', sell: 60 },
    { key: 'mythic', name: 'Mythic', min: 99, color: '#f43f5e', sell: 250 }, // the 99s: the chase
  ];
  const rarityOf = grade => [...RARITY].reverse().find(r => grade >= r.min);
  const PACKS = {
    starter: { name: 'Starter pack', price: 0, cards: 13, icon: '🎁', desc: 'Free, once: one card for every spot (coach and stadium too), so you can play right away.' },
    staff: { name: 'Staff pack', price: 0, cards: 2, icon: '🧢', desc: 'Free, once: a head coach and a stadium for your team.' },
    standard: { name: 'Standard pack', price: 100, cards: 5, icon: '📦', odds: { common: 0.55, rare: 0.30, epic: 0.12, legendary: 0.0295, mythic: 0.0005 }, desc: '5 cards.' },
    premium: { name: 'Premium pack', price: 300, cards: 5, icon: '💎', odds: { common: 0.25, rare: 0.40, epic: 0.27, legendary: 0.0785, mythic: 0.0015 }, guarantee: 'epic', desc: '5 cards, at least one Epic or better.' },
    legend: { name: 'Legend pack', price: 1000, cards: 3, icon: '👑', odds: { common: 0, rare: 0.40, epic: 0.40, legendary: 0.197, mythic: 0.003 }, guarantee: 'legendary', desc: '3 cards, at least one Legendary.' },
  };
  const DAILY = 300;                  // free points a day (3 Standard packs)
  const REWARD = { win: 50, loss: 15 }; // points for playing a game
  // 🎁 every game against another player also hands both sides a card (a win gets better odds)
  const GAME_CARD = {
    win: { common: 0.62, rare: 0.28, epic: 0.085, legendary: 0.014, mythic: 0.001 },
    loss: { common: 0.72, rare: 0.23, epic: 0.045, legendary: 0.0045, mythic: 0.0005 },
  };
  // 🏆 collections: a legendary team's 8 cards, from its team pack (or any pack). Turn them in once (the cards are used
  // up) for points and a Mythic 99 edition of the team's star that you can't get anywhere else.
  const TEAM_PACK = { price: 150, cards: 3, icon: '🏆' };
  const COLLECTION_PTS = 2000;

  // the 17-0 pool by group and rarity (kickers aren't in the lineup), plus the staff cards (coaches and stadiums) and the
  // Ultimate Team-only player cards ("extra": collection rosters, 2003–08 receivers)
  // player stats use today's team codes: show the team as it was that season (the 1999 Rams were STL, not LA)
  const ERA = { LA: [2016, 'STL'], LAC: [2017, 'SD'], LV: [2020, 'OAK'] };
  const teamThen = (t, s) => (ERA[t] && +s < ERA[t][0] ? ERA[t][1] : t);
  const cardOf = (P, g, row) => {
    const x = Object.fromEntries(P.cols.map((c, i) => [c, row[i]])), t = g === 'ST' ? x.team : teamThen(x.team, x.season), h = P.heads?.[x.id];
    return { k: `${x.id}|${x.season}`, g, n: g === 'OL' ? `${t} O-line` : x.name, s: x.season, t, gr: x.grade, l: x.line, ...(x.x ? { x: x.x } : {}), ...(h ? { h } : {}) };
  };
  // 📸 a card's pictures, best first: the ESPN headshot, the NFL.com one (cropped to the face), then the team logo for
  // coaches, stadiums, O-lines and players with neither (h = "espnId|nfl", see build_perfect.js; logos: today's team
  // code → logo, from the server). The page moves to the next one if a picture doesn't load.
  const TODAY = { STL: 'LA', SD: 'LAC', OAK: 'LV' };
  function photos(c, logos = {}) {
    const [espn, nfl] = String(c.h || '').includes('|') ? c.h.split('|') : ['', c.h || ''], out = [];
    if (espn) out.push(`https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${espn}.png&w=160&h=116&scale=crop&cquality=70`);
    if (nfl) out.push(`https://static.www.nfl.com/image/${nfl[0] === 'p' ? 'private' : 'upload'}/f_auto,q_auto,w_144,h_144,c_thumb,g_face/league/${nfl.slice(2)}`);
    const logo = logos[TODAY[c.t] || c.t]; if (logo) out.push(logo);
    return out;
  }
  function makePools(P) {
    const pools = {};
    for (const g of GROUPS) {
      pools[g] = Object.fromEntries(RARITY.map(r => [r.key, []]));
      for (const src of [P.groups, P.staff, P.extra]) for (const row of src?.[g] || []) { const c = cardOf(P, g, row); pools[g][rarityOf(c.gr).key].push(c); }
    }
    return pools;
  }
  // collections with their cards: [{ id, name, story, team, season, cards: [card], star: card, edition: card }]
  // A set never asks for a Mythic: a 99 in it (2022 Mahomes, 1999 Warner…) is needed as its Legendary set version
  // (graded SET_CAP, from the team pack); the real 99 counts too if you have it.
  const SET_CAP = 95;
  const baseKey = k => k.replace(/\|set$/, ''); // a set version and the card it's made from count as the same card
  function makeCollections(P, pools) {
    const byKey = new Map(GROUPS.flatMap(g => Object.values(pools[g]).flat().map(c => [c.k, c])));
    return (P.collections || []).map(c => {
      const cards = c.cards.map(k => byKey.get(k)).filter(Boolean).map(x => (x.gr >= 99 ? { ...x, k: `${x.k}|set`, gr: SET_CAP, set: c.name } : x)), star = byKey.get(c.star);
      if (!star || cards.length < 5) return null;
      return { ...c, cards, star, edition: { ...star, k: `${star.k}|${c.id}`, gr: 99, ed: c.name } };
    }).filter(Boolean);
  }
  // ♻️ trade-ups: 5 cards of one rarity for a random card of the next (never into Mythic)
  const TRADE_UP = { common: 'rare', rare: 'epic', epic: 'legendary' }, TRADE_N = 5;
  function tradeUpCard(pools, from, rand = Math.random) {
    const to = TRADE_UP[from]; if (!to) throw new Error("That rarity can't be traded up.");
    const g = SLOTS[Math.floor(rand() * SLOTS.length)][1], list = pools[g][nearestRar(pools, g, to)].filter(c => c.gr < 99);
    return { ...list[Math.floor(rand() * list.length)] };
  }
  // a team pack: 3 cards from that collection (repeats happen)
  const openTeamPack = (col, rand = Math.random) => Array.from({ length: TEAM_PACK.cards }, () => ({ ...col.cards[Math.floor(rand() * col.cards.length)] }));
  // the nearest rarity that has a card (going up first): a group with no Mythic gives a Legendary, not a Common
  const nearestRar = (pools, g, rar) => {
    const i = RARITY.findIndex(r => r.key === rar), order = RARITY.map((r, j) => [r.key, Math.abs(j - i) + (j < i ? 0.5 : 0)]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
    return order.find(r => pools[g][r].length);
  };
  // one card for playing a game
  function gameCard(pools, won, rand = Math.random) {
    const odds = GAME_CARD[won ? 'win' : 'loss'];
    let r = rand(), rar = 'common'; for (const [k, p] of Object.entries(odds)) if ((r -= p) < 0) { rar = k; break; }
    const g = SLOTS[Math.floor(rand() * SLOTS.length)][1], list = pools[g][nearestRar(pools, g, rar)];
    return { ...list[Math.floor(rand() * list.length)] };
  }
  // a pack's cards (without ids). Positions come up as often as they appear in the lineup (2 WR, 2 DL, 2 DB, 1 coach…).
  function openPack(key, pools, rand = Math.random) {
    const pack = PACKS[key]; if (!pack) throw new Error('No such pack.');
    const any = (g, rar) => { const list = pools[g][nearestRar(pools, g, rar)]; return { ...list[Math.floor(rand() * list.length)] }; }; // a random card of that group and rarity
    if (key === 'starter' || key === 'staff') { // one card per spot, mostly Commons, never the same player twice
      const out = [];
      for (const [, g] of SLOTS.filter(([s]) => key === 'starter' || STAFF.includes(s))) {
        let c; do c = any(g, rand() < 0.75 ? 'common' : 'rare'); while (out.some(x => x.k.split('|')[0] === c.k.split('|')[0]));
        out.push(c);
      }
      return out;
    }
    const roll = odds => { let r = rand(); for (const [k, p] of Object.entries(odds)) if ((r -= p) < 0) return k; return 'common'; };
    const rank = k => RARITY.findIndex(r => r.key === k);
    const rars = Array.from({ length: pack.cards }, () => roll(pack.odds));
    if (pack.guarantee && !rars.some(r => rank(r) >= rank(pack.guarantee))) {
      const better = Object.fromEntries(Object.entries(pack.odds).filter(([k]) => rank(k) >= rank(pack.guarantee)));
      const tot = Object.values(better).reduce((a, b) => a + b, 0);
      rars[rars.length - 1] = roll(Object.fromEntries(Object.entries(better).map(([k, p]) => [k, p / tot])));
    }
    // the best card comes out last (the reveal saves it)
    return rars.sort((a, b) => rank(a) - rank(b)).map(r => any(SLOTS[Math.floor(rand() * SLOTS.length)][1], r));
  }

  // ---------- ratings: grades → offense / defense (like 17-0) → points scored and allowed per game ----------
  function unitGrade(cards, W) {
    let tot = 0;
    for (const [g, ws] of Object.entries(W)) {
      const gr = SLOTS.filter(([, grp]) => grp === g).map(([s]) => cards[s]?.gr ?? BACKUP).sort((a, b) => b - a);
      ws.forEach((w, i) => (tot += w * gr[i]));
    }
    return tot;
  }
  // the coach adds up to ±1.5 points a game on each side of the ball; the stadium sets home field (1.5 to 3.5 points)
  const coachOf = cards => cards.HC?.gr ?? NO_COACH;
  const hfaOf = cards => (cards.ST ? 1.5 + 2 * cards.ST.gr / 99 : HFA);
  function ratings(cards) {
    const o = unitGrade(cards, OFF_W), d = unitGrade(cards, DEF_W), c = coachOf(cards);
    return { o, d, c, hfa: hfaOf(cards), ovr: Math.round((o + d) / 2), ppg: 22 + (o - 50) * 0.42 + (c - 50) * 0.03, pa: Math.max(7, 22 - (d - 50) * 0.38 - (c - 50) * 0.03) };
  }
  const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };

  // ---------- 📋 game plans: an offense, a defense and a tempo, picked before the game ----------
  const TACTICS = {
    off: {
      balanced: { name: 'Balanced', icon: '⚖️', desc: 'No edge, no weak spot.' },
      run: { name: 'Ground & pound', icon: '🐂', desc: 'Run it down their throat. Needs a good back and line. Beats zone and the blitz, dies against a stacked box.' },
      pass: { name: 'Air raid', icon: '✈️', desc: 'Throw early and often. Needs a QB and receivers. Shreds a stacked box, the blitz gets home.' },
      quick: { name: 'Quick game', icon: '⏱️', desc: 'Short, fast throws: the blitz never gets there. Stalls against zone and press man.' },
      deep: { name: 'Shot plays', icon: '🏹', desc: 'Go deep. Boom or bust: kills a stacked box and press man, Cover 2 is built to stop it, and the blitz arrives first.' },
    },
    def: {
      balanced: { name: 'Base defense', icon: '🛡️', desc: 'No edge, no weak spot.' },
      blitz: { name: 'Blitz', icon: '⚡', desc: 'Send pressure. Needs pass rushers. Wrecks deep shots and the air raid, quick throws and the run beat it.' },
      box: { name: 'Stack the box', icon: '🧱', desc: 'Eight in the box. Stuffs the run, leaves the deep part of the field open.' },
      zone: { name: 'Cover 2 zone', icon: '🕸️', desc: 'Keep everything in front. Stops shot plays and short passing, soft against the run.' },
      man: { name: 'Press man', icon: '🔒', desc: 'Jam the receivers. Needs good DBs. Smothers quick throws, a deep shot can beat it.' },
    },
    tempo: {
      normal: { name: 'Normal', icon: '🏈', desc: 'A regular game.' },
      hurry: { name: 'Hurry-up', icon: '💨', desc: 'More plays and more points for both teams, wilder swings. Pairs with quick and air-raid passing.' },
      grind: { name: 'Clock killer', icon: '🐢', desc: 'Long drives: fewer points and smaller swings. Pairs with ground & pound.' },
    },
  };
  const DEFAULT_PLAN = { off: 'balanced', def: 'balanced', tempo: 'normal' };
  const planOf = t => ({ off: TACTICS.off[t?.off] ? t.off : 'balanced', def: TACTICS.def[t?.def] ? t.def : 'balanced', tempo: TACTICS.tempo[t?.tempo] ? t.tempo : 'normal' });
  // points for the offense, by its plan against the other team's defense (a balanced side has no edge and no weakness)
  const VS = {
    run: { blitz: 1.5, box: -3, zone: 2.5, man: 1 },
    pass: { blitz: -1.5, box: 2.5, zone: -1, man: 0.5 },
    quick: { blitz: 3, box: 0.5, zone: -1.5, man: -2.5 },
    deep: { blitz: -2.5, box: 2.5, zone: -3, man: 2 },
  };
  const avgGr = (C, ...slots) => slots.reduce((a, s) => a + (C[s]?.gr ?? BACKUP), 0) / slots.length;
  // how well the cards suit the plan: about ±1.5 points for a great or poor fit
  const OFF_FIT = { run: ['RB', 'OL'], pass: ['QB', 'WR1', 'WR2'], quick: ['QB', 'TE', 'WR2'], deep: ['QB', 'WR1'] };
  const DEF_FIT = { blitz: ['DL1', 'DL2', 'LB'], box: ['DL1', 'DL2', 'LB'], zone: ['DB1', 'DB2', 'LB'], man: ['DB1', 'DB2'] };
  const coachMult = c => 0.75 + c / 200; // a 99 coach makes his side's edges ~25% bigger, a 1 coach ~25% smaller
  // Everything the plans do to one team's scoring: points, extra swing, and the reasons (for the game page)
  function planEdge(atkCards, atkPlan, defCards, defPlan) {
    const notes = [], o = atkPlan.off, d = defPlan.def;
    const vs = VS[o]?.[d] || 0;
    const fitO = OFF_FIT[o] ? (avgGr(atkCards, ...OFF_FIT[o]) - 65) * 0.06 : 0;
    const fitD = DEF_FIT[d] ? (avgGr(defCards, ...DEF_FIT[d]) - 65) * 0.06 : 0;
    const raw = vs + fitO - fitD, mult = raw > 0 ? coachMult(coachOf(atkCards)) : coachMult(coachOf(defCards));
    let pts = raw * mult, sd = 0;
    if (vs) notes.push({ kind: vs > 0 ? 'beat' : 'stuffed', pts: vs * mult, o, d });
    if (Math.abs(fitO) >= 0.3) notes.push({ kind: 'fitO', pts: fitO * mult, o });
    if (Math.abs(fitD) >= 0.3) notes.push({ kind: 'fitD', pts: -fitD * mult, d });
    // tempo (both teams' choices count for both teams' scoring) and the plans that pair with it
    for (const t of [atkPlan.tempo, defPlan.tempo]) { if (t === 'hurry') { pts += 1; sd += 1.2; } if (t === 'grind') { pts -= 1.2; sd -= 1.2; } }
    if ((atkPlan.tempo === 'hurry' && (o === 'quick' || o === 'pass')) || (atkPlan.tempo === 'grind' && o === 'run')) { pts += 0.8; notes.push({ kind: 'tempo', pts: 0.8, o, t: atkPlan.tempo }); }
    if (o === 'deep') sd += 1.5;      // boom or bust
    if (d === 'blitz') sd += 1;       // big plays both ways
    return { pts, sd, notes };
  }
  function expected(home, away, homePlan, awayPlan) {
    const H = ratings(home), A = ratings(away), hp = planOf(homePlan), ap = planOf(awayPlan);
    const eH = planEdge(home, hp, away, ap), eA = planEdge(away, ap, home, hp);
    const eh = H.ppg + (A.pa - 22) / 2 + H.hfa / 2 + eH.pts, ea = A.ppg + (H.pa - 22) / 2 - H.hfa / 2 + eA.pts;
    const sdH = Math.max(6, SD + eH.sd), sdA = Math.max(6, SD + eA.sd);
    return { eh, ea, sdH, sdA, edges: { home: eH, away: eA }, homeWin: 0.5 * (1 + erf((eh - ea) / Math.hypot(sdH, sdA) / Math.SQRT2)) };
  }

  // ---------- the game: score, scoring plays (like the Super Bowl sim) and a box score that adds up ----------
  // seeded random numbers, so the same seed always replays the same game
  const rng = seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const TWO_PT = [-2, -5, -10, 1, 5]; // score margin right after a TD (before the try) where teams go for 2
  // how each plan moves the stat lines (offense's own plan, then the defense it faces)
  const BOX_O = { // carries, attempts, completion %, yards per catch, sack rate ×, INT rate +, TD run share +, long-TD chance
    balanced: { car: 0, att: 0, cmp: 0, ypc: 0, sk: 1, int: 0, run: 0, long: 0.2 },
    run: { car: 7, att: -7, cmp: 0.02, ypc: -0.4, sk: 0.9, int: -0.1, run: 0.15, long: 0.15 },
    pass: { car: -5, att: 7, cmp: 0, ypc: 0.5, sk: 1.1, int: 0.15, run: -0.12, long: 0.22 },
    quick: { car: -2, att: 3, cmp: 0.05, ypc: -1.8, sk: 0.6, int: -0.05, run: -0.05, long: 0.1 },
    deep: { car: -3, att: 1, cmp: -0.07, ypc: 3.2, sk: 1.25, int: 0.3, run: -0.1, long: 0.4 },
  };
  const BOX_D = { // what the defense's plan does to the offense facing it (yards per carry +, completion %, yards per catch, sacks ×, INT +, run share +)
    balanced: { ypc: 0, cmp: 0, ycp: 0, sk: 1, int: 0, run: 0 },
    blitz: { ypc: 0.2, cmp: -0.01, ycp: 0.8, sk: 1.6, int: 0.2, run: 0 },
    box: { ypc: -0.7, cmp: 0.01, ycp: 0.4, sk: 1.1, int: 0, run: -0.08 },
    zone: { ypc: 0.4, cmp: 0.03, ycp: -1.5, sk: 0.85, int: 0.1, run: 0.06 },
    man: { ypc: 0.1, cmp: -0.04, ycp: 0.5, sk: 1, int: 0.15, run: 0 },
  };

  // side = { name, abbr, cards: { slot: card }, tactics? }; the home side is the one who queued the game (and its stadium)
  function simGame(homeSide, awaySide, seed) {
    const R0 = rng(seed);
    const rand = () => R0();
    const randn = () => { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const rnd = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
    const poisson = l => { let k = 0, p = 1; const L = Math.exp(-l); do { k++; p *= rand(); } while (p > L); return k - 1; };
    const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
    const pick = list => { const tot = list.reduce((a, x) => a + x.w, 0); let r = rand() * tot; for (const x of list) if ((r -= x.w) <= 0) return x.p; return list[0]?.p; };
    const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    const fact = n => (n < 2 ? 1 : n * fact(n - 1)), pois = (k, l) => Math.exp(-l) * l ** k / fact(k);
    const sum = a => a.reduce((x, y) => x + y, 0);
    // split n among items by weight, one at a time
    const handOut = (n, items) => { const m = new Map(); for (let i = 0; i < n && items.length; i++) { const p = pick(items); m.set(p, (m.get(p) || 0) + 1); } return m; };
    const S = { home: homeSide, away: awaySide };
    const plan = { home: planOf(homeSide.tactics), away: planOf(awaySide.tactics) };

    // 🌦️ weather at the host's stadium (no stadium card: a mild day)
    const st = homeSide.cards.ST, roof = st?.x?.roof || 'outdoors';
    let wx;
    if (roof !== 'outdoors') wx = { kind: 'dome', temp: 72, text: `${roof === 'dome' ? 'Dome' : 'Roof closed'}, 72°`, pts: 0.5, pass: 1.03, run: 0 };
    else {
      const temp = Math.round((st?.x?.dec ?? 55) + randn() * 8);
      const snow = temp <= 34 && rand() < 0.35, rain = !snow && temp > 34 && rand() < 0.18, wind = !snow && rand() < 0.12;
      wx = snow ? { kind: 'snow', temp, text: `Snow, ${temp}° ❄️`, pts: -2, pass: 0.85, run: 0.1 }
        : temp <= 25 ? { kind: 'cold', temp, text: `Frozen, ${temp}° 🥶`, pts: -1, pass: 0.92, run: 0.06 }
        : rain ? { kind: 'rain', temp, text: `Rain, ${temp}° 🌧️`, pts: -1, pass: 0.92, run: 0.06 }
        : wind ? { kind: 'wind', temp, text: `Windy, ${temp}° 🌬️`, pts: -1, pass: 0.9, run: 0.05 }
        : { kind: 'clear', temp, text: `Clear, ${temp}°`, pts: 0, pass: 1, run: 0 };
    }

    // who's who: each card becomes a player in the sim (O-line and empty spots have no name in the stats)
    const R = {};
    for (const side of ['home', 'away']) {
      const C = S[side].cards, abbr = S[side].abbr, O = BOX_O[plan[side].off], D = BOX_D[plan[side === 'home' ? 'away' : 'home'].def];
      const pl = slot => { const c = C[slot]; return { name: c ? c.n : `${abbr} backup`, slot, gr: c?.gr ?? BACKUP, l: c?.l || '' }; };
      const P = Object.fromEntries(REQUIRED.map(([s]) => [s, pl(s)]));
      const num = (re, s) => { const m = s.match(re); return m ? +m[1].replace(/,/g, '') : 0; };
      const qbRush = num(/([\d,]+) rush$/, P.QB.l); // the 17-0 line notes 300+ rushing yards for a running QB
      const ypr = (p, d) => { const r = num(/^([\d,]+) rec/, p.l), y = num(/rec, ([\d,]+) yds/, p.l); return r >= 20 && y ? y / r : d; };
      const f = p => 0.5 + p.gr / 100;
      R[side] = {
        P, qbRush, qb: P.QB, kicker: { name: `${abbr} kicker` }, O, D,
        rushers: [{ p: P.RB, w: 0.84 }, { p: P.QB, w: 0.06 + Math.min(0.3, qbRush / 4000) }],
        receivers: [{ p: P.WR1, w: 0.31 * f(P.WR1) }, { p: P.WR2, w: 0.25 * f(P.WR2) }, { p: P.TE, w: 0.24 * f(P.TE) * (plan[side].off === 'quick' ? 1.3 : 1) }, { p: P.RB, w: 0.2 * f(P.RB) }],
        ypr: new Map([[P.WR1, ypr(P.WR1, 13)], [P.WR2, ypr(P.WR2, 12.5)], [P.TE, ypr(P.TE, 11)], [P.RB, 7.8]]),
        hawks: [{ p: P.DB1, w: 0.38 * f(P.DB1) }, { p: P.DB2, w: 0.34 * f(P.DB2) }, { p: P.LB, w: 0.28 * f(P.LB) }],
        strippers: [{ p: P.DL1, w: 0.4 * f(P.DL1) }, { p: P.DL2, w: 0.35 * f(P.DL2) }, { p: P.LB, w: 0.25 * f(P.LB) }],
        returners: [{ p: P.WR2, w: 1 }, { p: P.DB2, w: 1, punt: true }],
        rushShare: clamp(0.4 + (P.RB.gr - P.QB.gr) * 0.002 + qbRush / 10000 + O.run + D.run + wx.run, 0.18, 0.7),
      };
    }

    // the final score
    const E = expected(homeSide.cards, awaySide.cards, plan.home, plan.away);
    const realScore = x => { x = Math.max(0, Math.round(x)); return x === 1 ? (rand() < 0.5 ? 0 : 3) : x; };
    let hs = realScore(E.eh + wx.pts + randn() * E.sdH), as = realScore(E.ea + wx.pts + randn() * E.sdA);
    const ot = hs === as;
    if (ot) rand() < 1 / (1 + Math.exp(-(E.eh - E.ea) / 7)) ? (hs += 3) : (as += 3); // overtime field goal
    const g = { home: 'home', away: 'away', hs, as, ot, winner: hs > as ? 'home' : 'away' };
    g.loser = g.winner === 'home' ? 'away' : 'home'; g.ws = Math.max(hs, as); g.ls = Math.min(hs, as);

    // Break a team's points into touchdowns (with extra point, failed try or 2-point conversion), field goals and the
    // odd safety, credited to its cards. About 1 TD in 15 is scored by the defense or a return man. Every TD keeps its
    // yards, and the box score is built on top of them.
    function scoringPlays(team, pts) {
      const Rm = R[team], O = R[team === 'home' ? 'away' : 'home'], ways = [];
      for (let t = 0; 6 * t <= pts; t++) for (let m = 0; m <= Math.min(t, 2); m++) for (let two = 0; two + m <= Math.min(t, 3); two++) for (let sf = 0; sf <= 2; sf++) {
        const r = pts - (7 * t - m + two) - 2 * sf;
        if (r >= 0 && r % 3 === 0) ways.push({ p: { t, m, two, sf, f: r / 3 }, w: pois(t, 2.6) * pois(r / 3, 1.7) * 0.025 ** m * 0.012 ** two * 0.008 ** sf });
      }
      const { t, m, two, sf, f } = pick(ways) || { t: 0, m: 0, two: 0, sf: 0, f: 0 };
      const plays = [], longRun = clamp(0.12 + (Rm.D.ypc || 0) * 0.08, 0.04, 0.2), longPass = clamp(Rm.O.long + (Rm.D.ycp || 0) * 0.04, 0.05, 0.5);
      for (let i = 0; i < t; i++) {
        const pp = i < m ? 6 : i < m + two ? 8 : 7, r = rand();
        let p, yds;
        if (r < 0.035 && (p = pick(Rm.hawks))) plays.push({ team, pts: pp, kind: 'def', pick6: true, text: `${O.qb.name} picked off by ${p.name}, ${rnd(15, 75)}-yd pick-six 🦅`, who: [p] });
        else if (r < 0.055 && (p = pick(Rm.strippers))) plays.push({ team, pts: pp, kind: 'def', fumble: true, text: `${p.name} ${rnd(5, 60)}-yd fumble return TD`, who: [p] });
        else if (r < 0.075) { const x = Rm.returners[Math.floor(rand() * 2)]; plays.push({ team, pts: pp, kind: 'ret', text: `${x.p.name} ${x.punt ? rnd(45, 85) + '-yd punt' : rnd(90, 105) + '-yd kickoff'} return TD ⚡`, who: [x.p], kick: !x.punt }); }
        else if (rand() < Rm.rushShare) { p = pick(Rm.rushers); yds = p === Rm.qb ? rnd(1, 25) : rnd(1, 15) + (rand() < longRun ? rnd(10, 60) : 0); plays.push({ team, pts: pp, kind: 'run', yds, text: `${p.name} ${yds}-yd TD run`, who: [p] }); }
        else { p = pick(Rm.receivers); yds = rnd(3, 25) + (rand() < longPass ? rnd(10, 50) : 0); plays.push({ team, pts: pp, kind: 'pass', yds, text: `${Rm.qb.name} ${yds}-yd TD pass to ${p.name}`, who: [Rm.qb, p] }); }
      }
      for (let i = 0; i < f; i++) plays.push({ team, pts: 3, kind: 'fg', yds: rnd(22, wx.kind === 'snow' || wx.kind === 'wind' ? 46 : 54), who: [Rm.kicker] });
      for (let i = 0; i < sf; i++) plays.push({ team, pts: 2, kind: 'sf', text: `${S[team].name} defense: safety`, who: [] });
      return plays;
    }
    // How un-football-like an order of scoring plays is (0 = reads like a real game)
    function flowPenalty(order) {
      let h = 0, a = 0, pen = 0;
      const n = order.length, lastOf = {};
      order.forEach((p, i) => (lastOf[p.team] = i));
      order.forEach((p, i) => {
        const q = 1 + Math.floor(4 * i / Math.max(1, n)), mine = () => (p.team === 'home' ? h - a : a - h);
        const before = mine(); p.team === 'home' ? (h += p.pts) : (a += p.pts); const after = mine();
        if (p.kind === 'fg' && q === 4 && after <= -4 && lastOf[p.team] === i) pen += 6;
        if (p.kind === 'fg' && q === 4 && before <= -4 && before >= -8 && i >= n - 2) pen += 3;
        if (p.pts === 8 && !TWO_PT.includes(before + 6)) pen += 8;
        if (p.kick && !(i === 0 || order[i - 1].team !== p.team || (q === 3 && 1 + Math.floor(4 * (i - 1) / n) <= 2))) pen += 8;
        if (p.kind === 'sf' && q === 1 && i === 0) pen += 0.5;
      });
      if (g.ot && order.length && h !== a) pen += 100; // regulation has to end tied before an overtime winner
      return pen;
    }
    // both teams' scoring as one log: realistic order, quarters, game clock, running score and notes
    const otWinner = g.ot ? g.winner : null;
    let best = [], bestPen = Infinity;
    for (let tries = 0; tries < 30 && bestPen >= 8; tries++) {
      const plays = [...scoringPlays('home', hs - (otWinner === 'home' ? 3 : 0)), ...scoringPlays('away', as - (otWinner === 'away' ? 3 : 0))];
      for (let k = 0; k < 300 && bestPen > 0; k++) { const o = shuffle(plays.slice()), pen = flowPenalty(o); if (pen < bestPen) { best = o; bestPen = pen; } }
    }
    const n = best.length, quarters = best.map((p, i) => 1 + Math.floor(4 * i / Math.max(1, n)));
    const times = []; for (let q = 1; q <= 4; q++) { const k = quarters.filter(x => x === q).length; times.push(...Array.from({ length: k }, () => rnd(5, 895)).sort((x, y) => y - x)); }
    best.forEach((p, i) => { // a kickoff return comes seconds after the score before it (or on a kickoff that starts a half)
      if (!p.kick) return;
      const sameQ = i > 0 && quarters[i - 1] === quarters[i];
      times[i] = sameQ ? Math.max(3, times[i - 1] - rnd(10, 16)) : 900 - rnd(10, 16);
      for (let j = i + 1; j < n && quarters[j] === quarters[i]; j++) if (times[j] >= times[j - 1]) times[j] = Math.max(1, times[j - 1] - rnd(30, 120));
    });
    let h = 0, a = 0, decisive = -1;
    const maxDown = { home: 0, away: 0 };
    const log = best.map((p, i) => {
      const before = p.team === 'home' ? h - a : a - h;
      p.team === 'home' ? (h += p.pts) : (a += p.pts);
      maxDown.home = Math.max(maxDown.home, a - h); maxDown.away = Math.max(maxDown.away, h - a);
      const after = p.team === 'home' ? h - a : a - h;
      let text = p.kind === 'fg' ? `${p.who[0].name} ${p.yds}-yd field goal` : p.text;
      if (p.pts === 6) { text += TWO_PT.includes(after) ? ' (2-pt try failed)' : ' (XP missed)'; p.xpMiss = !TWO_PT.includes(after); }
      if (p.pts === 8) text += ' (2-pt conversion good)';
      return { ...p, text, q: quarters[i], t: times[i], h, a, before, after };
    });
    log.forEach((p, i) => { if (p.team === g.winner && p.before <= 0 && p.after > 0) decisive = i; });
    if (otWinner) {
      const t = rnd(30, 590), yds = rnd(24, 52);
      otWinner === 'home' ? (h += 3) : (a += 3);
      log.push({ team: otWinner, pts: 3, kind: 'fg', yds, who: [R[otWinner].kicker], q: 'OT', t, h, a, text: `${R[otWinner].kicker.name} ${yds}-yd walk-off field goal 🦵`, note: 'Wins it in overtime' });
    } else if (decisive >= 0 && log[decisive].q === 4 && g.ws - g.ls <= 8) {
      const d = log[decisive];
      if (decisive === log.length - 1 && !d.kick) d.t = Math.min(d.t, rnd(3, 119));
      d.note = d.t <= 120 ? (decisive === log.length - 1 && d.kind === 'fg' && d.t <= 10 ? 'Walk-off field goal' : 'Game-winning drive 🏁') : 'Go-ahead score';
    }
    log.forEach(p => (p.when = p.q === 'OT' ? `OT ${clock(p.t)}` : `Q${p.q} ${clock(p.t)}`));

    // ---------- box score, built around the scoring plays: a player's TDs (with their yards) are part of his line ----------
    const avg = (...ps) => ps.reduce((x, p) => x + p.gr, 0) / ps.length;
    const tempoPlays = t => (t === 'hurry' ? 1.12 : t === 'grind' ? 0.9 : 1);
    const box = {};
    for (const t of ['home', 'away']) {
      const o = t === 'home' ? 'away' : 'home', M = R[t], X = R[o].P, P = M.P, mine = log.filter(p => p.team === t), BO = M.O, BD = M.D;
      const pts = t === 'home' ? hs : as, oppPts = t === 'home' ? as : hs, pace = tempoPlays(plan[t].tempo) * Math.sqrt(tempoPlays(plan[o].tempo));
      const oppDB = avg(X.DB1, X.DB2), oppDL = avg(X.DL1, X.DL2), oppFront = avg(X.DL1, X.DL2, X.LB), wrs = avg(P.WR1, P.WR2, P.TE);
      const tdMap = kind => { const m = new Map(); for (const p of mine) if (p.kind === kind) { const w = p.who[kind === 'pass' ? 1 : 0]; m.set(w, (m.get(w) || []).concat(p.yds || 0)); } return m; };
      // passing
      const recTD = tdMap('pass'), passTD = mine.filter(p => p.kind === 'pass').length, tdPassYds = sum(mine.filter(p => p.kind === 'pass').map(p => p.yds));
      const att = clamp(Math.round((33 + BO.att + randn() * 5 + (oppPts - pts) * 0.3) * pace * (wx.pass < 1 ? 0.95 : 1)), 14, 60);
      const cmp = Math.max(passTD, Math.round(att * clamp(0.62 + (P.QB.gr - 50) * 0.0018 - (oppDB - 50) * 0.0012 + BO.cmp + BD.cmp + randn() * 0.05, 0.4, 0.84)));
      const boost = clamp(1 + (pts - 22) / 80, 0.7, 1.4);
      const perCmp = clamp(10.8 + (P.QB.gr - 50) * 0.03 + (wrs - 50) * 0.02 - (oppDB - 50) * 0.02 + BO.ypc + BD.ycp + randn() * 1.2, 6, 18) * boost * wx.pass;
      const sixes = log.filter(p => p.team === o && p.pick6).length, scoops = log.filter(p => p.team === o && p.fumble).length;
      const int = Math.max(sixes, Math.min(4, poisson(clamp(0.8 - (P.QB.gr - 50) * 0.012 + (oppDB - 50) * 0.01 + BO.int + BD.int, 0.1, 2.2))));
      const fum = Math.max(scoops, Math.min(3, poisson(wx.kind === 'snow' || wx.kind === 'rain' ? 0.7 : 0.45)));
      const sacked = Math.min(9, poisson(clamp((2.3 + (oppDL - 50) * 0.035 - (P.OL.gr - 50) * 0.03) * BO.sk * BD.sk, 0.3, 7)));
      let sackYds = 0; for (let i = 0; i < sacked; i++) sackYds += rnd(4, 10);
      // receiving: the TD catches with their yards, then the other catches by target share, sharing the rest of the
      // day's yards (at least 3 a catch), by each player's yards per catch
      const target = Math.max(30, Math.round(cmp * perCmp));
      const other = handOut(cmp - passTD, M.receivers);
      const who = [...new Set([...recTD.keys(), ...other.keys()])];
      const raw = who.map(p => ({ p, k: other.get(p) || 0, y: (other.get(p) || 0) * M.ypr.get(p) * Math.max(0.3, 1 + randn() * 0.3) }));
      const left = Math.max(3 * (cmp - passTD), target - tdPassYds), tot = raw.reduce((x, r) => x + r.y, 0) || 1;
      const rec = raw.map(r => {
        const tds = recTD.get(r.p) || [], rest = r.k ? Math.max(3 * r.k, Math.round(r.y * left / tot)) : 0;
        return { name: r.p.name, n: tds.length + r.k, yds: sum(tds) + rest, td: tds.length, lng: Math.max(0, ...tds, r.k ? Math.min(rest, Math.round(rest / r.k * (1.4 + rand() * 1.2))) : 0) };
      }).sort((x, y) => y.yds - x.yds);
      const pyd = sum(rec.map(r => r.yds));
      // rushing: the TD runs with their yards, then the other carries split between the back and the QB
      const runTD = tdMap('run'), carries = clamp(Math.round((26 + BO.car + randn() * 4 + (pts - oppPts) * 0.25) * pace + wx.run * 30), 10, 48);
      const car = new Map([...runTD].map(([p]) => [p, 0]));
      for (const [p, k] of handOut(Math.max(0, carries - sum([...runTD.values()].map(v => v.length))), M.rushers)) car.set(p, k);
      const rush = [...car].map(([p, k]) => {
        const tds = runTD.get(p) || [], ypc = p === M.qb ? 3.5 + Math.min(3, M.qbRush / 400) : 4.2 + (P.OL.gr - 50) * 0.02 + (p.gr - 50) * 0.012 - (oppFront - 50) * 0.012 + BD.ypc;
        const rest = k ? Math.max(-k, Math.round(k * ypc * (1 + randn() * 0.25))) : 0;
        return { name: p.name, n: tds.length + k, yds: sum(tds) + rest, td: tds.length, qb: p === M.qb, lng: Math.max(0, ...tds, k ? Math.min(Math.max(rest, 1), Math.round(Math.max(1, ypc) * (1.8 + rand() * 2.4))) : 0) };
      }).sort((x, y) => y.n - x.n);
      const ryd = sum(rush.map(r => r.yds));
      // kicking
      const fg = mine.filter(p => p.kind === 'fg'), xpm = mine.filter(p => p.pts === 7).length;
      const total = pyd - sackYds + ryd, tds = mine.filter(p => p.kind === 'pass' || p.kind === 'run').length;
      box[t] = {
        pts, qb: { name: P.QB.name, cmp, att, yds: pyd, td: passTD, int, sacked, lng: Math.max(0, ...rec.map(r => r.lng)) }, rush, rec,
        kick: { name: M.kicker.name, fgm: fg.length, fga: fg.length + (rand() < (wx.kind === 'snow' || wx.kind === 'wind' ? 0.4 : 0.2) ? 1 : 0), lng: fg.length ? Math.max(...fg.map(p => p.yds)) : 0, xpm, xpa: xpm + mine.filter(p => p.xpMiss).length },
        team: { fd: Math.max(tds, Math.round(total / 15.5 + randn() * 1.5)), total, pass: pyd - sackYds, rush: ryd, to: int + fum, sacks: `${sacked}-${sackYds}`, plays: att + carries + sacked },
        fum,
      };
    }
    // time of possession by plays run
    const ph = box.home.team.plays, pa = box.away.team.plays, topH = Math.round(3600 * ph / (ph + pa) + randn() * 60);
    box.home.team.top = clock(topH); box.away.team.top = clock(3600 - topH);
    // defense: tackles, sacks, interceptions, forced fumbles and TDs, credited to each defense's cards
    for (const t of ['home', 'away']) {
      const o = t === 'home' ? 'away' : 'home', M = R[t], P = M.P, ob = box[o], D = new Map();
      const row = p => { if (!D.has(p)) D.set(p, { name: p.name, slot: p.slot, tkl: 0, sck: 0, int: 0, ff: 0, td: 0 }); return D.get(p); };
      // about 55% of the tackles: the rest go to the other six defenders, who aren't cards
      const tacklers = [{ p: P.LB, w: 0.32 }, { p: P.DB1, w: 0.22 }, { p: P.DB2, w: 0.2 }, { p: P.DL1, w: 0.13 }, { p: P.DL2, w: 0.13 }];
      for (const [p, k] of handOut(Math.round((ob.rush.reduce((x, r) => x + r.n, 0) + ob.qb.cmp) * 0.55), tacklers)) row(p).tkl += k;
      for (const [p, k] of handOut(ob.qb.sacked, M.strippers)) { row(p).sck += k; row(p).tkl += k; }
      let picks = 0;
      for (const p of log) if (p.team === t && p.pick6) { row(p.who[0]).int++; picks++; }
      for (const [p, k] of handOut(ob.qb.int - picks, M.hawks)) row(p).int += k;
      for (const [p, k] of handOut(ob.fum, M.strippers)) row(p).ff += k;
      for (const p of log) if (p.team === t && (p.kind === 'def' || p.kind === 'ret') && p.who[0]) { const r = row(p.who[0]); if (p.kind === 'def') r.td++; else r.ret = (r.ret || 0) + 1; }
      box[t].def = REQUIRED.map(([s]) => P[s]).filter(p => D.has(p)).map(p => D.get(p));
      box[t].ret = [...D.values()].filter(r => r.ret).map(r => ({ name: r.name, td: r.ret }));
    }
    // player of the game, from the winner's box score
    const W = box[g.winner], score = [];
    score.push({ name: W.qb.name, v: 2 + W.qb.yds / 50 + W.qb.td * 4 - W.qb.int * 3, line: `${W.qb.cmp}/${W.qb.att}, ${W.qb.yds} yds, ${W.qb.td} TD${W.qb.int ? `, ${W.qb.int} INT` : ''}` });
    for (const r of W.rush) if (!r.qb) score.push({ name: r.name, v: r.yds / 20 + r.td * 5, line: `${r.n} car, ${r.yds} yds${r.td ? `, ${r.td} TD` : ''}` });
    for (const r of W.rec) score.push({ name: r.name, v: r.yds / 20 + r.td * 5, line: `${r.n} rec, ${r.yds} yds${r.td ? `, ${r.td} TD` : ''}` });
    for (const r of W.def) score.push({ name: r.name, v: r.int * 3 + r.sck * 2.5 + r.ff * 2 + r.td * 6 + r.tkl * 0.15, line: [r.tkl && `${r.tkl} tkl`, r.sck && `${r.sck} sacks`, r.int && `${r.int} INT`, r.ff && `${r.ff} FF`, r.td && `${r.td} TD`].filter(Boolean).join(', ') });
    const mvp = score.sort((x, y) => y.v - x.v)[0];
    // keep the saved game small: names instead of player objects
    const out = log.map(({ team, pts, kind, text, note, q, t, when, h, a, pick6 }) => ({ team, pts, kind, text, note, q, t, when, h, a, pick6 }));
    const edges = { home: E.edges.home.notes, away: E.edges.away.notes };
    return { hs, as, ot, winner: g.winner, comeback: maxDown[g.winner] >= 10 ? maxDown[g.winner] : 0, homeWin: E.homeWin, log: out, box, mvp: { name: mvp.name, side: g.winner, line: mvp.line },
      plans: plan, edges, wx: { kind: wx.kind, text: wx.text, at: st ? st.n : null }, coach: { home: homeSide.cards.HC?.n || null, away: awaySide.cards.HC?.n || null } };
  }

  // ---------- 🤖 bots: computer teams built to an overall rating, with a random game plan ----------
  const BOTS = {
    easy: { name: 'Easy', team: 'Practice Squad', abbr: 'PRAC', ovr: [70, 70], reward: 5 },
    medium: { name: 'Medium', team: 'Pro Bowlers', abbr: 'PRO', ovr: [85, 85], reward: 10 },
    hard: { name: 'Hard', team: 'Hall of Famers', abbr: 'HOF', ovr: [95, 99], reward: 15 },
  };
  const BOT_CAP = 100; // bot points a day, so beating Easy bots over and over can't print points
  const randomPlan = (rand = Math.random) => { const k = o => Object.keys(o)[Math.floor(rand() * Object.keys(o).length)]; return { off: k(TACTICS.off), def: k(TACTICS.def), tempo: k(TACTICS.tempo) }; };
  function makeBot(pools, level, rand = Math.random) {
    const B = BOTS[level]; if (!B) throw new Error('No such bot.');
    const target = B.ovr[0] + Math.round(rand() * (B.ovr[1] - B.ovr[0]));
    const all = Object.fromEntries(GROUPS.map(g => [g, Object.values(pools[g]).flat()]));
    const pid = c => c.k.split('|')[0];
    let best = null, bestD = Infinity;
    for (let tries = 0; tries < 40 && bestD > 0; tries++) { // cards near the target grade, kept if the overall lands closest
      const cards = {}, used = new Set();
      for (const [s, g] of SLOTS) {
        const free = all[g].filter(c => !used.has(pid(c))); if (!free.length) continue;
        const near = free.filter(c => Math.abs(c.gr - target) <= 3);
        const list = near.length ? near : free.sort((a, b) => Math.abs(a.gr - target) - Math.abs(b.gr - target)).slice(0, 8);
        const c = list[Math.floor(rand() * list.length)]; cards[s] = { ...c }; used.add(pid(c));
      }
      const d = Math.abs(ratings(cards).ovr - target);
      if (d < bestD) { best = cards; bestD = d; }
    }
    return { name: `${B.name} bot`, team: B.team, abbr: B.abbr, cards: best, ovr: ratings(best).ovr, level, tactics: randomPlan(rand) };
  }

  // ---------- 📅 season: take over a real franchise's schedule this season (like 17-0) ----------
  // L = { season, teams: [{ t, name, nick, conf }], off: {t: pts}, def: {t: pts allowed}, lg, sched: {t: [{ week, opp, home }]} }
  // Your coach counts (in your points scored and allowed) and so does your stadium's home field in home games.
  const SEASON_REWARD = { played: 100, playoffs: 200, champ: 300, perfect: 1000 };
  function simSeason(cards, L, F, seed) {
    const rand = rng(seed), R = ratings(cards);
    const randn = () => { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const realScore = x => { x = Math.max(0, Math.round(x)); return x === 1 ? (rand() < 0.5 ? 0 : 3) : x; };
    const winP = m => 0.5 * (1 + erf(m / (SD * Math.SQRT2) / Math.SQRT2));
    const conf = t => L.teams.find(x => x.t === t)?.conf;
    function playOne(opp, where, canTie) {
      const h = where === 'home' ? R.hfa / 2 : where === 'away' ? -HFA / 2 : 0;
      const me = R.ppg + (L.def[opp] - L.lg) / 2 + h, them = R.pa + (L.off[opp] - L.lg) / 2 - h;
      let a = realScore(me + randn() * SD), b = realScore(them + randn() * SD), ot = false, tie = false;
      if (a === b) { // a regular-season overtime can end tied (about 1 in 12), a playoff game can't
        ot = true;
        if (canTie && rand() < 0.08) { tie = true; if (rand() < 0.5) { a += 3; b += 3; } }
        else rand() < winP(me - them) ? (a += 3) : (b += 3);
      }
      return { opp, where, us: a, them: b, w: a > b, tie, ot };
    }
    const games = (L.sched[F] || []).map(g => ({ week: g.week, ...playOne(g.opp, g.home ? 'home' : 'away', true) }));
    const wins = games.filter(g => g.w).length, ties = games.filter(g => g.tie).length, post = [];
    // playoffs by record: 13+ wins = a bye as the top seed, 10–12 = a wild card game first, fewer = home for January
    if (wins >= 10) {
      const net = t => L.off[t] - L.def[t], rank = c => L.teams.filter(x => x.t !== F && x.conf === c).map(x => x.t).sort((x, y) => net(y) - net(x));
      const mine = rank(conf(F)), theirs = rank(conf(F) === 'AFC' ? 'NFC' : 'AFC');
      const path = [{ round: 'Divisional', opp: mine[3], where: 'home' }, { round: `${conf(F)} Championship`, opp: mine[0], where: 'home' }, { round: 'Super Bowl', opp: theirs[0], where: 'neutral' }];
      if (wins < 13) path.unshift({ round: 'Wild Card', opp: mine[2], where: 'away' });
      for (const g of path) { const r = { round: g.round, ...playOne(g.opp, g.where, false) }; post.push(r); if (!r.w) break; }
    }
    const champ = post.length > 0 && post[post.length - 1].round === 'Super Bowl' && post[post.length - 1].w;
    const perfect = wins === games.length && games.length > 0 && champ;
    const reward = perfect ? SEASON_REWARD.perfect : champ ? SEASON_REWARD.champ : wins >= 10 ? SEASON_REWARD.playoffs : SEASON_REWARD.played;
    return { F, season: L.season, games, wins, ties, losses: games.length - wins - ties, post, playoffs: wins >= 10, champ, perfect, reward, ovr: R.ovr };
  }

  const out = { SLOTS, STAFF, REQUIRED, GROUPS, NAMES, RARITY, rarityOf, PACKS, DAILY, REWARD, GAME_CARD, TEAM_PACK, COLLECTION_PTS, makeCollections, openTeamPack, gameCard, photos, SET_CAP, baseKey, TRADE_UP, TRADE_N, tradeUpCard, BACKUP, NO_COACH, HFA, BOTS, BOT_CAP, SEASON_REWARD, TACTICS, DEFAULT_PLAN, VS,
    planOf, randomPlan, makePools, openPack, ratings, expected, simGame, makeBot, simSeason };
  if (typeof module !== 'undefined' && module.exports) module.exports = out; else root.VM_UT = out;
})(typeof window !== 'undefined' ? window : globalThis);
