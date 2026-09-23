/* =====================================================================================
   tools/db/dev-api.mjs — ฐานข้อมูลสำหรับพัฒนาในเครื่อง ไม่ต้องมี Docker หรือ Supabase CLI

   ทำไมต้องมี: เครื่องของทีมส่วนใหญ่ยังไม่มี Docker และยังไม่ได้ตั้ง Supabase จริง
   แต่ Core Flow ต้องพิสูจน์ได้ว่าทำงานกับ RLS และ RPC ตัวจริง ไม่ใช่ข้อมูลปลอมในหน้าจอ
   ตัวนี้จึงยก PostgreSQL 17 (PGlite) ขึ้นมาในเครื่อง รัน migration + seed ชุดเดียวกับที่ทดสอบ
   แล้วพูดภาษา PostgREST เท่าที่แอปใช้ — แอปจึงใช้ supabase-js ทางเดียวกับของจริงทุกบรรทัด

   **ใช้ตอนพัฒนาเท่านั้น** — ไม่ตรวจรหัสผ่าน ผู้เรียกบอกได้ว่าตัวเองเป็นใคร
   บน staging/production แอปต้องต่อ Supabase จริงเสมอ (web/src/lib/env.ts บังคับไว้)

   ใช้:
     node tools/db/dev-api.mjs              เปิดที่ http://127.0.0.1:54329 (ข้อมูลอยู่ใน .dev-db/)
     node tools/db/dev-api.mjs --fresh      ล้างแล้วสร้างใหม่จาก migration + seed
     node tools/db/dev-api.mjs --port 5555  เปลี่ยนพอร์ต

   รองรับ:
     GET    /rest/v1/:relation   select · ตัวกรอง (eq neq gt gte lt lte like ilike is in) · order · limit · offset
     POST   /rest/v1/:relation   insert
     PATCH  /rest/v1/:relation   update ตามตัวกรอง
     POST   /rest/v1/rpc/:fn     เรียกฟังก์ชัน
     schema มาจากหัวข้อ Accept-Profile / Content-Profile (supabase-js ส่งให้เมื่อเรียก .schema())
     ตัวตนมาจาก Authorization: Bearer dev:<staff_code>:<aal>
     GET    /health · GET /dev/staff   (เฉพาะเครื่องมือพัฒนา)
   ================================================================================== */
import { readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const valueAfter = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };

const PORT = Number(valueAfter("--port") || process.env.JCRM_DEV_API_PORT || 54329);
const DATA_DIR = resolve(ROOT, process.env.JCRM_DEV_DB_DIR || ".dev-db");

if (process.env.NODE_ENV === "production") {
  console.error("dev-api.mjs ห้ามรันด้วย NODE_ENV=production — บน production ต้องต่อ Supabase จริง");
  process.exit(2);
}

/* ---- โหลด PGlite (วิธีเดียวกับ tools/db/run.mjs) ------------------------------- */
async function loadPGlite() {
  try {
    const m = await import("@electric-sql/pglite");
    const trgm = await import("@electric-sql/pglite/contrib/pg_trgm");
    return { PGlite: m.PGlite, pg_trgm: trgm.pg_trgm };
  } catch { /* ลองทางถัดไป */ }
  const candidates = [];
  if (process.env.PGLITE_DIR) candidates.push(process.env.PGLITE_DIR);
  candidates.push(resolve(ROOT, "../ระบบจัดการหน้าร้าน Jaun Academy Center/node_modules/@electric-sql/pglite"));
  for (const dir of candidates) {
    const idx = join(dir, "dist/index.js");
    if (!existsSync(idx)) continue;
    const m = await import(pathToFileURL(idx).href);
    const trgm = await import(pathToFileURL(join(dir, "dist/contrib/pg_trgm.js")).href);
    return { PGlite: m.PGlite, pg_trgm: trgm.pg_trgm };
  }
  console.error("ไม่พบ @electric-sql/pglite — รัน `npm install` ที่รากโครงการ");
  process.exit(2);
}

