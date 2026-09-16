-- =====================================================================================
-- JAUN CRM · Customer 360
-- migration 0006 : crm — การขาย: campaigns · leads · opportunities · quotations · ประวัติสถานะ · ownership_changes
-- target        : Supabase PostgreSQL 17
--
-- ค่าอ้างอิง (docs/00-brief/CANONICAL.md v2.1):
--   ข้อ 4.3 crm.lead_status · 4.4 crm.opportunity_stage + CHECK (ตรึง · SQL ในข้อ 4.4 เป็นข้อบังคับ)
--   ข้อ 4.5 ประวัติสถานะ · 4.6 crm.quotation_status · 5.5 lost_reasons (OTHER บังคับ lost_note)
--   ข้อ 5.10 campaigns + leads.campaign_id · 6.1 เลขอ้างอิง · 6.10 คอลัมน์หลัก (ตรึง) · 9.4.2 ownership_changes · A28
--
-- ข้อตกลง: ทุกตารางมี id · organization_id · created_at · created_by · updated_at · updated_by
--   (ยกเว้นตารางประวัติแบบ append-only ที่มีเฉพาะ created_at) · เลขอ้างอิงตั้งโดย trigger 0009
--   · สถานะ "เปิด" ของ lead = NEW CONTACTED QUALIFIED · ของ opportunity = INTERESTED QUOTATION FOLLOW_UP
-- =====================================================================================


-- =====================================================================================
-- ส่วนที่ 1 — crm.campaigns (ข้อ 5.10)
-- =====================================================================================

CREATE TABLE crm.campaigns (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid        NOT NULL REFERENCES core.organizations (id),
    code             text        NOT NULL,
    name_th          text        NOT NULL,
    channel_code     text        REFERENCES ref.channels (code),
    starts_on        date,
    ends_on          date,
    is_active        boolean     NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        REFERENCES core.staff_profiles (id),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid        REFERENCES core.staff_profiles (id),

    CONSTRAINT campaigns_code_uq     UNIQUE (organization_id, code),
    CONSTRAINT campaigns_code_chk    CHECK (code ~ '^[A-Z0-9_-]+$'),
    CONSTRAINT campaigns_name_chk    CHECK (btrim(name_th) <> ''),
    CONSTRAINT campaigns_period_chk  CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on)
);

COMMENT ON TABLE crm.campaigns IS
'แคมเปญ (ข้อ 5.10 · D25 campaign_sources → channel_code) · V1 ไม่มีหน้าจัดการแคมเปญ: MARKETING/BUSINESS_ADMIN เพิ่มที่หน้า master-data แท็บ "แคมเปญ" (campaign.manage) · '
'campaign_members และหน้าแคมเปญเต็ม = Phase 4 · ห้ามลบ (is_active = false)';
COMMENT ON COLUMN crm.campaigns.code IS 'รหัสแคมเปญ ไม่ซ้ำในองค์กร';
COMMENT ON COLUMN crm.campaigns.name_th IS 'ชื่อแคมเปญ (ข้อมูลระดับ Public เมื่อประกาศแล้ว ข้อ 10.1)';
COMMENT ON COLUMN crm.campaigns.channel_code IS 'ช่องทางหลักของแคมเปญ (ref.channels) · ไม่บังคับ';
COMMENT ON COLUMN crm.campaigns.starts_on IS 'วันเริ่ม (วันที่ Asia/Bangkok)';
COMMENT ON COLUMN crm.campaigns.ends_on IS 'วันสิ้นสุด (รวมวันนี้) · ≥ starts_on';


-- =====================================================================================
-- ส่วนที่ 2 — crm.leads (ข้อ 4.3 · 6.10)
-- =====================================================================================

