// Downloads raw NFL data from nflverse (https://github.com/nflverse) into data/raw/.
// Usage: node fetch.js [first_season] [last_season]   (defaults: 1999 to the current season)
const fs = require('fs');
const path = require('path');
const tls = require('tls');

// Some networks inspect HTTPS traffic and re-sign it with their own root certificate, installed in the operating
// system's certificate store, so trust the system store too (same as NODE_USE_SYSTEM_CA=1, but works however we're launched).
if (tls.setDefaultCACertificates && tls.getCACertificates) {
  tls.setDefaultCACertificates([...new Set([...tls.getCACertificates('default'), ...tls.getCACertificates('system')])]);
}

const RAW = path.join(__dirname, 'data', 'raw');
const REL = 'https://github.com/nflverse/nflverse-data/releases/download';
const PFR_FIRST = 2018;
const PLAYER_FIRST = 1999; // first season of nflverse player stats (used for the career pages)

// NFL seasons start in September; from August on, "current" means this calendar year's season
function currentSeason(now = new Date()) {
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

async function get(url, file, { optional = false, keep = false, log = console.log } = {}) {
  // keep: a finished season never changes, so don't download it again if it's already on disk
  if (keep && fs.existsSync(path.join(RAW, file))) return true;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 404 && optional) { log(`  --  ${file} not published yet`); return false; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fs.writeFileSync(path.join(RAW, file), Buffer.from(await res.arrayBuffer()));
      log(`  ok  ${file}`);
      return true;
    } catch (e) {
      if (attempt === 3) throw new Error(`${file}: ${e.message}${e.cause ? ` (${e.cause.code || e.cause.message})` : ''}`);
    }
  }
}

async function fetchData(first = 1999, last = currentSeason(), log = console.log) {
  fs.mkdirSync(RAW, { recursive: true });
  log('Team colors and logos');
  await get('https://raw.githubusercontent.com/nflverse/nflverse-pbp/master/teams_colors_logos.csv', 'teams_colors_logos.csv', { optional: true, log });
  log('Schedules / results');
  await get('https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv', 'games.csv', { log });
  log(`Team stats ${first}-${last}`);
  for (let yr = first; yr <= last; yr++) {
    await get(`${REL}/stats_team/stats_team_week_${yr}.csv`, `stats_team_week_${yr}.csv`, { log });
    await get(`${REL}/stats_team/stats_team_reg_${yr}.csv`, `stats_team_reg_${yr}.csv`, { log });
    // Postseason totals don't exist until a season's playoffs start
    await get(`${REL}/stats_team/stats_team_post_${yr}.csv`, `stats_team_post_${yr}.csv`, { optional: true, log });
  }
  // Player stats go back to PLAYER_FIRST for the career pages whatever `first` is, but past seasons are only
  // downloaded once (so a Refresh re-fetches just the current season). The season totals carry only the team a
  // player finished with; the weekly file (kept gzipped) says every team they played for after a mid-season trade.
  log(`Player stats ${PLAYER_FIRST}-${last} (past seasons only if missing)`);
  for (let yr = PLAYER_FIRST; yr <= last; yr++) {
    const keep = yr < last;
    await get(`${REL}/stats_player/stats_player_reg_${yr}.csv`, `stats_player_reg_${yr}.csv`, { optional: true, keep, log });
    await get(`${REL}/stats_player/stats_player_week_${yr}.csv.gz`, `stats_player_week_${yr}.csv.gz`, { optional: true, keep, log });
  }
  // Weekly injury reports for the current season (Out / Doubtful / Questionable and the injury), for the Super Bowl sim
  log(`Injury reports ${last}`);
  await get(`${REL}/injuries/injuries_${last}.csv`, `injuries_${last}.csv`, { optional: true, log });
  // NFL Next Gen Stats (player tracking: separation, time to throw, rush yards over expected...), one file per kind
  // covering every season since 2016, updated weekly. Used by the Players page charts.
  log('Next Gen Stats');
  for (const kind of ['receiving', 'passing', 'rushing']) await get(`${REL}/nextgen_stats/ngs_${kind}.csv.gz`, `ngs_${kind}.csv.gz`, { optional: true, log });
  // For the Charts page: Pro Football Reference advanced receiving / rushing / defense stats and snap counts (this
  // season and last; last season's only once), plus nflverse's player id map (PFR ids → ours)
  log('PFR advanced stats, snap counts and the player id map');
  for (const yr of [last - 1, last]) {
    const keep = yr < last;
    for (const kind of ['rec', 'rush', 'def']) await get(`${REL}/pfr_advstats/advstats_week_${kind}_${yr}.csv`, `advstats_week_${kind}_${yr}.csv`, { optional: true, keep, log });
    await get(`${REL}/snap_counts/snap_counts_${yr}.csv`, `snap_counts_${yr}.csv`, { optional: true, keep, log });
    await get(`${REL}/stats_player/stats_player_week_${yr}.csv.gz`, `stats_player_week_${yr}.csv.gz`, { optional: true, keep, log });
  }
  await get(`${REL}/players/players.csv`, 'players.csv', { optional: true, log });
  // PFR blitz/pressure counts only exist from 2018 on
  const advFirst = Math.max(first, PFR_FIRST);
  if (advFirst <= last) log(`PFR advanced passing (blitz/pressure counts) ${advFirst}-${last}`);
  for (let yr = advFirst; yr <= last; yr++) {
    await get(`${REL}/pfr_advstats/advstats_week_pass_${yr}.csv`, `advstats_week_pass_${yr}.csv`, { optional: true, log });
  }
}

module.exports = { fetchData, currentSeason, PFR_FIRST, PLAYER_FIRST };

if (require.main === module) {
  const first = Number(process.argv[2] || 1999);
  const last = Number(process.argv[3] || currentSeason());
  fetchData(first, last).catch(e => { console.error('Download failed:', e.message); process.exit(1); });
}
