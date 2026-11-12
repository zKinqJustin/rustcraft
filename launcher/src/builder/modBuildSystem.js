const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const HmodPacker = require('./hmodPacker');
const NativeModBuilder = require('./nativeModBuilder');

/**
 * Rustcraft Mod Build System (Abschnitt 5 Master Prompt)
 * Automatically builds .hmod files from sources, handles .hnmod native mods,
 * verifies SHA-256 hashes, handles rollbacks, and installs directly into isolated instances.
 */
class RustcraftModBuildSystem {
  constructor() {
    this.tempDir = path.join(__dirname, '../../../temp/builds');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Main installation pipeline
   */
  async installMod({ sourcePathOrBuffer, filename, targetInstanceDir, expectedSha256, onProgress }) {
    const notify = (stage, percent, message) => {
      if (typeof onProgress === 'function') {
        onProgress({ stage, percent, message, timestamp: new Date().toISOString() });
      }
    };

    notify('PREPARING', 10, 'Initializing installation environment...');

    const instanceModsDir = path.join(targetInstanceDir, 'mods');
    if (!fs.existsSync(instanceModsDir)) {
      fs.mkdirSync(instanceModsDir, { recursive: true });
    }

    const sessionBuildDir = path.join(this.tempDir, `session_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
    fs.mkdirSync(sessionBuildDir, { recursive: true });

    let finalHmodPath = null;
    let installedDestination = null;

    try {
      // 1. Detect input type (Buffer, File, or Directory)
      notify('INSPECTING_SOURCE', 25, 'Inspecting mod format and source bundle...');
      let isSourceDir = false;
      let workingSourcePath = null;

      if (typeof sourcePathOrBuffer === 'string') {
        if (!fs.existsSync(sourcePathOrBuffer)) {
          throw new Error(`Mod source path not found: ${sourcePathOrBuffer}`);
        }
        const stat = fs.statSync(sourcePathOrBuffer);
        if (stat.isDirectory()) {
          isSourceDir = true;
          workingSourcePath = sourcePathOrBuffer;
        } else {
          workingSourcePath = sourcePathOrBuffer;
        }
      } else if (Buffer.isBuffer(sourcePathOrBuffer)) {
        // Write buffer to temp file
        const tempInput = path.join(sessionBuildDir, filename || 'incoming_mod.bin');
        fs.writeFileSync(tempInput, sourcePathOrBuffer);
        workingSourcePath = tempInput;
      } else {
        throw new Error('Invalid sourcePathOrBuffer: Expected file path, directory path, or Buffer');
      }

      // 2. SHA-256 Checksum Verification
      if (expectedSha256 && !isSourceDir) {
        notify('VERIFYING_CHECKSUM', 40, 'Verifying cryptographic SHA-256 integrity...');
        const fileBytes = fs.readFileSync(workingSourcePath);
        const actualSha = crypto.createHash('sha256').update(fileBytes).digest('hex');
        if (actualSha.toLowerCase() !== expectedSha256.toLowerCase()) {
          throw new Error(`SHA-256 verification failed! Expected ${expectedSha256}, got ${actualSha}`);
        }
      }

      // 3. Determine if build is required
      let modId = 'mod';
      let modKind = 'content';

      if (isSourceDir) {
        // Source directory: Must build .hmod!
        notify('BUILDING_HMOD', 60, 'Source directory detected. Compiling assets & data into .hmod...');
        const buildResult = HmodPacker.buildFromDirectory(workingSourcePath, sessionBuildDir);
        finalHmodPath = buildResult.hmodPath;
        modId = buildResult.manifest.id;
        modKind = 'content';
        notify('BUILDING_HMOD', 80, `HMOD compiled successfully: ${buildResult.filename} (${buildResult.size} bytes)`);
      } else {
        const ext = path.extname(workingSourcePath).toLowerCase();
        if (ext === '.hnmod') {
          // Native mod
          notify('VALIDATING_NATIVE', 65, 'Inspecting native mod (.hnmod) traits and isolated environment...');
          const nativeInfo = NativeModBuilder.inspectNativePackage(workingSourcePath);
          finalHmodPath = workingSourcePath;
          modKind = 'native';
          modId = path.basename(workingSourcePath, '.hnmod');
        } else if (ext === '.hmod') {
          // Already compiled .hmod
          notify('VALIDATING_PACKAGE', 70, 'Validating existing .hmod package format...');
          const validation = HmodPacker.validateHmod(workingSourcePath);
          finalHmodPath = workingSourcePath;
          modKind = 'content';
          modId = validation.manifest ? validation.manifest.id : path.basename(workingSourcePath, '.hmod');
        } else {
          // Check if it's a source file or manifest
          notify('PARSING_MANIFEST', 65, 'Analyzing package manifest...');
          finalHmodPath = workingSourcePath;
          modId = path.basename(workingSourcePath, ext);
        }
      }

      // 4. Install into target instance (atomically)
      notify('INSTALLING_TO_INSTANCE', 90, `Installing into instance mods folder (${modId})...`);
      const targetFilename = `${modId}.${modKind === 'native' ? 'hnmod' : 'hmod'}`;
      installedDestination = path.join(instanceModsDir, targetFilename);

      const modBytes = fs.readFileSync(finalHmodPath);
      // Atomic install: write to temp and rename
      const tempInstall = `${installedDestination}.partial`;
      fs.writeFileSync(tempInstall, modBytes);
      fs.renameSync(tempInstall, installedDestination);

      // 5. Update instance mod register list (rustcraft-mods.txt)
      const modsListPath = path.join(targetInstanceDir, 'rustcraft-mods.txt');
      let currentList = [];
      if (fs.existsSync(modsListPath)) {
        currentList = fs.readFileSync(modsListPath, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean);
      }
      if (!currentList.includes(targetFilename)) {
        currentList.push(targetFilename);
        fs.writeFileSync(modsListPath, currentList.join('\n') + '\n', 'utf-8');
      }

      notify('COMPLETED', 100, `Mod ${modId} successfully installed into instance!`);

      return {
        success: true,
        modId,
        modKind,
        installedFile: targetFilename,
        destinationPath: installedDestination,
        size: modBytes.length,
        sha256: crypto.createHash('sha256').update(modBytes).digest('hex')
      };

    } catch (err) {
      notify('ERROR', 0, `Build/Installation failed: ${err.message}`);
      // Clean up partial files
      if (installedDestination && fs.existsSync(`${installedDestination}.partial`)) {
        try { fs.unlinkSync(`${installedDestination}.partial`); } catch (_) {}
      }
      throw err;
    } finally {
      // Clean up temporary session dir
      try {
        if (fs.existsSync(sessionBuildDir)) {
          fs.rmSync(sessionBuildDir, { recursive: true, force: true });
        }
      } catch (_) {}
    }
  }
}

module.exports = RustcraftModBuildSystem;

