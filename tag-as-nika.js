// tag-as-nika.js
// שימוש: node tag-as-nika.js 12 15 22
// יעדכן לכל ה-IDs שסיפקת את המקצוע ל-"NIKA — משחקים"

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database(path.join(__dirname, 'db', 'app.db'));

// נקבל מזהים מה־CLI
const idsFromCli = process.argv.slice(2).map(Number).filter(Boolean);

if (idsFromCli.length === 0) {
  console.log("לא סופקו IDs. לדוגמה: node tag-as-nika.js 5 7 9");
  process.exit(1);
}

idsFromCli.forEach(id => {
  db.run(`UPDATE exercises SET subject=? WHERE id=?`, ['NIKA — משחקים', id], function (err) {
    if (err) {
      console.error('שגיאה בעדכון ID', id, err);
    } else {
      console.log(`תרגיל ${id} עודכן בהצלחה ל-"NIKA — משחקים" ✅`);
    }
  });
});

setTimeout(() => db.close(), 500);
