-- =====================================================================================
-- 0010_security.sql — สิทธิ์ · RLS · trigger ตรวจการเปลี่ยนแปลง (JAUN CRM · Customer 360)
--
-- แหล่งจริง: docs/04-security/rls-spec.md (CANONICAL ข้อ 19.2) · บล็อก A–M ตามข้อ 3–7.6 ของเอกสารนั้น
-- CANONICAL ที่บังคับไฟล์นี้: ข้อ 1.1 (schema · GRANT) · 8.0 (ขอบเขต) · 8.1 (ตารางสิทธิ์) · 8.3 (ตารางย่อย) ·
--   9.3 (helper) · 9.4 (รูปแบบ RLS) · 9.4.1 (KPI ผ่าน RPC) · 9.4.2 (สิทธิ์ที่ขึ้นกับการเปลี่ยนแปลง) ·
--   19.1 ข้อ 2 · 19.1 ข้อ 13 · 19.2 ทุกข้อ
-- ต่อจาก migration 0001–0009 · ทดสอบด้วย supabase/tests/rls_01_catalog.sql … rls_09_links_and_writes.sql
--   (`node tools/db/run.mjs --test --quiet` · ทำงานได้ทั้งมีและไม่มี supabase/seed.sql)
--
-- ลำดับในไฟล์ (ห้ามสลับ · บล็อกหลังพึ่งบล็อกหน้า):
--   A  ส่วนต่างของ schema ตาม v2.2 (คอลัมน์ unrecorded_ack_* · request_type · CHECK ของ export_requests) และเปลี่ยนชื่อ BEFORE trigger ของ 0009
--   B  GRANT ระดับ schema + ล้างสิทธิ์ตาราง/ลำดับ/ฟังก์ชันทั้งหมด (anon ไม่ได้อะไรเลย · service_role ได้เฉพาะ USAGE)
--   C  helper ตรวจสิทธิ์ 13 ตัว (+ ภายใน 2 ตัว) · ทุกตัว SECURITY DEFINER · STABLE · SET search_path = ''
--   D  DEFAULT organization_id / created_by / updated_by
--   E–H  GRANT ระดับตาราง/คอลัมน์ + policy ของ crm ทุกตาราง
--   I  core · J  ref 16 ตาราง
--   K  app.trg_stamp_row + trigger trg_90_stamp_row (34 ตาราง)
--   L  app.transition_denied + app.enforce_row_transition (BEFORE INSERT/UPDATE · 7 ตาราง · SECURITY INVOKER)
--   M  guard ของ core.staff_role_assignments · core.staff_profiles · core.role_grant_requests · audit.export_requests
--
-- ลำดับ BEFORE trigger ต่อแถว (ข้อ 9.4.2 · PostgreSQL เรียกตามลำดับอักษรของชื่อ trigger):
--   trg_05_running_number → trg_10_enforce_transition → trg_12_guard_export_request / trg_15_guard_core_row
--   → trg_20_guard_text → trg_30_row_defaults → trg_90_stamp_row → trg_touch_updated_at
--
-- สิ่งที่ไฟล์นี้ไม่ทำ: RPC ใน schema api (ข้อ 9.6 · migration ถัดไป ตามสัญญาในข้อ 8 ของ rls-spec) ·
--   policy บน storage.objects (bucket `exports` ไม่มี policy ให้ authenticated · ข้อ 9.8) · งาน pg_cron (*_cron.sql)
--
-- หมายเหตุผู้เขียน (ส่วนที่เพิ่มจาก rls-spec ฉบับ 16 ก.ย. 2569 · ดู canonical_issues ของรายงานงานนี้):
--   1. รหัส JCRM-T26 + เงื่อนไข V-8 (crm.visits) และ IN-4 (crm.interactions) ในบล็อก L:
--      ตั้ง/เปลี่ยน customer_id ของ visit/interaction ได้เฉพาะเมื่อ "ลูกค้าเชื่อมกับสาขาของแถวอยู่แล้ว"
--      (customer_branches หรือ customers.first_branch_id) หรือผู้ใช้มีสิทธิ์นั้นที่ scope ORGANIZATION —
--      มิฉะนั้นต้องผูกสาขาผ่าน api.link_customer_to_branch (CANONICAL ข้อ 6.6 · 8.0 "กันการผูกลูกค้าข้ามสาขา
--      โดยไม่ผ่าน api.link_customer_to_branch" · 19.3 ข้อ 4) · ถ้าไม่มีเงื่อนไขนี้ ผู้ที่มีหลายการมอบบทบาท
--      (เช่น BRANCH_MANAGER@สาขา1 + STAFF@สาขา2 ข้อ 13.13) สร้างรายการนิรนามที่สาขา 2 แล้ว UPDATE customer_id
--      เป็นลูกค้าของสาขา 1 ได้ → ลูกค้าถูกผูกเข้าสาขา 2 และพนักงานสาขา 2 ทุกคนเห็น = ยุบ scope ข้ามสาขา (ข้อ 8.0)
--   2. ไม่มีส่วนอื่นที่ต่างจาก rls-spec · ข้อความ SQL ของบล็อก A–M ที่เหลือคัดลอกตรงตัว
-- =====================================================================================


-- =====================================================================================
-- บล็อก A — ข้อ 3 · ส่วนต่างของ schema ตาม v2.2 และชื่อ trigger
-- =====================================================================================

-- A. ส่วนต่างของ schema ตาม CANONICAL v2.2 (เขียนแบบรันซ้ำได้) · ข้อ 6.10 · 4.8 · 8.2 · 9.4.2
ALTER TABLE crm.visits ADD COLUMN IF NOT EXISTS unrecorded_ack_by uuid REFERENCES core.staff_profiles (id);
ALTER TABLE crm.visits ADD COLUMN IF NOT EXISTS unrecorded_ack_at timestamptz;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visits_unrecorded_ack_chk' AND conrelid = 'crm.visits'::regclass) THEN
        ALTER TABLE crm.visits ADD CONSTRAINT visits_unrecorded_ack_chk
            CHECK ((unrecorded_ack_by IS NULL) = (unrecorded_ack_at IS NULL)
                   AND (unrecorded_ack_by IS NULL OR outcome_code = 'UNRECORDED'));
    END IF;
END $$;
ALTER TABLE core.role_grant_requests ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'GRANT';
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_grant_requests_type_chk' AND conrelid = 'core.role_grant_requests'::regclass) THEN
        ALTER TABLE core.role_grant_requests ADD CONSTRAINT role_grant_requests_type_chk CHECK (request_type IN ('GRANT', 'REVOKE'));
    END IF;
END $$;
ALTER TABLE audit.export_requests DROP CONSTRAINT IF EXISTS export_requests_decided_chk;
ALTER TABLE audit.export_requests ADD CONSTRAINT export_requests_decided_chk
    CHECK ((approved_by IS NULL OR decided_at IS NOT NULL)
           AND (status <> 'APPROVED' OR approved_by IS NOT NULL OR requested_as_role = 'BRANCH_MANAGER')
           AND (status <> 'REJECTED' OR decided_at IS NOT NULL));

-- ชื่อ BEFORE trigger ตามลำดับข้อ 9.4.2 (PostgreSQL เรียกตามลำดับอักษรของชื่อ)
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT t.tgname, c.oid::regclass AS tbl FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
             WHERE NOT t.tgisinternal AND t.tgname IN ('trg_assign_running_number', 'trg_guard_restricted_text', 'trg_row_defaults')
    LOOP
        EXECUTE format('ALTER TRIGGER %I ON %s RENAME TO %I', r.tgname, r.tbl,
            CASE r.tgname WHEN 'trg_assign_running_number' THEN 'trg_05_running_number'
                          WHEN 'trg_guard_restricted_text' THEN 'trg_20_guard_text'
                          ELSE 'trg_30_row_defaults' END);
    END LOOP;
END $$;

-- =====================================================================================
-- บล็อก B — ข้อ 4.1 · GRANT ระดับ schema และการล้างสิทธิ์เดิม
-- =====================================================================================

-- B. GRANT ระดับ schema · ล้างสิทธิ์ตาราง/ฟังก์ชันทั้งหมดก่อนให้ใหม่ (ข้อ 1.1 · 19.1 ข้อ 2)
REVOKE ALL ON SCHEMA api, app, crm, core, ref, analytics, audit, restricted FROM PUBLIC;
GRANT USAGE ON SCHEMA api, crm, core, ref TO authenticated, service_role;
GRANT USAGE ON SCHEMA app TO authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA api, app, crm, core, ref, analytics, audit, restricted FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA api, app, crm, core, ref, analytics, audit, restricted FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA api, app, crm, core, ref, analytics, audit, restricted FROM PUBLIC, anon, authenticated, service_role;

-- =====================================================================================
-- บล็อก C — ข้อ 4.2 · helper ตรวจสิทธิ์ (CANONICAL ข้อ 9.3)
-- =====================================================================================

-- C. helper ตรวจสิทธิ์ (ข้อ 9.3) · ทุกตัว SECURITY DEFINER · STABLE · search_path = ''
CREATE OR REPLACE FUNCTION app.current_staff_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT s.id FROM core.staff_profiles s WHERE s.user_id = auth.uid() AND s.status = 'ACTIVE'
$$;

CREATE FUNCTION app.is_aal2() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;

CREATE FUNCTION app.current_organization_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT s.organization_id FROM core.staff_profiles s WHERE s.id = app.current_staff_id()
$$;

CREATE FUNCTION app.effective_assignments()
RETURNS TABLE (assignment_id uuid, role_code text, branch_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT a.id, a.role_code, a.branch_id
    FROM core.staff_role_assignments a
    JOIN core.roles r ON r.code = a.role_code
    WHERE a.staff_id = app.current_staff_id()
      AND a.valid_from <= now()
      AND (a.valid_to IS NULL OR now() < a.valid_to)
      AND (NOT r.requires_mfa OR app.is_aal2())
      AND r.is_branch_role = (a.branch_id IS NOT NULL)
      AND (a.role_code <> 'SUPERVISOR' OR EXISTS (
            SELECT 1
            FROM core.team_members tm
            JOIN core.teams t ON t.id = tm.team_id
            WHERE tm.staff_id = a.staff_id
              AND tm.is_leader
              AND t.branch_id = a.branch_id
              AND tm.valid_from <= now()
              AND (tm.valid_to IS NULL OR now() < tm.valid_to)))
$$;

CREATE FUNCTION app.effective_grants(p_permission text)
RETURNS TABLE (branch_id uuid, scope core.data_scope, role_code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    WITH g AS (
        SELECT ea.branch_id, rp.scope, ea.role_code
        FROM app.effective_assignments() ea
        JOIN core.role_permissions rp ON rp.role_code = ea.role_code AND rp.permission_code = p_permission
        WHERE NOT rp.requires_aal2 OR app.is_aal2()
    )
    SELECT g.branch_id, g.scope, g.role_code FROM g
    WHERE g.scope IN ('OWN', 'TEAM', 'BRANCH') AND g.branch_id IS NOT NULL
    UNION ALL
    SELECT b.id, g.scope, g.role_code FROM g
    JOIN core.branches b ON b.organization_id = app.current_organization_id()
    WHERE g.scope = 'ORGANIZATION'
$$;

CREATE FUNCTION app.has_permission(p_permission text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT EXISTS (
        SELECT 1
        FROM app.effective_assignments() ea
        JOIN core.role_permissions rp ON rp.role_code = ea.role_code AND rp.permission_code = p_permission
        WHERE NOT rp.requires_aal2 OR app.is_aal2())
$$;

CREATE FUNCTION app.scope_branch_ids(p_permission text, p_min_scope core.data_scope) RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT coalesce(array_agg(DISTINCT g.branch_id ORDER BY g.branch_id), '{}'::uuid[])
    FROM app.effective_grants(p_permission) g
    WHERE p_min_scope <> 'SYSTEM' AND g.scope <> 'SYSTEM' AND g.scope >= p_min_scope
$$;

CREATE FUNCTION app.team_scope_pairs(p_permission text)
RETURNS TABLE (branch_id uuid, staff_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT DISTINCT t.branch_id, m.staff_id
    FROM app.effective_grants(p_permission) g
    JOIN core.teams t        ON t.branch_id = g.branch_id
    JOIN core.team_members l ON l.team_id = t.id
                            AND l.staff_id = app.current_staff_id()
                            AND l.is_leader
                            AND l.valid_from <= now() AND (l.valid_to IS NULL OR now() < l.valid_to)
    JOIN core.team_members m ON m.team_id = t.id
                            AND m.valid_from <= now() AND (m.valid_to IS NULL OR now() < m.valid_to)
    WHERE g.scope = 'TEAM'
$$;

CREATE FUNCTION app.team_member_staff_ids(p_permission text) RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT coalesce(array_agg(DISTINCT p.staff_id ORDER BY p.staff_id), '{}'::uuid[])
    FROM app.team_scope_pairs(p_permission) p
$$;

CREATE FUNCTION app.customer_ids_in_scope(p_permission text) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    WITH g AS (SELECT * FROM app.effective_grants(p_permission)),
    links AS (
        SELECT cb.customer_id, cb.branch_id FROM crm.customer_branches cb
        WHERE cb.branch_id IN (SELECT g.branch_id FROM g)
        UNION
        SELECT c.id, c.first_branch_id FROM crm.customers c
        WHERE c.first_branch_id IN (SELECT g.branch_id FROM g)
    )
    SELECT c.id FROM crm.customers c
    WHERE c.organization_id = app.current_organization_id()
      AND EXISTS (SELECT 1 FROM g WHERE g.scope = 'ORGANIZATION')
    UNION
    SELECT l.customer_id FROM links l
    JOIN g ON g.branch_id = l.branch_id AND g.scope = 'BRANCH'
    UNION
    SELECT l.customer_id FROM links l
    JOIN crm.customers c ON c.id = l.customer_id
    JOIN app.team_scope_pairs(p_permission) tp ON tp.branch_id = l.branch_id AND tp.staff_id = c.owner_staff_id
    UNION
    SELECT l.customer_id FROM links l
    JOIN crm.customers c ON c.id = l.customer_id AND c.owner_staff_id = app.current_staff_id()
$$;

CREATE FUNCTION app.readable_customer_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT x FROM app.customer_ids_in_scope('customer.read') AS x
$$;

CREATE FUNCTION app.can_access_record(p_permission text, p_branch_id uuid, p_owner_staff_id uuid, p_created_by uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT p_branch_id IS NOT NULL AND (
           p_branch_id = ANY (app.scope_branch_ids(p_permission, 'BRANCH'))
        OR (p_owner_staff_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM app.team_scope_pairs(p_permission) tp
               WHERE tp.branch_id = p_branch_id AND tp.staff_id = p_owner_staff_id))
        OR (p_owner_staff_id IS NULL AND p_permission IN ('lead.assign', 'task.assign') AND EXISTS (
               SELECT 1 FROM app.team_scope_pairs(p_permission) tp WHERE tp.branch_id = p_branch_id))
        OR (p_branch_id = ANY (app.scope_branch_ids(p_permission, 'OWN'))
            AND coalesce(p_owner_staff_id, p_created_by) = app.current_staff_id()))
$$;

CREATE FUNCTION app.can_access_customer(p_permission text, p_customer_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    WITH g AS (SELECT * FROM app.effective_grants(p_permission)),
    c AS (SELECT x.id, x.organization_id, x.owner_staff_id, x.first_branch_id FROM crm.customers x WHERE x.id = p_customer_id),
    links AS (
        SELECT cb.branch_id FROM crm.customer_branches cb WHERE cb.customer_id = p_customer_id
        UNION
        SELECT c.first_branch_id FROM c WHERE c.first_branch_id IS NOT NULL
    )
    SELECT EXISTS (SELECT 1 FROM c WHERE c.organization_id = app.current_organization_id()
                                     AND EXISTS (SELECT 1 FROM g WHERE g.scope = 'ORGANIZATION'))
        OR EXISTS (SELECT 1 FROM links l JOIN g ON g.branch_id = l.branch_id AND g.scope = 'BRANCH')
        OR EXISTS (SELECT 1 FROM links l CROSS JOIN c
                   JOIN app.team_scope_pairs(p_permission) tp ON tp.branch_id = l.branch_id AND tp.staff_id = c.owner_staff_id)
        OR EXISTS (SELECT 1 FROM links l JOIN g ON g.branch_id = l.branch_id CROSS JOIN c
                   WHERE c.owner_staff_id = app.current_staff_id())
$$;

CREATE FUNCTION app.staff_has_branch_assignment(p_staff_id uuid, p_branch_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT EXISTS (
        SELECT 1
        FROM core.staff_role_assignments a
        JOIN core.staff_profiles s ON s.id = a.staff_id
        WHERE a.staff_id = p_staff_id
          AND a.branch_id = p_branch_id
          AND s.status = 'ACTIVE'
          AND a.valid_from <= now()
          AND (a.valid_to IS NULL OR now() < a.valid_to))
$$;

GRANT EXECUTE ON FUNCTION
    app.current_staff_id(), app.is_aal2(), app.clock(), app.current_organization_id(),
    app.has_permission(text), app.scope_branch_ids(text, core.data_scope),
    app.team_scope_pairs(text), app.team_member_staff_ids(text),
    app.customer_ids_in_scope(text), app.readable_customer_ids(),
    app.can_access_record(text, uuid, uuid, uuid), app.can_access_customer(text, uuid),
    app.staff_has_branch_assignment(uuid, uuid),
    app.bangkok_date(timestamptz)
TO authenticated;

-- =====================================================================================
-- บล็อก D — ข้อ 6.2 · DEFAULT ของ organization_id created_by updated_by
-- =====================================================================================

-- D. DEFAULT ของ organization_id created_by updated_by (ข้อ 9.3 · 19.2 ข้อ 1)
DO $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT c.oid::regclass AS tbl
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('crm', 'core', 'audit') AND c.relkind = 'r'
          AND (SELECT count(*) FROM pg_attribute a
               WHERE a.attrelid = c.oid AND NOT a.attisdropped
                 AND a.attname IN ('organization_id', 'created_by', 'updated_by')) = 3
        ORDER BY 1
    LOOP
        EXECUTE format('ALTER TABLE %s ALTER COLUMN organization_id SET DEFAULT app.current_organization_id(), '
                       'ALTER COLUMN created_by SET DEFAULT app.current_staff_id(), '
                       'ALTER COLUMN updated_by SET DEFAULT app.current_staff_id()', r.tbl);
    END LOOP;
END $$;

-- =====================================================================================
-- บล็อก E — ข้อ 6.3 · crm — ลูกค้าและตารางย่อย
-- =====================================================================================

-- E. crm: ลูกค้าและตารางย่อย (ข้อ 6.3–6.9 · 8.3 · 10.2 · 10.4)
GRANT SELECT ON crm.customers TO authenticated;
GRANT UPDATE (first_name, last_name, nickname, customer_type, province_code) ON crm.customers TO authenticated;
CREATE POLICY customers_select ON crm.customers FOR SELECT TO authenticated
    USING (id IN (SELECT app.readable_customer_ids()));
CREATE POLICY customers_update ON crm.customers FOR UPDATE TO authenticated
    USING (id IN (SELECT app.customer_ids_in_scope('customer.update')))
    WITH CHECK (id IN (SELECT app.customer_ids_in_scope('customer.update')));

GRANT SELECT (id, organization_id, customer_id, contact_type, value_masked, is_primary, is_valid, is_active, verified_at, created_at, updated_at)
    ON crm.customer_contacts TO authenticated;
CREATE POLICY customer_contacts_select ON crm.customer_contacts FOR SELECT TO authenticated
    USING (customer_id IN (SELECT app.readable_customer_ids()));

GRANT SELECT (id, organization_id, customer_id, district, province_code, value_masked, is_primary, is_active, created_at, updated_at)
    ON crm.customer_addresses TO authenticated;
CREATE POLICY customer_addresses_select ON crm.customer_addresses FOR SELECT TO authenticated
    USING (customer_id IN (SELECT app.readable_customer_ids()));

GRANT SELECT ON crm.customer_branches TO authenticated;
CREATE POLICY customer_branches_select ON crm.customer_branches FOR SELECT TO authenticated
    USING (customer_id IN (SELECT app.readable_customer_ids()));

GRANT SELECT ON crm.customer_notes TO authenticated;
GRANT INSERT (customer_id, interaction_id, branch_id, body, is_pinned) ON crm.customer_notes TO authenticated;
GRANT UPDATE (body, is_pinned) ON crm.customer_notes TO authenticated;
CREATE POLICY customer_notes_select ON crm.customer_notes FOR SELECT TO authenticated
    USING (customer_id IN (SELECT app.readable_customer_ids()));
CREATE POLICY customer_notes_insert ON crm.customer_notes FOR INSERT TO authenticated
WITH CHECK (
        customer_notes.customer_id IN (SELECT app.readable_customer_ids())
    AND (   customer_notes.branch_id = ANY ((SELECT app.scope_branch_ids('note.create', 'ORGANIZATION'))::uuid[])
         OR (    (   EXISTS (SELECT 1 FROM crm.customer_branches cb
                             WHERE cb.customer_id = customer_notes.customer_id AND cb.branch_id = customer_notes.branch_id)
                  OR EXISTS (SELECT 1 FROM crm.customers c
                             WHERE c.id = customer_notes.customer_id AND c.first_branch_id = customer_notes.branch_id))
             AND (   customer_notes.branch_id = ANY ((SELECT app.scope_branch_ids('note.create', 'BRANCH'))::uuid[])
                  OR (customer_notes.branch_id, (SELECT c.owner_staff_id FROM crm.customers c WHERE c.id = customer_notes.customer_id))
                       IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('note.create') tp)
                  OR (    customer_notes.branch_id = ANY ((SELECT app.scope_branch_ids('note.create', 'OWN'))::uuid[])
                      AND (SELECT c.owner_staff_id FROM crm.customers c WHERE c.id = customer_notes.customer_id)
                          = (SELECT app.current_staff_id())))))
    AND (customer_notes.interaction_id IS NULL
         OR customer_notes.interaction_id IN (SELECT i.id FROM crm.interactions i WHERE i.customer_id = customer_notes.customer_id))
);
CREATE POLICY customer_notes_update ON crm.customer_notes FOR UPDATE TO authenticated
USING (
        customer_notes.created_at > now() - interval '24 hours'
    AND (   customer_notes.branch_id = ANY ((SELECT app.scope_branch_ids('note.update', 'BRANCH'))::uuid[])
         OR (    customer_notes.branch_id = ANY ((SELECT app.scope_branch_ids('note.update', 'OWN'))::uuid[])
             AND customer_notes.created_by = (SELECT app.current_staff_id())))
)
WITH CHECK (
        customer_notes.customer_id IN (SELECT app.readable_customer_ids())
    AND (   customer_notes.branch_id = ANY ((SELECT app.scope_branch_ids('note.update', 'BRANCH'))::uuid[])
         OR (    customer_notes.branch_id = ANY ((SELECT app.scope_branch_ids('note.update', 'OWN'))::uuid[])
             AND customer_notes.created_by = (SELECT app.current_staff_id())))
);

GRANT SELECT ON crm.tags TO authenticated;
GRANT INSERT (code, label_th, is_active) ON crm.tags TO authenticated;
GRANT UPDATE (label_th, is_active) ON crm.tags TO authenticated;
CREATE POLICY tags_select ON crm.tags FOR SELECT TO authenticated
    USING (organization_id = (SELECT app.current_organization_id())
           AND (is_active OR (SELECT app.has_permission('tag.manage'))));
CREATE POLICY tags_insert ON crm.tags FOR INSERT TO authenticated
    WITH CHECK (organization_id = (SELECT app.current_organization_id()) AND (SELECT app.has_permission('tag.manage')));
CREATE POLICY tags_update ON crm.tags FOR UPDATE TO authenticated
    USING (organization_id = (SELECT app.current_organization_id()) AND (SELECT app.has_permission('tag.manage')))
    WITH CHECK (organization_id = (SELECT app.current_organization_id()) AND (SELECT app.has_permission('tag.manage')));

GRANT SELECT ON crm.customer_tags TO authenticated;
GRANT INSERT (customer_id, tag_id) ON crm.customer_tags TO authenticated;
GRANT DELETE ON crm.customer_tags TO authenticated;
CREATE POLICY customer_tags_select ON crm.customer_tags FOR SELECT TO authenticated
    USING (customer_id IN (SELECT app.readable_customer_ids()));
CREATE POLICY customer_tags_insert ON crm.customer_tags FOR INSERT TO authenticated
    WITH CHECK (customer_id IN (SELECT app.customer_ids_in_scope('customer.update'))
                AND tag_id IN (SELECT t.id FROM crm.tags t WHERE t.is_active AND t.organization_id = (SELECT app.current_organization_id())));
CREATE POLICY customer_tags_delete ON crm.customer_tags FOR DELETE TO authenticated
    USING (customer_id IN (SELECT app.customer_ids_in_scope('customer.update')));

GRANT SELECT ON crm.customer_consents, crm.customer_consent_current TO authenticated;
CREATE POLICY customer_consents_select ON crm.customer_consents FOR SELECT TO authenticated
    USING (customer_id IN (SELECT app.readable_customer_ids()));

GRANT SELECT ON crm.duplicate_decisions TO authenticated;
CREATE POLICY duplicate_decisions_select ON crm.duplicate_decisions FOR SELECT TO authenticated
    USING (customer_id IN (SELECT app.customer_ids_in_scope('data_quality.view'))
           AND candidate_customer_id IN (SELECT app.customer_ids_in_scope('data_quality.view')));

GRANT SELECT ON crm.customer_merges TO authenticated;
CREATE POLICY customer_merges_select ON crm.customer_merges FOR SELECT TO authenticated
    USING (survivor_customer_id IN (SELECT app.readable_customer_ids())
           OR merged_customer_id IN (SELECT app.readable_customer_ids()));

GRANT SELECT ON crm.data_subject_requests TO authenticated;
CREATE POLICY data_subject_requests_select ON crm.data_subject_requests FOR SELECT TO authenticated
    USING (organization_id = (SELECT app.current_organization_id())
           AND ((SELECT app.has_permission('dsr.manage')) OR received_by = (SELECT app.current_staff_id())));

-- =====================================================================================
-- บล็อก F — ข้อ 6.4 · crm — visits · interactions · transaction_refs
-- =====================================================================================

-- F. crm: visits · interactions · transaction_refs (ข้อ 3.3 · 4.1 · 5.7 · 9.4)
GRANT SELECT ON crm.visits TO authenticated;
GRANT UPDATE (status, owner_staff_id, party_size, customer_id, interest_code, source_code, cancel_reason) ON crm.visits TO authenticated;
CREATE POLICY visits_select ON crm.visits FOR SELECT TO authenticated
USING (
       visits.branch_id = ANY ((SELECT app.scope_branch_ids('visit.read', 'BRANCH'))::uuid[])
    OR (visits.branch_id, visits.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('visit.read') tp)
    OR (    visits.branch_id = ANY ((SELECT app.scope_branch_ids('visit.read', 'OWN'))::uuid[])
        AND coalesce(visits.owner_staff_id, visits.created_by) = (SELECT app.current_staff_id()))
    OR visits.customer_id IN (SELECT app.readable_customer_ids())
);
CREATE POLICY visits_update ON crm.visits FOR UPDATE TO authenticated
USING (
       visits.branch_id = ANY ((SELECT app.scope_branch_ids('visit.update', 'BRANCH'))::uuid[])
    OR (visits.branch_id, visits.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('visit.update') tp)
    OR (    visits.branch_id = ANY ((SELECT app.scope_branch_ids('visit.update', 'OWN'))::uuid[])
        AND coalesce(visits.owner_staff_id, visits.created_by) = (SELECT app.current_staff_id()))
    OR (    visits.status = 'WAITING' AND visits.owner_staff_id IS NULL
        AND visits.branch_id = ANY ((SELECT app.scope_branch_ids('visit.update', 'OWN'))::uuid[]))
)
WITH CHECK (
    (      visits.branch_id = ANY ((SELECT app.scope_branch_ids('visit.update', 'BRANCH'))::uuid[])
        OR (visits.branch_id, visits.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('visit.update') tp)
        OR (    visits.branch_id = ANY ((SELECT app.scope_branch_ids('visit.update', 'OWN'))::uuid[])
            AND coalesce(visits.owner_staff_id, visits.created_by) = (SELECT app.current_staff_id())))
    AND (visits.customer_id IS NULL OR visits.customer_id IN (SELECT app.readable_customer_ids()))
);

GRANT SELECT ON crm.interactions TO authenticated;
GRANT INSERT (customer_id, visit_id, lead_id, opportunity_id, branch_id, channel_code, direction, interaction_type_code, occurred_at, owner_staff_id, summary)
    ON crm.interactions TO authenticated;
GRANT UPDATE (customer_id, interaction_type_code, occurred_at, summary) ON crm.interactions TO authenticated;
CREATE POLICY interactions_select ON crm.interactions FOR SELECT TO authenticated
USING (
       interactions.branch_id = ANY ((SELECT app.scope_branch_ids('interaction.read', 'BRANCH'))::uuid[])
    OR (interactions.branch_id, interactions.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('interaction.read') tp)
    OR (    interactions.branch_id = ANY ((SELECT app.scope_branch_ids('interaction.read', 'OWN'))::uuid[])
        AND coalesce(interactions.owner_staff_id, interactions.created_by) = (SELECT app.current_staff_id()))
    OR interactions.customer_id IN (SELECT app.readable_customer_ids())
);
CREATE POLICY interactions_insert ON crm.interactions FOR INSERT TO authenticated
WITH CHECK (
    (   (    interactions.customer_id IS NULL
         AND (   interactions.branch_id = ANY ((SELECT app.scope_branch_ids('interaction.create', 'BRANCH'))::uuid[])
              OR (interactions.branch_id, interactions.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('interaction.create') tp)
              OR (    interactions.branch_id = ANY ((SELECT app.scope_branch_ids('interaction.create', 'OWN'))::uuid[])
                  AND coalesce(interactions.owner_staff_id, interactions.created_by) = (SELECT app.current_staff_id()))))
     OR (    interactions.customer_id IN (SELECT app.readable_customer_ids())
         AND (   interactions.branch_id = ANY ((SELECT app.scope_branch_ids('interaction.create', 'ORGANIZATION'))::uuid[])
              OR (    (   EXISTS (SELECT 1 FROM crm.customer_branches cb
                                  WHERE cb.customer_id = interactions.customer_id AND cb.branch_id = interactions.branch_id)
                       OR EXISTS (SELECT 1 FROM crm.customers c
                                  WHERE c.id = interactions.customer_id AND c.first_branch_id = interactions.branch_id))
                  AND (   interactions.branch_id = ANY ((SELECT app.scope_branch_ids('interaction.create', 'BRANCH'))::uuid[])
                       OR (interactions.branch_id, (SELECT c.owner_staff_id FROM crm.customers c WHERE c.id = interactions.customer_id))
                            IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('interaction.create') tp)
                       OR (    interactions.branch_id = ANY ((SELECT app.scope_branch_ids('interaction.create', 'OWN'))::uuid[])
                           AND (SELECT c.owner_staff_id FROM crm.customers c WHERE c.id = interactions.customer_id)
                               = (SELECT app.current_staff_id())))))))
    AND (interactions.direction <> 'INBOUND' OR interactions.visit_id IN (
            SELECT v.id FROM crm.visits v
            WHERE v.branch_id = interactions.branch_id AND v.status IN ('WAITING', 'IN_SERVICE')))
    AND (interactions.visit_id IS NULL OR interactions.visit_id IN (
            SELECT v.id FROM crm.visits v
            WHERE v.branch_id = interactions.branch_id AND v.customer_id IS NOT DISTINCT FROM interactions.customer_id))
    AND (interactions.lead_id IS NULL OR interactions.lead_id IN (
            SELECT l.id FROM crm.leads l WHERE l.customer_id = interactions.customer_id))
    AND (interactions.opportunity_id IS NULL OR interactions.opportunity_id IN (
            SELECT o.id FROM crm.opportunities o WHERE o.customer_id = interactions.customer_id))
);
CREATE POLICY interactions_update ON crm.interactions FOR UPDATE TO authenticated
USING (
       interactions.branch_id = ANY ((SELECT app.scope_branch_ids('interaction.update', 'BRANCH'))::uuid[])
    OR (interactions.branch_id, interactions.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('interaction.update') tp)
    OR (    interactions.branch_id = ANY ((SELECT app.scope_branch_ids('interaction.update', 'OWN'))::uuid[])
        AND coalesce(interactions.owner_staff_id, interactions.created_by) = (SELECT app.current_staff_id()))
)
WITH CHECK (
    (      interactions.branch_id = ANY ((SELECT app.scope_branch_ids('interaction.update', 'BRANCH'))::uuid[])
        OR (interactions.branch_id, interactions.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('interaction.update') tp)
        OR (    interactions.branch_id = ANY ((SELECT app.scope_branch_ids('interaction.update', 'OWN'))::uuid[])
            AND coalesce(interactions.owner_staff_id, interactions.created_by) = (SELECT app.current_staff_id())))
    AND (interactions.customer_id IS NULL OR interactions.customer_id IN (SELECT app.readable_customer_ids()))
);

GRANT SELECT ON crm.transaction_refs TO authenticated;
GRANT INSERT (customer_id, branch_id, opportunity_id, transaction_type_code, source_system_code, external_no, transacted_at, amount, device_imei, device_serial, summary)
    ON crm.transaction_refs TO authenticated;
CREATE POLICY transaction_refs_select ON crm.transaction_refs FOR SELECT TO authenticated
USING (
       transaction_refs.branch_id = ANY ((SELECT app.scope_branch_ids('transaction.read', 'BRANCH'))::uuid[])
    OR (    transaction_refs.branch_id = ANY ((SELECT app.scope_branch_ids('transaction.read', 'OWN'))::uuid[])
        AND transaction_refs.created_by = (SELECT app.current_staff_id()))
    OR transaction_refs.customer_id IN (SELECT app.readable_customer_ids())
);
CREATE POLICY transaction_refs_insert ON crm.transaction_refs FOR INSERT TO authenticated
WITH CHECK (
        transaction_refs.source_system_code = 'MANUAL'
    AND transaction_refs.customer_id IN (SELECT app.readable_customer_ids())
    AND (   (    transaction_refs.opportunity_id IS NOT NULL
             AND transaction_refs.opportunity_id IN (
                   SELECT x.id FROM crm.opportunities x
                   WHERE x.branch_id = transaction_refs.branch_id
                     AND x.customer_id = transaction_refs.customer_id
                     AND (   x.branch_id = ANY ((SELECT app.scope_branch_ids('transaction.link', 'BRANCH'))::uuid[])
                          OR (x.branch_id, x.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('transaction.link') tp)
                          OR (    x.branch_id = ANY ((SELECT app.scope_branch_ids('transaction.link', 'OWN'))::uuid[])
                              AND coalesce(x.owner_staff_id, x.created_by) = (SELECT app.current_staff_id())))))
         OR (    transaction_refs.opportunity_id IS NULL
             AND (   transaction_refs.branch_id = ANY ((SELECT app.scope_branch_ids('transaction.link', 'ORGANIZATION'))::uuid[])
                  OR (    (   EXISTS (SELECT 1 FROM crm.customer_branches cb
                                      WHERE cb.customer_id = transaction_refs.customer_id AND cb.branch_id = transaction_refs.branch_id)
                           OR EXISTS (SELECT 1 FROM crm.customers c
                                      WHERE c.id = transaction_refs.customer_id AND c.first_branch_id = transaction_refs.branch_id))
                      AND (   transaction_refs.branch_id = ANY ((SELECT app.scope_branch_ids('transaction.link', 'BRANCH'))::uuid[])
                           OR (transaction_refs.branch_id, (SELECT c.owner_staff_id FROM crm.customers c WHERE c.id = transaction_refs.customer_id))
                                IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('transaction.link') tp)
                           OR (    transaction_refs.branch_id = ANY ((SELECT app.scope_branch_ids('transaction.link', 'OWN'))::uuid[])
                               AND (SELECT c.owner_staff_id FROM crm.customers c WHERE c.id = transaction_refs.customer_id)
                                   = (SELECT app.current_staff_id())))))))
);

-- =====================================================================================
-- บล็อก G — ข้อ 6.5 · crm — campaigns · leads · opportunities · items · quotations · ประวัติ
-- =====================================================================================

-- G. crm: campaigns · leads · opportunities · items · quotations · ประวัติ (ข้อ 4.3–4.6 · 5.10 · 8.3)
GRANT SELECT ON crm.campaigns TO authenticated;
GRANT INSERT (code, name_th, channel_code, starts_on, ends_on, is_active) ON crm.campaigns TO authenticated;
GRANT UPDATE (name_th, channel_code, starts_on, ends_on, is_active) ON crm.campaigns TO authenticated;
CREATE POLICY campaigns_select ON crm.campaigns FOR SELECT TO authenticated
    USING (organization_id = (SELECT app.current_organization_id()) AND (SELECT app.has_permission('campaign.read')));
CREATE POLICY campaigns_insert ON crm.campaigns FOR INSERT TO authenticated
    WITH CHECK (organization_id = (SELECT app.current_organization_id()) AND (SELECT app.has_permission('campaign.manage')));
CREATE POLICY campaigns_update ON crm.campaigns FOR UPDATE TO authenticated
    USING (organization_id = (SELECT app.current_organization_id()) AND (SELECT app.has_permission('campaign.manage')))
    WITH CHECK (organization_id = (SELECT app.current_organization_id()) AND (SELECT app.has_permission('campaign.manage')));

GRANT SELECT ON crm.leads TO authenticated;
GRANT INSERT (customer_id, branch_id, owner_staff_id, channel_code, source_code, campaign_id, visit_id, interest_code, product_type_code,
              product_model, interest_level, priority_code, next_action, next_action_type_code, next_action_at) ON crm.leads TO authenticated;
GRANT UPDATE (source_code, campaign_id, interest_code, product_type_code, product_model, interest_level, status, priority_code,
              next_action, next_action_type_code, next_action_at, closed_at, lost_reason_code, lost_note) ON crm.leads TO authenticated;
CREATE POLICY leads_select ON crm.leads FOR SELECT TO authenticated
USING (
       leads.branch_id = ANY ((SELECT app.scope_branch_ids('lead.read', 'BRANCH'))::uuid[])
    OR (leads.branch_id, leads.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('lead.read') tp)
    OR (    leads.branch_id = ANY ((SELECT app.scope_branch_ids('lead.read', 'OWN'))::uuid[])
        AND coalesce(leads.owner_staff_id, leads.created_by) = (SELECT app.current_staff_id()))
    OR leads.customer_id IN (SELECT app.readable_customer_ids())
);
CREATE POLICY leads_insert ON crm.leads FOR INSERT TO authenticated
WITH CHECK (
        leads.customer_id IN (SELECT app.readable_customer_ids())
    AND (   leads.branch_id = ANY ((SELECT app.scope_branch_ids('lead.create', 'ORGANIZATION'))::uuid[])
         OR (    (   EXISTS (SELECT 1 FROM crm.customer_branches cb WHERE cb.customer_id = leads.customer_id AND cb.branch_id = leads.branch_id)
                  OR EXISTS (SELECT 1 FROM crm.customers c WHERE c.id = leads.customer_id AND c.first_branch_id = leads.branch_id))
             AND (   leads.branch_id = ANY ((SELECT app.scope_branch_ids('lead.create', 'BRANCH'))::uuid[])
                  OR (leads.branch_id, (SELECT c.owner_staff_id FROM crm.customers c WHERE c.id = leads.customer_id))
                       IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('lead.create') tp)
                  OR (    leads.branch_id = ANY ((SELECT app.scope_branch_ids('lead.create', 'OWN'))::uuid[])
                      AND (SELECT c.owner_staff_id FROM crm.customers c WHERE c.id = leads.customer_id) = (SELECT app.current_staff_id())))))
    AND (leads.visit_id IS NULL OR leads.visit_id IN (
            SELECT v.id FROM crm.visits v WHERE v.branch_id = leads.branch_id AND v.customer_id = leads.customer_id))
);
CREATE POLICY leads_update ON crm.leads FOR UPDATE TO authenticated
USING (
       leads.branch_id = ANY ((SELECT app.scope_branch_ids('lead.update', 'BRANCH'))::uuid[])
    OR (leads.branch_id, leads.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('lead.update') tp)
    OR (    leads.branch_id = ANY ((SELECT app.scope_branch_ids('lead.update', 'OWN'))::uuid[])
        AND coalesce(leads.owner_staff_id, leads.created_by) = (SELECT app.current_staff_id()))
)
WITH CHECK (
    (      leads.branch_id = ANY ((SELECT app.scope_branch_ids('lead.update', 'BRANCH'))::uuid[])
        OR (leads.branch_id, leads.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('lead.update') tp)
        OR (    leads.branch_id = ANY ((SELECT app.scope_branch_ids('lead.update', 'OWN'))::uuid[])
            AND coalesce(leads.owner_staff_id, leads.created_by) = (SELECT app.current_staff_id())))
    AND leads.customer_id IN (SELECT app.readable_customer_ids())
);

GRANT SELECT ON crm.lead_status_history TO authenticated;
CREATE POLICY lead_status_history_select ON crm.lead_status_history FOR SELECT TO authenticated
    USING (lead_id IN (SELECT l.id FROM crm.leads l));

GRANT SELECT ON crm.opportunities TO authenticated;
GRANT INSERT (customer_id, origin_channel_code, origin_visit_id, branch_id, owner_staff_id, interest_code, priority_code,
              next_action, next_action_type_code, next_action_at) ON crm.opportunities TO authenticated;
GRANT UPDATE (interest_code, stage, priority_code, next_action, next_action_type_code, next_action_at,
              won_amount, won_at, closed_at, lost_reason_code, lost_note) ON crm.opportunities TO authenticated;
CREATE POLICY opportunities_select ON crm.opportunities FOR SELECT TO authenticated
USING (
       opportunities.branch_id = ANY ((SELECT app.scope_branch_ids('opportunity.read', 'BRANCH'))::uuid[])
    OR (opportunities.branch_id, opportunities.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('opportunity.read') tp)
    OR (    opportunities.branch_id = ANY ((SELECT app.scope_branch_ids('opportunity.read', 'OWN'))::uuid[])
        AND coalesce(opportunities.owner_staff_id, opportunities.created_by) = (SELECT app.current_staff_id()))
    OR opportunities.customer_id IN (SELECT app.readable_customer_ids())
);
CREATE POLICY opportunities_insert ON crm.opportunities FOR INSERT TO authenticated
WITH CHECK (
        opportunities.customer_id IN (SELECT app.readable_customer_ids())
    AND (   opportunities.branch_id = ANY ((SELECT app.scope_branch_ids('opportunity.create', 'ORGANIZATION'))::uuid[])
         OR (    (   EXISTS (SELECT 1 FROM crm.customer_branches cb WHERE cb.customer_id = opportunities.customer_id AND cb.branch_id = opportunities.branch_id)
                  OR EXISTS (SELECT 1 FROM crm.customers c WHERE c.id = opportunities.customer_id AND c.first_branch_id = opportunities.branch_id))
             AND (   opportunities.branch_id = ANY ((SELECT app.scope_branch_ids('opportunity.create', 'BRANCH'))::uuid[])
                  OR (opportunities.branch_id, (SELECT c.owner_staff_id FROM crm.customers c WHERE c.id = opportunities.customer_id))
                       IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('opportunity.create') tp)
                  OR (    opportunities.branch_id = ANY ((SELECT app.scope_branch_ids('opportunity.create', 'OWN'))::uuid[])
                      AND (SELECT c.owner_staff_id FROM crm.customers c WHERE c.id = opportunities.customer_id) = (SELECT app.current_staff_id())))))
    AND (opportunities.origin_visit_id IS NULL OR opportunities.origin_visit_id IN (
            SELECT v.id FROM crm.visits v
            WHERE v.branch_id = opportunities.branch_id AND v.customer_id = opportunities.customer_id
              AND v.channel_code = opportunities.origin_channel_code))
);
CREATE POLICY opportunities_update ON crm.opportunities FOR UPDATE TO authenticated
USING (
       opportunities.branch_id = ANY ((SELECT app.scope_branch_ids('opportunity.update', 'BRANCH'))::uuid[])
    OR (opportunities.branch_id, opportunities.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('opportunity.update') tp)
    OR (    opportunities.branch_id = ANY ((SELECT app.scope_branch_ids('opportunity.update', 'OWN'))::uuid[])
        AND coalesce(opportunities.owner_staff_id, opportunities.created_by) = (SELECT app.current_staff_id()))
)
WITH CHECK (
    (      opportunities.branch_id = ANY ((SELECT app.scope_branch_ids('opportunity.update', 'BRANCH'))::uuid[])
        OR (opportunities.branch_id, opportunities.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('opportunity.update') tp)
        OR (    opportunities.branch_id = ANY ((SELECT app.scope_branch_ids('opportunity.update', 'OWN'))::uuid[])
            AND coalesce(opportunities.owner_staff_id, opportunities.created_by) = (SELECT app.current_staff_id())))
    AND opportunities.customer_id IN (SELECT app.readable_customer_ids())
);

GRANT SELECT ON crm.opportunity_stage_history TO authenticated;
CREATE POLICY opportunity_stage_history_select ON crm.opportunity_stage_history FOR SELECT TO authenticated
    USING (opportunity_id IN (SELECT o.id FROM crm.opportunities o));

GRANT SELECT ON crm.opportunity_items TO authenticated;
GRANT INSERT (opportunity_id, product_type_code, product_model, variant, quantity, unit_price, interest_level) ON crm.opportunity_items TO authenticated;
GRANT UPDATE (product_type_code, product_model, variant, quantity, unit_price, interest_level) ON crm.opportunity_items TO authenticated;
GRANT DELETE ON crm.opportunity_items TO authenticated;
CREATE POLICY opportunity_items_select ON crm.opportunity_items FOR SELECT TO authenticated
    USING (opportunity_id IN (SELECT o.id FROM crm.opportunities o));
CREATE POLICY opportunity_items_insert ON crm.opportunity_items FOR INSERT TO authenticated
WITH CHECK (opportunity_items.opportunity_id IN (
    SELECT x.id FROM crm.opportunities x
    WHERE x.stage IN ('INTERESTED', 'QUOTATION', 'FOLLOW_UP')
      AND (   x.branch_id = ANY ((SELECT app.scope_branch_ids('opportunity.update', 'BRANCH'))::uuid[])
           OR (x.branch_id, x.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('opportunity.update') tp)
           OR (    x.branch_id = ANY ((SELECT app.scope_branch_ids('opportunity.update', 'OWN'))::uuid[])
               AND coalesce(x.owner_staff_id, x.created_by) = (SELECT app.current_staff_id())))));
CREATE POLICY opportunity_items_update ON crm.opportunity_items FOR UPDATE TO authenticated
USING (opportunity_items.opportunity_id IN (
    SELECT x.id FROM crm.opportunities x
    WHERE x.stage IN ('INTERESTED', 'QUOTATION', 'FOLLOW_UP')
      AND (   x.branch_id = ANY ((SELECT app.scope_branch_ids('opportunity.update', 'BRANCH'))::uuid[])
           OR (x.branch_id, x.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('opportunity.update') tp)
           OR (    x.branch_id = ANY ((SELECT app.scope_branch_ids('opportunity.update', 'OWN'))::uuid[])
               AND coalesce(x.owner_staff_id, x.created_by) = (SELECT app.current_staff_id())))))
WITH CHECK (opportunity_items.opportunity_id IN (
    SELECT x.id FROM crm.opportunities x
    WHERE x.stage IN ('INTERESTED', 'QUOTATION', 'FOLLOW_UP')
      AND (   x.branch_id = ANY ((SELECT app.scope_branch_ids('opportunity.update', 'BRANCH'))::uuid[])
           OR (x.branch_id, x.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('opportunity.update') tp)
           OR (    x.branch_id = ANY ((SELECT app.scope_branch_ids('opportunity.update', 'OWN'))::uuid[])
               AND coalesce(x.owner_staff_id, x.created_by) = (SELECT app.current_staff_id())))));
CREATE POLICY opportunity_items_delete ON crm.opportunity_items FOR DELETE TO authenticated
USING (opportunity_items.opportunity_id IN (
    SELECT x.id FROM crm.opportunities x
    WHERE x.stage IN ('INTERESTED', 'QUOTATION', 'FOLLOW_UP')
      AND (   x.branch_id = ANY ((SELECT app.scope_branch_ids('opportunity.update', 'BRANCH'))::uuid[])
           OR (x.branch_id, x.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('opportunity.update') tp)
           OR (    x.branch_id = ANY ((SELECT app.scope_branch_ids('opportunity.update', 'OWN'))::uuid[])
               AND coalesce(x.owner_staff_id, x.created_by) = (SELECT app.current_staff_id())))));

GRANT SELECT ON crm.quotations TO authenticated;
GRANT INSERT (opportunity_id, total_amount, installment_months, terms_note) ON crm.quotations TO authenticated;
GRANT UPDATE (status, sent_channel_code, total_amount, installment_months, terms_note) ON crm.quotations TO authenticated;
CREATE POLICY quotations_select ON crm.quotations FOR SELECT TO authenticated
USING (
       quotations.branch_id = ANY ((SELECT app.scope_branch_ids('quotation.read', 'BRANCH'))::uuid[])
    OR (quotations.branch_id, quotations.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('quotation.read') tp)
    OR (    quotations.branch_id = ANY ((SELECT app.scope_branch_ids('quotation.read', 'OWN'))::uuid[])
        AND coalesce(quotations.owner_staff_id, quotations.created_by) = (SELECT app.current_staff_id()))
    OR quotations.customer_id IN (SELECT app.readable_customer_ids())
);
CREATE POLICY quotations_insert ON crm.quotations FOR INSERT TO authenticated
WITH CHECK (
        quotations.customer_id IN (SELECT app.readable_customer_ids())
    AND quotations.opportunity_id IN (
            SELECT x.id FROM crm.opportunities x
            WHERE x.branch_id = quotations.branch_id
              AND x.customer_id = quotations.customer_id
              AND (   x.branch_id = ANY ((SELECT app.scope_branch_ids('quotation.create', 'BRANCH'))::uuid[])
                   OR (x.branch_id, x.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('quotation.create') tp)
                   OR (    x.branch_id = ANY ((SELECT app.scope_branch_ids('quotation.create', 'OWN'))::uuid[])
                       AND coalesce(x.owner_staff_id, x.created_by) = (SELECT app.current_staff_id()))))
);
CREATE POLICY quotations_update ON crm.quotations FOR UPDATE TO authenticated
USING (
       quotations.branch_id = ANY ((SELECT app.scope_branch_ids('quotation.update', 'BRANCH'))::uuid[])
    OR (quotations.branch_id, quotations.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('quotation.update') tp)
    OR (    quotations.branch_id = ANY ((SELECT app.scope_branch_ids('quotation.update', 'OWN'))::uuid[])
        AND coalesce(quotations.owner_staff_id, quotations.created_by) = (SELECT app.current_staff_id()))
)
WITH CHECK (
    (      quotations.branch_id = ANY ((SELECT app.scope_branch_ids('quotation.update', 'BRANCH'))::uuid[])
        OR (quotations.branch_id, quotations.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('quotation.update') tp)
        OR (    quotations.branch_id = ANY ((SELECT app.scope_branch_ids('quotation.update', 'OWN'))::uuid[])
            AND coalesce(quotations.owner_staff_id, quotations.created_by) = (SELECT app.current_staff_id())))
    AND quotations.customer_id IN (SELECT app.readable_customer_ids())
);

GRANT SELECT ON crm.quotation_items TO authenticated;
GRANT INSERT (quotation_id, product_type_code, product_model, variant, quantity, unit_price, discount_amount) ON crm.quotation_items TO authenticated;
GRANT UPDATE (product_type_code, product_model, variant, quantity, unit_price, discount_amount) ON crm.quotation_items TO authenticated;
GRANT DELETE ON crm.quotation_items TO authenticated;
CREATE POLICY quotation_items_select ON crm.quotation_items FOR SELECT TO authenticated
    USING (quotation_id IN (SELECT q.id FROM crm.quotations q));
CREATE POLICY quotation_items_insert ON crm.quotation_items FOR INSERT TO authenticated
WITH CHECK (quotation_items.quotation_id IN (
    SELECT x.id FROM crm.quotations x
    WHERE x.status = 'DRAFT'
      AND (   x.branch_id = ANY ((SELECT app.scope_branch_ids('quotation.update', 'BRANCH'))::uuid[])
           OR (x.branch_id, x.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('quotation.update') tp)
           OR (    x.branch_id = ANY ((SELECT app.scope_branch_ids('quotation.update', 'OWN'))::uuid[])
               AND coalesce(x.owner_staff_id, x.created_by) = (SELECT app.current_staff_id())))));
CREATE POLICY quotation_items_update ON crm.quotation_items FOR UPDATE TO authenticated
USING (quotation_items.quotation_id IN (
    SELECT x.id FROM crm.quotations x
    WHERE x.status = 'DRAFT'
      AND (   x.branch_id = ANY ((SELECT app.scope_branch_ids('quotation.update', 'BRANCH'))::uuid[])
           OR (x.branch_id, x.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('quotation.update') tp)
           OR (    x.branch_id = ANY ((SELECT app.scope_branch_ids('quotation.update', 'OWN'))::uuid[])
               AND coalesce(x.owner_staff_id, x.created_by) = (SELECT app.current_staff_id())))))
WITH CHECK (quotation_items.quotation_id IN (
    SELECT x.id FROM crm.quotations x
    WHERE x.status = 'DRAFT'
      AND (   x.branch_id = ANY ((SELECT app.scope_branch_ids('quotation.update', 'BRANCH'))::uuid[])
           OR (x.branch_id, x.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('quotation.update') tp)
           OR (    x.branch_id = ANY ((SELECT app.scope_branch_ids('quotation.update', 'OWN'))::uuid[])
               AND coalesce(x.owner_staff_id, x.created_by) = (SELECT app.current_staff_id())))));
CREATE POLICY quotation_items_delete ON crm.quotation_items FOR DELETE TO authenticated
USING (quotation_items.quotation_id IN (
    SELECT x.id FROM crm.quotations x
    WHERE x.status = 'DRAFT'
      AND (   x.branch_id = ANY ((SELECT app.scope_branch_ids('quotation.update', 'BRANCH'))::uuid[])
           OR (x.branch_id, x.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('quotation.update') tp)
           OR (    x.branch_id = ANY ((SELECT app.scope_branch_ids('quotation.update', 'OWN'))::uuid[])
               AND coalesce(x.owner_staff_id, x.created_by) = (SELECT app.current_staff_id())))));

GRANT SELECT ON crm.ownership_changes TO authenticated;
CREATE POLICY ownership_changes_select ON crm.ownership_changes FOR SELECT TO authenticated
USING (
       (entity_type = 'CUSTOMER'    AND entity_id IN (SELECT app.readable_customer_ids()))
    OR (entity_type = 'VISIT'       AND entity_id IN (SELECT v.id FROM crm.visits v))
    OR (entity_type = 'LEAD'        AND entity_id IN (SELECT l.id FROM crm.leads l))
    OR (entity_type = 'OPPORTUNITY' AND entity_id IN (SELECT o.id FROM crm.opportunities o))
    OR (entity_type = 'TASK'        AND entity_id IN (SELECT t.id FROM crm.tasks t))
);

-- =====================================================================================
-- บล็อก H — ข้อ 6.6 · crm — tasks · task_comments · notifications
-- =====================================================================================

-- H. crm: tasks · task_comments · notifications (ข้อ 4.7 · 8.3 · 11.1)
GRANT SELECT ON crm.tasks TO authenticated;
GRANT INSERT (task_type_code, title, description, customer_id, lead_id, opportunity_id, branch_id, owner_staff_id, priority_code, due_at, remind_at)
    ON crm.tasks TO authenticated;
GRANT UPDATE (task_type_code, title, description, status, priority_code, due_at, remind_at) ON crm.tasks TO authenticated;
CREATE POLICY tasks_select ON crm.tasks FOR SELECT TO authenticated
USING (
       tasks.branch_id = ANY ((SELECT app.scope_branch_ids('task.read', 'BRANCH'))::uuid[])
    OR (tasks.branch_id, tasks.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('task.read') tp)
    OR (    tasks.branch_id = ANY ((SELECT app.scope_branch_ids('task.read', 'OWN'))::uuid[])
        AND coalesce(tasks.owner_staff_id, tasks.created_by) = (SELECT app.current_staff_id()))
);
CREATE POLICY tasks_insert ON crm.tasks FOR INSERT TO authenticated
WITH CHECK (
    (tasks.customer_id IS NULL OR tasks.customer_id IN (SELECT app.readable_customer_ids()))
    AND (
        (    tasks.opportunity_id IS NOT NULL
         AND tasks.opportunity_id IN (
               SELECT x.id FROM crm.opportunities x
               WHERE x.branch_id = tasks.branch_id
                 AND x.customer_id IS NOT DISTINCT FROM tasks.customer_id
                 AND (tasks.lead_id IS NULL OR tasks.lead_id = x.lead_id)
                 AND (   x.branch_id = ANY ((SELECT app.scope_branch_ids('task.create', 'BRANCH'))::uuid[])
                      OR (x.branch_id, x.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('task.create') tp)
                      OR (    x.branch_id = ANY ((SELECT app.scope_branch_ids('task.create', 'OWN'))::uuid[])
                          AND coalesce(x.owner_staff_id, x.created_by) = (SELECT app.current_staff_id())))))
     OR (    tasks.opportunity_id IS NULL AND tasks.lead_id IS NOT NULL
         AND tasks.lead_id IN (
               SELECT x.id FROM crm.leads x
               WHERE x.branch_id = tasks.branch_id
                 AND x.customer_id IS NOT DISTINCT FROM tasks.customer_id
                 AND (   x.branch_id = ANY ((SELECT app.scope_branch_ids('task.create', 'BRANCH'))::uuid[])
                      OR (x.branch_id, x.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('task.create') tp)
                      OR (    x.branch_id = ANY ((SELECT app.scope_branch_ids('task.create', 'OWN'))::uuid[])
                          AND coalesce(x.owner_staff_id, x.created_by) = (SELECT app.current_staff_id())))))
     OR (    tasks.opportunity_id IS NULL AND tasks.lead_id IS NULL AND tasks.customer_id IS NOT NULL
         AND (   tasks.branch_id = ANY ((SELECT app.scope_branch_ids('task.create', 'ORGANIZATION'))::uuid[])
              OR (    (   EXISTS (SELECT 1 FROM crm.customer_branches cb WHERE cb.customer_id = tasks.customer_id AND cb.branch_id = tasks.branch_id)
                       OR EXISTS (SELECT 1 FROM crm.customers c WHERE c.id = tasks.customer_id AND c.first_branch_id = tasks.branch_id))
                  AND (   tasks.branch_id = ANY ((SELECT app.scope_branch_ids('task.create', 'BRANCH'))::uuid[])
                       OR (tasks.branch_id, (SELECT c.owner_staff_id FROM crm.customers c WHERE c.id = tasks.customer_id))
                            IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('task.create') tp)
                       OR (    tasks.branch_id = ANY ((SELECT app.scope_branch_ids('task.create', 'OWN'))::uuid[])
                           AND (SELECT c.owner_staff_id FROM crm.customers c WHERE c.id = tasks.customer_id) = (SELECT app.current_staff_id()))))))
     OR (    tasks.opportunity_id IS NULL AND tasks.lead_id IS NULL AND tasks.customer_id IS NULL
         AND (   tasks.branch_id = ANY ((SELECT app.scope_branch_ids('task.create', 'BRANCH'))::uuid[])
              OR (tasks.branch_id, tasks.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('task.create') tp)
              OR (    tasks.branch_id = ANY ((SELECT app.scope_branch_ids('task.create', 'OWN'))::uuid[])
                  AND coalesce(tasks.owner_staff_id, tasks.created_by) = (SELECT app.current_staff_id()))))
    )
);
CREATE POLICY tasks_update ON crm.tasks FOR UPDATE TO authenticated
USING (
       tasks.branch_id = ANY ((SELECT app.scope_branch_ids('task.update', 'BRANCH'))::uuid[])
    OR (tasks.branch_id, tasks.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('task.update') tp)
    OR (    tasks.branch_id = ANY ((SELECT app.scope_branch_ids('task.update', 'OWN'))::uuid[])
        AND coalesce(tasks.owner_staff_id, tasks.created_by) = (SELECT app.current_staff_id()))
)
WITH CHECK (
    (      tasks.branch_id = ANY ((SELECT app.scope_branch_ids('task.update', 'BRANCH'))::uuid[])
        OR (tasks.branch_id, tasks.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('task.update') tp)
        OR (    tasks.branch_id = ANY ((SELECT app.scope_branch_ids('task.update', 'OWN'))::uuid[])
            AND coalesce(tasks.owner_staff_id, tasks.created_by) = (SELECT app.current_staff_id())))
    AND (tasks.customer_id IS NULL OR tasks.customer_id IN (SELECT app.readable_customer_ids()))
);

GRANT SELECT ON crm.task_comments TO authenticated;
GRANT INSERT (task_id, body) ON crm.task_comments TO authenticated;
GRANT UPDATE (body) ON crm.task_comments TO authenticated;
CREATE POLICY task_comments_select ON crm.task_comments FOR SELECT TO authenticated
    USING (task_id IN (SELECT t.id FROM crm.tasks t));
CREATE POLICY task_comments_insert ON crm.task_comments FOR INSERT TO authenticated
WITH CHECK (task_comments.task_id IN (
    SELECT x.id FROM crm.tasks x
    WHERE x.branch_id = ANY ((SELECT app.scope_branch_ids('task.update', 'BRANCH'))::uuid[])
       OR (x.branch_id, x.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('task.update') tp)
       OR (    x.branch_id = ANY ((SELECT app.scope_branch_ids('task.update', 'OWN'))::uuid[])
           AND coalesce(x.owner_staff_id, x.created_by) = (SELECT app.current_staff_id()))));
CREATE POLICY task_comments_update ON crm.task_comments FOR UPDATE TO authenticated
USING (task_comments.task_id IN (
    SELECT x.id FROM crm.tasks x
    WHERE x.branch_id = ANY ((SELECT app.scope_branch_ids('task.update', 'BRANCH'))::uuid[])
       OR (x.branch_id, x.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('task.update') tp)
       OR (    x.branch_id = ANY ((SELECT app.scope_branch_ids('task.update', 'OWN'))::uuid[])
           AND coalesce(x.owner_staff_id, x.created_by) = (SELECT app.current_staff_id()))))
WITH CHECK (task_comments.task_id IN (
    SELECT x.id FROM crm.tasks x
    WHERE x.branch_id = ANY ((SELECT app.scope_branch_ids('task.update', 'BRANCH'))::uuid[])
       OR (x.branch_id, x.owner_staff_id) IN (SELECT tp.branch_id, tp.staff_id FROM app.team_scope_pairs('task.update') tp)
       OR (    x.branch_id = ANY ((SELECT app.scope_branch_ids('task.update', 'OWN'))::uuid[])
           AND coalesce(x.owner_staff_id, x.created_by) = (SELECT app.current_staff_id()))));

GRANT SELECT ON crm.notifications TO authenticated;
GRANT UPDATE (read_at) ON crm.notifications TO authenticated;
CREATE POLICY notifications_select ON crm.notifications FOR SELECT TO authenticated
    USING (recipient_staff_id = (SELECT app.current_staff_id()));
CREATE POLICY notifications_update ON crm.notifications FOR UPDATE TO authenticated
    USING (recipient_staff_id = (SELECT app.current_staff_id()))
    WITH CHECK (recipient_staff_id = (SELECT app.current_staff_id()));

-- =====================================================================================
-- บล็อก I — ข้อ 6.7 · core
-- =====================================================================================

-- I. core (ข้อ 8.3 · 19.2 ข้อ 7)
GRANT SELECT ON core.organizations, core.business_units, core.branches, core.departments, core.teams,
                core.roles, core.permissions, core.role_permissions TO authenticated;
GRANT SELECT (id, staff_code, display_name, nickname, status) ON core.staff_profiles TO authenticated;
CREATE POLICY organizations_select ON core.organizations FOR SELECT TO authenticated
    USING (id = (SELECT app.current_organization_id()));
CREATE POLICY business_units_select ON core.business_units FOR SELECT TO authenticated
    USING (organization_id = (SELECT app.current_organization_id()));
CREATE POLICY branches_select ON core.branches FOR SELECT TO authenticated
    USING (organization_id = (SELECT app.current_organization_id()));
CREATE POLICY departments_select ON core.departments FOR SELECT TO authenticated
    USING (organization_id = (SELECT app.current_organization_id()));
CREATE POLICY teams_select ON core.teams FOR SELECT TO authenticated
    USING (organization_id = (SELECT app.current_organization_id()));
CREATE POLICY staff_profiles_select ON core.staff_profiles FOR SELECT TO authenticated
    USING (organization_id = (SELECT app.current_organization_id()));
CREATE POLICY roles_select ON core.roles FOR SELECT TO authenticated
    USING ((SELECT app.current_staff_id()) IS NOT NULL);
CREATE POLICY permissions_select ON core.permissions FOR SELECT TO authenticated
    USING ((SELECT app.current_staff_id()) IS NOT NULL);
CREATE POLICY role_permissions_select ON core.role_permissions FOR SELECT TO authenticated
    USING ((SELECT app.current_staff_id()) IS NOT NULL);

-- =====================================================================================
-- บล็อก J — ข้อ 6.8 · ref 16 ตาราง
-- =====================================================================================

-- J. ref 16 ตาราง (ข้อ 5 · 19.1 ข้อ 4)
DO $$
DECLARE
    t text;
    v_extra text;
BEGIN
    FOREACH t IN ARRAY ARRAY['channels','sources','interest_types','product_types','lost_reasons','visit_outcomes','interaction_types',
                             'task_types','priorities','provinces','ownership_change_reasons','duplicate_override_reasons',
                             'export_reasons','consent_purposes','transaction_types','source_systems']
    LOOP
        v_extra := CASE t
            WHEN 'channels'          THEN ', channel_group, is_live, chart_token'
            WHEN 'interest_types'    THEN ', creates_lead'
            WHEN 'visit_outcomes'    THEN ', counts_as_recorded'
            WHEN 'priorities'        THEN ', color_token'
            WHEN 'export_reasons'    THEN ', is_marketing'
            WHEN 'consent_purposes'  THEN ', controller_entity'
            WHEN 'transaction_types' THEN ', counts_as_purchase, purchase_tab_group'
            ELSE '' END;
        EXECUTE format('GRANT SELECT ON ref.%I TO authenticated', t);
        EXECUTE format('GRANT INSERT (code, label_th, label_en, sort_order, is_active%s) ON ref.%I TO authenticated', v_extra, t);
        EXECUTE format('GRANT UPDATE (label_th, label_en, sort_order, is_active) ON ref.%I TO authenticated', t);
        EXECUTE format('CREATE POLICY %I ON ref.%I FOR SELECT TO authenticated USING ((SELECT app.current_staff_id()) IS NOT NULL AND (is_active OR (SELECT app.has_permission(%L))))',
                       t || '_select', t, 'master_data.manage');
        EXECUTE format('CREATE POLICY %I ON ref.%I FOR INSERT TO authenticated WITH CHECK ((SELECT app.has_permission(%L)))',
                       t || '_insert', t, 'master_data.manage');
        EXECUTE format('CREATE POLICY %I ON ref.%I FOR UPDATE TO authenticated USING ((SELECT app.has_permission(%L))) WITH CHECK ((SELECT app.has_permission(%L)))',
                       t || '_update', t, 'master_data.manage', 'master_data.manage');
    END LOOP;
END $$;

-- =====================================================================================
-- บล็อก K — ข้อ 7.1 · trg_90_stamp_row
-- =====================================================================================

-- K. trg_90_stamp_row (ข้อ 19.2 ข้อ 1) · ติดทุกตารางที่มี organization_id created_by updated_by
CREATE FUNCTION app.trg_stamp_row() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
    v_me uuid;
BEGIN
    IF current_user <> 'authenticated' THEN
        RETURN NEW;
    END IF;
    v_me := app.current_staff_id();
    IF TG_OP = 'INSERT' THEN
        NEW.organization_id := app.current_organization_id();
        NEW.created_by      := v_me;
        NEW.updated_by      := v_me;
    ELSE
        NEW.updated_by      := v_me;
    END IF;
    RETURN NEW;
END;
$$;

DO $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT c.oid::regclass AS tbl
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('crm', 'core', 'audit') AND c.relkind = 'r'
          AND (SELECT count(*) FROM pg_attribute a
               WHERE a.attrelid = c.oid AND NOT a.attisdropped
                 AND a.attname IN ('organization_id', 'created_by', 'updated_by')) = 3
        ORDER BY 1
    LOOP
        EXECUTE format('CREATE TRIGGER trg_90_stamp_row BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION app.trg_stamp_row()', r.tbl);
    END LOOP;
END $$;

-- =====================================================================================
-- บล็อก L — ข้อ 7.5 · app.transition_denied · app.enforce_row_transition
-- =====================================================================================

-- L. app.enforce_row_transition (ข้อ 9.4.2) · รหัสแถวในความเห็นตรงกับตาราง §7.3
CREATE FUNCTION app.transition_denied(p_code text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
    RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'JCRM-' || p_code,
        DETAIL  = CASE p_code
            WHEN 'T00' THEN 'no active staff for this session'
            WHEN 'T01' THEN 'system column is not writable'
            WHEN 'T02' THEN 'customer record is not ACTIVE'
            WHEN 'T10' THEN 'assign permission required on current row'
            WHEN 'T11' THEN 'new owner is outside your assign scope'
            WHEN 'T12' THEN 'new owner has no assignment in the row branch'
            WHEN 'T13' THEN 'owner, team or branch changes only via api.assign_owner'
            WHEN 'T14' THEN 'column is immutable'
            WHEN 'T15' THEN 'assign permission required on destination branch'
            WHEN 'T16' THEN 'owner is required for this record'
            WHEN 'T20' THEN 'queue claim may change status and owner only'
            WHEN 'T21' THEN 'visit status change not allowed here'
            WHEN 'T22' THEN 'cancel window passed; team or branch scope required'
            WHEN 'T23' THEN 'closed visit is read-only'
            WHEN 'T24' THEN 'changing identified customer requires team or branch scope'
            WHEN 'T25' THEN 'changing visit owner requires team or branch scope'
            WHEN 'T26' THEN 'customer is not linked to the row branch; use api.link_customer_to_branch'
            WHEN 'T30' THEN 'stage transition not allowed'
            WHEN 'T31' THEN 'close permission required'
            WHEN 'T32' THEN 'reopen permission required or invalid target stage'
            WHEN 'T33' THEN 'closed opportunity is read-only'
            WHEN 'T40' THEN 'lead status transition not allowed'
            WHEN 'T41' THEN 'use api.convert_lead'
            WHEN 'T42' THEN 'reopen permission required or invalid target status'
            WHEN 'T43' THEN 'closed lead is read-only'
            WHEN 'T50' THEN 'sent quotation: only status may change'
            WHEN 'T51' THEN 'quotation status transition not allowed'
            WHEN 'T52' THEN 'sent_channel_code is required'
            WHEN 'T60' THEN 'interaction older than 24 hours'
            WHEN 'T70' THEN 'task status transition not allowed'
            WHEN 'T80' THEN 'owner other than yourself requires assign permission'
            WHEN 'T81' THEN 'initial status not allowed'
            WHEN 'T90' THEN 'customer.assign required'
            ELSE 'transition denied' END,
        HINT = CASE p_code
            WHEN 'T00' THEN 'บัญชีนี้ไม่ได้อยู่ในสถานะใช้งาน'
            WHEN 'T01' THEN 'ข้อมูลนี้ระบบกำหนด แก้ไขเองไม่ได้'
            WHEN 'T02' THEN 'ลูกค้ารายนี้ถูกรวมหรือทำเป็นข้อมูลนิรนามแล้ว'
            WHEN 'T10' THEN 'ต้องมีสิทธิ์มอบหมายรายการนี้'
            WHEN 'T11' THEN 'ผู้รับผิดชอบใหม่อยู่นอกขอบเขตที่คุณมอบหมายได้'
            WHEN 'T12' THEN 'ผู้รับผิดชอบที่เลือกไม่ได้สังกัดสาขาของรายการ'
            WHEN 'T13' THEN 'เปลี่ยนผู้รับผิดชอบหรือสาขาด้วยปุ่ม "มอบหมาย" เท่านั้น'
            WHEN 'T14' THEN 'ข้อมูลช่องนี้เปลี่ยนไม่ได้หลังบันทึก'
            WHEN 'T15' THEN 'ต้องมีสิทธิ์มอบหมายทั้งสาขาต้นทางและปลายทาง'
            WHEN 'T16' THEN 'ต้องเลือกผู้รับผิดชอบ'
            WHEN 'T20' THEN 'รับคิวแล้วจึงแก้ไขรายละเอียดอื่น'
            WHEN 'T21' THEN 'ปิดการให้บริการด้วยปุ่มบันทึกผล'
            WHEN 'T22' THEN 'เกิน 15 นาที ต้องให้หัวหน้าทีมหรือผู้จัดการยกเลิก'
            WHEN 'T23' THEN 'การให้บริการนี้ปิดแล้ว'
            WHEN 'T24' THEN 'ต้องให้หัวหน้าทีมหรือผู้จัดการเปลี่ยนลูกค้าของรายการนี้'
            WHEN 'T25' THEN 'ต้องให้หัวหน้าทีมหรือผู้จัดการเปลี่ยนผู้รับ'
            WHEN 'T26' THEN 'ลูกค้ารายนี้ยังไม่ผูกกับสาขาของรายการ · ผูกลูกค้าจากสาขาอื่นได้เฉพาะตอนรับลูกค้า'
            WHEN 'T30' THEN 'ย้ายขั้นนี้ไม่ได้ (เสนอราคา/รอตัดสินใจต้องมีใบเสนอราคาที่ส่งแล้ว · ย้อนเป็น "สนใจ" ไม่ได้)'
            WHEN 'T31' THEN 'ต้องมีสิทธิ์ปิดรายการนี้'
            WHEN 'T32' THEN 'ต้องมีสิทธิ์เปิดรายการที่ปิดแล้ว'
            WHEN 'T33' THEN 'เปิดรายการใหม่ก่อนแก้ไข'
            WHEN 'T40' THEN 'เปลี่ยนสถานะนี้ไม่ได้'
            WHEN 'T41' THEN 'ใช้ปุ่ม "แปลงเป็นโอกาสขาย"'
            WHEN 'T42' THEN 'ต้องมีสิทธิ์เปิด Lead ที่ปิดแล้ว'
            WHEN 'T43' THEN 'เปิด Lead ใหม่ก่อนแก้ไข'
            WHEN 'T50' THEN 'ส่งแล้ว แก้ได้เฉพาะสถานะ'
            WHEN 'T51' THEN 'เปลี่ยนสถานะใบเสนอราคานี้ไม่ได้'
            WHEN 'T52' THEN 'เลือกช่องทางที่ส่งใบเสนอราคา'
            WHEN 'T60' THEN 'แก้ไขได้ภายใน 24 ชม. หลังบันทึก'
            WHEN 'T70' THEN 'เปลี่ยนสถานะงานนี้ไม่ได้'
            WHEN 'T80' THEN 'สร้างรายการให้ผู้อื่นต้องมีสิทธิ์มอบหมาย'
            WHEN 'T81' THEN 'สถานะเริ่มต้นไม่ถูกต้อง'
            WHEN 'T90' THEN 'ต้องมีสิทธิ์เปลี่ยนผู้ดูแลลูกค้า'
            ELSE 'ไม่อนุญาต' END;
END;
$$;

CREATE FUNCTION app.enforce_row_transition() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
    c_system constant text[] := ARRAY[
        'id', 'organization_id', 'created_at', 'created_by', 'updated_at', 'updated_by',
        'customer_no', 'lead_no', 'opportunity_no', 'quotation_no', 'task_no', 'visit_no',
        'first_seen_at', 'first_channel_code', 'first_source_code', 'first_branch_id', 'lifecycle_stage',
        'last_activity_at', 'last_channel_code', 'last_branch_id', 'has_open_followup', 'has_new_lead', 'note_summary',
        'created_via', 'record_status', 'merged_into_id', 'legal_hold', 'expected_amount', 'is_visit_root', 'is_next_action',
        'closed_by_system', 'queue_no', 'outcome_code', 'converted_opportunity_id',
        'first_contacted_at', 'sent_at', 'valid_until', 'completed_at', 'cancelled_at', 'service_started_at', 'ended_at',
        'unrecorded_ack_by', 'unrecorded_ack_at'];
    c_owner  constant text[] := ARRAY['owner_staff_id', 'team_id', 'branch_id'];
    c_open_lead constant text[] := ARRAY['NEW', 'CONTACTED', 'QUALIFIED'];
    c_open_opp  constant text[] := ARRAY['INTERESTED', 'QUOTATION', 'FOLLOW_UP'];
    v_me       uuid;
    v_new      jsonb;
    v_old      jsonb;
    v_changed  text[];
    v_allowed  text[];
    v_col      text;
    v_claim    boolean := false;
    v_team_up  boolean;
BEGIN
    IF current_user <> 'authenticated' THEN
        RETURN NEW;
    END IF;
    v_me := app.current_staff_id();
    IF v_me IS NULL THEN
        PERFORM app.transition_denied('T00');
    END IF;

    -- ---------------- INSERT ----------------
    IF TG_OP = 'INSERT' THEN
        IF TG_TABLE_NAME = 'interactions' THEN
            IF NEW.owner_staff_id IS NOT NULL AND NEW.owner_staff_id <> v_me THEN
                PERFORM app.transition_denied('T80');                                     -- IN-1
            END IF;
            NEW.owner_staff_id := v_me;
        ELSIF TG_TABLE_NAME = 'leads' THEN
            IF NEW.status <> 'NEW' THEN
                PERFORM app.transition_denied('T81');                                     -- LD-1
            END IF;
            IF NEW.owner_staff_id IS NOT NULL AND NEW.owner_staff_id <> v_me THEN         -- LD-2
                IF NOT app.can_access_record('lead.assign', NEW.branch_id, NEW.owner_staff_id, v_me) THEN
                    PERFORM app.transition_denied('T80');
                END IF;
                IF NOT app.staff_has_branch_assignment(NEW.owner_staff_id, NEW.branch_id) THEN
                    PERFORM app.transition_denied('T12');
                END IF;
            END IF;
        ELSIF TG_TABLE_NAME = 'opportunities' THEN
            IF NEW.stage <> 'INTERESTED' THEN
                PERFORM app.transition_denied('T81');                                     -- OP-1
            END IF;
            IF NEW.owner_staff_id IS NULL THEN
                NEW.owner_staff_id := v_me;                                               -- OP-2
            ELSIF NEW.owner_staff_id <> v_me THEN
                IF NOT app.can_access_record('opportunity.assign', NEW.branch_id, NEW.owner_staff_id, v_me) THEN
                    PERFORM app.transition_denied('T80');
                END IF;
                IF NOT app.staff_has_branch_assignment(NEW.owner_staff_id, NEW.branch_id) THEN
                    PERFORM app.transition_denied('T12');
                END IF;
            END IF;
        ELSIF TG_TABLE_NAME = 'quotations' THEN
            IF NEW.status <> 'DRAFT' THEN
                PERFORM app.transition_denied('T81');                                     -- QT-1
            END IF;
            IF NEW.owner_staff_id IS NOT NULL AND NEW.owner_staff_id <> v_me THEN
                PERFORM app.transition_denied('T80');
            END IF;
        ELSIF TG_TABLE_NAME = 'tasks' THEN
            IF NEW.status <> 'OPEN' THEN
                PERFORM app.transition_denied('T81');                                     -- TK-1
            END IF;
            IF NEW.owner_staff_id IS NOT NULL AND NEW.owner_staff_id <> v_me THEN         -- TK-2
                IF NOT app.can_access_record('task.assign', NEW.branch_id, NEW.owner_staff_id, v_me) THEN
                    PERFORM app.transition_denied('T80');
                END IF;
                IF NOT app.staff_has_branch_assignment(NEW.owner_staff_id, NEW.branch_id) THEN
                    PERFORM app.transition_denied('T12');
                END IF;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- ---------------- UPDATE ----------------
    v_new := to_jsonb(NEW);
    v_old := to_jsonb(OLD);
    SELECT coalesce(array_agg(k ORDER BY k), '{}') INTO v_changed
    FROM jsonb_object_keys(v_new) AS k
    WHERE (v_new -> k) IS DISTINCT FROM (v_old -> k)
      AND k NOT IN ('display_name', 'name_search');                                     -- generated column (ค่าใน BEFORE trigger ยังไม่คำนวณ)
    IF cardinality(v_changed) = 0 THEN
        RETURN NEW;
    END IF;

    v_allowed := CASE TG_TABLE_NAME
        WHEN 'customers'     THEN ARRAY['first_name', 'last_name', 'nickname', 'customer_type', 'province_code']
        WHEN 'visits'        THEN ARRAY['status', 'owner_staff_id', 'party_size', 'customer_id', 'interest_code', 'source_code', 'cancel_reason']
        WHEN 'interactions'  THEN ARRAY['customer_id', 'interaction_type_code', 'occurred_at', 'summary']
        WHEN 'leads'         THEN ARRAY['source_code', 'campaign_id', 'interest_code', 'product_type_code', 'product_model', 'interest_level',
                                        'status', 'priority_code', 'next_action', 'next_action_type_code', 'next_action_at',
                                        'closed_at', 'lost_reason_code', 'lost_note']
        WHEN 'opportunities' THEN ARRAY['interest_code', 'stage', 'priority_code', 'next_action', 'next_action_type_code', 'next_action_at',
                                        'won_amount', 'won_at', 'closed_at', 'lost_reason_code', 'lost_note']
        WHEN 'quotations'    THEN ARRAY['status', 'sent_channel_code', 'total_amount', 'installment_months', 'terms_note']
        WHEN 'tasks'         THEN ARRAY['task_type_code', 'title', 'description', 'status', 'priority_code', 'due_at', 'remind_at']
        ELSE '{}'::text[] END;

    FOREACH v_col IN ARRAY v_changed LOOP                                                   -- ALL-1 · ALL-2 · ALL-3
        CONTINUE WHEN v_col = ANY (v_allowed);
        IF v_col = ANY (c_system) THEN
            PERFORM app.transition_denied('T01');
        ELSIF v_col = ANY (c_owner) THEN
            PERFORM app.transition_denied('T13');
        ELSE
            PERFORM app.transition_denied('T14');
        END IF;
    END LOOP;

    IF TG_TABLE_NAME = 'customers' THEN
        IF OLD.record_status <> 'ACTIVE' THEN
            PERFORM app.transition_denied('T02');                                         -- CU-1
        END IF;

    ELSIF TG_TABLE_NAME = 'visits' THEN
        v_claim := OLD.status = 'WAITING' AND OLD.owner_staff_id IS NULL
               AND NEW.status = 'IN_SERVICE' AND NEW.owner_staff_id = v_me;
        v_team_up := OLD.branch_id = ANY (app.scope_branch_ids('visit.update', 'BRANCH'))
                  OR EXISTS (SELECT 1 FROM app.team_scope_pairs('visit.update') tp
                             WHERE tp.branch_id = OLD.branch_id AND tp.staff_id = OLD.owner_staff_id);
        IF 'owner_staff_id' = ANY (v_changed) AND NOT v_claim THEN
            PERFORM app.transition_denied('T13');                                         -- V-2
        END IF;
        IF v_claim AND NOT (v_changed <@ ARRAY['owner_staff_id', 'status']) THEN
            PERFORM app.transition_denied('T20');                                         -- V-3
        END IF;
        IF OLD.status IN ('COMPLETED', 'LEFT', 'CANCELLED')
           AND NOT (v_changed = ARRAY['customer_id'] AND OLD.customer_id IS NULL) THEN
            PERFORM app.transition_denied('T23');                                         -- V-4
        END IF;
        IF 'status' = ANY (v_changed) AND NOT v_claim THEN
            IF NOT (OLD.status IN ('WAITING', 'IN_SERVICE') AND NEW.status = 'CANCELLED') THEN
                PERFORM app.transition_denied('T21');                                     -- V-5
            END IF;
            IF NOT ((coalesce(OLD.owner_staff_id, OLD.created_by) = v_me AND now() < OLD.created_at + interval '15 minutes')
                    OR v_team_up) THEN
                PERFORM app.transition_denied('T22');                                     -- V-6
            END IF;
        END IF;
        IF 'customer_id' = ANY (v_changed) AND OLD.customer_id IS NOT NULL AND NOT v_team_up THEN
            PERFORM app.transition_denied('T24');                                         -- V-7
        END IF;
        -- V-8 (หมายเหตุผู้เขียน · ข้อ 6.6 · 8.0 · 19.3 ข้อ 4): ระบุ/เปลี่ยนลูกค้าของ visit ได้เฉพาะลูกค้าที่
        -- เชื่อมกับสาขาของ visit อยู่แล้ว · ลูกค้าจากสาขาอื่นต้องผูกผ่าน api.link_customer_to_branch
        IF 'customer_id' = ANY (v_changed) AND NEW.customer_id IS NOT NULL
           AND NOT (OLD.branch_id = ANY (app.scope_branch_ids('visit.update', 'ORGANIZATION')))
           AND NOT EXISTS (SELECT 1 FROM crm.customer_branches cb
                           WHERE cb.customer_id = NEW.customer_id AND cb.branch_id = OLD.branch_id)
           AND NOT EXISTS (SELECT 1 FROM crm.customers c
                           WHERE c.id = NEW.customer_id AND c.first_branch_id = OLD.branch_id) THEN
            PERFORM app.transition_denied('T26');
        END IF;

    ELSIF TG_TABLE_NAME = 'interactions' THEN
        IF OLD.created_at < now() - interval '24 hours' THEN
            PERFORM app.transition_denied('T60');                                         -- IN-2
        END IF;
        IF 'customer_id' = ANY (v_changed) AND (OLD.customer_id IS NOT NULL OR OLD.is_visit_root) THEN
            PERFORM app.transition_denied('T14');                                         -- IN-3
        END IF;
        -- IN-4 (หมายเหตุผู้เขียน · ข้อ 6.6 · 8.0): ระบุลูกค้าของ interaction นิรนามได้เฉพาะลูกค้าที่เชื่อมกับ
        -- สาขาของ interaction อยู่แล้ว · มิฉะนั้นเป็นทางลัดของแม่แบบ C (สร้าง interaction นิรนาม แล้วค่อยใส่ลูกค้า)
        IF 'customer_id' = ANY (v_changed) AND NEW.customer_id IS NOT NULL
           AND NOT (OLD.branch_id = ANY (app.scope_branch_ids('interaction.update', 'ORGANIZATION')))
           AND NOT EXISTS (SELECT 1 FROM crm.customer_branches cb
                           WHERE cb.customer_id = NEW.customer_id AND cb.branch_id = OLD.branch_id)
           AND NOT EXISTS (SELECT 1 FROM crm.customers c
                           WHERE c.id = NEW.customer_id AND c.first_branch_id = OLD.branch_id) THEN
            PERFORM app.transition_denied('T26');
        END IF;

    ELSIF TG_TABLE_NAME = 'leads' THEN
        IF OLD.status IN ('CONVERTED', 'LOST') AND NEW.status = OLD.status THEN
            PERFORM app.transition_denied('T43');                                         -- LD-3
        END IF;
        IF NEW.status = 'CONVERTED' AND OLD.status <> 'CONVERTED' THEN
            PERFORM app.transition_denied('T41');                                         -- LD-4
        END IF;
        IF OLD.status IN ('CONVERTED', 'LOST') AND NEW.status <> OLD.status THEN          -- LD-5
            IF NEW.status <> 'CONTACTED'
               OR NOT app.can_access_record('lead.reopen', OLD.branch_id, OLD.owner_staff_id, OLD.created_by) THEN
                PERFORM app.transition_denied('T42');
            END IF;
            NEW.closed_at := NULL;
            NEW.lost_reason_code := NULL;
            NEW.converted_opportunity_id := NULL;
        ELSIF OLD.status::text = ANY (c_open_lead) AND NEW.status = 'LOST' THEN          -- LD-6
            IF NOT app.can_access_record('lead.update', OLD.branch_id, OLD.owner_staff_id, OLD.created_by) THEN
                PERFORM app.transition_denied('T31');
            END IF;
        ELSIF 'status' = ANY (v_changed)
              AND (OLD.status::text, NEW.status::text) NOT IN (('NEW', 'CONTACTED'), ('NEW', 'QUALIFIED'),
                                                               ('CONTACTED', 'QUALIFIED'), ('QUALIFIED', 'CONTACTED')) THEN
            PERFORM app.transition_denied('T40');                                         -- LD-7
        END IF;

    ELSIF TG_TABLE_NAME = 'opportunities' THEN
        IF OLD.stage IN ('WON', 'LOST') AND NEW.stage = OLD.stage THEN
            PERFORM app.transition_denied('T33');                                         -- OP-3
        END IF;
        IF OLD.stage IN ('WON', 'LOST') AND NEW.stage <> OLD.stage THEN                   -- OP-4
            IF NEW.stage <> 'FOLLOW_UP'
               OR NOT app.can_access_record('opportunity.reopen', OLD.branch_id, OLD.owner_staff_id, OLD.created_by) THEN
                PERFORM app.transition_denied('T32');
            END IF;
            NEW.won_at := NULL;
            NEW.won_amount := NULL;
            NEW.closed_at := NULL;
            NEW.lost_reason_code := NULL;
        ELSIF NEW.stage IN ('WON', 'LOST') AND NEW.stage <> OLD.stage THEN               -- OP-5
            IF NOT app.can_access_record('opportunity.close', OLD.branch_id, OLD.owner_staff_id, OLD.created_by) THEN
                PERFORM app.transition_denied('T31');
            END IF;
        ELSIF 'stage' = ANY (v_changed) THEN                                              -- OP-6
            IF NOT (   (OLD.stage = 'QUOTATION' AND NEW.stage = 'FOLLOW_UP')
                    OR (OLD.stage = 'INTERESTED' AND NEW.stage IN ('QUOTATION', 'FOLLOW_UP')
                        AND EXISTS (SELECT 1 FROM crm.quotations q
                                    WHERE q.opportunity_id = OLD.id AND q.sent_at IS NOT NULL))) THEN
                PERFORM app.transition_denied('T30');
            END IF;
        END IF;

    ELSIF TG_TABLE_NAME = 'quotations' THEN
        IF OLD.status <> 'DRAFT' AND v_changed <> ARRAY['status'] THEN
            PERFORM app.transition_denied('T50');                                         -- QT-2
        END IF;
        IF 'status' = ANY (v_changed)
           AND (OLD.status::text, NEW.status::text) NOT IN (('DRAFT', 'SENT'), ('SENT', 'ACCEPTED'), ('SENT', 'REJECTED')) THEN
            PERFORM app.transition_denied('T51');                                         -- QT-3
        END IF;
        IF OLD.status = 'DRAFT' AND NEW.status = 'SENT' AND NEW.sent_channel_code IS NULL THEN
            PERFORM app.transition_denied('T52');                                         -- QT-4
        END IF;

    ELSIF TG_TABLE_NAME = 'tasks' THEN
        IF OLD.status IN ('DONE', 'CANCELLED') THEN
            PERFORM app.transition_denied('T70');                                         -- TK-3
        END IF;
        IF OLD.is_next_action AND ('task_type_code' = ANY (v_changed) OR 'due_at' = ANY (v_changed)) THEN
            PERFORM app.transition_denied('T14');                                         -- TK-4
        END IF;
        IF 'status' = ANY (v_changed)
           AND (OLD.status::text, NEW.status::text) NOT IN (('OPEN', 'IN_PROGRESS'), ('IN_PROGRESS', 'OPEN'), ('OPEN', 'DONE'),
                                                            ('IN_PROGRESS', 'DONE'), ('OPEN', 'CANCELLED'), ('IN_PROGRESS', 'CANCELLED')) THEN
            PERFORM app.transition_denied('T70');                                         -- TK-5
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION app.transition_denied(text) TO authenticated;

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['customers', 'visits', 'interactions', 'leads', 'opportunities', 'quotations', 'tasks'] LOOP
        EXECUTE format('CREATE TRIGGER trg_10_enforce_transition BEFORE INSERT OR UPDATE ON crm.%I FOR EACH ROW EXECUTE FUNCTION app.enforce_row_transition()', t);
    END LOOP;
END $$;

-- =====================================================================================
-- บล็อก M — ข้อ 7.6 · guard ของ core และ audit.export_requests
-- =====================================================================================

-- M. guard ของ core (ข้อ 7.1–7.3) และ audit.export_requests (ข้อ 8.2 · 19.1 ข้อ 13)
CREATE FUNCTION app.trg_guard_core_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF app.is_seed_mode() THEN
        RETURN coalesce(NEW, OLD);
    END IF;
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'ห้ามลบแถว %.% (ข้อ 7.1 · 7.2 · 7.3)', TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = '42501';
    END IF;
    IF TG_TABLE_NAME = 'staff_role_assignments' THEN
        IF (to_jsonb(NEW) - ARRAY['valid_to', 'revoked_by', 'revoke_reason', 'updated_at', 'updated_by'])
           IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['valid_to', 'revoked_by', 'revoke_reason', 'updated_at', 'updated_by']) THEN
            RAISE EXCEPTION 'assignment แก้ได้เฉพาะ valid_to revoked_by revoke_reason (ข้อ 7.1)' USING ERRCODE = '42501';
        END IF;
        IF OLD.valid_to IS NOT NULL AND (NEW.valid_to IS NULL OR NEW.valid_to > OLD.valid_to) THEN
            RAISE EXCEPTION 'assignment ที่ถอนแล้วขยายเวลาไม่ได้ (ข้อ 7.1 · 7.3 มอบบทบาทใหม่)' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_15_guard_core_row BEFORE UPDATE OR DELETE ON core.staff_role_assignments FOR EACH ROW EXECUTE FUNCTION app.trg_guard_core_row();
CREATE TRIGGER trg_15_guard_core_row BEFORE DELETE ON core.staff_profiles FOR EACH ROW EXECUTE FUNCTION app.trg_guard_core_row();
CREATE TRIGGER trg_15_guard_core_row BEFORE DELETE ON core.role_grant_requests FOR EACH ROW EXECUTE FUNCTION app.trg_guard_core_row();

CREATE FUNCTION audit.trg_guard_export_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    c_fixed constant text[] := ARRAY['id', 'organization_id', 'export_no', 'requested_by', 'requested_as_role', 'requested_at',
                                     'branch_ids', 'reason_code', 'reason_note', 'filter', 'created_at', 'created_by'];
BEGIN
    IF app.is_seed_mode() THEN
        RETURN coalesce(NEW, OLD);
    END IF;
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'ห้ามลบคำขอส่งออก (ข้อ 19.1 ข้อ 13)' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NOT (NEW.status = 'REQUESTED'
                OR (NEW.status IN ('APPROVED', 'REJECTED') AND NEW.requested_as_role = 'BRANCH_MANAGER' AND NEW.approved_by IS NULL)
                OR (NEW.status = 'REJECTED' AND NEW.approved_by IS NULL)) THEN
            RAISE EXCEPTION 'สถานะเริ่มต้นของคำขอส่งออกไม่ถูกต้อง (ข้อ 8.2)' USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;
    IF (SELECT jsonb_object_agg(k, to_jsonb(NEW) -> k) FROM unnest(c_fixed) k)
       IS DISTINCT FROM (SELECT jsonb_object_agg(k, to_jsonb(OLD) -> k) FROM unnest(c_fixed) k) THEN
        RAISE EXCEPTION 'ข้อมูลที่บันทึกตอนยื่นคำขอส่งออกแก้ไม่ได้ (ข้อ 8.2)' USING ERRCODE = '42501';
    END IF;
    IF NEW.download_count < OLD.download_count THEN
        RAISE EXCEPTION 'จำนวนครั้งดาวน์โหลดลดลงไม่ได้ (ข้อ 8.2)' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND (OLD.status::text, NEW.status::text) NOT IN (('REQUESTED', 'APPROVED'), ('REQUESTED', 'REJECTED'), ('APPROVED', 'GENERATED'),
                                                        ('GENERATED', 'DOWNLOADED'), ('GENERATED', 'EXPIRED'), ('DOWNLOADED', 'EXPIRED')) THEN
        RAISE EXCEPTION 'เปลี่ยนสถานะคำขอส่งออก % → % ไม่ได้ (ข้อ 8.2)', OLD.status, NEW.status USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_12_guard_export_request BEFORE INSERT OR UPDATE OR DELETE ON audit.export_requests
    FOR EACH ROW EXECUTE FUNCTION audit.trg_guard_export_request();

-- =====================================================================================
-- คำอธิบายฟังก์ชัน (ใช้สร้าง data dictionary) · ข้อความอ้าง CANONICAL v2.2
-- =====================================================================================

COMMENT ON FUNCTION app.current_staff_id() IS
'uuid ของ staff ACTIVE ที่ผูก auth.uid() · ไม่มี → NULL (ข้อ 9.3) · CREATE OR REPLACE ของนิยามเดิมใน 0008 (signature เดิม) · GRANT EXECUTE ให้ authenticated (ใช้ใน policy)';
COMMENT ON FUNCTION app.is_aal2() IS
'true เมื่อ coalesce(auth.jwt()->>''aal'', ''aal1'') = ''aal2'' (ข้อ 8.0 · 9.3) · ใช้ตัดสิน MFA ของบทบาทและสิทธิ์ที่ requires_aal2';
COMMENT ON FUNCTION app.current_organization_id() IS
'องค์กรของผู้ใช้ปัจจุบัน (ข้อ 9.3) · ใช้เป็น DEFAULT ของ organization_id และเงื่อนไของค์กรใน policy';
COMMENT ON FUNCTION app.effective_assignments() IS
'assignment ที่มีผล ณ now(): staff ACTIVE · valid_from ≤ now() < valid_to · บทบาท requires_mfa ต้อง aal2 · บทบาทสาขาต้องมี branch_id (บทบาทองค์กรต้องไม่มี) · '
'SUPERVISOR ใช้ได้เมื่อเป็นหัวหน้าทีมที่ teams.branch_id = สาขาของ assignment (ข้อ 7.1 · 8.0) · ภายใน ไม่ GRANT';
COMMENT ON FUNCTION app.effective_grants(text) IS
'คู่ (สาขา, scope, บทบาท) ของสิทธิ์หนึ่งรหัส (ข้อ 8.0): สิทธิ์ที่ requires_aal2 ต้อง aal2 · scope O/T/B คืนสาขาของ assignment · '
'scope G ขยายเป็นทุกสาขาขององค์กร · scope S ไม่คืนสาขา (ใช้ผ่าน has_permission) · ภายใน ไม่ GRANT';
COMMENT ON FUNCTION app.has_permission(text) IS
'มีสิทธิ์นี้ที่ scope ใดก็ได้ (รวม SYSTEM) หรือไม่ (ข้อ 9.3) · ใช้ใน policy ของ ref/tags/campaigns และการซ่อนปุ่ม';
COMMENT ON FUNCTION app.scope_branch_ids(text, core.data_scope) IS
'สาขาที่ผู้ใช้มีสิทธิ์นี้ที่ scope ≥ p_min_scope (ไม่นับ SYSTEM · ข้อ 9.3) · ว่าง = ''{}'' · '
'policy ใช้รูป col = ANY ((SELECT app.scope_branch_ids(...))::uuid[]) เพราะ PostgreSQL 17 ตีความ ANY (subquery) เป็นอย่างอื่น (rls-spec H1)';
COMMENT ON FUNCTION app.team_scope_pairs(text) IS
'คู่ (สาขา, สมาชิกทีม) ที่ผู้ใช้เป็นหัวหน้าทีมในสาขานั้นและสิทธิ์นี้เป็น scope TEAM (ข้อ 8.0 · 9.3) · '
'policy ใช้ (branch_id, owner_staff_id) IN (SELECT ... FROM app.team_scope_pairs(p)) เพื่อไม่ยุบคู่สาขา–ทีมข้ามสาขา';
COMMENT ON FUNCTION app.team_member_staff_ids(text) IS
'สมาชิกทีมทั้งหมดจาก app.team_scope_pairs (ไม่จับคู่สาขา · ข้อ 9.3) · ใช้ใน RPC/UI · policy ใช้ team_scope_pairs แทน';
COMMENT ON FUNCTION app.customer_ids_in_scope(text) IS
'ลูกค้าที่ผ่านสิทธิ์นี้ตามข้อ 8.0: G = ทั้งองค์กร · B = ลูกค้าที่เชื่อมสาขานั้น · T = เชื่อมสาขานั้นและ owner อยู่ในทีมที่ตนเป็นหัวหน้า · '
'O = เชื่อมสาขาที่มีสิทธิ์และ owner = ตน · "เชื่อมสาขา" = crm.customer_branches หรือ customers.first_branch_id (ข้อ 6.6)';
COMMENT ON FUNCTION app.readable_customer_ids() IS
'= app.customer_ids_in_scope(''customer.read'') (ข้อ 9.3) · ใช้เป็น read-through ของ visits · interactions · leads · opportunities · quotations · transaction_refs · notes (ข้อ 9.4)';
COMMENT ON FUNCTION app.can_access_record(text, uuid, uuid, uuid) IS
'ตัดสินแถวเดียวด้วยกติกาเดียวกับ policy (ข้อ 8.0) · ใช้ใน trigger และ RPC เท่านั้น ห้ามใช้ใน policy (ข้อ 9.3 · 9.4 ข้อ 2) · '
'lead.assign และ task.assign ที่ scope T รวมแถวที่ owner ว่างในสาขาที่ตนเป็นหัวหน้าทีม (ข้อ 8.0 · Q28)';
COMMENT ON FUNCTION app.can_access_customer(text, uuid) IS
'ตัดสินลูกค้ารายเดียว = p_customer_id ∈ app.customer_ids_in_scope(p_permission) (ข้อ 9.3) · ใช้ใน trigger และ RPC เท่านั้น';
COMMENT ON FUNCTION app.staff_has_branch_assignment(uuid, uuid) IS
'staff ที่ ACTIVE มี assignment ที่ยังมีผลในสาขานั้นหรือไม่ (ข้อ 7.1 · 9.3) · ไม่ดู aal ของบัญชีเป้าหมาย · บทบาทองค์กรไม่นับ · ใช้ตรวจ owner ใหม่ (ข้อ 9.4.2)';
COMMENT ON FUNCTION app.trg_stamp_row() IS
'trigger BEFORE INSERT/UPDATE ชื่อ trg_90_stamp_row ทุกตารางใน crm · core · audit ที่มี organization_id created_by updated_by ครบ (ข้อ 19.2 ข้อ 1) · '
'ทำงานเฉพาะ current_user = ''authenticated'' (ผู้ใช้เขียนตารางตรง) · INSERT ตั้ง organization_id/created_by/updated_by ทับค่าที่ส่งมา · UPDATE ตั้ง updated_by · '
'SECURITY INVOKER เพื่อให้ RPC/trigger DEFINER · งานระบบ · seed ตั้งค่าเอง';
COMMENT ON FUNCTION app.transition_denied(text) IS
'ยกข้อผิดพลาด SQLSTATE 42501 · MESSAGE = JCRM-Tnn · DETAIL อังกฤษ · HINT ภาษาไทยที่ UI แสดง (แคตตาล็อกข้อ 7.4 ของ rls-spec · ข้อ 9.1) · '
'ใช้ร่วมกันระหว่าง app.enforce_row_transition และ RPC ใน api';
COMMENT ON FUNCTION app.enforce_row_transition() IS
'trigger BEFORE INSERT OR UPDATE ชื่อ trg_10_enforce_transition บน crm.customers visits interactions leads opportunities quotations tasks (ข้อ 9.4.2) · '
'SECURITY INVOKER และข้ามเมื่อ current_user <> ''authenticated'' (service_role · งานระบบ · RPC/trigger DEFINER ตรวจเองตามข้อ 8 ของ rls-spec) · '
'UPDATE: ① ไม่มีคอลัมน์เปลี่ยน → ผ่าน ② คอลัมน์ที่เปลี่ยนต้องอยู่ในรายการ UPDATE grant (คอลัมน์ระบบ T01 · owner/ทีม/สาขา T13 · อื่น ๆ T14) ③ กติกาต่อตารางตามตาราง mapping ข้อ 7.3 ของ rls-spec · '
'INSERT: สถานะเริ่มต้นที่อนุญาตและ owner ที่ไม่ใช่ตนต้องมี *.assign + assignment ในสาขา';
COMMENT ON FUNCTION app.trg_guard_core_row() IS
'trigger trg_15_guard_core_row (SECURITY DEFINER): ห้ามลบแถว core.staff_role_assignments · core.staff_profiles · core.role_grant_requests (ข้อ 7.1–7.3) · '
'assignment แก้ได้เฉพาะ valid_to revoked_by revoke_reason และขยายเวลาที่ถอนแล้วไม่ได้ (เปิดใช้งานใหม่ = มอบบทบาทใหม่) · ข้ามเมื่อ app.is_seed_mode()';
COMMENT ON FUNCTION audit.trg_guard_export_request() IS
'trigger trg_12_guard_export_request (SECURITY DEFINER): audit.export_requests เป็นตาราง workflow (ข้อ 19.1 ข้อ 13) · ห้ามลบ · '
'INSERT ได้เฉพาะ REQUESTED หรือ APPROVED/REJECTED ที่ approved_by ว่างของ BRANCH_MANAGER หรือ REJECTED ที่เกินเพดาน (ข้อ 8.2) · '
'ข้อมูลตอนยื่นแก้ไม่ได้ · download_count ลดไม่ได้ · เปลี่ยนสถานะได้ตามเส้นทาง REQUESTED→APPROVED/REJECTED→GENERATED→DOWNLOADED→EXPIRED · ข้ามเมื่อ app.is_seed_mode()';
