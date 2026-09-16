-- =====================================================================================
-- JAUN CRM · Customer 360
-- migration 0001 : foundation — schema · ENUM · app.settings · ตัวนับ · helper พื้นฐาน
-- target        : Supabase PostgreSQL 17 (ทดสอบบน PGlite 0.4.1 = PG 17.5 ผ่าน tools/db/run.mjs)
--
-- ค่าอ้างอิงทั้งหมดมาจาก docs/00-brief/CANONICAL.md (v2.1) เท่านั้น
--   ข้อ 1.1  schema และ GRANT ระดับ schema
--   ข้อ 1.2  เวลา · app.clock()
--   ข้อ 4.x  ENUM ของสถานะ (อยู่ใน schema ของตารางที่ใช้ · ประกาศลำดับตามตาราง)
--   ข้อ 6.1  app.running_numbers
--   ข้อ 6.4  การ normalize และปิดบังช่องทางติดต่อ
--   ข้อ 10.1 เลขบัตรประชาชน (ใช้โดย app.trg_guard_restricted_text ใน migration ถัดไป)
--   ข้อ 11.2 app.settings
--
-- กติกาของไฟล์นี้และทุก migration:
--   · ห้ามสร้าง role anon/authenticated/service_role หรือ schema auth/extensions (Supabase มีอยู่แล้ว)
--   · อ้างชื่อเต็ม schema.object เสมอ · ฟังก์ชันทุกตัว SET search_path = ''
--   · owner ของทุกอย่าง = role ที่รัน migration (Supabase: postgres · PGlite: superuser)
--   · ไม่มี BEGIN/COMMIT ในไฟล์ (Supabase CLI และ run.mjs รันทั้งไฟล์ในทรานแซกชันเดียว)
-- =====================================================================================


-- =====================================================================================
-- ส่วนที่ 0 — Extension (CANONICAL ข้อ 1)
-- pg_trgm อยู่ใน schema extensions ทั้ง Supabase และ PGlite (run.mjs ติดตั้งไว้ก่อนแล้ว คำสั่งนี้จึงข้าม)
-- ไม่ใช้ citext / pgcrypto (gen_random_uuid() · sha256() เป็นฟังก์ชันแกนของ PG)
-- =====================================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;


-- =====================================================================================
-- ส่วนที่ 1 — Schema (CANONICAL ข้อ 1.1)
-- =====================================================================================

CREATE SCHEMA IF NOT EXISTS api;
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS ref;
CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS restricted;

COMMENT ON SCHEMA api        IS 'RPC ที่หน้าจอเรียก (CANONICAL ข้อ 9.6) · เปิดผ่าน Data API · authenticated ได้ EXECUTE รายฟังก์ชันเท่านั้น';
COMMENT ON SCHEMA app        IS 'helper ตรวจสิทธิ์ · trigger · งานตามเวลา · settings · running numbers · ไม่เปิดผ่าน Data API · authenticated ได้ EXECUTE เฉพาะ helper ข้อ 9.3';
COMMENT ON SCHEMA core       IS 'องค์กร · สาขา · ทีม · พนักงาน · บทบาท · สิทธิ์ · อุปกรณ์ · เปิดผ่าน Data API · SELECT ตาม RLS';
COMMENT ON SCHEMA ref        IS 'Master Data (lookup) ค่ากลางไม่มี organization_id · เปิดผ่าน Data API · SELECT ตาม RLS';
COMMENT ON SCHEMA crm        IS 'ลูกค้า · กิจกรรม · lead · opportunity · quotation · task · transaction ref · notification · เปิดผ่าน Data API · สิทธิ์ตามตาราง + column grant (ข้อ 9.4)';
COMMENT ON SCHEMA analytics  IS 'view ภายในสำหรับคำนวณ KPI ใช้ใน RPC เท่านั้น · ไม่เปิดผ่าน Data API · ไม่มี GRANT ให้ authenticated';
COMMENT ON SCHEMA audit      IS 'audit_logs · access_logs · login_events · export_requests · integration_logs · ไม่เปิดผ่าน Data API · ไม่มี GRANT ให้ authenticated';
COMMENT ON SCHEMA restricted IS 'เอกสารสำคัญระดับ Restricted (ข้อ 10.1) · ปิดใช้งานใน V1 · ไม่มี GRANT ให้ role ใด';

-- GRANT ระดับ schema ตามข้อ 1.1 (แยกชัด) · anon ไม่ได้อะไรเลย
GRANT USAGE ON SCHEMA api, crm, core, ref TO authenticated, service_role;
GRANT USAGE ON SCHEMA app TO authenticated;

