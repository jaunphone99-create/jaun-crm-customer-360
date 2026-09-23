/* =====================================================================================
   tools/db/gen-data-dictionary.mjs — สร้าง docs/03-data/data-dictionary.md จากฐานข้อมูลจริง
   (เอกสารชุดที่ 07 ตาม A45 · CANONICAL ข้อ 18)

   วิธีใช้ (จากรากโครงการ):
     npm run db:dictionary                 เขียนทับ docs/03-data/data-dictionary.md
     node tools/db/gen-data-dictionary.mjs --out <path>     เขียนไปที่อื่น
     node tools/db/gen-data-dictionary.mjs --check          ไม่เขียนไฟล์ · ออก 1 ถ้าไฟล์ในดิสก์ไม่ตรง

   ทำอะไร:
     1. เปิด PGlite 0.4.1 (PostgreSQL 17.5) เปล่า ๆ · SET TIME ZONE 'UTC' · pg_trgm ใน schema extensions
        (ใช้วิธีโหลดเดียวกับ tools/db/run.mjs)
     2. โหลด tools/db/supabase-shim.sql แล้วรัน supabase/migrations/*.sql ตามชื่อ (ข้าม *_cron.sql)
        **ไม่โหลด seed** — เอกสารนี้อธิบายโครงสร้าง ไม่ใช่ข้อมูล
     3. อ่าน catalog (pg_class · pg_attribute · pg_constraint · pg_index · pg_trigger · pg_policy ·
        pg_proc · pg_type/pg_enum · ACL) แล้วเขียน Markdown
     4. ป้าย [pii] อ่านจากคำนำหน้าของ COMMENT ของคอลัมน์ (CANONICAL ข้อ 19.1 ข้อ 3)
     5. ป้ายไทยของ ENUM มาจาก CANONICAL ข้อ 4 (ตารางฝังในไฟล์นี้ · ฐานข้อมูลไม่เก็บป้าย ข้อ 4)

   กติกา:
     · ผลลัพธ์ต้อง deterministic — ทุกรายการเรียงตามชื่อ · ห้ามใส่เวลาที่รัน
     · เจ้าของ (owner) ของทุกวัตถุบน Supabase = postgres · บน PGlite = web_user
       จึงตัด role เจ้าของและ PUBLIC ออกจากตาราง GRANT (เหลือเฉพาะ role ที่ระบบมอบสิทธิ์ให้จริง)
   ================================================================================== */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const valueAfter = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const OUT = resolve(ROOT, valueAfter("--out") || "docs/03-data/data-dictionary.md");
const CHECK_ONLY = flag("--check");

/* ── schema ที่เขียนลงเอกสาร (ตาม CANONICAL ข้อ 1.1 · เรียงจากฐานขึ้นไปหาผิว) ───────── */
const SCHEMAS = ["core", "ref", "crm", "app", "analytics", "audit", "api", "restricted"];

/* role เจ้าของ/สาธารณะ ที่ไม่ใช่สิทธิ์ที่ระบบมอบ (PGlite = web_user · Supabase = postgres) */
const OWNER_ROLES = new Set(["web_user", "postgres", "-", "PUBLIC"]);
/* ลำดับการแสดง role ในตาราง GRANT */
const ROLE_ORDER = ["anon", "authenticated", "service_role", "supabase_auth_admin", "audit_retention"];

/* =====================================================================================
   ป้ายไทยของ ENUM — CANONICAL ข้อ 4 (ฐานข้อมูลไม่เก็บป้ายไทย ข้อ 4)
   [label, หมายเหตุ] · label = "รอยืนยัน" เมื่อ CANONICAL ไม่ได้พิมพ์ป้ายไทยของค่านั้นไว้
   ================================================================================== */