CREATE TABLE crm.leads (
    id                        uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id           uuid                NOT NULL REFERENCES core.organizations (id),
    lead_no                   text                NOT NULL UNIQUE,
    customer_id               uuid                NOT NULL REFERENCES crm.customers (id),
    branch_id                 uuid                NOT NULL REFERENCES core.branches (id),
    owner_staff_id            uuid                REFERENCES core.staff_profiles (id),
    team_id                   uuid                REFERENCES core.teams (id),
    channel_code              text                NOT NULL REFERENCES ref.channels (code),
    source_code               text                REFERENCES ref.sources (code),
    campaign_id               uuid                REFERENCES crm.campaigns (id),
    visit_id                  uuid                REFERENCES crm.visits (id),
    interest_code             text                NOT NULL REFERENCES ref.interest_types (code),
    product_type_code         text                REFERENCES ref.product_types (code),
    product_model             text,
    interest_level            crm.interest_level,
    status                    crm.lead_status     NOT NULL DEFAULT 'NEW',
    priority_code             text                REFERENCES ref.priorities (code),
    next_action               text,
    next_action_type_code     text                REFERENCES ref.task_types (code),
    next_action_at            timestamptz,
    first_contacted_at        timestamptz,
    closed_at                 timestamptz,
    lost_reason_code          text                REFERENCES ref.lost_reasons (code),
    lost_note                 text,
    converted_opportunity_id  uuid,               -- FK → crm.opportunities (เพิ่มท้ายส่วนที่ 3)
    created_at                timestamptz         NOT NULL DEFAULT now(),
    created_by                uuid                REFERENCES core.staff_profiles (id),
    updated_at                timestamptz         NOT NULL DEFAULT now(),
    updated_by                uuid                REFERENCES core.staff_profiles (id),

    CONSTRAINT leads_lead_no_chk CHECK (lead_no ~ '^LD-[0-9]{4}-[0-9]{6,}$'),

    -- สถานะของ lead ใช้รูปเดียวกับ CHECK ของ opportunities (ข้อ 4.4 ย่อหน้าท้าย):
    --   CONVERTED บังคับ converted_opportunity_id + closed_at · LOST บังคับ lost_reason_code + closed_at ·
    --   สถานะเปิดบังคับ next_action next_action_type_code next_action_at priority_code (owner_staff_id ว่างได้ → LEAD_UNASSIGNED)
    --   และต้องไม่มีค่าของการปิด (reopen ล้าง closed_at lost_reason_code converted_opportunity_id ข้อ 4.3)
    CONSTRAINT leads_status_chk CHECK (CASE status
        WHEN 'CONVERTED' THEN converted_opportunity_id IS NOT NULL AND closed_at IS NOT NULL AND lost_reason_code IS NULL
        WHEN 'LOST'      THEN lost_reason_code IS NOT NULL AND closed_at IS NOT NULL AND converted_opportunity_id IS NULL
        ELSE next_action IS NOT NULL AND next_action_type_code IS NOT NULL AND next_action_at IS NOT NULL
             AND priority_code IS NOT NULL
             AND closed_at IS NULL AND lost_reason_code IS NULL AND converted_opportunity_id IS NULL
    END),
    -- lost_reason OTHER บังคับ lost_note (ข้อ 5.5) · anonymize ต้องแทนด้วยข้อความคงที่ ไม่ใช่ NULL
    CONSTRAINT leads_lost_note_chk
        CHECK (lost_reason_code IS DISTINCT FROM 'OTHER' OR (lost_note IS NOT NULL AND btrim(lost_note) <> '')),
    -- NEW = ยังไม่มีการตอบกลับ (ข้อ 4.3) · การตอบกลับครั้งแรกเกิดหลังสร้าง lead เสมอ
    CONSTRAINT leads_first_contacted_chk
        CHECK ((status <> 'NEW' OR first_contacted_at IS NULL)
               AND (first_contacted_at IS NULL OR first_contacted_at >= created_at)),
    CONSTRAINT leads_next_action_text_chk
        CHECK (next_action IS NULL OR btrim(next_action) <> '')
);

CREATE INDEX leads_branch_id_idx       ON crm.leads (branch_id);
CREATE INDEX leads_owner_staff_id_idx  ON crm.leads (owner_staff_id);
CREATE INDEX leads_customer_id_idx     ON crm.leads (customer_id);
CREATE INDEX leads_created_at_idx      ON crm.leads (created_at);
CREATE INDEX leads_closed_at_idx       ON crm.leads (closed_at) WHERE closed_at IS NOT NULL;
CREATE INDEX leads_open_idx            ON crm.leads (branch_id, status) WHERE status IN ('NEW', 'CONTACTED', 'QUALIFIED');
CREATE INDEX leads_visit_id_idx        ON crm.leads (visit_id) WHERE visit_id IS NOT NULL;
CREATE INDEX leads_campaign_id_idx     ON crm.leads (campaign_id) WHERE campaign_id IS NOT NULL;

