-- =====================================================================================
-- supabase/tests/api_02_work.sql — RPC งานหน้าร้านของ migration 0011_api.sql
--   api.open_visit · api.close_visit · api.acknowledge_unrecorded_visit · api.convert_lead · api.assign_owner
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

-- fixture เพิ่มของไฟล์นี้: visit ที่ระบบปิดแบบ UNRECORDED · lead · opportunity · task
INSERT INTO crm.visits (id, organization_id, visit_no, branch_id, channel_code, status, queue_no, customer_id, interest_code,
                        started_at, service_started_at, ended_at, owner_staff_id, outcome_code, closed_by_system, created_at, created_by) VALUES
    ('7b000000-0000-4000-8000-000000000304', '7b000000-0000-4000-8000-000000000001', 'V-TA1-960101-004', '7b000000-0000-4000-8000-000000000011', 'WALK_IN', 'COMPLETED', 4, NULL, 'BUY', now() - interval '2 days', now() - interval '2 days', now() - interval '47 hours', '7b000000-0000-4000-8000-000000000106', 'UNRECORDED', true, now() - interval '2 days', '7b000000-0000-4000-8000-000000000106'),
    ('7b000000-0000-4000-8000-000000000305', '7b000000-0000-4000-8000-000000000001', 'V-TA1-960101-005', '7b000000-0000-4000-8000-000000000011', 'WALK_IN', 'IN_SERVICE', 5, '7b000000-0000-4000-8000-000000000201', 'BUY', now() - interval '15 minutes', now() - interval '15 minutes', NULL, '7b000000-0000-4000-8000-000000000106', NULL, false, now() - interval '15 minutes', '7b000000-0000-4000-8000-000000000106'),
    ('7b000000-0000-4000-8000-000000000306', '7b000000-0000-4000-8000-000000000001', 'V-TA1-960101-006', '7b000000-0000-4000-8000-000000000011', 'WALK_IN', 'WAITING',    6, NULL, 'REPAIR', now() - interval '3 minutes', NULL, NULL, NULL, NULL, false, now() - interval '3 minutes', '7b000000-0000-4000-8000-000000000106'),
    ('7b000000-0000-4000-8000-000000000307', '7b000000-0000-4000-8000-000000000001', 'V-TA1-960101-007', '7b000000-0000-4000-8000-000000000011', 'WALK_IN', 'IN_SERVICE', 7, NULL, 'BUY', now() - interval '12 minutes', now() - interval '12 minutes', NULL, '7b000000-0000-4000-8000-000000000106', NULL, false, now() - interval '12 minutes', '7b000000-0000-4000-8000-000000000106'),
    ('7b000000-0000-4000-8000-000000000308', '7b000000-0000-4000-8000-000000000001', 'V-TA1-960101-008', '7b000000-0000-4000-8000-000000000011', 'WALK_IN', 'IN_SERVICE', 8, '7b000000-0000-4000-8000-000000000201', 'BUY', now() - interval '11 minutes', now() - interval '11 minutes', NULL, '7b000000-0000-4000-8000-000000000106', NULL, false, now() - interval '11 minutes', '7b000000-0000-4000-8000-000000000106');
INSERT INTO crm.interactions (organization_id, customer_id, visit_id, is_visit_root, branch_id, channel_code, direction,
                              interaction_type_code, occurred_at, owner_staff_id, created_by) VALUES
    ('7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000201', '7b000000-0000-4000-8000-000000000305', true, '7b000000-0000-4000-8000-000000000011', 'WALK_IN', 'INBOUND', 'VISIT', now() - interval '15 minutes', '7b000000-0000-4000-8000-000000000106', '7b000000-0000-4000-8000-000000000106'),
    ('7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000201', '7b000000-0000-4000-8000-000000000308', true, '7b000000-0000-4000-8000-000000000011', 'WALK_IN', 'INBOUND', 'VISIT', now() - interval '11 minutes', '7b000000-0000-4000-8000-000000000106', '7b000000-0000-4000-8000-000000000106');

