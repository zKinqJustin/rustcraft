const db = require('../services/db');

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

      // Dynamically compute exact file hash to avoid CRLF disk deviations
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
          kind: mod.kind, // 'content' or 'native'
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
 * Launcher updates
 */
async function checkUpdates(req, res) {
  const currentVersion = req.query.version || '1.0.0';
  res.json({
    latestVersion: '1.2.0',
    hasUpdate: currentVersion !== '1.2.0',
    releaseNotes: 'Rustcraft 1.2.0: Instant HMOD auto-building, enhanced instance isolation, and redesigned modern UI.',
    downloadUrl: '/api/v1/launcher/download/latest'
  });
}

/**
 * Health check & status
 */
async function getStatus(req, res) {
  const modCount = db.find('mods', () => true).length;
  const modpackCount = db.find('modpacks', () => true).length;
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
  resolveInstallPayload,
  checkUpdates,
  getStatus
};
