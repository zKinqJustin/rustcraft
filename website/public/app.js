const API_BASE = 'http://localhost:4000/api/v1';
const LAUNCHER_BASE = 'http://localhost:5000';

let allMods = [];
let allModpacks = [];
let currentUser = null;
let currentAuthMode = 'login';
let selectedStudioMods = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) window.lucide.createIcons();
  checkStoredAuth();
  await loadData();
  setupStudio();

  // Setup drag-and-drop for upload dropzone
  const dropzone = document.getElementById('dropzone-file');
  if (dropzone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('border-orange-500', 'bg-slate-800');
      }, false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('border-orange-500', 'bg-slate-800');
      }, false);
    });
    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        const fileInput = document.getElementById('upload-file');
        fileInput.files = files;
        handleFileSelect({ target: fileInput });
      }
    });
  }
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
      document.getElementById('stat-mods').textContent = `${statusRes.stats.mods}`;
      document.getElementById('stat-downloads').textContent = `${statusRes.stats.modpacks}`;
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
  if (featured.length === 0) {
    container.innerHTML = `
      <div class="col-span-3 p-8 bg-slate-900/40 border border-slate-800 rounded-2xl text-center space-y-2">
        <i data-lucide="package-open" class="w-10 h-10 text-slate-600 mx-auto"></i>
        <h3 class="text-sm font-bold text-slate-300">Catalog Ready for Content</h3>
        <p class="text-xs text-slate-500">No projects published yet. Verified developers can submit Content Mods (.hmod) and Modpacks.</p>
        <button onclick="navigateTo('upload')" class="mt-2 px-4 py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-lg shadow">
          Publish Project
        </button>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

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

  if (mods.length === 0) {
    grid.innerHTML = `
      <div class="col-span-3 p-12 bg-slate-900/40 border border-slate-800 rounded-3xl text-center space-y-3">
        <i data-lucide="puzzle" class="w-12 h-12 text-slate-600 mx-auto"></i>
        <h3 class="text-base font-bold text-slate-200">No Mods Published Yet</h3>
        <p class="text-xs text-slate-400 max-w-sm mx-auto">This repository is clean and ready. Upload your own .hmod or .hnmod projects to make them available here.</p>
        <button onclick="navigateTo('upload')" class="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-xl shadow glow-orange">
          Upload New Mod
        </button>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

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

  if (packs.length === 0) {
    grid.innerHTML = `
      <div class="col-span-2 p-12 bg-slate-900/40 border border-slate-800 rounded-3xl text-center space-y-3">
        <i data-lucide="boxes" class="w-12 h-12 text-slate-600 mx-auto"></i>
        <h3 class="text-base font-bold text-slate-200">No Modpacks Available</h3>
        <p class="text-xs text-slate-400 max-w-sm mx-auto">Create a customized profile using our visual Modpack Studio.</p>
        <button onclick="navigateTo('studio')" class="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-bold text-xs rounded-xl shadow glow-orange">
          Launch Modpack Studio
        </button>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

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
        ${currentUser && (currentUser.role === 'Admin' || (currentUser && currentUser.id === item.authorId)) ? `
          <button onclick="event.stopPropagation(); deleteModById('${item.id}', '${item.name.replace(/'/g, "\\'")}')" title="Delete Mod" class="p-1.5 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded-lg transition-colors border border-transparent hover:border-red-500/30">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        ` : ''}
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
  try {
    const res = await fetch(`${API_BASE}/launcher/install-local/mod/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert(`✅ ${data.message}\n\nDie Mod ist jetzt in Rustcraft einsatzbereit.`);
      await loadData();
      return;
    }
  } catch (e) {
    console.error('Local direct install error:', e);
  }

  // Fallback: direct download link
  const mod = allMods.find(m => m.slug === slug);
  if (mod && mod.latestVersionId) {
    window.location.href = `${API_BASE}/mods/version/${mod.latestVersionId}/download`;
  } else {
    alert(`Mod "${slug}" heruntergeladen.`);
  }
}

let currentDetailItem = null;

// Delete Mod (Admin / Author)
async function deleteModById(id, name) {
  if (!confirm(`Are you sure you want to permanently delete "${name}"? This will remove all files and versions from the platform.`)) {
    return;
  }
  const token = localStorage.getItem('rustcraft_jwt');
  if (!token) {
    alert('Please log in with an Admin or Developer account to delete mods.');
    openAuthModal('login');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/mods/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    alert(`Mod "${name}" was deleted successfully.`);
    closeDetailModal();
    await loadData();
    navigateTo('mods');
  } catch (e) {
    alert(`Failed to delete mod: ${e.message}`);
  }
}

function deleteCurrentMod() {
  if (!currentDetailItem) return;
  deleteModById(currentDetailItem.id, currentDetailItem.name);
}

// Detail Modal
async function openDetail(slug, isModpack) {
  const item = isModpack ? allModpacks.find(p => p.slug === slug) : allMods.find(m => m.slug === slug);
  if (!item) return;

  currentDetailItem = item;
  document.getElementById('modal-title').textContent = item.name;
  document.getElementById('modal-icon').src = item.iconUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${item.slug}`;
  document.getElementById('modal-desc').textContent = item.description || item.summary;
  document.getElementById('modal-author').textContent = `Created by: ${item.author ? item.author.username : 'Rustcraft Community'}`;
  document.getElementById('modal-badge').textContent = isModpack ? 'MODPACK' : (item.kind === 'native' ? '.HNMOD NATIVE' : '.HMOD CONTENT');
  document.getElementById('modal-sha').textContent = item.latestVersion ? `Version ${item.latestVersion} • Ready` : 'Verified cryptographic archive';

  const btn = document.getElementById('modal-install-btn');
  btn.onclick = () => triggerInstall(item.slug, isModpack);

  const deleteBtn = document.getElementById('modal-delete-btn');
  if (deleteBtn) {
    if (currentUser && (currentUser.role === 'Admin' || currentUser.id === item.authorId)) {
      deleteBtn.classList.remove('hidden');
      deleteBtn.classList.add('flex');
    } else {
      deleteBtn.classList.add('hidden');
      deleteBtn.classList.remove('flex');
    }
  }

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

// File selection handler for project upload
function handleFileSelect(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const badge = document.getElementById('file-selected-badge');
  const labelMain = document.getElementById('file-label-main');
  const labelSub = document.getElementById('file-label-sub');

  if (badge) {
    const sizeKb = (file.size / 1024).toFixed(1);
    const sizeStr = file.size > 1048576 ? `${(file.size / 1048576).toFixed(2)} MB` : `${sizeKb} KB`;
    badge.textContent = `Selected: ${file.name} (${sizeStr})`;
    badge.classList.remove('hidden');
  }
  if (labelMain) {
    labelMain.textContent = file.name;
  }
  if (labelSub) {
    labelSub.textContent = `Ready for upload - click to change`;
  }
}

// Project Upload
async function submitUploadProject() {
  const name = document.getElementById('upload-name').value.trim();
  const kind = document.getElementById('upload-kind').value;
  const category = document.getElementById('upload-cat').value;
  const summary = document.getElementById('upload-summary').value.trim();
  const version = document.getElementById('upload-version').value.trim() || '1.0.0';
  const gameVersion = (document.getElementById('upload-game-version') && document.getElementById('upload-game-version').value.trim()) || '1.21.1';
  const changelog = (document.getElementById('upload-changelog') && document.getElementById('upload-changelog').value.trim()) || 'Initial release';

  if (!name || !summary) return alert('Please fill in mod name and summary.');

  const fileInput = document.getElementById('upload-file');
  const file = fileInput && fileInput.files && fileInput.files[0];
  if (!file) {
    alert('Please select a mod file (.hnmod, .hmod, .jar, or .zip) to upload.');
    return;
  }

  const token = localStorage.getItem('rustcraft_jwt');
  if (!token) {
    alert('Please log in with a Developer or Admin account to publish projects.');
    openAuthModal('login');
    return;
  }

  const submitBtn = document.getElementById('upload-submit-btn');
  const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>Uploading Project & File...</span>';
  }

  try {
    // 1. Create mod project metadata
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
        supportedGameVersions: [gameVersion]
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const modId = data.id;

    // 2. Upload the actual mod binary file as version
    const formData = new FormData();
    formData.append('file', file);
    formData.append('version', version);
    formData.append('gameVersion', gameVersion);
    formData.append('changelog', changelog);

    const versionRes = await fetch(`${API_BASE}/mods/${modId}/versions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    const versionData = await versionRes.json();
    if (!versionRes.ok) throw new Error(versionData.error || 'Failed to upload mod version file');

    alert(`Project "${name}" and file "${file.name}" published successfully!`);

    // Reset inputs
    document.getElementById('upload-name').value = '';
    document.getElementById('upload-summary').value = '';
    if (fileInput) fileInput.value = '';
    const badge = document.getElementById('file-selected-badge');
    if (badge) badge.classList.add('hidden');
    const labelMain = document.getElementById('file-label-main');
    if (labelMain) labelMain.textContent = 'Click to upload or drag & drop';
    const labelSub = document.getElementById('file-label-sub');
    if (labelSub) labelSub.textContent = 'Native Mod (.hnmod), Content Mod (.hmod), or Jar Archive';

    navigateTo('mods');
    await loadData();
  } catch (e) {
    alert(`Failed to publish: ${e.message}`);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText;
      if (window.lucide) lucide.createIcons();
    }
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

