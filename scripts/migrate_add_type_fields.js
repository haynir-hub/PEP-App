// scripts/migrate_add_type_fields.js
// Adds `type` column to exercises and nika_games with sensible defaults.
// Types:
//   PEP exercises: 'warmup' | 'main' | 'finish'   (default: 'main')
//   NIKA games   : 'warmup' | 'main'              (default: 'main')

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'db', 'app.db');
const db = new sqlite3.Database(dbPath);

function columnExists(table, column) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${table});`, [], (err, rows) => {
      if (err) return reject(err);
      const exists = rows.some(r => r.name === column);
      resolve(exists);
    });
  });
}

function run(sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, [], function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

(async () => {
  try {
    console.log('[migrate] Starting migration for `type` columns...');

    // exercises.type
    const exHas = await columnExists('exercises', 'type');
    if (!exHas) {
      console.log('[migrate] Adding exercises.type ...');
      await run(`ALTER TABLE exercises ADD COLUMN type TEXT DEFAULT 'main';`);
      await run(`UPDATE exercises SET type = 'main' WHERE type IS NULL OR type = '';`);
    } else {
      console.log('[migrate] exercises.type already exists. Ensuring defaults...');
      await run(`UPDATE exercises SET type = COALESCE(NULLIF(type, ''), 'main');`);
    }

    // nika_games.type
    const ngHas = await columnExists('nika_games', 'type');
    if (!ngHas) {
      console.log('[migrate] Adding nika_games.type ...');
      await run(`ALTER TABLE nika_games ADD COLUMN type TEXT DEFAULT 'main';`);
      await run(`UPDATE nika_games SET type = 'main' WHERE type IS NULL OR type = '';`);
    } else {
      console.log('[migrate] nika_games.type already exists. Ensuring defaults...');
      await run(`UPDATE nika_games SET type = COALESCE(NULLIF(type, ''), 'main');`);
    }

    console.log('[migrate] Done.');
  } catch (e) {
    console.error('[migrate] Error:', e);
    process.exitCode = 1;
  } finally {
    db.close();
  }
})();
