const crypto = require('crypto');
const path = require('path');
const db = require('../services/db');
const { saveFile, getFilePath } = require('../services/storage');

async function listModpacks(req, res) {
  try {
    const { query, category, gameVersion, sort } = req.query;
    let packs = db.find('modpacks', p => !p.deleted);

    if (query) {
      const q = query.toLowerCase();
      packs = packs.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.summary.toLowerCase().includes(q)
      );
    }

    if (category) {
      packs = packs.filter(p => p.categories && p.categories.includes(category));
    }

    if (gameVersion) {
      packs = packs.filter(p => p.gameVersion === gameVersion);
    }

    const enriched = packs.map(p => {
      const versions = db.find('modpack_versions', v => v.modpackId === p.id);
      const latest = versions.length > 0 ? versions[versions.length - 1] : null;
      return {
        ...p,
        latestVersion: latest ? latest.version : '1.0.0',
        versionCount: versions.length,
        modCount: latest && latest.mods ? latest.mods.length : 0
      };
    });

    if (sort === 'newest') {
      enriched.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else {
      enriched.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    }

    res.json({ modpacks: enriched, total: enriched.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getModpack(req, res) {
  try {
    const { id } = req.params;
    const pack = db.findOne('modpacks', p => p.id === id || p.slug === id);
    if (!pack) return res.status(404).json({ error: 'Modpack not found' });

    const versions = db.find('modpack_versions', v => v.modpackId === pack.id);
    const author = db.findOne('users', u => u.id === pack.authorId);

    res.json({
      ...pack,
      author: author ? { id: author.id, username: author.username, avatarUrl: author.avatarUrl } : null,
      versions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createModpack(req, res) {
  try {
    const { name, slug, summary, description, gameVersion, categories, iconUrl } = req.body;
    if (!name || !summary) {
      return res.status(400).json({ error: 'Name and summary are required' });
    }

    const calculatedSlug = (slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const existing = db.findOne('modpacks', p => p.slug === calculatedSlug);
    if (existing) {
      return res.status(409).json({ error: 'Modpack with this slug already exists' });
    }

    const modpack = db.insert('modpacks', {
      id: crypto.randomUUID(),
      name,
      slug: calculatedSlug,
      summary,
      description: description || summary,
      gameVersion: gameVersion || '1.21.1',
      categories: Array.isArray(categories) ? categories : ['adventure'],
      authorId: req.user.id,
      downloads: 0,
      likes: 0,
      iconUrl: iconUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name)}`,
      screenshots: [],
      license: 'MIT'
    });

    res.status(201).json(modpack);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function uploadModpackVersion(req, res) {
  try {
    const { id } = req.params;
    const { version, changelog, gameVersion, mods } = req.body;
    const pack = db.findOne('modpacks', p => p.id === id || p.slug === id);
    if (!pack) return res.status(404).json({ error: 'Modpack not found' });

    if (pack.authorId !== req.user.id && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Forbidden: You do not own this modpack' });
    }

    const parsedMods = typeof mods === 'string' ? JSON.parse(mods) : (mods || []);

    // Generate horizon-modpack.toml representation
    const manifestToml = [
      `format = 1`,
      `id = "${pack.slug}"`,
      `name = "${pack.name}"`,
      `version = "${version || '1.0.0'}"`,
      `description = "${pack.summary.replace(/"/g, '\\"')}"`,
      `game = "${gameVersion || pack.gameVersion || '1.21.1'}"`,
      `authors = ["${req.user.username}"]`,
      ``,
      ...parsedMods.map(m => `[[mods]]\nid = "${m.id}"\nversion = "${m.version || '1.0.0'}"\nsha256 = "${m.sha256 || 'verified'}"\non = ${m.on !== false}\n`)
    ].join('\n');

    const manifestBuffer = Buffer.from(manifestToml, 'utf-8');
    const stored = saveFile(`modpacks/${pack.id}`, `${pack.slug}-${version}.hpack.toml`, manifestBuffer);

    const modpackVersion = db.insert('modpack_versions', {
      id: crypto.randomUUID(),
      modpackId: pack.id,
      version: version || '1.0.0',
      changelog: changelog || 'Initial pack release',
      gameVersion: gameVersion || pack.gameVersion || '1.21.1',
      mods: parsedMods,
      manifestToml,
      filePath: stored.relPath,
      fileSize: stored.size,
      sha256: stored.sha256
    });

    res.status(201).json(modpackVersion);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function downloadModpack(req, res) {
  try {
    const { versionId } = req.params;
    const version = db.findOne('modpack_versions', v => v.id === versionId);
    if (!version) return res.status(404).json({ error: 'Modpack version not found' });

    const pack = db.findOne('modpacks', p => p.id === version.modpackId);
    if (pack) {
      db.update('modpacks', p => p.id === pack.id, { downloads: (pack.downloads || 0) + 1 });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${pack ? pack.slug : 'pack'}-${version.version}.hpack.toml"`);
    res.setHeader('X-SHA256', version.sha256);
    res.send(version.manifestToml);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listModpacks,
  getModpack,
  createModpack,
  uploadModpackVersion,
  downloadModpack
};
