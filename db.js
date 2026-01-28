/**
 * Database Connection (PostgreSQL + SQLite fallback)
 * COT Pulse Backend
 *
 * Uses PostgreSQL when DATABASE_URL is available (Railway)
 * Falls back to SQLite for local development
 */

const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Determine which database to use
const USE_POSTGRES = !!process.env.DATABASE_URL;

// PostgreSQL connection pool
let pgPool = null;

// SQLite database (for local dev)
let sqliteDb = null;
let SQL = null;

// Database file path for SQLite
const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'cotpulse.db');

/**
 * Initialize the database connection
 */
async function initDatabase() {
    if (USE_POSTGRES) {
        return initPostgres();
    } else {
        return initSqlite();
    }
}

/**
 * Initialize PostgreSQL connection
 */
async function initPostgres() {
    if (pgPool) return pgPool;

    pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    // Test connection
    try {
        const client = await pgPool.connect();
        console.log('[Database] Connected to PostgreSQL');
        client.release();
    } catch (error) {
        console.error('[Database] PostgreSQL connection failed:', error.message);
        throw error;
    }

    return pgPool;
}

/**
 * Initialize SQLite connection (local development)
 */
async function initSqlite() {
    if (sqliteDb) return sqliteDb;

    const initSqlJs = require('sql.js');

    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    // Initialize SQL.js
    SQL = await initSqlJs();

    // Load existing database or create new one
    if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        sqliteDb = new SQL.Database(fileBuffer);
        console.log(`[Database] Loaded SQLite database: ${dbPath}`);
    } else {
        sqliteDb = new SQL.Database();
        console.log(`[Database] Created new SQLite database: ${dbPath}`);
    }

    return sqliteDb;
}

/**
 * Save SQLite database to file
 */
function saveSqlite() {
    if (!sqliteDb || USE_POSTGRES) return;
    const data = sqliteDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
}

/**
 * Run a query that modifies data (INSERT, UPDATE, DELETE)
 * Returns the result for PostgreSQL or undefined for SQLite
 */
async function run(sql, params = []) {
    if (USE_POSTGRES) {
        const result = await pgPool.query(sql, params);
        return result;
    } else {
        sqliteDb.run(sql, params);
        saveSqlite();
        return undefined;
    }
}

/**
 * Get a single row
 */
async function get(sql, params = []) {
    if (USE_POSTGRES) {
        const result = await pgPool.query(sql, params);
        return result.rows[0];
    } else {
        const stmt = sqliteDb.prepare(sql);
        stmt.bind(params);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
        }
        stmt.free();
        return undefined;
    }
}

/**
 * Get all rows
 */
async function all(sql, params = []) {
    if (USE_POSTGRES) {
        const result = await pgPool.query(sql, params);
        return result.rows;
    } else {
        const stmt = sqliteDb.prepare(sql);
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) {
            rows.push(stmt.getAsObject());
        }
        stmt.free();
        return rows;
    }
}

/**
 * Execute raw SQL (for schema changes)
 */
async function exec(sql) {
    if (USE_POSTGRES) {
        await pgPool.query(sql);
    } else {
        sqliteDb.exec(sql);
        saveSqlite();
    }
}

/**
 * Test database connection
 */
async function testConnection() {
    try {
        await initDatabase();
        if (USE_POSTGRES) {
            const result = await pgPool.query('SELECT 1 as test');
            console.log('[Database] PostgreSQL connection test successful');
        } else {
            const result = get('SELECT 1 as test');
            console.log('[Database] SQLite connection test successful');
        }
        return true;
    } catch (error) {
        console.error('[Database] Connection test failed:', error.message);
        return false;
    }
}

/**
 * Check if database has been initialized with tables
 */
async function isInitialized() {
    try {
        if (USE_POSTGRES) {
            const result = await pgPool.query(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')"
            );
            return result.rows[0].exists;
        } else {
            const result = get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
            return !!result;
        }
    } catch (error) {
        return false;
    }
}

/**
 * Setup database tables
 */
async function setupTables() {
    console.log(`[Database] Setting up tables for ${getDatabaseType()}...`);

    try {
        if (USE_POSTGRES) {
            await setupPostgresTables();
        } else {
            await setupSqliteTables();
        }
        console.log('[Database] All tables created successfully');
    } catch (error) {
        console.error('[Database] Failed to create tables:', error);
        throw error;
    }
}

/**
 * PostgreSQL table setup
 */