-- ฟังก์ชันที่สร้างใหม่ต้องไม่ถูกเรียกได้โดย PUBLIC (ข้อ 1.1)
-- ข้อความตาม CANONICAL:
ALTER DEFAULT PRIVILEGES IN SCHEMA api, app, audit, analytics REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- หมายเหตุผู้เขียน: PostgreSQL ถือว่า default privilege แบบ IN SCHEMA "บวกเพิ่ม" จากค่ากลางเท่านั้น
-- (เอกสาร ALTER DEFAULT PRIVILEGES: per-schema REVOKE ย้อนได้เฉพาะ per-schema GRANT)
-- EXECUTE ให้ PUBLIC ของฟังก์ชันเป็นค่ากลางในตัวระบบ คำสั่งข้างบนจึงไม่มีผลจริง
-- เพื่อให้เจตนาของข้อ 1.1 เกิดขึ้นจริง จึงถอนค่ากลางของ role ที่รัน migration ด้วย:
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- ผล: ทุกฟังก์ชันที่ role นี้สร้างหลังจากนี้ (ทุก schema) ไม่มี EXECUTE ให้ใคร นอกจาก owner
--     ฟังก์ชันที่ต้องถูกเรียกโดย authenticated/service_role โดยตรง (helper ใน policy · RPC ใน api ·
--     ฟังก์ชันที่ถูกเรียกจากฟังก์ชัน SECURITY INVOKER) ต้อง GRANT EXECUTE รายฟังก์ชันเสมอ
--     ฟังก์ชัน trigger ไม่ต้อง GRANT (PostgreSQL ไม่ตรวจ EXECUTE ตอน trigger ทำงาน)


-- =====================================================================================
-- ส่วนที่ 2 — ENUM (CANONICAL ข้อ 4.1–4.8)
-- อยู่ใน schema ของตารางที่ใช้ · ลำดับค่าตรงตามตาราง CANONICAL · อ้างชื่อเต็มเสมอ
-- เพิ่มค่า = migration ไฟล์เดี่ยวที่มีแค่ ALTER TYPE … ADD VALUE
-- ป้ายไทยของ ENUM อยู่ใน data dictionary และ prototype/assets/data.js (ไม่เก็บในฐานข้อมูล)
-- =====================================================================================

-- core ------------------------------------------------------------------------------
CREATE TYPE core.staff_status AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');
COMMENT ON TYPE core.staff_status IS
'สถานะบัญชีพนักงาน (ข้อ 4.8) · INVITED เชิญแล้ว · ACTIVE ใช้งาน · DISABLED ปิดใช้งาน (ห้ามลบแถว)';

CREATE TYPE core.data_scope AS ENUM ('OWN', 'TEAM', 'BRANCH', 'ORGANIZATION', 'SYSTEM');
COMMENT ON TYPE core.data_scope IS
'ขอบเขตข้อมูลของสิทธิ์ (ข้อ 8.0) · ประกาศตามลำดับ OWN < TEAM < BRANCH < ORGANIZATION < SYSTEM · '
'การเทียบ >= ต้องมีเงื่อนไข scope <> ''SYSTEM'' เสมอ เพราะ SYSTEM ใช้กับวัตถุระบบเท่านั้น ไม่รวมข้อมูลลูกค้า';

-- crm · สถานะของรายการ ---------------------------------------------------------------
CREATE TYPE crm.visit_status AS ENUM ('WAITING', 'IN_SERVICE', 'COMPLETED', 'LEFT', 'CANCELLED');
COMMENT ON TYPE crm.visit_status IS
'สถานะ visit (ข้อ 4.1) · WAITING รอรับบริการ · IN_SERVICE กำลังให้บริการ · COMPLETED เสร็จสิ้น · '
'LEFT ออกก่อนรับบริการ · CANCELLED ยกเลิก (สร้างผิด · ไม่นับในทุก KPI)';

CREATE TYPE crm.lead_status AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST');
COMMENT ON TYPE crm.lead_status IS
'สถานะ lead (ข้อ 4.3) · NEW ใหม่ · CONTACTED ติดต่อแล้ว · QUALIFIED คัดกรองแล้ว · CONVERTED แปลงเป็นโอกาสขาย · LOST ไม่สำเร็จ';

CREATE TYPE crm.opportunity_stage AS ENUM ('INTERESTED', 'QUOTATION', 'FOLLOW_UP', 'WON', 'LOST');
COMMENT ON TYPE crm.opportunity_stage IS
'ขั้นของ opportunity (ข้อ 4.4) · INTERESTED สนใจ · QUOTATION เสนอราคา · FOLLOW_UP รอตัดสินใจ · WON ปิดการขาย · LOST ไม่สำเร็จ';

CREATE TYPE crm.quotation_status AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');
COMMENT ON TYPE crm.quotation_status IS
'สถานะใบเสนอราคา (ข้อ 4.6) · DRAFT ร่าง · SENT ส่งแล้ว · ACCEPTED ตอบรับ · REJECTED ปฏิเสธ · EXPIRED หมดอายุ';

CREATE TYPE crm.task_status AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');
COMMENT ON TYPE crm.task_status IS
'สถานะงาน (ข้อ 4.7) · OPEN เปิด · IN_PROGRESS กำลังทำ · DONE เสร็จ (บังคับ completed_at) · CANCELLED ยกเลิก (บังคับ cancelled_at)';

