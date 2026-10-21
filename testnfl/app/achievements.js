// Achievement definitions, shared by the browser (window.VM_ACHIEVEMENTS) and the server (require), so the server
// decides what an unlock is worth: pages only report what happened.
//   counter: unlocks when that counter reaches goal          set: unlocks when that many different things are collected
//   neither: unlocked directly by the page                    hidden: shown as ??? until unlocked
// Points are a spendable balance (a ledger of every award and purchase), meant for the Ultimate Team packs to come.
(function (root) {
  const TIERS = { bronze: { pts: 25, icon: '🥉' }, silver: { pts: 75, icon: '🥈' }, gold: { pts: 200, icon: '🥇' }, platinum: { pts: 500, icon: '💎' }, legendary: { pts: 1500, icon: '👑' } };
  const A = [
    // ---- getting around ----
    { key: 'welcome', group: 'Getting started', name: 'Welcome to Virtual Measurement', desc: 'Create a profile.', tier: 'bronze' },
    { key: 'fav_team', group: 'Getting started', name: 'Ride or die', desc: 'Pick your ⭐ favorite team on the Matchups page.', tier: 'bronze' },
    { key: 'tourist', group: 'Getting started', name: 'Tourist', desc: 'Visit every page of the site.', tier: 'bronze', set: 'pages', goal: 8 },
    // ---- matchups & stats ----
    { key: 'scout_25', group: 'Stats', name: 'Film room', desc: 'Look at 25 different matchups.', tier: 'bronze', set: 'matchups', goal: 25 },
    { key: 'scout_100', group: 'Stats', name: 'Advance scout', desc: 'Look at 100 different matchups.', tier: 'silver', set: 'matchups', goal: 100 },
    { key: 'time_traveler', group: 'Stats', name: 'Time traveler', desc: 'Check how Virtual Measurement\'s pick did on a finished game.', tier: 'bronze' },
    { key: 'takes_50', group: 'Stats', name: 'Twitter brain', desc: 'See 50 different hot takes.', tier: 'silver', set: 'takes', goal: 50 },
    { key: 'takes_150', group: 'Stats', name: 'Chronically online', desc: 'See 150 different hot takes.', tier: 'gold', set: 'takes', goal: 150 },
    { key: 'careers_25', group: 'Stats', name: 'Historian', desc: 'Open 25 different players\' career stats.', tier: 'silver', set: 'careers', goal: 25 },
    { key: 'chart_custom', group: 'Stats', name: 'Analyst', desc: 'Build a custom chart (pick your own X and Y).', tier: 'bronze' },
    { key: 'chart_save_1', group: 'Stats', name: 'Screenshot this', desc: 'Save a chart image.', tier: 'bronze', counter: 'charts_saved', goal: 1 },
    { key: 'chart_save_10', group: 'Stats', name: 'Chart Twitter', desc: 'Save 10 chart images.', tier: 'silver', counter: 'charts_saved', goal: 10 },
    // ---- Super Bowl sim ----
    { key: 'sb_1', group: 'Super Bowl sim', name: 'Opening kickoff', desc: 'Simulate a season.', tier: 'bronze', counter: 'sb_sims', goal: 1 },
    { key: 'sb_50', group: 'Super Bowl sim', name: 'Season ticket holder', desc: 'Simulate 50 seasons.', tier: 'silver', counter: 'sb_sims', goal: 50 },
    { key: 'sb_250', group: 'Super Bowl sim', name: 'Commissioner', desc: 'Simulate 250 seasons.', tier: 'gold', counter: 'sb_sims', goal: 250 },
    { key: 'sb_thousand', group: 'Super Bowl sim', name: 'Multiverse', desc: 'Run 1,000 seasons at once.', tier: 'bronze' },
    { key: 'bracket_champ', group: 'Super Bowl sim', name: 'Called it', desc: 'Pick the Super Bowl champion in pick-your-bracket.', tier: 'silver' },
    { key: 'bracket_10', group: 'Super Bowl sim', name: 'Bracketologist', desc: 'Get 10 of 13 playoff games right in pick-your-bracket.', tier: 'gold' },
    { key: 'bracket_perfect', group: 'Super Bowl sim', name: 'Nostradamus', desc: 'Pick a perfect bracket: all 13 games.', tier: 'legendary', hidden: true },
    { key: 'sb_backup', group: 'Super Bowl sim', name: 'Nick Foles energy', desc: 'See a team win the Super Bowl with its backup QB.', tier: 'silver', hidden: true },
    { key: 'sb_ot', group: 'Super Bowl sim', name: 'Free football', desc: 'See a Super Bowl go to overtime.', tier: 'silver', hidden: true },
    { key: 'sb_pick6', group: 'Super Bowl sim', name: 'Pick-six on the biggest stage', desc: 'See a pick-six in the Super Bowl.', tier: 'silver', hidden: true },
    { key: 'snow_globe', group: 'Super Bowl sim', name: 'Snow globe', desc: 'See a playoff game played in the snow.', tier: 'bronze', hidden: true },
    { key: 'run_it_back', group: 'Super Bowl sim', name: 'Best of seven', desc: 'Run it back until a Super Bowl series reaches 7 games.', tier: 'silver' },
    // ---- 17-0 ----
    { key: 'draft_1', group: '17-0', name: 'Draft day', desc: 'Finish a roll draft.', tier: 'bronze' },
    { key: 'seasons_25', group: '17-0', name: 'Grinder', desc: 'Play 25 seasons on the 17-0 page.', tier: 'silver', counter: 'p17_seasons', goal: 25 },
    { key: 'went_17_0', group: '17-0', name: 'Undefeated', desc: 'Go 17-0 in the regular season.', tier: 'gold' },
    { key: 'perfect', group: '17-0', name: 'The 72 Dolphins are calling', desc: 'Go 17-0 and win every playoff game.', tier: 'platinum' },
    { key: 'perfect_madden', group: '17-0', name: 'All-Madden', desc: 'Have a perfect season on the All-Madden cap.', tier: 'legendary' },
    { key: 'no_reroll', group: '17-0', name: 'Trust the process', desc: 'Win the Super Bowl with a draft that used no rerolls.', tier: 'gold' },
    { key: 'tie_heartbreak', group: '17-0', name: 'Kissing your sister', desc: 'Finish the regular season unbeaten but with a tie.', tier: 'gold', hidden: true },
    { key: 'ut_pack', group: 'Ultimate Team', name: 'Rip it open', desc: 'Open your first pack.', tier: 'bronze' },
    { key: 'ut_legend', group: 'Ultimate Team', name: 'Hall of Famer', desc: 'Pull a Legendary card (grade 90+).', tier: 'gold' },
    { key: 'ut_mythic', group: 'Ultimate Team', name: 'Unicorn', desc: 'Get a Mythic card (grade 99), from a pack, a game or a collection.', tier: 'platinum' },
    { key: 'ut_tradeup', group: 'Ultimate Team', name: 'Moving up', desc: 'Trade 5 cards up for a better one.', tier: 'bronze' },
    { key: 'ut_collection', group: 'Ultimate Team', name: 'Set collector', desc: 'Turn in a 🏆 legendary team collection.', tier: 'gold' },
    { key: 'ut_collections_5', group: 'Ultimate Team', name: 'Curator', desc: 'Turn in 5 legendary team collections.', tier: 'legendary' },
    { key: 'ut_collector', group: 'Ultimate Team', name: 'Collector', desc: 'Collect 100 different cards.', tier: 'silver', set: 'ut_cards', goal: 100 },
    { key: 'ut_win', group: 'Ultimate Team', name: 'First W', desc: 'Win an Ultimate Team game.', tier: 'bronze' },
    { key: 'ut_wins_10', group: 'Ultimate Team', name: 'Contender', desc: 'Win 10 Ultimate Team games.', tier: 'silver', counter: 'ut_wins', goal: 10 },
    { key: 'ut_wins_50', group: 'Ultimate Team', name: 'Dynasty', desc: 'Win 50 Ultimate Team games.', tier: 'gold', counter: 'ut_wins', goal: 50 },
    { key: 'ut_shutout', group: 'Ultimate Team', name: 'Goose egg', desc: 'Win an Ultimate Team game without allowing a point.', tier: 'gold', hidden: true },
    { key: 'ut_comeback', group: 'Ultimate Team', name: 'Never in doubt', desc: 'Win an Ultimate Team game after trailing by 14 or more.', tier: 'silver', hidden: true },
  ];
  for (const a of A) { a.pts = TIERS[a.tier].pts; a.icon = TIERS[a.tier].icon; }
  const out = { TIERS, LIST: A, BY_KEY: Object.fromEntries(A.map(a => [a.key, a])) };
  if (typeof module !== 'undefined' && module.exports) module.exports = out; else root.VM_ACHIEVEMENTS = out;
})(typeof window !== 'undefined' ? window : globalThis);
