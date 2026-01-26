/**
 * Twilio Verification Service
 * COT Pulse Backend - sql.js Version
 */

const twilio = require('twilio');
const db = require('../db');
const crypto = require('crypto');
require('dotenv').config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

// Validate Twilio credentials on load
if (!accountSid || !authToken || !verifyServiceSid) {
    console.warn('WARNING: Missing Twilio credentials in environment variables');
}

const client = twilio(accountSid, authToken);

class TwilioService {
    /**
     * Clean and format phone number to E.164 format
     * @param {string} phone - Raw phone number input
     * @returns {string} Formatted phone number
     */
    static cleanPhoneNumber(phone) {
        // Remove all non-digit characters
        const cleaned = phone.replace(/\D/g, '');

        // Handle different formats
        if (cleaned.length === 10) {
            // US number without country code
            return `+1${cleaned}`;
        } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
            // US number with country code
            return `+${cleaned}`;
        } else if (cleaned.startsWith('1') && cleaned.length > 10) {
            // Already has country code
            return `+${cleaned}`;
        }

        // For other formats, assume it needs +
        return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
    }

    /**
     * Send verification code via SMS
     * @param {string} userId - User's database ID
     * @param {string} phone - Phone number to verify
     * @returns {Promise<object>} Result object
     */
    static async sendVerificationCode(userId, phone) {
        try {
            const formattedPhone = this.cleanPhoneNumber(phone);

            console.log(`[Twilio] Sending verification code to ${formattedPhone}...`);

            const verification = await client.verify.v2
                .services(verifyServiceSid)
                .verifications
                .create({
                    to: formattedPhone,
                    channel: 'sms'
                });

            console.log(`[Twilio] Verification sent - Status: ${verification.status}`);

            const now = new Date().toISOString();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

            // Update user's phone in database
            db.run('UPDATE users SET phone = ? WHERE id = ?', [formattedPhone, userId]);

            // Log verification attempt
            const id = crypto.randomUUID();
            db.run(`
                INSERT INTO phone_verification_attempts (id, user_id, phone, expires_at, created_at)
                VALUES (?, ?, ?, ?, ?)
            `, [id, userId, formattedPhone, expiresAt, now]);

            return {
                success: true,
                status: verification.status,
                phone: formattedPhone
            };

        } catch (error) {
            console.error('[Twilio] Send verification error:', error);

            // Handle specific Twilio errors
            if (error.code === 60200) {
                throw new Error('Invalid phone number format. Please use a valid US phone number.');
            }
            if (error.code === 60202) {
                throw new Error('Too many verification attempts. Please wait before trying again.');
            }
            if (error.code === 60203) {
                throw new Error('Maximum send attempts reached for this number.');
            }
            if (error.code === 20003) {
                throw new Error('Authentication failed. Check Twilio credentials.');
            }
            if (error.code === 20404) {
                throw new Error('Verify Service not found. Check TWILIO_VERIFY_SERVICE_SID.');
            }

            throw new Error('Failed to send verification code. Please try again.');
        }
    }

    /**
     * Verify the code entered by user
     * @param {string} userId - User's database ID
     * @param {string} phone - Phone number being verified
     * @param {string} code - 6-digit verification code
     * @returns {Promise<object>} Result object
     */
    static async verifyCode(userId, phone, code) {
        try {
            const formattedPhone = this.cleanPhoneNumber(phone);

            console.log(`[Twilio] Verifying code for ${formattedPhone}...`);

            const verificationCheck = await client.verify.v2
                .services(verifyServiceSid)
                .verificationChecks
                .create({
                    to: formattedPhone,
                    code: code.trim()
                });

            if (verificationCheck.status === 'approved') {
                const now = new Date().toISOString();

                // Mark phone as verified in database
                db.run(`
                    UPDATE users
                    SET phone_verified = 1, phone = ?, updated_at = ?
                    WHERE id = ?
                `, [formattedPhone, now, userId]);

                // Log successful verification
                db.run(`
                    UPDATE phone_verification_attempts
                    SET verified = 1
                    WHERE user_id = ? AND phone = ? AND verified = 0
                `, [userId, formattedPhone]);

                console.log('[Twilio] Phone verified successfully');
                return {
                    success: true,
                    verified: true,
                    phone: formattedPhone
                };
            } else {
                console.log(`[Twilio] Verification failed - Status: ${verificationCheck.status}`);
                return {
                    success: false,
                    verified: false,
                    message: 'Invalid verification code'
                };
            }

        } catch (error) {
            console.error('[Twilio] Verify code error:', error);

            if (error.code === 20404) {
                return {
                    success: false,
                    verified: false,
                    message: 'Verification code expired. Please request a new code.'
                };
            }
            if (error.code === 60202) {
                return {
                    success: false,
                    verified: false,
                    message: 'Too many attempts. Please request a new code.'
                };
            }

            throw new Error('Failed to verify code. Please try again.');
        }
    }

    /**
     * Check if Twilio service is properly configured
     * @returns {Promise<boolean>}
     */
    static async testConnection() {
        try {
            const service = await client.verify.v2.services(verifyServiceSid).fetch();
            console.log(`[Twilio] Connected to Verify Service: ${service.friendlyName}`);
            return true;
        } catch (error) {
            console.error('[Twilio] Connection test failed:', error.message);
            return false;
        }
    }
}

module.exports = TwilioService;
