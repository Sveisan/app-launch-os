const { pool } = require('../server/db/index');
const { hashPassword } = require('../server/db/auth');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function createAdmin() {
    console.log('--- Mission Control Admin Setup ---');
    
    const email = await new Promise(resolve => rl.question('Enter Admin Email: ', resolve));
    const password = await new Promise(resolve => rl.question('Enter Admin Password: ', resolve));
    const role = await new Promise(resolve => rl.question('Enter Role (owner/freelancer) [owner]: ', r => resolve(r || 'owner')));

    if (!email || !password) {
        console.error('Email and Password are required.');
        process.exit(1);
    }

    try {
        const hashedPassword = await hashPassword(password);
        await pool.query(
            'INSERT INTO admin_users (email, password_hash, role) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET password_hash = $2, role = $3',
            [email, hashedPassword, role]
        );
        console.log(`\nSUCCESS: User ${email} (${role}) has been created/updated.`);
        console.log('You can now log in at /mission-control-x89/login');
    } catch (err) {
        console.error('Error creating user:', err);
    } finally {
        await pool.end();
        rl.close();
    }
}

createAdmin();
