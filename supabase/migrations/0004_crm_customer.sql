-- =====================================================================================
-- JAUN CRM · Customer 360
-- migration 0004 : crm — Customer Master และตารางย่อยของลูกค้า
-- target        : Supabase PostgreSQL 17
--
-- ค่าอ้างอิง (docs/00-brief/CANONICAL.md v2.1):
--   ข้อ 3.2 first_seen_at · 3.4 lifecycle_stage · 5.8 customer_type/ช่องทางความยินยอม · 5.9 tag
--   ข้อ 6.1 เลขอ้างอิง · 6.3 crm.customers · 6.4 customer_contacts/addresses · 6.6 customer_branches
--   ข้อ 6.7 merge และ duplicate_decisions · 6.9 customer_notes · 6.10 คอลัมน์มาตรฐาน
--   ข้อ 8.3 สิทธิ์ของตารางย่อย · 9.4 RLS (policy/grant อยู่ใน migration 0010) · 10.2 ความยินยอม · 10.4 DSR
--
-- ข้อตกลง:
--   · ทุกตารางมี organization_id · created_at · created_by · updated_at · updated_by (created_by/updated_by = core.staff_profiles.id)
--   · COMMENT ของคอลัมน์ที่ขึ้นต้นด้วย "[pii]" = คอลัมน์ป้าย pii ของ data dictionary (ข้อ 9.5 · 10.1):
--     audit บันทึกเป็น {"masked": …, "sha256": …} ไม่เก็บค่าเต็ม · app.anonymize_customer ต้องล้าง/แทนค่า
--   · ห้ามมีเลขบัตรประชาชน วันเกิดเต็ม รายได้ รูปถ่าย หรือเอกสารในตาราง crm (A31 · B23)
--   · ตาราง visits/interactions/leads/opportunities/tasks/transaction_refs อยู่ใน migration ของ stage 2
-- =====================================================================================


-- =====================================================================================
-- ส่วนที่ 1 — crm.customers (ข้อ 6.3)
-- =====================================================================================

