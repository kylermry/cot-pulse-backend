/**
 * View Users Script
 * Run with: node view-users.js
 */

const { initDatabase, all } = require('./db');

async function viewUsers() {
    await initDatabase();

    console.log('\n============================================');
    console.log('  COT PULSE - DATABASE USERS');
    console.log('============================================\n');

    const users = all('SELECT id, email, name, phone, phone_verified, subscription_tier, created_at FROM users');

    if (users.length === 0) {
        console.log('No users found in database.\n');
        return;
    }

    console.log(`Found ${users.length} user(s):\n`);

    users.forEach((user, index) => {
        console.log(`--- User ${index + 1} ---`);
        console.log(`  ID:            ${user.id}`);
        console.log(`  Email:         ${user.email}`);
        console.log(`  Name:          ${user.name || '(not set)'}`);
        console.log(`  Phone:         ${user.phone || '(not set)'}`);
        console.log(`  Phone Verified: ${user.phone_verified ? 'Yes' : 'No'}`);
        console.log(`  Subscription:  ${user.subscription_tier}`);
        console.log(`  Created:       ${user.created_at}`);
        console.log('');
    });
}

viewUsers().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
