/**
 * Password Reset Routes
 * COT Pulse Backend
 */

const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const { sendPasswordResetEmail } = require('../utils/email');
const db = require('../db');

const router = express.Router();

// Token expiration time (1 hour)
const TOKEN_EXPIRATION_MS = 60 * 60 * 1000;

/**
 * POST /api/auth/forgot-password
 * Request a password reset email
 */
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email is required'
            });
        }

        console.log('[Password Reset] Request for:', email);

        // Find user by email
        const user = await User.findByEmail(email);

        // Always return success to prevent email enumeration
        if (!user) {
            console.log('[Password Reset] User not found:', email);
            return res.json({
                success: true,
                message: 'If an account exists with this email, you will receive a password reset link.'
            });
        }

        // Generate secure reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
        const expiresAt = new Date(Date.now() + TOKEN_EXPIRATION_MS).toISOString();

        // Store reset token in database
        await db.query(
            `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
             VALUES (?, ?, ?)
             ON CONFLICT (user_id) DO UPDATE SET token_hash = ?, expires_at = ?`,
            [user.id, tokenHash, expiresAt, tokenHash, expiresAt]
        );

        // Send password reset email
        const emailResult = await sendPasswordResetEmail(email, resetToken, user.name);

        if (!emailResult.success) {
            console.error('[Password Reset] Failed to send email:', emailResult.error);
        }

        res.json({
            success: true,
            message: 'If an account exists with this email, you will receive a password reset link.'
        });

    } catch (error) {
        console.error('[Password Reset] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process password reset request'
        });
    }
});

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({
                success: false,
                error: 'Token and new password are required'
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 8 characters'
            });
        }

        // Hash the provided token to compare with stored hash
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        // Find valid reset token
        const resetRecord = await db.getOne(
            `SELECT user_id, expires_at FROM password_reset_tokens
             WHERE token_hash = ?`,
            [tokenHash]
        );

        if (!resetRecord) {
            console.log('[Password Reset] Invalid token');
            return res.status(400).json({
                success: false,
                error: 'Invalid or expired reset token'
            });
        }

        // Check if token is expired
        if (new Date(resetRecord.expires_at) < new Date()) {
            console.log('[Password Reset] Expired token');
            // Delete expired token
            await db.query(
                'DELETE FROM password_reset_tokens WHERE token_hash = ?',
                [tokenHash]
            );
            return res.status(400).json({
                success: false,
                error: 'Reset token has expired. Please request a new one.'
            });
        }

        // Update user password
        await User.updatePassword(resetRecord.user_id, password);
        console.log('[Password Reset] Password updated for user:', resetRecord.user_id);

        // Delete used token
        await db.query(
            'DELETE FROM password_reset_tokens WHERE user_id = ?',
            [resetRecord.user_id]
        );

        res.json({
            success: true,
            message: 'Password has been reset successfully. You can now log in with your new password.'
        });

    } catch (error) {
        console.error('[Password Reset] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset password'
        });
    }
});

/**
 * GET /api/auth/verify-reset-token
 * Verify if a reset token is valid (for frontend validation)
 */
router.get('/verify-reset-token', async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({
                success: false,
                valid: false,
                error: 'Token is required'
            });
        }

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        const resetRecord = await db.getOne(
            `SELECT expires_at FROM password_reset_tokens WHERE token_hash = ?`,
            [tokenHash]
        );

        if (!resetRecord || new Date(resetRecord.expires_at) < new Date()) {
            return res.json({
                success: true,
                valid: false
            });
        }

        res.json({
            success: true,
            valid: true
        });

    } catch (error) {
        console.error('[Password Reset] Verify token error:', error);
        res.status(500).json({
            success: false,
            valid: false,
            error: 'Failed to verify token'
        });
    }
});

module.exports = router;
