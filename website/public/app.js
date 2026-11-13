const API_BASE = 'http://localhost:4000/api/v1';
const LAUNCHER_BASE = 'http://localhost:5000';

let allMods = [];
let allModpacks = [];
let currentUser = null;
let currentAuthMode = 'login';
let selectedStudioMods = new Set();
let currentAdminTab = 'pending';
let adminData = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) window.lucide.createIcons();
  checkStoredAuth();
  await loadData();
  setupStudio();
  checkLauncherStatus();
  setInterval(checkLauncherStatus, 4000);

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

// Client Detection
async function checkLauncherStatus() {
  try {
    const res = await fetch(`${API_BASE}/launcher/client-status`);
    if (!res.ok) throw new Error();
    const data = await res.json();

    const dot = document.getElementById('client-status-dot');
    const text = document.getElementById('client-status-text');
    const startBtn = document.getElementById('client-start-btn');
    const adminStat = document.getElementById('admin-stat-launcher');

    if (data.running) {
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]';
      if (text) text.innerHTML = `<span class="text-emerald-400 font-bold">Rustcraft aktiv</span> <span class="text-slate-400 text-[10px] hidden sm:inline">(PID ${data.pid})</span>`;
      if (startBtn) startBtn.classList.add('hidden');
      if (adminStat) adminStat.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400"></span> <span class="text-emerald-400">Aktiv (PID ${data.pid} · 26.3)</span>`;
    } else {
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-slate-500';
      if (text) text.textContent = 'Client offline';
      if (startBtn) startBtn.classList.remove('hidden');
      if (adminStat) adminStat.innerHTML = `<span class="w-2 h-2 rounded-full bg-slate-500"></span> <span class="text-slate-400">Offline</span>`;
    }
  } catch (e) {
    const text = document.getElementById('client-status-text');
    if (text) text.textContent = 'Backend offline';
  }
}

async function startLauncherFromWeb() {
  const btn = document.getElementById('client-start-btn');
  if (btn) btn.textContent = 'Startet...';
  try {
    const res = await fetch(`${API_BASE}/launcher/start`, { method: 'POST' });
    const data = await res.json();
    setTimeout(checkLauncherStatus, 1500);
  } catch (e) {
    alert('Fehler beim Starten des Launchers: ' + e.message);
  } finally {
    if (btn) btn.textContent = 'Starten';
  }
}

