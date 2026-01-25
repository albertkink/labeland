import crypto from "node:crypto";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import express from "express";
import multer from "multer";
import archiver from "archiver";
import jwt from "jsonwebtoken";
import {
  initDatabase,
  getAllUsers,
  getUserByUsername,
  getUserByHash,
  createUser,
  updateUser,
  hasAnyAdmin,
  getAllBlogPosts,
  getBlogPostById,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  createLabel,
  getLabelById,
  getLabelsByUserId,
  getAllLabels,
  updateLabel,
  getAllAccountProducts,
  createAccountProduct,
  deleteAccountProduct,
} from "./db.js";

const PORT = 8080;

// Coinbase Commerce
// DO NOT hardcode secrets here. Set env vars in your shell (see server/README.md).
const COINBASE_COMMERCE_API_KEY = process.env.COINBASE_COMMERCE_API_KEY;
const COINBASE_COMMERCE_WEBHOOK_SECRET =
  process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;

// App URL configuration
// Railway provides RAILWAY_PRIVATE_DOMAIN for private networking (e.g., labelz.railway.internal)
// For external redirects (Coinbase Commerce), we need the public URL
const RAILWAY_PRIVATE_DOMAIN = process.env.RAILWAY_PRIVATE_DOMAIN; // App's private domain
const RAILWAY_PUBLIC_DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN; // App's public domain (if set)
const APP_URL = process.env.APP_URL || 
  (RAILWAY_PUBLIC_DOMAIN ? `https://${RAILWAY_PUBLIC_DOMAIN}` : "http://label.land");
const APP_PRIVATE_URL = RAILWAY_PRIVATE_DOMAIN ? `http://${RAILWAY_PRIVATE_DOMAIN}` : null;

const LABEL_PRICE_USD = Number(process.env.LABEL_PRICE_USD || 1);

// Auth
const USERS_FILE =
  process.env.USERS_FILE || path.resolve(process.cwd(), "data", "users.json");
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

// Admin
const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((x) => x.trim().toLowerCase())
  .filter(Boolean);

// Wallet / Credits
const WALLETS_FILE =
  process.env.WALLETS_FILE || path.resolve(process.cwd(), "data", "wallets.json");
const CREDIT_LEDGER_FILE =
  process.env.CREDIT_LEDGER_FILE ||
  path.resolve(process.cwd(), "data", "credit-ledger.txt");

// Orders
const ORDERS_JSON_FILE =
  process.env.ORDERS_JSON_FILE ||
  path.resolve(process.cwd(), "data", "orders.json");

const ORDERS_FILE =
  process.env.COINBASE_ORDERS_FILE ||
  path.resolve(process.cwd(), "data", "coinbase-commerce-orders.txt");

const LABELS_UPLOAD_DIR =
  process.env.LABELS_UPLOAD_DIR ||
  path.resolve(process.cwd(), "data", "labels");

const app = express();

// Multer for label file uploads (admin "done")
const labelUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const id = String(req.params?.id || "").replace(/[^a-zA-Z0-9-]/g, "");
    if (!id) return cb(new Error("Missing label id"), null);
    const dir = path.join(LABELS_UPLOAD_DIR, id);
    fssync.mkdir(dir, { recursive: true }, (err) => {
      if (err) return cb(err, null);
      cb(null, dir);
    });
  },
  filename: (req, file, cb) => {
    const raw = String(file.originalname || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
    const base = raw || "file";
    const ext = path.extname(base) || "";
    const name = path.basename(base, ext) || "file";
    cb(null, `${Date.now()}_${name}${ext}`);
  },
});
const uploadLabelFiles = multer({
  storage: labelUploadStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
});

// CORS middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    "https://label.land",
    "http://label.land",
    APP_URL,
    APP_PRIVATE_URL, // Allow private domain for internal service-to-service communication
  ].filter(Boolean);
  
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  
  next();
});

// Middleware to prevent QUIC/HTTP3 protocol errors
// Explicitly disable HTTP/3 (QUIC) and force HTTP/1.1
app.use((req, res, next) => {
  // Security headers
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  
  // CRITICAL: Explicitly prevent QUIC/HTTP3 by removing any Alt-Svc headers
  // Alt-Svc headers advertise HTTP/3 support, which causes browsers to try QUIC
  res.removeHeader("Alt-Svc");
  res.removeHeader("alt-svc");
  res.removeHeader("Alt-SVC");
  
  // Force HTTP/1.1 connection - prevent protocol upgrades
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Upgrade", "");
  
  // Explicitly indicate we only support HTTP/1.1
  // This helps prevent browsers from attempting QUIC/HTTP3
  res.setHeader("X-Protocol-Version", "HTTP/1.1");
  
  // Remove any HTTP/2 or HTTP/3 related headers that might trigger QUIC
  res.removeHeader("HTTP2-Settings");
  res.removeHeader("h2");
  res.removeHeader("h3");
  
  next();
});

