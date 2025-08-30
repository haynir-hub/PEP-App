// seed-nika-subject.js
// הרצה: node seed-nika-subject.js

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// פותחים חיבור למסד הנתונים
const db = new sqlite3.Database(path.join(__dirname, 'db', 'app.db'));

db.serialize(() => {
  // נוודא שטבלת subjects קיימת
  db.run(`CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  )`);

  // נכניס את המקצוע "NIKA — משחקים" אם לא קיים כבר
  db.run(`INSERT OR IGNORE INTO subjects (name) VALUES (?)`, ['NIKA — משחקים'], function (err) {
    if (err) {
      console.error("שגיאה:", err);
    } else {
      console.log('Subject "NIKA — משחקים" קיים או נוצר בהצלחה ✅');
    }
    db.close();
  });
});
