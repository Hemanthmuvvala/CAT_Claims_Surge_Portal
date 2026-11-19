/**
 * Cluster logic parity with the frontend + login plumbing:
 *  - clusters.peril_family / location_key: the (peril family, street block)
 *    key components used by deterministic clustering.
 *  - claims.cluster_manual: claims the manager moved by hand survive rebuilds.
 *  - users.resource_id: links an adjuster login to their surge-team record
 *    (returned by /auth/login so adjuster views scope to their queue).
 */
export async function up(knex) {
  await knex.schema.alterTable("clusters", (t) => {
    t.text("peril_family");
    t.text("location_key");
  });

  await knex.schema.alterTable("claims", (t) => {
    t.boolean("cluster_manual").notNullable().defaultTo(false);
  });

  await knex.schema.alterTable("users", (t) => {
    t.uuid("resource_id").references("id").inTable("resources");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("users", (t) => {
    t.dropColumn("resource_id");
  });
  await knex.schema.alterTable("claims", (t) => {
    t.dropColumn("cluster_manual");
  });
  await knex.schema.alterTable("clusters", (t) => {
    t.dropColumn("peril_family");
    t.dropColumn("location_key");
  });
}
