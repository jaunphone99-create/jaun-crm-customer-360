-- =====================================================================================
-- supabase/tests/rls_06_work.sql — ชุดทดสอบสิทธิ์/RLS ของ migration 0010_security.sql
-- แหล่งจริง: docs/04-security/rls-spec.md ข้อ 10 (fixture องค์กร TEST-RLS · persona P01–P19)
-- รันด้วย `node tools/db/run.mjs --test rls_` หรือ `--seed --test` · ไฟล์ถูกครอบ BEGIN … ROLLBACK โดย run.mjs
-- ห้ามมีคำสั่งควบคุมทรานแซกชันในไฟล์ · ทุก assertion เป็นอิสระจาก supabase/seed.sql
-- =====================================================================================

-- ===== P0: harness เพิ่ม (อยู่ในทรานแซกชันของไฟล์ · ROLLBACK ท้ายไฟล์) =====
CREATE FUNCTION test.assert_denied(p_sql text, p_code text, p_msg text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_state text; v_message text;
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
        IF v_state <> '42501' OR (p_code IS NOT NULL AND v_message <> 'JCRM-' || p_code) THEN
            RAISE EXCEPTION 'ASSERT FAILED: % — ได้ % "%" แต่คาดว่า 42501 %', p_msg, v_state, v_message, coalesce('JCRM-' || p_code, '');
        END IF;
        RAISE NOTICE 'ok: % (%)', p_msg, v_message;
        RETURN;
    END;
    RAISE EXCEPTION 'ASSERT FAILED: % — คำสั่งสำเร็จทั้งที่ควรถูกปฏิเสธ: %', p_msg, p_sql;
END;
$$;

CREATE FUNCTION test.exec_count(p_sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE v bigint;
BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v = ROW_COUNT;
    RETURN v;
END;
$$;

GRANT EXECUTE ON FUNCTION test.assert_denied(text, text, text), test.exec_count(text) TO authenticated;

-- ===== F0: fixture (superuser · app.bulk = on ระหว่างสร้าง) =====
SELECT set_config('app.bulk', 'on', true);

INSERT INTO core.organizations (id, code, name_th) VALUES ('7a000000-0000-4000-8000-000000000001', 'TEST-RLS', 'องค์กรทดสอบ RLS');
INSERT INTO core.business_units (id, organization_id, code, name_th)
    VALUES ('7a000000-0000-4000-8000-000000000002', '7a000000-0000-4000-8000-000000000001', 'TRBU', 'หน่วยทดสอบ RLS');
INSERT INTO core.branches (id, organization_id, business_unit_id, code, name_th, branch_type) VALUES
    ('7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000002', 'TR1',  'สาขาทดสอบ 1', 'store'),
    ('7a000000-0000-4000-8000-000000000012', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000002', 'TR2',  'สาขาทดสอบ 2', 'store'),
    ('7a000000-0000-4000-8000-000000000013', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000002', 'TRON', 'ทีมออนไลน์ทดสอบ', 'online_team');
INSERT INTO core.teams (id, organization_id, branch_id, code, name_th) VALUES
    ('7a000000-0000-4000-8000-000000000021', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000011', 'TR1-SALES', 'ทีมขายทดสอบ 1'),
    ('7a000000-0000-4000-8000-000000000022', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000012', 'TR2-SALES', 'ทีมขายทดสอบ 2'),
    ('7a000000-0000-4000-8000-000000000023', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000011', 'TRX-T',     'ทีมข้ามสาขาทดสอบ');

INSERT INTO auth.users (id, email)
SELECT ('7a000000-0000-4000-8000-0000000009' || lpad(n::text, 2, '0'))::uuid, 'rls.p' || lpad(n::text, 2, '0') || '@example.com'
FROM generate_series(1, 19) n;

INSERT INTO core.staff_profiles (id, organization_id, staff_code, employee_code, display_name, email, user_id, status)
SELECT ('7a000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, '7a000000-0000-4000-8000-000000000001',
       'ST-97' || lpad(n::text, 2, '0'), 'RLS-' || lpad(n::text, 2, '0'), 'ผู้ทดสอบ P' || lpad(n::text, 2, '0'),
       'rls.p' || lpad(n::text, 2, '0') || '@example.com', ('7a000000-0000-4000-8000-0000000009' || lpad(n::text, 2, '0'))::uuid,
       (CASE WHEN n = 16 THEN 'DISABLED' ELSE 'ACTIVE' END)::core.staff_status
FROM generate_series(1, 19) n;

INSERT INTO core.staff_role_assignments (organization_id, staff_id, role_code, branch_id, valid_from, valid_to) VALUES
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000101', 'EXECUTIVE',      NULL,                                   now() - interval '90 days', NULL),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000102', 'BUSINESS_ADMIN', NULL,                                   now() - interval '90 days', NULL),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000103', 'SYSTEM_ADMIN',   NULL,                                   now() - interval '90 days', NULL),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000104', 'OPERATIONS',     '7a000000-0000-4000-8000-000000000011', now() - interval '90 days', NULL),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000104', 'OPERATIONS',     '7a000000-0000-4000-8000-000000000012', now() - interval '90 days', NULL),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000105', 'MARKETING',      NULL,                                   now() - interval '90 days', NULL),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000106', 'BRANCH_MANAGER', '7a000000-0000-4000-8000-000000000011', now() - interval '90 days', NULL),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000107', 'BRANCH_MANAGER', '7a000000-0000-4000-8000-000000000012', now() - interval '90 days', NULL),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000108', 'SUPERVISOR',     '7a000000-0000-4000-8000-000000000011', now() - interval '90 days', NULL),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000109', 'STAFF',          '7a000000-0000-4000-8000-000000000011', now() - interval '90 days', NULL),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000110', 'STAFF',          '7a000000-0000-4000-8000-000000000011', now() - interval '90 days', NULL),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000111', 'STAFF',          '7a000000-0000-4000-8000-000000000013', now() - interval '90 days', NULL),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000113', 'BRANCH_MANAGER', '7a000000-0000-4000-8000-000000000011', now() - interval '90 days', NULL),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000113', 'STAFF',          '7a000000-0000-4000-8000-000000000012', now() - interval '90 days', NULL),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000114', 'SUPERVISOR',     '7a000000-0000-4000-8000-000000000012', now() - interval '90 days', NULL),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000115', 'STAFF',          '7a000000-0000-4000-8000-000000000011', now() - interval '30 days', now() - interval '1 day'),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000116', 'STAFF',          '7a000000-0000-4000-8000-000000000011', now() - interval '90 days', NULL),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000117', 'SUPERVISOR',     '7a000000-0000-4000-8000-000000000011', now() - interval '90 days', NULL),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000117', 'SUPERVISOR',     '7a000000-0000-4000-8000-000000000012', now() - interval '90 days', NULL),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000118', 'STAFF',          '7a000000-0000-4000-8000-000000000011', now() - interval '90 days', NULL),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000118', 'STAFF',          '7a000000-0000-4000-8000-000000000012', now() - interval '90 days', NULL),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000119', 'STAFF',          '7a000000-0000-4000-8000-000000000012', now() - interval '90 days', NULL);