CREATE TABLE crm.customers (
    id                  uuid                       PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid                       NOT NULL REFERENCES core.organizations (id),
    customer_no         text                       NOT NULL UNIQUE,
    first_name          text,
    last_name           text,
    nickname            text,
    -- ห้ามใช้ concat_ws/format ใน generated column (ไม่ immutable) — นิพจน์ตรงตามข้อ 6.3
    display_name        text GENERATED ALWAYS AS (
        coalesce(nullif(btrim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), ''), nickname)) STORED,
    name_search         text GENERATED ALWAYS AS (
        lower(btrim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')))) STORED,
    customer_type       text                       NOT NULL DEFAULT 'INDIVIDUAL',
    first_seen_at       timestamptz                NOT NULL,
    first_channel_code  text                       REFERENCES ref.channels (code),
    first_source_code   text                       REFERENCES ref.sources (code),
    first_branch_id     uuid                       REFERENCES core.branches (id),
    owner_staff_id      uuid                       REFERENCES core.staff_profiles (id),
    lifecycle_stage     text                       NOT NULL DEFAULT 'IDENTIFIED',
    record_status       crm.customer_record_status NOT NULL DEFAULT 'ACTIVE',
    merged_into_id      uuid                       REFERENCES crm.customers (id),
    province_code       text                       REFERENCES ref.provinces (code),
    note_summary        text,
    legal_hold          boolean                    NOT NULL DEFAULT false,
    created_via         text                       NOT NULL,
    last_activity_at    timestamptz,
    last_channel_code   text                       REFERENCES ref.channels (code),
    last_branch_id      uuid                       REFERENCES core.branches (id),
    has_open_followup   boolean                    NOT NULL DEFAULT false,
    has_new_lead        boolean                    NOT NULL DEFAULT false,
    created_at          timestamptz                NOT NULL DEFAULT now(),
    created_by          uuid                       REFERENCES core.staff_profiles (id),
    updated_at          timestamptz                NOT NULL DEFAULT now(),
    updated_by          uuid                       REFERENCES core.staff_profiles (id),

    CONSTRAINT customers_customer_no_chk     CHECK (customer_no ~ '^CUS-[0-9]{4}-[0-9]{6,}$'),
    CONSTRAINT customers_customer_type_chk   CHECK (customer_type IN ('INDIVIDUAL', 'BUSINESS')),
    CONSTRAINT customers_lifecycle_stage_chk CHECK (lifecycle_stage IN ('REPEAT', 'CUSTOMER', 'OPPORTUNITY', 'LEAD', 'LOST', 'IDENTIFIED')),
    CONSTRAINT customers_created_via_chk     CHECK (created_via IN ('QUICK_CAPTURE', 'IMPORT', 'MERGE_SURVIVOR')),
    CONSTRAINT customers_merged_chk          CHECK ((record_status = 'MERGED') = (merged_into_id IS NOT NULL)),
    CONSTRAINT customers_merged_self_chk     CHECK (merged_into_id IS NULL OR merged_into_id <> id)
);

CREATE INDEX customers_name_search_trgm_idx ON crm.customers USING gin (name_search extensions.gin_trgm_ops);
CREATE INDEX customers_first_branch_id_idx  ON crm.customers (first_branch_id);
CREATE INDEX customers_owner_staff_id_idx   ON crm.customers (owner_staff_id);
CREATE INDEX customers_last_branch_id_idx   ON crm.customers (last_branch_id);
CREATE INDEX customers_last_activity_idx    ON crm.customers (last_activity_at DESC, customer_no DESC);
CREATE INDEX customers_first_seen_at_idx    ON crm.customers (first_seen_at);
CREATE INDEX customers_merged_into_id_idx   ON crm.customers (merged_into_id) WHERE merged_into_id IS NOT NULL;

COMMENT ON TABLE crm.customers IS
'Customer Master (ข้อ 6.3) · สร้างได้ทางเดียวคือ api.quick_capture (authenticated ไม่มี INSERT) · นำเข้าข้อมูลเดิมด้วยสคริปต์ (created_via IMPORT) · '
'SELECT ผ่าน RLS id IN (SELECT app.readable_customer_ids()) · คอลัมน์ระบบไม่อยู่ใน column grant ของ UPDATE (ข้อ 9.4 กติกา 7) · ไม่มี DELETE (ลบจริง = anonymize ข้อ 10.4) · '
'กติกา "ชื่อหรือชื่อเล่นอย่างน้อยหนึ่งช่อง" และ "ช่องทางแรก/สาขา บังคับ" ตรวจตอนสร้างใน RPC ไม่ใช่ CHECK ถาวร (ข้อ 6.2)';
COMMENT ON COLUMN crm.customers.customer_no IS 'เลขลูกค้า CUS-{YYYY}-{NNNNNN} ตัวนับ CUS:{YYYY} ปีจาก created_at Asia/Bangkok (ข้อ 6.1) · ออกโดย app.trg_assign_running_number ถ้าแถวยังไม่มีเลข';
COMMENT ON COLUMN crm.customers.first_name IS '[pii] ชื่อ · anonymize แทนด้วย ''ลูกค้านิรนาม '' || customer_no';
COMMENT ON COLUMN crm.customers.last_name IS '[pii] นามสกุล · anonymize = NULL';
COMMENT ON COLUMN crm.customers.nickname IS '[pii] ชื่อเล่น · anonymize = NULL';
COMMENT ON COLUMN crm.customers.display_name IS
'[pii] generated: "ชื่อ นามสกุล" ที่ตัดช่องว่างหัวท้าย ถ้าว่างใช้ชื่อเล่น · UI เติมคำนำหน้า "คุณ" เอง (ไม่เก็บ)';
COMMENT ON COLUMN crm.customers.name_search IS
'[pii] generated: lower("ชื่อ นามสกุล") สำหรับค้นแบบ trigram (GIN extensions.gin_trgm_ops) และกฎตรวจซ้ำชื่อ (ข้อ 6.5) · ไม่รวมชื่อเล่น';
COMMENT ON COLUMN crm.customers.customer_type IS 'INDIVIDUAL (ค่าเริ่มต้น) · BUSINESS · ไม่แสดงบน Quick Capture ไม่ใช้ใน KPI (ข้อ 5.8)';
COMMENT ON COLUMN crm.customers.first_seen_at IS
'เวลาของกิจกรรมแรกที่รู้ (ไม่ใช่เวลาสร้างแถว · ข้อ 3.2) · ตอนสร้าง = least(created_at, เวลากิจกรรมที่แนบมา) · trigger ของตารางกิจกรรมตั้ง least(first_seen_at, เวลาเหตุการณ์) · '
'invariant: ไม่มีกิจกรรมที่ occurred_at < first_seen_at · ใช้แยกลูกค้าใหม่/เก่า';
COMMENT ON COLUMN crm.customers.first_channel_code IS 'ช่องทางของกิจกรรมแรก · ใช้กับกราฟ "แหล่งที่มาลูกค้า" (ข้อ 13.3) และ MISSING_PHONE (ข้อ 12.3)';
COMMENT ON COLUMN crm.customers.first_source_code IS 'แหล่งที่รู้จักร้านของกิจกรรมแรก · Customer 360 แสดง "รู้จักร้านจาก {source}"';
COMMENT ON COLUMN crm.customers.first_branch_id IS
'สาขาของกิจกรรมแรก ("สาขาที่สนใจ" ของ mockup B) · ใช้ประเมิน scope ของลูกค้าร่วมกับ customer_branches (ข้อ 8.0) และผูกรายการคุณภาพข้อมูลระดับลูกค้ากับสาขา (ข้อ 12.3)';
COMMENT ON COLUMN crm.customers.owner_staff_id IS 'ผู้ดูแลลูกค้า · เปลี่ยนต้องมี customer.assign และบันทึก crm.ownership_changes (ข้อ 9.4.2)';
COMMENT ON COLUMN crm.customers.lifecycle_stage IS
'แคชสถานะวงจรชีวิต (ข้อ 3.4) REPEAT · CUSTOMER · OPPORTUNITY · LEAD · LOST · IDENTIFIED · ปรับโดย app.refresh_customer_lifecycle เท่านั้น ห้ามแก้ด้วยมือ';
COMMENT ON COLUMN crm.customers.record_status IS 'ACTIVE · MERGED (มี merged_into_id · เปิด customer_no เดิม redirect ไป survivor) · ANONYMIZED';
COMMENT ON COLUMN crm.customers.merged_into_id IS 'survivor ที่ลูกค้ารายนี้ถูกรวมเข้า (มีค่าเมื่อ record_status = MERGED เท่านั้น)';
COMMENT ON COLUMN crm.customers.province_code IS 'จังหวัด (ISO 3166-2:TH) · anonymize = NULL';
COMMENT ON COLUMN crm.customers.note_summary IS '[pii] เนื้อหาโน้ตที่ปักหมุดล่าสุด (ตั้งโดย trigger ของ customer_notes) · ผู้ใช้แก้ตรงไม่ได้';
COMMENT ON COLUMN crm.customers.legal_hold IS 'true = ข้ามการ anonymize ทั้ง DSR และ retention (ข้อ 10.3 · 10.4) · เปลี่ยนผ่าน api.set_legal_hold (dsr.manage 🔐)';
COMMENT ON COLUMN crm.customers.created_via IS 'QUICK_CAPTURE · IMPORT (ข้อมูลเดิม) · MERGE_SURVIVOR';
COMMENT ON COLUMN crm.customers.last_activity_at IS 'แคช: เวลากิจกรรมล่าสุดตามข้อ 3.1 (trigger app.trg_touch_customer_activity) · เรียงรายการลูกค้าและกรองช่วงวันที่ · ฐานระยะเก็บ 24 เดือน';
COMMENT ON COLUMN crm.customers.last_channel_code IS 'แคช: ช่องทางของ interaction ล่าสุดที่ไม่ใช่ INTERNAL ("ช่องทางล่าสุด" หน้า 03)';
COMMENT ON COLUMN crm.customers.last_branch_id IS 'แคช: สาขาของกิจกรรมล่าสุด ("สาขา" หน้า 03)';
COMMENT ON COLUMN crm.customers.has_open_followup IS 'แคช: มี task FOLLOW_UP สถานะ OPEN/IN_PROGRESS (ป้าย "ติดตามอยู่" ข้อ 3.5) · ทุกผู้ดูเห็นป้ายเดียวกัน';
COMMENT ON COLUMN crm.customers.has_new_lead IS 'แคช: มี lead เปิดอยู่สถานะ NEW (ป้าย "ยังไม่ได้ติดต่อ" ข้อ 3.5)';


-- =====================================================================================
-- ส่วนที่ 2 — crm.customer_contacts (ข้อ 6.4)
-- =====================================================================================

CREATE TABLE crm.customer_contacts (
    id                uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid             NOT NULL REFERENCES core.organizations (id),
    customer_id       uuid             NOT NULL REFERENCES crm.customers (id),
    contact_type      crm.contact_type NOT NULL,
    value_raw         text             NOT NULL,
    value_normalized  text             NOT NULL GENERATED ALWAYS AS (app.normalize_contact(contact_type, value_raw)) STORED,
    value_masked      text             NOT NULL GENERATED ALWAYS AS (app.mask_contact(contact_type, app.normalize_contact(contact_type, value_raw))) STORED,
    is_primary        boolean          NOT NULL DEFAULT false,
    is_valid          boolean          NOT NULL DEFAULT true,
    is_active         boolean          NOT NULL DEFAULT true,
    verified_at       timestamptz,
    created_at        timestamptz      NOT NULL DEFAULT now(),
    created_by        uuid             REFERENCES core.staff_profiles (id),
    updated_at        timestamptz      NOT NULL DEFAULT now(),
    updated_by        uuid             REFERENCES core.staff_profiles (id)
);

CREATE INDEX customer_contacts_type_normalized_idx ON crm.customer_contacts (contact_type, value_normalized);
CREATE INDEX customer_contacts_customer_id_idx     ON crm.customer_contacts (customer_id);
-- หมายเหตุผู้เขียน: ลูกค้าหนึ่งรายไม่มีคู่ (ชนิด, ค่า normalized) ซ้ำในแถวที่ใช้งาน (merge เก็บแถว verified ก่อน ข้อ 6.7)
-- และมีช่องทางหลักได้หนึ่งรายการต่อชนิด · คนละลูกค้าใช้ค่าเดียวกันได้ (เช่น เบอร์ครอบครัว)
CREATE UNIQUE INDEX customer_contacts_value_active_uidx
    ON crm.customer_contacts (customer_id, contact_type, value_normalized) WHERE is_active;
CREATE UNIQUE INDEX customer_contacts_primary_active_uidx
    ON crm.customer_contacts (customer_id, contact_type) WHERE is_primary AND is_active;

COMMENT ON TABLE crm.customer_contacts IS
'ช่องทางติดต่อของลูกค้า (ข้อ 6.4) · ค่าเต็มควบคุมระดับคอลัมน์: authenticated ได้ SELECT เฉพาะ id organization_id customer_id contact_type value_masked is_primary is_valid is_active verified_at created_at updated_at · '
'เพิ่ม/แก้ผ่าน api.save_contact (customer.update) · ค่าเต็มได้ทางเดียวคือ api.reveal_contact (customer.pii.reveal · เขียน CONTACT_REVEALED) · '
'ผู้เขียนใส่เฉพาะ value_raw — value_normalized และ value_masked เป็น generated column จาก app.normalize_contact / app.mask_contact จึงไม่ผิดเพี้ยนจากกัน · '
'ค่าที่ normalize แล้วว่าง (เช่น PHONE ที่ไม่มีตัวเลข) ถูกปฏิเสธด้วย NOT NULL · anonymize = ลบแถว';
COMMENT ON COLUMN crm.customer_contacts.contact_type IS 'PHONE · LINE_ID · LINE_USER_ID · FACEBOOK · INSTAGRAM · TIKTOK · EMAIL';
COMMENT ON COLUMN crm.customer_contacts.value_raw IS '[pii] ค่าที่กรอก/ได้รับตามจริง';
COMMENT ON COLUMN crm.customer_contacts.value_normalized IS
'[pii] generated = app.normalize_contact(contact_type, value_raw) · PHONE เป็น E.164 (+66812345678) · ใช้ค้นแบบตรงทั้งค่าเท่านั้น (ห้าม LIKE/prefix/trigram ข้อ 6.5) · audit/access log เก็บ sha256 ของค่านี้';
COMMENT ON COLUMN crm.customer_contacts.value_masked IS
'generated = app.mask_contact(…) · ค่าที่แสดงได้ทั่วไป เช่น 081-XXX-5678 · s***@example.com · so*** · — (LINE_USER_ID)';
COMMENT ON COLUMN crm.customer_contacts.is_primary IS 'ช่องทางหลักของชนิดนั้น (หนึ่งรายการต่อชนิดต่อลูกค้าในแถวที่ใช้งาน)';
COMMENT ON COLUMN crm.customer_contacts.is_valid IS
'รูปแบบถูกต้อง · PHONE: api.save_contact ตั้งจาก app.is_valid_thai_phone(value_raw) (มือถือ 06/08/09 10 หลัก หรือเบอร์บ้าน 02–07 9 หลัก) · false = ที่มาของ INVALID_PHONE (ข้อ 12.3)';
COMMENT ON COLUMN crm.customer_contacts.is_active IS 'false = ปิดใช้งาน (เก็บประวัติ) · ลูกค้าที่ไม่มี PHONE ที่ใช้งานเป็นที่มาของ MISSING_PHONE';
COMMENT ON COLUMN crm.customer_contacts.verified_at IS 'เวลาที่ยืนยันว่าเป็นช่องทางของลูกค้าจริง · merge ใช้เลือกแถวที่ verified ก่อน';


-- =====================================================================================
-- ส่วนที่ 3 — crm.customer_addresses (ข้อ 6.4 "ใช้กติกาคอลัมน์เดียวกัน")
-- =====================================================================================

CREATE TABLE crm.customer_addresses (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid        NOT NULL REFERENCES core.organizations (id),
    customer_id      uuid        NOT NULL REFERENCES crm.customers (id),
    address_line     text        NOT NULL,
    subdistrict      text,
    district         text,
    province_code    text        REFERENCES ref.provinces (code),
    postal_code      text,
    value_masked     text        NOT NULL,
    is_primary       boolean     NOT NULL DEFAULT false,
    is_active        boolean     NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        REFERENCES core.staff_profiles (id),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid        REFERENCES core.staff_profiles (id),

    CONSTRAINT customer_addresses_address_line_chk CHECK (btrim(address_line) <> ''),
    CONSTRAINT customer_addresses_postal_code_chk  CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{5}$')
);

CREATE INDEX customer_addresses_customer_id_idx ON crm.customer_addresses (customer_id);
CREATE UNIQUE INDEX customer_addresses_primary_active_uidx
    ON crm.customer_addresses (customer_id) WHERE is_primary AND is_active;

COMMENT ON TABLE crm.customer_addresses IS
'ที่อยู่ของลูกค้า (ข้อ 6.4) · กติกาคอลัมน์เดียวกับ customer_contacts: authenticated เห็นเฉพาะระดับอำเภอ/จังหวัด (district · province_code · value_masked) · '
'ที่อยู่เต็มผ่าน reveal เท่านั้น · เพิ่ม/แก้ผ่าน api.save_address (customer.update) · anonymize = ลบแถว · '
'หมายเหตุผู้เขียน: CANONICAL ไม่ระบุคอลัมน์ ผู้เขียนแยกส่วนที่เปิดเผยได้ (อำเภอ/จังหวัด) ออกจากส่วนที่ปิดบัง (บ้านเลขที่ ตำบล รหัสไปรษณีย์)';
COMMENT ON COLUMN crm.customer_addresses.address_line IS '[pii] บ้านเลขที่ หมู่ อาคาร ซอย ถนน';
COMMENT ON COLUMN crm.customer_addresses.subdistrict IS '[pii] ตำบล/แขวง';
COMMENT ON COLUMN crm.customer_addresses.district IS 'อำเภอ/เขต (ระดับที่แสดงได้)';
COMMENT ON COLUMN crm.customer_addresses.province_code IS 'จังหวัด (ระดับที่แสดงได้)';
COMMENT ON COLUMN crm.customer_addresses.postal_code IS '[pii] รหัสไปรษณีย์ 5 หลัก';
COMMENT ON COLUMN crm.customer_addresses.value_masked IS
'ค่าที่แสดงได้ระดับอำเภอ/จังหวัด ตั้งโดย api.save_address · หมายเหตุผู้เขียน: รูปแบบ "{district} · {ref.provinces.label_th}" (มีส่วนเดียวแสดงส่วนนั้น · ไม่มีทั้งคู่ = —)';


-- =====================================================================================
-- ส่วนที่ 4 — crm.customer_branches (ข้อ 6.6)
-- =====================================================================================

CREATE TABLE crm.customer_branches (
    organization_id   uuid                  NOT NULL REFERENCES core.organizations (id),
    customer_id       uuid                  NOT NULL REFERENCES crm.customers (id),
    branch_id         uuid                  NOT NULL REFERENCES core.branches (id),
    first_linked_at   timestamptz           NOT NULL DEFAULT now(),
    last_activity_at  timestamptz,
    linked_via        crm.customer_link_via NOT NULL,
    created_at        timestamptz           NOT NULL DEFAULT now(),
    created_by        uuid                  REFERENCES core.staff_profiles (id),
    updated_at        timestamptz           NOT NULL DEFAULT now(),
    updated_by        uuid                  REFERENCES core.staff_profiles (id),

    PRIMARY KEY (customer_id, branch_id)
);

CREATE INDEX customer_branches_branch_customer_idx ON crm.customer_branches (branch_id, customer_id);

COMMENT ON TABLE crm.customer_branches IS
'ความเชื่อมโยงลูกค้า ↔ สาขา ใช้ประเมิน scope ของลูกค้า (ข้อ 6.6 · 8.0) · PK (customer_id, branch_id) ตาม CANONICAL จึงไม่มีคอลัมน์ id · '
'เขียนโดย trigger app.trg_link_customer_branch (เมื่อเกิด visit/interaction/lead/opportunity/transaction ref ที่สาขา) และ api.link_customer_to_branch เท่านั้น · '
'merge = upsert least(first_linked_at) greatest(last_activity_at) · ไม่ถูกบันทึกใน audit (ข้อ 9.5)';
COMMENT ON COLUMN crm.customer_branches.first_linked_at IS 'เวลาที่ลูกค้าเชื่อมกับสาขานี้ครั้งแรก';
COMMENT ON COLUMN crm.customer_branches.last_activity_at IS 'เวลากิจกรรมล่าสุดของลูกค้าที่สาขานี้ ("สาขาที่เคยใช้บริการ" บน Customer 360)';
COMMENT ON COLUMN crm.customer_branches.linked_via IS 'เหตุที่เชื่อมครั้งแรก: CREATED · VISIT · INTERACTION · LEAD · OPPORTUNITY · MANUAL_LINK · MERGE';


-- =====================================================================================
-- ส่วนที่ 5 — crm.customer_notes (ข้อ 6.9)
-- =====================================================================================

CREATE TABLE crm.customer_notes (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid        NOT NULL REFERENCES core.organizations (id),
    customer_id      uuid        NOT NULL REFERENCES crm.customers (id),
    interaction_id   uuid,                           -- FK → crm.interactions เพิ่มใน migration ที่สร้าง interactions (stage 2)
    branch_id        uuid        NOT NULL REFERENCES core.branches (id),
    body             text        NOT NULL,
    is_pinned        boolean     NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        REFERENCES core.staff_profiles (id),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid        REFERENCES core.staff_profiles (id),

    CONSTRAINT customer_notes_body_chk CHECK (char_length(body) <= 2000 AND btrim(body) <> '')
);

CREATE INDEX customer_notes_customer_created_idx ON crm.customer_notes (customer_id, created_at DESC);
CREATE INDEX customer_notes_branch_id_idx        ON crm.customer_notes (branch_id);
CREATE INDEX customer_notes_created_by_idx       ON crm.customer_notes (created_by);
CREATE INDEX customer_notes_interaction_id_idx   ON crm.customer_notes (interaction_id) WHERE interaction_id IS NOT NULL;
CREATE INDEX customer_notes_pinned_idx           ON crm.customer_notes (customer_id, created_at DESC) WHERE is_pinned;

COMMENT ON TABLE crm.customer_notes IS
'โน้ตของลูกค้า (ข้อ 6.9) · ไม่มี DELETE · อ่าน = อ่านลูกค้าได้ (read-through) · สร้าง = note.create · แก้ = note.update (ของตนภายใน 24 ชม. ตัดสินด้วย now()) · '
'ฟอร์มแสดงคำเตือน "ห้ามบันทึกเลขบัตรประชาชน รายได้ ข้อมูลสุขภาพหรือศาสนา" · body ผ่าน app.trg_guard_restricted_text (ข้อ 10.1) · '
'"รายละเอียดเพิ่มเติม" ของ Quick Capture = โน้ตแรก (ข้อ 6.2)';
COMMENT ON COLUMN crm.customer_notes.interaction_id IS 'interaction ที่โน้ตนี้บันทึกประกอบ (ไม่บังคับ)';
COMMENT ON COLUMN crm.customer_notes.branch_id IS
'สาขาที่บันทึก ใช้ประเมิน scope ของ note.update (ข้อ 8.0) · หมายเหตุผู้เขียน: ข้อ 6.9 ไม่ระบุ NOT NULL แต่ scope ต่อแถวต้องมีสาขา จึงบังคับ';
COMMENT ON COLUMN crm.customer_notes.body IS '[pii] เนื้อหาโน้ต ≤ 2,000 ตัวอักษร · anonymize แทนด้วยข้อความคงที่ (ไม่ใช่ค่าว่าง)';
COMMENT ON COLUMN crm.customer_notes.is_pinned IS 'ปักหมุด · โน้ตที่ปักหมุดล่าสุดถูกคัดลอกไป customers.note_summary';


-- =====================================================================================
-- ส่วนที่ 6 — Tag (ข้อ 5.9)
-- =====================================================================================

CREATE TABLE crm.tags (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid        NOT NULL REFERENCES core.organizations (id),
    code             text        NOT NULL,
    label_th         text        NOT NULL,
    is_active        boolean     NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        REFERENCES core.staff_profiles (id),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid        REFERENCES core.staff_profiles (id),

    CONSTRAINT tags_code_uq  UNIQUE (organization_id, code),
    CONSTRAINT tags_code_chk CHECK (code ~ '^[A-Z0-9_]+$')
);

COMMENT ON TABLE crm.tags IS
'Tag ของลูกค้า (ข้อ 5.9) · ข้อมูลขององค์กร (ไม่ใช่ ref) · สร้าง/แก้ด้วย tag.manage (MARKETING · BUSINESS_ADMIN) ที่หน้า master-data แท็บ Tag · '
'seed: VIP ลูกค้าคนสำคัญ (VIP) · INSTALLMENT ผ่อนชำระ · STUDENT นักศึกษา · TRADE_IN Trade-in · IPHONE_FAN สาย iPhone [รอยืนยัน] · '
'code VIP ถูกอ้างในกติกาป้ายเสริม (ข้อ 3.5) ห้ามเปลี่ยน · ห้ามลบ (is_active = false)';
COMMENT ON COLUMN crm.tags.code IS 'รหัส tag ไม่ซ้ำในองค์กร';
COMMENT ON COLUMN crm.tags.label_th IS 'ชื่อที่แสดง';
COMMENT ON COLUMN crm.tags.is_active IS 'false = เลือกใหม่ไม่ได้ (แถว customer_tags เดิมคงอยู่)';

CREATE TABLE crm.customer_tags (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid        NOT NULL REFERENCES core.organizations (id),
    customer_id      uuid        NOT NULL REFERENCES crm.customers (id),
    tag_id           uuid        NOT NULL REFERENCES crm.tags (id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        REFERENCES core.staff_profiles (id),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid        REFERENCES core.staff_profiles (id),

    CONSTRAINT customer_tags_uq UNIQUE (customer_id, tag_id)
);

CREATE INDEX customer_tags_tag_id_idx ON crm.customer_tags (tag_id);

COMMENT ON TABLE crm.customer_tags IS
'tag ที่ติดกับลูกค้า (ข้อ 8.3) · SELECT = ลูกค้าอ่านได้ · INSERT/DELETE = customer.update บนลูกค้า และ tag ต้อง is_active · '
'DELETE ได้ (บันทึก CUSTOMER_TAG_REMOVED) · merge ย้ายด้วย ON CONFLICT DO NOTHING';


-- =====================================================================================
-- ส่วนที่ 7 — crm.customer_consents (ข้อ 10.2 · append-only)
-- =====================================================================================

CREATE TABLE crm.customer_consents (
    id               uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid                    NOT NULL REFERENCES core.organizations (id),
    customer_id      uuid                    NOT NULL REFERENCES crm.customers (id),
    purpose_code     text                    NOT NULL REFERENCES ref.consent_purposes (code),
    status           crm.consent_status      NOT NULL,
    notice_version   text,
    channels         text[]                  NOT NULL DEFAULT '{}',
    captured_via     crm.consent_capture_via NOT NULL,
    captured_by      uuid                    REFERENCES core.staff_profiles (id),
    captured_at      timestamptz             NOT NULL DEFAULT now(),
    evidence         text                    NOT NULL,
    created_at       timestamptz             NOT NULL DEFAULT now(),
    created_by       uuid                    REFERENCES core.staff_profiles (id),
    updated_at       timestamptz             NOT NULL DEFAULT now(),
    updated_by       uuid                    REFERENCES core.staff_profiles (id),

    -- ช่องทางของความยินยอม ⊆ {LINE, SMS, PHONE, EMAIL} (ข้อ 5.8)
    CONSTRAINT customer_consents_channels_chk
        CHECK (channels <@ ARRAY['LINE', 'SMS', 'PHONE', 'EMAIL']::text[] AND array_position(channels, NULL) IS NULL),
    CONSTRAINT customer_consents_evidence_chk CHECK (btrim(evidence) <> ''),
    -- หมายเหตุผู้เขียน: การบันทึกโดยพนักงาน (ฟอร์ม/ส่งลิงก์) ต้องระบุผู้บันทึก
    CONSTRAINT customer_consents_captured_by_chk
        CHECK (captured_via NOT IN ('STAFF_FORM', 'LINK_SENT') OR captured_by IS NOT NULL)
);

CREATE INDEX customer_consents_current_idx ON crm.customer_consents (customer_id, purpose_code, captured_at DESC, created_at DESC);

COMMENT ON TABLE crm.customer_consents IS
'ประวัติการแจ้งประกาศ/ความยินยอม (ข้อ 10.2 · [รอยืนยัน DPO]) · append-only: ไม่มี UPDATE/DELETE ไม่มีคอลัมน์ withdrawn_at · ถอน = แถวใหม่ WITHDRAWN · '
'เขียนผ่าน api.quick_capture (PRIVACY_NOTICE) และ api.record_consent (customer.consent.manage) เท่านั้น · '
'ข้อยกเว้นเดียวที่ UPDATE: app.anonymize_customer ล้าง evidence (ข้อ 10.4) · สถานะปัจจุบันอ่านจาก view crm.customer_consent_current · '
'MARKETING บังคับติ๊กเพิ่ม "ลูกค้าอายุ 20 ปีขึ้นไป หรือผู้ใช้อำนาจปกครองยินยอม" (ตรวจใน RPC)';
COMMENT ON COLUMN crm.customer_consents.purpose_code IS 'PRIVACY_NOTICE · MARKETING (ref.consent_purposes)';
COMMENT ON COLUMN crm.customer_consents.status IS 'GRANTED · WITHDRAWN';
COMMENT ON COLUMN crm.customer_consents.notice_version IS 'ฉบับประกาศความเป็นส่วนตัวที่แจ้ง เช่น PN-2026-01 [รอยืนยัน Q9]';
COMMENT ON COLUMN crm.customer_consents.channels IS 'ช่องทางที่ยินยอม ⊆ {LINE, SMS, PHONE, EMAIL} (ใช้กับ MARKETING · ใช้กรองคอลัมน์ส่งออกข้อ 8.2) · ว่างได้';
COMMENT ON COLUMN crm.customer_consents.captured_via IS 'STAFF_FORM · LINK_SENT (ช่องทางออนไลน์/โทรบันทึก PRIVACY_NOTICE ได้เมื่อส่งลิงก์แล้ว) · LINE_OA · WEB';
COMMENT ON COLUMN crm.customer_consents.captured_by IS 'พนักงานผู้บันทึก (บังคับเมื่อ STAFF_FORM หรือ LINK_SENT)';
COMMENT ON COLUMN crm.customer_consents.captured_at IS 'เวลาที่แจ้ง/ได้รับความยินยอม · แถวล่าสุดต่อ purpose ตามคอลัมน์นี้คือสถานะปัจจุบัน';
COMMENT ON COLUMN crm.customer_consents.evidence IS '[pii] หลักฐาน: version + ช่องทาง + ข้อความ/ลิงก์ที่ส่ง (บังคับ)';


-- =====================================================================================
-- ส่วนที่ 8 — crm.duplicate_decisions (ข้อ 6.5 · 6.7)
-- =====================================================================================

CREATE TABLE crm.duplicate_decisions (
    id                     uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        uuid                 NOT NULL REFERENCES core.organizations (id),
    customer_id            uuid                 NOT NULL REFERENCES crm.customers (id),
    candidate_customer_id  uuid                 NOT NULL REFERENCES crm.customers (id),
    score                  integer              NOT NULL,
    matched_rules          text[]               NOT NULL DEFAULT '{}',
    override_reason_code   text                 NOT NULL REFERENCES ref.duplicate_override_reasons (code),
    override_note          text,
    status                 crm.duplicate_status NOT NULL DEFAULT 'PENDING',
    created_by             uuid                 NOT NULL REFERENCES core.staff_profiles (id),
    created_at             timestamptz          NOT NULL DEFAULT now(),
    decided_by             uuid                 REFERENCES core.staff_profiles (id),
    decided_at             timestamptz,
    decision_note          text,
    updated_at             timestamptz          NOT NULL DEFAULT now(),
    updated_by             uuid                 REFERENCES core.staff_profiles (id),

    -- 1 แถวต่อ 1 ลูกค้าที่สร้างใหม่ คู่กับผู้สมัครคะแนนสูงสุด (ข้อ 6.5)
    CONSTRAINT duplicate_decisions_customer_uq  UNIQUE (customer_id),
    CONSTRAINT duplicate_decisions_pair_chk     CHECK (customer_id <> candidate_customer_id),
    -- สร้างแถวเฉพาะเมื่อผู้สมัครคะแนน ≥ 70 (ข้อ 6.5)
    CONSTRAINT duplicate_decisions_score_chk    CHECK (score >= 70),
    CONSTRAINT duplicate_decisions_decided_chk  CHECK ((status = 'PENDING') = (decided_by IS NULL)
                                                       AND (decided_by IS NULL) = (decided_at IS NULL)),
    -- ผู้ตัดสิน ≠ ผู้สร้างแถว (ข้อ 6.7 · 12.3)
    CONSTRAINT duplicate_decisions_decider_chk  CHECK (decided_by IS NULL OR decided_by <> created_by)
);

CREATE INDEX duplicate_decisions_candidate_idx ON crm.duplicate_decisions (candidate_customer_id);
CREATE INDEX duplicate_decisions_pending_idx   ON crm.duplicate_decisions (created_at) WHERE status = 'PENDING';

COMMENT ON TABLE crm.duplicate_decisions IS
'ลูกค้าที่อาจซ้ำซึ่งผู้ใช้ยืนยันสร้างใหม่ (ข้อ 6.5 · 6.7 · คอลัมน์ตาม CANONICAL) · สร้างโดย api.quick_capture เมื่อมีผู้สมัครคะแนน ≥ 70 · '
'ตัดสินด้วย api.merge_customers (→ MERGED) หรือ api.decide_duplicate (→ NOT_DUPLICATE) ที่ต้องมี customer.merge 🔐 บนลูกค้าทั้งสองราย · '
'SELECT = data_quality.view บนลูกค้าทั้งสองราย · เขียนผ่าน RPC เท่านั้น · ไม่มีการ merge อัตโนมัติ · ที่มาของ DUPLICATE_SUSPECTED และ DUPLICATE_RATE';
COMMENT ON COLUMN crm.duplicate_decisions.customer_id IS 'ลูกค้าที่สร้างใหม่';
COMMENT ON COLUMN crm.duplicate_decisions.candidate_customer_id IS 'ลูกค้าเดิมที่คะแนนสูงสุด';
COMMENT ON COLUMN crm.duplicate_decisions.score IS 'คะแนนของผู้สมัครตามกฎข้อ 6.5 (100 เบอร์/LINE · 90 อีเมล · 70 ชื่อ+นามสกุล+4 หลักท้าย) · ≥ 70 เสมอ';
COMMENT ON COLUMN crm.duplicate_decisions.matched_rules IS
'เหตุผลของกฎที่ตรง เช่น {"เบอร์โทรตรงกัน"} · หมายเหตุผู้เขียน: CANONICAL ไม่กำหนดรหัสกฎ จึงเก็บข้อความเหตุผลตามการ์ดผลลัพธ์ [รอยืนยันรหัส]';
COMMENT ON COLUMN crm.duplicate_decisions.override_reason_code IS 'เหตุผลที่ยังสร้างใหม่ (ref.duplicate_override_reasons) · OTHER บังคับ override_note (ตรวจใน RPC)';
COMMENT ON COLUMN crm.duplicate_decisions.override_note IS '[pii] หมายเหตุประกอบเหตุผล · anonymize ล้างค่า (ข้อ 10.4)';
COMMENT ON COLUMN crm.duplicate_decisions.status IS 'PENDING · MERGED · NOT_DUPLICATE';
COMMENT ON COLUMN crm.duplicate_decisions.created_by IS 'ผู้ที่ยืนยันสร้างลูกค้าใหม่ (บังคับ · ใช้กติกาผู้ตัดสิน ≠ ผู้สร้าง)';
COMMENT ON COLUMN crm.duplicate_decisions.decided_by IS 'ผู้ตัดสิน (aal2)';
COMMENT ON COLUMN crm.duplicate_decisions.decision_note IS 'หมายเหตุการตัดสิน (p_note ของ api.decide_duplicate)';


-- =====================================================================================
-- ส่วนที่ 9 — crm.customer_merges (ข้อ 6.7)
-- =====================================================================================

CREATE TABLE crm.customer_merges (
    id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        uuid        NOT NULL REFERENCES core.organizations (id),
    merge_no               text        NOT NULL UNIQUE,
    survivor_customer_id   uuid        NOT NULL REFERENCES crm.customers (id),
    merged_customer_id     uuid        NOT NULL REFERENCES crm.customers (id),
    duplicate_decision_id  uuid        REFERENCES crm.duplicate_decisions (id),
    reason                 text        NOT NULL,
    field_choices          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    snapshot               jsonb       NOT NULL,
    moved_counts           jsonb       NOT NULL DEFAULT '{}'::jsonb,
    merged_by              uuid        NOT NULL REFERENCES core.staff_profiles (id),
    merged_at              timestamptz NOT NULL DEFAULT now(),
    created_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid        REFERENCES core.staff_profiles (id),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    updated_by             uuid        REFERENCES core.staff_profiles (id),

    CONSTRAINT customer_merges_no_chk      CHECK (merge_no ~ '^MG-[0-9]{4}-[0-9]{6,}$'),
    CONSTRAINT customer_merges_pair_chk    CHECK (survivor_customer_id <> merged_customer_id),
    -- ลูกค้ารายหนึ่งถูกรวมออกได้ครั้งเดียว (V1 ไม่มี unmerge)
    CONSTRAINT customer_merges_merged_uq   UNIQUE (merged_customer_id),
    CONSTRAINT customer_merges_json_chk    CHECK (jsonb_typeof(field_choices) = 'object' AND jsonb_typeof(moved_counts) = 'object')
);

CREATE INDEX customer_merges_survivor_idx ON crm.customer_merges (survivor_customer_id);
CREATE INDEX customer_merges_decision_idx ON crm.customer_merges (duplicate_decision_id) WHERE duplicate_decision_id IS NOT NULL;

COMMENT ON TABLE crm.customer_merges IS
'ประวัติการรวมลูกค้า (ข้อ 6.7) · เขียนโดย api.merge_customers ในทรานแซกชันเดียวกับการย้ายข้อมูล (app.bulk = on) · SELECT = แถวแม่อ่านได้ · V1 ไม่มี unmerge';
COMMENT ON COLUMN crm.customer_merges.merge_no IS 'เลขการรวม MG-{YYYY}-{NNNNNN} ตัวนับ MG:{YYYY}';
COMMENT ON COLUMN crm.customer_merges.survivor_customer_id IS 'ลูกค้าที่คงอยู่';
COMMENT ON COLUMN crm.customer_merges.merged_customer_id IS 'ลูกค้าที่ถูกรวม (record_status → MERGED)';
COMMENT ON COLUMN crm.customer_merges.duplicate_decision_id IS 'แถว duplicate_decisions ที่การรวมนี้ปิด (ถ้ามี)';
COMMENT ON COLUMN crm.customer_merges.reason IS 'เหตุผลการรวม (p_reason)';
COMMENT ON COLUMN crm.customer_merges.field_choices IS
'p_field_choices: เลือกค่าของแต่ละ field จากรายใด · first_seen_at/first_channel_code/first_source_code/first_branch_id ไม่ใช้ค่านี้ (มาจากรายที่ first_seen_at เก่ากว่า)';
COMMENT ON COLUMN crm.customer_merges.snapshot IS '[pii] ภาพก่อนรวมของทั้งสองรายแบบปิดบัง PII ตามกติกา audit (ข้อ 9.5) · anonymize ล้างค่า';
COMMENT ON COLUMN crm.customer_merges.moved_counts IS 'จำนวนแถวที่ย้ายแยกตาราง เช่น {"crm.visits": 3, "crm.customer_contacts": 1}';
COMMENT ON COLUMN crm.customer_merges.merged_by IS 'ผู้รวม (customer.merge 🔐 · ≠ duplicate_decisions.created_by)';


-- =====================================================================================
-- ส่วนที่ 10 — crm.data_subject_requests (ข้อ 10.4)
-- =====================================================================================

CREATE TABLE crm.data_subject_requests (
    id                        uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id           uuid           NOT NULL REFERENCES core.organizations (id),
    request_no                text           NOT NULL UNIQUE,
    customer_id               uuid           REFERENCES crm.customers (id),
    requester_name            text           NOT NULL,
    requester_contact_masked  text,
    request_type              crm.dsr_type   NOT NULL,
    status                    crm.dsr_status NOT NULL DEFAULT 'RECEIVED',
    received_at               timestamptz    NOT NULL DEFAULT now(),
    received_by               uuid           NOT NULL REFERENCES core.staff_profiles (id),
    -- due_at = received_at + 30 วัน (นับวันตาม Asia/Bangkok · timezone(text, …) และ timestamp + interval เป็น IMMUTABLE)
    due_at                    timestamptz    GENERATED ALWAYS AS (
        ((received_at AT TIME ZONE 'Asia/Bangkok') + interval '30 days') AT TIME ZONE 'Asia/Bangkok') STORED,
    verification_method       text,
    verified_by               uuid           REFERENCES core.staff_profiles (id),
    extended_until            timestamptz,
    extension_reason          text,
    completed_at              timestamptz,
    note                      text,
    created_at                timestamptz    NOT NULL DEFAULT now(),
    created_by                uuid           REFERENCES core.staff_profiles (id),
    updated_at                timestamptz    NOT NULL DEFAULT now(),
    updated_by                uuid           REFERENCES core.staff_profiles (id),

    CONSTRAINT data_subject_requests_no_chk           CHECK (request_no ~ '^DSR-[0-9]{4}-[0-9]{6,}$'),
    CONSTRAINT data_subject_requests_verification_chk CHECK (verification_method IS NULL
                                                             OR verification_method IN ('IN_PERSON_ID_SIGHTED', 'OTP_TO_REGISTERED_CONTACT', 'OTHER')),
    -- หมายเหตุผู้เขียน: สถานะหลังยืนยันตัวตนต้องมีผู้ยืนยันและวิธียืนยัน
    CONSTRAINT data_subject_requests_verified_chk     CHECK (status NOT IN ('VERIFIED', 'IN_PROGRESS', 'COMPLETED')
                                                             OR (verified_by IS NOT NULL AND verification_method IS NOT NULL)),
    CONSTRAINT data_subject_requests_completed_chk    CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL)),
    CONSTRAINT data_subject_requests_extension_chk    CHECK (extended_until IS NULL
                                                             OR (extension_reason IS NOT NULL AND btrim(extension_reason) <> ''))
);

