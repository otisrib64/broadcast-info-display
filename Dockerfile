FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json jest.config.js ./
COPY src ./src
RUN npm run build

# slim (glibc), not alpine: musl's resolver is flaky for the telemetry HTTPS calls
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Static files are served from process.cwd()/src/web, not from dist/
COPY src/web ./src/web
RUN mkdir -p data/files/.tmp && chown -R node:node /app
USER node
EXPOSE 8080
# Exec form: node is PID 1 and receives SIGTERM, so the pending state.json write is flushed
CMD ["node", "dist/server/index.js"]
