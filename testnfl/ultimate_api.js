// 🃏 Ultimate Team on the server: team names, daily points, packs, lineups, the challenge queue and games.
// Each profile gets a "ut" section:
//   { team: { name, abbr }, cards: [card], lineup: { slot: card id }, starter: true once the free pack is opened,
//     daily: 'YYYY-MM-DD' last claimed, rec: { w, l }, unseen: [game ids someone played against your queued team],
//     bot: { rec: { level: { w, l } }, day, pts (bot points that day) }, seasonDay, seasons: [last 20 seasons], titles,
//     staff: true once the free Staff pack (coach + stadium) is opened, collected: { collection id: when turned in } }
// New fields are added the first time an older profile is used, so nothing anyone has is ever reset.
// Shared state sits next to the profiles in "testnfl profiles\ultimate": queue.json (open games), games.json (a list
// of recent results), games\<id>.json (each game in full, so it replays exactly) and pulls.json (every Legendary pull).
// The server opens packs and plays the games, so nobody gets a better pack or result by refreshing.
const fs = require('fs');
const path = require('path');
const profiles = require('./profiles');
const UT = require('./app/ultimate.js');

const UDIR = path.join(profiles.DIR, 'ultimate'), GDIR = path.join(UDIR, 'games');
fs.mkdirSync(GDIR, { recursive: true });
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { fs.writeFileSync(f + '.tmp', JSON.stringify(v)); fs.renameSync(f + '.tmp', f); };
const QUEUE = path.join(UDIR, 'queue.json'), GAMES = path.join(UDIR, 'games.json'), PULLS = path.join(UDIR, 'pulls.json');
const KEEP_GAMES = 500; // results listed (every game file is kept)

// the card pool comes from the 17-0 data, re-read after a refresh rebuilds it
let POOLS = null, COLLECTIONS = [], HEADS = {}, LOGOS = {}, poolStamp = 0;
function pools() {
  const f = path.join(__dirname, 'app', 'perfect.js'), m = fs.statSync(f).mtimeMs;
  if (m !== poolStamp) {
    const s = fs.readFileSync(f, 'utf8'), P = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
    POOLS = UT.makePools(P); COLLECTIONS = UT.makeCollections(P, POOLS); HEADS = P.heads || {}; LOGOS = P.logos || {}; poolStamp = m;
  }
  return POOLS;
}
const collections = () => (pools(), COLLECTIONS);
const isChase = c => c.gr >= 90; // Legendary and Mythic pulls go in the log
const today = () => new Date().toLocaleDateString('en-CA'); // the server's own date, YYYY-MM-DD
const uid = () => Math.random().toString(36).slice(2, 10);
const defaultTeam = p => ({ name: `${p.name}'s Squad`.slice(0, 24), abbr: (p.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3) || 'UT').toUpperCase() });
function utOf(p) {
  const ut = (p.ut ||= { team: defaultTeam(p), cards: [], lineup: {}, starter: false, daily: '', rec: { w: 0, l: 0 }, unseen: [] });
  // added later: filled in (never reset) for profiles made before them
  ut.bot ||= { rec: {}, day: '', pts: 0 }; ut.seasons ||= []; ut.seasonDay ||= ''; ut.titles ||= 0; ut.collected ||= {};
  if (ut.staff === undefined) ut.staff = false; // the Staff pack is for everyone, including teams made before coaches and stadiums
  // 📸 cards opened before cards had photos get their player's headshot
  pools(); for (const c of ut.cards) { const h = HEADS[c.k.split('|')[0]]; if (h && c.h !== h) c.h = h; }
  return ut;
}
const cardsOf = ut => Object.fromEntries(Object.entries(ut.lineup).map(([s, u]) => [s, ut.cards.find(c => c.u === u)]).filter(([, c]) => c));
const full = ut => UT.REQUIRED.every(([s]) => cardsOf(ut)[s]); // the 11 players (coach and stadium are optional)
function state(p) {
  const ut = utOf(p);
  return { team: ut.team, cards: ut.cards, lineup: ut.lineup, starter: ut.starter, dailyReady: ut.daily !== today(), rec: ut.rec, unseen: ut.unseen, balance: p.balance,
    bot: { rec: ut.bot.rec, ptsToday: ut.bot.day === today() ? ut.bot.pts : 0 }, seasonReady: ut.seasonDay !== today(), seasons: ut.seasons.slice(0, 10), titles: ut.titles,
    staff: ut.staff, collected: ut.collected, tactics: UT.planOf(p.prefs?.tactics) };
}

