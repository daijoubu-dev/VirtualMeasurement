// Serves the matchup app at http://localhost:8765 and handles the "Refresh data" button.
// Usage: node server.js [--no-open]   (or double-click start.bat)
// Reachable from other machines on the local network (e.g. http://192.168.1.20:8765); anything from outside
// the local network is refused. Set HOST=127.0.0.1 for this machine only, and PORT to change the port (default 8765).
// PUBLIC=1 answers everyone (for a VPS, behind a reverse proxy that adds HTTPS; see README.md at the repo root, "Hosting it online"). Then
// the real visitor address comes from X-Forwarded-For (only trusted from a proxy on this machine), and ↻ Refresh
// needs a signed-in profile and runs at most once every REFRESH_MINUTES (default 10) for visitors from outside.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile, exec } = require('child_process');
const { fetchData, currentSeason } = require('./fetch');
const profiles = require('./profiles');
const ultimate = require('./ultimate_api');
const live = require('./live');
const pickem = require('./pickem');

const PORT = Number(process.env.PORT) || 8765;
// Listen on every network interface, but only answer local-network addresses (see isLocalNetwork)
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC = /^(1|true|yes)$/i.test(process.env.PUBLIC || '');
const REFRESH_MS = (Number(process.env.REFRESH_MINUTES) || 10) * 60 * 1000;
const AUTO_REFRESH = !/^(0|false|no|off)$/i.test(process.env.AUTO_REFRESH || ''); // AUTO_REFRESH=0 turns the schedule below off

// This machine, or a private local-network address (RFC 1918 IPv4, IPv6 link-local / unique-local).
// Everything else (the public internet) gets 403, which also keeps strangers off the Refresh button.
function isLocalNetwork(addr = '') {
  const ip = addr.replace(/^::ffff:/, ''); // IPv4 clients can show up in IPv6 form
  if (ip === '127.0.0.1' || ip === '::1') return true;
  const p = ip.split('.').map(Number);
  if (p.length === 4 && p.every(n => n >= 0 && n <= 255)) {
    return p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || p[0] === 127;
  }
  return /^(fe8|fe9|fea|feb|fc|fd)/i.test(ip);
}
// the visitor's address: behind a reverse proxy on this machine, the one it passes along in X-Forwarded-For
function clientIp(req) {
  const direct = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const fwd = req.headers['x-forwarded-for'];
  return (direct === '127.0.0.1' || direct === '::1') && fwd ? String(fwd).split(',')[0].trim().replace(/^::ffff:/, '') : direct;
}
const APP = path.join(__dirname, 'app');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
let refreshing = false, lastRefresh = 0;

const runNode = (script, args = []) => new Promise((resolve, reject) =>
  execFile(process.execPath, [path.join(__dirname, script), ...args], { cwd: __dirname, maxBuffer: 1 << 24 },
    (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout))));

// Refresh only re-downloads the current season (older seasons never change), then rebuilds everything.
async function refresh() {
  const log = [];
  const season = currentSeason();
  // a fresh copy (cloned from GitHub, no data yet) downloads every season once; after that, only the current one
  const fresh = !fs.existsSync(path.join(__dirname, 'data', 'raw', 'stats_team_week_1999.csv'));
  await fetchData(fresh ? 1999 : season, season, line => log.push(line));
  log.push((await runNode('build.js', ['1999', String(season)])).trim());
  log.push((await runNode('build_app.js')).trim());
  log.push((await runNode('build_perfect.js')).trim()); // the 17-0 page's player pool (completed seasons)
  log.push((await runNode('build_charts.js')).trim()); // the Charts page's data
  log.push((await runNode('build_box.js')).trim()); // this season's box scores (matchup page, finished games)
  log.push((await runNode('build_leaders.js')).trim()); // the weekly stat leaders (the ticker and the Leaders page)
  return log.join('\n');
}
const REFRESH_STAMP = path.join(__dirname, 'data', 'last_refresh.txt'); // written when a refresh finishes
async function runRefresh() {
  refreshing = true;
  try {
    const log = await refresh(); lastRefresh = Date.now(); console.log(log);
    try { pickem.settle(); } catch (e) { console.error("Pick'em settling failed:", e.message); } // new final scores pay out
    fs.writeFileSync(REFRESH_STAMP, new Date().toISOString());
    return log;
  }
  finally { refreshing = false; }
}