async function setupPostgresTables() {
    try {
        // Users table
        console.log('[Database] Creating users table...');
        await exec(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT,
                phone TEXT,
                phone_verified INTEGER DEFAULT 0,
                email_verified INTEGER DEFAULT 0,
                subscription_tier TEXT DEFAULT 'free',
                subscription_status TEXT DEFAULT 'active',
                stripe_customer_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            )
        `);
        console.log('[Database] Users table created');

        // Phone verification attempts table
        console.log('[Database] Creating phone_verification_attempts table...');
        await exec(`
            CREATE TABLE IF NOT EXISTS phone_verification_attempts (
                id TEXT PRIMARY KEY,
                user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
                phone TEXT NOT NULL,
                code TEXT,
                verified INTEGER DEFAULT 0,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('[Database] Phone verification table created');

        // User watchlist table
        console.log('[Database] Creating user_watchlist table...');
        await exec(`
            CREATE TABLE IF NOT EXISTS user_watchlist (
                id TEXT PRIMARY KEY,
                user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
                symbol TEXT NOT NULL,
                name TEXT,
                category TEXT,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, symbol)
            )
        `);
        console.log('[Database] Watchlist table created');

        // User alerts table
        console.log('[Database] Creating user_alerts table...');
        await exec(`
            CREATE TABLE IF NOT EXISTS user_alerts (
                id TEXT PRIMARY KEY,
                user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
                symbol TEXT NOT NULL,
                alert_type TEXT NOT NULL,
                threshold_value REAL,
                threshold_direction TEXT,
                is_active INTEGER DEFAULT 1,
                last_triggered TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('[Database] Alerts table created');

        // Sessions table
        console.log('[Database] Creating sessions table...');
        await exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
                refresh_token TEXT,
                device_info TEXT,
                ip_address TEXT,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('[Database] Sessions table created');

        // Password reset tokens table
        console.log('[Database] Creating password_reset_tokens table...');
        await exec(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('[Database] Password reset tokens table created');

        // Create indexes
        console.log('[Database] Creating indexes...');
        await exec('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
        await exec('CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)');
        await exec('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)');
        console.log('[Database] Indexes created');

    } catch (error) {
        console.error('[Database] Error creating PostgreSQL tables:', error);
        throw error;
    }
}

/**
 * SQLite table setup (for local development)
 */
async function setupSqliteTables() {
    try {
        console.log('[Database] Creating users table...');
        await exec(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT,
                phone TEXT,
                phone_verified INTEGER DEFAULT 0,
                email_verified INTEGER DEFAULT 0,
                subscription_tier TEXT DEFAULT 'free',
                subscription_status TEXT DEFAULT 'active',
                stripe_customer_id TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                last_login TEXT
            )
        `);
        console.log('[Database] Users table created');

        console.log('[Database] Creating phone_verification_attempts table...');
        await exec(`
            CREATE TABLE IF NOT EXISTS phone_verification_attempts (
                id TEXT PRIMARY KEY,
                user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
                phone TEXT NOT NULL,
                code TEXT,
                verified INTEGER DEFAULT 0,
                expires_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('[Database] Phone verification table created');

        console.log('[Database] Creating user_watchlist table...');
        await exec(`
            CREATE TABLE IF NOT EXISTS user_watchlist (
                id TEXT PRIMARY KEY,
                user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
                symbol TEXT NOT NULL,
                name TEXT,
                category TEXT,
                added_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, symbol)
            )
        `);
        console.log('[Database] Watchlist table created');

        console.log('[Database] Creating user_alerts table...');
        await exec(`
            CREATE TABLE IF NOT EXISTS user_alerts (
                id TEXT PRIMARY KEY,
                user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
                symbol TEXT NOT NULL,
                alert_type TEXT NOT NULL,
                threshold_value REAL,
                threshold_direction TEXT,
                is_active INTEGER DEFAULT 1,
                last_triggered TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('[Database] Alerts table created');

        console.log('[Database] Creating sessions table...');
        await exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
                refresh_token TEXT,
                device_info TEXT,
                ip_address TEXT,
                expires_at TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('[Database] Sessions table created');

        console.log('[Database] Creating password_reset_tokens table...');
        await exec(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('[Database] Password reset tokens table created');

        console.log('[Database] Creating indexes...');
        await exec('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
        await exec('CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)');
        await exec('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)');
        console.log('[Database] Indexes created');

    } catch (error) {
        console.error('[Database] Error creating SQLite tables:', error);
        throw error;
    }
}

/**
 * Get database type being used
 */
function getDatabaseType() {
    return USE_POSTGRES ? 'PostgreSQL' : 'SQLite';
}

/**
 * Convert SQL with ? placeholders to $1, $2, etc. for PostgreSQL
 */
function convertPlaceholders(sql) {
    if (!USE_POSTGRES) return sql;

    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
}

/**
 * Run query with automatic placeholder conversion
 */
async function query(sql, params = []) {
    const convertedSql = convertPlaceholders(sql);
    return run(convertedSql, params);
}

/**
 * Get single row with automatic placeholder conversion
 */
async function getOne(sql, params = []) {
    const convertedSql = convertPlaceholders(sql);
    return get(convertedSql, params);
}

/**
 * Get all rows with automatic placeholder conversion
 */
async function getAll(sql, params = []) {
    const convertedSql = convertPlaceholders(sql);
    return all(convertedSql, params);
}

module.exports = {
    initDatabase,
    run,
    get,
    all,
    exec,
    query,
    getOne,
    getAll,
    testConnection,
    isInitialized,
    setupTables,
    getDatabaseType,
    convertPlaceholders,
    USE_POSTGRES,
    dbPath
};
