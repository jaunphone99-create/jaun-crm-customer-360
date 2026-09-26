import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Execute the actual Server Action with only the Next/auth/database boundaries stubbed.
// In particular, an UPDATE matching zero rows is not a database error.
const source = readFileSync(new URL("../src/features/reception/actions.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

function harness(result) {
  const refreshed = [];
  const query = {};
  for (const method of ["schema", "from", "update", "eq", "select"]) query[method] = () => query;
  query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  const exports = {};
  const imports = {
    "next/cache": { revalidatePath: (path) => refreshed.push(path) },
    "@/lib/access": { requireAccess: async () => ({ staff: { staff_id: "test-staff" } }) },
    "@/lib/db": { getDb: async () => ({ schema: () => query }), RpcError: class extends Error {} },
  };
  runInNewContext(outputText, {
    exports,
    require: (name) => {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    },
  });
  const form = new FormData();
  form.set("visitId", "test-visit");
  return { claim: () => exports.claimVisit({ ok: false, message: null }, form), refreshed };
}

test("a successful claim reports success and refreshes the queue", async () => {
  const h = harness({ data: [{ id: "test-visit" }], error: null });
  assert.equal((await h.claim()).ok, true);
  assert.deepEqual(h.refreshed, ["/reception"]);
});

test("a stale claim matching zero rows reports failure and refreshes the queue", async () => {
  const h = harness({ data: [], error: null });
  const result = await h.claim();
  assert.equal(result.ok, false);
  assert.match(result.message, /รับคิวไม่สำเร็จ/);
  assert.deepEqual(h.refreshed, ["/reception"]);
});

test("missing returned rows cannot be reported as a successful claim", async () => {
  const h = harness({ data: null, error: null });
  assert.equal((await h.claim()).ok, false);
});

test("a database denial is returned as a failure", async () => {
  const h = harness({ data: null, error: { message: "ไม่มีสิทธิ์รับคิว" } });
  const result = await h.claim();
  assert.equal(result.ok, false);
  assert.equal(result.message, "ไม่มีสิทธิ์รับคิว");
});
