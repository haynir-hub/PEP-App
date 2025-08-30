exports.up = function(knex) {
  return knex.schema.table('users', (table) => {
    table.string('fullname').notNullable().defaultTo('');
  });
};

exports.down = function(knex) {
  return knex.schema.table('users', (table) => {
    table.dropColumn('fullname');
  });
};