const listSql = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => join(dir, f)) : [];

/* ---- สร้างฐานข้อมูลครั้งแรก --------------------------------------------------- */
async function bootstrap(db) {
  const t0 = Date.now();
  await db.exec("SET TIME ZONE 'UTC'; CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;");
  await db.exec(readFileSync(join(ROOT, "tools/db/supabase-shim.sql"), "utf8"));
  for (const f of listSql(join(ROOT, "supabase/migrations")).filter((f) => !f.endsWith("_cron.sql"))) {
    await db.exec(readFileSync(f, "utf8"));
    console.log(`  ✓ ${f.replace(ROOT + "/", "")}`);
  }
  const seed = join(ROOT, "supabase/seed.sql");
  if (!existsSync(seed)) {
    console.log("  ไม่พบ supabase/seed.sql — สร้างจาก tools/db/gen-seed.mjs");
    const { execFileSync } = await import("node:child_process");
    execFileSync(process.execPath, [join(ROOT, "tools/db/gen-seed.mjs")], { stdio: "inherit" });
  }
  await db.exec(readFileSync(seed, "utf8"));
  console.log(`  ✓ seed (${Date.now() - t0} ms รวมทั้งหมด)`);
}

/* ---- คิวคำสั่ง: PGlite มีคอนเนกชันเดียว จึงต้องรันทีละคำขอ --------------------- */
let chain = Promise.resolve();
const serialize = (fn) => {
  const run = chain.then(fn, fn);
  chain = run.then(() => undefined, () => undefined);
  return run;
};

const httpError = (status, message, extra = {}) =>
  Object.assign(new Error(message), { http: status, ...extra });

/* ---- ตัวตน: Authorization: Bearer dev:<staff_code>:<aal> ---------------------- */
function identityOf(req) {
  const raw = req.headers.authorization ?? "";
  const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
  if (!token || token === "dev-anon") return null;
  const m = /^dev:(ST-\d{4,}):(aal1|aal2)$/.exec(token);
  if (!m) throw httpError(401, "token ของโหมดพัฒนาไม่ถูกต้อง (ต้องเป็น dev:ST-NNNN:aal1|aal2)");
  return { staffCode: m[1], aal: m[2] };
}

async function assumeIdentity(db, identity) {
  if (!identity) {
    await db.query("SELECT test.login_anon()");
    return;
  }
  const { rows } = await db.query("SELECT user_id FROM core.staff_profiles WHERE staff_code = $1", [identity.staffCode]);
  const uid = rows[0]?.user_id;
  if (!uid) throw httpError(401, `ไม่พบพนักงานรหัส ${identity.staffCode}`);
  await db.query("SELECT test.login_as_uid($1::uuid, $2::text)", [uid, identity.aal]);
}

/* ---- ตัวช่วยแปลง query string แบบ PostgREST ---------------------------------- */
const IDENT = /^[a-z_][a-z0-9_]*$/;
const ident = (s, what) => {
  if (!IDENT.test(s)) throw httpError(400, `ชื่อ${what}ไม่ถูกต้อง: ${s}`);
  return s;
};

const OPS = {
  eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=",
  like: "LIKE", ilike: "ILIKE",
};

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

