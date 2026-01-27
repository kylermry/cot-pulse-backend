/**
 * COT Pulse API Server
 * Main Express Application
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const { initDatabase, testConnection, isInitialized, setupTables } = require('./db');

const app = express();

// ============================================
// MIDDLEWARE
// ============================================

// CORS configuration - allow specific origins
const allowedOrigins = [
    'https://cotpulse.com',
    'https://www.cotpulse.com',
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.log(`CORS blocked origin: ${origin}`);
            callback(null, false);
        }
    },
    credentials: true
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// ============================================
// ROUTES
// ============================================

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'COT Pulse API',
        version: '1.0.0'
    });
});

// API info endpoint
app.get('/api', (req, res) => {
    res.json({
        name: 'COT Pulse API',
        version: '1.0.0',
        endpoints: {
            auth: {
                signup: 'POST /api/auth/signup',
                login: 'POST /api/auth/login',
                verifyPhone: 'POST /api/auth/verify-phone',
                resendCode: 'POST /api/auth/resend-code',
                updatePhone: 'POST /api/auth/update-phone',
                me: 'GET /api/auth/me',
                logout: 'POST /api/auth/logout'
            }
        }
    });
});

// Authentication routes
app.use('/api/auth', authRoutes);

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);

    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'development'
            ? err.message
            : 'Internal server error'
    });
});

// ============================================
// SERVER STARTUP
// ============================================

const PORT = process.env.PORT || 5000;

async function startServer() {
    // Initialize and test database connection
    await initDatabase();
    const dbConnected = await testConnection();

    if (!dbConnected) {
        console.error('\n[ERROR] Could not connect to database.');
        process.exit(1);
    }

    // Auto-setup database tables if they don't exist
    if (!isInitialized()) {
        console.log('[Server] Database tables not found, initializing...');
        setupTables();
    }

    app.listen(PORT, () => {
        console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🚀  COT PULSE API SERVER                           ║
║                                                       ║
║   📊  Port: ${PORT}                                     ║
║   🌍  Environment: ${(process.env.NODE_ENV || 'development').padEnd(27)}║
║   🔗  Frontend URL: ${(process.env.FRONTEND_URL || 'http://localhost:3000').substring(0, 24).padEnd(24)}║
║   💾  Database: ${dbConnected ? 'Connected ✓' : 'Not Connected ✗'}                    ║
║                                                       ║
║   ⏰  Started: ${new Date().toLocaleString().padEnd(31)}║
║                                                       ║
╚═══════════════════════════════════════════════════════╝

📋 Available Endpoints:
   GET  /health              - Health check
   GET  /api                 - API info
   POST /api/auth/signup     - Create account
   POST /api/auth/login      - Login
   POST /api/auth/verify-phone - Verify phone
   POST /api/auth/resend-code  - Resend code
   GET  /api/auth/me         - Get profile
        `);
    });
}

startServer();
