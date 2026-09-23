-- =====================================================================================
-- supabase/tests/analytics_02_reports.sql — รายงานของ migration 0012_analytics.sql
--   api.get_report (OVERVIEW · CUSTOMERS · SALES · CHANNELS · STAFF · BRANCHES · LOST_REASONS · DATA_QUALITY)
--   api.record_report_export (CANONICAL ข้อ 9.6 · 12.0 · 13.4 · 14.8)
-- fixture อิสระจาก supabase/seed.sql (องค์กร TEST-RPT · staff ST-92xx · อีเมล @test.example.com)
-- run.mjs ครอบไฟล์ด้วย BEGIN … ROLLBACK · ห้ามมีคำสั่งควบคุมทรานแซกชันในไฟล์
-- "ตอนนี้" = 11 ก.ย. 2569 10:24 น. · P (LAST_30_DAYS) = [13 ส.ค. 2569, 12 ก.ย. 2569)
-- =====================================================================================

-- ===== P0: helper =====
CREATE FUNCTION test.dstage(p jsonb, p_code text, p_field text) RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT x ->> p_field FROM jsonb_array_elements(p -> 'funnel') x
    WHERE x ->> 'code' = p_code LIMIT 1
$$;
CREATE FUNCTION test.dseg(p jsonb, p_code text, p_field text) RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT x ->> p_field FROM jsonb_array_elements(p -> 'channels' -> 'segments') x
    WHERE x ->> 'code' = p_code LIMIT 1
$$;
CREATE FUNCTION test.rrow(p jsonb, p_code text, p_field text, p_gk text DEFAULT NULL) RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT x ->> p_field
    FROM jsonb_array_elements(p -> 'rows') x
    WHERE x ->> 'code' = p_code
      AND ((p_gk IS NULL AND (x -> 'group_key') = 'null'::jsonb)
        OR (p_gk IS NOT NULL AND x ->> 'group_key' = p_gk))
    LIMIT 1
$$;
CREATE FUNCTION test.lost(p jsonb, p_code text, p_field text) RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT x ->> p_field FROM jsonb_array_elements(p -> 'extra' -> 'lost_reasons') x
    WHERE x ->> 'code' = p_code LIMIT 1
