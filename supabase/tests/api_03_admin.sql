-- =====================================================================================
-- supabase/tests/api_03_admin.sql — RPC ผู้ใช้ สิทธิ์ ค่าตั้ง ส่งออก audit และ PDPA ของ migration 0011_api.sql
--   api.get_my_access · api.can_assign_role · api.assign_role · api.revoke_role · api.request_role_grant
--   api.decide_role_grant · api.list_role_grant_requests · api.activate_self · api.list_staff · api.update_staff
--   api.disable_staff · api.save_team · api.set_team_member · api.register_device · api.get_settings · api.update_setting
--   api.request_export · api.decide_export · api.record_export_download · api.list_export_requests
--   api.search_audit · api.get_entity_history · api.search_security_log
--   api.create_dsr · api.list_dsr · api.update_dsr · api.build_dsr_package · api.anonymize_customer · api.set_legal_hold
--   api.list_integration_logs · api.svc_*
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

-- fixture เพิ่มของไฟล์นี้: คำขอส่งออกที่สร้างไฟล์แล้ว · คำขอเจ้าของข้อมูล · integration log · login event
INSERT INTO audit.export_requests (id, organization_id, export_no, requested_by, requested_as_role, requested_at, branch_ids,
                                   reason_code, filter, row_count, status, decided_at, created_by, updated_by)
VALUES ('7b000000-0000-4000-8000-000000000e01', '7b000000-0000-4000-8000-000000000001', 'EX-1996-000001',
        '7b000000-0000-4000-8000-000000000104', 'BRANCH_MANAGER', now() - interval '2 days',
        ARRAY['7b000000-0000-4000-8000-000000000011']::uuid[], 'MANAGEMENT_REPORT', '{}'::jsonb, 2, 'APPROVED',
        now() - interval '2 days', '7b000000-0000-4000-8000-000000000104', '7b000000-0000-4000-8000-000000000104');
UPDATE audit.export_requests SET status = 'GENERATED', generated_at = now() - interval '1 hour', file_path = 'exports/EX-1996-000001.csv'
WHERE id = '7b000000-0000-4000-8000-000000000e01';
INSERT INTO crm.data_subject_requests (id, organization_id, request_no, customer_id, requester_name, request_type, status,
                                       received_at, received_by, created_by, updated_by)
VALUES ('7b000000-0000-4000-8000-000000000d41', '7b000000-0000-4000-8000-000000000001', 'DSR-1996-000001',
        '7b000000-0000-4000-8000-000000000202', 'ผู้ขอทดสอบ', 'ACCESS', 'RECEIVED', now() - interval '1 day',
        '7b000000-0000-4000-8000-000000000106', '7b000000-0000-4000-8000-000000000106', '7b000000-0000-4000-8000-000000000106');
INSERT INTO audit.integration_logs (organization_id, source_system_code, direction, operation, status)
VALUES ('7b000000-0000-4000-8000-000000000001', 'POS', 'INBOUND', 'sync-orders', 'SUCCESS');
INSERT INTO audit.login_events (organization_id, user_id, staff_id, event_type, method, success, aal)
VALUES ('7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-000000000906', '7b000000-0000-4000-8000-000000000106',
        'SIGN_IN', 'PASSWORD', true, 'aal1');

SELECT set_config('app.bulk', 'off', true);


-- =====================================================================================
-- MY · api.get_my_access (ข้อ 9.6 · rls-spec ข้อ 8.2)
-- =====================================================================================
SELECT test.login_as('api.a05@test.example.com', 'aal1');          -- SUPERVISOR (requires_mfa) ที่ aal1
SELECT test.assert_eq(test.jcall($$SELECT api.get_my_access()$$) ->> 'aal', 'aal1', 'MY01 คืน aal ปัจจุบัน');
SELECT test.assert_eq((test.jcall($$SELECT api.get_my_access()$$) -> 'roles' -> 0 ->> 'requires_mfa')::boolean, true,
    'MY02 บทบาทมีธง requires_mfa');
SELECT test.assert_eq((test.jcall($$SELECT api.get_my_access()$$) -> 'roles' -> 0 ->> 'effective_now')::boolean, false,
    'MY03 aal1 → บทบาทที่ต้อง MFA ยังไม่มีผล (ข้อ 8.0)');
SELECT test.login_as('api.a05@test.example.com', 'aal2');
SELECT test.assert_eq((test.jcall($$SELECT api.get_my_access()$$) -> 'roles' -> 0 ->> 'effective_now')::boolean, true,
    'MY04 aal2 → บทบาทมีผล');
SELECT test.assert_eq(test.jcall($$SELECT api.get_my_access()$$) -> 'staff' ->> 'staff_code', 'ST-9605',
    'MY05 คืนโปรไฟล์ของผู้เรียกเท่านั้น');
SELECT test.assert_true(jsonb_array_length(test.jcall($$SELECT api.get_my_access()$$) -> 'permissions') > 0,
    'MY06 คืนรายการสิทธิ์สำหรับสร้างเมนู');
SELECT test.login_anon();
SELECT test.assert_raises($$SELECT api.get_my_access()$$, 'MY07 ผู้ใช้ที่ไม่ได้เข้าสู่ระบบเรียก RPC ไม่ได้', '42501');

-- =====================================================================================
-- RA · api.can_assign_role · api.assign_role · api.revoke_role (ข้อ 7.2 · PM ข้อ 6.1–6.2)
-- =====================================================================================
SELECT test.login_as('api.a06@test.example.com', 'aal1');
SELECT test.api_denied($$SELECT api.assign_role('7b000000-0000-4000-8000-000000000111', 'STAFF',
    '7b000000-0000-4000-8000-000000000011', 'ทดสอบ')$$, 'RA01 STAFF ไม่มี role.assign');
SELECT test.login_as('api.a04@test.example.com', 'aal1');          -- BM aal1 → บทบาทไม่นับ
SELECT test.assert_eq((SELECT api.can_assign_role('7b000000-0000-4000-8000-000000000111', 'STAFF',
    '7b000000-0000-4000-8000-000000000011')), false, 'RA02 BRANCH_MANAGER ที่ aal1 มอบบทบาทไม่ได้');
SELECT test.login_as('api.a04@test.example.com', 'aal2');
SELECT test.assert_eq((SELECT api.can_assign_role('7b000000-0000-4000-8000-000000000111', 'STAFF',
    '7b000000-0000-4000-8000-000000000011')), true, 'RA03 BM มอบ STAFF ในสาขาตนได้');
