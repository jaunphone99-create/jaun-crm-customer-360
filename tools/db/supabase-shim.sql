-- =====================================================================================
-- supabase-shim.sql — จำลองส่วนของ Supabase ที่ migration ของ JAUN CRM อ้างถึง
-- ใช้เฉพาะตอนทดสอบใน PGlite (tools/db/run.mjs) · ห้ามรันบน Supabase จริง (ของจริงมีอยู่แล้ว)
--
-- สิ่งที่จำลอง:
--   · role: anon · authenticated · service_role (BYPASSRLS) · supabase_auth_admin
--   · schema auth: auth.users (คอลัมน์ที่ใช้จริง) · auth.uid() · auth.jwt() · auth.role()
--   · schema test: ตัวช่วยสลับผู้ใช้และ assert สำหรับไฟล์ supabase/tests/*.sql
--
-- หมายเหตุ: ใน PGlite ผู้ใช้เริ่มต้นเป็น superuser จึงข้าม RLS ทุกกรณี
-- การทดสอบ RLS ต้องเรียก test.login_as(...) ก่อนเสมอ (สลับเป็น role authenticated)
-- =====================================================================================

CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
CREATE ROLE supabase_auth_admin NOLOGIN NOINHERIT;

-- Supabase ติดตั้ง extension ไว้ใน schema extensions (run.mjs ติดตั้ง pg_trgm ที่นี่ก่อนโหลดไฟล์นี้)
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE auth.users (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email               text UNIQUE,
    phone               text,
    email_confirmed_at  timestamptz,
    raw_app_meta_data   jsonb NOT NULL DEFAULT '{}'::jsonb,
    raw_user_meta_data  jsonb NOT NULL DEFAULT '{}'::jsonb,
    banned_until        timestamptz,
    last_sign_in_at     timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ปัจจัย MFA (ใช้ตรวจตอน api.activate_self)
CREATE TABLE auth.mfa_factors (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    factor_type  text NOT NULL DEFAULT 'totp',
    status       text NOT NULL DEFAULT 'verified',
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- ตรงกับนิยามของ Supabase (อ่านได้ทั้งรูปแบบ claim เดี่ยวและ claims แบบ jsonb)
CREATE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
    SELECT coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;

CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
$$;

CREATE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    )::text
$$;

GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid(), auth.role() TO anon, authenticated, service_role;

-- Supabase จัดการ auth.users ผ่าน Admin API ด้วยสิทธิ์ service_role
-- ในเครื่องจำลองด้วย GRANT ตรง ๆ เพื่อให้ Edge Function จำลอง (tools/db/dev-api.mjs)
-- สร้างบัญชีตอนเชิญพนักงานและ ban ตอนปิดใช้งานได้ · role อื่นยังแตะไม่ได้เหมือนเดิม
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.users TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.mfa_factors TO service_role;

-- =====================================================================================
-- schema test — ตัวช่วยสำหรับไฟล์ทดสอบ
-- ทุกไฟล์ใน supabase/tests/ ถูกครอบด้วย BEGIN … ROLLBACK โดย run.mjs
-- ห้ามเขียน BEGIN/COMMIT/ROLLBACK เองในไฟล์ทดสอบ
-- =====================================================================================

CREATE SCHEMA test;
GRANT USAGE ON SCHEMA test TO anon, authenticated, service_role;

-- สลับเป็นผู้ใช้ตาม auth.users.id · p_aal = 'aal1' | 'aal2'
CREATE FUNCTION test.login_as_uid(p_uid uuid, p_aal text DEFAULT 'aal1') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
    PERFORM set_config('role', 'authenticated', true);
END;
$$;

-- สลับเป็นผู้ใช้ตามอีเมล (seed ใช้อีเมลตาม CANONICAL ข้อ 13.5)
CREATE FUNCTION test.login_as(p_email text, p_aal text DEFAULT 'aal1') RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_uid uuid;
BEGIN
    PERFORM set_config('role', 'none', true);
    SELECT id INTO v_uid FROM auth.users WHERE email = p_email;
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'test.login_as: ไม่พบผู้ใช้ %', p_email;
    END IF;
    PERFORM test.login_as_uid(v_uid, p_aal);
END;
$$;

-- ผู้ใช้ที่ไม่ได้เข้าสู่ระบบ
CREATE FUNCTION test.login_anon() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    PERFORM set_config('role', 'anon', true);
END;
$$;

-- กลับเป็น superuser ของ PGlite (ใช้เตรียมข้อมูลกลางไฟล์ทดสอบ)
CREATE FUNCTION test.logout() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

CREATE FUNCTION test.assert_true(p_cond boolean, p_msg text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF p_cond IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'ASSERT FAILED: %', p_msg;
    END IF;
    RAISE NOTICE 'ok: %', p_msg;
END;
$$;

CREATE FUNCTION test.assert_eq(p_actual anyelement, p_expected anyelement, p_msg text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF p_actual IS DISTINCT FROM p_expected THEN
        RAISE EXCEPTION 'ASSERT FAILED: % — ได้ % แต่คาดว่า %', p_msg, p_actual, p_expected;
    END IF;
    RAISE NOTICE 'ok: % (= %)', p_msg, p_actual;
END;
$$;

-- p_sql ต้องล้มเหลว · ถ้าให้ p_sqlstate จะตรวจรหัสข้อผิดพลาดด้วย (เช่น '42501' = insufficient_privilege)
CREATE FUNCTION test.assert_raises(p_sql text, p_msg text, p_sqlstate text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_state text;
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        v_state := SQLSTATE;
        IF p_sqlstate IS NOT NULL AND v_state <> p_sqlstate THEN
            RAISE EXCEPTION 'ASSERT FAILED: % — ล้มเหลวด้วย % (%), คาดว่า %', p_msg, v_state, SQLERRM, p_sqlstate;
        END IF;
        RAISE NOTICE 'ok: % (ถูกปฏิเสธ % %)', p_msg, v_state, SQLERRM;
        RETURN;
    END;
    RAISE EXCEPTION 'ASSERT FAILED: % — คำสั่งสำเร็จทั้งที่ควรถูกปฏิเสธ: %', p_msg, p_sql;
END;
$$;

-- จำนวนแถวที่ผู้ใช้ปัจจุบันมองเห็นจากคำสั่ง SELECT
CREATE FUNCTION test.count_rows(p_sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE v bigint;
BEGIN
    EXECUTE format('SELECT count(*) FROM (%s) q', p_sql) INTO v;
    RETURN v;
END;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA test TO anon, authenticated, service_role;
