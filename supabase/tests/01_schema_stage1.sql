-- =====================================================================================
-- supabase/tests/01_schema_stage1.sql — ทดสอบ migration 0001–0004 (schema stage 1)
--
-- ครอบคลุม: schema + GRANT ระดับ schema · default privilege ของฟังก์ชัน · ENUM ทุกตัวและลำดับค่า ·
--           บทบาท 8 แถว · ตารางสิทธิ์ข้อ 8.1 ทุกช่อง (ถอดแบบรายบทบาทแยกจาก migration เพื่อตรวจไขว้) ·
--           Master Data ทุกตาราง (77 จังหวัด) · app.settings · app.clock() · normalize/mask ตามข้อ 6.4 13.7 13.8 13.14 ·
--           generated column ของ customers/contacts/DSR · CHECK สำคัญ · RLS เปิดทุกตาราง core ref crm · view security_invoker
--
-- run.mjs ครอบไฟล์นี้ด้วย BEGIN … ROLLBACK · ไฟล์นี้ต้องผ่านทั้งแบบมีและไม่มี --seed:
--   · ไม่ assert ค่าที่ seed ตั้งได้ (app.settings[clock]) · ข้อมูลทดสอบใช้รหัสที่ไม่ชน seed (TEST-S1 · ST-99xx · CUS-1999-…)
--   · การทดสอบระดับแถวตั้ง session_replication_role = replica เพื่อแยกจาก trigger ของ migration ถัดไป
--     (CHECK · NOT NULL · UNIQUE · generated column ยังทำงาน · trigger และ FK ถูกพัก)
-- =====================================================================================


-- =====================================================================================
-- 1. schema และ GRANT ระดับ schema (CANONICAL ข้อ 1.1)
-- =====================================================================================

SELECT test.assert_eq(
    (SELECT count(*) FROM pg_namespace WHERE nspname IN ('api','app','core','ref','crm','analytics','audit','restricted')),
    8::bigint, 'มี schema ครบ 8 ตัว');

SELECT test.assert_true(
    has_schema_privilege('authenticated', 'api', 'USAGE') AND has_schema_privilege('authenticated', 'crm', 'USAGE')
    AND has_schema_privilege('authenticated', 'core', 'USAGE') AND has_schema_privilege('authenticated', 'ref', 'USAGE')
    AND has_schema_privilege('authenticated', 'app', 'USAGE'),
    'authenticated มี USAGE บน api crm core ref app');
SELECT test.assert_true(
    has_schema_privilege('service_role', 'api', 'USAGE') AND has_schema_privilege('service_role', 'crm', 'USAGE')
    AND has_schema_privilege('service_role', 'core', 'USAGE') AND has_schema_privilege('service_role', 'ref', 'USAGE'),
    'service_role มี USAGE บน api crm core ref');
SELECT test.assert_true(
    NOT has_schema_privilege('authenticated', 'analytics', 'USAGE') AND NOT has_schema_privilege('authenticated', 'audit', 'USAGE')
    AND NOT has_schema_privilege('authenticated', 'restricted', 'USAGE'),
    'authenticated ไม่มี USAGE บน analytics audit restricted');
SELECT test.assert_eq(
    (SELECT count(*) FROM unnest(ARRAY['api','app','core','ref','crm','analytics','audit','restricted']) s
     WHERE has_schema_privilege('anon', s, 'USAGE')),
    0::bigint, 'anon ไม่มี USAGE บน schema ใดของระบบ');


-- =====================================================================================
-- 2. default privilege ของฟังก์ชัน: ฟังก์ชันใหม่ต้องไม่ถูกเรียกได้โดย PUBLIC (ข้อ 1.1)
-- =====================================================================================

CREATE FUNCTION api.stage1_probe() RETURNS integer LANGUAGE sql SET search_path = '' AS $$ SELECT 1 $$;
CREATE FUNCTION app.stage1_probe() RETURNS integer LANGUAGE sql SET search_path = '' AS $$ SELECT 1 $$;
CREATE FUNCTION crm.stage1_probe() RETURNS integer LANGUAGE sql SET search_path = '' AS $$ SELECT 1 $$;

SELECT test.assert_true(NOT has_function_privilege('anon', 'api.stage1_probe()', 'EXECUTE'), 'ฟังก์ชันใหม่ใน api ไม่มี EXECUTE ให้ PUBLIC/anon');
SELECT test.assert_true(NOT has_function_privilege('anon', 'app.stage1_probe()', 'EXECUTE'), 'ฟังก์ชันใหม่ใน app ไม่มี EXECUTE ให้ PUBLIC/anon');
SELECT test.assert_true(NOT has_function_privilege('anon', 'crm.stage1_probe()', 'EXECUTE'), 'ฟังก์ชันใหม่ใน crm ไม่มี EXECUTE ให้ PUBLIC/anon');
SELECT test.assert_true(has_function_privilege('authenticated', 'app.clock()', 'EXECUTE'), 'authenticated เรียก app.clock() ได้ (helper ข้อ 9.3)');
SELECT test.assert_true(NOT has_function_privilege('anon', 'app.normalize_contact(crm.contact_type, text)', 'EXECUTE'), 'anon เรียก app.normalize_contact ไม่ได้');
SELECT test.assert_true(NOT has_function_privilege('anon', 'app.is_thai_national_id(text)', 'EXECUTE'), 'anon เรียก app.is_thai_national_id ไม่ได้');

