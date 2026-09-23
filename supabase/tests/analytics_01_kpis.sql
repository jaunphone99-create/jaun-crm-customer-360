-- =====================================================================================
-- supabase/tests/analytics_01_kpis.sql — KPI ของ migration 0012_analytics.sql
--   analytics.customer_activity · analytics.purchase_events · analytics.data_quality_issues
--   app.kpi_period · app.fmt_* · api.get_kpis (ข้อ 1.2 · 1.3 · 3.1 · 9.4.1 · 12.0–12.4)
-- fixture อิสระจาก supabase/seed.sql (องค์กร TEST-KPI · staff ST-91xx · อีเมล @test.example.com)
-- run.mjs ครอบไฟล์ด้วย BEGIN … ROLLBACK · ห้ามมีคำสั่งควบคุมทรานแซกชันในไฟล์
--
-- "ตอนนี้" ของไฟล์นี้ = 11 ก.ย. 2569 10:24 น. (app.settings['clock'] · CANONICAL ข้อ 1.2 · 13)
--   P (LAST_30_DAYS) = [13 ส.ค. 2569 00:00, 12 ก.ย. 2569 00:00) Asia/Bangkok
--   ช่วงก่อนหน้า      = [14 ก.ค. 2569 00:00, 13 ส.ค. 2569 00:00)
-- =====================================================================================

-- ===== P0: helper ของชุด analytics =====
CREATE FUNCTION test.kpi(p jsonb, p_code text, p_field text, p_gk text DEFAULT NULL) RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT x ->> p_field
    FROM jsonb_array_elements(p -> 'rows') x
    WHERE x ->> 'code' = p_code
      AND ((p_gk IS NULL AND (x -> 'group_key') = 'null'::jsonb)
        OR (p_gk IS NOT NULL AND x ->> 'group_key' = p_gk))
    LIMIT 1
$$;

CREATE FUNCTION test.kpin(p jsonb, p_code text, p_gk text DEFAULT NULL) RETURNS numeric
LANGUAGE sql STABLE AS $$ SELECT test.kpi(p, p_code, 'value', p_gk)::numeric $$;

