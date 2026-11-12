const http = require('http');
const fs = require('fs');
const path = require('path');

/**
 * Handles deep links: rustcraft://install/mod/:id and rustcraft://install/modpack/:id
 */
class DeepLinkHandler {
  constructor(instanceManager, apiBaseUrl = 'http://localhost:4000/api/v1') {
    this.instanceManager = instanceManager;
    this.apiBaseUrl = apiBaseUrl;
  }

  /**
   * Helper to fetch JSON from API
   */
  async fetchJson(urlPath) {
    return new Promise((resolve, reject) => {
      const fullUrl = `${this.apiBaseUrl}${urlPath}`;
      http.get(fullUrl, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse API response: ${data}`));
          }
        });
      }).on('error', reject);
    });
  }

  /**
   * Helper to download binary buffer from API
   */
  async fetchBuffer(urlPath) {
    return new Promise((resolve, reject) => {
      const fullUrl = urlPath.startsWith('http') ? urlPath : `http://localhost:4000${urlPath}`;
      http.get(fullUrl, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    });
  }

  /**
   * Parse URI string (e.g. rustcraft://install/mod/glowing-amethysts?version=1.0.0)
   */
  parseUri(uriString) {
    if (!uriString.startsWith('rustcraft://')) {
      throw new Error(`Invalid Rustcraft URI protocol: ${uriString}`);
    }

    const withoutProtocol = uriString.replace('rustcraft://', '');
    const [routePath, queryString] = withoutProtocol.split('?');
    const segments = routePath.split('/').filter(Boolean);

    const query = {};
    if (queryString) {
      for (const pair of queryString.split('&')) {
        const [k, v] = pair.split('=');
        if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || '');
      }
    }

    return {
      action: segments[0], // 'install'
      type: segments[1],   // 'mod' or 'modpack'
      id: segments[2],     // slug or id
      query
    };
  }

  /**
   * Handle one-click installation request
   */
  async handleDeepLink(uriString, options = {}, onProgress) {
    const notify = (msg, percent = 0) => {
      if (typeof onProgress === 'function') onProgress({ message: msg, percent });
    };

    const parsed = this.parseUri(uriString);
    notify(`Connecting to Rustcraft API for ${parsed.type} "${parsed.id}"...`, 15);

    if (parsed.action !== 'install') {
      throw new Error(`Unsupported deep-link action: ${parsed.action}`);
    }

    // 1. Fetch Installation Payload from Backend API
    const versionQuery = parsed.query.version ? `?version=${parsed.query.version}` : '';
    const payload = await this.fetchJson(`/launcher/install/${parsed.type}/${parsed.id}${versionQuery}`);

    if (payload.error) {
      throw new Error(`API error: ${payload.error}`);
    }

    // 2. Process Modpack vs Single Mod
    if (payload.action === 'install_modpack') {
      notify(`Preparing new isolated instance for Modpack "${payload.target.name}"...`, 25);
      
      // Automatic instance creation for modpack
      const instance = this.instanceManager.createInstance({
        name: options.instanceName || payload.target.name,
        gameVersion: payload.target.gameVersion,
        icon: 'Package',
        modpackId: payload.target.id
      });

      notify(`Created instance "${instance.name}". Downloading ${payload.target.mods.length} pack mods...`, 40);

      // Download and install each mod in modpack
      let count = 0;
      for (const modRef of payload.target.mods) {
        count++;
        const pct = Math.round(40 + (count / payload.target.mods.length) * 50);
        notify(`Installing mod [${count}/${payload.target.mods.length}]: ${modRef.id}...`, pct);

        // Fetch mod info
        try {
          const modPayload = await this.fetchJson(`/launcher/install/mod/${modRef.id}`);
          if (modPayload && modPayload.target) {
            const modBuffer = await this.fetchBuffer(modPayload.target.downloadUrl);
            await this.instanceManager.installModIntoInstance(instance.id, {
              sourcePathOrBuffer: modBuffer,
              filename: modPayload.target.filename,
              expectedSha256: modPayload.target.sha256 || modRef.sha256,
              onProgress: (p) => notify(`  ${modRef.id}: ${p.message}`, pct)
            });
          }
        } catch (e) {
          console.warn(`Could not fetch mod ${modRef.id} automatically:`, e.message);
        }
      }

      notify(`Modpack "${payload.target.name}" installed successfully! Ready to play.`, 100);
      return {
        success: true,
        type: 'modpack',
        instanceId: instance.id,
        instanceName: instance.name
      };

    } else if (payload.action === 'install_mod') {
      // Single mod installation
      const targetInstanceId = options.targetInstanceId;
      if (!targetInstanceId) {
        throw new Error('targetInstanceId is required for single mod installation. Please select an instance.');
      }

      notify(`Downloading mod "${payload.target.name}" (${payload.target.filename})...`, 30);
      const modBuffer = await this.fetchBuffer(payload.target.downloadUrl);

      notify(`Building & Verifying mod...`, 60);
      const result = await this.instanceManager.installModIntoInstance(targetInstanceId, {
        sourcePathOrBuffer: modBuffer,
        filename: payload.target.filename,
        expectedSha256: payload.target.sha256,
        onProgress: (p) => notify(p.message, p.percent)
      });

      notify(`Mod "${payload.target.name}" installed successfully into instance!`, 100);
      return {
        success: true,
        type: 'mod',
        targetInstanceId,
        installedFile: result.installedFile
      };
    }

    throw new Error(`Unhandled action: ${payload.action}`);
  }
}

module.exports = DeepLinkHandler;
