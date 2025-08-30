// seed-nika-games.js — עדכון מבנה טבלת exercises והוספת משחקים
// הרץ פעם אחת כדי לזרוע משחקי דוגמה ל-"NIKA — משחקים"
// שימוש: node seed-nika-games.js

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(path.join(__dirname, 'db', 'app.db'));

const SUBJECT = 'NIKA — משחקים';

// עדכון מבנה הטבלה exercises והוספת עמודת age_group אם היא לא קיימת
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT,
      category TEXT,
      name TEXT,
      description TEXT,
      image_url TEXT,
      age_group TEXT,  -- הוספתי את העמודה age_group
      is_public INTEGER DEFAULT 1,
      created_at TEXT
    )`, function(err) {
      if (err) {
        console.error('שגיאה בהוספת העמודה:', err);
      } else {
        console.log('הוספת עמודת age_group לטבלה exercises ✅');
      }

      // Seed the subjects table with 'NIKA — משחקים'
      db.run(`CREATE TABLE IF NOT EXISTS subjects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE
      )`, function(err) {
        if (err) console.error('שגיאה ביצירת טבלת subjects:', err);
        db.run(`INSERT OR IGNORE INTO subjects (name) VALUES (?)`, [SUBJECT]);

        // הוספת משחקי דוגמה ל-NIKA — משחקים
        const stmt = db.prepare(`
          INSERT INTO exercises (subject, category, name, description, image_url, age_group, is_public, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `);

        const games = [
          // --- חימום ---
          {
            name: 'תופסת צבעים',
            subject: SUBJECT,
            category: 'חימום',
            description: 'ציוד: קונוסים צבעוניים, שטיחי צבע.\nמאמן קורא צבע, כל הילדים נוגעים בפריט בצבע שנאמר.',
            image_url: '',
            age_group: 'כיתות א׳-ג׳',
            is_public: 1
          },
          {
            name: 'פסיעות קנגורו',
            subject: SUBJECT,
            category: 'חימום',
            description: 'ציוד: חישוקים, קונוסים.\nקפיצות קצרות במרחב לפי סימון.',
            image_url: '',
            age_group: 'כיתות ד׳-ו׳',
            is_public: 1
          },
          // --- עיקרי ---
          {
            name: 'מרוץ שליחים צוותי',
            subject: SUBJECT,
            category: 'עיקרי',
            description: 'ציוד: קונוסים, מוטות קלים, וסטים/סרטי צביעה.\nקבוצות של 4–6, מסלול מכשולים קצר, שיתוף פעולה.',
            image_url: '',
            age_group: 'חטיבה',
            is_public: 1
          },
          {
            name: 'כדורגל תחנות',
            subject: SUBJECT,
            category: 'עיקרי',
            description: 'ציוד: כדורי רגל, שערים קטנים, קונוסים.\n3–4 תחנות לתרגול מסירות, בעיטה לשער קטן, שליטה בכדור.',
            image_url: '',
            age_group: 'חטיבה',
            is_public: 1
          },
          // --- סיום ---
          {
            name: 'פריז תנועה',
            subject: SUBJECT,
            category: 'סיום',
            description: 'ציוד: רמקול למוזיקה.\nמוזיקה קלה, כולם קופאים בתנוחה.',
            image_url: '',
            age_group: 'כיתות א׳-ג׳',
            is_public: 1
          },
          {
            name: 'מעגל מתיחות קצר',
            subject: SUBJECT,
            category: 'סיום',
            description: 'ציוד: מזרני התעמלות (אופציונלי).\nמתיחות בסיסיות לכל הגוף בהובלת המאמן.',
            image_url: '',
            age_group: 'כיתות ד׳-ו׳',
            is_public: 1
          }
        ];

        games.forEach(g => {
          stmt.run([g.subject, g.category, g.name, g.description, g.image_url, g.age_group, g.is_public], function (err) {
            if (err) console.error('שגיאה בהוספת', g.name, err.message);
            else console.log('נוסף:', g.name);
          });
        });

        stmt.finalize(() => {
          console.log('סיום הזריעה ✅');
          db.close();
        });
      });
    });
});