INSERT INTO crm.leads (id, organization_id, lead_no, customer_id, branch_id, owner_staff_id, channel_code, interest_code, status,
                       priority_code, next_action, next_action_type_code, next_action_at, first_contacted_at, closed_at,
                       lost_reason_code, visit_id, created_at, created_by) VALUES
    ('7b000000-0000-4000-8000-000000000501', '7b000000-0000-4000-8000-000000000001', 'LD-1996-000001', '7b000000-0000-4000-8000-000000000201', '7b000000-0000-4000-8000-000000000011', NULL,                                   'LINE',    'BUY', 'NEW',       'NORMAL', 'ติดต่อกลับ', 'CALL', now() + interval '1 day', NULL, NULL, NULL, NULL, now() - interval '1 day', '7b000000-0000-4000-8000-000000000104'),
    ('7b000000-0000-4000-8000-000000000502', '7b000000-0000-4000-8000-000000000001', 'LD-1996-000002', '7b000000-0000-4000-8000-000000000201', '7b000000-0000-4000-8000-000000000011', '7b000000-0000-4000-8000-000000000106', 'WALK_IN', 'BUY', 'CONTACTED', 'NORMAL', 'ติดต่อกลับ', 'CALL', now() + interval '1 day', now() - interval '1 day', NULL, NULL, NULL, now() - interval '2 days', '7b000000-0000-4000-8000-000000000106'),
    ('7b000000-0000-4000-8000-000000000503', '7b000000-0000-4000-8000-000000000001', 'LD-1996-000003', '7b000000-0000-4000-8000-000000000201', '7b000000-0000-4000-8000-000000000011', '7b000000-0000-4000-8000-000000000106', 'WALK_IN', 'BUY', 'LOST',      'NORMAL', 'ติดต่อกลับ', 'CALL', now() - interval '1 day', now() - interval '3 days', now() - interval '1 day', 'PRICE', NULL, now() - interval '3 days', '7b000000-0000-4000-8000-000000000106'),
    ('7b000000-0000-4000-8000-000000000504', '7b000000-0000-4000-8000-000000000001', 'LD-1996-000004', '7b000000-0000-4000-8000-000000000201', '7b000000-0000-4000-8000-000000000011', '7b000000-0000-4000-8000-000000000106', 'WALK_IN', 'BUY', 'CONTACTED', 'NORMAL', 'ติดต่อกลับ', 'CALL', now() + interval '1 day', now() - interval '10 minutes', NULL, NULL, '7b000000-0000-4000-8000-000000000307', now() - interval '10 minutes', '7b000000-0000-4000-8000-000000000106');
INSERT INTO crm.opportunities (id, organization_id, opportunity_no, customer_id, origin_channel_code, branch_id, owner_staff_id,
                               stage, priority_code, next_action, next_action_type_code, next_action_at, created_at, created_by) VALUES
    ('7b000000-0000-4000-8000-000000000601', '7b000000-0000-4000-8000-000000000001', 'OP-1996-000001', '7b000000-0000-4000-8000-000000000201', 'WALK_IN', '7b000000-0000-4000-8000-000000000011', '7b000000-0000-4000-8000-000000000106', 'INTERESTED', 'NORMAL', 'โทรติดตาม', 'CALL', now() + interval '2 days', now() - interval '3 days', '7b000000-0000-4000-8000-000000000106');
INSERT INTO crm.tasks (id, organization_id, task_no, task_type_code, title, customer_id, lead_id, branch_id, owner_staff_id,
                       status, due_at, is_next_action, created_by) VALUES
    ('7b000000-0000-4000-8000-000000000801', '7b000000-0000-4000-8000-000000000001', 'TK-1996-000001', 'CALL', 'ติดต่อกลับ', '7b000000-0000-4000-8000-000000000201', '7b000000-0000-4000-8000-000000000502', '7b000000-0000-4000-8000-000000000011', '7b000000-0000-4000-8000-000000000106', 'OPEN', now() + interval '1 day', true, '7b000000-0000-4000-8000-000000000106'),
    ('7b000000-0000-4000-8000-000000000802', '7b000000-0000-4000-8000-000000000001', 'TK-1996-000002', 'OTHER', 'งานทั่วไป', '7b000000-0000-4000-8000-000000000201', NULL, '7b000000-0000-4000-8000-000000000011', '7b000000-0000-4000-8000-000000000106', 'OPEN', now() + interval '1 day', false, '7b000000-0000-4000-8000-000000000106');

