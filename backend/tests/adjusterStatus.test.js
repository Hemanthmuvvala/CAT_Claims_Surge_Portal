import test from "node:test";
import assert from "node:assert/strict";
import { getAdjusterStatus } from "../src/lib/adjusterStatus.js";

test("adjuster status follows current load and capacity", () => {
  assert.equal(getAdjusterStatus("available", 2, 10), "available");
  assert.equal(getAdjusterStatus("available", 8, 10), "near_capacity");
  assert.equal(getAdjusterStatus("available", 10, 10), "overloaded");
  assert.equal(getAdjusterStatus("available", 12, 10), "overloaded");
});

test("unavailable status is retained regardless of remaining capacity", () => {
  assert.equal(getAdjusterStatus("unavailable", 0, 10), "unavailable");
});

test("zero-capacity adjusters do not divide by zero", () => {
  assert.equal(getAdjusterStatus("available", 0, 0), "overloaded");
});
