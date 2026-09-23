-- =====================================================================================
-- tools/db/bootstrap-pilot.sql — สร้างองค์กร หน่วยธุรกิจ และสาขา บน environment ใหม่
--
-- ทำไมต้องมีไฟล์นี้: migration สร้าง "โครงตาราง" แต่ **ไม่ได้สร้างองค์กรหรือสาขาใด ๆ**
-- (ทั้งสามตารางถูก insert เฉพาะใน supabase/seed.sql ซึ่งเป็นข้อมูลสมมติและห้ามใช้บน prod)
-- หลัง `supabase db push` ฐานข้อมูลจึงยังไม่มีสาขาให้ผูกพนักงาน = ขั้นที่ 3 เริ่มไม่ได้
--
-- ใช้เมื่อไร: ขั้นที่ 2 ของ pilot-deployment-checklist.md · หนึ่งครั้งต่อ environment
-- รันที่ไหน:  SQL editor ของ project นั้น (ในฐานะ postgres) หรือ psql จาก IP ที่อนุญาต
--
-- ปลอดภัยที่จะรันซ้ำ — ทุกคำสั่งเป็น idempotent และจะไม่ทับค่าที่แก้ไปแล้ว
--
-- ⚠️ ห้ามรันไฟล์นี้บน environment ที่โหลด supabase/seed.sql ไปแล้ว (dev)
--    ข้อมูลตัวอย่างมีองค์กรและสาขาอยู่แล้ว การรันซ้ำไม่เสียหาย แต่ก็ไม่มีประโยชน์
-- =====================================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- แก้สามค่านี้ก่อนรัน แล้วอ่านซ้ำอีกครั้งว่าตรง environment ที่ตั้งใจ
-- ════════════════════════════════════════════════════════════════════════════
--   v_env      'staging' หรือ 'prod' ให้ตรงกับ project ที่กำลัง link อยู่
--              ตั้งผิด = ทุกหน้าจอและทุกรายงานติดป้าย environment ผิด (AL-07)
--   v_open_all true  = สร้าง JP1–JP4 และ JPON ทั้งหมด
--              false = สร้างเฉพาะ JP1 สาขาที่จะเปิด Pilot  ← ค่าเริ่มต้น
--              เรื่องนี้ยังรอยืนยัน C-14 · เปิดสาขาที่ยังไม่มีพนักงานไม่ได้เสียหาย
--              แต่ทำให้ตัวเลือกสาขาบนหน้าจอมีสาขาที่ยังไม่มีข้อมูล
--   v_notice   เลขฉบับประกาศความเป็นส่วนตัวที่ DPO อนุมัติ (C-13)
--              ปล่อยเป็น NULL ได้ถ้ายังไม่ได้ — สคริปต์จะข้ามและเตือน

DO $BOOT$
DECLARE
    v_env    text    := 'staging';                     -- ← แก้
    v_open_all boolean := false;                       -- ← แก้
    v_notice text    := NULL;                          -- ← แก้ (เช่น 'PN-2026-01')

    v_org uuid;
    v_bu  uuid;
    v_n   integer;
