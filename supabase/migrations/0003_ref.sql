-- =====================================================================================
-- JAUN CRM · Customer 360
-- migration 0003 : ref — Master Data (lookup) ทุกตารางและทุกค่า
-- target        : Supabase PostgreSQL 17
--
-- ค่าอ้างอิง (docs/00-brief/CANONICAL.md v2.1): ข้อ 4.2 · 4.7 · 5.1–5.8 · 14.6
--
-- คอลัมน์มาตรฐานของทุกตาราง lookup (ข้อ 5):
--   code text PK · label_th · label_en · sort_order · is_active · is_system · created_at · updated_at · ไม่มี organization_id
--   · is_system = ค่าที่โค้ด/กติกาใน CANONICAL อ้างถึงโดยตรง → ปิดใช้งานไม่ได้ (CHECK is_active OR NOT is_system)
--   · ห้ามลบ (ใช้ is_active = false) — authenticated ไม่มี GRANT DELETE · เขียนได้เฉพาะ master_data.manage + aal2 (migration 0010)
--   · sort_order = ลำดับในตาราง CANONICAL (เริ่ม 1)
--   · label_en: หมายเหตุผู้เขียน — CANONICAL ไม่มีป้ายอังกฤษของค่าส่วนใหญ่ ใส่เฉพาะคำอังกฤษที่ปรากฏใน CANONICAL/REQUIREMENT
--     สำหรับค่านั้นโดยตรง (เช่น A8 Price · Stock · ชื่อแบรนด์ · ชื่อจังหวัดตาม ISO 3166-2:TH) · NULL = รอยืนยัน (ไม่เดาคำแปล)
-- =====================================================================================


-- =====================================================================================
-- 5.1 ช่องทางติดต่อ — ref.channels
-- =====================================================================================

CREATE TABLE ref.channels (
    code           text        PRIMARY KEY,
    label_th       text        NOT NULL,
    label_en       text,
    sort_order     integer     NOT NULL,
    is_active      boolean     NOT NULL DEFAULT true,
    is_system      boolean     NOT NULL DEFAULT false,
    channel_group  text        NOT NULL,
    is_live        boolean     NOT NULL,
    chart_token    text        NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT channels_code_chk         CHECK (code ~ '^[A-Z0-9_]+$'),
    CONSTRAINT channels_system_active_chk CHECK (is_active OR NOT is_system),
    CONSTRAINT channels_group_chk        CHECK (channel_group IN ('offline', 'online')),
    CONSTRAINT channels_chart_token_chk  CHECK (chart_token ~ '^--chart-[0-9]+$')
);

COMMENT ON TABLE ref.channels IS
'ช่องทางที่ลูกค้าติดต่อ (ข้อ 5.1) · ช่องทาง ≠ แหล่งที่มา (ref.sources) · กราฟ "แหล่งที่มาลูกค้า" ใช้ customers.first_channel_code';
COMMENT ON COLUMN ref.channels.label_th IS 'ชื่อที่แสดง';
COMMENT ON COLUMN ref.channels.label_en IS 'ชื่ออังกฤษตามบรีฟ A1 (Walk-in · LINE · Facebook · Instagram · TikTok · Phone · Web)';
COMMENT ON COLUMN ref.channels.is_system IS 'WALK_IN และ PHONE ถูกอ้างในกติกา (ข้อ 3.1 · 4.1 · 6.2 · 12.2 · 12.3)';
COMMENT ON COLUMN ref.channels.channel_group IS 'กลุ่ม offline/online (คอลัมน์ "กลุ่ม" ข้อ 5.1)';
COMMENT ON COLUMN ref.channels.is_live IS
'คุยสด (true: WALK_IN · PHONE) หรือข้อความ (false) · lead จากช่องทางสดเริ่ม CONTACTED จากช่องทางข้อความเริ่ม NEW (ข้อ 4.3) · ฐานของ LEAD_RESPONSE_MIN (ข้อ 12.2)';
COMMENT ON COLUMN ref.channels.chart_token IS 'token สีกราฟของช่องทาง (ข้อ 5.1 · 15) ค่าสีจริงอยู่ใน design system';

INSERT INTO ref.channels (code, label_th, label_en, sort_order, is_system, channel_group, is_live, chart_token) VALUES
    ('WALK_IN',   'Walk-in (หน้าร้าน)', 'Walk-in',   1, true,  'offline', true,  '--chart-1'),
    ('LINE',      'LINE',               'LINE',      2, false, 'online',  false, '--chart-2'),
    ('FACEBOOK',  'Facebook',           'Facebook',  3, false, 'online',  false, '--chart-3'),
    ('INSTAGRAM', 'Instagram',          'Instagram', 4, false, 'online',  false, '--chart-4'),
    ('TIKTOK',    'TikTok',             'TikTok',    5, false, 'online',  false, '--chart-5'),
    ('PHONE',     'โทรศัพท์',            'Phone',     6, true,  'offline', true,  '--chart-6'),
    ('WEBSITE',   'เว็บไซต์',            'Web',       7, false, 'online',  false, '--chart-7');


-- =====================================================================================
-- 5.2 แหล่งที่รู้จักร้าน — ref.sources [รอยืนยัน]
-- =====================================================================================