SELECT test.assert_eq(
    (SELECT coalesce(string_agg(p.oid::regprocedure::text, ', '), '')
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'app' AND p.proname IN ('clock','bangkok_date','normalize_contact','mask_contact','is_valid_thai_phone','is_thai_national_id','touch_updated_at')
       AND NOT coalesce(p.proconfig @> ARRAY['search_path=""'], false)),
    '', 'ฟังก์ชัน app ของ stage 1 ทุกตัว SET search_path = ''''');
SELECT test.assert_eq(
    (SELECT string_agg(p.proname || ':' || p.provolatile::text, ',' ORDER BY p.proname)
     FROM pg_proc p WHERE p.pronamespace = 'app'::regnamespace
       AND p.proname IN ('bangkok_date','normalize_contact','mask_contact','is_valid_thai_phone','is_thai_national_id','clock')),
    'bangkok_date:i,clock:s,is_thai_national_id:i,is_valid_thai_phone:i,mask_contact:i,normalize_contact:i',
    'volatility: helper ช่องทางติดต่อ/วันที่ IMMUTABLE · app.clock STABLE');
SELECT test.assert_true(
    (SELECT prosecdef FROM pg_proc WHERE oid = 'app.clock()'::regprocedure),
    'app.clock() เป็น SECURITY DEFINER (ข้อ 9.3)');


-- =====================================================================================
-- 3. ENUM: มีครบและลำดับค่าตรง CANONICAL ข้อ 4.x · 4.8
-- =====================================================================================

SELECT test.assert_eq(enum_range(NULL::core.data_scope)::text[],            ARRAY['OWN','TEAM','BRANCH','ORGANIZATION','SYSTEM'], 'core.data_scope ลำดับ OWN < TEAM < BRANCH < ORGANIZATION < SYSTEM');
SELECT test.assert_eq(enum_range(NULL::core.staff_status)::text[],          ARRAY['INVITED','ACTIVE','DISABLED'], 'core.staff_status');
SELECT test.assert_eq(enum_range(NULL::crm.visit_status)::text[],           ARRAY['WAITING','IN_SERVICE','COMPLETED','LEFT','CANCELLED'], 'crm.visit_status');
SELECT test.assert_eq(enum_range(NULL::crm.lead_status)::text[],            ARRAY['NEW','CONTACTED','QUALIFIED','CONVERTED','LOST'], 'crm.lead_status');
SELECT test.assert_eq(enum_range(NULL::crm.opportunity_stage)::text[],      ARRAY['INTERESTED','QUOTATION','FOLLOW_UP','WON','LOST'], 'crm.opportunity_stage');
SELECT test.assert_eq(enum_range(NULL::crm.quotation_status)::text[],       ARRAY['DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED'], 'crm.quotation_status');
SELECT test.assert_eq(enum_range(NULL::crm.task_status)::text[],            ARRAY['OPEN','IN_PROGRESS','DONE','CANCELLED'], 'crm.task_status');
SELECT test.assert_eq(enum_range(NULL::crm.customer_record_status)::text[], ARRAY['ACTIVE','MERGED','ANONYMIZED'], 'crm.customer_record_status');
SELECT test.assert_eq(enum_range(NULL::crm.interaction_direction)::text[],  ARRAY['INBOUND','OUTBOUND','INTERNAL'], 'crm.interaction_direction');
SELECT test.assert_eq(enum_range(NULL::crm.contact_type)::text[],           ARRAY['PHONE','LINE_ID','LINE_USER_ID','FACEBOOK','INSTAGRAM','TIKTOK','EMAIL'], 'crm.contact_type');
SELECT test.assert_eq(enum_range(NULL::crm.consent_status)::text[],         ARRAY['GRANTED','WITHDRAWN'], 'crm.consent_status');
SELECT test.assert_eq(enum_range(NULL::crm.consent_capture_via)::text[],    ARRAY['STAFF_FORM','LINK_SENT','LINE_OA','WEB'], 'crm.consent_capture_via');
SELECT test.assert_eq(enum_range(NULL::crm.customer_link_via)::text[],      ARRAY['CREATED','VISIT','INTERACTION','LEAD','OPPORTUNITY','MANUAL_LINK','MERGE'], 'crm.customer_link_via');
SELECT test.assert_eq(enum_range(NULL::crm.duplicate_status)::text[],       ARRAY['PENDING','MERGED','NOT_DUPLICATE'], 'crm.duplicate_status');
SELECT test.assert_eq(enum_range(NULL::crm.dsr_type)::text[],               ARRAY['ACCESS','CORRECTION','DELETION','OBJECTION','WITHDRAW_CONSENT','PORTABILITY'], 'crm.dsr_type');
SELECT test.assert_eq(enum_range(NULL::crm.dsr_status)::text[],             ARRAY['RECEIVED','VERIFIED','IN_PROGRESS','COMPLETED','REJECTED'], 'crm.dsr_status');
SELECT test.assert_eq(enum_range(NULL::crm.interest_level)::text[],         ARRAY['HOT','WARM','COLD'], 'crm.interest_level');
SELECT test.assert_eq(enum_range(NULL::audit.export_status)::text[],        ARRAY['REQUESTED','APPROVED','REJECTED','GENERATED','DOWNLOADED','EXPIRED'], 'audit.export_status');
SELECT test.assert_eq(enum_range(NULL::audit.actor_type)::text[],           ARRAY['STAFF','SYSTEM','INTEGRATION'], 'audit.actor_type');
SELECT test.assert_true('BRANCH'::core.data_scope >= 'TEAM'::core.data_scope AND 'ORGANIZATION'::core.data_scope > 'BRANCH'::core.data_scope
                        AND 'OWN'::core.data_scope < 'TEAM'::core.data_scope, 'การเทียบ >= ของ data_scope ใช้ลำดับที่ประกาศ');


-- =====================================================================================
-- 4. บทบาท (CANONICAL ข้อ 7)
-- =====================================================================================

SELECT test.assert_eq((SELECT count(*) FROM core.roles), 8::bigint, 'core.roles มี 8 แถว');
SELECT test.assert_eq(
    (SELECT count(*) FROM (
        (SELECT code, label_th, rank, requires_mfa, is_branch_role FROM core.roles
         EXCEPT
         SELECT * FROM (VALUES
            ('STAFF',          'พนักงานขาย/แอดมิน', 10,           false, true),
            ('SUPERVISOR',     'หัวหน้าทีม',          20,           true,  true),
            ('BRANCH_MANAGER', 'ผู้จัดการสาขา',       30,           true,  true),
            ('MARKETING',      'ฝ่ายการตลาด',        30,           true,  false),
            ('OPERATIONS',     'ฝ่ายปฏิบัติการ',      40,           true,  true),
            ('BUSINESS_ADMIN', 'ผู้ดูแลข้อมูลธุรกิจ', 50,           true,  false),
            ('EXECUTIVE',      'ผู้บริหาร',           60,           true,  false),
            ('SYSTEM_ADMIN',   'ผู้ดูแลระบบ (IT)',    NULL::integer, true,  false)) v)
     ) d),
    0::bigint, 'core.roles: code label_th rank requires_mfa is_branch_role ตรงข้อ 7 ทุกแถว');
SELECT test.assert_true((SELECT rank IS NULL FROM core.roles WHERE code = 'SYSTEM_ADMIN'), 'SYSTEM_ADMIN rank = NULL (สายแยก)');


-- =====================================================================================
-- 5. ตารางสิทธิ์ข้อ 8.1 ทุกช่อง
--    ถอดแบบ "รายบทบาท" (ต่างจาก migration ที่ถอดรายสิทธิ์) · ! = ช่องที่ต้อง aal2 (🔐)
-- =====================================================================================

SELECT test.assert_eq((SELECT count(*) FROM core.permissions), 63::bigint, 'core.permissions มี 63 สิทธิ์ตามข้อ 8.1');
SELECT test.assert_true(NOT EXISTS (SELECT 1 FROM core.permissions WHERE code = 'customer.delete'), 'ไม่มีสิทธิ์ customer.delete (A16)');

CREATE TEMP TABLE t_expected_role_permissions AS
SELECT r.role_code,
       split_part(tok, ':', 1) AS permission_code,
       (CASE left(split_part(tok, ':', 2), 1)
            WHEN 'O' THEN 'OWN' WHEN 'T' THEN 'TEAM' WHEN 'B' THEN 'BRANCH'
            WHEN 'G' THEN 'ORGANIZATION' WHEN 'S' THEN 'SYSTEM' END)::core.data_scope AS scope,
       right(tok, 1) = '!' AS requires_aal2
FROM (VALUES
    ('STAFF',
     'customer.read:B customer.create:B customer.update:O customer.pii.reveal:B customer.consent.manage:B
      note.create:B note.update:O visit.read:B visit.create:B visit.update:O
      interaction.read:B interaction.create:B interaction.update:O lead.read:B lead.create:B lead.update:O
      opportunity.read:B opportunity.create:B opportunity.update:O opportunity.close:O
      quotation.read:B quotation.create:O quotation.update:O task.read:O task.create:O task.update:O
      transaction.read:B transaction.link:O dashboard.view:O data_quality.view:O data_quality.resolve:O dsr.create:B'),
    ('SUPERVISOR',
     'customer.read:B customer.create:B customer.update:T customer.assign:T customer.merge:T! customer.pii.reveal:B customer.consent.manage:B
      note.create:B note.update:O visit.read:B visit.create:B visit.update:T
      interaction.read:B interaction.create:B interaction.update:T lead.read:B lead.create:B lead.update:T lead.assign:T
      opportunity.read:B opportunity.create:B opportunity.update:T opportunity.assign:T opportunity.close:T
      quotation.read:B quotation.create:T quotation.update:T task.read:T task.create:T task.update:T task.assign:T
      transaction.read:B transaction.link:T dashboard.view:T report.view:T report.staff_performance:T report.export:T
      data_quality.view:T data_quality.resolve:T dsr.create:B user.read:T'),
    ('BRANCH_MANAGER',
     'customer.read:B customer.create:B customer.update:B customer.assign:B customer.merge:B! customer.pii.reveal:B customer.export:B! customer.consent.manage:B
      note.create:B note.update:O visit.read:B visit.create:B visit.update:B
      interaction.read:B interaction.create:B interaction.update:B lead.read:B lead.create:B lead.update:B lead.assign:B lead.reopen:B
      opportunity.read:B opportunity.create:B opportunity.update:B opportunity.assign:B opportunity.close:B opportunity.reopen:B
      quotation.read:B quotation.create:B quotation.update:B task.read:B task.create:B task.update:B task.assign:B
      transaction.read:B transaction.link:B campaign.read:B dashboard.view:B report.view:B report.staff_performance:B report.export:B
      data_quality.view:B data_quality.resolve:B dsr.create:B team.manage:B
      user.read:B user.invite:B user.update:B user.disable:B! role.assign:B!'),
    ('OPERATIONS',
     'customer.read:B visit.read:B interaction.read:B lead.read:B opportunity.read:B quotation.read:B task.read:B transaction.read:B
      campaign.read:B dashboard.view:B report.view:B report.staff_performance:B report.export:B data_quality.view:B user.read:B'),
    ('MARKETING',
     'customer.export:G! tag.manage:G campaign.read:G campaign.manage:G dashboard.view:G report.view:G report.export:G'),
    ('EXECUTIVE',
     'customer.read:G customer.pii.reveal:G! customer.export:G! visit.read:G interaction.read:G lead.read:G opportunity.read:G
      quotation.read:G task.read:G transaction.read:G campaign.read:G dashboard.view:G report.view:G report.staff_performance:G
      report.export:G data_quality.view:G user.read:G role.decide:G! export.approve:G! audit.read:G security_log.read:G'),
    ('BUSINESS_ADMIN',
     'customer.read:G customer.create:G customer.update:G customer.assign:G customer.merge:G! customer.pii.reveal:G! customer.export:G!
      customer.consent.manage:G customer.anonymize:G! note.create:G note.update:G visit.read:G visit.update:G
      interaction.read:G interaction.create:G lead.read:G lead.create:G lead.update:G lead.assign:G lead.reopen:G
      opportunity.read:G opportunity.update:G opportunity.assign:G opportunity.close:G opportunity.reopen:G quotation.read:G
      task.read:G task.create:G task.update:G task.assign:G transaction.read:G transaction.link:G tag.manage:G
      campaign.read:G campaign.manage:G dashboard.view:G report.view:G report.staff_performance:G report.export:G
      data_quality.view:G data_quality.resolve:G dsr.create:G dsr.manage:G! master_data.manage:G! team.manage:G
      user.read:G user.invite:G user.update:G user.disable:G! role.assign:G! export.approve:G! audit.read:G
      security_log.read:G settings.business:G!'),
    ('SYSTEM_ADMIN',
     'user.read:S user.invite:S user.update:S user.disable:S! role.request:S security_log.read:S settings.system:S! integration.manage:S!')
) AS r (role_code, cells)
CROSS JOIN LATERAL regexp_split_to_table(btrim(r.cells), '\s+') AS tok;

SELECT test.assert_eq((SELECT count(*) FROM t_expected_role_permissions), 228::bigint, 'ถอดแบบรายบทบาทได้ 228 ช่อง');
SELECT test.assert_eq(
    (SELECT coalesce(string_agg(format('%s/%s/%s/%s', role_code, permission_code, scope, requires_aal2), ', '), '')
     FROM (SELECT role_code, permission_code, scope, requires_aal2 FROM core.role_permissions
           EXCEPT SELECT role_code, permission_code, scope, requires_aal2 FROM t_expected_role_permissions) x),
    '', 'core.role_permissions ไม่มีช่องเกินจากข้อ 8.1');
SELECT test.assert_eq(
    (SELECT coalesce(string_agg(format('%s/%s/%s/%s', role_code, permission_code, scope, requires_aal2), ', '), '')
     FROM (SELECT role_code, permission_code, scope, requires_aal2 FROM t_expected_role_permissions
           EXCEPT SELECT role_code, permission_code, scope, requires_aal2 FROM core.role_permissions) x),
    '', 'core.role_permissions ไม่ขาดช่องใดของข้อ 8.1');
SELECT test.assert_eq((SELECT count(*) FROM core.role_permissions WHERE requires_aal2), 23::bigint, 'ช่อง 🔐 (requires_aal2) มี 23 ช่อง');

-- ตรวจช่องเฉพาะ (spot check) ทีละช่อง: NULL = ต้องไม่มีสิทธิ์
DO $$
DECLARE
    r record;
    v_actual text;
BEGIN
    FOR r IN SELECT * FROM (VALUES
        ('STAFF',          'customer.update',      'OWN'),
        ('STAFF',          'customer.pii.reveal',  'BRANCH'),
        ('STAFF',          'dashboard.view',       'OWN'),
        ('STAFF',          'customer.assign',      NULL),
        ('STAFF',          'report.view',          NULL),
        ('SUPERVISOR',     'customer.merge',       'TEAM!'),
        ('SUPERVISOR',     'note.update',          'OWN'),
        ('SUPERVISOR',     'user.read',            'TEAM'),
        ('SUPERVISOR',     'lead.reopen',          NULL),
        ('BRANCH_MANAGER', 'customer.merge',       'BRANCH!'),
        ('BRANCH_MANAGER', 'customer.export',      'BRANCH!'),
        ('BRANCH_MANAGER', 'user.disable',         'BRANCH!'),
        ('BRANCH_MANAGER', 'role.assign',          'BRANCH!'),
        ('BRANCH_MANAGER', 'note.update',          'OWN'),
        ('BRANCH_MANAGER', 'tag.manage',           NULL),
        ('OPERATIONS',     'task.read',            'BRANCH'),
        ('OPERATIONS',     'customer.update',      NULL),
        ('OPERATIONS',     'customer.pii.reveal',  NULL),
        ('MARKETING',      'customer.export',      'ORGANIZATION!'),
        ('MARKETING',      'tag.manage',           'ORGANIZATION'),
        ('MARKETING',      'customer.read',        NULL),
        ('MARKETING',      'report.staff_performance', NULL),
        ('EXECUTIVE',      'customer.pii.reveal',  'ORGANIZATION!'),
        ('EXECUTIVE',      'customer.export',      'ORGANIZATION!'),
        ('EXECUTIVE',      'role.decide',          'ORGANIZATION!'),
        ('EXECUTIVE',      'export.approve',       'ORGANIZATION!'),
        ('EXECUTIVE',      'customer.read',        'ORGANIZATION'),
        ('EXECUTIVE',      'customer.update',      NULL),
        ('BUSINESS_ADMIN', 'customer.pii.reveal',  'ORGANIZATION!'),
        ('BUSINESS_ADMIN', 'customer.merge',       'ORGANIZATION!'),
        ('BUSINESS_ADMIN', 'customer.export',      'ORGANIZATION!'),
        ('BUSINESS_ADMIN', 'customer.anonymize',   'ORGANIZATION!'),
        ('BUSINESS_ADMIN', 'dsr.manage',           'ORGANIZATION!'),
        ('BUSINESS_ADMIN', 'master_data.manage',   'ORGANIZATION!'),
        ('BUSINESS_ADMIN', 'user.disable',         'ORGANIZATION!'),
        ('BUSINESS_ADMIN', 'role.assign',          'ORGANIZATION!'),
        ('BUSINESS_ADMIN', 'export.approve',       'ORGANIZATION!'),
        ('BUSINESS_ADMIN', 'settings.business',    'ORGANIZATION!'),
        ('BUSINESS_ADMIN', 'customer.consent.manage', 'ORGANIZATION'),
        ('BUSINESS_ADMIN', 'visit.create',         NULL),
        ('BUSINESS_ADMIN', 'interaction.update',   NULL),
        ('BUSINESS_ADMIN', 'opportunity.create',   NULL),
        ('BUSINESS_ADMIN', 'quotation.create',     NULL),
        ('BUSINESS_ADMIN', 'role.decide',          NULL),
        ('SYSTEM_ADMIN',   'user.invite',          'SYSTEM'),
        ('SYSTEM_ADMIN',   'user.disable',         'SYSTEM!'),
        ('SYSTEM_ADMIN',   'settings.system',      'SYSTEM!'),
        ('SYSTEM_ADMIN',   'integration.manage',   'SYSTEM!'),
        ('SYSTEM_ADMIN',   'role.request',         'SYSTEM'),
        ('SYSTEM_ADMIN',   'customer.read',        NULL),
        ('SYSTEM_ADMIN',   'audit.read',           NULL)
    ) AS v (role_code, permission_code, expected)
    LOOP
        SELECT rp.scope::text || CASE WHEN rp.requires_aal2 THEN '!' ELSE '' END
          INTO v_actual
          FROM core.role_permissions rp
         WHERE rp.role_code = r.role_code AND rp.permission_code = r.permission_code;
        PERFORM test.assert_eq(v_actual, r.expected, format('8.1 ช่อง %s × %s', r.role_code, r.permission_code));
    END LOOP;
END;
$$;

SELECT test.assert_eq(
    (SELECT count(*) FROM core.role_permissions
     WHERE role_code = 'SYSTEM_ADMIN' AND permission_code ~ '^(customer|visit|lead|opportunity)\.'),
    0::bigint, 'SYSTEM_ADMIN ไม่มีสิทธิ์ customer.* visit.* lead.* opportunity.*');
SELECT test.assert_eq(
    (SELECT count(*) FROM core.role_permissions WHERE (role_code = 'SYSTEM_ADMIN') <> (scope = 'SYSTEM')),
    0::bigint, 'scope SYSTEM มีเฉพาะ SYSTEM_ADMIN และ SYSTEM_ADMIN มีแต่ SYSTEM');


-- =====================================================================================
-- 6. Master Data (CANONICAL ข้อ 4.2 · 4.7 · 5 · 14.6)
-- =====================================================================================

SELECT test.assert_eq(
    (SELECT string_agg(relname, ',' ORDER BY relname) FROM pg_class
     WHERE relnamespace = 'ref'::regnamespace AND relkind = 'r'
       AND relname IN ('channels','sources','interest_types','product_types','lost_reasons','visit_outcomes','interaction_types',
                       'task_types','priorities','provinces','ownership_change_reasons','duplicate_override_reasons',
                       'export_reasons','consent_purposes','transaction_types','source_systems')),
    'channels,consent_purposes,duplicate_override_reasons,export_reasons,interaction_types,interest_types,lost_reasons,ownership_change_reasons,priorities,product_types,provinces,source_systems,sources,task_types,transaction_types,visit_outcomes',
    'มีตาราง ref ครบ 16 ตารางตามข้อ 14.6');

-- จังหวัด
SELECT test.assert_eq((SELECT count(*) FROM ref.provinces), 77::bigint, 'ref.provinces มี 77 จังหวัด');
SELECT test.assert_eq((SELECT label_th FROM ref.provinces WHERE code = 'TH-10'), 'กรุงเทพมหานคร', 'TH-10 = กรุงเทพมหานคร');
SELECT test.assert_eq((SELECT label_th || ' / ' || label_en FROM ref.provinces WHERE code = 'TH-50'), 'เชียงใหม่ / Chiang Mai', 'TH-50 = เชียงใหม่');
SELECT test.assert_eq((SELECT label_th || ' / ' || label_en FROM ref.provinces WHERE code = 'TH-38'), 'บึงกาฬ / Bueng Kan', 'TH-38 = บึงกาฬ (จังหวัดที่ 77)');
SELECT test.assert_eq((SELECT label_th || ' / ' || label_en FROM ref.provinces WHERE code = 'TH-84'), 'สุราษฎร์ธานี / Surat Thani', 'TH-84 = สุราษฎร์ธานี');
SELECT test.assert_eq((SELECT label_th FROM ref.provinces WHERE code = 'TH-96'), 'นราธิวาส', 'TH-96 = นราธิวาส');
SELECT test.assert_eq(
    (SELECT coalesce(string_agg(x, ','), '') FROM (
        SELECT format('TH-%s', n) AS x FROM (
            SELECT generate_series(10, 27) UNION ALL SELECT generate_series(30, 49) UNION ALL SELECT generate_series(50, 58)
            UNION ALL SELECT generate_series(60, 67) UNION ALL SELECT generate_series(70, 77)
            UNION ALL SELECT generate_series(80, 86) UNION ALL SELECT generate_series(90, 96)) g (n)
        EXCEPT SELECT code FROM ref.provinces) d),
    '', 'รหัสจังหวัดครบชุด ISO 3166-2:TH (TH-10…TH-27 · 30…49 · 50…58 · 60…67 · 70…77 · 80…86 · 90…96)');
SELECT test.assert_true(
    (SELECT count(DISTINCT label_th) = 77 AND count(DISTINCT label_en) = 77 AND bool_and(label_en IS NOT NULL) FROM ref.provinces),
    'ชื่อจังหวัดไทย/อังกฤษไม่ซ้ำและมีครบ');

-- จำนวนแถวของ lookup อื่น
SELECT test.assert_eq(
    (SELECT string_agg(t || '=' || n, ',' ORDER BY t) FROM (
        SELECT 'channels' t, count(*) n FROM ref.channels UNION ALL
        SELECT 'consent_purposes', count(*) FROM ref.consent_purposes UNION ALL
        SELECT 'duplicate_override_reasons', count(*) FROM ref.duplicate_override_reasons UNION ALL
        SELECT 'export_reasons', count(*) FROM ref.export_reasons UNION ALL
        SELECT 'interaction_types', count(*) FROM ref.interaction_types UNION ALL
        SELECT 'interest_types', count(*) FROM ref.interest_types UNION ALL
        SELECT 'lost_reasons', count(*) FROM ref.lost_reasons UNION ALL
        SELECT 'ownership_change_reasons', count(*) FROM ref.ownership_change_reasons UNION ALL
        SELECT 'priorities', count(*) FROM ref.priorities UNION ALL
        SELECT 'product_types', count(*) FROM ref.product_types UNION ALL
        SELECT 'source_systems', count(*) FROM ref.source_systems UNION ALL
        SELECT 'sources', count(*) FROM ref.sources UNION ALL
        SELECT 'task_types', count(*) FROM ref.task_types UNION ALL
        SELECT 'transaction_types', count(*) FROM ref.transaction_types UNION ALL
        SELECT 'visit_outcomes', count(*) FROM ref.visit_outcomes) c),
    'channels=7,consent_purposes=2,duplicate_override_reasons=3,export_reasons=5,interaction_types=11,interest_types=7,lost_reasons=14,ownership_change_reasons=6,priorities=4,product_types=8,source_systems=6,sources=11,task_types=6,transaction_types=8,visit_outcomes=7',
    'จำนวนค่าในแต่ละ lookup ตรงข้อ 4.2 · 4.7 · 5.x');

SELECT test.assert_eq((SELECT string_agg(code, ',' ORDER BY sort_order) FROM ref.channels),
    'WALK_IN,LINE,FACEBOOK,INSTAGRAM,TIKTOK,PHONE,WEBSITE', 'ref.channels ลำดับตามข้อ 5.1');
SELECT test.assert_eq((SELECT string_agg(code, ',' ORDER BY code) FROM ref.channels WHERE is_live), 'PHONE,WALK_IN', 'channels.is_live เฉพาะ WALK_IN และ PHONE');
SELECT test.assert_eq((SELECT string_agg(code || ':' || chart_token, ',' ORDER BY sort_order) FROM ref.channels WHERE code IN ('WALK_IN','WEBSITE')),
    'WALK_IN:--chart-1,WEBSITE:--chart-7', 'channels.chart_token ตามข้อ 5.1');
SELECT test.assert_eq((SELECT string_agg(code, ',' ORDER BY sort_order) FROM ref.interest_types WHERE NOT creates_lead), 'REPAIR,INQUIRY', 'interest_types.creates_lead = false เฉพาะ REPAIR INQUIRY');
SELECT test.assert_eq((SELECT string_agg(code, ',' ORDER BY sort_order) FROM ref.interest_types),
    'BUY,SELL,TRADE_IN,INSTALLMENT,ACCESSORY,REPAIR,INQUIRY', 'ref.interest_types ลำดับชิป 7 ค่า');
SELECT test.assert_eq((SELECT string_agg(code, ',' ORDER BY sort_order) FROM ref.transaction_types WHERE counts_as_purchase),
    'SALE,TRADE_IN_SALE,INSTALLMENT_CONTRACT', 'transaction_types.counts_as_purchase เฉพาะ SALE TRADE_IN_SALE INSTALLMENT_CONTRACT');
SELECT test.assert_eq((SELECT string_agg(code, ',') FROM ref.export_reasons WHERE is_marketing), 'MARKETING_CAMPAIGN', 'export_reasons.is_marketing เฉพาะ MARKETING_CAMPAIGN');
SELECT test.assert_eq((SELECT string_agg(code, ',') FROM ref.visit_outcomes WHERE NOT counts_as_recorded), 'UNRECORDED', 'visit_outcomes.counts_as_recorded = false เฉพาะ UNRECORDED');
SELECT test.assert_true((SELECT bool_and(is_system) FROM ref.visit_outcomes), 'visit_outcomes is_system = true ทั้งหมด (ข้อ 4.2)');
SELECT test.assert_eq((SELECT string_agg(code, ',' ORDER BY sort_order) FROM ref.visit_outcomes),
    'PURCHASED,FOLLOW_UP,NOT_YET,NOT_INTERESTED,SERVICE_DONE,LEFT_BEFORE_SERVICE,UNRECORDED', 'ref.visit_outcomes ลำดับตามข้อ 4.2');
SELECT test.assert_eq((SELECT string_agg(code, ',' ORDER BY sort_order) FROM ref.lost_reasons),
    'PRICE,COMPARING,NOT_READY,DOCUMENTS,CHANGED_MIND,OUT_OF_STOCK,NO_MODEL_COLOR,COMPETITOR,FINANCE_REJECTED,DOWN_PAYMENT,PROMOTION,UNREACHABLE,SERVICE_EXPERIENCE,OTHER',
    'ref.lost_reasons 14 ค่าเรียงตาม sort ข้อ 5.5');
SELECT test.assert_eq((SELECT label_th FROM ref.lost_reasons WHERE code = 'NO_MODEL_COLOR'), 'ไม่มีรุ่น/สีที่ต้องการ', 'lost_reasons NO_MODEL_COLOR ป้ายไทย');
SELECT test.assert_eq((SELECT string_agg(code || ':' || color_token, ',' ORDER BY sort_order) FROM ref.priorities),
    'LOW:neutral,NORMAL:info,HIGH:warning,URGENT:danger', 'ref.priorities ลำดับและสี');
SELECT test.assert_eq((SELECT string_agg(code, ',' ORDER BY sort_order) FROM ref.task_types),
    'FOLLOW_UP,CALL,APPOINTMENT,SEND_QUOTATION,DOCUMENT,OTHER', 'ref.task_types ตามข้อ 4.7');
SELECT test.assert_eq((SELECT string_agg(code, ',' ORDER BY sort_order) FROM ref.interaction_types),
    'VISIT,INQUIRY,CALL,MESSAGE,QUOTATION_SENT,APPOINTMENT,PURCHASE,SERVICE,COMPLAINT,NOTE,OTHER', 'ref.interaction_types ตามข้อ 5.6');
SELECT test.assert_eq((SELECT string_agg(code, ',' ORDER BY sort_order) FROM ref.sources),
    'FACEBOOK_ADS,FACEBOOK_PAGE,TIKTOK,INSTAGRAM,LINE_OA,GOOGLE_MAPS,PASSING_BY,REFERRAL,EXISTING_CUSTOMER,EVENT,OTHER', 'ref.sources ตามข้อ 5.2');
SELECT test.assert_eq((SELECT string_agg(code, ',' ORDER BY sort_order) FROM ref.source_systems),
    'MANUAL,POS,REPAIR,JPM_INSTALLMENT,CONTRACT,ACCOUNTING', 'ref.source_systems ตามข้อ 5.7');
SELECT test.assert_true((SELECT bool_and(controller_entity IS NULL) FROM ref.consent_purposes), 'consent_purposes.controller_entity ว่าง (รอยืนยัน Q17)');
SELECT test.assert_eq((SELECT string_agg(code, ',' ORDER BY sort_order) FROM ref.ownership_change_reasons),
    'SHIFT_CHANGE,WORKLOAD,STAFF_LEFT,CUSTOMER_REQUEST,BRANCH_TRANSFER,OTHER', 'ref.ownership_change_reasons ตามข้อ 5.8');
SELECT test.assert_eq((SELECT string_agg(code, ',' ORDER BY sort_order) FROM ref.duplicate_override_reasons),
    'FAMILY_SHARED_PHONE,DIFFERENT_PERSON,OTHER', 'ref.duplicate_override_reasons ตามข้อ 5.8');
SELECT test.assert_eq(
    (SELECT count(*) FROM (
        SELECT is_active, is_system FROM ref.channels UNION ALL SELECT is_active, is_system FROM ref.sources UNION ALL
        SELECT is_active, is_system FROM ref.interest_types UNION ALL SELECT is_active, is_system FROM ref.product_types UNION ALL
        SELECT is_active, is_system FROM ref.lost_reasons UNION ALL SELECT is_active, is_system FROM ref.visit_outcomes UNION ALL
        SELECT is_active, is_system FROM ref.interaction_types UNION ALL SELECT is_active, is_system FROM ref.task_types UNION ALL
        SELECT is_active, is_system FROM ref.priorities UNION ALL SELECT is_active, is_system FROM ref.provinces UNION ALL
        SELECT is_active, is_system FROM ref.ownership_change_reasons UNION ALL SELECT is_active, is_system FROM ref.duplicate_override_reasons UNION ALL
        SELECT is_active, is_system FROM ref.export_reasons UNION ALL SELECT is_active, is_system FROM ref.consent_purposes UNION ALL
        SELECT is_active, is_system FROM ref.transaction_types UNION ALL SELECT is_active, is_system FROM ref.source_systems) a
     WHERE NOT is_active),
    0::bigint, 'ค่า lookup จาก migration เปิดใช้งานทั้งหมด');


-- =====================================================================================
-- 7. app.settings และ app.clock() (CANONICAL ข้อ 1.2 · 11.2)
-- =====================================================================================

SELECT test.assert_eq(
    (SELECT coalesce(string_agg(format('%s=%s/%s', e.key, e.value, e.editable_by), ', '), '')
     FROM (SELECT * FROM (VALUES
            ('allowed_sso_domains',             '[]'::jsonb,                          'settings.system'),
            ('business_hours',                  '{"default":["10:00","21:00"]}',      'settings.business'),
            ('sla.followup_remind_min',         '15',                                 'settings.business'),
            ('sla.lead_unassigned_min',         '15',                                 'settings.business'),
            ('sla.lead_not_contacted_min',      '30',                                 'settings.business'),
            ('sla.visitor_waiting_min',         '15',                                 'settings.business'),
            ('sla.visit_in_service_min',        '60',                                 'settings.business'),
            ('sla.opportunity_stale_days',      '[7,14]',                             'settings.business'),
            ('escalation.overdue_hours',        '[24,48]',                            'settings.business'),
            ('dq.lead_without_outcome_days',    '14',                                 'settings.business'),
            ('dq.won_without_txn_days',         '3',                                  'settings.business'),
            ('dq.visit_unrecorded_days',        '7',                                  'settings.business'),
            ('badge.new_customer_days',         '30',                                 'settings.business'),
            ('quotation.valid_days',            '7',                                  'settings.business'),
            ('notify.duplicate_digest_time',    '"18:00"',                            'settings.business'),
            ('notify.data_missing_time',        '"09:00"',                            'settings.business'),
            ('export.link_ttl_hours',           '24',                                 'settings.business'),
            ('export.max_downloads',            '3',                                  'settings.business'),
            ('security.reveal_per_hour',        '30',                                 'settings.business'),
            ('security.search_per_hour',        '60',                                 'settings.business'),
            ('security.search_miss_per_hour',   '20',                                 'settings.business'),
            ('security.link_per_day',           '10',                                 'settings.business'),
            ('security.customer_view_per_hour', '100',                                'settings.business'),
            ('session.shared_counter_idle_min', '10',                                 'settings.business')) v (key, value, editable_by)
           EXCEPT SELECT key, value, editable_by FROM app.settings) e),
    '', 'app.settings: ค่าเริ่มต้นและผู้แก้ของข้อ 11.2 ครบ');
SELECT test.assert_eq(
    (SELECT value -> 'MARKETING' ->> 'max_rows' || '/' || (value -> 'MARKETING' ->> 'per_day') || '/' || (value -> 'MARKETING' ->> 'approver_role')
            || ' ' || (value -> 'BRANCH_MANAGER' ->> 'max_rows') || '/' || (value -> 'BRANCH_MANAGER' ->> 'per_day')
            || '/' || coalesce(value -> 'BRANCH_MANAGER' ->> 'approver_role', 'none')
     FROM app.settings WHERE key = 'export.limits'),
    '5000/2/BUSINESS_ADMIN 500/3/none', 'export.limits ตามข้อ 8.2');
SELECT test.assert_true(
    (SELECT editable_by = 'settings.system' AND value #>> '{}' IN ('dev','staging','prod') FROM app.settings WHERE key = 'env'),
    'env มีค่า dev/staging/prod และแก้ด้วย settings.system');
SELECT test.assert_true(
    (SELECT editable_by = 'settings.system' AND (value -> 'as_of') IS NOT NULL FROM app.settings WHERE key = 'clock'),
    'clock มีคีย์ as_of และแก้ด้วย settings.system');

-- พัก trigger ของ migration ถัดไป (เช่น audit SETTINGS_UPDATED) ระหว่างทดสอบพฤติกรรม
SELECT set_config('session_replication_role', 'replica', true);

UPDATE app.settings SET value = '"dev"' WHERE key = 'env';
UPDATE app.settings SET value = '{"as_of": null}' WHERE key = 'clock';
SELECT test.assert_eq(app.clock(), now(), 'app.clock(): env dev + as_of null → now()');
UPDATE app.settings SET value = '{"as_of": "2026-09-11T10:24:00+07:00"}' WHERE key = 'clock';
SELECT test.assert_eq(app.clock(), '2026-09-11T03:24:00Z'::timestamptz, 'app.clock(): env dev + as_of → เวลาที่ตั้ง (ไม่ขึ้นกับ TimeZone)');
SELECT test.assert_eq(app.bangkok_date(app.clock()), '2026-09-11'::date, 'วันธุรกิจของ as_of = 11 ก.ย. 2569');
UPDATE app.settings SET value = '"prod"' WHERE key = 'env';
SELECT test.assert_eq(app.clock(), now(), 'app.clock(): env prod → now() แม้ as_of มีค่า');
DELETE FROM app.settings WHERE key = 'env';
SELECT test.assert_eq(app.clock(), now(), 'app.clock(): ไม่มีแถว env → ถือเป็น prod');
SELECT test.assert_raises($$UPDATE app.settings SET value = '{"as_of": "2026-09-11T10:24:00"}' WHERE key = 'clock'$$,
    'clock.as_of ที่ไม่มี offset ถูกปฏิเสธ', '23514');
SELECT test.assert_raises($$INSERT INTO app.settings (key, value, editable_by) VALUES ('env', '"production"', 'settings.system')$$,
    'env ค่านอก dev/staging/prod ถูกปฏิเสธ', '23514');
SELECT test.assert_raises($$INSERT INTO app.settings (key, value, editable_by) VALUES ('x.y', '1', 'master_data.manage')$$,
    'editable_by ต้องเป็น settings.system หรือ settings.business', '23514');

-- app.running_numbers
SELECT test.assert_raises($$INSERT INTO app.running_numbers (scope_key, last_value) VALUES ('CUSTOMER:2026', 1)$$,
    'running_numbers scope_key รูปแบบผิดถูกปฏิเสธ', '23514');
SELECT test.assert_raises($$INSERT INTO app.running_numbers (scope_key, last_value) VALUES ('ST9', 0)$$,
    'running_numbers ST ต้องไม่มีส่วนต่อท้าย', '23514');
INSERT INTO app.running_numbers (scope_key, last_value) VALUES ('CUS:1999', 1), ('VISIT:JP1:19990101', 1), ('RG:1999', 3);
SELECT test.assert_eq((SELECT count(*) FROM app.running_numbers WHERE scope_key IN ('CUS:1999', 'VISIT:JP1:19990101', 'RG:1999')), 3::bigint,
    'running_numbers รับรูปแบบ CUS:{YYYY} · VISIT:{branch}:{YYYYMMDD} · RG:{YYYY}');
WITH up AS (
    INSERT INTO app.running_numbers (scope_key, last_value) VALUES ('CUS:1999', 1)
    ON CONFLICT (scope_key) DO UPDATE SET last_value = app.running_numbers.last_value + 1
    RETURNING last_value
)
SELECT test.assert_eq((SELECT last_value FROM up), 2::bigint, 'upsert ตัวนับตามข้อ 6.1 ได้เลขถัดไป');


-- =====================================================================================
-- 8. normalize · mask · ตรวจเบอร์ · เลขบัตร · วันธุรกิจ (ข้อ 1.2 · 6.4 · 10.1 · 13.7 · 13.8 · 13.14)
-- =====================================================================================

SELECT test.assert_eq(app.normalize_contact('PHONE', '081-234-5678'), '+66812345678', 'normalize PHONE 081-234-5678 → +66812345678');
SELECT test.assert_eq(app.mask_contact('PHONE', '+66812345678'), '081-XXX-5678', 'mask PHONE +66812345678 → 081-XXX-5678');
SELECT test.assert_eq(app.normalize_contact('PHONE', '02-123-4567'), '+6621234567', 'normalize PHONE 02-123-4567 → +6621234567');
SELECT test.assert_eq(app.mask_contact('PHONE', '+6621234567'), '02-XXX-4567', 'mask PHONE +6621234567 → 02-XXX-4567');
SELECT test.assert_eq(app.normalize_contact('EMAIL', 'somchai.j@example.com'), 'somchai.j@example.com', 'normalize EMAIL somchai.j@example.com');
SELECT test.assert_eq(app.mask_contact('EMAIL', 'somchai.j@example.com'), 's***@example.com', 'mask EMAIL → s***@example.com');
SELECT test.assert_eq(app.normalize_contact('EMAIL', '  Somchai.J@Example.COM '), 'somchai.j@example.com', 'normalize EMAIL ตัดช่องว่าง + ตัวพิมพ์เล็ก');
SELECT test.assert_eq(app.normalize_contact('LINE_ID', '@Somchai_J'), 'somchai_j', 'normalize LINE_ID @Somchai_J → somchai_j');
SELECT test.assert_eq(app.mask_contact('LINE_ID', 'somchai_j'), 'so***', 'mask LINE_ID somchai_j → so***');
SELECT test.assert_eq(app.normalize_contact('LINE_ID', ' @ somchai_j '), 'somchai_j', 'normalize LINE_ID ตัดช่องว่างก่อนตัด @');
SELECT test.assert_eq(app.normalize_contact('FACEBOOK', ' Somchai.Jaidee '), 'somchai.jaidee', 'normalize FACEBOOK ตัดช่องว่าง + ตัวพิมพ์เล็ก');
SELECT test.assert_eq(app.mask_contact('INSTAGRAM', 'somchai_j'), 'so***', 'mask INSTAGRAM 2 อักษรแรก + ***');
SELECT test.assert_eq(app.mask_contact('TIKTOK', 'thanapol.r'), 'th***', 'mask TIKTOK 2 อักษรแรก + ***');
SELECT test.assert_eq(app.normalize_contact('LINE_USER_ID', 'U4af4980629abcdef0123456789abcdef'), 'U4af4980629abcdef0123456789abcdef', 'normalize LINE_USER_ID ตามที่ LINE ส่ง');
SELECT test.assert_eq(app.mask_contact('LINE_USER_ID', 'U4af4980629abcdef0123456789abcdef'), '—', 'mask LINE_USER_ID → —');
-- ตัวอย่างหน้า 03 (ข้อ 13.8) และ audit (ข้อ 13.14)
SELECT test.assert_eq(app.mask_contact('PHONE', app.normalize_contact('PHONE', '095-123-4567')), '095-XXX-4567', 'ข้อ 13.8 095-123-4567 → 095-XXX-4567');
SELECT test.assert_eq(app.mask_contact('PHONE', app.normalize_contact('PHONE', '090-987-6543')), '090-XXX-6543', 'ข้อ 13.8 090-987-6543 → 090-XXX-6543');
SELECT test.assert_eq(app.mask_contact('PHONE', app.normalize_contact('PHONE', '098-765-4321')), '098-XXX-4321', 'ข้อ 13.8 098-765-4321 → 098-XXX-4321');
SELECT test.assert_eq(app.mask_contact('PHONE', app.normalize_contact('PHONE', '081-456-7890')), '081-XXX-7890', 'ข้อ 13.8 081-456-7890 → 081-XXX-7890');
SELECT test.assert_eq(app.mask_contact('PHONE', app.normalize_contact('PHONE', '089-123-5678')), '089-XXX-5678', 'ข้อ 13.14 รูปแบบ 089-XXX-5678');
-- รูปแบบที่กรอกต่างกันได้ค่า normalized เดียวกัน (ตรวจซ้ำแบบตรงทั้งค่า ข้อ 6.5)
SELECT test.assert_true(
    (SELECT count(DISTINCT app.normalize_contact('PHONE', x)) = 1
     FROM unnest(ARRAY['081-234-5678', '0812345678', '+66 81 234 5678', '+66 081 234 5678', '66812345678', '0066812345678', '๐๘๑-๒๓๔-๕๖๗๘']) x),
    'PHONE หลายรูปแบบ normalize เป็น +66812345678 ค่าเดียว');
SELECT test.assert_eq(app.normalize_contact('PHONE', app.normalize_contact('PHONE', '081-234-5678')), '+66812345678', 'normalize PHONE idempotent');
SELECT test.assert_eq(app.mask_contact('PHONE', '081-234-5678'), '081-XXX-5678', 'mask รับค่าที่ยังไม่ normalize ได้ผลเดียวกัน');
SELECT test.assert_eq(app.normalize_contact('PHONE', 'ไม่มีเบอร์'), NULL::text, 'PHONE ที่ไม่มีตัวเลข normalize เป็น NULL');

-- เบอร์ถูกต้อง (ข้อ 6.4)
SELECT test.assert_true(app.is_valid_thai_phone('081-234-5678') AND app.is_valid_thai_phone('0612345678') AND app.is_valid_thai_phone('091-234-5678'),
    'มือถือ 10 หลักขึ้นต้น 06 08 09 ถูกต้อง');
SELECT test.assert_true(app.is_valid_thai_phone('02-123-4567') AND app.is_valid_thai_phone('053-123-456') AND app.is_valid_thai_phone('071234567'),
    'เบอร์บ้าน 9 หลักขึ้นต้น 02–07 ถูกต้อง');
SELECT test.assert_true(app.is_valid_thai_phone('+66812345678'), 'ค่า normalized E.164 ถูกต้อง');
SELECT test.assert_true(NOT app.is_valid_thai_phone('012-345-6789') AND NOT app.is_valid_thai_phone('0712345678')
                        AND NOT app.is_valid_thai_phone('0812345') AND NOT app.is_valid_thai_phone('012345678')
                        AND NOT app.is_valid_thai_phone('+1 415 555 0100') AND NOT app.is_valid_thai_phone(NULL),
    'เบอร์นอกกติกาไม่ถูกต้อง (01 · 07 10 หลัก · สั้น · 01 9 หลัก · ต่างประเทศ · NULL)');

-- เลขบัตรประชาชน (ข้อ 10.1) · 1234567890121: Σ = 352 → (11 − 352 mod 11) mod 10 = 1
SELECT test.assert_true(app.is_thai_national_id('1234567890121'), 'เลขบัตร 13 หลัก checksum ถูกต้อง');
SELECT test.assert_true(app.is_thai_national_id('1-2345-67890-12-1') AND app.is_thai_national_id('1 2345 67890 12 1'), 'เลขบัตรที่มีขีด/ช่องว่างคั่น');
SELECT test.assert_true(NOT app.is_thai_national_id('1234567890122'), 'เลขบัตร checksum ผิด');
SELECT test.assert_true(NOT app.is_thai_national_id('123456789012') AND NOT app.is_thai_national_id('12345678901210')
                        AND NOT app.is_thai_national_id('0812345678') AND NOT app.is_thai_national_id(NULL),
    'ไม่ใช่ 13 หลัก → false');

-- วันธุรกิจ Asia/Bangkok
SELECT test.assert_eq(app.bangkok_date('2026-09-11T17:30:00Z'), '2026-09-12'::date, 'bangkok_date 17:30Z → วันถัดไป');
SELECT test.assert_eq(app.bangkok_date('2026-09-11T16:59:59Z'), '2026-09-11'::date, 'bangkok_date 16:59:59Z → วันเดิม');


-- =====================================================================================
-- 9. ตารางองค์กร/พนักงาน/บทบาท: CHECK สำคัญ (ข้อ 7.1 · 7.2 · 8.1)
-- =====================================================================================

INSERT INTO core.organizations (id, code, name_th) VALUES ('5e000000-0000-4000-8000-000000000001', 'TEST-S1', 'องค์กรทดสอบ stage 1');
INSERT INTO core.business_units (id, organization_id, code, name_th)
    VALUES ('5e000000-0000-4000-8000-000000000002', '5e000000-0000-4000-8000-000000000001', 'TBU', 'หน่วยทดสอบ');
INSERT INTO core.branches (id, organization_id, business_unit_id, code, name_th, branch_type)
    VALUES ('5e000000-0000-4000-8000-000000000003', '5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000002', 'TB1', 'สาขาทดสอบ', 'store');
INSERT INTO core.staff_profiles (id, organization_id, staff_code, employee_code, display_name, email, status, invite_expires_at) VALUES
    ('5e000000-0000-4000-8000-000000000011', '5e000000-0000-4000-8000-000000000001', 'ST-9901', 'EMP-S1-01', 'คุณทดสอบหนึ่ง', 'stage1.one@example.com', 'INVITED', now() + interval '24 hours'),
    ('5e000000-0000-4000-8000-000000000012', '5e000000-0000-4000-8000-000000000001', 'ST-9902', 'EMP-S1-02', 'คุณทดสอบสอง', 'stage1.two@example.com', 'INVITED', now() + interval '24 hours');

SELECT test.assert_raises($$INSERT INTO core.branches (organization_id, business_unit_id, code, name_th, branch_type)
    VALUES ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000002', 'TB2', 'x', 'kiosk')$$,
    'branch_type ต้องเป็น store หรือ online_team', '23514');
SELECT test.assert_raises($$INSERT INTO core.staff_profiles (organization_id, staff_code, employee_code, display_name, email, status)
    VALUES ('5e000000-0000-4000-8000-000000000001', 'ST-9903', 'EMP-S1-03', 'x', 'stage1.three@example.com', 'ACTIVE')$$,
    'staff ACTIVE ต้องมี user_id', '23514');
SELECT test.assert_raises($$INSERT INTO core.staff_profiles (organization_id, staff_code, employee_code, display_name, email, status, invite_expires_at)
    VALUES ('5e000000-0000-4000-8000-000000000001', 'ST-9904', 'EMP-S1-01', 'x', 'stage1.four@example.com', 'INVITED', now())$$,
    'employee_code ซ้ำกับบัญชีที่ยังไม่ DISABLED ถูกปฏิเสธ', '23505');
SELECT test.assert_raises($$INSERT INTO core.staff_profiles (organization_id, staff_code, employee_code, display_name, email, status, invite_expires_at)
    VALUES ('5e000000-0000-4000-8000-000000000001', 'S-9905', 'EMP-S1-05', 'x', 'stage1.five@example.com', 'INVITED', now())$$,
    'staff_code ต้องเป็นรูปแบบ ST-NNNN', '23514');
UPDATE core.staff_profiles SET status = 'DISABLED' WHERE id = '5e000000-0000-4000-8000-000000000012';
INSERT INTO core.staff_profiles (organization_id, staff_code, employee_code, display_name, email, status, invite_expires_at)
    VALUES ('5e000000-0000-4000-8000-000000000001', 'ST-9906', 'EMP-S1-02', 'คุณทดสอบหก', 'stage1.six@example.com', 'INVITED', now() + interval '24 hours');
SELECT test.assert_eq((SELECT count(*) FROM core.staff_profiles WHERE employee_code = 'EMP-S1-02'), 2::bigint,
    'employee_code เดียวกันได้เมื่อบัญชีเดิม DISABLED (ข้อ 7.1)');

-- การมอบบทบาท: บทบาทองค์กร ⇔ branch_id ว่าง
INSERT INTO core.staff_role_assignments (organization_id, staff_id, role_code, branch_id)
    VALUES ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000011', 'STAFF', '5e000000-0000-4000-8000-000000000003');
INSERT INTO core.staff_role_assignments (organization_id, staff_id, role_code, branch_id)
    VALUES ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000011', 'EXECUTIVE', NULL);
SELECT test.assert_eq((SELECT count(*) FROM core.staff_role_assignments WHERE staff_id = '5e000000-0000-4000-8000-000000000011'), 2::bigint,
    'มอบ STAFF@สาขา และ EXECUTIVE@องค์กร ได้');
SELECT test.assert_raises($$INSERT INTO core.staff_role_assignments (organization_id, staff_id, role_code, branch_id)
    VALUES ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000011', 'BRANCH_MANAGER', NULL)$$,
    'บทบาทสาขา (BRANCH_MANAGER) ไม่มี branch_id ถูกปฏิเสธ', '23514');
SELECT test.assert_raises($$INSERT INTO core.staff_role_assignments (organization_id, staff_id, role_code, branch_id)
    VALUES ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000011', 'OPERATIONS', NULL)$$,
    'บทบาทสาขา (OPERATIONS) ไม่มี branch_id ถูกปฏิเสธ', '23514');
SELECT test.assert_raises($$INSERT INTO core.staff_role_assignments (organization_id, staff_id, role_code, branch_id)
    VALUES ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000011', 'MARKETING', '5e000000-0000-4000-8000-000000000003')$$,
    'บทบาทองค์กร (MARKETING) ที่มี branch_id ถูกปฏิเสธ', '23514');
SELECT test.assert_raises($$INSERT INTO core.staff_role_assignments (organization_id, staff_id, role_code, branch_id)
    VALUES ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000011', 'SYSTEM_ADMIN', '5e000000-0000-4000-8000-000000000003')$$,
    'SYSTEM_ADMIN ที่มี branch_id ถูกปฏิเสธ', '23514');
SELECT test.assert_raises($$INSERT INTO core.staff_role_assignments (organization_id, staff_id, role_code, branch_id)
    VALUES ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000011', 'EXECUTIVE', NULL)$$,
    'บทบาทองค์กรเดิมที่ยังมีผลซ้ำไม่ได้ (NULLS NOT DISTINCT)', '23505');
SELECT test.assert_raises($$INSERT INTO core.staff_role_assignments (organization_id, staff_id, role_code, branch_id, granted_by)
    VALUES ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000011', 'SUPERVISOR', '5e000000-0000-4000-8000-000000000003', '5e000000-0000-4000-8000-000000000011')$$,
    'ห้ามมอบบทบาทให้ตนเอง', '23514');
SELECT test.assert_raises($$UPDATE core.staff_role_assignments SET revoked_by = '5e000000-0000-4000-8000-000000000012'
    WHERE staff_id = '5e000000-0000-4000-8000-000000000011' AND role_code = 'STAFF'$$,
    'ถอน (revoked_by) ต้องตั้ง valid_to ด้วย', '23514');

-- ตารางสิทธิ์: SYSTEM_ADMIN ห้ามได้สิทธิ์ข้อมูลลูกค้า
SELECT test.assert_raises($$INSERT INTO core.role_permissions (role_code, permission_code, scope) VALUES ('SYSTEM_ADMIN', 'customer.read', 'SYSTEM')$$,
    'SYSTEM_ADMIN + customer.read ถูกปฏิเสธโดย CHECK', '23514');
SELECT test.assert_raises($$INSERT INTO core.role_permissions (role_code, permission_code, scope) VALUES ('MARKETING', 'audit.read', 'SYSTEM')$$,
    'scope SYSTEM ของบทบาทอื่นถูกปฏิเสธ', '23514');

-- คำขอบทบาทสูง
SELECT test.assert_raises($$INSERT INTO core.role_grant_requests (organization_id, request_no, role_code, target_staff_id, requested_by)
    VALUES ('5e000000-0000-4000-8000-000000000001', 'RG-1999-0001', 'STAFF', '5e000000-0000-4000-8000-000000000011', '5e000000-0000-4000-8000-000000000012')$$,
    'คำขอบทบาทสูงรับเฉพาะ SYSTEM_ADMIN EXECUTIVE BUSINESS_ADMIN', '23514');
SELECT test.assert_raises($$INSERT INTO core.role_grant_requests (organization_id, request_no, role_code, target_staff_id, requested_by)
    VALUES ('5e000000-0000-4000-8000-000000000001', 'RG-1999-0002', 'SYSTEM_ADMIN', '5e000000-0000-4000-8000-000000000011', '5e000000-0000-4000-8000-000000000011')$$,
    'ผู้ยื่นต้องไม่ใช่ผู้รับ', '23514');
SELECT test.assert_raises($$INSERT INTO core.role_grant_requests (organization_id, request_no, role_code, target_staff_id, requested_by, status)
    VALUES ('5e000000-0000-4000-8000-000000000001', 'RG-1999-0003', 'SYSTEM_ADMIN', '5e000000-0000-4000-8000-000000000011', '5e000000-0000-4000-8000-000000000012', 'APPROVED')$$,
    'APPROVED ต้องมี decided_by/decided_at', '23514');
SELECT test.assert_raises($$INSERT INTO core.role_grant_requests (organization_id, request_no, role_code, target_staff_id, requested_by, status, decided_by, decided_at)
    VALUES ('5e000000-0000-4000-8000-000000000001', 'RG-1999-0004', 'SYSTEM_ADMIN', '5e000000-0000-4000-8000-000000000011', '5e000000-0000-4000-8000-000000000012', 'APPROVED', '5e000000-0000-4000-8000-000000000012', now())$$,
    'ผู้อนุมัติต้องไม่ใช่ผู้ยื่น', '23514');


-- =====================================================================================
-- 10. crm: generated column และ CHECK (ข้อ 6.3 · 6.4 · 6.7 · 6.9 · 10.2 · 10.4)
-- =====================================================================================

INSERT INTO crm.customers (id, organization_id, customer_no, first_name, last_name, nickname, first_seen_at, created_via) VALUES
    ('5e000000-0000-4000-8000-000000000101', '5e000000-0000-4000-8000-000000000001', 'CUS-1999-000001', 'สมชาย', 'ใจดี', 'ชาย', '2026-01-11T13:15:00+07:00', 'QUICK_CAPTURE'),
    ('5e000000-0000-4000-8000-000000000102', '5e000000-0000-4000-8000-000000000001', 'CUS-1999-000002', NULL, NULL, 'ต้น', now(), 'QUICK_CAPTURE'),
    ('5e000000-0000-4000-8000-000000000103', '5e000000-0000-4000-8000-000000000001', 'CUS-1999-000003', '  Somchai ', NULL, NULL, now(), 'IMPORT'),
    ('5e000000-0000-4000-8000-000000000104', '5e000000-0000-4000-8000-000000000001', 'CUS-1999-000004', '   ', '', 'แนน', now(), 'IMPORT'),
    ('5e000000-0000-4000-8000-000000000105', '5e000000-0000-4000-8000-000000000001', 'CUS-1999-000005', NULL, 'ใจงาม', 'หนึ่ง', now(), 'IMPORT'),
    ('5e000000-0000-4000-8000-000000000106', '5e000000-0000-4000-8000-000000000001', 'CUS-1999-000006', 'Somchai', 'JAIDEE', NULL, now(), 'IMPORT');

SELECT test.assert_eq((SELECT display_name || '|' || name_search FROM crm.customers WHERE customer_no = 'CUS-1999-000001'),
    'สมชาย ใจดี|สมชาย ใจดี', 'display_name = ชื่อ นามสกุล · name_search = lower(ชื่อ นามสกุล) (ชื่อเล่นไม่ใช้)');
SELECT test.assert_eq((SELECT display_name || '|' || name_search FROM crm.customers WHERE customer_no = 'CUS-1999-000002'),
    'ต้น|', 'ไม่มีชื่อ-นามสกุล → display_name = ชื่อเล่น · name_search = ''''');
