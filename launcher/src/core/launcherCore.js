const fs = require('fs');
const path = require('path');
const InstanceManager = require('../instances/instanceManager');
const DeepLinkHandler = require('../protocol/deepLinkHandler');

class LauncherCore {
  constructor(options = {}) {
    this.rootDir = options.rootDir || path.join(__dirname, '../../../data');
    this.configPath = path.join(this.rootDir, 'launcher_settings.json');
    this.instanceManager = new InstanceManager(path.join(this.rootDir, 'instances'));
    this.deepLinkHandler = new DeepLinkHandler(this.instanceManager, options.apiBaseUrl);

    this.settings = {
      theme: 'dark',
      language: 'en_US',
      defaultMemoryMinMb: 2048,
      defaultMemoryMaxMb: 4096,
      autoCheckUpdates: true,
      closeLauncherOnPlay: false,
      enableDiscordRpc: true,
      proxy: ''
    };

    this.init();
  }

  init() {
    if (fs.existsSync(this.configPath)) {
      try {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        this.settings = { ...this.settings, ...JSON.parse(raw) };
      } catch (e) {
        console.error('Failed to load launcher settings:', e);
      }
    } else {
      this.saveSettings();
    }
  }

  saveSettings() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.settings, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
    return this.settings;
  }
}

module.exports = LauncherCore;

