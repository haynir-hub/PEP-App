// server.js
console.log('--- Loading server.js v123 (PDF Enabled) ---');

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');

// ================================================================= //
// --->   הפעלת חבילות ה-PDF לצורך יצוא   <---
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
// ================================================================= //

const app = express();

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

/* ================= Config ================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

const DB_PATH = path.join(__dirname, 'db', 'app.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('Could not connect to database', err);
  else console.log('Connected to database:', DB_PATH);
});

/* ================= Middleware ================= */
app.use((req, res, next) => {
  console.log(`[Request Logger] Method: ${req.method}, URL: ${req.originalUrl}`);
  next();
});

app.set('trust proxy', 1); 

app.use(bodyParser.json());
app.use(session({
  secret: 'a-very-strong-and-long-secret-key-that-you-should-change',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: true, 
    httpOnly: true,
    sameSite: 'none'
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

/* ================= Guards ================= */
const isApiAuthenticated = (req, res, next) => {
  if (req.session.user) return next();
  console.warn('[401] Not authenticated:', req.method, req.path);
  res.status(401).json({ error: 'Not authenticated' });
};
const isAdmin = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Not authorized' });
  next();
};
const authorizePageAccess = (req, res, next) => {
  if (!req.session.user) return res.redirect('/auth');
  const user = req.session.user;
  const viewAs = req.session.viewAsOrg || null;
  const requestedPath = req.path;
  if (user.role === 'admin' && requestedPath.startsWith('/admin')) return next();
  if (user.role === 'admin' && !viewAs) {
    if (requestedPath.startsWith('/admin')) return next();
    return res.redirect('/admin');
  }
  const org = viewAs || user.organization;
  if (org === 'NIKA') {
    if (requestedPath.startsWith('/nika-builder') || requestedPath.startsWith('/my-lessons-nika')) return next();
    return res.redirect('/nika-builder');
  } else {
    if (requestedPath.startsWith('/lesson-builder') || requestedPath.startsWith('/my-lessons-pep')) return next();
    return res.redirect('/lesson-builder');
  }
};

/* ================= Tiny SQLite helpers ================= */
function run(sql, params = []) { return new Promise((res, rej)=>db.run(sql, params, function(e){ e?rej(e):res(this); })); }
function get(sql, params = []) { return new Promise((res, rej)=>db.get(sql, params, (e,row)=> e?rej(e):res(row))); }
function all(sql, params = []) { return new Promise((res, rej)=>db.all(sql, params, (e,rows)=> e?rej(e):res(rows))); }
async function columnExists(table, column){ const cols = await all(`PRAGMA table_info(${table})`); return cols.some(c=>c.name===column); }
async function tableExists(table){ const row = await get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [table]); return !!row; }

/* ================= Schema Auto-Heal ================= */
async function ensureSchema() {
  console.log('Running ensureSchema()…');

  // users
  if (!await tableExists('users')) {
    await run(`CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      fullname TEXT DEFAULT '',
      role TEXT NOT NULL DEFAULT 'member',
      organization TEXT NOT NULL DEFAULT 'PEP',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  } else {
    if (!await columnExists('users','fullname'))      await run(`ALTER TABLE users ADD COLUMN fullname TEXT DEFAULT ''`);
    if (!await columnExists('users','role'))          await run(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'`);
    if (!await columnExists('users','organization'))  await run(`ALTER TABLE users ADD COLUMN organization TEXT NOT NULL DEFAULT 'PEP'`);
    if (!await columnExists('users','created_at')) {
      await run(`ALTER TABLE users ADD COLUMN created_at DATETIME`);
      await run(`UPDATE users SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE created_at IS NULL`);
    }
  }

  // subjects
  if (!await tableExists('subjects')) {
    await run(`CREATE TABLE subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  } else {
    if (!await columnExists('subjects','created_at')) {
      await run(`ALTER TABLE subjects ADD COLUMN created_at DATETIME`);
      await run(`UPDATE subjects SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE created_at IS NULL`);
    }
  }

  // exercises (PEP)
  if (!await tableExists('exercises')) {
    await run(`CREATE TABLE exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      category TEXT DEFAULT '',
      description TEXT DEFAULT '',
      equipment TEXT DEFAULT '',
      age_group TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      type TEXT NOT NULL DEFAULT 'main',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  } else {
    if (!await columnExists('exercises','category'))  await run(`ALTER TABLE exercises ADD COLUMN category TEXT DEFAULT ''`);
    if (!await columnExists('exercises','description')) await run(`ALTER TABLE exercises ADD COLUMN description TEXT DEFAULT ''`);
    if (!await columnExists('exercises','equipment')) await run(`ALTER TABLE exercises ADD COLUMN equipment TEXT DEFAULT ''`);
    if (!await columnExists('exercises','age_group')) await run(`ALTER TABLE exercises ADD COLUMN age_group TEXT DEFAULT ''`);
    if (!await columnExists('exercises','image_url')) await run(`ALTER TABLE exercises ADD COLUMN image_url TEXT DEFAULT ''`);
    if (!await columnExists('exercises','type'))      await run(`ALTER TABLE exercises ADD COLUMN type TEXT NOT NULL DEFAULT 'main'`);
    if (!await columnExists('exercises','created_at')) {
      await run(`ALTER TABLE exercises ADD COLUMN created_at DATETIME`);
      await run(`UPDATE exercises SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE created_at IS NULL`);
    }
  }

  // nika_games
  if (!await tableExists('nika_games')) {
    await run(`CREATE TABLE nika_games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      equipment TEXT DEFAULT '',
      duration_minutes INTEGER,
      image_url TEXT DEFAULT '',
      type TEXT NOT NULL DEFAULT 'main',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  } else {
    if (!await columnExists('nika_games','description')) await run(`ALTER TABLE nika_games ADD COLUMN description TEXT DEFAULT ''`);
    if (!await columnExists('nika_games','equipment'))  await run(`ALTER TABLE nika_games ADD COLUMN equipment TEXT DEFAULT ''`);
    if (!await columnExists('nika_games','duration_minutes')) await run(`ALTER TABLE nika_games ADD COLUMN duration_minutes INTEGER`);
    if (!await columnExists('nika_games','image_url'))  await run(`ALTER TABLE nika_games ADD COLUMN image_url TEXT DEFAULT ''`);
    if (!await columnExists('nika_games','type'))       await run(`ALTER TABLE nika_games ADD COLUMN type TEXT NOT NULL DEFAULT 'main'`);
    if (!await columnExists('nika_games','created_at')) {
      await run(`ALTER TABLE nika_games ADD COLUMN created_at DATETIME`);
      await run(`UPDATE nika_games SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE created_at IS NULL`);
    }
  }

  // lesson_plans
  if (!await tableExists('lesson_plans')) {
    await run(`CREATE TABLE lesson_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      topic TEXT DEFAULT '',
      subject TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      plan_data TEXT NOT NULL,
      organization TEXT NOT NULL DEFAULT 'PEP',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
  } else {
    if (!await columnExists('lesson_plans','topic')) await run(`ALTER TABLE lesson_plans ADD COLUMN topic TEXT DEFAULT ''`);
    if (!await columnExists('lesson_plans','subject')) await run(`ALTER TABLE lesson_plans ADD COLUMN subject TEXT DEFAULT ''`);
    if (!await columnExists('lesson_plans','notes')) await run(`ALTER TABLE lesson_plans ADD COLUMN notes TEXT DEFAULT ''`);
    if (!await columnExists('lesson_plans','organization')) await run(`ALTER TABLE lesson_plans ADD COLUMN organization TEXT NOT NULL DEFAULT 'PEP'`);
    if (!await columnExists('lesson_plans','created_at')) {
      await run(`ALTER TABLE lesson_plans ADD COLUMN created_at DATETIME`);
      await run(`UPDATE lesson_plans SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE created_at IS NULL`);
    }
  }

  console.log('ensureSchema() done.');
}

/* ================= Helpers ================= */
function sanitizeFilename(name='lesson'){
  const base = String(name).replace(/[\"\\/\|\*\:\?<>\r\n]+/g,' ').trim().slice(0,120) || 'lesson';
  return base;
}

async function getFullLessonPlan(plan_id, user, db_conn){
  return new Promise((resolve, reject) => {
    let sql = "SELECT * FROM lesson_plans WHERE id = ?";
    const params = [plan_id];
    if (user.role !== 'admin') { sql += " AND user_id = ?"; params.push(user.id); }
    db_conn.get(sql, params, (err, plan) => {
      if (err || !plan) return reject(err || new Error("Plan not found"));
      const plan_data = JSON.parse(plan.plan_data || '{}');
      const allIds = [
        ...(plan_data.warmup || []),
        ...(plan_data.main || []),
        ...(plan_data.finish || []),
        ...(plan_data.games || [])
      ];
      if (!allIds.length){ plan.items = []; return resolve(plan); }
      const placeholders = allIds.map(()=>'?').join(',');
      const table = plan.organization === 'NIKA' ? 'nika_games' : 'exercises';
      const itemSql = `SELECT * FROM ${table} WHERE id IN (${placeholders})`;
      db_conn.all(itemSql, allIds, (err2, items) => { if (err2) return reject(err2); plan.items = items; resolve(plan); });
    });
  });
}

async function generateHtmlForPdf(planData, user){
  let template = await fs.readFile(path.join(__dirname, 'pdf-template.html'), 'utf-8');

  const org = planData.organization === 'NIKA' ? 'NIKA' : 'PEP';
  const logoSrc = (org === 'NIKA')
    ? `${BASE_URL}/assets/nika-logo.png`
    : `${BASE_URL}/assets/pep-logo.png`;
  const bodyClass = (org === 'NIKA') ? 'nika-background' : 'pep-background';
  const orgClass  = (org === 'NIKA') ? 'org-nika' : 'org-pep';

  template = template.replaceAll('{{logoHtml}}', `<img class="pdf-logo-img" src="${logoSrc}" alt="${org} logo">`);
  template = template.replaceAll('{{bodyClass}}', bodyClass);
  template = template.replaceAll('{{orgClass}}', orgClass);

  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const toBullets = txt => {
    if (!txt) return '';
    const lines = String(txt).replace(/\r/g,'').split('\n').map(x=>x.trim()).filter(Boolean);
    if (!lines.length) return '';
    return `<ul>${lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>`;
  };

  const plan_data = JSON.parse(planData.plan_data || '{}');
  const itemMap = new Map((planData.items||[]).map(i=>[i.id,i]));
  const itemHtml = (ids) => (!ids || !ids.length) ? '' :
    ids.map(id => itemMap.get(id)).filter(Boolean).map(item => {
      const img = item.image_url ? `<img src="${item.image_url.startsWith('http')? item.image_url : (BASE_URL + item.image_url)}" alt="">` : '';
      return `<div class="item-card">${img}<div class="details"><h4>${esc(item.name)}</h4>${toBullets(item.description)}</div></div>`;
    }).join('');

  const allItems = Object.values(plan_data).flat().map(id=>itemMap.get(id)).filter(Boolean);
  const eq = new Set();
  allItems.forEach(it => { (it?.equipment || '').split(',').forEach(e => { e = e.trim(); if(e) eq.add(e); }); });

  template = template.replaceAll('{{lessonName}}', esc(planData.name||''));
  template = template.replaceAll('{{date}}', new Date().toLocaleDateString('he-IL'));
  template = template.replaceAll('{{teacherName}}', esc(user.fullname||user.email||''));
  template = template.replaceAll('{{equipmentList}}', eq.size?Array.from(eq).join(', ') : 'אין ציוד נדרש.');
  template = template.replaceAll('{{warmupItems}}', itemHtml(plan_data.warmup));
  template = template.replaceAll('{{mainItems}}', itemHtml(plan_data.main));
  template = template.replaceAll('{{finishItems}}', itemHtml(plan_data.finish || plan_data.games));

  if ((!plan_data.warmup || !plan_data.warmup.length) && (!plan_data.games || !plan_data.games.length))
    template = template.replace(/<div class="section" id="warmup-section">[\s\S]*?<\/div>/,'');
  if (!plan_data.main || !plan_data.main.length)
    template = template.replace(/<div class="section" id="main-section">[\s\S]*?<\/div>/,'');
  if ((!plan_data.finish || !plan_data.finish.length) && (!plan_data.games || !plan_data.games.length))
    template = template.replace(/<div class="section" id="finish-section">[\s\S]*?<\/div>/,'');

  return template;
}

/* ================= Auth & User APIs ================= */
app.post('/api/users/login', (req, res) => {
  const { email, password } = req.body || {};
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err || !user) return res.status(400).json({ error: 'משתמש או סיסמה שגויים' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(400).json({ error: 'משתמש או סיסמה שגויים' });
    req.session.user = user;
    if (user.role === 'admin') return res.json({ redirectUrl: '/admin' });
    return res.json({ redirectUrl: (user.organization === 'NIKA') ? '/nika-builder' : '/lesson-builder' });
  });
});

app.get('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: 'Could not log out.' });
    }
    res.clearCookie('connect.sid'); 
    res.json({ message: 'Logged out successfully' });
  });
});