// ---------- this season's league for 📅 season mode, from the Matchups data (app/data.js), like the 17-0 page ----------
let LEAGUE = null, leagueStamp = 0;
function league() {
  const f = path.join(__dirname, 'app', 'data.js'), m = fs.statSync(f).mtimeMs;
  if (m === leagueStamp) return LEAGUE;
  const s = fs.readFileSync(f, 'utf8'), D = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
  const base = Object.fromEntries(D.teams.map(t => [t, { pf: 0, pa: 0, gp: 0 }])), sched = Object.fromEntries(D.teams.map(t => [t, []]));
  for (const [season, week, , home, away, hs, as] of D.results) {
    if (season !== D.currentSeason || typeof week !== 'number') continue;
    for (const [t, pf, pa] of [[home, hs, as], [away, as, hs]]) if (base[t]) { base[t].gp++; base[t].pf += pf; base[t].pa += pa; }
    sched[home]?.push({ week, opp: away, home: true }); sched[away]?.push({ week, opp: home, home: false });
  }
  for (const [week, home, away] of D.remaining || []) { sched[home]?.push({ week, opp: away, home: true }); sched[away]?.push({ week, opp: home, home: false }); }
  D.teams.forEach(t => sched[t].sort((a, b) => a.week - b.week));
  // offense and defense from points scored / allowed, pulled 30% toward the league average
  const lg = D.teams.reduce((a, t) => a + base[t].pf, 0) / Math.max(1, D.teams.reduce((a, t) => a + base[t].gp, 0));
  const off = Object.fromEntries(D.teams.map(t => [t, base[t].gp ? lg + 0.7 * (base[t].pf / base[t].gp - lg) : lg]));
  const def = Object.fromEntries(D.teams.map(t => [t, base[t].gp ? lg + 0.7 * (base[t].pa / base[t].gp - lg) : lg]));
  const info = t => D.teamInfo?.[t] || {};
  LEAGUE = { season: D.currentSeason, lg, off, def, sched, teams: D.teams.map(t => ({ t, name: info(t).name || t, nick: info(t).nick || t, conf: info(t).conf })) };
  leagueStamp = m;
  return LEAGUE;
}

// ---------- 👑 Legendary pulls (the first time, the Legendaries people already have are added, undated) ----------
function pulls() {
  if (fs.existsSync(PULLS)) return readJson(PULLS, []);
  const list = [];
  for (const p of profiles.all()) for (const c of p.ut?.cards || []) if (isChase(c)) list.push({ at: null, pid: p.id, name: p.name, card: { n: c.n, s: c.s, t: c.t, g: c.g, gr: c.gr } });
  writeJson(PULLS, list);
  return list;
}
// ---------- 🏅 leaderboards ----------
function boards() {
  const rows = profiles.all().filter(p => p.ut?.cards?.length).map(p => {
    const ut = utOf(p), C = cardsOf(ut), R = UT.ratings(C);
    return { pid: p.id, name: p.name, team: ut.team.name, abbr: ut.team.abbr, w: ut.rec.w, l: ut.rec.l, titles: ut.titles, ovr: R.ovr, o: Math.round(R.o), d: Math.round(R.d), full: full(ut) };
  });
  const pct = r => (r.w + r.l ? r.w / (r.w + r.l) : 0);
  return {
    record: rows.filter(r => r.w + r.l > 0).sort((a, b) => b.w - a.w || pct(b) - pct(a) || a.l - b.l),
    overall: rows.filter(r => r.full).sort((a, b) => b.ovr - a.ovr || b.o - a.o),
  };
}
function need(id) { const p = profiles.load(id); if (!p) throw new Error('No such profile.'); utOf(p); return p; }

