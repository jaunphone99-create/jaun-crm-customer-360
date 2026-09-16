-- =====================================================================================
-- JAUN CRM · Customer 360
-- migration 0002 : core — องค์กร · สาขา · ทีม · พนักงาน · บทบาท · สิทธิ์ · อุปกรณ์
-- target        : Supabase PostgreSQL 17
--
-- ค่าอ้างอิง (docs/00-brief/CANONICAL.md v2.1):
--   ข้อ 2    โครงสร้างองค์กร (แถวองค์กร/สาขา/ทีมเป็นข้อมูล seed ไม่ใส่ในไฟล์นี้)
--   ข้อ 6.10 คอลัมน์มาตรฐานของตารางธุรกิจ
--   ข้อ 7    บทบาท (8 แถวในไฟล์นี้) · 7.1 การมอบบทบาทและทีม · 7.2 คำขอบทบาทสูง · 7.3 เชิญ/เปิด/ปิดใช้งาน
--   ข้อ 8.0  ความหมายของ scope · 8.1 ตารางสิทธิ์ (ใส่ทุกช่องในไฟล์นี้)
--   ข้อ 9.2  core.devices · ข้อ 9.4 RLS ทุกตาราง (policy อยู่ใน migration 0010)
--
-- ข้อตกลง:
--   · ตารางองค์กรทุกตารางมี organization_id · created_at · created_by · updated_at · updated_by
--     (created_by/updated_by = core.staff_profiles.id · NULL = ระบบ/seed/bootstrap)
--   · core.roles · core.permissions · core.role_permissions เป็นค่ากลางของระบบ ไม่มี organization_id
--     และแก้ได้ผ่าน migration เท่านั้น (ข้อ 7.2)
--   · ไม่มีการลบแถวพนักงาน/การมอบบทบาท (ข้อ 4.8 · 7.1) — authenticated ไม่มี GRANT DELETE
-- =====================================================================================


-- =====================================================================================
-- ส่วนที่ 1 — องค์กร
-- =====================================================================================

CREATE TABLE core.organizations (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    code        text        NOT NULL UNIQUE,
    name_th     text        NOT NULL,
    is_active   boolean     NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid,                                -- FK เพิ่มหลังสร้าง core.staff_profiles
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  uuid,

    CONSTRAINT organizations_code_chk CHECK (code ~ '^[A-Z0-9_-]+$')
);

COMMENT ON TABLE core.organizations IS
'องค์กร (ข้อ 2) · V1 มีองค์กรเดียว code JAUN · ตารางธุรกิจทุกตารางอ้าง organization_id ของตารางนี้';
COMMENT ON COLUMN core.organizations.code IS 'รหัสองค์กร เช่น JAUN (ตัวพิมพ์ใหญ่ ตัวเลข _ -)';
COMMENT ON COLUMN core.organizations.name_th IS 'ชื่อที่แสดง เช่น JAUN';


-- =====================================================================================
-- ส่วนที่ 2 — พนักงาน (สร้างก่อน เพื่อให้ตารางอื่นอ้าง created_by ได้)
-- =====================================================================================

CREATE TABLE core.staff_profiles (
    id                    uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       uuid              NOT NULL REFERENCES core.organizations (id),
    staff_code            text              NOT NULL UNIQUE,
    employee_code         text              NOT NULL,
    display_name          text              NOT NULL,
    nickname              text,
    email                 text              NOT NULL,
    phone                 text,
    user_id               uuid              UNIQUE REFERENCES auth.users (id),
    status                core.staff_status NOT NULL DEFAULT 'INVITED',
    invite_expires_at     timestamptz,
    identity_verified_by  uuid              REFERENCES core.staff_profiles (id),
    identity_verified_at  timestamptz,
    created_at            timestamptz       NOT NULL DEFAULT now(),
    created_by            uuid              REFERENCES core.staff_profiles (id),
    updated_at            timestamptz       NOT NULL DEFAULT now(),
    updated_by            uuid              REFERENCES core.staff_profiles (id),

    CONSTRAINT staff_profiles_staff_code_chk     CHECK (staff_code ~ '^ST-[0-9]{4,}$'),
    CONSTRAINT staff_profiles_employee_code_chk  CHECK (btrim(employee_code) <> ''),
    CONSTRAINT staff_profiles_display_name_chk   CHECK (btrim(display_name) <> ''),
    CONSTRAINT staff_profiles_email_chk          CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
    CONSTRAINT staff_profiles_active_user_chk    CHECK (status <> 'ACTIVE' OR user_id IS NOT NULL),
    CONSTRAINT staff_profiles_invited_expiry_chk CHECK (status <> 'INVITED' OR invite_expires_at IS NOT NULL),
    CONSTRAINT staff_profiles_identity_chk       CHECK ((identity_verified_by IS NULL) = (identity_verified_at IS NULL))
);

-- ห้ามมีสองบัญชีที่ยังไม่ DISABLED ด้วย employee_code เดียวกัน (ข้อ 7.1 · [รอยืนยัน Q1])
CREATE UNIQUE INDEX staff_profiles_employee_code_open_uidx
    ON core.staff_profiles (organization_id, employee_code)
    WHERE status <> 'DISABLED';
-- หมายเหตุผู้เขียน: อีเมลใช้ล็อกอินและผูก auth.users จึงห้ามซ้ำ (ไม่สนตัวพิมพ์) ในบัญชีที่ยังไม่ DISABLED
CREATE UNIQUE INDEX staff_profiles_email_open_uidx
    ON core.staff_profiles (lower(email))
    WHERE status <> 'DISABLED';
CREATE INDEX staff_profiles_organization_id_idx ON core.staff_profiles (organization_id);

COMMENT ON TABLE core.staff_profiles IS
'พนักงาน/ผู้ใช้ของ CRM (ข้อ 7.1 · 7.3) · ห้ามลบแถว (ปิดใช้งาน = status DISABLED) · '
'authenticated อ่านได้เฉพาะคอลัมน์ id staff_code display_name nickname status ผ่าน column grant (ข้อ 8.3) · คอลัมน์อื่นผ่าน api.list_staff (user.read) · '
'เขียนผ่าน Edge Function invite-staff / disable-staff และ RPC เท่านั้น';
COMMENT ON COLUMN core.staff_profiles.staff_code IS
'รหัสพนักงานของระบบ ST-{NNNN} ออกโดย app.trg_assign_running_number ตัวนับ ST (ข้อ 6.1) · ใช้ล็อกอินแทนอีเมลและแสดงผล';
COMMENT ON COLUMN core.staff_profiles.employee_code IS
'รหัส HR ที่ผู้เชิญกรอก · ไม่ UNIQUE แต่ห้ามซ้ำในบัญชีที่ไม่ใช่ DISABLED (partial unique index) · ใช้ตรวจ "ผู้อนุมัติ ≠ บัญชีที่ employee_code เดียวกับผู้รับ" (ข้อ 7.2)';
COMMENT ON COLUMN core.staff_profiles.display_name IS 'ชื่อที่แสดง เช่น "คุณขวัญ"';
COMMENT ON COLUMN core.staff_profiles.nickname IS 'ชื่อเล่น';
COMMENT ON COLUMN core.staff_profiles.email IS 'อีเมลที่ใช้รับคำเชิญ/รีเซ็ตรหัส (ส่วนตัวได้ Q24) · BRANCH_MANAGER แก้ไม่ได้ (ข้อ 7.3)';
COMMENT ON COLUMN core.staff_profiles.phone IS 'เบอร์ติดต่อพนักงาน (ข้อมูล Internal)';
COMMENT ON COLUMN core.staff_profiles.user_id IS
'บัญชี Supabase Auth (auth.users.id) · ว่างได้ระหว่าง INVITED ก่อนสร้างผู้ใช้ · บัญชี ACTIVE ต้องมีค่า · app.current_staff_id() หา staff ACTIVE จาก auth.uid() ผ่านคอลัมน์นี้';
COMMENT ON COLUMN core.staff_profiles.status IS 'INVITED → ACTIVE (api.activate_self) → DISABLED (api.disable_staff) · เปิดใช้งานใหม่ต้องมอบบทบาทใหม่';
COMMENT ON COLUMN core.staff_profiles.invite_expires_at IS 'เวลาหมดอายุคำเชิญ = เวลาเชิญ + 24 ชม. (ข้อ 7.3) · ตรวจด้วย now() ใน api.activate_self';
COMMENT ON COLUMN core.staff_profiles.identity_verified_by IS
'BUSINESS_ADMIN ที่ยืนยันตัวตนกับ HR · บัญชีที่ SYSTEM_ADMIN เป็นผู้เชิญรับบทบาทธุรกิจไม่ได้จนกว่าคอลัมน์นี้มีค่า (ข้อ 7.2)';
COMMENT ON COLUMN core.staff_profiles.identity_verified_at IS 'เวลาที่ยืนยันตัวตน (มีค่าพร้อม identity_verified_by)';

