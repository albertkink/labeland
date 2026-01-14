#
# Multi-stage Dockerfile for labelz
# Builds React/Vite frontend + Node/Express backend
#

# Stage 1: Build the React/Vite application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code and configuration
COPY . .

# Build TypeScript and Vite app
RUN npm run build

# Stage 2: Production runtime
FROM node:20-alpine AS runtime

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV API_PORT=5174

# PostgreSQL connection defaults (can be overridden via env vars)
ENV DB_HOST=postgres
ENV DB_PORT=5432
ENV DB_NAME=labelz
ENV DB_USER=postgres
ENV DB_PASSWORD=postgres

# Install only production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built frontend from builder stage
COPY --from=builder /app/dist ./dist

# Copy server code
COPY --from=builder /app/server ./server

# Create data directory (for orders, wallets, etc.)
# This can be mounted as a volume in docker-compose
RUN mkdir -p /app/data

# Expose the API port
EXPOSE 5174

# Health check (checks if the API is responding)
# Install curl for healthcheck
RUN apk add --no-cache curl

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:5174/api/health || exit 1

# Start the Node/Express server
# Express uses HTTP/1.1 by default, which prevents QUIC protocol errors
# The server will serve the built React app from /dist and handle API routes
# Express by default uses HTTP/1.1, which prevents QUIC protocol errors
CMD ["node", "server/index.js"]