CREATE TABLE ref.sources (
    code        text        PRIMARY KEY,
    label_th    text        NOT NULL,
    label_en    text,
    sort_order  integer     NOT NULL,
    is_active   boolean     NOT NULL DEFAULT true,
    is_system   boolean     NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT sources_code_chk          CHECK (code ~ '^[A-Z0-9_]+$'),
    CONSTRAINT sources_system_active_chk CHECK (is_active OR NOT is_system)
);

COMMENT ON TABLE ref.sources IS
'แหล่งที่ลูกค้ารู้จักร้าน (ข้อ 5.2 · [รอยืนยัน Q13]) · ใช้กับ customers.first_source_code และ visits/leads.source_code · Customer 360 แสดง "รู้จักร้านจาก {label_th}"';

INSERT INTO ref.sources (code, label_th, sort_order) VALUES
    ('FACEBOOK_ADS',      'โฆษณา Facebook',         1),
    ('FACEBOOK_PAGE',     'เพจ Facebook',           2),
    ('TIKTOK',            'TikTok',                 3),
    ('INSTAGRAM',         'Instagram',              4),
    ('LINE_OA',           'LINE OA',                5),
    ('GOOGLE_MAPS',       'Google Maps',            6),
    ('PASSING_BY',        'เดินผ่านหน้าร้าน',        7),
    ('REFERRAL',          'เพื่อน/คนรู้จักแนะนำ',     8),
    ('EXISTING_CUSTOMER', 'ลูกค้าเดิม',              9),
    ('EVENT',             'งานอีเวนต์/บูธ',          10),
    ('OTHER',             'อื่น ๆ',                  11);


-- =====================================================================================
-- 5.3 วัตถุประสงค์/ความสนใจ — ref.interest_types (B6)
-- =====================================================================================

CREATE TABLE ref.interest_types (
    code          text        PRIMARY KEY,
    label_th      text        NOT NULL,
    label_en      text,
    sort_order    integer     NOT NULL,
    is_active     boolean     NOT NULL DEFAULT true,
    is_system     boolean     NOT NULL DEFAULT false,
    creates_lead  boolean     NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT interest_types_code_chk          CHECK (code ~ '^[A-Z0-9_]+$'),
    CONSTRAINT interest_types_system_active_chk CHECK (is_active OR NOT is_system)
);

COMMENT ON TABLE ref.interest_types IS
'วัตถุประสงค์/ความสนใจของลูกค้า (ข้อ 5.3 · B6) · หน้ารับลูกค้าแสดงชิปครบทุกค่าที่ is_active ตาม sort_order · '
'"Service Type" ในบรีฟ = ตารางนี้ + ref.transaction_types (D39)';
COMMENT ON COLUMN ref.interest_types.label_en IS 'ใส่เฉพาะคำอังกฤษจากบรีฟ B6 (Trade-in · Accessories) · NULL = รอยืนยัน';
COMMENT ON COLUMN ref.interest_types.creates_lead IS
'true = ถือเป็นโอกาสขาย · api.quick_capture สร้าง lead อัตโนมัติ (owner = ผู้บันทึก) · REPAIR/INQUIRY ไม่สร้าง (ข้อ 6.2)';

INSERT INTO ref.interest_types (code, label_th, label_en, sort_order, creates_lead) VALUES
    ('BUY',         'ซื้อเครื่อง',          NULL,          1, true),
    ('SELL',        'ขายเครื่อง (รับซื้อ)', NULL,          2, true),
    ('TRADE_IN',    'เทิร์นเครื่อง',        'Trade-in',    3, true),
    ('INSTALLMENT', 'ผ่อน',               NULL,          4, true),
    ('ACCESSORY',   'อุปกรณ์เสริม',        'Accessories', 5, true),
    ('REPAIR',      'ซ่อม',               NULL,          6, false),
    ('INQUIRY',     'สอบถาม/โปรโมชั่น',    NULL,          7, false);


-- =====================================================================================
-- 5.4 ประเภทสินค้า — ref.product_types [รอยืนยัน]
-- =====================================================================================

CREATE TABLE ref.product_types (
    code        text        PRIMARY KEY,
    label_th    text        NOT NULL,
    label_en    text,
    sort_order  integer     NOT NULL,
    is_active   boolean     NOT NULL DEFAULT true,
    is_system   boolean     NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT product_types_code_chk          CHECK (code ~ '^[A-Z0-9_]+$'),
    CONSTRAINT product_types_system_active_chk CHECK (is_active OR NOT is_system)
);

COMMENT ON TABLE ref.product_types IS
'ประเภทสินค้า (ข้อ 5.4 · [รอยืนยัน Q13]) · รุ่นเก็บเป็นข้อความ product_model ใน V1 (catalog จาก POS ใน Phase 4)';
COMMENT ON COLUMN ref.product_types.label_en IS 'ชื่อแบรนด์ภาษาอังกฤษเท่ากับป้ายที่แสดง · NULL = รอยืนยัน';

INSERT INTO ref.product_types (code, label_th, label_en, sort_order) VALUES
    ('IPHONE',      'iPhone',        'iPhone',      1),
    ('IPAD',        'iPad',          'iPad',        2),
    ('MAC',         'Mac',           'Mac',         3),
    ('APPLE_WATCH', 'Apple Watch',   'Apple Watch', 4),
    ('AIRPODS',     'AirPods',       'AirPods',     5),
    ('ANDROID',     'สมาร์ตโฟนอื่น',   NULL,          6),
    ('ACCESSORY',   'อุปกรณ์เสริม',    NULL,          7),
    ('OTHER',       'อื่น ๆ',         NULL,          8);


