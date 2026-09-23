# Runbook ขั้นที่ 1 — ตั้ง Pilot Environment

> **เอกสารนี้คือ "พิมพ์อะไร ตามลำดับไหน"** · ส่วน "ต้องทำอะไร ใครทำ รู้ได้อย่างไรว่าผ่าน"
> อยู่ใน `pilot-deployment-checklist.md` §3 — ใช้คู่กัน ไม่ใช่แทนกัน
>
> ผู้ถือเอกสาร: **ผู้ดูแลระบบ (IT)** ร่วมกับ **ทีม Dev**
> สถานะ: **ร่าง — ยังไม่ได้รันจริงแม้แต่คำสั่งเดียว** ส่งให้เจ้าของโครงการ review ก่อน deploy (Direction 23 ก.ย. 2569)

---

## 0. อ่านก่อนพิมพ์คำสั่งแรก

**ทำ dev → staging → prod เสมอ** ห้ามข้ามไป prod ก่อน · คำสั่งทุกชุดในเอกสารนี้ทำซ้ำได้ทีละ environment

**กติกาที่ผิดแล้วเสียหายจริง**

| # | กติกา | ถ้าผิดจะเกิดอะไร |
|---|---|---|
| 1 | **ห้าม `supabase db reset` บน project ที่มีข้อมูล** | ล้างข้อมูลทั้งฐาน กู้ได้เฉพาะจาก PITR |
| 2 | **ห้ามรัน `supabase/seed.sql` บน staging/prod** | เขียนข้อมูลสมมติทับ และตั้ง `clock.as_of` ทำให้ทุกหน้าจอค้างอยู่ที่ 11 ก.ย. 2569 |
| 3 | **ห้าม commit ค่าลับ** — project ref · token · รหัสผ่าน `postgres` · ไฟล์ `pilot.json` | `npm run check:secrets` จะไม่ผ่าน · ถ้าเผลอ push แล้วให้ถือว่ารั่วและหมุนค่าใหม่ทั้งชุด |
| 4 | **ห้ามแก้ไฟล์ migration ที่ apply ไปแล้ว** | `supabase migration list` จะไม่ตรง และ deploy ครั้งถัดไปพัง (กติกา M2) |
| 5 | **ห้ามใช้ `service_role` key ในแอป Next.js** | key นี้ข้าม RLS ทั้งหมด · แอปใช้ publishable key เท่านั้น (`environment-setup.md` §5.4) |

**ต้องมีอยู่ในมือก่อนเริ่ม**

- Supabase CLI — ติดตั้งแล้วและรู้เวอร์ชัน (`supabase --version`)
- สิทธิ์ Owner/Admin ของ organization ที่จะสร้าง project
- คำตอบของ `environment-setup.md` §3.0 ทั้ง 7 ข้อ
- โดเมนของแอปในแต่ละ environment — **ยังรอ C-5** ดู §7 ว่าค้างตรงไหนได้บ้าง

---

## 1. ตรวจของในเครื่องก่อน (ยังไม่แตะ Supabase)

```bash
cd "<รากโครงการ>"
npm install
npm run check
```

ต้องได้ครบห้าส่วนและ exit code 0:

```
ผ่าน · ตรวจไฟล์ที่ git ติดตาม NNN ไฟล์ ไม่พบความลับ    ← check:secrets
ผ่านทั้งหมด                                              ← check:canonical
ผ่านทั้งหมด                                              ← check:prototype
(tsc + lint ไม่มี error)                                 ← check:web
ทดสอบผ่านทั้งหมด 20 ไฟล์                                 ← db:test
```

**ถ้าไม่ผ่าน หยุดที่นี่** อย่าเพิ่งไปยุ่งกับ Supabase — ของที่ผิดในเครื่องจะตามขึ้นไปทั้งหมด

---

## 2. ตรวจ `supabase/config.toml` ด้วย CLI (ขั้น V1–V3)

`supabase/config.toml` **เขียนไว้ล่วงหน้าแล้วและ commit อยู่ใน repo** โดยยังไม่เคยผ่าน CLI
สามขั้นนี้คือการให้ CLI เป็นผู้ตรวจไฟล์นั้นเอง — **ห้ามข้าม**

### V1 · ห้ามรัน `supabase init` ทับ

```bash
ls supabase/config.toml        # ต้องมีอยู่แล้ว
```

`supabase init` จะเขียนไฟล์ใหม่ทับของเดิม ทำให้ค่าที่ตั้งไว้ทั้งหมดหาย
ถ้า CLI บอกว่ายังไม่ init ให้ใช้ `supabase link` แทน (ขั้นที่ 3) ไม่ใช่ `init`

### V2 · เทียบกับเทมเพลตของ CLI รุ่นที่จะใช้จริง