// the best lineup from a collection: the highest grade at every spot, one card per player
function bestLineup(ut) {
  const used = new Set(), lineup = {};
  for (const [s, g] of UT.SLOTS) {
    const c = ut.cards.filter(x => x.g === g && !used.has(x.k.split('|')[0])).sort((a, b) => b.gr - a.gr)[0];
    if (c) { lineup[s] = c.u; used.add(c.k.split('|')[0]); }
  }
  return lineup;
}
const side = (p, ut) => ({ pid: p.id, name: p.name, team: ut.team.name, abbr: ut.team.abbr, cards: cardsOf(ut), ovr: UT.ratings(cardsOf(ut)).ovr });
// the game plan a request picked (and remember it as the profile's last one)
function planFrom(p, b) { const t = UT.planOf(b.tactics); (p.prefs ||= {}).tactics = t; return t; }
// new cards go into the collection (and the 🏆 set, the pull log and the achievements)
function addCards(p, cards, how, out) {
  p.ut.cards.push(...cards);
  const set = p.sets.ut_cards ||= [];
  for (const c of cards) if (!set.includes(c.k) && set.length < 2000) set.push(c.k);
  const chase = cards.filter(isChase);
  if (chase.length) {
    profiles.award(p, 'ut_legend', out);
    if (chase.some(c => c.gr >= 99)) profiles.award(p, 'ut_mythic', out);
    const at = new Date().toISOString(), before = pulls(); // (pulls() first, so a first-ever log doesn't count these twice)
    writeJson(PULLS, [...chase.map(c => ({ at, pid: p.id, name: p.name, pack: how, card: { n: c.n, s: c.s, t: c.t, g: c.g, gr: c.gr, ed: c.ed } })), ...before].slice(0, 1000));
  }
}