UPDATE app.running_numbers SET last_value = 8 WHERE scope_key IN ('VISIT:TA1:' || to_char(app.bangkok_date(now()), 'YYYYMMDD'),
                                                                  'QUEUE:TA1:' || to_char(app.bangkok_date(now()), 'YYYYMMDD'));

SELECT set_config('app.bulk', 'off', true);


-- =====================================================================================
-- O · api.open_visit (ข้อ 3.3 · 19.3 ข้อ 1)
-- =====================================================================================
SELECT test.login_as('api.a08@test.example.com', 'aal1');          -- STAFF@TA2
SELECT test.api_denied($$SELECT api.open_visit(jsonb_build_object('branch_id', '7b000000-0000-4000-8000-000000000011',
    'channel_code', 'WALK_IN', 'interest_code', 'BUY'))$$, 'O01 เปิด visit ข้ามสาขาไม่ได้');
SELECT test.api_denied($$SELECT api.open_visit(jsonb_build_object('branch_id', '7b000000-0000-4000-8000-000000000012',
    'channel_code', 'WALK_IN', 'interest_code', 'BUY', 'customer_id', '7b000000-0000-4000-8000-000000000201'))$$,
    'O02 เปิด visit ให้ลูกค้าที่ยังไม่เชื่อมสาขาไม่ได้ (JCRM-T26 · ข้อ 8.0)');

SELECT test.login_as('api.a06@test.example.com', 'aal1');          -- STAFF@TA1
SELECT test.api_invalid($$SELECT api.open_visit(jsonb_build_object('branch_id', '7b000000-0000-4000-8000-000000000011',
    'channel_code', 'WALK_IN'))$$, 'O03 visit หน้าร้านต้องระบุวัตถุประสงค์', '22023');
SELECT test.put('ov1', (test.jcall($$SELECT api.open_visit(jsonb_build_object('branch_id', '7b000000-0000-4000-8000-000000000011',
    'channel_code', 'WALK_IN', 'interest_code', 'TRADE_IN', 'visit_mode', 'QUEUE', 'party_size', 1))$$)) ->> 'visit_id');
SELECT test.assert_eq((test.jcall($$SELECT api.open_visit(jsonb_build_object('branch_id', '7b000000-0000-4000-8000-000000000011',
    'channel_code', 'LINE', 'customer_id', '7b000000-0000-4000-8000-000000000201', 'summary', 'ทักมาทาง LINE'))$$) ->> 'attached')::boolean,
    false, 'O04 ช่องทางออนไลน์ที่ยังไม่มี visit เปิดอยู่ → เปิด visit ใหม่');
SELECT test.assert_eq((test.jcall($$SELECT api.open_visit(jsonb_build_object('branch_id', '7b000000-0000-4000-8000-000000000011',
    'channel_code', 'LINE', 'customer_id', '7b000000-0000-4000-8000-000000000201', 'summary', 'ข้อความที่สอง'))$$) ->> 'attached')::boolean,
    true, 'O05 ข้อความถัดไปของวันเดียวกันแนบเข้า visit เดิม (19.3 ข้อ 1)');
SELECT test.logout();
SELECT test.assert_eq((SELECT v.status::text || '/' || v.queue_no::text FROM crm.visits v WHERE v.id = test.get('ov1')::uuid),
    'WAITING/9', 'O06 "รับเข้าคิว" เปิด visit สถานะ WAITING พร้อมเลขคิวถัดไป');
SELECT test.assert_eq((SELECT count(*) FROM crm.interactions i WHERE i.visit_id = test.get('ov1')::uuid AND i.is_visit_root),
    1::bigint, 'O07 มี interaction ต้นทางเสมอ (ข้อ 3.3 ข้อ 1)');
