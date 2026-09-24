/* ─────────────────────────────────────────────────────────────────────────
 * Site build — turns the source (index.html + /content) into the static files
 * Vercel serves. Runs on every deploy (see vercel.json → buildCommand).
 *
 *   npm run build          →  dist/
 *   npm run build:drafts   →  same, plus Draft and In review posts
 *                             (for previewing on your own computer only)
 *
 * What it does:
 *   1. Fills in every page with the current copy from /content, using the same
 *      data-cms bindings as assets/cms-hydrate.js, and builds the FAQ, team,
 *      and other list sections with assets/cms-render.js. Search engines see
 *      the real text, not placeholders.
 *   2. Gives each page its own address and file (/how-we-plan, /faq, …) with
 *      its own title, description, and canonical URL.
 *   3. Builds the blog from content/blog/*.md: /blog, /blog/<post>,
 *      /blog/topics/<topic>, and an RSS feed at /blog/feed.xml (Kit can email
 *      new posts from it).
 *   4. Writes sitemap.xml and robots.txt, and a search index for the blog.
 * ───────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseHTML } from 'linkedom';
import { Marked } from 'marked';
import yaml from 'js-yaml';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.OUT_DIR || 'dist');
const SHOW_DRAFTS = process.argv.includes('--drafts');

const SITE = 'https://onelifeadvisory.com';
const SITE_NAME = 'One Life Advisory';
const DEFAULT_IMAGE = '/assets/og-card.jpg';

const { applyContent } = require(path.join(ROOT, 'assets/cms-hydrate.js'));

// Pages in index.html → their address, content file, and menu label.
const PAGES = {
  'home':        { el: 'page-home',        content: 'home' },
  'how-we-plan': { el: 'page-how-we-plan', content: 'how_we_plan', nav: 'howWePlan' },
  'what-we-do':  { el: 'page-what-we-do',  content: 'what_we_do',  nav: 'whatWeDo' },
  'who-we-help': { el: 'page-who-we-help', content: 'who_we_help', nav: 'whoWeHelp' },
  'about':       { el: 'page-about',       content: 'about',       nav: 'about' },
  'faq':         { el: 'page-faq',         content: 'faq',         nav: 'faq' },
  'resources':   { el: 'page-resources',   content: 'resources',   nav: 'resources' },
  'privacy':     { el: 'page-privacy',     content: 'privacy',     label: 'Privacy Policy' },
  'schedule':    { el: 'page-schedule',    content: 'schedule',    label: 'Schedule a Clarity Call' },
};
const pageHref = id => (id === 'home' ? '/' : '/' + id);

// ── Small helpers ──────────────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = s => String(s ?? '').toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const stripTags = s => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const absUrl = u => (/^https?:\/\//i.test(u) ? u : SITE + (u.startsWith('/') ? '' : '/') + u);
function truncate(s, n = 158) {
  s = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:.\-–—]+$/, '') + '…';
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const isoDate = d => d.toISOString().slice(0, 10);
const longDate = d => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
function toDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? v + 'T00:00:00Z' : v);
  return isNaN(d) ? null : d;
}
const list = v => (Array.isArray(v) ? v : v ? [v] : []).map(x => String(x).trim()).filter(Boolean);
let warnings = 0;
const warn = msg => { warnings++; console.warn('  ! ' + msg); };

function write(rel, contents) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}
const serialize = document => '<!DOCTYPE html>\n' + document.documentElement.outerHTML + '\n';

// ── 1. Content ─────────────────────────────────────────────────────────────
function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${path.relative(ROOT, file)} is not valid JSON (${e.message}). ` +
      'Restore the last good version of that file, then publish again.');
  }
}
const data = {};
for (const f of fs.readdirSync(path.join(ROOT, 'content'))) {
  if (f.endsWith('.json')) data[f.slice(0, -5).replace(/-/g, '_')] = readJSON(path.join(ROOT, 'content', f));
}
const G = data.global || {};
const BLOG = data.blog || {};

// Team photos that point at a file that was never uploaded show the
// placeholder instead of a broken image.
const renderData = structuredClone(data);
for (const m of (renderData.about && renderData.about.team) || []) {
  if (m.photo && m.photo.startsWith('/') && !fs.existsSync(path.join(ROOT, decodeURI(m.photo)))) {
    warn(`Team photo not found: ${m.photo} (showing the placeholder)`);
    m.photo = '';
  }
}

// ── 2. Blog posts ──────────────────────────────────────────────────────────
const STATUS_LABEL = { draft: 'Draft', review: 'In review', published: 'Published' };
const YT_RE = /^\{\{<\s*youtube\s+url="([^"]*)"(?:\s+title="([^"]*)")?\s*>\}\}[ \t]*$/gm;

function youTubeId(url) {
  const s = String(url || '').trim();
  const m = s.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/)
    || s.match(/^([\w-]{11})$/);
  return m ? m[1] : null;
}
const decodeAttr = s => String(s || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

function youTubeEmbed(url, title) {
  const id = youTubeId(url);
  if (!id) { warn(`Not a YouTube link: ${url}`); return ''; }
  const label = title ? decodeAttr(title) : 'YouTube video';
  return `<figure class="yt">` +
    `<button class="yt-frame" type="button" data-yt="${id}" aria-label="Play video: ${esc(label)}" onclick="playYouTube(this)">` +
    `<img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy" decoding="async">` +
    `<span class="yt-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg></span>` +
    `</button>` +
    (title ? `<figcaption>${esc(label)}</figcaption>` : '') +
    `<noscript><a href="https://www.youtube.com/watch?v=${id}">Watch on YouTube</a></noscript>` +
    `</figure>`;
}

const marked = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const level = Math.max(depth, 2); // the post title is the page's only h1
      return `<h${level} id="${slugify(stripTags(text))}">${text}</h${level}>\n`;
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const external = /^https?:\/\//i.test(href) && !/^https?:\/\/(www\.)?onelifeadvisory\.com/i.test(href);
      return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}` +
        `${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>`;
    },
    image({ href, title, text }) {
      return `<img src="${esc(href)}" alt="${esc(text)}"${title ? ` title="${esc(title)}"` : ''} loading="lazy" decoding="async">`;
    },
  },
});

function renderMarkdown(md) {
  // YouTube blocks (inserted with the YouTube button in /admin) become
  // click-to-play embeds; blank lines keep them out of paragraphs.
  const withVideos = md.replace(YT_RE, (_, url, title) => '\n' + youTubeEmbed(url, title) + '\n');
  return marked.parse(withVideos)
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>');
}

function loadPosts() {
  const dir = path.join(ROOT, 'content', 'blog');
  if (!fs.existsSync(dir)) return [];
  const posts = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
    if (!m) { warn(`content/blog/${f} has no settings block (the part between the --- lines); skipped`); continue; }
    let fm;
    try { fm = yaml.load(m[1]) || {}; } catch (e) { warn(`content/blog/${f}: ${e.message}; skipped`); continue; }
    if (!fm.title) { warn(`content/blog/${f} has no title; skipped`); continue; }
    const file = f.slice(0, -3); // the post's id: related-post picks refer to this
    const date = toDate(fm.date) || fs.statSync(path.join(dir, f)).mtime;
    const updated = toDate(fm.updated);
    const html = renderMarkdown(m[2]);
    const text = stripTags(html);
    posts.push({
      file,
      wantedSlug: slugify(fm.urlSlug),
      oldSlugs: list(fm.oldAddresses).map(a => slugify(a.replace(/^.*\/blog\//, ''))).filter(Boolean),
      title: String(fm.title).trim(),
      description: String(fm.description || '').trim() || truncate(text, 155),
      date,
      updated: updated && updated > date ? updated : null,
      status: STATUS_LABEL[String(fm.status || '').toLowerCase()] ? String(fm.status).toLowerCase() : 'draft',
      topics: list(fm.topics),
      related: list(fm.related),
      image: String(fm.image || '').trim(),
      imageAlt: String(fm.imageAlt || '').trim(),
      html,
      minutes: Math.max(1, Math.round(text.split(' ').length / 225)),
    });
  }
  return posts
    .filter(p => p.status === 'published' || SHOW_DRAFTS)
    .sort((a, b) => b.date - a.date || a.title.localeCompare(b.title));
}

// Each post's address: the Web address set in /admin, or the one made from
// its title. Addresses a post used before (the title-based one, and any listed
// under "Old addresses") forward to the current one.
const RESERVED = new Set(['topics', 'feed', 'index']);
function assignAddresses(list) {
  const live = new Map();
  for (const p of [...list].sort((a, b) => a.date - b.date)) { // the older post keeps a contested address
    let slug = p.wantedSlug || p.file;
    if (RESERVED.has(slug) || live.has(slug)) {
      warn(`"${p.title}": /blog/${slug} is ${RESERVED.has(slug) ? 'reserved' : 'already used by another post'}; using /blog/${p.file}`);
      slug = p.file;
    }
    if (live.has(slug)) slug = `${p.file}-${p.date.getUTCFullYear()}`;
    live.set(slug, p);
    p.slug = slug;
    p.url = `/blog/${slug}`;
  }
  const forwards = new Map();
  for (const p of list) {
    for (const from of [p.file, ...p.oldSlugs]) {
      if (from !== p.slug && !live.has(from) && !RESERVED.has(from) && !forwards.has(from)) forwards.set(from, p.url);
    }
  }
  return forwards;
}

const posts = loadPosts();
const forwards = assignAddresses(posts);
const hasBlog = posts.length > 0;
const postByFile = Object.fromEntries(posts.map(p => [p.file, p]));

// Topics in the order set in /admin → Blog Settings, then any others in use.
const topicOrder = list((BLOG.topics || []).map(t => t && t.name));
const usedTopics = new Set(posts.flatMap(p => p.topics));
const topics = [...topicOrder.filter(t => usedTopics.has(t)),
  ...[...usedTopics].filter(t => !topicOrder.includes(t)).sort()]
  .map(name => ({ name, slug: slugify(name), url: `/blog/topics/${slugify(name)}` }));

function relatedPosts(post) {
  const picked = post.related.map(f => postByFile[f]).filter(p => p && p !== post);
  const rest = posts.filter(p => p !== post && !picked.includes(p))
    .map(p => ({ p, shared: p.topics.filter(t => post.topics.includes(t)).length }))
    .sort((a, b) => b.shared - a.shared || b.p.date - a.p.date)
    .map(x => x.p);
  return [...picked, ...rest].slice(0, 3);
}

// ── 3. The page shell ──────────────────────────────────────────────────────
// index.html with every binding filled and every list section built, once.
function buildFilledSource() {
  const { document, window } = parseHTML(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  for (const [id, p] of Object.entries(PAGES)) {
    if (!document.getElementById(p.el)) throw new Error(`index.html has no #${p.el} (page "${id}")`);
  }
  applyContent(document, data, document);

  const ctx = vm.createContext({ window: { __cmsContent: renderData }, document, console });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/cms-render.js'), 'utf8'), ctx);
  for (const fn of ['renderWhatWeDo', 'renderFaq', 'renderPrivacy', 'renderTeam', 'renderResources']) ctx[fn]();
  // Heights are measured in the browser; drop the placeholders the build can't know.
  document.querySelectorAll('[style*="undefinedpx"], [style*="NaNpx"]').forEach(el => {
    el.setAttribute('style', el.getAttribute('style').replace(/max-height:\s*(undefined|NaN)px;?\s*/g, ''));
    if (!el.getAttribute('style').trim()) el.removeAttribute('style');
  });

  // The booking calendar loads in the browser; until it does (or without
  // JavaScript), show a link to it instead of the "add your link" setup note.
  const cal = document.getElementById('calendly-embed');
  const calUrl = data.schedule && data.schedule.calendlyUrl;
  const calNote = cal && cal.querySelector('p');
  if (calUrl && calNote) {
    calNote.innerHTML = `Loading the calendar… If it doesn't appear, <a href="${esc(calUrl)}" target="_blank" ` +
      `rel="noopener noreferrer" style="color:var(--navy);text-decoration:underline">open it in a new tab</a>.`;
  }

  document.documentElement.setAttribute('data-prerendered', '');
  showBlogLinks(document);
  return serialize(document);
}

