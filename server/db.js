import pg from "pg";
const { Pool } = pg;

// PostgreSQL connection configuration
// Supports both DATABASE_URL (Railway format) and individual environment variables
let poolConfig;

if (process.env.DATABASE_URL) {
  // Use DATABASE_URL if provided (Railway, Heroku, etc.)
  console.log("Using DATABASE_URL for PostgreSQL connection");
  // Log connection info (without password)
  const url = new URL(process.env.DATABASE_URL);
  console.log(`Connecting to: ${url.protocol}//${url.username}@${url.hostname}:${url.port}${url.pathname}`);
  
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    // Connection pool settings
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 20000, // Increased timeout for Railway (20 seconds)
    // SSL is required for Railway's PostgreSQL (always enable for Railway)
    ssl: {
      rejectUnauthorized: false, // Railway uses self-signed certificates
    },
  };
} else {
  // Fallback to individual environment variables
  console.log("Using individual DB_* environment variables for PostgreSQL connection");
  console.log(`Host: ${process.env.DB_HOST || "trolley.proxy.rlwy.net"}, Port: ${process.env.DB_PORT || 48091}, Database: ${process.env.DB_NAME || "railway"}`);
  
  poolConfig = {
    host: process.env.DB_HOST || "trolley.proxy.rlwy.net",
    port: Number(process.env.DB_PORT || 48091),
    database: process.env.DB_NAME || "railway",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "NKPsCIejqGBleidDsqZHenKVNSAPEjnH",
    // Connection pool settings
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 20000, // Increased timeout
  };
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
            `1. DATABASE_URL is set correctly in Railway\n` +
            `2. PostgreSQL service is running\n` +
            `3. Service name matches in variable reference (e.g., trolley.proxy.rlwy.net)\n` +
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

// Get user by username (case-insensitive)
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

    const result = await pool.query(
      `INSERT INTO users (id, username, email, telegram_username, password_hash, is_admin)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, email, telegram_username as "telegramUsername", 
                 password_hash as "passwordHash", is_admin as "isAdmin", 
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [id, username, email || null, telegramUsername || null, passwordHash, isAdmin]
    );

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

export default pool;