SELECT test.assert_eq((SELECT display_name || '|' || name_search FROM crm.customers WHERE customer_no = 'CUS-1999-000003'),
    'Somchai|somchai', 'ตัดช่องว่างหัวท้าย และ name_search เป็นตัวพิมพ์เล็ก');
SELECT test.assert_eq((SELECT display_name FROM crm.customers WHERE customer_no = 'CUS-1999-000004'),
    'แนน', 'ชื่อเป็นช่องว่างล้วน → ใช้ชื่อเล่น');
SELECT test.assert_eq((SELECT display_name || '|' || name_search FROM crm.customers WHERE customer_no = 'CUS-1999-000005'),
    'ใจงาม|ใจงาม', 'มีแต่นามสกุล → display_name = นามสกุล');
SELECT test.assert_eq((SELECT display_name || '|' || name_search FROM crm.customers WHERE customer_no = 'CUS-1999-000006'),
    'Somchai JAIDEE|somchai jaidee', 'name_search แปลงเป็นตัวพิมพ์เล็กทั้งชื่อและนามสกุล');
UPDATE crm.customers SET first_name = 'ลูกค้านิรนาม ' || customer_no, last_name = NULL, nickname = NULL WHERE customer_no = 'CUS-1999-000001';
SELECT test.assert_eq((SELECT display_name || '|' || name_search FROM crm.customers WHERE customer_no = 'CUS-1999-000001'),
    'ลูกค้านิรนาม CUS-1999-000001|ลูกค้านิรนาม cus-1999-000001', 'generated column คำนวณใหม่เมื่อแก้ชื่อ (รูปแบบ anonymize ข้อ 10.4)');
