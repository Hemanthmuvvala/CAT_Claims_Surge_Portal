/**
 * Priority scores: persist the AI tag extraction so the queue/detail pages can
 * show what the model labelled (peril_type, damage_type, signals, summary).
 */
export async function up(knex) {
  await knex.schema.alterTable("priority_scores", (t) => {
    t.jsonb("tags");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("priority_scores", (t) => {
    t.dropColumn("tags");
  });
}