SELECT test.assert_eq((SELECT count(*) FROM crm.interactions i
                       JOIN crm.visits v ON v.id = i.visit_id
                       WHERE v.channel_code = 'LINE' AND v.customer_id = '7b000000-0000-4000-8000-000000000201'), 2::bigint,
    'O08 visit ออนไลน์เดียวกันมี interaction 2 รายการ');
SELECT test.assert_eq((SELECT count(*) FROM crm.leads l WHERE l.visit_id = test.get('ov1')::uuid), 0::bigint,
    'O09 api.open_visit ไม่สร้าง lead อัตโนมัติ (19.3 ข้อ 1)');

-- =====================================================================================
-- CL · api.close_visit (ข้อ 4.1 · 4.2 · 19.3 ข้อ 3)
-- =====================================================================================
SELECT test.login_as('api.a07@test.example.com', 'aal1');          -- STAFF@TA1 ที่ไม่ใช่ผู้รับ (visit.update = O)
SELECT test.api_denied($$SELECT api.close_visit('7b000000-0000-4000-8000-000000000305', 'SERVICE_DONE', '{}'::jsonb)$$,
    'CL01 STAFF ที่ไม่ใช่ผู้รับปิด visit ไม่ได้');
SELECT test.login_as('api.a06@test.example.com', 'aal1');
SELECT test.api_invalid($$SELECT api.close_visit('7b000000-0000-4000-8000-000000000305', 'UNRECORDED', '{}'::jsonb)$$,
    'CL02 ผล UNRECORDED ระบบตั้งเท่านั้น', 'P0001');
SELECT test.api_denied($$SELECT api.close_visit('7b000000-0000-4000-8000-000000000306', 'SERVICE_DONE', '{}'::jsonb)$$,
    'CL03 visit ที่รอคิวปิดด้วยผลอื่นไม่ได้ (JCRM-T21)');
SELECT test.assert_eq((test.jcall($$SELECT api.close_visit('7b000000-0000-4000-8000-000000000306', 'LEFT_BEFORE_SERVICE', '{}'::jsonb)$$)
                       ->> 'status'), 'LEFT', 'CL04 ออกก่อนรับบริการ → สถานะ LEFT');
SELECT test.api_invalid($$SELECT api.close_visit('7b000000-0000-4000-8000-000000000307', 'PURCHASED', '{}'::jsonb)$$,
    'CL05 ผล PURCHASED ต้องระบุลูกค้า (ข้อ 4.2)', 'P0001');
SELECT test.api_invalid($$SELECT api.close_visit('7b000000-0000-4000-8000-000000000307', 'NOT_INTERESTED', '{}'::jsonb)$$,
    'CL06 ผล NOT_INTERESTED ต้องมีเหตุผลที่ไม่สำเร็จ (19.3 ข้อ 3)', 'P0001');
SELECT test.assert_eq((test.jcall($$SELECT api.close_visit('7b000000-0000-4000-8000-000000000307', 'NOT_INTERESTED',
    jsonb_build_object('lost_reason_code', 'PRICE'))$$) ->> 'leads_closed')::integer, 1,
    'CL07 NOT_INTERESTED ปิด lead ที่เปิดจาก visit นั้นเป็น LOST');
SELECT test.assert_eq((test.jcall($$SELECT api.close_visit('7b000000-0000-4000-8000-000000000308', 'PURCHASED', '{}'::jsonb)$$)
                       ->> 'status'), 'COMPLETED', 'CL08 ปิด visit ที่ระบุลูกค้าด้วยผล PURCHASED');
SELECT test.assert_eq((test.jcall($$SELECT api.close_visit('7b000000-0000-4000-8000-000000000308', 'SERVICE_DONE', '{}'::jsonb)$$)
                       ->> 'outcome_code'), 'SERVICE_DONE', 'CL09 แก้ outcome ได้ภายในวันธุรกิจเดียวกัน (ข้อ 4.1)');
SELECT test.logout();
SELECT test.assert_eq((SELECT l.status::text || '/' || l.lost_reason_code FROM crm.leads l
                       WHERE l.id = '7b000000-0000-4000-8000-000000000504'), 'LOST/PRICE',
    'CL10 lead ของ visit ถูกปิดเป็น LOST พร้อมเหตุผลในทรานแซกชันเดียว');
