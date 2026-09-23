# Edge Functions — JAUN CRM

Deno + TypeScript ตามแบบ Supabase Edge Functions · ฟังก์ชันชุด **Identity & Access** ตาม CANONICAL ข้อ 9.2 · 9.8
และ `docs/02-architecture/system-architecture.md` §3.5

```
supabase/functions/
├── deno.json                 ← ตั้งค่า fmt/lint/strict ของโฟลเดอร์นี้
├── _shared/
│   ├── clients.ts            ← serviceClient · callerClient · anonClient + การอ่าน secret
│   ├── caller.ts             ← verify JWT ผู้เรียก → { userId, aal, jwt }
│   ├── http.ts               ← CORS · รูปแบบคำตอบ { ok } · อ่าน body · IP · request id
│   ├── errors.ts             ← กรองข้อความฐานข้อมูลให้เหลือเฉพาะที่ปลอดภัยจะแสดง
│   ├── rate-limit.ts         ← เพดานลองเข้าสู่ระบบต่อ IP (best-effort)
│   └── login-events.ts       ← hook บันทึก audit.login_events (ปิดไว้ · ดู "ช่องที่ยังเปิดอยู่")
├── invite-staff/index.ts
├── staff-code-login/index.ts
├── password-reset/index.ts
├── disable-staff/index.ts
└── reset-mfa/index.ts
```

---

## 1. สัญญาของแต่ละฟังก์ชัน

เรียกจากแอปด้วย `(await getDb()).functions.invoke('<ชื่อ>', { body })`
ซึ่งยิงไปที่ `<SUPABASE_URL>/functions/v1/<ชื่อ>`

| ฟังก์ชัน | body | คืนค่าเมื่อสำเร็จ | ผู้เรียกต้องมี JWT ของผู้ใช้ |
|---|---|---|---|
| `invite-staff` | `{ email, employee_code, display_name, nickname?, phone?, role_code, branch_id? }` | `{ ok: true, staff_id, staff_code, invite_url, expires_at }` | ✅ |
| `staff-code-login` | `{ staff_code, password }` | `{ ok: true, session: { access_token, refresh_token, expires_in, expires_at, token_type } }` | ❌ (ยังไม่ล็อกอิน) |
| `password-reset` | `{ login_id }` | `{ ok: true }` **เสมอ** | ❌ |
| `disable-staff` | `{ staff_id, reason }` | `{ ok: true, staff_id, staff_code }` | ✅ |
| `reset-mfa` | `{ staff_id, reason }` | `{ ok: true, staff_id, factors_deleted }` | ✅ (และต้องเป็น **aal2**) |

ล้มเหลวเชิงธุรกิจคืน `{ ok: false, message }` พร้อม **HTTP 200** เสมอ
เหตุผล: `functions.invoke` ของ supabase-js โยน `FunctionsHttpError` เมื่อ status ≥ 400 และแอปจะอ่าน `message` ไม่ได้
สงวน 4xx ไว้กับ "ไม่มี JWT" (401) และ "เมธอดผิด" (405) เท่านั้น

### หมายเหตุเรื่อง `staff-code-login` กับคีย์ `session`

สัญญาที่ตรึงไว้ระบุว่าคืน `{ ok }` · ที่นี่คืน `{ ok: true, session: {...} }` เพราะ CANONICAL ข้อ 9.2
ระบุว่าฟังก์ชันนี้ "ทำ password grant ฝั่ง server **คืน session เท่านั้น** ไม่คืนอีเมล" —
ถ้าไม่คืน token ฝั่ง Next.js จะสร้าง cookie เซสชันไม่ได้เลย

`session` ที่คืนมี **เฉพาะ token** ไม่มี object `user` ของ Supabase (ใน `user` มีอีเมลติดมาด้วย)
แอปที่อ่านแค่ `ok` ยังทำงานได้เหมือนเดิม · แอปที่ต้องสร้างเซสชันให้เอา `session` ไป `auth.setSession(...)`
ใน Server Action แล้วเขียน cookie HttpOnly ต่อ

