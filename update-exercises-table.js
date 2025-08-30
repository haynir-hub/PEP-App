// update-exercises-table.js
// הרץ פעם אחת על מנת להוסיף את העמודה age_group בטבלת exercises
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database(path.join(__dirname, 'db', 'app.db'));

db.serialize(() => {
  db.run(`
    ALTER TABLE exercises ADD COLUMN age_group TEXT;
  `, function(err) {
    if (err) {
      console.error('שגיאה בהוספת העמודה:', err);
    } else {
      console.log('הוספת עמודת age_group לטבלה exercises ✅');
    }
    db.close();
  });
});
