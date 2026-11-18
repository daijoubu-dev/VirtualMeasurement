// 🔴 Live scores and game leaders for the ticker and the Leaders page, from ESPN's public scoreboard feed (the same one
// espn.com uses; it isn't an official API, so if it ever changes or goes down, the site just shows no live section).
// One copy is kept on the server however many people are watching: re-fetched every 20 seconds during games, every
// minute shortly before kickoff, and every 10 minutes the rest of the time.
const URL_ = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const CODE = { WSH: 'WAS', LAR: 'LA' }; // ESPN's team codes that differ from nflverse's
const code = t => CODE[t] || t;
const CATS = { passingYards: 'pass', rushingYards: 'rush', receivingYards: 'rec' };

// ESPN's scoreboard → just what the pages need
function normalize(j) {
  const games = (j.events || []).map(e => {
    const c = e.competitions?.[0] || {}, side = h => c.competitors?.find(t => t.homeAway === h) || {};
    const team = t => ({ abbr: code(t.team?.abbreviation || ''), score: t.score === undefined || t.score === '' ? null : +t.score, logo: t.team?.logo || '' });
    const byId = Object.fromEntries((c.competitors || []).map(t => [t.team?.id, code(t.team?.abbreviation || '')]));
    const leaders = (c.leaders || []).filter(l => CATS[l.name] && l.leaders?.[0]).map(l => {
      const x = l.leaders[0];
      return { cat: CATS[l.name], name: x.athlete?.shortName || x.athlete?.displayName || '', team: byId[x.team?.id] || code(x.athlete?.team?.abbreviation || ''), yds: +x.value || 0, line: x.displayValue || '' };
    });
    const s = c.situation || {};
    return { id: e.id, state: e.status?.type?.state || 'pre', detail: e.status?.type?.shortDetail || '', date: e.date, away: team(side('away')), home: team(side('home')),
      poss: byId[s.possession] || null, down: s.shortDownDistanceText || '', redzone: !!s.isRedZone, leaders };
  });
  // the week's top yardage so far: the league's best is always the best in its own game
  const top = {};
  for (const cat of Object.values(CATS)) top[cat] = games.filter(g => g.state !== 'pre').flatMap(g => g.leaders.filter(l => l.cat === cat)).sort((a, b) => b.yds - a.yds).slice(0, 3);
  return { week: j.week?.number ?? null, anyLive: games.some(g => g.state === 'in'), games, top };
}

const ttl = d => {
  if (d.anyLive) return 20e3;
  const next = Math.min(...d.games.filter(g => g.state === 'pre').map(g => new Date(g.date) - Date.now()));
  return next < 20 * 60e3 ? 60e3 : 10 * 60e3; // kickoff soon (or already due): check often
};
let data = null, until = 0, pending = null;
async function get() {
  if (Date.now() < until) return data;
  return (pending ||= (async () => {
    try {
      const r = await fetch(URL_, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      data = { ok: true, ...normalize(await r.json()) };
      until = Date.now() + ttl(data);
    } catch (e) { // keep what we had, and don't hammer the feed
      console.error('Live scores unavailable:', e.message);
      data ||= { ok: false, anyLive: false, games: [], top: {} };
      until = Date.now() + 60e3;
    } finally { pending = null; }
    return data;
  })());
}
module.exports = { get, normalize };
