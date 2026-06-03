/* ─────────────────────────────────────────────────────────────────────────
 * CMS hydration — reads the JSON files in /content and injects the text into
 * any element that has a data-cms="path.to.value" attribute.
 *
 * Namespacing: each file in /content is loaded under a key matching its name
 * with hyphens converted to underscores. So:
 *    content/global.json        →  global.*
 *    content/home.json          →  home.*
 *    content/how-we-plan.json   →  how_we_plan.*
 *
 * Examples used in index.html:
 *    <span data-cms="home.hero.eyebrow">…</span>
 *    <p   data-cms="home.whoWeServe.body">…</p>
 *    <h4  data-cms="home.covers.cards.0.title">…</h4>   (arrays by index)
 *    <a   data-cms-attr="href:global.clientLoginUrl">…</a>  (set an attribute)
 *
 * This is non-destructive: the HTML already contains the same text, so if a
 * file is missing or a key is absent, the original text simply stays.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  var FILES = [
    "global", "home", "how-we-plan", "what-we-do",
    "who-we-help", "about", "faq", "schedule"
  ];

  function keyFor(file) { return file.replace(/-/g, "_"); }

  function resolve(obj, path) {
    return path.split(".").reduce(function (o, k) {
      return (o == null) ? undefined : o[k];
    }, obj);
  }

  var CACHE = null; // loaded content, kept so dynamically-injected DOM (footer) can re-hydrate

  function apply(root) {
    if (!CACHE) return;
    root = root || document;
    // Text content
    root.querySelectorAll("[data-cms]").forEach(function (el) {
      var val = resolve(CACHE, el.getAttribute("data-cms"));
      if (val == null) return;
      if (el.hasAttribute("data-cms-html")) el.innerHTML = val;
      else el.textContent = val;
    });
    // Attribute bindings: data-cms-attr="href:global.clientLoginUrl;title:home.hero.eyebrow"
    root.querySelectorAll("[data-cms-attr]").forEach(function (el) {
      el.getAttribute("data-cms-attr").split(";").forEach(function (pair) {
        var idx = pair.indexOf(":");
        if (idx === -1) return;
        var attr = pair.slice(0, idx).trim();
        var path = pair.slice(idx + 1).trim();
        var val = resolve(CACHE, path);
        if (val != null) el.setAttribute(attr, val);
      });
    });
  }

  // Exposed so index.html can re-hydrate cloned content (e.g. the footer template).
  window.cmsHydrate = apply;

  function load() {
    var data = {};
    Promise.all(FILES.map(function (f) {
      return fetch("/content/" + f + ".json", { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (json) { if (json) data[keyFor(f)] = json; })
        .catch(function () { /* keep original HTML on failure */ });
    })).then(function () { CACHE = data; apply(document); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();
