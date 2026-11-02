// Run: npm test. The dashboard period: what is sent to the API, how it reads, and when a custom range is refused.
import assert from "node:assert/strict";
import { test } from "node:test";
import { daysLabel, periodLabel, periodQuery, rangeProblem, samePeriod, todayIST } from "./period.ts";

test("all time sends nothing; presets send days (the API works out the dates); a range sends both days", () => {
  assert.equal(periodQuery(null), undefined);
  assert.deepEqual(periodQuery({ days: 7 }), { days: 7 });
  assert.deepEqual(periodQuery({ days: 30 }), { days: 30 });
  assert.deepEqual(periodQuery({ from: "2026-10-01", to: "2026-10-15" }), { from: "2026-10-01", to: "2026-10-15" });
});

test("a custom range needs both days, in order, and none after today", () => {
  const today = "2026-11-02";
  assert.deepEqual(rangeProblem("", "2026-11-01", today), { field: "from", message: "Pick a start date" });
  assert.deepEqual(rangeProblem("2026-11-01", "", today), { field: "to", message: "Pick an end date" });
  assert.deepEqual(rangeProblem("2026-11-02", "2026-11-01", today), { field: "from", message: "The start date is after the end date" });
  assert.deepEqual(rangeProblem("2026-11-01", "2026-11-03", today), { field: "to", message: "The end date is after today" });
  assert.equal(rangeProblem("2026-11-02", "2026-11-02", today), null); // one day
  assert.equal(rangeProblem("2025-12-28", "2026-01-03", today), null);
});

test("periods read as words or as days, shortest form first", () => {
  assert.equal(periodLabel(null), "All time");
  assert.equal(periodLabel({ days: 7 }), "Last 7 days");
  assert.equal(periodLabel({ days: 30 }), "Last 30 days");
  assert.equal(daysLabel("2026-11-02", "2026-11-02"), "2 Nov 2026");
  assert.equal(daysLabel("2026-11-03", "2026-11-09"), "3 – 9 Nov 2026");
  assert.equal(daysLabel("2026-10-27", "2026-11-02"), "27 Oct – 2 Nov 2026");
  assert.equal(daysLabel("2025-12-28", "2026-01-03"), "28 Dec 2025 – 3 Jan 2026");
});

test("today is the India date, wherever the browser is", () => {
  assert.equal(todayIST(new Date("2026-11-01T18:29:59.999Z")), "2026-11-01"); // 23:59:59.999 in India
  assert.equal(todayIST(new Date("2026-11-01T18:30:00.000Z")), "2026-11-02"); // midnight in India
});

test("the same period is recognised, so picking it again doesn't refetch", () => {
  assert.ok(samePeriod(null, null));
  assert.ok(samePeriod({ days: 7 }, { days: 7 }));
  assert.ok(!samePeriod({ days: 7 }, { days: 30 }));
  assert.ok(samePeriod({ from: "2026-10-01", to: "2026-10-02" }, { from: "2026-10-01", to: "2026-10-02" }));
});
