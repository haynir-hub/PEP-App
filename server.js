// server.js
console.log("--- Loading server.js version 104 (THE COMPLETE PDF FIX) ---");

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const puppeteer = require('puppeteer');
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
const authorizePageAccess = (req, res, next) => {
    if (!req.session.user) return res.redirect('/auth');
    const userRole = req.session.user.role;
    const userOrg = req.session.user.organization;
    const isViewingAs = !!req.session.viewAsOrg;
    const viewOrg = req.session.viewAsOrg;
    const requestedPath = req.path;
    const effectiveOrg = viewOrg || userOrg;
    if (userRole === 'admin' && !isViewingAs) { if (requestedPath.startsWith('/admin')) return next(); return res.redirect('/admin'); }
    if ((userRole === 'member') || (userRole === 'admin' && isViewingAs)) {
        if (effectiveOrg === 'PEP' && (requestedPath.startsWith('/lesson-builder') || requestedPath.startsWith('/my-lessons-pep'))) return next();
        if (effectiveOrg === 'NIKA' && (requestedPath.startsWith('/nika-builder') || requestedPath.startsWith('/my-lessons-nika'))) return next();
        if (effectiveOrg === 'NIKA') return res.redirect('/nika-builder');
        return res.redirect('/lesson-builder');
    }
    return res.redirect('/auth');
};

// --- Helper Functions for PDF ---
async function getFullLessonPlan(plan_id, user, db_conn) {
    return new Promise((resolve, reject) => {
        let sql = "SELECT * FROM lesson_plans WHERE id = ?";
        let params = [plan_id];
        if (user.role !== 'admin') { sql += " AND user_id = ?"; params.push(user.id); }
        db_conn.get(sql, params, (err, plan) => {
            if (err || !plan) return reject(err || new Error("Plan not found"));
            const plan_data = JSON.parse(plan.plan_data);
            const allIds = [...(plan_data.warmup || []), ...(plan_data.main || []), ...(plan_data.finish || []), ...(plan_data.games || [])];
            if (allIds.length === 0) { plan.items = []; return resolve(plan); }
            const placeholders = allIds.map(() => '?').join(',');
            const table = plan.organization === 'NIKA' ? 'nika_games' : 'exercises';
            const itemSql = `SELECT * FROM ${table} WHERE id IN (${placeholders})`;
            db_conn.all(itemSql, allIds, (err, items) => { if (err) return reject(err); plan.items = items; resolve(plan); });
        });
    });
}
async function generateHtmlForPdf(planData, user) {
    let template = await fs.readFile(path.join(__dirname, 'pdf-template.html'), 'utf-8');
    let logoHtml = '', bodyClass = '';
    if (planData.organization === 'NIKA') { logoHtml = `<div class="logo nika">NIKA</div>`; bodyClass = 'nika-background'; } 
    else { logoHtml = `<div class="logo pep">PEP</div>`; bodyClass = 'pep-background'; }
    template = template.replace('{{logoHtml}}', logoHtml);
    template = template.replace('{{bodyClass}}', bodyClass);
    const plan_data = JSON.parse(planData.plan_data);
    const itemMap = new Map((planData.items || []).map(item => [item.id, item]));
    const generateItemsHtml = (ids) => { if (!ids || ids.length === 0) return ''; return ids.map(id => itemMap.get(id)).filter(Boolean).map(item => `<div class="item-card">${item.image_url ? `<img src="http://localhost:3000${item.image_url}">` : ''}<div class="details"><h4>${item.name}</h4><p>${item.description || ''}</p></div></div>`).join(''); };
    const allItems = Object.values(plan_data).flat().map(id => itemMap.get(id)).filter(Boolean);
    const equipmentSet = new Set();
    allItems.forEach(item => { if(item.equipment) item.equipment.split(',').forEach(eq => equipmentSet.add(eq.trim())) });
    template = template.replace('{{lessonName}}', planData.name || '');
    template = template.replace('{{lessonTopic}}', planData.topic || '');
    template = template.replace('{{date}}', new Date().toLocaleDateString('he-IL'));
    template = template.replace('{{teacherName}}', user.fullname || user.email);
    template = template.replace('{{equipmentList}}', equipmentSet.size > 0 ? Array.from(equipmentSet).join(', ') : 'אין ציוד נדרש.');
    const warmupHtml = generateItemsHtml(plan_data.warmup);
    const mainHtml = generateItemsHtml(plan_data.main);
    const finishHtml = generateItemsHtml(plan_data.finish || plan_data.games);
    template = template.replace('{{warmupItems}}', warmupHtml);
    template = template.replace('{{mainItems}}', mainHtml);
    template = template.replace('{{finishItems}}', finishHtml);
    if ((!plan_data.warmup || plan_data.warmup.length === 0) && (!plan_data.games || plan_data.games.length === 0)) { template = template.replace(/<div class="section" id="warmup-section">[\s\S]*?<\/div>/, ''); }
    if (!plan_data.main || plan_data.main.length === 0) { template = template.replace(/<div class="section" id="main-section">[\s\S]*?<\/div>/, ''); }
    if (!plan_data.finish || plan_data.finish.length === 0) { template = template.replace(/<div class="section" id="finish-section">[\s\S]*?<\/div>/, ''); }
    return template;
}