-- =====================================================================================
-- 5.5 เหตุผลที่ไม่สำเร็จ — ref.lost_reasons (A8 · B8 · mockup B)
-- =====================================================================================

CREATE TABLE ref.lost_reasons (
    code        text        PRIMARY KEY,
    label_th    text        NOT NULL,
    label_en    text,
    sort_order  integer     NOT NULL,
    is_active   boolean     NOT NULL DEFAULT true,
    is_system   boolean     NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT lost_reasons_code_chk          CHECK (code ~ '^[A-Z0-9_]+$'),
    CONSTRAINT lost_reasons_system_active_chk CHECK (is_active OR NOT is_system)
);

COMMENT ON TABLE ref.lost_reasons IS
'เหตุผลที่ lead/opportunity ไม่สำเร็จ (ข้อ 5.5) · กราฟแสดง 5 อันดับแรก + "อื่น ๆ" เรียงมากไปน้อย คะแนนเท่ากันเรียงตาม sort_order · '
'OTHER บังคับ lost_note (ตรวจใน trigger/RPC ของ leads/opportunities)';
COMMENT ON COLUMN ref.lost_reasons.label_en IS 'คำอังกฤษจากบรีฟ A8 (Price · Timing · Stock · Product · Competitor · Finance · Down Payment · Promotion · Contact · Service · Other) · ค่าจาก mockup B เป็น NULL';
COMMENT ON COLUMN ref.lost_reasons.is_system IS 'OTHER ถูกอ้างในกติกา "บังคับ lost_note"';

INSERT INTO ref.lost_reasons (code, label_th, label_en, sort_order, is_system) VALUES
    ('PRICE',              'ราคาสูงไป',             'Price',        1,  false),
    ('COMPARING',          'รอเปรียบเทียบ',          NULL,           2,  false),   -- [รอยืนยัน Q10]
    ('NOT_READY',          'ลูกค้ายังไม่พร้อม',       'Timing',       3,  false),
    ('DOCUMENTS',          'ติดเรื่องเอกสาร',         NULL,           4,  false),
    ('CHANGED_MIND',       'เปลี่ยนรุ่น/เปลี่ยนใจ',    NULL,           5,  false),
    ('OUT_OF_STOCK',       'ไม่มีสินค้า',             'Stock',        6,  false),
    ('NO_MODEL_COLOR',     'ไม่มีรุ่น/สีที่ต้องการ',    'Product',      7,  false),
    ('COMPETITOR',         'ซื้อร้านอื่น',            'Competitor',   8,  false),
    ('FINANCE_REJECTED',   'ผ่อน/เครดิตไม่ผ่าน',      'Finance',      9,  false),
    ('DOWN_PAYMENT',       'เงินดาวน์ไม่พอ',          'Down Payment', 10, false),
    ('PROMOTION',          'โปรโมชั่นไม่ตรง',         'Promotion',    11, false),
    ('UNREACHABLE',        'ติดต่อไม่ได้',            'Contact',      12, false),
    ('SERVICE_EXPERIENCE', 'ประสบการณ์บริการ',        'Service',      13, false),
    ('OTHER',              'อื่น ๆ',                 'Other',        14, true);


-- =====================================================================================
-- 4.2 ผลของ visit — ref.visit_outcomes (is_system = true ทั้งหมด)
-- =====================================================================================

CREATE TABLE ref.visit_outcomes (
    code                text        PRIMARY KEY,
    label_th            text        NOT NULL,
    label_en            text,
    sort_order          integer     NOT NULL,
    is_active           boolean     NOT NULL DEFAULT true,
    is_system           boolean     NOT NULL DEFAULT true,
    counts_as_recorded  boolean     NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT visit_outcomes_code_chk          CHECK (code ~ '^[A-Z0-9_]+$'),
    CONSTRAINT visit_outcomes_system_active_chk CHECK (is_active OR NOT is_system)
);

COMMENT ON TABLE ref.visit_outcomes IS
'ผลของการให้บริการเมื่อปิด visit (ข้อ 4.2) · is_system ทุกค่า · สี่ค่าแรกจาก B6 สามค่าหลังเป็นข้อเสนอเพิ่ม [รอยืนยัน] · '
'ผลต่อรายการอื่นบังคับใน api.close_visit: PURCHASED/FOLLOW_UP ต้องมี customer_id · FOLLOW_UP ต้องมี lead/opportunity เปิดที่มี next action · '
'NOT_YET ถ้ามีรายการเปิดต้องมี next action · NOT_INTERESTED lead ที่เปิดจาก visit นี้ต้องปิด LOST · LEFT_BEFORE_SERVICE ตั้งอัตโนมัติเมื่อ LEFT · UNRECORDED ตั้งโดย app.job_close_stale_visits';
COMMENT ON COLUMN ref.visit_outcomes.counts_as_recorded IS
'true = นับเป็น "บันทึกผลครบ" ในตัวตั้งของ OUTCOME_COMPLETION (ข้อ 12.2) · false เฉพาะ UNRECORDED';