-- FK ของ organizations ที่รอ staff_profiles
ALTER TABLE core.organizations
    ADD CONSTRAINT organizations_created_by_fkey FOREIGN KEY (created_by) REFERENCES core.staff_profiles (id),
    ADD CONSTRAINT organizations_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES core.staff_profiles (id);


-- =====================================================================================
-- ส่วนที่ 3 — หน่วยธุรกิจ · สาขา · ฝ่าย · ทีม · สมาชิกทีม · อุปกรณ์
-- =====================================================================================

CREATE TABLE core.business_units (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid        NOT NULL REFERENCES core.organizations (id),
    code             text        NOT NULL,
    name_th          text        NOT NULL,
    is_active        boolean     NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        REFERENCES core.staff_profiles (id),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid        REFERENCES core.staff_profiles (id),

    CONSTRAINT business_units_code_uq UNIQUE (organization_id, code),
    CONSTRAINT business_units_code_chk CHECK (code ~ '^[A-Z0-9_-]+$')
);

COMMENT ON TABLE core.business_units IS
'หน่วยธุรกิจ (ข้อ 2) · seed: JAUNPHONE "JAUN PHONE" · JPM "JAUN POWER MONEY" (V1 เชื่อมผ่าน transaction ref เท่านั้น · [รอยืนยัน Q17])';
COMMENT ON COLUMN core.business_units.code IS 'รหัสหน่วยธุรกิจ ไม่ซ้ำภายในองค์กร';
COMMENT ON COLUMN core.business_units.name_th IS 'ชื่อที่แสดง';

CREATE TABLE core.branches (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid        NOT NULL REFERENCES core.organizations (id),
    business_unit_id  uuid        NOT NULL REFERENCES core.business_units (id),
    code              text        NOT NULL,
    name_th           text        NOT NULL,
    branch_type       text        NOT NULL,
    is_active         boolean     NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid        REFERENCES core.staff_profiles (id),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    updated_by        uuid        REFERENCES core.staff_profiles (id),

    CONSTRAINT branches_code_uq UNIQUE (organization_id, code),
    CONSTRAINT branches_code_chk CHECK (code ~ '^[A-Z0-9]+$'),
    CONSTRAINT branches_branch_type_chk CHECK (branch_type IN ('store', 'online_team'))
);

CREATE INDEX branches_business_unit_id_idx ON core.branches (business_unit_id);

COMMENT ON TABLE core.branches IS
'สาขา/หน่วยที่เป็นขอบเขตข้อมูล (ข้อ 2 · 8.0) · seed: JP1–JP4 (store) "JAUNPHONE 1–4" · JPON (online_team) "ทีมออนไลน์ส่วนกลาง" [รอยืนยัน Q3] · '
'รายการธุรกิจทุกรายการมี branch_id เสมอ (รายการออนไลน์ที่ยังไม่มอบสาขาอยู่ที่ JPON · D21)';
COMMENT ON COLUMN core.branches.code IS
'รหัสสาขา ไม่ซ้ำภายในองค์กร · ใช้ในเลข visit V-{branch}-{YYMMDD}-{NNN} และตัวนับ VISIT:{branch}:{YYYYMMDD} (ข้อ 6.1) จึงใช้ได้เฉพาะ A–Z 0–9';
COMMENT ON COLUMN core.branches.name_th IS 'ชื่อที่แสดง เช่น JAUNPHONE 1';
COMMENT ON COLUMN core.branches.branch_type IS 'store = หน้าร้าน · online_team = ทีมออนไลน์ส่วนกลาง (ข้อ 2)';

CREATE TABLE core.departments (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid        NOT NULL REFERENCES core.organizations (id),
    business_unit_id  uuid        REFERENCES core.business_units (id),
    code              text        NOT NULL,
    name_th           text        NOT NULL,
    is_active         boolean     NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid        REFERENCES core.staff_profiles (id),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    updated_by        uuid        REFERENCES core.staff_profiles (id),

    CONSTRAINT departments_code_uq UNIQUE (organization_id, code),
    CONSTRAINT departments_code_chk CHECK (code ~ '^[A-Z0-9_-]+$')
);

CREATE INDEX departments_business_unit_id_idx ON core.departments (business_unit_id);

COMMENT ON TABLE core.departments IS
'ฝ่าย/แผนก (ข้อ 14.6 · จากบรีฟ A10) · V1 ไม่ใช้ในการตัดสินสิทธิ์หรือรายงาน · ไม่มีรายการใน seed · '
'หมายเหตุผู้เขียน: CANONICAL ไม่ระบุคอลัมน์ ผู้เขียนใช้โครงเดียวกับ business_units และให้ business_unit_id ว่างได้ (ฝ่ายกลางขององค์กร)';
COMMENT ON COLUMN core.departments.business_unit_id IS 'หน่วยธุรกิจที่สังกัด · NULL = ฝ่ายกลางระดับองค์กร';

CREATE TABLE core.teams (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid        NOT NULL REFERENCES core.organizations (id),
    branch_id        uuid        NOT NULL REFERENCES core.branches (id),
    code             text        NOT NULL,
    name_th          text        NOT NULL,
    is_active        boolean     NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        REFERENCES core.staff_profiles (id),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid        REFERENCES core.staff_profiles (id),

    CONSTRAINT teams_code_uq UNIQUE (organization_id, code),
    CONSTRAINT teams_code_chk CHECK (code ~ '^[A-Z0-9_-]+$')
);

CREATE INDEX teams_branch_id_idx ON core.teams (branch_id);

COMMENT ON TABLE core.teams IS
'ทีมภายในสาขา (ข้อ 2 · 7.1) · ทุกทีมอยู่ใต้สาขาเดียว (branch_id NOT NULL) · seed: JP1-SALES ทีมขาย JAUNPHONE 1 · JP2-SALES · JP3-SALES · JP4-SALES · JPON-ADMIN ทีมแอดมินออนไลน์ · '
'จัดการผ่าน api.save_team (team.manage)';
COMMENT ON COLUMN core.teams.branch_id IS 'สาขาของทีม · SUPERVISOR@สาขา X ใช้ scope TEAM ได้เมื่อเป็น is_leader ของทีมที่ branch_id = X อย่างน้อย 1 ทีม';
COMMENT ON COLUMN core.teams.name_th IS 'ชื่อทีม เช่น ทีมขาย JAUNPHONE 1';