SELECT test.assert_raises($$INSERT INTO crm.customers (organization_id, customer_no, display_name, first_seen_at, created_via)
    VALUES ('5e000000-0000-4000-8000-000000000001', 'CUS-1999-000009', 'x', now(), 'IMPORT')$$,
    'เขียน display_name ตรงไม่ได้ (generated)', '428C9');
SELECT test.assert_true(
    (SELECT indexdef LIKE '%USING gin (name_search extensions.gin_trgm_ops)%' FROM pg_indexes
     WHERE schemaname = 'crm' AND indexname = 'customers_name_search_trgm_idx'),
    'มี GIN trigram index บน crm.customers.name_search ด้วย extensions.gin_trgm_ops');
-- threshold 0.6 ตามกฎตรวจซ้ำระดับต่ำของข้อ 6.5 ('somchai' กับ 'somchai jaide' ≈ 0.57 จึงไม่ผ่าน)
SELECT set_config('pg_trgm.similarity_threshold', '0.6', true);
SELECT test.assert_eq(
    (SELECT string_agg(customer_no, ',' ORDER BY customer_no) FROM crm.customers
     WHERE organization_id = '5e000000-0000-4000-8000-000000000001' AND name_search OPERATOR(extensions.%) 'somchai jaide'),
    'CUS-1999-000006', 'ค้นชื่อแบบ trigram ด้วย OPERATOR(extensions.%) threshold 0.6');

