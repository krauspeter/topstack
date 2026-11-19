# TopStack Web: Caddy mit dem fertigen App-Build (Phase 3, AP-2).
# Die Caddyfile kommt beim Start aus infra/ (docker-compose.yml), damit Änderungen
# an Routen ohne neues Image wirken. Im Image steckt nur die gebaute App.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM caddy:2
COPY --from=build /app/dist /srv/app