CREATE FUNCTION test.jcall2(p_sql text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN EXECUTE p_sql INTO v; RETURN v; END;
$$;

CREATE FUNCTION test.denied2(p_sql text, p_msg text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN PERFORM test.assert_raises(p_sql, p_msg, '42501'); END;
$$;

CREATE FUNCTION test.api_invalid2(p_sql text, p_msg text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN PERFORM test.assert_raises(p_sql, p_msg, '22023'); END;
$$;

GRANT EXECUTE ON FUNCTION test.kpi(jsonb, text, text, text), test.kpin(jsonb, text, text),
                          test.jcall2(text), test.denied2(text, text), test.api_invalid2(text, text)
TO anon, authenticated, service_role;

CREATE FUNCTION test.tkbranches() RETURNS uuid[] LANGUAGE sql IMMUTABLE AS
$$ SELECT ARRAY['8a000000-0000-4000-8000-000000000011'::uuid, '8a000000-0000-4000-8000-000000000012'::uuid] $$;
GRANT EXECUTE ON FUNCTION test.tkbranches() TO anon, authenticated, service_role;

-- ===== F0: นาฬิกาอ้างอิง =====
UPDATE app.settings SET value = '{"as_of": "2026-09-11T10:24:00+07:00"}' WHERE key = 'clock';
SELECT test.assert_eq(app.clock(), '2026-09-11T10:24:00+07:00'::timestamptz, 'F0 app.clock() ถูกตรึงที่ 11 ก.ย. 2569 10:24');
SELECT test.assert_eq(app.bangkok_date(app.clock()), '2026-09-11'::date, 'F0 วันธุรกิจของ app.clock()');

-- ===== F1: fixture (superuser · app.bulk = on เพื่อไม่ให้ trigger สร้าง task/แคชแทรก) =====
SELECT set_config('app.bulk', 'on', true);
SELECT set_config('app.seed_mode', 'off', true);

INSERT INTO core.organizations (id, code, name_th)
VALUES ('8a000000-0000-4000-8000-000000000001', 'TEST-KPI', 'องค์กรทดสอบ KPI');
INSERT INTO core.business_units (id, organization_id, code, name_th)
VALUES ('8a000000-0000-4000-8000-000000000002', '8a000000-0000-4000-8000-000000000001', 'TKBU', 'หน่วยทดสอบ KPI');
INSERT INTO core.branches (id, organization_id, business_unit_id, code, name_th, branch_type) VALUES
    ('8a000000-0000-4000-8000-000000000011', '8a000000-0000-4000-8000-000000000001', '8a000000-0000-4000-8000-000000000002', 'TK1', 'สาขาทดสอบ KPI 1', 'store'),
    ('8a000000-0000-4000-8000-000000000012', '8a000000-0000-4000-8000-000000000001', '8a000000-0000-4000-8000-000000000002', 'TK2', 'สาขาทดสอบ KPI 2', 'store');
INSERT INTO core.teams (id, organization_id, branch_id, code, name_th)
VALUES ('8a000000-0000-4000-8000-000000000021', '8a000000-0000-4000-8000-000000000001', '8a000000-0000-4000-8000-000000000011', 'TK1-SALES', 'ทีมขายทดสอบ KPI 1');

INSERT INTO auth.users (id, email, email_confirmed_at)
SELECT ('8a000000-0000-4000-8000-0000000090' || lpad(n::text, 2, '0'))::uuid,
       'kpi.u' || lpad(n::text, 2, '0') || '@test.example.com', now()
FROM generate_series(1, 6) n;
INSERT INTO auth.mfa_factors (user_id, status)
SELECT ('8a000000-0000-4000-8000-0000000090' || lpad(n::text, 2, '0'))::uuid, 'verified' FROM generate_series(1, 6) n;

INSERT INTO core.staff_profiles (id, organization_id, staff_code, employee_code, display_name, email, user_id, status)
SELECT ('8a000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid,
       '8a000000-0000-4000-8000-000000000001',
       'ST-91' || lpad(n::text, 2, '0'), 'KPI-' || lpad(n::text, 2, '0'),
       (ARRAY['ผู้บริหารทดสอบ', 'ผู้จัดการ TK1', 'หัวหน้าทีม TK1', 'พนักงาน A', 'พนักงาน B', 'ผู้จัดการ TK2'])[n],
       'kpi.u' || lpad(n::text, 2, '0') || '@test.example.com',
       ('8a000000-0000-4000-8000-0000000090' || lpad(n::text, 2, '0'))::uuid, 'ACTIVE'
FROM generate_series(1, 6) n;

INSERT INTO core.staff_role_assignments (organization_id, staff_id, role_code, branch_id, valid_from) VALUES
    ('8a000000-0000-4000-8000-000000000001', '8a000000-0000-4000-8000-000000000101', 'EXECUTIVE',      NULL,                                   now() - interval '400 days'),
    ('8a000000-0000-4000-8000-000000000001', '8a000000-0000-4000-8000-000000000102', 'BRANCH_MANAGER', '8a000000-0000-4000-8000-000000000011', now() - interval '400 days'),
    ('8a000000-0000-4000-8000-000000000001', '8a000000-0000-4000-8000-000000000103', 'SUPERVISOR',     '8a000000-0000-4000-8000-000000000011', now() - interval '400 days'),
    ('8a000000-0000-4000-8000-000000000001', '8a000000-0000-4000-8000-000000000104', 'STAFF',          '8a000000-0000-4000-8000-000000000011', now() - interval '400 days'),
    ('8a000000-0000-4000-8000-000000000001', '8a000000-0000-4000-8000-000000000105', 'STAFF',          '8a000000-0000-4000-8000-000000000011', now() - interval '400 days'),
    ('8a000000-0000-4000-8000-000000000001', '8a000000-0000-4000-8000-000000000106', 'BRANCH_MANAGER', '8a000000-0000-4000-8000-000000000012', now() - interval '400 days');
INSERT INTO core.team_members (organization_id, team_id, staff_id, is_leader, valid_from) VALUES
    ('8a000000-0000-4000-8000-000000000001', '8a000000-0000-4000-8000-000000000021', '8a000000-0000-4000-8000-000000000103', true,  now() - interval '400 days'),
    ('8a000000-0000-4000-8000-000000000001', '8a000000-0000-4000-8000-000000000021', '8a000000-0000-4000-8000-000000000104', false, now() - interval '400 days'),
    ('8a000000-0000-4000-8000-000000000001', '8a000000-0000-4000-8000-000000000021', '8a000000-0000-4000-8000-000000000105', false, now() - interval '400 days');

-- ลูกค้า C1–C6 (first_seen_at ตั้งตรงเพราะ app.bulk = on ปิดการคำนวณแคช · ข้อ 19.1 ข้อ 11)
INSERT INTO crm.customers (id, organization_id, customer_no, first_name, last_name, first_seen_at,
                           first_channel_code, first_branch_id, owner_staff_id, province_code, created_via, created_by) VALUES
    ('8a000000-0000-4000-8000-000000000201', '8a000000-0000-4000-8000-000000000001', 'CUS-1991-000001', 'ลูกค้า', 'หนึ่ง',  '2026-07-20T10:00:00+07:00', 'WALK_IN',  '8a000000-0000-4000-8000-000000000011', '8a000000-0000-4000-8000-000000000104', 'TH-10', 'QUICK_CAPTURE', '8a000000-0000-4000-8000-000000000104'),
    ('8a000000-0000-4000-8000-000000000202', '8a000000-0000-4000-8000-000000000001', 'CUS-1991-000002', 'ลูกค้า', 'สอง',    '2026-09-01T12:00:00+07:00', 'LINE',     '8a000000-0000-4000-8000-000000000011', '8a000000-0000-4000-8000-000000000105', 'TH-10', 'QUICK_CAPTURE', '8a000000-0000-4000-8000-000000000105'),
    ('8a000000-0000-4000-8000-000000000203', '8a000000-0000-4000-8000-000000000001', 'CUS-1991-000003', 'ลูกค้า', NULL,     '2026-09-02T09:30:00+07:00', 'WALK_IN',  '8a000000-0000-4000-8000-000000000011', '8a000000-0000-4000-8000-000000000104', NULL,    'IMPORT',        '8a000000-0000-4000-8000-000000000104'),
    ('8a000000-0000-4000-8000-000000000204', '8a000000-0000-4000-8000-000000000001', 'CUS-1991-000004', 'ลูกค้า', 'สี่',    '2026-08-01T10:00:00+07:00', 'LINE',     '8a000000-0000-4000-8000-000000000011', '8a000000-0000-4000-8000-000000000105', 'TH-10', 'QUICK_CAPTURE', '8a000000-0000-4000-8000-000000000105'),
    ('8a000000-0000-4000-8000-000000000205', '8a000000-0000-4000-8000-000000000001', 'CUS-1991-000005', 'ลูกค้า', 'ห้า',    '2026-08-25T10:00:00+07:00', 'FACEBOOK', '8a000000-0000-4000-8000-000000000011', '8a000000-0000-4000-8000-000000000104', 'TH-10', 'QUICK_CAPTURE', '8a000000-0000-4000-8000-000000000104'),
    ('8a000000-0000-4000-8000-000000000206', '8a000000-0000-4000-8000-000000000001', 'CUS-1991-000006', 'ลูกค้า', 'หก',     '2026-09-03T09:00:00+07:00', 'WALK_IN',  '8a000000-0000-4000-8000-000000000012', '8a000000-0000-4000-8000-000000000106', 'TH-10', 'QUICK_CAPTURE', '8a000000-0000-4000-8000-000000000106');

INSERT INTO crm.customer_branches (organization_id, customer_id, branch_id, first_linked_at, last_activity_at, linked_via)
SELECT '8a000000-0000-4000-8000-000000000001', c.id, c.first_branch_id, c.first_seen_at, c.first_seen_at, 'CREATED'
FROM crm.customers c WHERE c.organization_id = '8a000000-0000-4000-8000-000000000001';

-- C1 มีเบอร์ถูกต้อง · C4 มีเบอร์ไม่ถูกต้อง (INVALID_PHONE) · C3 และ C6 ไม่มีเบอร์ (MISSING_PHONE เพราะช่องทางแรก WALK_IN)
INSERT INTO crm.customer_contacts (id, organization_id, customer_id, contact_type, value_raw, is_primary, is_valid) VALUES
    ('8a000000-0000-4000-8000-000000000a01', '8a000000-0000-4000-8000-000000000001', '8a000000-0000-4000-8000-000000000201', 'PHONE', '081-111-1111', true, true),
    ('8a000000-0000-4000-8000-000000000a02', '8a000000-0000-4000-8000-000000000001', '8a000000-0000-4000-8000-000000000204', 'PHONE', '12345',        true, false);

-- ------------------------------------------------------------------ visit (ข้อ 12.1)
INSERT INTO crm.visits (id, organization_id, visit_no, branch_id, channel_code, status, queue_no, customer_id,
                        interest_code, started_at, service_started_at, ended_at, owner_staff_id, outcome_code,
                        cancel_reason, closed_by_system, unrecorded_ack_by, unrecorded_ack_at, created_at, created_by) VALUES
 ('8a000000-0000-4000-8000-000000000301','8a000000-0000-4000-8000-000000000001','V-TK1-260820-001','8a000000-0000-4000-8000-000000000011','WALK_IN','COMPLETED', 1,   '8a000000-0000-4000-8000-000000000201','BUY',    '2026-08-20T10:00:00+07:00','2026-08-20T10:00:00+07:00','2026-08-20T11:00:00+07:00','8a000000-0000-4000-8000-000000000104','PURCHASED',   NULL,false,NULL,NULL,'2026-08-20T10:00:00+07:00','8a000000-0000-4000-8000-000000000104'),
 ('8a000000-0000-4000-8000-000000000302','8a000000-0000-4000-8000-000000000001','V-TK1-260821-001','8a000000-0000-4000-8000-000000000011','WALK_IN','COMPLETED', 1,   NULL,                                   'INQUIRY','2026-08-21T11:00:00+07:00','2026-08-21T11:00:00+07:00','2026-08-21T23:59:59+07:00','8a000000-0000-4000-8000-000000000104','UNRECORDED',  NULL,true, NULL,NULL,'2026-08-21T11:00:00+07:00','8a000000-0000-4000-8000-000000000104'),
 ('8a000000-0000-4000-8000-000000000303','8a000000-0000-4000-8000-000000000001','V-TK1-260901-001','8a000000-0000-4000-8000-000000000011','LINE',   'COMPLETED', NULL,'8a000000-0000-4000-8000-000000000202',NULL,     '2026-09-01T12:00:00+07:00','2026-09-01T12:00:00+07:00','2026-09-01T13:00:00+07:00','8a000000-0000-4000-8000-000000000105','NOT_YET',     NULL,false,NULL,NULL,'2026-09-01T12:00:00+07:00','8a000000-0000-4000-8000-000000000105'),
 ('8a000000-0000-4000-8000-000000000304','8a000000-0000-4000-8000-000000000001','V-TK1-260902-001','8a000000-0000-4000-8000-000000000011','WALK_IN','CANCELLED', 1,   '8a000000-0000-4000-8000-000000000203','BUY',    '2026-09-02T09:30:00+07:00',NULL,                       NULL,                       NULL,                                   NULL,          'สร้างผิด',false,NULL,NULL,'2026-09-02T09:30:00+07:00','8a000000-0000-4000-8000-000000000104'),
 ('8a000000-0000-4000-8000-000000000305','8a000000-0000-4000-8000-000000000001','V-TK1-260911-001','8a000000-0000-4000-8000-000000000011','WALK_IN','WAITING',   1,   NULL,                                   'INQUIRY','2026-09-11T10:05:00+07:00',NULL,                       NULL,                       NULL,                                   NULL,          NULL,     false,NULL,NULL,'2026-09-11T10:05:00+07:00','8a000000-0000-4000-8000-000000000104'),
 ('8a000000-0000-4000-8000-000000000306','8a000000-0000-4000-8000-000000000001','V-TK1-260720-001','8a000000-0000-4000-8000-000000000011','WALK_IN','COMPLETED', 1,   '8a000000-0000-4000-8000-000000000201','BUY',    '2026-07-20T10:00:00+07:00','2026-07-20T10:00:00+07:00','2026-07-20T11:00:00+07:00','8a000000-0000-4000-8000-000000000104','PURCHASED',   NULL,false,NULL,NULL,'2026-07-20T10:00:00+07:00','8a000000-0000-4000-8000-000000000104'),
 ('8a000000-0000-4000-8000-000000000307','8a000000-0000-4000-8000-000000000001','V-TK1-260801-001','8a000000-0000-4000-8000-000000000011','LINE',   'COMPLETED', NULL,'8a000000-0000-4000-8000-000000000204',NULL,     '2026-08-01T10:00:00+07:00','2026-08-01T10:00:00+07:00','2026-08-01T11:00:00+07:00','8a000000-0000-4000-8000-000000000105','SERVICE_DONE',NULL,false,NULL,NULL,'2026-08-01T10:00:00+07:00','8a000000-0000-4000-8000-000000000105'),
 ('8a000000-0000-4000-8000-000000000308','8a000000-0000-4000-8000-000000000001','V-TK2-260903-001','8a000000-0000-4000-8000-000000000012','WALK_IN','COMPLETED', 1,   '8a000000-0000-4000-8000-000000000206','BUY',    '2026-09-03T09:00:00+07:00','2026-09-03T09:00:00+07:00','2026-09-03T10:00:00+07:00','8a000000-0000-4000-8000-000000000106','PURCHASED',   NULL,false,NULL,NULL,'2026-09-03T09:00:00+07:00','8a000000-0000-4000-8000-000000000106'),
 ('8a000000-0000-4000-8000-000000000309','8a000000-0000-4000-8000-000000000001','V-TK1-260813-001','8a000000-0000-4000-8000-000000000011','WALK_IN','COMPLETED', 2,   NULL,                                   'INQUIRY','2026-08-13T00:00:00+07:00','2026-08-13T00:00:00+07:00','2026-08-13T01:00:00+07:00','8a000000-0000-4000-8000-000000000104','SERVICE_DONE',NULL,false,NULL,NULL,'2026-08-13T00:00:00+07:00','8a000000-0000-4000-8000-000000000104'),
 ('8a000000-0000-4000-8000-000000000310','8a000000-0000-4000-8000-000000000001','V-TK1-260812-001','8a000000-0000-4000-8000-000000000011','WALK_IN','COMPLETED', 1,   NULL,                                   'INQUIRY','2026-08-12T23:59:59+07:00','2026-08-12T23:59:59+07:00','2026-08-13T00:59:59+07:00','8a000000-0000-4000-8000-000000000104','SERVICE_DONE',NULL,false,NULL,NULL,'2026-08-12T23:59:59+07:00','8a000000-0000-4000-8000-000000000104'),
 ('8a000000-0000-4000-8000-000000000311','8a000000-0000-4000-8000-000000000001','V-TK1-260911-002','8a000000-0000-4000-8000-000000000011','WALK_IN','COMPLETED', 2,   NULL,                                   'INQUIRY','2026-09-11T09:00:00+07:00','2026-09-11T09:00:00+07:00','2026-09-11T09:30:00+07:00','8a000000-0000-4000-8000-000000000104','SERVICE_DONE',NULL,false,NULL,NULL,'2026-09-11T09:00:00+07:00','8a000000-0000-4000-8000-000000000104'),
 ('8a000000-0000-4000-8000-000000000312','8a000000-0000-4000-8000-000000000001','V-TK1-260904-001','8a000000-0000-4000-8000-000000000011','WALK_IN','COMPLETED', 1,   NULL,                                   'INQUIRY','2026-09-04T09:00:00+07:00','2026-09-04T09:00:00+07:00','2026-09-04T09:30:00+07:00','8a000000-0000-4000-8000-000000000104','SERVICE_DONE',NULL,false,NULL,NULL,'2026-09-04T09:00:00+07:00','8a000000-0000-4000-8000-000000000104'),
 ('8a000000-0000-4000-8000-000000000313','8a000000-0000-4000-8000-000000000001','V-TK1-260904-003','8a000000-0000-4000-8000-000000000011','WALK_IN','COMPLETED', 3,   NULL,                                   'INQUIRY','2026-09-04T11:00:00+07:00','2026-09-04T11:00:00+07:00','2026-09-04T11:30:00+07:00','8a000000-0000-4000-8000-000000000104','SERVICE_DONE',NULL,false,NULL,NULL,'2026-09-04T11:00:00+07:00','8a000000-0000-4000-8000-000000000104'),
 ('8a000000-0000-4000-8000-000000000314','8a000000-0000-4000-8000-000000000001','V-TK1-260904-002','8a000000-0000-4000-8000-000000000011','WALK_IN','COMPLETED', 2,   NULL,                                   'INQUIRY','2026-09-04T10:24:00+07:00','2026-09-04T10:24:00+07:00','2026-09-04T10:54:00+07:00','8a000000-0000-4000-8000-000000000104','SERVICE_DONE',NULL,false,NULL,NULL,'2026-09-04T10:24:00+07:00','8a000000-0000-4000-8000-000000000104'),
 ('8a000000-0000-4000-8000-000000000315','8a000000-0000-4000-8000-000000000001','V-TK1-260908-001','8a000000-0000-4000-8000-000000000011','WALK_IN','COMPLETED', 1,   NULL,                                   'INQUIRY','2026-09-08T10:00:00+07:00','2026-09-08T10:00:00+07:00','2026-09-08T23:59:59+07:00','8a000000-0000-4000-8000-000000000104','UNRECORDED',  NULL,true, NULL,NULL,'2026-09-08T10:00:00+07:00','8a000000-0000-4000-8000-000000000104'),
 ('8a000000-0000-4000-8000-000000000316','8a000000-0000-4000-8000-000000000001','V-TK1-260908-002','8a000000-0000-4000-8000-000000000011','WALK_IN','COMPLETED', 2,   NULL,                                   'INQUIRY','2026-09-08T11:00:00+07:00','2026-09-08T11:00:00+07:00','2026-09-08T23:59:59+07:00','8a000000-0000-4000-8000-000000000104','UNRECORDED',  NULL,true, '8a000000-0000-4000-8000-000000000102','2026-09-09T09:00:00+07:00','2026-09-08T11:00:00+07:00','8a000000-0000-4000-8000-000000000104');

-- interaction ของ visit ที่ CANCELLED — ต้องไม่ถูกนับเป็นกิจกรรม (ข้อ 3.1 v2.2)
INSERT INTO crm.interactions (id, organization_id, customer_id, visit_id, is_visit_root, branch_id, channel_code,
                              direction, interaction_type_code, occurred_at, owner_staff_id, created_at, created_by)
VALUES ('8a000000-0000-4000-8000-000000000801', '8a000000-0000-4000-8000-000000000001',
        '8a000000-0000-4000-8000-000000000203', '8a000000-0000-4000-8000-000000000304', true,
        '8a000000-0000-4000-8000-000000000011', 'WALK_IN', 'INBOUND', 'VISIT',
        '2026-09-02T09:30:00+07:00', '8a000000-0000-4000-8000-000000000104',
        '2026-09-02T09:30:00+07:00', '8a000000-0000-4000-8000-000000000104');

-- ------------------------------------------------------------------ lead (ข้อ 12.1 · 12.2)
INSERT INTO crm.leads (id, organization_id, lead_no, customer_id, branch_id, owner_staff_id, channel_code,
                       interest_code, status, priority_code, next_action, next_action_type_code, next_action_at,
                       first_contacted_at, closed_at, lost_reason_code, created_at, created_by) VALUES
 ('8a000000-0000-4000-8000-000000000401','8a000000-0000-4000-8000-000000000001','LD-1991-000001','8a000000-0000-4000-8000-000000000205','8a000000-0000-4000-8000-000000000011','8a000000-0000-4000-8000-000000000104','FACEBOOK','BUY','CONTACTED','NORMAL','ติดต่อกลับลูกค้า','CALL','2026-09-20T10:00:00+07:00','2026-08-25T10:20:00+07:00',NULL,NULL,'2026-08-25T10:00:00+07:00','8a000000-0000-4000-8000-000000000104'),
 ('8a000000-0000-4000-8000-000000000402','8a000000-0000-4000-8000-000000000001','LD-1991-000002','8a000000-0000-4000-8000-000000000202','8a000000-0000-4000-8000-000000000011','8a000000-0000-4000-8000-000000000105','LINE',    'BUY','NEW',      'NORMAL','ติดต่อกลับลูกค้า','CALL','2026-09-20T10:00:00+07:00',NULL,                      NULL,NULL,'2026-09-01T12:10:00+07:00','8a000000-0000-4000-8000-000000000105'),
 ('8a000000-0000-4000-8000-000000000403','8a000000-0000-4000-8000-000000000001','LD-1991-000003','8a000000-0000-4000-8000-000000000201','8a000000-0000-4000-8000-000000000011','8a000000-0000-4000-8000-000000000104','WALK_IN', 'BUY','LOST',     NULL,    NULL,              NULL,  NULL,                      '2026-08-20T10:05:00+07:00','2026-08-28T10:00:00+07:00','PRICE','2026-08-20T10:05:00+07:00','8a000000-0000-4000-8000-000000000104'),
 ('8a000000-0000-4000-8000-000000000404','8a000000-0000-4000-8000-000000000001','LD-1991-000004','8a000000-0000-4000-8000-000000000204','8a000000-0000-4000-8000-000000000011','8a000000-0000-4000-8000-000000000105','LINE',    'BUY','CONTACTED','NORMAL','ติดต่อกลับลูกค้า','CALL','2026-09-20T10:00:00+07:00','2026-07-20T09:40:00+07:00',NULL,NULL,'2026-07-20T09:00:00+07:00','8a000000-0000-4000-8000-000000000105'),
 ('8a000000-0000-4000-8000-000000000405','8a000000-0000-4000-8000-000000000001','LD-1991-000005','8a000000-0000-4000-8000-000000000205','8a000000-0000-4000-8000-000000000011',NULL,                                   'FACEBOOK','BUY','NEW',      'NORMAL','ติดต่อกลับลูกค้า','CALL','2026-09-20T10:00:00+07:00',NULL,                      NULL,NULL,'2026-09-05T10:00:00+07:00','8a000000-0000-4000-8000-000000000104');

-- ------------------------------------------------------------------ opportunity (ข้อ 12.1)
INSERT INTO crm.opportunities (id, organization_id, opportunity_no, customer_id, origin_channel_code, branch_id,
                               owner_staff_id, interest_code, stage, priority_code, expected_amount,
                               next_action, next_action_type_code, next_action_at,
                               won_amount, won_at, closed_at, lost_reason_code, created_at, created_by) VALUES
 ('8a000000-0000-4000-8000-000000000501','8a000000-0000-4000-8000-000000000001','OP-1991-000001','8a000000-0000-4000-8000-000000000201','WALK_IN', '8a000000-0000-4000-8000-000000000011','8a000000-0000-4000-8000-000000000104','BUY','WON',       NULL,    0,    NULL,NULL,NULL,30000,'2026-08-20T12:00:00+07:00','2026-08-20T12:00:00+07:00',NULL,   '2026-08-20T11:00:00+07:00','8a000000-0000-4000-8000-000000000104'),
 ('8a000000-0000-4000-8000-000000000502','8a000000-0000-4000-8000-000000000001','OP-1991-000002','8a000000-0000-4000-8000-000000000204','LINE',    '8a000000-0000-4000-8000-000000000011','8a000000-0000-4000-8000-000000000105','BUY','WON',       NULL,    0,    NULL,NULL,NULL,20000,'2026-09-05T10:00:00+07:00','2026-09-05T10:00:00+07:00',NULL,   '2026-08-15T10:00:00+07:00','8a000000-0000-4000-8000-000000000105'),
 ('8a000000-0000-4000-8000-000000000503','8a000000-0000-4000-8000-000000000001','OP-1991-000003','8a000000-0000-4000-8000-000000000202','LINE',    '8a000000-0000-4000-8000-000000000011','8a000000-0000-4000-8000-000000000105','BUY','LOST',      NULL,    0,    NULL,NULL,NULL,NULL, NULL,                       '2026-09-06T10:00:00+07:00','COMPARING','2026-09-01T12:30:00+07:00','8a000000-0000-4000-8000-000000000105'),
 ('8a000000-0000-4000-8000-000000000504','8a000000-0000-4000-8000-000000000001','OP-1991-000004','8a000000-0000-4000-8000-000000000205','FACEBOOK','8a000000-0000-4000-8000-000000000011','8a000000-0000-4000-8000-000000000104','BUY','INTERESTED','HIGH',  12000,'ติดตามลูกค้า','CALL','2026-09-20T10:00:00+07:00',NULL,NULL,NULL,NULL,'2026-09-08T10:00:00+07:00','8a000000-0000-4000-8000-000000000104'),
 ('8a000000-0000-4000-8000-000000000505','8a000000-0000-4000-8000-000000000001','OP-1991-000005','8a000000-0000-4000-8000-000000000201','WALK_IN', '8a000000-0000-4000-8000-000000000011','8a000000-0000-4000-8000-000000000104','BUY','WON',       NULL,    0,    NULL,NULL,NULL,10000,'2026-07-20T11:00:00+07:00','2026-07-20T11:00:00+07:00',NULL,   '2026-07-20T10:30:00+07:00','8a000000-0000-4000-8000-000000000104'),
 ('8a000000-0000-4000-8000-000000000506','8a000000-0000-4000-8000-000000000001','OP-1991-000006','8a000000-0000-4000-8000-000000000206','WALK_IN', '8a000000-0000-4000-8000-000000000012','8a000000-0000-4000-8000-000000000106','BUY','WON',       NULL,    0,    NULL,NULL,NULL, 5000,'2026-09-03T11:00:00+07:00','2026-09-03T11:00:00+07:00',NULL,   '2026-09-03T10:00:00+07:00','8a000000-0000-4000-8000-000000000106');

-- ------------------------------------------------------------------ transaction ref (ข้อ 3.1)
-- TR1 ไม่ผูก opportunity → เป็นเหตุการณ์การซื้อของ C2 · TR2 ผูก OP-1991-000001 (WON) → ไม่นับซ้ำ
INSERT INTO crm.transaction_refs (id, organization_id, customer_id, branch_id, opportunity_id, transaction_type_code,
                                  source_system_code, external_no, transacted_at, amount, created_at, created_by) VALUES
 ('8a000000-0000-4000-8000-000000000701','8a000000-0000-4000-8000-000000000001','8a000000-0000-4000-8000-000000000202','8a000000-0000-4000-8000-000000000011',NULL,                                   'SALE','MANUAL','TEST-KPI-TR-1','2026-09-07T10:00:00+07:00', 8000,'2026-09-07T10:00:00+07:00','8a000000-0000-4000-8000-000000000105'),
 ('8a000000-0000-4000-8000-000000000702','8a000000-0000-4000-8000-000000000001','8a000000-0000-4000-8000-000000000201','8a000000-0000-4000-8000-000000000011','8a000000-0000-4000-8000-000000000501','SALE','MANUAL','TEST-KPI-TR-2','2026-08-20T12:05:00+07:00',30000,'2026-08-20T12:05:00+07:00','8a000000-0000-4000-8000-000000000104');

-- ------------------------------------------------------------------ task (ข้อ 4.7 · 12.2)
INSERT INTO crm.tasks (id, organization_id, task_no, task_type_code, title, customer_id, branch_id, owner_staff_id,
                       status, priority_code, due_at, remind_at, completed_at, is_next_action, created_at, created_by) VALUES
 ('8a000000-0000-4000-8000-000000000601','8a000000-0000-4000-8000-000000000001','TK-1991-000001','FOLLOW_UP','ติดตามวันนี้',      '8a000000-0000-4000-8000-000000000201','8a000000-0000-4000-8000-000000000011','8a000000-0000-4000-8000-000000000104','OPEN','NORMAL','2026-09-11T15:00:00+07:00','2026-09-11T14:45:00+07:00',NULL,                      false,'2026-09-09T10:00:00+07:00','8a000000-0000-4000-8000-000000000104'),
 ('8a000000-0000-4000-8000-000000000602','8a000000-0000-4000-8000-000000000001','TK-1991-000002','CALL',     'โทรเกินกำหนด',      '8a000000-0000-4000-8000-000000000201','8a000000-0000-4000-8000-000000000011','8a000000-0000-4000-8000-000000000104','OPEN','NORMAL','2026-09-10T13:00:00+07:00','2026-09-10T12:45:00+07:00',NULL,                      false,'2026-09-09T10:00:00+07:00','8a000000-0000-4000-8000-000000000104'),
 ('8a000000-0000-4000-8000-000000000603','8a000000-0000-4000-8000-000000000001','TK-1991-000003','FOLLOW_UP','ติดตามตรงเวลา',     '8a000000-0000-4000-8000-000000000202','8a000000-0000-4000-8000-000000000011','8a000000-0000-4000-8000-000000000105','DONE','NORMAL','2026-08-20T10:00:00+07:00','2026-08-20T09:45:00+07:00','2026-08-20T12:00:00+07:00',false,'2026-08-18T10:00:00+07:00','8a000000-0000-4000-8000-000000000105'),
 ('8a000000-0000-4000-8000-000000000604','8a000000-0000-4000-8000-000000000001','TK-1991-000004','FOLLOW_UP','ติดตามเสร็จช้า',    '8a000000-0000-4000-8000-000000000204','8a000000-0000-4000-8000-000000000011','8a000000-0000-4000-8000-000000000105','DONE','NORMAL','2026-08-25T10:00:00+07:00','2026-08-25T09:45:00+07:00','2026-08-27T10:00:00+07:00',false,'2026-08-24T10:00:00+07:00','8a000000-0000-4000-8000-000000000105'),
 ('8a000000-0000-4000-8000-000000000605','8a000000-0000-4000-8000-000000000001','TK-1991-000005','FOLLOW_UP','ติดตามพ้นผ่อนผัน',  '8a000000-0000-4000-8000-000000000205','8a000000-0000-4000-8000-000000000011','8a000000-0000-4000-8000-000000000104','OPEN','NORMAL','2026-09-01T10:00:00+07:00','2026-09-01T09:45:00+07:00',NULL,                      false,'2026-08-30T10:00:00+07:00','8a000000-0000-4000-8000-000000000104'),
 ('8a000000-0000-4000-8000-000000000606','8a000000-0000-4000-8000-000000000001','TK-1991-000006','FOLLOW_UP','ติดตามในระยะผ่อนผัน','8a000000-0000-4000-8000-000000000201','8a000000-0000-4000-8000-000000000011','8a000000-0000-4000-8000-000000000104','OPEN','NORMAL','2026-09-10T20:00:00+07:00','2026-09-10T19:45:00+07:00',NULL,                      false,'2026-09-09T10:00:00+07:00','8a000000-0000-4000-8000-000000000104');

-- ------------------------------------------------------------------ duplicate decision (ข้อ 12.3)
INSERT INTO crm.duplicate_decisions (id, organization_id, customer_id, candidate_customer_id, score, matched_rules,
                                     override_reason_code, status, created_by, created_at)
VALUES ('8a000000-0000-4000-8000-000000000901', '8a000000-0000-4000-8000-000000000001',
        '8a000000-0000-4000-8000-000000000202', '8a000000-0000-4000-8000-000000000201', 100,
        ARRAY['เบอร์โทรตรงกัน'], 'FAMILY_SHARED_PHONE', 'PENDING',
        '8a000000-0000-4000-8000-000000000104', '2026-09-02T10:00:00+07:00');

SELECT set_config('app.bulk', 'off', true);

-- =====================================================================================
-- A. ฟังก์ชันปัด/แสดงผล (CANONICAL ข้อ 1.3)
-- =====================================================================================
SELECT test.assert_eq(app.fmt_int(3125),        '3,125',        'A01 จำนวนคั่นหลักพัน');
SELECT test.assert_eq(app.fmt_int(0),           '0',            'A02 จำนวนศูนย์');
SELECT test.assert_eq(app.fmt_money(3332700),   '฿3,332,700',   'A03 เงินจำนวนเต็มไม่แสดงสตางค์');
SELECT test.assert_eq(app.fmt_money(28900.50),  '฿28,900.50',   'A04 เงินไม่เต็มจำนวนแสดงสตางค์ 2 ตำแหน่ง');
SELECT test.assert_eq(app.fmt_rate(0.241),      '24.1%',        'A05 อัตรา 1 ตำแหน่งเสมอ');
SELECT test.assert_eq(app.fmt_rate(1),          '100.0%',       'A06 อัตรา 100.0%');
SELECT test.assert_eq(app.fmt_rate(0.36),       '36.0%',        'A07 อัตราลงท้ายศูนย์ยังมี 1 ตำแหน่ง');
SELECT test.assert_eq(app.fmt_rate(NULL),       '–',            'A08 อัตรา NULL แสดง – (en dash)');
-- half away from zero: 16.65 → 16.7 (ถ้าเป็น banker''s rounding จะได้ 16.6)
SELECT test.assert_eq(app.fmt_rate(0.1665),     '16.7%',        'A09 ปัดครึ่งออกจากศูนย์ 16.65 → 16.7');
SELECT test.assert_eq(app.fmt_rate(0.1675),     '16.8%',        'A10 ปัดครึ่งออกจากศูนย์ 16.75 → 16.8');
SELECT test.assert_eq(app.fmt_delta_pct(1005, 1000), '+1%',     'A11 ส่วนต่าง 0.5% ปัดครึ่งออกจากศูนย์เป็น +1%');
SELECT test.assert_eq(app.fmt_delta_pct(3125, 2790), '+12%',    'A12 ส่วนต่างจำนวนเต็ม +12%');
SELECT test.assert_eq(app.fmt_delta_pct(95, 100),    '−5%',     'A13 ค่าลบใช้เครื่องหมายลบ U+2212');
SELECT test.assert_eq(app.fmt_delta_pct(4, 4),       '0%',      'A14 ไม่เปลี่ยนแปลงแสดง 0%');
SELECT test.assert_eq(app.fmt_delta_pct(10, 0),      '–',       'A15 ช่วงก่อนหน้าเป็น 0 แสดง –');
SELECT test.assert_eq(app.fmt_delta_pct(10, NULL),   '–',       'A16 ไม่มีค่าก่อนหน้าแสดง –');
-- pp คำนวณจากอัตราที่ยังไม่ปัด (215/892 vs 182/826 ของ CANONICAL ข้อ 13.1)
SELECT test.assert_eq(app.fmt_delta_pp(215::numeric / 892, 182::numeric / 826), '+2.1 pp',
                      'A17 pp จากอัตราที่ยังไม่ปัด (+2.1 pp)');
SELECT test.assert_eq(app.fmt_delta_pp(0.1, 0.104), '−0.4 pp', 'A18 pp ค่าลบ');
SELECT test.assert_eq(app.kpi_rate(1, 0),  NULL::numeric, 'A19 ตัวหาร 0 → NULL');
SELECT test.assert_eq(app.kpi_rate(NULL, 5), NULL::numeric, 'A20 ตัวตั้ง NULL → NULL');

-- =====================================================================================
-- B. ช่วงเวลา (CANONICAL ข้อ 12.0)
-- =====================================================================================
SELECT test.assert_eq((SELECT period_start FROM app.kpi_period('LAST_30_DAYS')), '2026-08-13T00:00:00+07:00'::timestamptz, 'B01 LAST_30_DAYS เริ่ม 13 ส.ค. 2569 00:00');
SELECT test.assert_eq((SELECT period_end   FROM app.kpi_period('LAST_30_DAYS')), '2026-09-12T00:00:00+07:00'::timestamptz, 'B02 LAST_30_DAYS จบก่อน 12 ก.ย. 2569 00:00');
SELECT test.assert_eq((SELECT cmp_start    FROM app.kpi_period('LAST_30_DAYS')), '2026-07-14T00:00:00+07:00'::timestamptz, 'B03 ช่วงก่อนหน้าเริ่ม 14 ก.ค. 2569');
SELECT test.assert_eq((SELECT cmp_end      FROM app.kpi_period('LAST_30_DAYS')), '2026-08-13T00:00:00+07:00'::timestamptz, 'B04 ช่วงก่อนหน้าจบก่อน 13 ส.ค. 2569');
SELECT test.assert_eq((SELECT period_start FROM app.kpi_period('TODAY')),        '2026-09-11T00:00:00+07:00'::timestamptz, 'B05 TODAY เริ่มเที่ยงคืน Asia/Bangkok');
SELECT test.assert_eq((SELECT cmp_end      FROM app.kpi_period('TODAY')),        '2026-09-04T10:24:00+07:00'::timestamptz, 'B06 TODAY เทียบถึงเวลาเดียวกันของสัปดาห์ก่อน (app.clock() − 7 วัน)');
SELECT test.assert_eq((SELECT period_start FROM app.kpi_period('YESTERDAY')),    '2026-09-10T00:00:00+07:00'::timestamptz, 'B07 YESTERDAY');
SELECT test.assert_eq((SELECT period_start FROM app.kpi_period('THIS_WEEK')),    '2026-09-07T00:00:00+07:00'::timestamptz, 'B08 THIS_WEEK เริ่มวันจันทร์');
SELECT test.assert_eq((SELECT period_start FROM app.kpi_period('THIS_MONTH')),   '2026-09-01T00:00:00+07:00'::timestamptz, 'B09 THIS_MONTH');
SELECT test.assert_eq((SELECT cmp_end      FROM app.kpi_period('THIS_MONTH')),   '2026-08-12T00:00:00+07:00'::timestamptz, 'B10 THIS_MONTH เทียบช่วงวันที่ตรงกันของเดือนก่อน');
SELECT test.assert_eq((SELECT period_start FROM app.kpi_period('LAST_MONTH')),   '2026-08-01T00:00:00+07:00'::timestamptz, 'B11 LAST_MONTH');
SELECT test.assert_eq((SELECT period_end   FROM app.kpi_period('LAST_MONTH')),   '2026-09-01T00:00:00+07:00'::timestamptz, 'B12 LAST_MONTH ทั้งเดือน');
SELECT test.assert_eq((SELECT period_start FROM app.kpi_period('THIS_QUARTER')), '2026-07-01T00:00:00+07:00'::timestamptz, 'B13 THIS_QUARTER ไตรมาสปฏิทิน');
SELECT test.assert_eq((SELECT period_start FROM app.kpi_period('CUSTOM', '2026-09-01', '2026-09-11')), '2026-09-01T00:00:00+07:00'::timestamptz, 'B14 CUSTOM เริ่ม');
SELECT test.assert_eq((SELECT cmp_start    FROM app.kpi_period('CUSTOM', '2026-09-01', '2026-09-11')), '2026-08-22T00:00:00+07:00'::timestamptz, 'B15 CUSTOM เทียบช่วงยาวเท่ากันที่จบก่อน p_start');
SELECT test.api_invalid2($$SELECT * FROM app.kpi_period('NOT_A_PRESET')$$, 'B16 preset ที่ไม่รู้จักถูกปฏิเสธ');
SELECT test.api_invalid2($$SELECT * FROM app.kpi_period('CUSTOM', '2026-01-01', '2027-06-01')$$, 'B17 CUSTOM เกิน 366 วันถูกปฏิเสธ');

-- =====================================================================================
-- C. view ภายใน (CANONICAL ข้อ 3.1 · 12.3)
-- =====================================================================================
-- interaction ของ visit CANCELLED และ visit CANCELLED เองไม่อยู่ใน customer_activity
SELECT test.assert_eq((SELECT count(*) FROM analytics.customer_activity a
                        WHERE a.customer_id = '8a000000-0000-4000-8000-000000000203'), 0::bigint,
                      'C01 ลูกค้าที่มีแต่ visit CANCELLED + interaction ของ visit นั้น ไม่มีกิจกรรมเลย');
-- เหตุการณ์การซื้อของ C1 = OP-1991-000001 + OP-1991-000005 (transaction ref ที่ผูก WON ไม่นับซ้ำ)
SELECT test.assert_eq((SELECT count(*) FROM analytics.purchase_events pe
                        WHERE pe.customer_id = '8a000000-0000-4000-8000-000000000201'), 2::bigint,
                      'C02 ref ที่ผูก opportunity WON ไม่นับเป็นเหตุการณ์การซื้อซ้ำ');
SELECT test.assert_eq((SELECT count(*) FROM analytics.purchase_events pe
                        WHERE pe.customer_id = '8a000000-0000-4000-8000-000000000202'), 1::bigint,
                      'C03 ref ที่ไม่ผูก opportunity นับเป็นเหตุการณ์การซื้อ');
-- รายการคุณภาพข้อมูล
SELECT test.assert_eq((SELECT count(*) FROM analytics.data_quality_issues q
                        WHERE q.issue_code = 'VISIT_UNRECORDED'
                          AND q.branch_id = ANY (test.tkbranches())), 1::bigint,
                      'C04 VISIT_UNRECORDED นับเฉพาะ 7 วันล่าสุดและตัดรายการที่รับทราบแล้ว');
SELECT test.assert_eq((SELECT count(*) FROM analytics.data_quality_issues q
                        WHERE q.issue_code = 'MISSING_PHONE' AND q.branch_id = ANY (test.tkbranches())), 2::bigint, 'C05 MISSING_PHONE = C3 · C6');
SELECT test.assert_eq((SELECT count(*) FROM analytics.data_quality_issues q
                        WHERE q.issue_code = 'INVALID_PHONE' AND q.branch_id = ANY (test.tkbranches())), 1::bigint, 'C06 INVALID_PHONE = C4');
SELECT test.assert_eq((SELECT count(*) FROM analytics.data_quality_issues q
                        WHERE q.issue_code = 'INCOMPLETE_CUSTOMER' AND q.branch_id = ANY (test.tkbranches())), 1::bigint, 'C07 INCOMPLETE_CUSTOMER = C3');
SELECT test.assert_eq((SELECT count(*) FROM analytics.data_quality_issues q
                        WHERE q.issue_code = 'LEAD_WITHOUT_OWNER' AND q.branch_id = ANY (test.tkbranches())), 1::bigint, 'C08 LEAD_WITHOUT_OWNER = LD-1991-000005');
SELECT test.assert_eq((SELECT count(*) FROM analytics.data_quality_issues q
                        WHERE q.issue_code = 'LEAD_WITHOUT_OUTCOME' AND q.branch_id = ANY (test.tkbranches())), 2::bigint,
                      'C09 LEAD_WITHOUT_OUTCOME = lead เปิดที่สร้างก่อน 28 ส.ค. 2569 10:24');
SELECT test.assert_eq((SELECT count(*) FROM analytics.data_quality_issues q
                        WHERE q.issue_code = 'OVERDUE_FOLLOWUP' AND q.branch_id = ANY (test.tkbranches())), 2::bigint,
                      'C10 OVERDUE_FOLLOWUP = task FOLLOW_UP ที่ due ก่อนเที่ยงคืนวันนี้');
SELECT test.assert_eq((SELECT count(*) FROM analytics.data_quality_issues q
                        WHERE q.issue_code = 'WON_WITHOUT_TRANSACTION' AND q.branch_id = ANY (test.tkbranches())), 3::bigint,
                      'C11 WON_WITHOUT_TRANSACTION = WON เกิน 3 วันที่ไม่มี ref (OP-1991-000001 มี ref แล้ว)');
SELECT test.assert_eq((SELECT count(*) FROM analytics.data_quality_issues q
                        WHERE q.issue_code = 'DUPLICATE_SUSPECTED' AND q.branch_id = ANY (test.tkbranches())), 1::bigint, 'C12 DUPLICATE_SUSPECTED');

-- ===== P1: ที่พักผลลัพธ์ของ RPC (เรียกครั้งเดียวต่อสถานการณ์) =====
CREATE TABLE test.res (k text PRIMARY KEY, v jsonb);
GRANT SELECT, INSERT ON test.res TO authenticated, service_role;
CREATE FUNCTION test.r(p_k text) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT v FROM test.res WHERE k = p_k $$;
GRANT EXECUTE ON FUNCTION test.r(text) TO authenticated, service_role;

-- =====================================================================================
-- D. api.get_kpis — มุมมองทั้งองค์กร (EXECUTIVE · aal2 · ทุกสาขา)
-- =====================================================================================
SELECT test.login_as('kpi.u01@test.example.com', 'aal2');
INSERT INTO test.res (k, v) VALUES
    ('ex_30',   api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'NONE')),
    ('ex_today',api.get_kpis('TODAY',        NULL, NULL, NULL, 'NONE')),
    ('ex_br',   api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'BRANCH')),
    ('ex_ch',   api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'CHANNEL')),
    ('ex_st',   api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'STATUS'));

