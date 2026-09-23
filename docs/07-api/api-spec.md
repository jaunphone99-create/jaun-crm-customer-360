# API Specification — JAUN CRM · Customer 360

> **เอกสารชุดที่ 10 ของ A45** · Phase 0 · ฉบับตรงกับ migration `0010_security.sql` · `0011_api.sql` · `0012_analytics.sql` · `0013_jobs.sql`
>
> **แหล่งจริงของค่าทุกค่าคือ `docs/00-brief/CANONICAL.md` v2.2** — เอกสารนี้อธิบาย "สัญญาการเรียก" ของสิ่งที่สร้างจริงในฐานข้อมูล
> ที่ใดที่ implementation ต่างจาก CANONICAL **CANONICAL เป็นฉบับบังคับ** และส่วนต่างถูกบันทึกไว้ในข้อ 8
> ค่าที่ CANONICAL ยังไม่ตัดสิน เขียนว่า **รอยืนยัน** ไม่มีการคิดค่าขึ้นเอง

---

## สารบัญ

| ข้อ | เรื่อง |
|---|---|
| 1 | ขอบเขต · แหล่งจริง · วิธีอ่านเอกสาร |
| 2 | ข้อตกลงร่วมของทุกคำเรียก (client · เซสชัน · envelope · แบ่งหน้า · เวลา · การปิดบัง · อัตรา · ข้อผิดพลาด) |
| 3 | RPC ของหน้าจอและ Edge Function (schema `api` — **58 ฟังก์ชัน** = หน้าจอ 51 + `svc_*` 7) |
| 4 | การอ่าน/เขียนตารางตรงผ่าน PostgREST (column grant ของ `0010_security.sql`) |
| 5 | สัญญาของ Edge Function (8 กลุ่ม) |
| 6 | แผนที่ Next.js Server Action ต่อหน้าจอ (CANONICAL ข้อ 14.1) |
| 7 | ตารางสอบทาน RPC ↔ หน้าจอ ↔ สิทธิ์ ↔ ไฟล์ test |
| 8 | หมายเหตุผู้เขียน · ส่วนต่างจาก CANONICAL · รายการรอยืนยัน |

---

## 1. ขอบเขต · แหล่งจริง · วิธีอ่านเอกสาร

### 1.1 สิ่งที่เอกสารนี้ครอบคลุม

1. **RPC ทุกตัวใน schema `api`** ตามที่ migration สร้างจริง — ลายเซ็น · security/volatility · สิทธิ์และ aal ที่ต้องมี · พารามิเตอร์ · รูปผลลัพธ์ · ข้อผิดพลาด · ผลข้างเคียง (audit · access log · การแจ้งเตือน · การเปลี่ยนสถานะ) · ตัวอย่าง
2. **การอ่าน/เขียนตารางตรง** ผ่าน PostgREST เท่าที่ column grant ของ `0010_security.sql` อนุญาต
3. **สัญญาของ Edge Function** ทั้ง 8 กลุ่มตาม CANONICAL ข้อ 9.8
4. **แผนที่ Server Action ต่อหน้าจอ** ทั้ง 19 หน้าตาม CANONICAL ข้อ 14.1
5. **ตารางสอบทาน** RPC ↔ หน้าจอ ↔ สิทธิ์ ↔ ไฟล์ test

สิ่งที่ **ไม่อยู่** ในเอกสารนี้: นิยาม KPI (อยู่ที่ `docs/05-analytics/kpi-definitions.md`) · predicate ของ RLS รายตาราง (อยู่ที่ `docs/04-security/rls-spec.md`) · องค์ประกอบหน้าจอ (อยู่ที่ `docs/06-ux/sitemap-screen-specs.md`) · รายละเอียดคอลัมน์ (data dictionary)

### 1.2 แหล่งจริงของแต่ละส่วน

| ส่วน | แหล่งจริง |
|---|---|
| ค่า ชื่อ รหัส สูตร | `docs/00-brief/CANONICAL.md` v2.2 |
| ลายเซ็นและพฤติกรรมของ RPC | `supabase/migrations/0011_api.sql` · `0012_analytics.sql` |
| column grant · policy · trigger สิทธิ์ | `supabase/migrations/0010_security.sql` · `docs/04-security/rls-spec.md` |
| งานตามเวลา | `supabase/migrations/0013_jobs.sql` · `0014_schedule_cron.sql` |
| ชั้นแอปพลิเคชัน (Server Action · Edge Function · Storage) | `docs/02-architecture/system-architecture.md` |
| ข้อมูลตัวอย่างในตัวอย่างคำเรียก | CANONICAL ข้อ 13 |

### 1.3 ข้อตกลงของตัวอย่างในเอกสารนี้

- ตัวอย่างทุกอันใช้ข้อมูลของ CANONICAL ข้อ 13 และนาฬิกา `app.clock()` = **11 ก.ย. 2569 10:24 น.** (`2026-09-11T10:24:00+07:00`)
- **UUID ไม่ได้ถูกตรึงใน CANONICAL** จึงเขียนเป็น placeholder รูป `"<uuid:CUS-2026-000297>"` · `"<uuid:JP1>"` · `"<uuid:ST-0045>"` — ห้ามอ่านเป็นค่าจริง
- ค่าเวลาใน JSON เป็น ISO-8601 พร้อม offset ตามที่ PostgREST คืน (`"2026-09-11T03:24:00+00:00"`) · การแสดงผลเป็น พ.ศ. ทำที่ UI (CANONICAL ข้อ 1.2)
- `...` ในตัวอย่างผลลัพธ์ = คีย์ที่ตัดออกเพื่อความสั้น ไม่ใช่คีย์ที่ไม่มี

---

## 2. ข้อตกลงร่วมของทุกคำเรียก

### 2.1 ช่องทางเรียกและ client

| หัวข้อ | ค่า | ที่มา |
|---|---|---|
| Data API | Supabase PostgREST · exposed schemas = `api, crm, core, ref` | CANONICAL ข้อ 1.1 |
| เรียก RPC | `supabase.schema('api').rpc('<ชื่อ>', { ...พารามิเตอร์ })` | ข้อ 1.1 |
| อ่าน/เขียนตาราง | `supabase.schema('crm').from('<ตาราง>')` · `schema('core')` · `schema('ref')` | ข้อ 1.1 |
| schema ที่ **ไม่** เปิด API | `app` · `analytics` · `audit` · `restricted` (เข้าถึงผ่าน RPC เท่านั้น) | ข้อ 1.1 |
| role ของทุกคำเรียกจากผู้ใช้ | `authenticated` (JWT ของผู้ใช้) · `anon` ไม่มี GRANT ใดในทุก schema ของระบบ | ข้อ 1.1 · 9.1 |
| service_role | Edge Functions ตามข้อ 9.8 เท่านั้น · เรียกได้เฉพาะ `api.svc_*` | ข้อ 9.8 |
| ฝั่งที่เรียก | **Next.js Server Actions / Route Handlers เท่านั้น** (ไม่มี Supabase browser client ที่ถือ session) | system-architecture §2 P2 |

> **หลักการ P1 (CANONICAL ข้อ 9.1):** ผู้ใช้เรียก PostgREST/RPC ตรงด้วย JWT ของตนได้ → การตรวจสิทธิ์ ปิดบัง บันทึกการเข้าถึง และอัตราจำกัด **อยู่ในฐานข้อมูลทั้งหมด**
> การตรวจใน Server Action เป็นสำเนาเพื่อ UX ถ้าสองที่ขัดกันให้ยึดฐานข้อมูล

### 2.2 เซสชันและ header

| หัวข้อ | ค่า |
|---|---|
| เซสชัน | Supabase Auth · access token 15 นาที · cookie **HttpOnly · Secure · SameSite=Lax** (CANONICAL ข้อ 9.2) |
| ที่อ่าน/เขียน cookie | `proxy.ts` refresh session → server client ต่อ request (system-architecture §3.2) |
| MFA | enroll/challenge/verify ทำใน Server Action ทั้งหมด (CANONICAL ข้อ 19.4 ข้อ 4) · `aal` อยู่ใน JWT (`auth.jwt()->>'aal'`) |
| header ที่ Next.js ส่งต่อทุกคำเรียก | `x-request-id` · `x-client-ip` · `x-client-ua` · `x-device-id` |
| ฐานข้อมูลอ่าน header จาก | `current_setting('request.headers', true)::jsonb` → ลง `audit.audit_logs` / `audit.access_logs` |
| สถานะของ header | **ข้อมูล "ที่รายงาน" ไม่ใช่หลักฐาน** · ห้ามใช้ตัดสินสิทธิ์ (CANONICAL ข้อ 9.5) |
| response header ของหน้าที่ต้องล็อกอิน | `Cache-Control: no-store` · CSP strict (nonce) · `Referrer-Policy: same-origin` · `X-Content-Type-Options: nosniff` |
| PWA service worker | ห้าม cache `/rest/v1` `/rpc` `/auth` และ route ที่ต้องล็อกอิน (CANONICAL ข้อ 9.2) |

`app.request_headers()` อ่านค่าแบบทนความผิดพลาด: ถ้า `request.headers` ว่างหรือไม่ใช่ JSON คืน `{}` (ไม่ทำให้คำสั่งล้ม)

### 2.3 แบบแผนของ RPC (envelope)

RPC ทุกตัวที่หน้าจอเรียกคืน **`jsonb` ก้อนเดียว** ที่มีคีย์ `ok` เสมอ

```jsonc
{ "ok": true, ... }                                  // สำเร็จ
{ "ok": false, "code": "REVEAL_LIMIT_EXCEEDED", ...} // ปฏิเสธแบบ "ไม่ raise" (ข้อ 2.8.5)
```

- ยกเว้นตัวเดียว: `api.can_assign_role(...)` คืน `boolean` (ออกแบบให้ใช้ซ่อนปุ่มและให้ Edge Function `invite-staff` เรียก จึงไม่ raise)
- **พารามิเตอร์ชื่อ `p` เป็น `jsonb`** สำหรับ RPC ที่มีฟิลด์มาก (`quick_capture` · `open_visit` · `save_contact` …) · คีย์ที่ไม่รู้จักใน `p` ถูกละเลย (ไม่ error) — Server Action ต้องตรวจรูปแบบเองเพื่อ UX
- ค่าว่างของสตริงใน `p` ถือเท่ากับ `NULL` ทุกที่ (ทุกฟังก์ชันใช้ `nullif(p ->> 'x', '')`)
- ค่าที่เป็นรายการส่งเป็น JSON array (`"contacts": [ … ]`) · uuid array ของพารามิเตอร์ระดับบนส่งเป็น `uuid[]` จริง (`p_branch_ids`)

### 2.4 PostgREST `max_rows` และการแบ่งหน้า

| หัวข้อ | ค่า | ที่มา |
|---|---|---|
| `max_rows` ของ PostgREST | **200** **[รอยืนยัน]** | CANONICAL ข้อ 1.1 |
| การขอจำนวนแถว | `?limit=&offset=` หรือ header `Range: 0-49` · `Prefer: count=exact` เมื่อต้องการยอดรวม | system-architecture §4.1 |
| ยอดรวมที่ใช้แสดง "แสดง 1–N จาก M" | header `Content-Range: 0-49/1284` | §4.1 |
| หน้าที่ข้อมูลโต | ใช้ **keyset** (`last_activity_at`, `customer_no`) แทน `offset` | §4.1 |
| เพดานของ RPC ที่คืนรายการ | `api.search_audit` · `api.search_security_log` · `api.list_integration_logs` ตัดที่ `least(p.limit, 200)` · `api.list_export_requests` ใช้ `p.limit` (ค่าเริ่มต้น 200) · `api.search_customers` คืน **กลุ่มลูกค้าสูงสุด 20 ราย** (กลุ่มอื่นไม่จำกัด) | implementation |
| RPC ที่ไม่มีการแบ่งหน้า | `api.list_staff` · `api.list_dsr` · `api.list_role_grant_requests` · `api.list_data_quality_issues` · `api.get_customer_360` — คืนทั้งชุดในขอบเขตของผู้เรียก (ปริมาณจำกัดด้วยขอบเขตสิทธิ์อยู่แล้ว) | implementation |

> RPC คืน `jsonb` ก้อนเดียว → **`max_rows` ของ PostgREST ไม่ตัดผลของ RPC** การจำกัดจำนวนจึงอยู่ในตัวฟังก์ชันตามตารางข้างบน

### 2.5 เวลา: `app.clock()` กับ `now()`

| ใช้กับ | นาฬิกา | ตัวอย่าง |
|---|---|---|
| KPI · รายงาน · คุณภาพข้อมูล · การแจ้งเตือน · การจัดกลุ่ม "วันนี้" · ป้าย "ลูกค้าใหม่" · งานตามเวลา | **`app.clock()`** | `api.get_kpis` · `api.get_report` · `api.list_data_quality_issues` · `badges.newCustomer` ใน `api.get_customer_360` |
| การตัดสินสิทธิ์ · อายุคำเชิญ · `valid_from/valid_to` · กรอบ 24 ชม. ของ interaction · ตัวนับอัตรา | **`now()` เสมอ** | ทุก RPC ที่เขียนข้อมูล (กติกา F7) |
| ขอบวันธุรกิจ | `app.bangkok_date(ts)` และ `app.bkk_ts(date)` — ไม่พึ่ง session TimeZone | ทุกที่ |

`app.clock()` = `app.settings['clock'].as_of` เมื่อ `app.settings['env'] <> 'prod'` มิฉะนั้น `now()` (CANONICAL ข้อ 1.2) · บน prod ต้องตั้ง `clock` เป็น `null`

### 2.6 การปิดบัง PII (masking)

| ชนิด | ค่าที่ API คืนโดยปริยาย | ค่าเต็มได้จาก |
|---|---|---|
| `crm.customer_contacts` | `value_masked` เท่านั้น (column grant ตัด `value_raw` `value_normalized` ออก) | `api.reveal_contact(contact_id, purpose)` |
| `crm.customer_addresses` | `district` · `province_code` · `value_masked` (`{อำเภอ} · {จังหวัด}`) | `api.reveal_address(address_id, purpose)` |
| `audit.audit_logs.before/after` | ค่าปิดบัง + `sha256` ที่ trigger เขียนไว้ (`{"masked":"081-XXX-1234","sha256":"…"}`) | ไม่มี (กู้ข้อมูลใช้ PITR) |
| `crm.customer_merges.snapshot` | ปิดบัง PII + sha256 ของ contact | ไม่มี |
| `audit.access_logs.search_hashes` | `sha256` ของค่า normalized (ไม่เก็บค่าจริง · ไม่ใส่ salt · CANONICAL ข้อ 19.4 ข้อ 6) | ไม่มี |

รูปแบบค่าปิดบัง (CANONICAL ข้อ 6.4): PHONE มือถือ `081-XXX-5678` · PHONE บ้าน `02-XXX-4567` · EMAIL `s***@example.com` · LINE_ID/FACEBOOK/INSTAGRAM/TIKTOK `so***` · LINE_USER_ID ไม่แสดง (`—`)

**กติกา UI:** ห้ามฝังค่าเต็มใน HTML ตอนโหลดหน้า · ปุ่ม "แสดง/โทร/คัดลอก/เปิด LINE" ต้องเรียก `api.reveal_contact` ก่อนเสมอ · ค่าที่เปิดซ่อนกลับอัตโนมัติใน **30 วินาที** (`auto_hide_seconds` ในผลลัพธ์) **[รอยืนยัน]**

### 2.7 อัตราจำกัด (rate limit)

ตัวนับอยู่ที่ `app.rate_limit_counters(staff_id, counter_key, window_start)` · เพดานอ่านจาก `app.settings` **ด้วยคีย์ชื่อเดียวกับตัวนับ** · หน้าต่างเวลา = ชั่วโมงปฏิทิน (`date_trunc('hour', now())`) หรือวันธุรกิจ Asia/Bangkok เมื่อเป็นตัวนับรายวัน

| `counter_key` | ค่าเริ่มต้น | ใช้ใน | เกินแล้วเกิดอะไร |
|---|---:|---|---|
| `security.reveal_per_hour` | 30 | `api.reveal_contact` · `api.reveal_address` | **ไม่ raise** — คืน `{"ok":false,"code":"REVEAL_LIMIT_EXCEEDED"}` + แจ้ง `REVEAL_LIMIT_EXCEEDED` ถึง BUSINESS_ADMIN (CANONICAL ข้อ 6.4) |
| `security.search_per_hour` | 60 | `api.search_customers` · `api.find_customer_candidates` | ไม่ raise — คืน `{"ok":false,"code":"SEARCH_LIMIT_EXCEEDED"}` + แจ้ง BUSINESS_ADMIN |
| `security.search_miss_per_hour` | 20 | เมื่อค้นด้วย "ตัวระบุเต็ม" แล้วไม่พบผล | `app.rate_limit_block(...)` **บล็อก 1 ชั่วโมง** + แจ้ง `SEARCH_LIMIT_EXCEEDED` |
| `security.link_per_day` | 10 | `api.link_customer_to_branch` | **ผูกสำเร็จตามปกติ** + แจ้ง `LINK_LIMIT_EXCEEDED` ถึง BRANCH_MANAGER ของสาขานั้น |
| `security.customer_view_per_hour` | 100 | `api.get_customer_360` | **แจ้งเท่านั้น ไม่บล็อก** — `CUSTOMER_VIEW_LIMIT_EXCEEDED` ถึง BUSINESS_ADMIN |
| `dsr.anonymize_per_day` | 20 | `api.anonymize_customer` | **ปฏิเสธ 42501** "ทำข้อมูลนิรนามครบ N รายของวันนี้แล้ว" |
| `security.login_ip_per_15min` | 20 | Edge Function `staff-code-login` · Server Action ล็อกอิน (ต่อ IP) | หน่วงเวลา/ปฏิเสธ · ถูกล็อก > 3 ครั้ง/วัน → `LOCKOUT_REPEATED` |

เพดานที่ไม่ได้อยู่ในตัวนับกลาง: `export.limits[role].per_day` (นับจากแถว `audit.export_requests` ของวันนั้น **รวมคำขอที่ถูกปฏิเสธ**) · `export.max_downloads` = 3 · `export.link_ttl_hours` = 24

`app.rate_limit_hit(key, per_day)` คืน `{"allowed": bool, "hit_count": n, "limit": n, "blocked_until": ts|null}` — **ตัวนับเพิ่มก่อนตัดสินเสมอ** (คำเรียกที่ถูกปฏิเสธก็นับ)

### 2.8 แบบจำลองข้อผิดพลาด

#### 2.8.1 SQLSTATE → HTTP → ข้อความไทย → พฤติกรรม UI

| SQLSTATE | HTTP (PostgREST) | เกิดจาก | ข้อความไทยที่แสดง | พฤติกรรม UI |
|---|---|---|---|---|
| `42501` | **403** (401 เมื่อไม่มี JWT) | RPC ปฏิเสธ (`app.api_denied` / `app.transition_denied`) · GRANT ขาด · RLS `WITH CHECK` ไม่ผ่าน | ใช้ `HINT` ของ `JCRM-Tnn` ถ้ามี มิฉะนั้นใช้ `MESSAGE` ของ RPC (ข้อความไทยอยู่แล้ว) · fallback "คุณไม่มีสิทธิ์ทำรายการนี้" | toast danger · ไม่ปิด dialog · ไม่ล้างฟอร์ม |
| `22023` | **400** | `app.api_invalid(msg)` — ข้อมูลที่ส่งมาไม่ถูกต้อง/ไม่ครบ | `MESSAGE` (ไทย) | ชี้ไปยังช่องที่ผิดในฟอร์ม · inline error |
| `P0001` | **400** | `app.api_invalid(msg, 'P0001')` — ผิดกติกาธุรกิจ (สถานะไม่ถูก · ลำดับงานไม่ถูก) | `MESSAGE` (ไทย) | toast warning + คำอธิบายในบริบท (เช่น ปุ่มถูกปิด) |
| `23514` | **400** | CHECK ของตาราง (เมื่อ PATCH/POST ตรง) | ตามชื่อ constraint · ข้อ 2.8.4 | inline error ที่ช่องที่เกี่ยว |
| `23505` | **409** | unique (เช่น `transaction_refs_source_external_uq`) | ข้อ 2.8.4 | inline error "ค่านี้ถูกใช้แล้ว" |
| `23503` | **409** | foreign key (อ้างรหัสที่ไม่มี/ปิดใช้งาน) | "ค่าอ้างอิงไม่ถูกต้อง" | inline error ที่ช่องเลือก |
| `22P02` | **400** | รูปแบบ uuid/ตัวเลข/เวลาไม่ถูกต้อง | "รูปแบบข้อมูลไม่ถูกต้อง" | inline error |
| `42883` / `PGRST202` | **404** | เรียกฟังก์ชันผิดชื่อหรือผิดลายเซ็น | "ระบบขัดข้อง" + `request_id` | บันทึก error · ไม่โทษผู้ใช้ |
| 200 + `[]` จาก PATCH/DELETE | **200** | RLS `USING` ไม่ผ่าน (มองไม่เห็นแถว) หรือแถวถูกเปลี่ยนไปแล้ว | "ไม่พบรายการ หรือคุณไม่มีสิทธิ์" | **ต้องตรวจจำนวนแถวที่คืนเสมอ** · refresh รายการ |
| 5xx | 5xx | ระบบ | "ระบบขัดข้อง ลองใหม่อีกครั้ง" + `request_id` | toast danger + ปุ่มลองใหม่ |

**กติกาการไม่เปิดเผย (F5):** RPC ที่หาแถวไม่พบ **และ** แถวที่มีอยู่แต่ผู้เรียกไม่มีสิทธิ์ ต้องให้ผลเดียวกัน (`42501` ข้อความ "ไม่พบ…") เพื่อไม่ให้ผู้เรียกอนุมานได้ว่ามีแถวอยู่

#### 2.8.2 แคตตาล็อก `JCRM-Tnn` (`app.transition_denied`)

ใช้โดยทั้ง trigger `app.enforce_row_transition` และ RPC ที่ความหมายตรงกัน · ทุกตัวเป็น `SQLSTATE 42501` · `MESSAGE = 'JCRM-Tnn'` · `DETAIL` = เหตุผล (อังกฤษ สำหรับ log) · `HINT` = **ข้อความที่แสดงผู้ใช้ (ไทย)**

| รหัส | DETAIL (log) | HINT (แสดงผู้ใช้) |
|---|---|---|
| `T00` | no active staff for this session | บัญชีนี้ไม่ได้อยู่ในสถานะใช้งาน |
| `T01` | system column is not writable | ข้อมูลนี้ระบบกำหนด แก้ไขเองไม่ได้ |
| `T02` | customer record is not ACTIVE | ลูกค้ารายนี้ถูกรวมหรือทำเป็นข้อมูลนิรนามแล้ว |
| `T10` | assign permission required on current row | ต้องมีสิทธิ์มอบหมายรายการนี้ |
| `T11` | new owner is outside your assign scope | ผู้รับผิดชอบใหม่อยู่นอกขอบเขตที่คุณมอบหมายได้ |
| `T12` | new owner has no assignment in the row branch | ผู้รับผิดชอบที่เลือกไม่ได้สังกัดสาขาของรายการ |
| `T13` | owner, team or branch changes only via api.assign_owner | เปลี่ยนผู้รับผิดชอบหรือสาขาด้วยปุ่ม "มอบหมาย" เท่านั้น |
| `T14` | column is immutable | ข้อมูลช่องนี้เปลี่ยนไม่ได้หลังบันทึก |
| `T15` | assign permission required on destination branch | ต้องมีสิทธิ์มอบหมายทั้งสาขาต้นทางและปลายทาง |
| `T16` | owner is required for this record | ต้องเลือกผู้รับผิดชอบ |
| `T20` | queue claim may change status and owner only | รับคิวแล้วจึงแก้ไขรายละเอียดอื่น |
| `T21` | visit status change not allowed here | ปิดการให้บริการด้วยปุ่มบันทึกผล |
| `T22` | cancel window passed; team or branch scope required | เกิน 15 นาที ต้องให้หัวหน้าทีมหรือผู้จัดการยกเลิก |
| `T23` | closed visit is read-only | การให้บริการนี้ปิดแล้ว |
| `T24` | changing identified customer requires team or branch scope | ต้องให้หัวหน้าทีมหรือผู้จัดการเปลี่ยนลูกค้าของรายการนี้ |
| `T25` | changing visit owner requires team or branch scope | ต้องให้หัวหน้าทีมหรือผู้จัดการเปลี่ยนผู้รับ |
| `T26` | customer is not linked to the row branch | ลูกค้ารายนี้ยังไม่ผูกกับสาขาของรายการ · ผูกลูกค้าจากสาขาอื่นได้เฉพาะตอนรับลูกค้า |
| `T30` | stage transition not allowed | ย้ายขั้นนี้ไม่ได้ (เสนอราคา/รอตัดสินใจต้องมีใบเสนอราคาที่ส่งแล้ว · ย้อนเป็น "สนใจ" ไม่ได้) |
| `T31` | close permission required | ต้องมีสิทธิ์ปิดรายการนี้ |
| `T32` | reopen permission required or invalid target stage | ต้องมีสิทธิ์เปิดรายการที่ปิดแล้ว |
| `T33` | closed opportunity is read-only | เปิดรายการใหม่ก่อนแก้ไข |
| `T40` | lead status transition not allowed | เปลี่ยนสถานะนี้ไม่ได้ |
| `T41` | use api.convert_lead | ใช้ปุ่ม "แปลงเป็นโอกาสขาย" |
| `T42` | reopen permission required or invalid target status | ต้องมีสิทธิ์เปิด Lead ที่ปิดแล้ว |
| `T43` | closed lead is read-only | เปิด Lead ใหม่ก่อนแก้ไข |
| `T50` | sent quotation: only status may change | ส่งแล้ว แก้ได้เฉพาะสถานะ |
| `T51` | quotation status transition not allowed | เปลี่ยนสถานะใบเสนอราคานี้ไม่ได้ |
| `T52` | sent_channel_code is required | เลือกช่องทางที่ส่งใบเสนอราคา |
| `T60` | interaction older than 24 hours | แก้ไขได้ภายใน 24 ชม. หลังบันทึก |
| `T70` | task status transition not allowed | เปลี่ยนสถานะงานนี้ไม่ได้ |
| `T80` | owner other than yourself requires assign permission | สร้างรายการให้ผู้อื่นต้องมีสิทธิ์มอบหมาย |
| `T81` | initial status not allowed | สถานะเริ่มต้นไม่ถูกต้อง |
| `T90` | customer.assign required | ต้องมีสิทธิ์เปลี่ยนผู้ดูแลลูกค้า |

**วิธีใช้ใน Server Action:** ถ้า `error.message` ขึ้นต้นด้วย `JCRM-` ให้แสดง `error.hint` · มิฉะนั้นแสดง `error.message` (ข้อความของ RPC เป็นภาษาไทยอยู่แล้ว)

#### 2.8.3 ข้อความของ RPC ที่ไม่ใช้รหัส `JCRM-`

RPC ใช้ `app.api_denied(msg)` → `42501` และ `app.api_invalid(msg[, sqlstate])` → `22023` (ค่าเริ่มต้น) หรือ `P0001` · ข้อความเป็นภาษาไทยพร้อมแสดงผู้ใช้ และระบุไว้ครบในข้อ 3 รายฟังก์ชัน ตัวอย่างที่พบบ่อย:

| ข้อความ | SQLSTATE | เกิดที่ |
|---|---|---|
| `ไม่มีสิทธิ์ <permission> (ตรวจ MFA และบทบาทของคุณ)` | 42501 | `app.require_permission` ของทุก RPC ที่บังคับสิทธิ์เดียว |
| `ต้องกรอกชื่อ หรือชื่อเล่น อย่างน้อยหนึ่งช่อง` | 22023 | `api.quick_capture` |
| `ต้องติ๊ก "แจ้งประกาศความเป็นส่วนตัวให้ลูกค้าแล้ว"` | P0001 | `api.quick_capture` |
| `พบลูกค้าที่อาจซ้ำ ต้องเลือกเหตุผลก่อนสร้างลูกค้าใหม่` | P0001 | `api.quick_capture` (คะแนนสูงสุด ≥ 70) |
| `คำค้นต้องมีอย่างน้อย 3 ตัวอักษร` | 22023 | `api.search_customers` |
| `ต้องเลือกผลการให้บริการ` | 22023 | `api.close_visit` |
| `ผล UNRECORDED ระบบตั้งให้เท่านั้น (ข้อ 4.1)` | P0001 | `api.close_visit` |
| `คำขอนี้ตัดสินแล้ว` | P0001 | `api.decide_export` · `api.decide_role_grant` |
| `ผู้อนุมัติต้องไม่ใช่ผู้ขอ` | 42501 | `api.decide_export` |

#### 2.8.4 constraint → ข้อความ (สำหรับการเขียนตารางตรง)

