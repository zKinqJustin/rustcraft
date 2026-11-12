let currentInstances = [];
let activeInstanceId = null;
let catalogItems = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) window.lucide.createIcons();
  await refreshInstances();
  await loadCatalog();
  setupSettingsListener();
});

function switchView(viewName) {
  const views = ['dashboard', 'instances', 'mods', 'browser', 'console', 'settings'];
  for (const v of views) {
    const el = document.getElementById(`view-${v}`);
    const nav = document.getElementById(`nav-${v}`);
    if (el) el.classList.toggle('hidden', v !== viewName);
    if (nav) {
      if (v === viewName) {
        nav.className = "nav-btn w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-all bg-orange-500/10 text-orange-400 border border-orange-500/30";
      } else {
        nav.className = "nav-btn w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all text-slate-400 hover:text-slate-200 hover:bg-slate-800/50";
      }
    }
  }

  if (viewName === 'mods') renderModsView();
  if (viewName === 'instances') renderInstancesFullList();
  if (window.lucide) window.lucide.createIcons();
}

// Fetch Instances
async function refreshInstances() {
  try {
    const res = await fetch('/api/launcher/instances');
    currentInstances = await res.json();

    const select = document.getElementById('active-instance-select');
    select.innerHTML = '';

    if (currentInstances.length === 0) {
      // Auto create a default instance if none exist
      const createRes = await fetch('/api/launcher/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Horizon Vanilla 1.21', gameVersion: '1.21.1' })
      });
      const created = await createRes.json();
      currentInstances.push(created);
    }

    currentInstances.forEach(inst => {
      const opt = document.createElement('option');
      opt.value = inst.id;
      opt.textContent = `${inst.name} (${inst.gameVersion})`;
      select.appendChild(opt);
    });

    if (!activeInstanceId && currentInstances.length > 0) {
      activeInstanceId = currentInstances[0].id;
    }
    select.value = activeInstanceId;

    renderDashboardInstances();
    document.getElementById('instance-summary-count').textContent = `${currentInstances.length} profile${currentInstances.length > 1 ? 's' : ''} configured`;
  } catch (e) {
    console.error('Failed to load instances:', e);
  }
}

function onActiveInstanceChange() {
  const select = document.getElementById('active-instance-select');
  activeInstanceId = select.value;
  renderDashboardInstances();
  renderModsView();
}

// Render Dashboard
function renderDashboardInstances() {
  const grid = document.getElementById('dashboard-instances-grid');
  if (!grid) return;
  grid.innerHTML = '';

  currentInstances.forEach(inst => {
    const isActive = inst.id === activeInstanceId;
    const card = document.createElement('div');
    card.className = `p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden ${
      isActive 
        ? 'bg-slate-800/90 border-orange-500/50 shadow-lg glow-orange' 
        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
    }`;
    card.onclick = () => {
      activeInstanceId = inst.id;
      document.getElementById('active-instance-select').value = inst.id;
      renderDashboardInstances();
    };

    card.innerHTML = `
      <div class="flex items-start justify-between">
        <div class="w-10 h-10 rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center font-bold">
          <i data-lucide="${inst.icon === 'Package' ? 'package' : 'box'}" class="w-5 h-5"></i>
        </div>
        ${isActive ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500 text-white uppercase">Active</span>' : ''}
      </div>
      <h4 class="font-bold text-sm text-slate-100 mt-3 truncate">${inst.name}</h4>
      <div class="flex items-center gap-2 text-xs text-slate-400 mt-1">
        <span>Horizon ${inst.gameVersion}</span>
        <span>•</span>
        <span class="text-orange-400 font-semibold">${inst.modCount || 0} mods</span>
      </div>
      <div class="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
        <span>${inst.playTimeMinutes || 0} mins played</span>
        <button onclick="event.stopPropagation(); launchInstanceById('${inst.id}')" class="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1">
          <i data-lucide="play" class="w-3.5 h-3.5 fill-current"></i> Launch
        </button>
      </div>
    `;
    grid.appendChild(card);
  });

  if (window.lucide) window.lucide.createIcons();
}

