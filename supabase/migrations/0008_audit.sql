-- =====================================================================================
-- JAUN CRM · Customer 360
-- migration 0008 : audit — audit_logs · access_logs · login_events · export_requests · integration_logs
--                  + audit.deny_change() · audit.log_row_change() · helper PII/ผู้กระทำ
-- target        : Supabase PostgreSQL 17
--
-- ค่าอ้างอิง (docs/00-brief/CANONICAL.md v2.1):
--   ข้อ 1.1 schema audit (ไม่เปิด API · ไม่มี GRANT ให้ authenticated) · 4.8 audit.export_status/actor_type (สร้างใน 0001)
--   ข้อ 8.2 คำขอส่งออก · 9.2 login_events · 9.3 app.current_staff_id() · 9.5 Audit ทั้งข้อ · 10.3 ระยะเก็บ · 10.4 audit_redaction
--   ข้อ 13.0 ข้อ 7 app.seed_mode
--
-- สรุปการทำงาน:
--   · audit.log_row_change() ติด AFTER INSERT/UPDATE/DELETE ทุกตารางใน crm core ref ยกเว้น 5 ตารางของข้อ 9.5 (ท้ายไฟล์)
--     ตารางที่สร้างใน migration หลังจากนี้ต้องติด trigger เอง:
--       CREATE TRIGGER trg_audit_row_change AFTER INSERT OR UPDATE OR DELETE ON <t> FOR EACH ROW EXECUTE FUNCTION audit.log_row_change();
--   · คอลัมน์ pii = คอลัมน์ที่ COMMENT ขึ้นต้นด้วย "[pii]" (แหล่งเดียวกับ data dictionary · app.pii_columns())
--     บันทึกเป็น {"masked": …, "sha256": …} ไม่เก็บค่าเต็ม
--   · audit_logs/access_logs/login_events/integration_logs เป็น append-only: REVOKE UPDATE/DELETE/TRUNCATE + audit.deny_change()
--     export_requests เป็นตาราง workflow (สถานะเปลี่ยนได้) จึงไม่ติด deny_change แต่ไม่มี GRANT ให้ authenticated/service_role
-- =====================================================================================


-- =====================================================================================
-- ส่วนที่ 0 — role audit_retention (ข้อ 9.5 · 10.3)
-- =====================================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'audit_retention') THEN
        CREATE ROLE audit_retention NOLOGIN;
        -- COMMENT ON ROLE ต้องมี ADMIN OPTION บน role จึงทำเฉพาะตอนที่ migration นี้สร้าง role เอง
        COMMENT ON ROLE audit_retention IS
        'role ของงานลบข้อมูลตามระยะเก็บ (ข้อ 9.5 · 10.3): งาน retention รัน SET ROLE audit_retention แล้ว DELETE · มีเฉพาะ USAGE schema audit + SELECT/DELETE ตาราง log · NOLOGIN';
    END IF;
END;
$$;

GRANT USAGE ON SCHEMA audit TO audit_retention;

-- ให้ role ที่รัน migration (Supabase: postgres) SET ROLE audit_retention ได้ · superuser ไม่จำเป็นแต่ไม่เสียหาย
DO $$
BEGIN
    EXECUTE format('GRANT audit_retention TO %I', current_user);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ข้าม GRANT audit_retention TO %: %', current_user, SQLERRM;
END;
$$;


-- =====================================================================================
-- ส่วนที่ 1 — audit.audit_logs (ข้อ 9.5 · คอลัมน์ตาม CANONICAL)
-- =====================================================================================

CREATE TABLE audit.audit_logs (
    id               bigint           GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at      timestamptz      NOT NULL DEFAULT now(),
    organization_id  uuid,
    actor_type       audit.actor_type NOT NULL,
    actor_staff_id   uuid,
    actor_staff_code text,
    actor_label      text,
    actor_roles      text[]           NOT NULL DEFAULT '{}',
    aal              text,
    action           text             NOT NULL,
    entity_type      text,
    entity_id        text,
    entity_ref       text,
    branch_id        uuid,
    before           jsonb,
    after            jsonb,
    changed_fields   text[],
    reason           text,
    ip               text,
    user_agent       text,
    device_id        text,
    request_id       text,

    -- {ENTITY}_{VERB} ตัวพิมพ์ใหญ่ (ข้อ 9.5)
    CONSTRAINT audit_logs_action_chk     CHECK (action ~ '^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$'),
    CONSTRAINT audit_logs_staff_actor_chk CHECK (actor_type <> 'STAFF' OR actor_staff_id IS NOT NULL),
    CONSTRAINT audit_logs_aal_chk        CHECK (aal IS NULL OR aal IN ('aal1', 'aal2'))
);

CREATE INDEX audit_logs_occurred_at_idx ON audit.audit_logs (occurred_at);
CREATE INDEX audit_logs_entity_idx      ON audit.audit_logs (entity_type, entity_id, occurred_at);
CREATE INDEX audit_logs_actor_idx       ON audit.audit_logs (actor_staff_id, occurred_at);
CREATE INDEX audit_logs_action_idx      ON audit.audit_logs (action, occurred_at);
-- ประวัติการแก้ไขของลูกค้ารายหนึ่ง (แท็บ Customer 360 · anonymize แทนค่า before/after ของลูกค้านั้น ข้อ 10.4)
CREATE INDEX audit_logs_customer_idx    ON audit.audit_logs ((coalesce(after ->> 'customer_id', before ->> 'customer_id')))
    WHERE coalesce(after ->> 'customer_id', before ->> 'customer_id') IS NOT NULL;