const TBC = "รอยืนยัน";
const ENUM_LABELS = {
  "crm.visit_status": { ref: "ข้อ 4.1", values: {
    WAITING:     ["รอรับบริการ", "walk-in อยู่ในคิว ยังไม่มีผู้รับ (`owner_staff_id IS NULL`)"],
    IN_SERVICE:  ["กำลังให้บริการ", "มีผู้รับแล้ว · visit ออนไลน์/โทรเริ่มที่สถานะนี้"],
    COMPLETED:   ["เสร็จสิ้น", "ปิดพร้อม `outcome_code` (บังคับ)"],
    LEFT:        ["ออกก่อนรับบริการ", "outcome = `LEFT_BEFORE_SERVICE` อัตโนมัติ"],
    CANCELLED:   ["ยกเลิก (สร้างผิด)", "**ไม่นับในทุก KPI** · บังคับ `cancel_reason`"],
  } },
  "crm.lead_status": { ref: "ข้อ 4.3", values: {
    NEW:        ["ใหม่", "ยังไม่มีการตอบกลับ"],
    CONTACTED:  ["ติดต่อแล้ว", "มีการตอบกลับครั้งแรกแล้ว (`first_contacted_at`)"],
    QUALIFIED:  ["คัดกรองแล้ว", "ยืนยันความต้องการ งบ และช่วงเวลาซื้อ"],
    CONVERTED:  ["แปลงเป็นโอกาสขาย", "บังคับ `converted_opportunity_id` + `closed_at` · แปลงผ่าน `api.convert_lead` เท่านั้น"],
    LOST:       ["ไม่สำเร็จ", "บังคับ `lost_reason_code` + `closed_at`"],
  } },
  "crm.opportunity_stage": { ref: "ข้อ 4.4", values: {
    INTERESTED: ["สนใจ", "มีโอกาสซื้อจริง ยังไม่เสนอราคา · **ห้ามย้อนกลับมาขั้นนี้** (D48)"],
    QUOTATION:  ["เสนอราคา", "มี quotation ที่ `SENT` แล้วอย่างน้อย 1 ใบ (ไม่ว่าจะหมดอายุหรือไม่)"],
    FOLLOW_UP:  ["รอตัดสินใจ", "เสนอแล้ว รอลูกค้าตัดสินใจ"],
    WON:        ["ปิดการขาย", "บังคับ `won_amount > 0` · `won_at` · `closed_at = won_at`"],
    LOST:       ["ไม่สำเร็จ", "บังคับ `lost_reason_code` · `closed_at`"],
  } },
  "crm.quotation_status": { ref: "ข้อ 4.6", values: {
    DRAFT:    ["ร่าง", "แก้ได้ทุกช่อง (`quotation.update`)"],
    SENT:     ["ส่งแล้ว", "จาก DRAFT ด้วยปุ่ม \"ส่ง\" · `valid_until` = วันที่ส่ง + `quotation.valid_days` (7) วัน **[รอยืนยัน]** · หลังส่งแก้ได้เฉพาะ `status`"],
    ACCEPTED: ["ตอบรับ", "จาก SENT ด้วยมือ · **ไม่** ปิด WON อัตโนมัติ"],
    REJECTED: ["ปฏิเสธ", "จาก SENT ด้วยมือ"],
    EXPIRED:  ["หมดอายุ", "งาน `app.job_expire_quotations` 00:00 วันถัดจาก `valid_until`"],
  } },
  "crm.task_status": { ref: "ข้อ 4.7", values: {
    OPEN:        ["เปิด", ""],
    IN_PROGRESS: ["กำลังทำ", ""],
    DONE:        ["เสร็จ", "บังคับ `completed_at`"],
    CANCELLED:   ["ยกเลิก", "บังคับ `cancelled_at`"],
  } },
  "core.staff_status": { ref: "ข้อ 4.8", values: {
    INVITED:  ["เชิญแล้ว", "คำเชิญอายุ 24 ชม. (`invite_expires_at` ข้อ 7.3)"],
    ACTIVE:   ["ใช้งาน", ""],
    DISABLED: ["ปิดใช้งาน", "**ห้ามลบแถว** (ข้อ 7.3)"],
  } },
  "core.data_scope": { ref: "ข้อ 4.8 · 8.0", note: "CANONICAL ไม่ได้พิมพ์ป้ายไทยของค่าเหล่านี้ · ความหมายมาจากข้อ 8.0 · **ประกาศตามลำดับนี้** และการเทียบ `>=` ต้องมี `scope <> 'SYSTEM'`", values: {
    OWN:          [TBC, "แถวของตน: `branch_id` = สาขาของ assignment **และ** owner เป็นตน (หรือ owner ว่างและ `created_by` = ตน)"],
    TEAM:         [TBC, "owner อยู่ในทีมที่ตนเป็น `is_leader` ในสาขานั้น"],
    BRANCH:       [TBC, "ทุกแถวที่ `branch_id` = สาขาของ assignment"],
    ORGANIZATION: [TBC, "ทุกแถวในองค์กรของผู้ใช้"],
    SYSTEM:       [TBC, "เฉพาะวัตถุระบบ (บัญชี · settings เชิงเทคนิค · integration) **ไม่รวมข้อมูลลูกค้า**"],
  } },
  "crm.customer_record_status": { ref: "ข้อ 4.8", note: "CANONICAL ไม่ได้พิมพ์ป้ายไทยของค่าเหล่านี้", values: {
    ACTIVE:     [TBC, "ลูกค้าปกติ"],
    MERGED:     [TBC, "ถูกรวมเข้ากับรายอื่น · บังคับ `merged_into_id` (ข้อ 6.7)"],
    ANONYMIZED: [TBC, "ทำข้อมูลนิรนามแล้ว (ข้อ 10.4) · ยังผ่าน RLS ได้เพราะไม่มี PII แล้ว"],
  } },
  "crm.interaction_direction": { ref: "ข้อ 4.8", values: {
    INBOUND:  ["ลูกค้าติดต่อมา", "นับใน \"ติดต่อ N ครั้ง\" (ข้อ 3.3)"],
    OUTBOUND: ["พนักงานติดต่อไป", "ไม่สร้าง visit (ข้อ 3.3) · นับใน \"ติดต่อ N ครั้ง\""],
    INTERNAL: ["บันทึกภายใน", "ไม่สร้าง visit · **ไม่นับ** ใน \"ติดต่อ N ครั้ง\" · ใช้กับ `interaction_type_code = 'NOTE'`"],
  } },
  "crm.contact_type": { ref: "ข้อ 4.8 · 6.4", note: "CANONICAL ไม่ได้พิมพ์ป้ายไทยของค่าเหล่านี้ · หมายเหตุ = กติกา normalize/mask ข้อ 6.4", values: {
    PHONE:        [TBC, "`value_normalized` = E.164 · `value_masked` = `081-XXX-5678` / `02-XXX-4567`"],
    LINE_ID:      [TBC, "ตัดช่องว่าง ตัวพิมพ์เล็ก ตัด `@` นำหน้า · mask = 2 อักษรแรก + `***`"],
    LINE_USER_ID: [TBC, "ตามที่ LINE ส่ง · **ไม่แสดง** (`—`)"],
    FACEBOOK:     [TBC, "ตัดช่องว่าง ตัวพิมพ์เล็ก · mask = 2 อักษรแรก + `***`"],
    INSTAGRAM:    [TBC, "ตัดช่องว่าง ตัวพิมพ์เล็ก · mask = 2 อักษรแรก + `***`"],
    TIKTOK:       [TBC, "ตัดช่องว่าง ตัวพิมพ์เล็ก · mask = 2 อักษรแรก + `***`"],
    EMAIL:        [TBC, "ตัดช่องว่าง ตัวพิมพ์เล็ก · mask = `s***@example.com`"],
  } },
  "crm.consent_status": { ref: "ข้อ 4.8 · 10.2", values: {
    GRANTED:   ["ยินยอม/แจ้งแล้ว", ""],
    WITHDRAWN: ["ถอนแล้ว", "append-only: ถอน = แถวใหม่ ไม่มีคอลัมน์ `withdrawn_at`"],
  } },
  "crm.consent_capture_via": { ref: "ข้อ 4.8", values: {
    STAFF_FORM: ["พนักงานบันทึก", ""],
    LINK_SENT:  ["ส่งลิงก์ประกาศ", "ช่องทางออนไลน์/โทรใช้ค่านี้กับ `PRIVACY_NOTICE` (ข้อ 10.2)"],
    LINE_OA:    ["ผ่าน LINE OA", ""],
    WEB:        ["ผ่านเว็บไซต์", ""],
  } },
  "crm.customer_link_via": { ref: "ข้อ 4.8 · 6.6", note: "CANONICAL ไม่ได้พิมพ์ป้ายไทยของค่าเหล่านี้", values: {
    CREATED:     [TBC, "ผูกตอนสร้างลูกค้า (`first_branch_id`)"],
    VISIT:       [TBC, "ผูกจาก visit"],
    INTERACTION: [TBC, "ผูกจาก interaction"],
    LEAD:        [TBC, "ผูกจาก lead"],
    OPPORTUNITY: [TBC, "ผูกจาก opportunity"],
    MANUAL_LINK: [TBC, "`api.link_customer_to_branch` · transaction ref ใช้ค่านี้ใน V1"],
    MERGE:       [TBC, "ผูกจากการรวมลูกค้า (`api.merge_customers`)"],
  } },
  "crm.duplicate_status": { ref: "ข้อ 4.8", values: {
    PENDING:       ["รอตัดสิน", "นับใน `DUPLICATE_RATE` และ `DUPLICATE_SUSPECTED` (ข้อ 12.3)"],
    MERGED:        ["รวมแล้ว", ""],
    NOT_DUPLICATE: ["ยืนยันคนละคน", "`api.decide_duplicate` · ผู้ตัดสิน ≠ ผู้สร้างแถว"],
  } },
  "crm.dsr_type": { ref: "ข้อ 4.8", values: {
    ACCESS:           ["ขอดู/ขอสำเนา", "`api.build_dsr_package`"],
    CORRECTION:       ["ขอแก้ไข", ""],
    DELETION:         ["ขอลบ", "`api.anonymize_customer` (ข้อ 10.4)"],
    OBJECTION:        ["คัดค้าน", ""],
    WITHDRAW_CONSENT: ["ถอนความยินยอม", ""],
    PORTABILITY:      ["ขอโอนย้าย", "`api.build_dsr_package`"],
  } },
  "crm.dsr_status": { ref: "ข้อ 4.8", values: {
    RECEIVED:    ["รับคำขอแล้ว", ""],
    VERIFIED:    ["ยืนยันตัวตนแล้ว", "จำเป็นก่อน `DELETION` · `verified_by` ≠ ผู้ดำเนินการ (ข้อ 10.4)"],
    IN_PROGRESS: ["กำลังดำเนินการ", ""],
    COMPLETED:   ["เสร็จสิ้น", ""],
    REJECTED:    ["ปฏิเสธคำขอ", ""],
  } },
  "crm.interest_level": { ref: "ข้อ 4.8 **[รอยืนยัน]**", values: {
    HOT:  ["สนใจมาก", "เรียงก่อนใน \"สินค้าที่สนใจ\" (ข้อ 6.8)"],
    WARM: ["สนใจ", ""],
    COLD: ["สนใจน้อย", ""],
  } },
  "audit.export_status": { ref: "ข้อ 4.8 · 8.2", values: {
    REQUESTED:  ["รออนุมัติ", ""],
    APPROVED:   ["อนุมัติแล้ว", "คำขอ BRANCH_MANAGER ที่ไม่เกินเพดาน = `APPROVED` ทันที (`approved_by` NULL)"],
    REJECTED:   ["ไม่อนุมัติ", ""],
    GENERATED:  ["พร้อมดาวน์โหลด", "แจ้ง `EXPORT_READY`"],
    DOWNLOADED: ["ดาวน์โหลดแล้ว", "ดาวน์โหลดได้ < 3 ครั้ง ภายใน 24 ชม."],
    EXPIRED:    ["หมดอายุ", "`app.job_expire_exports` · ลบไฟล์ · คงจำนวนครั้งดาวน์โหลด"],
  } },
  "audit.actor_type": { ref: "ข้อ 4.8 · 9.5", note: "CANONICAL ไม่ได้พิมพ์ป้ายไทยของค่าเหล่านี้", values: {
    STAFF:       [TBC, "จาก `app.current_staff_id()`"],
    SYSTEM:      [TBC, "งานตามเวลา (เช่น `actor_label = 'SYSTEM:close_stale_visits'`)"],
    INTEGRATION: [TBC, "ระบบภายนอกผ่าน Edge Function"],
  } },
};

