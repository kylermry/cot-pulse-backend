/**
 * SQLite Database Setup Script (sql.js)
 * COT Pulse Backend
 *
 * Run with: npm run setup-db
 */

const { initDatabase, exec, all, dbPath, saveDatabase } = require('./db');

async function setupDatabase() {
    console.log('\n============================================');
    console.log('  COT PULSE DATABASE SETUP');
    console.log('============================================\n');

    // Initialize database
    await initDatabase();
    console.log('[+] Database initialized');

    // Create tables
    console.log('\n[*] Creating tables...\n');

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
    console.log('    [+] users');

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
    console.log('    [+] phone_verification_attempts');

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
    console.log('    [+] user_watchlist');

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
    console.log('    [+] user_alerts');

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
    console.log('    [+] sessions');

    // Create indexes
    console.log('\n[*] Creating indexes...\n');

    const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
        'CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)',
        'CREATE INDEX IF NOT EXISTS idx_users_subscription ON users(subscription_tier, subscription_status)',
        'CREATE INDEX IF NOT EXISTS idx_phone_attempts_user ON phone_verification_attempts(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_phone_attempts_phone ON phone_verification_attempts(phone)',
        'CREATE INDEX IF NOT EXISTS idx_watchlist_user ON user_watchlist(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_alerts_user ON user_alerts(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(refresh_token)'
    ];

    indexes.forEach(sql => {
        exec(sql);
        const indexName = sql.match(/idx_\w+/)[0];
        console.log(`    [+] ${indexName}`);
    });

    // Save database to file
    saveDatabase();

    // Verify setup
    console.log('\n============================================');
    console.log('  DATABASE SETUP COMPLETE');
    console.log('============================================\n');

    const tables = all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    console.log('Tables created:');
    tables.forEach(t => console.log(`  - ${t.name}`));

    console.log('\nDatabase location:', dbPath);
    console.log('\nNext steps:');
    console.log('  1. Create Twilio Verify Service (if not done)');
    console.log('  2. Update .env with TWILIO_VERIFY_SERVICE_SID');
    console.log('  3. Run: npm run test-twilio');
    console.log('  4. Run: npm start\n');
}

setupDatabase().catch(err => {
    console.error('Setup failed:', err);
    process.exit(1);
});
