import pg from "pg";
const { Pool } = pg;

// PostgreSQL connection configuration
// Railway automatically injects these variables when you add a PostgreSQL service:
// - DATABASE_URL (full connection string)
// - PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
// You can also reference variables from a PostgreSQL service using: ${{Postgres.PGDATABASE}}
let poolConfig;

if (process.env.DATABASE_URL) {
  // Use DATABASE_URL if provided (Railway's primary connection string)
  console.log("Using DATABASE_URL for PostgreSQL connection");
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000,
    ssl: {
      rejectUnauthorized: false,
    },
  };
  // Log connection info (without password)
  try {
    const url = new URL(process.env.DATABASE_URL);
    console.log(`Connecting to: ${url.protocol}//${url.username}@${url.hostname}:${url.port}${url.pathname}`);
  } catch (e) {
    console.log("Using DATABASE_URL (format not parseable)");
  }
} else {
  // Use Railway PostgreSQL service variables (automatically injected)
  // These are provided by Railway when you add a PostgreSQL service to your project
  // Falls back to defaults if not set (for development or if Railway vars aren't available yet)
  // Railway provides: PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
  // Also checks for alternative names: RAILWAY_PRIVATE_DOMAIN, RAILWAY_TCP_PROXY_PORT, POSTGRES_*
  // Also supports standard DB_* variables for local development and Docker
  // 
  // Railway Private Networking Priority:
  // 1. RAILWAY_PRIVATE_DOMAIN (e.g., postgres.railway.internal) - private networking
  // 2. PGHOST (Railway service variable)
  // 3. postgres.railway.internal (Railway convention if RAILWAY environment is set)
  // 4. DB_HOST (for Docker/local)
  // 5. localhost (fallback)
  const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID;
  const railwayPrivateHost = process.env.RAILWAY_PRIVATE_DOMAIN || 
    (isRailway ? "postgres.railway.internal" : null);
  
  const host = process.env.PGHOST || railwayPrivateHost || process.env.DB_HOST;
  const port = process.env.PGPORT || process.env.RAILWAY_TCP_PROXY_PORT || process.env.DB_PORT;
  const database = process.env.PGDATABASE || process.env.POSTGRES_DB || process.env.DB_NAME;
  const user = process.env.PGUSER || process.env.POSTGRES_USER || process.env.DB_USER;
  const password = process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD;

  // Determine if we're using Railway private networking
  const isPrivateNetwork = host && (
    host.includes("railway.internal") || 
    host === process.env.RAILWAY_PRIVATE_DOMAIN
  );

  // Use Railway variables if available, otherwise fall back to defaults
  // This allows the app to start even if Railway vars aren't set yet
  // Never throw errors at initialization - let the connection attempt handle failures
  // Defaults to localhost for local development
  poolConfig = {
    host: host || "localhost",
    port: Number(port || "5432"),
    database: database || "labelz",
    user: user || "postgres",
    password: password || "postgres",
    // Connection pool settings
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 20000, // Increased timeout
    // SSL: Only required for public Railway connections, not private networking
    // Private networking (railway.internal) doesn't need SSL
    ssl: isPrivateNetwork ? false : {
      rejectUnauthorized: false, // Railway uses self-signed certificates for public connections
    },
  };
  
  // Log a warning if using fallbacks, but don't throw errors
  // The connection will fail gracefully if credentials are wrong
  if (!host || !database || !user || !password) {
    console.warn(
      "⚠️  Using fallback PostgreSQL defaults. " +
      "For production, ensure database environment variables are set: " +
      "DATABASE_URL (or PGHOST/PGDATABASE/PGUSER/PGPASSWORD for Railway, or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD for local/Docker)"
    );
  }
  
  const connectionType = isPrivateNetwork ? "private network" : (poolConfig.ssl ? "public (SSL)" : "local");
  console.log(`Connecting to PostgreSQL via ${connectionType}: ${poolConfig.user}@${poolConfig.host}:${poolConfig.port}/${poolConfig.database}`);
}

const pool = new Pool(poolConfig);

