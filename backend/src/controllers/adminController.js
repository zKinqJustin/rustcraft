const db = require('../services/db');
const { getFilePath, deleteFile } = require('../services/storage');
const fs = require('fs');

/**
 * Get all submissions for Admin moderation
 */
async function getSubmissions(req, res) {
  try {
    const allMods = db.find('mods', m => !m.deleted);
    const allPacks = db.find('modpacks', p => !p.deleted);
    const users = db.find('users', () => true);

    const pendingMods = allMods.filter(m => m.status === 'pending');
    const pendingModpacks = allPacks.filter(p => p.status === 'pending');
    const approvedMods = allMods.filter(m => m.status === 'approved' || !m.status);
    const approvedModpacks = allPacks.filter(p => p.status === 'approved' || !p.status);
    const rejectedItems = [
      ...allMods.filter(m => m.status === 'rejected').map(m => ({ ...m, itemType: 'mod' })),
      ...allPacks.filter(p => p.status === 'rejected').map(p => ({ ...p, itemType: 'modpack' }))
    ];

    // Enrich with author and versions
    const enrich = (item, isModpack = false) => {
      const author = users.find(u => u.id === item.authorId);
      const versions = isModpack 
        ? db.find('modpack_versions', v => v.modpackId === item.id)
        : db.find('mod_versions', v => v.modId === item.id);
      const latest = versions[versions.length - 1];
      return {
        ...item,
        author: author ? { username: author.username, role: author.role } : { username: 'Unbekannt' },
        latestVersion: latest ? latest.version : '1.0.0',
        fileSize: latest ? latest.fileSize : 0,
        filename: latest ? (latest.filename || `${item.slug}-${latest.version}`) : '',
        itemType: isModpack ? 'modpack' : 'mod'
      };
    };

    res.json({
      stats: {
        totalMods: allMods.length,
        totalModpacks: allPacks.length,
        pendingCount: pendingMods.length + pendingModpacks.length,
        approvedCount: approvedMods.length + approvedModpacks.length,
        userCount: users.length
      },
      pending: [
        ...pendingMods.map(m => enrich(m, false)),
        ...pendingModpacks.map(p => enrich(p, true))
      ],
      approved: [
        ...approvedMods.map(m => enrich(m, false)),
        ...approvedModpacks.map(p => enrich(p, true))
      ],
      rejected: rejectedItems
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Review a submission (approve or reject)
 */
async function reviewSubmission(req, res) {
  try {
    const { type, id } = req.params;
    const { action, reason } = req.body; // action: 'approve' | 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approve or reject' });
    }

    const table = type === 'modpack' ? 'modpacks' : 'mods';
    const item = db.findOne(table, i => i.id === id || i.slug === id);
    if (!item) return res.status(404).json({ error: `${type} not found` });

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    db.update(table, i => i.id === item.id, {
      status: newStatus,
      reviewedBy: req.user.id,
      reviewedAt: new Date().toISOString(),
      rejectionReason: action === 'reject' ? (reason || 'Entspricht nicht den Qualitätskriterien') : null
    });

    res.json({
      success: true,
      message: `${type === 'modpack' ? 'Modpack' : 'Mod'} "${item.name}" wurde ${action === 'approve' ? 'erfolgreich freigegeben' : 'abgelehnt'}!`,
      status: newStatus
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Delete an item permanently as admin
 */
async function deleteItem(req, res) {
  try {
    const { type, id } = req.params;
    const table = type === 'modpack' ? 'modpacks' : 'mods';
    const item = db.findOne(table, i => i.id === id || i.slug === id);
    if (!item) return res.status(404).json({ error: `${type} not found` });

    if (type === 'mod') {
      const versions = db.find('mod_versions', v => v.modId === item.id);
      for (const v of versions) {
        if (v.filePath) {
          try { deleteFile(v.filePath); } catch (_) {}
        }
      }
      db.delete('mod_versions', v => v.modId === item.id);
    } else {
      const versions = db.find('modpack_versions', v => v.modpackId === item.id);
      for (const v of versions) {
        if (v.filePath) {
          try { deleteFile(v.filePath); } catch (_) {}
        }
      }
      db.delete('modpack_versions', v => v.modpackId === item.id);
    }

    db.delete(table, i => i.id === item.id);

    res.json({
      success: true,
      message: `${type === 'modpack' ? 'Modpack' : 'Mod'} "${item.name}" wurde dauerhaft gelöscht.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getSubmissions,
  reviewSubmission,
  deleteItem
};
