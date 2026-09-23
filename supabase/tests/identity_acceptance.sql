-- =====================================================================================
-- supabase/tests/identity_acceptance.sql — เกณฑ์ยอมรับด้านตัวตนและสิทธิ์ 8 ข้อ
--
-- ไฟล์นี้จับคู่ 1:1 กับ 8 ข้อที่เจ้าของโครงการสั่งให้พิสูจน์ (Direction 23 ก.ย. 2569)
-- ตั้งใจให้อ่านง่ายและชี้ได้ว่า "ข้อไหนพิสูจน์ด้วยอะไร" ไม่ใช่ทดสอบซ้ำของ api_03_admin
-- ส่วนที่เป็นหน้าจอล้วน (ล็อกหน้าจอ · redirect) พิสูจน์บนเบราว์เซอร์ และระบุไว้ท้ายไฟล์
--
-- ใช้ผู้ใช้จาก supabase/seed.sql (CANONICAL ข้อ 13.5)
--   ST-0020 jay@example.com   BRANCH_MANAGER · JP1   (requires_mfa)
--   ST-0021 boss@example.com  BRANCH_MANAGER · JP2
--   ST-0030 nat@example.com   SUPERVISOR · JP1
--   ST-0045 kwan@example.com  STAFF · JP1            (ไม่บังคับ MFA)
--   ST-0002 prae@example.com  BUSINESS_ADMIN
--   ST-0003 ton@example.com   SYSTEM_ADMIN
-- run.mjs ครอบไฟล์ด้วย BEGIN … ROLLBACK · ห้ามมีคำสั่งควบคุมทรานแซกชันในไฟล์
-- =====================================================================================