// The Blog links (menu, mobile menu, footer) appear once a post is published.
function showBlogLinks(root) {
  root.querySelectorAll('[data-blog-link]').forEach(a => {
    if (hasBlog) a.removeAttribute('style'); else a.remove();
  });
}
const FILLED = buildFilledSource();

// A fresh copy of the filled page, keeping only `keepId` (or no page at all).
function shell(keepId) {
  const { document } = parseHTML(FILLED);
  const keep = keepId ? document.getElementById(keepId) : null;
  const anchor = document.getElementById('nav-drawer');
  document.querySelectorAll('.page').forEach(p => { if (p !== keep) p.remove(); });
  const tpl = document.getElementById('footer-template');
  const footerHTML = tpl ? tpl.innerHTML : '';
  if (tpl) tpl.remove();

  // Menu and footer links become real links to each page's address.
  const GO = /^\s*go\('([\w-]+)'\)\s*;?\s*(?:closeMenu\(\)\s*;?\s*)?(?:return false\s*;?)?\s*$/;
  const linkify = root => root.querySelectorAll('a[onclick]').forEach(a => {
    const m = a.getAttribute('onclick').match(GO);
    if (!m || !PAGES[m[1]]) return;
    a.setAttribute('href', pageHref(m[1]));
    a.removeAttribute('onclick');
  });

  const fillFooter = footer => {
    if (!footer || footer.children.length) return;
    footer.innerHTML = footerHTML;
    applyContent(footer, data, document);
    showBlogLinks(footer);
    linkify(footer);
  };
  linkify(document);
  return { document, keep, anchor, fillFooter };
}

