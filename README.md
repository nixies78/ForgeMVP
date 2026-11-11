# ForgeMVP

Web interface for creating **UEFN game design documents**.

Current milestone: the web shell.

| Page | File | What it does |
| --- | --- | --- |
| Home page | `public/index.html` | Says "Home Page" and links to the admin page. |
| Admin page | `public/admin.html` | OpenRouter API key, LLM dropdown, connection test. |
| Chat test | `public/chat.html` | Live chat with the configured model (DeepSeek by default). |

The admin page is reachable from the **logo in the top-right corner** of every page.

---

## Run it locally

Requires Node.js 18+ (nothing to install - there are no dependencies).

**Easiest:** double-click **`start.bat`** in this folder. It starts the server and opens
your browser on the admin page.

Or from a terminal:

```bash
npm start
```

Then open:

- Home page — <http://localhost:5173/>
- Admin page — <http://localhost:5173/admin.html>
- Chat test — <http://localhost:5173/chat.html>

`npm start` also prints a `http://<your-lan-ip>:5173/` URL so other people on your
network can open the same pages from their machine.

Change the port with `set PORT=8080 && npm start` (Windows) or `PORT=8080 npm start`.

> **Do not open `public/admin.html` by double-clicking it.** That loads the page from a
> `file://` path, and browsers block ES modules over `file://`, so the page scripts never
> run - the buttons do nothing. Always go through `http://localhost:5173/...`. The pages
> now detect this and show a red warning explaining it, and a watchdog reports it if the
> scripts fail to load for any other reason.

## Test it

```bash
npm test
```

26 automated tests, no network and no API key required:

- `tests/openrouter.test.mjs` — the OpenRouter client with a mocked `fetch`:
  key validation, model-list parsing, the connection test's success/failure paths,
  ping, non-streamed chat, streamed chat (SSE parsing, reasoning tokens, error frames),
  and settings persistence.
- `tests/server.test.mjs` — serves every real page and asset over HTTP, checks the
  top-right admin logo link on each page, path-traversal safety, and that every element
  id the scripts look up actually exists in the HTML.

### The manual test (needs a key)

1. `npm start`, open the **admin page**.
2. Paste an OpenRouter key from <https://openrouter.ai/keys> and press **Save**.
3. Press **Test connection** — free, no tokens: confirms the key against
   `GET /api/v1/key` and that the selected model exists in the live catalogue.
4. Press **Send test prompt** — asks the model for a one-word reply, proving
   end-to-end generation works.
5. Open the **chat test** page and have a real conversation.

---

## How the OpenRouter connection works

- Requests go **straight from the browser** to `https://openrouter.ai/api/v1`
  (OpenRouter sends permissive CORS headers, and `HTTP-Referer` / `X-Title` are set).
- The API key is kept in this browser's `localStorage` only. It is never sent to this
  site's server, never logged, and never committed - `.gitignore` blocks `.env` files too.
- Because the key is per-browser, a hosted copy can be shared publicly: each visitor
  pastes their own key on the admin page. No shared secret is exposed.
- Model dropdown: the newest DeepSeek is selected **automatically** from the live
  OpenRouter catalogue the first time the admin page loads - it was
  `deepseek/deepseek-v4.1-flash` when this was written, and it will follow DeepSeek's
  releases without a code change (`pickLatestDeepSeek()` in `public/js/config.js` ranks
  by version, then tier, and skips `:batch` and experimental endpoints). **Refresh models
  from OpenRouter** repulls the list, and the custom-model box accepts any id by hand.
- Save and every action report into a **Result** panel pinned at the top of the admin page,
  so feedback is never off-screen.

---

## Deploying to Google Cloud (continuous deployment)

The app is a zero-dependency static site plus `server.js`, so it runs anywhere Node runs.
For Cloud Run with automatic deploys on every push to `main`:

1. Create the Docker repo and the trigger (exact commands are at the top of
   `cloudbuild.yaml`).
2. Push to `main` — Cloud Build runs the test suite, builds `Dockerfile`, pushes to
   Artifact Registry and deploys the new revision to Cloud Run.

The same `public/` folder can also be dropped onto Firebase Hosting or a Cloud Storage
bucket as a pure static site, since there is no build step.

Future option: move the key server-side (Cloud Run environment variable / Secret Manager)
so all visitors share one key and nobody has to paste one. The client is written so the
model/key resolution is isolated in `public/js/settings.js` and `public/js/openrouter.js`,
so that swap is contained.

---

## Layout

```
public/
  index.html        Home page
  admin.html        Admin page (API key, model dropdown, connection test)
  chat.html         Chat test page
  css/styles.css
  js/config.js      Defaults, model seed list, localStorage wrapper, key helpers
  js/settings.js    Reads/writes the saved key + model
  js/openrouter.js  API client (test, ping, chat, streaming) - DOM-free, unit tested
  js/admin.js       Admin page wiring
  js/chat.js        Chat page wiring
server.js           Zero-dependency static server
tests/              Node test-runner suites
Dockerfile          Cloud Run image
cloudbuild.yaml     Continuous deployment pipeline
```

## Git

See [GIT_SYNC.md](GIT_SYNC.md) for the GitHub setup notes, or just run `sync.bat`
to stage, commit and push everything in one go.
