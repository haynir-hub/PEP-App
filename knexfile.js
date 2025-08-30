// knexfile.js
module.exports = {
  development: {
    client: 'sqlite3', // אנחנו אומרים ל-Knex להשתמש ב-SQLite
    connection: {
      filename: './db/app.db' // המיקום והשם של קובץ בסיס הנתונים שניצור
    },
    useNullAsDefault: true, // הגדרה טכנית שמומלצת עבור SQLite
    migrations: {
      directory: './db/migrations' // התיקייה שבה נשמור את "תוכניות הבנייה" של הטבלאות
    }
  }
};