-- D1 ตัวนับตามช่วงเวลา
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'VISITS'),            12::numeric, 'D01 VISITS = 12 (ตัด visit CANCELLED)');
SELECT test.assert_eq(test.kpi (test.r('ex_30'), 'VISITS', 'prev_value')::numeric, 3::numeric, 'D02 VISITS ช่วงก่อนหน้า = 3 (ขอบ 13 ส.ค. 00:00 Asia/Bangkok)');
SELECT test.assert_eq(test.kpi (test.r('ex_30'), 'VISITS', 'change_display'), '+300%', 'D03 ป้ายเปลี่ยนแปลงของ VISITS');
SELECT test.assert_eq(test.kpi (test.r('ex_30'), 'VISITS', 'display'),        '12',    'D04 display ของ VISITS');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'WALKIN_VISITS'),     11::numeric, 'D05 WALKIN_VISITS');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'IDENTIFIED_VISITS'),  3::numeric, 'D06 IDENTIFIED_VISITS');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'UNIQUE_CUSTOMERS'),   5::numeric, 'D07 UNIQUE_CUSTOMERS (ลูกค้าที่มีแต่ visit CANCELLED ไม่นับ)');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'NEW_CUSTOMERS'),      3::numeric, 'D08 NEW_CUSTOMERS');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'RETURNING_CUSTOMERS'),2::numeric, 'D09 RETURNING_CUSTOMERS');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'NEW_CUSTOMERS') + test.kpin(test.r('ex_30'), 'RETURNING_CUSTOMERS'),
                      test.kpin(test.r('ex_30'), 'UNIQUE_CUSTOMERS'), 'D10 invariant NEW + RETURNING = UNIQUE (ข้อ 3.2)');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'LEADS'),              4::numeric, 'D11 LEADS');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'OPPORTUNITIES'),      5::numeric, 'D12 OPPORTUNITIES');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'SALES'),              3::numeric, 'D13 SALES');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'SALES_AMOUNT'),   55000::numeric, 'D14 SALES_AMOUNT');