// --- API Routes ---
app.get('/api/auth/me', isApiAuthenticated, (req, res) => { const { password_hash, ...userToSend } = req.session.user; res.json({ user: userToSend, viewAsOrg: req.session.viewAsOrg }); });
app.get('/api/auth/view-as-pep', (req, res) => { if (req.session.user && req.session.user.role === 'admin') { req.session.viewAsOrg = 'PEP'; } res.redirect('/lesson-builder'); });
app.get('/api/auth/view-as-nika', (req, res) => { if (req.session.user && req.session.user.role === 'admin') { req.session.viewAsOrg = 'NIKA'; } res.redirect('/nika-builder'); });
app.get('/api/auth/return-to-admin', (req, res) => { if (req.session.user) { delete req.session.viewAsOrg; } res.redirect('/admin'); });
app.post('/api/users/login', (req, res) => { const { email, password } = req.body; db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => { if (err || !user) return res.status(400).json({ error: 'משתמש או סיסמה שגויים' }); const match = await bcrypt.compare(password, user.password_hash); if (!match) return res.status(400).json({ error: 'משתמש או סיסמה שגויים' }); req.session.user = user; if (user.role === 'admin') return res.json({ redirectUrl: '/admin' }); let redirectUrl = '/lesson-builder'; if (user.organization === 'NIKA') redirectUrl = '/nika-builder'; res.json({ redirectUrl: redirectUrl }); }); });

