# Data Dictionary — JAUN CRM · Customer 360

> เอกสารชุดที่ **07** ตาม A45 · **ฉบับ Phase 0**
> **ไฟล์นี้สร้างอัตโนมัติ — ห้ามแก้ด้วยมือ** · สร้างใหม่ด้วย `npm run db:dictionary` (`tools/db/gen-data-dictionary.mjs`)
> แหล่งจริงคือ **ฐานข้อมูลที่ได้จาก `supabase/migrations/`** (13 ไฟล์: `0001_foundation.sql` … `0013_jobs.sql`) รันบน PGlite (PostgreSQL 17.5) · **ไม่โหลด seed**
> ข้าม `*_cron.sql` (1 ไฟล์: `0014_schedule_cron.sql`) เพราะ `cron.schedule` มีเฉพาะบน Supabase (CANONICAL ข้อ 9.6)
> ค่าทุกค่าอ้างอิง `docs/00-brief/CANONICAL.md` **v2.2** · ถ้าเอกสารนี้ขัดกับ CANONICAL **CANONICAL ชนะ**
> เอกสารคู่กัน: `docs/03-data/er-diagram.md` (ความสัมพันธ์) · `docs/03-data/schema-notes.md` (ข้อตกลงและเหตุผล) · `docs/04-security/rls-spec.md` (ตรรกะของ policy) · `docs/07-api/api-spec.md` (สัญญาของ RPC)

## 0. วิธีอ่านเอกสารนี้

| สิ่งที่เห็น | ความหมาย |
|---|---|
| `pii` ในคอลัมน์ | COMMENT ของคอลัมน์ขึ้นต้นด้วย `[pii]` (CANONICAL ข้อ 19.1 ข้อ 3) · audit บันทึกเป็นค่าปิดบัง + `sha256` และ `app.anonymize_customer` ล้างคอลัมน์นี้ (ข้อ 9.5 · 10.4) |
| คำอธิบายคอลัมน์/ตาราง | `COMMENT` ในฐานข้อมูล (ตัดคำนำหน้า `[pii]` ออกแล้ว) · เขียนโดย migration |
| **RLS** | `เปิด` = `relrowsecurity` · `FORCE` = `relforcerowsecurity` (ข้อ 9.4 กติกา 1: FORCE ไม่ใช่ชั้นป้องกันจริงเพราะ owner = `postgres`) · **บังคับเปิดเฉพาะ `core` `ref` `crm`** — `app` `audit` `analytics` คุมด้วย GRANT (ข้อ 9.4 กติกา 6 · 19.1 ข้อ 13) |
| ตาราง GRANT | เฉพาะสิทธิ์ที่มอบให้ role ของระบบ (`anon` · `authenticated` · `service_role` · `supabase_auth_admin` · `audit_retention`) · **ตัดสิทธิ์ของ owner ออก** (บน Supabase owner = `postgres` · บน PGlite = `web_user`) |
| ตารางที่ไม่มีบรรทัด GRANT | ไม่มี role ใดเข้าถึงได้เลย — เขียน/อ่านผ่าน trigger หรือ RPC `SECURITY DEFINER` เท่านั้น |
| `ป้ายไทย` ของ ENUM | มาจาก CANONICAL ข้อ 4 (ฐานข้อมูล**ไม่เก็บ**ป้ายไทยของ ENUM ตามข้อ 4) · ค่าที่ CANONICAL ไม่ได้พิมพ์ป้ายไทยไว้เขียน **รอยืนยัน** ตามกฎของ CANONICAL |
| **[รอยืนยัน]** | ค่าที่ CANONICAL ติดป้ายรอยืนยัน |
| ⚠ | generator ตรวจแล้วไม่ตรงกับฐานข้อมูล (ดูข้อ 8) |

ชนิดข้อมูลและ default พิมพ์ตามที่ `format_type()` / `pg_get_expr()` คืนมา จึงเป็นข้อความเดียวกับที่ `psql \d` แสดง

## 1. สรุปภาพรวม

| schema | เก็บอะไร (ข้อ 1.1) | Data API | ตาราง | view | ฟังก์ชัน | ENUM | เปิด RLS |
|---|---|:--:|---:|---:|---:|---:|---|
| `core` | องค์กร · สาขา · ทีม · พนักงาน · บทบาท · สิทธิ์ · อุปกรณ์ | ✓ | 14 | 0 | 0 | 2 | 14 / 14 |
| `ref` | Master Data (lookup) · ค่ากลาง ไม่มี `organization_id` | ✓ | 16 | 0 | 0 | 0 | 16 / 16 |
| `crm` | ลูกค้า · กิจกรรม · lead · opportunity · quotation · task · transaction ref · notification | ✓ | 26 | 1 | 0 | 15 | 26 / 26 |
| `app` | helper ตรวจสิทธิ์ · trigger · งานตามเวลา · settings · running numbers | ✗ | 3 | 0 | 115 | 0 | 3 / 3 |
| `analytics` | view ภายในสำหรับคำนวณ KPI (ใช้ใน RPC เท่านั้น) | ✗ | 0 | 3 | 0 | 0 | – |
| `audit` | audit_logs · access_logs · login_events · export_requests · integration_logs | ✗ | 5 | 0 | 5 | 2 | 0 / 5 |
| `api` | RPC ที่หน้าจอเรียก (ข้อ 9.6) | ✓ | 0 | 0 | 58 | 0 | – |
| `restricted` | เอกสารสำคัญ (ปิดใช้งานใน V1) | ✗ | 0 | 0 | 0 | 0 | – |

รวม **64 ตาราง** · **4 view** · **178 ฟังก์ชัน** · **19 ENUM** · **845 คอลัมน์** · **113 policy** · **219 index** · **213 trigger**

GRANT ระดับ schema (ข้อ 1.1): `api` `crm` `core` `ref` → `authenticated`, `service_role` · `app` → `authenticated` · `anon` ไม่มี GRANT ใดในทุก schema ของระบบ

- `core` — องค์กร · สาขา · ทีม · พนักงาน · บทบาท · สิทธิ์ · อุปกรณ์ · เปิดผ่าน Data API · SELECT ตาม RLS
- `ref` — Master Data (lookup) ค่ากลางไม่มี organization_id · เปิดผ่าน Data API · SELECT ตาม RLS
- `crm` — ลูกค้า · กิจกรรม · lead · opportunity · quotation · task · transaction ref · notification · เปิดผ่าน Data API · สิทธิ์ตามตาราง + column grant (ข้อ 9.4)
- `app` — helper ตรวจสิทธิ์ · trigger · งานตามเวลา · settings · running numbers · ไม่เปิดผ่าน Data API · authenticated ได้ EXECUTE เฉพาะ helper ข้อ 9.3
- `analytics` — view ภายในสำหรับคำนวณ KPI ใช้ใน RPC เท่านั้น · ไม่เปิดผ่าน Data API · ไม่มี GRANT ให้ authenticated
- `audit` — audit_logs · access_logs · login_events · export_requests · integration_logs · ไม่เปิดผ่าน Data API · ไม่มี GRANT ให้ authenticated
- `api` — RPC ที่หน้าจอเรียก (CANONICAL ข้อ 9.6) · เปิดผ่าน Data API · authenticated ได้ EXECUTE รายฟังก์ชันเท่านั้น
- `restricted` — เอกสารสำคัญระดับ Restricted (ข้อ 10.1) · ปิดใช้งานใน V1 · ไม่มี GRANT ให้ role ใด

## 2. ENUM

ENUM ใช้กับชุดค่าที่ระบบใช้ตัดสินใจ อยู่ใน schema ของตารางที่ใช้ และอ้างชื่อเต็มเสมอ · **เพิ่มค่า = migration ไฟล์เดี่ยวที่มีแค่ `ALTER TYPE … ADD VALUE`** (CANONICAL ข้อ 4) · ลำดับที่แสดงคือ `enumsortorder` จริงในฐานข้อมูล

### `audit.actor_type`

ใช้ที่: `audit.audit_logs.actor_type` · ป้ายไทยจาก CANONICAL ข้อ 4.8 · 9.5

> CANONICAL ไม่ได้พิมพ์ป้ายไทยของค่าเหล่านี้

| # | ค่า | ป้ายไทย | ความหมาย |
|---:|---|---|---|
| 1 | `STAFF` | รอยืนยัน | จาก `app.current_staff_id()` |
| 2 | `SYSTEM` | รอยืนยัน | งานตามเวลา (เช่น `actor_label = 'SYSTEM:close_stale_visits'`) |
| 3 | `INTEGRATION` | รอยืนยัน | ระบบภายนอกผ่าน Edge Function |

### `audit.export_status`

ใช้ที่: `audit.export_requests.status` · ป้ายไทยจาก CANONICAL ข้อ 4.8 · 8.2

| # | ค่า | ป้ายไทย | ความหมาย |
|---:|---|---|---|
| 1 | `REQUESTED` | รออนุมัติ | – |
| 2 | `APPROVED` | อนุมัติแล้ว | คำขอ BRANCH_MANAGER ที่ไม่เกินเพดาน = `APPROVED` ทันที (`approved_by` NULL) |
| 3 | `REJECTED` | ไม่อนุมัติ | – |
| 4 | `GENERATED` | พร้อมดาวน์โหลด | แจ้ง `EXPORT_READY` |
| 5 | `DOWNLOADED` | ดาวน์โหลดแล้ว | ดาวน์โหลดได้ < 3 ครั้ง ภายใน 24 ชม. |
| 6 | `EXPIRED` | หมดอายุ | `app.job_expire_exports` · ลบไฟล์ · คงจำนวนครั้งดาวน์โหลด |

### `core.data_scope`

ใช้ที่: `core.role_permissions.scope` · ป้ายไทยจาก CANONICAL ข้อ 4.8 · 8.0

> CANONICAL ไม่ได้พิมพ์ป้ายไทยของค่าเหล่านี้ · ความหมายมาจากข้อ 8.0 · **ประกาศตามลำดับนี้** และการเทียบ `>=` ต้องมี `scope <> 'SYSTEM'`

| # | ค่า | ป้ายไทย | ความหมาย |
|---:|---|---|---|
| 1 | `OWN` | รอยืนยัน | แถวของตน: `branch_id` = สาขาของ assignment **และ** owner เป็นตน (หรือ owner ว่างและ `created_by` = ตน) |
| 2 | `TEAM` | รอยืนยัน | owner อยู่ในทีมที่ตนเป็น `is_leader` ในสาขานั้น |
| 3 | `BRANCH` | รอยืนยัน | ทุกแถวที่ `branch_id` = สาขาของ assignment |
| 4 | `ORGANIZATION` | รอยืนยัน | ทุกแถวในองค์กรของผู้ใช้ |
| 5 | `SYSTEM` | รอยืนยัน | เฉพาะวัตถุระบบ (บัญชี · settings เชิงเทคนิค · integration) **ไม่รวมข้อมูลลูกค้า** |

### `core.staff_status`

ใช้ที่: `core.staff_profiles.status` · ป้ายไทยจาก CANONICAL ข้อ 4.8

| # | ค่า | ป้ายไทย | ความหมาย |
|---:|---|---|---|
| 1 | `INVITED` | เชิญแล้ว | คำเชิญอายุ 24 ชม. (`invite_expires_at` ข้อ 7.3) |
| 2 | `ACTIVE` | ใช้งาน | – |
| 3 | `DISABLED` | ปิดใช้งาน | **ห้ามลบแถว** (ข้อ 7.3) |

### `crm.consent_capture_via`

ใช้ที่: `crm.customer_consent_current.captured_via` · `crm.customer_consents.captured_via` · ป้ายไทยจาก CANONICAL ข้อ 4.8

| # | ค่า | ป้ายไทย | ความหมาย |
|---:|---|---|---|
| 1 | `STAFF_FORM` | พนักงานบันทึก | – |
| 2 | `LINK_SENT` | ส่งลิงก์ประกาศ | ช่องทางออนไลน์/โทรใช้ค่านี้กับ `PRIVACY_NOTICE` (ข้อ 10.2) |
| 3 | `LINE_OA` | ผ่าน LINE OA | – |
| 4 | `WEB` | ผ่านเว็บไซต์ | – |

### `crm.consent_status`

ใช้ที่: `crm.customer_consent_current.status` · `crm.customer_consents.status` · ป้ายไทยจาก CANONICAL ข้อ 4.8 · 10.2

| # | ค่า | ป้ายไทย | ความหมาย |
|---:|---|---|---|
| 1 | `GRANTED` | ยินยอม/แจ้งแล้ว | – |
| 2 | `WITHDRAWN` | ถอนแล้ว | append-only: ถอน = แถวใหม่ ไม่มีคอลัมน์ `withdrawn_at` |

### `crm.contact_type`

ใช้ที่: `crm.customer_contacts.contact_type` · ป้ายไทยจาก CANONICAL ข้อ 4.8 · 6.4

> CANONICAL ไม่ได้พิมพ์ป้ายไทยของค่าเหล่านี้ · หมายเหตุ = กติกา normalize/mask ข้อ 6.4

| # | ค่า | ป้ายไทย | ความหมาย |
|---:|---|---|---|
| 1 | `PHONE` | รอยืนยัน | `value_normalized` = E.164 · `value_masked` = `081-XXX-5678` / `02-XXX-4567` |
| 2 | `LINE_ID` | รอยืนยัน | ตัดช่องว่าง ตัวพิมพ์เล็ก ตัด `@` นำหน้า · mask = 2 อักษรแรก + `***` |
| 3 | `LINE_USER_ID` | รอยืนยัน | ตามที่ LINE ส่ง · **ไม่แสดง** (`—`) |
| 4 | `FACEBOOK` | รอยืนยัน | ตัดช่องว่าง ตัวพิมพ์เล็ก · mask = 2 อักษรแรก + `***` |
| 5 | `INSTAGRAM` | รอยืนยัน | ตัดช่องว่าง ตัวพิมพ์เล็ก · mask = 2 อักษรแรก + `***` |
| 6 | `TIKTOK` | รอยืนยัน | ตัดช่องว่าง ตัวพิมพ์เล็ก · mask = 2 อักษรแรก + `***` |
| 7 | `EMAIL` | รอยืนยัน | ตัดช่องว่าง ตัวพิมพ์เล็ก · mask = `s***@example.com` |

### `crm.customer_link_via`

ใช้ที่: `crm.customer_branches.linked_via` · ป้ายไทยจาก CANONICAL ข้อ 4.8 · 6.6

> CANONICAL ไม่ได้พิมพ์ป้ายไทยของค่าเหล่านี้

| # | ค่า | ป้ายไทย | ความหมาย |
|---:|---|---|---|
| 1 | `CREATED` | รอยืนยัน | ผูกตอนสร้างลูกค้า (`first_branch_id`) |
| 2 | `VISIT` | รอยืนยัน | ผูกจาก visit |
| 3 | `INTERACTION` | รอยืนยัน | ผูกจาก interaction |
| 4 | `LEAD` | รอยืนยัน | ผูกจาก lead |
| 5 | `OPPORTUNITY` | รอยืนยัน | ผูกจาก opportunity |
| 6 | `MANUAL_LINK` | รอยืนยัน | `api.link_customer_to_branch` · transaction ref ใช้ค่านี้ใน V1 |
| 7 | `MERGE` | รอยืนยัน | ผูกจากการรวมลูกค้า (`api.merge_customers`) |

### `crm.customer_record_status`

ใช้ที่: `crm.customers.record_status` · ป้ายไทยจาก CANONICAL ข้อ 4.8

> CANONICAL ไม่ได้พิมพ์ป้ายไทยของค่าเหล่านี้

| # | ค่า | ป้ายไทย | ความหมาย |
|---:|---|---|---|
| 1 | `ACTIVE` | รอยืนยัน | ลูกค้าปกติ |
| 2 | `MERGED` | รอยืนยัน | ถูกรวมเข้ากับรายอื่น · บังคับ `merged_into_id` (ข้อ 6.7) |
| 3 | `ANONYMIZED` | รอยืนยัน | ทำข้อมูลนิรนามแล้ว (ข้อ 10.4) · ยังผ่าน RLS ได้เพราะไม่มี PII แล้ว |

### `crm.dsr_status`

ใช้ที่: `crm.data_subject_requests.status` · ป้ายไทยจาก CANONICAL ข้อ 4.8

| # | ค่า | ป้ายไทย | ความหมาย |
|---:|---|---|---|
| 1 | `RECEIVED` | รับคำขอแล้ว | – |
| 2 | `VERIFIED` | ยืนยันตัวตนแล้ว | จำเป็นก่อน `DELETION` · `verified_by` ≠ ผู้ดำเนินการ (ข้อ 10.4) |
| 3 | `IN_PROGRESS` | กำลังดำเนินการ | – |
| 4 | `COMPLETED` | เสร็จสิ้น | – |
| 5 | `REJECTED` | ปฏิเสธคำขอ | – |

### `crm.dsr_type`

ใช้ที่: `crm.data_subject_requests.request_type` · ป้ายไทยจาก CANONICAL ข้อ 4.8

| # | ค่า | ป้ายไทย | ความหมาย |
|---:|---|---|---|
| 1 | `ACCESS` | ขอดู/ขอสำเนา | `api.build_dsr_package` |
| 2 | `CORRECTION` | ขอแก้ไข | – |
| 3 | `DELETION` | ขอลบ | `api.anonymize_customer` (ข้อ 10.4) |
| 4 | `OBJECTION` | คัดค้าน | – |
| 5 | `WITHDRAW_CONSENT` | ถอนความยินยอม | – |
| 6 | `PORTABILITY` | ขอโอนย้าย | `api.build_dsr_package` |

### `crm.duplicate_status`

ใช้ที่: `crm.duplicate_decisions.status` · ป้ายไทยจาก CANONICAL ข้อ 4.8

| # | ค่า | ป้ายไทย | ความหมาย |
|---:|---|---|---|
| 1 | `PENDING` | รอตัดสิน | นับใน `DUPLICATE_RATE` และ `DUPLICATE_SUSPECTED` (ข้อ 12.3) |
| 2 | `MERGED` | รวมแล้ว | – |
| 3 | `NOT_DUPLICATE` | ยืนยันคนละคน | `api.decide_duplicate` · ผู้ตัดสิน ≠ ผู้สร้างแถว |

### `crm.interaction_direction`

ใช้ที่: `crm.interactions.direction` · ป้ายไทยจาก CANONICAL ข้อ 4.8

| # | ค่า | ป้ายไทย | ความหมาย |
|---:|---|---|---|
| 1 | `INBOUND` | ลูกค้าติดต่อมา | นับใน "ติดต่อ N ครั้ง" (ข้อ 3.3) |
| 2 | `OUTBOUND` | พนักงานติดต่อไป | ไม่สร้าง visit (ข้อ 3.3) · นับใน "ติดต่อ N ครั้ง" |
| 3 | `INTERNAL` | บันทึกภายใน | ไม่สร้าง visit · **ไม่นับ** ใน "ติดต่อ N ครั้ง" · ใช้กับ `interaction_type_code = 'NOTE'` |

### `crm.interest_level`

ใช้ที่: `crm.leads.interest_level` · `crm.opportunity_items.interest_level` · ป้ายไทยจาก CANONICAL ข้อ 4.8 **[รอยืนยัน]**

| # | ค่า | ป้ายไทย | ความหมาย |
|---:|---|---|---|
| 1 | `HOT` | สนใจมาก | เรียงก่อนใน "สินค้าที่สนใจ" (ข้อ 6.8) |
| 2 | `WARM` | สนใจ | – |
| 3 | `COLD` | สนใจน้อย | – |

### `crm.lead_status`

ใช้ที่: `crm.lead_status_history.from_status` · `crm.lead_status_history.to_status` · `crm.leads.status` · ป้ายไทยจาก CANONICAL ข้อ 4.3

| # | ค่า | ป้ายไทย | ความหมาย |
|---:|---|---|---|
| 1 | `NEW` | ใหม่ | ยังไม่มีการตอบกลับ |
| 2 | `CONTACTED` | ติดต่อแล้ว | มีการตอบกลับครั้งแรกแล้ว (`first_contacted_at`) |
| 3 | `QUALIFIED` | คัดกรองแล้ว | ยืนยันความต้องการ งบ และช่วงเวลาซื้อ |
| 4 | `CONVERTED` | แปลงเป็นโอกาสขาย | บังคับ `converted_opportunity_id` + `closed_at` · แปลงผ่าน `api.convert_lead` เท่านั้น |
| 5 | `LOST` | ไม่สำเร็จ | บังคับ `lost_reason_code` + `closed_at` |

### `crm.opportunity_stage`

ใช้ที่: `crm.opportunities.stage` · `crm.opportunity_stage_history.from_stage` · `crm.opportunity_stage_history.to_stage` · ป้ายไทยจาก CANONICAL ข้อ 4.4

| # | ค่า | ป้ายไทย | ความหมาย |
|---:|---|---|---|
| 1 | `INTERESTED` | สนใจ | มีโอกาสซื้อจริง ยังไม่เสนอราคา · **ห้ามย้อนกลับมาขั้นนี้** (D48) |
| 2 | `QUOTATION` | เสนอราคา | มี quotation ที่ `SENT` แล้วอย่างน้อย 1 ใบ (ไม่ว่าจะหมดอายุหรือไม่) |
| 3 | `FOLLOW_UP` | รอตัดสินใจ | เสนอแล้ว รอลูกค้าตัดสินใจ |
| 4 | `WON` | ปิดการขาย | บังคับ `won_amount > 0` · `won_at` · `closed_at = won_at` |
| 5 | `LOST` | ไม่สำเร็จ | บังคับ `lost_reason_code` · `closed_at` |

### `crm.quotation_status`

ใช้ที่: `crm.quotations.status` · ป้ายไทยจาก CANONICAL ข้อ 4.6

| # | ค่า | ป้ายไทย | ความหมาย |
|---:|---|---|---|
| 1 | `DRAFT` | ร่าง | แก้ได้ทุกช่อง (`quotation.update`) |
| 2 | `SENT` | ส่งแล้ว | จาก DRAFT ด้วยปุ่ม "ส่ง" · `valid_until` = วันที่ส่ง + `quotation.valid_days` (7) วัน **[รอยืนยัน]** · หลังส่งแก้ได้เฉพาะ `status` |
| 3 | `ACCEPTED` | ตอบรับ | จาก SENT ด้วยมือ · **ไม่** ปิด WON อัตโนมัติ |
| 4 | `REJECTED` | ปฏิเสธ | จาก SENT ด้วยมือ |
| 5 | `EXPIRED` | หมดอายุ | งาน `app.job_expire_quotations` 00:00 วันถัดจาก `valid_until` |

### `crm.task_status`

ใช้ที่: `crm.tasks.status` · ป้ายไทยจาก CANONICAL ข้อ 4.7

| # | ค่า | ป้ายไทย | ความหมาย |
|---:|---|---|---|
| 1 | `OPEN` | เปิด | – |
| 2 | `IN_PROGRESS` | กำลังทำ | – |
| 3 | `DONE` | เสร็จ | บังคับ `completed_at` |
| 4 | `CANCELLED` | ยกเลิก | บังคับ `cancelled_at` |

### `crm.visit_status`

ใช้ที่: `crm.visits.status` · ป้ายไทยจาก CANONICAL ข้อ 4.1

| # | ค่า | ป้ายไทย | ความหมาย |
|---:|---|---|---|
| 1 | `WAITING` | รอรับบริการ | walk-in อยู่ในคิว ยังไม่มีผู้รับ (`owner_staff_id IS NULL`) |
| 2 | `IN_SERVICE` | กำลังให้บริการ | มีผู้รับแล้ว · visit ออนไลน์/โทรเริ่มที่สถานะนี้ |
| 3 | `COMPLETED` | เสร็จสิ้น | ปิดพร้อม `outcome_code` (บังคับ) |
| 4 | `LEFT` | ออกก่อนรับบริการ | outcome = `LEFT_BEFORE_SERVICE` อัตโนมัติ |
| 5 | `CANCELLED` | ยกเลิก (สร้างผิด) | **ไม่นับในทุก KPI** · บังคับ `cancel_reason` |

## 3. ชุดค่าแบบ `text` + CHECK (ไม่ใช่ ENUM)

CANONICAL ข้อ 19.1 ข้อ 1: ชุดค่าปิดที่ไม่อยู่ในข้อ 4.8 ใช้ `text` + CHECK ชื่อคงที่ · generator ตรวจว่าทุกค่าที่พิมพ์ในตารางนี้ปรากฏอยู่ใน CHECK จริง

### `crm.customers.lifecycle_stage`

CHECK: `customers_lifecycle_stage_chk` · CANONICAL ข้อ 3.4

> คำนวณจากข้อเท็จจริง · ห้ามแก้ด้วยมือ · ปรับโดย `app.refresh_customer_lifecycle`

| ค่า | ป้ายไทย | ความหมาย |
|---|---|---|
| `REPEAT` | ลูกค้าซื้อซ้ำ | เหตุการณ์การซื้อตลอดอายุ ≥ 2 (ตรวจลำดับที่ 1) |
| `CUSTOMER` | ลูกค้าปัจจุบัน | เหตุการณ์การซื้อ = 1 |
| `OPPORTUNITY` | มีโอกาสซื้อ | ยังไม่เคยซื้อ · มี opportunity ที่ยังไม่ปิด |
| `LEAD` | สนใจซื้อ | ยังไม่เคยซื้อ · มี lead ที่ยังไม่ปิด |
| `LOST` | ไม่สำเร็จ | ยังไม่เคยซื้อ · ไม่มีรายการเปิด · มี lead/opportunity ที่ LOST ≥ 1 |
| `IDENTIFIED` | รู้จักแล้ว | นอกเหนือจากข้างบน (ตรวจลำดับที่ 6) |

### `crm.customers.created_via`

CHECK: `customers_created_via_chk` · CANONICAL ข้อ 6.3

> CANONICAL ไม่ได้พิมพ์ป้ายไทยของค่าเหล่านี้

| ค่า | ป้ายไทย | ความหมาย |
|---|---|---|
| `QUICK_CAPTURE` | รอยืนยัน | สร้างผ่าน `api.quick_capture` (ทางเดียวตามข้อ 6.2) |
| `IMPORT` | รอยืนยัน | ข้อมูลนำเข้าจากระบบเดิม · เป็นที่มาของ `MISSING_PHONE` (ข้อ 6.2 · 13.12) |
| `MERGE_SURVIVOR` | รอยืนยัน | ลูกค้าที่เหลือรอดจากการรวม (ข้อ 6.7) |

### `crm.customers.customer_type`

CHECK: `customers_customer_type_chk` · CANONICAL ข้อ 5.8

> CANONICAL ไม่ได้พิมพ์ป้ายไทยของค่าเหล่านี้ · ไม่แสดงบน Quick Capture ไม่ใช้ใน KPI

| ค่า | ป้ายไทย | ความหมาย |
|---|---|---|
| `INDIVIDUAL` | รอยืนยัน | ค่าเริ่มต้น |
| `BUSINESS` | รอยืนยัน | – |

### `core.branches.branch_type`

CHECK: `branches_branch_type_chk` · CANONICAL ข้อ 2

> CANONICAL ไม่ได้พิมพ์ป้ายไทยของค่าเหล่านี้

| ค่า | ป้ายไทย | ความหมาย |
|---|---|---|
| `store` | รอยืนยัน | สาขาหน้าร้าน `JP1` `JP2` `JP3` `JP4` |
| `online_team` | รอยืนยัน | ทีมออนไลน์ส่วนกลาง `JPON` **[รอยืนยัน Q3]** · มีเพื่อให้รายการออนไลน์มี `branch_id` เสมอ |

### `crm.data_subject_requests.verification_method`

CHECK: `data_subject_requests_verification_chk` · `data_subject_requests_verified_chk` · CANONICAL ข้อ 4.8 · 10.4

> **ห้ามเก็บสำเนาบัตร**

| ค่า | ป้ายไทย | ความหมาย |
|---|---|---|
| `IN_PERSON_ID_SIGHTED` | เห็นบัตรต่อหน้า | – |
| `OTP_TO_REGISTERED_CONTACT` | รหัส OTP ไปช่องทางที่ลงทะเบียน | – |
| `OTHER` | อื่น ๆ | – |

### `core.role_grant_requests.status`

CHECK: `role_grant_requests_decided_chk` · `role_grant_requests_status_chk` · CANONICAL ข้อ 4.8 (`core.role_grant_status`)

| ค่า | ป้ายไทย | ความหมาย |
|---|---|---|
| `REQUESTED` | รออนุมัติ | แจ้ง `ROLE_GRANT_APPROVAL_REQUIRED` ถึง EXECUTIVE ทุกคน (ยกเว้นผู้รับ) |
| `APPROVED` | อนุมัติแล้ว | `api.decide_role_grant` (aal2) |
| `REJECTED` | ไม่อนุมัติ | – |

### `core.role_grant_requests.request_type`

CHECK: `role_grant_requests_type_chk` · CANONICAL ข้อ 4.8 (`core.role_grant_status`) · 7.2

| ค่า | ป้ายไทย | ความหมาย |
|---|---|---|
| `GRANT` | มอบ | – |
| `REVOKE` | ถอน | การถอน EXECUTIVE / BUSINESS_ADMIN / SYSTEM_ADMIN ใช้เส้นทางเดียวกับการมอบ |

## 4. ตาราง

### 4.1 schema `core` — 14 ตาราง

> องค์กร · สาขา · ทีม · พนักงาน · บทบาท · สิทธิ์ · อุปกรณ์ · เปิดผ่าน Data API · SELECT ตาม RLS

[`core.branches`](#core-branches) · [`core.business_units`](#core-business_units) · [`core.departments`](#core-departments) · [`core.devices`](#core-devices) · [`core.organizations`](#core-organizations) · [`core.permissions`](#core-permissions) · [`core.role_grant_requests`](#core-role_grant_requests) · [`core.role_permissions`](#core-role_permissions) · [`core.roles`](#core-roles) · [`core.staff_invitations`](#core-staff_invitations) · [`core.staff_profiles`](#core-staff_profiles) · [`core.staff_role_assignments`](#core-staff_role_assignments) · [`core.team_members`](#core-team_members) · [`core.teams`](#core-teams)

#### `core.branches`

สาขา/หน่วยที่เป็นขอบเขตข้อมูล (ข้อ 2 · 8.0) · seed: JP1–JP4 (store) "JAUNPHONE 1–4" · JPON (online_team) "ทีมออนไลน์ส่วนกลาง" [รอยืนยัน Q3] · รายการธุรกิจทุกรายการมี branch_id เสมอ (รายการออนไลน์ที่ยังไม่มอบสาขาอยู่ที่ JPON · D21)

**RLS:** เปิด · **policy:** 1 · **index:** 3 · **trigger:** 3

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `business_unit_id` | `uuid` | NOT NULL | – | `core.business_units(id)` |  | – |
| 4 | `code` | `text` | NOT NULL | – | – |  | รหัสสาขา ไม่ซ้ำภายในองค์กร · ใช้ในเลข visit V-{branch}-{YYMMDD}-{NNN} และตัวนับ VISIT:{branch}:{YYYYMMDD} (ข้อ 6.1) จึงใช้ได้เฉพาะ A–Z 0–9 |
| 5 | `name_th` | `text` | NOT NULL | – | – |  | ชื่อที่แสดง เช่น JAUNPHONE 1 |
| 6 | `branch_type` | `text` | NOT NULL | – | – |  | store = หน้าร้าน · online_team = ทีมออนไลน์ส่วนกลาง (ข้อ 2) |
| 7 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 8 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 9 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 10 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 11 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `branches_pkey` | `PRIMARY KEY (id)` |
| `branches_code_uq` | `UNIQUE (organization_id, code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `branches_branch_type_chk` | `CHECK ((branch_type = ANY (ARRAY['store'::text, 'online_team'::text])))` |
| `branches_code_chk` | `CHECK ((code ~ '^[A-Z0-9]+$'::text))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `branches_business_unit_id_fkey` | `FOREIGN KEY (business_unit_id) REFERENCES core.business_units(id)` |
| `branches_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `branches_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `branches_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `branches_business_unit_id_idx` | `CREATE INDEX branches_business_unit_id_idx ON core.branches USING btree (business_unit_id)` |
| `branches_code_uq` | `CREATE UNIQUE INDEX branches_code_uq ON core.branches USING btree (organization_id, code)` |
| `branches_pkey` | `CREATE UNIQUE INDEX branches_pkey ON core.branches USING btree (id)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`branches_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (organization_id = ( SELECT app.current_organization_id() AS current_organization_id))
  ```

#### `core.business_units`

หน่วยธุรกิจ (ข้อ 2) · seed: JAUNPHONE "JAUN PHONE" · JPM "JAUN POWER MONEY" (V1 เชื่อมผ่าน transaction ref เท่านั้น · [รอยืนยัน Q17])

**RLS:** เปิด · **policy:** 1 · **index:** 2 · **trigger:** 3

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `code` | `text` | NOT NULL | – | – |  | รหัสหน่วยธุรกิจ ไม่ซ้ำภายในองค์กร |
| 4 | `name_th` | `text` | NOT NULL | – | – |  | ชื่อที่แสดง |
| 5 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 6 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 7 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 9 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `business_units_pkey` | `PRIMARY KEY (id)` |
| `business_units_code_uq` | `UNIQUE (organization_id, code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `business_units_code_chk` | `CHECK ((code ~ '^[A-Z0-9_-]+$'::text))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `business_units_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `business_units_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `business_units_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `business_units_code_uq` | `CREATE UNIQUE INDEX business_units_code_uq ON core.business_units USING btree (organization_id, code)` |
| `business_units_pkey` | `CREATE UNIQUE INDEX business_units_pkey ON core.business_units USING btree (id)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`business_units_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (organization_id = ( SELECT app.current_organization_id() AS current_organization_id))
  ```

#### `core.departments`

ฝ่าย/แผนก (ข้อ 14.6 · จากบรีฟ A10) · V1 ไม่ใช้ในการตัดสินสิทธิ์หรือรายงาน · ไม่มีรายการใน seed · หมายเหตุผู้เขียน: CANONICAL ไม่ระบุคอลัมน์ ผู้เขียนใช้โครงเดียวกับ business_units และให้ business_unit_id ว่างได้ (ฝ่ายกลางขององค์กร)

**RLS:** เปิด · **policy:** 1 · **index:** 3 · **trigger:** 3

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `business_unit_id` | `uuid` | NULL | – | `core.business_units(id)` |  | หน่วยธุรกิจที่สังกัด · NULL = ฝ่ายกลางระดับองค์กร |
| 4 | `code` | `text` | NOT NULL | – | – |  | – |
| 5 | `name_th` | `text` | NOT NULL | – | – |  | – |
| 6 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 8 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 9 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 10 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `departments_pkey` | `PRIMARY KEY (id)` |
| `departments_code_uq` | `UNIQUE (organization_id, code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `departments_code_chk` | `CHECK ((code ~ '^[A-Z0-9_-]+$'::text))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `departments_business_unit_id_fkey` | `FOREIGN KEY (business_unit_id) REFERENCES core.business_units(id)` |
| `departments_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `departments_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `departments_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `departments_business_unit_id_idx` | `CREATE INDEX departments_business_unit_id_idx ON core.departments USING btree (business_unit_id)` |
| `departments_code_uq` | `CREATE UNIQUE INDEX departments_code_uq ON core.departments USING btree (organization_id, code)` |
| `departments_pkey` | `CREATE UNIQUE INDEX departments_pkey ON core.departments USING btree (id)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`departments_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (organization_id = ( SELECT app.current_organization_id() AS current_organization_id))
  ```

#### `core.devices`

อุปกรณ์ที่ลงทะเบียน (ข้อ 9.2) โดย BRANCH_MANAGER · อุปกรณ์ counter ใช้ร่วมกัน: idle ตาม settings session.shared_counter_idle_min (10 นาที) → ล็อกหน้าจอ · ซ่อน "จดจำฉันไว้" · device_id เป็นข้อมูลประกอบ ห้ามใช้ตัดสินสิทธิ์

**RLS:** เปิด · **policy:** 0 · **index:** 3 · **trigger:** 3

**GRANT (ทั้งตาราง):** **ไม่มี** — เขียน/อ่านผ่าน trigger หรือ RPC `SECURITY DEFINER` เท่านั้น

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `device_id` | `text` | NOT NULL | – | – |  | รหัสอุปกรณ์ที่แอปเก็บใน localStorage['device_id'] (ไม่ถูกล้างตอน logout) และส่งใน header x-device-id |
| 4 | `branch_id` | `uuid` | NOT NULL | – | `core.branches(id)` |  | – |
| 5 | `is_shared_counter` | `boolean` | NOT NULL | `false` | – |  | true = เครื่อง counter ที่พนักงานใช้ร่วมกัน |
| 6 | `label` | `text` | NULL | – | – |  | ชื่อเรียกอุปกรณ์ (ไม่บังคับ) · หมายเหตุผู้เขียน: ไม่ได้ระบุใน CANONICAL |
| 7 | `is_active` | `boolean` | NOT NULL | `true` | – |  | false = เลิกใช้อุปกรณ์ (ไม่ลบแถว) · หมายเหตุผู้เขียน: ไม่ได้ระบุใน CANONICAL |
| 8 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 9 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 10 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 11 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `devices_pkey` | `PRIMARY KEY (id)` |
| `devices_device_id_key` | `UNIQUE (device_id)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `devices_device_id_chk` | `CHECK ((btrim(device_id) <> ''::text))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `devices_branch_id_fkey` | `FOREIGN KEY (branch_id) REFERENCES core.branches(id)` |
| `devices_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `devices_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `devices_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `devices_branch_id_idx` | `CREATE INDEX devices_branch_id_idx ON core.devices USING btree (branch_id)` |
| `devices_device_id_key` | `CREATE UNIQUE INDEX devices_device_id_key ON core.devices USING btree (device_id)` |
| `devices_pkey` | `CREATE UNIQUE INDEX devices_pkey ON core.devices USING btree (id)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:** ไม่มี → ไม่มี role ใดเห็น/เขียนแถวได้ (เข้าถึงผ่าน RPC `SECURITY DEFINER` เท่านั้น)

#### `core.organizations`

องค์กร (ข้อ 2) · V1 มีองค์กรเดียว code JAUN · ตารางธุรกิจทุกตารางอ้าง organization_id ของตารางนี้

**RLS:** เปิด · **policy:** 1 · **index:** 2 · **trigger:** 2

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `code` | `text` | NOT NULL | – | – |  | รหัสองค์กร เช่น JAUN (ตัวพิมพ์ใหญ่ ตัวเลข _ -) |
| 3 | `name_th` | `text` | NOT NULL | – | – |  | ชื่อที่แสดง เช่น JAUN |
| 4 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 5 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 6 | `created_by` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | – |
| 7 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 8 | `updated_by` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `organizations_pkey` | `PRIMARY KEY (id)` |
| `organizations_code_key` | `UNIQUE (code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `organizations_code_chk` | `CHECK ((code ~ '^[A-Z0-9_-]+$'::text))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `organizations_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `organizations_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `organizations_code_key` | `CREATE UNIQUE INDEX organizations_code_key ON core.organizations USING btree (code)` |
| `organizations_pkey` | `CREATE UNIQUE INDEX organizations_pkey ON core.organizations USING btree (id)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`organizations_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (id = ( SELECT app.current_organization_id() AS current_organization_id))
  ```

#### `core.permissions`

รายการสิทธิ์ทั้งหมดของระบบ (ข้อ 8.1) · ค่ากลาง แก้ผ่าน migration เท่านั้น · ไม่มี customer.delete (A16 · ลบจริงผ่าน customer.anonymize)

**RLS:** เปิด · **policy:** 1 · **index:** 2 · **trigger:** 2

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `code` | `text` | NOT NULL | – | – |  | รหัสสิทธิ์ {กลุ่ม}.{การกระทำ} เช่น customer.read · customer.pii.reveal |
| 2 | `label_th` | `text` | NOT NULL | – | – |  | ความหมาย (คอลัมน์ "ความหมาย" ของตารางข้อ 8.1) |
| 3 | `description` | `text` | NULL | – | – |  | กติกาเพิ่มเติมจาก CANONICAL ที่ผูกกับสิทธิ์นี้ (NULL = ไม่มี) |
| 4 | `sort_order` | `integer` | NOT NULL | – | – |  | ลำดับแถวตามตารางข้อ 8.1 |
| 5 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 6 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `permissions_pkey` | `PRIMARY KEY (code)` |
| `permissions_sort_order_key` | `UNIQUE (sort_order)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `permissions_code_chk` | `CHECK ((code ~ '^[a-z_]+(\.[a-z_]+)+$'::text))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `permissions_pkey` | `CREATE UNIQUE INDEX permissions_pkey ON core.permissions USING btree (code)` |
| `permissions_sort_order_key` | `CREATE UNIQUE INDEX permissions_sort_order_key ON core.permissions USING btree (sort_order)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`permissions_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (( SELECT app.current_staff_id() AS current_staff_id) IS NOT NULL)
  ```

#### `core.role_grant_requests`

คำขอมอบบทบาทสูง (ข้อ 7.2 · D22) · SYSTEM_ADMIN ยื่นขอ SYSTEM_ADMIN/EXECUTIVE/BUSINESS_ADMIN ผ่าน api.request_role_grant (role.request) · EXECUTIVE อนุมัติ/ปฏิเสธผ่าน api.decide_role_grant (role.decide 🔐) · แจ้ง ROLE_GRANT_APPROVAL_REQUIRED ให้ EXECUTIVE ทุกคน (ยกเว้นผู้รับ) · seed: RG-2026-0003 ขอ SYSTEM_ADMIN ให้ ST-0051 โดย ST-0003 · รอ EXECUTIVE

**RLS:** เปิด · **policy:** 0 · **index:** 4 · **trigger:** 5

**GRANT (ทั้งตาราง):** **ไม่มี** — เขียน/อ่านผ่าน trigger หรือ RPC `SECURITY DEFINER` เท่านั้น

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `request_no` | `text` | NOT NULL | – | – |  | เลขคำขอ RG-{YYYY}-{NNNN} ตัวนับ RG:{YYYY} (ข้อ 6.1) |
| 4 | `role_code` | `text` | NOT NULL | – | `core.roles(code)` |  | บทบาทที่ขอ (บทบาทระดับองค์กร จึงไม่มีสาขา) |
| 5 | `target_staff_id` | `uuid` | NOT NULL | – | `core.staff_profiles(id)` |  | ผู้รับบทบาท |
| 6 | `requested_by` | `uuid` | NOT NULL | – | `core.staff_profiles(id)` |  | ผู้ยื่นคำขอ (SYSTEM_ADMIN) |
| 7 | `requested_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 8 | `request_reason` | `text` | NULL | – | – |  | – |
| 9 | `status` | `text` | NOT NULL | `'REQUESTED'::text` | – |  | REQUESTED รอตัดสิน · APPROVED อนุมัติ (สร้าง staff_role_assignments ในทรานแซกชันเดียวกัน) · REJECTED ปฏิเสธ · หมายเหตุผู้เขียน: CANONICAL ไม่ระบุชุดค่าสถานะ ผู้เขียนใช้ชื่อเดียวกับ audit.export_status (REQUESTED/APPROVED/REJECTED) [รอยืนยัน] |
| 10 | `decided_by` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | EXECUTIVE ผู้ตัดสิน (aal2) |
| 11 | `decided_at` | `timestamp with time zone` | NULL | – | – |  | เวลาตัดสิน |
| 12 | `decision_note` | `text` | NULL | – | – |  | หมายเหตุการตัดสิน |
| 13 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 14 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 15 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 16 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 17 | `request_type` | `text` | NOT NULL | `'GRANT'::text` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `role_grant_requests_pkey` | `PRIMARY KEY (id)` |
| `role_grant_requests_request_no_key` | `UNIQUE (request_no)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `role_grant_requests_decided_chk` | `CHECK ((((status = 'REQUESTED'::text) = (decided_by IS NULL)) AND ((decided_by IS NULL) = (decided_at IS NULL))))` |
| `role_grant_requests_decider_chk` | `CHECK (((decided_by IS NULL) OR ((decided_by <> requested_by) AND (decided_by <> target_staff_id))))` |
| `role_grant_requests_no_chk` | `CHECK ((request_no ~ '^RG-[0-9]{4}-[0-9]{4,}$'::text))` |
| `role_grant_requests_requester_chk` | `CHECK ((requested_by <> target_staff_id))` |
| `role_grant_requests_role_chk` | `CHECK ((role_code = ANY (ARRAY['SYSTEM_ADMIN'::text, 'EXECUTIVE'::text, 'BUSINESS_ADMIN'::text])))` |
| `role_grant_requests_status_chk` | `CHECK ((status = ANY (ARRAY['REQUESTED'::text, 'APPROVED'::text, 'REJECTED'::text])))` |
| `role_grant_requests_type_chk` | `CHECK ((request_type = ANY (ARRAY['GRANT'::text, 'REVOKE'::text])))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `role_grant_requests_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `role_grant_requests_decided_by_fkey` | `FOREIGN KEY (decided_by) REFERENCES core.staff_profiles(id)` |
| `role_grant_requests_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `role_grant_requests_requested_by_fkey` | `FOREIGN KEY (requested_by) REFERENCES core.staff_profiles(id)` |
| `role_grant_requests_role_code_fkey` | `FOREIGN KEY (role_code) REFERENCES core.roles(code)` |
| `role_grant_requests_target_staff_id_fkey` | `FOREIGN KEY (target_staff_id) REFERENCES core.staff_profiles(id)` |
| `role_grant_requests_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `role_grant_requests_open_uidx` | `CREATE UNIQUE INDEX role_grant_requests_open_uidx ON core.role_grant_requests USING btree (target_staff_id, role_code) WHERE (status = 'REQUESTED'::text)` |
| `role_grant_requests_pkey` | `CREATE UNIQUE INDEX role_grant_requests_pkey ON core.role_grant_requests USING btree (id)` |
| `role_grant_requests_request_no_key` | `CREATE UNIQUE INDEX role_grant_requests_request_no_key ON core.role_grant_requests USING btree (request_no)` |
| `role_grant_requests_status_idx` | `CREATE INDEX role_grant_requests_status_idx ON core.role_grant_requests USING btree (status)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_05_running_number` | BEFORE | INSERT | ROW | `app.trg_assign_running_number()` | – |
| `trg_15_guard_core_row` | BEFORE | DELETE | ROW | `app.trg_guard_core_row()` | – |
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:** ไม่มี → ไม่มี role ใดเห็น/เขียนแถวได้ (เข้าถึงผ่าน RPC `SECURITY DEFINER` เท่านั้น)

#### `core.role_permissions`

ตารางสิทธิ์ × ขอบเขตต่อบทบาท (ข้อ 8.1) · หนึ่งแถว = หนึ่งช่องที่ไม่ใช่ "–" · แก้ได้เฉพาะผ่าน migration (ไม่มีหน้าจอ/RPC ใน V1 · trigger บันทึก PERMISSION_CHANGED) · helper ข้อ 9.3 อ่านตารางนี้สดทุกครั้ง ห้ามฝังลง JWT

**RLS:** เปิด · **policy:** 1 · **index:** 2 · **trigger:** 2

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `role_code` | `text` | NOT NULL | – | `core.roles(code)` |  | – |
| 2 | `permission_code` | `text` | NOT NULL | – | `core.permissions(code)` |  | – |
| 3 | `scope` | `core.data_scope` | NOT NULL | – | – |  | ขอบเขตของช่อง: O=OWN · T=TEAM · B=BRANCH · G=ORGANIZATION · S=SYSTEM (S¹ ของ SYSTEM_ADMIN เก็บเป็น SYSTEM · ข้อจำกัดของเชิงอรรถ ¹ ตรวจใน RPC) · ความหมายตามข้อ 8.0 |
| 4 | `requires_aal2` | `boolean` | NOT NULL | `false` | – |  | ช่องที่ติด 🔐 (ทั้งสิทธิ์ที่ติด 🔐 ที่ชื่อ และช่องเฉพาะเช่น customer.pii.reveal ของ EX/BA) · สิทธิ์ของช่องนี้ไม่ถูกนับเมื่อ JWT ไม่ใช่ aal2 (ข้อ 8.0) |
| 5 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 6 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `role_permissions_pkey` | `PRIMARY KEY (role_code, permission_code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `role_permissions_sa_no_customer_data_chk` | `CHECK (((role_code <> 'SYSTEM_ADMIN'::text) OR (permission_code !~ '^(customer\|note\|visit\|interaction\|lead\|opportunity\|quotation\|task\|transaction\|data_quality\|dsr)\.'::text)))` |
| `role_permissions_system_scope_chk` | `CHECK (((role_code = 'SYSTEM_ADMIN'::text) = (scope = 'SYSTEM'::core.data_scope)))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `role_permissions_permission_code_fkey` | `FOREIGN KEY (permission_code) REFERENCES core.permissions(code)` |
| `role_permissions_role_code_fkey` | `FOREIGN KEY (role_code) REFERENCES core.roles(code)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `role_permissions_permission_code_idx` | `CREATE INDEX role_permissions_permission_code_idx ON core.role_permissions USING btree (permission_code)` |
| `role_permissions_pkey` | `CREATE UNIQUE INDEX role_permissions_pkey ON core.role_permissions USING btree (role_code, permission_code)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`role_permissions_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (( SELECT app.current_staff_id() AS current_staff_id) IS NOT NULL)
  ```

#### `core.roles`

บทบาท 8 แบบ (ข้อ 7) · ค่ากลางของระบบ แก้ผ่าน migration เท่านั้น · ห้ามมอบ rank ≥ rank สูงสุดของผู้มอบ (ข้อ 7.2)

**RLS:** เปิด · **policy:** 1 · **index:** 1 · **trigger:** 2

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `code` | `text` | NOT NULL | – | – |  | รหัสบทบาท เช่น STAFF · BRANCH_MANAGER |
| 2 | `label_th` | `text` | NOT NULL | – | – |  | ป้ายไทย |
| 3 | `rank` | `integer` | NULL | – | – |  | ลำดับอำนาจ 10–60 ใช้กติกา "ห้ามมอบ rank ≥ rank ของตน" · NULL เฉพาะ SYSTEM_ADMIN (สายแยก มอบตรงไม่ได้) |
| 4 | `description_th` | `text` | NOT NULL | – | – |  | ใครบ้างที่ถือบทบาทนี้ (คอลัมน์ "ใครบ้าง" ของข้อ 7) |
| 5 | `requires_mfa` | `boolean` | NOT NULL | – | – |  | true = assignment ของบทบาทนี้ไม่ถูกนับเมื่อ JWT ไม่ใช่ aal2 (ข้อ 8.0) · ผู้ใช้ต้องลงทะเบียน TOTP ก่อนเปิดใช้งาน (ข้อ 7.3) |
| 6 | `is_branch_role` | `boolean` | NOT NULL | – | – |  | true = ต้องมอบพร้อม branch_id (STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS) · false = บทบาทระดับองค์กร branch_id ต้องว่าง (ข้อ 7.1) |
| 7 | `sort_order` | `integer` | NOT NULL | – | – |  | ลำดับแสดงผลตามตารางข้อ 7 |
| 8 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 9 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `roles_pkey` | `PRIMARY KEY (code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `roles_code_chk` | `CHECK ((code ~ '^[A-Z_]+$'::text))` |
| `roles_rank_chk` | `CHECK (((code = 'SYSTEM_ADMIN'::text) = (rank IS NULL)))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `roles_pkey` | `CREATE UNIQUE INDEX roles_pkey ON core.roles USING btree (code)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`roles_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (( SELECT app.current_staff_id() AS current_staff_id) IS NOT NULL)
  ```

#### `core.staff_invitations`

คำเชิญพนักงาน (ข้อ 7.3 · 9.2) · Edge Function invite-staff สร้างแถวนี้ + staff_profiles (INVITED) ก่อนเรียก auth.admin · Before User Created hook อนุญาตเฉพาะอีเมลที่มีแถวที่ยังไม่หมดอายุ/ไม่ถูกยกเลิก · ส่งคำเชิญซ้ำ = แถวใหม่ · หมายเหตุผู้เขียน: CANONICAL ระบุชื่อตารางแต่ไม่ระบุคอลัมน์ ผู้เขียนออกแบบให้หน้าอนุมัติแสดง "ผู้เชิญ วันที่เชิญ อีเมล" ได้ (ข้อ 7.2)

**RLS:** เปิด · **policy:** 0 · **index:** 3 · **trigger:** 3

**GRANT (ทั้งตาราง):** **ไม่มี** — เขียน/อ่านผ่าน trigger หรือ RPC `SECURITY DEFINER` เท่านั้น

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `staff_id` | `uuid` | NOT NULL | – | `core.staff_profiles(id)` |  | โปรไฟล์ที่สร้างพร้อมคำเชิญ · บทบาทที่เลือกตอนเชิญบันทึกใน core.staff_role_assignments |
| 4 | `email` | `text` | NOT NULL | – | – |  | อีเมลที่ส่งคำเชิญ (เทียบแบบไม่สนตัวพิมพ์) |
| 5 | `invited_by` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | ผู้เชิญ · NULL = สคริปต์ bootstrap (EXECUTIVE คนแรก ข้อ 7.2) · ใช้ตรวจกติกา "บัญชีที่ SYSTEM_ADMIN เป็นผู้เชิญ" |
| 6 | `invited_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 7 | `expires_at` | `timestamp with time zone` | NOT NULL | `(now() + '24:00:00'::interval)` | – |  | หมดอายุ = เวลาเชิญ + 24 ชม. (ข้อ 7.3) · เทียบด้วย now() |
| 8 | `accepted_at` | `timestamp with time zone` | NULL | – | – |  | เวลาที่พนักงานเปิดใช้งานสำเร็จ (api.activate_self) |
| 9 | `revoked_at` | `timestamp with time zone` | NULL | – | – |  | เวลาที่ยกเลิกคำเชิญ (เช่น ส่งใหม่ หรือปิดใช้งานก่อนรับ) |
| 10 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 11 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 12 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 13 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `staff_invitations_pkey` | `PRIMARY KEY (id)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `staff_invitations_expiry_chk` | `CHECK ((expires_at > invited_at))` |
| `staff_invitations_final_chk` | `CHECK (((accepted_at IS NULL) OR (revoked_at IS NULL)))` |
| `staff_invitations_self_chk` | `CHECK (((invited_by IS NULL) OR (invited_by <> staff_id)))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `staff_invitations_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `staff_invitations_invited_by_fkey` | `FOREIGN KEY (invited_by) REFERENCES core.staff_profiles(id)` |
| `staff_invitations_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `staff_invitations_staff_id_fkey` | `FOREIGN KEY (staff_id) REFERENCES core.staff_profiles(id)` |
| `staff_invitations_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `staff_invitations_email_idx` | `CREATE INDEX staff_invitations_email_idx ON core.staff_invitations USING btree (lower(email))` |
| `staff_invitations_pkey` | `CREATE UNIQUE INDEX staff_invitations_pkey ON core.staff_invitations USING btree (id)` |
| `staff_invitations_staff_id_idx` | `CREATE INDEX staff_invitations_staff_id_idx ON core.staff_invitations USING btree (staff_id)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:** ไม่มี → ไม่มี role ใดเห็น/เขียนแถวได้ (เข้าถึงผ่าน RPC `SECURITY DEFINER` เท่านั้น)

#### `core.staff_profiles`

พนักงาน/ผู้ใช้ของ CRM (ข้อ 7.1 · 7.3) · ห้ามลบแถว (ปิดใช้งาน = status DISABLED) · authenticated อ่านได้เฉพาะคอลัมน์ id staff_code display_name nickname status ผ่าน column grant (ข้อ 8.3) · คอลัมน์อื่นผ่าน api.list_staff (user.read) · เขียนผ่าน Edge Function invite-staff / disable-staff และ RPC เท่านั้น

**RLS:** เปิด · **policy:** 1 · **index:** 6 · **trigger:** 5

**GRANT (ทั้งตาราง):** **ไม่มี** — เขียน/อ่านผ่าน trigger หรือ RPC `SECURITY DEFINER` เท่านั้น

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | SELECT | `display_name` · `id` · `nickname` · `staff_code` · `status` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `staff_code` | `text` | NOT NULL | – | – |  | รหัสพนักงานของระบบ ST-{NNNN} ออกโดย app.trg_assign_running_number ตัวนับ ST (ข้อ 6.1) · ใช้ล็อกอินแทนอีเมลและแสดงผล |
| 4 | `employee_code` | `text` | NOT NULL | – | – |  | รหัส HR ที่ผู้เชิญกรอก · ไม่ UNIQUE แต่ห้ามซ้ำในบัญชีที่ไม่ใช่ DISABLED (partial unique index) · ใช้ตรวจ "ผู้อนุมัติ ≠ บัญชีที่ employee_code เดียวกับผู้รับ" (ข้อ 7.2) |
| 5 | `display_name` | `text` | NOT NULL | – | – |  | ชื่อที่แสดง เช่น "คุณขวัญ" |
| 6 | `nickname` | `text` | NULL | – | – |  | ชื่อเล่น |
| 7 | `email` | `text` | NOT NULL | – | – |  | อีเมลที่ใช้รับคำเชิญ/รีเซ็ตรหัส (ส่วนตัวได้ Q24) · BRANCH_MANAGER แก้ไม่ได้ (ข้อ 7.3) |
| 8 | `phone` | `text` | NULL | – | – |  | เบอร์ติดต่อพนักงาน (ข้อมูล Internal) |
| 9 | `user_id` | `uuid` | NULL | – | `auth.users(id)` |  | บัญชี Supabase Auth (auth.users.id) · ว่างได้ระหว่าง INVITED ก่อนสร้างผู้ใช้ · บัญชี ACTIVE ต้องมีค่า · app.current_staff_id() หา staff ACTIVE จาก auth.uid() ผ่านคอลัมน์นี้ |
| 10 | `status` | `core.staff_status` | NOT NULL | `'INVITED'::core.staff_status` | – |  | INVITED → ACTIVE (api.activate_self) → DISABLED (api.disable_staff) · เปิดใช้งานใหม่ต้องมอบบทบาทใหม่ |
| 11 | `invite_expires_at` | `timestamp with time zone` | NULL | – | – |  | เวลาหมดอายุคำเชิญ = เวลาเชิญ + 24 ชม. (ข้อ 7.3) · ตรวจด้วย now() ใน api.activate_self |
| 12 | `identity_verified_by` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | BUSINESS_ADMIN ที่ยืนยันตัวตนกับ HR · บัญชีที่ SYSTEM_ADMIN เป็นผู้เชิญรับบทบาทธุรกิจไม่ได้จนกว่าคอลัมน์นี้มีค่า (ข้อ 7.2) |
| 13 | `identity_verified_at` | `timestamp with time zone` | NULL | – | – |  | เวลาที่ยืนยันตัวตน (มีค่าพร้อม identity_verified_by) |
| 14 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 15 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 16 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 17 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `staff_profiles_pkey` | `PRIMARY KEY (id)` |
| `staff_profiles_staff_code_key` | `UNIQUE (staff_code)` |
| `staff_profiles_user_id_key` | `UNIQUE (user_id)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `staff_profiles_active_user_chk` | `CHECK (((status <> 'ACTIVE'::core.staff_status) OR (user_id IS NOT NULL)))` |
| `staff_profiles_display_name_chk` | `CHECK ((btrim(display_name) <> ''::text))` |
| `staff_profiles_email_chk` | `CHECK ((email ~ '^[^@[:space:]]+@[^@[:space:]]+$'::text))` |
| `staff_profiles_employee_code_chk` | `CHECK ((btrim(employee_code) <> ''::text))` |
| `staff_profiles_identity_chk` | `CHECK (((identity_verified_by IS NULL) = (identity_verified_at IS NULL)))` |
| `staff_profiles_invited_expiry_chk` | `CHECK (((status <> 'INVITED'::core.staff_status) OR (invite_expires_at IS NOT NULL)))` |
| `staff_profiles_staff_code_chk` | `CHECK ((staff_code ~ '^ST-[0-9]{4,}$'::text))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `staff_profiles_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `staff_profiles_identity_verified_by_fkey` | `FOREIGN KEY (identity_verified_by) REFERENCES core.staff_profiles(id)` |
| `staff_profiles_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `staff_profiles_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |
| `staff_profiles_user_id_fkey` | `FOREIGN KEY (user_id) REFERENCES auth.users(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `staff_profiles_email_open_uidx` | `CREATE UNIQUE INDEX staff_profiles_email_open_uidx ON core.staff_profiles USING btree (lower(email)) WHERE (status <> 'DISABLED'::core.staff_status)` |
| `staff_profiles_employee_code_open_uidx` | `CREATE UNIQUE INDEX staff_profiles_employee_code_open_uidx ON core.staff_profiles USING btree (organization_id, employee_code) WHERE (status <> 'DISABLED'::core.staff_status)` |
| `staff_profiles_organization_id_idx` | `CREATE INDEX staff_profiles_organization_id_idx ON core.staff_profiles USING btree (organization_id)` |
| `staff_profiles_pkey` | `CREATE UNIQUE INDEX staff_profiles_pkey ON core.staff_profiles USING btree (id)` |
| `staff_profiles_staff_code_key` | `CREATE UNIQUE INDEX staff_profiles_staff_code_key ON core.staff_profiles USING btree (staff_code)` |
| `staff_profiles_user_id_key` | `CREATE UNIQUE INDEX staff_profiles_user_id_key ON core.staff_profiles USING btree (user_id)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_05_running_number` | BEFORE | INSERT | ROW | `app.trg_assign_running_number()` | – |
| `trg_15_guard_core_row` | BEFORE | DELETE | ROW | `app.trg_guard_core_row()` | – |
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`staff_profiles_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (organization_id = ( SELECT app.current_organization_id() AS current_organization_id))
  ```

#### `core.staff_role_assignments`

การมอบบทบาทให้พนักงาน (ข้อ 7.1) · คนเดียวมีหลายแถวได้ ("Multi-Branch" = หลายแถวคนละสาขา) · scope ประเมินต่อแถวแล้วรวมแบบ OR ห้ามยุบข้ามสาขา (ข้อ 8.0) · แถวมีผลเมื่อ staff ACTIVE และ valid_from ≤ now() < coalesce(valid_to, ∞) และ (บทบาท requires_mfa → aal2) · ความคาดหวังเรื่องการแก้ไข: หลังสร้างแล้วแก้ได้เฉพาะ valid_to · revoked_by · revoke_reason (การถอน) — คอลัมน์อื่นห้ามเปลี่ยน ห้ามลบแถว (บังคับด้วย trigger/RPC ใน migration ถัดไป · api.assign_role / api.revoke_role / api.disable_staff) · helper ห้ามตีความ branch_id NULL ของบทบาทสาขาเป็นทุกสาขา · SYSTEM_ADMIN ห้ามถือร่วมกับบทบาทธุรกิจ (trigger ต้อง SELECT … FOR UPDATE แถว core.staff_profiles ก่อนตรวจ) · ห้ามถือ MARKETING ร่วมกับ BUSINESS_ADMIN [รอยืนยัน Q22]

**RLS:** เปิด · **policy:** 0 · **index:** 5 · **trigger:** 5

**GRANT (ทั้งตาราง):** **ไม่มี** — เขียน/อ่านผ่าน trigger หรือ RPC `SECURITY DEFINER` เท่านั้น

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `staff_id` | `uuid` | NOT NULL | – | `core.staff_profiles(id)` |  | – |
| 4 | `role_code` | `text` | NOT NULL | – | `core.roles(code)` |  | บทบาทที่มอบ |
| 5 | `branch_id` | `uuid` | NULL | – | `core.branches(id)` |  | สาขาของการมอบ · ต้องมีสำหรับ STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS · ต้องว่างสำหรับ MARKETING EXECUTIVE BUSINESS_ADMIN SYSTEM_ADMIN |
| 6 | `valid_from` | `timestamp with time zone` | NOT NULL | `now()` | – |  | เริ่มมีผล (ตัดสินด้วย now() · ข้อ 1.2) |
| 7 | `valid_to` | `timestamp with time zone` | NULL | – | – |  | สิ้นสุดผล (ไม่รวมเวลานี้) · NULL = ยังมีผล · ถอน/ปิดใช้งานตั้งเป็น now() (ถ้า valid_from ยังไม่ถึงให้ตั้งเท่า valid_from เพื่อผ่าน CHECK) |
| 8 | `granted_by` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | ผู้มอบ · NULL = สคริปต์ bootstrap หรือผลอนุมัติคำขอ (บันทึกผู้อนุมัติใน core.role_grant_requests) |
| 9 | `grant_reason` | `text` | NULL | – | – |  | เหตุผลการมอบ |
| 10 | `revoked_by` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | ผู้ถอน (มีค่าได้เมื่อ valid_to มีค่า) · ต้องไม่ใช่เจ้าของแถว |
| 11 | `revoke_reason` | `text` | NULL | – | – |  | เหตุผลการถอน |
| 12 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 13 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 14 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 15 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `staff_role_assignments_pkey` | `PRIMARY KEY (id)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `staff_role_assignments_branch_chk` | `CHECK (((role_code = ANY (ARRAY['MARKETING'::text, 'EXECUTIVE'::text, 'BUSINESS_ADMIN'::text, 'SYSTEM_ADMIN'::text])) = (branch_id IS NULL)))` |
| `staff_role_assignments_not_self_grant_chk` | `CHECK (((granted_by IS NULL) OR (granted_by <> staff_id)))` |
| `staff_role_assignments_not_self_revoke_chk` | `CHECK (((revoked_by IS NULL) OR (revoked_by <> staff_id)))` |
| `staff_role_assignments_revoke_chk` | `CHECK (((revoked_by IS NULL) OR (valid_to IS NOT NULL)))` |
| `staff_role_assignments_valid_range_chk` | `CHECK (((valid_to IS NULL) OR (valid_to >= valid_from)))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `staff_role_assignments_branch_id_fkey` | `FOREIGN KEY (branch_id) REFERENCES core.branches(id)` |
| `staff_role_assignments_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `staff_role_assignments_granted_by_fkey` | `FOREIGN KEY (granted_by) REFERENCES core.staff_profiles(id)` |
| `staff_role_assignments_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `staff_role_assignments_revoked_by_fkey` | `FOREIGN KEY (revoked_by) REFERENCES core.staff_profiles(id)` |
| `staff_role_assignments_role_code_fkey` | `FOREIGN KEY (role_code) REFERENCES core.roles(code)` |
| `staff_role_assignments_staff_id_fkey` | `FOREIGN KEY (staff_id) REFERENCES core.staff_profiles(id)` |
| `staff_role_assignments_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `staff_role_assignments_branch_id_idx` | `CREATE INDEX staff_role_assignments_branch_id_idx ON core.staff_role_assignments USING btree (branch_id)` |
| `staff_role_assignments_open_uidx` | `CREATE UNIQUE INDEX staff_role_assignments_open_uidx ON core.staff_role_assignments USING btree (staff_id, role_code, branch_id) NULLS NOT DISTINCT WHERE (valid_to IS NULL)` |
| `staff_role_assignments_pkey` | `CREATE UNIQUE INDEX staff_role_assignments_pkey ON core.staff_role_assignments USING btree (id)` |
| `staff_role_assignments_role_code_idx` | `CREATE INDEX staff_role_assignments_role_code_idx ON core.staff_role_assignments USING btree (role_code)` |
| `staff_role_assignments_staff_id_idx` | `CREATE INDEX staff_role_assignments_staff_id_idx ON core.staff_role_assignments USING btree (staff_id, valid_to)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_15_guard_core_row` | BEFORE | DELETE · UPDATE | ROW | `app.trg_guard_core_row()` | – |
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_check_role_exclusivity` | BEFORE | INSERT · UPDATE | ROW | `app.trg_check_role_exclusivity()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:** ไม่มี → ไม่มี role ใดเห็น/เขียนแถวได้ (เข้าถึงผ่าน RPC `SECURITY DEFINER` เท่านั้น)

#### `core.team_members`

สมาชิกทีม — แหล่งเดียวของสมาชิกภาพ (ข้อ 2 · 7.1) · หัวหน้านับเป็นสมาชิก (is_leader = true) · สมาชิกต้องมี assignment ในสาขาของทีม (ตรวจใน api.set_team_member) · scope TEAM ประเมินจากสมาชิกภาพปัจจุบันของ owner: valid_from ≤ now() < coalesce(valid_to, ∞) · ย้าย/ออกจากทีม = ตั้ง valid_to ไม่ลบแถว

**RLS:** เปิด · **policy:** 0 · **index:** 3 · **trigger:** 4

**GRANT (ทั้งตาราง):** **ไม่มี** — เขียน/อ่านผ่าน trigger หรือ RPC `SECURITY DEFINER` เท่านั้น

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `team_id` | `uuid` | NOT NULL | – | `core.teams(id)` |  | – |
| 4 | `staff_id` | `uuid` | NOT NULL | – | `core.staff_profiles(id)` |  | – |
| 5 | `is_leader` | `boolean` | NOT NULL | `false` | – |  | เป็นหัวหน้าทีมนี้ · ใช้ประเมิน scope TEAM และผู้รับแจ้งเตือน "หัวหน้าทีม" (ข้อ 11.1) |
| 6 | `valid_from` | `timestamp with time zone` | NOT NULL | `now()` | – |  | เริ่มเป็นสมาชิก (ตัดสินสิทธิ์ด้วย now() · ข้อ 1.2) |
| 7 | `valid_to` | `timestamp with time zone` | NULL | – | – |  | สิ้นสุดสมาชิกภาพ (ไม่รวมเวลานี้) · NULL = ยังเป็นสมาชิก |
| 8 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 9 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 10 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 11 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `team_members_pkey` | `PRIMARY KEY (id)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `team_members_valid_range_chk` | `CHECK (((valid_to IS NULL) OR (valid_to >= valid_from)))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `team_members_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `team_members_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `team_members_staff_id_fkey` | `FOREIGN KEY (staff_id) REFERENCES core.staff_profiles(id)` |
| `team_members_team_id_fkey` | `FOREIGN KEY (team_id) REFERENCES core.teams(id)` |
| `team_members_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `team_members_open_uidx` | `CREATE UNIQUE INDEX team_members_open_uidx ON core.team_members USING btree (team_id, staff_id) WHERE (valid_to IS NULL)` |
| `team_members_pkey` | `CREATE UNIQUE INDEX team_members_pkey ON core.team_members USING btree (id)` |
| `team_members_staff_id_idx` | `CREATE INDEX team_members_staff_id_idx ON core.team_members USING btree (staff_id)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_check_team_member_assignment` | BEFORE | INSERT · UPDATE | ROW | `app.trg_check_team_member_assignment()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:** ไม่มี → ไม่มี role ใดเห็น/เขียนแถวได้ (เข้าถึงผ่าน RPC `SECURITY DEFINER` เท่านั้น)

#### `core.teams`

ทีมภายในสาขา (ข้อ 2 · 7.1) · ทุกทีมอยู่ใต้สาขาเดียว (branch_id NOT NULL) · seed: JP1-SALES ทีมขาย JAUNPHONE 1 · JP2-SALES · JP3-SALES · JP4-SALES · JPON-ADMIN ทีมแอดมินออนไลน์ · จัดการผ่าน api.save_team (team.manage)

**RLS:** เปิด · **policy:** 1 · **index:** 3 · **trigger:** 3

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `branch_id` | `uuid` | NOT NULL | – | `core.branches(id)` |  | สาขาของทีม · SUPERVISOR@สาขา X ใช้ scope TEAM ได้เมื่อเป็น is_leader ของทีมที่ branch_id = X อย่างน้อย 1 ทีม |
| 4 | `code` | `text` | NOT NULL | – | – |  | – |
| 5 | `name_th` | `text` | NOT NULL | – | – |  | ชื่อทีม เช่น ทีมขาย JAUNPHONE 1 |
| 6 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 8 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 9 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 10 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `teams_pkey` | `PRIMARY KEY (id)` |
| `teams_code_uq` | `UNIQUE (organization_id, code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `teams_code_chk` | `CHECK ((code ~ '^[A-Z0-9_-]+$'::text))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `teams_branch_id_fkey` | `FOREIGN KEY (branch_id) REFERENCES core.branches(id)` |
| `teams_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `teams_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `teams_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `teams_branch_id_idx` | `CREATE INDEX teams_branch_id_idx ON core.teams USING btree (branch_id)` |
| `teams_code_uq` | `CREATE UNIQUE INDEX teams_code_uq ON core.teams USING btree (organization_id, code)` |
| `teams_pkey` | `CREATE UNIQUE INDEX teams_pkey ON core.teams USING btree (id)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`teams_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (organization_id = ( SELECT app.current_organization_id() AS current_organization_id))
  ```

### 4.2 schema `ref` — 16 ตาราง

> Master Data (lookup) ค่ากลางไม่มี organization_id · เปิดผ่าน Data API · SELECT ตาม RLS

[`ref.channels`](#ref-channels) · [`ref.consent_purposes`](#ref-consent_purposes) · [`ref.duplicate_override_reasons`](#ref-duplicate_override_reasons) · [`ref.export_reasons`](#ref-export_reasons) · [`ref.interaction_types`](#ref-interaction_types) · [`ref.interest_types`](#ref-interest_types) · [`ref.lost_reasons`](#ref-lost_reasons) · [`ref.ownership_change_reasons`](#ref-ownership_change_reasons) · [`ref.priorities`](#ref-priorities) · [`ref.product_types`](#ref-product_types) · [`ref.provinces`](#ref-provinces) · [`ref.source_systems`](#ref-source_systems) · [`ref.sources`](#ref-sources) · [`ref.task_types`](#ref-task_types) · [`ref.transaction_types`](#ref-transaction_types) · [`ref.visit_outcomes`](#ref-visit_outcomes)

#### `ref.channels`

ช่องทางที่ลูกค้าติดต่อ (ข้อ 5.1) · ช่องทาง ≠ แหล่งที่มา (ref.sources) · กราฟ "แหล่งที่มาลูกค้า" ใช้ customers.first_channel_code

**RLS:** เปิด · **policy:** 3 · **index:** 1 · **trigger:** 2

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `channel_group` · `chart_token` · `code` · `is_active` · `is_live` · `label_en` · `label_th` · `sort_order` |
| `authenticated` | UPDATE | `is_active` · `label_en` · `label_th` · `sort_order` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `code` | `text` | NOT NULL | – | – |  | – |
| 2 | `label_th` | `text` | NOT NULL | – | – |  | ชื่อที่แสดง |
| 3 | `label_en` | `text` | NULL | – | – |  | ชื่ออังกฤษตามบรีฟ A1 (Walk-in · LINE · Facebook · Instagram · TikTok · Phone · Web) |
| 4 | `sort_order` | `integer` | NOT NULL | – | – |  | – |
| 5 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 6 | `is_system` | `boolean` | NOT NULL | `false` | – |  | WALK_IN และ PHONE ถูกอ้างในกติกา (ข้อ 3.1 · 4.1 · 6.2 · 12.2 · 12.3) |
| 7 | `channel_group` | `text` | NOT NULL | – | – |  | กลุ่ม offline/online (คอลัมน์ "กลุ่ม" ข้อ 5.1) |
| 8 | `is_live` | `boolean` | NOT NULL | – | – |  | คุยสด (true: WALK_IN · PHONE) หรือข้อความ (false) · lead จากช่องทางสดเริ่ม CONTACTED จากช่องทางข้อความเริ่ม NEW (ข้อ 4.3) · ฐานของ LEAD_RESPONSE_MIN (ข้อ 12.2) |
| 9 | `chart_token` | `text` | NOT NULL | – | – |  | token สีกราฟของช่องทาง (ข้อ 5.1 · 15) ค่าสีจริงอยู่ใน design system |
| 10 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 11 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `channels_pkey` | `PRIMARY KEY (code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `channels_chart_token_chk` | `CHECK ((chart_token ~ '^--chart-[0-9]+$'::text))` |
| `channels_code_chk` | `CHECK ((code ~ '^[A-Z0-9_]+$'::text))` |
| `channels_group_chk` | `CHECK ((channel_group = ANY (ARRAY['offline'::text, 'online'::text])))` |
| `channels_system_active_chk` | `CHECK ((is_active OR (NOT is_system)))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `channels_pkey` | `CREATE UNIQUE INDEX channels_pkey ON ref.channels USING btree (code)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`channels_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

- **`channels_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((( SELECT app.current_staff_id() AS current_staff_id) IS NOT NULL) AND (is_active OR ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)))
  ```

- **`channels_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

#### `ref.consent_purposes`

วัตถุประสงค์ของประกาศ/ความยินยอม (ข้อ 5.8 · 10.2 · [รอยืนยัน DPO]) · PRIVACY_NOTICE บันทึกว่า "แจ้งแล้ว" (บังคับตอน Quick Capture) · MARKETING เป็นความยินยอม (ไม่ติ๊กไว้ก่อน · เลือกช่องทาง LINE SMS PHONE EMAIL) · ถ้า JAUNPHONE กับ JAUN POWER MONEY เป็นคนละนิติบุคคล (Q17) ให้แยก MARKETING_JAUNPHONE · MARKETING_JPM ด้วย migration และระบุ controller_entity

**RLS:** เปิด · **policy:** 3 · **index:** 1 · **trigger:** 2

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `code` · `controller_entity` · `is_active` · `label_en` · `label_th` · `sort_order` |
| `authenticated` | UPDATE | `is_active` · `label_en` · `label_th` · `sort_order` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `code` | `text` | NOT NULL | – | – |  | – |
| 2 | `label_th` | `text` | NOT NULL | – | – |  | – |
| 3 | `label_en` | `text` | NULL | – | – |  | – |
| 4 | `sort_order` | `integer` | NOT NULL | – | – |  | – |
| 5 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 6 | `is_system` | `boolean` | NOT NULL | `false` | – |  | ทั้งสองค่าถูกอ้างในกติกา (api.quick_capture สร้าง PRIVACY_NOTICE · การส่งออกกรอง MARKETING ข้อ 8.2) |
| 7 | `controller_entity` | `text` | NULL | – | – |  | ผู้ควบคุมข้อมูลของวัตถุประสงค์นี้ · NULL = ถือเป็น controller เดียวจนกว่ายืนยัน [รอยืนยัน Q17] |
| 8 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 9 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `consent_purposes_pkey` | `PRIMARY KEY (code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `consent_purposes_code_chk` | `CHECK ((code ~ '^[A-Z0-9_]+$'::text))` |
| `consent_purposes_system_active_chk` | `CHECK ((is_active OR (NOT is_system)))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `consent_purposes_pkey` | `CREATE UNIQUE INDEX consent_purposes_pkey ON ref.consent_purposes USING btree (code)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`consent_purposes_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

- **`consent_purposes_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((( SELECT app.current_staff_id() AS current_staff_id) IS NOT NULL) AND (is_active OR ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)))
  ```

- **`consent_purposes_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

#### `ref.duplicate_override_reasons`

เหตุผลเมื่อกด "ยังต้องการสร้างลูกค้าใหม่" ในแผงตรวจซ้ำ (ข้อ 5.8 · 6.5) · ใช้กับ crm.duplicate_decisions.override_reason_code · OTHER บังคับหมายเหตุ (override_note)

**RLS:** เปิด · **policy:** 3 · **index:** 1 · **trigger:** 2

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `code` · `is_active` · `label_en` · `label_th` · `sort_order` |
| `authenticated` | UPDATE | `is_active` · `label_en` · `label_th` · `sort_order` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `code` | `text` | NOT NULL | – | – |  | – |
| 2 | `label_th` | `text` | NOT NULL | – | – |  | – |
| 3 | `label_en` | `text` | NULL | – | – |  | – |
| 4 | `sort_order` | `integer` | NOT NULL | – | – |  | – |
| 5 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 6 | `is_system` | `boolean` | NOT NULL | `false` | – |  | OTHER ถูกอ้างในกติกา "บังคับหมายเหตุ" |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `duplicate_override_reasons_pkey` | `PRIMARY KEY (code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `duplicate_override_reasons_code_chk` | `CHECK ((code ~ '^[A-Z0-9_]+$'::text))` |
| `duplicate_override_reasons_system_active_chk` | `CHECK ((is_active OR (NOT is_system)))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `duplicate_override_reasons_pkey` | `CREATE UNIQUE INDEX duplicate_override_reasons_pkey ON ref.duplicate_override_reasons USING btree (code)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`duplicate_override_reasons_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

- **`duplicate_override_reasons_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((( SELECT app.current_staff_id() AS current_staff_id) IS NOT NULL) AND (is_active OR ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)))
  ```

- **`duplicate_override_reasons_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

#### `ref.export_reasons`

เหตุผลของคำขอส่งออกข้อมูลลูกค้า (ข้อ 5.8 · 8.2) · OTHER บังคับหมายเหตุ

**RLS:** เปิด · **policy:** 3 · **index:** 1 · **trigger:** 2

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `code` · `is_active` · `is_marketing` · `label_en` · `label_th` · `sort_order` |
| `authenticated` | UPDATE | `is_active` · `label_en` · `label_th` · `sort_order` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `code` | `text` | NOT NULL | – | – |  | – |
| 2 | `label_th` | `text` | NOT NULL | – | – |  | – |
| 3 | `label_en` | `text` | NULL | – | – |  | – |
| 4 | `sort_order` | `integer` | NOT NULL | – | – |  | – |
| 5 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 6 | `is_system` | `boolean` | NOT NULL | `false` | – |  | OTHER ถูกอ้างในกติกา "บังคับหมายเหตุ" |
| 7 | `is_marketing` | `boolean` | NOT NULL | `false` | – |  | true = กลุ่มการตลาด → กรองเฉพาะลูกค้าที่ยินยอม MARKETING ทุกบทบาท (ข้อ 8.2) |
| 8 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 9 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `export_reasons_pkey` | `PRIMARY KEY (code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `export_reasons_code_chk` | `CHECK ((code ~ '^[A-Z0-9_]+$'::text))` |
| `export_reasons_system_active_chk` | `CHECK ((is_active OR (NOT is_system)))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `export_reasons_pkey` | `CREATE UNIQUE INDEX export_reasons_pkey ON ref.export_reasons USING btree (code)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`export_reasons_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

- **`export_reasons_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((( SELECT app.current_staff_id() AS current_staff_id) IS NOT NULL) AND (is_active OR ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)))
  ```

- **`export_reasons_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

#### `ref.interaction_types`

ประเภทของ interaction (ข้อ 5.6 · [รอยืนยัน Q13]) · NOTE ใช้กับ direction INTERNAL เท่านั้น (ตรวจใน trigger/RPC ของ interactions)

**RLS:** เปิด · **policy:** 3 · **index:** 1 · **trigger:** 2

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `code` · `is_active` · `label_en` · `label_th` · `sort_order` |
| `authenticated` | UPDATE | `is_active` · `label_en` · `label_th` · `sort_order` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `code` | `text` | NOT NULL | – | – |  | – |
| 2 | `label_th` | `text` | NOT NULL | – | – |  | – |
| 3 | `label_en` | `text` | NULL | – | – |  | – |
| 4 | `sort_order` | `integer` | NOT NULL | – | – |  | – |
| 5 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 6 | `is_system` | `boolean` | NOT NULL | `false` | – |  | VISIT · INQUIRY · PURCHASE (ประเภทของ interaction ต้นทางของ visit ข้อ 3.3 · outcome PURCHASED → PURCHASE) · QUOTATION_SENT (สร้างเมื่อส่งใบเสนอราคา ข้อ 4.6) · NOTE (INTERNAL) |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `interaction_types_pkey` | `PRIMARY KEY (code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `interaction_types_code_chk` | `CHECK ((code ~ '^[A-Z0-9_]+$'::text))` |
| `interaction_types_system_active_chk` | `CHECK ((is_active OR (NOT is_system)))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `interaction_types_pkey` | `CREATE UNIQUE INDEX interaction_types_pkey ON ref.interaction_types USING btree (code)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`interaction_types_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

- **`interaction_types_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((( SELECT app.current_staff_id() AS current_staff_id) IS NOT NULL) AND (is_active OR ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)))
  ```

- **`interaction_types_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

#### `ref.interest_types`

วัตถุประสงค์/ความสนใจของลูกค้า (ข้อ 5.3 · B6) · หน้ารับลูกค้าแสดงชิปครบทุกค่าที่ is_active ตาม sort_order · "Service Type" ในบรีฟ = ตารางนี้ + ref.transaction_types (D39)

**RLS:** เปิด · **policy:** 3 · **index:** 1 · **trigger:** 2

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `code` · `creates_lead` · `is_active` · `label_en` · `label_th` · `sort_order` |
| `authenticated` | UPDATE | `is_active` · `label_en` · `label_th` · `sort_order` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `code` | `text` | NOT NULL | – | – |  | – |
| 2 | `label_th` | `text` | NOT NULL | – | – |  | – |
| 3 | `label_en` | `text` | NULL | – | – |  | ใส่เฉพาะคำอังกฤษจากบรีฟ B6 (Trade-in · Accessories) · NULL = รอยืนยัน |
| 4 | `sort_order` | `integer` | NOT NULL | – | – |  | – |
| 5 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 6 | `is_system` | `boolean` | NOT NULL | `false` | – |  | – |
| 7 | `creates_lead` | `boolean` | NOT NULL | – | – |  | true = ถือเป็นโอกาสขาย · api.quick_capture สร้าง lead อัตโนมัติ (owner = ผู้บันทึก) · REPAIR/INQUIRY ไม่สร้าง (ข้อ 6.2) |
| 8 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 9 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `interest_types_pkey` | `PRIMARY KEY (code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `interest_types_code_chk` | `CHECK ((code ~ '^[A-Z0-9_]+$'::text))` |
| `interest_types_system_active_chk` | `CHECK ((is_active OR (NOT is_system)))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `interest_types_pkey` | `CREATE UNIQUE INDEX interest_types_pkey ON ref.interest_types USING btree (code)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`interest_types_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

- **`interest_types_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((( SELECT app.current_staff_id() AS current_staff_id) IS NOT NULL) AND (is_active OR ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)))
  ```

- **`interest_types_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

#### `ref.lost_reasons`

เหตุผลที่ lead/opportunity ไม่สำเร็จ (ข้อ 5.5) · กราฟแสดง 5 อันดับแรก + "อื่น ๆ" เรียงมากไปน้อย คะแนนเท่ากันเรียงตาม sort_order · OTHER บังคับ lost_note (ตรวจใน trigger/RPC ของ leads/opportunities)

**RLS:** เปิด · **policy:** 3 · **index:** 1 · **trigger:** 2

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `code` · `is_active` · `label_en` · `label_th` · `sort_order` |
| `authenticated` | UPDATE | `is_active` · `label_en` · `label_th` · `sort_order` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `code` | `text` | NOT NULL | – | – |  | – |
| 2 | `label_th` | `text` | NOT NULL | – | – |  | – |
| 3 | `label_en` | `text` | NULL | – | – |  | คำอังกฤษจากบรีฟ A8 (Price · Timing · Stock · Product · Competitor · Finance · Down Payment · Promotion · Contact · Service · Other) · ค่าจาก mockup B เป็น NULL |
| 4 | `sort_order` | `integer` | NOT NULL | – | – |  | – |
| 5 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 6 | `is_system` | `boolean` | NOT NULL | `false` | – |  | OTHER ถูกอ้างในกติกา "บังคับ lost_note" |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `lost_reasons_pkey` | `PRIMARY KEY (code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `lost_reasons_code_chk` | `CHECK ((code ~ '^[A-Z0-9_]+$'::text))` |
| `lost_reasons_system_active_chk` | `CHECK ((is_active OR (NOT is_system)))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `lost_reasons_pkey` | `CREATE UNIQUE INDEX lost_reasons_pkey ON ref.lost_reasons USING btree (code)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`lost_reasons_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

- **`lost_reasons_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((( SELECT app.current_staff_id() AS current_staff_id) IS NOT NULL) AND (is_active OR ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)))
  ```

- **`lost_reasons_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

#### `ref.ownership_change_reasons`

เหตุผลการเปลี่ยนผู้รับผิดชอบ/สาขา ใช้กับ crm.ownership_changes.reason_code (ข้อ 5.8 · A28)

**RLS:** เปิด · **policy:** 3 · **index:** 1 · **trigger:** 2

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `code` · `is_active` · `label_en` · `label_th` · `sort_order` |
| `authenticated` | UPDATE | `is_active` · `label_en` · `label_th` · `sort_order` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `code` | `text` | NOT NULL | – | – |  | – |
| 2 | `label_th` | `text` | NOT NULL | – | – |  | – |
| 3 | `label_en` | `text` | NULL | – | – |  | – |
| 4 | `sort_order` | `integer` | NOT NULL | – | – |  | – |
| 5 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 6 | `is_system` | `boolean` | NOT NULL | `false` | – |  | STAFF_LEFT (api.disable_staff ข้อ 7.3) · BRANCH_TRANSFER (ย้ายสาขา ข้อ 9.4.2) |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `ownership_change_reasons_pkey` | `PRIMARY KEY (code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `ownership_change_reasons_code_chk` | `CHECK ((code ~ '^[A-Z0-9_]+$'::text))` |
| `ownership_change_reasons_system_active_chk` | `CHECK ((is_active OR (NOT is_system)))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `ownership_change_reasons_pkey` | `CREATE UNIQUE INDEX ownership_change_reasons_pkey ON ref.ownership_change_reasons USING btree (code)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`ownership_change_reasons_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

- **`ownership_change_reasons_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((( SELECT app.current_staff_id() AS current_staff_id) IS NOT NULL) AND (is_active OR ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)))
  ```

- **`ownership_change_reasons_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

#### `ref.priorities`

ความสำคัญของ lead/opportunity/task (ข้อ 4.7) · ขอบซ้ายการ์ด Pipeline สีตาม priority (ข้อ 13.9)

**RLS:** เปิด · **policy:** 3 · **index:** 1 · **trigger:** 2

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `code` · `color_token` · `is_active` · `label_en` · `label_th` · `sort_order` |
| `authenticated` | UPDATE | `is_active` · `label_en` · `label_th` · `sort_order` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `code` | `text` | NOT NULL | – | – |  | – |
| 2 | `label_th` | `text` | NOT NULL | – | – |  | – |
| 3 | `label_en` | `text` | NULL | – | – |  | – |
| 4 | `sort_order` | `integer` | NOT NULL | – | – |  | – |
| 5 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 6 | `is_system` | `boolean` | NOT NULL | `false` | – |  | NORMAL = ค่าเริ่มต้นของ lead จาก Quick Capture (ข้อ 4.3) |
| 7 | `color_token` | `text` | NOT NULL | – | – |  | สีสถานะ neutral/info/warning/danger (คอลัมน์ "สี" ข้อ 4.7) |
| 8 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 9 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `priorities_pkey` | `PRIMARY KEY (code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `priorities_code_chk` | `CHECK ((code ~ '^[A-Z0-9_]+$'::text))` |
| `priorities_color_token_chk` | `CHECK ((color_token = ANY (ARRAY['neutral'::text, 'info'::text, 'warning'::text, 'danger'::text])))` |
| `priorities_system_active_chk` | `CHECK ((is_active OR (NOT is_system)))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `priorities_pkey` | `CREATE UNIQUE INDEX priorities_pkey ON ref.priorities USING btree (code)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`priorities_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

- **`priorities_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((( SELECT app.current_staff_id() AS current_staff_id) IS NOT NULL) AND (is_active OR ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)))
  ```

- **`priorities_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

#### `ref.product_types`

ประเภทสินค้า (ข้อ 5.4 · [รอยืนยัน Q13]) · รุ่นเก็บเป็นข้อความ product_model ใน V1 (catalog จาก POS ใน Phase 4)

**RLS:** เปิด · **policy:** 3 · **index:** 1 · **trigger:** 2

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `code` · `is_active` · `label_en` · `label_th` · `sort_order` |
| `authenticated` | UPDATE | `is_active` · `label_en` · `label_th` · `sort_order` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `code` | `text` | NOT NULL | – | – |  | – |
| 2 | `label_th` | `text` | NOT NULL | – | – |  | – |
| 3 | `label_en` | `text` | NULL | – | – |  | ชื่อแบรนด์ภาษาอังกฤษเท่ากับป้ายที่แสดง · NULL = รอยืนยัน |
| 4 | `sort_order` | `integer` | NOT NULL | – | – |  | – |
| 5 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 6 | `is_system` | `boolean` | NOT NULL | `false` | – |  | – |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `product_types_pkey` | `PRIMARY KEY (code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `product_types_code_chk` | `CHECK ((code ~ '^[A-Z0-9_]+$'::text))` |
| `product_types_system_active_chk` | `CHECK ((is_active OR (NOT is_system)))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `product_types_pkey` | `CREATE UNIQUE INDEX product_types_pkey ON ref.product_types USING btree (code)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`product_types_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

- **`product_types_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((( SELECT app.current_staff_id() AS current_staff_id) IS NOT NULL) AND (is_active OR ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)))
  ```

- **`product_types_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

#### `ref.provinces`

จังหวัด 77 จังหวัด (ข้อ 5.8) · code = ISO 3166-2:TH · ไม่รวม TH-S (พัทยา เมืองพิเศษ ไม่ใช่จังหวัด) · หมายเหตุผู้เขียน: sort_order เรียงตามเลขรหัส ISO (กรุงเทพมหานครก่อน) เพราะ CANONICAL ไม่กำหนดลำดับ

**RLS:** เปิด · **policy:** 3 · **index:** 3 · **trigger:** 2

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `code` · `is_active` · `label_en` · `label_th` · `sort_order` |
| `authenticated` | UPDATE | `is_active` · `label_en` · `label_th` · `sort_order` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `code` | `text` | NOT NULL | – | – |  | – |
| 2 | `label_th` | `text` | NOT NULL | – | – |  | – |
| 3 | `label_en` | `text` | NOT NULL | – | – |  | ชื่อตาม ISO 3166-2:TH (TH-10 ใช้ชื่อทางการ Krung Thep Maha Nakhon · ISO ระบุชื่อสามัญ Bangkok) |
| 4 | `sort_order` | `integer` | NOT NULL | – | – |  | – |
| 5 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 6 | `is_system` | `boolean` | NOT NULL | `false` | – |  | – |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `provinces_pkey` | `PRIMARY KEY (code)` |
| `provinces_label_en_key` | `UNIQUE (label_en)` |
| `provinces_label_th_key` | `UNIQUE (label_th)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `provinces_code_chk` | `CHECK ((code ~ '^TH-[0-9]{2}$'::text))` |
| `provinces_system_active_chk` | `CHECK ((is_active OR (NOT is_system)))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `provinces_label_en_key` | `CREATE UNIQUE INDEX provinces_label_en_key ON ref.provinces USING btree (label_en)` |
| `provinces_label_th_key` | `CREATE UNIQUE INDEX provinces_label_th_key ON ref.provinces USING btree (label_th)` |
| `provinces_pkey` | `CREATE UNIQUE INDEX provinces_pkey ON ref.provinces USING btree (code)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`provinces_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

- **`provinces_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((( SELECT app.current_staff_id() AS current_staff_id) IS NOT NULL) AND (is_active OR ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)))
  ```

- **`provinces_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

#### `ref.source_systems`

ระบบต้นทางของ transaction ref (ข้อ 5.7 · [รอยืนยัน Q14]) · UNIQUE(source_system_code, external_no) ที่ crm.transaction_refs · หน้า Integration แสดงทุกค่า "ยังไม่เชื่อมต่อ (Phase 4)" ยกเว้น MANUAL (ข้อ 13.14)

**RLS:** เปิด · **policy:** 3 · **index:** 1 · **trigger:** 2

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `code` · `is_active` · `label_en` · `label_th` · `sort_order` |
| `authenticated` | UPDATE | `is_active` · `label_en` · `label_th` · `sort_order` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `code` | `text` | NOT NULL | – | – |  | – |
| 2 | `label_th` | `text` | NOT NULL | – | – |  | – |
| 3 | `label_en` | `text` | NULL | – | – |  | – |
| 4 | `sort_order` | `integer` | NOT NULL | – | – |  | – |
| 5 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 6 | `is_system` | `boolean` | NOT NULL | `false` | – |  | MANUAL = การผูกเลขธุรกรรมด้วยมือของ V1 (transaction.link) |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `source_systems_pkey` | `PRIMARY KEY (code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `source_systems_code_chk` | `CHECK ((code ~ '^[A-Z0-9_]+$'::text))` |
| `source_systems_system_active_chk` | `CHECK ((is_active OR (NOT is_system)))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `source_systems_pkey` | `CREATE UNIQUE INDEX source_systems_pkey ON ref.source_systems USING btree (code)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`source_systems_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

- **`source_systems_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((( SELECT app.current_staff_id() AS current_staff_id) IS NOT NULL) AND (is_active OR ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)))
  ```

- **`source_systems_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

#### `ref.sources`

แหล่งที่ลูกค้ารู้จักร้าน (ข้อ 5.2 · [รอยืนยัน Q13]) · ใช้กับ customers.first_source_code และ visits/leads.source_code · Customer 360 แสดง "รู้จักร้านจาก {label_th}"

**RLS:** เปิด · **policy:** 3 · **index:** 1 · **trigger:** 2

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `code` · `is_active` · `label_en` · `label_th` · `sort_order` |
| `authenticated` | UPDATE | `is_active` · `label_en` · `label_th` · `sort_order` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `code` | `text` | NOT NULL | – | – |  | – |
| 2 | `label_th` | `text` | NOT NULL | – | – |  | – |
| 3 | `label_en` | `text` | NULL | – | – |  | – |
| 4 | `sort_order` | `integer` | NOT NULL | – | – |  | – |
| 5 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 6 | `is_system` | `boolean` | NOT NULL | `false` | – |  | – |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `sources_pkey` | `PRIMARY KEY (code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `sources_code_chk` | `CHECK ((code ~ '^[A-Z0-9_]+$'::text))` |
| `sources_system_active_chk` | `CHECK ((is_active OR (NOT is_system)))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `sources_pkey` | `CREATE UNIQUE INDEX sources_pkey ON ref.sources USING btree (code)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`sources_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

- **`sources_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((( SELECT app.current_staff_id() AS current_staff_id) IS NOT NULL) AND (is_active OR ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)))
  ```

- **`sources_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

#### `ref.task_types`

ประเภทงาน (ข้อ 4.7) · ใช้กับ tasks.task_type_code และ next_action_type_code ของ lead/opportunity · follow-up = FOLLOW_UP (D7)

**RLS:** เปิด · **policy:** 3 · **index:** 1 · **trigger:** 2

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `code` · `is_active` · `label_en` · `label_th` · `sort_order` |
| `authenticated` | UPDATE | `is_active` · `label_en` · `label_th` · `sort_order` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `code` | `text` | NOT NULL | – | – |  | – |
| 2 | `label_th` | `text` | NOT NULL | – | – |  | – |
| 3 | `label_en` | `text` | NULL | – | – |  | – |
| 4 | `sort_order` | `integer` | NOT NULL | – | – |  | – |
| 5 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 6 | `is_system` | `boolean` | NOT NULL | `false` | – |  | FOLLOW_UP (ป้าย "ติดตามอยู่" ข้อ 3.5 · KPI ข้อ 12) · CALL (next_action_type_code เริ่มต้นของ Quick Capture ข้อ 4.3) |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `task_types_pkey` | `PRIMARY KEY (code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `task_types_code_chk` | `CHECK ((code ~ '^[A-Z0-9_]+$'::text))` |
| `task_types_system_active_chk` | `CHECK ((is_active OR (NOT is_system)))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `task_types_pkey` | `CREATE UNIQUE INDEX task_types_pkey ON ref.task_types USING btree (code)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`task_types_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

- **`task_types_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((( SELECT app.current_staff_id() AS current_staff_id) IS NOT NULL) AND (is_active OR ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)))
  ```

- **`task_types_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

#### `ref.transaction_types`

ประเภทธุรกรรมของ crm.transaction_refs (ข้อ 5.7 · [รอยืนยัน Q14])

**RLS:** เปิด · **policy:** 3 · **index:** 1 · **trigger:** 2

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `code` · `counts_as_purchase` · `is_active` · `label_en` · `label_th` · `purchase_tab_group` · `sort_order` |
| `authenticated` | UPDATE | `is_active` · `label_en` · `label_th` · `sort_order` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `code` | `text` | NOT NULL | – | – |  | – |
| 2 | `label_th` | `text` | NOT NULL | – | – |  | – |
| 3 | `label_en` | `text` | NULL | – | – |  | – |
| 4 | `sort_order` | `integer` | NOT NULL | – | – |  | – |
| 5 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 6 | `is_system` | `boolean` | NOT NULL | `false` | – |  | – |
| 7 | `counts_as_purchase` | `boolean` | NOT NULL | – | – |  | true = นับเป็นเหตุการณ์การซื้อ (ข้อ 3.1) เมื่อ ref ไม่ผูก opportunity หรือ opportunity นั้นไม่ใช่ WON · ใช้กับ BUYERS REPEAT_BUYERS lifecycle ยอดซื้อสะสม |
| 8 | `purchase_tab_group` | `text` | NOT NULL | – | – |  | กลุ่มในแท็บ "การซื้อและบริการ" ของ Customer 360 (ข้อ 5.7 · 6.8): การซื้อ · Trade-in · ผ่อน · รับซื้อ · ซ่อม |
| 9 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 10 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `transaction_types_pkey` | `PRIMARY KEY (code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `transaction_types_code_chk` | `CHECK ((code ~ '^[A-Z0-9_]+$'::text))` |
| `transaction_types_system_active_chk` | `CHECK ((is_active OR (NOT is_system)))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `transaction_types_pkey` | `CREATE UNIQUE INDEX transaction_types_pkey ON ref.transaction_types USING btree (code)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`transaction_types_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

- **`transaction_types_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((( SELECT app.current_staff_id() AS current_staff_id) IS NOT NULL) AND (is_active OR ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)))
  ```

- **`transaction_types_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

#### `ref.visit_outcomes`

ผลของการให้บริการเมื่อปิด visit (ข้อ 4.2) · is_system ทุกค่า · สี่ค่าแรกจาก B6 สามค่าหลังเป็นข้อเสนอเพิ่ม [รอยืนยัน] · ผลต่อรายการอื่นบังคับใน api.close_visit: PURCHASED/FOLLOW_UP ต้องมี customer_id · FOLLOW_UP ต้องมี lead/opportunity เปิดที่มี next action · NOT_YET ถ้ามีรายการเปิดต้องมี next action · NOT_INTERESTED lead ที่เปิดจาก visit นี้ต้องปิด LOST · LEFT_BEFORE_SERVICE ตั้งอัตโนมัติเมื่อ LEFT · UNRECORDED ตั้งโดย app.job_close_stale_visits

**RLS:** เปิด · **policy:** 3 · **index:** 1 · **trigger:** 2

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `code` · `counts_as_recorded` · `is_active` · `label_en` · `label_th` · `sort_order` |
| `authenticated` | UPDATE | `is_active` · `label_en` · `label_th` · `sort_order` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `code` | `text` | NOT NULL | – | – |  | – |
| 2 | `label_th` | `text` | NOT NULL | – | – |  | – |
| 3 | `label_en` | `text` | NULL | – | – |  | – |
| 4 | `sort_order` | `integer` | NOT NULL | – | – |  | – |
| 5 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 6 | `is_system` | `boolean` | NOT NULL | `true` | – |  | – |
| 7 | `counts_as_recorded` | `boolean` | NOT NULL | – | – |  | true = นับเป็น "บันทึกผลครบ" ในตัวตั้งของ OUTCOME_COMPLETION (ข้อ 12.2) · false เฉพาะ UNRECORDED |
| 8 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 9 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `visit_outcomes_pkey` | `PRIMARY KEY (code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `visit_outcomes_code_chk` | `CHECK ((code ~ '^[A-Z0-9_]+$'::text))` |
| `visit_outcomes_system_active_chk` | `CHECK ((is_active OR (NOT is_system)))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `visit_outcomes_pkey` | `CREATE UNIQUE INDEX visit_outcomes_pkey ON ref.visit_outcomes USING btree (code)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`visit_outcomes_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

- **`visit_outcomes_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((( SELECT app.current_staff_id() AS current_staff_id) IS NOT NULL) AND (is_active OR ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)))
  ```

- **`visit_outcomes_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

  WITH CHECK

  ```sql
  ( SELECT app.has_permission('master_data.manage'::text) AS has_permission)
  ```

### 4.3 schema `crm` — 26 ตาราง

> ลูกค้า · กิจกรรม · lead · opportunity · quotation · task · transaction ref · notification · เปิดผ่าน Data API · สิทธิ์ตามตาราง + column grant (ข้อ 9.4)

[`crm.campaigns`](#crm-campaigns) · [`crm.customer_addresses`](#crm-customer_addresses) · [`crm.customer_branches`](#crm-customer_branches) · [`crm.customer_consents`](#crm-customer_consents) · [`crm.customer_contacts`](#crm-customer_contacts) · [`crm.customer_merges`](#crm-customer_merges) · [`crm.customer_notes`](#crm-customer_notes) · [`crm.customer_tags`](#crm-customer_tags) · [`crm.customers`](#crm-customers) · [`crm.data_subject_requests`](#crm-data_subject_requests) · [`crm.duplicate_decisions`](#crm-duplicate_decisions) · [`crm.interactions`](#crm-interactions) · [`crm.lead_status_history`](#crm-lead_status_history) · [`crm.leads`](#crm-leads) · [`crm.notifications`](#crm-notifications) · [`crm.opportunities`](#crm-opportunities) · [`crm.opportunity_items`](#crm-opportunity_items) · [`crm.opportunity_stage_history`](#crm-opportunity_stage_history) · [`crm.ownership_changes`](#crm-ownership_changes) · [`crm.quotation_items`](#crm-quotation_items) · [`crm.quotations`](#crm-quotations) · [`crm.tags`](#crm-tags) · [`crm.task_comments`](#crm-task_comments) · [`crm.tasks`](#crm-tasks) · [`crm.transaction_refs`](#crm-transaction_refs) · [`crm.visits`](#crm-visits)

#### `crm.campaigns`

แคมเปญ (ข้อ 5.10 · D25 campaign_sources → channel_code) · V1 ไม่มีหน้าจัดการแคมเปญ: MARKETING/BUSINESS_ADMIN เพิ่มที่หน้า master-data แท็บ "แคมเปญ" (campaign.manage) · campaign_members และหน้าแคมเปญเต็ม = Phase 4 · ห้ามลบ (is_active = false)

**RLS:** เปิด · **policy:** 3 · **index:** 2 · **trigger:** 3

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `channel_code` · `code` · `ends_on` · `is_active` · `name_th` · `starts_on` |
| `authenticated` | UPDATE | `channel_code` · `ends_on` · `is_active` · `name_th` · `starts_on` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `code` | `text` | NOT NULL | – | – |  | รหัสแคมเปญ ไม่ซ้ำในองค์กร |
| 4 | `name_th` | `text` | NOT NULL | – | – |  | ชื่อแคมเปญ (ข้อมูลระดับ Public เมื่อประกาศแล้ว ข้อ 10.1) |
| 5 | `channel_code` | `text` | NULL | – | `ref.channels(code)` |  | ช่องทางหลักของแคมเปญ (ref.channels) · ไม่บังคับ |
| 6 | `starts_on` | `date` | NULL | – | – |  | วันเริ่ม (วันที่ Asia/Bangkok) |
| 7 | `ends_on` | `date` | NULL | – | – |  | วันสิ้นสุด (รวมวันนี้) · ≥ starts_on |
| 8 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 9 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 10 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 11 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 12 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `campaigns_pkey` | `PRIMARY KEY (id)` |
| `campaigns_code_uq` | `UNIQUE (organization_id, code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `campaigns_code_chk` | `CHECK ((code ~ '^[A-Z0-9_-]+$'::text))` |
| `campaigns_name_chk` | `CHECK ((btrim(name_th) <> ''::text))` |
| `campaigns_period_chk` | `CHECK (((starts_on IS NULL) OR (ends_on IS NULL) OR (ends_on >= starts_on)))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `campaigns_channel_code_fkey` | `FOREIGN KEY (channel_code) REFERENCES ref.channels(code)` |
| `campaigns_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `campaigns_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `campaigns_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `campaigns_code_uq` | `CREATE UNIQUE INDEX campaigns_code_uq ON crm.campaigns USING btree (organization_id, code)` |
| `campaigns_pkey` | `CREATE UNIQUE INDEX campaigns_pkey ON crm.campaigns USING btree (id)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`campaigns_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ((organization_id = ( SELECT app.current_organization_id() AS current_organization_id)) AND ( SELECT app.has_permission('campaign.manage'::text) AS has_permission))
  ```

- **`campaigns_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((organization_id = ( SELECT app.current_organization_id() AS current_organization_id)) AND ( SELECT app.has_permission('campaign.read'::text) AS has_permission))
  ```

- **`campaigns_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((organization_id = ( SELECT app.current_organization_id() AS current_organization_id)) AND ( SELECT app.has_permission('campaign.manage'::text) AS has_permission))
  ```

  WITH CHECK

  ```sql
  ((organization_id = ( SELECT app.current_organization_id() AS current_organization_id)) AND ( SELECT app.has_permission('campaign.manage'::text) AS has_permission))
  ```

#### `crm.customer_addresses`

ที่อยู่ของลูกค้า (ข้อ 6.4) · กติกาคอลัมน์เดียวกับ customer_contacts: authenticated เห็นเฉพาะระดับอำเภอ/จังหวัด (district · province_code · value_masked) · ที่อยู่เต็มผ่าน reveal เท่านั้น · เพิ่ม/แก้ผ่าน api.save_address (customer.update) · anonymize = ลบแถว · หมายเหตุผู้เขียน: CANONICAL ไม่ระบุคอลัมน์ ผู้เขียนแยกส่วนที่เปิดเผยได้ (อำเภอ/จังหวัด) ออกจากส่วนที่ปิดบัง (บ้านเลขที่ ตำบล รหัสไปรษณีย์)

**RLS:** เปิด · **policy:** 1 · **index:** 3 · **trigger:** 3

**GRANT (ทั้งตาราง):** **ไม่มี** — เขียน/อ่านผ่าน trigger หรือ RPC `SECURITY DEFINER` เท่านั้น

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | SELECT | `created_at` · `customer_id` · `district` · `id` · `is_active` · `is_primary` · `organization_id` · `province_code` · `updated_at` · `value_masked` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `customer_id` | `uuid` | NOT NULL | – | `crm.customers(id)` |  | – |
| 4 | `address_line` | `text` | NOT NULL | – | – | **pii** | บ้านเลขที่ หมู่ อาคาร ซอย ถนน |
| 5 | `subdistrict` | `text` | NULL | – | – | **pii** | ตำบล/แขวง |
| 6 | `district` | `text` | NULL | – | – |  | อำเภอ/เขต (ระดับที่แสดงได้) |
| 7 | `province_code` | `text` | NULL | – | `ref.provinces(code)` |  | จังหวัด (ระดับที่แสดงได้) |
| 8 | `postal_code` | `text` | NULL | – | – | **pii** | รหัสไปรษณีย์ 5 หลัก |
| 9 | `value_masked` | `text` | NOT NULL | – | – |  | ค่าที่แสดงได้ระดับอำเภอ/จังหวัด ตั้งโดย api.save_address · หมายเหตุผู้เขียน: รูปแบบ "{district} · {ref.provinces.label_th}" (มีส่วนเดียวแสดงส่วนนั้น · ไม่มีทั้งคู่ = —) |
| 10 | `is_primary` | `boolean` | NOT NULL | `false` | – |  | – |
| 11 | `is_active` | `boolean` | NOT NULL | `true` | – |  | – |
| 12 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 13 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 14 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 15 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `customer_addresses_pkey` | `PRIMARY KEY (id)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `customer_addresses_address_line_chk` | `CHECK ((btrim(address_line) <> ''::text))` |
| `customer_addresses_postal_code_chk` | `CHECK (((postal_code IS NULL) OR (postal_code ~ '^[0-9]{5}$'::text)))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `customer_addresses_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `customer_addresses_customer_id_fkey` | `FOREIGN KEY (customer_id) REFERENCES crm.customers(id)` |
| `customer_addresses_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `customer_addresses_province_code_fkey` | `FOREIGN KEY (province_code) REFERENCES ref.provinces(code)` |
| `customer_addresses_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `customer_addresses_customer_id_idx` | `CREATE INDEX customer_addresses_customer_id_idx ON crm.customer_addresses USING btree (customer_id)` |
| `customer_addresses_pkey` | `CREATE UNIQUE INDEX customer_addresses_pkey ON crm.customer_addresses USING btree (id)` |
| `customer_addresses_primary_active_uidx` | `CREATE UNIQUE INDEX customer_addresses_primary_active_uidx ON crm.customer_addresses USING btree (customer_id) WHERE (is_primary AND is_active)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`customer_addresses_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids))
  ```

#### `crm.customer_branches`

ความเชื่อมโยงลูกค้า ↔ สาขา ใช้ประเมิน scope ของลูกค้า (ข้อ 6.6 · 8.0) · PK (customer_id, branch_id) ตาม CANONICAL จึงไม่มีคอลัมน์ id · เขียนโดย trigger app.trg_link_customer_branch (เมื่อเกิด visit/interaction/lead/opportunity/transaction ref ที่สาขา) และ api.link_customer_to_branch เท่านั้น · merge = upsert least(first_linked_at) greatest(last_activity_at) · ไม่ถูกบันทึกใน audit (ข้อ 9.5)

**RLS:** เปิด · **policy:** 1 · **index:** 2 · **trigger:** 2

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 2 | `customer_id` | `uuid` | NOT NULL | – | `crm.customers(id)` |  | – |
| 3 | `branch_id` | `uuid` | NOT NULL | – | `core.branches(id)` |  | – |
| 4 | `first_linked_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | เวลาที่ลูกค้าเชื่อมกับสาขานี้ครั้งแรก |
| 5 | `last_activity_at` | `timestamp with time zone` | NULL | – | – |  | เวลากิจกรรมล่าสุดของลูกค้าที่สาขานี้ ("สาขาที่เคยใช้บริการ" บน Customer 360) |
| 6 | `linked_via` | `crm.customer_link_via` | NOT NULL | – | – |  | เหตุที่เชื่อมครั้งแรก: CREATED · VISIT · INTERACTION · LEAD · OPPORTUNITY · MANUAL_LINK · MERGE |
| 7 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 8 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 9 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 10 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `customer_branches_pkey` | `PRIMARY KEY (customer_id, branch_id)` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `customer_branches_branch_id_fkey` | `FOREIGN KEY (branch_id) REFERENCES core.branches(id)` |
| `customer_branches_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `customer_branches_customer_id_fkey` | `FOREIGN KEY (customer_id) REFERENCES crm.customers(id)` |
| `customer_branches_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `customer_branches_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `customer_branches_branch_customer_idx` | `CREATE INDEX customer_branches_branch_customer_idx ON crm.customer_branches USING btree (branch_id, customer_id)` |
| `customer_branches_pkey` | `CREATE UNIQUE INDEX customer_branches_pkey ON crm.customer_branches USING btree (customer_id, branch_id)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`customer_branches_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids))
  ```

#### `crm.customer_consents`

ประวัติการแจ้งประกาศ/ความยินยอม (ข้อ 10.2 · [รอยืนยัน DPO]) · append-only: ไม่มี UPDATE/DELETE ไม่มีคอลัมน์ withdrawn_at · ถอน = แถวใหม่ WITHDRAWN · เขียนผ่าน api.quick_capture (PRIVACY_NOTICE) และ api.record_consent (customer.consent.manage) เท่านั้น · ข้อยกเว้นเดียวที่ UPDATE: app.anonymize_customer ล้าง evidence (ข้อ 10.4) · สถานะปัจจุบันอ่านจาก view crm.customer_consent_current · MARKETING บังคับติ๊กเพิ่ม "ลูกค้าอายุ 20 ปีขึ้นไป หรือผู้ใช้อำนาจปกครองยินยอม" (ตรวจใน RPC)

**RLS:** เปิด · **policy:** 1 · **index:** 2 · **trigger:** 3

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `customer_id` | `uuid` | NOT NULL | – | `crm.customers(id)` |  | – |
| 4 | `purpose_code` | `text` | NOT NULL | – | `ref.consent_purposes(code)` |  | PRIVACY_NOTICE · MARKETING (ref.consent_purposes) |
| 5 | `status` | `crm.consent_status` | NOT NULL | – | – |  | GRANTED · WITHDRAWN |
| 6 | `notice_version` | `text` | NULL | – | – |  | ฉบับประกาศความเป็นส่วนตัวที่แจ้ง เช่น PN-2026-01 [รอยืนยัน Q9] |
| 7 | `channels` | `text[]` | NOT NULL | `'{}'::text[]` | – |  | ช่องทางที่ยินยอม ⊆ {LINE, SMS, PHONE, EMAIL} (ใช้กับ MARKETING · ใช้กรองคอลัมน์ส่งออกข้อ 8.2) · ว่างได้ |
| 8 | `captured_via` | `crm.consent_capture_via` | NOT NULL | – | – |  | STAFF_FORM · LINK_SENT (ช่องทางออนไลน์/โทรบันทึก PRIVACY_NOTICE ได้เมื่อส่งลิงก์แล้ว) · LINE_OA · WEB |
| 9 | `captured_by` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | พนักงานผู้บันทึก (บังคับเมื่อ STAFF_FORM หรือ LINK_SENT) |
| 10 | `captured_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | เวลาที่แจ้ง/ได้รับความยินยอม · แถวล่าสุดต่อ purpose ตามคอลัมน์นี้คือสถานะปัจจุบัน |
| 11 | `evidence` | `text` | NOT NULL | – | – | **pii** | หลักฐาน: version + ช่องทาง + ข้อความ/ลิงก์ที่ส่ง (บังคับ) |
| 12 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 13 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 14 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 15 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `customer_consents_pkey` | `PRIMARY KEY (id)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `customer_consents_captured_by_chk` | `CHECK (((captured_via <> ALL (ARRAY['STAFF_FORM'::crm.consent_capture_via, 'LINK_SENT'::crm.consent_capture_via])) OR (captured_by IS NOT NULL)))` |
| `customer_consents_channels_chk` | `CHECK (((channels <@ ARRAY['LINE'::text, 'SMS'::text, 'PHONE'::text, 'EMAIL'::text]) AND (array_position(channels, NULL::text) IS NULL)))` |
| `customer_consents_evidence_chk` | `CHECK ((btrim(evidence) <> ''::text))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `customer_consents_captured_by_fkey` | `FOREIGN KEY (captured_by) REFERENCES core.staff_profiles(id)` |
| `customer_consents_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `customer_consents_customer_id_fkey` | `FOREIGN KEY (customer_id) REFERENCES crm.customers(id)` |
| `customer_consents_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `customer_consents_purpose_code_fkey` | `FOREIGN KEY (purpose_code) REFERENCES ref.consent_purposes(code)` |
| `customer_consents_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `customer_consents_current_idx` | `CREATE INDEX customer_consents_current_idx ON crm.customer_consents USING btree (customer_id, purpose_code, captured_at DESC, created_at DESC)` |
| `customer_consents_pkey` | `CREATE UNIQUE INDEX customer_consents_pkey ON crm.customer_consents USING btree (id)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`customer_consents_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids))
  ```

#### `crm.customer_contacts`

ช่องทางติดต่อของลูกค้า (ข้อ 6.4) · ค่าเต็มควบคุมระดับคอลัมน์: authenticated ได้ SELECT เฉพาะ id organization_id customer_id contact_type value_masked is_primary is_valid is_active verified_at created_at updated_at · เพิ่ม/แก้ผ่าน api.save_contact (customer.update) · ค่าเต็มได้ทางเดียวคือ api.reveal_contact (customer.pii.reveal · เขียน CONTACT_REVEALED) · ผู้เขียนใส่เฉพาะ value_raw — value_normalized และ value_masked เป็น generated column จาก app.normalize_contact / app.mask_contact จึงไม่ผิดเพี้ยนจากกัน · ค่าที่ normalize แล้วว่าง (เช่น PHONE ที่ไม่มีตัวเลข) ถูกปฏิเสธด้วย NOT NULL · anonymize = ลบแถว

**RLS:** เปิด · **policy:** 1 · **index:** 5 · **trigger:** 3

**GRANT (ทั้งตาราง):** **ไม่มี** — เขียน/อ่านผ่าน trigger หรือ RPC `SECURITY DEFINER` เท่านั้น

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | SELECT | `contact_type` · `created_at` · `customer_id` · `id` · `is_active` · `is_primary` · `is_valid` · `organization_id` · `updated_at` · `value_masked` · `verified_at` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `customer_id` | `uuid` | NOT NULL | – | `crm.customers(id)` |  | – |
| 4 | `contact_type` | `crm.contact_type` | NOT NULL | – | – |  | PHONE · LINE_ID · LINE_USER_ID · FACEBOOK · INSTAGRAM · TIKTOK · EMAIL |
| 5 | `value_raw` | `text` | NOT NULL | – | – | **pii** | ค่าที่กรอก/ได้รับตามจริง |
| 6 | `value_normalized` | `text` | NOT NULL | `GENERATED ALWAYS AS (app.normalize_contact(contact_type, value_raw)) STORED` | – | **pii** | generated = app.normalize_contact(contact_type, value_raw) · PHONE เป็น E.164 (+66812345678) · ใช้ค้นแบบตรงทั้งค่าเท่านั้น (ห้าม LIKE/prefix/trigram ข้อ 6.5) · audit/access log เก็บ sha256 ของค่านี้ |
| 7 | `value_masked` | `text` | NOT NULL | `GENERATED ALWAYS AS (app.mask_contact(contact_type, app.normalize_contact(contact_type, value_raw))) STORED` | – |  | generated = app.mask_contact(…) · ค่าที่แสดงได้ทั่วไป เช่น 081-XXX-5678 · s***@example.com · so*** · — (LINE_USER_ID) |
| 8 | `is_primary` | `boolean` | NOT NULL | `false` | – |  | ช่องทางหลักของชนิดนั้น (หนึ่งรายการต่อชนิดต่อลูกค้าในแถวที่ใช้งาน) |
| 9 | `is_valid` | `boolean` | NOT NULL | `true` | – |  | รูปแบบถูกต้อง · PHONE: api.save_contact ตั้งจาก app.is_valid_thai_phone(value_raw) (มือถือ 06/08/09 10 หลัก หรือเบอร์บ้าน 02–07 9 หลัก) · false = ที่มาของ INVALID_PHONE (ข้อ 12.3) |
| 10 | `is_active` | `boolean` | NOT NULL | `true` | – |  | false = ปิดใช้งาน (เก็บประวัติ) · ลูกค้าที่ไม่มี PHONE ที่ใช้งานเป็นที่มาของ MISSING_PHONE |
| 11 | `verified_at` | `timestamp with time zone` | NULL | – | – |  | เวลาที่ยืนยันว่าเป็นช่องทางของลูกค้าจริง · merge ใช้เลือกแถวที่ verified ก่อน |
| 12 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 13 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 14 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 15 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `customer_contacts_pkey` | `PRIMARY KEY (id)` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `customer_contacts_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `customer_contacts_customer_id_fkey` | `FOREIGN KEY (customer_id) REFERENCES crm.customers(id)` |
| `customer_contacts_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `customer_contacts_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `customer_contacts_customer_id_idx` | `CREATE INDEX customer_contacts_customer_id_idx ON crm.customer_contacts USING btree (customer_id)` |
| `customer_contacts_pkey` | `CREATE UNIQUE INDEX customer_contacts_pkey ON crm.customer_contacts USING btree (id)` |
| `customer_contacts_primary_active_uidx` | `CREATE UNIQUE INDEX customer_contacts_primary_active_uidx ON crm.customer_contacts USING btree (customer_id, contact_type) WHERE (is_primary AND is_active)` |
| `customer_contacts_type_normalized_idx` | `CREATE INDEX customer_contacts_type_normalized_idx ON crm.customer_contacts USING btree (contact_type, value_normalized)` |
| `customer_contacts_value_active_uidx` | `CREATE UNIQUE INDEX customer_contacts_value_active_uidx ON crm.customer_contacts USING btree (customer_id, contact_type, value_normalized) WHERE is_active` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`customer_contacts_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids))
  ```

#### `crm.customer_merges`

ประวัติการรวมลูกค้า (ข้อ 6.7) · เขียนโดย api.merge_customers ในทรานแซกชันเดียวกับการย้ายข้อมูล (app.bulk = on) · SELECT = แถวแม่อ่านได้ · V1 ไม่มี unmerge

**RLS:** เปิด · **policy:** 1 · **index:** 5 · **trigger:** 4

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `merge_no` | `text` | NOT NULL | – | – |  | เลขการรวม MG-{YYYY}-{NNNNNN} ตัวนับ MG:{YYYY} |
| 4 | `survivor_customer_id` | `uuid` | NOT NULL | – | `crm.customers(id)` |  | ลูกค้าที่คงอยู่ |
| 5 | `merged_customer_id` | `uuid` | NOT NULL | – | `crm.customers(id)` |  | ลูกค้าที่ถูกรวม (record_status → MERGED) |
| 6 | `duplicate_decision_id` | `uuid` | NULL | – | `crm.duplicate_decisions(id)` |  | แถว duplicate_decisions ที่การรวมนี้ปิด (ถ้ามี) |
| 7 | `reason` | `text` | NOT NULL | – | – |  | เหตุผลการรวม (p_reason) |
| 8 | `field_choices` | `jsonb` | NOT NULL | `'{}'::jsonb` | – |  | p_field_choices: เลือกค่าของแต่ละ field จากรายใด · first_seen_at/first_channel_code/first_source_code/first_branch_id ไม่ใช้ค่านี้ (มาจากรายที่ first_seen_at เก่ากว่า) |
| 9 | `snapshot` | `jsonb` | NOT NULL | – | – | **pii** | ภาพก่อนรวมของทั้งสองรายแบบปิดบัง PII ตามกติกา audit (ข้อ 9.5) · anonymize ล้างค่า |
| 10 | `moved_counts` | `jsonb` | NOT NULL | `'{}'::jsonb` | – |  | จำนวนแถวที่ย้ายแยกตาราง เช่น {"crm.visits": 3, "crm.customer_contacts": 1} |
| 11 | `merged_by` | `uuid` | NOT NULL | – | `core.staff_profiles(id)` |  | ผู้รวม (customer.merge 🔐 · ≠ duplicate_decisions.created_by) |
| 12 | `merged_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 13 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 14 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 15 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 16 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `customer_merges_pkey` | `PRIMARY KEY (id)` |
| `customer_merges_merge_no_key` | `UNIQUE (merge_no)` |
| `customer_merges_merged_uq` | `UNIQUE (merged_customer_id)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `customer_merges_json_chk` | `CHECK (((jsonb_typeof(field_choices) = 'object'::text) AND (jsonb_typeof(moved_counts) = 'object'::text)))` |
| `customer_merges_no_chk` | `CHECK ((merge_no ~ '^MG-[0-9]{4}-[0-9]{6,}$'::text))` |
| `customer_merges_pair_chk` | `CHECK ((survivor_customer_id <> merged_customer_id))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `customer_merges_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `customer_merges_duplicate_decision_id_fkey` | `FOREIGN KEY (duplicate_decision_id) REFERENCES crm.duplicate_decisions(id)` |
| `customer_merges_merged_by_fkey` | `FOREIGN KEY (merged_by) REFERENCES core.staff_profiles(id)` |
| `customer_merges_merged_customer_id_fkey` | `FOREIGN KEY (merged_customer_id) REFERENCES crm.customers(id)` |
| `customer_merges_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `customer_merges_survivor_customer_id_fkey` | `FOREIGN KEY (survivor_customer_id) REFERENCES crm.customers(id)` |
| `customer_merges_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `customer_merges_decision_idx` | `CREATE INDEX customer_merges_decision_idx ON crm.customer_merges USING btree (duplicate_decision_id) WHERE (duplicate_decision_id IS NOT NULL)` |
| `customer_merges_merge_no_key` | `CREATE UNIQUE INDEX customer_merges_merge_no_key ON crm.customer_merges USING btree (merge_no)` |
| `customer_merges_merged_uq` | `CREATE UNIQUE INDEX customer_merges_merged_uq ON crm.customer_merges USING btree (merged_customer_id)` |
| `customer_merges_pkey` | `CREATE UNIQUE INDEX customer_merges_pkey ON crm.customer_merges USING btree (id)` |
| `customer_merges_survivor_idx` | `CREATE INDEX customer_merges_survivor_idx ON crm.customer_merges USING btree (survivor_customer_id)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_05_running_number` | BEFORE | INSERT | ROW | `app.trg_assign_running_number()` | – |
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`customer_merges_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((survivor_customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids)) OR (merged_customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids)))
  ```

#### `crm.customer_notes`

โน้ตของลูกค้า (ข้อ 6.9) · ไม่มี DELETE · อ่าน = อ่านลูกค้าได้ (read-through) · สร้าง = note.create · แก้ = note.update (ของตนภายใน 24 ชม. ตัดสินด้วย now()) · ฟอร์มแสดงคำเตือน "ห้ามบันทึกเลขบัตรประชาชน รายได้ ข้อมูลสุขภาพหรือศาสนา" · body ผ่าน app.trg_guard_restricted_text (ข้อ 10.1) · "รายละเอียดเพิ่มเติม" ของ Quick Capture = โน้ตแรก (ข้อ 6.2)

**RLS:** เปิด · **policy:** 3 · **index:** 6 · **trigger:** 5

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `body` · `branch_id` · `customer_id` · `interaction_id` · `is_pinned` |
| `authenticated` | UPDATE | `body` · `is_pinned` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `customer_id` | `uuid` | NOT NULL | – | `crm.customers(id)` |  | – |
| 4 | `interaction_id` | `uuid` | NULL | – | `crm.interactions(id)` |  | interaction ที่โน้ตนี้บันทึกประกอบ (ไม่บังคับ) |
| 5 | `branch_id` | `uuid` | NOT NULL | – | `core.branches(id)` |  | สาขาที่บันทึก ใช้ประเมิน scope ของ note.update (ข้อ 8.0) · หมายเหตุผู้เขียน: ข้อ 6.9 ไม่ระบุ NOT NULL แต่ scope ต่อแถวต้องมีสาขา จึงบังคับ |
| 6 | `body` | `text` | NOT NULL | – | – | **pii** | เนื้อหาโน้ต ≤ 2,000 ตัวอักษร · anonymize แทนด้วยข้อความคงที่ (ไม่ใช่ค่าว่าง) |
| 7 | `is_pinned` | `boolean` | NOT NULL | `false` | – |  | ปักหมุด · โน้ตที่ปักหมุดล่าสุดถูกคัดลอกไป customers.note_summary |
| 8 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 9 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 10 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 11 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `customer_notes_pkey` | `PRIMARY KEY (id)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `customer_notes_body_chk` | `CHECK (((char_length(body) <= 2000) AND (btrim(body) <> ''::text)))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `customer_notes_branch_id_fkey` | `FOREIGN KEY (branch_id) REFERENCES core.branches(id)` |
| `customer_notes_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `customer_notes_customer_id_fkey` | `FOREIGN KEY (customer_id) REFERENCES crm.customers(id)` |
| `customer_notes_interaction_id_fkey` | `FOREIGN KEY (interaction_id) REFERENCES crm.interactions(id)` |
| `customer_notes_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `customer_notes_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `customer_notes_branch_id_idx` | `CREATE INDEX customer_notes_branch_id_idx ON crm.customer_notes USING btree (branch_id)` |
| `customer_notes_created_by_idx` | `CREATE INDEX customer_notes_created_by_idx ON crm.customer_notes USING btree (created_by)` |
| `customer_notes_customer_created_idx` | `CREATE INDEX customer_notes_customer_created_idx ON crm.customer_notes USING btree (customer_id, created_at DESC)` |
| `customer_notes_interaction_id_idx` | `CREATE INDEX customer_notes_interaction_id_idx ON crm.customer_notes USING btree (interaction_id) WHERE (interaction_id IS NOT NULL)` |
| `customer_notes_pinned_idx` | `CREATE INDEX customer_notes_pinned_idx ON crm.customer_notes USING btree (customer_id, created_at DESC) WHERE is_pinned` |
| `customer_notes_pkey` | `CREATE UNIQUE INDEX customer_notes_pkey ON crm.customer_notes USING btree (id)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_20_guard_text` | BEFORE | INSERT · UPDATE | ROW | `app.trg_guard_restricted_text('body')` | – |
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_sync_note_summary` | AFTER | INSERT · DELETE · UPDATE OF is_pinned, body, customer_id | ROW | `app.trg_sync_note_summary()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`customer_notes_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ((customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids)) AND ((branch_id = ANY (( SELECT app.scope_branch_ids('note.create'::text, 'ORGANIZATION'::core.data_scope) AS scope_branch_ids)::uuid[])) OR (((EXISTS ( SELECT 1
     FROM crm.customer_branches cb
    WHERE ((cb.customer_id = customer_notes.customer_id) AND (cb.branch_id = customer_notes.branch_id)))) OR (EXISTS ( SELECT 1
     FROM crm.customers c
    WHERE ((c.id = customer_notes.customer_id) AND (c.first_branch_id = customer_notes.branch_id))))) AND ((branch_id = ANY (( SELECT app.scope_branch_ids('note.create'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, ( SELECT c.owner_staff_id
     FROM crm.customers c
    WHERE (c.id = customer_notes.customer_id))) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('note.create'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('note.create'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (( SELECT c.owner_staff_id
     FROM crm.customers c
    WHERE (c.id = customer_notes.customer_id)) = ( SELECT app.current_staff_id() AS current_staff_id)))))) AND ((interaction_id IS NULL) OR (interaction_id IN ( SELECT i.id
     FROM crm.interactions i
    WHERE (i.customer_id = customer_notes.customer_id)))))
  ```

- **`customer_notes_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids))
  ```

- **`customer_notes_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((created_at > (now() - '24:00:00'::interval)) AND ((branch_id = ANY (( SELECT app.scope_branch_ids('note.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('note.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (created_by = ( SELECT app.current_staff_id() AS current_staff_id)))))
  ```

  WITH CHECK

  ```sql
  ((customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids)) AND ((branch_id = ANY (( SELECT app.scope_branch_ids('note.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('note.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (created_by = ( SELECT app.current_staff_id() AS current_staff_id)))))
  ```

#### `crm.customer_tags`

tag ที่ติดกับลูกค้า (ข้อ 8.3) · SELECT = ลูกค้าอ่านได้ · INSERT/DELETE = customer.update บนลูกค้า และ tag ต้อง is_active · DELETE ได้ (บันทึก CUSTOMER_TAG_REMOVED) · merge ย้ายด้วย ON CONFLICT DO NOTHING

**RLS:** เปิด · **policy:** 3 · **index:** 3 · **trigger:** 3

**GRANT (ทั้งตาราง):** `authenticated` = SELECT, DELETE

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `customer_id` · `tag_id` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `customer_id` | `uuid` | NOT NULL | – | `crm.customers(id)` |  | – |
| 4 | `tag_id` | `uuid` | NOT NULL | – | `crm.tags(id)` |  | – |
| 5 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 6 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 7 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 8 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `customer_tags_pkey` | `PRIMARY KEY (id)` |
| `customer_tags_uq` | `UNIQUE (customer_id, tag_id)` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `customer_tags_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `customer_tags_customer_id_fkey` | `FOREIGN KEY (customer_id) REFERENCES crm.customers(id)` |
| `customer_tags_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `customer_tags_tag_id_fkey` | `FOREIGN KEY (tag_id) REFERENCES crm.tags(id)` |
| `customer_tags_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `customer_tags_pkey` | `CREATE UNIQUE INDEX customer_tags_pkey ON crm.customer_tags USING btree (id)` |
| `customer_tags_tag_id_idx` | `CREATE INDEX customer_tags_tag_id_idx ON crm.customer_tags USING btree (tag_id)` |
| `customer_tags_uq` | `CREATE UNIQUE INDEX customer_tags_uq ON crm.customer_tags USING btree (customer_id, tag_id)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`customer_tags_delete`** — DELETE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (customer_id IN ( SELECT app.customer_ids_in_scope('customer.update'::text) AS customer_ids_in_scope))
  ```

- **`customer_tags_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ((customer_id IN ( SELECT app.customer_ids_in_scope('customer.update'::text) AS customer_ids_in_scope)) AND (tag_id IN ( SELECT t.id
     FROM crm.tags t
    WHERE (t.is_active AND (t.organization_id = ( SELECT app.current_organization_id() AS current_organization_id))))))
  ```

- **`customer_tags_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids))
  ```

#### `crm.customers`

Customer Master (ข้อ 6.3) · สร้างได้ทางเดียวคือ api.quick_capture (authenticated ไม่มี INSERT) · นำเข้าข้อมูลเดิมด้วยสคริปต์ (created_via IMPORT) · SELECT ผ่าน RLS id IN (SELECT app.readable_customer_ids()) · คอลัมน์ระบบไม่อยู่ใน column grant ของ UPDATE (ข้อ 9.4 กติกา 7) · ไม่มี DELETE (ลบจริง = anonymize ข้อ 10.4) · กติกา "ชื่อหรือชื่อเล่นอย่างน้อยหนึ่งช่อง" และ "ช่องทางแรก/สาขา บังคับ" ตรวจตอนสร้างใน RPC ไม่ใช่ CHECK ถาวร (ข้อ 6.2)

**RLS:** เปิด · **policy:** 2 · **index:** 9 · **trigger:** 5

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | UPDATE | `customer_type` · `first_name` · `last_name` · `nickname` · `province_code` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `customer_no` | `text` | NOT NULL | – | – |  | เลขลูกค้า CUS-{YYYY}-{NNNNNN} ตัวนับ CUS:{YYYY} ปีจาก created_at Asia/Bangkok (ข้อ 6.1) · ออกโดย app.trg_assign_running_number ถ้าแถวยังไม่มีเลข |
| 4 | `first_name` | `text` | NULL | – | – | **pii** | ชื่อ · anonymize แทนด้วย 'ลูกค้านิรนาม ' \|\| customer_no |
| 5 | `last_name` | `text` | NULL | – | – | **pii** | นามสกุล · anonymize = NULL |
| 6 | `nickname` | `text` | NULL | – | – | **pii** | ชื่อเล่น · anonymize = NULL |
| 7 | `display_name` | `text` | NULL | `GENERATED ALWAYS AS (COALESCE(NULLIF(btrim(((COALESCE(first_name, ''::text) \|\| ' '::text) \|\| COALESCE(last_name, ''::text))), ''::text), nickname)) STORED` | – | **pii** | generated: "ชื่อ นามสกุล" ที่ตัดช่องว่างหัวท้าย ถ้าว่างใช้ชื่อเล่น · UI เติมคำนำหน้า "คุณ" เอง (ไม่เก็บ) |
| 8 | `name_search` | `text` | NULL | `GENERATED ALWAYS AS (lower(btrim(((COALESCE(first_name, ''::text) \|\| ' '::text) \|\| COALESCE(last_name, ''::text))))) STORED` | – | **pii** | generated: lower("ชื่อ นามสกุล") สำหรับค้นแบบ trigram (GIN extensions.gin_trgm_ops) และกฎตรวจซ้ำชื่อ (ข้อ 6.5) · ไม่รวมชื่อเล่น |
| 9 | `customer_type` | `text` | NOT NULL | `'INDIVIDUAL'::text` | – |  | INDIVIDUAL (ค่าเริ่มต้น) · BUSINESS · ไม่แสดงบน Quick Capture ไม่ใช้ใน KPI (ข้อ 5.8) |
| 10 | `first_seen_at` | `timestamp with time zone` | NOT NULL | – | – |  | เวลาของกิจกรรมแรกที่รู้ (ไม่ใช่เวลาสร้างแถว · ข้อ 3.2) · ตอนสร้าง = least(created_at, เวลากิจกรรมที่แนบมา) · trigger ของตารางกิจกรรมตั้ง least(first_seen_at, เวลาเหตุการณ์) · invariant: ไม่มีกิจกรรมที่ occurred_at < first_seen_at · ใช้แยกลูกค้าใหม่/เก่า |
| 11 | `first_channel_code` | `text` | NULL | – | `ref.channels(code)` |  | ช่องทางของกิจกรรมแรก · ใช้กับกราฟ "แหล่งที่มาลูกค้า" (ข้อ 13.3) และ MISSING_PHONE (ข้อ 12.3) |
| 12 | `first_source_code` | `text` | NULL | – | `ref.sources(code)` |  | แหล่งที่รู้จักร้านของกิจกรรมแรก · Customer 360 แสดง "รู้จักร้านจาก {source}" |
| 13 | `first_branch_id` | `uuid` | NULL | – | `core.branches(id)` |  | สาขาของกิจกรรมแรก ("สาขาที่สนใจ" ของ mockup B) · ใช้ประเมิน scope ของลูกค้าร่วมกับ customer_branches (ข้อ 8.0) และผูกรายการคุณภาพข้อมูลระดับลูกค้ากับสาขา (ข้อ 12.3) |
| 14 | `owner_staff_id` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | ผู้ดูแลลูกค้า · เปลี่ยนต้องมี customer.assign และบันทึก crm.ownership_changes (ข้อ 9.4.2) |
| 15 | `lifecycle_stage` | `text` | NOT NULL | `'IDENTIFIED'::text` | – |  | แคชสถานะวงจรชีวิต (ข้อ 3.4) REPEAT · CUSTOMER · OPPORTUNITY · LEAD · LOST · IDENTIFIED · ปรับโดย app.refresh_customer_lifecycle เท่านั้น ห้ามแก้ด้วยมือ |
| 16 | `record_status` | `crm.customer_record_status` | NOT NULL | `'ACTIVE'::crm.customer_record_status` | – |  | ACTIVE · MERGED (มี merged_into_id · เปิด customer_no เดิม redirect ไป survivor) · ANONYMIZED |
| 17 | `merged_into_id` | `uuid` | NULL | – | `crm.customers(id)` |  | survivor ที่ลูกค้ารายนี้ถูกรวมเข้า (มีค่าเมื่อ record_status = MERGED เท่านั้น) |
| 18 | `province_code` | `text` | NULL | – | `ref.provinces(code)` |  | จังหวัด (ISO 3166-2:TH) · anonymize = NULL |
| 19 | `note_summary` | `text` | NULL | – | – | **pii** | เนื้อหาโน้ตที่ปักหมุดล่าสุด (ตั้งโดย trigger ของ customer_notes) · ผู้ใช้แก้ตรงไม่ได้ |
| 20 | `legal_hold` | `boolean` | NOT NULL | `false` | – |  | true = ข้ามการ anonymize ทั้ง DSR และ retention (ข้อ 10.3 · 10.4) · เปลี่ยนผ่าน api.set_legal_hold (dsr.manage 🔐) |
| 21 | `created_via` | `text` | NOT NULL | – | – |  | QUICK_CAPTURE · IMPORT (ข้อมูลเดิม) · MERGE_SURVIVOR |
| 22 | `last_activity_at` | `timestamp with time zone` | NULL | – | – |  | แคช: เวลากิจกรรมล่าสุดตามข้อ 3.1 (trigger app.trg_touch_customer_activity) · เรียงรายการลูกค้าและกรองช่วงวันที่ · ฐานระยะเก็บ 24 เดือน |
| 23 | `last_channel_code` | `text` | NULL | – | `ref.channels(code)` |  | แคช: ช่องทางของ interaction ล่าสุดที่ไม่ใช่ INTERNAL ("ช่องทางล่าสุด" หน้า 03) |
| 24 | `last_branch_id` | `uuid` | NULL | – | `core.branches(id)` |  | แคช: สาขาของกิจกรรมล่าสุด ("สาขา" หน้า 03) |
| 25 | `has_open_followup` | `boolean` | NOT NULL | `false` | – |  | แคช: มี task FOLLOW_UP สถานะ OPEN/IN_PROGRESS (ป้าย "ติดตามอยู่" ข้อ 3.5) · ทุกผู้ดูเห็นป้ายเดียวกัน |
| 26 | `has_new_lead` | `boolean` | NOT NULL | `false` | – |  | แคช: มี lead เปิดอยู่สถานะ NEW (ป้าย "ยังไม่ได้ติดต่อ" ข้อ 3.5) |
| 27 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 28 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 29 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 30 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `customers_pkey` | `PRIMARY KEY (id)` |
| `customers_customer_no_key` | `UNIQUE (customer_no)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `customers_created_via_chk` | `CHECK ((created_via = ANY (ARRAY['QUICK_CAPTURE'::text, 'IMPORT'::text, 'MERGE_SURVIVOR'::text])))` |
| `customers_customer_no_chk` | `CHECK ((customer_no ~ '^CUS-[0-9]{4}-[0-9]{6,}$'::text))` |
| `customers_customer_type_chk` | `CHECK ((customer_type = ANY (ARRAY['INDIVIDUAL'::text, 'BUSINESS'::text])))` |
| `customers_lifecycle_stage_chk` | `CHECK ((lifecycle_stage = ANY (ARRAY['REPEAT'::text, 'CUSTOMER'::text, 'OPPORTUNITY'::text, 'LEAD'::text, 'LOST'::text, 'IDENTIFIED'::text])))` |
| `customers_merged_chk` | `CHECK (((record_status = 'MERGED'::crm.customer_record_status) = (merged_into_id IS NOT NULL)))` |
| `customers_merged_self_chk` | `CHECK (((merged_into_id IS NULL) OR (merged_into_id <> id)))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `customers_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `customers_first_branch_id_fkey` | `FOREIGN KEY (first_branch_id) REFERENCES core.branches(id)` |
| `customers_first_channel_code_fkey` | `FOREIGN KEY (first_channel_code) REFERENCES ref.channels(code)` |
| `customers_first_source_code_fkey` | `FOREIGN KEY (first_source_code) REFERENCES ref.sources(code)` |
| `customers_last_branch_id_fkey` | `FOREIGN KEY (last_branch_id) REFERENCES core.branches(id)` |
| `customers_last_channel_code_fkey` | `FOREIGN KEY (last_channel_code) REFERENCES ref.channels(code)` |
| `customers_merged_into_id_fkey` | `FOREIGN KEY (merged_into_id) REFERENCES crm.customers(id)` |
| `customers_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `customers_owner_staff_id_fkey` | `FOREIGN KEY (owner_staff_id) REFERENCES core.staff_profiles(id)` |
| `customers_province_code_fkey` | `FOREIGN KEY (province_code) REFERENCES ref.provinces(code)` |
| `customers_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `customers_customer_no_key` | `CREATE UNIQUE INDEX customers_customer_no_key ON crm.customers USING btree (customer_no)` |
| `customers_first_branch_id_idx` | `CREATE INDEX customers_first_branch_id_idx ON crm.customers USING btree (first_branch_id)` |
| `customers_first_seen_at_idx` | `CREATE INDEX customers_first_seen_at_idx ON crm.customers USING btree (first_seen_at)` |
| `customers_last_activity_idx` | `CREATE INDEX customers_last_activity_idx ON crm.customers USING btree (last_activity_at DESC, customer_no DESC)` |
| `customers_last_branch_id_idx` | `CREATE INDEX customers_last_branch_id_idx ON crm.customers USING btree (last_branch_id)` |
| `customers_merged_into_id_idx` | `CREATE INDEX customers_merged_into_id_idx ON crm.customers USING btree (merged_into_id) WHERE (merged_into_id IS NOT NULL)` |
| `customers_name_search_trgm_idx` | `CREATE INDEX customers_name_search_trgm_idx ON crm.customers USING gin (name_search extensions.gin_trgm_ops)` |
| `customers_owner_staff_id_idx` | `CREATE INDEX customers_owner_staff_id_idx ON crm.customers USING btree (owner_staff_id)` |
| `customers_pkey` | `CREATE UNIQUE INDEX customers_pkey ON crm.customers USING btree (id)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_05_running_number` | BEFORE | INSERT | ROW | `app.trg_assign_running_number()` | – |
| `trg_10_enforce_transition` | BEFORE | INSERT · UPDATE | ROW | `app.enforce_row_transition()` | – |
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`customers_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids))
  ```

- **`customers_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (id IN ( SELECT app.customer_ids_in_scope('customer.update'::text) AS customer_ids_in_scope))
  ```

  WITH CHECK

  ```sql
  (id IN ( SELECT app.customer_ids_in_scope('customer.update'::text) AS customer_ids_in_scope))
  ```

#### `crm.data_subject_requests`

คำขอของเจ้าของข้อมูล DSR (ข้อ 10.4 · [รอยืนยัน DPO]) · รับคำขอที่หน้าร้าน: api.create_dsr (dsr.create · ST/SV/BM/BA) · ดำเนินการ: dsr.manage 🔐 (BA) · SELECT = dsr.manage (ผู้รับคำขอเห็นของตน) · ACCESS/PORTABILITY → api.build_dsr_package · WITHDRAW_CONSENT/OBJECTION → consent WITHDRAWN · DELETION → api.anonymize_customer (ต้อง VERIFIED และ verified_by ≠ ผู้ดำเนินการ) · ห้ามเก็บสำเนาบัตร · หน้า 17 ใน seed ไม่มีรายการ

**RLS:** เปิด · **policy:** 1 · **index:** 5 · **trigger:** 4

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `request_no` | `text` | NOT NULL | – | – |  | เลขคำขอ DSR-{YYYY}-{NNNNNN} ตัวนับ DSR:{YYYY} |
| 4 | `customer_id` | `uuid` | NULL | – | `crm.customers(id)` |  | ลูกค้าที่เกี่ยวข้อง · NULL ได้ (ยังระบุตัวลูกค้าไม่ได้) |
| 5 | `requester_name` | `text` | NOT NULL | – | – | **pii** | ชื่อผู้ยื่นคำขอ · หมายเหตุผู้เขียน: การล้างค่านี้ตอน anonymize (เก็บเป็นหลักฐานการดำเนินการ) รอยืนยัน DPO |
| 6 | `requester_contact_masked` | `text` | NULL | – | – |  | ช่องทางติดต่อกลับของผู้ยื่นแบบปิดบังเท่านั้น (รูปแบบเดียวกับ app.mask_contact) |
| 7 | `request_type` | `crm.dsr_type` | NOT NULL | – | – |  | ACCESS · CORRECTION · DELETION · OBJECTION · WITHDRAW_CONSENT · PORTABILITY |
| 8 | `status` | `crm.dsr_status` | NOT NULL | `'RECEIVED'::crm.dsr_status` | – |  | RECEIVED → VERIFIED → IN_PROGRESS → COMPLETED หรือ REJECTED |
| 9 | `received_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 10 | `received_by` | `uuid` | NOT NULL | – | `core.staff_profiles(id)` |  | พนักงานผู้รับคำขอ |
| 11 | `due_at` | `timestamp with time zone` | NULL | `GENERATED ALWAYS AS ((((received_at AT TIME ZONE 'Asia/Bangkok'::text) + '30 days'::interval) AT TIME ZONE 'Asia/Bangkok'::text)) STORED` | – |  | generated: กำหนดเสร็จ = received_at + 30 วัน · การขยายเวลาใช้ extended_until |
| 12 | `verification_method` | `text` | NULL | – | – |  | IN_PERSON_ID_SIGHTED เห็นบัตรต่อหน้า · OTP_TO_REGISTERED_CONTACT · OTHER — ห้ามเก็บสำเนาบัตร |
| 13 | `verified_by` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | ผู้ยืนยันตัวตนผู้ยื่น (≠ ผู้ดำเนินการ anonymize) |
| 14 | `extended_until` | `timestamp with time zone` | NULL | – | – |  | กำหนดเสร็จใหม่เมื่อขยายเวลา (ต้องมี extension_reason) |
| 15 | `extension_reason` | `text` | NULL | – | – |  | เหตุผลการขยายเวลา |
| 16 | `completed_at` | `timestamp with time zone` | NULL | – | – |  | เวลาดำเนินการเสร็จ (มีค่าเมื่อ COMPLETED เท่านั้น) |
| 17 | `note` | `text` | NULL | – | – | **pii** | หมายเหตุการดำเนินการ |
| 18 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 19 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 20 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 21 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `data_subject_requests_pkey` | `PRIMARY KEY (id)` |
| `data_subject_requests_request_no_key` | `UNIQUE (request_no)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `data_subject_requests_completed_chk` | `CHECK (((status = 'COMPLETED'::crm.dsr_status) = (completed_at IS NOT NULL)))` |
| `data_subject_requests_extension_chk` | `CHECK (((extended_until IS NULL) OR ((extension_reason IS NOT NULL) AND (btrim(extension_reason) <> ''::text))))` |
| `data_subject_requests_no_chk` | `CHECK ((request_no ~ '^DSR-[0-9]{4}-[0-9]{6,}$'::text))` |
| `data_subject_requests_verification_chk` | `CHECK (((verification_method IS NULL) OR (verification_method = ANY (ARRAY['IN_PERSON_ID_SIGHTED'::text, 'OTP_TO_REGISTERED_CONTACT'::text, 'OTHER'::text]))))` |
| `data_subject_requests_verified_chk` | `CHECK (((status <> ALL (ARRAY['VERIFIED'::crm.dsr_status, 'IN_PROGRESS'::crm.dsr_status, 'COMPLETED'::crm.dsr_status])) OR ((verified_by IS NOT NULL) AND (verification_method IS NOT NULL))))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `data_subject_requests_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `data_subject_requests_customer_id_fkey` | `FOREIGN KEY (customer_id) REFERENCES crm.customers(id)` |
| `data_subject_requests_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `data_subject_requests_received_by_fkey` | `FOREIGN KEY (received_by) REFERENCES core.staff_profiles(id)` |
| `data_subject_requests_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |
| `data_subject_requests_verified_by_fkey` | `FOREIGN KEY (verified_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `data_subject_requests_customer_id_idx` | `CREATE INDEX data_subject_requests_customer_id_idx ON crm.data_subject_requests USING btree (customer_id) WHERE (customer_id IS NOT NULL)` |
| `data_subject_requests_pkey` | `CREATE UNIQUE INDEX data_subject_requests_pkey ON crm.data_subject_requests USING btree (id)` |
| `data_subject_requests_received_by_idx` | `CREATE INDEX data_subject_requests_received_by_idx ON crm.data_subject_requests USING btree (received_by)` |
| `data_subject_requests_request_no_key` | `CREATE UNIQUE INDEX data_subject_requests_request_no_key ON crm.data_subject_requests USING btree (request_no)` |
| `data_subject_requests_status_due_idx` | `CREATE INDEX data_subject_requests_status_due_idx ON crm.data_subject_requests USING btree (status, due_at)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_05_running_number` | BEFORE | INSERT | ROW | `app.trg_assign_running_number()` | – |
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`data_subject_requests_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((organization_id = ( SELECT app.current_organization_id() AS current_organization_id)) AND (( SELECT app.has_permission('dsr.manage'::text) AS has_permission) OR (received_by = ( SELECT app.current_staff_id() AS current_staff_id))))
  ```

#### `crm.duplicate_decisions`

ลูกค้าที่อาจซ้ำซึ่งผู้ใช้ยืนยันสร้างใหม่ (ข้อ 6.5 · 6.7 · คอลัมน์ตาม CANONICAL) · สร้างโดย api.quick_capture เมื่อมีผู้สมัครคะแนน ≥ 70 · ตัดสินด้วย api.merge_customers (→ MERGED) หรือ api.decide_duplicate (→ NOT_DUPLICATE) ที่ต้องมี customer.merge 🔐 บนลูกค้าทั้งสองราย · SELECT = data_quality.view บนลูกค้าทั้งสองราย · เขียนผ่าน RPC เท่านั้น · ไม่มีการ merge อัตโนมัติ · ที่มาของ DUPLICATE_SUSPECTED และ DUPLICATE_RATE

**RLS:** เปิด · **policy:** 1 · **index:** 4 · **trigger:** 3

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `customer_id` | `uuid` | NOT NULL | – | `crm.customers(id)` |  | ลูกค้าที่สร้างใหม่ |
| 4 | `candidate_customer_id` | `uuid` | NOT NULL | – | `crm.customers(id)` |  | ลูกค้าเดิมที่คะแนนสูงสุด |
| 5 | `score` | `integer` | NOT NULL | – | – |  | คะแนนของผู้สมัครตามกฎข้อ 6.5 (100 เบอร์/LINE · 90 อีเมล · 70 ชื่อ+นามสกุล+4 หลักท้าย) · ≥ 70 เสมอ |
| 6 | `matched_rules` | `text[]` | NOT NULL | `'{}'::text[]` | – |  | เหตุผลของกฎที่ตรง เช่น {"เบอร์โทรตรงกัน"} · หมายเหตุผู้เขียน: CANONICAL ไม่กำหนดรหัสกฎ จึงเก็บข้อความเหตุผลตามการ์ดผลลัพธ์ [รอยืนยันรหัส] |
| 7 | `override_reason_code` | `text` | NOT NULL | – | `ref.duplicate_override_reasons(code)` |  | เหตุผลที่ยังสร้างใหม่ (ref.duplicate_override_reasons) · OTHER บังคับ override_note (ตรวจใน RPC) |
| 8 | `override_note` | `text` | NULL | – | – | **pii** | หมายเหตุประกอบเหตุผล · anonymize ล้างค่า (ข้อ 10.4) |
| 9 | `status` | `crm.duplicate_status` | NOT NULL | `'PENDING'::crm.duplicate_status` | – |  | PENDING · MERGED · NOT_DUPLICATE |
| 10 | `created_by` | `uuid` | NOT NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | ผู้ที่ยืนยันสร้างลูกค้าใหม่ (บังคับ · ใช้กติกาผู้ตัดสิน ≠ ผู้สร้าง) |
| 11 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 12 | `decided_by` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | ผู้ตัดสิน (aal2) |
| 13 | `decided_at` | `timestamp with time zone` | NULL | – | – |  | – |
| 14 | `decision_note` | `text` | NULL | – | – |  | หมายเหตุการตัดสิน (p_note ของ api.decide_duplicate) |
| 15 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 16 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `duplicate_decisions_pkey` | `PRIMARY KEY (id)` |
| `duplicate_decisions_customer_uq` | `UNIQUE (customer_id)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `duplicate_decisions_decided_chk` | `CHECK ((((status = 'PENDING'::crm.duplicate_status) = (decided_by IS NULL)) AND ((decided_by IS NULL) = (decided_at IS NULL))))` |
| `duplicate_decisions_decider_chk` | `CHECK (((decided_by IS NULL) OR (decided_by <> created_by)))` |
| `duplicate_decisions_pair_chk` | `CHECK ((customer_id <> candidate_customer_id))` |
| `duplicate_decisions_score_chk` | `CHECK ((score >= 70))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `duplicate_decisions_candidate_customer_id_fkey` | `FOREIGN KEY (candidate_customer_id) REFERENCES crm.customers(id)` |
| `duplicate_decisions_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `duplicate_decisions_customer_id_fkey` | `FOREIGN KEY (customer_id) REFERENCES crm.customers(id)` |
| `duplicate_decisions_decided_by_fkey` | `FOREIGN KEY (decided_by) REFERENCES core.staff_profiles(id)` |
| `duplicate_decisions_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `duplicate_decisions_override_reason_code_fkey` | `FOREIGN KEY (override_reason_code) REFERENCES ref.duplicate_override_reasons(code)` |
| `duplicate_decisions_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `duplicate_decisions_candidate_idx` | `CREATE INDEX duplicate_decisions_candidate_idx ON crm.duplicate_decisions USING btree (candidate_customer_id)` |
| `duplicate_decisions_customer_uq` | `CREATE UNIQUE INDEX duplicate_decisions_customer_uq ON crm.duplicate_decisions USING btree (customer_id)` |
| `duplicate_decisions_pending_idx` | `CREATE INDEX duplicate_decisions_pending_idx ON crm.duplicate_decisions USING btree (created_at) WHERE (status = 'PENDING'::crm.duplicate_status)` |
| `duplicate_decisions_pkey` | `CREATE UNIQUE INDEX duplicate_decisions_pkey ON crm.duplicate_decisions USING btree (id)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`duplicate_decisions_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((customer_id IN ( SELECT app.customer_ids_in_scope('data_quality.view'::text) AS customer_ids_in_scope)) AND (candidate_customer_id IN ( SELECT app.customer_ids_in_scope('data_quality.view'::text) AS customer_ids_in_scope)))
  ```

#### `crm.interactions`

ประวัติการติดต่อ (timeline Customer 360 · ข้อ 3.3 · 6.10) · INBOUND บนช่องทางอื่นที่ไม่ใช่ WALK_IN แนบ visit ช่องทางเดียวกันที่ยังไม่ปิดในวันธุรกิจเดียวกัน มิฉะนั้น RPC เปิด visit ใหม่ · OUTBOUND/INTERNAL ไม่สร้าง visit · "ติดต่อ N ครั้ง" = count(direction <> INTERNAL) · interaction OUTBOUND แรกเปลี่ยน lead NEW → CONTACTED (trigger 0009) · แก้ได้ภายใน 24 ชม. หลังสร้าง (ตัดสินด้วย now()) · เปลี่ยน owner/branch ไม่ได้ (ข้อ 9.4.2)

**RLS:** เปิด · **policy:** 3 · **index:** 9 · **trigger:** 8

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `branch_id` · `channel_code` · `customer_id` · `direction` · `interaction_type_code` · `lead_id` · `occurred_at` · `opportunity_id` · `owner_staff_id` · `summary` · `visit_id` |
| `authenticated` | UPDATE | `customer_id` · `interaction_type_code` · `occurred_at` · `summary` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `customer_id` | `uuid` | NULL | – | `crm.customers(id)` |  | ลูกค้า (NULL ได้เมื่อ visit ยังไม่รู้ตัวตน) |
| 4 | `visit_id` | `uuid` | NULL | – | – |  | visit ที่ interaction นี้อยู่ (ถ้ามี) · สาขาต้องตรงกับ visit (FK คู่ visit_id, branch_id) |
| 5 | `is_visit_root` | `boolean` | NOT NULL | `false` | – |  | true = interaction ต้นทางของ visit (1 รายการต่อ visit) · outcome PURCHASED → ประเภท PURCHASE (ข้อ 3.3) · คอลัมน์ระบบ |
| 6 | `lead_id` | `uuid` | NULL | – | `crm.leads(id)` |  | lead ที่เกี่ยวข้อง (ถ้ามี) |
| 7 | `opportunity_id` | `uuid` | NULL | – | `crm.opportunities(id)` |  | opportunity ที่เกี่ยวข้อง (ถ้ามี) · ใช้กับ OPPORTUNITY_STALE (ข้อ 11.1) |
| 8 | `branch_id` | `uuid` | NOT NULL | – | `core.branches(id)` |  | – |
| 9 | `channel_code` | `text` | NOT NULL | – | `ref.channels(code)` |  | ช่องทางของการติดต่อ · last_channel_code ของลูกค้า = ช่องทางของ interaction ล่าสุดที่ไม่ใช่ INTERNAL |
| 10 | `direction` | `crm.interaction_direction` | NOT NULL | – | – |  | INBOUND · OUTBOUND · INTERNAL |
| 11 | `interaction_type_code` | `text` | NOT NULL | – | `ref.interaction_types(code)` |  | ประเภท (ref.interaction_types) · NOTE ใช้กับ INTERNAL เท่านั้น |
| 12 | `occurred_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | เวลาที่เกิดการติดต่อ (activity event ข้อ 3.1) |
| 13 | `owner_staff_id` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | พนักงานผู้ติดต่อ/บันทึก |
| 14 | `summary` | `text` | NULL | – | – | **pii** | สรุปการติดต่อ (ข้อความอิสระ) · ผ่าน app.trg_guard_restricted_text · anonymize ล้างค่า (ข้อ 10.4) |
| 15 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 16 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 17 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 18 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `interactions_pkey` | `PRIMARY KEY (id)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `interactions_note_internal_chk` | `CHECK (((interaction_type_code <> 'NOTE'::text) OR (direction = 'INTERNAL'::crm.interaction_direction)))` |
| `interactions_visit_root_chk` | `CHECK (((NOT is_visit_root) OR ((visit_id IS NOT NULL) AND (direction = 'INBOUND'::crm.interaction_direction))))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `interactions_branch_id_fkey` | `FOREIGN KEY (branch_id) REFERENCES core.branches(id)` |
| `interactions_channel_code_fkey` | `FOREIGN KEY (channel_code) REFERENCES ref.channels(code)` |
| `interactions_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `interactions_customer_id_fkey` | `FOREIGN KEY (customer_id) REFERENCES crm.customers(id)` |
| `interactions_interaction_type_code_fkey` | `FOREIGN KEY (interaction_type_code) REFERENCES ref.interaction_types(code)` |
| `interactions_lead_id_fkey` | `FOREIGN KEY (lead_id) REFERENCES crm.leads(id)` |
| `interactions_opportunity_id_fkey` | `FOREIGN KEY (opportunity_id) REFERENCES crm.opportunities(id)` |
| `interactions_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `interactions_owner_staff_id_fkey` | `FOREIGN KEY (owner_staff_id) REFERENCES core.staff_profiles(id)` |
| `interactions_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |
| `interactions_visit_branch_fkey` | `FOREIGN KEY (visit_id, branch_id) REFERENCES crm.visits(id, branch_id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `interactions_branch_id_idx` | `CREATE INDEX interactions_branch_id_idx ON crm.interactions USING btree (branch_id)` |
| `interactions_customer_id_idx` | `CREATE INDEX interactions_customer_id_idx ON crm.interactions USING btree (customer_id, occurred_at DESC)` |
| `interactions_lead_id_idx` | `CREATE INDEX interactions_lead_id_idx ON crm.interactions USING btree (lead_id) WHERE (lead_id IS NOT NULL)` |
| `interactions_occurred_at_idx` | `CREATE INDEX interactions_occurred_at_idx ON crm.interactions USING btree (occurred_at)` |
| `interactions_opportunity_id_idx` | `CREATE INDEX interactions_opportunity_id_idx ON crm.interactions USING btree (opportunity_id) WHERE (opportunity_id IS NOT NULL)` |
| `interactions_owner_staff_id_idx` | `CREATE INDEX interactions_owner_staff_id_idx ON crm.interactions USING btree (owner_staff_id)` |
| `interactions_pkey` | `CREATE UNIQUE INDEX interactions_pkey ON crm.interactions USING btree (id)` |
| `interactions_visit_id_idx` | `CREATE INDEX interactions_visit_id_idx ON crm.interactions USING btree (visit_id) WHERE (visit_id IS NOT NULL)` |
| `interactions_visit_root_uidx` | `CREATE UNIQUE INDEX interactions_visit_root_uidx ON crm.interactions USING btree (visit_id) WHERE is_visit_root` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_10_enforce_transition` | BEFORE | INSERT · UPDATE | ROW | `app.enforce_row_transition()` | – |
| `trg_20_guard_text` | BEFORE | INSERT · UPDATE | ROW | `app.trg_guard_restricted_text('summary')` | – |
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_link_customer_branch` | AFTER | INSERT · UPDATE OF customer_id, branch_id | ROW | `app.trg_link_customer_branch()` | – |
| `trg_mark_lead_contacted` | AFTER | INSERT · UPDATE OF direction, lead_id, customer_id | ROW | `app.trg_mark_lead_contacted()` | – |
| `trg_touch_customer_activity` | AFTER | INSERT · DELETE · UPDATE | ROW | `app.trg_touch_customer_activity()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`interactions_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ((((customer_id IS NULL) AND ((branch_id = ANY (( SELECT app.scope_branch_ids('interaction.create'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, owner_staff_id) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('interaction.create'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('interaction.create'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(owner_staff_id, created_by) = ( SELECT app.current_staff_id() AS current_staff_id))))) OR ((customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids)) AND ((branch_id = ANY (( SELECT app.scope_branch_ids('interaction.create'::text, 'ORGANIZATION'::core.data_scope) AS scope_branch_ids)::uuid[])) OR (((EXISTS ( SELECT 1
     FROM crm.customer_branches cb
    WHERE ((cb.customer_id = interactions.customer_id) AND (cb.branch_id = interactions.branch_id)))) OR (EXISTS ( SELECT 1
     FROM crm.customers c
    WHERE ((c.id = interactions.customer_id) AND (c.first_branch_id = interactions.branch_id))))) AND ((branch_id = ANY (( SELECT app.scope_branch_ids('interaction.create'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, ( SELECT c.owner_staff_id
     FROM crm.customers c
    WHERE (c.id = interactions.customer_id))) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('interaction.create'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('interaction.create'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (( SELECT c.owner_staff_id
     FROM crm.customers c
    WHERE (c.id = interactions.customer_id)) = ( SELECT app.current_staff_id() AS current_staff_id)))))))) AND ((direction <> 'INBOUND'::crm.interaction_direction) OR (visit_id IN ( SELECT v.id
     FROM crm.visits v
    WHERE ((v.branch_id = interactions.branch_id) AND (v.status = ANY (ARRAY['WAITING'::crm.visit_status, 'IN_SERVICE'::crm.visit_status])))))) AND ((visit_id IS NULL) OR (visit_id IN ( SELECT v.id
     FROM crm.visits v
    WHERE ((v.branch_id = interactions.branch_id) AND (NOT (v.customer_id IS DISTINCT FROM interactions.customer_id)))))) AND ((lead_id IS NULL) OR (lead_id IN ( SELECT l.id
     FROM crm.leads l
    WHERE (l.customer_id = interactions.customer_id)))) AND ((opportunity_id IS NULL) OR (opportunity_id IN ( SELECT o.id
     FROM crm.opportunities o
    WHERE (o.customer_id = interactions.customer_id)))))
  ```

- **`interactions_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((branch_id = ANY (( SELECT app.scope_branch_ids('interaction.read'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, owner_staff_id) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('interaction.read'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('interaction.read'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(owner_staff_id, created_by) = ( SELECT app.current_staff_id() AS current_staff_id))) OR (customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids)))
  ```

- **`interactions_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((branch_id = ANY (( SELECT app.scope_branch_ids('interaction.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, owner_staff_id) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('interaction.update'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('interaction.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(owner_staff_id, created_by) = ( SELECT app.current_staff_id() AS current_staff_id))))
  ```

  WITH CHECK

  ```sql
  (((branch_id = ANY (( SELECT app.scope_branch_ids('interaction.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, owner_staff_id) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('interaction.update'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('interaction.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(owner_staff_id, created_by) = ( SELECT app.current_staff_id() AS current_staff_id)))) AND ((customer_id IS NULL) OR (customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids))))
  ```

#### `crm.lead_status_history`

ประวัติการเปลี่ยนสถานะ lead (ข้อ 4.5) · from · to · changed_by · changed_at · reason · เขียนโดย trigger เท่านั้น (ไม่มี GRANT เขียน) · SELECT = lead แม่อ่านได้ · ไม่ถูกบันทึกใน audit (ข้อ 9.5) · แถวแรก from_status = NULL (ตอนสร้าง)

**RLS:** เปิด · **policy:** 1 · **index:** 2 · **trigger:** 0

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | – | `core.organizations(id)` |  | – |
| 3 | `lead_id` | `uuid` | NOT NULL | – | `crm.leads(id)` |  | – |
| 4 | `from_status` | `crm.lead_status` | NULL | – | – |  | สถานะเดิม · NULL = สร้าง lead |
| 5 | `to_status` | `crm.lead_status` | NOT NULL | – | – |  | สถานะใหม่ |
| 6 | `changed_by` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | staff ผู้เปลี่ยน (app.current_staff_id()) · NULL = ระบบ/trigger อัตโนมัติ |
| 7 | `changed_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | เวลาที่เปลี่ยน (ตอนสร้าง = leads.created_at · ปิด = closed_at · NEW → CONTACTED/QUALIFIED = first_contacted_at · อื่น ๆ = now()) |
| 8 | `reason` | `text` | NULL | – | – |  | เหตุผล: ค่าจาก setting app.status_reason ของทรานแซกชัน หรือ lost_reason_code เมื่อปิด LOST |
| 9 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `lead_status_history_pkey` | `PRIMARY KEY (id)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `lead_status_history_change_chk` | `CHECK ((from_status IS DISTINCT FROM to_status))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `lead_status_history_changed_by_fkey` | `FOREIGN KEY (changed_by) REFERENCES core.staff_profiles(id)` |
| `lead_status_history_lead_id_fkey` | `FOREIGN KEY (lead_id) REFERENCES crm.leads(id)` |
| `lead_status_history_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `lead_status_history_lead_idx` | `CREATE INDEX lead_status_history_lead_idx ON crm.lead_status_history USING btree (lead_id, changed_at)` |
| `lead_status_history_pkey` | `CREATE UNIQUE INDEX lead_status_history_pkey ON crm.lead_status_history USING btree (id)` |

**Policy:**

- **`lead_status_history_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (lead_id IN ( SELECT l.id
     FROM crm.leads l))
  ```

#### `crm.leads`

Lead = การแสดงความสนใจหนึ่งครั้งของลูกค้าที่รู้ตัวตน นับตาม created_at (ข้อ 3.1 · 4.3) · lead ช่องทางสด (ref.channels.is_live: WALK_IN PHONE) เริ่ม CONTACTED และ first_contacted_at = created_at · ช่องทางข้อความเริ่ม NEW แล้วเปลี่ยนเป็น CONTACTED อัตโนมัติเมื่อมี interaction OUTBOUND แรก (trigger 0009) · QUALIFIED → CONTACTED ย้อนได้ · สถานะเปิดใดก็ได้ → CONVERTED (ผ่าน api.convert_lead เท่านั้น) หรือ LOST · ออกจาก CONVERTED/LOST ต้องมี lead.reopen → CONTACTED · ทุกการเปลี่ยนสถานะบันทึก crm.lead_status_history · lead ที่เปิดอยู่มี task is_next_action = true หนึ่งใบ (trigger 0009)

**RLS:** เปิด · **policy:** 3 · **index:** 11 · **trigger:** 14

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `branch_id` · `campaign_id` · `channel_code` · `customer_id` · `interest_code` · `interest_level` · `next_action` · `next_action_at` · `next_action_type_code` · `owner_staff_id` · `priority_code` · `product_model` · `product_type_code` · `source_code` · `visit_id` |
| `authenticated` | UPDATE | `campaign_id` · `closed_at` · `interest_code` · `interest_level` · `lost_note` · `lost_reason_code` · `next_action` · `next_action_at` · `next_action_type_code` · `priority_code` · `product_model` · `product_type_code` · `source_code` · `status` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `lead_no` | `text` | NOT NULL | – | – |  | เลข lead LD-{YYYY}-{NNNNNN} ตัวนับ LD:{YYYY} (ข้อ 6.1) |
| 4 | `customer_id` | `uuid` | NOT NULL | – | `crm.customers(id)` |  | ลูกค้า (บังคับ · lead มีได้เฉพาะลูกค้าที่รู้ตัวตน) |
| 5 | `branch_id` | `uuid` | NOT NULL | – | `core.branches(id)` |  | สาขาปัจจุบันของ lead (มิติสาขาของ LEADS ข้อ 12.4) · ย้ายสาขาต้อง lead.assign ทั้งสองฝั่ง + ownership_changes BRANCH_TRANSFER |
| 6 | `owner_staff_id` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | ผู้รับผิดชอบ · ว่างได้ขณะเปิด (→ LEAD_UNASSIGNED · LEAD_WITHOUT_OWNER) |
| 7 | `team_id` | `uuid` | NULL | – | `core.teams(id)` |  | ทีม ณ ตอนมอบงาน (snapshot A28) ใช้แสดง/รายงาน · scope TEAM ประเมินจากสมาชิกภาพปัจจุบันของ owner |
| 8 | `channel_code` | `text` | NOT NULL | – | `ref.channels(code)` |  | ช่องทางที่เกิด lead (บังคับ) · มิติช่องทางของ LEADS · ใช้กติกา is_live ของข้อ 4.3 และฐาน LEAD_RESPONSE_MIN |
| 9 | `source_code` | `text` | NULL | – | `ref.sources(code)` |  | แหล่งที่รู้จักร้าน (ref.sources) |
| 10 | `campaign_id` | `uuid` | NULL | – | `crm.campaigns(id)` |  | แคมเปญแรกที่พามา (first-touch · nullable ข้อ 5.10) |
| 11 | `visit_id` | `uuid` | NULL | – | `crm.visits(id)` |  | visit ที่สร้าง lead นี้ (ถ้ามี) · outcome NOT_INTERESTED ต้องปิด lead ที่เปิดจาก visit นี้เป็น LOST (ข้อ 4.2) |
| 12 | `interest_code` | `text` | NOT NULL | – | `ref.interest_types(code)` |  | ความสนใจ (บังคับ · ref.interest_types) |
| 13 | `product_type_code` | `text` | NULL | – | `ref.product_types(code)` |  | ประเภทสินค้าที่สนใจ (ไม่บังคับ) |
| 14 | `product_model` | `text` | NULL | – | – |  | รุ่นเป็นข้อความ เช่น "iPad Air" (ข้อ 5.4) · "สินค้าที่สนใจ" บน Customer 360 |
| 15 | `interest_level` | `crm.interest_level` | NULL | – | – |  | HOT · WARM · COLD (ใช้เรียงสินค้าที่สนใจ) |
| 16 | `status` | `crm.lead_status` | NOT NULL | `'NEW'::crm.lead_status` | – |  | NEW · CONTACTED · QUALIFIED · CONVERTED · LOST (ข้อ 4.3) |
| 17 | `priority_code` | `text` | NULL | – | `ref.priorities(code)` |  | ความสำคัญ (บังคับเมื่อเปิด · ค่าเริ่มต้นจาก Quick Capture = NORMAL) |
| 18 | `next_action` | `text` | NULL | – | – | **pii** | งานถัดไป (ข้อความ · บังคับเมื่อเปิด · ค่าเริ่มต้น Quick Capture "ติดต่อกลับลูกค้า") · เป็นชื่องานของ task next action · ผ่าน app.trg_guard_restricted_text · anonymize แทนด้วยข้อความคงที่ |
| 19 | `next_action_type_code` | `text` | NULL | – | `ref.task_types(code)` |  | ประเภทงานถัดไป (ref.task_types · ค่าเริ่มต้น CALL) |
| 20 | `next_action_at` | `timestamp with time zone` | NULL | – | – |  | กำหนดเวลางานถัดไป (= tasks.due_at ของ task next action · ค่าเริ่มต้น created_at + 30 นาที [รอยืนยัน]) |
| 21 | `first_contacted_at` | `timestamp with time zone` | NULL | – | – |  | เวลาตอบกลับครั้งแรก (ข้อ 4.3) · ฐานของ LEAD_RESPONSE_MIN (ข้อ 12.2) |
| 22 | `closed_at` | `timestamp with time zone` | NULL | – | – |  | เวลาปิด (CONVERTED/LOST) · LOST_LEADS นับตามคอลัมน์นี้ |
| 23 | `lost_reason_code` | `text` | NULL | – | `ref.lost_reasons(code)` |  | เหตุผลที่ไม่สำเร็จ (บังคับเมื่อ LOST · ref.lost_reasons) |
| 24 | `lost_note` | `text` | NULL | – | – | **pii** | หมายเหตุเหตุผล (บังคับเมื่อ lost_reason_code = OTHER) · ผ่าน app.trg_guard_restricted_text |
| 25 | `converted_opportunity_id` | `uuid` | NULL | – | `crm.opportunities(id)` |  | opportunity ที่ lead นี้แปลงไป (บังคับเมื่อ CONVERTED · ตั้งผ่าน api.convert_lead เท่านั้น) |
| 26 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 27 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 28 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 29 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `leads_pkey` | `PRIMARY KEY (id)` |
| `leads_lead_no_key` | `UNIQUE (lead_no)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `leads_first_contacted_chk` | `CHECK ((((status <> 'NEW'::crm.lead_status) OR (first_contacted_at IS NULL)) AND ((first_contacted_at IS NULL) OR (first_contacted_at >= created_at))))` |
| `leads_lead_no_chk` | `CHECK ((lead_no ~ '^LD-[0-9]{4}-[0-9]{6,}$'::text))` |
| `leads_lost_note_chk` | `CHECK (((lost_reason_code IS DISTINCT FROM 'OTHER'::text) OR ((lost_note IS NOT NULL) AND (btrim(lost_note) <> ''::text))))` |
| `leads_next_action_text_chk` | `CHECK (((next_action IS NULL) OR (btrim(next_action) <> ''::text)))` |
| `leads_status_chk` | `CHECK ( CASE status     WHEN 'CONVERTED'::crm.lead_status THEN ((converted_opportunity_id IS NOT NULL) AND (closed_at IS NOT NULL) AND (lost_reason_code IS NULL))     WHEN 'LOST'::crm.lead_status THEN ((lost_reason_code IS NOT NULL) AND (closed_at IS NOT NULL) AND (converted_opportunity_id IS NULL))     ELSE ((next_action IS NOT NULL) AND (next_action_type_code IS NOT NULL) AND (next_action_at IS NOT NULL) AND (priority_code IS NOT NULL) AND (closed_at IS NULL) AND (lost_reason_code IS NULL) AND (converted_opportunity_id IS NULL)) END)` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `leads_branch_id_fkey` | `FOREIGN KEY (branch_id) REFERENCES core.branches(id)` |
| `leads_campaign_id_fkey` | `FOREIGN KEY (campaign_id) REFERENCES crm.campaigns(id)` |
| `leads_channel_code_fkey` | `FOREIGN KEY (channel_code) REFERENCES ref.channels(code)` |
| `leads_converted_opportunity_id_fkey` | `FOREIGN KEY (converted_opportunity_id) REFERENCES crm.opportunities(id)` |
| `leads_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `leads_customer_id_fkey` | `FOREIGN KEY (customer_id) REFERENCES crm.customers(id)` |
| `leads_interest_code_fkey` | `FOREIGN KEY (interest_code) REFERENCES ref.interest_types(code)` |
| `leads_lost_reason_code_fkey` | `FOREIGN KEY (lost_reason_code) REFERENCES ref.lost_reasons(code)` |
| `leads_next_action_type_code_fkey` | `FOREIGN KEY (next_action_type_code) REFERENCES ref.task_types(code)` |
| `leads_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `leads_owner_staff_id_fkey` | `FOREIGN KEY (owner_staff_id) REFERENCES core.staff_profiles(id)` |
| `leads_priority_code_fkey` | `FOREIGN KEY (priority_code) REFERENCES ref.priorities(code)` |
| `leads_product_type_code_fkey` | `FOREIGN KEY (product_type_code) REFERENCES ref.product_types(code)` |
| `leads_source_code_fkey` | `FOREIGN KEY (source_code) REFERENCES ref.sources(code)` |
| `leads_team_id_fkey` | `FOREIGN KEY (team_id) REFERENCES core.teams(id)` |
| `leads_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |
| `leads_visit_id_fkey` | `FOREIGN KEY (visit_id) REFERENCES crm.visits(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `leads_branch_id_idx` | `CREATE INDEX leads_branch_id_idx ON crm.leads USING btree (branch_id)` |
| `leads_campaign_id_idx` | `CREATE INDEX leads_campaign_id_idx ON crm.leads USING btree (campaign_id) WHERE (campaign_id IS NOT NULL)` |
| `leads_closed_at_idx` | `CREATE INDEX leads_closed_at_idx ON crm.leads USING btree (closed_at) WHERE (closed_at IS NOT NULL)` |
| `leads_converted_opportunity_id_idx` | `CREATE INDEX leads_converted_opportunity_id_idx ON crm.leads USING btree (converted_opportunity_id) WHERE (converted_opportunity_id IS NOT NULL)` |
| `leads_created_at_idx` | `CREATE INDEX leads_created_at_idx ON crm.leads USING btree (created_at)` |
| `leads_customer_id_idx` | `CREATE INDEX leads_customer_id_idx ON crm.leads USING btree (customer_id)` |
| `leads_lead_no_key` | `CREATE UNIQUE INDEX leads_lead_no_key ON crm.leads USING btree (lead_no)` |
| `leads_open_idx` | `CREATE INDEX leads_open_idx ON crm.leads USING btree (branch_id, status) WHERE (status = ANY (ARRAY['NEW'::crm.lead_status, 'CONTACTED'::crm.lead_status, 'QUALIFIED'::crm.lead_status]))` |
| `leads_owner_staff_id_idx` | `CREATE INDEX leads_owner_staff_id_idx ON crm.leads USING btree (owner_staff_id)` |
| `leads_pkey` | `CREATE UNIQUE INDEX leads_pkey ON crm.leads USING btree (id)` |
| `leads_visit_id_idx` | `CREATE INDEX leads_visit_id_idx ON crm.leads USING btree (visit_id) WHERE (visit_id IS NOT NULL)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_05_running_number` | BEFORE | INSERT | ROW | `app.trg_assign_running_number()` | – |
| `trg_10_enforce_transition` | BEFORE | INSERT · UPDATE | ROW | `app.enforce_row_transition()` | – |
| `trg_20_guard_text` | BEFORE | INSERT · UPDATE | ROW | `app.trg_guard_restricted_text('next_action', 'lost_note')` | – |
| `trg_30_row_defaults` | BEFORE | INSERT · UPDATE | ROW | `app.trg_row_defaults()` | – |
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_link_customer_branch` | AFTER | INSERT · UPDATE OF customer_id, branch_id | ROW | `app.trg_link_customer_branch()` | – |
| `trg_refresh_lifecycle_del` | AFTER | DELETE | ROW | `app.trg_refresh_lifecycle()` | – |
| `trg_refresh_lifecycle_ins` | AFTER | INSERT | ROW | `app.trg_refresh_lifecycle()` | – |
| `trg_refresh_lifecycle_upd` | AFTER | UPDATE OF status, customer_id | ROW | `app.trg_refresh_lifecycle()` | – |
| `trg_sync_next_action_task` | AFTER | INSERT · UPDATE | ROW | `app.trg_sync_next_action_task()` | – |
| `trg_touch_customer_activity` | AFTER | INSERT · DELETE · UPDATE | ROW | `app.trg_touch_customer_activity()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |
| `trg_write_status_history` | AFTER | INSERT · UPDATE OF status | ROW | `app.trg_write_status_history()` | – |

**Policy:**

- **`leads_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ((customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids)) AND ((branch_id = ANY (( SELECT app.scope_branch_ids('lead.create'::text, 'ORGANIZATION'::core.data_scope) AS scope_branch_ids)::uuid[])) OR (((EXISTS ( SELECT 1
     FROM crm.customer_branches cb
    WHERE ((cb.customer_id = leads.customer_id) AND (cb.branch_id = leads.branch_id)))) OR (EXISTS ( SELECT 1
     FROM crm.customers c
    WHERE ((c.id = leads.customer_id) AND (c.first_branch_id = leads.branch_id))))) AND ((branch_id = ANY (( SELECT app.scope_branch_ids('lead.create'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, ( SELECT c.owner_staff_id
     FROM crm.customers c
    WHERE (c.id = leads.customer_id))) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('lead.create'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('lead.create'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (( SELECT c.owner_staff_id
     FROM crm.customers c
    WHERE (c.id = leads.customer_id)) = ( SELECT app.current_staff_id() AS current_staff_id)))))) AND ((visit_id IS NULL) OR (visit_id IN ( SELECT v.id
     FROM crm.visits v
    WHERE ((v.branch_id = leads.branch_id) AND (v.customer_id = leads.customer_id))))))
  ```

- **`leads_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((branch_id = ANY (( SELECT app.scope_branch_ids('lead.read'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, owner_staff_id) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('lead.read'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('lead.read'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(owner_staff_id, created_by) = ( SELECT app.current_staff_id() AS current_staff_id))) OR (customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids)))
  ```

- **`leads_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((branch_id = ANY (( SELECT app.scope_branch_ids('lead.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, owner_staff_id) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('lead.update'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('lead.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(owner_staff_id, created_by) = ( SELECT app.current_staff_id() AS current_staff_id))))
  ```

  WITH CHECK

  ```sql
  (((branch_id = ANY (( SELECT app.scope_branch_ids('lead.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, owner_staff_id) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('lead.update'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('lead.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(owner_staff_id, created_by) = ( SELECT app.current_staff_id() AS current_staff_id)))) AND (customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids)))
  ```

#### `crm.notifications`

การแจ้งเตือนในแอป (ข้อ 11.1) · สร้างโดย trigger (เหตุการณ์ทันที) และ app.job_notifications(p_as_of) ทุก 5 นาที · SELECT = recipient_staff_id = ตน · UPDATE เฉพาะ read_at ของตน (column grant) · ข้อความเต็ม (มีชื่อลูกค้า) อยู่ในตารางนี้เท่านั้น · push/email ใช้ title + entity_ref + deep link · ไม่ถูกบันทึกใน audit (ข้อ 9.5) · seed_mode ข้ามการสร้าง (ข้อ 13.0)

**RLS:** เปิด · **policy:** 2 · **index:** 5 · **trigger:** 2

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | UPDATE | `read_at` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `recipient_staff_id` | `uuid` | NOT NULL | – | `core.staff_profiles(id)` |  | ผู้รับ |
| 4 | `code` | `text` | NOT NULL | – | – |  | รหัสการแจ้งเตือน (ข้อ 11.1) เช่น FOLLOWUP_OVERDUE · LEAD_UNASSIGNED |
| 5 | `entity_type` | `text` | NULL | – | – |  | ชนิดรายการที่อ้าง (เช่น TASK · LEAD · OPPORTUNITY · VISIT · EXPORT · ROLE_GRANT) · NULL = สรุปรวม (เช่น DUPLICATE_SUSPECTED 18:00) |
| 6 | `entity_id` | `uuid` | NULL | – | – |  | id ของรายการที่อ้าง |
| 7 | `entity_ref` | `text` | NULL | – | – |  | เลขอ้างอิงที่แสดง/ใช้ใน push เช่น TK-2026-012508 · EX-2026-000031 · RG-2026-0003 |
| 8 | `title` | `text` | NOT NULL | – | – | **pii** | หัวข้อ = ป้ายไทยของรหัสตามข้อ 11.1 (เช่น "ติดตามเกินกำหนด") · anonymize ล้าง/แทนค่า (ข้อ 10.4) |
| 9 | `body` | `text` | NULL | – | – | **pii** | ข้อความมาตรฐาน "{ชื่อลูกค้า} · {ชื่องาน/รายการ} · {เวลาครบกำหนด}" เช่น "คุณพิมพ์ชนก ศรีสุข · ติดตามใบเสนอราคา iPhone 17 Pro Max · ครบกำหนด 10 ก.ย. 2569 15:00" · anonymize ล้างค่า |
| 10 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 11 | `read_at` | `timestamp with time zone` | NULL | – | – |  | เวลาที่อ่าน · NULL = ยังไม่อ่าน (จำนวนบนกระดิ่ง) |
| 12 | `dedupe_key` | `text` | NOT NULL | – | – |  | {code}:{entity_id}:{escalation_level}:{YYYY-MM-DD Asia/Bangkok} · UNIQUE ต่อผู้รับ ใช้ INSERT … ON CONFLICT DO NOTHING · หมายเหตุผู้เขียน: สรุปที่ไม่มี entity ใช้ส่วน entity_id ว่าง |
| 13 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 14 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 15 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `notifications_pkey` | `PRIMARY KEY (id)` |
| `notifications_recipient_dedupe_uq` | `UNIQUE (recipient_staff_id, dedupe_key)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `notifications_code_chk` | `CHECK ((code = ANY (ARRAY['FOLLOWUP_DUE'::text, 'FOLLOWUP_OVERDUE'::text, 'TASK_OVERDUE'::text, 'LEAD_UNASSIGNED'::text, 'LEAD_NOT_CONTACTED'::text, 'LEAD_ASSIGNED'::text, 'OPPORTUNITY_ASSIGNED'::text, 'TASK_ASSIGNED'::text, 'OPPORTUNITY_STALE'::text, 'DUPLICATE_SUSPECTED'::text, 'VISITOR_WAITING_LONG'::text, 'VISIT_OUTCOME_MISSING'::text, 'DATA_MISSING'::text, 'EXPORT_APPROVAL_REQUIRED'::text, 'EXPORT_DECIDED'::text, 'ROLE_GRANT_APPROVAL_REQUIRED'::text, 'REVEAL_LIMIT_EXCEEDED'::text, 'SEARCH_LIMIT_EXCEEDED'::text, 'RETENTION_ANONYMIZE_UPCOMING'::text, 'LOCKOUT_REPEATED'::text, 'LINK_LIMIT_EXCEEDED'::text, 'CUSTOMER_VIEW_LIMIT_EXCEEDED'::text, 'EXPORT_READY'::text, 'ROLE_GRANT_DECIDED'::text, 'DSR_DUE_SOON'::text])))` |
| `notifications_dedupe_key_chk` | `CHECK (("left"(dedupe_key, (length(code) + 1)) = (code \|\| ':'::text)))` |
| `notifications_read_chk` | `CHECK (((read_at IS NULL) OR (read_at >= created_at)))` |
| `notifications_title_chk` | `CHECK ((btrim(title) <> ''::text))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `notifications_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `notifications_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `notifications_recipient_staff_id_fkey` | `FOREIGN KEY (recipient_staff_id) REFERENCES core.staff_profiles(id)` |
| `notifications_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `notifications_entity_idx` | `CREATE INDEX notifications_entity_idx ON crm.notifications USING btree (entity_id) WHERE (entity_id IS NOT NULL)` |
| `notifications_pkey` | `CREATE UNIQUE INDEX notifications_pkey ON crm.notifications USING btree (id)` |
| `notifications_recipient_dedupe_uq` | `CREATE UNIQUE INDEX notifications_recipient_dedupe_uq ON crm.notifications USING btree (recipient_staff_id, dedupe_key)` |
| `notifications_recipient_idx` | `CREATE INDEX notifications_recipient_idx ON crm.notifications USING btree (recipient_staff_id, created_at DESC)` |
| `notifications_unread_idx` | `CREATE INDEX notifications_unread_idx ON crm.notifications USING btree (recipient_staff_id, created_at DESC) WHERE (read_at IS NULL)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`notifications_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (recipient_staff_id = ( SELECT app.current_staff_id() AS current_staff_id))
  ```

- **`notifications_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (recipient_staff_id = ( SELECT app.current_staff_id() AS current_staff_id))
  ```

  WITH CHECK

  ```sql
  (recipient_staff_id = ( SELECT app.current_staff_id() AS current_staff_id))
  ```

#### `crm.opportunities`

Opportunity = โอกาสซื้อจริง นับตาม created_at · Sale = stage WON นับตาม won_at (ข้อ 3.1 · 4.4) · INTERESTED → QUOTATION อัตโนมัติเมื่อ quotation เปลี่ยนเป็น SENT · QUOTATION → FOLLOW_UP ด้วยมือ · FOLLOW_UP → QUOTATION เมื่อมีใบใหม่ SENT (trigger 0009) · สถานะเปิดใดก็ได้ → WON/LOST (opportunity.close) · ออกจาก WON/LOST ต้องมี opportunity.reopen → FOLLOW_UP และล้าง won_at won_amount closed_at lost_reason_code · ทุกการเปลี่ยนขั้นบันทึก crm.opportunity_stage_history · opportunity ที่เปิดอยู่มี task is_next_action = true หนึ่งใบ (trigger 0009)

**RLS:** เปิด · **policy:** 3 · **index:** 11 · **trigger:** 13

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `branch_id` · `customer_id` · `interest_code` · `next_action` · `next_action_at` · `next_action_type_code` · `origin_channel_code` · `origin_visit_id` · `owner_staff_id` · `priority_code` |
| `authenticated` | UPDATE | `closed_at` · `interest_code` · `lost_note` · `lost_reason_code` · `next_action` · `next_action_at` · `next_action_type_code` · `priority_code` · `stage` · `won_amount` · `won_at` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `opportunity_no` | `text` | NOT NULL | – | – |  | เลข OP-{YYYY}-{NNNNNN} ตัวนับ OP:{YYYY} (ข้อ 6.1) |
| 4 | `customer_id` | `uuid` | NOT NULL | – | `crm.customers(id)` |  | ลูกค้า (บังคับ) |
| 5 | `lead_id` | `uuid` | NULL | – | `crm.leads(id)` |  | lead ต้นทาง (ถ้ามี · สร้างตรงได้โดยไม่มี lead) |
| 6 | `origin_channel_code` | `text` | NOT NULL | – | `ref.channels(code)` |  | ช่องทางต้นทาง (บังคับ · ตั้งครั้งเดียวไม่เปลี่ยน) = channel_code ของ lead ต้นทาง หรือช่องทางของ visit/interaction ที่สร้าง opportunity ตรง · มิติช่องทางและ WALKIN_CONVERSION (ข้อ 12.2 · 12.4) |
| 7 | `origin_visit_id` | `uuid` | NULL | – | `crm.visits(id)` |  | visit ที่สร้าง opportunity (ถ้ามี) |
| 8 | `branch_id` | `uuid` | NOT NULL | – | `core.branches(id)` |  | สาขาปัจจุบัน (มิติสาขา ข้อ 12.4) · ย้ายสาขาต้อง opportunity.assign ทั้งสองฝั่ง |
| 9 | `owner_staff_id` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | ผู้รับผิดชอบ (บังคับเมื่อเปิด) · disable_staff โอนให้ผู้จัดการสาขา (STAFF_LEFT) |
| 10 | `team_id` | `uuid` | NULL | – | `core.teams(id)` |  | ทีม ณ ตอนมอบงาน (snapshot) |
| 11 | `interest_code` | `text` | NULL | – | `ref.interest_types(code)` |  | ความสนใจ (ref.interest_types · ไม่บังคับ) |
| 12 | `stage` | `crm.opportunity_stage` | NOT NULL | `'INTERESTED'::crm.opportunity_stage` | – |  | INTERESTED · QUOTATION · FOLLOW_UP · WON · LOST (ข้อ 4.4) |
| 13 | `priority_code` | `text` | NULL | – | `ref.priorities(code)` |  | ความสำคัญ (บังคับเมื่อเปิด) · ขอบซ้ายการ์ด Pipeline |
| 14 | `expected_amount` | `numeric(12,2)` | NOT NULL | `0` | – |  | มูลค่าคาดการณ์ = Σ(quantity × unit_price) ของ opportunity_items (trigger 0009 · คอลัมน์ระบบ) · OPEN_PIPELINE_AMOUNT |
| 15 | `next_action` | `text` | NULL | – | – | **pii** | งานถัดไป (บังคับเมื่อเปิด) · ชื่องานของ task next action · ผ่าน app.trg_guard_restricted_text · anonymize แทนด้วยข้อความคงที่ |
| 16 | `next_action_type_code` | `text` | NULL | – | `ref.task_types(code)` |  | ประเภทงานถัดไป (ref.task_types) |
| 17 | `next_action_at` | `timestamp with time zone` | NULL | – | – |  | กำหนดเวลางานถัดไป · วันที่บนการ์ด Pipeline (ข้อ 13.9) |
| 18 | `won_amount` | `numeric(12,2)` | NULL | – | – |  | ยอดปิดการขาย (บาท) > 0 เมื่อ WON · SALES_AMOUNT (ข้อ 12.1) |
| 19 | `won_at` | `timestamp with time zone` | NULL | – | – |  | เวลาปิดการขาย (WON) · closed_at = won_at |
| 20 | `closed_at` | `timestamp with time zone` | NULL | – | – |  | เวลาปิด (WON/LOST) · LOST_OPPORTUNITIES นับตามคอลัมน์นี้ · activity event (ข้อ 3.1) |
| 21 | `lost_reason_code` | `text` | NULL | – | `ref.lost_reasons(code)` |  | เหตุผลที่ไม่สำเร็จ (บังคับเมื่อ LOST) |
| 22 | `lost_note` | `text` | NULL | – | – | **pii** | หมายเหตุเหตุผล (บังคับเมื่อ OTHER) · ผ่าน app.trg_guard_restricted_text |
| 23 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 24 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 25 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 26 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `opportunities_pkey` | `PRIMARY KEY (id)` |
| `opportunities_opportunity_no_key` | `UNIQUE (opportunity_no)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `opportunities_expected_amount_chk` | `CHECK ((expected_amount >= (0)::numeric))` |
| `opportunities_lost_note_chk` | `CHECK (((lost_reason_code IS DISTINCT FROM 'OTHER'::text) OR ((lost_note IS NOT NULL) AND (btrim(lost_note) <> ''::text))))` |
| `opportunities_next_action_text_chk` | `CHECK (((next_action IS NULL) OR (btrim(next_action) <> ''::text)))` |
| `opportunities_opportunity_no_chk` | `CHECK ((opportunity_no ~ '^OP-[0-9]{4}-[0-9]{6,}$'::text))` |
| `opportunities_stage_chk` | `CHECK ( CASE stage     WHEN 'WON'::crm.opportunity_stage THEN ((won_amount > (0)::numeric) AND (won_at IS NOT NULL) AND (closed_at = won_at) AND (lost_reason_code IS NULL))     WHEN 'LOST'::crm.opportunity_stage THEN ((lost_reason_code IS NOT NULL) AND (closed_at IS NOT NULL) AND (won_at IS NULL) AND (won_amount IS NULL))     ELSE ((owner_staff_id IS NOT NULL) AND (next_action IS NOT NULL) AND (next_action_at IS NOT NULL) AND (next_action_type_code IS NOT NULL) AND (priority_code IS NOT NULL) AND (won_at IS NULL) AND (won_amount IS NULL) AND (closed_at IS NULL) AND (lost_reason_code IS NULL)) END)` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `opportunities_branch_id_fkey` | `FOREIGN KEY (branch_id) REFERENCES core.branches(id)` |
| `opportunities_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `opportunities_customer_id_fkey` | `FOREIGN KEY (customer_id) REFERENCES crm.customers(id)` |
| `opportunities_interest_code_fkey` | `FOREIGN KEY (interest_code) REFERENCES ref.interest_types(code)` |
| `opportunities_lead_id_fkey` | `FOREIGN KEY (lead_id) REFERENCES crm.leads(id)` |
| `opportunities_lost_reason_code_fkey` | `FOREIGN KEY (lost_reason_code) REFERENCES ref.lost_reasons(code)` |
| `opportunities_next_action_type_code_fkey` | `FOREIGN KEY (next_action_type_code) REFERENCES ref.task_types(code)` |
| `opportunities_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `opportunities_origin_channel_code_fkey` | `FOREIGN KEY (origin_channel_code) REFERENCES ref.channels(code)` |
| `opportunities_origin_visit_id_fkey` | `FOREIGN KEY (origin_visit_id) REFERENCES crm.visits(id)` |
| `opportunities_owner_staff_id_fkey` | `FOREIGN KEY (owner_staff_id) REFERENCES core.staff_profiles(id)` |
| `opportunities_priority_code_fkey` | `FOREIGN KEY (priority_code) REFERENCES ref.priorities(code)` |
| `opportunities_team_id_fkey` | `FOREIGN KEY (team_id) REFERENCES core.teams(id)` |
| `opportunities_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `opportunities_branch_id_idx` | `CREATE INDEX opportunities_branch_id_idx ON crm.opportunities USING btree (branch_id)` |
| `opportunities_closed_at_idx` | `CREATE INDEX opportunities_closed_at_idx ON crm.opportunities USING btree (closed_at) WHERE (closed_at IS NOT NULL)` |
| `opportunities_created_at_idx` | `CREATE INDEX opportunities_created_at_idx ON crm.opportunities USING btree (created_at)` |
| `opportunities_customer_id_idx` | `CREATE INDEX opportunities_customer_id_idx ON crm.opportunities USING btree (customer_id)` |
| `opportunities_lead_id_idx` | `CREATE INDEX opportunities_lead_id_idx ON crm.opportunities USING btree (lead_id) WHERE (lead_id IS NOT NULL)` |
| `opportunities_open_idx` | `CREATE INDEX opportunities_open_idx ON crm.opportunities USING btree (branch_id, stage) WHERE (stage = ANY (ARRAY['INTERESTED'::crm.opportunity_stage, 'QUOTATION'::crm.opportunity_stage, 'FOLLOW_UP'::crm.opportunity_stage]))` |
| `opportunities_opportunity_no_key` | `CREATE UNIQUE INDEX opportunities_opportunity_no_key ON crm.opportunities USING btree (opportunity_no)` |
| `opportunities_origin_visit_id_idx` | `CREATE INDEX opportunities_origin_visit_id_idx ON crm.opportunities USING btree (origin_visit_id) WHERE (origin_visit_id IS NOT NULL)` |
| `opportunities_owner_staff_id_idx` | `CREATE INDEX opportunities_owner_staff_id_idx ON crm.opportunities USING btree (owner_staff_id)` |
| `opportunities_pkey` | `CREATE UNIQUE INDEX opportunities_pkey ON crm.opportunities USING btree (id)` |
| `opportunities_won_at_idx` | `CREATE INDEX opportunities_won_at_idx ON crm.opportunities USING btree (won_at) WHERE (stage = 'WON'::crm.opportunity_stage)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_05_running_number` | BEFORE | INSERT | ROW | `app.trg_assign_running_number()` | – |
| `trg_10_enforce_transition` | BEFORE | INSERT · UPDATE | ROW | `app.enforce_row_transition()` | – |
| `trg_20_guard_text` | BEFORE | INSERT · UPDATE | ROW | `app.trg_guard_restricted_text('next_action', 'lost_note')` | – |
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_link_customer_branch` | AFTER | INSERT · UPDATE OF customer_id, branch_id | ROW | `app.trg_link_customer_branch()` | – |
| `trg_refresh_lifecycle_del` | AFTER | DELETE | ROW | `app.trg_refresh_lifecycle()` | – |
| `trg_refresh_lifecycle_ins` | AFTER | INSERT | ROW | `app.trg_refresh_lifecycle()` | – |
| `trg_refresh_lifecycle_upd` | AFTER | UPDATE OF stage, customer_id | ROW | `app.trg_refresh_lifecycle()` | – |
| `trg_sync_next_action_task` | AFTER | INSERT · UPDATE | ROW | `app.trg_sync_next_action_task()` | – |
| `trg_touch_customer_activity` | AFTER | INSERT · DELETE · UPDATE | ROW | `app.trg_touch_customer_activity()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |
| `trg_write_status_history` | AFTER | INSERT · UPDATE OF stage | ROW | `app.trg_write_status_history()` | – |

**Policy:**

- **`opportunities_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ((customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids)) AND ((branch_id = ANY (( SELECT app.scope_branch_ids('opportunity.create'::text, 'ORGANIZATION'::core.data_scope) AS scope_branch_ids)::uuid[])) OR (((EXISTS ( SELECT 1
     FROM crm.customer_branches cb
    WHERE ((cb.customer_id = opportunities.customer_id) AND (cb.branch_id = opportunities.branch_id)))) OR (EXISTS ( SELECT 1
     FROM crm.customers c
    WHERE ((c.id = opportunities.customer_id) AND (c.first_branch_id = opportunities.branch_id))))) AND ((branch_id = ANY (( SELECT app.scope_branch_ids('opportunity.create'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, ( SELECT c.owner_staff_id
     FROM crm.customers c
    WHERE (c.id = opportunities.customer_id))) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('opportunity.create'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('opportunity.create'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (( SELECT c.owner_staff_id
     FROM crm.customers c
    WHERE (c.id = opportunities.customer_id)) = ( SELECT app.current_staff_id() AS current_staff_id)))))) AND ((origin_visit_id IS NULL) OR (origin_visit_id IN ( SELECT v.id
     FROM crm.visits v
    WHERE ((v.branch_id = opportunities.branch_id) AND (v.customer_id = opportunities.customer_id) AND (v.channel_code = opportunities.origin_channel_code))))))
  ```

- **`opportunities_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((branch_id = ANY (( SELECT app.scope_branch_ids('opportunity.read'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, owner_staff_id) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('opportunity.read'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('opportunity.read'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(owner_staff_id, created_by) = ( SELECT app.current_staff_id() AS current_staff_id))) OR (customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids)))
  ```

- **`opportunities_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((branch_id = ANY (( SELECT app.scope_branch_ids('opportunity.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, owner_staff_id) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('opportunity.update'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('opportunity.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(owner_staff_id, created_by) = ( SELECT app.current_staff_id() AS current_staff_id))))
  ```

  WITH CHECK

  ```sql
  (((branch_id = ANY (( SELECT app.scope_branch_ids('opportunity.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, owner_staff_id) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('opportunity.update'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('opportunity.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(owner_staff_id, created_by) = ( SELECT app.current_staff_id() AS current_staff_id)))) AND (customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids)))
  ```

#### `crm.opportunity_items`

สินค้าที่อยู่ในโอกาสขาย (ข้อ 6.10) · สิทธิ์สืบจาก opportunity แม่ · DELETE ได้เมื่อ opportunity ยังเปิด (ข้อ 8.3) · ทุกการเปลี่ยนแปลงคำนวณ opportunities.expected_amount ใหม่ (trigger 0009) · Top Product (Phase 3) = 5 อันดับ product_model ของ SALES

**RLS:** เปิด · **policy:** 4 · **index:** 2 · **trigger:** 4

**GRANT (ทั้งตาราง):** `authenticated` = SELECT, DELETE

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `interest_level` · `opportunity_id` · `product_model` · `product_type_code` · `quantity` · `unit_price` · `variant` |
| `authenticated` | UPDATE | `interest_level` · `product_model` · `product_type_code` · `quantity` · `unit_price` · `variant` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `opportunity_id` | `uuid` | NOT NULL | – | `crm.opportunities(id)` |  | – |
| 4 | `product_type_code` | `text` | NULL | – | `ref.product_types(code)` |  | – |
| 5 | `product_model` | `text` | NULL | – | – |  | รุ่นเป็นข้อความ เช่น "iPhone 17 Pro" |
| 6 | `variant` | `text` | NULL | – | – |  | ความจุ/สี เช่น "256GB" |
| 7 | `quantity` | `integer` | NOT NULL | `1` | – |  | จำนวน ≥ 1 |
| 8 | `unit_price` | `numeric(12,2)` | NOT NULL | `0` | – |  | ราคาต่อหน่วย (บาท) ≥ 0 · หมายเหตุผู้เขียน: บังคับค่าเพื่อให้ expected_amount = Σ(quantity × unit_price) คำนวณได้เสมอ |
| 9 | `interest_level` | `crm.interest_level` | NULL | – | – |  | HOT · WARM · COLD |
| 10 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 11 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 12 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 13 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `opportunity_items_pkey` | `PRIMARY KEY (id)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `opportunity_items_quantity_chk` | `CHECK ((quantity >= 1))` |
| `opportunity_items_unit_price_chk` | `CHECK ((unit_price >= (0)::numeric))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `opportunity_items_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `opportunity_items_opportunity_id_fkey` | `FOREIGN KEY (opportunity_id) REFERENCES crm.opportunities(id)` |
| `opportunity_items_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `opportunity_items_product_type_code_fkey` | `FOREIGN KEY (product_type_code) REFERENCES ref.product_types(code)` |
| `opportunity_items_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `opportunity_items_opportunity_id_idx` | `CREATE INDEX opportunity_items_opportunity_id_idx ON crm.opportunity_items USING btree (opportunity_id)` |
| `opportunity_items_pkey` | `CREATE UNIQUE INDEX opportunity_items_pkey ON crm.opportunity_items USING btree (id)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_sync_expected_amount` | AFTER | INSERT · DELETE · UPDATE | ROW | `app.trg_sync_expected_amount()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`opportunity_items_delete`** — DELETE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (opportunity_id IN ( SELECT x.id
     FROM crm.opportunities x
    WHERE ((x.stage = ANY (ARRAY['INTERESTED'::crm.opportunity_stage, 'QUOTATION'::crm.opportunity_stage, 'FOLLOW_UP'::crm.opportunity_stage])) AND ((x.branch_id = ANY (( SELECT app.scope_branch_ids('opportunity.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((x.branch_id, x.owner_staff_id) IN ( SELECT tp.branch_id,
              tp.staff_id
             FROM app.team_scope_pairs('opportunity.update'::text) tp(branch_id, staff_id))) OR ((x.branch_id = ANY (( SELECT app.scope_branch_ids('opportunity.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(x.owner_staff_id, x.created_by) = ( SELECT app.current_staff_id() AS current_staff_id)))))))
  ```

- **`opportunity_items_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  (opportunity_id IN ( SELECT x.id
     FROM crm.opportunities x
    WHERE ((x.stage = ANY (ARRAY['INTERESTED'::crm.opportunity_stage, 'QUOTATION'::crm.opportunity_stage, 'FOLLOW_UP'::crm.opportunity_stage])) AND ((x.branch_id = ANY (( SELECT app.scope_branch_ids('opportunity.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((x.branch_id, x.owner_staff_id) IN ( SELECT tp.branch_id,
              tp.staff_id
             FROM app.team_scope_pairs('opportunity.update'::text) tp(branch_id, staff_id))) OR ((x.branch_id = ANY (( SELECT app.scope_branch_ids('opportunity.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(x.owner_staff_id, x.created_by) = ( SELECT app.current_staff_id() AS current_staff_id)))))))
  ```

- **`opportunity_items_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (opportunity_id IN ( SELECT o.id
     FROM crm.opportunities o))
  ```

- **`opportunity_items_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (opportunity_id IN ( SELECT x.id
     FROM crm.opportunities x
    WHERE ((x.stage = ANY (ARRAY['INTERESTED'::crm.opportunity_stage, 'QUOTATION'::crm.opportunity_stage, 'FOLLOW_UP'::crm.opportunity_stage])) AND ((x.branch_id = ANY (( SELECT app.scope_branch_ids('opportunity.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((x.branch_id, x.owner_staff_id) IN ( SELECT tp.branch_id,
              tp.staff_id
             FROM app.team_scope_pairs('opportunity.update'::text) tp(branch_id, staff_id))) OR ((x.branch_id = ANY (( SELECT app.scope_branch_ids('opportunity.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(x.owner_staff_id, x.created_by) = ( SELECT app.current_staff_id() AS current_staff_id)))))))
  ```

  WITH CHECK

  ```sql
  (opportunity_id IN ( SELECT x.id
     FROM crm.opportunities x
    WHERE ((x.stage = ANY (ARRAY['INTERESTED'::crm.opportunity_stage, 'QUOTATION'::crm.opportunity_stage, 'FOLLOW_UP'::crm.opportunity_stage])) AND ((x.branch_id = ANY (( SELECT app.scope_branch_ids('opportunity.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((x.branch_id, x.owner_staff_id) IN ( SELECT tp.branch_id,
              tp.staff_id
             FROM app.team_scope_pairs('opportunity.update'::text) tp(branch_id, staff_id))) OR ((x.branch_id = ANY (( SELECT app.scope_branch_ids('opportunity.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(x.owner_staff_id, x.created_by) = ( SELECT app.current_staff_id() AS current_staff_id)))))))
  ```

#### `crm.opportunity_stage_history`

ประวัติการเปลี่ยนขั้น opportunity (ข้อ 4.5 · D25 opportunity_status_history) · เขียนโดย trigger เท่านั้น · SELECT = opportunity แม่อ่านได้ · ไม่ถูกบันทึกใน audit · ใช้กับ OPPORTUNITY_STALE (ไม่มี interaction/การเปลี่ยนขั้น 7 วัน)

**RLS:** เปิด · **policy:** 1 · **index:** 2 · **trigger:** 0

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | – | `core.organizations(id)` |  | – |
| 3 | `opportunity_id` | `uuid` | NOT NULL | – | `crm.opportunities(id)` |  | – |
| 4 | `from_stage` | `crm.opportunity_stage` | NULL | – | – |  | ขั้นเดิม · NULL = สร้าง opportunity |
| 5 | `to_stage` | `crm.opportunity_stage` | NOT NULL | – | – |  | ขั้นใหม่ |
| 6 | `changed_by` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | staff ผู้เปลี่ยน · NULL = ระบบ (เช่น quotation SENT → QUOTATION อัตโนมัติ) |
| 7 | `changed_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | เวลาที่เปลี่ยน (ตอนสร้าง = created_at · ปิด = closed_at · อื่น ๆ = now()) |
| 8 | `reason` | `text` | NULL | – | – |  | เหตุผล: app.status_reason หรือ lost_reason_code เมื่อปิด LOST |
| 9 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `opportunity_stage_history_pkey` | `PRIMARY KEY (id)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `opportunity_stage_history_change_chk` | `CHECK ((from_stage IS DISTINCT FROM to_stage))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `opportunity_stage_history_changed_by_fkey` | `FOREIGN KEY (changed_by) REFERENCES core.staff_profiles(id)` |
| `opportunity_stage_history_opportunity_id_fkey` | `FOREIGN KEY (opportunity_id) REFERENCES crm.opportunities(id)` |
| `opportunity_stage_history_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `opportunity_stage_history_opp_idx` | `CREATE INDEX opportunity_stage_history_opp_idx ON crm.opportunity_stage_history USING btree (opportunity_id, changed_at)` |
| `opportunity_stage_history_pkey` | `CREATE UNIQUE INDEX opportunity_stage_history_pkey ON crm.opportunity_stage_history USING btree (id)` |

**Policy:**

- **`opportunity_stage_history_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (opportunity_id IN ( SELECT o.id
     FROM crm.opportunities o))
  ```

#### `crm.ownership_changes`

ประวัติการเปลี่ยนผู้รับผิดชอบ/สาขา (A28 · ข้อ 9.4.2) · เขียนโดย trigger app.trg_write_ownership_change/RPC เท่านั้น · SELECT = แถวแม่อ่านได้ · ไม่ถูกบันทึกใน audit (ข้อ 9.5) · ตัวอย่าง: LD-2026-007512 คุณขวัญ → คุณคิม โดยคุณเจ SHIFT_CHANGE 10 ก.ย. 2569 18:05 (ข้อ 13.14)

**RLS:** เปิด · **policy:** 1 · **index:** 4 · **trigger:** 0

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | – | `core.organizations(id)` |  | – |
| 3 | `entity_type` | `text` | NOT NULL | – | – |  | ชนิดรายการ CUSTOMER · VISIT · LEAD · OPPORTUNITY · TASK · หมายเหตุผู้เขียน: CANONICAL ไม่กำหนดชุดค่า ผู้เขียนใช้ชื่อ entity ตามรูป {ENTITY}_{VERB} ของ audit (ข้อ 9.5) |
| 4 | `entity_id` | `uuid` | NOT NULL | – | – |  | id ของรายการในตารางตาม entity_type (ไม่มี FK เพราะอ้างหลายตาราง) |
| 5 | `from_staff_id` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | ผู้รับผิดชอบเดิม (NULL = ไม่มี) |
| 6 | `to_staff_id` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | ผู้รับผิดชอบใหม่ (NULL = ปล่อยว่าง เช่น disable_staff ของ lead/task) |
| 7 | `from_branch_id` | `uuid` | NULL | – | `core.branches(id)` |  | สาขาเดิม (เมื่อย้ายสาขา) |
| 8 | `to_branch_id` | `uuid` | NULL | – | `core.branches(id)` |  | สาขาใหม่ (เมื่อย้ายสาขา) |
| 9 | `reason_code` | `text` | NOT NULL | – | `ref.ownership_change_reasons(code)` |  | เหตุผล (ref.ownership_change_reasons) · ย้ายสาขา = BRANCH_TRANSFER · ปิดใช้งานพนักงาน = STAFF_LEFT |
| 10 | `note` | `text` | NULL | – | – |  | หมายเหตุ |
| 11 | `changed_by` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | staff ผู้เปลี่ยน · NULL = ระบบ |
| 12 | `changed_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 13 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `ownership_changes_pkey` | `PRIMARY KEY (id)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `ownership_changes_entity_type_chk` | `CHECK ((entity_type = ANY (ARRAY['CUSTOMER'::text, 'VISIT'::text, 'LEAD'::text, 'OPPORTUNITY'::text, 'TASK'::text])))` |
| `ownership_changes_something_changed_chk` | `CHECK (((from_staff_id IS DISTINCT FROM to_staff_id) OR (from_branch_id IS DISTINCT FROM to_branch_id)))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `ownership_changes_changed_by_fkey` | `FOREIGN KEY (changed_by) REFERENCES core.staff_profiles(id)` |
| `ownership_changes_from_branch_id_fkey` | `FOREIGN KEY (from_branch_id) REFERENCES core.branches(id)` |
| `ownership_changes_from_staff_id_fkey` | `FOREIGN KEY (from_staff_id) REFERENCES core.staff_profiles(id)` |
| `ownership_changes_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `ownership_changes_reason_code_fkey` | `FOREIGN KEY (reason_code) REFERENCES ref.ownership_change_reasons(code)` |
| `ownership_changes_to_branch_id_fkey` | `FOREIGN KEY (to_branch_id) REFERENCES core.branches(id)` |
| `ownership_changes_to_staff_id_fkey` | `FOREIGN KEY (to_staff_id) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `ownership_changes_entity_idx` | `CREATE INDEX ownership_changes_entity_idx ON crm.ownership_changes USING btree (entity_type, entity_id, changed_at)` |
| `ownership_changes_pkey` | `CREATE UNIQUE INDEX ownership_changes_pkey ON crm.ownership_changes USING btree (id)` |
| `ownership_changes_to_branch_idx` | `CREATE INDEX ownership_changes_to_branch_idx ON crm.ownership_changes USING btree (to_branch_id)` |
| `ownership_changes_to_staff_idx` | `CREATE INDEX ownership_changes_to_staff_idx ON crm.ownership_changes USING btree (to_staff_id)` |

**Policy:**

- **`ownership_changes_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (((entity_type = 'CUSTOMER'::text) AND (entity_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids))) OR ((entity_type = 'VISIT'::text) AND (entity_id IN ( SELECT v.id
     FROM crm.visits v))) OR ((entity_type = 'LEAD'::text) AND (entity_id IN ( SELECT l.id
     FROM crm.leads l))) OR ((entity_type = 'OPPORTUNITY'::text) AND (entity_id IN ( SELECT o.id
     FROM crm.opportunities o))) OR ((entity_type = 'TASK'::text) AND (entity_id IN ( SELECT t.id
     FROM crm.tasks t))))
  ```

#### `crm.quotation_items`

รายการสินค้าในใบเสนอราคา (ข้อ 6.10) · สิทธิ์สืบจาก quotation แม่ · INSERT/UPDATE/DELETE ได้เมื่อ quotation ยังเป็น DRAFT (ข้อ 8.3)

**RLS:** เปิด · **policy:** 4 · **index:** 2 · **trigger:** 3

**GRANT (ทั้งตาราง):** `authenticated` = SELECT, DELETE

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `discount_amount` · `product_model` · `product_type_code` · `quantity` · `quotation_id` · `unit_price` · `variant` |
| `authenticated` | UPDATE | `discount_amount` · `product_model` · `product_type_code` · `quantity` · `unit_price` · `variant` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `quotation_id` | `uuid` | NOT NULL | – | `crm.quotations(id)` |  | – |
| 4 | `product_type_code` | `text` | NULL | – | `ref.product_types(code)` |  | – |
| 5 | `product_model` | `text` | NULL | – | – |  | – |
| 6 | `variant` | `text` | NULL | – | – |  | – |
| 7 | `quantity` | `integer` | NOT NULL | `1` | – |  | จำนวน ≥ 1 |
| 8 | `unit_price` | `numeric(12,2)` | NOT NULL | `0` | – |  | ราคาต่อหน่วย (บาท) |
| 9 | `discount_amount` | `numeric(12,2)` | NOT NULL | `0` | – |  | ส่วนลดรวมของบรรทัด (บาท) · 0 ≤ ส่วนลด ≤ quantity × unit_price |
| 10 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 11 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 12 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 13 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `quotation_items_pkey` | `PRIMARY KEY (id)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `quotation_items_discount_chk` | `CHECK (((discount_amount >= (0)::numeric) AND (discount_amount <= ((quantity)::numeric * unit_price))))` |
| `quotation_items_quantity_chk` | `CHECK ((quantity >= 1))` |
| `quotation_items_unit_price_chk` | `CHECK ((unit_price >= (0)::numeric))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `quotation_items_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `quotation_items_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `quotation_items_product_type_code_fkey` | `FOREIGN KEY (product_type_code) REFERENCES ref.product_types(code)` |
| `quotation_items_quotation_id_fkey` | `FOREIGN KEY (quotation_id) REFERENCES crm.quotations(id)` |
| `quotation_items_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `quotation_items_pkey` | `CREATE UNIQUE INDEX quotation_items_pkey ON crm.quotation_items USING btree (id)` |
| `quotation_items_quotation_id_idx` | `CREATE INDEX quotation_items_quotation_id_idx ON crm.quotation_items USING btree (quotation_id)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`quotation_items_delete`** — DELETE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (quotation_id IN ( SELECT x.id
     FROM crm.quotations x
    WHERE ((x.status = 'DRAFT'::crm.quotation_status) AND ((x.branch_id = ANY (( SELECT app.scope_branch_ids('quotation.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((x.branch_id, x.owner_staff_id) IN ( SELECT tp.branch_id,
              tp.staff_id
             FROM app.team_scope_pairs('quotation.update'::text) tp(branch_id, staff_id))) OR ((x.branch_id = ANY (( SELECT app.scope_branch_ids('quotation.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(x.owner_staff_id, x.created_by) = ( SELECT app.current_staff_id() AS current_staff_id)))))))
  ```

- **`quotation_items_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  (quotation_id IN ( SELECT x.id
     FROM crm.quotations x
    WHERE ((x.status = 'DRAFT'::crm.quotation_status) AND ((x.branch_id = ANY (( SELECT app.scope_branch_ids('quotation.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((x.branch_id, x.owner_staff_id) IN ( SELECT tp.branch_id,
              tp.staff_id
             FROM app.team_scope_pairs('quotation.update'::text) tp(branch_id, staff_id))) OR ((x.branch_id = ANY (( SELECT app.scope_branch_ids('quotation.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(x.owner_staff_id, x.created_by) = ( SELECT app.current_staff_id() AS current_staff_id)))))))
  ```

- **`quotation_items_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (quotation_id IN ( SELECT q.id
     FROM crm.quotations q))
  ```

- **`quotation_items_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (quotation_id IN ( SELECT x.id
     FROM crm.quotations x
    WHERE ((x.status = 'DRAFT'::crm.quotation_status) AND ((x.branch_id = ANY (( SELECT app.scope_branch_ids('quotation.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((x.branch_id, x.owner_staff_id) IN ( SELECT tp.branch_id,
              tp.staff_id
             FROM app.team_scope_pairs('quotation.update'::text) tp(branch_id, staff_id))) OR ((x.branch_id = ANY (( SELECT app.scope_branch_ids('quotation.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(x.owner_staff_id, x.created_by) = ( SELECT app.current_staff_id() AS current_staff_id)))))))
  ```

  WITH CHECK

  ```sql
  (quotation_id IN ( SELECT x.id
     FROM crm.quotations x
    WHERE ((x.status = 'DRAFT'::crm.quotation_status) AND ((x.branch_id = ANY (( SELECT app.scope_branch_ids('quotation.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((x.branch_id, x.owner_staff_id) IN ( SELECT tp.branch_id,
              tp.staff_id
             FROM app.team_scope_pairs('quotation.update'::text) tp(branch_id, staff_id))) OR ((x.branch_id = ANY (( SELECT app.scope_branch_ids('quotation.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(x.owner_staff_id, x.created_by) = ( SELECT app.current_staff_id() AS current_staff_id)))))))
  ```

#### `crm.quotations`

ใบเสนอราคา (ข้อ 4.6 · 6.10) · สร้างจาก opportunity (quotation.create ประเมินกับ opportunity แม่) · DRAFT แก้ได้ทุกช่อง · ส่ง (DRAFT → SENT) บันทึก sent_at sent_channel_code และ RPC สร้าง interaction QUOTATION_SENT · หลังส่งแก้ได้เฉพาะ status (app.enforce_row_transition) · SENT → ACCEPTED/REJECTED ด้วยมือ (ACCEPTED ไม่ปิด WON อัตโนมัติ) · SENT → EXPIRED โดย app.job_expire_quotations 00:00 วันถัดจาก valid_until · เปลี่ยนเป็น SENT ทำให้ opportunity INTERESTED/FOLLOW_UP → QUOTATION (trigger 0009)

**RLS:** เปิด · **policy:** 3 · **index:** 7 · **trigger:** 8

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `installment_months` · `opportunity_id` · `terms_note` · `total_amount` |
| `authenticated` | UPDATE | `installment_months` · `sent_channel_code` · `status` · `terms_note` · `total_amount` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `quotation_no` | `text` | NOT NULL | – | – |  | เลข QT-{YYYY}-{NNNNNN} ตัวนับ QT:{YYYY} (ข้อ 6.1) |
| 4 | `opportunity_id` | `uuid` | NOT NULL | – | `crm.opportunities(id)` |  | opportunity แม่ (บังคับ) |
| 5 | `customer_id` | `uuid` | NOT NULL | – | `crm.customers(id)` |  | ลูกค้า = ของ opportunity แม่ (trigger 0009 เติมเมื่อว่าง) · หมายเหตุผู้เขียน: ข้อ 6.10 ไม่ระบุ NOT NULL แต่ RLS/read-through ต้องมีลูกค้า จึงบังคับ |
| 6 | `branch_id` | `uuid` | NOT NULL | – | `core.branches(id)` |  | สาขา = ของ opportunity แม่ (ข้อ 8.0 แถวลูกเท่าแถวแม่ · trigger 0009 เติมเมื่อว่าง) · หมายเหตุผู้เขียน: บังคับ NOT NULL เพื่อประเมิน scope |
| 7 | `owner_staff_id` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | ผู้จัดทำ (เปลี่ยน owner ไม่ได้ ข้อ 9.4.2) · trigger เติมจาก owner ของ opportunity เมื่อว่าง |
| 8 | `status` | `crm.quotation_status` | NOT NULL | `'DRAFT'::crm.quotation_status` | – |  | DRAFT · SENT · ACCEPTED · REJECTED · EXPIRED (ข้อ 4.6) |
| 9 | `sent_at` | `timestamp with time zone` | NULL | – | – |  | เวลาส่ง (บังคับเมื่อไม่ใช่ DRAFT) |
| 10 | `sent_channel_code` | `text` | NULL | – | `ref.channels(code)` |  | ช่องทางที่ส่ง (ref.channels · บังคับเมื่อไม่ใช่ DRAFT) |
| 11 | `valid_until` | `date` | NULL | – | – |  | ใช้ได้ถึงวันที่ (date) = วันที่ส่งตาม Asia/Bangkok + app.settings[quotation.valid_days] (7) [รอยืนยัน] · trigger 0009 คำนวณเมื่อเปลี่ยนเป็น SENT และยังว่าง · ตัวอย่าง ส่ง 1 ก.ย. 2569 → 8 ก.ย. 2569 |
| 12 | `total_amount` | `numeric(12,2)` | NOT NULL | `0` | – |  | ยอดรวม (บาท) · หมายเหตุผู้เขียน: CANONICAL ไม่กำหนดสูตรจาก quotation_items ผู้เรียก RPC ตั้งค่า (รอยืนยัน) |
| 13 | `installment_months` | `integer` | NULL | – | – |  | จำนวนงวดผ่อน (ถ้ามี) ≥ 1 |
| 14 | `terms_note` | `text` | NULL | – | – |  | เงื่อนไข/หมายเหตุ · ผ่าน app.trg_guard_restricted_text (ข้อ 10.1) |
| 15 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 16 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 17 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 18 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `quotations_pkey` | `PRIMARY KEY (id)` |
| `quotations_quotation_no_key` | `UNIQUE (quotation_no)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `quotations_installment_months_chk` | `CHECK (((installment_months IS NULL) OR (installment_months >= 1)))` |
| `quotations_quotation_no_chk` | `CHECK ((quotation_no ~ '^QT-[0-9]{4}-[0-9]{6,}$'::text))` |
| `quotations_sent_chk` | `CHECK ( CASE status     WHEN 'DRAFT'::crm.quotation_status THEN ((sent_at IS NULL) AND (sent_channel_code IS NULL) AND (valid_until IS NULL))     ELSE ((sent_at IS NOT NULL) AND (sent_channel_code IS NOT NULL) AND (valid_until IS NOT NULL)) END)` |
| `quotations_total_amount_chk` | `CHECK ((total_amount >= (0)::numeric))` |
| `quotations_valid_until_chk` | `CHECK (((valid_until IS NULL) OR (valid_until >= app.bangkok_date(sent_at))))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `quotations_branch_id_fkey` | `FOREIGN KEY (branch_id) REFERENCES core.branches(id)` |
| `quotations_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `quotations_customer_id_fkey` | `FOREIGN KEY (customer_id) REFERENCES crm.customers(id)` |
| `quotations_opportunity_id_fkey` | `FOREIGN KEY (opportunity_id) REFERENCES crm.opportunities(id)` |
| `quotations_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `quotations_owner_staff_id_fkey` | `FOREIGN KEY (owner_staff_id) REFERENCES core.staff_profiles(id)` |
| `quotations_sent_channel_code_fkey` | `FOREIGN KEY (sent_channel_code) REFERENCES ref.channels(code)` |
| `quotations_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `quotations_branch_id_idx` | `CREATE INDEX quotations_branch_id_idx ON crm.quotations USING btree (branch_id)` |
| `quotations_customer_id_idx` | `CREATE INDEX quotations_customer_id_idx ON crm.quotations USING btree (customer_id)` |
| `quotations_opportunity_id_idx` | `CREATE INDEX quotations_opportunity_id_idx ON crm.quotations USING btree (opportunity_id)` |
| `quotations_owner_staff_id_idx` | `CREATE INDEX quotations_owner_staff_id_idx ON crm.quotations USING btree (owner_staff_id)` |
| `quotations_pkey` | `CREATE UNIQUE INDEX quotations_pkey ON crm.quotations USING btree (id)` |
| `quotations_quotation_no_key` | `CREATE UNIQUE INDEX quotations_quotation_no_key ON crm.quotations USING btree (quotation_no)` |
| `quotations_sent_valid_idx` | `CREATE INDEX quotations_sent_valid_idx ON crm.quotations USING btree (valid_until) WHERE (status = 'SENT'::crm.quotation_status)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_05_running_number` | BEFORE | INSERT | ROW | `app.trg_assign_running_number()` | – |
| `trg_10_enforce_transition` | BEFORE | INSERT · UPDATE | ROW | `app.enforce_row_transition()` | – |
| `trg_20_guard_text` | BEFORE | INSERT · UPDATE | ROW | `app.trg_guard_restricted_text('terms_note')` | – |
| `trg_30_row_defaults` | BEFORE | INSERT · UPDATE | ROW | `app.trg_row_defaults()` | – |
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_quotation_sent_stage` | AFTER | INSERT · UPDATE OF status | ROW | `app.trg_quotation_sent_stage()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`quotations_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ((customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids)) AND (opportunity_id IN ( SELECT x.id
     FROM crm.opportunities x
    WHERE ((x.branch_id = quotations.branch_id) AND (x.customer_id = quotations.customer_id) AND ((x.branch_id = ANY (( SELECT app.scope_branch_ids('quotation.create'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((x.branch_id, x.owner_staff_id) IN ( SELECT tp.branch_id,
              tp.staff_id
             FROM app.team_scope_pairs('quotation.create'::text) tp(branch_id, staff_id))) OR ((x.branch_id = ANY (( SELECT app.scope_branch_ids('quotation.create'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(x.owner_staff_id, x.created_by) = ( SELECT app.current_staff_id() AS current_staff_id))))))))
  ```

- **`quotations_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((branch_id = ANY (( SELECT app.scope_branch_ids('quotation.read'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, owner_staff_id) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('quotation.read'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('quotation.read'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(owner_staff_id, created_by) = ( SELECT app.current_staff_id() AS current_staff_id))) OR (customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids)))
  ```

- **`quotations_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((branch_id = ANY (( SELECT app.scope_branch_ids('quotation.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, owner_staff_id) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('quotation.update'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('quotation.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(owner_staff_id, created_by) = ( SELECT app.current_staff_id() AS current_staff_id))))
  ```

  WITH CHECK

  ```sql
  (((branch_id = ANY (( SELECT app.scope_branch_ids('quotation.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, owner_staff_id) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('quotation.update'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('quotation.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(owner_staff_id, created_by) = ( SELECT app.current_staff_id() AS current_staff_id)))) AND (customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids)))
  ```

#### `crm.tags`

Tag ของลูกค้า (ข้อ 5.9) · ข้อมูลขององค์กร (ไม่ใช่ ref) · สร้าง/แก้ด้วย tag.manage (MARKETING · BUSINESS_ADMIN) ที่หน้า master-data แท็บ Tag · seed: VIP ลูกค้าคนสำคัญ (VIP) · INSTALLMENT ผ่อนชำระ · STUDENT นักศึกษา · TRADE_IN Trade-in · IPHONE_FAN สาย iPhone [รอยืนยัน] · code VIP ถูกอ้างในกติกาป้ายเสริม (ข้อ 3.5) ห้ามเปลี่ยน · ห้ามลบ (is_active = false)

**RLS:** เปิด · **policy:** 3 · **index:** 2 · **trigger:** 3

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `code` · `is_active` · `label_th` |
| `authenticated` | UPDATE | `is_active` · `label_th` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `code` | `text` | NOT NULL | – | – |  | รหัส tag ไม่ซ้ำในองค์กร |
| 4 | `label_th` | `text` | NOT NULL | – | – |  | ชื่อที่แสดง |
| 5 | `is_active` | `boolean` | NOT NULL | `true` | – |  | false = เลือกใหม่ไม่ได้ (แถว customer_tags เดิมคงอยู่) |
| 6 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 7 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 8 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 9 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `tags_pkey` | `PRIMARY KEY (id)` |
| `tags_code_uq` | `UNIQUE (organization_id, code)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `tags_code_chk` | `CHECK ((code ~ '^[A-Z0-9_]+$'::text))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `tags_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `tags_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `tags_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `tags_code_uq` | `CREATE UNIQUE INDEX tags_code_uq ON crm.tags USING btree (organization_id, code)` |
| `tags_pkey` | `CREATE UNIQUE INDEX tags_pkey ON crm.tags USING btree (id)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`tags_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ((organization_id = ( SELECT app.current_organization_id() AS current_organization_id)) AND ( SELECT app.has_permission('tag.manage'::text) AS has_permission))
  ```

- **`tags_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((organization_id = ( SELECT app.current_organization_id() AS current_organization_id)) AND (is_active OR ( SELECT app.has_permission('tag.manage'::text) AS has_permission)))
  ```

- **`tags_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((organization_id = ( SELECT app.current_organization_id() AS current_organization_id)) AND ( SELECT app.has_permission('tag.manage'::text) AS has_permission))
  ```

  WITH CHECK

  ```sql
  ((organization_id = ( SELECT app.current_organization_id() AS current_organization_id)) AND ( SELECT app.has_permission('tag.manage'::text) AS has_permission))
  ```

#### `crm.task_comments`

ความเห็นในงาน (ข้อ 6.10 · 8.3) · SELECT = task.read บน task · INSERT/UPDATE = task.update บน task · ไม่มี DELETE · body ผ่าน app.trg_guard_restricted_text (ข้อ 10.1)

**RLS:** เปิด · **policy:** 3 · **index:** 2 · **trigger:** 4

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `body` · `task_id` |
| `authenticated` | UPDATE | `body` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `task_id` | `uuid` | NOT NULL | – | `crm.tasks(id)` |  | – |
| 4 | `body` | `text` | NOT NULL | – | – | **pii** | ข้อความความเห็น · anonymize แทนด้วยข้อความคงที่ · หมายเหตุผู้เขียน: ข้อ 10.4 ไม่ระบุคอลัมน์นี้ แต่เป็นข้อความอิสระที่อาจมีชื่อลูกค้า จึงติดป้าย pii |
| 5 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 6 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 7 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 8 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `task_comments_pkey` | `PRIMARY KEY (id)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `task_comments_body_chk` | `CHECK ((btrim(body) <> ''::text))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `task_comments_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `task_comments_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `task_comments_task_id_fkey` | `FOREIGN KEY (task_id) REFERENCES crm.tasks(id)` |
| `task_comments_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `task_comments_pkey` | `CREATE UNIQUE INDEX task_comments_pkey ON crm.task_comments USING btree (id)` |
| `task_comments_task_idx` | `CREATE INDEX task_comments_task_idx ON crm.task_comments USING btree (task_id, created_at)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_20_guard_text` | BEFORE | INSERT · UPDATE | ROW | `app.trg_guard_restricted_text('body')` | – |
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`task_comments_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  (task_id IN ( SELECT x.id
     FROM crm.tasks x
    WHERE ((x.branch_id = ANY (( SELECT app.scope_branch_ids('task.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((x.branch_id, x.owner_staff_id) IN ( SELECT tp.branch_id,
              tp.staff_id
             FROM app.team_scope_pairs('task.update'::text) tp(branch_id, staff_id))) OR ((x.branch_id = ANY (( SELECT app.scope_branch_ids('task.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(x.owner_staff_id, x.created_by) = ( SELECT app.current_staff_id() AS current_staff_id))))))
  ```

- **`task_comments_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (task_id IN ( SELECT t.id
     FROM crm.tasks t))
  ```

- **`task_comments_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  (task_id IN ( SELECT x.id
     FROM crm.tasks x
    WHERE ((x.branch_id = ANY (( SELECT app.scope_branch_ids('task.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((x.branch_id, x.owner_staff_id) IN ( SELECT tp.branch_id,
              tp.staff_id
             FROM app.team_scope_pairs('task.update'::text) tp(branch_id, staff_id))) OR ((x.branch_id = ANY (( SELECT app.scope_branch_ids('task.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(x.owner_staff_id, x.created_by) = ( SELECT app.current_staff_id() AS current_staff_id))))))
  ```

  WITH CHECK

  ```sql
  (task_id IN ( SELECT x.id
     FROM crm.tasks x
    WHERE ((x.branch_id = ANY (( SELECT app.scope_branch_ids('task.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((x.branch_id, x.owner_staff_id) IN ( SELECT tp.branch_id,
              tp.staff_id
             FROM app.team_scope_pairs('task.update'::text) tp(branch_id, staff_id))) OR ((x.branch_id = ANY (( SELECT app.scope_branch_ids('task.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(x.owner_staff_id, x.created_by) = ( SELECT app.current_staff_id() AS current_staff_id))))))
  ```

#### `crm.tasks`

งานที่ต้องติดตาม (ข้อ 4.7 · D7) · follow-up = task_type_code FOLLOW_UP · reminder = remind_at · สิทธิ์ task.read ไม่มี read-through ผ่านลูกค้า (ข้อ 9.4) · task next action (is_next_action = true) สร้าง/อัปเดต/ยกเลิกโดย trigger app.trg_sync_next_action_task ให้ตรงกับ next_action next_action_type_code next_action_at owner_staff_id ของ lead/opportunity · กลุ่มหน้า "งานของวันนี้" (เทียบ app.clock() · วัน Asia/Bangkok): วันนี้ = OPEN/IN_PROGRESS ที่ due_at อยู่ในวันนี้ · เกินกำหนด = OPEN/IN_PROGRESS ที่ due_at ก่อน 00:00 ของวันนี้

**RLS:** เปิด · **policy:** 3 · **index:** 11 · **trigger:** 8

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `branch_id` · `customer_id` · `description` · `due_at` · `lead_id` · `opportunity_id` · `owner_staff_id` · `priority_code` · `remind_at` · `task_type_code` · `title` |
| `authenticated` | UPDATE | `description` · `due_at` · `priority_code` · `remind_at` · `status` · `task_type_code` · `title` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `task_no` | `text` | NOT NULL | – | – |  | เลขงาน TK-{YYYY}-{NNNNNN} ตัวนับ TK:{YYYY} (ข้อ 6.1) · push/email ใช้เลขนี้แทนชื่อลูกค้า |
| 4 | `task_type_code` | `text` | NOT NULL | – | `ref.task_types(code)` |  | ประเภทงาน (ref.task_types) · task next action = next_action_type_code ของแม่ |
| 5 | `title` | `text` | NOT NULL | – | – | **pii** | ชื่องาน (บังคับ) · task next action = next_action ของแม่ · ผ่าน app.trg_guard_restricted_text · anonymize แทนด้วยข้อความคงที่ |
| 6 | `description` | `text` | NULL | – | – | **pii** | รายละเอียดงาน · ผ่าน app.trg_guard_restricted_text · anonymize ล้างค่า |
| 7 | `customer_id` | `uuid` | NULL | – | `crm.customers(id)` |  | ลูกค้าที่เกี่ยวข้อง · trigger 0009 เติมจาก lead/opportunity เมื่อว่าง · ใช้ป้าย "ติดตามอยู่" (has_open_followup) |
| 8 | `lead_id` | `uuid` | NULL | – | `crm.leads(id)` |  | lead แม่ (ถ้ามี) · task.create ประเมินกับแม่ (ข้อ 8.0) |
| 9 | `opportunity_id` | `uuid` | NULL | – | `crm.opportunities(id)` |  | opportunity แม่ (ถ้ามี) |
| 10 | `branch_id` | `uuid` | NOT NULL | – | `core.branches(id)` |  | สาขาของงาน (บังคับ · = สาขาของแม่) · มิติสาขาของ FOLLOWUP_COMPLETION |
| 11 | `owner_staff_id` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | ผู้รับผิดชอบ · ว่างได้ (เช่น disable_staff) · มอบให้คนอื่นต้องมี task.assign |
| 12 | `team_id` | `uuid` | NULL | – | `core.teams(id)` |  | ทีม ณ ตอนมอบงาน (snapshot) |
| 13 | `status` | `crm.task_status` | NOT NULL | `'OPEN'::crm.task_status` | – |  | OPEN · IN_PROGRESS · DONE (completed_at) · CANCELLED (cancelled_at) |
| 14 | `priority_code` | `text` | NOT NULL | `'NORMAL'::text` | `ref.priorities(code)` |  | ความสำคัญ (ref.priorities · ค่าเริ่มต้น NORMAL) |
| 15 | `due_at` | `timestamp with time zone` | NOT NULL | – | – |  | กำหนดเสร็จ · หมายเหตุผู้เขียน: บังคับ NOT NULL เพราะกลุ่มวันนี้/เกินกำหนด (ข้อ 4.7) FOLLOWUP_COMPLETION และการแจ้งเตือนทุกข้อใช้ due_at |
| 16 | `remind_at` | `timestamp with time zone` | NULL | – | – |  | เวลาเตือน (FOLLOWUP_DUE) · ค่าเริ่มต้น = due_at − app.settings[sla.followup_remind_min] (15 นาที) ตั้งโดย trigger 0009 |
| 17 | `completed_at` | `timestamp with time zone` | NULL | – | – |  | เวลาเสร็จ (มีค่าเมื่อ DONE เท่านั้น) · ตรงเวลา = completed_at ≤ due_at + 24 ชม. (ข้อ 12.2) |
| 18 | `cancelled_at` | `timestamp with time zone` | NULL | – | – |  | เวลายกเลิก (มีค่าเมื่อ CANCELLED เท่านั้น) |
| 19 | `is_next_action` | `boolean` | NOT NULL | `false` | – |  | true = task next action ของ lead/opportunity (คอลัมน์ระบบ · ตั้งโดย trigger) · ต่อแม่มีใบที่ยังไม่ปิดได้ใบเดียว |
| 20 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 21 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 22 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 23 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `tasks_pkey` | `PRIMARY KEY (id)` |
| `tasks_task_no_key` | `UNIQUE (task_no)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `tasks_cancelled_chk` | `CHECK (((status = 'CANCELLED'::crm.task_status) = (cancelled_at IS NOT NULL)))` |
| `tasks_done_chk` | `CHECK (((status = 'DONE'::crm.task_status) = (completed_at IS NOT NULL)))` |
| `tasks_next_action_parent_chk` | `CHECK (((NOT is_next_action) OR ((lead_id IS NOT NULL) <> (opportunity_id IS NOT NULL))))` |
| `tasks_remind_chk` | `CHECK (((remind_at IS NULL) OR (remind_at <= due_at)))` |
| `tasks_task_no_chk` | `CHECK ((task_no ~ '^TK-[0-9]{4}-[0-9]{6,}$'::text))` |
| `tasks_title_chk` | `CHECK ((btrim(title) <> ''::text))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `tasks_branch_id_fkey` | `FOREIGN KEY (branch_id) REFERENCES core.branches(id)` |
| `tasks_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `tasks_customer_id_fkey` | `FOREIGN KEY (customer_id) REFERENCES crm.customers(id)` |
| `tasks_lead_id_fkey` | `FOREIGN KEY (lead_id) REFERENCES crm.leads(id)` |
| `tasks_opportunity_id_fkey` | `FOREIGN KEY (opportunity_id) REFERENCES crm.opportunities(id)` |
| `tasks_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `tasks_owner_staff_id_fkey` | `FOREIGN KEY (owner_staff_id) REFERENCES core.staff_profiles(id)` |
| `tasks_priority_code_fkey` | `FOREIGN KEY (priority_code) REFERENCES ref.priorities(code)` |
| `tasks_task_type_code_fkey` | `FOREIGN KEY (task_type_code) REFERENCES ref.task_types(code)` |
| `tasks_team_id_fkey` | `FOREIGN KEY (team_id) REFERENCES core.teams(id)` |
| `tasks_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `tasks_branch_id_idx` | `CREATE INDEX tasks_branch_id_idx ON crm.tasks USING btree (branch_id)` |
| `tasks_customer_id_idx` | `CREATE INDEX tasks_customer_id_idx ON crm.tasks USING btree (customer_id)` |
| `tasks_due_at_idx` | `CREATE INDEX tasks_due_at_idx ON crm.tasks USING btree (due_at)` |
| `tasks_lead_id_idx` | `CREATE INDEX tasks_lead_id_idx ON crm.tasks USING btree (lead_id) WHERE (lead_id IS NOT NULL)` |
| `tasks_next_action_lead_uidx` | `CREATE UNIQUE INDEX tasks_next_action_lead_uidx ON crm.tasks USING btree (lead_id) WHERE (is_next_action AND (status = ANY (ARRAY['OPEN'::crm.task_status, 'IN_PROGRESS'::crm.task_status])))` |
| `tasks_next_action_opportunity_uidx` | `CREATE UNIQUE INDEX tasks_next_action_opportunity_uidx ON crm.tasks USING btree (opportunity_id) WHERE (is_next_action AND (status = ANY (ARRAY['OPEN'::crm.task_status, 'IN_PROGRESS'::crm.task_status])))` |
| `tasks_open_due_idx` | `CREATE INDEX tasks_open_due_idx ON crm.tasks USING btree (owner_staff_id, due_at) WHERE (status = ANY (ARRAY['OPEN'::crm.task_status, 'IN_PROGRESS'::crm.task_status]))` |
| `tasks_opportunity_id_idx` | `CREATE INDEX tasks_opportunity_id_idx ON crm.tasks USING btree (opportunity_id) WHERE (opportunity_id IS NOT NULL)` |
| `tasks_owner_staff_id_idx` | `CREATE INDEX tasks_owner_staff_id_idx ON crm.tasks USING btree (owner_staff_id)` |
| `tasks_pkey` | `CREATE UNIQUE INDEX tasks_pkey ON crm.tasks USING btree (id)` |
| `tasks_task_no_key` | `CREATE UNIQUE INDEX tasks_task_no_key ON crm.tasks USING btree (task_no)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_05_running_number` | BEFORE | INSERT | ROW | `app.trg_assign_running_number()` | – |
| `trg_10_enforce_transition` | BEFORE | INSERT · UPDATE | ROW | `app.enforce_row_transition()` | – |
| `trg_20_guard_text` | BEFORE | INSERT · UPDATE | ROW | `app.trg_guard_restricted_text('title', 'description')` | – |
| `trg_30_row_defaults` | BEFORE | INSERT · UPDATE | ROW | `app.trg_row_defaults()` | – |
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_touch_customer_activity` | AFTER | INSERT · DELETE · UPDATE | ROW | `app.trg_touch_customer_activity()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`tasks_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  (((customer_id IS NULL) OR (customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids))) AND (((opportunity_id IS NOT NULL) AND (opportunity_id IN ( SELECT x.id
     FROM crm.opportunities x
    WHERE ((x.branch_id = tasks.branch_id) AND (NOT (x.customer_id IS DISTINCT FROM tasks.customer_id)) AND ((tasks.lead_id IS NULL) OR (tasks.lead_id = x.lead_id)) AND ((x.branch_id = ANY (( SELECT app.scope_branch_ids('task.create'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((x.branch_id, x.owner_staff_id) IN ( SELECT tp.branch_id,
              tp.staff_id
             FROM app.team_scope_pairs('task.create'::text) tp(branch_id, staff_id))) OR ((x.branch_id = ANY (( SELECT app.scope_branch_ids('task.create'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(x.owner_staff_id, x.created_by) = ( SELECT app.current_staff_id() AS current_staff_id)))))))) OR ((opportunity_id IS NULL) AND (lead_id IS NOT NULL) AND (lead_id IN ( SELECT x.id
     FROM crm.leads x
    WHERE ((x.branch_id = tasks.branch_id) AND (NOT (x.customer_id IS DISTINCT FROM tasks.customer_id)) AND ((x.branch_id = ANY (( SELECT app.scope_branch_ids('task.create'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((x.branch_id, x.owner_staff_id) IN ( SELECT tp.branch_id,
              tp.staff_id
             FROM app.team_scope_pairs('task.create'::text) tp(branch_id, staff_id))) OR ((x.branch_id = ANY (( SELECT app.scope_branch_ids('task.create'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(x.owner_staff_id, x.created_by) = ( SELECT app.current_staff_id() AS current_staff_id)))))))) OR ((opportunity_id IS NULL) AND (lead_id IS NULL) AND (customer_id IS NOT NULL) AND ((branch_id = ANY (( SELECT app.scope_branch_ids('task.create'::text, 'ORGANIZATION'::core.data_scope) AS scope_branch_ids)::uuid[])) OR (((EXISTS ( SELECT 1
     FROM crm.customer_branches cb
    WHERE ((cb.customer_id = tasks.customer_id) AND (cb.branch_id = tasks.branch_id)))) OR (EXISTS ( SELECT 1
     FROM crm.customers c
    WHERE ((c.id = tasks.customer_id) AND (c.first_branch_id = tasks.branch_id))))) AND ((branch_id = ANY (( SELECT app.scope_branch_ids('task.create'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, ( SELECT c.owner_staff_id
     FROM crm.customers c
    WHERE (c.id = tasks.customer_id))) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('task.create'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('task.create'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (( SELECT c.owner_staff_id
     FROM crm.customers c
    WHERE (c.id = tasks.customer_id)) = ( SELECT app.current_staff_id() AS current_staff_id))))))) OR ((opportunity_id IS NULL) AND (lead_id IS NULL) AND (customer_id IS NULL) AND ((branch_id = ANY (( SELECT app.scope_branch_ids('task.create'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, owner_staff_id) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('task.create'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('task.create'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(owner_staff_id, created_by) = ( SELECT app.current_staff_id() AS current_staff_id)))))))
  ```

- **`tasks_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((branch_id = ANY (( SELECT app.scope_branch_ids('task.read'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, owner_staff_id) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('task.read'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('task.read'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(owner_staff_id, created_by) = ( SELECT app.current_staff_id() AS current_staff_id))))
  ```

- **`tasks_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((branch_id = ANY (( SELECT app.scope_branch_ids('task.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, owner_staff_id) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('task.update'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('task.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(owner_staff_id, created_by) = ( SELECT app.current_staff_id() AS current_staff_id))))
  ```

  WITH CHECK

  ```sql
  (((branch_id = ANY (( SELECT app.scope_branch_ids('task.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, owner_staff_id) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('task.update'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('task.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(owner_staff_id, created_by) = ( SELECT app.current_staff_id() AS current_staff_id)))) AND ((customer_id IS NULL) OR (customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids))))
  ```

#### `crm.transaction_refs`

เลขอ้างอิงธุรกรรมจากระบบต้นทาง (ข้อ 5.7 · 6.10 · D25 รวม transactions/transaction_items/payment_references/service_references) · V1 ผูกด้วยมือ (transaction.link · source_system_code = MANUAL) · เหตุการณ์การซื้อ = ref ที่ transaction_types.counts_as_purchase และ (opportunity_id IS NULL หรือ opportunity นั้นไม่ใช่ WON) (ข้อ 3.1) · ไม่มีบทบาทใดส่งออก summary หรือ IMEI (ข้อ 8.2) · หมายเหตุผู้เขียน: ตารางนี้ไม่มี owner_staff_id ใน CANONICAL จึงใช้ created_by แทน owner ในการประเมิน scope OWN

**RLS:** เปิด · **policy:** 2 · **index:** 9 · **trigger:** 8

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | INSERT | `amount` · `branch_id` · `customer_id` · `device_imei` · `device_serial` · `external_no` · `opportunity_id` · `source_system_code` · `summary` · `transacted_at` · `transaction_type_code` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `customer_id` | `uuid` | NOT NULL | – | `crm.customers(id)` |  | ลูกค้าเจ้าของธุรกรรม (บังคับ) |
| 4 | `branch_id` | `uuid` | NOT NULL | – | `core.branches(id)` |  | สาขาของธุรกรรม (บังคับ) |
| 5 | `opportunity_id` | `uuid` | NULL | – | `crm.opportunities(id)` |  | opportunity ที่ปิดการขายนี้ (ถ้ามี) · ref ที่ผูก opportunity WON นับเป็นการซื้อครั้งเดียวกับ opportunity |
| 6 | `transaction_type_code` | `text` | NOT NULL | – | `ref.transaction_types(code)` |  | ประเภทธุรกรรม (ref.transaction_types) |
| 7 | `source_system_code` | `text` | NOT NULL | – | `ref.source_systems(code)` |  | ระบบต้นทาง (ref.source_systems) · UNIQUE คู่กับ external_no |
| 8 | `external_no` | `text` | NOT NULL | – | – |  | เลขธุรกรรม/ใบเสร็จ/สัญญาในระบบต้นทาง · ค้นแบบตรงทั้งค่า (ข้อ 6.5) · แท็บเอกสาร Customer 360 แสดงเลขสัญญาจากคอลัมน์นี้ |
| 9 | `transacted_at` | `timestamp with time zone` | NOT NULL | – | – |  | เวลาธุรกรรม (activity event ข้อ 3.1) |
| 10 | `amount` | `numeric(12,2)` | NULL | – | – |  | จำนวนเงิน (บาท) · ยอดซื้อสะสมรวม amount ของ ref ที่นับเป็นการซื้อและไม่ได้ผูก opportunity WON (ข้อ 3.3) · หมายเหตุผู้เขียน: เครื่องหมายของ REFUND ไม่กำหนดใน CANONICAL (รอยืนยัน) |
| 11 | `device_imei` | `text` | NULL | – | – | **pii** | IMEI 15 หลัก · anonymize ล้างค่า (ข้อ 10.4) |
| 12 | `device_serial` | `text` | NULL | – | – | **pii** | Serial number ของเครื่อง · anonymize ล้างค่า |
| 13 | `summary` | `jsonb` | NULL | – | – | **pii** | สรุปธุรกรรม (jsonb object) · anonymize ล้างค่า |
| 14 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 15 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 16 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 17 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `transaction_refs_pkey` | `PRIMARY KEY (id)` |
| `transaction_refs_source_external_uq` | `UNIQUE (source_system_code, external_no)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `transaction_refs_external_no_chk` | `CHECK ((btrim(external_no) <> ''::text))` |
| `transaction_refs_imei_chk` | `CHECK (((device_imei IS NULL) OR (device_imei ~ '^[0-9]{15}$'::text)))` |
| `transaction_refs_summary_chk` | `CHECK (((summary IS NULL) OR (jsonb_typeof(summary) = 'object'::text)))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `transaction_refs_branch_id_fkey` | `FOREIGN KEY (branch_id) REFERENCES core.branches(id)` |
| `transaction_refs_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `transaction_refs_customer_id_fkey` | `FOREIGN KEY (customer_id) REFERENCES crm.customers(id)` |
| `transaction_refs_opportunity_id_fkey` | `FOREIGN KEY (opportunity_id) REFERENCES crm.opportunities(id)` |
| `transaction_refs_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `transaction_refs_source_system_code_fkey` | `FOREIGN KEY (source_system_code) REFERENCES ref.source_systems(code)` |
| `transaction_refs_transaction_type_code_fkey` | `FOREIGN KEY (transaction_type_code) REFERENCES ref.transaction_types(code)` |
| `transaction_refs_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `transaction_refs_branch_id_idx` | `CREATE INDEX transaction_refs_branch_id_idx ON crm.transaction_refs USING btree (branch_id)` |
| `transaction_refs_created_by_idx` | `CREATE INDEX transaction_refs_created_by_idx ON crm.transaction_refs USING btree (created_by)` |
| `transaction_refs_customer_id_idx` | `CREATE INDEX transaction_refs_customer_id_idx ON crm.transaction_refs USING btree (customer_id, transacted_at DESC)` |
| `transaction_refs_device_imei_idx` | `CREATE INDEX transaction_refs_device_imei_idx ON crm.transaction_refs USING btree (device_imei) WHERE (device_imei IS NOT NULL)` |
| `transaction_refs_external_no_idx` | `CREATE INDEX transaction_refs_external_no_idx ON crm.transaction_refs USING btree (external_no)` |
| `transaction_refs_opportunity_id_idx` | `CREATE INDEX transaction_refs_opportunity_id_idx ON crm.transaction_refs USING btree (opportunity_id) WHERE (opportunity_id IS NOT NULL)` |
| `transaction_refs_pkey` | `CREATE UNIQUE INDEX transaction_refs_pkey ON crm.transaction_refs USING btree (id)` |
| `transaction_refs_source_external_uq` | `CREATE UNIQUE INDEX transaction_refs_source_external_uq ON crm.transaction_refs USING btree (source_system_code, external_no)` |
| `transaction_refs_transacted_at_idx` | `CREATE INDEX transaction_refs_transacted_at_idx ON crm.transaction_refs USING btree (transacted_at)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_link_customer_branch` | AFTER | INSERT · UPDATE OF customer_id, branch_id | ROW | `app.trg_link_customer_branch()` | – |
| `trg_refresh_lifecycle_del` | AFTER | DELETE | ROW | `app.trg_refresh_lifecycle()` | – |
| `trg_refresh_lifecycle_ins` | AFTER | INSERT | ROW | `app.trg_refresh_lifecycle()` | – |
| `trg_refresh_lifecycle_upd` | AFTER | UPDATE OF customer_id, transaction_type_code, opportunity_id | ROW | `app.trg_refresh_lifecycle()` | – |
| `trg_touch_customer_activity` | AFTER | INSERT · DELETE · UPDATE | ROW | `app.trg_touch_customer_activity()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`transaction_refs_insert`** — INSERT · PERMISSIVE · role `authenticated`

  WITH CHECK

  ```sql
  ((source_system_code = 'MANUAL'::text) AND (customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids)) AND (((opportunity_id IS NOT NULL) AND (opportunity_id IN ( SELECT x.id
     FROM crm.opportunities x
    WHERE ((x.branch_id = transaction_refs.branch_id) AND (x.customer_id = transaction_refs.customer_id) AND ((x.branch_id = ANY (( SELECT app.scope_branch_ids('transaction.link'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((x.branch_id, x.owner_staff_id) IN ( SELECT tp.branch_id,
              tp.staff_id
             FROM app.team_scope_pairs('transaction.link'::text) tp(branch_id, staff_id))) OR ((x.branch_id = ANY (( SELECT app.scope_branch_ids('transaction.link'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(x.owner_staff_id, x.created_by) = ( SELECT app.current_staff_id() AS current_staff_id)))))))) OR ((opportunity_id IS NULL) AND ((branch_id = ANY (( SELECT app.scope_branch_ids('transaction.link'::text, 'ORGANIZATION'::core.data_scope) AS scope_branch_ids)::uuid[])) OR (((EXISTS ( SELECT 1
     FROM crm.customer_branches cb
    WHERE ((cb.customer_id = transaction_refs.customer_id) AND (cb.branch_id = transaction_refs.branch_id)))) OR (EXISTS ( SELECT 1
     FROM crm.customers c
    WHERE ((c.id = transaction_refs.customer_id) AND (c.first_branch_id = transaction_refs.branch_id))))) AND ((branch_id = ANY (( SELECT app.scope_branch_ids('transaction.link'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, ( SELECT c.owner_staff_id
     FROM crm.customers c
    WHERE (c.id = transaction_refs.customer_id))) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('transaction.link'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('transaction.link'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (( SELECT c.owner_staff_id
     FROM crm.customers c
    WHERE (c.id = transaction_refs.customer_id)) = ( SELECT app.current_staff_id() AS current_staff_id)))))))))
  ```

- **`transaction_refs_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((branch_id = ANY (( SELECT app.scope_branch_ids('transaction.read'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('transaction.read'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (created_by = ( SELECT app.current_staff_id() AS current_staff_id))) OR (customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids)))
  ```

#### `crm.visits`

การมาติดต่อ 1 ครั้ง ทุกช่องทาง (ข้อ 3.1 · 3.3 · D1) ไม่จำเป็นต้องรู้ตัวตน · สร้างได้ผ่าน api.open_visit / api.quick_capture เท่านั้น ปิดผ่าน api.close_visit (authenticated ไม่มี INSERT ข้อ 9.4 กติกา 6) · visit ที่ไม่ใช่ CANCELLED มี interaction ต้นทาง 1 รายการ (is_visit_root) · Visitor/Traffic = count ที่ status <> CANCELLED ตาม started_at (party_size ใช้แสดงเท่านั้น) · branch_id เปลี่ยนไม่ได้ · การเปลี่ยนสถานะที่อนุญาต (ข้อ 4.1): WAITING→IN_SERVICE · WAITING→LEFT · IN_SERVICE→COMPLETED · WAITING/IN_SERVICE→CANCELLED (บังคับใน app.enforce_row_transition)

**RLS:** เปิด · **policy:** 2 · **index:** 10 · **trigger:** 8

**GRANT (ทั้งตาราง):** `authenticated` = SELECT

**GRANT ระดับคอลัมน์:**

| role | สิทธิ์ | คอลัมน์ |
|---|---|---|
| `authenticated` | UPDATE | `cancel_reason` · `customer_id` · `interest_code` · `owner_staff_id` · `party_size` · `source_code` · `status` |

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `visit_no` | `text` | NOT NULL | – | – |  | เลข visit V-{branch}-{YYMMDD}-{NNN} ตัวนับ VISIT:{branch}:{YYYYMMDD} ทุกช่องทาง · วันจาก started_at Asia/Bangkok (ข้อ 6.1) |
| 4 | `branch_id` | `uuid` | NOT NULL | – | `core.branches(id)` |  | สาขาของ visit (บังคับ · เปลี่ยนไม่ได้ ข้อ 4.1) · รายการออนไลน์ที่ยังไม่มอบสาขาอยู่ที่ JPON |
| 5 | `team_id` | `uuid` | NULL | – | `core.teams(id)` |  | ทีมของผู้รับ ณ ตอนรับ (snapshot ใช้แสดง/รายงาน ข้อ 7.1) |
| 6 | `channel_code` | `text` | NOT NULL | – | `ref.channels(code)` |  | ช่องทางของการมาติดต่อ (ref.channels) · Walk-in Visit = WALK_IN |
| 7 | `status` | `crm.visit_status` | NOT NULL | `'WAITING'::crm.visit_status` | – |  | WAITING · IN_SERVICE · COMPLETED · LEFT · CANCELLED (ข้อ 4.1) |
| 8 | `queue_no` | `integer` | NULL | – | – |  | เลขคิวหน้าร้าน (เฉพาะ WALK_IN) ตัวนับ QUEUE:{branch}:{YYYYMMDD} แยกจาก visit_no (สองเลขไม่จำเป็นต้องเท่ากัน) · แสดง "คิว " \|\| lpad(queue_no::text, 3, '0') |
| 9 | `party_size` | `integer` | NOT NULL | `1` | – |  | จำนวนคนที่มาด้วยกัน ≥ 1 (stepper หน้า 07) · ใช้แสดงเท่านั้น ไม่ใช้นับ KPI |
| 10 | `customer_id` | `uuid` | NULL | – | `crm.customers(id)` |  | ลูกค้าที่ระบุตัวตนได้ · NULL = ยังไม่รู้ตัวตน · Identified Visit = customer_id IS NOT NULL |
| 11 | `interest_code` | `text` | NULL | – | `ref.interest_types(code)` |  | วัตถุประสงค์หลัก (ชิป 7 ค่า) · บังคับเมื่อ WALK_IN |
| 12 | `source_code` | `text` | NULL | – | `ref.sources(code)` |  | รู้จักร้านจาก (ref.sources) · ไม่บังคับ |
| 13 | `started_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | เวลาเข้าคิว (walk-in) หรือข้อความแรก (ออนไลน์) · ฐานของการนับ VISITS และวันของ visit_no/queue_no |
| 14 | `service_started_at` | `timestamp with time zone` | NULL | – | – |  | เวลาเริ่มให้บริการ (WAITING → IN_SERVICE ตั้ง now() · visit ที่เริ่ม IN_SERVICE = started_at) |
| 15 | `ended_at` | `timestamp with time zone` | NULL | – | – |  | เวลาปิด visit · job ปิดอัตโนมัติตั้ง 23:59:59 ของวันธุรกิจนั้น (ข้อ 4.1) |
| 16 | `owner_staff_id` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | ผู้รับ (ว่างได้เมื่อ WAITING) · มิติ "พนักงาน" ของ VISITS (ข้อ 12.4) |
| 17 | `outcome_code` | `text` | NULL | – | `ref.visit_outcomes(code)` |  | ผลการให้บริการ (ref.visit_outcomes) บังคับเมื่อ COMPLETED/LEFT · ตั้งผ่าน api.close_visit เท่านั้น (คอลัมน์ระบบ ข้อ 9.4) · แก้ได้ภายในวันธุรกิจเดียวกัน |
| 18 | `cancel_reason` | `text` | NULL | – | – |  | เหตุผลการยกเลิก (บังคับเมื่อ CANCELLED · สร้างผิด) |
| 19 | `closed_by_system` | `boolean` | NOT NULL | `false` | – |  | true = ปิดโดย app.job_close_stale_visits (COMPLETED + UNRECORDED) |
| 20 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 21 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 22 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 23 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 24 | `unrecorded_ack_by` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | – |
| 25 | `unrecorded_ack_at` | `timestamp with time zone` | NULL | – | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `visits_pkey` | `PRIMARY KEY (id)` |
| `visits_id_branch_uq` | `UNIQUE (id, branch_id)` |
| `visits_visit_no_key` | `UNIQUE (visit_no)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `visits_cancel_reason_chk` | `CHECK ((((status = 'CANCELLED'::crm.visit_status) = (cancel_reason IS NOT NULL)) AND ((cancel_reason IS NULL) OR (btrim(cancel_reason) <> ''::text))))` |
| `visits_closed_by_system_chk` | `CHECK ((((NOT closed_by_system) OR (status = 'COMPLETED'::crm.visit_status)) AND ((outcome_code IS DISTINCT FROM 'UNRECORDED'::text) OR closed_by_system)))` |
| `visits_ended_chk` | `CHECK ((((status <> ALL (ARRAY['COMPLETED'::crm.visit_status, 'LEFT'::crm.visit_status])) OR (ended_at IS NOT NULL)) AND ((status <> ALL (ARRAY['WAITING'::crm.visit_status, 'IN_SERVICE'::crm.visit_status])) OR (ended_at IS NULL))))` |
| `visits_in_service_chk` | `CHECK (((status <> 'IN_SERVICE'::crm.visit_status) OR ((owner_staff_id IS NOT NULL) AND (service_started_at IS NOT NULL))))` |
| `visits_left_outcome_chk` | `CHECK (((status = 'LEFT'::crm.visit_status) = (NOT (outcome_code IS DISTINCT FROM 'LEFT_BEFORE_SERVICE'::text))))` |
| `visits_outcome_chk` | `CHECK (((status = ANY (ARRAY['COMPLETED'::crm.visit_status, 'LEFT'::crm.visit_status])) = (outcome_code IS NOT NULL)))` |
| `visits_outcome_customer_chk` | `CHECK (((outcome_code IS NULL) OR (outcome_code <> ALL (ARRAY['PURCHASED'::text, 'FOLLOW_UP'::text])) OR (customer_id IS NOT NULL)))` |
| `visits_party_size_chk` | `CHECK ((party_size >= 1))` |
| `visits_queue_no_chk` | `CHECK ((((channel_code = 'WALK_IN'::text) = (queue_no IS NOT NULL)) AND ((queue_no IS NULL) OR (queue_no >= 1))))` |
| `visits_time_order_chk` | `CHECK ((((service_started_at IS NULL) OR (service_started_at >= started_at)) AND ((ended_at IS NULL) OR (ended_at >= started_at))))` |
| `visits_unrecorded_ack_chk` | `CHECK ((((unrecorded_ack_by IS NULL) = (unrecorded_ack_at IS NULL)) AND ((unrecorded_ack_by IS NULL) OR (outcome_code = 'UNRECORDED'::text))))` |
| `visits_visit_no_chk` | `CHECK ((visit_no ~ '^V-[A-Z0-9]+-[0-9]{6}-[0-9]{3,}$'::text))` |
| `visits_waiting_chk` | `CHECK (((status <> 'WAITING'::crm.visit_status) OR ((channel_code = 'WALK_IN'::text) AND (owner_staff_id IS NULL) AND (service_started_at IS NULL))))` |
| `visits_walk_in_interest_chk` | `CHECK (((channel_code <> 'WALK_IN'::text) OR (interest_code IS NOT NULL)))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `visits_branch_id_fkey` | `FOREIGN KEY (branch_id) REFERENCES core.branches(id)` |
| `visits_channel_code_fkey` | `FOREIGN KEY (channel_code) REFERENCES ref.channels(code)` |
| `visits_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `visits_customer_id_fkey` | `FOREIGN KEY (customer_id) REFERENCES crm.customers(id)` |
| `visits_interest_code_fkey` | `FOREIGN KEY (interest_code) REFERENCES ref.interest_types(code)` |
| `visits_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `visits_outcome_code_fkey` | `FOREIGN KEY (outcome_code) REFERENCES ref.visit_outcomes(code)` |
| `visits_owner_staff_id_fkey` | `FOREIGN KEY (owner_staff_id) REFERENCES core.staff_profiles(id)` |
| `visits_source_code_fkey` | `FOREIGN KEY (source_code) REFERENCES ref.sources(code)` |
| `visits_team_id_fkey` | `FOREIGN KEY (team_id) REFERENCES core.teams(id)` |
| `visits_unrecorded_ack_by_fkey` | `FOREIGN KEY (unrecorded_ack_by) REFERENCES core.staff_profiles(id)` |
| `visits_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `visits_branch_id_idx` | `CREATE INDEX visits_branch_id_idx ON crm.visits USING btree (branch_id)` |
| `visits_branch_started_idx` | `CREATE INDEX visits_branch_started_idx ON crm.visits USING btree (branch_id, started_at)` |
| `visits_customer_id_idx` | `CREATE INDEX visits_customer_id_idx ON crm.visits USING btree (customer_id)` |
| `visits_id_branch_uq` | `CREATE UNIQUE INDEX visits_id_branch_uq ON crm.visits USING btree (id, branch_id)` |
| `visits_open_idx` | `CREATE INDEX visits_open_idx ON crm.visits USING btree (branch_id, started_at) WHERE (status = ANY (ARRAY['WAITING'::crm.visit_status, 'IN_SERVICE'::crm.visit_status]))` |
| `visits_owner_staff_id_idx` | `CREATE INDEX visits_owner_staff_id_idx ON crm.visits USING btree (owner_staff_id)` |
| `visits_pkey` | `CREATE UNIQUE INDEX visits_pkey ON crm.visits USING btree (id)` |
| `visits_queue_no_day_uidx` | `CREATE UNIQUE INDEX visits_queue_no_day_uidx ON crm.visits USING btree (branch_id, app.bangkok_date(started_at), queue_no) WHERE (queue_no IS NOT NULL)` |
| `visits_started_at_idx` | `CREATE INDEX visits_started_at_idx ON crm.visits USING btree (started_at)` |
| `visits_visit_no_key` | `CREATE UNIQUE INDEX visits_visit_no_key ON crm.visits USING btree (visit_no)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_05_running_number` | BEFORE | INSERT | ROW | `app.trg_assign_running_number()` | – |
| `trg_10_enforce_transition` | BEFORE | INSERT · UPDATE | ROW | `app.enforce_row_transition()` | – |
| `trg_30_row_defaults` | BEFORE | INSERT · UPDATE | ROW | `app.trg_row_defaults()` | – |
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_audit_row_change` | AFTER | INSERT · DELETE · UPDATE | ROW | `audit.log_row_change()` | – |
| `trg_link_customer_branch` | AFTER | INSERT · UPDATE OF customer_id, branch_id | ROW | `app.trg_link_customer_branch()` | – |
| `trg_touch_customer_activity` | AFTER | INSERT · DELETE · UPDATE | ROW | `app.trg_touch_customer_activity()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:**

- **`visits_select`** — SELECT · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((branch_id = ANY (( SELECT app.scope_branch_ids('visit.read'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, owner_staff_id) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('visit.read'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('visit.read'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(owner_staff_id, created_by) = ( SELECT app.current_staff_id() AS current_staff_id))) OR (customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids)))
  ```

- **`visits_update`** — UPDATE · PERMISSIVE · role `authenticated`

  USING

  ```sql
  ((branch_id = ANY (( SELECT app.scope_branch_ids('visit.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, owner_staff_id) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('visit.update'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('visit.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(owner_staff_id, created_by) = ( SELECT app.current_staff_id() AS current_staff_id))) OR ((status = 'WAITING'::crm.visit_status) AND (owner_staff_id IS NULL) AND (branch_id = ANY (( SELECT app.scope_branch_ids('visit.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[]))))
  ```

  WITH CHECK

  ```sql
  (((branch_id = ANY (( SELECT app.scope_branch_ids('visit.update'::text, 'BRANCH'::core.data_scope) AS scope_branch_ids)::uuid[])) OR ((branch_id, owner_staff_id) IN ( SELECT tp.branch_id,
      tp.staff_id
     FROM app.team_scope_pairs('visit.update'::text) tp(branch_id, staff_id))) OR ((branch_id = ANY (( SELECT app.scope_branch_ids('visit.update'::text, 'OWN'::core.data_scope) AS scope_branch_ids)::uuid[])) AND (COALESCE(owner_staff_id, created_by) = ( SELECT app.current_staff_id() AS current_staff_id)))) AND ((customer_id IS NULL) OR (customer_id IN ( SELECT app.readable_customer_ids() AS readable_customer_ids))))
  ```

### 4.4 schema `app` — 3 ตาราง

> helper ตรวจสิทธิ์ · trigger · งานตามเวลา · settings · running numbers · ไม่เปิดผ่าน Data API · authenticated ได้ EXECUTE เฉพาะ helper ข้อ 9.3

[`app.rate_limit_counters`](#app-rate_limit_counters) · [`app.running_numbers`](#app-running_numbers) · [`app.settings`](#app-settings)

#### `app.rate_limit_counters`

ตัวนับอัตราการใช้งานต่อผู้ใช้ต่อช่วงเวลา (ข้อ 6.4 · 6.5 · 6.6 · 11.2) · เขียน/อ่านโดย app.rate_limit_hit ใน RPC SECURITY DEFINER เท่านั้น · เวลาใช้ now() เสมอ (เป็นการตัดสินสิทธิ์ ข้อ 1.2 ไม่ใช้ app.clock()) · หมายเหตุผู้เขียน: โครงคอลัมน์ไม่ได้ระบุใน CANONICAL ผู้เขียนออกแบบ

**RLS:** เปิด · **policy:** 0 · **index:** 1 · **trigger:** 1

**GRANT (ทั้งตาราง):** **ไม่มี** — เขียน/อ่านผ่าน trigger หรือ RPC `SECURITY DEFINER` เท่านั้น

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `staff_id` | `uuid` | NOT NULL | – | `core.staff_profiles(id)` |  | ผู้ใช้ที่ถูกนับ (core.staff_profiles.id) |
| 2 | `counter_key` | `text` | NOT NULL | – | – |  | ชื่อตัวนับ · ข้อตกลง: ใช้ key ของ app.settings ที่กำหนดเพดานนั้น เช่น security.reveal_per_hour · security.search_per_hour · security.search_miss_per_hour · security.link_per_day · security.customer_view_per_hour |
| 3 | `window_start` | `timestamp with time zone` | NOT NULL | – | – |  | จุดเริ่มช่วงนับ: ต้นชั่วโมง (date_trunc('hour', now())) สำหรับ *_per_hour · 00:00 Asia/Bangkok ของวันนั้นสำหรับ *_per_day |
| 4 | `hit_count` | `integer` | NOT NULL | `0` | – |  | จำนวนครั้งในช่วงนี้ |
| 5 | `blocked_until` | `timestamp with time zone` | NULL | – | – |  | ถ้าไม่ว่างและ > now() = ผู้ใช้ถูกบล็อกสำหรับตัวนับนี้ถึงเวลานี้ (เช่น ค้นด้วยตัวระบุไม่พบผลเกินเกณฑ์ → บล็อก 1 ชม. ข้อ 6.5) |
| 6 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 7 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `rate_limit_counters_pkey` | `PRIMARY KEY (staff_id, counter_key, window_start)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `rate_limit_counters_hit_count_chk` | `CHECK ((hit_count >= 0))` |
| `rate_limit_counters_key_chk` | `CHECK ((counter_key ~ '^[A-Za-z0-9_.:-]+$'::text))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `rate_limit_counters_staff_id_fkey` | `FOREIGN KEY (staff_id) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `rate_limit_counters_pkey` | `CREATE UNIQUE INDEX rate_limit_counters_pkey ON app.rate_limit_counters USING btree (staff_id, counter_key, window_start)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:** ไม่มี → ไม่มี role ใดเห็น/เขียนแถวได้ (เข้าถึงผ่าน RPC `SECURITY DEFINER` เท่านั้น)

#### `app.running_numbers`

ตัวนับเลขอ้างอิง (ข้อ 6.1) · เขียนโดย app.trg_assign_running_number (BEFORE INSERT · SECURITY DEFINER) ด้วย upsert INSERT … ON CONFLICT (scope_key) DO UPDATE SET last_value = app.running_numbers.last_value + 1 RETURNING last_value · แถวที่ล็อกจาก upsert ทำให้เลขไม่ซ้ำภายใต้การทำงานพร้อมกัน · seed ต้องตั้งค่าให้ตรงข้อ 13.0 ข้อ 8

**RLS:** เปิด · **policy:** 0 · **index:** 1 · **trigger:** 1

**GRANT (ทั้งตาราง):** **ไม่มี** — เขียน/อ่านผ่าน trigger หรือ RPC `SECURITY DEFINER` เท่านั้น

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `scope_key` | `text` | NOT NULL | – | – |  | ขอบเขตตัวนับ: CUS:{YYYY} · LD:{YYYY} · OP:{YYYY} · QT:{YYYY} · TK:{YYYY} · EX:{YYYY} · MG:{YYYY} · DSR:{YYYY} · RG:{YYYY} · ST · VISIT:{branch_code}:{YYYYMMDD} · QUEUE:{branch_code}:{YYYYMMDD} · ปี/วันคิดจาก created_at (visit: started_at) AT TIME ZONE 'Asia/Bangkok' · ปี ค.ศ. |
| 2 | `last_value` | `bigint` | NOT NULL | – | – |  | เลขล่าสุดที่ออกไปแล้วในขอบเขตนี้ (เลขถัดไป = last_value + 1) |
| 3 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `running_numbers_pkey` | `PRIMARY KEY (scope_key)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `running_numbers_last_value_chk` | `CHECK ((last_value >= 0))` |
| `running_numbers_scope_key_chk` | `CHECK (((scope_key ~ '^(CUS\|LD\|OP\|QT\|TK\|EX\|MG\|DSR\|RG):[0-9]{4}$'::text) OR (scope_key = 'ST'::text) OR (scope_key ~ '^(VISIT\|QUEUE):[A-Z0-9_-]+:[0-9]{8}$'::text)))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `running_numbers_pkey` | `CREATE UNIQUE INDEX running_numbers_pkey ON app.running_numbers USING btree (scope_key)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:** ไม่มี → ไม่มี role ใดเห็น/เขียนแถวได้ (เข้าถึงผ่าน RPC `SECURITY DEFINER` เท่านั้น)

#### `app.settings`

ค่าตั้งของระบบแบบ key → jsonb (ข้อ 11.2 · ค่าเริ่มต้น [รอยืนยัน]) · แก้ผ่าน api.update_setting(p_key, p_value) เท่านั้น โดยตรวจสิทธิ์ตาม editable_by · ไม่มี GRANT ให้ authenticated (อ่านผ่าน app.clock() หรือ RPC)

**RLS:** เปิด · **policy:** 0 · **index:** 1 · **trigger:** 1

**GRANT (ทั้งตาราง):** **ไม่มี** — เขียน/อ่านผ่าน trigger หรือ RPC `SECURITY DEFINER` เท่านั้น

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `key` | `text` | NOT NULL | – | – |  | ชื่อค่าตั้ง เช่น env · clock · sla.lead_unassigned_min (ตัวพิมพ์เล็ก คั่นกลุ่มด้วยจุด) |
| 2 | `value` | `jsonb` | NOT NULL | – | – |  | ค่าเป็น jsonb เสมอ: ตัวเลข = number · เวลา "HH:MM" = string · ช่วงยกระดับ = array · env = string ("dev"/"staging"/"prod") · clock = {"as_of": null \| "ISO-8601 พร้อม offset"} (CHECK บังคับให้มี offset เพื่อไม่พึ่ง session TimeZone) |
| 3 | `editable_by` | `text` | NOT NULL | – | `core.permissions(code)` |  | รหัสสิทธิ์ที่แก้ค่านี้ได้: settings.system (SYSTEM_ADMIN · ค่าเชิงเทคนิค) หรือ settings.business (BUSINESS_ADMIN · เกณฑ์ธุรกิจ) |
| 4 | `updated_by` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | staff ที่แก้ล่าสุด (core.staff_profiles.id) · NULL = ค่าจาก migration/seed |
| 5 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `settings_pkey` | `PRIMARY KEY (key)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `settings_clock_value_chk` | `CHECK (((key <> 'clock'::text) OR ((jsonb_typeof(value) = 'object'::text) AND ((value -> 'as_of'::text) IS NOT NULL) AND ((jsonb_typeof((value -> 'as_of'::text)) = 'null'::text) OR ((jsonb_typeof((value -> 'as_of'::text)) = 'string'::text) AND ((value ->> 'as_of'::text) ~ '(Z\|[+-][0-9]{2}(:?[0-9]{2})?)$'::text))))))` |
| `settings_editable_by_chk` | `CHECK ((editable_by = ANY (ARRAY['settings.system'::text, 'settings.business'::text])))` |
| `settings_env_value_chk` | `CHECK (((key <> 'env'::text) OR ((jsonb_typeof(value) = 'string'::text) AND ((value #>> '{}'::text[]) = ANY (ARRAY['dev'::text, 'staging'::text, 'prod'::text])))))` |
| `settings_key_format_chk` | `CHECK ((key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'::text))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `settings_editable_by_fkey` | `FOREIGN KEY (editable_by) REFERENCES core.permissions(code)` |
| `settings_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `settings_pkey` | `CREATE UNIQUE INDEX settings_pkey ON app.settings USING btree (key)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

**Policy:** ไม่มี → ไม่มี role ใดเห็น/เขียนแถวได้ (เข้าถึงผ่าน RPC `SECURITY DEFINER` เท่านั้น)

### 4.5 schema `audit` — 5 ตาราง

> audit_logs · access_logs · login_events · export_requests · integration_logs · ไม่เปิดผ่าน Data API · ไม่มี GRANT ให้ authenticated

[`audit.access_logs`](#audit-access_logs) · [`audit.audit_logs`](#audit-audit_logs) · [`audit.export_requests`](#audit-export_requests) · [`audit.integration_logs`](#audit-integration_logs) · [`audit.login_events`](#audit-login_events)

#### `audit.access_logs`

บันทึกการเข้าถึงข้อมูลลูกค้า append-only (ข้อ 9.5): CUSTOMER_VIEWED (api.get_customer_360) · CONTACT_REVEALED (api.reveal_contact เขียนก่อนคืนค่า) · CUSTOMER_CANDIDATE_SEARCH · CUSTOMER_SEARCH · CUSTOMER_LINKED_TO_BRANCH · ไม่เก็บค่า PII (เก็บ contact_id/hash) · เป็นฐานของตัวนับอัตรา security.* · เก็บ 1 ปี · หมายเหตุผู้เขียน: CANONICAL ระบุเฉพาะ action และ "เก็บ contact_id/hash" ผู้เขียนออกแบบคอลัมน์อื่นให้สอดคล้อง audit_logs

**RLS:** ปิด (ไม่ต้องเปิดตามข้อ 9.4 กติกา 1 — คุมด้วย GRANT) · **policy:** 0 · **index:** 4 · **trigger:** 2

**GRANT (ทั้งตาราง):** `audit_retention` = SELECT, DELETE

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `bigint` | NOT NULL | `GENERATED ALWAYS AS IDENTITY` | – |  | – |
| 2 | `occurred_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 3 | `organization_id` | `uuid` | NULL | – | – |  | – |
| 4 | `actor_staff_id` | `uuid` | NULL | – | – |  | – |
| 5 | `actor_staff_code` | `text` | NULL | – | – |  | – |
| 6 | `actor_roles` | `text[]` | NOT NULL | `'{}'::text[]` | – |  | – |
| 7 | `aal` | `text` | NULL | – | – |  | – |
| 8 | `action` | `text` | NOT NULL | – | – |  | CUSTOMER_VIEWED · CONTACT_REVEALED · CUSTOMER_CANDIDATE_SEARCH · CUSTOMER_SEARCH · CUSTOMER_LINKED_TO_BRANCH |
| 9 | `customer_id` | `uuid` | NULL | – | – |  | ลูกค้าที่ถูกเข้าถึง/ผูก (ถ้ามี) |
| 10 | `contact_id` | `uuid` | NULL | – | – |  | crm.customer_contacts.id ที่ถูกเปิดค่าเต็ม (บังคับเมื่อ CONTACT_REVEALED) |
| 11 | `visit_id` | `uuid` | NULL | – | – |  | visit ที่ใช้ตรวจซ้ำ/ผูกสาขา (CUSTOMER_CANDIDATE_SEARCH · CUSTOMER_LINKED_TO_BRANCH) |
| 12 | `branch_id` | `uuid` | NULL | – | – |  | สาขาที่เกี่ยวข้อง (เช่น สาขาที่ผูก) |
| 13 | `purpose` | `text` | NULL | – | – |  | VIEW · CALL · COPY · LINE_OPEN (บังคับเมื่อ CONTACT_REVEALED) |
| 14 | `search_hashes` | `text[]` | NULL | – | – |  | sha256 hex ของค่า normalized ที่ใช้ค้น (เบอร์/LINE/อีเมล/IMEI) · ห้ามเก็บค่าจริงหรือคำค้นชื่อ |
| 15 | `result_count` | `integer` | NULL | – | – |  | จำนวนผลลัพธ์ (0 = ค้นไม่พบ · ใช้นับ security.search_miss_per_hour) |
| 16 | `detail` | `jsonb` | NULL | – | – |  | ข้อมูลประกอบที่ไม่มี PII เช่น {"scores":[100,40]} |
| 17 | `ip` | `text` | NULL | – | – |  | – |
| 18 | `user_agent` | `text` | NULL | – | – |  | – |
| 19 | `device_id` | `text` | NULL | – | – |  | – |
| 20 | `request_id` | `text` | NULL | – | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `access_logs_pkey` | `PRIMARY KEY (id)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `access_logs_aal_chk` | `CHECK (((aal IS NULL) OR (aal = ANY (ARRAY['aal1'::text, 'aal2'::text]))))` |
| `access_logs_action_chk` | `CHECK ((action = ANY (ARRAY['CUSTOMER_VIEWED'::text, 'CONTACT_REVEALED'::text, 'CUSTOMER_CANDIDATE_SEARCH'::text, 'CUSTOMER_SEARCH'::text, 'CUSTOMER_LINKED_TO_BRANCH'::text])))` |
| `access_logs_count_chk` | `CHECK (((result_count IS NULL) OR (result_count >= 0)))` |
| `access_logs_hashes_chk` | `CHECK (((search_hashes IS NULL) OR (cardinality(search_hashes) = 0) OR (array_to_string(search_hashes, ','::text) ~ '^[0-9a-f]{64}(,[0-9a-f]{64})*$'::text)))` |
| `access_logs_purpose_chk` | `CHECK (((purpose IS NULL) OR (purpose = ANY (ARRAY['VIEW'::text, 'CALL'::text, 'COPY'::text, 'LINE_OPEN'::text]))))` |
| `access_logs_reveal_chk` | `CHECK (((action <> 'CONTACT_REVEALED'::text) OR ((contact_id IS NOT NULL) AND (purpose IS NOT NULL))))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `access_logs_actor_idx` | `CREATE INDEX access_logs_actor_idx ON audit.access_logs USING btree (actor_staff_id, action, occurred_at)` |
| `access_logs_customer_idx` | `CREATE INDEX access_logs_customer_idx ON audit.access_logs USING btree (customer_id, occurred_at) WHERE (customer_id IS NOT NULL)` |
| `access_logs_occurred_at_idx` | `CREATE INDEX access_logs_occurred_at_idx ON audit.access_logs USING btree (occurred_at)` |
| `access_logs_pkey` | `CREATE UNIQUE INDEX access_logs_pkey ON audit.access_logs USING btree (id)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_deny_change` | BEFORE | DELETE · UPDATE | ROW | `audit.deny_change()` | – |
| `trg_deny_truncate` | BEFORE | TRUNCATE | STATEMENT | `audit.deny_change()` | – |

#### `audit.audit_logs`

บันทึกการเปลี่ยนแปลงข้อมูลธุรกิจ append-only (ข้อ 9.5 · A32 · B21) · เขียนโดย audit.log_row_change() และ RPC (action เชิงความหมาย เช่น EXPORT_REQUESTED · SETTINGS_UPDATED) · อ่านผ่าน api.search_audit (audit.read) · api.get_entity_history (customer.update บนลูกค้า) · api.search_security_log (security_log.read) เท่านั้น · เก็บ 5 ปี ลบโดย role audit_retention (ข้อ 10.3) · หมายเหตุผู้เขียน: ไม่มี FK ไปตารางอื่นเพื่อให้ log คงอยู่อิสระจากข้อมูลต้นทาง

**RLS:** ปิด (ไม่ต้องเปิดตามข้อ 9.4 กติกา 1 — คุมด้วย GRANT) · **policy:** 0 · **index:** 6 · **trigger:** 2

**GRANT (ทั้งตาราง):** `audit_retention` = SELECT, DELETE

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `bigint` | NOT NULL | `GENERATED ALWAYS AS IDENTITY` | – |  | – |
| 2 | `occurred_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | เวลาที่บันทึก (now() ของทรานแซกชัน) |
| 3 | `organization_id` | `uuid` | NULL | – | – |  | องค์กรของแถวที่เปลี่ยน (หรือของผู้กระทำ เมื่อแถวไม่มี organization_id เช่น ref.*) |
| 4 | `actor_type` | `audit.actor_type` | NOT NULL | – | – |  | STAFF (app.current_staff_id() ไม่ว่าง) · SYSTEM (งานตามเวลา/สคริปต์) · INTEGRATION · กำหนดทับได้ด้วย set_config('app.actor_type', …, true) |
| 5 | `actor_staff_id` | `uuid` | NULL | – | – |  | staff ผู้กระทำ (บังคับเมื่อ actor_type = STAFF) |
| 6 | `actor_staff_code` | `text` | NULL | – | – |  | ST-NNNN ของผู้กระทำ ณ เวลาบันทึก |
| 7 | `actor_label` | `text` | NULL | – | – |  | ป้ายผู้กระทำ เช่น "คุณขวัญ" · "SYSTEM:close_stale_visits" (งานระบบตั้ง app.actor_label) |
| 8 | `actor_roles` | `text[]` | NOT NULL | `'{}'::text[]` | – |  | รหัสบทบาทที่ผู้กระทำถืออยู่ ณ เวลาบันทึก (assignment ที่ valid_from ≤ now() < valid_to) |
| 9 | `aal` | `text` | NULL | – | – |  | aal ของ JWT (aal1/aal2) · NULL = ไม่มี JWT |
| 10 | `action` | `text` | NOT NULL | – | – |  | {ENTITY}_{VERB} (ข้อ 9.5) · trigger ใช้ {ENTITY}_CREATED/_UPDATED/_DELETED และชื่อเชิงความหมาย: CUSTOMER_MERGED · CUSTOMER_ANONYMIZED · CUSTOMER_TAG_REMOVED · CONSENT_RECORDED · LEAD_ASSIGNED · OPPORTUNITY_ASSIGNED · TASK_ASSIGNED · OPPORTUNITY_WON · ROLE_GRANTED · ROLE_REVOKED · ROLE_GRANT_REQUESTED · ROLE_GRANT_DECIDED · PERMISSION_CHANGED · STAFF_INVITED · STAFF_UPDATED · STAFF_DISABLED · DSR_CREATED · DSR_COMPLETED |
| 11 | `entity_type` | `text` | NULL | – | – |  | ชื่อตารางเต็ม schema.table เช่น crm.customer_contacts · security_log.read ไม่คืนแถวที่ entity_type เป็นตารางลูกค้า (crm.customer%) |
| 12 | `entity_id` | `text` | NULL | – | – |  | id ของแถว (text: uuid หรือ code ของ ref หรือ role_code:permission_code) |
| 13 | `entity_ref` | `text` | NULL | – | – |  | เลขอ้างอิงที่แสดง: เลขของแถวเอง (CUS-/LD-/OP-/QT-/TK-/V-/RG-/DSR-/MG-/EX-/ST-) มิฉะนั้นเลขของแถวแม่ (ลูกค้า · visit · lead · opportunity · quotation · task · staff) หรือ code |
| 14 | `branch_id` | `uuid` | NULL | – | – |  | สาขาของแถว (ถ้ามีคอลัมน์ branch_id) |
| 15 | `before` | `jsonb` | NULL | – | – |  | ภาพแถวก่อนเปลี่ยน (UPDATE/DELETE) ทั้งแถว · คอลัมน์ pii เป็น {"masked","sha256"} · app.anonymize_customer แทนทั้งค่าเป็น "[ANONYMIZED]" ภายใต้ app.audit_redaction = on |
| 16 | `after` | `jsonb` | NULL | – | – |  | ภาพแถวหลังเปลี่ยน (INSERT/UPDATE) ทั้งแถว · กติกา pii เดียวกับ before |
| 17 | `changed_fields` | `text[]` | NULL | – | – |  | คอลัมน์ที่ค่าเปลี่ยน (UPDATE เท่านั้น · เรียงตามชื่อ) |
| 18 | `reason` | `text` | NULL | – | – |  | เหตุผลที่ RPC ส่ง (set_config('app.audit_reason', …, true)) · หมายเหตุผู้เขียน: ชื่อ setting ตั้งโดยผู้เขียน |
| 19 | `ip` | `text` | NULL | – | – |  | header x-client-ip ที่ Next.js ส่งต่อ (ค่าที่รายงาน ไม่ใช่หลักฐาน) |
| 20 | `user_agent` | `text` | NULL | – | – |  | header x-client-ua |
| 21 | `device_id` | `text` | NULL | – | – |  | header x-device-id |
| 22 | `request_id` | `text` | NULL | – | – |  | header x-request-id |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `audit_logs_pkey` | `PRIMARY KEY (id)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `audit_logs_aal_chk` | `CHECK (((aal IS NULL) OR (aal = ANY (ARRAY['aal1'::text, 'aal2'::text]))))` |
| `audit_logs_action_chk` | `CHECK ((action ~ '^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$'::text))` |
| `audit_logs_staff_actor_chk` | `CHECK (((actor_type <> 'STAFF'::audit.actor_type) OR (actor_staff_id IS NOT NULL)))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `audit_logs_action_idx` | `CREATE INDEX audit_logs_action_idx ON audit.audit_logs USING btree (action, occurred_at)` |
| `audit_logs_actor_idx` | `CREATE INDEX audit_logs_actor_idx ON audit.audit_logs USING btree (actor_staff_id, occurred_at)` |
| `audit_logs_customer_idx` | `CREATE INDEX audit_logs_customer_idx ON audit.audit_logs USING btree (COALESCE((after ->> 'customer_id'::text), (before ->> 'customer_id'::text))) WHERE (COALESCE((after ->> 'customer_id'::text), (before ->> 'customer_id'::text)) IS NOT NULL)` |
| `audit_logs_entity_idx` | `CREATE INDEX audit_logs_entity_idx ON audit.audit_logs USING btree (entity_type, entity_id, occurred_at)` |
| `audit_logs_occurred_at_idx` | `CREATE INDEX audit_logs_occurred_at_idx ON audit.audit_logs USING btree (occurred_at)` |
| `audit_logs_pkey` | `CREATE UNIQUE INDEX audit_logs_pkey ON audit.audit_logs USING btree (id)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_deny_change` | BEFORE | DELETE · UPDATE | ROW | `audit.deny_change()` | – |
| `trg_deny_truncate` | BEFORE | TRUNCATE | STATEMENT | `audit.deny_change()` | – |

#### `audit.export_requests`

คำขอส่งออกข้อมูลลูกค้า (ข้อ 8.2 · D25 export_logs) · ยื่น/ตัดสิน/ดาวน์โหลดผ่าน api.request_export · api.decide_export · api.record_export_download · สร้างไฟล์โดย generate-export → app.build_export_dataset · เพดาน/ผู้อนุมัติตาม app.settings[export.limits] ของ requested_as_role · BRANCH_MANAGER ไม่ต้องอนุมัติ (เกินเพดาน = REJECTED) · app.job_expire_exports → EXPIRED และลบไฟล์ (download_count คงไว้) · ตาราง workflow: ไม่ติด audit.deny_change · ไม่มี GRANT ให้ authenticated/service_role

**RLS:** ปิด (ไม่ต้องเปิดตามข้อ 9.4 กติกา 1 — คุมด้วย GRANT) · **policy:** 0 · **index:** 4 · **trigger:** 4

**GRANT (ทั้งตาราง):** **ไม่มี** — เขียน/อ่านผ่าน trigger หรือ RPC `SECURITY DEFINER` เท่านั้น

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `uuid` | NOT NULL | `gen_random_uuid()` | – |  | – |
| 2 | `organization_id` | `uuid` | NOT NULL | `app.current_organization_id()` | `core.organizations(id)` |  | – |
| 3 | `export_no` | `text` | NOT NULL | – | – |  | เลขคำขอ EX-{YYYY}-{NNNNNN} ตัวนับ EX:{YYYY} (ข้อ 6.1) · ใช้ในลายน้ำและชื่อไฟล์ |
| 4 | `requested_by` | `uuid` | NOT NULL | – | `core.staff_profiles(id)` |  | ผู้ขอ · ตอนสร้างไฟล์ต้องยัง ACTIVE และมี customer.export |
| 5 | `requested_as_role` | `text` | NOT NULL | – | `core.roles(code)` |  | บทบาทที่ยื่น (BRANCH_MANAGER · MARKETING · BUSINESS_ADMIN · EXECUTIVE) · กำหนดเพดาน ผู้อนุมัติ และคอลัมน์ที่ได้ |
| 6 | `requested_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 7 | `branch_ids` | `uuid[]` | NOT NULL | `'{}'::uuid[]` | – |  | ขอบเขตสาขาที่บันทึกตอนยื่น (ตรวจซ้ำตอนสร้างไฟล์) · ว่าง = ระดับองค์กร |
| 8 | `reason_code` | `text` | NOT NULL | – | `ref.export_reasons(code)` |  | เหตุผล (ref.export_reasons) · is_marketing = true → กรองเฉพาะลูกค้าที่ยินยอม MARKETING ทุกบทบาท |
| 9 | `reason_note` | `text` | NULL | – | – |  | หมายเหตุ (บังคับเมื่อ OTHER) |
| 10 | `filter` | `jsonb` | NOT NULL | `'{}'::jsonb` | – |  | ตัวกรองรายการลูกค้าที่บันทึกตอนยื่น (jsonb object) · ห้ามมีค่า PII |
| 11 | `row_count` | `integer` | NULL | – | – |  | จำนวนแถวที่คาด/ที่สร้าง (ตัวอย่าง EX-2026-000031 = 1,850) |
| 12 | `status` | `audit.export_status` | NOT NULL | `'REQUESTED'::audit.export_status` | – |  | REQUESTED · APPROVED · REJECTED · GENERATED · DOWNLOADED · EXPIRED |
| 13 | `approved_by` | `uuid` | NULL | – | `core.staff_profiles(id)` |  | ผู้ตัดสินตามกติกาผู้อนุมัติของ requested_as_role (ทั้งอนุมัติและปฏิเสธ) · ≠ requested_by · หมายเหตุผู้เขียน: ใช้คอลัมน์เดียวตามชื่อใน CHECK ของข้อ 8.2 |
| 14 | `decided_at` | `timestamp with time zone` | NULL | – | – |  | เวลาตัดสิน (อนุมัติ/ปฏิเสธ · รวมการปฏิเสธอัตโนมัติเมื่อเกินเพดาน) |
| 15 | `decision_note` | `text` | NULL | – | – |  | – |
| 16 | `generated_at` | `timestamp with time zone` | NULL | – | – |  | เวลาสร้างไฟล์ · ดาวน์โหลดได้ภายใน export.link_ttl_hours (24) ชม. หลังเวลานี้ |
| 17 | `file_path` | `text` | NULL | – | – |  | path ใน Supabase Storage bucket private (signed URL 60 วินาที) |
| 18 | `file_deleted_at` | `timestamp with time zone` | NULL | – | – |  | เวลาที่ลบไฟล์แล้ว |
| 19 | `download_count` | `integer` | NOT NULL | `0` | – |  | จำนวนครั้งดาวน์โหลด (< export.max_downloads (3) จึงดาวน์โหลดได้อีก) · คงไว้หลัง EXPIRED |
| 20 | `last_downloaded_at` | `timestamp with time zone` | NULL | – | – |  | – |
| 21 | `expired_at` | `timestamp with time zone` | NULL | – | – |  | เวลาที่เปลี่ยนเป็น EXPIRED |
| 22 | `created_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 23 | `created_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |
| 24 | `updated_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 25 | `updated_by` | `uuid` | NULL | `app.current_staff_id()` | `core.staff_profiles(id)` |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `export_requests_pkey` | `PRIMARY KEY (id)` |
| `export_requests_export_no_key` | `UNIQUE (export_no)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `export_requests_approver_chk` | `CHECK ((approved_by <> requested_by))` |
| `export_requests_decided_chk` | `CHECK ((((approved_by IS NULL) OR (decided_at IS NOT NULL)) AND ((status <> 'APPROVED'::audit.export_status) OR (approved_by IS NOT NULL) OR (requested_as_role = 'BRANCH_MANAGER'::text)) AND ((status <> 'REJECTED'::audit.export_status) OR (decided_at IS NOT NULL))))` |
| `export_requests_download_count_chk` | `CHECK ((download_count >= 0))` |
| `export_requests_downloaded_chk` | `CHECK (((status <> 'DOWNLOADED'::audit.export_status) OR (download_count >= 1)))` |
| `export_requests_expired_chk` | `CHECK (((status <> 'EXPIRED'::audit.export_status) OR (expired_at IS NOT NULL)))` |
| `export_requests_filter_chk` | `CHECK ((jsonb_typeof(filter) = 'object'::text))` |
| `export_requests_generated_chk` | `CHECK (((status <> ALL (ARRAY['GENERATED'::audit.export_status, 'DOWNLOADED'::audit.export_status, 'EXPIRED'::audit.export_status])) OR (generated_at IS NOT NULL)))` |
| `export_requests_no_chk` | `CHECK ((export_no ~ '^EX-[0-9]{4}-[0-9]{6,}$'::text))` |
| `export_requests_reason_note_chk` | `CHECK (((reason_code <> 'OTHER'::text) OR ((reason_note IS NOT NULL) AND (btrim(reason_note) <> ''::text))))` |
| `export_requests_role_chk` | `CHECK ((requested_as_role = ANY (ARRAY['BRANCH_MANAGER'::text, 'MARKETING'::text, 'BUSINESS_ADMIN'::text, 'EXECUTIVE'::text])))` |
| `export_requests_row_count_chk` | `CHECK (((row_count IS NULL) OR (row_count >= 0)))` |

**Foreign key:**

| ชื่อ | นิยาม |
|---|---|
| `export_requests_approved_by_fkey` | `FOREIGN KEY (approved_by) REFERENCES core.staff_profiles(id)` |
| `export_requests_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES core.staff_profiles(id)` |
| `export_requests_organization_id_fkey` | `FOREIGN KEY (organization_id) REFERENCES core.organizations(id)` |
| `export_requests_reason_code_fkey` | `FOREIGN KEY (reason_code) REFERENCES ref.export_reasons(code)` |
| `export_requests_requested_as_role_fkey` | `FOREIGN KEY (requested_as_role) REFERENCES core.roles(code)` |
| `export_requests_requested_by_fkey` | `FOREIGN KEY (requested_by) REFERENCES core.staff_profiles(id)` |
| `export_requests_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES core.staff_profiles(id)` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `export_requests_export_no_key` | `CREATE UNIQUE INDEX export_requests_export_no_key ON audit.export_requests USING btree (export_no)` |
| `export_requests_pkey` | `CREATE UNIQUE INDEX export_requests_pkey ON audit.export_requests USING btree (id)` |
| `export_requests_requested_by_idx` | `CREATE INDEX export_requests_requested_by_idx ON audit.export_requests USING btree (requested_by, requested_at)` |
| `export_requests_status_idx` | `CREATE INDEX export_requests_status_idx ON audit.export_requests USING btree (status, requested_at)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_05_running_number` | BEFORE | INSERT | ROW | `app.trg_assign_running_number()` | – |
| `trg_12_guard_export_request` | BEFORE | INSERT · DELETE · UPDATE | ROW | `audit.trg_guard_export_request()` | – |
| `trg_90_stamp_row` | BEFORE | INSERT · UPDATE | ROW | `app.trg_stamp_row()` | – |
| `trg_touch_updated_at` | BEFORE | UPDATE | ROW | `app.touch_updated_at()` | – |

#### `audit.integration_logs`

บันทึกการรับ/ส่งข้อมูลกับระบบภายนอก (Edge Functions integration-* · Phase 4) append-only · ไม่เก็บ payload ที่มี PII (เก็บ sha256) · หมายเหตุผู้เขียน: CANONICAL ระบุชื่อตารางเท่านั้น คอลัมน์และชุดค่า direction (INBOUND/OUTBOUND) status (SUCCESS/FAILED) ออกแบบโดยผู้เขียน [รอยืนยัน]

**RLS:** ปิด (ไม่ต้องเปิดตามข้อ 9.4 กติกา 1 — คุมด้วย GRANT) · **policy:** 0 · **index:** 3 · **trigger:** 2

**GRANT (ทั้งตาราง):** `audit_retention` = SELECT, DELETE

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `bigint` | NOT NULL | `GENERATED ALWAYS AS IDENTITY` | – |  | – |
| 2 | `occurred_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 3 | `organization_id` | `uuid` | NULL | – | – |  | – |
| 4 | `source_system_code` | `text` | NOT NULL | – | – |  | รหัสระบบต้นทาง/ปลายทาง (ค่าใน ref.source_systems) |
| 5 | `direction` | `text` | NOT NULL | – | – |  | – |
| 6 | `operation` | `text` | NOT NULL | – | – |  | ชื่อการทำงาน เช่น ดึงธุรกรรม POS |
| 7 | `status` | `text` | NOT NULL | – | – |  | – |
| 8 | `http_status` | `integer` | NULL | – | – |  | – |
| 9 | `external_ref` | `text` | NULL | – | – |  | – |
| 10 | `error_message` | `text` | NULL | – | – |  | – |
| 11 | `payload_sha256` | `text` | NULL | – | – |  | sha256 hex ของ payload (ไม่เก็บ payload จริง) |
| 12 | `actor_label` | `text` | NULL | – | – |  | – |
| 13 | `request_id` | `text` | NULL | – | – |  | – |
| 14 | `detail` | `jsonb` | NULL | – | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `integration_logs_pkey` | `PRIMARY KEY (id)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `integration_logs_direction_chk` | `CHECK ((direction = ANY (ARRAY['INBOUND'::text, 'OUTBOUND'::text])))` |
| `integration_logs_hash_chk` | `CHECK (((payload_sha256 IS NULL) OR (payload_sha256 ~ '^[0-9a-f]{64}$'::text)))` |
| `integration_logs_status_chk` | `CHECK ((status = ANY (ARRAY['SUCCESS'::text, 'FAILED'::text])))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `integration_logs_occurred_at_idx` | `CREATE INDEX integration_logs_occurred_at_idx ON audit.integration_logs USING btree (occurred_at)` |
| `integration_logs_pkey` | `CREATE UNIQUE INDEX integration_logs_pkey ON audit.integration_logs USING btree (id)` |
| `integration_logs_source_idx` | `CREATE INDEX integration_logs_source_idx ON audit.integration_logs USING btree (source_system_code, occurred_at)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_deny_change` | BEFORE | DELETE · UPDATE | ROW | `audit.deny_change()` | – |
| `trg_deny_truncate` | BEFORE | TRUNCATE | STATEMENT | `audit.deny_change()` | – |

#### `audit.login_events`

เหตุการณ์ล็อกอินทั้งหมด (password · SSO · MFA · refresh · lockout) แหล่งเดียว (ข้อ 9.2) · เขียนโดย Auth hook / Edge Function (service_role ผ่าน RPC ภายใน) · append-only · เก็บ 1 ปี · ip/device_id เป็นข้อมูลประกอบ ห้ามใช้ตัดสินสิทธิ์ · อ่านผ่าน api.search_security_log (security_log.read) · หมายเหตุผู้เขียน: CANONICAL ไม่ระบุคอลัมน์และชุดรหัสเหตุการณ์ ผู้เขียนออกแบบ event_type/method เป็นข้อความรูปแบบ A–Z_ (ชุดค่ารอยืนยัน)

**RLS:** ปิด (ไม่ต้องเปิดตามข้อ 9.4 กติกา 1 — คุมด้วย GRANT) · **policy:** 0 · **index:** 4 · **trigger:** 2

**GRANT (ทั้งตาราง):** `audit_retention` = SELECT, DELETE

| # | คอลัมน์ | ชนิด | NULL | ค่าเริ่มต้น / generated | FK → | pii | คำอธิบาย |
|---:|---|---|:--:|---|---|:--:|---|
| 1 | `id` | `bigint` | NOT NULL | `GENERATED ALWAYS AS IDENTITY` | – |  | – |
| 2 | `occurred_at` | `timestamp with time zone` | NOT NULL | `now()` | – |  | – |
| 3 | `organization_id` | `uuid` | NULL | – | – |  | – |
| 4 | `user_id` | `uuid` | NULL | – | – |  | auth.users.id (NULL เมื่อระบุผู้ใช้ไม่ได้ เช่น รหัสผ่านผิดกับบัญชีที่ไม่มีอยู่) |
| 5 | `staff_id` | `uuid` | NULL | – | – |  | core.staff_profiles.id ที่ผูก user_id (ถ้ามี) |
| 6 | `event_type` | `text` | NOT NULL | – | – |  | ชนิดเหตุการณ์ รูปแบบ A–Z_ (ครอบคลุม password · SSO · MFA · refresh · lockout ตามข้อ 9.2 · ชุดค่ารอยืนยัน) |
| 7 | `method` | `text` | NULL | – | – |  | วิธียืนยันตัวตน รูปแบบ A–Z_ (เช่น อีเมล+รหัสผ่าน · staff_code · Google · Microsoft · TOTP · ชุดค่ารอยืนยัน) |
| 8 | `success` | `boolean` | NOT NULL | – | – |  | สำเร็จหรือไม่ |
| 9 | `failure_reason` | `text` | NULL | – | – |  | สาเหตุภายใน (ไม่แสดงผู้ใช้ · ข้อความผิดพลาดต่อผู้ใช้เหมือนกันทุกกรณี) |
| 10 | `identifier_hash` | `text` | NULL | – | – |  | sha256 hex ของตัวระบุที่กรอก (อีเมล lower หรือ ST-NNNN) ใช้นับการเข้าผิดตาม (บัญชี, IP) โดยไม่เก็บค่าจริง |
| 11 | `aal` | `text` | NULL | – | – |  | – |
| 12 | `ip` | `text` | NULL | – | – |  | – |
| 13 | `user_agent` | `text` | NULL | – | – |  | – |
| 14 | `device_id` | `text` | NULL | – | – |  | – |
| 15 | `request_id` | `text` | NULL | – | – |  | – |
| 16 | `detail` | `jsonb` | NULL | – | – |  | – |

**คีย์:**

| ชื่อ | นิยาม |
|---|---|
| `login_events_pkey` | `PRIMARY KEY (id)` |

**CHECK:**

| ชื่อ | นิยาม |
|---|---|
| `login_events_aal_chk` | `CHECK (((aal IS NULL) OR (aal = ANY (ARRAY['aal1'::text, 'aal2'::text]))))` |
| `login_events_event_type_chk` | `CHECK ((event_type ~ '^[A-Z][A-Z0-9_]*$'::text))` |
| `login_events_hash_chk` | `CHECK (((identifier_hash IS NULL) OR (identifier_hash ~ '^[0-9a-f]{64}$'::text)))` |
| `login_events_method_chk` | `CHECK (((method IS NULL) OR (method ~ '^[A-Z][A-Z0-9_]*$'::text)))` |

**Index:**

| ชื่อ | นิยาม |
|---|---|
| `login_events_identifier_idx` | `CREATE INDEX login_events_identifier_idx ON audit.login_events USING btree (identifier_hash, occurred_at) WHERE (identifier_hash IS NOT NULL)` |
| `login_events_occurred_at_idx` | `CREATE INDEX login_events_occurred_at_idx ON audit.login_events USING btree (occurred_at)` |
| `login_events_pkey` | `CREATE UNIQUE INDEX login_events_pkey ON audit.login_events USING btree (id)` |
| `login_events_user_idx` | `CREATE INDEX login_events_user_idx ON audit.login_events USING btree (user_id, occurred_at)` |

**Trigger** (เรียงตามชื่อ = ลำดับที่ PostgreSQL เรียกภายในเวลาเดียวกัน · CANONICAL ข้อ 9.4.2):

| ชื่อ | เวลา | เหตุการณ์ | ระดับ | ฟังก์ชัน | เงื่อนไข WHEN |
|---|---|---|---|---|---|
| `trg_deny_change` | BEFORE | DELETE · UPDATE | ROW | `audit.deny_change()` | – |
| `trg_deny_truncate` | BEFORE | TRUNCATE | STATEMENT | `audit.deny_change()` | – |

## 5. View

CANONICAL ข้อ 9.4 กติกา 4: **ทุก view ในทุก schema สร้างด้วย `WITH (security_invoker = true)`** · ห้าม materialized view ใน schema ที่เปิด API · CI ตรวจเฉพาะ schema ของโครงการ (ข้อ 19.2 ข้อ 8)

### 5.crm — `crm`

#### `crm.customer_consent_current`

สถานะความยินยอมปัจจุบัน = แถวล่าสุดต่อ (ลูกค้า, purpose) ตาม captured_at แล้ว created_at (ข้อ 10.2) · security_invoker ผ่าน RLS ของ customer_consents · ไม่มีคอลัมน์ evidence (ค่า pii ไม่อยู่ใน view) · "ยินยอม MARKETING" = แถวของ purpose MARKETING ที่ status = GRANTED

`security_invoker`: **true** ✓ · reloptions: `{security_invoker=true}`

GRANT: `authenticated` = SELECT

| คอลัมน์ | ชนิด | คำอธิบาย |
|---|---|---|
| `id` | `uuid` | – |
| `organization_id` | `uuid` | – |
| `customer_id` | `uuid` | – |
| `purpose_code` | `text` | – |
| `status` | `crm.consent_status` | – |
| `notice_version` | `text` | – |
| `channels` | `text[]` | – |
| `captured_via` | `crm.consent_capture_via` | – |
| `captured_by` | `uuid` | – |
| `captured_at` | `timestamp with time zone` | – |

<details><summary>นิยาม</summary>

```sql
 SELECT DISTINCT ON (customer_id, purpose_code) id,
    organization_id,
    customer_id,
    purpose_code,
    status,
    notice_version,
    channels,
    captured_via,
    captured_by,
    captured_at
   FROM crm.customer_consents c
  ORDER BY customer_id, purpose_code, captured_at DESC, created_at DESC, id DESC;
```

</details>

### 5.analytics — `analytics`

#### `analytics.customer_activity`

กิจกรรมของลูกค้าที่นับได้ (CANONICAL ข้อ 3.1): visits.started_at (ไม่นับ CANCELLED) · interactions.occurred_at (ไม่นับ interaction ที่ผูก visit CANCELLED) · leads.created_at · opportunities.created_at · opportunities.closed_at · transaction_refs.transacted_at · ใช้นับ UNIQUE_CUSTOMERS / NEW_CUSTOMERS / RETURNING_CUSTOMERS (ข้อ 12.1) · security_invoker · ไม่มี GRANT (อ่านใน RPC DEFINER เท่านั้น · ข้อ 9.4.1)

`security_invoker`: **true** ✓ · reloptions: `{security_invoker=true}`

GRANT: **ไม่มี** (อ่านใน RPC `SECURITY DEFINER` เท่านั้น)

| คอลัมน์ | ชนิด | คำอธิบาย |
|---|---|---|
| `customer_id` | `uuid` | – |
| `branch_id` | `uuid` | – |
| `occurred_at` | `timestamp with time zone` | – |
| `kind` | `text` | – |

<details><summary>นิยาม</summary>

```sql
 SELECT v.customer_id,
    v.branch_id,
    v.started_at AS occurred_at,
    'VISIT'::text AS kind
   FROM crm.visits v
  WHERE v.customer_id IS NOT NULL AND v.status <> 'CANCELLED'::crm.visit_status
UNION ALL
 SELECT i.customer_id,
    i.branch_id,
    i.occurred_at,
    'INTERACTION'::text AS kind
   FROM crm.interactions i
     LEFT JOIN crm.visits iv ON iv.id = i.visit_id
  WHERE i.customer_id IS NOT NULL AND (i.visit_id IS NULL OR iv.status <> 'CANCELLED'::crm.visit_status)
UNION ALL
 SELECT l.customer_id,
    l.branch_id,
    l.created_at AS occurred_at,
    'LEAD'::text AS kind
   FROM crm.leads l
UNION ALL
 SELECT o.customer_id,
    o.branch_id,
    o.created_at AS occurred_at,
    'OPPORTUNITY'::text AS kind
   FROM crm.opportunities o
UNION ALL
 SELECT o.customer_id,
    o.branch_id,
    o.closed_at AS occurred_at,
    'OPPORTUNITY_CLOSED'::text AS kind
   FROM crm.opportunities o
  WHERE o.closed_at IS NOT NULL
UNION ALL
 SELECT t.customer_id,
    t.branch_id,
    t.transacted_at AS occurred_at,
    'TRANSACTION'::text AS kind
   FROM crm.transaction_refs t;
```

</details>

#### `analytics.data_quality_issues`

รายการศูนย์คุณภาพข้อมูล 9 ชนิดตาม CANONICAL ข้อ 12.3 · คอลัมน์ (issue_code, entity_type, entity_id, customer_id, branch_id, owner_staff_id, detected_at) · เกณฑ์วันอ่านจาก app.settings (dq.lead_without_outcome_days 14 · dq.won_without_txn_days 3 · dq.visit_unrecorded_days 7 · ข้อ 11.2) · รายการระดับลูกค้าผูกสาขาด้วย first_branch_id (ข้อ 12.3) · LEAD_WITHOUT_OWNER ใช้ created_by เป็นคอลัมน์ผู้ผูก (ข้อ 8.0 scope O) · หมายเหตุผู้เขียน: ตัด VISIT_UNRECORDED ที่ unrecorded_ack_at IS NOT NULL ออก (ข้อ 9.6 api.acknowledge_unrecorded_visit) · security_invoker · ไม่มี GRANT (อ่านผ่าน api.list_data_quality_issues ตามสิทธิ์ data_quality.view)

`security_invoker`: **true** ✓ · reloptions: `{security_invoker=true}`

GRANT: **ไม่มี** (อ่านใน RPC `SECURITY DEFINER` เท่านั้น)

| คอลัมน์ | ชนิด | คำอธิบาย |
|---|---|---|
| `issue_code` | `text` | – |
| `entity_type` | `text` | – |
| `entity_id` | `uuid` | – |
| `customer_id` | `uuid` | – |
| `branch_id` | `uuid` | – |
| `owner_staff_id` | `uuid` | – |
| `detected_at` | `timestamp with time zone` | – |

<details><summary>นิยาม</summary>

```sql
 SELECT 'DUPLICATE_SUSPECTED'::text AS issue_code,
    'DUPLICATE_DECISION'::text AS entity_type,
    d.id AS entity_id,
    d.customer_id,
    c.first_branch_id AS branch_id,
    NULL::uuid AS owner_staff_id,
    d.created_at AS detected_at
   FROM crm.duplicate_decisions d
     JOIN crm.customers c ON c.id = d.customer_id AND c.record_status = 'ACTIVE'::crm.customer_record_status
     JOIN crm.customers c2 ON c2.id = d.candidate_customer_id AND c2.record_status = 'ACTIVE'::crm.customer_record_status
  WHERE d.status = 'PENDING'::crm.duplicate_status
UNION ALL
 SELECT 'MISSING_PHONE'::text AS issue_code,
    'CUSTOMER'::text AS entity_type,
    c.id AS entity_id,
    c.id AS customer_id,
    c.first_branch_id AS branch_id,
    c.owner_staff_id,
    c.created_at AS detected_at
   FROM crm.customers c
  WHERE c.record_status = 'ACTIVE'::crm.customer_record_status AND (c.first_channel_code = ANY (ARRAY['WALK_IN'::text, 'PHONE'::text])) AND NOT (EXISTS ( SELECT 1
           FROM crm.customer_contacts cc
          WHERE cc.customer_id = c.id AND cc.contact_type = 'PHONE'::crm.contact_type AND cc.is_active))
UNION ALL
 SELECT 'INVALID_PHONE'::text AS issue_code,
    'CUSTOMER'::text AS entity_type,
    c.id AS entity_id,
    c.id AS customer_id,
    c.first_branch_id AS branch_id,
    c.owner_staff_id,
    c.created_at AS detected_at
   FROM crm.customers c
  WHERE c.record_status = 'ACTIVE'::crm.customer_record_status AND (EXISTS ( SELECT 1
           FROM crm.customer_contacts cc
          WHERE cc.customer_id = c.id AND cc.contact_type = 'PHONE'::crm.contact_type AND cc.is_active AND NOT cc.is_valid))
UNION ALL
 SELECT 'LEAD_WITHOUT_OWNER'::text AS issue_code,
    'LEAD'::text AS entity_type,
    l.id AS entity_id,
    l.customer_id,
    l.branch_id,
    l.created_by AS owner_staff_id,
    l.created_at AS detected_at
   FROM crm.leads l
  WHERE (l.status = ANY (ARRAY['NEW'::crm.lead_status, 'CONTACTED'::crm.lead_status, 'QUALIFIED'::crm.lead_status])) AND l.owner_staff_id IS NULL
UNION ALL
 SELECT 'LEAD_WITHOUT_OUTCOME'::text AS issue_code,
    'LEAD'::text AS entity_type,
    l.id AS entity_id,
    l.customer_id,
    l.branch_id,
    l.owner_staff_id,
    l.created_at AS detected_at
   FROM crm.leads l
  WHERE (l.status = ANY (ARRAY['NEW'::crm.lead_status, 'CONTACTED'::crm.lead_status, 'QUALIFIED'::crm.lead_status])) AND l.created_at < (app.clock() - make_interval(days => app.setting_int('dq.lead_without_outcome_days'::text, 14)))
UNION ALL
 SELECT 'OVERDUE_FOLLOWUP'::text AS issue_code,
    'TASK'::text AS entity_type,
    t.id AS entity_id,
    t.customer_id,
    t.branch_id,
    t.owner_staff_id,
    t.due_at AS detected_at
   FROM crm.tasks t
  WHERE t.task_type_code = 'FOLLOW_UP'::text AND (t.status = ANY (ARRAY['OPEN'::crm.task_status, 'IN_PROGRESS'::crm.task_status])) AND t.due_at < app.bkk_ts(app.bangkok_date(app.clock()))
UNION ALL
 SELECT 'INCOMPLETE_CUSTOMER'::text AS issue_code,
    'CUSTOMER'::text AS entity_type,
    c.id AS entity_id,
    c.id AS customer_id,
    c.first_branch_id AS branch_id,
    c.owner_staff_id,
    c.created_at AS detected_at
   FROM crm.customers c
  WHERE c.record_status = 'ACTIVE'::crm.customer_record_status AND NULLIF(btrim(c.last_name), ''::text) IS NULL AND c.province_code IS NULL AND NOT (EXISTS ( SELECT 1
           FROM crm.leads l
          WHERE l.customer_id = c.id)) AND NOT (EXISTS ( SELECT 1
           FROM crm.opportunities o
          WHERE o.customer_id = c.id AND o.interest_code IS NOT NULL))
UNION ALL
 SELECT 'WON_WITHOUT_TRANSACTION'::text AS issue_code,
    'OPPORTUNITY'::text AS entity_type,
    o.id AS entity_id,
    o.customer_id,
    o.branch_id,
    o.owner_staff_id,
    o.won_at AS detected_at
   FROM crm.opportunities o
  WHERE o.stage = 'WON'::crm.opportunity_stage AND o.won_at < (app.clock() - make_interval(days => app.setting_int('dq.won_without_txn_days'::text, 3))) AND NOT (EXISTS ( SELECT 1
           FROM crm.transaction_refs t
          WHERE t.opportunity_id = o.id))
UNION ALL
 SELECT 'VISIT_UNRECORDED'::text AS issue_code,
    'VISIT'::text AS entity_type,
    v.id AS entity_id,
    v.customer_id,
    v.branch_id,
    v.owner_staff_id,
    v.started_at AS detected_at
   FROM crm.visits v
  WHERE v.outcome_code = 'UNRECORDED'::text AND v.unrecorded_ack_at IS NULL AND v.started_at >= app.bkk_ts(app.bangkok_date(app.clock()) - (app.setting_int('dq.visit_unrecorded_days'::text, 7) - 1)) AND v.started_at < app.bkk_ts(app.bangkok_date(app.clock()) + 1);
```

</details>

#### `analytics.purchase_events`

เหตุการณ์การซื้อ (CANONICAL ข้อ 3.1): opportunity WON ที่ won_at + transaction_refs ที่ ref.transaction_types.counts_as_purchase และ (ไม่ผูก opportunity หรือ opportunity นั้นไม่ใช่ WON) — ref ที่ผูก opportunity WON นับรวมเป็นครั้งเดียวกับ opportunity · ใช้กับ BUYERS · REPEAT_BUYERS · REPEAT_RATE (ข้อ 12.1 · 12.2) · security_invoker · ไม่มี GRANT

`security_invoker`: **true** ✓ · reloptions: `{security_invoker=true}`

GRANT: **ไม่มี** (อ่านใน RPC `SECURITY DEFINER` เท่านั้น)

| คอลัมน์ | ชนิด | คำอธิบาย |
|---|---|---|
| `customer_id` | `uuid` | – |
| `branch_id` | `uuid` | – |
| `purchased_at` | `timestamp with time zone` | – |
| `owner_staff_id` | `uuid` | – |
| `opportunity_id` | `uuid` | – |
| `amount` | `numeric(12,2)` | – |
| `source` | `text` | – |

<details><summary>นิยาม</summary>

```sql
 SELECT o.customer_id,
    o.branch_id,
    o.won_at AS purchased_at,
    o.owner_staff_id,
    o.id AS opportunity_id,
    o.won_amount AS amount,
    'OPPORTUNITY'::text AS source
   FROM crm.opportunities o
  WHERE o.stage = 'WON'::crm.opportunity_stage AND o.won_at IS NOT NULL
UNION ALL
 SELECT t.customer_id,
    t.branch_id,
    t.transacted_at AS purchased_at,
    NULL::uuid AS owner_staff_id,
    t.opportunity_id,
    t.amount,
    'TRANSACTION_REF'::text AS source
   FROM crm.transaction_refs t
     JOIN ref.transaction_types tt ON tt.code = t.transaction_type_code AND tt.counts_as_purchase
     LEFT JOIN crm.opportunities o ON o.id = t.opportunity_id
  WHERE t.opportunity_id IS NULL OR o.stage IS DISTINCT FROM 'WON'::crm.opportunity_stage;
```

</details>

## 6. ฟังก์ชัน

CANONICAL ข้อ 9.6: ทุกฟังก์ชัน owner = `postgres` · `SET search_path = ''` · ตรวจสิทธิ์บรรทัดแรก · ข้อ 19.1 ข้อ 2: `ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` ทำทั้งฐาน **ทุกฟังก์ชันที่ถูกเรียกตรงจึงต้อง `GRANT EXECUTE` เอง**

คอลัมน์ `search_path` แสดง `proconfig` จริงของฟังก์ชัน · คอลัมน์ `GRANT EXECUTE` ตัด owner ออกแล้ว (ว่าง = ไม่มี role ใดเรียกได้ เรียกได้เฉพาะจากภายในฟังก์ชัน/trigger ของระบบ)

### 6.app — `app` (115 ฟังก์ชัน)

| ฟังก์ชัน | คืนค่า | security | volatility | search_path | GRANT EXECUTE | คำอธิบาย |
|---|---|---|---|---|---|---|
| `anonymize_customer(p_customer_id uuid, p_reason text)` | `jsonb` | **DEFINER** | VOLATILE | `\` | – | ทำข้อมูลนิรนามของลูกค้าและแถว MERGED ที่ชี้มาหา (ข้อ 10.4 · 19.4 ข้อ 2) · แทนคีย์ PII ใน audit_logs ด้วย app.audit_redaction |
| `api_denied(p_msg text)` | `void` | INVOKER | STABLE | `\` | – | – |
| `api_invalid(p_msg text, p_sqlstate text)` | `void` | INVOKER | STABLE | `\` | – | – |
| `assign_role_denial(p_target_staff_id uuid, p_role_code text, p_branch_id uuid)` | `text` | **DEFINER** | STABLE | `\` | – | – |
| `audit_entity_types(p_code text)` | `text[]` | INVOKER | IMMUTABLE | `\` | – | – |
| `bangkok_date(p_ts timestamp with time zone)` | `date` | INVOKER | IMMUTABLE | `\` | `authenticated` | วันธุรกิจของเวลา ts ตามขอบเที่ยงคืน Asia/Bangkok = (ts AT TIME ZONE 'Asia/Bangkok')::date (ข้อ 1.2) · ไม่ขึ้นกับ session TimeZone · ตัวอย่าง 2026-09-11T17:30:00Z → 2026-09-12 |
| `bkk_ts(p_date date)` | `timestamp with time zone` | INVOKER | IMMUTABLE | `\` | – | เที่ยงคืน Asia/Bangkok ของวันที่ (ข้อ 1.2) = (d::timestamp AT TIME ZONE 'Asia/Bangkok') · ใช้ประกอบขอบช่วง [start, end) ของ KPI · ตรงข้ามกับ app.bangkok_date(timestamptz) · ไม่ขึ้นกับ session TimeZone · ภายใน ไม่ GRANT |
| `build_export_dataset(p_export_id uuid)` | `jsonb` | **DEFINER** | VOLATILE | `\` | – | ชุดข้อมูลของคำขอส่งออก (ข้อ 8.2) · ตรวจซ้ำสถานะ ผู้ขอ ขอบเขตสาขา ตัวกรอง และ whitelist คอลัมน์ |
| `business_minutes_between(p_branch_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)` | `numeric` | **DEFINER** | STABLE | `\` | – | จำนวนนาทีเวลาทำการสะสมระหว่างสองเวลา (ข้อ 11.1 "นับเฉพาะนาทีในเวลาทำการ") · ใช้กับ LEAD_UNASSIGNED และ LEAD_NOT_CONTACTED · ภายใน ไม่ GRANT |
| `business_window(p_branch_id uuid, p_date date)` | `TABLE(open_ts timestamp with time zone, close_ts timestamp with time zone)` | **DEFINER** | STABLE | `\` | – | ช่วงเวลาทำการ [เปิด, ปิด) ของสาขาในวันหนึ่ง (ข้อ 11.1 · 11.2) · อ่าน app.settings[business_hours] โดยคีย์รหัสสาขา (core.branches.code) ทับค่า default · ยังไม่มีวันหยุด [รอยืนยัน Q4] · ภายใน ไม่ GRANT |
| `can_access_customer(p_permission text, p_customer_id uuid)` | `boolean` | **DEFINER** | STABLE | `\` | `authenticated` | ตัดสินลูกค้ารายเดียว = p_customer_id ∈ app.customer_ids_in_scope(p_permission) (ข้อ 9.3) · ใช้ใน trigger และ RPC เท่านั้น |
| `can_access_record(p_permission text, p_branch_id uuid, p_owner_staff_id uuid, p_created_by uuid)` | `boolean` | **DEFINER** | STABLE | `\` | `authenticated` | ตัดสินแถวเดียวด้วยกติกาเดียวกับ policy (ข้อ 8.0) · ใช้ใน trigger และ RPC เท่านั้น ห้ามใช้ใน policy (ข้อ 9.3 · 9.4 ข้อ 2) · lead.assign และ task.assign ที่ scope T รวมแถวที่ owner ว่างในสาขาที่ตนเป็นหัวหน้าทีม (ข้อ 8.0 · Q28) |
| `candidate_card(p_customer_id uuid, p_score integer, p_rules text[], p_matched_phone boolean)` | `jsonb` | **DEFINER** | STABLE | `\` | – | – |
| `candidate_scores(p_branch_id uuid, p_phone text, p_line_id text, p_email text, p_first_name text, p_last_name text)` | `TABLE(customer_id uuid, score integer, rules text[], matched_phone boolean)` | **DEFINER** | STABLE | `\` | – | คะแนนผู้สมัครซ้ำตามตารางข้อ 6.5 (ค้นทั้งองค์กร · เฉพาะลูกค้า ACTIVE) |
| `clock()` | `timestamp with time zone` | **DEFINER** | STABLE | `\` | `authenticated` | นาฬิกาอ้างอิงของรายงาน (ข้อ 1.2 · 9.3): คืน app.settings[clock].as_of เมื่อ app.settings[env] <> 'prod' และ as_of ไม่ว่าง · มิฉะนั้นคืน now() · ไม่พบแถว env ถือเป็น prod · ใช้กับ KPI คุณภาพข้อมูล การแจ้งเตือน "วันนี้" ป้ายลูกค้าใหม่ งานตามเวลา · ห้ามใช้ตัดสินสิทธิ์ (ใช้ now()) |
| `contains_thai_national_id(p_text text)` | `boolean` | INVOKER | IMMUTABLE | `\` | – | true เมื่อข้อความมีเลขบัตรประชาชนไทย 13 หลักที่ checksum ถูกต้อง (ข้อ 10.1) · รูปที่ตรวจ: 13 หลักติดกัน · 1-2345-67890-12-1 · 1 2345 67890 12 1 (รวมเลขไทย) · ชุดตัวเลขที่อยู่ติดตัวเลขอื่นไม่นับ · 13 หลักที่ checksum ผิดไม่นับ (เช่น เลขอ้างอิงอื่น) |
| `current_organization_id()` | `uuid` | **DEFINER** | STABLE | `\` | `authenticated` | องค์กรของผู้ใช้ปัจจุบัน (ข้อ 9.3) · ใช้เป็น DEFAULT ของ organization_id และเงื่อนไของค์กรใน policy |
| `current_staff_id()` | `uuid` | **DEFINER** | STABLE | `\` | `authenticated` | uuid ของ staff ACTIVE ที่ผูก auth.uid() · ไม่มี → NULL (ข้อ 9.3) · CREATE OR REPLACE ของนิยามเดิมใน 0008 (signature เดิม) · GRANT EXECUTE ให้ authenticated (ใช้ใน policy) |
| `customer_activity_events(p_customer_id uuid)` | `TABLE(occurred_at timestamp with time zone, branch_id uuid, channel_code text, source_code text, kind text, kind_order integer, row_id uuid)` | **DEFINER** | STABLE | `\` | – | activity event ของลูกค้ารายเดียวตามข้อ 3.1: visits.started_at (ไม่นับ CANCELLED) · interactions.occurred_at · leads.created_at · opportunities.created_at · opportunities.closed_at · transaction_refs.transacted_at · นิยามเดียวกับ view analytics.customer_activity (stage 3) · kind_order ใช้ตัดสินลำดับเมื่อเวลาเท่ากัน |
| `customer_counters(p_customer_id uuid)` | `jsonb` | **DEFINER** | STABLE | `\` | – | – |
| `customer_ids_in_scope(p_permission text)` | `SETOF uuid` | **DEFINER** | STABLE | `\` | `authenticated` | ลูกค้าที่ผ่านสิทธิ์นี้ตามข้อ 8.0: G = ทั้งองค์กร · B = ลูกค้าที่เชื่อมสาขานั้น · T = เชื่อมสาขานั้นและ owner อยู่ในทีมที่ตนเป็นหัวหน้า · O = เชื่อมสาขาที่มีสิทธิ์และ owner = ตน · "เชื่อมสาขา" = crm.customer_branches หรือ customers.first_branch_id (ข้อ 6.6) |
| `customer_merge_snapshot(p_customer_id uuid)` | `jsonb` | **DEFINER** | STABLE | `\` | – | – |
| `customer_purchase_count(p_customer_id uuid)` | `bigint` | **DEFINER** | STABLE | `\` | – | จำนวนเหตุการณ์การซื้อตลอดอายุ (ข้อ 3.1): opportunity WON + transaction_refs ที่ ref.transaction_types.counts_as_purchase และ (ไม่ผูก opportunity หรือ opportunity นั้นไม่ใช่ WON) · ref ที่ผูก opportunity WON นับเป็นครั้งเดียวกับ opportunity · "ซื้อ N ครั้ง" ของ Customer 360 (ข้อ 3.3) |
| `dq_label_th(p_issue_code text)` | `text` | INVOKER | IMMUTABLE | `\` | – | ป้ายไทยของ issue_code ในศูนย์คุณภาพข้อมูล (CANONICAL ข้อ 12.3) · ใช้ประกอบ body ของ DATA_MISSING · ภายใน ไม่ GRANT |
| `effective_assignments()` | `TABLE(assignment_id uuid, role_code text, branch_id uuid)` | **DEFINER** | STABLE | `\` | – | assignment ที่มีผล ณ now(): staff ACTIVE · valid_from ≤ now() < valid_to · บทบาท requires_mfa ต้อง aal2 · บทบาทสาขาต้องมี branch_id (บทบาทองค์กรต้องไม่มี) · SUPERVISOR ใช้ได้เมื่อเป็นหัวหน้าทีมที่ teams.branch_id = สาขาของ assignment (ข้อ 7.1 · 8.0) · ภายใน ไม่ GRANT |
| `effective_grants(p_permission text)` | `TABLE(branch_id uuid, scope core.data_scope, role_code text)` | **DEFINER** | STABLE | `\` | – | คู่ (สาขา, scope, บทบาท) ของสิทธิ์หนึ่งรหัส (ข้อ 8.0): สิทธิ์ที่ requires_aal2 ต้อง aal2 · scope O/T/B คืนสาขาของ assignment · scope G ขยายเป็นทุกสาขาขององค์กร · scope S ไม่คืนสาขา (ใช้ผ่าน has_permission) · ภายใน ไม่ GRANT |
| `emit_notification(p_recipient uuid, p_code text, p_entity_type text, p_entity_id uuid, p_entity_ref text, p_body text, p_level integer, p_anchor date)` | `void` | **DEFINER** | VOLATILE | `\` | – | สร้างแถว crm.notifications แบบ dedupe (ข้อ 11.1) · ข้ามเมื่อ app.bulk = on หรือผู้รับไม่ ACTIVE |
| `enforce_row_transition()` | `trigger` | INVOKER | VOLATILE | `\` | – | trigger BEFORE INSERT OR UPDATE ชื่อ trg_10_enforce_transition บน crm.customers visits interactions leads opportunities quotations tasks (ข้อ 9.4.2) · SECURITY INVOKER และข้ามเมื่อ current_user <> 'authenticated' (service_role · งานระบบ · RPC/trigger DEFINER ตรวจเองตามข้อ 8 ของ rls-spec) · UPDATE: ① ไม่มีคอลัมน์เปลี่ยน → ผ่าน ② คอลัมน์ที่เปลี่ยนต้องอยู่ในรายการ UPDATE grant (คอลัมน์ระบบ T01 · owner/ทีม/สาขา T13 · อื่น ๆ T14) ③ กติกาต่อตารางตามตาราง mapping ข้อ 7.3 ของ rls-spec · INSERT: สถานะเริ่มต้นที่อนุญาตและ owner ที่ไม่ใช่ตนต้องมี *.assign + assignment ในสาขา |
| `export_candidate_ids(p_branch_ids uuid[], p_filter jsonb, p_marketing_only boolean)` | `SETOF uuid` | **DEFINER** | STABLE | `\` | – | – |
| `export_columns(p_role text)` | `text[]` | INVOKER | IMMUTABLE | `\` | – | – |
| `fmt_date_th(p_ts timestamp with time zone)` | `text` | INVOKER | IMMUTABLE | `\` | – | วันที่แบบ พ.ศ. ย่อ '10 ก.ย. 2569' (ข้อ 1.2) |
| `fmt_datetime_th(p_ts timestamp with time zone)` | `text` | INVOKER | IMMUTABLE | `\` | – | วันและเวลา '10 ก.ย. 2569 15:00' · ไม่มี "น." เมื่อมีวันที่ (ข้อ 19.5 ข้อ 4) |
| `fmt_delta_pct(p_cur numeric, p_prev numeric)` | `text` | INVOKER | IMMUTABLE | `\` | – | ส่วนต่างของจำนวน/เงินเป็น % จำนวนเต็ม '+12%' '−5%' · ช่วงก่อนหน้าเป็น 0 หรือ NULL → '–' และไม่แสดงป้าย · ผลเป็นศูนย์ → '0%' (ข้อ 1.3) |
| `fmt_delta_pp(p_cur_ratio numeric, p_prev_ratio numeric)` | `text` | INVOKER | IMMUTABLE | `\` | – | ส่วนต่างของอัตราเป็น pp 1 ตำแหน่ง '+2.1 pp' · คำนวณจากอัตราที่ยังไม่ปัดแล้วค่อยปัด (ข้อ 1.3) · ไม่มีค่าก่อนหน้า → '–' |
| `fmt_int(p_value numeric)` | `text` | INVOKER | IMMUTABLE | `\` | – | จำนวนคั่นหลักพัน '3,125' (ข้อ 1.3) · ค่าลบใช้เครื่องหมายลบ U+2212 |
| `fmt_money(p_value numeric)` | `text` | INVOKER | IMMUTABLE | `\` | – | เงิน '฿3,332,700' · แสดงสตางค์ 2 ตำแหน่งเฉพาะเมื่อไม่ใช่จำนวนเต็ม '฿28,900.50' (ข้อ 1.3) |
| `fmt_rate(p_ratio numeric)` | `text` | INVOKER | IMMUTABLE | `\` | – | อัตราจากสัดส่วน 0–1 → 1 ตำแหน่งทศนิยมเสมอ '24.1%' '100.0%' · NULL → '–' (ข้อ 1.3) |
| `fmt_time_th(p_ts timestamp with time zone)` | `text` | INVOKER | IMMUTABLE | `\` | – | เวลาเดี่ยว '10:12 น.' (ข้อ 1.2 · 19.5 ข้อ 4) |
| `format_running_number(p_value bigint, p_width integer)` | `text` | INVOKER | IMMUTABLE | `\` | – | เติม 0 นำหน้าให้ครบ p_width หลัก และ "เกินหลักได้ไม่ตัด" (ข้อ 6.1) · ห้ามใช้ lpad ตรง ๆ เพราะ lpad('1234567', 6, '0') ตัดเหลือ 123456 |
| `has_permission(p_permission text)` | `boolean` | **DEFINER** | STABLE | `\` | `authenticated` | มีสิทธิ์นี้ที่ scope ใดก็ได้ (รวม SYSTEM) หรือไม่ (ข้อ 9.3) · ใช้ใน policy ของ ref/tags/campaigns และการซ่อนปุ่ม |
| `in_business_hours(p_branch_id uuid, p_ts timestamp with time zone)` | `boolean` | **DEFINER** | STABLE | `\` | – | เวลานี้อยู่ในเวลาทำการของสาขาหรือไม่ (ข้อ 11.1) · ใช้กับ LEAD_UNASSIGNED · LEAD_NOT_CONTACTED · VISITOR_WAITING_LONG (ส่งเฉพาะในเวลาทำการ) · ภายใน ไม่ GRANT |
| `is_aal2()` | `boolean` | **DEFINER** | STABLE | `\` | `authenticated` | true เมื่อ coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2' (ข้อ 8.0 · 9.3) · ใช้ตัดสิน MFA ของบทบาทและสิทธิ์ที่ requires_aal2 |
| `is_bulk()` | `boolean` | INVOKER | STABLE | `\` | – | true เมื่อทรานแซกชันตั้ง set_config('app.bulk', 'on', true) (merge/seed/import ข้อ 3.4 · 6.7 · 13.0) · trigger ที่คำนวณซ้ำต่อแถวจะข้าม แล้วผู้ทำงาน bulk refresh ครั้งเดียวต่อลูกค้าท้ายงาน |
| `is_seed_mode()` | `boolean` | INVOKER | STABLE | `\` | – | true เมื่อ app.seed_mode = on และทำงานโดย role เจ้าของฐานข้อมูลโดยตรง (ข้อ 13.0 ข้อ 7 "มีผลเฉพาะ current_user = postgres") · ใช้ข้าม audit trigger และการสร้าง notification · หมายเหตุผู้เขียน: ตรวจ session_user (postgres หรือ superuser — PGlite ใช้ web_user ที่เป็น superuser) และต้องไม่ได้ SET ROLE (role = none) · ไม่ใช้ current_user เพราะในฟังก์ชัน SECURITY DEFINER current_user เป็น owner เสมอ · ผู้ใช้ PostgREST (session_user = authenticator · role = authenticated) จึงตั้ง seed_mode เพื่อข้าม audit ไม่ได้ |
| `is_thai_national_id(p_value text)` | `boolean` | INVOKER | IMMUTABLE | `\` | – | true เมื่อค่าเป็นเลขบัตรประชาชนไทย 13 หลักที่ checksum ถูกต้อง (ข้อ 10.1): หลักที่ 13 = (11 − (Σ หลักที่ i × (14 − i), i = 1..12) mod 11) mod 10 · ยอมรับตัวคั่นช่องว่าง/ขีด และเลขไทย · ใช้โดย app.trg_guard_restricted_text (ผู้เรียกดึงชุดตัวเลขที่อาจเป็นเลขบัตรออกจากข้อความก่อน) |
| `is_valid_thai_phone(p_value text)` | `boolean` | INVOKER | IMMUTABLE | `\` | – | เบอร์ถูกต้องตามข้อ 6.4: มือถือ 10 หลักขึ้นต้น 06 08 09 หรือเบอร์บ้าน 9 หลักขึ้นต้น 02–07 · รับได้ทั้งค่าที่กรอกและค่า normalized · NULL/ว่าง → false · api.save_contact ใช้ตั้ง customer_contacts.is_valid ของ PHONE |
| `job_close_stale_visits(p_as_of timestamp with time zone)` | `jsonb` | **DEFINER** | VOLATILE | `\` | – | งาน 00:05 Asia/Bangkok (CANONICAL ข้อ 4.1 · 9.6): ปิด visit ที่ยังเปิด (WAITING/IN_SERVICE) ของวันธุรกิจก่อนหน้าเป็น COMPLETED + outcome UNRECORDED · ended_at = 23:59:59 ของวันธุรกิจนั้น · closed_by_system = true · แล้วส่ง VISIT_OUTCOME_MISSING ระดับ 1 (สรุปต่อสาขาต่อวันธุรกิจ) ถึง BRANCH_MANAGER ของสาขา · dedupe_key = VISIT_OUTCOME_MISSING:{branch_id}:1:{วันธุรกิจ} (ข้อ 11.1) · actor = SYSTEM:close_stale_visits (ข้อ 9.5) · รันซ้ำได้ (idempotent) · ไม่ GRANT ให้ authenticated |
| `job_expire_exports(p_as_of timestamp with time zone)` | `jsonb` | **DEFINER** | VOLATILE | `\` | – | งานทุกชั่วโมงนาทีที่ 15 (CANONICAL ข้อ 8.2 · 9.6): คำขอส่งออกสถานะ GENERATED/DOWNLOADED ที่สร้างไฟล์เกิน app.settings[export.link_ttl_hours] (24 ชม.) → EXPIRED + expired_at · **ไม่แตะ download_count และไม่ตั้ง file_deleted_at** (Edge Function cron-export-cleanup อ่าน api.svc_expired_export_files() แล้วลบไฟล์และตั้ง file_deleted_at) · actor = SYSTEM:expire_exports (ข้อ 9.5) · รันซ้ำได้ · ไม่ GRANT ให้ authenticated |
| `job_expire_quotations(p_as_of timestamp with time zone)` | `jsonb` | **DEFINER** | VOLATILE | `\` | – | งาน 00:10 Asia/Bangkok (CANONICAL ข้อ 4.6 · 9.6): ใบเสนอราคา SENT ที่ valid_until ผ่านไปแล้ว (valid_until < วันธุรกิจของ p_as_of) → EXPIRED · ไม่แตะ ACCEPTED/REJECTED · actor = SYSTEM:expire_quotations (ข้อ 9.5) · รันซ้ำได้ · ไม่ GRANT ให้ authenticated |
| `job_notifications(p_as_of timestamp with time zone)` | `jsonb` | **DEFINER** | VOLATILE | `\` | – | งานทุก 5 นาที (CANONICAL ข้อ 9.6 · 11.1) สร้างการแจ้งเตือนที่เป็น "งานตามเวลา" ทั้งหมด:<br>  FOLLOWUP_DUE          ระดับ 0 · task FOLLOW_UP เปิดอยู่ที่ remind_at ≤ p_as_of < due_at · anchor = remind_at<br>  FOLLOWUP_OVERDUE      ระดับ 0 owner (anchor due_at) · 1 หัวหน้าทีมของ owner (+escalation.overdue_hours[0])<br>                        · 2 ผู้จัดการสาขา (+[1]) ตัด owner<br>  TASK_OVERDUE          ระดับ 0 owner · 1 หัวหน้าทีม (ไม่มีระดับ 2)<br>  LEAD_UNASSIGNED       ระดับ 0 · lead เปิดอยู่ไม่มี owner เกิน sla.lead_unassigned_min **นาทีเวลาทำการ**<br>                        และส่งเฉพาะในเวลาทำการ · ผู้รับ = SUPERVISOR (ที่เป็นหัวหน้าทีมในสาขา) + BRANCH_MANAGER<br>                        · anchor = เวลาที่เริ่มไม่มี owner (ownership_changes ล่าสุดที่ to_staff_id IS NULL มิฉะนั้น created_at)<br>  LEAD_NOT_CONTACTED    ระดับ 0 · lead NEW เกิน sla.lead_not_contacted_min นาทีเวลาทำการ · owner + หัวหน้าทีม · anchor = created_at<br>  OPPORTUNITY_STALE     ระดับ 0 owner (sla.opportunity_stale_days[0]) · 1 ผู้จัดการสาขา ([1]) ตัด owner<br>                        · ความเคลื่อนไหว = interaction ที่ผูก opportunity_id หรือการเปลี่ยนขั้น<br>  DUPLICATE_SUSPECTED   สรุปรายวันต่อสาขาเมื่อเวลาท้องถิ่น ≥ notify.duplicate_digest_time · anchor = วันที่ของสรุป<br>  VISITOR_WAITING_LONG  ระดับ 0 · visit WAITING เกิน sla.visitor_waiting_min **นาทีปฏิทิน** ส่งเฉพาะในเวลาทำการ · anchor = started_at<br>  VISIT_OUTCOME_MISSING ระดับ 0 · visit IN_SERVICE เกิน sla.visit_in_service_min → ผู้รับ visit · anchor = service_started_at<br>                        (ระดับ 1 สรุปสิ้นวันอยู่ใน app.job_close_stale_visits)<br>  DATA_MISSING          ระดับ 0 รายวันถึงผู้ผูกรายการคุณภาพข้อมูล · ระดับ 1 วันจันทร์ถึงผู้จัดการสาขา (notify.data_missing_time)<br>  DSR_DUE_SOON          ระดับ 0 · 7 วันก่อน coalesce(extended_until, due_at) → BUSINESS_ADMIN ขององค์กรนั้น<br>หมายเหตุผู้เขียน: เงื่อนไขเวลาทุกข้อใช้ p_as_of แต่รายการใน analytics.data_quality_issues (DATA_MISSING) คิดจาก app.clock()<br>ตามนิยามข้อ 12.3 · บน prod ทั้งสองค่าเท่ากับ now() จึงตรงกัน · ในการทดสอบให้ตั้ง app.settings[clock] ให้ตรงกับ p_as_of เมื่อต้องการตรวจ DATA_MISSING<br>actor = SYSTEM:notifications (ข้อ 9.5) · ทุกแถวผ่าน app.emit_notification (ON CONFLICT DO NOTHING) จึง idempotent ·<br>"ระดับที่ไม่มีผู้รับให้ข้าม" และ "การยกระดับไม่ส่งกลับไปที่ owner" ตามข้อ 11.1 · ไม่ GRANT ให้ authenticated |
| `job_retention(p_as_of timestamp with time zone)` | `jsonb` | INVOKER | VOLATILE | `\` | – | งาน 02:00 Asia/Bangkok (CANONICAL ข้อ 9.6 · 10.3 · 19.4 ข้อ 1) · **SECURITY INVOKER** (cron รันในฐานะ postgres)<br>ลำดับงาน:<br> 1. RETENTION_ANONYMIZE_UPCOMING — สรุปรายวันทั้งองค์กรถึง BUSINESS_ADMIN ทุกคน เมื่อมีลูกค้าครบระยะเก็บภายใน 30 วัน<br>    (anchor = วันที่ของสรุป จึงแจ้งวันละครั้ง · ข้อ 11.1) · ต้องทำก่อนขั้นที่ 2 เพราะ app.anonymize_customer ตั้ง app.bulk = on<br> 2. anonymize ลูกค้าที่ครบระยะเก็บ: ไม่เคยซื้อ = last_activity_at + 24 เดือน · เคยซื้อ = เหตุการณ์การซื้อล่าสุด + 10 ปี<br>    (หมายเหตุผู้เขียน: "ธุรกรรมล่าสุด" ใช้ analytics.purchase_events = opportunity WON + transaction ref ที่นับเป็นการซื้อ)<br>    ข้ามลูกค้าที่ legal_hold (ข้อ 10.3) · เรียก app.anonymize_customer(id, 'RETENTION') → actor SYSTEM:retention (ข้อ 10.4)<br> 3. SET LOCAL ROLE audit_retention แล้ว DELETE: audit_logs > 5 ปี · access_logs และ login_events > 1 ปี (ข้อ 10.3)<br>    audit.deny_change อนุญาต DELETE เฉพาะ current_user = 'audit_retention' (ข้อ 9.5) · คืน role เดิมเมื่อจบ<br>ไม่ GRANT ให้ authenticated |
| `kpi_compute(p_permission text, p_preset text, p_start date, p_end date, p_branch_ids uuid[], p_group_by text)` | `jsonb` | **DEFINER** | STABLE | `\` | – | คำนวณ KPI ทุกตัวของ CANONICAL ข้อ 12.1–12.3 ในครั้งเดียวแล้วคืน jsonb ตามรูปของ api.get_kpis · p_permission = 'dashboard.view' (get_kpis) หรือ 'report.view' (get_report) · ตัดขอบเขตด้วย app.kpi_scope และ app.kpi_in_scope (ข้อ 9.4.1 · 12.4) · KPI ที่ไม่มีการผูกพนักงาน (UNIQUE/NEW/RETURNING/BUYERS/REPEAT_BUYERS/REPEAT_RATE/DUPLICATE_RATE/MISSING_REQUIRED_RATE) คืน NULL เมื่อมีสาขา TEAM/OWN · KPI แบบ "ณ app.clock()" ไม่มี prev_value · ภายใน ไม่ GRANT (เรียกจาก api.get_kpis / api.get_report) |
| `kpi_display(p_kind text, p_value numeric)` | `text` | INVOKER | IMMUTABLE | `\` | – | – |
| `kpi_get(p jsonb, p_gk text, p_side text, p_key text)` | `numeric` | INVOKER | IMMUTABLE | `\` | – | อ่านค่า measure จาก map ของ app.kpi_compute (ไม่มี/ไม่ใช่ตัวเลข → NULL) · ภายใน ไม่ GRANT |
| `kpi_group(p jsonb, p_gk text)` | `jsonb` | INVOKER | IMMUTABLE | `\` | – | สร้างกลุ่มใน map ของ app.kpi_compute ถ้ายังไม่มี (คีย์ '' = กลุ่ม NULL) · ภายใน ไม่ GRANT |
| `kpi_in_scope(p_branch uuid, p_owner uuid, p_full uuid[], p_team uuid[], p_own uuid[], p_pairs text[], p_me uuid)` | `boolean` | INVOKER | IMMUTABLE | `\` | – | ⟨scope(b, o)⟩ ของ KPI (CANONICAL ข้อ 9.4.1 · 12.4): สาขา BRANCH/ORG ผ่านทุกแถว · สาขา TEAM ผ่านเมื่อคู่ (สาขา, owner) อยู่ใน app.team_scope_pairs · สาขา OWN ผ่านเมื่อ owner = ผู้เรียก · **ผูกด้วย owner เท่านั้น ไม่ใช้ created_by สำรอง** (ข้อ 12.4) · แถวที่ owner ว่างจึงไม่ผ่าน TEAM/OWN · ภายใน ไม่ GRANT |
| `kpi_period(p_preset text, p_start date, p_end date)` | `TABLE(period_start timestamp with time zone, period_end timestamp with time zone, cmp_start timestamp with time zone, cmp_end timestamp with time zone)` | **DEFINER** | STABLE | `\` | – | ขอบช่วงปัจจุบันและช่วงเปรียบเทียบของ preset (CANONICAL ข้อ 12.0) · ทุกช่วงเป็นครึ่งเปิด [start, end) ขอบวันเที่ยงคืน Asia/Bangkok · คิดจาก app.clock() (ข้อ 1.2) · TODAY เทียบ [วันเดียวกันสัปดาห์ก่อน 00:00, app.clock() − 7 วัน) · THIS_MONTH/THIS_QUARTER เทียบช่วงวันที่ตรงกันของเดือน/ไตรมาสก่อนและตัดที่สิ้นเดือนถ้าสั้นกว่า · CUSTOM ใช้ p_start/p_end (p_end เป็นขอบเปิด · ยาว 1–366 วัน) · preset อื่นละเลย p_start/p_end (ข้อ 9.4.1) · ภายใน ไม่ GRANT |
| `kpi_put(p jsonb, p_gk text, p_side text, p_key text, p_val numeric)` | `jsonb` | INVOKER | IMMUTABLE | `\` | – | เก็บค่า measure ลง map ของ app.kpi_compute · ภายใน ไม่ GRANT |
| `kpi_rate(p_num numeric, p_den numeric)` | `numeric` | INVOKER | IMMUTABLE | `\` | – | สัดส่วนที่ยังไม่ปัด · ตัวตั้งหรือตัวหารเป็น NULL หรือตัวหาร 0 → NULL (แสดง '–' · CANONICAL ข้อ 1.3 · 9.4.1) |
| `kpi_row(p_code text, p_gk text, p_label text, p_kind text, p_value numeric, p_prev numeric, p_num numeric, p_den numeric, p_target boolean, p_extra jsonb)` | `jsonb` | INVOKER | IMMUTABLE | `\` | – | หนึ่งแถวผลลัพธ์ของ api.get_kpis: code · group_key · group_label · kind · value (ดิบ · อัตราเป็นสัดส่วน 0–1) · numerator · denominator · prev_value · display · change_display (ปัดตามข้อ 1.3) · target_met (เทียบค่าไม่ปัด) · extra · ภายใน ไม่ GRANT |
| `kpi_scope(p_permission text, p_branch_ids uuid[])` | `TABLE(sel_ids uuid[], full_ids uuid[], team_ids uuid[], own_ids uuid[], pair_keys text[], is_partial boolean)` | **DEFINER** | STABLE | `\` | – | แบ่งสาขาที่ขอออกตาม scope สูงสุดต่อสาขาสำหรับ KPI/รายงาน (CANONICAL ข้อ 9.4.1 · 12.4): sel_ids = p_branch_ids ∩ สาขาของสิทธิ์ (p_branch_ids NULL = ทุกสาขาในสิทธิ์ · สาขาที่ไม่มีสิทธิ์ถูกตัดทิ้งเงียบ ๆ) · full_ids = BRANCH/ORGANIZATION · team_ids = TEAM · own_ids = OWN · pair_keys = 'branch:staff' ของ app.team_scope_pairs · is_partial = มีสาขาที่เป็น TEAM/OWN → KPI ที่ไม่มีการผูกพนักงานคืน NULL (ข้อ 12.4) · ภายใน ไม่ GRANT |
| `mask_contact(p_contact_type crm.contact_type, p_normalized text)` | `text` | INVOKER | IMMUTABLE | `\` | – | ค่าปิดบังของช่องทางติดต่อ (ข้อ 6.4) ที่ authenticated อ่านได้: PHONE มือถือ +66812345678 → 081-XXX-5678 · เบอร์บ้าน +6621234567 → 02-XXX-4567 · EMAIL อักษรแรก + ***@ + โดเมน (somchai.j@example.com → s***@example.com) · LINE_ID/FACEBOOK/INSTAGRAM/TIKTOK 2 อักษรแรก + *** (somchai_j → so***) · LINE_USER_ID → — (ไม่แสดง) · หมายเหตุผู้เขียน: เบอร์บ้าน 9 หลักทุกจังหวัดใช้รูป 2 หลัก-XXX-4 หลักท้ายตามตัวอย่าง 02 · เบอร์รูปแบบอื่น (ต่างประเทศ/ผิดรูป) แสดง XXX-4 หลักท้าย (≥ 8 หลัก) หรือ XXX |
| `mask_pii_text(p_value text)` | `text` | INVOKER | IMMUTABLE | `\` | – | ค่าปิดบังของข้อความ pii ทั่วไปใน audit (ข้อ 9.5): เบอร์ไทยทั้งค่า → รูปแบบข้อ 6.4 · อีเมลทั้งค่า → s***@โดเมน · อื่น ๆ → อักษรแรก + *** · หมายเหตุผู้เขียน: CANONICAL ให้ตัวอย่างเฉพาะเบอร์ ("081-XXX-1234") รูปแบบของข้อความอื่นกำหนดโดยผู้เขียน |
| `next_running_number(p_scope_key text)` | `bigint` | **DEFINER** | VOLATILE | `\` | – | ออกเลขถัดไปของตัวนับ (ข้อ 6.1) ด้วย upsert ตามข้อความใน CANONICAL · แถวตัวนับถูกล็อกจนจบทรานแซกชันจึงไม่ออกเลขซ้ำ · ไม่ GRANT (ใช้ใน trigger/RPC DEFINER) |
| `normalize_contact(p_contact_type crm.contact_type, p_raw text)` | `text` | INVOKER | IMMUTABLE | `\` | – | ค่า normalized ของช่องทางติดต่อ (ข้อ 6.4) ใช้ค้นแบบตรงทั้งค่าและตรวจซ้ำ · idempotent (normalize ซ้ำได้ค่าเดิม) · ค่าว่างหลังตัด → NULL · PHONE: เหลือตัวเลข (แปลงเลขไทย) · 0 + 8–9 หลัก → +66… (081-234-5678 → +66812345678 · 02-123-4567 → +6621234567) · +66/66/0066 นำหน้าคงเป็น +66… (ตัด 0 ที่เกินหลัง 66) · + ประเทศอื่นเก็บ +ตัวเลข · รูปแบบอื่นเก็บตัวเลขล้วน · EMAIL · FACEBOOK · INSTAGRAM · TIKTOK: ตัดช่องว่าง + ตัวพิมพ์เล็ก · LINE_ID: ตัดช่องว่าง + ตัวพิมพ์เล็ก + ตัด @ นำหน้า (@Somchai_J → somchai_j) · LINE_USER_ID: ตามที่ LINE ส่ง (ตัดเฉพาะช่องว่าง) · หมายเหตุผู้เขียน: "ตัดช่องว่าง" ตีความเป็นตัดทุกตำแหน่ง ไม่ใช่เฉพาะหัวท้าย |
| `notification_title(p_code text)` | `text` | INVOKER | IMMUTABLE | `\` | – | – |
| `nr_customer_label(p_customer_id uuid)` | `text` | **DEFINER** | STABLE | `\` | – | "คุณ" + customers.display_name สำหรับ notifications.body (ข้อ 3.5 · 11.1) · ลูกค้า ANONYMIZED ได้ชื่อ "ลูกค้านิรนาม CUS-…" ตามข้อ 10.4 · ภายใน ไม่ GRANT |
| `nr_join(VARIADIC p_parts text[])` | `text` | INVOKER | IMMUTABLE | `\` | – | ต่อชิ้นส่วนข้อความของ notifications.body ด้วย " · " และตัดชิ้นที่ว่าง (แม่แบบข้อ 11.1) · ภายใน ไม่ GRANT |
| `nr_staff_label(p_staff_id uuid)` | `text` | **DEFINER** | STABLE | `\` | – | ชื่อที่แสดงของพนักงานสำหรับ body ({ผู้รับผิดชอบ} · {ผู้กระทำ} ของข้อ 11.1) · ภายใน ไม่ GRANT |
| `owner_teams(p_staff uuid, p_branch uuid)` | `TABLE(team_id uuid, team_name text)` | **DEFINER** | STABLE | `\` | – | ทีมปัจจุบันของ owner ในสาขาของแถว (CANONICAL ข้อ 7.1 · 12.4 "ทีมปัจจุบันของ owner") · ใช้จัดกลุ่ม p_group_by = 'TEAM' · owner ที่อยู่หลายทีมนับในทุกทีม (ข้อ 12.4) · owner ว่างหรือไม่อยู่ทีมใด → ไม่มีแถว → กลุ่ม NULL · ภายใน ไม่ GRANT |
| `pii_columns()` | `TABLE(table_schema text, table_name text, column_name text, description text)` | INVOKER | STABLE | `\` | – | รายการคอลัมน์ป้าย pii (ข้อ 9.5 · 10.1) = คอลัมน์ใน crm/core/ref ที่ COMMENT ขึ้นต้นด้วย "[pii]" — แหล่งเดียวกับ data dictionary (tools/db/gen-data-dictionary.mjs) · ใช้โดย audit.log_row_change() (ปิดบัง + hash) และผู้เขียน app.anonymize_customer (ล้างค่า ข้อ 10.4) · เพิ่มคอลัมน์ pii = ใส่ COMMENT '[pii] …' ใน migration |
| `r_branch_managers(p_branch_id uuid)` | `SETOF uuid` | **DEFINER** | STABLE | `\` | – | R_BRANCH_MANAGERS (ข้อ 11.1): BRANCH_MANAGER ที่ ACTIVE และ assignment ยังมีผลของสาขานั้น · ภายใน ไม่ GRANT |
| `r_org_role(p_role_code text, p_organization_id uuid)` | `SETOF uuid` | **DEFINER** | STABLE | `\` | – | พนักงาน ACTIVE ที่ถือบทบาทระดับองค์กร (BUSINESS_ADMIN · EXECUTIVE · MARKETING) · ใช้หาผู้รับ R_BA (ข้อ 11.1) · ภายใน ไม่ GRANT |
| `r_sv_bm(p_branch_id uuid)` | `SETOF uuid` | **DEFINER** | STABLE | `\` | – | R_SV_BM (ข้อ 11.1): BRANCH_MANAGER ของสาขา ∪ SUPERVISOR ของสาขาที่เป็นหัวหน้าทีมอย่างน้อย 1 ทีมในสาขานั้น (ข้อ 7.1) · ภายใน ไม่ GRANT |
| `r_team_leader(p_owner_staff_id uuid, p_branch_id uuid)` | `SETOF uuid` | **DEFINER** | STABLE | `\` | – | R_TEAM_LEADER (ข้อ 11.1): หัวหน้าทีมปัจจุบันของ owner ในสาขาของรายการ · ตัด owner ออก (การยกระดับไม่ส่งกลับไปที่ owner) · ภายใน ไม่ GRANT |
| `rate_limit_block(p_counter_key text, p_until timestamp with time zone)` | `void` | **DEFINER** | VOLATILE | `\` | – | – |
| `rate_limit_hit(p_counter_key text, p_per_day boolean)` | `jsonb` | **DEFINER** | VOLATILE | `\` | – | ตัวนับอัตราต่อผู้ใช้ (ข้อ 6.4 · 6.5 · 6.6 · 11.2) · เพดานอ่านจาก app.settings ด้วย key เดียวกับชื่อตัวนับ · คืน {allowed, hit_count, limit, blocked_until} |
| `readable_customer_ids()` | `SETOF uuid` | **DEFINER** | STABLE | `\` | `authenticated` | = app.customer_ids_in_scope('customer.read') (ข้อ 9.3) · ใช้เป็น read-through ของ visits · interactions · leads · opportunities · quotations · transaction_refs · notes (ข้อ 9.4) |
| `refresh_customer_activity(p_customer_id uuid)` | `void` | **DEFINER** | VOLATILE | `\` | – | คำนวณแคชของลูกค้าจากข้อเท็จจริง (ข้อ 3.2 · 3.5 · 6.3): first_seen_at = least(เดิม, กิจกรรมแรก) พร้อม first_branch_id/first_channel_code/first_source_code ของกิจกรรมนั้น (หมายเหตุผู้เขียน: ปรับ first_* เฉพาะเมื่อ first_seen_at ลดลง) · last_activity_at/last_branch_id = กิจกรรมล่าสุด · last_channel_code = interaction ล่าสุดที่ไม่ใช่ INTERNAL · has_open_followup = มี task FOLLOW_UP OPEN/IN_PROGRESS · has_new_lead = มี lead NEW · UPDATE เฉพาะเมื่อค่าเปลี่ยน · เรียกโดย app.trg_touch_customer_activity และผู้ทำงาน bulk (merge/seed/import) ครั้งเดียวต่อลูกค้าท้ายงาน · ไม่ GRANT |
| `refresh_customer_lifecycle(p_customer_id uuid)` | `text` | **DEFINER** | VOLATILE | `\` | – | คำนวณ crm.customers.lifecycle_stage ตามลำดับตรวจของข้อ 3.4: REPEAT (ซื้อ ≥ 2) → CUSTOMER (= 1) → OPPORTUNITY (มี opportunity เปิด) → LEAD (มี lead เปิด) → LOST (มี lead/opportunity LOST) → IDENTIFIED · ล็อกแถวลูกค้า FOR UPDATE ก่อน แล้ว UPDATE เมื่อ IS DISTINCT FROM · คืนค่าที่คำนวณ · เรียกจาก app.trg_refresh_lifecycle และท้ายงาน bulk (merge/seed/import) · ไม่ GRANT |
| `request_headers()` | `jsonb` | INVOKER | STABLE | `\` | – | – |
| `require_permission(p_permission text)` | `uuid` | **DEFINER** | STABLE | `\` | – | – |
| `require_staff()` | `uuid` | **DEFINER** | STABLE | `\` | – | – |
| `scope_branch_ids(p_permission text, p_min_scope core.data_scope)` | `uuid[]` | **DEFINER** | STABLE | `\` | `authenticated` | สาขาที่ผู้ใช้มีสิทธิ์นี้ที่ scope ≥ p_min_scope (ไม่นับ SYSTEM · ข้อ 9.3) · ว่าง = '{}' · policy ใช้รูป col = ANY ((SELECT app.scope_branch_ids(...))::uuid[]) เพราะ PostgreSQL 17 ตีความ ANY (subquery) เป็นอย่างอื่น (rls-spec H1) |
| `setting_int(p_key text, p_default integer)` | `integer` | **DEFINER** | STABLE | `\` | – | อ่านค่าตัวเลขจำนวนเต็มจาก app.settings (ข้อ 11.2) · ไม่มีคีย์หรือไม่ใช่ตัวเลข → p_default · ใช้ใน trigger (quotation.valid_days · sla.followup_remind_min) |
| `setting_int_at(p_key text, p_index integer, p_default integer)` | `integer` | **DEFINER** | STABLE | `\` | – | อ่านสมาชิกของค่าตั้งแบบ array ใน app.settings (ข้อ 11.2) เช่น escalation.overdue_hours = [24,48] · sla.opportunity_stale_days = [7,14] · ไม่มีคีย์/ไม่ใช่ตัวเลข → p_default · ภายใน ไม่ GRANT |
| `setting_time(p_key text, p_default time without time zone)` | `time without time zone` | **DEFINER** | STABLE | `\` | – | อ่านค่าตั้งแบบเวลา "HH:MM" จาก app.settings (ข้อ 11.2) เช่น notify.duplicate_digest_time · notify.data_missing_time · ภายใน ไม่ GRANT |
| `sha256_hex(p_value text)` | `text` | INVOKER | IMMUTABLE | `\` | – | – |
| `staff_admin_denial(p_target_staff_id uuid, p_permission text)` | `text` | **DEFINER** | STABLE | `\` | – | – |
| `staff_has_branch_assignment(p_staff_id uuid, p_branch_id uuid)` | `boolean` | **DEFINER** | STABLE | `\` | `authenticated` | staff ที่ ACTIVE มี assignment ที่ยังมีผลในสาขานั้นหรือไม่ (ข้อ 7.1 · 9.3) · ไม่ดู aal ของบัญชีเป้าหมาย · บทบาทองค์กรไม่นับ · ใช้ตรวจ owner ใหม่ (ข้อ 9.4.2) |
| `staff_ids_with_role(p_role_code text, p_branch_id uuid)` | `SETOF uuid` | **DEFINER** | STABLE | `\` | – | – |
| `svc_guard()` | `void` | INVOKER | STABLE | `\` | – | – |
| `svc_set_actor(p_actor_user_id uuid, p_aal text)` | `uuid` | **DEFINER** | VOLATILE | `\` | – | – |
| `team_member_staff_ids(p_permission text)` | `uuid[]` | **DEFINER** | STABLE | `\` | `authenticated` | สมาชิกทีมทั้งหมดจาก app.team_scope_pairs (ไม่จับคู่สาขา · ข้อ 9.3) · ใช้ใน RPC/UI · policy ใช้ team_scope_pairs แทน |
| `team_scope_pairs(p_permission text)` | `TABLE(branch_id uuid, staff_id uuid)` | **DEFINER** | STABLE | `\` | `authenticated` | คู่ (สาขา, สมาชิกทีม) ที่ผู้ใช้เป็นหัวหน้าทีมในสาขานั้นและสิทธิ์นี้เป็น scope TEAM (ข้อ 8.0 · 9.3) · policy ใช้ (branch_id, owner_staff_id) IN (SELECT ... FROM app.team_scope_pairs(p)) เพื่อไม่ยุบคู่สาขา–ทีมข้ามสาขา |
| `touch_updated_at()` | `trigger` | INVOKER | VOLATILE | `\` | – | trigger BEFORE UPDATE ทั่วไป: ตั้ง updated_at = now() (เวลาทรานแซกชัน) ทุกครั้งที่แถวถูกแก้ · ติดทุกตารางที่มีคอลัมน์ updated_at ด้วยชื่อ trigger "trg_touch_updated_at" · ไม่ตั้ง updated_by (ผู้เขียน RPC/trigger ของแต่ละตารางตั้งจาก app.current_staff_id()) · ไม่ต้อง GRANT EXECUTE (trigger ไม่ถูกตรวจสิทธิ์ EXECUTE) |
| `transition_denied(p_code text)` | `void` | INVOKER | STABLE | `\` | `authenticated` | ยกข้อผิดพลาด SQLSTATE 42501 · MESSAGE = JCRM-Tnn · DETAIL อังกฤษ · HINT ภาษาไทยที่ UI แสดง (แคตตาล็อกข้อ 7.4 ของ rls-spec · ข้อ 9.1) · ใช้ร่วมกันระหว่าง app.enforce_row_transition และ RPC ใน api |
| `trg_assign_running_number()` | `trigger` | **DEFINER** | VOLATILE | `\` | – | trigger BEFORE INSERT ออกเลขอ้างอิง (ข้อ 6.1 · 9.6) เมื่อแถวยังไม่มีเลข (seed/import ที่ใส่เลขเองไม่ถูกเขียนทับ และไม่เลื่อนตัวนับ): CUS-/LD-/OP-/QT-/TK-/MG-/DSR-/EX-{YYYY}-{NNNNNN} · RG-{YYYY}-{NNNN} (ปีจาก created_at Asia/Bangkok) · ST-{NNNN} (ตัวนับ ST) · visit: V-{branch}-{YYMMDD}-{NNN} ตัวนับ VISIT:{branch}:{YYYYMMDD} และ queue_no (WALK_IN) ตัวนับ QUEUE:{branch}:{YYYYMMDD} (วันจาก started_at) · ตัวอย่าง created_at 2026-12-31T17:30:00Z = 1 ม.ค. 2027 00:30 น. Asia/Bangkok → CUS-2027-… |
| `trg_check_role_exclusivity()` | `trigger` | **DEFINER** | VOLATILE | `\` | – | trigger BEFORE INSERT/UPDATE ของ core.staff_role_assignments: SELECT … FOR UPDATE แถว core.staff_profiles แล้วปฏิเสธ (23514) เมื่อช่วงเวลามีผลซ้อนกับ assignment อื่นของคนเดียวกันที่ (1) ฝั่งหนึ่งเป็น SYSTEM_ADMIN อีกฝั่งเป็นบทบาทธุรกิจ (ข้อ 7.1) (2) MARKETING กับ BUSINESS_ADMIN (ข้อ 8.2 · [รอยืนยัน Q22]) · ช่วงเวลา [valid_from, coalesce(valid_to, ∞)) · การถอนที่ร่น valid_to ไม่ถูกตรวจ |
| `trg_check_team_member_assignment()` | `trigger` | **DEFINER** | VOLATILE | `\` | – | trigger BEFORE INSERT/UPDATE ของ core.team_members: สมาชิก (รวมหัวหน้า) ต้องมี staff_role_assignments ที่ยังไม่สิ้นสุดในสาขาของทีม (ข้อ 7.1 "สมาชิกต้องมี assignment ในสาขาของทีม") · หมายเหตุผู้เขียน: กติกา "SUPERVISOR@สาขา X ใช้ได้เมื่อเป็น is_leader ของทีมในสาขา X" เป็นเงื่อนไขตอนประเมินสิทธิ์ (helper ข้อ 9.3) ไม่บังคับตอนมอบบทบาท เพราะลำดับที่ CANONICAL กำหนดคือ มอบบทบาทตอนเชิญ (ข้อ 7.3) → เพิ่มเป็นสมาชิก/หัวหน้าทีม (ต้องมี assignment ก่อน) |
| `trg_guard_core_row()` | `trigger` | **DEFINER** | VOLATILE | `\` | – | trigger trg_15_guard_core_row (SECURITY DEFINER): ห้ามลบแถว core.staff_role_assignments · core.staff_profiles · core.role_grant_requests (ข้อ 7.1–7.3) · assignment แก้ได้เฉพาะ valid_to revoked_by revoke_reason และขยายเวลาที่ถอนแล้วไม่ได้ (เปิดใช้งานใหม่ = มอบบทบาทใหม่) · ข้ามเมื่อ app.is_seed_mode() |
| `trg_guard_restricted_text()` | `trigger` | **DEFINER** | VOLATILE | `\` | – | trigger BEFORE INSERT/UPDATE ปฏิเสธข้อความอิสระที่มีเลขบัตรประชาชนไทย 13 หลัก checksum ถูกต้อง (ข้อ 10.1 · SQLSTATE 23514) · ชื่อคอลัมน์ที่ตรวจส่งเป็น argument ของ trigger · UPDATE ตรวจเฉพาะคอลัมน์ที่ค่าเปลี่ยน · การตรวจรูปแบบอยู่ใน app.contains_thai_national_id |
| `trg_link_customer_branch()` | `trigger` | **DEFINER** | VOLATILE | `\` | – | trigger AFTER INSERT / UPDATE OF customer_id, branch_id ของ visits interactions leads opportunities transaction_refs (ข้อ 6.6 · 9.6): upsert crm.customer_branches (first_linked_at = least · last_activity_at = greatest ของเวลาเหตุการณ์) · linked_via ตามตาราง VISIT INTERACTION LEAD OPPORTUNITY · transaction_refs ใช้ MANUAL_LINK · visit CANCELLED ไม่ผูก · การกันผูกลูกค้าที่มองไม่เห็นอยู่ที่ WITH CHECK ของ RLS (stage 3) · ทำงานแม้ app.bulk = on |
| `trg_mark_lead_contacted()` | `trigger` | **DEFINER** | VOLATILE | `\` | – | trigger AFTER INSERT / UPDATE OF direction, lead_id, customer_id ของ crm.interactions (ข้อ 4.3): interaction OUTBOUND ที่ lead_id = lead หรือ customer_id เดียวกัน และ occurred_at ≥ lead.created_at เปลี่ยน lead ที่ยัง NEW เป็น CONTACTED และ first_contacted_at = occurred_at (ประวัติสถานะเขียนโดย trigger ของ leads) · ข้ามเมื่อ app.bulk = on |
| `trg_quotation_sent_stage()` | `trigger` | **DEFINER** | VOLATILE | `\` | – | trigger AFTER INSERT / UPDATE OF status ของ crm.quotations (ข้อ 4.4): quotation เปลี่ยนเป็น SENT → opportunity แม่ที่ขั้น INTERESTED หรือ FOLLOW_UP เลื่อนเป็น QUOTATION · ขั้นอื่น (QUOTATION · WON · LOST) ไม่เปลี่ยน · ข้ามเมื่อ app.bulk = on |
| `trg_refresh_lifecycle()` | `trigger` | **DEFINER** | VOLATILE | `\` | – | trigger AFTER ROW แยกตาม event (ข้อ 3.4 ห้าม transition table หลาย event) บน leads (status) opportunities (stage) transaction_refs (ประเภท/ลูกค้า/opportunity): refresh lifecycle ของลูกค้าใหม่และลูกค้าเดิม · ข้ามเมื่อ app.bulk = on |
| `trg_row_defaults()` | `trigger` | **DEFINER** | VOLATILE | `\` | – | trigger BEFORE INSERT/UPDATE เติมค่าที่ CANONICAL กำหนดให้เกิดอัตโนมัติ เพื่อให้แถวผ่าน CHECK: visits: LEFT → outcome LEFT_BEFORE_SERVICE · IN_SERVICE → service_started_at (สร้าง = started_at · รับคิว = now()) (ข้อ 4.1) · leads: ช่องทาง is_live สร้างเป็น NEW → CONTACTED + first_contacted_at = created_at · เปลี่ยน NEW → CONTACTED/QUALIFIED ด้วยมือ → first_contacted_at = now() (ข้อ 4.3) · tasks: customer_id จาก lead/opportunity · remind_at = due_at − sla.followup_remind_min · completed_at/cancelled_at ตามสถานะ (ข้อ 4.7) · quotations: customer_id/branch_id/owner จาก opportunity · ส่งแล้ว sent_at = now() และ valid_until = วันที่ส่ง (Asia/Bangkok) + quotation.valid_days (ข้อ 4.6) · หมายเหตุผู้เขียน: ไม่ได้อยู่ในรายชื่อ trigger ข้อ 9.6 แต่เป็นกลไกของกติกาที่ CANONICAL เขียนว่า "อัตโนมัติ/ค่าเริ่มต้น" |
| `trg_stamp_row()` | `trigger` | INVOKER | VOLATILE | `\` | – | trigger BEFORE INSERT/UPDATE ชื่อ trg_90_stamp_row ทุกตารางใน crm · core · audit ที่มี organization_id created_by updated_by ครบ (ข้อ 19.2 ข้อ 1) · ทำงานเฉพาะ current_user = 'authenticated' (ผู้ใช้เขียนตารางตรง) · INSERT ตั้ง organization_id/created_by/updated_by ทับค่าที่ส่งมา · UPDATE ตั้ง updated_by · SECURITY INVOKER เพื่อให้ RPC/trigger DEFINER · งานระบบ · seed ตั้งค่าเอง |
| `trg_sync_expected_amount()` | `trigger` | **DEFINER** | VOLATILE | `\` | – | trigger AFTER INSERT/UPDATE/DELETE ของ crm.opportunity_items: opportunities.expected_amount = Σ(quantity × unit_price) ของ items (ไม่มี item = 0) (ข้อ 6.10) · ทำงานแม้ app.bulk = on |
| `trg_sync_next_action_task()` | `trigger` | **DEFINER** | VOLATILE | `\` | – | trigger AFTER INSERT/UPDATE ของ crm.leads และ crm.opportunities (ข้อ 4.4 · 9.6): รายการเปิดอยู่ต้องมี task is_next_action ที่ยังไม่ปิดหนึ่งใบ (task_type_code = next_action_type_code · title = next_action · due_at = next_action_at · owner/team/priority/branch/customer ตามแม่ · remind_at เลื่อนตาม due_at ด้วย trg_row_defaults) — ไม่มีใบเปิดก็สร้างใหม่ (รวมหลังใบเดิม DONE) · รายการปิด (CONVERTED/WON/LOST) → ใบที่ยังไม่ปิดเป็น CANCELLED · ทำงานเมื่อคอลัมน์ข้างต้นเปลี่ยน · ข้ามเมื่อ app.bulk = on (seed/merge จัดการ task เอง) |
| `trg_sync_note_summary()` | `trigger` | **DEFINER** | VOLATILE | `\` | – | trigger AFTER INSERT / UPDATE OF is_pinned, body, customer_id / DELETE ของ crm.customer_notes: customers.note_summary = body ของโน้ตที่ปักหมุดล่าสุด (ไม่มี = NULL) (ข้อ 6.3) · หมายเหตุผู้เขียน: "ล่าสุด" เรียงตาม created_at เพราะไม่มีคอลัมน์เวลาปักหมุด · ทำงานแม้ app.bulk = on |
| `trg_touch_customer_activity()` | `trigger` | **DEFINER** | VOLATILE | `\` | – | trigger AFTER INSERT/UPDATE/DELETE ของ visits interactions leads opportunities transaction_refs tasks (ข้อ 3.2 · 6.3 · 9.6): เมื่อคอลัมน์ที่มีผลเปลี่ยน (ลูกค้า เวลา สถานะ สาขา ช่องทาง) เรียก app.refresh_customer_activity ของลูกค้าใหม่และลูกค้าเดิม (กรณีย้าย customer_id) · app.bulk = on: ทำเฉพาะ first_seen_at = least(…) ของแถวใหม่ แคชอื่นให้ผู้ทำงาน bulk refresh เอง |
| `trg_write_status_history()` | `trigger` | **DEFINER** | VOLATILE | `\` | – | trigger AFTER INSERT / UPDATE OF status (leads) · stage (opportunities) เขียน crm.lead_status_history / crm.opportunity_stage_history (ข้อ 4.5 · 9.6): from (NULL ตอนสร้าง) · to · changed_by = app.current_staff_id() · changed_at = created_at (สร้าง) / closed_at (ปิด) / first_contacted_at (lead ได้การตอบกลับแรกในการเปลี่ยนนี้) / now() · reason = set_config('app.status_reason', …) ของทรานแซกชัน หรือ lost_reason_code เมื่อ LOST · ทำงานแม้ app.bulk/seed_mode (ข้อ 13.0 ข้อ 7) |
| `write_access_log(p_action text, p_customer_id uuid, p_contact_id uuid, p_visit_id uuid, p_branch_id uuid, p_purpose text, p_hashes text[], p_result_count integer, p_detail jsonb)` | `void` | **DEFINER** | VOLATILE | `\` | – | เขียน audit.access_logs (ข้อ 9.5) · เก็บ sha256 ของค่า normalized ไม่เก็บค่าจริง |
| `write_audit(p_action text, p_entity_type text, p_entity_id text, p_entity_ref text, p_branch_id uuid, p_before jsonb, p_after jsonb, p_changed text[], p_reason text)` | `void` | **DEFINER** | VOLATILE | `\` | – | เขียน audit.audit_logs จาก RPC สำหรับตารางที่ไม่มี trigger audit.log_row_change (ข้อ 9.5) |

### 6.audit — `audit` (5 ฟังก์ชัน)

| ฟังก์ชัน | คืนค่า | security | volatility | search_path | GRANT EXECUTE | คำอธิบาย |
|---|---|---|---|---|---|---|
| `deny_change()` | `trigger` | INVOKER | VOLATILE | `\` | – | trigger BEFORE UPDATE/DELETE (ต่อแถว) และ BEFORE TRUNCATE (ต่อคำสั่ง) ของตาราง log ใน audit (ข้อ 9.5): ปฏิเสธด้วย SQLSTATE 42501 ยกเว้น (1) DELETE เมื่อ current_user = 'audit_retention' (2) UPDATE ของ audit.audit_logs ที่เปลี่ยนเฉพาะ before/after เมื่อ app.audit_redaction = 'on' · SECURITY INVOKER เพื่อให้ current_user เป็น role ที่สั่งจริง · สำเนา prod เพื่อทดสอบ (tools/db/anonymize.sql) ต้อง ALTER TABLE … DISABLE TRIGGER ก่อน TRUNCATE ในฐานะ owner |
| `entity_code(p_table_name text)` | `text` | INVOKER | IMMUTABLE | `\` | – | ชื่อ ENTITY ของ action {ENTITY}_{VERB} จากชื่อตาราง (เอกพจน์ ตัวพิมพ์ใหญ่): customers → CUSTOMER · customer_contacts → CUSTOMER_CONTACT · opportunities → OPPORTUNITY · customer_addresses → CUSTOMER_ADDRESS · branches → BRANCH · staff_profiles → STAFF · data_subject_requests → DSR (ตามชื่อ action ในข้อ 9.5) |
| `log_row_change()` | `trigger` | **DEFINER** | VOLATILE | `\` | – | trigger AFTER INSERT/UPDATE/DELETE ต่อแถว (ข้อ 9.5 · SECURITY DEFINER · ไม่ GRANT) · ข้ามเมื่อ app.is_seed_mode() · UPDATE ที่เปลี่ยนเฉพาะ updated_at updated_by last_activity_at lifecycle_stage first_seen_at note_summary ไม่บันทึก (หมายเหตุผู้เขียน: รวมแคชอีก 4 คอลัมน์ของข้อ 6.3 last_channel_code last_branch_id has_open_followup has_new_lead เพราะเป็นแคชชุดเดียวกับ last_activity_at ที่ trigger ปรับ) · before/after = ภาพทั้งแถว (to_jsonb) โดยคอลัมน์ pii เป็น {"masked","sha256"} · changed_fields = คอลัมน์ที่เปลี่ยน (UPDATE) · ผู้กระทำ: app.current_staff_id() → STAFF มิฉะนั้น SYSTEM (RPC/งานระบบตั้ง app.actor_type = SYSTEM\|INTEGRATION และ app.actor_label ได้) · aal จาก auth.jwt() · ip/user_agent/device_id/request_id จาก request.headers คีย์ x-client-ip x-client-ua x-device-id x-request-id · reason จาก app.audit_reason |
| `pii_json(p_value jsonb, p_contact_type text)` | `jsonb` | INVOKER | IMMUTABLE | `\` | – | แปลงค่าคอลัมน์ pii เป็น {"masked": …, "sha256": …} (ข้อ 9.5) · NULL → null · p_contact_type (ของ crm.customer_contacts) → mask ตาม app.mask_contact และ hash ค่า normalized · ข้อความอื่น → app.mask_pii_text + sha256 ของข้อความ · jsonb/ตัวเลข → "***" + sha256 ของ text · hash ไม่มี salt ใช้เทียบค่าเท่ากันได้ จึงอ่านได้เฉพาะผู้มี audit.read |
| `trg_guard_export_request()` | `trigger` | **DEFINER** | VOLATILE | `\` | – | trigger trg_12_guard_export_request (SECURITY DEFINER): audit.export_requests เป็นตาราง workflow (ข้อ 19.1 ข้อ 13) · ห้ามลบ · INSERT ได้เฉพาะ REQUESTED หรือ APPROVED/REJECTED ที่ approved_by ว่างของ BRANCH_MANAGER หรือ REJECTED ที่เกินเพดาน (ข้อ 8.2) · ข้อมูลตอนยื่นแก้ไม่ได้ · download_count ลดไม่ได้ · เปลี่ยนสถานะได้ตามเส้นทาง REQUESTED→APPROVED/REJECTED→GENERATED→DOWNLOADED→EXPIRED · ข้ามเมื่อ app.is_seed_mode() |

### 6.api — `api` (58 ฟังก์ชัน)

| ฟังก์ชัน | คืนค่า | security | volatility | search_path | GRANT EXECUTE | คำอธิบาย |
|---|---|---|---|---|---|---|
| `acknowledge_unrecorded_visit(p_visit_id uuid)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | รับทราบ visit ที่ระบบปิดให้ (ตั้ง unrecorded_ack_by/_at · ข้อ 9.6) |
| `activate_self()` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | เปิดใช้งานบัญชีของตนเองหลังรับคำเชิญ (ข้อ 7.3 ข้อ 3) |
| `anonymize_customer(p_customer_id uuid, p_dsr_id uuid)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | ทำข้อมูลนิรนาม (ข้อ 10.4) · ต้องมี customer.anonymize 🔐 · DSR VERIFIED ที่ verified_by ≠ ผู้เรียก · ข้ามเมื่อ legal_hold · ≤ dsr.anonymize_per_day |
| `assign_owner(p_entity_type text, p_entity_id uuid, p_to_staff_id uuid, p_reason_code text, p_note text, p_to_branch_id uuid)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | เปลี่ยนผู้รับผิดชอบ/ทีม/สาขา (ข้อ 9.4.2 · rls-spec ข้อ 8.3 · ทางเดียว) · บันทึก crm.ownership_changes และแจ้ง *_ASSIGNED |
| `assign_role(p_target_staff_id uuid, p_role_code text, p_branch_id uuid, p_reason text)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | มอบบทบาท (ข้อ 7.2 · PM ข้อ 6.1) · EXECUTIVE/BUSINESS_ADMIN/SYSTEM_ADMIN ต้องใช้คำขอ |
| `build_dsr_package(p_dsr_id uuid)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | แพ็กเกจข้อมูลของลูกค้ารายเดียวสำหรับ ACCESS/PORTABILITY (ข้อ 10.4 · ไม่ผ่านเพดาน export) |
| `can_assign_role(p_target_staff_id uuid, p_role_code text, p_branch_id uuid)` | `boolean` | **DEFINER** | STABLE | `\` | `authenticated` | true/false ตาม PM ข้อ 6.1 (ไม่ raise) · Edge Function invite-staff เรียกด้วย JWT ของผู้เชิญ |
| `close_visit(p_visit_id uuid, p_outcome_code text, p jsonb)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | ปิด visit พร้อม outcome (ข้อ 4.1 · 4.2) · NOT_INTERESTED ต้องมี lost_reason_code และปิด lead ของ visit นั้นเป็น LOST · แก้ outcome ได้ภายในวันธุรกิจเดียวกัน · UNRECORDED ระบบตั้งเท่านั้น |
| `convert_lead(p_lead_id uuid, p jsonb)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | แปลง lead เป็นโอกาสขาย (ข้อ 4.3 · ทางเดียว) · ต้องมี lead.update และ opportunity.create บน lead |
| `create_dsr(p jsonb)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | รับคำขอเจ้าของข้อมูลที่หน้าร้าน (ข้อ 10.4) · เก็บช่องทางผู้ยื่นแบบปิดบัง |
| `decide_duplicate(p_decision_id uuid, p_status text, p_note text)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | ยืนยัน "คนละคน" (ข้อ 6.7) · ผู้ตัดสิน ≠ ผู้สร้างแถว |
| `decide_export(p_export_id uuid, p_approve boolean, p_note text)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | อนุมัติ/ปฏิเสธคำขอส่งออก (PM ข้อ 7.2) · ผู้อนุมัติตาม export.limits[role].approver_role |
| `decide_role_grant(p_request_id uuid, p_approve boolean, p_note text)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | อนุมัติ/ปฏิเสธคำขอบทบาทสูง (PM ข้อ 6.3) · ผู้ตัดสิน ≠ ผู้ยื่น ≠ ผู้รับ ≠ รหัสพนักงานเดียวกับผู้รับ |
| `disable_staff(p_staff_id uuid, p_reason text)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | ปิดใช้งานผู้ใช้ (ข้อ 7.3 ข้อ 4–5) · โอน opportunity ให้ผู้จัดการสาขา (staff_code น้อยสุด) · lead/task → owner ว่าง + LEAD_UNASSIGNED |
| `find_customer_candidates(p_visit_id uuid, p_phone text, p_line_id text, p_email text, p_first_name text, p_last_name text)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | ตรวจซ้ำก่อนสร้างลูกค้า (ข้อ 6.5) · ต้องมี customer.create และตัวระบุเต็มอย่างน้อย 1 · การ์ดย่อสำหรับลูกค้านอกขอบเขต · อัตรา security.search_per_hour / security.search_miss_per_hour · เขียน CUSTOMER_CANDIDATE_SEARCH (sha256 ของค่า normalized) |
| `get_customer_360(p_customer_id uuid)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | ข้อมูลหน้า Customer 360 (ข้อ 6.8 · ตัวเลขสรุปข้อ 3.3) · เขียน CUSTOMER_VIEWED ในทรานแซกชันเดียวกัน · เกิน security.customer_view_per_hour แจ้ง CUSTOMER_VIEW_LIMIT_EXCEEDED เท่านั้น (ไม่บล็อก) |
| `get_entity_history(p_entity_type text, p_entity_id uuid)` | `jsonb` | **DEFINER** | STABLE | `\` | `authenticated` | ประวัติการแก้ไขของรายการเดียว · ลูกค้าใช้ customer.update บนลูกค้ารายนั้นหรือ audit.read |
| `get_kpis(p_preset text, p_start date, p_end date, p_branch_ids uuid[], p_group_by text)` | `jsonb` | **DEFINER** | STABLE | `\` | `authenticated` | KPI ของ Dashboard และหน้ารายงาน (CANONICAL ข้อ 9.4.1 · 9.6 · 12.1–12.4) · ต้องมี dashboard.view ·<br>p_group_by = 'STAFF' ต้องมี report.staff_performance ในทุกสาขาที่ขอ · p_preset ∈ TODAY · YESTERDAY · LAST_7_DAYS ·<br>THIS_WEEK · LAST_30_DAYS (ค่าเริ่มต้น) · THIS_MONTH · LAST_MONTH · THIS_QUARTER · CUSTOM (ใช้ p_start/p_end · p_end เป็นขอบเปิด) ·<br>p_branch_ids = NULL หมายถึงทุกสาขาที่ผู้เรียกมีสิทธิ์ · สาขาที่ไม่มีสิทธิ์ถูกตัดทิ้ง · ไม่เหลือสาขา → 42501<br><br>รูปผลลัพธ์ (jsonb):<br>{<br>  "ok": true,<br>  "preset": "LAST_30_DAYS",<br>  "group_by": "NONE",<br>  "clock": "2026-09-11T03:24:00+00:00",<br>  "period": {"start": <ts>, "end": <ts>, "cmp_start": <ts>, "cmp_end": <ts>},<br>  "branch_ids": [<uuid>, ...],<br>  "scope": {"branch": [<uuid>], "team": [<uuid>], "own": [<uuid>], "partial": false},<br>  "rows": [<br>    {"code": "VISITS", "group_key": null, "group_label": null, "kind": "COUNT",<br>     "value": 3125, "numerator": null, "denominator": null, "prev_value": 2790,<br>     "display": "3,125", "change_display": "+12%", "target_met": null, "extra": null},<br>    {"code": "CONV_LEAD_TO_SALE", "group_key": null, "group_label": null, "kind": "RATE",<br>     "value": 0.2410313901, "numerator": 215, "denominator": 892, "prev_value": 0.2203389831,<br>     "display": "24.1%", "change_display": "+2.1 pp", "target_met": null, "extra": null}<br>  ]<br>}<br><br>ความหมายของคอลัมน์ในแต่ละแถว:<br>  code           รหัส KPI ของข้อ 12.1 · 12.2 · 12.3 (38 รหัส)<br>  group_key      ค่ามิติ: uuid สาขา/พนักงาน/ทีม · รหัสช่องทาง · รหัสสถานะ · NULL = ไม่จัดกลุ่ม หรือกลุ่ม "ไม่มีทีม/ไม่มีผู้รับผิดชอบ"<br>  group_label    ป้ายของกลุ่ม (ชื่อสาขา/พนักงาน/ทีม/ช่องทาง) · NULL สำหรับ STATUS (ป้ายไทยของ ENUM ไม่เก็บในฐานข้อมูล · ข้อ 4)<br>  kind           COUNT · MONEY · RATE (value เป็นสัดส่วน 0–1 ที่ยังไม่ปัด) · MINUTES<br>  value          ค่าดิบที่ยังไม่ปัด · NULL เมื่อคำนวณไม่ได้ (ตัวหาร 0 · ไม่มีมิตินี้ · ขอบเขต TEAM/OWN ของ KPI ที่ไม่ผูกพนักงาน)<br>  numerator      ตัวตั้ง (เฉพาะอัตรา) · LEAD_RESPONSE_MIN = จำนวน lead ในฐานมัธยฐาน<br>  denominator    ตัวหาร (เฉพาะอัตรา)<br>  prev_value     ค่าช่วงเปรียบเทียบ · NULL สำหรับ KPI แบบ "ณ app.clock()" (OPEN_* · TASKS_* · WON_LAST_7_DAYS* · DUPLICATE_RATE · MISSING_REQUIRED_RATE)<br>  display        ข้อความที่ปัดแล้วตามข้อ 1.3 ("3,125" · "฿3,332,700" · "24.1%" · "18 นาที" · "–")<br>  change_display ส่วนต่างที่ปัดแล้ว ("+12%" · "+2.1 pp" · "–" เมื่อไม่มีค่าก่อนหน้าหรือค่าก่อนหน้าเป็น 0)<br>  target_met     เทียบเป้าด้วยค่าที่ยังไม่ปัด: CAPTURE_RATE ≥ 0.95 · OUTCOME_COMPLETION ≥ 0.95 ·<br>                 FOLLOWUP_COMPLETION ≥ 0.90 · DUPLICATE_RATE < 0.02 · MISSING_REQUIRED_RATE < 0.02 · อื่น ๆ NULL<br>  extra          ข้อมูลเสริม · LEAD_RESPONSE_MIN = {"not_contacted": N} ("ยังไม่ติดต่อ N" ของข้อ 12.2) |
| `get_my_access()` | `jsonb` | **DEFINER** | STABLE | `\` | `authenticated` | โปรไฟล์ บทบาท และสิทธิ์ของผู้เรียก (ข้อ 9.6) · คืนทุก assignment ที่ยังมีผลตามเวลาพร้อมธง requires_mfa และ aal ปัจจุบัน |
| `get_report(p_code text, p_preset text, p_start date, p_end date, p_branch_ids uuid[], p_params jsonb)` | `jsonb` | **DEFINER** | STABLE | `\` | `authenticated` | รายงานหน้า 09 และหัวหน้า 12 (CANONICAL ข้อ 9.4.1 · 9.6 · 12.0 · 14.8) · ต้องมี report.view ·<br>p_code ∈ OVERVIEW · CUSTOMERS · SALES · CHANNELS · STAFF · BRANCHES · LOST_REASONS · DATA_QUALITY ·<br>p_code = 'STAFF' (หรือ p_params->>'group_by' = 'STAFF') ต้องมี report.staff_performance ในทุกสาขาที่ขอ ·<br>p_params รับ {"group_by": "..."} เพื่อเปลี่ยนมิติ (ค่าเริ่มต้น: CHANNELS → CHANNEL · STAFF → STAFF · BRANCHES → BRANCH · อื่น ๆ → NONE)<br><br>รูปผลลัพธ์ (jsonb): {"ok", "code", "preset", "group_by", "clock", "period", "branch_ids", "scope", "rows", "extra"}<br>  rows   แถวเดียวกับ api.get_kpis (กรองเฉพาะ KPI ของรายงานนั้น · STAFF และ BRANCHES คืนทุก KPI)<br>  extra  ส่วนเสริมรายรหัส<br>         SALES · LOST_REASONS → {"lost_reasons": [{"code","label_th","value","lead_value","display","pct","pct_display"}]}<br>                                5 อันดับแรก + "_OTHERS" (ป้าย "อื่น ๆ") เรียงมากไปน้อย · เท่ากันเรียง ref.lost_reasons.sort_order (ข้อ 5.5)<br>                                lead_value = จำนวนที่มาจาก crm.leads (คอลัมน์ "ในนั้นเป็น Lead" ของข้อ 13.4)<br>         CHANNELS             → {"channel_matrix": [{"branch_id","branch_code","branch_label","channel_code","value","display"}]}<br>                                ลูกค้าไม่ซ้ำ × สาขา × customers.first_channel_code (ข้อ 13.3) · NULL เมื่อขอบเขตมีสาขา TEAM/OWN<br>         DATA_QUALITY         → {"issues": [{"issue_code","branch_id","branch_code","value","display"}]}<br>         OVERVIEW             → {"walkin_by_branch": [แถว WALKIN_VISITS จัดกลุ่ม BRANCH]} |
| `get_settings()` | `jsonb` | **DEFINER** | STABLE | `\` | `authenticated` | ค่าตั้งที่ผู้เรียกมีสิทธิ์แก้ตาม editable_by (ข้อ 11.2) |
| `link_customer_to_branch(p_customer_id uuid, p_visit_id uuid)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | ผูกลูกค้าที่ยังมองไม่เห็นเข้าสาขาของ visit (ข้อ 6.6 · ทางเดียว) · เกิน security.link_per_day แจ้ง LINK_LIMIT_EXCEEDED ให้ผู้จัดการสาขา |
| `list_data_quality_issues(p_issue_code text, p_branch_ids uuid[])` | `jsonb` | **DEFINER** | STABLE | `\` | `authenticated` | รายการศูนย์คุณภาพข้อมูล (CANONICAL ข้อ 9.6 · 12.3) · ต้องมี data_quality.view · กรองตามขอบเขตของสิทธิ์นี้<br>(O = รายการที่ตนเป็นผู้ผูก · T = สมาชิกทีมที่ตนเป็นหัวหน้า · B/G = ทั้งสาขา/องค์กร) ·<br>p_issue_code = NULL คืนทุกชนิด · p_branch_ids = NULL คืนทุกสาขาที่มีสิทธิ์<br><br>รูปผลลัพธ์ (jsonb): {"ok", "issue_code", "branch_ids", "total", "counts", "rows"}<br>  counts [{"issue_code","branch_id","branch_code","value"}] — จำนวนต่อชนิดต่อสาขา (ไม่ขึ้นกับ p_issue_code)<br>  rows   [{"issue_code","entity_type","entity_id","customer_id","branch_id","owner_staff_id","detected_at"}] |
| `list_dsr(p jsonb)` | `jsonb` | **DEFINER** | STABLE | `\` | `authenticated` | รายการคำขอเจ้าของข้อมูล · dsr.manage เห็นทั้งหมด · ผู้รับคำขอเห็นของตน |
| `list_export_requests(p jsonb)` | `jsonb` | **DEFINER** | STABLE | `\` | `authenticated` | รายการคำขอส่งออกของตน + ที่ตนเป็นผู้อนุมัติ · ไม่คืน file_path |
| `list_integration_logs(p jsonb)` | `jsonb` | **DEFINER** | STABLE | `\` | `authenticated` | audit.integration_logs ตามสิทธิ์ integration.manage (ข้อ 9.6) |
| `list_role_grant_requests(p jsonb)` | `jsonb` | **DEFINER** | STABLE | `\` | `authenticated` | คำขอบทบาทตามสิทธิ์ role.decide / role.request / user.read (rls-spec ข้อ 8.2) |
| `list_staff(p jsonb)` | `jsonb` | **DEFINER** | STABLE | `\` | `authenticated` | รายชื่อผู้ใช้ตามขอบเขตของ user.read (G ทั้งองค์กร · B ตามสาขา · T ตามทีม · S บัญชีที่ไม่มีบทบาทธุรกิจ) |
| `merge_customers(p_survivor_id uuid, p_merged_id uuid, p_field_choices jsonb, p_reason text, p_duplicate_decision_id uuid)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | รวมลูกค้า (ข้อ 6.7) · ต้องมี customer.merge 🔐 บนทั้งสองราย · ย้ายทุกตารางลูก · snapshot ปิดบัง PII · refresh lifecycle ท้ายงาน |
| `open_visit(p jsonb)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | เปิดหรือแนบ visit + interaction ต้นทาง (ข้อ 3.3 · 19.3 ข้อ 1) · ไม่สร้าง lead อัตโนมัติ |
| `quick_capture(p jsonb)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | สร้างลูกค้า (ทางเดียวตามข้อ 6.2) ในทรานแซกชันเดียว: customer + contacts + consent PRIVACY_NOTICE (+ MARKETING) + visit/interaction ต้นทาง + lead อัตโนมัติตาม ref.interest_types.creates_lead (สถานะตามข้อ 4.3) + โน้ตแรก · คำนวณผู้สมัครซ้ำใหม่ฝั่ง server (19.3 ข้อ 2) และบังคับเหตุผล override เมื่อมีคะแนน ≥ 70 (ข้อ 6.5) · ต้องมี customer.create ในสาขา |
| `record_consent(p jsonb)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | บันทึกความยินยอมแบบ append-only (ข้อ 10.2) · MARKETING GRANTED ต้องมีธงอายุใน evidence (19.4 ข้อ 3) |
| `record_export_download(p_export_id uuid)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | บันทึกการดาวน์โหลดไฟล์ส่งออก (ข้อ 8.2) · ผู้ขอเท่านั้น · aal2 · < export.max_downloads · ภายใน export.link_ttl_hours |
| `record_report_export(p_code text, p_params jsonb)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | บันทึกการส่งออกรายงานตัวเลขรวม (CANONICAL ข้อ 9.6 · 14.8) · ต้องมี report.export · เขียน audit REPORT_EXPORTED (entity_type = EXPORT · entity_id/entity_ref = p_code · after = p_params) · ไม่ต้องอนุมัติ · ไม่มี PII ในไฟล์รายงาน (ข้อ 8.1) |
| `register_device(p_device_id text, p_branch_id uuid, p_is_shared_counter boolean)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | ลงทะเบียนอุปกรณ์ counter (ข้อ 9.2) · ต้องมี user.update scope BRANCH ของสาขานั้น |
| `request_export(p jsonb)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | ยื่นคำขอส่งออกข้อมูลลูกค้า (ข้อ 8.2 · PM ข้อ 7.1) · นับครั้ง/วันรวมที่ถูกปฏิเสธ · BRANCH_MANAGER อนุมัติทันที · เกินเพดานแถว = REJECTED |
| `request_role_grant(p_target_staff_id uuid, p_role_code text, p_request_type text, p_reason text)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | ยื่นคำขอบทบาทสูงชนิด GRANT/REVOKE (ข้อ 7.2) · แจ้ง EXECUTIVE ทุกคนยกเว้นผู้รับ |
| `reveal_address(p_address_id uuid, p_purpose text)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | เปิดที่อยู่เต็ม (ข้อ 6.4 · 19.1 ข้อ 5) · ใช้ตัวนับเดียวกับ reveal_contact |
| `reveal_contact(p_contact_id uuid, p_purpose text)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | เปิดค่าเต็มของช่องทางติดต่อ (ข้อ 6.4) · ต้องมี customer.pii.reveal · เขียน CONTACT_REVEALED ก่อนคืนค่า · เกิน security.reveal_per_hour คืนผลปฏิเสธโดยไม่ raise + แจ้ง REVEAL_LIMIT_EXCEEDED |
| `revoke_role(p_assignment_id uuid, p_reason text)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | ถอนบทบาท (PM ข้อ 6.2) · ตั้ง valid_to revoked_by revoke_reason เท่านั้น |
| `save_address(p jsonb)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | เพิ่ม/แก้ที่อยู่ (19.1 ข้อ 5) · value_masked = {อำเภอ} · {จังหวัด} |
| `save_contact(p jsonb)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | เพิ่ม/แก้ช่องทางติดต่อ (ข้อ 6.4) · ต้องมี customer.update บนลูกค้าและลูกค้าต้อง ACTIVE |
| `save_team(p jsonb)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | สร้าง/แก้ทีม (ข้อ 7.1) · ต้องมี team.manage ในสาขาของทีม |
| `search_audit(p jsonb)` | `jsonb` | **DEFINER** | STABLE | `\` | `authenticated` | ค้น audit log ธุรกิจ (ข้อ 9.5) · ต้องมี audit.read · คืนค่าปิดบังตามที่เก็บ |
| `search_customers(p_term text)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | ค้นหาทั่วไป (ข้อ 6.5) · เบอร์/อีเมล/LINE/IMEI/เลขอ้างอิงตรงทั้งค่า · ชื่อใช้ trigram · ผลแบ่งกลุ่มและกรองตามสิทธิ์ · ค่า contact คืนเป็น value_masked · เขียน CUSTOMER_SEARCH |
| `search_security_log(p jsonb)` | `jsonb` | **DEFINER** | STABLE | `\` | `authenticated` | log เข้าสู่ระบบ + audit ของบทบาท/ผู้ใช้/ตั้งค่า (ข้อ 9.5) · ไม่คืน access_logs และรายการของลูกค้า |
| `set_legal_hold(p_customer_id uuid, p_on boolean, p_reason text)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | ตั้ง/ยกเลิก legal hold ของลูกค้า (ข้อ 10.3) · ต้องมี dsr.manage 🔐 |
| `set_team_member(p_team_id uuid, p_staff_id uuid, p_is_leader boolean, p_active boolean)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | เพิ่ม/ถอด/ตั้งหัวหน้าสมาชิกทีม · สมาชิกต้องมี assignment ในสาขาของทีม |
| `svc_build_export_dataset(p_export_id uuid)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `service_role` | Edge Function generate-export: ชุดข้อมูลของคำขอที่ APPROVED พร้อม whitelist คอลัมน์และลายน้ำ (ข้อ 8.2) |
| `svc_expired_export_files()` | `jsonb` | **DEFINER** | STABLE | `\` | `service_role` | Edge Function cron-export-cleanup: ไฟล์ของคำขอที่ EXPIRED และยังไม่ถูกลบ (อ่านอย่างเดียว) |
| `svc_finalize_disable(p jsonb)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `service_role` | Edge Function disable-staff: ปิดคำเชิญที่ค้างและบันทึก STAFF_DISABLED หลัง ban ผู้ใช้ |
| `svc_mark_export_generated(p_export_id uuid, p_file_path text)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `service_role` | Edge Function generate-export: APPROVED → GENERATED + file_path · แจ้ง EXPORT_READY |
| `svc_prepare_invite(p jsonb)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `service_role` | Edge Function invite-staff: สร้าง staff_profiles (INVITED) + staff_invitations + assignment ก่อนออกลิงก์ (19.3 ข้อ 6) |
| `svc_reset_mfa_authorize(p jsonb)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `service_role` | Edge Function reset-mfa: ตรวจผู้กระทำตามข้อ 7.3 ข้อ 6 แล้วบันทึก MFA_RESET |
| `svc_resolve_staff_code(p_staff_code text)` | `jsonb` | **DEFINER** | STABLE | `\` | `service_role` | Edge Function staff-code-login: ST-NNNN → user_id (ห้ามส่งอีเมลออก · ข้อ 9.2) |
| `update_dsr(p_dsr_id uuid, p_status text, p jsonb)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | เปลี่ยนสถานะคำขอเจ้าของข้อมูล (ข้อ 10.4) · VERIFIED ตั้ง verified_by = ผู้เรียก + verification_method |
| `update_setting(p_key text, p_value jsonb)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | แก้ค่าตั้ง (ข้อ 11.2) · ตรวจสิทธิ์ตาม app.settings.editable_by · เขียน SETTINGS_UPDATED |
| `update_staff(p_staff_id uuid, p jsonb)` | `jsonb` | **DEFINER** | VOLATILE | `\` | `authenticated` | แก้โปรไฟล์ผู้ใช้ (PM ข้อ 6.5) · ผู้จัดการสาขาแก้อีเมลไม่ได้ |

## 7. ดัชนีคอลัมน์ `[pii]`

พบ **30 คอลัมน์** ที่ติดป้าย `[pii]` · audit เก็บเป็น `{"masked": …, "sha256": …}` (ข้อ 9.5) · `app.anonymize_customer` ล้างค่าเหล่านี้ (ข้อ 10.4) · ห้ามส่งออกนอกกติกาข้อ 8.2

| ตาราง | คอลัมน์ |
|---|---|
| `crm.customer_addresses` | `address_line` · `subdistrict` · `postal_code` |
| `crm.customer_consents` | `evidence` |
| `crm.customer_contacts` | `value_raw` · `value_normalized` |
| `crm.customer_merges` | `snapshot` |
| `crm.customer_notes` | `body` |
| `crm.customers` | `first_name` · `last_name` · `nickname` · `display_name` · `name_search` · `note_summary` |
| `crm.data_subject_requests` | `requester_name` · `note` |
| `crm.duplicate_decisions` | `override_note` |
| `crm.interactions` | `summary` |
| `crm.leads` | `next_action` · `lost_note` |
| `crm.notifications` | `title` · `body` |
| `crm.opportunities` | `next_action` · `lost_note` |
| `crm.task_comments` | `body` |
| `crm.tasks` | `title` · `description` |
| `crm.transaction_refs` | `device_imei` · `device_serial` · `summary` |

## 8. ผลการตรวจของ generator

ไม่พบข้อขัดแย้ง — ทุก ENUM มีป้ายไทยครบตาม CANONICAL ข้อ 4 · ทุกค่าในข้อ 3 ปรากฏใน CHECK จริง · ทุก view ตั้ง `security_invoker = true` · ทุกฟังก์ชันตั้ง `search_path`

---

สร้างโดย `tools/db/gen-data-dictionary.mjs` · ผลลัพธ์ deterministic (ไม่มีเวลาที่รันในไฟล์) จึงใช้ `git diff` ดูผลของ migration ได้โดยตรง