// Test the connection
pool.on("connect", () => {
  console.log("Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

// Initialize database - create users table if it doesn't exist
// Retries connection if PostgreSQL isn't ready yet (useful for Docker/Railway)
export const initDatabase = async (maxRetries = 15, retryDelay = 3000) => {
  console.log(`Initializing database (max ${maxRetries} attempts, ${retryDelay}ms delay)...`);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Database connection attempt ${attempt}/${maxRetries}...`);
      const client = await pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username VARCHAR(255) UNIQUE NOT NULL,
            email VARCHAR(255),
            telegram_username VARCHAR(255),
            password_hash VARCHAR(255) NOT NULL,
            is_admin BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_users_username ON users(LOWER(username));
          CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

          CREATE TABLE IF NOT EXISTS bug_fix_blog (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title VARCHAR(500) NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS labels (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'cancelled')),
            decline_reason TEXT,
            label_data JSONB NOT NULL DEFAULT '{}',
            files JSONB NOT NULL DEFAULT '[]',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS idx_labels_user_id ON labels(user_id);
          CREATE INDEX IF NOT EXISTS idx_labels_status ON labels(status);
          CREATE INDEX IF NOT EXISTS idx_labels_created_at ON labels(created_at DESC);

          CREATE TABLE IF NOT EXISTS account_products (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            service VARCHAR(255) NOT NULL,
            informations TEXT,
            country VARCHAR(100) NOT NULL,
            price_usd DECIMAL(10, 2) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS idx_account_products_country ON account_products(country);
          CREATE INDEX IF NOT EXISTS idx_account_products_price ON account_products(price_usd);
        `);
        console.log("✅ Database initialized successfully");
        return;
      } finally {
        client.release();
      }
    } catch (err) {
      const errorMessage = err.message || String(err);
      const errorCode = err.code || "UNKNOWN";
      
      console.error(`❌ Database connection attempt ${attempt}/${maxRetries} failed:`);
      console.error(`   Error: ${errorMessage}`);
      console.error(`   Code: ${errorCode}`);
      
      if (attempt < maxRetries) {
        console.log(`   Retrying in ${retryDelay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } else {
        console.error("❌ Error initializing database after all retries");
        console.error("Full error details:", {
          message: err.message,
          code: err.code,
          syscall: err.syscall,
          address: err.address,
          port: err.port,
          stack: err.stack,
        });
        
        // Provide helpful error message
        if (errorCode === "ECONNREFUSED") {
          throw new Error(
            `Database connection refused. Check that:\n` +
            `1. Database credentials are correct\n` +
            `2. PostgreSQL service is running\n` +
            `3. Network connectivity is available\n` +
            `Original error: ${errorMessage}`
          );
        }
        throw err;
      }
    }
  }
};

// Get all users
export const getAllUsers = async () => {
  try {
    const result = await pool.query(
      `SELECT id, username, email, telegram_username as "telegramUsername", 
              password_hash as "passwordHash", is_admin as "isAdmin", 
              created_at as "createdAt", updated_at as "updatedAt"
       FROM users ORDER BY created_at ASC`
    );
    return result.rows.map((row) => ({
      id: row.id,
      username: row.username,
      email: row.email,
      telegramUsername: row.telegramUsername,
      passwordHash: row.passwordHash,
      isAdmin: row.isAdmin,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
    }));
  } catch (err) {
    console.error("Error getting all users:", err);
    throw err;
  }
};

// Get user by hash
export const getUserByHash = async (hash) => {
  try {
    const trimmedHash = String(hash).trim();
    console.log(`[getUserByHash] Checking for hash: ${trimmedHash.substring(0, 20)}... (length: ${trimmedHash.length})`);
    let dbInfo;
    try {
      dbInfo = poolConfig.connectionString 
        ? `DATABASE_URL (${new URL(poolConfig.connectionString).pathname.replace('/', '')})`
        : `${poolConfig.database || 'unknown'}@${poolConfig.host || 'unknown'}:${poolConfig.port || 'unknown'}`;
    } catch (e) {
      dbInfo = "config.json";
    }
    console.log(`[getUserByHash] Database: ${dbInfo}`);
    
    // First, let's see ALL hashes in the database for debugging
    const allHashesResult = await pool.query(
      `SELECT password_hash, username, id FROM users LIMIT 10`
    );
    console.log(`[getUserByHash] Total users in DB: ${allHashesResult.rows.length}`);
    allHashesResult.rows.forEach((row, idx) => {
      const storedHash = row.password_hash || '';
      const matches = storedHash === trimmedHash;
      console.log(`  ${idx + 1}. User: ${row.username} - Hash: ${storedHash.substring(0, 20)}... (matches: ${matches})`);
    });
    
    const result = await pool.query(
      `SELECT id, username, email, telegram_username as "telegramUsername", 
              password_hash as "passwordHash", is_admin as "isAdmin", 
              created_at as "createdAt", updated_at as "updatedAt"
       FROM users WHERE password_hash = $1`,
      [trimmedHash]
    );
    
    console.log(`[getUserByHash] Query returned ${result.rows.length} row(s) for hash: ${trimmedHash.substring(0, 20)}...`);
    if (result.rows.length > 0) {
      console.log(`[getUserByHash] Found existing user: ${result.rows[0].username} (id: ${result.rows[0].id})`);
      console.log(`[getUserByHash] Stored hash: ${result.rows[0].passwordHash?.substring(0, 20)}... (length: ${result.rows[0].passwordHash?.length})`);
      console.log(`[getUserByHash] Hash match: ${result.rows[0].passwordHash === trimmedHash}`);
    }
    
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      telegramUsername: row.telegramUsername,
      passwordHash: row.passwordHash,
      isAdmin: row.isAdmin,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
    };
  } catch (err) {
    console.error("Error getting user by hash:", err);
    throw err;
  }
};

// Get user by username (case-insensitive) - kept for backward compatibility
export const getUserByUsername = async (username) => {
  try {
    const result = await pool.query(
      `SELECT id, username, email, telegram_username as "telegramUsername", 
              password_hash as "passwordHash", is_admin as "isAdmin", 
              created_at as "createdAt", updated_at as "updatedAt"
       FROM users WHERE LOWER(username) = LOWER($1)`,
      [username]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      telegramUsername: row.telegramUsername,
      passwordHash: row.passwordHash,
      isAdmin: row.isAdmin,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
    };
  } catch (err) {
    console.error("Error getting user by username:", err);
    throw err;
  }
};

// Get user by ID
export const getUserById = async (id) => {
  try {
    const result = await pool.query(
      `SELECT id, username, email, telegram_username as "telegramUsername", 
              password_hash as "passwordHash", is_admin as "isAdmin", 
              created_at as "createdAt", updated_at as "updatedAt"
       FROM users WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      telegramUsername: row.telegramUsername,
      passwordHash: row.passwordHash,
      isAdmin: row.isAdmin,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
    };
  } catch (err) {
    console.error("Error getting user by ID:", err);
    throw err;
  }
};

// Create a new user
export const createUser = async (userData) => {
  try {
    const {
      id,
      username,
      email,
      telegramUsername,
      passwordHash,
      isAdmin = false,
    } = userData;

    // For hash-based auth, if no username provided, use hash as username
    const finalUsername = username || passwordHash.substring(0, 20) || "user";
    const trimmedHash = String(passwordHash).trim();
    
    console.log(`[createUser] Creating user with:`);
    let dbInfo;
    try {
      dbInfo = poolConfig.connectionString 
        ? `DATABASE_URL (${new URL(poolConfig.connectionString).pathname.replace('/', '')})`
        : `${poolConfig.database || 'unknown'}@${poolConfig.host || 'unknown'}:${poolConfig.port || 'unknown'}`;
    } catch (e) {
      dbInfo = "config.json";
    }
    console.log(`  - Database: ${dbInfo}`);
    console.log(`  - Username: ${finalUsername}`);
    console.log(`  - Hash: ${trimmedHash.substring(0, 20)}... (length: ${trimmedHash.length})`);
    console.log(`  - ID: ${id}`);

    const result = await pool.query(
      `INSERT INTO users (id, username, email, telegram_username, password_hash, is_admin)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, email, telegram_username as "telegramUsername", 
                 password_hash as "passwordHash", is_admin as "isAdmin", 
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [id, finalUsername, email || null, telegramUsername || null, trimmedHash, isAdmin]
    );
    
    console.log(`[createUser] Successfully created user: ${result.rows[0].username} (id: ${result.rows[0].id})`);

    const row = result.rows[0];
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      telegramUsername: row.telegramUsername,
      passwordHash: row.passwordHash,
      isAdmin: row.isAdmin,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
    };
  } catch (err) {
    console.error("Error creating user:", err);
    // Handle unique constraint violation
    if (err.code === "23505") {
      // PostgreSQL unique violation error code
      const constraint = err.constraint;
      if (constraint?.includes("username")) {
        throw new Error("Username already exists");
      }
      if (constraint?.includes("email")) {
        throw new Error("Email already exists");
      }
    }
    throw err;
  }
};

// Update user
export const updateUser = async (id, updates) => {
  try {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (updates.isAdmin !== undefined) {
      fields.push(`is_admin = $${paramCount++}`);
      values.push(updates.isAdmin);
    }
    if (updates.email !== undefined) {
      fields.push(`email = $${paramCount++}`);
      values.push(updates.email);
    }
    if (updates.telegramUsername !== undefined) {
      fields.push(`telegram_username = $${paramCount++}`);
      values.push(updates.telegramUsername);
    }

    if (fields.length === 0) {
      return await getUserById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await pool.query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = $${paramCount}
       RETURNING id, username, email, telegram_username as "telegramUsername", 
                 password_hash as "passwordHash", is_admin as "isAdmin", 
                 created_at as "createdAt", updated_at as "updatedAt"`,
      values
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      telegramUsername: row.telegramUsername,
      passwordHash: row.passwordHash,
      isAdmin: row.isAdmin,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
    };
  } catch (err) {
    console.error("Error updating user:", err);
    throw err;
  }
};

// Check if any user is an admin
export const hasAnyAdmin = async () => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM users WHERE is_admin = TRUE`
    );
    return parseInt(result.rows[0].count, 10) > 0;
  } catch (err) {
    console.error("Error checking for admin users:", err);
    throw err;
  }
};

// Close the pool (useful for graceful shutdown)
export const closePool = async () => {
  await pool.end();
};

// --- Bug Fix Blog ---
export const getAllBlogPosts = async () => {
  try {
    const result = await pool.query(
      `SELECT id, title, content, created_at as "createdAt", updated_at as "updatedAt"
       FROM bug_fix_blog ORDER BY updated_at DESC`
    );
    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      createdAt: row.createdAt?.toISOString?.(),
      updatedAt: row.updatedAt?.toISOString?.(),
    }));
  } catch (err) {
    console.error("Error getting blog posts:", err);
    throw err;
  }
};

export const getBlogPostById = async (id) => {
  try {
    const result = await pool.query(
      `SELECT id, title, content, created_at as "createdAt", updated_at as "updatedAt"
       FROM bug_fix_blog WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      createdAt: row.createdAt?.toISOString?.(),
      updatedAt: row.updatedAt?.toISOString?.(),
    };
  } catch (err) {
    console.error("Error getting blog post:", err);
    throw err;
  }
};

