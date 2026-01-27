/**
 * Stripe Payment Routes
 * COT Pulse Backend
 */

const express = require('express');
const Stripe = require('stripe');
const { authenticateToken } = require('./auth');
const User = require('../models/User');
const db = require('../db');

const router = express.Router();

// Initialize Stripe with secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Frontend URLs
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.cotpulse.com';

// ============================================
// CHECKOUT SESSION
// ============================================

/**
 * POST /api/stripe/create-checkout-session
 * Create a Stripe checkout session for Pro subscription
 * Requires authentication
 */
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const userEmail = req.userEmail;

        console.log(`[Stripe] Creating checkout session for userId: ${userId}, email: ${userEmail}`);

        // Get user details
        const user = await User.findById(userId);
        console.log(`[Stripe] User found:`, user ? 'yes' : 'no');

        if (!user) {
            console.log(`[Stripe] User not found in database for userId: ${userId}`);
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Check if user already has Pro subscription
        if (user.subscription_tier === 'pro' && user.subscription_status === 'active') {
            return res.status(400).json({
                success: false,
                error: 'You already have an active Pro subscription'
            });
        }

        // Get or create Stripe customer
        let customerId = user.stripe_customer_id;

        if (!customerId) {
            const customer = await stripe.customers.create({
                email: userEmail,
                metadata: {
                    userId: userId
                }
            });
            customerId = customer.id;

            // Save customer ID to user
            db.run(
                'UPDATE users SET stripe_customer_id = ?, updated_at = ? WHERE id = ?',
                [customerId, new Date().toISOString(), userId]
            );
        }

        // Create checkout session
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            mode: 'subscription',
            line_items: [
                {
                    price: process.env.STRIPE_PRICE_ID,
                    quantity: 1
                }
            ],
            success_url: `${FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${FRONTEND_URL}/pricing`,
            metadata: {
                userId: userId,
                userEmail: userEmail
            },
            subscription_data: {
                metadata: {
                    userId: userId,
                    userEmail: userEmail
                }
            }
        });

        console.log(`[Stripe] Checkout session created for user: ${userEmail}`);

        res.json({
            success: true,
            sessionId: session.id,
            url: session.url
        });

    } catch (error) {
        console.error('[Stripe] Create checkout session error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create checkout session'
        });
    }
});

/**
 * GET /api/stripe/session/:sessionId
 * Get checkout session details (for success page)
 */
router.get('/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        const session = await stripe.checkout.sessions.retrieve(sessionId, {
            expand: ['subscription', 'customer']
        });

        res.json({
            success: true,
            session: {
                id: session.id,
                status: session.status,
                customerEmail: session.customer_details?.email,
                subscriptionStatus: session.subscription?.status
            }
        });

    } catch (error) {
        console.error('[Stripe] Get session error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve session'
        });
    }
});

/**
 * POST /api/stripe/create-portal-session
 * Create a Stripe customer portal session for managing subscription
 */
router.post('/create-portal-session', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId);

        if (!user || !user.stripe_customer_id) {
            return res.status(400).json({
                success: false,
                error: 'No active subscription found'
            });
        }

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: user.stripe_customer_id,
            return_url: `${FRONTEND_URL}/dashboard`
        });

        res.json({
            success: true,
            url: portalSession.url
        });

    } catch (error) {
        console.error('[Stripe] Create portal session error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create portal session'
        });
    }
});

module.exports = router;

// ============================================
// WEBHOOK HANDLER (exported separately)
// ============================================

/**
 * Stripe Webhook Handler
 * Must be used with express.raw() middleware
 */
async function handleWebhook(req, res) {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error('[Stripe Webhook] Signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`[Stripe Webhook] Received event: ${event.type}`);

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                await handleCheckoutComplete(session);
                break;
            }

            case 'customer.subscription.created':
            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                await handleSubscriptionUpdate(subscription);
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                await handleSubscriptionCanceled(subscription);
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                await handlePaymentFailed(invoice);
                break;
            }

            default:
                console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
        }

        res.json({ received: true });

    } catch (error) {
        console.error('[Stripe Webhook] Handler error:', error);
        res.status(500).json({ error: 'Webhook handler failed' });
    }
}

/**
 * Handle successful checkout
 */
async function handleCheckoutComplete(session) {
    const userId = session.metadata?.userId;
    const userEmail = session.metadata?.userEmail || session.customer_details?.email;

    console.log(`[Stripe] Checkout completed for user: ${userEmail}`);

    if (userId) {
        // Update user subscription
        const now = new Date().toISOString();
        db.run(
            `UPDATE users
             SET subscription_tier = 'pro',
                 subscription_status = 'active',
                 stripe_customer_id = ?,
                 updated_at = ?
             WHERE id = ?`,
            [session.customer, now, userId]
        );
        console.log(`[Stripe] User ${userId} upgraded to Pro`);
    } else {
        console.warn('[Stripe] No userId in session metadata');
    }
}

/**
 * Handle subscription updates
 */
async function handleSubscriptionUpdate(subscription) {
    const userId = subscription.metadata?.userId;
    const status = subscription.status;

    if (!userId) {
        console.warn('[Stripe] No userId in subscription metadata');
        return;
    }

    const now = new Date().toISOString();
    const tier = (status === 'active' || status === 'trialing') ? 'pro' : 'free';
    const subStatus = status === 'active' ? 'active' : status;

    db.run(
        `UPDATE users
         SET subscription_tier = ?,
             subscription_status = ?,
             updated_at = ?
         WHERE id = ?`,
        [tier, subStatus, now, userId]
    );

    console.log(`[Stripe] Subscription updated for user ${userId}: ${tier} (${subStatus})`);
}

/**
 * Handle subscription cancellation
 */
async function handleSubscriptionCanceled(subscription) {
    const userId = subscription.metadata?.userId;

    if (!userId) {
        // Try to find user by Stripe customer ID
        const customerId = subscription.customer;
        const user = db.get('SELECT id FROM users WHERE stripe_customer_id = ?', [customerId]);
        if (user) {
            const now = new Date().toISOString();
            db.run(
                `UPDATE users
                 SET subscription_tier = 'free',
                     subscription_status = 'canceled',
                     updated_at = ?
                 WHERE id = ?`,
                [now, user.id]
            );
            console.log(`[Stripe] Subscription canceled for user ${user.id}`);
        }
        return;
    }

    const now = new Date().toISOString();
    db.run(
        `UPDATE users
         SET subscription_tier = 'free',
             subscription_status = 'canceled',
             updated_at = ?
         WHERE id = ?`,
        [now, userId]
    );

    console.log(`[Stripe] Subscription canceled for user ${userId}`);
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice) {
    const customerId = invoice.customer;

    const user = db.get('SELECT id, email FROM users WHERE stripe_customer_id = ?', [customerId]);
    if (user) {
        console.log(`[Stripe] Payment failed for user ${user.email}`);
        // Could send email notification here
    }
}

module.exports.handleWebhook = handleWebhook;