app.get('/api/get-current-user', isApiAuthenticated, (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ fullName: req.session.user.fullname || '' });
});

app.get('/api/auth/me', isApiAuthenticated, (req, res) => {
  const { password_hash, ...userToSend } = req.session.user;
  res.json({ user: userToSend, viewAsOrg: req.session.viewAsOrg || null });
});
app.get('/api/auth/view-as-pep', (req, res) => { if (req.session.user?.role === 'admin') req.session.viewAsOrg = 'PEP'; res.redirect('/lesson-builder'); });
app.get('/api/auth/view-as-nika', (req, res) => { if (req.session.user?.role === 'admin') req.session.viewAsOrg = 'NIKA'; res.redirect('/nika-builder'); });
app.get('/api/auth/return-to-admin', (req, res) => { if (req.session.user) delete req.session.viewAsOrg; res.redirect('/admin'); });

/* ================= Admin APIs ================= */
app.get('/api/admin/users', isApiAuthenticated, isAdmin, async (req, res) => { try { const rows = await all('SELECT id, email, fullname, role, organization, created_at FROM users ORDER BY created_at DESC'); res.json({ users: rows }); } catch (e) { res.status(500).json({ error: e.message }); }});
app.post('/api/admin/users', isApiAuthenticated, isAdmin, async (req, res) => { try { const { email, password, fullname, role, organization } = req.body || {}; if (!email || !password) return res.status(400).json({ error: 'Email and password are required' }); const hash = await bcrypt.hash(String(password), 10); const r = await run( `INSERT INTO users (email, password_hash, fullname, role, organization) VALUES (?, ?, ?, ?, ?)`, [email, hash, fullname || '', role || 'member', organization || 'PEP'] ); res.json({ message: 'User created', id: r.lastID }); } catch (e) { res.status(400).json({ error: e.message }); }});
app.put('/api/admin/users/:id', isApiAuthenticated, isAdmin, async (req, res) => { try { const { email, password, fullname, role, organization } = req.body || {}; if (password) { const hash = await bcrypt.hash(String(password), 10); await run(`UPDATE users SET email=?, password_hash=?, fullname=?, role=?, organization=? WHERE id=?`, [email, hash, fullname || '', role || 'member', organization || 'PEP', req.params.id]); } else { await run(`UPDATE users SET email=?, fullname=?, role=?, organization=? WHERE id=?`, [email, fullname || '', role || 'member', organization || 'PEP', req.params.id]); } res.json({ message: 'User updated' }); } catch (e) { res.status(400).json({ error: e.message }); }});
app.delete('/api/admin/users/:id', isApiAuthenticated, isAdmin, async (req, res) => { try { await run(`DELETE FROM users WHERE id=?`, [req.params.id]); res.json({ message: 'User deleted' }); } catch (e) { res.status(400).json({ error: e.message }); }});