COMMENT ON TABLE audit.audit_logs IS
'บันทึกการเปลี่ยนแปลงข้อมูลธุรกิจ append-only (ข้อ 9.5 · A32 · B21) · เขียนโดย audit.log_row_change() และ RPC (action เชิงความหมาย เช่น EXPORT_REQUESTED · SETTINGS_UPDATED) · '
'อ่านผ่าน api.search_audit (audit.read) · api.get_entity_history (customer.update บนลูกค้า) · api.search_security_log (security_log.read) เท่านั้น · '
'เก็บ 5 ปี ลบโดย role audit_retention (ข้อ 10.3) · หมายเหตุผู้เขียน: ไม่มี FK ไปตารางอื่นเพื่อให้ log คงอยู่อิสระจากข้อมูลต้นทาง';
COMMENT ON COLUMN audit.audit_logs.occurred_at IS 'เวลาที่บันทึก (now() ของทรานแซกชัน)';
COMMENT ON COLUMN audit.audit_logs.organization_id IS 'องค์กรของแถวที่เปลี่ยน (หรือของผู้กระทำ เมื่อแถวไม่มี organization_id เช่น ref.*)';
COMMENT ON COLUMN audit.audit_logs.actor_type IS 'STAFF (app.current_staff_id() ไม่ว่าง) · SYSTEM (งานตามเวลา/สคริปต์) · INTEGRATION · กำหนดทับได้ด้วย set_config(''app.actor_type'', …, true)';
COMMENT ON COLUMN audit.audit_logs.actor_staff_id IS 'staff ผู้กระทำ (บังคับเมื่อ actor_type = STAFF)';
COMMENT ON COLUMN audit.audit_logs.actor_staff_code IS 'ST-NNNN ของผู้กระทำ ณ เวลาบันทึก';
COMMENT ON COLUMN audit.audit_logs.actor_label IS 'ป้ายผู้กระทำ เช่น "คุณขวัญ" · "SYSTEM:close_stale_visits" (งานระบบตั้ง app.actor_label)';
COMMENT ON COLUMN audit.audit_logs.actor_roles IS 'รหัสบทบาทที่ผู้กระทำถืออยู่ ณ เวลาบันทึก (assignment ที่ valid_from ≤ now() < valid_to)';
COMMENT ON COLUMN audit.audit_logs.aal IS 'aal ของ JWT (aal1/aal2) · NULL = ไม่มี JWT';
COMMENT ON COLUMN audit.audit_logs.action IS
'{ENTITY}_{VERB} (ข้อ 9.5) · trigger ใช้ {ENTITY}_CREATED/_UPDATED/_DELETED และชื่อเชิงความหมาย: CUSTOMER_MERGED · CUSTOMER_ANONYMIZED · CUSTOMER_TAG_REMOVED · CONSENT_RECORDED · '
'LEAD_ASSIGNED · OPPORTUNITY_ASSIGNED · TASK_ASSIGNED · OPPORTUNITY_WON · ROLE_GRANTED · ROLE_REVOKED · ROLE_GRANT_REQUESTED · ROLE_GRANT_DECIDED · PERMISSION_CHANGED · '
'STAFF_INVITED · STAFF_UPDATED · STAFF_DISABLED · DSR_CREATED · DSR_COMPLETED';
COMMENT ON COLUMN audit.audit_logs.entity_type IS 'ชื่อตารางเต็ม schema.table เช่น crm.customer_contacts · security_log.read ไม่คืนแถวที่ entity_type เป็นตารางลูกค้า (crm.customer%)';
COMMENT ON COLUMN audit.audit_logs.entity_id IS 'id ของแถว (text: uuid หรือ code ของ ref หรือ role_code:permission_code)';
COMMENT ON COLUMN audit.audit_logs.entity_ref IS 'เลขอ้างอิงที่แสดง: เลขของแถวเอง (CUS-/LD-/OP-/QT-/TK-/V-/RG-/DSR-/MG-/EX-/ST-) มิฉะนั้นเลขของแถวแม่ (ลูกค้า · visit · lead · opportunity · quotation · task · staff) หรือ code';
COMMENT ON COLUMN audit.audit_logs.branch_id IS 'สาขาของแถว (ถ้ามีคอลัมน์ branch_id)';
COMMENT ON COLUMN audit.audit_logs.before IS
'ภาพแถวก่อนเปลี่ยน (UPDATE/DELETE) ทั้งแถว · คอลัมน์ pii เป็น {"masked","sha256"} · app.anonymize_customer แทนทั้งค่าเป็น "[ANONYMIZED]" ภายใต้ app.audit_redaction = on';
COMMENT ON COLUMN audit.audit_logs.after IS 'ภาพแถวหลังเปลี่ยน (INSERT/UPDATE) ทั้งแถว · กติกา pii เดียวกับ before';
COMMENT ON COLUMN audit.audit_logs.changed_fields IS 'คอลัมน์ที่ค่าเปลี่ยน (UPDATE เท่านั้น · เรียงตามชื่อ)';
COMMENT ON COLUMN audit.audit_logs.reason IS 'เหตุผลที่ RPC ส่ง (set_config(''app.audit_reason'', …, true)) · หมายเหตุผู้เขียน: ชื่อ setting ตั้งโดยผู้เขียน';
COMMENT ON COLUMN audit.audit_logs.ip IS 'header x-client-ip ที่ Next.js ส่งต่อ (ค่าที่รายงาน ไม่ใช่หลักฐาน)';
COMMENT ON COLUMN audit.audit_logs.user_agent IS 'header x-client-ua';
COMMENT ON COLUMN audit.audit_logs.device_id IS 'header x-device-id';
COMMENT ON COLUMN audit.audit_logs.request_id IS 'header x-request-id';


-- =====================================================================================
-- ส่วนที่ 2 — audit.access_logs (ข้อ 6.4 · 6.5 · 6.6 · 6.8 · 9.5)
-- =====================================================================================

CREATE TABLE audit.access_logs (
    id                bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at       timestamptz NOT NULL DEFAULT now(),
    organization_id   uuid,
    actor_staff_id    uuid,
    actor_staff_code  text,
    actor_roles       text[]      NOT NULL DEFAULT '{}',
    aal               text,
    action            text        NOT NULL,
    customer_id       uuid,
    contact_id        uuid,
    visit_id          uuid,
    branch_id         uuid,
    purpose           text,
    search_hashes     text[],
    result_count      integer,
    detail            jsonb,
    ip                text,
    user_agent        text,
    device_id         text,
    request_id        text,

    CONSTRAINT access_logs_action_chk CHECK (action IN (
        'CUSTOMER_VIEWED', 'CONTACT_REVEALED', 'CUSTOMER_CANDIDATE_SEARCH', 'CUSTOMER_SEARCH', 'CUSTOMER_LINKED_TO_BRANCH')),
    -- p_purpose ของ api.reveal_contact (ข้อ 6.4)
    CONSTRAINT access_logs_purpose_chk CHECK (purpose IS NULL OR purpose IN ('VIEW', 'CALL', 'COPY', 'LINE_OPEN')),
    CONSTRAINT access_logs_reveal_chk  CHECK (action <> 'CONTACT_REVEALED' OR (contact_id IS NOT NULL AND purpose IS NOT NULL)),
    -- เก็บ sha256(ค่า normalized) เป็น hex 64 ตัว ไม่เก็บค่าจริง (ข้อ 6.5)
    CONSTRAINT access_logs_hashes_chk  CHECK (search_hashes IS NULL OR cardinality(search_hashes) = 0
                                              OR array_to_string(search_hashes, ',') ~ '^[0-9a-f]{64}(,[0-9a-f]{64})*$'),
    CONSTRAINT access_logs_aal_chk     CHECK (aal IS NULL OR aal IN ('aal1', 'aal2')),
    CONSTRAINT access_logs_count_chk   CHECK (result_count IS NULL OR result_count >= 0)
);

CREATE INDEX access_logs_occurred_at_idx ON audit.access_logs (occurred_at);
CREATE INDEX access_logs_actor_idx       ON audit.access_logs (actor_staff_id, action, occurred_at);
CREATE INDEX access_logs_customer_idx    ON audit.access_logs (customer_id, occurred_at) WHERE customer_id IS NOT NULL;

