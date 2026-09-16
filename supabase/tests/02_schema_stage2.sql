-- =====================================================================================
-- supabase/tests/02_schema_stage2.sql — ทดสอบ migration 0005–0009 (schema stage 2)
--
-- ครอบคลุม: เลขอ้างอิงทุกชนิด (รวมขอบปี Asia/Bangkok · visit_no/queue_no แยกตัวนับ · เกินหลักไม่ตัด) ·
--           CHECK ของ visits/interactions/transaction_refs/leads/opportunities/quotations/tasks/notifications/export_requests ·
--           first_seen_at least() + invariant · แคช last_* has_* · customer_branches · lifecycle ทุกขั้น ·
--           lead NEW → CONTACTED · ประวัติสถานะ · next-action task sync · opportunity → QUOTATION · expected_amount · note_summary ·
--           guard เลขบัตรประชาชน · SYSTEM_ADMIN/MARKETING+BA · สมาชิกทีม · audit (masked + sha256 · actor · header · append-only · redaction · retention) ·
--           view security_invoker · ฟังก์ชัน SECURITY DEFINER มี search_path · สิทธิ์ EXECUTE
--
-- run.mjs ครอบไฟล์นี้ด้วย BEGIN … ROLLBACK · ผ่านได้ทั้งแบบมีและไม่มี --seed:
--   · ข้อมูลทดสอบใช้รหัสที่ไม่ชน seed: องค์กร TEST-S2 · สาขา TS1 TS2 · ST-98xx · วันที่ปี 2031–2041 (ตัวนับที่ seed ไม่มี)
--   · ตัวนับที่ seed อาจมี (CUS:2026 · ST) ตรวจแบบสัมพัทธ์กับค่าก่อนหน้า
--   · ทำงานในฐานะ superuser ของ PGlite (ยังไม่มี GRANT/RLS policy ของ stage 3)
-- =====================================================================================


-- =====================================================================================
-- 0. fixture
-- =====================================================================================

CREATE TEMP TABLE t_ctx (k text PRIMARY KEY, v text);

INSERT INTO core.organizations (id, code, name_th) VALUES ('5f000000-0000-4000-8000-000000000001', 'TEST-S2', 'องค์กรทดสอบ stage 2');
INSERT INTO core.business_units (id, organization_id, code, name_th)
    VALUES ('5f000000-0000-4000-8000-000000000002', '5f000000-0000-4000-8000-000000000001', 'TBU2', 'หน่วยทดสอบ 2');