/* ================= Builder data ================= */
app.get('/api/builder-data/pep', isApiAuthenticated, async (req, res) => { try { const exercises = await all('SELECT * FROM exercises ORDER BY name'); const subjects  = await all('SELECT * FROM subjects ORDER BY name'); res.json({ exercises, subjects }); } catch (e) { res.status(500).json({ error: e.message }); }});
app.get('/api/builder-data/nika', isApiAuthenticated, async (req, res) => { try { const games = await all('SELECT * FROM nika_games ORDER BY name'); res.json({ games }); } catch (e) { res.status(500).json({ error: e.message }); }});

/* ================= Lesson plans ================= */
app.get('/api/my-lesson-plans', isApiAuthenticated, async (req, res) => { try { const uid = req.session.user.id; const rows = await all('SELECT * FROM lesson_plans WHERE user_id = ? ORDER BY created_at DESC', [uid]); res.json({ lesson_plans: rows }); } catch (e) { res.status(500).json({ error: e.message }); }});
app.post('/api/lesson-plans', isApiAuthenticated, async (req, res) => { try { const { name, topic, subject, notes, plan_data } = req.body || {}; if (!name || !plan_data) return res.status(400).json({ error: 'Name and plan data are required' }); const org = req.session.viewAsOrg || req.session.user.organization; const uid = req.session.user.id; const sql = `INSERT INTO lesson_plans (user_id, name, topic, subject, notes, plan_data, organization) VALUES (?, ?, ?, ?, ?, ?, ?)`; const r = await run(sql, [uid, name, topic || '', subject || '', notes || '', JSON.stringify(plan_data), org]); res.json({ message: 'Lesson plan saved successfully', id: r.lastID }); } catch (e) { res.status(400).json({ error: e.message }); }});
app.get('/api/lesson-plans/:id', isApiAuthenticated, async (req, res) => { try { const plan = await getFullLessonPlan(req.params.id, req.session.user, db); res.json({ lesson_plan: plan }); } catch (e) { res.status(404).json({ error: 'Lesson plan not found' }); }});
app.put('/api/lesson-plans/:id', isApiAuthenticated, async (req, res) => { try { const { name, topic, subject, notes, plan_data } = req.body || {}; if (!name || !plan_data) return res.status(400).json({ error: 'Name and plan data are required' }); const sql = `UPDATE lesson_plans SET name = ?, topic = ?, subject = ?, notes = ?, plan_data = ? WHERE id = ? AND user_id = ?`; const r = await run(sql, [name, topic || '', subject || '', notes || '', JSON.stringify(plan_data), req.params.id, req.session.user.id]); res.json({ message: "Lesson plan updated successfully", changes: r.changes }); } catch (e) { res.status(400).json({ error: e.message }); }});
app.delete('/api/lesson-plans/:id', isApiAuthenticated, async (req, res) => { try { const r = await run('DELETE FROM lesson_plans WHERE id = ? AND (user_id = ? OR ? = "admin")', [req.params.id, req.session.user.id, req.session.user.role]); res.json({ message: "Lesson plan deleted", changes: r.changes }); } catch (e) { res.status(400).json({ error: e.message }); }});

