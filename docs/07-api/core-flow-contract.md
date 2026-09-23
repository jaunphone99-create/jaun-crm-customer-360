# Core Flow Contract — JAUN CRM · Phase 1

> **สัญญาสำหรับเขียนโค้ด** ของ Core Flow `Login → รับลูกค้าเข้าร้าน → Quick Capture`
> เปิดไฟล์นี้ไฟล์เดียวแล้วลงมือได้ทันที ไม่ต้องย้อนไปอ่าน CANONICAL / api-spec / rls-spec / sitemap-screen-specs อีก
>
> **ลำดับความสำคัญเมื่อขัดกัน** (ใช้ตัดสินทุกข้อในไฟล์นี้)
> 1. `supabase/migrations/*.sql` — สิ่งที่ฐานข้อมูลทำจริง ชนะเสมอในเรื่องลายเซ็น · คีย์ที่คืน · ข้อความ error · เงื่อนไขสิทธิ์
> 2. `docs/00-brief/CANONICAL.md` — ชนะในเรื่องกติกาธุรกิจ ข้อความไทย และสิ่งที่ "ห้ามทำ"
> 3. `docs/07-api/api-spec.md` · `docs/06-ux/sitemap-screen-specs.md` · `docs/06-ux/design-system.md` — คำอธิบายประกอบ
> จุดที่สามแหล่งไม่ตรงกันถูกชี้ขาดแล้วในข้อ 9 ของไฟล์นี้
>
> ขอบเขต: หน้า 01 เข้าสู่ระบบ · 07 รับลูกค้าเข้าร้าน · 04 Quick Capture (`docs/00-brief/CANONICAL.md:2036-2050` — ลำดับพัฒนาที่อนุมัติแล้ว)

---

## สารบัญ

| ข้อ | เรื่อง |
|---|---|
| 1 | ข้อตกลงร่วมของทุกคำเรียก |
| 2 | RPC ที่ต้องเรียก (ตารางสัญญา) |
| 3 | การอ่าน/เขียนตารางตรงผ่าน PostgREST |
| 4 | แผนที่ข้อผิดพลาด |
| 5 | สเปกหน้าจอ 01 เข้าสู่ระบบ |
| 6 | สเปกหน้าจอ 07 รับลูกค้าเข้าร้าน |
| 7 | สเปกหน้าจอ 04 Quick Capture |
| 8 | กฎความปลอดภัยที่โค้ดต้องทำตาม + รายการ "ห้ามทำ" |
| 9 | โทเคน design system ที่ต้องใช้ |
| 10 | ตัวแปรสภาพแวดล้อมทุกตัว |
| 11 | ข้อขัดแย้งที่ชี้ขาดแล้ว + รายการรอยืนยัน |

---

## 1. ข้อตกลงร่วมของทุกคำเรียก

| # | กติกา | แหล่ง |
|---|---|---|
| C1 | ทุกฟังก์ชันใน schema `api` เป็น `SECURITY DEFINER` + `SET search_path = ''` · GRANT EXECUTE ให้ role `authenticated` เท่านั้น (`api.svc_*` ให้ `service_role` เท่านั้น) | `supabase/migrations/0011_api.sql:11-15` |
| C2 | บรรทัดแรกของทุก RPC คือ `app.require_staff()` หรือ `app.require_permission('<perm>')` **ยกเว้น** `api.activate_self()` และ `api.svc_*` | `supabase/migrations/0011_api.sql:12-13` · `0011_api.sql:97-129` |
| C3 | เรียก RPC ด้วย `supabase.schema('api').rpc('<ชื่อ>', { ...พารามิเตอร์ตามชื่อจริง })` · อ่านตารางด้วย `supabase.schema('crm').from('<ตาราง>')` | `docs/07-api/api-spec.md:64-68` |
| C4 | PostgREST เปิดเฉพาะ schema `api, crm, core, ref` — `app` `analytics` `audit` `restricted` **ไม่เปิด** และไม่มี GRANT ให้ `authenticated` | `docs/07-api/api-spec.md:64-68` · `supabase/migrations/0010_security.sql:86-92` |
| C5 | RPC ของหน้าจอคืน `jsonb` ก้อนเดียวที่มีคีย์ `ok` เสมอ — `{"ok": true, ...}` หรือ `{"ok": false, "code": "..."}` · ยกเว้น `api.can_assign_role` ที่คืน boolean | `docs/07-api/api-spec.md:92-102` |
| C6 | RPC ที่มีฟิลด์มากใช้พารามิเตอร์ชื่อ **`p`** เป็น jsonb (`quick_capture` · `open_visit` · `record_consent`) · คีย์ที่ไม่รู้จักใน `p` ถูกละเลย ไม่ error → Server Action ต้องตรวจรูปแบบเองเพื่อ UX · ค่าว่างของสตริงใน `p` = NULL | `docs/07-api/api-spec.md:92-102` · `supabase/migrations/0011_api.sql:576` |
| C7 | RPC ที่เป็น **VOLATILE** (เขียน access log/ตัวนับ) ต้องเรียกด้วย **HTTP POST เท่านั้น** — PostgREST รัน GET ในทรานแซกชัน read-only ทำให้ log เขียนไม่ได้ | `docs/04-security/security-design.md:392` |
| C8 | สิทธิ์ประเมินสดจากตารางทุกคำขอ · **ห้ามฝังบทบาท/สิทธิ์ลง JWT** · นาฬิกาที่ตัดสินสิทธิ์คือ `now()` เสมอ ไม่ใช่ `app.clock()` | `supabase/migrations/0011_api.sql:20` · `docs/04-security/security-design.md:374` |
| C9 | เซสชันเป็น cookie **HttpOnly · Secure · SameSite=Lax** → **ไม่มี Supabase browser client ที่ถือ session** · ทุกการเรียกที่ใช้เซสชัน (รวม MFA enroll/challenge/verify และ `functions.invoke`) อยู่ฝั่ง server | `docs/08-delivery/deployment-backup-recovery.md:198` (H4) · `docs/00-brief/CANONICAL.md:1918` |
| C10 | ตัวตนอ้างผ่าน `app.current_staff_id()` (ฝั่ง DB) และ `api.get_my_access()` (ฝั่ง frontend) เท่านั้น — ห้ามผูก business logic กับ Supabase Auth โดยตรง | `docs/00-brief/CANONICAL.md:1957-1958` · `supabase/migrations/0010_security.sql:100-103` · `web/src/lib/db/index.ts:7-12` |
| C11 | ทุกคำเรียกส่ง header `x-request-id` · `x-client-ip` · `x-client-ua` · `x-device-id` ต่อไปให้ PostgREST/Edge Function · ค่าเหล่านี้เป็น "ค่าที่รายงาน ไม่ใช่หลักฐาน" **ห้ามใช้ตัดสินสิทธิ์** | `docs/07-api/api-spec.md:82-84` · `docs/04-security/security-design.md:313` |
| C12 | ทุกการอ่าน/เขียนของแอปผ่าน `web/src/lib/db/index.ts` (`rpc()`) ที่เดียว เพื่อให้เปลี่ยนวิธีต่อ identity ได้โดยไม่แตะ RLS/หน้าจอ (IC-5) | `web/src/lib/db/index.ts:1-36` · `docs/00-brief/CANONICAL.md:1961` |

### 1.1 กติกา aal2 / MFA สำหรับ Core Flow นี้

- RPC ทั้ง 10 ตัวของ Core Flow **ไม่มีตัวใดตรวจ `app.is_aal2()` โดยตรง** (`app.is_aal2()` ปรากฏใน `0011_api.sql` เพียง 3 จุด: `api.request_export` · `api.record_export_download` · `api.svc_reset_mfa_authorize`)
- แต่ aal มีผลทางอ้อม: `app.effective_assignments()` ตัด assignment ของบทบาทที่ `core.roles.requires_mfa = true` ออกทั้งหมดเมื่อ JWT ไม่ใช่ `aal2` → ผู้ใช้บทบาทนั้นจะไม่มีสิทธิ์อะไรเลย (42501 ทุก RPC) — `supabase/migrations/0010_security.sql:105-152`
- **บทบาทที่ `requires_mfa = false` มีเพียง `STAFF` ตัวเดียว** — SUPERVISOR · BRANCH_MANAGER · MARKETING · OPERATIONS · BUSINESS_ADMIN · EXECUTIVE · SYSTEM_ADMIN ต้อง aal2 ทั้งหมด (`supabase/migrations/0002_core.sql:332-340`)
- สิทธิ์ที่ Core Flow ใช้ (`customer.create` `customer.read` `customer.consent.manage` `visit.create` `visit.read` `visit.update`) มี `requires_aal2 = false` ทุกช่อง (`supabase/migrations/0002_core.sql:464-524`)
- **สรุป: พนักงานหน้าร้าน (STAFF) ใช้ Core Flow ได้ที่ aal1 · หัวหน้าทีม/ผู้จัดการสาขาต้องผ่าน MFA challenge ก่อน มิฉะนั้นทุกปุ่มจะ 403**
- `app.is_aal2()` = `coalesce(auth.jwt()->>'aal','aal1') = 'aal2'` ตรวจในแต่ละคำขอ **ไม่ใช่สถานะที่ UI จำไว้** (`docs/04-security/rls-spec.md:218-221` · `docs/04-security/security-design.md:275`)

### 1.2 เพดานอัตรา (rate limit) ที่ Core Flow ชน

| คีย์ใน `app.settings` | ค่าเริ่มต้น | ใช้กับ | พฤติกรรมเมื่อเกิน |
|---|---:|---|---|
| `security.search_per_hour` | 60 | `api.search_customers` · `api.find_customer_candidates` | คืน `ok:false` + `code` **HTTP 200 ไม่ raise** (ตัวนับถูก commit) |
| `security.search_miss_per_hour` | 20 | ค้นด้วยตัวระบุเต็มแล้วไม่พบ | บล็อก 1 ชั่วโมง + แจ้ง `SEARCH_LIMIT_EXCEEDED` ถึง BUSINESS_ADMIN |
| `security.link_per_day` | 10 | `api.link_customer_to_branch` | **ยังผูกสำเร็จ** เพียงแจ้ง `LINK_LIMIT_EXCEEDED` ถึง BRANCH_MANAGER |
| `security.customer_view_per_hour` | 100 | `api.get_customer_360` | แจ้งเท่านั้น ไม่บล็อก |
| `security.reveal_per_hour` | 30 | `api.reveal_contact` | ปฏิเสธ (`REVEAL_LIMIT_EXCEEDED`) |
| `security.login_ip_per_15min` | 20 | หน้า Login (ต่อ IP / 15 นาที) | หน่วงเวลาเพิ่มขึ้น ไม่ล็อกบัญชี |
| `pdpa.current_notice_version` | `"PN-2026-01"` | ฉบับประกาศความเป็นส่วนตัว | – |

แหล่ง: `supabase/migrations/0001_foundation.sql:259-263` · `supabase/migrations/0011_api.sql:64-66` (คีย์ v2.2 สามตัวถูกเพิ่มแล้วในไฟล์นี้) · `supabase/migrations/0011_api.sql:341-373` (`app.rate_limit_hit`)

> **สำคัญ:** `ok:false` **ไม่ใช่ error** — ถ้า raise ตัวนับจะ rollback จึงออกแบบให้คืน HTTP 200 โดยเจตนา (`supabase/migrations/0011_api.sql:858-864, 925-931`)

---

## 2. RPC ที่ต้องเรียก

ตารางสรุป — รายละเอียดรายตัวอยู่ใต้ตาราง ลายเซ็นทุกบรรทัดคัดจาก `supabase/migrations/0011_api.sql` โดยตรง

| RPC | พารามิเตอร์ (ชื่อจริง) | คีย์ที่คืน | ต้อง MFA (aal2) | error ที่ต้องจับ | แหล่ง |
|---|---|---|:--:|---|---|
| `api.get_my_access()` | – | `ok` `aal` `staff` `roles[]` `permissions[]` `branches[]` `unread_notifications` | ไม่ | `42501` `JCRM-T00` | `0011_api.sql:2624-2681` |
| `api.activate_self()` | – | **2 รูป** ดูข้อ 2.2 | ไม่ | `42501` T00 · `42501` ×2 · `P0001` ×3 | `0011_api.sql:3030-3073` |
| `api.svc_resolve_staff_code(p_staff_code text)` | `p_staff_code` | `{ok:false}` หรือ `{ok,user_id,staff_id,status}` | ไม่ | – (ไม่ raise) · **`service_role` เท่านั้น** | `0011_api.sql:4012-4029` |
| `api.open_visit(p jsonb)` | `p` | `ok` `visit_id` `visit_no` `queue_no` `attached` `interaction_id` `status` | ไม่ | `42501` ×3 · `22023` ×2 · T26 · T02 | `0011_api.sql:1678-1763` |
| `api.close_visit(p_visit_id uuid, p_outcome_code text, p jsonb DEFAULT '{}')` | 3 ตัว | `ok` `visit_id` `status` `outcome_code` `leads_closed` | ไม่ | `42501` · `22023` · `P0001` ×5 · T21 · T23 | `0011_api.sql:1767-1858` |
| `api.acknowledge_unrecorded_visit(p_visit_id uuid)` | `p_visit_id` | **2 รูป** ดูข้อ 2.7 | ไม่ | `42501` · `P0001` | `0011_api.sql:1861-1887` |
| `api.search_customers(p_term text)` | `p_term` | **2 รูป** ดูข้อ 2.8 | ไม่ | `22023` `คำค้นต้องมีอย่างน้อย 3 ตัวอักษร` | `0011_api.sql:898-1016` |
| `api.find_customer_candidates(p_visit_id, p_phone, p_line_id, p_email, p_first_name, p_last_name)` | **4 ตัวแรกไม่มี DEFAULT** | **2 รูป** ดูข้อ 2.9 | ไม่ | `42501` ×3 · `22023` | `0011_api.sql:816-894` |
| `api.quick_capture(p jsonb)` | `p` | 11 คีย์ ดูข้อ 2.10 | ไม่ | `42501` ×5 · `22023` ×6 · `P0001` ×4 | `0011_api.sql:576-813` |
| `api.link_customer_to_branch(p_customer_id uuid, p_visit_id uuid)` | 2 ตัว ไม่มี DEFAULT | `ok` `customer_id` `customer_no` `branch_id` `visit_id` `link_count_today` | ไม่ | `42501` ×3 · `P0001` | `0011_api.sql:1019-1084` |
| `api.record_consent(p jsonb)` | `p` | `ok` `consent_id` `customer_id` `purpose_code` `status` | ไม่ | `22023` ×2 · `42501` · `P0001` · T02 | `0011_api.sql:1404-1454` |
| `api.assign_owner(p_entity_type, p_entity_id, p_to_staff_id, p_reason_code, p_note DEFAULT NULL, p_to_branch_id DEFAULT NULL)` | 6 ตัว | `ok` + รายละเอียดการมอบหมาย | ไม่ | `42501` · T13 | `0011_api.sql:1951` · `docs/07-api/api-spec.md:1004` |

### 2.1 `api.get_my_access() → jsonb`

`LANGUAGE plpgsql` · **STABLE** · `SECURITY DEFINER` · GRANT → `authenticated`
**ไม่เรียก `require_staff()`** — อ่าน `core.staff_profiles WHERE user_id = auth.uid()` ตรง ๆ โดยไม่กรอง `status` จึงใช้กับบัญชี `INVITED` ได้ (`0011_api.sql:2635`)

คีย์ระดับบนสุด 7 คีย์:

| คีย์ | ชนิด | หมายเหตุ |
|---|---|---|
| `ok` | boolean | `true` เสมอ |
| `aal` | text | `coalesce(auth.jwt()->>'aal','aal1')` |
| `staff` | object | `staff_id` `staff_code` `display_name` `nickname` `email` `status` `organization_id` `invite_expires_at` |
| `roles` | array | ไม่เคยเป็น null (coalesce เป็น `[]`) · สมาชิก: `role_code` `branch_id` `branch_code` `rank` `requires_mfa` `effective_now` · เรียงตาม `r.sort_order, b.code` |
| `permissions` | array | สมาชิก: `permission_code` `scope` `branch_id` `requires_aal2` `requires_mfa` `effective_now` · DISTINCT เรียงตาม `permission_code, branch_id` |
| `branches` | array | สมาชิก: `branch_id` `code` `name_th` เรียงตาม `b.code` |
| `unread_notifications` | integer | `crm.notifications` ที่ `read_at IS NULL` ของตน |

- `roles` / `permissions` คืน **ทุก assignment ที่ยังมีผลตามเวลา โดยไม่กรอง aal** พร้อมธง
  `effective_now = (NOT requires_mfa OR aal='aal2') AND (NOT requires_aal2 OR aal='aal2')`
  → UI ใช้ `effective_now = false` แสดง "ต้องยืนยันตัวตนสองขั้น (MFA) ในเซสชันนี้ก่อน" แทนการซ่อนเมนู (`0011_api.sql:2646-2666`)
- **ดักไว้:** `roles`/`permissions` กรอง `s.status='ACTIVE'` แต่ subquery ของ `branches` **ไม่กรอง status** → บัญชี `INVITED` ที่มี assignment ล่วงหน้าจะได้ `branches` ไม่ว่างแต่ `roles`/`permissions` ว่าง · **หน้า Login ต้องตัดสินจาก `staff.status` ไม่ใช่จาก `branches.length`** (`0011_api.sql:2664-2676`)
- error เดียว: ไม่พบ staff ของ `auth.uid()` → `42501` MESSAGE `JCRM-T00` HINT `บัญชีนี้ไม่ได้อยู่ในสถานะใช้งาน`
- ฝั่งแอปมี type และตัวช่วยแล้วที่ `web/src/lib/access.ts:46-78` (`getAccess()` · `requireAccess()` · `can()`) — **ใช้ตัวนี้ ห้ามเขียนตาราง role→permission เอง**

### 2.2 `api.activate_self() → jsonb`

**VOLATILE** · `SECURITY DEFINER` · GRANT → `authenticated` · เป็น 1 ใน 2 ฟังก์ชันที่ยกเว้นกติกา C2

**รูปคืนค่ามี 2 แบบ — frontend ต้องเช็ค `already_active` ก่อนอ่านคีย์อื่น**

```jsonc
// (1) status = 'ACTIVE' อยู่แล้ว — ไม่มี staff_code ไม่มี requires_mfa
{ "ok": true, "staff_id": "<uuid>", "status": "ACTIVE", "already_active": true }
// (2) ทางปกติ — ไม่มีคีย์ already_active
{ "ok": true, "staff_id": "<uuid>", "staff_code": "ST-0051", "status": "ACTIVE", "requires_mfa": true }
```
(`0011_api.sql:3049-3071`)

| เงื่อนไข | SQLSTATE | ข้อความ |
|---|---|---|
| `auth.uid()` เป็น null | 42501 | `JCRM-T00` (แสดง HINT) |
| ไม่พบ staff ของ user นี้ | 42501 | ไม่พบบัญชีพนักงานของผู้ใช้นี้ |
| status ไม่ใช่ `INVITED` | 42501 | บัญชีนี้เปิดใช้งานเองไม่ได้ |
| อีเมลยังไม่ confirm | P0001 | ต้องยืนยันอีเมลก่อนเปิดใช้งาน |
| `invite_expires_at` null หรือหมดอายุ | P0001 | คำเชิญหมดอายุแล้ว ต้องให้ผู้ดูแลเชิญใหม่ |
| บทบาทต้อง MFA แต่ยังไม่มี factor `verified` | P0001 | บทบาทของคุณต้องลงทะเบียน MFA ก่อนเปิดใช้งาน |

### 2.3 `api.svc_resolve_staff_code(p_staff_code text) → jsonb`

**STABLE** · `SECURITY DEFINER` · **GRANT ให้ `service_role` เท่านั้น** (`authenticated` เรียกไม่ได้) · บรรทัดแรก `app.svc_guard()` ตรวจ `auth.role() = 'service_role'`
คืน `{ok:false}` **ทุกกรณีที่ไม่ผ่าน** (ไม่พบ / `user_id` ว่าง / `status <> 'ACTIVE'`) — ข้อความเดียวกันทุกกรณี ห้ามบอกว่าบัญชีมีอยู่
ใช้ผ่าน Edge Function `staff-code-login` เท่านั้น (`0011_api.sql:4012-4029` · `docs/07-api/api-spec.md:1908`)

### 2.4 `api.open_visit(p jsonb) → jsonb`

**VOLATILE** · สิทธิ์: `app.require_staff()` แล้วตรวจ `branch_id ∈ app.scope_branch_ids('visit.create','OWN')` · **ไม่สร้าง lead อัตโนมัติ**

| คีย์ใน `p` | ชนิด | บังคับ | ค่าเริ่มต้นจริงในโค้ด |
|---|---|:--:|---|
| `branch_id` | uuid | ✓ | – |
| `channel_code` | text | ✓ | ต้องมีใน `ref.channels` ที่ `is_active` |
| `interest_code` | text | ✓ เมื่อ `WALK_IN` | – |
| `customer_id` | uuid | – | ไม่ส่ง = visit นิรนาม |
| `visit_mode` | text | – | `'SERVICE'` (`'QUEUE'` → `WAITING` เฉพาะเมื่อ `WALK_IN`) |
| `party_size` | int | – | `1` |
| `source_code` | text | – | – |
| `occurred_at` | timestamptz | – | `now()` |
| `attach_visit_id` | uuid | – | – |
| `interaction_type_code` | text | – | `'VISIT'` เมื่อ `WALK_IN` มิฉะนั้น `'INQUIRY'` |
| `summary` | text | – | – |

**ตรรกะการแนบ:** ช่องทางที่ไม่ใช่ `WALK_IN` จะหา visit `IN_SERVICE` สาขาเดียวกัน ช่องทางเดียวกัน และ `app.bangkok_date(started_at) = app.bangkok_date(occurred_at)` — จับคู่ด้วย `attach_visit_id` ถ้าส่งมา มิฉะนั้นจับคู่ด้วย `customer_id` → พบแล้วไม่สร้าง visit ใหม่ (`attached: true`) แต่ INSERT interaction เพิ่ม (`0011_api.sql:1724-1735`)

