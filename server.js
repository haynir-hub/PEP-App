// server.js
console.log("--- Loading server.js version 47 (Final Admin & Save Fix) ---");

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const app = express();

// --- Configurations ---
const storage = multer.diskStorage({ destination: (req, file, cb) => cb(null, 'public/uploads/'), filename: (req, file, cb) => { const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9); cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname)); } });
const upload = multer({ storage: storage });
const db = new sqlite3.Database(path.join(__dirname, 'db', 'app.db'), (err) => { if (err) console.error('Could not connect to database', err); else console.log('Connected to database'); });

// --- Middleware ---
app.use(bodyParser.json());
app.use(session({ secret: 'a-very-strong-and-long-secret-key-that-you-should-change', resave: false, saveUninitialized: false, cookie: { secure: false, httpOnly: true, sameSite: 'lax' } }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Security Middleware ---
const isApiAuthenticated = (req, res, next) => { if (req.session.user) next(); else res.status(401).json({ error: 'Not authenticated' }); };
const authorizePageAccess = (req, res, next) => { if (!req.session.user) return res.redirect('/auth'); let effectiveRole = req.session.user.role; if (req.session.user.role === 'admin' && req.session.viewAsOrg) { effectiveRole = 'member'; } const requested_path = req.path; const userOrg = req.session.viewAsOrg || req.session.user.organization; if (effectiveRole === 'admin' && requested_path.startsWith('/admin')) return next(); if (effectiveRole === 'member' && userOrg === 'PEP' && requested_path.startsWith('/lesson-builder')) return next(); if (effectiveRole === 'member' && userOrg === 'NIKA' && requested_path.startsWith('/nika-builder')) return next(); if (req.session.user.role === 'admin' && !req.session.viewAsOrg) return res.redirect('/admin'); if (userOrg === 'NIKA') return res.redirect('/nika-builder'); return res.redirect('/lesson-builder'); };

// --- API Routes ---
// Auth
app.get('/api/auth/me', isApiAuthenticated, (req, res) => { const { password_hash, ...userToSend } = req.session.user; res.json({ user: userToSend, viewAsOrg: req.session.viewAsOrg }); });
app.get('/api/auth/view-as-pep', (req, res) => { if (req.session.user && req.session.user.role === 'admin') { req.session.viewAsOrg = 'PEP'; } res.redirect('/lesson-builder'); });
app.get('/api/auth/view-as-nika', (req, res) => { if (req.session.user && req.session.user.role === 'admin') { req.session.viewAsOrg = 'NIKA'; } res.redirect('/nika-builder'); });
app.get('/api/auth/return-to-admin', (req, res) => { if (req.session.user) { delete req.session.viewAsOrg; } res.redirect('/admin'); });
app.post('/api/users/login', (req, res) => { const { email, password } = req.body; db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => { if (err || !user) return res.status(400).json({ error: 'משתמש או סיסמה שגויים' }); const match = await bcrypt.compare(password, user.password_hash); if (!match) return res.status(400).json({ error: 'משתמש או סיסמה שגויים' }); req.session.user = user; if (user.role === 'admin') return res.json({ redirectUrl: '/admin' }); let redirectUrl = '/lesson-builder'; if (user.organization === 'NIKA') redirectUrl = '/nika-builder'; res.json({ redirectUrl: redirectUrl }); }); });

// Data for Builders
app.get('/api/builder-data/pep', isApiAuthenticated, (req, res) => { const exercisesQuery = "SELECT * FROM exercises ORDER BY name"; const subjectsQuery = "SELECT * FROM subjects ORDER BY name"; db.all(exercisesQuery, [], (err, exercises) => { if (err) return res.status(500).json({ error: err.message }); db.all(subjectsQuery, [], (err, subjects) => { if (err) return res.status(500).json({ error: err.message }); res.json({ exercises, subjects }); }); }); });
app.get('/api/builder-data/nika', isApiAuthenticated, (req, res) => { db.all("SELECT * FROM nika_games ORDER BY name", [], (err, games) => { if (err) return res.status(500).json({ error: err.message }); res.json({ games }); }); });

// Lesson Plans
app.post('/api/lesson-plans', isApiAuthenticated, (req, res) => {
    const { name, topic, subject, notes, plan_data } = req.body;
    const { id: user_id, organization } = req.session.user;
    if (!name || !plan_data) return res.status(400).json({ error: "Name and plan data are required" });
    const sql = `INSERT INTO lesson_plans (user_id, name, topic, subject, notes, plan_data, organization) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const params = [user_id, name, topic, subject, notes, JSON.stringify(plan_data), organization]; // <-- The corrected line
    db.run(sql, params, function(err) {
        if (err) { console.error("DB Error saving lesson plan:", err); return res.status(400).json({ error: err.message }); }
        res.json({ message: "Lesson plan saved successfully", id: this.lastID });
    });
});

// Admin APIs (Subjects, Exercises, NIKA Games) - All restored
app.get('/api/subjects', isApiAuthenticated, (req, res) => { db.all("SELECT * FROM subjects ORDER BY name", [], (err, rows) => { if (err) return res.status(500).json({ error: err.message }); res.json({ subjects: rows }); }); });
app.post('/api/subjects', isApiAuthenticated, (req, res) => { const { name } = req.body; if (!name) return res.status(400).json({ error: "Name is required" }); db.run(`INSERT INTO subjects (name) VALUES (?)`, [name], function(err) { if (err) return res.status(400).json({ error: err.message }); res.json({ message: "Subject created", data: { id: this.lastID, name } }); }); });
app.put('/api/subjects/:id', isApiAuthenticated, (req, res) => { const { name } = req.body; if (!name) return res.status(400).json({ error: "Name is required" }); db.run(`UPDATE subjects SET name = ? WHERE id = ?`, [name, req.params.id], function(err) { if (err) return res.status(400).json({ error: err.message }); res.json({ message: "Subject updated", changes: this.changes }); }); });
app.delete('/api/subjects/:id', isApiAuthenticated, (req, res) => { db.run(`DELETE FROM subjects WHERE id = ?`, req.params.id, function(err) { if (err) return res.status(400).json({ error: err.message }); res.json({ message: "Subject deleted", changes: this.changes }); }); });
app.get('/api/exercises', isApiAuthenticated, (req, res) => { db.all("SELECT * FROM exercises ORDER BY created_at DESC", [], (err, rows) => { if (err) return res.status(500).json({ "error": err.message }); res.json({ exercises: rows }); }); });
app.post('/api/exercises', isApiAuthenticated, upload.single('image'), (req, res) => { const { name, subject, category, description, equipment, age_group } = req.body; const image_url = req.file ? `/uploads/${req.file.filename}` : req.body.image_url; if (!name || !subject || !category) return res.status(400).json({ "error": "Missing required fields" }); const sql = `INSERT INTO exercises (name, subject, category, description, equipment, age_group, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)`; const params = [name, subject, category, description, equipment, age_group, image_url]; db.run(sql, params, function(err) { if (err) return res.status(400).json({ "error": err.message }); res.json({ "message": "success", "data": { id: this.lastID, ...req.body, image_url } }); }); });
app.put('/api/exercises/:id', isApiAuthenticated, upload.single('image'), (req, res) => { const { name, subject, category, description, equipment, age_group } = req.body; const image_url = req.file ? `/uploads/${req.file.filename}` : req.body.image_url; if (!name || !subject || !category) return res.status(400).json({ "error": "Missing required fields" }); const sql = `UPDATE exercises SET name = ?, subject = ?, category = ?, description = ?, equipment = ?, age_group = ?, image_url = ? WHERE id = ?`; const params = [name, subject, category, description, equipment, age_group, image_url, req.params.id]; db.run(sql, params, function(err) { if (err) return res.status(400).json({ "error": err.message }); res.json({ message: "Exercise updated", changes: this.changes }); }); });
app.delete('/api/exercises/:id', isApiAuthenticated, (req, res) => { db.run(`DELETE FROM exercises WHERE id = ?`, req.params.id, function(err) { if (err) return res.status(400).json({ "error": err.message }); res.json({ message: "Exercise deleted", changes: this.changes }); }); });
app.get('/api/nika-games', isApiAuthenticated, (req, res) => { db.all("SELECT * FROM nika_games ORDER BY created_at DESC", [], (err, rows) => { if (err) return res.status(500).json({ error: err.message }); res.json({ games: rows }); }); });
app.post('/api/nika-games', isApiAuthenticated, upload.single('image'), (req, res) => { const { name, description, equipment, duration_minutes } = req.body; const image_url = req.file ? `/uploads/${req.file.filename}` : req.body.image_url; if (!name) return res.status(400).json({ error: "Name is required" }); const sql = `INSERT INTO nika_games (name, description, equipment, duration_minutes, image_url) VALUES (?, ?, ?, ?, ?)`; const params = [name, description, equipment, duration_minutes, image_url]; db.run(sql, params, function(err) { if (err) return res.status(400).json({ error: err.message }); res.json({ message: "NIKA game created", data: { id: this.lastID, ...req.body, image_url } }); }); });

// --- Page Routes ---
app.get('/', (req, res) => res.redirect('/auth'));
app.get('/auth', (req, res) => { if (req.session.user) { if (req.session.user.role === 'admin' && !req.session.viewAsOrg) { return res.redirect('/admin'); } const org = req.session.viewAsOrg || req.session.user.organization; if (org === 'NIKA') return res.redirect('/nika-builder'); return res.redirect('/lesson-builder'); } res.sendFile(path.join(__dirname, 'public', 'auth.html')); });
app.get('/admin', authorizePageAccess, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin-subjects', authorizePageAccess, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-subjects.html')));
app.get('/admin-nika-games', authorizePageAccess, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-nika-games.html')));
app.get('/lesson-builder', authorizePageAccess, (req, res) => res.sendFile(path.join(__dirname, 'public', 'lesson-builder.html')));
app.get('/nika-builder', authorizePageAccess, (req, res) => res.sendFile(path.join(__dirname, 'public', 'nika-builder.html')));

app.listen(3000, () => { console.log('השרת רץ בכתובת http://localhost:3000'); });