INSERT INTO ref.visit_outcomes (code, label_th, sort_order, counts_as_recorded) VALUES
    ('PURCHASED',           'ซื้อแล้ว',                             1, true),
    ('FOLLOW_UP',           'นัดติดตาม',                            2, true),
    ('NOT_YET',             'ยังไม่ซื้อ',                            3, true),
    ('NOT_INTERESTED',      'ไม่สนใจ',                              4, true),
    ('SERVICE_DONE',        'ให้บริการเสร็จ (ซ่อม/สอบถาม/ชำระ)',       5, true),
    ('LEFT_BEFORE_SERVICE', 'ออกก่อนรับบริการ',                      6, true),
    ('UNRECORDED',          'ไม่ได้บันทึกผล (ระบบปิดให้)',             7, false);


-- =====================================================================================
-- 5.6 ประเภทการติดต่อ — ref.interaction_types [รอยืนยัน]
-- =====================================================================================

CREATE TABLE ref.interaction_types (
    code        text        PRIMARY KEY,
    label_th    text        NOT NULL,
    label_en    text,
    sort_order  integer     NOT NULL,
    is_active   boolean     NOT NULL DEFAULT true,
    is_system   boolean     NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT interaction_types_code_chk          CHECK (code ~ '^[A-Z0-9_]+$'),
    CONSTRAINT interaction_types_system_active_chk CHECK (is_active OR NOT is_system)
);

COMMENT ON TABLE ref.interaction_types IS
'ประเภทของ interaction (ข้อ 5.6 · [รอยืนยัน Q13]) · NOTE ใช้กับ direction INTERNAL เท่านั้น (ตรวจใน trigger/RPC ของ interactions)';
COMMENT ON COLUMN ref.interaction_types.is_system IS
'VISIT · INQUIRY · PURCHASE (ประเภทของ interaction ต้นทางของ visit ข้อ 3.3 · outcome PURCHASED → PURCHASE) · QUOTATION_SENT (สร้างเมื่อส่งใบเสนอราคา ข้อ 4.6) · NOTE (INTERNAL)';

INSERT INTO ref.interaction_types (code, label_th, sort_order, is_system) VALUES
    ('VISIT',          'เข้าร้าน/รับบริการหน้าร้าน', 1,  true),
    ('INQUIRY',        'สอบถาม',                 2,  true),
    ('CALL',           'โทรติดตาม',               3,  false),
    ('MESSAGE',        'ส่งข้อความ',               4,  false),
    ('QUOTATION_SENT', 'ส่งใบเสนอราคา',            5,  true),
    ('APPOINTMENT',    'นัดหมายเข้าร้าน',           6,  false),
    ('PURCHASE',       'ปิดการขาย',               7,  true),
    ('SERVICE',        'ให้บริการ (ซ่อม/ชำระ)',      8,  false),
    ('COMPLAINT',      'ร้องเรียน',                9,  false),
    ('NOTE',           'บันทึกภายใน',              10, true),
    ('OTHER',          'อื่น ๆ',                  11, false);


-- =====================================================================================
-- 4.7 ประเภทงาน — ref.task_types · ความสำคัญ — ref.priorities
-- =====================================================================================

CREATE TABLE ref.task_types (
    code        text        PRIMARY KEY,
    label_th    text        NOT NULL,
    label_en    text,
    sort_order  integer     NOT NULL,
    is_active   boolean     NOT NULL DEFAULT true,
    is_system   boolean     NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT task_types_code_chk          CHECK (code ~ '^[A-Z0-9_]+$'),
    CONSTRAINT task_types_system_active_chk CHECK (is_active OR NOT is_system)
);

COMMENT ON TABLE ref.task_types IS
'ประเภทงาน (ข้อ 4.7) · ใช้กับ tasks.task_type_code และ next_action_type_code ของ lead/opportunity · follow-up = FOLLOW_UP (D7)';
COMMENT ON COLUMN ref.task_types.is_system IS
'FOLLOW_UP (ป้าย "ติดตามอยู่" ข้อ 3.5 · KPI ข้อ 12) · CALL (next_action_type_code เริ่มต้นของ Quick Capture ข้อ 4.3)';

INSERT INTO ref.task_types (code, label_th, sort_order, is_system) VALUES
    ('FOLLOW_UP',      'ติดตามลูกค้า',    1, true),
    ('CALL',           'โทรหาลูกค้า',     2, true),
    ('APPOINTMENT',    'นัดเข้าร้าน',      3, false),
    ('SEND_QUOTATION', 'ส่งใบเสนอราคา',   4, false),
    ('DOCUMENT',       'ตามเอกสาร',      5, false),
    ('OTHER',          'อื่น ๆ',         6, false);

CREATE TABLE ref.priorities (
    code         text        PRIMARY KEY,
    label_th     text        NOT NULL,
    label_en     text,
    sort_order   integer     NOT NULL,
    is_active    boolean     NOT NULL DEFAULT true,
    is_system    boolean     NOT NULL DEFAULT false,
    color_token  text        NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT priorities_code_chk          CHECK (code ~ '^[A-Z0-9_]+$'),
    CONSTRAINT priorities_system_active_chk CHECK (is_active OR NOT is_system),
    CONSTRAINT priorities_color_token_chk   CHECK (color_token IN ('neutral', 'info', 'warning', 'danger'))
);

