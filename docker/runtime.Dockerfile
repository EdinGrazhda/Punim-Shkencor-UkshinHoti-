FROM node:22-bookworm-slim AS build
WORKDIR /workspace

RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY apps/student/package.json apps/student/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/runtime-host/package.json packages/runtime-host/package.json
RUN pnpm install --frozen-lockfile

COPY packages packages
# The runtime image does not include the student source tree, so do not invoke
# the root project references (which also include apps/student).
RUN pnpm --filter @ckadinti/contracts build \
  && pnpm --filter @ckadinti/database build \
  && pnpm --filter @ckadinti/runtime-host build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=build /workspace/packages/runtime-host/node_modules ./packages/runtime-host/node_modules
COPY --from=build /workspace/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /workspace/packages/runtime-host/package.json ./packages/runtime-host/package.json
COPY --from=build /workspace/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /workspace/packages/database/package.json ./packages/database/package.json
COPY --from=build /workspace/packages/database/dist ./packages/database/dist
COPY --from=build /workspace/packages/database/migrations ./packages/database/migrations
COPY --from=build /workspace/packages/runtime-host/dist ./packages/runtime-host/dist
EXPOSE 4310
CMD ["sh", "-c", "node packages/database/dist/migrate.js && node packages/runtime-host/dist/index.js"]