COMMENT ON TABLE audit.access_logs IS
'บันทึกการเข้าถึงข้อมูลลูกค้า append-only (ข้อ 9.5): CUSTOMER_VIEWED (api.get_customer_360) · CONTACT_REVEALED (api.reveal_contact เขียนก่อนคืนค่า) · '
'CUSTOMER_CANDIDATE_SEARCH · CUSTOMER_SEARCH · CUSTOMER_LINKED_TO_BRANCH · ไม่เก็บค่า PII (เก็บ contact_id/hash) · เป็นฐานของตัวนับอัตรา security.* · เก็บ 1 ปี · '
'หมายเหตุผู้เขียน: CANONICAL ระบุเฉพาะ action และ "เก็บ contact_id/hash" ผู้เขียนออกแบบคอลัมน์อื่นให้สอดคล้อง audit_logs';
COMMENT ON COLUMN audit.access_logs.action IS 'CUSTOMER_VIEWED · CONTACT_REVEALED · CUSTOMER_CANDIDATE_SEARCH · CUSTOMER_SEARCH · CUSTOMER_LINKED_TO_BRANCH';
COMMENT ON COLUMN audit.access_logs.customer_id IS 'ลูกค้าที่ถูกเข้าถึง/ผูก (ถ้ามี)';
COMMENT ON COLUMN audit.access_logs.contact_id IS 'crm.customer_contacts.id ที่ถูกเปิดค่าเต็ม (บังคับเมื่อ CONTACT_REVEALED)';
COMMENT ON COLUMN audit.access_logs.visit_id IS 'visit ที่ใช้ตรวจซ้ำ/ผูกสาขา (CUSTOMER_CANDIDATE_SEARCH · CUSTOMER_LINKED_TO_BRANCH)';
COMMENT ON COLUMN audit.access_logs.branch_id IS 'สาขาที่เกี่ยวข้อง (เช่น สาขาที่ผูก)';
COMMENT ON COLUMN audit.access_logs.purpose IS 'VIEW · CALL · COPY · LINE_OPEN (บังคับเมื่อ CONTACT_REVEALED)';
COMMENT ON COLUMN audit.access_logs.search_hashes IS 'sha256 hex ของค่า normalized ที่ใช้ค้น (เบอร์/LINE/อีเมล/IMEI) · ห้ามเก็บค่าจริงหรือคำค้นชื่อ';
COMMENT ON COLUMN audit.access_logs.result_count IS 'จำนวนผลลัพธ์ (0 = ค้นไม่พบ · ใช้นับ security.search_miss_per_hour)';
COMMENT ON COLUMN audit.access_logs.detail IS 'ข้อมูลประกอบที่ไม่มี PII เช่น {"scores":[100,40]}';


-- =====================================================================================
-- ส่วนที่ 3 — audit.login_events (ข้อ 9.2 "บันทึก" · แหล่งเดียวของเหตุการณ์ล็อกอิน)
-- =====================================================================================