// ⏰ Automatic refresh during the season (September to February), at these times US Eastern: after Thursday's game (Friday),
// after Saturday's (Sunday), after Sunday's (Monday), after Monday's (Tuesday), and again later in case nflverse was slow to
// post the stats. If the server was off at one of these times, it catches up when it starts.
const AUTO_SLOTS = [[5, 6], [5, 14], [0, 6], [1, 6], [1, 14], [2, 6], [2, 14], [3, 6]]; // [weekday (0 = Sunday), hour]
const SEASON_MONTHS = [9, 10, 11, 12, 1, 2], DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const eastern = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23', month: 'numeric' });
// the most recent scheduled time, up to a week back
function lastAutoSlot(now = Date.now()) {
  const hour = 3600e3, start = Math.floor(now / hour) * hour;
  for (let h = 0; h < 24 * 8; h++) {
    const t = start - h * hour, p = Object.fromEntries(eastern.formatToParts(t).map(x => [x.type, x.value]));
    if (SEASON_MONTHS.includes(+p.month) && AUTO_SLOTS.some(([d, hr]) => DAYS[d] === p.weekday && hr === +p.hour)) return t;
  }
  return 0;
}
let autoRetryAt = 0;
async function autoRefresh() {
  if (refreshing || Date.now() < autoRetryAt) return;
  const slot = lastAutoSlot();
  let built = 0; try { built = fs.statSync(REFRESH_STAMP).mtimeMs; } catch { /* never built */ }
  if (!slot || built >= slot) return;
  console.log('Automatic data refresh starting…');
  try { await runRefresh(); } catch (e) { console.error('Automatic refresh failed, trying again in an hour:', e.message); autoRetryAt = Date.now() + 3600e3; }
}

//   GET  /api/profiles               every profile (name, points, achievements unlocked, whether it has a PIN)
//   POST /api/profiles {name, pin}   create one (answers with a sign-in token)
//   GET  /api/profiles/<id>          one profile in full (without its PIN and tokens)
//   POST /api/profiles/<id>/login    {pin} → a sign-in token (the first sign-in of a profile without a PIN sets it)
//   POST /api/profiles/<id>/logout   forget this browser's token
//   POST /api/profiles/<id>/track    {events: [...]} from the pages; answers with anything that unlocked
//   POST /api/profiles/<id>/spend    {amount, reason} (for the Ultimate Team packs)
//   POST /api/profiles/<id>/prefs    {fav?, stats?, tactics?, ticker?} per-profile settings
//   POST /api/profiles/<id>/showcase {cards: [up to 5 card ids], title: an achievement key} for the profile page
// Everything that changes a profile needs its token, in an X-VM-Token header (or "token" in the body, for sendBeacon).
const tokenOf = (req, body) => req.headers['x-vm-token'] || body?.token || '';
const readBody = req => new Promise((resolve, reject) => {
  let b = ''; req.on('data', c => { b += c; if (b.length > 1e5) req.destroy(); });
  req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { reject(new Error('Bad JSON')); } }); req.on('error', reject);
});
async function profileApi(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const send = (code, body) => { res.writeHead(code); res.end(JSON.stringify(body)); };
  try {
    const [, , , id, action] = url.split('/'); // '', 'api', 'profiles', id, action
    if (!id && req.method === 'GET') return send(200, { ok: true, profiles: profiles.list() });
    if (!id && req.method === 'POST') { const b = await readBody(req); return send(200, { ok: true, ...profiles.create(b.name, b.pin) }); }
    if (id && !action && req.method === 'GET') { const p = profiles.load(id); return p ? send(200, { ok: true, profile: profiles.visible(p) }) : send(404, { ok: false, error: 'No such profile.' }); }
    if (req.method !== 'POST' || !id) return send(404, { ok: false, error: 'Unknown profile request.' });
    const b = await readBody(req), token = tokenOf(req, b);
    if (action === 'login') return send(200, { ok: true, ...profiles.login(id, b.pin) });
    if (action === 'logout') { profiles.logout(id, token); return send(200, { ok: true }); }
    profiles.authorize(id, token);
    if (action === 'track') return send(200, { ok: true, ...profiles.track(id, b.events) });
    if (action === 'spend') return send(200, { ok: true, ...profiles.spend(id, b.amount, b.reason) });
    if (action === 'prefs') return send(200, { ok: true, ...profiles.setPrefs(id, token, b) });
    if (action === 'showcase') return send(200, { ok: true, ...profiles.setShowcase(id, token, b) });
    send(404, { ok: false, error: 'Unknown profile request.' });
  } catch (e) { send(e.status || 400, { ok: false, error: e.message }); }
}

http.createServer((req, res) => handle(req, res).catch(e => { // nothing a visitor sends can take the server down
  console.error('Request failed:', req.method, req.url, e.message);
  if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('Server error'); } else res.end();
})).listen(PORT, HOST, started);