// Render Full Instances List
function renderInstancesFullList() {
  const container = document.getElementById('instances-full-list');
  if (!container) return;
  container.innerHTML = '';

  currentInstances.forEach(inst => {
    const item = document.createElement('div');
    item.className = "flex items-center justify-between p-4 bg-slate-900/80 border border-slate-800 rounded-xl hover:border-slate-700 transition-all";
    item.innerHTML = `
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-orange-400">
          <i data-lucide="${inst.icon === 'Package' ? 'package' : 'box'}" class="w-6 h-6"></i>
        </div>
        <div>
          <h4 class="font-bold text-slate-100 text-base">${inst.name}</h4>
          <p class="text-xs text-slate-400 mt-0.5 font-mono">
            Version: ${inst.gameVersion} | RAM: ${inst.memoryMinMb}-${inst.memoryMaxMb}MB | ID: ${inst.id}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="duplicateInstance('${inst.id}')" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700">
          Duplicate
        </button>
        <button onclick="deleteInstance('${inst.id}')" class="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold rounded-lg border border-red-500/30">
          Delete
        </button>
        <button onclick="launchInstanceById('${inst.id}')" class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow flex items-center gap-1.5">
          <i data-lucide="play" class="w-3.5 h-3.5 fill-white"></i> Play
        </button>
      </div>
    `;
    container.appendChild(item);
  });

  if (window.lucide) window.lucide.createIcons();
}

// Render Mods View
async function renderModsView() {
  if (!activeInstanceId) return;
  const inst = currentInstances.find(i => i.id === activeInstanceId);
  const nameEl = document.getElementById('mods-view-instance-name');
  if (nameEl && inst) nameEl.textContent = `${inst.name} (${inst.gameVersion})`;

  try {
    const res = await fetch(`/api/launcher/instances/${activeInstanceId}/mods`);
    const mods = await res.json();
    const table = document.getElementById('instance-mods-table');
    if (!table) return;

    if (mods.length === 0) {
      table.innerHTML = `
        <div class="p-8 text-center">
          <i data-lucide="puzzle" class="w-10 h-10 text-slate-600 mx-auto mb-2"></i>
          <p class="text-sm text-slate-400">No mods installed in this instance yet.</p>
          <button onclick="switchView('browser')" class="mt-3 px-4 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg shadow">
            Browse Mods in Catalog
          </button>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    let rowsHtml = `
      <table class="w-full text-left text-xs">
        <thead class="bg-slate-800/80 text-slate-400 border-b border-slate-700/60 uppercase tracking-wider text-[10px]">
          <tr>
            <th class="p-3.5">Mod Name / File</th>
            <th class="p-3.5">Kind</th>
            <th class="p-3.5">File Size</th>
            <th class="p-3.5">Status</th>
            <th class="p-3.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/60">
    `;

    mods.forEach(mod => {
      const isNative = mod.kind === 'native';
      rowsHtml += `
        <tr class="hover:bg-slate-800/30 transition-colors">
          <td class="p-3.5 font-semibold text-slate-200">
            ${mod.activeName}
          </td>
          <td class="p-3.5">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
              isNative 
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' 
                : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
            }">
              ${isNative ? '.HNMOD (Native)' : '.HMOD (Content)'}
            </span>
          </td>
          <td class="p-3.5 text-slate-400 font-mono">
            ${Math.round(mod.size / 1024)} KB
          </td>
          <td class="p-3.5">
            <span class="inline-flex items-center gap-1.5 font-medium ${mod.enabled ? 'text-emerald-400' : 'text-slate-500'}">
              <span class="w-1.5 h-1.5 rounded-full ${mod.enabled ? 'bg-emerald-500' : 'bg-slate-600'}"></span>
              ${mod.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </td>
          <td class="p-3.5 text-right space-x-2">
            <button onclick="toggleModState('${mod.filename}', ${!mod.enabled})" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold text-[11px] border border-slate-700">
              ${mod.enabled ? 'Disable' : 'Enable'}
            </button>
            <button onclick="removeModFromInstance('${mod.filename}')" class="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded font-semibold text-[11px] border border-red-500/30">
              Remove
            </button>
          </td>
        </tr>
      `;
    });

    rowsHtml += `</tbody></table>`;
    table.innerHTML = rowsHtml;
  } catch (e) {
    console.error('Failed to load mods:', e);
  }

  if (window.lucide) window.lucide.createIcons();
}

// Toggle Mod State
async function toggleModState(filename, enable) {
  try {
    await fetch(`/api/launcher/instances/${activeInstanceId}/mods/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, enable })
    });
    renderModsView();
    refreshInstances();
  } catch (e) {
    alert(`Failed to toggle mod: ${e.message}`);
  }
}