/* ================= Subjects ================= */
app.get('/api/subjects', isApiAuthenticated, async (req, res) => { try { const rows = await all('SELECT * FROM subjects ORDER BY name'); res.json({ subjects: rows }); } catch (e) { res.status(500).json({ error: e.message }); }});
app.post('/api/subjects', isApiAuthenticated, async (req, res) => { try { const { name } = req.body || {}; if (!name) return res.status(400).json({ error: 'Name is required' }); const r = await run('INSERT INTO subjects (name) VALUES (?)', [name]); res.json({ message: 'Subject created', data: { id: r.lastID, name } }); } catch (e) { res.status(400).json({ error: e.message }); }});
app.put('/api/subjects/:id', isApiAuthenticated, async (req, res) => { try { const { name } = req.body || {}; if (!name) return res.status(400).json({ error: 'Name is required' }); const r = await run('UPDATE subjects SET name = ? WHERE id = ?', [name, req.params.id]); res.json({ message: 'Subject updated', changes: r.changes }); } catch (e) { res.status(400).json({ error: e.message }); }});
app.delete('/api/subjects/:id', isApiAuthenticated, async (req, res) => { try { const r = await run('DELETE FROM subjects WHERE id = ?', [req.params.id]); res.json({ message: 'Subject deleted', changes: r.changes }); } catch (e) { res.status(400).json({ error: e.message }); }});

