const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/database.json');

class Database {
  constructor() {
    this.data = {
      users: [],
      mods: [],
      mod_versions: [],
      modpacks: [],
      modpack_versions: [],
      categories: [
        { id: 'technology', name: 'Technology & Automation', icon: 'Cpu' },
        { id: 'magic', name: 'Magic & Arcane', icon: 'Wand2' },
        { id: 'adventure', name: 'Adventure & RPG', icon: 'Compass' },
        { id: 'worldgen', name: 'World Generation & Biomes', icon: 'Trees' },
        { id: 'decoration', name: 'Decoration & Building', icon: 'Paintbrush' },
        { id: 'optimization', name: 'Performance & Optimization', icon: 'Zap' },
        { id: 'utility', name: 'Utility & Tools', icon: 'Wrench' }
      ],
      reviews: [],
      downloads: []
    };
    this.init();
  }

  init() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(DB_PATH)) {
      try {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data = { ...this.data, ...parsed };
      } catch (e) {
        console.error('Failed to load DB file, initializing fresh:', e);
        this.save();
      }
    } else {
      this.save();
    }
  }

  save() {
    try {
      const tempPath = `${DB_PATH}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_PATH);
    } catch (e) {
      console.error('Failed to save DB:', e);
    }
  }

  // Generic helpers
  find(table, predicate) {
    return (this.data[table] || []).filter(predicate);
  }

  findOne(table, predicate) {
    return (this.data[table] || []).find(predicate);
  }

  insert(table, item) {
    if (!this.data[table]) this.data[table] = [];
    const entity = { ...item, createdAt: item.createdAt || new Date().toISOString() };
    this.data[table].push(entity);
    this.save();
    return entity;
  }

  update(table, predicate, updates) {
    const item = this.findOne(table, predicate);
    if (!item) return null;
    Object.assign(item, updates, { updatedAt: new Date().toISOString() });
    this.save();
    return item;
  }

  delete(table, predicate) {
    if (!this.data[table]) return false;
    const initialLen = this.data[table].length;
    this.data[table] = this.data[table].filter(item => !predicate(item));
    const deleted = this.data[table].length < initialLen;
    if (deleted) this.save();
    return deleted;
  }
}

const db = new Database();
module.exports = db;
