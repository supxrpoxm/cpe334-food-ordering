# ##############################################################################
# CPE 334 Food Ordering — Unified production Dockerfile (multi-stage)
# ##############################################################################
# WHAT THIS FILE DOES
#   Builds ONE image containing the Express API and Next.js frontend.
#   Next.js serves port 3000 and rewrites /api requests to the API on port 3001.
#   (client/Dockerfile and server/Dockerfile are separate, used only by
#    docker-compose for local development.)
#
# STRUCTURE (3 stages)
#   Stage 1  client-builder -> compiles the frontend (Next.js standalone)
#   Stage 2  server-builder -> compiles the backend (TypeScript + Prisma)
#   Stage 3  production     -> small runtime image; copies only build output
#
# ⭐ IMPORTANT
#   * The container MUST listen on $PORT (Cloud Run injects it; 3000 here) and
#     the same number is used by `--port 3000` in deploy/deploy.sh.
#   * Build from the repo root:  docker build .   (paths are relative to it).
#   * Secrets (DATABASE_URL, passwords) are NEVER baked into the image; they are
#     injected at runtime from Secret Manager (see deploy/deploy.sh).
#   * Stage 3 runs as the unprivileged `node` user (USER node) — keep it.
#   * prisma/ is copied into the runtime image on purpose: the Cloud Run
#     migration job runs `prisma migrate deploy` + seed from this same image.
#
# REFERENCES
#   - Multi-stage builds : https://docs.docker.com/build/building/multi-stage/
#   - Dockerfile reference: https://docs.docker.com/reference/dockerfile/
#   - Cloud Run container contract (PORT, stateless, SIGTERM):
#       https://cloud.google.com/run/docs/container-contract
#   - Prisma + Docker/alpine (openssl):
#       https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-prisma
#
# ⭐ CHANGE ME — groups using another tech stack must rewrite this file:
#   # CHANGE ME: base images (node:24-alpine) -> your runtime
#   # CHANGE ME: build commands (npm ci / npm run build / prisma generate)
#   # CHANGE ME: copied paths, ENV PORT / EXPOSE, final ENTRYPOINT / CMD
# ##############################################################################

# ============================================================================
# Stage 1: Build Frontend (Next.js)
# ============================================================================
# CHANGE ME: replace with your frontend toolchain (delete the stage if none).
FROM node:24-alpine AS client-builder
WORKDIR /app/client
# Copy package files first so installs are cached until dependencies change.
COPY client/package*.json ./
RUN npm install
COPY client/ ./
ENV NEXT_TELEMETRY_DISABLED=1
ENV API_ORIGIN=http://127.0.0.1:3001
RUN npm run build

# ============================================================================
# Stage 2: Build Backend (Express + TypeScript + Prisma)
# ============================================================================
# CHANGE ME: replace with your backend build (compile / package your app).
FROM node:24-alpine AS server-builder
WORKDIR /app/server
# Prisma needs openssl on alpine.
RUN apk add --no-cache openssl
COPY server/package*.json ./
RUN npm install
COPY server/ ./
# CHANGE ME: `prisma generate` is Prisma-specific; drop it for other ORMs.
RUN npx prisma generate && npm run build

# ============================================================================
# Stage 3: Unified Production Runtime
# ============================================================================
# ⭐ IMPORTANT: this is the stage that actually runs on Cloud Run.
FROM node:24-alpine AS production
WORKDIR /app/server
RUN apk add --no-cache openssl

# --- Copy build output from the previous stages (no dev tooling) -------------
COPY --from=server-builder /app/server/package*.json ./
COPY --from=server-builder /app/server/node_modules ./node_modules
COPY --from=server-builder /app/server/dist ./dist
COPY --from=server-builder /app/server/prisma ./prisma
COPY --from=server-builder /app/server/container-entrypoint.cjs ./container-entrypoint.cjs
COPY --from=client-builder /app/client/.next/standalone /app/client
COPY --from=client-builder /app/client/.next/static /app/client/.next/static
RUN chown -R node:node /app/server /app/client

# --- Runtime configuration ----------------------------------------------------
ENV NODE_ENV=production
ENV TZ=Asia/Bangkok
ENV PORT=3000
ENV API_PORT=3001
EXPOSE 3000

# Do not run as root inside the container.
USER node

ENTRYPOINT ["node", "/app/server/container-entrypoint.cjs"]
