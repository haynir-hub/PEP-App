exports.up = function(knex) {
  return knex.schema.createTable('users', (table) => {
    table.increments('id').primary(); // ID ייחודי לכל משתמש
    table.string('email').notNullable().unique(); // אימייל, חייב להיות ייחודי
    table.string('password_hash').notNullable(); // כאן תישמר "טביעת האצבע" של הסיסמה
    table.timestamps(true, true); // עמודות "נוצר ב-" ו"עודכן ב-"
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('users');
};