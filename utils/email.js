/**
 * Email Service
 * COT Pulse Backend
 *
 * Uses Resend API for transactional emails
 */

const { Resend } = require('resend');

// Initialize Resend with API key
const resend = new Resend(process.env.RESEND_API_KEY);

// Email sender address
const FROM_EMAIL = 'COT Pulse <noreply@cotpulse.com>';

// Frontend URL for links
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.cotpulse.com';

/**
 * Email template styles (inline CSS for email compatibility)
 */
const styles = {
    container: `
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        max-width: 600px;
        margin: 0 auto;
        background-color: #0B0F17;
        color: #ffffff;
    `,
    header: `
        background: linear-gradient(135deg, #0B0F17 0%, #141B2D 100%);
        padding: 40px 30px;
        text-align: center;
        border-bottom: 1px solid rgba(6, 182, 212, 0.2);
    `,
    logo: `
        font-size: 28px;
        font-weight: 700;
        color: #06b6d4;
        letter-spacing: 2px;
        margin: 0;
    `,
    tagline: `
        font-size: 12px;
        color: #64748b;
        letter-spacing: 1px;
        margin-top: 8px;
        text-transform: uppercase;
    `,
    body: `
        padding: 40px 30px;
        background-color: #0F1420;
    `,
    heading: `
        font-size: 24px;
        font-weight: 600;
        color: #ffffff;
        margin: 0 0 20px 0;
    `,
    text: `
        font-size: 16px;
        line-height: 1.6;
        color: #B4BCD0;
        margin: 0 0 20px 0;
    `,
    button: `
        display: inline-block;
        padding: 16px 40px;
        background: linear-gradient(135deg, #0891b2 0%, #06b6d4 50%, #22d3ee 100%);
        color: #ffffff;
        text-decoration: none;
        font-weight: 600;
        font-size: 14px;
        letter-spacing: 1px;
        border-radius: 4px;
        margin: 20px 0;
    `,
    buttonContainer: `
        text-align: center;
        margin: 30px 0;
    `,
    divider: `
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(6, 182, 212, 0.3), transparent);
        margin: 30px 0;
    `,
    featureBox: `
        background-color: #1A2235;
        border: 1px solid rgba(6, 182, 212, 0.1);
        border-radius: 8px;
        padding: 20px;
        margin: 20px 0;
    `,
    featureTitle: `
        font-size: 14px;
        font-weight: 600;
        color: #06b6d4;
        margin: 0 0 10px 0;
    `,
    featureText: `
        font-size: 14px;
        color: #B4BCD0;
        margin: 0;
    `,
    footer: `
        background-color: #0B0F17;
        padding: 30px;
        text-align: center;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
    `,
    footerText: `
        font-size: 12px;
        color: #64748b;
        margin: 0 0 10px 0;
    `,
    footerLink: `
        color: #06b6d4;
        text-decoration: none;
    `,
    smallText: `
        font-size: 12px;
        color: #64748b;
        margin: 20px 0 0 0;
    `
};

/**
 * Generate base email template
 */
function baseTemplate(content) {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>COT Pulse</title>
</head>
<body style="margin: 0; padding: 0; background-color: #020617;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #020617; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="${styles.container}">
                    <!-- Header -->
                    <tr>
                        <td style="${styles.header}">
                            <h1 style="${styles.logo}">COT PULSE</h1>
                            <p style="${styles.tagline}">Institutional Positioning Intelligence</p>
                        </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                        <td style="${styles.body}">
                            ${content}
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="${styles.footer}">
                            <p style="${styles.footerText}">
                                <a href="${FRONTEND_URL}" style="${styles.footerLink}">cotpulse.com</a>
                            </p>
                            <p style="${styles.footerText}">
                                Track institutional positioning with CFTC Commitment of Traders data
                            </p>
                            <p style="${styles.footerText}; margin-top: 20px;">
                                &copy; ${new Date().getFullYear()} COT Pulse. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}

/**
 * Send welcome email to new users
 */