INSERT INTO core.team_members (organization_id, team_id, staff_id, is_leader, valid_from) VALUES
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000021', '7a000000-0000-4000-8000-000000000108', true,  now() - interval '90 days'),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000021', '7a000000-0000-4000-8000-000000000109', false, now() - interval '90 days'),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000021', '7a000000-0000-4000-8000-000000000110', false, now() - interval '90 days'),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000022', '7a000000-0000-4000-8000-000000000117', true,  now() - interval '90 days'),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000022', '7a000000-0000-4000-8000-000000000114', false, now() - interval '90 days'),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000022', '7a000000-0000-4000-8000-000000000119', false, now() - interval '90 days'),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000023', '7a000000-0000-4000-8000-000000000117', true,  now() - interval '90 days'),
    ('7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000023', '7a000000-0000-4000-8000-000000000118', false, now() - interval '90 days');

INSERT INTO crm.customers (id, organization_id, customer_no, first_name, last_name, first_seen_at, first_channel_code, first_branch_id,
                           owner_staff_id, record_status, merged_into_id, created_via, created_by) VALUES
    ('7a000000-0000-4000-8000-000000000201', '7a000000-0000-4000-8000-000000000001', 'CUS-1997-000001', 'ลูกค้าหนึ่ง', 'ทดสอบ', now() - interval '30 days', 'LINE',    '7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000109', 'ACTIVE', NULL, 'QUICK_CAPTURE', '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000202', '7a000000-0000-4000-8000-000000000001', 'CUS-1997-000002', 'ลูกค้าสอง',  'ทดสอบ', now() - interval '30 days', 'WALK_IN', '7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000110', 'ACTIVE', NULL, 'QUICK_CAPTURE', '7a000000-0000-4000-8000-000000000110'),
    ('7a000000-0000-4000-8000-000000000203', '7a000000-0000-4000-8000-000000000001', 'CUS-1997-000003', 'ลูกค้าสาม',  'ทดสอบ', now() - interval '30 days', 'WALK_IN', '7a000000-0000-4000-8000-000000000012', '7a000000-0000-4000-8000-000000000119', 'ACTIVE', NULL, 'QUICK_CAPTURE', '7a000000-0000-4000-8000-000000000119'),
    ('7a000000-0000-4000-8000-000000000204', '7a000000-0000-4000-8000-000000000001', 'CUS-1997-000004', 'ลูกค้าสี่',   'ทดสอบ', now() - interval '30 days', 'LINE',    '7a000000-0000-4000-8000-000000000011', NULL,                                   'ACTIVE', NULL, 'QUICK_CAPTURE', '7a000000-0000-4000-8000-000000000106'),
    ('7a000000-0000-4000-8000-000000000205', '7a000000-0000-4000-8000-000000000001', 'CUS-1997-000005', 'ลูกค้าห้า',  'ทดสอบ', now() - interval '30 days', 'LINE',    '7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000109', 'ACTIVE', NULL, 'QUICK_CAPTURE', '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000206', '7a000000-0000-4000-8000-000000000001', 'CUS-1997-000006', 'ลูกค้าหก',   'ทดสอบ', now() - interval '30 days', 'WALK_IN', '7a000000-0000-4000-8000-000000000012', '7a000000-0000-4000-8000-000000000118', 'ACTIVE', NULL, 'QUICK_CAPTURE', '7a000000-0000-4000-8000-000000000118'),
    ('7a000000-0000-4000-8000-000000000207', '7a000000-0000-4000-8000-000000000001', 'CUS-1997-000007', 'ลูกค้าเจ็ด', 'ทดสอบ', now() - interval '3 days',  'WALK_IN', '7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000110', 'ACTIVE', NULL, 'QUICK_CAPTURE', '7a000000-0000-4000-8000-000000000110');
UPDATE crm.customers SET record_status = 'MERGED', merged_into_id = '7a000000-0000-4000-8000-000000000201' WHERE id = '7a000000-0000-4000-8000-000000000205';

INSERT INTO crm.customer_branches (organization_id, customer_id, branch_id, first_linked_at, last_activity_at, linked_via)
SELECT '7a000000-0000-4000-8000-000000000001', c.id, c.first_branch_id, c.first_seen_at, c.first_seen_at, 'CREATED'
FROM crm.customers c WHERE c.organization_id = '7a000000-0000-4000-8000-000000000001';

