"use strict";

// Initial schema for INS-04 — CAT Claims Surge Portal.
// Entities from docs/DATA_MODEL.md, normalised with keys, FKs and a
// cluster_claims junction table (the brief asks for a junction relationship
// rather than relying only on an array).

export async function up(knex) {
  // --- Users (auth arrives with JWT later; roles seeded for scoping now) ---
  await knex.schema.createTable("users", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("email").notNullable().unique();
    t.text("name").notNullable();
    t.text("role").notNullable(); // manager | adjuster | policyholder
    t.text("policy_id"); // policyholders only
    t.text("password_hash"); // filled when JWT auth is wired
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // --- CAT events ---
  await knex.schema.createTable("events", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("name").notNullable();
    t.text("type").notNullable(); // peril category
    t.text("region").notNullable();
    t.timestamp("declared_at", { useTz: true }).notNullable();
    t.text("status").notNullable().defaultTo("active"); // active | monitoring | closed
    t.text("summary");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["status", "declared_at"]);
  });

  // --- Resources / adjusters (surge team) ---
  await knex.schema.createTable("resources", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("name").notNullable();
    t.text("region");
    t.text("phone");
    t.integer("capacity").notNullable().defaultTo(10);
    t.text("status").notNullable().defaultTo("available"); // available | near_capacity | overloaded | unavailable
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // --- Claims (PII: contact_name, contact_email — masked in logs) ---
  await knex.schema.createTable("claims", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("ref").notNullable().unique(); // human-facing reference, e.g. CLM-2026-0142
    t.uuid("event_id").notNullable().references("id").inTable("events");
    t.text("policy_id").notNullable();
    t.uuid("policyholder_user_id").references("id").inTable("users");
    t.text("contact_name"); // PII
    t.text("contact_email"); // PII
    t.text("location").notNullable();
    t.text("peril").notNullable();
    t.date("incident_date").notNullable();
    t.text("description");
    t.text("severity").notNullable(); // critical | high | medium | low
    t.jsonb("hardship_flags").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    t.jsonb("documents").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    t.text("status").notNullable().defaultTo("submitted");
    t.uuid("cluster_id"); // FK added after clusters is created (circular reference)
    t.uuid("assigned_resource_id").references("id").inTable("resources");
    t.timestamp("received_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["event_id", "status"]);
    t.index(["cluster_id"]);
    t.index(["assigned_resource_id"]);
  });

  // --- Clusters + junction (per the brief: junction relationship) ---
  await knex.schema.createTable("clusters", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("event_id").notNullable().references("id").inTable("events");
    t.text("key").notNullable(); // e.g. "harbour-esplanade|storm-surge"
    t.text("name").notNullable();
    t.text("location").notNullable();
    t.text("peril").notNullable();
    t.text("note");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["event_id", "key"]);
  });

  await knex.schema.createTable("cluster_claims", (t) => {
    t.uuid("cluster_id").notNullable().references("id").inTable("clusters").onDelete("cascade");
    t.uuid("claim_id").notNullable().references("id").inTable("claims").onDelete("cascade");
    t.primary(["cluster_id", "claim_id"]);
  });

  // Add the claims → clusters FK now that both tables exist.
  await knex.schema.alterTable("claims", (t) => {
    t.foreign("cluster_id").references("id").inTable("clusters");
  });

  // --- Priority scores (history retained; AI or rules fallback) ---
  await knex.schema.createTable("priority_scores", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("claim_id").notNullable().references("id").inTable("claims").onDelete("cascade");
    t.integer("value").notNullable(); // 0–100 triage support score
    t.jsonb("factors").notNullable().defaultTo(knex.raw("'[]'::jsonb")); // [{label, weight, detail}]
    t.text("scoring_method").notNullable(); // ai_assisted | rules_fallback
    t.timestamp("processed_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.integer("latency_ms");
    t.decimal("cost_usd", 8, 4);
    t.text("evidence_state"); // available | partial | missing
    t.jsonb("coverage_evidence").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    t.boolean("needs_human_review").notNullable().defaultTo(true);
    t.jsonb("warnings").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["claim_id", "processed_at"]);
  });

  // --- Assignments (history retained — reassignment adds rows, never deletes) ---
  await knex.schema.createTable("assignments", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("claim_id").notNullable().references("id").inTable("claims").onDelete("cascade");
    t.uuid("resource_id").notNullable().references("id").inTable("resources");
    t.text("note");
    t.timestamp("assigned_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["resource_id", "assigned_at"]);
    t.index(["claim_id"]);
  });

  // --- Claim timeline (claimant-safe + internal progress events) ---
  await knex.schema.createTable("claim_events", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("claim_id").notNullable().references("id").inTable("claims").onDelete("cascade");
    t.text("label").notNullable();
    t.text("actor").notNullable().defaultTo("System");
    t.timestamp("occurred_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["claim_id", "occurred_at"]);
  });

  // --- Operational activity feed (dashboard) ---
  await knex.schema.createTable("activity_log", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("claim_id").references("id").inTable("claims").onDelete("set null");
    t.text("action").notNullable(); // Intake | Triage | Assignment | Status | Batch intake | Event | Review
    t.text("label").notNullable();
    t.text("status_label");
    t.text("source").notNullable().defaultTo("System");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["created_at"]);
  });
};

export async function down(knex) {
  await knex.schema.dropTableIfExists("activity_log");
  await knex.schema.dropTableIfExists("claim_events");
  await knex.schema.dropTableIfExists("assignments");
  await knex.schema.dropTableIfExists("priority_scores");
  await knex.schema.dropTableIfExists("cluster_claims");
  await knex.schema.dropTableIfExists("clusters");
  await knex.schema.dropTableIfExists("claims");
  await knex.schema.dropTableIfExists("resources");
  await knex.schema.dropTableIfExists("events");
  await knex.schema.dropTableIfExists("users");
};
