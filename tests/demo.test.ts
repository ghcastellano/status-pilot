import test from "node:test";
import assert from "node:assert/strict";
import { demoTeams, demoMetrics, demoCoaching, demoPortfolio, respondToDemo } from "../lib/demo/data";
import { demoDestination, DEMO_VERSION } from "../lib/demo/session";

test("demo routing isolates existing, unknown and future API paths", () => {
  for (const path of ["/api/teams", "/api/sync", "/api/forge/sync", "/api/future-admin"]) {
    assert.equal(demoDestination(path, DEMO_VERSION), "/api/demo/data");
    assert.equal(demoDestination(path), null);
  }
  assert.equal(demoDestination("/api/demo/session", DEMO_VERSION), null);
  assert.equal(demoDestination("/api/demo/data", DEMO_VERSION), null);
  assert.equal(demoDestination("/config", DEMO_VERSION), null);
});

test("sample teams have no connected boards and metrics respect filters", () => {
  assert.equal(demoTeams.length, 2);
  for (const team of demoTeams) {
    assert.equal(team.jira_board_id, null);
    const all = demoMetrics(team.id)!;
    const bugs = demoMetrics(team.id, new URLSearchParams({ type: "bug" }))!;
    assert.ok(all.totals.issues > 0);
    assert.ok(bugs.totals.issues > 0 && bugs.totals.issues < all.totals.issues);
    assert.ok(all.flow.deliveryCycleTime.p85 >= all.flow.deliveryCycleTime.median);
    assert.deepEqual(demoMetrics(team.id), all);
  }
});

test("coaching and dashboard share window and metric calculations", () => {
  for (const team of demoTeams) {
    const params = new URLSearchParams({ weeks: "4" });
    const detail = demoCoaching(team.id, params)!;
    assert.deepEqual(detail.metrics, demoMetrics(team.id, params));
    assert.ok(detail.history.length > 0);
    assert.ok(detail.experiments.length > 0);
    assert.ok(detail.assessment.signals.pull_not_push);
  }
  assert.equal(demoPortfolio().boards.length, 2);
});

test("an active sprint does not claim a completed maturity assessment", () => {
  const m = demoMetrics("espresso")!;
  const active = m.window.availableSprints.find((s) => s.state === "active");
  assert.ok(active);
  const detail = demoCoaching("espresso", new URLSearchParams({ sprintIds: active.id }))!;
  assert.equal(detail.maturity, null);
});

test("all mutation routes fail closed without changing fixture state", () => {
  const before = JSON.stringify(demoPortfolio());
  for (const route of ["/api/teams", "/api/sync", "/api/jira/connect-basic", "/api/coaching/plan", "/api/coaching/signals", "/api/coaching/experiments", "/api/coaching/comments", "/api/forge/sync", "/api/future-admin"]) {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      assert.equal(respondToDemo(method, route, new URLSearchParams(), { teamId: "espresso" }).status, 403);
    }
  }
  assert.equal(JSON.stringify(demoPortfolio()), before);
});

test("read contracts reject missing or unknown teams", () => {
  assert.deepEqual(respondToDemo("GET", "/api/teams", new URLSearchParams()).body, { teams: demoTeams });
  assert.equal(respondToDemo("GET", "/api/metrics", new URLSearchParams()).status, 400);
  assert.equal(respondToDemo("GET", "/api/metrics", new URLSearchParams({ teamId: "private-team" })).status, 404);
  assert.equal(respondToDemo("GET", "/api/unknown", new URLSearchParams()).status, 404);
});

test("sample analysis works offline and identifies itself instead of claiming live AI", () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Unexpected external network call"); };
  try {
    for (const route of ["/api/ask", "/api/report", "/api/insights"]) {
      const result = respondToDemo("POST", route, new URLSearchParams(), { teamId: "espresso", question: "Where is the bottleneck?" });
      assert.equal(result.status, 200);
      assert.match(JSON.stringify(result.body), /[Ss]ample/);
    }
    assert.equal(respondToDemo("POST", "/api/ask", new URLSearchParams(), { question: "" }).status, 400);
  } finally { globalThis.fetch = originalFetch; }
});
