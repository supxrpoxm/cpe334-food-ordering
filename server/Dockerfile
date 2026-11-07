# ==============================================================================
# TokTickIT — Backend Dockerfile for local Docker Compose (server + migrate)
# ==============================================================================
# Used by docker-compose.yml (`server` and `migrate` services).
# Cloud Run does NOT use this file — Cloud Run uses the root `Dockerfile`.
# Ref: https://docs.docker.com/reference/dockerfile/
#
# ⭐ CHANGE ME (groups using another tech stack):
#   # CHANGE ME: base image (node:24-alpine), install/build commands,
#   #            copied folders (prisma, src), PORT and CMD.
# ==============================================================================

# CHANGE ME: base image for your backend runtime.
FROM node:24-alpine
WORKDIR /app
# Prisma requires openssl on alpine.
RUN apk add --no-cache openssl

# --- Install dependencies (cached until package*.json changes) ----------------
COPY package*.json ./
RUN npm ci

# --- Generate Prisma client ---------------------------------------------------
# CHANGE ME: remove or replace if your stack does not use Prisma.
COPY prisma ./prisma/
RUN npx prisma generate

# --- Copy source and build TypeScript -> dist/ --------------------------------
COPY tsconfig.json ./
COPY src ./src/
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN npm run build && chmod +x ./docker-entrypoint.sh

# --- Runtime settings ---------------------------------------------------------
ENV NODE_ENV=production
ENV TZ=Asia/Bangkok
# CHANGE ME: port your backend listens on (must match docker-compose.yml).
ENV PORT=3000
EXPOSE 3000

# Run as non-root user.
USER node

# CHANGE ME: start command for your backend.
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
