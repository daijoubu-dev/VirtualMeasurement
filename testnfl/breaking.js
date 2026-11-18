// 🚨 The ticker's fake breaking news. All of it is football roasting: nothing here should read as a real accusation about
// anyone's life off the field, so keep real-world crimes, injuries and personal scandals out of it.
// Three kinds of headline, picked by build_leaders.js on every refresh:
//   QB / COACH   only used while that person is the team's current starter or head coach ("Name" or "Name|TEAM")
//   TEAM         always in play
//   thisWeek()   written from what really happened in the week on the ticker
// A headline can list other players it needs: { t: 'text', p: { 'James Cook': 'BUF' } } is dropped if he's left Buffalo.
const QB = {
  'Josh Allen|BUF': [
    { t: "Warrant issued for Josh Allen on grand theft charges in the case of James Cook's missing goal-line touchdowns", p: { 'James Cook': 'BUF' } },
    'Josh Allen hurdles a linebacker, a safety and every coaching point he has ever been given',
    "Folding-table industry reports record quarter, credits Josh Allen's fourth-quarter decision making",
  ],
  'Patrick Mahomes|KC': [
    "Referees deny being on Patrick Mahomes' payroll, ask that he stop writing 'for services rendered' in the memo line",
    'Patrick Mahomes breathed on by a defensive end; flag thrown from three counties away',
    'Academy adds Best Flop in a Supporting Role after watching Patrick Mahomes reach the sideline',
  ],
  'Justin Herbert|LAC': ['Justin Herbert posts another gorgeous stat line in a loss; IF-Man cleared of all charges by the jury of his fantasy managers'],
  'Joe Burrow|CIN': ["Police open missing persons case for Joe Burrow's offensive line, last seen waving at a blitzing linebacker"],
  'Jared Goff|DET': ['Jared Goff asked to throw while moving; negotiations break down immediately'],
  'Dak Prescott|DAL': ['"This is the year" enters its eleventh consecutive year in Dallas', "Dak Prescott's stats subpoenaed to explain where they go every January"],
  'Kirk Cousins': ['Kirk Cousins wins a primetime game; league office opens an investigation', 'Accountants confirm Kirk Cousins is still being paid by teams that have already moved on'],
  'Aaron Rodgers|PIT': ['Aaron Rodgers enters darkness retreat to decide if he will audible out of retirement again', 'Aaron Rodgers holds the ball for nine seconds, blames the receiver for aging'],
  'Matthew Stafford|LA': ['Matthew Stafford throws no-look pass; receiver, in solidarity, also did not look'],
  'Brock Purdy|SF': ["Kyle Shanahan's playbook files for co-writing credit on Brock Purdy's stat line"],
  'Trevor Lawrence|JAX': ['Search for generational talent enters sixth year; Jacksonville police ask public for tips'],
  'Daniel Jones|IND': ['Daniel Jones breaks free for 80 yards, trips at the 1 out of respect for tradition'],
  'Bo Nix|DEN': ["Bo Nix completes a 5-yard pass on 3rd-and-11; Sean Payton's visor seen leaving the stadium without him"],
  'Jordan Love|GB': ['Jordan Love signs a contract extension before finishing this sentence'],
  'Caleb Williams|CHI': ['Chicago names Caleb Williams franchise quarterback, joining a proud list of everybody'],
  'Bryce Young|CAR': ['Carolina front office insists this was the plan, declines to say which plan'],
  'Geno Smith': ['Geno Smith confirms they wrote him off, and that he still has not written back'],
  'Baker Mayfield|TB': ['Baker Mayfield seen planting a flag at a Waffle House after a tough road win'],
  'Sam Darnold|SEA': ['Sam Darnold reports seeing ghosts again; Seahawks ask if the ghosts can block'],
  'Gardner Minshew': ["Gardner Minshew's mustache ruled an eligible receiver after league review"],
  'Joe Milton III': ['Joe Milton throws a ball 85 yards to a receiver standing 12 yards away; FAA opens inquiry'],
  'Jayden Daniels|WAS': ['Commanders legal team confirms Jayden Daniels is still not allowed to do that to people'],
  'Drake Maye|NE': ['New England fans officially stop asking who the next Tom Brady is, start asking who the next Drake Maye backup is'],
  'C.J. Stroud|HOU': ["C.J. Stroud's offensive line files a formal apology, promises this one is the last one"],
  'Cam Ward|TEN': ['Cam Ward extends another play for 11 seconds; Titans receivers still looking for the snap count'],
};
const COACH = {
  'Andy Reid|KC': ['Andy Reid calls a timeout to discuss the timeout; both ruled excellent by the officials'],
  'Kyle Shanahan|SF': ['Kyle Shanahan takes a 10-point lead into the fourth quarter; Bay Area residents urged to seek shelter'],
  'Sean McVay|LA': ['Sean McVay recites every play from a 2017 preseason game, misses his own kickoff'],
  'Dan Campbell|DET': ['Dan Campbell goes for it on 4th-and-19 from his own 11, bites a kneecap in celebration'],
  'Jim Harbaugh|LAC': ['Jim Harbaugh tells Chargers to stop Chargering; Chargers request that in writing'],
  'Nick Sirianni|PHI': ['League files restraining order on behalf of the 1-yard line after another Eagles tush push'],
  'Sean Payton|DEN': ['Sean Payton confirms he has never once been wrong, cites himself as the source'],
  'Ben Johnson|CHI': ['Ben Johnson draws up a double-reverse flea flicker for 3rd-and-1, calls it the safe option'],
  'Mike Vrabel|NE': ['Mike Vrabel challenges a referee to a fourth-quarter Oklahoma drill'],
  'Zac Taylor|CIN': ['Zac Taylor spotted in a hoodie, staring at a defense he insists is improving'],
  'Todd Bowles|TB': ['Todd Bowles sends seven on 3rd-and-20, watches the replay, sends eight'],
  'Robert Saleh|TEN': ['Robert Saleh loses the argument with his own sideline tablet'],
};
const TEAM = {
  ARI: ['Cardinals fans located in Glendale; stadium security asks them to identify themselves'],
  ATL: ['Falcons take a 28-3 lead in a walkthrough; fans begin evacuating anyway'],
  BAL: ['Ravens analytics department goes for two, on a kickoff'],
  BUF: ['Bills defense asks the league for just 13 more seconds', 'Buffalo announces wide right is now a protected historical landmark'],
  CAR: ["Panthers announce a rebuild of the rebuild's rebuild"],
  CHI: ['Bears quarterback throws for 4,000 yards; city of Chicago demands a recount'],
  CIN: ['Bengals ownership finds $20 in a couch, earmarks it for the offensive line in 2031'],
  CLE: ['Browns start yet another quarterback; jersey shop switches to dry-erase', 'Cleveland declares the Factory of Sadness a fully operational small business'],
  DAL: ['Cowboys finalize Super Bowl parade route for the 31st straight August', 'NFC Championship Game asks Dallas to stop texting'],
  DEN: ['Broncos fans still paying for quarterbacks who left three teams ago'],
  DET: ['Lions fans report unfamiliar feeling; doctors confirm it is called hope and there is no cure'],
  GB: ['Packers draft a first-round quarterback they will not need for four years, out of habit'],
  HOU: ['Texans O-line named person of interest in the disappearance of every pocket in Houston'],
  IND: ['Colts announce their next starting quarterback will be retired, as is tradition'],
  JAX: ['Jaguars win in London; England formally asks if they can keep them'],
  KC: ['Rest of AFC petitions to have the Chiefs tried as adults'],
  LA: ['Rams announce they will trade every draft pick through 2041, "for the vibes"'],
  LAC: ['Chargers take a 27-point playoff lead; local authorities told to stand by', "Scientists add 'Chargering' to the dictionary, cannot finish the definition in time"],
  LV: ['Raiders hire a new head coach during this headline'],
  MIA: ['Temperature drops below 50 degrees; Dolphins roster listed as day-to-day'],
  MIN: ['Vikings kicker charged with conspiracy to miss from 27 yards', 'Minnesota fans brace for the most Vikings thing possible, are somehow still surprised'],
  NE: ['Patriots deflect all questions about deflated expectations'],
  NO: ['Saints salary cap declared a work of fiction by the Louisiana Library Association'],
  NYG: ["Giants fans ask if it's too early for next year's draft; it is Week 2"],
  NYJ: ['Jets fans chant "Fire everybody" at a high school car wash', 'Jets quarterback room granted its own zip code'],
  PHI: ['Eagles fans boo this headline'],
  PIT: ['Scientists confirm Steelers finishing 9-8 is now a law of physics'],
  SEA: ['Seahawks have it on the 1-yard line; historians urge everybody to just run the ball'],
  SF: ['49ers injury report released in three volumes; paperback edition due Friday'],
  TB: ['Buccaneers win the NFC South with 8 wins; division holds a modest ceremony in a parking lot'],
  TEN: ['Titans fans still measuring how long one yard is'],
  WAS: ['Commanders fans still calling them something else out of pure muscle memory'],
};