```bash
mkdir -p /tmp/sbcheck && cd /tmp/sbcheck
supabase init
diff <(grep -oE '^\[[^]]+\]' supabase/config.toml | sort -u) \
     <(grep -oE '^\[[^]]+\]' "<รากโครงการ>/supabase/config.toml" | sort -u)
cd - && rm -rf /tmp/sbcheck
```

อ่านผล diff แล้วตัดสินทีละบรรทัด:

| สิ่งที่เห็น | แปลว่า | ทำอย่างไร |
|---|---|---|
| หัวข้อที่มีในของเราแต่ไม่มีในเทมเพลต | อาจเป็นคีย์ของ CLI รุ่นใหม่กว่า **หรือคีย์ที่เขียนผิด** | ตรวจกับเอกสาร CLI รุ่นนั้น · ถ้าไม่มีจริงให้ลบและย้ายไปตั้งในคอนโซลแทน พร้อมจดไว้ใน §8 |
| หัวข้อที่มีในเทมเพลตแต่ไม่มีในของเรา | เราตั้งใจไม่ใช้ (เช่น `[auth.sms]`) | ไม่ต้องทำอะไร |

### V3 · ให้ CLI ตรวจไฟล์จริง

```bash
supabase start        # ยกสแตกในเครื่อง — CLI จะ parse config.toml ทั้งไฟล์
supabase status
supabase stop
```

`supabase start` ล้มพร้อมข้อความชี้บรรทัด = ไฟล์มีคีย์ที่ CLI ไม่รู้จัก **แก้ให้ผ่านก่อนไปขั้นต่อไป**

> ขั้นนี้ยัง**ไม่**แตะ project จริง · ถ้าเครื่องรัน Docker ไม่ได้ ให้ข้าม V3 แล้วใช้
> `supabase config push --dry-run` ในขั้นที่ 4 เป็นด่านแทน และบันทึกว่าข้าม V3 ไว้ในใบงาน

---

## 3. ล็อกอินและผูก project

```bash
supabase login                                  # เปิดเบราว์เซอร์ให้ยืนยันตัวตน
supabase link --project-ref <ref ของ environment นั้น>
```

`ref` อยู่ที่ Dashboard → Project Settings → General

**ตรวจ**

```bash
supabase projects list        # บรรทัดของ project ที่ link ต้องมีเครื่องหมายกำกับ
cat supabase/.temp/project-ref   # ต้องตรงกับ environment ที่ตั้งใจ
```

> `supabase/.temp/` อยู่ใน `.gitignore` แล้ว · `npm run check:secrets` จะไม่ผ่านถ้าเผลอ track เข้ามา
> **สลับ environment = `supabase link` ใหม่ทุกครั้ง** แล้ว `cat` ไฟล์นี้ยืนยันก่อนรันคำสั่งที่เขียนข้อมูล

---

## 4. ส่งค่าตั้งขึ้น project

```bash
supabase config push --dry-run      # อ่านผลให้ครบก่อน
supabase config push
```

**ค่าที่ขึ้นไปคือส่วนที่ทำเครื่องหมาย `[PUSH]` ไว้ใน `config.toml`** — ที่เหลือมีผลเฉพาะสแตกในเครื่อง

ตัวแปรที่ `config.toml` อ้างด้วย `env(...)` ต้องมีอยู่ในสภาพแวดล้อมของเครื่องที่รันคำสั่งนี้:

```bash
export SUPABASE_AUTH_SITE_URL="https://<โดเมนของ environment นั้น>"
export SUPABASE_AUTH_REDIRECT_URL="https://<โดเมนของ environment นั้น>/auth/confirm"
```

> **ยังไม่มีโดเมนจริง (C-5)** — ใช้โดเมนชั่วคราวของ hosting ไปก่อนได้ แล้ว `config push` ซ้ำเมื่อได้โดเมนจริง
> แต่ **ห้ามข้าม** เพราะ Site URL ที่ผิดทำให้ลิงก์คำเชิญและลิงก์รีเซ็ตพาไปผิดที่

**ตรวจหลัง push** — เปิด Dashboard → Authentication → Providers/URL Configuration แล้วเทียบกับ
`deployment-backup-recovery.md` §2.1 ทีละแถว A1 · A2 · A6 · A8 · A9 · A10 · A11 · A12 · A13 · A14

ค่าที่ **`config.toml` ส่งขึ้นไม่ได้** ต้องตั้งในคอนโซลเอง:

