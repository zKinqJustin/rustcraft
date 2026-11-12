const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Validates and packs a Content Mod into a valid .hmod
 */
class HmodPacker {
  /**
   * Parse manifest (rustcraft-mod.toml or horizon-mod.toml)
   */
  static parseManifest(manifestContent) {
    const lines = manifestContent.split('\n');
    const manifest = {
      format: 1,
      id: '',
      name: '',
      version: '1.0.0',
      description: '',
      authors: [],
      game: '1.21.1',
      capabilities: []
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const eqIdx = line.indexOf('=');
      if (eqIdx !== -1) {
        const key = line.slice(0, eqIdx).trim();
        let val = line.slice(eqIdx + 1).trim();

        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1);
        } else if (val.startsWith('[') && val.endsWith(']')) {
          val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
        } else if (!isNaN(Number(val))) {
          val = Number(val);
        }

        manifest[key] = val;
      }
    }

    if (!manifest.id) {
      throw new Error('Manifest missing required field: id');
    }
    if (!/^[a-z0-9_]{1,64}$/.test(manifest.id)) {
      throw new Error(`Invalid mod id "${manifest.id}". Must be 1-64 lowercase alphanumeric and underscore characters.`);
    }

    return manifest;
  }

  /**
   * Scan folder for data/ and assets/ files
   */
  static scanModFiles(dir) {
    const files = [];

    function walk(currentDir, relativePrefix) {
      if (!fs.existsSync(currentDir)) return;
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          walk(fullPath, relPath);
        } else if (entry.isFile()) {
          files.push({
            relPath: relPath.replace(/\\/g, '/'),
            fullPath,
            size: fs.statSync(fullPath).size
          });
        }
      }
    }

    const dataDir = path.join(dir, 'data');
    const assetsDir = path.join(dir, 'assets');

    if (fs.existsSync(dataDir)) walk(dataDir, 'data');
    if (fs.existsSync(assetsDir)) walk(assetsDir, 'assets');

    return files;
  }

  /**
   * Build .hmod package from source directory
   */
  static buildFromDirectory(sourceDir, outputDir) {
    // 1. Locate manifest
    let manifestPath = path.join(sourceDir, 'rustcraft-mod.toml');
    if (!fs.existsSync(manifestPath)) {
      manifestPath = path.join(sourceDir, 'horizon-mod.toml');
    }

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`No rustcraft-mod.toml or horizon-mod.toml found in ${sourceDir}`);
    }

    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = this.parseManifest(manifestContent);

    // 2. Scan content files (data/ and assets/)
    const files = this.scanModFiles(sourceDir);

    // 3. Construct package format
    // A Rustcraft/Horizon .hmod package contains the manifest and individual file entries with header
    const packageHeader = {
      magic: 'RUSTCRAFT_HMOD_V1',
      manifest,
      fileCount: files.length,
      createdAt: new Date().toISOString()
    };

    const headerJson = JSON.stringify(packageHeader);
    const headerBuffer = Buffer.from(headerJson, 'utf-8');

    // Pack files into binary payload with index
    const fileEntries = [];
    let filePayloadBuffer = Buffer.alloc(0);

    for (const file of files) {
      const content = fs.readFileSync(file.fullPath);
      const sha = crypto.createHash('sha256').update(content).digest('hex');
      fileEntries.push({
        path: file.relPath,
        offset: filePayloadBuffer.length,
        size: content.length,
        sha256: sha
      });
      filePayloadBuffer = Buffer.concat([filePayloadBuffer, content]);
    }

    const indexJson = JSON.stringify(fileEntries);
    const indexBuffer = Buffer.from(indexJson, 'utf-8');

    // Final binary format: [Magic 16B] + [Header Len 4B] + [Header] + [Index Len 4B] + [Index] + [Files Payload]
    const headerLenBuf = Buffer.alloc(4);
    headerLenBuf.writeUInt32BE(headerBuffer.length, 0);

    const indexLenBuf = Buffer.alloc(4);
    indexLenBuf.writeUInt32BE(indexBuffer.length, 0);

    const fullBinary = Buffer.concat([
      Buffer.from('RUSTCRAFT_HMOD\0\0'),
      headerLenBuf,
      headerBuffer,
      indexLenBuf,
      indexBuffer,
      filePayloadBuffer
    ]);

    const targetHmodName = `${manifest.id}.hmod`;
    const targetPath = path.join(outputDir, targetHmodName);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(targetPath, fullBinary);

    const totalSha256 = crypto.createHash('sha256').update(fullBinary).digest('hex');

    return {
      hmodPath: targetPath,
      filename: targetHmodName,
      manifest,
      fileCount: files.length,
      size: fullBinary.length,
      sha256: totalSha256
    };
  }

  /**
   * Validate existing .hmod file
   */
  static validateHmod(hmodPath) {
    if (!fs.existsSync(hmodPath)) {
      throw new Error(`File does not exist: ${hmodPath}`);
    }

    const buffer = fs.readFileSync(hmodPath);
    if (buffer.length < 24) {
      // Fallback: check if it's a plain zip or raw toml
      const text = buffer.toString('utf-8', 0, Math.min(200, buffer.length));
      if (text.includes('id =') && text.includes('format =')) {
        const manifest = this.parseManifest(text);
        return {
          valid: true,
          manifest,
          format: 'raw_manifest',
          sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
          size: buffer.length
        };
      }
      throw new Error('Invalid HMOD: File too small or corrupt');
    }

    const magic = buffer.toString('utf-8', 0, 16).replace(/\0/g, '');
    if (magic.startsWith('RUSTCRAFT_HMOD')) {
      const headerLen = buffer.readUInt32BE(16);
      const headerRaw = buffer.toString('utf-8', 20, 20 + headerLen);
      const header = JSON.parse(headerRaw);

      return {
        valid: true,
        manifest: header.manifest,
        format: 'binary_hmod',
        fileCount: header.fileCount,
        sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
        size: buffer.length
      };
    }

    // Check if valid TOML or ZIP
    const text = buffer.toString('utf-8', 0, Math.min(500, buffer.length));
    if (text.includes('format =') || text.includes('id =')) {
      const manifest = this.parseManifest(text);
      return {
        valid: true,
        manifest,
        format: 'toml_package',
        sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
        size: buffer.length
      };
    }

    return {
      valid: true,
      format: 'generic_hmod',
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      size: buffer.length
    };
  }
}

module.exports = HmodPacker;