---

## 2. Secret ที่ต้องตั้ง

| ชื่อ | ใครตั้ง | หมายเหตุ |
|---|---|---|
| `SUPABASE_URL` | Supabase ใส่ให้อัตโนมัติ | – |
| `SUPABASE_ANON_KEY` | Supabase ใส่ให้อัตโนมัติ | – |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase ใส่ให้อัตโนมัติ | **ห้าม** hardcode · **ห้าม** log · **ห้าม** อยู่ใน env ของ Next.js (ข้อ 9.8) |
| `APP_BASE_URL` | ตั้งเอง | ฐาน URL ของเว็บแอป เช่น `https://crm.jaunphone.co.th` (ไม่ต้องมี `/` ท้าย) ใช้ประกอบ `redirectTo` ของลิงก์คำเชิญ/รีเซ็ต |
| `LOGIN_IP_PER_15MIN` | ไม่บังคับ | ทับค่าเริ่มต้น 20 · ให้ตรงกับ `app.settings['security.login_ip_per_15min']` เมื่อ BUSINESS_ADMIN แก้ค่า |
| `LOGIN_EVENT_RPC` | ไม่บังคับ · **ยังไม่ต้องตั้ง** | ชื่อ RPC ใน schema `api` ที่เขียน `audit.login_events` — ดูหัวข้อ 6 |

```bash
supabase secrets set APP_BASE_URL="https://crm.jaunphone.co.th"
supabase secrets list          # ตรวจว่ามีครบ (คำสั่งนี้ไม่แสดงค่า)
```

---

## 3. Deploy

```bash
cd "JAUN CRM หน้าร้าน"
supabase link --project-ref <project-ref>

# deploy ทีละตัว
supabase functions deploy invite-staff
supabase functions deploy disable-staff
supabase functions deploy reset-mfa

# สองตัวนี้ผู้เรียก "ยังไม่ล็อกอิน" — ดูหัวข้อ verify_jwt ด้านล่าง
supabase functions deploy staff-code-login
supabase functions deploy password-reset
```

### verify_jwt

ค่าเริ่มต้นของ Supabase คือ `verify_jwt = true` — gateway บังคับให้มี `Authorization: Bearer <JWT>`

* `invite-staff` · `disable-staff` · `reset-mfa` — **เปิดไว้** (ค่าเริ่มต้น) และภายในฟังก์ชันยัง verify ซ้ำเองว่า
  JWT นั้นเป็นของ "ผู้ใช้จริง" (`role = authenticated`) ไม่ใช่ anon/service key
* `staff-code-login` · `password-reset` — ผู้เรียกยังไม่ล็อกอิน **แต่ยังควรเปิด `verify_jwt` ไว้**
  เพราะ Next.js สร้าง Supabase client ด้วย anon key ซึ่งส่ง `Authorization: Bearer <anon key>` ให้เอง
  (anon key เป็น JWT ที่ถูกต้อง gateway จึงปล่อยผ่าน) · ทั้งสองฟังก์ชันไม่เคยถือว่า anon key คือผู้ใช้

ถ้าจำเป็นต้องเรียกสองตัวนี้จากที่ไม่มี anon key ให้ deploy ด้วย `--no-verify-jwt`
(**ไม่แนะนำ** เพราะเปิดให้ยิงจากภายนอกได้โดยไม่ผ่านเพดานของ gateway)

### ตั้งค่า Auth ของโปรเจกต์ที่ฟังก์ชันชุดนี้พึ่งพา (ข้อ 9.2 — ไม่ได้ตั้งในโค้ดนี้)