export const createBlogPost = async (data) => {
  try {
    const { id, title, content } = data;
    const result = await pool.query(
      `INSERT INTO bug_fix_blog (id, title, content)
       VALUES ($1, $2, $3)
       RETURNING id, title, content, created_at as "createdAt", updated_at as "updatedAt"`,
      [id, title, content]
    );
    const row = result.rows[0];
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      createdAt: row.createdAt?.toISOString?.(),
      updatedAt: row.updatedAt?.toISOString?.(),
    };
  } catch (err) {
    console.error("Error creating blog post:", err);
    throw err;
  }
};

export const updateBlogPost = async (id, updates) => {
  try {
    const { title, content } = updates;
    const result = await pool.query(
      `UPDATE bug_fix_blog SET title = $1, content = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, title, content, created_at as "createdAt", updated_at as "updatedAt"`,
      [title, content, id]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      createdAt: row.createdAt?.toISOString?.(),
      updatedAt: row.updatedAt?.toISOString?.(),
    };
  } catch (err) {
    console.error("Error updating blog post:", err);
    throw err;
  }
};

export const deleteBlogPost = async (id) => {
  try {
    const result = await pool.query(
      `DELETE FROM bug_fix_blog WHERE id = $1 RETURNING id`,
      [id]
    );
    return result.rows.length > 0;
  } catch (err) {
    console.error("Error deleting blog post:", err);
    throw err;
  }
};

