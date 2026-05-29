# PitchPace — marketing site

Static landing site that advertises PitchPace, hosts the downloadable `.zip`, and
includes the Privacy Policy and Terms. No build step — plain HTML/CSS/JS.

```
website/
├── index.html              landing page
├── privacy.html            Privacy Policy
├── terms.html              Terms & Conditions
├── _headers                Cloudflare Pages security headers + caching
├── assets/
│   ├── styles.css
│   ├── main.js             nav toggle + reveal-on-scroll (progressive enhancement)
│   └── screenshots/*.jpg   app screenshots
└── downloads/
    └── pitchpace.zip       the downloadable app
```

## Preview locally

```bash
cd website
python3 -m http.server 4000      # → http://localhost:4000
```

## Deploy the site to Cloudflare Pages

The site is fully static, so deploy is trivial.

**Option A — CLI (Wrangler):**

```bash
cd website
npx wrangler pages deploy . --project-name pitchpace
```

**Option B — Dashboard:** Cloudflare → Workers & Pages → Create → Pages → connect
the repo (or "Direct Upload"). Settings:

- **Build command:** _(none)_
- **Build output directory:** `website`

The `_headers` file applies a strict CSP and other security headers automatically.

### Refreshing the download

`downloads/pitchpace.zip` is a packaged copy of the app source. To regenerate it
after changing the app, re-run the packaging step (see the repo's build notes) or
re-zip the project (excluding `node_modules`, `dist`, `__pycache__`, `backend/data`,
`.git`, and `website/`) into `website/downloads/pitchpace.zip`.

## Deploy the live app/demo to Railway

The app (not this site) deploys to Railway via the repo's `Dockerfile` +
`railway.toml`:

```bash
railway init        # or link an existing project
railway up
```

Railway auto-detects the Dockerfile, builds the UI, and serves UI + API on `$PORT`.
Health check: `/api/health`. To offer AI in a shared demo, set `ANTHROPIC_API_KEY`
in Railway → Variables (otherwise visitors use their own key in the UI). Attach a
volume at `/app/backend/data` to persist the demo database.

Once the app is live, you can link to it from the site (e.g. add a "Live demo"
button in `index.html` pointing at your Railway URL).
