// 🃏 Ultimate Team on the server: team names, daily points, packs, lineups, the challenge queue and games, in two modes:
//   permanent (the "ut" section of a profile)   and   🗓️ seasonal (the "sea" section, reset every two weeks)
// Each profile gets a "ut" section:
//   { team: { name, abbr }, cards: [card], lineup: { slot: card id }, comp: { slot: card id } (⚔ competitive lineup),
//     starter: true once the free pack is opened, daily: 'YYYY-MM-DD' last claimed, rec: { w, l },
//     unseen: [game ids someone played against your queued team], bot: { rec: { level: { w, l } }, day, pts },
//     seasonDay, seasons: [last 20 schedule runs], titles, staff, rookie, collected: { collection id: when turned in } }
// and, while a season is on, a "sea" section with the same kind of fields for that season (its own cards, lineup and
// record), plus n (which season), coins, xp, got (milestones reached) and xpDay. The team name is shared.
// New fields are added the first time an older profile is used, so nothing anyone has is ever reset.
// Shared state sits next to the profiles in "testnfl profiles\ultimate": queue.json (open games), games.json (a list
// of recent results), games\<id>.json (each game in full, so it replays exactly), pulls.json (every Legendary pull)
// and seasons.json (finished seasons' final standings).
// The server opens packs and plays the games, so nobody gets a better pack or result by refreshing.
const fs = require('fs');
const path = require('path');
const profiles = require('./profiles');
const UT = require('./app/ultimate.js');
const ACH = require('./app/achievements.js');

const UDIR = path.join(profiles.DIR, 'ultimate'), GDIR = path.join(UDIR, 'games');
fs.mkdirSync(GDIR, { recursive: true });
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { fs.writeFileSync(f + '.tmp', JSON.stringify(v)); fs.renameSync(f + '.tmp', f); };
const QUEUE = path.join(UDIR, 'queue.json'), GAMES = path.join(UDIR, 'games.json'), PULLS = path.join(UDIR, 'pulls.json'), SEASONS = path.join(UDIR, 'seasons.json');
const KEEP_GAMES = 500; // results listed (every game file is kept)
// VM_SEASON_EPOCH (milliseconds) moves the season calendar, for testing; normally Season 1 starts on UT.SEASON.epoch
const EPOCH = +process.env.VM_SEASON_EPOCH || UT.SEASON.epoch;
const seasonNow = () => UT.seasonNow(Date.now(), EPOCH), span = n => UT.seasonSpan(n, EPOCH);