COMMENT ON TABLE ref.priorities IS
'ความสำคัญของ lead/opportunity/task (ข้อ 4.7) · ขอบซ้ายการ์ด Pipeline สีตาม priority (ข้อ 13.9)';
COMMENT ON COLUMN ref.priorities.is_system IS 'NORMAL = ค่าเริ่มต้นของ lead จาก Quick Capture (ข้อ 4.3)';
COMMENT ON COLUMN ref.priorities.color_token IS 'สีสถานะ neutral/info/warning/danger (คอลัมน์ "สี" ข้อ 4.7)';

INSERT INTO ref.priorities (code, label_th, sort_order, is_system, color_token) VALUES
    ('LOW',    'ต่ำ',   1, false, 'neutral'),
    ('NORMAL', 'ปกติ', 2, true,  'info'),
    ('HIGH',   'สูง',   3, false, 'warning'),
    ('URGENT', 'ด่วน',  4, false, 'danger');


-- =====================================================================================
-- 5.8 จังหวัด — ref.provinces (77 จังหวัด · code = ISO 3166-2:TH)
-- =====================================================================================

CREATE TABLE ref.provinces (
    code        text        PRIMARY KEY,
    label_th    text        NOT NULL UNIQUE,
    label_en    text        NOT NULL UNIQUE,
    sort_order  integer     NOT NULL,
    is_active   boolean     NOT NULL DEFAULT true,
    is_system   boolean     NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT provinces_code_chk          CHECK (code ~ '^TH-[0-9]{2}$'),
    CONSTRAINT provinces_system_active_chk CHECK (is_active OR NOT is_system)
);

COMMENT ON TABLE ref.provinces IS
'จังหวัด 77 จังหวัด (ข้อ 5.8) · code = ISO 3166-2:TH · ไม่รวม TH-S (พัทยา เมืองพิเศษ ไม่ใช่จังหวัด) · '
'หมายเหตุผู้เขียน: sort_order เรียงตามเลขรหัส ISO (กรุงเทพมหานครก่อน) เพราะ CANONICAL ไม่กำหนดลำดับ';
COMMENT ON COLUMN ref.provinces.label_en IS 'ชื่อตาม ISO 3166-2:TH (TH-10 ใช้ชื่อทางการ Krung Thep Maha Nakhon · ISO ระบุชื่อสามัญ Bangkok)';

INSERT INTO ref.provinces (code, label_th, label_en, sort_order) VALUES
    ('TH-10', 'กรุงเทพมหานคร',     'Krung Thep Maha Nakhon',     1),
    ('TH-11', 'สมุทรปราการ',       'Samut Prakan',               2),
    ('TH-12', 'นนทบุรี',           'Nonthaburi',                 3),
    ('TH-13', 'ปทุมธานี',          'Pathum Thani',               4),
    ('TH-14', 'พระนครศรีอยุธยา',   'Phra Nakhon Si Ayutthaya',   5),
    ('TH-15', 'อ่างทอง',           'Ang Thong',                  6),
    ('TH-16', 'ลพบุรี',            'Lop Buri',                   7),
    ('TH-17', 'สิงห์บุรี',          'Sing Buri',                  8),
    ('TH-18', 'ชัยนาท',            'Chai Nat',                   9),
    ('TH-19', 'สระบุรี',           'Saraburi',                   10),
    ('TH-20', 'ชลบุรี',            'Chon Buri',                  11),
    ('TH-21', 'ระยอง',             'Rayong',                     12),
    ('TH-22', 'จันทบุรี',          'Chanthaburi',                13),
    ('TH-23', 'ตราด',              'Trat',                       14),
    ('TH-24', 'ฉะเชิงเทรา',        'Chachoengsao',               15),
    ('TH-25', 'ปราจีนบุรี',        'Prachin Buri',               16),
    ('TH-26', 'นครนายก',           'Nakhon Nayok',               17),
    ('TH-27', 'สระแก้ว',           'Sa Kaeo',                    18),
    ('TH-30', 'นครราชสีมา',        'Nakhon Ratchasima',          19),
    ('TH-31', 'บุรีรัมย์',          'Buri Ram',                   20),
    ('TH-32', 'สุรินทร์',           'Surin',                      21),
    ('TH-33', 'ศรีสะเกษ',          'Si Sa Ket',                  22),
    ('TH-34', 'อุบลราชธานี',       'Ubon Ratchathani',           23),
    ('TH-35', 'ยโสธร',             'Yasothon',                   24),
    ('TH-36', 'ชัยภูมิ',            'Chaiyaphum',                 25),
    ('TH-37', 'อำนาจเจริญ',        'Amnat Charoen',              26),
    ('TH-38', 'บึงกาฬ',            'Bueng Kan',                  27),
    ('TH-39', 'หนองบัวลำภู',       'Nong Bua Lam Phu',           28),
    ('TH-40', 'ขอนแก่น',           'Khon Kaen',                  29),
    ('TH-41', 'อุดรธานี',          'Udon Thani',                 30),
    ('TH-42', 'เลย',               'Loei',                       31),
    ('TH-43', 'หนองคาย',           'Nong Khai',                  32),
    ('TH-44', 'มหาสารคาม',         'Maha Sarakham',              33),
    ('TH-45', 'ร้อยเอ็ด',          'Roi Et',                     34),
    ('TH-46', 'กาฬสินธุ์',          'Kalasin',                    35),
    ('TH-47', 'สกลนคร',            'Sakon Nakhon',               36),
    ('TH-48', 'นครพนม',            'Nakhon Phanom',              37),
    ('TH-49', 'มุกดาหาร',          'Mukdahan',                   38),
    ('TH-50', 'เชียงใหม่',          'Chiang Mai',                 39),
    ('TH-51', 'ลำพูน',             'Lamphun',                    40),
    ('TH-52', 'ลำปาง',             'Lampang',                    41),
    ('TH-53', 'อุตรดิตถ์',          'Uttaradit',                  42),
    ('TH-54', 'แพร่',              'Phrae',                      43),
    ('TH-55', 'น่าน',              'Nan',                        44),
    ('TH-56', 'พะเยา',             'Phayao',                     45),
    ('TH-57', 'เชียงราย',          'Chiang Rai',                 46),
    ('TH-58', 'แม่ฮ่องสอน',        'Mae Hong Son',               47),
    ('TH-60', 'นครสวรรค์',         'Nakhon Sawan',               48),
    ('TH-61', 'อุทัยธานี',          'Uthai Thani',                49),
    ('TH-62', 'กำแพงเพชร',         'Kamphaeng Phet',             50),
    ('TH-63', 'ตาก',               'Tak',                        51),
    ('TH-64', 'สุโขทัย',            'Sukhothai',                  52),
    ('TH-65', 'พิษณุโลก',          'Phitsanulok',                53),
    ('TH-66', 'พิจิตร',             'Phichit',                    54),
    ('TH-67', 'เพชรบูรณ์',          'Phetchabun',                 55),
    ('TH-70', 'ราชบุรี',            'Ratchaburi',                 56),
    ('TH-71', 'กาญจนบุรี',          'Kanchanaburi',               57),
    ('TH-72', 'สุพรรณบุรี',         'Suphan Buri',                58),
    ('TH-73', 'นครปฐม',            'Nakhon Pathom',              59),
    ('TH-74', 'สมุทรสาคร',         'Samut Sakhon',               60),
    ('TH-75', 'สมุทรสงคราม',       'Samut Songkhram',            61),
    ('TH-76', 'เพชรบุรี',           'Phetchaburi',                62),
    ('TH-77', 'ประจวบคีรีขันธ์',     'Prachuap Khiri Khan',        63),
    ('TH-80', 'นครศรีธรรมราช',     'Nakhon Si Thammarat',        64),
    ('TH-81', 'กระบี่',             'Krabi',                      65),
    ('TH-82', 'พังงา',             'Phangnga',                   66),
    ('TH-83', 'ภูเก็ต',             'Phuket',                     67),
    ('TH-84', 'สุราษฎร์ธานี',        'Surat Thani',                68),
    ('TH-85', 'ระนอง',             'Ranong',                     69),
    ('TH-86', 'ชุมพร',             'Chumphon',                   70),
    ('TH-90', 'สงขลา',             'Songkhla',                   71),
    ('TH-91', 'สตูล',              'Satun',                      72),
    ('TH-92', 'ตรัง',              'Trang',                      73),
    ('TH-93', 'พัทลุง',             'Phatthalung',                74),
    ('TH-94', 'ปัตตานี',            'Pattani',                    75),
    ('TH-95', 'ยะลา',              'Yala',                       76),
    ('TH-96', 'นราธิวาส',          'Narathiwat',                 77);