CREATE INDEX data_subject_requests_customer_id_idx ON crm.data_subject_requests (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX data_subject_requests_status_due_idx  ON crm.data_subject_requests (status, due_at);
CREATE INDEX data_subject_requests_received_by_idx ON crm.data_subject_requests (received_by);

COMMENT ON TABLE crm.data_subject_requests IS
'คำขอของเจ้าของข้อมูล DSR (ข้อ 10.4 · [รอยืนยัน DPO]) · รับคำขอที่หน้าร้าน: api.create_dsr (dsr.create · ST/SV/BM/BA) · ดำเนินการ: dsr.manage 🔐 (BA) · '
'SELECT = dsr.manage (ผู้รับคำขอเห็นของตน) · ACCESS/PORTABILITY → api.build_dsr_package · WITHDRAW_CONSENT/OBJECTION → consent WITHDRAWN · '
'DELETION → api.anonymize_customer (ต้อง VERIFIED และ verified_by ≠ ผู้ดำเนินการ) · ห้ามเก็บสำเนาบัตร · หน้า 17 ใน seed ไม่มีรายการ';
COMMENT ON COLUMN crm.data_subject_requests.request_no IS 'เลขคำขอ DSR-{YYYY}-{NNNNNN} ตัวนับ DSR:{YYYY}';
COMMENT ON COLUMN crm.data_subject_requests.customer_id IS 'ลูกค้าที่เกี่ยวข้อง · NULL ได้ (ยังระบุตัวลูกค้าไม่ได้)';
COMMENT ON COLUMN crm.data_subject_requests.requester_name IS
'[pii] ชื่อผู้ยื่นคำขอ · หมายเหตุผู้เขียน: การล้างค่านี้ตอน anonymize (เก็บเป็นหลักฐานการดำเนินการ) รอยืนยัน DPO';
COMMENT ON COLUMN crm.data_subject_requests.requester_contact_masked IS 'ช่องทางติดต่อกลับของผู้ยื่นแบบปิดบังเท่านั้น (รูปแบบเดียวกับ app.mask_contact)';
COMMENT ON COLUMN crm.data_subject_requests.request_type IS 'ACCESS · CORRECTION · DELETION · OBJECTION · WITHDRAW_CONSENT · PORTABILITY';
COMMENT ON COLUMN crm.data_subject_requests.status IS 'RECEIVED → VERIFIED → IN_PROGRESS → COMPLETED หรือ REJECTED';
COMMENT ON COLUMN crm.data_subject_requests.received_by IS 'พนักงานผู้รับคำขอ';
COMMENT ON COLUMN crm.data_subject_requests.due_at IS 'generated: กำหนดเสร็จ = received_at + 30 วัน · การขยายเวลาใช้ extended_until';
COMMENT ON COLUMN crm.data_subject_requests.verification_method IS
'IN_PERSON_ID_SIGHTED เห็นบัตรต่อหน้า · OTP_TO_REGISTERED_CONTACT · OTHER — ห้ามเก็บสำเนาบัตร';
COMMENT ON COLUMN crm.data_subject_requests.verified_by IS 'ผู้ยืนยันตัวตนผู้ยื่น (≠ ผู้ดำเนินการ anonymize)';
COMMENT ON COLUMN crm.data_subject_requests.extended_until IS 'กำหนดเสร็จใหม่เมื่อขยายเวลา (ต้องมี extension_reason)';
COMMENT ON COLUMN crm.data_subject_requests.extension_reason IS 'เหตุผลการขยายเวลา';
COMMENT ON COLUMN crm.data_subject_requests.completed_at IS 'เวลาดำเนินการเสร็จ (มีค่าเมื่อ COMPLETED เท่านั้น)';
COMMENT ON COLUMN crm.data_subject_requests.note IS '[pii] หมายเหตุการดำเนินการ';


-- =====================================================================================
-- ส่วนที่ 11 — view สถานะความยินยอมปัจจุบัน (ข้อ 10.2 · security_invoker ข้อ 9.4 กติกา 4)
-- =====================================================================================

CREATE VIEW crm.customer_consent_current
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (c.customer_id, c.purpose_code)
       c.id,
       c.organization_id,
       c.customer_id,
       c.purpose_code,
       c.status,
       c.notice_version,
       c.channels,
       c.captured_via,
       c.captured_by,
       c.captured_at
FROM crm.customer_consents c
ORDER BY c.customer_id, c.purpose_code, c.captured_at DESC, c.created_at DESC, c.id DESC;

COMMENT ON VIEW crm.customer_consent_current IS
'สถานะความยินยอมปัจจุบัน = แถวล่าสุดต่อ (ลูกค้า, purpose) ตาม captured_at แล้ว created_at (ข้อ 10.2) · security_invoker ผ่าน RLS ของ customer_consents · '
'ไม่มีคอลัมน์ evidence (ค่า pii ไม่อยู่ใน view) · "ยินยอม MARKETING" = แถวของ purpose MARKETING ที่ status = GRANTED';


-- =====================================================================================
-- ส่วนที่ 12 — updated_at trigger · RLS ทุกตาราง (policy/grant อยู่ใน migration 0010)
-- =====================================================================================

CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.customers             FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.customer_contacts     FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.customer_addresses    FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.customer_branches     FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.customer_notes        FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.tags                  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.customer_tags         FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.customer_consents     FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.duplicate_decisions   FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.customer_merges       FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON crm.data_subject_requests FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE crm.customers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.customer_contacts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.customer_addresses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.customer_branches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.customer_notes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.tags                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.customer_tags         ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.customer_consents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.duplicate_decisions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.customer_merges       ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.data_subject_requests ENABLE ROW LEVEL SECURITY;
