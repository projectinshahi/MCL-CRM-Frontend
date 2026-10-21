// Run: npm test. Which modules a role sees, which module an address belongs to, and where sign-in lands.
import assert from "node:assert/strict";
import { test } from "node:test";
import { landing, moduleOf, MODULES, modulesFor } from "./modules.ts";

const ADMIN = ["all_records", "calculator", "customers", "dashboard", "follow_ups", "leads", "modules", "notifications", "settings", "users"];
const BDE = ["dashboard", "leads", "follow_ups", "modules", "notifications"];
const OPS = ["users", "settings", "modules"];

test("a role sees only the modules it can open something in, each with only its own pages", () => {
  assert.deepEqual(MODULES.map((m) => [m.key, m.pages.length > 0]), [["sales", true], ["bde", false], ["finance", false]]);
  assert.equal(modulesFor(ADMIN)[0].pages.length, 7);
  const [sales, ...rest] = modulesFor(BDE);
  assert.deepEqual([sales.key, rest.length], ["sales", 0]); // BDE and Finance have no pages yet
  assert.deepEqual(sales.pages.map((p) => p.href), ["/", "/leads", "/follow-ups"]); // no Customers or Calculator
  assert.deepEqual(modulesFor(OPS)[0].pages.map((p) => p.href), ["/users", "/settings"]);
  assert.deepEqual(modulesFor(["modules"]), []);
});

test("every address belongs to its module, sub-pages included; shared pages and Modules belong to none", () => {
  assert.equal(moduleOf("/")?.key, "sales");
  assert.equal(moduleOf("/leads/pipeline")?.key, "sales");
  assert.equal(moduleOf("/leads/0d1c")?.key, "sales");
  assert.equal(moduleOf("/users/roles")?.key, "sales");
  assert.equal(moduleOf("/settings/lead-status")?.key, "sales");
  assert.equal(moduleOf("/notifications"), undefined);
  assert.equal(moduleOf("/modules"), undefined);
  assert.equal(moduleOf("/leadsx"), undefined); // a prefix is not a sub-page
});

test("sign-in lands on Modules, or the page first asked for if the role may open it — never another site", () => {
  assert.equal(landing(ADMIN), "/modules");
  assert.equal(landing(ADMIN, "/customers?status=active"), "/customers?status=active");
  assert.equal(landing(BDE, "/users"), "/modules"); // not allowed: Modules instead
  assert.equal(landing(ADMIN, "//evil.example/leads"), "/modules");
  assert.equal(landing(ADMIN, "https://evil.example"), "/modules");
  assert.equal(landing(ADMIN, "/\\evil.example"), "/modules");
  assert.equal(landing(["leads", "follow_ups"]), "/leads"); // no Modules page: the first page the role allows
  assert.equal(landing(["notifications"]), "/notifications");
});
