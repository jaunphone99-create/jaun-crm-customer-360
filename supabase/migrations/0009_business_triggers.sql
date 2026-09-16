-- =====================================================================================
-- JAUN CRM · Customer 360
-- migration 0009 : trigger ของกติกาธุรกิจ
-- target        : Supabase PostgreSQL 17
--
-- ค่าอ้างอิง (docs/00-brief/CANONICAL.md v2.1):
--   ข้อ 3.2 first_seen_at · 3.4 lifecycle · 4.1 visit · 4.3 lead NEW → CONTACTED · 4.4 next action / expected_amount / QUOTATION
--   ข้อ 4.5 ประวัติสถานะ · 4.6 valid_until · 4.7 remind_at · 6.1 เลขอ้างอิง · 6.3 แคชของลูกค้า · 6.6 customer_branches
--   ข้อ 7.1 SYSTEM_ADMIN แยกบทบาท · สมาชิกทีม · 8.2 MARKETING ร่วม BUSINESS_ADMIN [Q22] · 9.6 รายชื่อ trigger · 10.1 เลขบัตรประชาชน
--
-- ข้อตกลงของไฟล์นี้:
--   · ทุกฟังก์ชัน trigger เป็น SECURITY DEFINER + SET search_path = '' และไม่ GRANT ให้ใคร
--     (DEFINER ทั้งตัวที่เขียนตารางอื่น และตัวที่เรียก helper ใน app — เพราะ 0001 ถอน EXECUTE ของฟังก์ชันใหม่จาก PUBLIC
--      ฟังก์ชันที่ถูกเรียกซ้อนจาก trigger แบบ INVOKER จะถูกตรวจสิทธิ์ EXECUTE ของ authenticated)
--   · งานที่ถูกข้ามเมื่อ app.bulk = 'on' (merge · seed · import ต้องทำเองท้ายงาน):
--       lifecycle refresh (ข้อ 3.4) · แคช last_* / has_* · lead NEW → CONTACTED · opportunity → QUOTATION · next-action task sync
--     ทำงานเสมอแม้ bulk: เลขอ้างอิง · ค่าเริ่มต้นของแถว · guard ข้อความ · first_seen_at least() · customer_branches · ประวัติสถานะ ·
--                        expected_amount · note_summary · กติกาบทบาท/ทีม
--   · ท้ายงาน bulk เรียก app.refresh_customer_activity(id) และ app.refresh_customer_lifecycle(id) ต่อลูกค้า
--   · ลำดับ trigger ในตารางเดียวกันเป็นไปตามชื่อ (BEFORE: trg_assign_running_number → trg_guard_restricted_text → trg_row_defaults → trg_touch_updated_at)
-- =====================================================================================


-- =====================================================================================
-- ส่วนที่ 1 — helper
-- =====================================================================================

CREATE FUNCTION app.is_bulk()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT coalesce(current_setting('app.bulk', true), '') = 'on'
$$;

COMMENT ON FUNCTION app.is_bulk() IS
'true เมื่อทรานแซกชันตั้ง set_config(''app.bulk'', ''on'', true) (merge/seed/import ข้อ 3.4 · 6.7 · 13.0) · trigger ที่คำนวณซ้ำต่อแถวจะข้าม แล้วผู้ทำงาน bulk refresh ครั้งเดียวต่อลูกค้าท้ายงาน';