SELECT test.assert_raises($$INSERT INTO crm.customers (organization_id, customer_no, first_seen_at, created_via) VALUES ('5e000000-0000-4000-8000-000000000001', 'CUS-26-1', now(), 'IMPORT')$$,
    'customer_no ต้องเป็น CUS-YYYY-NNNNNN', '23514');
SELECT test.assert_raises($$INSERT INTO crm.customers (organization_id, customer_no, first_seen_at, created_via, lifecycle_stage) VALUES ('5e000000-0000-4000-8000-000000000001', 'CUS-1999-000010', now(), 'IMPORT', 'VIP')$$,
    'lifecycle_stage นอก 6 ค่าถูกปฏิเสธ', '23514');
SELECT test.assert_raises($$INSERT INTO crm.customers (organization_id, customer_no, first_seen_at, created_via, record_status) VALUES ('5e000000-0000-4000-8000-000000000001', 'CUS-1999-000011', now(), 'IMPORT', 'MERGED')$$,
    'MERGED ต้องมี merged_into_id', '23514');
SELECT test.assert_raises($$INSERT INTO crm.customers (organization_id, customer_no, first_seen_at, created_via) VALUES ('5e000000-0000-4000-8000-000000000001', 'CUS-1999-000012', now(), 'WEB_FORM')$$,
    'created_via นอก QUICK_CAPTURE IMPORT MERGE_SURVIVOR ถูกปฏิเสธ', '23514');