/* ================= Exercises (PEP) ================= */
app.get('/api/exercises', isApiAuthenticated, async (req, res) => { try { const rows = await all('SELECT * FROM exercises ORDER BY created_at DESC'); res.json({ exercises: rows }); } catch (e) { res.status(500).json({ error: e.message }); }});
app.post('/api/exercises', isApiAuthenticated, upload.single('image'), async (req, res) => { try { const { name, subject, category, description, equipment, age_group, type } = req.body || {}; const image_url = req.file ? `/uploads/${req.file.filename}` : (req.body && req.body.image_url) || ''; if (!name || !subject) return res.status(400).json({ error: 'Missing required fields' }); const sql = `INSERT INTO exercises (name, subject, category, description, equipment, age_group, image_url, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`; const r = await run(sql, [name, subject, category || '', description || '', equipment || '', age_group || '', image_url, type || 'main']); res.json({ message: 'success', data: { id: r.lastID, ...req.body, image_url } }); } catch (e) { res.status(400).json({ error: e.message }); }});
app.put('/api/exercises/:id', isApiAuthenticated, upload.single('image'), async (req, res) => { try { const { name, subject, category, description, equipment, age_group, type } = req.body || {}; const image_url = req.file ? `/uploads/${req.file.filename}` : (req.body && req.body.image_url) || ''; if (!name || !subject) return res.status(400).json({ error: 'Missing required fields' }); const sql = `UPDATE exercises SET name = ?, subject = ?, category = ?, description = ?, equipment = ?, age_group = ?, image_url = ?, type = ? WHERE id = ?`; const r = await run(sql, [name, subject, category || '', description || '', equipment || '', age_group || '', image_url, type || 'main', req.params.id]); res.json({ message: "Exercise updated", changes: r.changes }); } catch (e) { res.status(400).json({ error: e.message }); }});
app.delete('/api/exercises/:id', isApiAuthenticated, async (req, res) => { try { const r = await run('DELETE FROM exercises WHERE id = ?', [req.params.id]); res.json({ message: "Exercise deleted", changes: r.changes }); } catch (e) { res.status(400).json({ error: e.message }); }});