// --- Labels ---
export const createLabel = async (data) => {
  try {
    const { id, userId, labelData } = data;
    const result = await pool.query(
      `INSERT INTO labels (id, user_id, status, label_data)
       VALUES ($1, $2, 'pending', $3::jsonb)
       RETURNING id, user_id, status, decline_reason, label_data, files, created_at, updated_at`,
      [id, userId, JSON.stringify(labelData || {})]
    );
    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      declineReason: row.decline_reason,
      labelData: row.label_data,
      files: row.files || [],
      createdAt: row.created_at?.toISOString?.(),
      updatedAt: row.updated_at?.toISOString?.(),
    };
  } catch (err) {
    console.error("Error creating label:", err);
    throw err;
  }
};

export const getLabelById = async (id) => {
  try {
    const result = await pool.query(
      `SELECT id, user_id as "userId", status, decline_reason as "declineReason",
              label_data as "labelData", files, created_at as "createdAt", updated_at as "updatedAt"
       FROM labels WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.userId,
      status: row.status,
      declineReason: row.declineReason,
      labelData: row.labelData || {},
      files: Array.isArray(row.files) ? row.files : [],
      createdAt: row.createdAt?.toISOString?.(),
      updatedAt: row.updatedAt?.toISOString?.(),
    };
  } catch (err) {
    console.error("Error getting label:", err);
    throw err;
  }
};

export const getLabelsByUserId = async (userId) => {
  try {
    const result = await pool.query(
      `SELECT id, user_id as "userId", status, decline_reason as "declineReason",
              label_data as "labelData", files, created_at as "createdAt", updated_at as "updatedAt"
       FROM labels WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      status: row.status,
      declineReason: row.declineReason,
      labelData: row.labelData || {},
      files: Array.isArray(row.files) ? row.files : [],
      createdAt: row.createdAt?.toISOString?.(),
      updatedAt: row.updatedAt?.toISOString?.(),
    }));
  } catch (err) {
    console.error("Error getting labels by user:", err);
    throw err;
  }
};