SELECT test.assert_true((SELECT v.ended_at IS NOT NULL FROM crm.visits v WHERE v.id = '7b000000-0000-4000-8000-000000000307'),
    'CL11 visit ที่ปิดแล้วมี ended_at (19.1 ข้อ 12)');
SELECT test.assert_eq((SELECT i.interaction_type_code FROM crm.interactions i
                       WHERE i.visit_id = '7b000000-0000-4000-8000-000000000308' AND i.is_visit_root), 'PURCHASE',
    'CL12 outcome PURCHASED → interaction ต้นทางเป็นประเภท PURCHASE (ข้อ 3.3 ข้อ 1)');

-- =====================================================================================
-- AK · api.acknowledge_unrecorded_visit
-- =====================================================================================
SELECT test.login_as('api.a08@test.example.com', 'aal1');
SELECT test.api_denied($$SELECT api.acknowledge_unrecorded_visit('7b000000-0000-4000-8000-000000000304')$$,
    'AK01 STAFF สาขาอื่นรับทราบแทนไม่ได้');
SELECT test.login_as('api.a06@test.example.com', 'aal1');
SELECT test.api_invalid($$SELECT api.acknowledge_unrecorded_visit('7b000000-0000-4000-8000-000000000305')$$,
    'AK02 visit ที่ไม่ใช่ UNRECORDED รับทราบไม่ได้', 'P0001');
SELECT test.assert_eq((test.jcall($$SELECT api.acknowledge_unrecorded_visit('7b000000-0000-4000-8000-000000000304')$$)
                       ->> 'already_acknowledged')::boolean, false, 'AK03 รับทราบครั้งแรก');
SELECT test.assert_eq((test.jcall($$SELECT api.acknowledge_unrecorded_visit('7b000000-0000-4000-8000-000000000304')$$)
                       ->> 'already_acknowledged')::boolean, true, 'AK04 เรียกซ้ำไม่เปลี่ยนค่าเดิม');
SELECT test.logout();
SELECT test.assert_eq((SELECT v.unrecorded_ack_by FROM crm.visits v WHERE v.id = '7b000000-0000-4000-8000-000000000304'),
    '7b000000-0000-4000-8000-000000000106'::uuid, 'AK05 บันทึก unrecorded_ack_by/_at (ข้อ 9.6)');

-- =====================================================================================
-- CV · api.convert_lead (ข้อ 4.3)
-- =====================================================================================
SELECT test.login_as('api.a02@test.example.com', 'aal2');          -- BUSINESS_ADMIN มี lead.update แต่ไม่มี opportunity.create
SELECT test.api_denied($$SELECT api.convert_lead('7b000000-0000-4000-8000-000000000502', '{}'::jsonb)$$,
    'CV01 ต้องมี opportunity.create ด้วย (ข้อ 8.1)');
SELECT test.login_as('api.a06@test.example.com', 'aal1');
SELECT test.api_denied($$SELECT api.convert_lead('7b000000-0000-4000-8000-000000000503', '{}'::jsonb)$$,
    'CV02 lead ที่ปิดแล้วแปลงไม่ได้ (JCRM-T43)');
SELECT test.put('op1', (test.jcall($$SELECT api.convert_lead('7b000000-0000-4000-8000-000000000502',
    jsonb_build_object('next_action', 'นัดดูเครื่อง', 'next_action_type_code', 'APPOINTMENT'))$$)) ->> 'opportunity_id');
SELECT test.logout();
SELECT test.assert_eq((SELECT l.status::text || '/' || (l.converted_opportunity_id = test.get('op1')::uuid)::text
                       FROM crm.leads l WHERE l.id = '7b000000-0000-4000-8000-000000000502'), 'CONVERTED/true',
    'CV03 lead เปลี่ยนเป็น CONVERTED พร้อม converted_opportunity_id ในทรานแซกชันเดียว');
SELECT test.assert_eq((SELECT o.stage::text || '/' || o.origin_channel_code FROM crm.opportunities o WHERE o.id = test.get('op1')::uuid),
    'INTERESTED/WALK_IN', 'CV04 opportunity เริ่มที่ INTERESTED และ origin = ช่องทางของ lead (ข้อ 4.4)');
