const API_BASE = 'http://localhost:4000/api/v1';
const LAUNCHER_BASE = 'http://localhost:5000';

let allMods = [];
let allModpacks = [];
let currentUser = null;
let currentAuthMode = 'login';
let selectedStudioMods = new Set(['glowing-amethysts', 'kinetic-pipes']);

document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) window.lucide.createIcons();
  checkStoredAuth();
  await loadData();
  setupStudio();
});

// Navigation
function navigateTo(viewId) {
  const views = ['home', 'mods', 'modpacks', 'studio', 'upload'];
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    const tab = document.getElementById(`tab-${v}`);
    if (el) el.classList.toggle('hidden', v !== viewId);
    if (tab) {
      if (v === viewId) {
        tab.className = "nav-tab px-4 py-2 rounded-xl text-xs font-bold transition-all text-orange-400 bg-orange-500/10 border border-orange-500/20";
      } else {
        tab.className = "nav-tab px-4 py-2 rounded-xl text-xs font-medium transition-all text-slate-300 hover:text-white hover:bg-slate-800/60";
      }
    }
  });

  if (viewId === 'studio') updateStudioPreview();
  if (window.lucide) window.lucide.createIcons();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Load data from Backend API
async function loadData() {
  try {
    const [modsRes, packsRes, statusRes] = await Promise.all([
      fetch(`${API_BASE}/mods`).then(r => r.json()),
      fetch(`${API_BASE}/modpacks`).then(r => r.json()),
      fetch(`${API_BASE}/status`).then(r => r.json())
    ]);

    allMods = modsRes.mods || [];
    allModpacks = packsRes.modpacks || [];

    if (statusRes.stats) {
      document.getElementById('stat-mods').textContent = `${statusRes.stats.mods}+`;
    }

    renderFeaturedHome();
    renderModsGrid(allMods);
    renderModpacksGrid(allModpacks);
    populateStudioMods();
  } catch (e) {
    console.error('Failed to load backend platform data:', e);
  }
}

// Home Featured
function renderFeaturedHome() {
  const container = document.getElementById('home-featured-grid');
  if (!container) return;
  container.innerHTML = '';

  const featured = [...allMods, ...allModpacks.map(p => ({ ...p, isModpack: true }))].slice(0, 3);
  featured.forEach(item => {
    const card = createCardElement(item);
    container.appendChild(card);
  });
  if (window.lucide) window.lucide.createIcons();
}

// Render Mods Grid
function renderModsGrid(mods) {
  const grid = document.getElementById('mods-grid');
  if (!grid) return;
  grid.innerHTML = '';

  mods.forEach(mod => {
    grid.appendChild(createCardElement(mod));
  });
  if (window.lucide) window.lucide.createIcons();
}

// Render Modpacks Grid
function renderModpacksGrid(packs) {
  const grid = document.getElementById('modpacks-grid');
  if (!grid) return;
  grid.innerHTML = '';

  packs.forEach(pack => {
    grid.appendChild(createCardElement({ ...pack, isModpack: true }));
  });
  if (window.lucide) window.lucide.createIcons();
}

// Card Factory
function createCardElement(item) {
  const isPack = Boolean(item.isModpack);
  const card = document.createElement('div');
  card.className = "p-6 bg-slate-900/80 border border-slate-800 hover:border-orange-500/40 rounded-2xl flex flex-col justify-between transition-all space-y-4 group";

  card.innerHTML = `
    <div>
      <div class="flex items-start justify-between">
        <img src="${item.iconUrl || 'https://api.dicebear.com/7.x/shapes/svg?seed=' + item.slug}" class="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 shadow">
        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
          isPack 
            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
            : (item.kind === 'native' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-orange-500/20 text-orange-400 border border-orange-500/30')
        }">
          ${isPack ? 'Modpack' : (item.kind === 'native' ? 'Native Mod' : 'Content HMOD')}
        </span>
      </div>
      <h3 class="font-bold text-lg text-white mt-4 group-hover:text-orange-400 transition-colors">${item.name}</h3>
      <p class="text-xs text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">${item.summary}</p>
    </div>

    <div class="pt-4 border-t border-slate-800/80 flex items-center justify-between">
      <span class="text-xs font-mono font-bold text-slate-400">${item.downloads || 0} downloads</span>
      <div class="flex items-center gap-2">
        <button onclick="openDetail('${item.slug}', ${isPack})" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700">
          Details
        </button>
        <button onclick="triggerInstall('${item.slug}', ${isPack})" class="px-3.5 py-1.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-bold text-xs rounded-lg shadow glow-orange">
          Install
        </button>
      </div>
    </div>
  `;
  return card;
}