CREATE TABLE core.team_members (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid        NOT NULL REFERENCES core.organizations (id),
    team_id          uuid        NOT NULL REFERENCES core.teams (id),
    staff_id         uuid        NOT NULL REFERENCES core.staff_profiles (id),
    is_leader        boolean     NOT NULL DEFAULT false,
    valid_from       timestamptz NOT NULL DEFAULT now(),
    valid_to         timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        REFERENCES core.staff_profiles (id),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid        REFERENCES core.staff_profiles (id),

    CONSTRAINT team_members_valid_range_chk CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

-- หนึ่งคนมีสมาชิกภาพที่ยังไม่สิ้นสุด (valid_to ว่าง) ในทีมเดียวกันได้แถวเดียว
CREATE UNIQUE INDEX team_members_open_uidx ON core.team_members (team_id, staff_id) WHERE valid_to IS NULL;
CREATE INDEX team_members_staff_id_idx ON core.team_members (staff_id);

COMMENT ON TABLE core.team_members IS
'สมาชิกทีม — แหล่งเดียวของสมาชิกภาพ (ข้อ 2 · 7.1) · หัวหน้านับเป็นสมาชิก (is_leader = true) · สมาชิกต้องมี assignment ในสาขาของทีม (ตรวจใน api.set_team_member) · '
'scope TEAM ประเมินจากสมาชิกภาพปัจจุบันของ owner: valid_from ≤ now() < coalesce(valid_to, ∞) · ย้าย/ออกจากทีม = ตั้ง valid_to ไม่ลบแถว';
COMMENT ON COLUMN core.team_members.is_leader IS 'เป็นหัวหน้าทีมนี้ · ใช้ประเมิน scope TEAM และผู้รับแจ้งเตือน "หัวหน้าทีม" (ข้อ 11.1)';
COMMENT ON COLUMN core.team_members.valid_from IS 'เริ่มเป็นสมาชิก (ตัดสินสิทธิ์ด้วย now() · ข้อ 1.2)';
COMMENT ON COLUMN core.team_members.valid_to IS 'สิ้นสุดสมาชิกภาพ (ไม่รวมเวลานี้) · NULL = ยังเป็นสมาชิก';

CREATE TABLE core.devices (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    uuid        NOT NULL REFERENCES core.organizations (id),
    device_id          text        NOT NULL UNIQUE,
    branch_id          uuid        NOT NULL REFERENCES core.branches (id),
    is_shared_counter  boolean     NOT NULL DEFAULT false,
    label              text,
    is_active          boolean     NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid        REFERENCES core.staff_profiles (id),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    updated_by         uuid        REFERENCES core.staff_profiles (id),

    CONSTRAINT devices_device_id_chk CHECK (btrim(device_id) <> '')
);

CREATE INDEX devices_branch_id_idx ON core.devices (branch_id);

COMMENT ON TABLE core.devices IS
'อุปกรณ์ที่ลงทะเบียน (ข้อ 9.2) โดย BRANCH_MANAGER · อุปกรณ์ counter ใช้ร่วมกัน: idle ตาม settings session.shared_counter_idle_min (10 นาที) → ล็อกหน้าจอ · '
'ซ่อน "จดจำฉันไว้" · device_id เป็นข้อมูลประกอบ ห้ามใช้ตัดสินสิทธิ์';
COMMENT ON COLUMN core.devices.device_id IS 'รหัสอุปกรณ์ที่แอปเก็บใน localStorage[''device_id''] (ไม่ถูกล้างตอน logout) และส่งใน header x-device-id';
COMMENT ON COLUMN core.devices.is_shared_counter IS 'true = เครื่อง counter ที่พนักงานใช้ร่วมกัน';
COMMENT ON COLUMN core.devices.label IS 'ชื่อเรียกอุปกรณ์ (ไม่บังคับ) · หมายเหตุผู้เขียน: ไม่ได้ระบุใน CANONICAL';
COMMENT ON COLUMN core.devices.is_active IS 'false = เลิกใช้อุปกรณ์ (ไม่ลบแถว) · หมายเหตุผู้เขียน: ไม่ได้ระบุใน CANONICAL';

CREATE TABLE core.staff_invitations (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid        NOT NULL REFERENCES core.organizations (id),
    staff_id         uuid        NOT NULL REFERENCES core.staff_profiles (id),
    email            text        NOT NULL,
    invited_by       uuid        REFERENCES core.staff_profiles (id),
    invited_at       timestamptz NOT NULL DEFAULT now(),
    expires_at       timestamptz NOT NULL DEFAULT now() + interval '24 hours',
    accepted_at      timestamptz,
    revoked_at       timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        REFERENCES core.staff_profiles (id),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid        REFERENCES core.staff_profiles (id),

    CONSTRAINT staff_invitations_expiry_chk CHECK (expires_at > invited_at),
    CONSTRAINT staff_invitations_final_chk  CHECK (accepted_at IS NULL OR revoked_at IS NULL),
    CONSTRAINT staff_invitations_self_chk   CHECK (invited_by IS NULL OR invited_by <> staff_id)
);

CREATE INDEX staff_invitations_email_idx ON core.staff_invitations (lower(email));
CREATE INDEX staff_invitations_staff_id_idx ON core.staff_invitations (staff_id);

COMMENT ON TABLE core.staff_invitations IS
'คำเชิญพนักงาน (ข้อ 7.3 · 9.2) · Edge Function invite-staff สร้างแถวนี้ + staff_profiles (INVITED) ก่อนเรียก auth.admin · '
'Before User Created hook อนุญาตเฉพาะอีเมลที่มีแถวที่ยังไม่หมดอายุ/ไม่ถูกยกเลิก · ส่งคำเชิญซ้ำ = แถวใหม่ · '
'หมายเหตุผู้เขียน: CANONICAL ระบุชื่อตารางแต่ไม่ระบุคอลัมน์ ผู้เขียนออกแบบให้หน้าอนุมัติแสดง "ผู้เชิญ วันที่เชิญ อีเมล" ได้ (ข้อ 7.2)';
COMMENT ON COLUMN core.staff_invitations.staff_id IS 'โปรไฟล์ที่สร้างพร้อมคำเชิญ · บทบาทที่เลือกตอนเชิญบันทึกใน core.staff_role_assignments';
COMMENT ON COLUMN core.staff_invitations.email IS 'อีเมลที่ส่งคำเชิญ (เทียบแบบไม่สนตัวพิมพ์)';
COMMENT ON COLUMN core.staff_invitations.invited_by IS 'ผู้เชิญ · NULL = สคริปต์ bootstrap (EXECUTIVE คนแรก ข้อ 7.2) · ใช้ตรวจกติกา "บัญชีที่ SYSTEM_ADMIN เป็นผู้เชิญ"';
COMMENT ON COLUMN core.staff_invitations.expires_at IS 'หมดอายุ = เวลาเชิญ + 24 ชม. (ข้อ 7.3) · เทียบด้วย now()';
COMMENT ON COLUMN core.staff_invitations.accepted_at IS 'เวลาที่พนักงานเปิดใช้งานสำเร็จ (api.activate_self)';
COMMENT ON COLUMN core.staff_invitations.revoked_at IS 'เวลาที่ยกเลิกคำเชิญ (เช่น ส่งใหม่ หรือปิดใช้งานก่อนรับ)';


-- =====================================================================================
-- ส่วนที่ 4 — บทบาท (CANONICAL ข้อ 7)
-- =====================================================================================

CREATE TABLE core.roles (
    code            text        PRIMARY KEY,
    label_th        text        NOT NULL,
    rank            integer,
    description_th  text        NOT NULL,
    requires_mfa    boolean     NOT NULL,
    is_branch_role  boolean     NOT NULL,
    sort_order      integer     NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT roles_code_chk CHECK (code ~ '^[A-Z_]+$'),
    -- SYSTEM_ADMIN เป็นสายแยก ไม่เทียบ rank (NULL) · บทบาทอื่นต้องมี rank
    CONSTRAINT roles_rank_chk CHECK ((code = 'SYSTEM_ADMIN') = (rank IS NULL))
);

COMMENT ON TABLE core.roles IS
'บทบาท 8 แบบ (ข้อ 7) · ค่ากลางของระบบ แก้ผ่าน migration เท่านั้น · ห้ามมอบ rank ≥ rank สูงสุดของผู้มอบ (ข้อ 7.2)';
COMMENT ON COLUMN core.roles.code IS 'รหัสบทบาท เช่น STAFF · BRANCH_MANAGER';
COMMENT ON COLUMN core.roles.label_th IS 'ป้ายไทย';
COMMENT ON COLUMN core.roles.rank IS 'ลำดับอำนาจ 10–60 ใช้กติกา "ห้ามมอบ rank ≥ rank ของตน" · NULL เฉพาะ SYSTEM_ADMIN (สายแยก มอบตรงไม่ได้)';
COMMENT ON COLUMN core.roles.description_th IS 'ใครบ้างที่ถือบทบาทนี้ (คอลัมน์ "ใครบ้าง" ของข้อ 7)';
COMMENT ON COLUMN core.roles.requires_mfa IS
'true = assignment ของบทบาทนี้ไม่ถูกนับเมื่อ JWT ไม่ใช่ aal2 (ข้อ 8.0) · ผู้ใช้ต้องลงทะเบียน TOTP ก่อนเปิดใช้งาน (ข้อ 7.3)';
COMMENT ON COLUMN core.roles.is_branch_role IS
'true = ต้องมอบพร้อม branch_id (STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS) · false = บทบาทระดับองค์กร branch_id ต้องว่าง (ข้อ 7.1)';
COMMENT ON COLUMN core.roles.sort_order IS 'ลำดับแสดงผลตามตารางข้อ 7';

INSERT INTO core.roles (code, label_th, rank, description_th, requires_mfa, is_branch_role, sort_order) VALUES
    ('STAFF',          'พนักงานขาย/แอดมิน', 10,   'พนักงานหน้าร้าน · แอดมินออนไลน์',            false, true,  1),
    ('SUPERVISOR',     'หัวหน้าทีม',          20,   'หัวหน้าทีมขาย/หัวหน้าแอดมิน',                true,  true,  2),
    ('BRANCH_MANAGER', 'ผู้จัดการสาขา',       30,   'ผู้จัดการร้าน',                               true,  true,  3),
    ('MARKETING',      'ฝ่ายการตลาด',        30,   'ทีมการตลาด',                                 true,  false, 4),
    ('OPERATIONS',     'ฝ่ายปฏิบัติการ',      40,   'ดูแลหลายสาขา (อ่านอย่างเดียว)',              true,  true,  5),
    ('BUSINESS_ADMIN', 'ผู้ดูแลข้อมูลธุรกิจ', 50,   'master data · ผู้ใช้ · คุณภาพข้อมูล · PDPA', true,  false, 6),
    ('EXECUTIVE',      'ผู้บริหาร',           60,   'ผู้บริหารระดับองค์กร',                        true,  false, 7),
    ('SYSTEM_ADMIN',   'ผู้ดูแลระบบ (IT)',    NULL, 'ดูแลระบบ · integration',                      true,  false, 8);


-- =====================================================================================
-- ส่วนที่ 5 — สิทธิ์ (CANONICAL ข้อ 8.1 · คอลัมน์ "ความหมาย" = label_th)
-- =====================================================================================

CREATE TABLE core.permissions (
    code         text        PRIMARY KEY,
    label_th     text        NOT NULL,
    description  text,
    sort_order   integer     NOT NULL UNIQUE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT permissions_code_chk CHECK (code ~ '^[a-z_]+(\.[a-z_]+)+$')
);

COMMENT ON TABLE core.permissions IS
'รายการสิทธิ์ทั้งหมดของระบบ (ข้อ 8.1) · ค่ากลาง แก้ผ่าน migration เท่านั้น · ไม่มี customer.delete (A16 · ลบจริงผ่าน customer.anonymize)';
COMMENT ON COLUMN core.permissions.code IS 'รหัสสิทธิ์ {กลุ่ม}.{การกระทำ} เช่น customer.read · customer.pii.reveal';
COMMENT ON COLUMN core.permissions.label_th IS 'ความหมาย (คอลัมน์ "ความหมาย" ของตารางข้อ 8.1)';
COMMENT ON COLUMN core.permissions.description IS 'กติกาเพิ่มเติมจาก CANONICAL ที่ผูกกับสิทธิ์นี้ (NULL = ไม่มี)';
COMMENT ON COLUMN core.permissions.sort_order IS 'ลำดับแถวตามตารางข้อ 8.1';

INSERT INTO core.permissions (sort_order, code, label_th, description) VALUES
    ( 1, 'customer.read',            'ดูลูกค้า/Customer 360', NULL),
    ( 2, 'customer.create',          'สร้างลูกค้า (ผ่าน quick_capture)', 'สร้างลูกค้าได้ทางเดียวคือ api.quick_capture (ข้อ 6.2)'),
    ( 3, 'customer.update',          'แก้ข้อมูลลูกค้า/ช่องทางติดต่อ/tag', NULL),
    ( 4, 'customer.assign',          'เปลี่ยนผู้ดูแลลูกค้า', NULL),
    ( 5, 'customer.merge',           'รวมลูกค้าซ้ำ/ยืนยันคนละคน', 'ต้องมีสิทธิ์บนลูกค้าทั้งสองราย · ผู้ตัดสิน ≠ ผู้สร้าง duplicate_decisions (ข้อ 6.7)'),
    ( 6, 'customer.pii.reveal',      'เปิดค่าเต็มของช่องทางติดต่อ (บันทึกทุกครั้ง)', 'ผ่าน api.reveal_contact เท่านั้น · เขียน audit.access_logs CONTACT_REVEALED ก่อนคืนค่า (ข้อ 6.4)'),
    ( 7, 'customer.export',          'ส่งออกข้อมูลลูกค้า (ข้อ 8.2)', 'เพดาน ผู้อนุมัติ และคอลัมน์ตามบทบาทที่ยื่น (ข้อ 8.2)'),
    ( 8, 'customer.consent.manage',  'บันทึกความยินยอม (append-only)', NULL),
    ( 9, 'customer.anonymize',       'ทำข้อมูลนิรนาม (ข้อ 10.4)', NULL),
    (10, 'note.create',              'เพิ่มโน้ต', NULL),
    (11, 'note.update',              'แก้โน้ตของตน (24 ชม.)', NULL),
    (12, 'visit.read',               'ดู visit/คิว', NULL),
    (13, 'visit.create',             'รับลูกค้า/เปิด visit', NULL),
    (14, 'visit.update',             'รับคิว/แก้/ปิด visit', 'รับคิว: ผู้มี visit.update ในสาขาของ visit (ทุก scope) เมื่อ WAITING และยังไม่มีผู้รับ (ข้อ 4.1)'),
    (15, 'interaction.read',         'ดูประวัติการติดต่อ', NULL),
    (16, 'interaction.create',       'บันทึกการติดต่อ', NULL),
    (17, 'interaction.update',       'แก้บันทึกการติดต่อ (ภายใน 24 ชม.)', NULL),
    (18, 'lead.read',                'ดู lead', NULL),
    (19, 'lead.create',              'สร้าง lead', NULL),
    (20, 'lead.update',              'แก้/เปลี่ยนสถานะ/ปิด lead (แปลงต้องมี opportunity.create ด้วย)', NULL),
    (21, 'lead.assign',              'มอบ/เปลี่ยนผู้รับผิดชอบ lead', NULL),
    (22, 'lead.reopen',              'เปิด lead ที่ปิดแล้ว', NULL),
    (23, 'opportunity.read',         'ดูโอกาสขาย/Pipeline', NULL),
    (24, 'opportunity.create',       'สร้างโอกาสขาย', NULL),
    (25, 'opportunity.update',       'แก้/เลื่อนขั้น', NULL),
    (26, 'opportunity.assign',       'เปลี่ยนผู้รับผิดชอบ', NULL),
    (27, 'opportunity.close',        'ปิด WON/LOST', NULL),
    (28, 'opportunity.reopen',       'เปิดรายการที่ปิดแล้ว', NULL),
    (29, 'quotation.read',           'ดูใบเสนอราคา', NULL),
    (30, 'quotation.create',         'สร้างใบเสนอราคา (ประเมินกับ opportunity แม่)', NULL),
    (31, 'quotation.update',         'แก้ DRAFT · ส่ง · เปลี่ยนสถานะ', NULL),
    (32, 'task.read',                'ดูงาน (ไม่มี read-through ผ่านลูกค้า)', NULL),
    (33, 'task.create',              'สร้างงาน', NULL),
    (34, 'task.update',              'แก้/ปิดงาน', NULL),
    (35, 'task.assign',              'มอบงานให้คนอื่น', NULL),
    (36, 'transaction.read',         'ดูประวัติธุรกรรม', NULL),
    (37, 'transaction.link',         'ผูกเลขธุรกรรม (ด้วยมือ V1)', NULL),
    (38, 'tag.manage',               'สร้าง/แก้ tag', NULL),
    (39, 'campaign.read',            'ดูแคมเปญ', NULL),
    (40, 'campaign.manage',          'จัดการแคมเปญ', NULL),
    (41, 'dashboard.view',           'ดู Dashboard (ตัวเลขรวม)', NULL),
    (42, 'report.view',              'ดูรายงาน (ตัวเลขรวม ไม่มี PII)', NULL),
    (43, 'report.staff_performance', 'ดูผลงานรายพนักงาน', NULL),
    (44, 'report.export',            'ส่งออกรายงานตัวเลขรวม (ไม่มี PII)', NULL),
    (45, 'data_quality.view',        'ดูศูนย์คุณภาพข้อมูล', NULL),
    (46, 'data_quality.resolve',     'แก้รายการคุณภาพข้อมูล (ยกเว้นข้อมูลซ้ำ ใช้ customer.merge)', 'scope OWN ใช้ได้เฉพาะ MISSING_PHONE INVALID_PHONE INCOMPLETE_CUSTOMER ของลูกค้าที่ตนดูแล (ข้อ 8.1)'),
    (47, 'dsr.create',               'รับคำขอเจ้าของข้อมูลที่หน้าร้าน', NULL),
    (48, 'dsr.manage',               'ดำเนินการคำขอเจ้าของข้อมูล', NULL),
    (49, 'master_data.manage',       'จัดการ Master Data', NULL),
    (50, 'team.manage',              'จัดการทีม/สมาชิกทีม', NULL),
    (51, 'user.read',                'ดูรายชื่อผู้ใช้', NULL),
    (52, 'user.invite',              'เชิญผู้ใช้', 'SYSTEM_ADMIN: เชิญได้เฉพาะบัญชีสาย SYSTEM_ADMIN (ต้องผ่านคำขอ) (เชิงอรรถ ¹ ข้อ 8.1)'),
    (53, 'user.update',              'แก้โปรไฟล์ผู้ใช้', 'SYSTEM_ADMIN: แก้ได้เฉพาะบัญชีที่ไม่มีบทบาทธุรกิจ (เชิงอรรถ ¹) · BRANCH_MANAGER: ตามข้อ 7.3 ข้อ 5'),
    (54, 'user.disable',             'ปิดใช้งานผู้ใช้', 'SYSTEM_ADMIN: ปิดใช้งานได้เฉพาะบัญชีที่ไม่มีบทบาทธุรกิจ (เชิงอรรถ ¹) · BRANCH_MANAGER: ตามข้อ 7.3 ข้อ 5'),
    (55, 'role.assign',              'มอบ/ถอนบทบาท (ข้อ 7.2)', NULL),
    (56, 'role.request',             'ยื่นคำขอบทบาทสูง', 'ขอ SYSTEM_ADMIN · EXECUTIVE · BUSINESS_ADMIN ผ่าน api.request_role_grant (ข้อ 7.2)'),
    (57, 'role.decide',              'อนุมัติคำขอบทบาทสูง', 'ผู้อนุมัติ ≠ ผู้ยื่น ≠ ผู้รับ ≠ บัญชีที่ employee_code เดียวกับผู้รับ (ข้อ 7.2)'),
    (58, 'export.approve',           'อนุมัติคำขอส่งออก (ตามข้อ 8.2)', NULL),
    (59, 'audit.read',               'ค้น audit log ธุรกิจ (ค่าปิดบัง)', NULL),
    (60, 'security_log.read',        'ดู log เข้าสู่ระบบ/สิทธิ์', 'คืนเฉพาะ login_events + audit_logs ที่ action เป็น ROLE_* PERMISSION_CHANGED STAFF_* MFA_* SETTINGS_UPDATED INTEGRATION_UPDATED (ข้อ 9.5)'),
    (61, 'settings.business',        'ตั้งค่าเกณฑ์ธุรกิจ/ความปลอดภัย (ข้อ 11.2)', NULL),
    (62, 'settings.system',          'ตั้งค่าเชิงเทคนิค', NULL),
    (63, 'integration.manage',       'จัดการ integration (ส่งข้อมูลออกนอกระบบต้องให้ EX อนุมัติ)', NULL);


-- =====================================================================================
-- ส่วนที่ 6 — สิทธิ์ของแต่ละบทบาท (CANONICAL ข้อ 8.1 ทุกช่อง)
-- =====================================================================================

CREATE TABLE core.role_permissions (
    role_code        text            NOT NULL REFERENCES core.roles (code),
    permission_code  text            NOT NULL REFERENCES core.permissions (code),
    scope            core.data_scope NOT NULL,
    requires_aal2    boolean         NOT NULL DEFAULT false,
    created_at       timestamptz     NOT NULL DEFAULT now(),
    updated_at       timestamptz     NOT NULL DEFAULT now(),

    PRIMARY KEY (role_code, permission_code),
    -- scope SYSTEM ใช้กับวัตถุระบบของ SYSTEM_ADMIN เท่านั้น และ SYSTEM_ADMIN มีแต่ scope SYSTEM (ข้อ 8.0 · 8.1)
    CONSTRAINT role_permissions_system_scope_chk CHECK ((role_code = 'SYSTEM_ADMIN') = (scope = 'SYSTEM')),
    -- SYSTEM_ADMIN ไม่มีสิทธิ์ข้อมูลลูกค้าใด ๆ (ข้อ 7.1 · 7.2)
    CONSTRAINT role_permissions_sa_no_customer_data_chk CHECK (
        role_code <> 'SYSTEM_ADMIN'
        OR permission_code !~ '^(customer|note|visit|interaction|lead|opportunity|quotation|task|transaction|data_quality|dsr)\.')
);

CREATE INDEX role_permissions_permission_code_idx ON core.role_permissions (permission_code);

COMMENT ON TABLE core.role_permissions IS
'ตารางสิทธิ์ × ขอบเขตต่อบทบาท (ข้อ 8.1) · หนึ่งแถว = หนึ่งช่องที่ไม่ใช่ "–" · แก้ได้เฉพาะผ่าน migration (ไม่มีหน้าจอ/RPC ใน V1 · trigger บันทึก PERMISSION_CHANGED) · '
'helper ข้อ 9.3 อ่านตารางนี้สดทุกครั้ง ห้ามฝังลง JWT';
COMMENT ON COLUMN core.role_permissions.scope IS
'ขอบเขตของช่อง: O=OWN · T=TEAM · B=BRANCH · G=ORGANIZATION · S=SYSTEM (S¹ ของ SYSTEM_ADMIN เก็บเป็น SYSTEM · ข้อจำกัดของเชิงอรรถ ¹ ตรวจใน RPC) · ความหมายตามข้อ 8.0';
COMMENT ON COLUMN core.role_permissions.requires_aal2 IS
'ช่องที่ติด 🔐 (ทั้งสิทธิ์ที่ติด 🔐 ที่ชื่อ และช่องเฉพาะเช่น customer.pii.reveal ของ EX/BA) · สิทธิ์ของช่องนี้ไม่ถูกนับเมื่อ JWT ไม่ใช่ aal2 (ข้อ 8.0)';

-- ตารางข้อ 8.1 ถอดแบบช่องต่อช่อง: – = ไม่มีสิทธิ์ · 🔐 ท้ายช่อง = ต้อง aal2 เฉพาะช่องนั้น · perm_aal2 = 🔐 ที่ชื่อสิทธิ์ (ทุกช่อง)
WITH matrix (permission_code, perm_aal2, st, sv, bm, op, mk, ex, ba, sa) AS (VALUES
    --  permission                 🔐     ST   SV   BM   OP   MK   EX     BA     SA
    ('customer.read',            false, 'B', 'B', 'B', 'B', '–', 'G',   'G',   '–'),
    ('customer.create',          false, 'B', 'B', 'B', '–', '–', '–',   'G',   '–'),
    ('customer.update',          false, 'O', 'T', 'B', '–', '–', '–',   'G',   '–'),
    ('customer.assign',          false, '–', 'T', 'B', '–', '–', '–',   'G',   '–'),
    ('customer.merge',           true,  '–', 'T', 'B', '–', '–', '–',   'G',   '–'),
    ('customer.pii.reveal',      false, 'B', 'B', 'B', '–', '–', 'G🔐', 'G🔐', '–'),
    ('customer.export',          true,  '–', '–', 'B', '–', 'G', 'G',   'G',   '–'),
    ('customer.consent.manage',  false, 'B', 'B', 'B', '–', '–', '–',   'G',   '–'),
    ('customer.anonymize',       true,  '–', '–', '–', '–', '–', '–',   'G',   '–'),
    ('note.create',              false, 'B', 'B', 'B', '–', '–', '–',   'G',   '–'),
    ('note.update',              false, 'O', 'O', 'O', '–', '–', '–',   'G',   '–'),
    ('visit.read',               false, 'B', 'B', 'B', 'B', '–', 'G',   'G',   '–'),
    ('visit.create',             false, 'B', 'B', 'B', '–', '–', '–',   '–',   '–'),
    ('visit.update',             false, 'O', 'T', 'B', '–', '–', '–',   'G',   '–'),
    ('interaction.read',         false, 'B', 'B', 'B', 'B', '–', 'G',   'G',   '–'),
    ('interaction.create',       false, 'B', 'B', 'B', '–', '–', '–',   'G',   '–'),
    ('interaction.update',       false, 'O', 'T', 'B', '–', '–', '–',   '–',   '–'),
    ('lead.read',                false, 'B', 'B', 'B', 'B', '–', 'G',   'G',   '–'),
    ('lead.create',              false, 'B', 'B', 'B', '–', '–', '–',   'G',   '–'),
    ('lead.update',              false, 'O', 'T', 'B', '–', '–', '–',   'G',   '–'),
    ('lead.assign',              false, '–', 'T', 'B', '–', '–', '–',   'G',   '–'),
    ('lead.reopen',              false, '–', '–', 'B', '–', '–', '–',   'G',   '–'),
    ('opportunity.read',         false, 'B', 'B', 'B', 'B', '–', 'G',   'G',   '–'),
    ('opportunity.create',       false, 'B', 'B', 'B', '–', '–', '–',   '–',   '–'),
    ('opportunity.update',       false, 'O', 'T', 'B', '–', '–', '–',   'G',   '–'),
    ('opportunity.assign',       false, '–', 'T', 'B', '–', '–', '–',   'G',   '–'),
    ('opportunity.close',        false, 'O', 'T', 'B', '–', '–', '–',   'G',   '–'),
    ('opportunity.reopen',       false, '–', '–', 'B', '–', '–', '–',   'G',   '–'),
    ('quotation.read',           false, 'B', 'B', 'B', 'B', '–', 'G',   'G',   '–'),
    ('quotation.create',         false, 'O', 'T', 'B', '–', '–', '–',   '–',   '–'),
    ('quotation.update',         false, 'O', 'T', 'B', '–', '–', '–',   '–',   '–'),
    ('task.read',                false, 'O', 'T', 'B', 'B', '–', 'G',   'G',   '–'),
    ('task.create',              false, 'O', 'T', 'B', '–', '–', '–',   'G',   '–'),
    ('task.update',              false, 'O', 'T', 'B', '–', '–', '–',   'G',   '–'),
    ('task.assign',              false, '–', 'T', 'B', '–', '–', '–',   'G',   '–'),
    ('transaction.read',         false, 'B', 'B', 'B', 'B', '–', 'G',   'G',   '–'),
    ('transaction.link',         false, 'O', 'T', 'B', '–', '–', '–',   'G',   '–'),
    ('tag.manage',               false, '–', '–', '–', '–', 'G', '–',   'G',   '–'),
    ('campaign.read',            false, '–', '–', 'B', 'B', 'G', 'G',   'G',   '–'),
    ('campaign.manage',          false, '–', '–', '–', '–', 'G', '–',   'G',   '–'),
    ('dashboard.view',           false, 'O', 'T', 'B', 'B', 'G', 'G',   'G',   '–'),
    ('report.view',              false, '–', 'T', 'B', 'B', 'G', 'G',   'G',   '–'),
    ('report.staff_performance', false, '–', 'T', 'B', 'B', '–', 'G',   'G',   '–'),
    ('report.export',            false, '–', 'T', 'B', 'B', 'G', 'G',   'G',   '–'),
    ('data_quality.view',        false, 'O', 'T', 'B', 'B', '–', 'G',   'G',   '–'),
    ('data_quality.resolve',     false, 'O', 'T', 'B', '–', '–', '–',   'G',   '–'),
    ('dsr.create',               false, 'B', 'B', 'B', '–', '–', '–',   'G',   '–'),
    ('dsr.manage',               true,  '–', '–', '–', '–', '–', '–',   'G',   '–'),
    ('master_data.manage',       true,  '–', '–', '–', '–', '–', '–',   'G',   '–'),
    ('team.manage',              false, '–', '–', 'B', '–', '–', '–',   'G',   '–'),
    ('user.read',                false, '–', 'T', 'B', 'B', '–', 'G',   'G',   'S'),
    ('user.invite',              false, '–', '–', 'B', '–', '–', '–',   'G',   'S'),   -- SA = S¹
    ('user.update',              false, '–', '–', 'B', '–', '–', '–',   'G',   'S'),   -- SA = S¹
    ('user.disable',             true,  '–', '–', 'B', '–', '–', '–',   'G',   'S'),   -- SA = S¹
    ('role.assign',              true,  '–', '–', 'B', '–', '–', '–',   'G',   '–'),
    ('role.request',             false, '–', '–', '–', '–', '–', '–',   '–',   'S'),
    ('role.decide',              true,  '–', '–', '–', '–', '–', 'G',   '–',   '–'),
    ('export.approve',           true,  '–', '–', '–', '–', '–', 'G',   'G',   '–'),
    ('audit.read',               false, '–', '–', '–', '–', '–', 'G',   'G',   '–'),
    ('security_log.read',        false, '–', '–', '–', '–', '–', 'G',   'G',   'S'),
    ('settings.business',        true,  '–', '–', '–', '–', '–', '–',   'G',   '–'),
    ('settings.system',          true,  '–', '–', '–', '–', '–', '–',   '–',   'S'),
    ('integration.manage',       true,  '–', '–', '–', '–', '–', '–',   '–',   'S')
),
cells AS (
    SELECT m.permission_code, m.perm_aal2, c.role_code, c.cell
    FROM matrix m
    CROSS JOIN LATERAL (VALUES
        ('STAFF', m.st), ('SUPERVISOR', m.sv), ('BRANCH_MANAGER', m.bm), ('OPERATIONS', m.op),
        ('MARKETING', m.mk), ('EXECUTIVE', m.ex), ('BUSINESS_ADMIN', m.ba), ('SYSTEM_ADMIN', m.sa)
    ) AS c (role_code, cell)
    WHERE c.cell <> '–'
)
INSERT INTO core.role_permissions (role_code, permission_code, scope, requires_aal2)
SELECT role_code,
       permission_code,
       (CASE left(cell, 1)
            WHEN 'O' THEN 'OWN'
            WHEN 'T' THEN 'TEAM'
            WHEN 'B' THEN 'BRANCH'
            WHEN 'G' THEN 'ORGANIZATION'
            WHEN 'S' THEN 'SYSTEM'
        END)::core.data_scope,
       perm_aal2 OR cell LIKE '%🔐'
FROM cells;

-- ตรวจการถอดตาราง: 63 สิทธิ์ · 228 ช่อง · 23 ช่องที่ต้อง aal2 (นับมือจากตารางข้อ 8.1)
DO $$
DECLARE
    v_perms  integer;
    v_cells  integer;
    v_aal2   integer;
BEGIN
    SELECT count(*) INTO v_perms FROM core.permissions;
    SELECT count(*), count(*) FILTER (WHERE requires_aal2) INTO v_cells, v_aal2 FROM core.role_permissions;
    IF v_perms <> 63 OR v_cells <> 228 OR v_aal2 <> 23 THEN
        RAISE EXCEPTION 'ตารางสิทธิ์ไม่ตรง CANONICAL ข้อ 8.1: permissions=% (63) cells=% (228) aal2=% (23)', v_perms, v_cells, v_aal2;
    END IF;
END;
$$;


-- =====================================================================================
-- ส่วนที่ 7 — การมอบบทบาท (CANONICAL ข้อ 7.1)
-- =====================================================================================

CREATE TABLE core.staff_role_assignments (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid        NOT NULL REFERENCES core.organizations (id),
    staff_id         uuid        NOT NULL REFERENCES core.staff_profiles (id),
    role_code        text        NOT NULL REFERENCES core.roles (code),
    branch_id        uuid        REFERENCES core.branches (id),
    valid_from       timestamptz NOT NULL DEFAULT now(),
    valid_to         timestamptz,
    granted_by       uuid        REFERENCES core.staff_profiles (id),
    grant_reason     text,
    revoked_by       uuid        REFERENCES core.staff_profiles (id),
    revoke_reason    text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        REFERENCES core.staff_profiles (id),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid        REFERENCES core.staff_profiles (id),

    -- บทบาทองค์กร ⇔ branch_id ว่าง · บทบาทสาขา (STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS) ต้องมี branch_id (ข้อ 7.1)
    CONSTRAINT staff_role_assignments_branch_chk
        CHECK ((role_code IN ('MARKETING', 'EXECUTIVE', 'BUSINESS_ADMIN', 'SYSTEM_ADMIN')) = (branch_id IS NULL)),
    CONSTRAINT staff_role_assignments_valid_range_chk
        CHECK (valid_to IS NULL OR valid_to >= valid_from),
    CONSTRAINT staff_role_assignments_revoke_chk
        CHECK (revoked_by IS NULL OR valid_to IS NOT NULL),
    -- ห้ามมอบ/ถอนบทบาทของตนเอง (ข้อ 7.2)
    CONSTRAINT staff_role_assignments_not_self_grant_chk
        CHECK (granted_by IS NULL OR granted_by <> staff_id),
    CONSTRAINT staff_role_assignments_not_self_revoke_chk
        CHECK (revoked_by IS NULL OR revoked_by <> staff_id)
);

-- แถวที่ยังไม่สิ้นสุดของ (คน, บทบาท, สาขา) มีได้แถวเดียว · NULLS NOT DISTINCT ให้บทบาทองค์กร (branch_id ว่าง) ซ้ำไม่ได้ด้วย
CREATE UNIQUE INDEX staff_role_assignments_open_uidx
    ON core.staff_role_assignments (staff_id, role_code, branch_id) NULLS NOT DISTINCT
    WHERE valid_to IS NULL;
CREATE INDEX staff_role_assignments_staff_id_idx  ON core.staff_role_assignments (staff_id, valid_to);
CREATE INDEX staff_role_assignments_branch_id_idx ON core.staff_role_assignments (branch_id);
CREATE INDEX staff_role_assignments_role_code_idx ON core.staff_role_assignments (role_code);

COMMENT ON TABLE core.staff_role_assignments IS
'การมอบบทบาทให้พนักงาน (ข้อ 7.1) · คนเดียวมีหลายแถวได้ ("Multi-Branch" = หลายแถวคนละสาขา) · scope ประเมินต่อแถวแล้วรวมแบบ OR ห้ามยุบข้ามสาขา (ข้อ 8.0) · '
'แถวมีผลเมื่อ staff ACTIVE และ valid_from ≤ now() < coalesce(valid_to, ∞) และ (บทบาท requires_mfa → aal2) · '
'ความคาดหวังเรื่องการแก้ไข: หลังสร้างแล้วแก้ได้เฉพาะ valid_to · revoked_by · revoke_reason (การถอน) — คอลัมน์อื่นห้ามเปลี่ยน ห้ามลบแถว '
'(บังคับด้วย trigger/RPC ใน migration ถัดไป · api.assign_role / api.revoke_role / api.disable_staff) · '
'helper ห้ามตีความ branch_id NULL ของบทบาทสาขาเป็นทุกสาขา · SYSTEM_ADMIN ห้ามถือร่วมกับบทบาทธุรกิจ (trigger ต้อง SELECT … FOR UPDATE แถว core.staff_profiles ก่อนตรวจ) · '
'ห้ามถือ MARKETING ร่วมกับ BUSINESS_ADMIN [รอยืนยัน Q22]';
COMMENT ON COLUMN core.staff_role_assignments.role_code IS 'บทบาทที่มอบ';
COMMENT ON COLUMN core.staff_role_assignments.branch_id IS
'สาขาของการมอบ · ต้องมีสำหรับ STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS · ต้องว่างสำหรับ MARKETING EXECUTIVE BUSINESS_ADMIN SYSTEM_ADMIN';
COMMENT ON COLUMN core.staff_role_assignments.valid_from IS 'เริ่มมีผล (ตัดสินด้วย now() · ข้อ 1.2)';
COMMENT ON COLUMN core.staff_role_assignments.valid_to IS
'สิ้นสุดผล (ไม่รวมเวลานี้) · NULL = ยังมีผล · ถอน/ปิดใช้งานตั้งเป็น now() (ถ้า valid_from ยังไม่ถึงให้ตั้งเท่า valid_from เพื่อผ่าน CHECK)';
COMMENT ON COLUMN core.staff_role_assignments.granted_by IS 'ผู้มอบ · NULL = สคริปต์ bootstrap หรือผลอนุมัติคำขอ (บันทึกผู้อนุมัติใน core.role_grant_requests)';
COMMENT ON COLUMN core.staff_role_assignments.grant_reason IS 'เหตุผลการมอบ';
COMMENT ON COLUMN core.staff_role_assignments.revoked_by IS 'ผู้ถอน (มีค่าได้เมื่อ valid_to มีค่า) · ต้องไม่ใช่เจ้าของแถว';
COMMENT ON COLUMN core.staff_role_assignments.revoke_reason IS 'เหตุผลการถอน';


-- =====================================================================================
-- ส่วนที่ 8 — คำขอมอบบทบาทสูง (CANONICAL ข้อ 7.2)
-- =====================================================================================

CREATE TABLE core.role_grant_requests (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid        NOT NULL REFERENCES core.organizations (id),
    request_no       text        NOT NULL UNIQUE,
    role_code        text        NOT NULL REFERENCES core.roles (code),
    target_staff_id  uuid        NOT NULL REFERENCES core.staff_profiles (id),
    requested_by     uuid        NOT NULL REFERENCES core.staff_profiles (id),
    requested_at     timestamptz NOT NULL DEFAULT now(),
    request_reason   text,
    status           text        NOT NULL DEFAULT 'REQUESTED',
    decided_by       uuid        REFERENCES core.staff_profiles (id),
    decided_at       timestamptz,
    decision_note    text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        REFERENCES core.staff_profiles (id),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid        REFERENCES core.staff_profiles (id),

    CONSTRAINT role_grant_requests_no_chk      CHECK (request_no ~ '^RG-[0-9]{4}-[0-9]{4,}$'),
    CONSTRAINT role_grant_requests_role_chk    CHECK (role_code IN ('SYSTEM_ADMIN', 'EXECUTIVE', 'BUSINESS_ADMIN')),
    CONSTRAINT role_grant_requests_status_chk  CHECK (status IN ('REQUESTED', 'APPROVED', 'REJECTED')),
    CONSTRAINT role_grant_requests_decided_chk CHECK ((status = 'REQUESTED') = (decided_by IS NULL)
                                                      AND (decided_by IS NULL) = (decided_at IS NULL)),
    -- ผู้อนุมัติ ≠ ผู้ยื่น ≠ ผู้รับ (ข้อ 7.2) · "≠ บัญชีที่ employee_code เดียวกับผู้รับ" ตรวจใน api.decide_role_grant
    CONSTRAINT role_grant_requests_requester_chk CHECK (requested_by <> target_staff_id),
    CONSTRAINT role_grant_requests_decider_chk   CHECK (decided_by IS NULL
                                                        OR (decided_by <> requested_by AND decided_by <> target_staff_id))
);

-- คำขอที่ยังรอตัดสินของ (ผู้รับ, บทบาท) มีได้รายการเดียว
CREATE UNIQUE INDEX role_grant_requests_open_uidx
    ON core.role_grant_requests (target_staff_id, role_code)
    WHERE status = 'REQUESTED';
CREATE INDEX role_grant_requests_status_idx ON core.role_grant_requests (status);

COMMENT ON TABLE core.role_grant_requests IS
'คำขอมอบบทบาทสูง (ข้อ 7.2 · D22) · SYSTEM_ADMIN ยื่นขอ SYSTEM_ADMIN/EXECUTIVE/BUSINESS_ADMIN ผ่าน api.request_role_grant (role.request) · '
'EXECUTIVE อนุมัติ/ปฏิเสธผ่าน api.decide_role_grant (role.decide 🔐) · แจ้ง ROLE_GRANT_APPROVAL_REQUIRED ให้ EXECUTIVE ทุกคน (ยกเว้นผู้รับ) · '
'seed: RG-2026-0003 ขอ SYSTEM_ADMIN ให้ ST-0051 โดย ST-0003 · รอ EXECUTIVE';
COMMENT ON COLUMN core.role_grant_requests.request_no IS 'เลขคำขอ RG-{YYYY}-{NNNN} ตัวนับ RG:{YYYY} (ข้อ 6.1)';
COMMENT ON COLUMN core.role_grant_requests.role_code IS 'บทบาทที่ขอ (บทบาทระดับองค์กร จึงไม่มีสาขา)';
COMMENT ON COLUMN core.role_grant_requests.target_staff_id IS 'ผู้รับบทบาท';
COMMENT ON COLUMN core.role_grant_requests.requested_by IS 'ผู้ยื่นคำขอ (SYSTEM_ADMIN)';
COMMENT ON COLUMN core.role_grant_requests.status IS
'REQUESTED รอตัดสิน · APPROVED อนุมัติ (สร้าง staff_role_assignments ในทรานแซกชันเดียวกัน) · REJECTED ปฏิเสธ · '
'หมายเหตุผู้เขียน: CANONICAL ไม่ระบุชุดค่าสถานะ ผู้เขียนใช้ชื่อเดียวกับ audit.export_status (REQUESTED/APPROVED/REJECTED) [รอยืนยัน]';
COMMENT ON COLUMN core.role_grant_requests.decided_by IS 'EXECUTIVE ผู้ตัดสิน (aal2)';
COMMENT ON COLUMN core.role_grant_requests.decided_at IS 'เวลาตัดสิน';
COMMENT ON COLUMN core.role_grant_requests.decision_note IS 'หมายเหตุการตัดสิน';


-- =====================================================================================
-- ส่วนที่ 9 — FK ของตาราง app ที่รอ core (จาก 0001)
-- =====================================================================================

ALTER TABLE app.settings
    ADD CONSTRAINT settings_updated_by_fkey  FOREIGN KEY (updated_by)  REFERENCES core.staff_profiles (id),
    ADD CONSTRAINT settings_editable_by_fkey FOREIGN KEY (editable_by) REFERENCES core.permissions (code);

ALTER TABLE app.rate_limit_counters
    ADD CONSTRAINT rate_limit_counters_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES core.staff_profiles (id);


-- =====================================================================================
-- ส่วนที่ 10 — updated_at trigger · RLS (policy อยู่ใน migration 0010)
-- =====================================================================================

CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON core.organizations          FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON core.staff_profiles         FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON core.business_units         FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON core.branches               FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON core.departments            FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON core.teams                  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON core.team_members           FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON core.devices                FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON core.staff_invitations      FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON core.roles                  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON core.permissions            FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON core.role_permissions       FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON core.staff_role_assignments FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON core.role_grant_requests    FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE core.organizations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.staff_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.business_units         ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.branches               ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.departments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.teams                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.team_members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.devices                ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.staff_invitations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.roles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.permissions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.role_permissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.staff_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.role_grant_requests    ENABLE ROW LEVEL SECURITY;