function setHead(document, { title, description, url, image, type = 'website', noindex = false, jsonld = [], extra = '', social = true }) {
  const head = document.head;
  const upsert = (attr, key, content) => {
    let el = head.querySelector(`meta[${attr}="${key}"]`);
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); head.appendChild(el); }
    el.setAttribute('content', content);
  };
  head.querySelector('title').textContent = title;
  upsert('name', 'description', description);
  upsert('property', 'og:type', type);
  upsert('property', 'og:site_name', SITE_NAME);
  upsert('property', 'og:url', url);
  if (social) {
    upsert('property', 'og:title', title);
    upsert('property', 'og:description', description);
    upsert('name', 'twitter:title', title);
    upsert('name', 'twitter:description', description);
  }
  if (image) {
    upsert('property', 'og:image', absUrl(image));
    upsert('name', 'twitter:image', absUrl(image));
    if (image !== DEFAULT_IMAGE) head.querySelectorAll('meta[property^="og:image:"]').forEach(m => m.remove());
  }
  let canonical = head.querySelector('link[rel="canonical"]');
  if (!canonical) { canonical = document.createElement('link'); canonical.setAttribute('rel', 'canonical'); head.appendChild(canonical); }
  canonical.setAttribute('href', url);
  if (noindex) upsert('name', 'robots', 'noindex');
  for (const obj of jsonld) {
    const s = document.createElement('script');
    s.setAttribute('type', 'application/ld+json');
    s.textContent = JSON.stringify(obj).replace(/</g, '\\u003c');
    head.appendChild(s);
  }
  if (extra) head.insertAdjacentHTML('beforeend', extra);
}