CREATE FUNCTION app.setting_int(p_key text, p_default integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT coalesce((SELECT CASE WHEN jsonb_typeof(s.value) = 'number' THEN (s.value #>> '{}')::integer END
                     FROM app.settings s WHERE s.key = p_key), p_default)
$$;

COMMENT ON FUNCTION app.setting_int(text, integer) IS
'อ่านค่าตัวเลขจำนวนเต็มจาก app.settings (ข้อ 11.2) · ไม่มีคีย์หรือไม่ใช่ตัวเลข → p_default · ใช้ใน trigger (quotation.valid_days · sla.followup_remind_min)';

CREATE FUNCTION app.next_running_number(p_scope_key text)
RETURNS bigint
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
    INSERT INTO app.running_numbers (scope_key, last_value) VALUES (p_scope_key, 1)
    ON CONFLICT (scope_key) DO UPDATE SET last_value = app.running_numbers.last_value + 1
    RETURNING last_value
$$;

COMMENT ON FUNCTION app.next_running_number(text) IS
'ออกเลขถัดไปของตัวนับ (ข้อ 6.1) ด้วย upsert ตามข้อความใน CANONICAL · แถวตัวนับถูกล็อกจนจบทรานแซกชันจึงไม่ออกเลขซ้ำ · ไม่ GRANT (ใช้ใน trigger/RPC DEFINER)';

CREATE FUNCTION app.format_running_number(p_value bigint, p_width integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT CASE WHEN length(p_value::text) >= p_width THEN p_value::text
                ELSE lpad(p_value::text, p_width, '0') END
$$;

COMMENT ON FUNCTION app.format_running_number(bigint, integer) IS
'เติม 0 นำหน้าให้ครบ p_width หลัก และ "เกินหลักได้ไม่ตัด" (ข้อ 6.1) · ห้ามใช้ lpad ตรง ๆ เพราะ lpad(''1234567'', 6, ''0'') ตัดเหลือ 123456';

CREATE FUNCTION app.contains_thai_national_id(p_text text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
    m text[];
BEGIN
    IF p_text IS NULL THEN
        RETURN false;
    END IF;
    -- ตัวเลขไทย → อารบิก · หา 13 หลักติดกัน หรือรูป 1-4-5-2-1 ที่คั่นด้วยขีด/ช่องว่างครบทุกช่วง · ต้องไม่อยู่ติดตัวเลขอื่น (เช่น IMEI 15 หลัก)
    FOR m IN
        SELECT regexp_matches(
            translate(p_text, '๐๑๒๓๔๕๖๗๘๙', '0123456789'),
            '(?<![0-9])([0-9]{13}|[0-9]-[0-9]{4}-[0-9]{5}-[0-9]{2}-[0-9]|[0-9] [0-9]{4} [0-9]{5} [0-9]{2} [0-9])(?![0-9])',
            'g')
    LOOP
        IF app.is_thai_national_id(m[1]) THEN
            RETURN true;
        END IF;
    END LOOP;
    RETURN false;
END;
$$;

COMMENT ON FUNCTION app.contains_thai_national_id(text) IS
'true เมื่อข้อความมีเลขบัตรประชาชนไทย 13 หลักที่ checksum ถูกต้อง (ข้อ 10.1) · รูปที่ตรวจ: 13 หลักติดกัน · 1-2345-67890-12-1 · 1 2345 67890 12 1 (รวมเลขไทย) · '
'ชุดตัวเลขที่อยู่ติดตัวเลขอื่นไม่นับ · 13 หลักที่ checksum ผิดไม่นับ (เช่น เลขอ้างอิงอื่น)';


-- =====================================================================================
-- ส่วนที่ 2 — เลขอ้างอิง app.trg_assign_running_number (ข้อ 6.1)
-- =====================================================================================

CREATE FUNCTION app.trg_assign_running_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_table   text := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
    v_year    text;
    v_day     date;
    v_branch  text;
BEGIN
    IF v_table = 'crm.visits' THEN
        -- visit: วันจาก started_at · visit_no ทุกช่องทาง · queue_no เฉพาะ WALK_IN (ตัวนับแยกกัน ข้อ 4.1)
        v_day := app.bangkok_date(coalesce(NEW.started_at, now()));
        IF NEW.visit_no IS NULL OR (NEW.channel_code = 'WALK_IN' AND NEW.queue_no IS NULL) THEN
            SELECT b.code INTO v_branch FROM core.branches b WHERE b.id = NEW.branch_id;
            IF v_branch IS NULL THEN
                RAISE EXCEPTION 'ไม่พบสาขา % สำหรับออกเลข visit', NEW.branch_id USING ERRCODE = '23503';
            END IF;
        END IF;
        IF NEW.visit_no IS NULL THEN
            NEW.visit_no := 'V-' || v_branch || '-' || to_char(v_day, 'YYMMDD') || '-'
                || app.format_running_number(app.next_running_number('VISIT:' || v_branch || ':' || to_char(v_day, 'YYYYMMDD')), 3);
        END IF;
        IF NEW.channel_code = 'WALK_IN' AND NEW.queue_no IS NULL THEN
            NEW.queue_no := app.next_running_number('QUEUE:' || v_branch || ':' || to_char(v_day, 'YYYYMMDD'))::integer;
        END IF;
        RETURN NEW;
    END IF;

    IF v_table = 'core.staff_profiles' THEN
        IF NEW.staff_code IS NULL THEN
            NEW.staff_code := 'ST-' || app.format_running_number(app.next_running_number('ST'), 4);
        END IF;
        RETURN NEW;
    END IF;

    -- ตัวนับรายปี: ปี ค.ศ. ของ created_at ตาม Asia/Bangkok
    v_year := to_char(app.bangkok_date(coalesce(NEW.created_at, now())), 'YYYY');

    IF v_table = 'crm.customers' THEN
        IF NEW.customer_no IS NULL THEN
            NEW.customer_no := 'CUS-' || v_year || '-' || app.format_running_number(app.next_running_number('CUS:' || v_year), 6);
        END IF;
    ELSIF v_table = 'crm.leads' THEN
        IF NEW.lead_no IS NULL THEN
            NEW.lead_no := 'LD-' || v_year || '-' || app.format_running_number(app.next_running_number('LD:' || v_year), 6);
        END IF;
    ELSIF v_table = 'crm.opportunities' THEN
        IF NEW.opportunity_no IS NULL THEN
            NEW.opportunity_no := 'OP-' || v_year || '-' || app.format_running_number(app.next_running_number('OP:' || v_year), 6);
        END IF;
    ELSIF v_table = 'crm.quotations' THEN
        IF NEW.quotation_no IS NULL THEN
            NEW.quotation_no := 'QT-' || v_year || '-' || app.format_running_number(app.next_running_number('QT:' || v_year), 6);
        END IF;
    ELSIF v_table = 'crm.tasks' THEN
        IF NEW.task_no IS NULL THEN
            NEW.task_no := 'TK-' || v_year || '-' || app.format_running_number(app.next_running_number('TK:' || v_year), 6);
        END IF;
    ELSIF v_table = 'crm.customer_merges' THEN
        IF NEW.merge_no IS NULL THEN
            NEW.merge_no := 'MG-' || v_year || '-' || app.format_running_number(app.next_running_number('MG:' || v_year), 6);
        END IF;
    ELSIF v_table = 'crm.data_subject_requests' THEN
        IF NEW.request_no IS NULL THEN
            NEW.request_no := 'DSR-' || v_year || '-' || app.format_running_number(app.next_running_number('DSR:' || v_year), 6);
        END IF;
    ELSIF v_table = 'audit.export_requests' THEN
        IF NEW.export_no IS NULL THEN
            NEW.export_no := 'EX-' || v_year || '-' || app.format_running_number(app.next_running_number('EX:' || v_year), 6);
        END IF;
    ELSIF v_table = 'core.role_grant_requests' THEN
        IF NEW.request_no IS NULL THEN
            NEW.request_no := 'RG-' || v_year || '-' || app.format_running_number(app.next_running_number('RG:' || v_year), 4);
        END IF;
    ELSE
        RAISE EXCEPTION 'app.trg_assign_running_number: ไม่รองรับตาราง %', v_table;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION app.trg_assign_running_number() IS
'trigger BEFORE INSERT ออกเลขอ้างอิง (ข้อ 6.1 · 9.6) เมื่อแถวยังไม่มีเลข (seed/import ที่ใส่เลขเองไม่ถูกเขียนทับ และไม่เลื่อนตัวนับ): '
'CUS-/LD-/OP-/QT-/TK-/MG-/DSR-/EX-{YYYY}-{NNNNNN} · RG-{YYYY}-{NNNN} (ปีจาก created_at Asia/Bangkok) · ST-{NNNN} (ตัวนับ ST) · '
'visit: V-{branch}-{YYMMDD}-{NNN} ตัวนับ VISIT:{branch}:{YYYYMMDD} และ queue_no (WALK_IN) ตัวนับ QUEUE:{branch}:{YYYYMMDD} (วันจาก started_at) · '
'ตัวอย่าง created_at 2026-12-31T17:30:00Z = 1 ม.ค. 2027 00:30 น. Asia/Bangkok → CUS-2027-…';

CREATE TRIGGER trg_assign_running_number BEFORE INSERT ON crm.customers             FOR EACH ROW EXECUTE FUNCTION app.trg_assign_running_number();
CREATE TRIGGER trg_assign_running_number BEFORE INSERT ON crm.visits                FOR EACH ROW EXECUTE FUNCTION app.trg_assign_running_number();
CREATE TRIGGER trg_assign_running_number BEFORE INSERT ON crm.leads                 FOR EACH ROW EXECUTE FUNCTION app.trg_assign_running_number();
CREATE TRIGGER trg_assign_running_number BEFORE INSERT ON crm.opportunities         FOR EACH ROW EXECUTE FUNCTION app.trg_assign_running_number();
CREATE TRIGGER trg_assign_running_number BEFORE INSERT ON crm.quotations            FOR EACH ROW EXECUTE FUNCTION app.trg_assign_running_number();
CREATE TRIGGER trg_assign_running_number BEFORE INSERT ON crm.tasks                 FOR EACH ROW EXECUTE FUNCTION app.trg_assign_running_number();
CREATE TRIGGER trg_assign_running_number BEFORE INSERT ON crm.customer_merges       FOR EACH ROW EXECUTE FUNCTION app.trg_assign_running_number();
CREATE TRIGGER trg_assign_running_number BEFORE INSERT ON crm.data_subject_requests FOR EACH ROW EXECUTE FUNCTION app.trg_assign_running_number();
CREATE TRIGGER trg_assign_running_number BEFORE INSERT ON audit.export_requests     FOR EACH ROW EXECUTE FUNCTION app.trg_assign_running_number();
CREATE TRIGGER trg_assign_running_number BEFORE INSERT ON core.role_grant_requests  FOR EACH ROW EXECUTE FUNCTION app.trg_assign_running_number();
CREATE TRIGGER trg_assign_running_number BEFORE INSERT ON core.staff_profiles       FOR EACH ROW EXECUTE FUNCTION app.trg_assign_running_number();


-- =====================================================================================
-- ส่วนที่ 3 — ค่าเริ่มต้นของแถว app.trg_row_defaults (ข้อ 4.1 · 4.3 · 4.6 · 4.7)
-- =====================================================================================

CREATE FUNCTION app.trg_row_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_table     text := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
    v_is_live   boolean;
    v_remind    integer;
    v_customer  uuid;
    v_branch    uuid;
    v_owner     uuid;
BEGIN
    IF v_table = 'crm.visits' THEN
        -- LEFT → outcome LEFT_BEFORE_SERVICE อัตโนมัติ (ข้อ 4.1)
        IF NEW.status = 'LEFT' AND NEW.outcome_code IS NULL THEN
            NEW.outcome_code := 'LEFT_BEFORE_SERVICE';
        END IF;
        -- IN_SERVICE: เริ่มให้บริการ = started_at (สร้างที่สถานะนี้) หรือ now() (WAITING → IN_SERVICE)
        IF NEW.status = 'IN_SERVICE' AND NEW.service_started_at IS NULL THEN
            NEW.service_started_at := CASE WHEN TG_OP = 'INSERT' THEN NEW.started_at ELSE greatest(now(), NEW.started_at) END;
        END IF;

    ELSIF v_table = 'crm.leads' THEN
        IF TG_OP = 'INSERT' THEN
            -- lead ช่องทางสด (WALK_IN · PHONE) เริ่ม CONTACTED และ first_contacted_at = created_at (ข้อ 4.3)
            SELECT c.is_live INTO v_is_live FROM ref.channels c WHERE c.code = NEW.channel_code;
            IF coalesce(v_is_live, false) THEN
                IF NEW.status = 'NEW' THEN
                    NEW.status := 'CONTACTED';
                END IF;
                IF NEW.status IN ('CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST') AND NEW.first_contacted_at IS NULL THEN
                    NEW.first_contacted_at := NEW.created_at;
                END IF;
            END IF;
        ELSIF OLD.status = 'NEW' AND NEW.status IN ('CONTACTED', 'QUALIFIED') AND NEW.first_contacted_at IS NULL THEN
            -- เปลี่ยน NEW → CONTACTED/QUALIFIED ด้วยมือ = ตอบกลับครั้งแรก ณ เวลานี้
            NEW.first_contacted_at := greatest(now(), NEW.created_at);
        END IF;

    ELSIF v_table = 'crm.tasks' THEN
        -- ลูกค้าของงานที่ผูก lead/opportunity (ใช้กับป้าย "ติดตามอยู่")
        IF NEW.customer_id IS NULL AND NEW.lead_id IS NOT NULL THEN
            SELECT l.customer_id INTO NEW.customer_id FROM crm.leads l WHERE l.id = NEW.lead_id;
        ELSIF NEW.customer_id IS NULL AND NEW.opportunity_id IS NOT NULL THEN
            SELECT o.customer_id INTO NEW.customer_id FROM crm.opportunities o WHERE o.id = NEW.opportunity_id;
        END IF;
        -- remind_at ค่าเริ่มต้น = due_at − sla.followup_remind_min (15 นาที ข้อ 4.7 · 11.2) · เลื่อน due_at แล้วเลื่อน remind_at ตามถ้าไม่ได้แก้เอง
        v_remind := app.setting_int('sla.followup_remind_min', 15);
        IF TG_OP = 'INSERT' THEN
            IF NEW.remind_at IS NULL THEN
                NEW.remind_at := NEW.due_at - make_interval(mins => v_remind);
            END IF;
        ELSIF NEW.due_at IS DISTINCT FROM OLD.due_at AND NEW.remind_at IS NOT DISTINCT FROM OLD.remind_at THEN
            NEW.remind_at := NEW.due_at - make_interval(mins => v_remind);
        END IF;
        -- เวลาเสร็จ/ยกเลิกตามสถานะ (ข้อ 4.7)
        IF NEW.status = 'DONE' AND NEW.completed_at IS NULL THEN
            NEW.completed_at := now();
        END IF;
        IF NEW.status = 'CANCELLED' AND NEW.cancelled_at IS NULL THEN
            NEW.cancelled_at := now();
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.status = 'DONE' AND NEW.status <> 'DONE' THEN
            NEW.completed_at := NULL;
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.status = 'CANCELLED' AND NEW.status <> 'CANCELLED' THEN
            NEW.cancelled_at := NULL;
        END IF;

    ELSIF v_table = 'crm.quotations' THEN
        -- ลูกค้า สาขา ผู้จัดทำ = ของ opportunity แม่ เมื่อไม่ส่งมา (ข้อ 8.0 แถวลูกเท่าแถวแม่)
        IF TG_OP = 'INSERT' AND (NEW.customer_id IS NULL OR NEW.branch_id IS NULL OR NEW.owner_staff_id IS NULL) THEN
            SELECT o.customer_id, o.branch_id, o.owner_staff_id INTO v_customer, v_branch, v_owner
            FROM crm.opportunities o WHERE o.id = NEW.opportunity_id;
            NEW.customer_id    := coalesce(NEW.customer_id, v_customer);
            NEW.branch_id      := coalesce(NEW.branch_id, v_branch);
            NEW.owner_staff_id := coalesce(NEW.owner_staff_id, v_owner);
        END IF;
        -- ส่ง (DRAFT → SENT): sent_at = now() ถ้าไม่ส่งมา · valid_until = วันที่ส่ง + quotation.valid_days (ข้อ 4.6)
        IF NEW.status <> 'DRAFT' AND (TG_OP = 'INSERT' OR OLD.status = 'DRAFT') THEN
            NEW.sent_at := coalesce(NEW.sent_at, now());
            IF NEW.valid_until IS NULL THEN
                NEW.valid_until := app.bangkok_date(NEW.sent_at) + app.setting_int('quotation.valid_days', 7);
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION app.trg_row_defaults() IS
'trigger BEFORE INSERT/UPDATE เติมค่าที่ CANONICAL กำหนดให้เกิดอัตโนมัติ เพื่อให้แถวผ่าน CHECK: '
'visits: LEFT → outcome LEFT_BEFORE_SERVICE · IN_SERVICE → service_started_at (สร้าง = started_at · รับคิว = now()) (ข้อ 4.1) · '
'leads: ช่องทาง is_live สร้างเป็น NEW → CONTACTED + first_contacted_at = created_at · เปลี่ยน NEW → CONTACTED/QUALIFIED ด้วยมือ → first_contacted_at = now() (ข้อ 4.3) · '
'tasks: customer_id จาก lead/opportunity · remind_at = due_at − sla.followup_remind_min · completed_at/cancelled_at ตามสถานะ (ข้อ 4.7) · '
'quotations: customer_id/branch_id/owner จาก opportunity · ส่งแล้ว sent_at = now() และ valid_until = วันที่ส่ง (Asia/Bangkok) + quotation.valid_days (ข้อ 4.6) · '
'หมายเหตุผู้เขียน: ไม่ได้อยู่ในรายชื่อ trigger ข้อ 9.6 แต่เป็นกลไกของกติกาที่ CANONICAL เขียนว่า "อัตโนมัติ/ค่าเริ่มต้น"';

CREATE TRIGGER trg_row_defaults BEFORE INSERT OR UPDATE ON crm.visits     FOR EACH ROW EXECUTE FUNCTION app.trg_row_defaults();
CREATE TRIGGER trg_row_defaults BEFORE INSERT OR UPDATE ON crm.leads      FOR EACH ROW EXECUTE FUNCTION app.trg_row_defaults();
CREATE TRIGGER trg_row_defaults BEFORE INSERT OR UPDATE ON crm.tasks      FOR EACH ROW EXECUTE FUNCTION app.trg_row_defaults();
CREATE TRIGGER trg_row_defaults BEFORE INSERT OR UPDATE ON crm.quotations FOR EACH ROW EXECUTE FUNCTION app.trg_row_defaults();


-- =====================================================================================
-- ส่วนที่ 4 — app.trg_guard_restricted_text (ข้อ 10.1)
-- =====================================================================================

CREATE FUNCTION app.trg_guard_restricted_text()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_new   jsonb := to_jsonb(NEW);
    v_old   jsonb;
    v_col   text;
    v_text  text;
    i       integer;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        v_old := to_jsonb(OLD);
    END IF;
    FOR i IN 0 .. TG_NARGS - 1 LOOP
        v_col  := TG_ARGV[i];
        v_text := v_new ->> v_col;
        CONTINUE WHEN v_text IS NULL;
        -- UPDATE ตรวจเฉพาะคอลัมน์ที่เปลี่ยน (แก้คอลัมน์อื่นของแถวเดิมได้เสมอ)
        CONTINUE WHEN TG_OP = 'UPDATE' AND v_text IS NOT DISTINCT FROM (v_old ->> v_col);
        IF app.contains_thai_national_id(v_text) THEN
            RAISE EXCEPTION 'ห้ามบันทึกเลขบัตรประชาชนในข้อความ (%.%.%)', TG_TABLE_SCHEMA, TG_TABLE_NAME, v_col
                USING ERRCODE = '23514',
                      HINT = 'ห้ามบันทึกเลขบัตรประชาชน รายได้ ข้อมูลสุขภาพหรือศาสนา (ข้อ 6.9 · 10.1)',
                      SCHEMA = TG_TABLE_SCHEMA, TABLE = TG_TABLE_NAME, COLUMN = v_col;
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION app.trg_guard_restricted_text() IS
'trigger BEFORE INSERT/UPDATE ปฏิเสธข้อความอิสระที่มีเลขบัตรประชาชนไทย 13 หลัก checksum ถูกต้อง (ข้อ 10.1 · SQLSTATE 23514) · '
'ชื่อคอลัมน์ที่ตรวจส่งเป็น argument ของ trigger · UPDATE ตรวจเฉพาะคอลัมน์ที่ค่าเปลี่ยน · การตรวจรูปแบบอยู่ใน app.contains_thai_national_id';

CREATE TRIGGER trg_guard_restricted_text BEFORE INSERT OR UPDATE ON crm.customer_notes FOR EACH ROW EXECUTE FUNCTION app.trg_guard_restricted_text('body');
CREATE TRIGGER trg_guard_restricted_text BEFORE INSERT OR UPDATE ON crm.interactions   FOR EACH ROW EXECUTE FUNCTION app.trg_guard_restricted_text('summary');
CREATE TRIGGER trg_guard_restricted_text BEFORE INSERT OR UPDATE ON crm.tasks          FOR EACH ROW EXECUTE FUNCTION app.trg_guard_restricted_text('title', 'description');
CREATE TRIGGER trg_guard_restricted_text BEFORE INSERT OR UPDATE ON crm.task_comments  FOR EACH ROW EXECUTE FUNCTION app.trg_guard_restricted_text('body');
CREATE TRIGGER trg_guard_restricted_text BEFORE INSERT OR UPDATE ON crm.leads          FOR EACH ROW EXECUTE FUNCTION app.trg_guard_restricted_text('next_action', 'lost_note');
CREATE TRIGGER trg_guard_restricted_text BEFORE INSERT OR UPDATE ON crm.opportunities  FOR EACH ROW EXECUTE FUNCTION app.trg_guard_restricted_text('next_action', 'lost_note');
CREATE TRIGGER trg_guard_restricted_text BEFORE INSERT OR UPDATE ON crm.quotations     FOR EACH ROW EXECUTE FUNCTION app.trg_guard_restricted_text('terms_note');


-- =====================================================================================
-- ส่วนที่ 5 — กติกาบทบาทและทีม (ข้อ 7.1 · 8.2)
-- =====================================================================================

CREATE FUNCTION app.trg_check_role_exclusivity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_conflict text;
BEGIN
    -- การถอน (ตั้ง/ร่น valid_to) ไม่สร้างการถือซ้อนใหม่ · ช่วงว่าง (valid_to = valid_from) ไม่มีผล
    IF TG_OP = 'UPDATE'
       AND NEW.staff_id = OLD.staff_id AND NEW.role_code = OLD.role_code AND NEW.valid_from = OLD.valid_from
       AND NEW.valid_to IS NOT NULL AND (OLD.valid_to IS NULL OR NEW.valid_to <= OLD.valid_to) THEN
        RETURN NEW;
    END IF;
    IF NEW.valid_to IS NOT NULL AND NEW.valid_to <= NEW.valid_from THEN
        RETURN NEW;
    END IF;

    -- ล็อกแถวพนักงานก่อนตรวจ เพื่อไม่ให้สองทรานแซกชันมอบบทบาทที่ขัดกันพร้อมกัน (ข้อ 7.1)
    PERFORM 1 FROM core.staff_profiles s WHERE s.id = NEW.staff_id FOR UPDATE;

    SELECT a.role_code INTO v_conflict
    FROM core.staff_role_assignments a
    WHERE a.staff_id = NEW.staff_id
      AND a.id <> NEW.id
      AND a.valid_from < coalesce(NEW.valid_to, 'infinity'::timestamptz)
      AND NEW.valid_from < coalesce(a.valid_to, 'infinity'::timestamptz)
      AND a.valid_to IS DISTINCT FROM a.valid_from
      AND ((NEW.role_code = 'SYSTEM_ADMIN') <> (a.role_code = 'SYSTEM_ADMIN'))
    LIMIT 1;
    IF v_conflict IS NOT NULL THEN
        RAISE EXCEPTION 'SYSTEM_ADMIN ห้ามถือร่วมกับบทบาทธุรกิจในบัญชีเดียว (มี % ซ้อนช่วงเวลา · ข้อ 7.1)', v_conflict
            USING ERRCODE = '23514';
    END IF;

    SELECT a.role_code INTO v_conflict
    FROM core.staff_role_assignments a
    WHERE a.staff_id = NEW.staff_id
      AND a.id <> NEW.id
      AND a.valid_from < coalesce(NEW.valid_to, 'infinity'::timestamptz)
      AND NEW.valid_from < coalesce(a.valid_to, 'infinity'::timestamptz)
      AND a.valid_to IS DISTINCT FROM a.valid_from
      AND ((NEW.role_code = 'MARKETING' AND a.role_code = 'BUSINESS_ADMIN')
           OR (NEW.role_code = 'BUSINESS_ADMIN' AND a.role_code = 'MARKETING'))
    LIMIT 1;
    IF v_conflict IS NOT NULL THEN
        RAISE EXCEPTION 'ห้ามถือ MARKETING ร่วมกับ BUSINESS_ADMIN ในบัญชีเดียว (ข้อ 8.2 · [รอยืนยัน Q22])'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION app.trg_check_role_exclusivity() IS
'trigger BEFORE INSERT/UPDATE ของ core.staff_role_assignments: SELECT … FOR UPDATE แถว core.staff_profiles แล้วปฏิเสธ (23514) เมื่อช่วงเวลามีผลซ้อนกับ assignment อื่นของคนเดียวกันที่ '
'(1) ฝั่งหนึ่งเป็น SYSTEM_ADMIN อีกฝั่งเป็นบทบาทธุรกิจ (ข้อ 7.1) (2) MARKETING กับ BUSINESS_ADMIN (ข้อ 8.2 · [รอยืนยัน Q22]) · '
'ช่วงเวลา [valid_from, coalesce(valid_to, ∞)) · การถอนที่ร่น valid_to ไม่ถูกตรวจ';

CREATE TRIGGER trg_check_role_exclusivity BEFORE INSERT OR UPDATE ON core.staff_role_assignments
    FOR EACH ROW EXECUTE FUNCTION app.trg_check_role_exclusivity();

CREATE FUNCTION app.trg_check_team_member_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- ตรวจเมื่อเกิดสมาชิกภาพที่มีผลใหม่: INSERT · เปลี่ยนทีม/คน · เปิด valid_to กลับเป็นว่าง
    IF TG_OP = 'UPDATE' AND NEW.team_id = OLD.team_id AND NEW.staff_id = OLD.staff_id
       AND NOT (OLD.valid_to IS NOT NULL AND NEW.valid_to IS NULL) THEN
        RETURN NEW;
    END IF;
    IF NEW.valid_to IS NOT NULL AND NEW.valid_to <= now() THEN
        RETURN NEW;                                     -- แถวประวัติที่สิ้นสุดแล้ว
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM core.teams t
        JOIN core.staff_role_assignments a ON a.branch_id = t.branch_id
        WHERE t.id = NEW.team_id
          AND a.staff_id = NEW.staff_id
          AND (a.valid_to IS NULL OR a.valid_to > now())
    ) THEN
        RAISE EXCEPTION 'สมาชิกทีมต้องมีบทบาทที่ยังมีผลในสาขาของทีม (ข้อ 7.1)'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION app.trg_check_team_member_assignment() IS
'trigger BEFORE INSERT/UPDATE ของ core.team_members: สมาชิก (รวมหัวหน้า) ต้องมี staff_role_assignments ที่ยังไม่สิ้นสุดในสาขาของทีม (ข้อ 7.1 "สมาชิกต้องมี assignment ในสาขาของทีม") · '
'หมายเหตุผู้เขียน: กติกา "SUPERVISOR@สาขา X ใช้ได้เมื่อเป็น is_leader ของทีมในสาขา X" เป็นเงื่อนไขตอนประเมินสิทธิ์ (helper ข้อ 9.3) ไม่บังคับตอนมอบบทบาท '
'เพราะลำดับที่ CANONICAL กำหนดคือ มอบบทบาทตอนเชิญ (ข้อ 7.3) → เพิ่มเป็นสมาชิก/หัวหน้าทีม (ต้องมี assignment ก่อน)';

CREATE TRIGGER trg_check_team_member_assignment BEFORE INSERT OR UPDATE ON core.team_members
    FOR EACH ROW EXECUTE FUNCTION app.trg_check_team_member_assignment();


-- =====================================================================================
-- ส่วนที่ 6 — กิจกรรมของลูกค้า: first_seen_at · แคช last_* / has_* (ข้อ 3.1 · 3.2 · 3.5 · 6.3)
-- =====================================================================================

CREATE FUNCTION app.customer_activity_events(p_customer_id uuid)
RETURNS TABLE (occurred_at timestamptz, branch_id uuid, channel_code text, source_code text, kind text, kind_order integer, row_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT v.started_at, v.branch_id, v.channel_code, v.source_code, 'VISIT', 1, v.id
    FROM crm.visits v WHERE v.customer_id = p_customer_id AND v.status <> 'CANCELLED'
    UNION ALL
    SELECT i.occurred_at, i.branch_id, i.channel_code, NULL, 'INTERACTION', 2, i.id
    FROM crm.interactions i WHERE i.customer_id = p_customer_id
    UNION ALL
    SELECT l.created_at, l.branch_id, l.channel_code, l.source_code, 'LEAD', 3, l.id
    FROM crm.leads l WHERE l.customer_id = p_customer_id
    UNION ALL
    SELECT o.created_at, o.branch_id, o.origin_channel_code, NULL, 'OPPORTUNITY', 4, o.id
    FROM crm.opportunities o WHERE o.customer_id = p_customer_id
    UNION ALL
    SELECT o.closed_at, o.branch_id, NULL, NULL, 'OPPORTUNITY_CLOSED', 5, o.id
    FROM crm.opportunities o WHERE o.customer_id = p_customer_id AND o.closed_at IS NOT NULL
    UNION ALL
    SELECT t.transacted_at, t.branch_id, NULL, NULL, 'TRANSACTION', 6, t.id
    FROM crm.transaction_refs t WHERE t.customer_id = p_customer_id
$$;

COMMENT ON FUNCTION app.customer_activity_events(uuid) IS
'activity event ของลูกค้ารายเดียวตามข้อ 3.1: visits.started_at (ไม่นับ CANCELLED) · interactions.occurred_at · leads.created_at · opportunities.created_at · opportunities.closed_at · '
'transaction_refs.transacted_at · นิยามเดียวกับ view analytics.customer_activity (stage 3) · kind_order ใช้ตัดสินลำดับเมื่อเวลาเท่ากัน';

CREATE FUNCTION app.refresh_customer_activity(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_first_at       timestamptz;
    v_first_branch   uuid;
    v_first_channel  text;
    v_first_source   text;
    v_last_at        timestamptz;
    v_last_branch    uuid;
    v_last_channel   text;
    v_followup       boolean;
    v_new_lead       boolean;
BEGIN
    IF p_customer_id IS NULL THEN
        RETURN;
    END IF;

    SELECT e.occurred_at, e.branch_id, e.channel_code, e.source_code
      INTO v_first_at, v_first_branch, v_first_channel, v_first_source
    FROM app.customer_activity_events(p_customer_id) e
    ORDER BY e.occurred_at, e.kind_order, e.row_id
    LIMIT 1;

    SELECT e.occurred_at, e.branch_id INTO v_last_at, v_last_branch
    FROM app.customer_activity_events(p_customer_id) e
    ORDER BY e.occurred_at DESC, e.kind_order, e.row_id DESC
    LIMIT 1;

    SELECT i.channel_code INTO v_last_channel
    FROM crm.interactions i
    WHERE i.customer_id = p_customer_id AND i.direction <> 'INTERNAL'
    ORDER BY i.occurred_at DESC, i.created_at DESC, i.id DESC
    LIMIT 1;

    v_followup := EXISTS (SELECT 1 FROM crm.tasks t
                          WHERE t.customer_id = p_customer_id AND t.task_type_code = 'FOLLOW_UP'
                            AND t.status IN ('OPEN', 'IN_PROGRESS'));
    v_new_lead := EXISTS (SELECT 1 FROM crm.leads l
                          WHERE l.customer_id = p_customer_id AND l.status = 'NEW');

    -- first_seen_at ลดลงได้อย่างเดียว (least) และ first_* ตามกิจกรรมแรกนั้น (ข้อ 3.2)
    UPDATE crm.customers c
    SET first_seen_at      = v_first_at,
        first_branch_id    = coalesce(v_first_branch, c.first_branch_id),
        first_channel_code = coalesce(v_first_channel, c.first_channel_code),
        first_source_code  = coalesce(v_first_source, c.first_source_code)
    WHERE c.id = p_customer_id AND v_first_at IS NOT NULL AND c.first_seen_at > v_first_at;

    -- แคชของข้อ 6.3 (ไม่มีกิจกรรมที่คำนวณได้ → คงค่าเดิม เช่น ข้อมูลนำเข้า)
    UPDATE crm.customers c
    SET last_activity_at  = coalesce(v_last_at, c.last_activity_at),
        last_branch_id    = CASE WHEN v_last_at IS NOT NULL THEN v_last_branch ELSE c.last_branch_id END,
        last_channel_code = coalesce(v_last_channel, c.last_channel_code),
        has_open_followup = v_followup,
        has_new_lead      = v_new_lead
    WHERE c.id = p_customer_id
      AND (c.last_activity_at IS DISTINCT FROM coalesce(v_last_at, c.last_activity_at)
           OR c.last_branch_id IS DISTINCT FROM CASE WHEN v_last_at IS NOT NULL THEN v_last_branch ELSE c.last_branch_id END
           OR c.last_channel_code IS DISTINCT FROM coalesce(v_last_channel, c.last_channel_code)
           OR c.has_open_followup IS DISTINCT FROM v_followup
           OR c.has_new_lead IS DISTINCT FROM v_new_lead);
END;
$$;

COMMENT ON FUNCTION app.refresh_customer_activity(uuid) IS
'คำนวณแคชของลูกค้าจากข้อเท็จจริง (ข้อ 3.2 · 3.5 · 6.3): first_seen_at = least(เดิม, กิจกรรมแรก) พร้อม first_branch_id/first_channel_code/first_source_code ของกิจกรรมนั้น (หมายเหตุผู้เขียน: ปรับ first_* เฉพาะเมื่อ first_seen_at ลดลง) · '
'last_activity_at/last_branch_id = กิจกรรมล่าสุด · last_channel_code = interaction ล่าสุดที่ไม่ใช่ INTERNAL · has_open_followup = มี task FOLLOW_UP OPEN/IN_PROGRESS · has_new_lead = มี lead NEW · '
'UPDATE เฉพาะเมื่อค่าเปลี่ยน · เรียกโดย app.trg_touch_customer_activity และผู้ทำงาน bulk (merge/seed/import) ครั้งเดียวต่อลูกค้าท้ายงาน · ไม่ GRANT';

CREATE FUNCTION app.trg_touch_customer_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_new       jsonb;
    v_old       jsonb;
    v_cols      text[];
    v_old_cust  uuid;
    v_new_cust  uuid;
    v_at        timestamptz;
BEGIN
    v_cols := CASE TG_TABLE_NAME
        WHEN 'visits'           THEN ARRAY['customer_id', 'started_at', 'status', 'branch_id', 'channel_code', 'source_code']
        WHEN 'interactions'     THEN ARRAY['customer_id', 'occurred_at', 'branch_id', 'channel_code', 'direction']
        WHEN 'leads'            THEN ARRAY['customer_id', 'created_at', 'status', 'branch_id', 'channel_code', 'source_code']
        WHEN 'opportunities'    THEN ARRAY['customer_id', 'created_at', 'closed_at', 'branch_id', 'origin_channel_code']
        WHEN 'transaction_refs' THEN ARRAY['customer_id', 'transacted_at', 'branch_id']
        WHEN 'tasks'            THEN ARRAY['customer_id', 'status', 'task_type_code']
    END;

    IF TG_OP IN ('INSERT', 'UPDATE') THEN v_new := to_jsonb(NEW); v_new_cust := (v_new ->> 'customer_id')::uuid; END IF;
    IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old := to_jsonb(OLD); v_old_cust := (v_old ->> 'customer_id')::uuid; END IF;

    IF TG_OP = 'UPDATE' AND NOT EXISTS (
        SELECT 1 FROM unnest(v_cols) AS k WHERE (v_new -> k) IS DISTINCT FROM (v_old -> k)) THEN
        RETURN NULL;
    END IF;

    IF app.is_bulk() THEN
        -- bulk: ทำเฉพาะ first_seen_at = least(first_seen_at, เวลาเหตุการณ์) ของแถวใหม่ (invariant ข้อ 3.2)
        IF v_new_cust IS NOT NULL THEN
            v_at := CASE TG_TABLE_NAME
                WHEN 'visits'           THEN CASE WHEN v_new ->> 'status' <> 'CANCELLED' THEN (v_new ->> 'started_at')::timestamptz END
                WHEN 'interactions'     THEN (v_new ->> 'occurred_at')::timestamptz
                WHEN 'leads'            THEN (v_new ->> 'created_at')::timestamptz
                WHEN 'opportunities'    THEN (v_new ->> 'created_at')::timestamptz
                WHEN 'transaction_refs' THEN (v_new ->> 'transacted_at')::timestamptz
            END;
            IF v_at IS NOT NULL THEN
                UPDATE crm.customers c
                SET first_seen_at      = v_at,
                    first_branch_id    = coalesce((v_new ->> 'branch_id')::uuid, c.first_branch_id),
                    first_channel_code = coalesce(v_new ->> 'channel_code', v_new ->> 'origin_channel_code', c.first_channel_code),
                    first_source_code  = coalesce(v_new ->> 'source_code', c.first_source_code)
                WHERE c.id = v_new_cust AND c.first_seen_at > v_at;
            END IF;
        END IF;
        RETURN NULL;
    END IF;

    PERFORM app.refresh_customer_activity(v_new_cust);
    IF v_old_cust IS DISTINCT FROM v_new_cust THEN
        PERFORM app.refresh_customer_activity(v_old_cust);
    END IF;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION app.trg_touch_customer_activity() IS
'trigger AFTER INSERT/UPDATE/DELETE ของ visits interactions leads opportunities transaction_refs tasks (ข้อ 3.2 · 6.3 · 9.6): '
'เมื่อคอลัมน์ที่มีผลเปลี่ยน (ลูกค้า เวลา สถานะ สาขา ช่องทาง) เรียก app.refresh_customer_activity ของลูกค้าใหม่และลูกค้าเดิม (กรณีย้าย customer_id) · '
'app.bulk = on: ทำเฉพาะ first_seen_at = least(…) ของแถวใหม่ แคชอื่นให้ผู้ทำงาน bulk refresh เอง';

CREATE TRIGGER trg_touch_customer_activity AFTER INSERT OR UPDATE OR DELETE ON crm.visits           FOR EACH ROW EXECUTE FUNCTION app.trg_touch_customer_activity();
CREATE TRIGGER trg_touch_customer_activity AFTER INSERT OR UPDATE OR DELETE ON crm.interactions     FOR EACH ROW EXECUTE FUNCTION app.trg_touch_customer_activity();
CREATE TRIGGER trg_touch_customer_activity AFTER INSERT OR UPDATE OR DELETE ON crm.leads            FOR EACH ROW EXECUTE FUNCTION app.trg_touch_customer_activity();
CREATE TRIGGER trg_touch_customer_activity AFTER INSERT OR UPDATE OR DELETE ON crm.opportunities    FOR EACH ROW EXECUTE FUNCTION app.trg_touch_customer_activity();
CREATE TRIGGER trg_touch_customer_activity AFTER INSERT OR UPDATE OR DELETE ON crm.transaction_refs FOR EACH ROW EXECUTE FUNCTION app.trg_touch_customer_activity();
CREATE TRIGGER trg_touch_customer_activity AFTER INSERT OR UPDATE OR DELETE ON crm.tasks            FOR EACH ROW EXECUTE FUNCTION app.trg_touch_customer_activity();


-- =====================================================================================
-- ส่วนที่ 7 — app.trg_link_customer_branch (ข้อ 6.6)
-- =====================================================================================

CREATE FUNCTION app.trg_link_customer_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_new  jsonb := to_jsonb(NEW);
    v_at   timestamptz;
    v_via  crm.customer_link_via;
BEGIN
    IF NEW.customer_id IS NULL THEN
        RETURN NULL;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id THEN
        RETURN NULL;
    END IF;
    IF TG_TABLE_NAME = 'visits' AND v_new ->> 'status' = 'CANCELLED' THEN
        RETURN NULL;                                       -- visit ที่สร้างผิดไม่ใช้ผูกสาขา
    END IF;

    v_at := CASE TG_TABLE_NAME
        WHEN 'visits'           THEN (v_new ->> 'started_at')::timestamptz
        WHEN 'interactions'     THEN (v_new ->> 'occurred_at')::timestamptz
        WHEN 'leads'            THEN (v_new ->> 'created_at')::timestamptz
        WHEN 'opportunities'    THEN (v_new ->> 'created_at')::timestamptz
        WHEN 'transaction_refs' THEN (v_new ->> 'transacted_at')::timestamptz
    END;
    v_via := CASE TG_TABLE_NAME
        WHEN 'visits'           THEN 'VISIT'
        WHEN 'interactions'     THEN 'INTERACTION'
        WHEN 'leads'            THEN 'LEAD'
        WHEN 'opportunities'    THEN 'OPPORTUNITY'
        WHEN 'transaction_refs' THEN 'MANUAL_LINK'         -- หมายเหตุผู้เขียน: crm.customer_link_via ไม่มีค่าสำหรับ transaction ref (V1 ผูกด้วยมือ)
    END::crm.customer_link_via;

    INSERT INTO crm.customer_branches AS cb (organization_id, customer_id, branch_id, first_linked_at, last_activity_at, linked_via, created_by)
    VALUES (NEW.organization_id, NEW.customer_id, NEW.branch_id, v_at, v_at, v_via, app.current_staff_id())
    ON CONFLICT (customer_id, branch_id) DO UPDATE
        SET first_linked_at  = least(cb.first_linked_at, EXCLUDED.first_linked_at),
            last_activity_at = greatest(cb.last_activity_at, EXCLUDED.last_activity_at)
        WHERE cb.first_linked_at > EXCLUDED.first_linked_at
           OR cb.last_activity_at IS NULL
           OR cb.last_activity_at < EXCLUDED.last_activity_at;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION app.trg_link_customer_branch() IS
'trigger AFTER INSERT / UPDATE OF customer_id, branch_id ของ visits interactions leads opportunities transaction_refs (ข้อ 6.6 · 9.6): upsert crm.customer_branches '
'(first_linked_at = least · last_activity_at = greatest ของเวลาเหตุการณ์) · linked_via ตามตาราง VISIT INTERACTION LEAD OPPORTUNITY · transaction_refs ใช้ MANUAL_LINK · '
'visit CANCELLED ไม่ผูก · การกันผูกลูกค้าที่มองไม่เห็นอยู่ที่ WITH CHECK ของ RLS (stage 3) · ทำงานแม้ app.bulk = on';

CREATE TRIGGER trg_link_customer_branch AFTER INSERT OR UPDATE OF customer_id, branch_id ON crm.visits           FOR EACH ROW EXECUTE FUNCTION app.trg_link_customer_branch();
CREATE TRIGGER trg_link_customer_branch AFTER INSERT OR UPDATE OF customer_id, branch_id ON crm.interactions     FOR EACH ROW EXECUTE FUNCTION app.trg_link_customer_branch();
CREATE TRIGGER trg_link_customer_branch AFTER INSERT OR UPDATE OF customer_id, branch_id ON crm.leads            FOR EACH ROW EXECUTE FUNCTION app.trg_link_customer_branch();
CREATE TRIGGER trg_link_customer_branch AFTER INSERT OR UPDATE OF customer_id, branch_id ON crm.opportunities    FOR EACH ROW EXECUTE FUNCTION app.trg_link_customer_branch();
CREATE TRIGGER trg_link_customer_branch AFTER INSERT OR UPDATE OF customer_id, branch_id ON crm.transaction_refs FOR EACH ROW EXECUTE FUNCTION app.trg_link_customer_branch();


-- =====================================================================================
-- ส่วนที่ 8 — lifecycle (ข้อ 3.1 · 3.4)
-- =====================================================================================

CREATE FUNCTION app.customer_purchase_count(p_customer_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT (SELECT count(*) FROM crm.opportunities o
            WHERE o.customer_id = p_customer_id AND o.stage = 'WON')
         + (SELECT count(*) FROM crm.transaction_refs t
            JOIN ref.transaction_types tt ON tt.code = t.transaction_type_code
            LEFT JOIN crm.opportunities o ON o.id = t.opportunity_id
            WHERE t.customer_id = p_customer_id
              AND tt.counts_as_purchase
              AND (t.opportunity_id IS NULL OR o.stage <> 'WON'))
$$;

COMMENT ON FUNCTION app.customer_purchase_count(uuid) IS
'จำนวนเหตุการณ์การซื้อตลอดอายุ (ข้อ 3.1): opportunity WON + transaction_refs ที่ ref.transaction_types.counts_as_purchase และ (ไม่ผูก opportunity หรือ opportunity นั้นไม่ใช่ WON) · '
'ref ที่ผูก opportunity WON นับเป็นครั้งเดียวกับ opportunity · "ซื้อ N ครั้ง" ของ Customer 360 (ข้อ 3.3)';

CREATE FUNCTION app.refresh_customer_lifecycle(p_customer_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_purchases  bigint;
    v_stage      text;
BEGIN
    IF p_customer_id IS NULL THEN
        RETURN NULL;
    END IF;
    -- ล็อกแถวลูกค้าก่อนคำนวณ (ข้อ 3.4)
    PERFORM 1 FROM crm.customers WHERE id = p_customer_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    v_purchases := app.customer_purchase_count(p_customer_id);
    v_stage := CASE
        WHEN v_purchases >= 2 THEN 'REPEAT'
        WHEN v_purchases = 1  THEN 'CUSTOMER'
        WHEN EXISTS (SELECT 1 FROM crm.opportunities o WHERE o.customer_id = p_customer_id AND o.stage IN ('INTERESTED', 'QUOTATION', 'FOLLOW_UP'))
            THEN 'OPPORTUNITY'
        WHEN EXISTS (SELECT 1 FROM crm.leads l WHERE l.customer_id = p_customer_id AND l.status IN ('NEW', 'CONTACTED', 'QUALIFIED'))
            THEN 'LEAD'
        WHEN EXISTS (SELECT 1 FROM crm.leads l WHERE l.customer_id = p_customer_id AND l.status = 'LOST')
          OR EXISTS (SELECT 1 FROM crm.opportunities o WHERE o.customer_id = p_customer_id AND o.stage = 'LOST')
            THEN 'LOST'
        ELSE 'IDENTIFIED'
    END;

    UPDATE crm.customers SET lifecycle_stage = v_stage
    WHERE id = p_customer_id AND lifecycle_stage IS DISTINCT FROM v_stage;
    RETURN v_stage;
END;
$$;

COMMENT ON FUNCTION app.refresh_customer_lifecycle(uuid) IS
'คำนวณ crm.customers.lifecycle_stage ตามลำดับตรวจของข้อ 3.4: REPEAT (ซื้อ ≥ 2) → CUSTOMER (= 1) → OPPORTUNITY (มี opportunity เปิด) → LEAD (มี lead เปิด) → LOST (มี lead/opportunity LOST) → IDENTIFIED · '
'ล็อกแถวลูกค้า FOR UPDATE ก่อน แล้ว UPDATE เมื่อ IS DISTINCT FROM · คืนค่าที่คำนวณ · เรียกจาก app.trg_refresh_lifecycle และท้ายงาน bulk (merge/seed/import) · ไม่ GRANT';

CREATE FUNCTION app.trg_refresh_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF app.is_bulk() THEN
        RETURN NULL;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        PERFORM app.refresh_customer_lifecycle(NEW.customer_id);
    END IF;
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id) THEN
        PERFORM app.refresh_customer_lifecycle(OLD.customer_id);
    END IF;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION app.trg_refresh_lifecycle() IS
'trigger AFTER ROW แยกตาม event (ข้อ 3.4 ห้าม transition table หลาย event) บน leads (status) opportunities (stage) transaction_refs (ประเภท/ลูกค้า/opportunity): '
'refresh lifecycle ของลูกค้าใหม่และลูกค้าเดิม · ข้ามเมื่อ app.bulk = on';

CREATE TRIGGER trg_refresh_lifecycle_ins AFTER INSERT ON crm.leads FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_lifecycle();
CREATE TRIGGER trg_refresh_lifecycle_upd AFTER UPDATE OF status, customer_id ON crm.leads FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_lifecycle();
CREATE TRIGGER trg_refresh_lifecycle_del AFTER DELETE ON crm.leads FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_lifecycle();
CREATE TRIGGER trg_refresh_lifecycle_ins AFTER INSERT ON crm.opportunities FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_lifecycle();
CREATE TRIGGER trg_refresh_lifecycle_upd AFTER UPDATE OF stage, customer_id ON crm.opportunities FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_lifecycle();
CREATE TRIGGER trg_refresh_lifecycle_del AFTER DELETE ON crm.opportunities FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_lifecycle();
CREATE TRIGGER trg_refresh_lifecycle_ins AFTER INSERT ON crm.transaction_refs FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_lifecycle();
CREATE TRIGGER trg_refresh_lifecycle_upd AFTER UPDATE OF customer_id, transaction_type_code, opportunity_id ON crm.transaction_refs FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_lifecycle();
CREATE TRIGGER trg_refresh_lifecycle_del AFTER DELETE ON crm.transaction_refs FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_lifecycle();


-- =====================================================================================
-- ส่วนที่ 9 — ประวัติสถานะ app.trg_write_status_history (ข้อ 4.5)
-- =====================================================================================

CREATE FUNCTION app.trg_write_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_new_status  text;
    v_old_status  text;
    v_changed_at  timestamptz;
    v_reason      text := nullif(current_setting('app.status_reason', true), '');
BEGIN
    IF TG_TABLE_NAME = 'leads' THEN
        v_new_status := NEW.status::text;
        IF TG_OP = 'UPDATE' THEN v_old_status := OLD.status::text; END IF;
    ELSE
        v_new_status := NEW.stage::text;
        IF TG_OP = 'UPDATE' THEN v_old_status := OLD.stage::text; END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND v_new_status IS NOT DISTINCT FROM v_old_status THEN
        RETURN NULL;
    END IF;

    v_changed_at := CASE
        WHEN TG_OP = 'INSERT' THEN NEW.created_at
        WHEN v_new_status IN ('CONVERTED', 'WON', 'LOST') THEN coalesce(NEW.closed_at, now())
        ELSE now()
    END;
    -- lead ที่ได้ first_contacted_at ในการเปลี่ยนครั้งนี้ (NEW → CONTACTED/QUALIFIED): เวลาเปลี่ยน = เวลาตอบกลับครั้งแรก
    -- (IF ซ้อนเพราะนิพจน์ SQL ตรวจชื่อคอลัมน์ของ OLD/NEW ทั้งนิพจน์ · opportunities ไม่มี first_contacted_at)
    IF TG_TABLE_NAME = 'leads' AND TG_OP = 'UPDATE' THEN
        IF OLD.first_contacted_at IS NULL AND NEW.first_contacted_at IS NOT NULL THEN
            v_changed_at := NEW.first_contacted_at;
        END IF;
    END IF;
    IF v_new_status = 'LOST' THEN
        v_reason := coalesce(v_reason, NEW.lost_reason_code);
    END IF;

    IF TG_TABLE_NAME = 'leads' THEN
        INSERT INTO crm.lead_status_history (organization_id, lead_id, from_status, to_status, changed_by, changed_at, reason)
        VALUES (NEW.organization_id, NEW.id, v_old_status::crm.lead_status, v_new_status::crm.lead_status,
                app.current_staff_id(), v_changed_at, v_reason);
    ELSE
        INSERT INTO crm.opportunity_stage_history (organization_id, opportunity_id, from_stage, to_stage, changed_by, changed_at, reason)
        VALUES (NEW.organization_id, NEW.id, v_old_status::crm.opportunity_stage, v_new_status::crm.opportunity_stage,
                app.current_staff_id(), v_changed_at, v_reason);
    END IF;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION app.trg_write_status_history() IS
'trigger AFTER INSERT / UPDATE OF status (leads) · stage (opportunities) เขียน crm.lead_status_history / crm.opportunity_stage_history (ข้อ 4.5 · 9.6): '
'from (NULL ตอนสร้าง) · to · changed_by = app.current_staff_id() · changed_at = created_at (สร้าง) / closed_at (ปิด) / first_contacted_at (lead ได้การตอบกลับแรกในการเปลี่ยนนี้) / now() · '
'reason = set_config(''app.status_reason'', …) ของทรานแซกชัน หรือ lost_reason_code เมื่อ LOST · ทำงานแม้ app.bulk/seed_mode (ข้อ 13.0 ข้อ 7)';

CREATE TRIGGER trg_write_status_history AFTER INSERT OR UPDATE OF status ON crm.leads         FOR EACH ROW EXECUTE FUNCTION app.trg_write_status_history();
CREATE TRIGGER trg_write_status_history AFTER INSERT OR UPDATE OF stage  ON crm.opportunities FOR EACH ROW EXECUTE FUNCTION app.trg_write_status_history();


-- =====================================================================================
-- ส่วนที่ 10 — lead NEW → CONTACTED เมื่อมี interaction OUTBOUND แรก (ข้อ 4.3)
-- =====================================================================================

CREATE FUNCTION app.trg_mark_lead_contacted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF app.is_bulk() OR NEW.direction <> 'OUTBOUND' OR (NEW.lead_id IS NULL AND NEW.customer_id IS NULL) THEN
        RETURN NULL;
    END IF;
    UPDATE crm.leads l
    SET status             = 'CONTACTED',
        first_contacted_at = NEW.occurred_at,
        updated_by         = coalesce(app.current_staff_id(), l.updated_by)
    WHERE l.status = 'NEW'
      AND (l.id = NEW.lead_id OR l.customer_id = NEW.customer_id)
      AND NEW.occurred_at >= l.created_at;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION app.trg_mark_lead_contacted() IS
'trigger AFTER INSERT / UPDATE OF direction, lead_id, customer_id ของ crm.interactions (ข้อ 4.3): interaction OUTBOUND ที่ lead_id = lead หรือ customer_id เดียวกัน และ occurred_at ≥ lead.created_at '
'เปลี่ยน lead ที่ยัง NEW เป็น CONTACTED และ first_contacted_at = occurred_at (ประวัติสถานะเขียนโดย trigger ของ leads) · ข้ามเมื่อ app.bulk = on';

CREATE TRIGGER trg_mark_lead_contacted AFTER INSERT OR UPDATE OF direction, lead_id, customer_id ON crm.interactions
    FOR EACH ROW EXECUTE FUNCTION app.trg_mark_lead_contacted();


-- =====================================================================================
-- ส่วนที่ 11 — opportunity → QUOTATION เมื่อ quotation เป็น SENT (ข้อ 4.4)
-- =====================================================================================

CREATE FUNCTION app.trg_quotation_sent_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF app.is_bulk() OR NEW.status <> 'SENT' OR (TG_OP = 'UPDATE' AND OLD.status = 'SENT') THEN
        RETURN NULL;
    END IF;
    UPDATE crm.opportunities o
    SET stage      = 'QUOTATION',
        updated_by = coalesce(app.current_staff_id(), o.updated_by)
    WHERE o.id = NEW.opportunity_id
      AND o.stage IN ('INTERESTED', 'FOLLOW_UP');
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION app.trg_quotation_sent_stage() IS
'trigger AFTER INSERT / UPDATE OF status ของ crm.quotations (ข้อ 4.4): quotation เปลี่ยนเป็น SENT → opportunity แม่ที่ขั้น INTERESTED หรือ FOLLOW_UP เลื่อนเป็น QUOTATION · '
'ขั้นอื่น (QUOTATION · WON · LOST) ไม่เปลี่ยน · ข้ามเมื่อ app.bulk = on';

CREATE TRIGGER trg_quotation_sent_stage AFTER INSERT OR UPDATE OF status ON crm.quotations
    FOR EACH ROW EXECUTE FUNCTION app.trg_quotation_sent_stage();


-- =====================================================================================
-- ส่วนที่ 12 — expected_amount = Σ opportunity_items (ข้อ 6.10)
-- =====================================================================================

CREATE FUNCTION app.trg_sync_expected_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_ids  uuid[];
    v_id   uuid;
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN v_ids := array_append(v_ids, NEW.opportunity_id); END IF;
    IF TG_OP IN ('UPDATE', 'DELETE') AND (TG_OP = 'DELETE' OR OLD.opportunity_id IS DISTINCT FROM NEW.opportunity_id) THEN
        v_ids := array_append(v_ids, OLD.opportunity_id);
    END IF;
    FOREACH v_id IN ARRAY v_ids LOOP
        UPDATE crm.opportunities o
        SET expected_amount = s.total
        FROM (SELECT coalesce(sum(i.quantity * i.unit_price), 0)::numeric(12,2) AS total
              FROM crm.opportunity_items i WHERE i.opportunity_id = v_id) s
        WHERE o.id = v_id AND o.expected_amount IS DISTINCT FROM s.total;
    END LOOP;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION app.trg_sync_expected_amount() IS
'trigger AFTER INSERT/UPDATE/DELETE ของ crm.opportunity_items: opportunities.expected_amount = Σ(quantity × unit_price) ของ items (ไม่มี item = 0) (ข้อ 6.10) · ทำงานแม้ app.bulk = on';

CREATE TRIGGER trg_sync_expected_amount AFTER INSERT OR UPDATE OR DELETE ON crm.opportunity_items
    FOR EACH ROW EXECUTE FUNCTION app.trg_sync_expected_amount();


-- =====================================================================================
-- ส่วนที่ 13 — next action → task app.trg_sync_next_action_task (ข้อ 4.4)
-- =====================================================================================

CREATE FUNCTION app.trg_sync_next_action_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    c_watch   constant text[] := ARRAY['status', 'stage', 'next_action', 'next_action_type_code', 'next_action_at',
                                       'owner_staff_id', 'team_id', 'priority_code', 'branch_id', 'customer_id'];
    v_is_lead boolean := (TG_TABLE_NAME = 'leads');
    v_new     jsonb := to_jsonb(NEW);
    v_old     jsonb;
    v_state   text;
    v_task_id uuid;
    v_actor   uuid := app.current_staff_id();
BEGIN
    IF app.is_bulk() THEN
        RETURN NULL;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        v_old := to_jsonb(OLD);
        IF NOT EXISTS (SELECT 1 FROM unnest(c_watch) AS k WHERE (v_new -> k) IS DISTINCT FROM (v_old -> k)) THEN
            RETURN NULL;
        END IF;
    END IF;

    v_state := CASE WHEN v_is_lead THEN v_new ->> 'status' ELSE v_new ->> 'stage' END;

    -- รายการปิดแล้ว → task next action ที่ยังไม่ปิดเป็น CANCELLED (DONE คงเดิม)
    IF v_state NOT IN ('NEW', 'CONTACTED', 'QUALIFIED', 'INTERESTED', 'QUOTATION', 'FOLLOW_UP') THEN
        UPDATE crm.tasks t
        SET status = 'CANCELLED', cancelled_at = now(), updated_by = coalesce(v_actor, t.updated_by)
        WHERE t.is_next_action AND t.status IN ('OPEN', 'IN_PROGRESS')
          AND ((v_is_lead AND t.lead_id = NEW.id) OR (NOT v_is_lead AND t.opportunity_id = NEW.id));
        RETURN NULL;
    END IF;

    SELECT t.id INTO v_task_id
    FROM crm.tasks t
    WHERE t.is_next_action AND t.status IN ('OPEN', 'IN_PROGRESS')
      AND ((v_is_lead AND t.lead_id = NEW.id) OR (NOT v_is_lead AND t.opportunity_id = NEW.id))
    FOR UPDATE;

    IF v_task_id IS NULL THEN
        INSERT INTO crm.tasks (organization_id, task_type_code, title, customer_id, lead_id, opportunity_id, branch_id,
                               owner_staff_id, team_id, status, priority_code, due_at, is_next_action, created_by, updated_by)
        VALUES (NEW.organization_id, NEW.next_action_type_code, NEW.next_action, NEW.customer_id,
                CASE WHEN v_is_lead THEN NEW.id END, CASE WHEN NOT v_is_lead THEN NEW.id END, NEW.branch_id,
                NEW.owner_staff_id, NEW.team_id, 'OPEN', NEW.priority_code, NEW.next_action_at, true,
                coalesce(v_actor, NEW.updated_by, NEW.created_by), coalesce(v_actor, NEW.updated_by, NEW.created_by));
    ELSE
        UPDATE crm.tasks t
        SET task_type_code = NEW.next_action_type_code,
            title          = NEW.next_action,
            due_at         = NEW.next_action_at,
            owner_staff_id = NEW.owner_staff_id,
            team_id        = NEW.team_id,
            priority_code  = NEW.priority_code,
            branch_id      = NEW.branch_id,
            customer_id    = NEW.customer_id,
            updated_by     = coalesce(v_actor, t.updated_by)
        WHERE t.id = v_task_id
          AND (t.task_type_code IS DISTINCT FROM NEW.next_action_type_code
               OR t.title IS DISTINCT FROM NEW.next_action
               OR t.due_at IS DISTINCT FROM NEW.next_action_at
               OR t.owner_staff_id IS DISTINCT FROM NEW.owner_staff_id
               OR t.team_id IS DISTINCT FROM NEW.team_id
               OR t.priority_code IS DISTINCT FROM NEW.priority_code
               OR t.branch_id IS DISTINCT FROM NEW.branch_id
               OR t.customer_id IS DISTINCT FROM NEW.customer_id);
    END IF;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION app.trg_sync_next_action_task() IS
'trigger AFTER INSERT/UPDATE ของ crm.leads และ crm.opportunities (ข้อ 4.4 · 9.6): รายการเปิดอยู่ต้องมี task is_next_action ที่ยังไม่ปิดหนึ่งใบ '
'(task_type_code = next_action_type_code · title = next_action · due_at = next_action_at · owner/team/priority/branch/customer ตามแม่ · remind_at เลื่อนตาม due_at ด้วย trg_row_defaults) — '
'ไม่มีใบเปิดก็สร้างใหม่ (รวมหลังใบเดิม DONE) · รายการปิด (CONVERTED/WON/LOST) → ใบที่ยังไม่ปิดเป็น CANCELLED · ทำงานเมื่อคอลัมน์ข้างต้นเปลี่ยน · ข้ามเมื่อ app.bulk = on (seed/merge จัดการ task เอง)';

CREATE TRIGGER trg_sync_next_action_task AFTER INSERT OR UPDATE ON crm.leads         FOR EACH ROW EXECUTE FUNCTION app.trg_sync_next_action_task();
CREATE TRIGGER trg_sync_next_action_task AFTER INSERT OR UPDATE ON crm.opportunities FOR EACH ROW EXECUTE FUNCTION app.trg_sync_next_action_task();


-- =====================================================================================
-- ส่วนที่ 14 — note_summary จากโน้ตที่ปักหมุดล่าสุด (ข้อ 6.3 · 6.9)
-- =====================================================================================

CREATE FUNCTION app.trg_sync_note_summary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_ids      uuid[];
    v_id       uuid;
    v_summary  text;
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN v_ids := array_append(v_ids, NEW.customer_id); END IF;
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id) THEN
        v_ids := array_append(v_ids, OLD.customer_id);
    END IF;
    FOREACH v_id IN ARRAY v_ids LOOP
        SELECT n.body INTO v_summary
        FROM crm.customer_notes n
        WHERE n.customer_id = v_id AND n.is_pinned
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT 1;
        UPDATE crm.customers c SET note_summary = v_summary
        WHERE c.id = v_id AND c.note_summary IS DISTINCT FROM v_summary;
        v_summary := NULL;
    END LOOP;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION app.trg_sync_note_summary() IS
'trigger AFTER INSERT / UPDATE OF is_pinned, body, customer_id / DELETE ของ crm.customer_notes: customers.note_summary = body ของโน้ตที่ปักหมุดล่าสุด (ไม่มี = NULL) (ข้อ 6.3) · '
'หมายเหตุผู้เขียน: "ล่าสุด" เรียงตาม created_at เพราะไม่มีคอลัมน์เวลาปักหมุด · ทำงานแม้ app.bulk = on';

CREATE TRIGGER trg_sync_note_summary AFTER INSERT OR UPDATE OF is_pinned, body, customer_id OR DELETE ON crm.customer_notes
    FOR EACH ROW EXECUTE FUNCTION app.trg_sync_note_summary();