| constraint | SQLSTATE | ข้อความไทย |
|---|---|---|
| `transaction_refs_source_external_uq` | 23505 | เลขอ้างอิงนี้ถูกผูกไว้แล้ว |
| `customer_tags_uq` | 23505 | ลูกค้ารายนี้มี Tag นี้อยู่แล้ว |
| `duplicate_decisions_customer_uq` | 23505 | ลูกค้ารายนี้มีรายการข้อมูลซ้ำอยู่แล้ว |
| `notifications_recipient_dedupe_uq` | 23505 | การแจ้งเตือนนี้ถูกส่งแล้ว (ระบบกันซ้ำ) |
| `campaigns_code_uq` · `tags` (code) | 23505 | รหัสนี้ถูกใช้แล้ว |
| `opportunities_stage_chk` | 23514 | ข้อมูลของขั้นนี้ไม่ครบ (ปิดการขายต้องมียอดขาย > 0 · ไม่สำเร็จต้องมีเหตุผล · ขั้นที่เปิดอยู่ต้องมีผู้รับผิดชอบและการติดตามถัดไป) |
| `leads_status_chk` | 23514 | ข้อมูลของสถานะนี้ไม่ครบ (แปลงแล้วต้องมีโอกาสขาย · ไม่สำเร็จต้องมีเหตุผล · สถานะที่เปิดอยู่ต้องมีการติดตามถัดไป) |
| `leads_lost_note_chk` · `opportunities_lost_note_chk` | 23514 | เหตุผล "อื่น ๆ" ต้องระบุหมายเหตุ |
| `visits_walk_in_interest_chk` | 23514 | visit หน้าร้านต้องระบุวัตถุประสงค์ |
| `visits_outcome_customer_chk` | 23514 | ผลนี้ต้องระบุลูกค้าก่อน |
| `visits_in_service_chk` · `visits_waiting_chk` · `visits_ended_chk` | 23514 | สถานะกับข้อมูลของ visit ไม่สอดคล้อง (ปิด visit ด้วย `api.close_visit`) |
| `visits_party_size_chk` | 23514 | จำนวนลูกค้าต้องอย่างน้อย 1 |
| `customer_notes_body_chk` | 23514 | โน้ตต้องมีข้อความและยาวไม่เกิน 2,000 ตัวอักษร |
| `opportunity_items_quantity_chk` · `quotation_items_quantity_chk` | 23514 | จำนวนต้องมากกว่า 0 |
| `opportunity_items_unit_price_chk` · `quotation_items_unit_price_chk` · `quotation_items_discount_chk` | 23514 | ราคา/ส่วนลดต้องไม่ติดลบ |
| `quotations_sent_chk` | 23514 | ใบเสนอราคาที่ส่งแล้วต้องมีช่องทางและวันที่ส่ง |
| `tasks_title_chk` | 23514 | ชื่องานต้องไม่ว่าง |
| `transaction_refs_imei_chk` | 23514 | IMEI ต้องเป็นตัวเลข 15 หลัก |
| `duplicate_decisions_score_chk` | 23514 | บันทึกข้อมูลซ้ำได้เฉพาะคะแนนตั้งแต่ 70 |
| `customer_consents_evidence_chk` | 23514 | ต้องระบุหลักฐานของความยินยอม |
| `data_subject_requests_verification_chk` | 23514 | ต้องระบุวิธียืนยันตัวตน |

**ข้อความพิเศษของ trigger `app.trg_guard_restricted_text`** (`P0001`): ข้อความอิสระที่มีเลข 13 หลักรูปแบบเลขบัตรประชาชนไทยที่ checksum ถูกต้อง จะถูกปฏิเสธ → UI แสดง **"ห้ามบันทึกเลขบัตรประชาชน รายได้ ข้อมูลสุขภาพหรือศาสนา"** (CANONICAL ข้อ 10.1)

#### 2.8.5 รหัสผลลัพธ์แบบ "ไม่ raise"

ใช้เมื่อ **ต้องให้ตัวนับและการแจ้งเตือนถูก commit** (ถ้า raise ทรานแซกชันจะ rollback แล้วตัวนับหาย)

| `code` | คืนโดย | ความหมาย · สิ่งที่ UI ทำ |
|---|---|---|
| `REVEAL_LIMIT_EXCEEDED` | `api.reveal_contact` · `api.reveal_address` | เปิดค่าเต็มเกินเกณฑ์ชั่วโมงนี้ → toast danger "เปิดดูข้อมูลติดต่อครบจำนวนที่กำหนดต่อชั่วโมงแล้ว" · ค่ายังปิดบัง |
| `SEARCH_LIMIT_EXCEEDED` | `api.search_customers` · `api.find_customer_candidates` | ค้นเกินเกณฑ์ → toast danger · แผงตรวจซ้ำแสดง "ระงับการตรวจสอบซ้ำชั่วคราว 1 ชั่วโมง ระบบจะตรวจข้อมูลซ้ำอีกครั้งตอนบันทึก" · **การบันทึกลูกค้าไม่ถูกบล็อก** |
| `EXPORT_ROW_LIMIT_EXCEEDED` | `api.request_export` (พร้อม `ok:false` · `status:"REJECTED"`) | เกินเพดานแถวต่อครั้ง → แถวคำขอถูกบันทึกเป็น `REJECTED` และ **นับครั้งต่อวัน** · dialog แสดง "เกินจำนวนแถวสูงสุดต่อครั้ง (N แถว)" |

### 2.9 การเรียกซ้ำ (idempotency)

- ไม่มี idempotency key ใน V1 · RPC ที่เขียนข้อมูลเป็น **at-most-once ต่อทรานแซกชัน** (ทุกตัวทำงานในทรานแซกชันเดียว ถ้าล้มจะ rollback ทั้งก้อน)
- การเรียกซ้ำที่ปลอดภัยโดยธรรมชาติ: `api.close_visit` (เรียกซ้ำในวันธุรกิจเดียวกัน = แก้ outcome) · `api.acknowledge_unrecorded_visit` (คืน `already_acknowledged: true`) · `api.activate_self` (คืน `already_active: true`) · `api.register_device` (upsert) · `api.link_customer_to_branch` (upsert `customer_branches`)
- การเรียกซ้ำที่ **สร้างแถวซ้ำ**: `api.quick_capture` (สร้างลูกค้าใหม่ทุกครั้ง) · `api.record_consent` (append-only ตามการออกแบบ) · `api.create_dsr` → UI ต้องปิดปุ่มระหว่างส่งและใช้ `revalidatePath` หลังสำเร็จ
- การแจ้งเตือนกันซ้ำด้วย `dedupe_key` + `UNIQUE(recipient_staff_id, dedupe_key)` → `ON CONFLICT DO NOTHING` (CANONICAL ข้อ 11.1)

---

## 3. RPC ของหน้าจอและ Edge Function (schema `api`)

### 3.0 กติการ่วมของทุกฟังก์ชันใน `api` และตารางรวม

| # | กติกา (rls-spec ข้อ 8.1 · CANONICAL ข้อ 9.6 · 19.1 ข้อ 2) |
|---|---|
| F1 | `SECURITY DEFINER` · owner `postgres` · `SET search_path = ''` · อ้างชื่อเต็ม `schema.object` เสมอ · volatility ตามข้อ 9.6 |
| F2 | บรรทัดแรกคือการตรวจสิทธิ์ (`app.require_staff()` หรือ `app.require_permission('<perm>')`) ยกเว้น `api.activate_self()` และ `api.svc_*` |
| F3 | `REVOKE ALL FROM PUBLIC` แล้ว `GRANT EXECUTE TO authenticated` · `api.svc_*` GRANT ให้ **`service_role` เท่านั้น** และบรรทัดแรกตรวจ `auth.role() = 'service_role'` |
| F4 | DEFINER ข้าม RLS และ `app.enforce_row_transition` → ฟังก์ชันตรวจซ้ำด้วย helper ข้อ 9.3 ให้ได้ผลเท่ากับ policy |
| F5 | ปฏิเสธด้วย `42501` · ไม่บอกว่ามีแถวอยู่แต่ไม่มีสิทธิ์ (ใช้ผลเดียวกับ "ไม่พบ") |
| F6 | ตั้ง `app.audit_reason` เมื่อมีเหตุผล · ข้อความเหตุผล **ห้ามมี PII** |
| F7 | เวลาในการตัดสินสิทธิ์ใช้ `now()` เสมอ · ตัวนับอัตราใช้ `app.rate_limit_hit` |
| F8 | `api.svc_*` ไม่รับ actor/staff_id จาก body · ตั้ง `app.actor_staff_id` จาก `sub` ของ JWT ที่ Edge Function verify แล้ว |

**หมายเหตุเรื่อง aal:** "ต้อง aal2" ไม่ได้ตรวจด้วยเงื่อนไขแยกในทุกฟังก์ชัน แต่มาจากกติกา CANONICAL ข้อ 8.0 ที่ helper บังคับให้:
(ก) assignment ของบทบาทที่ `requires_mfa = true` **ไม่ถูกนับ** เมื่อ `aal <> aal2` และ (ข) สิทธิ์ที่ `role_permissions.requires_aal2 = true` ไม่ถูกนับเมื่อไม่ใช่ aal2
→ ผู้ใช้ aal1 ที่ถือบทบาทซึ่งต้อง MFA จะ "ไม่มีสิทธิ์" ทุกอย่าง (`42501`) · สิทธิ์ที่ติด 🔐 (`customer.merge` `customer.export` `role.assign` `role.decide` `user.disable` `dsr.manage` `master_data.manage` `settings.*` `customer.anonymize` `export.approve` `integration.manage`) ใช้ได้เฉพาะ aal2
ฟังก์ชันที่ตรวจ `app.is_aal2()` **เพิ่มอีกชั้นโดยตรง**: `api.request_export` · `api.record_export_download` · `api.svc_reset_mfa_authorize`

#### ตารางรวม 58 ฟังก์ชัน

| ฟังก์ชัน | vol. | สิทธิ์ที่ต้องมี | หน้าจอหลัก | ข้อ |
|---|:--:|---|---|---|
| `quick_capture(p)` | V | `customer.create` (+`visit.create` เมื่อเปิด visit · +`customer.consent.manage` เมื่อติ๊ก MARKETING) | 04 · 07 | 3.1.1 |
| `find_customer_candidates(...)` | V | `customer.create` | 04 | 3.1.2 |
| `search_customers(p_term)` | V | ผู้ใช้ ACTIVE | ทุกหน้า (แถบบน) · 03 | 3.1.3 |
| `link_customer_to_branch(...)` | V | `visit.update` ในสาขาของ visit | 04 · 07 | 3.1.4 |
| `get_customer_360(p_customer_id)` | V | `customer.read` บนลูกค้ารายนั้น | 05 | 3.2.1 |
| `reveal_contact(...)` · `reveal_address(...)` | V | `customer.pii.reveal` บนลูกค้า | 03 · 05 | 3.2.2 |
| `save_contact(p)` · `save_address(p)` | V | `customer.update` บนลูกค้า | 05 | 3.2.3 |
| `record_consent(p)` | V | `customer.consent.manage` บนลูกค้า | 05 · 17 | 3.2.4 |
| `merge_customers(...)` | V | `customer.merge` 🔐 บนทั้งสองราย | 05 · 12 | 3.3.1 |
| `decide_duplicate(...)` | V | `customer.merge` 🔐 บนทั้งสองราย | 12 | 3.3.2 |
| `open_visit(p)` | V | `visit.create` ในสาขา | 05 · 07 | 3.4.1 |
| `close_visit(...)` | V | `visit.update` บน visit | 07 | 3.4.2 |
| `acknowledge_unrecorded_visit(...)` | V | `visit.update` บน visit | 12 | 3.4.3 |
| `convert_lead(...)` | V | `lead.update` **และ** `opportunity.create` บน lead | 11 · 05 | 3.4.4 |
| `assign_owner(...)` | V | `*.assign` / `customer.assign` / `visit.update` | 03 · 05 · 06 · 08 · 11 | 3.4.5 |
| `get_kpis(...)` | S | `dashboard.view` (+`report.staff_performance` เมื่อ `group_by='STAFF'`) | 02 · 09 | 3.5.1 |
| `get_report(...)` | S | `report.view` (+`report.staff_performance`) | 09 · 12 | 3.5.2 |
| `list_data_quality_issues(...)` | S | `data_quality.view` | 12 | 3.5.3 |
| `record_report_export(...)` | V | `report.export` | 09 | 3.5.4 |
| `request_export(p)` | V | `customer.export` 🔐 ในบทบาทที่ยื่น | 03 · 15 | 3.6.1 |
| `decide_export(...)` | V | `export.approve` 🔐 | 15 | 3.6.2 |
| `record_export_download(...)` | V | ผู้ขอ · aal2 | 15 | 3.6.3 |
| `list_export_requests(p)` | S | `customer.export` หรือ `export.approve` | 15 | 3.6.4 |
| `search_audit(p)` | S | `audit.read` | 16 | 3.7.1 |
| `get_entity_history(...)` | S | `audit.read` หรือ `customer.update` บนลูกค้า | 05 · 16 | 3.7.2 |
| `search_security_log(p)` | S | `security_log.read` | 16 | 3.7.3 |
| `get_my_access()` | S | ผู้ใช้ที่เข้าสู่ระบบ | ทุกหน้า | 3.8.1 |
| `can_assign_role(...)` | S | – (คืน boolean) | 13 | 3.8.2 |
| `assign_role(...)` · `revoke_role(...)` | V | `role.assign` 🔐 | 13 | 3.8.3 |
| `request_role_grant(...)` | V | `role.request` | 13 | 3.8.4 |
| `decide_role_grant(...)` | V | `role.decide` 🔐 | 13 | 3.8.5 |
| `list_role_grant_requests(p)` | S | `role.decide` / `role.request` / `user.read` | 13 | 3.8.6 |
| `activate_self()` | V | บัญชี INVITED ของตนเอง | (flow คำเชิญ) | 3.8.7 |
| `list_staff(p)` | S | `user.read` | 13 | 3.8.8 |
| `update_staff(...)` | V | `user.update` | 13 | 3.8.9 |
| `disable_staff(...)` | V | `user.disable` 🔐 | 13 | 3.8.10 |
| `save_team(p)` · `set_team_member(...)` | V | `team.manage` | 13 | 3.8.11 |
| `register_device(...)` | V | `user.update` scope B ของสาขานั้น | 18 | 3.8.12 |
| `get_settings()` · `update_setting(...)` | S / V | `settings.business` 🔐 / `settings.system` 🔐 | 18 | 3.8.13 |
| `create_dsr(p)` | V | `dsr.create` | 05 · 17 | 3.9.1 |
| `list_dsr(p)` | S | `dsr.manage` หรือ `dsr.create` (ของตน) | 17 | 3.9.2 |
| `update_dsr(...)` | V | `dsr.manage` 🔐 | 17 | 3.9.3 |
| `build_dsr_package(...)` | V | `dsr.manage` 🔐 | 17 | 3.9.4 |
| `anonymize_customer(...)` | V | `customer.anonymize` 🔐 | 17 | 3.9.5 |
| `set_legal_hold(...)` | V | `dsr.manage` 🔐 | 05 · 17 | 3.9.6 |
| `list_integration_logs(p)` | S | `integration.manage` 🔐 | 18 | 3.9.7 |
| `svc_*` (7 ตัว) | – | `service_role` เท่านั้น | (Edge Function) | 3.10 |

`vol.` : **V** = VOLATILE · **S** = STABLE

---

### 3.1 ลูกค้า: สร้าง · ตรวจซ้ำ · ค้นหา · ผูกสาขา

#### 3.1.1 `api.quick_capture(p jsonb) → jsonb`

**เส้นทางเดียวของการสร้างลูกค้า** (CANONICAL ข้อ 6.2) · DEFINER · VOLATILE · GRANT → `authenticated`

**สิทธิ์:** `customer.create` ในสาขา `p.branch_id` (scope OWN ขึ้นไป) · เพิ่ม `visit.create` เมื่อจะเปิด visit ใหม่ · เพิ่ม `customer.consent.manage` เมื่อ `marketing.granted = true` · aal1 ใช้ได้ (บทบาท STAFF ไม่ต้อง MFA)

**พารามิเตอร์ (คีย์ใน `p`)**

| คีย์ | ชนิด | บังคับ | ค่า/การตรวจ |
|---|---|:--:|---|
| `branch_id` | uuid | ✓ | ต้องอยู่ใน `app.scope_branch_ids('customer.create','OWN')` |
| `first_name` · `nickname` | text | ✓ (อย่างน้อยหนึ่ง) | ต้องมีอย่างน้อยหนึ่งช่องที่ไม่ว่าง |
| `last_name` | text | – | |
| `customer_type` | text | – | `INDIVIDUAL` (ค่าเริ่มต้น) · `BUSINESS` |
| `channel_code` | text | ✓ | `ref.channels` ที่ `is_active` |
| `source_code` | text | – | `ref.sources` |
| `province_code` | text | – | `ref.provinces` (`TH-10` …) |
| `interest_code` | text | ✓ | `ref.interest_types` ที่ `is_active` |
| `product_type_code` · `product_model` | text | – | ใช้กับ lead ที่สร้างอัตโนมัติ |
| `privacy_notice_ack` | boolean | ✓ | ต้อง `true` มิฉะนั้น `P0001` |
| `privacy_captured_via` | text | – | `crm.consent_capture_via` · ค่าเริ่มต้น `STAFF_FORM` เมื่อ `WALK_IN` มิฉะนั้น `LINK_SENT` |
| `phone` · `line_id` · `email` | text | – | ทางลัดของฟอร์ม → ต่อท้าย `contacts` เป็น `is_primary` |
| `contacts[]` | array | ✓ (รวมทางลัดแล้ว ≥ 1) | `{contact_type, value, is_primary}` · `contact_type` ∈ `crm.contact_type` · ค่าที่ normalize ไม่ได้ → `22023` |
| `marketing` | object | – | `{granted: bool, age_ack: bool, channels: ["LINE","SMS","PHONE","EMAIL"]}` · `granted` ต้องมาคู่กับ `age_ack` |
| `open_visit` | boolean | – | ค่าเริ่มต้น = `visit_id IS NOT NULL` |
| `visit_mode` | text | – | `QUEUE` (→ `WAITING`) · `SERVICE` (ค่าเริ่มต้น → `IN_SERVICE`) — มีผลเฉพาะ `WALK_IN` |
| `visit_id` | uuid | – | visit ที่เปิดอยู่ในสาขาเดียวกันและยังไม่มีลูกค้า (หน้า 07 → 04) |
| `party_size` | int | – | ค่าเริ่มต้น 1 |
| `interaction_type_code` | text | – | ค่าเริ่มต้น `VISIT` (WALK_IN) · `INQUIRY` (อื่น) |
| `summary` | text | – | สรุปของ interaction ต้นทาง |
| `note` · `note_pinned` | text · boolean | – | โน้ตแรกใน `crm.customer_notes` |
| `duplicate_override_reason_code` | text | เงื่อนไข | **บังคับเมื่อคะแนนผู้สมัครซ้ำสูงสุด ≥ 70** · `ref.duplicate_override_reasons` |
| `duplicate_override_note` | text | – | บังคับตาม CHECK เมื่อเหตุผลเป็น `OTHER` |

**กติกาเพิ่มเติม:** เมื่อ `channel_code ∈ {WALK_IN, PHONE}` ต้องมี contact ชนิด `PHONE` (CANONICAL ข้อ 6.2)

**ผลลัพธ์**

```jsonc
{ "ok": true, "customer_id": "<uuid>", "customer_no": "CUS-2026-006853",
  "visit_id": "<uuid>|null", "visit_no": "V-JP1-260911-008|null", "queue_no": 5,
  "interaction_id": "<uuid>|null", "lead_id": "<uuid>|null", "lead_no": "LD-2026-007546|null",
  "duplicate_decision_id": "<uuid>|null",
  "candidates": [ { "customer_id": "...", "customer_no": "...", "display_name": "...",
                    "value_masked": "081-XXX-5678", "lifecycle_stage": "REPEAT",
                    "score": 100, "reasons": ["เบอร์โทรตรงกัน"], "in_scope": true, "can_view": true } ] }
```

**ผลข้างเคียงในทรานแซกชันเดียว**

1. `crm.customers` (`created_via = 'QUICK_CAPTURE'` · `first_seen_at = least(now(), visits.started_at)` · `owner_staff_id` = ผู้บันทึก) → audit `CUSTOMER_CREATED`
2. `crm.customer_branches` แถว `linked_via = 'CREATED'`
3. `crm.customer_contacts` ทุกรายการ (normalize + mask ในฐานข้อมูล · `is_valid` ของ PHONE จาก `app.is_valid_thai_phone`)
4. `crm.customer_consents` `PRIVACY_NOTICE` `GRANTED` (+ `MARKETING` เมื่อติ๊ก · `evidence` มีข้อความยืนยันอายุตาม CANONICAL ข้อ 19.4 ข้อ 3) → audit `CONSENT_RECORDED`
5. visit: ผูก `visit_id` ที่ส่งมา **หรือ** เปิดใหม่ (`WAITING` เมื่อ `WALK_IN`+`QUEUE` · มิฉะนั้น `IN_SERVICE` พร้อม `owner_staff_id` = ผู้บันทึก) · เลข `visit_no`/`queue_no` จาก trigger ตัวนับ
6. interaction ต้นทาง `is_visit_root = true` `direction = 'INBOUND'` (เมื่อมี visit และยังไม่มีต้นทาง)
7. lead อัตโนมัติเมื่อ `ref.interest_types.creates_lead = true` — `status` ที่ INSERT เป็น `NEW` แล้ว **trigger `app.trg_lead_initial_status` (0009) เลื่อนเป็น `CONTACTED` + `first_contacted_at = created_at` เมื่อ `ref.channels.is_live` เป็นจริง** (WALK_IN · PHONE) ตาม CANONICAL ข้อ 4.3 · ค่าเริ่มต้น `priority_code='NORMAL'` · `next_action='ติดต่อกลับลูกค้า'` · `next_action_type_code='CALL'` · `next_action_at = now() + 30 นาที` **[รอยืนยัน]** · trigger สร้าง task `is_next_action`
8. โน้ตแรก (ถ้ามี) → trigger ปรับ `note_summary` เมื่อปักหมุด
9. `crm.duplicate_decisions` สถานะ `PENDING` เมื่อคะแนนสูงสุด ≥ 70
10. trigger แคช: `first_seen_at` · `last_activity_at` · `lifecycle_stage` · `has_new_lead`

**ข้อผิดพลาด**

| เงื่อนไข | SQLSTATE | ข้อความ |
|---|---|---|
| ไม่มี `customer.create` ในสาขา | 42501 | ไม่มีสิทธิ์สร้างลูกค้าในสาขานี้ |
| ไม่มีชื่อและชื่อเล่น | 22023 | ต้องกรอกชื่อ หรือชื่อเล่น อย่างน้อยหนึ่งช่อง |
| ช่องทาง/ความสนใจไม่ถูกต้อง | 22023 | ต้องเลือกช่องทางแรกที่ติดต่อ · ต้องเลือกความสนใจ |
| ไม่ติ๊กประกาศความเป็นส่วนตัว | P0001 | ต้องติ๊ก "แจ้งประกาศความเป็นส่วนตัวให้ลูกค้าแล้ว" |
| ไม่มีช่องทางติดต่อ | 22023 | ต้องมีช่องทางติดต่ออย่างน้อย 1 รายการ |
| `WALK_IN`/`PHONE` แต่ไม่มีเบอร์ | 22023 | ช่องทางแรกเป็น Walk-in หรือโทรศัพท์ ต้องกรอกเบอร์โทร |
| ติ๊ก MARKETING โดยไม่มีสิทธิ์ | 42501 | ไม่มีสิทธิ์บันทึกความยินยอมในสาขานี้ |
| ติ๊ก MARKETING แต่ไม่ติ๊กอายุ | P0001 | ต้องติ๊ก "ลูกค้าอายุ 20 ปีขึ้นไป หรือผู้ใช้อำนาจปกครองยินยอม" |
| `visit_id` ใช้ไม่ได้ (คนละสาขา/ปิดแล้ว) | 42501 | visit นี้ใช้ผูกลูกค้าไม่ได้ |
| `visit_id` มีลูกค้าแล้ว | P0001 | visit นี้ระบุลูกค้าแล้ว |
| จะเปิด visit ใหม่โดยไม่มี `visit.create` | 42501 | ไม่มีสิทธิ์เปิด visit ในสาขานี้ |
| คะแนนซ้ำ ≥ 70 แต่ไม่ส่งเหตุผล | P0001 | พบลูกค้าที่อาจซ้ำ ต้องเลือกเหตุผลก่อนสร้างลูกค้าใหม่ |
| ค่าช่องทางติดต่อ normalize ไม่ได้ | 22023 | ช่องทางติดต่อไม่ถูกต้อง: `{ชนิด}` |

**ตัวอย่าง** — การสร้างลูกค้าที่ CANONICAL ข้อ 13.14 ตรึงไว้: คุณคิม (`ST-0046` · STAFF@JP1) สร้าง `CUS-2026-006633` "ณัฐพล สุขใจ" เมื่อ 3 ก.ย. 2569 ทั้งที่เบอร์ตรงกับ `CUS-2026-002118` "ณัฐพร สุขใจ" (คะแนน 100) โดยเลือกเหตุผล `FAMILY_SHARED_PHONE`

```jsonc
// POST /rest/v1/rpc/quick_capture   (Content-Profile: api)
{ "p": {
    "branch_id": "<uuid:JP1>", "channel_code": "WALK_IN", "interest_code": "BUY",
    "first_name": "ณัฐพล", "last_name": "สุขใจ",
    "phone": "<เบอร์เดียวกับ CUS-2026-002118>",
    "privacy_notice_ack": true,
    "duplicate_override_reason_code": "FAMILY_SHARED_PHONE",
    "open_visit": true, "visit_mode": "SERVICE" } }
```

```jsonc
{ "ok": true,
  "customer_id": "<uuid:CUS-2026-006633>", "customer_no": "CUS-2026-006633",
  "visit_id": "<uuid>", "visit_no": "V-JP1-260903-0NN", "queue_no": null,
  "interaction_id": "<uuid>", "lead_id": "<uuid>", "lead_no": "LD-2026-00NNNN",
  "duplicate_decision_id": "<uuid>",
  "candidates": [ { "customer_id": "<uuid:CUS-2026-002118>",
                    "customer_no": "CUS-2026-002118", "display_name": "ณัฐพร สุขใจ",
                    "value_masked": "<เบอร์ปิดบัง>", "lifecycle_stage": "<ตามข้อมูลจริง>",
                    "score": 100, "reasons": ["เบอร์โทรตรงกัน"],
                    "in_scope": true, "can_view": true } ] }
```

> ถ้าไม่ส่ง `duplicate_override_reason_code` คำเรียกนี้จะถูกปฏิเสธด้วย `P0001 พบลูกค้าที่อาจซ้ำ ต้องเลือกเหตุผลก่อนสร้างลูกค้าใหม่` — แถว `crm.duplicate_decisions` ที่เกิดขึ้นคือ 1 ใน 16 รายการ `DUPLICATE_SUSPECTED` ของ CANONICAL ข้อ 13.12
>
> **โหมด "รับเข้าคิว" (หน้า 07):** ส่ง `"visit_mode": "QUEUE"` เพิ่ม → visit เป็น `WAITING` และผลลัพธ์มี `queue_no` (ตัวถัดไปของ `QUEUE:{branch}:{YYYYMMDD}`) → UI toast "รับเข้าคิวแล้ว · คิว 005" แล้วกลับหน้า 07
> **โหมด "เพิ่มลูกค้า" (หน้า 03):** ไม่ส่ง `open_visit` → `visit_id` `visit_no` `queue_no` `interaction_id` เป็น `null` ทั้งหมด → ไปหน้า 05 `?c={customer_no}`

#### 3.1.2 `api.find_customer_candidates(p_visit_id uuid, p_phone text, p_line_id text, p_email text, p_first_name text DEFAULT NULL, p_last_name text DEFAULT NULL) → jsonb`

ตรวจซ้ำก่อนสร้างลูกค้า (CANONICAL ข้อ 6.5) · DEFINER · VOLATILE (เขียน access log + ตัวนับ)

**สิทธิ์:** ต้องมี `customer.create` อย่างน้อยหนึ่งสาขา · ถ้าส่ง `p_visit_id` ต้องมี `visit.update` ในสาขาของ visit

**พารามิเตอร์**

| ชื่อ | ชนิด | บังคับ | การตรวจ |
|---|---|:--:|---|
| `p_visit_id` | uuid | – | visit สถานะ `WAITING`/`IN_SERVICE` · สาขา ∈ `scope_branch_ids('visit.update','OWN')` · `created_at ≥ now() − 4 ชม.` **[รอยืนยัน]** · สาขาของ visit ถูกใช้เป็นสาขาอ้างอิงของกฎคะแนน 40 |
| `p_phone` · `p_line_id` · `p_email` | text | ✓ อย่างน้อย 1 | **ส่งแต่ชื่ออย่างเดียวไม่ได้** |
| `p_first_name` · `p_last_name` | text | – | ใช้กับกฎคะแนน 70 และ 40 |

**กฎคะแนน (`app.candidate_scores` · ค้นทั้งองค์กร · เฉพาะลูกค้า `ACTIVE`)**

| กฎ | คะแนน | เหตุผลที่คืน |
|---|---:|---|
| เบอร์ (normalized) ตรง | 100 | `เบอร์โทรตรงกัน` |
| LINE ID หรือ LINE userId ตรง | 100 | `LINE ID ตรงกัน` |
| อีเมลตรง | 90 | `อีเมลตรงกัน` |
| ชื่อ+นามสกุลตรง และเบอร์ 4 ตัวท้ายตรง | 70 | `ชื่อและนามสกุลตรงกัน + เบอร์ 4 ตัวท้ายตรงกัน` |
| `similarity(name_search, ชื่อที่กรอก) ≥ 0.6` และ `first_branch_id` = สาขาอ้างอิง | 40 | `ชื่อคล้าย + สาขาแรกเดียวกัน` |

คืน **คะแนนสูงสุดต่อลูกค้า 1 แถว** เรียง `score DESC, customer_id`

**ผลลัพธ์**

```jsonc
{ "ok": true, "count": 2, "candidates": [ /* การ์ด */ ] }
{ "ok": false, "code": "SEARCH_LIMIT_EXCEEDED", "count": 0, "candidates": [] }
```

การ์ด **ในขอบเขต** (`app.can_access_customer('customer.read', id)`): `customer_id` `customer_no` `display_name` `value_masked` `lifecycle_stage` `score` `reasons[]` `in_scope:true` `can_view:true`
การ์ด **นอกขอบเขต**: `customer_id` `customer_no` `display_name` (ชื่อ + นามสกุลย่อ `"สมชาย ใ."`) · `value_masked` **เฉพาะเมื่อตรงด้วยเบอร์** · `score` `reasons[]` `in_scope:false` `can_view:false` — **ไม่คืน** lifecycle สาขา หรือวันที่ติดต่อ

**ผลข้างเคียง:** ตัวนับ `security.search_per_hour` (+ `security.search_miss_per_hour` เมื่อไม่พบผล → บล็อก 1 ชม. + แจ้ง `SEARCH_LIMIT_EXCEEDED` ถึง BUSINESS_ADMIN) · `audit.access_logs` `CUSTOMER_CANDIDATE_SEARCH` (เก็บ `sha256` ของค่า normalized + `detail.candidate_ids` ซึ่ง `api.link_customer_to_branch` ใช้ตรวจย้อน 30 นาที)

