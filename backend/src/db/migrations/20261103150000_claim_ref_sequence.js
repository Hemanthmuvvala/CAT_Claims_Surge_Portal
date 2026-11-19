// Claim ref generation must be atomic under concurrency: nextRef() used to
// read count(*) and derive the next number, so two simultaneous intakes could
// compute the same ref and the loser hit claims_ref_unique (HTTP 500).
// A Postgres sequence hands out numbers atomically.
export async function up(knex) {
  await knex.raw("CREATE SEQUENCE IF NOT EXISTS claim_ref_seq START 140");

  // Continue where existing claims left off (demo refs are CLM-2026-0NNN).
  await knex.raw(`
    SELECT setval(
      'claim_ref_seq',
      GREATEST(
        139,
        COALESCE((SELECT MAX(SPLIT_PART(ref, '-', 3)::bigint) FROM claims), 139)
      ),
      true
    )
  `);
}

export async function down(knex) {
  await knex.raw("DROP SEQUENCE IF EXISTS claim_ref_seq");
}
