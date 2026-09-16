-- =====================================================================================
-- JAUN CRM · Customer 360
-- migration 0007 : crm — งาน: tasks · task_comments · notifications
-- target        : Supabase PostgreSQL 17
--
-- ค่าอ้างอิง (docs/00-brief/CANONICAL.md v2.1):
--   ข้อ 3.5 ป้าย "ติดตามอยู่" · 4.4 next action เป็นแหล่งจริงของงานติดตาม (unique partial index)
--   ข้อ 4.7 crm.task_status · ref.task_types · ref.priorities · remind_at · กลุ่ม "วันนี้/เกินกำหนด"
--   ข้อ 6.1 TK-{YYYY}-{NNNNNN} · 6.10 คอลัมน์หลัก · 8.3 task_comments/notifications · 10.1 ข้อความอิสระ
--   ข้อ 11.1 รหัสการแจ้งเตือน · dedupe_key · UNIQUE(recipient_staff_id, dedupe_key)
-- =====================================================================================


-- =====================================================================================
-- ส่วนที่ 1 — crm.tasks (ข้อ 4.4 · 4.7 · 6.10 · D7 รวม followups/reminders)
-- =====================================================================================

CREATE TABLE crm.tasks (
    id               uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid            NOT NULL REFERENCES core.organizations (id),
    task_no          text            NOT NULL UNIQUE,
    task_type_code   text            NOT NULL REFERENCES ref.task_types (code),
    title            text            NOT NULL,
    description      text,
    customer_id      uuid            REFERENCES crm.customers (id),
    lead_id          uuid            REFERENCES crm.leads (id),
    opportunity_id   uuid            REFERENCES crm.opportunities (id),
    branch_id        uuid            NOT NULL REFERENCES core.branches (id),
    owner_staff_id   uuid            REFERENCES core.staff_profiles (id),
    team_id          uuid            REFERENCES core.teams (id),
    status           crm.task_status NOT NULL DEFAULT 'OPEN',
    priority_code    text            NOT NULL DEFAULT 'NORMAL' REFERENCES ref.priorities (code),
    due_at           timestamptz     NOT NULL,
    remind_at        timestamptz,
    completed_at     timestamptz,
    cancelled_at     timestamptz,
    is_next_action   boolean         NOT NULL DEFAULT false,
    created_at       timestamptz     NOT NULL DEFAULT now(),
    created_by       uuid            REFERENCES core.staff_profiles (id),
    updated_at       timestamptz     NOT NULL DEFAULT now(),
    updated_by       uuid            REFERENCES core.staff_profiles (id),

    CONSTRAINT tasks_task_no_chk   CHECK (task_no ~ '^TK-[0-9]{4}-[0-9]{6,}$'),
    CONSTRAINT tasks_title_chk     CHECK (btrim(title) <> ''),
    -- DONE ⇔ completed_at · CANCELLED ⇔ cancelled_at (ข้อ 4.7 · trigger 0009 เติม/ล้างให้เมื่อเปลี่ยนสถานะ)
    CONSTRAINT tasks_done_chk      CHECK ((status = 'DONE') = (completed_at IS NOT NULL)),
    CONSTRAINT tasks_cancelled_chk CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL)),
    -- task next action ผูกแม่หนึ่งรายการพอดี: lead หรือ opportunity (ข้อ 4.4)
    CONSTRAINT tasks_next_action_parent_chk
        CHECK (NOT is_next_action OR ((lead_id IS NOT NULL) <> (opportunity_id IS NOT NULL))),
    -- remind_at ค่าเริ่มต้น = due_at − 15 นาที (ข้อ 4.7) · ต้องไม่หลัง due_at
    CONSTRAINT tasks_remind_chk    CHECK (remind_at IS NULL OR remind_at <= due_at)
);

-- lead/opportunity ที่เปิดอยู่มี task next action ที่ยังไม่ปิดได้ใบเดียว (ข้อ 4.4 · unique partial index)
CREATE UNIQUE INDEX tasks_next_action_lead_uidx
    ON crm.tasks (lead_id) WHERE is_next_action AND status IN ('OPEN', 'IN_PROGRESS');
