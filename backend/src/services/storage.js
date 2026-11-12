const fs = require('fs');
const path = require('path');
const { sha256, sanitizeFileName } = require('./security');

const STORAGE_ROOT = path.join(__dirname, '../../data/storage');

if (!fs.existsSync(STORAGE_ROOT)) {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

/**
 * Save file buffer into storage directory, returns metadata with SHA-256
 */
function saveFile(subfolder, filename, buffer) {
  const safeDir = path.join(STORAGE_ROOT, sanitizeFileName(subfolder));
  if (!fs.existsSync(safeDir)) {
    fs.mkdirSync(safeDir, { recursive: true });
  }

  const safeName = sanitizeFileName(filename);
  const targetPath = path.join(safeDir, safeName);
  
  // Atomic write
  const tempPath = `${targetPath}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, buffer);
  fs.renameSync(tempPath, targetPath);

  const hash = sha256(buffer);
  const size = buffer.length;

  return {
    filename: safeName,
    relPath: path.relative(STORAGE_ROOT, targetPath).replace(/\\/g, '/'),
    fullPath: targetPath,
    sha256: hash,
    size: size
  };
}

/**
 * Read file buffer from storage
 */
function readFile(relPath) {
  const safeRel = sanitizeFileName(relPath.split('/').join(path.sep));
  const fullPath = path.join(STORAGE_ROOT, safeRel);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath);
}

/**
 * Get full file path
 */
function getFilePath(relPath) {
  const normalized = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
  const fullPath = path.join(STORAGE_ROOT, normalized);
  if (fs.existsSync(fullPath)) {
    return fullPath;
  }
  return null;
}

module.exports = {
  STORAGE_ROOT,
  saveFile,
  readFile,
  getFilePath
};