function setNavState(document, pageId) {
  const nav = document.getElementById('nav');
  if (nav) nav.classList.add(pageId === 'home' ? 'over-hero' : 'scrolled');
  const link = document.getElementById('nl-' + pageId);
  if (link) link.classList.add('active');
}

// ── 4. Site pages ──────────────────────────────────────────────────────────
const ORG = {
  '@type': 'FinancialService',
  '@id': SITE + '/#organization',
  name: SITE_NAME,
  url: SITE + '/',
  logo: SITE + '/assets/logos/favicon-180.png',
  image: SITE + DEFAULT_IMAGE,
  email: G.contactEmail || undefined,
  telephone: G.contactPhone || undefined,
  areaServed: { '@type': 'Country', name: 'United States' },
};
const sitemap = [];

function buildSitePage(pageId) {
  const p = PAGES[pageId];
  const c = data[p.content] || {};
  const { document, keep, fillFooter } = shell(p.el);
  keep.classList.add('active');
  fillFooter(keep.querySelector('footer'));
  setNavState(document, pageId);

  const seo = c.seo || {};
  const head = document.head;
  const label = (p.nav && G.nav && G.nav[p.nav]) || (pageId === 'schedule' && G.navCta) || p.label;
  const url = SITE + pageHref(pageId);
  const hidden = pageId === 'resources' && G.showResources === false;

  if (pageId === 'home') {
    setHead(document, {
      title: seo.title || head.querySelector('title').textContent,
      description: seo.description || head.querySelector('meta[name="description"]').getAttribute('content'),
      url,
      social: false, // home keeps its own social-share title and description
      jsonld: [{ '@context': 'https://schema.org', ...ORG }],
    });
  } else {
    setHead(document, {
      title: seo.title || `${label} | ${SITE_NAME}`,
      description: seo.description || truncate(c.heroSub || head.querySelector('meta[name="description"]').getAttribute('content')),
      url,
      noindex: hidden,
    });
    // Only the home page shows the hero photo.
    head.querySelectorAll('link[rel="preload"][href="/assets/hero.webp"]').forEach(l => l.remove());
  }

  write(pageId === 'home' ? 'index.html' : pageId + '.html', serialize(document));
  if (!hidden) sitemap.push({ loc: url });
}