SELECT test.assert_eq((SELECT api.can_assign_role('7b000000-0000-4000-8000-000000000111', 'STAFF',
    '7b000000-0000-4000-8000-000000000012')), false, 'RA04 BM มอบบทบาทในสาขาอื่นไม่ได้');
SELECT test.assert_eq((SELECT api.can_assign_role('7b000000-0000-4000-8000-000000000111', 'BRANCH_MANAGER',
    '7b000000-0000-4000-8000-000000000011')), false, 'RA05 มอบ rank เท่ากันหรือสูงกว่าไม่ได้');
SELECT test.assert_eq((SELECT api.can_assign_role('7b000000-0000-4000-8000-000000000104', 'STAFF',
    '7b000000-0000-4000-8000-000000000011')), false, 'RA06 ห้ามมอบบทบาทของตนเอง');
SELECT test.assert_eq((SELECT api.can_assign_role('7b000000-0000-4000-8000-000000000111', 'BUSINESS_ADMIN', NULL)), false,
    'RA07 บทบาทสูงต้องใช้คำขอ (ข้อ 7.2)');
SELECT test.put('as1', (test.jcall($$SELECT api.assign_role('7b000000-0000-4000-8000-000000000107', 'SUPERVISOR',
    '7b000000-0000-4000-8000-000000000011', 'ตั้งหัวหน้าทีมใหม่')$$)) ->> 'assignment_id');
SELECT test.assert_true(test.get('as1') IS NOT NULL, 'RA08 BM มอบ SUPERVISOR ในสาขาตนได้');
SELECT test.api_invalid($$SELECT api.assign_role('7b000000-0000-4000-8000-000000000111', 'STAFF',
    '7b000000-0000-4000-8000-000000000011', NULL)$$, 'RA09 ต้องระบุเหตุผลของการมอบบทบาท', '22023');
SELECT test.login_as('api.a02@test.example.com', 'aal2');          -- BUSINESS_ADMIN
SELECT test.assert_eq((test.jcall($$SELECT api.assign_role('7b000000-0000-4000-8000-000000000111', 'STAFF',
    '7b000000-0000-4000-8000-000000000011', 'เชิญพนักงานใหม่')$$) ->> 'ok')::boolean, true,
    'RA10 BUSINESS_ADMIN มอบบทบาทให้บัญชี INVITED ได้ (ข้อ 7.2 v2.2)');
SELECT test.api_denied($$SELECT api.revoke_role((SELECT a.id FROM core.staff_role_assignments a
    WHERE a.staff_id = '7b000000-0000-4000-8000-000000000102' AND a.role_code = 'BUSINESS_ADMIN'), 'ทดสอบ')$$,
    'RA11 ถอนบทบาทสูงต้องใช้คำขอ REVOKE');
SELECT test.login_as('api.a04@test.example.com', 'aal2');
SELECT test.assert_eq((test.jcall(format($$SELECT api.revoke_role(%L, 'ยกเลิกการตั้งหัวหน้าทีม')$$, test.get('as1'))) ->> 'ok')::boolean,
    true, 'RA12 BM ถอน SUPERVISOR ในสาขาตนได้');
SELECT test.logout();
SELECT test.assert_true((SELECT a.valid_to IS NOT NULL AND a.revoked_by = '7b000000-0000-4000-8000-000000000104'
                         FROM core.staff_role_assignments a WHERE a.id = test.get('as1')::uuid),
    'RA13 การถอนตั้ง valid_to + revoked_by (ข้อ 7.1)');
SELECT test.assert_eq((SELECT count(*) FROM audit.audit_logs a WHERE a.organization_id = '7b000000-0000-4000-8000-000000000001' AND a.action = 'ROLE_REVOKED'), 1::bigint,
    'RA14 trigger บันทึก ROLE_REVOKED (ข้อ 9.5)');
SELECT test.assert_eq((SELECT count(*) FROM audit.audit_logs a WHERE a.organization_id = '7b000000-0000-4000-8000-000000000001' AND a.action = 'ROLE_GRANTED'
                         AND a.after ->> 'staff_id' = '7b000000-0000-4000-8000-000000000107'
                         AND a.after ->> 'role_code' = 'SUPERVISOR'), 1::bigint,
    'RA15 trigger บันทึก ROLE_GRANTED ของการมอบบทบาทที่ทดสอบ');

-- =====================================================================================
-- RG · คำขอบทบาทสูง (ข้อ 7.2 · PM ข้อ 6.3)
-- =====================================================================================
SELECT test.login_as('api.a02@test.example.com', 'aal2');
SELECT test.api_denied($$SELECT api.request_role_grant('7b000000-0000-4000-8000-000000000111', 'BUSINESS_ADMIN', 'GRANT', 'ทดสอบ')$$,
    'RG01 BUSINESS_ADMIN ไม่มี role.request');
SELECT test.login_as('api.a03@test.example.com', 'aal2');          -- SYSTEM_ADMIN
SELECT test.put('rg1', (test.jcall($$SELECT api.request_role_grant('7b000000-0000-4000-8000-000000000111', 'BUSINESS_ADMIN',
    'GRANT', 'ตั้งผู้ดูแลข้อมูลธุรกิจเพิ่ม')$$)) ->> 'request_id');
SELECT test.assert_true(test.get('rg1') IS NOT NULL, 'RG02 SYSTEM_ADMIN ยื่นคำขอได้');
SELECT test.logout();
SELECT test.assert_eq((SELECT count(*) FROM crm.notifications n WHERE n.organization_id = '7b000000-0000-4000-8000-000000000001' AND n.code = 'ROLE_GRANT_APPROVAL_REQUIRED'), 2::bigint,
    'RG03 แจ้ง EXECUTIVE ทุกคน (ยกเว้นผู้รับ)');
SELECT test.login_as('api.a01@test.example.com', 'aal1');
SELECT test.api_denied(format($$SELECT api.decide_role_grant(%L, true, NULL)$$, test.get('rg1')),
    'RG04 EXECUTIVE ที่ aal1 ตัดสินไม่ได้ (role.decide 🔐)');
SELECT test.login_as('api.a01@test.example.com', 'aal2');
SELECT test.assert_eq((test.jcall(format($$SELECT api.decide_role_grant(%L, true, 'อนุมัติ')$$, test.get('rg1'))) ->> 'status'),
    'APPROVED', 'RG05 EXECUTIVE อนุมัติคำขอได้');
SELECT test.api_invalid(format($$SELECT api.decide_role_grant(%L, true, NULL)$$, test.get('rg1')),
    'RG06 คำขอที่ตัดสินแล้วตัดสินซ้ำไม่ได้', 'P0001');