SELECT test.assert_eq(test.kpi (test.r('ex_30'), 'SALES_AMOUNT', 'display'), '฿55,000', 'D15 display ของเงิน');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'LOST_OPPORTUNITIES'), 1::numeric, 'D16 LOST_OPPORTUNITIES');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'LOST_LEADS'),         1::numeric, 'D17 LOST_LEADS');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'LOST_TOTAL'),         2::numeric, 'D18 LOST_TOTAL = ผลบวก');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'BUYERS'),             4::numeric, 'D19 BUYERS (รวม ref ที่ไม่ผูก opportunity)');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'REPEAT_BUYERS'),      1::numeric, 'D20 REPEAT_BUYERS (ซื้อครั้งก่อนอยู่นอกช่วงก็นับ)');

-- D2 อัตรา
SELECT test.assert_eq(test.kpi(test.r('ex_30'), 'LEAD_RATE', 'display'),           '33.3%', 'D21 LEAD_RATE = 4/12');
SELECT test.assert_eq(test.kpi(test.r('ex_30'), 'OPPORTUNITY_RATE', 'display'),   '125.0%', 'D22 OPPORTUNITY_RATE = 5/4');
SELECT test.assert_eq(test.kpi(test.r('ex_30'), 'CLOSE_RATE', 'display'),           '75.0%', 'D23 CLOSE_RATE = SALES/(SALES+LOST_OPP) = 3/4 (D4)');
SELECT test.assert_eq(test.kpi(test.r('ex_30'), 'LOST_RATE', 'display'),            '25.0%', 'D24 LOST_RATE = 1/4');
SELECT test.assert_eq(test.kpi(test.r('ex_30'), 'CONV_LEAD_TO_SALE', 'display'),    '75.0%', 'D25 CONV_LEAD_TO_SALE = 3/4');
SELECT test.assert_eq(test.kpi(test.r('ex_30'), 'CONV_LEAD_TO_SALE', 'change_display'), '−25.0 pp', 'D26 pp ของ CONV_LEAD_TO_SALE (จากอัตราที่ยังไม่ปัด)');
SELECT test.assert_eq(test.kpi(test.r('ex_30'), 'CONV_VISIT_TO_SALE', 'display'),   '25.0%', 'D27 CONV_VISIT_TO_SALE = 3/12');
SELECT test.assert_eq(test.kpi(test.r('ex_30'), 'WALKIN_CONVERSION', 'display'),    '18.2%', 'D28 WALKIN_CONVERSION = 2/11 (ตัวตั้งใช้ origin_channel_code)');
SELECT test.assert_eq(test.kpi(test.r('ex_30'), 'WALKIN_CONVERSION', 'numerator')::numeric, 2::numeric, 'D29 ตัวตั้งของ WALKIN_CONVERSION');
SELECT test.assert_eq(test.kpi(test.r('ex_30'), 'CAPTURE_RATE', 'display'),         '25.0%', 'D30 CAPTURE_RATE = 3/12');
SELECT test.assert_eq(test.kpi(test.r('ex_30'), 'CAPTURE_RATE', 'target_met'),      'false', 'D31 CAPTURE_RATE ต่ำกว่าเป้า 95%');
SELECT test.assert_eq(test.kpi(test.r('ex_30'), 'OUTCOME_COMPLETION', 'display'),   '72.7%', 'D32 OUTCOME_COMPLETION = 8/11 (ตัด UNRECORDED)');
SELECT test.assert_eq(test.kpi(test.r('ex_30'), 'REPEAT_RATE', 'display'),          '25.0%', 'D33 REPEAT_RATE = 1/4');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'LEAD_RESPONSE_MIN'),             20::numeric, 'D34 LEAD_RESPONSE_MIN = 20 นาที (ช่องทางข้อความเท่านั้น)');
SELECT test.assert_eq(test.kpi(test.r('ex_30'), 'LEAD_RESPONSE_MIN', 'numerator')::numeric, 1::numeric, 'D35 ฐานของมัธยฐาน');
SELECT test.assert_eq((test.kpi(test.r('ex_30'), 'LEAD_RESPONSE_MIN', 'extra')::jsonb ->> 'not_contacted')::numeric, 2::numeric,
                      'D36 "ยังไม่ติดต่อ" ของ LEAD_RESPONSE_MIN');
