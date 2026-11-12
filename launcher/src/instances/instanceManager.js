const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const RustcraftModBuildSystem = require('../builder/modBuildSystem');

/**
 * Manages isolated game instances for Rustcraft Launcher
 */
class InstanceManager {
  constructor(dataDir) {
    this.dataDir = dataDir || path.join(__dirname, '../../../data/instances');
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    this.modBuildSystem = new RustcraftModBuildSystem();
  }

  /**
   * List all instances
   */
  listInstances() {
    const entries = fs.readdirSync(this.dataDir, { withFileTypes: true });
    const instances = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const configPath = path.join(this.dataDir, entry.name, 'instance.json');
        if (fs.existsSync(configPath)) {
          try {
            const raw = fs.readFileSync(configPath, 'utf-8');
            const parsed = JSON.parse(raw);
            // Enriched with installed mods count
            const mods = this.getMods(parsed.id);
            instances.push({
              ...parsed,
              modCount: mods.length,
              enabledModCount: mods.filter(m => m.enabled).length
            });
          } catch (e) {
            console.error(`Failed to read instance config: ${configPath}`, e);
          }
        }
      }
    }

    return instances;
  }

  /**
   * Get specific instance
   */
  getInstance(id) {
    const configPath = path.join(this.dataDir, id, 'instance.json');
    if (!fs.existsSync(configPath)) return null;
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    parsed.mods = this.getMods(id);
    return parsed;
  }

  /**
   * Create new isolated instance
   */
  createInstance({ name, gameVersion, icon, memoryMinMb, memoryMaxMb, jvmArgs, modpackId }) {
    const id = (name || 'instance').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + crypto.randomBytes(3).toString('hex');
    const instanceDir = path.join(this.dataDir, id);

    fs.mkdirSync(instanceDir, { recursive: true });
    fs.mkdirSync(path.join(instanceDir, 'mods'), { recursive: true });
    fs.mkdirSync(path.join(instanceDir, 'saves'), { recursive: true });
    fs.mkdirSync(path.join(instanceDir, 'config'), { recursive: true });
    fs.mkdirSync(path.join(instanceDir, 'logs'), { recursive: true });

    const config = {
      id,
      name: name || 'New Instance',
      gameVersion: gameVersion || '1.21.1',
      icon: icon || 'Box',
      memoryMinMb: memoryMinMb || 2048,
      memoryMaxMb: memoryMaxMb || 4096,
      jvmArgs: jvmArgs || '-XX:+UseG1GC -Dsun.rmi.dgc.server.gcInterval=2147483646',
      gameArgs: '',
      playTimeMinutes: 0,
      lastPlayed: null,
      modpackId: modpackId || null,
      createdAt: new Date().toISOString()
    };

    fs.writeFileSync(path.join(instanceDir, 'instance.json'), JSON.stringify(config, null, 2), 'utf-8');
    fs.writeFileSync(path.join(instanceDir, 'rustcraft-mods.txt'), '', 'utf-8');

    return config;
  }

  /**
   * Delete instance and its isolated files
   */
  deleteInstance(id) {
    const instanceDir = path.join(this.dataDir, id);
    if (fs.existsSync(instanceDir)) {
      fs.rmSync(instanceDir, { recursive: true, force: true });
      return true;
    }
    return false;
  }

  /**
   * Duplicate an instance safely
   */
  duplicateInstance(id, newName) {
    const original = this.getInstance(id);
    if (!original) throw new Error(`Instance not found: ${id}`);

    const newInstance = this.createInstance({
      name: newName || `${original.name} (Copy)`,
      gameVersion: original.gameVersion,
      icon: original.icon,
      memoryMinMb: original.memoryMinMb,
      memoryMaxMb: original.memoryMaxMb,
      jvmArgs: original.jvmArgs
    });

    // Copy mods
    const originalModsDir = path.join(this.dataDir, id, 'mods');
    const targetModsDir = path.join(this.dataDir, newInstance.id, 'mods');
    if (fs.existsSync(originalModsDir)) {
      const files = fs.readdirSync(originalModsDir);
      for (const file of files) {
        fs.copyFileSync(path.join(originalModsDir, file), path.join(targetModsDir, file));
      }
    }

    // Copy mod list
    const originalList = path.join(this.dataDir, id, 'rustcraft-mods.txt');
    if (fs.existsSync(originalList)) {
      fs.copyFileSync(originalList, path.join(this.dataDir, newInstance.id, 'rustcraft-mods.txt'));
    }

    return this.getInstance(newInstance.id);
  }

  /**
   * List mods in an instance
   */
  getMods(instanceId) {
    const modsDir = path.join(this.dataDir, instanceId, 'mods');
    if (!fs.existsSync(modsDir)) return [];

    const listPath = path.join(this.dataDir, instanceId, 'rustcraft-mods.txt');
    const enabledList = fs.existsSync(listPath) 
      ? fs.readFileSync(listPath, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean)
      : [];

    const files = fs.readdirSync(modsDir);
    const mods = [];

    for (const file of files) {
      if (file.endsWith('.hmod') || file.endsWith('.hnmod') || file.endsWith('.disabled')) {
        const fullPath = path.join(modsDir, file);
        const stat = fs.statSync(fullPath);
        const isActuallyDisabled = file.endsWith('.disabled');
        const activeName = isActuallyDisabled ? file.replace('.disabled', '') : file;
        const isEnabled = !isActuallyDisabled && (enabledList.length === 0 || enabledList.includes(activeName));

        mods.push({
          filename: file,
          activeName,
          kind: file.includes('.hnmod') ? 'native' : 'content',
          enabled: isEnabled,
          size: stat.size,
          lastModified: stat.mtime
        });
      }
    }

    return mods;
  }

  /**
   * Toggle mod state (enable/disable)
   */
  toggleMod(instanceId, filename, enable) {
    const modsDir = path.join(this.dataDir, instanceId, 'mods');
    const currentPath = path.join(modsDir, filename);
    if (!fs.existsSync(currentPath)) throw new Error(`Mod file not found: ${filename}`);

    const listPath = path.join(this.dataDir, instanceId, 'rustcraft-mods.txt');
    let enabledList = fs.existsSync(listPath) 
      ? fs.readFileSync(listPath, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean)
      : [];

    let targetFilename = filename;
    if (enable && filename.endsWith('.disabled')) {
      targetFilename = filename.replace('.disabled', '');
      fs.renameSync(currentPath, path.join(modsDir, targetFilename));
      if (!enabledList.includes(targetFilename)) enabledList.push(targetFilename);
    } else if (!enable && !filename.endsWith('.disabled')) {
      targetFilename = `${filename}.disabled`;
      fs.renameSync(currentPath, path.join(modsDir, targetFilename));
      enabledList = enabledList.filter(f => f !== filename);
    }

    fs.writeFileSync(listPath, enabledList.join('\n') + '\n', 'utf-8');
    return { filename: targetFilename, enabled: enable };
  }

  /**
   * Remove mod from instance
   */
  removeMod(instanceId, filename) {
    const modsDir = path.join(this.dataDir, instanceId, 'mods');
    const fullPath = path.join(modsDir, filename);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    const listPath = path.join(this.dataDir, instanceId, 'rustcraft-mods.txt');
    if (fs.existsSync(listPath)) {
      const activeName = filename.replace('.disabled', '');
      const list = fs.readFileSync(listPath, 'utf-8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && l !== filename && l !== activeName);
      fs.writeFileSync(listPath, list.join('\n') + '\n', 'utf-8');
    }
    return true;
  }

  /**
   * Install mod into instance via Mod Build System
   */
  async installModIntoInstance(instanceId, { sourcePathOrBuffer, filename, expectedSha256, onProgress }) {
    const instanceDir = path.join(this.dataDir, instanceId);
    if (!fs.existsSync(instanceDir)) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    return await this.modBuildSystem.installMod({
      sourcePathOrBuffer,
      filename,
      targetInstanceDir: instanceDir,
      expectedSha256,
      onProgress
    });
  }

  /**
   * Launch Game simulation / process controller
   */
  launchInstance(instanceId, onLog) {
    const instance = this.getInstance(instanceId);
    if (!instance) throw new Error(`Instance not found: ${instanceId}`);

    const log = (msg) => {
      const line = `[${new Date().toISOString()}] ${msg}`;
      if (typeof onLog === 'function') onLog(line);
      const logFile = path.join(this.dataDir, instanceId, 'logs', 'latest.log');
      fs.appendFileSync(logFile, line + '\n', 'utf-8');
    };

    log(`Starting Rustcraft client for instance "${instance.name}" (ID: ${instance.id})`);
    log(`Allocated RAM: ${instance.memoryMinMb}MB min / ${instance.memoryMaxMb}MB max`);
    log(`Configured JVM/Engine arguments: ${instance.jvmArgs}`);
    log(`Game Version: ${instance.gameVersion}`);

    const mods = this.getMods(instanceId).filter(m => m.enabled);
    log(`Mounting ${mods.length} enabled mods:`);
    for (const mod of mods) {
      log(` - [${mod.kind.toUpperCase()}] ${mod.activeName} (${Math.round(mod.size / 1024)} KB)`);
    }

    log(`Initializing Horizon engine sub-systems: wgpu, input, world-loader, audio...`);
    log(`Rustcraft Client started successfully with PID ${Math.floor(1000 + Math.random() * 9000)}.`);

    // Update instance stats
    const configPath = path.join(this.dataDir, instanceId, 'instance.json');
    const updated = {
      ...instance,
      lastPlayed: new Date().toISOString(),
      playTimeMinutes: (instance.playTimeMinutes || 0) + 15
    };
    fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf-8');

    return {
      status: 'running',
      instanceId,
      startTime: new Date().toISOString()
    };
  }
}

module.exports = InstanceManager;
