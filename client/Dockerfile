# ==============================================================================
# TokTickIT — Frontend Dockerfile for local Docker Compose (Vite + nginx)
# ==============================================================================
# Used by docker-compose.yml (`client` service on http://localhost:5173).
# Cloud Run does NOT use this file — Cloud Run serves the built SPA from the
# root `Dockerfile`.
# Ref: https://docs.docker.com/build/building/multi-stage/
#
# ⭐ CHANGE ME (groups using another frontend tool):
#   # CHANGE ME: build image / commands and the output folder (`/app/dist`).
# ==============================================================================

# --- Stage 1: Build static frontend files -------------------------------------
# CHANGE ME: base image and build commands for your frontend.
FROM node:24-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# --- Stage 2: Serve built files with nginx (proxies /api -> server:3000) ------
FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
# CHANGE ME: replace `/app/dist` if your bundler outputs to another folder.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
