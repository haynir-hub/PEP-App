// update-users-table.js
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(path.join(__dirname, 'db', 'app.db'));

db.serialize(() => {
  db.run(`
    ALTER TABLE users ADD COLUMN organization TEXT DEFAULT 'PEP';
  `, function(err) {
    if (err) {
      console.error('שגיאה בהוספת העמודה organization:', err);
    } else {
      console.log('הוספת עמודת organization לטבלת users ✅');
    }
    db.close();
  });
});
