// Site-wide glossary: every football or betting abbreviation on a page gets a dotted underline and a plain-English
// tooltip (the pages' own [data-tip] tooltip shows it). Works on text added later too (tables, cards, charts), and
// leaves alone anything that already has its own tooltip, plus form controls and the charts' SVG.
(function () {
  const G = {
    // stats
    EPA: ['Expected points added', 'How much a play changed the offense\'s expected points for the drive. Positive helped, negative hurt. "Pass EPA / dropback" is the average per pass play.'],
    CPOE: ['Completion % over expected', 'How much more (or less) often a QB completes passes than an average QB would on the same throws, given distance, coverage and pressure.'],
    aDOT: ['Average depth of target', 'How far downfield, on average, the passes thrown to a player travel in the air.'],
    YAC: ['Yards after catch', 'Yards gained after the ball is caught.'],
    RYOE: ['Rush yards over expected', 'Rushing yards beyond what an average back would gain given the blocking and defenders (from player tracking).'],
    TPRR: ['Targets per route run', 'How often a receiver is targeted when he runs a route.'],
    TFL: ['Tackles for loss', 'Tackles behind the line of scrimmage.'],
    QBH: ['QB hits', 'Hits on the quarterback as he throws, including sacks.'],
    FF: ['Forced fumbles', 'Fumbles a defender caused.'],
    PD: ['Passes defended', 'Passes a defender knocked away or intercepted.'],
    INT: ['Interception', 'A pass caught by the defense.'],
    TD: ['Touchdown', '6 points.'],
    FG: ['Field goal', '3 points.'],
    XP: ['Extra point', 'The 1-point kick after a touchdown.'],
    FGM: ['Field goals made', ''], FGA: ['Field goals attempted', ''], XPM: ['Extra points made', ''], XPA: ['Extra points attempted', ''],
    LNG: ['Longest', 'The longest play (or field goal) of the season.'],
    CMP: ['Completions', ''], ATT: ['Attempts', ''], TGT: ['Targets', 'Times a pass was thrown to the player.'], REC: ['Receptions', ''], YDS: ['Yards', ''],
    'Y/A': ['Yards per attempt', 'Passing yards per pass attempt.'], 'Y/G': ['Yards per game', ''], AVG: ['Average', 'Yards per carry, catch or punt, depending on the table.'],
    RTG: ['Passer rating', 'The NFL\'s passer rating formula (0 to 158.3).'],
    KR: ['Kickoff returns', ''], PR: ['Punt returns', ''],
    PPR: ['Point per reception', 'Fantasy scoring where every catch is worth a point.'],
    LOS: ['Line of scrimmage', 'Where the ball is snapped.'],
    // teams, games, betting
    PF: ['Points for', 'Points scored.'], PA: ['Points against', 'Points allowed.'],
    Pct: ['Win percentage', 'Wins divided by games, ties counting as half a win.'], Diff: ['Point differential', 'Points scored minus points allowed.'],
    Div: ['Division record', 'Record against teams in the same division.'], Conf: ['Conference record', 'Record against teams in the same conference (AFC or NFC). A playoff tiebreaker.'],
    Strk: ['Streak', 'Current run of wins (W) or losses (L).'],
    HC: ['Head coach', ''],
    OT: ['Overtime', ''],
    HFA: ['Home-field advantage', 'The edge for playing at home, worth about 1.5 points in the sims.'],
    SOS: ['Strength of schedule', 'How good the opponents are, by their combined record.'],
    ATS: ['Against the spread', 'Picking or winning with the Vegas point spread added: the favorite has to win by more than the line.'],
    'O/U': ['Over/under', 'Vegas\'s line on the total points both teams score; you bet whether the game goes over or under it.'],
    PK: ['Pick\'em', 'Vegas has no favorite: a 0-point spread.'],
    SB: ['Super Bowl', ''],
    WC: ['Wild Card round', 'The first round of the playoffs.'], DIV: ['Divisional round', 'The second round of the playoffs.'], CON: ['Conference championship', 'The round before the Super Bowl.'],
    MVP: ['Most valuable player', ''], ROTY: ['Rookie of the year', ''],
    // data sources
    PFR: ['Pro Football Reference', 'The source of the pressure and blitz stats (2018 on).'],
    NGS: ['Next Gen Stats', 'The NFL\'s player-tracking data: chips in every player\'s shoulder pads record speed and position.'],
  };
  const esc = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const RE = new RegExp(`(^|[^A-Za-z0-9_/-])(${Object.keys(G).sort((a, b) => b.length - a.length).map(esc).join('|')})(?=$|[^A-Za-z0-9_/-])`, 'g');
  const SKIP = 'script, style, select, option, textarea, input, svg, abbr, [data-tip], [data-noglo], #tip';
  // everyday ones get the tooltip without the underline, so pages full of TDs and yards don't turn into a sea of dots
  const BASIC = new Set(['TD', 'INT', 'FG', 'XP', 'SB', 'MVP', 'YDS', 'REC', 'ATT', 'CMP', 'OT', 'HC', 'AVG', 'PF', 'PA', 'TGT', 'Y/G']);
  const tipOf = k => `<b>${k}: ${G[k][0]}</b>${G[k][1]}`.replace(/"/g, '&quot;');
  function walk(root) {
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (!n.nodeValue.trim() || !n.parentElement || n.parentElement.closest(SKIP) ? NodeFilter.FILTER_REJECT : (RE.lastIndex = 0, RE.test(n.nodeValue)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const nodes = []; for (let n; (n = tw.nextNode());) nodes.push(n);
    // only the first of each abbreviation on the page is underlined; repeats still have the tooltip
    const shown = new Set([...document.querySelectorAll('abbr.glo:not(.basic)')].map(a => a.textContent));
    for (const n of nodes) {
      RE.lastIndex = 0;
      const html = n.nodeValue.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(RE, (m, pre, k) => `${pre}<abbr class="glo${BASIC.has(k) || shown.has(k) || !shown.add(k) ? ' basic' : ''}" data-tip="${tipOf(k)}">${k}</abbr>`);
      const span = document.createElement('span'); span.innerHTML = html;
      n.replaceWith(...span.childNodes);
    }
  }
  const style = document.createElement('style');
  style.textContent = 'abbr.glo { text-decoration: underline dotted color-mix(in srgb, currentColor 45%, transparent); text-underline-offset: 2px; cursor: help; } abbr.glo.basic { text-decoration: none; }';
  document.head.appendChild(style);
  let queued = false;
  const run = () => { queued = false; RE.lastIndex = 0; walk(document.body); };
  new MutationObserver(() => { if (!queued) { queued = true; setTimeout(run, 30); } }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.body) run(); else document.addEventListener('DOMContentLoaded', run);
  window.GLOSSARY = G;
})();