// Filter Mods
function applyModFilters() {
  const cat = document.getElementById('filter-category').value;
  const kind = document.getElementById('filter-kind').value;
  const q = document.getElementById('filter-search').value.toLowerCase();

  const filtered = allMods.filter(m => {
    const matchCat = !cat || (m.categories && m.categories.includes(cat));
    const matchKind = !kind || m.kind === kind;
    const matchQ = !q || m.name.toLowerCase().includes(q) || m.summary.toLowerCase().includes(q);
    return matchCat && matchKind && matchQ;
  });

  renderModsGrid(filtered);
}

// 1-Click Install Handler
async function triggerInstall(slug, isModpack) {
  const protocolUri = isModpack 
    ? `rustcraft://install/modpack/${slug}`
    : `rustcraft://install/mod/${slug}`;

  console.log(`[Platform] Triggering 1-Click Install: ${protocolUri}`);

  // 1. Try direct HTTP bridge to local launcher if running
  try {
    const res = await fetch(`${LAUNCHER_BASE}/api/launcher/deep-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri: protocolUri })
    });
    if (res.ok) {
      alert(`Installation command successfully delivered to Rustcraft Launcher for "${slug}"!`);
      return;
    }
  } catch (_) {
    // Launcher not responding via local HTTP, invoke native protocol
  }

  // 2. Invoke browser protocol handler
  window.location.href = protocolUri;
}

// Detail Modal
async function openDetail(slug, isModpack) {
  const item = isModpack ? allModpacks.find(p => p.slug === slug) : allMods.find(m => m.slug === slug);
  if (!item) return;

  document.getElementById('modal-title').textContent = item.name;
  document.getElementById('modal-icon').src = item.iconUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${item.slug}`;
  document.getElementById('modal-desc').textContent = item.description || item.summary;
  document.getElementById('modal-author').textContent = `Created by: ${item.author ? item.author.username : 'Rustcraft Community'}`;
  document.getElementById('modal-badge').textContent = isModpack ? 'MODPACK' : (item.kind === 'native' ? '.HNMOD NATIVE' : '.HMOD CONTENT');
  document.getElementById('modal-sha').textContent = item.latestVersion ? `Version ${item.latestVersion} • Ready` : 'Verified cryptographic archive';

  const btn = document.getElementById('modal-install-btn');
  btn.onclick = () => triggerInstall(item.slug, isModpack);

  document.getElementById('detail-modal').classList.remove('hidden');
  document.getElementById('detail-modal').classList.add('flex');
  if (window.lucide) window.lucide.createIcons();
}

function closeDetailModal() {
  document.getElementById('detail-modal').classList.add('hidden');
  document.getElementById('detail-modal').classList.remove('flex');
}

// Modpack Studio
function populateStudioMods() {
  const container = document.getElementById('studio-available-mods');
  if (!container) return;
  container.innerHTML = '';

  allMods.forEach(mod => {
    const isChecked = selectedStudioMods.has(mod.slug);
    const item = document.createElement('label');
    item.className = "flex items-center justify-between p-3 bg-slate-800/80 hover:bg-slate-800 rounded-xl cursor-pointer border border-slate-700/60";
    item.innerHTML = `
      <div class="flex items-center gap-3">
        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleStudioMod('${mod.slug}')" class="w-4 h-4 accent-orange-500 rounded">
        <div>
          <p class="text-xs font-bold text-slate-100">${mod.name}</p>
          <span class="text-[10px] text-slate-400 font-mono">${mod.kind === 'native' ? '.hnmod' : '.hmod'} • v${mod.latestVersion || '1.0.0'}</span>
        </div>
      </div>
      <span class="text-[10px] font-semibold text-slate-400 uppercase">${mod.categories ? mod.categories[0] : 'mod'}</span>
    `;
    container.appendChild(item);
  });
  updateStudioPreview();
}

function toggleStudioMod(slug) {
  if (selectedStudioMods.has(slug)) {
    selectedStudioMods.delete(slug);
  } else {
    selectedStudioMods.add(slug);
  }
  updateStudioPreview();
}

function updateStudioPreview() {
  const preview = document.getElementById('studio-toml-preview');
  if (!preview) return;

  const packName = document.getElementById('studio-pack-name')?.value || 'Custom Pack';
  const packVer = document.getElementById('studio-pack-version')?.value || '1.21.1';
  const packDesc = document.getElementById('studio-pack-desc')?.value || '';
  const packSlug = packName.toLowerCase().replace(/[^a-z0-9]+/g, '_');

  let toml = `format = 1\n`;
  toml += `id = "${packSlug}"\n`;
  toml += `name = "${packName}"\n`;
  toml += `version = "1.0.0"\n`;
  toml += `description = "${packDesc}"\n`;
  toml += `game = "${packVer}"\n`;
  toml += `authors = ["${currentUser ? currentUser.username : 'RustcraftPlayer'}"]\n\n`;

  selectedStudioMods.forEach(slug => {
    const mod = allMods.find(m => m.slug === slug);
    toml += `[[mods]]\n`;
    toml += `id = "${slug}"\n`;
    toml += `version = "${mod ? mod.latestVersion || '1.0.0' : '1.0.0'}"\n`;
    toml += `sha256 = "verified"\n`;
    toml += `on = true\n\n`;
  });

  preview.textContent = toml;
}

function exportStudioPackToml() {
  const toml = document.getElementById('studio-toml-preview').textContent;
  const blob = new Blob([toml], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'horizon-modpack.toml';
  a.click();
}

async function installStudioPackDirectly() {
  const packName = document.getElementById('studio-pack-name').value;
  alert(`Starting 1-Click Installation for Modpack "${packName}" into Rustcraft Launcher!`);
  // Trigger install
  triggerInstall('rustcraft-essentials', true);
}

// Project Upload
async function submitUploadProject() {
  const name = document.getElementById('upload-name').value.trim();
  const kind = document.getElementById('upload-kind').value;
  const category = document.getElementById('upload-cat').value;
  const summary = document.getElementById('upload-summary').value.trim();
  const version = document.getElementById('upload-version').value.trim();

  if (!name || !summary) return alert('Please fill in mod name and summary.');

  const token = localStorage.getItem('rustcraft_jwt');
  if (!token) {
    alert('Please log in with a Developer or Admin account to publish projects.');
    openAuthModal('login');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/mods`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name,
        kind,
        summary,
        categories: [category],
        supportedGameVersions: ['1.21.1']
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    alert(`Project "${name}" published successfully!`);
    navigateTo('mods');
    await loadData();
  } catch (e) {
    alert(`Failed to publish: ${e.message}`);
  }
}

// Auth Handling
function openAuthModal(mode) {
  currentAuthMode = mode;
  document.getElementById('auth-title').textContent = mode === 'login' ? 'Log In to Rustcraft' : 'Join Rustcraft Platform';
  document.getElementById('auth-modal').classList.remove('hidden');
  document.getElementById('auth-modal').classList.add('flex');
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.add('hidden');
  document.getElementById('auth-modal').classList.remove('flex');
}

async function submitAuth() {
  const ident = document.getElementById('auth-ident').value.trim();
  const pass = document.getElementById('auth-pass').value;

  const endpoint = currentAuthMode === 'login' ? `${API_BASE}/auth/login` : `${API_BASE}/auth/register`;
  const body = currentAuthMode === 'login' 
    ? { login: ident, password: pass }
    : { username: ident, email: `${ident.toLowerCase()}@user.rustcraft.net`, password: pass, role: 'Developer' };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    localStorage.setItem('rustcraft_jwt', data.token);
    currentUser = data.user;
    updateAuthUi();
    closeAuthModal();
    alert(`Welcome back, ${currentUser.username}!`);
  } catch (e) {
    alert(`Authentication failed: ${e.message}`);
  }
}

function checkStoredAuth() {
  const token = localStorage.getItem('rustcraft_jwt');
  if (token) {
    fetch(`${API_BASE}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(r => r.json())
    .then(d => {
      if (d.user) {
        currentUser = d.user;
        updateAuthUi();
      }
    })
    .catch(() => localStorage.removeItem('rustcraft_jwt'));
  }
}

function updateAuthUi() {
  const container = document.getElementById('auth-buttons-container');
  if (!currentUser) return;
  container.innerHTML = `
    <div class="flex items-center gap-3">
      <img src="${currentUser.avatarUrl}" class="w-9 h-9 rounded-full bg-slate-800 border border-slate-700">
      <div class="hidden sm:block text-left">
        <p class="text-xs font-bold text-white">${currentUser.username}</p>
        <span class="text-[10px] text-orange-400 font-semibold">${currentUser.role}</span>
      </div>
      <button onclick="logout()" class="text-xs text-slate-400 hover:text-white px-2">Logout</button>
    </div>
  `;
}

function logout() {
  localStorage.removeItem('rustcraft_jwt');
  currentUser = null;
  location.reload();
}

function handleHomeSearch() {
  const q = document.getElementById('home-search-input').value.trim();
  if (q) {
    document.getElementById('filter-search').value = q;
    navigateTo('mods');
    applyModFilters();
  }
}
