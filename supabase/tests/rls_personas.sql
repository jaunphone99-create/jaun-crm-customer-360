-- =====================================================================================
-- supabase/tests/rls_personas.sql — ตารางผลที่คาดของการตรวจสิทธิ์ (CANONICAL ข้อ 13.13)
-- ใช้ผู้ใช้ตัวอย่างของ supabase/seed.sql (ข้อ 13.5) · ต้องรันคู่กับ seed:
--   node tools/db/run.mjs --seed --test rls_personas
-- run.mjs ครอบไฟล์ด้วย BEGIN … ROLLBACK · ห้ามมีคำสั่งควบคุมทรานแซกชันในไฟล์
-- aal2 เว้นแต่ระบุ (ข้อ 13.13)
-- =====================================================================================

CREATE FUNCTION test.p_cust(p_no text) RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT c.id FROM crm.customers c WHERE c.customer_no = p_no $$;
CREATE FUNCTION test.p_staff(p_code text) RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT s.id FROM core.staff_profiles s WHERE s.staff_code = p_code $$;
CREATE FUNCTION test.p_branch(p_code text) RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT b.id FROM core.branches b WHERE b.code = p_code $$;
CREATE FUNCTION test.p_contact() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT cc.id FROM crm.customer_contacts cc
    WHERE cc.customer_id = test.p_cust('CUS-2026-000297') AND cc.contact_type = 'PHONE' $$;
CREATE FUNCTION test.p_opp() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT o.id FROM crm.opportunities o WHERE o.opportunity_no = 'OP-2026-002998' $$;
CREATE FUNCTION test.p_task() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT t.id FROM crm.tasks t WHERE t.task_no = 'TK-2026-012508' $$;
/** UPDATE ที่ถูก RLS ปิดกั้นจะกระทบ 0 แถว (ไม่ใช่ error) */
CREATE FUNCTION test.p_upd(p_sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE n bigint; BEGIN
    EXECUTE p_sql; GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
EXCEPTION WHEN insufficient_privilege THEN RETURN 0;
END; $$;
CREATE FUNCTION test.p_kpi_ok() RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE v jsonb; BEGIN
    SELECT api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'NONE') INTO v;
    RETURN (v ->> 'ok')::boolean;
EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END; $$;
CREATE FUNCTION test.p_kpin(p_code text) RETURNS numeric
LANGUAGE plpgsql AS $$
DECLARE v jsonb; BEGIN
    SELECT api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'NONE') INTO v;
    RETURN (SELECT (x ->> 'value')::numeric FROM jsonb_array_elements(v -> 'rows') x
             WHERE x ->> 'code' = p_code AND (x -> 'group_key') = 'null'::jsonb);
END; $$;
CREATE FUNCTION test.p_reveal_ok() RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE v jsonb; BEGIN
    SELECT api.reveal_contact(test.p_contact(), 'CALL') INTO v;
    RETURN (v ->> 'ok')::boolean;
EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END; $$;
/** ตรวจหนึ่งแถวของตารางข้อ 13.13 */
CREATE FUNCTION test.p_row(p_label text, p_email text, p_aal text,
                           p_read boolean, p_upd_cust boolean, p_upd_opp boolean,
                           p_read_task boolean, p_reveal boolean, p_kpi boolean) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE n bigint; BEGIN
    PERFORM test.login_as(p_email, p_aal);
    SELECT count(*) INTO n FROM crm.customers c WHERE c.id = test.p_cust('CUS-2026-000297');
    PERFORM test.assert_eq(n > 0, p_read, '13.13 ' || p_label || ' — อ่าน CUS-2026-000297');
    PERFORM test.assert_eq(test.p_upd($q$UPDATE crm.customers SET nickname = 'ทดสอบ'
                                        WHERE id = test.p_cust('CUS-2026-000297')$q$) > 0,
                           p_upd_cust, '13.13 ' || p_label || ' — แก้ CUS-2026-000297');
    PERFORM test.assert_eq(test.p_upd($q$UPDATE crm.opportunities SET next_action = 'โทรติดตามเรื่องผ่อน (แก้)'
                                        WHERE id = test.p_opp()$q$) > 0,
                           p_upd_opp, '13.13 ' || p_label || ' — แก้ OP-2026-002998');
    SELECT count(*) INTO n FROM crm.tasks t WHERE t.id = test.p_task();
    PERFORM test.assert_eq(n > 0, p_read_task, '13.13 ' || p_label || ' — อ่าน TK-2026-012508');
    PERFORM test.assert_eq(test.p_reveal_ok(), p_reveal, '13.13 ' || p_label || ' — เปิดเบอร์คุณสมชาย');
    PERFORM test.assert_eq(test.p_kpi_ok(), p_kpi, '13.13 ' || p_label || ' — api.get_kpis ช่วง P');
    PERFORM test.logout();
