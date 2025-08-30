// public/admin.js
const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();

// הצגת כל המשתמשים לפי ארגון
router.get('/users', async (req, res) => {
  try {
    const { organization } = req.query; // סינון לפי ארגון (PEP / NIKA)
    const db = new sqlite3.Database('db/app.db');
    const query = organization 
      ? `SELECT id, email, fullname, role, organization, last_login_at FROM users WHERE organization = ? ORDER BY last_login_at DESC`
      : `SELECT id, email, fullname, role, organization, last_login_at FROM users ORDER BY last_login_at DESC`;

    db.all(query, [organization], (err, users) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(users);
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// הוספת משתמש חדש
router.post('/users', async (req, res) => {
  try {
    const { email, password, fullname, organization } = req.body;
    if (!email || !password || !fullname) return res.status(400).json({ error: 'email/password/fullname required' });

    const hash = await bcrypt.hash(password, 10);
    const db = new sqlite3.Database('db/app.db');
    
    db.run(`
      INSERT INTO users (email, password_hash, fullname, role, organization, created_at) 
      VALUES (?, ?, ?, 'member', ?, datetime('now'))`, 
      [email, hash, fullname, organization || 'PEP'], 
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'User created successfully' });
      });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