* ปิด public sign-up (`Allow new users to sign up` = off · `[auth] enable_signup = false`)
* อายุ OTP/ลิงก์อีเมล = **3600 วินาที** (ลิงก์รีเซ็ต 1 ชม. · คำเชิญยังคุมด้วย `staff_profiles.invite_expires_at` 24 ชม.)
* รหัสผ่าน ≥ 12 ตัวอักษร · เปิด leaked password protection · เปิด Secure password change
* เปิด MFA (TOTP) · Access token 15 นาที · refresh token rotation · reuse interval 10 วินาที
* ตั้ง Redirect URL ให้ครอบคลุม `${APP_BASE_URL}/auth/confirm`
* ตั้งเทมเพลตอีเมล `Invite` และ `Reset password` เป็นภาษาไทย

---

## 4. ทดสอบด้วย curl

ตั้งตัวแปรก่อน (อย่า paste service_role key ลง shell history):

```bash
SB_URL="https://<project-ref>.supabase.co"
ANON="<anon key>"
```

### 4.1 `staff-code-login` — ไม่มีบัญชี · รหัสผิด · บัญชีถูกปิด ต้องได้ข้อความเดียวกัน

```bash
curl -s -X POST "$SB_URL/functions/v1/staff-code-login" \
  -H "Authorization: Bearer $ANON" -H 'content-type: application/json' \
  -d '{"staff_code":"ST-0045","password":"<รหัสผ่านจริง>"}'
# { "ok": true, "session": { "access_token": "...", "refresh_token": "...", ... } }

curl -s -X POST "$SB_URL/functions/v1/staff-code-login" \
  -H "Authorization: Bearer $ANON" -H 'content-type: application/json' \
  -d '{"staff_code":"ST-0045","password":"ผิดแน่ๆ"}'
curl -s -X POST "$SB_URL/functions/v1/staff-code-login" \
  -H "Authorization: Bearer $ANON" -H 'content-type: application/json' \
  -d '{"staff_code":"ST-9999","password":"อะไรก็ได้"}'
# ทั้งสองต้องได้ { "ok": false, "message": "รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง" }
# และ **ต้องไม่มีอีเมลโผล่ในคำตอบ** — ตรวจด้วย  ... | grep -i '@'   ต้องไม่เจอ
```

### 4.2 `password-reset` — ตอบ `{ok:true}` เสมอ

```bash
for ID in 'ST-0045' 'ST-9999' 'ไม่มีจริง@example.com' 'ขยะ'; do
  curl -s -X POST "$SB_URL/functions/v1/password-reset" \
    -H "Authorization: Bearer $ANON" -H 'content-type: application/json' \
    -d "{\"login_id\":\"$ID\"}"; echo
done
# ต้องได้ { "ok": true } ทั้งสี่บรรทัด
```

### 4.3 `invite-staff` — ต้องใช้ JWT ของผู้เชิญจริง

```bash
# 1) ได้ access_token ของ BRANCH_MANAGER JP1 (คุณเจ · ST-0020) จาก 4.1 ก่อน
JWT="<access_token ของ ST-0020>"

# เชิญพนักงานสาขาตัวเอง → ok:true
curl -s -X POST "$SB_URL/functions/v1/invite-staff" \
  -H "Authorization: Bearer $JWT" -H 'content-type: application/json' \
  -d '{"email":"new.staff@jaunphone.co.th","employee_code":"EMP-101",
       "display_name":"ทดสอบ เชิญใหม่","role_code":"STAFF","branch_id":"<uuid ของ JP1>"}'

# เชิญข้ามสาขา (branch_id ของ JP2) → ok:false + เหตุผลไทยจาก app.assign_role_denial
# สร้าง Role สูงกว่าตัวเอง (role_code":"BUSINESS_ADMIN") → ok:false เช่นกัน
# ไม่ส่ง Authorization หรือส่ง anon key → HTTP 401 { ok:false }
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$SB_URL/functions/v1/invite-staff" \
  -H "Authorization: Bearer $ANON" -H 'content-type: application/json' -d '{}'
# 401
```

### 4.4 `disable-staff`