SELECT test.assert_true(jsonb_array_length(test.jcall($$SELECT api.list_role_grant_requests('{}'::jsonb)$$) -> 'requests') >= 1,
    'RG07 EXECUTIVE เห็นคำขอทั้งองค์กร');
SELECT test.logout();
SELECT test.assert_eq((SELECT count(*) FROM core.staff_role_assignments a
                       WHERE a.staff_id = '7b000000-0000-4000-8000-000000000111' AND a.role_code = 'BUSINESS_ADMIN'
                         AND a.valid_to IS NULL), 1::bigint, 'RG08 อนุมัติ GRANT แล้วสร้าง assignment');
SELECT test.assert_eq((SELECT count(*) FROM crm.notifications n WHERE n.organization_id = '7b000000-0000-4000-8000-000000000001' AND n.code = 'ROLE_GRANT_DECIDED'
                         AND n.recipient_staff_id = '7b000000-0000-4000-8000-000000000103'), 1::bigint,
    'RG09 แจ้งผู้ยื่นเมื่อคำขอถูกตัดสิน');

-- =====================================================================================
-- US · ผู้ใช้ (ข้อ 7.3 · PM ข้อ 6.5)
-- =====================================================================================
SELECT test.login_as('api.a10@test.example.com', 'aal2');          -- MARKETING ไม่มี user.read
SELECT test.api_denied($$SELECT api.list_staff('{}'::jsonb)$$, 'US01 MARKETING ดูรายชื่อผู้ใช้ไม่ได้');
SELECT test.login_as('api.a04@test.example.com', 'aal2');          -- BM@TA1
SELECT test.assert_eq((SELECT count(*) FROM jsonb_array_elements(test.jcall($$SELECT api.list_staff('{}'::jsonb)$$) -> 'staff') e
                       WHERE e ->> 'staff_code' = 'ST-9608'), 0::bigint, 'US02 BM ไม่เห็นพนักงานสาขาอื่น');
SELECT test.assert_true((SELECT count(*) > 0 FROM jsonb_array_elements(test.jcall($$SELECT api.list_staff('{}'::jsonb)$$) -> 'staff') e
                         WHERE e ->> 'staff_code' = 'ST-9606'), 'US03 BM เห็นพนักงานในสาขาตน');
SELECT test.api_denied($$SELECT api.update_staff('7b000000-0000-4000-8000-000000000108',
    jsonb_build_object('nickname', 'ข้ามสาขา'))$$, 'US04 BM แก้โปรไฟล์พนักงานสาขาอื่นไม่ได้');
SELECT test.api_denied($$SELECT api.update_staff('7b000000-0000-4000-8000-000000000106',
    jsonb_build_object('email', 'new.mail@test.example.com'))$$, 'US05 BM แก้อีเมลไม่ได้ (ข้อ 7.3 ข้อ 5)');
SELECT test.assert_eq((test.jcall($$SELECT api.update_staff('7b000000-0000-4000-8000-000000000106',
    jsonb_build_object('nickname', 'ขวัญ'))$$) ->> 'ok')::boolean, true, 'US06 BM แก้โปรไฟล์พนักงานในสาขาตนได้');
SELECT test.api_denied($$SELECT api.disable_staff('7b000000-0000-4000-8000-000000000104', 'ปิดตัวเอง')$$,
    'US07 ห้ามปิดใช้งานตนเอง');
SELECT test.assert_eq((test.jcall($$SELECT api.disable_staff('7b000000-0000-4000-8000-000000000107', 'ลาออก')$$) ->> 'ok')::boolean,
    true, 'US08 BM ปิดใช้งาน STAFF ในสาขาตนได้');
SELECT test.login_as('api.a02@test.example.com', 'aal2');          -- BUSINESS_ADMIN
SELECT test.assert_eq((test.jcall($$SELECT api.disable_staff('7b000000-0000-4000-8000-000000000113', 'ลาออก')$$) ->> 'ok')::boolean,
    true, 'US09 BA ปิดใช้งาน EXECUTIVE คนที่สองได้');
SELECT test.api_denied($$SELECT api.disable_staff('7b000000-0000-4000-8000-000000000101', 'ลาออก')$$,
    'US10 ห้ามปิดใช้งาน EXECUTIVE ที่ ACTIVE คนสุดท้าย (ข้อ 7.3 ข้อ 5)');
SELECT test.logout();
SELECT test.assert_eq((SELECT s.status::text FROM core.staff_profiles s WHERE s.id = '7b000000-0000-4000-8000-000000000107'),
    'DISABLED', 'US11 บัญชีที่ปิดใช้งานยังอยู่ (ห้ามลบแถว)');
SELECT test.assert_eq((SELECT count(*) FROM core.staff_role_assignments a
                       WHERE a.staff_id = '7b000000-0000-4000-8000-000000000107' AND a.valid_to IS NULL), 0::bigint,
    'US12 ปิดใช้งานแล้วตั้ง valid_to ทุก assignment');
SELECT test.login_as('api.a11@test.example.com', 'aal2');          -- บัญชี INVITED
SELECT test.assert_eq((test.jcall($$SELECT api.activate_self()$$) ->> 'status'), 'ACTIVE', 'US13 เปิดใช้งานบัญชีของตนเองได้');
SELECT test.assert_eq((test.jcall($$SELECT api.activate_self()$$) ->> 'already_active')::boolean, true,
    'US14 เรียกซ้ำคืนสถานะเดิม');
SELECT test.logout();

-- =====================================================================================
-- TM · ทีม และ DV · อุปกรณ์
-- =====================================================================================
SELECT test.login_as('api.a06@test.example.com', 'aal1');
SELECT test.api_denied($$SELECT api.save_team(jsonb_build_object('branch_id', '7b000000-0000-4000-8000-000000000011',
    'code', 'TA1-X', 'name_th', 'ทีมใหม่'))$$, 'TM01 STAFF ไม่มี team.manage');
SELECT test.api_denied($$SELECT api.register_device('API-DEVICE-1', '7b000000-0000-4000-8000-000000000011', true)$$,
    'DV01 STAFF ลงทะเบียนอุปกรณ์ไม่ได้');
SELECT test.login_as('api.a04@test.example.com', 'aal2');
SELECT test.api_denied($$SELECT api.save_team(jsonb_build_object('branch_id', '7b000000-0000-4000-8000-000000000012',
    'code', 'TA2-X', 'name_th', 'ทีมสาขาอื่น'))$$, 'TM02 BM สร้างทีมของสาขาอื่นไม่ได้');
