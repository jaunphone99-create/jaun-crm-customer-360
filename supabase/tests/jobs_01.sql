-- =====================================================================================
-- supabase/tests/jobs_01.sql — งานตามเวลาของ migration 0013_jobs.sql
--   app.job_close_stale_visits · app.job_expire_quotations · app.job_expire_exports
--   app.job_notifications · app.job_retention   (CANONICAL ข้อ 4.1 · 4.6 · 8.2 · 10.3 · 11.1 · 9.6)
-- fixture อิสระจาก supabase/seed.sql (องค์กร TEST-JOB · staff ST-93xx · อีเมล @test.example.com)
-- ทุกงานเรียกด้วย p_as_of ที่ระบุชัด → ผลคงที่และทดสอบการรันซ้ำ (idempotent) ได้
-- run.mjs ครอบไฟล์ด้วย BEGIN … ROLLBACK · ห้ามมีคำสั่งควบคุมทรานแซกชันในไฟล์
-- =====================================================================================

-- ===== P-1: แยกชุดทดสอบออกจาก supabase/seed.sql =====
-- app.job_* เป็นงานระดับระบบ (ไม่มีพารามิเตอร์องค์กร/สาขา) จึงมองเห็นแถวของ seed ด้วย
-- ล้างตารางธุรกิจทั้งหมดก่อนสร้าง fixture · ทุกคำสั่งอยู่ในทรานแซกชันของไฟล์ทดสอบ (run.mjs ROLLBACK ให้)
SET LOCAL session_replication_role = 'replica';      -- ปิด trigger/FK ชั่วคราวเพื่อให้ลบได้เร็วและไม่ติดลำดับ
DELETE FROM crm.notifications;
DELETE FROM crm.task_comments;
DELETE FROM crm.tasks;
DELETE FROM crm.quotation_items;
DELETE FROM crm.quotations;
DELETE FROM crm.transaction_refs;
DELETE FROM crm.opportunity_items;
DELETE FROM crm.opportunity_stage_history;
DELETE FROM crm.lead_status_history;
DELETE FROM crm.opportunities;
DELETE FROM crm.leads;
DELETE FROM crm.interactions;
DELETE FROM crm.visits;
DELETE FROM crm.ownership_changes;
DELETE FROM crm.duplicate_decisions;
DELETE FROM crm.customer_merges;
DELETE FROM crm.customer_tags;
DELETE FROM crm.customer_consents;
DELETE FROM crm.customer_addresses;
DELETE FROM crm.customer_notes;
DELETE FROM crm.customer_branches;
DELETE FROM crm.customer_contacts;
DELETE FROM crm.customers;
DELETE FROM audit.audit_logs;
DELETE FROM audit.access_logs;
DELETE FROM audit.login_events;
DELETE FROM audit.export_requests;
SET LOCAL session_replication_role = 'origin';

-- ===== P0: helper =====
CREATE FUNCTION test.nrows(p_code text, p_entity uuid DEFAULT NULL) RETURNS bigint
LANGUAGE sql STABLE AS $$
    SELECT count(*) FROM crm.notifications n
    WHERE n.code = p_code AND (p_entity IS NULL OR n.entity_id = p_entity)
$$;
CREATE FUNCTION test.nlevel(p_code text, p_entity uuid, p_level integer) RETURNS uuid[]
LANGUAGE sql STABLE AS $$
    SELECT coalesce(array_agg(n.recipient_staff_id ORDER BY n.recipient_staff_id), '{}'::uuid[])
    FROM crm.notifications n
    WHERE n.code = p_code AND n.entity_id = p_entity
      AND n.dedupe_key LIKE '%:' || p_level::text || ':%'
$$;

-- ===== F0: นาฬิกา + fixture (superuser · seed_mode = on ระหว่างสร้าง fixture) =====
UPDATE app.settings SET value = '{"as_of": "2026-09-16T00:05:00+07:00"}' WHERE key = 'clock';
SELECT set_config('app.bulk', 'on', true);
SELECT set_config('app.seed_mode', 'on', true);

INSERT INTO core.organizations (id, code, name_th)
VALUES ('ac000000-0000-4000-8000-000000000001', 'TEST-JOB', 'องค์กรทดสอบงานตามเวลา');
INSERT INTO core.business_units (id, organization_id, code, name_th)
VALUES ('ac000000-0000-4000-8000-000000000002', 'ac000000-0000-4000-8000-000000000001', 'TJBU', 'หน่วยทดสอบงาน');
INSERT INTO core.branches (id, organization_id, business_unit_id, code, name_th, branch_type) VALUES
    ('ac000000-0000-4000-8000-000000000011', 'ac000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000002', 'ZJ1', 'สาขางาน 1', 'store'),
    ('ac000000-0000-4000-8000-000000000012', 'ac000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000002', 'ZJ2', 'สาขางาน 2', 'store');
INSERT INTO core.teams (id, organization_id, branch_id, code, name_th)
VALUES ('ac000000-0000-4000-8000-000000000021', 'ac000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000011', 'ZJ1-SALES', 'ทีมขายงาน 1');

INSERT INTO auth.users (id, email, email_confirmed_at)
SELECT ('ac000000-0000-4000-8000-0000000090' || lpad(n::text, 2, '0'))::uuid,
       'job.u' || lpad(n::text, 2, '0') || '@test.example.com', now() FROM generate_series(1, 10) n;
