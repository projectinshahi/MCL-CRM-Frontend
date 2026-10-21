// Run: npm test. Where dropdown menus are placed against their trigger, and how they join it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MARGIN, OVERLAP, place } from "./place.ts";

const view = { width: 1366, height: 768 };
const field = { top: 300, bottom: 340, left: 400, right: 800 };

test("a menu hangs from its trigger, borders overlapping, left edges lined up", () => {
  assert.deepEqual(place(field, { width: 400, height: 200 }, view), {
    top: 340 - OVERLAP,
    left: 400,
    maxHeight: undefined,
    up: false,
    join: { trigger: ["bl", "br"], menu: ["tl", "tr"] }, // as wide as its field: one box, all four joins square
  });
});

test("a menu that doesn't fit below opens right above its trigger", () => {
  const low = { top: 650, bottom: 690, left: 400, right: 800 };
  const p = place(low, { width: 400, height: 200 }, view);
  assert.equal(p.up, true);
  assert.equal(p.top + 200, low.top + OVERLAP); // its bottom border on the trigger's top border
  assert.deepEqual(p.join, { trigger: ["tl", "tr"], menu: ["bl", "br"] });
});

test("end alignment lines up right edges; the screen edges are never crossed", () => {
  const button = { top: 100, bottom: 140, left: 1250, right: 1340 };
  assert.equal(place(button, { width: 220, height: 160 }, view, "end").left, 1340 - 220);
  const nearRight = { top: 100, bottom: 140, left: 1300, right: 1360 };
  assert.equal(place(nearRight, { width: 220, height: 160 }, view).left, view.width - 220 - MARGIN);
  const nearLeft = { top: 100, bottom: 140, left: 20, right: 60 };
  assert.equal(place(nearLeft, { width: 220, height: 160 }, view, "end").left, MARGIN);
});

test("a list taller than both sides keeps the larger side and scrolls inside it", () => {
  const p = place(field, { width: 400, height: 2000 }, view);
  assert.equal(p.up, false); // 420px below vs 288px above
  assert.equal(p.maxHeight, view.height - field.bottom + OVERLAP - MARGIN);
  assert.equal(p.top, field.bottom - OVERLAP);
});

test("a menu wider than its trigger squares both trigger corners but only its own aligned corner", () => {
  const button = { top: 100, bottom: 140, left: 1250, right: 1340 };
  assert.deepEqual(place(button, { width: 220, height: 160 }, view, "end").join, { trigger: ["bl", "br"], menu: ["tr"] });
  const small = { top: 100, bottom: 140, left: 400, right: 490 };
  assert.deepEqual(place(small, { width: 220, height: 160 }, view).join, { trigger: ["bl", "br"], menu: ["tl"] });
});

test("a menu narrower than its trigger squares only the trigger corner it hangs under", () => {
  assert.deepEqual(place(field, { width: 200, height: 160 }, view).join, { trigger: ["bl"], menu: ["tl"] });
  assert.deepEqual(place(field, { width: 200, height: 160 }, view, "end").join, { trigger: ["br"], menu: ["tr"] });
});

test("a menu pushed off its trigger's edge by the screen edge keeps that corner rounded", () => {
  const nearRight = { top: 100, bottom: 140, left: 1300, right: 1360 }; // start-aligned, clamped leftwards
  assert.deepEqual(place(nearRight, { width: 220, height: 160 }, view).join, { trigger: ["bl"], menu: [] });
  const nearLeft = { top: 100, bottom: 140, left: 20, right: 60 }; // end-aligned, clamped rightwards
  assert.deepEqual(place(nearLeft, { width: 220, height: 160 }, view, "end").join, { trigger: ["bl", "br"], menu: [] });
});

test("sub-pixel trigger boxes still join", () => {
  const box = { top: 300.4, bottom: 340.4, left: 400.3, right: 800.6 };
  assert.deepEqual(place(box, { width: 400.3, height: 200 }, view).join, { trigger: ["bl", "br"], menu: ["tl", "tr"] });
});