async function handle(req, res) {
  const ip = clientIp(req), local = isLocalNetwork(ip);
  if (!PUBLIC && !local) {
    console.log(`Refused ${ip}: not on the local network`);
    res.writeHead(403, { 'Content-Type': 'text/plain' }); return res.end('Forbidden: local network only');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  let url;
  try { url = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end('Bad request'); }
  if (url === '/api/refresh' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json');
    if (refreshing) { res.writeHead(409); return res.end(JSON.stringify({ ok: false, error: 'A refresh is already running.' })); }
    if (!local) { // from outside: a signed-in profile, and not more than once every REFRESH_MINUTES
      const [id, token] = String(req.headers['x-vm-auth'] || '').split(':');
      try { profiles.authorize(id, token); } catch { res.writeHead(401); return res.end(JSON.stringify({ ok: false, error: 'Sign in (👤 at the top right) to refresh the data.' })); }
      const wait = Math.ceil((lastRefresh + REFRESH_MS - Date.now()) / 60000);
      if (wait > 0) { res.writeHead(429); return res.end(JSON.stringify({ ok: false, error: `The data was just refreshed. Try again in ${wait} min.` })); }
    }
    try {
      const log = await runRefresh();
      res.end(JSON.stringify({ ok: true, log }));
    } catch (e) {
      console.error('Refresh failed:', e.message);
      res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }
  // 🎯 pick'em (see pickem.js): reading is open, picking needs that profile's token
  if (url === '/api/pickem' || url.startsWith('/api/pickem/')) {
    res.setHeader('Content-Type', 'application/json');
    try {
      const body = req.method === 'POST' ? await readBody(req) : null;
      if (req.method === 'POST') profiles.authorize(url.split('/')[3], tokenOf(req, body));
      const authed = id => { try { return !!id && !!profiles.authorize(id, req.headers['x-vm-token']); } catch { return false; } };
      res.end(JSON.stringify({ ok: true, ...pickem.handle(req, url, body, authed) }));
    } catch (e) { res.writeHead(e.status || 400); res.end(JSON.stringify({ ok: false, error: e.message })); }
    return;
  }
  // 🔴 live scores for the ticker and the Leaders page (see live.js)
  if (url === '/api/live' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(await live.get()));
  }
  // 👤 profiles, achievements and points (stored in the "testnfl profiles" folder next to the app, see profiles.js)
  if (url.startsWith('/api/profiles')) return profileApi(req, res, url);
  // 🃏 Ultimate Team: packs, lineups, the challenge queue and games (see ultimate_api.js)
  if (url === '/api/ut' || url.startsWith('/api/ut/')) {
    res.setHeader('Content-Type', 'application/json');
    try {
      const body = req.method === 'POST' ? await readBody(req) : null;
      if (req.method === 'POST') profiles.authorize(url.split('/')[3], tokenOf(req, body)); // changes need that profile's token
      res.end(JSON.stringify({ ok: true, ...ultimate.handle(req, url, body) }));
    } catch (e) { res.writeHead(e.status || 400); res.end(JSON.stringify({ ok: false, error: e.message })); }
    return;
  }
  const file = path.join(APP, url === '/' ? 'index.html' : url);
  if (!file.startsWith(APP + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}
function started() {
  if (AUTO_REFRESH) { setTimeout(autoRefresh, 60e3); setInterval(autoRefresh, 10 * 60e3); }
  // first run on a fresh copy: there's no data yet, so get it now (a few minutes) whatever the date
  if (!fs.existsSync(path.join(APP, 'data.js')) && !refreshing) {
    console.log('First run: downloading and building all the data. This takes a few minutes; the site works once it says it\'s done.');
    runRefresh().then(() => console.log('Data ready.')).catch(e => console.error('First download failed:', e.message, '(restart the server to try again)'));
  }
  console.log(`Virtual Measurement running at http://localhost:${PORT}  (Ctrl+C to stop)${PUBLIC ? '  · PUBLIC: answering every address' : ''}`);
  console.log(`Profiles are saved in ${profiles.DIR}`);
  if (!PUBLIC && HOST !== '127.0.0.1' && HOST !== 'localhost') {
    const ips = Object.values(require('os').networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
    console.log(`On your local network: ${ips.map(ip => `http://${ip}:${PORT}`).join(' or ') || `this machine's address, port ${PORT}`}  (outside addresses are refused)`);
  }
  if (!process.argv.includes('--no-open') && process.platform === 'win32') exec(`start "" http://localhost:${PORT}`);
}