/* =====================================================================================
   ชุดค่าแบบ text + CHECK (CANONICAL ข้อ 19.1 ข้อ 1) — ไม่ใช่ ENUM
   generator ตรวจว่าทุกค่าปรากฏใน CHECK ของคอลัมน์จริง ถ้าไม่ตรงจะขึ้น ⚠ และเตือนทาง stderr
   ================================================================================== */
const TEXT_SETS = [
  { col: "crm.customers.lifecycle_stage", ref: "ข้อ 3.4", note: "คำนวณจากข้อเท็จจริง · ห้ามแก้ด้วยมือ · ปรับโดย `app.refresh_customer_lifecycle`", values: {
    REPEAT:      ["ลูกค้าซื้อซ้ำ", "เหตุการณ์การซื้อตลอดอายุ ≥ 2 (ตรวจลำดับที่ 1)"],
    CUSTOMER:    ["ลูกค้าปัจจุบัน", "เหตุการณ์การซื้อ = 1"],
    OPPORTUNITY: ["มีโอกาสซื้อ", "ยังไม่เคยซื้อ · มี opportunity ที่ยังไม่ปิด"],
    LEAD:        ["สนใจซื้อ", "ยังไม่เคยซื้อ · มี lead ที่ยังไม่ปิด"],
    LOST:        ["ไม่สำเร็จ", "ยังไม่เคยซื้อ · ไม่มีรายการเปิด · มี lead/opportunity ที่ LOST ≥ 1"],
    IDENTIFIED:  ["รู้จักแล้ว", "นอกเหนือจากข้างบน (ตรวจลำดับที่ 6)"],
  } },
  { col: "crm.customers.created_via", ref: "ข้อ 6.3", note: "CANONICAL ไม่ได้พิมพ์ป้ายไทยของค่าเหล่านี้", values: {
    QUICK_CAPTURE:  [TBC, "สร้างผ่าน `api.quick_capture` (ทางเดียวตามข้อ 6.2)"],
    IMPORT:         [TBC, "ข้อมูลนำเข้าจากระบบเดิม · เป็นที่มาของ `MISSING_PHONE` (ข้อ 6.2 · 13.12)"],
    MERGE_SURVIVOR: [TBC, "ลูกค้าที่เหลือรอดจากการรวม (ข้อ 6.7)"],
  } },
  { col: "crm.customers.customer_type", ref: "ข้อ 5.8", note: "CANONICAL ไม่ได้พิมพ์ป้ายไทยของค่าเหล่านี้ · ไม่แสดงบน Quick Capture ไม่ใช้ใน KPI", values: {
    INDIVIDUAL: [TBC, "ค่าเริ่มต้น"],
    BUSINESS:   [TBC, ""],
  } },
  { col: "core.branches.branch_type", ref: "ข้อ 2", note: "CANONICAL ไม่ได้พิมพ์ป้ายไทยของค่าเหล่านี้", values: {
    store:       [TBC, "สาขาหน้าร้าน `JP1` `JP2` `JP3` `JP4`"],
    online_team: [TBC, "ทีมออนไลน์ส่วนกลาง `JPON` **[รอยืนยัน Q3]** · มีเพื่อให้รายการออนไลน์มี `branch_id` เสมอ"],
  } },
  { col: "crm.data_subject_requests.verification_method", ref: "ข้อ 4.8 · 10.4", note: "**ห้ามเก็บสำเนาบัตร**", values: {
    IN_PERSON_ID_SIGHTED:      ["เห็นบัตรต่อหน้า", ""],
    OTP_TO_REGISTERED_CONTACT: ["รหัส OTP ไปช่องทางที่ลงทะเบียน", ""],
    OTHER:                     ["อื่น ๆ", ""],
  } },
  { col: "core.role_grant_requests.status", ref: "ข้อ 4.8 (`core.role_grant_status`)", values: {
    REQUESTED: ["รออนุมัติ", "แจ้ง `ROLE_GRANT_APPROVAL_REQUIRED` ถึง EXECUTIVE ทุกคน (ยกเว้นผู้รับ)"],
    APPROVED:  ["อนุมัติแล้ว", "`api.decide_role_grant` (aal2)"],
    REJECTED:  ["ไม่อนุมัติ", ""],
  } },
  { col: "core.role_grant_requests.request_type", ref: "ข้อ 4.8 (`core.role_grant_status`) · 7.2", values: {
    GRANT:  ["มอบ", ""],
    REVOKE: ["ถอน", "การถอน EXECUTIVE / BUSINESS_ADMIN / SYSTEM_ADMIN ใช้เส้นทางเดียวกับการมอบ"],
  } },
];

/* ── หน้าที่ของ schema ตาม CANONICAL ข้อ 1.1 ─────────────────────────────────────── */
const SCHEMA_INFO = {
  core:       { what: "องค์กร · สาขา · ทีม · พนักงาน · บทบาท · สิทธิ์ · อุปกรณ์", api: "✓", grant: "SELECT ตาม RLS (คอลัมน์อ่อนไหวผ่าน column grant)" },
  ref:        { what: "Master Data (lookup) · ค่ากลาง ไม่มี `organization_id`", api: "✓", grant: "SELECT ตาม RLS · เขียนด้วย `master_data.manage` + aal2" },
  crm:        { what: "ลูกค้า · กิจกรรม · lead · opportunity · quotation · task · transaction ref · notification", api: "✓", grant: "SELECT/INSERT/UPDATE ตามตาราง + column grant (ข้อ 9.4)" },
  app:        { what: "helper ตรวจสิทธิ์ · trigger · งานตามเวลา · settings · running numbers", api: "✗", grant: "EXECUTE เฉพาะ helper ข้อ 9.3 (policy ต้องเรียกได้) · ตารางไม่มี GRANT" },
  analytics:  { what: "view ภายในสำหรับคำนวณ KPI (ใช้ใน RPC เท่านั้น)", api: "✗", grant: "ไม่มี" },
  audit:      { what: "audit_logs · access_logs · login_events · export_requests · integration_logs", api: "✗", grant: "ไม่มี (อ่านผ่าน `api.search_audit` · `api.get_entity_history`)" },
  api:        { what: "RPC ที่หน้าจอเรียก (ข้อ 9.6)", api: "✓", grant: "EXECUTE รายฟังก์ชัน (`svc_*` ให้ `service_role` เท่านั้น)" },
  restricted: { what: "เอกสารสำคัญ (ปิดใช้งานใน V1)", api: "✗", grant: "ไม่มี" },
};

