-- =====================================================================================
-- JAUN CRM · Customer 360
-- migration 0005 : crm — กิจกรรม: visits · interactions · transaction_refs
-- target        : Supabase PostgreSQL 17
--
-- ค่าอ้างอิง (docs/00-brief/CANONICAL.md v2.1):
--   ข้อ 3.1 activity event · 3.3 Visit กับ Interaction · 4.1 crm.visit_status · 4.2 ref.visit_outcomes
--   ข้อ 5.6 ref.interaction_types · 5.7 ref.transaction_types/source_systems · 6.1 visit_no/queue_no
--   ข้อ 6.5 IMEI 15 หลัก · 6.10 คอลัมน์หลัก (ตรึง) + index บังคับ · 10.1 ข้อความอิสระ (guard ใน 0009)
--
-- ข้อตกลง:
--   · ทุกตารางมี id · organization_id · created_at · created_by · updated_at · updated_by
--   · เลขอ้างอิง/ตัวนับ ตั้งโดย app.trg_assign_running_number (0009) · ผู้เขียนแถวไม่ต้องส่ง visit_no/queue_no
--   · CHECK ในไฟล์นี้เป็น "ข้อเท็จจริงของแถว" · การเปลี่ยนสถานะที่ต้องมีสิทธิ์อยู่ใน app.enforce_row_transition (stage 3)
--   · FK ไป crm.leads / crm.opportunities เพิ่มใน 0006 (ตารางยังไม่มี)
--   · COMMENT ที่ขึ้นต้น "[pii]" = คอลัมน์ป้าย pii (audit บันทึกแบบ masked+sha256 · anonymize ล้าง)
-- =====================================================================================


-- =====================================================================================
-- ส่วนที่ 1 — crm.visits (ข้อ 3.3 · 4.1 · 4.2 · 6.10)
-- =====================================================================================