SELECT test.put('tm1', (test.jcall($$SELECT api.save_team(jsonb_build_object('branch_id', '7b000000-0000-4000-8000-000000000011',
    'code', 'TA1-SVC', 'name_th', 'ทีมบริการทดสอบ'))$$)) ->> 'team_id');
SELECT test.api_denied(format($$SELECT api.set_team_member(%L, '7b000000-0000-4000-8000-000000000108', false, true)$$, test.get('tm1')),
    'TM03 สมาชิกต้องมี assignment ในสาขาของทีม (ข้อ 7.1)');
SELECT test.assert_eq((test.jcall(format($$SELECT api.set_team_member(%L, '7b000000-0000-4000-8000-000000000106', true, true)$$,
    test.get('tm1'))) ->> 'is_leader')::boolean, true, 'TM04 เพิ่มสมาชิกและตั้งหัวหน้าได้');
SELECT test.assert_eq((test.jcall(format($$SELECT api.set_team_member(%L, '7b000000-0000-4000-8000-000000000106', false, false)$$,
    test.get('tm1'))) ->> 'active')::boolean, false, 'TM05 ปิดสมาชิกภาพได้');
SELECT test.assert_eq((test.jcall($$SELECT api.register_device('API-DEVICE-1', '7b000000-0000-4000-8000-000000000011', true)$$)
                       ->> 'ok')::boolean, true, 'DV02 BM ลงทะเบียนอุปกรณ์ของสาขาตนได้');
SELECT test.logout();
SELECT test.assert_eq((SELECT count(*) FROM core.devices d WHERE d.device_id = 'API-DEVICE-1' AND d.is_shared_counter), 1::bigint,
    'DV03 บันทึกอุปกรณ์ counter ของสาขา');

-- =====================================================================================
-- ST · ค่าตั้งของระบบ (ข้อ 11.2)
-- =====================================================================================
SELECT test.login_as('api.a06@test.example.com', 'aal1');
SELECT test.api_denied($$SELECT api.get_settings()$$, 'ST01 STAFF ดูค่าตั้งไม่ได้');
SELECT test.login_as('api.a02@test.example.com', 'aal2');
SELECT test.assert_eq((SELECT count(*) FROM jsonb_array_elements(test.jcall($$SELECT api.get_settings()$$) -> 'settings') e
                       WHERE e ->> 'editable_by' = 'settings.system'), 0::bigint,
    'ST02 BUSINESS_ADMIN เห็นเฉพาะค่าตั้งเชิงธุรกิจ');
SELECT test.api_denied($$SELECT api.update_setting('env', '"staging"'::jsonb)$$, 'ST03 BA แก้ค่าตั้งเชิงเทคนิคไม่ได้');
SELECT test.assert_eq((test.jcall($$SELECT api.update_setting('badge.new_customer_days', '45'::jsonb)$$) ->> 'ok')::boolean,
    true, 'ST04 BA แก้เกณฑ์ธุรกิจได้');
SELECT test.login_as('api.a03@test.example.com', 'aal2');
SELECT test.assert_eq((test.jcall($$SELECT api.update_setting('allowed_sso_domains', '["example.com"]'::jsonb)$$) ->> 'ok')::boolean,
    true, 'ST05 SYSTEM_ADMIN แก้ค่าตั้งเชิงเทคนิคได้');
SELECT test.logout();
SELECT test.assert_eq((SELECT count(*) FROM audit.audit_logs a WHERE a.organization_id = '7b000000-0000-4000-8000-000000000001' AND a.action = 'SETTINGS_UPDATED'), 2::bigint,
    'ST06 เขียน SETTINGS_UPDATED ทุกครั้ง (ข้อ 9.5)');
UPDATE app.settings SET value = '30' WHERE key = 'badge.new_customer_days';

-- =====================================================================================
-- EX · การส่งออกข้อมูลลูกค้า (ข้อ 8.2 · PM ข้อ 7)
-- =====================================================================================
SELECT test.login_as('api.a06@test.example.com', 'aal1');
SELECT test.api_denied($$SELECT api.request_export(jsonb_build_object('requested_as_role', 'BRANCH_MANAGER',
    'reason_code', 'MANAGEMENT_REPORT'))$$, 'EX01 STAFF ไม่มี customer.export');
SELECT test.login_as('api.a04@test.example.com', 'aal1');
SELECT test.api_denied($$SELECT api.request_export(jsonb_build_object('requested_as_role', 'BRANCH_MANAGER',
    'reason_code', 'MANAGEMENT_REPORT'))$$, 'EX02 customer.export ต้อง aal2');
SELECT test.login_as('api.a04@test.example.com', 'aal2');
SELECT test.put('ex1', (test.jcall($$SELECT api.request_export(jsonb_build_object('requested_as_role', 'BRANCH_MANAGER',
    'reason_code', 'MANAGEMENT_REPORT'))$$)) ->> 'export_id');
SELECT test.logout();                                              -- audit.* ไม่มี GRANT ให้ authenticated (ข้อ 9.4 ข้อ 6)
SELECT test.assert_eq((SELECT e.status::text FROM audit.export_requests e WHERE e.id = test.get('ex1')::uuid), 'APPROVED',
    'EX03 คำขอของ BRANCH_MANAGER ที่ไม่เกินเพดาน = APPROVED ทันที (ข้อ 8.2 v2.2)');
SELECT test.assert_eq((SELECT e.row_count FROM audit.export_requests e WHERE e.id = test.get('ex1')::uuid), 2,
    'EX04 นับจำนวนแถวจากขอบเขตสาขาที่บันทึกตอนยื่น');
SELECT test.assert_true((SELECT e.filter -> 'columns' ? 'phone_masked' FROM audit.export_requests e WHERE e.id = test.get('ex1')::uuid),
    'EX05 บันทึก whitelist คอลัมน์ของบทบาทไว้ในคำขอ (ข้อ 8.2)');
SELECT test.login_as('api.a10@test.example.com', 'aal2');          -- MARKETING
SELECT test.put('ex2x', 'x');
SELECT test.put('ex2', (test.jcall($$SELECT api.request_export(jsonb_build_object('requested_as_role', 'MARKETING',
    'reason_code', 'MARKETING_CAMPAIGN'))$$)) ->> 'export_id');