/* =====================================================================================
   โหลด PGlite (วิธีเดียวกับ tools/db/run.mjs)
   ================================================================================== */
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
  console.error("ไม่พบ @electric-sql/pglite — รัน `npm install` หรือตั้ง PGLITE_DIR");
  process.exit(2);
}

/* =====================================================================================
   ตัวช่วยจัดรูป Markdown
   ================================================================================== */
const cell = (s) => (s === null || s === undefined || s === "" ? "–" : String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>"));
const code = (s) => (s === null || s === undefined || s === "" ? "–" : "`" + String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ") + "`");
const sqlBlock = (s) => "```sql\n" + String(s).trimEnd() + "\n```";
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/* =====================================================================================
   หลัก
   ================================================================================== */
const warnings = [];
function warn(msg) { warnings.push(msg); console.error("⚠ " + msg); }

async function main() {
  const { PGlite, pg_trgm } = await loadPGlite();
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec("SET TIME ZONE 'UTC'; CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;");
  const ver = (await db.query("SELECT current_setting('server_version_num')::int AS v")).rows[0].v;
  if (Math.floor(ver / 10000) !== 17) {
    console.error(`PGlite ต้องเป็น PostgreSQL 17 (ได้ ${ver}) — ใช้ @electric-sql/pglite 0.4.1`);
    process.exit(2);
  }
  const serverVersion = (await db.query("SELECT current_setting('server_version') AS v")).rows[0].v;

  await db.exec(readFileSync(join(ROOT, "tools/db/supabase-shim.sql"), "utf8"));
  const migrations = readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql")).sort();
  const applied = [];
  for (const f of migrations) {
    if (f.endsWith("_cron.sql")) continue;       // มีเฉพาะบน Supabase (pg_cron)
    await db.exec(readFileSync(join(ROOT, "supabase/migrations", f), "utf8"));
    applied.push(f);
  }
  const skipped = migrations.filter((f) => f.endsWith("_cron.sql"));

  const q = async (sql) => (await db.query(sql)).rows;
  const inSchemas = "(" + SCHEMAS.map((s) => `'${s}'`).join(",") + ")";

  /* ── เก็บ catalog ทั้งหมดเป็นก้อนเดียว (query ละครั้ง แล้วจัดกลุ่มใน JS) ───────── */

  const relations = await q(`
    SELECT c.oid, n.nspname AS schema, c.relname AS name, c.relkind AS kind,
           c.relrowsecurity AS rls, c.relforcerowsecurity AS rls_force,
           c.reloptions::text AS reloptions,
           obj_description(c.oid, 'pg_class') AS comment,
           CASE WHEN c.relkind = 'v' THEN pg_get_viewdef(c.oid, true) END AS viewdef
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r','v','m','p') AND n.nspname IN ${inSchemas}
    ORDER BY n.nspname, c.relname`);

  const columns = await q(`
    SELECT a.attrelid AS oid, a.attnum, a.attname AS name,
           format_type(a.atttypid, a.atttypmod) AS type,
           a.attnotnull AS notnull, a.attgenerated AS generated, a.attidentity AS identity,
           pg_get_expr(d.adbin, d.adrelid) AS default_expr,
           col_description(a.attrelid, a.attnum) AS comment
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE n.nspname IN ${inSchemas} AND c.relkind IN ('r','v','m','p')
      AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attrelid, a.attnum`);

  const constraints = await q(`
    SELECT con.conrelid AS oid, con.conname AS name, con.contype AS type,
           pg_get_constraintdef(con.oid) AS def,
           con.conkey, con.confrelid,
           CASE WHEN con.confrelid <> 0
                THEN (SELECT fn.nspname || '.' || fc.relname
                        FROM pg_class fc JOIN pg_namespace fn ON fn.oid = fc.relnamespace
                       WHERE fc.oid = con.confrelid) END AS ref_table,
           (SELECT array_agg(fa.attname ORDER BY x.ord)
              FROM unnest(con.confkey) WITH ORDINALITY AS x(attnum, ord)
              JOIN pg_attribute fa ON fa.attrelid = con.confrelid AND fa.attnum = x.attnum) AS ref_cols
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ${inSchemas}
    ORDER BY con.conrelid, con.contype, con.conname`);

  const indexes = await q(`
    SELECT c.oid, i.indexname AS name, i.indexdef AS def
    FROM pg_indexes i
    JOIN pg_class c ON c.relname = i.tablename AND c.relkind IN ('r','p','m')
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = i.schemaname
    WHERE i.schemaname IN ${inSchemas}
    ORDER BY c.oid, i.indexname`);

  const triggers = await q(`
    SELECT t.tgrelid AS oid, t.tgname AS name, t.tgtype,
           pg_get_triggerdef(t.oid) AS def,
           pn.nspname || '.' || p.proname AS fn
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace pn ON pn.oid = p.pronamespace
    WHERE NOT t.tgisinternal AND n.nspname IN ${inSchemas}
    ORDER BY t.tgrelid, t.tgname`);

  const policies = await q(`
    SELECT pol.polrelid AS oid, pol.polname AS name, pol.polcmd AS cmd, pol.polpermissive AS permissive,
           (SELECT string_agg(r.rolname, ', ' ORDER BY r.rolname) FROM pg_roles r WHERE r.oid = ANY(pol.polroles)) AS roles,
           pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
           pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expr
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ${inSchemas}
    ORDER BY pol.polrelid, pol.polname`);

  const relAcl = await q(`
    SELECT c.oid, (aclexplode(c.relacl)).grantee::regrole::text AS grantee,
           (aclexplode(c.relacl)).privilege_type AS priv
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ${inSchemas} AND c.relacl IS NOT NULL AND c.relkind IN ('r','v','m','p')`);

  const colAcl = await q(`
    SELECT a.attrelid AS oid, a.attname AS col,
           (aclexplode(a.attacl)).grantee::regrole::text AS grantee,
           (aclexplode(a.attacl)).privilege_type AS priv
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ${inSchemas} AND a.attacl IS NOT NULL AND a.attnum > 0 AND NOT a.attisdropped`);

  const functions = await q(`
    SELECT p.oid, n.nspname AS schema, p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args,
           pg_get_function_result(p.oid) AS result,
           p.prosecdef AS definer, p.provolatile AS volatility, p.proconfig::text AS config,
           obj_description(p.oid, 'pg_proc') AS comment,
           (SELECT string_agg(DISTINCT g.grantee, ', ')
              FROM (SELECT (aclexplode(p.proacl)).grantee::regrole::text AS grantee,
                           (aclexplode(p.proacl)).privilege_type AS priv) g
             WHERE g.priv = 'EXECUTE' AND g.grantee NOT IN ('web_user','postgres','-')) AS exec_roles,
           p.proacl IS NULL AS acl_default
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ${inSchemas}
    ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)`);

  const enums = await q(`
    SELECT n.nspname || '.' || t.typname AS name,
           array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE n.nspname IN ${inSchemas}
    GROUP BY 1 ORDER BY 1`);

  const schemaComments = Object.fromEntries((await q(`
    SELECT n.nspname, obj_description(n.oid, 'pg_namespace') AS c
    FROM pg_namespace n WHERE n.nspname IN ${inSchemas}`)).map((r) => [r.nspname, r.c]));

  await db.close();

  /* ── จัดกลุ่มตาม oid ────────────────────────────────────────────────────────── */
  const group = (rows, key = "oid") => {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r[key])) map.set(r[key], []);
      map.get(r[key]).push(r);
    }
    return map;
  };
  const colsBy = group(columns), consBy = group(constraints), idxBy = group(indexes);
  const trgBy = group(triggers), polBy = group(policies), relAclBy = group(relAcl), colAclBy = group(colAcl);

  /* FK รายคอลัมน์เดียว → ใช้เติมคอลัมน์ "FK →" */
  const fkOfColumn = new Map();           // `${oid}:${attnum}` → "schema.table(col)"
  for (const c of constraints) {
    if (c.type !== "f" || !c.conkey || c.conkey.length !== 1) continue;
    fkOfColumn.set(`${c.oid}:${c.conkey[0]}`, `${c.ref_table}(${(c.ref_cols || []).join(", ")})`);
  }

  /* ── ตัวช่วยอ่าน ACL ──────────────────────────────────────────────────────── */
  const PRIV_ORDER = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"];
  function grantsOf(oid) {
    const rows = (relAclBy.get(oid) || []).filter((r) => !OWNER_ROLES.has(r.grantee));
    const byRole = new Map();
    for (const r of rows) {
      if (!byRole.has(r.grantee)) byRole.set(r.grantee, new Set());
      byRole.get(r.grantee).add(r.priv);
    }
    return [...byRole.entries()]
      .sort((a, b) => {
        const ia = ROLE_ORDER.indexOf(a[0]), ib = ROLE_ORDER.indexOf(b[0]);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || byName(a[0], b[0]);
      })
      .map(([role, privs]) => [role, PRIV_ORDER.filter((p) => privs.has(p)).concat([...privs].filter((p) => !PRIV_ORDER.includes(p)).sort())]);
  }
  function colGrantsOf(oid) {
    const rows = (colAclBy.get(oid) || []).filter((r) => !OWNER_ROLES.has(r.grantee));
    const byKey = new Map();               // `${role}|${priv}` → [cols]
    for (const r of rows) {
      const k = `${r.grantee}|${r.priv}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(r.col);
    }
    return [...byKey.entries()]
      .map(([k, cols]) => { const [role, priv] = k.split("|"); return { role, priv, cols: cols.sort(byName) }; })
      .sort((a, b) => byName(a.role, b.role) || PRIV_ORDER.indexOf(a.priv) - PRIV_ORDER.indexOf(b.priv));
  }

  /* ── ตัวช่วยอ่าน trigger ──────────────────────────────────────────────────── */
  function triggerParts(t) {
    const d = t.def;
    const timing = (t.tgtype & 2) ? "BEFORE" : (t.tgtype & 64) ? "INSTEAD OF" : "AFTER";
    const ev = [];
    if (t.tgtype & 4) ev.push("INSERT");
    if (t.tgtype & 8) ev.push("DELETE");
    if (t.tgtype & 16) {
      const m = d.match(/UPDATE OF ([^\s]+(?:, [^\s]+)*?)(?= ON | OR )/);
      ev.push(m ? `UPDATE OF ${m[1]}` : "UPDATE");
    }
    if (t.tgtype & 32) ev.push("TRUNCATE");
    const level = (t.tgtype & 1) ? "ROW" : "STATEMENT";
    const when = (d.match(/ WHEN \((.*)\) EXECUTE /s) || [])[1] || "";
    const fnCall = (d.match(/EXECUTE FUNCTION (.*)$/s) || [])[1] || `${t.fn}()`;
    return { timing, events: ev.join(" · "), level, when, fnCall };
  }

  const POLCMD = { r: "SELECT", a: "INSERT", w: "UPDATE", d: "DELETE", "*": "ALL" };
  const VOL = { i: "IMMUTABLE", s: "STABLE", v: "VOLATILE" };

  /* ── ตรวจชุดค่า text + CHECK ว่าตรงกับฐานข้อมูล ──────────────────────────── */
  const relByFullName = new Map(relations.map((r) => [`${r.schema}.${r.name}`, r]));
  for (const ts of TEXT_SETS) {
    const parts = ts.col.split(".");
    const tbl = parts.slice(0, 2).join("."), colName = parts[2];
    const rel = relByFullName.get(tbl);
    if (!rel) { ts.warn = "ไม่พบตาราง"; warn(`TEXT_SETS: ไม่พบตาราง ${tbl}`); continue; }
    const col = (colsBy.get(rel.oid) || []).find((c) => c.name === colName);
    if (!col) { ts.warn = "ไม่พบคอลัมน์"; warn(`TEXT_SETS: ไม่พบคอลัมน์ ${ts.col}`); continue; }
    const checks = (consBy.get(rel.oid) || []).filter((c) => c.type === "c" && c.def.includes(colName));
    const text = checks.map((c) => c.def).join(" ");
    const missing = Object.keys(ts.values).filter((v) => !text.includes(`'${v}'`));
    if (missing.length) { ts.warn = "ค่าไม่พบใน CHECK: " + missing.join(", "); warn(`TEXT_SETS ${ts.col}: ค่าไม่พบใน CHECK → ${missing.join(", ")}`); }
    ts.checks = checks.map((c) => c.name);
  }
  /* ── ตรวจว่า ENUM ทุกตัวในฐานข้อมูลมีป้ายไทยครบ ─────────────────────────── */
  for (const e of enums) {
    const map = ENUM_LABELS[e.name];
    if (!map) { warn(`ENUM_LABELS: ไม่มีป้ายไทยของ ${e.name}`); continue; }
    const missing = e.values.filter((v) => !(v in map.values));
    const extra = Object.keys(map.values).filter((v) => !e.values.includes(v));
    if (missing.length) warn(`ENUM_LABELS ${e.name}: ขาดค่า ${missing.join(", ")}`);
    if (extra.length) warn(`ENUM_LABELS ${e.name}: มีค่าเกิน ${extra.join(", ")}`);
  }

  /* =====================================================================================
     เขียน Markdown
     ================================================================================== */
  const out = [];
  const w = (...lines) => out.push(...lines);

  const tables = relations.filter((r) => r.kind === "r" || r.kind === "p");
  const views = relations.filter((r) => r.kind === "v" || r.kind === "m");
  const piiCols = [];

  /* ── หัวเอกสาร ────────────────────────────────────────────────────────────── */
  w(
    "# Data Dictionary — JAUN CRM · Customer 360",
    "",
    "> เอกสารชุดที่ **07** ตาม A45 · **ฉบับ Phase 0**",
    "> **ไฟล์นี้สร้างอัตโนมัติ — ห้ามแก้ด้วยมือ** · สร้างใหม่ด้วย `npm run db:dictionary` (`tools/db/gen-data-dictionary.mjs`)",
    `> แหล่งจริงคือ **ฐานข้อมูลที่ได้จาก \`supabase/migrations/\`** (${applied.length} ไฟล์: \`${applied[0]}\` … \`${applied[applied.length - 1]}\`) รันบน PGlite (PostgreSQL ${serverVersion}) · **ไม่โหลด seed**`,
    `> ข้าม \`*_cron.sql\` (${skipped.length} ไฟล์: ${skipped.map((f) => "`" + f + "`").join(" · ") || "–"}) เพราะ \`cron.schedule\` มีเฉพาะบน Supabase (CANONICAL ข้อ 9.6)`,
    "> ค่าทุกค่าอ้างอิง `docs/00-brief/CANONICAL.md` **v2.2** · ถ้าเอกสารนี้ขัดกับ CANONICAL **CANONICAL ชนะ**",
    "> เอกสารคู่กัน: `docs/03-data/er-diagram.md` (ความสัมพันธ์) · `docs/03-data/schema-notes.md` (ข้อตกลงและเหตุผล) · `docs/04-security/rls-spec.md` (ตรรกะของ policy) · `docs/07-api/api-spec.md` (สัญญาของ RPC)",
    "",
    "## 0. วิธีอ่านเอกสารนี้",
    "",
    "| สิ่งที่เห็น | ความหมาย |",
    "|---|---|",
    "| `pii` ในคอลัมน์ | COMMENT ของคอลัมน์ขึ้นต้นด้วย `[pii]` (CANONICAL ข้อ 19.1 ข้อ 3) · audit บันทึกเป็นค่าปิดบัง + `sha256` และ `app.anonymize_customer` ล้างคอลัมน์นี้ (ข้อ 9.5 · 10.4) |",
    "| คำอธิบายคอลัมน์/ตาราง | `COMMENT` ในฐานข้อมูล (ตัดคำนำหน้า `[pii]` ออกแล้ว) · เขียนโดย migration |",
    "| **RLS** | `เปิด` = `relrowsecurity` · `FORCE` = `relforcerowsecurity` (ข้อ 9.4 กติกา 1: FORCE ไม่ใช่ชั้นป้องกันจริงเพราะ owner = `postgres`) · **บังคับเปิดเฉพาะ `core` `ref` `crm`** — `app` `audit` `analytics` คุมด้วย GRANT (ข้อ 9.4 กติกา 6 · 19.1 ข้อ 13) |",
    "| ตาราง GRANT | เฉพาะสิทธิ์ที่มอบให้ role ของระบบ (`anon` · `authenticated` · `service_role` · `supabase_auth_admin` · `audit_retention`) · **ตัดสิทธิ์ของ owner ออก** (บน Supabase owner = `postgres` · บน PGlite = `web_user`) |",
    "| ตารางที่ไม่มีบรรทัด GRANT | ไม่มี role ใดเข้าถึงได้เลย — เขียน/อ่านผ่าน trigger หรือ RPC `SECURITY DEFINER` เท่านั้น |",
    "| `ป้ายไทย` ของ ENUM | มาจาก CANONICAL ข้อ 4 (ฐานข้อมูล**ไม่เก็บ**ป้ายไทยของ ENUM ตามข้อ 4) · ค่าที่ CANONICAL ไม่ได้พิมพ์ป้ายไทยไว้เขียน **รอยืนยัน** ตามกฎของ CANONICAL |",
    "| **[รอยืนยัน]** | ค่าที่ CANONICAL ติดป้ายรอยืนยัน |",
    "| ⚠ | generator ตรวจแล้วไม่ตรงกับฐานข้อมูล (ดูข้อ 8) |",
    "",
    "ชนิดข้อมูลและ default พิมพ์ตามที่ `format_type()` / `pg_get_expr()` คืนมา จึงเป็นข้อความเดียวกับที่ `psql \\d` แสดง",
    "",
  );

  /* ── 1. สรุปภาพรวม ───────────────────────────────────────────────────────── */
  w("## 1. สรุปภาพรวม", "");
  w("| schema | เก็บอะไร (ข้อ 1.1) | Data API | ตาราง | view | ฟังก์ชัน | ENUM | เปิด RLS |", "|---|---|:--:|---:|---:|---:|---:|---|");
  for (const s of SCHEMAS) {
    const t = tables.filter((r) => r.schema === s);
    const v = views.filter((r) => r.schema === s);
    const f = functions.filter((r) => r.schema === s);
    const e = enums.filter((r) => r.name.startsWith(s + "."));
    const rlsOn = t.filter((r) => r.rls).length;
    const info = SCHEMA_INFO[s] || { what: "", api: "" };
    w(`| \`${s}\` | ${cell(info.what)} | ${info.api} | ${t.length} | ${v.length} | ${f.length} | ${e.length} | ${t.length ? `${rlsOn} / ${t.length}` : "–"} |`);
  }
  w("", `รวม **${tables.length} ตาราง** · **${views.length} view** · **${functions.length} ฟังก์ชัน** · **${enums.length} ENUM** · ` +
       `**${columns.length} คอลัมน์** · **${policies.length} policy** · **${indexes.length} index** · **${triggers.length} trigger**`, "");
  w("GRANT ระดับ schema (ข้อ 1.1): `api` `crm` `core` `ref` → `authenticated`, `service_role` · `app` → `authenticated` · `anon` ไม่มี GRANT ใดในทุก schema ของระบบ", "");
  for (const s of SCHEMAS) if (schemaComments[s]) w(`- \`${s}\` — ${cell(schemaComments[s])}`);
  w("");

  /* ── 2. ENUM ───────────────────────────────────────────────────────────────── */
  w("## 2. ENUM", "",
    "ENUM ใช้กับชุดค่าที่ระบบใช้ตัดสินใจ อยู่ใน schema ของตารางที่ใช้ และอ้างชื่อเต็มเสมอ · **เพิ่มค่า = migration ไฟล์เดี่ยวที่มีแค่ `ALTER TYPE … ADD VALUE`** (CANONICAL ข้อ 4) · ลำดับที่แสดงคือ `enumsortorder` จริงในฐานข้อมูล",
    "");
  for (const e of enums) {
    const map = ENUM_LABELS[e.name] || { ref: "", values: {} };
    w(`### \`${e.name}\``, "");
    w(`ใช้ที่: ${usageOfType(e.name) || "–"}${map.ref ? ` · ป้ายไทยจาก CANONICAL ${map.ref}` : ""}`, "");
    if (map.note) w(`> ${map.note}`, "");
    w("| # | ค่า | ป้ายไทย | ความหมาย |", "|---:|---|---|---|");
    e.values.forEach((v, i) => {
      const [label, note] = map.values[v] || [TBC, ""];
      w(`| ${i + 1} | \`${v}\` | ${cell(label)} | ${cell(note)} |`);
    });
    w("");
  }

  /* ── 3. ชุดค่าแบบ text + CHECK ───────────────────────────────────────────── */
  w("## 3. ชุดค่าแบบ `text` + CHECK (ไม่ใช่ ENUM)", "",
    "CANONICAL ข้อ 19.1 ข้อ 1: ชุดค่าปิดที่ไม่อยู่ในข้อ 4.8 ใช้ `text` + CHECK ชื่อคงที่ · generator ตรวจว่าทุกค่าที่พิมพ์ในตารางนี้ปรากฏอยู่ใน CHECK จริง",
    "");
  for (const ts of TEXT_SETS) {
    w(`### \`${ts.col}\`${ts.warn ? " ⚠" : ""}`, "");
    w(`CHECK: ${(ts.checks || []).map((c) => "`" + c + "`").join(" · ") || "–"} · CANONICAL ${ts.ref}${ts.warn ? ` · ⚠ ${ts.warn}` : ""}`, "");
    if (ts.note) w(`> ${ts.note}`, "");
    w("| ค่า | ป้ายไทย | ความหมาย |", "|---|---|---|");
    for (const [v, [label, note]] of Object.entries(ts.values)) w(`| \`${v}\` | ${cell(label)} | ${cell(note)} |`);
    w("");
  }

  /* ── 4. ตารางรายสคีมา ────────────────────────────────────────────────────── */
  w("## 4. ตาราง", "");
  let sec = 0;
  for (const s of SCHEMAS) {
    const list = tables.filter((r) => r.schema === s);
    if (!list.length) continue;
    sec++;
    w(`### 4.${sec} schema \`${s}\` — ${list.length} ตาราง`, "");
    if (schemaComments[s]) w(`> ${cell(schemaComments[s])}`, "");
    w(list.map((r) => `[\`${s}.${r.name}\`](#${anchor(s + "-" + r.name)})`).join(" · "), "");
    for (const rel of list) w(...renderTable(rel));
  }

  /* ── 5. View ──────────────────────────────────────────────────────────────── */
  w("## 5. View", "",
    "CANONICAL ข้อ 9.4 กติกา 4: **ทุก view ในทุก schema สร้างด้วย `WITH (security_invoker = true)`** · ห้าม materialized view ใน schema ที่เปิด API · CI ตรวจเฉพาะ schema ของโครงการ (ข้อ 19.2 ข้อ 8)",
    "");
  for (const s of SCHEMAS) {
    const list = views.filter((r) => r.schema === s);
    if (!list.length) continue;
    w(`### 5.${s} — \`${s}\``, "");
    for (const v of list) {
      const invoker = (v.reloptions || "").includes("security_invoker=true");
      w(`#### \`${s}.${v.name}\``, "");
      if (v.comment) w(cell(v.comment), "");
      w(`\`security_invoker\`: ${invoker ? "**true** ✓" : "**false** ⚠ (ขัดข้อ 9.4 กติกา 4)"} · reloptions: ${code(v.reloptions)}`, "");
      if (!invoker) warn(`view ${s}.${v.name} ไม่ได้ตั้ง security_invoker = true`);
      const g = grantsOf(v.oid);
      w(`GRANT: ${g.length ? g.map(([r, p]) => `\`${r}\` = ${p.join(", ")}`).join(" · ") : "**ไม่มี** (อ่านใน RPC `SECURITY DEFINER` เท่านั้น)"}`, "");
      w("| คอลัมน์ | ชนิด | คำอธิบาย |", "|---|---|---|");
      for (const c of colsBy.get(v.oid) || []) {
        const { pii, text } = splitPii(c.comment);
        if (pii) piiCols.push(`${s}.${v.name}.${c.name}`);
        w(`| \`${c.name}\` | ${code(c.type)} | ${pii ? "**[pii]** " : ""}${cell(text)} |`);
      }
      w("", "<details><summary>นิยาม</summary>", "", sqlBlock(v.viewdef), "", "</details>", "");
    }
  }

  /* ── 6. ฟังก์ชัน ──────────────────────────────────────────────────────────── */
  w("## 6. ฟังก์ชัน", "",
    "CANONICAL ข้อ 9.6: ทุกฟังก์ชัน owner = `postgres` · `SET search_path = ''` · ตรวจสิทธิ์บรรทัดแรก · " +
    "ข้อ 19.1 ข้อ 2: `ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` ทำทั้งฐาน **ทุกฟังก์ชันที่ถูกเรียกตรงจึงต้อง `GRANT EXECUTE` เอง**",
    "",
    "คอลัมน์ `search_path` แสดง `proconfig` จริงของฟังก์ชัน · คอลัมน์ `GRANT EXECUTE` ตัด owner ออกแล้ว (ว่าง = ไม่มี role ใดเรียกได้ เรียกได้เฉพาะจากภายในฟังก์ชัน/trigger ของระบบ)",
    "");
  for (const s of SCHEMAS) {
    const list = functions.filter((r) => r.schema === s);
    if (!list.length) continue;
    w(`### 6.${s} — \`${s}\` (${list.length} ฟังก์ชัน)`, "");
    w("| ฟังก์ชัน | คืนค่า | security | volatility | search_path | GRANT EXECUTE | คำอธิบาย |", "|---|---|---|---|---|---|---|");
    for (const f of list) {
      const sp = (f.config || "").match(/search_path=([^,}"]*)/);
      const spTxt = f.config ? (sp ? (sp[1] === "" ? "`''`" : "`" + sp[1] + "`") : code(f.config)) : "⚠ ไม่ได้ตั้ง";
      if (!f.config) warn(`ฟังก์ชัน ${s}.${f.name} ไม่ได้ตั้ง search_path`);
      w(`| \`${f.name}(${f.args})\` | ${code(f.result)} | ${f.definer ? "**DEFINER**" : "INVOKER"} | ${VOL[f.volatility] || f.volatility} | ${spTxt} | ${f.exec_roles ? f.exec_roles.split(", ").sort().map((r) => "`" + r + "`").join(" · ") : "–"} | ${cell(stripPii(f.comment))} |`);
    }
    w("");
  }

  /* ── 7. ดัชนีคอลัมน์ [pii] ───────────────────────────────────────────────── */
  w("## 7. ดัชนีคอลัมน์ `[pii]`", "",
    `พบ **${piiCols.length} คอลัมน์** ที่ติดป้าย \`[pii]\` · audit เก็บเป็น \`{"masked": …, "sha256": …}\` (ข้อ 9.5) · \`app.anonymize_customer\` ล้างค่าเหล่านี้ (ข้อ 10.4) · ห้ามส่งออกนอกกติกาข้อ 8.2`,
    "");
  const piiByTable = new Map();
  for (const p of piiCols) {
    const t = p.split(".").slice(0, 2).join(".");
    if (!piiByTable.has(t)) piiByTable.set(t, []);
    piiByTable.get(t).push(p.split(".")[2]);
  }
  w("| ตาราง | คอลัมน์ |", "|---|---|");
  for (const [t, cs] of [...piiByTable.entries()].sort((a, b) => byName(a[0], b[0])))
    w(`| \`${t}\` | ${cs.map((c) => "`" + c + "`").join(" · ")} |`);
  w("");

  /* ── 8. ผลการตรวจของ generator ───────────────────────────────────────────── */
  w("## 8. ผลการตรวจของ generator", "");
  if (warnings.length) {
    w("| # | ข้อสังเกต |", "|---:|---|");
    warnings.forEach((m, i) => w(`| ${i + 1} | ⚠ ${cell(m)} |`));
  } else {
    w("ไม่พบข้อขัดแย้ง — ทุก ENUM มีป้ายไทยครบตาม CANONICAL ข้อ 4 · ทุกค่าในข้อ 3 ปรากฏใน CHECK จริง · ทุก view ตั้ง `security_invoker = true` · ทุกฟังก์ชันตั้ง `search_path`");
  }
  w("");
  w("---", "",
    "สร้างโดย `tools/db/gen-data-dictionary.mjs` · ผลลัพธ์ deterministic (ไม่มีเวลาที่รันในไฟล์) จึงใช้ `git diff` ดูผลของ migration ได้โดยตรง",
    "");

  /* =====================================================================================
     ตัวช่วยที่ต้องใช้ relations/columns ที่ดึงมาแล้ว
     ================================================================================== */
  function anchor(s) { return s.toLowerCase().replace(/[^a-z0-9ก-๙_-]+/g, ""); }

  function splitPii(comment) {
    if (!comment) return { pii: false, text: "" };
    const m = comment.match(/^\s*\[pii\]\s*/);
    return m ? { pii: true, text: comment.slice(m[0].length) } : { pii: false, text: comment };
  }
  function stripPii(c) { return splitPii(c).text; }

  function usageOfType(typeName) {
    const hits = [];
    for (const c of columns) {
      if (c.type !== typeName && c.type !== typeName + "[]") continue;
      const rel = relations.find((r) => r.oid === c.oid);
      if (rel) hits.push(`\`${rel.schema}.${rel.name}.${c.name}\``);
    }
    return hits.sort(byName).join(" · ");
  }

  function renderTable(rel) {
    const o = [];
    const full = `${rel.schema}.${rel.name}`;
    o.push(`#### \`${full}\``, "");
    const { text: cmt } = splitPii(rel.comment);
    o.push(cmt ? cell(cmt) : "_(ไม่มี COMMENT)_", "");

    /* RLS + GRANT */
    const g = grantsOf(rel.oid);
    const cg = colGrantsOf(rel.oid);
    /* CANONICAL ข้อ 9.4 กติกา 1 บังคับ RLS เฉพาะ core · ref · crm ·
       schema ที่เหลือคุมด้วย GRANT (ข้อ 9.4 กติกา 6 · 19.1 ข้อ 13) จึงไม่ถือว่าผิดเมื่อ RLS ปิด */
    const rlsRequired = ["core", "ref", "crm"].includes(rel.schema);
    const rlsTxt = rel.rls ? "เปิด" : rlsRequired ? "**ปิด** ⚠" : "ปิด (ไม่ต้องเปิดตามข้อ 9.4 กติกา 1 — คุมด้วย GRANT)";
    o.push(`**RLS:** ${rlsTxt}${rel.rls_force ? " · FORCE" : ""} · ` +
           `**policy:** ${(polBy.get(rel.oid) || []).length} · **index:** ${(idxBy.get(rel.oid) || []).length} · **trigger:** ${(trgBy.get(rel.oid) || []).length}`, "");
    if (!rel.rls && rlsRequired) warn(`ตาราง ${full} ไม่ได้เปิด RLS ทั้งที่อยู่ใน core/ref/crm (ข้อ 9.4 กติกา 1)`);
    o.push(`**GRANT (ทั้งตาราง):** ${g.length ? g.map(([r, p]) => `\`${r}\` = ${p.join(", ")}`).join(" · ") : "**ไม่มี** — เขียน/อ่านผ่าน trigger หรือ RPC `SECURITY DEFINER` เท่านั้น"}`, "");
    if (cg.length) {
      o.push("", "**GRANT ระดับคอลัมน์:**", "", "| role | สิทธิ์ | คอลัมน์ |", "|---|---|---|");
      for (const x of cg) o.push(`| \`${x.role}\` | ${x.priv} | ${x.cols.map((c) => "`" + c + "`").join(" · ")} |`);
    }
    o.push("");

    /* คอลัมน์ */
    o.push("| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |", "|---:|---|---|:--:|---|---|:--:|---|");
    for (const c of colsBy.get(rel.oid) || []) {
      const { pii, text } = splitPii(c.comment);
      if (pii) piiCols.push(`${full}.${c.name}`);
      let dflt = "–";
      if (c.generated === "s") dflt = `GENERATED ALWAYS AS (${c.default_expr}) STORED`;
      else if (c.identity) dflt = `GENERATED ${c.identity === "a" ? "ALWAYS" : "BY DEFAULT"} AS IDENTITY`;
      else if (c.default_expr) dflt = c.default_expr;
      const fk = fkOfColumn.get(`${rel.oid}:${c.attnum}`);
      o.push(`| ${c.attnum} | \`${c.name}\` | ${code(c.type)} | ${c.notnull ? "NOT NULL" : "NULL"} | ${dflt === "–" ? "–" : code(dflt)} | ${fk ? code(fk) : "–"} | ${pii ? "**pii**" : ""} | ${cell(text)} |`);
    }
    o.push("");

    /* ข้อจำกัด */
    const cons = consBy.get(rel.oid) || [];
    const byType = (t) => cons.filter((c) => c.type === t).sort((a, b) => byName(a.name, b.name));
    const keys = [...byType("p"), ...byType("u"), ...byType("x")];
    if (keys.length) {
      o.push("**คีย์:**", "", "| ชื่อ | นิยาม |", "|---|---|");
      for (const c of keys) o.push(`| \`${c.name}\` | ${code(c.def)} |`);
      o.push("");
    }
    const checks = byType("c");
    if (checks.length) {
      o.push("**CHECK:**", "", "| ชื่อ | นิยาม |", "|---|---|");
      for (const c of checks) o.push(`| \`${c.name}\` | ${code(c.def)} |`);
      o.push("");
    }
    const fks = byType("f");
    if (fks.length) {
      o.push("**Foreign key:**", "", "| ชื่อ | นิยาม |", "|---|---|");
      for (const c of fks) o.push(`| \`${c.name}\` | ${code(c.def)} |`);
      o.push("");
    }

    /* index */
    const idx = idxBy.get(rel.oid) || [];
    if (idx.length) {
      o.push("**Index:**", "", "| ชื่อ | นิยาม |", "|---|---|");
      for (const i of idx) o.push(`| \`${i.name}\` | ${code(i.def)} |`);
      o.push("");
    }

    /* trigger */
    const trg = trgBy.get(rel.oid) || [];
    if (trg.length) {
      o.push("**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):", "",
        "| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |", "|---|---|---|---|---|---|");
      for (const t of trg) {
        const p = triggerParts(t);
        o.push(`| \`${t.name}\` | ${p.timing} | ${cell(p.events)} | ${p.level} | ${code(p.fnCall)} | ${p.when ? code(p.when) : "–"} |`);
      }
      o.push("");
    }

    /* policy */
    const pols = polBy.get(rel.oid) || [];
    if (pols.length) {
      o.push("**Policy:**", "");
      for (const p of pols) {
        o.push(`- **\`${p.name}\`** — ${POLCMD[p.cmd] || p.cmd} · ${p.permissive ? "PERMISSIVE" : "RESTRICTIVE"} · role ${p.roles ? p.roles.split(", ").map((r) => "`" + r + "`").join(", ") : "–"}`);
        if (p.using_expr) o.push("", "  USING", "", indent(sqlBlock(p.using_expr), "  "), "");
        if (p.check_expr) o.push("", "  WITH CHECK", "", indent(sqlBlock(p.check_expr), "  "), "");
        if (!p.using_expr && !p.check_expr) o.push("");
      }
      o.push("");
    } else if (rel.rls) {
      o.push("**Policy:** ไม่มี → ไม่มี role ใดเห็น/เขียนแถวได้ (เข้าถึงผ่าน RPC `SECURITY DEFINER` เท่านั้น)", "");
    }
    return o;
  }

  function indent(s, pad) { return s.split("\n").map((l) => (l ? pad + l : l)).join("\n"); }

  /* ── เขียนไฟล์ ────────────────────────────────────────────────────────────── */
  const md = out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  if (CHECK_ONLY) {
    const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
    if (cur !== md) { console.error(`✗ ${OUT.replace(ROOT + "/", "")} ไม่ตรงกับฐานข้อมูล — รัน \`npm run db:dictionary\``); process.exit(1); }
    console.log(`✓ ${OUT.replace(ROOT + "/", "")} ตรงกับฐานข้อมูล`);
    return;
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, md, "utf8");
  console.log(`✓ เขียน ${OUT.replace(ROOT + "/", "")} — ${md.split("\n").length} บรรทัด · ${(Buffer.byteLength(md) / 1024).toFixed(0)} KB`);
  console.log(`  ${tables.length} ตาราง · ${views.length} view · ${functions.length} ฟังก์ชัน · ${enums.length} ENUM · ${columns.length} คอลัมน์ · ${piiCols.length} คอลัมน์ [pii]`);
  if (warnings.length) console.error(`  ${warnings.length} ข้อสังเกต (ดูข้อ 8 ของเอกสาร)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
