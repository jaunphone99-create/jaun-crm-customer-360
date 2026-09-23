-- =====================================================================================
-- supabase/tests/api_01_customer.sql — RPC ลูกค้าของ migration 0011_api.sql
--   api.quick_capture · api.find_customer_candidates · api.search_customers · api.link_customer_to_branch
--   api.get_customer_360 · api.reveal_contact · api.reveal_address · api.save_contact · api.save_address
--   api.record_consent · api.merge_customers · api.decide_duplicate
-- fixture อิสระจาก supabase/seed.sql (องค์กร TEST-API · staff ST-96xx · อีเมล @test.example.com)
-- run.mjs ครอบไฟล์ด้วย BEGIN … ROLLBACK · ห้ามมีคำสั่งควบคุมทรานแซกชันในไฟล์
-- =====================================================================================

-- ===== P0: helper เพิ่มของชุด api =====
CREATE FUNCTION test.api_denied(p_sql text, p_msg text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM test.assert_raises(p_sql, p_msg, '42501');
END;
$$;
CREATE FUNCTION test.api_invalid(p_sql text, p_msg text, p_state text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_state text;
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        v_state := SQLSTATE;
        IF v_state NOT IN ('22023', 'P0001') OR (p_state IS NOT NULL AND v_state <> p_state) THEN
            RAISE EXCEPTION 'ASSERT FAILED: % — ได้ % (%)', p_msg, v_state, SQLERRM;
        END IF;
        RAISE NOTICE 'ok: % (ถูกปฏิเสธ % %)', p_msg, v_state, SQLERRM;
        RETURN;
    END;
    RAISE EXCEPTION 'ASSERT FAILED: % — คำสั่งสำเร็จทั้งที่ควรถูกปฏิเสธ', p_msg;
END;
$$;
CREATE FUNCTION test.jcall(p_sql text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
    EXECUTE p_sql INTO v;
    RETURN v;
END;
$$;
CREATE TABLE test.ctx (k text PRIMARY KEY, v text);
CREATE FUNCTION test.put(p_k text, p_v text) RETURNS void LANGUAGE sql AS
$$ INSERT INTO test.ctx VALUES (p_k, p_v) ON CONFLICT (k) DO UPDATE SET v = excluded.v $$;
CREATE FUNCTION test.get(p_k text) RETURNS text LANGUAGE sql STABLE AS
$$ SELECT v FROM test.ctx WHERE k = p_k $$;
GRANT EXECUTE ON FUNCTION test.api_denied(text, text), test.api_invalid(text, text, text),
                          test.jcall(text), test.put(text, text), test.get(text) TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON test.ctx TO authenticated, service_role;

-- ===== F0: fixture (superuser) =====
SELECT set_config('app.bulk', 'on', true);
SELECT set_config('app.seed_mode', 'off', true);

INSERT INTO core.organizations (id, code, name_th) VALUES ('7b000000-0000-4000-8000-000000000001', 'TEST-API', 'องค์กรทดสอบ API');
INSERT INTO core.business_units (id, organization_id, code, name_th)
    VALUES ('7b000000-0000-4000-8000-000000000002', '7b000000-0000-4000-8000-000000000001', 'TABU', 'หน่วยทดสอบ API');
INSERT INTO core.branches (id, organization_id, business_unit_id, code, name_th, branch_type) VALUES
    ('7b000000-0000-4000-8000-000000000011', '7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000002', 'TA1', 'สาขาทดสอบ API 1', 'store'),
    ('7b000000-0000-4000-8000-000000000012', '7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000002', 'TA2', 'สาขาทดสอบ API 2', 'store');
INSERT INTO core.teams (id, organization_id, branch_id, code, name_th) VALUES
    ('7b000000-0000-4000-8000-000000000021', '7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000011', 'TA1-SALES', 'ทีมขายทดสอบ API 1');

INSERT INTO auth.users (id, email, email_confirmed_at)
SELECT ('7b000000-0000-4000-8000-0000000009' || lpad(n::text, 2, '0'))::uuid, 'api.a' || lpad(n::text, 2, '0') || '@test.example.com', now()
FROM generate_series(1, 13) n;
INSERT INTO auth.mfa_factors (user_id, status)
SELECT ('7b000000-0000-4000-8000-0000000009' || lpad(n::text, 2, '0'))::uuid, 'verified' FROM generate_series(1, 13) n;

INSERT INTO core.staff_profiles (id, organization_id, staff_code, employee_code, display_name, email, user_id, status, invite_expires_at)
SELECT ('7b000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, '7b000000-0000-4000-8000-000000000001',
       'ST-96' || lpad(n::text, 2, '0'), 'API-' || lpad(n::text, 2, '0'), 'ผู้ทดสอบ A' || lpad(n::text, 2, '0'),
       'api.a' || lpad(n::text, 2, '0') || '@test.example.com', ('7b000000-0000-4000-8000-0000000009' || lpad(n::text, 2, '0'))::uuid,
       (CASE WHEN n = 11 THEN 'INVITED' ELSE 'ACTIVE' END)::core.staff_status,
       CASE WHEN n = 11 THEN now() + interval '12 hours' END
FROM generate_series(1, 13) n;

INSERT INTO core.staff_role_assignments (organization_id, staff_id, role_code, branch_id, valid_from) VALUES
    ('7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000101', 'EXECUTIVE',      NULL,                                   now() - interval '90 days'),
    ('7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000102', 'BUSINESS_ADMIN', NULL,                                   now() - interval '90 days'),
    ('7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000103', 'SYSTEM_ADMIN',   NULL,                                   now() - interval '90 days'),
    ('7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000104', 'BRANCH_MANAGER', '7b000000-0000-4000-8000-000000000011', now() - interval '90 days'),
    ('7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000105', 'SUPERVISOR',     '7b000000-0000-4000-8000-000000000011', now() - interval '90 days'),
    ('7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000106', 'STAFF',          '7b000000-0000-4000-8000-000000000011', now() - interval '90 days'),
    ('7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000107', 'STAFF',          '7b000000-0000-4000-8000-000000000011', now() - interval '90 days'),
    ('7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000108', 'STAFF',          '7b000000-0000-4000-8000-000000000012', now() - interval '90 days'),
    ('7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000109', 'BRANCH_MANAGER', '7b000000-0000-4000-8000-000000000012', now() - interval '90 days'),
    ('7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000110', 'MARKETING',      NULL,                                   now() - interval '90 days'),
    ('7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000112', 'BUSINESS_ADMIN', NULL,                                   now() - interval '90 days'),
    ('7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000113', 'EXECUTIVE',      NULL,                                   now() - interval '90 days');
INSERT INTO core.team_members (organization_id, team_id, staff_id, is_leader, valid_from) VALUES
    ('7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000021', '7b000000-0000-4000-8000-000000000105', true,  now() - interval '90 days'),
    ('7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000021', '7b000000-0000-4000-8000-000000000106', false, now() - interval '90 days'),
    ('7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000021', '7b000000-0000-4000-8000-000000000107', false, now() - interval '90 days');

INSERT INTO crm.customers (id, organization_id, customer_no, first_name, last_name, first_seen_at, first_channel_code,
                           first_branch_id, owner_staff_id, created_via, created_by) VALUES
    ('7b000000-0000-4000-8000-000000000201', '7b000000-0000-4000-8000-000000000001', 'CUS-1996-000001', 'สมหญิง', 'ทดสอบเอพีไอ', now() - interval '40 days', 'WALK_IN', '7b000000-0000-4000-8000-000000000011', '7b000000-0000-4000-8000-000000000106', 'QUICK_CAPTURE', '7b000000-0000-4000-8000-000000000106'),
    ('7b000000-0000-4000-8000-000000000202', '7b000000-0000-4000-8000-000000000001', 'CUS-1996-000002', 'สมปอง', 'สาขาสอง',    now() - interval '20 days', 'WALK_IN', '7b000000-0000-4000-8000-000000000012', '7b000000-0000-4000-8000-000000000108', 'QUICK_CAPTURE', '7b000000-0000-4000-8000-000000000108'),
    ('7b000000-0000-4000-8000-000000000203', '7b000000-0000-4000-8000-000000000001', 'CUS-1996-000003', 'สมศรี',  'รวมทดสอบ',  now() - interval '10 days', 'LINE',    '7b000000-0000-4000-8000-000000000011', '7b000000-0000-4000-8000-000000000106', 'QUICK_CAPTURE', '7b000000-0000-4000-8000-000000000106');
INSERT INTO crm.customer_branches (organization_id, customer_id, branch_id, first_linked_at, last_activity_at, linked_via)
SELECT '7b000000-0000-4000-8000-000000000001', c.id, c.first_branch_id, c.first_seen_at, c.first_seen_at, 'CREATED'
FROM crm.customers c WHERE c.organization_id = '7b000000-0000-4000-8000-000000000001';
INSERT INTO crm.customer_contacts (id, organization_id, customer_id, contact_type, value_raw, is_primary) VALUES
    ('7b000000-0000-4000-8000-000000000c01', '7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000201', 'PHONE',   '081-111-2222', true),
    ('7b000000-0000-4000-8000-000000000c02', '7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000201', 'EMAIL',   'api.somying@test.example.com', true),
    ('7b000000-0000-4000-8000-000000000c03', '7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000203', 'PHONE',   '082-333-4444', true);
INSERT INTO crm.customer_addresses (id, organization_id, customer_id, address_line, district, province_code, value_masked, is_primary)
    VALUES ('7b000000-0000-4000-8000-000000000c21', '7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000201',
            '1/1 ถนนทดสอบ', 'บางรัก', 'TH-10', 'บางรัก · กรุงเทพมหานคร', true);
INSERT INTO crm.customer_consents (organization_id, customer_id, purpose_code, status, notice_version, channels, captured_via, captured_by, evidence)
VALUES ('7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000201', 'PRIVACY_NOTICE', 'GRANTED', 'PN-2026-01', '{}', 'STAFF_FORM', '7b000000-0000-4000-8000-000000000106', 'PN-2026-01 · STAFF_FORM · WALK_IN');

INSERT INTO crm.visits (id, organization_id, visit_no, branch_id, channel_code, status, queue_no, customer_id, interest_code,
                        started_at, service_started_at, owner_staff_id, created_at, created_by) VALUES
    ('7b000000-0000-4000-8000-000000000301', '7b000000-0000-4000-8000-000000000001', 'V-TA1-960101-001', '7b000000-0000-4000-8000-000000000011', 'WALK_IN', 'IN_SERVICE', 1, '7b000000-0000-4000-8000-000000000201', 'BUY', now() - interval '20 minutes', now() - interval '20 minutes', '7b000000-0000-4000-8000-000000000106', now() - interval '20 minutes', '7b000000-0000-4000-8000-000000000106'),
    ('7b000000-0000-4000-8000-000000000302', '7b000000-0000-4000-8000-000000000001', 'V-TA1-960101-002', '7b000000-0000-4000-8000-000000000011', 'WALK_IN', 'WAITING',    2, NULL, 'INQUIRY', now() - interval '5 minutes', NULL, NULL, now() - interval '5 minutes', '7b000000-0000-4000-8000-000000000106'),
    ('7b000000-0000-4000-8000-000000000303', '7b000000-0000-4000-8000-000000000001', 'V-TA2-960101-001', '7b000000-0000-4000-8000-000000000012', 'WALK_IN', 'IN_SERVICE', 1, NULL, 'BUY',     now() - interval '10 minutes', now() - interval '10 minutes', '7b000000-0000-4000-8000-000000000108', now() - interval '10 minutes', '7b000000-0000-4000-8000-000000000108');
-- ตัวนับเลข visit/คิวของวันนี้ต้องตรงกับแถวที่ fixture ใส่เอง (ข้อ 6.1 · 13.0 ข้อ 8)
INSERT INTO app.running_numbers (scope_key, last_value) VALUES
    ('VISIT:TA1:' || to_char(app.bangkok_date(now()), 'YYYYMMDD'), 2),
    ('QUEUE:TA1:' || to_char(app.bangkok_date(now()), 'YYYYMMDD'), 2),
    ('VISIT:TA2:' || to_char(app.bangkok_date(now()), 'YYYYMMDD'), 1),
    ('QUEUE:TA2:' || to_char(app.bangkok_date(now()), 'YYYYMMDD'), 1)
ON CONFLICT (scope_key) DO UPDATE SET last_value = greatest(app.running_numbers.last_value, excluded.last_value);

INSERT INTO crm.interactions (id, organization_id, customer_id, visit_id, is_visit_root, branch_id, channel_code, direction,
                              interaction_type_code, occurred_at, owner_staff_id, created_by) VALUES
    ('7b000000-0000-4000-8000-000000000401', '7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000201', '7b000000-0000-4000-8000-000000000301', true, '7b000000-0000-4000-8000-000000000011', 'WALK_IN', 'INBOUND', 'VISIT', now() - interval '20 minutes', '7b000000-0000-4000-8000-000000000106', '7b000000-0000-4000-8000-000000000106'),
    ('7b000000-0000-4000-8000-000000000402', '7b000000-0000-4000-8000-000000000001', NULL, '7b000000-0000-4000-8000-000000000303', true, '7b000000-0000-4000-8000-000000000012', 'WALK_IN', 'INBOUND', 'VISIT', now() - interval '10 minutes', '7b000000-0000-4000-8000-000000000108', '7b000000-0000-4000-8000-000000000108');

SELECT set_config('app.bulk', 'off', true);

-- =====================================================================================
-- Q · api.quick_capture (ข้อ 6.2)
-- =====================================================================================
SELECT test.login_as('api.a08@test.example.com', 'aal1');          -- STAFF@TA2
SELECT test.api_denied($$SELECT api.quick_capture(jsonb_build_object(
    'branch_id', '7b000000-0000-4000-8000-000000000011', 'channel_code', 'WALK_IN', 'interest_code', 'BUY',
    'first_name', 'ข้าม', 'phone', '090-000-0001', 'privacy_notice_ack', true))$$,
    'Q01 STAFF@TA2 สร้างลูกค้าที่สาขา TA1 ไม่ได้');

SELECT test.login_as('api.a06@test.example.com', 'aal1');          -- STAFF@TA1
SELECT test.api_invalid($$SELECT api.quick_capture(jsonb_build_object(
    'branch_id', '7b000000-0000-4000-8000-000000000011', 'channel_code', 'WALK_IN', 'interest_code', 'BUY',
    'phone', '090-000-0002', 'privacy_notice_ack', true))$$, 'Q02 ไม่มีชื่อและชื่อเล่น', '22023');
SELECT test.api_invalid($$SELECT api.quick_capture(jsonb_build_object(
    'branch_id', '7b000000-0000-4000-8000-000000000011', 'channel_code', 'WALK_IN', 'interest_code', 'BUY',
    'first_name', 'ก', 'line_id', 'noline', 'privacy_notice_ack', true))$$, 'Q03 WALK_IN ไม่มีเบอร์โทร', '22023');
SELECT test.api_invalid($$SELECT api.quick_capture(jsonb_build_object(
    'branch_id', '7b000000-0000-4000-8000-000000000011', 'channel_code', 'WALK_IN', 'interest_code', 'BUY',
    'first_name', 'ก', 'phone', '090-000-0003'))$$, 'Q04 ไม่ติ๊กแจ้งประกาศความเป็นส่วนตัว', 'P0001');
SELECT test.api_invalid($$SELECT api.quick_capture(jsonb_build_object(
    'branch_id', '7b000000-0000-4000-8000-000000000011', 'channel_code', 'WALK_IN', 'interest_code', 'BUY',
    'first_name', 'ก', 'phone', '090-000-0004', 'privacy_notice_ack', true,
    'marketing', jsonb_build_object('granted', true, 'channels', jsonb_build_array('LINE'))))$$,
    'Q05 ยินยอมรับข่าวสารโดยไม่ติ๊กอายุ', 'P0001');

SELECT test.put('qc1', (test.jcall($$SELECT api.quick_capture(jsonb_build_object(
    'branch_id', '7b000000-0000-4000-8000-000000000011', 'channel_code', 'WALK_IN', 'interest_code', 'BUY',
    'first_name', 'ปิยะ', 'last_name', 'ลูกค้าใหม่', 'phone', '091-555-6666', 'line_id', '@PiyaNew',
    'province_code', 'TH-10', 'source_code', 'PASSING_BY', 'privacy_notice_ack', true, 'open_visit', true,
    'visit_mode', 'QUEUE', 'party_size', 2, 'note', 'ลูกค้าเดินเข้ามาสอบถาม',
    'marketing', jsonb_build_object('granted', true, 'channels', jsonb_build_array('LINE'), 'age_ack', true)))$$)) ->> 'customer_id');
SELECT test.assert_true(test.get('qc1') IS NOT NULL, 'Q06 quick_capture สร้างลูกค้าได้');
SELECT test.logout();
SELECT test.assert_eq((SELECT c.customer_no ~ '^CUS-[0-9]{4}-[0-9]{6}$' FROM crm.customers c WHERE c.id = test.get('qc1')::uuid),
    true, 'Q07 เลขลูกค้าตามรูป CUS-YYYY-NNNNNN');
SELECT test.assert_eq((SELECT count(*) FROM crm.customer_contacts ct WHERE ct.customer_id = test.get('qc1')::uuid), 2::bigint,
    'Q08 บันทึกช่องทางติดต่อ 2 รายการ');
SELECT test.assert_eq((SELECT ct.value_masked FROM crm.customer_contacts ct
                       WHERE ct.customer_id = test.get('qc1')::uuid AND ct.contact_type = 'PHONE'), '091-XXX-6666',
    'Q09 ค่า masked ของเบอร์ถูกต้อง (ข้อ 6.4)');
SELECT test.assert_eq((SELECT ct.value_normalized FROM crm.customer_contacts ct
                       WHERE ct.customer_id = test.get('qc1')::uuid AND ct.contact_type = 'LINE_ID'), 'piyanew',
    'Q10 LINE ID normalize ตัด @ และเป็นตัวพิมพ์เล็ก');
SELECT test.assert_eq((SELECT string_agg(cs.purpose_code || '=' || cs.status, ',' ORDER BY cs.purpose_code)
                       FROM crm.customer_consents cs WHERE cs.customer_id = test.get('qc1')::uuid),
    'MARKETING=GRANTED,PRIVACY_NOTICE=GRANTED', 'Q11 บันทึกความยินยอมสองรายการ');
SELECT test.assert_true((SELECT cs.evidence LIKE '%อายุ 20 ปีขึ้นไป%' FROM crm.customer_consents cs
                         WHERE cs.customer_id = test.get('qc1')::uuid AND cs.purpose_code = 'MARKETING'),
    'Q12 ธงอายุอยู่ใน evidence (19.4 ข้อ 3)');
SELECT test.assert_eq((SELECT count(*) FROM crm.customer_branches cb WHERE cb.customer_id = test.get('qc1')::uuid
                         AND cb.branch_id = '7b000000-0000-4000-8000-000000000011'), 1::bigint,
    'Q13 ผูกลูกค้ากับสาขาที่สร้าง');
SELECT test.assert_eq((SELECT v.status::text || '/' || v.queue_no::text FROM crm.visits v
                       WHERE v.customer_id = test.get('qc1')::uuid), 'WAITING/3', 'Q14 เปิด visit เข้าคิวพร้อมเลขคิว');
SELECT test.assert_eq((SELECT count(*) FROM crm.interactions i JOIN crm.visits v ON v.id = i.visit_id
                       WHERE v.customer_id = test.get('qc1')::uuid AND i.is_visit_root), 1::bigint,
    'Q15 มี interaction ต้นทาง 1 รายการ (ข้อ 3.3)');
SELECT test.assert_eq((SELECT l.status::text || '/' || l.next_action FROM crm.leads l WHERE l.customer_id = test.get('qc1')::uuid),
    'CONTACTED/ติดต่อกลับลูกค้า', 'Q16 lead อัตโนมัติของช่องทางสด เริ่มที่ CONTACTED (ข้อ 4.3)');
SELECT test.assert_eq((SELECT count(*) FROM crm.customer_notes n WHERE n.customer_id = test.get('qc1')::uuid), 1::bigint,
    'Q17 บันทึกโน้ตแรก');

-- ความสนใจที่ไม่สร้าง lead (REPAIR)
SELECT test.login_as('api.a06@test.example.com', 'aal1');
SELECT test.put('qc2', (test.jcall($$SELECT api.quick_capture(jsonb_build_object(
    'branch_id', '7b000000-0000-4000-8000-000000000011', 'channel_code', 'LINE', 'interest_code', 'REPAIR',
    'nickname', 'ช่างซ่อม', 'line_id', 'repair_only', 'privacy_notice_ack', true))$$)) ->> 'customer_id');
SELECT test.logout();
SELECT test.assert_eq((SELECT count(*) FROM crm.leads l WHERE l.customer_id = test.get('qc2')::uuid), 0::bigint,
    'Q18 REPAIR ไม่สร้าง lead (ข้อ 5.3)');
SELECT test.assert_eq((SELECT count(*) FROM crm.visits v WHERE v.customer_id = test.get('qc2')::uuid), 0::bigint,
    'Q19 โหมด "เพิ่มลูกค้า" ไม่เปิด visit (ข้อ 6.2 ข้อ 2)');
SELECT test.assert_eq((SELECT cs.captured_via::text FROM crm.customer_consents cs
                       WHERE cs.customer_id = test.get('qc2')::uuid AND cs.purpose_code = 'PRIVACY_NOTICE'), 'LINK_SENT',
    'Q20 ช่องทางออนไลน์บันทึกประกาศแบบ LINK_SENT (ข้อ 10.2)');

-- Phase 1 ปิดการสร้าง lead อัตโนมัติด้วย create_lead = false (ข้อ 20.12 · D52)
SELECT test.login_as('api.a06@test.example.com', 'aal1');
SELECT test.put('qc3', (test.jcall($$SELECT api.quick_capture(jsonb_build_object(
    'branch_id', '7b000000-0000-4000-8000-000000000011', 'channel_code', 'WALK_IN', 'interest_code', 'BUY',
    'first_name', 'ไม่สร้างลีด', 'phone', '092-777-8888', 'privacy_notice_ack', true,
    'create_lead', false))$$)) ->> 'customer_id');
SELECT test.logout();
SELECT test.assert_eq((SELECT count(*) FROM crm.leads l WHERE l.customer_id = test.get('qc3')::uuid), 0::bigint,
    'Q20a create_lead = false ไม่สร้าง lead แม้ความสนใจจะ creates_lead = true');
SELECT test.assert_eq((SELECT count(*) FROM crm.tasks t WHERE t.customer_id = test.get('qc3')::uuid), 0::bigint,
    'Q20b ไม่มี lead จึงไม่มีงานติดตามค้างที่ไม่มีหน้าจอให้ปิดใน Phase 1');
SELECT test.assert_eq((SELECT count(*) FROM crm.customer_contacts ct WHERE ct.customer_id = test.get('qc3')::uuid), 1::bigint,
    'Q20c ลูกค้าและช่องทางติดต่อยังถูกสร้างตามปกติ');

-- ลูกค้าซ้ำ: เบอร์เดียวกับ CUS-1996-000001
SELECT test.login_as('api.a06@test.example.com', 'aal1');
SELECT test.api_invalid($$SELECT api.quick_capture(jsonb_build_object(
    'branch_id', '7b000000-0000-4000-8000-000000000011', 'channel_code', 'WALK_IN', 'interest_code', 'BUY',
    'first_name', 'สมหญิง', 'last_name', 'ทดสอบเอพีไอ', 'phone', '081-111-2222', 'privacy_notice_ack', true))$$,
    'Q21 พบผู้สมัครคะแนน ≥ 70 แต่ไม่ส่งเหตุผล override', 'P0001');
SELECT test.put('qc3', (test.jcall($$SELECT api.quick_capture(jsonb_build_object(
    'branch_id', '7b000000-0000-4000-8000-000000000011', 'channel_code', 'WALK_IN', 'interest_code', 'BUY',
    'first_name', 'สมหญิง', 'last_name', 'ทดสอบเอพีไอ', 'phone', '081-111-2222', 'privacy_notice_ack', true,
    'duplicate_override_reason_code', 'FAMILY_SHARED_PHONE'))$$)) ->> 'customer_id');
SELECT test.logout();
SELECT test.assert_eq((SELECT d.score::text || '/' || d.status::text || '/' || d.candidate_customer_id::text
                       FROM crm.duplicate_decisions d WHERE d.customer_id = test.get('qc3')::uuid),
    '100/PENDING/7b000000-0000-4000-8000-000000000201', 'Q22 สร้างแถว duplicate_decisions PENDING คู่กับผู้สมัครคะแนนสูงสุด');

-- =====================================================================================
-- D · api.find_customer_candidates (ข้อ 6.5)
-- =====================================================================================
SELECT test.login_as('api.a10@test.example.com', 'aal2');          -- MARKETING ไม่มี customer.create
SELECT test.api_denied($$SELECT api.find_customer_candidates(NULL, '081-111-2222', NULL, NULL, NULL, NULL)$$,
    'D01 MARKETING ไม่มีสิทธิ์ตรวจซ้ำ');
SELECT test.login_as('api.a06@test.example.com', 'aal1');
SELECT test.api_invalid($$SELECT api.find_customer_candidates(NULL, NULL, NULL, NULL, 'สมหญิง', 'ทดสอบเอพีไอ')$$,
    'D02 ส่งแต่ชื่ออย่างเดียวไม่ได้', '22023');
SELECT test.assert_eq((test.jcall($$SELECT api.find_customer_candidates(NULL, '081-111-2222', NULL, NULL, NULL, NULL)$$) ->> 'count')::integer,
    2, 'D03 เบอร์ตรงกัน พบผู้สมัคร 2 ราย (รวมลูกค้าที่สร้างใหม่ด้วยเบอร์เดียวกัน)');
SELECT test.put('cand_in', (SELECT e::text FROM jsonb_array_elements(
    test.jcall($$SELECT api.find_customer_candidates(NULL, '081-111-2222', NULL, NULL, NULL, NULL)$$) -> 'candidates') e
    WHERE e ->> 'customer_no' = 'CUS-1996-000001'));
SELECT test.assert_eq((test.get('cand_in')::jsonb ->> 'score')::integer, 100, 'D04 คะแนนเบอร์ตรงกัน = 100 (ข้อ 6.5)');
SELECT test.assert_eq((test.get('cand_in')::jsonb ->> 'in_scope')::boolean, true, 'D05 ลูกค้าในขอบเขต = การ์ดเต็ม');
SELECT test.assert_eq(test.get('cand_in')::jsonb ->> 'lifecycle_stage', 'IDENTIFIED', 'D05b การ์ดเต็มคืน lifecycle');

SELECT test.login_as('api.a08@test.example.com', 'aal1');          -- STAFF@TA2 เห็นเป็นการ์ดย่อ
SELECT test.put('cand_out', (SELECT e::text FROM jsonb_array_elements(
    test.jcall($$SELECT api.find_customer_candidates('7b000000-0000-4000-8000-000000000303', '081-111-2222', NULL, NULL, NULL, NULL)$$)
    -> 'candidates') e WHERE e ->> 'customer_no' = 'CUS-1996-000001'));
SELECT test.assert_eq((test.get('cand_out')::jsonb ->> 'in_scope')::boolean, false, 'D06 ลูกค้านอกขอบเขต = การ์ดย่อ');
SELECT test.assert_eq(test.get('cand_out')::jsonb ->> 'display_name', 'สมหญิง ท.', 'D07 การ์ดย่อแสดงนามสกุลย่อ');
SELECT test.assert_eq(test.get('cand_out')::jsonb ->> 'value_masked', '081-XXX-2222',
    'D08 การ์ดย่อแสดงเบอร์ปิดบังเฉพาะเมื่อตรงด้วยเบอร์');
SELECT test.assert_true((test.get('cand_out')::jsonb -> 'lifecycle_stage') IS NULL, 'D09 การ์ดย่อไม่คืน lifecycle');
SELECT test.api_denied($$SELECT api.find_customer_candidates('7b000000-0000-4000-8000-000000000301', '081-111-2222', NULL, NULL, NULL, NULL)$$,
    'D10 visit ของสาขาอื่นใช้ตรวจซ้ำไม่ได้');
SELECT test.logout();
SELECT test.assert_true((SELECT count(*) > 0 FROM audit.access_logs a
                         WHERE a.organization_id = '7b000000-0000-4000-8000-000000000001' AND a.action = 'CUSTOMER_CANDIDATE_SEARCH'
                           AND a.actor_staff_id = '7b000000-0000-4000-8000-000000000106'
                           AND a.search_hashes[1] ~ '^[0-9a-f]{64}$'), 'D11 access log เก็บ sha256 ไม่เก็บค่าจริง');

-- =====================================================================================
-- L · api.link_customer_to_branch (ข้อ 6.6)
-- =====================================================================================
SELECT test.login_as('api.a08@test.example.com', 'aal1');
SELECT test.assert_eq((test.jcall($$SELECT api.link_customer_to_branch('7b000000-0000-4000-8000-000000000201',
                        '7b000000-0000-4000-8000-000000000303')$$) ->> 'ok')::boolean, true,
    'L01 ผูกลูกค้าเข้าสาขาของ visit หลังตรวจซ้ำภายใน 30 นาที');
SELECT test.logout();
SELECT test.assert_eq((SELECT count(*) FROM crm.customer_branches cb
                       WHERE cb.customer_id = '7b000000-0000-4000-8000-000000000201'
                         AND cb.branch_id = '7b000000-0000-4000-8000-000000000012' AND cb.linked_via = 'MANUAL_LINK'),
    1::bigint, 'L02 เพิ่มแถว customer_branches ด้วย MANUAL_LINK');
SELECT test.assert_eq((SELECT v.customer_id FROM crm.visits v WHERE v.id = '7b000000-0000-4000-8000-000000000303'),
    '7b000000-0000-4000-8000-000000000201'::uuid, 'L03 ตั้ง visits.customer_id ในทรานแซกชันเดียวกัน');
SELECT test.assert_eq((SELECT i.customer_id FROM crm.interactions i WHERE i.id = '7b000000-0000-4000-8000-000000000402'),
    '7b000000-0000-4000-8000-000000000201'::uuid, 'L04 ส่งลูกค้าต่อให้ interaction ต้นทาง');
SELECT test.assert_eq((SELECT count(*) FROM audit.access_logs a WHERE a.organization_id = '7b000000-0000-4000-8000-000000000001' AND a.action = 'CUSTOMER_LINKED_TO_BRANCH'
                         AND a.customer_id = '7b000000-0000-4000-8000-000000000201'), 1::bigint,
    'L05 เขียน access log CUSTOMER_LINKED_TO_BRANCH');
SELECT test.login_as('api.a08@test.example.com', 'aal1');
SELECT test.api_invalid($$SELECT api.link_customer_to_branch('7b000000-0000-4000-8000-000000000201',
                        '7b000000-0000-4000-8000-000000000303')$$, 'L06 visit ที่ระบุลูกค้าแล้วผูกซ้ำไม่ได้', 'P0001');
SELECT test.login_as('api.a07@test.example.com', 'aal1');          -- ไม่ได้เรียก find_customer_candidates
SELECT test.api_denied($$SELECT api.link_customer_to_branch('7b000000-0000-4000-8000-000000000202',
                        '7b000000-0000-4000-8000-000000000302')$$, 'L07 ต้องมาจากผลตรวจซ้ำของผู้เรียกเอง');

-- =====================================================================================
-- S · api.search_customers (ข้อ 6.5)
-- =====================================================================================
SELECT test.login_as('api.a06@test.example.com', 'aal1');
SELECT test.api_invalid($$SELECT api.search_customers('ab')$$, 'S01 คำค้นสั้นกว่า 3 ตัวอักษร', '22023');
SELECT test.assert_eq((test.jcall($$SELECT api.search_customers('081-111-2222')$$) -> 'groups' -> 'customers' -> 0 ->> 'customer_no'),
    'CUS-1996-000001', 'S02 ค้นด้วยเบอร์แบบตรงทั้งค่า');
SELECT test.assert_eq((test.jcall($$SELECT api.search_customers('081-111-2222')$$) -> 'groups' -> 'customers' -> 0 ->> 'value_masked'),
    '081-XXX-2222', 'S03 ผลลัพธ์คืนค่า contact แบบปิดบัง');
SELECT test.assert_eq((test.jcall($$SELECT api.search_customers('CUS-1996-000001')$$) -> 'groups' -> 'customers' -> 0 ->> 'customer_no'),
    'CUS-1996-000001', 'S04 ค้นด้วยเลขลูกค้า');
SELECT test.login_as('api.a09@test.example.com', 'aal2');          -- BM@TA2 (ยังไม่เห็นลูกค้า TA1 ก่อน link… ตอนนี้ผูกแล้ว)
SELECT test.assert_eq(jsonb_array_length(test.jcall($$SELECT api.search_customers('082-333-4444')$$) -> 'groups' -> 'customers'),
    0, 'S05 ลูกค้าที่ยังไม่เชื่อมสาขาของผู้เรียก ค้นไม่พบ');

-- =====================================================================================
-- C · api.get_customer_360 (ข้อ 6.8)
-- =====================================================================================
SELECT test.login_as('api.a06@test.example.com', 'aal1');
SELECT test.assert_eq((test.jcall($$SELECT api.get_customer_360('7b000000-0000-4000-8000-000000000201')$$)
                       -> 'header' ->> 'customer_no'), 'CUS-1996-000001', 'C01 STAFF เจ้าของลูกค้าเปิด Customer 360 ได้');
SELECT test.assert_eq((test.jcall($$SELECT api.get_customer_360('7b000000-0000-4000-8000-000000000201')$$)
                       -> 'counters' ->> 'interaction_count')::integer, 2,
    'C02 ตัวนับการติดต่อ = interaction ที่ไม่ใช่ INTERNAL (ข้อ 3.3 ข้อ 5 · รวมรายการที่ผูกจาก link_customer_to_branch)');
SELECT test.assert_eq((test.jcall($$SELECT api.get_customer_360('7b000000-0000-4000-8000-000000000201')$$)
                       -> 'contacts' -> 0 ->> 'value_masked'), '081-XXX-2222', 'C03 ช่องทางติดต่อคืนค่าปิดบัง');
SELECT test.login_as('api.a07@test.example.com', 'aal1');          -- STAFF@TA1 แต่ไม่ใช่เจ้าของ → customer.read เป็น B จึงอ่านได้
SELECT test.assert_eq((test.jcall($$SELECT api.get_customer_360('7b000000-0000-4000-8000-000000000201')$$) ->> 'ok')::boolean,
    true, 'C04 STAFF สาขาเดียวกันอ่านได้ (customer.read = B)');
SELECT test.login_as('api.a10@test.example.com', 'aal2');          -- MARKETING ไม่มี customer.read
SELECT test.api_denied($$SELECT api.get_customer_360('7b000000-0000-4000-8000-000000000201')$$,
    'C05 MARKETING เปิดข้อมูลลูกค้ารายคนไม่ได้');
SELECT test.logout();
SELECT test.assert_true((SELECT count(*) >= 2 FROM audit.access_logs a WHERE a.organization_id = '7b000000-0000-4000-8000-000000000001' AND a.action = 'CUSTOMER_VIEWED'
                           AND a.customer_id = '7b000000-0000-4000-8000-000000000201'), 'C06 เขียน CUSTOMER_VIEWED ทุกครั้ง');

-- =====================================================================================
-- R · api.reveal_contact · api.reveal_address (ข้อ 6.4)
-- =====================================================================================
SELECT test.login_as('api.a06@test.example.com', 'aal1');
SELECT test.api_invalid($$SELECT api.reveal_contact('7b000000-0000-4000-8000-000000000c01', 'SMS')$$,
    'R01 purpose นอกชุดที่กำหนด', '22023');
SELECT test.assert_eq((test.jcall($$SELECT api.reveal_contact('7b000000-0000-4000-8000-000000000c01', 'CALL')$$) ->> 'value_raw'),
    '081-111-2222', 'R02 STAFF เปิดค่าเต็มได้ (customer.pii.reveal = B)');
SELECT test.assert_eq((test.jcall($$SELECT api.reveal_address('7b000000-0000-4000-8000-000000000c21', 'VIEW')$$) ->> 'address_line'),
    '1/1 ถนนทดสอบ', 'R03 เปิดที่อยู่เต็มได้');
SELECT test.login_as('api.a08@test.example.com', 'aal1');
SELECT test.api_denied($$SELECT api.reveal_contact('7b000000-0000-4000-8000-000000000c03', 'VIEW')$$,
    'R04 STAFF สาขาอื่นเปิดค่าเต็มไม่ได้');
SELECT test.logout();
SELECT test.assert_eq((SELECT count(*) FROM audit.access_logs a WHERE a.organization_id = '7b000000-0000-4000-8000-000000000001' AND a.action = 'CONTACT_REVEALED'
                         AND a.contact_id = '7b000000-0000-4000-8000-000000000c01' AND a.purpose = 'CALL'), 1::bigint,
    'R05 เขียน CONTACT_REVEALED พร้อม purpose');
UPDATE app.settings SET value = '1' WHERE key = 'security.reveal_per_hour';
SELECT test.login_as('api.a07@test.example.com', 'aal1');
SELECT test.assert_eq((test.jcall($$SELECT api.reveal_contact('7b000000-0000-4000-8000-000000000c01', 'VIEW')$$) ->> 'ok')::boolean,
    true, 'R06 ครั้งแรกภายในเพดานยังเปิดได้');
SELECT test.assert_eq((test.jcall($$SELECT api.reveal_contact('7b000000-0000-4000-8000-000000000c01', 'VIEW')$$) ->> 'code'),
    'REVEAL_LIMIT_EXCEEDED', 'R07 เกินเพดานคืนผลปฏิเสธโดยไม่ raise (ข้อ 6.4 v2.2)');
SELECT test.logout();
SELECT test.assert_eq((SELECT count(*) FROM crm.notifications n
                       WHERE n.organization_id = '7b000000-0000-4000-8000-000000000001' AND n.code = 'REVEAL_LIMIT_EXCEEDED'
                         AND n.recipient_staff_id IN ('7b000000-0000-4000-8000-000000000102', '7b000000-0000-4000-8000-000000000112')),
    2::bigint, 'R08 แจ้ง REVEAL_LIMIT_EXCEEDED ให้ BUSINESS_ADMIN ทุกคน');
UPDATE app.settings SET value = '30' WHERE key = 'security.reveal_per_hour';

-- =====================================================================================
-- W · api.save_contact · api.save_address · api.record_consent
-- =====================================================================================
SELECT test.login_as('api.a07@test.example.com', 'aal1');          -- STAFF@TA1 ที่ไม่ใช่ owner → customer.update = O
SELECT test.api_denied($$SELECT api.save_contact(jsonb_build_object('customer_id', '7b000000-0000-4000-8000-000000000201',
    'contact_type', 'PHONE', 'value', '099-999-9999'))$$, 'W01 STAFF ที่ไม่ใช่ผู้ดูแลแก้ช่องทางติดต่อไม่ได้');
SELECT test.login_as('api.a06@test.example.com', 'aal1');
SELECT test.put('ct1', (test.jcall($$SELECT api.save_contact(jsonb_build_object(
    'customer_id', '7b000000-0000-4000-8000-000000000201', 'contact_type', 'PHONE', 'value', '02-111-2222',
    'is_primary', true))$$)) ->> 'contact_id');
SELECT test.assert_eq((SELECT ct.value_masked FROM crm.customer_contacts ct WHERE ct.id = test.get('ct1')::uuid),
    '02-XXX-2222', 'W02 เพิ่มเบอร์บ้านและปิดบังตามข้อ 6.4');
SELECT test.assert_eq((test.jcall($$SELECT api.save_address(jsonb_build_object(
    'customer_id', '7b000000-0000-4000-8000-000000000201', 'address_line', '9/9 ถนนใหม่',
    'district', 'ปทุมวัน', 'province_code', 'TH-10'))$$) ->> 'value_masked'), 'ปทุมวัน · กรุงเทพมหานคร',
    'W03 ที่อยู่ใหม่แสดงระดับอำเภอ/จังหวัด (19.1 ข้อ 5)');
SELECT test.api_invalid($$SELECT api.record_consent(jsonb_build_object('customer_id', '7b000000-0000-4000-8000-000000000201',
    'purpose_code', 'MARKETING', 'status', 'GRANTED', 'channels', jsonb_build_array('SMS')))$$,
    'W04 MARKETING GRANTED ต้องมีธงอายุ', 'P0001');
SELECT test.assert_eq((test.jcall($$SELECT api.record_consent(jsonb_build_object('customer_id', '7b000000-0000-4000-8000-000000000201',
    'purpose_code', 'MARKETING', 'status', 'GRANTED', 'channels', jsonb_build_array('SMS'), 'age_ack', true))$$) ->> 'ok')::boolean,
    true, 'W05 บันทึกความยินยอมได้ (customer.consent.manage = B)');
SELECT test.logout();
SELECT test.assert_eq((SELECT cc.status::text FROM crm.customer_consent_current cc
                       WHERE cc.customer_id = '7b000000-0000-4000-8000-000000000201' AND cc.purpose_code = 'MARKETING'),
    'GRANTED', 'W06 view ความยินยอมปัจจุบันเห็นแถวล่าสุด');

-- =====================================================================================
-- M · api.merge_customers · api.decide_duplicate (ข้อ 6.7)
-- =====================================================================================
SELECT test.login_as('api.a06@test.example.com', 'aal1');
SELECT test.api_denied($$SELECT api.merge_customers('7b000000-0000-4000-8000-000000000201',
    '7b000000-0000-4000-8000-000000000203', '{}'::jsonb, 'ทดสอบ', NULL)$$, 'M01 STAFF ไม่มี customer.merge');
SELECT test.login_as('api.a04@test.example.com', 'aal1');          -- BM@TA1 ที่ aal1 → บทบาทไม่นับ
SELECT test.api_denied($$SELECT api.merge_customers('7b000000-0000-4000-8000-000000000201',
    '7b000000-0000-4000-8000-000000000203', '{}'::jsonb, 'ทดสอบ', NULL)$$, 'M02 BRANCH_MANAGER ที่ aal1 รวมลูกค้าไม่ได้');
SELECT test.login_as('api.a04@test.example.com', 'aal2');
SELECT test.put('mg1', (test.jcall($$SELECT api.merge_customers('7b000000-0000-4000-8000-000000000201',
    '7b000000-0000-4000-8000-000000000203', jsonb_build_object('last_name', 'MERGED'), 'ลูกค้าคนเดียวกัน', NULL)$$)) ->> 'merge_no');
SELECT test.logout();
SELECT test.assert_true(test.get('mg1') ~ '^MG-[0-9]{4}-[0-9]{6}$', 'M03 ออกเลขการรวมลูกค้า MG-YYYY-NNNNNN');
SELECT test.assert_eq((SELECT c.record_status::text || '/' || (c.merged_into_id = '7b000000-0000-4000-8000-000000000201')::text
                       FROM crm.customers c WHERE c.id = '7b000000-0000-4000-8000-000000000203'),
    'MERGED/true', 'M04 ผู้ถูกรวมเปลี่ยนเป็น MERGED + merged_into_id');
SELECT test.assert_eq((SELECT c.last_name FROM crm.customers c WHERE c.id = '7b000000-0000-4000-8000-000000000201'),
    'รวมทดสอบ', 'M05 field_choices เลือกค่าจากรายที่ถูกรวมได้');
SELECT test.assert_eq((SELECT count(*) FROM crm.customer_contacts ct
                       WHERE ct.customer_id = '7b000000-0000-4000-8000-000000000201' AND ct.value_normalized = '+66823334444'),
    1::bigint, 'M06 ย้ายช่องทางติดต่อมาที่ survivor');
SELECT test.assert_true((SELECT (m.snapshot -> 'merged' -> 'contacts' -> 0 ->> 'value_masked') = '082-XXX-4444'
                         FROM crm.customer_merges m WHERE m.merge_no = test.get('mg1')),
    'M07 snapshot เก็บค่าปิดบัง (ข้อ 9.5)');
SELECT test.login_as('api.a04@test.example.com', 'aal2');
SELECT test.api_denied($$SELECT api.merge_customers('7b000000-0000-4000-8000-000000000201',
    '7b000000-0000-4000-8000-000000000203', '{}'::jsonb, 'ซ้ำ', NULL)$$,
    'M08 รวมลูกค้าที่ MERGED แล้วไม่ได้ (JCRM-T02 · 19.3 ข้อ 7)');
SELECT test.api_invalid($$SELECT api.decide_duplicate((SELECT d.id FROM crm.duplicate_decisions d
                          WHERE d.customer_id = test.get('qc3')::uuid), 'MERGED', NULL)$$,
    'M09 decide_duplicate รับเฉพาะ NOT_DUPLICATE', 'P0001');
SELECT test.assert_eq((test.jcall($$SELECT api.decide_duplicate((SELECT d.id FROM crm.duplicate_decisions d
                          WHERE d.customer_id = test.get('qc3')::uuid), 'NOT_DUPLICATE', 'คนละคนจริง')$$) ->> 'status'),
    'NOT_DUPLICATE', 'M10 ยืนยันคนละคนได้ (ผู้ตัดสิน ≠ ผู้สร้าง)');
SELECT test.logout();

-- =====================================================================================
-- X · กรณีปฏิเสธเพิ่มเติม (อย่างน้อยหนึ่ง deny ต่อ RPC) และเพดานการค้นหา
-- =====================================================================================
SELECT test.login_as('api.a10@test.example.com', 'aal2');          -- MARKETING ไม่มี customer.pii.reveal / consent.manage
SELECT test.api_denied($$SELECT api.reveal_address('7b000000-0000-4000-8000-000000000c21', 'VIEW')$$,
    'X01 MARKETING เปิดที่อยู่เต็มไม่ได้');
SELECT test.api_denied($$SELECT api.record_consent(jsonb_build_object('customer_id', '7b000000-0000-4000-8000-000000000201',
    'purpose_code', 'PRIVACY_NOTICE', 'status', 'GRANTED'))$$, 'X02 MARKETING บันทึกความยินยอมไม่ได้');
SELECT test.login_as('api.a07@test.example.com', 'aal1');          -- STAFF@TA1 ที่ไม่ใช่ผู้ดูแล
SELECT test.api_denied($$SELECT api.save_address(jsonb_build_object('customer_id', '7b000000-0000-4000-8000-000000000201',
    'address_line', '5/5 ถนนแอบแก้'))$$, 'X03 STAFF ที่ไม่ใช่ผู้ดูแลแก้ที่อยู่ไม่ได้');
SELECT test.api_denied($$SELECT api.decide_duplicate((SELECT d.id FROM crm.duplicate_decisions d LIMIT 1), 'NOT_DUPLICATE', NULL)$$,
    'X04 STAFF ไม่มี customer.merge จึงตัดสินข้อมูลซ้ำไม่ได้');
SELECT test.logout();
UPDATE app.settings SET value = '1' WHERE key = 'security.search_per_hour';
SELECT test.login_as('api.a07@test.example.com', 'aal1');
SELECT test.assert_eq((test.jcall($$SELECT api.search_customers('081-111-2222')$$) ->> 'ok')::boolean, true,
    'X05 ค้นหาครั้งแรกภายในเพดาน');
SELECT test.assert_eq((test.jcall($$SELECT api.search_customers('081-111-2222')$$) ->> 'code'), 'SEARCH_LIMIT_EXCEEDED',
    'X06 เกิน security.search_per_hour → ปฏิเสธโดยไม่ raise + แจ้ง BUSINESS_ADMIN (ข้อ 6.5)');
SELECT test.assert_eq((test.jcall($$SELECT api.find_customer_candidates(NULL, '081-111-2222', NULL, NULL, NULL, NULL)$$) ->> 'code'),
    'SEARCH_LIMIT_EXCEEDED', 'X07 ตัวนับเดียวกันมีผลกับการตรวจซ้ำด้วย');
SELECT test.logout();
SELECT test.assert_true((SELECT count(*) > 0 FROM crm.notifications n WHERE n.organization_id = '7b000000-0000-4000-8000-000000000001' AND n.code = 'SEARCH_LIMIT_EXCEEDED'),
    'X08 แจ้ง SEARCH_LIMIT_EXCEEDED ให้ BUSINESS_ADMIN');
UPDATE app.settings SET value = '60' WHERE key = 'security.search_per_hour';