SELECT test.assert_eq(test.kpi(test.r('ex_30'), 'FOLLOWUP_COMPLETION', 'display'),  '33.3%', 'D37 FOLLOWUP_COMPLETION = 1/3 (ตัดงานที่ยังอยู่ในระยะผ่อนผัน)');
SELECT test.assert_eq(test.kpi(test.r('ex_30'), 'FOLLOWUP_COMPLETION', 'denominator')::numeric, 3::numeric, 'D38 ตัวหารของ FOLLOWUP_COMPLETION');
SELECT test.assert_eq(test.kpi(test.r('ex_30'), 'FOLLOWUP_COMPLETION', 'change_display'), '–', 'D39 ช่วงก่อนหน้าไม่มีงาน → –');
SELECT test.assert_eq(test.kpi(test.r('ex_30'), 'DUPLICATE_RATE', 'display'),       '16.7%', 'D40 DUPLICATE_RATE = 1/6');
SELECT test.assert_eq(test.kpi(test.r('ex_30'), 'MISSING_REQUIRED_RATE', 'display'),'33.3%', 'D41 MISSING_REQUIRED_RATE = 2/6 (C3 ติดสองธงนับครั้งเดียว)');
SELECT test.assert_eq(test.kpi(test.r('ex_30'), 'MISSING_REQUIRED_RATE', 'target_met'), 'false', 'D42 MISSING_REQUIRED_RATE ไม่ผ่านเป้า < 2%');

