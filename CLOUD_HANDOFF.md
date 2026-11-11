# ForgeMVP — Cloud Run handoff brief

**Audience:** an AI assistant (or engineer) on another computer, with access to a Google Cloud
project and to the GitHub repo `nixies78/ForgeMVP`.

**Your job:** deploy ForgeMVP to Cloud Run and set up continuous deployment on push to `main`.

---

## Paste this into the other assistant

> Read `CLOUD_HANDOFF.md` in the ForgeMVP repo and work through it. The Dockerfile, .dockerignore
> and cloudbuild.yaml already exist and the repo is pushed, but **nothing has ever been deployed
> and the image has never been built once**. Start by reading the "What is NOT done" section
> (§3), then follow §5 in order. Ask me for the GCP project ID before creating anything.
> Report back using the template in §11.

---

## 1. What ForgeMVP is

| | |
| --- | --- |
| Purpose | Web interface for creating UEFN game design documents. Currently: home page + admin page + a chat test page. |
| Front end | Plain HTML, CSS and **native browser ES modules**. No framework, no bundler, no transpile step. |
| Back end | `server.js` — a ~300-line **zero-dependency** Node.js static file server. |
| Dependencies | **None.** No `package-lock.json`, no `node_modules`, no `npm install` anywhere. |
| Tests | 56 tests across 3 files, using the built-in `node:test`. No network, no API key needed. |
| Node | `engines: >=18`; the image and CI both use `node:24-alpine`. |

Pages: `/` (home), `/admin.html` (API key, model dropdown, connection test), `/chat.html`
(streaming chat), `/healthz` (probe).

**Repo state to expect:**

- branch `main`, remote `origin` = `https://github.com/nixies78/ForgeMVP.git`
- HEAD when this was written: `4302440` (`main` == `origin/main`)
- **note:** after this document was added, HEAD will be one or two commits later. Run
  `git log --oneline -5` and use whatever is actually there.

## 2. What is already done (and verified)

### `Dockerfile` — two stages

- **Stage 1 `verify`**: `node:24-alpine`, `COPY . .`, then runs all three test suites. It is a
  test gate, not a compiler — there is nothing to compile.
- **Stage 2 `runtime`**: `node:24-alpine`, copies **only** `server.js`, `package.json` and
  `public/` from stage 1 (so the shipped image is lean and contains exactly the tested files),
  `ENV NODE_ENV=production PORT=8080`, `EXPOSE 8080`, `USER node`, `CMD ["node", "server.js"]`.
- No `HEALTHCHECK` on purpose: Cloud Run ignores it and runs its own probes.

### `server.js` — the Cloud Run contract

- `resolvePort()` reads **`$PORT`**, falling back to **8080**.
- Binds **`0.0.0.0`**.
- **`/healthz`** returns `{"status":"ok","service":"forgemvp","uptimeSeconds":N}`.
- **`installGracefulShutdown()`** handles SIGTERM/SIGINT: closes the server, drops idle
  keep-alive sockets, exits 0. This matters because `node` is PID 1 in the container and a PID 1
  process *ignores signals it has no handler for* — without it, Cloud Run would SIGKILL the
  container on every deploy and scale-down, dropping in-flight requests.
- Static files are served with `Cache-Control: no-cache` plus a strong **ETag**, so unchanged
  files answer `304` while edits still show up immediately.

### `.dockerignore`

Excludes `.git`, `node_modules`, `.env*`, `*.pem`/`*.key`, caches (`dist`, `build`, `coverage`,
`.vite`, `.cache`), editor/OS cruft and `.scratch`.

It deliberately does **not** exclude the repo's own source, tests or deployment files. An earlier
version excluded `start.bat`, `autostart-forgemvp.vbs`, `Dockerfile` and `cloudbuild.yaml` — which
**would have failed the first build**, because the in-image test stage reads those exact files and
`readFile` would have thrown ENOENT. `tests/container.test.mjs` now guards against that.

