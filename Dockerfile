# Imagen de Comanda para servidores con Docker (por ejemplo, un NAS Synology
# con Container Manager). Ver la guía en docs/synology.md y el docker-compose.yml.

# 1. Preparar la app (instala todo y compila).
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# 2. La imagen que se ejecuta.
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data \
    COPIAS_CARPETA=/app/copias/automaticas \
    TZ=America/Bogota
# Se copia todo, también las herramientas (npm run copia, npm run restaurar, npm run clave).
COPY --from=build /app ./
# La base de datos local y las copias de seguridad viven fuera de la imagen, en carpetas del NAS.
VOLUME ["/app/data", "/app/copias"]
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/entrar').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000", "-H", "0.0.0.0"]
