const crypto = require('crypto');
const path = require('path');
const db = require('../services/db');
const { saveFile, getFilePath } = require('../services/storage');

async function listModpacks(req, res) {
  try {
    const { query, category, gameVersion, sort, includePending } = req.query;
    let packs = db.find('modpacks', p => !p.deleted);

    // Only show approved items in public catalog unless explicitly requested by admin
    if (!includePending) {
      packs = packs.filter(p => p.status === 'approved' || !p.status);
    }

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

    const status = (req.user && req.user.role === 'Admin') ? 'approved' : 'pending';

    const modpack = db.insert('modpacks', {
      id: crypto.randomUUID(),
      name,
      slug: calculatedSlug,
      summary,
      description: description || summary,
      gameVersion: gameVersion || '26.3',
      categories: Array.isArray(categories) ? categories : ['adventure'],
      authorId: req.user.id,
      downloads: 0,
      likes: 0,
      iconUrl: iconUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name)}`,
      screenshots: [],
      license: 'MIT',
      status,
      createdAt: new Date().toISOString()
    });

    res.status(201).json(modpack);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Publish a full Modpack directly from Modpack Studio (Pack Metadata + Mod list in one call)
 */
async function publishStudioPack(req, res) {
  try {
    const { name, slug, summary, description, gameVersion, categories, mods, version } = req.body;
    if (!name || !summary) {
      return res.status(400).json({ error: 'Modpack Name and Summary are required' });
    }

    const calculatedSlug = (slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    let modpack = db.findOne('modpacks', p => p.slug === calculatedSlug);

    const status = (req.user && req.user.role === 'Admin') ? 'approved' : 'pending';
    const packVersion = version || '1.0.0';
    const parsedMods = Array.isArray(mods) ? mods : [];

    if (!modpack) {
      modpack = db.insert('modpacks', {
        id: crypto.randomUUID(),
        name,
        slug: calculatedSlug,
        summary,
        description: description || summary,
        gameVersion: gameVersion || '26.3',
        categories: Array.isArray(categories) ? categories : ['adventure'],
        authorId: req.user.id,
        downloads: 0,
        likes: 0,
        iconUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name)}`,
        screenshots: [],
        license: 'MIT',
        status,
        createdAt: new Date().toISOString()
      });
    } else {
      db.update('modpacks', p => p.id === modpack.id, {
        name,
        summary,
        description: description || summary,
        status,
        updatedAt: new Date().toISOString()
      });
    }

    // Generate horizon-modpack.toml representation
    const manifestToml = [
      `format = 1`,
      `id = "${modpack.slug}"`,
      `name = "${modpack.name}"`,
      `version = "${packVersion}"`,
      `description = "${modpack.summary.replace(/"/g, '\\"')}"`,
      `game = "${gameVersion || '26.3'}"`,
      `authors = ["${req.user.username}"]`,
      ``,
      ...parsedMods.map(m => `[[mods]]\nid = "${m.slug || m.id}"\nversion = "${m.version || '1.0.0'}"\nname = "${m.name || m.slug || m.id}"\non = true\n`)
    ].join('\n');

    const manifestBuffer = Buffer.from(manifestToml, 'utf-8');
    const stored = saveFile(`modpacks/${modpack.id}`, `${modpack.slug}-${packVersion}.hpack.toml`, manifestBuffer);

    const modpackVersion = db.insert('modpack_versions', {
      id: crypto.randomUUID(),
      modpackId: modpack.id,
      version: packVersion,
      changelog: 'Published via Rustcraft Modpack Studio',
      gameVersion: gameVersion || '26.3',
      mods: parsedMods,
      manifestToml,
      filePath: stored.relPath,
      fileSize: stored.size,
      sha256: stored.sha256,
      createdAt: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      modpack,
      version: modpackVersion,
      status,
      message: status === 'approved' 
        ? `Modpack "${modpack.name}" wurde direkt freigegeben und ist im Katalog verfügbar!`
        : `Modpack "${modpack.name}" wurde eingereicht und wartet auf Admin-Prüfung.`
    });
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

    const manifestToml = [
      `format = 1`,
      `id = "${pack.slug}"`,
      `name = "${pack.name}"`,
      `version = "${version || '1.0.0'}"`,
      `description = "${pack.summary.replace(/"/g, '\\"')}"`,
      `game = "${gameVersion || pack.gameVersion || '26.3'}"`,
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
      changelog: changelog || 'Pack release update',
      gameVersion: gameVersion || pack.gameVersion || '26.3',
      mods: parsedMods,
      manifestToml,
      filePath: stored.relPath,
      fileSize: stored.size,
      sha256: stored.sha256,
      createdAt: new Date().toISOString()
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
  publishStudioPack,
  uploadModpackVersion,
  downloadModpack
};
