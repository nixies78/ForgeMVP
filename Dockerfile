# syntax=docker/dockerfile:1
#
# ForgeMVP - production image for Google Cloud Run.
#
# Stack (detected from package.json + the tree):
#   * Node.js ESM, ZERO runtime dependencies - no package-lock.json, no node_modules
#   * No framework and no bundler: no Vite / Next / React / TypeScript, no build output
#   * `server.js` is a small zero-dependency static file server
#   * `public/` is plain HTML + CSS + native ES modules shipped to the browser as-is
#
# There is therefore no compile step. Instead of a "build" stage this uses a VERIFY
# stage: the test suite runs inside the build, so an image can only be produced from
# a commit whose tests pass.
#
# Cloud Run contract honoured below:
#   * the app reads $PORT (server.js falls back to 8080) and binds 0.0.0.0
#   * runs as a non-root user
#   * handles SIGTERM for graceful shutdown (node is PID 1 here - see server.js)
#   * /healthz answers for startup/liveness probes
#
# The base is pinned to a major version for reproducible rebuilds. For a fully
# immutable build, pin by digest: FROM node:24-alpine@sha256:<digest>

# ---------------------------------------------------------------------------
# Stage 1 - verify: prove the commit works before anything is published
# ---------------------------------------------------------------------------
FROM node:24-alpine AS verify

WORKDIR /app

# The whole repo, minus .dockerignore. The suite asserts on real repo files
# (start.bat, autostart-forgemvp.vbs, Dockerfile, cloudbuild.yaml), so copying only
# a subset made those reads throw ENOENT and the build failed. The runtime stage
# below copies just what it needs, so nothing extra reaches the final image.
# There are no dependencies, so there is no `npm ci` step - if any are ever added,
# insert `COPY package*.json ./ && npm ci --omit=dev` before this line.
COPY . .

# node:test needs no external packages, so this runs on a clean image.
RUN node --version \
 && node tests/openrouter.test.mjs \
 && node tests/server.test.mjs \
 && node tests/container.test.mjs

# ---------------------------------------------------------------------------
# Stage 2 - runtime: only what the server actually reads
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runtime

# Cloud Run sets PORT itself; 8080 is the fallback for any other environment.
ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app

# Copied from the verified stage, so the shipped files are exactly the tested ones.
# --chown keeps them owned by the unprivileged user that runs the process.
COPY --from=verify --chown=node:node /app/package.json /app/server.js ./
COPY --from=verify --chown=node:node /app/public ./public

USER node

# Informational: Cloud Run routes to $PORT regardless.
EXPOSE 8080

# Exec form, so node is PID 1 and receives SIGTERM directly (handled in server.js).
# No HEALTHCHECK: Cloud Run ignores it and probes /healthz itself instead.
CMD ["node", "server.js"]