const ACTIONS = {
  team(p, b) {
    const name = String(b.name || '').trim().replace(/\s+/g, ' '), abbr = String(b.abbr || '').trim().toUpperCase();
    if (!name || name.length > 24) throw new Error('Pick a team name between 1 and 24 characters.');
    if (!/^[A-Z0-9]{2,4}$/.test(abbr)) throw new Error('The abbreviation is 2 to 4 letters or numbers.');
    p.ut.team = { name, abbr };
  },
  daily(p) {
    if (p.ut.daily === today()) throw new Error('Already claimed today. Come back tomorrow.');
    p.ut.daily = today();
    profiles.credit(p, UT.DAILY, 'Ultimate Team: daily free points');
  },
  open(p, b, out) {
    const key = b.pack, pack = UT.PACKS[key];
    if (!pack) throw new Error('No such pack.');
    if (key === 'starter') { if (p.ut.starter) throw new Error('The starter pack is only once.'); p.ut.starter = true; p.ut.staff = true; }
    else if (key === 'staff') { if (p.ut.staff) throw new Error('The Staff pack is only once.'); p.ut.staff = true; }
    else {
      if (pack.price > p.balance) throw new Error(`Not enough points: you have ${p.balance}.`);
      p.ledger.push({ at: new Date().toISOString(), pts: -pack.price, reason: `Ultimate Team: ${pack.name}` }); p.balance -= pack.price;
    }
    const cards = UT.openPack(key, pools()).map(c => ({ u: uid(), ...c }));
    addCards(p, cards, pack.name, out.unlocked);
    // open spots in the lineup fill themselves (the whole lineup, after the starter pack)
    const best = bestLineup(p.ut);
    if (key === 'starter') p.ut.lineup = best; else for (const [s] of UT.SLOTS) if (!p.ut.lineup[s] && best[s] && !Object.values(p.ut.lineup).includes(best[s])) p.ut.lineup[s] = best[s];
    profiles.award(p, 'ut_pack', out.unlocked);
    out.cards = cards;
  },
  // 🏆 a collection's team pack: 3 of its 8 cards
  teampack(p, b, out) {
    const col = collections().find(c => c.id === b.id); if (!col) throw new Error('No such collection.');
    const price = UT.TEAM_PACK.price;
    if (price > p.balance) throw new Error(`Not enough points: you have ${p.balance}.`);
    p.ledger.push({ at: new Date().toISOString(), pts: -price, reason: `Ultimate Team: ${col.name} pack` }); p.balance -= price;
    const cards = UT.openTeamPack(col).map(c => ({ u: uid(), ...c }));
    addCards(p, cards, `${col.name} pack`, out.unlocked);
    profiles.award(p, 'ut_pack', out.unlocked);
    out.cards = cards;
  },
  // 🏆 turn a collection in (once): one copy of each of its cards is used up, for points and the star's Mythic edition
  collect(p, b, out) {
    const col = collections().find(c => c.id === b.id); if (!col) throw new Error('No such collection.');
    if (p.ut.collected[col.id]) throw new Error(`You've already turned in the ${col.name}.`);
    const inLineup = new Set(Object.values(p.ut.lineup)), used = [];
    for (const need of col.cards) {
      // the set version (from the team pack) or the card it's made from; set versions go first, so a real 99 is kept if possible
      const copies = p.ut.cards.filter(c => UT.baseKey(c.k) === UT.baseKey(need.k) && !c.ed && !used.includes(c)).sort((a, b) => (b.k === need.k) - (a.k === need.k));
      if (!copies.length) throw new Error(`You still need ${need.n} (${need.s}).`);
      const free = copies.find(c => !inLineup.has(c.u));
      if (!free) throw new Error(`${need.n} is in your lineup: swap that card out first (or get a second copy).`);
      used.push(free);
    }
    p.ut.cards = p.ut.cards.filter(c => !used.includes(c));
    p.ut.collected[col.id] = new Date().toISOString();
    profiles.credit(p, UT.COLLECTION_PTS, `Ultimate Team: turned in the ${col.name} collection`);
    const ed = { u: uid(), ...col.edition };
    addCards(p, [ed], `${col.name} collection`, out.unlocked);
    profiles.award(p, 'ut_collection', out.unlocked);
    if (Object.keys(p.ut.collected).length >= 5) profiles.award(p, 'ut_collections_5', out.unlocked);
    out.cards = [ed];
  },
  // ♻️ trade 5 cards of one rarity (Common, Rare or Epic, none in the lineup) for a random card of the next rarity
  tradeup(p, b, out) {
    const uids = [...new Set(Array.isArray(b.uids) ? b.uids : [])], inLineup = new Set(Object.values(p.ut.lineup));
    const cards = uids.map(u => p.ut.cards.find(c => c.u === u)).filter(Boolean);
    if (cards.length !== UT.TRADE_N) throw new Error(`Pick ${UT.TRADE_N} cards to trade.`);
    if (cards.some(c => inLineup.has(c.u))) throw new Error("Cards in your lineup can't be traded.");
    const from = UT.rarityOf(cards[0].gr).key;
    if (cards.some(c => UT.rarityOf(c.gr).key !== from)) throw new Error('All 5 cards have to be the same rarity.');
    if (!UT.TRADE_UP[from]) throw new Error("Only Common, Rare and Epic cards can be traded up.");
    p.ut.cards = p.ut.cards.filter(c => !cards.includes(c));
    const got = { u: uid(), ...UT.tradeUpCard(pools(), from) };
    addCards(p, [got], 'Trade-up', out.unlocked);
    profiles.award(p, 'ut_tradeup', out.unlocked);
    out.cards = [got];
  },
  lineup(p, b) {
    const want = b.lineup === 'best' ? bestLineup(p.ut) : b.lineup || {}, lineup = {}, players = new Set();
    for (const [s, g] of UT.SLOTS) {
      const u = want[s]; if (!u) continue;
      const c = p.ut.cards.find(x => x.u === u);
      if (!c || c.g !== g) throw new Error(`That card can't play ${s}.`);
      const pl = c.k.split('|')[0];
      if (players.has(pl)) throw new Error(`${c.n} is already in your lineup.`);
      players.add(pl); lineup[s] = u;
    }
    p.ut.lineup = lineup;
  },
  sell(p, b) {
    const inLineup = new Set(Object.values(p.ut.lineup)), uids = new Set(Array.isArray(b.uids) ? b.uids : []);
    const sold = p.ut.cards.filter(c => uids.has(c.u) && !inLineup.has(c.u));
    if (!sold.length) throw new Error('Nothing to sell (cards in your lineup can\'t be sold).');
    p.ut.cards = p.ut.cards.filter(c => !sold.includes(c));
    const pts = sold.reduce((a, c) => a + UT.rarityOf(c.gr).sell, 0);
    profiles.credit(p, pts, `Ultimate Team: sold ${sold.length} card${sold.length > 1 ? 's' : ''}`, { sale: true });
  },
  queue(p, b) {
    const q = readJson(QUEUE, []).filter(e => e.pid !== p.id);
    if (!b.cancel) {
      if (!full(p.ut)) throw new Error('Fill every spot in your lineup first.');
      q.push({ qid: uid(), at: new Date().toISOString(), ...side(p, p.ut), tactics: planFrom(p, b) }); // the game plan stays secret until the game
    }
    writeJson(QUEUE, q);
  },
  challenge(p, b, out) {
    const q = readJson(QUEUE, []), e = q.find(x => x.qid === b.qid);
    if (!e) throw new Error('That game is gone: someone else may have challenged it first.');
    if (e.pid === p.id) throw new Error('You can\'t challenge your own team.');
    if (!full(p.ut)) throw new Error('Fill every spot in your lineup first.');
    const host = profiles.load(e.pid);
    const seed = Math.floor(Math.random() * 2 ** 31), home = { ...e }, away = { ...side(p, p.ut), tactics: planFrom(p, b) };
    delete home.qid;
    const sim = UT.simGame(home, away, seed);
    // 🎁 a card for each side (better odds for the winner); the host's shows up in the replay
    const reward = { home: { u: uid(), ...UT.gameCard(pools(), sim.winner === 'home') }, away: { u: uid(), ...UT.gameCard(pools(), sim.winner === 'away') } };
    const game = { gid: uid() + uid(), at: new Date().toISOString(), seed, home, away, ...sim, reward };
    writeJson(path.join(GDIR, game.gid + '.json'), game);
    writeJson(GAMES, [summaryOf(game), ...readJson(GAMES, [])].slice(0, KEEP_GAMES));
    writeJson(QUEUE, q.filter(x => x !== e));
    // results, points and 🏆 for both teams (the host's unlocks show on their Achievements page)
    const settle = (pr, mine, list) => {
      const won = sim.winner === mine, them = mine === 'home' ? away : home, sc = `${Math.max(sim.hs, sim.as)}-${Math.min(sim.hs, sim.as)}`;
      utOf(pr).rec[won ? 'w' : 'l']++;
      profiles.credit(pr, won ? UT.REWARD.win : UT.REWARD.loss, `Ultimate Team: ${won ? 'beat' : 'lost to'} ${them.team} ${sc}`);
      if (won) {
        pr.counters.ut_wins = (pr.counters.ut_wins || 0) + 1;
        profiles.award(pr, 'ut_win', list);
        if ((mine === 'home' ? sim.as : sim.hs) === 0) profiles.award(pr, 'ut_shutout', list);
        if (sim.comeback >= 14) profiles.award(pr, 'ut_comeback', list);
      }
      profiles.checkGoals(pr, list);
    };
    if (host) { settle(host, 'home', []); addCards(host, [reward.home], 'Game reward', []); host.ut.unseen = [game.gid, ...host.ut.unseen].slice(0, 20); profiles.save(host); }
    settle(p, 'away', out.unlocked);
    addCards(p, [reward.away], 'Game reward', out.unlocked);
    out.game = game;
  },
  seen(p, b) { p.ut.unseen = p.ut.unseen.filter(g => g !== b.gid); },
  // 🤖 a game against a bot: played right away, not listed with the results. Wins pay by level, up to BOT_CAP a day.
  bot(p, b, out) {
    const B = UT.BOTS[b.level]; if (!B) throw new Error('No such bot.');
    if (!full(p.ut)) throw new Error('Fill every spot in your lineup first.');
    const ut = p.ut; if (ut.bot.day !== today()) { ut.bot.day = today(); ut.bot.pts = 0; }
    const bot = UT.makeBot(pools(), b.level), seed = Math.floor(Math.random() * 2 ** 31);
    const home = { ...side(p, ut), tactics: planFrom(p, b) }, away = { pid: null, ...bot };
    const sim = UT.simGame(home, away, seed), won = sim.winner === 'home';
    const reward = won ? Math.max(0, Math.min(B.reward, UT.BOT_CAP - ut.bot.pts)) : 0;
    const rec = (ut.bot.rec[b.level] ||= { w: 0, l: 0 }); rec[won ? 'w' : 'l']++;
    if (reward) { ut.bot.pts += reward; profiles.credit(p, reward, `Ultimate Team: beat the ${B.name} bot ${sim.hs}-${sim.as}`); }
    if (won && b.level === 'hard') profiles.award(p, 'ut_bot_hard', out.unlocked);
    out.game = { gid: null, at: new Date().toISOString(), seed, home, away, ...sim, bot: b.level, reward, capped: won && reward < B.reward };
  },
  // 📅 one season a day with your lineup, on a real franchise's schedule
  season(p, b, out) {
    const ut = p.ut, L = league();
    if (ut.seasonDay === today()) throw new Error("You've played today's season. The next one is tomorrow.");
    if (!full(ut)) throw new Error('Fill every spot in your lineup first.');
    if (!L.sched[b.team]?.length) throw new Error("Pick a team's schedule to play.");
    const s = UT.simSeason(cardsOf(ut), L, b.team, Math.floor(Math.random() * 2 ** 31));
    const lost = s.post.find(g => !g.w), recStr = `${s.wins}-${s.losses}${s.ties ? '-' + s.ties : ''}`;
    const how = s.perfect ? 'a perfect season' : s.champ ? 'Super Bowl champs' : lost ? `out in the ${lost.round}` : 'missed the playoffs';
    ut.seasonDay = today();
    ut.seasons = [{ at: new Date().toISOString(), team: ut.team, name: L.teams.find(x => x.t === b.team)?.name, ...s }, ...ut.seasons].slice(0, 20);
    if (s.champ) ut.titles++;
    profiles.credit(p, s.reward, `Ultimate Team season: ${recStr}, ${how}`);
    profiles.award(p, 'ut_season', out.unlocked);
    if (s.champ) profiles.award(p, 'ut_ring', out.unlocked);
    if (s.perfect) profiles.award(p, 'ut_perfect', out.unlocked);
    out.season = ut.seasons[0];
  },
};
const summaryOf = g => ({ gid: g.gid, at: g.at, hs: g.hs, as: g.as, ot: g.ot, winner: g.winner,
  home: { pid: g.home.pid, name: g.home.name, team: g.home.team, abbr: g.home.abbr, ovr: g.home.ovr },
  away: { pid: g.away.pid, name: g.away.name, team: g.away.team, abbr: g.away.abbr, ovr: g.away.ovr } });