### `cloudbuild.yaml`

Substitutions `_REGION=us-central1`, `_SERVICE=forgemvp`, `_REPO=forgemvp`. Steps in order:
`test` (plain Node, fast feedback) → `build` (waits for `test`) → `push` → `deploy`.

Deploy flags: `--port=8080 --cpu=1 --memory=256Mi --concurrency=250 --min-instances=0
--max-instances=4 --cpu-boost --allow-unauthenticated --platform=managed`.

### Verified by live testing on the original machine

- 56 tests pass, and **all 56 also pass inside a simulated Docker build context** (only the files
  that survive `.dockerignore`, copied to a clean temp directory) — this is what stage 1 does.
- `PORT=9137` really binds 9137; with `PORT` unset it binds 8080; host is `0.0.0.0`.
- `/healthz` → 200 JSON. ETag revalidation: `200 → 304 (0 bytes) → 200` on a stale validator.
- SIGTERM → clean exit 0, with `server.close()` called first.
- A `file://` page probes the server and then navigates to the served page (observed via a
  logging proxy: `GET /` then `GET /admin.html sec-fetch-mode=navigate`).

## 3. What is NOT done — the actual remaining work

1. **Nothing is deployed.** No Cloud Run service, no Artifact Registry repository, no Cloud Build
   trigger. No GCP resources have been created or changed at all.
2. **The image has never been built.** There is no Docker daemon on the original machine, so
   `docker build` has never run. The Dockerfile is verified structurally and its runtime
   behaviour is verified live, but the first real build is still unproven. Treat "the first build
   works" as an open question and report whatever it says.
3. **The GitHub ⇄ Cloud Build connection has not been made.** Installing the Cloud Build GitHub
   App on the repo is a Console step (§5, step 6).
4. **IAM has not been granted.** The Cloud Build service account very likely needs additional
   roles (§5, step 7) — this is the single most common cause of a failing `deploy` step.
5. **No custom domain, no auth, no uptime monitoring.** The service will be a public URL.

## 4. Known-good facts — do not re-derive or "fix" these

- The port is **8080** and `PORT` overrides it. Do not change it to 5173 (an old local default)
  or to 3000.
- **Never add an `npm install` / `npm ci` step.** There is no lockfile and no dependencies; it
  would break the build. If dependencies are ever added, that changes the whole design.
- `/healthz`, the ETag handling and the SIGTERM handler are load-bearing. Don't remove them.
- The Windows files (`start.bat`, `install-startup.bat`, `uninstall-startup.bat`,
  `autostart-forgemvp.vbs`) are for local development on Windows. They are excluded from the
  runtime image. Leave them alone; one of the tests asserts on their contents.
- Tests must pass *before* anything is pushed. `npm test` runs all three suites.

## 5. Setup steps, in order

### Step 0 — prerequisites

- `gcloud` CLI installed and authenticated (`gcloud auth login`).
- A GCP project with **billing enabled**, and your account holding enough rights
  (`roles/owner`, or `roles/editor` + `roles/resourcemanager.projectIamAdmin`).
- Node.js 18+ only if you want to run the tests locally first (not required — Cloud Build runs
  them, and `gcloud builds submit` builds from source without a local Docker daemon).
- **Ask the user for the project ID before creating anything.**

### Step 1 — get the code and confirm the state

```bash
git clone https://github.com/nixies78/ForgeMVP.git
cd ForgeMVP
git log --oneline -3
npm test          # expect 56 passing across 3 files, 0 failures
```

### Step 2 — point gcloud at the project and enable the APIs

```bash
gcloud config set project PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

### Step 3 — create the Artifact Registry repository

```bash
gcloud artifacts repositories create forgemvp \
  --repository-format=docker --location=us-central1 \
  --description="ForgeMVP container images"
