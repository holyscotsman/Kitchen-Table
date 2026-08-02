# The reproducible alternative to get-tools.sh: an image with yt-dlp and
# ffmpeg baked in. The Render service currently runs the native Node way
# (build: `yarn`, start: `yarn start` at the repo root) and does not use
# this file — it exists so the server can be run identically anywhere:
#
#   docker build -f backend/Dockerfile -t kt-import .   # from the REPO ROOT
#   docker run -p 8787:8787 -e KT_DB=… -e ANTHROPIC_API_KEY=… kt-import
#
# Build context is the repo root because the server applies db/schema.sql
# at boot — the schema has exactly one home.
FROM node:22-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
 && curl -fsSL -o /usr/local/bin/yt-dlp \
      https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
 && chmod +x /usr/local/bin/yt-dlp \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY db/schema.sql db/schema.sql
COPY backend/package.json backend/package.json
RUN cd backend && npm install --omit=dev

COPY backend backend

ENV PORT=8787
EXPOSE 8787
CMD ["node", "backend/server.js"]
