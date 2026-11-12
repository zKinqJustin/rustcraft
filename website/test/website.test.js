const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { app, startWebsite } = require('../server');

async function testWebsite() {
  console.log('--- Starting Rustcraft Website Automated Tests ---');
  const server = await startWebsite();
  const port = server.address().port;

  const get = (urlPath) => {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}${urlPath}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }).on('error', reject);
    });
  };

  try {
    // 1. Test HTML serving
    console.log('1. Testing Website Root Route (index.html)...');
    const res = await get('/');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('RUSTCRAFT'));
    assert.ok(res.body.includes('Modpack Studio'));
    assert.ok(res.body.includes('Explore Mods'));
    console.log('   ✓ Index HTML rendered with branding and navigation.');

    // 2. Test Asset serving
    console.log('2. Testing Website Static Assets (app.js)...');
    const assetRes = await get('/app.js');
    assert.strictEqual(assetRes.status, 200);
    assert.ok(assetRes.body.includes('triggerInstall'));
    assert.ok(assetRes.body.includes('updateStudioPreview'));
    console.log('   ✓ Reactive client bundle delivered cleanly.');

    console.log('\n===============================================');
    console.log(' ALL WEBSITE PLATFORM TESTS PASSED (2/2) ');
    console.log('===============================================\n');
  } finally {
    server.close();
  }
}

testWebsite().catch(err => {
  console.error('Website tests failed:', err);
  process.exit(1);
});

