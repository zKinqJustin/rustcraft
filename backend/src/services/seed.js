const crypto = require('crypto');
const db = require('./db');
const { hashPassword } = require('./security');
const { saveFile } = require('./storage');

async function seedDatabase() {
  const users = db.find('users', () => true);
  if (users.length > 0) return; // Already seeded

  console.log('[Seed] Seeding initial Rustcraft database...');

  // 1. Create Default Users (User, Developer, Moderator, Admin)
  const devPasswordHash = await hashPassword('RustcraftDev2026!');
  const adminPasswordHash = await hashPassword('RustcraftAdmin2026!');
  const userPasswordHash = await hashPassword('RustcraftUser2026!');

  const admin = db.insert('users', {
    id: 'user-admin-01',
    username: 'RustcraftAdmin',
    email: 'admin@rustcraft.net',
    passwordHash: adminPasswordHash,
    role: 'Admin',
    avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=RustcraftAdmin',
    bio: 'Rustcraft Lead Administrator and System Maintainer'
  });

  const dev = db.insert('users', {
    id: 'user-dev-01',
    username: 'RustModder',
    email: 'modder@rustcraft.net',
    passwordHash: devPasswordHash,
    role: 'Developer',
    avatarUrl: 'https://api.dicebear.com/7.x/identicon/svg?seed=RustModder',
    bio: 'Creator of high-performance Horizon & Rustcraft mods'
  });

  const regularUser = db.insert('users', {
    id: 'user-player-01',
    username: 'BlockMiner',
    email: 'player@rustcraft.net',
    passwordHash: userPasswordHash,
    role: 'User',
    avatarUrl: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=BlockMiner',
    bio: 'Minecraft and Horizon enthusiast'
  });

  // 2. Create Sample Content Mods (.hmod)
  // Mod 1: Glowing Amethysts (Content Mod)
  const modAmethyst = db.insert('mods', {
    id: 'mod-glowing-amethysts',
    name: 'Glowing Amethysts',
    slug: 'glowing-amethysts',
    summary: 'Illuminating crystals and decorative amethyst lanterns with dynamic light.',
    description: 'Glowing Amethysts adds decorative light-emitting amethyst blocks, shards, and chandeliers to your Horizon world. Fully crafted in Rustcraft Content format (.hmod) with zero code overhead.',
    kind: 'content',
    categories: ['decoration', 'magic'],
    supportedGameVersions: ['1.21.1', '1.20.4'],
    authorId: dev.id,
    downloads: 1420,
    likes: 89,
    iconUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=GlowingAmethysts',
    screenshots: [],
    repositoryUrl: 'https://github.com/rustcraft/sample-glowing-amethysts',
    license: 'MIT'
  });

  // Create real .hmod archive contents
  const amethystManifest = `format = 1\nid = "glowing_amethysts"\nname = "Glowing Amethysts"\nversion = "1.0.0"\ndescription = "Illuminating amethyst crystals"\nauthors = ["RustModder"]\ngame = "1.21.1"\ncapabilities = ["registries"]\n`;
  const amethystBuffer = Buffer.from(amethystManifest, 'utf-8');
  const storedAmethyst = saveFile(`mods/${modAmethyst.id}`, 'glowing_amethysts-1.0.0.hmod', amethystBuffer);

  db.insert('mod_versions', {
    id: 'ver-amethyst-100',
    modId: modAmethyst.id,
    version: '1.0.0',
    changelog: 'Initial release with glowing amethyst clusters and lanterns',
    gameVersion: '1.21.1',
    filename: storedAmethyst.filename,
    filePath: storedAmethyst.relPath,
    fileSize: storedAmethyst.size,
    sha256: storedAmethyst.sha256,
    isSourceBuildRequired: false,
    dependencies: []
  });

  // Mod 2: Rustcraft Kinetic Pipes (Content Mod requiring build)
  const modPipes = db.insert('mods', {
    id: 'mod-kinetic-pipes',
    name: 'Kinetic Item Pipes',
    slug: 'kinetic-pipes',
    summary: 'High-speed item and fluid transport tubes with visual routing.',
    description: 'Fast, lag-free item transfer tubes modeled directly for the Horizon engine. Compatible with vanilla chests, barrels and hoppers.',
    kind: 'content',
    categories: ['technology', 'utility'],
    supportedGameVersions: ['1.21.1'],
    authorId: dev.id,
    downloads: 3250,
    likes: 215,
    iconUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=KineticPipes',
    screenshots: [],
    repositoryUrl: 'https://github.com/rustcraft/sample-kinetic-pipes',
    license: 'MIT'
  });

  const pipesManifest = `format = 1\nid = "kinetic_pipes"\nname = "Kinetic Item Pipes"\nversion = "1.2.0"\ndescription = "Lag-free item transport"\nauthors = ["RustModder"]\ngame = "1.21.1"\ncapabilities = ["registries"]\n`;
  const storedPipes = saveFile(`mods/${modPipes.id}`, 'kinetic_pipes-1.2.0.hmod', Buffer.from(pipesManifest, 'utf-8'));

  db.insert('mod_versions', {
    id: 'ver-pipes-120',
    modId: modPipes.id,
    version: '1.2.0',
    changelog: 'Added sorting filters and high-speed extraction nodes',
    gameVersion: '1.21.1',
    filename: storedPipes.filename,
    filePath: storedPipes.relPath,
    fileSize: storedPipes.size,
    sha256: storedPipes.sha256,
    isSourceBuildRequired: false,
    dependencies: []
  });

  // Mod 3: Native Performance Optimizer (.hnmod)
  const modOptimizer = db.insert('mods', {
    id: 'mod-native-optimizer',
    name: 'Horizon Engine Accelerator',
    slug: 'engine-accelerator',
    summary: 'Native SIMD math and memory allocator optimizations for peak FPS.',
    description: 'Deep engine hooks leveraging Rust AVX2/NEON instructions to accelerate chunk meshing and entity tick loops.',
    kind: 'native',
    categories: ['optimization'],
    supportedGameVersions: ['1.21.1'],
    authorId: dev.id,
    downloads: 5800,
    likes: 412,
    iconUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=Accelerator',
    screenshots: [],
    repositoryUrl: 'https://github.com/rustcraft/engine-accelerator',
    license: 'MIT'
  });

  const optimizerManifest = `[mod]\nid = "engine_accelerator"\nname = "Engine Accelerator"\nversion = "2.0.1"\n[compatibility]\nhorizon_revision = "e2d8c3b1a0f4"\n`;
  const storedOptimizer = saveFile(`mods/${modOptimizer.id}`, 'engine_accelerator-2.0.1.hnmod', Buffer.from(optimizerManifest, 'utf-8'));

  db.insert('mod_versions', {
    id: 'ver-optimizer-201',
    modId: modOptimizer.id,
    version: '2.0.1',
    changelog: 'Multi-threaded lighting and memory reuse optimizations',
    gameVersion: '1.21.1',
    filename: storedOptimizer.filename,
    filePath: storedOptimizer.relPath,
    fileSize: storedOptimizer.size,
    sha256: storedOptimizer.sha256,
    isSourceBuildRequired: false,
    dependencies: []
  });

  // 3. Create Sample Modpacks (.hpack)
  const modpackAlpha = db.insert('modpacks', {
    id: 'pack-rustcraft-essentials',
    name: 'Rustcraft Essentials',
    slug: 'rustcraft-essentials',
    summary: 'The ultimate starting modpack with enhanced visuals, item transport, and performance.',
    description: 'Curated modpack designed for multiplayer servers and survival exploration. Includes Glowing Amethysts, Kinetic Pipes, and the Engine Accelerator pre-configured for maximum framerate.',
    gameVersion: '1.21.1',
    categories: ['adventure', 'technology', 'optimization'],
    authorId: admin.id,
    downloads: 980,
    likes: 120,
    iconUrl: 'https://api.dicebear.com/7.x/identicon/svg?seed=RustcraftEssentials',
    screenshots: [],
    license: 'MIT'
  });

  const packManifestToml = `format = 1\nid = "rustcraft_essentials"\nname = "Rustcraft Essentials"\nversion = "1.0.0"\ndescription = "Curated performance and survival modpack"\ngame = "1.21.1"\nauthors = ["RustcraftAdmin"]\n\n[[mods]]\nid = "${modAmethyst.slug}"\nversion = "1.0.0"\nsha256 = "${storedAmethyst.sha256}"\non = true\n\n[[mods]]\nid = "${modPipes.slug}"\nversion = "1.2.0"\nsha256 = "${storedPipes.sha256}"\non = true\n\n[[mods]]\nid = "${modOptimizer.slug}"\nversion = "2.0.1"\nsha256 = "${storedOptimizer.sha256}"\non = true\n`;

  const storedPack = saveFile(`modpacks/${modpackAlpha.id}`, 'rustcraft_essentials-1.0.0.hpack.toml', Buffer.from(packManifestToml, 'utf-8'));

  db.insert('modpack_versions', {
    id: 'ver-pack-100',
    modpackId: modpackAlpha.id,
    version: '1.0.0',
    changelog: 'Initial Essentials release with performance and decoration suite',
    gameVersion: '1.21.1',
    mods: [
      { id: modAmethyst.slug, name: modAmethyst.name, version: '1.0.0', sha256: storedAmethyst.sha256, on: true },
      { id: modPipes.slug, name: modPipes.name, version: '1.2.0', sha256: storedPipes.sha256, on: true },
      { id: modOptimizer.slug, name: modOptimizer.name, version: '2.0.1', sha256: storedOptimizer.sha256, on: true }
    ],
    manifestToml: packManifestToml,
    filePath: storedPack.relPath,
    fileSize: storedPack.size,
    sha256: storedPack.sha256
  });

  console.log('[Seed] Database successfully initialized with users, mods, and modpack!');
}

module.exports = { seedDatabase };