```bash
curl -s -X POST "$SB_URL/functions/v1/disable-staff" \
  -H "Authorization: Bearer $JWT" -H 'content-type: application/json' \
  -d '{"staff_id":"<uuid ของเป้าหมาย>","reason":"ลาออก 30 ก.ย. 2569"}'
# { "ok": true, "staff_id": "...", "staff_code": "ST-00xx" }

# แล้วล็อกอินด้วยบัญชีที่เพิ่งปิด → ต้องได้ข้อความเดียวกันของ 4.1 ทันที
```

### 4.5 `reset-mfa`

```bash
# ด้วยเซสชัน aal1 → ok:false "ต้องยืนยันตัวตนสองขั้น (MFA) ในเซสชันนี้ก่อน…"
# ด้วยเซสชัน aal2 ของ BUSINESS_ADMIN (คุณแพร · ST-0002) กับเป้าหมาย STAFF → ok:true
curl -s -X POST "$SB_URL/functions/v1/reset-mfa" \
  -H "Authorization: Bearer $JWT_AAL2" -H 'content-type: application/json' \
  -d '{"staff_id":"<uuid ของเป้าหมาย>","reason":"พนักงานเปลี่ยนเครื่อง"}'
```

### 4.6 รันในเครื่อง (ต้องมี Deno + Supabase CLI)

```bash
cd "JAUN CRM หน้าร้าน"
deno fmt  --check supabase/functions
deno lint supabase/functions
deno check supabase/functions/*/index.ts

supabase start
supabase functions serve --env-file supabase/functions/.env.local
# แล้วเปลี่ยน SB_URL ใน 4.x เป็น http://127.0.0.1:54321
```

> `.env.local` ของ `functions serve` ต้องไม่ถูก commit — ใส่ `supabase/functions/.env*` ใน `.gitignore`

---

## 5. กติกาที่โค้ดชุดนี้ยึด (ตรวจตอน review)

1. **ผู้กระทำมาจาก JWT เท่านั้น** — ไม่มีฟังก์ชันไหนอ่าน `actor_user_id` · `actor_staff_id` จาก body
   (`_shared/caller.ts` verify ด้วย `auth.getUser()` แล้วจึงถอด claim `aal`)
2. **ตรวจสิทธิ์ในบริบทผู้ใช้ก่อนแตะ service_role**
   `invite-staff` → `api.can_assign_role` ด้วย JWT ผู้เชิญ · `disable-staff` → `api.disable_staff` ด้วย JWT ผู้กระทำ
   จากนั้นจึงส่ง `actor_user_id` + `actor_aal` ให้ `api.svc_*` ตัดสินซ้ำ — **ฐานข้อมูลเป็นผู้ปฏิเสธจริงเสมอ**
3. **ไม่มี connection string** — แตะฐานข้อมูลผ่าน PostgREST (`.schema('api').rpc(...)`) เท่านั้น
4. **service_role key** อ่านจาก `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` ที่เดียว (`_shared/clients.ts`)
   ไม่เคย log ไม่เคยอยู่ในคำตอบ
5. **ไม่ส่งข้อความดิบของฐานข้อมูลออกไป** — `_shared/errors.ts` ปล่อยผ่านเฉพาะข้อความที่มีอักษรไทย
   และไม่เข้าลายข้อความภายในของ PostgreSQL (`duplicate key` · `violates` · `relation "…"` …)
   ที่เหลือแทนด้วยข้อความกลาง และเก็บของจริงไว้ใน `console.error` พร้อม `request_id`
6. **ไม่ log body** ของผู้ใช้ · อีเมลและรหัสผ่านไม่เคยลง log
7. ข้อความบนจอเป็นภาษาไทยทั้งหมด · คอมเมนต์ในโค้ดเป็นภาษาไทยและอธิบาย "ทำไม"

---

## 6. ช่องที่ยังเปิดอยู่ — ต้องตัดสินก่อน go-live

### 6.1 `audit.login_events` ยังไม่มีใครเขียนได้

