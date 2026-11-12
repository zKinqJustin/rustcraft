const assert = require('assert');
const path = require('path');
const fs = require('fs');
const InstanceManager = require('../src/instances/instanceManager');
const RustcraftModBuildSystem = require('../src/builder/modBuildSystem');
const HmodPacker = require('../src/builder/hmodPacker');

async function runLauncherTests() {
  console.log('--- Starting Rustcraft Launcher & HMOD Auto-Build Tests ---');
  const testDataDir = path.join(__dirname, 'test_data');
  if (fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDataDir, { recursive: true });

  const instanceManager = new InstanceManager(path.join(testDataDir, 'instances'));
  const modBuildSystem = new RustcraftModBuildSystem();

  try {
    // 1. Create Isolated Instance
    console.log('1. Testing Instance Creation & Isolation...');
    const inst = instanceManager.createInstance({
      name: 'Test Survival 1.21',
      gameVersion: '1.21.1',
      memoryMaxMb: 4096
    });

    assert.ok(inst.id);
    assert.strictEqual(inst.name, 'Test Survival 1.21');
    const createdDir = path.join(testDataDir, 'instances', inst.id);
    assert.ok(fs.existsSync(path.join(createdDir, 'instance.json')));
    assert.ok(fs.existsSync(path.join(createdDir, 'mods')));
    assert.ok(fs.existsSync(path.join(createdDir, 'saves')));
    console.log('   ✓ Instance directory structure strictly isolated.');

    // 2. Test Automatic HMOD Building from Source
    console.log('2. Testing Automatic HMOD Build from Source Directory (Abschnitt 5)...');
    const sampleModSourceDir = path.join(testDataDir, 'sample_ruby_mod_source');
    fs.mkdirSync(path.join(sampleModSourceDir, 'assets/ruby_mod/models'), { recursive: true });
    fs.mkdirSync(path.join(sampleModSourceDir, 'data/ruby_mod/blocks'), { recursive: true });

    // Write horizon-mod.toml
    fs.writeFileSync(path.join(sampleModSourceDir, 'horizon-mod.toml'), `
format = 1
id = "ruby_mod"
name = "Ruby Treasures"
version = "1.0.0"
description = "Gems and rubies"
authors = ["Tester"]
game = "1.21.1"
capabilities = ["registries"]
`, 'utf-8');

    // Write dummy asset & data
    fs.writeFileSync(path.join(sampleModSourceDir, 'assets/ruby_mod/models/ruby_block.json'), '{"parent":"block/cube_all"}');
    fs.writeFileSync(path.join(sampleModSourceDir, 'data/ruby_mod/blocks/ruby_ore.json'), '{"material":"rock","hardness":3.0}');

    const buildProgressStages = [];
    const installResult = await instanceManager.installModIntoInstance(inst.id, {
      sourcePathOrBuffer: sampleModSourceDir,
      onProgress: (p) => buildProgressStages.push(p.stage)
    });

    assert.strictEqual(installResult.success, true);
    assert.strictEqual(installResult.modId, 'ruby_mod');
    assert.strictEqual(installResult.installedFile, 'ruby_mod.hmod');
    assert.ok(fs.existsSync(installResult.destinationPath));
    assert.ok(buildProgressStages.includes('BUILDING_HMOD'));
    assert.ok(buildProgressStages.includes('COMPLETED'));
    console.log(`   ✓ Source automatically built into valid .hmod and installed: ${installResult.installedFile} (${installResult.size} bytes).`);

    // 3. Test Installed Mods Listing & Toggling
    console.log('3. Testing Instance Mod Management...');
    const modsBefore = instanceManager.getMods(inst.id);
    assert.strictEqual(modsBefore.length, 1);
    assert.strictEqual(modsBefore[0].activeName, 'ruby_mod.hmod');
    assert.strictEqual(modsBefore[0].enabled, true);

    // Toggle disable
    const toggleResult = instanceManager.toggleMod(inst.id, 'ruby_mod.hmod', false);
    assert.strictEqual(toggleResult.enabled, false);
    const modsAfterDisable = instanceManager.getMods(inst.id);
    assert.strictEqual(modsAfterDisable[0].enabled, false);

    // Toggle re-enable
    instanceManager.toggleMod(inst.id, toggleResult.filename, true);
    const modsAfterEnable = instanceManager.getMods(inst.id);
    assert.strictEqual(modsAfterEnable[0].enabled, true);
    console.log('   ✓ Mod state toggling (enable/disable) verified.');

    // 4. Test Game Launch Simulation
    console.log('4. Testing Game Launch Controller...');
    const launchLogs = [];
    const launchResult = instanceManager.launchInstance(inst.id, (line) => launchLogs.push(line));
    assert.strictEqual(launchResult.status, 'running');
    assert.ok(launchLogs.some(l => l.includes('Starting Rustcraft client')));
    assert.ok(launchLogs.some(l => l.includes('ruby_mod.hmod')));

    const reloadedInst = instanceManager.getInstance(inst.id);
    assert.ok(reloadedInst.playTimeMinutes > 0);
    assert.ok(reloadedInst.lastPlayed);
    console.log('   ✓ Game launch controller executed with proper telemetry and logging.');

    // 5. Test Instance Duplication & Deletion
    console.log('5. Testing Instance Duplication and Clean Deletion...');
    const copy = instanceManager.duplicateInstance(inst.id, 'Test Survival 1.21 (Cloned)');
    assert.strictEqual(copy.name, 'Test Survival 1.21 (Cloned)');
    const copyMods = instanceManager.getMods(copy.id);
    assert.strictEqual(copyMods.length, 1);
    assert.strictEqual(copyMods[0].activeName, 'ruby_mod.hmod');

    instanceManager.deleteInstance(copy.id);
    assert.strictEqual(instanceManager.getInstance(copy.id), null);
    console.log('   ✓ Instance duplicate & atomic deletion successful.');

    console.log('\n======================================================');
    console.log(' ALL LAUNCHER & HMOD BUILD TESTS PASSED (5/5) ');
    console.log('======================================================\n');
  } finally {
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runLauncherTests().catch(e => {
  console.error('Launcher tests failed:', e);
  process.exit(1);
});
