/**
 * Authentication Routes
 * COT Pulse Backend
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const TwilioService = require('../utils/twilio');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRATION = '7d';

// ============================================
// MIDDLEWARE
// ============================================

/**
 * JWT Authentication Middleware
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Access token required'
        });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({
                success: false,
                error: 'Invalid or expired token'
            });
        }

        req.userId = decoded.userId;
        req.userEmail = decoded.email;
        req.phoneVerified = decoded.phoneVerified;
        next();
    });
}

/**
 * Require phone verification middleware
 */
function requirePhoneVerification(req, res, next) {
    if (!req.phoneVerified) {
        return res.status(403).json({
            success: false,
            error: 'Phone verification required',
            code: 'PHONE_NOT_VERIFIED'
        });
    }
    next();
}

// ============================================
// ROUTES
// ============================================

/**
 * POST /api/auth/signup
 * Create new user account and send verification code
 */
router.post('/signup', async (req, res) => {
    try {
        const { email, password, name, phone } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                error: 'Please enter a valid email address'
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 8 characters'
            });
        }

        // Create user
        const user = await User.create({ email, password, name });
        console.log(`[Auth] User created: ${user.email}`);

        // Phone verification is optional - try if phone provided and Twilio configured
        let userPhone = null;
        if (phone && process.env.TWILIO_VERIFY_SERVICE_SID && !process.env.TWILIO_VERIFY_SERVICE_SID.includes('REPLACE')) {
            try {
                const verificationResult = await TwilioService.sendVerificationCode(user.id, phone);
                userPhone = verificationResult.phone;
            } catch (twilioError) {
                console.log('[Auth] Twilio not configured, skipping phone verification');
            }
        }

        // Generate JWT
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                phoneVerified: false
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRATION }
        );

        res.status(201).json({
            success: true,
            message: 'Account created successfully!',
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                phone: userPhone,
                phoneVerified: false
            },
            needsPhoneVerification: !!phone
        });

    } catch (error) {
        console.error('[Auth] Signup error:', error);

        if (error.message === 'Email already exists') {
            return res.status(409).json({
                success: false,
                error: 'An account with this email already exists'
            });
        }

        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create account'
        });
    }
});

/**
 * POST /api/auth/login
 * Authenticate user and return JWT
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        const user = await User.findByEmail(email);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        const isValid = await User.verifyPassword(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        await User.updateLastLogin(user.id);

        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                phoneVerified: user.phone_verified
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRATION }
        );

        console.log(`[Auth] User logged in: ${user.email}`);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                phone: user.phone,
                phoneVerified: user.phone_verified,
                subscriptionTier: user.subscription_tier
            },
            needsPhoneVerification: !user.phone_verified
        });

    } catch (error) {
        console.error('[Auth] Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed. Please try again.'
        });
    }
});

/**
 * POST /api/auth/verify-phone
 * Verify phone number with code from SMS
 */
router.post('/verify-phone', authenticateToken, async (req, res) => {
    try {
        const { code } = req.body;

        if (!code || code.length !== 6) {
            return res.status(400).json({
                success: false,
                error: 'Please enter a valid 6-digit code'
            });
        }

        const user = await User.findById(req.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        if (!user.phone) {
            return res.status(400).json({
                success: false,
                error: 'No phone number found. Please add a phone number first.'
            });
        }

        if (user.phone_verified) {
            return res.status(400).json({
                success: false,
                error: 'Phone number is already verified'
            });
        }

        const verificationResult = await TwilioService.verifyCode(
            req.userId,
            user.phone,
            code
        );

        if (verificationResult.verified) {
            // Generate new token with phoneVerified = true
            const newToken = jwt.sign(
                {
                    userId: user.id,
                    email: user.email,
                    phoneVerified: true
                },
                JWT_SECRET,
                { expiresIn: JWT_EXPIRATION }
            );

            console.log(`[Auth] Phone verified for: ${user.email}`);

            res.json({
                success: true,
                message: 'Phone verified successfully!',
                token: newToken,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    phone: user.phone,
                    phoneVerified: true,
                    subscriptionTier: user.subscription_tier
                }
            });
        } else {
            res.status(400).json({
                success: false,
                error: verificationResult.message || 'Invalid verification code'
            });
        }

    } catch (error) {
        console.error('[Auth] Phone verification error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Verification failed'
        });
    }
});

/**
 * POST /api/auth/resend-code
 * Resend verification code to phone
 */
router.post('/resend-code', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        if (!user.phone) {
            return res.status(400).json({
                success: false,
                error: 'No phone number found'
            });
        }

        if (user.phone_verified) {
            return res.status(400).json({
                success: false,
                error: 'Phone is already verified'
            });
        }

        await TwilioService.sendVerificationCode(user.id, user.phone);

        console.log(`[Auth] Verification code resent to: ${user.phone}`);

        res.json({
            success: true,
            message: 'Verification code sent!'
        });

    } catch (error) {
        console.error('[Auth] Resend code error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to resend code'
        });
    }
});

/**
 * POST /api/auth/update-phone
 * Update phone number and send new verification code
 */
router.post('/update-phone', authenticateToken, async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                error: 'Phone number is required'
            });
        }

        const verificationResult = await TwilioService.sendVerificationCode(req.userId, phone);

        res.json({
            success: true,
            message: 'Verification code sent to new number!',
            phone: verificationResult.phone
        });

    } catch (error) {
        console.error('[Auth] Update phone error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to update phone number'
        });
    }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                phone: user.phone,
                phoneVerified: user.phone_verified,
                subscriptionTier: user.subscription_tier,
                subscriptionStatus: user.subscription_status,
                createdAt: user.created_at,
                lastLogin: user.last_login
            }
        });

    } catch (error) {
        console.error('[Auth] Get profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user profile'
        });
    }
});

/**
 * POST /api/auth/logout
 * Logout user (client-side token removal, server just confirms)
 */
router.post('/logout', authenticateToken, (req, res) => {
    // In a stateless JWT setup, logout is handled client-side
    // This endpoint just confirms the logout action
    console.log(`[Auth] User logged out: ${req.userEmail}`);

    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

// Export router and middleware
module.exports = router;
module.exports.authenticateToken = authenticateToken;
module.exports.requirePhoneVerification = requirePhoneVerification;