`supabase/migrations/0008_audit.sql` สั่ง
`REVOKE ALL ON audit.login_events FROM PUBLIC, anon, authenticated, service_role`
และ **ยังไม่มี `api.svc_*` ตัวใดที่ INSERT ตารางนี้** → วันนี้ Edge Function บันทึก Login/MFA audit ไม่ได้เลย

`_shared/login-events.ts` จึงเตรียม hook ไว้แต่ **ปิดอยู่** (ไม่มี `LOGIN_EVENT_RPC` = ไม่ทำอะไร)
เพื่อไม่ให้เกิดชื่อ RPC ที่ไม่มีจริงและทีมอื่นเข้าใจผิดว่ามีสัญญาแล้ว

สิ่งที่ต้องเพิ่มใน migration ถัดไป (เจ้าของ migration เป็นผู้ตั้งชื่อจริง):

```sql
-- ข้อเสนอ · ชื่อรอยืนยัน
CREATE FUNCTION api.svc_log_login(p jsonb) RETURNS jsonb
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.svc_guard();
  INSERT INTO audit.login_events (user_id, staff_id, event_type, method, success, failure_reason,
                                  identifier_hash, aal, ip, user_agent, device_id, request_id)
  VALUES (…);                     -- อ่านคีย์จาก p ตามชื่อคอลัมน์
  RETURN jsonb_build_object('ok', true);
END $$;
```

คีย์ที่ฟังก์ชันชุดนี้ส่งไปให้อยู่แล้ว: `event_type` · `method` · `success` · `failure_reason` ·
`user_id` · `identifier_hash` (sha256 hex) · `aal` · `ip` · `user_agent` · `request_id`
เมื่อ RPC พร้อมแล้ว ตั้ง `supabase secrets set LOGIN_EVENT_RPC=svc_log_login` แล้วบันทึกจะเริ่มทำงานทันที
โดยไม่ต้องแก้โค้ดฟังก์ชัน

ส่วน **Invite / Disable / MFA audit ทำงานครบแล้ว** เพราะ `api.svc_prepare_invite` (trigger บน `core.staff_profiles`) ·
`api.svc_finalize_disable` (`STAFF_DISABLED`) · `api.svc_reset_mfa_authorize` (`MFA_RESET`) เขียน `audit.audit_logs` ให้เอง

### 6.2 `password-reset` เส้นทาง "กรอกอีเมล" ยังไม่ตรวจสถานะ ACTIVE

ข้อ 9.2 ระบุ "เฉพาะบัญชี ACTIVE" · เส้นทาง `ST-NNNN` ทำได้เพราะ `api.svc_resolve_staff_code`
คืนเฉพาะ ACTIVE · แต่เส้นทางอีเมล **ไม่มี `api.svc_*` ที่ค้นบัญชีจากอีเมล** จึงส่งต่อให้ GoTrue ตรง

ผลกระทบจำกัด: บัญชีที่ถูก `disable-staff` จะถูก ban ใน Auth อยู่แล้ว ตั้งรหัสใหม่แล้วก็เข้าระบบไม่ได้
ถ้าต้องการปิดสนิทตามตัวอักษรของข้อ 9.2 ให้เพิ่ม `api.svc_resolve_login_email(p_email text)`
ที่คืนเพียง `{ ok, user_id }` (ห้ามคืนอีเมลหรือชื่อ) แล้วเรียกก่อนส่งอีเมล

### 6.3 `disable-staff` ไม่ได้เพิกถอน refresh token ทีละใบ

`api.svc_finalize_disable` เขียน audit ว่า `sessions_revoked: true` · สิ่งที่โค้ดนี้ทำจริงคือ
ตั้ง `ban_duration` 100 ปีผ่าน `auth.admin.updateUserById` ซึ่งทำให้ GoTrue ปฏิเสธทั้ง refresh
และ `/auth/v1/user` → `proxy.ts` ของ Next.js ที่เรียก `getUser()` ทุก request เด้งผู้ใช้ออกทันที
(supabase-js v2 ไม่มี admin API สำหรับ "ลบทุก session ของ user id" โดยตรง)

