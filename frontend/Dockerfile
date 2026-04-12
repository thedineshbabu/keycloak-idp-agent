# ── Frontend — React / Vite → nginx ──────────────────────────────────────────

# Stage 1: build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY index.html vite.config.js main.jsx App.jsx keycloak.js ./

# Vite replaces these at build time — pass via --build-arg in compose
ARG VITE_API_URL=http://localhost:8000
ARG VITE_KEYCLOAK_ENABLED=false
ARG VITE_KEYCLOAK_URL
ARG VITE_KEYCLOAK_REALM
ARG VITE_KEYCLOAK_CLIENT=idp-agent-ui

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_KEYCLOAK_ENABLED=$VITE_KEYCLOAK_ENABLED
ENV VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL
ENV VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM
ENV VITE_KEYCLOAK_CLIENT=$VITE_KEYCLOAK_CLIENT

RUN npm run build

# Stage 2: serve with nginx
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]