INSERT INTO auth.mfa_factors (user_id, status)
SELECT ('ac000000-0000-4000-8000-0000000090' || lpad(n::text, 2, '0'))::uuid, 'verified' FROM generate_series(1, 10) n;
-- 01 s1 · 02 s2 · 03 L1 หัวหน้าทีม · 04 X1 SUPERVISOR ที่ไม่ใช่หัวหน้าทีม · 05 M1 · 06 M2 · 07 MD (DISABLED)
-- 08 M3 (ZJ2) · 09 BA1 · 10 BA2
INSERT INTO core.staff_profiles (id, organization_id, staff_code, employee_code, display_name, email, user_id, status)
SELECT ('ac000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid,
       'ac000000-0000-4000-8000-000000000001', 'ST-93' || lpad(n::text, 2, '0'), 'JOB-' || lpad(n::text, 2, '0'),
       (ARRAY['พนักงาน S1','พนักงาน S2','หัวหน้าทีม L1','หัวหน้า X1','ผู้จัดการ M1','ผู้จัดการ M2',
              'ผู้จัดการ MD','ผู้จัดการ M3','ผู้ดูแล BA1','ผู้ดูแล BA2'])[n],
       'job.u' || lpad(n::text, 2, '0') || '@test.example.com',
       ('ac000000-0000-4000-8000-0000000090' || lpad(n::text, 2, '0'))::uuid,
       (CASE WHEN n = 7 THEN 'DISABLED' ELSE 'ACTIVE' END)::core.staff_status
FROM generate_series(1, 10) n;
INSERT INTO core.staff_role_assignments (organization_id, staff_id, role_code, branch_id, valid_from) VALUES
    ('ac000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000101','STAFF',         'ac000000-0000-4000-8000-000000000011', now() - interval '400 days'),
    ('ac000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000102','STAFF',         'ac000000-0000-4000-8000-000000000011', now() - interval '400 days'),
    ('ac000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000103','SUPERVISOR',    'ac000000-0000-4000-8000-000000000011', now() - interval '400 days'),
    ('ac000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000104','SUPERVISOR',    'ac000000-0000-4000-8000-000000000011', now() - interval '400 days'),
    ('ac000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000105','BRANCH_MANAGER','ac000000-0000-4000-8000-000000000011', now() - interval '400 days'),
    ('ac000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000106','BRANCH_MANAGER','ac000000-0000-4000-8000-000000000011', now() - interval '400 days'),
    ('ac000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000107','BRANCH_MANAGER','ac000000-0000-4000-8000-000000000011', now() - interval '400 days'),
    ('ac000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000108','BRANCH_MANAGER','ac000000-0000-4000-8000-000000000012', now() - interval '400 days'),
    ('ac000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000109','BUSINESS_ADMIN', NULL,                                  now() - interval '400 days'),
    ('ac000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000110','BUSINESS_ADMIN', NULL,                                  now() - interval '400 days');
INSERT INTO core.team_members (organization_id, team_id, staff_id, is_leader, valid_from) VALUES
    ('ac000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000021','ac000000-0000-4000-8000-000000000103', true,  now() - interval '400 days'),
    ('ac000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000021','ac000000-0000-4000-8000-000000000101', false, now() - interval '400 days'),
    ('ac000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000021','ac000000-0000-4000-8000-000000000102', false, now() - interval '400 days');

INSERT INTO crm.customers (id, organization_id, customer_no, first_name, last_name, first_seen_at, first_channel_code,
                           first_branch_id, owner_staff_id, province_code, created_via, created_by, last_activity_at, legal_hold) VALUES
 ('ac000000-0000-4000-8000-000000000201','ac000000-0000-4000-8000-000000000001','CUS-1993-000001','งาน','หนึ่ง','2026-09-01T10:00:00+07:00','WALK_IN','ac000000-0000-4000-8000-000000000011','ac000000-0000-4000-8000-000000000101','TH-10','QUICK_CAPTURE','ac000000-0000-4000-8000-000000000101','2026-09-15T10:00:00+07:00',false),
 ('ac000000-0000-4000-8000-000000000202','ac000000-0000-4000-8000-000000000001','CUS-1993-000002','งาน','สอง', '2024-01-01T10:00:00+07:00','LINE',   'ac000000-0000-4000-8000-000000000011','ac000000-0000-4000-8000-000000000101','TH-10','IMPORT',       'ac000000-0000-4000-8000-000000000101','2024-09-01T10:00:00+07:00',false),
 ('ac000000-0000-4000-8000-000000000203','ac000000-0000-4000-8000-000000000001','CUS-1993-000003','งาน','สาม', '2024-01-01T10:00:00+07:00','LINE',   'ac000000-0000-4000-8000-000000000011','ac000000-0000-4000-8000-000000000101','TH-10','IMPORT',       'ac000000-0000-4000-8000-000000000101','2024-10-01T10:00:00+07:00',false),
 ('ac000000-0000-4000-8000-000000000204','ac000000-0000-4000-8000-000000000001','CUS-1993-000004','งาน','สี่',  '2024-01-01T10:00:00+07:00','LINE',   'ac000000-0000-4000-8000-000000000011','ac000000-0000-4000-8000-000000000101','TH-10','IMPORT',       'ac000000-0000-4000-8000-000000000101','2024-09-01T10:00:00+07:00',true);
INSERT INTO crm.customer_branches (organization_id, customer_id, branch_id, first_linked_at, last_activity_at, linked_via)
SELECT 'ac000000-0000-4000-8000-000000000001', c.id, c.first_branch_id, c.first_seen_at, c.first_seen_at, 'CREATED'
FROM crm.customers c WHERE c.organization_id = 'ac000000-0000-4000-8000-000000000001';

-- visit ค้างของวันธุรกิจ 15 ก.ย. 2569 (VJ1 · VJ2) และของวันที่งานรัน (VJ3 · ต้องไม่ถูกปิด)
INSERT INTO crm.visits (id, organization_id, visit_no, branch_id, channel_code, status, queue_no, interest_code,
                        started_at, service_started_at, owner_staff_id, created_at, created_by) VALUES
 ('ac000000-0000-4000-8000-000000000301','ac000000-0000-4000-8000-000000000001','V-ZJ1-260915-001','ac000000-0000-4000-8000-000000000011','WALK_IN','WAITING',   1,'INQUIRY','2026-09-15T20:00:00+07:00',NULL,                       NULL,                                   '2026-09-15T20:00:00+07:00','ac000000-0000-4000-8000-000000000101'),
 ('ac000000-0000-4000-8000-000000000302','ac000000-0000-4000-8000-000000000001','V-ZJ1-260915-002','ac000000-0000-4000-8000-000000000011','WALK_IN','IN_SERVICE',2,'BUY',    '2026-09-15T14:00:00+07:00','2026-09-15T14:00:00+07:00','ac000000-0000-4000-8000-000000000101','2026-09-15T14:00:00+07:00','ac000000-0000-4000-8000-000000000101'),
 ('ac000000-0000-4000-8000-000000000303','ac000000-0000-4000-8000-000000000001','V-ZJ1-260916-001','ac000000-0000-4000-8000-000000000011','WALK_IN','WAITING',   1,'INQUIRY','2026-09-16T00:01:00+07:00',NULL,                       NULL,                                   '2026-09-16T00:01:00+07:00','ac000000-0000-4000-8000-000000000101');

-- opportunity + ใบเสนอราคา (ข้อ 4.6)
INSERT INTO crm.opportunities (id, organization_id, opportunity_no, customer_id, origin_channel_code, branch_id,
                               owner_staff_id, interest_code, stage, priority_code, expected_amount,
                               next_action, next_action_type_code, next_action_at, created_at, created_by)
VALUES ('ac000000-0000-4000-8000-000000000501','ac000000-0000-4000-8000-000000000001','OP-1993-000001',
        'ac000000-0000-4000-8000-000000000201','WALK_IN','ac000000-0000-4000-8000-000000000011',
        'ac000000-0000-4000-8000-000000000101','BUY','QUOTATION','NORMAL',10000,
        'ติดตามลูกค้า','CALL','2026-09-30T10:00:00+07:00','2026-09-01T10:00:00+07:00','ac000000-0000-4000-8000-000000000101');
INSERT INTO crm.quotations (id, organization_id, quotation_no, opportunity_id, customer_id, branch_id, owner_staff_id,
                            status, sent_at, sent_channel_code, valid_until, total_amount, created_at, created_by) VALUES
 ('ac000000-0000-4000-8000-000000000601','ac000000-0000-4000-8000-000000000001','QT-1993-000001','ac000000-0000-4000-8000-000000000501','ac000000-0000-4000-8000-000000000201','ac000000-0000-4000-8000-000000000011','ac000000-0000-4000-8000-000000000101','SENT',    '2026-09-01T10:00:00+07:00','LINE','2026-09-08',10000,'2026-09-01T10:00:00+07:00','ac000000-0000-4000-8000-000000000101'),
 ('ac000000-0000-4000-8000-000000000602','ac000000-0000-4000-8000-000000000001','QT-1993-000002','ac000000-0000-4000-8000-000000000501','ac000000-0000-4000-8000-000000000201','ac000000-0000-4000-8000-000000000011','ac000000-0000-4000-8000-000000000101','SENT',    '2026-09-09T10:00:00+07:00','LINE','2026-09-16',10000,'2026-09-09T10:00:00+07:00','ac000000-0000-4000-8000-000000000101'),
 ('ac000000-0000-4000-8000-000000000603','ac000000-0000-4000-8000-000000000001','QT-1993-000003','ac000000-0000-4000-8000-000000000501','ac000000-0000-4000-8000-000000000201','ac000000-0000-4000-8000-000000000011','ac000000-0000-4000-8000-000000000101','ACCEPTED','2026-09-01T10:00:00+07:00','LINE','2026-09-01',10000,'2026-09-01T10:00:00+07:00','ac000000-0000-4000-8000-000000000101');

-- คำขอส่งออก (ข้อ 8.2) · seed_mode = on ทำให้ audit.trg_guard_export_request ยอมรับสถานะเริ่มต้นตามที่ตั้ง
INSERT INTO audit.export_requests (id, organization_id, export_no, requested_by, requested_as_role, requested_at,
                                   branch_ids, reason_code, row_count, status, approved_by, decided_at,
                                   generated_at, file_path, download_count) VALUES
 ('ac000000-0000-4000-8000-000000000701','ac000000-0000-4000-8000-000000000001','EX-1993-000001','ac000000-0000-4000-8000-000000000109','BUSINESS_ADMIN','2026-09-14T09:00:00+07:00','{}','MANAGEMENT_REPORT',100,'GENERATED', 'ac000000-0000-4000-8000-000000000110','2026-09-14T09:30:00+07:00','2026-09-14T10:00:00+07:00','exports/EX-1993-000001.csv',0),
 ('ac000000-0000-4000-8000-000000000702','ac000000-0000-4000-8000-000000000001','EX-1993-000002','ac000000-0000-4000-8000-000000000109','BUSINESS_ADMIN','2026-09-16T05:00:00+07:00','{}','MANAGEMENT_REPORT',100,'GENERATED', 'ac000000-0000-4000-8000-000000000110','2026-09-16T05:30:00+07:00','2026-09-16T06:00:00+07:00','exports/EX-1993-000002.csv',0),
 ('ac000000-0000-4000-8000-000000000703','ac000000-0000-4000-8000-000000000001','EX-1993-000003','ac000000-0000-4000-8000-000000000109','BUSINESS_ADMIN','2026-09-10T09:00:00+07:00','{}','MANAGEMENT_REPORT',100,'DOWNLOADED','ac000000-0000-4000-8000-000000000110','2026-09-10T09:30:00+07:00','2026-09-10T10:00:00+07:00','exports/EX-1993-000003.csv',2);

-- คำขอเจ้าของข้อมูล (ข้อ 10.4) · due_at = received_at + 30 วัน = 1 ต.ค. 2569 10:00
INSERT INTO crm.data_subject_requests (id, organization_id, request_no, customer_id, requester_name, request_type,
                                       status, received_at, received_by, verification_method, verified_by, created_at, created_by)
VALUES ('ac000000-0000-4000-8000-000000000801','ac000000-0000-4000-8000-000000000001','DSR-1993-000001',
        'ac000000-0000-4000-8000-000000000201','ผู้ขอทดสอบ','ACCESS','VERIFIED','2026-09-01T10:00:00+07:00',
        'ac000000-0000-4000-8000-000000000101','IN_PERSON_ID_SIGHTED','ac000000-0000-4000-8000-000000000109',
        '2026-09-01T10:00:00+07:00','ac000000-0000-4000-8000-000000000101');

-- log เก่าสำหรับทดสอบระยะเก็บ (ข้อ 10.3)
INSERT INTO audit.audit_logs (occurred_at, organization_id, actor_type, action, entity_type, entity_id) VALUES
 ('2019-01-01T10:00:00+07:00','ac000000-0000-4000-8000-000000000001','SYSTEM','CUSTOMER_UPDATED','CUSTOMER','old-1'),
 ('2026-09-01T10:00:00+07:00','ac000000-0000-4000-8000-000000000001','SYSTEM','CUSTOMER_UPDATED','CUSTOMER','new-1');
INSERT INTO audit.access_logs (occurred_at, organization_id, action) VALUES
 ('2024-01-01T10:00:00+07:00','ac000000-0000-4000-8000-000000000001','CUSTOMER_VIEWED'),
 ('2026-09-01T10:00:00+07:00','ac000000-0000-4000-8000-000000000001','CUSTOMER_VIEWED');
INSERT INTO audit.login_events (occurred_at, organization_id, event_type, success) VALUES
 ('2024-01-01T10:00:00+07:00','ac000000-0000-4000-8000-000000000001','PASSWORD', true),
 ('2026-09-01T10:00:00+07:00','ac000000-0000-4000-8000-000000000001','PASSWORD', true);

SELECT set_config('app.seed_mode', 'off', true);
SELECT set_config('app.bulk', 'off', true);

-- =====================================================================================
-- L. app.job_close_stale_visits (CANONICAL ข้อ 4.1 · 11.1 VISIT_OUTCOME_MISSING ระดับ 1)
-- =====================================================================================
SELECT test.assert_eq((app.job_close_stale_visits('2026-09-16T00:05:00+07:00') ->> 'visits_closed')::bigint, 2::bigint,
                      'L01 ปิด visit ค้างของวันธุรกิจก่อนหน้า 2 รายการ');
SELECT test.assert_eq((SELECT v.status::text FROM crm.visits v WHERE v.id = 'ac000000-0000-4000-8000-000000000301'),
                      'COMPLETED', 'L02 visit WAITING ที่ค้างถูกปิดเป็น COMPLETED');
SELECT test.assert_eq((SELECT v.outcome_code FROM crm.visits v WHERE v.id = 'ac000000-0000-4000-8000-000000000302'),
                      'UNRECORDED', 'L03 outcome = UNRECORDED');
SELECT test.assert_true((SELECT v.closed_by_system FROM crm.visits v WHERE v.id = 'ac000000-0000-4000-8000-000000000302'),
                        'L04 closed_by_system = true');
SELECT test.assert_eq((SELECT v.ended_at FROM crm.visits v WHERE v.id = 'ac000000-0000-4000-8000-000000000302'),
                      '2026-09-15T23:59:59+07:00'::timestamptz, 'L05 ended_at = 23:59:59 ของวันธุรกิจนั้น');
SELECT test.assert_eq((SELECT v.status::text FROM crm.visits v WHERE v.id = 'ac000000-0000-4000-8000-000000000303'),
                      'WAITING', 'L06 visit ของวันธุรกิจปัจจุบันไม่ถูกปิด');
SELECT test.assert_eq(test.nlevel('VISIT_OUTCOME_MISSING', 'ac000000-0000-4000-8000-000000000011', 1),
                      ARRAY['ac000000-0000-4000-8000-000000000105',
                            'ac000000-0000-4000-8000-000000000106']::uuid[],
                      'L07 สรุปสิ้นวันถึงผู้จัดการสาขาที่ ACTIVE เท่านั้น (ไม่ถึง MD ที่ DISABLED · M3 ของสาขาอื่น · หัวหน้าทีม)');
SELECT test.assert_eq((SELECT n.dedupe_key FROM crm.notifications n
                        WHERE n.code = 'VISIT_OUTCOME_MISSING'
                          AND n.recipient_staff_id = 'ac000000-0000-4000-8000-000000000105'),
                      'VISIT_OUTCOME_MISSING:ac000000-0000-4000-8000-000000000011:1:2026-09-15',
                      'L08 dedupe_key ยึดวันธุรกิจที่สรุป ไม่ใช่วันที่งานรัน (ข้อ 11.1)');
SELECT test.assert_true((SELECT n.body LIKE '%2 รายการ%' FROM crm.notifications n
                          WHERE n.code = 'VISIT_OUTCOME_MISSING'
                            AND n.recipient_staff_id = 'ac000000-0000-4000-8000-000000000105'),
                        'L09 body บอกจำนวนที่ระบบปิดให้');
-- รันซ้ำ: ไม่มี visit ให้ปิดแล้ว และไม่มีแถวแจ้งเตือนเพิ่ม
SELECT test.assert_eq((app.job_close_stale_visits('2026-09-16T00:05:00+07:00') ->> 'visits_closed')::bigint, 0::bigint,
                      'L10 รันซ้ำไม่ปิดซ้ำ');
SELECT test.assert_eq(test.nrows('VISIT_OUTCOME_MISSING'), 2::bigint, 'L11 รันซ้ำไม่สร้างแจ้งเตือนซ้ำ (ON CONFLICT DO NOTHING)');
SELECT test.assert_eq((SELECT a.actor_label FROM audit.audit_logs a
                        WHERE a.action = 'VISIT_UPDATED' ORDER BY a.id DESC LIMIT 1),
                      'SYSTEM:close_stale_visits', 'L12 actor ของงานระบบ (ข้อ 9.5)');

-- =====================================================================================
-- M. app.job_expire_quotations (CANONICAL ข้อ 4.6)
-- =====================================================================================
SELECT test.assert_eq((app.job_expire_quotations('2026-09-16T00:10:00+07:00') ->> 'expired')::bigint, 1::bigint,
                      'M01 ใบเสนอราคาที่พ้น valid_until หมดอายุ 1 ใบ');
SELECT test.assert_eq((SELECT q.status::text FROM crm.quotations q WHERE q.id = 'ac000000-0000-4000-8000-000000000601'),
                      'EXPIRED', 'M02 QT ที่ valid_until = 8 ก.ย. หมดอายุแล้ว');
SELECT test.assert_eq((SELECT q.status::text FROM crm.quotations q WHERE q.id = 'ac000000-0000-4000-8000-000000000602'),
                      'SENT', 'M03 QT ที่ valid_until = วันนี้ยังไม่หมดอายุ (หมดอายุ 00:00 ของวันถัดไป)');
SELECT test.assert_eq((SELECT q.status::text FROM crm.quotations q WHERE q.id = 'ac000000-0000-4000-8000-000000000603'),
                      'ACCEPTED', 'M04 ไม่แตะใบที่ ACCEPTED/REJECTED');
SELECT test.assert_eq((app.job_expire_quotations('2026-09-16T00:10:00+07:00') ->> 'expired')::bigint, 0::bigint,
                      'M05 รันซ้ำไม่เปลี่ยนซ้ำ');

-- =====================================================================================
-- N. app.job_expire_exports (CANONICAL ข้อ 8.2)
-- =====================================================================================
SELECT test.assert_eq((app.job_expire_exports('2026-09-16T12:00:00+07:00') ->> 'expired')::bigint, 2::bigint,
                      'N01 คำขอที่สร้างไฟล์เกิน export.link_ttl_hours (24 ชม.) หมดอายุ');
SELECT test.assert_eq((SELECT e.status::text FROM audit.export_requests e WHERE e.id = 'ac000000-0000-4000-8000-000000000701'),
                      'EXPIRED', 'N02 GENERATED → EXPIRED');
SELECT test.assert_eq((SELECT e.status::text FROM audit.export_requests e WHERE e.id = 'ac000000-0000-4000-8000-000000000703'),
                      'EXPIRED', 'N03 DOWNLOADED → EXPIRED');
SELECT test.assert_eq((SELECT e.download_count FROM audit.export_requests e WHERE e.id = 'ac000000-0000-4000-8000-000000000703'),
                      2, 'N04 จำนวนครั้งดาวน์โหลดคงไว้');
SELECT test.assert_eq((SELECT e.file_deleted_at FROM audit.export_requests e WHERE e.id = 'ac000000-0000-4000-8000-000000000703'),
                      NULL::timestamptz, 'N05 งานไม่ตั้ง file_deleted_at (Edge Function ลบไฟล์แล้วจึงตั้ง)');
SELECT test.assert_eq((SELECT e.status::text FROM audit.export_requests e WHERE e.id = 'ac000000-0000-4000-8000-000000000702'),
                      'GENERATED', 'N06 ไฟล์ที่ยังไม่ครบ 24 ชม. ไม่หมดอายุ');
SELECT test.assert_eq((app.job_expire_exports('2026-09-16T12:00:00+07:00') ->> 'expired')::bigint, 0::bigint,
                      'N07 รันซ้ำไม่เปลี่ยนซ้ำ');

-- =====================================================================================
-- O. app.job_notifications (CANONICAL ข้อ 11.1)
-- =====================================================================================
-- O1 · FOLLOWUP_DUE (anchor = remind_at)
INSERT INTO crm.tasks (id, organization_id, task_no, task_type_code, title, customer_id, branch_id, owner_staff_id,
                       status, priority_code, due_at, remind_at, created_at, created_by)
VALUES ('ac000000-0000-4000-8000-000000000901','ac000000-0000-4000-8000-000000000001','TK-1993-000001','FOLLOW_UP',
        'ติดตามใบเสนอราคา','ac000000-0000-4000-8000-000000000201','ac000000-0000-4000-8000-000000000011',
        'ac000000-0000-4000-8000-000000000101','OPEN','NORMAL','2026-09-15T14:00:00+07:00','2026-09-15T13:45:00+07:00',
        '2026-09-14T10:00:00+07:00','ac000000-0000-4000-8000-000000000101');
SELECT app.job_notifications('2026-09-15T13:40:00+07:00');
SELECT test.assert_eq(test.nrows('FOLLOWUP_DUE', 'ac000000-0000-4000-8000-000000000901'), 0::bigint,
                      'O01 ยังไม่ถึง remind_at จึงไม่แจ้ง');
SELECT app.job_notifications('2026-09-15T13:45:00+07:00');
SELECT test.assert_eq(test.nrows('FOLLOWUP_DUE', 'ac000000-0000-4000-8000-000000000901'), 1::bigint,
                      'O02 ถึง remind_at แล้วแจ้ง owner');
SELECT app.job_notifications('2026-09-15T13:50:00+07:00');
SELECT test.assert_eq(test.nrows('FOLLOWUP_DUE', 'ac000000-0000-4000-8000-000000000901'), 1::bigint,
                      'O03 รันซ้ำไม่แจ้งซ้ำ (dedupe_key ยึด remind_at)');
SELECT test.assert_eq((SELECT n.dedupe_key FROM crm.notifications n WHERE n.code = 'FOLLOWUP_DUE'),
                      'FOLLOWUP_DUE:ac000000-0000-4000-8000-000000000901:0:2026-09-15', 'O04 รูปแบบ dedupe_key');
SELECT test.assert_true((SELECT n.body LIKE 'คุณงาน หนึ่ง · ติดตามใบเสนอราคา · ครบกำหนด 15 ก.ย. 2569 14:00'
                           FROM crm.notifications n WHERE n.code = 'FOLLOWUP_DUE'),
                        'O05 body ตามแม่แบบ {ชื่อลูกค้า} · {ชื่องาน} · ครบกำหนด {เวลา}');

-- O2 · FOLLOWUP_OVERDUE ยกระดับ 0 → 1 → 2
INSERT INTO crm.tasks (id, organization_id, task_no, task_type_code, title, customer_id, branch_id, owner_staff_id,
                       status, priority_code, due_at, remind_at, created_at, created_by)
VALUES ('ac000000-0000-4000-8000-000000000902','ac000000-0000-4000-8000-000000000001','TK-1993-000002','FOLLOW_UP',
        'ติดตามเกินกำหนด','ac000000-0000-4000-8000-000000000201','ac000000-0000-4000-8000-000000000011',
        'ac000000-0000-4000-8000-000000000101','OPEN','NORMAL','2026-09-14T15:00:00+07:00','2026-09-14T14:45:00+07:00',
        '2026-09-13T10:00:00+07:00','ac000000-0000-4000-8000-000000000101');
SELECT app.job_notifications('2026-09-14T15:00:00+07:00');
SELECT test.assert_eq(test.nrows('FOLLOWUP_OVERDUE', 'ac000000-0000-4000-8000-000000000902'), 0::bigint,
                      'O06 ที่ due_at พอดียังไม่แจ้ง ("เกิน" = strict)');
SELECT app.job_notifications('2026-09-14T15:05:00+07:00');
SELECT test.assert_eq(test.nlevel('FOLLOWUP_OVERDUE', 'ac000000-0000-4000-8000-000000000902', 0),
                      ARRAY['ac000000-0000-4000-8000-000000000101']::uuid[], 'O07 ระดับ 0 ถึง owner');
SELECT app.job_notifications('2026-09-15T15:00:00+07:00');
SELECT test.assert_eq(test.nlevel('FOLLOWUP_OVERDUE', 'ac000000-0000-4000-8000-000000000902', 1),
                      '{}'::uuid[], 'O08 ยังไม่ครบ +24 ชม. จึงยังไม่ยกระดับ');
SELECT app.job_notifications('2026-09-15T15:05:00+07:00');
SELECT test.assert_eq(test.nlevel('FOLLOWUP_OVERDUE', 'ac000000-0000-4000-8000-000000000902', 1),
                      ARRAY['ac000000-0000-4000-8000-000000000103']::uuid[],
                      'O09 ระดับ 1 ถึงหัวหน้าทีมของ owner เท่านั้น (SUPERVISOR ที่ไม่ใช่หัวหน้าทีมไม่ได้รับ)');
SELECT app.job_notifications('2026-09-16T15:05:00+07:00');
SELECT test.assert_eq(test.nlevel('FOLLOWUP_OVERDUE', 'ac000000-0000-4000-8000-000000000902', 2),
                      ARRAY['ac000000-0000-4000-8000-000000000105',
                            'ac000000-0000-4000-8000-000000000106']::uuid[],
                      'O10 ระดับ 2 ถึงผู้จัดการสาขา (+48 ชม.)');
SELECT test.assert_eq(test.nrows('FOLLOWUP_OVERDUE', 'ac000000-0000-4000-8000-000000000902'), 4::bigint,
                      'O11 รวมทุกระดับ 4 แถว');
SELECT app.job_notifications('2026-09-16T15:10:00+07:00');
SELECT test.assert_eq(test.nrows('FOLLOWUP_OVERDUE', 'ac000000-0000-4000-8000-000000000902'), 4::bigint,
                      'O12 รันซ้ำไม่เพิ่มแถว');
SELECT test.assert_true((SELECT n.body LIKE '%ผู้รับผิดชอบ พนักงาน S1%' FROM crm.notifications n
                          WHERE n.code = 'FOLLOWUP_OVERDUE' AND n.entity_id = 'ac000000-0000-4000-8000-000000000902'
                            AND n.recipient_staff_id = 'ac000000-0000-4000-8000-000000000103'),
                        'O13 ระดับยกระดับต่อท้ายผู้รับผิดชอบใน body');

-- O3 · TASK_OVERDUE ไม่มีระดับ 2
INSERT INTO crm.tasks (id, organization_id, task_no, task_type_code, title, customer_id, branch_id, owner_staff_id,
                       status, priority_code, due_at, remind_at, created_at, created_by)
VALUES ('ac000000-0000-4000-8000-000000000903','ac000000-0000-4000-8000-000000000001','TK-1993-000003','CALL',
        'โทรยืนยันวันรับเครื่อง','ac000000-0000-4000-8000-000000000201','ac000000-0000-4000-8000-000000000011',
        'ac000000-0000-4000-8000-000000000101','OPEN','NORMAL','2026-09-14T13:00:00+07:00','2026-09-14T12:45:00+07:00',
        '2026-09-13T10:00:00+07:00','ac000000-0000-4000-8000-000000000101');
SELECT app.job_notifications('2026-09-17T13:05:00+07:00');
SELECT test.assert_eq(test.nlevel('TASK_OVERDUE', 'ac000000-0000-4000-8000-000000000903', 0),
                      ARRAY['ac000000-0000-4000-8000-000000000101']::uuid[], 'O14 TASK_OVERDUE ระดับ 0');
SELECT test.assert_eq(test.nlevel('TASK_OVERDUE', 'ac000000-0000-4000-8000-000000000903', 1),
                      ARRAY['ac000000-0000-4000-8000-000000000103']::uuid[], 'O15 TASK_OVERDUE ระดับ 1 หัวหน้าทีม');
SELECT test.assert_eq(test.nlevel('TASK_OVERDUE', 'ac000000-0000-4000-8000-000000000903', 2),
                      '{}'::uuid[], 'O16 TASK_OVERDUE ไม่มีระดับ 2 (ข้อ 11.1)');

-- O4 · LEAD_UNASSIGNED นับนาทีเวลาทำการและส่งเฉพาะในเวลาทำการ (10:00–21:00)
INSERT INTO crm.leads (id, organization_id, lead_no, customer_id, branch_id, owner_staff_id, channel_code,
                       interest_code, status, priority_code, next_action, next_action_type_code, next_action_at,
                       created_at, created_by)
VALUES ('ac000000-0000-4000-8000-000000000a01','ac000000-0000-4000-8000-000000000001','LD-1993-000001',
        'ac000000-0000-4000-8000-000000000201','ac000000-0000-4000-8000-000000000011',NULL,'LINE','BUY','NEW','NORMAL',
        'ติดต่อกลับลูกค้า','CALL','2026-09-30T10:00:00+07:00','2026-09-14T20:55:00+07:00',
        'ac000000-0000-4000-8000-000000000101');
SELECT app.job_notifications('2026-09-14T21:05:00+07:00');
SELECT test.assert_eq(test.nrows('LEAD_UNASSIGNED', 'ac000000-0000-4000-8000-000000000a01'), 0::bigint,
                      'O17 นอกเวลาทำการไม่ส่ง');
SELECT app.job_notifications('2026-09-15T10:10:00+07:00');
SELECT test.assert_eq(test.nrows('LEAD_UNASSIGNED', 'ac000000-0000-4000-8000-000000000a01'), 0::bigint,
                      'O18 สะสม 15 นาทีเวลาทำการยังไม่ "เกิน" เกณฑ์');
SELECT app.job_notifications('2026-09-15T10:15:00+07:00');
SELECT test.assert_eq(test.nlevel('LEAD_UNASSIGNED', 'ac000000-0000-4000-8000-000000000a01', 0),
                      ARRAY['ac000000-0000-4000-8000-000000000103',
                            'ac000000-0000-4000-8000-000000000105',
                            'ac000000-0000-4000-8000-000000000106']::uuid[],
                      'O19 ผู้รับ = หัวหน้าทีมในสาขา + ผู้จัดการสาขา (ไม่รวม SUPERVISOR ที่ไม่ใช่หัวหน้าทีม)');
SELECT test.assert_eq((SELECT DISTINCT n.dedupe_key FROM crm.notifications n
                        WHERE n.code = 'LEAD_UNASSIGNED'),
                      'LEAD_UNASSIGNED:ac000000-0000-4000-8000-000000000a01:0:2026-09-14',
                      'O20 anchor = เวลาที่เริ่มไม่มีผู้รับผิดชอบ (วันที่สร้าง lead) ไม่ใช่วันที่งานรัน');

-- O5 · VISITOR_WAITING_LONG (นาทีปฏิทิน · ส่งเฉพาะในเวลาทำการ)
INSERT INTO crm.visits (id, organization_id, visit_no, branch_id, channel_code, status, queue_no, interest_code,
                        started_at, created_at, created_by)
VALUES ('ac000000-0000-4000-8000-000000000304','ac000000-0000-4000-8000-000000000001','V-ZJ1-260915-003',
        'ac000000-0000-4000-8000-000000000011','WALK_IN','WAITING',3,'TRADE_IN','2026-09-15T10:12:00+07:00',
        '2026-09-15T10:12:00+07:00','ac000000-0000-4000-8000-000000000101');
SELECT app.job_notifications('2026-09-15T10:25:00+07:00');
SELECT test.assert_eq(test.nrows('VISITOR_WAITING_LONG', 'ac000000-0000-4000-8000-000000000304'), 0::bigint,
                      'O21 รอ 13 นาที ยังไม่เกินเกณฑ์ 15 นาที');
SELECT app.job_notifications('2026-09-15T10:30:00+07:00');
SELECT test.assert_eq(test.nlevel('VISITOR_WAITING_LONG', 'ac000000-0000-4000-8000-000000000304', 0),
                      ARRAY['ac000000-0000-4000-8000-000000000103',
                            'ac000000-0000-4000-8000-000000000105',
                            'ac000000-0000-4000-8000-000000000106']::uuid[],
                      'O22 แจ้งหัวหน้าทีมและผู้จัดการสาขาเมื่อรอเกิน 15 นาที');
SELECT test.assert_true((SELECT n.body LIKE 'คิว 003 · เทิร์นเครื่อง · รอตั้งแต่ 10:12 น.' FROM crm.notifications n
                          WHERE n.code = 'VISITOR_WAITING_LONG'
                            AND n.entity_id = 'ac000000-0000-4000-8000-000000000304'
                            AND n.recipient_staff_id = 'ac000000-0000-4000-8000-000000000105'),
                        'O23 body ของคิว (ไม่มีชื่อลูกค้าเพราะยังไม่ระบุตัวตน)');

-- O6 · VISIT_OUTCOME_MISSING ระดับ 0 (IN_SERVICE เกิน 60 นาที)
INSERT INTO crm.visits (id, organization_id, visit_no, branch_id, channel_code, status, queue_no, customer_id,
                        interest_code, started_at, service_started_at, owner_staff_id, created_at, created_by)
VALUES ('ac000000-0000-4000-8000-000000000305','ac000000-0000-4000-8000-000000000001','V-ZJ1-260915-004',
        'ac000000-0000-4000-8000-000000000011','WALK_IN','IN_SERVICE',4,'ac000000-0000-4000-8000-000000000201','BUY',
        '2026-09-15T10:00:00+07:00','2026-09-15T10:00:00+07:00','ac000000-0000-4000-8000-000000000101',
        '2026-09-15T10:00:00+07:00','ac000000-0000-4000-8000-000000000101');
SELECT app.job_notifications('2026-09-15T11:00:00+07:00');
SELECT test.assert_eq(test.nrows('VISIT_OUTCOME_MISSING', 'ac000000-0000-4000-8000-000000000305'), 0::bigint,
                      'O24 ครบ 60 นาทีพอดียังไม่แจ้ง');
SELECT app.job_notifications('2026-09-15T11:05:00+07:00');
SELECT test.assert_eq(test.nlevel('VISIT_OUTCOME_MISSING', 'ac000000-0000-4000-8000-000000000305', 0),
                      ARRAY['ac000000-0000-4000-8000-000000000101']::uuid[],
                      'O25 ระดับ 0 ถึงผู้รับ visit');

-- O7 · DSR_DUE_SOON (7 วันก่อน due_at = 1 ต.ค. 2569 10:00)
SELECT app.job_notifications('2026-09-24T09:55:00+07:00');
SELECT test.assert_eq(test.nrows('DSR_DUE_SOON', 'ac000000-0000-4000-8000-000000000801'), 0::bigint,
                      'O26 ก่อนถึงจุดยึด 7 วันยังไม่แจ้ง');
SELECT app.job_notifications('2026-09-24T10:00:00+07:00');
SELECT test.assert_eq(test.nlevel('DSR_DUE_SOON', 'ac000000-0000-4000-8000-000000000801', 0),
                      ARRAY['ac000000-0000-4000-8000-000000000109',
                            'ac000000-0000-4000-8000-000000000110']::uuid[],
                      'O27 แจ้ง BUSINESS_ADMIN ทุกคนขององค์กร');
SELECT app.job_notifications('2026-09-24T10:05:00+07:00');
SELECT test.assert_eq(test.nrows('DSR_DUE_SOON', 'ac000000-0000-4000-8000-000000000801'), 2::bigint,
                      'O28 รันซ้ำไม่เพิ่มแถว');

-- O8 · LEAD_NOT_CONTACTED (lead NEW ที่มี owner · นาทีเวลาทำการ)
INSERT INTO crm.leads (id, organization_id, lead_no, customer_id, branch_id, owner_staff_id, channel_code,
                       interest_code, status, priority_code, next_action, next_action_type_code, next_action_at,
                       created_at, created_by)
VALUES ('ac000000-0000-4000-8000-000000000a02','ac000000-0000-4000-8000-000000000001','LD-1993-000002',
        'ac000000-0000-4000-8000-000000000201','ac000000-0000-4000-8000-000000000011',
        'ac000000-0000-4000-8000-000000000101','FACEBOOK','BUY','NEW','NORMAL',
        'ติดต่อกลับลูกค้า','CALL','2026-09-30T10:00:00+07:00','2026-09-25T11:00:00+07:00',
        'ac000000-0000-4000-8000-000000000101');
SELECT app.job_notifications('2026-09-25T11:30:00+07:00');
SELECT test.assert_eq(test.nrows('LEAD_NOT_CONTACTED', 'ac000000-0000-4000-8000-000000000a02'), 0::bigint,
                      'O29 ครบ 30 นาทีพอดียังไม่แจ้ง');
SELECT app.job_notifications('2026-09-25T11:35:00+07:00');
SELECT test.assert_eq(test.nlevel('LEAD_NOT_CONTACTED', 'ac000000-0000-4000-8000-000000000a02', 0),
                      ARRAY['ac000000-0000-4000-8000-000000000101',
                            'ac000000-0000-4000-8000-000000000103']::uuid[],
                      'O30 แจ้ง owner และหัวหน้าทีมพร้อมกันที่ระดับ 0');

-- O9 · OPPORTUNITY_STALE ระดับ 0 และ 1
SELECT app.job_notifications('2026-09-08T10:05:00+07:00');
SELECT test.assert_eq(test.nlevel('OPPORTUNITY_STALE', 'ac000000-0000-4000-8000-000000000501', 0),
                      ARRAY['ac000000-0000-4000-8000-000000000101']::uuid[],
                      'O31 ไม่มีความเคลื่อนไหว 7 วัน → owner');
SELECT app.job_notifications('2026-09-15T10:05:00+07:00');
SELECT test.assert_eq(test.nlevel('OPPORTUNITY_STALE', 'ac000000-0000-4000-8000-000000000501', 1),
                      ARRAY['ac000000-0000-4000-8000-000000000105',
                            'ac000000-0000-4000-8000-000000000106']::uuid[],
                      'O32 14 วัน → เพิ่มผู้จัดการสาขา');

-- O10 · เวลาทำการรายสาขาทับค่า default (ข้อ 11.1)
UPDATE app.settings SET value = '{"default": ["10:00", "21:00"], "ZJ1": ["09:00", "18:00"]}' WHERE key = 'business_hours';
SELECT test.assert_true(app.in_business_hours('ac000000-0000-4000-8000-000000000011', '2026-09-15T09:30:00+07:00'),
                        'O33 คีย์รหัสสาขาทับค่า default (09:00 อยู่ในเวลาทำการของ ZJ1)');
SELECT test.assert_true(NOT app.in_business_hours('ac000000-0000-4000-8000-000000000012', '2026-09-15T09:30:00+07:00'),
                        'O34 สาขาอื่นยังใช้ค่า default (10:00–21:00)');
SELECT test.assert_eq(app.business_minutes_between('ac000000-0000-4000-8000-000000000011',
                                                   '2026-09-14T17:30:00+07:00', '2026-09-15T09:30:00+07:00'),
                      60::numeric, 'O35 นับเฉพาะนาทีในเวลาทำการข้ามวัน (30 + 30 นาที)');
UPDATE app.settings SET value = '{"default": ["10:00", "21:00"]}' WHERE key = 'business_hours';

-- =====================================================================================
-- P. app.job_retention (CANONICAL ข้อ 10.3 · 10.4 · 11.1 · 19.4 ข้อ 1)
-- =====================================================================================
SELECT test.assert_eq((app.job_retention('2026-09-16T02:00:00+07:00') -> 'anonymized')::text, '1',
                      'P01 ลูกค้าที่ไม่เคยซื้อและไม่มีกิจกรรมเกิน 24 เดือนถูกทำเป็นข้อมูลนิรนาม');
SELECT test.assert_eq((SELECT c.record_status::text FROM crm.customers c WHERE c.id = 'ac000000-0000-4000-8000-000000000202'),
                      'ANONYMIZED', 'P02 CUS-1993-000002 ถูก anonymize');
SELECT test.assert_eq((SELECT c.record_status::text FROM crm.customers c WHERE c.id = 'ac000000-0000-4000-8000-000000000203'),
                      'ACTIVE', 'P03 ลูกค้าที่ยังไม่ครบกำหนดยังใช้งานอยู่');
SELECT test.assert_eq((SELECT c.record_status::text FROM crm.customers c WHERE c.id = 'ac000000-0000-4000-8000-000000000204'),
                      'ACTIVE', 'P04 ข้ามลูกค้าที่ legal_hold (ข้อ 10.3)');
SELECT test.assert_eq(test.nlevel('RETENTION_ANONYMIZE_UPCOMING', 'ac000000-0000-4000-8000-000000000001', 0),
                      ARRAY['ac000000-0000-4000-8000-000000000109',
                            'ac000000-0000-4000-8000-000000000110']::uuid[],
                      'P05 สรุปรายวันทั้งองค์กรถึง BUSINESS_ADMIN ทุกคน');
SELECT test.assert_true((SELECT n.body LIKE 'ลูกค้า 1 รายจะครบระยะเก็บข้อมูลภายใน 30 วัน%' FROM crm.notifications n
                          WHERE n.code = 'RETENTION_ANONYMIZE_UPCOMING'
                            AND n.recipient_staff_id = 'ac000000-0000-4000-8000-000000000109'),
                        'P06 body นับเฉพาะลูกค้าที่ครบกำหนดภายใน 30 วัน (ไม่นับรายที่ legal_hold)');
SELECT test.assert_eq((SELECT count(*) FROM audit.audit_logs a WHERE a.entity_id = 'old-1'), 0::bigint,
                      'P07 audit_logs เก่ากว่า 5 ปีถูกลบโดย role audit_retention');
SELECT test.assert_eq((SELECT count(*) FROM audit.audit_logs a WHERE a.entity_id = 'new-1'), 1::bigint,
                      'P08 audit_logs ที่ยังไม่ครบระยะเก็บยังอยู่');
SELECT test.assert_eq((SELECT count(*) FROM audit.access_logs a WHERE a.occurred_at < '2025-01-01'), 0::bigint,
                      'P09 access_logs เกิน 1 ปีถูกลบ');
SELECT test.assert_eq((SELECT count(*) FROM audit.login_events a WHERE a.occurred_at < '2025-01-01'), 0::bigint,
                      'P10 login_events เกิน 1 ปีถูกลบ');
SELECT test.assert_eq((SELECT count(*) FROM audit.access_logs a WHERE a.occurred_at >= '2025-01-01'), 1::bigint,
                      'P11 access_logs ที่ยังไม่ครบระยะเก็บยังอยู่');
SELECT test.assert_eq(current_setting('role', true), 'none', 'P12 คืน role เดิมหลังงาน retention');
SELECT test.assert_eq((app.job_retention('2026-09-16T02:00:00+07:00') -> 'anonymized')::text, '0',
                      'P13 รันซ้ำในวันเดียวกันไม่ anonymize ซ้ำ');
SELECT test.assert_eq(test.nrows('RETENTION_ANONYMIZE_UPCOMING'), 2::bigint,
                      'P14 รันซ้ำไม่สร้างสรุปซ้ำ (anchor = วันที่ของสรุป)');