-- D3 KPI ณ app.clock()
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'OPEN_LEADS'),            4::numeric, 'D43 OPEN_LEADS');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'OPEN_OPPORTUNITIES'),    1::numeric, 'D44 OPEN_OPPORTUNITIES');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'OPEN_PIPELINE_AMOUNT'), 12000::numeric, 'D45 OPEN_PIPELINE_AMOUNT');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'OPEN_VISITS'),           1::numeric, 'D46 OPEN_VISITS');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'WON_LAST_7_DAYS'),       1::numeric, 'D47 WON_LAST_7_DAYS = [5 ก.ย., 12 ก.ย.)');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'WON_LAST_7_DAYS_AMOUNT'), 20000::numeric, 'D48 WON_LAST_7_DAYS_AMOUNT');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'TASKS_TODAY'),           1::numeric, 'D49 TASKS_TODAY (ข้อ 4.7)');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'TASKS_OVERDUE'),         3::numeric, 'D50 TASKS_OVERDUE');
SELECT test.assert_eq(test.kpin(test.r('ex_30'), 'OPEN_FOLLOWUP_CUSTOMERS'), 2::numeric, 'D51 OPEN_FOLLOWUP_CUSTOMERS (ลูกค้าไม่ซ้ำ)');
SELECT test.assert_eq(test.kpi(test.r('ex_30'), 'OPEN_LEADS', 'prev_value'), NULL, 'D52 KPI ณ clock ไม่มีค่าช่วงก่อนหน้า');
SELECT test.assert_eq(test.kpi(test.r('ex_30'), 'OPEN_LEADS', 'change_display'), '–', 'D53 KPI ณ clock ไม่แสดงป้ายเปลี่ยนแปลง');

