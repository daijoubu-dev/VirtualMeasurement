// ⭐ Profile looks, shared by the browser (window.VM_LOOK) and the server (require): levels from points earned, banners
// you unlock, and the profile picture (one of your Mythic or 👑 Legend cards).
(function (root) {
  // 📈 level: 1 + √(earned / 50). Level 10 is 4,050 points earned, level 20 is 18,050, level 30 is 42,050.
  const level = earned => 1 + Math.floor(Math.sqrt(Math.max(0, earned) / 50));
  const levelAt = L => 50 * (L - 1) ** 2; // points earned to reach a level
  const TIERS = [[50, 'Diamond', '#67e8f9'], [30, 'Platinum', '#a5b4fc'], [20, 'Gold', '#facc15'], [10, 'Silver', '#cbd5e1'], [1, 'Bronze', '#d97706']];
  const tier = L => { const [, name, color] = TIERS.find(([min]) => L >= min); return { name, color }; };
  // 🎨 banners: the strip behind a profile's name. ok(p, earned) says whether a profile has unlocked it.
  const cards = p => p.ut?.cards || [];
  const BANNERS = [
    { key: 'night', name: 'Night', icon: '🌙', css: 'linear-gradient(120deg, #0f172a, #1e293b 60%, #334155)', need: 'Everyone has it', ok: () => true },
    { key: 'turf', name: 'Turf', icon: '🏟️', css: 'repeating-linear-gradient(90deg, #14532d 0 44px, #166534 44px 88px)', need: 'Everyone has it', ok: () => true },
    { key: 'team', name: 'Team colors', icon: '🏈', css: null, need: 'Pick a favorite team (⚙ Settings in the 👤 menu)', ok: p => !!p.prefs?.fav },
    { key: 'gold', name: 'Gold', icon: '🥇', css: 'linear-gradient(120deg, #3b2a08, #a16207 55%, #facc15)', need: 'Unlock 20 achievements', ok: p => Object.keys(p.achievements || {}).length >= 20 },
    { key: 'aurora', name: 'Aurora', icon: '🌈', css: 'linear-gradient(120deg, #5c1038, #6a4300 25%, #07544a 50%, #0d3a78 75%, #47197a)', need: 'Own a Mythic', ok: p => cards(p).some(c => c.gr >= 99) },
    { key: 'ring', name: 'Ring night', icon: '💍', css: 'radial-gradient(circle at 82% 30%, rgba(253, 230, 138, .35), transparent 38%), linear-gradient(120deg, #111827, #78350f)', need: 'Win a Super Bowl in a 📅 Schedule run', ok: p => (p.ut?.titles || 0) >= 1 },
    { key: 'veteran', name: 'Veteran', icon: '🗓️', css: 'linear-gradient(120deg, #1e1b4b, #4338ca 60%, #ec4899)', need: "Finish a season's milestone track", ok: p => !!p.achievements?.sea_track },
    { key: 'champ', name: 'Champion', icon: '🏆', css: 'linear-gradient(120deg, #422006, #ca8a04 42%, #fef08a 50%, #ca8a04 58%, #422006)', need: 'Win a season', ok: p => (p.seasonHistory || []).some(h => h.champ) },
    { key: 'legend', name: 'Legend', icon: '👑', css: 'linear-gradient(120deg, #000, #3f3f46 55%, #d4af37)', need: 'Own a 👑 Legend card', ok: p => cards(p).some(c => c.legend) },
    { key: 'hof', name: 'Hall of Fame', icon: '⭐', css: 'linear-gradient(120deg, #1c1917, #b45309 40%, #fde047 50%, #b45309 60%, #1c1917)', need: 'Reach level 30', ok: (p, earned) => level(earned) >= 30 },
  ];
  const banner = key => BANNERS.find(b => b.key === key) || BANNERS[0];
  // 🖼️ a profile picture has to be one of your Mythics or Legends
  const avatarOk = c => !!c && (c.gr >= 99 || !!c.legend);
  const out = { level, levelAt, tier, BANNERS, banner, avatarOk };
  if (typeof module !== 'undefined' && module.exports) module.exports = out; else root.VM_LOOK = out;
})(typeof window !== 'undefined' ? window : globalThis);