INSERT INTO crm.customer_contacts (id, organization_id, customer_id, contact_type, value_raw, is_primary) VALUES
    ('7a000000-0000-4000-8000-000000000c01', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000201', 'PHONE',   '081-234-5678', true),
    ('7a000000-0000-4000-8000-000000000c02', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000201', 'LINE_ID', 'rls_somchai', true),
    ('7a000000-0000-4000-8000-000000000c03', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000201', 'EMAIL',   'rls.somchai@example.com', true),
    ('7a000000-0000-4000-8000-000000000c04', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000203', 'PHONE',   '089-999-0000', true);
INSERT INTO crm.customer_addresses (id, organization_id, customer_id, address_line, subdistrict, district, province_code, postal_code, value_masked, is_primary) VALUES
    ('7a000000-0000-4000-8000-000000000c21', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000201', '99/1 ถนนทดสอบ', 'สีลม', 'บางรัก', 'TH-10', '10500', 'บางรัก · กรุงเทพมหานคร', true);
INSERT INTO crm.customer_consents (id, organization_id, customer_id, purpose_code, status, notice_version, channels, captured_via, captured_by, evidence) VALUES
    ('7a000000-0000-4000-8000-000000000c11', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000201', 'PRIVACY_NOTICE', 'GRANTED', 'PN-2026-01', '{}',     'LINK_SENT',  '7a000000-0000-4000-8000-000000000109', 'PN-2026-01 · LINE · ลิงก์ทดสอบ'),
    ('7a000000-0000-4000-8000-000000000c12', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000201', 'MARKETING',      'GRANTED', 'PN-2026-01', '{LINE}', 'STAFF_FORM', '7a000000-0000-4000-8000-000000000109', 'PN-2026-01 · STAFF_FORM · อายุ 20 ปีขึ้นไป');

INSERT INTO crm.tags (id, organization_id, code, label_th, is_active) VALUES
    ('7a000000-0000-4000-8000-000000000d01', '7a000000-0000-4000-8000-000000000001', 'VIP',     'ลูกค้าคนสำคัญ (VIP)', true),
    ('7a000000-0000-4000-8000-000000000d02', '7a000000-0000-4000-8000-000000000001', 'STUDENT', 'นักศึกษา', true),
    ('7a000000-0000-4000-8000-000000000d03', '7a000000-0000-4000-8000-000000000001', 'OLDTAG',  'tag เลิกใช้', false);
INSERT INTO crm.customer_tags (id, organization_id, customer_id, tag_id)
    VALUES ('7a000000-0000-4000-8000-000000000d11', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000201', '7a000000-0000-4000-8000-000000000d01');
INSERT INTO crm.duplicate_decisions (id, organization_id, customer_id, candidate_customer_id, score, matched_rules, override_reason_code, created_by)
    VALUES ('7a000000-0000-4000-8000-000000000d21', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000207', '7a000000-0000-4000-8000-000000000202',
            100, '{เบอร์โทรตรงกัน}', 'FAMILY_SHARED_PHONE', '7a000000-0000-4000-8000-000000000110');
INSERT INTO crm.customer_merges (id, organization_id, merge_no, survivor_customer_id, merged_customer_id, reason, snapshot, merged_by)
    VALUES ('7a000000-0000-4000-8000-000000000d31', '7a000000-0000-4000-8000-000000000001', 'MG-1997-000001', '7a000000-0000-4000-8000-000000000201',
            '7a000000-0000-4000-8000-000000000205', 'ทดสอบ', '{}', '7a000000-0000-4000-8000-000000000102');
INSERT INTO crm.data_subject_requests (id, organization_id, request_no, customer_id, requester_name, request_type, received_by) VALUES
    ('7a000000-0000-4000-8000-000000000d41', '7a000000-0000-4000-8000-000000000001', 'DSR-1997-000001', '7a000000-0000-4000-8000-000000000201', 'ผู้ขอทดสอบหนึ่ง', 'ACCESS', '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000d42', '7a000000-0000-4000-8000-000000000001', 'DSR-1997-000002', '7a000000-0000-4000-8000-000000000202', 'ผู้ขอทดสอบสอง',  'ACCESS', '7a000000-0000-4000-8000-000000000110');
INSERT INTO crm.customer_notes (id, organization_id, customer_id, branch_id, body, is_pinned, created_at, created_by) VALUES
    ('7a000000-0000-4000-8000-000000000b01', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000201', '7a000000-0000-4000-8000-000000000011', 'โน้ตทดสอบล่าสุด', true,  now() - interval '1 hour',   '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000b02', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000201', '7a000000-0000-4000-8000-000000000011', 'โน้ตทดสอบเก่า',   false, now() - interval '25 hours', '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000b03', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000203', '7a000000-0000-4000-8000-000000000012', 'โน้ตสาขาสอง',    false, now() - interval '1 hour',   '7a000000-0000-4000-8000-000000000119');

INSERT INTO crm.visits (id, organization_id, visit_no, branch_id, channel_code, status, queue_no, customer_id, interest_code,
                        started_at, service_started_at, ended_at, owner_staff_id, outcome_code, closed_by_system, created_at, created_by) VALUES
    ('7a000000-0000-4000-8000-000000000301', '7a000000-0000-4000-8000-000000000001', 'V-TR1-000000-001', '7a000000-0000-4000-8000-000000000011', 'WALK_IN', 'IN_SERVICE', 1, '7a000000-0000-4000-8000-000000000201', 'BUY',      now() - interval '30 minutes', now() - interval '30 minutes', NULL, '7a000000-0000-4000-8000-000000000109', NULL, false, now() - interval '30 minutes', '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000302', '7a000000-0000-4000-8000-000000000001', 'V-TR1-000000-002', '7a000000-0000-4000-8000-000000000011', 'WALK_IN', 'WAITING',    2, NULL,                                   'REPAIR',   now() - interval '5 minutes',  NULL, NULL, NULL,                                   NULL, false, now() - interval '5 minutes',  '7a000000-0000-4000-8000-000000000110'),
    ('7a000000-0000-4000-8000-000000000303', '7a000000-0000-4000-8000-000000000001', 'V-TR1-000000-003', '7a000000-0000-4000-8000-000000000011', 'WALK_IN', 'WAITING',    3, NULL,                                   'INQUIRY',  now() - interval '20 minutes', NULL, NULL, NULL,                                   NULL, false, now() - interval '20 minutes', '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000304', '7a000000-0000-4000-8000-000000000001', 'V-TR1-000000-004', '7a000000-0000-4000-8000-000000000011', 'LINE',    'IN_SERVICE', NULL, NULL,                                'INQUIRY',  now() - interval '10 minutes', now() - interval '10 minutes', NULL, '7a000000-0000-4000-8000-000000000109', NULL, false, now() - interval '10 minutes', '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000305', '7a000000-0000-4000-8000-000000000001', 'V-TR1-000000-005', '7a000000-0000-4000-8000-000000000011', 'WALK_IN', 'COMPLETED',  5, NULL,                                   'INQUIRY',  now() - interval '2 hours',    now() - interval '2 hours', now() - interval '1 hour', '7a000000-0000-4000-8000-000000000109', 'SERVICE_DONE', false, now() - interval '2 hours', '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000306', '7a000000-0000-4000-8000-000000000001', 'V-TR1-000000-006', '7a000000-0000-4000-8000-000000000011', 'WALK_IN', 'COMPLETED',  6, '7a000000-0000-4000-8000-000000000201', 'BUY',      now() - interval '4 hours',    now() - interval '4 hours', now() - interval '3 hours', '7a000000-0000-4000-8000-000000000109', 'PURCHASED', false, now() - interval '4 hours', '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000307', '7a000000-0000-4000-8000-000000000001', 'V-TR1-000000-007', '7a000000-0000-4000-8000-000000000011', 'WALK_IN', 'COMPLETED',  7, NULL,                                   'BUY',      now() - interval '2 days',     now() - interval '2 days', now() - interval '47 hours', '7a000000-0000-4000-8000-000000000110', 'UNRECORDED', true, now() - interval '2 days', '7a000000-0000-4000-8000-000000000110'),
    ('7a000000-0000-4000-8000-000000000308', '7a000000-0000-4000-8000-000000000001', 'V-TR2-000000-001', '7a000000-0000-4000-8000-000000000012', 'WALK_IN', 'IN_SERVICE', 1, '7a000000-0000-4000-8000-000000000203', 'BUY',      now() - interval '15 minutes', now() - interval '15 minutes', NULL, '7a000000-0000-4000-8000-000000000119', NULL, false, now() - interval '15 minutes', '7a000000-0000-4000-8000-000000000119'),
    ('7a000000-0000-4000-8000-000000000309', '7a000000-0000-4000-8000-000000000001', 'V-TR1-000000-009', '7a000000-0000-4000-8000-000000000011', 'WALK_IN', 'IN_SERVICE', 9, '7a000000-0000-4000-8000-000000000202', 'BUY',      now() - interval '20 minutes', now() - interval '20 minutes', NULL, '7a000000-0000-4000-8000-000000000110', NULL, false, now() - interval '20 minutes', '7a000000-0000-4000-8000-000000000110');

INSERT INTO crm.interactions (id, organization_id, customer_id, visit_id, is_visit_root, branch_id, channel_code, direction, interaction_type_code,
                              occurred_at, owner_staff_id, summary, created_at, created_by) VALUES
    ('7a000000-0000-4000-8000-000000000401', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000201', NULL, false, '7a000000-0000-4000-8000-000000000011', 'LINE',    'OUTBOUND', 'MESSAGE', now() - interval '1 hour',     '7a000000-0000-4000-8000-000000000109', 'ส่งข้อความทดสอบ', now() - interval '1 hour',     '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000402', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000201', NULL, false, '7a000000-0000-4000-8000-000000000011', 'PHONE',   'OUTBOUND', 'CALL',    now() - interval '25 hours',   '7a000000-0000-4000-8000-000000000109', 'โทรทดสอบเก่า',   now() - interval '25 hours',   '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000403', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000201', '7a000000-0000-4000-8000-000000000301', true, '7a000000-0000-4000-8000-000000000011', 'WALK_IN', 'INBOUND', 'VISIT', now() - interval '30 minutes', '7a000000-0000-4000-8000-000000000109', 'เข้าร้านทดสอบ', now() - interval '30 minutes', '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000404', '7a000000-0000-4000-8000-000000000001', NULL, '7a000000-0000-4000-8000-000000000304', true, '7a000000-0000-4000-8000-000000000011', 'LINE', 'INBOUND', 'INQUIRY', now() - interval '10 minutes', '7a000000-0000-4000-8000-000000000109', 'สอบถามนิรนาม', now() - interval '10 minutes', '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000405', '7a000000-0000-4000-8000-000000000001', NULL, NULL, false, '7a000000-0000-4000-8000-000000000011', 'PHONE', 'OUTBOUND', 'CALL', now() - interval '1 hour', '7a000000-0000-4000-8000-000000000109', 'โทรนิรนาม', now() - interval '1 hour', '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000406', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000203', NULL, false, '7a000000-0000-4000-8000-000000000012', 'LINE', 'OUTBOUND', 'MESSAGE', now() - interval '1 hour', '7a000000-0000-4000-8000-000000000119', 'ข้อความสาขาสอง', now() - interval '1 hour', '7a000000-0000-4000-8000-000000000119');

INSERT INTO crm.leads (id, organization_id, lead_no, customer_id, branch_id, owner_staff_id, channel_code, interest_code, status, priority_code,
                       next_action, next_action_type_code, next_action_at, first_contacted_at, closed_at, lost_reason_code, created_at, created_by) VALUES
    ('7a000000-0000-4000-8000-000000000501', '7a000000-0000-4000-8000-000000000001', 'LD-1997-000001', '7a000000-0000-4000-8000-000000000201', '7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000109', 'WALK_IN', 'BUY',      'CONTACTED', 'NORMAL', 'ติดต่อกลับ', 'CALL', now() + interval '1 day', NULL, NULL, NULL, now() - interval '2 days', '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000502', '7a000000-0000-4000-8000-000000000001', 'LD-1997-000002', '7a000000-0000-4000-8000-000000000202', '7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000110', 'LINE',    'BUY',      'NEW',       'NORMAL', 'ติดต่อกลับ', 'CALL', now() + interval '1 day', NULL, NULL, NULL, now() - interval '1 day',  '7a000000-0000-4000-8000-000000000110'),
    ('7a000000-0000-4000-8000-000000000503', '7a000000-0000-4000-8000-000000000001', 'LD-1997-000003', '7a000000-0000-4000-8000-000000000204', '7a000000-0000-4000-8000-000000000011', NULL,                                   'LINE',    'TRADE_IN', 'NEW',       'NORMAL', 'ติดต่อกลับ', 'CALL', now() + interval '1 day', NULL, NULL, NULL, now() - interval '1 day',  '7a000000-0000-4000-8000-000000000106'),
    ('7a000000-0000-4000-8000-000000000504', '7a000000-0000-4000-8000-000000000001', 'LD-1997-000004', '7a000000-0000-4000-8000-000000000201', '7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000109', 'LINE',    'BUY',      'LOST',      'NORMAL', 'ติดต่อกลับ', 'CALL', now() - interval '2 days', now() - interval '3 days', now() - interval '1 day', 'PRICE', now() - interval '3 days', '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000505', '7a000000-0000-4000-8000-000000000001', 'LD-1997-000005', '7a000000-0000-4000-8000-000000000203', '7a000000-0000-4000-8000-000000000012', '7a000000-0000-4000-8000-000000000119', 'WALK_IN', 'BUY',      'CONTACTED', 'NORMAL', 'ติดต่อกลับ', 'CALL', now() + interval '1 day', NULL, NULL, NULL, now() - interval '2 days', '7a000000-0000-4000-8000-000000000119'),
    ('7a000000-0000-4000-8000-000000000506', '7a000000-0000-4000-8000-000000000001', 'LD-1997-000006', '7a000000-0000-4000-8000-000000000206', '7a000000-0000-4000-8000-000000000012', '7a000000-0000-4000-8000-000000000118', 'WALK_IN', 'BUY',      'CONTACTED', 'NORMAL', 'ติดต่อกลับ', 'CALL', now() + interval '1 day', NULL, NULL, NULL, now() - interval '2 days', '7a000000-0000-4000-8000-000000000118'),
    ('7a000000-0000-4000-8000-000000000507', '7a000000-0000-4000-8000-000000000001', 'LD-1997-000007', '7a000000-0000-4000-8000-000000000203', '7a000000-0000-4000-8000-000000000012', '7a000000-0000-4000-8000-000000000107', 'LINE',    'BUY',      'QUALIFIED', 'NORMAL', 'ติดต่อกลับ', 'CALL', now() + interval '1 day', now() - interval '1 day', NULL, NULL, now() - interval '2 days', '7a000000-0000-4000-8000-000000000107');

INSERT INTO crm.opportunities (id, organization_id, opportunity_no, customer_id, origin_channel_code, branch_id, owner_staff_id, stage, priority_code,
                               next_action, next_action_type_code, next_action_at, won_amount, won_at, closed_at, created_at, created_by) VALUES
    ('7a000000-0000-4000-8000-000000000601', '7a000000-0000-4000-8000-000000000001', 'OP-1997-000001', '7a000000-0000-4000-8000-000000000201', 'LINE',    '7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000109', 'FOLLOW_UP',  'HIGH',   'โทรติดตาม', 'CALL', now() + interval '2 days', NULL, NULL, NULL, now() - interval '10 days', '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000602', '7a000000-0000-4000-8000-000000000001', 'OP-1997-000002', '7a000000-0000-4000-8000-000000000202', 'WALK_IN', '7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000110', 'INTERESTED', 'NORMAL', 'โทรติดตาม', 'CALL', now() + interval '2 days', NULL, NULL, NULL, now() - interval '5 days',  '7a000000-0000-4000-8000-000000000110'),
    ('7a000000-0000-4000-8000-000000000603', '7a000000-0000-4000-8000-000000000001', 'OP-1997-000003', '7a000000-0000-4000-8000-000000000201', 'LINE',    '7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000109', 'INTERESTED', 'NORMAL', 'โทรติดตาม', 'CALL', now() + interval '2 days', NULL, NULL, NULL, now() - interval '5 days',  '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000604', '7a000000-0000-4000-8000-000000000001', 'OP-1997-000004', '7a000000-0000-4000-8000-000000000201', 'WALK_IN', '7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000109', 'WON',        'NORMAL', 'โทรติดตาม', 'CALL', now() - interval '2 days', 1000, now() - interval '1 day', now() - interval '1 day', now() - interval '5 days', '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000605', '7a000000-0000-4000-8000-000000000001', 'OP-1997-000005', '7a000000-0000-4000-8000-000000000203', 'WALK_IN', '7a000000-0000-4000-8000-000000000012', '7a000000-0000-4000-8000-000000000119', 'QUOTATION',  'NORMAL', 'โทรติดตาม', 'CALL', now() + interval '2 days', NULL, NULL, NULL, now() - interval '5 days',  '7a000000-0000-4000-8000-000000000119'),
    ('7a000000-0000-4000-8000-000000000606', '7a000000-0000-4000-8000-000000000001', 'OP-1997-000006', '7a000000-0000-4000-8000-000000000202', 'LINE',    '7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000110', 'QUOTATION',  'NORMAL', 'โทรติดตาม', 'CALL', now() + interval '2 days', NULL, NULL, NULL, now() - interval '5 days',  '7a000000-0000-4000-8000-000000000110'),
    ('7a000000-0000-4000-8000-000000000607', '7a000000-0000-4000-8000-000000000001', 'OP-1997-000007', '7a000000-0000-4000-8000-000000000201', 'LINE',    '7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000109', 'INTERESTED', 'NORMAL', 'โทรติดตาม', 'CALL', now() + interval '2 days', NULL, NULL, NULL, now() - interval '5 days',  '7a000000-0000-4000-8000-000000000109');

INSERT INTO crm.opportunity_items (id, organization_id, opportunity_id, product_type_code, product_model, quantity, unit_price) VALUES
    ('7a000000-0000-4000-8000-000000000e01', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000601', 'IPHONE', 'iPhone ทดสอบ', 1, 45900),
    ('7a000000-0000-4000-8000-000000000e02', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000604', 'IPHONE', 'iPhone ทดสอบ', 1, 1000);

INSERT INTO crm.quotations (id, organization_id, quotation_no, opportunity_id, status, sent_at, sent_channel_code, valid_until, total_amount, created_by) VALUES
    ('7a000000-0000-4000-8000-000000000701', '7a000000-0000-4000-8000-000000000001', 'QT-1997-000001', '7a000000-0000-4000-8000-000000000601', 'SENT',  now() - interval '2 days', 'LINE', app.bangkok_date(now()) + 5, 49900, '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000702', '7a000000-0000-4000-8000-000000000001', 'QT-1997-000002', '7a000000-0000-4000-8000-000000000603', 'SENT',  now() - interval '2 days', 'LINE', app.bangkok_date(now()) + 5, 49900, '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000703', '7a000000-0000-4000-8000-000000000001', 'QT-1997-000003', '7a000000-0000-4000-8000-000000000605', 'SENT',  now() - interval '2 days', 'LINE', app.bangkok_date(now()) + 5, 49900, '7a000000-0000-4000-8000-000000000119'),
    ('7a000000-0000-4000-8000-000000000704', '7a000000-0000-4000-8000-000000000001', 'QT-1997-000004', '7a000000-0000-4000-8000-000000000602', 'DRAFT', NULL, NULL, NULL, 20000, '7a000000-0000-4000-8000-000000000110'),
    ('7a000000-0000-4000-8000-000000000705', '7a000000-0000-4000-8000-000000000001', 'QT-1997-000005', '7a000000-0000-4000-8000-000000000607', 'DRAFT', NULL, NULL, NULL, 20000, '7a000000-0000-4000-8000-000000000109');
INSERT INTO crm.quotation_items (id, organization_id, quotation_id, product_type_code, product_model, quantity, unit_price) VALUES
    ('7a000000-0000-4000-8000-000000000e11', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000705', 'IPHONE', 'iPhone ร่าง', 1, 20000),
    ('7a000000-0000-4000-8000-000000000e12', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000701', 'IPHONE', 'iPhone ส่งแล้ว', 1, 49900);

INSERT INTO crm.tasks (id, organization_id, task_no, task_type_code, title, customer_id, lead_id, branch_id, owner_staff_id, status, due_at,
                       completed_at, is_next_action, created_by) VALUES
    ('7a000000-0000-4000-8000-000000000801', '7a000000-0000-4000-8000-000000000001', 'TK-1997-000001', 'CALL',      'ติดต่อกลับ',       NULL,                                   '7a000000-0000-4000-8000-000000000501', '7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000109', 'OPEN', now() + interval '1 day', NULL, true,  '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000802', '7a000000-0000-4000-8000-000000000001', 'TK-1997-000002', 'FOLLOW_UP', 'ติดตามลูกค้าสอง',  '7a000000-0000-4000-8000-000000000202', NULL, '7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000110', 'OPEN', now() + interval '1 day', NULL, false, '7a000000-0000-4000-8000-000000000110'),
    ('7a000000-0000-4000-8000-000000000803', '7a000000-0000-4000-8000-000000000001', 'TK-1997-000003', 'OTHER',     'งานไม่มีผู้รับ',    '7a000000-0000-4000-8000-000000000204', NULL, '7a000000-0000-4000-8000-000000000011', NULL,                                   'OPEN', now() + interval '1 day', NULL, false, '7a000000-0000-4000-8000-000000000106'),
    ('7a000000-0000-4000-8000-000000000804', '7a000000-0000-4000-8000-000000000001', 'TK-1997-000004', 'CALL',      'งานเสร็จแล้ว',      '7a000000-0000-4000-8000-000000000201', NULL, '7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000109', 'DONE', now() - interval '1 day', now() - interval '1 hour', false, '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000805', '7a000000-0000-4000-8000-000000000001', 'TK-1997-000005', 'FOLLOW_UP', 'งานสาขาสอง',        '7a000000-0000-4000-8000-000000000203', NULL, '7a000000-0000-4000-8000-000000000012', '7a000000-0000-4000-8000-000000000119', 'OPEN', now() + interval '1 day', NULL, false, '7a000000-0000-4000-8000-000000000119'),
    ('7a000000-0000-4000-8000-000000000806', '7a000000-0000-4000-8000-000000000001', 'TK-1997-000006', 'FOLLOW_UP', 'ติดตามลูกค้าหนึ่ง', '7a000000-0000-4000-8000-000000000201', NULL, '7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000109', 'OPEN', now() + interval '1 day', NULL, false, '7a000000-0000-4000-8000-000000000109');
INSERT INTO crm.task_comments (id, organization_id, task_id, body, created_by)
    VALUES ('7a000000-0000-4000-8000-000000000e21', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000801', 'ความเห็นทดสอบ', '7a000000-0000-4000-8000-000000000109');

INSERT INTO crm.transaction_refs (id, organization_id, customer_id, branch_id, opportunity_id, transaction_type_code, source_system_code, external_no,
                                  transacted_at, amount, created_by) VALUES
    ('7a000000-0000-4000-8000-000000000e31', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000201', '7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000604', 'SALE', 'MANUAL', 'RLS-TXN-001', now() - interval '1 day', 1000, '7a000000-0000-4000-8000-000000000109'),
    ('7a000000-0000-4000-8000-000000000e32', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000203', '7a000000-0000-4000-8000-000000000012', NULL, 'SALE', 'MANUAL', 'RLS-TXN-002', now() - interval '1 day', 2000, '7a000000-0000-4000-8000-000000000119');

INSERT INTO crm.notifications (id, organization_id, recipient_staff_id, code, entity_type, entity_ref, title, read_at, dedupe_key) VALUES
    ('7a000000-0000-4000-8000-000000000f01', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000109', 'FOLLOWUP_OVERDUE', 'TASK', 'TK-1997-000006', 'ติดตามเกินกำหนด', NULL,  'FOLLOWUP_OVERDUE:rls1:0:1997-01-01'),
    ('7a000000-0000-4000-8000-000000000f02', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000109', 'TASK_OVERDUE',     'TASK', 'TK-1997-000001', 'งานเกินกำหนด',   now(), 'TASK_OVERDUE:rls2:0:1997-01-01'),
    ('7a000000-0000-4000-8000-000000000f03', '7a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000110', 'FOLLOWUP_OVERDUE', 'TASK', 'TK-1997-000002', 'ติดตามเกินกำหนด', NULL,  'FOLLOWUP_OVERDUE:rls3:0:1997-01-01');
INSERT INTO crm.ownership_changes (id, organization_id, entity_type, entity_id, from_staff_id, to_staff_id, reason_code, changed_by)
    VALUES ('7a000000-0000-4000-8000-000000000f11', '7a000000-0000-4000-8000-000000000001', 'LEAD', '7a000000-0000-4000-8000-000000000502',
            '7a000000-0000-4000-8000-000000000109', '7a000000-0000-4000-8000-000000000110', 'SHIFT_CHANGE', '7a000000-0000-4000-8000-000000000106');
INSERT INTO crm.campaigns (id, organization_id, code, name_th)
    VALUES ('7a000000-0000-4000-8000-000000000f21', '7a000000-0000-4000-8000-000000000001', 'RLS-CAMP', 'แคมเปญทดสอบ');
INSERT INTO core.devices (id, organization_id, device_id, branch_id, is_shared_counter)
    VALUES ('7a000000-0000-4000-8000-000000000f31', '7a000000-0000-4000-8000-000000000001', 'RLS-DEVICE-1', '7a000000-0000-4000-8000-000000000011', true);

SELECT set_config('app.bulk', 'off', true);
-- หมายเหตุผู้เขียน: seed ตั้ง app.seed_mode = on (CANONICAL ข้อ 13.0 ข้อ 7) · รีเซ็ตในทรานแซกชันของไฟล์ทดสอบ
-- เพื่อให้ guard ของบล็อก M ทำงานเหมือนกันทั้งกรณีมีและไม่มี seed
SELECT set_config('app.seed_mode', 'off', true);

-- ===== rls_06_work =====
SELECT test.login_as('rls.p09@example.com', 'aal1');
SELECT test.assert_eq(test.count_rows('SELECT id FROM crm.tasks'), 3::bigint, 'W01 STA tasks (O · ไม่มี read-through) 3');
SELECT test.assert_eq(test.count_rows('SELECT id FROM crm.quotations'), 4::bigint, 'W02 STA quotations TR1 4');
INSERT INTO crm.quotations (opportunity_id, total_amount, terms_note) VALUES ('7a000000-0000-4000-8000-000000000607', 30000, 'ใบใหม่ STA');
SELECT test.assert_eq((SELECT status::text || '|' || owner_staff_id::text || '|' || customer_id::text || '|' || branch_id::text FROM crm.quotations WHERE terms_note = 'ใบใหม่ STA'),
    'DRAFT|7a000000-0000-4000-8000-000000000109|7a000000-0000-4000-8000-000000000201|7a000000-0000-4000-8000-000000000011', 'W03 quotation ใหม่: DRAFT · owner/customer/branch จาก opportunity');
INSERT INTO crm.quotation_items (quotation_id, product_type_code, quantity, unit_price) VALUES ('7a000000-0000-4000-8000-000000000705', 'IPAD', 1, 1000);
SELECT test.assert_raises($$INSERT INTO crm.quotation_items (quotation_id, product_type_code, quantity, unit_price) VALUES ('7a000000-0000-4000-8000-000000000701', 'IPAD', 1, 1000)$$, 'W04 item ของใบที่ส่งแล้ว', '42501');
SELECT test.assert_eq(test.exec_count($$DELETE FROM crm.quotation_items WHERE id = '7a000000-0000-4000-8000-000000000e12'$$), 0::bigint, 'W04 ลบ item ของใบที่ส่งแล้ว = 0');
INSERT INTO crm.tasks (task_type_code, title, customer_id, branch_id, due_at) VALUES ('OTHER', 'งานลูกค้าหนึ่ง STA', '7a000000-0000-4000-8000-000000000201', '7a000000-0000-4000-8000-000000000011', now() + interval '1 day');
INSERT INTO crm.tasks (task_type_code, title, branch_id, due_at) VALUES ('OTHER', 'งานไม่มีแม่ STA', '7a000000-0000-4000-8000-000000000011', now() + interval '1 day');
SELECT test.assert_raises($$INSERT INTO crm.tasks (task_type_code, title, branch_id, due_at) VALUES ('OTHER', 'x', '7a000000-0000-4000-8000-000000000012', now())$$, 'W05 งานไม่มีแม่นอกสาขา', '42501');
SELECT test.assert_denied($$INSERT INTO crm.tasks (task_type_code, title, lead_id, branch_id, owner_staff_id, due_at) VALUES ('CALL', 'x', '7a000000-0000-4000-8000-000000000501', '7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000110', now())$$, 'T80', 'W06 STA สร้างงานให้ STB');
INSERT INTO crm.task_comments (task_id, body) VALUES ('7a000000-0000-4000-8000-000000000801', 'ความเห็น STA');
SELECT test.assert_eq(test.count_rows('SELECT id FROM crm.notifications WHERE read_at IS NULL'), 1::bigint, 'W07 STA แจ้งเตือนยังไม่อ่าน 1');
SELECT test.assert_eq(test.exec_count('UPDATE crm.notifications SET read_at = now()'), 2::bigint, 'W08 อ่านแล้วได้เฉพาะของตน');
SELECT test.assert_raises($$UPDATE crm.notifications SET title = 'x'$$, 'W09 title ไม่อยู่ใน grant', '42501');
SELECT test.assert_eq(test.count_rows('SELECT id FROM crm.campaigns'), 0::bigint, 'W10 STA ไม่มี campaign.read');

SELECT test.login_as('rls.p10@example.com', 'aal1');
SELECT test.assert_eq(test.count_rows($$SELECT id FROM crm.tasks WHERE id = '7a000000-0000-4000-8000-000000000801'$$), 0::bigint, 'W11 STB อ่านงานของ STA = 0');
SELECT test.assert_eq(test.count_rows($$SELECT id FROM crm.task_comments$$), 0::bigint, 'W11 STB ความเห็นงานของ STA = 0');
SELECT test.assert_raises($$INSERT INTO crm.task_comments (task_id, body) VALUES ('7a000000-0000-4000-8000-000000000801', 'x')$$, 'W12 STB เพิ่มความเห็นงานของ STA', '42501');
SELECT test.assert_raises($$INSERT INTO crm.tasks (task_type_code, title, lead_id, branch_id, owner_staff_id, due_at) VALUES ('CALL', 'x', '7a000000-0000-4000-8000-000000000501', '7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000110', now())$$, 'W13 task.create O ประเมินกับ lead แม่', '42501');
SELECT test.assert_raises($$INSERT INTO crm.quotations (opportunity_id) VALUES ('7a000000-0000-4000-8000-000000000607')$$, 'W14 STB สร้างใบเสนอราคาของ OP ของ STA', '42501');

SELECT test.login_as('rls.p08@example.com', 'aal2');
SELECT test.assert_eq(test.count_rows('SELECT id FROM crm.tasks'), 4::bigint, 'W15 SV1 tasks ที่ owner อยู่ในทีม (งาน owner ว่างที่ STA สร้างไม่นับ) 4');
INSERT INTO crm.tasks (task_type_code, title, customer_id, branch_id, owner_staff_id, due_at) VALUES ('FOLLOW_UP', 'SV1 มอบ STB', '7a000000-0000-4000-8000-000000000202', '7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000110', now() + interval '1 day');
SELECT test.assert_eq(test.exec_count($$UPDATE crm.task_comments SET body = 'SV1 แก้' WHERE id = '7a000000-0000-4000-8000-000000000e21'$$), 1::bigint, 'W16 SV1 แก้ความเห็นงานของทีม');

SELECT test.login_as('rls.p06@example.com', 'aal2');
SELECT test.assert_eq(test.count_rows('SELECT id FROM crm.tasks'), 8::bigint, 'W17 BM1 tasks TR1 8');
SELECT test.assert_eq(test.count_rows('SELECT id FROM crm.campaigns'), 1::bigint, 'W18 BM1 campaign.read B เห็นแคมเปญองค์กร');
SELECT test.assert_raises($$INSERT INTO crm.campaigns (code, name_th) VALUES ('RLS-BM', 'x')$$, 'W18 BM1 ไม่มี campaign.manage', '42501');
SELECT test.login_as('rls.p05@example.com', 'aal2');
INSERT INTO crm.campaigns (code, name_th) VALUES ('RLS-MK', 'แคมเปญ MK');
SELECT test.assert_eq(test.count_rows('SELECT id FROM crm.tasks'), 0::bigint, 'W19 MK tasks 0');
SELECT test.login_as('rls.p02@example.com', 'aal2');
SELECT test.assert_raises($$INSERT INTO crm.quotations (opportunity_id) VALUES ('7a000000-0000-4000-8000-000000000601')$$, 'W20 BA ไม่มี quotation.create', '42501');
