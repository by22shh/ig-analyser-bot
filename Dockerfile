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
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV XDG_CACHE_HOME=/tmp/.cache
WORKDIR /app
COPY --chown=node:node package.json pnpm-lock.yaml* ./
# Copy pruned production node_modules from the build stage: it still contains
# the generated Prisma client/query engine, but dev-only tooling is gone.
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/prisma ./prisma
COPY --chown=node:node --from=build /app/public ./public
RUN pnpm exec playwright install --with-deps chromium \
  && mkdir -p /app/.data /tmp/.cache \
  && chown -R node:node /app /tmp/.cache \
  && chmod -R a+rX /ms-playwright
USER node
CMD ["node", "--import", "./dist/src/config/observability.js", "dist/src/server.js"]