/* ================= NIKA games ================= */
app.get('/api/nika-games', isApiAuthenticated, async (req, res) => { try { const rows = await all('SELECT * FROM nika_games ORDER BY created_at DESC'); res.json({ games: rows }); } catch (e) { res.status(500).json({ error: e.message }); }});
app.post('/api/nika-games', isApiAuthenticated, upload.single('image'), async (req, res) => { try { const { name, description, equipment, duration_minutes, type } = req.body || {}; const image_url = req.file ? `/uploads/${req.file.filename}` : (req.body && req.body.image_url) || ''; if (!name) return res.status(400).json({ error: "Name is required" }); const sql = `INSERT INTO nika_games (name, description, equipment, duration_minutes, image_url, type) VALUES (?, ?, ?, ?, ?, ?)`; const r = await run(sql, [name, description || '', equipment || '', duration_minutes || null, image_url, type || 'main']); res.json({ message: "NIKA game created", data: { id: r.lastID, ...req.body, image_url } }); } catch (e) { res.status(400).json({ error: e.message }); }});
app.put('/api/nika-games/:id', isApiAuthenticated, upload.single('image'), async (req, res) => { try { const { name, description, equipment, duration_minutes, type } = req.body || {}; const image_url = req.file ? `/uploads/${req.file.filename}` : (req.body && req.body.image_url) || ''; if (!name) return res.status(400).json({ error: "Name is required" }); const sql = `UPDATE nika_games SET name = ?, description = ?, equipment = ?, duration_minutes = ?, image_url = ?, type = ? WHERE id = ?`; const r = await run(sql, [name, description || '', equipment || '', duration_minutes || null, image_url, type || 'main', req.params.id]); res.json({ message: "NIKA game updated", changes: r.changes }); } catch (e) { res.status(400).json({ error: e.message }); }});
app.delete('/api/nika-games/:id', isApiAuthenticated, async (req, res) => { try { const r = await run('DELETE FROM nika_games WHERE id = ?', [req.params.id]); res.json({ message: "NIKA game deleted", changes: r.changes }); } catch (e) { res.status(400).json({ error: e.message }); }});