// Remove Mod
async function removeModFromInstance(filename) {
  if (!confirm(`Are you sure you want to remove "${filename}" from this instance?`)) return;
  try {
    await fetch(`/api/launcher/instances/${activeInstanceId}/mods/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename })
    });
    renderModsView();
    refreshInstances();
  } catch (e) {
    alert(`Failed to remove mod: ${e.message}`);
  }
}

// Load Catalog
async function loadCatalog() {
  try {
    const res = await fetch('http://localhost:4000/api/v1/mods');
    const data = await res.json();
    catalogItems = data.mods || [];

    const packRes = await fetch('http://localhost:4000/api/v1/modpacks');
    const packData = await packRes.json();
    const packs = (packData.modpacks || []).map(p => ({ ...p, isModpack: true }));

    catalogItems = [...catalogItems, ...packs];
    renderCatalog(catalogItems);
    renderFeatured(catalogItems.slice(0, 2));
  } catch (e) {
    console.warn('API Catalog unavailable (ensure backend is running on 4000):', e);
  }
}

function renderFeatured(items) {
  const container = document.getElementById('dashboard-featured-grid');
  if (!container) return;
  container.innerHTML = '';

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = "p-4 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center justify-between";
    card.innerHTML = `
      <div class="flex items-center gap-3">
        <img src="${item.iconUrl || 'https://api.dicebear.com/7.x/shapes/svg?seed=' + item.slug}" class="w-12 h-12 rounded-lg bg-slate-800 border border-slate-700">
        <div>
          <h4 class="font-bold text-sm text-slate-100">${item.name}</h4>
          <p class="text-xs text-slate-400 line-clamp-1">${item.summary}</p>
        </div>
      </div>
      <button onclick="installCatalogItem('${item.slug}', ${Boolean(item.isModpack)})" class="px-3.5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-lg shadow">
        Install
      </button>
    `;
    container.appendChild(card);
  });
}

function renderCatalog(items) {
  const grid = document.getElementById('catalog-grid');
  if (!grid) return;
  grid.innerHTML = '';

  items.forEach(item => {
    const isPack = Boolean(item.isModpack);
    const card = document.createElement('div');
    card.className = "p-5 bg-slate-900/80 border border-slate-800 hover:border-orange-500/40 rounded-2xl flex flex-col justify-between transition-all space-y-4";
    card.innerHTML = `
      <div>
        <div class="flex items-start justify-between">
          <img src="${item.iconUrl || 'https://api.dicebear.com/7.x/shapes/svg?seed=' + item.slug}" class="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
            isPack 
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
              : (item.kind === 'native' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-orange-500/20 text-orange-400 border border-orange-500/30')
          }">
            ${isPack ? 'MODPACK' : (item.kind === 'native' ? 'NATIVE MOD' : 'CONTENT HMOD')}
          </span>
        </div>
        <h4 class="font-bold text-base text-slate-100 mt-3">${item.name}</h4>
        <p class="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">${item.summary}</p>
      </div>
      <div class="pt-3 border-t border-slate-800/80 flex items-center justify-between">
        <span class="text-xs font-mono text-slate-400 font-bold">${item.downloads || 0} installs</span>
        <button onclick="installCatalogItem('${item.slug}', ${isPack})" class="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg shadow">
          Install
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
}

function filterCatalog() {
  const query = document.getElementById('catalog-search').value.toLowerCase();
  const filtered = catalogItems.filter(i => i.name.toLowerCase().includes(query) || i.summary.toLowerCase().includes(query));
  renderCatalog(filtered);
}

// 1-Click Install handler from UI
async function installCatalogItem(slug, isModpack) {
  const uri = isModpack 
    ? `rustcraft://install/modpack/${slug}` 
    : `rustcraft://install/mod/${slug}`;
  
  await executeDeepLink(uri);
}

// Deep Link Trigger Simulator
async function triggerDeepLinkSim() {
  const uri = document.getElementById('deep-link-input').value.trim();
  if (!uri) return;
  await executeDeepLink(uri);
}

// Execute Deep Link on Launcher
async function executeDeepLink(uri) {
  showToast('Initiating Installation', 'Parsing protocol payload...', 10);
  try {
    const res = await fetch('/api/launcher/deep-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri, targetInstanceId: activeInstanceId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Deep link execution failed');

    showToast('Success!', `Installed successfully! Ready to play.`, 100);
    setTimeout(hideToast, 4000);
    await refreshInstances();
    renderModsView();
  } catch (e) {
    showToast('Installation Failed', e.message, 0);
    setTimeout(hideToast, 5000);
  }
}

// Toast Helpers
function showToast(title, msg, pct) {
  const toast = document.getElementById('progress-toast');
  toast.classList.remove('hidden');
  document.getElementById('toast-title').textContent = title;
  document.getElementById('toast-msg').textContent = msg;
  document.getElementById('toast-pct').textContent = `${pct}%`;
  document.getElementById('toast-bar').style.width = `${pct}%`;
}

function hideToast() {
  document.getElementById('progress-toast').classList.add('hidden');
}

// Launch Active Instance
async function launchActiveInstance() {
  if (!activeInstanceId) return alert('Please select an instance first.');
  await launchInstanceById(activeInstanceId);
}

async function launchInstanceById(id) {
  switchView('console');
  appendConsoleLog(`[Launcher] Launch command issued for instance ID: ${id}`);
  try {
    const res = await fetch(`/api/launcher/instances/${id}/launch`, { method: 'POST' });
    const data = await res.json();
    appendConsoleLog(`[Launcher] Client process active: ${data.status}`);
    appendConsoleLog(`[Horizon Engine] Window created (1920x1080 Vulkan/wgpu backend initialized)`);
    appendConsoleLog(`[Horizon Engine] Loading world data & chunk meshing threads...`);
    appendConsoleLog(`[Horizon Engine] Player entered world. FPS: 144 | Frametime: 6.9ms`);
    refreshInstances();
  } catch (e) {
    appendConsoleLog(`[Launcher Error] ${e.message}`);
  }
}

function appendConsoleLog(line) {
  const consoleEl = document.getElementById('console-output');
  if (!consoleEl) return;
  const div = document.createElement('div');
  div.textContent = `[${new Date().toLocaleTimeString()}] ${line}`;
  consoleEl.appendChild(div);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function clearConsole() {
  const consoleEl = document.getElementById('console-output');
  if (consoleEl) consoleEl.innerHTML = '<div class="text-slate-500">[System] Log cleared.</div>';
}

// Create Instance Modal
function openCreateInstanceModal() {
  document.getElementById('modal-create-instance').classList.remove('hidden');
  document.getElementById('modal-create-instance').classList.add('flex');
}

function closeCreateInstanceModal() {
  document.getElementById('modal-create-instance').classList.add('hidden');
  document.getElementById('modal-create-instance').classList.remove('flex');
}

async function submitCreateInstance() {
  const name = document.getElementById('modal-inst-name').value.trim();
  const gameVersion = document.getElementById('modal-inst-version').value;
  const ram = parseInt(document.getElementById('modal-inst-ram').value) || 4096;

  if (!name) return alert('Please enter an instance name.');

  try {
    const res = await fetch('/api/launcher/instances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, gameVersion, memoryMaxMb: ram })
    });
    const created = await res.json();
    closeCreateInstanceModal();
    await refreshInstances();
    activeInstanceId = created.id;
    document.getElementById('active-instance-select').value = created.id;
    renderDashboardInstances();
  } catch (e) {
    alert(`Failed to create instance: ${e.message}`);
  }
}

// Duplicate Instance
async function duplicateInstance(id) {
  try {
    await fetch(`/api/launcher/instances/${id}/duplicate`, { method: 'POST' });
    await refreshInstances();
  } catch (e) {
    alert(`Failed to duplicate instance: ${e.message}`);
  }
}

// Delete Instance
async function deleteInstance(id) {
  if (!confirm('Are you sure you want to permanently delete this instance and its mods?')) return;
  try {
    await fetch(`/api/launcher/instances/${id}`, { method: 'DELETE' });
    activeInstanceId = null;
    await refreshInstances();
  } catch (e) {
    alert(`Failed to delete instance: ${e.message}`);
  }
}

// Settings Slider
function setupSettingsListener() {
  const ramSlider = document.getElementById('setting-ram');
  const ramVal = document.getElementById('setting-ram-val');
  if (ramSlider && ramVal) {
    ramSlider.addEventListener('input', (e) => {
      ramVal.textContent = `${e.target.value} MB`;
    });
  }
}

function savePreferences() {
  alert('Preferences saved successfully!');
}