/** แปลง "col=op.value" เป็นเงื่อนไข SQL — คืน { sql, values } */
function parseFilters(params, values) {
  const clauses = [];
  for (const [rawKey, rawVal] of params) {
    if (RESERVED.has(rawKey)) continue;
    const col = ident(rawKey, "คอลัมน์");
    const dot = rawVal.indexOf(".");
    if (dot < 0) throw httpError(400, `ตัวกรองต้องอยู่ในรูป op.value (ได้ ${rawKey}=${rawVal})`);
    const op = rawVal.slice(0, dot);
    const val = rawVal.slice(dot + 1);

    if (op === "is") {
      const target = val.toLowerCase();
      if (target === "null") { clauses.push(`"${col}" IS NULL`); continue; }
      if (target === "not.null") { clauses.push(`"${col}" IS NOT NULL`); continue; }
      if (target === "true" || target === "false") { clauses.push(`"${col}" IS ${target}`); continue; }
      throw httpError(400, `is.${val} ยังไม่รองรับ`);
    }
    if (op === "in") {
      const list = val.replace(/^\(/, "").replace(/\)$/, "");
      const items = list === "" ? [] : list.split(",").map((s) => s.replace(/^"|"$/g, ""));
      if (items.length === 0) { clauses.push("false"); continue; }
      const marks = items.map((item) => { values.push(item); return `$${values.length}`; });
      clauses.push(`"${col}"::text IN (${marks.join(", ")})`);
      continue;
    }
    const sqlOp = OPS[op];
    if (!sqlOp) throw httpError(400, `ตัวดำเนินการ ${op} ยังไม่รองรับใน dev-api`);
    values.push(val);
    clauses.push(`"${col}"::text ${sqlOp} $${values.length}`);
  }
  return clauses;
}

function parseSelect(raw) {
  if (!raw || raw.trim() === "*" || raw.trim() === "") return "*";
  const cols = raw.split(",").map((c) => c.trim()).filter(Boolean);
  for (const c of cols) {
    if (c.includes("(")) {
      throw httpError(400, "dev-api ยังไม่รองรับ select แบบฝังตาราง (embed) — ให้ query แยกแล้วต่อกันในโค้ด");
    }
  }
  return cols.map((c) => `"${ident(c, "คอลัมน์")}"`).join(", ");
}

function parseOrder(raw) {
  if (!raw) return "";
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean).map((p) => {
    const [col, ...mods] = p.split(".");
    const dir = mods.includes("desc") ? "DESC" : "ASC";
    const nulls = mods.includes("nullsfirst") ? " NULLS FIRST" : mods.includes("nullslast") ? " NULLS LAST" : "";
    return `"${ident(col ?? "", "คอลัมน์")}" ${dir}${nulls}`;
  });
  return parts.length ? ` ORDER BY ${parts.join(", ")}` : "";
}

const MAX_ROWS = 200;   // ตรงกับ max_rows ของ PostgREST (architecture §3.3)

