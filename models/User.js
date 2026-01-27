/**
 * User Model
 * COT Pulse Backend - sql.js Version
 */

const db = require('../db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SALT_ROUNDS = 12;

class User {
    /**
     * Create a new user
     */
    static async create({ email, password, name }) {
        try {
            const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
            const id = crypto.randomUUID();
            const now = new Date().toISOString();

            db.run(`
                INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [id, email.toLowerCase().trim(), passwordHash, name, now, now]);

            return {
                id,
                email: email.toLowerCase().trim(),
                name,
                phone_verified: 0,
                created_at: now
            };
        } catch (error) {
            if (error.message && error.message.includes('UNIQUE constraint failed')) {
                throw new Error('Email already exists');
            }
            throw error;
        }
    }

    /**
     * Find user by email
     */
    static async findByEmail(email) {
        return db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    }

    /**
     * Find user by ID
     */
    static async findById(userId) {
        return db.get(`
            SELECT id, email, name, phone, phone_verified, email_verified,
                   subscription_tier, subscription_status, stripe_customer_id,
                   created_at, last_login
            FROM users WHERE id = ?
        `, [userId]);
    }

    /**
     * Verify password against hash
     */
    static async verifyPassword(plainPassword, passwordHash) {
        return await bcrypt.compare(plainPassword, passwordHash);
    }

    /**
     * Update user's phone number
     */
    static async updatePhone(userId, phone) {
        const now = new Date().toISOString();
        db.run(`
            UPDATE users
            SET phone = ?, phone_verified = 0, updated_at = ?
            WHERE id = ?
        `, [phone, now, userId]);

        return this.findById(userId);
    }

    /**
     * Mark phone as verified
     */
    static async markPhoneVerified(userId) {
        const now = new Date().toISOString();
        db.run(`
            UPDATE users
            SET phone_verified = 1, updated_at = ?
            WHERE id = ?
        `, [now, userId]);

        return this.findById(userId);
    }

    /**
     * Update last login timestamp
     */
    static async updateLastLogin(userId) {
        const now = new Date().toISOString();
        db.run('UPDATE users SET last_login = ? WHERE id = ?', [now, userId]);
    }

    /**
     * Update subscription tier
     */
    static async updateSubscription(userId, tier, status = 'active') {
        const now = new Date().toISOString();
        db.run(`
            UPDATE users
            SET subscription_tier = ?, subscription_status = ?, updated_at = ?
            WHERE id = ?
        `, [tier, status, now, userId]);

        return db.get(`
            SELECT id, email, subscription_tier, subscription_status
            FROM users WHERE id = ?
        `, [userId]);
    }

    /**
     * Update user profile
     */
    static async updateProfile(userId, { name, email }) {
        const now = new Date().toISOString();
        const updates = [];
        const values = [];

        if (name) {
            updates.push('name = ?');
            values.push(name);
        }
        if (email) {
            updates.push('email = ?');
            values.push(email.toLowerCase().trim());
        }

        if (updates.length === 0) {
            return await this.findById(userId);
        }

        updates.push('updated_at = ?');
        values.push(now);
        values.push(userId);

        db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

        return this.findById(userId);
    }

    /**
     * Delete user account
     */
    static async delete(userId) {
        db.run('DELETE FROM users WHERE id = ?', [userId]);
    }
}

module.exports = User;
