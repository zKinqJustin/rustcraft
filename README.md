# ⚡ Rustcraft

> **Next-Generation Minecraft & Horizon Launcher, Modding Platform, and Ecosystem**

[![CI/CD Status](https://github.com/rustcraft/rustcraft/actions/workflows/ci.yml/badge.svg)](https://github.com/rustcraft/rustcraft/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Rustcraft ist ein vollständiges, professionelles Software-Ökosystem für Minecraft- und Horizon-Spieler, Modder und Modpack-Ersteller. Es verbindet einen hochmodernen Desktop-Launcher, ein automatisiertes Mod-Build-System (`.hmod` / `.hnmod`), eine moderne Web-Plattform (CurseForge/Modrinth-Stil) und eine zuverlässige REST-API.

---

## 🌟 Kernfunktionen

- 🚀 **Rustcraft Launcher**:
  - Eigenständiges modernes Dark-Mode-Design.
  - Vollständige Instanzen-Isolation (Vanilla, Modded, eigene Profile).
  - Automatisches HMOD-Build-System: Mods direkt von der Website oder aus dem Launcher installieren ohne manuelle Konsole!
  - Native Mod Isolation & Sicherheitsvalidierung.
  - Nahtloser Spielstart, RAM-Allokation, JVM/Engine-Parameter, Crash-Logs und Reparatur-Funktionen.
  - Sicheres Deep-Linking-Protokoll (`rustcraft://`).

- 🌐 **Rustcraft Web-Plattform**:
  - Mod- und Modpack-Katalog mit Filtern nach Kategorien, Versionen und Beliebtheit.
  - 1-Click-Installation direkt in den Rustcraft Launcher.
  - Interaktiver visueller Modpack-Editor im Webbrowser.
  - Upload-Portal & Entwickler-Dashboard für Mod- und Modpack-Autoren.

- ⚙️ **Rustcraft Backend & API**:
  - Einheitliches Account-System mit JWT-Authentifizierung & Rollen (`User`, `Developer`, `Moderator`, `Admin`).
  - SHA-256 Integritätsprüfung aller hochgeladenen und ausgelieferten Binärdateien.
  - RESTful API v1 für Suche, Versionierung, Download-Zähler und Update-Benachrichtigungen.

---

## 🛠️ Projektarchitektur

```text
Rustcraft/
├── launcher/                  # Desktop Launcher (UI, Instances, Game Engine Bridge, Deep Link)
├── website/                   # Web-Plattform (React, Tailwind CSS, Dark Theme)
├── backend/                   # REST API Server & Storage Manager
├── crates/                    # Mod Build-System & Core Rust Utilities
│   └── rustcraft-mod-builder/ # HMOD & Pack Validation and Packaging Engine
├── docs/                      # Architektur- & Entwicklungsdokumentation
└── .github/workflows/         # CI/CD Workflows
```

---

## 🚀 Schnelleinstieg

### 1. Backend starten
```bash
cd backend
npm install
npm run start
```
Die API läuft standardmäßig unter `http://localhost:4000/api/v1`.

### 2. Website starten
```bash
cd website
npm install
npm run dev
```
Die Web-Plattform ist unter `http://localhost:3000` erreichbar.

### 3. Launcher starten
```bash
cd launcher
npm install
npm run start
```

---

## 📜 Lizenz & Danksagung

Rustcraft steht unter der [MIT License](LICENSE).  
Basiert auf den technischen Grundlagen und Konzepten von [Horizon](https://github.com/horizon-rust/horizon). Siehe [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
