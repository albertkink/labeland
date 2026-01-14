# Docker Setup Guide

This project uses Docker and Docker Compose to run the application with PostgreSQL database.

## Prerequisites

- Docker and Docker Compose installed
- Environment variables configured (see below)

## Quick Start

### Production

1. Create a `.env` file in the project root with your configuration:

```env
# Database
DB_NAME=labelz
DB_USER=postgres
DB_PASSWORD=your-secure-password

# JWT Secret (change this!)
JWT_SECRET=your-jwt-secret-here

# Coinbase Commerce
COINBASE_COMMERCE_API_KEY=your-api-key
COINBASE_COMMERCE_WEBHOOK_SECRET=your-webhook-secret

# App Configuration
API_PORT=5174
APP_URL=http://localhost:5173
LABEL_PRICE_USD=1
```

2. Build and start all services:

```bash
docker-compose up -d
```

This will:
- Start PostgreSQL database
- Build and start the application
- Create the `users` table automatically on first startup

3. View logs:

```bash
docker-compose logs -f
```

4. Stop services:

```bash
docker-compose down
```

### Development

For development, you can run PostgreSQL in Docker and run the app locally:

```bash
# Start only PostgreSQL
docker-compose up -d postgres

# Run the app locally (in separate terminals)
npm run dev      # Frontend
npm run api      # Backend
```

Or use the development compose file:

```bash
docker-compose -f docker-compose.dev.yml up
```

## Services

### PostgreSQL

- **Image**: `postgres:16-alpine`
- **Port**: `5432` (mapped to host)
- **Data**: Persisted in Docker volume `postgres_data`
- **Health Check**: Automatically checks if PostgreSQL is ready

### Application

- **Port**: `5174` (mapped to host)
- **Depends on**: PostgreSQL (waits for it to be healthy)
- **Data**: Mounts `./data` directory for orders, wallets, etc.

## Environment Variables

All environment variables can be set in a `.env` file or passed directly to docker-compose.

### Required

- `DB_PASSWORD`: PostgreSQL password
- `JWT_SECRET`: Secret key for JWT tokens (change in production!)

### Optional (with defaults)

- `DB_NAME`: Database name (default: `labelz`)
- `DB_USER`: Database user (default: `postgres`)
- `DB_PORT`: PostgreSQL port (default: `5432`)
- `API_PORT`: Application port (default: `5174`)
- `COINBASE_COMMERCE_API_KEY`: Coinbase Commerce API key
- `COINBASE_COMMERCE_WEBHOOK_SECRET`: Coinbase Commerce webhook secret
- `APP_URL`: Application URL (default: `http://localhost:5173`)
- `LABEL_PRICE_USD`: Price per label (default: `1`)

## Database Management

### Access PostgreSQL

```bash
# Connect to PostgreSQL container
docker-compose exec postgres psql -U postgres -d labelz

# Or from host (if port is exposed)
psql -h localhost -p 5432 -U postgres -d labelz
```

### Backup Database

```bash
docker-compose exec postgres pg_dump -U postgres labelz > backup.sql
```

### Restore Database

```bash
docker-compose exec -T postgres psql -U postgres labelz < backup.sql
```

### Reset Database

```bash
# Remove volume (WARNING: deletes all data!)
docker-compose down -v
docker-compose up -d
```

## Troubleshooting

### Database Connection Issues

1. Check if PostgreSQL is running:
   ```bash
   docker-compose ps
   ```

2. Check PostgreSQL logs:
   ```bash
   docker-compose logs postgres
   ```

3. Verify connection from app container:
   ```bash
   docker-compose exec app sh -c "pg_isready -h postgres -p 5432 -U postgres"
   ```

### Application Won't Start

1. Check application logs:
   ```bash
   docker-compose logs app
   ```

2. Verify environment variables:
   ```bash
   docker-compose exec app env | grep DB_
   ```

3. Check if database was initialized:
   ```bash
   docker-compose exec postgres psql -U postgres -d labelz -c "\dt"
   ```

## Production Deployment

For production deployment:

1. Use strong passwords for `DB_PASSWORD` and `JWT_SECRET`
2. Set `NODE_ENV=production` (already set in Dockerfile)
3. Use a reverse proxy (nginx, Traefik, etc.) in front of the app
4. Set up SSL/TLS certificates
5. Configure proper firewall rules
6. Set up database backups
7. Use Docker secrets or a secrets management system for sensitive data

## Building Standalone Image

To build just the application image (without docker-compose):

```bash
docker build -t labelz-app .
```

Then run with external PostgreSQL:

```bash
docker run -d \
  -p 5174:5174 \
  -e DB_HOST=your-postgres-host \
  -e DB_PASSWORD=your-password \
  -e JWT_SECRET=your-secret \
  labelz-app
```