app.get('/api/builder-data/pep', isApiAuthenticated, (req, res) => { const exercisesQuery = "SELECT * FROM exercises ORDER BY name"; const subjectsQuery = "SELECT * FROM subjects ORDER BY name"; db.all(exercisesQuery, [], (err, exercises) => { if (err) return res.status(500).json({ error: err.message }); db.all(subjectsQuery, [], (err, subjects) => { if (err) return res.status(500).json({ error: err.message }); res.json({ exercises, subjects }); }); }); });
app.get('/api/builder-data/nika', isApiAuthenticated, (req, res) => { db.all("SELECT * FROM nika_games ORDER BY name", [], (err, games) => { if (err) return res.status(500).json({ error: err.message }); res.json({ games }); }); });
app.get('/api/my-lesson-plans', isApiAuthenticated, (req, res) => { const user_id = req.session.user.id; db.all("SELECT * FROM lesson_plans WHERE user_id = ? ORDER BY created_at DESC", [user_id], (err, rows) => { if (err) return res.status(500).json({ error: err.message }); res.json({ lesson_plans: rows }); }); });
app.post('/api/lesson-plans', isApiAuthenticated, (req, res) => { const { name, topic, subject, notes, plan_data } = req.body; const effectiveOrg = req.session.viewAsOrg || req.session.user.organization; const { id: user_id } = req.session.user; if (!name || !plan_data) return res.status(400).json({ error: "Name and plan data are required" }); const sql = `INSERT INTO lesson_plans (user_id, name, topic, subject, notes, plan_data, organization) VALUES (?, ?, ?, ?, ?, ?, ?)`; const params = [user_id, name, topic, subject, notes, JSON.stringify(plan_data), effectiveOrg]; db.run(sql, params, function(err) { if (err) return res.status(400).json({ error: err.message }); res.json({ message: "Lesson plan saved successfully", id: this.lastID }); }); });
app.get('/api/lesson-plans/:id', isApiAuthenticated, async (req, res) => { try { const plan = await getFullLessonPlan(req.params.id, req.session.user, db); res.json({ lesson_plan: plan }); } catch (error) { res.status(404).json({ error: "Lesson plan not found" }); } });
app.put('/api/lesson-plans/:id', isApiAuthenticated, (req, res) => { const { name, topic, subject, notes, plan_data } = req.body; const { id: plan_id } = req.params; const { id: user_id } = req.session.user; const sql = `UPDATE lesson_plans SET name = ?, topic = ?, subject = ?, notes = ?, plan_data = ? WHERE id = ? AND user_id = ?`; const params = [name, topic, subject, notes, JSON.stringify(plan_data), plan_id, user_id]; db.run(sql, params, function(err) { if (err) return res.status(400).json({ "error": err.message }); res.json({ message: "Lesson plan updated successfully" }); }); });
app.delete('/api/lesson-plans/:id', isApiAuthenticated, (req, res) => { const { id: plan_id } = req.params; let sql = `DELETE FROM lesson_plans WHERE id = ?`; const params = [plan_id]; if (req.session.user.role !== 'admin') { sql += ` AND user_id = ?`; params.push(req.session.user.id); } db.run(sql, params, function(err) { if (err) return res.status(400).json({ "error": err.message }); res.json({ message: "Lesson plan deleted" }); }); });
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
app.get('/api/lesson-plans/:id/pdf', isApiAuthenticated, async (req, res) => { try { const planData = await getFullLessonPlan(req.params.id, req.session.user, db); const htmlContent = await generateHtmlForPdf(planData, req.session.user); const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] }); const page = await browser.newPage(); await page.setContent(htmlContent, { waitUntil: 'networkidle0' }); await page.emulateMediaType('screen'); const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, displayHeaderFooter: true, footerTemplate: `<div style="font-family: Heebo, Arial, sans-serif; font-size: 9px; text-align: center; width: 100%; color: #718096;">נוצר באמצעות PE.P | כל הזכויות שמורות | עמוד <span class="pageNumber"></span> מתוך <span class="totalPages"></span></div>`, margin: { top: '15mm', bottom: '20mm', right: '15mm', left: '15mm' } }); await browser.close(); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="${planData.name}.pdf"`); res.send(pdfBuffer); } catch (error) { console.error("PDF Generation Error:", error); if (error.message.includes("Plan not found")) { return res.status(404).send("Lesson plan not found or you do not have permission to view it."); } res.status(500).send("Error generating PDF."); }});

// --- Page Routes ---
app.get('/', (req, res) => res.redirect('/auth'));
app.get('/auth', (req, res) => { if (req.session.user) { if (req.session.user.role === 'admin' && !req.session.viewAsOrg) { return res.redirect('/admin'); } const org = req.session.viewAsOrg || req.session.user.organization; if (org === 'NIKA') return res.redirect('/nika-builder'); return res.redirect('/lesson-builder'); } res.sendFile(path.join(__dirname, 'public', 'auth.html')); });
app.get('/admin', authorizePageAccess, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin-subjects', authorizePageAccess, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-subjects.html')));
app.get('/admin-nika-games', authorizePageAccess, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-nika-games.html')));
app.get('/lesson-builder', authorizePageAccess, (req, res) => res.sendFile(path.join(__dirname, 'public', 'lesson-builder.html')));
app.get('/nika-builder', authorizePageAccess, (req, res) => res.sendFile(path.join(__dirname, 'public', 'nika-builder.html')));
app.get('/my-lessons-pep', authorizePageAccess, (req, res) => res.sendFile(path.join(__dirname, 'public', 'my-lessons-pep.html')));
app.get('/my-lessons-nika', authorizePageAccess, (req, res) => res.sendFile(path.join(__dirname, 'public', 'my-lessons-nika.html')));

app.listen(3000, () => { console.log('השרת רץ בכתובת http://localhost:3000'); });