SELECT test.assert_eq((SELECT count(*) FROM crm.opportunity_stage_history h WHERE h.opportunity_id = test.get('op1')::uuid),
    1::bigint, 'CV05 trigger บันทึกประวัติขั้นของ opportunity');
SELECT test.assert_eq((SELECT t.status::text FROM crm.tasks t WHERE t.id = '7b000000-0000-4000-8000-000000000801'),
    'CANCELLED', 'CV06 task next action ของ lead ที่ปิดถูกยกเลิก (ข้อ 4.4)');

-- =====================================================================================
-- AS · api.assign_owner (ข้อ 9.4.2 · rls-spec ข้อ 8.3)
-- =====================================================================================
SELECT test.login_as('api.a06@test.example.com', 'aal1');          -- STAFF ไม่มี lead.assign
SELECT test.api_denied($$SELECT api.assign_owner('OPPORTUNITY', '7b000000-0000-4000-8000-000000000601',
    '7b000000-0000-4000-8000-000000000107', 'SHIFT_CHANGE', NULL, NULL)$$, 'AS01 STAFF ไม่มีสิทธิ์มอบหมาย (JCRM-T10)');
SELECT test.login_as('api.a05@test.example.com', 'aal2');          -- SUPERVISOR หัวหน้าทีม TA1
SELECT test.assert_eq((test.jcall($$SELECT api.assign_owner('LEAD', '7b000000-0000-4000-8000-000000000501',
    '7b000000-0000-4000-8000-000000000107', 'WORKLOAD', 'กระจายงาน', NULL)$$) ->> 'ok')::boolean, true,
    'AS02 SUPERVISOR มอบ lead ที่ไม่มี owner ให้สมาชิกทีมได้ (ข้อ 8.0 · Q28)');
SELECT test.api_denied($$SELECT api.assign_owner('LEAD', '7b000000-0000-4000-8000-000000000501',
    '7b000000-0000-4000-8000-000000000104', 'WORKLOAD', NULL, NULL)$$,
    'AS03 มอบให้ผู้จัดการสาขาที่ไม่ใช่สมาชิกทีมไม่ได้ (JCRM-T11)');
SELECT test.api_denied($$SELECT api.assign_owner('TASK', '7b000000-0000-4000-8000-000000000801',
    '7b000000-0000-4000-8000-000000000107', 'WORKLOAD', NULL, NULL)$$,
    'AS04 task next action เปลี่ยนผู้รับตรงไม่ได้ (JCRM-T14/T70)');
SELECT test.login_as('api.a04@test.example.com', 'aal2');          -- BM@TA1
SELECT test.api_denied($$SELECT api.assign_owner('LEAD', '7b000000-0000-4000-8000-000000000501',
    '7b000000-0000-4000-8000-000000000108', 'BRANCH_TRANSFER', NULL, '7b000000-0000-4000-8000-000000000012')$$,
    'AS05 BM ย้าย lead ไปสาขาที่ตนไม่มีสิทธิ์ไม่ได้ (JCRM-T15)');
SELECT test.api_denied($$SELECT api.assign_owner('OPPORTUNITY', '7b000000-0000-4000-8000-000000000601',
    NULL, 'WORKLOAD', NULL, NULL)$$, 'AS06 opportunity ต้องมีผู้รับผิดชอบเสมอ (JCRM-T16)');
SELECT test.api_denied($$SELECT api.assign_owner('VISIT', '7b000000-0000-4000-8000-000000000302',
    '7b000000-0000-4000-8000-000000000107', 'SHIFT_CHANGE', NULL, NULL)$$,
    'AS07 visit ที่รอคิวใช้การรับคิวแทน (JCRM-T21)');
SELECT test.api_denied($$SELECT api.assign_owner('LEAD', '7b000000-0000-4000-8000-000000000503',
    '7b000000-0000-4000-8000-000000000107', 'WORKLOAD', NULL, NULL)$$, 'AS08 lead ที่ปิดแล้วมอบหมายไม่ได้ (JCRM-T43)');