// Navigation
function navigateTo(viewId) {
  const views = ['home', 'mods', 'modpacks', 'studio', 'upload', 'admin'];
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    const tab = document.getElementById(`tab-${v}`);
    if (el) el.classList.toggle('hidden', v !== viewId);
    if (tab) {
      if (v === viewId) {
        if (v === 'admin') {
          tab.className = "nav-tab px-3.5 py-2 rounded-xl text-xs font-bold transition-all text-red-400 bg-red-500/20 border border-red-500/40 flex items-center gap-1.5";
        } else {
          tab.className = "nav-tab px-4 py-2 rounded-xl text-xs font-bold transition-all text-orange-400 bg-orange-500/10 border border-orange-500/20";
        }
      } else {
        if (v === 'admin') {
          tab.className = "nav-tab px-3.5 py-2 rounded-xl text-xs font-semibold transition-all text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-1.5 border border-red-500/20";
        } else {
          tab.className = "nav-tab px-4 py-2 rounded-xl text-xs font-medium transition-all text-slate-300 hover:text-white hover:bg-slate-800/60";
        }
      }
    }
  });

  if (viewId === 'studio') updateStudioPreview();
  if (viewId === 'admin') loadAdminDashboard();
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
      const modEl = document.getElementById('stat-mods');
      const packEl = document.getElementById('stat-downloads');
      if (modEl) modEl.textContent = `${statusRes.stats.mods}`;
      if (packEl) packEl.textContent = `${statusRes.stats.modpacks}`;
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
        <h3 class="text-base font-bold text-slate-200">Keine Mods gefunden</h3>
        <p class="text-xs text-slate-400 max-w-sm mx-auto">Lade neue Mods hoch oder erstelle ein Modpack im Studio.</p>
        <button onclick="navigateTo('upload')" class="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-xl shadow glow-orange">
          Neue Mod hochladen
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
        <h3 class="text-base font-bold text-slate-200">Noch keine Modpacks veröffentlicht</h3>
        <p class="text-xs text-slate-400 max-w-sm mx-auto">Erstelle jetzt dein eigenes Paket im visuellen Modpack Studio und teile es mit 1-Click Install.</p>
        <button onclick="navigateTo('studio')" class="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-bold text-xs rounded-xl shadow glow-orange">
          Modpack Studio öffnen
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
          ${isPack ? 'Modpack' : (item.kind === 'native' ? 'Native Mod (.hnmod)' : 'Content HMOD')}
        </span>
      </div>
      <h3 class="font-bold text-lg text-white mt-4 group-hover:text-orange-400 transition-colors">${item.name}</h3>
      <p class="text-xs text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">${item.summary || item.description || ''}</p>
    </div>

    <div class="pt-4 border-t border-slate-800/80 flex items-center justify-between">
      <span class="text-xs font-mono font-bold text-slate-400">${item.downloads || 0} downloads</span>
      <div class="flex items-center gap-2">
        ${currentUser && (currentUser.role === 'Admin' || (currentUser && currentUser.id === item.authorId)) ? `
          <button onclick="event.stopPropagation(); deleteItemDirectly('${isPack ? 'modpack' : 'mod'}', '${item.id}', '${item.name.replace(/'/g, "\\'")}')" title="Löschen" class="p-1.5 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded-lg transition-colors border border-transparent hover:border-red-500/30">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        ` : ''}
        <button onclick="openDetail('${item.slug}', ${isPack})" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700">
          Details
        </button>
        <button onclick="triggerInstall('${item.slug}', ${isPack})" class="px-3.5 py-1.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-bold text-xs rounded-lg shadow glow-orange">
          ${isPack ? 'Install Pack' : 'Install'}
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
    const matchQ = !q || m.name.toLowerCase().includes(q) || (m.summary && m.summary.toLowerCase().includes(q));
    return matchCat && matchKind && matchQ;
  });

  renderModsGrid(filtered);
}