SELECT test.api_denied(format($$SELECT api.decide_export(%L, true, NULL)$$, test.get('ex2')), 'EX07 ผู้ขออนุมัติคำขอตนเองไม่ได้');
SELECT test.logout();
SELECT test.assert_eq((SELECT e.status::text FROM audit.export_requests e WHERE e.id = test.get('ex2')::uuid), 'REQUESTED',
    'EX06 คำขอของ MARKETING ต้องรออนุมัติ');
SELECT test.login_as('api.a01@test.example.com', 'aal2');          -- EXECUTIVE ไม่ใช่ผู้อนุมัติของ MARKETING
SELECT test.api_denied(format($$SELECT api.decide_export(%L, true, NULL)$$, test.get('ex2')),
    'EX08 ผู้อนุมัติต้องตรงกับ requested_as_role (PM ข้อ 7.2)');
SELECT test.login_as('api.a02@test.example.com', 'aal2');          -- BUSINESS_ADMIN
SELECT test.assert_eq((test.jcall(format($$SELECT api.decide_export(%L, true, 'อนุมัติ')$$, test.get('ex2'))) ->> 'status'),
    'APPROVED', 'EX09 BUSINESS_ADMIN อนุมัติคำขอของ MARKETING ได้');
SELECT test.logout();
SELECT test.assert_eq((SELECT count(*) FROM crm.notifications n WHERE n.organization_id = '7b000000-0000-4000-8000-000000000001' AND n.code = 'EXPORT_APPROVAL_REQUIRED'), 3::bigint,
    'EX10 แจ้งเฉพาะผู้อนุมัติที่ถูกต้อง = BUSINESS_ADMIN ที่ ACTIVE ทุกคน (A02 · A11 ที่เพิ่งได้บทบาท · A12)');
SELECT test.assert_eq((SELECT count(*) FROM crm.notifications n WHERE n.organization_id = '7b000000-0000-4000-8000-000000000001' AND n.code = 'EXPORT_APPROVAL_REQUIRED'
                         AND n.recipient_staff_id = '7b000000-0000-4000-8000-000000000101'), 0::bigint,
    'EX10b ไม่แจ้ง EXECUTIVE ซึ่งไม่ใช่ผู้อนุมัติของคำขอ MARKETING');
SELECT test.assert_eq((SELECT count(*) FROM crm.notifications n WHERE n.organization_id = '7b000000-0000-4000-8000-000000000001' AND n.code = 'EXPORT_DECIDED'
                         AND n.recipient_staff_id = '7b000000-0000-4000-8000-000000000110'), 1::bigint,
    'EX11 แจ้งผู้ขอเมื่อคำขอถูกตัดสิน');
SELECT test.assert_eq((SELECT count(*) FROM audit.audit_logs a WHERE a.organization_id = '7b000000-0000-4000-8000-000000000001' AND a.action = 'EXPORT_REQUESTED'), 2::bigint,
    'EX12 บันทึก EXPORT_REQUESTED ใน audit');

-- เกินเพดานแถว → REJECTED (ไม่ raise · นับรวมในโควตาต่อวัน)
UPDATE app.settings SET value = jsonb_set(value, '{BRANCH_MANAGER,max_rows}', '0') WHERE key = 'export.limits';
SELECT test.login_as('api.a04@test.example.com', 'aal2');
SELECT test.assert_eq((test.jcall($$SELECT api.request_export(jsonb_build_object('requested_as_role', 'BRANCH_MANAGER',
    'reason_code', 'DATA_CLEANUP'))$$) ->> 'code'), 'EXPORT_ROW_LIMIT_EXCEEDED', 'EX13 เกินเพดานแถว = ปฏิเสธโดยไม่ raise');
SELECT test.logout();
UPDATE app.settings SET value = jsonb_set(value, '{BRANCH_MANAGER,max_rows}', '500') WHERE key = 'export.limits';
SELECT test.login_as('api.a04@test.example.com', 'aal2');
SELECT test.assert_eq((test.jcall($$SELECT api.request_export(jsonb_build_object('requested_as_role', 'BRANCH_MANAGER',
    'reason_code', 'INTERNAL_AUDIT'))$$) ->> 'status'), 'APPROVED', 'EX14 คำขอที่สามของวันยังยื่นได้');
SELECT test.api_denied($$SELECT api.request_export(jsonb_build_object('requested_as_role', 'BRANCH_MANAGER',
    'reason_code', 'INTERNAL_AUDIT'))$$, 'EX15 ครบ 3 ครั้ง/วัน (นับรวมคำขอที่ถูกปฏิเสธ) → ปฏิเสธ');
-- ดาวน์โหลด
SELECT test.assert_eq((test.jcall($$SELECT api.record_export_download('7b000000-0000-4000-8000-000000000e01')$$)
                       ->> 'download_count')::integer, 1, 'EX16 ผู้ขอดาวน์โหลดได้ (aal2 · ภายใน 24 ชม.)');
SELECT test.login_as('api.a04@test.example.com', 'aal1');
SELECT test.api_denied($$SELECT api.record_export_download('7b000000-0000-4000-8000-000000000e01')$$,
    'EX17 ดาวน์โหลดต้อง aal2');
SELECT test.login_as('api.a02@test.example.com', 'aal2');
SELECT test.api_denied($$SELECT api.record_export_download('7b000000-0000-4000-8000-000000000e01')$$,
    'EX18 คนอื่นดาวน์โหลดคำขอของผู้อื่นไม่ได้');
SELECT test.assert_true(jsonb_array_length(test.jcall($$SELECT api.list_export_requests('{}'::jsonb)$$) -> 'requests') >= 1,
    'EX19 ผู้อนุมัติเห็นคำขอที่ตนอนุมัติได้');
SELECT test.logout();

-- =====================================================================================
-- SV · RPC ของ Edge Function (api.svc_*)
-- =====================================================================================
SELECT test.login_as('api.a02@test.example.com', 'aal2');
SELECT test.assert_raises($$SELECT api.svc_expired_export_files()$$, 'SV01 authenticated เรียก svc_* ไม่ได้ (CI-18)', '42501');
SELECT test.logout();
-- เตรียม id ไว้ก่อนสลับเป็น service_role (service_role ไม่มี USAGE ของ schema audit · CI-24)
SELECT test.put('ex_approved', (SELECT e.id::text FROM audit.export_requests e
                                WHERE e.organization_id = '7b000000-0000-4000-8000-000000000001'
                                  AND e.status = 'APPROVED' AND e.export_no <> 'EX-1996-000001'
                                ORDER BY e.export_no LIMIT 1));