// the card pool comes from the 17-0 data, re-read after a refresh rebuilds it
let POOLS = null, COLLECTIONS = [], HEADS = {}, LOGOS = {}, COLORS = {}, poolStamp = 0;
function pools() {
  const f = path.join(__dirname, 'app', 'perfect.js'), m = fs.statSync(f).mtimeMs;
  if (m !== poolStamp) {
    const s = fs.readFileSync(f, 'utf8'), P = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
    POOLS = UT.makePools(P); COLLECTIONS = UT.makeCollections(P, POOLS); HEADS = P.heads || {}; LOGOS = P.logos || {}; COLORS = P.colors || {}; poolStamp = m;
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
  ut.bot ||= { rec: {}, day: '', pts: 0 }; ut.seasons ||= []; ut.seasonDay ||= ''; ut.titles ||= 0; ut.collected ||= {}; ut.comp ||= {};
  if (ut.staff === undefined) ut.staff = false; // the Staff pack is for everyone, including teams made before coaches and stadiums
  // 📸 cards opened before cards had photos get their player's headshot
  pools(); for (const c of ut.cards) { const h = HEADS[c.k.split('|')[0]]; if (h && c.h !== h) c.h = h; }
  return ut;
}
// 🗓️ this season's section of a profile (a fresh one if it's from an older season, which finalizeSeasons has wrapped up)
function seaOf(p) {
  const n = seasonNow(); if (!n) return null;
  if (!p.sea || p.sea.n !== n) p.sea = { n, cards: [], lineup: {}, comp: {}, starter: false, daily: '', coins: UT.SEASON.coins, rec: { w: 0, l: 0, pf: 0, pa: 0 }, unseen: [], bot: { rec: {}, day: '', pts: 0 }, xp: 0, got: [], xpDay: { day: '', games: 0 } };
  p.sea.team = utOf(p).team; // the team name is shared between the modes
  return p.sea;
}
// which: 'main' (the lineup) or 'comp' (the ⚔ competitive lineup)
const cardsOf = (ut, which = 'main') => Object.fromEntries(Object.entries(which === 'comp' ? ut.comp || {} : ut.lineup).map(([s, u]) => [s, ut.cards.find(c => c.u === u)]).filter(([, c]) => c));
const held = ut => new Set([...Object.values(ut.lineup), ...Object.values(ut.comp || {})]); // cards in either lineup can't be sold, traded or turned in
const full = ut => UT.REQUIRED.every(([s]) => cardsOf(ut)[s]); // the 11 players (coach and stadium are optional)

// ---------- the two modes behind one set of actions: whose cards, and what money ----------
// ctx = { mode, ut (the cards, lineup and record being played with), unit, balance(), spend(n, why), earn(n, why, extra), add(cards, how, unlocked) }
function ctxOf(p, mode) {
  if (mode === 'season') {
    const sea = seaOf(p); if (!sea) throw new Error(`Seasonal mode starts ${new Date(EPOCH).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.`);
    return { mode, ut: sea, unit: 'coins', balance: () => sea.coins,
      spend: n => { if (n > sea.coins) throw new Error(`Not enough coins: you have ${sea.coins}.`); sea.coins -= n; },
      earn: n => { sea.coins += n; return n; }, add: cards => { sea.cards.push(...cards); } };
  }
  const ut = utOf(p);
  return { mode: 'main', ut, unit: 'points', balance: () => p.balance,
    spend: (n, why) => { if (n > p.balance) throw new Error(`Not enough points: you have ${p.balance}.`); p.ledger.push({ at: new Date().toISOString(), pts: -n, reason: why }); p.balance -= n; },
    earn: (n, why, extra) => profiles.credit(p, n, why, extra), add: (cards, how, unlocked) => addCards(p, cards, how, unlocked) };
}

function state(p, mode = 'main') {
  if (mode === 'season') {
    const sea = seaOf(p);
    if (!sea) return { mode, unit: 'coins', season: { n: 0, starts: EPOCH } };
    const n = sea.n, sp = span(n), last = readJson(SEASONS, { results: {} }).results[n - 1];
    return { mode, unit: 'coins', team: sea.team, cards: sea.cards, lineup: sea.lineup, comp: {}, compErr: null, starter: sea.starter, staff: true, collected: {},
      dailyReady: sea.daily !== today(), daily: UT.SEASON.daily, rec: sea.rec, unseen: sea.unseen, balance: sea.coins, points: p.balance, packs: ['season'],
      bot: { rec: sea.bot.rec, ptsToday: sea.bot.day === today() ? sea.bot.pts : 0 }, live: sea.live ? livePublic(sea.live) : null, tactics: UT.planOf(p.prefs?.tactics), balanced: !!p.prefs?.balanced,
      season: { n, starts: sp.starts, ends: sp.ends, xp: sea.xp, got: sea.got, doubleLeft: Math.max(0, UT.SEASON.doubleXp - (sea.xpDay.day === today() ? sea.xpDay.games : 0)),
        cards: UT.seasonCards(pools(), n), board: seasonBoard(n), last: last ? { n: last.n, champion: last.standings.find(r => r.pid === last.champion) || null, top: last.standings.slice(0, 5) } : null } };
  }
  const ut = utOf(p);
  return { mode, unit: 'points', team: ut.team, cards: ut.cards, lineup: ut.lineup, starter: ut.starter, dailyReady: ut.daily !== today(), daily: UT.DAILY, rec: ut.rec, unseen: ut.unseen, balance: p.balance,
    packs: ['standard', 'premium', 'legend'], bot: { rec: ut.bot.rec, ptsToday: ut.bot.day === today() ? ut.bot.pts : 0 }, live: ut.live ? livePublic(ut.live) : null, seasonReady: ut.seasonDay !== today(), seasons: ut.seasons.slice(0, 10), titles: ut.titles,
    staff: ut.staff, collected: ut.collected, tactics: UT.planOf(p.prefs?.tactics), balanced: !!p.prefs?.balanced, competitive: !!p.prefs?.competitive,
    comp: ut.comp, compErr: UT.compCheck(cardsOf(ut, 'comp')),
    rookie: { earned: profiles.earnedOf(p), until: profiles.ROOKIE_UNTIL, bundle: !ut.rookie && profiles.earnedOf(p) < profiles.ROOKIE_UNTIL } };
}

// ---------- 🗓️ seasons: standings, XP and milestones, and wrapping a season up ----------
// the season's standings: the best record against players (wins minus losses, then wins, then point differential)
const standing = (a, b) => (b.w - b.l) - (a.w - a.l) || b.w - a.w || b.diff - a.diff || b.xp - a.xp;
function seasonBoard(n) {
  return profiles.all().filter(p => p.sea?.n === n && (p.sea.xp > 0 || p.sea.rec.w + p.sea.rec.l > 0)).map(p => ({ pid: p.id, name: p.name, team: p.sea.team?.name || p.ut?.team?.name || '', abbr: p.sea.team?.abbr || '',
    w: p.sea.rec.w, l: p.sea.rec.l, diff: (p.sea.rec.pf || 0) - (p.sea.rec.pa || 0), xp: p.sea.xp, ovr: UT.ratings(cardsOf(p.sea)).ovr })).sort(standing);
}
// XP for a seasonal game (the first SEASON.doubleXp games of a day count double), and any milestones it reaches
function addXp(p, sea, base, unlocked, reached = []) {
  const d = today(); if (sea.xpDay.day !== d) sea.xpDay = { day: d, games: 0 };
  const xp = base * (sea.xpDay.games < UT.SEASON.doubleXp ? 2 : 1);
  sea.xpDay.games++; sea.xp += xp;
  UT.SEASON.milestones.forEach((m, i) => {
    if (sea.got.includes(i) || sea.xp < m.xp) return;
    sea.got.push(i);
    const why = `Season ${sea.n} milestone: ${UT.milestoneText(m, sea.n)}`;
    if (m.pts) profiles.credit(p, m.pts, why);
    if (m.pack) for (let k = 0; k < (m.n || 1); k++) addCards(p, UT.openPack(m.pack, pools()).map(c => ({ u: uid(), ...c })), `Season ${sea.n} milestone`, unlocked);
    if (m.title) addTitle(p, `s${sea.n}-vet`, `Season ${sea.n} Veteran`, '🗓️');
    if (m.mythic) { addCards(p, [{ u: uid(), ...UT.seasonCards(pools(), sea.n).track }], `Season ${sea.n} milestones`, unlocked); profiles.award(p, 'sea_track', unlocked); }
    reached.push(UT.milestoneText(m, sea.n));
  });
  return { xp, reached };
}
const addTitle = (p, key, name, icon) => { p.titles ||= []; if (!p.titles.some(t => t.key === key)) p.titles.push({ key, name, icon }); };
// a finished season: final standings, the champion's Mythic and title, everyone's rank in their history, and a fresh start
function finalize(n) {
  const rows = seasonBoard(n), champ = rows[0] && rows[0].w + rows[0].l > 0 ? rows[0] : null;
  rows.forEach((r, i) => {
    const p = profiles.load(r.pid); utOf(p);
    (p.seasonHistory ||= []).unshift({ n, rank: i + 1, of: rows.length, w: r.w, l: r.l, xp: r.xp, champ: r === champ });
    if (r === champ) {
      addCards(p, [{ u: uid(), ...UT.seasonCards(pools(), n).champ }], `Season ${n} champion`, []);
      addTitle(p, `s${n}-champ`, `Season ${n} Champion`, '🏆');
      profiles.award(p, 'sea_champ', []);
    }
    delete p.sea;
    profiles.save(p);
  });
  return { n, at: new Date().toISOString(), champion: champ?.pid || null, standings: rows };
}
// wrap up any season that has ended (run before every Ultimate Team request, so it happens the first time anyone shows up)
function finalizeSeasons() {
  const cur = seasonNow(), st = readJson(SEASONS, { done: 0, results: {} });
  if (st.done >= cur - 1) return;
  for (let n = st.done + 1; n < cur; n++) { st.results[n] = finalize(n); st.done = n; }
  writeJson(SEASONS, st);
  writeJson(QUEUE, readJson(QUEUE, []).filter(e => !e.seasonal || e.seasonal >= cur)); // last season's queued teams are gone
}

// ---------- this season's league for 📅 schedule runs, from the Matchups data (app/data.js), like the 17-0 page ----------
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
// what the hover popup on a player's name shows: title, records, points, last season and their showcase (pictures included)
function userCard(id) {
  const p = profiles.load(id); if (!p) throw new Error('No such profile.');
  const ut = utOf(p), byU = new Map(ut.cards.map(c => [c.u, c]));
  const chosen = (p.showcase?.cards || []).map(u => byU.get(u)).filter(Boolean), show = chosen.length ? chosen : ut.cards.slice().sort((a, b) => b.gr - a.gr).slice(0, 5);
  pools();
  const bot = Object.values(ut.bot.rec).reduce((s, x) => ({ w: s.w + x.w, l: s.l + x.l }), { w: 0, l: 0 });
  const picks = Object.values(p.pickem?.[Object.keys(p.pickem || {}).sort().pop()] || {}).filter(x => x.res);
  return { id: p.id, name: p.name, title: profiles.titleText(p), team: ut.team, earned: profiles.earnedOf(p), rec: ut.rec, bot, titles: ut.titles,
    pickem: { w: picks.filter(x => x.res === 'W').length, l: picks.filter(x => x.res === 'L').length }, achievements: Object.keys(p.achievements).length,
    lastSeason: p.seasonHistory?.[0] || null,
    showcase: show.map(c => ({ n: c.n, gr: c.gr, g: c.g, color: UT.rarityOf(c.gr).color, pic: UT.photos(c, LOGOS)[0] || '' })) };
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
const side = (p, ut, which = 'main') => ({ pid: p.id, name: p.name, team: ut.team.name, abbr: ut.team.abbr, cards: cardsOf(ut, which), ovr: UT.ratings(cardsOf(ut, which)).ovr });
// the game plan a request picked (and remember it as the profile's last one)
function planFrom(p, b) { const t = UT.planOf(b.tactics); (p.prefs ||= {}).tactics = t; return t; }
// new permanent cards go into the collection (and the 🏆 set, the pull log and the achievements)
function addCards(p, cards, how, out) {
  utOf(p).cards.push(...cards);
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
const permanentOnly = ctx => { if (ctx.mode === 'season') throw new Error("That's for the permanent collection, not seasonal mode."); };

// every action gets (profile, request body, out, ctx): ctx is the mode's cards and money (see ctxOf)
const ACTIONS = {
  team(p, b) {
    const name = String(b.name || '').trim().replace(/\s+/g, ' '), abbr = String(b.abbr || '').trim().toUpperCase();
    if (!name || name.length > 24) throw new Error('Pick a team name between 1 and 24 characters.');
    if (!/^[A-Z0-9]{2,4}$/.test(abbr)) throw new Error('The abbreviation is 2 to 4 letters or numbers.');
    utOf(p).team = { name, abbr };
    if (p.sea) p.sea.team = p.ut.team;
  },
  daily(p, b, out, ctx) {
    const ut = ctx.ut;
    if (ut.daily === today()) throw new Error('Already claimed today. Come back tomorrow.');
    ut.daily = today();
    if (ctx.mode === 'season') ctx.earn(UT.SEASON.daily); else ctx.earn(UT.DAILY, 'Ultimate Team: daily free points', { boost: true });
  },
  open(p, b, out, ctx) {
    const key = b.pack, pack = UT.PACKS[key], ut = ctx.ut;
    if (!pack) throw new Error('No such pack.');
    if (ctx.mode === 'season' && key !== 'starter' && key !== 'season') throw new Error('Seasonal mode only has the starter pack and the Season pack.');
    if (ctx.mode === 'main' && key === 'season') throw new Error('The Season pack is for seasonal mode.');
    if (key === 'starter') { if (ut.starter) throw new Error('The starter pack is only once.'); ut.starter = true; ut.staff = true; }
    else if (key === 'rookie') {
      if (ut.rookie) throw new Error('The Rookie bundle is only once.');
      if (profiles.earnedOf(p) >= profiles.ROOKIE_UNTIL) throw new Error('The Rookie bundle is for new players.');
      ut.rookie = true;
    }
    else if (key === 'staff') { if (ut.staff) throw new Error('The Staff pack is only once.'); ut.staff = true; }
    else ctx.spend(pack.price, `Ultimate Team: ${pack.name}`);
    const cards = UT.openPack(key, pools()).map(c => ({ u: uid(), ...c }));
    ctx.add(cards, pack.name, out.unlocked);
    // open spots in the lineup fill themselves (the whole lineup, after the starter pack)
    const best = bestLineup(ut);
    if (key === 'starter') ut.lineup = best; else for (const [s] of UT.SLOTS) if (!ut.lineup[s] && best[s] && !Object.values(ut.lineup).includes(best[s])) ut.lineup[s] = best[s];
    if (ctx.mode === 'main') profiles.award(p, 'ut_pack', out.unlocked);
    out.cards = cards;
  },
  // 🏆 a collection's team pack: 1 of its 8 cards + 4 at Standard pack odds
  teampack(p, b, out, ctx) {
    permanentOnly(ctx);
    const col = collections().find(c => c.id === b.id); if (!col) throw new Error('No such collection.');
    ctx.spend(UT.TEAM_PACK.price, `Ultimate Team: ${col.name} pack`);
    const cards = UT.openTeamPack(col, pools()).map(c => ({ u: uid(), ...c }));
    addCards(p, cards, `${col.name} pack`, out.unlocked);
    profiles.award(p, 'ut_pack', out.unlocked);
    out.cards = cards;
  },
  // 🏆 turn a collection in (once): one copy of each of its cards is used up, for points and the star's Mythic edition
  collect(p, b, out, ctx) {
    permanentOnly(ctx);
    const col = collections().find(c => c.id === b.id); if (!col) throw new Error('No such collection.');
    if (p.ut.collected[col.id]) throw new Error(`You've already turned in the ${col.name}.`);
    const inLineup = held(p.ut), used = [];
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
  tradeup(p, b, out, ctx) {
    permanentOnly(ctx);
    const uids = [...new Set(Array.isArray(b.uids) ? b.uids : [])], inLineup = held(p.ut);
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
  lineup(p, b, out, ctx) {
    const ut = ctx.ut, comp = b.which === 'comp' && ctx.mode === 'main'; // the ⚔ competitive lineup: just the eleven players
    const want = b.lineup === 'best' ? (comp ? Object.fromEntries(Object.entries(UT.compBest(ut.cards)).map(([s, c]) => [s, c.u])) : bestLineup(ut)) : b.lineup || {}, lineup = {}, players = new Set();
    for (const [s, g] of comp ? UT.REQUIRED : UT.SLOTS) {
      const u = want[s]; if (!u) continue;
      const c = ut.cards.find(x => x.u === u);
      if (!c || c.g !== g) throw new Error(`That card can't play ${s}.`);
      const pl = c.k.split('|')[0];
      if (players.has(pl)) throw new Error(`${c.n} is already in your lineup.`);
      players.add(pl); lineup[s] = u;
    }
    if (comp) ut.comp = lineup; else ut.lineup = lineup;
  },
  sell(p, b, out, ctx) {
    const ut = ctx.ut, inLineup = held(ut), uids = new Set(Array.isArray(b.uids) ? b.uids : []);
    const sold = ut.cards.filter(c => uids.has(c.u) && !inLineup.has(c.u));
    if (!sold.length) throw new Error('Nothing to sell (cards in your lineup can\'t be sold).');
    ut.cards = ut.cards.filter(c => !sold.includes(c));
    const pts = sold.reduce((a, c) => a + UT.rarityOf(c.gr).sell, 0);
    ctx.earn(pts, `Ultimate Team: sold ${sold.length} card${sold.length > 1 ? 's' : ''}`, { sale: true });
  },
  queue(p, b, out, ctx) {
    const q = readJson(QUEUE, []).filter(e => !(e.pid === p.id && !!e.seasonal === (ctx.mode === 'season'))); // one open game per mode
    if (!b.cancel) {
      const ut = ctx.ut, sn = ctx.mode === 'season' ? ut.n : 0;
      // ⚔ a competitive game: your competitive lineup, double points for both sides (permanent mode only)
      const competitive = !sn && !!b.competitive, err = competitive ? UT.compCheck(cardsOf(ut, 'comp')) : !full(ut) && 'Fill every spot in your lineup first.';
      if (err) throw new Error(err);
      if (!sn) (p.prefs ||= {}).competitive = competitive;
      // ⚖️ a balanced game: no game plans for either side (marked on the queue, so the challenger skips the plan screen too)
      const balanced = !!b.balanced;
      (p.prefs ||= {}).balanced = balanced;
      q.push({ qid: uid(), at: new Date().toISOString(), ...side(p, ut, competitive ? 'comp' : 'main'), balanced, competitive, ...(sn ? { seasonal: sn } : {}), tactics: balanced ? { ...UT.DEFAULT_PLAN } : planFrom(p, b) }); // the game plan stays secret until the game
    }
    writeJson(QUEUE, q);
  },
  challenge(p, b, out, ctx) {
    const q = readJson(QUEUE, []), e = q.find(x => x.qid === b.qid);
    if (!e) throw new Error('That game is gone: someone else may have challenged it first.');
    if (e.pid === p.id) throw new Error('You can\'t challenge your own team.');
    const seasonal = ctx.mode === 'season';
    if (!!e.seasonal !== seasonal || (seasonal && e.seasonal !== ctx.ut.n)) throw new Error(seasonal ? "That's a permanent-mode game." : "That's a seasonal game: switch to seasonal mode to play it.");
    const ut = ctx.ut, err = e.competitive ? UT.compCheck(cardsOf(ut, 'comp')) : !full(ut) && 'Fill every spot in your lineup first.';
    if (err) throw new Error(err);
    const host = profiles.load(e.pid);
    const seed = Math.floor(Math.random() * 2 ** 31), home = { ...e }, away = { ...side(p, ut, e.competitive ? 'comp' : 'main'), tactics: e.balanced ? { ...UT.DEFAULT_PLAN } : planFrom(p, b) };
    delete home.qid;
    const sim = { ...UT.simGame(home, away, seed), ...(e.balanced ? { balanced: true } : {}), ...(e.competitive ? { competitive: true } : {}), ...(seasonal ? { seasonal: e.seasonal } : {}) };
    // 🎁 a card for each side (better odds for the winner); the host's shows up in the replay. Seasonal games give seasonal cards.
    const reward = { home: { u: uid(), ...UT.gameCard(pools(), sim.winner === 'home') }, away: { u: uid(), ...UT.gameCard(pools(), sim.winner === 'away') } };
    const game = { gid: uid() + uid(), at: new Date().toISOString(), seed, home, away, ...sim, reward };
    writeJson(path.join(GDIR, game.gid + '.json'), game);
    writeJson(GAMES, [summaryOf(game), ...readJson(GAMES, [])].slice(0, KEEP_GAMES));
    writeJson(QUEUE, q.filter(x => x !== e));
    // results, points (or coins and XP) and 🏆 for both teams (the host's unlocks show on their Achievements page)
    const settle = (pr, mine, list) => {
      const won = sim.winner === mine, them = mine === 'home' ? away : home, sc = `${Math.max(sim.hs, sim.as)}-${Math.min(sim.hs, sim.as)}`;
      if (seasonal) {
        const sea = seaOf(pr), us = mine === 'home' ? sim.hs : sim.as, opp = mine === 'home' ? sim.as : sim.hs;
        sea.rec[won ? 'w' : 'l']++; sea.rec.pf = (sea.rec.pf || 0) + us; sea.rec.pa = (sea.rec.pa || 0) + opp;
        sea.coins += won ? UT.SEASON.win : UT.SEASON.loss;
        const x = addXp(pr, sea, won ? UT.SEASON.xp.win : UT.SEASON.xp.loss, list);
        sea.cards.push(reward[mine]);
        return x;
      }
      utOf(pr).rec[won ? 'w' : 'l']++;
      profiles.credit(pr, (won ? UT.REWARD.win : UT.REWARD.loss) * (sim.competitive ? UT.COMP.mult : 1), `Ultimate Team${sim.competitive ? ' ⚔' : ''}: ${won ? 'beat' : 'lost to'} ${them.team} ${sc}`, { boost: true });
      if (won) {
        pr.counters.ut_wins = (pr.counters.ut_wins || 0) + 1;
        profiles.award(pr, 'ut_win', list);
        if ((mine === 'home' ? sim.as : sim.hs) === 0) profiles.award(pr, 'ut_shutout', list);
        if (sim.comeback >= 14) profiles.award(pr, 'ut_comeback', list);
      }
      profiles.checkGoals(pr, list);
      addCards(pr, [reward[mine]], 'Game reward', list);
    };
    if (host) { settle(host, 'home', []); const hu = seasonal ? seaOf(host) : host.ut; hu.unseen = [game.gid, ...hu.unseen].slice(0, 20); profiles.save(host); }
    const x = settle(p, 'away', out.unlocked);
    if (x) out.xp = x;
    out.game = game;
  },
  seen(p, b, out, ctx) { ctx.ut.unseen = ctx.ut.unseen.filter(g => g !== b.gid); },
  // 🤖 a game against a bot: played right away, not listed with the results. A win pays that bot's flat amount
  // (UT.BOTS[level].pay: 10, 20, 30 or 50), with no limit. In seasonal mode it pays coins and XP.
  // 🎮 b.live: a live game instead, played a call at a time with the "live" action (one at a time per mode; asking for
  // another while one is going just brings it back)
  bot(p, b, out, ctx) {
    const B = UT.BOTS[b.level]; if (!B) throw new Error('No such bot.');
    const ut = ctx.ut;
    if (!full(ut)) throw new Error('Fill every spot in your lineup first.');
    if (b.live && ut.live) { out.live = livePublic(ut.live); return; }
    const bot = UT.makeBot(pools(), b.level), seed = Math.floor(Math.random() * 2 ** 31);
    const home = { ...side(p, ut), tactics: planFrom(p, b) }, away = { pid: null, ...bot };
    if (b.live) {
      ut.live = { level: b.level, seed, at: new Date().toISOString(), home, away, moments: UT.liveMoments(seed), i: 0, done: [], extras: [] };
      out.live = livePublic(ut.live);
      return;
    }
    settleBot(p, ut, ctx, b.level, home, away, seed, UT.simGame(home, away, seed), null, out);
  },
  // 🎮 a call at the current moment of the live game ({ call }), or { sim: true } to let the rest play out on random calls
  live(p, b, out, ctx) {
    const ut = ctx.ut, L = ut.live; if (!L) throw new Error('No live game going. Start one from the 🤖 Bots tab.');
    const step = call => {
      const m = L.moments[L.i];
      if (!m.kind) m.kind = UT.finalKind(scoreAt(L, m).diff);
      const calls = UT.callsFor(m.kind);
      if (!calls.includes(call)) throw new Error("That call isn't one of the options.");
      const me = { cards: L.home.cards, abbr: L.home.abbr, team: 'home' }, them = { cards: L.away.cards, abbr: L.away.abbr, team: 'away' };
      const r = UT.liveResolve(m, call, me, them);
      L.extras.push(...r.extras);
      L.done.push({ kind: m.kind, q: m.q, t: m.t, call, off: r.off, def: r.def, ok: r.ok, good: r.good, odds: r.odds, vs: r.vs, text: r.text });
      L.i++;
      if (L.i < L.moments.length && !L.moments[L.i].kind) L.moments[L.i].kind = UT.finalKind(scoreAt(L, L.moments[L.i]).diff);
    };
    if (b.sim) while (L.i < L.moments.length) { const m = L.moments[L.i], c = UT.callsFor(m.kind || UT.finalKind(scoreAt(L, m).diff)).filter(x => x !== 'punt'); step(c[Math.floor(Math.random() * c.length)]); }
    else step(String(b.call || ''));
    out.result = L.done[L.done.length - 1];
    if (L.i < L.moments.length) { out.live = livePublic(L); return; }
    // the end: the whole game with every call in it, paid like a bot game × UT.LIVE.mult
    const sim = UT.simGame(L.home, L.away, L.seed, { live: { scale: UT.LIVE.scale, extras: L.extras, final: true } });
    delete ut.live;
    settleBot(p, ut, ctx, L.level, L.home, L.away, L.seed, sim, L.done, out);
  },
  // 📅 one schedule run a day with your lineup, on a real franchise's schedule
  season(p, b, out, ctx) {
    permanentOnly(ctx);
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
    profiles.credit(p, s.reward, `Ultimate Team season: ${recStr}, ${how}`, { boost: true });
    profiles.award(p, 'ut_season', out.unlocked);
    if (s.champ) profiles.award(p, 'ut_ring', out.unlocked);
    if (s.perfect) profiles.award(p, 'ut_perfect', out.unlocked);
    out.season = ut.seasons[0];
  },
};
// a finished bot game (moments: a 🎮 live game's calls, which pays UT.LIVE.mult × and gives that much XP)
function settleBot(p, ut, ctx, level, home, away, seed, sim, moments, out) {
  const B = UT.BOTS[level], won = sim.winner === 'home', mult = moments ? UT.LIVE.mult : 1;
  if (ut.bot.day !== today()) { ut.bot.day = today(); ut.bot.pts = 0; }
  let reward = 0;
  const rec = (ut.bot.rec[level] ||= { w: 0, l: 0 }); rec[won ? 'w' : 'l']++;
  if (won) { reward = ctx.earn(UT.botPay(home.cards, level) * mult, `Ultimate Team${moments ? ' 🎮' : ''}: beat the ${B.name} bot ${sim.hs}-${sim.as}`, { boost: true }); ut.bot.pts += reward; }
  if (ctx.mode === 'season') out.xp = addXp(p, ut, (won ? UT.SEASON.xp.botWin : UT.SEASON.xp.botLoss) * mult, out.unlocked);
  else if (won && level === 'hard') profiles.award(p, 'ut_bot_hard', out.unlocked);
  out.game = { gid: null, at: new Date().toISOString(), seed, home, away, ...sim, bot: level, reward, ...(moments ? { live: true, moments } : {}), ...(ctx.mode === 'season' ? { seasonal: ut.n } : {}) };
}
// 🎮 a live game so far: the scoring plays before the current moment (never the ones after it), the moment and its calls
const liveSim = L => UT.simGame(L.home, L.away, L.seed, { live: { scale: UT.LIVE.scale, extras: L.extras } });
const before = (p, m) => p.q < m.q || (p.q === m.q && p.t > m.t);
function scoreAt(L, m) { const shown = liveSim(L).log.filter(p => before(p, m)), x = shown[shown.length - 1] || { h: 0, a: 0 }; return { h: x.h, a: x.a, diff: x.h - x.a, shown }; }
function livePublic(L) {
  const m = L.moments[L.i], s = scoreAt(L, m), M = UT.MOMENTS[m.kind];
  const info = x => ({ name: x.name, team: x.team, abbr: x.abbr, ovr: x.ovr });
  return { level: L.level, at: L.at, home: info(L.home), away: info(L.away), cards: { home: L.home.cards, away: L.away.cards }, plan: L.home.tactics,
    plays: s.shown.map(({ team, text, when, h, a, note }) => ({ team, text, when, h, a, note: note === '🎮' ? '🎮' : undefined })), h: s.h, a: s.a,
    moment: { i: L.i, n: L.moments.length, q: m.q, t: m.t, kind: m.kind, side: M.side, name: M.name, text: M.text, calls: UT.callsFor(m.kind) }, done: L.done };
}
const summaryOf = g => ({ gid: g.gid, at: g.at, hs: g.hs, as: g.as, ot: g.ot, winner: g.winner, ...(g.balanced ? { balanced: true } : {}), ...(g.competitive ? { competitive: true } : {}), ...(g.seasonal ? { seasonal: g.seasonal } : {}),
  home: { pid: g.home.pid, name: g.home.name, team: g.home.team, abbr: g.home.abbr, ovr: g.home.ovr },
  away: { pid: g.away.pid, name: g.away.name, team: g.away.team, abbr: g.away.abbr, ovr: g.away.ovr } });

//   GET  /api/ut[/<id>][?mode=season]   the open queue and recent results for that mode, plus that profile's team, cards
//                                       and lineup (in seasonal mode: this season's, with its milestones and standings)
//   GET  /api/ut/game/<game id>         one game in full (to replay it)
//   GET  /api/ut/art                    team logos and colors for drawing cards
//   GET  /api/ut/user/<profile id>      a player's name, title, records and showcase, for the hover popup on their name
//   POST /api/ut/<id>/<action>          team {name, abbr} · daily · open {pack} · lineup {lineup | 'best', which?} · sell {uids} · tradeup {uids}
//                                       queue {cancel?, tactics, balanced?, competitive?} · challenge {qid, tactics} · seen {gid} · bot {level, tactics}
//                                       season {team} · teampack {id} · collect {id}        (tactics = { off, def, tempo }, see UT.TACTICS)
//                                       bot {level, tactics, live: true} starts a 🎮 live game · live {call} | live {sim: true} plays it
//                                       Every action takes mode: 'season' to act on this season's cards instead.
function handle(req, url, body) {
  finalizeSeasons();
  const [, , , a, b] = url.split('/'); // '', 'api', 'ut', a, b
  if (req.method === 'GET') {
    if (a === 'user') return { user: userCard(b) }; // the hover popup on a player's name
    if (a === 'art') return { logos: (pools(), LOGOS), colors: COLORS }; // the cards' team logos and colors (the profile pages)
    if (a === 'game') { const g = /^[a-z0-9]{1,32}$/.test(b) && readJson(path.join(GDIR, b + '.json'), null); if (!g) throw new Error('No such game.'); return { game: g }; }
    const q = new URL(req.url, 'http://x').searchParams, mode = q.get('mode') === 'season' ? 'season' : 'main', lite = q.has('lite'), cur = seasonNow();
    const inMode = x => (mode === 'season' ? x.seasonal === cur : !x.seasonal);
    const P = pulls(), who = {};
    for (const x of P) { const w = (who[x.pid] ||= { pid: x.pid, name: x.name, n: 0, best: x.card }); w.n++; if (x.card.gr > w.best.gr) w.best = x.card; }
    // (a queued team's game plan is never sent: the challenger picks theirs blind)
    const out = { mode, seasonInfo: { n: cur, ...(cur ? span(cur) : { starts: EPOCH }) },
      queue: readJson(QUEUE, []).filter(inMode).map(({ cards, tactics, ...e }) => ({ ...e, lineup: UT.SLOTS.map(([s]) => cards[s] && [s, cards[s].n, cards[s].gr]).filter(Boolean) })),
      games: readJson(GAMES, []).filter(inMode).slice(0, 60),
      // the collections, logos and team list only change with a data refresh: the page's 10-second check skips them (?lite)
      ...(lite ? {} : { collections: collections().map(({ star, ...c }) => c), logos: (pools(), LOGOS), colors: COLORS }),
      boards: boards(), pulls: P.slice(0, 40), pullers: Object.values(who).sort((a, b) => b.n - a.n || b.best.gr - a.best.gr),
      ...(lite ? {} : { teams: league().teams.map(({ t, name }) => ({ t, name })).sort((a, b) => a.name.localeCompare(b.name)) }) };
    if (a) out.me = state(need(a), mode);
    return out;
  }
  if (req.method === 'POST' && a && ACTIONS[b]) {
    const p = need(a), out = { unlocked: [] }, mode = body?.mode === 'season' ? 'season' : 'main';
    const ctx = b === 'team' ? null : ctxOf(p, mode);
    ACTIONS[b](p, body || {}, out, ctx);
    profiles.save(p);
    return { ...out, me: state(p, mode) };
  }
  throw new Error('Unknown Ultimate Team request.');
}
module.exports = { handle, finalizeSeasons };
