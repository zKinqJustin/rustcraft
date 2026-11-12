const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const LauncherCore = require('./core/launcherCore');

const app = express();
const PORT = process.env.LAUNCHER_PORT || 5000;

const launcher = new LauncherCore({
  apiBaseUrl: process.env.RUSTCRAFT_API_URL || 'http://localhost:4000/api/v1'
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'ui')));

// API: List instances
app.get('/api/launcher/instances', (req, res) => {
  res.json(launcher.instanceManager.listInstances());
});

// API: Create instance
app.post('/api/launcher/instances', (req, res) => {
  try {
    const inst = launcher.instanceManager.createInstance(req.body);
    res.status(201).json(inst);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// API: Duplicate instance
app.post('/api/launcher/instances/:id/duplicate', (req, res) => {
  try {
    const inst = launcher.instanceManager.duplicateInstance(req.params.id, req.body.name);
    res.json(inst);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// API: Delete instance
app.delete('/api/launcher/instances/:id', (req, res) => {
  const ok = launcher.instanceManager.deleteInstance(req.params.id);
  res.json({ success: ok });
});

// API: List mods for instance
app.get('/api/launcher/instances/:id/mods', (req, res) => {
  res.json(launcher.instanceManager.getMods(req.params.id));
});

// API: Toggle mod state
app.post('/api/launcher/instances/:id/mods/toggle', (req, res) => {
  try {
    const result = launcher.instanceManager.toggleMod(req.params.id, req.body.filename, req.body.enable);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// API: Remove mod
app.post('/api/launcher/instances/:id/mods/remove', (req, res) => {
  try {
    const ok = launcher.instanceManager.removeMod(req.params.id, req.body.filename);
    res.json({ success: ok });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// API: Launch instance
app.post('/api/launcher/instances/:id/launch', (req, res) => {
  try {
    const result = launcher.instanceManager.launchInstance(req.params.id, (logLine) => {
      console.log(`[Game Log] ${logLine}`);
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// API: Deep Link Execution (rustcraft://...)
app.post('/api/launcher/deep-link', async (req, res) => {
  try {
    const { uri, targetInstanceId } = req.body;
    if (!uri) return res.status(400).json({ error: 'Missing uri string' });

    const result = await launcher.deepLinkHandler.handleDeepLink(uri, { targetInstanceId }, (progress) => {
      console.log(`[DeepLink Progress] ${progress.percent}%: ${progress.message}`);
    });

    res.json(result);
  } catch (e) {
    console.error('Deep link error:', e);
    res.status(400).json({ error: e.message });
  }
});

// API: Settings
app.get('/api/launcher/settings', (req, res) => {
  res.json(launcher.settings);
});

app.put('/api/launcher/settings', (req, res) => {
  res.json(launcher.updateSettings(req.body));
});

// Start Launcher Server
function startLauncher() {
  return app.listen(PORT, () => {
    console.log(`[Rustcraft Launcher] GUI available at http://localhost:${PORT}`);
    console.log(`[Rustcraft Launcher] Deep-link handler ready for rustcraft://`);
  });
}

if (require.main === module) {
  startLauncher();
}

module.exports = { app, startLauncher, launcher };
