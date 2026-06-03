FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm prisma:generate && pnpm build && pnpm prune --prod

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
# Copy pruned production node_modules from the build stage: it still contains
# the generated Prisma client/query engine, but dev-only tooling is gone.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
RUN pnpm exec playwright install --with-deps chromium
CMD ["node", "dist/src/server.js"]