-- =====================================================================================
-- 5.8 เหตุผลเปลี่ยนผู้รับผิดชอบ — ref.ownership_change_reasons
-- =====================================================================================

CREATE TABLE ref.ownership_change_reasons (
    code        text        PRIMARY KEY,
    label_th    text        NOT NULL,
    label_en    text,
    sort_order  integer     NOT NULL,
    is_active   boolean     NOT NULL DEFAULT true,
    is_system   boolean     NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ownership_change_reasons_code_chk          CHECK (code ~ '^[A-Z0-9_]+$'),
    CONSTRAINT ownership_change_reasons_system_active_chk CHECK (is_active OR NOT is_system)
);

COMMENT ON TABLE ref.ownership_change_reasons IS
'เหตุผลการเปลี่ยนผู้รับผิดชอบ/สาขา ใช้กับ crm.ownership_changes.reason_code (ข้อ 5.8 · A28)';
COMMENT ON COLUMN ref.ownership_change_reasons.is_system IS
'STAFF_LEFT (api.disable_staff ข้อ 7.3) · BRANCH_TRANSFER (ย้ายสาขา ข้อ 9.4.2)';

INSERT INTO ref.ownership_change_reasons (code, label_th, sort_order, is_system) VALUES
    ('SHIFT_CHANGE',     'เปลี่ยนกะ',         1, false),
    ('WORKLOAD',         'กระจายงาน',        2, false),
    ('STAFF_LEFT',       'พนักงานลาออก',      3, true),
    ('CUSTOMER_REQUEST', 'ลูกค้าขอเปลี่ยน',    4, false),
    ('BRANCH_TRANSFER',  'ย้ายสาขา',          5, true),
    ('OTHER',            'อื่น ๆ',            6, false);


-- =====================================================================================
-- 5.8 เหตุผลยืนยันสร้างลูกค้าใหม่แม้อาจซ้ำ — ref.duplicate_override_reasons
-- =====================================================================================

CREATE TABLE ref.duplicate_override_reasons (
    code        text        PRIMARY KEY,
    label_th    text        NOT NULL,
    label_en    text,
    sort_order  integer     NOT NULL,
    is_active   boolean     NOT NULL DEFAULT true,
    is_system   boolean     NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT duplicate_override_reasons_code_chk          CHECK (code ~ '^[A-Z0-9_]+$'),
    CONSTRAINT duplicate_override_reasons_system_active_chk CHECK (is_active OR NOT is_system)
);

