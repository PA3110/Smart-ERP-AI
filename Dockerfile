# Vivek ERP System — production image (backend API + reservation console UI)
FROM node:20-alpine AS build
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY backend/public ./public
COPY backend/.env.example ./.env.example

RUN mkdir -p /app/data

EXPOSE 4000
ENV PORT=4000
ENV DB_FILE=/app/data/erp.db

CMD ["sh", "-c", "node dist/db/seed.js && node dist/server.js"]