// 1-Click Install Handler
async function triggerInstall(slug, isModpack) {
  try {
    const type = isModpack ? 'modpack' : 'mod';
    const res = await fetch(`${API_BASE}/launcher/install-local/${type}/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (res.ok) {
      alert(`✅ ${data.message}`);
    } else {
      alert(`⚠️ ${data.error || 'Fehler bei der Installation'}`);
    }
  } catch (err) {
    alert('Fehler bei der Verbindung zum lokalen Rustcraft-Backend: ' + err.message);
  }
}

// Detail Modal
let currentDetailItem = null;
let currentDetailIsPack = false;

async function openDetail(slug, isModpack) {
  try {
    const endpoint = isModpack ? `/modpacks/${slug}` : `/mods/${slug}`;
    const res = await fetch(`${API_BASE}${endpoint}`);
    const item = await res.json();
    currentDetailItem = item;
    currentDetailIsPack = isModpack;

    document.getElementById('modal-title').textContent = item.name;
    document.getElementById('modal-type-badge').textContent = isModpack ? 'Modpack' : (item.kind === 'native' ? 'Native Mod' : 'Content HMOD');
    document.getElementById('modal-summary').textContent = item.summary || item.description || '';
    document.getElementById('modal-desc').textContent = item.description || item.summary || 'Keine weitere Beschreibung vorhanden.';
    document.getElementById('modal-downloads').textContent = `${item.downloads || 0} Downloads`;
    document.getElementById('modal-icon').src = item.iconUrl || 'https://api.dicebear.com/7.x/shapes/svg?seed=' + item.slug;

    const installBtn = document.getElementById('modal-install-btn');
    installBtn.onclick = () => triggerInstall(item.slug, isModpack);

    const deleteBtn = document.getElementById('modal-delete-btn');
    if (deleteBtn) {
      const canDelete = currentUser && (currentUser.role === 'Admin' || currentUser.id === item.authorId);
      deleteBtn.classList.toggle('hidden', !canDelete);
      deleteBtn.classList.toggle('flex', canDelete);
    }

    document.getElementById('detail-modal').classList.remove('hidden');
    document.getElementById('detail-modal').classList.add('flex');
    if (window.lucide) window.lucide.createIcons();
  } catch (e) {
    console.error('Failed to open detail view:', e);
  }
}

function closeDetailModal() {
  document.getElementById('detail-modal').classList.add('hidden');
  document.getElementById('detail-modal').classList.remove('flex');
}

async function deleteCurrentMod() {
  if (!currentDetailItem) return;
  const isPack = currentDetailIsPack;
  deleteItemDirectly(isPack ? 'modpack' : 'mod', currentDetailItem.id, currentDetailItem.name);
}

async function deleteItemDirectly(type, id, name) {
  if (!confirm(`Möchtest du ${type === 'modpack' ? 'das Modpack' : 'die Mod'} "${name}" wirklich unwiderruflich löschen?`)) return;

  const token = localStorage.getItem('rustcraft_jwt');
  if (!token) {
    alert('Bitte melde dich zuerst an!');
    openAuthModal('login');
    return;
  }

  try {
    const endpoint = type === 'modpack' ? `${API_BASE}/admin/items/modpack/${id}` : `${API_BASE}/mods/${id}`;
    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Fehler beim Löschen');

    alert(`Erfolgreich gelöscht: ${name}`);
    closeDetailModal();
    await loadData();
    if (currentUser && currentUser.role === 'Admin') loadAdminDashboard();
  } catch (err) {
    alert('Fehler beim Löschen: ' + err.message);
  }
}

// Studio Logic
function setupStudio() {
  const nameInput = document.getElementById('studio-pack-name');
  const verInput = document.getElementById('studio-pack-version');
  const descInput = document.getElementById('studio-pack-desc');

  if (nameInput) nameInput.addEventListener('input', updateStudioPreview);
  if (verInput) verInput.addEventListener('change', updateStudioPreview);
  if (descInput) descInput.addEventListener('input', updateStudioPreview);
}

function populateStudioMods() {
  const container = document.getElementById('studio-available-mods');
  if (!container) return;
  container.innerHTML = '';

  if (allMods.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">Keine Mods im Katalog verfügbar.</p>`;
    return;
  }

  allMods.forEach(mod => {
    const isChecked = selectedStudioMods.has(mod.slug);
    const item = document.createElement('div');
    item.className = "flex items-center justify-between p-3 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded-xl cursor-pointer transition-colors";
    item.onclick = (e) => {
      if (e.target.tagName !== 'INPUT') {
        const cb = item.querySelector('input');
        cb.checked = !cb.checked;
        toggleStudioMod(mod.slug);
      }
    };

    item.innerHTML = `
      <div class="flex items-center gap-3">
        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleStudioMod('${mod.slug}')" class="w-4 h-4 rounded text-orange-500 focus:ring-orange-500 border-slate-700 bg-slate-900">
        <div>
          <h4 class="text-xs font-bold text-white">${mod.name}</h4>
          <span class="text-[10px] text-slate-400">${mod.summary || ''}</span>
        </div>
      </div>
      <span class="text-[10px] font-semibold text-slate-400 uppercase">${mod.kind === 'native' ? '.hnmod' : '.hmod'}</span>
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
  const countBadge = document.getElementById('studio-mod-count');
  if (countBadge) countBadge.textContent = `${selectedStudioMods.size} Mods gewählt`;
  if (!preview) return;

  const packName = document.getElementById('studio-pack-name')?.value || 'Custom Pack';
  const packVer = document.getElementById('studio-pack-version')?.value || '26.3';
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
    toml += `name = "${mod ? mod.name : slug}"\n`;
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

async function publishStudioPack() {
  const token = localStorage.getItem('rustcraft_jwt');
  if (!token) {
    alert('Bitte melde dich zuerst an, um ein Modpack auf der Plattform zu veröffentlichen!');
    openAuthModal('login');
    return;
  }
  const packName = document.getElementById('studio-pack-name').value.trim();
  const packVer = document.getElementById('studio-pack-version').value;
  const packDesc = document.getElementById('studio-pack-desc').value.trim();
  if (!packName) return alert('Bitte gib einen Namen für das Modpack ein.');

  if (selectedStudioMods.size === 0) {
    return alert('Bitte wähle mindestens eine Mod für dein Modpack aus!');
  }

  const selectedModsList = [];
  selectedStudioMods.forEach(slug => {
    const mod = allMods.find(m => m.slug === slug);
    if (mod) {
      selectedModsList.push({
        id: mod.id,
        slug: mod.slug,
        name: mod.name,
        version: mod.latestVersion || '1.0.0'
      });
    }
  });

  try {
    const res = await fetch(`${API_BASE}/modpacks/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: packName,
        summary: packDesc || `Rustcraft Pack mit ${selectedModsList.length} Mods`,
        description: packDesc,
        gameVersion: packVer,
        mods: selectedModsList,
        version: '1.0.0'
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Fehler beim Veröffentlichen');

    alert(`✅ ${data.message}`);
    await loadData();
    navigateTo('modpacks');
  } catch (err) {
    alert('Fehler beim Erstellen des Modpacks: ' + err.message);
  }
}

async function installStudioPackDirectly() {
  if (selectedStudioMods.size === 0) {
    return alert('Bitte wähle mindestens eine Mod aus der Liste aus!');
  }

  const packName = document.getElementById('studio-pack-name').value;
  let installedCount = 0;
  for (const slug of selectedStudioMods) {
    try {
      const res = await fetch(`${API_BASE}/launcher/install-local/mod/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) installedCount++;
    } catch (_) {}
  }

  alert(`✅ Modpack "${packName}" (${installedCount} Mods) direkt in Rustcraft installiert!`);
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
  const gameVersion = (document.getElementById('upload-game-version') && document.getElementById('upload-game-version').value.trim()) || '26.3';
  const changelog = (document.getElementById('upload-changelog') && document.getElementById('upload-changelog').value.trim()) || 'Initial release';

  if (!name || !summary) return alert('Bitte Name und Zusammenfassung eingeben.');

  const fileInput = document.getElementById('upload-file');
  const file = fileInput && fileInput.files && fileInput.files[0];
  if (!file) {
    return alert('Bitte wähle eine .hnmod oder .hmod Datei aus.');
  }

  const token = localStorage.getItem('rustcraft_jwt');
  if (!token) {
    alert('Bitte melde dich zuerst an!');
    openAuthModal('login');
    return;
  }

  const submitBtn = document.getElementById('upload-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>Wird hochgeladen...</span>';
    if (window.lucide) window.lucide.createIcons();
  }

  try {
    // 1. Create project
    const res = await fetch(`${API_BASE}/mods`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name,
        summary,
        description: summary,
        kind,
        categories: [category],
        supportedGameVersions: [gameVersion]
      })
    });

    const mod = await res.json();
    if (!res.ok) throw new Error(mod.error || 'Fehler beim Erstellen des Mod-Eintrags');

    // 2. Upload binary version
    const formData = new FormData();
    formData.append('version', version);
    formData.append('changelog', changelog);
    formData.append('gameVersion', gameVersion);
    formData.append('file', file);

    const versionRes = await fetch(`${API_BASE}/mods/${mod.id}/versions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const versionData = await versionRes.json();
    if (!versionRes.ok) throw new Error(versionData.error || 'Fehler beim Hochladen der Datei');

    const msg = mod.status === 'pending'
      ? `Projekt "${name}" wurde erfolgreich hochgeladen und wartet auf die Admin-Freigabe!`
      : `Projekt "${name}" wurde direkt freigegeben und im Katalog veröffentlicht!`;
    alert(msg);

    // Reset form
    document.getElementById('upload-name').value = '';
    document.getElementById('upload-summary').value = '';
    if (fileInput) fileInput.value = '';
    const badge = document.getElementById('file-selected-badge');
    if (badge) badge.classList.add('hidden');

    await loadData();
    navigateTo('mods');
  } catch (err) {
    alert('Upload-Fehler: ' + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-lucide="upload" class="w-4 h-4"></i><span>Publish Mod Project & Upload File</span>';
      if (window.lucide) window.lucide.createIcons();
    }
  }
}

// Admin Moderation Dashboard
async function loadAdminDashboard() {
  const token = localStorage.getItem('rustcraft_jwt');
  if (!token) {
    alert('Bitte melde dich als Administrator an.');
    openAuthModal('login');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/admin/submissions`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      if (res.status === 403) alert('Zugriff verweigert: Administrator-Rechte erforderlich.');
      return;
    }

    adminData = await res.json();

    const statPending = document.getElementById('admin-stat-pending');
    const statMods = document.getElementById('admin-stat-mods');
    const statPacks = document.getElementById('admin-stat-packs');
    const tabPendingCount = document.getElementById('admin-tab-pending-count');
    const badge = document.getElementById('admin-pending-badge');

    if (statPending) statPending.textContent = adminData.stats.pendingCount;
    if (statMods) statMods.textContent = adminData.stats.approvedCount;
    if (statPacks) statPacks.textContent = adminData.stats.totalModpacks;
    if (tabPendingCount) tabPendingCount.textContent = adminData.stats.pendingCount;

    if (badge) {
      if (adminData.stats.pendingCount > 0) {
        badge.textContent = adminData.stats.pendingCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    renderAdminPending(adminData.pending);
    renderAdminApproved(adminData.approved);
  } catch (err) {
    console.error('Failed to load admin dashboard:', err);
  }
}

function switchAdminTab(tab) {
  currentAdminTab = tab;
  const isPending = tab === 'pending';
  const tabPending = document.getElementById('admin-tab-pending');
  const tabApproved = document.getElementById('admin-tab-approved');
  const btnPending = document.getElementById('admin-tab-btn-pending');
  const btnApproved = document.getElementById('admin-tab-btn-approved');

  if (tabPending) tabPending.classList.toggle('hidden', !isPending);
  if (tabApproved) tabApproved.classList.toggle('hidden', isPending);

  if (btnPending) {
    btnPending.className = isPending
      ? "px-4 py-2 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-2 transition-all"
      : "px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 flex items-center gap-2 transition-all";
  }

  if (btnApproved) {
    btnApproved.className = !isPending
      ? "px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-2 transition-all"
      : "px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 flex items-center gap-2 transition-all";
  }
}

function renderAdminPending(items) {
  const container = document.getElementById('admin-pending-container');
  if (!container) return;
  container.innerHTML = '';

  if (!items || items.length === 0) {
    container.innerHTML = `
      <div class="p-8 bg-slate-900/60 border border-slate-800 rounded-2xl text-center space-y-2">
        <i data-lucide="check-circle-2" class="w-10 h-10 text-emerald-400 mx-auto"></i>
        <h4 class="text-sm font-bold text-white">Keine ausstehenden Prüfungen</h4>
        <p class="text-xs text-slate-400">Alle eingereichten Mods und Modpacks wurden geprüft und freigegeben.</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = "p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-700 transition-all";
    const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleString('de-DE') : 'Kürzlich';
    const isPack = item.itemType === 'modpack';

    card.innerHTML = `
      <div class="flex items-start gap-4">
        <img src="${item.iconUrl || 'https://api.dicebear.com/7.x/shapes/svg?seed=' + item.slug}" class="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700">
        <div>
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${isPack ? 'bg-amber-500/20 text-amber-400' : 'bg-purple-500/20 text-purple-400'}">
              ${isPack ? 'Modpack' : 'Mod (' + (item.kind || 'native') + ')'}
            </span>
            <span class="text-xs text-slate-500 font-mono">v${item.latestVersion || '1.0.0'}</span>
            <span class="text-xs text-slate-500">• Eingereicht am ${dateStr}</span>
          </div>
          <h4 class="text-base font-bold text-white mt-1">${item.name}</h4>
          <p class="text-xs text-slate-400 mt-1 max-w-xl">${item.summary || item.description || ''}</p>
          <div class="text-[11px] text-slate-500 mt-1.5 flex items-center gap-3">
            <span>Autor: <strong class="text-slate-300">${item.author?.username || 'Unbekannt'}</strong></span>
            ${item.filename ? `<span>Datei: <code class="text-emerald-400 font-mono">${item.filename}</code></span>` : ''}
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2 self-end md:self-center">
        <button onclick="adminReview('${item.itemType}', '${item.id}', 'approve')" class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow flex items-center gap-1.5 transition-all">
          <i data-lucide="check" class="w-3.5 h-3.5"></i>
          Freigeben
        </button>
        <button onclick="adminReview('${item.itemType}', '${item.id}', 'reject')" class="px-3.5 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 hover:text-red-300 font-bold text-xs rounded-xl border border-red-500/30 flex items-center gap-1.5 transition-all">
          <i data-lucide="x" class="w-3.5 h-3.5"></i>
          Ablehnen
        </button>
      </div>
    `;
    container.appendChild(card);
  });
  if (window.lucide) window.lucide.createIcons();
}

function renderAdminApproved(items) {
  const container = document.getElementById('admin-approved-container');
  if (!container) return;
  container.innerHTML = '';

  if (!items || items.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-xs text-slate-500">Keine freigegebenen Einträge vorhanden.</div>`;
    return;
  }

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = "p-4 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center justify-between gap-4";
    const isPack = item.itemType === 'modpack';

    card.innerHTML = `
      <div class="flex items-center gap-3">
        <img src="${item.iconUrl || 'https://api.dicebear.com/7.x/shapes/svg?seed=' + item.slug}" class="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-bold text-white">${item.name}</span>
            <span class="px-2 py-0.2 rounded-full text-[9px] font-bold uppercase ${isPack ? 'bg-amber-500/20 text-amber-400' : 'bg-purple-500/20 text-purple-400'}">
              ${isPack ? 'Pack' : 'Mod'}
            </span>
            <span class="text-[11px] text-emerald-400 font-mono">v${item.latestVersion || '1.0.0'}</span>
          </div>
          <div class="text-[11px] text-slate-400 mt-0.5 flex items-center gap-3">
            <span>${item.downloads || 0} Downloads</span>
            <span>Autor: ${item.author?.username || 'Unbekannt'}</span>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="adminDeleteItem('${item.itemType}', '${item.id}', '${item.name.replace(/'/g, "\\'")}')" class="p-2 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-xl border border-transparent hover:border-red-500/30 transition-all" title="Löschen">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    `;
    container.appendChild(card);
  });
  if (window.lucide) window.lucide.createIcons();
}

async function adminReview(type, id, action) {
  const token = localStorage.getItem('rustcraft_jwt');
  let reason = null;
  if (action === 'reject') {
    reason = prompt('Grund für die Ablehnung angeben:');
    if (reason === null) return;
  }

  try {
    const res = await fetch(`${API_BASE}/admin/review/${type}/${id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ action, reason })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    alert(`✅ ${data.message}`);
    await loadAdminDashboard();
    await loadData();
  } catch (err) {
    alert('Fehler bei der Prüfung: ' + err.message);
  }
}

async function adminDeleteItem(type, id, name) {
  if (!confirm(`Möchtest du ${type === 'modpack' ? 'das Modpack' : 'die Mod'} "${name}" wirklich unwiderruflich löschen?`)) return;

  const token = localStorage.getItem('rustcraft_jwt');
  try {
    const res = await fetch(`${API_BASE}/admin/items/${type}/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    alert(`✅ ${data.message}`);
    await loadAdminDashboard();
    await loadData();
  } catch (err) {
    alert('Fehler beim Löschen: ' + err.message);
  }
}

// Authentication
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
  const pass = document.getElementById('auth-pass').value.trim();
  if (!ident || !pass) return alert('Bitte Zugangsdaten eingeben.');

  const endpoint = currentAuthMode === 'login' ? '/auth/login' : '/auth/register';
  const body = currentAuthMode === 'login' 
    ? { identifier: ident, password: pass }
    : { username: ident, email: `${ident.toLowerCase()}@rustcraft.local`, password: pass };

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Authentifizierung fehlgeschlagen');

    localStorage.setItem('rustcraft_jwt', data.token);
    currentUser = data.user;
    updateAuthUi();
    closeAuthModal();
    alert(`Willkommen zurück, ${currentUser.username}!`);
    await loadData();
    if (currentUser.role === 'Admin') loadAdminDashboard();
  } catch (err) {
    alert(err.message);
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
        if (currentUser.role === 'Admin') loadAdminDashboard();
      }
    })
    .catch(() => localStorage.removeItem('rustcraft_jwt'));
  }
}

function updateAuthUi() {
  const container = document.getElementById('auth-buttons-container');
  const adminTab = document.getElementById('tab-admin');
  if (!currentUser) {
    if (adminTab) adminTab.classList.add('hidden');
    return;
  }

  // Show Admin tab if admin
  if (adminTab && currentUser.role === 'Admin') {
    adminTab.classList.remove('hidden');
  }

  if (container) {
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