// ── 5. Blog pages ──────────────────────────────────────────────────────────
const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const blogHead = '<link rel="stylesheet" href="/assets/blog.css">' +
  `<link rel="alternate" type="application/rss+xml" title="${esc(SITE_NAME)} Blog" href="/blog/feed.xml">`;
const draftBadge = p => (p.status === 'published' ? '' : `<span class="blog-badge">${STATUS_LABEL[p.status]}</span>`);
const lead = data.home && data.home.leadMagnet;
const finalCta = (data.home && data.home.finalCta) || {};
const author = ((data.about && data.about.team) || []).find(m => m && m.name) || null;
const authorPhoto = ((renderData.about && renderData.about.team) || []).find(m => m && m.name)?.photo || '';
// The guide sign-up form from the home page, reused at the end of each post.
const leadForm = (lead && lead.show !== false &&
  (parseHTML(FILLED).document.querySelector('#page-home .lm-embed') || {}).outerHTML) || '';

function card(p, featured = false) {
  const topic = p.topics[0];
  // Posts without a featured image get a text card (a navy banner when featured).
  const img = p.image
    ? `<div class="blog-card-img"><img src="${esc(p.image)}" alt="${esc(p.imageAlt)}" loading="lazy" decoding="async"></div>`
    : '';
  return `<article class="blog-card${featured ? ' featured' : ''}${p.image ? '' : ' no-image'} anim">` +
    `<a class="blog-card-link" href="${p.url}">` + img +
    `<div class="blog-card-body">` +
    `<div class="blog-meta">${topic ? `<span class="blog-meta-topic">${esc(topic)}</span>` : ''}` +
    `<time datetime="${isoDate(p.date)}">${longDate(p.date)}</time>${draftBadge(p)}</div>` +
    `<h3>${esc(p.title)}</h3><p>${esc(p.description)}</p>` +
    `<span class="blog-card-more">${esc(BLOG.readMoreLabel || 'Read article')} ${ARROW}</span>` +
    `</div></a></article>`;
}

function pageHero(eyebrow, title, sub) {
  return `<section class="page-hero">` +
    `<div class="hero-bg"></div><div class="hero-atmos"></div><div class="hero-scrim"></div>` +
    `<div class="page-hero-inner">` +
    `<div class="hero-eyebrow anim">${esc(eyebrow)}</div>` +
    `<h1 class="reveal-mask anim-delay-1">${esc(title)}</h1>` +
    (sub ? `<p class="page-hero-sub anim anim-delay-2">${esc(sub)}</p>` : '') +
    `</div></section>`;
}

function mountBlogPage(document, anchor, fillFooter, inner) {
  const page = document.createElement('div');
  page.className = 'page active';
  page.id = 'page-blog';
  page.innerHTML = inner + '<footer id="footer-blog"></footer>';
  anchor.parentNode.insertBefore(page, anchor.nextSibling);
  fillFooter(page.querySelector('#footer-blog'));
  const script = document.createElement('script');
  script.setAttribute('src', '/assets/blog.js');
  document.body.appendChild(script);
  setNavState(document, 'blog');
  document.head.querySelectorAll('link[rel="preload"][href="/assets/hero.webp"]').forEach(l => l.remove());
}