-- D4 preset TODAY · ขอบบนของช่วงเปรียบเทียบตัดที่ app.clock() − 7 วัน (ข้อ 12.0)
SELECT test.assert_eq(test.kpin(test.r('ex_today'), 'VISITS'), 2::numeric, 'D54 VISITS ของวันนี้');
SELECT test.assert_eq(test.kpi (test.r('ex_today'), 'VISITS', 'prev_value')::numeric, 1::numeric,
                      'D55 ช่วงเปรียบเทียบของ TODAY ตัดที่ 4 ก.ย. 10:24 (ขอบบน <) จึงไม่นับ visit เวลา 10:24 และ 11:00');
SELECT test.assert_eq(test.kpi (test.r('ex_today'), 'VISITS', 'change_display'), '+100%', 'D56 ป้ายเปลี่ยนแปลงของ TODAY');

-- D5 จัดกลุ่มตามสาขา · ช่องทาง · สถานะ
SELECT test.assert_eq(test.kpin(test.r('ex_br'), 'VISITS', '8a000000-0000-4000-8000-000000000011'), 11::numeric, 'D57 VISITS ของ TK1');
SELECT test.assert_eq(test.kpin(test.r('ex_br'), 'VISITS', '8a000000-0000-4000-8000-000000000012'),  1::numeric, 'D58 VISITS ของ TK2');
SELECT test.assert_eq(test.kpi (test.r('ex_br'), 'VISITS', 'group_label', '8a000000-0000-4000-8000-000000000011'), 'สาขาทดสอบ KPI 1', 'D59 ป้ายกลุ่มสาขา');
SELECT test.assert_eq(test.kpin(test.r('ex_br'), 'UNIQUE_CUSTOMERS', '8a000000-0000-4000-8000-000000000011'), 4::numeric, 'D60 ลูกค้าไม่ซ้ำรายสาขาใช้สาขาของกิจกรรม');
SELECT test.assert_eq(test.kpin(test.r('ex_br'), 'SALES', '8a000000-0000-4000-8000-000000000012'), 1::numeric, 'D61 SALES ของ TK2');
SELECT test.assert_eq(test.kpin(test.r('ex_ch'), 'UNIQUE_CUSTOMERS', 'WALK_IN'),  2::numeric, 'D62 ลูกค้าไม่ซ้ำตามช่องทางแรก WALK_IN');
SELECT test.assert_eq(test.kpin(test.r('ex_ch'), 'UNIQUE_CUSTOMERS', 'LINE'),     2::numeric, 'D63 ลูกค้าไม่ซ้ำตามช่องทางแรก LINE');
SELECT test.assert_eq(test.kpin(test.r('ex_ch'), 'UNIQUE_CUSTOMERS', 'FACEBOOK'), 1::numeric, 'D64 ลูกค้าไม่ซ้ำตามช่องทางแรก FACEBOOK');
SELECT test.assert_eq(test.kpin(test.r('ex_st'), 'OPEN_LEADS', 'NEW'),        2::numeric, 'D65 OPEN_LEADS แยกสถานะ NEW');
SELECT test.assert_eq(test.kpin(test.r('ex_st'), 'OPEN_LEADS', 'CONTACTED'),  2::numeric, 'D66 OPEN_LEADS แยกสถานะ CONTACTED');
SELECT test.assert_eq(test.kpin(test.r('ex_st'), 'OPEN_OPPORTUNITIES', 'INTERESTED'), 1::numeric, 'D67 OPEN_OPPORTUNITIES แยกขั้น');
SELECT test.assert_eq(test.kpin(test.r('ex_st'), 'OPEN_VISITS', 'WAITING'),   1::numeric, 'D68 OPEN_VISITS แยกสถานะ');
SELECT test.assert_eq(test.kpi (test.r('ex_st'), 'VISITS', 'value'), NULL, 'D69 KPI ที่ไม่มีมิติ STATUS คืน NULL');

-- =====================================================================================
-- E. ขอบเขตของผู้เรียก (CANONICAL ข้อ 9.4.1 · 12.4)
-- =====================================================================================
SELECT test.login_as('kpi.u02@test.example.com', 'aal2');          -- ผู้จัดการสาขา TK1 (scope B)
INSERT INTO test.res (k, v) VALUES
    ('bm1_30',    api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'NONE')),
    ('bm1_staff', api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'STAFF'));
SELECT test.assert_eq(test.kpin(test.r('bm1_30'), 'VISITS'), 11::numeric, 'E01 ผู้จัดการ TK1 เห็นเฉพาะแถวของ TK1');
SELECT test.assert_eq(test.kpin(test.r('bm1_30'), 'UNIQUE_CUSTOMERS'), 4::numeric, 'E02 ลูกค้าไม่ซ้ำของ TK1 (scope B คำนวณได้)');
SELECT test.assert_eq(test.kpin(test.r('bm1_30'), 'SALES'), 2::numeric, 'E03 SALES ของ TK1');
SELECT test.assert_eq(test.kpin(test.r('bm1_staff'), 'VISITS', '8a000000-0000-4000-8000-000000000104'), 9::numeric, 'E04 จัดกลุ่มรายพนักงาน (ต้องมี report.staff_performance)');
SELECT test.assert_eq(test.kpin(test.r('bm1_staff'), 'VISITS', '8a000000-0000-4000-8000-000000000105'), 1::numeric, 'E05 VISITS ของพนักงาน B');
SELECT test.assert_eq(test.kpin(test.r('bm1_staff'), 'VISITS'), 1::numeric, 'E06 กลุ่ม "ไม่มีผู้รับผิดชอบ" (visit WAITING ไม่มีผู้รับ)');

SELECT test.login_as('kpi.u03@test.example.com', 'aal2');          -- หัวหน้าทีม TK1 (scope T)
INSERT INTO test.res (k, v) VALUES ('sv_30', api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'NONE'));
SELECT test.assert_eq(test.kpin(test.r('sv_30'), 'VISITS'), 10::numeric, 'E07 scope TEAM นับเฉพาะแถวที่ owner อยู่ในทีม (visit ไม่มีผู้รับไม่นับ)');
SELECT test.assert_eq(test.kpin(test.r('sv_30'), 'LEADS'),   3::numeric, 'E08 scope TEAM ไม่นับ lead ที่ไม่มี owner');
SELECT test.assert_eq(test.kpin(test.r('sv_30'), 'SALES'),   2::numeric, 'E09 SALES ของทีม');
SELECT test.assert_eq(test.kpi (test.r('sv_30'), 'UNIQUE_CUSTOMERS', 'value'), NULL, 'E10 KPI ที่ไม่มีการผูกพนักงานคืน NULL ใต้ scope TEAM (ข้อ 12.4)');
SELECT test.assert_eq(test.kpi (test.r('sv_30'), 'BUYERS', 'value'),           NULL, 'E11 BUYERS คืน NULL ใต้ scope TEAM');
SELECT test.assert_eq(test.kpi (test.r('sv_30'), 'REPEAT_RATE', 'value'),      NULL, 'E12 REPEAT_RATE คืน NULL ใต้ scope TEAM');
SELECT test.assert_eq(test.kpi (test.r('sv_30'), 'DUPLICATE_RATE', 'value'),   NULL, 'E13 DUPLICATE_RATE คืน NULL ใต้ scope TEAM');
SELECT test.assert_eq(test.kpi (test.r('sv_30'), 'UNIQUE_CUSTOMERS', 'display'), '–', 'E14 display ของค่า NULL คือ –');