// Serve the built React app (Vite dist/) in production so one container can host both UI + API.
// This only activates when dist/index.html exists.
const DIST_DIR = path.resolve(process.cwd(), "dist");
const enableSpa = async () => {
  if (process.env.NODE_ENV !== "production") return;
  try {
    await fs.stat(path.join(DIST_DIR, "index.html"));
  } catch {
    console.log("dist/index.html not found, skipping SPA serving");
    return;
  }

  console.log("Enabling SPA static file serving from:", DIST_DIR);
  
  // Serve static files (JS, CSS, images, etc.) from dist folder
  // Cache static assets but NOT index.html
  app.use(express.static(DIST_DIR, {
    maxAge: "1y", // Cache static assets for 1 year
    etag: true,
    lastModified: true,
    // Don't cache index.html - it needs to be fresh for SPA routing
    setHeaders: (res, path) => {
      if (path.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
    },
  }));
  
  // SPA fallback: all non-API routes should serve index.html.
  // This MUST be after all API routes are defined
  // Match any route that doesn't start with /api
  app.get(/^\/(?!api\/).*/, (req, res) => {
    console.log(`SPA fallback: serving index.html for ${req.path}`);
    // Always send fresh index.html (no cache)
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(path.join(DIST_DIR, "index.html"), (err) => {
      if (err) {
        console.error("Error serving index.html:", err);
        res.status(500).send("Error loading application");
      }
    });
  });
};

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, protocol: "HTTP/1.1", quic: false });
});

// Test endpoint to verify QUIC prevention
app.get("/api/test", (_req, res) => {
  res.json({ 
    ok: true, 
    message: "Server is running",
    protocol: "HTTP/1.1",
    quicEnabled: false,
    timestamp: new Date().toISOString()
  });
});

const safeJsonParse = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const calcCartTotalUsd = (items) => {
  return Number(
    items
      .reduce((sum, it) => {
        if (it && typeof it === "object" && it.kind === "account") {
          const priceUsd = Number(it.priceUsd);
          return sum + (Number.isFinite(priceUsd) ? priceUsd : 0);
        }
        return sum + LABEL_PRICE_USD;
      }, 0)
      .toFixed(2),
  );
};

// Database functions replace readUsers/writeUsers
// Use getAllUsers(), getUserByUsername(), createUser(), updateUser() from db.js

const isEmailAdmin = (email) => {
  if (!email) return false;
  const e = String(email).trim().toLowerCase();
  return ADMIN_EMAILS.includes(e);
};

const anyUserIsAdmin = async () => {
  return await hasAnyAdmin();
};

const issueToken = (user) => {
  return jwt.sign(
    { sub: user.id, email: user.email, isAdmin: Boolean(user.isAdmin) },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
};

const requireAuth = (req, res, next) => {
  const auth = String(req.header("Authorization") || "");
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ ok: false, error: "Unauthorized." });
  try {
    const decoded = jwt.verify(m[1], JWT_SECRET);
    const sub = decoded && typeof decoded === "object" ? decoded.sub : null;
    const email = decoded && typeof decoded === "object" ? decoded.email : null;
    const isAdmin =
      decoded && typeof decoded === "object" ? decoded.isAdmin : false;
    if (typeof sub !== "string") {
      return res.status(401).json({ ok: false, error: "Unauthorized." });
    }
    req.user = { id: sub, email: typeof email === "string" ? email : "" };
    req.user.isAdmin = Boolean(isAdmin);
    return next();
  } catch {
    return res.status(401).json({ ok: false, error: "Unauthorized." });
  }
};

const optionalAuth = (req) => {
  const auth = String(req.header("Authorization") || "");
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const decoded = jwt.verify(m[1], JWT_SECRET);
    const sub = decoded && typeof decoded === "object" ? decoded.sub : null;
    const email = decoded && typeof decoded === "object" ? decoded.email : null;
    if (typeof sub !== "string") return null;
    return { id: sub, email: typeof email === "string" ? email : "" };
  } catch {
    return null;
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.isAdmin === true) return next();
  const email = String(req.user?.email || "").toLowerCase();
  if (!email || !isEmailAdmin(email)) {
    return res.status(403).json({ ok: false, error: "Forbidden." });
  }
  return next();
};

