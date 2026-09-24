/* ─────────────────────────────────────────────────────────────────────────
 * Blog — click-to-play YouTube embeds, and search on /blog.
 *
 * Search uses the Pagefind index the build writes to /pagefind (full text,
 * with highlighted excerpts). If that index can't load, it falls back to
 * matching titles, summaries, and topics from the post list on the page.
 * ───────────────────────────────────────────────────────────────────────── */

// The YouTube player (and its cookies) only loads when someone presses play.
function playYouTube(btn) {
  var id = btn.getAttribute('data-yt');
  if (!/^[\w-]{11}$/.test(id || '')) return;
  var iframe = document.createElement('iframe');
  iframe.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1';
  iframe.title = (btn.getAttribute('aria-label') || '').replace(/^Play video:\s*/, '') || 'YouTube video';
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.setAttribute('allowfullscreen', '');
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  btn.replaceChildren(iframe);
  btn.removeAttribute('onclick');
}

(function () {
  var input = document.getElementById('blog-q');
  var grid = document.getElementById('blog-grid');
  var results = document.getElementById('blog-results');
  var status = document.getElementById('blog-status');
  var dataEl = document.getElementById('blog-posts-data');
  if (!input || !grid || !results || !dataEl) return;

  var posts = [];
  try { posts = JSON.parse(dataEl.textContent); } catch (e) { /* no data: search shows nothing */ }
  var byUrl = {};
  posts.forEach(function (p) { byUrl[p.url] = p; });
  var emptyMessage = input.getAttribute('data-empty') || 'No articles match that search.';

  var pagefind; // undefined = not tried yet, null = unavailable
  function loadPagefind() {
    if (pagefind !== undefined) return Promise.resolve(pagefind);
    return import('/pagefind/pagefind.js')
      .then(function (pf) { pagefind = pf; return pf; })
      .catch(function () { pagefind = null; return null; });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  // Pagefind reports /blog/post.html; the site serves it at /blog/post.
  function cleanUrl(u) { return String(u).replace(/\.html$/, '').replace(/\/index$/, '') || '/'; }

  function fallbackSearch(q) {
    var words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return posts.filter(function (p) {
      var hay = (p.title + ' ' + p.description + ' ' + (p.topics || []).join(' ')).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) > -1; });
    }).map(function (p) { return { post: p, excerpt: esc(p.description) }; });
  }

  function render(items, q) {
    grid.hidden = items !== null;
    results.hidden = items === null;
    if (items === null) { status.textContent = ''; results.innerHTML = ''; return; }
    status.textContent = items.length
      ? items.length + (items.length === 1 ? ' article' : ' articles') + ' for “' + q + '”'
      : emptyMessage;
    results.innerHTML = items.map(function (it) {
      var p = it.post;
      var topic = (p.topics || [])[0];
      return '<a class="blog-result" href="' + esc(p.url) + '">'
        + '<div class="blog-meta">' + (topic ? '<span class="blog-meta-topic">' + esc(topic) + '</span>' : '')
        + '<span>' + esc(p.dateLabel) + '</span></div>'
        + '<h3>' + esc(p.title) + '</h3>'
        + '<p>' + it.excerpt + '</p></a>';
    }).join('');
  }

  var seq = 0;
  function run() {
    var q = input.value.trim();
    var mine = ++seq;
    if (!q) { render(null); return; }
    loadPagefind().then(function (pf) {
      if (!pf) return fallbackSearch(q);
      return pf.debouncedSearch(q, {}, 150).then(function (res) {
        if (!res) return null; // superseded by a newer keystroke
        return Promise.all(res.results.slice(0, 20).map(function (r) { return r.data(); }))
          .then(function (list) {
            return list.map(function (d) {
              var p = byUrl[cleanUrl(d.url)];
              return p ? { post: p, excerpt: d.excerpt } : null; // excerpt is Pagefind's own escaped HTML with <mark>
            }).filter(Boolean);
          });
      });
    }).then(function (items) {
      if (items && mine === seq) render(items, q);
    });
  }

  input.addEventListener('input', run);
  input.addEventListener('focus', loadPagefind, { once: true });
  input.form && input.form.addEventListener('submit', function (e) { e.preventDefault(); run(); });

  // /blog?q=social+security opens with that search filled in
  var initial = new URLSearchParams(location.search).get('q');
  if (initial) { input.value = initial; run(); }
})();