| # | ค่า | ที่ตั้ง |
|---|---|---|
| A7 | Leaked password protection = on | Authentication → Policies |
| A15 | Custom SMTP | Project Settings → Auth → SMTP · **ช่วง Pilot ยังไม่ตั้งก็ได้** (ดู §6) |
| A16 | Email templates ภาษาไทย | Authentication → Email Templates |
| B6 | SSL enforcement = on | Project Settings → Database |
| B7 | Network restrictions | Project Settings → Database (staging/prod เท่านั้น) |
| B10 · B11 | Daily backup · PITR 7 วัน | Project Settings → Add-ons (prod เท่านั้น) |

---

## 5. รัน migration

```bash
supabase db push --dry-run     # ต้องเห็นไฟล์ 0001…0014 เรียงตามชื่อ
supabase db push
supabase migration list        # ประวัติใน project ต้องตรงกับไฟล์ใน repo
```

**ตรวจว่าขึ้นครบ** — เปิด SQL editor ของ project แล้วรันชุดคำสั่งใน
`environment-setup.md` §4.4 (คัดลอกไปวางได้ทั้งชุด) ครอบเวอร์ชัน Postgres · extension ·
owner ของ object · GRANT ของ `api.svc_*` · exposed schema · `max_rows` · column grant ของเบอร์

**สองข้อที่ต้องดูด้วยตาเองเสมอ**

```sql
-- 1) งานตามเวลา ต้องได้ 5 แถว และทุกแถว username = 'postgres'
SELECT jobname, schedule, command, username, active FROM cron.job ORDER BY jobname;

-- 2) api.svc_* ต้อง EXECUTE ได้เฉพาะ service_role (B13)
SELECT p.proname, coalesce(r.rolname, 'PUBLIC') AS grantee
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(p.proacl) a
LEFT JOIN pg_roles r ON r.oid = a.grantee
WHERE n.nspname = 'api' AND p.proname LIKE 'svc\_%' AND a.privilege_type = 'EXECUTE'
ORDER BY 1, 2;
```

ข้อ 2 ต้องคืนเฉพาะ `service_role` และ `postgres` · **ฟังก์ชัน `svc_*` ที่ `proacl IS NULL`
ถือว่าไม่ผ่าน** เพราะสิทธิ์ค่าเริ่มต้นของ Postgres คือ PUBLIC

---

## 6. Deploy Edge Functions และตั้ง secret

**ตั้ง secret ก่อน deploy** — ฟังก์ชันที่ขึ้นไปโดยไม่มี `APP_BASE_URL` จะล้มทันทีที่ถูกเรียก

```bash
supabase secrets set APP_BASE_URL="https://<โดเมนของ environment นั้น>"
supabase secrets list          # ยืนยันว่ามี · คำสั่งนี้ไม่แสดงค่า แสดงแต่ชื่อกับ digest
```

`SUPABASE_URL` · `SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` แพลตฟอร์มใส่ให้เอง **ไม่ต้องตั้ง**

```bash
supabase functions deploy invite-staff
supabase functions deploy disable-staff
supabase functions deploy reset-mfa
supabase functions deploy staff-code-login
supabase functions deploy password-reset
```

**ตรวจ `verify_jwt` ให้ตรงกับ `config.toml`** — ตั้งผิดแล้วเสียหายจริงทั้งสองทาง:

| ฟังก์ชัน | `verify_jwt` | ตั้งผิดแล้วเกิดอะไร |
|---|:--:|---|
| `invite-staff` · `disable-staff` · `reset-mfa` | **true** | ถ้าเป็น false ใครก็เรียกได้โดยไม่ต้องล็อกอิน |
| `staff-code-login` · `password-reset` | **false** | ถ้าเป็น true ผู้ใช้ที่ยังไม่ล็อกอินเรียกไม่ได้ = เข้าระบบด้วย `ST-NNNN` และ "ลืมรหัสผ่าน" ใช้ไม่ได้ |

จากนั้นไล่รายการตรวจหลัง deploy **ครบ 17 ข้อ** (1–16 และแถว 4b) ใน `supabase/functions/README.md` §7

---

## 7. สร้าง TypeScript type

```bash
supabase gen types typescript --project-id <ref> --schema api,crm,core,ref > web/src/types/database.ts
```

ไฟล์นี้ **commit เข้า repo** (ไม่ใช่ความลับ — เป็นแค่รูปร่างของ schema)

```bash
npm run web:typecheck     # ต้องผ่าน
```

---

## 8. ตั้งตัวแปรของแอป Next.js

ตั้งใน dashboard ของ hosting **ไม่ใช่ในไฟล์ที่ commit**

| ตัวแปร | ค่า |
|---|---|
| `JCRM_ENV` | `staging` หรือ `prod` ให้ตรง environment |
| `JCRM_DB_DRIVER` | **`supabase`** |
| `NEXT_PUBLIC_SUPABASE_URL` | URL ของ project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key **เท่านั้น** |

