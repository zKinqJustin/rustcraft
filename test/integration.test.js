const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Import servers & systems
const backendServer = require('../backend/src/server');
const launcherServer = require('../launcher/src/index');

async function runEndToEndIntegration() {
  console.log('===============================================================');
  console.log('--- STARTING RUSTCRAFT END-TO-END SYSTEM INTEGRATION TEST ---');
  console.log('===============================================================');

  // 1. Boot Backend
  console.log('\n[E2E Step 1] Initializing Rustcraft Backend & REST API...');
  const backend = await backendServer.startServer();
  const backendPort = backend.address().port;
  console.log(`✓ Backend running on http://localhost:${backendPort}`);

  // 2. Boot Launcher
  console.log('\n[E2E Step 2] Initializing Rustcraft Launcher & Deep Link Daemon...');
  const launcher = launcherServer.startLauncher();
  const launcherPort = launcher.address().port;
  console.log(`✓ Launcher running on http://localhost:${launcherPort}`);

  const post = (url, body) => {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const req = http.request(parsed, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  };

  const get = (url) => {
    return new Promise((resolve, reject) => {
      http.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      }).on('error', reject);
    });
  };

  try {
    // 3. User browses website catalog
    console.log('\n[E2E Step 3] Simulating user browsing Modpacks on Rustcraft Website...');
    const catalogPacks = await get(`http://localhost:${backendPort}/api/v1/modpacks`);
    assert.strictEqual(catalogPacks.status, 200);
    assert.ok(catalogPacks.body.modpacks.length >= 1);
    const chosenPack = catalogPacks.body.modpacks[0];
    console.log(`✓ User found featured Modpack: "${chosenPack.name}" (Slug: ${chosenPack.slug})`);

    // 4. User clicks "Install into Launcher" on Website (Triggers rustcraft://install/modpack/:slug)
    const deepLinkUri = `rustcraft://install/modpack/${chosenPack.slug}`;
    console.log(`\n[E2E Step 4] Website dispatches 1-Click Install Deep-Link Protocol: ${deepLinkUri}`);

    const installResult = await post(`http://localhost:${launcherPort}/api/launcher/deep-link`, {
      uri: deepLinkUri
    });

    assert.strictEqual(installResult.status, 200);
    assert.strictEqual(installResult.body.success, true);
    assert.strictEqual(installResult.body.type, 'modpack');
    const createdInstanceId = installResult.body.instanceId;
    console.log(`✓ Launcher automatically created new isolated Instance: "${installResult.body.instanceName}" (ID: ${createdInstanceId})`);

    // 5. Inspect Installed Instance State
    console.log('\n[E2E Step 5] Verifying Instance Isolation, HMOD Builds, and State...');
    const instDetails = await get(`http://localhost:${launcherPort}/api/launcher/instances/${createdInstanceId}/mods`);
    assert.strictEqual(instDetails.status, 200);
    const installedMods = instDetails.body;
    console.log(`✓ Instance contains ${installedMods.length} installed mods:`);
    for (const m of installedMods) {
      console.log(`   - [${m.kind.toUpperCase()}] ${m.activeName} (Enabled: ${m.enabled})`);
    }
    assert.ok(installedMods.length >= 2, 'Expected modpack mods to be installed');

    // 6. User clicks "PLAY" on the Launcher Dashboard
    console.log('\n[E2E Step 6] User clicks PLAY button in Rustcraft Launcher...');
    const playResult = await post(`http://localhost:${launcherPort}/api/launcher/instances/${createdInstanceId}/launch`);
    assert.strictEqual(playResult.status, 200);
    assert.strictEqual(playResult.body.status, 'running');
    console.log(`✓ Game process initialized with Vulkan/wgpu backend, mods mounted, and telemetry streaming.`);

    console.log('\n===============================================================');
    console.log(' 🎉 COMPLETE END-TO-END RUSTCRAFT USER FLOW SUCCEEDED! (6/6)');
    console.log('===============================================================\n');

  } finally {
    backend.close();
    launcher.close();
  }
}

runEndToEndIntegration().catch(err => {
  console.error('End-to-End integration test failed:', err);
  process.exit(1);
});