SELECT test.put('ex_gen', '7b000000-0000-4000-8000-000000000e01');
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
SELECT set_config('role', 'service_role', true);
SELECT test.assert_eq((test.jcall($$SELECT api.svc_resolve_staff_code('ST-9606')$$) ->> 'user_id'),
    '7b000000-0000-4000-8000-000000000906', 'SV02 svc_resolve_staff_code คืน user_id');
SELECT test.assert_true((test.jcall($$SELECT api.svc_resolve_staff_code('ST-9606')$$) -> 'email') IS NULL,
    'SV03 svc_resolve_staff_code ไม่คืนอีเมล (ข้อ 9.2)');
SELECT test.assert_eq((test.jcall($$SELECT api.svc_resolve_staff_code('ST-0000')$$) ->> 'ok')::boolean, false,
    'SV04 รหัสที่ไม่มีคืนผลเหมือนกัน');
SELECT test.assert_true((test.jcall(format($$SELECT api.svc_build_export_dataset(%L)$$, test.get('ex_approved')))
                         ->> 'watermark') LIKE 'ส่งออกโดย ST-%', 'SV05 ชุดข้อมูลมีลายน้ำ ส่งออกโดย {staff_code} (ข้อ 8.2)');
SELECT test.assert_eq(jsonb_array_length(test.jcall(format($$SELECT api.svc_build_export_dataset(%L)$$,
    test.get('ex_approved'))) -> 'rows'), 2, 'SV06 ชุดข้อมูลมีแถวตามขอบเขตสาขาที่บันทึกไว้');
SELECT test.assert_true((test.jcall(format($$SELECT api.svc_build_export_dataset(%L)$$, test.get('ex_approved')))
                         -> 'rows' -> 0 -> 'phone') IS NULL
                    AND (test.jcall(format($$SELECT api.svc_build_export_dataset(%L)$$, test.get('ex_approved')))
                         -> 'rows' -> 0 ->> 'phone_masked') IS NOT NULL,
    'SV06b คอลัมน์นอก whitelist ของบทบาทไม่อยู่ในชุดข้อมูล · BRANCH_MANAGER ได้เบอร์ปิดบังเท่านั้น (ข้อ 8.2)');
SELECT test.assert_eq((test.jcall(format($$SELECT api.svc_mark_export_generated(%L, 'exports/api-test.csv')$$,
    test.get('ex_approved'))) ->> 'status'), 'GENERATED', 'SV07 svc_mark_export_generated เปลี่ยนเป็น GENERATED');
SELECT test.api_invalid(format($$SELECT api.svc_build_export_dataset(%L)$$, test.get('ex_gen')),
    'SV08 svc_build_export_dataset ทำงานเฉพาะคำขอ APPROVED', 'P0001');
SELECT test.assert_true(jsonb_array_length(test.jcall($$SELECT api.svc_expired_export_files()$$) -> 'files') >= 0,
    'SV09 svc_expired_export_files คืนรายการไฟล์');
SELECT test.assert_eq((test.jcall($$SELECT api.svc_prepare_invite(jsonb_build_object(
    'actor_user_id', '7b000000-0000-4000-8000-000000000904', 'actor_aal', 'aal2',
    'email', 'api.new@test.example.com', 'display_name', 'พนักงานใหม่', 'employee_code', 'API-NEW',
    'role_code', 'STAFF', 'branch_id', '7b000000-0000-4000-8000-000000000011'))$$) ->> 'ok')::boolean, true,
    'SV10 svc_prepare_invite สร้างบัญชี INVITED + คำเชิญ + assignment (19.3 ข้อ 6)');
SELECT test.api_denied($$SELECT api.svc_prepare_invite(jsonb_build_object(
    'actor_user_id', '7b000000-0000-4000-8000-000000000906', 'actor_aal', 'aal1',
    'email', 'api.new2@test.example.com', 'display_name', 'พนักงานใหม่ 2', 'employee_code', 'API-NEW2',
    'role_code', 'STAFF', 'branch_id', '7b000000-0000-4000-8000-000000000011'))$$,
    'SV11 ผู้กระทำที่ไม่มี user.invite เชิญไม่ได้');
SELECT test.assert_eq((test.jcall($$SELECT api.svc_reset_mfa_authorize(jsonb_build_object(
    'actor_user_id', '7b000000-0000-4000-8000-000000000902', 'actor_aal', 'aal2',
    'target_staff_id', '7b000000-0000-4000-8000-000000000106'))$$) ->> 'required_role'), 'BUSINESS_ADMIN',
    'SV12 บัญชี STAFF ให้ BUSINESS_ADMIN รีเซ็ต MFA (ข้อ 7.3 ข้อ 6)');
SELECT test.api_denied($$SELECT api.svc_reset_mfa_authorize(jsonb_build_object(
    'actor_user_id', '7b000000-0000-4000-8000-000000000902', 'actor_aal', 'aal2',
    'target_staff_id', '7b000000-0000-4000-8000-000000000101'))$$,
    'SV13 บัญชี EXECUTIVE ต้องให้ EXECUTIVE ดำเนินการ');
SELECT test.assert_eq((test.jcall($$SELECT api.svc_finalize_disable(jsonb_build_object(
    'actor_user_id', '7b000000-0000-4000-8000-000000000904', 'actor_aal', 'aal2',
    'staff_id', '7b000000-0000-4000-8000-000000000107', 'reason', 'ลาออก'))$$) ->> 'ok')::boolean, true,
    'SV14 svc_finalize_disable ปิดคำเชิญที่ค้างและบันทึก audit');
SELECT test.logout();
SELECT test.assert_eq((SELECT s.status::text FROM core.staff_profiles s WHERE s.email = 'api.new@test.example.com'),
    'INVITED', 'SV15 บัญชีที่ถูกเชิญอยู่ในสถานะ INVITED');
SELECT test.assert_eq((SELECT count(*) FROM core.staff_role_assignments a
                       JOIN core.staff_profiles s ON s.id = a.staff_id
                       WHERE s.email = 'api.new@test.example.com' AND a.role_code = 'STAFF'), 1::bigint,
    'SV16 คำเชิญสร้าง assignment พร้อมกัน (มีผลเมื่อ ACTIVE)');
SELECT test.assert_eq((SELECT a.actor_staff_id FROM audit.audit_logs a
                       WHERE a.organization_id = '7b000000-0000-4000-8000-000000000001' AND a.action = 'STAFF_INVITED' AND a.entity_ref = (SELECT s.staff_code FROM core.staff_profiles s
                                                                            WHERE s.email = 'api.new@test.example.com')),
    '7b000000-0000-4000-8000-000000000104'::uuid, 'SV17 audit ของ svc_* ใช้ actor จาก JWT ที่ verify แล้ว (ข้อ 9.5)');

