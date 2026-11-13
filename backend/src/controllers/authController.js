const crypto = require('crypto');
const db = require('../services/db');
const { hashPassword, verifyPassword, generateToken } = require('../services/security');

async function register(req, res) {
  try {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password are required' });
    }

    if (username.length < 3 || username.length > 32) {
      return res.status(400).json({ error: 'Username must be between 3 and 32 characters' });
    }

    const existingUser = db.findOne('users', u => u.username.toLowerCase() === username.toLowerCase() || u.email.toLowerCase() === email.toLowerCase());
    if (existingUser) {
      return res.status(409).json({ error: 'Username or email already in use' });
    }

    const passwordHash = await hashPassword(password);
    const assignedRole = ['Developer', 'Moderator', 'Admin'].includes(role) ? role : 'User';

    const user = db.insert('users', {
      id: crypto.randomUUID(),
      username,
      email,
      passwordHash,
      role: assignedRole,
      avatarUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(username)}`,
      bio: '',
      createdAt: new Date().toISOString()
    });

    const token = generateToken(user);
    const { passwordHash: _, ...userSafe } = user;
    res.status(201).json({ user: userSafe, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function login(req, res) {
  try {
    const identifier = req.body.login || req.body.identifier || req.body.username;
    const { password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Login identifier and password are required' });
    }

    const user = db.findOne('users', u => 
      u.username.toLowerCase() === identifier.toLowerCase() || 
      u.email.toLowerCase() === identifier.toLowerCase()
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = generateToken(user);
    const { passwordHash: _, ...userSafe } = user;
    res.json({ user: userSafe, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function me(req, res) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { passwordHash: _, ...userSafe } = req.user;
  res.json({ user: userSafe });
}

async function updateProfile(req, res) {
  try {
    const { bio, avatarUrl } = req.body;
    const updated = db.update('users', u => u.id === req.user.id, {
      bio: bio !== undefined ? bio : req.user.bio,
      avatarUrl: avatarUrl !== undefined ? avatarUrl : req.user.avatarUrl
    });
    const { passwordHash: _, ...userSafe } = updated;
    res.json({ user: userSafe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  register,
  login,
  me,
  updateProfile,
};

