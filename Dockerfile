FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/config ./config
COPY --from=builder /app/src/server ./src/server
COPY --from=builder /app/src/shared ./src/shared

RUN mkdir -p data/uploads data/exports data/metadata

ENV HOST=0.0.0.0
ENV PORT=8787
ENV DATABASE_FILE=/app/data/app.db
ENV METADATA_DIRECTORY=/app/data/metadata

EXPOSE 8787
CMD ["node", "--import", "tsx", "src/server/index.ts"]