CREATE TABLE crm.visits (
    id                  uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid             NOT NULL REFERENCES core.organizations (id),
    visit_no            text             NOT NULL UNIQUE,
    branch_id           uuid             NOT NULL REFERENCES core.branches (id),
    team_id             uuid             REFERENCES core.teams (id),
    channel_code        text             NOT NULL REFERENCES ref.channels (code),
    status              crm.visit_status NOT NULL DEFAULT 'WAITING',
    queue_no            integer,
    party_size          integer          NOT NULL DEFAULT 1,
    customer_id         uuid             REFERENCES crm.customers (id),
    interest_code       text             REFERENCES ref.interest_types (code),
    source_code         text             REFERENCES ref.sources (code),
    started_at          timestamptz      NOT NULL DEFAULT now(),
    service_started_at  timestamptz,
    ended_at            timestamptz,
    owner_staff_id      uuid             REFERENCES core.staff_profiles (id),
    outcome_code        text             REFERENCES ref.visit_outcomes (code),
    cancel_reason       text,
    closed_by_system    boolean          NOT NULL DEFAULT false,
    created_at          timestamptz      NOT NULL DEFAULT now(),
    created_by          uuid             REFERENCES core.staff_profiles (id),
    updated_at          timestamptz      NOT NULL DEFAULT now(),
    updated_by          uuid             REFERENCES core.staff_profiles (id),

    -- ใช้เป็นเป้าของ FK (visit_id, branch_id) จาก crm.interactions: interaction ต้องอยู่สาขาเดียวกับ visit (ข้อ 8.0)
    CONSTRAINT visits_id_branch_uq UNIQUE (id, branch_id),

    CONSTRAINT visits_visit_no_chk
        CHECK (visit_no ~ '^V-[A-Z0-9]+-[0-9]{6}-[0-9]{3,}$'),
    CONSTRAINT visits_party_size_chk
        CHECK (party_size >= 1),
    -- queue_no มีเฉพาะ WALK_IN (ข้อ 4.1 · 6.10) · trigger ออกเลขให้ทุก walk-in
    CONSTRAINT visits_queue_no_chk
        CHECK ((channel_code = 'WALK_IN') = (queue_no IS NOT NULL) AND (queue_no IS NULL OR queue_no >= 1)),
    -- interest_code บังคับเมื่อ WALK_IN (ข้อ 6.10)
    CONSTRAINT visits_walk_in_interest_chk
        CHECK (channel_code <> 'WALK_IN' OR interest_code IS NOT NULL),
    -- WAITING = walk-in ในคิว ยังไม่มีผู้รับ (ข้อ 4.1) · visit ออนไลน์/โทรเริ่มที่ IN_SERVICE (ข้อ 3.3)
    CONSTRAINT visits_waiting_chk
        CHECK (status <> 'WAITING' OR (channel_code = 'WALK_IN' AND owner_staff_id IS NULL AND service_started_at IS NULL)),
    -- IN_SERVICE = มีผู้รับแล้ว · WAITING → IN_SERVICE ตั้ง owner และ service_started_at (ข้อ 4.1)
    CONSTRAINT visits_in_service_chk
        CHECK (status <> 'IN_SERVICE' OR (owner_staff_id IS NOT NULL AND service_started_at IS NOT NULL)),
    -- outcome บังคับเมื่อ COMPLETED/LEFT และมีได้เฉพาะสองสถานะนี้ (CANCELLED ไม่นับใน KPI จึงไม่มีผล)
    CONSTRAINT visits_outcome_chk
        CHECK ((status IN ('COMPLETED', 'LEFT')) = (outcome_code IS NOT NULL)),
    -- LEFT ⇔ outcome LEFT_BEFORE_SERVICE (ข้อ 4.1 "อัตโนมัติ" · trigger 0009 เติมให้)
    CONSTRAINT visits_left_outcome_chk
        CHECK ((status = 'LEFT') = (outcome_code IS NOT DISTINCT FROM 'LEFT_BEFORE_SERVICE')),
    -- หมายเหตุผู้เขียน: รายการที่ปิดแล้ว (COMPLETED/LEFT) ต้องมี ended_at · รายการเปิดต้องยังไม่มี
    CONSTRAINT visits_ended_chk
        CHECK ((status NOT IN ('COMPLETED', 'LEFT') OR ended_at IS NOT NULL)
               AND (status NOT IN ('WAITING', 'IN_SERVICE') OR ended_at IS NULL)),
    -- CANCELLED บังคับ cancel_reason (ข้อ 4.1) และมีได้เฉพาะ CANCELLED
    CONSTRAINT visits_cancel_reason_chk
        CHECK ((status = 'CANCELLED') = (cancel_reason IS NOT NULL)
               AND (cancel_reason IS NULL OR btrim(cancel_reason) <> '')),
    -- PURCHASED · FOLLOW_UP ต้องมี customer_id (ข้อ 4.2)
    CONSTRAINT visits_outcome_customer_chk
        CHECK (outcome_code IS NULL OR outcome_code NOT IN ('PURCHASED', 'FOLLOW_UP') OR customer_id IS NOT NULL),
    -- app.job_close_stale_visits ปิดเป็น COMPLETED + UNRECORDED + closed_by_system (ข้อ 4.1 · 4.2)
    CONSTRAINT visits_closed_by_system_chk
        CHECK ((NOT closed_by_system OR status = 'COMPLETED')
               AND (outcome_code IS DISTINCT FROM 'UNRECORDED' OR closed_by_system)),
    CONSTRAINT visits_time_order_chk
        CHECK ((service_started_at IS NULL OR service_started_at >= started_at)
               AND (ended_at IS NULL OR ended_at >= started_at))
);

-- index บังคับ (ข้อ 6.10) + ช่วงเวลา KPI + คิวเปิดของสาขา
CREATE INDEX visits_branch_id_idx       ON crm.visits (branch_id);
CREATE INDEX visits_owner_staff_id_idx  ON crm.visits (owner_staff_id);
CREATE INDEX visits_customer_id_idx     ON crm.visits (customer_id);
CREATE INDEX visits_started_at_idx      ON crm.visits (started_at);
CREATE INDEX visits_branch_started_idx  ON crm.visits (branch_id, started_at);
CREATE INDEX visits_open_idx            ON crm.visits (branch_id, started_at) WHERE status IN ('WAITING', 'IN_SERVICE');
-- เลขคิวไม่ซ้ำภายใน (สาขา, วันธุรกิจ Asia/Bangkok) — ตรงกับตัวนับ QUEUE:{branch}:{YYYYMMDD}
CREATE UNIQUE INDEX visits_queue_no_day_uidx
    ON crm.visits (branch_id, app.bangkok_date(started_at), queue_no) WHERE queue_no IS NOT NULL;

