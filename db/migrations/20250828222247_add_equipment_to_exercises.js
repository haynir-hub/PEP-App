exports.up = function(knex) {
  return knex.schema.table('exercises', (table) => {
    table.text('equipment').defaultTo('');
  });
};

exports.down = function(knex) {
  return knex.schema.table('exercises', (table) => {
    table.dropColumn('equipment');
  });
};