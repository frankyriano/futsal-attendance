import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import ts from "typescript";
const packageRequire = createRequire(import.meta.url);

// Exercise the real route and Supabase client against mocked HTTP responses.
function loadTS(file, dependencies = {}) {
  const filename = path.resolve(file);
  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(process.cwd());
  mod.require = id => dependencies[id] ?? packageRequire(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
  return mod.exports;
}
const dataModule = loadTS("lib/data.ts");
const { GET, POST } = loadTS("app/api/data/route.ts", { "@/lib/data": dataModule });
const originalFetch = global.fetch;
const originalEnv = { ...process.env };
const id = "12345678-1234-4234-8234-123456789abc";
const headers = { "Content-Type": "application/json" };
let calls;
beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test_only";
  calls = [];
  global.fetch = async (...args) => {
    calls.push(args);
    return Response.json([]);
  };
});
after(() => {
  global.fetch = originalFetch;
  for (const key of ["SUPABASE_URL", "SUPABASE_SECRET_KEY"]) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});
const post = body => POST(new Request("http://localhost/api/data", { method: "POST", headers, body: JSON.stringify(body) }));

test("missing setup fails closed without querying the database", async () => {
  delete process.env.SUPABASE_SECRET_KEY;
  assert.equal((await GET(new Request("http://localhost/api/data", { headers }))).status, 503);
  assert.equal(calls.length, 0);
});
test("reads and writes succeed without authentication", async () => {
  global.fetch = async (...args) => {
    calls.push(args);
    return Response.json(args[1]?.method === "POST" ? [{ id }] : { members: [], events: [] });
  };
  assert.equal((await GET()).status, 200);
  assert.equal((await post({ type: "save-member", id, editing: false, name: "新メンバー" })).status, 200);
  assert.equal(calls.length, 2);
});
test("invalid dates, IDs and oversized answers are rejected before writes", async () => {
  for (const command of [null, { type: "delete-member", id: "m1" },
    { type: "add-event", id, date: "2026-02-30" },
    { type: "save-member", id, editing: false, name: " " },
    { type: "save-answer", eventId: id, memberId: id, answer: { status: "出席", includeSelf: true, guests: Array(101).fill("友人"), note: "" } },
    { type: "save-answer", eventId: id, memberId: id, answer: { status: "出席", includeSelf: true, guests: [], note: "x".repeat(501) } },
  ]) assert.equal((await post(command)).status, 400);
  assert.equal(calls.length, 0);
});
test("empty database is returned as empty lists using one uncached snapshot query", async () => {
  global.fetch = async (...args) => {
    calls.push(args);
    return Response.json({ members: [], events: [] });
  };
  const response = await GET(new Request("http://localhost/api/data", { headers }));
  assert.deepEqual(await response.json(), { members: [], events: [] });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(calls.length, 1);
  assert.match(String(calls[0][0]), /\/rpc\/get_futsal_data$/);
});
test("answer writes only the selected member and event and uses server timestamp", async () => {
  global.fetch = async (...args) => { calls.push(args); return Response.json([{ event_id: id }]); };
  const response = await post({ type: "save-answer", eventId: id, memberId: id,
    answer: { status: "出席", includeSelf: false, guests: ["友人"], note: "遅れます", updatedAt: "forged" } });
  assert.equal(response.status, 200);
  const [url, options] = calls[0];
  assert.match(String(url), /\/answers\?/);
  const row = JSON.parse(options.body);
  assert.equal(row.event_id, id);
  assert.equal(row.member_id, id);
  assert.deepEqual(row.guests, ["友人"]);
  assert.equal(row.include_self, false);
  assert.ok(Number.isFinite(Date.parse(row.updated_at)));
  assert.notEqual(row.updated_at, "forged");
});
test("deletion requires matching event ID and confirmed date", async () => {
  const response = await post({ type: "delete-event", id, date: "2026-09-26" });
  assert.equal(response.status, 409);
  const url = new URL(calls[0][0]);
  assert.equal(url.searchParams.get("id"), `eq.${id}`);
  assert.equal(url.searchParams.get("date"), "eq.2026-09-26");
  assert.equal(calls[0][1].method, "DELETE");
});
test("database errors do not expose private details or report success", async () => {
  global.fetch = async () => Response.json({ message: "private database detail" }, { status: 500 });
  const response = await post({ type: "save-member", id, editing: false, name: "新メンバー" });
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /private database detail|sb_secret/);
});