-- crm · ลูกค้า ------------------------------------------------------------------------
CREATE TYPE crm.customer_record_status AS ENUM ('ACTIVE', 'MERGED', 'ANONYMIZED');
COMMENT ON TYPE crm.customer_record_status IS
'สถานะแถวลูกค้า (ข้อ 4.8) · ACTIVE · MERGED ถูกรวมเข้า survivor (มี merged_into_id) · ANONYMIZED ทำข้อมูลนิรนามแล้ว (ข้อ 10.4)';

CREATE TYPE crm.interaction_direction AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');
COMMENT ON TYPE crm.interaction_direction IS
'ทิศทางการติดต่อ (ข้อ 4.8) · INBOUND ลูกค้าติดต่อมา · OUTBOUND พนักงานติดต่อไป · INTERNAL บันทึกภายใน';

CREATE TYPE crm.contact_type AS ENUM ('PHONE', 'LINE_ID', 'LINE_USER_ID', 'FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'EMAIL');
COMMENT ON TYPE crm.contact_type IS
'ชนิดช่องทางติดต่อของลูกค้า (ข้อ 4.8 · กติกา normalize/mask ข้อ 6.4)';

CREATE TYPE crm.consent_status AS ENUM ('GRANTED', 'WITHDRAWN');
COMMENT ON TYPE crm.consent_status IS
'สถานะของแถวความยินยอม (ข้อ 4.8 · 10.2) · ถอน = แถวใหม่สถานะ WITHDRAWN (append-only)';

CREATE TYPE crm.consent_capture_via AS ENUM ('STAFF_FORM', 'LINK_SENT', 'LINE_OA', 'WEB');
COMMENT ON TYPE crm.consent_capture_via IS
'ช่องทางที่ได้รับ/แจ้งความยินยอม (ข้อ 4.8 · 10.2) · LINK_SENT = ส่งลิงก์ประกาศแล้ว (ช่องทางออนไลน์/โทร)';

CREATE TYPE crm.customer_link_via AS ENUM ('CREATED', 'VISIT', 'INTERACTION', 'LEAD', 'OPPORTUNITY', 'MANUAL_LINK', 'MERGE');
COMMENT ON TYPE crm.customer_link_via IS
'เหตุที่ลูกค้าถูกผูกกับสาขาใน crm.customer_branches (ข้อ 4.8 · 6.6) · MANUAL_LINK = api.link_customer_to_branch';

CREATE TYPE crm.duplicate_status AS ENUM ('PENDING', 'MERGED', 'NOT_DUPLICATE');
COMMENT ON TYPE crm.duplicate_status IS
'ผลการตัดสินข้อมูลซ้ำ (ข้อ 4.8 · 6.7) · PENDING รอตัดสิน · MERGED รวมแล้ว · NOT_DUPLICATE ยืนยันคนละคน';

CREATE TYPE crm.dsr_type AS ENUM ('ACCESS', 'CORRECTION', 'DELETION', 'OBJECTION', 'WITHDRAW_CONSENT', 'PORTABILITY');
COMMENT ON TYPE crm.dsr_type IS
'ประเภทคำขอเจ้าของข้อมูล (ข้อ 4.8 · 10.4) · ACCESS ขอดู/ขอสำเนา · CORRECTION ขอแก้ไข · DELETION ขอลบ · '
'OBJECTION คัดค้าน · WITHDRAW_CONSENT ถอนความยินยอม · PORTABILITY ขอโอนย้าย';

CREATE TYPE crm.dsr_status AS ENUM ('RECEIVED', 'VERIFIED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');
COMMENT ON TYPE crm.dsr_status IS
'สถานะคำขอเจ้าของข้อมูล (ข้อ 4.8 · 10.4)';

CREATE TYPE crm.interest_level AS ENUM ('HOT', 'WARM', 'COLD');
COMMENT ON TYPE crm.interest_level IS
'ระดับความสนใจ (ข้อ 4.8 · [รอยืนยัน]) · HOT สนใจมาก · WARM สนใจ · COLD สนใจน้อย · ใช้เรียง "สินค้าที่สนใจ" HOT → WARM → COLD';

-- audit -------------------------------------------------------------------------------
CREATE TYPE audit.export_status AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'GENERATED', 'DOWNLOADED', 'EXPIRED');
COMMENT ON TYPE audit.export_status IS
'สถานะคำขอส่งออกข้อมูลลูกค้า (ข้อ 4.8 · 8.2)';

CREATE TYPE audit.actor_type AS ENUM ('STAFF', 'SYSTEM', 'INTEGRATION');
COMMENT ON TYPE audit.actor_type IS
'ชนิดผู้กระทำใน audit (ข้อ 4.8 · 9.5) · STAFF จาก app.current_staff_id() · SYSTEM งานตามเวลา · INTEGRATION ระบบภายนอก';


-- =====================================================================================
-- ส่วนที่ 3 — ฟังก์ชัน trigger ทั่วไป
-- =====================================================================================