//   GET  /api/ut                     the open queue and recent results
//   GET  /api/ut/<id>                the same, plus that profile's team, cards and lineup
//   GET  /api/ut/game/<game id>      one game in full (to replay it)
//   POST /api/ut/<id>/<action>       team {name, abbr} · daily · open {pack} · lineup {lineup | 'best'} · sell {uids} · tradeup {uids}
//                                    queue {cancel?, tactics} · challenge {qid, tactics} · seen {gid} · bot {level, tactics} · season {team}
//                                    teampack {id} · collect {id}        (tactics = { off, def, tempo }, see UT.TACTICS)
function handle(req, url, body) {
  const [, , , a, b] = url.split('/'); // '', 'api', 'ut', a, b
  if (req.method === 'GET') {
    if (a === 'game') { const g = /^[a-z0-9]{1,32}$/.test(b) && readJson(path.join(GDIR, b + '.json'), null); if (!g) throw new Error('No such game.'); return { game: g }; }
    const P = pulls(), who = {};
    for (const x of P) { const w = (who[x.pid] ||= { pid: x.pid, name: x.name, n: 0, best: x.card }); w.n++; if (x.card.gr > w.best.gr) w.best = x.card; }
    // (a queued team's game plan is never sent: the challenger picks theirs blind)
    const out = { queue: readJson(QUEUE, []).map(({ cards, tactics, ...e }) => ({ ...e, lineup: UT.SLOTS.map(([s]) => cards[s] && [s, cards[s].n, cards[s].gr]).filter(Boolean) })), games: readJson(GAMES, []).slice(0, 60),
      // the collections, logos and team list only change with a data refresh: the page's 10-second check skips them (?lite)
      ...(new URL(req.url, 'http://x').searchParams.has('lite') ? {} : { collections: collections().map(({ star, ...c }) => c), logos: (pools(), LOGOS) }),
      boards: boards(), pulls: P.slice(0, 40), pullers: Object.values(who).sort((a, b) => b.n - a.n || b.best.gr - a.best.gr),
      ...(new URL(req.url, 'http://x').searchParams.has('lite') ? {} : { teams: league().teams.map(({ t, name }) => ({ t, name })).sort((a, b) => a.name.localeCompare(b.name)) }) };
    if (a) out.me = state(need(a));
    return out;
  }
  if (req.method === 'POST' && a && ACTIONS[b]) {
    const p = need(a), out = { unlocked: [] };
    ACTIONS[b](p, body || {}, out);
    profiles.save(p);
    return { ...out, me: state(p) };
  }
  throw new Error('Unknown Ultimate Team request.');
}
module.exports = { handle };
