const crypto = require('crypto');
const db = require('./db');
const { hashPassword } = require('./security');

async function seedDatabase() {
  const users = db.find('users', () => true);
  if (users.length > 0) return;

  console.log('[Setup] Initializing Rustcraft system accounts...');

  const adminPasswordHash = await hashPassword('RustcraftAdmin2026!');
  const devPasswordHash = await hashPassword('RustcraftDev2026!');

  db.insert('users', {
    id: 'user-admin-01',
    username: 'RustcraftAdmin',
    email: 'admin@rustcraft.net',
    passwordHash: adminPasswordHash,
    role: 'Admin',
    avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=RustcraftAdmin',
    bio: 'Rustcraft Lead Administrator'
  });

  db.insert('users', {
    id: 'user-dev-01',
    username: 'Developer',
    email: 'developer@rustcraft.net',
    passwordHash: devPasswordHash,
    role: 'Developer',
    avatarUrl: 'https://api.dicebear.com/7.x/identicon/svg?seed=Developer',
    bio: 'Verified Developer'
  });

  console.log('[Setup] System initialized without placeholder mods or dummy data.');
}

module.exports = { seedDatabase };