BEGIN
    IF v_env NOT IN ('dev', 'staging', 'prod') THEN
        RAISE EXCEPTION 'v_env ต้องเป็น dev · staging หรือ prod เท่านั้น (ได้ %)', v_env;
    END IF;

    -- ผู้กระทำของทุกแถวที่สคริปต์นี้เขียน = SYSTEM ไม่ใช่พนักงานคนใด
    -- ถ้าไม่ตั้ง audit จะบันทึกเป็น SYSTEM อยู่แล้ว แต่จะไม่มีป้ายบอกว่ามาจากสคริปต์ไหน
    PERFORM set_config('app.actor_type',  'SYSTEM', true);
    PERFORM set_config('app.actor_label', 'bootstrap-pilot', true);

    -- ---------------------------------------------------------------- องค์กร
    INSERT INTO core.organizations (code, name_th, is_active)
    VALUES ('JAUN', 'JAUN', true)
    ON CONFLICT (code) DO NOTHING;

    SELECT id INTO v_org FROM core.organizations WHERE code = 'JAUN';
    IF v_org IS NULL THEN
        RAISE EXCEPTION 'สร้างองค์กร JAUN ไม่สำเร็จ';
    END IF;

    -- ------------------------------------------------------------ หน่วยธุรกิจ
    -- JAUNPHONE = ร้านขายมือถือ · JPM = JAUN POWER MONEY (เชื่อมผ่านเลขธุรกรรมใน V1)
    INSERT INTO core.business_units (organization_id, code, name_th, is_active) VALUES
        (v_org, 'JAUNPHONE', 'JAUN PHONE',       true),
        (v_org, 'JPM',       'JAUN POWER MONEY', true)
    ON CONFLICT (organization_id, code) DO NOTHING;

    SELECT id INTO v_bu FROM core.business_units WHERE organization_id = v_org AND code = 'JAUNPHONE';

    -- ------------------------------------------------------------------ สาขา
    -- JP1 สร้างเสมอ เพราะเป็นสาขาที่เปิด Pilot (CANONICAL ข้อ 20.3)
    INSERT INTO core.branches (organization_id, business_unit_id, code, name_th, branch_type, is_active)
    VALUES (v_org, v_bu, 'JP1', 'JAUNPHONE 1', 'store', true)
    ON CONFLICT (organization_id, code) DO NOTHING;

    IF v_open_all THEN
        INSERT INTO core.branches (organization_id, business_unit_id, code, name_th, branch_type, is_active) VALUES
            (v_org, v_bu, 'JP2',  'JAUNPHONE 2',            'store',       true),
            (v_org, v_bu, 'JP3',  'JAUNPHONE 3',            'store',       true),
            (v_org, v_bu, 'JP4',  'JAUNPHONE 4',            'store',       true),
            (v_org, v_bu, 'JPON', 'ทีมออนไลน์ส่วนกลาง',      'online_team', true)
        ON CONFLICT (organization_id, code) DO NOTHING;
    END IF;

    -- -------------------------------------------------------------- ค่าตั้ง env
    -- ตั้งที่นี่ตามกติกา M10 — หลังจากนี้ห้ามแก้ app.settings ด้วย SQL editor
    -- ต้องแก้ผ่าน api.update_setting เท่านั้น เพื่อให้มี audit SETTINGS_UPDATED
    UPDATE app.settings SET value = to_jsonb(v_env) WHERE key = 'env';

    -- prod ต้องไม่มีนาฬิกาค้าง มิฉะนั้นทุกหน้าจอจะแสดงเวลาของ seed (AL-07)
    IF v_env = 'prod' THEN
        UPDATE app.settings SET value = '{"as_of": null}'::jsonb WHERE key = 'clock';
    END IF;

    IF v_notice IS NOT NULL THEN
        UPDATE app.settings SET value = to_jsonb(v_notice) WHERE key = 'pdpa.current_notice_version';
    ELSE
        RAISE WARNING 'ยังไม่ได้ตั้ง pdpa.current_notice_version (C-13) — ต้องตั้งก่อนรับลูกค้าจริง';
    END IF;

    -- -------------------------------------------------------------- ตรวจผล
    SELECT count(*) INTO v_n FROM core.branches WHERE organization_id = v_org;
    RAISE NOTICE 'bootstrap เสร็จ · env=% · สาขา % แห่ง', v_env, v_n;
END;
$BOOT$;

-- =====================================================================================
-- ตรวจด้วยตาอีกครั้งหลังรัน — ผลสี่ชุดนี้ต้องถูกต้องก่อนไปขั้นที่ 3
-- =====================================================================================

-- 1) องค์กร · หน่วยธุรกิจ · สาขา
SELECT b.code, b.name_th, b.branch_type, b.is_active, u.code AS business_unit, o.code AS organization
  FROM core.branches b
  JOIN core.business_units u ON u.id = b.business_unit_id
  JOIN core.organizations  o ON o.id = b.organization_id
 ORDER BY b.code;

-- 2) environment และนาฬิกา — prod ต้องได้ "prod" และ {"as_of": null}
SELECT key, value FROM app.settings WHERE key IN ('env', 'clock', 'pdpa.current_notice_version') ORDER BY key;

-- 3) app.clock() ต้องเป็นเวลาปัจจุบันจริงบน prod (ไม่ใช่ 11 ก.ย. 2569)
SELECT app.clock() AS clock_now, now() AS wall_clock;

-- 4) ข้อมูลอ้างอิงต้องครบ 16 ตารางจาก migration 0003 — ไม่มีตารางไหนว่าง
SELECT c.relname AS ref_table, (SELECT count(*) FROM pg_catalog.pg_class x WHERE x.oid = c.oid) AS ok
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'ref' AND c.relkind = 'r'
 ORDER BY 1;