COMMENT ON TABLE crm.visits IS
'การมาติดต่อ 1 ครั้ง ทุกช่องทาง (ข้อ 3.1 · 3.3 · D1) ไม่จำเป็นต้องรู้ตัวตน · สร้างได้ผ่าน api.open_visit / api.quick_capture เท่านั้น ปิดผ่าน api.close_visit '
'(authenticated ไม่มี INSERT ข้อ 9.4 กติกา 6) · visit ที่ไม่ใช่ CANCELLED มี interaction ต้นทาง 1 รายการ (is_visit_root) · '
'Visitor/Traffic = count ที่ status <> CANCELLED ตาม started_at (party_size ใช้แสดงเท่านั้น) · branch_id เปลี่ยนไม่ได้ · '
'การเปลี่ยนสถานะที่อนุญาต (ข้อ 4.1): WAITING→IN_SERVICE · WAITING→LEFT · IN_SERVICE→COMPLETED · WAITING/IN_SERVICE→CANCELLED (บังคับใน app.enforce_row_transition)';
COMMENT ON COLUMN crm.visits.visit_no IS 'เลข visit V-{branch}-{YYMMDD}-{NNN} ตัวนับ VISIT:{branch}:{YYYYMMDD} ทุกช่องทาง · วันจาก started_at Asia/Bangkok (ข้อ 6.1)';
COMMENT ON COLUMN crm.visits.branch_id IS 'สาขาของ visit (บังคับ · เปลี่ยนไม่ได้ ข้อ 4.1) · รายการออนไลน์ที่ยังไม่มอบสาขาอยู่ที่ JPON';
COMMENT ON COLUMN crm.visits.team_id IS 'ทีมของผู้รับ ณ ตอนรับ (snapshot ใช้แสดง/รายงาน ข้อ 7.1)';
COMMENT ON COLUMN crm.visits.channel_code IS 'ช่องทางของการมาติดต่อ (ref.channels) · Walk-in Visit = WALK_IN';
COMMENT ON COLUMN crm.visits.status IS 'WAITING · IN_SERVICE · COMPLETED · LEFT · CANCELLED (ข้อ 4.1)';
COMMENT ON COLUMN crm.visits.queue_no IS
'เลขคิวหน้าร้าน (เฉพาะ WALK_IN) ตัวนับ QUEUE:{branch}:{YYYYMMDD} แยกจาก visit_no (สองเลขไม่จำเป็นต้องเท่ากัน) · แสดง "คิว " || lpad(queue_no::text, 3, ''0'')';
COMMENT ON COLUMN crm.visits.party_size IS 'จำนวนคนที่มาด้วยกัน ≥ 1 (stepper หน้า 07) · ใช้แสดงเท่านั้น ไม่ใช้นับ KPI';
COMMENT ON COLUMN crm.visits.customer_id IS 'ลูกค้าที่ระบุตัวตนได้ · NULL = ยังไม่รู้ตัวตน · Identified Visit = customer_id IS NOT NULL';
COMMENT ON COLUMN crm.visits.interest_code IS 'วัตถุประสงค์หลัก (ชิป 7 ค่า) · บังคับเมื่อ WALK_IN';
COMMENT ON COLUMN crm.visits.source_code IS 'รู้จักร้านจาก (ref.sources) · ไม่บังคับ';
COMMENT ON COLUMN crm.visits.started_at IS 'เวลาเข้าคิว (walk-in) หรือข้อความแรก (ออนไลน์) · ฐานของการนับ VISITS และวันของ visit_no/queue_no';
COMMENT ON COLUMN crm.visits.service_started_at IS 'เวลาเริ่มให้บริการ (WAITING → IN_SERVICE ตั้ง now() · visit ที่เริ่ม IN_SERVICE = started_at)';
COMMENT ON COLUMN crm.visits.ended_at IS 'เวลาปิด visit · job ปิดอัตโนมัติตั้ง 23:59:59 ของวันธุรกิจนั้น (ข้อ 4.1)';
COMMENT ON COLUMN crm.visits.owner_staff_id IS 'ผู้รับ (ว่างได้เมื่อ WAITING) · มิติ "พนักงาน" ของ VISITS (ข้อ 12.4)';
COMMENT ON COLUMN crm.visits.outcome_code IS
'ผลการให้บริการ (ref.visit_outcomes) บังคับเมื่อ COMPLETED/LEFT · ตั้งผ่าน api.close_visit เท่านั้น (คอลัมน์ระบบ ข้อ 9.4) · แก้ได้ภายในวันธุรกิจเดียวกัน';
COMMENT ON COLUMN crm.visits.cancel_reason IS 'เหตุผลการยกเลิก (บังคับเมื่อ CANCELLED · สร้างผิด)';
COMMENT ON COLUMN crm.visits.closed_by_system IS 'true = ปิดโดย app.job_close_stale_visits (COMPLETED + UNRECORDED)';


