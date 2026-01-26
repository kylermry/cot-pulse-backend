/**
 * Twilio Verification Test Script
 * Run with: npm run test-twilio
 */

require('dotenv').config();
const twilio = require('twilio');
const readline = require('readline');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║       🧪 TWILIO VERIFICATION TEST SCRIPT          ║');
console.log('╚════════════════════════════════════════════════════╝\n');

// Check credentials
console.log('📋 Checking configuration...\n');

if (!accountSid) {
    console.error('❌ TWILIO_ACCOUNT_SID is missing in .env');
    process.exit(1);
}
console.log(`✓ Account SID: ${accountSid.substring(0, 8)}...${accountSid.slice(-4)}`);

if (!authToken) {
    console.error('❌ TWILIO_AUTH_TOKEN is missing in .env');
    process.exit(1);
}
console.log(`✓ Auth Token: ${authToken.substring(0, 4)}...${authToken.slice(-4)}`);

if (!verifyServiceSid || verifyServiceSid.includes('REPLACE')) {
    console.error('\n❌ TWILIO_VERIFY_SERVICE_SID is not configured!');
    console.error('\n📌 To fix this:');
    console.error('   1. Go to: https://console.twilio.com/us1/develop/verify/services');
    console.error('   2. Click "Create new Service"');
    console.error('   3. Name it "COT Pulse Verification"');
    console.error('   4. Copy the Service SID (starts with VA...)');
    console.error('   5. Update .env file with: TWILIO_VERIFY_SERVICE_SID=VA...\n');
    process.exit(1);
}
console.log(`✓ Verify Service SID: ${verifyServiceSid.substring(0, 8)}...${verifyServiceSid.slice(-4)}`);

const client = twilio(accountSid, authToken);

// Test the Verify Service connection
async function testServiceConnection() {
    try {
        console.log('\n🔗 Testing connection to Twilio Verify Service...');
        const service = await client.verify.v2.services(verifyServiceSid).fetch();
        console.log(`✅ Connected! Service Name: "${service.friendlyName}"\n`);
        return true;
    } catch (error) {
        console.error(`\n❌ Failed to connect to Verify Service: ${error.message}`);
        if (error.code === 20404) {
            console.error('   The Verify Service SID may be incorrect.');
        }
        return false;
    }
}

// Interactive phone verification test
async function runInteractiveTest() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

    try {
        const phone = await question('📱 Enter your phone number (e.g., +15551234567 or 5551234567): ');

        // Clean the phone number
        let formattedPhone = phone.replace(/\D/g, '');
        if (formattedPhone.length === 10) {
            formattedPhone = `+1${formattedPhone}`;
        } else if (!formattedPhone.startsWith('+')) {
            formattedPhone = `+${formattedPhone}`;
        }

        console.log(`\n📤 Sending verification code to ${formattedPhone}...`);

        const verification = await client.verify.v2
            .services(verifyServiceSid)
            .verifications
            .create({ to: formattedPhone, channel: 'sms' });

        console.log('✅ Code sent successfully!');
        console.log(`   Status: ${verification.status}`);
        console.log('\n📱 Check your phone for the 6-digit code\n');

        const code = await question('🔢 Enter the 6-digit code you received: ');

        console.log(`\n🔍 Verifying code: ${code.trim()}...`);

        const check = await client.verify.v2
            .services(verifyServiceSid)
            .verificationChecks
            .create({ to: formattedPhone, code: code.trim() });

        if (check.status === 'approved') {
            console.log('\n╔════════════════════════════════════════════════════╗');
            console.log('║  ✅ SUCCESS! Phone verification is working!       ║');
            console.log('║  🎉 Twilio is correctly configured!               ║');
            console.log('╚════════════════════════════════════════════════════╝\n');
        } else {
            console.log(`\n❌ Verification failed. Status: ${check.status}`);
            console.log('   The code may have been incorrect or expired.\n');
        }

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);

        if (error.code === 60200) {
            console.error('   Invalid phone number format.');
        } else if (error.code === 60202) {
            console.error('   Too many verification attempts. Wait a few minutes.');
        } else if (error.code === 60203) {
            console.error('   Max send attempts reached. Try a different number.');
        }
    } finally {
        rl.close();
    }
}

// Main execution
async function main() {
    const connected = await testServiceConnection();

    if (!connected) {
        console.log('Fix the configuration issues above and try again.\n');
        process.exit(1);
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question('Would you like to test phone verification? (y/n): ', async (answer) => {
        rl.close();

        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
            await runInteractiveTest();
        } else {
            console.log('\n✓ Configuration test complete. Twilio is ready!\n');
        }

        process.exit(0);
    });
}

main();
