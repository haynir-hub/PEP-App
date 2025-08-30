// adminify.js — הרץ פעם אחת: node adminify.js youremail@example.com
const path=require('path');
const sqlite3=require('sqlite3').verbose();
const db=new sqlite3.Database(path.join(__dirname,'db','app.db'));
const email=process.argv[2];
if(!email){ console.log('Usage: node adminify.js <email>'); process.exit(1); }

db.run(`UPDATE users SET role='admin' WHERE email=?`,[email],function(err){
  if(err){ console.error(err); process.exit(1); }
  console.log(`Rows updated: ${this.changes}. אם זה 0 — האימייל לא נמצא.`);
  db.close();
});
