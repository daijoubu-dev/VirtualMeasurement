// Profiles, achievements and points, stored on this machine in a "testnfl profiles" folder next to the app folder, outside the
// app folder, so redeploying (copying a new version of the app over the old one) never touches them.
// One JSON file per profile:
//   { id, name, created, achievements: { key: when }, counters: { key: n }, sets: { key: [items] },
//     ledger: [{ at, pts, reason, key? }], balance }
// Points are a ledger: every award (+) and purchase (−) is a line, and the balance is their sum, so the Ultimate
// Team packs (ultimate_api.js, which adds a "ut" section to the profile) spend points with a full history. The achievement list (app/achievements.js) is shared with
// the pages, but only the server decides what unlocks and what it's worth.
// 🔑 Each profile has a PIN (4 digits and 1 letter, e.g. 4821K), stored only as a salted scrypt hash. Signing in with it
// gives the browser a token (kept as a SHA-256 hash in the profile's "tokens"), and every change to a profile needs that
// token. Profiles made before PINs existed get theirs the first time someone signs in to them.
// "prefs" holds per-profile settings the pages share: { fav: 'KC', stats: [stat keys], tactics: {...} }.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ACH = require('./app/achievements.js');

// "testnfl profiles" beside the app folder (…\VirtualM\testnfl profiles next to …\VirtualM\testnfl); VM_PROFILES overrides
function profilesDir() {
  if (process.env.VM_PROFILES) return path.resolve(process.env.VM_PROFILES);
  return path.join(__dirname, '..', 'testnfl profiles');
}
const DIR = profilesDir();
fs.mkdirSync(DIR, { recursive: true });
const fileOf = id => path.join(DIR, `${id}.json`);
const validId = id => /^[a-z0-9-]{1,40}$/.test(id);

function load(id) {
  if (!validId(id) || !fs.existsSync(fileOf(id))) return null;
  return JSON.parse(fs.readFileSync(fileOf(id), 'utf8'));
}
// write to a temp file, then rename over the old one: a crash mid-save can't leave a half-written profile
function save(p) {
  const tmp = fileOf(p.id) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(p, null, 1));
  fs.renameSync(tmp, fileOf(p.id));
}
const summary = p => ({ id: p.id, name: p.name, created: p.created, balance: p.balance, earned: p.ledger.filter(l => l.pts > 0 && !l.sale).reduce((a, l) => a + l.pts, 0), unlocked: Object.keys(p.achievements).length, pin: !!p.pin });
// a profile as the pages see it: everything but the PIN hash and sign-in tokens
const visible = p => { const { pin, tokens, ...rest } = p; return { ...rest, prefs: p.prefs || {} }; };

// ---------- 🔑 PINs and sign-in tokens ----------
// exactly 5 characters: 4 digits and 1 letter, in any order (case doesn't matter)
const PIN_RULE = 'The PIN is 4 digits and 1 letter, like 4821K.';
const cleanPin = pin => { const s = String(pin || '').trim().toUpperCase(); return /^[0-9A-Z]{5}$/.test(s) && s.replace(/\D/g, '').length === 4 ? s : null; };
const hashPin = (pin, salt) => crypto.scryptSync(pin, salt, 32).toString('hex');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
function issueToken(p) {
  const token = crypto.randomBytes(24).toString('hex');
  p.tokens = [sha(token), ...(p.tokens || [])].slice(0, 10); // signed in on up to 10 browsers at once
  return token;
}
// too many wrong PINs locks a profile for a few minutes (so nobody can just try all 260,000 PINs)
const FAILS = new Map(), MAX_FAILS = 8, LOCK_MS = 10 * 60 * 1000;
function login(id, pin) {
  const p = load(id); if (!p) throw new Error('No such profile.');
  const f = FAILS.get(id);
  if (f && f.n >= MAX_FAILS && Date.now() - f.at < LOCK_MS) throw new Error('Too many wrong PINs. Try again in a few minutes.');
  const clean = cleanPin(pin); if (!clean) throw new Error(PIN_RULE);
  let created = false;
  if (!p.pin) { const salt = crypto.randomBytes(16).toString('hex'); p.pin = { salt, hash: hashPin(clean, salt) }; created = true; } // first sign-in since PINs: this sets it
  else if (!crypto.timingSafeEqual(Buffer.from(hashPin(clean, p.pin.salt), 'hex'), Buffer.from(p.pin.hash, 'hex'))) {
    const n = f && Date.now() - f.at < LOCK_MS ? f.n + 1 : 1; FAILS.set(id, { n, at: Date.now() });
    throw new Error(n >= MAX_FAILS ? 'Too many wrong PINs. Try again in a few minutes.' : 'Wrong PIN.');
  }
  FAILS.delete(id);
  const token = issueToken(p);
  save(p);
  return { token, created, profile: visible(p) };
}
// throws unless the token belongs to that profile
function authorize(id, token) {
  const p = load(id); if (!p) throw new Error('No such profile.');
  const h = token ? sha(String(token)) : '';
  if (!h || !(p.tokens || []).includes(h)) { const e = new Error('Please sign in again (👤 at the top right).'); e.status = 401; throw e; }
  return p;
}
function logout(id, token) { const p = load(id); if (p && token) { p.tokens = (p.tokens || []).filter(t => t !== sha(String(token))); save(p); } }

