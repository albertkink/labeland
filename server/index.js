import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  initDatabase,
  getAllUsers,
  getUserByUsername,
  createUser,
  updateUser,
  hasAnyAdmin,
} from "./db.js";

const PORT = Number(process.env.API_PORT || 5174);

// Coinbase Commerce
// DO NOT hardcode secrets here. Set env vars in your shell (see server/README.md).
const COINBASE_COMMERCE_API_KEY = process.env.COINBASE_COMMERCE_API_KEY;
const COINBASE_COMMERCE_WEBHOOK_SECRET =
  process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;

const APP_URL = process.env.APP_URL || "http://localhost:5173";
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

// Orders + products
const ORDERS_JSON_FILE =
  process.env.ORDERS_JSON_FILE ||
  path.resolve(process.cwd(), "data", "orders.json");
const ACCOUNT_PRODUCTS_FILE =
  process.env.ACCOUNT_PRODUCTS_FILE ||
  path.resolve(process.cwd(), "data", "account-products.json");

const ORDERS_FILE =
  process.env.COINBASE_ORDERS_FILE ||
  path.resolve(process.cwd(), "data", "coinbase-commerce-orders.txt");

const app = express();

// Serve the built React app (Vite dist/) in production so one container can host both UI + API.
// This only activates when dist/index.html exists.
const DIST_DIR = path.resolve(process.cwd(), "dist");
const enableSpa = async () => {
  if (process.env.NODE_ENV !== "production") return;
  try {
    await fs.stat(path.join(DIST_DIR, "index.html"));
  } catch {
    return;
  }

  app.use(express.static(DIST_DIR));
  // SPA fallback: all non-API routes should serve index.html.
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
};

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
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

const readAccountProducts = async () => {
  try {
    const raw = await fs.readFile(ACCOUNT_PRODUCTS_FILE, "utf8");
    const data = safeJsonParse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

const writeAccountProducts = async (products) => {
  await fs.mkdir(path.dirname(ACCOUNT_PRODUCTS_FILE), { recursive: true });
  await fs.writeFile(
    ACCOUNT_PRODUCTS_FILE,
    JSON.stringify(products, null, 2),
    "utf8",
  );
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
      user: { id: userId, email: req.user.email || "" },
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
    const username = String(body.username ?? "").trim();
    const telegramUsername = body.telegramUsername
      ? String(body.telegramUsername).trim()
      : null;
    const password = String(body.password ?? "");

    if (!username) {
      return res.status(400).json({ ok: false, error: "Username is required." });
    }
    if (password.length < 8) {
      return res
        .status(400)
        .json({ ok: false, error: "Password must be at least 8 characters." });
    }

    // Check if username already exists
    const existingUser = await getUserByUsername(username);
    if (existingUser) {
      return res
        .status(409)
        .json({ ok: false, error: "Username already exists." });
    }

    // Make the very first user an admin by default (dev-friendly)
    const hasAdmin = await hasAnyAdmin();
    const makeAdmin = !hasAdmin;

    const passwordHash = await bcrypt.hash(password, 10);
    const userData = {
      id: crypto.randomUUID(),
      username,
      email: null,
      telegramUsername: telegramUsername || null,
      passwordHash,
      isAdmin: makeAdmin,
    };

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
  } catch (err) {
    // Handle unique constraint errors
    if (err.message === "Username already exists") {
      return res.status(409).json({ ok: false, error: err.message });
    }
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

app.post("/api/auth/login", express.json(), async (req, res) => {
  try {
    const body = req.body ?? {};
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");

    if (!username || !password) {
      return res
        .status(400)
        .json({ ok: false, error: "Username and password are required." });
    }

    const user = await getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ ok: false, error: "Invalid credentials." });
    }

    const ok = await bcrypt.compare(password, String(user.passwordHash ?? ""));
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Invalid credentials." });
    }

    // If no admin exists yet, promote this user to admin automatically (dev-friendly).
    // Also allow ADMIN_EMAILS to grant admin at login time.
    const userEmail = user.email ? String(user.email).toLowerCase() : "";
    const hasAdmin = await hasAnyAdmin();
    const shouldBeAdmin =
      user.isAdmin === true ||
      (userEmail && isEmailAdmin(userEmail)) ||
      !hasAdmin;
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

    const orderId = crypto.randomUUID();
    const amount = calcCartTotalUsd(items);
    const who = optionalAuth(req);

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
      user: who ? { id: who.id, email: who.email || "" } : null,
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

// Public products list for the marketplace
app.get("/api/account-products", async (_req, res) => {
  const products = await readAccountProducts();
  const enabled = products.filter((p) => p && p.enabled !== false);
  return res.json({ ok: true, products: enabled });
});

// Admin: list/create products
app.get("/api/admin/account-products", requireAuth, requireAdmin, async (_req, res) => {
  const products = await readAccountProducts();
  return res.json({ ok: true, products });
});

app.post(
  "/api/admin/account-products",
  requireAuth,
  requireAdmin,
  express.json(),
  async (req, res) => {
    try {
      const body = req.body ?? {};
      const productName = String(body.productName ?? "").trim();
      const priceUsd = Number(body.priceUsd);
      const country = String(body.country ?? "").trim();
      const numberOfShipments = Number(body.numberOfShipments);

      if (!productName) {
        return res.status(400).json({ ok: false, error: "productName required." });
      }
      if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
        return res.status(400).json({ ok: false, error: "priceUsd must be > 0." });
      }
      if (!country) {
        return res.status(400).json({ ok: false, error: "country required." });
      }
      if (!Number.isFinite(numberOfShipments) || numberOfShipments < 0) {
        return res
          .status(400)
          .json({ ok: false, error: "numberOfShipments must be >= 0." });
      }

      const products = await readAccountProducts();
      const product = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        enabled: true,
        productName,
        priceUsd: Number(priceUsd.toFixed(2)),
        country,
        numberOfShipments: Math.floor(numberOfShipments),
      };
      products.unshift(product);
      await writeAccountProducts(products);
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
    const id = String(req.params.id || "");
    const products = await readAccountProducts();
    const next = products.filter((p) => String(p.id) !== id);
    await writeAccountProducts(next);
    return res.json({ ok: true });
  },
);

// Admin: orders
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

// Initialize database and start server
(async () => {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`API listening on http://localhost:${PORT}`);
    });
    // eslint-disable-next-line no-void
    void enableSpa();
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
})();