-- ===== helper เฉพาะไฟล์นี้ =====
CREATE FUNCTION test.denied(p_sql text, p_msg text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM test.assert_raises(p_sql, p_msg, '42501');
END;
$$;
CREATE FUNCTION test.jsonrpc(p_sql text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
    EXECUTE p_sql INTO v;
    RETURN v;
END;
$$;
GRANT EXECUTE ON FUNCTION test.denied(text, text), test.jsonrpc(text) TO authenticated, service_role;

-- สวมบทบาท service_role เหมือน Edge Function
CREATE FUNCTION test.login_service() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    PERFORM set_config('role', 'service_role', true);
END;
$$;

CREATE TABLE test.idctx (k text PRIMARY KEY, v text);
CREATE FUNCTION test.idput(p_k text, p_v text) RETURNS void LANGUAGE sql AS
$$ INSERT INTO test.idctx VALUES (p_k, p_v) ON CONFLICT (k) DO UPDATE SET v = excluded.v $$;
CREATE FUNCTION test.idget(p_k text) RETURNS text LANGUAGE sql STABLE AS
$$ SELECT v FROM test.idctx WHERE k = p_k $$;
GRANT EXECUTE ON FUNCTION test.idput(text, text), test.idget(text) TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON test.idctx TO authenticated, service_role;

-- เก็บ uuid ที่ใช้บ่อย
SELECT test.idput('jp1', (SELECT id::text FROM core.branches WHERE code = 'JP1'));
SELECT test.idput('jp2', (SELECT id::text FROM core.branches WHERE code = 'JP2'));
SELECT test.idput('bm_jp1_user', (SELECT user_id::text FROM core.staff_profiles WHERE staff_code = 'ST-0020'));
SELECT test.idput('sv_jp1', (SELECT id::text FROM core.staff_profiles WHERE staff_code = 'ST-0030'));
SELECT test.idput('staff_jp1', (SELECT id::text FROM core.staff_profiles WHERE staff_code = 'ST-0045'));


-- =====================================================================================
-- ข้อ 1 — ผู้จัดการ JP1 เชิญพนักงาน JP1 ได้
-- เส้นทางจริง: Edge Function invite-staff → api.svc_prepare_invite (ส่ง actor_user_id ของผู้เชิญ)
-- =====================================================================================
SELECT test.login_service();
SELECT test.idput('inv1', (test.jsonrpc($q$SELECT api.svc_prepare_invite(jsonb_build_object(
    'email', 'accept1.jp1@test.example.com', 'employee_code', 'ACC-0001',
    'display_name', 'ผู้ถูกเชิญ JP1', 'role_code', 'STAFF',
    'branch_id', (SELECT test.idget('jp1')), 'actor_user_id', (SELECT test.idget('bm_jp1_user')), 'actor_aal', 'aal2'))$q$)) ->> 'staff_id');
SELECT test.logout();
SELECT test.assert_true(test.idget('inv1') IS NOT NULL, 'A1 ผู้จัดการ JP1 เชิญพนักงาน JP1 ได้');
SELECT test.assert_eq((SELECT status::text FROM core.staff_profiles WHERE id = test.idget('inv1')::uuid), 'INVITED',
    'A1b บัญชีที่ถูกเชิญอยู่สถานะ INVITED');
SELECT test.assert_eq((SELECT count(*) FROM core.staff_role_assignments a
                       WHERE a.staff_id = test.idget('inv1')::uuid
                         AND a.role_code = 'STAFF' AND a.branch_id = test.idget('jp1')::uuid), 1::bigint,
    'A1c บทบาทและสาขาถูกผูกให้ตั้งแต่ตอนเชิญ');
SELECT test.assert_eq((SELECT count(*) FROM core.staff_invitations i WHERE i.staff_id = test.idget('inv1')::uuid), 1::bigint,
    'A1d มีแถวคำเชิญไว้ให้ Before User Created hook ตรวจ (ข้อ 9.2)');


-- =====================================================================================
-- ข้อ 2 — เชิญข้ามสาขาไม่ได้
-- =====================================================================================
SELECT test.login_service();
SELECT test.denied($q$SELECT api.svc_prepare_invite(jsonb_build_object(
    'email', 'accept2.jp2@test.example.com', 'employee_code', 'ACC-0002',
    'display_name', 'ผู้ถูกเชิญข้ามสาขา', 'role_code', 'STAFF',
    'branch_id', (SELECT test.idget('jp2')), 'actor_user_id', (SELECT test.idget('bm_jp1_user')), 'actor_aal', 'aal2'))$q$,
    'A2 ผู้จัดการ JP1 เชิญเข้าสาขา JP2 ไม่ได้');
SELECT test.logout();
SELECT test.assert_eq((SELECT count(*) FROM core.staff_profiles WHERE email = 'accept2.jp2@test.example.com'), 0::bigint,
    'A2b ไม่มีบัญชีค้างจากคำเชิญที่ถูกปฏิเสธ');


-- =====================================================================================
-- ข้อ 3 — สร้าง Role สูงกว่าตัวเองไม่ได้ (รวมถึงเท่ากับตัวเอง · ข้อ 7.2)
-- =====================================================================================
SELECT test.login_service();
SELECT test.denied($q$SELECT api.svc_prepare_invite(jsonb_build_object(
    'email', 'accept3.ba@test.example.com', 'employee_code', 'ACC-0003',
    'display_name', 'ผู้ถูกเชิญบทบาทสูงกว่า', 'role_code', 'BUSINESS_ADMIN',
    'actor_user_id', (SELECT test.idget('bm_jp1_user')), 'actor_aal', 'aal2'))$q$,
    'A3 ผู้จัดการสาขาเชิญเป็น BUSINESS_ADMIN ไม่ได้');
SELECT test.denied($q$SELECT api.svc_prepare_invite(jsonb_build_object(
    'email', 'accept3.bm@test.example.com', 'employee_code', 'ACC-0004',
    'display_name', 'ผู้ถูกเชิญบทบาทเท่ากัน', 'role_code', 'BRANCH_MANAGER',
    'branch_id', (SELECT test.idget('jp1')), 'actor_user_id', (SELECT test.idget('bm_jp1_user')), 'actor_aal', 'aal2'))$q$,
    'A3b เชิญเป็นบทบาทระดับเท่ากับตนเองก็ไม่ได้');

SELECT test.logout();
SELECT test.login_as('jay@example.com', 'aal2');
SELECT test.assert_eq((SELECT api.can_assign_role(test.idget('staff_jp1')::uuid, 'SUPERVISOR', test.idget('jp1')::uuid)), true,
    'A3c ผู้จัดการมอบ SUPERVISOR ในสาขาตนได้');
SELECT test.assert_eq((SELECT api.can_assign_role(test.idget('staff_jp1')::uuid, 'BUSINESS_ADMIN', NULL)), false,
    'A3d ผู้จัดการมอบ BUSINESS_ADMIN ไม่ได้');
SELECT test.assert_eq((SELECT api.can_assign_role(test.idget('staff_jp1')::uuid, 'STAFF', test.idget('jp2')::uuid)), false,
    'A3e ผู้จัดการมอบบทบาทในสาขาอื่นไม่ได้');
SELECT test.logout();


-- =====================================================================================
-- ข้อ 4 — Disable แล้วเข้าไม่ได้ทันที
-- api.get_my_access() คือประตูแรกของทุกหน้า ถ้าบัญชีถูกปิด ต้องไม่ผ่านตั้งแต่ตรงนี้
-- =====================================================================================
SELECT test.login_as('kwan@example.com', 'aal2');
SELECT test.assert_eq(((SELECT api.get_my_access()) ->> 'ok')::boolean, true, 'A4 ก่อนปิดใช้งาน พนักงานเข้าระบบได้');
SELECT test.logout();

-- ผู้จัดการสาขาปิดใช้งานพนักงานในสาขาตน
SELECT test.login_as('jay@example.com', 'aal2');
SELECT test.assert_eq((test.jsonrpc($q$SELECT api.disable_staff((SELECT test.idget('staff_jp1'))::uuid, 'ทดสอบเกณฑ์ยอมรับ')$q$) ->> 'ok')::boolean,
    true, 'A4b ผู้จัดการปิดใช้งานพนักงานในสาขาตนได้');
SELECT test.logout();

SELECT test.assert_eq((SELECT status::text FROM core.staff_profiles WHERE id = test.idget('staff_jp1')::uuid), 'DISABLED',
    'A4c สถานะเปลี่ยนเป็น DISABLED ทันที');

-- เข้าระบบอีกครั้งด้วยบัญชีเดิม — ต้องใช้งานอะไรไม่ได้เลย
--
-- หมายเหตุสำคัญ: api.get_my_access() ตั้งใจให้ยังตอบได้แม้บัญชีไม่ ACTIVE
-- เพราะหน้าจอต้องรู้ว่า "บัญชีนี้สถานะอะไร" เพื่อพาไปหน้าที่ถูก
-- (INVITED → ตั้งรหัสผ่าน · DISABLED → ออกจากระบบ) ถ้าปฏิเสธตั้งแต่ตรงนี้ คำเชิญจะเปิดใช้งานไม่ได้เลย
-- การกันจริงอยู่ที่ app.current_staff_id() ซึ่งบังคับ status = 'ACTIVE' → ทุก RPC และทุกตารางจึงว่างเปล่า
SELECT test.login_as('kwan@example.com', 'aal2');
SELECT test.assert_eq(((SELECT api.get_my_access()) -> 'staff' ->> 'status'), 'DISABLED',
    'A4d บัญชีที่ถูกปิดใช้งานยังอ่านสถานะตัวเองได้ และสถานะคือ DISABLED (หน้าจอใช้ค่านี้เด้งออก)');
SELECT test.assert_eq((SELECT count(*) FROM (SELECT jsonb_array_elements((SELECT api.get_my_access()) -> 'permissions')) x), 0::bigint,
    'A4e บัญชีที่ถูกปิดใช้งานไม่เหลือสิทธิ์แม้แต่ข้อเดียว');
SELECT test.denied($q$SELECT api.search_customers('สมชาย')$q$, 'A4f บัญชีที่ถูกปิดใช้งานค้นลูกค้าไม่ได้');
SELECT test.denied($q$SELECT api.open_visit('{}'::jsonb)$q$, 'A4g บัญชีที่ถูกปิดใช้งานเปิด visit ไม่ได้');
SELECT test.assert_eq((SELECT count(*) FROM crm.customers), 0::bigint, 'A4h บัญชีที่ถูกปิดใช้งานเห็นลูกค้า 0 แถว');
SELECT test.logout();


-- =====================================================================================
-- ข้อ 5 — SYSTEM_ADMIN เข้าระบบได้ แต่เห็นลูกค้า = 0
-- =====================================================================================
SELECT test.login_as('ton@example.com', 'aal2');
SELECT test.assert_eq(((SELECT api.get_my_access()) ->> 'ok')::boolean, true, 'A5 SYSTEM_ADMIN เข้าระบบได้');
SELECT test.assert_eq((SELECT count(*) FROM crm.customers), 0::bigint, 'A5b SYSTEM_ADMIN เห็นลูกค้า 0 แถว');
SELECT test.assert_eq((SELECT count(*) FROM crm.visits), 0::bigint, 'A5c SYSTEM_ADMIN เห็น visit 0 แถว');
SELECT test.assert_eq((SELECT count(*) FROM crm.interactions), 0::bigint, 'A5d SYSTEM_ADMIN เห็นการติดต่อ 0 แถว');
SELECT test.assert_eq((SELECT count(*) FROM crm.customer_contacts), 0::bigint, 'A5e SYSTEM_ADMIN เห็นช่องทางติดต่อ 0 แถว');
SELECT test.assert_eq((SELECT count(*) FROM (SELECT jsonb_array_elements((SELECT api.get_my_access()) -> 'permissions')) x
                       WHERE (x.jsonb_array_elements ->> 'permission_code') LIKE 'customer.%'), 0::bigint,
    'A5f SYSTEM_ADMIN ไม่มีสิทธิ์หมวด customer เลยแม้แต่ข้อเดียว');
SELECT test.logout();


-- =====================================================================================
-- ข้อ 6 — บทบาทที่บังคับ MFA ข้าม MFA ไม่ได้
-- BRANCH_MANAGER มี requires_mfa = true · เซสชัน aal1 ต้องใช้สิทธิ์ของบทบาทนั้นไม่ได้
-- =====================================================================================
SELECT test.login_as('jay@example.com', 'aal1');
SELECT test.assert_eq(((SELECT api.get_my_access()) ->> 'aal'), 'aal1', 'A6 เซสชันยังเป็น aal1');
SELECT test.assert_eq((SELECT count(*) FROM (SELECT jsonb_array_elements((SELECT api.get_my_access()) -> 'roles')) x
                       WHERE (x.jsonb_array_elements ->> 'role_code') = 'BRANCH_MANAGER'
                         AND (x.jsonb_array_elements ->> 'effective_now')::boolean), 0::bigint,
    'A6b บทบาทที่บังคับ MFA ยังไม่มีผลเมื่อยังไม่ยืนยันตัวตน');
SELECT test.denied($q$SELECT api.disable_staff((SELECT test.idget('sv_jp1'))::uuid, 'ทดสอบข้าม MFA')$q$,
    'A6c ใช้สิทธิ์ของบทบาทที่บังคับ MFA ขณะเป็น aal1 ไม่ได้');
SELECT test.logout();

-- ยืนยันตัวตนแล้วใช้ได้ตามปกติ
SELECT test.login_as('jay@example.com', 'aal2');
SELECT test.assert_eq((SELECT count(*) FROM (SELECT jsonb_array_elements((SELECT api.get_my_access()) -> 'roles')) x
                       WHERE (x.jsonb_array_elements ->> 'role_code') = 'BRANCH_MANAGER'
                         AND (x.jsonb_array_elements ->> 'effective_now')::boolean), 1::bigint,
    'A6d ยืนยัน MFA แล้วบทบาทมีผลทันที');
SELECT test.logout();


-- =====================================================================================
-- ข้อ 7 — เข้าหน้าที่ไม่มีสิทธิ์ด้วย URL ตรง ๆ ไม่ได้
-- หน้าจอซ่อนเมนูให้แล้ว แต่การกันจริงอยู่ที่ฐานข้อมูล: เดา URL ถูกก็ยังไม่ได้ข้อมูล
-- =====================================================================================
SELECT test.login_as('kim@example.com', 'aal2');    -- STAFF · JP1 (ไม่ใช้ kwan เพราะข้อ 4 ปิดบัญชีไปแล้ว)
SELECT test.denied($q$SELECT api.list_staff('{}'::jsonb)$q$, 'A7 STAFF เปิดหน้าผู้ใช้งานและสิทธิ์ (13) ไม่ได้');
SELECT test.denied($q$SELECT api.get_settings()$q$, 'A7b STAFF เปิดหน้าตั้งค่าระบบ (18) ไม่ได้');
SELECT test.denied($q$SELECT api.search_audit('{}'::jsonb)$q$, 'A7c STAFF เปิดหน้าประวัติการใช้งาน (16) ไม่ได้');
-- หน้า PDPA (17) เป็นของผู้ดูแลข้อมูลธุรกิจ แต่ api.list_dsr เปิดให้ผู้มี dsr.create ด้วย
-- เพราะพนักงานหน้าร้านต้องยื่นคำขอแทนลูกค้าที่เดินมาขอได้ และต้องตามดูคำขอของตัวเองได้
-- สิ่งที่ต้องจริงคือ "เห็นเฉพาะของตัวเอง" และ "จัดการคำขอของคนอื่นไม่ได้"
SELECT test.assert_eq((SELECT jsonb_array_length((SELECT api.list_dsr('{}'::jsonb)) -> 'requests')), 0,
    'A7d STAFF เห็นคำขอเจ้าของข้อมูลของคนอื่นไม่ได้ (เห็น 0 รายการ)');
SELECT test.denied($q$SELECT api.anonymize_customer('00000000-0000-4000-8000-000000000000'::uuid)$q$,
    'A7e STAFF ทำข้อมูลลูกค้าเป็นนิรนามไม่ได้ (งานของ BUSINESS_ADMIN · 2-person)');
SELECT test.logout();

SELECT test.login_as('ton@example.com', 'aal2');    -- SYSTEM_ADMIN
SELECT test.denied($q$SELECT api.get_kpis('TODAY')$q$, 'A7f SYSTEM_ADMIN เปิดหน้าหลัก (02) ไม่ได้');
SELECT test.logout();


-- =====================================================================================
-- ข้อ 8 — อุปกรณ์ counter ที่ใช้ร่วมกัน ล็อกตามเวลาที่ตั้งไว้
-- ส่วนที่ฐานข้อมูลรับผิดชอบ: ทะเบียนอุปกรณ์ + ค่าเวลา · การนับถอยหลังอยู่ที่หน้าจอ
-- =====================================================================================
SELECT test.assert_eq((SELECT (value #>> '{}')::int FROM app.settings WHERE key = 'session.shared_counter_idle_min'), 10,
    'A8 ค่าเวลาไม่ใช้งานของอุปกรณ์ร่วมอยู่ในฐานข้อมูล (10 นาที · ข้อ 11.2)');

SELECT test.login_as('jay@example.com', 'aal2');
SELECT test.idput('dev1', (test.jsonrpc($q$SELECT api.register_device('ACCEPT-COUNTER-1', (SELECT test.idget('jp1'))::uuid, true)$q$) ->> 'device_id'));
SELECT test.assert_true(test.idget('dev1') IS NOT NULL, 'A8b ผู้จัดการลงทะเบียนอุปกรณ์ counter ที่ใช้ร่วมกันได้');
SELECT test.logout();

SELECT test.assert_eq((SELECT is_shared_counter FROM core.devices WHERE device_id = 'ACCEPT-COUNTER-1'), true,
    'A8c อุปกรณ์ถูกทำเครื่องหมายว่าเป็นเครื่องที่ใช้ร่วมกัน');
SELECT test.assert_eq((SELECT branch_id FROM core.devices WHERE device_id = 'ACCEPT-COUNTER-1'), test.idget('jp1')::uuid,
    'A8d อุปกรณ์ผูกกับสาขาที่ลงทะเบียน');

-- พนักงานทั่วไปลงทะเบียนอุปกรณ์เองไม่ได้ (ข้อ 9.2)
SELECT test.login_as('nat@example.com', 'aal2');
SELECT test.denied($q$SELECT api.register_device('ACCEPT-COUNTER-2', (SELECT test.idget('jp1'))::uuid, true)$q$,
    'A8e หัวหน้าทีมลงทะเบียนอุปกรณ์ counter เองไม่ได้ — ต้องเป็นผู้จัดการสาขา');
SELECT test.logout();


-- =====================================================================================
-- ข้อ 9 — ร่องรอยการตรวจสอบของงานด้านตัวตน (Login · MFA · Invite · Disable)
-- =====================================================================================
SELECT test.assert_true((SELECT count(*) FROM audit.audit_logs a
                         WHERE a.entity_id = test.idget('staff_jp1')) > 0,
    'A9 การปิดใช้งานบัญชีถูกบันทึกใน audit');
SELECT test.assert_true((SELECT count(*) FROM audit.audit_logs a
                         WHERE a.entity_id = test.idget('inv1')) > 0,
    'A9b การเชิญพนักงานใหม่ถูกบันทึกใน audit');

-- =====================================================================================
-- ส่วนที่พิสูจน์บนเบราว์เซอร์ ไม่ใช่ที่นี่ (บันทึกไว้เพื่อไม่ให้เข้าใจว่าครอบคลุมแล้ว)
--   ข้อ 4  — หน้าจอเด้งออกทันทีหลังบัญชีถูกปิด
--   ข้อ 6  — ถูกพาไป /login/mfa และ /login/mfa/enroll
--   ข้อ 7  — พิมพ์ URL ตรงแล้วเจอการ์ด "ไม่มีสิทธิ์เข้าหน้านี้"
--   ข้อ 8  — นับถอยหลัง 10 นาทีแล้วล็อกหน้าจอ · กลับมาต้องยืนยันตัวตนใหม่
-- =====================================================================================


-- =====================================================================================
-- ข้อ 9 (ต่อ) — ประตูเขียน audit.login_events
-- ตารางนี้ถูก REVOKE จากทุก role · ถ้าไม่มี RPC นี้ Login/MFA audit จะเขียนไม่ได้เลย
-- =====================================================================================
SELECT test.login_service();
SELECT test.assert_eq((test.jsonrpc($q$SELECT api.svc_record_login_event(jsonb_build_object(
    'event_type', 'LOGIN', 'method', 'PASSWORD', 'success', true,
    'user_id', (SELECT test.idget('bm_jp1_user')), 'aal', 'aal2',
    'identifier_hash', repeat('a', 64), 'ip', '203.0.113.9'))$q$) ->> 'ok')::boolean, true,
    'A9c บันทึกเหตุการณ์เข้าสู่ระบบสำเร็จได้');
SELECT test.assert_eq((test.jsonrpc($q$SELECT api.svc_record_login_event(jsonb_build_object(
    'event_type', 'LOGIN_FAILED', 'method', 'STAFF_CODE', 'success', false,
    'failure_reason', 'BAD_CREDENTIALS', 'identifier_hash', repeat('b', 64)))$q$) ->> 'ok')::boolean, true,
    'A9d บันทึกเหตุการณ์เข้าสู่ระบบล้มเหลวได้แม้ไม่รู้ว่าเป็นบัญชีใคร');
SELECT test.logout();

SELECT test.assert_eq((SELECT count(*) FROM audit.login_events WHERE event_type IN ('LOGIN', 'LOGIN_FAILED')), 2::bigint,
    'A9e เหตุการณ์ถูกบันทึกครบสองรายการ');
SELECT test.assert_eq((SELECT staff_id IS NOT NULL FROM audit.login_events WHERE event_type = 'LOGIN'), true,
    'A9f รายการที่รู้ตัวตนถูกผูกกับพนักงานให้อัตโนมัติ');
SELECT test.assert_eq((SELECT count(*) FROM audit.login_events WHERE identifier_hash !~ '^[0-9a-f]{64}$'), 0::bigint,
    'A9g เก็บเฉพาะ sha256 ของตัวระบุ ไม่เก็บอีเมลหรือรหัสพนักงานจริง (ข้อ 9.5)');

-- พนักงานทั่วไปเขียนตารางนี้เองไม่ได้
SELECT test.login_as('kim@example.com', 'aal2');
SELECT test.assert_raises($q$SELECT api.svc_record_login_event('{"event_type":"LOGIN","success":true}'::jsonb)$q$,
    'A9h ผู้ใช้ทั่วไปเขียน audit.login_events เองไม่ได้', '42501');
SELECT test.logout();