**ข้อผิดพลาด:** ไม่มี `customer.create` → `42501 ไม่มีสิทธิ์สร้างลูกค้า` · ไม่ส่งตัวระบุ → `22023 ต้องส่งตัวระบุเต็มอย่างน้อย 1 อย่าง (เบอร์โทร · LINE ID · อีเมล)` · visit ใช้ไม่ได้ → `42501 visit นี้ใช้ตรวจซ้ำไม่ได้`

**ตัวอย่าง** — หน้า 04 ตาม CANONICAL ข้อ 13.14 (กรอก `081-234-5678` + "สมชาย ใจดี")

```jsonc
{ "p_visit_id": null, "p_phone": "081-234-5678", "p_line_id": null, "p_email": null,
  "p_first_name": "สมชาย", "p_last_name": "ใจดี" }
```

```jsonc
{ "ok": true, "count": 2, "candidates": [
  { "customer_id": "<uuid:CUS-2026-000297>", "customer_no": "CUS-2026-000297",
    "display_name": "สมชาย ใจดี", "value_masked": "081-XXX-5678",
    "lifecycle_stage": "REPEAT", "score": 100, "reasons": ["เบอร์โทรตรงกัน"],
    "in_scope": true, "can_view": true },
  { "customer_id": "<uuid:CUS-2026-004410>", "customer_no": "CUS-2026-004410",
    "display_name": "สมชาย ใจดี", "value_masked": null,
    "lifecycle_stage": "OPPORTUNITY", "score": 40,
    "reasons": ["ชื่อคล้าย + สาขาแรกเดียวกัน"], "in_scope": true, "can_view": true } ] }
```

#### 3.1.3 `api.search_customers(p_term text) → jsonb`

ค้นหาทั่วไปของแถบบนและหน้า 03 (CANONICAL ข้อ 6.5 · 14.3) · DEFINER · VOLATILE

**สิทธิ์:** ผู้ใช้ ACTIVE (ไม่ต้องมี permission เฉพาะ — ผลถูกกรองด้วยสิทธิ์อ่านของแต่ละกลุ่ม) · แถบค้นหาซ่อนสำหรับ MARKETING และ SYSTEM_ADMIN (UI)

**พารามิเตอร์:** `p_term` text ✓ · **ยาวอย่างน้อย 3 ตัวอักษร**

**กติกาการจับคู่**

| ประเภทคำค้น | กติกา |
|---|---|
| เบอร์ (`^[0-9+(). -]+$`) · อีเมล (`@`) · LINE ID | **ตรงทั้งค่ากับค่า normalized เท่านั้น** (ห้าม LIKE/prefix/trigram บนค่า contact) |
| `customer_no` `LD-` `OP-` `QT-` | ตรงทั้งค่า (`upper(term)`) |
| IMEI | `^[0-9]{15}$` ตรงทั้งค่ากับ `transaction_refs.device_imei` |
| เลขธุรกรรม | ตรงทั้งค่ากับ `transaction_refs.external_no` |
| ชื่อ | trigram บน `name_search` (`similarity ≥ 0.3`) |

**ผลลัพธ์**

```jsonc
{ "ok": true, "count": 3, "groups": {
    "customers":    [ { "customer_id","customer_no","display_name","lifecycle_stage","record_status",
                        "value_masked","last_activity_at","last_channel_code" } ],   // ≤ 20 ราย
    "leads":        [ { "lead_id","lead_no","customer_id","status","branch_id" } ],
    "opportunities":[ { "opportunity_id","opportunity_no","customer_id","stage","branch_id" } ],
    "quotations":   [ { "quotation_id","quotation_no","customer_id","status","branch_id" } ],
    "transactions": [ { "transaction_ref_id","external_no","customer_id","transaction_type_code","branch_id" } ] } }
```

- ลูกค้า: เฉพาะ `app.readable_customer_ids()` · เรียงรายการที่ตรงด้วย contact ขึ้นก่อน แล้วตาม `customer_no`
- lead/opportunity/quotation/ธุรกรรม: `app.can_access_record('<x>.read', …)` **หรือ** อ่านลูกค้ารายนั้นได้ (read-through)
- ค่า contact ที่คืนเป็น `value_masked` เสมอ

**ผลข้างเคียง:** ตัวนับ `security.search_per_hour` · `security.search_miss_per_hour` (เฉพาะเมื่อค้นด้วย "ตัวระบุเต็ม" = เบอร์/อีเมล/เลขอ้างอิง/IMEI แล้วไม่พบผลใด) · `audit.access_logs` `CUSTOMER_SEARCH` (เก็บเฉพาะ sha256 และจำนวนผล)

**ข้อผิดพลาด:** สั้นกว่า 3 ตัวอักษร → `22023 คำค้นต้องมีอย่างน้อย 3 ตัวอักษร` · เกินอัตรา → `{"ok":false,"code":"SEARCH_LIMIT_EXCEEDED","groups":{}}`

**ตัวอย่าง**

```jsonc
{ "p_term": "081-234-5678" }
```

```jsonc
{ "ok": true, "count": 1, "groups": {
  "customers": [ { "customer_id": "<uuid:CUS-2026-000297>", "customer_no": "CUS-2026-000297",
                   "display_name": "สมชาย ใจดี", "lifecycle_stage": "REPEAT",
                   "record_status": "ACTIVE", "value_masked": "081-XXX-5678",
                   "last_activity_at": "2026-09-11T03:24:00+00:00", "last_channel_code": "LINE" } ],
  "leads": [], "opportunities": [], "quotations": [], "transactions": [] } }
```

#### 3.1.4 `api.link_customer_to_branch(p_customer_id uuid, p_visit_id uuid) → jsonb`

**เส้นทางเดียวของการผูกลูกค้าที่ยังมองไม่เห็นเข้าสาขา** (CANONICAL ข้อ 6.6) · DEFINER · VOLATILE

**สิทธิ์:** `visit.update` ในสาขาของ visit (สาขามาจาก visit **ไม่รับจากผู้เรียก**)

**เงื่อนไขทุกข้อ**

1. visit มีอยู่ · สาขา ∈ `scope_branch_ids('visit.update','OWN')` · สถานะ `WAITING`/`IN_SERVICE` · `created_at ≥ now() − 4 ชม.`
2. `visits.customer_id IS NULL`
3. ลูกค้ามีอยู่ · `record_status = 'ACTIVE'` · องค์กรเดียวกัน
4. ลูกค้าถูกคืนจาก `api.find_customer_candidates` **ของผู้เรียกเอง สำหรับ visit นี้ ภายใน 30 นาที** (ตรวจจาก `audit.access_logs.detail->'candidate_ids'`)

**ผลลัพธ์**

```jsonc
{ "ok": true, "customer_id": "<uuid>", "customer_no": "CUS-2026-000297",
  "branch_id": "<uuid:JP1>", "visit_id": "<uuid>", "link_count_today": "3" }
```

**ผลข้างเคียง:** upsert `crm.customer_branches` (`linked_via = 'MANUAL_LINK'`) · ตั้ง `visits.customer_id` และ `interactions.customer_id` ของ interaction ต้นทาง · `audit.access_logs` `CUSTOMER_LINKED_TO_BRANCH` · ตัวนับ `security.link_per_day` — เกินแล้ว **ยังผูกสำเร็จ** และแจ้ง `LINK_LIMIT_EXCEEDED` ถึง BRANCH_MANAGER ของสาขานั้น

**ข้อผิดพลาด:** visit ใช้ไม่ได้ → `42501 visit นี้ผูกลูกค้าไม่ได้ (ต้องเป็น visit ที่เปิดอยู่ในสาขาของคุณ ภายใน 4 ชั่วโมง)` · visit มีลูกค้าแล้ว → `P0001 visit นี้ระบุลูกค้าแล้ว` · ไม่พบลูกค้า → `42501 ไม่พบลูกค้ารายนี้` · ไม่ได้มาจากผลตรวจซ้ำ → `42501 ต้องเลือกลูกค้าจากผลตรวจซ้ำของ visit นี้ภายใน 30 นาที`

**ตัวอย่าง** — สถานการณ์ D16 ของ CANONICAL ข้อ 16: คุณสมชาย ใจดี (ลูกค้าเดิมของ JP1) เดินเข้า **JAUNPHONE 2** · พนักงาน JP2 กรอกเบอร์ในหน้าตรวจซ้ำแล้วได้การ์ดย่อ (นอกขอบเขต) จึงกด "ใช้ลูกค้าเดิม"

```jsonc
{ "p_customer_id": "<uuid:CUS-2026-000297>", "p_visit_id": "<uuid:visit ที่เปิดอยู่ของ JP2>" }
```

```jsonc
{ "ok": true, "customer_id": "<uuid:CUS-2026-000297>", "customer_no": "CUS-2026-000297",
  "branch_id": "<uuid:JP2>", "visit_id": "<uuid>", "link_count_today": "1" }
```

> หลังคำเรียกนี้ ลูกค้ามีแถวใน `crm.customer_branches` ของ JP2 → พนักงาน JP2 จึงอ่าน Customer 360 และประวัติจากทุกสาขาได้แบบอ่านอย่างเดียว (CANONICAL ข้อ 6.6)

---

### 3.2 Customer 360 · เปิดค่าเต็ม · แก้ช่องทางติดต่อ · ความยินยอม

#### 3.2.1 `api.get_customer_360(p_customer_id uuid) → jsonb`

ข้อมูลหัวหน้า 05 ทั้งหน้า (CANONICAL ข้อ 6.8) · DEFINER · **VOLATILE** (เขียน `CUSTOMER_VIEWED` ในทรานแซกชันเดียวกัน)

**สิทธิ์:** `customer.read` บนลูกค้ารายนั้น (`app.can_access_customer`) · aal ตามบทบาท (EXECUTIVE/BUSINESS_ADMIN ต้อง aal2 จึงจะมีสิทธิ์)

**ผลลัพธ์ (คีย์ระดับบน)**

| คีย์ | เนื้อหา |
|---|---|
| `header` | `customer_id` `customer_no` `display_name` `first_name` `last_name` `nickname` `lifecycle_stage` `record_status` `merged_into_id` `legal_hold` `province_code` `first_channel_code` `first_source_code` `first_branch_id` `first_seen_at` `last_activity_at` `last_channel_code` `owner_staff_id` `owner_display_name` `note_summary` · `badges` = `{vip, followingUp, newCustomer, notContacted}` (คีย์ตรงกับ CANONICAL ข้อ 19.5 ข้อ 1) |
| `counters` | `interaction_count` · `walk_in_count` · `purchase_count` · `purchase_amount` · `months_as_customer` (สูตรข้อ 3.3) |
| `contacts[]` | `contact_id` `contact_type` `value_masked` `is_primary` `is_valid` `is_active` — **ไม่มีค่าเต็ม** |
| `addresses[]` | `address_id` `district` `province_code` `value_masked` `is_primary` `is_active` |
| `tags[]` | `code` `label_th` |
| `branches[]` | `branch_id` `code` `name_th` `first_linked_at` `last_activity_at` |
| `consents[]` | สถานะปัจจุบันต่อ purpose จาก view `crm.customer_consent_current`: `purpose_code` `status` `channels[]` `captured_at` `notice_version` |
| `pinned_notes[]` | `note_id` `body` `created_at` `created_by` |
| `next_followup` | next action ที่ใกล้ที่สุดจาก lead/opportunity ที่เปิดอยู่: `source` (`LEAD`/`OPPORTUNITY`) `entity_id` `entity_ref` `next_action` `next_action_type_code` `next_action_at` `owner_staff_id` |
| `interests[]` | ≤ 3 รายการ เรียง `HOT → WARM → COLD` แล้ว `updated_at` ล่าสุด: `product_model` `product_type_code` `interest_level` `source` `entity_ref` |
| `tabs` | ตัวนับของแท็บ: `interactions` `purchases` `leads` `opportunities` `quotations` `tasks` (นับเฉพาะ task ที่ผู้เรียกมี `task.read` — **ไม่มี read-through**) `notes` `documents` · `can_view_history` = มี `customer.update` บนลูกค้ารายนี้ |

`badges.newCustomer` คำนวณจาก `app.bangkok_date(first_seen_at) > app.bangkok_date(app.clock()) − app.settings['badge.new_customer_days']` (30)

**ผลข้างเคียง:** `audit.access_logs` `CUSTOMER_VIEWED` (1 แถวต่อการเปิดหน้า) · ตัวนับ `security.customer_view_per_hour` → เกินแล้ว **ไม่บล็อก** แต่แจ้ง `CUSTOMER_VIEW_LIMIT_EXCEEDED` ถึง BUSINESS_ADMIN

**ข้อผิดพลาด:** ไม่พบ/ไม่มีสิทธิ์ → `42501 ไม่พบลูกค้ารายนี้` (ข้อความเดียวกันทั้งสองกรณีตาม F5)

**ตัวอย่าง** — คุณสมชาย ใจดี (CANONICAL ข้อ 13.7) เปิดโดยคุณขวัญ

```jsonc
{ "p_customer_id": "<uuid:CUS-2026-000297>" }
```

```jsonc
{ "ok": true,
  "header": { "customer_no": "CUS-2026-000297", "display_name": "สมชาย ใจดี",
              "lifecycle_stage": "REPEAT", "record_status": "ACTIVE", "legal_hold": false,
              "province_code": "TH-10", "first_channel_code": "FACEBOOK",
              "first_source_code": "FACEBOOK_PAGE", "first_seen_at": "2026-01-11T06:15:00+00:00",
              "last_activity_at": "2026-09-11T03:24:00+00:00", "last_channel_code": "LINE",
              "owner_staff_id": "<uuid:ST-0045>", "owner_display_name": "คุณขวัญ",
              "badges": { "vip": true, "followingUp": true, "newCustomer": false, "notContacted": false },
              "note_summary": "ชอบให้ติดต่อทาง LINE หลัง 18:00" },
  "counters": { "interaction_count": 7, "walk_in_count": 3, "purchase_count": 2,
                "purchase_amount": 52800, "months_as_customer": 8 },
  "contacts": [ { "contact_type": "PHONE",   "value_masked": "081-XXX-5678",      "is_primary": true },
                { "contact_type": "LINE_ID", "value_masked": "so***",             "is_primary": true },
                { "contact_type": "EMAIL",   "value_masked": "s***@example.com",  "is_primary": true } ],
  "tags": [ { "code": "VIP" }, { "code": "INSTALLMENT" }, { "code": "IPHONE_FAN" } ],
  "consents": [ { "purpose_code": "MARKETING", "status": "GRANTED", "channels": ["LINE"],
                  "notice_version": "PN-2026-01" },
                { "purpose_code": "PRIVACY_NOTICE", "status": "GRANTED", "notice_version": "PN-2026-01" } ],
  "next_followup": { "source": "OPPORTUNITY", "entity_ref": "OP-2026-002998",
                     "next_action": "โทรติดตามเรื่องผ่อน", "next_action_type_code": "CALL",
                     "next_action_at": "2026-09-18T03:00:00+00:00", "owner_staff_id": "<uuid:ST-0045>" },
  "interests": [ { "product_model": "iPhone 17 Pro", "interest_level": "HOT",
                   "source": "OPPORTUNITY", "entity_ref": "OP-2026-002998" },
                 { "product_model": "iPad Air", "interest_level": "WARM",
                   "source": "LEAD", "entity_ref": "LD-2026-007460" } ],
  "tabs": { "interactions": 7, "purchases": 4, "leads": 3, "opportunities": 3,
            "quotations": 1, "tasks": 2, "notes": 1, "documents": 3, "can_view_history": true } }
```

#### 3.2.2 `api.reveal_contact(p_contact_id uuid, p_purpose text) → jsonb` · `api.reveal_address(p_address_id uuid, p_purpose text) → jsonb`

**เส้นทางเดียวของค่าเต็ม** (CANONICAL ข้อ 6.4 · 19.1 ข้อ 5) · DEFINER · VOLATILE

**สิทธิ์:** `customer.pii.reveal` บนลูกค้าเจ้าของ contact/address (EXECUTIVE และ BUSINESS_ADMIN ต้อง aal2 ตาม 🔐 ในข้อ 8.1)

**พารามิเตอร์:** `p_purpose` ∈ **`VIEW` · `CALL` · `COPY` · `LINE_OPEN`** (ค่าอื่น → `22023`)

**ผลลัพธ์**

```jsonc
// reveal_contact
{ "ok": true, "contact_id": "<uuid>", "contact_type": "PHONE",
  "value_raw": "081-234-5678", "value_normalized": "+66812345678", "auto_hide_seconds": 30 }
// reveal_address
{ "ok": true, "address_id": "<uuid>", "address_line": "...", "subdistrict": "...",
  "district": "...", "province_code": "TH-10", "postal_code": "10110", "auto_hide_seconds": 30 }
// เกินอัตรา (ไม่ raise เพื่อให้ตัวนับและการแจ้งเตือนถูก commit)
{ "ok": false, "code": "REVEAL_LIMIT_EXCEEDED", "hit_count": "31" }
```

**ผลข้างเคียง:** `audit.access_logs` **`CONTACT_REVEALED`** เขียน**ก่อน**คืนค่า (เก็บ `contact_id` และ `purpose` · ไม่เก็บค่า) · ตัวนับ `security.reveal_per_hour` (ใช้ตัวนับเดียวกันทั้งสองฟังก์ชัน) · เกินแล้วแจ้ง `REVEAL_LIMIT_EXCEEDED` ถึง BUSINESS_ADMIN

> `api.reveal_address` ใช้ action `CONTACT_REVEALED` เช่นกันและใส่ `detail = {"kind":"ADDRESS"}` เพราะ `audit.access_logs` บังคับ `contact_id` เมื่อ action นี้ (rls-spec หมายเหตุ H5) — ดูข้อ 8

**ข้อผิดพลาด:** purpose ผิด → `22023 purpose ต้องเป็น VIEW · CALL · COPY หรือ LINE_OPEN` · ไม่พบ/ไม่มีสิทธิ์ → `42501 ไม่พบช่องทางติดต่อนี้` / `ไม่พบที่อยู่นี้`

**ตัวอย่าง** — ปุ่ม "โทร" บนหน้า 05 (ตรงกับแถว audit 11 ก.ย. 10:20 ของ CANONICAL ข้อ 13.14)

```jsonc
{ "p_contact_id": "<uuid:contact PHONE ของ CUS-2026-000297>", "p_purpose": "CALL" }
```

```jsonc
{ "ok": true, "contact_id": "<uuid>", "contact_type": "PHONE",
  "value_raw": "081-234-5678", "value_normalized": "+66812345678", "auto_hide_seconds": 30 }
```

> UI: หลังได้ค่าเต็ม เปิด `tel:` แล้วเสนอ dialog "บันทึกการโทร" (สร้าง interaction `OUTBOUND` PHONE) · ซ่อนค่ากลับใน 30 วินาที

#### 3.2.3 `api.save_contact(p jsonb) → jsonb` · `api.save_address(p jsonb) → jsonb`

DEFINER · VOLATILE · **สิทธิ์:** `customer.update` บนลูกค้า · ลูกค้าต้อง `record_status = 'ACTIVE'` (มิฉะนั้น `JCRM-T02`)

**`api.save_contact` — คีย์ใน `p`**

| คีย์ | ชนิด | บังคับ | หมายเหตุ |
|---|---|:--:|---|
| `contact_id` | uuid | – | มี = แก้ · ไม่มี = เพิ่ม |
| `customer_id` | uuid | ✓ เมื่อเพิ่ม | เมื่อแก้จะอ่านจากแถวเดิม |
| `contact_type` | text | ✓ เมื่อเพิ่ม | `crm.contact_type`: `PHONE` `LINE_ID` `LINE_USER_ID` `FACEBOOK` `INSTAGRAM` `TIKTOK` `EMAIL` |
| `value` | text | ✓ เมื่อเพิ่ม | **กรอกค่าใหม่ทั้งค่า** (ฟอร์มไม่แสดงค่าเดิม) · normalize/mask ในฐานข้อมูล |
| `is_primary` | boolean | – | `true` → ล้าง primary เดิมของชนิดเดียวกัน |
| `is_active` | boolean | – | ค่าเริ่มต้น `true` (ปิดใช้งานแทนการลบ) |
| `verified` | boolean | – | `true` → ตั้ง `verified_at` (ไม่ล้างค่าเดิม) |

`is_valid` ของ `PHONE` คำนวณจาก `app.is_valid_thai_phone` (มือถือ 10 หลัก `06/08/09` หรือเบอร์บ้าน 9 หลัก `02`–`07`) — ค่าที่ไม่ผ่านยัง **บันทึกได้** แต่ `is_valid = false` (เป็นที่มาของรายการคุณภาพข้อมูล `INVALID_PHONE`)

**`api.save_address` — คีย์ใน `p`:** `address_id` · `customer_id` · `address_line` ✓ · `subdistrict` · `district` · `province_code` · `postal_code` · `is_primary` · `is_active`
`value_masked` ถูกคำนวณเป็น `"{อำเภอ} · {ชื่อจังหวัด}"` (ว่างทั้งคู่ → `"—"`)

**ผลลัพธ์:** `{ "ok": true, "contact_id": "…", "customer_id": "…", "value_masked": "081-XXX-5678" }` / `{ "ok": true, "address_id": "…", "customer_id": "…", "value_masked": "วัฒนา · กรุงเทพมหานคร" }`

**ผลข้างเคียง:** audit `CUSTOMER_CONTACT_UPDATED` (trigger `audit.log_row_change` · ค่า `pii` เก็บเป็น masked + sha256)

**ข้อผิดพลาด:** ไม่ครบ → `22023 ต้องระบุ customer_id · contact_type · value` · ไม่มีสิทธิ์ → `42501 ไม่มีสิทธิ์แก้ข้อมูลลูกค้ารายนี้` · ลูกค้าไม่ ACTIVE → `42501 JCRM-T02` · ค่าไม่ถูกต้อง → `22023 ค่าช่องทางติดต่อไม่ถูกต้อง`

**ตัวอย่าง** — แก้เบอร์ของคุณจิราพร ทองดี (ตรงกับแถว audit 10 ก.ย. 18:42 ของ CANONICAL ข้อ 13.14)

```jsonc
{ "p": { "contact_id": "<uuid:contact PHONE ของ CUS-2025-007321>",
         "value": "089-123-5678", "is_primary": true } }
```

```jsonc
{ "ok": true, "contact_id": "<uuid>", "customer_id": "<uuid:CUS-2025-007321>",
  "value_masked": "089-XXX-5678" }
```

#### 3.2.4 `api.record_consent(p jsonb) → jsonb`

บันทึกความยินยอมแบบ **append-only** (CANONICAL ข้อ 10.2 · 19.4 ข้อ 3) · DEFINER · VOLATILE

**สิทธิ์:** `customer.consent.manage` บนลูกค้า · ลูกค้าต้อง `ACTIVE`

| คีย์ | ชนิด | บังคับ | ค่า |
|---|---|:--:|---|
| `customer_id` | uuid | ✓ | |
| `purpose_code` | text | ✓ | `ref.consent_purposes` ที่ `is_active`: `PRIVACY_NOTICE` · `MARKETING` |
| `status` | text | – | `GRANTED` (ค่าเริ่มต้น) · `WITHDRAWN` — **การถอนคือแถวใหม่ ไม่มี UPDATE/DELETE** |
| `captured_via` | text | – | `STAFF_FORM` (ค่าเริ่มต้น) · `LINK_SENT` · `LINE_OA` · `WEB` |
| `channels[]` | array | เงื่อนไข | ⊆ `LINE` `SMS` `PHONE` `EMAIL` · เก็บเฉพาะเมื่อ `GRANTED` |
| `notice_version` | text | – | ค่าเริ่มต้น = `app.settings['pdpa.current_notice_version']` (`PN-2026-01`) |
| `age_ack` | boolean | เงื่อนไข | **บังคับเมื่อ `MARKETING` + `GRANTED`** |
| `evidence` | text | – | ไม่ส่ง = ประกอบให้อัตโนมัติ (`{ฉบับ} · {วิธี} · ช่องทาง … · ข้อความยืนยันอายุ`) |

**ผลลัพธ์:** `{ "ok": true, "consent_id": "…", "customer_id": "…", "purpose_code": "MARKETING", "status": "GRANTED" }`
**ผลข้างเคียง:** INSERT `crm.customer_consents` · audit `CONSENT_RECORDED` · view `crm.customer_consent_current` เปลี่ยนตามแถวล่าสุด
**ข้อผิดพลาด:** ไม่ติ๊กอายุ → `P0001 ต้องติ๊ก "ลูกค้าอายุ 20 ปีขึ้นไป หรือผู้ใช้อำนาจปกครองยินยอม"` · purpose ผิด → `22023 purpose_code ไม่ถูกต้อง` · ไม่มีสิทธิ์ → `42501 ไม่มีสิทธิ์บันทึกความยินยอมของลูกค้ารายนี้`

**ตัวอย่าง** — คุณสมชายถอนความยินยอมรับข่าวสาร

```jsonc
{ "p": { "customer_id": "<uuid:CUS-2026-000297>", "purpose_code": "MARKETING",
         "status": "WITHDRAWN", "captured_via": "STAFF_FORM",
         "evidence": "ลูกค้าแจ้งที่หน้าร้าน JAUNPHONE 1" } }
```

```jsonc
{ "ok": true, "consent_id": "<uuid>", "customer_id": "<uuid:CUS-2026-000297>",
  "purpose_code": "MARKETING", "status": "WITHDRAWN" }
```

---

### 3.3 รวมลูกค้าและการตัดสินข้อมูลซ้ำ

#### 3.3.1 `api.merge_customers(p_survivor_id uuid, p_merged_id uuid, p_field_choices jsonb DEFAULT '{}', p_reason text DEFAULT NULL, p_duplicate_decision_id uuid DEFAULT NULL) → jsonb`

CANONICAL ข้อ 6.7 · DEFINER · VOLATILE · **สิทธิ์ `customer.merge` 🔐 (aal2) บน *ทั้งสองราย*** · ผู้ตัดสิน ≠ `duplicate_decisions.created_by`

| พารามิเตอร์ | ชนิด | บังคับ | หมายเหตุ |
|---|---|:--:|---|
| `p_survivor_id` · `p_merged_id` | uuid | ✓ | ต้องต่างกัน · ทั้งคู่ `record_status = 'ACTIVE'` |
| `p_field_choices` | jsonb | – | `{"first_name":"MERGED", …}` · คีย์ที่รองรับ: `first_name` `last_name` `nickname` `province_code` `customer_type` `owner_staff_id` · ค่าที่ไม่ใช่ `"MERGED"` = เก็บของ survivor |
| `p_reason` | text | ✓ | ข้อความห้ามมี PII (ลง `app.audit_reason`) |
| `p_duplicate_decision_id` | uuid | – | **ส่ง NULL ได้** เมื่อเปิดจากเมนู Customer 360 (CANONICAL ข้อ 19.3 ข้อ 7) · ถ้าส่งต้อง `PENDING` และเป็นคู่ของลูกค้าสองรายนี้ |

**สิ่งที่ทำในทรานแซกชันเดียว (ตั้ง `app.bulk = on` ตลอดงาน)**

1. `customer_contacts` — คู่ `(contact_type, value_normalized)` ซ้ำ เก็บแถวที่ `verified_at` ไม่ว่างไว้ · แถวที่เหลือย้ายพร้อม `is_primary = false`
2. ย้าย `customer_addresses` · `customer_notes` · `customer_consents` · `customer_tags` (ซ้ำ → ลบ) · `visits` · `interactions` · `leads` · `opportunities` · `quotations` · `tasks` · `transaction_refs`
3. `customer_branches` upsert (`first_linked_at` = least · `last_activity_at` = greatest · `linked_via = 'MERGE'`) แล้วลบของรายที่ถูกรวม
4. survivor: `first_seen_at = least(...)` · `first_channel_code`/`first_source_code`/`first_branch_id` **มาจากรายที่ `first_seen_at` เก่ากว่า** (ไม่ใช่ `p_field_choices`) · ฟิลด์อื่นตาม `p_field_choices`
5. รายที่ถูกรวม: `record_status = 'MERGED'` + `merged_into_id`
6. `crm.customer_merges` (เลข `MG-YYYY-NNNNNN` · `snapshot` ปิดบัง PII + sha256 · `moved_counts` แยกตาราง)
7. `duplicate_decisions` → `MERGED` เมื่อส่ง id มา
8. ปิด `app.bulk` แล้ว `app.refresh_customer_activity(survivor)` · `app.refresh_customer_lifecycle` ทั้งสองราย

**ผลลัพธ์**

```jsonc
{ "ok": true, "merge_id": "<uuid>", "merge_no": "MG-2026-000017",
  "survivor_customer_id": "<uuid>", "merged_customer_id": "<uuid>",
  "moved_counts": { "customer_contacts": 2, "visits": 3, "interactions": 5, "leads": 1,
                    "opportunities": 1, "quotations": 0, "tasks": 2, "transaction_refs": 1, ... } }
```

**ข้อผิดพลาด:** ไม่มีสิทธิ์ทั้งสองราย → `42501 ต้องมีสิทธิ์รวมลูกค้าบนทั้งสองราย` · ไม่ระบุเหตุผล → `22023 ต้องระบุเหตุผลของการรวมลูกค้า` · ลูกค้า `MERGED`/`ANONYMIZED` → `42501 JCRM-T02` · decision ไม่ตรงคู่ → `P0001 รายการข้อมูลซ้ำไม่ตรงกับลูกค้าคู่นี้` · ผู้ตัดสิน = ผู้สร้างแถว → `42501 ผู้ตัดสินต้องไม่ใช่ผู้สร้างรายการข้อมูลซ้ำ`

**ตัวอย่าง** — คู่ซ้ำตัวอย่างแรกของหน้า 12 (CANONICAL ข้อ 13.14) ตัดสินโดยคุณเจ (BM@JP1 · ไม่ใช่คุณคิมผู้สร้างแถว)

