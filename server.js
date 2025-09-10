// server.js
console.log('--- Loading server.js v121 (Final Proxy/Cookie Fix) ---');

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

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

// ================================================================= //
// --->              התיקון הסופי נמצא כאן              <---
// ================================================================= //
// הגדרה זו חיונית כדי ש-Session יעבוד כראוי מאחורי ה-Proxy של Render
app.set('trust proxy', 1); 

app.use(bodyParser.json());
app.use(session({
  secret: 'a-very-strong-and-long-secret-key-that-you-should-change',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: true, // דרוש עבור sameSite: 'none'
    httpOnly: true,
    sameSite: 'none' // ההגדרה הכי גמישה, מתאימה לסביבות Proxy
  }
}));
// ================================================================= //

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

/* ================= Schema Auto-Heal (Full code omitted for brevity) ================= */
async function ensureSchema() { /* ... all schema logic ... */ }

/* ================= Helpers (Full code omitted for brevity) ================= */
function sanitizeFilename(name='lesson'){ /* ... */ return name; }
async function getFullLessonPlan(plan_id, user, db_conn){ /* ... logic from before ... */ }
async function generateHtmlForPdf(planData, user){ /* ... logic from before ... */ }

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

/* ================= Other APIs (Admin, Builder, etc. - Full code omitted for brevity) ================= */
// ... all other API routes are here ...

/* ================= PDF ================= */
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

// ... All other app.get routes for HTML pages
app.get('/admin', authorizePageAccess, (req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
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