END; $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA test TO anon, authenticated, service_role;

-- ===== ตารางข้อ 13.13 =====
SELECT test.p_row('คุณขวัญ (ST@JP1 · aal1)', 'kwan@example.com', 'aal1', true,  true,  true,  true,  true,  true);
SELECT test.p_row('คุณคิม (ST@JP1 · aal1)',  'kim@example.com',  'aal1', true,  false, false, false, true,  true);
SELECT test.p_row('คุณนัท (SV@JP1)',         'nat@example.com',  'aal2', true,  true,  true,  true,  true,  true);
SELECT test.p_row('คุณนัท (SV@JP1 · aal1)',  'nat@example.com',  'aal1', false, false, false, false, false, false);
SELECT test.p_row('คุณเจ (BM@JP1)',          'jay@example.com',  'aal2', true,  true,  true,  true,  true,  true);
SELECT test.p_row('คุณบอส (BM@JP2)',         'boss@example.com', 'aal2', false, false, false, false, false, true);
SELECT test.p_row('คุณฝน (ST@JPON · aal1)',  'fon@example.com',  'aal1', false, false, false, false, false, true);
SELECT test.p_row('คุณปุ๊ก (OP@JP1–4)',       'puk@example.com',  'aal2', true,  false, false, true,  false, true);
SELECT test.p_row('คุณมายด์ (MK)',           'mind@example.com', 'aal2', false, false, false, false, false, true);
SELECT test.p_row('จ๋าอั๋น (EX)',             'ja@example.com',   'aal2', true,  false, false, true,  true,  true);
SELECT test.p_row('จ๋าอั๋น (EX · aal1)',      'ja@example.com',   'aal1', false, false, false, false, false, false);
SELECT test.p_row('คุณแพร (BA)',             'prae@example.com', 'aal2', true,  true,  true,  true,  true,  true);
SELECT test.p_row('คุณต้น (SA)',              'ton@example.com',  'aal2', false, false, false, false, false, false);

-- ===== ขอบเขตของ api.get_kpis ตามคอลัมน์สุดท้ายของข้อ 13.13 =====
SELECT test.login_as('kwan@example.com', 'aal1');
SELECT test.assert_eq(test.p_kpin('LEADS'), 154::numeric, '13.13 คุณขวัญ — ขอบเขตของตน (Leads 154 · ข้อ 13.6)');
SELECT test.assert_eq(test.p_kpin('SALES'), 44::numeric,  '13.13 คุณขวัญ — Sales 44');
SELECT test.assert_true(test.p_kpin('UNIQUE_CUSTOMERS') IS NULL, '13.13 คุณขวัญ — KPI ที่ไม่ผูกพนักงานเป็น NULL');
SELECT test.logout();
SELECT test.login_as('kim@example.com', 'aal1');
SELECT test.assert_eq(test.p_kpin('LEADS'), 142::numeric, '13.13 คุณคิม — ขอบเขตของตน (Leads 142)');
SELECT test.logout();
SELECT test.login_as('nat@example.com', 'aal2');
SELECT test.assert_eq(test.p_kpin('LEADS'), 296::numeric, '13.13 คุณนัท — ทีม JP1-SALES (Leads 296)');
SELECT test.assert_eq(test.p_kpin('SALES'), 82::numeric,  '13.13 คุณนัท — ทีม Sales 82');
SELECT test.logout();
SELECT test.login_as('jay@example.com', 'aal2');
SELECT test.assert_eq(test.p_kpin('VISITS'), 1008::numeric, '13.13 คุณเจ — แถว JAUNPHONE 1 (VISITS 1,008)');
SELECT test.assert_eq(test.p_kpin('UNIQUE_CUSTOMERS'), 412::numeric, '13.13 คุณเจ — ลูกค้าไม่ซ้ำ 412');
SELECT test.logout();
SELECT test.login_as('boss@example.com', 'aal2');
SELECT test.assert_eq(test.p_kpin('VISITS'), 842::numeric, '13.13 คุณบอส — แถว JAUNPHONE 2 (VISITS 842)');
SELECT test.assert_eq(test.p_kpin('UNIQUE_CUSTOMERS'), 356::numeric, '13.13 คุณบอส — ลูกค้าไม่ซ้ำ 356');
SELECT test.logout();
SELECT test.login_as('fon@example.com', 'aal1');
SELECT test.assert_eq(test.p_kpin('VISITS'), 0::numeric, '13.13 คุณฝน — จำนวนเป็น 0');
SELECT test.assert_true(test.p_kpin('CAPTURE_RATE') IS NULL, '13.13 คุณฝน — อัตรา 0/0 เป็น NULL');
SELECT test.assert_true(test.p_kpin('UNIQUE_CUSTOMERS') IS NULL, '13.13 คุณฝน — KPI ที่ไม่ผูกพนักงานเป็น NULL');
SELECT test.logout();
SELECT test.login_as('puk@example.com', 'aal2');
SELECT test.assert_eq(test.p_kpin('VISITS'), 3125::numeric, '13.13 คุณปุ๊ก — = ข้อ 13.1 (VISITS 3,125)');
SELECT test.assert_eq(test.p_kpin('UNIQUE_CUSTOMERS'), 1284::numeric, '13.13 คุณปุ๊ก — ลูกค้าไม่ซ้ำ 1,284');
SELECT test.logout();
SELECT test.login_as('mind@example.com', 'aal2');
SELECT test.assert_eq(test.p_kpin('VISITS'), 3125::numeric, '13.13 คุณมายด์ — = ข้อ 13.1');
SELECT test.logout();
SELECT test.login_as('ja@example.com', 'aal2');
SELECT test.assert_eq(test.p_kpin('VISITS'), 3125::numeric, '13.13 จ๋าอั๋น — = ข้อ 13.1');
SELECT test.logout();
SELECT test.login_as('prae@example.com', 'aal2');
SELECT test.assert_eq(test.p_kpin('VISITS'), 3125::numeric, '13.13 คุณแพร — = ข้อ 13.1');
SELECT test.logout();