CREATE UNIQUE INDEX tasks_next_action_opportunity_uidx
    ON crm.tasks (opportunity_id) WHERE is_next_action AND status IN ('OPEN', 'IN_PROGRESS');

CREATE INDEX tasks_branch_id_idx       ON crm.tasks (branch_id);
CREATE INDEX tasks_owner_staff_id_idx  ON crm.tasks (owner_staff_id);
CREATE INDEX tasks_customer_id_idx     ON crm.tasks (customer_id);
CREATE INDEX tasks_lead_id_idx         ON crm.tasks (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX tasks_opportunity_id_idx  ON crm.tasks (opportunity_id) WHERE opportunity_id IS NOT NULL;
CREATE INDEX tasks_open_due_idx        ON crm.tasks (owner_staff_id, due_at) WHERE status IN ('OPEN', 'IN_PROGRESS');
CREATE INDEX tasks_due_at_idx          ON crm.tasks (due_at);

COMMENT ON TABLE crm.tasks IS
'งานที่ต้องติดตาม (ข้อ 4.7 · D7) · follow-up = task_type_code FOLLOW_UP · reminder = remind_at · สิทธิ์ task.read ไม่มี read-through ผ่านลูกค้า (ข้อ 9.4) · '
'task next action (is_next_action = true) สร้าง/อัปเดต/ยกเลิกโดย trigger app.trg_sync_next_action_task ให้ตรงกับ next_action next_action_type_code next_action_at owner_staff_id ของ lead/opportunity · '
'กลุ่มหน้า "งานของวันนี้" (เทียบ app.clock() · วัน Asia/Bangkok): วันนี้ = OPEN/IN_PROGRESS ที่ due_at อยู่ในวันนี้ · เกินกำหนด = OPEN/IN_PROGRESS ที่ due_at ก่อน 00:00 ของวันนี้';
COMMENT ON COLUMN crm.tasks.task_no IS 'เลขงาน TK-{YYYY}-{NNNNNN} ตัวนับ TK:{YYYY} (ข้อ 6.1) · push/email ใช้เลขนี้แทนชื่อลูกค้า';
COMMENT ON COLUMN crm.tasks.task_type_code IS 'ประเภทงาน (ref.task_types) · task next action = next_action_type_code ของแม่';
COMMENT ON COLUMN crm.tasks.title IS '[pii] ชื่องาน (บังคับ) · task next action = next_action ของแม่ · ผ่าน app.trg_guard_restricted_text · anonymize แทนด้วยข้อความคงที่';
COMMENT ON COLUMN crm.tasks.description IS '[pii] รายละเอียดงาน · ผ่าน app.trg_guard_restricted_text · anonymize ล้างค่า';
COMMENT ON COLUMN crm.tasks.customer_id IS 'ลูกค้าที่เกี่ยวข้อง · trigger 0009 เติมจาก lead/opportunity เมื่อว่าง · ใช้ป้าย "ติดตามอยู่" (has_open_followup)';
COMMENT ON COLUMN crm.tasks.lead_id IS 'lead แม่ (ถ้ามี) · task.create ประเมินกับแม่ (ข้อ 8.0)';
COMMENT ON COLUMN crm.tasks.opportunity_id IS 'opportunity แม่ (ถ้ามี)';
COMMENT ON COLUMN crm.tasks.branch_id IS 'สาขาของงาน (บังคับ · = สาขาของแม่) · มิติสาขาของ FOLLOWUP_COMPLETION';
COMMENT ON COLUMN crm.tasks.owner_staff_id IS 'ผู้รับผิดชอบ · ว่างได้ (เช่น disable_staff) · มอบให้คนอื่นต้องมี task.assign';
COMMENT ON COLUMN crm.tasks.team_id IS 'ทีม ณ ตอนมอบงาน (snapshot)';
COMMENT ON COLUMN crm.tasks.status IS 'OPEN · IN_PROGRESS · DONE (completed_at) · CANCELLED (cancelled_at)';
COMMENT ON COLUMN crm.tasks.priority_code IS 'ความสำคัญ (ref.priorities · ค่าเริ่มต้น NORMAL)';
COMMENT ON COLUMN crm.tasks.due_at IS
'กำหนดเสร็จ · หมายเหตุผู้เขียน: บังคับ NOT NULL เพราะกลุ่มวันนี้/เกินกำหนด (ข้อ 4.7) FOLLOWUP_COMPLETION และการแจ้งเตือนทุกข้อใช้ due_at';
COMMENT ON COLUMN crm.tasks.remind_at IS 'เวลาเตือน (FOLLOWUP_DUE) · ค่าเริ่มต้น = due_at − app.settings[sla.followup_remind_min] (15 นาที) ตั้งโดย trigger 0009';
COMMENT ON COLUMN crm.tasks.completed_at IS 'เวลาเสร็จ (มีค่าเมื่อ DONE เท่านั้น) · ตรงเวลา = completed_at ≤ due_at + 24 ชม. (ข้อ 12.2)';
COMMENT ON COLUMN crm.tasks.cancelled_at IS 'เวลายกเลิก (มีค่าเมื่อ CANCELLED เท่านั้น)';
COMMENT ON COLUMN crm.tasks.is_next_action IS 'true = task next action ของ lead/opportunity (คอลัมน์ระบบ · ตั้งโดย trigger) · ต่อแม่มีใบที่ยังไม่ปิดได้ใบเดียว';


-- =====================================================================================
-- ส่วนที่ 2 — crm.task_comments (ข้อ 6.10 · 8.3)
-- =====================================================================================

CREATE TABLE crm.task_comments (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid        NOT NULL REFERENCES core.organizations (id),
    task_id          uuid        NOT NULL REFERENCES crm.tasks (id),
    body             text        NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        REFERENCES core.staff_profiles (id),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid        REFERENCES core.staff_profiles (id),

    CONSTRAINT task_comments_body_chk CHECK (btrim(body) <> '')
);

CREATE INDEX task_comments_task_idx ON crm.task_comments (task_id, created_at);

COMMENT ON TABLE crm.task_comments IS
'ความเห็นในงาน (ข้อ 6.10 · 8.3) · SELECT = task.read บน task · INSERT/UPDATE = task.update บน task · ไม่มี DELETE · body ผ่าน app.trg_guard_restricted_text (ข้อ 10.1)';
COMMENT ON COLUMN crm.task_comments.body IS '[pii] ข้อความความเห็น · anonymize แทนด้วยข้อความคงที่ · หมายเหตุผู้เขียน: ข้อ 10.4 ไม่ระบุคอลัมน์นี้ แต่เป็นข้อความอิสระที่อาจมีชื่อลูกค้า จึงติดป้าย pii';


-- =====================================================================================
-- ส่วนที่ 3 — crm.notifications (ข้อ 11.1)
-- =====================================================================================

CREATE TABLE crm.notifications (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid        NOT NULL REFERENCES core.organizations (id),
    recipient_staff_id  uuid        NOT NULL REFERENCES core.staff_profiles (id),
    code                text        NOT NULL,
    entity_type         text,
    entity_id           uuid,
    entity_ref          text,
    title               text        NOT NULL,
    body                text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    read_at             timestamptz,
    dedupe_key          text        NOT NULL,
    created_by          uuid        REFERENCES core.staff_profiles (id),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    updated_by          uuid        REFERENCES core.staff_profiles (id),

    CONSTRAINT notifications_recipient_dedupe_uq UNIQUE (recipient_staff_id, dedupe_key),
    -- รหัสตามตารางข้อ 11.1 (เพิ่มรหัส = migration)
    CONSTRAINT notifications_code_chk CHECK (code IN (
        'FOLLOWUP_DUE', 'FOLLOWUP_OVERDUE', 'TASK_OVERDUE', 'LEAD_UNASSIGNED', 'LEAD_NOT_CONTACTED',
        'LEAD_ASSIGNED', 'OPPORTUNITY_ASSIGNED', 'TASK_ASSIGNED', 'OPPORTUNITY_STALE', 'DUPLICATE_SUSPECTED',
        'VISITOR_WAITING_LONG', 'VISIT_OUTCOME_MISSING', 'DATA_MISSING', 'EXPORT_APPROVAL_REQUIRED', 'EXPORT_DECIDED',
        'ROLE_GRANT_APPROVAL_REQUIRED', 'REVEAL_LIMIT_EXCEEDED', 'SEARCH_LIMIT_EXCEEDED', 'RETENTION_ANONYMIZE_UPCOMING')),
    -- dedupe_key = '{code}:{entity_id}:{escalation_level}:{วันที่ Asia/Bangkok}' (ข้อ 11.1)
    CONSTRAINT notifications_dedupe_key_chk CHECK (left(dedupe_key, length(code) + 1) = code || ':'),
    CONSTRAINT notifications_title_chk      CHECK (btrim(title) <> ''),
    CONSTRAINT notifications_read_chk       CHECK (read_at IS NULL OR read_at >= created_at)
);

CREATE INDEX notifications_unread_idx    ON crm.notifications (recipient_staff_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX notifications_recipient_idx ON crm.notifications (recipient_staff_id, created_at DESC);
CREATE INDEX notifications_entity_idx    ON crm.notifications (entity_id) WHERE entity_id IS NOT NULL;

COMMENT ON TABLE crm.notifications IS
'การแจ้งเตือนในแอป (ข้อ 11.1) · สร้างโดย trigger (เหตุการณ์ทันที) และ app.job_notifications(p_as_of) ทุก 5 นาที · SELECT = recipient_staff_id = ตน · UPDATE เฉพาะ read_at ของตน (column grant) · '
'ข้อความเต็ม (มีชื่อลูกค้า) อยู่ในตารางนี้เท่านั้น · push/email ใช้ title + entity_ref + deep link · ไม่ถูกบันทึกใน audit (ข้อ 9.5) · seed_mode ข้ามการสร้าง (ข้อ 13.0)';
COMMENT ON COLUMN crm.notifications.recipient_staff_id IS 'ผู้รับ';
COMMENT ON COLUMN crm.notifications.code IS 'รหัสการแจ้งเตือน (ข้อ 11.1) เช่น FOLLOWUP_OVERDUE · LEAD_UNASSIGNED';
COMMENT ON COLUMN crm.notifications.entity_type IS 'ชนิดรายการที่อ้าง (เช่น TASK · LEAD · OPPORTUNITY · VISIT · EXPORT · ROLE_GRANT) · NULL = สรุปรวม (เช่น DUPLICATE_SUSPECTED 18:00)';
COMMENT ON COLUMN crm.notifications.entity_id IS 'id ของรายการที่อ้าง';
COMMENT ON COLUMN crm.notifications.entity_ref IS 'เลขอ้างอิงที่แสดง/ใช้ใน push เช่น TK-2026-012508 · EX-2026-000031 · RG-2026-0003';
COMMENT ON COLUMN crm.notifications.title IS '[pii] หัวข้อ = ป้ายไทยของรหัสตามข้อ 11.1 (เช่น "ติดตามเกินกำหนด") · anonymize ล้าง/แทนค่า (ข้อ 10.4)';
COMMENT ON COLUMN crm.notifications.body IS
'[pii] ข้อความมาตรฐาน "{ชื่อลูกค้า} · {ชื่องาน/รายการ} · {เวลาครบกำหนด}" เช่น "คุณพิมพ์ชนก ศรีสุข · ติดตามใบเสนอราคา iPhone 17 Pro Max · ครบกำหนด 10 ก.ย. 2569 15:00" · anonymize ล้างค่า';
COMMENT ON COLUMN crm.notifications.read_at IS 'เวลาที่อ่าน · NULL = ยังไม่อ่าน (จำนวนบนกระดิ่ง)';
COMMENT ON COLUMN crm.notifications.dedupe_key IS
'{code}:{entity_id}:{escalation_level}:{YYYY-MM-DD Asia/Bangkok} · UNIQUE ต่อผู้รับ ใช้ INSERT … ON CONFLICT DO NOTHING · หมายเหตุผู้เขียน: สรุปที่ไม่มี entity ใช้ส่วน entity_id ว่าง';


-- =====================================================================================
-- ส่วนที่ 4 — updated_at trigger · RLS
-- =====================================================================================

CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.tasks         FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.task_comments FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.notifications FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE crm.tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.notifications ENABLE ROW LEVEL SECURITY;