access token ใบที่ถืออยู่ยังไม่หมดอายุภายใน ≤ 15 นาที แต่ `api.disable_staff` ถอน assignment
และเปลี่ยน `status` เป็น `DISABLED` ไปก่อนแล้ว → RLS ปฏิเสธทุกอย่าง ข้อมูลจึงเข้าไม่ถึงตั้งแต่วินาทีแรก
**ต้องยืนยันบน staging** ว่าพฤติกรรมนี้เป็นไปตามที่คาด (ดูหัวข้อ 7)

### 6.4 `invite-staff` พึ่ง `api.svc_link_invited_user` ที่เพิ่งเพิ่มใน migration

`api.svc_prepare_invite` สร้างโปรไฟล์ `INVITED` โดย **ยังไม่มี `user_id`** ส่วนบัญชีใน Auth เกิดตอน
`generateLink` · ฟังก์ชันนี้จึงเรียก `api.svc_link_invited_user({ staff_id, user_id })` เป็นขั้นสุดท้าย
เพื่อผูกสองฝั่งเข้าด้วยกัน — ขาดขั้นนี้ `api.activate_self()` จะหาโปรไฟล์ไม่เจอ (ค้นด้วย `user_id = auth.uid()`)
และคำเชิญจะเปิดใช้งานไม่ได้เลย

**ต้องยืนยันก่อน deploy:** `supabase/migrations/0011_api.sql` เวอร์ชันปัจจุบันเขียน dollar quote
ของฟังก์ชันนี้เป็น `AS $ … $;` (ควรเป็น `AS $$ … $$;`) ซึ่ง migration จะ apply ไม่ผ่าน
เจ้าของ migration ต้องแก้ก่อน มิฉะนั้น `invite-staff` จะล้มที่ขั้นสุดท้ายทุกครั้ง

### 6.5 `invite-staff` ไม่ส่งอีเมลเอง

ใช้ `auth.admin.generateLink({ type: 'invite' })` ซึ่ง **สร้างลิงก์แต่ไม่ส่งอีเมล** เพราะสัญญาต้องคืน `invite_url`
ให้หน้า 13 แสดง/คัดลอก · ถ้าต้องการให้ Supabase ส่งอีเมลด้วยต้องเปลี่ยนไปใช้ `inviteUserByEmail`
ซึ่งจะไม่คืนลิงก์กลับมา — เป็นการตัดสินใจเชิง UX ที่ต้องเลือกอย่างใดอย่างหนึ่ง

ถ้า `generateLink` ล้มเหลวหลัง `svc_prepare_invite` สำเร็จ จะเหลือแถว `INVITED` ค้าง (ย้อนกลับไม่ได้
เพราะไม่มี `api.svc_*` สำหรับยกเลิกคำเชิญ) · ฟังก์ชันจึงบอกผู้ใช้ตามจริงว่า "บัญชีถูกสร้างแล้ว อย่ากดเชิญซ้ำ"

### 6.6 เพดานลองเข้าสู่ระบบต่อ IP เป็น best-effort

นับในหน่วยความจำของ isolate · Supabase มีหลาย isolate ขนานกันและหมุนตลอด → เป็นเพดานต่อ isolate
CANONICAL ข้อ 9.2 ระบุไว้เองว่าเป็น best-effort บน Pro plan · ด่านจริงคือ
Password Verification Attempt hook ของ Team plan

### 6.7 `supabase/config.toml` ยังไม่มีในรีโปนี้

ยังไม่มีไฟล์ `supabase/config.toml` (อยู่นอกขอบเขตของงานนี้) · `supabase functions deploy` ทำงานได้โดยไม่มีไฟล์นี้
แต่ `supabase start` / `supabase functions serve` ในเครื่องต้องมี · เจ้าของ repo เป็นผู้เพิ่ม
พร้อมตั้งค่า `[auth]` ตามหัวข้อ 3

---