```

If you use a region other than `us-central1`, also update `_REGION` in `cloudbuild.yaml` — the
deploy and the image path must agree.

### Step 4 — build and deploy once by hand, BEFORE any automation

This is where the never-built image gets tested for the first time. Do it by hand so failures are
immediate and readable.

```bash
gcloud builds submit --tag us-central1-docker.pkg.dev/PROJECT_ID/forgemvp/forgemvp:manual
```

Watch for the most likely failure: **the base image tag.** If `node:24-alpine` cannot be pulled,
change *both* `FROM` lines to `node:22-alpine` and also the `name: node:24-alpine` test step in
`cloudbuild.yaml` — a test asserts those Node majors match, so change them together.

Then deploy:

```bash
gcloud run deploy forgemvp \
  --image=us-central1-docker.pkg.dev/PROJECT_ID/forgemvp/forgemvp:manual \
  --region=us-central1 --platform=managed --allow-unauthenticated --port=8080 \
  --cpu=1 --memory=256Mi --concurrency=250 --min-instances=0 --max-instances=4
```

### Step 5 — verify the running service (do not skip this)

```bash
URL=$(gcloud run services describe forgemvp --region=us-central1 --format='value(status.url)')
echo "$URL"
curl -s "$URL/healthz"                       # expect {"status":"ok","service":"forgemvp",...}
curl -sI "$URL/admin.html" | head -5         # expect 200, cache-control: no-cache, an etag
curl -s "$URL/" | grep -o 'Home Page'        # expect the home page
```

Then in a browser: open the home page (it should show "Home Page" and a link to admin), open the
admin page and confirm the model dropdown populates with live DeepSeek models. That dropdown
calls OpenRouter from the browser and needs **no API key** just to list models.

`gcloud run services logs read forgemvp --region=us-central1 --limit=20` shows the startup banner
including the port it bound to.

### Step 6 — continuous deployment on push to `main`

**Preferred (reliable): use the Console for the repository connection.**

1. Console → Cloud Build → Triggers → **Connect repository** → GitHub.
2. Install the **Cloud Build GitHub App** on the `nixies78` account and grant it access to
   `ForgeMVP`.
3. Select the repo, then **Create trigger**:
   - name `forgemvp-main`, event *Push to a branch*, branch `^main$`
   - configuration: *Cloud Build configuration file*, location `cloudbuild.yaml`
4. Confirm: `gcloud builds triggers list --region=us-central1`

**CLI alternative** — only works once the GitHub App above is installed:

```bash
gcloud builds triggers create github \
  --name=forgemvp-main \
  --repo-owner=nixies78 --repo-name=ForgeMVP \
  --branch-pattern="^main$" \
  --build-config=cloudbuild.yaml \
  --region=us-central1
```

If that errors saying the repository is not connected, go back to the Console flow — you cannot
install the GitHub App from the CLI. (2nd-gen connections need `gcloud builds connections create
github` plus `--repo=projects/PROJECT/locations/REGION/connections/CONN/repositories/REPO`; the
Console path is simpler and less error-prone.)

### Step 7 — IAM, if the `deploy` step fails

New projects do **not** give the Cloud Build service account enough rights. Symptom: the build
succeeds, the push succeeds, then `deploy` fails with a permission error.

```bash
PROJECT_ID=YOUR_PROJECT_ID
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
CB="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

for ROLE in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser roles/logs.writer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="$CB" --role="$ROLE"
done
```

`roles/iam.serviceAccountUser` is the one people forget: without it, Cloud Run cannot deploy as
the runtime service account.

### Step 8 — prove continuous deployment works

Make a trivial commit to `main` (e.g. touch a comment), push, then:

```bash
gcloud builds list --limit=3
gcloud builds log $(gcloud builds list --limit=1 --format='value(id)')
gcloud run revisions list --service=forgemvp --region=us-central1
```

Definition of done: a new revision appears, created by the trigger, from the pushed commit.

### Step 9 — optional hardening

- `--min-instances=1` removes cold starts (costs money).
- A custom domain mapping on the Cloud Run service.
- Cloud Run's built-in IAP or `--no-allow-unauthenticated` if this should not be public.
- Uptime check against `/healthz` in Cloud Monitoring.

## 6. Security model — read before adding any secret

- `--allow-unauthenticated` makes the service **public**: anyone with the URL can load the pages,
  including `/admin.html`.
- **The OpenRouter API key is stored per-visitor in that browser's `localStorage`.** It is never
  sent to this server, never logged, and never committed. The browser calls
  `https://openrouter.ai/api/v1` directly (OpenRouter sends permissive CORS headers).
