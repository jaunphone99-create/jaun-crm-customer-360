/* =====================================================================================
   tools/db/run.mjs — รัน migration + seed + ชุดทดสอบ บน PostgreSQL 17 (PGlite · WASM)
   ไม่ต้องติดตั้ง Postgres หรือ Docker · session เป็น UTC · pg_trgm อยู่ใน schema extensions · ข้ามไฟล์ *_cron.sql

   ใช้:
     node tools/db/run.mjs                       รัน migrations อย่างเดียว
     node tools/db/run.mjs --seed                 + supabase/seed.sql
     node tools/db/run.mjs --seed --test          + ทุกไฟล์ใน supabase/tests/*.sql
     node tools/db/run.mjs --seed --test rls_     เฉพาะไฟล์ทดสอบที่ชื่อขึ้นต้นด้วย rls_
     node tools/db/run.mjs --seed --sql "select …"   รันคำสั่งเดียวแล้วพิมพ์ผล (ดีบัก)
     node tools/db/run.mjs --quiet                ไม่พิมพ์ NOTICE ที่ผ่าน

   หา PGlite ตามลำดับ: แพ็กเกจ @electric-sql/pglite ในโครงการ → ตัวแปร PGLITE_DIR → โฟลเดอร์สำรองในเครื่องนี้
   (ติดตั้งในโครงการด้วย `npm install` — package.json ระบุไว้แล้ว)

   กติกาไฟล์:
     supabase/migrations/NNNN_name.sql  เรียงตามชื่อ · แต่ละไฟล์รันในทรานแซกชันของตัวเอง
     supabase/tests/*.sql               แต่ละไฟล์ถูกครอบ BEGIN … ROLLBACK · ห้ามมีคำสั่งควบคุมทรานแซกชันในไฟล์
                                        ทดสอบผ่าน = ไม่มี exception · ใช้ test.assert_* จาก supabase-shim.sql
   ออกด้วย exit code 1 เมื่อมีข้อใดล้มเหลว
   ================================================================================== */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const valueAfter = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const QUIET = flag("--quiet");

async function loadPGlite() {
  const candidates = [];
  try {
    const m = await import("@electric-sql/pglite");
    const trgm = await import("@electric-sql/pglite/contrib/pg_trgm");
    return { PGlite: m.PGlite, pg_trgm: trgm.pg_trgm };
  } catch { /* ลองทางถัดไป */ }
  if (process.env.PGLITE_DIR) candidates.push(process.env.PGLITE_DIR);
  candidates.push(resolve(ROOT, "../ระบบจัดการหน้าร้าน Jaun Academy Center/node_modules/@electric-sql/pglite"));
  for (const dir of candidates) {
    const idx = join(dir, "dist/index.js");
    if (!existsSync(idx)) continue;
    const m = await import(pathToFileURL(idx).href);
    const trgm = await import(pathToFileURL(join(dir, "dist/contrib/pg_trgm.js")).href);
    return { PGlite: m.PGlite, pg_trgm: trgm.pg_trgm };
  }
  console.error("ไม่พบ @electric-sql/pglite — รัน `npm install` หรือตั้ง PGLITE_DIR");
  process.exit(2);
}

function listSql(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => join(dir, f));
}

function rel(p) { return p.replace(ROOT + "/", ""); }

/* แยก NOTICE ที่ขึ้นต้นด้วย ok: ออกจากข้อความอื่นเพื่อสรุปผล */
let notices = [];

async function main() {
  const { PGlite, pg_trgm } = await loadPGlite();
  const db = new PGlite({ extensions: { pg_trgm } });
  db.onNotification?.(() => {});
  const execFile = async (file, { wrapRollback = false } = {}) => {
    const sql = readFileSync(file, "utf8");
    notices = [];
    const body = wrapRollback ? `BEGIN;\n${sql}\n;ROLLBACK;` : sql;
    const t0 = Date.now();
    try {
      await db.exec(body, { onNotice: (n) => notices.push(n.message) });
      return { ok: true, ms: Date.now() - t0 };
    } catch (e) {
      if (wrapRollback) { try { await db.exec("ROLLBACK;"); } catch { /* ไม่มีทรานแซกชันค้าง */ } }
      return { ok: false, ms: Date.now() - t0, error: e };
    }
  };

  const fmtErr = (e) => [
    e.message,
    e.detail && `detail: ${e.detail}`,
    e.hint && `hint: ${e.hint}`,
    e.where && `where: ${e.where}`,
    e.position && `position: ${e.position}`,
  ].filter(Boolean).join("\n    ");

  /* ให้เหมือน Supabase: session เป็น UTC (ห้ามพึ่ง TimeZone ของเครื่อง) · extension อยู่ใน schema extensions · PG 17 */
  await db.exec("SET TIME ZONE 'UTC'; CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;");
  const ver = (await db.query("SELECT current_setting('server_version_num')::int AS v")).rows[0].v;
  if (Math.floor(ver / 10000) !== 17) { console.error(`PGlite ต้องเป็น PostgreSQL 17 (ได้ ${ver}) — ใช้ @electric-sql/pglite 0.4.1`); process.exit(2); }
  const shim = await execFile(join(ROOT, "tools/db/supabase-shim.sql"));
  if (!shim.ok) { console.error("shim ล้มเหลว:\n    " + fmtErr(shim.error)); process.exit(1); }

  let failed = 0;
  /* *_cron.sql เรียก cron.schedule ซึ่งมีเฉพาะบน Supabase — ข้าม */
  for (const f of listSql(join(ROOT, "supabase/migrations")).filter((f) => !f.endsWith("_cron.sql"))) {
    const r = await execFile(f);
    console.log(`${r.ok ? "✓" : "✗"} migration ${rel(f)} (${r.ms} ms)`);
    if (!r.ok) { console.error("    " + fmtErr(r.error)); process.exit(1); }
  }

  if (flag("--seed")) {
    const seed = join(ROOT, "supabase/seed.sql");
    if (!existsSync(seed)) { console.error("ไม่พบ supabase/seed.sql"); process.exit(1); }
    const r = await execFile(seed);
    console.log(`${r.ok ? "✓" : "✗"} seed ${rel(seed)} (${r.ms} ms)`);
    if (!r.ok) { console.error("    " + fmtErr(r.error)); process.exit(1); }
  }

  const oneSql = valueAfter("--sql");
  if (oneSql) {
    const res = await db.exec(oneSql);
    for (const r of res) if (r.rows?.length) console.table(r.rows);
  }

  if (flag("--test")) {
    const prefix = valueAfter("--test");
    const files = listSql(join(ROOT, "supabase/tests"))
      .filter((f) => !prefix || prefix.startsWith("--") || f.split("/").pop().startsWith(prefix));
    for (const f of files) {
      const r = await execFile(f, { wrapRollback: true });
      const oks = notices.filter((n) => n.startsWith("ok:")).length;
      console.log(`${r.ok ? "✓" : "✗"} test ${rel(f)} — ${oks} assertion ผ่าน (${r.ms} ms)`);
      if (!QUIET) for (const n of notices) console.log(`    ${n}`);
      if (!r.ok) { failed++; console.error("    " + fmtErr(r.error)); }
    }
    console.log(failed ? `\n${failed} ไฟล์ทดสอบล้มเหลว` : `\nทดสอบผ่านทั้งหมด ${files.length} ไฟล์`);
  }
  await db.close();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