function buildBlogList(topic) {
  const { document, anchor, fillFooter } = shell(null);
  const shown = topic ? posts.filter(p => p.topics.includes(topic.name)) : posts;
  const chips = [`<a class="chip${topic ? '' : ' is-active'}" href="/blog"${topic ? '' : ' aria-current="page"'}>${esc(BLOG.allTopicsLabel || 'All')}</a>`,
    ...topics.map(t => `<a class="chip${topic && t.slug === topic.slug ? ' is-active' : ''}" href="${t.url}"` +
      `${topic && t.slug === topic.slug ? ' aria-current="page"' : ''}>${esc(t.name)}</a>`)].join('');
  const postsData = posts.map(p => ({ url: p.url, title: p.title, description: p.description,
    topics: p.topics, dateLabel: longDate(p.date) }));
  const eyebrow = BLOG.heroEyebrow || 'Blog';

  mountBlogPage(document, anchor, fillFooter,
    pageHero(eyebrow, topic ? topic.name : (BLOG.heroTitle || 'Blog'), topic ? '' : BLOG.heroSub) +
    `<section class="section blog-index"><div class="container">` +
    `<div class="blog-tools anim">` +
    `<form class="blog-search" role="search" action="/blog">` +
    `<label class="sr-only" for="blog-q">${esc(BLOG.searchPlaceholder || 'Search articles')}</label>` +
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>` +
    `<input id="blog-q" name="q" type="search" autocomplete="off" placeholder="${esc(BLOG.searchPlaceholder || 'Search articles')}" data-empty="${esc(BLOG.emptyMessage || 'No articles match that search.')}">` +
    `</form>` +
    (topics.length ? `<nav class="blog-topics" aria-label="Topics">${chips}</nav>` : '') +
    `</div>` +
    `<p class="blog-status" id="blog-status" aria-live="polite"></p>` +
    `<div class="blog-grid" id="blog-grid">${shown.map((p, i) => card(p, i === 0 && !topic)).join('')}</div>` +
    `<div class="blog-results" id="blog-results" hidden></div>` +
    `<script type="application/json" id="blog-posts-data">${JSON.stringify(postsData).replace(/</g, '\\u003c')}</script>` +
    `</div></section>`);

  const url = SITE + (topic ? topic.url : '/blog');
  setHead(document, {
    title: topic ? `${topic.name} | ${eyebrow} | ${SITE_NAME}` : `${BLOG.seoTitle || eyebrow} | ${SITE_NAME}`,
    description: topic
      ? truncate(`Articles on ${topic.name} from ${SITE_NAME}` +
        (shown[0] ? `, including “${shown[0].title}”` : '') + (/[.?!]$/.test(shown[0]?.title || '') ? '' : '.'))
      : truncate(BLOG.seoDescription || BLOG.heroSub || ''),
    url,
    image: DEFAULT_IMAGE,
    noindex: SHOW_DRAFTS,
    extra: blogHead,
  });
  write(topic ? `blog/topics/${topic.slug}.html` : 'blog/index.html', serialize(document));
  sitemap.push({ loc: url, lastmod: shown[0] && isoDate(shown[0].updated || shown[0].date) });
}

function buildPost(p) {
  const { document, anchor, fillFooter } = shell(null);
  const topic = topics.find(t => t.name === p.topics[0]);
  const related = relatedPosts(p);
  const disclosure = BLOG.postDisclosure || (G.disclosures || [])[1] || '';
  const bioFirst = author ? String(author.bio || '').split(/\n\s*\n/)[0].trim() : '';

  const meta = [`<time datetime="${isoDate(p.date)}">${longDate(p.date)}</time>`,
    `<span>${p.minutes} min read</span>`];
  if (p.updated) meta.push(`<span>Updated <time datetime="${isoDate(p.updated)}">${longDate(p.updated)}</time></span>`);

  mountBlogPage(document, anchor, fillFooter,
    `<article class="post" data-pagefind-body>` +
    `<header class="page-hero post-hero">` +
    `<div class="hero-bg"></div><div class="hero-atmos"></div><div class="hero-scrim"></div>` +
    `<div class="page-hero-inner">` +
    `<nav class="post-crumbs anim" aria-label="Breadcrumb" data-pagefind-ignore>` +
    `<a href="/blog">${esc(BLOG.heroEyebrow || 'Blog')}</a>` +
    (topic ? `<span aria-hidden="true">/</span><a href="${topic.url}">${esc(topic.name)}</a>` : '') +
    `</nav>` +
    `<h1 class="reveal-mask anim-delay-1">${esc(p.title)}</h1>` +
    `<div class="post-meta anim anim-delay-2" data-pagefind-ignore>${meta.join('<span aria-hidden="true">·</span>')}</div>` +
    `</div></header>` +
    `<div class="post-main section-sm"><div class="container-sm">` +
    (p.status !== 'published' ? `<div class="draft-banner" data-pagefind-ignore><strong>${STATUS_LABEL[p.status]}:</strong> ` +
      `this post isn't on the live site. Set its Status to Published in /admin when it's approved.</div>` : '') +
    (p.image ? `<figure class="post-figure"><img src="${esc(p.image)}" alt="${esc(p.imageAlt)}" decoding="async"></figure>` : '') +
    `<div class="prose">${p.html}</div>` +
    (disclosure ? `<p class="post-disclosure" data-pagefind-ignore>${esc(disclosure)}</p>` : '') +
    (p.topics.length ? `<div class="post-tags" data-pagefind-ignore><span class="post-tags-label">Filed under</span>` +
      p.topics.map(t => `<a class="chip" href="/blog/topics/${slugify(t)}">${esc(t)}</a>`).join('') + `</div>` : '') +
    `</div></div></article>` +

    (author ? `<section class="section-sm post-author-wrap" style="padding-top:0"><div class="container-sm">` +
      `<div class="post-author anim">` +
      (authorPhoto ? `<img class="post-author-photo" src="${esc(authorPhoto)}" alt="${esc(author.name)}" loading="lazy">` : '<div></div>') +
      `<div><div class="label">${esc(BLOG.authorLabel || 'Written by')}</div>` +
      `<h3>${esc(author.name)}</h3>` +
      (author.role ? `<div class="post-author-role">${esc(author.role)}</div>` : '') +
      (bioFirst ? `<p>${esc(bioFirst)}</p>` : '') +
      `<a class="btn-ghost post-author-link" href="/about">${esc(BLOG.authorLinkLabel || 'More about us')} →</a>` +
      `</div></div></div></section>` : '') +

    `<section class="section-sm post-next" style="padding-top:0"><div class="container">` +
    `<div class="next-grid${leadForm ? '' : ' single'}">` +
    `<div class="next-card next-talk anim">` +
    `<div class="label">${esc(finalCta.label || 'Get Started')}</div>` +
    `<h2>${esc(finalCta.heading || 'Ready to talk?')}</h2>` +
    (finalCta.sub ? `<p>${esc(finalCta.sub)}</p>` : '') +
    `<a class="btn btn-primary" href="/schedule">${esc(finalCta.button || G.navCta || 'Schedule a Clarity Call')}</a>` +
    `</div>` +
    (leadForm ? `<div class="next-card next-guide anim anim-delay-1">` +
      `<div class="label">${esc(lead.label || 'Free Guide')}</div>` +
      `<h2>${esc(lead.heading || '')}</h2>` +
      (lead.body ? `<p>${esc(lead.body)}</p>` : '') +
      leadForm + `</div>` : '') +
    `</div></div></section>` +

    (related.length ? `<section class="section-sm post-related" style="background:var(--bg2);border-top:1px solid var(--border)">` +
      `<div class="container"><div class="label">${esc(BLOG.heroEyebrow || 'Blog')}</div>` +
      `<h2>${esc(BLOG.relatedHeading || 'Keep reading')}</h2>` +
      `<div class="blog-grid">${related.map(r => card(r)).join('')}</div></div></section>` : ''));

  const url = SITE + p.url;
  const image = p.image || DEFAULT_IMAGE;
  setHead(document, {
    title: `${p.title} | ${SITE_NAME}`,
    description: truncate(p.description),
    url,
    image,
    type: 'article',
    noindex: p.status !== 'published',
    extra: blogHead +
      `<meta property="article:published_time" content="${p.date.toISOString()}">` +
      (p.updated ? `<meta property="article:modified_time" content="${p.updated.toISOString()}">` : '') +
      p.topics.map(t => `<meta property="article:tag" content="${esc(t)}">`).join(''),
    jsonld: [{
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: p.title,
      description: p.description,
      datePublished: isoDate(p.date),
      dateModified: isoDate(p.updated || p.date),
      image: absUrl(image),
      url,
      mainEntityOfPage: url,
      keywords: p.topics.join(', ') || undefined,
      author: author ? { '@type': 'Person', name: author.name, jobTitle: author.role || undefined, url: SITE + '/about' } : undefined,
      publisher: { '@id': SITE + '/#organization', '@type': 'Organization', name: SITE_NAME,
        logo: { '@type': 'ImageObject', url: SITE + '/assets/logos/favicon-180.png' } },
    }, {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: BLOG.heroEyebrow || 'Blog', item: SITE + '/blog' },
        ...(topic ? [{ '@type': 'ListItem', position: 2, name: topic.name, item: SITE + topic.url }] : []),
        { '@type': 'ListItem', position: topic ? 3 : 2, name: p.title, item: url },
      ],
    }],
  });
  write(`blog/${p.slug}.html`, serialize(document));
  if (p.status === 'published') sitemap.push({ loc: url, lastmod: isoDate(p.updated || p.date) });
}

// A tiny page at an old address that sends visitors (and Google) to the new one.
function buildForward(from, to) {
  write(`blog/${from}.html`, `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>This article has moved | ${esc(SITE_NAME)}</title>
  <link rel="canonical" href="${SITE}${to}">
  <meta http-equiv="refresh" content="0; url=${to}">
  <script>location.replace(${JSON.stringify(to)} + location.search + location.hash);</script>
</head>
<body>
  <p>This article has moved to <a href="${to}">${SITE.replace('https://', '')}${to}</a>.</p>
</body>
</html>
`);
}

function buildFeed() {
  const live = posts.filter(p => p.status === 'published').slice(0, 30);
  const absolutize = html => html.replace(/(src|href)="\/(?!\/)/g, `$1="${SITE}/`);
  const items = live.map(p => `
    <item>
      <title>${esc(p.title)}</title>
      <link>${SITE}${p.url}</link>
      <guid isPermaLink="true">${SITE}${p.url}</guid>
      <pubDate>${p.date.toUTCString()}</pubDate>
      <description>${esc(p.description)}</description>
${p.topics.map(t => `      <category>${esc(t)}</category>`).join('\n')}
      <content:encoded><![CDATA[${absolutize(p.html).replace(/]]>/g, ']]]]><![CDATA[>')}]]></content:encoded>
    </item>`).join('');
  write('blog/feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(SITE_NAME)} Blog</title>
    <link>${SITE}/blog</link>
    <atom:link href="${SITE}/blog/feed.xml" rel="self" type="application/rss+xml"/>
    <description>${esc(BLOG.heroSub || '')}</description>
    <language>en-us</language>
${live[0] ? `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>` : ''}${items}
  </channel>
</rss>
`);
}

// ── 6. Search index (blog posts only) ──────────────────────────────────────
async function buildSearchIndex() {
  try {
    const pagefind = await import('pagefind');
    const { index, errors } = await pagefind.createIndex({});
    if (errors && errors.length) throw new Error(errors.join('; '));
    const added = await index.addDirectory({ path: OUT, glob: 'blog/**/*.html' });
    if (added.errors && added.errors.length) throw new Error(added.errors.join('; '));
    await index.writeFiles({ outputPath: path.join(OUT, 'pagefind') });
    await pagefind.close();
    console.log(`  search index: ${added.page_count} pages`);
  } catch (e) {
    // The site still works; search falls back to titles and summaries.
    warn(`Search index skipped (${e.message})`);
  }
}

// ── Run ────────────────────────────────────────────────────────────────────
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// Static files. Blog posts are published only as the pages built below, so
// drafts in content/blog never become public files.
for (const item of ['assets', 'admin', 'content', '404.html']) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) continue;
  fs.cpSync(src, path.join(OUT, item), {
    recursive: true,
    filter: s => !s.startsWith(path.join(ROOT, 'content', 'blog') + path.sep) &&
      s !== path.join(ROOT, 'content', 'blog') && !s.endsWith('.DS_Store'),
  });
}

for (const id of Object.keys(PAGES)) buildSitePage(id);
if (hasBlog) {
  buildBlogList(null);
  for (const t of topics) buildBlogList(t);
  for (const p of posts) buildPost(p);
  for (const [from, to] of forwards) buildForward(from, to);
  buildFeed();
  await buildSearchIndex();
}

write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap.map(u => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`);
write('robots.txt', `User-agent: *
Disallow: /admin/

Sitemap: ${SITE}/sitemap.xml
`);

const counts = posts.reduce((a, p) => ((a[p.status] = (a[p.status] || 0) + 1), a), {});
console.log(`Built ${Object.keys(PAGES).length} pages and ${posts.length} blog post(s)` +
  (SHOW_DRAFTS ? ` (including drafts: ${JSON.stringify(counts)})` : '') +
  ` → ${path.relative(ROOT, OUT) || OUT}` + (warnings ? ` with ${warnings} warning(s)` : ''));