- Therefore **the container needs no secrets at all**, and `.dockerignore` keeps `.env*` out of the
  image. Do not add a key to the image, to `cloudbuild.yaml`, or to the Cloud Run environment
  without a deliberate redesign.
- Consequence: a shared deployment is safe to hand out — each visitor pastes their own key.
- If the user later wants one shared key for everybody, that is a **design change**: store it in
  Secret Manager, mount it into Cloud Run, and add a small server-side proxy so the key never
  reaches the browser. The pieces to change are isolated in `public/js/settings.js` and
  `public/js/openrouter.js`.

## 7. Do not change, without a good reason

- Do not add dependencies, a lockfile or an install step.
- Do not change the port, or hardcode `localhost` anywhere.
- Do not remove `/healthz`, the ETag logic, or the SIGTERM handler.
- Do not delete `tests/` — it runs inside the image build on purpose.
- Do not exclude repo files from `.dockerignore` "to slim the context": the in-image test stage
  reads them, and the build fails if you do. There is a test that enforces this.
- Do not reintroduce the local `file://` design. Everything is served over HTTP; the pages
  self-rescue from `file://` to `http://localhost:8080` on local machines.

## 8. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Build fails pulling the base image | `node:24-alpine` unavailable/mirrored oddly | Switch both `FROM` lines and the `cloudbuild.yaml` test step to `node:22-alpine` |
| Build fails in the `verify` stage with ENOENT | A file the suites read is missing from the context | Check `.dockerignore`; `node tests/container.test.mjs` locally names the file |
| `denied: Permission ... artifactregistry.repositories.uploadArtifacts` | Missing IAM | Step 7: `roles/artifactregistry.writer` |
| `deploy` fails, permission denied / cannot act as service account | Missing IAM | Step 7: `roles/run.admin`, `roles/iam.serviceAccountUser` |
| Deploy succeeds but the URL returns 503 | Container isn't listening on `$PORT`/`0.0.0.0` | Check logs; the startup banner prints the bound port. Revert any port edit |
| Trigger never fires | Wrong branch pattern, app not installed on the repo, or trigger in another region | Step 6 |
| `gcloud builds submit` uploads a lot | No `.gcloudignore`, so gcloud falls back to `.gitignore` | Optional: add `.gcloudignore` mirroring `.dockerignore` plus `.git` |

## 9. Files worth reading

`Dockerfile`, `.dockerignore`, `cloudbuild.yaml`, `server.js` (all exports are relevant),
`package.json`, `tests/container.test.mjs` (documents the deployment contract as assertions),
and the "Deploying to Google Cloud" section of `README.md`.

## 10. Commands the user may need to run themselves

Sign-in flows and Console clicks cannot be delegated to an assistant: `gcloud auth login`, enabling
billing, installing the GitHub App, and any IAM change the user's own account must approve. Ask
rather than assume.

## 11. Report back with

1. The Cloud Run service URL, and whether `/healthz`, `/`, `/admin.html` all return 200.
2. The project ID, region and Artifact Registry path actually used.
3. Whether the **first** `docker` build succeeded, and the exact error if it did not.
4. Whether the trigger is created and fired; the revision ID it produced.
5. Any IAM roles you had to add.
6. Anything in this document that turned out to be wrong or out of date.