-- =====================================================================================
-- AU · audit และ security log (ข้อ 9.5)
-- =====================================================================================
SELECT test.login_as('api.a06@test.example.com', 'aal1');
SELECT test.api_denied($$SELECT api.search_audit('{}'::jsonb)$$, 'AU01 STAFF ไม่มี audit.read');
SELECT test.api_denied($$SELECT api.search_security_log('{}'::jsonb)$$, 'AU02 STAFF ไม่มี security_log.read');
SELECT test.assert_true(jsonb_array_length(test.jcall($$SELECT api.get_entity_history('CUSTOMER',
    '7b000000-0000-4000-8000-000000000201')$$) -> 'entries') >= 1,
    'AU03 ผู้มี customer.update บนลูกค้ารายนั้นดูประวัติการแก้ไขได้');
SELECT test.login_as('api.a08@test.example.com', 'aal1');
SELECT test.api_denied($$SELECT api.get_entity_history('CUSTOMER', '7b000000-0000-4000-8000-000000000201')$$,
    'AU04 พนักงานสาขาอื่นดูประวัติของลูกค้ารายนี้ไม่ได้');
SELECT test.login_as('api.a02@test.example.com', 'aal2');
SELECT test.assert_true(jsonb_array_length(test.jcall($$SELECT api.search_audit(jsonb_build_object('action', 'ROLE_GRANTED'))$$)
                        -> 'entries') >= 1, 'AU05 BUSINESS_ADMIN ค้น audit ได้');
SELECT test.assert_true(jsonb_array_length(test.jcall($$SELECT api.search_security_log('{}'::jsonb)$$) -> 'login_events') >= 1,
    'AU06 security log คืน login_events');
SELECT test.assert_eq((SELECT count(*) FROM jsonb_array_elements(test.jcall($$SELECT api.search_security_log('{}'::jsonb)$$)
                       -> 'audit_entries') e WHERE e ->> 'entity_type' IN ('CUSTOMER', 'crm.customers')), 0::bigint,
    'AU07 security log ไม่คืนรายการของลูกค้า (ข้อ 9.5)');
SELECT test.logout();
SELECT test.assert_true((SELECT (a.after -> 'value_raw' ->> 'masked') IS NOT NULL FROM audit.audit_logs a
                         WHERE a.organization_id = '7b000000-0000-4000-8000-000000000001' AND a.entity_type = 'crm.customer_contacts' LIMIT 1),
    'AU08 คอลัมน์ pii ใน audit เก็บค่าปิดบัง + hash (ข้อ 9.5)');

-- =====================================================================================
-- DS · PDPA (ข้อ 10.4) และ IN · integration log
-- =====================================================================================
SELECT test.login_as('api.a10@test.example.com', 'aal2');
SELECT test.api_denied($$SELECT api.create_dsr(jsonb_build_object('requester_name', 'ผู้ขอ', 'request_type', 'ACCESS'))$$,
    'DS01 MARKETING ไม่มี dsr.create');
SELECT test.login_as('api.a06@test.example.com', 'aal1');
SELECT test.put('dsr1', (test.jcall($$SELECT api.create_dsr(jsonb_build_object('requester_name', 'คุณสมหญิง',
    'requester_contact', '081-111-2222', 'request_type', 'DELETION',
    'customer_id', '7b000000-0000-4000-8000-000000000201'))$$)) ->> 'dsr_id');
SELECT test.api_denied($$SELECT api.update_dsr('7b000000-0000-4000-8000-000000000d41', 'VERIFIED',
    jsonb_build_object('verification_method', 'IN_PERSON_ID_SIGHTED'))$$, 'DS02 STAFF ไม่มี dsr.manage');
SELECT test.logout();
SELECT test.assert_eq((SELECT d.requester_contact_masked FROM crm.data_subject_requests d WHERE d.id = test.get('dsr1')::uuid),
    '081-XXX-2222', 'DS03 เก็บช่องทางผู้ยื่นแบบปิดบัง (ข้อ 10.4)');
SELECT test.login_as('api.a02@test.example.com', 'aal1');
SELECT test.api_denied(format($$SELECT api.update_dsr(%L, 'VERIFIED', jsonb_build_object('verification_method', 'IN_PERSON_ID_SIGHTED'))$$,
    test.get('dsr1')), 'DS04 dsr.manage ต้อง aal2');
SELECT test.login_as('api.a02@test.example.com', 'aal2');
SELECT test.api_invalid(format($$SELECT api.update_dsr(%L, 'VERIFIED', '{}'::jsonb)$$, test.get('dsr1')),
    'DS05 VERIFIED ต้องระบุวิธียืนยันตัวตน', '22023');
SELECT test.assert_eq((test.jcall(format($$SELECT api.update_dsr(%L, 'VERIFIED',
    jsonb_build_object('verification_method', 'IN_PERSON_ID_SIGHTED'))$$, test.get('dsr1'))) ->> 'verified_by'),
    '7b000000-0000-4000-8000-000000000102', 'DS06 VERIFIED ตั้ง verified_by = ผู้ดำเนินการ');
SELECT test.api_invalid(format($$SELECT api.build_dsr_package(%L)$$, test.get('dsr1')),
    'DS07 สร้างแพ็กเกจได้เฉพาะ ACCESS/PORTABILITY', 'P0001');
SELECT test.assert_eq((test.jcall($$SELECT api.update_dsr('7b000000-0000-4000-8000-000000000d41', 'VERIFIED',
    jsonb_build_object('verification_method', 'OTP_TO_REGISTERED_CONTACT'))$$) ->> 'ok')::boolean, true,
    'DS08 ยืนยันตัวตนคำขอ ACCESS');
SELECT test.assert_true((test.jcall($$SELECT api.build_dsr_package('7b000000-0000-4000-8000-000000000d41')$$)
                        -> 'package' -> 'customer' ->> 'customer_no') = 'CUS-1996-000002',
    'DS09 แพ็กเกจของลูกค้ารายเดียว (ข้อ 10.4)');
SELECT test.api_denied(format($$SELECT api.anonymize_customer('7b000000-0000-4000-8000-000000000201', %L)$$, test.get('dsr1')),
    'DS10 ผู้ดำเนินการต้องไม่ใช่ผู้ยืนยันตัวตน (Q26)');