COMMENT ON TABLE crm.leads IS
'Lead = การแสดงความสนใจหนึ่งครั้งของลูกค้าที่รู้ตัวตน นับตาม created_at (ข้อ 3.1 · 4.3) · lead ช่องทางสด (ref.channels.is_live: WALK_IN PHONE) เริ่ม CONTACTED และ first_contacted_at = created_at · '
'ช่องทางข้อความเริ่ม NEW แล้วเปลี่ยนเป็น CONTACTED อัตโนมัติเมื่อมี interaction OUTBOUND แรก (trigger 0009) · QUALIFIED → CONTACTED ย้อนได้ · '
'สถานะเปิดใดก็ได้ → CONVERTED (ผ่าน api.convert_lead เท่านั้น) หรือ LOST · ออกจาก CONVERTED/LOST ต้องมี lead.reopen → CONTACTED · '
'ทุกการเปลี่ยนสถานะบันทึก crm.lead_status_history · lead ที่เปิดอยู่มี task is_next_action = true หนึ่งใบ (trigger 0009)';
COMMENT ON COLUMN crm.leads.lead_no IS 'เลข lead LD-{YYYY}-{NNNNNN} ตัวนับ LD:{YYYY} (ข้อ 6.1)';
COMMENT ON COLUMN crm.leads.customer_id IS 'ลูกค้า (บังคับ · lead มีได้เฉพาะลูกค้าที่รู้ตัวตน)';
COMMENT ON COLUMN crm.leads.branch_id IS 'สาขาปัจจุบันของ lead (มิติสาขาของ LEADS ข้อ 12.4) · ย้ายสาขาต้อง lead.assign ทั้งสองฝั่ง + ownership_changes BRANCH_TRANSFER';
COMMENT ON COLUMN crm.leads.owner_staff_id IS 'ผู้รับผิดชอบ · ว่างได้ขณะเปิด (→ LEAD_UNASSIGNED · LEAD_WITHOUT_OWNER)';
COMMENT ON COLUMN crm.leads.team_id IS 'ทีม ณ ตอนมอบงาน (snapshot A28) ใช้แสดง/รายงาน · scope TEAM ประเมินจากสมาชิกภาพปัจจุบันของ owner';
COMMENT ON COLUMN crm.leads.channel_code IS 'ช่องทางที่เกิด lead (บังคับ) · มิติช่องทางของ LEADS · ใช้กติกา is_live ของข้อ 4.3 และฐาน LEAD_RESPONSE_MIN';
COMMENT ON COLUMN crm.leads.source_code IS 'แหล่งที่รู้จักร้าน (ref.sources)';
COMMENT ON COLUMN crm.leads.campaign_id IS 'แคมเปญแรกที่พามา (first-touch · nullable ข้อ 5.10)';
COMMENT ON COLUMN crm.leads.visit_id IS 'visit ที่สร้าง lead นี้ (ถ้ามี) · outcome NOT_INTERESTED ต้องปิด lead ที่เปิดจาก visit นี้เป็น LOST (ข้อ 4.2)';
COMMENT ON COLUMN crm.leads.interest_code IS 'ความสนใจ (บังคับ · ref.interest_types)';
COMMENT ON COLUMN crm.leads.product_type_code IS 'ประเภทสินค้าที่สนใจ (ไม่บังคับ)';
COMMENT ON COLUMN crm.leads.product_model IS 'รุ่นเป็นข้อความ เช่น "iPad Air" (ข้อ 5.4) · "สินค้าที่สนใจ" บน Customer 360';
COMMENT ON COLUMN crm.leads.interest_level IS 'HOT · WARM · COLD (ใช้เรียงสินค้าที่สนใจ)';
COMMENT ON COLUMN crm.leads.status IS 'NEW · CONTACTED · QUALIFIED · CONVERTED · LOST (ข้อ 4.3)';
COMMENT ON COLUMN crm.leads.priority_code IS 'ความสำคัญ (บังคับเมื่อเปิด · ค่าเริ่มต้นจาก Quick Capture = NORMAL)';
COMMENT ON COLUMN crm.leads.next_action IS
'[pii] งานถัดไป (ข้อความ · บังคับเมื่อเปิด · ค่าเริ่มต้น Quick Capture "ติดต่อกลับลูกค้า") · เป็นชื่องานของ task next action · ผ่าน app.trg_guard_restricted_text · anonymize แทนด้วยข้อความคงที่';
COMMENT ON COLUMN crm.leads.next_action_type_code IS 'ประเภทงานถัดไป (ref.task_types · ค่าเริ่มต้น CALL)';
COMMENT ON COLUMN crm.leads.next_action_at IS 'กำหนดเวลางานถัดไป (= tasks.due_at ของ task next action · ค่าเริ่มต้น created_at + 30 นาที [รอยืนยัน])';
COMMENT ON COLUMN crm.leads.first_contacted_at IS 'เวลาตอบกลับครั้งแรก (ข้อ 4.3) · ฐานของ LEAD_RESPONSE_MIN (ข้อ 12.2)';
COMMENT ON COLUMN crm.leads.closed_at IS 'เวลาปิด (CONVERTED/LOST) · LOST_LEADS นับตามคอลัมน์นี้';
COMMENT ON COLUMN crm.leads.lost_reason_code IS 'เหตุผลที่ไม่สำเร็จ (บังคับเมื่อ LOST · ref.lost_reasons)';
COMMENT ON COLUMN crm.leads.lost_note IS '[pii] หมายเหตุเหตุผล (บังคับเมื่อ lost_reason_code = OTHER) · ผ่าน app.trg_guard_restricted_text';
COMMENT ON COLUMN crm.leads.converted_opportunity_id IS 'opportunity ที่ lead นี้แปลงไป (บังคับเมื่อ CONVERTED · ตั้งผ่าน api.convert_lead เท่านั้น)';


-- =====================================================================================
-- ส่วนที่ 3 — crm.opportunities · crm.opportunity_items (ข้อ 4.4 · 6.10)
-- =====================================================================================

CREATE TABLE crm.opportunities (
    id                     uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        uuid                   NOT NULL REFERENCES core.organizations (id),
    opportunity_no         text                   NOT NULL UNIQUE,
    customer_id            uuid                   NOT NULL REFERENCES crm.customers (id),
    lead_id                uuid                   REFERENCES crm.leads (id),
    origin_channel_code    text                   NOT NULL REFERENCES ref.channels (code),
    origin_visit_id        uuid                   REFERENCES crm.visits (id),
    branch_id              uuid                   NOT NULL REFERENCES core.branches (id),
    owner_staff_id         uuid                   REFERENCES core.staff_profiles (id),
    team_id                uuid                   REFERENCES core.teams (id),
    interest_code          text                   REFERENCES ref.interest_types (code),
    stage                  crm.opportunity_stage  NOT NULL DEFAULT 'INTERESTED',
    priority_code          text                   REFERENCES ref.priorities (code),
    expected_amount        numeric(12,2)          NOT NULL DEFAULT 0,
    next_action            text,
    next_action_type_code  text                   REFERENCES ref.task_types (code),
    next_action_at         timestamptz,
    won_amount             numeric(12,2),
    won_at                 timestamptz,
    closed_at              timestamptz,
    lost_reason_code       text                   REFERENCES ref.lost_reasons (code),
    lost_note              text,
    created_at             timestamptz            NOT NULL DEFAULT now(),
    created_by             uuid                   REFERENCES core.staff_profiles (id),
    updated_at             timestamptz            NOT NULL DEFAULT now(),
    updated_by             uuid                   REFERENCES core.staff_profiles (id),

    CONSTRAINT opportunities_opportunity_no_chk CHECK (opportunity_no ~ '^OP-[0-9]{4}-[0-9]{6,}$'),

    -- CHECK ของ crm.opportunities (ตรึง · ข้อ 4.4 · ข้อความตาม CANONICAL)
    CONSTRAINT opportunities_stage_chk CHECK (CASE stage
      WHEN 'WON'  THEN won_amount > 0 AND won_at IS NOT NULL AND closed_at = won_at AND lost_reason_code IS NULL
      WHEN 'LOST' THEN lost_reason_code IS NOT NULL AND closed_at IS NOT NULL AND won_at IS NULL AND won_amount IS NULL
      ELSE owner_staff_id IS NOT NULL AND next_action IS NOT NULL AND next_action_at IS NOT NULL
           AND next_action_type_code IS NOT NULL AND priority_code IS NOT NULL
           AND won_at IS NULL AND won_amount IS NULL AND closed_at IS NULL AND lost_reason_code IS NULL
    END),
    CONSTRAINT opportunities_lost_note_chk
        CHECK (lost_reason_code IS DISTINCT FROM 'OTHER' OR (lost_note IS NOT NULL AND btrim(lost_note) <> '')),
    CONSTRAINT opportunities_expected_amount_chk
        CHECK (expected_amount >= 0),
    CONSTRAINT opportunities_next_action_text_chk
        CHECK (next_action IS NULL OR btrim(next_action) <> '')
);