// every profile in full (Ultimate Team leaderboards)
function all() {
  return fs.readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return null; } }).filter(Boolean);
}
function list() {
  return fs.readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => { try { return summary(JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))); } catch { return null; } })
    .filter(Boolean).sort((a, b) => b.earned - a.earned);
}
function award(p, key, out) {
  const a = ACH.BY_KEY[key]; if (!a || p.achievements[key]) return;
  const at = new Date().toISOString();
  p.achievements[key] = at;
  p.ledger.push({ at, pts: a.pts, reason: `Achievement: ${a.name}`, key });
  p.balance += a.pts;
  out.push(a);
}
// counters and sets unlock their achievements when they reach the goal
function checkGoals(p, out) {
  for (const a of ACH.LIST) {
    if (p.achievements[a.key]) continue;
    if (a.counter && (p.counters[a.counter] || 0) >= a.goal) award(p, a.key, out);
    if (a.set && (p.sets[a.set] || []).length >= a.goal) award(p, a.key, out);
  }
}
function create(name, pin) {
  name = String(name || '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 24) throw new Error('Pick a name between 1 and 24 characters.');
  const clean = cleanPin(pin); if (!clean) throw new Error(PIN_RULE);
  if (list().some(p => p.name.toLowerCase() === name.toLowerCase())) throw new Error(`There's already a profile called ${name}.`);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'player';
  let id = slug; for (let i = 2; fs.existsSync(fileOf(id)); i++) id = `${slug}-${i}`;
  const salt = crypto.randomBytes(16).toString('hex');
  const p = { id, name, created: new Date().toISOString(), achievements: {}, counters: {}, sets: {}, ledger: [], balance: 0, prefs: {}, pin: { salt, hash: hashPin(clean, salt) } };
  const unlocked = []; award(p, 'welcome', unlocked);
  const token = issueToken(p);
  save(p);
  return { profile: visible(p), unlocked, token };
}
// ⚙ per-profile settings: favorite team, the matchup page's stat checkboxes, the last Ultimate Team game plan
function setPrefs(id, token, prefs) {
  const p = authorize(id, token), cur = p.prefs ||= {};
  if (prefs && typeof prefs === 'object') {
    if ('fav' in prefs) cur.fav = /^[A-Z]{2,3}$/.test(prefs.fav) ? prefs.fav : '';
    if ('stats' in prefs && Array.isArray(prefs.stats)) cur.stats = prefs.stats.filter(k => typeof k === 'string' && /^[a-z0-9_]{1,30}$/.test(k)).slice(0, 100);
    if ('match' in prefs && prefs.match && typeof prefs.match === 'object') { // the rest of the matchup page's ⚙ Settings
      const m = prefs.match, num = (v, lo, hi) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : undefined);
      cur.match = { venue: m.venue === 'home' ? 'home' : 'any', since: num(m.since, 1999, 2100), minGp: num(m.minGp, 1, 20), minSim: num(m.minSim, 0, 100) };
    }
    if ('tactics' in prefs && prefs.tactics && typeof prefs.tactics === 'object') cur.tactics = Object.fromEntries(['off', 'def', 'tempo'].map(k => [k, String(prefs.tactics[k] || '').slice(0, 12)]));
  }
  save(p);
  return { prefs: cur };
}
// events from the pages: { type: 'count', key, n } | { type: 'add', key, item } | { type: 'unlock', key }
const SET_LIMIT = 2000; // a set stops growing past this (it only needs to reach its goals)
function track(id, events) {
  const p = load(id); if (!p) throw new Error('No such profile.');
  const unlocked = [];
  for (const e of Array.isArray(events) ? events.slice(0, 200) : []) {
    if (e.type === 'count' && typeof e.key === 'string') p.counters[e.key] = (p.counters[e.key] || 0) + Math.max(0, Math.min(1000, +e.n || 1));
    else if (e.type === 'add' && typeof e.key === 'string' && e.item !== undefined) {
      const s = p.sets[e.key] ||= [], item = String(e.item).slice(0, 80);
      if (!s.includes(item) && s.length < SET_LIMIT) s.push(item);
    } else if (e.type === 'unlock' && ACH.BY_KEY[e.key] && !ACH.BY_KEY[e.key].counter && !ACH.BY_KEY[e.key].set) award(p, e.key, unlocked);
  }
  checkGoals(p, unlocked);
  save(p);
  return { unlocked, balance: p.balance };
}
// spending points (for the Ultimate Team packs): refused if the balance can't cover it
function spend(id, amount, reason) {
  const p = load(id); if (!p) throw new Error('No such profile.');
  amount = Math.round(+amount);
  if (!(amount > 0)) throw new Error('Nothing to spend.');
  if (amount > p.balance) throw new Error(`Not enough points: you have ${p.balance}.`);
  p.ledger.push({ at: new Date().toISOString(), pts: -amount, reason: String(reason || 'Purchase').slice(0, 80) });
  p.balance -= amount;
  save(p);
  return { balance: p.balance };
}
// credit points (daily points, game rewards, card sales); sales are marked so they don't count as "earned"
function credit(p, pts, reason, extra = {}) { p.ledger.push({ at: new Date().toISOString(), pts, reason: String(reason).slice(0, 80), ...extra }); p.balance += pts; }
module.exports = { DIR, all, list, load, save, create, track, spend, award, checkGoals, credit, login, logout, authorize, setPrefs, visible };