SELECT test.login_as('api.a12@test.example.com', 'aal2');          -- BUSINESS_ADMIN คนที่สอง
SELECT test.assert_eq((test.jcall($$SELECT api.set_legal_hold('7b000000-0000-4000-8000-000000000201', true, 'คดีความ')$$)
                       ->> 'legal_hold')::boolean, true, 'DS11 ตั้ง legal hold ได้');
SELECT test.api_invalid(format($$SELECT api.anonymize_customer('7b000000-0000-4000-8000-000000000201', %L)$$, test.get('dsr1')),
    'DS12 ลูกค้าที่ติด legal hold ทำนิรนามไม่ได้ (ข้อ 10.3)', 'P0001');
SELECT test.assert_eq((test.jcall($$SELECT api.set_legal_hold('7b000000-0000-4000-8000-000000000201', false, 'คดีจบแล้ว')$$)
                       ->> 'legal_hold')::boolean, false, 'DS13 ยกเลิก legal hold ได้');
SELECT test.assert_eq((test.jcall(format($$SELECT api.anonymize_customer('7b000000-0000-4000-8000-000000000201', %L)$$,
    test.get('dsr1'))) ->> 'ok')::boolean, true, 'DS14 ทำข้อมูลนิรนามได้ (ผู้ยืนยัน ≠ ผู้ดำเนินการ)');
SELECT test.assert_true(jsonb_array_length(test.jcall($$SELECT api.list_dsr('{}'::jsonb)$$) -> 'requests') >= 2,
    'DS15 dsr.manage เห็นคำขอทั้งหมด');
SELECT test.login_as('api.a03@test.example.com', 'aal2');
SELECT test.assert_true(jsonb_array_length(test.jcall($$SELECT api.list_integration_logs('{}'::jsonb)$$) -> 'entries') >= 1,
    'IN01 SYSTEM_ADMIN ดู integration log ได้');
SELECT test.login_as('api.a02@test.example.com', 'aal2');
SELECT test.api_denied($$SELECT api.list_integration_logs('{}'::jsonb)$$, 'IN02 BUSINESS_ADMIN ไม่มี integration.manage');
SELECT test.logout();
SELECT test.assert_eq((SELECT c.record_status::text || '/' || c.first_name FROM crm.customers c
                       WHERE c.id = '7b000000-0000-4000-8000-000000000201'), 'ANONYMIZED/ลูกค้านิรนาม CUS-1996-000001',
    'DS16 ลูกค้าเปลี่ยนเป็น ANONYMIZED และแทนชื่อด้วยเลขลูกค้า (ข้อ 10.4)');
SELECT test.assert_eq((SELECT count(*) FROM crm.customer_contacts ct WHERE ct.customer_id = '7b000000-0000-4000-8000-000000000201'),
    0::bigint, 'DS17 ลบช่องทางติดต่อและที่อยู่');
SELECT test.assert_eq((SELECT count(*) FROM crm.visits v WHERE v.customer_id = '7b000000-0000-4000-8000-000000000201'), 1::bigint,
    'DS18 คง visit ไว้เพื่อให้ KPI ย้อนหลังไม่เปลี่ยน (ข้อ 10.4)');
SELECT test.assert_true((SELECT count(*) > 0 FROM audit.audit_logs a
                         WHERE a.organization_id = '7b000000-0000-4000-8000-000000000001' AND a.entity_id = '7b000000-0000-4000-8000-000000000201'
                           AND a.after -> 'first_name' = '"[ANONYMIZED]"'::jsonb),
    'DS19 แทนคีย์ PII ใน audit_logs (19.4 ข้อ 2)');
SELECT test.assert_eq((SELECT count(*) FROM audit.audit_logs a WHERE a.organization_id = '7b000000-0000-4000-8000-000000000001' AND a.action = 'CUSTOMER_ANONYMIZED'), 1::bigint,
    'DS20 บันทึก CUSTOMER_ANONYMIZED');

-- =====================================================================================
-- Z · กรณีปฏิเสธเพิ่มเติมของ RPC รายการ (อย่างน้อยหนึ่ง deny ต่อ RPC)
-- =====================================================================================
SELECT test.login_as('api.a06@test.example.com', 'aal1');          -- STAFF
SELECT test.api_denied($$SELECT api.list_export_requests('{}'::jsonb)$$, 'Z01 STAFF ดูคำขอส่งออกไม่ได้');
SELECT test.api_denied($$SELECT api.list_role_grant_requests('{}'::jsonb)$$, 'Z02 STAFF ดูคำขอมอบบทบาทไม่ได้');
SELECT test.api_denied($$SELECT api.build_dsr_package('7b000000-0000-4000-8000-000000000d41')$$,
    'Z03 STAFF สร้างแพ็กเกจ DSR ไม่ได้');
SELECT test.api_denied($$SELECT api.set_legal_hold('7b000000-0000-4000-8000-000000000202', true, 'ทดสอบ')$$,
    'Z04 STAFF ตั้ง legal hold ไม่ได้');
SELECT test.login_as('api.a10@test.example.com', 'aal2');          -- MARKETING
SELECT test.api_denied($$SELECT api.list_dsr('{}'::jsonb)$$, 'Z05 MARKETING ดูคำขอเจ้าของข้อมูลไม่ได้');
SELECT test.login_anon();
SELECT test.assert_raises($$SELECT api.activate_self()$$, 'Z06 ผู้ใช้ที่ไม่ได้เข้าสู่ระบบเปิดใช้งานบัญชีไม่ได้', '42501');
SELECT test.logout();
-- ปฏิเสธคำขอส่งออก (เส้นทาง REJECTED ของ api.decide_export)
SELECT test.login_as('api.a10@test.example.com', 'aal2');
SELECT test.put('ex3', (test.jcall($$SELECT api.request_export(jsonb_build_object('requested_as_role', 'MARKETING',
    'reason_code', 'OTHER', 'reason_note', 'ทดสอบการปฏิเสธ'))$$)) ->> 'export_id');
SELECT test.login_as('api.a02@test.example.com', 'aal2');
SELECT test.assert_eq((test.jcall(format($$SELECT api.decide_export(%L, false, 'ไม่ผ่านเกณฑ์')$$, test.get('ex3'))) ->> 'status'),
    'REJECTED', 'Z07 ผู้อนุมัติปฏิเสธคำขอได้ (approved_by ว่าง · decided_at บันทึก)');
SELECT test.logout();
SELECT test.assert_true((SELECT e.approved_by IS NULL AND e.decided_at IS NOT NULL FROM audit.export_requests e
                         WHERE e.id = test.get('ex3')::uuid), 'Z08 คำขอที่ถูกปฏิเสธไม่มี approved_by');