SELECT test.login_as('kpi.u04@test.example.com', 'aal1');          -- STAFF (scope O · aal1 ใช้ได้)
INSERT INTO test.res (k, v) VALUES ('s1_30', api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'NONE'));
SELECT test.assert_eq(test.kpin(test.r('s1_30'), 'VISITS'), 9::numeric, 'E15 scope OWN นับเฉพาะ visit ที่ตนเป็นผู้รับ');
SELECT test.assert_eq(test.kpin(test.r('s1_30'), 'LEADS'),  2::numeric, 'E16 scope OWN นับเฉพาะ lead ที่ตนเป็น owner (ไม่ใช้ created_by สำรอง)');
SELECT test.assert_eq(test.kpin(test.r('s1_30'), 'SALES'),  1::numeric, 'E17 SALES ของตน');
SELECT test.assert_eq(test.kpin(test.r('s1_30'), 'SALES_AMOUNT'), 30000::numeric, 'E18 SALES_AMOUNT ของตน');
SELECT test.assert_eq(test.kpi (test.r('s1_30'), 'UNIQUE_CUSTOMERS', 'value'), NULL, 'E19 UNIQUE_CUSTOMERS คืน NULL ใต้ scope OWN');
SELECT test.assert_eq(test.kpin(test.r('s1_30'), 'TASKS_TODAY'),   1::numeric, 'E20 TASKS_TODAY ของตน');
SELECT test.assert_eq(test.kpin(test.r('s1_30'), 'TASKS_OVERDUE'), 3::numeric, 'E21 TASKS_OVERDUE ของตน');
SELECT test.denied2($$SELECT api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'STAFF')$$,
                    'E22 STAFF ไม่มี report.staff_performance จึงจัดกลุ่มรายพนักงานไม่ได้');

SELECT test.login_as('kpi.u06@test.example.com', 'aal2');          -- ผู้จัดการสาขา TK2
INSERT INTO test.res (k, v) VALUES
    ('bm2_30',  api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'NONE')),
    ('bm2_all', api.get_kpis('LAST_30_DAYS', NULL, NULL,
                             ARRAY['8a000000-0000-4000-8000-000000000011',
                                   '8a000000-0000-4000-8000-000000000012']::uuid[], 'NONE'));
SELECT test.assert_eq(test.kpin(test.r('bm2_30'), 'VISITS'), 1::numeric, 'E23 ผู้จัดการ TK2 เห็นเฉพาะ TK2');
SELECT test.assert_eq(test.kpin(test.r('bm2_all'), 'VISITS'), 1::numeric, 'E24 สาขาที่ไม่มีสิทธิ์ถูกตัดทิ้งเงียบ ๆ (ส่งทั้งสองสาขาก็ยังได้แถว TK2)');
SELECT test.denied2($$SELECT api.get_kpis('LAST_30_DAYS', NULL, NULL, ARRAY['8a000000-0000-4000-8000-000000000011']::uuid[], 'NONE')$$,
                    'E25 ขอสาขาที่ไม่มีสิทธิ์ทั้งหมด → ปฏิเสธ 42501');

SELECT test.login_as('kpi.u01@test.example.com', 'aal1');          -- EXECUTIVE ที่ aal1
SELECT test.denied2($$SELECT api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'NONE')$$,
                    'E26 บทบาทที่ requires_mfa ที่ aal1 ไม่ถูกนับ → ปฏิเสธ (ข้อ 8.0)');
SELECT test.login_anon();
SELECT test.denied2($$SELECT api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'NONE')$$,
                    'E27 anon ไม่มี EXECUTE บน api.get_kpis');

-- =====================================================================================
-- F. api.list_data_quality_issues (CANONICAL ข้อ 9.6 · 12.3)
-- =====================================================================================
SELECT test.login_as('kpi.u01@test.example.com', 'aal2');
INSERT INTO test.res (k, v) VALUES
    ('dq_all', api.list_data_quality_issues()),
    ('dq_mp',  api.list_data_quality_issues('MISSING_PHONE'));
SELECT test.assert_eq((test.r('dq_all') ->> 'total')::bigint, 14::bigint, 'F01 รายการคุณภาพข้อมูลทั้งหมดของ fixture');
SELECT test.assert_eq((test.r('dq_mp')  ->> 'total')::bigint,  2::bigint, 'F02 กรองด้วย issue_code');
SELECT test.assert_eq((SELECT sum((x ->> 'value')::numeric) FROM jsonb_array_elements(test.r('dq_all') -> 'counts') x),
                      14::numeric, 'F03 counts รวมเท่ากับ total');
SELECT test.api_invalid2($$SELECT api.list_data_quality_issues('NOT_AN_ISSUE')$$, 'F04 issue_code ที่ไม่รู้จักถูกปฏิเสธ');

SELECT test.login_as('kpi.u04@test.example.com', 'aal1');          -- STAFF · data_quality.view scope O
INSERT INTO test.res (k, v) VALUES ('dq_s1', api.list_data_quality_issues());
SELECT test.assert_true((test.r('dq_s1') ->> 'total')::bigint = 8,
                        'F05 STAFF เห็นเฉพาะรายการที่ตนเป็นผู้ผูก 8 จาก 14 รายการ');
SELECT test.assert_eq((SELECT count(*) FROM jsonb_array_elements(test.r('dq_s1') -> 'rows') x
                        WHERE x ->> 'issue_code' = 'DUPLICATE_SUSPECTED'), 0::bigint,
                      'F06 DUPLICATE_SUSPECTED ไม่มีผู้ผูก จึงไม่อยู่ในมุมมอง scope O');

SELECT test.logout();
SELECT set_config('app.bulk', 'off', true);

-- =====================================================================================
-- G. จัดกลุ่มตามทีม · preset CUSTOM (CANONICAL ข้อ 12.0 · 12.4)
-- =====================================================================================
SELECT test.login_as('kpi.u01@test.example.com', 'aal2');
INSERT INTO test.res (k, v) VALUES
    ('ex_team',   api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'TEAM')),
    ('ex_custom', api.get_kpis('CUSTOM', '2026-09-01', '2026-09-05', NULL, 'NONE'));
SELECT test.assert_eq(test.kpin(test.r('ex_team'), 'VISITS', '8a000000-0000-4000-8000-000000000021'), 10::numeric,
                      'G01 จัดกลุ่มตามทีมปัจจุบันของ owner (ข้อ 12.4)');
SELECT test.assert_eq(test.kpi (test.r('ex_team'), 'VISITS', 'group_label', '8a000000-0000-4000-8000-000000000021'),
                      'ทีมขายทดสอบ KPI 1', 'G02 ป้ายกลุ่มทีม');
SELECT test.assert_eq(test.kpin(test.r('ex_team'), 'VISITS'), 2::numeric,
                      'G03 แถวที่ owner ว่างหรือ owner ไม่อยู่ทีมใดอยู่กลุ่ม "ไม่มีทีม"');
SELECT test.assert_eq(test.kpin(test.r('ex_team'), 'SALES', '8a000000-0000-4000-8000-000000000021'), 2::numeric,
                      'G04 SALES ของทีม');
SELECT test.assert_eq(test.kpi (test.r('ex_team'), 'UNIQUE_CUSTOMERS', 'value',
                                '8a000000-0000-4000-8000-000000000021'), NULL,
                      'G05 UNIQUE_CUSTOMERS ไม่มีมิติทีม → NULL');
SELECT test.assert_eq((test.r('ex_custom') -> 'period' ->> 'start')::timestamptz, '2026-09-01T00:00:00+07:00'::timestamptz,
                      'G06 CUSTOM ใช้ p_start');
SELECT test.assert_eq((test.r('ex_custom') -> 'period' ->> 'end')::timestamptz, '2026-09-05T00:00:00+07:00'::timestamptz,
                      'G07 CUSTOM ใช้ p_end แบบขอบเปิด');
SELECT test.assert_eq(test.kpin(test.r('ex_custom'), 'VISITS'), 5::numeric, 'G08 VISITS ในช่วง CUSTOM');
SELECT test.assert_eq(test.kpi (test.r('ex_custom'), 'VISITS', 'prev_value')::numeric, 0::numeric,
                      'G09 ช่วงเปรียบเทียบของ CUSTOM = [28 ส.ค., 1 ก.ย.) ไม่มี visit');
SELECT test.assert_eq(test.kpi (test.r('ex_custom'), 'VISITS', 'change_display'), '–',
                      'G10 ช่วงก่อนหน้าเป็น 0 → ไม่แสดงป้ายเปลี่ยนแปลง');
SELECT test.logout();
