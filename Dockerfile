# ForgeMVP - container image for Google Cloud Run.
# The app has no runtime dependencies: it is a tiny zero-dependency Node static server.

FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY public ./public

# Cloud Run injects PORT (default 8080); server.js reads it and binds 0.0.0.0.
ENV PORT=8080
EXPOSE 8080

USER node

CMD ["node", "server.js"]