$$;
CREATE FUNCTION test.denied3(p_sql text, p_msg text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN PERFORM test.assert_raises(p_sql, p_msg, '42501'); END;
$$;
CREATE FUNCTION test.invalid3(p_sql text, p_msg text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN PERFORM test.assert_raises(p_sql, p_msg, '22023'); END;
$$;
CREATE TABLE test.rep (k text PRIMARY KEY, v jsonb);
CREATE FUNCTION test.g(p_k text) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT v FROM test.rep WHERE k = p_k $$;
GRANT EXECUTE ON FUNCTION test.rrow(jsonb, text, text, text), test.lost(jsonb, text, text),
    test.dstage(jsonb, text, text), test.dseg(jsonb, text, text),
                          test.denied3(text, text), test.invalid3(text, text), test.g(text)
TO anon, authenticated, service_role;
GRANT SELECT, INSERT ON test.rep TO authenticated, service_role;

-- ===== F0: นาฬิกา + fixture =====
UPDATE app.settings SET value = '{"as_of": "2026-09-11T10:24:00+07:00"}' WHERE key = 'clock';
SELECT set_config('app.bulk', 'on', true);
SELECT set_config('app.seed_mode', 'off', true);

INSERT INTO core.organizations (id, code, name_th)
VALUES ('9b000000-0000-4000-8000-000000000001', 'TEST-RPT', 'องค์กรทดสอบรายงาน');
INSERT INTO core.business_units (id, organization_id, code, name_th)
VALUES ('9b000000-0000-4000-8000-000000000002', '9b000000-0000-4000-8000-000000000001', 'TRBU', 'หน่วยทดสอบรายงาน');
INSERT INTO core.branches (id, organization_id, business_unit_id, code, name_th, branch_type) VALUES
    ('9b000000-0000-4000-8000-000000000011', '9b000000-0000-4000-8000-000000000001', '9b000000-0000-4000-8000-000000000002', 'RT1', 'สาขารายงาน 1', 'store'),
    ('9b000000-0000-4000-8000-000000000012', '9b000000-0000-4000-8000-000000000001', '9b000000-0000-4000-8000-000000000002', 'RT2', 'สาขารายงาน 2', 'store');

INSERT INTO auth.users (id, email, email_confirmed_at)
SELECT ('9b000000-0000-4000-8000-0000000090' || lpad(n::text, 2, '0'))::uuid,
       'rpt.u' || lpad(n::text, 2, '0') || '@test.example.com', now() FROM generate_series(1, 4) n;
INSERT INTO auth.mfa_factors (user_id, status)
SELECT ('9b000000-0000-4000-8000-0000000090' || lpad(n::text, 2, '0'))::uuid, 'verified' FROM generate_series(1, 4) n;
INSERT INTO core.staff_profiles (id, organization_id, staff_code, employee_code, display_name, email, user_id, status)
SELECT ('9b000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid,
       '9b000000-0000-4000-8000-000000000001', 'ST-92' || lpad(n::text, 2, '0'), 'RPT-' || lpad(n::text, 2, '0'),
       (ARRAY['ผู้บริหารรายงาน', 'ผู้จัดการ RT1', 'การตลาดรายงาน', 'พนักงาน RT1'])[n],
       'rpt.u' || lpad(n::text, 2, '0') || '@test.example.com',
       ('9b000000-0000-4000-8000-0000000090' || lpad(n::text, 2, '0'))::uuid, 'ACTIVE'
FROM generate_series(1, 4) n;
INSERT INTO core.staff_role_assignments (organization_id, staff_id, role_code, branch_id, valid_from) VALUES
    ('9b000000-0000-4000-8000-000000000001', '9b000000-0000-4000-8000-000000000101', 'EXECUTIVE',      NULL,                                   now() - interval '400 days'),
    ('9b000000-0000-4000-8000-000000000001', '9b000000-0000-4000-8000-000000000102', 'BRANCH_MANAGER', '9b000000-0000-4000-8000-000000000011', now() - interval '400 days'),
    ('9b000000-0000-4000-8000-000000000001', '9b000000-0000-4000-8000-000000000103', 'MARKETING',      NULL,                                   now() - interval '400 days'),
    ('9b000000-0000-4000-8000-000000000001', '9b000000-0000-4000-8000-000000000104', 'STAFF',          '9b000000-0000-4000-8000-000000000011', now() - interval '400 days');

-- ลูกค้า 5 ราย (ช่องทางแรกต่างกันเพื่อทดสอบเมทริกซ์ช่องทาง × สาขา ของข้อ 13.3)
INSERT INTO crm.customers (id, organization_id, customer_no, first_name, last_name, first_seen_at,
                           first_channel_code, first_branch_id, owner_staff_id, province_code, created_via, created_by) VALUES
 ('9b000000-0000-4000-8000-000000000201','9b000000-0000-4000-8000-000000000001','CUS-1992-000001','รายงาน','หนึ่ง','2026-08-20T10:00:00+07:00','WALK_IN', '9b000000-0000-4000-8000-000000000011','9b000000-0000-4000-8000-000000000104','TH-10','QUICK_CAPTURE','9b000000-0000-4000-8000-000000000104'),
 ('9b000000-0000-4000-8000-000000000202','9b000000-0000-4000-8000-000000000001','CUS-1992-000002','รายงาน','สอง', '2026-08-21T10:00:00+07:00','LINE',    '9b000000-0000-4000-8000-000000000011','9b000000-0000-4000-8000-000000000104','TH-10','QUICK_CAPTURE','9b000000-0000-4000-8000-000000000104'),
 ('9b000000-0000-4000-8000-000000000203','9b000000-0000-4000-8000-000000000001','CUS-1992-000003','รายงาน','สาม', '2026-08-22T10:00:00+07:00','FACEBOOK','9b000000-0000-4000-8000-000000000011','9b000000-0000-4000-8000-000000000104','TH-10','QUICK_CAPTURE','9b000000-0000-4000-8000-000000000104'),
 ('9b000000-0000-4000-8000-000000000204','9b000000-0000-4000-8000-000000000001','CUS-1992-000004','รายงาน','สี่',  '2026-08-23T10:00:00+07:00','WALK_IN', '9b000000-0000-4000-8000-000000000012','9b000000-0000-4000-8000-000000000102','TH-10','QUICK_CAPTURE','9b000000-0000-4000-8000-000000000102'),
 ('9b000000-0000-4000-8000-000000000205','9b000000-0000-4000-8000-000000000001','CUS-1992-000005','รายงาน','ห้า',  '2026-08-24T10:00:00+07:00','LINE',    '9b000000-0000-4000-8000-000000000012','9b000000-0000-4000-8000-000000000102','TH-10','QUICK_CAPTURE','9b000000-0000-4000-8000-000000000102');
INSERT INTO crm.customer_branches (organization_id, customer_id, branch_id, first_linked_at, last_activity_at, linked_via)
SELECT '9b000000-0000-4000-8000-000000000001', c.id, c.first_branch_id, c.first_seen_at, c.first_seen_at, 'CREATED'
FROM crm.customers c WHERE c.organization_id = '9b000000-0000-4000-8000-000000000001';
-- CR2 มีเบอร์ไม่ถูกต้อง (INVALID_PHONE) · CR1 และ CR4 ช่องทางแรก WALK_IN แต่ไม่มีเบอร์ (MISSING_PHONE)
INSERT INTO crm.customer_contacts (organization_id, customer_id, contact_type, value_raw, is_primary, is_valid)
VALUES ('9b000000-0000-4000-8000-000000000001', '9b000000-0000-4000-8000-000000000202', 'PHONE', '54321', true, false);

-- visit หนึ่งครั้งต่อลูกค้า (ให้มีกิจกรรมในช่วง P)
INSERT INTO crm.visits (id, organization_id, visit_no, branch_id, channel_code, status, queue_no, customer_id,
                        interest_code, started_at, service_started_at, ended_at, owner_staff_id, outcome_code,
                        created_at, created_by)
SELECT ('9b000000-0000-4000-8000-00000000030' || n::text)::uuid, '9b000000-0000-4000-8000-000000000001',
       'V-RT' || (CASE WHEN n <= 3 THEN '1' ELSE '2' END) || '-2608' || lpad((19 + n)::text, 2, '0') || '-001',
       (CASE WHEN n <= 3 THEN '9b000000-0000-4000-8000-000000000011' ELSE '9b000000-0000-4000-8000-000000000012' END)::uuid,
       'WALK_IN', 'COMPLETED', 1,
       ('9b000000-0000-4000-8000-00000000020' || n::text)::uuid, 'INQUIRY',
       ('2026-08-' || lpad((19 + n)::text, 2, '0') || 'T10:00:00+07:00')::timestamptz,
       ('2026-08-' || lpad((19 + n)::text, 2, '0') || 'T10:00:00+07:00')::timestamptz,
       ('2026-08-' || lpad((19 + n)::text, 2, '0') || 'T11:00:00+07:00')::timestamptz,
       (CASE WHEN n <= 3 THEN '9b000000-0000-4000-8000-000000000104' ELSE '9b000000-0000-4000-8000-000000000102' END)::uuid,
       'SERVICE_DONE',
       ('2026-08-' || lpad((19 + n)::text, 2, '0') || 'T10:00:00+07:00')::timestamptz,
       '9b000000-0000-4000-8000-000000000104'
FROM generate_series(1, 5) n;

-- opportunity ที่ไม่สำเร็จ 11 รายการ (เหตุผล 7 ชนิด) เพื่อทดสอบ "5 อันดับแรก + อื่น ๆ" ของข้อ 13.4
INSERT INTO crm.opportunities (organization_id, opportunity_no, customer_id, origin_channel_code, branch_id,
                               owner_staff_id, interest_code, stage, expected_amount, closed_at, lost_reason_code,
                               created_at, created_by)
SELECT '9b000000-0000-4000-8000-000000000001', 'OP-1992-' || lpad(n::text, 6, '0'),
       '9b000000-0000-4000-8000-000000000201', 'WALK_IN', '9b000000-0000-4000-8000-000000000011',
       '9b000000-0000-4000-8000-000000000104', 'BUY', 'LOST', 0,
       '2026-09-01T10:00:00+07:00',
       (ARRAY['PRICE','PRICE','PRICE','COMPARING','COMPARING','NOT_READY','NOT_READY',
              'DOCUMENTS','CHANGED_MIND','OUT_OF_STOCK','COMPETITOR'])[n],
       '2026-08-25T10:00:00+07:00', '9b000000-0000-4000-8000-000000000104'
FROM generate_series(1, 11) n;

-- lead ที่ไม่สำเร็จ 2 รายการ (คอลัมน์ "ในนั้นเป็น Lead" ของข้อ 13.4)
INSERT INTO crm.leads (organization_id, lead_no, customer_id, branch_id, owner_staff_id, channel_code,
                       interest_code, status, closed_at, lost_reason_code, created_at, created_by)
SELECT '9b000000-0000-4000-8000-000000000001', 'LD-1992-' || lpad(n::text, 6, '0'),
       '9b000000-0000-4000-8000-000000000201', '9b000000-0000-4000-8000-000000000011',
       '9b000000-0000-4000-8000-000000000104', 'LINE', 'BUY', 'LOST',
       '2026-09-02T10:00:00+07:00', (ARRAY['PRICE','UNREACHABLE'])[n],
       '2026-08-26T10:00:00+07:00', '9b000000-0000-4000-8000-000000000104'
FROM generate_series(1, 2) n;

SELECT set_config('app.bulk', 'off', true);

-- =====================================================================================
-- G. api.get_report — โครงผลลัพธ์และรหัสที่รองรับ
-- =====================================================================================
SELECT test.login_as('rpt.u01@test.example.com', 'aal2');
INSERT INTO test.rep (k, v) VALUES
    ('ov',  api.get_report('OVERVIEW')),
    ('cu',  api.get_report('CUSTOMERS')),
    ('sa',  api.get_report('SALES')),
    ('ch',  api.get_report('CHANNELS')),
    ('br',  api.get_report('BRANCHES')),
    ('stf', api.get_report('STAFF')),
    ('lr',  api.get_report('LOST_REASONS')),
    ('dq',  api.get_report('DATA_QUALITY'));

SELECT test.assert_eq(test.g('ov') ->> 'code',     'OVERVIEW', 'G01 คืนรหัสรายงานที่ขอ');
SELECT test.assert_eq(test.g('ov') ->> 'group_by', 'NONE',     'G02 OVERVIEW จัดกลุ่ม NONE โดยปริยาย');
SELECT test.assert_eq(test.g('ch') ->> 'group_by', 'CHANNEL',  'G03 CHANNELS จัดกลุ่ม CHANNEL โดยปริยาย');
SELECT test.assert_eq(test.g('br') ->> 'group_by', 'BRANCH',   'G04 BRANCHES จัดกลุ่ม BRANCH โดยปริยาย');
SELECT test.assert_eq(test.g('stf') ->> 'group_by','STAFF',    'G05 STAFF จัดกลุ่ม STAFF โดยปริยาย');
SELECT test.assert_true((test.g('ov') -> 'period' ->> 'start')::timestamptz = '2026-08-13T00:00:00+07:00',
                        'G06 ช่วงของรายงานใช้สูตรเดียวกับ api.get_kpis');
SELECT test.invalid3($$SELECT api.get_report('NOT_A_REPORT')$$, 'G07 รหัสรายงานที่ไม่รู้จักถูกปฏิเสธ');

-- รายงานคืนเฉพาะ KPI ของรหัสนั้น
SELECT test.assert_eq(test.rrow(test.g('ov'), 'VISITS', 'value')::numeric, 5::numeric, 'G08 OVERVIEW · VISITS');
SELECT test.assert_eq(test.rrow(test.g('ov'), 'UNIQUE_CUSTOMERS', 'value')::numeric, 5::numeric, 'G09 OVERVIEW · UNIQUE_CUSTOMERS');
SELECT test.assert_eq((SELECT count(*) FROM jsonb_array_elements(test.g('ov') -> 'rows') x
                        WHERE x ->> 'code' = 'DUPLICATE_RATE'), 0::bigint, 'G10 OVERVIEW ไม่คืน KPI นอกรายงาน');
SELECT test.assert_eq((SELECT count(*) FROM jsonb_array_elements(test.g('dq') -> 'rows') x), 5::bigint,
                      'G11 DATA_QUALITY คืน KPI คุณภาพข้อมูล 5 ตัว (ข้อ 12.3)');
SELECT test.assert_eq(test.rrow(test.g('cu'), 'CAPTURE_RATE', 'display'), '100.0%', 'G12 CUSTOMERS · CAPTURE_RATE (visit ทุกครั้งระบุตัวตน)');
SELECT test.assert_eq(test.rrow(test.g('sa'), 'LOST_TOTAL', 'value')::numeric, 13::numeric, 'G13 SALES · LOST_TOTAL = 11 + 2');
SELECT test.assert_eq(test.rrow(test.g('sa'), 'LOST_OPPORTUNITIES', 'value')::numeric, 11::numeric, 'G14 SALES · LOST_OPPORTUNITIES');
SELECT test.assert_eq(test.rrow(test.g('sa'), 'LOST_LEADS', 'value')::numeric, 2::numeric, 'G15 SALES · LOST_LEADS');

-- =====================================================================================
-- H. LOST_REASONS — 5 อันดับแรก + "อื่น ๆ" (CANONICAL ข้อ 5.5 · 13.4)
-- =====================================================================================
SELECT test.assert_eq((SELECT count(*) FROM jsonb_array_elements(test.g('lr') -> 'extra' -> 'lost_reasons') x),
                      6::bigint, 'H01 กราฟเหตุผลมี 6 แถว = 5 อันดับแรก + อื่น ๆ');
SELECT test.assert_eq(test.lost(test.g('lr'), 'PRICE', 'value')::numeric,       4::numeric, 'H02 PRICE = 3 opportunity + 1 lead');
SELECT test.assert_eq(test.lost(test.g('lr'), 'PRICE', 'lead_value')::numeric,  1::numeric, 'H03 คอลัมน์ "ในนั้นเป็น Lead" ของ PRICE');
SELECT test.assert_eq(test.lost(test.g('lr'), 'PRICE', 'label_th'),  'ราคาสูงไป', 'H04 ป้ายไทยจาก ref.lost_reasons');
SELECT test.assert_eq(test.lost(test.g('lr'), 'PRICE', 'pct_display'),  '30.8%', 'H05 ร้อยละของ PRICE = 4/13');
SELECT test.assert_eq(test.lost(test.g('lr'), 'COMPARING', 'value')::numeric,   2::numeric, 'H06 COMPARING');
SELECT test.assert_eq(test.lost(test.g('lr'), 'NOT_READY', 'value')::numeric,   2::numeric, 'H07 NOT_READY (คะแนนเท่ากันเรียงตาม sort_order)');
SELECT test.assert_eq(test.lost(test.g('lr'), 'DOCUMENTS', 'value')::numeric,   1::numeric, 'H08 DOCUMENTS');
SELECT test.assert_eq(test.lost(test.g('lr'), 'CHANGED_MIND', 'value')::numeric,1::numeric, 'H09 CHANGED_MIND');
SELECT test.assert_eq(test.lost(test.g('lr'), '_OTHERS', 'value')::numeric,     3::numeric, 'H10 "อื่น ๆ" รวมอันดับ 6 เป็นต้นไป');
SELECT test.assert_eq(test.lost(test.g('lr'), '_OTHERS', 'label_th'),  'อื่น ๆ', 'H11 ป้ายของกลุ่มอื่น ๆ');
SELECT test.assert_eq(test.lost(test.g('lr'), '_OTHERS', 'lead_value')::numeric, 1::numeric, 'H12 lead ใน "อื่น ๆ" (UNREACHABLE)');
SELECT test.assert_eq((SELECT sum((x ->> 'value')::numeric) FROM jsonb_array_elements(test.g('lr') -> 'extra' -> 'lost_reasons') x),
                      13::numeric, 'H13 ผลรวมของกราฟ = LOST_TOTAL');
SELECT test.assert_eq((SELECT (jsonb_array_elements(test.g('lr') -> 'extra' -> 'lost_reasons') ->> 'code')
                         FROM jsonb_array_elements(test.g('lr') -> 'extra' -> 'lost_reasons') LIMIT 1),
                      'PRICE', 'H14 เรียงมากไปน้อย (อันดับแรกคือ PRICE)');
SELECT test.assert_eq((SELECT x ->> 'code' FROM jsonb_array_elements(test.g('lr') -> 'extra' -> 'lost_reasons')
                            WITH ORDINALITY AS t(x, ord) ORDER BY t.ord DESC LIMIT 1),
                      '_OTHERS', 'H15 "อื่น ๆ" อยู่ท้ายเสมอ');
-- SALES ใช้กราฟเดียวกัน
SELECT test.assert_eq(test.lost(test.g('sa'), 'PRICE', 'value')::numeric, 4::numeric, 'H16 แท็บการขายมีกราฟเหตุผลเดียวกัน');

-- =====================================================================================
-- I. CHANNELS · OVERVIEW · DATA_QUALITY — ส่วนเสริม
-- =====================================================================================
SELECT test.assert_eq((SELECT count(*) FROM jsonb_array_elements(test.g('ch') -> 'extra' -> 'channel_matrix') x),
                      5::bigint, 'I01 เมทริกซ์ สาขา × ช่องทางแรก มี 5 ช่องที่ > 0');
SELECT test.assert_eq((SELECT x ->> 'value' FROM jsonb_array_elements(test.g('ch') -> 'extra' -> 'channel_matrix') x
                        WHERE x ->> 'branch_code' = 'RT1' AND x ->> 'channel_code' = 'WALK_IN')::numeric,
                      1::numeric, 'I02 RT1 × WALK_IN');
SELECT test.assert_eq((SELECT sum((x ->> 'value')::numeric) FROM jsonb_array_elements(test.g('ch') -> 'extra' -> 'channel_matrix') x),
                      5::numeric, 'I03 ผลรวมเมทริกซ์ = ลูกค้าไม่ซ้ำ');
SELECT test.assert_eq(test.rrow(test.g('ch'), 'UNIQUE_CUSTOMERS', 'value', 'WALK_IN')::numeric, 2::numeric,
                      'I04 ลูกค้าไม่ซ้ำตามช่องทางแรก WALK_IN (ทั้งองค์กร)');
SELECT test.assert_eq((SELECT count(*) FROM jsonb_array_elements(test.g('ov') -> 'extra' -> 'walkin_by_branch') x),
                      2::bigint, 'I05 OVERVIEW มี WALKIN_VISITS รายสาขา');
SELECT test.assert_eq((SELECT x ->> 'value' FROM jsonb_array_elements(test.g('ov') -> 'extra' -> 'walkin_by_branch') x
                        WHERE x ->> 'group_label' = 'สาขารายงาน 1')::numeric, 3::numeric, 'I06 Walk-in ของ RT1');
SELECT test.assert_eq((SELECT sum((x ->> 'value')::numeric) FROM jsonb_array_elements(test.g('dq') -> 'extra' -> 'issues') x),
                      3::numeric, 'I07 DATA_QUALITY สรุปจำนวนรายการต่อชนิดต่อสาขา (MISSING_PHONE 2 + INVALID_PHONE 1)');
SELECT test.assert_eq(test.rrow(test.g('br'), 'VISITS', 'value', '9b000000-0000-4000-8000-000000000011')::numeric,
                      3::numeric, 'I08 BRANCHES · VISITS ของ RT1');
SELECT test.assert_eq(test.rrow(test.g('br'), 'VISITS', 'value', '9b000000-0000-4000-8000-000000000012')::numeric,
                      2::numeric, 'I09 BRANCHES · VISITS ของ RT2');
SELECT test.assert_eq(test.rrow(test.g('stf'), 'LOST_OPPORTUNITIES', 'value', '9b000000-0000-4000-8000-000000000104')::numeric,
                      11::numeric, 'I10 STAFF · LOST_OPPORTUNITIES ของพนักงาน RT1');

-- =====================================================================================
-- J. สิทธิ์ของรายงาน (CANONICAL ข้อ 8.1 · 9.4.1)
-- =====================================================================================
SELECT test.login_as('rpt.u03@test.example.com', 'aal2');          -- MARKETING: report.view G แต่ไม่มี report.staff_performance
INSERT INTO test.rep (k, v) VALUES ('mk_ov', api.get_report('OVERVIEW'));
SELECT test.assert_eq(test.rrow(test.g('mk_ov'), 'VISITS', 'value')::numeric, 5::numeric, 'J01 MARKETING ดูรายงานรวมได้');
SELECT test.denied3($$SELECT api.get_report('STAFF')$$, 'J02 MARKETING ไม่มี report.staff_performance → รายงานรายพนักงานถูกปฏิเสธ');
SELECT test.denied3($$SELECT api.get_report('BRANCHES', 'LAST_30_DAYS', NULL, NULL, NULL, '{"group_by":"STAFF"}')$$,
                    'J03 บังคับสิทธิ์เดียวกันเมื่อขอ group_by = STAFF ผ่าน p_params');

SELECT test.login_as('rpt.u04@test.example.com', 'aal1');          -- STAFF: ไม่มี report.view
SELECT test.denied3($$SELECT api.get_report('OVERVIEW')$$, 'J04 STAFF ไม่มี report.view');
SELECT test.denied3($$SELECT api.record_report_export('OVERVIEW')$$, 'J05 STAFF ไม่มี report.export');

SELECT test.login_as('rpt.u02@test.example.com', 'aal2');          -- ผู้จัดการ RT1 (scope B)
INSERT INTO test.rep (k, v) VALUES ('bm_ov', api.get_report('OVERVIEW'));
SELECT test.assert_eq(test.rrow(test.g('bm_ov'), 'VISITS', 'value')::numeric, 3::numeric, 'J06 ผู้จัดการสาขาเห็นเฉพาะสาขาของตน');

-- =====================================================================================
-- K. api.record_report_export (CANONICAL ข้อ 9.6 · 14.8)
-- =====================================================================================
SELECT test.login_as('rpt.u01@test.example.com', 'aal2');
SELECT test.assert_eq(api.record_report_export('BRANCHES', '{"preset":"LAST_30_DAYS"}'::jsonb) ->> 'ok', 'true',
                      'K01 บันทึกการส่งออกรายงานสำเร็จ');
SELECT test.invalid3($$SELECT api.record_report_export('NOT_A_REPORT')$$, 'K02 รหัสรายงานที่ไม่รู้จักถูกปฏิเสธ');

SELECT test.logout();
SELECT test.assert_eq((SELECT count(*) FROM audit.audit_logs a
                        WHERE a.action = 'REPORT_EXPORTED' AND a.entity_type = 'EXPORT' AND a.entity_id = 'BRANCHES'),
                      1::bigint, 'K03 เขียน audit REPORT_EXPORTED หนึ่งแถว (ข้อ 9.5)');
SELECT test.assert_eq((SELECT a.after ->> 'preset' FROM audit.audit_logs a
                        WHERE a.action = 'REPORT_EXPORTED' AND a.entity_id = 'BRANCHES'),
                      'LAST_30_DAYS', 'K04 audit เก็บ p_params ไว้ใน after');
SELECT test.assert_eq((SELECT a.actor_staff_code FROM audit.audit_logs a
                        WHERE a.action = 'REPORT_EXPORTED' AND a.entity_id = 'BRANCHES'),
                      'ST-9201', 'K05 actor ของ audit คือผู้เรียก');

-- =====================================================================================
-- L. api.get_dashboard_charts — วิดเจ็ตกราฟหน้าหลัก (D56 · ข้อ 14.7 · 20.15)
--
-- ข้อที่ต้องกันไว้ให้ได้: ฐานข้อมูลต้องคืน "ค่าที่แสดงได้เลย" ครบทุกตัว
-- ถ้าวันหนึ่งมีใครถอด display/share_display/pct_display ออก หน้าจอจะถูกบีบให้คำนวณเอง
-- ซึ่งผิดข้อ 20.15 — ชุดทดสอบนี้จึงตรวจ "มีคีย์และค่าตรง" ไม่ใช่แค่ "เรียกได้"
-- =====================================================================================
SELECT test.login_as('rpt.u04@test.example.com', 'aal1');          -- STAFF: มี dashboard.view แต่ไม่มี report.view
SELECT test.assert_eq(api.get_dashboard_charts() ->> 'ok', 'true',
                      'L01 STAFF เปิดกราฟหน้าหลักได้ทั้งที่ไม่มี report.view (เหตุผลที่ต้องแยกจาก get_report)');
SELECT test.denied3($$SELECT api.get_report('LOST_REASONS')$$, 'L02 คนเดียวกันเรียก get_report ไม่ได้ ยืนยันว่าสองสิทธิ์ต่างกันจริง');

SELECT test.login_as('rpt.u01@test.example.com', 'aal2');          -- EXECUTIVE scope G
INSERT INTO test.rep (k, v) VALUES ('dash', api.get_dashboard_charts());

-- ขั้นของ funnel ครบสี่ขั้นตามข้อ 13.1 และเรียงถูก
SELECT test.assert_eq((SELECT count(*) FROM jsonb_array_elements(test.g('dash') -> 'funnel')), 4::bigint,
                      'L03 funnel มีสี่ขั้น');
SELECT test.assert_eq((SELECT string_agg(x ->> 'code', ',') FROM jsonb_array_elements(test.g('dash') -> 'funnel') x),
                      'VISITS,LEADS,OPPORTUNITIES,SALES', 'L04 เรียงขั้นตามลำดับของ funnel');

-- ตัวเลขของ funnel ต้องเท่ากับ KPI ตัวเดียวกันเป๊ะ ไม่ใช่นับใหม่คนละทาง
INSERT INTO test.rep (k, v) VALUES ('dkpi', api.get_kpis());
SELECT test.assert_eq(test.dstage(test.g('dash'), 'VISITS', 'value'), test.rrow(test.g('dkpi'), 'VISITS', 'value'),
                      'L05 ขั้นแรกของ funnel = การ์ด VISITS');
SELECT test.assert_eq(test.dstage(test.g('dash'), 'SALES', 'display'), test.rrow(test.g('dkpi'), 'SALES', 'display'),
                      'L06 ขั้นสุดท้ายของ funnel = การ์ด SALES (ข้อความเดียวกัน)');

-- ขั้นแรกต้องเป็น 100.0% เสมอ และ share เป็นสัดส่วน 0–1 ให้หน้าจอใช้วาดแท่งได้โดยไม่ต้องหาร
SELECT test.assert_eq(test.dstage(test.g('dash'), 'VISITS', 'share_display'), '100.0%', 'L07 ขั้นแรก = 100.0%');
SELECT test.assert_eq(test.dstage(test.g('dash'), 'VISITS', 'share')::numeric, 1::numeric,
                      'L08 share ของขั้นแรกเป็น 1 (สัดส่วน ไม่ใช่ร้อยละ)');

-- ขั้น Opportunity ต้องเทียบ VISITS ไม่ใช่ LEADS — จุดที่ไม่มีรหัส KPI ใดรองรับ (เหตุผลที่ต้องเพิ่ม D56)
-- หารในชุดทดสอบได้ (กติกาห้ามคิดเลขเองใช้กับ "หน้าจอ" ไม่ใช่กับการพิสูจน์)
-- app.kpi_rate เป็น helper ภายใน ไม่ได้ GRANT ให้ authenticated จึงเรียกที่นี่ไม่ได้ — ตั้งใจให้เป็นอย่างนั้น
SELECT test.assert_eq(round(test.dstage(test.g('dash'), 'OPPORTUNITIES', 'share')::numeric, 10),
                      round(test.rrow(test.g('dkpi'), 'OPPORTUNITIES', 'value')::numeric
                            / test.rrow(test.g('dkpi'), 'VISITS', 'value')::numeric, 10),
                      'L09 ขั้น Opportunity เทียบ VISITS ไม่ใช่ LEADS');
SELECT test.assert_true(test.dstage(test.g('dash'), 'OPPORTUNITIES', 'share')::numeric
                        <> test.rrow(test.g('dkpi'), 'OPPORTUNITY_RATE', 'value')::numeric,
                        'L10 และต่างจาก OPPORTUNITY_RATE จริง (กันการหยิบตัวผิดมาใช้)');

-- ทุกขั้นต้องมีค่าที่แสดงได้เลยครบ ไม่มีขั้นไหนบังคับให้หน้าจอจัดรูปแบบเอง
SELECT test.assert_eq((SELECT count(*) FROM jsonb_array_elements(test.g('dash') -> 'funnel') x
                        WHERE x ->> 'display' IS NULL OR x ->> 'share_display' IS NULL
                           OR x ->> 'label_th' IS NULL OR x ->> 'chart_token' IS NULL), 0::bigint,
                      'L11 ทุกขั้นมี display · share_display · label_th · chart_token ครบ');

-- โดนัท: ผลรวมของทุกส่วนต้องเท่าเลขกลางวง และเท่าการ์ดลูกค้าไม่ซ้ำ
SELECT test.assert_eq((SELECT sum((x ->> 'value')::numeric) FROM jsonb_array_elements(test.g('dash') -> 'channels' -> 'segments') x),
                      (test.g('dash') -> 'channels' ->> 'total')::numeric,
                      'L12 ผลรวมส่วนโดนัท = เลขกลางวง');
SELECT test.assert_eq(test.g('dash') -> 'channels' ->> 'total_display', test.rrow(test.g('dkpi'), 'UNIQUE_CUSTOMERS', 'display'),
                      'L13 เลขกลางวง = การ์ดลูกค้าไม่ซ้ำ (ข้อความเดียวกัน)');
SELECT test.assert_eq((SELECT count(*) FROM jsonb_array_elements(test.g('dash') -> 'channels' -> 'segments') x
                        WHERE (x ->> 'value')::numeric <= 0), 0::bigint,
                      'L14 ไม่คืนส่วนที่เป็นศูนย์ (ข้อ 13.3 · D3)');
SELECT test.assert_eq((SELECT count(*) FROM jsonb_array_elements(test.g('dash') -> 'channels' -> 'segments') x
                        WHERE x ->> 'pct_display' IS NULL OR x ->> 'label_th' IS NULL OR x ->> 'chart_token' IS NULL), 0::bigint,
                      'L15 ทุกส่วนมีร้อยละและป้ายไทยพร้อมแสดง');

-- เหตุผลที่ไม่สำเร็จต้องเป็นชุดเดียวกับรายงาน เพราะใช้ app.lost_reason_breakdown ตัวเดียวกัน
INSERT INTO test.rep (k, v) VALUES ('drep', api.get_report('LOST_REASONS'));
SELECT test.assert_eq(test.g('dash') -> 'lost_reasons', test.g('drep') -> 'extra' -> 'lost_reasons',
                      'L16 lost_reasons ของหน้าหลักตรงกับของรายงานทุกช่อง (ไม่ได้เขียน query ซ้ำ)');

-- clock/period ต้องมาจากชุดเดียวกับการ์ด ไม่งั้นหน้าจอจะอ้างสองเวลาบนหน้าเดียว
SELECT test.assert_eq(test.g('dash') ->> 'clock', test.g('dkpi') ->> 'clock', 'L17 clock เดียวกับ api.get_kpis');
SELECT test.assert_eq(test.g('dash') -> 'period', test.g('dkpi') -> 'period', 'L18 ช่วงเวลาเดียวกับ api.get_kpis');

-- ช่วงที่ไม่มีข้อมูลเลยต้องไม่พังและต้องไม่โกหกว่าเป็น 0.0%
INSERT INTO test.rep (k, v) VALUES ('dempty', api.get_dashboard_charts('CUSTOM', DATE '2025-01-01', DATE '2025-01-08'));
SELECT test.assert_eq(test.dstage(test.g('dempty'), 'VISITS', 'display'), '0', 'L19 ช่วงที่ไม่มีข้อมูล คืน 0 ไม่ใช่ error');
SELECT test.assert_eq(test.dstage(test.g('dempty'), 'LEADS', 'share_display'), U&'\2013',
                      'L20 หารศูนย์ไม่ได้ → แสดง – ไม่ใช่ 0.0% ที่ทำให้เข้าใจผิด');

SELECT test.login_as('rpt.u02@test.example.com', 'aal2');          -- ผู้จัดการ RT1 (scope B)
INSERT INTO test.rep (k, v) VALUES ('dbm', api.get_dashboard_charts());
SELECT test.assert_eq(test.dstage(test.g('dbm'), 'VISITS', 'value')::numeric, 3::numeric,
                      'L21 ผู้จัดการสาขาเห็นกราฟเฉพาะสาขาของตน');
SELECT test.logout();
SELECT test.assert_raises($$SELECT api.get_dashboard_charts()$$, 'L22 ผู้ที่ไม่ได้เข้าสู่ระบบเรียกไม่ได้', '42501');