SELECT test.assert_raises($$INSERT INTO crm.customers (organization_id, customer_no, created_via) VALUES ('5e000000-0000-4000-8000-000000000001', 'CUS-1999-000013', 'IMPORT')$$,
    'first_seen_at บังคับ', '23502');
SELECT test.assert_eq((SELECT customer_type || '|' || lifecycle_stage || '|' || record_status || '|' || legal_hold FROM crm.customers WHERE customer_no = 'CUS-1999-000002'),
    'INDIVIDUAL|IDENTIFIED|ACTIVE|false', 'ค่าเริ่มต้น customer_type lifecycle_stage record_status legal_hold');

-- ช่องทางติดต่อ: value_normalized/value_masked เป็น generated
INSERT INTO crm.customer_contacts (organization_id, customer_id, contact_type, value_raw, is_primary) VALUES
    ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000102', 'PHONE',        '081-234-5678',          true),
    ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000102', 'LINE_ID',      '@Somchai_J',            true),
    ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000102', 'EMAIL',        'somchai.j@example.com', true),
    ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000102', 'LINE_USER_ID', 'U0123456789abcdef0123456789abcdef', false),
    ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000103', 'PHONE',        '02-123-4567',           true);
SELECT test.assert_eq(
    (SELECT string_agg(contact_type::text || '=' || value_normalized || '→' || value_masked, ' ; ' ORDER BY contact_type)
     FROM crm.customer_contacts WHERE customer_id = '5e000000-0000-4000-8000-000000000102'),
    'PHONE=+66812345678→081-XXX-5678 ; LINE_ID=somchai_j→so*** ; LINE_USER_ID=U0123456789abcdef0123456789abcdef→— ; EMAIL=somchai.j@example.com→s***@example.com',
    'customer_contacts generated normalized/masked ตามข้อ 13.7');