export const getAllLabels = async () => {
  try {
    const result = await pool.query(
      `SELECT l.id, l.user_id as "userId", l.status, l.decline_reason as "declineReason",
              l.label_data as "labelData", l.files, l.created_at as "createdAt", l.updated_at as "updatedAt",
              u.username
       FROM labels l
       LEFT JOIN users u ON u.id = l.user_id
       ORDER BY l.created_at DESC`
    );
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      username: row.username,
      status: row.status,
      declineReason: row.declineReason,
      labelData: row.labelData || {},
      files: Array.isArray(row.files) ? row.files : [],
      createdAt: row.createdAt?.toISOString?.(),
      updatedAt: row.updatedAt?.toISOString?.(),
    }));
  } catch (err) {
    console.error("Error getting all labels:", err);
    throw err;
  }
};

export const updateLabel = async (id, updates) => {
  try {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (updates.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(updates.status);
    }
    if (updates.declineReason !== undefined) {
      fields.push(`decline_reason = $${paramCount++}`);
      values.push(updates.declineReason);
    }
    if (updates.files !== undefined) {
      fields.push(`files = $${paramCount++}::jsonb`);
      values.push(JSON.stringify(Array.isArray(updates.files) ? updates.files : []));
    }

    if (fields.length === 0) return await getLabelById(id);

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await pool.query(
      `UPDATE labels SET ${fields.join(", ")} WHERE id = $${paramCount}
       RETURNING id, user_id as "userId", status, decline_reason as "declineReason",
                 label_data as "labelData", files, created_at as "createdAt", updated_at as "updatedAt"`,
      values
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.userId,
      status: row.status,
      declineReason: row.declineReason,
      labelData: row.labelData || {},
      files: Array.isArray(row.files) ? row.files : [],
      createdAt: row.createdAt?.toISOString?.(),
      updatedAt: row.updatedAt?.toISOString?.(),
    };
  } catch (err) {
    console.error("Error updating label:", err);
    throw err;
  }
};

// Account Products functions
export const getAllAccountProducts = async () => {
  try {
    const result = await pool.query(
      `SELECT id, service, informations, country, price_usd as "priceUsd",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM account_products ORDER BY created_at DESC`
    );
    return result.rows.map((row) => ({
      id: row.id,
      service: row.service,
      informations: row.informations || "",
      country: row.country,
      priceUsd: Number(row.priceUsd || 0),
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
    }));
  } catch (err) {
    console.error("Error getting all account products:", err);
    throw err;
  }
};

export const createAccountProduct = async (data) => {
  try {
    const result = await pool.query(
      `INSERT INTO account_products (service, informations, country, price_usd)
       VALUES ($1, $2, $3, $4)
       RETURNING id, service, informations, country, price_usd as "priceUsd",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [
        String(data.service || ""),
        String(data.informations || ""),
        String(data.country || ""),
        Number(data.priceUsd || 0),
      ]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      service: row.service,
      informations: row.informations || "",
      country: row.country,
      priceUsd: Number(row.priceUsd || 0),
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
    };
  } catch (err) {
    console.error("Error creating account product:", err);
    throw err;
  }
};

export const deleteAccountProduct = async (id) => {
  try {
    const result = await pool.query(
      `DELETE FROM account_products WHERE id = $1 RETURNING id`,
      [id]
    );
    return result.rows.length > 0;
  } catch (err) {
    console.error("Error deleting account product:", err);
    throw err;
  }
};

export default pool;