COMMENT ON TABLE ref.duplicate_override_reasons IS
'เหตุผลเมื่อกด "ยังต้องการสร้างลูกค้าใหม่" ในแผงตรวจซ้ำ (ข้อ 5.8 · 6.5) · ใช้กับ crm.duplicate_decisions.override_reason_code · OTHER บังคับหมายเหตุ (override_note)';
COMMENT ON COLUMN ref.duplicate_override_reasons.is_system IS 'OTHER ถูกอ้างในกติกา "บังคับหมายเหตุ"';

INSERT INTO ref.duplicate_override_reasons (code, label_th, sort_order, is_system) VALUES
    ('FAMILY_SHARED_PHONE', 'ใช้เบอร์ร่วมกันในครอบครัว', 1, false),
    ('DIFFERENT_PERSON',    'คนละคน',                2, false),
    ('OTHER',               'อื่น ๆ',                 3, true);


-- =====================================================================================
-- 5.8 เหตุผลการส่งออก — ref.export_reasons [รอยืนยัน]
-- =====================================================================================

CREATE TABLE ref.export_reasons (
    code          text        PRIMARY KEY,
    label_th      text        NOT NULL,
    label_en      text,
    sort_order    integer     NOT NULL,
    is_active     boolean     NOT NULL DEFAULT true,
    is_system     boolean     NOT NULL DEFAULT false,
    is_marketing  boolean     NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT export_reasons_code_chk          CHECK (code ~ '^[A-Z0-9_]+$'),
    CONSTRAINT export_reasons_system_active_chk CHECK (is_active OR NOT is_system)
);

COMMENT ON TABLE ref.export_reasons IS
'เหตุผลของคำขอส่งออกข้อมูลลูกค้า (ข้อ 5.8 · 8.2) · OTHER บังคับหมายเหตุ';
COMMENT ON COLUMN ref.export_reasons.is_marketing IS
'true = กลุ่มการตลาด → กรองเฉพาะลูกค้าที่ยินยอม MARKETING ทุกบทบาท (ข้อ 8.2)';
COMMENT ON COLUMN ref.export_reasons.is_system IS 'OTHER ถูกอ้างในกติกา "บังคับหมายเหตุ"';

INSERT INTO ref.export_reasons (code, label_th, sort_order, is_system, is_marketing) VALUES
    ('MARKETING_CAMPAIGN', 'แคมเปญการตลาด',    1, false, true),
    ('MANAGEMENT_REPORT',  'รายงานผู้บริหาร',    2, false, false),
    ('DATA_CLEANUP',       'ทำความสะอาดข้อมูล',  3, false, false),
    ('INTERNAL_AUDIT',     'ตรวจสอบภายใน',      4, false, false),
    ('OTHER',              'อื่น ๆ',            5, true,  false);


-- =====================================================================================
-- 5.8 · 10.2 วัตถุประสงค์ความยินยอม — ref.consent_purposes
-- =====================================================================================

CREATE TABLE ref.consent_purposes (
    code               text        PRIMARY KEY,
    label_th           text        NOT NULL,
    label_en           text,
    sort_order         integer     NOT NULL,
    is_active          boolean     NOT NULL DEFAULT true,
    is_system          boolean     NOT NULL DEFAULT false,
    controller_entity  text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT consent_purposes_code_chk          CHECK (code ~ '^[A-Z0-9_]+$'),
    CONSTRAINT consent_purposes_system_active_chk CHECK (is_active OR NOT is_system)
);

COMMENT ON TABLE ref.consent_purposes IS
'วัตถุประสงค์ของประกาศ/ความยินยอม (ข้อ 5.8 · 10.2 · [รอยืนยัน DPO]) · PRIVACY_NOTICE บันทึกว่า "แจ้งแล้ว" (บังคับตอน Quick Capture) · '
'MARKETING เป็นความยินยอม (ไม่ติ๊กไว้ก่อน · เลือกช่องทาง LINE SMS PHONE EMAIL) · '
'ถ้า JAUNPHONE กับ JAUN POWER MONEY เป็นคนละนิติบุคคล (Q17) ให้แยก MARKETING_JAUNPHONE · MARKETING_JPM ด้วย migration และระบุ controller_entity';
COMMENT ON COLUMN ref.consent_purposes.is_system IS 'ทั้งสองค่าถูกอ้างในกติกา (api.quick_capture สร้าง PRIVACY_NOTICE · การส่งออกกรอง MARKETING ข้อ 8.2)';
COMMENT ON COLUMN ref.consent_purposes.controller_entity IS 'ผู้ควบคุมข้อมูลของวัตถุประสงค์นี้ · NULL = ถือเป็น controller เดียวจนกว่ายืนยัน [รอยืนยัน Q17]';

INSERT INTO ref.consent_purposes (code, label_th, sort_order, is_system, controller_entity) VALUES
    ('PRIVACY_NOTICE', 'แจ้งประกาศความเป็นส่วนตัวแล้ว', 1, true, NULL),
    ('MARKETING',      'ยินยอมรับข่าวสาร/โปรโมชั่น',    2, true, NULL);


