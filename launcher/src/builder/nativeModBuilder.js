const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Validates and isolates Native Mods (.hnmod)
 */
class NativeModBuilder {
  /**
   * Parse horizon-mixin.toml or rustcraft-mixin.toml
   */
  static parseNativeManifest(content) {
    const manifest = {
      id: '',
      name: '',
      version: '1.0.0',
      horizon_revision: 'latest',
      traits: []
    };

    const lines = content.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      if (line.includes('id =')) {
        manifest.id = line.split('=')[1].trim().replace(/["']/g, '');
      } else if (line.includes('name =')) {
        manifest.name = line.split('=')[1].trim().replace(/["']/g, '');
      } else if (line.includes('horizon_revision =')) {
        manifest.horizon_revision = line.split('=')[1].trim().replace(/["']/g, '');
      }
    }

    if (!manifest.id) {
      manifest.id = 'native_mod';
    }

    return manifest;
  }

  /**
   * Inspect and validate native source or .hnmod package
   */
  static inspectNativePackage(filePathOrDir) {
    if (!fs.existsSync(filePathOrDir)) {
      throw new Error(`Native mod path not found: ${filePathOrDir}`);
    }

    const stat = fs.statSync(filePathOrDir);

    if (stat.isDirectory()) {
      // Source directory
      const mixinToml = path.join(filePathOrDir, 'horizon-mixin.toml');
      const apiCargo = path.join(filePathOrDir, 'api', 'Cargo.toml');

      if (!fs.existsSync(mixinToml) && !fs.existsSync(apiCargo)) {
        throw new Error('Native mod directory must contain horizon-mixin.toml or api/Cargo.toml');
      }

      const content = fs.existsSync(mixinToml) ? fs.readFileSync(mixinToml, 'utf-8') : '';
      const manifest = this.parseNativeManifest(content);

      return {
        type: 'native_source',
        manifest,
        requiresCargo: true,
        isolated: true
      };
    } else {
      // Compiled .hnmod package
      const buffer = fs.readFileSync(filePathOrDir);
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

      return {
        type: 'compiled_hnmod',
        size: buffer.length,
        sha256,
        isolated: true
      };
    }
  }
}

module.exports = NativeModBuilder;