async function sendWelcomeEmail(email, name) {
    console.log('[Email] Sending welcome email to:', email);

    const firstName = name ? name.split(' ')[0] : 'there';

    const content = `
        <h2 style="${styles.heading}">Welcome to COT Pulse, ${firstName}!</h2>

        <p style="${styles.text}">
            You've just joined thousands of traders who use institutional positioning data to make smarter trading decisions.
        </p>

        <p style="${styles.text}">
            With COT Pulse, you can now see what hedge funds, commercial traders, and large speculators are doing - before the market moves.
        </p>

        <div style="${styles.divider}"></div>

        <div style="${styles.featureBox}">
            <p style="${styles.featureTitle}">What You Can Do Now:</p>
            <p style="${styles.featureText}">
                &#x2713; Track net positions across 150+ futures markets<br>
                &#x2713; Analyze historical COT trends and patterns<br>
                &#x2713; Monitor institutional sentiment shifts<br>
                &#x2713; Set up custom alerts for position changes
            </p>
        </div>

        <div style="${styles.buttonContainer}">
            <a href="${FRONTEND_URL}/dashboard" style="${styles.button}">
                OPEN DASHBOARD
            </a>
        </div>

        <p style="${styles.text}">
            Ready to unlock the full power of COT data? Upgrade to Pro for real-time alerts, advanced analytics, and priority support.
        </p>

        <p style="${styles.smallText}">
            Questions? Just reply to this email - we're here to help.
        </p>
    `;

    try {
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: email,
            subject: 'Welcome to COT Pulse - Your Edge Starts Now',
            html: baseTemplate(content)
        });

        if (error) {
            console.error('[Email] Failed to send welcome email:', error);
            return { success: false, error };
        }

        console.log('[Email] Welcome email sent successfully to:', email, 'ID:', data?.id);
        return { success: true, id: data?.id };

    } catch (error) {
        console.error('[Email] Welcome email error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send password reset email
 */
async function sendPasswordResetEmail(email, resetToken, name) {
    console.log('[Email] Sending password reset email to:', email);

    const firstName = name ? name.split(' ')[0] : 'there';
    const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`;

    const content = `
        <h2 style="${styles.heading}">Reset Your Password</h2>

        <p style="${styles.text}">
            Hi ${firstName}, we received a request to reset your COT Pulse password.
        </p>

        <p style="${styles.text}">
            Click the button below to create a new password. This link will expire in 1 hour for security reasons.
        </p>

        <div style="${styles.buttonContainer}">
            <a href="${resetUrl}" style="${styles.button}">
                RESET PASSWORD
            </a>
        </div>

        <div style="${styles.divider}"></div>

        <p style="${styles.text}">
            If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
        </p>

        <p style="${styles.smallText}">
            For security, this link expires in 1 hour. If you need a new link, visit <a href="${FRONTEND_URL}/forgot-password" style="${styles.footerLink}">cotpulse.com/forgot-password</a>
        </p>
    `;

    try {
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: email,
            subject: 'Reset Your COT Pulse Password',
            html: baseTemplate(content)
        });

        if (error) {
            console.error('[Email] Failed to send password reset email:', error);
            return { success: false, error };
        }

        console.log('[Email] Password reset email sent successfully to:', email, 'ID:', data?.id);
        return { success: true, id: data?.id };

    } catch (error) {
        console.error('[Email] Password reset email error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send subscription confirmation email
 */
async function sendSubscriptionEmail(email, name, tier) {
    console.log('[Email] Sending subscription confirmation to:', email);

    const firstName = name ? name.split(' ')[0] : 'there';

    const content = `
        <h2 style="${styles.heading}">Welcome to COT Pulse Pro!</h2>

        <p style="${styles.text}">
            Congratulations ${firstName}! Your upgrade to COT Pulse Pro is now active.
        </p>

        <div style="${styles.featureBox}">
            <p style="${styles.featureTitle}">Your Pro Features:</p>
            <p style="${styles.featureText}">
                &#x2713; Real-time position change alerts<br>
                &#x2713; Advanced historical analytics<br>
                &#x2713; Custom watchlists with unlimited assets<br>
                &#x2713; Priority email support<br>
                &#x2713; Early access to new features
            </p>
        </div>

        <div style="${styles.buttonContainer}">
            <a href="${FRONTEND_URL}/dashboard" style="${styles.button}">
                START USING PRO
            </a>
        </div>

        <p style="${styles.text}">
            Need to manage your subscription? Visit your <a href="${FRONTEND_URL}/settings" style="${styles.footerLink}">account settings</a> anytime.
        </p>

        <p style="${styles.smallText}">
            Thank you for supporting COT Pulse!
        </p>
    `;

    try {
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: email,
            subject: 'Welcome to COT Pulse Pro - Your Upgrade is Active',
            html: baseTemplate(content)
        });

        if (error) {
            console.error('[Email] Failed to send subscription email:', error);
            return { success: false, error };
        }

        console.log('[Email] Subscription email sent successfully to:', email, 'ID:', data?.id);
        return { success: true, id: data?.id };

    } catch (error) {
        console.error('[Email] Subscription email error:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendWelcomeEmail,
    sendPasswordResetEmail,
    sendSubscriptionEmail
};
