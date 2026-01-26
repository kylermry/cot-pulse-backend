/**
 * SQLite Database Connection (sql.js)
 * COT Pulse Backend
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Database file path
const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'cotpulse.db');

let db = null;
let SQL = null;

/**
 * Initialize the database
 */
async function initDatabase() {
    if (db) return db;

    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    // Initialize SQL.js
    SQL = await initSqlJs();

    // Load existing database or create new one
    if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(fileBuffer);
        console.log(`[Database] Loaded existing database: ${dbPath}`);
    } else {
        db = new SQL.Database();
        console.log(`[Database] Created new database: ${dbPath}`);
    }

    return db;
}

/**
 * Save database to file
 */
function saveDatabase() {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
}

/**
 * Get the database instance
 */
function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}

/**
 * Run a query that modifies data (INSERT, UPDATE, DELETE)
 */
function run(sql, params = []) {
    const database = getDb();
    database.run(sql, params);
    saveDatabase();
}

/**
 * Get a single row
 */
function get(sql, params = []) {
    const database = getDb();
    const stmt = database.prepare(sql);
    stmt.bind(params);

    if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
    }
    stmt.free();
    return undefined;
}

/**
 * Get all rows
 */
function all(sql, params = []) {
    const database = getDb();
    const stmt = database.prepare(sql);
    stmt.bind(params);

    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

/**
 * Execute raw SQL (for schema changes)
 */
function exec(sql) {
    const database = getDb();
    database.exec(sql);
    saveDatabase();
}

/**
 * Test database connection
 */
async function testConnection() {
    try {
        await initDatabase();
        const result = get('SELECT 1 as test');
        console.log(`[Database] Connection test successful`);
        return true;
    } catch (error) {
        console.error('[Database] Connection test failed:', error.message);
        return false;
    }
}

/**
 * Check if database has been initialized with tables
 */
function isInitialized() {
    try {
        const result = get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
        return !!result;
    } catch (error) {
        return false;
    }
}

/**
 * Auto-setup database tables (for Railway deployment)
 */
function setupTables() {
    console.log('[Database] Setting up tables...');

    // Users table
    exec(`
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

    // Phone verification attempts table
    exec(`
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

    // User watchlist table
    exec(`
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

    // User alerts table
    exec(`
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

    // Sessions table
    exec(`
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

    // Create indexes
    exec('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    exec('CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)');
    exec('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)');

    console.log('[Database] Tables created successfully');
}

module.exports = {
    initDatabase,
    getDb,
    run,
    get,
    all,
    exec,
    saveDatabase,
    testConnection,
    isInitialized,
    setupTables,
    dbPath
};