INSERT INTO core.branches (id, organization_id, business_unit_id, code, name_th, branch_type) VALUES
    ('5f000000-0000-4000-8000-000000000003', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000002', 'TS1', 'สาขาทดสอบ 1', 'store'),
    ('5f000000-0000-4000-8000-000000000004', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000002', 'TS2', 'สาขาทดสอบ 2', 'store');
INSERT INTO core.teams (id, organization_id, branch_id, code, name_th)
    VALUES ('5f000000-0000-4000-8000-000000000005', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000003', 'TS1-SALES', 'ทีมขายทดสอบ');
INSERT INTO auth.users (id, email) VALUES
    ('5f000000-0000-4000-8000-0000000000a1', 's2.one@example.com'),
    ('5f000000-0000-4000-8000-0000000000a2', 's2.two@example.com');
INSERT INTO core.staff_profiles (id, organization_id, staff_code, employee_code, display_name, email, user_id, status, invite_expires_at) VALUES
    ('5f000000-0000-4000-8000-000000000011', '5f000000-0000-4000-8000-000000000001', 'ST-9811', 'EMP-S2-11', 'คุณทดสอบขวัญ', 's2.one@example.com', '5f000000-0000-4000-8000-0000000000a1', 'ACTIVE', NULL),
    ('5f000000-0000-4000-8000-000000000012', '5f000000-0000-4000-8000-000000000001', 'ST-9812', 'EMP-S2-12', 'คุณทดสอบคิม',  's2.two@example.com', '5f000000-0000-4000-8000-0000000000a2', 'ACTIVE', NULL),
    ('5f000000-0000-4000-8000-000000000013', '5f000000-0000-4000-8000-000000000001', 'ST-9813', 'EMP-S2-13', 'คุณทดสอบสาม', 's2.three@example.com', NULL, 'INVITED', now() + interval '24 hours'),
    ('5f000000-0000-4000-8000-000000000015', '5f000000-0000-4000-8000-000000000001', 'ST-9815', 'EMP-S2-15', 'คุณทดสอบห้า', 's2.five@example.com', NULL, 'INVITED', now() + interval '24 hours'),
    ('5f000000-0000-4000-8000-000000000016', '5f000000-0000-4000-8000-000000000001', 'ST-9816', 'EMP-S2-16', 'คุณทดสอบหก', 's2.six@example.com', NULL, 'INVITED', now() + interval '24 hours'),
    ('5f000000-0000-4000-8000-000000000017', '5f000000-0000-4000-8000-000000000001', 'ST-9817', 'EMP-S2-17', 'คุณทดสอบเจ็ด', 's2.seven@example.com', NULL, 'INVITED', now() + interval '24 hours'),
    ('5f000000-0000-4000-8000-000000000018', '5f000000-0000-4000-8000-000000000001', 'ST-9818', 'EMP-S2-18', 'คุณทดสอบแปด', 's2.eight@example.com', NULL, 'INVITED', now() + interval '24 hours');
INSERT INTO core.staff_role_assignments (organization_id, staff_id, role_code, branch_id) VALUES
    ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000011', 'STAFF', '5f000000-0000-4000-8000-000000000003'),
    ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000012', 'STAFF', '5f000000-0000-4000-8000-000000000003');

-- ลูกค้ากลางสำหรับทดสอบ CHECK
INSERT INTO crm.customers (id, organization_id, customer_no, first_name, first_seen_at, first_channel_code, first_branch_id, created_via) VALUES
    ('5f000000-0000-4000-8000-000000000199', '5f000000-0000-4000-8000-000000000001', 'CUS-1998-000199', 'ลูกค้าCHECK', '2031-01-01T10:00:00+07:00', 'LINE', '5f000000-0000-4000-8000-000000000003', 'QUICK_CAPTURE');


-- =====================================================================================
-- 1. เลขอ้างอิง (ข้อ 6.1)
-- =====================================================================================

-- 1.1 ขอบปีตาม Asia/Bangkok: 2026-12-31 17:30Z = 1 ม.ค. 2027 00:30 น. → CUS:2027 · 16:59:59Z = 31 ธ.ค. 2026 → CUS:2026
INSERT INTO t_ctx VALUES
    ('cus2027_before', coalesce((SELECT last_value FROM app.running_numbers WHERE scope_key = 'CUS:2027'), 0)::text),
    ('cus2026_before', coalesce((SELECT last_value FROM app.running_numbers WHERE scope_key = 'CUS:2026'), 0)::text);
INSERT INTO crm.customers (id, organization_id, first_name, last_name, first_seen_at, created_at, created_via) VALUES
    ('5f000000-0000-4000-8000-000000000101', '5f000000-0000-4000-8000-000000000001', 'สมชาย', 'ทดสอบ', '2026-12-31T17:30:00Z', '2026-12-31T17:30:00Z', 'QUICK_CAPTURE');
INSERT INTO crm.customers (id, organization_id, first_name, first_seen_at, created_at, created_via) VALUES
    ('5f000000-0000-4000-8000-000000000102', '5f000000-0000-4000-8000-000000000001', 'สมหญิง', '2026-12-31T16:59:59Z', '2026-12-31T16:59:59Z', 'QUICK_CAPTURE');
SELECT test.assert_eq((SELECT customer_no FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000101'),
    'CUS-2027-' || app.format_running_number((SELECT v::bigint + 1 FROM t_ctx WHERE k = 'cus2027_before'), 6),
    'created_at 2026-12-31 17:30:00+00 → CUS-2027-… (ปีตาม Asia/Bangkok)');
SELECT test.assert_eq((SELECT customer_no FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000102'),
    'CUS-2026-' || app.format_running_number((SELECT v::bigint + 1 FROM t_ctx WHERE k = 'cus2026_before'), 6),
    'created_at 2026-12-31 16:59:59+00 → CUS-2026-… (ยังเป็นปี 2026)');
SELECT test.assert_eq((SELECT last_value FROM app.running_numbers WHERE scope_key = 'CUS:2027'),
    (SELECT v::bigint + 1 FROM t_ctx WHERE k = 'cus2027_before'), 'ตัวนับ CUS:2027 เพิ่ม 1 (upsert)');

-- 1.2 แถวที่มีเลขอยู่แล้วไม่ถูกเขียนทับและไม่เลื่อนตัวนับ
INSERT INTO crm.customers (id, organization_id, customer_no, first_name, first_seen_at, created_via) VALUES
    ('5f000000-0000-4000-8000-000000000103', '5f000000-0000-4000-8000-000000000001', 'CUS-1998-000001', 'นำเข้า', '2031-01-01T00:00:00+07:00', 'IMPORT');
SELECT test.assert_eq((SELECT customer_no FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000103'), 'CUS-1998-000001', 'customer_no ที่ใส่มาไม่ถูกเขียนทับ');
SELECT test.assert_eq((SELECT count(*) FROM app.running_numbers WHERE scope_key = 'CUS:1998'), 0::bigint, 'ใส่เลขเองไม่สร้าง/เลื่อนตัวนับ');

-- 1.3 เลขพนักงาน ST-{NNNN}
INSERT INTO t_ctx VALUES ('st_before', coalesce((SELECT last_value FROM app.running_numbers WHERE scope_key = 'ST'), 0)::text);
INSERT INTO core.staff_profiles (id, organization_id, employee_code, display_name, email, status, invite_expires_at)
    VALUES ('5f000000-0000-4000-8000-000000000014', '5f000000-0000-4000-8000-000000000001', 'EMP-S2-14', 'คุณทดสอบสี่', 's2.four@example.com', 'INVITED', now() + interval '24 hours');
SELECT test.assert_eq((SELECT staff_code FROM core.staff_profiles WHERE id = '5f000000-0000-4000-8000-000000000014'),
    'ST-' || app.format_running_number((SELECT v::bigint + 1 FROM t_ctx WHERE k = 'st_before'), 4), 'staff_code = ST-{NNNN} จากตัวนับ ST');

-- 1.4 เกินหลักไม่ตัด (lpad ตัดเลข จึงต้องใช้ app.format_running_number)
SELECT test.assert_eq(app.format_running_number(1234567, 6), '1234567', 'format_running_number เกินหลักไม่ตัด');
SELECT test.assert_eq(app.format_running_number(297, 6), '000297', 'format_running_number เติม 0 ครบ 6 หลัก');
INSERT INTO app.running_numbers (scope_key, last_value) VALUES ('TK:2041', 999999);
INSERT INTO crm.tasks (id, organization_id, task_type_code, title, branch_id, due_at, created_at)
    VALUES ('5f000000-0000-4000-8000-000000000690', '5f000000-0000-4000-8000-000000000001', 'OTHER', 'งานทดสอบเลขเกินหลัก',
            '5f000000-0000-4000-8000-000000000003', '2041-06-02T10:00:00+07:00', '2041-06-01T10:00:00+07:00');
SELECT test.assert_eq((SELECT task_no FROM crm.tasks WHERE id = '5f000000-0000-4000-8000-000000000690'), 'TK-2041-1000000', 'TK ลำดับที่ 1,000,000 → TK-2041-1000000');

-- 1.5 visit_no ทุกช่องทาง · queue_no เฉพาะ WALK_IN (ตัวนับแยก) · วันจาก started_at ตาม Asia/Bangkok · แยกสาขา
INSERT INTO crm.visits (id, organization_id, branch_id, channel_code, status, interest_code, started_at, owner_staff_id) VALUES
    ('5f000000-0000-4000-8000-000000000201', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000003', 'WALK_IN', 'WAITING',    'BUY',    '2031-03-15T10:05:00+07:00', NULL),
    ('5f000000-0000-4000-8000-000000000202', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000003', 'LINE',    'IN_SERVICE', NULL,     '2031-03-15T10:10:00+07:00', '5f000000-0000-4000-8000-000000000011'),
    ('5f000000-0000-4000-8000-000000000203', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000003', 'WALK_IN', 'WAITING',    'REPAIR', '2031-03-15T10:12:00+07:00', NULL),
    ('5f000000-0000-4000-8000-000000000204', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000003', 'WALK_IN', 'WAITING',    'INQUIRY','2031-03-15T23:30:00+07:00', NULL),
    ('5f000000-0000-4000-8000-000000000205', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000003', 'WALK_IN', 'WAITING',    'BUY',    '2031-03-15T17:30:00Z',      NULL),
    ('5f000000-0000-4000-8000-000000000206', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000004', 'WALK_IN', 'WAITING',    'BUY',    '2031-03-15T11:00:00+07:00', NULL);
SELECT test.assert_eq(
    (SELECT string_agg(visit_no || ':' || coalesce(queue_no::text, '-'), ' ' ORDER BY id) FROM crm.visits
     WHERE id BETWEEN '5f000000-0000-4000-8000-000000000201' AND '5f000000-0000-4000-8000-000000000206'),
    'V-TS1-310315-001:1 V-TS1-310315-002:- V-TS1-310315-003:2 V-TS1-310315-004:3 V-TS1-310316-001:1 V-TS2-310315-001:1',
    'visit_no ต่อ (สาขา, วัน) ทุกช่องทาง · queue_no เฉพาะ WALK_IN ตัวนับแยก · 17:30Z เป็นวันถัดไป · สาขาอื่นเริ่มใหม่');
SELECT test.assert_eq(
    (SELECT string_agg(scope_key || '=' || last_value, ' ' ORDER BY scope_key) FROM app.running_numbers WHERE scope_key LIKE '%:TS_:2031031_'),
    'QUEUE:TS1:20310315=3 QUEUE:TS1:20310316=1 QUEUE:TS2:20310315=1 VISIT:TS1:20310315=4 VISIT:TS1:20310316=1 VISIT:TS2:20310315=1',
    'ตัวนับ VISIT:{branch}:{YYYYMMDD} และ QUEUE:{branch}:{YYYYMMDD} แยกกัน');
SELECT test.assert_eq((SELECT service_started_at FROM crm.visits WHERE id = '5f000000-0000-4000-8000-000000000202'),
    '2031-03-15T10:10:00+07:00'::timestamptz, 'visit ที่สร้างเป็น IN_SERVICE: service_started_at = started_at');

-- 1.6 RG (4 หลัก) · EX · MG · DSR (ปีจาก created_at)
INSERT INTO core.role_grant_requests (id, organization_id, role_code, target_staff_id, requested_by, created_at)
    VALUES ('5f000000-0000-4000-8000-000000000901', '5f000000-0000-4000-8000-000000000001', 'SYSTEM_ADMIN',
            '5f000000-0000-4000-8000-000000000013', '5f000000-0000-4000-8000-000000000011', '2033-01-05T10:00:00+07:00');
INSERT INTO audit.export_requests (id, organization_id, requested_by, requested_as_role, reason_code, created_at)
    VALUES ('5f000000-0000-4000-8000-000000000902', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000011',
            'MARKETING', 'MANAGEMENT_REPORT', '2033-01-05T10:00:00+07:00');
INSERT INTO crm.customer_merges (id, organization_id, survivor_customer_id, merged_customer_id, reason, snapshot, merged_by, created_at)
    VALUES ('5f000000-0000-4000-8000-000000000903', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000102',
            '5f000000-0000-4000-8000-000000000103', 'ทดสอบเลข MG', '{"merged": {"first_name": "นำเข้า"}}', '5f000000-0000-4000-8000-000000000011', '2033-01-05T10:00:00+07:00');
INSERT INTO crm.data_subject_requests (id, organization_id, requester_name, request_type, received_by, created_at)
    VALUES ('5f000000-0000-4000-8000-000000000904', '5f000000-0000-4000-8000-000000000001', 'ผู้ยื่นทดสอบ', 'ACCESS',
            '5f000000-0000-4000-8000-000000000011', '2033-01-05T10:00:00+07:00');
SELECT test.assert_eq(
    (SELECT request_no FROM core.role_grant_requests WHERE id = '5f000000-0000-4000-8000-000000000901') || ' ' ||
    (SELECT export_no  FROM audit.export_requests    WHERE id = '5f000000-0000-4000-8000-000000000902') || ' ' ||
    (SELECT merge_no   FROM crm.customer_merges      WHERE id = '5f000000-0000-4000-8000-000000000903') || ' ' ||
    (SELECT request_no FROM crm.data_subject_requests WHERE id = '5f000000-0000-4000-8000-000000000904'),
    'RG-2033-0001 EX-2033-000001 MG-2033-000001 DSR-2033-000001',
    'รูปแบบ RG-{YYYY}-{NNNN} · EX/MG/DSR-{YYYY}-{NNNNNN}');


-- =====================================================================================
-- 2. CHECK ของตารางกิจกรรม (ข้อ 4.1 · 4.2 · 3.3 · 6.10)
-- =====================================================================================

SELECT test.assert_raises($$INSERT INTO crm.visits (organization_id, branch_id, channel_code, status, queue_no, started_at, owner_staff_id)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000003', 'LINE', 'IN_SERVICE', 5, now(), '5f000000-0000-4000-8000-000000000011')$$,
    'queue_no มีได้เฉพาะ WALK_IN', '23514');
SELECT test.assert_raises($$INSERT INTO crm.visits (organization_id, branch_id, channel_code, status, started_at)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000003', 'WALK_IN', 'WAITING', now())$$,
    'WALK_IN ต้องมี interest_code', '23514');
SELECT test.assert_raises($$INSERT INTO crm.visits (organization_id, branch_id, channel_code, status, interest_code, party_size, started_at)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000003', 'WALK_IN', 'WAITING', 'BUY', 0, now())$$,
    'party_size ≥ 1', '23514');
SELECT test.assert_raises($$INSERT INTO crm.visits (organization_id, branch_id, channel_code, status, started_at)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000003', 'PHONE', 'WAITING', now())$$,
    'WAITING มีได้เฉพาะ walk-in (ออนไลน์/โทรเริ่ม IN_SERVICE)', '23514');
SELECT test.assert_raises($$INSERT INTO crm.visits (organization_id, branch_id, channel_code, status, started_at)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000003', 'LINE', 'IN_SERVICE', now())$$,
    'IN_SERVICE ต้องมีผู้รับ', '23514');
SELECT test.assert_raises($$UPDATE crm.visits SET status = 'COMPLETED', ended_at = '2031-03-15T11:00:00+07:00' WHERE id = '5f000000-0000-4000-8000-000000000202'$$,
    'COMPLETED ต้องมี outcome_code', '23514');
SELECT test.assert_raises($$UPDATE crm.visits SET status = 'COMPLETED', outcome_code = 'SERVICE_DONE' WHERE id = '5f000000-0000-4000-8000-000000000202'$$,
    'COMPLETED ต้องมี ended_at', '23514');
SELECT test.assert_raises($$UPDATE crm.visits SET status = 'COMPLETED', outcome_code = 'PURCHASED', ended_at = '2031-03-15T11:00:00+07:00' WHERE id = '5f000000-0000-4000-8000-000000000202'$$,
    'outcome PURCHASED ต้องมี customer_id', '23514');
SELECT test.assert_raises($$UPDATE crm.visits SET status = 'COMPLETED', outcome_code = 'UNRECORDED', ended_at = '2031-03-15T23:59:59+07:00' WHERE id = '5f000000-0000-4000-8000-000000000202'$$,
    'UNRECORDED ใช้ได้เฉพาะระบบปิด (closed_by_system)', '23514');
SELECT test.assert_raises($$UPDATE crm.visits SET status = 'CANCELLED' WHERE id = '5f000000-0000-4000-8000-000000000203'$$,
    'CANCELLED ต้องมี cancel_reason', '23514');
SELECT test.assert_raises($$UPDATE crm.visits SET status = 'IN_SERVICE' WHERE id = '5f000000-0000-4000-8000-000000000203'$$,
    'WAITING → IN_SERVICE โดยไม่ตั้งผู้รับถูกปฏิเสธ', '23514');
UPDATE crm.visits SET status = 'IN_SERVICE', owner_staff_id = '5f000000-0000-4000-8000-000000000011' WHERE id = '5f000000-0000-4000-8000-000000000201';
SELECT test.assert_true((SELECT service_started_at IS NOT NULL AND service_started_at >= started_at FROM crm.visits WHERE id = '5f000000-0000-4000-8000-000000000201'),
    'รับคิว WAITING → IN_SERVICE: trigger ตั้ง service_started_at');
UPDATE crm.visits SET status = 'LEFT', ended_at = '2031-03-15T10:30:00+07:00' WHERE id = '5f000000-0000-4000-8000-000000000203';
SELECT test.assert_eq((SELECT outcome_code FROM crm.visits WHERE id = '5f000000-0000-4000-8000-000000000203'), 'LEFT_BEFORE_SERVICE', 'LEFT → outcome LEFT_BEFORE_SERVICE อัตโนมัติ');
SELECT test.assert_raises($$UPDATE crm.visits SET status = 'COMPLETED', outcome_code = 'LEFT_BEFORE_SERVICE' WHERE id = '5f000000-0000-4000-8000-000000000203'$$,
    'LEFT_BEFORE_SERVICE ใช้ได้เฉพาะสถานะ LEFT', '23514');
UPDATE crm.visits SET status = 'CANCELLED', cancel_reason = 'สร้างผิด' WHERE id = '5f000000-0000-4000-8000-000000000204';
UPDATE crm.visits SET status = 'COMPLETED', outcome_code = 'UNRECORDED', ended_at = '2031-03-16T23:59:59+07:00', closed_by_system = true WHERE id = '5f000000-0000-4000-8000-000000000205';
SELECT test.assert_eq((SELECT string_agg(status::text || '/' || coalesce(outcome_code, '-'), ',' ORDER BY id) FROM crm.visits
                       WHERE id IN ('5f000000-0000-4000-8000-000000000204', '5f000000-0000-4000-8000-000000000205')),
    'CANCELLED/-,COMPLETED/UNRECORDED', 'CANCELLED + เหตุผล และปิดโดยระบบ COMPLETED + UNRECORDED บันทึกได้');

-- interactions
INSERT INTO crm.interactions (id, organization_id, visit_id, is_visit_root, branch_id, channel_code, direction, interaction_type_code, occurred_at)
    VALUES ('5f000000-0000-4000-8000-000000000251', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000201', true,
            '5f000000-0000-4000-8000-000000000003', 'WALK_IN', 'INBOUND', 'VISIT', '2031-03-15T10:05:00+07:00');
SELECT test.assert_raises($$INSERT INTO crm.interactions (organization_id, visit_id, is_visit_root, branch_id, channel_code, direction, interaction_type_code)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000201', true, '5f000000-0000-4000-8000-000000000003', 'WALK_IN', 'INBOUND', 'INQUIRY')$$,
    'visit หนึ่งรายการมี interaction ต้นทางได้รายการเดียว', '23505');
SELECT test.assert_raises($$INSERT INTO crm.interactions (organization_id, visit_id, is_visit_root, branch_id, channel_code, direction, interaction_type_code)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000202', true, '5f000000-0000-4000-8000-000000000003', 'LINE', 'OUTBOUND', 'MESSAGE')$$,
    'interaction ต้นทางของ visit ต้องเป็น INBOUND', '23514');
SELECT test.assert_raises($$INSERT INTO crm.interactions (organization_id, branch_id, channel_code, direction, interaction_type_code)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000003', 'LINE', 'INBOUND', 'NOTE')$$,
    'ประเภท NOTE ใช้กับ INTERNAL เท่านั้น', '23514');
SELECT test.assert_raises($$INSERT INTO crm.interactions (organization_id, visit_id, branch_id, channel_code, direction, interaction_type_code)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000201', '5f000000-0000-4000-8000-000000000004', 'WALK_IN', 'INBOUND', 'INQUIRY')$$,
    'interaction ต้องอยู่สาขาเดียวกับ visit (FK visit_id, branch_id)', '23503');

-- transaction_refs
INSERT INTO crm.transaction_refs (organization_id, customer_id, branch_id, transaction_type_code, source_system_code, external_no, transacted_at, amount, device_imei)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000199', '5f000000-0000-4000-8000-000000000003',
            'REPAIR', 'MANUAL', 'S2-REPAIR-0001', '2031-02-01T10:00:00+07:00', 1500, '356789012345678');
SELECT test.assert_raises($$INSERT INTO crm.transaction_refs (organization_id, customer_id, branch_id, transaction_type_code, source_system_code, external_no, transacted_at)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000199', '5f000000-0000-4000-8000-000000000003', 'REPAIR', 'MANUAL', 'S2-REPAIR-0001', now())$$,
    'UNIQUE(source_system_code, external_no)', '23505');
SELECT test.assert_raises($$INSERT INTO crm.transaction_refs (organization_id, customer_id, branch_id, transaction_type_code, source_system_code, external_no, transacted_at, device_imei)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000199', '5f000000-0000-4000-8000-000000000003', 'REPAIR', 'MANUAL', 'S2-REPAIR-0002', now(), '35678901234567')$$,
    'device_imei ต้องเป็นตัวเลข 15 หลัก', '23514');


-- =====================================================================================
-- 3. CHECK ของ lead · opportunity · quotation · task · notification · export (ข้อ 4.3 · 4.4 · 4.6 · 4.7 · 8.2 · 11.1)
-- =====================================================================================

-- lead (ข้อ 4.4 ย่อหน้าท้าย)
SELECT test.assert_raises($$INSERT INTO crm.leads (organization_id, customer_id, branch_id, channel_code, interest_code, status, priority_code, next_action_type_code, next_action_at)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000199', '5f000000-0000-4000-8000-000000000003', 'LINE', 'BUY', 'NEW', 'NORMAL', 'CALL', now())$$,
    'lead เปิดต้องมี next_action', '23514');
SELECT test.assert_raises($$INSERT INTO crm.leads (organization_id, customer_id, branch_id, channel_code, interest_code, status, next_action, next_action_type_code, next_action_at)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000199', '5f000000-0000-4000-8000-000000000003', 'LINE', 'BUY', 'NEW', 'ติดต่อกลับลูกค้า', 'CALL', now())$$,
    'lead เปิดต้องมี priority_code', '23514');
SELECT test.assert_raises($$INSERT INTO crm.leads (organization_id, customer_id, branch_id, channel_code, interest_code, status, priority_code, next_action, next_action_type_code, next_action_at, closed_at)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000199', '5f000000-0000-4000-8000-000000000003', 'LINE', 'BUY', 'QUALIFIED', 'NORMAL', 'x', 'CALL', now(), now())$$,
    'lead เปิดต้องไม่มี closed_at', '23514');
SELECT test.assert_raises($$INSERT INTO crm.leads (organization_id, customer_id, branch_id, channel_code, interest_code, status, closed_at)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000199', '5f000000-0000-4000-8000-000000000003', 'LINE', 'BUY', 'CONVERTED', now())$$,
    'CONVERTED ต้องมี converted_opportunity_id', '23514');
SELECT test.assert_raises($$INSERT INTO crm.leads (organization_id, customer_id, branch_id, channel_code, interest_code, status, closed_at)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000199', '5f000000-0000-4000-8000-000000000003', 'LINE', 'BUY', 'LOST', now())$$,
    'LOST ต้องมี lost_reason_code', '23514');
SELECT test.assert_raises($$INSERT INTO crm.leads (organization_id, customer_id, branch_id, channel_code, interest_code, status, lost_reason_code)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000199', '5f000000-0000-4000-8000-000000000003', 'LINE', 'BUY', 'LOST', 'PRICE')$$,
    'LOST ต้องมี closed_at', '23514');
SELECT test.assert_raises($$INSERT INTO crm.leads (organization_id, customer_id, branch_id, channel_code, interest_code, status, lost_reason_code, closed_at)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000199', '5f000000-0000-4000-8000-000000000003', 'LINE', 'BUY', 'LOST', 'OTHER', now())$$,
    'lost_reason OTHER ต้องมี lost_note', '23514');
SELECT test.assert_raises($$INSERT INTO crm.leads (organization_id, customer_id, branch_id, channel_code, interest_code, status, priority_code, next_action, next_action_type_code, next_action_at, first_contacted_at, created_at)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000199', '5f000000-0000-4000-8000-000000000003', 'LINE', 'BUY', 'NEW', 'NORMAL', 'x', 'CALL', now(), '2031-01-01T11:00:00+07:00', '2031-01-01T10:00:00+07:00')$$,
    'lead NEW ต้องยังไม่มี first_contacted_at', '23514');
INSERT INTO crm.leads (id, organization_id, customer_id, branch_id, channel_code, interest_code, status, lost_reason_code, lost_note, closed_at, created_at)
    VALUES ('5f000000-0000-4000-8000-000000000390', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000199', '5f000000-0000-4000-8000-000000000003',
            'LINE', 'BUY', 'LOST', 'OTHER', 'ลูกค้าย้ายต่างจังหวัด', '2031-01-02T10:00:00+07:00', '2031-01-01T10:00:00+07:00');
SELECT test.assert_true((SELECT lead_no ~ '^LD-2031-[0-9]{6,}$' FROM crm.leads WHERE id = '5f000000-0000-4000-8000-000000000390'),
    'lead LOST + OTHER + lost_note บันทึกได้ · lead_no = LD-2031-NNNNNN');

-- opportunity (CHECK ตรึงของข้อ 4.4)
INSERT INTO crm.opportunities (id, organization_id, customer_id, origin_channel_code, branch_id, owner_staff_id, stage, priority_code, next_action, next_action_type_code, next_action_at, created_at)
    VALUES ('5f000000-0000-4000-8000-000000000490', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000199', 'LINE',
            '5f000000-0000-4000-8000-000000000003', '5f000000-0000-4000-8000-000000000011', 'FOLLOW_UP', 'NORMAL', 'โทรติดตาม', 'CALL', '2031-01-05T10:00:00+07:00', '2031-01-02T10:00:00+07:00');
INSERT INTO crm.opportunities (id, organization_id, customer_id, origin_channel_code, branch_id, owner_staff_id, stage, won_amount, won_at, closed_at, created_at)
    VALUES ('5f000000-0000-4000-8000-000000000491', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000199', 'WALK_IN',
            '5f000000-0000-4000-8000-000000000003', '5f000000-0000-4000-8000-000000000011', 'WON', 28900, '2031-01-03T11:05:00+07:00', '2031-01-03T11:05:00+07:00', '2031-01-02T10:00:00+07:00');
INSERT INTO crm.opportunities (id, organization_id, customer_id, origin_channel_code, branch_id, stage, lost_reason_code, closed_at, created_at)
    VALUES ('5f000000-0000-4000-8000-000000000492', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000199', 'LINE',
            '5f000000-0000-4000-8000-000000000003', 'LOST', 'PRICE', '2031-01-04T10:00:00+07:00', '2031-01-02T10:00:00+07:00');
SELECT test.assert_eq((SELECT count(*) FROM crm.opportunities WHERE id IN ('5f000000-0000-4000-8000-000000000490', '5f000000-0000-4000-8000-000000000491', '5f000000-0000-4000-8000-000000000492')),
    3::bigint, 'opportunity เปิด · WON · LOST ที่ครบเงื่อนไขบันทึกได้ (LOST ไม่มี owner ได้)');
SELECT test.assert_raises($$UPDATE crm.opportunities SET stage = 'WON', won_amount = 0, won_at = now(), closed_at = now() WHERE id = '5f000000-0000-4000-8000-000000000490'$$,
    'WON ต้อง won_amount > 0', '23514');
SELECT test.assert_raises($$UPDATE crm.opportunities SET stage = 'WON', won_amount = 100, won_at = '2031-01-06T10:00:00+07:00', closed_at = '2031-01-06T10:01:00+07:00' WHERE id = '5f000000-0000-4000-8000-000000000490'$$,
    'WON ต้อง closed_at = won_at', '23514');
SELECT test.assert_raises($$UPDATE crm.opportunities SET stage = 'WON', won_amount = 100, closed_at = now() WHERE id = '5f000000-0000-4000-8000-000000000490'$$,
    'WON ต้องมี won_at', '23514');
SELECT test.assert_raises($$UPDATE crm.opportunities SET stage = 'WON', won_amount = 100, won_at = now(), closed_at = now(), lost_reason_code = 'PRICE' WHERE id = '5f000000-0000-4000-8000-000000000490'$$,
    'WON ต้องไม่มี lost_reason_code', '23514');
SELECT test.assert_raises($$UPDATE crm.opportunities SET stage = 'LOST', closed_at = now() WHERE id = '5f000000-0000-4000-8000-000000000490'$$,
    'LOST ต้องมี lost_reason_code', '23514');
SELECT test.assert_raises($$UPDATE crm.opportunities SET stage = 'LOST', lost_reason_code = 'PRICE', closed_at = now(), won_amount = 100 WHERE id = '5f000000-0000-4000-8000-000000000490'$$,
    'LOST ต้องไม่มี won_amount', '23514');
SELECT test.assert_raises($$UPDATE crm.opportunities SET owner_staff_id = NULL WHERE id = '5f000000-0000-4000-8000-000000000490'$$,
    'opportunity เปิดต้องมี owner_staff_id', '23514');
SELECT test.assert_raises($$UPDATE crm.opportunities SET next_action_at = NULL WHERE id = '5f000000-0000-4000-8000-000000000490'$$,
    'opportunity เปิดต้องมี next_action_at', '23514');
SELECT test.assert_raises($$UPDATE crm.opportunities SET won_at = now() WHERE id = '5f000000-0000-4000-8000-000000000490'$$,
    'opportunity เปิดต้องไม่มี won_at', '23514');
SELECT test.assert_raises($$UPDATE crm.opportunities SET stage = 'FOLLOW_UP' WHERE id = '5f000000-0000-4000-8000-000000000491'$$,
    'reopen โดยไม่ล้าง won_at/won_amount/closed_at ถูกปฏิเสธ', '23514');

-- quotation (ข้อ 4.6)
SELECT test.assert_raises($$INSERT INTO crm.quotations (organization_id, opportunity_id, status)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000490', 'SENT')$$,
    'quotation ที่ส่งแล้วต้องมี sent_channel_code', '23514');
SELECT test.assert_raises($$INSERT INTO crm.quotations (organization_id, opportunity_id, status, sent_at)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000490', 'DRAFT', now())$$,
    'DRAFT ต้องยังไม่มี sent_at', '23514');
SELECT test.assert_raises($$INSERT INTO crm.quotations (organization_id, opportunity_id, installment_months)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000490', 0)$$,
    'installment_months ≥ 1', '23514');
SELECT test.assert_raises($$INSERT INTO crm.quotations (organization_id, opportunity_id, status, sent_at, sent_channel_code, valid_until)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000490', 'SENT', '2031-01-05T10:00:00+07:00', 'LINE', '2031-01-04')$$,
    'valid_until ต้องไม่ก่อนวันที่ส่ง', '23514');

-- task: CHECK ล้วน (พัก trigger ที่เติมค่าให้)
SELECT set_config('session_replication_role', 'replica', true);
SELECT test.assert_raises($$INSERT INTO crm.tasks (organization_id, task_no, task_type_code, title, branch_id, due_at, status)
    VALUES ('5f000000-0000-4000-8000-000000000001', 'TK-1998-000001', 'CALL', 'x', '5f000000-0000-4000-8000-000000000003', now(), 'DONE')$$,
    'task DONE ต้องมี completed_at', '23514');
SELECT test.assert_raises($$INSERT INTO crm.tasks (organization_id, task_no, task_type_code, title, branch_id, due_at, status)
    VALUES ('5f000000-0000-4000-8000-000000000001', 'TK-1998-000002', 'CALL', 'x', '5f000000-0000-4000-8000-000000000003', now(), 'CANCELLED')$$,
    'task CANCELLED ต้องมี cancelled_at', '23514');
SELECT test.assert_raises($$INSERT INTO crm.tasks (organization_id, task_no, task_type_code, title, branch_id, due_at, status, completed_at)
    VALUES ('5f000000-0000-4000-8000-000000000001', 'TK-1998-000003', 'CALL', 'x', '5f000000-0000-4000-8000-000000000003', now(), 'OPEN', now())$$,
    'task OPEN ต้องไม่มี completed_at', '23514');
SELECT test.assert_raises($$INSERT INTO crm.tasks (organization_id, task_no, task_type_code, title, branch_id, due_at, is_next_action)
    VALUES ('5f000000-0000-4000-8000-000000000001', 'TK-1998-000004', 'CALL', 'x', '5f000000-0000-4000-8000-000000000003', now(), true)$$,
    'task next action ต้องผูก lead หรือ opportunity หนึ่งรายการ', '23514');
SELECT test.assert_raises($$INSERT INTO crm.tasks (organization_id, task_no, task_type_code, title, branch_id, due_at, remind_at)
    VALUES ('5f000000-0000-4000-8000-000000000001', 'TK-1998-000005', 'CALL', 'x', '5f000000-0000-4000-8000-000000000003', '2031-01-01T10:00:00+07:00', '2031-01-01T10:30:00+07:00')$$,
    'remind_at ต้องไม่หลัง due_at', '23514');
SELECT set_config('session_replication_role', 'origin', true);

-- notification (ข้อ 11.1)
INSERT INTO crm.notifications (organization_id, recipient_staff_id, code, title, dedupe_key)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000011', 'FOLLOWUP_OVERDUE', 'ติดตามเกินกำหนด', 'FOLLOWUP_OVERDUE:x:0:2031-01-01');
SELECT test.assert_raises($$INSERT INTO crm.notifications (organization_id, recipient_staff_id, code, title, dedupe_key)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000011', 'FOLLOWUP_OVERDUE', 'ติดตามเกินกำหนด', 'FOLLOWUP_OVERDUE:x:0:2031-01-01')$$,
    'UNIQUE(recipient_staff_id, dedupe_key)', '23505');
SELECT test.assert_raises($$INSERT INTO crm.notifications (organization_id, recipient_staff_id, code, title, dedupe_key)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000011', 'SOMETHING_ELSE', 'x', 'SOMETHING_ELSE:x')$$,
    'code ต้องอยู่ในรายการข้อ 11.1', '23514');
SELECT test.assert_raises($$INSERT INTO crm.notifications (organization_id, recipient_staff_id, code, title, dedupe_key)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000011', 'TASK_OVERDUE', 'งานเกินกำหนด', 'FOLLOWUP_OVERDUE:x:0:2031-01-01')$$,
    'dedupe_key ต้องขึ้นต้นด้วย {code}:', '23514');

-- export (ข้อ 8.2)
SELECT test.assert_raises($$UPDATE audit.export_requests SET status = 'APPROVED', approved_by = requested_by, decided_at = now() WHERE id = '5f000000-0000-4000-8000-000000000902'$$,
    'export approved_by <> requested_by', '23514');
SELECT test.assert_raises($$UPDATE audit.export_requests SET status = 'APPROVED' WHERE id = '5f000000-0000-4000-8000-000000000902'$$,
    'export APPROVED ต้องมี approved_by', '23514');


-- =====================================================================================
-- 4. first_seen_at · แคช last_* has_* · customer_branches (ข้อ 3.2 · 6.3 · 6.6)
-- =====================================================================================

INSERT INTO crm.customers (id, organization_id, first_name, first_seen_at, first_channel_code, first_source_code, first_branch_id, created_at, created_via) VALUES
    ('5f000000-0000-4000-8000-000000000110', '5f000000-0000-4000-8000-000000000001', 'ลูกค้าFirstSeen', '2031-03-15T10:00:00+07:00',
     'LINE', 'LINE_OA', '5f000000-0000-4000-8000-000000000003', '2031-03-15T10:00:00+07:00', 'QUICK_CAPTURE');

INSERT INTO crm.interactions (organization_id, customer_id, branch_id, channel_code, direction, interaction_type_code, occurred_at) VALUES
    ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000110', '5f000000-0000-4000-8000-000000000003', 'LINE', 'INBOUND', 'INQUIRY', '2031-03-20T14:00:00+07:00');
SELECT test.assert_eq(
    (SELECT first_seen_at::text || '|' || last_activity_at::text || '|' || last_channel_code || '|' || (last_branch_id = '5f000000-0000-4000-8000-000000000003')::text
     FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000110'),
    '2031-03-15 03:00:00+00|2031-03-20 07:00:00+00|LINE|true',
    'กิจกรรมหลัง first_seen_at: first_seen_at ไม่เปลี่ยน · last_activity_at/last_channel_code/last_branch_id = interaction ล่าสุด');

INSERT INTO crm.interactions (organization_id, customer_id, branch_id, channel_code, direction, interaction_type_code, occurred_at) VALUES
    ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000110', '5f000000-0000-4000-8000-000000000004', 'FACEBOOK', 'INBOUND', 'INQUIRY', '2031-03-10T09:00:00+07:00');
SELECT test.assert_eq(
    (SELECT first_seen_at::text || '|' || first_channel_code || '|' || first_source_code || '|' || (first_branch_id = '5f000000-0000-4000-8000-000000000004')::text || '|' || last_activity_at::text
     FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000110'),
    '2031-03-10 02:00:00+00|FACEBOOK|LINE_OA|true|2031-03-20 07:00:00+00',
    'กิจกรรมก่อน first_seen_at: first_seen_at = least(…) และ first_channel/first_branch ตามกิจกรรมนั้น (source เดิมคงไว้เมื่อกิจกรรมไม่มี source) · last_activity_at ไม่ถอยหลัง');

INSERT INTO crm.interactions (organization_id, customer_id, branch_id, channel_code, direction, interaction_type_code, occurred_at) VALUES
    ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000110', '5f000000-0000-4000-8000-000000000003', 'WALK_IN', 'INTERNAL', 'NOTE', '2031-03-25T10:00:00+07:00');
SELECT test.assert_eq(
    (SELECT last_activity_at::text || '|' || last_channel_code FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000110'),
    '2031-03-25 03:00:00+00|LINE', 'interaction INTERNAL นับเป็นกิจกรรมล่าสุด แต่ last_channel_code ใช้ interaction ล่าสุดที่ไม่ใช่ INTERNAL');

INSERT INTO crm.visits (organization_id, branch_id, channel_code, status, interest_code, customer_id, started_at, cancel_reason) VALUES
    ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000003', 'WALK_IN', 'CANCELLED', 'BUY', '5f000000-0000-4000-8000-000000000110', '2031-03-01T10:00:00+07:00', 'สร้างผิด');
SELECT test.assert_eq((SELECT first_seen_at FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000110'),
    '2031-03-10T09:00:00+07:00'::timestamptz, 'visit CANCELLED ไม่ใช่กิจกรรม: first_seen_at ไม่เปลี่ยน');

-- bulk: first_seen_at ยังถูกปรับ แต่แคชอื่นรอ refresh ท้ายงาน
SELECT set_config('app.bulk', 'on', true);
INSERT INTO crm.transaction_refs (organization_id, customer_id, branch_id, transaction_type_code, source_system_code, external_no, transacted_at, amount) VALUES
    ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000110', '5f000000-0000-4000-8000-000000000003', 'REPAIR', 'MANUAL', 'S2-FS-0001', '2031-03-05T12:00:00+07:00', 900),
    ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000110', '5f000000-0000-4000-8000-000000000003', 'REPAIR', 'MANUAL', 'S2-FS-0002', '2031-03-30T12:00:00+07:00', 900);
SELECT test.assert_eq(
    (SELECT first_seen_at::text || '|' || last_activity_at::text FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000110'),
    '2031-03-05 05:00:00+00|2031-03-25 03:00:00+00', 'app.bulk = on: first_seen_at = least(…) ยังทำงาน · last_activity_at ยังไม่ refresh');
SELECT set_config('app.bulk', 'off', true);
SELECT app.refresh_customer_activity('5f000000-0000-4000-8000-000000000110');
SELECT test.assert_eq((SELECT last_activity_at FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000110'),
    '2031-03-30T12:00:00+07:00'::timestamptz, 'app.refresh_customer_activity ท้ายงาน bulk ปรับ last_activity_at');

-- invariant ข้อ 3.2: ไม่มีกิจกรรมใดก่อน first_seen_at (ลูกค้าทดสอบทุกราย)
SELECT test.assert_eq(
    (SELECT count(*) FROM crm.customers c CROSS JOIN LATERAL app.customer_activity_events(c.id) e
     WHERE c.organization_id = '5f000000-0000-4000-8000-000000000001' AND e.occurred_at < c.first_seen_at),
    0::bigint, 'invariant: ไม่มี activity event ที่ occurred_at < customers.first_seen_at');

-- customer_branches
SELECT test.assert_eq(
    (SELECT string_agg(b.code || ':' || cb.linked_via::text || ':' || cb.first_linked_at::text, ' ' ORDER BY b.code)
     FROM crm.customer_branches cb JOIN core.branches b ON b.id = cb.branch_id
     WHERE cb.customer_id = '5f000000-0000-4000-8000-000000000110'),
    'TS1:INTERACTION:2031-03-05 05:00:00+00 TS2:INTERACTION:2031-03-10 02:00:00+00',
    'customer_branches ผูกอัตโนมัติทุกสาขาที่มีกิจกรรม (linked_via = ชนิดแรก · first_linked_at = least)');
SELECT test.assert_eq(
    (SELECT last_activity_at FROM crm.customer_branches WHERE customer_id = '5f000000-0000-4000-8000-000000000110' AND branch_id = '5f000000-0000-4000-8000-000000000003'),
    '2031-03-30T12:00:00+07:00'::timestamptz, 'customer_branches.last_activity_at = greatest');
UPDATE crm.visits SET customer_id = '5f000000-0000-4000-8000-000000000199' WHERE id = '5f000000-0000-4000-8000-000000000206';
SELECT test.assert_eq(
    (SELECT linked_via::text FROM crm.customer_branches WHERE customer_id = '5f000000-0000-4000-8000-000000000199' AND branch_id = '5f000000-0000-4000-8000-000000000004'),
    'VISIT', 'ตั้ง visits.customer_id ภายหลัง → ผูกสาขาของ visit (linked_via VISIT)');


-- =====================================================================================
-- 5. lifecycle (ข้อ 3.1 · 3.4)
-- =====================================================================================

INSERT INTO crm.customers (id, organization_id, first_name, first_seen_at, created_via) VALUES
    ('5f000000-0000-4000-8000-000000000120', '5f000000-0000-4000-8000-000000000001', 'ลูกค้าLifecycle', '2031-04-01T10:00:00+07:00', 'QUICK_CAPTURE'),
    ('5f000000-0000-4000-8000-000000000121', '5f000000-0000-4000-8000-000000000001', 'ลูกค้าLost',      '2031-04-01T10:00:00+07:00', 'QUICK_CAPTURE'),
    ('5f000000-0000-4000-8000-000000000122', '5f000000-0000-4000-8000-000000000001', 'ลูกค้าRefWon',    '2031-04-01T10:00:00+07:00', 'QUICK_CAPTURE');
SELECT test.assert_eq((SELECT lifecycle_stage FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000120'), 'IDENTIFIED', 'lifecycle เริ่ม IDENTIFIED');

INSERT INTO crm.leads (id, organization_id, customer_id, branch_id, channel_code, interest_code, priority_code, next_action, next_action_type_code, next_action_at, created_at)
    VALUES ('5f000000-0000-4000-8000-000000000320', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000120', '5f000000-0000-4000-8000-000000000003',
            'LINE', 'BUY', 'NORMAL', 'ติดต่อกลับลูกค้า', 'CALL', '2031-04-01T10:30:00+07:00', '2031-04-01T10:00:00+07:00');
SELECT test.assert_eq((SELECT lifecycle_stage FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000120'), 'LEAD', 'มี lead เปิด → LEAD');

INSERT INTO crm.opportunities (id, organization_id, customer_id, lead_id, origin_channel_code, branch_id, owner_staff_id, priority_code, next_action, next_action_type_code, next_action_at, created_at)
    VALUES ('5f000000-0000-4000-8000-000000000420', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000120', '5f000000-0000-4000-8000-000000000320',
            'LINE', '5f000000-0000-4000-8000-000000000003', '5f000000-0000-4000-8000-000000000011', 'NORMAL', 'นัดดูเครื่อง', 'APPOINTMENT', '2031-04-03T13:00:00+07:00', '2031-04-02T10:00:00+07:00');
SELECT test.assert_eq((SELECT lifecycle_stage FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000120'), 'OPPORTUNITY', 'มี opportunity เปิด → OPPORTUNITY');
SELECT test.assert_true((SELECT opportunity_no ~ '^OP-2031-[0-9]{6,}$' AND stage = 'INTERESTED' AND expected_amount = 0 FROM crm.opportunities WHERE id = '5f000000-0000-4000-8000-000000000420'),
    'opportunity_no = OP-2031-NNNNNN · ค่าเริ่มต้น stage INTERESTED · expected_amount 0');

UPDATE crm.leads SET status = 'CONVERTED', converted_opportunity_id = '5f000000-0000-4000-8000-000000000420', closed_at = '2031-04-02T10:00:00+07:00'
    WHERE id = '5f000000-0000-4000-8000-000000000320';
UPDATE crm.opportunities SET stage = 'WON', won_amount = 23900, won_at = '2031-04-03T15:30:00+07:00', closed_at = '2031-04-03T15:30:00+07:00'
    WHERE id = '5f000000-0000-4000-8000-000000000420';
SELECT test.assert_eq((SELECT lifecycle_stage FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000120'), 'CUSTOMER', 'opportunity WON (ซื้อ 1 ครั้ง) → CUSTOMER');

INSERT INTO crm.transaction_refs (organization_id, customer_id, branch_id, transaction_type_code, source_system_code, external_no, transacted_at, amount)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000120', '5f000000-0000-4000-8000-000000000003', 'SALE', 'MANUAL', 'S2-LC-0001', '2031-05-01T11:00:00+07:00', 28900);
SELECT test.assert_eq((SELECT lifecycle_stage FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000120'), 'REPEAT',
    'transaction ref SALE ที่ไม่ผูก opportunity = การซื้อครั้งที่ 2 → REPEAT');

-- LOST: ไม่เคยซื้อ ไม่มีรายการเปิด มี lead LOST
INSERT INTO crm.leads (organization_id, customer_id, branch_id, channel_code, interest_code, status, lost_reason_code, closed_at, created_at)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000121', '5f000000-0000-4000-8000-000000000003',
            'LINE', 'BUY', 'LOST', 'PRICE', '2031-04-02T10:00:00+07:00', '2031-04-01T10:00:00+07:00');
SELECT test.assert_eq((SELECT lifecycle_stage FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000121'), 'LOST', 'มีแต่ lead LOST → LOST');

-- ref ที่ผูก opportunity WON นับรวมเป็นครั้งเดียว · ref ที่ counts_as_purchase = false ไม่นับ
INSERT INTO crm.opportunities (id, organization_id, customer_id, origin_channel_code, branch_id, owner_staff_id, stage, won_amount, won_at, closed_at, created_at)
    VALUES ('5f000000-0000-4000-8000-000000000422', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000122', 'WALK_IN',
            '5f000000-0000-4000-8000-000000000003', '5f000000-0000-4000-8000-000000000011', 'WON', 45900, '2031-04-05T15:00:00+07:00', '2031-04-05T15:00:00+07:00', '2031-04-05T14:00:00+07:00');
INSERT INTO crm.transaction_refs (organization_id, customer_id, branch_id, opportunity_id, transaction_type_code, source_system_code, external_no, transacted_at, amount) VALUES
    ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000122', '5f000000-0000-4000-8000-000000000003', '5f000000-0000-4000-8000-000000000422', 'SALE', 'MANUAL', 'S2-LC-0002', '2031-04-05T15:05:00+07:00', 45900),
    ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000122', '5f000000-0000-4000-8000-000000000003', NULL, 'ACCESSORY_SALE', 'MANUAL', 'S2-LC-0003', '2031-04-06T12:00:00+07:00', 990);
SELECT test.assert_eq((SELECT lifecycle_stage || ':' || app.customer_purchase_count(id) FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000122'),
    'CUSTOMER:1', 'ref ผูก opportunity WON ไม่นับซ้ำ · ACCESSORY_SALE (counts_as_purchase = false) ไม่นับ → CUSTOMER');

-- app.bulk = on ข้าม refresh แล้ว refresh ครั้งเดียวท้ายงาน
SELECT set_config('app.bulk', 'on', true);
INSERT INTO crm.opportunities (organization_id, customer_id, origin_channel_code, branch_id, owner_staff_id, stage, won_amount, won_at, closed_at, created_at)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000121', 'LINE', '5f000000-0000-4000-8000-000000000003',
            '5f000000-0000-4000-8000-000000000011', 'WON', 1990, '2031-04-10T10:00:00+07:00', '2031-04-10T10:00:00+07:00', '2031-04-09T10:00:00+07:00');
SELECT test.assert_eq((SELECT lifecycle_stage FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000121'), 'LOST', 'app.bulk = on: trigger ไม่ refresh lifecycle');
SELECT set_config('app.bulk', 'off', true);
SELECT test.assert_eq(app.refresh_customer_lifecycle('5f000000-0000-4000-8000-000000000121'), 'CUSTOMER', 'app.refresh_customer_lifecycle คืนค่าที่คำนวณ');
SELECT test.assert_eq((SELECT lifecycle_stage FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000121'), 'CUSTOMER', 'refresh ท้ายงาน bulk → CUSTOMER');

-- ประวัติสถานะ
SELECT test.assert_eq(
    (SELECT string_agg(coalesce(from_status::text, '∅') || '→' || to_status::text, ' ' ORDER BY changed_at, created_at) FROM crm.lead_status_history WHERE lead_id = '5f000000-0000-4000-8000-000000000320'),
    '∅→NEW NEW→CONVERTED', 'lead_status_history: สร้าง + แปลง');
SELECT test.assert_eq(
    (SELECT string_agg(coalesce(from_stage::text, '∅') || '→' || to_stage::text || '@' || changed_at::text, ' ' ORDER BY changed_at) FROM crm.opportunity_stage_history WHERE opportunity_id = '5f000000-0000-4000-8000-000000000420'),
    '∅→INTERESTED@2031-04-02 03:00:00+00 INTERESTED→WON@2031-04-03 08:30:00+00', 'opportunity_stage_history: changed_at = created_at ตอนสร้าง · closed_at ตอนปิด');
SELECT test.assert_eq((SELECT reason FROM crm.lead_status_history WHERE lead_id IN (SELECT id FROM crm.leads WHERE customer_id = '5f000000-0000-4000-8000-000000000121' AND status = 'LOST')),
    'PRICE', 'ประวัติของ lead LOST เก็บ lost_reason_code เป็น reason');


-- =====================================================================================
-- 6. lead NEW → CONTACTED (ข้อ 4.3)
-- =====================================================================================

INSERT INTO crm.customers (id, organization_id, first_name, first_seen_at, created_via) VALUES
    ('5f000000-0000-4000-8000-000000000130', '5f000000-0000-4000-8000-000000000001', 'ลูกค้าContacted', '2031-04-01T10:00:00+07:00', 'QUICK_CAPTURE');
INSERT INTO crm.leads (id, organization_id, customer_id, branch_id, channel_code, interest_code, priority_code, next_action, next_action_type_code, next_action_at, created_at)
    VALUES ('5f000000-0000-4000-8000-000000000330', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000130', '5f000000-0000-4000-8000-000000000003',
            'TIKTOK', 'TRADE_IN', 'NORMAL', 'ติดต่อกลับลูกค้า', 'CALL', '2031-04-01T10:30:00+07:00', '2031-04-01T10:00:00+07:00');
SELECT test.assert_eq((SELECT status::text || '|' || coalesce(first_contacted_at::text, '-') FROM crm.leads WHERE id = '5f000000-0000-4000-8000-000000000330'),
    'NEW|-', 'lead ช่องทางข้อความ (TIKTOK) เริ่ม NEW');
SELECT test.assert_true((SELECT has_new_lead FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000130'), 'has_new_lead = true เมื่อมี lead NEW');

INSERT INTO crm.interactions (organization_id, customer_id, branch_id, channel_code, direction, interaction_type_code, occurred_at) VALUES
    ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000130', '5f000000-0000-4000-8000-000000000003', 'TIKTOK', 'OUTBOUND', 'MESSAGE', '2031-04-01T09:50:00+07:00'),
    ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000130', '5f000000-0000-4000-8000-000000000003', 'TIKTOK', 'INBOUND',  'INQUIRY', '2031-04-01T10:05:00+07:00');
SELECT test.assert_eq((SELECT status::text FROM crm.leads WHERE id = '5f000000-0000-4000-8000-000000000330'), 'NEW',
    'OUTBOUND ก่อน lead.created_at และ INBOUND หลังสร้าง ไม่เปลี่ยนสถานะ');

INSERT INTO crm.interactions (organization_id, customer_id, branch_id, channel_code, direction, interaction_type_code, occurred_at) VALUES
    ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000130', '5f000000-0000-4000-8000-000000000003', 'TIKTOK', 'OUTBOUND', 'MESSAGE', '2031-04-01T10:18:00+07:00');
SELECT test.assert_eq((SELECT status::text || '|' || first_contacted_at::text FROM crm.leads WHERE id = '5f000000-0000-4000-8000-000000000330'),
    'CONTACTED|2031-04-01 03:18:00+00', 'OUTBOUND แรกของลูกค้าเดียวกันหลังสร้าง lead → CONTACTED · first_contacted_at = occurred_at');
SELECT test.assert_true(NOT (SELECT has_new_lead FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000130'), 'has_new_lead = false เมื่อไม่มี lead NEW');
SELECT test.assert_eq(
    (SELECT string_agg(coalesce(from_status::text, '∅') || '→' || to_status::text, ' ' ORDER BY changed_at, created_at) FROM crm.lead_status_history WHERE lead_id = '5f000000-0000-4000-8000-000000000330'),
    '∅→NEW NEW→CONTACTED', 'ประวัติสถานะบันทึก NEW → CONTACTED อัตโนมัติ');

INSERT INTO crm.leads (id, organization_id, customer_id, branch_id, channel_code, interest_code, status, priority_code, next_action, next_action_type_code, next_action_at, created_at)
    VALUES ('5f000000-0000-4000-8000-000000000331', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000130', '5f000000-0000-4000-8000-000000000003',
            'WALK_IN', 'BUY', 'NEW', 'NORMAL', 'ติดต่อกลับลูกค้า', 'CALL', '2031-04-02T10:30:00+07:00', '2031-04-02T10:00:00+07:00');
SELECT test.assert_eq((SELECT status::text || '|' || first_contacted_at::text FROM crm.leads WHERE id = '5f000000-0000-4000-8000-000000000331'),
    'CONTACTED|2031-04-02 03:00:00+00', 'lead ช่องทางสด (WALK_IN) เริ่ม CONTACTED และ first_contacted_at = created_at');


-- =====================================================================================
-- 7. next action → task (ข้อ 4.4 · 4.7)
-- =====================================================================================

INSERT INTO crm.customers (id, organization_id, first_name, first_seen_at, created_via) VALUES
    ('5f000000-0000-4000-8000-000000000140', '5f000000-0000-4000-8000-000000000001', 'ลูกค้าNextAction', '2031-05-01T10:00:00+07:00', 'QUICK_CAPTURE');
INSERT INTO crm.opportunities (id, organization_id, customer_id, origin_channel_code, branch_id, owner_staff_id, team_id, priority_code, next_action, next_action_type_code, next_action_at, created_at)
    VALUES ('5f000000-0000-4000-8000-000000000440', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000140', 'LINE',
            '5f000000-0000-4000-8000-000000000003', '5f000000-0000-4000-8000-000000000011', '5f000000-0000-4000-8000-000000000005',
            'HIGH', 'โทรติดตามเรื่องผ่อน', 'CALL', '2031-05-18T10:00:00+07:00', '2031-05-01T14:00:00+07:00');
SELECT test.assert_eq(
    (SELECT string_agg(task_type_code || '|' || title || '|' || due_at::text || '|' || remind_at::text || '|' || priority_code || '|' || status::text
                       || '|' || (owner_staff_id = '5f000000-0000-4000-8000-000000000011')::text || '|' || (customer_id = '5f000000-0000-4000-8000-000000000140')::text
                       || '|' || (task_no ~ '^TK-[0-9]{4}-[0-9]{6,}$')::text, ';')
     FROM crm.tasks WHERE opportunity_id = '5f000000-0000-4000-8000-000000000440' AND is_next_action),
    'CALL|โทรติดตามเรื่องผ่อน|2031-05-18 03:00:00+00|2031-05-18 02:45:00+00|HIGH|OPEN|true|true|true',
    'สร้าง opportunity เปิด → task next action 1 ใบตาม next_action (remind_at = due_at − 15 นาที · customer จากแม่)');
INSERT INTO t_ctx VALUES ('na_task', (SELECT id::text FROM crm.tasks WHERE opportunity_id = '5f000000-0000-4000-8000-000000000440' AND is_next_action));

UPDATE crm.opportunities SET next_action_at = '2031-05-19T11:00:00+07:00', priority_code = 'URGENT' WHERE id = '5f000000-0000-4000-8000-000000000440';
SELECT test.assert_eq(
    (SELECT count(*)::text || '|' || min(id::text) || '|' || min(due_at)::text || '|' || min(remind_at)::text || '|' || min(priority_code)
     FROM crm.tasks WHERE opportunity_id = '5f000000-0000-4000-8000-000000000440' AND is_next_action AND status IN ('OPEN', 'IN_PROGRESS')),
    '1|' || (SELECT v FROM t_ctx WHERE k = 'na_task') || '|2031-05-19 04:00:00+00|2031-05-19 03:45:00+00|URGENT',
    'เปลี่ยน next_action_at/priority → อัปเดต task ใบเดิม (remind_at เลื่อนตาม) ไม่สร้างใบใหม่');

INSERT INTO crm.leads (id, organization_id, customer_id, branch_id, owner_staff_id, channel_code, interest_code, priority_code, next_action, next_action_type_code, next_action_at, created_at)
    VALUES ('5f000000-0000-4000-8000-000000000340', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000140', '5f000000-0000-4000-8000-000000000003',
            '5f000000-0000-4000-8000-000000000011', 'WALK_IN', 'BUY', 'NORMAL', 'ติดตามความสนใจ iPad Air', 'FOLLOW_UP', '2031-05-20T11:00:00+07:00', '2031-05-08T16:10:00+07:00');
SELECT test.assert_true((SELECT has_open_followup FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000140'),
    'task next action ประเภท FOLLOW_UP ของ lead → has_open_followup = true (ป้าย "ติดตามอยู่")');
SELECT test.assert_raises($$INSERT INTO crm.tasks (organization_id, task_type_code, title, lead_id, branch_id, due_at, is_next_action)
    VALUES ('5f000000-0000-4000-8000-000000000001', 'CALL', 'ใบซ้ำ', '5f000000-0000-4000-8000-000000000340', '5f000000-0000-4000-8000-000000000003', now(), true)$$,
    'lead มี task next action ที่ยังไม่ปิดได้ใบเดียว (unique partial index)', '23505');

UPDATE crm.tasks SET status = 'DONE' WHERE id = (SELECT v::uuid FROM t_ctx WHERE k = 'na_task');
SELECT test.assert_true((SELECT completed_at IS NOT NULL FROM crm.tasks WHERE id = (SELECT v::uuid FROM t_ctx WHERE k = 'na_task')), 'task DONE → completed_at ตั้งอัตโนมัติ');
UPDATE crm.opportunities SET next_action = 'นัดเข้าร้านดูเครื่อง', next_action_type_code = 'APPOINTMENT', next_action_at = '2031-05-22T13:00:00+07:00'
    WHERE id = '5f000000-0000-4000-8000-000000000440';
SELECT test.assert_eq(
    (SELECT string_agg(status::text || ':' || task_type_code, ',' ORDER BY created_at, status) FROM crm.tasks WHERE opportunity_id = '5f000000-0000-4000-8000-000000000440' AND is_next_action),
    'OPEN:APPOINTMENT,DONE:CALL', 'task เดิม DONE แล้วตั้ง next action ใหม่ → สร้าง task next action ใบใหม่');

UPDATE crm.opportunities SET stage = 'LOST', lost_reason_code = 'COMPARING', closed_at = '2031-05-21T10:00:00+07:00' WHERE id = '5f000000-0000-4000-8000-000000000440';
SELECT test.assert_eq(
    (SELECT string_agg(status::text || ':' || (cancelled_at IS NOT NULL)::text, ',' ORDER BY status) FROM crm.tasks WHERE opportunity_id = '5f000000-0000-4000-8000-000000000440' AND is_next_action),
    'DONE:false,CANCELLED:true', 'ปิด opportunity → task next action ที่ยังไม่ปิดเป็น CANCELLED (ใบ DONE คงเดิม)');

UPDATE crm.leads SET status = 'LOST', lost_reason_code = 'NOT_READY', closed_at = '2031-05-21T10:00:00+07:00' WHERE id = '5f000000-0000-4000-8000-000000000340';
SELECT test.assert_eq(
    (SELECT status::text FROM crm.tasks WHERE lead_id = '5f000000-0000-4000-8000-000000000340' AND is_next_action), 'CANCELLED', 'ปิด lead → task next action CANCELLED');
SELECT test.assert_true(NOT (SELECT has_open_followup FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000140'), 'ไม่มี FOLLOW_UP เปิด → has_open_followup = false');

UPDATE crm.leads SET status = 'CONTACTED', lost_reason_code = NULL, closed_at = NULL, next_action_at = '2031-05-25T10:00:00+07:00' WHERE id = '5f000000-0000-4000-8000-000000000340';
SELECT test.assert_eq(
    (SELECT count(*) FROM crm.tasks WHERE lead_id = '5f000000-0000-4000-8000-000000000340' AND is_next_action AND status = 'OPEN'), 1::bigint,
    'reopen lead → สร้าง task next action ใหม่ 1 ใบ');


-- =====================================================================================
-- 8. quotation → opportunity QUOTATION · valid_until (ข้อ 4.4 · 4.6)
-- =====================================================================================

INSERT INTO crm.customers (id, organization_id, first_name, first_seen_at, created_via) VALUES
    ('5f000000-0000-4000-8000-000000000150', '5f000000-0000-4000-8000-000000000001', 'ลูกค้าQuotation', '2031-09-01T10:00:00+07:00', 'QUICK_CAPTURE');
INSERT INTO crm.opportunities (id, organization_id, customer_id, origin_channel_code, branch_id, owner_staff_id, priority_code, next_action, next_action_type_code, next_action_at, created_at)
    VALUES ('5f000000-0000-4000-8000-000000000450', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000150', 'LINE',
            '5f000000-0000-4000-8000-000000000003', '5f000000-0000-4000-8000-000000000012', 'NORMAL', 'ส่งใบเสนอราคา', 'SEND_QUOTATION', '2031-09-01T15:00:00+07:00', '2031-09-01T14:00:00+07:00');
INSERT INTO crm.quotations (id, organization_id, opportunity_id, total_amount, created_at)
    VALUES ('5f000000-0000-4000-8000-000000000550', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000450', 49900, '2031-09-01T14:10:00+07:00');
SELECT test.assert_eq(
    (SELECT status::text || '|' || (customer_id = '5f000000-0000-4000-8000-000000000150')::text || '|' || (branch_id = '5f000000-0000-4000-8000-000000000003')::text
            || '|' || (owner_staff_id = '5f000000-0000-4000-8000-000000000012')::text || '|' || (quotation_no ~ '^QT-2031-[0-9]{6,}$')::text
     FROM crm.quotations WHERE id = '5f000000-0000-4000-8000-000000000550'),
    'DRAFT|true|true|true|true', 'quotation DRAFT: customer/branch/owner เติมจาก opportunity แม่ · quotation_no = QT-2031-NNNNNN');
SELECT test.assert_eq((SELECT stage::text FROM crm.opportunities WHERE id = '5f000000-0000-4000-8000-000000000450'), 'INTERESTED', 'quotation DRAFT ไม่เปลี่ยนขั้น');

UPDATE crm.quotations SET status = 'SENT', sent_at = '2031-09-01T14:22:00+07:00', sent_channel_code = 'LINE' WHERE id = '5f000000-0000-4000-8000-000000000550';
SELECT test.assert_eq((SELECT valid_until FROM crm.quotations WHERE id = '5f000000-0000-4000-8000-000000000550'), '2031-09-08'::date,
    'ส่ง 1 ก.ย. → valid_until = วันที่ส่ง + quotation.valid_days (7) = 8 ก.ย.');
SELECT test.assert_eq((SELECT stage::text FROM crm.opportunities WHERE id = '5f000000-0000-4000-8000-000000000450'), 'QUOTATION', 'quotation เป็น SENT → opportunity INTERESTED → QUOTATION');

UPDATE crm.opportunities SET stage = 'FOLLOW_UP' WHERE id = '5f000000-0000-4000-8000-000000000450';
INSERT INTO crm.quotations (organization_id, opportunity_id, status, sent_channel_code, total_amount)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000450', 'SENT', 'LINE', 45900);
SELECT test.assert_eq((SELECT stage::text FROM crm.opportunities WHERE id = '5f000000-0000-4000-8000-000000000450'), 'QUOTATION', 'FOLLOW_UP + ใบใหม่ SENT → QUOTATION');
SELECT test.assert_eq(
    (SELECT string_agg(x, ' ' ORDER BY x COLLATE "C") FROM (
        SELECT coalesce(from_stage::text, '-') || '>' || to_stage::text AS x
        FROM crm.opportunity_stage_history WHERE opportunity_id = '5f000000-0000-4000-8000-000000000450') h),
    '->INTERESTED FOLLOW_UP>QUOTATION INTERESTED>QUOTATION QUOTATION>FOLLOW_UP',
    'ประวัติขั้นครบทุกการเปลี่ยน (สร้าง · INTERESTED→QUOTATION · QUOTATION→FOLLOW_UP · FOLLOW_UP→QUOTATION)');

UPDATE crm.opportunities SET stage = 'WON', won_amount = 45900, won_at = now(), closed_at = now() WHERE id = '5f000000-0000-4000-8000-000000000450';
INSERT INTO crm.quotations (organization_id, opportunity_id, status, sent_channel_code) VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000450', 'SENT', 'LINE');
SELECT test.assert_eq((SELECT stage::text FROM crm.opportunities WHERE id = '5f000000-0000-4000-8000-000000000450'), 'WON', 'opportunity WON ไม่ถูกเปลี่ยนเป็น QUOTATION');


-- =====================================================================================
-- 9. expected_amount = Σ items (ข้อ 6.10)
-- =====================================================================================

INSERT INTO crm.opportunity_items (id, organization_id, opportunity_id, product_type_code, product_model, variant, quantity, unit_price, interest_level) VALUES
    ('5f000000-0000-4000-8000-000000000471', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000490', 'IPHONE', 'iPhone 17 Pro', '256GB', 2, 45900, 'HOT'),
    ('5f000000-0000-4000-8000-000000000472', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000490', 'ACCESSORY', 'เคส', NULL, 1, 1990, 'WARM');
SELECT test.assert_eq((SELECT expected_amount FROM crm.opportunities WHERE id = '5f000000-0000-4000-8000-000000000490'), 93790.00::numeric, 'expected_amount = 2 × 45,900 + 1 × 1,990');
UPDATE crm.opportunity_items SET quantity = 1 WHERE id = '5f000000-0000-4000-8000-000000000471';
DELETE FROM crm.opportunity_items WHERE id = '5f000000-0000-4000-8000-000000000472';
SELECT test.assert_eq((SELECT expected_amount FROM crm.opportunities WHERE id = '5f000000-0000-4000-8000-000000000490'), 45900.00::numeric, 'แก้จำนวนและลบ item → expected_amount คำนวณใหม่');
SELECT test.assert_raises($$INSERT INTO crm.quotation_items (organization_id, quotation_id, quantity, unit_price, discount_amount)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000550', 1, 1000, 1500)$$,
    'ส่วนลดของบรรทัดต้องไม่เกิน quantity × unit_price', '23514');


-- =====================================================================================
-- 10. note_summary (ข้อ 6.3 · 6.9)
-- =====================================================================================

INSERT INTO crm.customer_notes (id, organization_id, customer_id, branch_id, body, is_pinned, created_at) VALUES
    ('5f000000-0000-4000-8000-000000000161', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000150', '5f000000-0000-4000-8000-000000000003', 'ชอบให้ติดต่อทาง LINE หลัง 18:00', true,  '2031-09-08T10:00:00+07:00'),
    ('5f000000-0000-4000-8000-000000000162', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000150', '5f000000-0000-4000-8000-000000000003', 'สนใจผ่อน 10 เดือน',              false, '2031-09-09T10:00:00+07:00');
SELECT test.assert_eq((SELECT note_summary FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000150'), 'ชอบให้ติดต่อทาง LINE หลัง 18:00', 'note_summary = โน้ตที่ปักหมุด');
UPDATE crm.customer_notes SET is_pinned = true WHERE id = '5f000000-0000-4000-8000-000000000162';
SELECT test.assert_eq((SELECT note_summary FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000150'), 'สนใจผ่อน 10 เดือน', 'ปักหมุดโน้ตที่ใหม่กว่า → note_summary = โน้ตนั้น');
UPDATE crm.customer_notes SET is_pinned = false WHERE customer_id = '5f000000-0000-4000-8000-000000000150';
SELECT test.assert_eq((SELECT note_summary FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000150'), NULL::text, 'ไม่มีโน้ตปักหมุด → note_summary = NULL');


-- =====================================================================================
-- 11. guard เลขบัตรประชาชน (ข้อ 10.1) · 1234567890121 checksum ถูกต้อง (สังเคราะห์) · …122 ผิด
-- =====================================================================================

SELECT test.assert_true(app.contains_thai_national_id('ลูกค้าให้เลข 1234567890121 มา'), 'พบเลขบัตร 13 หลัก checksum ถูกต้องในข้อความ');
SELECT test.assert_true(NOT app.contains_thai_national_id('IMEI 356789012345678 และเลข 1234567890122'), 'IMEI 15 หลักและ 13 หลัก checksum ผิดไม่นับ');
SELECT test.assert_raises($$INSERT INTO crm.customer_notes (organization_id, customer_id, branch_id, body)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000150', '5f000000-0000-4000-8000-000000000003', 'บัตร ปชช. 1234567890121')$$,
    'customer_notes.body ที่มีเลขบัตรถูกปฏิเสธ', '23514');
INSERT INTO crm.customer_notes (organization_id, customer_id, branch_id, body)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000150', '5f000000-0000-4000-8000-000000000003', 'เลขอ้างอิง 1234567890122');
SELECT test.assert_eq((SELECT count(*) FROM crm.customer_notes WHERE body = 'เลขอ้างอิง 1234567890122'), 1::bigint, '13 หลักที่ checksum ผิดบันทึกได้');
SELECT test.assert_raises($$INSERT INTO crm.interactions (organization_id, branch_id, channel_code, direction, interaction_type_code, summary)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000003', 'LINE', 'INBOUND', 'INQUIRY', 'ส่งเลข 1-2345-67890-12-1 มาทาง LINE')$$,
    'interactions.summary รูปแบบ 1-2345-67890-12-1 ถูกปฏิเสธ', '23514');
SELECT test.assert_raises($$INSERT INTO crm.tasks (organization_id, task_type_code, title, branch_id, due_at)
    VALUES ('5f000000-0000-4000-8000-000000000001', 'DOCUMENT', 'ตรวจบัตร ๑๒๓๔๕๖๗๘๙๐๑๒๑', '5f000000-0000-4000-8000-000000000003', now())$$,
    'tasks.title ที่เป็นเลขไทยถูกปฏิเสธ', '23514');
SELECT test.assert_raises($$UPDATE crm.opportunities SET next_action = 'ขอสำเนา 1 2345 67890 12 1' WHERE id = '5f000000-0000-4000-8000-000000000490'$$,
    'opportunities.next_action (UPDATE) ถูกปฏิเสธ', '23514');
SELECT test.assert_raises($$UPDATE crm.quotations SET terms_note = 'ผู้ค้ำ 1234567890121' WHERE id = '5f000000-0000-4000-8000-000000000550'$$,
    'quotations.terms_note ถูกปฏิเสธ', '23514');
SELECT test.assert_raises(format($$INSERT INTO crm.task_comments (organization_id, task_id, body) VALUES ('5f000000-0000-4000-8000-000000000001', %L, '1234567890121')$$,
                                 (SELECT v FROM t_ctx WHERE k = 'na_task')),
    'task_comments.body ถูกปฏิเสธ', '23514');


-- =====================================================================================
-- 12. บทบาทและทีม (ข้อ 7.1 · 8.2)
-- =====================================================================================

INSERT INTO core.staff_role_assignments (organization_id, staff_id, role_code, branch_id)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000015', 'STAFF', '5f000000-0000-4000-8000-000000000003');
SELECT test.assert_raises($$INSERT INTO core.staff_role_assignments (organization_id, staff_id, role_code)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000015', 'SYSTEM_ADMIN')$$,
    'บัญชีที่มีบทบาทธุรกิจรับ SYSTEM_ADMIN ไม่ได้', '23514');
INSERT INTO core.staff_role_assignments (id, organization_id, staff_id, role_code)
    VALUES ('5f000000-0000-4000-8000-000000000961', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000016', 'SYSTEM_ADMIN');
SELECT test.assert_raises($$INSERT INTO core.staff_role_assignments (organization_id, staff_id, role_code, branch_id)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000016', 'STAFF', '5f000000-0000-4000-8000-000000000003')$$,
    'บัญชี SYSTEM_ADMIN รับบทบาทธุรกิจไม่ได้', '23514');
UPDATE core.staff_role_assignments SET valid_to = now(), revoked_by = '5f000000-0000-4000-8000-000000000011', revoke_reason = 'ทดสอบ'
    WHERE id = '5f000000-0000-4000-8000-000000000961';
INSERT INTO core.staff_role_assignments (organization_id, staff_id, role_code, branch_id)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000016', 'STAFF', '5f000000-0000-4000-8000-000000000003');
SELECT test.assert_eq((SELECT count(*) FROM core.staff_role_assignments WHERE staff_id = '5f000000-0000-4000-8000-000000000016'), 2::bigint,
    'ถอน SYSTEM_ADMIN แล้ว (ช่วงเวลาไม่ซ้อน) รับบทบาทธุรกิจได้');
INSERT INTO core.staff_role_assignments (organization_id, staff_id, role_code)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000017', 'MARKETING');
SELECT test.assert_raises($$INSERT INTO core.staff_role_assignments (organization_id, staff_id, role_code)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000017', 'BUSINESS_ADMIN')$$,
    'ห้ามถือ MARKETING ร่วมกับ BUSINESS_ADMIN [รอยืนยัน Q22]', '23514');

SELECT test.assert_raises($$INSERT INTO core.team_members (organization_id, team_id, staff_id)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000005', '5f000000-0000-4000-8000-000000000018')$$,
    'สมาชิกทีมต้องมีบทบาทที่ยังมีผลในสาขาของทีม', '23514');
INSERT INTO core.team_members (organization_id, team_id, staff_id, is_leader)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000005', '5f000000-0000-4000-8000-000000000011', true);
SELECT test.assert_eq((SELECT count(*) FROM core.team_members WHERE team_id = '5f000000-0000-4000-8000-000000000005'), 1::bigint,
    'พนักงานที่มี STAFF@สาขาของทีมเป็นสมาชิก/หัวหน้าได้');


-- =====================================================================================
-- 13. audit.log_row_change (ข้อ 9.5)
-- =====================================================================================

-- 13.1 INSERT ช่องทางติดต่อ: pii เป็น {"masked","sha256"} · ไม่มีค่าเต็ม · actor SYSTEM (ไม่มี JWT)
INSERT INTO crm.customer_contacts (id, organization_id, customer_id, contact_type, value_raw, is_primary)
    VALUES ('5f000000-0000-4000-8000-000000000171', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000101', 'PHONE', '081-234-5678', true);
SELECT test.assert_eq(
    (SELECT action || '|' || entity_type || '|' || entity_ref || '|' || actor_type::text || '|' || (after -> 'value_raw' ->> 'masked')
            || '|' || (after -> 'value_normalized' ->> 'masked') || '|' || (after ->> 'value_masked') || '|' || (after ->> 'contact_type')
     FROM audit.audit_logs WHERE entity_type = 'crm.customer_contacts' AND entity_id = '5f000000-0000-4000-8000-000000000171'),
    'CUSTOMER_CONTACT_CREATED|crm.customer_contacts|' || (SELECT customer_no FROM crm.customers WHERE id = '5f000000-0000-4000-8000-000000000101')
        || '|SYSTEM|081-XXX-5678|081-XXX-5678|081-XXX-5678|PHONE',
    'audit INSERT ช่องทางติดต่อ: action/entity_ref(เลขลูกค้า)/actor SYSTEM · value_raw และ value_normalized เป็นค่าปิดบัง');
SELECT test.assert_eq(
    (SELECT (after -> 'value_normalized' ->> 'sha256') || '|' || (after -> 'value_raw' ->> 'sha256')
     FROM audit.audit_logs WHERE entity_type = 'crm.customer_contacts' AND entity_id = '5f000000-0000-4000-8000-000000000171'),
    encode(sha256(convert_to('+66812345678', 'UTF8')), 'hex') || '|' || encode(sha256(convert_to('+66812345678', 'UTF8')), 'hex'),
    'sha256 ของช่องทางติดต่อ = sha256(ค่า normalized) (เทียบกับ access_logs ได้ ข้อ 6.5)');
SELECT test.assert_eq(
    (SELECT (after -> 'first_name' ->> 'masked') || '|' || (after -> 'display_name' ->> 'masked') || '|' || (after -> 'first_name' ->> 'sha256') || '|' || action
     FROM audit.audit_logs WHERE entity_type = 'crm.customers' AND entity_id = '5f000000-0000-4000-8000-000000000101' AND action = 'CUSTOMER_CREATED'),
    'ส***|ส***|' || encode(sha256(convert_to('สมชาย', 'UTF8')), 'hex') || '|CUSTOMER_CREATED',
    'audit CUSTOMER_CREATED: ชื่อ (pii) เป็นอักษรแรก + *** และ sha256');

-- 13.2 UPDATE โดย STAFF (JWT) พร้อม header และเหตุผล
SELECT set_config('request.jwt.claims', json_build_object('sub', '5f000000-0000-4000-8000-0000000000a1', 'role', 'authenticated', 'aal', 'aal2')::text, true);
SELECT set_config('request.headers', '{"x-client-ip": "203.0.113.10", "x-client-ua": "s2-agent", "x-device-id": "DEV-S2", "x-request-id": "req-s2-001"}', true);
SELECT set_config('app.audit_reason', 'ลูกค้าแจ้งเปลี่ยนเบอร์', true);
UPDATE crm.customer_contacts SET value_raw = '089-123-5678' WHERE id = '5f000000-0000-4000-8000-000000000171';
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.headers', '', true);
SELECT set_config('app.audit_reason', '', true);
SELECT test.assert_eq(
    (SELECT action || '|' || actor_type::text || '|' || actor_staff_code || '|' || actor_label || '|' || array_to_string(actor_roles, ',') || '|' || aal
            || '|' || ip || '|' || user_agent || '|' || device_id || '|' || request_id || '|' || reason || '|' || array_to_string(changed_fields, ',')
            || '|' || (before -> 'value_raw' ->> 'masked') || '→' || (after -> 'value_raw' ->> 'masked')
     FROM audit.audit_logs WHERE entity_type = 'crm.customer_contacts' AND entity_id = '5f000000-0000-4000-8000-000000000171' AND action LIKE '%UPDATED'),
    'CUSTOMER_CONTACT_UPDATED|STAFF|ST-9811|คุณทดสอบขวัญ|STAFF|aal2|203.0.113.10|s2-agent|DEV-S2|req-s2-001|ลูกค้าแจ้งเปลี่ยนเบอร์|value_masked,value_normalized,value_raw|081-XXX-5678→089-XXX-5678',
    'audit UPDATE: actor STAFF จาก JWT · actor_roles · aal · header x-client-* · reason · changed_fields · ค่าก่อน/หลังแบบปิดบัง (ตัวอย่าง A32)');

-- 13.3 ไม่มีเบอร์เต็มหรือชื่อเต็มใน audit
SELECT test.assert_eq(
    (SELECT count(*) FROM audit.audit_logs
     WHERE organization_id = '5f000000-0000-4000-8000-000000000001'
       AND (coalesce(before::text, '') || coalesce(after::text, '')) ~ '(812345678|234-?5678|891235678|123-?5678)'),
    0::bigint, 'audit ไม่มีเบอร์โทรเต็ม (raw หรือ normalized) ในทุกแถวของการทดสอบ');
SELECT test.assert_eq(
    (SELECT count(*) FROM audit.audit_logs
     WHERE entity_type = 'crm.customers' AND entity_id = '5f000000-0000-4000-8000-000000000101'
       AND (coalesce(before::text, '') || coalesce(after::text, '')) LIKE '%สมชาย%'),
    0::bigint, 'audit ไม่มีชื่อลูกค้าเต็ม');

-- 13.4 UPDATE ที่เปลี่ยนเฉพาะคอลัมน์ที่ข้าม หรือไม่เปลี่ยนค่า → ไม่บันทึก
INSERT INTO t_ctx VALUES ('audit_count', (SELECT count(*) FROM audit.audit_logs)::text);
UPDATE crm.customers SET lifecycle_stage = 'LEAD', last_activity_at = now(), first_seen_at = '2026-12-01T00:00:00Z', note_summary = 'x',
                         last_channel_code = 'LINE', has_open_followup = true, has_new_lead = true
    WHERE id = '5f000000-0000-4000-8000-000000000101';
UPDATE crm.customer_contacts SET is_primary = is_primary WHERE id = '5f000000-0000-4000-8000-000000000171';
SELECT test.assert_eq((SELECT count(*) FROM audit.audit_logs), (SELECT v::bigint FROM t_ctx WHERE k = 'audit_count'),
    'UPDATE เฉพาะ updated_at/last_activity_at/lifecycle_stage/first_seen_at/note_summary (+แคช has_*/last_*) หรือไม่เปลี่ยนค่า → ไม่บันทึก audit');
UPDATE crm.customers SET nickname = 'ชาย' WHERE id = '5f000000-0000-4000-8000-000000000101';
SELECT test.assert_eq(
    (SELECT array_to_string(changed_fields, ',') FROM audit.audit_logs WHERE entity_type = 'crm.customers' AND entity_id = '5f000000-0000-4000-8000-000000000101' AND action = 'CUSTOMER_UPDATED'),
    'nickname', 'แก้ข้อมูลจริง → CUSTOMER_UPDATED พร้อม changed_fields (updated_at ไม่เปลี่ยนเพราะ now() คงที่ในทรานแซกชันทดสอบ)');

-- 13.5 action เชิงความหมาย
UPDATE crm.leads SET owner_staff_id = '5f000000-0000-4000-8000-000000000012' WHERE id = '5f000000-0000-4000-8000-000000000340';
UPDATE crm.customers SET record_status = 'MERGED', merged_into_id = '5f000000-0000-4000-8000-000000000102' WHERE id = '5f000000-0000-4000-8000-000000000103';
INSERT INTO crm.customer_consents (organization_id, customer_id, purpose_code, status, notice_version, captured_via, captured_by, evidence)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000101', 'PRIVACY_NOTICE', 'GRANTED', 'PN-2026-01', 'STAFF_FORM', '5f000000-0000-4000-8000-000000000011', 'PN-2026-01 · ฟอร์มหน้าร้าน');
INSERT INTO crm.tags (id, organization_id, code, label_th) VALUES ('5f000000-0000-4000-8000-000000000181', '5f000000-0000-4000-8000-000000000001', 'S2_VIP', 'VIP ทดสอบ');
INSERT INTO crm.customer_tags (id, organization_id, customer_id, tag_id)
    VALUES ('5f000000-0000-4000-8000-000000000182', '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000101', '5f000000-0000-4000-8000-000000000181');
DELETE FROM crm.customer_tags WHERE id = '5f000000-0000-4000-8000-000000000182';
INSERT INTO core.role_permissions (role_code, permission_code, scope) VALUES ('MARKETING', 'visit.read', 'ORGANIZATION');
UPDATE core.role_grant_requests SET status = 'REJECTED', decided_by = '5f000000-0000-4000-8000-000000000012', decided_at = now()
    WHERE id = '5f000000-0000-4000-8000-000000000901';
SELECT test.assert_eq(
    (SELECT string_agg(DISTINCT action, ',' ORDER BY action) FROM audit.audit_logs
     WHERE (entity_id, action) IN (
        ('5f000000-0000-4000-8000-000000000340', 'LEAD_ASSIGNED'),
        ('5f000000-0000-4000-8000-000000000420', 'OPPORTUNITY_WON'),
        ('5f000000-0000-4000-8000-000000000103', 'CUSTOMER_MERGED'),
        ('5f000000-0000-4000-8000-000000000182', 'CUSTOMER_TAG_REMOVED'),
        ('MARKETING:visit.read',                 'PERMISSION_CHANGED'),
        ('5f000000-0000-4000-8000-000000000901', 'ROLE_GRANT_REQUESTED'),
        ('5f000000-0000-4000-8000-000000000901', 'ROLE_GRANT_DECIDED'),
        ('5f000000-0000-4000-8000-000000000961', 'ROLE_GRANTED'),
        ('5f000000-0000-4000-8000-000000000961', 'ROLE_REVOKED'),
        ('5f000000-0000-4000-8000-000000000014', 'STAFF_INVITED'),
        ('5f000000-0000-4000-8000-000000000904', 'DSR_CREATED'))
       OR (entity_type = 'crm.customer_consents' AND action = 'CONSENT_RECORDED' AND after ->> 'customer_id' = '5f000000-0000-4000-8000-000000000101')),
    'CONSENT_RECORDED,CUSTOMER_MERGED,CUSTOMER_TAG_REMOVED,DSR_CREATED,LEAD_ASSIGNED,OPPORTUNITY_WON,PERMISSION_CHANGED,ROLE_GRANTED,ROLE_GRANT_DECIDED,ROLE_GRANT_REQUESTED,ROLE_REVOKED,STAFF_INVITED',
    'action เชิงความหมายตามข้อ 9.5 (LEAD_ASSIGNED · OPPORTUNITY_WON · CUSTOMER_MERGED · CUSTOMER_TAG_REMOVED · CONSENT_RECORDED · PERMISSION_CHANGED · ROLE_* · STAFF_INVITED · DSR_CREATED)');
SELECT test.assert_eq(
    (SELECT (after -> 'evidence' ->> 'masked') FROM audit.audit_logs WHERE entity_type = 'crm.customer_consents' AND after ->> 'customer_id' = '5f000000-0000-4000-8000-000000000101'),
    'P***', 'customer_consents.evidence (pii) ถูกปิดบังใน audit');

-- 13.6 ตารางที่ข้อ 9.5 ยกเว้นไม่มีแถว audit
INSERT INTO crm.ownership_changes (organization_id, entity_type, entity_id, from_staff_id, to_staff_id, reason_code, changed_by)
    VALUES ('5f000000-0000-4000-8000-000000000001', 'LEAD', '5f000000-0000-4000-8000-000000000340', '5f000000-0000-4000-8000-000000000011',
            '5f000000-0000-4000-8000-000000000012', 'SHIFT_CHANGE', '5f000000-0000-4000-8000-000000000011');
SELECT test.assert_eq(
    (SELECT count(*) FROM audit.audit_logs WHERE entity_type IN ('crm.notifications', 'crm.lead_status_history', 'crm.opportunity_stage_history', 'crm.ownership_changes', 'crm.customer_branches')),
    0::bigint, 'notifications · lead_status_history · opportunity_stage_history · ownership_changes · customer_branches ไม่ถูกบันทึกใน audit');

-- 13.7 seed_mode ข้าม audit เฉพาะ role เจ้าของฐานข้อมูล
SELECT set_config('app.seed_mode', 'on', true);
INSERT INTO crm.tags (organization_id, code, label_th) VALUES ('5f000000-0000-4000-8000-000000000001', 'S2_SEED', 'จาก seed');
SELECT set_config('app.seed_mode', 'off', true);
INSERT INTO crm.tags (organization_id, code, label_th) VALUES ('5f000000-0000-4000-8000-000000000001', 'S2_LIVE', 'ไม่ใช่ seed');
SELECT test.assert_eq(
    (SELECT string_agg(after ->> 'code', ',' ORDER BY after ->> 'code') FROM audit.audit_logs WHERE entity_type = 'crm.tags' AND after ->> 'code' IN ('S2_SEED', 'S2_LIVE')),
    'S2_LIVE', 'app.seed_mode = on (superuser · ไม่ได้ SET ROLE) ข้าม audit');
GRANT EXECUTE ON FUNCTION app.is_seed_mode() TO authenticated;
SELECT set_config('app.seed_mode', 'on', true);
SELECT test.login_as_uid('5f000000-0000-4000-8000-0000000000a1', 'aal2');
SELECT set_config('app.seed_mode', 'on', true);
CREATE TEMP TABLE t_seed_probe AS SELECT app.is_seed_mode() AS v;
SELECT test.logout();
SELECT set_config('app.seed_mode', 'off', true);
SELECT test.assert_eq((SELECT v FROM t_seed_probe), false, 'ผู้ใช้ authenticated ตั้ง app.seed_mode = on เองไม่ได้ผล (is_seed_mode = false)');

-- 13.8 append-only · redaction · retention (ข้อ 9.5)
INSERT INTO t_ctx VALUES ('audit_probe', (SELECT min(id) FROM audit.audit_logs WHERE entity_type = 'crm.customers' AND entity_id = '5f000000-0000-4000-8000-000000000101')::text);
SELECT test.assert_raises(format('UPDATE audit.audit_logs SET action = %L WHERE id = %s', 'CUSTOMER_VIEWED', (SELECT v FROM t_ctx WHERE k = 'audit_probe')),
    'audit_logs UPDATE ถูกปฏิเสธ', '42501');
SELECT test.assert_raises(format('DELETE FROM audit.audit_logs WHERE id = %s', (SELECT v FROM t_ctx WHERE k = 'audit_probe')),
    'audit_logs DELETE ถูกปฏิเสธ', '42501');
SELECT test.assert_raises('TRUNCATE audit.audit_logs', 'audit_logs TRUNCATE ถูกปฏิเสธ', '42501');
SELECT test.assert_raises(format($$UPDATE audit.audit_logs SET before = '"[ANONYMIZED]"' WHERE id = %s$$, (SELECT v FROM t_ctx WHERE k = 'audit_probe')),
    'แทน before โดยไม่ตั้ง app.audit_redaction ถูกปฏิเสธ', '42501');
SELECT set_config('app.audit_redaction', 'on', true);
UPDATE audit.audit_logs SET before = CASE WHEN before IS NULL THEN NULL ELSE '"[ANONYMIZED]"'::jsonb END, after = '"[ANONYMIZED]"'::jsonb
    WHERE entity_type = 'crm.customers' AND entity_id = '5f000000-0000-4000-8000-000000000101';
SELECT test.assert_raises(format('UPDATE audit.audit_logs SET action = %L, after = %L WHERE id = %s', 'CUSTOMER_UPDATED', '"x"', (SELECT v FROM t_ctx WHERE k = 'audit_probe')),
    'app.audit_redaction = on ยังแก้คอลัมน์อื่นนอกจาก before/after ไม่ได้', '42501');
SELECT set_config('app.audit_redaction', 'off', true);
SELECT test.assert_eq(
    (SELECT count(*) FILTER (WHERE after = '"[ANONYMIZED]"'::jsonb) || '/' || count(*) FROM audit.audit_logs
     WHERE entity_type = 'crm.customers' AND entity_id = '5f000000-0000-4000-8000-000000000101'),
    (SELECT count(*) || '/' || count(*) FROM audit.audit_logs WHERE entity_type = 'crm.customers' AND entity_id = '5f000000-0000-4000-8000-000000000101'),
    'app.audit_redaction = on แทน before/after เป็น "[ANONYMIZED]" ได้ (ข้อ 10.4)');

INSERT INTO audit.access_logs (organization_id, actor_staff_id, action, customer_id, contact_id, purpose)
    VALUES ('5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000011', 'CONTACT_REVEALED',
            '5f000000-0000-4000-8000-000000000101', '5f000000-0000-4000-8000-000000000171', 'CALL');
INSERT INTO audit.login_events (user_id, event_type, success) VALUES ('5f000000-0000-4000-8000-0000000000a1', 'S2_PROBE', true);
INSERT INTO audit.integration_logs (source_system_code, direction, operation, status) VALUES ('POS', 'INBOUND', 'S2 probe', 'SUCCESS');
SELECT test.assert_raises($$UPDATE audit.access_logs SET purpose = 'VIEW' WHERE contact_id = '5f000000-0000-4000-8000-000000000171'$$, 'access_logs UPDATE ถูกปฏิเสธ', '42501');
SELECT test.assert_raises($$DELETE FROM audit.login_events WHERE event_type = 'S2_PROBE'$$, 'login_events DELETE ถูกปฏิเสธ', '42501');
SELECT test.assert_raises($$UPDATE audit.integration_logs SET status = 'FAILED' WHERE operation = 'S2 probe'$$, 'integration_logs UPDATE ถูกปฏิเสธ', '42501');
SELECT test.assert_raises($$INSERT INTO audit.access_logs (action, contact_id) VALUES ('CONTACT_REVEALED', '5f000000-0000-4000-8000-000000000171')$$,
    'CONTACT_REVEALED ต้องมี purpose', '23514');
SELECT test.assert_raises($$INSERT INTO audit.access_logs (action, search_hashes) VALUES ('CUSTOMER_SEARCH', ARRAY['0812345678'])$$,
    'access_logs เก็บเฉพาะ sha256 hex (ห้ามค่าจริง)', '23514');

-- งาน retention: SET ROLE audit_retention แล้ว DELETE ได้
SELECT set_config('s2.audit_probe', (SELECT v FROM t_ctx WHERE k = 'audit_probe'), true);
SELECT set_config('role', 'audit_retention', true);
DELETE FROM audit.audit_logs WHERE id = current_setting('s2.audit_probe')::bigint;
DELETE FROM audit.login_events WHERE event_type = 'S2_PROBE';
SELECT set_config('role', 'none', true);
SELECT test.assert_eq(
    (SELECT count(*) FROM audit.audit_logs WHERE id = (SELECT v::bigint FROM t_ctx WHERE k = 'audit_probe'))
    + (SELECT count(*) FROM audit.login_events WHERE event_type = 'S2_PROBE'),
    0::bigint, 'role audit_retention ลบแถว audit_logs/login_events ได้ (ข้อ 9.5 · 10.3)');

-- สิทธิ์ตาราง audit
SELECT test.assert_eq(
    (SELECT count(*) FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) r
     CROSS JOIN unnest(ARRAY['audit.audit_logs', 'audit.access_logs', 'audit.login_events', 'audit.export_requests', 'audit.integration_logs']) t
     CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p
     WHERE has_table_privilege(r, t, p)),
    0::bigint, 'anon/authenticated/service_role ไม่มีสิทธิ์ใดบนตาราง audit');
SELECT test.assert_true(has_table_privilege('audit_retention', 'audit.audit_logs', 'DELETE') AND NOT has_table_privilege('audit_retention', 'audit.audit_logs', 'UPDATE')
                        AND NOT has_table_privilege('audit_retention', 'audit.export_requests', 'DELETE'),
    'audit_retention มี DELETE เฉพาะตาราง log (ไม่มี UPDATE · ไม่แตะ export_requests)');


-- =====================================================================================
-- 14. ตรวจทั้ง catalog (ข้อ 1.1 · 9.4 กติกา 1 และ 4 · 9.5 · 9.6)
-- =====================================================================================

SELECT test.assert_eq(
    (SELECT string_agg(x, ',' ORDER BY x) FROM (VALUES
        ('crm.visits'), ('crm.interactions'), ('crm.transaction_refs'), ('crm.campaigns'), ('crm.leads'), ('crm.lead_status_history'),
        ('crm.opportunities'), ('crm.opportunity_items'), ('crm.opportunity_stage_history'), ('crm.quotations'), ('crm.quotation_items'),
        ('crm.ownership_changes'), ('crm.tasks'), ('crm.task_comments'), ('crm.notifications'),
        ('audit.audit_logs'), ('audit.access_logs'), ('audit.login_events'), ('audit.export_requests'), ('audit.integration_logs')) v (x)
     WHERE to_regclass(x) IS NOT NULL),
    'audit.access_logs,audit.audit_logs,audit.export_requests,audit.integration_logs,audit.login_events,crm.campaigns,crm.interactions,crm.lead_status_history,crm.leads,crm.notifications,crm.opportunities,crm.opportunity_items,crm.opportunity_stage_history,crm.ownership_changes,crm.quotation_items,crm.quotations,crm.task_comments,crm.tasks,crm.transaction_refs,crm.visits',
    'มีตาราง stage 2 ครบ 15 crm + 5 audit (ข้อ 14.6)');
SELECT test.assert_eq(
    (SELECT coalesce(string_agg(n.nspname || '.' || c.relname, ', ' ORDER BY 1), '')
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('core', 'ref', 'crm') AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity),
    '', 'ทุกตารางใน core ref crm (รวม stage 2) เปิด ROW LEVEL SECURITY');
SELECT test.assert_eq(
    (SELECT coalesce(string_agg(n.nspname || '.' || c.relname, ', ' ORDER BY 1), '')
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('core', 'ref', 'crm') AND c.relkind IN ('r', 'p')
       AND ((n.nspname || '.' || c.relname) IN ('crm.notifications', 'crm.lead_status_history', 'crm.opportunity_stage_history', 'crm.ownership_changes', 'crm.customer_branches'))
           = EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = c.oid AND t.tgname = 'trg_audit_row_change')),
    '', 'trigger audit ติดทุกตาราง crm/core/ref ยกเว้น 5 ตารางของข้อ 9.5 (และไม่ติดตารางที่ยกเว้น)');
SELECT test.assert_eq(
    (SELECT coalesce(string_agg(n.nspname || '.' || c.relname, ', ' ORDER BY 1), '')
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('api', 'crm', 'core', 'ref', 'analytics', 'app', 'audit')
       AND c.relkind = 'v' AND NOT coalesce(c.reloptions @> ARRAY['security_invoker=true'], false)),
    '', 'ทุก view ใน api crm core ref analytics app audit เป็น security_invoker = true');
SELECT test.assert_eq(
    (SELECT coalesce(string_agg(p.oid::regprocedure::text, ', ' ORDER BY 1), '')
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('api', 'app', 'audit', 'crm', 'core', 'ref', 'analytics', 'restricted')
       AND p.prosecdef
       AND NOT coalesce(p.proconfig @> ARRAY['search_path=""'], false)),
    '', 'ทุกฟังก์ชัน SECURITY DEFINER ของระบบ SET search_path = ''''');
SELECT test.assert_eq(
    (SELECT coalesce(string_agg(p.oid::regprocedure::text, ', ' ORDER BY 1), '')
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('app', 'audit') AND NOT coalesce(p.proconfig @> ARRAY['search_path=""'], false)),
    '', 'ทุกฟังก์ชันใน app และ audit (stage 1 + 2) SET search_path = ''''');
SELECT test.assert_eq(
    (SELECT coalesce(string_agg(f, ', ' ORDER BY f), '') FROM unnest(ARRAY[
        'app.trg_assign_running_number()', 'app.trg_row_defaults()', 'app.trg_guard_restricted_text()', 'app.trg_check_role_exclusivity()',
        'app.trg_check_team_member_assignment()', 'app.trg_touch_customer_activity()', 'app.trg_link_customer_branch()', 'app.trg_refresh_lifecycle()',
        'app.trg_write_status_history()', 'app.trg_mark_lead_contacted()', 'app.trg_quotation_sent_stage()', 'app.trg_sync_expected_amount()',
        'app.trg_sync_next_action_task()', 'app.trg_sync_note_summary()', 'app.refresh_customer_lifecycle(uuid)', 'app.refresh_customer_activity(uuid)',
        'app.next_running_number(text)', 'app.customer_activity_events(uuid)', 'app.customer_purchase_count(uuid)', 'app.setting_int(text,integer)',
        'app.is_seed_mode()', 'app.pii_columns()', 'audit.log_row_change()', 'audit.deny_change()', 'audit.pii_json(jsonb,text)']) f
     WHERE has_function_privilege('authenticated', f, 'EXECUTE') OR has_function_privilege('anon', f, 'EXECUTE')),
    'app.is_seed_mode()', 'ฟังก์ชัน trigger/ภายในไม่มี EXECUTE ให้ authenticated/anon (is_seed_mode ถูก GRANT ชั่วคราวในข้อ 13.7 เท่านั้น)');
SELECT test.assert_true(has_function_privilege('authenticated', 'app.current_staff_id()', 'EXECUTE')
                        AND (SELECT prosecdef AND provolatile = 's' FROM pg_proc WHERE oid = 'app.current_staff_id()'::regprocedure),
    'app.current_staff_id(): SECURITY DEFINER · STABLE · GRANT EXECUTE ให้ authenticated (ข้อ 9.3)');

-- index บังคับของข้อ 6.10 (คอลัมน์แรกของ index)
SELECT test.assert_eq(
    (SELECT coalesce(string_agg(v.t || '.' || v.col, ', '), '') FROM (VALUES
        ('visits', 'branch_id'), ('visits', 'owner_staff_id'), ('visits', 'customer_id'),
        ('interactions', 'branch_id'), ('interactions', 'owner_staff_id'), ('interactions', 'customer_id'),
        ('leads', 'branch_id'), ('leads', 'owner_staff_id'), ('leads', 'customer_id'),
        ('opportunities', 'branch_id'), ('opportunities', 'owner_staff_id'), ('opportunities', 'customer_id'),
        ('quotations', 'branch_id'), ('quotations', 'owner_staff_id'), ('quotations', 'customer_id'),
        ('tasks', 'branch_id'), ('tasks', 'owner_staff_id'), ('tasks', 'customer_id'),
        ('transaction_refs', 'branch_id'), ('transaction_refs', 'customer_id')) v (t, col)
     WHERE NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
                       WHERE i.indrelid = ('crm.' || v.t)::regclass AND a.attname = v.col)),
    '', 'index (branch_id) (owner_staff_id) (customer_id) ของตารางกิจกรรมครบ (ข้อ 6.10)');
SELECT test.assert_true(
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_notes_interaction_id_fkey' AND confrelid = 'crm.interactions'::regclass)
    AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_converted_opportunity_id_fkey' AND confrelid = 'crm.opportunities'::regclass)
    AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transaction_refs_source_external_uq' AND contype = 'u'),
    'FK customer_notes.interaction_id · leads.converted_opportunity_id และ UNIQUE(source_system_code, external_no) มีอยู่');

-- ป้าย pii ครอบคลุมคอลัมน์ของข้อ 10.4
SELECT test.assert_eq(
    (SELECT coalesce(string_agg(x, ', ' ORDER BY x), '') FROM (
        SELECT unnest(ARRAY[
            'crm.customers.first_name', 'crm.customers.last_name', 'crm.customers.nickname',
            'crm.customer_contacts.value_raw', 'crm.customer_contacts.value_normalized',
            'crm.customer_addresses.address_line', 'crm.customer_addresses.subdistrict', 'crm.customer_addresses.postal_code',
            'crm.customer_notes.body', 'crm.interactions.summary', 'crm.tasks.title', 'crm.tasks.description',
            'crm.leads.next_action', 'crm.leads.lost_note', 'crm.opportunities.next_action', 'crm.opportunities.lost_note',
            'crm.transaction_refs.device_imei', 'crm.transaction_refs.device_serial', 'crm.transaction_refs.summary',
            'crm.notifications.title', 'crm.notifications.body', 'crm.customer_merges.snapshot',
            'crm.duplicate_decisions.override_note', 'crm.customer_consents.evidence', 'crm.data_subject_requests.requester_name']) AS x
        EXCEPT
        SELECT table_schema || '.' || table_name || '.' || column_name FROM app.pii_columns()) d),
    '', 'app.pii_columns() มีคอลัมน์ pii ครบตามรายการล้างค่าของข้อ 10.4');