-- =====================================================================================
-- ส่วนที่ 2 — crm.interactions (ข้อ 3.3 · 5.6 · 6.10)
-- =====================================================================================

CREATE TABLE crm.interactions (
    id                     uuid                      PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        uuid                      NOT NULL REFERENCES core.organizations (id),
    customer_id            uuid                      REFERENCES crm.customers (id),
    visit_id               uuid,
    is_visit_root          boolean                   NOT NULL DEFAULT false,
    lead_id                uuid,                     -- FK → crm.leads (0006)
    opportunity_id         uuid,                     -- FK → crm.opportunities (0006)
    branch_id              uuid                      NOT NULL REFERENCES core.branches (id),
    channel_code           text                      NOT NULL REFERENCES ref.channels (code),
    direction              crm.interaction_direction NOT NULL,
    interaction_type_code  text                      NOT NULL REFERENCES ref.interaction_types (code),
    occurred_at            timestamptz               NOT NULL DEFAULT now(),
    owner_staff_id         uuid                      REFERENCES core.staff_profiles (id),
    summary                text,
    created_at             timestamptz               NOT NULL DEFAULT now(),
    created_by             uuid                      REFERENCES core.staff_profiles (id),
    updated_at             timestamptz               NOT NULL DEFAULT now(),
    updated_by             uuid                      REFERENCES core.staff_profiles (id),

    -- interaction ที่ผูก visit ต้องอยู่สาขาเดียวกับ visit (branch ของทั้งสองเปลี่ยนไม่ได้ ข้อ 4.1 · 9.4.2)
    CONSTRAINT interactions_visit_branch_fkey
        FOREIGN KEY (visit_id, branch_id) REFERENCES crm.visits (id, branch_id),
    -- interaction ต้นทางของ visit: ต้องผูก visit และเป็น INBOUND (OUTBOUND/INTERNAL ไม่สร้าง visit ข้อ 3.3)
    CONSTRAINT interactions_visit_root_chk
        CHECK (NOT is_visit_root OR (visit_id IS NOT NULL AND direction = 'INBOUND')),
    -- NOTE ใช้กับ INTERNAL เท่านั้น (ข้อ 5.6)
    CONSTRAINT interactions_note_internal_chk
        CHECK (interaction_type_code <> 'NOTE' OR direction = 'INTERNAL')
);

