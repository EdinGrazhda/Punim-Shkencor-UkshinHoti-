FROM node:22-bookworm-slim AS build
WORKDIR /workspace

RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/student/package.json apps/student/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/runtime-host/package.json packages/runtime-host/package.json
RUN pnpm install --frozen-lockfile

COPY apps/student apps/student
COPY packages/contracts packages/contracts
RUN pnpm --filter @ckadinti/contracts build \
  && pnpm --filter @ckadinti/student build

FROM nginx:1.27-alpine
COPY docker/nginx.student.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/student/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
