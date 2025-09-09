// scripts/migrate_users.js
// Idempotent migration for users table: adds missing columns commonly used by admin panel.

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'db', 'app.db');
const db = new sqlite3.Database(dbPath);

function columnExists(table, col) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${table});`, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows.some(r => r.name === col));
    });
  });
}

function addColumn(sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, [], function(err) {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function run() {
  try {
    // users: fullname
    if (!await columnExists('users', 'fullname')) {
      await addColumn(`ALTER TABLE users ADD COLUMN fullname TEXT;`);
      console.log('Added users.fullname');
    }
    // users: is_active
    if (!await columnExists('users', 'is_active')) {
      await addColumn(`ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;`);
      console.log('Added users.is_active');
    }
    // users: created_at
    if (!await columnExists('users', 'created_at')) {
      await addColumn(`ALTER TABLE users ADD COLUMN created_at DATETIME;`);
      console.log('Added users.created_at');
      await new Promise((res, rej) =>
        db.run(`UPDATE users SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP);`, [], (e)=> e?rej(e):res()));
    }
    // users: last_login
    if (!await columnExists('users', 'last_login')) {
      await addColumn(`ALTER TABLE users ADD COLUMN last_login DATETIME;`);
      console.log('Added users.last_login');
    }

    // Optional: ensure is_active defaults (older rows may be NULL)
    await new Promise((res, rej) =>
      db.run(`UPDATE users SET is_active = COALESCE(is_active, 1);`, [], (e)=> e?rej(e):res()));

    console.log('Migration complete ✅');
  } catch (e) {
    console.error('Migration failed:', e);
  } finally {
    db.close();
  }
}

run();