CREATE FUNCTION app.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION app.touch_updated_at() IS
'trigger BEFORE UPDATE ทั่วไป: ตั้ง updated_at = now() (เวลาทรานแซกชัน) ทุกครั้งที่แถวถูกแก้ · '
'ติดทุกตารางที่มีคอลัมน์ updated_at ด้วยชื่อ trigger "trg_touch_updated_at" · '
'ไม่ตั้ง updated_by (ผู้เขียน RPC/trigger ของแต่ละตารางตั้งจาก app.current_staff_id()) · '
'ไม่ต้อง GRANT EXECUTE (trigger ไม่ถูกตรวจสิทธิ์ EXECUTE)';


-- =====================================================================================
-- ส่วนที่ 4 — app.settings (CANONICAL ข้อ 11.2)
-- =====================================================================================

CREATE TABLE app.settings (
    key          text        PRIMARY KEY,
    value        jsonb       NOT NULL,
    editable_by  text        NOT NULL,
    updated_by   uuid,                               -- FK → core.staff_profiles เพิ่มใน 0002
    updated_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT settings_key_format_chk
        CHECK (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
    CONSTRAINT settings_editable_by_chk
        CHECK (editable_by IN ('settings.system', 'settings.business')),
    CONSTRAINT settings_env_value_chk
        CHECK (key <> 'env'
               OR (jsonb_typeof(value) = 'string' AND value #>> '{}' IN ('dev', 'staging', 'prod'))),
    CONSTRAINT settings_clock_value_chk
        CHECK (key <> 'clock'
               OR (jsonb_typeof(value) = 'object'
                   AND (value -> 'as_of') IS NOT NULL
                   AND (jsonb_typeof(value -> 'as_of') = 'null'
                        OR (jsonb_typeof(value -> 'as_of') = 'string'
                            AND value ->> 'as_of' ~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$'))))
);

COMMENT ON TABLE app.settings IS
'ค่าตั้งของระบบแบบ key → jsonb (ข้อ 11.2 · ค่าเริ่มต้น [รอยืนยัน]) · แก้ผ่าน api.update_setting(p_key, p_value) เท่านั้น '
'โดยตรวจสิทธิ์ตาม editable_by · ไม่มี GRANT ให้ authenticated (อ่านผ่าน app.clock() หรือ RPC)';
COMMENT ON COLUMN app.settings.key IS 'ชื่อค่าตั้ง เช่น env · clock · sla.lead_unassigned_min (ตัวพิมพ์เล็ก คั่นกลุ่มด้วยจุด)';
COMMENT ON COLUMN app.settings.value IS
'ค่าเป็น jsonb เสมอ: ตัวเลข = number · เวลา "HH:MM" = string · ช่วงยกระดับ = array · env = string ("dev"/"staging"/"prod") · '
'clock = {"as_of": null | "ISO-8601 พร้อม offset"} (CHECK บังคับให้มี offset เพื่อไม่พึ่ง session TimeZone)';
COMMENT ON COLUMN app.settings.editable_by IS
'รหัสสิทธิ์ที่แก้ค่านี้ได้: settings.system (SYSTEM_ADMIN · ค่าเชิงเทคนิค) หรือ settings.business (BUSINESS_ADMIN · เกณฑ์ธุรกิจ)';
COMMENT ON COLUMN app.settings.updated_by IS 'staff ที่แก้ล่าสุด (core.staff_profiles.id) · NULL = ค่าจาก migration/seed';

CREATE TRIGGER trg_touch_updated_at
    BEFORE UPDATE ON app.settings
    FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE app.settings ENABLE ROW LEVEL SECURITY;

-- ค่าเริ่มต้นทั้งหมดของข้อ 11.2 · env = "dev" · clock.as_of = null (seed/test ตั้ง 2026-09-11T10:24:00+07:00 · prod ต้อง null)
INSERT INTO app.settings (key, value, editable_by) VALUES
    ('env',                              '"dev"',                                  'settings.system'),
    ('clock',                            '{"as_of": null}',                        'settings.system'),
    ('allowed_sso_domains',              '[]',                                     'settings.system'),
    ('business_hours',                   '{"default": ["10:00", "21:00"]}',        'settings.business'),
    ('sla.followup_remind_min',          '15',                                     'settings.business'),
    ('sla.lead_unassigned_min',          '15',                                     'settings.business'),
    ('sla.lead_not_contacted_min',       '30',                                     'settings.business'),
    ('sla.visitor_waiting_min',          '15',                                     'settings.business'),
    ('sla.visit_in_service_min',         '60',                                     'settings.business'),
    ('sla.opportunity_stale_days',       '[7, 14]',                                'settings.business'),
    ('escalation.overdue_hours',         '[24, 48]',                               'settings.business'),
    ('dq.lead_without_outcome_days',     '14',                                     'settings.business'),
    ('dq.won_without_txn_days',          '3',                                      'settings.business'),
    ('dq.visit_unrecorded_days',         '7',                                      'settings.business'),
    ('badge.new_customer_days',          '30',                                     'settings.business'),
    ('quotation.valid_days',             '7',                                      'settings.business'),
    ('notify.duplicate_digest_time',     '"18:00"',                                'settings.business'),
    ('notify.data_missing_time',         '"09:00"',                                'settings.business'),
    -- ข้อ 8.2: เพดานแถว/ครั้ง · ครั้ง/วัน · บทบาทผู้อนุมัติ (null = ไม่ต้องอนุมัติ และเกินเพดาน = ปฏิเสธ)
    -- หมายเหตุผู้เขียน: ชื่อคีย์ภายใน JSON (max_rows · per_day · approver_role) ตั้งโดยผู้เขียน · ตัวเลขตามข้อ 8.2 [รอยืนยัน Q7 · Q23]
    ('export.limits',
     '{"BRANCH_MANAGER": {"max_rows": 500,  "per_day": 3, "approver_role": null},
       "MARKETING":      {"max_rows": 5000, "per_day": 2, "approver_role": "BUSINESS_ADMIN"},
       "BUSINESS_ADMIN": {"max_rows": 5000, "per_day": 5, "approver_role": "EXECUTIVE"},
       "EXECUTIVE":      {"max_rows": 5000, "per_day": 5, "approver_role": "BUSINESS_ADMIN"}}',
                                                                                   'settings.business'),
    ('export.link_ttl_hours',            '24',                                     'settings.business'),
    ('export.max_downloads',             '3',                                      'settings.business'),
    ('security.reveal_per_hour',         '30',                                     'settings.business'),
    ('security.search_per_hour',         '60',                                     'settings.business'),
    ('security.search_miss_per_hour',    '20',                                     'settings.business'),
    ('security.link_per_day',            '10',                                     'settings.business'),
    ('security.customer_view_per_hour',  '100',                                    'settings.business'),
    ('session.shared_counter_idle_min',  '10',                                     'settings.business');


-- =====================================================================================
-- ส่วนที่ 5 — app.running_numbers (CANONICAL ข้อ 6.1)
-- =====================================================================================

CREATE TABLE app.running_numbers (
    scope_key   text        PRIMARY KEY,
    last_value  bigint      NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT running_numbers_last_value_chk CHECK (last_value >= 0),
    CONSTRAINT running_numbers_scope_key_chk CHECK (
           scope_key ~ '^(CUS|LD|OP|QT|TK|EX|MG|DSR|RG):[0-9]{4}$'
        OR scope_key = 'ST'
        OR scope_key ~ '^(VISIT|QUEUE):[A-Z0-9_-]+:[0-9]{8}$')
);

COMMENT ON TABLE app.running_numbers IS
'ตัวนับเลขอ้างอิง (ข้อ 6.1) · เขียนโดย app.trg_assign_running_number (BEFORE INSERT · SECURITY DEFINER) ด้วย upsert '
'INSERT … ON CONFLICT (scope_key) DO UPDATE SET last_value = app.running_numbers.last_value + 1 RETURNING last_value · '
'แถวที่ล็อกจาก upsert ทำให้เลขไม่ซ้ำภายใต้การทำงานพร้อมกัน · seed ต้องตั้งค่าให้ตรงข้อ 13.0 ข้อ 8';
COMMENT ON COLUMN app.running_numbers.scope_key IS
'ขอบเขตตัวนับ: CUS:{YYYY} · LD:{YYYY} · OP:{YYYY} · QT:{YYYY} · TK:{YYYY} · EX:{YYYY} · MG:{YYYY} · DSR:{YYYY} · RG:{YYYY} · ST · '
'VISIT:{branch_code}:{YYYYMMDD} · QUEUE:{branch_code}:{YYYYMMDD} · ปี/วันคิดจาก created_at (visit: started_at) AT TIME ZONE ''Asia/Bangkok'' · ปี ค.ศ.';
COMMENT ON COLUMN app.running_numbers.last_value IS 'เลขล่าสุดที่ออกไปแล้วในขอบเขตนี้ (เลขถัดไป = last_value + 1)';

CREATE TRIGGER trg_touch_updated_at
    BEFORE UPDATE ON app.running_numbers
    FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE app.running_numbers ENABLE ROW LEVEL SECURITY;


-- =====================================================================================
-- ส่วนที่ 6 — app.rate_limit_counters (CANONICAL ข้อ 6.5 · 11.2 security.*)
-- =====================================================================================

CREATE TABLE app.rate_limit_counters (
    staff_id       uuid        NOT NULL,             -- FK → core.staff_profiles เพิ่มใน 0002
    counter_key    text        NOT NULL,
    window_start   timestamptz NOT NULL,
    hit_count      integer     NOT NULL DEFAULT 0,
    blocked_until  timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (staff_id, counter_key, window_start),
    CONSTRAINT rate_limit_counters_hit_count_chk CHECK (hit_count >= 0),
    CONSTRAINT rate_limit_counters_key_chk CHECK (counter_key ~ '^[A-Za-z0-9_.:-]+$')
);

COMMENT ON TABLE app.rate_limit_counters IS
'ตัวนับอัตราการใช้งานต่อผู้ใช้ต่อช่วงเวลา (ข้อ 6.4 · 6.5 · 6.6 · 11.2) · เขียน/อ่านโดย app.rate_limit_hit ใน RPC SECURITY DEFINER เท่านั้น · '
'เวลาใช้ now() เสมอ (เป็นการตัดสินสิทธิ์ ข้อ 1.2 ไม่ใช้ app.clock()) · หมายเหตุผู้เขียน: โครงคอลัมน์ไม่ได้ระบุใน CANONICAL ผู้เขียนออกแบบ';
COMMENT ON COLUMN app.rate_limit_counters.staff_id IS 'ผู้ใช้ที่ถูกนับ (core.staff_profiles.id)';
COMMENT ON COLUMN app.rate_limit_counters.counter_key IS
'ชื่อตัวนับ · ข้อตกลง: ใช้ key ของ app.settings ที่กำหนดเพดานนั้น เช่น security.reveal_per_hour · security.search_per_hour · '
'security.search_miss_per_hour · security.link_per_day · security.customer_view_per_hour';
COMMENT ON COLUMN app.rate_limit_counters.window_start IS
'จุดเริ่มช่วงนับ: ต้นชั่วโมง (date_trunc(''hour'', now())) สำหรับ *_per_hour · 00:00 Asia/Bangkok ของวันนั้นสำหรับ *_per_day';
COMMENT ON COLUMN app.rate_limit_counters.hit_count IS 'จำนวนครั้งในช่วงนี้';
COMMENT ON COLUMN app.rate_limit_counters.blocked_until IS
'ถ้าไม่ว่างและ > now() = ผู้ใช้ถูกบล็อกสำหรับตัวนับนี้ถึงเวลานี้ (เช่น ค้นด้วยตัวระบุไม่พบผลเกินเกณฑ์ → บล็อก 1 ชม. ข้อ 6.5)';

CREATE TRIGGER trg_touch_updated_at
    BEFORE UPDATE ON app.rate_limit_counters
    FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE app.rate_limit_counters ENABLE ROW LEVEL SECURITY;


-- =====================================================================================
-- ส่วนที่ 7 — นาฬิกาและวันธุรกิจ (CANONICAL ข้อ 1.2)
-- =====================================================================================

CREATE FUNCTION app.clock()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE
        WHEN coalesce((SELECT s.value #>> '{}' FROM app.settings s WHERE s.key = 'env'), 'prod') <> 'prod'
            THEN coalesce((SELECT (s.value ->> 'as_of')::timestamptz FROM app.settings s WHERE s.key = 'clock'),
                          now())
        ELSE now()
    END
$$;

COMMENT ON FUNCTION app.clock() IS
'นาฬิกาอ้างอิงของรายงาน (ข้อ 1.2 · 9.3): คืน app.settings[clock].as_of เมื่อ app.settings[env] <> ''prod'' และ as_of ไม่ว่าง · '
'มิฉะนั้นคืน now() · ไม่พบแถว env ถือเป็น prod · ใช้กับ KPI คุณภาพข้อมูล การแจ้งเตือน "วันนี้" ป้ายลูกค้าใหม่ งานตามเวลา · '
'ห้ามใช้ตัดสินสิทธิ์ (ใช้ now())';

GRANT EXECUTE ON FUNCTION app.clock() TO authenticated;

CREATE FUNCTION app.bangkok_date(p_ts timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT (p_ts AT TIME ZONE 'Asia/Bangkok')::date
$$;

COMMENT ON FUNCTION app.bangkok_date(timestamptz) IS
'วันธุรกิจของเวลา ts ตามขอบเที่ยงคืน Asia/Bangkok = (ts AT TIME ZONE ''Asia/Bangkok'')::date (ข้อ 1.2) · ไม่ขึ้นกับ session TimeZone · '
'ตัวอย่าง 2026-09-11T17:30:00Z → 2026-09-12';


-- =====================================================================================
-- ส่วนที่ 8 — ช่องทางติดต่อ: normalize · mask · ตรวจเบอร์ (CANONICAL ข้อ 6.4)
-- ทุกฟังก์ชัน IMMUTABLE เพื่อใช้เป็น generated column ของ crm.customer_contacts ได้
-- =====================================================================================

CREATE FUNCTION app.normalize_contact(p_contact_type crm.contact_type, p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
    v_text    text;
    v_digits  text;
    v_plus    boolean;
BEGIN
    IF p_contact_type IS NULL OR p_raw IS NULL THEN
        RETURN NULL;
    END IF;

    IF p_contact_type = 'PHONE' THEN
        -- เลขไทย ๐–๙ → 0–9 · จำว่ามี + นำหน้าหรือไม่ · เหลือเฉพาะตัวเลข
        v_text   := translate(p_raw, '๐๑๒๓๔๕๖๗๘๙', '0123456789');
        v_plus   := v_text ~ '^[[:space:]]*\+';
        v_digits := regexp_replace(v_text, '[^0-9]', '', 'g');

        IF v_digits = '' THEN
            RETURN NULL;
        END IF;

        -- 00 นำหน้า = รหัสโทรออกระหว่างประเทศ
        IF NOT v_plus AND v_digits ~ '^00[1-9]' THEN
            v_digits := substr(v_digits, 3);
            v_plus   := true;
        END IF;

        -- มีรหัสประเทศ 66 แล้ว (+66… · 66… · 0066…) ตามด้วย 8–9 หลัก · ตัดเลข 0 ที่พิมพ์เกินหลัง 66 (+66 081…)
        -- (เบอร์ในประเทศขึ้นต้น 0 เสมอ จึงไม่มีเบอร์ในประเทศที่ขึ้นต้น 66)
        IF v_digits ~ '^660[0-9]{8,9}$' THEN
            RETURN '+66' || substr(v_digits, 4);
        END IF;
        IF v_digits ~ '^66[0-9]{8,9}$' THEN
            RETURN '+' || v_digits;
        END IF;
        IF v_plus THEN
            RETURN '+' || v_digits;               -- เบอร์ต่างประเทศ เก็บตามที่กรอก (is_valid = false)
        END IF;

        -- เบอร์ในประเทศ 9–10 หลักขึ้นต้น 0 → E.164
        IF v_digits ~ '^0[0-9]{8,9}$' THEN
            RETURN '+66' || substr(v_digits, 2);
        END IF;

        RETURN v_digits;                          -- รูปแบบไม่รู้จัก เก็บเฉพาะตัวเลข (is_valid = false)
    END IF;

    -- ชนิดอื่น: ตัดช่องว่างทุกตำแหน่ง (รวม NBSP · zero-width)
    v_text := regexp_replace(translate(p_raw, U&'\00A0\200B\FEFF', ''), '[[:space:]]+', '', 'g');

    v_text := CASE p_contact_type
        WHEN 'EMAIL'        THEN lower(v_text)
        WHEN 'LINE_ID'      THEN regexp_replace(lower(v_text), '^@+', '')
        WHEN 'FACEBOOK'     THEN lower(v_text)
        WHEN 'INSTAGRAM'    THEN lower(v_text)
        WHEN 'TIKTOK'       THEN lower(v_text)
        WHEN 'LINE_USER_ID' THEN v_text           -- ตามที่ LINE ส่ง (ไม่เปลี่ยนตัวพิมพ์)
    END;

    RETURN nullif(v_text, '');
END;
$$;

COMMENT ON FUNCTION app.normalize_contact(crm.contact_type, text) IS
'ค่า normalized ของช่องทางติดต่อ (ข้อ 6.4) ใช้ค้นแบบตรงทั้งค่าและตรวจซ้ำ · idempotent (normalize ซ้ำได้ค่าเดิม) · ค่าว่างหลังตัด → NULL · '
'PHONE: เหลือตัวเลข (แปลงเลขไทย) · 0 + 8–9 หลัก → +66… (081-234-5678 → +66812345678 · 02-123-4567 → +6621234567) · '
'+66/66/0066 นำหน้าคงเป็น +66… (ตัด 0 ที่เกินหลัง 66) · + ประเทศอื่นเก็บ +ตัวเลข · รูปแบบอื่นเก็บตัวเลขล้วน · '
'EMAIL · FACEBOOK · INSTAGRAM · TIKTOK: ตัดช่องว่าง + ตัวพิมพ์เล็ก · LINE_ID: ตัดช่องว่าง + ตัวพิมพ์เล็ก + ตัด @ นำหน้า (@Somchai_J → somchai_j) · '
'LINE_USER_ID: ตามที่ LINE ส่ง (ตัดเฉพาะช่องว่าง) · หมายเหตุผู้เขียน: "ตัดช่องว่าง" ตีความเป็นตัดทุกตำแหน่ง ไม่ใช่เฉพาะหัวท้าย';

CREATE FUNCTION app.is_valid_thai_phone(p_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
    v text := app.normalize_contact('PHONE'::crm.contact_type, p_value);
BEGIN
    RETURN v IS NOT NULL
       AND (v ~ '^\+66[689][0-9]{8}$'            -- มือถือ 10 หลักขึ้นต้น 06 08 09
            OR v ~ '^\+66[2-7][0-9]{7}$');       -- เบอร์บ้าน 9 หลักขึ้นต้น 02–07
END;
$$;

COMMENT ON FUNCTION app.is_valid_thai_phone(text) IS
'เบอร์ถูกต้องตามข้อ 6.4: มือถือ 10 หลักขึ้นต้น 06 08 09 หรือเบอร์บ้าน 9 หลักขึ้นต้น 02–07 · รับได้ทั้งค่าที่กรอกและค่า normalized · '
'NULL/ว่าง → false · api.save_contact ใช้ตั้ง customer_contacts.is_valid ของ PHONE';

CREATE FUNCTION app.mask_contact(p_contact_type crm.contact_type, p_normalized text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
    v        text;
    v_local  text;
    v_digits text;
    v_at     integer;
BEGIN
    IF p_contact_type IS NULL THEN
        RETURN NULL;
    END IF;
    IF p_contact_type = 'LINE_USER_ID' THEN
        RETURN CASE WHEN p_normalized IS NULL THEN NULL ELSE '—' END;   -- ไม่แสดง
    END IF;

    -- normalize ซ้ำ (idempotent) เพื่อให้ผลถูกต้องแม้ผู้เรียกส่งค่าที่ยังไม่ normalize
    v := app.normalize_contact(p_contact_type, p_normalized);
    IF v IS NULL THEN
        RETURN NULL;
    END IF;

    IF p_contact_type = 'PHONE' THEN
        IF v ~ '^\+66[0-9]{9}$' THEN                       -- 10 หลักในประเทศ (มือถือ)
            v_local := '0' || substr(v, 4);
            RETURN substr(v_local, 1, 3) || '-XXX-' || right(v_local, 4);
        ELSIF v ~ '^\+66[0-9]{8}$' THEN                    -- 9 หลักในประเทศ (เบอร์บ้าน)
            v_local := '0' || substr(v, 4);
            RETURN substr(v_local, 1, 2) || '-XXX-' || right(v_local, 4);
        END IF;
        v_digits := regexp_replace(v, '[^0-9]', '', 'g');   -- รูปแบบอื่น: เผยได้มากสุด 4 หลักท้าย
        RETURN CASE WHEN length(v_digits) >= 8 THEN 'XXX-' || right(v_digits, 4) ELSE 'XXX' END;
    END IF;

    IF p_contact_type = 'EMAIL' THEN
        v_at := length(v) - strpos(reverse(v), '@') + 1;     -- ตำแหน่ง @ ตัวสุดท้าย
        IF strpos(v, '@') = 0 THEN
            RETURN left(v, 1) || '***';
        END IF;
        RETURN left(substr(v, 1, v_at - 1), 1) || '***@' || substr(v, v_at + 1);
    END IF;

    -- LINE_ID · FACEBOOK · INSTAGRAM · TIKTOK: 2 อักษรแรก + ***
    RETURN left(v, 2) || '***';
END;
$$;

COMMENT ON FUNCTION app.mask_contact(crm.contact_type, text) IS
'ค่าปิดบังของช่องทางติดต่อ (ข้อ 6.4) ที่ authenticated อ่านได้: '
'PHONE มือถือ +66812345678 → 081-XXX-5678 · เบอร์บ้าน +6621234567 → 02-XXX-4567 · '
'EMAIL อักษรแรก + ***@ + โดเมน (somchai.j@example.com → s***@example.com) · '
'LINE_ID/FACEBOOK/INSTAGRAM/TIKTOK 2 อักษรแรก + *** (somchai_j → so***) · LINE_USER_ID → — (ไม่แสดง) · '
'หมายเหตุผู้เขียน: เบอร์บ้าน 9 หลักทุกจังหวัดใช้รูป 2 หลัก-XXX-4 หลักท้ายตามตัวอย่าง 02 · เบอร์รูปแบบอื่น (ต่างประเทศ/ผิดรูป) แสดง XXX-4 หลักท้าย (≥ 8 หลัก) หรือ XXX';

CREATE FUNCTION app.is_thai_national_id(p_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
    v      text;
    v_sum  integer := 0;
    i      integer;
BEGIN
    IF p_value IS NULL THEN
        RETURN false;
    END IF;
    -- ยอมรับตัวคั่นเฉพาะช่องว่างและขีด (เช่น 1-2345-67890-12-1) · แปลงเลขไทย
    v := regexp_replace(translate(p_value, '๐๑๒๓๔๕๖๗๘๙', '0123456789'), '[[:space:]-]', '', 'g');
    IF v !~ '^[0-9]{13}$' THEN
        RETURN false;
    END IF;
    FOR i IN 1..12 LOOP
        v_sum := v_sum + substr(v, i, 1)::integer * (14 - i);
    END LOOP;
    RETURN (11 - v_sum % 11) % 10 = substr(v, 13, 1)::integer;
END;
$$;

COMMENT ON FUNCTION app.is_thai_national_id(text) IS
'true เมื่อค่าเป็นเลขบัตรประชาชนไทย 13 หลักที่ checksum ถูกต้อง (ข้อ 10.1): หลักที่ 13 = (11 − (Σ หลักที่ i × (14 − i), i = 1..12) mod 11) mod 10 · '
'ยอมรับตัวคั่นช่องว่าง/ขีด และเลขไทย · ใช้โดย app.trg_guard_restricted_text (ผู้เรียกดึงชุดตัวเลขที่อาจเป็นเลขบัตรออกจากข้อความก่อน)';