-- visit หนึ่งรายการมี interaction ต้นทางได้รายการเดียว (ข้อ 3.3)
CREATE UNIQUE INDEX interactions_visit_root_uidx ON crm.interactions (visit_id) WHERE is_visit_root;
CREATE INDEX interactions_branch_id_idx        ON crm.interactions (branch_id);
CREATE INDEX interactions_owner_staff_id_idx   ON crm.interactions (owner_staff_id);
CREATE INDEX interactions_customer_id_idx      ON crm.interactions (customer_id, occurred_at DESC);
CREATE INDEX interactions_occurred_at_idx      ON crm.interactions (occurred_at);
CREATE INDEX interactions_visit_id_idx         ON crm.interactions (visit_id) WHERE visit_id IS NOT NULL;
CREATE INDEX interactions_lead_id_idx          ON crm.interactions (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX interactions_opportunity_id_idx   ON crm.interactions (opportunity_id) WHERE opportunity_id IS NOT NULL;

COMMENT ON TABLE crm.interactions IS
'ประวัติการติดต่อ (timeline Customer 360 · ข้อ 3.3 · 6.10) · INBOUND บนช่องทางอื่นที่ไม่ใช่ WALK_IN แนบ visit ช่องทางเดียวกันที่ยังไม่ปิดในวันธุรกิจเดียวกัน มิฉะนั้น RPC เปิด visit ใหม่ · '
'OUTBOUND/INTERNAL ไม่สร้าง visit · "ติดต่อ N ครั้ง" = count(direction <> INTERNAL) · interaction OUTBOUND แรกเปลี่ยน lead NEW → CONTACTED (trigger 0009) · '
'แก้ได้ภายใน 24 ชม. หลังสร้าง (ตัดสินด้วย now()) · เปลี่ยน owner/branch ไม่ได้ (ข้อ 9.4.2)';
COMMENT ON COLUMN crm.interactions.customer_id IS 'ลูกค้า (NULL ได้เมื่อ visit ยังไม่รู้ตัวตน)';
COMMENT ON COLUMN crm.interactions.visit_id IS 'visit ที่ interaction นี้อยู่ (ถ้ามี) · สาขาต้องตรงกับ visit (FK คู่ visit_id, branch_id)';
COMMENT ON COLUMN crm.interactions.is_visit_root IS 'true = interaction ต้นทางของ visit (1 รายการต่อ visit) · outcome PURCHASED → ประเภท PURCHASE (ข้อ 3.3) · คอลัมน์ระบบ';
COMMENT ON COLUMN crm.interactions.lead_id IS 'lead ที่เกี่ยวข้อง (ถ้ามี)';
COMMENT ON COLUMN crm.interactions.opportunity_id IS 'opportunity ที่เกี่ยวข้อง (ถ้ามี) · ใช้กับ OPPORTUNITY_STALE (ข้อ 11.1)';
COMMENT ON COLUMN crm.interactions.channel_code IS 'ช่องทางของการติดต่อ · last_channel_code ของลูกค้า = ช่องทางของ interaction ล่าสุดที่ไม่ใช่ INTERNAL';
COMMENT ON COLUMN crm.interactions.direction IS 'INBOUND · OUTBOUND · INTERNAL';
COMMENT ON COLUMN crm.interactions.interaction_type_code IS 'ประเภท (ref.interaction_types) · NOTE ใช้กับ INTERNAL เท่านั้น';
COMMENT ON COLUMN crm.interactions.occurred_at IS 'เวลาที่เกิดการติดต่อ (activity event ข้อ 3.1)';
COMMENT ON COLUMN crm.interactions.owner_staff_id IS 'พนักงานผู้ติดต่อ/บันทึก';
COMMENT ON COLUMN crm.interactions.summary IS '[pii] สรุปการติดต่อ (ข้อความอิสระ) · ผ่าน app.trg_guard_restricted_text · anonymize ล้างค่า (ข้อ 10.4)';


-- FK ที่ 0004 รอไว้: โน้ตที่บันทึกประกอบ interaction
ALTER TABLE crm.customer_notes
    ADD CONSTRAINT customer_notes_interaction_id_fkey FOREIGN KEY (interaction_id) REFERENCES crm.interactions (id);


-- =====================================================================================
-- ส่วนที่ 3 — crm.transaction_refs (ข้อ 5.7 · 6.10)
-- =====================================================================================

CREATE TABLE crm.transaction_refs (
    id                     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        uuid          NOT NULL REFERENCES core.organizations (id),
    customer_id            uuid          NOT NULL REFERENCES crm.customers (id),
    branch_id              uuid          NOT NULL REFERENCES core.branches (id),
    opportunity_id         uuid,                         -- FK → crm.opportunities (0006)
    transaction_type_code  text          NOT NULL REFERENCES ref.transaction_types (code),
    source_system_code     text          NOT NULL REFERENCES ref.source_systems (code),
    external_no            text          NOT NULL,
    transacted_at          timestamptz   NOT NULL,
    amount                 numeric(12,2),
    device_imei            text,
    device_serial          text,
    summary                jsonb,
    created_at             timestamptz   NOT NULL DEFAULT now(),
    created_by             uuid          REFERENCES core.staff_profiles (id),
    updated_at             timestamptz   NOT NULL DEFAULT now(),
    updated_by             uuid          REFERENCES core.staff_profiles (id),

    CONSTRAINT transaction_refs_source_external_uq UNIQUE (source_system_code, external_no),
    CONSTRAINT transaction_refs_external_no_chk    CHECK (btrim(external_no) <> ''),
    -- IMEI 15 หลัก (ข้อ 6.5) · ค้นแบบตรงทั้งค่า
    CONSTRAINT transaction_refs_imei_chk           CHECK (device_imei IS NULL OR device_imei ~ '^[0-9]{15}$'),
    CONSTRAINT transaction_refs_summary_chk        CHECK (summary IS NULL OR jsonb_typeof(summary) = 'object')
);

CREATE INDEX transaction_refs_branch_id_idx      ON crm.transaction_refs (branch_id);
CREATE INDEX transaction_refs_customer_id_idx    ON crm.transaction_refs (customer_id, transacted_at DESC);
CREATE INDEX transaction_refs_created_by_idx     ON crm.transaction_refs (created_by);
CREATE INDEX transaction_refs_opportunity_id_idx ON crm.transaction_refs (opportunity_id) WHERE opportunity_id IS NOT NULL;
CREATE INDEX transaction_refs_transacted_at_idx  ON crm.transaction_refs (transacted_at);
CREATE INDEX transaction_refs_external_no_idx    ON crm.transaction_refs (external_no);
CREATE INDEX transaction_refs_device_imei_idx    ON crm.transaction_refs (device_imei) WHERE device_imei IS NOT NULL;

COMMENT ON TABLE crm.transaction_refs IS
'เลขอ้างอิงธุรกรรมจากระบบต้นทาง (ข้อ 5.7 · 6.10 · D25 รวม transactions/transaction_items/payment_references/service_references) · V1 ผูกด้วยมือ (transaction.link · source_system_code = MANUAL) · '
'เหตุการณ์การซื้อ = ref ที่ transaction_types.counts_as_purchase และ (opportunity_id IS NULL หรือ opportunity นั้นไม่ใช่ WON) (ข้อ 3.1) · '
'ไม่มีบทบาทใดส่งออก summary หรือ IMEI (ข้อ 8.2) · หมายเหตุผู้เขียน: ตารางนี้ไม่มี owner_staff_id ใน CANONICAL จึงใช้ created_by แทน owner ในการประเมิน scope OWN';
COMMENT ON COLUMN crm.transaction_refs.customer_id IS 'ลูกค้าเจ้าของธุรกรรม (บังคับ)';
COMMENT ON COLUMN crm.transaction_refs.branch_id IS 'สาขาของธุรกรรม (บังคับ)';
COMMENT ON COLUMN crm.transaction_refs.opportunity_id IS 'opportunity ที่ปิดการขายนี้ (ถ้ามี) · ref ที่ผูก opportunity WON นับเป็นการซื้อครั้งเดียวกับ opportunity';
COMMENT ON COLUMN crm.transaction_refs.transaction_type_code IS 'ประเภทธุรกรรม (ref.transaction_types)';
COMMENT ON COLUMN crm.transaction_refs.source_system_code IS 'ระบบต้นทาง (ref.source_systems) · UNIQUE คู่กับ external_no';
COMMENT ON COLUMN crm.transaction_refs.external_no IS 'เลขธุรกรรม/ใบเสร็จ/สัญญาในระบบต้นทาง · ค้นแบบตรงทั้งค่า (ข้อ 6.5) · แท็บเอกสาร Customer 360 แสดงเลขสัญญาจากคอลัมน์นี้';
COMMENT ON COLUMN crm.transaction_refs.transacted_at IS 'เวลาธุรกรรม (activity event ข้อ 3.1)';
COMMENT ON COLUMN crm.transaction_refs.amount IS 'จำนวนเงิน (บาท) · ยอดซื้อสะสมรวม amount ของ ref ที่นับเป็นการซื้อและไม่ได้ผูก opportunity WON (ข้อ 3.3) · หมายเหตุผู้เขียน: เครื่องหมายของ REFUND ไม่กำหนดใน CANONICAL (รอยืนยัน)';
COMMENT ON COLUMN crm.transaction_refs.device_imei IS '[pii] IMEI 15 หลัก · anonymize ล้างค่า (ข้อ 10.4)';
COMMENT ON COLUMN crm.transaction_refs.device_serial IS '[pii] Serial number ของเครื่อง · anonymize ล้างค่า';
COMMENT ON COLUMN crm.transaction_refs.summary IS '[pii] สรุปธุรกรรม (jsonb object) · anonymize ล้างค่า';


-- =====================================================================================
-- ส่วนที่ 4 — updated_at trigger · RLS (policy/grant อยู่ใน migration ของ stage 3)
-- =====================================================================================

CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.visits           FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.interactions     FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.transaction_refs FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE crm.visits           ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.interactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.transaction_refs ENABLE ROW LEVEL SECURITY;
