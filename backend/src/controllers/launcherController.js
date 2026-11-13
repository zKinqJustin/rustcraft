const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const db = require('../services/db');

/**
 * Check whether Rustcraft Launcher is running locally
 */
async function getClientStatus(req, res) {
  try {
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
    const versionDir = path.join(appData, 'rustcraft-launcher', 'versions', 'v0.2.72');
    const has263 = fs.existsSync(versionDir);

    // Check Windows process list for rustcraft-launcher
    exec('tasklist /FI "IMAGENAME eq rustcraft-launcher.exe" /FO CSV /NH', (err, stdout) => {
      let isRunning = false;
      let pid = null;

      if (!err && stdout && stdout.toLowerCase().includes('rustcraft-launcher.exe')) {
        isRunning = true;
        const match = stdout.match(/"rustcraft-launcher\.exe","(\d+)"/i);
        if (match) {
          pid = parseInt(match[1], 10);
        }
      }

      res.json({
        running: isRunning,
        pid,
        name: 'Rustcraft Native Launcher',
        version: '1.0.0',
        gameVersion: '26.3',
        has263Installed: has263,
        executablePath: 'C:\\Users\\justi\\Desktop\\rustcraft-launcher.exe',
        appDataDir: path.join(appData, 'rustcraft')
      });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Start the local Rustcraft Launcher from the web
 */
async function startLauncher(req, res) {
  try {
    const desktopExe = 'C:\\Users\\justi\\Desktop\\rustcraft-launcher.exe';
    const targetExe = path.join(__dirname, '..', '..', '..', 'launcher-rust', 'target', 'debug', 'rustcraft-launcher.exe');
    const exeToRun = fs.existsSync(desktopExe) ? desktopExe : targetExe;

    if (!fs.existsSync(exeToRun)) {
      return res.status(404).json({ error: 'Rustcraft Launcher binary not found on system.' });
    }

    const child = spawn(exeToRun, [], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    res.json({
      success: true,
      message: 'Rustcraft Launcher gestartet!',
      pid: child.pid
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Resolve deep link installation payload for Rustcraft Launcher
 * rustcraft://install/mod/:id or rustcraft://install/modpack/:id
 */
async function resolveInstallPayload(req, res) {
  try {
    const { type, id } = req.params; // 'mod' or 'modpack'
    const { version: requestedVersion } = req.query;

    if (type === 'mod') {
      const mod = db.findOne('mods', m => m.id === id || m.slug === id);
      if (!mod) return res.status(404).json({ error: 'Mod not found' });

      const versions = db.find('mod_versions', v => v.modId === mod.id);
      const version = requestedVersion 
        ? versions.find(v => v.version === requestedVersion) 
        : versions[versions.length - 1];

      if (!version) return res.status(404).json({ error: 'Version not found' });

      const { readFile } = require('../services/storage');
      const { sha256 } = require('../services/security');
      const fileBytes = readFile(version.filePath);
      const exactSha = fileBytes ? sha256(fileBytes) : version.sha256;

      return res.json({
        type: 'mod',
        action: 'install_mod',
        target: {
          id: mod.id,
          slug: mod.slug,
          name: mod.name,
          kind: mod.kind,
          version: version.version,
          gameVersion: version.gameVersion,
          filename: version.filename,
          sha256: exactSha,
          fileSize: fileBytes ? fileBytes.length : version.fileSize,
          isSourceBuildRequired: Boolean(version.isSourceBuildRequired),
          downloadUrl: `/api/v1/mods/version/${version.id}/download`,
          dependencies: version.dependencies || []
        }
      });
    } else if (type === 'modpack') {
      const pack = db.findOne('modpacks', p => p.id === id || p.slug === id);
      if (!pack) return res.status(404).json({ error: 'Modpack not found' });

      const versions = db.find('modpack_versions', v => v.modpackId === pack.id);
      const version = requestedVersion 
        ? versions.find(v => v.version === requestedVersion) 
        : versions[versions.length - 1];

      if (!version) return res.status(404).json({ error: 'Modpack version not found' });

      return res.json({
        type: 'modpack',
        action: 'install_modpack',
        target: {
          id: pack.id,
          slug: pack.slug,
          name: pack.name,
          version: version.version,
          gameVersion: version.gameVersion,
          manifestToml: version.manifestToml,
          sha256: version.sha256,
          mods: version.mods || [],
          downloadUrl: `/api/v1/modpacks/version/${version.id}/download`
        }
      });
    } else {
      return res.status(400).json({ error: 'Unknown install type. Expected mod or modpack' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * 1-Click Direct Local Installation of a Mod OR Modpack
 */
async function installModDirect(req, res) {
  try {
    const { type, id } = req.params;
    const { version: requestedVersion } = req.body || {};

    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
    const targetDirs = [
      path.join(appData, 'rustcraft'),
      path.join(appData, 'horizon')
    ];

    const { getFilePath } = require('../services/storage');

    if (type === 'mod') {
      const mod = db.findOne('mods', m => m.id === id || m.slug === id);
      if (!mod) return res.status(404).json({ error: 'Mod not found' });

      const versions = db.find('mod_versions', v => v.modId === mod.id);
      const version = requestedVersion 
        ? versions.find(v => v.version === requestedVersion) 
        : versions[versions.length - 1];

      if (!version) return res.status(404).json({ error: 'No version available for this mod' });

      const sourcePath = getFilePath(version.filePath);
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        return res.status(404).json({ error: 'Mod file missing from storage' });
      }

      const filename = version.filename || `${mod.slug}-${version.version}.${mod.kind === 'native' ? 'hnmod' : 'hmod'}`;

      for (const baseDir of targetDirs) {
        const modsFolder = path.join(baseDir, 'horizon-mods');
        if (!fs.existsSync(modsFolder)) {
          fs.mkdirSync(modsFolder, { recursive: true });
        }

        const destFile = path.join(modsFolder, filename);
        fs.copyFileSync(sourcePath, destFile);

        const txtPath = path.join(baseDir, 'horizon-mods.txt');
        let currentMods = '';
        if (fs.existsSync(txtPath)) {
          currentMods = fs.readFileSync(txtPath, 'utf8');
        }
        const lines = currentMods.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (!lines.includes(filename)) {
          lines.push(filename);
          fs.writeFileSync(txtPath, lines.join('\n') + '\n', 'utf8');
        }
      }

      db.update('mods', m => m.id === mod.id, {
        downloads: (mod.downloads || 0) + 1
      });

      return res.json({
        success: true,
        message: `Mod "${mod.name}" (v${version.version}) wurde erfolgreich in Rustcraft installiert!`,
        mod: { id: mod.id, name: mod.name, version: version.version, filename }
      });
    } else if (type === 'modpack') {
      const pack = db.findOne('modpacks', p => p.id === id || p.slug === id);
      if (!pack) return res.status(404).json({ error: 'Modpack not found' });

      const versions = db.find('modpack_versions', v => v.modpackId === pack.id);
      const packVersion = requestedVersion 
        ? versions.find(v => v.version === requestedVersion) 
        : versions[versions.length - 1];

      if (!packVersion) return res.status(404).json({ error: 'No version available for this modpack' });

      const installedList = [];
      const includedMods = packVersion.mods || [];

      for (const item of includedMods) {
        const mod = db.findOne('mods', m => m.id === item.id || m.slug === item.id || m.name.toLowerCase() === item.id.toLowerCase());
        if (mod) {
          const modVersions = db.find('mod_versions', v => v.modId === mod.id);
          const mv = modVersions[modVersions.length - 1];
          if (mv && mv.filePath) {
            const modSrc = getFilePath(mv.filePath);
            if (modSrc && fs.existsSync(modSrc)) {
              const filename = mv.filename || `${mod.slug}-${mv.version}.${mod.kind === 'native' ? 'hnmod' : 'hmod'}`;
              for (const baseDir of targetDirs) {
                const modsFolder = path.join(baseDir, 'horizon-mods');
                if (!fs.existsSync(modsFolder)) fs.mkdirSync(modsFolder, { recursive: true });
                fs.copyFileSync(modSrc, path.join(modsFolder, filename));

                const txtPath = path.join(baseDir, 'horizon-mods.txt');
                let currentMods = '';
                if (fs.existsSync(txtPath)) currentMods = fs.readFileSync(txtPath, 'utf8');
                const lines = currentMods.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                if (!lines.includes(filename)) {
                  lines.push(filename);
                  fs.writeFileSync(txtPath, lines.join('\n') + '\n', 'utf8');
                }
              }
              installedList.push(mod.name);
            }
          }
        }
      }

      db.update('modpacks', p => p.id === pack.id, {
        downloads: (pack.downloads || 0) + 1
      });

      return res.json({
        success: true,
        message: `Modpack "${pack.name}" mit ${installedList.length} Mod(s) wurde erfolgreich in Rustcraft installiert!`,
        installedMods: installedList,
        pack: { id: pack.id, name: pack.name, version: packVersion.version }
      });
    } else {
      return res.status(400).json({ error: 'Type must be mod or modpack' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Launcher updates
 */
async function checkUpdates(req, res) {
  const currentVersion = req.query.version || '1.0.0';
  res.json({
    latestVersion: '1.0.0',
    hasUpdate: false,
    releaseNotes: 'Rustcraft 1.0.0 Native GPUI Edition running 26.3 with high performance.',
    downloadUrl: '/api/v1/launcher/download/latest'
  });
}

/**
 * Health check & status
 */
async function getStatus(req, res) {
  const modCount = db.find('mods', m => !m.deleted).length;
  const modpackCount = db.find('modpacks', p => !p.deleted).length;
  const userCount = db.find('users', () => true).length;

  res.json({
    status: 'online',
    service: 'Rustcraft API v1',
    timestamp: new Date().toISOString(),
    stats: {
      mods: modCount,
      modpacks: modpackCount,
      users: userCount
    }
  });
}

module.exports = {
  getClientStatus,
  startLauncher,
  resolveInstallPayload,
  installModDirect,
  checkUpdates,
  getStatus
};