SELECT test.api_invalid($$SELECT api.assign_owner('LEAD', '7b000000-0000-4000-8000-000000000501',
    '7b000000-0000-4000-8000-000000000107', 'WORKLOAD', NULL, '7b000000-0000-4000-8000-000000000012')$$,
    'AS09 ย้ายสาขาต้องใช้เหตุผล BRANCH_TRANSFER', '22023');
SELECT test.login_as('api.a02@test.example.com', 'aal2');          -- BUSINESS_ADMIN (G)
SELECT test.api_denied($$SELECT api.assign_owner('LEAD', '7b000000-0000-4000-8000-000000000501',
    '7b000000-0000-4000-8000-000000000105', 'BRANCH_TRANSFER', NULL, '7b000000-0000-4000-8000-000000000012')$$,
    'AS10 ผู้รับใหม่ไม่มี assignment ในสาขาปลายทาง (JCRM-T12)');
SELECT test.assert_eq((test.jcall($$SELECT api.assign_owner('LEAD', '7b000000-0000-4000-8000-000000000501',
    '7b000000-0000-4000-8000-000000000108', 'BRANCH_TRANSFER', 'ย้ายสาขา', '7b000000-0000-4000-8000-000000000012')$$)
    ->> 'to_branch_id'), '7b000000-0000-4000-8000-000000000012', 'AS11 BUSINESS_ADMIN ย้ายสาขาพร้อมเปลี่ยนผู้รับได้');
SELECT test.login_as('api.a06@test.example.com', 'aal1');
SELECT test.api_denied($$SELECT api.assign_owner('CUSTOMER', '7b000000-0000-4000-8000-000000000201',
    '7b000000-0000-4000-8000-000000000107', 'CUSTOMER_REQUEST', NULL, NULL)$$,
    'AS12 STAFF เปลี่ยนผู้ดูแลลูกค้าไม่ได้ (JCRM-T90)');
SELECT test.login_as('api.a05@test.example.com', 'aal2');
SELECT test.assert_eq((test.jcall($$SELECT api.assign_owner('CUSTOMER', '7b000000-0000-4000-8000-000000000201',
    '7b000000-0000-4000-8000-000000000107', 'CUSTOMER_REQUEST', 'ลูกค้าขอเปลี่ยน', NULL)$$) ->> 'ok')::boolean, true,
    'AS13 SUPERVISOR เปลี่ยนผู้ดูแลลูกค้าเป็นสมาชิกทีมได้');
SELECT test.logout();
SELECT test.assert_eq((SELECT count(*) FROM crm.ownership_changes oc WHERE oc.entity_type = 'LEAD'
                         AND oc.entity_id = '7b000000-0000-4000-8000-000000000501'), 2::bigint,
    'AS14 บันทึก crm.ownership_changes ทุกครั้ง (A28)');
SELECT test.assert_eq((SELECT oc.from_branch_id::text || '→' || oc.to_branch_id::text FROM crm.ownership_changes oc
                       WHERE oc.entity_type = 'LEAD' AND oc.reason_code = 'BRANCH_TRANSFER'),
    '7b000000-0000-4000-8000-000000000011→7b000000-0000-4000-8000-000000000012', 'AS15 บันทึกสาขาต้นทาง/ปลายทาง');
SELECT test.assert_eq((SELECT count(*) FROM crm.notifications n WHERE n.organization_id = '7b000000-0000-4000-8000-000000000001' AND n.code = 'LEAD_ASSIGNED'
                         AND n.recipient_staff_id = '7b000000-0000-4000-8000-000000000107'), 1::bigint,
    'AS16 แจ้ง LEAD_ASSIGNED ให้ผู้รับใหม่ (ข้อ 11.1)');
SELECT test.assert_eq((SELECT c.owner_staff_id FROM crm.customers c WHERE c.id = '7b000000-0000-4000-8000-000000000201'),
    '7b000000-0000-4000-8000-000000000107'::uuid, 'AS17 เปลี่ยนผู้ดูแลลูกค้าสำเร็จ');
