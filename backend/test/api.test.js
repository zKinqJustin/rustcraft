const assert = require('assert');
const http = require('http');
const { app, startServer } = require('../src/server');

async function runTests() {
  console.log('--- Starting Rustcraft Backend Automated Tests ---');
  const server = await startServer();
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/v1`;

  const request = (path, options = {}) => {
    return new Promise((resolve, reject) => {
      const url = new URL(baseUrl + path);
      const reqOptions = {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      };

      const req = http.request(url, reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = data ? JSON.parse(data) : {};
            resolve({ status: res.statusCode, headers: res.headers, body: json, raw: data });
          } catch (e) {
            resolve({ status: res.statusCode, headers: res.headers, raw: data });
          }
        });
      });

      req.on('error', reject);
      if (options.body) {
        req.write(JSON.stringify(options.body));
      }
      req.end();
    });
  };

  try {
    // 1. Health Status Test
    console.log('1. Testing /status endpoint...');
    const statusRes = await request('/status');
    assert.strictEqual(statusRes.status, 200);
    assert.strictEqual(statusRes.body.status, 'online');
    assert.ok(statusRes.body.stats.mods >= 3);
    console.log('   ✓ Status check passed.');

    // 2. Auth Tests (Login & Registration)
    console.log('2. Testing Authentication...');
    const loginRes = await request('/auth/login', {
      method: 'POST',
      body: { login: 'RustcraftAdmin', password: 'RustcraftAdmin2026!' }
    });
    assert.strictEqual(loginRes.status, 200);
    assert.ok(loginRes.body.token);
    assert.strictEqual(loginRes.body.user.role, 'Admin');
    const adminToken = loginRes.body.token;
    console.log('   ✓ Admin login successful.');

    const registerRes = await request('/auth/register', {
      method: 'POST',
      body: {
        username: `TestUser_${Date.now()}`,
        email: `test_${Date.now()}@rustcraft.net`,
        password: 'Password123!',
        role: 'Developer'
      }
    });
    assert.strictEqual(registerRes.status, 201);
    assert.ok(registerRes.body.token);
    console.log('   ✓ User registration successful.');

    // 3. Mod Catalog Tests
    console.log('3. Testing Mod Catalog & Filtering...');
    const modsRes = await request('/mods');
    assert.strictEqual(modsRes.status, 200);
    assert.ok(Array.isArray(modsRes.body.mods));
    assert.ok(modsRes.body.mods.length >= 3);

    const singleModRes = await request('/mods/glowing-amethysts');
    assert.strictEqual(singleModRes.status, 200);
    assert.strictEqual(singleModRes.body.slug, 'glowing-amethysts');
    assert.strictEqual(singleModRes.body.kind, 'content');
    assert.ok(singleModRes.body.versions.length > 0);
    console.log('   ✓ Mod retrieval & detail inspection passed.');

    // 4. Modpack Tests
    console.log('4. Testing Modpacks...');
    const packsRes = await request('/modpacks');
    assert.strictEqual(packsRes.status, 200);
    assert.ok(packsRes.body.modpacks.length >= 1);
    const pack = packsRes.body.modpacks[0];
    const packDetail = await request(`/modpacks/${pack.slug}`);
    assert.strictEqual(packDetail.status, 200);
    assert.ok(packDetail.body.versions[0].manifestToml.includes('rustcraft_essentials'));
    console.log('   ✓ Modpack catalog and TOML manifest verification passed.');

    // 5. Deep Link & Launcher Integration Tests
    console.log('5. Testing Deep Link Resolver (rustcraft://)...');
    const deepLinkMod = await request('/launcher/install/mod/glowing-amethysts');
    assert.strictEqual(deepLinkMod.status, 200);
    assert.strictEqual(deepLinkMod.body.action, 'install_mod');
    assert.strictEqual(deepLinkMod.body.target.slug, 'glowing-amethysts');
    assert.ok(deepLinkMod.body.target.sha256);
    assert.ok(deepLinkMod.body.target.downloadUrl);

    const deepLinkPack = await request('/launcher/install/modpack/rustcraft-essentials');
    assert.strictEqual(deepLinkPack.status, 200);
    assert.strictEqual(deepLinkPack.body.action, 'install_modpack');
    assert.strictEqual(deepLinkPack.body.target.slug, 'rustcraft-essentials');
    assert.ok(deepLinkPack.body.target.mods.length >= 2);
    console.log('   ✓ Deep link resolution payload verified for both mods and modpacks.');

    console.log('\n=============================================');
    console.log(' ALL BACKEND TESTS PASSED SUCCESSFULLY (5/5) ');
    console.log('=============================================\n');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
