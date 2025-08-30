// זהו קובץ ה-Migration (תוכנית הבנייה)
exports.up = function(knex) {
  return knex.schema.createTable('exercises', (table) => {
    table.increments('id').primary(); // יוצר עמודת ID ייחודית לכל תרגיל
    table.string('subject').notNullable(); // המקצוע (חינוך גופני, מתמטיקה...)
    table.string('category').notNullable(); // הקטגוריה (חימום, משחק סיום...)
    table.string('name').notNullable(); // שם התרגיל
    table.text('description'); // תיאור מפורט של התרגיל
    table.string('image_url'); // קישור לתמונה של התרגיל
    table.boolean('is_public').defaultTo(true); // האם התרגיל ציבורי או פרטי (לעמותה)
    table.timestamps(true, true); // יוצר אוטומטית עמודות "נוצר ב-" ו"עודכן ב-"
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('exercises');
};