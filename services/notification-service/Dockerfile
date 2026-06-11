# Build context is the monorepo root (see infra/docker-compose.yml).
FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build -w @ai-agentic-english/shared
RUN npm run build -w @ai-agentic-english/notification-service

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 4005
CMD ["node", "services/notification-service/dist/index.js"]
