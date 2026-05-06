FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# Do not update npm globally here. Node 22 already ships with a recent npm, and
# global npm self-updates can fail in container builds when npm internals change.
RUN DATABASE_URL=postgresql://user:password@localhost:5432/db npm ci --include=dev

COPY . .

RUN DATABASE_URL=postgresql://user:password@localhost:5432/db npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
