## Backend API Server

This project's frontend runs in the browser, so it **cannot**:

- Create Coinbase Commerce charges securely (API key must not be shipped to the browser)
- Receive Coinbase Commerce webhooks
- Write to a local `.txt` file
- Store user data securely

So we run a small Node/Express API in `server/index.js` with PostgreSQL database.

### What it does

- **POST `/api/auth/signup`**: Creates a new user account (stored in PostgreSQL)
- **POST `/api/auth/login`**: Authenticates user and returns JWT token
- **POST `/api/coinbase/create-charge`**: Creates a Coinbase Commerce charge for the current cart and returns a `checkoutUrl` (Coinbase `hosted_url`) that the frontend redirects to.
- **POST `/api/coinbase/webhook`**: Receives Coinbase Commerce webhook events, verifies the `X-CC-Webhook-Signature`, and when the event is "confirmed", appends it to a local text file.

### PostgreSQL Database Setup

1. Install PostgreSQL if you haven't already: https://www.postgresql.org/download/

2. Create a database:
   ```sql
   CREATE DATABASE labelz;
   ```

3. The server will automatically create the `users` table on first startup.

### Required env vars

Set these in your shell before starting the API:

**Database:**
- **`DB_HOST`**: PostgreSQL host (default: `localhost`)
- **`DB_PORT`**: PostgreSQL port (default: `5432`)
- **`DB_NAME`**: Database name (default: `labelz`)
- **`DB_USER`**: PostgreSQL user (default: `postgres`)
- **`DB_PASSWORD`**: PostgreSQL password (default: `postgres`)

**Auth:**
- **`JWT_SECRET`**: Secret key for JWT tokens (default: `dev-secret-change-me` - **change this in production!**)

**Coinbase Commerce:**
- **`COINBASE_COMMERCE_API_KEY`**: Coinbase Commerce API key
- **`COINBASE_COMMERCE_WEBHOOK_SECRET`**: Coinbase Commerce webhook shared secret
- **`APP_URL`**: `http://localhost:5173` (used for invoice redirect)
- **`API_PORT`**: default `5174`
- **`LABEL_PRICE_USD`**: default `1` (used for label items in cart)
- **`COINBASE_ORDERS_FILE`**: default `./data/coinbase-commerce-orders.txt`

### Run locally

In one terminal:

```bash
npm run api
```

In another terminal:

```bash
npm run dev
```

### Coinbase Commerce webhook setup

In Coinbase Commerce, create a webhook that points to:

- `http(s)://YOUR_PUBLIC_API_HOST/api/coinbase/webhook`

Note: for local dev you’ll typically need a tunneling tool (e.g. ngrok) so Coinbase can reach your machine.