```jsonc
{ "p_survivor_id": "<uuid:CUS-2026-002118>", "p_merged_id": "<uuid:CUS-2026-006633>",
  "p_field_choices": {},
  "p_reason": "ยืนยันกับลูกค้าแล้วว่าเป็นคนเดียวกัน",
  "p_duplicate_decision_id": "<uuid:decision ของคู่นี้>" }
```

```jsonc
{ "ok": true, "merge_id": "<uuid>", "merge_no": "MG-2026-000017",
  "survivor_customer_id": "<uuid:CUS-2026-002118>", "merged_customer_id": "<uuid:CUS-2026-006633>",
  "moved_counts": { "customer_contacts": "<n>", "customer_addresses": "<n>",
                    "customer_notes": "<n>", "customer_consents": "<n>", "customer_tags": "<n>",
                    "visits": "<n>", "interactions": "<n>", "leads": "<n>",
                    "opportunities": "<n>", "quotations": "<n>", "tasks": "<n>",
                    "transaction_refs": "<n>" } }
```

> `moved_counts` เป็นจำนวนแถวจริงที่ย้ายต่อตาราง (ตัวเลขขึ้นกับข้อมูล · CANONICAL ไม่ได้ตรึงไว้) · `merge_no` ตัวถัดไปหลัง seed คือ `MG-2026-000017` (ตัวนับ `MG:2026` = 16 ตามข้อ 13.0)

#### 3.3.2 `api.decide_duplicate(p_decision_id uuid, p_status text, p_note text DEFAULT NULL) → jsonb`

ยืนยัน **"คนละคน"** เท่านั้น · DEFINER · VOLATILE · สิทธิ์ `customer.merge` 🔐 บนทั้งสองราย · ผู้ตัดสิน ≠ ผู้สร้างแถว

- `p_status` ต้องเป็น **`'NOT_DUPLICATE'`** เท่านั้น (การรวมใช้ `api.merge_customers`) · ค่าอื่น → `P0001`
- แถวต้องอยู่สถานะ `PENDING`
- ผล: `{ "ok": true, "decision_id": "…", "status": "NOT_DUPLICATE" }` · UPDATE `crm.duplicate_decisions` (`decided_by` `decided_at` `decision_note`) → หายจากรายการ `DUPLICATE_SUSPECTED` ของหน้า 12 และจากตัวหารของ `DUPLICATE_RATE`

```jsonc
{ "p_decision_id": "<uuid>", "p_status": "NOT_DUPLICATE",
  "p_note": "ใช้เบอร์ร่วมกันในครอบครัว ยืนยันแล้วว่าคนละคน" }
```

---

### 3.4 งานหน้าร้าน: visit · แปลง lead · มอบหมาย

#### 3.4.1 `api.open_visit(p jsonb) → jsonb`

เปิดหรือ **แนบ** visit + interaction ต้นทาง (CANONICAL ข้อ 3.3 · 19.3 ข้อ 1) · DEFINER · VOLATILE · **ไม่สร้าง lead อัตโนมัติ**

**สิทธิ์:** `visit.create` ในสาขา (`scope_branch_ids('visit.create','OWN')`) · เมื่อระบุลูกค้าต้องอ่านลูกค้าได้ **และ** ลูกค้าต้องผูกกับสาขานั้นแล้ว (`customer_branches`/`first_branch_id`) เว้นแต่ผู้เรียกมี scope `ORGANIZATION` — มิฉะนั้น `JCRM-T26`

| คีย์ | ชนิด | บังคับ | ค่า |
|---|---|:--:|---|
| `branch_id` | uuid | ✓ | ต้องอยู่ในสิทธิ์ |
| `channel_code` | text | ✓ | `ref.channels` ที่ `is_active` |
| `interest_code` | text | ✓ เมื่อ `WALK_IN` | `ref.interest_types` |
| `customer_id` | uuid | – | ไม่ส่ง = visit นิรนาม |
| `visit_mode` | text | – | `QUEUE` → `WAITING` (เฉพาะ `WALK_IN`) · `SERVICE` (ค่าเริ่มต้น) → `IN_SERVICE` + owner = ผู้กด |
| `party_size` | int | – | ค่าเริ่มต้น 1 |
| `source_code` | text | – | `ref.sources` |
| `occurred_at` | timestamptz | – | ค่าเริ่มต้น `now()` |
| `attach_visit_id` | uuid | – | บังคับให้แนบเข้า visit นี้ (ต้อง `IN_SERVICE` สาขา/ช่องทาง/วันธุรกิจเดียวกัน) |
| `interaction_type_code` | text | – | ค่าเริ่มต้น `VISIT` (WALK_IN) · `INQUIRY` (อื่น) |
| `summary` | text | – | |

**กติกาการแนบ (CANONICAL ข้อ 3.3 ข้อ 3 · 19.3 ข้อ 1):** ช่องทางที่ **ไม่ใช่** `WALK_IN` จะมองหา visit `IN_SERVICE` ของ **สาขา + ช่องทาง + วันธุรกิจ (Asia/Bangkok)** เดียวกัน — ถ้า `attach_visit_id` ว่างจะจับคู่ด้วย `customer_id` · พบ → แนบ interaction เข้า visit เดิม (`attached: true`) · ไม่พบ → เปิด visit ใหม่สถานะ `IN_SERVICE`

**ผลลัพธ์:** `{ "ok": true, "visit_id", "visit_no", "queue_no", "attached": bool, "interaction_id", "status" }`

**ผลข้างเคียง:** INSERT `crm.visits` (เมื่อไม่แนบ) · INSERT `crm.interactions` (`is_visit_root` = จริงเมื่อ visit ยังไม่มีต้นทาง) · trigger: เลข `visit_no`/`queue_no` · `customer_branches` · แคช `last_*` · audit `VISIT_CREATED`/`INTERACTION_CREATED`

**ข้อผิดพลาด:** `42501 ไม่มีสิทธิ์เปิด visit ในสาขานี้` · `22023 ต้องเลือกช่องทาง` · `22023 visit หน้าร้านต้องระบุวัตถุประสงค์` · `42501 ไม่มีสิทธิ์เปิด visit ให้ลูกค้ารายนี้` · `42501 JCRM-T26` (ลูกค้ายังไม่ผูกสาขา) · `42501 JCRM-T02` (ลูกค้าไม่ ACTIVE)

