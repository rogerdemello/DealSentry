# syntax=docker/dockerfile:1

# ---- Builder: install deps, generate Prisma client, build the SPA ----
FROM node:20-slim AS builder
WORKDIR /app

# Puppeteer downloads its own Chromium by default; we use the system Chromium
# in the runtime stage instead, so skip the (large) download here.
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

# ---- Runtime: system Chromium + app source, run server via tsx ----
FROM node:20-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Chromium + fonts so the PDF export (Puppeteer) works in the container.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Bring over installed deps (incl. tsx) and the generated Prisma client + build.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json tsconfig.json server.ts ./
COPY src ./src
COPY prisma ./prisma

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "tsx", "server.ts"]
