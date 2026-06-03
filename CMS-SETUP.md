# Decap CMS — Setup Guide (One Life Advisory)

Your site is plain static HTML. Decap CMS lets you edit the text through a web
admin at **`/admin`**, saving changes straight to your GitHub repo. Vercel then
redeploys automatically. No build step, no database.

## How it works

```
You edit at /admin  →  Decap commits JSON to GitHub  →  Vercel redeploys
                                                      ↘  index.html reads /content/*.json
```

- The editable text lives in **`/content/*.json`**.
- `index.html` reads those files at load and fills in any element marked with a
  `data-cms="..."` attribute (handled by `assets/cms-hydrate.js`).
- The text is also hard-coded in the HTML, so if a JSON file is missing the page
  still shows the original copy (nothing breaks).

---

## One-time setup

### 1. Push this repo to GitHub
Create a GitHub repository and push the project. Note the **`owner/repo`** name.

### 2. Create a GitHub OAuth App
GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**

| Field | Value |
|---|---|
| Application name | One Life Advisory CMS |
| Homepage URL | `https://YOUR-SITE.vercel.app` |
| Authorization callback URL | `https://YOUR-SITE.vercel.app/api/callback` |

Click **Register**, then **Generate a new client secret**. Copy the
**Client ID** and **Client secret**.

### 3. Add the secrets to Vercel
Vercel → your project → **Settings → Environment Variables**:

| Name | Value |
|---|---|
| `GITHUB_OAUTH_ID` | your OAuth App **Client ID** |
| `GITHUB_OAUTH_SECRET` | your OAuth App **Client secret** |

Redeploy after adding them.

### 4. Point the config at your repo
Edit **`admin/config.yml`** and replace the two placeholders:

```yaml
backend:
  repo: OWNER/REPO                       # e.g. justingartman/one-life-advisory
  base_url: https://YOUR-SITE.vercel.app # your live Vercel domain
```

### 5. Deploy on Vercel
Import the GitHub repo into Vercel. No build command or framework is needed —
it's a static site, and the two files in `/api` deploy automatically as
serverless functions.

---

## Using the CMS

1. Go to `https://YOUR-SITE.vercel.app/admin`
2. Click **Login with GitHub** and authorize.
3. Edit content under **Global** (nav, footer, contact) and **Pages**.
4. **Publish** — Decap commits to GitHub, Vercel redeploys, the site updates in
   ~1 minute.

---

## What's editable

**Full coverage — every text block on every page is editable:**

- **Global:** brand, nav button, client-login label + URL, contact email &
  phone, footer tagline, all disclosure paragraphs, copyright.
- **Home:** hero, "Who We Serve," all six service cards, the 5-step preview,
  the philosophy quote/body/button, and the closing CTA.
- **How We Plan:** header, the Clarity Call block, all 5 steps
  (title, paragraphs, outcome), and the closing quote/CTA.
- **What We Do:** header, the "It starts with clarity" block, all six
  accordions (title, subtitle, intro, every subheading, every paragraph, and
  the walk-away list), and the "One Plan, Coordinated" block.
- **Who We Help:** header, all three client groups (with bullet lists), the
  "not a fit" block, and the closing CTA.
- **About:** header, "Why we exist," the three beliefs, "How we're different,"
  all team members (name, role, bio), and the closing CTA.
- **FAQ:** header, all four sections and every question + answer, closing.
- **Schedule:** header and the three highlights.

> Note: a few paragraphs on "What We Do" contain bold lead-ins (e.g.
> **Life Insurance.**). Those fields accept simple HTML, so keep the
> `<strong>…</strong>` tags when editing them.

## Making more text editable (optional)

To expose anything not yet wired (e.g. a new section you add later):

1. Add a key to the relevant `content/<page>.json`, e.g.
   ```json
   { "intro": "Some new text" }
   ```
2. Add a matching `data-cms` attribute in `index.html`:
   ```html
   <p data-cms="faq.intro">Some new text</p>
   ```
   (Namespace = filename with hyphens → underscores: `how-we-plan.json`
   becomes `how_we_plan.*`. Arrays use an index: `home.covers.cards.0.title`.)
3. Add a field for it in `admin/config.yml` so it appears in the editor.

That's the whole pattern — repeat for anything you want editable.

---

## Local note
The `/admin` interface and `/api/*` OAuth functions only run on Vercel (or
`vercel dev`). Opening `index.html` directly still shows the site and reads the
content JSON; it just can't log in to the CMS.