SELECT test.assert_eq((SELECT value_normalized || '→' || value_masked FROM crm.customer_contacts WHERE customer_id = '5e000000-0000-4000-8000-000000000103'),
    '+6621234567→02-XXX-4567', 'customer_contacts เบอร์บ้าน');
UPDATE crm.customer_contacts SET value_raw = '089-123-5678' WHERE customer_id = '5e000000-0000-4000-8000-000000000103';
SELECT test.assert_eq((SELECT value_masked FROM crm.customer_contacts WHERE customer_id = '5e000000-0000-4000-8000-000000000103'),
    '089-XXX-5678', 'แก้ value_raw แล้ว value_masked คำนวณใหม่ (081-XXX-… → 089-XXX-5678)');
SELECT test.assert_raises($$INSERT INTO crm.customer_contacts (organization_id, customer_id, contact_type, value_raw, value_normalized)
    VALUES ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000102', 'PHONE', '0899999999', '+66899999999')$$,
    'เขียน value_normalized ตรงไม่ได้ (generated)', '428C9');
SELECT test.assert_raises($$INSERT INTO crm.customer_contacts (organization_id, customer_id, contact_type, value_raw)
    VALUES ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000102', 'PHONE', 'ไม่ทราบ')$$,
    'PHONE ที่ normalize แล้วว่างถูกปฏิเสธ', '23502');
SELECT test.assert_raises($$INSERT INTO crm.customer_contacts (organization_id, customer_id, contact_type, value_raw)
    VALUES ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000102', 'PHONE', '0812345678')$$,
    'คู่ (ชนิด, ค่า normalized) ซ้ำในลูกค้าเดียวกันที่ใช้งานอยู่ถูกปฏิเสธ', '23505');
INSERT INTO crm.customer_contacts (organization_id, customer_id, contact_type, value_raw)
    VALUES ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000105', 'PHONE', '0812345678');
SELECT test.assert_eq((SELECT count(DISTINCT customer_id) FROM crm.customer_contacts
                       WHERE organization_id = '5e000000-0000-4000-8000-000000000001' AND contact_type = 'PHONE' AND value_normalized = '+66812345678'),
    2::bigint, 'คนละลูกค้าใช้เบอร์เดียวกันได้ (เช่น ครอบครัว)');

-- ความยินยอม append-only + view สถานะปัจจุบัน
INSERT INTO crm.customer_consents (organization_id, customer_id, purpose_code, status, notice_version, channels, captured_via, captured_by, captured_at, evidence) VALUES
    ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000102', 'PRIVACY_NOTICE', 'GRANTED', 'PN-2026-01', '{}', 'LINK_SENT', '5e000000-0000-4000-8000-000000000011', '2026-01-11T13:20:00+07:00', 'PN-2026-01 · LINE · ส่งลิงก์ประกาศ'),
    ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000102', 'MARKETING',      'GRANTED', 'PN-2026-01', '{LINE}', 'STAFF_FORM', '5e000000-0000-4000-8000-000000000011', '2026-01-20T15:30:00+07:00', 'PN-2026-01 · ฟอร์มหน้าร้าน'),
    ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000102', 'MARKETING',      'WITHDRAWN', 'PN-2026-01', '{}', 'STAFF_FORM', '5e000000-0000-4000-8000-000000000011', '2026-02-01T10:00:00+07:00', 'ลูกค้าขอถอนที่หน้าร้าน');