/* ================= PDF (Restored) ================= */
app.get('/api/lesson-plans/:id/pdf', isApiAuthenticated, async (req, res) => {
  let browser = null;
  try {
    const planData = await getFullLessonPlan(req.params.id, req.session.user, db);
    const htmlContent = await generateHtmlForPdf(planData, req.session.user);

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');

    const headerTemplate = `<div style="font-family: Heebo, Arial, sans-serif; font-size: 8px; width:100%; color:#718096;"></div>`;
    const footerTemplate = `
      <div style="font-family: Heebo, Arial, sans-serif; font-size: 9px; width:100%; color:#718096; text-align:center;">
        נוצר באמצעות PE.P | כל הזכויות שמורות | עמוד <span class="pageNumber"></span> מתוך <span class="totalPages"></span>
      </div>`;

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      margin: { top: '12mm', bottom: '16mm', left: '12mm', right: '12mm' }
    });
    
    const safe = sanitizeFilename(planData.name || 'lesson');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="${safe.replace(/[^\x20-\x7E]/g, '_')}.pdf"; filename*=UTF-8''${encodeURIComponent(safe)}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("PDF Generation Error:", error);
    if (String(error?.message || '').includes("Plan not found")) {
      return res.status(404).send("Lesson plan not found or you do not have permission to view it.");
    }
    res.status(500).send("Error generating PDF.");
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }
});


/* ================= Pages ================= */
app.get('/health', (req, res) => { res.status(200).send('OK'); });
app.get('/', (req,res)=>res.redirect('/auth'));
app.get('/auth', (req,res)=>{
  if (req.session.user){
    if (req.session.user.role==='admin' && !req.session.viewAsOrg) return res.redirect('/admin');
    const org = req.session.viewAsOrg || req.session.user.organization;
    return res.redirect(org==='NIKA' ? '/nika-builder' : '/lesson-builder');
  }
  res.sendFile(path.join(__dirname,'public','auth.html'));
});

app.get('/admin', authorizePageAccess, (req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('/admin-users', authorizePageAccess, (req,res)=>res.sendFile(path.join(__dirname,'public','admin-users.html')));
app.get('/admin-subjects', authorizePageAccess, (req,res)=>res.sendFile(path.join(__dirname,'public','admin-subjects.html')));
app.get('/admin-nika-games', authorizePageAccess, (req,res)=>res.sendFile(path.join(__dirname,'public','admin-nika-games.html')));
app.get('/admin-pep-drills', authorizePageAccess, (req,res)=>res.sendFile(path.join(__dirname,'public','admin-pep-drills.html')));

app.get('/lesson-builder', authorizePageAccess, (req,res)=>res.sendFile(path.join(__dirname,'public','lesson-builder.html')));
app.get('/nika-builder', authorizePageAccess, (req,res)=>res.sendFile(path.join(__dirname,'public','nika-builder.html')));
app.get('/my-lessons-pep', authorizePageAccess, (req,res)=>res.sendFile(path.join(__dirname,'public','my-lessons-pep.html')));
app.get('/my-lessons-nika', authorizePageAccess, (req,res)=>res.sendFile(path.join(__dirname,'public','my-lessons-nika.html')));

app.use(function(req, res, next) {
  console.error(`[404 Handler] Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).send("Sorry, can't find that!");
});

/* ================= Boot ================= */
ensureSchema().then(() => {
  app.listen(PORT, () => console.log(`השרת רץ בכתובת ${BASE_URL}`));
}).catch(err => {
  console.error('Schema init failed:', err);
  process.exit(1);
});