/* ---- ตัวจัดการ REST ---------------------------------------------------------- */
async function handleRest(db, req, url, body) {
  const path = url.pathname.slice("/rest/v1/".length);
  const isRpc = path.startsWith("rpc/");
  const schemaHeader = req.method === "GET"
    ? req.headers["accept-profile"]
    : (req.headers["content-profile"] ?? req.headers["accept-profile"]);
  const schema = ident(String(schemaHeader ?? "public"), "schema");
  const identity = identityOf(req);

  if (isRpc) {
    const fn = ident(decodeURIComponent(path.slice(4)), "ฟังก์ชัน");
    return callRpc(db, schema, fn, body ?? {}, identity);
  }

  const relation = ident(decodeURIComponent(path.split("?")[0] ?? ""), "ตาราง");
  const params = [...url.searchParams.entries()];
  const values = [];

  if (req.method === "GET") {
    const cols = parseSelect(url.searchParams.get("select"));
    const where = parseFilters(params, values);
    const order = parseOrder(url.searchParams.get("order"));
    const limit = Math.min(Number(url.searchParams.get("limit") ?? MAX_ROWS) || MAX_ROWS, MAX_ROWS);
    const offset = Number(url.searchParams.get("offset") ?? 0) || 0;
    const sql =
      `SELECT ${cols} FROM "${schema}"."${relation}"` +
      (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
      order + ` LIMIT ${limit} OFFSET ${offset}`;
    return runAs(db, identity, async () => (await db.query(sql, values)).rows);
  }

  if (req.method === "POST") {
    const rows = Array.isArray(body) ? body : [body];
    if (rows.length === 0) return [];
    const cols = Object.keys(rows[0] ?? {}).map((c) => ident(c, "คอลัมน์"));
    const tuples = rows.map((row) =>
      `(${cols.map((c) => { values.push(row[c] ?? null); return `$${values.length}`; }).join(", ")})`
    );
    const sql =
      `INSERT INTO "${schema}"."${relation}" (${cols.map((c) => `"${c}"`).join(", ")}) ` +
      `VALUES ${tuples.join(", ")} RETURNING *`;
    return runAs(db, identity, async () => (await db.query(sql, values)).rows);
  }

  if (req.method === "PATCH") {
    const patch = body ?? {};
    const sets = Object.keys(patch).map((c) => {
      values.push(patch[c]);
      return `"${ident(c, "คอลัมน์")}" = $${values.length}`;
    });
    if (sets.length === 0) throw httpError(400, "PATCH ต้องมีคอลัมน์ที่จะแก้");
    const where = parseFilters(params, values);
    if (where.length === 0) throw httpError(400, "PATCH ต้องมีตัวกรอง — กันแก้ทั้งตารางโดยไม่ตั้งใจ");
    const sql =
      `UPDATE "${schema}"."${relation}" SET ${sets.join(", ")} WHERE ${where.join(" AND ")} RETURNING *`;
    return runAs(db, identity, async () => (await db.query(sql, values)).rows);
  }

  throw httpError(405, `ยังไม่รองรับ ${req.method}`);
}

/** รันในทรานแซกชันเดียว โดยสวมสิทธิ์ผู้ใช้ก่อนเสมอ (RLS ทำงานเหมือนของจริง) */
async function runAs(db, identity, fn) {
  await db.exec("BEGIN");
  try {
    await assumeIdentity(db, identity);
    const out = await fn();
    await db.exec("COMMIT");
    return out;
  } catch (e) {
    try { await db.exec("ROLLBACK"); } catch { /* ไม่มีทรานแซกชันค้าง */ }
    throw e;
  }
}

/* ---- เรียก RPC --------------------------------------------------------------- */
const sigCache = new Map();
async function signature(db, schema, name) {
  const key = `${schema}.${name}`;
  if (sigCache.has(key)) return sigCache.get(key);
  const { rows } = await db.query(
    `SELECT coalesce(p.proargnames, '{}') AS argnames,
            coalesce(array(SELECT format_type(t, NULL) FROM unnest(p.proargtypes) AS t), '{}') AS argtypes,
            p.proretset AS returns_set
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = $1 AND p.proname = $2`,
    [schema, name]
  );
  if (rows.length === 0) throw httpError(404, `ไม่พบฟังก์ชัน ${schema}.${name}`);
  if (rows.length > 1) throw httpError(400, `${schema}.${name} มีหลาย overload — dev-api ยังไม่รองรับ`);
  sigCache.set(key, rows[0]);
  return rows[0];
}

const JSONISH = /^(json|jsonb)(\[\])?$/;
function bind(value, type) {
  if (value === null || value === undefined) return null;
  if (JSONISH.test(type)) return JSON.stringify(value);
  if (type.endsWith("[]")) return Array.isArray(value) ? value : [value];
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

async function callRpc(db, schema, name, args, identity) {
  const sig = await signature(db, schema, name);
  const names = sig.argnames ?? [];
  const types = sig.argtypes ?? [];
  const given = Object.keys(args ?? {});
  const unknown = given.filter((k) => !names.includes(k));
  if (unknown.length) throw httpError(400, `${schema}.${name} ไม่มีพารามิเตอร์: ${unknown.join(", ")}`);

  const values = [];
  const parts = [];
  names.forEach((argName, i) => {
    if (!given.includes(argName)) return;                 // ใช้ค่า default ของฟังก์ชัน
    values.push(bind(args[argName], types[i] ?? "text"));
    parts.push(`${argName} => $${values.length}::${types[i] ?? "text"}`);
  });

  const call = `"${schema}"."${name}"(${parts.join(", ")})`;
  const sql = sig.returns_set ? `SELECT * FROM ${call}` : `SELECT ${call} AS result`;

  return runAs(db, identity, async () => {
    const rows = (await db.query(sql, values)).rows ?? [];
    if (!sig.returns_set) return rows[0]?.result ?? null;   // ฟังก์ชันคืนค่าเดี่ยว (ส่วนใหญ่เป็น jsonb)
    return rows;
  });
}

/* ---- HTTP -------------------------------------------------------------------- */
const json = (res, status, body) => {
  const text = JSON.stringify(body ?? null);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store",
  });
  res.end(text);
};