SELECT test.assert_eq(
    (SELECT string_agg(purpose_code || '=' || status, ',' ORDER BY purpose_code) FROM crm.customer_consent_current
     WHERE customer_id = '5e000000-0000-4000-8000-000000000102'),
    'MARKETING=WITHDRAWN,PRIVACY_NOTICE=GRANTED', 'customer_consent_current = แถวล่าสุดต่อ purpose');
SELECT test.assert_raises($$INSERT INTO crm.customer_consents (organization_id, customer_id, purpose_code, status, channels, captured_via, captured_by, evidence)
    VALUES ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000102', 'MARKETING', 'GRANTED', '{LINE,FAX}', 'STAFF_FORM', '5e000000-0000-4000-8000-000000000011', 'x')$$,
    'ช่องทางความยินยอมนอก LINE SMS PHONE EMAIL ถูกปฏิเสธ', '23514');
SELECT test.assert_raises($$INSERT INTO crm.customer_consents (organization_id, customer_id, purpose_code, status, captured_via, captured_by, evidence)
    VALUES ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000102', 'MARKETING', 'GRANTED', 'STAFF_FORM', '5e000000-0000-4000-8000-000000000011', '  ')$$,
    'evidence ว่างถูกปฏิเสธ', '23514');
SELECT test.assert_raises($$INSERT INTO crm.customer_consents (organization_id, customer_id, purpose_code, status, captured_via, evidence)
    VALUES ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000102', 'PRIVACY_NOTICE', 'GRANTED', 'STAFF_FORM', 'x')$$,
    'บันทึกโดยพนักงานต้องมี captured_by', '23514');

-- โน้ต ≤ 2,000 ตัวอักษร
SELECT test.assert_raises(format($$INSERT INTO crm.customer_notes (organization_id, customer_id, branch_id, body)
    VALUES ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000102', '5e000000-0000-4000-8000-000000000003', %L)$$, repeat('ก', 2001)),
    'โน้ตยาวเกิน 2,000 ตัวอักษรถูกปฏิเสธ', '23514');
INSERT INTO crm.customer_notes (organization_id, customer_id, branch_id, body, is_pinned)
    VALUES ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000102', '5e000000-0000-4000-8000-000000000003', repeat('ก', 2000), true);
SELECT test.assert_eq((SELECT char_length(body)::bigint FROM crm.customer_notes WHERE customer_id = '5e000000-0000-4000-8000-000000000102'), 2000::bigint, 'โน้ต 2,000 ตัวอักษรบันทึกได้');

-- ข้อมูลซ้ำ
SELECT test.assert_raises($$INSERT INTO crm.duplicate_decisions (organization_id, customer_id, candidate_customer_id, score, override_reason_code, created_by)
    VALUES ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000105', '5e000000-0000-4000-8000-000000000102', 40, 'DIFFERENT_PERSON', '5e000000-0000-4000-8000-000000000011')$$,
    'duplicate_decisions สร้างเฉพาะคะแนน ≥ 70', '23514');
INSERT INTO crm.duplicate_decisions (id, organization_id, customer_id, candidate_customer_id, score, matched_rules, override_reason_code, created_by)
    VALUES ('5e000000-0000-4000-8000-000000000201', '5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000105', '5e000000-0000-4000-8000-000000000102', 100, '{"เบอร์โทรตรงกัน"}', 'FAMILY_SHARED_PHONE', '5e000000-0000-4000-8000-000000000011');
SELECT test.assert_raises($$UPDATE crm.duplicate_decisions SET status = 'NOT_DUPLICATE', decided_by = created_by, decided_at = now()
    WHERE id = '5e000000-0000-4000-8000-000000000201'$$,
    'ผู้ตัดสินข้อมูลซ้ำต้องไม่ใช่ผู้สร้างแถว', '23514');
SELECT test.assert_raises($$UPDATE crm.duplicate_decisions SET status = 'NOT_DUPLICATE' WHERE id = '5e000000-0000-4000-8000-000000000201'$$,
    'ตัดสินแล้วต้องมี decided_by/decided_at', '23514');
SELECT test.assert_raises($$INSERT INTO crm.duplicate_decisions (organization_id, customer_id, candidate_customer_id, score, override_reason_code, created_by)
    VALUES ('5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000105', '5e000000-0000-4000-8000-000000000103', 100, 'OTHER', '5e000000-0000-4000-8000-000000000011')$$,
    '1 แถวต่อ 1 ลูกค้าที่สร้างใหม่', '23505');

-- DSR: due_at = received_at + 30 วัน
INSERT INTO crm.data_subject_requests (id, organization_id, request_no, customer_id, requester_name, request_type, received_at, received_by)
    VALUES ('5e000000-0000-4000-8000-000000000301', '5e000000-0000-4000-8000-000000000001', 'DSR-1999-000001', '5e000000-0000-4000-8000-000000000102',
            'ผู้ยื่นทดสอบ', 'ACCESS', '2026-09-11T10:24:00+07:00', '5e000000-0000-4000-8000-000000000011');
SELECT test.assert_eq((SELECT due_at FROM crm.data_subject_requests WHERE id = '5e000000-0000-4000-8000-000000000301'),
    '2026-10-11T10:24:00+07:00'::timestamptz, 'DSR due_at = received_at + 30 วัน');
SELECT test.assert_eq((SELECT status::text FROM crm.data_subject_requests WHERE id = '5e000000-0000-4000-8000-000000000301'), 'RECEIVED', 'DSR เริ่มที่ RECEIVED');
SELECT test.assert_raises($$UPDATE crm.data_subject_requests SET status = 'VERIFIED' WHERE id = '5e000000-0000-4000-8000-000000000301'$$,
    'DSR VERIFIED ต้องมี verified_by และ verification_method', '23514');
SELECT test.assert_raises($$UPDATE crm.data_subject_requests SET verification_method = 'ID_CARD_COPY' WHERE id = '5e000000-0000-4000-8000-000000000301'$$,
    'verification_method นอกชุดที่กำหนดถูกปฏิเสธ (ห้ามเก็บสำเนาบัตร)', '23514');
SELECT test.assert_raises($$UPDATE crm.data_subject_requests SET status = 'COMPLETED', verified_by = '5e000000-0000-4000-8000-000000000011', verification_method = 'IN_PERSON_ID_SIGHTED'
    WHERE id = '5e000000-0000-4000-8000-000000000301'$$,
    'DSR COMPLETED ต้องมี completed_at', '23514');

-- การรวมลูกค้า
SELECT test.assert_raises($$INSERT INTO crm.customer_merges (organization_id, merge_no, survivor_customer_id, merged_customer_id, reason, snapshot, merged_by)
    VALUES ('5e000000-0000-4000-8000-000000000001', 'MG-1999-000001', '5e000000-0000-4000-8000-000000000102', '5e000000-0000-4000-8000-000000000102', 'x', '{}', '5e000000-0000-4000-8000-000000000011')$$,
    'survivor ต้องไม่ใช่รายเดียวกับผู้ถูกรวม', '23514');

SELECT set_config('session_replication_role', 'origin', true);


-- =====================================================================================
-- 11. trigger updated_at ทำงานได้เมื่อผู้ใช้เป็น authenticated โดยไม่ต้อง GRANT EXECUTE
--     (ยืนยันข้อตกลงของ ALTER DEFAULT PRIVILEGES ใน 0001)
-- =====================================================================================

CREATE TEMP TABLE t_touch_probe (id integer PRIMARY KEY, v text, updated_at timestamptz NOT NULL DEFAULT '2000-01-01T00:00:00Z');
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON t_touch_probe FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
INSERT INTO t_touch_probe (id, v) VALUES (1, 'a');
GRANT SELECT, UPDATE ON t_touch_probe TO authenticated;
SELECT test.assert_true(NOT has_function_privilege('authenticated', 'app.touch_updated_at()', 'EXECUTE'), 'authenticated ไม่มี EXECUTE บน app.touch_updated_at');
SELECT test.login_as_uid('5e000000-0000-4000-8000-0000000000ff', 'aal1');
UPDATE t_touch_probe SET v = 'b' WHERE id = 1;
SELECT test.logout();
SELECT test.assert_eq((SELECT updated_at FROM t_touch_probe WHERE id = 1), now(), 'trigger app.touch_updated_at ตั้ง updated_at = now() เมื่อ authenticated แก้แถว');


-- =====================================================================================
-- 12. RLS เปิดทุกตาราง core ref crm · view ใช้ security_invoker (ข้อ 9.4 กติกา 1 และ 4)
-- =====================================================================================

SELECT test.assert_eq(
    (SELECT coalesce(string_agg(n.nspname || '.' || c.relname, ', ' ORDER BY 1), '')
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('core', 'ref', 'crm') AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity),
    '', 'ทุกตารางใน core ref crm เปิด ROW LEVEL SECURITY');
SELECT test.assert_true(
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('core', 'ref', 'crm') AND c.relkind = 'r'
       AND c.relname IN ('organizations','business_units','branches','departments','teams','team_members','devices','staff_profiles',
                         'staff_invitations','roles','permissions','role_permissions','staff_role_assignments','role_grant_requests',
                         'customers','customer_contacts','customer_addresses','customer_branches','customer_notes','tags','customer_tags',
                         'customer_consents','customer_merges','duplicate_decisions','data_subject_requests')
       AND c.relrowsecurity) = 25,
    'ตาราง core 14 + crm 11 ของ stage 1 มีอยู่และเปิด RLS (ตาราง ref 16 ตรวจชื่อในข้อ 6)');
SELECT test.assert_true((SELECT bool_and(relrowsecurity) FROM pg_class WHERE relnamespace = 'app'::regnamespace AND relname IN ('settings','running_numbers','rate_limit_counters')),
    'ตาราง app ของ stage 1 เปิด RLS (ไม่มี policy = ปฏิเสธทุก role ที่ไม่ใช่ owner)');
SELECT test.assert_eq(
    (SELECT coalesce(string_agg(n.nspname || '.' || c.relname, ', ' ORDER BY 1), '')
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('api','app','core','ref','crm','analytics','audit','restricted')
       AND ((c.relkind = 'v' AND NOT coalesce(c.reloptions @> ARRAY['security_invoker=true'], false))
            OR (c.relkind = 'm' AND n.nspname IN ('api','crm','core','ref')))),
    '', 'ทุก view ของระบบเป็น security_invoker และไม่มี materialized view ใน schema ที่เปิด API');
SELECT test.assert_true(
    (SELECT reloptions @> ARRAY['security_invoker=true'] FROM pg_class WHERE oid = 'crm.customer_consent_current'::regclass),
    'crm.customer_consent_current สร้าง WITH (security_invoker = true)');