CREATE INDEX opportunities_branch_id_idx       ON crm.opportunities (branch_id);
CREATE INDEX opportunities_owner_staff_id_idx  ON crm.opportunities (owner_staff_id);
CREATE INDEX opportunities_customer_id_idx     ON crm.opportunities (customer_id);
CREATE INDEX opportunities_created_at_idx      ON crm.opportunities (created_at);
CREATE INDEX opportunities_won_at_idx          ON crm.opportunities (won_at) WHERE stage = 'WON';
CREATE INDEX opportunities_closed_at_idx       ON crm.opportunities (closed_at) WHERE closed_at IS NOT NULL;
CREATE INDEX opportunities_open_idx            ON crm.opportunities (branch_id, stage) WHERE stage IN ('INTERESTED', 'QUOTATION', 'FOLLOW_UP');
CREATE INDEX opportunities_lead_id_idx         ON crm.opportunities (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX opportunities_origin_visit_id_idx ON crm.opportunities (origin_visit_id) WHERE origin_visit_id IS NOT NULL;

COMMENT ON TABLE crm.opportunities IS
'Opportunity = โอกาสซื้อจริง นับตาม created_at · Sale = stage WON นับตาม won_at (ข้อ 3.1 · 4.4) · INTERESTED → QUOTATION อัตโนมัติเมื่อ quotation เปลี่ยนเป็น SENT · '
'QUOTATION → FOLLOW_UP ด้วยมือ · FOLLOW_UP → QUOTATION เมื่อมีใบใหม่ SENT (trigger 0009) · สถานะเปิดใดก็ได้ → WON/LOST (opportunity.close) · '
'ออกจาก WON/LOST ต้องมี opportunity.reopen → FOLLOW_UP และล้าง won_at won_amount closed_at lost_reason_code · ทุกการเปลี่ยนขั้นบันทึก crm.opportunity_stage_history · '
'opportunity ที่เปิดอยู่มี task is_next_action = true หนึ่งใบ (trigger 0009)';
COMMENT ON COLUMN crm.opportunities.opportunity_no IS 'เลข OP-{YYYY}-{NNNNNN} ตัวนับ OP:{YYYY} (ข้อ 6.1)';
COMMENT ON COLUMN crm.opportunities.customer_id IS 'ลูกค้า (บังคับ)';
COMMENT ON COLUMN crm.opportunities.lead_id IS 'lead ต้นทาง (ถ้ามี · สร้างตรงได้โดยไม่มี lead)';
COMMENT ON COLUMN crm.opportunities.origin_channel_code IS
'ช่องทางต้นทาง (บังคับ · ตั้งครั้งเดียวไม่เปลี่ยน) = channel_code ของ lead ต้นทาง หรือช่องทางของ visit/interaction ที่สร้าง opportunity ตรง · มิติช่องทางและ WALKIN_CONVERSION (ข้อ 12.2 · 12.4)';
COMMENT ON COLUMN crm.opportunities.origin_visit_id IS 'visit ที่สร้าง opportunity (ถ้ามี)';
COMMENT ON COLUMN crm.opportunities.branch_id IS 'สาขาปัจจุบัน (มิติสาขา ข้อ 12.4) · ย้ายสาขาต้อง opportunity.assign ทั้งสองฝั่ง';
COMMENT ON COLUMN crm.opportunities.owner_staff_id IS 'ผู้รับผิดชอบ (บังคับเมื่อเปิด) · disable_staff โอนให้ผู้จัดการสาขา (STAFF_LEFT)';
COMMENT ON COLUMN crm.opportunities.team_id IS 'ทีม ณ ตอนมอบงาน (snapshot)';
COMMENT ON COLUMN crm.opportunities.interest_code IS 'ความสนใจ (ref.interest_types · ไม่บังคับ)';
COMMENT ON COLUMN crm.opportunities.stage IS 'INTERESTED · QUOTATION · FOLLOW_UP · WON · LOST (ข้อ 4.4)';
COMMENT ON COLUMN crm.opportunities.priority_code IS 'ความสำคัญ (บังคับเมื่อเปิด) · ขอบซ้ายการ์ด Pipeline';
COMMENT ON COLUMN crm.opportunities.expected_amount IS 'มูลค่าคาดการณ์ = Σ(quantity × unit_price) ของ opportunity_items (trigger 0009 · คอลัมน์ระบบ) · OPEN_PIPELINE_AMOUNT';
COMMENT ON COLUMN crm.opportunities.next_action IS '[pii] งานถัดไป (บังคับเมื่อเปิด) · ชื่องานของ task next action · ผ่าน app.trg_guard_restricted_text · anonymize แทนด้วยข้อความคงที่';
COMMENT ON COLUMN crm.opportunities.next_action_type_code IS 'ประเภทงานถัดไป (ref.task_types)';
COMMENT ON COLUMN crm.opportunities.next_action_at IS 'กำหนดเวลางานถัดไป · วันที่บนการ์ด Pipeline (ข้อ 13.9)';
COMMENT ON COLUMN crm.opportunities.won_amount IS 'ยอดปิดการขาย (บาท) > 0 เมื่อ WON · SALES_AMOUNT (ข้อ 12.1)';
COMMENT ON COLUMN crm.opportunities.won_at IS 'เวลาปิดการขาย (WON) · closed_at = won_at';
COMMENT ON COLUMN crm.opportunities.closed_at IS 'เวลาปิด (WON/LOST) · LOST_OPPORTUNITIES นับตามคอลัมน์นี้ · activity event (ข้อ 3.1)';
COMMENT ON COLUMN crm.opportunities.lost_reason_code IS 'เหตุผลที่ไม่สำเร็จ (บังคับเมื่อ LOST)';
COMMENT ON COLUMN crm.opportunities.lost_note IS '[pii] หมายเหตุเหตุผล (บังคับเมื่อ OTHER) · ผ่าน app.trg_guard_restricted_text';

-- FK วนระหว่าง leads ↔ opportunities
ALTER TABLE crm.leads
    ADD CONSTRAINT leads_converted_opportunity_id_fkey FOREIGN KEY (converted_opportunity_id) REFERENCES crm.opportunities (id);
CREATE INDEX leads_converted_opportunity_id_idx ON crm.leads (converted_opportunity_id) WHERE converted_opportunity_id IS NOT NULL;

-- FK ของ 0005 ที่รอ leads/opportunities
ALTER TABLE crm.interactions
    ADD CONSTRAINT interactions_lead_id_fkey        FOREIGN KEY (lead_id)        REFERENCES crm.leads (id),
    ADD CONSTRAINT interactions_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES crm.opportunities (id);
ALTER TABLE crm.transaction_refs
    ADD CONSTRAINT transaction_refs_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES crm.opportunities (id);

CREATE TABLE crm.opportunity_items (
    id                 uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    uuid               NOT NULL REFERENCES core.organizations (id),
    opportunity_id     uuid               NOT NULL REFERENCES crm.opportunities (id),
    product_type_code  text               REFERENCES ref.product_types (code),
    product_model      text,
    variant            text,
    quantity           integer            NOT NULL DEFAULT 1,
    unit_price         numeric(12,2)      NOT NULL DEFAULT 0,
    interest_level     crm.interest_level,
    created_at         timestamptz        NOT NULL DEFAULT now(),
    created_by         uuid               REFERENCES core.staff_profiles (id),
    updated_at         timestamptz        NOT NULL DEFAULT now(),
    updated_by         uuid               REFERENCES core.staff_profiles (id),

    CONSTRAINT opportunity_items_quantity_chk   CHECK (quantity >= 1),
    CONSTRAINT opportunity_items_unit_price_chk CHECK (unit_price >= 0)
);

CREATE INDEX opportunity_items_opportunity_id_idx ON crm.opportunity_items (opportunity_id);

COMMENT ON TABLE crm.opportunity_items IS
'สินค้าที่อยู่ในโอกาสขาย (ข้อ 6.10) · สิทธิ์สืบจาก opportunity แม่ · DELETE ได้เมื่อ opportunity ยังเปิด (ข้อ 8.3) · '
'ทุกการเปลี่ยนแปลงคำนวณ opportunities.expected_amount ใหม่ (trigger 0009) · Top Product (Phase 3) = 5 อันดับ product_model ของ SALES';
COMMENT ON COLUMN crm.opportunity_items.product_model IS 'รุ่นเป็นข้อความ เช่น "iPhone 17 Pro"';
COMMENT ON COLUMN crm.opportunity_items.variant IS 'ความจุ/สี เช่น "256GB"';
COMMENT ON COLUMN crm.opportunity_items.quantity IS 'จำนวน ≥ 1';
COMMENT ON COLUMN crm.opportunity_items.unit_price IS 'ราคาต่อหน่วย (บาท) ≥ 0 · หมายเหตุผู้เขียน: บังคับค่าเพื่อให้ expected_amount = Σ(quantity × unit_price) คำนวณได้เสมอ';
COMMENT ON COLUMN crm.opportunity_items.interest_level IS 'HOT · WARM · COLD';


-- =====================================================================================
-- ส่วนที่ 4 — ประวัติสถานะ (ข้อ 4.5 · append-only · เขียนโดย app.trg_write_status_history)
-- =====================================================================================

CREATE TABLE crm.lead_status_history (
    id               uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid            NOT NULL REFERENCES core.organizations (id),
    lead_id          uuid            NOT NULL REFERENCES crm.leads (id),
    from_status      crm.lead_status,
    to_status        crm.lead_status NOT NULL,
    changed_by       uuid            REFERENCES core.staff_profiles (id),
    changed_at       timestamptz     NOT NULL DEFAULT now(),
    reason           text,
    created_at       timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT lead_status_history_change_chk CHECK (from_status IS DISTINCT FROM to_status)
);

CREATE INDEX lead_status_history_lead_idx ON crm.lead_status_history (lead_id, changed_at);

COMMENT ON TABLE crm.lead_status_history IS
'ประวัติการเปลี่ยนสถานะ lead (ข้อ 4.5) · from · to · changed_by · changed_at · reason · เขียนโดย trigger เท่านั้น (ไม่มี GRANT เขียน) · SELECT = lead แม่อ่านได้ · '
'ไม่ถูกบันทึกใน audit (ข้อ 9.5) · แถวแรก from_status = NULL (ตอนสร้าง)';
COMMENT ON COLUMN crm.lead_status_history.from_status IS 'สถานะเดิม · NULL = สร้าง lead';
COMMENT ON COLUMN crm.lead_status_history.to_status IS 'สถานะใหม่';
COMMENT ON COLUMN crm.lead_status_history.changed_by IS 'staff ผู้เปลี่ยน (app.current_staff_id()) · NULL = ระบบ/trigger อัตโนมัติ';
COMMENT ON COLUMN crm.lead_status_history.changed_at IS 'เวลาที่เปลี่ยน (ตอนสร้าง = leads.created_at · ปิด = closed_at · NEW → CONTACTED/QUALIFIED = first_contacted_at · อื่น ๆ = now())';
COMMENT ON COLUMN crm.lead_status_history.reason IS 'เหตุผล: ค่าจาก setting app.status_reason ของทรานแซกชัน หรือ lost_reason_code เมื่อปิด LOST';

CREATE TABLE crm.opportunity_stage_history (
    id               uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid                  NOT NULL REFERENCES core.organizations (id),
    opportunity_id   uuid                  NOT NULL REFERENCES crm.opportunities (id),
    from_stage       crm.opportunity_stage,
    to_stage         crm.opportunity_stage NOT NULL,
    changed_by       uuid                  REFERENCES core.staff_profiles (id),
    changed_at       timestamptz           NOT NULL DEFAULT now(),
    reason           text,
    created_at       timestamptz           NOT NULL DEFAULT now(),

    CONSTRAINT opportunity_stage_history_change_chk CHECK (from_stage IS DISTINCT FROM to_stage)
);

CREATE INDEX opportunity_stage_history_opp_idx ON crm.opportunity_stage_history (opportunity_id, changed_at);

COMMENT ON TABLE crm.opportunity_stage_history IS
'ประวัติการเปลี่ยนขั้น opportunity (ข้อ 4.5 · D25 opportunity_status_history) · เขียนโดย trigger เท่านั้น · SELECT = opportunity แม่อ่านได้ · ไม่ถูกบันทึกใน audit · '
'ใช้กับ OPPORTUNITY_STALE (ไม่มี interaction/การเปลี่ยนขั้น 7 วัน)';
COMMENT ON COLUMN crm.opportunity_stage_history.from_stage IS 'ขั้นเดิม · NULL = สร้าง opportunity';
COMMENT ON COLUMN crm.opportunity_stage_history.to_stage IS 'ขั้นใหม่';
COMMENT ON COLUMN crm.opportunity_stage_history.changed_by IS 'staff ผู้เปลี่ยน · NULL = ระบบ (เช่น quotation SENT → QUOTATION อัตโนมัติ)';
COMMENT ON COLUMN crm.opportunity_stage_history.changed_at IS 'เวลาที่เปลี่ยน (ตอนสร้าง = created_at · ปิด = closed_at · อื่น ๆ = now())';
COMMENT ON COLUMN crm.opportunity_stage_history.reason IS 'เหตุผล: app.status_reason หรือ lost_reason_code เมื่อปิด LOST';


-- =====================================================================================
-- ส่วนที่ 5 — crm.quotations · crm.quotation_items (ข้อ 4.6 · 6.10)
-- =====================================================================================

CREATE TABLE crm.quotations (
    id                  uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid                 NOT NULL REFERENCES core.organizations (id),
    quotation_no        text                 NOT NULL UNIQUE,
    opportunity_id      uuid                 NOT NULL REFERENCES crm.opportunities (id),
    customer_id         uuid                 NOT NULL REFERENCES crm.customers (id),
    branch_id           uuid                 NOT NULL REFERENCES core.branches (id),
    owner_staff_id      uuid                 REFERENCES core.staff_profiles (id),
    status              crm.quotation_status NOT NULL DEFAULT 'DRAFT',
    sent_at             timestamptz,
    sent_channel_code   text                 REFERENCES ref.channels (code),
    valid_until         date,
    total_amount        numeric(12,2)        NOT NULL DEFAULT 0,
    installment_months  integer,
    terms_note          text,
    created_at          timestamptz          NOT NULL DEFAULT now(),
    created_by          uuid                 REFERENCES core.staff_profiles (id),
    updated_at          timestamptz          NOT NULL DEFAULT now(),
    updated_by          uuid                 REFERENCES core.staff_profiles (id),

    CONSTRAINT quotations_quotation_no_chk CHECK (quotation_no ~ '^QT-[0-9]{4}-[0-9]{6,}$'),
    -- DRAFT ยังไม่ส่ง · SENT ACCEPTED REJECTED EXPIRED ล้วนผ่านการส่งแล้ว: บังคับ sent_at sent_channel_code valid_until (ข้อ 4.6)
    CONSTRAINT quotations_sent_chk CHECK (CASE status
        WHEN 'DRAFT' THEN sent_at IS NULL AND sent_channel_code IS NULL AND valid_until IS NULL
        ELSE sent_at IS NOT NULL AND sent_channel_code IS NOT NULL AND valid_until IS NOT NULL
    END),
    -- valid_until = วันที่ส่ง (Asia/Bangkok) + quotation.valid_days · ต้องไม่ก่อนวันที่ส่ง
    CONSTRAINT quotations_valid_until_chk
        CHECK (valid_until IS NULL OR valid_until >= app.bangkok_date(sent_at)),
    CONSTRAINT quotations_total_amount_chk
        CHECK (total_amount >= 0),
    CONSTRAINT quotations_installment_months_chk
        CHECK (installment_months IS NULL OR installment_months >= 1)
);

CREATE INDEX quotations_branch_id_idx      ON crm.quotations (branch_id);
CREATE INDEX quotations_owner_staff_id_idx ON crm.quotations (owner_staff_id);
CREATE INDEX quotations_customer_id_idx    ON crm.quotations (customer_id);
CREATE INDEX quotations_opportunity_id_idx ON crm.quotations (opportunity_id);
CREATE INDEX quotations_sent_valid_idx     ON crm.quotations (valid_until) WHERE status = 'SENT';

COMMENT ON TABLE crm.quotations IS
'ใบเสนอราคา (ข้อ 4.6 · 6.10) · สร้างจาก opportunity (quotation.create ประเมินกับ opportunity แม่) · DRAFT แก้ได้ทุกช่อง · ส่ง (DRAFT → SENT) บันทึก sent_at sent_channel_code '
'และ RPC สร้าง interaction QUOTATION_SENT · หลังส่งแก้ได้เฉพาะ status (app.enforce_row_transition) · SENT → ACCEPTED/REJECTED ด้วยมือ (ACCEPTED ไม่ปิด WON อัตโนมัติ) · '
'SENT → EXPIRED โดย app.job_expire_quotations 00:00 วันถัดจาก valid_until · เปลี่ยนเป็น SENT ทำให้ opportunity INTERESTED/FOLLOW_UP → QUOTATION (trigger 0009)';
COMMENT ON COLUMN crm.quotations.quotation_no IS 'เลข QT-{YYYY}-{NNNNNN} ตัวนับ QT:{YYYY} (ข้อ 6.1)';
COMMENT ON COLUMN crm.quotations.opportunity_id IS 'opportunity แม่ (บังคับ)';
COMMENT ON COLUMN crm.quotations.customer_id IS
'ลูกค้า = ของ opportunity แม่ (trigger 0009 เติมเมื่อว่าง) · หมายเหตุผู้เขียน: ข้อ 6.10 ไม่ระบุ NOT NULL แต่ RLS/read-through ต้องมีลูกค้า จึงบังคับ';
COMMENT ON COLUMN crm.quotations.branch_id IS
'สาขา = ของ opportunity แม่ (ข้อ 8.0 แถวลูกเท่าแถวแม่ · trigger 0009 เติมเมื่อว่าง) · หมายเหตุผู้เขียน: บังคับ NOT NULL เพื่อประเมิน scope';
COMMENT ON COLUMN crm.quotations.owner_staff_id IS 'ผู้จัดทำ (เปลี่ยน owner ไม่ได้ ข้อ 9.4.2) · trigger เติมจาก owner ของ opportunity เมื่อว่าง';
COMMENT ON COLUMN crm.quotations.status IS 'DRAFT · SENT · ACCEPTED · REJECTED · EXPIRED (ข้อ 4.6)';
COMMENT ON COLUMN crm.quotations.sent_at IS 'เวลาส่ง (บังคับเมื่อไม่ใช่ DRAFT)';
COMMENT ON COLUMN crm.quotations.sent_channel_code IS 'ช่องทางที่ส่ง (ref.channels · บังคับเมื่อไม่ใช่ DRAFT)';
COMMENT ON COLUMN crm.quotations.valid_until IS
'ใช้ได้ถึงวันที่ (date) = วันที่ส่งตาม Asia/Bangkok + app.settings[quotation.valid_days] (7) [รอยืนยัน] · trigger 0009 คำนวณเมื่อเปลี่ยนเป็น SENT และยังว่าง · ตัวอย่าง ส่ง 1 ก.ย. 2569 → 8 ก.ย. 2569';
COMMENT ON COLUMN crm.quotations.total_amount IS 'ยอดรวม (บาท) · หมายเหตุผู้เขียน: CANONICAL ไม่กำหนดสูตรจาก quotation_items ผู้เรียก RPC ตั้งค่า (รอยืนยัน)';
COMMENT ON COLUMN crm.quotations.installment_months IS 'จำนวนงวดผ่อน (ถ้ามี) ≥ 1';
COMMENT ON COLUMN crm.quotations.terms_note IS 'เงื่อนไข/หมายเหตุ · ผ่าน app.trg_guard_restricted_text (ข้อ 10.1)';

CREATE TABLE crm.quotation_items (
    id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    uuid          NOT NULL REFERENCES core.organizations (id),
    quotation_id       uuid          NOT NULL REFERENCES crm.quotations (id),
    product_type_code  text          REFERENCES ref.product_types (code),
    product_model      text,
    variant            text,
    quantity           integer       NOT NULL DEFAULT 1,
    unit_price         numeric(12,2) NOT NULL DEFAULT 0,
    discount_amount    numeric(12,2) NOT NULL DEFAULT 0,
    created_at         timestamptz   NOT NULL DEFAULT now(),
    created_by         uuid          REFERENCES core.staff_profiles (id),
    updated_at         timestamptz   NOT NULL DEFAULT now(),
    updated_by         uuid          REFERENCES core.staff_profiles (id),

    CONSTRAINT quotation_items_quantity_chk   CHECK (quantity >= 1),
    CONSTRAINT quotation_items_unit_price_chk CHECK (unit_price >= 0),
    CONSTRAINT quotation_items_discount_chk   CHECK (discount_amount >= 0 AND discount_amount <= quantity * unit_price)
);

CREATE INDEX quotation_items_quotation_id_idx ON crm.quotation_items (quotation_id);

COMMENT ON TABLE crm.quotation_items IS
'รายการสินค้าในใบเสนอราคา (ข้อ 6.10) · สิทธิ์สืบจาก quotation แม่ · INSERT/UPDATE/DELETE ได้เมื่อ quotation ยังเป็น DRAFT (ข้อ 8.3)';
COMMENT ON COLUMN crm.quotation_items.quantity IS 'จำนวน ≥ 1';
COMMENT ON COLUMN crm.quotation_items.unit_price IS 'ราคาต่อหน่วย (บาท)';
COMMENT ON COLUMN crm.quotation_items.discount_amount IS 'ส่วนลดรวมของบรรทัด (บาท) · 0 ≤ ส่วนลด ≤ quantity × unit_price';


-- =====================================================================================
-- ส่วนที่ 6 — crm.ownership_changes (ข้อ 6.10 · 9.4.2 · A28)
-- =====================================================================================

CREATE TABLE crm.ownership_changes (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid        NOT NULL REFERENCES core.organizations (id),
    entity_type      text        NOT NULL,
    entity_id        uuid        NOT NULL,
    from_staff_id    uuid        REFERENCES core.staff_profiles (id),
    to_staff_id      uuid        REFERENCES core.staff_profiles (id),
    from_branch_id   uuid        REFERENCES core.branches (id),
    to_branch_id     uuid        REFERENCES core.branches (id),
    reason_code      text        NOT NULL REFERENCES ref.ownership_change_reasons (code),
    note             text,
    changed_by       uuid        REFERENCES core.staff_profiles (id),
    changed_at       timestamptz NOT NULL DEFAULT now(),
    created_at       timestamptz NOT NULL DEFAULT now(),

    -- ตารางที่เปลี่ยน owner/สาขาได้ (ข้อ 9.4.2): ลูกค้า · visit · lead · opportunity · task
    CONSTRAINT ownership_changes_entity_type_chk
        CHECK (entity_type IN ('CUSTOMER', 'VISIT', 'LEAD', 'OPPORTUNITY', 'TASK')),
    CONSTRAINT ownership_changes_something_changed_chk
        CHECK (from_staff_id IS DISTINCT FROM to_staff_id OR from_branch_id IS DISTINCT FROM to_branch_id)
);

CREATE INDEX ownership_changes_entity_idx     ON crm.ownership_changes (entity_type, entity_id, changed_at);
CREATE INDEX ownership_changes_to_staff_idx   ON crm.ownership_changes (to_staff_id);
CREATE INDEX ownership_changes_to_branch_idx  ON crm.ownership_changes (to_branch_id);

COMMENT ON TABLE crm.ownership_changes IS
'ประวัติการเปลี่ยนผู้รับผิดชอบ/สาขา (A28 · ข้อ 9.4.2) · เขียนโดย trigger app.trg_write_ownership_change/RPC เท่านั้น · SELECT = แถวแม่อ่านได้ · ไม่ถูกบันทึกใน audit (ข้อ 9.5) · '
'ตัวอย่าง: LD-2026-007512 คุณขวัญ → คุณคิม โดยคุณเจ SHIFT_CHANGE 10 ก.ย. 2569 18:05 (ข้อ 13.14)';
COMMENT ON COLUMN crm.ownership_changes.entity_type IS
'ชนิดรายการ CUSTOMER · VISIT · LEAD · OPPORTUNITY · TASK · หมายเหตุผู้เขียน: CANONICAL ไม่กำหนดชุดค่า ผู้เขียนใช้ชื่อ entity ตามรูป {ENTITY}_{VERB} ของ audit (ข้อ 9.5)';
COMMENT ON COLUMN crm.ownership_changes.entity_id IS 'id ของรายการในตารางตาม entity_type (ไม่มี FK เพราะอ้างหลายตาราง)';
COMMENT ON COLUMN crm.ownership_changes.from_staff_id IS 'ผู้รับผิดชอบเดิม (NULL = ไม่มี)';
COMMENT ON COLUMN crm.ownership_changes.to_staff_id IS 'ผู้รับผิดชอบใหม่ (NULL = ปล่อยว่าง เช่น disable_staff ของ lead/task)';
COMMENT ON COLUMN crm.ownership_changes.from_branch_id IS 'สาขาเดิม (เมื่อย้ายสาขา)';
COMMENT ON COLUMN crm.ownership_changes.to_branch_id IS 'สาขาใหม่ (เมื่อย้ายสาขา)';
COMMENT ON COLUMN crm.ownership_changes.reason_code IS 'เหตุผล (ref.ownership_change_reasons) · ย้ายสาขา = BRANCH_TRANSFER · ปิดใช้งานพนักงาน = STAFF_LEFT';
COMMENT ON COLUMN crm.ownership_changes.note IS 'หมายเหตุ';
COMMENT ON COLUMN crm.ownership_changes.changed_by IS 'staff ผู้เปลี่ยน · NULL = ระบบ';


-- =====================================================================================
-- ส่วนที่ 7 — updated_at trigger · RLS
-- =====================================================================================

CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.campaigns         FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.leads             FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.opportunities     FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.opportunity_items FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.quotations        FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.quotation_items   FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE crm.campaigns                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.leads                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.opportunities             ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.opportunity_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.lead_status_history       ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.opportunity_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.quotations                ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.quotation_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.ownership_changes         ENABLE ROW LEVEL SECURITY;