-- =====================================================================================
-- test เพิ่มเติมที่บังคับใต้ตารางข้อ 13.13
-- fixture เล็ก ๆ (อีเมล @test.example.com · staff ST-95xx) สร้างในทรานแซกชันของไฟล์ทดสอบ
-- =====================================================================================
SELECT set_config('app.seed_mode', 'on', true);
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('95000000-0000-4000-8000-000000000001', 'norole@test.example.com',  now()),
    ('95000000-0000-4000-8000-000000000002', 'bmst@test.example.com',    now()),
    ('95000000-0000-4000-8000-000000000003', 'jp2staff@test.example.com', now());
INSERT INTO auth.mfa_factors (user_id, status) VALUES
    ('95000000-0000-4000-8000-000000000002', 'verified');
INSERT INTO core.staff_profiles (id, organization_id, staff_code, employee_code, display_name, email, user_id, status) VALUES
    ('95000000-0000-4000-8000-000000000101', (SELECT id FROM core.organizations WHERE code = 'JAUN'),
     'ST-9501', 'EMP9501', 'พนักงานไม่มีบทบาท', 'norole@test.example.com', '95000000-0000-4000-8000-000000000001', 'ACTIVE'),
    ('95000000-0000-4000-8000-000000000102', (SELECT id FROM core.organizations WHERE code = 'JAUN'),
     'ST-9502', 'EMP9502', 'ผู้จัดการ JP1 + พนักงาน JP2', 'bmst@test.example.com', '95000000-0000-4000-8000-000000000002', 'ACTIVE'),
    ('95000000-0000-4000-8000-000000000103', (SELECT id FROM core.organizations WHERE code = 'JAUN'),
     'ST-9503', 'EMP9503', 'พนักงาน JP2', 'jp2staff@test.example.com', '95000000-0000-4000-8000-000000000003', 'ACTIVE');
INSERT INTO core.staff_role_assignments (organization_id, staff_id, role_code, branch_id, valid_from) VALUES
    ((SELECT id FROM core.organizations WHERE code = 'JAUN'), '95000000-0000-4000-8000-000000000102', 'BRANCH_MANAGER', test.p_branch('JP1'), now() - interval '30 days'),
    ((SELECT id FROM core.organizations WHERE code = 'JAUN'), '95000000-0000-4000-8000-000000000102', 'STAFF',          test.p_branch('JP2'), now() - interval '30 days'),
    ((SELECT id FROM core.organizations WHERE code = 'JAUN'), '95000000-0000-4000-8000-000000000103', 'STAFF',          test.p_branch('JP2'), now() - interval '30 days');
SELECT set_config('app.seed_mode', 'off', true);

-- 1) ผู้ใช้ที่ไม่มีบทบาทอ่าน crm.customers ได้ 0 แถว
SELECT test.login_as('norole@test.example.com', 'aal2');
SELECT test.assert_eq(test.count_rows('SELECT id FROM crm.customers'), 0::bigint,
                      '13.13+ ผู้ใช้ที่ไม่มีบทบาทอ่าน crm.customers ได้ 0 แถว');