// a small seeded shuffle, so the order is the same for everyone until the next refresh
function shuffle(list, seed) {
  const out = list.slice(), rand = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

// headlines from what happened in the week: rows are that week's player stats, games its schedule with scores
function thisWeek({ rows, games, nick }) {
  const n = v => +v || 0, name = r => r.player_display_name || r.player_name, team = t => nick[t] || t, out = [];
  const top = (value, min) => rows.filter(r => n(value(r)) >= min).sort((a, b) => n(value(b)) - n(value(a)))[0];
  let r;
  if ((r = top(x => x.receiving_yards, 150))) out.push(`${team(r.opponent_team)} secondary reported missing after ${name(r)} hangs ${n(r.receiving_yards)} yards on them. Anyone with information is asked to please cover him`);
  if ((r = top(x => x.rushing_yards, 130))) out.push(`${team(r.opponent_team)} run defense reclassified as a decorative feature after ${name(r)} goes for ${n(r.rushing_yards)}`);
  if ((r = top(x => x.passing_yards, 350))) out.push(`${name(r)} throws for ${n(r.passing_yards)}. ${team(r.opponent_team)} defensive coordinator last seen updating his LinkedIn`);
  if ((r = top(x => x.passing_interceptions, 3))) out.push(`${name(r)} throws ${n(r.passing_interceptions)} interceptions. ${team(r.opponent_team)} send him a game ball and a W-2`);
  if ((r = top(x => x.sacks_suffered, 6))) out.push(`${team(r.team)} O-line enters witness protection after ${name(r)} is sacked ${n(r.sacks_suffered)} times. Nobody saw anything, especially them`);
  if ((r = top(x => x.fg_missed, 2))) out.push(`${name(r)} misses ${n(r.fg_missed)} field goals. Uprights deny any involvement`);
  const blowout = games.filter(g => g.home_score !== '' && Math.abs(n(g.home_score) - n(g.away_score)) >= 24).sort((a, b) => Math.abs(n(b.home_score) - n(b.away_score)) - Math.abs(n(a.home_score) - n(a.away_score)))[0];
  if (blowout) {
    const homeWon = n(blowout.home_score) > n(blowout.away_score), w = homeWon ? blowout.home_team : blowout.away_team, l = homeWon ? blowout.away_team : blowout.home_team;
    out.push(`${team(l)} lose to the ${team(w)} by ${Math.abs(n(blowout.home_score) - n(blowout.away_score))}. Fans demand a refund and a hug`);
  }
  return out;
}

// ctx: { season, week, qb: {team: name}, coach: {team: name}, playerTeam: {name: team}, rows, games, nick: {team: nickname} }
function headlines(ctx, max = 40) {
  const current = (who, key) => { const [name, team] = key.split('|'); return team ? who[team] === name : Object.values(who).includes(name); };
  const fits = h => Object.entries(h.p || {}).every(([name, team]) => ctx.playerTeam[name] === team);
  const pick = (table, who) => Object.entries(table).filter(([k]) => !who || current(who, k)).flatMap(([, list]) => list).filter(fits).map(h => h.t || h);
  const live = thisWeek(ctx), stock = shuffle([...pick(QB, ctx.qb), ...pick(COACH, ctx.coach), ...pick(TEAM)], ctx.season * 100 + ctx.week).slice(0, Math.max(0, max - live.length));
  // the real week's headlines are spread through the rotation, so they come up early and often
  const out = stock.slice();
  live.forEach((h, i) => out.splice(Math.min(out.length, i * 3), 0, h));
  return out;
}
module.exports = { headlines, thisWeek, QB, COACH, TEAM };
