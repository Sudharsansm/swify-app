# Swify | Premium Task & Logic Suite

Swify is a state-of-the-art, high-performance **Progressive Web Application (PWA)** designed for modern productivity. It combines the simplicity of Google Keep with advanced task management, multi-media capabilities, and a sophisticated notification engine.

---

## 🚀 App Overview

Swify is built with a **Diamond Standard** design philosophy, featuring a glassmorphism UI, a focus-centered user experience, and full device responsiveness. It is designed to be installed on any device (Android, iOS, Windows, macOS) and provides a native standalone experience.

### Key Highlights:
- **Project Name:** Swify
- **Architecture:** Decoupled React (Vite) Frontend + Flask (Python) Backend
- **Data Model:** SQL-based storage with multi-user isolation
- **UI Style:** Modern Glassmorphism with Dark/Indigo aesthetics

---

## 🛠️ Performance Features

### 1. Advanced Multi-Media Support
Unlike basic notes apps, Swify supports multiple simultaneous attachments per task:
- **Images:** Live previews with full-screen view.
- **Videos:** Integrated player for quick reference.
- **Audio:** Built-in audio controller for voice notes or sound recordings.
- **Files:** Support for generic downloads.

### 2. Multi-Stage Notification Engine
A sophisticated reminder system that follows a granular schedule:
- **Pre-Deadline:** 5 minutes alert before the task is due.
- **At Deadline:** Immediate notification at the exact due time.
- **Escalation Loop:** If incomplete, reminders repeat at:
    - 10 minutes, 30 minutes, 1 hour, 5 hours, 12 hours, and 24 hours.
- **Persistence:** Reminders continue **daily** after the 24-hour mark until the task is completed.
- *Includes a "Test Sound" feature in the sidebar to verify audio alerts.*

### 3. Deep Focus & Time Management
- **Global Focus Timer:** Pomodoro-style timer integrated into the main dashboard.
- **Per-Task Timers:** Individual timers for specific notes to track work duration.
- **World Clock:** Live timezone-aware clock and date display.

### 4. PWA (Diamond Grade)
- **Installability:** High-resolution maskable branding (Stylized Swift Bird logo).
- **Shortcuts:** Context-menu shortcuts for "Add New Note" and "View TO-DO".
- **Offline Support:** Service worker caching for instant loading without internet.
- **Native Experience:** Fullscreen standalone mode with a custom splash screen.

### 5. Multi-User Privacy & Isolation
- **Device-ID Binding:** Automatically generates a unique "Digital Fingerprint" for every device.
- **Private Database:** Notes are filtered by UserID on the server, ensuring that users can only see and edit their own data.

---

## 💻 Tech Stack

### Frontend
- **Framework:** React.js (via Vite)
- **State Management:** React Hooks (useState, useEffect, useRef)
- **Styling:** Vanilla CSS3 with Advanced Flexbox/Grid and Glassmorphism
- **API Client:** Axios with Request Interceptors for User Identification
- **PWA:** Web Manifest API + Service Worker API

### Backend
- **Language:** Python 3.10+
- **Framework:** Flask
- **ORM:** SQLAlchemy (SQLite)
- **Security:** Werkzeug secure filenames, CORS protection
- **Concurrency:** Multi-threaded Flask server

---

## 📁 Project Structure

```text
swify/
├── app.py                  # Flask Application & Models
├── todo_v3.db              # SQLite Database
├── static/
│   ├── uploads/            # User-uploaded media
│   └── sounds/             # Notification audio files
└── frontend/
    ├── src/
    │   ├── App.jsx         # Main React Logic
    │   ├── api.js          # API Client Configuration
    │   └── index.css       # Core Design System
    ├── public/
    │   ├── manifest.json   # PWA Identity
    │   ├── sw.js           # Background Service Worker
    │   └── icons/          # Swify Branding Assets
    └── index.html          # PWA Entry Point
```

---

## ⚙️ Setup & Installation

### Backend Setup
1. Install dependencies:
   ```bash
   pip install flask flask-sqlalchemy flask-cors
   ```
2. Start the server:
   ```bash
   python app.py
   ```

### Frontend Setup
1. Navigate to the folder:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

---

## 🔮 Future Scalability
- **Cloud Database:** Easily migrate from SQLite to PostgreSQL for high-traffic environments.
- **Social Login:** Ready for Google/GitHub OAuth integration.
- **AI Integration:** Structure is prepared for "AI Search" and "Smart Task Summaries".

---
*Created by Sudharsan for the USER. © 2026 Swify Project.*