**ตัวอย่าง** — คุณสมชายทักมาทาง LINE 11 ก.ย. 10:24 (interaction #7 ของ CANONICAL ข้อ 13.7)

```jsonc
{ "p": { "branch_id": "<uuid:JP1>", "channel_code": "LINE",
         "customer_id": "<uuid:CUS-2026-000297>",
         "interaction_type_code": "INQUIRY",
         "summary": "สอบถาม iPhone 17 Pro และเงื่อนไขผ่อน" } }
```

```jsonc
{ "ok": true, "visit_id": "<uuid>", "visit_no": "V-JP1-260911-007", "queue_no": null,
  "attached": false, "interaction_id": "<uuid>", "status": "IN_SERVICE" }
```

#### 3.4.2 `api.close_visit(p_visit_id uuid, p_outcome_code text, p jsonb DEFAULT '{}') → jsonb`

ปิด visit พร้อมผล และบังคับผลของ outcome (CANONICAL ข้อ 4.1 · 4.2 · 19.3 ข้อ 3) · DEFINER · VOLATILE

**สิทธิ์:** `visit.update` บน visit (`app.can_access_record`)

| พารามิเตอร์ | ค่า |
|---|---|
| `p_outcome_code` | `ref.visit_outcomes` ที่ `is_active` — `PURCHASED` `FOLLOW_UP` `NOT_YET` `NOT_INTERESTED` `SERVICE_DONE` `LEFT_BEFORE_SERVICE` · **`UNRECORDED` ส่งไม่ได้** (ระบบตั้งเท่านั้น) |
| `p.lost_reason_code` | บังคับเมื่อ `NOT_INTERESTED` · `ref.lost_reasons` ที่ `is_active` |
| `p.lost_note` | บังคับเมื่อ `lost_reason_code = 'OTHER'` |

**สถานะปลายทาง:** `LEFT_BEFORE_SERVICE` → `LEFT` (ต้องมาจาก `WAITING`) · อื่น ๆ → `COMPLETED` (ต้องมาจาก `IN_SERVICE`) · **เรียกซ้ำในวันธุรกิจเดียวกัน = แก้ outcome** (ข้ามวันแล้ว → `JCRM-T23`) · visit `CANCELLED` → `JCRM-T23`

**กฎของ outcome (CANONICAL ข้อ 4.2)**

| outcome | บังคับเพิ่ม |
|---|---|
| `PURCHASED` | ต้องมี `customer_id` · เปลี่ยน interaction ต้นทางเป็นประเภท `PURCHASE` |
| `FOLLOW_UP` | ต้องมี `customer_id` **และ** มี lead/opportunity ที่เปิดอยู่ของลูกค้ารายนั้นที่มี `next_action_at` |
| `NOT_INTERESTED` | ต้องมี `lost_reason_code` → **ปิด lead ทุกใบที่ `leads.visit_id` = visit นี้ เป็น `LOST` ในทรานแซกชันเดียว** |
| `NOT_YET` · `SERVICE_DONE` · `LEFT_BEFORE_SERVICE` | – |

**ผลลัพธ์:** `{ "ok": true, "visit_id", "status": "COMPLETED|LEFT", "outcome_code", "leads_closed": n }`
**ผลข้างเคียง:** `ended_at = coalesce(ended_at, now())` · `app.status_reason` = เหตุผล/outcome (ลง audit) · trigger แคชลูกค้าและ lifecycle · `OUTCOME_COMPLETION` ของ KPI เปลี่ยนตาม

**ข้อผิดพลาด:** `42501 ไม่พบ visit นี้หรือไม่มีสิทธิ์แก้` · `22023 ต้องเลือกผลการให้บริการ` · `P0001 ผล UNRECORDED ระบบตั้งให้เท่านั้น (ข้อ 4.1)` · `42501 JCRM-T21/T23` · `P0001 ผลนี้ต้องระบุลูกค้าก่อน (ข้อ 4.2)` · `P0001 ผล "นัดติดตาม" ต้องมี lead หรือโอกาสขายที่เปิดอยู่พร้อมงานถัดไป (ข้อ 4.2)` · `P0001 ผล "ไม่สนใจ" ต้องระบุเหตุผลที่ไม่สำเร็จ (19.3 ข้อ 3)`

**ตัวอย่าง** — ปิดคิว 001 ของ JP1 (ซื้อเครื่อง) เป็น "ซื้อแล้ว"

```jsonc
{ "p_visit_id": "<uuid:คิว 001 JP1 11 ก.ย.>", "p_outcome_code": "PURCHASED", "p": {} }
```

```jsonc
{ "ok": true, "visit_id": "<uuid>", "status": "COMPLETED",
  "outcome_code": "PURCHASED", "leads_closed": 0 }
```

#### 3.4.3 `api.acknowledge_unrecorded_visit(p_visit_id uuid) → jsonb`

รับทราบ visit ที่ระบบปิดให้แบบไม่ได้บันทึกผล (รายการ `VISIT_UNRECORDED` ของหน้า 12) · DEFINER · VOLATILE · สิทธิ์ `visit.update` บน visit

- `visits.outcome_code` ต้องเป็น `UNRECORDED` มิฉะนั้น `P0001 visit นี้ไม่ได้อยู่ในสถานะ "ไม่ได้บันทึกผล"`
- เรียกซ้ำปลอดภัย: ถ้ารับทราบแล้วคืน `{"ok":true,"already_acknowledged":true,"unrecorded_ack_by","unrecorded_ack_at"}`
- ตั้ง `unrecorded_ack_by = ผู้เรียก` · `unrecorded_ack_at = now()`

```jsonc
{ "p_visit_id": "<uuid:visit UNRECORDED ของ JP1>" }
→ { "ok": true, "visit_id": "<uuid>", "already_acknowledged": false, "unrecorded_ack_by": "<uuid:ST-0045>" }
```

#### 3.4.4 `api.convert_lead(p_lead_id uuid, p jsonb DEFAULT '{}') → jsonb`

**เส้นทางเดียวของการแปลง lead → opportunity** (CANONICAL ข้อ 4.3) · DEFINER · VOLATILE

**สิทธิ์:** `lead.update` บน lead **และ** `opportunity.create` ประเมินกับ lead · ต้องอ่านลูกค้าของ lead ได้ · lead ต้องอยู่สถานะเปิด (`NEW`/`CONTACTED`/`QUALIFIED`) มิฉะนั้น `JCRM-T43`

| คีย์ใน `p` | ค่า |
|---|---|
| `priority_code` | ค่าเริ่มต้น = ของ lead มิฉะนั้น `NORMAL` |
| `next_action` | ค่าเริ่มต้น = ของ lead มิฉะนั้น `"ติดตามโอกาสขาย"` |
| `next_action_type_code` | ค่าเริ่มต้น = ของ lead มิฉะนั้น `FOLLOW_UP` |
| `next_action_at` | ค่าเริ่มต้น = ของ lead มิฉะนั้น `now() + 1 วัน` |
| `items[]` | `{product_type_code, product_model, variant, quantity, unit_price, interest_level}` · ไม่ส่งและ lead มี `product_model` → สร้าง 1 รายการจาก lead |
| `unit_price` | ราคาของรายการที่สร้างจาก lead (ค่าเริ่มต้น 0) |

**ผลในทรานแซกชันเดียว:** INSERT `crm.opportunities` (`stage = 'INTERESTED'` · `lead_id` · `origin_channel_code` = `leads.channel_code` · `origin_visit_id` = `leads.visit_id` · `owner_staff_id` = owner ของ lead มิฉะนั้นผู้เรียก) → INSERT `crm.opportunity_items` (trigger รวมเป็น `expected_amount`) → UPDATE lead เป็น `CONVERTED` + `converted_opportunity_id` + `closed_at` (`app.status_reason = 'CONVERTED'`) → trigger เขียน `lead_status_history` · ยกเลิก task `is_next_action` ของ lead และสร้างของ opportunity · `lifecycle_stage` → `OPPORTUNITY`

**ผลลัพธ์:** `{ "ok": true, "lead_id", "opportunity_id", "opportunity_no": "OP-2026-003122" }`

**ตัวอย่าง** — แปลง `LD-2026-007460` (iPad Air · คุณสมชาย)

```jsonc
{ "p_lead_id": "<uuid:LD-2026-007460>",
  "p": { "priority_code": "NORMAL", "next_action": "ติดตามการตัดสินใจ iPad Air",
         "next_action_type_code": "FOLLOW_UP", "next_action_at": "2026-09-20T04:00:00Z",
         "items": [ { "product_type_code": "IPAD", "product_model": "iPad Air",
                      "quantity": 1, "unit_price": 21900, "interest_level": "WARM" } ] } }
```

```jsonc
{ "ok": true, "lead_id": "<uuid:LD-2026-007460>",
  "opportunity_id": "<uuid>", "opportunity_no": "OP-2026-003122" }
```

#### 3.4.5 `api.assign_owner(p_entity_type text, p_entity_id uuid, p_to_staff_id uuid, p_reason_code text, p_note text DEFAULT NULL, p_to_branch_id uuid DEFAULT NULL) → jsonb`

**เส้นทางเดียวของการเปลี่ยนผู้รับผิดชอบ / ทีม / สาขา** (CANONICAL ข้อ 9.4.2 · rls-spec ข้อ 8.3) · DEFINER · VOLATILE
คอลัมน์ `owner_staff_id` `team_id` `branch_id` **ไม่อยู่ใน column grant ของ UPDATE** (ยกเว้นการรับคิวของ visit) → PATCH ตรงจะถูกปฏิเสธด้วย `JCRM-T13`

| พารามิเตอร์ | ค่า |
|---|---|
| `p_entity_type` | `CUSTOMER` · `VISIT` · `LEAD` · `OPPORTUNITY` · `TASK` |
| `p_entity_id` | uuid ของแถว (ล็อก `FOR UPDATE`) |
| `p_to_staff_id` | ผู้รับใหม่ · **NULL ได้เฉพาะ `CUSTOMER` `LEAD` `TASK`** (VISIT/OPPORTUNITY → `JCRM-T16`) |
| `p_reason_code` | `ref.ownership_change_reasons` ที่ `is_active`: `SHIFT_CHANGE` `WORKLOAD` `STAFF_LEFT` `CUSTOMER_REQUEST` `BRANCH_TRANSFER` `OTHER` |
| `p_note` | หมายเหตุ (ห้ามมี PII) |
| `p_to_branch_id` | ย้ายสาขาได้เฉพาะ `LEAD` `OPPORTUNITY` `TASK` · **ต้องใช้เหตุผล `BRANCH_TRANSFER`** |

**สิทธิ์ที่ประเมิน:** `CUSTOMER` → `customer.assign` · `VISIT` → `visit.update` (scope ≥ TEAM) · `LEAD` → `lead.assign` · `OPPORTUNITY` → `opportunity.assign` · `TASK` → `task.assign`

**ลำดับการตรวจ (ไม่ผ่าน → รหัสในวงเล็บ)**

1. ชนิดถูกต้อง · พบแถว (ไม่พบ = `42501 ไม่พบรายการนี้`)
2. เหตุผลถูกต้อง · ย้ายสาขาต้องเป็น `BRANCH_TRANSFER` (`22023`)
3. สถานะแถว: CUSTOMER `ACTIVE` (T02) · VISIT `IN_SERVICE` (T21 เมื่อ `WAITING` · T23 เมื่อปิดแล้ว) · LEAD เปิด (T43) · OPPORTUNITY เปิด (T33) · TASK `OPEN`/`IN_PROGRESS` และ **ไม่ใช่ `is_next_action`** (T70 · T14)
4. ย้ายสาขาเฉพาะ LEAD/OPPORTUNITY/TASK (T14)
5. สิทธิ์บนแถวเดิม (T90 · T25 · T10)
6. สิทธิ์บนสาขาปลายทางเมื่อย้ายสาขา (T15)
7. ขอบเขตของแถวใหม่ (T11)
8. ผู้รับใหม่ต้องมี assignment ที่ยังมีผลในสาขาปลายทาง (T12) · ผู้รับว่างไม่ได้สำหรับ VISIT/OPPORTUNITY (T16)

**ผลลัพธ์**

```jsonc
{ "ok": true, "entity_type": "LEAD", "entity_id": "<uuid>", "entity_ref": "LD-2026-007512",
  "from_staff_id": "<uuid:ST-0045>", "to_staff_id": "<uuid:ST-0046>",
  "from_branch_id": null, "to_branch_id": null }
```

**ผลข้างเคียง:** UPDATE แถว (`owner_staff_id` · `team_id` = ทีมปัจจุบันของผู้รับในสาขาปลายทาง เรียงตาม `teams.code` ตัวแรก · `branch_id` เมื่อย้าย) · INSERT `crm.ownership_changes` 1 แถว · `app.audit_reason = p_reason_code` → audit `LEAD_ASSIGNED` / `OPPORTUNITY_ASSIGNED` / `TASK_ASSIGNED` / `CUSTOMER_UPDATED` · แจ้ง `{ENTITY}_ASSIGNED` ถึงผู้รับใหม่เมื่อไม่ใช่ตนเอง (LEAD/OPPORTUNITY/TASK เท่านั้น) · trigger sync task `is_next_action` ให้ตาม owner ใหม่

**ตัวอย่าง** — CANONICAL ข้อ 13.14: คุณเจ (BM@JP1) มอบ `LD-2026-007512` จากคุณขวัญให้คุณคิม เหตุผล "เปลี่ยนกะ"

```jsonc
{ "p_entity_type": "LEAD", "p_entity_id": "<uuid:LD-2026-007512>",
  "p_to_staff_id": "<uuid:ST-0046>", "p_reason_code": "SHIFT_CHANGE",
  "p_note": "เปลี่ยนกะ", "p_to_branch_id": null }
```

```jsonc
{ "ok": true, "entity_type": "LEAD", "entity_id": "<uuid:LD-2026-007512>",
  "entity_ref": "LD-2026-007512", "from_staff_id": "<uuid:ST-0045>",
  "to_staff_id": "<uuid:ST-0046>", "from_branch_id": null, "to_branch_id": null }
```

---

### 3.5 KPI · รายงาน · คุณภาพข้อมูล

#### 3.5.1 `api.get_kpis(p_preset text DEFAULT 'LAST_30_DAYS', p_start date DEFAULT NULL, p_end date DEFAULT NULL, p_branch_ids uuid[] DEFAULT NULL, p_group_by text DEFAULT 'NONE') → jsonb`

DEFINER · **STABLE** (CANONICAL ข้อ 9.4.1 · 9.6) · สิทธิ์ **`dashboard.view`** · เมื่อ `p_group_by = 'STAFF'` ต้องมี **`report.staff_performance` ในทุกสาขาที่ขอ**

| พารามิเตอร์ | ค่าที่รับ |
|---|---|
| `p_preset` | `TODAY` · `YESTERDAY` · `LAST_7_DAYS` · `THIS_WEEK` · `LAST_30_DAYS` (ค่าเริ่มต้น) · `THIS_MONTH` · `LAST_MONTH` · `THIS_QUARTER` · `CUSTOM` |
| `p_start` · `p_end` | ใช้เฉพาะ `CUSTOM` · **`p_end` เป็นขอบเปิด** (UI ส่งวันที่เลือก + 1) · ช่วงยาว 1–366 วัน · preset อื่นละเลยสองค่านี้ |
| `p_branch_ids` | `NULL` = ทุกสาขาที่ผู้เรียกมีสิทธิ์ · สาขาที่ไม่มีสิทธิ์ถูกตัดทิ้งเงียบ · ไม่เหลือสาขา → `42501` |
| `p_group_by` | `NONE` · `BRANCH` · `TEAM` · `STAFF` · `CHANNEL` · `STATUS` |

**ช่วงเปรียบเทียบ** คำนวณจาก preset ตาม CANONICAL ข้อ 12.0 (`TODAY` เทียบ `[วันเดียวกันสัปดาห์ก่อน 00:00, app.clock() − 7 วัน)` · `THIS_MONTH`/`THIS_QUARTER` เทียบช่วงวันที่ตรงกันและตัดที่สิ้นเดือนก่อนถ้าสั้นกว่า · `CUSTOM` เทียบช่วงยาวเท่ากันที่จบก่อน `p_start`)

**รูปผลลัพธ์**

```jsonc
{ "ok": true, "preset": "LAST_30_DAYS", "group_by": "NONE",
  "clock": "2026-09-11T03:24:00+00:00",
  "period": { "start": "...", "end": "...", "cmp_start": "...", "cmp_end": "..." },
  "branch_ids": ["<uuid:JP1>", "<uuid:JP2>", "<uuid:JP3>", "<uuid:JP4>", "<uuid:JPON>"],
  "scope": { "branch": [...], "team": [...], "own": [...], "partial": false },
  "rows": [ { "code": "VISITS", "group_key": null, "group_label": null, "kind": "COUNT",
              "value": 3125, "numerator": null, "denominator": null, "prev_value": 2790,
              "display": "3,125", "change_display": "+12%", "target_met": null, "extra": null } ] }
```

| คอลัมน์ของแถว | ความหมาย |
|---|---|
| `code` | รหัส KPI (38 รหัส · ตารางด้านล่าง) |
| `group_key` · `group_label` | uuid สาขา/พนักงาน/ทีม · รหัสช่องทาง · รหัสสถานะ · `NULL` = ไม่จัดกลุ่ม หรือกลุ่ม "ไม่มีทีม/ไม่มีผู้รับผิดชอบ" · `group_label` เป็น `NULL` สำหรับ `STATUS` (ป้ายไทยของ ENUM ไม่เก็บในฐานข้อมูล · CANONICAL ข้อ 4) |
| `kind` | `COUNT` · `MONEY` · `RATE` (`value` เป็นสัดส่วน 0–1 ที่ยังไม่ปัด) · `MINUTES` |
| `value` | ค่าดิบที่ยังไม่ปัด · `NULL` เมื่อคำนวณไม่ได้ (ตัวหาร 0 · ไม่มีมิตินี้ · ขอบเขต TEAM/OWN ของ KPI ที่ไม่ผูกพนักงาน) |
| `numerator` · `denominator` | เฉพาะอัตรา · `LEAD_RESPONSE_MIN` ใช้ `numerator` = จำนวน lead ในฐานมัธยฐาน |
| `prev_value` | ค่าช่วงเปรียบเทียบ · `NULL` สำหรับ KPI แบบ "ณ `app.clock()`" (`OPEN_*` · `TASKS_*` · `WON_LAST_7_DAYS*` · `DUPLICATE_RATE` · `MISSING_REQUIRED_RATE`) |
| `display` · `change_display` | ข้อความที่ปัดแล้วตาม CANONICAL ข้อ 1.3 (`"3,125"` · `"฿3,332,700"` · `"24.1%"` · `"18 นาที"` · `"–"` · `"+12%"` · `"+2.1 pp"`) |
| `target_met` | เทียบเป้าด้วยค่าที่ยังไม่ปัด: `CAPTURE_RATE ≥ 0.95` · `OUTCOME_COMPLETION ≥ 0.95` · `FOLLOWUP_COMPLETION ≥ 0.90` · `DUPLICATE_RATE < 0.02` · `MISSING_REQUIRED_RATE < 0.02` · อื่น ๆ `NULL` |
| `extra` | `LEAD_RESPONSE_MIN` → `{"not_contacted": N}` |

**38 รหัส KPI และมิติที่รองรับ** (มิติที่ไม่รองรับจะไม่มีแถวของ KPI นั้นเมื่อจัดกลุ่มด้วยมิตินั้น)

| กลุ่ม | รหัส | มิติที่รองรับ |
|---|---|---|
| จำนวน | `VISITS` `WALKIN_VISITS` `IDENTIFIED_VISITS` `LEADS` `OPPORTUNITIES` `SALES` `LOST_OPPORTUNITIES` `LOST_LEADS` `LOST_TOTAL` | NONE · BRANCH · TEAM · STAFF · CHANNEL |
| เงิน | `SALES_AMOUNT` | NONE · BRANCH · TEAM · STAFF · CHANNEL |
| ลูกค้า | `UNIQUE_CUSTOMERS` `NEW_CUSTOMERS` `RETURNING_CUSTOMERS` | NONE · BRANCH · CHANNEL |
| ผู้ซื้อ | `BUYERS` `REPEAT_BUYERS` `REPEAT_RATE` `DUPLICATE_RATE` `MISSING_REQUIRED_RATE` | NONE · BRANCH (**ไม่มีการผูกพนักงาน**) |
| ณ ตอนนี้ | `OPEN_LEADS` `OPEN_OPPORTUNITIES` `OPEN_PIPELINE_AMOUNT` `OPEN_VISITS` | NONE · BRANCH · TEAM · STAFF · CHANNEL · **STATUS** |
| ณ ตอนนี้ | `OPEN_FOLLOWUP_CUSTOMERS` `TASKS_TODAY` `TASKS_OVERDUE` | NONE · BRANCH · TEAM · STAFF |
| 7 วัน | `WON_LAST_7_DAYS` `WON_LAST_7_DAYS_AMOUNT` | NONE · BRANCH · TEAM · STAFF · CHANNEL |
| อัตรา | `LEAD_RATE` `OPPORTUNITY_RATE` `CLOSE_RATE` `LOST_RATE` `CONV_LEAD_TO_SALE` `CONV_VISIT_TO_SALE` `WALKIN_CONVERSION` `CAPTURE_RATE` `OUTCOME_COMPLETION` | NONE · BRANCH · TEAM · STAFF · CHANNEL |
| อัตรา | `FOLLOWUP_COMPLETION` | NONE · BRANCH · TEAM · STAFF |
| นาที | `LEAD_RESPONSE_MIN` | NONE · BRANCH · TEAM · STAFF · CHANNEL |

**การตัดขอบเขต (CANONICAL ข้อ 9.4.1 · 12.4):** `scope.branch` = สาขาที่ผู้เรียกมีสิทธิ์ระดับ BRANCH/ORGANIZATION (นับทุกแถว) · `scope.team` = สาขาที่เป็น TEAM (นับเฉพาะ owner ∈ สมาชิกทีมที่ตนเป็นหัวหน้า) · `scope.own` = สาขาที่เป็น OWN (นับเฉพาะ owner = ตน) · **ผูกด้วย owner เท่านั้น ไม่ใช้ `created_by` สำรอง** · เมื่อ `partial = true` (มีสาขา TEAM/OWN ปน) KPI ที่ไม่มีการผูกพนักงานคืน `value = NULL`

**ข้อผิดพลาด:** `42501 ไม่มีสิทธิ์ dashboard.view …` · `42501 ไม่มีสาขาที่คุณมีสิทธิ์ dashboard.view ในรายการที่ขอ (ข้อ 9.4.1)` · `42501 ต้องมีสิทธิ์ report.staff_performance ในทุกสาขาที่ขอ (ข้อ 9.4.1)` · `22023 p_preset ไม่ถูกต้อง: X (ข้อ 12.0)` · `22023 CUSTOM ต้องส่ง p_start และ p_end` · `22023 ช่วง CUSTOM ต้องยาว 1–366 วัน` · `22023 p_group_by ต้องเป็น NONE · BRANCH · TEAM · STAFF · CHANNEL · STATUS`

**ตัวอย่าง** — Dashboard ของจ๋าอั๋น (EXECUTIVE · ทุกสาขา · 30 วันล่าสุด) ตาม CANONICAL ข้อ 13.1

```jsonc
{ "p_preset": "LAST_30_DAYS", "p_branch_ids": null, "p_group_by": "NONE" }
```

```jsonc
{ "ok": true, "preset": "LAST_30_DAYS", "group_by": "NONE",
  "clock": "2026-09-11T03:24:00+00:00",
  "period": { "start": "2026-08-12T17:00:00+00:00", "end": "2026-09-11T17:00:00+00:00",
              "cmp_start": "2026-07-13T17:00:00+00:00", "cmp_end": "2026-08-12T17:00:00+00:00" },
  "scope": { "partial": false },
  "rows": [
    { "code": "VISITS",            "kind": "COUNT", "value": 3125, "prev_value": 2790,
      "display": "3,125", "change_display": "+12%" },
    { "code": "UNIQUE_CUSTOMERS",  "kind": "COUNT", "value": 1284, "prev_value": 1146,
      "display": "1,284", "change_display": "+12%" },
    { "code": "NEW_CUSTOMERS",     "kind": "COUNT", "value": 809,  "display": "809" },
    { "code": "RETURNING_CUSTOMERS","kind": "COUNT","value": 475,  "display": "475" },
    { "code": "LEADS",             "kind": "COUNT", "value": 892,  "prev_value": 826,
      "display": "892", "change_display": "+8%" },
    { "code": "OPPORTUNITIES",     "kind": "COUNT", "value": 368,  "prev_value": 323,
      "display": "368", "change_display": "+14%" },
    { "code": "SALES",             "kind": "COUNT", "value": 215,  "prev_value": 182,
      "display": "215", "change_display": "+18%" },
    { "code": "SALES_AMOUNT",      "kind": "MONEY", "value": 3332700, "prev_value": 3051760,
      "display": "฿3,332,700", "change_display": "+9%" },
    { "code": "CONV_LEAD_TO_SALE", "kind": "RATE",  "value": 0.2410313901,
      "numerator": 215, "denominator": 892, "prev_value": 0.2203389831,
      "display": "24.1%", "change_display": "+2.1 pp" },
    { "code": "CAPTURE_RATE",      "kind": "RATE",  "value": 0.87008,
      "display": "87.0%", "target_met": false } ] }
```

> หมายเหตุ: ช่วง `[13 ส.ค. 2569, 12 ก.ย. 2569)` Asia/Bangkok = `[2026-08-12T17:00Z, 2026-09-11T17:00Z)` ตามที่ `app.bkk_ts` คืน

#### 3.5.2 `api.get_report(p_code text, p_preset text DEFAULT 'LAST_30_DAYS', p_start date DEFAULT NULL, p_end date DEFAULT NULL, p_branch_ids uuid[] DEFAULT NULL, p_params jsonb DEFAULT '{}') → jsonb`

DEFINER · STABLE · สิทธิ์ **`report.view`** (+ `report.staff_performance` เมื่อ `p_code = 'STAFF'` หรือ `p_params->>'group_by' = 'STAFF'`)

| `p_code` | KPI ที่คืนใน `rows` | `group_by` ปริยาย | `extra` |
|---|---|---|---|
| `OVERVIEW` | `VISITS` `WALKIN_VISITS` `UNIQUE_CUSTOMERS` `NEW_CUSTOMERS` `RETURNING_CUSTOMERS` `LEADS` `OPPORTUNITIES` `SALES` `CONV_LEAD_TO_SALE` | `NONE` | `walkin_by_branch` = แถว `WALKIN_VISITS` จัดกลุ่ม `BRANCH` |
| `CUSTOMERS` | `UNIQUE_CUSTOMERS` `NEW_CUSTOMERS` `RETURNING_CUSTOMERS` `BUYERS` `REPEAT_BUYERS` `REPEAT_RATE` `CAPTURE_RATE` `IDENTIFIED_VISITS` | `NONE` | – |
| `SALES` | `VISITS` `LEADS` `OPPORTUNITIES` `SALES` `SALES_AMOUNT` `CLOSE_RATE` `LOST_RATE` `LOST_OPPORTUNITIES` `LOST_LEADS` `LOST_TOTAL` | `NONE` | `lost_reasons` |
| `CHANNELS` | `UNIQUE_CUSTOMERS` `VISITS` `LEADS` `LEAD_RATE` | `CHANNEL` | `channel_matrix` |
| `STAFF` | **ทุก KPI** | `STAFF` | – |
| `BRANCHES` | **ทุก KPI** | `BRANCH` | – |
| `LOST_REASONS` | `LOST_OPPORTUNITIES` `LOST_LEADS` `LOST_TOTAL` | `NONE` | `lost_reasons` |
| `DATA_QUALITY` | `CAPTURE_RATE` `OUTCOME_COMPLETION` `FOLLOWUP_COMPLETION` `DUPLICATE_RATE` `MISSING_REQUIRED_RATE` | `NONE` | `issues` |

`p_params` รับ `{"group_by": "..."}` เพื่อเปลี่ยนมิติจากค่าปริยาย

**รูปของ `extra`**

| คีย์ | รูป |
|---|---|
| `lost_reasons` | `[{code, label_th, value, lead_value, display, pct, pct_display}]` — **5 อันดับแรก + `_OTHERS` (ป้าย "อื่น ๆ")** เรียงมากไปน้อย · เท่ากันเรียง `ref.lost_reasons.sort_order` · `lead_value` = จำนวนที่มาจาก `crm.leads` (คอลัมน์ "ในนั้นเป็น Lead" ของ CANONICAL ข้อ 13.4) |
| `channel_matrix` | `[{branch_id, branch_code, branch_label, channel_code, value, display}]` — ลูกค้าไม่ซ้ำ × สาขา × `customers.first_channel_code` (ข้อ 13.3) · **`null` เมื่อขอบเขตมีสาขา TEAM/OWN** (ไม่มีการผูกพนักงาน) |
| `issues` | `[{issue_code, branch_id, branch_code, value, display}]` |
| `walkin_by_branch` | แถว KPI รูปเดียวกับ `rows` |

**ตัวอย่าง** — แท็บ "การขาย" ของหน้า 09 (CANONICAL ข้อ 13.4)

```jsonc
{ "p_code": "SALES", "p_preset": "LAST_30_DAYS", "p_branch_ids": null, "p_params": {} }
```

```jsonc
{ "ok": true, "code": "SALES", "preset": "LAST_30_DAYS", "group_by": "NONE",
  "rows": [ { "code": "SALES", "value": 215, "display": "215", "change_display": "+18%" },
            { "code": "SALES_AMOUNT", "value": 3332700, "display": "฿3,332,700" },
            { "code": "CLOSE_RATE", "kind": "RATE", "value": 0.5842391304,
              "numerator": 215, "denominator": 368, "display": "58.4%" },
            { "code": "LOST_TOTAL", "value": 296, "display": "296" } ],
  "extra": { "lost_reasons": [
      { "code": "PRICE",        "label_th": "ราคาสูงไป",        "value": 83, "lead_value": 38,
        "display": "83", "pct": 0.2804054054, "pct_display": "28.0%" },
      { "code": "COMPARING",    "label_th": "รอเปรียบเทียบ",     "value": 53, "lead_value": 27,
        "display": "53", "pct_display": "17.9%" },
      { "code": "NOT_READY",    "label_th": "ลูกค้ายังไม่พร้อม",  "value": 47, "lead_value": 26,
        "display": "47", "pct_display": "15.9%" },
      { "code": "DOCUMENTS",    "label_th": "ติดเรื่องเอกสาร",    "value": 36, "lead_value": 14,
        "display": "36", "pct_display": "12.2%" },
      { "code": "CHANGED_MIND", "label_th": "เปลี่ยนรุ่น/เปลี่ยนใจ", "value": 30, "lead_value": 13,
        "display": "30", "pct_display": "10.1%" },
      { "code": "_OTHERS",      "label_th": "อื่น ๆ",            "value": 47, "lead_value": 25,
        "display": "47", "pct_display": "15.9%" } ] } }
```

#### 3.5.3 `api.list_data_quality_issues(p_issue_code text DEFAULT NULL, p_branch_ids uuid[] DEFAULT NULL) → jsonb`

DEFINER · STABLE · สิทธิ์ **`data_quality.view`** (scope O = รายการที่ตนเป็น owner · T = สมาชิกทีมที่ตนเป็นหัวหน้า · B/G = ทั้งสาขา/องค์กร)

`p_issue_code` ∈ `DUPLICATE_SUSPECTED` · `MISSING_PHONE` · `INVALID_PHONE` · `LEAD_WITHOUT_OWNER` · `LEAD_WITHOUT_OUTCOME` · `OVERDUE_FOLLOWUP` · `INCOMPLETE_CUSTOMER` · `WON_WITHOUT_TRANSACTION` · `VISIT_UNRECORDED` · `NULL` = ทุกชนิด

```jsonc
{ "ok": true, "issue_code": null, "branch_ids": ["<uuid:JP1>"], "total": 54,
  "counts": [ { "issue_code": "DUPLICATE_SUSPECTED", "branch_id": "<uuid:JP1>",
                "branch_code": "JP1", "value": 5 },
              { "issue_code": "MISSING_PHONE", "branch_code": "JP1", "value": 7 } ],
  "rows":   [ { "issue_code": "DUPLICATE_SUSPECTED", "entity_type": "DUPLICATE_DECISION",
                "entity_id": "<uuid>", "customer_id": "<uuid:CUS-2026-006633>",
                "branch_id": "<uuid:JP1>", "owner_staff_id": "<uuid:ST-0046>",
                "detected_at": "2026-09-03T..." } ] }
```

- `counts` คืน**ทุกชนิด**เสมอ (ไม่ขึ้นกับ `p_issue_code`) เพื่อให้หน้า 12 แสดงป้ายจำนวนของทุกแท็บได้จากคำเรียกเดียว
- รายการระดับลูกค้าผูกสาขาด้วย `first_branch_id` (CANONICAL ข้อ 12.3)
- ตัวเลขตัวอย่างของ JP1 ตาม CANONICAL ข้อ 13.12: `DUPLICATE_SUSPECTED` 5 · `MISSING_PHONE` 7 · `INVALID_PHONE` 2 · `LEAD_WITHOUT_OWNER` 2 · `LEAD_WITHOUT_OUTCOME` 6 · `OVERDUE_FOLLOWUP` 6 · `INCOMPLETE_CUSTOMER` 13 · `WON_WITHOUT_TRANSACTION` 4 · `VISIT_UNRECORDED` 9
- **ข้อผิดพลาด:** `22023 p_issue_code ไม่ถูกต้อง (ข้อ 12.3)` · `42501 ไม่มีสาขาที่คุณมีสิทธิ์ data_quality.view ในรายการที่ขอ (ข้อ 8.1)`

#### 3.5.4 `api.record_report_export(p_code text, p_params jsonb DEFAULT '{}') → jsonb`

DEFINER · VOLATILE · สิทธิ์ **`report.export`** · `p_code` ชุดเดียวกับ `api.get_report`

Route Handler ต้องเรียก **ก่อน** ส่งไฟล์รายงานเสมอ (CANONICAL ข้อ 14.8) · ไฟล์รายงานเป็นตัวเลขรวม **ไม่มี PII** และไม่ต้องขออนุมัติ

```jsonc
{ "p_code": "BRANCHES", "p_params": { "preset": "LAST_30_DAYS", "branch_ids": ["<uuid:JP1>"] } }
→ { "ok": true, "code": "BRANCHES", "params": {...}, "exported_at": "2026-09-11T03:24:00+00:00" }
```

**ผลข้างเคียง:** audit `REPORT_EXPORTED` (`entity_type = 'EXPORT'` · `entity_id` = `entity_ref` = `p_code` · `after` = `p_params`)

---

### 3.6 การส่งออกข้อมูลลูกค้า (CANONICAL ข้อ 8.2)

#### 3.6.1 `api.request_export(p jsonb) → jsonb`

DEFINER · VOLATILE · **ต้อง aal2** (ตรวจ `app.is_aal2()` โดยตรง) และต้องมี assignment ที่ยังมีผลของบทบาทที่ยื่น

| คีย์ใน `p` | ชนิด | บังคับ | ค่า |
|---|---|:--:|---|
| `requested_as_role` | text | ✓ | `BRANCH_MANAGER` · `MARKETING` · `BUSINESS_ADMIN` · `EXECUTIVE` (ต้องเป็นบทบาทที่ผู้เรียกถืออยู่จริงและมี `customer.export`) |
| `reason_code` | text | ✓ | `ref.export_reasons` ที่ `is_active` |
| `reason_note` | text | เงื่อนไข | บังคับเมื่อ `reason_code = 'OTHER'` |
| `filter` | jsonb | – | `lifecycle_stage[]` · `first_channel_code[]` · `province_code[]` · `last_activity_from` · `last_activity_to` · `tag_codes[]` |

**การตัดสิน**

1. ขอบเขตสาขา: scope `ORGANIZATION` → ทุกสาขาขององค์กร · มิฉะนั้น = สาขาของ assignment ของบทบาทนั้น
2. เหตุผลที่ `is_marketing = true` → นับเฉพาะลูกค้าที่ยินยอม `MARKETING` (`GRANTED`) **ทุกบทบาท**
3. นับจำนวนแถวที่เข้าเกณฑ์ → เทียบ `export.limits[role].max_rows`
4. สถานะที่ได้: เกินเพดานแถว → **`REJECTED`** (บันทึกแถวและ **นับครั้งต่อวัน**) · `BRANCH_MANAGER` ไม่เกินเพดาน → **`APPROVED` ทันที** (`approved_by` = NULL) · บทบาทอื่น → `REQUESTED`
5. `filter` ที่บันทึกถูกเติม `columns` = whitelist ของบทบาทนั้นเพื่อให้ `generate-export` ใช้ค่าที่บันทึกตอนยื่น

**เพดานตาม `app.settings['export.limits']` (ค่าเริ่มต้น · CANONICAL ข้อ 8.2 **[รอยืนยันตัวเลข]**)**

| บทบาทที่ยื่น | `max_rows` | `per_day` | `approver_role` | คอลัมน์ที่ได้ (`app.export_columns`) |
|---|---:|---:|---|---|
| `BRANCH_MANAGER` | 500 | 3 | – (อนุมัติทันที) | `customer_no` `display_name` `lifecycle_stage` `first_channel_code` `province_code` `last_activity_at` `phone_masked` |
| `MARKETING` | 5,000 | 2 | `BUSINESS_ADMIN` | `customer_no` `display_name` `phone` `email` `line_id` — **แต่ละช่องทางคืนค่าก็ต่อเมื่อความยินยอม `MARKETING` ครอบคลุมช่องทางนั้น** (`PHONE`/`SMS` → phone · `EMAIL` → email · `LINE` → line_id) |
| `BUSINESS_ADMIN` | 5,000 | 5 | `EXECUTIVE` | โปรไฟล์ + `phone` `email` `line_id` + `tags` + `consents` |
| `EXECUTIVE` | 5,000 | 5 | `BUSINESS_ADMIN` **[รอยืนยัน Q23]** | เหมือน BUSINESS_ADMIN |

ไม่มีบทบาทใดได้ **โน้ต · สรุปการติดต่อ · สรุปธุรกรรม · IMEI**

**ผลลัพธ์**

```jsonc
{ "ok": true,  "export_id": "<uuid>", "export_no": "EX-2026-000032",
  "status": "REQUESTED|APPROVED", "row_count": 1850, "max_rows": 5000, "code": null }
{ "ok": false, "export_id": "<uuid>", "export_no": "EX-2026-000033",
  "status": "REJECTED", "row_count": 7200, "max_rows": 5000,
  "code": "EXPORT_ROW_LIMIT_EXCEEDED" }
```

**ผลข้างเคียง:** INSERT `audit.export_requests` · audit `EXPORT_REQUESTED` · แจ้ง `EXPORT_APPROVAL_REQUIRED` ถึงผู้ถือ `approver_role` ทุกคน (ยกเว้นผู้ขอ) เมื่อสถานะ `REQUESTED`

**ข้อผิดพลาด:** `22023 requested_as_role ต้องเป็น …` · `42501 ไม่มีสิทธิ์ยื่นคำขอส่งออกในบทบาทนี้ (ต้องยืนยัน MFA)` · `22023 ต้องเลือกเหตุผลการส่งออก` · `22023 เหตุผล "อื่น ๆ" ต้องระบุหมายเหตุ` · `42501 ยื่นคำขอส่งออกครบ N ครั้งของวันนี้แล้ว`

**ตัวอย่าง** — คุณมายด์ (MARKETING) ยื่น `EX-2026-000031` (CANONICAL ข้อ 13.14)

```jsonc
{ "p": { "requested_as_role": "MARKETING", "reason_code": "MARKETING_CAMPAIGN",
         "filter": { "lifecycle_stage": ["CUSTOMER", "REPEAT"] } } }
```

```jsonc
{ "ok": true, "export_id": "<uuid>", "export_no": "EX-2026-000031",
  "status": "REQUESTED", "row_count": 1850, "max_rows": 5000, "code": null }
```

#### 3.6.2 `api.decide_export(p_export_id uuid, p_approve boolean, p_note text DEFAULT NULL) → jsonb`

DEFINER · VOLATILE · สิทธิ์ **`export.approve` 🔐** · ผู้อนุมัติ **ต้องถือบทบาทที่ตรงกับ `export.limits[requested_as_role].approver_role`** และ **ไม่ใช่ผู้ขอ**

- คำขอต้องอยู่สถานะ `REQUESTED` มิฉะนั้น `P0001 คำขอนี้ตัดสินแล้ว`
- ผล: `status = APPROVED` (ตั้ง `approved_by`) หรือ `REJECTED` · `decided_at = now()` · `decision_note`
- audit `EXPORT_DECIDED` (before/after ของ `status`) · แจ้ง `EXPORT_DECIDED` ถึงผู้ขอ
- หลังอนุมัติ Next.js เรียก Edge Function `generate-export` ด้วย JWT ของผู้ตัดสิน (ข้อ 5.2)

```jsonc
{ "p_export_id": "<uuid:EX-2026-000031>", "p_approve": true, "p_note": "ตรวจตัวกรองแล้ว" }
→ { "ok": true, "export_id": "<uuid>", "export_no": "EX-2026-000031", "status": "APPROVED" }
```

#### 3.6.3 `api.record_export_download(p_export_id uuid) → jsonb`

DEFINER · VOLATILE · **ผู้ขอเท่านั้น** · ต้อง aal2 · เรียกโดย Edge Function `generate-export` ด้วย **JWT ของผู้ขอ** ก่อนออก signed URL

เงื่อนไขทั้งหมด: `requested_by = ผู้เรียก` · `app.is_aal2()` · สถานะ `GENERATED`/`DOWNLOADED` · `download_count < export.max_downloads` (3) · `now() < generated_at + export.link_ttl_hours` (24 ชม.)

```jsonc
{ "ok": true, "export_id": "<uuid>", "export_no": "EX-2026-000031",
  "file_path": "exports/EX-2026-000031__ST-0011__20260911-1024.csv", "download_count": 1 }
```

> **`file_path` ถูกคืนที่นี่ที่เดียว** เพื่อให้ `generate-export` ออก signed URL 60 วินาทีได้ (system-architecture หมายเหตุ E13) · `audit.export_requests.file_path` อยู่ใน schema ที่ไม่เปิด API · รูปแบบชื่อไฟล์เต็ม **รอยืนยัน** (ข้อ 5.3)

**ผลข้างเคียง:** `download_count + 1` · `last_downloaded_at` · `status = 'DOWNLOADED'` · audit `EXPORT_DOWNLOADED`
**ข้อผิดพลาด:** `42501 ไม่พบคำขอส่งออกนี้` (รวมกรณีไม่ใช่ผู้ขอ) · `42501 ต้องยืนยัน MFA ก่อนดาวน์โหลดไฟล์ส่งออก` · `P0001 ไฟล์ยังไม่พร้อมดาวน์โหลดหรือหมดอายุแล้ว` · `42501 ดาวน์โหลดครบ 3 ครั้งแล้ว` · `42501 ลิงก์ดาวน์โหลดหมดอายุแล้ว`

#### 3.6.4 `api.list_export_requests(p jsonb DEFAULT '{}') → jsonb`

DEFINER · STABLE · ต้องมี `customer.export` **หรือ** `export.approve`

คืนแถวที่ **ผู้เรียกเป็นผู้ขอ** หรือ **ผู้เรียกถือบทบาทผู้อนุมัติของคำขอนั้น** · `p.status` กรองสถานะ · `p.limit` (ค่าเริ่มต้น 200) · **ไม่คืน `file_path`**

```jsonc
{ "ok": true, "requests": [
  { "export_id": "<uuid>", "export_no": "EX-2026-000031", "requested_by": "<uuid:ST-0011>",
    "requested_as_role": "MARKETING", "requested_at": "2026-09-10T09:20:00+00:00",
    "reason_code": "MARKETING_CAMPAIGN", "reason_note": null, "row_count": 1850,
    "status": "REQUESTED", "approved_by": null, "decided_at": null, "decision_note": null,
    "generated_at": null, "download_count": 0, "last_downloaded_at": null, "is_mine": false },
  { "export_no": "EX-2026-000030", "requested_as_role": "BRANCH_MANAGER",
    "reason_code": "MANAGEMENT_REPORT", "row_count": 412, "status": "EXPIRED",
    "download_count": 1, "is_mine": false } ] }
```

---

### 3.7 Audit และ security log (CANONICAL ข้อ 9.5)

`audit.*` ไม่มี GRANT ให้ `authenticated` → อ่านได้ผ่าน RPC สามตัวนี้เท่านั้น และทุกตัว **คืนค่าที่ปิดบังไว้แล้วในฐานข้อมูล** (ไม่มีการถอดรหัส)

#### 3.7.1 `api.search_audit(p jsonb DEFAULT '{}') → jsonb`

DEFINER · STABLE · สิทธิ์ **`audit.read`** (EXECUTIVE · BUSINESS_ADMIN)

| คีย์ใน `p` | ชนิด | ความหมาย |
|---|---|---|
| `entity_type` | text | รหัสของ CANONICAL ข้อ 9.5 (`CUSTOMER` `LEAD` `OPPORTUNITY` `VISIT` `TASK` `STAFF` `EXPORT` `DSR` `SETTING` `REF` `DUPLICATE_DECISION` …) · `app.audit_entity_types()` ขยายเป็นทั้งรหัสและชื่อ `schema.table` ที่ trigger เขียนไว้ |
| `entity_id` | text | ค่า `entity_id` ตรงทั้งค่า |
| `entity_ref` | text | เลขอ้างอิง เช่น `LD-2026-007512` |
| `action` | text | ชื่อ action เช่น `OPPORTUNITY_WON` |
| `actor_staff_id` | uuid | ผู้กระทำ |
| `from` · `to` | timestamptz | ช่วงเวลา `[from, to)` |
| `limit` | int | ค่าเริ่มต้น 200 · เพดาน 200 |

```jsonc
{ "ok": true, "entries": [
  { "id": "<bigint>", "occurred_at": "2026-09-10T11:05:00+00:00",
    "actor_staff_id": "<uuid:ST-0020>", "actor_staff_code": "ST-0020",
    "actor_label": "คุณเจ", "actor_roles": ["BRANCH_MANAGER"], "aal": "aal2",
    "action": "LEAD_ASSIGNED", "entity_type": "crm.leads", "entity_id": "<uuid>",
    "entity_ref": "LD-2026-007512", "branch_id": "<uuid:JP1>",
    "changed_fields": ["owner_staff_id"],
    "before": { "owner_staff_id": "<uuid:ST-0045>" },
    "after":  { "owner_staff_id": "<uuid:ST-0046>" },
    "reason": "SHIFT_CHANGE" } ] }
```

เรียง `occurred_at DESC, id DESC` · จำกัดที่องค์กรของผู้เรียก

#### 3.7.2 `api.get_entity_history(p_entity_type text, p_entity_id uuid) → jsonb`

DEFINER · STABLE · **สิทธิ์:** `audit.read` **หรือ** (เฉพาะ `CUSTOMER`) `customer.update` บนลูกค้ารายนั้น — ใช้กับแท็บ "ประวัติการแก้ไข" ของหน้า 05

เมื่อ `p_entity_type = 'CUSTOMER'` จะรวมแถวของตารางลูกที่ `before/after` มี `customer_id` เท่ากับลูกค้ารายนั้นด้วย (ช่องทางติดต่อ · โน้ต · ความยินยอม)

```jsonc
{ "ok": true, "entity_type": "CUSTOMER", "entity_id": "<uuid:CUS-2025-007321>",
  "entries": [ { "occurred_at": "2026-09-10T11:42:00+00:00", "actor_staff_code": "ST-0045",
                 "actor_label": "คุณขวัญ", "aal": "aal1", "action": "CUSTOMER_CONTACT_UPDATED",
                 "entity_type": "crm.customer_contacts", "changed_fields": ["value_raw"],
                 "before": { "value_raw": { "masked": "081-XXX-1234", "sha256": "…" } },
                 "after":  { "value_raw": { "masked": "089-XXX-5678", "sha256": "…" } },
                 "reason": null } ] }
```

**ข้อผิดพลาด:** `22023 ต้องระบุ entity_type และ entity_id` · `42501 ไม่มีสิทธิ์ดูประวัติการแก้ไขของลูกค้ารายนี้`

#### 3.7.3 `api.search_security_log(p jsonb DEFAULT '{}') → jsonb`

DEFINER · STABLE · สิทธิ์ **`security_log.read`** (EXECUTIVE · BUSINESS_ADMIN · SYSTEM_ADMIN)

คืนสองชุด · `p` รับ `from` · `to` · `limit` (เพดาน 200 ต่อชุด)

| ชุด | เนื้อหา |
|---|---|
| `login_events` | `id` `occurred_at` `user_id` `staff_id` `event_type` `method` `success` `failure_reason` `aal` `ip` `device_id` |
| `audit_entries` | `audit.audit_logs` เฉพาะ action `ROLE_*` · `STAFF_*` · `MFA_*` · `PERMISSION_CHANGED` · `SETTINGS_UPDATED` · `INTEGRATION_UPDATED` และ **ตัด `entity_type` ที่เป็นลูกค้า/ช่องทางติดต่อออก** |

**ไม่คืน `audit.access_logs`** และไม่คืนรายการที่ `entity_type` เป็นลูกค้า (CANONICAL ข้อ 9.5)

---

### 3.8 สิทธิ์ของฉัน · บทบาท · ผู้ใช้ · ทีม · อุปกรณ์ · ค่าตั้ง

#### 3.8.1 `api.get_my_access() → jsonb`

DEFINER · STABLE · **ผู้ใช้ที่เข้าสู่ระบบทุกคน** (รวมบัญชี `INVITED`) · ใช้สร้างเมนู ซ่อนปุ่ม และตัดสินว่าต้องบังคับยืนยัน MFA หรือไม่

```jsonc
{ "ok": true, "aal": "aal1",
  "staff": { "staff_id": "<uuid:ST-0045>", "staff_code": "ST-0045", "display_name": "คุณขวัญ",
             "nickname": null, "email": "kwan@example.com", "status": "ACTIVE",
             "organization_id": "<uuid:JAUN>", "invite_expires_at": null },
  "roles": [ { "role_code": "STAFF", "branch_id": "<uuid:JP1>", "branch_code": "JP1",
               "rank": 10, "requires_mfa": false, "effective_now": true } ],
  "permissions": [ { "permission_code": "customer.read", "scope": "BRANCH",
                     "branch_id": "<uuid:JP1>", "requires_aal2": false,
                     "requires_mfa": false, "effective_now": true },
                   { "permission_code": "customer.update", "scope": "OWN", ... } ],
  "branches": [ { "branch_id": "<uuid:JP1>", "code": "JP1", "name_th": "JAUNPHONE 1" } ],
  "unread_notifications": 6 }
```

- `roles` และ `permissions` คืน **ทุก assignment ที่ยังมีผลตามเวลา โดยไม่กรอง aal** พร้อมธง `requires_mfa` · `requires_aal2` · `effective_now`
  → UI ใช้ `effective_now = false` แสดงสถานะ "ต้องยืนยัน MFA" แทนการซ่อนเมนูทั้งหมด (permission-matrix ข้อ 5.0)
- `unread_notifications` = จำนวนแถว `crm.notifications` ที่ `read_at IS NULL` ของตน (ตัวเลขบนกระดิ่ง · ตัวอย่างตาม CANONICAL ข้อ 13.14: คุณขวัญ 6 · คุณคิม 5 · คุณนัท 3 · คุณเจ 4 · คุณแพร 1 · จ๋าอั๋น 1 · คนอื่น 0)
- ไม่พบ staff ของ `auth.uid()` → `42501 JCRM-T00`

#### 3.8.2 `api.can_assign_role(p_target_staff_id uuid, p_role_code text, p_branch_id uuid DEFAULT NULL) → boolean`

DEFINER · STABLE · **คืน boolean ไม่ raise** · `p_target_staff_id = NULL` ใช้ตรวจตอนเชิญบัญชีใหม่
Edge Function `invite-staff` เรียกฟังก์ชันนี้ **ด้วย JWT ของผู้เชิญ** ก่อนใช้ service_role (CANONICAL ข้อ 7.3 ข้อ 2)

เหตุผลที่ทำให้คืน `false` (ตรรกะของ `app.assign_role_denial` · ข้อความใช้ในหน้า 13):

| เงื่อนไข | ข้อความ |
|---|---|
| ไม่มี `role.assign` (หรือไม่ใช่ aal2) | ไม่มีสิทธิ์มอบบทบาท (ต้องยืนยัน MFA) |
| บทบาทไม่มีอยู่ | ไม่พบบทบาทนี้ |
| มอบให้ตนเอง | ห้ามมอบบทบาทของตนเอง |
| `EXECUTIVE`/`BUSINESS_ADMIN`/`SYSTEM_ADMIN` | บทบาทนี้ต้องยื่นคำขอ (`api.request_role_grant`) |
| rank ≥ rank สูงสุดของตน (หรือบทบาทไม่มี rank) | มอบบทบาทที่ระดับเท่ากับหรือสูงกว่าของตนไม่ได้ |
| บทบาทสาขา/องค์กรกับ `p_branch_id` ไม่สอดคล้อง | บทบาทสาขาต้องระบุสาขา · บทบาทระดับองค์กรต้องไม่ระบุสาขา |
| ผู้มอบเป็น BRANCH_MANAGER และขอมอบนอก `STAFF`/`SUPERVISOR` หรือนอกสาขาตน | ผู้จัดการสาขามอบได้เฉพาะ STAFF และ SUPERVISOR ในสาขาของตน |
| ผู้มอบระดับองค์กรแต่บทบาทไม่อยู่ใน `STAFF` `SUPERVISOR` `BRANCH_MANAGER` `MARKETING` `OPERATIONS` | บทบาทนี้มอบผ่านหน้านี้ไม่ได้ |
| บัญชีเป้าหมาย `DISABLED` | ห้ามมอบบทบาทให้บัญชีที่ปิดใช้งาน |
| เป้าหมายเป็น SYSTEM_ADMIN | SYSTEM_ADMIN ถือร่วมกับบทบาทธุรกิจไม่ได้ |
| เป้าหมายถูกเชิญโดย SYSTEM_ADMIN และยังไม่ยืนยันตัวตน | ต้องให้ BUSINESS_ADMIN ยืนยันตัวตนกับ HR ก่อน |
| มอบ `MARKETING` ให้บัญชีที่เป็น BUSINESS_ADMIN | ห้ามถือ MARKETING ร่วมกับ BUSINESS_ADMIN ในบัญชีเดียว **[รอยืนยัน Q22]** |

#### 3.8.3 `api.assign_role(...)` · `api.revoke_role(...)`

```text
api.assign_role(p_target_staff_id uuid, p_role_code text, p_branch_id uuid DEFAULT NULL, p_reason text DEFAULT NULL) → jsonb
api.revoke_role(p_assignment_id uuid, p_reason text) → jsonb
```

DEFINER · VOLATILE · สิทธิ์ **`role.assign` 🔐**

- `assign_role` ล็อก `core.staff_profiles` ด้วย `FOR UPDATE` ก่อนตรวจ (กันการแข่งกับการมอบ SYSTEM_ADMIN · CANONICAL ข้อ 7.1) → ใช้เหตุผลเดียวกับ `can_assign_role` · **`p_reason` บังคับ** · INSERT `core.staff_role_assignments` (`valid_from = now()` · `granted_by` · `grant_reason`) → audit `ROLE_GRANTED`
- `revoke_role` แก้ได้เฉพาะ `valid_to` `revoked_by` `revoke_reason` (CANONICAL ข้อ 7.1) · ห้ามถอนของตนเอง · `EXECUTIVE`/`BUSINESS_ADMIN`/`SYSTEM_ADMIN` ต้องใช้คำขอชนิด `REVOKE` → audit `ROLE_REVOKED`

```jsonc
{ "p_target_staff_id": "<uuid:ST-0046>", "p_role_code": "SUPERVISOR",
  "p_branch_id": "<uuid:JP1>", "p_reason": "รับหน้าที่หัวหน้าทีมแทนช่วงลา" }
→ { "ok": true, "assignment_id": "<uuid>", "staff_id": "<uuid:ST-0046>",
    "role_code": "SUPERVISOR", "branch_id": "<uuid:JP1>" }
```

**ข้อผิดพลาดที่พบบ่อย:** `42501 <เหตุผลจากตารางข้อ 3.8.2>` · `22023 ต้องระบุเหตุผลของการมอบบทบาท` · `42501 ห้ามถอนบทบาทของตนเอง` · `42501 บทบาทนี้ถอนผ่านคำขอชนิด REVOKE เท่านั้น` · `P0001 บทบาทนี้ถอนหรือหมดอายุแล้ว`

#### 3.8.4 `api.request_role_grant(p_target_staff_id uuid, p_role_code text, p_request_type text DEFAULT 'GRANT', p_reason text DEFAULT NULL) → jsonb`

DEFINER · VOLATILE · สิทธิ์ **`role.request`** (SYSTEM_ADMIN เท่านั้นตาม CANONICAL ข้อ 8.1)

- `p_role_code` ∈ `SYSTEM_ADMIN` · `EXECUTIVE` · `BUSINESS_ADMIN` · `p_request_type` ∈ `GRANT` · `REVOKE`
- ห้ามยื่นให้ตนเอง · `GRANT` ห้ามให้บัญชี `DISABLED` · ห้ามให้ SYSTEM_ADMIN ถือร่วมกับบทบาทธุรกิจ (ทั้งสองทิศ) · `REVOKE` ต้องมีบทบาทนั้นอยู่จริง
- ผล: INSERT `core.role_grant_requests` เลข `RG-YYYY-NNNN` → audit `ROLE_GRANT_REQUESTED` → แจ้ง `ROLE_GRANT_APPROVAL_REQUIRED` ถึง **EXECUTIVE ทุกคน ยกเว้นผู้รับ**

```jsonc
{ "p_target_staff_id": "<uuid:ST-0051>", "p_role_code": "SYSTEM_ADMIN",
  "p_request_type": "GRANT", "p_reason": "รับหน้าที่ดูแลระบบร่วม" }
→ { "ok": true, "request_id": "<uuid>", "request_no": "RG-2026-0003",
    "role_code": "SYSTEM_ADMIN", "request_type": "GRANT" }
```

#### 3.8.5 `api.decide_role_grant(p_request_id uuid, p_approve boolean, p_note text DEFAULT NULL) → jsonb`

DEFINER · VOLATILE · สิทธิ์ **`role.decide` 🔐** (EXECUTIVE)

**กติกาผู้ตัดสิน (CANONICAL ข้อ 7.2):** ต้องไม่ใช่ผู้ยื่น · ไม่ใช่ผู้รับ · **ไม่ใช่บัญชีที่มี `employee_code` เดียวกับผู้รับ** · คำขอต้องเป็น `REQUESTED`

- อนุมัติ `GRANT` → INSERT assignment (`branch_id = NULL`) · ถ้าเป็น `EXECUTIVE`/`BUSINESS_ADMIN` ที่ SYSTEM_ADMIN เป็นผู้เชิญและยังไม่ยืนยันตัวตน → **ผู้อนุมัติยืนยันตัวตนแทน** (ตั้ง `identity_verified_by/at`) ตาม bootstrap ของ CANONICAL ข้อ 7.2
- อนุมัติ `REVOKE` → ตั้ง `valid_to = now()` ทุก assignment ของบทบาทนั้น · **ปฏิเสธถ้าจะทำให้องค์กรไม่เหลือ `EXECUTIVE`/`BUSINESS_ADMIN` ที่ ACTIVE**
- audit `ROLE_GRANT_DECIDED` + `ROLE_GRANTED`/`ROLE_REVOKED` · แจ้ง `ROLE_GRANT_DECIDED` ถึงผู้ยื่น

```jsonc
{ "p_request_id": "<uuid:RG-2026-0003>", "p_approve": true, "p_note": "ยืนยันกับ HR แล้ว" }
→ { "ok": true, "request_id": "<uuid>", "request_no": "RG-2026-0003", "status": "APPROVED" }
```

**ข้อผิดพลาด:** `P0001 คำขอนี้ตัดสินแล้ว` · `42501 ผู้ตัดสินต้องไม่ใช่ผู้ยื่นหรือผู้รับ` · `42501 ผู้ตัดสินต้องไม่ใช่บัญชีที่มีรหัสพนักงานเดียวกับผู้รับ` · `42501 องค์กรต้องเหลือ {role} ที่ใช้งานอยู่อย่างน้อย 1 บัญชี`

#### 3.8.6 `api.list_role_grant_requests(p jsonb DEFAULT '{}') → jsonb`

DEFINER · STABLE · ต้องมี `role.decide` **หรือ** `role.request` **หรือ** `user.read`

- `role.decide` → ทุกคำขอขององค์กร · `role.request` → คำขอที่ตนยื่น · `user.read` → คำขอที่ผู้รับอยู่ในขอบเขต `user.read` ของตน
- `p.status` กรองสถานะ (`REQUESTED` `APPROVED` `REJECTED`)
- คืนข้อมูลที่หน้าอนุมัติต้องใช้ครบตาม CANONICAL ข้อ 7.2: `target_email` `target_employee_code` `invited_by` `invited_at`

```jsonc
{ "ok": true, "requests": [
  { "request_id": "<uuid>", "request_no": "RG-2026-0003", "role_code": "SYSTEM_ADMIN",
    "request_type": "GRANT", "target_staff_id": "<uuid:ST-0051>", "target_staff_code": "ST-0051",
    "target_display_name": "คุณโอ๊ต", "target_email": "oat@example.com",
    "target_employee_code": "…", "target_status": "INVITED",
    "invited_by": "<uuid:ST-0003>", "invited_at": "2026-09-10T…",
    "requested_by": "<uuid:ST-0003>", "requested_at": "2026-09-11T02:12:00+00:00",
    "request_reason": null, "status": "REQUESTED",
    "decided_by": null, "decided_at": null, "decision_note": null } ] }
```

#### 3.8.7 `api.activate_self() → jsonb`

DEFINER · VOLATILE · **ยกเว้นกติกา F2** (บัญชียังเป็น `INVITED` จึงใช้ `auth.uid()` ตรง)

เงื่อนไข: มี staff ของ `auth.uid()` · สถานะ `INVITED` · `auth.users.email_confirmed_at` ไม่ว่าง · `invite_expires_at > now()` · ถ้ามีบทบาทใดที่ `requires_mfa` ต้องมี `auth.mfa_factors` ที่ `status = 'verified'`

ผล: `status = 'ACTIVE'` · ล้าง `invite_expires_at` · ปิดคำเชิญ (`accepted_at`) · เรียกซ้ำเมื่อ ACTIVE แล้วคืน `{"ok":true,"status":"ACTIVE","already_active":true}`

```jsonc
{} → { "ok": true, "staff_id": "<uuid>", "staff_code": "ST-0051",
       "status": "ACTIVE", "requires_mfa": true }
```

**ข้อผิดพลาด:** `42501 JCRM-T00` · `42501 ไม่พบบัญชีพนักงานของผู้ใช้นี้` · `42501 บัญชีนี้เปิดใช้งานเองไม่ได้` · `P0001 ต้องยืนยันอีเมลก่อนเปิดใช้งาน` · `P0001 คำเชิญหมดอายุแล้ว ต้องให้ผู้ดูแลเชิญใหม่` · `P0001 บทบาทของคุณต้องลงทะเบียน MFA ก่อนเปิดใช้งาน`

#### 3.8.8 `api.list_staff(p jsonb DEFAULT '{}') → jsonb`

DEFINER · STABLE · สิทธิ์ **`user.read`** · `p.status` กรองสถานะ (`INVITED` `ACTIVE` `DISABLED`)

ขอบเขต: scope `ORGANIZATION` → ทั้งองค์กร · `BRANCH` → บัญชีที่มี assignment ในสาขานั้น · `TEAM` → สมาชิกทีมที่ตนเป็นหัวหน้า · **SYSTEM_ADMIN (scope `SYSTEM`) → เฉพาะบัญชีที่ไม่มีบทบาทธุรกิจ**

```jsonc
{ "ok": true, "staff": [
  { "staff_id": "<uuid>", "staff_code": "ST-0045", "display_name": "คุณขวัญ", "nickname": null,
    "email": "kwan@example.com", "phone": "…", "employee_code": "…", "status": "ACTIVE",
    "identity_verified_by": "<uuid>", "invite_expires_at": null,
    "roles": [ { "assignment_id": "<uuid>", "role_code": "STAFF", "branch_id": "<uuid:JP1>",
                 "valid_from": "…", "valid_to": null } ],
    "teams": [ { "team_id": "<uuid>", "code": "JP1-SALES", "is_leader": false } ] } ] }
```

#### 3.8.9 `api.update_staff(p_staff_id uuid, p jsonb) → jsonb`

DEFINER · VOLATILE · สิทธิ์ **`user.update`** · ล็อกแถวก่อนตรวจด้วย `app.staff_admin_denial` (permission-matrix ข้อ 6.5)

| คีย์ | หมายเหตุ |
|---|---|
| `display_name` · `nickname` · `phone` · `employee_code` | แก้ได้ทุก scope ที่ผ่านการตรวจ |
| `email` | **BRANCH_MANAGER แก้ไม่ได้** (ต้อง scope `ORGANIZATION`) |
| `identity_verified` | `true` + scope `ORGANIZATION` → ตั้ง `identity_verified_by/at` = ผู้เรียก/ตอนนี้ (ยืนยันตัวตนกับ HR) |

**เหตุผลที่ถูกปฏิเสธ:** `42501 ไม่มีสิทธิ์จัดการบัญชีผู้ใช้` · `ไม่พบบัญชีนี้` · `SYSTEM_ADMIN จัดการได้เฉพาะบัญชีที่ไม่มีบทบาทธุรกิจ` · `ผู้จัดการสาขาจัดการได้เฉพาะ STAFF/SUPERVISOR ในสาขาของตน` · `ผู้จัดการสาขาจัดการได้เฉพาะบัญชีที่มีบทบาทในสาขาของตน` · `ผู้จัดการสาขาแก้อีเมลไม่ได้ (ข้อ 7.3 ข้อ 5)`

ผล: `{ "ok": true, "staff_id": "<uuid>" }` · audit `STAFF_UPDATED`

#### 3.8.10 `api.disable_staff(p_staff_id uuid, p_reason text) → jsonb`

DEFINER · VOLATILE · สิทธิ์ **`user.disable` 🔐** · `p_reason` บังคับ · **ห้ามปิดใช้งานตนเอง** · ห้ามปิด `EXECUTIVE`/`BUSINESS_ADMIN` ที่ ACTIVE คนสุดท้าย

**ลำดับงาน (ทรานแซกชันเดียว · CANONICAL ข้อ 7.3 ข้อ 4)**

1. opportunity ที่เปิดอยู่ของผู้ถูกปิด → โอนให้ **ผู้จัดการสาขาของรายการ** (มีหลายคนเลือก `staff_code` น้อยสุด **[รอยืนยัน]**) + `ownership_changes` เหตุผล `STAFF_LEFT`
   **ไม่มีผู้จัดการสาขา → ปฏิเสธทั้งคำสั่ง** (`42501 สาขาของ {OP-…} ไม่มีผู้จัดการสาขารับช่วง · โอนงานด้วย api.assign_owner ก่อน`)
2. lead ที่เปิดอยู่ → `owner_staff_id = NULL` + `ownership_changes` + แจ้ง **`LEAD_UNASSIGNED`** ถึง SUPERVISOR และ BRANCH_MANAGER ของสาขานั้น
3. task ที่เปิดอยู่และ **ไม่ใช่** `is_next_action` → `owner_staff_id = NULL` + `ownership_changes`
4. ทุก assignment → `valid_to = now()` + `revoked_by` + `revoke_reason`
5. `core.staff_profiles.status = 'DISABLED'` (**ห้ามลบแถว**)

จากนั้น Edge Function `disable-staff` ban ผู้ใช้ใน Auth · เพิกถอน session · เรียก `api.svc_finalize_disable`

```jsonc
{ "p_staff_id": "<uuid:ST-0046>", "p_reason": "ลาออก มีผล 30 ก.ย. 2569" }
→ { "ok": true, "staff_id": "<uuid:ST-0046>", "opportunities_reassigned": 28,
    "leads_unassigned": 26, "tasks_unassigned": "<n>" }
```

> ตัวเลข 28 และ 26 ตรงกับ "Opportunity เปิดอยู่ 28" และ "Lead เปิดอยู่ 26" ของคุณคิมใน CANONICAL ข้อ 13.6 · `tasks_unassigned` นับเฉพาะ task ที่ **ไม่ใช่** `is_next_action` จึงขึ้นกับข้อมูลจริง · opportunity ทั้ง 28 รายการย้ายไปที่คุณเจ (`ST-0020` · BRANCH_MANAGER ของ JP1)

#### 3.8.11 `api.save_team(p jsonb) → jsonb` · `api.set_team_member(p_team_id uuid, p_staff_id uuid, p_is_leader boolean DEFAULT false, p_active boolean DEFAULT true) → jsonb`

DEFINER · VOLATILE · สิทธิ์ **`team.manage`** ในสาขาของทีม (`scope_branch_ids('team.manage','BRANCH')`)

- `save_team` คีย์: `team_id` (มี = แก้) · `branch_id` ✓ (เมื่อสร้าง) · `code` ✓ (เมื่อสร้าง · เก็บเป็นตัวพิมพ์ใหญ่) · `name_th` ✓ (เมื่อสร้าง) · `is_active` · การย้ายสาขาต้องมีสิทธิ์ทั้งสาขาเดิมและใหม่
- `set_team_member` เพิ่ม/แก้ `is_leader` เมื่อ `p_active = true` · ถอดสมาชิกด้วย `p_active = false` (ตั้ง `valid_to = now()` ไม่ลบแถว) · สมาชิกต้องมี assignment ที่ยังมีผลในสาขาของทีม (CANONICAL ข้อ 7.1)

```jsonc
{ "p_team_id": "<uuid:JP1-SALES>", "p_staff_id": "<uuid:ST-0030>",
  "p_is_leader": true, "p_active": true }
→ { "ok": true, "team_id": "<uuid>", "staff_id": "<uuid:ST-0030>",
    "member_id": "<uuid>", "is_leader": true, "active": true }
```

#### 3.8.12 `api.register_device(p_device_id text, p_branch_id uuid, p_is_shared_counter boolean DEFAULT false) → jsonb`

DEFINER · VOLATILE · สิทธิ์ **`user.update` scope BRANCH ของสาขานั้น** (CANONICAL ข้อ 9.6) · upsert บน `core.devices.device_id`

อุปกรณ์ที่ `is_shared_counter = true` จะถูกล็อกหน้าจอเมื่อ idle เกิน `app.settings['session.shared_counter_idle_min']` (10 นาที) และซ่อนช่อง "จดจำฉันไว้" (CANONICAL ข้อ 9.2)

```jsonc
{ "p_device_id": "counter-jp1-01", "p_branch_id": "<uuid:JP1>", "p_is_shared_counter": true }
→ { "ok": true, "device_row_id": "<uuid>", "device_id": "counter-jp1-01",
    "branch_id": "<uuid:JP1>", "is_shared_counter": true }
```

#### 3.8.13 `api.get_settings() → jsonb` · `api.update_setting(p_key text, p_value jsonb) → jsonb`

DEFINER · STABLE / VOLATILE · สิทธิ์ตาม **`app.settings.editable_by` ของแต่ละคีย์** (`settings.business` 🔐 = BUSINESS_ADMIN · `settings.system` 🔐 = SYSTEM_ADMIN)

- `get_settings` คืนเฉพาะคีย์ที่ผู้เรียกมีสิทธิ์แก้ → `{ "ok": true, "settings": [ { "key", "value", "editable_by", "updated_by", "updated_at" } ] }`
- `update_setting` ล็อกแถว · ตรวจ `app.has_permission(s.editable_by)` · เขียน audit **`SETTINGS_UPDATED`** (before/after ของ `value`)
- คีย์ทั้งหมดและค่าเริ่มต้นอยู่ใน CANONICAL ข้อ 11.2 · บน prod ต้องตั้ง `clock` = `{"as_of": null}`

```jsonc
{ "p_key": "sla.visitor_waiting_min", "p_value": 10 }
→ { "ok": true, "key": "sla.visitor_waiting_min", "value": 10 }
```

**ข้อผิดพลาด:** `22023 ไม่พบค่าตั้ง {key}` · `42501 ไม่มีสิทธิ์แก้ค่าตั้งนี้ (ต้องมี settings.business และยืนยัน MFA)` · `22023 ต้องระบุค่าใหม่`

---

### 3.9 PDPA: คำขอเจ้าของข้อมูล · ข้อมูลนิรนาม · legal hold · integration log

#### 3.9.1 `api.create_dsr(p jsonb) → jsonb`

DEFINER · VOLATILE · สิทธิ์ **`dsr.create`** (ST · SV · BM · BA) · ถ้าระบุ `customer_id` ต้องมี `dsr.create` บนลูกค้ารายนั้น

| คีย์ | บังคับ | ค่า |
|---|:--:|---|
| `request_type` | ✓ | `ACCESS` · `CORRECTION` · `DELETION` · `OBJECTION` · `WITHDRAW_CONSENT` · `PORTABILITY` |
| `requester_name` | ✓ | ชื่อผู้ยื่น |
| `requester_contact` | – | **เก็บแบบปิดบังเท่านั้น** (`app.mask_pii_text`) |
| `customer_id` | – | ผูกกับลูกค้าถ้าระบุตัวตนได้ |
| `note` | – | ห้ามบันทึกสำเนาบัตร (UI มีคำเตือน) |

ผล: INSERT `crm.data_subject_requests` (เลข `DSR-YYYY-NNNNNN` · `status = 'RECEIVED'` · `due_at = received_at + 30 วัน`) → audit `DSR_CREATED`

```jsonc
{ "p": { "customer_id": "<uuid:CUS-2026-000297>", "request_type": "ACCESS",
         "requester_name": "สมชาย ใจดี", "requester_contact": "081-234-5678",
         "note": "ขอสำเนาข้อมูลที่ร้านเก็บไว้" } }
→ { "ok": true, "dsr_id": "<uuid>", "request_no": "DSR-2026-000001", "status": "RECEIVED" }
```

#### 3.9.2 `api.list_dsr(p jsonb DEFAULT '{}') → jsonb`

DEFINER · STABLE · `dsr.manage` เห็นทั้งหมด · ผู้มี `dsr.create` เห็นเฉพาะคำขอที่ตนรับ · `p.status` กรองสถานะ
คืน: `dsr_id` `request_no` `customer_id` `requester_name` `requester_contact_masked` `request_type` `status` `received_at` `received_by` `due_at` `verification_method` `verified_by` `extended_until` `completed_at` `note`

#### 3.9.3 `api.update_dsr(p_dsr_id uuid, p_status text, p jsonb DEFAULT '{}') → jsonb`

DEFINER · VOLATILE · สิทธิ์ **`dsr.manage` 🔐**

**การเปลี่ยนสถานะที่อนุญาต:** `RECEIVED → VERIFIED|REJECTED` · `VERIFIED → IN_PROGRESS|COMPLETED|REJECTED` · `IN_PROGRESS → COMPLETED|REJECTED` (อื่น → `P0001`)

- ไป `VERIFIED` **ต้องส่ง `p.verification_method`** ∈ `IN_PERSON_ID_SIGHTED` · `OTP_TO_REGISTERED_CONTACT` · `OTHER` → ตั้ง `verified_by` = ผู้เรียก (ค่านี้ใช้บังคับกติกา "ผู้ยืนยัน ≠ ผู้ลบ" ของ `api.anonymize_customer`)
- ไป `COMPLETED` ตั้ง `completed_at = now()`
- คีย์เสริม: `extended_until` · `extension_reason` · `note`

```jsonc
{ "p_dsr_id": "<uuid>", "p_status": "VERIFIED",
  "p": { "verification_method": "IN_PERSON_ID_SIGHTED" } }
→ { "ok": true, "dsr_id": "<uuid>", "status": "VERIFIED", "verified_by": "<uuid:ST-0002>" }
```

#### 3.9.4 `api.build_dsr_package(p_dsr_id uuid) → jsonb`

DEFINER · VOLATILE · สิทธิ์ **`dsr.manage` 🔐** · เฉพาะคำขอชนิด `ACCESS`/`PORTABILITY` ที่สถานะ `VERIFIED`/`IN_PROGRESS` และผูกลูกค้าแล้ว

คืนข้อมูลของลูกค้ารายเดียว **ไม่ผ่านเพดาน export** (CANONICAL ข้อ 10.4):

```jsonc
{ "ok": true, "dsr_id": "<uuid>", "request_no": "DSR-2026-000001",
  "customer_id": "<uuid:CUS-2026-000297>",
  "package": { "customer": { "customer_no","first_name","last_name","nickname",
                             "province_code","first_seen_at","lifecycle_stage","record_status" },
               "contacts":      [ { "contact_type", "value", "is_active" } ],   // ค่าเต็ม (เจ้าของข้อมูลขอเอง)
               "addresses":     [ { "address_line","subdistrict","district","province_code","postal_code" } ],
               "consents":      [ { "purpose_code","status","channels","captured_at","notice_version" } ],
               "visits":        [ { "visit_no","started_at","channel_code","outcome_code" } ],
               "interactions":  [ { "occurred_at","channel_code","direction","type","summary" } ],
               "leads":         [ { "lead_no","created_at","status","interest_code","product_model" } ],
               "opportunities": [ { "opportunity_no","created_at","stage","won_amount" } ],
               "transactions":  [ { "external_no","transacted_at","transaction_type_code","amount" } ],
               "notes":         [ { "created_at","body" } ] } }
```

**ผลข้างเคียง:** audit **`DSR_PACKAGE_BUILT`** (ชื่อ action นี้ไม่ได้อยู่ในรายการ CANONICAL ข้อ 9.5 — ดูข้อ 8)
**ไฟล์:** RPC **ไม่เขียนไฟล์** · การเขียนไฟล์ลง bucket `exports` (อายุ 24 ชม. · ไม่แนบอีเมล) และการออก signed URL เป็นงานของ Edge Function — **`api.svc_*` สำหรับขั้นนี้ยังไม่มี · รอยืนยัน** (ข้อ 5.2 · ข้อ 8)

#### 3.9.5 `api.anonymize_customer(p_customer_id uuid, p_dsr_id uuid DEFAULT NULL) → jsonb`

DEFINER · VOLATILE · สิทธิ์ **`customer.anonymize` 🔐** (BUSINESS_ADMIN เท่านั้น)

**เงื่อนไขทุกข้อ:** ลูกค้าอยู่ในองค์กรเดียวกัน · **ไม่ติด `legal_hold`** · ต้องอ้าง DSR ที่ `customer_id` ตรงกันและสถานะ `VERIFIED`/`IN_PROGRESS` · **`verified_by ≠ ผู้เรียก`** (CANONICAL ข้อ 10.4 · Q26) · ไม่เกิน `dsr.anonymize_per_day` (20) ต่อผู้ใช้ต่อวัน

**สิ่งที่ทำ (`app.anonymize_customer` · `app.bulk = on` ตลอดงาน)**

1. ลบ `customer_contacts` · `customer_addresses`
2. ล้างข้อความอิสระที่ติดป้าย `pii`: `customer_notes.body` → `[ANONYMIZED]` · `interactions.summary` → NULL · `tasks.title/description` · `leads/opportunities.next_action` `lost_note` · `quotations.terms_note` · `transaction_refs.summary` `device_imei` `device_serial` · `customer_consents.evidence` · `duplicate_decisions.override_note` `decision_note` · `customer_merges.snapshot` → `{"redacted":true}` · `notifications.title/body` · `data_subject_requests.note`
3. `customers`: `first_name = 'ลูกค้านิรนาม ' || customer_no` · `last_name` `nickname` `province_code` `note_summary` = NULL · `record_status = 'ANONYMIZED'`
4. ตั้ง `app.audit_redaction = 'on'` แล้วแทนค่าคีย์ `pii` ใน `audit.audit_logs.before/after` ของลูกค้ารายนั้นด้วย `"[ANONYMIZED]"`
5. **วนทำซ้ำกับแถว `MERGED` ที่ `merged_into_id` ชี้มาหา** (CANONICAL ข้อ 19.4 ข้อ 2)
6. คง visit/lead/opportunity/transaction ref ไว้ → **KPI ย้อนหลังไม่เปลี่ยน** · audit `CUSTOMER_ANONYMIZED`

```jsonc
{ "p_customer_id": "<uuid>", "p_dsr_id": "<uuid:DSR-2026-000002>" }
→ { "ok": true, "customer_id": "<uuid>", "anonymized": ["<uuid>", "<uuid:แถว MERGED>"],
    "dsr_id": "<uuid>", "request_no": "DSR-2026-000002" }
```

**ข้อผิดพลาด:** `P0001 ลูกค้ารายนี้ติด legal hold (ข้อ 10.3)` · `22023 ต้องอ้างคำขอเจ้าของข้อมูลที่ยืนยันตัวตนแล้ว` · `P0001 คำขอนี้ไม่ตรงกับลูกค้ารายนี้` · `P0001 คำขอต้องผ่านการยืนยันตัวตนก่อน` · `42501 ผู้ดำเนินการต้องไม่ใช่ผู้ยืนยันตัวตน (ข้อ 10.4 · Q26)` · `42501 ทำข้อมูลนิรนามครบ 20 รายของวันนี้แล้ว`

#### 3.9.6 `api.set_legal_hold(p_customer_id uuid, p_on boolean, p_reason text DEFAULT NULL) → jsonb`

DEFINER · VOLATILE · สิทธิ์ **`dsr.manage` 🔐** · `p_reason` บังคับ (ลง `app.audit_reason` · ห้ามมี PII)
ลูกค้าที่ `legal_hold = true` จะถูก **ข้าม** โดยงาน `app.job_retention` และถูกปฏิเสธโดย `api.anonymize_customer`

```jsonc
{ "p_customer_id": "<uuid>", "p_on": true, "p_reason": "อยู่ระหว่างข้อพิพาทสัญญาผ่อน" }
→ { "ok": true, "customer_id": "<uuid>", "legal_hold": true }
```

#### 3.9.7 `api.list_integration_logs(p jsonb DEFAULT '{}') → jsonb`

DEFINER · STABLE · สิทธิ์ **`integration.manage` 🔐** (SYSTEM_ADMIN) · `p`: `source_system_code` · `status` · `from` · `to` · `limit` (เพดาน 200)

คืน: `id` `occurred_at` `source_system_code` `direction` `operation` `status` `http_status` `external_ref` `error_message` `payload_sha256` `actor_label` `request_id`
V1 ยังไม่มี integration ที่เชื่อมจริง (หน้า 18 แสดง "ยังไม่เชื่อมต่อ (Phase 4)" ทุกระบบยกเว้น `MANUAL` · CANONICAL ข้อ 13.14)

---

### 3.10 RPC ของ Edge Function (`api.svc_*`)

**กติการ่วม:** GRANT EXECUTE ให้ **`service_role` เท่านั้น** · บรรทัดแรก `app.svc_guard()` ตรวจ `auth.role() = 'service_role'` (ไม่ผ่าน → `42501 ฟังก์ชันนี้เรียกได้จาก Edge Function เท่านั้น`) · ฟังก์ชันที่มีผู้กระทำเป็นคนต้องส่ง **`actor_user_id` = `sub` ของ JWT ที่ Edge Function verify แล้ว** (ห้ามรับ staff_id จาก body) → `app.svc_set_actor()` แปลงเป็น staff ที่ `ACTIVE` และตั้ง `app.actor_staff_id` + `request.jwt.claims` ให้ helper ตรวจสิทธิ์และ audit บันทึก actor ถูกต้อง

| ฟังก์ชัน | vol. | พารามิเตอร์ | ทำอะไร · คืนอะไร |
|---|:--:|---|---|
| `svc_build_export_dataset(p_export_id uuid)` | V | – | ตรวจซ้ำ (`APPROVED` · ผู้ขอยัง ACTIVE และยังมี assignment ของ `requested_as_role` ที่มี `customer.export` · ขอบเขตสาขาและตัวกรองที่บันทึกตอนยื่น · whitelist คอลัมน์) แล้วคืน `{ok, export_id, export_no, requested_as_role, columns[], row_count, watermark, rows[]}` · `watermark` = `ส่งออกโดย {staff_code} · {export_no} · {DD/MM/YYYY HH24:MI}` |
| `svc_mark_export_generated(p_export_id uuid, p_file_path text)` | V | – | `APPROVED → GENERATED` + `generated_at` + `file_path` · แจ้ง **`EXPORT_READY`** ถึงผู้ขอ · คืน `{ok, export_id, export_no, status}` |
| `svc_prepare_invite(p jsonb)` | V | `actor_user_id` ✓ · `actor_aal` · `email` ✓ · `display_name` ✓ · `employee_code` ✓ · `nickname` · `phone` · `role_code` · `branch_id` | ตรวจ `user.invite` ของผู้กระทำ + `app.assign_role_denial(NULL, role, branch)` → สร้าง `core.staff_profiles` (`INVITED` · `invite_expires_at = now() + 24 ชม.`) + `core.staff_invitations` + assignment (ถ้าส่ง `role_code`) **ก่อน** ออกลิงก์เชิญ · คืน `{ok, staff_id, staff_code, email, invite_expires_at, role_code, branch_id}` |
| `svc_finalize_disable(p jsonb)` | V | `actor_user_id` ✓ · `staff_id` ✓ · `reason` | ใช้ **หลัง** `api.disable_staff` และหลัง ban ผู้ใช้ใน Auth: ปิดคำเชิญที่ค้าง + เขียน audit **`STAFF_DISABLED`** (`auth_banned` · `sessions_revoked`) · บัญชีต้องเป็น `DISABLED` แล้ว มิฉะนั้น `P0001` |
| `svc_resolve_staff_code(p_staff_code text)` | S | – | `ST-NNNN` → `{ok:true, user_id, staff_id, status}` เฉพาะบัญชี `ACTIVE` ที่มี `user_id` · ไม่พบ/ไม่ ACTIVE → `{ok:false}` **เท่านั้น** (ข้อความเดียวกันทุกกรณี · **ห้ามส่งอีเมลออกจากฟังก์ชัน Edge**) |
| `svc_reset_mfa_authorize(p jsonb)` | V | `actor_user_id` ✓ · `actor_aal` ✓ · `target_staff_id` ✓ · `reason` | ผู้กระทำต้อง **aal2** · บัญชีเป้าหมายที่มีบทบาท BA/EX/SA → ผู้กระทำต้องเป็น **EXECUTIVE** · บัญชีอื่น → **BUSINESS_ADMIN** (CANONICAL ข้อ 7.3 ข้อ 6) · เขียน audit **`MFA_RESET`** · คืน `{ok, target_staff_id, target_user_id, required_role}` |
| `svc_expired_export_files()` | S | – | คืน `{ok, files: [{export_id, export_no, file_path, expired_at}]}` ของคำขอที่ `EXPIRED` และ `file_deleted_at IS NULL` (อ่านอย่างเดียว · การเปลี่ยนสถานะเป็นของ `app.job_expire_exports`) |

```jsonc
// ตัวอย่าง: invite-staff เรียกหลัง verify JWT ของคุณเจ (BM@JP1)
{ "p": { "actor_user_id": "<uuid: sub ของคุณเจ>", "actor_aal": "aal2",
         "email": "newstaff@example.com", "display_name": "คุณใหม่",
         "employee_code": "HR-2026-118", "role_code": "STAFF", "branch_id": "<uuid:JP1>" } }
→ { "ok": true, "staff_id": "<uuid>", "staff_code": "ST-0052",
    "email": "newstaff@example.com", "invite_expires_at": "2026-09-12T03:24:00+00:00",
    "role_code": "STAFF", "branch_id": "<uuid:JP1>" }
```

---

## 4. การอ่าน/เขียนตารางตรงผ่าน PostgREST

### 4.1 กติกา

1. สิ่งที่ **ไม่ได้อยู่** ในตารางข้อ 4.2–4.3 = **ทำไม่ได้** (ไม่มี GRANT) → PostgREST ตอบ `401/403` หรือ `42501`
2. `SELECT` ทุกครั้งผ่าน RLS ของตารางนั้น (rls-spec ข้อ 6) · `PATCH`/`POST` ผ่าน `USING` + `WITH CHECK` + trigger `trg_10_enforce_transition` ตามลำดับของข้อ 2.8.1
3. **คอลัมน์ระบบไม่อยู่ใน UPDATE grant ทุกตาราง**: `organization_id` `created_by/at` `updated_by/at` `*_no` `first_seen_at` `first_channel_code` `first_source_code` `first_branch_id` `lifecycle_stage` `last_activity_at` `last_channel_code` `last_branch_id` `has_open_followup` `has_new_lead` `note_summary` `created_via` `record_status` `merged_into_id` `legal_hold` `expected_amount` `is_visit_root` `is_next_action` `closed_by_system` `queue_no` `outcome_code` `converted_opportunity_id` (CANONICAL ข้อ 9.4 กติกา 7)
4. **`owner_staff_id` · `team_id` · `branch_id` ไม่อยู่ใน UPDATE grant** ยกเว้น `crm.visits.owner_staff_id` (สำหรับการรับคิว) → เปลี่ยนผ่าน `api.assign_owner` เท่านั้น (มิฉะนั้น `JCRM-T13`)
5. `DELETE` ทำได้เพียง 3 ตาราง: `crm.customer_tags` · `crm.opportunity_items` (opportunity ยังเปิด) · `crm.quotation_items` (quotation ยัง `DRAFT`)
6. ทุกคำเรียกที่เขียนควรส่ง `Prefer: return=representation` และ **ตรวจจำนวนแถวที่คืน** (0 แถว = มองไม่เห็นแถวหรือถูกแก้ไปแล้ว)
7. ใช้ `Content-Profile: crm` (เขียน) และ `Accept-Profile: crm` (อ่าน) หรือ `.schema('crm')` ของ supabase-js

### 4.2 ตารางใน `crm`

| ตาราง | SELECT | INSERT (คอลัมน์) | UPDATE (คอลัมน์) | DELETE | ตัวกรอง/การเรียงที่หน้าจอใช้ |
|---|---|---|---|:--:|---|
| `customers` | ทุกคอลัมน์ | – (`api.quick_capture`) | `first_name` `last_name` `nickname` `customer_type` `province_code` | – | `record_status=eq.ACTIVE` · `last_activity_at=gte.` · `customer_branches!inner(branch_id)` · `lifecycle_stage=in.()` · `last_channel_code=in.()` · order `last_activity_at.desc,customer_no.desc` |
| `customer_contacts` | `id` `organization_id` `customer_id` `contact_type` `value_masked` `is_primary` `is_valid` `is_active` `verified_at` `created_at` `updated_at` | – (`api.save_contact`) | – | – | embed จาก `customers` · `is_active=eq.true` · **ขอ `value_raw` → 403** |
| `customer_addresses` | `id` `organization_id` `customer_id` `district` `province_code` `value_masked` `is_primary` `is_active` `created_at` `updated_at` | – (`api.save_address`) | – | – | embed จาก `customers` |
| `customer_branches` | ทุกคอลัมน์ | – (trigger/RPC) | – | – | ใช้เป็น `!inner` join กรองสาขาของหน้า 03 |
| `customer_notes` | ทุกคอลัมน์ | `customer_id` `interaction_id` `branch_id` `body` `is_pinned` | `body` `is_pinned` | – | `customer_id=eq.` · order `is_pinned.desc,created_at.desc` · แก้ได้ภายใน 24 ชม. หลังสร้าง |
| `tags` | ทุกคอลัมน์ | `code` `label_th` `is_active` | `label_th` `is_active` | – | `is_active=eq.true` · order `code` · เขียนต้องมี `tag.manage` |
| `customer_tags` | ทุกคอลัมน์ | `customer_id` `tag_id` | – | ✓ | `customer_id=eq.` · เขียน/ลบต้องมี `customer.update` บนลูกค้าและ tag ต้อง `is_active` |
| `customer_consents` · view `customer_consent_current` | ทุกคอลัมน์ | – (`api.record_consent`) | – | – | `customer_id=eq.` · order `captured_at.desc` |
| `duplicate_decisions` | ทุกคอลัมน์ | – (RPC) | – | – | `status=eq.PENDING` · ต้องมี `data_quality.view` บนลูกค้าทั้งสองราย |
| `customer_merges` | ทุกคอลัมน์ | – (RPC) | – | – | `survivor_customer_id=eq.` |
| `data_subject_requests` | ทุกคอลัมน์ | – (`api.create_dsr`) | – | – | `status=eq.` · order `received_at.desc` |
| `visits` | ทุกคอลัมน์ | – (`api.open_visit` · `api.quick_capture`) | `status` `owner_staff_id` `party_size` `customer_id` `interest_code` `source_code` `cancel_reason` | – | คิวหน้า 07: `branch_id=eq.` · `status=in.(WAITING,IN_SERVICE)` · order `queue_no` · **การรับคิว** = PATCH `status=IN_SERVICE` + `owner_staff_id=<ตน>` เมื่อ `status='WAITING' AND owner_staff_id IS NULL` (แก้ได้เฉพาะสองคอลัมน์นี้ · `JCRM-T20`) |
| `interactions` | ทุกคอลัมน์ | `customer_id` `visit_id` `lead_id` `opportunity_id` `branch_id` `channel_code` `direction` `interaction_type_code` `occurred_at` `owner_staff_id` `summary` | `customer_id` `interaction_type_code` `occurred_at` `summary` | – | `customer_id=eq.` · order `occurred_at.desc` · **`INBOUND` ที่ INSERT ตรงต้องมี `visit_id` ของ visit ที่เปิดอยู่สาขาเดียวกัน** (มิฉะนั้นใช้ `api.open_visit`) · แก้ได้ภายใน 24 ชม. (`JCRM-T60`) |
| `transaction_refs` | ทุกคอลัมน์ | `customer_id` `branch_id` `opportunity_id` `transaction_type_code` `source_system_code` `external_no` `transacted_at` `amount` `device_imei` `device_serial` `summary` | – | – | `source_system_code` ต้องเป็น **`MANUAL`** · เพิ่มได้อย่างเดียว (แก้/ยกเลิกใช้สคริปต์ BA · CANONICAL Q29) · ซ้ำ → `23505` |
| `campaigns` | ทุกคอลัมน์ | `code` `name_th` `channel_code` `starts_on` `ends_on` `is_active` | `name_th` `channel_code` `starts_on` `ends_on` `is_active` | – | อ่านต้องมี `campaign.read` · เขียนต้องมี `campaign.manage` |
| `leads` | ทุกคอลัมน์ | `customer_id` `branch_id` `owner_staff_id` `channel_code` `source_code` `campaign_id` `visit_id` `interest_code` `product_type_code` `product_model` `interest_level` `priority_code` `next_action` `next_action_type_code` `next_action_at` | `source_code` `campaign_id` `interest_code` `product_type_code` `product_model` `interest_level` `status` `priority_code` `next_action` `next_action_type_code` `next_action_at` `closed_at` `lost_reason_code` `lost_note` | – | หน้า 11: `status=in.()` · `branch_id=eq.` · order `next_action_at` · **ไป `CONVERTED` ต้องใช้ `api.convert_lead`** (`JCRM-T41`) · ปิด `LOST` ต้องมี `lost_reason_code` + `closed_at` |
| `opportunities` | ทุกคอลัมน์ | `customer_id` `origin_channel_code` `origin_visit_id` `branch_id` `owner_staff_id` `interest_code` `priority_code` `next_action` `next_action_type_code` `next_action_at` | `interest_code` `stage` `priority_code` `next_action` `next_action_type_code` `next_action_at` `won_amount` `won_at` `closed_at` `lost_reason_code` `lost_note` | – | หน้า 06: `stage=in.(INTERESTED,QUOTATION,FOLLOW_UP)` · order `next_action_at` · **เลื่อนขั้นด้วยมือได้เฉพาะ `QUOTATION→FOLLOW_UP` และ `INTERESTED→QUOTATION/FOLLOW_UP` เมื่อมี quotation ที่ `sent_at IS NOT NULL`** · ห้ามย้อนเป็น `INTERESTED` (`JCRM-T30`) · `WON` ต้องมี `won_amount>0` `won_at` `closed_at=won_at` (`opportunity.close`) |
| `opportunity_items` | ทุกคอลัมน์ | `opportunity_id` `product_type_code` `product_model` `variant` `quantity` `unit_price` `interest_level` | `product_type_code` `product_model` `variant` `quantity` `unit_price` `interest_level` | ✓ | เขียนได้เมื่อ opportunity **ยังเปิด** และมี `opportunity.update` · trigger รวมเป็น `expected_amount` |
| `quotations` | ทุกคอลัมน์ | `opportunity_id` `total_amount` `installment_months` `terms_note` | `status` `sent_channel_code` `total_amount` `installment_months` `terms_note` | – | **ส่งใบเสนอราคา = PATCH `status='SENT'` + `sent_channel_code`** → trigger ตั้ง `sent_at` `valid_until` สร้าง interaction `QUOTATION_SENT` และเลื่อนขั้น opportunity (CANONICAL ข้อ 19.3 ข้อ 5) · หลังส่งแก้ได้เฉพาะ `status` (`JCRM-T50`) |
| `quotation_items` | ทุกคอลัมน์ | `quotation_id` `product_type_code` `product_model` `variant` `quantity` `unit_price` `discount_amount` | เหมือน INSERT | ✓ | เขียนได้เมื่อ quotation ยัง `DRAFT` |
| `lead_status_history` · `opportunity_stage_history` · `ownership_changes` | ทุกคอลัมน์ | – | – | – | อ่านตามแถวแม่ · order `changed_at.desc` |
| `tasks` | ทุกคอลัมน์ | `task_type_code` `title` `description` `customer_id` `lead_id` `opportunity_id` `branch_id` `owner_staff_id` `priority_code` `due_at` `remind_at` | `task_type_code` `title` `description` `status` `priority_code` `due_at` `remind_at` | – | หน้า 08: `status=in.(OPEN,IN_PROGRESS)` · `due_at` ในวันนี้/ก่อนวันนี้ · order `due_at` · **ไม่มี read-through ผ่านลูกค้า** (ใช้ `task.read` เท่านั้น) · task `is_next_action` แก้ owner/branch/due/ประเภทตรงไม่ได้ (`JCRM-T14`) |
| `task_comments` | ทุกคอลัมน์ | `task_id` `body` | `body` | – | `task_id=eq.` · order `created_at` |
| `notifications` | ทุกคอลัมน์ | – (trigger/RPC) | **`read_at` เท่านั้น** | – | `recipient_staff_id` = ตนเสมอ (RLS) · `read_at=is.null` · order `created_at.desc` · การกด "อ่านแล้ว" = PATCH `read_at=now()` |

### 4.3 ตารางใน `core` และ `ref`

| ตาราง | SELECT | INSERT/UPDATE | หมายเหตุ |
|---|---|---|---|
| `core.organizations` · `business_units` · `branches` · `departments` · `teams` | ทุกคอลัมน์ (องค์กรเดียวกัน) | – | ตัวเลือกสาขาของทุกหน้า · order `code` |
| `core.staff_profiles` | **เฉพาะ `id` `staff_code` `display_name` `nickname` `status`** | – | ใช้แสดงชื่อ owner · คอลัมน์อื่นผ่าน `api.list_staff` |
| `core.roles` · `permissions` · `role_permissions` | ทุกคอลัมน์ | – | พนักงาน ACTIVE ทุกคนอ่านได้ (CANONICAL ข้อ 19.2 ข้อ 7) · `role_permissions` แก้ได้ผ่าน migration เท่านั้น |
| `core.team_members` · `staff_invitations` · `staff_role_assignments` · `role_grant_requests` · `devices` | **ไม่มี policy → อ่านตรงไม่ได้** | – | ใช้ `api.list_staff` · `api.list_role_grant_requests` · `api.set_team_member` · `api.register_device` |
| `ref.*` (16 ตาราง) | ทุกคอลัมน์ · เห็นแถว `is_active` (ผู้มี `master_data.manage` เห็นทั้งหมด) | `code` `label_th` `label_en` `sort_order` `is_active` + คอลัมน์ธงเฉพาะตาราง (INSERT) · `label_th` `label_en` `sort_order` `is_active` (UPDATE) | เขียนต้องมี **`master_data.manage` 🔐** · **ห้าม DELETE** ใช้ `is_active = false` · `is_system = true` ปิดใช้งานไม่ได้ · order `sort_order, code` |

`app.*` · `analytics.*` · `audit.*` · `restricted.*` — **ไม่มี GRANT ใด ๆ** ให้ `authenticated` (เข้าถึงผ่าน RPC ข้อ 3 เท่านั้น)

### 4.4 ตัวอย่างคำเรียกตารางที่หน้าจอใช้จริง

```http
# หน้า 03 · รายการลูกค้า (ค่าเริ่มต้น "ติดต่อใน 30 วันล่าสุด" · CANONICAL ข้อ 13.8)
GET /rest/v1/customers
    ?select=customer_no,display_name,lifecycle_stage,has_open_followup,has_new_lead,first_seen_at,
            last_activity_at,last_channel_code,last_branch_id,
            customer_contacts(contact_type,value_masked,is_primary),
            customer_branches!inner(branch_id)
    &record_status=eq.ACTIVE
    &customer_branches.branch_id=eq.<uuid:JP1>
    &last_activity_at=gte.2026-08-12T17:00:00Z
    &order=last_activity_at.desc,customer_no.desc
    &limit=50
Accept-Profile: crm
Prefer: count=exact
→ 200 · Content-Range: 0-49/1284
```

```http
# หน้า 06 · ปิดการขายเป็น WON
PATCH /rest/v1/opportunities?id=eq.<uuid:OP-2026-002998>
Content-Profile: crm
Prefer: return=representation
{ "stage": "WON", "won_amount": 45900,
  "won_at": "2026-09-11T03:30:00Z", "closed_at": "2026-09-11T03:30:00Z" }
→ 200 · [ { … } ]      // 0 แถว = ไม่มีสิทธิ์/แถวเปลี่ยนไปแล้ว
→ 403 · JCRM-T31       // ไม่มี opportunity.close
```

```http
# หน้า 07 · รับคิว (เปลี่ยนได้เฉพาะ status + owner_staff_id)
PATCH /rest/v1/visits?id=eq.<uuid>&status=eq.WAITING&owner_staff_id=is.null
Content-Profile: crm
{ "status": "IN_SERVICE", "owner_staff_id": "<uuid:ST-0045>" }
```

```http
# หน้า 19 · ส่งใบเสนอราคา (trigger ตั้ง sent_at · valid_until · สร้าง interaction · เลื่อนขั้น)
PATCH /rest/v1/quotations?id=eq.<uuid:QT-2026-001702>
Content-Profile: crm
{ "status": "SENT", "sent_channel_code": "LINE" }
```

```http
# กระดิ่ง · ทำเครื่องหมายว่าอ่านแล้ว
PATCH /rest/v1/notifications?id=eq.<uuid>
Content-Profile: crm
{ "read_at": "2026-09-11T03:24:00Z" }
```

---

## 5. สัญญาของ Edge Function (CANONICAL ข้อ 9.8)

### 5.1 กติการ่วม

1. ฟังก์ชันที่มีผู้เรียกเป็นผู้ใช้: **(1)** verify JWT **(2)** เรียก RPC ตรวจสิทธิ์ **ด้วย JWT ของผู้เรียก** ก่อนใช้ service_role **(3)** ไม่รับ actor/staff_id จาก body **(4)** เขียน audit ด้วย actor จาก JWT
2. Edge Function แตะฐานข้อมูล **ผ่าน PostgREST เท่านั้น** · ไม่มี connection string · ไม่เรียก `app.*` ตรง
3. service_role key อยู่ใน secret ของ Edge Function เท่านั้น · มนุษย์ไม่ถือ · ห้ามอยู่ใน env ของ Next.js
4. ทุก response ใช้ `Content-Type: application/json` · ข้อความผิดพลาดของเส้นทางล็อกอิน **ต้องเหมือนกันทุกกรณี** (ไม่บอกว่าบัญชีมีอยู่หรือไม่)

### 5.2 รายฟังก์ชัน

| ฟังก์ชัน | method · auth | body | ตรวจด้วย JWT ผู้เรียก | ทำด้วย service_role | response | ความล้มเหลว |
|---|---|---|---|---|---|---|
| `invite-staff` | `POST` · JWT ของ BM/BA/SA (aal2) | `{email, display_name, nickname?, phone?, employee_code, role_code?, branch_id?}` | `api.can_assign_role(null, role_code, branch_id)` | `api.svc_prepare_invite(...)` → `auth.admin.inviteUserByEmail` / `generateLink` (อายุลิงก์ 3600 วินาที · คำเชิญ 24 ชม.) | `{ok, staff_id, staff_code, invite_expires_at}` | `403` เมื่อ `can_assign_role` เป็น false · `409` อีเมลซ้ำใน Auth · **ถ้า `generateLink` ล้มหลังสร้างแถว → บัญชียัง `INVITED` ให้ "เชิญอีกครั้ง"** · audit `STAFF_INVITED` |
| `disable-staff` | `POST` · JWT ของ BM/BA/SA (aal2) | `{staff_id, reason}` | **`api.disable_staff(staff_id, reason)`** (ฝั่งข้อมูลทั้งหมด) | ban ผู้ใช้ใน Auth + เพิกถอน session → `api.svc_finalize_disable({actor_user_id, staff_id, reason})` | `{ok, staff_id, opportunities_reassigned, leads_unassigned, tasks_unassigned}` | RPC ปฏิเสธ (ไม่มีผู้จัดการสาขารับช่วง · คนสุดท้ายของบทบาท) → `403` พร้อมข้อความจาก RPC · ถ้า ban ล้มหลัง RPC สำเร็จ ให้ลองซ้ำ (บัญชี `DISABLED` แล้วจึงไม่มีสิทธิ์ใด ๆ) |
| `reset-mfa` | `POST` · JWT ของ BA/EX (**aal2**) | `{target_staff_id, reason?}` | verify JWT แล้วส่ง `sub` + `aal` ต่อ (หมายเหตุ E12) | `api.svc_reset_mfa_authorize({actor_user_id, actor_aal, target_staff_id, reason})` → ลบ factor ของผู้ใช้เป้าหมาย → แจ้งอีเมลเดิม | `{ok, target_staff_id, required_role}` | `403` เมื่อผู้กระทำไม่ใช่บทบาทที่กติกากำหนดหรือไม่ aal2 · audit `MFA_RESET` |
| `staff-code-login` | `POST` · **ไม่มี JWT** | `{staff_code, password}` | – | `api.svc_resolve_staff_code` → user_id → อ่านอีเมลด้วย admin API → password grant ฝั่ง server | **session เท่านั้น · ไม่คืนอีเมล** | ข้อความผิดพลาดเดียวกันทุกกรณี ("รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง") · จำกัดต่อ IP `security.login_ip_per_15min` (20/15 นาที) · บันทึก `audit.login_events` |
| `password-reset` | `POST` · ไม่มี JWT | `{login_id}` (อีเมลหรือ `ST-NNNN`) | – | แปลง `ST-NNNN` ด้วย `api.svc_resolve_staff_code` → ส่งลิงก์ (อายุ 1 ชม.) ไป **อีเมลที่ลงทะเบียน** เฉพาะบัญชี `ACTIVE` | `{ok:true}` เสมอ | ตอบข้อความเดียวกันเสมอ · หลังตั้งรหัสใหม่เพิกถอน session ทั้งหมด · `audit.login_events` |
| `generate-export` · โหมดสร้างไฟล์ | `POST` · JWT ของผู้ตัดสิน (หรือผู้ขอ BM ที่ `APPROVED` ทันที) | `{export_id}` — **ไม่เชื่อสถานะจาก body** | verify JWT | `api.svc_build_export_dataset(export_id)` → เขียนไฟล์ + ลายน้ำลง bucket `exports` → `api.svc_mark_export_generated(export_id, file_path)` | `{ok, export_no, row_count}` | คำขอไม่ `APPROVED` → `400` · ผู้ขอหมดสิทธิ์ → `403` (ข้อความจาก RPC) · แจ้ง `EXPORT_READY` เมื่อสำเร็จ |
| `generate-export` · โหมดดาวน์โหลด | `POST` · **JWT ของผู้ขอ (aal2)** | `{export_id}` | **`api.record_export_download(export_id)`** | `storage.from('exports').createSignedUrl(file_path, 60)` — **เฉพาะเมื่อ RPC สำเร็จ** | `{ok, url, expires_in: 60}` (Route Handler redirect ไป URL) | RPC ปฏิเสธ → `403` พร้อมข้อความ ("ดาวน์โหลดครบ 3 ครั้งแล้ว" · "ลิงก์ดาวน์โหลดหมดอายุแล้ว") · audit `EXPORT_DOWNLOADED` |
| `cron-export-cleanup` | `POST` · secret ของตัวเรียก **[รอยืนยัน]** | – | – | `api.svc_expired_export_files()` → ลบไฟล์ใน bucket · ตั้ง `file_deleted_at` | `{ok, deleted: n}` | ลบไม่สำเร็จ = ลองซ้ำรอบถัดไป (idempotent) |
| `integration-*` (Phase 4) | `POST` · ลายเซ็น/secret ของระบบต้นทาง | ตามระบบต้นทาง | – | `api.svc_*` ของ Phase 4 (**ชื่อ รอยืนยัน**) | – | `audit.integration_logs` · actor `INTEGRATION` |

> **แพ็กเกจ DSR:** `api.build_dsr_package` เตรียมข้อมูลได้ แต่ **ยังไม่มี `api.svc_*` สำหรับให้ Edge Function อ่านชุดข้อมูล เขียนไฟล์ และบันทึกการดาวน์โหลด** · CANONICAL ข้อ 9.6 ไม่ได้ระบุฟังก์ชันนี้ไว้ → **รอยืนยัน** (ข้อ 8 รายการ U3)

### 5.3 ไฟล์และ Storage

| หัวข้อ | ค่า |
|---|---|
| bucket | `exports` (private · ไม่มี storage policy ให้ `authenticated`/`anon`) |
| ผู้เขียนไฟล์ | `generate-export` (service_role) |
| ผู้ลบไฟล์ | `cron-export-cleanup` ตามรายการของ `api.svc_expired_export_files()` |
| ลายน้ำ | `ส่งออกโดย {staff_code} · {export_no} · {DD/MM/YYYY HH24:MI}` ในแถวหัวไฟล์ **และ** ในชื่อไฟล์ (CANONICAL ข้อ 8.2) |
| รูปแบบชื่อไฟล์เต็ม | **รอยืนยัน** — ต้องมี `export_no` และ `staff_code` ตามลายน้ำ · ตัวอย่างที่ใช้ในเอกสารนี้ `exports/{export_no}__{staff_code}__{YYYYMMDD-HHMM}.csv` เป็น **ตัวอย่างประกอบ ไม่ใช่ค่าที่ตรึง** |
| signed URL | อายุ **60 วินาที** · ออกหลัง `api.record_export_download` สำเร็จเท่านั้น |
| อายุไฟล์ | `export.link_ttl_hours` = 24 ชม. → `app.job_expire_exports` เปลี่ยนสถานะเป็น `EXPIRED` (คง `download_count`) แล้ว `cron-export-cleanup` ลบไฟล์ |

### 5.4 งานตามเวลา (ไม่ใช่ API แต่มีผลต่อข้อมูลที่ API คืน)

| งาน | เวลา (Asia/Bangkok) | cron (UTC) | ผลที่เห็นผ่าน API |
|---|---|---|---|
| `app.job_close_stale_visits(app.clock())` | 00:05 | `5 17 * * *` | visit ค้างของวันก่อน → `COMPLETED` + `UNRECORDED` + `closed_by_system` → โผล่ในรายการ `VISIT_UNRECORDED` และแจ้ง `VISIT_OUTCOME_MISSING` |
| `app.job_expire_quotations(app.clock())` | 00:10 | `10 17 * * *` | `SENT` ที่พ้น `valid_until` → `EXPIRED` |
| `app.job_retention(app.clock())` | 02:00 | `0 19 * * *` | anonymize ตามระยะเก็บ (ข้าม `legal_hold`) แล้วลบ log ที่ครบระยะด้วย role `audit_retention` |
| `app.job_expire_exports(app.clock())` | ทุกชั่วโมง นาทีที่ 15 | `15 * * * *` | คำขอส่งออก → `EXPIRED` (`api.record_export_download` จะปฏิเสธ) |
| `app.job_notifications(app.clock())` | ทุก 5 นาที | `*/5 * * * *` | แถวใหม่ใน `crm.notifications` → `unread_notifications` ของ `api.get_my_access` เพิ่ม |

`cron.schedule` อยู่ในไฟล์ `supabase/migrations/*_cron.sql` เท่านั้น (PGlite ข้ามไฟล์นี้) · job รันในฐานะ `postgres` และตั้ง `app.actor_type = 'SYSTEM'` + `app.actor_label = 'SYSTEM:<ชื่องาน>'` ก่อนเขียน

---

## 6. แผนที่ Next.js Server Action ต่อหน้าจอ (CANONICAL ข้อ 14.1)

**กติกา:** การอ่านของ Server Component เรียก PostgREST/RPC ตรงด้วย JWT ของผู้ใช้ · **ทุกการเขียนผ่าน Server Action** · Server Action ตรวจรูปแบบเพื่อ UX แล้วแปลง SQLSTATE เป็นข้อความตามข้อ 2.8 แล้ว `revalidatePath` · ชื่อ action ด้านล่างเป็นชื่อที่เอกสารชุดนี้ใช้อ้างอิง (ผู้พัฒนาอาจตั้งชื่อไฟล์ต่างได้ แต่ต้องคงการจับคู่ "action ↔ RPC/ตาราง")

| # | หน้า | การอ่าน | Server Action / Route Handler | เรียกอะไร | สิทธิ์ |
|---|---|---|---|---|---|
| 01 | `login` | – | `signInWithPassword` · `signInWithStaffCode` · `verifyMfa` · `enrollMfa` · `requestPasswordReset` | Supabase Auth (ฝั่ง server) · Edge `staff-code-login` · Edge `password-reset` · หลังล็อกอิน `api.get_my_access` | – |
| 02 | `dashboard` | `api.get_kpis` (+ `p_group_by='BRANCH'` สำหรับตารางสาขา · `'STAFF'` สำหรับ BM/SV) · `crm.customers` (ลูกค้าล่าสุดของฉัน) · `crm.tasks` (งานวันนี้) | `setDashboardRange` · `setBranchFilter` (state เท่านั้น) | `api.get_kpis` ใหม่ | `dashboard.view` |
| 03 | `customers` | `crm.customers` + embed `customer_contacts` `customer_branches!inner` (ข้อ 4.4) | `addTagsToCustomers` · `requestCustomerExport` | INSERT `crm.customer_tags` (ทีละราย · นับผลสำเร็จ) · `api.request_export` | `customer.update` · `customer.export` 🔐 |
| 04 | `quick-capture` | `ref.channels` `ref.sources` `ref.interest_types` `ref.product_types` `ref.provinces` · `crm.visits` (เมื่อมาจากหน้า 07) | `checkDuplicates` · `createCustomer` · `useExistingCustomer` | `api.find_customer_candidates` · **`api.quick_capture`** · `api.link_customer_to_branch` | `customer.create` (+`visit.create`) |
| 05 | `customer-360` | **`api.get_customer_360`** · `crm.interactions` `crm.leads` `crm.opportunities` `crm.quotations` `crm.transaction_refs` `crm.customer_notes` `crm.tasks` (ตามแท็บ) · `api.get_entity_history` (แท็บประวัติ) | `updateCustomer` · `saveContact` · `saveAddress` · `revealContact` · `revealAddress` · `addNote` · `recordConsent` · `logInteraction` · `createLead` · `createOpportunity` · `createTask` · `linkTransaction` · `assignCustomerOwner` · `mergeCustomers` · `createDsr` · `setLegalHold` | PATCH `crm.customers` · `api.save_contact` · `api.save_address` · `api.reveal_contact` · `api.reveal_address` · INSERT `crm.customer_notes` · `api.record_consent` · `api.open_visit` (INBOUND ช่องทางข้อความ) หรือ INSERT `crm.interactions` · INSERT `crm.leads` · INSERT `crm.opportunities`+`opportunity_items` · INSERT `crm.tasks` · INSERT `crm.transaction_refs` · `api.assign_owner('CUSTOMER',…)` · `api.merge_customers` · `api.create_dsr` · `api.set_legal_hold` | ตามตาราง CANONICAL ข้อ 8.1 |
| 06 | `pipeline` | `crm.opportunities` + `opportunity_items` + embed ลูกค้า | `moveOpportunityStage` · `closeOpportunityWon` · `closeOpportunityLost` · `updateNextAction` · `assignOpportunity` · `reopenOpportunity` · `createOpportunity` | PATCH `crm.opportunities` (`stage`) · PATCH (`stage='WON'`+`won_*`) · PATCH (`stage='LOST'`+`lost_*`) · PATCH (`next_action*`) · `api.assign_owner('OPPORTUNITY',…)` · PATCH (`stage='FOLLOW_UP'` + ล้างค่าปิด) · INSERT | `opportunity.update` · `.close` · `.assign` · `.reopen` · `.create` |
| 07 | `reception` | `crm.visits` (คิววันนี้) · `ref.interest_types` `ref.sources` | `openVisit` · `claimQueue` · `closeVisit` · `startQuickCapture` | **`api.open_visit`** · PATCH `crm.visits` (`status`+`owner_staff_id`) · **`api.close_visit`** · นำทางไป 04 พร้อม `visit_id` | `visit.create` · `visit.update` |
| 08 | `tasks` | `crm.tasks` + `task_comments` | `createTask` · `updateTask` · `completeTask` · `assignTask` · `addTaskComment` | INSERT/PATCH `crm.tasks` · `api.assign_owner('TASK',…)` · INSERT `crm.task_comments` | `task.create` · `.update` · `.assign` |
| 09 | `reports` | **`api.get_report`** (ทุกแท็บ) · `api.get_kpis` | `exportReport` (Route Handler) | **`api.record_report_export` ก่อนส่งไฟล์** | `report.view` · `report.staff_performance` · `report.export` |
| 10 | `mobile` | เหมือนหน้า 02/03/08 ในมุมมองคุณขวัญ | เหมือนหน้าที่เกี่ยวข้อง | – | – |
| 11 | `leads` | `crm.leads` + embed ลูกค้า | `updateLeadStatus` · `convertLead` · `closeLeadLost` · `assignLead` · `reopenLead` · `createLead` | PATCH `crm.leads` · **`api.convert_lead`** · PATCH (`status='LOST'`) · `api.assign_owner('LEAD',…)` · PATCH (`status='CONTACTED'` + ล้างค่าปิด) · INSERT | `lead.update` · `.assign` · `.reopen` · `.create` (+`opportunity.create` เมื่อแปลง) |
| 12 | `data-quality` | **`api.list_data_quality_issues`** · `api.get_report('DATA_QUALITY')` | `acknowledgeUnrecordedVisit` · `decideDuplicate` · `mergeCustomers` · (แก้รายการอื่นเปิดหน้าที่เกี่ยว) | `api.acknowledge_unrecorded_visit` · `api.decide_duplicate` · `api.merge_customers` | `data_quality.view` · `.resolve` · `customer.merge` 🔐 · `visit.update` |
| 13 | `users` | **`api.list_staff`** · **`api.list_role_grant_requests`** · `core.roles` `core.branches` `core.teams` | `inviteStaff` · `updateStaff` · `disableStaff` · `assignRole` · `revokeRole` · `requestRoleGrant` · `decideRoleGrant` · `saveTeam` · `setTeamMember` | Edge `invite-staff` (ตรวจด้วย `api.can_assign_role`) · `api.update_staff` · Edge `disable-staff` (→ `api.disable_staff`) · `api.assign_role` · `api.revoke_role` · `api.request_role_grant` · `api.decide_role_grant` · `api.save_team` · `api.set_team_member` | `user.*` · `role.*` 🔐 · `team.manage` |
| 14 | `master-data` | `ref.*` 16 ตาราง · `crm.tags` · `crm.campaigns` | `saveRefValue` · `saveTag` · `saveCampaign` | INSERT/PATCH `ref.*` · `crm.tags` · `crm.campaigns` | `master_data.manage` 🔐 · `tag.manage` · `campaign.manage` |
| 15 | `exports` | **`api.list_export_requests`** | `decideExport` · `downloadExport` (Route Handler `/exports/EX-…`) | `api.decide_export` · Edge `generate-export` โหมดดาวน์โหลด (→ `api.record_export_download` → signed URL 60 วินาที) | `export.approve` 🔐 · ผู้ขอ + aal2 |
| 16 | `audit` | **`api.search_audit`** · **`api.search_security_log`** (แท็บของ SA) | – (อ่านอย่างเดียว) | – | `audit.read` · `security_log.read` |
| 17 | `privacy` | **`api.list_dsr`** · `crm.customer_consents` | `createDsr` · `updateDsr` · `buildDsrPackage` · `anonymizeCustomer` | `api.create_dsr` · `api.update_dsr` · `api.build_dsr_package` · `api.anonymize_customer` | `dsr.create` · `dsr.manage` 🔐 · `customer.anonymize` 🔐 |
| 18 | `settings` | **`api.get_settings`** · **`api.list_integration_logs`** · `core.devices` (ผ่าน RPC) | `updateSetting` · `registerDevice` | `api.update_setting` · `api.register_device` | `settings.business` 🔐 · `settings.system` 🔐 · `integration.manage` 🔐 · `user.update` |
| 19 | `quotations` | `crm.quotations` + `quotation_items` | `createQuotation` · `updateQuotation` · `sendQuotation` · `setQuotationStatus` | INSERT `crm.quotations`+`quotation_items` · PATCH (DRAFT) · **PATCH `status='SENT'` + `sent_channel_code`** · PATCH `status` | `quotation.create` · `.update` |
| ทุกหน้า | shell | **`api.get_my_access`** (เมนู · ปุ่ม · กระดิ่ง) · `api.search_customers` (แถบค้นหา) · `crm.notifications` | `markNotificationRead` | PATCH `crm.notifications.read_at` | – |

**`revalidatePath` ที่ต้องเรียกหลังเขียน** (อย่างน้อย): `createCustomer` → `/customers` · `/customers/{customer_no}` · `/reception` · การเขียนใด ๆ บนลูกค้า → `/customers/{customer_no}` · การเขียนบน opportunity → `/pipeline` · `/customers/{customer_no}` · task → `/tasks` · `/` · export → `/exports`

---

## 7. ตารางสอบทาน RPC ↔ หน้าจอ ↔ สิทธิ์ ↔ ไฟล์ test

| RPC | หน้าจอ | สิทธิ์ / aal | ไฟล์ test |
|---|---|---|---|
| `api.quick_capture` | 04 · 07 | `customer.create` (+`visit.create` · `customer.consent.manage`) | `api_01_customer.sql` |
| `api.find_customer_candidates` | 04 | `customer.create` | `api_01_customer.sql` |
| `api.search_customers` | ทุกหน้า · 03 | ผู้ใช้ ACTIVE | `api_01_customer.sql` |
| `api.link_customer_to_branch` | 04 · 07 | `visit.update` (สาขาของ visit) | `api_01_customer.sql` · `rls_09_links_and_writes.sql` |
| `api.get_customer_360` | 05 | `customer.read` | `api_01_customer.sql` |
| `api.reveal_contact` · `api.reveal_address` | 03 · 05 | `customer.pii.reveal` (EX/BA ต้อง aal2) | `api_01_customer.sql` |
| `api.save_contact` · `api.save_address` | 05 | `customer.update` | `api_01_customer.sql` |
| `api.record_consent` | 05 · 17 | `customer.consent.manage` | `api_01_customer.sql` |
| `api.merge_customers` · `api.decide_duplicate` | 05 · 12 | `customer.merge` 🔐 | `api_01_customer.sql` |
| `api.open_visit` | 05 · 07 | `visit.create` | `api_02_work.sql` |
| `api.close_visit` | 07 | `visit.update` | `api_02_work.sql` |
| `api.acknowledge_unrecorded_visit` | 12 | `visit.update` | `api_02_work.sql` |
| `api.convert_lead` | 11 · 05 | `lead.update` + `opportunity.create` | `api_02_work.sql` |
| `api.assign_owner` | 03 · 05 · 06 · 08 · 11 | `*.assign` · `customer.assign` · `visit.update` | `api_02_work.sql` · `rls_07_transition.sql` |
| `api.get_kpis` | 02 · 09 | `dashboard.view` (+`report.staff_performance`) | `analytics_01_kpis.sql` · `analytics_02_reports.sql` |
| `api.get_report` | 09 · 12 | `report.view` (+`report.staff_performance`) | `analytics_02_reports.sql` |
| `api.list_data_quality_issues` | 12 | `data_quality.view` | `analytics_01_kpis.sql` |
| `api.record_report_export` | 09 | `report.export` | `analytics_02_reports.sql` |
| `api.request_export` · `api.decide_export` | 03 · 15 | `customer.export` 🔐 · `export.approve` 🔐 | `api_03_admin.sql` |
| `api.record_export_download` · `api.list_export_requests` | 15 | ผู้ขอ + aal2 · `customer.export`/`export.approve` | `api_03_admin.sql` |
| `api.search_audit` · `api.get_entity_history` | 16 · 05 | `audit.read` · `customer.update` | `api_03_admin.sql` |
| `api.search_security_log` | 16 | `security_log.read` | `api_03_admin.sql` |
| `api.get_my_access` | ทุกหน้า | ผู้ใช้ที่เข้าสู่ระบบ | `api_03_admin.sql` |
| `api.can_assign_role` · `api.assign_role` · `api.revoke_role` | 13 | `role.assign` 🔐 | `api_03_admin.sql` |
| `api.request_role_grant` · `api.decide_role_grant` · `api.list_role_grant_requests` | 13 | `role.request` · `role.decide` 🔐 | `api_03_admin.sql` |
| `api.activate_self` | flow คำเชิญ | บัญชี INVITED ของตน | `api_03_admin.sql` |
| `api.list_staff` · `api.update_staff` · `api.disable_staff` | 13 | `user.read` · `user.update` · `user.disable` 🔐 | `api_03_admin.sql` |
| `api.save_team` · `api.set_team_member` | 13 | `team.manage` | `api_03_admin.sql` |
| `api.register_device` | 18 | `user.update` scope B | `api_03_admin.sql` |
| `api.get_settings` · `api.update_setting` | 18 | `settings.business`/`settings.system` 🔐 | `api_03_admin.sql` |
| `api.create_dsr` · `api.list_dsr` · `api.update_dsr` · `api.build_dsr_package` | 05 · 17 | `dsr.create` · `dsr.manage` 🔐 | `api_03_admin.sql` |
| `api.anonymize_customer` · `api.set_legal_hold` | 17 · 05 | `customer.anonymize` 🔐 · `dsr.manage` 🔐 | `api_03_admin.sql` |
| `api.list_integration_logs` | 18 | `integration.manage` 🔐 | `api_03_admin.sql` |
| `api.svc_*` (7 ตัว) | Edge Function | `service_role` | `api_03_admin.sql` |
| RLS ของตารางที่หน้าจออ่าน/เขียนตรง | 03 · 05 · 06 · 07 · 08 · 11 · 19 | ตาราง CANONICAL ข้อ 8.1 | `rls_01`–`rls_09` |
| งานตามเวลาที่เปลี่ยนข้อมูลที่ API คืน | – | `postgres` (cron) | `jobs_01.sql` |

ผลการทดสอบล่าสุด: **17 ไฟล์ · 1,324 assertion ผ่านทั้งหมด** (`node tools/db/run.mjs --test --quiet`)

---

## 8. หมายเหตุผู้เขียน · ส่วนต่างจาก CANONICAL · รายการรอยืนยัน

### 8.1 คำถามที่เอกสารอื่นฝากให้ `api-spec.md` ตอบ

| # | ผู้ฝาก | คำถาม | คำตอบในเอกสารนี้ |
|---|---|---|---|
| A1 | `sitemap-screen-specs.md` ข้อ 7.6 | ชื่อคีย์ของ `p` ที่ส่ง visit ที่เปิดอยู่ให้ `api.quick_capture` | **`visit_id`** (uuid ของ visit ไม่ใช่ `visit_no`) · ข้อ 3.1.1 |
| A2 | `rls-spec.md` ข้อ 8.3 แถว 9 | `team_id` ที่ `api.assign_owner` เขียนเป็น snapshot ค่าใด | **ทีมปัจจุบันของผู้รับใหม่ในสาขาปลายทาง · เลือกทีมที่ `core.teams.code` มาก่อนตามตัวอักษรเมื่ออยู่หลายทีม** · `NULL` เมื่อผู้รับไม่มีทีมในสาขานั้น (ข้อ 3.4.5) — CANONICAL ข้อ 7.1 ตรึงเพียงว่า `team_id` เป็น snapshot ตอนมอบงาน ไม่ได้ตรึงวิธีเลือกเมื่ออยู่หลายทีม → **หมายเหตุผู้เขียน** |
| A3 | `system-architecture.md` หมายเหตุ E13 | ที่มาของ `file_path` ตอนออก signed URL | **`api.record_export_download` คืน `file_path` ให้ผู้ขอที่ผ่านการตรวจแล้ว** (ข้อ 3.6.3) · `api.list_export_requests` **ไม่คืน** `file_path` |
| A4 | `system-architecture.md` หมายเหตุ E12 | พารามิเตอร์จริงของ `reset-mfa` | `{target_staff_id, reason?}` ใน body · `actor_user_id` และ `actor_aal` มาจาก JWT ที่ verify แล้ว **ไม่ใช่จาก body** (ข้อ 3.10 · 5.2) |
| A5 | `system-architecture.md` §4.2 | mapping ชื่อ constraint → ข้อความไทย | ข้อ 2.8.4 |
| A6 | `system-architecture.md` §4.2 | รหัสข้อความของ `P0001` | ข้อ 2.8.2 (`JCRM-Tnn`) และ 2.8.3 (ข้อความของ RPC) |
| A7 | `sitemap-screen-specs.md` ข้อ 9.6 | กติกาของ `origin_channel_code` เมื่อสร้างโอกาสขายตรง | ตาม CANONICAL ข้อ 4.4: มาจาก lead ต้นทางถ้ามี · มิฉะนั้นเป็นช่องทางของ visit/interaction ที่ใช้สร้าง · **ถ้าส่ง `origin_visit_id` ค่าต้องตรงกับช่องทาง สาขา และลูกค้าของ visit นั้น** (policy ของ `crm.opportunities`) · ตั้งครั้งเดียวเปลี่ยนไม่ได้ — กรณีสร้างโดยไม่มี visit/lead ผู้ใช้เลือกช่องทางเองและ **CANONICAL ไม่ได้ตรึงชุดค่าที่เลือกได้** → **รอยืนยัน** (U11) |
| A8 | `rls-spec.md` ข้อ 8.4 | ชื่อ RPC ที่บันทึกการดาวน์โหลดแพ็กเกจ DSR | **ยังไม่มีในฐานข้อมูล และ CANONICAL ข้อ 9.6 ไม่ได้ระบุไว้ → รอยืนยัน** (U3) |

### 8.2 ส่วนต่างระหว่าง implementation กับ CANONICAL (CANONICAL เป็นฉบับบังคับ)

| # | เรื่อง | CANONICAL | implementation ปัจจุบัน | ข้อเสนอ |
|---|---|---|---|---|
| D1 | action ของ access log เมื่อเปิดที่อยู่เต็ม | ข้อ 9.5 ระบุ action ของ `audit.access_logs` ไว้ 5 ค่า (`CUSTOMER_VIEWED` `CONTACT_REVEALED` `CUSTOMER_CANDIDATE_SEARCH` `CUSTOMER_SEARCH` `CUSTOMER_LINKED_TO_BRANCH`) ไม่มีค่าสำหรับที่อยู่ | `api.reveal_address` ใช้ `CONTACT_REVEALED` และใส่ `detail = {"kind":"ADDRESS"}` (คอลัมน์ `contact_id` เก็บ `address_id`) | คงตาม implementation ใน V1 (อยู่ในชุดค่าที่ CANONICAL อนุญาต) · ถ้าต้องการแยกรายงาน ให้เพิ่ม action ใหม่ผ่าน migration + แก้ CANONICAL ข้อ 9.5 |
| D2 | action ของ audit เมื่อสร้างแพ็กเกจ DSR | ข้อ 9.5 ไม่มี `DSR_PACKAGE_BUILT` ในรายการ action | `api.build_dsr_package` เขียน `DSR_PACKAGE_BUILT` (รูป `{ENTITY}_{VERB}` ถูกต้อง) | เสนอเพิ่ม `DSR_PACKAGE_BUILT` ในรายการของ CANONICAL ข้อ 9.5 |
| D3 | `api.record_export_download` คืน `file_path` | ข้อ 8.2 ระบุเพียงว่า RPC นี้บันทึกการดาวน์โหลดก่อนออก signed URL | คืน `file_path` ด้วย (จำเป็นตาม system-architecture E13 เพราะ `audit.export_requests` ไม่เปิด API) | คงไว้ · ผลลัพธ์นี้คืนให้ **ผู้ขอเท่านั้น** หลังผ่านการตรวจครบ |
| D4 | task ตอนปิดใช้งานผู้ใช้ | ข้อ 7.3 ข้อ 4: "lead/task ที่เปิดอยู่ → owner ว่าง" | `api.disable_staff` ล้าง owner เฉพาะ task ที่ **ไม่ใช่** `is_next_action` · task `is_next_action` ตามเจ้าของของ lead/opportunity แม่ผ่าน trigger (ข้อ 4.4 "next action เป็นแหล่งจริงของงานติดตาม") | คงตาม implementation เพราะการล้าง owner ของ task `is_next_action` ตรงจะขัดกับ trigger ของข้อ 4.4 · **เสนอให้ CANONICAL ข้อ 7.3 ระบุข้อยกเว้นนี้ให้ชัด** |
| D5 | เพดานผลของการค้นหาทั่วไป | ข้อ 6.5 ไม่ได้ตรึงจำนวนผล | `api.search_customers` คืนลูกค้าสูงสุด **20 ราย** · กลุ่มอื่นไม่จำกัด | ตัวเลข 20 เป็นค่าของ implementation → **รอยืนยัน** (U13) |
| D6 | เกณฑ์ trigram ของการค้นหาทั่วไป | ข้อ 6.5 ตรึง threshold **0.6** เฉพาะกฎคะแนน 40 ของการตรวจซ้ำ · ไม่ได้ตรึงของการค้นหาทั่วไป | `api.search_customers` ใช้ `similarity ≥ 0.3` (กว้างกว่าเพื่อให้พิมพ์ชื่อบางส่วนแล้วเจอ) · `app.candidate_scores` ใช้ 0.6 ตาม CANONICAL | **รอยืนยัน** ค่า 0.3 (U14) |
| D7 | สถานะของคำขอ DSR | ข้อ 4.8 ตรึงชุดค่า แต่ไม่ได้ตรึงกราฟการเปลี่ยนสถานะ | `api.update_dsr` อนุญาต `RECEIVED→VERIFIED/REJECTED` · `VERIFIED→IN_PROGRESS/COMPLETED/REJECTED` · `IN_PROGRESS→COMPLETED/REJECTED` | **หมายเหตุผู้เขียน** — เส้นทาง `VERIFIED→COMPLETED` มีไว้สำหรับคำขอที่ทำเสร็จในขั้นตอนเดียว (เช่น `WITHDRAW_CONSENT`) |
| D8 | สาขาอ้างอิงของกฎคะแนน 40 เมื่อไม่ส่ง `p_visit_id` | ข้อ 6.5 เขียนว่า "`first_branch_id` = สาขาของผู้เรียก/visit" โดยไม่ได้ตรึงกรณีผู้เรียกมีหลายสาขา | ใช้ `app.scope_branch_ids('customer.create','OWN')[1]` (สาขาแรกในอาร์เรย์) | **รอยืนยัน** (U15) — ข้อเสนอ: ให้ UI ส่งสาขาที่ผู้ใช้เลือกในฟอร์มมาด้วยเมื่อไม่มี visit |
| D9 | เพดานของ `api.list_export_requests` | – | ใช้ `p.limit` (ค่าเริ่มต้น 200) โดยไม่ครอบด้วย `least(…, 200)` เหมือน RPC ค้นหาอื่น | **หมายเหตุผู้เขียน** — ปริมาณจำกัดด้วยขอบเขตอยู่แล้ว · ถ้าต้องการให้สอดคล้องกันควรครอบที่ 200 ใน migration ถัดไป |
| D10 | ผู้อนุมัติคำขอส่งออกของ EXECUTIVE | ข้อ 8.2 · **Q23 รอยืนยัน** | `app.settings['export.limits'].EXECUTIVE.approver_role = 'BUSINESS_ADMIN'` | ใช้ค่านี้ไปก่อนตามข้อเสนอของ CANONICAL ข้อ 17 Q23 |

### 8.3 รายการ "รอยืนยัน" ที่กระทบสัญญาของ API

| # | เรื่อง | ค่าที่ใช้ไปก่อน | ที่มา |
|---|---|---|---|
| U1 | `max_rows` ของ PostgREST | 200 | CANONICAL ข้อ 1.1 |
| U2 | เวลาซ่อนค่าเต็มอัตโนมัติ (`auto_hide_seconds`) | 30 วินาที | ข้อ 6.4 |
| U3 | Edge Function และ `api.svc_*` ของแพ็กเกจ DSR (เขียนไฟล์ · บันทึกการดาวน์โหลด · ออก signed URL) | **ยังไม่มี** — V1 ใช้ผลลัพธ์ของ `api.build_dsr_package` ที่ BUSINESS_ADMIN เป็นผู้จัดส่งตามกระบวนการภายนอกระบบ | ข้อ 9.6 · 10.4 · rls-spec ข้อ 8.4 |
| U4 | รูปแบบชื่อไฟล์/path ของไฟล์ส่งออก | ต้องมี `export_no` + `staff_code` ตามลายน้ำ (รูปเต็มยังไม่ตรึง) | ข้อ 8.2 · system-architecture §3.6 |
| U5 | ตัวเรียกและตารางเวลาของ `cron-export-cleanup` | pg_cron + pg_net หรือ scheduler ภายนอก | ข้อ 1 · 9.6 |
| U6 | หน้าต่าง 4 ชั่วโมงของ visit ใน `find_customer_candidates` / `link_customer_to_branch` | 4 ชม. | ข้อ 6.5 · 6.6 |
| U7 | `next_action_at` ปริยายของ lead จาก Quick Capture | `created_at + 30 นาที` | ข้อ 4.3 |
| U8 | ตัวเลขเพดานการส่งออกทั้งตาราง | ตาม `app.settings['export.limits']` | ข้อ 8.2 · Q7 |
| U9 | การเลือกผู้จัดการสาขารับช่วง opportunity ตอนปิดใช้งานผู้ใช้ | `staff_code` น้อยสุด | ข้อ 7.3 ข้อ 4 |
| U10 | `duplicate_decisions.matched_rules` เก็บข้อความเหตุผลบนการ์ด (รหัสกฎยังไม่ตรึง) | ข้อความไทยตามตารางข้อ 3.1.2 | ข้อ 19.1 ข้อ 7 |
| U11 | ช่องทางต้นทางของโอกาสขายที่สร้างโดยไม่มี lead และไม่มี visit | ผู้ใช้เลือกจาก `ref.channels` ที่ `is_active` | ข้อ 4.4 · sitemap ข้อ 9.6 |
| U12 | `security.link_per_day` เกินแล้วยัง "ผูกสำเร็จ" | ผูกสำเร็จ + แจ้งผู้จัดการสาขา | ข้อ 6.6 |
| U13 | เพดานผลลูกค้าของ `api.search_customers` | 20 ราย | implementation |
| U14 | เกณฑ์ trigram ของการค้นหาชื่อทั่วไป | 0.3 | implementation |
| U15 | สาขาอ้างอิงของกฎคะแนน 40 เมื่อไม่มี visit | สาขาแรกในสิทธิ์ `customer.create` | implementation |

### 8.4 สิ่งที่ยังไม่มีใน V1 (ตามขอบเขต Phase)

- ไม่มี RPC สำหรับ **จัดการแคมเปญเต็ม** (V1 เพิ่มแคมเปญผ่านตาราง `crm.campaigns` ที่หน้า 14 · `campaign_members` และหน้าแคมเปญเต็ม = Phase 4)
- ไม่มี API ของ **`crm.online_conversations`** และ `restricted.customer_documents` (Phase 4) · ไม่มี `crm.segments` (Phase 5)
- ไม่มีการ **อัปโหลดไฟล์ของลูกค้า** (CANONICAL ข้อ 1 · 10.1) — bucket `exports` ใช้กับไฟล์ส่งออกเท่านั้น
- ไม่มี `customer.delete` และไม่มี **unmerge** (CANONICAL ข้อ 8.1 · 6.7)
- `transaction_refs` **เพิ่มได้อย่างเดียว** (แก้/ยกเลิกใช้สคริปต์ของ BUSINESS_ADMIN · CANONICAL Q29)
- `core.role_permissions` แก้ได้ผ่าน **migration เท่านั้น** (ไม่มีหน้าจอ/RPC ใน V1 · CANONICAL ข้อ 7.2)

---

## ภาคผนวก · ตัวอย่างชั้น Server Action (อ้างอิง)

```ts
// app/(app)/customers/actions.ts — ตัวอย่างการแปลงข้อผิดพลาดร่วม (ข้อ 2.8)
export type ActionError = { message: string; field?: string; requestId?: string };

export function toActionError(e: PostgrestError, requestId?: string): ActionError {
  // JCRM-Tnn → ใช้ hint ภาษาไทย
  if (e.message?.startsWith('JCRM-')) return { message: e.hint ?? 'ไม่อนุญาต', requestId };
  switch (e.code) {
    case '42501': return { message: e.message || 'คุณไม่มีสิทธิ์ทำรายการนี้', requestId };
    case '22023':
    case 'P0001': return { message: e.message, requestId };            // ข้อความไทยจาก RPC
    case '23505': return { message: mapUnique(e.details), requestId }; // ข้อ 2.8.4
    case '23514': return { message: mapCheck(e.details), requestId };  // ข้อ 2.8.4
    case '23503': return { message: 'ค่าอ้างอิงไม่ถูกต้อง', requestId };
    case '22P02': return { message: 'รูปแบบข้อมูลไม่ถูกต้อง', requestId };
    default:      return { message: 'ระบบขัดข้อง ลองใหม่อีกครั้ง', requestId };
  }
}

// ทุกการ PATCH ต้องตรวจจำนวนแถวที่คืน (ข้อ 2.8.1 แถว "200 + []")
const { data, error } = await supabase.schema('crm').from('opportunities')
  .update({ stage: 'WON', won_amount, won_at, closed_at: won_at })
  .eq('id', id).select();
if (error) return toActionError(error, requestId);
if (!data?.length) return { message: 'ไม่พบรายการ หรือคุณไม่มีสิทธิ์' };
```

```ts
// เรียก RPC ที่คืน envelope (ข้อ 2.3)
const { data, error } = await supabase.schema('api').rpc('reveal_contact', {
  p_contact_id: contactId, p_purpose: 'CALL',
});
if (error) return toActionError(error, requestId);
if (!data.ok) {
  // รหัสแบบไม่ raise (ข้อ 2.8.5) — ตัวนับและการแจ้งเตือนถูก commit แล้ว
  if (data.code === 'REVEAL_LIMIT_EXCEEDED')
    return { message: 'เปิดดูข้อมูลติดต่อครบจำนวนที่กำหนดต่อชั่วโมงแล้ว' };
}
```

---

**จบเอกสาร** · ฉบับนี้ตรงกับ `supabase/migrations/0001`–`0014` และผ่านการตรวจกับผลทดสอบ 17 ไฟล์ · 1,324 assertion
