// 🃏 Ultimate Team cards, shared by the Ultimate Team and profile pages (styles in cards.css):
//   VMCards.html(card, { slot, extra, cls, count, sell })   a card's HTML
//   VMCards.logos / VMCards.colors                          team logos and colors (from /api/ut or /api/ut/art); set them first
// Needs ultimate.js (window.VM_UT) loaded before it.
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const VMCards = window.VMCards = { logos: {}, colors: {} };
  // a picture that doesn't load moves on to the next one (ESPN → NFL.com → team logo), and the box goes when none do
  window.nextPic = function (img) {
    const rest = (img.dataset.alt || '').split(' ').filter(Boolean);
    if (!rest.length) return img.parentNode.remove();
    if (rest.length === 1 && /teamlogos/.test(rest[0])) img.parentNode.classList.add('tlogo');
    img.dataset.alt = rest.slice(1).join(' '); img.src = rest[0];
  };
  const POS_LABEL = { HC: 'COACH', ST: 'STADIUM' };
  function html(c, { slot, extra = '', cls = '', count = 0, sell = null } = {}) { // sell: the id of a copy that can be sold
    const r = window.VM_UT.rarityOf(c.gr), full = r.key === 'mythic', pics = window.VM_UT.photos(c, VMCards.logos, full), isLogo = !c.h, tk = window.VM_UT.teamKey(c.t), logo = VMCards.logos?.[tk];
    // the first name goes on small cards; coaches keep theirs, and stadiums and O-lines are one name
    const words = String(c.n).split(' '), split = words.length > 1 && !['ST', 'OL', 'HC'].includes(c.g);
    return `<div class="card r-${r.key} ${full ? 'fullart' : ''} ${cls}" style="--rc:${r.color};--tc:${esc(VMCards.colors?.[tk] || r.color)}" ${extra}>${count > 1 ? `<span class="cnt">×${count}</span>` : ''}
      <div class="cface"><div class="cbg"></div>
        ${pics.length ? `<div class="ph ${isLogo ? 'tlogo' : ''}"><img src="${esc(pics[0])}" data-alt="${esc(pics.slice(1).join(' '))}" alt="" loading="lazy" onerror="nextPic(this)"></div>` : ''}
        ${full ? '<div class="holo"></div><div class="spark"></div>' : ''}
        <div class="cbadge"><span class="gr">${c.gr}</span><span class="pos">${esc(slot || POS_LABEL[c.g] || c.g)}</span>${logo && !isLogo ? `<img class="tm" src="${esc(logo.replace('/i/teamlogos/', '/combiner/i?img=/i/teamlogos/').replace(/\.png$/, '.png&w=64&h=64'))}" alt="${esc(c.t)}" loading="lazy" onerror="this.remove()">` : ''}</div>
        <div class="plate"><div class="nm ${c.n.length > 17 ? 'long' : ''}">${split ? `<span class="fn">${esc(words[0])} </span>${esc(words.slice(1).join(' '))}` : esc(c.n)}</div><div class="yr">${c.s} ${esc(c.t)}</div>${c.ed ? `<div class="ed">🏆 ${esc(c.ed)} edition</div>` : c.set ? `<div class="ed set">${esc(c.set)} set card</div>` : ''}<div class="ln">${esc(c.l)}</div>
          <div class="ft"><span>${full ? '✦ ' : ''}${r.name}</span>${sell ? `<button class="btn sm" data-sell="${sell}">Sell · ${r.sell}</button>` : ''}</div></div>
      </div></div>`;
  }
  // cards lean toward the pointer, and the Mythic foil follows it
  if (matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) {
    let tilted = null, frame = 0;
    const reset = () => { if (tilted) ['--rx', '--ry', '--mx', '--my'].forEach(v => tilted.style.removeProperty(v)); tilted = null; };
    document.addEventListener('pointermove', e => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const card = e.target.closest?.('.card'), face = card?.querySelector('.cface');
        if (face !== tilted) reset();
        if (!face || card.closest('.flip:not(.open)')) return;
        const b = card.getBoundingClientRect(), x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
        tilted = face;
        face.style.setProperty('--rx', `${((x - .5) * 13).toFixed(1)}deg`); face.style.setProperty('--ry', `${((.5 - y) * 13).toFixed(1)}deg`);
        const holo = face.querySelector('.holo'); if (holo) { holo.style.setProperty('--mx', `${(x * 100).toFixed(0)}%`); holo.style.setProperty('--my', `${(y * 100).toFixed(0)}%`); }
      });
    });
  }
  VMCards.html = html;
})();