-- =====================================================================================
-- 5.7 ประเภทธุรกรรม — ref.transaction_types · ระบบต้นทาง — ref.source_systems [รอยืนยัน Q14]
-- =====================================================================================

CREATE TABLE ref.transaction_types (
    code                text        PRIMARY KEY,
    label_th            text        NOT NULL,
    label_en            text,
    sort_order          integer     NOT NULL,
    is_active           boolean     NOT NULL DEFAULT true,
    is_system           boolean     NOT NULL DEFAULT false,
    counts_as_purchase  boolean     NOT NULL,
    purchase_tab_group  text        NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT transaction_types_code_chk          CHECK (code ~ '^[A-Z0-9_]+$'),
    CONSTRAINT transaction_types_system_active_chk CHECK (is_active OR NOT is_system)
);

COMMENT ON TABLE ref.transaction_types IS
'ประเภทธุรกรรมของ crm.transaction_refs (ข้อ 5.7 · [รอยืนยัน Q14])';
COMMENT ON COLUMN ref.transaction_types.counts_as_purchase IS
'true = นับเป็นเหตุการณ์การซื้อ (ข้อ 3.1) เมื่อ ref ไม่ผูก opportunity หรือ opportunity นั้นไม่ใช่ WON · ใช้กับ BUYERS REPEAT_BUYERS lifecycle ยอดซื้อสะสม';
COMMENT ON COLUMN ref.transaction_types.purchase_tab_group IS
'กลุ่มในแท็บ "การซื้อและบริการ" ของ Customer 360 (ข้อ 5.7 · 6.8): การซื้อ · Trade-in · ผ่อน · รับซื้อ · ซ่อม';

INSERT INTO ref.transaction_types (code, label_th, sort_order, counts_as_purchase, purchase_tab_group) VALUES
    ('SALE',                 'ขายเครื่อง/สินค้า',       1, true,  'การซื้อ'),
    ('TRADE_IN_SALE',        'เทิร์นเครื่อง',           2, true,  'Trade-in'),
    ('INSTALLMENT_CONTRACT', 'สัญญาผ่อน',             3, true,  'ผ่อน'),
    ('ACCESSORY_SALE',       'ขายอุปกรณ์เสริม',        4, false, 'การซื้อ'),
    ('BUYBACK',              'รับซื้อเครื่องจากลูกค้า',   5, false, 'รับซื้อ'),
    ('REPAIR',               'งานซ่อม',               6, false, 'ซ่อม'),
    ('INSTALLMENT_PAYMENT',  'ชำระค่างวด',            7, false, 'ผ่อน'),      -- แสดงใน Phase 4
    ('REFUND',               'คืนเงิน',               8, false, 'การซื้อ');

CREATE TABLE ref.source_systems (
    code        text        PRIMARY KEY,
    label_th    text        NOT NULL,
    label_en    text,
    sort_order  integer     NOT NULL,
    is_active   boolean     NOT NULL DEFAULT true,
    is_system   boolean     NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT source_systems_code_chk          CHECK (code ~ '^[A-Z0-9_]+$'),
    CONSTRAINT source_systems_system_active_chk CHECK (is_active OR NOT is_system)
);

COMMENT ON TABLE ref.source_systems IS
'ระบบต้นทางของ transaction ref (ข้อ 5.7 · [รอยืนยัน Q14]) · UNIQUE(source_system_code, external_no) ที่ crm.transaction_refs · '
'หน้า Integration แสดงทุกค่า "ยังไม่เชื่อมต่อ (Phase 4)" ยกเว้น MANUAL (ข้อ 13.14)';
COMMENT ON COLUMN ref.source_systems.is_system IS 'MANUAL = การผูกเลขธุรกรรมด้วยมือของ V1 (transaction.link)';

INSERT INTO ref.source_systems (code, label_th, sort_order, is_system) VALUES
    ('MANUAL',          'บันทึกด้วยมือ',                    1, true),
    ('POS',             'ระบบขายหน้าร้าน',                   2, false),
    ('REPAIR',          'ระบบซ่อม',                        3, false),
    ('JPM_INSTALLMENT', 'ระบบผ่อน JAUN POWER MONEY',        4, false),
    ('CONTRACT',        'ระบบสัญญา',                       5, false),
    ('ACCOUNTING',      'ระบบบัญชี',                        6, false);


-- =====================================================================================
-- updated_at trigger · RLS ทุกตาราง ref (policy อยู่ใน migration 0010)
-- =====================================================================================

CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON ref.channels                   FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON ref.sources                    FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON ref.interest_types             FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON ref.product_types              FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON ref.lost_reasons               FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON ref.visit_outcomes             FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON ref.interaction_types          FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON ref.task_types                 FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON ref.priorities                 FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON ref.provinces                  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON ref.ownership_change_reasons   FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON ref.duplicate_override_reasons FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON ref.export_reasons             FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON ref.consent_purposes           FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON ref.transaction_types          FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON ref.source_systems             FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE ref.channels                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref.sources                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref.interest_types             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref.product_types              ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref.lost_reasons               ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref.visit_outcomes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref.interaction_types          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref.task_types                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref.priorities                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref.provinces                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref.ownership_change_reasons   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref.duplicate_override_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref.export_reasons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref.consent_purposes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref.transaction_types          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref.source_systems             ENABLE ROW LEVEL SECURITY;
