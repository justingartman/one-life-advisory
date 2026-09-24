/* ─────────────────────────────────────────────────────────────────────────
 * Content renderers — build the growable sections (What We Do accordions,
 * FAQ, Privacy Policy, team cards, Resources) from the JSON in /content.
 *
 * Loaded by index.html before its main script. The build (scripts/build.mjs)
 * also runs these same functions at deploy time, so every page's HTML already
 * contains its content for search engines and first paint; in the browser they
 * run again once content loads, which attaches the click handlers.
 * ───────────────────────────────────────────────────────────────────────── */
// Handlers are written as HTML attributes (onclick="…") rather than
// addEventListener, so sections built at deploy time work without re-running.
function jumpToSection(id) {
  const t = document.getElementById(id);
  if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── What We Do accordions (built from content/what-we-do.json → acc) ────
// The accordion shells stay in the markup; only their contents are built
// here, so each area can have any number of paragraphs.
function renderWhatWeDo() {
  const data = (window.__cmsContent || {}).what_we_do;
  if (!data || !data.acc) return;
  Object.keys(data.acc).forEach(key => {
    const body = document.querySelector('#body-' + key + ' .acc-body-inner');
    const item = data.acc[key];
    if (!body || !item) return;
    body.innerHTML = '';
    (item.paras || []).filter(Boolean).forEach(t => {
      const p = document.createElement('p'); p.textContent = t; body.appendChild(p);
    });
    if (item.extra && item.extra.head) {
      const h = document.createElement('div');
      h.className = 'acc-subhead'; h.textContent = item.extra.head;
      body.appendChild(h);
      (item.extra.paras || []).filter(Boolean).forEach(t => {
        const p = document.createElement('p'); p.textContent = t; body.appendChild(p);
      });
    }
    // "What you walk away with" checklist
    const walk = (item.walkaway || []).filter(Boolean);
    if (walk.length) {
      const box = document.createElement('div'); box.className = 'acc-walkaway';
      const h4 = document.createElement('h4');
      h4.textContent = data.walkawayLabel || 'What you walk away with';
      box.appendChild(h4);
      const ul = document.createElement('ul');
      walk.forEach(t => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
      box.appendChild(ul); body.appendChild(box);
    }
    // If this panel is open, let its height follow the new content.
    const panel = document.getElementById('body-' + key);
    if (panel && panel.classList.contains('open')) panel.style.maxHeight = panel.scrollHeight + 'px';
  });
}

// ── FAQ (built from content/faq.json → items[]) ─────────────────────────
// Answers can be several paragraphs, and may include a table (used for the
// advisory fee schedule). Add or reorder questions in the CMS.
function renderFaq() {
  const data = (window.__cmsContent || {}).faq;
  const list = document.getElementById('faq-list');
  if (!data || !list) return;
  const items = (data.items || []).filter(i => i && i.q);
  list.innerHTML = '';

  items.forEach(item => {
    const wrap = document.createElement('div');
    wrap.className = 'faq-item';

    const btn = document.createElement('button');
    btn.className = 'faq-q'; btn.setAttribute('type', 'button');
    btn.setAttribute('onclick', 'toggleFaq(this)');
    const span = document.createElement('span'); span.textContent = item.q; btn.appendChild(span);
    const chev = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chev.setAttribute('viewBox', '0 0 24 24'); chev.setAttribute('fill', 'none');
    chev.setAttribute('stroke', 'currentColor'); chev.setAttribute('stroke-width', '2');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly.setAttribute('points', '6 9 12 15 18 9'); chev.appendChild(poly); btn.appendChild(chev);
    wrap.appendChild(btn);

    const ans = document.createElement('div'); ans.className = 'faq-a';
    const inner = document.createElement('div'); inner.className = 'faq-a-inner';
    const addParas = list2 => {
      const arr = Array.isArray(list2) ? list2 : (list2 ? [list2] : []);
      arr.filter(Boolean).forEach(t => {
        const p = document.createElement('p'); p.textContent = t; inner.appendChild(p);
      });
    };
    addParas(item.a);

    if (item.table && (item.table.rows || []).length) {
      const scroll = document.createElement('div'); scroll.className = 'faq-table-wrap';
      const tbl = document.createElement('table'); tbl.className = 'faq-table';
      if ((item.table.headers || []).length) {
        const thead = document.createElement('thead'); const tr = document.createElement('tr');
        item.table.headers.forEach(h => { const th = document.createElement('th'); th.textContent = h; tr.appendChild(th); });
        thead.appendChild(tr); tbl.appendChild(thead);
      }
      const tbody = document.createElement('tbody');
      item.table.rows.forEach(r => {
        const tr = document.createElement('tr');
        (r || []).forEach(c => { const td = document.createElement('td'); td.textContent = c; tr.appendChild(td); });
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody); scroll.appendChild(tbl); inner.appendChild(scroll);
    }

    addParas(item.aAfter);
    ans.appendChild(inner); wrap.appendChild(ans);
    list.appendChild(wrap);
  });

  if (typeof observeAnimations === 'function') setTimeout(observeAnimations, 30);
}

// ── Privacy Policy body (built from content/privacy.json → sections[]) ──
// Each section may have paragraphs, a bullet list, and paragraphs after it.
function renderPrivacy() {
  const data = (window.__cmsContent || {}).privacy;
  const wrap = document.getElementById('privacy-sections');
  if (!data || !wrap) return;
  wrap.innerHTML = '';
  (data.sections || []).filter(s => s && s.title).forEach(s => {
    const sec = document.createElement('div');
    sec.className = 'legal-section anim';
    const h = document.createElement('h3'); h.textContent = s.title; sec.appendChild(h);
    const addParas = list => (list || []).filter(Boolean).forEach(t => {
      const p = document.createElement('p'); p.textContent = t; sec.appendChild(p);
    });
    addParas(s.paras);
    if ((s.bullets || []).filter(Boolean).length) {
      const ul = document.createElement('ul');
      s.bullets.filter(Boolean).forEach(t => {
        const li = document.createElement('li'); li.textContent = t; ul.appendChild(li);
      });
      sec.appendChild(ul);
    }
    addParas(s.parasAfter);
    wrap.appendChild(sec);
  });
  if (typeof observeAnimations === 'function') setTimeout(observeAnimations, 30);
}

// ── Team cards (built from content/about.json → team[]) ─────────────────
// One member gets a wide side-by-side layout so a long bio reads well;
// two or more fall back to the card grid. Blank lines in a bio become
// real paragraphs. A missing photo shows the placeholder, not a broken image.
function renderTeam() {
  const about = (window.__cmsContent || {}).about;
  const grid = document.getElementById('team-grid');
  if (!about || !grid) return;
  const members = (about.team || []).filter(m => m && m.name);
  grid.innerHTML = '';
  grid.classList.toggle('team-solo', members.length === 1);

  members.forEach((m, i) => {
    const card = document.createElement('div');
    card.className = 'team-card anim' + (i ? ' anim-delay-' + Math.min(i, 3) : '');

    if (m.photo) {
      const img = document.createElement('img');
      img.className = 'team-photo'; img.src = m.photo; img.alt = m.name;
      img.setAttribute('loading', 'lazy');
      img.onerror = () => { img.replaceWith(placeholder()); };
      card.appendChild(img);
    } else {
      card.appendChild(placeholder());
    }

    const body = document.createElement('div');
    body.className = 'team-card-body';
    const h = document.createElement('h4'); h.textContent = m.name; body.appendChild(h);
    if (m.role) { const r = document.createElement('div'); r.className = 'team-card-role'; r.textContent = m.role; body.appendChild(r); }
    // Split the bio on blank lines so each paragraph gets real spacing.
    String(m.bio || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean).forEach((para, pi) => {
      const p = document.createElement('p');
      if (pi) p.style.marginTop = '14px';
      p.textContent = para;
      body.appendChild(p);
    });
    card.appendChild(body);
    grid.appendChild(card);
  });

  if (typeof observeAnimations === 'function') setTimeout(observeAnimations, 30);

  function placeholder() {
    const ph = document.createElement('div');
    ph.className = 'img-ph'; ph.setAttribute('data-label', 'Photo');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 48 48'); svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.25');
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', '24'); c.setAttribute('cy', '18'); c.setAttribute('r', '9');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M7 42c0-9.4 7.6-17 17-17s17 7.6 17 17');
    svg.appendChild(c); svg.appendChild(p); ph.appendChild(svg);
    return ph;
  }
}

// ── Resources page (built from content/resources.json) ───────────────────
// Each section renders from a list, so adding items in the CMS just works —
// there is no fixed number of slots to keep in sync.
function renderResources() {
  const data = (window.__cmsContent || {}).resources;
  if (!data) return;

  const el = id => document.getElementById(id);
  const setText = (id, val) => { const n = el(id); if (n && val != null) n.textContent = val; };
  const isExternal = url => /^https?:\/\//i.test(url || '');
  const linkAttrs = (a, url) => {
    a.setAttribute('href', url || '#');
    if (isExternal(url)) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); }
  };
  // A section shows only when it's switched on AND has something to show.
  const showSection = (wrapId, cfg, hasItems) => {
    const wrap = el(wrapId);
    if (!wrap) return false;
    const on = cfg && cfg.show !== false && hasItems;
    wrap.style.display = on ? '' : 'none';
    return on;
  };
  const arrow = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M5 12h14M13 6l6 6-6 6');
    svg.appendChild(p); return svg;
  };

  const jumps = [];

  // Featured -------------------------------------------------------------
  const f = data.featured || {};
  if (showSection('res-featured-wrap', f, true)) {
    setText('res-featured-label', f.label);
    setText('res-featured-heading', f.heading);
    setText('res-featured-body', f.body);
    const btn = el('res-featured-btn');
    if (btn) { btn.textContent = f.buttonLabel || 'Get the guide'; linkAttrs(btn, f.buttonUrl); }
  }

  // Articles -------------------------------------------------------------
  const a = data.articles || {};
  const aItems = (a.items || []).filter(i => i && i.title);
  if (showSection('res-articles-wrap', a, aItems.length)) {
    setText('res-articles-label', a.label); setText('res-articles-heading', a.heading);
    setText('res-articles-intro', a.intro);
    const grid = el('res-articles-grid'); grid.innerHTML = '';
    aItems.forEach((item, i) => {
      const card = document.createElement(isExternal(item.url) ? 'a' : 'div');
      card.className = 'card anim' + (i % 3 ? ' anim-delay-' + (i % 3) : '');
      if (card.tagName === 'A') linkAttrs(card, item.url);
      if (item.date) { const m = document.createElement('div'); m.className = 'res-meta'; m.textContent = item.date; card.appendChild(m); }
      const h = document.createElement('h4'); h.textContent = item.title; card.appendChild(h);
      if (item.summary) { const p = document.createElement('p'); p.textContent = item.summary; card.appendChild(p); }
      const link = document.createElement('span'); link.className = 'res-card-link';
      link.appendChild(document.createTextNode('Read')); link.appendChild(arrow());
      card.appendChild(link);
      grid.appendChild(card);
    });
    jumps.push([a.heading || 'Writing', 'res-articles-wrap']);
  }

  // Videos ---------------------------------------------------------------
  const v = data.videos || {};
  const vItems = (v.items || []).filter(i => i && i.title);
  if (showSection('res-videos-wrap', v, vItems.length)) {
    setText('res-videos-label', v.label); setText('res-videos-heading', v.heading);
    setText('res-videos-intro', v.intro);
    const grid = el('res-videos-grid'); grid.innerHTML = '';
    vItems.forEach((item, i) => {
      const card = document.createElement(isExternal(item.url) ? 'a' : 'div');
      card.className = 'card anim' + (i % 3 ? ' anim-delay-' + (i % 3) : '');
      if (card.tagName === 'A') linkAttrs(card, item.url);
      const play = document.createElement('div'); play.className = 'res-play';
      const psvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      psvg.setAttribute('viewBox', '0 0 24 24'); psvg.setAttribute('fill', 'currentColor');
      const tri = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      tri.setAttribute('d', 'M8 5v14l11-7z'); psvg.appendChild(tri); play.appendChild(psvg);
      card.appendChild(play);
      const h = document.createElement('h4'); h.textContent = item.title; card.appendChild(h);
      if (item.description) { const p = document.createElement('p'); p.textContent = item.description; card.appendChild(p); }
      const link = document.createElement('span'); link.className = 'res-card-link';
      link.appendChild(document.createTextNode('Watch')); link.appendChild(arrow());
      card.appendChild(link);
      grid.appendChild(card);
    });
    const ch = el('res-videos-channel');
    if (ch) {
      ch.textContent = v.channelLabel || 'See all videos on YouTube';
      linkAttrs(ch, v.channelUrl);
      ch.parentElement.style.display = isExternal(v.channelUrl) ? '' : 'none';
    }
    jumps.push([v.heading || 'Video', 'res-videos-wrap']);
  }

  // Guides ---------------------------------------------------------------
  const g = data.guides || {};
  const gItems = (g.items || []).filter(i => i && i.title);
  if (showSection('res-guides-wrap', g, gItems.length)) {
    setText('res-guides-label', g.label); setText('res-guides-heading', g.heading);
    setText('res-guides-intro', g.intro);
    const list = el('res-guides-list'); list.innerHTML = '';
    gItems.forEach(item => {
      const row = document.createElement('div'); row.className = 'res-row';
      const body = document.createElement('div'); body.className = 'res-row-body';
      const h = document.createElement('h4'); h.textContent = item.title; body.appendChild(h);
      if (item.description) { const p = document.createElement('p'); p.textContent = item.description; body.appendChild(p); }
      row.appendChild(body);
      const btn = document.createElement('a'); btn.className = 'btn btn-outline';
      btn.textContent = item.buttonLabel || 'Download'; linkAttrs(btn, item.url);
      row.appendChild(btn);
      list.appendChild(row);
    });
    jumps.push([g.heading || 'Guides', 'res-guides-wrap']);
  }

  // Recommended reading --------------------------------------------------
  const r = data.reading || {};
  const rItems = (r.items || []).filter(i => i && i.title);
  if (showSection('res-reading-wrap', r, rItems.length)) {
    setText('res-reading-label', r.label); setText('res-reading-heading', r.heading);
    setText('res-reading-intro', r.intro);
    const list = el('res-reading-list'); list.innerHTML = '';
    rItems.forEach(item => {
      const row = document.createElement('div'); row.className = 'res-book';
      const h = document.createElement('h4'); h.textContent = item.title; row.appendChild(h);
      if (item.author) { const au = document.createElement('div'); au.className = 'res-author'; au.textContent = item.author; row.appendChild(au); }
      if (item.why) { const p = document.createElement('p'); p.textContent = item.why; row.appendChild(p); }
      list.appendChild(row);
    });
    jumps.push([r.heading || 'Reading', 'res-reading-wrap']);
  }

  // Glossary (reuses the FAQ accordion pattern) ---------------------------
  const gl = data.glossary || {};
  const glItems = (gl.items || []).filter(i => i && i.term);
  if (showSection('res-glossary-wrap', gl, glItems.length)) {
    setText('res-glossary-label', gl.label); setText('res-glossary-heading', gl.heading);
    setText('res-glossary-intro', gl.intro);
    const list = el('res-glossary-list'); list.innerHTML = '';
    glItems.forEach(item => {
      const wrap = document.createElement('div'); wrap.className = 'faq-item';
      const btn = document.createElement('button'); btn.className = 'faq-q';
      btn.setAttribute('type', 'button');
      btn.setAttribute('onclick', 'toggleFaq(this)');
      const span = document.createElement('span'); span.textContent = item.term; btn.appendChild(span);
      const chev = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      chev.setAttribute('viewBox', '0 0 24 24'); chev.setAttribute('fill', 'none');
      chev.setAttribute('stroke', 'currentColor'); chev.setAttribute('stroke-width', '2');
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      poly.setAttribute('points', '6 9 12 15 18 9'); chev.appendChild(poly); btn.appendChild(chev);
      wrap.appendChild(btn);
      const ans = document.createElement('div'); ans.className = 'faq-a';
      const inner = document.createElement('div'); inner.className = 'faq-a-inner';
      const p = document.createElement('p'); p.textContent = item.definition || '';
      inner.appendChild(p); ans.appendChild(inner); wrap.appendChild(ans);
      list.appendChild(wrap);
    });
    jumps.push([gl.heading || 'Glossary', 'res-glossary-wrap']);
  }

  // Jump links -----------------------------------------------------------
  const jn = el('res-jump');
  if (jn) {
    jn.innerHTML = '';
    jumps.forEach(([label, target]) => {
      const a2 = document.createElement('a');
      a2.textContent = label; a2.setAttribute('role', 'button'); a2.setAttribute('tabindex', '0');
      a2.setAttribute('onclick', "jumpToSection('" + target + "')");
      a2.setAttribute('onkeydown', "if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); jumpToSection('" + target + "'); }");
      jn.appendChild(a2);
    });
    jn.style.display = jumps.length > 1 ? '' : 'none';
  }

  if (typeof observeAnimations === 'function') setTimeout(observeAnimations, 30);
}