CREATE TABLE audit.login_events (
    id               bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at      timestamptz NOT NULL DEFAULT now(),
    organization_id  uuid,
    user_id          uuid,
    staff_id         uuid,
    event_type       text        NOT NULL,
    method           text,
    success          boolean     NOT NULL,
    failure_reason   text,
    identifier_hash  text,
    aal              text,
    ip               text,
    user_agent       text,
    device_id        text,
    request_id       text,
    detail           jsonb,

    CONSTRAINT login_events_event_type_chk CHECK (event_type ~ '^[A-Z][A-Z0-9_]*$'),
    CONSTRAINT login_events_method_chk     CHECK (method IS NULL OR method ~ '^[A-Z][A-Z0-9_]*$'),
    CONSTRAINT login_events_hash_chk       CHECK (identifier_hash IS NULL OR identifier_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT login_events_aal_chk        CHECK (aal IS NULL OR aal IN ('aal1', 'aal2'))
);

CREATE INDEX login_events_occurred_at_idx ON audit.login_events (occurred_at);
CREATE INDEX login_events_user_idx        ON audit.login_events (user_id, occurred_at);
CREATE INDEX login_events_identifier_idx  ON audit.login_events (identifier_hash, occurred_at) WHERE identifier_hash IS NOT NULL;

COMMENT ON TABLE audit.login_events IS
'เหตุการณ์ล็อกอินทั้งหมด (password · SSO · MFA · refresh · lockout) แหล่งเดียว (ข้อ 9.2) · เขียนโดย Auth hook / Edge Function (service_role ผ่าน RPC ภายใน) · append-only · เก็บ 1 ปี · '
'ip/device_id เป็นข้อมูลประกอบ ห้ามใช้ตัดสินสิทธิ์ · อ่านผ่าน api.search_security_log (security_log.read) · '
'หมายเหตุผู้เขียน: CANONICAL ไม่ระบุคอลัมน์และชุดรหัสเหตุการณ์ ผู้เขียนออกแบบ event_type/method เป็นข้อความรูปแบบ A–Z_ (ชุดค่ารอยืนยัน)';
COMMENT ON COLUMN audit.login_events.user_id IS 'auth.users.id (NULL เมื่อระบุผู้ใช้ไม่ได้ เช่น รหัสผ่านผิดกับบัญชีที่ไม่มีอยู่)';
COMMENT ON COLUMN audit.login_events.staff_id IS 'core.staff_profiles.id ที่ผูก user_id (ถ้ามี)';
COMMENT ON COLUMN audit.login_events.event_type IS 'ชนิดเหตุการณ์ รูปแบบ A–Z_ (ครอบคลุม password · SSO · MFA · refresh · lockout ตามข้อ 9.2 · ชุดค่ารอยืนยัน)';
COMMENT ON COLUMN audit.login_events.method IS 'วิธียืนยันตัวตน รูปแบบ A–Z_ (เช่น อีเมล+รหัสผ่าน · staff_code · Google · Microsoft · TOTP · ชุดค่ารอยืนยัน)';
COMMENT ON COLUMN audit.login_events.success IS 'สำเร็จหรือไม่';
COMMENT ON COLUMN audit.login_events.failure_reason IS 'สาเหตุภายใน (ไม่แสดงผู้ใช้ · ข้อความผิดพลาดต่อผู้ใช้เหมือนกันทุกกรณี)';
COMMENT ON COLUMN audit.login_events.identifier_hash IS 'sha256 hex ของตัวระบุที่กรอก (อีเมล lower หรือ ST-NNNN) ใช้นับการเข้าผิดตาม (บัญชี, IP) โดยไม่เก็บค่าจริง';


-- =====================================================================================
-- ส่วนที่ 4 — audit.export_requests (ข้อ 8.2 · 13.14)
-- =====================================================================================

CREATE TABLE audit.export_requests (
    id                  uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid                NOT NULL REFERENCES core.organizations (id),
    export_no           text                NOT NULL UNIQUE,
    requested_by        uuid                NOT NULL REFERENCES core.staff_profiles (id),
    requested_as_role   text                NOT NULL REFERENCES core.roles (code),
    requested_at        timestamptz         NOT NULL DEFAULT now(),
    branch_ids          uuid[]              NOT NULL DEFAULT '{}',
    reason_code         text                NOT NULL REFERENCES ref.export_reasons (code),
    reason_note         text,
    filter              jsonb               NOT NULL DEFAULT '{}'::jsonb,
    row_count           integer,
    status              audit.export_status NOT NULL DEFAULT 'REQUESTED',
    approved_by         uuid                REFERENCES core.staff_profiles (id),
    decided_at          timestamptz,
    decision_note       text,
    generated_at        timestamptz,
    file_path           text,
    file_deleted_at     timestamptz,
    download_count      integer             NOT NULL DEFAULT 0,
    last_downloaded_at  timestamptz,
    expired_at          timestamptz,
    created_at          timestamptz         NOT NULL DEFAULT now(),
    created_by          uuid                REFERENCES core.staff_profiles (id),
    updated_at          timestamptz         NOT NULL DEFAULT now(),
    updated_by          uuid                REFERENCES core.staff_profiles (id),

    CONSTRAINT export_requests_no_chk              CHECK (export_no ~ '^EX-[0-9]{4}-[0-9]{6,}$'),
    -- บทบาทที่ยื่นได้ตามตารางข้อ 8.2
    CONSTRAINT export_requests_role_chk            CHECK (requested_as_role IN ('BRANCH_MANAGER', 'MARKETING', 'BUSINESS_ADMIN', 'EXECUTIVE')),
    -- ผู้อนุมัติ ≠ ผู้ขอ (ข้อ 8.2 · ตรึง)
    CONSTRAINT export_requests_approver_chk        CHECK (approved_by <> requested_by),
    CONSTRAINT export_requests_filter_chk          CHECK (jsonb_typeof(filter) = 'object'),
    CONSTRAINT export_requests_reason_note_chk     CHECK (reason_code <> 'OTHER' OR (reason_note IS NOT NULL AND btrim(reason_note) <> '')),
    CONSTRAINT export_requests_row_count_chk       CHECK (row_count IS NULL OR row_count >= 0),
    CONSTRAINT export_requests_download_count_chk  CHECK (download_count >= 0),
    CONSTRAINT export_requests_decided_chk         CHECK ((approved_by IS NULL OR decided_at IS NOT NULL)
                                                          AND (status <> 'APPROVED' OR approved_by IS NOT NULL)
                                                          AND (status <> 'REJECTED' OR decided_at IS NOT NULL)),
    CONSTRAINT export_requests_generated_chk       CHECK (status NOT IN ('GENERATED', 'DOWNLOADED', 'EXPIRED') OR generated_at IS NOT NULL),
    CONSTRAINT export_requests_downloaded_chk      CHECK (status <> 'DOWNLOADED' OR download_count >= 1),
    CONSTRAINT export_requests_expired_chk         CHECK (status <> 'EXPIRED' OR expired_at IS NOT NULL)
);

CREATE INDEX export_requests_requested_by_idx ON audit.export_requests (requested_by, requested_at);
CREATE INDEX export_requests_status_idx       ON audit.export_requests (status, requested_at);

COMMENT ON TABLE audit.export_requests IS
'คำขอส่งออกข้อมูลลูกค้า (ข้อ 8.2 · D25 export_logs) · ยื่น/ตัดสิน/ดาวน์โหลดผ่าน api.request_export · api.decide_export · api.record_export_download · สร้างไฟล์โดย generate-export → app.build_export_dataset · '
'เพดาน/ผู้อนุมัติตาม app.settings[export.limits] ของ requested_as_role · BRANCH_MANAGER ไม่ต้องอนุมัติ (เกินเพดาน = REJECTED) · app.job_expire_exports → EXPIRED และลบไฟล์ (download_count คงไว้) · '
'ตาราง workflow: ไม่ติด audit.deny_change · ไม่มี GRANT ให้ authenticated/service_role';
COMMENT ON COLUMN audit.export_requests.export_no IS 'เลขคำขอ EX-{YYYY}-{NNNNNN} ตัวนับ EX:{YYYY} (ข้อ 6.1) · ใช้ในลายน้ำและชื่อไฟล์';
COMMENT ON COLUMN audit.export_requests.requested_by IS 'ผู้ขอ · ตอนสร้างไฟล์ต้องยัง ACTIVE และมี customer.export';
COMMENT ON COLUMN audit.export_requests.requested_as_role IS 'บทบาทที่ยื่น (BRANCH_MANAGER · MARKETING · BUSINESS_ADMIN · EXECUTIVE) · กำหนดเพดาน ผู้อนุมัติ และคอลัมน์ที่ได้';
COMMENT ON COLUMN audit.export_requests.branch_ids IS 'ขอบเขตสาขาที่บันทึกตอนยื่น (ตรวจซ้ำตอนสร้างไฟล์) · ว่าง = ระดับองค์กร';
COMMENT ON COLUMN audit.export_requests.reason_code IS 'เหตุผล (ref.export_reasons) · is_marketing = true → กรองเฉพาะลูกค้าที่ยินยอม MARKETING ทุกบทบาท';
COMMENT ON COLUMN audit.export_requests.reason_note IS 'หมายเหตุ (บังคับเมื่อ OTHER)';
COMMENT ON COLUMN audit.export_requests.filter IS 'ตัวกรองรายการลูกค้าที่บันทึกตอนยื่น (jsonb object) · ห้ามมีค่า PII';
COMMENT ON COLUMN audit.export_requests.row_count IS 'จำนวนแถวที่คาด/ที่สร้าง (ตัวอย่าง EX-2026-000031 = 1,850)';
COMMENT ON COLUMN audit.export_requests.status IS 'REQUESTED · APPROVED · REJECTED · GENERATED · DOWNLOADED · EXPIRED';
COMMENT ON COLUMN audit.export_requests.approved_by IS
'ผู้ตัดสินตามกติกาผู้อนุมัติของ requested_as_role (ทั้งอนุมัติและปฏิเสธ) · ≠ requested_by · หมายเหตุผู้เขียน: ใช้คอลัมน์เดียวตามชื่อใน CHECK ของข้อ 8.2';
COMMENT ON COLUMN audit.export_requests.decided_at IS 'เวลาตัดสิน (อนุมัติ/ปฏิเสธ · รวมการปฏิเสธอัตโนมัติเมื่อเกินเพดาน)';
COMMENT ON COLUMN audit.export_requests.generated_at IS 'เวลาสร้างไฟล์ · ดาวน์โหลดได้ภายใน export.link_ttl_hours (24) ชม. หลังเวลานี้';
COMMENT ON COLUMN audit.export_requests.file_path IS 'path ใน Supabase Storage bucket private (signed URL 60 วินาที)';
COMMENT ON COLUMN audit.export_requests.file_deleted_at IS 'เวลาที่ลบไฟล์แล้ว';
COMMENT ON COLUMN audit.export_requests.download_count IS 'จำนวนครั้งดาวน์โหลด (< export.max_downloads (3) จึงดาวน์โหลดได้อีก) · คงไว้หลัง EXPIRED';
COMMENT ON COLUMN audit.export_requests.expired_at IS 'เวลาที่เปลี่ยนเป็น EXPIRED';


-- =====================================================================================
-- ส่วนที่ 5 — audit.integration_logs (ข้อ 9.5 · 9.8 · Phase 4)
-- =====================================================================================

CREATE TABLE audit.integration_logs (
    id                  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at         timestamptz NOT NULL DEFAULT now(),
    organization_id     uuid,
    source_system_code  text        NOT NULL,
    direction           text        NOT NULL,
    operation           text        NOT NULL,
    status              text        NOT NULL,
    http_status         integer,
    external_ref        text,
    error_message       text,
    payload_sha256      text,
    actor_label         text,
    request_id          text,
    detail              jsonb,

    CONSTRAINT integration_logs_direction_chk CHECK (direction IN ('INBOUND', 'OUTBOUND')),
    CONSTRAINT integration_logs_status_chk    CHECK (status IN ('SUCCESS', 'FAILED')),
    CONSTRAINT integration_logs_hash_chk      CHECK (payload_sha256 IS NULL OR payload_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX integration_logs_occurred_at_idx ON audit.integration_logs (occurred_at);
CREATE INDEX integration_logs_source_idx      ON audit.integration_logs (source_system_code, occurred_at);

COMMENT ON TABLE audit.integration_logs IS
'บันทึกการรับ/ส่งข้อมูลกับระบบภายนอก (Edge Functions integration-* · Phase 4) append-only · ไม่เก็บ payload ที่มี PII (เก็บ sha256) · '
'หมายเหตุผู้เขียน: CANONICAL ระบุชื่อตารางเท่านั้น คอลัมน์และชุดค่า direction (INBOUND/OUTBOUND) status (SUCCESS/FAILED) ออกแบบโดยผู้เขียน [รอยืนยัน]';
COMMENT ON COLUMN audit.integration_logs.source_system_code IS 'รหัสระบบต้นทาง/ปลายทาง (ค่าใน ref.source_systems)';
COMMENT ON COLUMN audit.integration_logs.operation IS 'ชื่อการทำงาน เช่น ดึงธุรกรรม POS';
COMMENT ON COLUMN audit.integration_logs.payload_sha256 IS 'sha256 hex ของ payload (ไม่เก็บ payload จริง)';


-- =====================================================================================
-- ส่วนที่ 6 — helper: ผู้กระทำ · seed mode · PII
-- =====================================================================================

-- app.current_staff_id() ตามข้อ 9.3 · migration ของ stage 3 แทนที่ได้ด้วย CREATE OR REPLACE (signature เดิม)
CREATE OR REPLACE FUNCTION app.current_staff_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT s.id
    FROM core.staff_profiles s
    WHERE s.user_id = auth.uid()
      AND s.status = 'ACTIVE'
$$;

COMMENT ON FUNCTION app.current_staff_id() IS
'uuid ของ staff ACTIVE ที่ผูก auth.uid() · ไม่มี → NULL (ข้อ 9.3) · helper ของ policy (GRANT EXECUTE ให้ authenticated) · ใช้เป็น actor ของ audit และ changed_by ของประวัติสถานะ';

GRANT EXECUTE ON FUNCTION app.current_staff_id() TO authenticated;

CREATE FUNCTION app.is_seed_mode()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT coalesce(current_setting('app.seed_mode', true), '') = 'on'
       AND coalesce(nullif(current_setting('role', true), ''), 'none') = 'none'
       AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles r
                   WHERE r.rolname = session_user AND (r.rolsuper OR r.rolname = 'postgres'))
$$;

COMMENT ON FUNCTION app.is_seed_mode() IS
'true เมื่อ app.seed_mode = on และทำงานโดย role เจ้าของฐานข้อมูลโดยตรง (ข้อ 13.0 ข้อ 7 "มีผลเฉพาะ current_user = postgres") · ใช้ข้าม audit trigger และการสร้าง notification · '
'หมายเหตุผู้เขียน: ตรวจ session_user (postgres หรือ superuser — PGlite ใช้ web_user ที่เป็น superuser) และต้องไม่ได้ SET ROLE (role = none) · '
'ไม่ใช้ current_user เพราะในฟังก์ชัน SECURITY DEFINER current_user เป็น owner เสมอ · ผู้ใช้ PostgREST (session_user = authenticator · role = authenticated) จึงตั้ง seed_mode เพื่อข้าม audit ไม่ได้';

CREATE FUNCTION app.pii_columns()
RETURNS TABLE (table_schema text, table_name text, column_name text, description text)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT n.nspname::text, c.relname::text, a.attname::text, d.description
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c       ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n   ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_description d ON d.objoid = a.attrelid AND d.objsubid = a.attnum
                                    AND d.classoid = 'pg_catalog.pg_class'::pg_catalog.regclass
    WHERE n.nspname IN ('crm', 'core', 'ref')
      AND c.relkind IN ('r', 'p')
      AND a.attnum > 0 AND NOT a.attisdropped
      AND d.description LIKE '[pii]%'
    ORDER BY 1, 2, a.attnum
$$;

COMMENT ON FUNCTION app.pii_columns() IS
'รายการคอลัมน์ป้าย pii (ข้อ 9.5 · 10.1) = คอลัมน์ใน crm/core/ref ที่ COMMENT ขึ้นต้นด้วย "[pii]" — แหล่งเดียวกับ data dictionary (tools/db/gen-data-dictionary.mjs) · '
'ใช้โดย audit.log_row_change() (ปิดบัง + hash) และผู้เขียน app.anonymize_customer (ล้างค่า ข้อ 10.4) · เพิ่มคอลัมน์ pii = ใส่ COMMENT ''[pii] …'' ใน migration';

CREATE FUNCTION app.mask_pii_text(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
    v text := btrim(p_value);
BEGIN
    IF v IS NULL OR v = '' THEN
        RETURN v;
    END IF;
    -- ทั้งค่าเป็นเบอร์โทรไทยที่ถูกต้อง → รูปแบบข้อ 6.4 (081-XXX-5678)
    IF v ~ '^[0-9+() .-]+$' AND app.is_valid_thai_phone(v) THEN
        RETURN app.mask_contact('PHONE'::crm.contact_type, v);
    END IF;
    -- ทั้งค่าเป็นอีเมล → s***@example.com
    IF v ~ '^[^@[:space:]]+@[^@[:space:]]+$' THEN
        RETURN app.mask_contact('EMAIL'::crm.contact_type, v);
    END IF;
    -- ข้อความอื่น: อักษรแรก + ***
    RETURN left(v, 1) || '***';
END;
$$;

COMMENT ON FUNCTION app.mask_pii_text(text) IS
'ค่าปิดบังของข้อความ pii ทั่วไปใน audit (ข้อ 9.5): เบอร์ไทยทั้งค่า → รูปแบบข้อ 6.4 · อีเมลทั้งค่า → s***@โดเมน · อื่น ๆ → อักษรแรก + *** · '
'หมายเหตุผู้เขียน: CANONICAL ให้ตัวอย่างเฉพาะเบอร์ ("081-XXX-1234") รูปแบบของข้อความอื่นกำหนดโดยผู้เขียน';

CREATE FUNCTION audit.pii_json(p_value jsonb, p_contact_type text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
    v_text    text;
    v_masked  text;
    v_hashed  text;
BEGIN
    IF p_value IS NULL OR jsonb_typeof(p_value) = 'null' THEN
        RETURN 'null'::jsonb;
    END IF;
    v_text := CASE WHEN jsonb_typeof(p_value) = 'string' THEN p_value #>> '{}' ELSE p_value::text END;

    IF p_contact_type IS NOT NULL THEN
        -- ช่องทางติดต่อ: mask ตามชนิด · hash ของค่า normalized (เทียบกับ access_logs ได้ ข้อ 6.5)
        v_masked := app.mask_contact(p_contact_type::crm.contact_type, v_text);
        v_hashed := coalesce(app.normalize_contact(p_contact_type::crm.contact_type, v_text), v_text);
    ELSIF jsonb_typeof(p_value) = 'string' THEN
        v_masked := app.mask_pii_text(v_text);
        v_hashed := v_text;
    ELSE
        v_masked := '***';
        v_hashed := v_text;
    END IF;

    RETURN jsonb_build_object('masked', v_masked,
                              'sha256', encode(sha256(convert_to(v_hashed, 'UTF8')), 'hex'));
END;
$$;

COMMENT ON FUNCTION audit.pii_json(jsonb, text) IS
'แปลงค่าคอลัมน์ pii เป็น {"masked": …, "sha256": …} (ข้อ 9.5) · NULL → null · p_contact_type (ของ crm.customer_contacts) → mask ตาม app.mask_contact และ hash ค่า normalized · '
'ข้อความอื่น → app.mask_pii_text + sha256 ของข้อความ · jsonb/ตัวเลข → "***" + sha256 ของ text · hash ไม่มี salt ใช้เทียบค่าเท่ากันได้ จึงอ่านได้เฉพาะผู้มี audit.read';

CREATE FUNCTION audit.entity_code(p_table_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT upper(CASE
        WHEN p_table_name = 'staff_profiles'        THEN 'staff'
        WHEN p_table_name = 'data_subject_requests' THEN 'dsr'
        WHEN p_table_name ~ 'ies$'                  THEN regexp_replace(p_table_name, 'ies$', 'y')
        WHEN p_table_name ~ '(ss|ch|sh|x)es$'       THEN regexp_replace(p_table_name, 'es$', '')
        WHEN p_table_name ~ 's$'                    THEN regexp_replace(p_table_name, 's$', '')
        ELSE p_table_name
    END)
$$;

COMMENT ON FUNCTION audit.entity_code(text) IS
'ชื่อ ENTITY ของ action {ENTITY}_{VERB} จากชื่อตาราง (เอกพจน์ ตัวพิมพ์ใหญ่): customers → CUSTOMER · customer_contacts → CUSTOMER_CONTACT · opportunities → OPPORTUNITY · '
'customer_addresses → CUSTOMER_ADDRESS · branches → BRANCH · staff_profiles → STAFF · data_subject_requests → DSR (ตามชื่อ action ในข้อ 9.5)';


-- =====================================================================================
-- ส่วนที่ 7 — audit.deny_change() (ข้อ 9.5)
-- =====================================================================================

CREATE FUNCTION audit.deny_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'TRUNCATE' THEN
        RAISE EXCEPTION 'audit: ห้าม TRUNCATE %.% (append-only · ข้อ 9.5)', TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'DELETE' THEN
        -- งาน retention: SET ROLE audit_retention แล้ว DELETE (ข้อ 9.5 · 10.3)
        IF current_user = 'audit_retention' THEN
            RETURN OLD;
        END IF;
        RAISE EXCEPTION 'audit: ห้ามลบแถวใน %.% (ลบได้เฉพาะ role audit_retention · ข้อ 9.5)', TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = '42501';
    END IF;

    -- UPDATE: อนุญาตเฉพาะ audit_logs คอลัมน์ before/after เมื่อ app.audit_redaction = on (app.anonymize_customer ข้อ 10.4)
    IF TG_TABLE_SCHEMA = 'audit' AND TG_TABLE_NAME = 'audit_logs'
       AND coalesce(current_setting('app.audit_redaction', true), '') = 'on'
       AND (to_jsonb(NEW) - 'before' - 'after') = (to_jsonb(OLD) - 'before' - 'after') THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'audit: ห้ามแก้แถวใน %.% (append-only · แก้ได้เฉพาะ before/after ของ audit_logs เมื่อ app.audit_redaction = on)', TG_TABLE_SCHEMA, TG_TABLE_NAME
        USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION audit.deny_change() IS
'trigger BEFORE UPDATE/DELETE (ต่อแถว) และ BEFORE TRUNCATE (ต่อคำสั่ง) ของตาราง log ใน audit (ข้อ 9.5): ปฏิเสธด้วย SQLSTATE 42501 ยกเว้น '
'(1) DELETE เมื่อ current_user = ''audit_retention'' (2) UPDATE ของ audit.audit_logs ที่เปลี่ยนเฉพาะ before/after เมื่อ app.audit_redaction = ''on'' · '
'SECURITY INVOKER เพื่อให้ current_user เป็น role ที่สั่งจริง · สำเนา prod เพื่อทดสอบ (tools/db/anonymize.sql) ต้อง ALTER TABLE … DISABLE TRIGGER ก่อน TRUNCATE ในฐานะ owner';

CREATE TRIGGER trg_deny_change   BEFORE UPDATE OR DELETE ON audit.audit_logs       FOR EACH ROW       EXECUTE FUNCTION audit.deny_change();
CREATE TRIGGER trg_deny_truncate BEFORE TRUNCATE         ON audit.audit_logs       FOR EACH STATEMENT EXECUTE FUNCTION audit.deny_change();
CREATE TRIGGER trg_deny_change   BEFORE UPDATE OR DELETE ON audit.access_logs      FOR EACH ROW       EXECUTE FUNCTION audit.deny_change();
CREATE TRIGGER trg_deny_truncate BEFORE TRUNCATE         ON audit.access_logs      FOR EACH STATEMENT EXECUTE FUNCTION audit.deny_change();
CREATE TRIGGER trg_deny_change   BEFORE UPDATE OR DELETE ON audit.login_events     FOR EACH ROW       EXECUTE FUNCTION audit.deny_change();
CREATE TRIGGER trg_deny_truncate BEFORE TRUNCATE         ON audit.login_events     FOR EACH STATEMENT EXECUTE FUNCTION audit.deny_change();
CREATE TRIGGER trg_deny_change   BEFORE UPDATE OR DELETE ON audit.integration_logs FOR EACH ROW       EXECUTE FUNCTION audit.deny_change();
CREATE TRIGGER trg_deny_truncate BEFORE TRUNCATE         ON audit.integration_logs FOR EACH STATEMENT EXECUTE FUNCTION audit.deny_change();

CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON audit.export_requests FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();


-- =====================================================================================
-- ส่วนที่ 8 — สิทธิ์ของตาราง audit (ข้อ 1.1 · 9.4 · 9.5)
-- =====================================================================================

-- ไม่มี GRANT ใด ๆ ให้ PUBLIC anon authenticated service_role (อ่านผ่าน RPC DEFINER เท่านั้น)
REVOKE ALL ON audit.audit_logs, audit.access_logs, audit.login_events, audit.export_requests, audit.integration_logs
    FROM PUBLIC, anon, authenticated, service_role;

-- REVOKE UPDATE/DELETE/TRUNCATE จากทุก role รวม owner · owner ได้คืนเฉพาะ UPDATE (before, after) ของ audit_logs สำหรับ anonymize (DEFINER)
DO $$
BEGIN
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON audit.audit_logs, audit.access_logs, audit.login_events, audit.integration_logs FROM %I', current_user);
    EXECUTE format('GRANT UPDATE (before, after) ON audit.audit_logs TO %I', current_user);
END;
$$;

-- งาน retention (ข้อ 10.3)
GRANT SELECT, DELETE ON audit.audit_logs, audit.access_logs, audit.login_events, audit.integration_logs TO audit_retention;


-- =====================================================================================
-- ส่วนที่ 9 — audit.log_row_change() (ข้อ 9.5)
-- =====================================================================================

CREATE FUNCTION audit.log_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    -- UPDATE ที่เปลี่ยนเฉพาะคอลัมน์เหล่านี้ไม่บันทึก (ข้อ 9.5 + แคชของข้อ 6.3 ที่ trigger ปรับ — หมายเหตุผู้เขียนใน COMMENT)
    c_ignored   constant text[] := ARRAY['updated_at', 'updated_by', 'last_activity_at', 'lifecycle_stage', 'first_seen_at', 'note_summary',
                                         'last_channel_code', 'last_branch_id', 'has_open_followup', 'has_new_lead'];
    c_no_cols   constant text[] := ARRAY['customer_no', 'lead_no', 'opportunity_no', 'quotation_no', 'task_no', 'visit_no',
                                         'request_no', 'merge_no', 'export_no', 'staff_code'];
    v_table      text := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
    v_old        jsonb;
    v_new        jsonb;
    v_row        jsonb;
    v_changed    text[];
    v_pii        text[];
    v_col        text;
    v_is_contact boolean := (TG_TABLE_SCHEMA = 'crm' AND TG_TABLE_NAME = 'customer_contacts');
    v_entity     text;
    v_action     text;
    v_ref        text;
    v_staff_id   uuid;
    v_staff_code text;
    v_staff_name text;
    v_staff_org  uuid;
    v_roles      text[] := '{}';
    v_actor_type audit.actor_type;
    v_label      text;
    v_hdr_text   text;
    v_headers    jsonb;
BEGIN
    -- seed ข้าม audit (ข้อ 13.0 ข้อ 7)
    IF app.is_seed_mode() THEN
        RETURN NULL;
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old := to_jsonb(OLD); END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN v_new := to_jsonb(NEW); END IF;
    v_row := coalesce(v_new, v_old);

    IF TG_OP = 'UPDATE' THEN
        SELECT coalesce(array_agg(k ORDER BY k), '{}') INTO v_changed
        FROM jsonb_object_keys(v_new) AS k
        WHERE (v_new -> k) IS DISTINCT FROM (v_old -> k);
        IF v_changed <@ c_ignored THEN
            RETURN NULL;                                   -- ไม่มีการเปลี่ยน หรือเปลี่ยนเฉพาะคอลัมน์ที่ข้าม
        END IF;
    END IF;

    -- ---------- action · entity ----------
    v_entity := audit.entity_code(TG_TABLE_NAME);
    v_action := v_entity || '_' || CASE TG_OP WHEN 'INSERT' THEN 'CREATED' WHEN 'UPDATE' THEN 'UPDATED' ELSE 'DELETED' END;

    IF v_table = 'core.role_permissions' THEN
        v_action := 'PERMISSION_CHANGED';
    ELSIF v_table = 'core.staff_role_assignments' THEN
        IF TG_OP = 'INSERT' THEN
            v_action := 'ROLE_GRANTED';
        ELSIF TG_OP = 'UPDATE' AND 'valid_to' = ANY (v_changed) AND (v_new ->> 'valid_to') IS NOT NULL THEN
            v_action := 'ROLE_REVOKED';
        END IF;
    ELSIF v_table = 'core.role_grant_requests' THEN
        IF TG_OP = 'INSERT' THEN
            v_action := 'ROLE_GRANT_REQUESTED';
        ELSIF TG_OP = 'UPDATE' AND 'status' = ANY (v_changed) THEN
            v_action := 'ROLE_GRANT_DECIDED';
        END IF;
    ELSIF v_table = 'core.staff_profiles' THEN
        IF TG_OP = 'INSERT' THEN
            v_action := 'STAFF_INVITED';
        ELSIF TG_OP = 'UPDATE' AND 'status' = ANY (v_changed) AND v_new ->> 'status' = 'DISABLED' THEN
            v_action := 'STAFF_DISABLED';
        END IF;
    ELSIF v_table = 'crm.customers' AND TG_OP = 'UPDATE' AND 'record_status' = ANY (v_changed) THEN
        IF v_new ->> 'record_status' = 'MERGED' THEN
            v_action := 'CUSTOMER_MERGED';
        ELSIF v_new ->> 'record_status' = 'ANONYMIZED' THEN
            v_action := 'CUSTOMER_ANONYMIZED';
        END IF;
    ELSIF v_table = 'crm.customer_tags' AND TG_OP = 'DELETE' THEN
        v_action := 'CUSTOMER_TAG_REMOVED';
    ELSIF v_table = 'crm.customer_consents' AND TG_OP = 'INSERT' THEN
        v_action := 'CONSENT_RECORDED';
    ELSIF v_table = 'crm.data_subject_requests' AND TG_OP = 'UPDATE'
          AND 'status' = ANY (v_changed) AND v_new ->> 'status' = 'COMPLETED' THEN
        v_action := 'DSR_COMPLETED';
    ELSIF v_table IN ('crm.leads', 'crm.opportunities', 'crm.tasks') AND TG_OP = 'UPDATE' THEN
        IF v_table = 'crm.opportunities' AND 'stage' = ANY (v_changed) AND v_new ->> 'stage' = 'WON' THEN
            v_action := 'OPPORTUNITY_WON';
        ELSIF 'owner_staff_id' = ANY (v_changed) THEN
            v_action := v_entity || '_ASSIGNED';
        END IF;
    END IF;

    -- ---------- ปิดบังคอลัมน์ pii (COMMENT ขึ้นต้น [pii]) ----------
    SELECT coalesce(array_agg(a.attname::text), '{}') INTO v_pii
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_description d ON d.objoid = a.attrelid AND d.objsubid = a.attnum
                                    AND d.classoid = 'pg_catalog.pg_class'::pg_catalog.regclass
    WHERE a.attrelid = TG_RELID AND a.attnum > 0 AND NOT a.attisdropped
      AND d.description LIKE '[pii]%';

    FOREACH v_col IN ARRAY v_pii LOOP
        IF v_old ? v_col THEN
            v_old := jsonb_set(v_old, ARRAY[v_col],
                audit.pii_json(v_old -> v_col, CASE WHEN v_is_contact THEN v_old ->> 'contact_type' END));
        END IF;
        IF v_new ? v_col THEN
            v_new := jsonb_set(v_new, ARRAY[v_col],
                audit.pii_json(v_new -> v_col, CASE WHEN v_is_contact THEN v_new ->> 'contact_type' END));
        END IF;
    END LOOP;

    -- ---------- เลขอ้างอิงที่แสดง ----------
    FOREACH v_col IN ARRAY c_no_cols LOOP
        v_ref := v_row ->> v_col;
        EXIT WHEN v_ref IS NOT NULL;
    END LOOP;
    IF v_ref IS NULL AND (v_row ->> 'customer_id') IS NOT NULL THEN
        SELECT c.customer_no INTO v_ref FROM crm.customers c WHERE c.id = (v_row ->> 'customer_id')::uuid;
    END IF;
    IF v_ref IS NULL AND (v_row ->> 'visit_id') IS NOT NULL THEN
        SELECT x.visit_no INTO v_ref FROM crm.visits x WHERE x.id = (v_row ->> 'visit_id')::uuid;
    END IF;
    IF v_ref IS NULL AND (v_row ->> 'lead_id') IS NOT NULL THEN
        SELECT x.lead_no INTO v_ref FROM crm.leads x WHERE x.id = (v_row ->> 'lead_id')::uuid;
    END IF;
    IF v_ref IS NULL AND (v_row ->> 'opportunity_id') IS NOT NULL THEN
        SELECT x.opportunity_no INTO v_ref FROM crm.opportunities x WHERE x.id = (v_row ->> 'opportunity_id')::uuid;
    END IF;
    IF v_ref IS NULL AND (v_row ->> 'quotation_id') IS NOT NULL THEN
        SELECT x.quotation_no INTO v_ref FROM crm.quotations x WHERE x.id = (v_row ->> 'quotation_id')::uuid;
    END IF;
    IF v_ref IS NULL AND (v_row ->> 'task_id') IS NOT NULL THEN
        SELECT x.task_no INTO v_ref FROM crm.tasks x WHERE x.id = (v_row ->> 'task_id')::uuid;
    END IF;
    IF v_ref IS NULL AND (v_row ->> 'staff_id') IS NOT NULL THEN
        SELECT x.staff_code INTO v_ref FROM core.staff_profiles x WHERE x.id = (v_row ->> 'staff_id')::uuid;
    END IF;
    v_ref := coalesce(v_ref, v_row ->> 'external_no', v_row ->> 'code');

    -- ---------- ผู้กระทำ ----------
    v_staff_id := app.current_staff_id();
    IF v_staff_id IS NOT NULL THEN
        SELECT s.staff_code, s.display_name, s.organization_id INTO v_staff_code, v_staff_name, v_staff_org
        FROM core.staff_profiles s WHERE s.id = v_staff_id;
        SELECT coalesce(array_agg(DISTINCT a.role_code ORDER BY a.role_code), '{}') INTO v_roles
        FROM core.staff_role_assignments a
        WHERE a.staff_id = v_staff_id AND a.valid_from <= now() AND (a.valid_to IS NULL OR a.valid_to > now());
    END IF;

    v_actor_type := CASE
        WHEN current_setting('app.actor_type', true) = 'INTEGRATION' THEN 'INTEGRATION'
        WHEN current_setting('app.actor_type', true) = 'SYSTEM'      THEN 'SYSTEM'
        WHEN v_staff_id IS NOT NULL                                  THEN 'STAFF'
        ELSE 'SYSTEM'
    END::audit.actor_type;

    v_label := coalesce(nullif(current_setting('app.actor_label', true), ''),
                        CASE WHEN v_actor_type = 'STAFF' THEN v_staff_name
                             ELSE v_actor_type::text || ':' || coalesce(nullif(current_setting('role', true), 'none'), session_user::text)
                        END);

    -- ---------- header ที่ Next.js ส่งต่อ (ค่าที่รายงาน) ----------
    v_hdr_text := nullif(current_setting('request.headers', true), '');
    IF v_hdr_text IS NOT NULL THEN
        BEGIN
            v_headers := v_hdr_text::jsonb;
        EXCEPTION WHEN OTHERS THEN
            v_headers := NULL;
        END;
    END IF;

    INSERT INTO audit.audit_logs (
        occurred_at, organization_id, actor_type, actor_staff_id, actor_staff_code, actor_label, actor_roles, aal,
        action, entity_type, entity_id, entity_ref, branch_id, before, after, changed_fields, reason,
        ip, user_agent, device_id, request_id)
    VALUES (
        now(),
        coalesce((v_row ->> 'organization_id')::uuid, v_staff_org),
        v_actor_type, v_staff_id, v_staff_code, v_label, v_roles,
        CASE WHEN auth.jwt() ->> 'aal' IN ('aal1', 'aal2') THEN auth.jwt() ->> 'aal' END,
        v_action, v_table,
        coalesce(v_row ->> 'id', v_row ->> 'code', (v_row ->> 'role_code') || ':' || (v_row ->> 'permission_code')),
        v_ref,
        CASE WHEN v_table = 'core.branches' THEN (v_row ->> 'id')::uuid ELSE (v_row ->> 'branch_id')::uuid END,
        v_old, v_new, v_changed,
        nullif(current_setting('app.audit_reason', true), ''),
        v_headers ->> 'x-client-ip', v_headers ->> 'x-client-ua', v_headers ->> 'x-device-id', v_headers ->> 'x-request-id');

    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION audit.log_row_change() IS
'trigger AFTER INSERT/UPDATE/DELETE ต่อแถว (ข้อ 9.5 · SECURITY DEFINER · ไม่ GRANT) · ข้ามเมื่อ app.is_seed_mode() · '
'UPDATE ที่เปลี่ยนเฉพาะ updated_at updated_by last_activity_at lifecycle_stage first_seen_at note_summary ไม่บันทึก '
'(หมายเหตุผู้เขียน: รวมแคชอีก 4 คอลัมน์ของข้อ 6.3 last_channel_code last_branch_id has_open_followup has_new_lead เพราะเป็นแคชชุดเดียวกับ last_activity_at ที่ trigger ปรับ) · '
'before/after = ภาพทั้งแถว (to_jsonb) โดยคอลัมน์ pii เป็น {"masked","sha256"} · changed_fields = คอลัมน์ที่เปลี่ยน (UPDATE) · '
'ผู้กระทำ: app.current_staff_id() → STAFF มิฉะนั้น SYSTEM (RPC/งานระบบตั้ง app.actor_type = SYSTEM|INTEGRATION และ app.actor_label ได้) · aal จาก auth.jwt() · '
'ip/user_agent/device_id/request_id จาก request.headers คีย์ x-client-ip x-client-ua x-device-id x-request-id · reason จาก app.audit_reason';


-- =====================================================================================
-- ส่วนที่ 10 — ติด audit trigger ทุกตาราง crm core ref ยกเว้นข้อ 9.5
-- =====================================================================================

DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT n.nspname, c.relname
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('crm', 'core', 'ref')
          AND c.relkind IN ('r', 'p')
          AND (n.nspname || '.' || c.relname) NOT IN
              ('crm.notifications', 'crm.lead_status_history', 'crm.opportunity_stage_history',
               'crm.ownership_changes', 'crm.customer_branches')
        ORDER BY n.nspname, c.relname
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_audit_row_change AFTER INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION audit.log_row_change()',
            r.nspname, r.relname);
    END LOOP;
END;
$$;
