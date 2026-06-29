# Build context is the monorepo root (see infra/docker-compose.yml).
FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build -w @ai-agentic-english/shared
RUN npm run build -w @ai-agentic-english/learning-materials-service

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 4002
CMD ["sh", "-c", "cd /app/services/learning-materials-service && npx prisma migrate deploy && npx tsx prisma/seedAssessment.ts && node /app/services/learning-materials-service/dist/index.js"]
