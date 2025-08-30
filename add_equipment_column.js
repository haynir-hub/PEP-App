const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./db/pe_app.db', (err) => {
    if (err) {
        console.error('Error connecting to database:', err);
        process.exit(1);
    } else {
        console.log('Connected to database');
    }
});

db.run('ALTER TABLE exercises ADD COLUMN equipment TEXT DEFAULT "";', (err) => {
    if (err) {
        if (err.message.includes('duplicate column name')) {
            console.log('Column equipment already exists');
        } else {
            console.error('Error adding column:', err.message);
        }
    } else {
        console.log('Column equipment added successfully');
    }
    
    db.close();
});