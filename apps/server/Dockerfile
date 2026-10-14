FROM oven/bun:1.3.14-alpine AS base
WORKDIR /app

# Stage 1: Prune workspace to only include @catalogue/server dependencies
FROM base AS pruner
RUN bun add -g turbo
COPY . .
RUN turbo prune @catalogue/server --docker

# Stage 2: Install dependencies
FROM base AS installer
# Copy pruned package.json(s) and lockfile
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock ./bun.lock

# Install dependencies (including dev tools if needed)
RUN bun install --frozen-lockfile --production

# Copy the rest of the pruned workspace
COPY --from=pruner /app/out/full/ .

FROM installer AS builder
WORKDIR /app/apps/server

RUN bun build \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --outfile /app/server \
    src/index.ts && \
    bun build \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --outfile /app/migrate \
    src/migrate.ts && \
    bun build \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --outfile /app/seed \
    src/seed.ts

# Stage 3: Runner
FROM oven/bun:1.3.14-alpine AS runner
WORKDIR /app

# bind-tools : `dig`, pour le transfert de zone DNS des domaines surveillés (AXFR, clés TSIG).
RUN apk add --no-cache curl bind-tools

# Run as non-root user
RUN addgroup --system --gid 1001 slowpoke
RUN adduser --system --uid 1001 bunjs
USER bunjs

# Copy installed workspace
COPY --from=builder --chown=bunjs:slowpoke /app/server /app/server
COPY --from=builder --chown=bunjs:slowpoke /app/migrate /app/migrate
COPY --from=builder --chown=bunjs:slowpoke /app/seed /app/seed
COPY --from=pruner --chown=bunjs:slowpoke /app/out/full/packages/database/src/migrations /app/migrations
# Référentiels officiels (NIS 2 / ReCyF…) : lus à l'exécution par le seed et par l'import
# depuis l'administration. Versionnés avec le code, donc reproductibles.
COPY --from=pruner --chown=bunjs:slowpoke /app/out/full/packages/database/src/referentiels /app/referentiels

ENV DRIZZLE_MIGRATIONS_FOLDER=/app/migrations

EXPOSE 4000

CMD ["/app/server"]
