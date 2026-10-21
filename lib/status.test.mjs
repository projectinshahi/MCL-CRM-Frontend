// Run: npm test. Stage colours follow meaning (won green, lost red) and stay the same for a name everywhere.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LABEL_TONE, stageTone } from "./status.ts";

test("won and lost stages are green and red whatever they are called; seeded stages keep their hues", () => {
  assert.equal(stageTone({ name: "Closed – paid", isWon: true, isLost: false }), "green");
  assert.equal(stageTone({ name: "Dropped", isWon: false, isLost: true }), "red");
  assert.deepEqual(["New", "Contacted", "Interested", "Proposal"].map((name) => stageTone({ name })), ["sky", "indigo", "teal", "violet"]);
  assert.equal(stageTone({ name: "Converted" }), "green"); // a stage sent without its flags (customer detail)
});

test("a custom stage always gets the same hue, never a status colour (green, red, amber, slate)", () => {
  const tone = stageTone({ name: "Negotiation" });
  assert.equal(stageTone({ name: " negotiation " }), tone);
  for (const name of ["Negotiation", "Completed", "On hold", "Site visit", "Quote sent"]) assert.ok(!["green", "red", "amber", "slate"].includes(stageTone({ name })), name);
});

test("priorities and states have their own fixed tones", () => {
  assert.deepEqual(["Low", "Medium", "High"].map((l) => LABEL_TONE[l]), ["slate", "amber", "red"]);
  assert.deepEqual(["Pending", "Overdue", "Completed", "Active", "Inactive"].map((l) => LABEL_TONE[l]), ["amber", "red", "green", "green", "slate"]);
});