คืน 7 คีย์: `ok` `visit_id` `visit_no` `queue_no` `attached` `interaction_id` `status`
`status` อ่านสดจาก `crm.visits` (`'WAITING'` หรือ `'IN_SERVICE'`) · `queue_no` ไม่เป็น null เสมอเมื่อ `WALK_IN` (ดูข้อ 11 ข้อขัดแย้ง #1)

| เงื่อนไข | SQLSTATE | ข้อความ / HINT |
|---|---|---|
| สาขาไม่อยู่ในสิทธิ์ | 42501 | ไม่มีสิทธิ์เปิด visit ในสาขานี้ |
| ช่องทางผิด | 22023 | ต้องเลือกช่องทาง |
| `WALK_IN` ไม่มี interest | 22023 | visit หน้าร้านต้องระบุวัตถุประสงค์ |
| อ่านลูกค้าไม่ได้ | 42501 | ไม่มีสิทธิ์เปิด visit ให้ลูกค้ารายนี้ |
| ลูกค้ายังไม่ผูกสาขานี้ | 42501 | `JCRM-T26` → HINT `ลูกค้ารายนี้ยังไม่ผูกกับสาขาของรายการ · ผูกลูกค้าจากสาขาอื่นได้เฉพาะตอนรับลูกค้า` |
| ลูกค้าไม่ `ACTIVE` | 42501 | `JCRM-T02` → HINT `ลูกค้ารายนี้ถูกรวมหรือทำเป็นข้อมูลนิรนามแล้ว` |

### 2.5 `api.close_visit(p_visit_id uuid, p_outcome_code text, p jsonb DEFAULT '{}'::jsonb) → jsonb`

**VOLATILE** · สิทธิ์: `app.require_staff()` แล้ว `app.can_access_record('visit.update', v.branch_id, v.owner_staff_id, v.created_by)`
**ไม่มีอนุประโยคพิเศษสำหรับ `WAITING` ที่ยังไม่มีเจ้าของ** (ต่างจาก RLS `visits_update` และต่างจาก `api.quick_capture`) — ดูข้อ 11 ข้อขัดแย้ง #3 (`0011_api.sql:1783`)

`p_outcome_code` ที่ใช้ได้: `PURCHASED` `FOLLOW_UP` `NOT_YET` `NOT_INTERESTED` `SERVICE_DONE` `LEFT_BEFORE_SERVICE` — **`UNRECORDED` ส่งไม่ได้**
คีย์ใน `p`: `lost_reason_code` (บังคับเมื่อ `NOT_INTERESTED`) · `lost_note` (บังคับเมื่อ `lost_reason_code = 'OTHER'`)

สถานะปลายทาง: `LEFT_BEFORE_SERVICE` ต้องมาจาก `WAITING` → `LEFT` · outcome อื่นต้องมาจาก `IN_SERVICE` → `COMPLETED` · visit ที่ปิดแล้วเรียกซ้ำได้ = แก้ outcome แต่ต้อง `app.bangkok_date(started_at) = app.bangkok_date(now())` และห้ามสลับระหว่าง `LEFT_BEFORE_SERVICE` กับ outcome อื่น (`0011_api.sql:1797-1822`)

คืน 5 คีย์: `ok` `visit_id` `status` (`COMPLETED`|`LEFT`) `outcome_code` `leads_closed` (integer)

| เงื่อนไข | SQLSTATE | ข้อความ / HINT |
|---|---|---|
| ไม่พบ / ไม่มีสิทธิ์ | 42501 | ไม่พบ visit นี้หรือไม่มีสิทธิ์แก้ |
| outcome ว่าง/ไม่มีใน ref | 22023 | ต้องเลือกผลการให้บริการ |
| ส่ง `UNRECORDED` | P0001 | ผล UNRECORDED ระบบตั้งให้เท่านั้น (ข้อ 4.1) |
| visit `CANCELLED` หรือข้ามวันธุรกิจ | 42501 | `JCRM-T23` → HINT `การให้บริการนี้ปิดแล้ว` |
| สถานะต้นทางไม่ถูก | 42501 | `JCRM-T21` → HINT `ปิดการให้บริการด้วยปุ่มบันทึกผล` |
| `PURCHASED`/`FOLLOW_UP` แต่ไม่มี `customer_id` | P0001 | ผลนี้ต้องระบุลูกค้าก่อน (ข้อ 4.2) |
| `FOLLOW_UP` แต่ไม่มี lead/opportunity เปิดอยู่ที่มี `next_action_at` | P0001 | ผล "นัดติดตาม" ต้องมี lead หรือโอกาสขายที่เปิดอยู่พร้อมงานถัดไป (ข้อ 4.2) |
| `NOT_INTERESTED` ไม่มี `lost_reason_code` | P0001 | ผล "ไม่สนใจ" ต้องระบุเหตุผลที่ไม่สำเร็จ (19.3 ข้อ 3) |
| `lost_reason_code = 'OTHER'` ไม่มี `lost_note` | P0001 | เหตุผล "อื่น ๆ" ต้องระบุหมายเหตุ |

ผลข้างเคียง: `ended_at = coalesce(ended_at, now())` · `PURCHASED` เปลี่ยน interaction ต้นทางเป็น `PURCHASE` · `NOT_INTERESTED` ปิด lead ทุกใบที่ `leads.visit_id` = visit นี้เป็น `LOST` (`0011_api.sql:1838-1854`)

### 2.6 `api.acknowledge_unrecorded_visit(p_visit_id uuid) → jsonb`

**VOLATILE** · สิทธิ์เดียวกับ `close_visit` · **2 รูปคืนค่า**

```jsonc
// เคยรับทราบแล้ว
{ "ok": true, "visit_id": "<uuid>", "already_acknowledged": true,
  "unrecorded_ack_by": "<uuid>", "unrecorded_ack_at": "<ts>" }
// เพิ่งรับทราบ — ไม่มีคีย์ unrecorded_ack_at
{ "ok": true, "visit_id": "<uuid>", "already_acknowledged": false, "unrecorded_ack_by": "<uuid>" }
```
error: `42501 ไม่พบ visit นี้หรือไม่มีสิทธิ์แก้` · `P0001 visit นี้ไม่ได้อยู่ในสถานะ "ไม่ได้บันทึกผล"` (`0011_api.sql:1874-1886`)

### 2.7 `api.search_customers(p_term text) → jsonb`

**VOLATILE** (เขียน access log + ตัวนับ) · สิทธิ์: `app.require_staff()` เท่านั้น ไม่ต้องมี permission เฉพาะ (ผลกรองด้วย `app.readable_customer_ids()`)

```jsonc
// (1) ปกติ — 3 คีย์
{ "ok": true, "count": 7,
  "groups": { "customers": [], "leads": [], "opportunities": [], "quotations": [], "transactions": [] } }
// (2) เกินอัตรา — HTTP 200 เช่นกัน · 3 คีย์ · **ไม่มีคีย์ count**
{ "ok": false, "code": "SEARCH_LIMIT_EXCEEDED", "groups": {} }
```
(`0011_api.sql:929-931, 1013-1015`)

- `groups.customers[]` (สูงสุด 20 ราย): `customer_id` `customer_no` `display_name` `lifecycle_stage` `record_status` `value_masked` `last_activity_at` `last_channel_code`
- `groups.leads[]`: `lead_id` `lead_no` `customer_id` `status` `branch_id` · `opportunities[]`: `opportunity_id` `opportunity_no` `customer_id` `stage` `branch_id` · `quotations[]`: `quotation_id` `quotation_no` `customer_id` `status` `branch_id` · `transactions[]`: `transaction_ref_id` `external_no` `customer_id` `transaction_type_code` `branch_id`
- กติกาการจับคู่: เบอร์ (`^[0-9+(). -]+$`) / อีเมล (มี `@`) / LINE ID → normalize แล้วเทียบ `value_normalized` **ตรงทั้งค่าเท่านั้น** · `customer_no` เทียบ `upper(term)` ตรงทั้งค่า · ชื่อใช้ `extensions.similarity(name_search, lower(term)) >= 0.3` · IMEI ใช้ `^[0-9]{15}$` (`0011_api.sql:932-963`)
- error เดียวที่ raise: `char_length(btrim(p_term)) < 3` → `22023 คำค้นต้องมีอย่างน้อย 3 ตัวอักษร`
- ผลข้างเคียง: `audit.access_logs` action `CUSTOMER_SEARCH` เก็บ sha256 ไม่เก็บค่าจริง

### 2.8 `api.find_customer_candidates(...) → jsonb`

ลายเซ็นเต็ม (`0011_api.sql:816-822`):
```
api.find_customer_candidates(
  p_visit_id uuid, p_phone text, p_line_id text, p_email text,
  p_first_name text DEFAULT NULL, p_last_name text DEFAULT NULL) RETURNS jsonb
```
**4 พารามิเตอร์แรกไม่มี DEFAULT → ต้องส่งครบทุกตัวเสมอ (ส่ง null ได้)**

สิทธิ์: `app.require_permission('customer.create')` แล้วตรวจ `cardinality(scope_branch_ids('customer.create','OWN')) > 0`
ถ้าส่ง `p_visit_id` ต้องเป็น visit ที่ `status ∈ (WAITING, IN_SERVICE)` · `branch_id ∈ scope_branch_ids('visit.update','OWN')` · `created_at >= now() − interval '4 hours'`
สาขาอ้างอิงของกฎคะแนน 40: จาก visit ถ้าส่ง `p_visit_id` มิฉะนั้น `(app.scope_branch_ids('customer.create','OWN'))[1]`

```jsonc
// (1) ปกติ — 3 คีย์
{ "ok": true, "count": 2, "candidates": [ /* การ์ด */ ] }
// (2) เกินอัตรา — 4 คีย์ · **มี count ต่างจาก search_customers**
{ "ok": false, "code": "SEARCH_LIMIT_EXCEEDED", "count": 0, "candidates": [] }
```
(`0011_api.sql:864, 893`)

| การ์ด | คีย์ |
|---|---|
| ในขอบเขต (9 คีย์) | `customer_id` `customer_no` `display_name` `value_masked` `lifecycle_stage` `score` `reasons[]` `in_scope:true` `can_view:true` |
| นอกขอบเขต (8 คีย์) | `customer_id` `customer_no` `display_name` (ชื่อ + อักษรแรกนามสกุล + `.`) `value_masked` (มีค่าเฉพาะเมื่อ matched ด้วยเบอร์ มิฉะนั้น null) `score` `reasons[]` `in_scope:false` `can_view:false` — **ไม่มี `lifecycle_stage`** |

กฎคะแนน (`app.candidate_scores` · ค้นทั้งองค์กร · เฉพาะ `record_status='ACTIVE'` · คืนคะแนนสูงสุดต่อลูกค้า 1 แถว เรียง `score DESC, customer_id`):

| คะแนน | เหตุผลที่คืน |
|---:|---|
| 100 | `เบอร์โทรตรงกัน` |
| 100 | `LINE ID ตรงกัน` (contact_type IN `LINE_ID`, `LINE_USER_ID`) |
| 90 | `อีเมลตรงกัน` |
| 70 | `ชื่อและนามสกุลตรงกัน + เบอร์ 4 ตัวท้ายตรงกัน` |
| 40 | `ชื่อคล้าย + สาขาแรกเดียวกัน` (similarity ≥ 0.6 และ `first_branch_id` = สาขาอ้างอิง) |

| เงื่อนไข | SQLSTATE | ข้อความ |
|---|---|---|
| ไม่มีสิทธิ์ `customer.create` เลย | 42501 | ไม่มีสิทธิ์ customer.create (ตรวจ MFA และบทบาทของคุณ) |
| มีสิทธิ์แต่ scope ว่าง | 42501 | ไม่มีสิทธิ์สร้างลูกค้า |
| ไม่ส่งตัวระบุเลย | 22023 | ต้องส่งตัวระบุเต็มอย่างน้อย 1 อย่าง (เบอร์โทร · LINE ID · อีเมล) |
| visit ใช้ไม่ได้ | 42501 | visit นี้ใช้ตรวจซ้ำไม่ได้ |

**ผลข้างเคียงสำคัญ:** เขียน `audit.access_logs` action `CUSTOMER_CANDIDATE_SEARCH` พร้อม `detail.candidate_ids` และ `visit_id` — **แถวนี้คือหลักฐานที่ `api.link_customer_to_branch` ตรวจย้อน 30 นาที** (`0011_api.sql:890-892`)

### 2.9 `api.quick_capture(p jsonb) → jsonb`

**VOLATILE** · **เส้นทางเดียวของการสร้างลูกค้า** (`crm.customers` ไม่มี GRANT INSERT)
สิทธิ์: `app.require_permission('customer.create')` แล้ว `branch_id ∈ scope_branch_ids('customer.create','OWN')`
· เพิ่ม `visit.create` (OWN) **เฉพาะเมื่อจะเปิด visit ใหม่**
· เพิ่ม `customer.consent.manage` (OWN) เมื่อ `marketing.granted = true`
· เมื่อส่ง `visit_id` ต้องผ่าน `can_access_record('visit.update',…)` **หรือ** (visit เป็น `WAITING` + owner ว่าง + สาขาอยู่ใน `scope_branch_ids('visit.update','OWN')`) — `0011_api.sql:672-678`

| คีย์ใน `p` | ชนิด | บังคับ | ค่าเริ่มต้นจริงในโค้ด |
|---|---|:--:|---|
| `branch_id` | uuid | ✓ | – |
| `first_name` / `nickname` | text | ✓ อย่างน้อยหนึ่งตัวไม่ว่าง | – |
| `last_name` | text | – | – |
| `customer_type` | text | – | `'INDIVIDUAL'` |
| `channel_code` | text | ✓ | `ref.channels` ที่ `is_active` |
| `source_code` · `province_code` | text | – | – |
| `interest_code` | text | ✓ | `ref.interest_types` ที่ `is_active` |
| `product_type_code` · `product_model` | text | – | ใช้กับ lead อัตโนมัติ |
| `privacy_notice_ack` | boolean | ✓ ต้อง `true` | – |
| `privacy_captured_via` | text | – | `'STAFF_FORM'` เมื่อ `WALK_IN` มิฉะนั้น `'LINK_SENT'` |
| `phone` · `line_id` · `email` | text | – | ทางลัด → ต่อท้าย `contacts` เป็น `is_primary: true` |
| `contacts` | array | ✓ รวมทางลัดแล้วต้อง ≥ 1 | `{contact_type, value, is_primary}` |
| `marketing` | object | – | `{granted, age_ack, channels[] ⊆ LINE|SMS|PHONE|EMAIL}` |
| `open_visit` | boolean | – | `(visit_id IS NOT NULL)` |
| `visit_mode` | text | – | `'SERVICE'` (`'QUEUE'` → `WAITING` เฉพาะเมื่อ `WALK_IN`) |
| `visit_id` | uuid | – | – |
| `party_size` | int | – | `1` |
| `interaction_type_code` | text | – | `'VISIT'` (WALK_IN) / `'INQUIRY'` |
| `summary` · `note` | text | – | – |
| `note_pinned` | boolean | – | `false` |
| `duplicate_override_reason_code` | text | ✓ เมื่อคะแนนซ้ำสูงสุด ≥ 70 | `ref.duplicate_override_reasons` |
| `duplicate_override_note` | text | – | – |

คืน **11 คีย์**: `ok` `customer_id` `customer_no` `visit_id` `visit_no` `queue_no` `interaction_id` `lead_id` `lead_no` `duplicate_decision_id` `candidates` (การ์ดรูปเดียวกับ `find_customer_candidates`) — `0011_api.sql:806-812`

| เงื่อนไข | SQLSTATE | ข้อความ |
|---|---|---|
| ไม่มีสิทธิ์ `customer.create` เลย | 42501 | ไม่มีสิทธิ์ customer.create (ตรวจ MFA และบทบาทของคุณ) |
| สาขานอก scope | 42501 | ไม่มีสิทธิ์สร้างลูกค้าในสาขานี้ |
| ไม่มีชื่อและชื่อเล่น | 22023 | ต้องกรอกชื่อ หรือชื่อเล่น อย่างน้อยหนึ่งช่อง |
| ช่องทางผิด | 22023 | ต้องเลือกช่องทางแรกที่ติดต่อ |
| ความสนใจผิด | 22023 | ต้องเลือกความสนใจ |
| ไม่ติ๊ก privacy | P0001 | ต้องติ๊ก "แจ้งประกาศความเป็นส่วนตัวให้ลูกค้าแล้ว" |
| `contacts` ว่าง | 22023 | ต้องมีช่องทางติดต่ออย่างน้อย 1 รายการ |
| `WALK_IN`/`PHONE` ไม่มี contact ชนิด `PHONE` | 22023 | ช่องทางแรกเป็น Walk-in หรือโทรศัพท์ ต้องกรอกเบอร์โทร |
| ติ๊ก marketing โดยไม่มีสิทธิ์ | 42501 | ไม่มีสิทธิ์บันทึกความยินยอมในสาขานี้ |
| ติ๊ก marketing ไม่ติ๊กอายุ | P0001 | ต้องติ๊ก "ลูกค้าอายุ 20 ปีขึ้นไป หรือผู้ใช้อำนาจปกครองยินยอม" |
| `visit_id` ใช้ไม่ได้ (ไม่พบ/คนละสาขา/สถานะไม่ใช่ WAITING,IN_SERVICE) | 42501 | visit นี้ใช้ผูกลูกค้าไม่ได้ |
| `visit_id` มีลูกค้าแล้ว | P0001 | visit นี้ระบุลูกค้าแล้ว |
| ไม่มีสิทธิ์แก้ visit นั้น | 42501 | ไม่มีสิทธิ์แก้ visit นี้ **(ข้อความนี้ไม่มีในตาราง error ของ api-spec — ต้องเพิ่มใน mapping เอง)** |
| จะเปิด visit ใหม่แต่ไม่มี `visit.create` | 42501 | ไม่มีสิทธิ์เปิด visit ในสาขานี้ |
| คะแนนซ้ำ ≥ 70 แต่ไม่ส่งเหตุผล | P0001 | พบลูกค้าที่อาจซ้ำ ต้องเลือกเหตุผลก่อนสร้างลูกค้าใหม่ |
| contact normalize ไม่ได้ | 22023 | ช่องทางติดต่อไม่ถูกต้อง: `{ชนิด}` |

ผลข้างเคียงในทรานแซกชันเดียว (`0011_api.sql:703-805`): `crm.customers` (`created_via='QUICK_CAPTURE'`) · `crm.customer_branches` (`linked_via='CREATED'`) · `crm.customer_contacts` (normalize+mask ในฐานข้อมูล) · `crm.customer_consents` `PRIVACY_NOTICE GRANTED` (+ `MARKETING` เมื่อติ๊ก) · visit + interaction ต้นทาง · lead อัตโนมัติเมื่อ `ref.interest_types.creates_lead = true` (`next_action='ติดต่อกลับลูกค้า'` · `next_action_type_code='CALL'` · `next_action_at = now() + 30 นาที` hard-code) · โน้ตแรก · `crm.duplicate_decisions PENDING` เมื่อคะแนน ≥ 70

> `quick_capture` คำนวณผู้สมัครซ้ำใหม่ฝั่ง server **ทุกครั้ง** โดยไม่ผ่าน rate limit → ต่อให้ `find_customer_candidates` ถูกบล็อก การบันทึกก็ยังตรวจซ้ำให้ (`0011_api.sql:686-703`)
> **เรียกซ้ำ = สร้างแถวซ้ำ** ไม่มี idempotency key ใน V1 → ปิดปุ่มระหว่างส่ง + `revalidatePath` หลังสำเร็จ (`docs/07-api/api-spec.md:278`)

### 2.10 `api.link_customer_to_branch(p_customer_id uuid, p_visit_id uuid) → jsonb`

**VOLATILE** · เส้นทางเดียวของการผูกลูกค้าข้ามสาขา · สิทธิ์: `app.require_staff()` แล้ว `visit.branch_id ∈ scope_branch_ids('visit.update','OWN')` (**สาขามาจาก visit ไม่รับจากผู้เรียก**)

เงื่อนไขทุกข้อ (`0011_api.sql:1031-1066`):
1. visit มีอยู่ + สาขาอยู่ในสิทธิ์ + `status ∈ (WAITING, IN_SERVICE)` + `created_at >= now() − interval '4 hours'`
2. `visits.customer_id IS NULL`
3. ลูกค้ามีอยู่ + `record_status='ACTIVE'` + `organization_id` เดียวกัน
4. **มีแถว `audit.access_logs` action `CUSTOMER_CANDIDATE_SEARCH` ที่ `actor_staff_id` = ผู้เรียก · `visit_id` = `p_visit_id` · `occurred_at > now() − 30 นาที` และ `detail->'candidate_ids'` มี `p_customer_id`**
   → frontend ต้องเรียก `api.find_customer_candidates` โดย **ส่ง `p_visit_id` ของ visit นั้นจริง ๆ** ก่อนเสมอ (ส่ง null ไม่ผ่าน)

คืน 6 คีย์: `ok` `customer_id` `customer_no` `branch_id` `visit_id` `link_count_today`
**`link_count_today` เป็น JSON string ไม่ใช่ number** เพราะโค้ดใช้ `v_rate ->> 'hit_count'` (`0011_api.sql:1082`)

| เงื่อนไข | SQLSTATE | ข้อความ |
|---|---|---|
| visit ใช้ไม่ได้ | 42501 | visit นี้ผูกลูกค้าไม่ได้ (ต้องเป็น visit ที่เปิดอยู่ในสาขาของคุณ ภายใน 4 ชั่วโมง) |
| visit มีลูกค้าแล้ว | P0001 | visit นี้ระบุลูกค้าแล้ว |
| ไม่พบลูกค้า/ไม่ ACTIVE/คนละองค์กร | 42501 | ไม่พบลูกค้ารายนี้ |
| ไม่ได้มาจากผลตรวจซ้ำ | 42501 | ต้องเลือกลูกค้าจากผลตรวจซ้ำของ visit นี้ภายใน 30 นาที |

เกิน `security.link_per_day` → **ยังผูกสำเร็จ** เพียงแจ้ง `LINK_LIMIT_EXCEEDED` ถึง BRANCH_MANAGER ของสาขานั้น (ไม่มีข้อความบนหน้าจอ)

### 2.11 `api.record_consent(p jsonb) → jsonb`

**VOLATILE** · append-only (การถอน = INSERT แถวใหม่ `status='WITHDRAWN'`)
สิทธิ์: `app.require_staff()` แล้ว `app.can_access_customer('customer.consent.manage', customer_id)` และลูกค้าต้อง `record_status='ACTIVE'`

| คีย์ใน `p` | บังคับ | ค่าเริ่มต้น |
|---|:--:|---|
| `customer_id` | ✓ | – |
| `purpose_code` | ✓ | `ref.consent_purposes` ที่ `is_active` = **`PRIVACY_NOTICE`** หรือ **`MARKETING`** เท่านั้น |
| `status` | – | `'GRANTED'` (enum `crm.consent_status` = `GRANTED` \| `WITHDRAWN`) |
| `captured_via` | – | `'STAFF_FORM'` (enum = `STAFF_FORM` \| `LINK_SENT` \| `LINE_OA` \| `WEB`) |
| `channels` | – | `[]` · CHECK ของตาราง: ⊆ `{LINE, SMS, PHONE, EMAIL}` · เก็บเฉพาะเมื่อ `status='GRANTED'` |
| `notice_version` | – | `app.settings['pdpa.current_notice_version']` = `PN-2026-01` |
| `age_ack` | ✓ เมื่อ `MARKETING` + `GRANTED` | – |
| `evidence` | – | ประกอบอัตโนมัติ: `'<notice> · <captured_via>[ · ช่องทาง a,b][ · ลูกค้าอายุ 20 ปีขึ้นไป หรือผู้ใช้อำนาจปกครองยินยอม]'` |

คืน 5 คีย์: `ok` `consent_id` `customer_id` `purpose_code` `status`

| เงื่อนไข | SQLSTATE | ข้อความ |
|---|---|---|
| ขาด `customer_id` หรือ `purpose_code` | 22023 | ต้องระบุ customer_id และ purpose_code |
| ไม่มีสิทธิ์ | 42501 | ไม่มีสิทธิ์บันทึกความยินยอมของลูกค้ารายนี้ |
| `purpose_code` ไม่ถูก | 22023 | purpose_code ไม่ถูกต้อง |
| ลูกค้าไม่ ACTIVE | 42501 | `JCRM-T02` → HINT `ลูกค้ารายนี้ถูกรวมหรือทำเป็นข้อมูลนิรนามแล้ว` |
| `MARKETING`+`GRANTED` ไม่ติ๊กอายุ | P0001 | ต้องติ๊ก "ลูกค้าอายุ 20 ปีขึ้นไป หรือผู้ใช้อำนาจปกครองยินยอม" |

> **ใน Quick Capture ไม่ต้องเรียกตัวนี้แยก** — `api.quick_capture` INSERT แถว `PRIVACY_NOTICE` (+ `MARKETING`) ให้เองในทรานแซกชันเดียว (`0011_api.sql:733-750`)

---

## 3. การอ่าน/เขียนตารางตรงผ่าน PostgREST

### 3.1 `crm.visits` — คิวหน้าร้าน

**ไม่มี RPC ใน schema `api` สำหรับดึงคิวหน้าร้าน** (ตรวจครบ 58 ฟังก์ชัน) → หน้า 07 อ่านตารางตรง

| สิ่งที่ทำได้ | รายละเอียด |
|---|---|
| SELECT | `GRANT SELECT ON crm.visits TO authenticated` **ทุกคอลัมน์** (`supabase/migrations/0010_security.sql:408`) |
| INSERT | **ไม่มี GRANT** — สร้าง visit ได้เฉพาะผ่าน `api.open_visit` / `api.quick_capture` |
| UPDATE | เฉพาะ 7 คอลัมน์: `status` `owner_staff_id` `party_size` `customer_id` `interest_code` `source_code` `cancel_reason` (`0010_security.sql:409`) |

คอลัมน์ที่มีจริง: `id` `organization_id` `visit_no` `branch_id` `team_id` `channel_code` `status` `queue_no` `party_size` `customer_id` `interest_code` `source_code` `started_at` `service_started_at` `ended_at` `owner_staff_id` `outcome_code` `cancel_reason` `closed_by_system` `created_at` `created_by` `updated_at` `updated_by` (`supabase/migrations/0005_crm_activity.sql:24-47`)

ตัวกรอง/เรียงของหน้า 07: `branch_id=eq.<uuid>` + `status=in.(WAITING,IN_SERVICE)` + `order=queue_no` (`docs/07-api/api-spec.md:1813`)
embed ได้: `customers(display_name,…)` ผ่าน `visits.customer_id` และ `core.staff_profiles(id,staff_code,display_name,nickname,status)` ผ่าน `owner_staff_id` (คอลัมน์อื่นของ `staff_profiles` ถูก REVOKE)

RLS `visits_select` ปล่อยผ่านเมื่อข้อใดข้อหนึ่ง (`0010_security.sql:417-432`): `branch_id ∈ scope_branch_ids('visit.read','BRANCH')` | `(branch_id, owner_staff_id) ∈ team_scope_pairs('visit.read')` | `branch_id ∈ scope_branch_ids('visit.read','OWN')` และ `coalesce(owner_staff_id, created_by)` = ตนเอง | `customer_id ∈ readable_customer_ids()`
STAFF มี `visit.read` scope B → เห็นคิวทั้งสาขา

### 3.2 การ "รับคิว" (claim) — PATCH ไม่ใช่ RPC

```http
PATCH /rest/v1/visits?id=eq.<uuid>&status=eq.WAITING&owner_staff_id=is.null
Content-Profile: crm
Prefer: return=representation
{ "status": "IN_SERVICE", "owner_staff_id": "<staff_id ของตนเอง>" }
```
**ต้องตรวจจำนวนแถวที่คืน — 0 แถว = มีคนรับไปแล้วหรือไม่มีสิทธิ์** → toast warning `คิวนี้มีผู้รับแล้ว` แล้วโหลดคิวใหม่

- trigger `app.enforce_row_transition`: `v_claim = (OLD.status='WAITING' AND OLD.owner_staff_id IS NULL AND NEW.status='IN_SERVICE' AND NEW.owner_staff_id = ตนเอง)` · ถ้า `v_claim` จริงแต่ส่งคอลัมน์อื่นมาด้วย → `42501 JCRM-T20` HINT `รับคิวแล้วจึงแก้ไขรายละเอียดอื่น` → **ส่งได้เฉพาะ 2 คอลัมน์นี้ในคำเรียกเดียว** (`0010_security.sql:1182-1193`)
- เปลี่ยน `owner_staff_id` โดยไม่ใช่การ claim → `JCRM-T13`
- เปลี่ยน `status` เป็นอย่างอื่นที่ไม่ใช่ `WAITING`/`IN_SERVICE`→`CANCELLED` → `JCRM-T21` HINT `ปิดการให้บริการด้วยปุ่มบันทึกผล`
- RLS `visits_update` USING มีอนุประโยคพิเศษ: `(status='WAITING' AND owner_staff_id IS NULL AND branch_id ∈ scope_branch_ids('visit.update','OWN'))` → STAFF รับคิวที่ยังไม่มีเจ้าของในสาขาตนได้ (`0010_security.sql:423-424`)
- trigger `0009` ตั้ง `service_started_at = greatest(now(), started_at)` ให้อัตโนมัติ — **frontend ห้ามส่งเอง** (ไม่มี UPDATE grant) (`supabase/migrations/0009_business_triggers.sql:246-248`)

**การยกเลิก visit:** PATCH `status='CANCELLED'` + `cancel_reason` (บังคับ) · ทำได้เมื่อ (เจ้าของ/ผู้สร้าง = ตน และ `now() < created_at + 15 นาที`) หรือมี scope TEAM/BRANCH — มิฉะนั้น `JCRM-T22` HINT `เกิน 15 นาที ต้องให้หัวหน้าทีมหรือผู้จัดการยกเลิก`

### 3.3 CHECK ของ `crm.visits` ที่มีผลต่อ UI (`0005_crm_activity.sql:56-92`)

| CHECK | กติกา |
|---|---|
| `visits_queue_no_chk` | `(channel_code = 'WALK_IN') = (queue_no IS NOT NULL)` → **visit WALK_IN ทุกใบมี `queue_no` เสมอ** ไม่ว่า `visit_mode` จะเป็น QUEUE หรือ SERVICE · visit ช่องทางอื่นมี `queue_no = null` เสมอ |
| `visits_walk_in_interest_chk` | `WALK_IN` ต้องมี `interest_code` |
| `visits_waiting_chk` | `status='WAITING'` ได้เฉพาะเมื่อ `WALK_IN` + `owner_staff_id IS NULL` + `service_started_at IS NULL` → **visit ออนไลน์/โทรเข้าคิวไม่ได้** |
| `visits_in_service_chk` | `IN_SERVICE` ต้องมี `owner_staff_id` และ `service_started_at` |
| `visits_outcome_chk` | `outcome_code` มีได้เฉพาะเมื่อ `status ∈ (COMPLETED, LEFT)` และบังคับต้องมี |
| `visits_left_outcome_chk` | `status='LEFT'` ⇔ `outcome_code='LEFT_BEFORE_SERVICE'` |
| `visits_outcome_customer_chk` | `PURCHASED`/`FOLLOW_UP` ต้องมี `customer_id` |
| `visits_cancel_reason_chk` | `status='CANCELLED'` ⇔ `cancel_reason` ไม่ว่าง |
| `visits_party_size_chk` | `party_size >= 1` |

การแสดงเลขคิว: `'คิว ' || lpad(queue_no::text, 3, '0')` → `คิว 001`
การเปลี่ยนสถานะที่อนุญาตทั้งหมด: `WAITING→IN_SERVICE` · `WAITING→LEFT` · `IN_SERVICE→COMPLETED` · `WAITING/IN_SERVICE→CANCELLED` · **`branch_id` เปลี่ยนไม่ได้** (`0005_crm_activity.sql:108-110`)

### 3.4 รหัสอ้างอิง (`ref.*`) ที่ฟอร์ม Core Flow ต้องโหลด

อ่านด้วย `supabase.schema('ref').from('<ตาราง>')` — GRANT SELECT ให้ `authenticated` ทุกตาราง `ref` (เห็นเฉพาะ `is_active` เว้นผู้มี `master_data.manage`) · `supabase/migrations/0010_security.sql:897-920`

| ตาราง | ค่า |
|---|---|
| `ref.channels` (7) | `WALK_IN` "Walk-in (หน้าร้าน)" `is_live=true` · `LINE` · `FACEBOOK` · `INSTAGRAM` · `TIKTOK` · `PHONE` "โทรศัพท์" `is_live=true` · `WEBSITE` |
| `ref.interest_types` (7 · `creates_lead`) | `BUY` "ซื้อเครื่อง" ✓ · `SELL` "ขายเครื่อง (รับซื้อ)" ✓ · `TRADE_IN` "เทิร์นเครื่อง" ✓ · `INSTALLMENT` "ผ่อน" ✓ · `ACCESSORY` "อุปกรณ์เสริม" ✓ · `REPAIR` "ซ่อม" ✗ · `INQUIRY` "สอบถาม/โปรโมชั่น" ✗ |
| `ref.visit_outcomes` (7) | `PURCHASED` "ซื้อแล้ว" · `FOLLOW_UP` "นัดติดตาม" · `NOT_YET` "ยังไม่ซื้อ" · `NOT_INTERESTED` "ไม่สนใจ" · `SERVICE_DONE` "ให้บริการเสร็จ (ซ่อม/สอบถาม/ชำระ)" · `LEFT_BEFORE_SERVICE` "ออกก่อนรับบริการ" · `UNRECORDED` "ไม่ได้บันทึกผล (ระบบปิดให้)" `counts_as_recorded=false` **ห้ามให้ผู้ใช้เลือก** |
| `ref.duplicate_override_reasons` (3) | `FAMILY_SHARED_PHONE` "ใช้เบอร์ร่วมกันในครอบครัว" · `DIFFERENT_PERSON` "คนละคน" · `OTHER` "อื่น ๆ" |
| `ref.lost_reasons` (14) | `PRICE` `COMPARING` `NOT_READY` `DOCUMENTS` `CHANGED_MIND` `OUT_OF_STOCK` `NO_MODEL_COLOR` `COMPETITOR` `FINANCE_REJECTED` `DOWN_PAYMENT` `PROMOTION` `UNREACHABLE` `SERVICE_EXPERIENCE` `OTHER` ("อื่น ๆ" ต้องกรอก `lost_note`) |
| `ref.consent_purposes` (2) | `PRIVACY_NOTICE` · `MARKETING` |
| `ref.sources` (11) · `ref.product_types` (8) · `ref.provinces` (77) | ใช้ในฟอร์ม 04 / 07 |

enum: `crm.contact_type` = `PHONE` `LINE_ID` `LINE_USER_ID` `FACEBOOK` `INSTAGRAM` `TIKTOK` `EMAIL` · `crm.visit_status` = `WAITING` `IN_SERVICE` `COMPLETED` `LEFT` `CANCELLED`
แหล่ง: `supabase/migrations/0003_ref.sql` (INSERT แต่ละตาราง) · `supabase/migrations/0001_foundation.sql:90, 120-130`

---

## 4. แผนที่ข้อผิดพลาด

| SQLSTATE | HTTP | วิธีแสดงผล |
|---|---|---|
| `42501` | 403 (401 เมื่อไม่มี JWT) | ถ้า `error.message` ขึ้นต้นด้วย `JCRM-` ให้แสดง **`error.hint`** (ข้อความไทย) มิฉะนั้นแสดง `error.message` (เป็นไทยอยู่แล้ว) · fallback `คุณไม่มีสิทธิ์ทำรายการนี้` · UI: toast danger · **ไม่ปิด dialog ไม่ล้างฟอร์ม** |
| `22023` | 400 | แสดง message เป็น inline error ที่ช่องที่ผิด |
| `P0001` | 400 | กติกาธุรกิจ · toast warning + คำอธิบายในบริบท |
| `23514` | 400 | CHECK ของตาราง — ถ้าเป็น guard เลขบัตรประชาชน ให้แสดง HINT ที่ช่องนั้น **ห้ามสะท้อนเลขที่ผู้ใช้พิมพ์กลับไป** |
| `23505` | 409 | `ค่านี้ถูกใช้แล้ว` |
| `23503` | 409 | `ค่าอ้างอิงไม่ถูกต้อง` |
| `22P02` | 400 | `รูปแบบข้อมูลไม่ถูกต้อง` |
| `42883` / `PGRST202` | 404 | `ระบบขัดข้อง` + `request_id` |
| **HTTP 200 + `[]` จาก PATCH/DELETE** | 200 | RLS `USING` ไม่ผ่านหรือแถวถูกแก้ไปแล้ว → **ต้องตรวจจำนวนแถวที่คืนเสมอ** แล้วแสดง `ไม่พบรายการ หรือคุณไม่มีสิทธิ์` + refresh |
| 5xx | – | `ระบบขัดข้อง ลองใหม่อีกครั้ง` + `request_id` |

แหล่ง: `docs/07-api/api-spec.md:163-174` · `supabase/migrations/0010_security.sql:975-1053`

**กติกา F5:** RPC ที่หาแถวไม่พบ **และ** แถวที่มีอยู่แต่ผู้เรียกไม่มีสิทธิ์ ต้องให้ผลเดียวกัน → **frontend ห้ามแยกข้อความสองกรณีนี้** (`supabase/migrations/0011_api.sql:16-17` · `docs/07-api/api-spec.md:176`)

### 4.1 รหัส `JCRM-Tnn` ที่ Core Flow นี้เจอ

ทุกตัวเป็น SQLSTATE `42501` · `MESSAGE = 'JCRM-Tnn'` · `DETAIL` = เหตุผลภาษาอังกฤษสำหรับ log · **`HINT` = ข้อความไทยที่แสดงผู้ใช้**

| รหัส | HINT ที่แสดง |
|---|---|
| `T00` | บัญชีนี้ไม่ได้อยู่ในสถานะใช้งาน |
| `T02` | ลูกค้ารายนี้ถูกรวมหรือทำเป็นข้อมูลนิรนามแล้ว |
| `T13` | เปลี่ยนผู้รับผิดชอบหรือสาขาด้วยปุ่ม "มอบหมาย" เท่านั้น |
| `T20` | รับคิวแล้วจึงแก้ไขรายละเอียดอื่น |
| `T21` | ปิดการให้บริการด้วยปุ่มบันทึกผล |
| `T22` | เกิน 15 นาที ต้องให้หัวหน้าทีมหรือผู้จัดการยกเลิก |
| `T23` | การให้บริการนี้ปิดแล้ว |
| `T24` | ต้องให้หัวหน้าทีมหรือผู้จัดการเปลี่ยนลูกค้าของรายการนี้ |
| `T26` | ลูกค้ารายนี้ยังไม่ผูกกับสาขาของรายการ · ผูกลูกค้าจากสาขาอื่นได้เฉพาะตอนรับลูกค้า |

แหล่ง: `docs/04-security/rls-spec.md:1252-1285` · `supabase/migrations/0010_security.sql:975-1053`

### 4.2 รหัสผลลัพธ์แบบ "ไม่ raise" (`ok:false` + `code`)

| code | การแสดงผล |
|---|---|
| `SEARCH_LIMIT_EXCEEDED` | toast danger `ตรวจสอบซ้ำครบจำนวนที่กำหนดต่อชั่วโมงแล้ว กรุณารอสักครู่` · แผงตรวจซ้ำแสดง `ระงับการตรวจสอบซ้ำชั่วคราว 1 ชั่วโมง ระบบจะตรวจข้อมูลซ้ำอีกครั้งตอนบันทึก` · **การบันทึกลูกค้าต้องไม่ถูกบล็อก** |
| `REVEAL_LIMIT_EXCEEDED` | toast danger `เปิดดูข้อมูลติดต่อครบจำนวนที่กำหนดต่อชั่วโมงแล้ว` · ค่ายังปิดบัง |

แหล่ง: `docs/07-api/api-spec.md:268-272`

---

## 5. สเปกหน้าจอ 01 — เข้าสู่ระบบ

**route:** `/login` · `web/src/app/(auth)/login/page.tsx` · prototype อ้างอิง: `prototype/01-login.html`
`<body data-page="login" data-roles="">` (ว่างเพราะเป็นหน้าก่อนเข้าสู่ระบบ) · `<html lang="th">` · ไม่มี sidebar/top bar/bottom nav
skip link ตัวแรกของ body: `ข้ามไปยังแบบฟอร์มเข้าสู่ระบบ` href=`#login-form` (`prototype/01-login.html:1-57`)

**เลย์เอาต์:** เดสก์ท็อป/แท็บเล็ต 2 คอลัมน์ — แผงแบรนด์ navy-900 (เดสก์ท็อป 50% · แท็บเล็ต 40%) + แผงฟอร์มขวา · ฟอร์มกว้างสูงสุด 400px · **ห้ามมีภาพถ่ายหรือข้อความโปรยที่ไม่มีใน CANONICAL** · มือถือ <768px: แผงแบรนด์กลายเป็นแถบ navy ด้านบน ฟอร์มเต็มความกว้างใต้ลงมา (`docs/06-ux/sitemap-screen-specs.md:466`)

### 5.1 ฟิลด์ (ข้อความไทยใช้ตรงตัว)

| ฟิลด์ | ป้าย | บังคับ | attribute | ข้อความผิด |
|---|---|:--:|---|---|
| ช่องบัญชี | **"อีเมลหรือรหัสพนักงาน"** · placeholder **"name@example.com หรือ ST-0045"** | ✓ | `type="text"` `inputmode="email"` `autocomplete="username"` `autocapitalize="off"` `spellcheck="false"` `required` | ใช้ข้อความรวมของฟอร์ม |
| รหัสผ่าน | **"รหัสผ่าน"** | ✓ | `type="password"` `autocomplete="current-password"` `required` · ปุ่มสลับใน field: `aria-label` สลับ **"แสดงรหัสผ่าน"** ↔ **"ซ่อนรหัสผ่าน"** + `aria-pressed` + `aria-controls` | – |
| จดจำ | checkbox **"จดจำฉันไว้"** · helper **"จำเฉพาะอีเมล/รหัสพนักงานบนเครื่องนี้ ไม่ยืดเวลาเข้าสู่ระบบ"** | – | **ไม่ติ๊กไว้ก่อน** | – |
| ลิงก์ | **"ลืมรหัสผ่าน?"** วางบรรทัดเดียวกับ label ชิดขวา สี `--text-link` | – | – | – |
| ปุ่มหลัก | **"เข้าสู่ระบบ"** | – | `btn--accent btn--lg btn--block` · กำลังส่ง → **"กำลังเข้าสู่ระบบ…"** + `aria-busy` + กันกดซ้ำ + คงความกว้างเดิม | – |
| SSO | **"เข้าสู่ระบบด้วย Google"** · **"เข้าสู่ระบบด้วย Microsoft"** (variant secondary) | – | ซ่อนเมื่อ `app.settings['allowed_sso_domains'] = []` **[รอยืนยัน Q5]** | – |

แหล่ง: `docs/06-ux/sitemap-screen-specs.md:470-475` · `prototype/01-login.html:77-103`

**routing ของช่องบัญชี:** ค่าที่ match `/^ST-\d{4}$/` (ไม่สนตัวพิมพ์ · แปลงเป็นตัวใหญ่ก่อนส่ง) → Edge Function `staff-code-login` (ไม่คืนอีเมล) · อื่น → Supabase Auth password grant ฝั่ง server (`docs/06-ux/sitemap-screen-specs.md:470` · `docs/04-security/security-design.md:175`)

**"จดจำฉันไว้":** จำเฉพาะค่าช่องบัญชีใน `localStorage` คีย์ `login_id` · **logout ไม่ลบค่านี้** · เอาติ๊กออกแล้วเข้าสู่ระบบ → ลบค่าที่จำ · **ซ่อนทั้งช่องบนอุปกรณ์ counter** · เปิดหน้าครั้งถัดไปให้เติมช่องบัญชีจากค่าที่จำและติ๊กไว้ (`docs/06-ux/sitemap-screen-specs.md:472`)

### 5.2 ข้อความผิดพลาด (ใช้ตรงตัว · ห้ามแยกตามสาเหตุ)

| กรณี | ข้อความ | รูปแบบ |
|---|---|---|
| รหัสผิด · ไม่มีบัญชี · บัญชี `INVITED` · บัญชี `DISABLED` — **ข้อความเดียวทุกกรณี** | **"อีเมล/รหัสพนักงาน หรือรหัสผ่านไม่ถูกต้อง"** | กล่อง `role="alert"` danger เหนือปุ่ม + ตั้ง `aria-invalid="true"` ทั้งช่องบัญชีและช่องรหัสผ่าน |
| เกินอัตรา (`security.login_ip_per_15min` = 20/15 นาที) | **"พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่"** | กล่อง danger/warning `role="alert"` · **ห้ามบอกว่าบัญชีมีอยู่หรือถูกล็อก** |
| เครือข่ายผิดพลาด | **"เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่"** | – |

แหล่ง: `docs/06-ux/sitemap-screen-specs.md:475-476, 494`
ถูกจำกัดเกิน 3 ครั้ง/วัน → แจ้ง `LOCKOUT_REPEATED` ถึง BUSINESS_ADMIN · หน่วงเวลาเพิ่มขึ้นแทนการล็อกบัญชี

### 5.3 มุมมองในหน้าเดียวกัน (สลับด้วย `hidden` ไม่เปลี่ยน URL)

| มุมมอง | เนื้อหา (ข้อความตรงตัว) | การกระทำ | สถานะใน repo |
|---|---|---|---|
| **ยืนยัน MFA** (บทบาทที่ `requires_mfa`) | หัว **"ยืนยันตัวตนสองขั้นตอน"** · ข้อความ **"กรอกรหัส 6 หลักจากแอป Authenticator ที่ลงทะเบียนไว้"** · ช่อง **"รหัสยืนยัน 6 หลัก"** `type=text` `inputmode="numeric"` `autocomplete="one-time-code"` `maxlength=6` `pattern="[0-9]{6}"` `required` | ปุ่มส้ม **"ยืนยันและเข้าสู่ระบบ"** → aal2 → หน้าแรก · ปุ่ม ghost **"ใช้บัญชีอื่น"** → กลับขั้นที่ 1 / ออกจากระบบ · **โฟกัสย้ายไปช่อง OTP ทันทีเมื่อเข้ามุมมองนี้** · ผิด: **"รหัสไม่ถูกต้อง กรุณาลองใหม่"** (client-side: **"กรุณากรอกรหัสตัวเลข 6 หลัก"**) | มีใน prototype (`prototype/01-login.html:113-124`) |
| **ลงทะเบียน MFA** (ยังไม่มี factor) | หัว **"ตั้งค่าการยืนยันตัวตนสองขั้นตอน"** · ขั้น 1 สแกน QR · ขั้น 2 กรอกรหัส 6 หลัก | ปุ่มส้ม **"ยืนยันและเปิดใช้งาน"** → เหตุการณ์ `MFA_ENROLLED` (เขียนโดย trigger บน `auth.mfa_factors` ไม่ใช่ frontend) | **ยังไม่มีใน prototype — ต้องสร้างใหม่ใน Phase 1** |
| **รับคำเชิญ / ตั้งรหัสผ่าน** | หัว **"ตั้งรหัสผ่านเพื่อเริ่มใช้งาน"** · ช่อง **"รหัสผ่านใหม่"** * (≥12 ตัวอักษร · ผิด: **"รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร"**) · ช่อง **"ยืนยันรหัสผ่าน"** * | ปุ่มส้ม **"ตั้งรหัสผ่าน"** → `api.activate_self()` → `ACTIVE` → หน้าแรก · ถ้าบทบาท `requires_mfa` ต่อด้วยมุมมองลงทะเบียน MFA · ลิงก์หมดอายุ (เกิน `invite_expires_at` 24 ชม.) → **"คำเชิญหมดอายุแล้ว กรุณาติดต่อผู้เชิญเพื่อส่งคำเชิญใหม่"** · รหัสผ่านรั่วไหล → **"รหัสผ่านนี้ไม่ปลอดภัย กรุณาตั้งรหัสอื่น"** | **ยังไม่มีใน prototype — ต้องสร้างใหม่** |
| **ลืมรหัสผ่าน / ตั้งรหัสผ่านใหม่** | หัว **"ตั้งรหัสผ่านใหม่"** (prototype ใช้ dialog sm หัว "ลืมรหัสผ่าน") · ช่อง **"อีเมลหรือรหัสพนักงาน"** `autocomplete="username"` | ปุ่มส้ม **"ส่งลิงก์ตั้งรหัสผ่านใหม่"** → Edge `password-reset` → **ตอบข้อความเดียวเสมอไม่ว่าบัญชีมีอยู่หรือไม่**: **"ถ้าข้อมูลตรงกับบัญชีที่ใช้งานอยู่ ระบบจะส่งลิงก์ไปที่อีเมลที่ลงทะเบียนไว้ ลิงก์มีอายุ 1 ชั่วโมง"** · ตั้งรหัสใหม่สำเร็จ → เพิกถอน session ทั้งหมด | dialog มีใน prototype (`prototype/01-login.html:142-163`) |

แหล่ง: `docs/06-ux/sitemap-screen-specs.md:485-488`

### 5.4 ลำดับหลังได้ session (บังคับ)

1. เรียก `api.get_my_access()`
2. `staff.status === 'INVITED'` → นำเข้า flow เปิดใช้งาน (`api.activate_self()`) — **ตัดสินจาก `staff.status` ไม่ใช่ `branches.length`** (ดูข้อ 2.1)
3. มี role ใดที่ `requires_mfa = true` และ `effective_now = false` → บังคับ MFA challenge/verify ผ่าน Server Action แล้วเรียก `get_my_access()` ซ้ำเพื่อให้ได้ `aal = 'aal2'`
4. ปลายทาง: `SYSTEM_ADMIN` → `/settings` · ทุกบทบาทอื่น → `/dashboard` · ถ้ามี deep link ที่เก็บไว้จากการแจ้งเตือน ให้ไปปลายทางนั้นแทน

แหล่ง: `docs/07-api/api-spec.md:1948-1949` · `docs/06-ux/sitemap-screen-specs.md:446, 490-495` · `docs/02-architecture/system-architecture.md:546`

### 5.5 ค่าเซสชันและอุปกรณ์ counter

- access token 15 นาที · refresh rotation (reuse 10 วินาที) · idle 2 ชม. · สูงสุด 12 ชม. · **counter idle 10 นาที** (`docs/00-brief/CANONICAL.md:824-826`)
- `core.devices.is_shared_counter = true` → ซ่อนบล็อก "จดจำ" และแสดงแทน: **"อุปกรณ์ counter ที่ใช้ร่วมกัน: ไม่มีตัวเลือกจดจำ · ไม่มีการใช้งาน 10 นาทีจะล็อกหน้าจอและต้องเข้าสู่ระบบใหม่"** (`prototype/01-login.html:93, 245`)
- `html[data-device="counter"]` บังคับเป้าสัมผัส 48px ทุกหน้า และเปิด `C-LOCK`
- **idle 10 นาทีต้อง sign-out จริง ไม่ใช่แค่ overlay** และต้องล้างข้อมูลที่แสดงบนจอก่อนแสดงหน้าล็อก (`docs/04-security/security-design.md:312`)
- ทุกเหตุการณ์ (password · SSO · MFA · refresh · lockout · `IDLE_LOCK` · `LOGOUT`) บันทึกที่ `audit.login_events` แหล่งเดียว
- **ห้าม service worker cache หน้านี้หลังเข้าสู่ระบบ**

### 5.6 ลำดับการออกจากระบบ (บังคับ)

1. Server Action sign-out → Supabase เพิกถอน refresh token + ลบ cookie
2. ล้าง Cache Storage · IndexedDB · sessionStorage · localStorage ทั้งหมด **ยกเว้น `device_id` และ `login_id`**
3. ยกเลิกการสมัคร Web Push ของอุปกรณ์นี้
4. เขียน `audit.login_events` เหตุการณ์ `LOGOUT`

แหล่ง: `docs/04-security/security-design.md:325-329` · `docs/00-brief/CANONICAL.md:830`

---

## 6. สเปกหน้าจอ 07 — รับลูกค้าเข้าร้าน

**route:** `/reception` · prototype อ้างอิง: `prototype/07-reception.html`
`<body data-page="reception" data-roles="STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS">` · เมนู "ลูกค้าเข้าร้าน › รับลูกค้าเข้าร้าน"
**ไม่มีตัวเลือกช่วงเวลา (C-PERIOD)** · วันที่ = วันนี้เสมอ ไม่มีตัวเลือกวัน (`prototype/07-reception.html:47` · `docs/06-ux/sitemap-screen-specs.md:1411`)

### 6.1 สิ่งที่แต่ละบทบาทเห็นต่างกัน

| บทบาท | เห็น |
|---|---|
| `STAFF` | ฟอร์ม (`visit.create` สาขาตน) · คิวสาขาตน · รับคิวได้ทุกคิว `WAITING` ที่ยังไม่มีผู้รับ · แก้/ปิด/ระบุลูกค้าได้เฉพาะคิวที่ตนรับ หรือคิวที่ยังไม่มีผู้รับซึ่งตนสร้าง (scope O) · **ไม่มีเมนู "เปลี่ยนผู้รับคิว"** |
| `SUPERVISOR` | เหมือน STAFF + scope T (คิวของสมาชิกทีม) + เปลี่ยนผู้รับคิวได้ |
| `BRANCH_MANAGER` | scope B ทุกคิวในสาขา + เปลี่ยนผู้รับคิวได้ |
| `OPERATIONS` | **ไม่มีคอลัมน์ฟอร์มเลย** (คิวเต็มความกว้าง) + แถบ info **"บทบาทของคุณดูคิวได้อย่างเดียว"** + select สาขา JP1–JP4 (เริ่มที่ JAUNPHONE 1) · ไม่มีปุ่มรับคิว/บันทึกผล |

แหล่ง: `docs/06-ux/sitemap-screen-specs.md:1333-1342` · `prototype/07-reception.html:231-240`

### 6.2 หัวหน้า + ชิปสรุปวันนี้

- `h1` **"รับลูกค้าเข้าร้าน"** · บรรทัดรอง **"{ชื่อสาขา} · วันที่ 11 ก.ย. 2569 เวลา 10:24 น."** (วันที่/เวลาจาก `app.clock()`)
- ชิป neutral 4 ตัว **เรียงตายตัว** ตัวเลข `font-weight: 600` + `tabular-nums` ห่อใน `role="group"` `aria-label="สรุปวันนี้ {สาขา}"`:
  **"ลูกค้าเข้าร้าน (Walk-in)"** · **"ออนไลน์/โทร"** · **"ผู้มาติดต่อ (Visitor)"** · **"visit เปิดอยู่"**
- นับจาก `crm.visits` ของสาขา วันนี้ (Asia/Bangkok) **ไม่นับ `CANCELLED`**: Walk-in = `channel_code='WALK_IN'` · ออนไลน์/โทร = ช่องทางอื่น · ผู้มาติดต่อ = ทั้งหมด · เปิดอยู่ = `status IN ('WAITING','IN_SERVICE')`

แหล่ง: `docs/06-ux/sitemap-screen-specs.md:1381-1382` · `prototype/07-reception.html:110-117`

### 6.3 ฟอร์ม (3 ช่อง · ข้อความตรงตัว)

| name | ป้าย | ชนิด | บังคับ | รายละเอียด / ข้อความผิด |
|---|---|---|:--:|---|
| `party_size` | **"จำนวนลูกค้า"** | stepper (`C-STEPPER`) | ✓ | min 1 · ค่าเริ่มต้น 1 · ปุ่ม − ปิดเมื่อค่าเป็น 1 · `role="spinbutton"` · ผิด: **"จำนวนลูกค้าต้องไม่น้อยกว่า 1"** · ใช้แสดงเท่านั้น **ไม่ใช่ตัวนับ KPI** |
| `source` | **"รู้จักร้านจาก"** | select (width half) | – | placeholder **"ไม่ระบุ"** · `ref.sources` 11 ค่า → `source_code` |
| `interest` | **"วัตถุประสงค์หลัก"** | `C-CHIPS` เลือกค่าเดียว | ✓ | ชิปครบ 7 ค่าจาก `ref.interest_types` · ผิด: **"เลือกวัตถุประสงค์หลัก"** |

แหล่ง: `prototype/07-reception.html:71-75` · `docs/06-ux/sitemap-screen-specs.md:1383-1387`

**กลุ่ม "ระบุลูกค้า (ถ้ามี)"** (`role="group"`):
- ช่องค้นหา `type="search"` `autocomplete="off"` placeholder **"ค้นหาชื่อ / เบอร์โทร"** + label `sr-only` **"ค้นหาลูกค้า"**
- ปุ่ม secondary **"ค้นหา"** + คำว่า **"หรือ"** + ปุ่ม secondary **"+ สร้างลูกค้าใหม่"** (ต้องมี `customer.create` ไม่งั้นซ่อน)
- **ค้นเมื่อกด Enter หรือกดปุ่มเท่านั้น — ห้ามค้นขณะพิมพ์** (Enter ในช่อง `preventDefault` แล้วค้น + คืนโฟกัสท้ายข้อความ)
- ผลลัพธ์อยู่ใน `div aria-live="polite"` แสดงสูงสุด 5 รายการ · แต่ละรายการเป็นปุ่ม `min-height: 48px` แสดง avatar + **"คุณ{ชื่อ}"** + `customer_no` + เบอร์ปิดบัง + badges
- < 3 ตัวอักษร → helper **"พิมพ์อย่างน้อย 3 ตัวอักษร แล้วกดค้นหา · เบอร์โทรต้องพิมพ์ครบทั้งค่า"**
- ไม่พบ → **"ไม่พบผลลัพธ์ · เบอร์โทร อีเมล LINE ID IMEI และเลขธุรกรรมต้องพิมพ์ครบทั้งค่า"**
- เลือกแล้วแสดงชิป **"คุณ{ชื่อ} · {customer_no}"** + ปุ่มไอคอน `aria-label` **"ล้างลูกค้าที่เลือก"**
- helper ท้ายกลุ่ม: **"ไม่พบลูกค้า? กด 'สร้างลูกค้าใหม่' แล้วกรอกเบอร์ ระบบจะตรวจลูกค้าจากสาขาอื่นให้ · การค้นหาบันทึก CUSTOMER_SEARCH"**

แหล่ง: `prototype/07-reception.html:119-140` · `docs/06-ux/sitemap-screen-specs.md:1388`

### 6.4 ปุ่มของฟอร์ม

| ปุ่ม | variant | ผล |
|---|---|---|
| **"รับเข้าคิว"** | secondary lg | `api.open_visit(p)` + `visit_mode: 'QUEUE'` → `WAITING` · `owner_staff_id` ว่าง |
| **"เริ่มให้บริการ"** | **accent (ส้ม)** lg | `api.open_visit(p)` + `visit_mode: 'SERVICE'` → `IN_SERVICE` ผู้กดเป็นผู้รับ |

ทั้งคู่ต้องมี `visit.create` · บนมือถือแสดงเป็นแถบ sticky bottom
ตรวจก่อนเปิด visit: วัตถุประสงค์หลักต้องเลือก + จำนวน ≥ 1 + สาขาต้องอยู่ใน scope `visit.create` ไม่งั้น toast warning **"รายการนี้อยู่นอกสาขาในสิทธิ์ของคุณ"**
ถ้าเลือกลูกค้าที่ยังไม่ผูกสาขานี้ → toast warning **"ลูกค้านี้ยังไม่เชื่อมกับสาขานี้ · ใช้ 'สร้างลูกค้าใหม่' เพื่อตรวจและผูกลูกค้าจากสาขาอื่น"**

**ผลหลังเปิด visit:**
- รับเข้าคิว → toast **"รับเข้าคิวแล้ว · คิว {NNN}"** + ล้างฟอร์ม (party_size 1 · source ว่าง · interest ว่าง · ไม่ระบุลูกค้า) + แถวใหม่ในคิว
- เริ่มให้บริการ + ระบุลูกค้าแล้ว → ไปหน้า 05 `?c={customer_no}` · ยังไม่ระบุ → อยู่หน้าเดิม + toast **"เริ่มให้บริการคิว {NNN} แล้ว"**
- `queue_no` แสดงเป็น **"คิว 001"** (3 หลัก zero-pad) · `visit_no` รูปแบบ `V-{BRANCH}-{YYMMDD}-{NNN}` — **สองเลขไม่จำเป็นต้องเท่ากัน**

แหล่ง: `docs/06-ux/sitemap-screen-specs.md:1389, 1395-1396` · `prototype/07-reception.html:141-146, 288-321`

**เสนอสร้าง Lead:** `api.open_visit` **ไม่สร้าง Lead อัตโนมัติ** → เมื่อ visit ที่เพิ่งเปิดมีลูกค้าและวัตถุประสงค์ `creates_lead = true` (`BUY` `SELL` `TRADE_IN` `INSTALLMENT` `ACCESSORY`) และผู้ใช้มี `lead.create` ให้แสดง toast info ค้างไว้ (persist) ข้อความ **"ต้องการสร้าง Lead สำหรับ{วัตถุประสงค์}หรือไม่"** พร้อมปุ่มในtoast **"สร้าง Lead"** · `REPAIR` และ `INQUIRY` ไม่เสนอ (`docs/06-ux/sitemap-screen-specs.md:1397`)

### 6.5 รายการคิว (`C-QUEUE`)

- หัวการ์ด **"คิววันนี้ ({N เปิดอยู่})"** + checkbox **"แสดงที่ปิดแล้ว"** (ค่าเริ่มต้นไม่ติ๊ก) + ปุ่ม ghost **"รีเฟรช"**
- `<ol class="queue-list" aria-label="คิววันนี้">` เรียง `queue_no` น้อย→มาก · แถวสูง ≥ 72px · กล่องเลขคิว 56px พื้น `--navy-50` + `sr-only` **"คิว"**
- บรรทัดบน: ป้ายสถานะ visit + ป้ายวัตถุประสงค์ + (`party_size > 1` → badge **"{n} คน"**) + (รอนาน → badge warning **"รอนาน"**)
- บรรทัดรองคั่นด้วย `" · "`: **"เข้าคิว HH:mm"** · **"รอ {n} นาที"** (เฉพาะ `WAITING` นับนาทีเต็มถึง `app.clock()`) · **"ผู้รับ {ชื่อ}"** · **"ลูกค้า: {ชื่อ}"** หรือ **"ยังไม่ระบุลูกค้า"** · **"ผล: {ป้าย}"** · `CANCELLED` เพิ่ม **"ยกเลิก (สร้างผิด) · ไม่นับใน KPI"**
- เกิน `sla.visitor_waiting_min` = 15 นาที → ป้าย warning **"รอนาน"** + ขอบซ้าย 4px `--warning-solid` + แจ้งเตือน `VISITOR_WAITING_LONG`
- ว่าง → **"ยังไม่มีคิวที่เปิดอยู่"**
- **ไม่แสดงเบอร์โทรในรายการคิว** · แสดงชื่อลูกค้าเฉพาะรายที่ผู้ใช้อ่านได้ (RLS)
- รีเฟรชอัตโนมัติทุก 30 วินาทีขณะหน้าเปิดและมองเห็น (**ข้อเสนอของผู้ออกแบบ**) + ปุ่ม "รีเฟรช"

แหล่ง: `docs/06-ux/design-system.md:897-906` · `prototype/07-reception.html:147-184` · `docs/06-ux/sitemap-screen-specs.md:1391, 1414, 1419-1421`

**ป้ายไทยของ `crm.visit_status` (ใช้ตรงตัว):**

| ค่า | ป้าย | tone |
|---|---|---|
| `WAITING` | **"รอรับบริการ"** | warning |
| `IN_SERVICE` | **"กำลังให้บริการ"** | info |
| `COMPLETED` | **"เสร็จสิ้น"** | success |
| `LEFT` | **"ออกก่อนรับบริการ"** | neutral |
| `CANCELLED` | **"ยกเลิก (สร้างผิด)"** | neutral |

(`docs/00-brief/CANONICAL.md:180-196` · `prototype/assets/data.js:351-357`)

### 6.6 ปุ่มหลักของแต่ละแถว

| สถานะแถว | ปุ่ม | พฤติกรรม |
|---|---|---|
| `WAITING` | secondary **"รับคิว"** | **ไม่มี dialog** — กดแล้วทำงานทันที (PATCH ตามข้อ 3.2) · สำเร็จ → toast **"รับคิว {NNN} แล้ว"** · 0 แถว → toast warning **"คิวนี้มีผู้รับแล้ว"** + โหลดคิวใหม่ · นอกสาขา → ปุ่มปิดพร้อมเหตุผล **"รายการนี้อยู่นอกสาขาในสิทธิ์ของคุณ"** |
| `IN_SERVICE` | secondary **"บันทึกผล"** | เปิด dialog ข้อ 6.8 · ไม่ใช่คิวของตน → ปุ่มปิดพร้อมเหตุผล **"บันทึกผลได้เฉพาะคิวที่คุณรับ"** |

สิทธิ์รับคิว = มี `visit.update` scope ใดก็ได้ในสาขานั้น (ไม่ต้องเป็นเจ้าของ) — `docs/00-brief/CANONICAL.md:191` · `docs/06-ux/sitemap-screen-specs.md:1398`

### 6.7 เมนู ⋮ ของแถว

ปุ่มไอคอน `aria-haspopup="menu"` `aria-expanded` `aria-label="เมนูคิว {NNN}"` · เปิดแล้วโฟกัสรายการแรก

| รายการ | แสดงเมื่อ |
|---|---|
| **"ระบุลูกค้า"** (หรือ **"เปลี่ยนลูกค้า"** เมื่อระบุแล้ว + scope ≥ T) | `WAITING`/`IN_SERVICE` |
| **"เปลี่ยนผู้รับคิว"** | `IN_SERVICE` + scope T/B |
| **"ออกก่อนรับบริการ"** | `WAITING` |
| **"แก้ผลการให้บริการ"** | `COMPLETED` (เห็นเมื่อติ๊ก "แสดงที่ปิดแล้ว") |
| **"ดูข้อมูลลูกค้า"** → หน้า 05 | มีลูกค้า + `customer.read` |
| **"ยกเลิก (สร้างผิด)"** | visit เปิดอยู่ |

เหตุผลปุ่มปิดเฉพาะหน้านี้ (ข้อความตรงตัว): **"แก้คิวที่ยังไม่มีผู้รับได้เฉพาะผู้ที่รับเข้าคิวหรือผู้จัดการสาขา"** · **"ยกเลิกได้เฉพาะผู้สร้างภายใน 15 นาที หรือหัวหน้าทีม/ผู้จัดการสาขา"**
(`prototype/07-reception.html:256-283` · `docs/06-ux/sitemap-screen-specs.md:1400-1405`)

### 6.8 dialog "บันทึกผลการให้บริการ"

dialog ขนาด md · หัว **"บันทึกผลการให้บริการ · คิว {NNN}"** (แก้ทีหลังใช้หัว **"แก้ผลการให้บริการ · คิว {NNN}"** + helper **"แก้ผลได้ภายในวันธุรกิจเดียวกันเท่านั้น"**)
intro บอกวัตถุประสงค์ + เวลาเข้าคิว + ผู้รับ

`name="outcome"` type radio · **บังคับ** · ผิด: **"เลือกผลการให้บริการ"** · **มี 5 ตัวเลือกเท่านั้น**:
`PURCHASED` "ซื้อแล้ว" · `FOLLOW_UP` "นัดติดตาม" · `NOT_YET` "ยังไม่ซื้อ" · `NOT_INTERESTED` "ไม่สนใจ" · `SERVICE_DONE` "ให้บริการเสร็จ (ซ่อม/สอบถาม/ชำระ)"
**`LEFT_BEFORE_SERVICE` อยู่ในเมนูแยก · `UNRECORDED` ระบบตั้งเท่านั้น — ทั้งสองห้ามอยู่ใน radio**

| outcome ที่เลือก | ช่องเพิ่ม / กติกา |
|---|---|
| `PURCHASED` | ต้องมีลูกค้า ไม่งั้น error ที่ช่อง **"ต้องระบุลูกค้าก่อนบันทึกว่าซื้อแล้ว"** · note **"ถ้าลูกค้ามีโอกาสขายที่เปิดอยู่ ระบบเสนอให้ปิดเป็นปิดการขาย (ไม่บังคับใน V1)"** + checkbox **"เปิดหน้าโอกาสการขายหลังบันทึก เพื่อปิดการขาย"** |
| `FOLLOW_UP` | ต้องมีลูกค้า (**"ต้องระบุลูกค้าก่อนบันทึกนัดติดตาม"**) + บังคับ 3 ช่อง: **"การติดตามถัดไป"** (text · `piiWarn` · ≤200 · **"กรอกการติดตามถัดไป"**) · **"ประเภท"** (select `ref.task_types` · half · **"เลือกประเภท"**) · **"วันเวลา"** (datetime · half · **"เลือกวันเวลา"** · ต้องหลังเวลาปัจจุบัน ไม่งั้น **"เลือกเวลาหลังจากตอนนี้"**) |
| `NOT_YET` | 3 ช่องเดียวกันแสดงแต่ไม่บังคับ (บังคับเมื่อลูกค้ามี lead/opportunity เปิดอยู่) + helper |
| `NOT_INTERESTED` | มีลูกค้า → select **"เหตุผลที่ไม่สำเร็จ"** (`ref.lost_reasons`) **บังคับ** **"เลือกเหตุผลที่ไม่สำเร็จ"** + **"หมายเหตุ"** (textarea · `piiWarn` · ≤2000) บังคับเมื่อเหตุผล = `OTHER` (**"กรอกหมายเหตุเมื่อเลือกอื่น ๆ"**) · ไม่มีลูกค้า → helper **"คิวนี้ยังไม่ระบุลูกค้า จึงไม่มี Lead ที่ต้องปิด"** |
| `SERVICE_DONE` | ไม่มีช่องเพิ่ม |

ปุ่ม **"ยกเลิก"** (ghost) + **"บันทึกผล"** (ส้ม) → `api.close_visit(p_visit_id, p_outcome_code, p)` → `COMPLETED` + `ended_at` → toast **"บันทึกผลคิว {NNN} แล้ว"**
(`prototype/07-reception.html:377-432` · `docs/06-ux/sitemap-screen-specs.md:1399` · `docs/00-brief/CANONICAL.md:198-210`)

### 6.9 dialog อื่นของหน้า 07

| dialog | สเปก |
|---|---|
| **ออกก่อนรับบริการ** (แถว `WAITING`) | ขนาด sm · หัว **"ออกก่อนรับบริการ"** · ข้อความ **"ยืนยันว่าลูกค้าคิว {NNN} ออกไปก่อนรับบริการ?"** · ปุ่มยืนยัน **"บันทึกว่าออกก่อนรับบริการ"** variant **danger-outline** → `api.close_visit(p_visit_id,'LEFT_BEFORE_SERVICE', p)` → `WAITING → LEFT` · สถานะเปลี่ยนไปแล้ว → toast warning **"สถานะนี้แก้ไขไม่ได้"** |
| **ยกเลิก (สร้างผิด)** | ขนาด sm · หัว **"ยกเลิกคิว {NNN}"** · ช่อง **"เหตุผลที่ยกเลิก"** textarea **บังคับ** + `C-PII-WARN` + maxLength 500 rows 2 · checkbox **บังคับ** **"รายการนี้สร้างผิด ไม่ใช่ลูกค้าจริง"** ผิด: **"ติ๊กยืนยันว่ารายการนี้สร้างผิด"** · ปุ่ม **"ยกเลิกคิว"** variant danger → PATCH `status='CANCELLED'` + `cancel_reason` · **ไม่นับในทุก KPI** (ต้องลดตัวเลขชิปทุกตัว) · toast **"ยกเลิกคิว {NNN} แล้ว · visit ที่ยกเลิกไม่นับในทุก KPI"** |
| **ระบุลูกค้า** | ขนาด md · หัว **"ระบุลูกค้าให้คิว {NNN}"** (หรือ **"เปลี่ยนลูกค้าให้คิว {NNN}"**) · ช่องค้นหา + ปุ่ม **"ค้นหา"** (Enter ก็ค้น) · เริ่มต้น helper **"พิมพ์อย่างน้อย 3 ตัวอักษร · ค้นเฉพาะลูกค้าที่คุณอ่านได้"** · <3 ตัวอักษร → **"พิมพ์อย่างน้อย 3 ตัวอักษร · เบอร์โทรต้องพิมพ์ครบทั้งค่า"** · ไม่พบ → **"ไม่พบผลลัพธ์ · ลองสร้างลูกค้าใหม่/ตรวจลูกค้าจากสาขาอื่น"** · ผลสูงสุด 5 รายการ `aria-pressed` · เลือกแล้วแสดง **"เลือก: {ชิป}"** · ลิงก์ **"สร้างลูกค้าใหม่ / ตรวจลูกค้าจากสาขาอื่น"** → 04 `?mode=visit&visit={visit_no}` · ปุ่มส้ม **"บันทึก"** · ไม่เลือก → error **"เลือกลูกค้าจากผลการค้นหา"** · ผล: PATCH `visits.customer_id` (ตั้งได้เมื่อยังว่างเท่านั้น) · **ลูกค้านอกขอบเขตต้องผ่านหน้า 04 + `api.link_customer_to_branch`** |
| **เปลี่ยนผู้รับคิว** (`C-DIALOG-ASSIGN`) | เฉพาะ `IN_SERVICE` + `visit.update` scope T/B · หัว **"เปลี่ยนผู้รับคิว {NNN}"** + บรรทัดรอง **"ปัจจุบัน: {ชื่อ}"** / **"ปัจจุบัน: ยังไม่มีผู้รับ"** · **"ผู้รับคิวใหม่"** select **บังคับ** (**"เลือกผู้รับคิวใหม่"**) = พนักงาน ACTIVE ที่มี assignment ในสาขาของ visit และไม่ใช่คนเดิม · **"เหตุผล"** select **บังคับ** (**"เลือกเหตุผล"**) จาก `ref.ownership_change_reasons` **ตัด `BRANCH_TRANSFER` ออก** เหลือ เปลี่ยนกะ · กระจายงาน · พนักงานลาออก · ลูกค้าขอเปลี่ยน · อื่น ๆ · **"หมายเหตุ"** ไม่บังคับ ≤200 + `C-PII-WARN` · ปุ่ม **"ยกเลิก"** (ghost) + **"บันทึก"** (ส้ม) → `api.assign_owner('VISIT', visit_id, p_to_staff_id, p_reason_code, p_note, NULL)` **เท่านั้น** · toast **"เปลี่ยนผู้รับคิว {NNN} เป็น {ชื่อ} แล้ว"** |

แหล่ง: `prototype/07-reception.html:433-535` · `docs/06-ux/sitemap-screen-specs.md:1401-1404` · `docs/06-ux/design-system.md:786-798`

### 6.10 ค่าเริ่มต้น · สถานะ · responsive

- ค่าเริ่มต้น: สาขา = สาขาตน (บทบาทสาขาเดียวไม่มี select) · OPERATIONS = JAUNPHONE 1 + select JP1–JP4 · วันที่ = วันนี้เสมอ · "แสดงที่ปิดแล้ว" ไม่ติ๊ก · ฟอร์ม: จำนวน 1 · ไม่เลือกวัตถุประสงค์ · ไม่ระบุลูกค้า (`docs/06-ux/sitemap-screen-specs.md:1411`)
- อุปกรณ์ counter idle 10 นาที → `C-LOCK` ทับทั้งจอ พื้น navy-900 หัว **"หน้าจอถูกล็อกเนื่องจากไม่มีการใช้งาน"** + ปุ่มส้ม **"เข้าสู่ระบบอีกครั้ง"** และ **ต้องล้างข้อมูลที่แสดงบนจอก่อนแสดงหน้าล็อก** (`docs/06-ux/design-system.md:978-980`)
- เดสก์ท็อป/แท็บเล็ต: 2 คอลัมน์ 55/45 (ฟอร์มซ้าย · คิวขวา) · แท็บเล็ต counter: ชิป · ปุ่ม · stepper · ปุ่มหลักสูง 48px
- **มือถือ <768px:** segmented บนสุด 2 ช่อง **"รับลูกค้า"** และ **"คิววันนี้ ({N})"** สลับแสดงทีละส่วน (`data-mview=form|queue`) · ฟอร์มหน้าเดียว · ปุ่ม sticky เหนือ bottom nav (`bottom: calc(var(--bottom-nav-h) + env(safe-area-inset-bottom))`) · **FAB "+ รับลูกค้า" ซ่อนบนหน้านี้** · OPERATIONS ไม่มีคอลัมน์ฟอร์มจึงไม่มี segmented
- เกณฑ์ความเร็วผูกพัน: **รับเข้าคิวไม่เกิน 3 วินาที** (`docs/08-delivery/phase1-plan.md:95`)

---

## 7. สเปกหน้าจอ 04 — Quick Capture (เพิ่มลูกค้าใหม่ / รับลูกค้าใหม่)

**route:** `/customers/new` (`?mode=` · `?visit=`) · prototype อ้างอิง: `prototype/04-quick-capture.html`
`<body data-page="quick-capture" data-roles="STAFF SUPERVISOR BRANCH_MANAGER BUSINESS_ADMIN">`

### 7.1 สองโหมดผ่าน URL param `mode`

| โหมด | หัว `h1` | lead text | ใช้ได้ |
|---|---|---|---|
| `mode=customer` (**ค่าเริ่มต้น**) | **"เพิ่มลูกค้าใหม่"** | **"สร้างลูกค้าอย่างเดียว ไม่เปิดการรับลูกค้า · กรอกให้เร็วที่สุดแล้วเติมภายหลังได้"** | ST · SV · BM · BA |
| `mode=visit` | **"รับลูกค้าใหม่"** | (มี `?visit=V-…`) **"สร้างลูกค้าและผูกกับ visit ที่เปิดอยู่ (ไม่เปิด visit ใหม่)"** | ST · SV · BM (ต้องมีทั้ง `customer.create` + `visit.create`) |

- **`BUSINESS_ADMIN` เปิด `mode=visit` → บังคับกลับเป็น `mode=customer`** + แถบ info **"บทบาทของคุณเพิ่มลูกค้าได้อย่างเดียว ไม่เปิดการรับลูกค้า (ข้อ 8.1)"**
- `visit` ที่ไม่ถูกต้อง/นอกสาขา → `C-STATE-NOTFOUND` ข้อความ **"visit ที่ระบุต้องเป็น visit ที่เปิดอยู่ในสาขาที่คุณรับคิวได้"** + ปุ่ม **"กลับหน้ารับลูกค้าเข้าร้าน"**
- ไม่มีสาขาที่มี `customer.create` → `C-STATE-NOACCESS-PAGE`
- param ที่อนุญาต: `mode` · `visit` **เท่านั้น** — **ค่าที่กรอกห้ามลง URL หรือ storage ใด ๆ**

แหล่ง: `prototype/04-quick-capture.html:63, 151-180` · `docs/06-ux/sitemap-screen-specs.md:843-866, 971-974`

### 7.2 แท็บ (เดสก์ท็อป/แท็บเล็ต ≥768px)

`C-TABS` 3 แท็บตายตัว `role="tablist"` `aria-label="ส่วนของฟอร์ม"`: **"ข้อมูลพื้นฐาน"** (`basic`) · **"ความสนใจ"** (`interest`) · **"เพิ่มเติม"** (`more`)
แต่ละ tab มี `id=qc-tab-{id}` `aria-controls=qc-panel-{id}` `aria-selected` `tabindex` 0/-1 · ←→ Home End ย้ายและเลือก (manual activation)

จับคู่ฟิลด์→แท็บ: `basic` = phone · first_name · last_name · channel · branch · privacy | `interest` = interest · product_type · product_model | `more` = nickname · line_id · email · province · source · note · marketing · marketing_channels · age_ok
แท็บที่มีช่องผิดแสดง badge danger **"!"** + `sr-only` **"มีข้อผิดพลาด"** และกดบันทึกจะสลับไปแท็บแรกที่ผิด
(`prototype/04-quick-capture.html:80-84, 189-194, 528-535`)

### 7.3 ฟิลด์ทั้งหมด (ข้อความไทยตรงตัว)

**แท็บ "ข้อมูลพื้นฐาน"**

| name | ป้าย | บังคับ | ปลายทาง | ข้อความผิด |
|---|---|:--:|---|---|
| `phone` | **"เบอร์โทรศัพท์"** · placeholder **"เช่น 08X-XXX-XXXX"** · `type="tel"` `inputmode="tel"` `autocomplete="off"` | ✓ เมื่อ `channel ∈ {WALK_IN, PHONE}` (ดาว `*` โผล่/หายตามช่องทาง) | contact `PHONE` | **"ต้องกรอกเบอร์โทรเมื่อลูกค้าติดต่อผ่าน Walk-in หรือโทรศัพท์"** |
| `first_name` | **"ชื่อ"** (width half) | ✓ เมื่อไม่ได้กรอกชื่อเล่น | `first_name` | **"กรอกชื่อหรือชื่อเล่นอย่างน้อยหนึ่งช่อง"** (แสดงที่ช่องชื่อ) |
| `last_name` | **"นามสกุล"** (half) | – | `last_name` | – |
| `channel` | **"ช่องทางที่ติดต่อมา"** select · placeholder **"เลือกช่องทาง"** | ✓ | `ref.channels` 7 ค่า | **"เลือกช่องทางที่ติดต่อมา"** |
| `branch` | **"สาขา"** select · placeholder **"เลือกสาขา"** | ✓ | `app.scope_branch_ids('customer.create','OWN')` → `first_branch_id` | **"เลือกสาขา"** |
| `privacy` | checkbox **"แจ้งประกาศความเป็นส่วนตัวให้ลูกค้าแล้ว"** | ✓ · **ไม่ติ๊กไว้ก่อน** | consent `PRIVACY_NOTICE GRANTED` | **"ต้องแจ้งประกาศความเป็นส่วนตัวให้ลูกค้าก่อนบันทึก"** |

- `phone` helper: **"บังคับเมื่อช่องทางที่ติดต่อมาเป็น Walk-in (หน้าร้าน) หรือโทรศัพท์ · ระบบตรวจข้อมูลซ้ำอัตโนมัติเมื่อกรอกเบอร์ครบ"**
- รูปแบบถูกต้อง: มือถือ `/^0[689]\d{8}$/` (10 หลัก) · บ้าน `/^0[2-7]\d{7}$/` (9 หลัก) — **ผิดรูปแบบเป็นคำเตือน ไม่บล็อกการบันทึก** แสดงเมื่อกรอก ≥9 หลัก: **"เบอร์นี้ไม่ตรงรูปแบบเบอร์มือถือ (06 08 09 · 10 หลัก) หรือเบอร์บ้าน (02–07 · 9 หลัก) ระบบจะบันทึกเป็นเบอร์ไม่ถูกต้อง"**
- ข้างช่อง `phone` มีปุ่ม secondary **"ตรวจสอบซ้ำ"** ซึ่งปิดพร้อมเหตุผล **"กรอกเบอร์โทร LINE ID หรืออีเมลก่อน"** เมื่อยังไม่มีตัวระบุใด
- `channel`: **เมื่อมาจากหน้า 07 พร้อม visit → ล็อกเป็น `WALK_IN` (hidden input)** และแสดงข้อความ **"Walk-in (หน้าร้าน) · ล็อกจากหน้ารับลูกค้าเข้าร้าน"** แทน select
- `branch`: **มีสาขาเดียว → ซ่อน select เติมค่าอัตโนมัติ (hidden)** และแสดง **"{ชื่อสาขา} · ล็อกตามสิทธิ์ของคุณ"** (หรือ **"· ล็อกตามสาขาของ visit"**)
- `privacy`: ใต้ช่องแสดง **"ฉบับ PN-2026-01"** + ปุ่มลิงก์ **"ดูประกาศความเป็นส่วนตัว"** + ข้อความ `captured_via` ที่เปลี่ยนตามช่องทาง — `WALK_IN` → **"จะบันทึกเป็น พนักงานบันทึก"** (`STAFF_FORM`) · ช่องทางอื่น → **"ส่งลิงก์ประกาศให้ลูกค้าก่อนติ๊ก · จะบันทึกเป็น ส่งลิงก์ประกาศ"** (`LINK_SENT`) · ยังไม่เลือกช่องทาง → แสดงทั้งสองกรณี
  **การติ๊กนี้คือการบันทึกว่า "แจ้งแล้ว" ไม่ใช่การขอความยินยอม**

แหล่ง: `docs/06-ux/sitemap-screen-specs.md:896-905` · `prototype/04-quick-capture.html:91-107, 135-147, 180-183, 230-256`

**แท็บ "ความสนใจ"**

| name | ป้าย | บังคับ | รายละเอียด |
|---|---|:--:|---|
| `interest` | **"ความสนใจ"** `C-CHIPS` เลือกค่าเดียว | ✓ | 7 ค่าเดียวกับหน้า 07 · ผิด: **"เลือกความสนใจ"** |
| `product_type` | **"ประเภทสินค้า"** select · placeholder **"เลือกประเภทสินค้า"** (half) | – | `ref.product_types` 8 ค่า |
| `product_model` | **"รุ่นที่สนใจ"** · placeholder **"เช่น iPhone 17 Pro"** · maxLength 120 (half) | – | – |

**helper ใต้ชิปความสนใจ เปลี่ยนตามค่า (ข้อความตรงตัว)**
- ยังไม่เลือก → **"ซื้อเครื่อง · ขายเครื่อง · เทิร์นเครื่อง · ผ่อน · อุปกรณ์เสริม สร้าง Lead อัตโนมัติ · ซ่อม และสอบถาม/โปรโมชั่น ไม่สร้าง Lead"**
- เลือกค่าที่ `creates_lead = false` → **"ไม่สร้าง Lead ({ป้าย})"**
- เลือกค่าที่ `creates_lead = true` → **"ระบบจะสร้าง Lead ให้อัตโนมัติ · ผู้รับผิดชอบ: คุณ · สถานะเริ่มต้น: {ติดต่อแล้ว เมื่อ `ref.channels.is_live=true` คือ WALK_IN/PHONE · ใหม่ เมื่อช่องทางข้อความ} · ติดตามครั้งแรก: ติดต่อกลับลูกค้า ภายใน 30 นาที"**

(`prototype/04-quick-capture.html:108, 238-245` · `docs/06-ux/sitemap-screen-specs.md:911`)

**แท็บ "เพิ่มเติม"**

| name | ป้าย | รายละเอียด |
|---|---|---|
| `nickname` | **"ชื่อเล่น"** (half) | ทางเลือกแทนชื่อ |
| `line_id` | **"LINE ID"** (half) | contact `LINE_ID` |
| `email` | **"อีเมล"** `type=email` (half) | ผิด: **"รูปแบบอีเมลไม่ถูกต้อง"** |
| `province` | **"จังหวัด"** select · placeholder **"เลือกจังหวัด"** (half) | `ref.provinces` 77 |
| `source` | **"รู้จักร้านจาก"** select · placeholder **"เลือกแหล่งที่มา"** (half) | `ref.sources` 11 → `first_source_code` |
| `note` | **"รายละเอียดเพิ่มเติม (ถ้ามี)"** textarea rows 3 | **maxLength 2000 + `C-PII-WARN` + ตัวนับ "0/2,000"** → โน้ตแรกใน `crm.customer_notes` |
| `marketing` | checkbox **"ลูกค้ายินยอมรับข่าวสาร/โปรโมชั่น (ไม่บังคับ)"** ไม่ติ๊กไว้ก่อน · **แสดงเฉพาะผู้มีสิทธิ์ `customer.consent.manage`** | ติ๊กแล้วจึงแสดง 2 ช่องและบังคับทั้งคู่ |
| `marketing_channels` | **"ช่องทางรับข่าวสาร"** checkboxes แนวนอน 4 ค่า **LINE · SMS · โทรศัพท์ · อีเมล** | ผิด: **"เลือกช่องทางรับข่าวสารอย่างน้อย 1 ช่องทาง"** |
| `age_ok` | checkbox **"ลูกค้าอายุ 20 ปีขึ้นไป หรือผู้ใช้อำนาจปกครองยินยอม"** | ผิด: **"ต้องยืนยันอายุหรือความยินยอมของผู้ใช้อำนาจปกครอง"** · **RPC ปฏิเสธ MARKETING ถ้าไม่ติ๊ก** |

แหล่ง: `docs/06-ux/sitemap-screen-specs.md:912-927` · `prototype/04-quick-capture.html:109-125`

### 7.4 การตรวจข้ามช่อง (aggregate validation)

- **ต้องมีช่องทางติดต่ออย่างน้อย 1 รายการ (เบอร์ · LINE ID · อีเมล)** → error แสดงที่ช่องเบอร์: **"ต้องมีช่องทางติดต่ออย่างน้อย 1 รายการ (เบอร์โทร LINE ID หรืออีเมล)"**
- กดบันทึกแล้วผิด → กล่องสรุปบนสุด `role="alert"` **"กรุณาแก้ไข {N} ช่อง"** + ลิงก์ไปแต่ละช่อง แล้วโฟกัสช่องแรกที่ `aria-invalid="true"`
- ถ้ามีช่องผิดในกลุ่ม `nickname`/`line_id`/`email`/`province`/`source` ให้เปิดส่วนพับ **"ข้อมูลเพิ่มเติม"** อัตโนมัติ
- ก่อนบันทึก ถ้าค่าตัวระบุเปลี่ยนไปจากตอนตรวจซ้ำครั้งล่าสุด → ตรวจซ้ำใหม่แบบเงียบ แล้วถ้าพบผู้สมัคร → toast warning **"พบข้อมูลที่อาจซ้ำ กรุณาเลือก 'ใช้ลูกค้าเดิม' หรือ 'ยังต้องการสร้างลูกค้าใหม่' ก่อนบันทึก"** + เลื่อนไปแผงตรวจซ้ำ
- จังหวะตรวจ: **blur + ตอนกดบันทึก** (`docs/06-ux/design-system.md:809-825`)

แหล่ง: `prototype/04-quick-capture.html:351-376, 420-434` · `docs/06-ux/sitemap-screen-specs.md:907`

### 7.5 แผงตรวจซ้ำ

- ตำแหน่ง: เดสก์ท็อป sticky ขวา กว้าง 360px · แท็บเล็ต 320px · มือถือเป็นการ์ดพับได้ใต้ช่องเบอร์ (`order: 2`)
- **เรียกเมื่อ:** กรอกเบอร์ครบ (มือถือ 10 หลัก / บ้าน 9 หลัก) **หรือ** กดปุ่ม **"ตรวจสอบซ้ำ"** → `api.find_customer_candidates(p_visit_id, p_phone, p_line_id, p_email, p_first_name, p_last_name)` (`p_visit_id` = visit ของหน้า 07 ถ้ามี · ส่ง 4 ตัวแรกครบเสมอ)
- สถานะเริ่มต้น (idle): **"กรอกเบอร์โทร LINE ID หรืออีเมล แล้วกด 'ตรวจสอบซ้ำ' · ระบบตรวจอัตโนมัติเมื่อกรอกเบอร์ครบ · ไม่มีการรวมลูกค้าอัตโนมัติและไม่บล็อกการสร้าง"**
- ไม่พบ → กล่อง success `role="status"` **"ไม่พบข้อมูลที่ซ้ำ"**
- พบ → หัวแผง **"พบข้อมูลที่อาจเป็นลูกค้าคนเดียวกัน {N} รายการ"**

| การ์ด | แสดง |
|---|---|
| **ลูกค้าที่อ่านได้** | `customer_no` · **"คุณ{ชื่อ}"** · เบอร์แบบ `value_masked` · สาขาแรก · ป้าย lifecycle + ป้ายเสริม · **"คะแนน {n}"** · เหตุผล · ปุ่ม secondary **"ดูข้อมูล"** (เปิดหน้า 05 แท็บใหม่ `target=_blank rel=noopener` — การนำทางห้ามส้ม) + ปุ่ม primary(navy) **"ใช้ลูกค้าเดิม"** |
| **ลูกค้านอกขอบเขต** (เส้นขอบ dashed) | `customer_no` · **"คุณ{ชื่อ} {อักษรแรกนามสกุล}."** · เบอร์ปิดบัง **เฉพาะเมื่อ match ด้วยเบอร์** · คะแนน · เหตุผล · ข้อความ **"ลูกค้านอกขอบเขตของคุณ · ไม่แสดงสถานะ สาขา และวันที่ติดต่อ"** · **มีเฉพาะปุ่ม "ใช้ลูกค้าเดิม" ไม่มี "ดูข้อมูล"** · ใน `mode=customer` ปุ่มนี้ปิดพร้อมเหตุผล **"ผูกลูกค้าจากสาขาอื่นได้เฉพาะตอนรับลูกค้า"** |

**"ยังต้องการสร้างลูกค้าใหม่"** — ปุ่ม secondary เต็มความกว้างท้ายแผง → เปิด select **"เหตุผลที่ยังสร้างลูกค้าใหม่"** **บังคับ** (**"เลือกเหตุผล"**) จาก `ref.duplicate_override_reasons` + **"หมายเหตุ"** (textarea ≤2000 + piiWarn) บังคับเมื่อเลือก **"อื่น ๆ"** (**"กรอกหมายเหตุเมื่อเลือกอื่น ๆ"**) + ปุ่ม ghost **"เลิกสร้างใหม่"**
- มีผู้สมัครคะแนน ≥ 70 → helper **"ระบบสร้างรายการ 'รอตัดสิน' ในศูนย์คุณภาพข้อมูลคู่กับผู้สมัครคะแนนสูงสุด"** (`crm.duplicate_decisions` `PENDING`)
- ทุกรายต่ำกว่า 70 → ไม่สร้างรายการรอตัดสิน · **ไม่มี merge อัตโนมัติ และไม่บล็อกการสร้าง**
- **ขณะแผงมีผู้สมัครและยังไม่ตัดสิน ปุ่มบันทึกต้องปิดพร้อมเหตุผล "พบข้อมูลที่อาจซ้ำ กรุณาเลือก 'ใช้ลูกค้าเดิม' หรือ 'ยังต้องการสร้างลูกค้าใหม่'"**

**เมื่อชน rate limit:** toast danger **"ตรวจสอบซ้ำครบจำนวนที่กำหนดต่อชั่วโมงแล้ว กรุณารอสักครู่"** · ถูกระงับ → แผงแสดง danger **"ระงับการตรวจสอบซ้ำชั่วคราว 1 ชั่วโมง ระบบจะตรวจข้อมูลซ้ำอีกครั้งตอนบันทึก"** · **การบันทึกต้องไม่ถูกบล็อกในทุกกรณี**

แหล่ง: `docs/06-ux/sitemap-screen-specs.md:931-939, 953` · `prototype/04-quick-capture.html:261-330`

### 7.6 ปุ่มท้ายฟอร์ม (แถบ sticky ชิดขวา)

| โหมด/ช่องทาง | ปุ่ม |
|---|---|
| `mode=customer` | **"ยกเลิก"** (ghost) · **"บันทึก"** (ส้ม) · [มือถือย่อเป็น **"บันทึกลูกค้า"**] |
| `mode=visit` ช่องทาง Walk-in และยังไม่มี `visit` | **"ยกเลิก"** · **"รับเข้าคิว"** (secondary → `WAITING`) · **"เริ่มให้บริการ"** (ส้ม → `IN_SERVICE` ผู้กดเป็นผู้รับ) |
| `mode=visit` ช่องทางอื่น หรือมี `visit` แล้ว | **"ยกเลิก"** · **"บันทึก"** (ส้ม) |

บนมือถือปุ่ม "ยกเลิก" ถูกซ่อน (มีปุ่ม **×** ที่หัวแทน) และปุ่มยืดเต็มความกว้าง `min-height: 48px`
(`docs/06-ux/sitemap-screen-specs.md:943-949` · `prototype/04-quick-capture.html:333-349`)

**"ยกเลิก"**: ยังไม่กรอกอะไร → กลับหน้าก่อนหน้าทันที · มีข้อมูลแล้ว → dialog หัว **"ยกเลิกการเพิ่มลูกค้า?"** ข้อความ **"ข้อมูลที่กรอกจะหายไป"** ปุ่ม **"ยกเลิกการเพิ่มลูกค้า"** (danger-outline) + **"กลับไปกรอกต่อ"**

### 7.7 เส้นทาง "ใช้ลูกค้าเดิม"

| กรณี | การกระทำ |
|---|---|
| `mode=customer` + ลูกค้าที่อ่านได้ | ไปหน้า 05 ของรายนั้น (**ไม่สร้างใหม่**) |
| `mode=visit` + ลูกค้าที่อ่านได้ + ไม่มี `visit` | dialog เลือก **"รับเข้าคิว"** / **"เริ่มให้บริการ"** (ช่องทางอื่นแสดงปุ่ม **"บันทึก"**) → `api.open_visit(p)` พร้อม `customer_id` |
| `mode=visit` + มี `visit` ที่ยังไม่ระบุลูกค้า | confirm **"ผูก {customer_no} เข้ากับ {visit_no}"** → PATCH `visits.customer_id` |
| **ลูกค้านอกขอบเขต** | ผูกได้ทางเดียวคือ `api.link_customer_to_branch(p_customer_id, p_visit_id)` · ยังไม่มี visit → dialog **"ต้องเปิดการรับลูกค้าก่อนผูกข้อมูล"** อธิบาย 3 ขั้น: `api.open_visit` → `api.find_customer_candidates(p_visit_id, …)` → `api.link_customer_to_branch` |

เกิน `security.link_per_day` → **ยังผูกสำเร็จตามปกติ** แจ้ง `LINK_LIMIT_EXCEEDED` ถึงผู้จัดการสาขา (ไม่มีข้อความบนหน้าจอ)
(`docs/06-ux/sitemap-screen-specs.md:937, 955` · `prototype/04-quick-capture.html:466-500`)

### 7.8 ค่าเริ่มต้น · สถานะ · มือถือ

- ค่าเริ่มต้น: **ทุกช่องว่าง · checkbox ทั้งหมดไม่ติ๊ก · สาขา = สาขาเดียวของผู้ใช้ · ไม่มีตัวกรอง**
- เมื่อมาจากหน้า 07 ให้เติม ความสนใจ · รู้จักร้านจาก · ช่องทาง Walk-in จากฟอร์มหน้า 07 โดย **ส่งผ่าน state เท่านั้น ห้ามส่งผ่าน URL** (ดูข้อ 11 · บั๊กคีย์ sessionStorage ใน prototype)
- บันทึกล้มเหลวจากกติกา → กล่องสรุป `role="alert"` บนสุด + ข้อความจาก RPC ที่ช่องนั้น และ **ข้อมูลที่กรอกต้องคงอยู่**
- สร้างสำเร็จบันทึก `CUSTOMER_CREATED` + `CONSENT_RECORDED` (ฐานข้อมูลเขียนเอง)
- เกณฑ์ความเร็วผูกพัน: **Quick Capture จนจบไม่เกิน 30 วินาที** (`docs/08-delivery/phase1-plan.md:95`)

**มือถือ <768px — ไม่มีแท็บ เป็นหน้าเดียวเรียงต่อกัน · ลำดับ `order` ตายตัว:**
เบอร์โทรศัพท์ (1) → แผงตรวจซ้ำแบบการ์ดพับได้ (2) → ชื่อ (3) → นามสกุล (4) → ความสนใจ (5) → helper Lead (6) → ประเภทสินค้า (7) → รุ่น (8) → ช่องทางที่ติดต่อมา (9) → สาขา (10) → รายละเอียดเพิ่มเติม (11) → ปุ่มพับ **"ข้อมูลเพิ่มเติม (ชื่อเล่น · LINE ID · อีเมล · จังหวัด · รู้จักร้านจาก)"** (12) → ชื่อเล่น/LINE/อีเมล/จังหวัด/รู้จักร้านจาก (13–17 · ซ่อนจนกว่าจะกดเปิด) → แจ้งประกาศ `*` (18–19) → ยินยอมรับข่าวสาร + ช่องทาง + อายุ (20–22)
หัวหน้าเป็นแถบ: ปุ่มไอคอน **"×"** ซ้ายบน (`aria-label="ปิด"`) + `h1` + ปุ่ม ghost **"ตัวอย่าง"** · ปุ่มบันทึกติดล่างเหนือ bottom nav และ safe-area

(`prototype/04-quick-capture.html:33-59, 195-197` · `docs/06-ux/sitemap-screen-specs.md:892`)

### 7.9 สถานะร่วมของทุกหน้า (C-STATE-*)

| สถานะ | ข้อความตรงตัว |
|---|---|
| `C-STATE-LOADING` | skeleton ขนาดเท่าของจริง + `aria-busy="true"` + `sr-only` **"กำลังโหลด…"** |
| `C-STATE-EMPTY` | **"ยังไม่มีรายการ"** (หน้า 07 ใช้ **"ยังไม่มีคิวที่เปิดอยู่"**) |
| `C-STATE-NORESULT` | **"ไม่พบรายการตามเงื่อนไข"** + ปุ่ม **"ล้างตัวกรอง"** |
| `C-STATE-ERROR` | **"โหลดข้อมูลไม่สำเร็จ"** + ปุ่ม **"ลองอีกครั้ง"** + caption **"รหัสอ้างอิง {request_id}"** · **ห้ามล้างค่าที่ผู้ใช้กรอกไว้** |
| `C-STATE-NOTFOUND` | **"ไม่พบข้อมูล หรือคุณไม่มีสิทธิ์ดูรายการนี้"** (**ห้ามแยกสองกรณี**) |
| `C-STATE-NOACCESS-PAGE` | หัว **"ไม่มีสิทธิ์เข้าหน้านี้"** + **"หน้านี้เปิดได้สำหรับ: {ป้ายไทยของบทบาทใน data-roles}"** + **"บทบาทของคุณ: {ป้าย}"** + ปุ่ม **"กลับหน้าแรก"** |

(`docs/06-ux/design-system.md:826-845` · `docs/06-ux/sitemap-screen-specs.md:136-139`)

### 7.10 กติกาแสดงปุ่มตามสิทธิ์ (บังคับทุกหน้า)

1. บทบาทไม่มีสิทธิ์นั้นเลย → **ซ่อนปุ่ม**
2. มีสิทธิ์แต่แถวไม่ผ่านขอบเขต/สถานะ/ยังไม่ aal2 → แสดงปุ่มแบบปิดด้วย **`aria-disabled="true"`** (**ห้ามใช้ attribute `disabled`** เพื่อให้ยัง focus ได้) + tooltip เหตุผล
3. เปิดหน้าที่บทบาทไม่อยู่ใน `data-roles` → `C-STATE-NOACCESS-PAGE`

ข้อความเหตุผลมาตรฐาน (ใช้ตรงตัว): **"แก้ได้เฉพาะรายการที่คุณเป็นผู้รับผิดชอบ"** (scope O) · **"แก้ได้เฉพาะรายการของสมาชิกในทีมคุณ"** (scope T) · **"ต้องยืนยันตัวตนสองขั้นตอน (MFA) ก่อน"** · **"สถานะนี้แก้ไขไม่ได้"** · **"เกินจำนวนที่กำหนด"** · **"รายการนี้อยู่นอกสาขาในสิทธิ์ของคุณ"**
RPC ปฏิเสธ → toast danger **"คุณไม่มีสิทธิ์ทำรายการนี้"** แล้วโหลดแถวใหม่

(`docs/06-ux/sitemap-screen-specs.md:120-135` · `docs/04-security/permission-matrix.md:341-347` · `web/src/lib/access.ts:69-80`)

---

## 8. กฎความปลอดภัยที่โค้ดต้องทำตาม

### 8.1 เซสชันและตัวตน

| # | กฎ | แหล่ง |
|---|---|---|
| S1 | cookie ของ Supabase Auth ตั้ง `httpOnly: true` · `Secure` · `SameSite=Lax` ผ่าน `cookieOptions` ของ `@supabase/ssr` → JS ในเบราว์เซอร์อ่าน token ไม่ได้ | `docs/04-security/security-design.md:344` · `docs/00-brief/CANONICAL.md:832` |
| S2 | `web/src/proxy.ts` (ชื่อใหม่ของ middleware ใน Next.js 16 · รันบน Node.js runtime) ทำ: refresh session → ไม่มี session redirect `/login` → อ่าน `aal` ถ้า `nextLevel = aal2` แต่ `currentLevel = aal1` redirect `/login/mfa` · **ที่อ่าน/เขียน cookie มีที่เดียวคือชั้นนี้** | `docs/02-architecture/system-architecture.md:580-590` · `web/src/proxy.ts` |
| S3 | `(app)/layout.tsx` เรียก `api.get_my_access()` **หนึ่งครั้งต่อ request** เพื่อสร้างเมนู (ใช้ `cache()` ของ React) | `web/src/lib/access.ts:57-60` |
| S4 | Access token 15 นาที · refresh rotation (reuse 10 วินาที) · idle 2 ชม. · time-box 12 ชม. → **frontend ต้องรับมือกรณี session หายกลางคันเสมอ ไม่ใช่ error ผิดปกติ** | `docs/04-security/security-design.md:300-302` |
| S5 | `device_id` = UUID ที่เบราว์เซอร์สร้างครั้งแรก เก็บใน `localStorage` · **ไม่ถูกล้างตอน logout** · ส่งทุกคำขอเป็น `x-device-id` · ผู้ใช้แก้ได้เอง **ห้ามใช้ตัดสินสิทธิ์** | `docs/04-security/security-design.md:311-313` |
| S6 | V1 **ไม่ใช้ Supabase Realtime** — กระดิ่งแจ้งเตือน poll ผ่าน Server Action | `docs/02-architecture/system-architecture.md:146-151` |

### 8.2 Security headers และ service worker

- CSP แบบ strict (nonce): `default-src 'self'` · `script-src 'self' 'nonce-{random}' 'strict-dynamic'` · `style-src 'self' 'nonce-{random}'` · `img-src 'self' data:` · `font-src 'self'` · `connect-src 'self'` · `object-src 'none'` · `base-uri 'none'` · `frame-ancestors 'none'` · `form-action 'self'`
- `Cache-Control: no-store` บนทุก route ที่ต้องล็อกอินและทุก response ที่มีข้อมูลลูกค้า
- `Strict-Transport-Security` · `X-Content-Type-Options: nosniff` · `Referrer-Policy: same-origin` · `Permissions-Policy` ปิดกล้อง/ไมค์/ตำแหน่ง
- service worker: cache-first เฉพาะ `/_next/static/*` · `/fonts/*` · ไอคอน · manifest · หน้า `/offline` — navigation ของ `(app)`/`(auth)` = **network-only** · `*/rest/v1/*` `*/rpc/*` `*/auth/*` `*/functions/v1/*` `*/storage/v1/*` = **pass-through ไม่แตะ** · **ไม่มี offline write queue ใน V1**

แหล่ง: `docs/04-security/security-design.md:335-348` · `docs/08-delivery/deployment-backup-recovery.md:196-198` · `docs/02-architecture/system-architecture.md:594-605`

### 8.3 PII / column grant ที่ Core Flow ต้องรู้

| ตาราง | SELECT ได้เฉพาะ | ไม่ได้ |
|---|---|---|
| `crm.customer_contacts` | `id` `organization_id` `customer_id` `contact_type` `value_masked` `is_primary` `is_valid` `is_active` `verified_at` `created_at` `updated_at` | `value_raw` `value_normalized` `created_by` `updated_by` · **ไม่มี INSERT/UPDATE/DELETE** |
| `crm.customer_addresses` | `id` `organization_id` `customer_id` `district` `province_code` `value_masked` `is_primary` `is_active` `created_at` `updated_at` | `address_line` `subdistrict` `postal_code` |
| `core.staff_profiles` | `id` `staff_code` `display_name` `nickname` `status` | คอลัมน์อื่น (ต้องผ่าน `api.list_staff` ด้วย `user.read`) |

**`select=*` กับสามตารางนี้ถูกปฏิเสธทั้งคำสั่งด้วย 42501** (PostgREST ขยาย `*` เป็นทุกคอลัมน์) → ต้องระบุชื่อคอลัมน์ทุกครั้ง มี test บังคับ
รูปแบบปิดบังคำนวณในฐานข้อมูลด้วย `app.mask_contact()` เท่านั้น: PHONE มือถือ `081-XXX-5678` · บ้าน `02-XXX-4567` · EMAIL `s***@example.com` · LINE_ID/FB/IG/TikTok = 2 อักษรแรก + `***` · LINE_USER_ID ไม่แสดงเลย (`—` U+2014) · ที่อยู่ `{อำเภอ} · {จังหวัด}`

แหล่ง: `docs/04-security/security-design.md:467-490` · `docs/04-security/rls-spec.md:421-422, 454` · `docs/04-security/security-design.md:473`

### 8.4 PDPA ที่ผูกกับ Core Flow

- ความยินยอม `MARKETING` `GRANTED` ต้องมีติ๊ก **"ลูกค้าอายุ 20 ปีขึ้นไป หรือผู้ใช้อำนาจปกครองยินยอม"** เก็บเป็นข้อความใน `evidence` · RPC ปฏิเสธถ้าไม่ติ๊ก · **ระบบไม่เก็บวันเกิด/อายุ** (`docs/00-brief/CANONICAL.md:1917` · `docs/04-security/pdpa.md:298-299`)
- trigger `app.trg_guard_restricted_text` ตรวจเลขบัตรประชาชนไทย (13 หลัก + checksum · รองรับเลขไทย ๐–๙ และรูปแบบมีขีด/เว้นวรรค) บน `customer_notes.body` · `interactions.summary` · `tasks.title/description` · `task_comments.body` · `leads.next_action/lost_note` · `opportunities.next_action/lost_note` · `quotations.terms_note`
  พบ → `RAISE EXCEPTION` SQLSTATE **`23514`** ข้อความ `ห้ามบันทึกเลขบัตรประชาชนในข้อความ (schema.table.column)` HINT **"ห้ามบันทึกเลขบัตรประชาชน รายได้ ข้อมูลสุขภาพหรือศาสนา"**
  → **หน้าจอต้องจับ `23514` ที่มีชื่อ COLUMN แล้วแสดง HINT ที่ช่องนั้น ห้ามแสดงเป็น "ระบบขัดข้อง" และห้ามสะท้อนเลขที่ผู้ใช้พิมพ์กลับไป** (`docs/04-security/pdpa.md:529-544`)
- ข้อความคำเตือนบังคับบนฟอร์มที่มีช่องข้อความอิสระ (`C-PII-WARN`): **"ห้ามบันทึกเลขบัตรประชาชน รายได้ ข้อมูลสุขภาพหรือศาสนา"** (`docs/04-security/pdpa.md:524`)
- V1 **ไม่เก็บ Restricted**: เลขบัตร · สำเนาบัตร · วันเกิดเต็ม · รายได้ · รูปถ่ายลูกค้า (ใช้ avatar ตัวอักษรย่อ) · เอกสาร/ไฟล์ของลูกค้า · **ไม่มีการอัปโหลดไฟล์ของลูกค้าใน V1** (`docs/04-security/pdpa.md:521-523`)

### 8.5 รายการ "ห้ามทำ" (บังคับ · ละเมิดข้อใดข้อหนึ่ง = บั๊กความปลอดภัย)

**เซสชัน / ตัวตน**
1. ห้ามสร้าง Supabase browser client ที่ถือ session และห้ามเก็บ access/refresh token ใน `localStorage` · `sessionStorage` · IndexedDB หรือ memory ฝั่ง client (`docs/04-security/security-design.md:344-345`)
2. ห้ามเรียก Supabase ที่ต้องใช้เซสชันจากเบราว์เซอร์ทุกกรณี — รวม PostgREST/RPC · `functions.invoke` · `signOut` · **MFA enroll/challenge/verify** (`docs/00-brief/CANONICAL.md:1918`)
3. ห้ามใช้ `auth.uid()` / Supabase Auth user id / email / user_metadata เป็นคีย์ผูก business logic หรือเทียบ "ของฉัน" — ต้องผ่าน `app.current_staff_id()` / `api.get_my_access()` (`docs/00-brief/CANONICAL.md:1957, 1968`)
4. ห้าม hardcode ตาราง role→permission หรือคำนวณสิทธิ์เองใน frontend — ใช้ `api.get_my_access()` เพื่อซ่อนปุ่มเท่านั้น (`docs/00-brief/CANONICAL.md:1958`)
5. ห้ามอ่านบทบาท/สิทธิ์จาก JWT claim และห้ามคาดหวังว่ามี claim เหล่านั้น (`docs/04-security/security-design.md:374`)
6. ห้ามจำสถานะ aal2 ไว้ใน client/cookie ของแอปเองแล้วข้ามการตรวจ (`docs/04-security/security-design.md:275`)
7. ห้ามล้าง `device_id` และ `login_id` ตอน logout — แต่ **ต้อง** ล้างที่เหลือทั้งหมด (`docs/04-security/security-design.md:327-328`)
8. ห้ามใช้ overlay ล็อกหน้าจออย่างเดียวเมื่อ counter idle 10 นาที — ต้อง sign-out จริง (`docs/04-security/security-design.md:312`)
9. ห้ามใช้ `device_id` หรือ IP เป็นเงื่อนไขตัดสินสิทธิ์/ปลดล็อกฟีเจอร์ (`docs/04-security/security-design.md:313`)

**การเรียกฐานข้อมูล**
10. ห้ามใส่ `SUPABASE_SERVICE_ROLE_KEY` หรือ connection string ของ Postgres ใน env/โค้ด/บันเดิลของ Next.js ทุก environment และห้ามใช้ `NEXT_PUBLIC_*` กับค่าลับ (`docs/08-delivery/deployment-backup-recovery.md:195`)
11. ห้ามใช้ `select=*` กับ `crm.customer_contacts` · `crm.customer_addresses` · `core.staff_profiles` (`docs/04-security/security-design.md:473`)
12. ห้าม query `customer_contacts.value_raw` · `value_normalized` · `customer_addresses.address_line` · `subdistrict` · `postal_code` และห้ามสร้าง view/computed column/relationship ใดที่คืนค่าเหล่านี้ (`docs/04-security/security-design.md:467-474`)
13. ห้ามเรียกอะไรใน schema `app` / `analytics` / `audit` / `restricted` จาก client (`supabase/migrations/0010_security.sql:86-92`)
14. ห้ามใช้ HTTP GET เรียก RPC ที่เป็น VOLATILE (`docs/04-security/security-design.md:392`)
15. ห้ามส่ง header `Prefer: tx=rollback` หรือพารามิเตอร์ใดที่เปลี่ยนพฤติกรรมทรานแซกชันของ PostgREST (`docs/04-security/security-design.md:529`)
16. ห้ามละเลยการตรวจจำนวนแถวที่คืนจาก PATCH/DELETE — RLS `USING` ไม่ผ่านจะได้ HTTP 200 พร้อม `[]` ไม่ใช่ error (`docs/07-api/api-spec.md:173`)

**การเขียนข้อมูลของ Core Flow**
17. ห้าม INSERT `crm.visits` ตรงผ่าน PostgREST — ไม่มี GRANT INSERT · ต้องใช้ `api.open_visit` / `api.quick_capture` (`supabase/migrations/0010_security.sql:408-409`)
18. ห้าม INSERT `crm.customers` / `crm.customer_contacts` / `crm.customer_addresses` / `crm.customer_consents` / `crm.customer_branches` ตรง (`supabase/migrations/0010_security.sql:303-321, 384`)
19. ห้ามปิด visit ด้วย PATCH `status='COMPLETED'` หรือ `'LEFT'` — trigger โยน `JCRM-T21` · ต้องใช้ `api.close_visit` (`supabase/migrations/0010_security.sql:1198-1201`)
20. ห้ามส่งคอลัมน์อื่นมาพร้อมกับการรับคิว — ส่งได้เฉพาะ `status` + `owner_staff_id` มิฉะนั้น `JCRM-T20` (`supabase/migrations/0010_security.sql:1191-1193`)
21. ห้ามส่ง `p_outcome_code = 'UNRECORDED'` ให้ `api.close_visit` (`supabase/migrations/0011_api.sql:1793-1795`)
22. ห้ามตั้ง `visits.customer_id` ของลูกค้าที่ยังไม่ผูกสาขาของ visit ด้วย PATCH ตรง — `JCRM-T26` (`supabase/migrations/0010_security.sql:1210-1219`)
23. ห้ามเรียก `api.link_customer_to_branch` โดยไม่ได้เรียก `api.find_customer_candidates` พร้อม `p_visit_id` ของ visit เดียวกันภายใน 30 นาทีก่อนหน้า (`supabase/migrations/0011_api.sql:1057-1066`)
24. ห้ามเปลี่ยน `owner_staff_id` / `team_id` / `branch_id` ด้วย PATCH ตรง (ยกเว้น `visits.owner_staff_id` ตอนรับคิว) — ต้องใช้ `api.assign_owner` พร้อม `p_reason_code` จาก `ref.ownership_change_reasons` มิฉะนั้น `JCRM-T13` (`docs/04-security/rls-spec.md:50, 96`)
25. ห้ามเพิ่มช่อง "ผู้รับผิดชอบ" ลงในฟอร์มแก้ไขทั่วไป — ทุกการเปลี่ยนเจ้าของใช้ `C-DIALOG-ASSIGN` เท่านั้น (`docs/06-ux/sitemap-screen-specs.md:128`)
26. ห้ามส่งคอลัมน์ระบบในคำเรียก PATCH ใด ๆ (`organization_id` `created_by/at` `updated_by/at` `*_no` `queue_no` `outcome_code` `service_started_at` `ended_at` `closed_by_system` `lifecycle_stage` `last_*`) (`docs/07-api/api-spec.md:1792`)
27. ห้ามเปลี่ยน `branch_id` ของ visit หลังสร้าง และห้ามแก้ outcome ข้ามวันธุรกิจ (`docs/00-brief/CANONICAL.md:194`)
28. ห้าม retry `api.quick_capture` · `api.record_consent` อัตโนมัติเมื่อ timeout — สร้างแถวซ้ำ ไม่มี idempotency key ใน V1 (`docs/07-api/api-spec.md:278`)

**PII / PDPA / audit**
29. ห้ามใส่คำค้น เบอร์โทร อีเมล LINE ID หรือชื่อ ลงใน URL parameter — param ที่อนุญาตมีเฉพาะรหัสอ้างอิง/รหัสตัวกรอง · ค่าที่กรอกในหน้า 04 ห้ามลง URL หรือ storage ใด ๆ (`docs/06-ux/sitemap-screen-specs.md:62-72, 971-974`)
30. ห้ามใส่เบอร์โทร อีเมล หรือ LINE ID ลงใน toast ทุกกรณี ให้ใช้เลขอ้างอิงแทน · ห้ามแสดงเบอร์โทรในรายการคิวหน้า 07 · ห้ามฝังค่าเต็มของข้อมูลติดต่อใน HTML ตอนโหลดหน้า (`docs/06-ux/design-system.md:807` · `docs/06-ux/sitemap-screen-specs.md:1419`)
31. ห้ามค้นหาลูกค้าขณะพิมพ์ (search-as-you-type) — ต้องกด Enter หรือปุ่ม "ค้นหา" และต้องมีอย่างน้อย 3 ตัวอักษร (`docs/06-ux/design-system.md:733`)
32. ห้ามค้นหาลูกค้าแบบ prefix/LIKE/trigram ด้วยเบอร์ อีเมล LINE ID หรือ IMEI — ค่าติดต่อต้อง normalize แล้ว **ตรงทั้งค่าเท่านั้น** (`docs/04-security/security-design.md:537`)
33. ห้ามแสดงข้อมูลเกินที่ RPC คืนบนการ์ดผู้สมัครนอกขอบเขต (ห้ามยิง query เสริมเพื่อเติม lifecycle/สาขา/วันที่) และห้ามมีปุ่ม "ดูข้อมูล" บนการ์ดนั้น (`docs/04-security/security-design.md:553` · `docs/06-ux/sitemap-screen-specs.md:936`)
34. ห้ามแสดงช่องค้นหาแถบบนให้บทบาท `MARKETING` และ `SYSTEM_ADMIN` (`docs/04-security/permission-matrix.md:378`)
35. ห้ามถือว่า `ok:false` เป็น error และห้ามกลืน (swallow) — เมื่อ `SEARCH_LIMIT_EXCEEDED` **ห้ามบล็อกการบันทึกลูกค้า** (`docs/07-api/api-spec.md:268-272`)
36. ห้ามอ่าน `data.count` จากผลของ `api.search_customers` โดยไม่เช็ค `ok` ก่อน — รูป `ok:false` ของ RPC ตัวนี้ **ไม่มีคีย์ `count`** (`supabase/migrations/0011_api.sql:930`)
37. ห้ามตีความ `link_count_today` เป็นตัวเลข — เป็น JSON string (`supabase/migrations/0011_api.sql:1082`)
38. ห้ามใส่ PII ลงใน `p_note` / `p_reason` / `reason_note` / `filter` ที่ส่งไป RPC — ลง `audit_logs.reason` ซึ่งห้ามมี PII (`docs/00-brief/CANONICAL.md:1916`)
39. ห้ามส่งชื่อ เบอร์ หรือข้อมูลลูกค้าใด ๆ ใน payload ของ Web Push หรืออีเมลที่ออกนอกระบบ (`docs/04-security/security-design.md:338`)
40. ห้าม frontend เขียน audit/access/login log เอง และห้ามพยายามอ่าน schema `audit` ผ่าน PostgREST (`docs/04-security/security-design.md:873-875`)
41. ห้ามสร้างช่องกรอกเลขบัตรประชาชน รายได้ เลขบัญชี รหัสปลดล็อกเครื่อง/Apple ID หรือข้อมูลอ่อนไหว ม.26 ในฟอร์มใด และห้ามละคำเตือน `C-PII-WARN` (`docs/04-security/pdpa.md:524, 548`)
42. ห้ามบันทึก `MARKETING = GRANTED` โดยไม่มีติ๊กยืนยันอายุ และห้ามติ๊กช่องประกาศ/ยินยอมให้ล่วงหน้าแทนผู้ใช้ (`docs/00-brief/CANONICAL.md:1917` · `docs/04-security/pdpa.md:585-586`)
43. ห้ามใช้ `dangerouslySetInnerHTML` กับโน้ต สรุปการติดต่อ หรือข้อความใด ๆ ที่ผู้ใช้พิมพ์ (`docs/04-security/security-design.md:349`)
44. ห้ามส่ง `actor` / `staff_id` / `user_id` / `requested_by` ไปใน body/query ของ Edge Function ใด ๆ (`docs/04-security/security-design.md:452`)

**UX / KPI**
45. ห้ามแยกข้อความผิดพลาดของหน้า login เป็นหลายแบบ และห้ามแยก "ไม่พบรายการ" ออกจาก "ไม่มีสิทธิ์" (`docs/06-ux/sitemap-screen-specs.md:475-476` · `docs/07-api/api-spec.md:176`)
46. ห้ามใช้ attribute `disabled` กับปุ่มที่ปิดเพราะเงื่อนไขไม่ครบ — ต้องใช้ `aria-disabled="true"` + tooltip เหตุผล (`docs/06-ux/design-system.md:629`)
47. ห้ามใส่ `LEFT_BEFORE_SERVICE` หรือ `UNRECORDED` เป็นตัวเลือกใน radio ของ dialog บันทึกผล (`docs/06-ux/sitemap-screen-specs.md:1399`)
48. ห้ามนับ visit สถานะ `CANCELLED` ในตัวเลขใด ๆ ทั้งชิปสรุปวันนี้และ KPI ทุกตัว (`docs/00-brief/CANONICAL.md:188`)
49. ห้าม frontend คำนวณ KPI/อัตรา/ผลรวมเอง — ทุกตัวเลขต้องมาจาก `api.get_kpis` / `api.get_report` และ RPC คืน NULL ต้องแสดง `–` ไม่ใช่ 0 (`docs/00-brief/CANONICAL.md:2016, 901`)
50. ห้ามสร้าง Lead อัตโนมัติจาก `api.open_visit` (หน้า 07) — ต้องเสนอผ่าน toast + ปุ่ม "สร้าง Lead" เท่านั้น (`docs/06-ux/sitemap-screen-specs.md:1397`)
51. ห้ามใส่ตัวเลือกช่วงเวลา (`C-PERIOD`) ลงในหน้า 04 และ 07 (`docs/06-ux/sitemap-screen-specs.md:114`)
52. ห้ามแสดงลูกค้าสถานะ `ANONYMIZED` ในรายการลูกค้าปกติ — RLS ยังปล่อยผ่าน UI ต้องกรองออกเอง (`docs/00-brief/CANONICAL.md:894`)

---

## 9. โทเคน design system ที่ต้องใช้

**แหล่งจริง:** `prototype/assets/app.css` (บล็อก `:root` บรรทัด 24–161) + `docs/06-ux/design-system.md` ข้อ 6
แอป Next.js **ไม่เขียน CSS ของตัวเองแยกอีกชุด** — `web/scripts/sync-design.mjs` คัดลอก `prototype/assets/app.css` · `premium.css` และ `<style>` เฉพาะหน้าของ `01-login.html` · `07-reception.html` · `04-quick-capture.html` เข้า `web/src/app/generated/` ตอน `predev`/`prebuild` → **แก้ที่ `prototype/assets/` ที่เดียวเสมอ** (`web/scripts/sync-design.mjs:1-27`)

### 9.1 สี CI (ตรึง ห้ามแก้ · `prototype/assets/app.css:26-31`)

| token | ค่า | ตำแหน่งใน ramp |
|---|---|---|
| `--jaun-navy` | `#0B1E41` | `--navy-900` |
| `--jaun-orange` | `#F86E0B` | `--orange-500` |
| `--support-blue` | `#21417E` | `--navy-700` |
| `--light-gray` | `#EAE8E7` | `--gray-200` |
| `--white` | `#FBFBFB` | `--gray-50` |
| `--dark-text` | `#101828` | `--gray-900` |

สัดส่วน: White 60% · Navy 25% · Orange 10% · Support 5% (`docs/00-brief/CANONICAL.md:1713-1720`)

### 9.2 ramp (`app.css:34-64`)

- **navy 10 ค่า:** `--navy-50 #F2F5FA` · `-100 #E1E8F3` · `-200 #C3D0E6` · `-300 #94A9CE` · `-400 #5E7AAE` · `-500 #3A5992` · `-600 #2A4A85` · `-700 = --support-blue` · `-800 #16305E` · `-900 = --jaun-navy`
- **orange (app.css มี 7 ค่า):** `--orange-50 #FFF6ED` · `-100 #FFE9D5` · `-300 #FBB06B` (focus ring บนพื้นเข้ม) · `-400 #FA8C36` (hover ปุ่มส้ม — สว่างขึ้นเท่านั้น) · `-500 = --jaun-orange` · `-600 #DC5A08` (เส้นขอบส้มที่ต้องผ่าน 3:1) · `-700 #B54708`
  เอกสารข้อ 6 มีเพิ่ม `--orange-200 #FDCFA5` · `-800 #92380A` · `-900 #7A2F0B` (สำรอง ไม่ใช้ V1) — **แอปจริงประกาศครบ 10 ค่าตามเอกสาร**
- **gray 10 ค่า:** `--gray-50 = --white` · `-100 #F4F3F2` · `-200 = --light-gray` · `-300 #D6D3D1` · `-400 #B5B1AE` · `-500 #8A8683` (ขอบ input 3.49:1 — **ห้ามเป็นตัวอักษร**) · `-600 #6E6A68` (ข้อความรอง + placeholder 5.17:1) · `-700 #4E4B4A` · `-800 #26272B` (label ฟอร์ม) · `-900 = --dark-text`

### 9.3 semantic (`app.css:67-74`)

| ชุด | bg | border | text | solid |
|---|---|---|---|---|
| success | `#ECFDF3` | `#ABEFC6` | `#05603A` | `#067647` |
| warning | `#FFFAEB` | `#FEDF89` | `#B54708` | `#DC6803` |
| danger | `#FEF3F2` | `#FECDCA` | `#B42318` | `#D92D20` |
| info | `--navy-50` | `--navy-200` | `--navy-700` | `--navy-700` |
| neutral | `--gray-100` | `--gray-300` | `--gray-700` | `--gray-500` ⚠️ |

`--on-solid: var(--white)` · **`--on-warning-solid: var(--navy-900)`** (ตัวอักษรขาวบน warning-solid ได้แค่ 3.36:1 ไม่ผ่าน)
⚠️ `--neutral-solid`: app.css ใช้ `--gray-500` แต่ `design-system.md` ภาคผนวก B.2 ข้อ 5 บังคับ **`--gray-600`** เพราะตัวอักษรขาวบน gray-500 ไม่ผ่าน 4.5:1 → **แอปจริงใช้ `--gray-600`**

### 9.4 surface / text / border (`app.css:102-131`)

`--surface-page`/`-card` = white · `--surface-raised`/`-subtle` = gray-100 · `--surface-sunken` = gray-200 · `--surface-selected` = navy-100 · `--surface-nav` = navy-900 · `--surface-nav-hover` = navy-800 · `--surface-nav-active` = navy-700 · `--surface-overlay` = `rgba(11,30,65,0.55)`
`--text-primary` = dark-text · `--text-secondary` = gray-600 · `--text-secondary-sunk` = gray-700 · `--text-heading` = navy-900 · `--text-link` = support-blue · `--text-on-nav` = white · `--text-on-nav-2` = navy-200 · `--text-on-nav-3` = navy-300 · **`--text-on-accent` = navy-900 (บังคับ)** · `--text-disabled` = gray-600 · `--text-placeholder` = gray-600 · `--text-label` = gray-800
`--border-subtle` = gray-200 · `--border-default` = gray-300 · `--border-strong` = gray-500 · `--border-focus`/`--focus-ring` = support-blue · `--focus-ring-on-dark` = orange-300
`--reveal-bg` = orange-50 · `--reveal-border` = orange-600 (กรอบค่า PII ที่เปิดดูชั่วคราว)

### 9.5 สีกราฟ + การจับคู่ช่องทาง (ตรึง ห้ามสลับ · `app.css:77-91`)

| token | ค่า | ใช้กับ |
|---|---|---|
| `--chart-1` | `#0B1E41` | Walk-in · Funnel Visitor |
| `--chart-2` | `#2F6FD6` | LINE · Funnel Lead · ลูกค้าใหม่ |
| `--chart-3` | `#C2410C` | Facebook · Funnel Opportunity |
| `--chart-4` | `#B42359` | Instagram |
| `--chart-5` | `#7C3AED` | TikTok |
| `--chart-6` | `#5B6B8C` | โทรศัพท์ · Funnel Sale |
| `--chart-7` | `#15803D` | เว็บไซต์ · ลูกค้าเก่า |

alias: `--channel-WALK_IN` / `-LINE` / `-FACEBOOK` / `-INSTAGRAM` / `-TIKTOK` / `-PHONE` / `-WEBSITE` = chart-1..7 ตามลำดับ
`--chart-lost` = `--support-blue` · `--chart-separator` = `--white` (เส้นคั่น 2px) · `--chart-track` = gray-200 · `--chart-grid` = gray-300 · `--chart-label` = gray-700

### 9.6 priority / VIP (`app.css:94-99`)

`--priority-low` = neutral-solid · `--priority-normal` = info-solid (navy-700) · `--priority-high` = warning-solid · `--priority-urgent` = danger-solid · `--priority-unknown` = gray-300 (การ์ดไม่มี priority — **ห้ามใช้สี NORMAL แทน**) · `--badge-vip-bg` = navy-900 · `--badge-vip-text` = white

### 9.7 ตัวอักษร (`app.css:134-138`)

- `--font-sans: "Kanit", "Noto Sans Thai", "Sarabun", "Leelawadee UI", -apple-system, "Segoe UI", system-ui, sans-serif`
- น้ำหนัก: `--fw-light 300` · `--fw-regular 400` · `--fw-medium 500` · `--fw-semibold 600` · `--fw-bold 700`
- **Kanit self-host 5 น้ำหนัก (300/400/500/600/700) SIL OFL 1.1 — ห้ามโหลดจาก Google Fonts/CDN ใด ๆ** · ไฟล์พร้อมใช้ที่ `prototype/assets/fonts/` (10 ไฟล์ `kanit-{300,400,500,600,700}-{thai,latin}.woff2`) + `prototype/assets/kanit-faces.css` · แอปจริงใช้ `next/font/local` ชี้ไฟล์ชุดเดียวกัน (`docs/00-brief/CANONICAL.md:1722`)
- `body` ตั้ง `font-synthesis: none` (ห้ามหนา/เอียงปลอม) + `-webkit-font-smoothing: antialiased` (`app.css:168-172`)

**สเกลตัวอักษร** — prototype (`app.css:136-138`) ใช้ค่าเล็กกว่าเอกสาร **แอปจริง Phase 1 ต้องใช้สเกลของ `design-system.md` ข้อ 3.3**:

| บทบาท | prototype | **แอปจริง (ใช้ค่านี้)** |
|---|---|---|
| display | 2.25rem | 2.5rem / 1.40 |
| h1 | 1.75rem | 2rem / 1.45 |
| h2 | 1.375rem | 1.625rem / 1.46 |
| h3 | 1.125rem | 1.25rem / 1.60 |
| h4 | 1rem | 1.0625rem / 1.65 |
| body | 0.9375rem | 1rem / 1.75 |
| body-sm | 0.875rem | 0.875rem / 1.71 |
| caption | 0.75rem | 0.75rem / 1.67 |
| kpi | 1.875rem | 2rem / 1.25 |

line-height ของ prototype: `--lh-tight 1.35` · `--lh-heading 1.45` · `--lh-body 1.7`

**กติกาตัวอักษรไทย (บังคับ 6 ข้อ · `docs/06-ux/design-system.md:398-403`)**
1. เนื้อความไทยหลายบรรทัด line-height ≥ 1.6 (app.css ใช้ 1.7) · หัวข้อ ≥ 1.4 · control บรรทัดเดียว 1.5 — **ห้ามกำหนด `height` ตายตัวคู่กับ `overflow:hidden`** (วรรณยุกต์/สระถูกตัด) ใช้ `min-height` + `padding` แทน
2. `letter-spacing: 0` สำหรับไทยเสมอ · **ห้าม `text-transform: uppercase`** กับรหัส `CUS-…`
3. ไทยไม่มีช่องว่างระหว่างคำ → `word-break: normal; overflow-wrap: anywhere` ในเซลล์แคบ · ellipsis ได้เฉพาะชื่อสินค้า/ชื่องาน และต้องมี `title`/tooltip — **ห้ามตัดชื่อลูกค้า รหัสอ้างอิง และตัวเลข**
4. รหัส/เวลา/ตัวเลข: `white-space: nowrap` + `font-variant-numeric: tabular-nums` (คลาส `.num` และ `td[data-numeric]`)
5. ข้อความในปุ่ม ≤ 2 คำ 1 บรรทัด **ห้ามขึ้นบรรทัดใหม่**
6. `<html lang="th">` ทุกหน้า

### 9.8 spacing · radius · shadow (`app.css:141-148`)

- `--space-1 .25rem` · `-2 .5rem` · `-3 .75rem` · `-4 1rem` · `-5 1.25rem` · `-6 1.5rem` · `-8 2rem` · `-10 2.5rem` · `-12 3rem` · `-16 4rem`
- `--radius-sm 4px` (ป้ายเสริม/ชิปในเซลล์) · `--radius-md 8px` (**ปุ่ม/input/การ์ดย่อย**) · `--radius-lg 12px` (การ์ด/drawer/dialog) · `--radius-xl 16px` (bottom sheet) · `--radius-full 9999px` (ป้าย lifecycle/avatar/FAB)
- `--shadow-1` การ์ด · `--shadow-2` popover/dropdown · `--shadow-3` overlay · `--shadow-inset-press: inset 0 2px 4px 0 rgba(11,30,65,.22)` (สถานะกดของปุ่มทุกชนิด)
  ⚠️ app.css ตั้ง `--shadow-3` เท่ากับ `--shadow-4` ทุกค่า แต่เอกสารข้อ 6 กำหนด `--shadow-3: 0 4px 8px -2px rgba(11,30,65,.10), 0 12px 20px -4px rgba(11,30,65,.14)` → **แอปจริงยึดเอกสาร**

### 9.9 control · layout · z-index · motion (`app.css:151-160`)

- control: `--control-h 40px` · `--control-h-sm 32px` · `--control-h-lg 48px` · **`--touch-min 44px`** (เป้าสัมผัสต่ำสุดเมื่อ `pointer:coarse`) · **`--touch-counter 48px`** (แท็บเล็ต/counter)
- layout: `--sidebar-w 264px` · `--sidebar-w-collapsed 72px` · `--topbar-h 64px` (มือถือ 56px) · `--bottom-nav-h 64px` · `--drawer-w 480px` · `--drawer-w-wide 640px` · `--dialog-w-sm 400px` · `--dialog-w-md 560px` · `--page-px = --space-8` (เดสก์ท็อป → `--space-5` แท็บเล็ต → `--space-4` มือถือ) · `--page-max 1440px`
- z-index: sticky 100 · sidebar 200 · bottom-nav 210 · fab 220 · popover 300 · sheet 350 · drawer 400 · dialog 500 · toast 600 · tooltip 700 · lock 800
- motion: `--dur-fast 120ms` · `--dur-base 180ms` (เอกสารข้อ 5.3 ระบุ 160ms และมี `--dur-slow 240ms` เพิ่ม) · `--ease cubic-bezier(0.2, 0, 0, 1)`
- `@media (prefers-reduced-motion: reduce)` บังคับ transition/animation ≤ 0.01ms ครอบทุก element (`app.css:876-878`)

### 9.10 ปุ่ม (`app.css:338-370` · `docs/06-ux/design-system.md:601-630`)

| variant | ใช้กับ | สี |
|---|---|---|
| `accent` (ส้ม) | **CTA หลัก 1 ปุ่มต่อพื้นที่ตัดสินใจ** | พื้น `--jaun-orange` · ตัวอักษร `--text-on-accent` (navy-900) น้ำหนัก 600 · hover `--orange-400` · active `--shadow-inset-press` |
| `primary` (navy) | ยืนยันที่ไม่ใช่ CTA หลัก | พื้น navy-900 · ตัวอักษร `--on-solid` · hover navy-800 |
| `secondary` | รับเข้าคิว · ตรวจสอบซ้ำ · แก้ไข | พื้นการ์ด · ตัวอักษร+ขอบ support-blue · hover navy-50 |
| `ghost` | ยกเลิก · ล้างตัวกรอง · ปุ่มในแถว | โปร่ง · ตัวอักษร `--text-link` |
| `danger` | ยกเลิกคิว (ยืนยัน) | พื้น danger-solid |
| `danger-outline` | ออกก่อนรับบริการ | ขอบ+ตัวอักษร danger-text |

ขนาด sm 32 / md 40 / lg 48px · `pointer:coarse` ขั้นต่ำ 44px · counter+แท็บเล็ตปุ่มหลัก 48px · `border-radius: var(--radius-md)`
**ปุ่มส้มที่อนุญาตใน 3 หน้านี้:** "เข้าสู่ระบบ" · "เริ่มให้บริการ" · "บันทึก"/"บันทึกลูกค้า"/"บันทึกผล" · "+ รับลูกค้า"
`[aria-busy=true]` มี spinner `::before` 14px · `[disabled]`/`[aria-disabled=true]` พื้น `--surface-sunken` ตัวอักษร `--text-secondary-sunk` ขอบ `--border-default`

### 9.11 ฟอร์ม · toast · a11y

- **ฟอร์ม (`C-FORM`):** label เหนือช่อง body-sm 500 สี `--text-label` · ช่องบังคับมี `*` สี `--danger-text` + `sr-only` **"(จำเป็น)"** · input/select สูง 40px เดสก์ท็อป / 48px มือถือ+counter · ขอบ `--border-strong` · `:focus` = ขอบ `--border-focus` + `box-shadow: 0 0 0 2px var(--navy-100)` · error: ขอบ `--danger-solid` + ข้อความ body-sm ใต้ช่อง + `aria-invalid="true"` + `aria-describedby` · `::placeholder` = `--text-placeholder` (**ห้าม gray-500**) · textarea `min-height 96px` + ตัวนับ "0/2,000" ชิดขวา (`app.css:466-511` · `docs/06-ux/design-system.md:809-825`)
- **toast:** เดสก์ท็อปมุมขวาล่าง 24px · แท็บเล็ตเหนือ FAB · มือถือเหนือ bottom nav 12px · กว้าง 360px · ซ้อนสูงสุด 3 · success/info หายเองใน 5 วินาที (หยุดเมื่อ hover/focus) · warning/danger อยู่จนกดปิด · `role="status"` (danger ใช้ `role="alert"`) · **ห้ามมีเบอร์ อีเมล หรือ LINE ID ใน toast** (`docs/06-ux/design-system.md:802-807`)
- **a11y:** `/` โฟกัสช่องค้นหากลาง · `Esc` ปิด overlay ทุกชนิด · dialog โฟกัสเริ่มที่ฟิลด์แรก (ถ้ามี) ไม่งั้นปุ่มที่ไม่ทำลาย · `C-TABS` ใช้ ←→ Home End + Enter/Space (manual activation) · `C-CHIPS` `role="radiogroup"` ใช้ ←→ · ลิงก์ "ข้ามไปเนื้อหาหลัก" เป็น element แรกของ body · `:focus-visible` outline 2px offset 2px **ห้าม `outline:none`** · เป้าสัมผัส ≥ 44×44px เมื่อ `pointer:coarse` · ระยะห่างเป้าอย่างน้อย 8px (`app.css:184-200` · `docs/06-ux/design-system.md:1019-1034`)
- **ทุกสถานะต้องมีข้อความ/สัญลักษณ์กำกับ ห้ามสื่อด้วยสีอย่างเดียว** และต้องอ่านออกเมื่อพิมพ์ขาวดำ (`docs/06-ux/design-system.md:50`)
- **ไม่มีโหมดมืดในระบบนี้** — light theme อย่างเดียว พื้นหลัง `#FBFBFB` · ไม่มี `prefers-color-scheme` หรือ `data-theme` ใน `prototype/assets/*.css` เลย · **Phase 1 ไม่ต้องทำ dark mode และไม่ควรเพิ่มเอง**

### 9.12 รูปแบบตัวเลขและวันที่ (ตรึง)

**ตัวเลข** (`docs/00-brief/CANONICAL.md:65-76`): จำนวนคั่นหลักพัน `3,125` · เงินในการ์ด `฿3,332,700` (฿ ติดตัวเลข) · เงินในตารางไม่มี ฿ `1,245,000` และหัวคอลัมน์ต้องมี `(บาท)` · อัตรา 1 ตำแหน่งเสมอ `24.1%` · ส่วนต่างของอัตรา = `+2.1 pp` · ส่วนต่างของจำนวน = `+12%` · เครื่องหมายลบใช้ **U+2212 `−`** · ไม่มีค่าใช้ **U+2013 `–`** · ค่าปิดบัง LINE_USER_ID ใช้ **U+2014 `—`** · นาที = จำนวนเต็ม + `" นาที"`
**ห้าม `Math.round` บน float** — ปัด half away from zero ด้วยจำนวนเต็ม/BigInt · เทียบเป้าใช้ค่าที่ยังไม่ปัด (94.96% แสดง 95.0% แต่ไม่ผ่านเป้า ≥95%) · 0 จริงแสดง `0`/`฿0` ไม่ใช่ `–`

**วันที่/เวลา** (`docs/00-brief/CANONICAL.md:57-62`): วันที่ = พ.ศ. ย่อ `11 ก.ย. 2569` · วันที่+เวลาในตาราง/รายการ **ไม่มี "น."** → `11 ก.ย. 2569 10:24` · เวลาเดี่ยวในประโยค/การ์ด **มี "น."** → `10:24 น.` · เวลาในรายการที่มีหัววันแล้ว (คิว) = `HH:mm` · ช่วงวันที่ `13 ส.ค. – 11 ก.ย. 2569` · เวลา 24 ชม. เสมอ (`hourCycle: h23`) · แปลงเป็น **Asia/Bangkok เสมอ ห้ามพึ่ง timezone เครื่อง** · **ห้ามใช้เวลาสัมพัทธ์ ("3 นาทีที่แล้ว")** · "วันนี้"/"เกินกำหนด" คำนวณจาก `app.clock()` ไม่ใช่นาฬิกาเครื่อง
เดือนย่อ 12 ค่า: `ม.ค. ก.พ. มี.ค. เม.ย. พ.ค. มิ.ย. ก.ค. ส.ค. ก.ย. ต.ค. พ.ย. ธ.ค.`

**ตัวจัดรูปแบบพร้อมใช้:** `prototype/assets/app.js:194-330` (`JCRM.fmt.*`) ผ่าน `tools/check-prototype.mjs` แล้ว — พอร์ตไป `web/src/lib/format.ts` ได้ตรง ๆ: `fmt.int` `fmt.money` `fmt.moneyTable` `fmt.pct` `fmt.rate` `fmt.growth` `fmt.pp` `fmt.meetsTarget` `fmt.minutes` `fmt.dash` `fmt.date` `fmt.dayMonth` `fmt.time` `fmt.dateTime` · ค่าคงที่ `MINUS='−'` `DASH='–'`

### 9.13 responsive (3 ช่วงจอ)

| ช่วง | สิ่งที่เปลี่ยน |
|---|---|
| เดสก์ท็อป ≥1280px | sidebar เต็ม 264px + top bar 64px + page header |
| แท็บเล็ต 768–1279px (counter) | `--page-px` → `--space-5` · sidebar ย่อ 72px · `.btn`/`.input`/`.select` ดันเป็น 48px · **FAB "+ รับลูกค้า"** แสดง (สูง 56px · padding 0 20px · `--radius-full` · พื้น `--orange-500` · ตัวอักษร `--navy-900` 600 · มุมขวาล่าง 24px) — **ซ่อนบนหน้า 04 และ 07 และขณะ drawer/dialog เปิด** · เนื้อหา `padding-bottom: 96px` |
| มือถือ <768px | `--page-px` → `--space-4` · `--topbar-h` 56px · sidebar ซ่อน · **bottom nav 5 ช่อง สูง 64px** + safe-area · FAB ซ่อน · grid 1 คอลัมน์ · `.kpi-grid` 2 คอลัมน์ · drawer/dialog กลายเป็น bottom sheet (`--radius-xl` ด้านบน) |

**bottom nav 5 ช่อง (ป้ายตรงตัว):** **หน้าแรก · ลูกค้า · รับลูกค้า** (ปุ่มกลมส้มตรงกลาง 56px ไอคอน 28px สี `--navy-900` ยกขึ้น 16px `--shadow-3` → เปิด `/customers/new?mode=visit`) **· งาน · เพิ่มเติม**
`<nav aria-label="เมนูหลัก">` · ช่องปัจจุบันใช้ `aria-current="page"` + แถบบน 3px navy-900 · **ช่องที่ผู้ใช้เข้าไม่ได้ต้องไม่แสดง** — OPERATIONS/EXECUTIVE/BUSINESS_ADMIN ไม่มีช่องกลางเพราะไม่มี `visit.create`

**กติกา responsive ที่บังคับทุกหน้า** (`docs/06-ux/design-system.md:1004-1012`):
1. ออกแบบมือถือเป็นหน้าจอของตัวเอง (ลำดับฟิลด์ · ปุ่มลัด · ป้ายย่อ) **ห้ามย่อ layout เดสก์ท็อป**
2. เนื้อหาต้องไม่ถูกบังด้วย bottom nav/FAB
3. ฟอร์มยาวบนมือถือ ปุ่มบันทึกติดล่าง sticky เหนือ safe area และยังเห็นได้เมื่อแป้นพิมพ์เปิด
4. `html[data-device="counter"]` บังคับเป้าสัมผัส 48px ทุกหน้า · ซ่อน "จดจำฉันไว้" · เปิด `C-LOCK`
5. **ห้ามเลื่อนแนวนอนทั้งหน้า** — ตารางตัวเลขเลื่อนได้ในกล่องของตัวเองเท่านั้น
6. หน้าจอต้องใช้งานได้เมื่อขยายตัวอักษร 200% และที่ความกว้าง 320px

**หน้า 01 · 04 · 07 ใช้งานได้เต็มรูปแบบบนมือถือ ไม่อยู่ในรายการ desktop-only** (หน้า 09 13 14 15 16 17 18 เท่านั้นที่แสดง **"กรุณาใช้งานบนคอมพิวเตอร์"**) — `docs/06-ux/sitemap-screen-specs.md:296-313`

### 9.14 ห้ามทำ (design)

1. **ห้ามตัวอักษรขาวบนพื้นส้ม** — ต้องใช้ `--text-on-accent` (navy-900 · 5.66:1) เสมอ (ขาวบนส้มได้ 2.81:1 ไม่ผ่าน AA)
2. **ห้ามใช้ส้มเป็นสีกราฟ ห้ามเป็นพื้นหลังหลัก** และห้ามใช้ส้มกับ ลบ/ทำลาย/อนุมัติ/ส่งออก/ตัวกรอง/การนำทาง (ดูข้อมูล/ลิงก์/แท็บ/กลับหน้าแรก)/ปุ่มในแถวตารางหรือแถวคิว
3. **ห้ามพิมพ์ค่า hex หรือ rgba นอกบล็อก `:root`** — ทุกที่อื่นต้องอ้าง `var(--token)` (`tools/check-prototype.mjs:241, 252-257` fail ทันที)
4. **ห้ามโหลดฟอนต์หรือทรัพยากรใด ๆ จาก CDN/Google Fonts**
5. **ห้ามใช้ `--gray-500` เป็นสีตัวอักษรหรือ placeholder**
6. **ห้ามเพิ่ม dark mode / `prefers-color-scheme` เอง**
7. **ห้ามยึด `prototype/assets/premium.css` เป็นสเปก** — ไม่มีเอกสารใดรับรอง ไม่ถูกตรวจโดย `check-prototype` และขัดข้อตรึงหลายจุด (ดูข้อ 11)
8. **ห้ามแตะ/แก้ `prototype/assets/app.css` โดยไม่อัปเดต `docs/06-ux/design-system.md` ภาคผนวก B ควบคู่**

---

## 10. ตัวแปรสภาพแวดล้อมทุกตัว

**แหล่งจริงของโค้ด:** `web/src/lib/env.ts` — อ่าน env ผ่านไฟล์นี้ที่เดียว ถ้าค่าที่จำเป็นหายให้ล้มตั้งแต่บูตพร้อมบอกชื่อตัวแปร
**เทมเพลต:** `web/.env.example` → คัดลอกเป็น `web/.env.local` (`.env*` อยู่ใน `.gitignore` — ห้าม commit ค่าจริง)

### 10.1 ตัวแปรของแอป Next.js

| ชื่อ | บังคับ | ค่าที่ใช้ได้ | ค่าเริ่มต้น | ความลับ | คำอธิบาย |
|---|:--:|---|---|---|---|
| `JCRM_ENV` | – | `dev` \| `staging` \| `prod` | `dev` | ไม่ลับ | สภาพแวดล้อม · มีผลกับป้ายเตือนมุมจอ (`ENV_BADGE` = `DEV`/`STAGING`/ไม่มีบน prod) และกันตัวต่อฐานข้อมูลโหมดพัฒนาหลุดขึ้นของจริง · ค่าอื่นทำให้บูตล้ม (`web/src/lib/env.ts:15-19`) |
| `JCRM_DB_DRIVER` | – | `dev` \| `supabase` | `dev` เมื่อ `JCRM_ENV=dev` มิฉะนั้น `supabase` | ไม่ลับ | `dev` = ต่อ `tools/db/dev-api.mjs` (PGlite ในเครื่อง · ไม่ต้องมี Docker/Supabase) · `supabase` = ต่อ Supabase จริง · **`dev` ใช้ได้เฉพาะ `JCRM_ENV=dev` และห้ามคู่กับ `NODE_ENV=production`** (`web/src/lib/env.ts:21-33`) |
| `JCRM_DEV_API_URL` | – | URL | `http://127.0.0.1:54329` | ไม่ลับ | ที่อยู่ของ `dev-api` — ใช้เฉพาะเมื่อ `JCRM_DB_DRIVER=dev` (`web/src/lib/env.ts:36-37`) |
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ เมื่อ `JCRM_DB_DRIVER=supabase` | `https://xxxx.supabase.co` | – | ไม่ลับ (client) | Supabase Dashboard → Project Settings → API (`web/src/lib/env.ts:43`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✓ เมื่อ `JCRM_DB_DRIVER=supabase` | `sb_publishable_xxxx` | – | ไม่ลับ (client) | publishable key (แทน anon key รุ่นเก่า) (`web/src/lib/env.ts:44`) |

> ⚠️ `docs/08-delivery/deployment-backup-recovery.md:194` (H1) เขียนชื่อตัวแปรว่า `NEXT_PUBLIC_SUPABASE_ANON_KEY` แต่ **โค้ดจริงใช้ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`** — ดูข้อ 11 ข้อขัดแย้ง #6

**ค่าคงที่ที่อยู่ในโค้ด ไม่ใช่ env:** `APP_NAME = "JAUN CRM"` · `ENV_BADGE` (คำนวณจาก `JCRM_ENV`) — `web/src/lib/env.ts:49-53`

### 10.2 ตัวแปรที่ **ห้าม** อยู่ใน Next.js ทุก environment

- `SUPABASE_SERVICE_ROLE_KEY` (อยู่ใน secret ของ Edge Function เท่านั้น · Supabase ใส่ให้อัตโนมัติ)
- connection string ของ PostgreSQL ทุกรูปแบบ
- secret ของ Edge Function ใด ๆ
- ค่าลับใด ๆ ที่ตั้งชื่อขึ้นต้นด้วย `NEXT_PUBLIC_`

CI ขั้น C5 ต้องสแกน bundle ฝั่ง client หาสตริง `service_role` แล้วต้องไม่พบ
แหล่ง: `docs/08-delivery/deployment-backup-recovery.md:195, 244` · `docs/02-architecture/system-architecture.md:151` · `web/.env.example` (หมายเหตุความปลอดภัย)

### 10.3 secret ที่อยู่ที่อื่น (ไม่ใช่ของ Next.js — บันทึกไว้ให้ครบ)

| ที่อยู่ | secret |
|---|---|
| Edge Functions (`supabase secrets set --project-ref <ref>`) | `invite-staff` `disable-staff` `staff-code-login` `password-reset` `generate-export` = service_role · `reset-mfa` = service_role + SMTP · `cron-export-cleanup` = service_role + secret ของตัวเรียก **[รอยืนยัน B14]** · **ไม่มี connection string ฐานข้อมูลเด็ดขาด** |
| CI / runner | `SUPABASE_ACCESS_TOKEN` แยกต่อ environment (สิทธิ์ต่ำสุดที่ deploy ได้) · รหัสผ่าน `postgres` + connection string อยู่เฉพาะใน secret manager ของ CI และ runner ของ logical dump · **CI ของ PR ห้ามมี secret ของ staging/prod** · preview deployment ต้องชี้ dev/staging เท่านั้น |
| แยกต่อ environment | Web Push VAPID keys (Phase 2) · Custom SMTP · กุญแจเข้ารหัส logical dump (age/GPG) |

แหล่ง: `docs/08-delivery/deployment-backup-recovery.md:177-187, 202, 210` · `docs/08-delivery/deployment-backup-recovery.md:73-74, 129, 252`

### 10.4 ค่าใน `app.settings` ที่ต้องตั้งต่อ environment (ไม่ใช่ env ของแอป)

| environment | `app.settings['env']` | `app.settings['clock']` |
|---|---|---|
| local (PGlite) | `dev` (seed) | `{"as_of":"2026-09-11T10:24:00+07:00"}` |
| dev | `"dev"` | ค่าเดียวกับ seed |
| staging | `"staging"` | ค่า seed หรือ `{"as_of": null}` |
| prod | `"prod"` | **`{"as_of": null}` บังคับ** (ผิดเมื่อไรคือเหตุวิกฤต AL-07) |

แก้ผ่าน `api.update_setting` ตาม `editable_by` เท่านั้น (สคริปต์ bootstrap ตั้งครั้งแรก)
แหล่ง: `docs/08-delivery/deployment-backup-recovery.md:52-56, 139-144`

### 10.5 คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run db:test` | รัน migration ทั้ง 14 ไฟล์บน PGlite + seed + test (ข้าม `*_cron.sql`) |
| `npm run dev:db` / `npm run dev:db:fresh` | เปิด `tools/db/dev-api.mjs` (PGlite HTTP · พอร์ต 54329) |
| `npm run dev:web` | `npm --prefix web run dev` (predev รัน `sync-design.mjs` ก่อน) |
| `npm run web:build` / `npm run web:typecheck` | build / typecheck ของแอป |
| `npm run check` | `check:canonical` + `check:prototype` + `db:test` |

(`package.json:10-23` · `web/package.json:9-16`)

---

## 11. ข้อขัดแย้งที่ชี้ขาดแล้ว + รายการรอยืนยัน

### 11.1 ข้อขัดแย้งที่เปิดไฟล์จริงชี้ขาดแล้ว (**ยึดตามคอลัมน์ "ข้อยุติ"**)

| # | จุดที่ขัด | แหล่งที่ขัดกัน | ข้อยุติ |
|---|---|---|---|
| 1 | `queue_no` ของ visit WALK_IN โหมด `SERVICE` | `docs/07-api/api-spec.md:456` แสดง `"queue_no": null` ในตัวอย่าง WALK_IN + `visit_mode: SERVICE` และ `:468` สื่อว่า `queue_no` มีเฉพาะโหมด `QUEUE` — แต่ CHECK `visits_queue_no_chk` บังคับ `(channel_code='WALK_IN') = (queue_no IS NOT NULL)` (`supabase/migrations/0005_crm_activity.sql:57-58`) และ trigger ออกเลขให้ทุก walk-in (`supabase/migrations/0009_business_triggers.sql:145-146`) | **ยึด SQL — visit WALK_IN ทุกใบมี `queue_no` เสมอ ทั้ง QUEUE และ SERVICE** · UI **ห้ามใช้ `queue_no != null` เป็นเงื่อนไขแยกโหมด** ให้ใช้ `status` (`WAITING` vs `IN_SERVICE`) แทน · ตัวอย่างใน api-spec.md:456 ผิด |
| 2 | ข้อความ error เมื่อไม่มีสิทธิ์ `customer.create` | `api-spec.md:426` ระบุ `ไม่มีสิทธิ์สร้างลูกค้าในสาขานี้` · `api-spec.md:509` ระบุ `ไม่มีสิทธิ์สร้างลูกค้า` — แต่บรรทัดแรกของทั้งสอง RPC คือ `app.require_permission('customer.create')` (`0011_api.sql:585, 829`) ซึ่งโยน `ไม่มีสิทธิ์ customer.create (ตรวจ MFA และบทบาทของคุณ)` ก่อน (`0011_api.sql:125`) | **ยึด SQL — มี 2 ข้อความ**: (ก) ไม่มี permission เลย → `ไม่มีสิทธิ์ customer.create (ตรวจ MFA และบทบาทของคุณ)` (ข) มี permission แต่ scope ไม่ครอบสาขานั้น → `ไม่มีสิทธิ์สร้างลูกค้าในสาขานี้` (quick_capture `0011_api.sql:620`) หรือ `ไม่มีสิทธิ์สร้างลูกค้า` (find_customer_candidates `0011_api.sql:841`) · **frontend ต้องจับทั้งสอง ห้าม match ข้อความแบบเป๊ะตัวเดียว** |
| 3 | `api.close_visit` กับคิว `WAITING` ที่ยังไม่มีเจ้าของ | RLS `visits_update` (`0010_security.sql:423-424`) และ `api.quick_capture` (`0011_api.sql:673-675`) มีอนุประโยคพิเศษให้ STAFF (scope OWN) แตะ visit `WAITING` + owner ว่างได้ — แต่ `api.close_visit` (`0011_api.sql:1783`) และ `api.acknowledge_unrecorded_visit` (`0011_api.sql:1873`) ใช้เพียง `app.can_access_record('visit.update',…)` ซึ่งไม่มีอนุประโยคนี้ | **ยึด SQL แต่เป็นความไม่สอดคล้องภายใน SQL เอง → ต้องยืนยันเชิงธุรกิจก่อนออกแบบเมนู "ออกก่อนรับบริการ"** · ผลจริง: STAFF **ปิดคิวของเพื่อนที่ยังไม่มีเจ้าของเป็น `LEFT_BEFORE_SERVICE` ไม่ได้** (42501) ต้องกดรับคิวก่อน — แต่การรับคิวเปลี่ยนเป็น `IN_SERVICE` ซึ่งปิดด้วย `LEFT_BEFORE_SERVICE` ไม่ได้อีก (`JCRM-T21`) → **ลูกค้าที่เดินออกจากคิวก่อนรับบริการ ปิดได้เฉพาะโดย SUPERVISOR/BRANCH_MANAGER (scope TEAM/BRANCH)** หรือรอ job ปิดเป็น `UNRECORDED` ตอน 00:05 น. |
| 4 | ข้อความ error `ไม่มีสิทธิ์แก้ visit นี้` ของ `api.quick_capture` | มีในโค้ด (`0011_api.sql:677`) แต่ **ไม่ปรากฏในตาราง error ของ `api-spec.md` ข้อ 3.1.1** | **ยึด SQL** — เพิ่มเข้า mapping ของ frontend เอง (ดูข้อ 2.9) |
| 5 | ตัวกรองคิวของหน้า 07 | `docs/06-ux/sitemap-screen-specs.md:1391` เขียนว่ากรอง `channel_code='WALK_IN'` ด้วย · `docs/07-api/api-spec.md:1813` กำหนดเพียง `branch_id=eq.` + `status=in.(WAITING,IN_SERVICE)` + `order=queue_no` | **ยึด api-spec (`branch_id` + `status` + `order=queue_no`)** เพราะ `visits_waiting_chk` บังคับอยู่แล้วว่า `WAITING` เกิดได้เฉพาะ `WALK_IN` · แต่ visit ช่องทางอื่นที่เป็น `IN_SERVICE` จะโผล่ในคิวด้วยและไม่มี `queue_no` → **ต้องตัดสินก่อนเขียนว่าจะซ่อน หรือแสดงเป็นแถวไม่มีเลขคิว** (ดูข้อ 11.2) |
| 6 | ชื่อ env ของ publishable key | `docs/08-delivery/deployment-backup-recovery.md:194` (H1) ระบุ `NEXT_PUBLIC_SUPABASE_ANON_KEY` — โค้ดจริง `web/src/lib/env.ts:44` และ `web/.env.example` ใช้ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **ยึดโค้ด (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)** — Supabase เลิกใช้คำว่า anon key แล้ว · ควรแก้ H1 ในเอกสาร deployment ให้ตรง |
| 7 | ชื่อ cron job | `supabase/migrations/0014_schedule_cron.sql:36-60` ตั้ง jobname `jaun_close_stale_visits` `jaun_expire_quotations` `jaun_retention` `jaun_expire_exports` `jaun_notifications` และ command `SELECT app.job_xxx();` — แต่เกณฑ์ตรวจ go-live B12 (`docs/08-delivery/deployment-backup-recovery.md:133, 263`) อ้างชื่อ `job_*` และ command `SELECT app.job_…(app.clock())` | **ยึดไฟล์ migration (ใช้ได้จริงเพราะทุก job ประกาศ `p_as_of timestamptz DEFAULT NULL`)** แต่ **เกณฑ์ตรวจ B12 จะไม่ผ่านถ้ายึดชื่อ `job_*` ตามตัวอักษร** → ต้องตัดสินก่อน deploy staging ว่าจะแก้ไฟล์ cron หรือแก้เกณฑ์ตรวจ |
| 8 | สถานะคีย์ `app.settings` 3 ตัวของ v2.2 | `docs/08-delivery/deployment-backup-recovery.md:159` เขียนว่า `pdpa.current_notice_version` · `security.login_ip_per_15min` · `dsr.anonymize_per_day` ยังไม่อยู่ใน migration | **ถูกเพิ่มแล้วใน `supabase/migrations/0011_api.sql:64-66`** (`"PN-2026-01"` · `20` · `20`) — **ไม่ต้องทำ migration เพิ่ม** หมายเหตุในเอกสารล้าสมัย |
| 9 | คีย์ `sessionStorage` ส่งค่าจากหน้า 07 → 04 | `prototype/07-reception.html:62` เขียนด้วย `jcrm.reception.draft` · `prototype/04-quick-capture.html:211` อ่านด้วย `jcrm.receptionDraft` | **บั๊กจริงใน prototype — การส่งค่า ความสนใจ/รู้จักร้านจาก/ช่องทาง ไม่ทำงานเลย** · Phase 1 ต้องเลือกคีย์เดียวก่อนเขียนโค้ด (ในแอปจริงใช้ state ของ router แทน storage ได้ · **ห้ามส่งผ่าน URL**) |
| 10 | ปุ่มที่ prototype มีแต่สเปกไม่มี | `"รับลูกค้าด่วน"` (หน้า 07) และ `"บันทึกแบบไม่ระบุตัวตน"` (หน้า 04) ไม่ปรากฏใน `sitemap-screen-specs.md` ข้อ 10.5 และ 9.x | **ไม่พอร์ตเข้า Phase 1 จนกว่าจะตัดสิน** · `"บันทึกแบบไม่ระบุตัวตน"` ข้ามการตรวจ ชื่อ/เบอร์/LINE/อีเมล ซึ่ง **ขัดกับกติกาบังคับของ `api.quick_capture`** (ต้องมี `first_name` หรือ `nickname` และ contact ≥ 1) → ถ้าจะเก็บไว้ ต้องแก้สัญญา RPC ก่อน ไม่ใช่แก้แค่ฝั่ง frontend · handler `"รับลูกค้าด่วน"` ยังอ้าง `S.queue` ที่ไม่มีใน state (`prototype/07-reception.html:333, 336`) = TypeError |
| 11 | ป้ายของหน้า 01 | spec เขียน `"อีเมลหรือรหัสพนักงาน"` / `"จดจำฉันไว้"` (`sitemap-screen-specs.md:470-472`) · prototype ใช้ `"อีเมล หรือ รหัสพนักงาน (ST-NNNN)"` / `"จดจำอีเมล/รหัสพนักงาน"` | **ยึด spec** (ข้อความในข้อ 5.1 ของไฟล์นี้) — prototype ต้องปรับตาม |
| 12 | สเกลตัวอักษร · `--neutral-solid` · `--shadow-3` · `--dur-base` | `prototype/assets/app.css` ต่างจาก `docs/06-ux/design-system.md` ข้อ 6 | **แอปจริงยึดเอกสาร** (ดูข้อ 9.3 · 9.7 · 9.8 · 9.9) — ภาคผนวก B.3 อนุญาตให้ prototype ใช้ค่าเดิมไปก่อน |
| 13 | `prototype/assets/premium.css` | ถูกโหลดในทั้ง 20 หน้า HTML (บรรทัดที่ 8) แต่ **ไม่มีเอกสารใดรับรอง** (`grep 'premium.css'` ในไฟล์ `.md` ทั้งโครงการ = 0) และ `tools/check-prototype.mjs:240-242` ตรวจเฉพาะ `app.css` | **ห้ามพอร์ตเข้า Phase 1** — ขัดข้อตรึงอย่างน้อย 9 จุด (แถบไล่สี navy→orange บนหัวการ์ด KPI ทุกใบ · ปุ่มส้ม/navy เป็น gradient · `--radius-lg` กับปุ่ม · หัวข้อ `font-weight: 700` · ค่า KPI 700 + `--fs-display` · `body` เป็น gradient · `letter-spacing: -0.02em` บนหัวข้อไทย · หัวตารางพื้น navy-50 · animation 0.6s เกิน `--dur-slow`) และทำให้แถวตารางที่เลือกหาย (zebra ที่ระดับ `<td>` ทับ `tr[aria-selected]`) · **ถ้าเจ้าของโครงการอยากได้ลุคพรีเมียม ให้เสนอแก้ `design-system.md` เป็นข้อ ๆ ก่อน แล้วแก้ token ที่ต้นทาง** |

### 11.2 สิ่งที่ยังตัดสินไม่ได้ — ต้องได้คำตอบก่อน/ระหว่างเขียนโค้ด

**ขวางการเขียน Core Flow (blocker)**
1. **วิธีล็อกอินของ Phase 1** — `supabase/functions/` **ยังไม่มีในรีโพเลย** (Edge Function ทั้ง 8 ตัวยังไม่ถูกเขียน) ทั้งที่ `api.svc_resolve_staff_code` พร้อมแล้ว → ต้องเลือก (ก) ล็อกอินด้วยอีเมล+รหัสผ่านไปก่อน หรือ (ข) เขียน `staff-code-login` + `password-reset` ให้เสร็จใน Environment Setup · **ต้องตัดสินก่อนลงมือหน้า 01**
2. **ยังไม่มี `supabase/config.toml`** → `supabase link` / `db push` / `functions deploy` ยังใช้ไม่ได้จนกว่าจะ `supabase init` · ต้องตัดสินว่าจะตรึงค่า CLI (`[auth] enable_signup = false` · exposed schemas · `max_rows`) ไว้ในไฟล์นี้หรือตั้งมือในคอนโซล
3. **project `dev`/`staging`/`prod` ยังไม่มี** (เงื่อนไขเข้า Phase 1 ตาม `docs/08-delivery/roadmap.md:154`) และ `Q6` (แพ็กเกจ Pro/Team · region · compute size) ยังไม่ยืนยัน — ตัดสินนี้ล็อกว่าจะเปิด Password Verification Attempt hook (A5) ได้หรือต้อง fallback ไปนับ rate limit ใน Server Action
4. **ชื่อ trigger v2.1 ยังไม่ถูกเปลี่ยนเป็นลำดับ v2.2** — `supabase/migrations/0009_business_triggers.sql:210, 328, 375` ยังเป็น `trg_assign_running_number` · `trg_row_defaults` · `trg_guard_restricted_text` แต่ M13 บังคับ `trg_05_running_number` → `trg_10_enforce_transition` → `trg_20_guard_text` → `trg_90_stamp_row` · **ต้องแก้ก่อน apply migration ครั้งแรกบน staging** (forward-only: หลังจากนั้นเปลี่ยนได้ด้วย migration ใหม่เท่านั้น)
5. **หน้า 01 ยังขาด 2 มุมมอง** ที่สเปกกำหนด: "ลงทะเบียน MFA (ยังไม่มี factor)" และ "รับคำเชิญ / ตั้งรหัสผ่านเพื่อเริ่มใช้งาน" — ทั้งสองจำเป็นต่อ Phase 1 เพราะไม่มี public sign-up และบทบาททุกตัวยกเว้น STAFF `requires_mfa = true`

**ไม่ขวาง แต่ต้องตัดสินก่อนหน้าจอนั้นเสร็จ**
6. หน้าคิวของหน้า 07: กรอง `started_at` ตามวันธุรกิจ Asia/Bangkok ด้วยหรือไม่ (visit ค้างข้ามวันจะถูก job ปิดเป็น `UNRECORDED` ตอน 00:05 น.) และ default `branch_id` มาจากไหน (อุปกรณ์ที่ `register_device` หรือสาขาที่ผู้ใช้เลือก) — `api-spec.md:1813` ไม่ได้ตรึงไว้ · รวมถึงข้อ 11.1 #5 (visit `IN_SERVICE` ช่องทางอื่นที่ไม่มี `queue_no`)
7. `C2` — เครื่องมือ lint / typecheck / unit test ของแอปยังไม่เลือก (`web/package.json` มีแค่ `typecheck`) — `docs/08-delivery/deployment-backup-recovery.md:241`
8. `max_rows` ของ PostgREST = 200 ยัง **[รอยืนยัน]** → frontend อ่านจาก header `Content-Range` แทนการสมมติค่า (`docs/07-api/api-spec.md:108`)
9. เกณฑ์ความเร็ว "รับเข้าคิว ≤3 วินาที · Quick Capture ≤30 วินาที · เปิด Customer 360 ≤2 วินาที" อยู่ใน `docs/08-delivery/phase1-plan.md:95` เท่านั้น ยังไม่ถูกยกขึ้น CANONICAL และยังไม่ระบุวิธีวัด (p50/p95 · นับจาก interaction ถึง commit หรือถึง paint) — ต้องนิยามก่อนใช้เป็นเกณฑ์ผ่าน/ไม่ผ่านของ Pilot

**รายการ [รอยืนยัน] ที่แตะ 3 หน้านี้ — เดินตาม default ได้ แต่ห้ามเปลี่ยนสถานะเป็น Final Decision เอง** (`docs/00-brief/CANONICAL.md:1993-1994, 2030`)
10. ระยะเวลาหน่วงเวลาหลังเข้าสู่ระบบผิดหลายครั้ง (CANONICAL ข้อ 9.2) และกลไกนับที่ขึ้นกับแพ็กเกจ Supabase (Q6)
11. `Q5` — ซ่อนปุ่ม SSO เมื่อองค์กรไม่มี Workspace/M365 (`allowed_sso_domains = []`) · Phase 1 ใช้ทางเลือก C จึงควรซ่อนไว้ก่อน
12. กรอบ 15 นาทีที่ผู้สร้างยกเลิกคิวเองได้ (CANONICAL ข้อ 4.1)
13. outcome สามค่าหลัง `SERVICE_DONE` / `LEFT_BEFORE_SERVICE` / `UNRECORDED` ยังเป็นข้อเสนอเพิ่ม (CANONICAL ข้อ 4.2)
14. `Q9` — เนื้อความประกาศความเป็นส่วนตัว `PN-2026-01` (ฝ่ายกฎหมายร่าง)
15. ความถี่รีเฟรชคิว 30 วินาที เป็นข้อเสนอของผู้ออกแบบ (S25)
16. หน้าต่าง 4 ชั่วโมงของ visit ใน `find_customer_candidates` / `link_customer_to_branch` เป็นค่า hard-code ใน SQL ไม่ได้อ่านจาก `app.settings` → เปลี่ยนต้องแก้ migration · UI ต้องมีข้อความบอกผู้ใช้เมื่อ visit เก่าเกิน 4 ชม.
17. `next_action_at = now() + 30 นาที` ของ lead อัตโนมัติ hard-code ใน `0011_api.sql:788` ไม่ได้อ่านจาก `app.settings`
18. `api.search_customers` LIMIT 20 (`0011_api.sql:963`) และ trigram `>= 0.3` (`0011_api.sql:961`) เป็นค่าของ implementation → หน้ารายการลูกค้าต้องใช้ PostgREST บน `crm.customers` แทน RPC เมื่อต้องการแบ่งหน้า
19. `find_customer_candidates` เมื่อไม่ส่ง `p_visit_id` ใช้ `(scope_branch_ids('customer.create','OWN'))[1]` ซึ่งเรียงตาม uuid = สาขา "สุ่ม" สำหรับพนักงานหลายสาขา · **Pilot ที่ JAUNPHONE 1 สาขาเดียวไม่มีผล** แต่ต้องเพิ่มพารามิเตอร์ `branch_id` เมื่อขยายสาขา
20. ระยะเวลาซ่อนค่า `reveal` กลับอัตโนมัติ = 30 วินาที และ action code ของ `api.reveal_address` (`ADDRESS_REVEALED`) ยัง **[รอยืนยัน]**
21. **รูปคืนค่าไม่คงที่** — `api.activate_self()` และ `api.acknowledge_unrecorded_visit()` คืนคีย์ไม่เท่ากันระหว่างเส้นทาง "ทำแล้ว" กับ "เพิ่งทำ" → **type ฝั่ง TypeScript ต้องประกาศคีย์เหล่านี้เป็น optional ห้ามประกาศเป็น required** · ต้องยืนยันว่าจะไม่แก้ลายเซ็น

### 11.3 สิ่งที่มีอยู่แล้วในรีโพ (อย่าสร้างซ้ำ)

| สิ่งที่มี | ที่อยู่ |
|---|---|
| migration ครบ 14 ไฟล์ (`0001`–`0014`) | `supabase/migrations/` |
| โครง Next.js 16 + React 19 + `@supabase/ssr` + zod | `web/` (`web/package.json`) |
| `proxy.ts` · `lib/session.ts` · `lib/access.ts` · `lib/env.ts` · `lib/labels.ts` · `lib/db/{index,dev,supabase}.ts` | `web/src/` |
| หน้า `/login` + `(app)/layout.tsx` + `/dashboard` + `AppShell` | `web/src/app/` · `web/src/features/` |
| ตัวต่อฐานข้อมูลโหมดพัฒนา (PGlite HTTP) | `tools/db/dev-api.mjs` (`npm run dev:db`) |
| สคริปต์คัดลอก CSS จาก prototype | `web/scripts/sync-design.mjs` |
| ฟอนต์ Kanit 10 ไฟล์ + `kanit-faces.css` | `prototype/assets/fonts/` · `prototype/assets/kanit-faces.css` |
| ตัวจัดรูปแบบตัวเลข/วันที่ไทย | `prototype/assets/app.js:194-330` (`JCRM.fmt.*`) |
| ป้ายไทยของบทบาท/สถานะพนักงาน | `web/src/lib/labels.ts` |

### 11.4 สิ่งที่ยังไม่มีในรีโพ

- `supabase/config.toml` (ยังไม่ `supabase init`)
- `supabase/functions/` — Edge Functions ทั้ง 8 ตัว (`staff-code-login` `password-reset` `invite-staff` `disable-staff` `reset-mfa` `generate-export` `cron-export-cleanup` `integration-*`)
- `web/src/types/database.ts` (ต้อง `supabase gen types typescript --schema api,crm,core,ref` แล้ว commit)
- `web/public/sw.js` (service worker) และ security headers ใน `web/next.config.ts`
- หน้า `/reception` และ `/customers/new` (ยังไม่มีใน `web/src/app/`)
- มุมมอง "ลงทะเบียน MFA" และ "รับคำเชิญ" ของหน้า 01
- CI pipeline C1–C5 / S1 / S2 / P0–P2 (`.github/workflows/` มีเพียง `deploy-pages.yml` ที่ deploy `prototype` ขึ้น GitHub Pages)
- เครื่องมือ lint / unit test ของแอป

---

> **จุดอ้างอิง baseline:** git tag `phase1-plan-approved` (`Phase 1 Plan Approved / Pre-Frontend Baseline`)
> **งานถัดไปตามลำดับที่อนุมัติ:** Environment Setup → Core Flow `รับลูกค้า + Quick Capture` (`docs/00-brief/CANONICAL.md:2036-2050`)