const readWallets = async () => {
  try {
    const raw = await fs.readFile(WALLETS_FILE, "utf8");
    const data = safeJsonParse(raw);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
};

const writeWallets = async (wallets) => {
  await fs.mkdir(path.dirname(WALLETS_FILE), { recursive: true });
  await fs.writeFile(WALLETS_FILE, JSON.stringify(wallets, null, 2), "utf8");
};

const getBalance = async (userId) => {
  const wallets = await readWallets();
  const entry = wallets[userId];
  const bal = entry && typeof entry.balance === "number" ? entry.balance : 0;
  return Number(bal.toFixed(2));
};

const addCredits = async (userId, delta, reason, meta) => {
  const wallets = await readWallets();
  const prev = wallets[userId] && typeof wallets[userId].balance === "number"
    ? wallets[userId].balance
    : 0;
  const nextBal = Number((prev + delta).toFixed(2));
  wallets[userId] = {
    balance: nextBal,
    updatedAt: new Date().toISOString(),
  };
  await writeWallets(wallets);

  await fs.mkdir(path.dirname(CREDIT_LEDGER_FILE), { recursive: true });
  await fs.appendFile(
    CREDIT_LEDGER_FILE,
    JSON.stringify({
      at: new Date().toISOString(),
      userId,
      delta,
      balance: nextBal,
      reason,
      meta,
    }) + "\n",
    "utf8",
  );

  return nextBal;
};

const readOrders = async () => {
  try {
    const raw = await fs.readFile(ORDERS_JSON_FILE, "utf8");
    const data = safeJsonParse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

const writeOrders = async (orders) => {
  await fs.mkdir(path.dirname(ORDERS_JSON_FILE), { recursive: true });
  await fs.writeFile(ORDERS_JSON_FILE, JSON.stringify(orders, null, 2), "utf8");
};

const upsertOrder = async (order) => {
  const orders = await readOrders();
  const idx = orders.findIndex((o) => String(o.orderId) === String(order.orderId));
  if (idx >= 0) orders[idx] = { ...orders[idx], ...order };
  else orders.push(order);
  await writeOrders(orders);
  return order;
};

app.get("/api/wallet/balance", requireAuth, async (req, res) => {
  const userId = req.user.id;
  const balance = await getBalance(userId);
  return res.json({ ok: true, balance });
});

app.post("/api/wallet/pay", requireAuth, express.json(), async (req, res) => {
  try {
    const userId = req.user.id;
    const body = req.body ?? {};
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return res.status(400).json({ ok: false, error: "Cart is empty." });
    }

    // Get email from request body or use user's email
    const providedEmail = typeof body.email === "string" ? body.email.trim() : "";
    const email = providedEmail || req.user.email || "";

    // Validate email if there are account items
    const hasAccountItems = items.some((item) => item.kind === "account");
    if (hasAccountItems && !email) {
      return res.status(400).json({
        ok: false,
        error: "Email is required for account purchases.",
      });
    }

    const total = calcCartTotalUsd(items);
    const balance = await getBalance(userId);
    if (balance < total) {
      return res.status(400).json({
        ok: false,
        error: `Insufficient credits. Balance: $${balance.toFixed(
          2,
        )}, total: $${total.toFixed(2)}.`,
      });
    }

    const orderId = crypto.randomUUID();
    const newBal = await addCredits(userId, -total, "purchase", {
      orderId,
      total,
      itemCount: items.length,
    });

    await upsertOrder({
      orderId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "paid",
      paidAt: new Date().toISOString(),
      paymentMethod: "credits",
      totalUsd: total,
      currency: "USD",
      items,
      user: { id: userId, email: email },
    });

    return res.json({ ok: true, orderId, total, balance: newBal });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

app.post(
  "/api/wallet/topup/create-charge",
  requireAuth,
  express.json(),
  async (req, res) => {
    try {
      if (!COINBASE_COMMERCE_API_KEY) {
        return res.status(500).json({
          ok: false,
          error:
            "Missing Coinbase Commerce config. Set COINBASE_COMMERCE_API_KEY.",
        });
      }

      const userId = req.user.id;
      const body = req.body ?? {};
      const amountUsd = Number(body.amountUsd);
      if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
        return res
          .status(400)
          .json({ ok: false, error: "amountUsd must be > 0." });
      }

      const topupId = crypto.randomUUID();
      const chargeRequest = {
        name: "Labelz Credits",
        description: `Credits top-up ($${amountUsd.toFixed(2)})`,
        pricing_type: "fixed_price",
        local_price: { amount: String(amountUsd.toFixed(2)), currency: "USD" },
        redirect_url: `${APP_URL}/cart`,
        cancel_url: `${APP_URL}/cart`,
        metadata: {
          purpose: "topup",
          userId,
          topupId,
          amountUsd: String(amountUsd.toFixed(2)),
        },
      };

      const r = await fetch("https://api.commerce.coinbase.com/charges", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CC-Api-Key": COINBASE_COMMERCE_API_KEY,
          "X-CC-Version": "2018-03-22",
          Accept: "application/json",
        },
        body: JSON.stringify(chargeRequest),
      });

      const data = await r.json().catch(() => null);
      if (!r.ok) {
        return res.status(502).json({
          ok: false,
          error: "Failed to create Coinbase Commerce charge.",
          details: data,
        });
      }

      const checkoutUrl =
        (data &&
          data.data &&
          (data.data.hosted_url || data.data.hostedUrl || data.data.hostedURL)) ??
        null;

      if (!checkoutUrl) {
        return res.status(502).json({
          ok: false,
          error:
            "Coinbase Commerce charge created, but no hosted_url was returned.",
          details: data,
        });
      }

      return res.json({
        ok: true,
        topupId,
        chargeId: (data && data.data && data.data.id) ?? null,
        checkoutUrl,
        amount: amountUsd,
        currency: "USD",
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
);

app.post("/api/auth/signup", express.json(), async (req, res) => {
  try {
    const body = req.body ?? {};
    const hash = String(body.hash ?? "").trim();
    const username = String(body.username ?? "").trim();
    const telegramUsername = body.telegramUsername
      ? String(body.telegramUsername).trim()
      : null;

    if (!hash) {
      return res.status(400).json({ ok: false, error: "Hash is required." });
    }
    if (hash.length < 16) {
      return res
        .status(400)
        .json({ ok: false, error: "Hash must be at least 16 characters." });
    }

    // Check if hash already exists
    try {
      console.log(`[signup] Checking hash existence for: ${hash.substring(0, 20)}...`);
      const existingUser = await getUserByHash(hash);
      if (existingUser) {
        console.log(`[signup] Hash already exists for user: ${existingUser.username} (id: ${existingUser.id})`);
        return res
          .status(409)
          .json({ ok: false, error: "Hash already exists." });
      }
      console.log(`[signup] Hash is available, proceeding with user creation`);
    } catch (hashCheckErr) {
      console.error("Error checking hash existence:", hashCheckErr);
      // Don't fail signup if hash check fails - continue with creation
      // (worst case: duplicate hash will be caught by unique constraint)
    }
    
    // Debug: List all existing users to verify we're querying the right DB
    try {
      const allUsers = await getAllUsers();
      console.log(`[signup] Current users in database: ${allUsers.length} (showing latest 5)`);
      allUsers.slice(-5).reverse().forEach((user, idx) => {
        console.log(`  ${idx + 1}. ${user.username} - hash: ${user.passwordHash?.substring(0, 20)}... (created: ${user.createdAt})`);
      });
    } catch (debugErr) {
      console.error("Error listing users for debug:", debugErr);
    }

    // Use hash directly (no bcrypt needed since it's already a hash)
    // Use provided username or generate one from hash
    const finalUsername = username || hash.substring(0, 20) || "user";

    const userData = {
      id: crypto.randomUUID(),
      username: finalUsername,
      email: null,
      telegramUsername: telegramUsername || null,
      passwordHash: hash, // Store hash directly
      isAdmin: false, // New users are not admin by default
    };

    try {
      const user = await createUser(userData);

      const token = issueToken(user);
      return res.json({
        ok: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          email: null,
          telegramUsername: user.telegramUsername || null,
          isAdmin: Boolean(user.isAdmin),
        },
      });
    } catch (createErr) {
      // Handle errors from createUser - it already throws specific errors
      console.error("createUser error:", createErr);
      if (createErr.message === "Username already exists") {
        return res.status(409).json({ ok: false, error: "Username already exists. Please try again." });
      }
      if (createErr.message === "Email already exists") {
        return res.status(409).json({ ok: false, error: "Email already exists." });
      }
      // Check for PostgreSQL unique constraint errors
      if (createErr.code === "23505") {
        const constraint = createErr.constraint || "";
        if (constraint.includes("username")) {
          return res.status(409).json({ ok: false, error: "Username already exists. Please try again." });
        }
        if (constraint.includes("email")) {
          return res.status(409).json({ ok: false, error: "Email already exists." });
        }
        // Unknown unique constraint - could be hash (shouldn't happen but handle it)
        return res.status(409).json({ ok: false, error: "A record with this information already exists." });
      }
      // Re-throw to outer catch for other errors
      throw createErr;
    }
  } catch (err) {
    // Handle any other unexpected errors
    console.error("Signup endpoint error:", err);
    console.error("Error details:", {
      message: err?.message,
      code: err?.code,
      constraint: err?.constraint,
      stack: err?.stack,
    });
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error occurred during signup",
    });
  }
});

app.post("/api/auth/login", express.json(), async (req, res) => {
  try {
    const body = req.body ?? {};
    const hash = String(body.hash ?? "").trim();

    if (!hash) {
      return res
        .status(400)
        .json({ ok: false, error: "Hash is required." });
    }

    console.log(`[login] Attempting login with hash: ${hash.substring(0, 20)}... (length: ${hash.length})`);
    
    const user = await getUserByHash(hash);
    if (!user) {
      console.log(`[login] No user found with hash: ${hash.substring(0, 20)}...`);
      return res.status(401).json({ ok: false, error: "Invalid hash." });
    }

    console.log(`[login] User found: ${user.username} (id: ${user.id})`);
    console.log(`[login] Comparing hashes - provided: ${hash.substring(0, 20)}... vs stored: ${user.passwordHash?.substring(0, 20)}...`);
    console.log(`[login] Hash match: ${user.passwordHash === hash}`);

    // Hash-based auth: directly compare hash (no bcrypt needed)
    const storedHash = String(user.passwordHash || "").trim();
    const providedHash = hash.trim();
    if (storedHash !== providedHash) {
      console.log(`[login] Hash mismatch - stored length: ${storedHash.length}, provided length: ${providedHash.length}`);
      return res.status(401).json({ ok: false, error: "Invalid hash." });
    }

    // Allow ADMIN_EMAILS to grant admin at login time.
    const userEmail = user.email ? String(user.email).toLowerCase() : "";
    const shouldBeAdmin =
      user.isAdmin === true ||
      (userEmail && isEmailAdmin(userEmail));
    if (shouldBeAdmin && user.isAdmin !== true) {
      await updateUser(user.id, { isAdmin: true });
      user.isAdmin = true;
    }

    const token = issueToken(user);
    return res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        username: user.username || null,
        email: user.email || null,
        telegramUsername: user.telegramUsername || null,
        isAdmin: Boolean(user.isAdmin),
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

app.post("/api/coinbase/create-charge", express.json(), async (req, res) => {
  try {
    if (!COINBASE_COMMERCE_API_KEY) {
      return res.status(500).json({
        ok: false,
        error:
          "Missing Coinbase Commerce config. Set COINBASE_COMMERCE_API_KEY.",
      });
    }

    const body = req.body ?? {};
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return res.status(400).json({ ok: false, error: "Cart is empty." });
    }

    // Get email from request body or use authenticated user's email
    const providedEmail = typeof body.email === "string" ? body.email.trim() : "";
    const who = optionalAuth(req);
    const email = providedEmail || (who ? who.email || "" : "");

    // Validate email if there are account items
    const hasAccountItems = items.some((item) => item.kind === "account");
    if (hasAccountItems && !email) {
      return res.status(400).json({
        ok: false,
        error: "Email is required for account purchases.",
      });
    }

    const orderId = crypto.randomUUID();
    const amount = calcCartTotalUsd(items);

    const chargeRequest = {
      name: "Labelz Cart",
      description: `Cart purchase (${items.length} items)`,
      pricing_type: "fixed_price",
      local_price: { amount: String(amount), currency: "USD" },
      redirect_url: `${APP_URL}/cart`,
      cancel_url: `${APP_URL}/cart`,
      metadata: {
        orderId,
        cartCount: items.length,
        // Keep metadata small.
      },
    };

    await upsertOrder({
      orderId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "pending",
      paymentMethod: "coinbase",
      totalUsd: amount,
      currency: "USD",
      items,
      user: who ? { id: who.id, email: email } : email ? { id: null, email: email } : null,
    });

    const r = await fetch("https://api.commerce.coinbase.com/charges", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CC-Api-Key": COINBASE_COMMERCE_API_KEY,
        "X-CC-Version": "2018-03-22",
        Accept: "application/json",
      },
      body: JSON.stringify(chargeRequest),
    });

    const data = await r.json().catch(() => null);
    if (!r.ok) {
      return res.status(502).json({
        ok: false,
        error: "Failed to create Coinbase Commerce charge.",
        details: data,
      });
    }

    const checkoutUrl =
      (data &&
        data.data &&
        (data.data.hosted_url || data.data.hostedUrl || data.data.hostedURL)) ??
      null;

    if (!checkoutUrl) {
      return res.status(502).json({
        ok: false,
        error:
          "Coinbase Commerce charge created, but no hosted_url was returned.",
        details: data,
      });
    }

    return res.json({
      ok: true,
      orderId,
      chargeId: (data && data.data && data.data.id) ?? null,
      checkoutUrl,
      amount,
      currency: "USD",
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

// Coinbase Commerce webhooks should POST here.
// We verify X-CC-Webhook-Signature using COINBASE_COMMERCE_WEBHOOK_SECRET and append
// "confirmed" charge events to a local .txt file.
app.post(
  "/api/coinbase/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      if (!COINBASE_COMMERCE_WEBHOOK_SECRET) {
        return res.status(500).send("Missing COINBASE_COMMERCE_WEBHOOK_SECRET");
      }

      const sigHeader = req.header("X-CC-Webhook-Signature") || "";
      const rawBody = req.body; // Buffer

      const expected = crypto
        .createHmac("sha256", COINBASE_COMMERCE_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

      const a = Buffer.from(sigHeader);
      const b = Buffer.from(expected);
      const match =
        a.length === b.length && crypto.timingSafeEqual(a, b) === true;

      if (!match) {
        return res.status(400).send("Invalid signature");
      }

      const payload = JSON.parse(rawBody.toString("utf8"));
      // Coinbase usually wraps events as { event: { type, data, ... } }
      const eventObj = payload?.event ?? payload;
      const type = String(eventObj?.type ?? "");
      const data = eventObj?.data ?? null;

      // Coinbase Commerce: persist only confirmed payments (and resolved as a fallback).
      const shouldPersist =
        type === "charge:confirmed" || type === "charge:resolved";

      if (shouldPersist) {
        await fs.mkdir(path.dirname(ORDERS_FILE), { recursive: true });
        const line = JSON.stringify({
          receivedAt: new Date().toISOString(),
          ...eventObj,
        });
        await fs.appendFile(ORDERS_FILE, line + "\n", "utf8");

        // If this is a credits top-up, credit the user's wallet.
        const meta = data && typeof data === "object" ? data.metadata : null;
        const purpose =
          meta && typeof meta === "object" ? String(meta.purpose ?? "") : "";
        const userId =
          meta && typeof meta === "object" ? String(meta.userId ?? "") : "";
        const amountUsdRaw =
          meta && typeof meta === "object" ? meta.amountUsd : null;
        const amountUsd = Number(amountUsdRaw);

        if (purpose === "topup" && userId && Number.isFinite(amountUsd)) {
          await addCredits(userId, Number(amountUsd.toFixed(2)), "topup", {
            chargeId: data?.id ?? null,
            type,
          });
        }

        // If this is a cart order, mark it as paid.
        const orderId =
          meta && typeof meta === "object" ? String(meta.orderId ?? "") : "";
        if (orderId && purpose !== "topup") {
          await upsertOrder({
            orderId,
            status: "paid",
            paidAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            paymentMethod: "coinbase",
            coinbase: {
              chargeId: data?.id ?? null,
              eventType: type,
            },
          });
        }
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
);

// Bug Fix Blog (public)
app.get("/api/blog", async (_req, res) => {
  try {
    const posts = await getAllBlogPosts();
    return res.json({ ok: true, posts });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

app.get("/api/blog/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const post = await getBlogPostById(id);
    if (!post) return res.status(404).json({ ok: false, error: "Not found." });
    return res.json({ ok: true, post });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

// Admin: blog CRUD
app.get("/api/admin/blog", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const posts = await getAllBlogPosts();
    return res.json({ ok: true, posts });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

app.post(
  "/api/admin/blog",
  requireAuth,
  requireAdmin,
  express.json(),
  async (req, res) => {
    try {
      const body = req.body ?? {};
      const title = String(body.title ?? "").trim();
      const content = String(body.content ?? "").trim();
      if (!title) {
        return res.status(400).json({ ok: false, error: "title required." });
      }
      const id = crypto.randomUUID();
      const post = await createBlogPost({ id, title, content });
      return res.json({ ok: true, post });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
);

app.put(
  "/api/admin/blog/:id",
  requireAuth,
  requireAdmin,
  express.json(),
  async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const body = req.body ?? {};
      const title = String(body.title ?? "").trim();
      const content = String(body.content ?? "").trim();
      if (!title) {
        return res.status(400).json({ ok: false, error: "title required." });
      }
      const post = await updateBlogPost(id, { title, content });
      if (!post) return res.status(404).json({ ok: false, error: "Not found." });
      return res.json({ ok: true, post });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
);

app.delete(
  "/api/admin/blog/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const deleted = await deleteBlogPost(id);
      if (!deleted) return res.status(404).json({ ok: false, error: "Not found." });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
);

// Admin: orders (kept for potential use)
app.get("/api/admin/orders", requireAuth, requireAdmin, async (_req, res) => {
  const orders = await readOrders();
  orders.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return res.json({ ok: true, orders });
});

app.delete("/api/admin/orders/:orderId", requireAuth, requireAdmin, async (req, res) => {
  const orderId = String(req.params.orderId || "");
  const orders = await readOrders();
  const next = orders.filter((o) => String(o.orderId) !== orderId);
  await writeOrders(next);
  return res.json({ ok: true });
});

// Account Products (public GET, admin POST/DELETE)
app.get("/api/account-products", async (_req, res) => {
  try {
    const products = await getAllAccountProducts();
    return res.json({ ok: true, products });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

app.post(
  "/api/admin/account-products",
  requireAuth,
  requireAdmin,
  express.json(),
  async (req, res) => {
    try {
      const body = req.body ?? {};
      const service = String(body.service ?? "").trim();
      const informations = String(body.informations ?? "").trim();
      const country = String(body.country ?? "").trim();
      const priceUsd = Number(body.priceUsd ?? 0);

      if (!service) {
        return res.status(400).json({ ok: false, error: "service required." });
      }
      if (!country) {
        return res.status(400).json({ ok: false, error: "country required." });
      }
      if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
        return res.status(400).json({ ok: false, error: "valid priceUsd required." });
      }

      const product = await createAccountProduct({
        service,
        informations,
        country,
        priceUsd,
      });
      return res.json({ ok: true, product });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
);

app.delete(
  "/api/admin/account-products/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const deleted = await deleteAccountProduct(id);
      if (!deleted) return res.status(404).json({ ok: false, error: "Not found." });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
);

// --- Labels (user) ---
app.post("/api/labels", requireAuth, express.json(), async (req, res) => {
  try {
    const userId = req.user.id;
    const body = req.body ?? {};
    const labelData = body.labelData ?? body;
    const id = crypto.randomUUID();
    const label = await createLabel({ id, userId, labelData });
    return res.json({ ok: true, label });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

app.get("/api/labels", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const labels = await getLabelsByUserId(userId);
    return res.json({ ok: true, labels });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

app.get("/api/labels/:id", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const label = await getLabelById(id);
    if (!label) return res.status(404).json({ ok: false, error: "Not found." });
    if (label.userId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ ok: false, error: "Forbidden." });
    }
    return res.json({ ok: true, label });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

app.get("/api/labels/:id/download", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const label = await getLabelById(id);
    if (!label) return res.status(404).json({ ok: false, error: "Not found." });
    if (label.userId !== req.user.id) {
      return res.status(403).json({ ok: false, error: "Forbidden." });
    }
    if (label.status !== "done") {
      return res.status(400).json({ ok: false, error: "Label is not ready for download." });
    }
    const files = Array.isArray(label.files) ? label.files : [];
    if (files.length === 0) {
      return res.status(404).json({ ok: false, error: "No documents available." });
    }
    const dir = path.join(LABELS_UPLOAD_DIR, id);
    const existing = [];
    for (const f of files) {
      const stored = (typeof f === "object" && f && f.filename) ? f.filename : (typeof f === "string" ? f : null);
      if (!stored) continue;
      const fp = path.join(dir, stored);
      try {
        await fs.access(fp);
        const name = (typeof f === "object" && f && f.originalName) ? f.originalName : stored;
        existing.push({ path: fp, name });
      } catch {
        /* skip missing */
      }
    }
    if (existing.length === 0) {
      return res.status(404).json({ ok: false, error: "No documents found on disk." });
    }
    if (existing.length === 1) {
      const [one] = existing;
      const name = one.name || "document";
      return res.download(one.path, name);
    }
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="label-${id}-documents.zip"`);
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      if (!res.headersSent) res.status(500).json({ ok: false, error: err.message });
    });
    archive.pipe(res);
    for (const f of existing) {
      archive.file(f.path, { name: f.name || path.basename(f.path) });
    }
    await archive.finalize();
  } catch (err) {
    if (!res.headersSent) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
});

// --- Admin: labels ---
app.get("/api/admin/labels", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const labels = await getAllLabels();
    return res.json({ ok: true, labels });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

app.post(
  "/api/admin/labels/:id/done",
  requireAuth,
  requireAdmin,
  (req, res, next) => {
    uploadLabelFiles.array("files", 20)(req, res, (err) => {
      if (err) return res.status(400).json({ ok: false, error: err?.message || "Upload failed." });
      next();
    });
  },
  async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const label = await getLabelById(id);
      if (!label) return res.status(404).json({ ok: false, error: "Not found." });
      if (label.status !== "pending") {
        return res.status(400).json({ ok: false, error: "Label is not pending." });
      }
      const uploaded = (req.files || []).map((f) => ({
        filename: f.filename,
        originalName: f.originalname || f.filename,
      }));
      if (uploaded.length === 0) {
        return res.status(400).json({ ok: false, error: "Upload at least one file." });
      }
      await updateLabel(id, { status: "done", files: uploaded });
      const updated = await getLabelById(id);
      return res.json({ ok: true, label: updated });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
);

app.post(
  "/api/admin/labels/:id/decline",
  requireAuth,
  requireAdmin,
  express.json(),
  async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const body = req.body ?? {};
      const reason = String(body.reason ?? "").trim();
      if (!reason) {
        return res.status(400).json({ ok: false, error: "Reason is required." });
      }
      const label = await getLabelById(id);
      if (!label) return res.status(404).json({ ok: false, error: "Not found." });
      if (label.status !== "pending") {
        return res.status(400).json({ ok: false, error: "Label is not pending." });
      }
      await updateLabel(id, { status: "cancelled", declineReason: reason });
      const updated = await getLabelById(id);
      return res.json({ ok: true, label: updated });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
);

// --- SMS Verification (SMSPool.net) ---
const SMSPOOL_API_KEY = "SkYJoK2X5STWKhgBiZPP0k1XziMYlWEZ";
const SMSPOOL_API_BASE = "https://api.smspool.net";

// Helper function to make SMSPool API requests
const smspoolRequest = async (endpoint, options = {}) => {
  const url = new URL(`${SMSPOOL_API_BASE}${endpoint}`);
  
  // If there are additional query params in options, add them
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      url.searchParams.set(key, value);
    }
  }
  
  const fetchOptions = {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SMSPOOL_API_KEY}`,
      ...(options.headers || {}),
    },
  };
  
  // Add body for POST requests
  if (options.body && (options.method === "POST" || options.method === "PUT")) {
    fetchOptions.body = typeof options.body === "string" 
      ? options.body 
      : JSON.stringify(options.body);
  }
  
  const response = await fetch(url.toString(), fetchOptions);
  
  if (!response.ok) {
    const errorText = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { error: errorText || `HTTP ${response.status}` };
    }
    const errorMessage = errorData.error || errorData.message || errorData.msg || `API request failed: ${response.status}`;
    console.error(`[SMSPool API] Request failed: ${url.toString()}`, {
      status: response.status,
      statusText: response.statusText,
      error: errorMessage,
      response: errorText.substring(0, 500), // First 500 chars of response
    });
    throw new Error(errorMessage);
  }
  
  return await response.json();
};

// Get available services
app.get("/api/sms-verification/services", requireAuth, async (_req, res) => {
  try {
    // Get pricing information which includes services
    const data = await smspoolRequest("/request/pricing");
    const services = [];
    
    // SMSPool API returns pricing data with services per country
    // We'll extract unique services from the pricing data
    if (data && typeof data === "object") {
      const serviceMap = new Map();
      for (const [country, countryData] of Object.entries(data)) {
        if (countryData && typeof countryData === "object") {
          for (const [service, price] of Object.entries(countryData)) {
            if (typeof price === "number" && !serviceMap.has(service)) {
              serviceMap.set(service, {
                service,
                name: service.charAt(0).toUpperCase() + service.slice(1).replace(/_/g, " "),
                price: price,
              });
            }
          }
        }
      }
      services.push(...Array.from(serviceMap.values()));
    }
    
    return res.json({ ok: true, services });
  } catch (err) {
    console.error("[SMS Verification] Error fetching services:", err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
      services: [],
    });
  }
});

// Get available countries
app.get("/api/sms-verification/countries", requireAuth, async (_req, res) => {
  try {
    const data = await smspoolRequest("/request/pricing");
    const countries = [];
    
    if (data && typeof data === "object") {
      for (const [code, countryData] of Object.entries(data)) {
        if (countryData && typeof countryData === "object") {
          countries.push({
            code: code.toUpperCase(),
            name: code.charAt(0).toUpperCase() + code.slice(1).replace(/_/g, " "),
          });
        }
      }
    }
    
    return res.json({ ok: true, countries });
  } catch (err) {
    console.error("[SMS Verification] Error fetching countries:", err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
      countries: [],
    });
  }
});

// Get rental countries
app.get("/api/sms-verification/rental-countries", requireAuth, async (_req, res) => {
  try {
    // Get rental pricing information
    const data = await smspoolRequest("/rental/pricing");
    const countries = [];
    
    if (data && typeof data === "object") {
      for (const [code, price] of Object.entries(data)) {
        if (typeof price === "number") {
          countries.push({
            code: code.toUpperCase(),
            name: code.charAt(0).toUpperCase() + code.slice(1).replace(/_/g, " "),
            price: price,
            available: true,
          });
        }
      }
    }
    
    return res.json({ ok: true, countries });
  } catch (err) {
    console.error("[SMS Verification] Error fetching rental countries:", err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
      countries: [],
    });
  }
});

// Get temporary number
app.post("/api/sms-verification/get-number", requireAuth, express.json(), async (req, res) => {
  try {
    const body = req.body ?? {};
    const country = String(body.country || "").toLowerCase();
    const service = String(body.service || "");
    
    if (!country || !service) {
      return res.status(400).json({ ok: false, error: "Country and service are required." });
    }
    
    // Order a number using SMSPool API
    // SMSPool API typically uses query parameters for ordering
    const data = await smspoolRequest("/request/sms/order", {
      method: "POST",
      query: {
        country,
        service,
      },
    });
    
    if (!data || (!data.id && !data.order_id)) {
      return res.status(500).json({ ok: false, error: data?.error || data?.message || "Failed to get number from SMSPool." });
    }
    
    return res.json({
      ok: true,
      number: {
        id: String(data.id || data.order_id || ""),
        number: data.number || data.phone || "",
        service,
        country: country.toUpperCase(),
        status: "pending",
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

// Get SMS code for a number
app.post("/api/sms-verification/get-code/:id", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!id) {
      return res.status(400).json({ ok: false, error: "Number ID is required." });
    }
    
    // Get SMS code using SMSPool API
    const data = await smspoolRequest("/request/sms/status", {
      query: {
        order_id: id,
      },
    });
    
    // Check various possible status values
    const status = data?.status || data?.state || "";
    const isCompleted = status === "SMS_RECEIVED" || status === "completed" || status === "RECEIVED";
    
    if (!isCompleted || !data.code) {
      return res.json({
        ok: true,
        code: null,
        status: status || "pending",
        message: "SMS not received yet. Please wait and try again.",
      });
    }
    
    return res.json({
      ok: true,
      code: data.code || data.sms || data.message || "",
      status: "completed",
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

// Get user's temporary numbers
app.get("/api/sms-verification/temporary-numbers", requireAuth, async (req, res) => {
  try {
    // Get active orders from SMSPool
    const data = await smspoolRequest("/sms/orders");
    
    const numbers = [];
    if (Array.isArray(data)) {
      for (const order of data) {
        if (order && typeof order === "object") {
          numbers.push({
            id: String(order.id || order.order_id || ""),
            number: String(order.number || order.phone || ""),
            service: String(order.service || ""),
            country: String(order.country || "").toUpperCase(),
            status: order.status === "SMS_RECEIVED" ? "completed" : "pending",
            code: order.code || order.sms || undefined,
            createdAt: order.created_at || new Date().toISOString(),
          });
        }
      }
    }
    
    return res.json({ ok: true, numbers });
  } catch (err) {
    console.error("[SMS Verification] Error fetching temporary numbers:", err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
      numbers: [],
    });
  }
});

// Rent a number
app.post("/api/sms-verification/rent-number", requireAuth, express.json(), async (req, res) => {
  try {
    const body = req.body ?? {};
    const country = String(body.country || "").toLowerCase();
    
    if (!country) {
      return res.status(400).json({ ok: false, error: "Country is required." });
    }
    
    // Rent a number using SMSPool API
    const data = await smspoolRequest("/request/rental/order", {
      method: "POST",
      query: {
        country,
      },
    });
    
    if (!data || (!data.id && !data.rental_id)) {
      return res.status(500).json({ ok: false, error: data?.error || data?.message || "Failed to rent number from SMSPool." });
    }
    
    // Calculate expiration (typically 24 hours for rental, or use API response)
    const expiresAt = data.expires_at 
      ? new Date(data.expires_at)
      : (() => {
          const exp = new Date();
          exp.setHours(exp.getHours() + 24);
          return exp;
        })();
    
    return res.json({
      ok: true,
      rental: {
        id: String(data.id || data.rental_id || ""),
        number: data.number || data.phone || "",
        country: country.toUpperCase(),
        service: "all",
        expiresAt: expiresAt.toISOString(),
        status: "active",
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

// Get user's rentals
app.get("/api/sms-verification/rentals", requireAuth, async (req, res) => {
  try {
    // Get active rentals from SMSPool
    const data = await smspoolRequest("/request/rental/orders");
    
    const rentals = [];
    if (Array.isArray(data)) {
      for (const rental of data) {
        if (rental && typeof rental === "object") {
          const expiresAt = rental.expires_at || rental.expiresAt;
          const expires = expiresAt
            ? new Date(expiresAt)
            : new Date(Date.now() + 24 * 60 * 60 * 1000);
          
          rentals.push({
            id: String(rental.id || rental.rental_id || ""),
            number: String(rental.number || rental.phone || ""),
            country: String(rental.country || "").toUpperCase(),
            service: String(rental.service || "all"),
            expiresAt: expires.toISOString(),
            status: expires > new Date() ? "active" : "expired",
          });
        }
      }
    }
    
    return res.json({ ok: true, rentals });
  } catch (err) {
    console.error("[SMS Verification] Error fetching rentals:", err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
      rentals: [],
    });
  }
});

// Initialize database and start server
(async () => {
  try {
    await initDatabase();
    const server = app.listen(PORT, () => {
      console.log(`API listening on port ${PORT}`);
      if (APP_PRIVATE_URL) {
        console.log(`  Private URL: ${APP_PRIVATE_URL}:${PORT}`);
      }
      console.log(`  Public URL: ${APP_URL}`);
      console.log("Using HTTP/1.1 (QUIC/HTTP3 disabled)");
    });
    
    // Explicitly prevent HTTP/2 and HTTP/3 protocol upgrades
    // This helps prevent QUIC protocol errors
    server.on("upgrade", (req, socket, head) => {
      // Reject upgrade requests to prevent HTTP/2 or HTTP/3
      socket.destroy();
    });
    
    // eslint-disable-next-line no-void
    void enableSpa();
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
})();

