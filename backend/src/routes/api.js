const express = require('express');
const multer = require('multer');
const { requireAuth, optionalAuth, requireRole } = require('../middleware/auth');
const authController = require('../controllers/authController');
const modController = require('../controllers/modController');
const modpackController = require('../controllers/modpackController');
const launcherController = require('../controllers/launcherController');

const router = express.Router();
const upload = multer({ 
  limits: { fileSize: 250 * 1024 * 1024 } // 250MB limit
});

// System & Health
router.get('/status', launcherController.getStatus);

// Authentication
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.get('/auth/me', requireAuth, authController.me);
router.put('/auth/profile', requireAuth, authController.updateProfile);

// Categories
router.get('/categories', (req, res) => {
  const db = require('../services/db');
  res.json({ categories: db.find('categories', () => true) });
});

// Mods
router.get('/mods', modController.listMods);
router.get('/mods/:id', modController.getMod);
router.post('/mods', requireAuth, requireRole('Developer', 'Admin'), modController.createMod);
router.post('/mods/:id/versions', requireAuth, upload.single('file'), modController.uploadVersion);
router.get('/mods/version/:versionId/download', modController.downloadVersion);

// Modpacks
router.get('/modpacks', modpackController.listModpacks);
router.get('/modpacks/:id', modpackController.getModpack);
router.post('/modpacks', requireAuth, modpackController.createModpack);
router.post('/modpacks/:id/versions', requireAuth, upload.single('file'), modpackController.uploadModpackVersion);
router.get('/modpacks/version/:versionId/download', modpackController.downloadModpack);

// Launcher & Deep Linking
router.get('/launcher/install/:type/:id', launcherController.resolveInstallPayload);
router.get('/launcher/updates', launcherController.checkUpdates);

module.exports = router;