const readBody = (req) =>
  new Promise((ok, fail) => {
    let n = 0;
    const chunks = [];
    req.on("data", (c) => {
      n += c.length;
      if (n > 2_000_000) { fail(httpError(413, "body ใหญ่เกิน 2 MB")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return ok(null);
      try { ok(JSON.parse(raw)); } catch { fail(httpError(400, "body ไม่ใช่ JSON ที่ถูกต้อง")); }
    });
    req.on("error", fail);
  });

async function main() {
  const { PGlite, pg_trgm } = await loadPGlite();
  if (flag("--fresh") && existsSync(DATA_DIR)) {
    rmSync(DATA_DIR, { recursive: true, force: true });
    console.log(`ล้าง ${DATA_DIR.replace(ROOT + "/", "")} แล้ว`);
  }
  const fresh = !existsSync(DATA_DIR);
  console.log(`เปิดฐานข้อมูลที่ ${DATA_DIR.replace(ROOT + "/", "")}${fresh ? " (สร้างใหม่)" : ""}`);
  const db = new PGlite(DATA_DIR, { extensions: { pg_trgm } });
  await db.waitReady;
  await db.exec("SET TIME ZONE 'UTC'");
  if (fresh) await bootstrap(db);

  const ver = (await db.query("SELECT current_setting('server_version_num')::int AS v")).rows[0].v;
  const staffCount = (await db.query("SELECT count(*)::int AS n FROM core.staff_profiles")).rows[0].n;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true, postgres: ver, staff: staffCount, dataDir: DATA_DIR });
    }

    if (req.method === "GET" && url.pathname === "/dev/staff") {
      return void serialize(async () => {
        const { rows } = await db.query(`
          SELECT s.staff_code, s.display_name, s.nickname, s.status,
                 coalesce(string_agg(DISTINCT a.role_code, ' ' ORDER BY a.role_code), '') AS roles,
                 coalesce(string_agg(DISTINCT b.code, ' ' ORDER BY b.code), '')            AS branches
            FROM core.staff_profiles s
            LEFT JOIN core.staff_role_assignments a ON a.staff_id = s.id AND a.valid_to IS NULL
            LEFT JOIN core.branches b                ON b.id = a.branch_id
           WHERE s.user_id IS NOT NULL
           GROUP BY s.staff_code, s.display_name, s.nickname, s.status
           ORDER BY s.staff_code`);
        json(res, 200, { data: rows });
      }).catch((e) => json(res, 500, { message: e.message }));
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      return void readBody(req)
        .then((body) => serialize(() => handleRest(db, req, url, body)))
        .then((out) => json(res, req.method === "POST" && !url.pathname.startsWith("/rest/v1/rpc/") ? 201 : 200, out))
        .catch((e) =>
          json(res, e.http ?? 400, {
            message: e.message,
            code: e.code ?? null,
            details: e.detail ?? null,
            hint: e.hint ?? null,
          })
        );
    }

    json(res, 404, { message: "ไม่มีเส้นทางนี้" });
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`\ndev-api พร้อมใช้งานที่ http://127.0.0.1:${PORT}`);
    console.log(`  PostgreSQL ${ver} · พนักงาน ${staffCount} คน`);
    console.log(`  โหมดพัฒนาเท่านั้น — ไม่ตรวจรหัสผ่าน ผู้เรียกระบุตัวตนเองได้\n`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
