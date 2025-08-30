// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const app = express();

// יצירת בסיס נתונים
const db = new sqlite3.Database(path.join(__dirname, 'db', 'app.db'));

// Middleware
app.use(bodyParser.json());
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true
}));

// דף התחברות (auth.html)
app.get('/auth', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'auth.html'));
});

// התחברות משתמש (POST /api/users/login)
app.post('/api/users/login', (req, res) => {
  const { email, password } = req.body;

  const db = new sqlite3.Database('db/app.db');
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!user) {
      return res.status(400).json({ error: 'משתמש לא נמצא' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(400).json({ error: 'סיסמה שגויה' });
    }

    req.session.user = user;
    res.json({ message: 'התחברות בוצעה בהצלחה' });
  });
});

// הפעלת השרת
app.listen(3000, () => {
  console.log('השרת רץ בכתובת http://localhost:3000');
});
