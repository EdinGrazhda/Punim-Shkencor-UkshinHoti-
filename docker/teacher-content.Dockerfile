FROM node:22-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/desktop/package.json apps/desktop/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile
COPY apps/desktop apps/desktop
COPY packages/contracts packages/contracts
COPY packages/database packages/database
RUN pnpm --filter @ckadinti/contracts build && pnpm --filter @ckadinti/desktop build:content

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/desktop/node_modules ./apps/desktop/node_modules
COPY --from=build /workspace/apps/desktop/dist-content ./apps/desktop/dist-content
CMD ["node", "apps/desktop/dist-content/server.mjs"]
