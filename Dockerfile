#
# Multi-stage build:
# 1) build the Vite app into /app/dist
# 2) run the Node/Express server (and serve /dist in production)
#

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build


FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV API_PORT=5174

# PostgreSQL connection defaults (override via docker-compose or env vars)
ENV DB_HOST=postgres
ENV DB_PORT=5432
ENV DB_NAME=labelz
ENV DB_USER=postgres
ENV DB_PASSWORD=postgres

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server

# Optional: keep data folder inside the image (you can also mount a volume to /app/data)
COPY --from=build /app/data ./data

EXPOSE 5174

# Start the server
# Note: When using docker-compose, the depends_on with healthcheck ensures PostgreSQL is ready
# The database connection in db.js will retry automatically if PostgreSQL isn't ready yet
CMD ["node", "server/index.js"]