## 7. ต้องตรวจอะไรบ้างหลัง deploy (ทำบน staging ก่อน prod)

| # | ตรวจ | ผ่านเมื่อ |
|---|---|---|
| 1 | `staff-code-login` ด้วยบัญชีจริง | ได้ `session.access_token` · **ไม่มีอีเมลในคำตอบ** (`grep -i '@'` ไม่เจอ) |
| 2 | `staff-code-login` ด้วยรหัสผิด · รหัสพนักงานไม่มีจริง · บัญชี DISABLED | ได้ข้อความ **เดียวกันทุกกรณี** และเวลาตอบไม่ต่างกันอย่างสังเกตได้ |
| 3 | `password-reset` ด้วยอีเมลจริง · อีเมลมั่ว · ST มั่ว | `{ok:true}` ทุกครั้ง · อีเมลจริงเท่านั้นที่ได้รับลิงก์ · ลิงก์หมดอายุใน 1 ชม. |
| 4 | `invite-staff` จาก BRANCH_MANAGER JP1 → พนักงาน JP1 | `ok:true` · `staff_code` เป็น `ST-NNNN` · ลิงก์เปิดได้และพาไป `/set-password` |
| 4b | ผู้ถูกเชิญตั้งรหัสผ่านแล้วเรียก `api.activate_self()` | เปลี่ยนเป็น `ACTIVE` ได้จริง — พิสูจน์ว่า `api.svc_link_invited_user` ผูก `user_id` สำเร็จ (ดู 6.4) |
| 5 | `invite-staff` ข้ามสาขา (BM JP1 → JP2) | `ok:false` พร้อมเหตุผลไทยจาก `app.assign_role_denial` |
| 6 | `invite-staff` บทบาทสูงกว่าตัวเอง (BM → BUSINESS_ADMIN) | `ok:false` |
| 7 | เรียกทุกฟังก์ชันด้วย **anon key** แทน JWT ผู้ใช้ | `invite-staff` · `disable-staff` · `reset-mfa` ได้ HTTP 401 |
| 8 | ส่ง `actor_user_id` หรือ `actor_staff_id` ปลอมมาใน body | ถูกเพิกเฉย · `audit.audit_logs.actor` เป็น staff ของ JWT จริง |
| 9 | `disable-staff` แล้วให้บัญชีนั้นเรียก API ทันที | เข้าไม่ได้ทันที · `getUser()` ล้มเหลว · RLS ปฏิเสธ |
| 10 | `disable-staff` ซ้ำกับบัญชีเดิม | ไม่พัง · ไม่เกิด audit ซ้ำซ้อนจนอ่านไม่รู้เรื่อง |
| 11 | `disable-staff` บัญชีที่มี opportunity เปิดอยู่ในสาขาที่ไม่มี BRANCH_MANAGER | `ok:false` พร้อมข้อความ "โอนงานด้วย…" — **และบัญชีต้องยังไม่ถูก ban** |
| 12 | `reset-mfa` ด้วยเซสชัน aal1 | `ok:false` · ไม่มี factor ถูกลบ |
| 13 | `reset-mfa` โดย BUSINESS_ADMIN กับเป้าหมาย BUSINESS_ADMIN | `ok:false` ("ต้องให้ EXECUTIVE เป็นผู้ดำเนินการ") |
| 14 | `reset-mfa` สำเร็จ แล้วให้เป้าหมายล็อกอิน | ถูกบังคับลงทะเบียน TOTP ใหม่ · `audit.audit_logs` มี `MFA_RESET` |
| 15 | อ่าน log ของทุกฟังก์ชันใน Supabase Dashboard | **ไม่มี** service_role key · รหัสผ่าน · อีเมล · body ของผู้ใช้ |
| 16 | ข้อความ `ok:false` ทั้งหมดที่เกิดขึ้นระหว่างทดสอบ | เป็นภาษาไทย · ไม่มีชื่อตาราง/คอลัมน์/constraint หลุด |
