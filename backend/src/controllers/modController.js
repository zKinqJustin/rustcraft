const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../services/db');
const { saveFile, getFilePath } = require('../services/storage');

async function listMods(req, res) {
  try {
    const { query, category, gameVersion, kind, sort } = req.query;
    let mods = db.find('mods', m => !m.deleted);

    if (query) {
      const q = query.toLowerCase();
      mods = mods.filter(m => 
        m.name.toLowerCase().includes(q) || 
        m.summary.toLowerCase().includes(q) ||
        (m.tags && m.tags.some(t => t.toLowerCase().includes(q)))
      );
    }

    if (category) {
      mods = mods.filter(m => m.categories && m.categories.includes(category));
    }

    if (kind) {
      mods = mods.filter(m => m.kind === kind);
    }

    if (gameVersion) {
      mods = mods.filter(m => m.supportedGameVersions && m.supportedGameVersions.includes(gameVersion));
    }

    // Attach latest version
    const enriched = mods.map(m => {
      const versions = db.find('mod_versions', v => v.modId === m.id);
      const latest = versions.length > 0 ? versions[versions.length - 1] : null;
      return {
        ...m,
        latestVersion: latest ? latest.version : '0.1.0',
        versionCount: versions.length
      };
    });

    // Sorting
    if (sort === 'newest') {
      enriched.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sort === 'downloads') {
      enriched.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    } else {
      // Popular / default
      enriched.sort((a, b) => ((b.downloads || 0) + (b.likes || 0) * 10) - ((a.downloads || 0) + (a.likes || 0) * 10));
    }

    res.json({ mods: enriched, total: enriched.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getMod(req, res) {
  try {
    const { id } = req.params;
    const mod = db.findOne('mods', m => m.id === id || m.slug === id);
    if (!mod) {
      return res.status(404).json({ error: 'Mod not found' });
    }

    const versions = db.find('mod_versions', v => v.modId === mod.id);
    const author = db.findOne('users', u => u.id === mod.authorId);

    res.json({
      ...mod,
      author: author ? { id: author.id, username: author.username, avatarUrl: author.avatarUrl } : null,
      versions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createMod(req, res) {
  try {
    const { name, slug, summary, description, kind, categories, supportedGameVersions, repositoryUrl } = req.body;
    if (!name || !summary) {
      return res.status(400).json({ error: 'Name and summary are required' });
    }

    const calculatedSlug = (slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const existing = db.findOne('mods', m => m.slug === calculatedSlug);
    if (existing) {
      return res.status(409).json({ error: 'Mod with this slug already exists' });
    }

    const mod = db.insert('mods', {
      id: crypto.randomUUID(),
      name,
      slug: calculatedSlug,
      summary,
      description: description || summary,
      kind: kind === 'native' ? 'native' : 'content', // content (.hmod) or native (.hnmod)
      categories: Array.isArray(categories) ? categories : ['utility'],
      supportedGameVersions: Array.isArray(supportedGameVersions) ? supportedGameVersions : ['1.21.1', '1.20.4'],
      authorId: req.user.id,
      downloads: 0,
      likes: 0,
      iconUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(name)}`,
      screenshots: [],
      repositoryUrl: repositoryUrl || '',
      license: 'MIT'
    });

    res.status(201).json(mod);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function uploadVersion(req, res) {
  try {
    const { id } = req.params;
    const { version, changelog, gameVersion, isSourceBuildRequired, dependencies } = req.body;
    const mod = db.findOne('mods', m => m.id === id || m.slug === id);
    if (!mod) return res.status(404).json({ error: 'Mod not found' });

    if (mod.authorId !== req.user.id && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Forbidden: You do not own this mod' });
    }

    if (!req.file && !req.body.fileContentBase64) {
      return res.status(400).json({ error: 'Mod binary or source archive file is required' });
    }

    let buffer;
    let filename;
    if (req.file) {
      buffer = req.file.buffer;
      filename = req.file.originalname;
    } else {
      buffer = Buffer.from(req.body.fileContentBase64, 'base64');
      filename = req.body.filename || `${mod.slug}-${version}.${mod.kind === 'native' ? 'hnmod' : 'hmod'}`;
    }

    const stored = saveFile(`mods/${mod.id}`, filename, buffer);

    const modVersion = db.insert('mod_versions', {
      id: crypto.randomUUID(),
      modId: mod.id,
      version: version || '1.0.0',
      changelog: changelog || 'Initial release',
      gameVersion: gameVersion || '1.21.1',
      filename: stored.filename,
      filePath: stored.relPath,
      fileSize: stored.size,
      sha256: stored.sha256,
      isSourceBuildRequired: Boolean(isSourceBuildRequired),
      dependencies: dependencies ? (typeof dependencies === 'string' ? JSON.parse(dependencies) : dependencies) : []
    });

    res.status(201).json(modVersion);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function downloadVersion(req, res) {
  try {
    const { versionId } = req.params;
    const version = db.findOne('mod_versions', v => v.id === versionId);
    if (!version) return res.status(404).json({ error: 'Version not found' });

    const fullPath = getFilePath(version.filePath);
    if (!fullPath) return res.status(404).json({ error: 'Binary file missing from storage' });

    // Track download
    db.update('mods', m => m.id === version.modId, {
      downloads: ((db.findOne('mods', m => m.id === version.modId)?.downloads) || 0) + 1
    });

    res.setHeader('Content-Disposition', `attachment; filename="${version.filename}"`);
    res.setHeader('X-SHA256', version.sha256);
    res.sendFile(fullPath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function deleteMod(req, res) {
  try {
    const { id } = req.params;
    const mod = db.findOne('mods', m => m.id === id || m.slug === id);
    if (!mod) {
      return res.status(404).json({ error: 'Mod not found' });
    }

    if (req.user.role !== 'Admin' && mod.authorId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to delete this mod' });
    }

    // Delete associated versions and storage files
    const versions = db.find('mod_versions', v => v.modId === mod.id);
    for (const v of versions) {
      const fullPath = getFilePath(v.filePath);
      if (fullPath && fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch (e) {}
      }
    }
    db.delete('mod_versions', v => v.modId === mod.id);

    // Delete the mod record
    db.delete('mods', m => m.id === mod.id);

    res.json({ message: `Mod "${mod.name}" deleted successfully`, id: mod.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listMods,
  getMod,
  createMod,
  uploadVersion,
  downloadVersion,
  deleteMod,
};