SELECT test.assert_eq(test.count_rows('SELECT id FROM crm.leads'), 0::bigint,
                      '13.13+ ผู้ใช้ที่ไม่มีบทบาทอ่าน crm.leads ได้ 0 แถว');
-- 2) ต้องไม่ใช่ superuser ขณะทดสอบ
SELECT test.assert_eq(current_setting('is_superuser'), 'off', '13.13+ current_setting(is_superuser) = off');
SELECT test.assert_eq(current_user::text, 'authenticated', '13.13+ current_user = authenticated');
SELECT test.logout();

-- 3) BM@JP1 + ST@JP2 แก้ lead ของคนอื่นที่ JP2 ได้ 0 แถว (ข้อ 8.0 ประเมินต่อแถวการมอบบทบาท)
SELECT test.login_as('bmst@test.example.com', 'aal2');
SELECT test.assert_eq(test.p_upd($$UPDATE crm.leads SET next_action = 'ทดสอบ'
                                   WHERE id = (SELECT l.id FROM crm.leads l
                                                WHERE l.branch_id = test.p_branch('JP2')
                                                  AND l.status IN ('NEW','CONTACTED','QUALIFIED')
                                                  AND l.owner_staff_id IS NOT NULL
                                                  AND l.owner_staff_id <> '95000000-0000-4000-8000-000000000102'
                                                ORDER BY l.lead_no LIMIT 1)$$), 0::bigint,
                      '13.13+ BM@JP1 + ST@JP2 แก้ lead ของคนอื่นที่ JP2 ได้ 0 แถว');
SELECT test.assert_true(test.p_upd($$UPDATE crm.leads SET next_action = 'ทดสอบ'
                                   WHERE id = (SELECT l.id FROM crm.leads l
                                                WHERE l.branch_id = test.p_branch('JP1')
                                                  AND l.status IN ('NEW','CONTACTED','QUALIFIED')
                                                ORDER BY l.lead_no LIMIT 1)$$) > 0,
                        '13.13+ คนเดียวกันแก้ lead ที่ JP1 ได้ (ขอบเขต BRANCH ของ BM)');
SELECT test.logout();

-- 4) STAFF@JP2 INSERT visit ที่ customer_id เป็นลูกค้า JP1 อย่างเดียว → ถูกปฏิเสธ
SELECT test.login_as('jp2staff@test.example.com', 'aal1');
SELECT test.assert_eq((SELECT count(*) FROM crm.customer_branches cb
                        WHERE cb.customer_id = test.p_cust('CUS-2026-000297') AND cb.branch_id = test.p_branch('JP2')),
                      0::bigint, '13.13+ คุณสมชายไม่ได้ผูกกับ JP2');
SELECT test.assert_raises($$INSERT INTO crm.visits (branch_id, channel_code, status, party_size, customer_id, interest_code, started_at)
                            VALUES (test.p_branch('JP2'), 'WALK_IN', 'WAITING', 1, test.p_cust('CUS-2026-000297'), 'BUY', now())$$,
                          '13.13+ STAFF@JP2 สร้าง visit ให้ลูกค้าของ JP1 ไม่ได้', '42501');
-- 5) อ่าน customer_contacts.value_raw ถูกปฏิเสธ (column grant · ข้อ 6.4)
SELECT test.assert_raises($$SELECT value_raw FROM crm.customer_contacts LIMIT 1$$,
                          '13.13+ SELECT value_raw ของ customer_contacts ถูกปฏิเสธ', '42501');
SELECT test.assert_true(test.count_rows('SELECT value_masked FROM crm.customer_contacts') >= 0,
                        '13.13+ อ่าน value_masked ได้ตามปกติ');
SELECT test.logout();

-- 6) SYSTEM_ADMIN ไม่มีสิทธิ์ customer.*
SELECT test.assert_eq((SELECT count(*) FROM core.role_permissions rp
                        WHERE rp.role_code = 'SYSTEM_ADMIN' AND rp.permission_code LIKE 'customer.%'), 0::bigint,
                      '13.13+ SYSTEM_ADMIN ไม่มีสิทธิ์ customer.*');
SELECT test.login_as('ton@example.com', 'aal2');
SELECT test.assert_eq(test.count_rows('SELECT id FROM crm.customers'), 0::bigint,
                      '13.13+ SYSTEM_ADMIN อ่าน crm.customers ได้ 0 แถว');
SELECT test.assert_eq(test.count_rows('SELECT id FROM crm.visits'), 0::bigint,
                      '13.13+ SYSTEM_ADMIN อ่าน crm.visits ได้ 0 แถว');
SELECT test.logout();