> `web/src/lib/env.ts` มีด่านกันไว้: ตั้ง `JCRM_DB_DRIVER=dev` บน `JCRM_ENV` ที่ไม่ใช่ `dev`
> หรือบน `NODE_ENV=production` แอปจะหยุดทำงานพร้อมข้อความชัดเจน แทนที่จะเงียบ ๆ
> ต่อฐานข้อมูลผิดตัว — **อย่าพยายามหลบด่านนี้**

---

## 9. รัน Full Smoke Test บน environment จริง

**ผลจาก local ใช้แทนไม่ได้** (Direction 23 ก.ย. 2569) · เกณฑ์คือ **PASS ทุกข้อ และ SKIP = 0**

สร้างไฟล์ตั้งค่า **นอก repo** เช่น `~/jcrm-pilot.json`:

```json
{
  "label": "JAUN CRM · Pilot",
  "web":    "https://<โดเมนของ Pilot>",
  "api":    "https://<ref>.supabase.co/rest/v1/rpc",
  "apikey": "<publishable key>",
  "accounts": {
    "ST-0001": { "cookie": "<cookie ของเซสชัน>", "jwt": "<access token>" },
    "ST-0002": { "cookie": "…", "jwt": "…" },
    "ST-0020": { "cookie": "…", "jwt": "…" },
    "ST-0045": { "cookie": "…", "jwt": "…" }
  }
}
```

**รหัสทั้งสี่คือบัญชีจริงของ Pilot ที่ทำหน้าที่ตรงกับบทบาทนั้น** ไม่ใช่รหัสในชุดข้อมูลตัวอย่าง —
จับคู่ให้ชัดก่อน (C-16) · ที่มาของ `cookie` และ `jwt`: เข้าสู่ระบบด้วยบัญชีนั้นจริง แล้วคัดลอกจาก
DevTools → Application → Cookies และ → Local Storage ของเบราว์เซอร์

```bash
npm run smoke -- --env ~/jcrm-pilot.json
```

**ทันทีที่รันเสร็จ**

```bash
rm ~/jcrm-pilot.json
```

แล้ว**ออกจากระบบทั้งสี่บัญชี** เพื่อให้เซสชันที่คัดลอกมาใช้ไม่ได้อีก

> ไฟล์นี้ = สวมสิทธิ์พนักงานจริงได้ทันที · ห้ามวางใน repo ห้ามส่งผ่านแชต ห้ามแนบในตั๋วงาน
> `.gitignore` ครอบ `pilot.json` · `*.smoke.json` ไว้แล้ว และ `npm run check:secrets` เป็นด่านสุดท้าย

---

## 10. เมื่อทำครบแล้ว

กลับไปติ๊ก `pilot-deployment-checklist.md` §3 (1.1–1.19) ให้ครบ แล้วไปขั้นที่ 2 (Master Data)

**สิ่งที่ยังค้างหลังจบขั้นที่ 1 และไม่บล็อก**

| เรื่อง | สถานะ |
|---|---|
| Custom SMTP (A15) | ช่วง Pilot ใช้วิธีคัดลอกลิงก์คำเชิญ (CANONICAL ข้อ 20.20) |
| Auth hooks A3 · A4 · A5 | ปิดไว้พร้อมเหตุผลใน `config.toml` — ต้องเปิดก่อน rollout หลายสาขา |
| โดเมนจริง (C-5) | `config push` ซ้ำได้เมื่อได้โดเมน |
| SSO (Q5) | ยังไม่เปิด · `allowed_sso_domains` ว่าง = หน้าเข้าสู่ระบบซ่อนปุ่ม SSO เอง |

---

## 11. รายการที่ต้องจดไว้ระหว่างทำ

จดลงใบงานจริง ไม่ใช่จำเอา — ใช้เป็นหลักฐานของ Go/No-Go

| # | สิ่งที่ต้องจด |
|---|---|
| 1 | เวอร์ชัน Supabase CLI ที่ใช้ |
| 2 | ผลของ V2 — คีย์ใดใน `config.toml` ที่ CLI รุ่นนั้นไม่รู้จัก และย้ายไปตั้งที่ไหนแทน |
| 3 | ข้ามขั้น V3 หรือไม่ เพราะอะไร |
| 4 | `ref` ของแต่ละ environment (จดในที่เก็บความลับ **ไม่ใช่ในตั๋วงาน**) |
| 5 | วันเวลาที่รัน `db push` แต่ละ environment และผลของ `migration list` |
| 6 | ผลการตรวจ 17 ข้อของ Edge Functions |
| 7 | ผล `npm run smoke -- --env` แบบเต็ม (PASS/SKIP กี่ข้อ) |
