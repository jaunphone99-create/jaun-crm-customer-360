# Environment Setup — JAUN CRM · Customer 360

> **ผู้อ่าน:** ทีม Dev (ตั้งเครื่องตัวเอง) และทีม IT/ผู้ดูแลระบบ (ตั้ง dev · staging · prod)
> **สถานะ:** Phase 1 · งานชิ้นแรกหลัง baseline `phase1-plan-approved` (CANONICAL ข้อ 20.9)
> **กติกา:** ทุกค่าในเอกสารนี้มาจาก `docs/00-brief/CANONICAL.md` · `supabase/migrations/*.sql` · `docs/02-architecture/system-architecture.md` · `docs/08-delivery/deployment-backup-recovery.md`
> ค่าที่ยังไม่ถูกตัดสินเขียนว่า **[รอยืนยัน]** พร้อมหมายเลขคำถาม Q — **ห้ามเดาค่าเอง และห้ามเปลี่ยนสถานะเป็น Final Decision เอง** (CANONICAL ข้อ 17 · 20.5)

**สิ่งที่เอกสารนี้ตอบ**

| คำถาม | อยู่ที่ |
|---|---|
| เพิ่งเข้าทีม จะเปิดแอปขึ้นในเครื่องตัวเองยังไง | §1 |
| dev · staging · prod ต่างกันตรงไหน ใครเข้าได้ | §2 |
| จะตั้ง Supabase project จริง ต้องกดอะไรในคอนโซลบ้าง | §3 |
| migration รันลำดับไหน ตรวจยังไงว่าขึ้นครบ | §4 |
| ตัวแปรสภาพแวดล้อมมีกี่ตัว ตัวไหนลับ | §5 |
| ก่อนเปิด pilot ที่ JAUNPHONE 1 ต้องเช็กอะไร | §6 |
| ตอนนี้ยังทำอะไรไม่ได้ เพราะอะไร | §7 |

**สิ่งที่เอกสารนี้ไม่ตอบ** (มีเอกสารของตัวเองแล้ว · ดูสารบัญ §8) — CI/CD pipeline รายขั้น · runbook backup/restore/DR · แผนนำเข้าข้อมูลเดิม · สเปกหน้าจอ · สเปก API

---

## 1. เครื่องนักพัฒนา (local)

### 1.1 ข้อกำหนดของเครื่อง

| รายการ | ค่า | ตรวจด้วย | หมายเหตุ |
|---|---|---|---|
| Node.js | **22 ขึ้นไป** (`engines.node: ">=22"` ทั้ง `package.json` ราก และ `web/package.json`) | `node -v` | ถ้าต่ำกว่านี้ `npm install` จะเตือนและ Next.js 16 รันไม่ได้ |
| npm | มากับ Node 22 | `npm -v` | ใช้ `npm ci` เมื่อมี lockfile ครบ (CI ใช้แบบนี้) |
| git | รุ่นใดก็ได้ | `git --version` | – |
| พื้นที่ว่าง | ≈ 1.5 GB | – | `node_modules` สองชุด (ราก + `web/`) · `supabase/seed.sql` 14 MB · `.dev-db/` |
| **Docker** | **ไม่ต้องมี** | – | ฐานข้อมูลในเครื่องเป็น PGlite (PostgreSQL 17 ใน WASM) |
| **Supabase CLI** | **ไม่ต้องมีสำหรับงาน local** | – | ต้องมีเฉพาะตอน deploy migration/Edge Function ขึ้น Supabase จริง (§3 · §4) |
| PostgreSQL ในเครื่อง | **ไม่ต้องติดตั้ง** | – | PGlite แทนทั้งหมด |

> ทั้งโครงการออกแบบให้ "มี Node อย่างเดียวก็ทำงานได้" โดยตั้งใจ — เครื่องของทีมส่วนใหญ่ยังไม่มี Docker และยังไม่มี Supabase project จริง (§7)

### 1.2 ตั้งเครื่องตั้งแต่ clone จนเปิดหน้าเว็บได้

ทำเรียงตามลำดับ ทุกคำสั่งรันจาก **รากโครงการ** เว้นแต่ระบุไว้เป็นอย่างอื่น

**ขั้นที่ 1 — clone และเข้าโฟลเดอร์**

```bash
git clone <URL ของ repository>   # [รอยืนยัน] URL ของ repository กลาง — ยังไม่มีในเอกสารใด
cd "JAUN CRM หน้าร้าน"
```

> ชื่อโฟลเดอร์มีภาษาไทยและเว้นวรรค — ใส่เครื่องหมายคำพูดครอบ path ทุกครั้งใน shell

**ขั้นที่ 2 — ติดตั้ง dependency (สองชุด)**

```bash
npm install                 # ราก: @electric-sql/pglite (ฐานข้อมูลทดสอบ/พัฒนา)
npm install --prefix web    # แอป Next.js: next · react · @supabase/* · zod · typescript
```

> โครงการ **ไม่ได้ใช้ npm workspaces** — `npm install` ที่รากไม่ลง dependency ของ `web/` ให้ ต้องสั่งสองครั้ง
> ห้ามเพิ่ม/ลบ dependency หรือแก้ `package.json` โดยไม่ผ่าน review (`docs/08-delivery/deployment-backup-recovery.md` §3.3 M10)

**ขั้นที่ 3 — ตั้งไฟล์ตัวแปรสภาพแวดล้อมของแอป**

```bash
cp web/.env.example web/.env.local
```

ค่าเริ่มต้นในไฟล์ตัวอย่างใช้งานได้ทันทีสำหรับโหมดพัฒนา ไม่ต้องแก้อะไร:

```dotenv
JCRM_ENV=dev
JCRM_DB_DRIVER=dev
JCRM_DEV_API_URL=http://127.0.0.1:54329
```

`web/.env.local` อยู่ใน `.gitignore` — **ห้าม commit ค่าจริง** (รายละเอียดตัวแปรทุกตัวอยู่ใน §5)

**ขั้นที่ 4 — เปิดฐานข้อมูลในเครื่อง (หน้าต่าง terminal ที่ 1 · เปิดค้างไว้)**

```bash
npm run dev:db
```

รอบแรกจะใช้เวลาสักครู่เพราะต้อง (1) สร้างฐานข้อมูลใหม่ใน `.dev-db/` (2) รัน `supabase/migrations/0001…0013` (ข้าม `*_cron.sql`) (3) สร้างและโหลด `supabase/seed.sql` ถ้ายังไม่มี
เมื่อพร้อม จะฟังอยู่ที่ `http://127.0.0.1:54329`

ตรวจว่าขึ้นจริง:

```bash
curl -s http://127.0.0.1:54329/health
# {"ok":true,"postgres":170005,"staff":14,"dataDir":"…/.dev-db"}
```

**ขั้นที่ 5 — เปิดแอป (หน้าต่าง terminal ที่ 2)**

```bash
npm run dev:web
```

`predev` จะรัน `web/scripts/sync-design.mjs` คัดลอก CSS จาก `prototype/assets/` มาไว้ที่ `web/src/app/generated/` ให้อัตโนมัติก่อนเสมอ
เปิดเบราว์เซอร์ที่ **http://localhost:3000**

**ขั้นที่ 6 — ตรวจว่าทุกอย่างถูกต้อง (หน้าต่างที่ 3)**

```bash
npm run check                                   # CANONICAL + prototype + migration + seed + ชุดทดสอบ SQL
./web/node_modules/.bin/tsc --noEmit --project web/tsconfig.json   # TypeScript ของแอป
```

หรือใช้คำสั่งลัดที่มีอยู่แล้ว: `npm run web:typecheck` (รัน `sync-design.mjs` ให้ก่อน แล้วค่อย `tsc --noEmit`)

### 1.3 `tools/db/dev-api.mjs` คืออะไร ทำไมต้องมี

| หัวข้อ | คำอธิบาย |
|---|---|
| มันคืออะไร | เซิร์ฟเวอร์ HTTP เล็ก ๆ ที่ยก **PostgreSQL 17 (PGlite · WASM)** ขึ้นมาในหน่วยความจำ/ดิสก์ของเครื่อง แล้ว **พูดภาษา PostgREST เท่าที่แอปใช้** — `GET/POST/PATCH /rest/v1/:relation` และ `POST /rest/v1/rpc/:fn` |
| ทำไมต้องมี | ยังไม่มี Supabase project จริง (§7) และเครื่องทีมส่วนใหญ่ไม่มี Docker · แต่ Core Flow ต้องพิสูจน์ได้ว่าทำงานกับ **RLS และ RPC ตัวจริง** ไม่ใช่ข้อมูลปลอมในหน้าจอ |
| ผลต่อโค้ดแอป | ไม่มีเลย — แอปเรียก `supabase-js` ทางเดียวกับของจริงทุกบรรทัด ต่างกันแค่ปลายทางและวิธีบอกตัวตน ซึ่งถูกขังไว้ใน `web/src/lib/db/index.ts` ไฟล์เดียว (Identity Contract IC-1 · IC-5 · CANONICAL ข้อ 20.2) |
| schema มาจากไหน | หัวข้อ `Accept-Profile` / `Content-Profile` ที่ `supabase-js` ส่งให้เมื่อเรียก `.schema('crm')` / `.schema('api')` |
| ตัวตนมาจากไหน | หัวข้อ `Authorization: Bearer dev:<staff_code>:<aal>` เช่น `dev:ST-0045:aal2` |
| ข้อมูลเก็บที่ไหน | `.dev-db/` ที่รากโครงการ (อยู่ใน `.gitignore`) |

**ข้อจำกัดที่ต้องรู้**

- **ไม่ตรวจรหัสผ่าน** — ผู้เรียกบอกได้เองว่าตัวเองเป็นใคร
- **ยังไม่รองรับ `select` แบบฝังตาราง (embed)** — ให้ query แยกแล้วต่อกันในโค้ด
- **ข้าม `supabase/migrations/*_cron.sql`** — `pg_cron` ไม่มีใน PGlite (งานตามเวลาทดสอบได้เฉพาะบน Supabase จริง · §4)

**ห้ามใช้บน staging/production — เด็ดขาด**

เหตุผล: ตัวนี้ไม่มีการยืนยันตัวตนใด ๆ ใครยิง HTTP ถึงก็สวมเป็นพนักงานคนไหนก็ได้ทันที
ระบบบังคับไว้ **3 ชั้น** ไม่ใช่แค่เขียนเตือน:

| ชั้น | ที่อยู่ | พฤติกรรม |
|---|---|---|
| 1 | `web/src/lib/env.ts` | `JCRM_DB_DRIVER=dev` + `JCRM_ENV≠dev` → โยน error ตั้งแต่บูต |
| 2 | `web/src/lib/env.ts` | `JCRM_DB_DRIVER=dev` + `NODE_ENV=production` → โยน error ตั้งแต่บูต |
| 3 | `tools/db/dev-api.mjs` | `NODE_ENV=production` → `exit 2` ไม่ยอมเปิดเซิร์ฟเวอร์ |

บน staging/prod `JCRM_DB_DRIVER` ต้องเป็น `supabase` เสมอ (ค่าเริ่มต้นของ `env.ts` เมื่อ `JCRM_ENV≠dev` ก็คือ `supabase` อยู่แล้ว)

### 1.4 คำสั่งที่มีจริงใน `package.json`

**ราก** (`package.json`)

| คำสั่ง | ทำอะไร | ใช้เมื่อไร |
|---|---|---|
| `npm install` | ติดตั้ง `@electric-sql/pglite` 0.4.1 | ครั้งแรก · หลัง `git pull` ที่แก้ lockfile |
| `npm run dev:db` | เปิด dev-api ที่พอร์ต 54329 (ข้อมูลเดิมใน `.dev-db/`) | ทุกครั้งที่จะพัฒนา |
| `npm run dev:db:fresh` | ล้าง `.dev-db/` แล้วสร้างใหม่จาก migration + seed | หลังเพิ่ม migration ใหม่ · เมื่อข้อมูลในเครื่องเพี้ยน |
| `npm run dev:web` | `npm --prefix web run dev` → `sync-design.mjs` แล้ว `next dev` | ทุกครั้งที่จะพัฒนา |
| `npm run check` | `check:canonical` → `check:prototype` → `db:test` | ก่อน commit ทุกครั้ง |
| `npm run db:test` | `tools/db/run.mjs --seed --test --quiet` — migration + seed + ทุกไฟล์ใน `supabase/tests/` | แก้ SQL หรือ migration |
| `npm run db:test:verbose` | เหมือนบน แต่พิมพ์ NOTICE ทั้งหมด | ดีบักชุดทดสอบ |
| `npm run db:migrate` | `tools/db/run.mjs` — รัน migration อย่างเดียว | ตรวจว่า migration ยังรันผ่าน |
| `npm run db:seed` | สร้าง `supabase/seed.sql` ใหม่ (deterministic · 14 MB · ไม่อยู่ใน git) | เมื่อ seed หาย |
| `npm run db:dictionary` | สร้าง `docs/03-data/data-dictionary.md` จากฐานข้อมูลจริง | หลังเปลี่ยนโครงตาราง |
| `npm run check:canonical` | ตรวจว่าเอกสาร/SQL/prototype ใช้ค่าตรง CANONICAL | – |
| `npm run check:prototype` | ตรวจ prototype | – |
| `npm run web:build` | `next build` | ตรวจก่อน deploy |
| `npm run web:typecheck` | `sync-design.mjs` + `tsc --noEmit` | ก่อน commit ทุกครั้ง |

**`web/`** (`web/package.json`) — เรียกผ่าน `npm --prefix web run <ชื่อ>`

| คำสั่ง | ทำอะไร |
|---|---|
| `dev` | `predev` (`sync-design.mjs`) → `next dev` |
| `build` | `prebuild` (`sync-design.mjs`) → `next build` |
| `start` | `next start` (ใช้บน hosting) |
| `typecheck` | `sync-design.mjs` → `tsc --noEmit` |
| `sync:design` | คัดลอก CSS จาก `prototype/assets/` เข้ามาที่ `web/src/app/generated/` |

**คำสั่งเสริมที่ไม่อยู่ใน `package.json`**

```bash
node tools/serve-prototype.mjs            # เปิด prototype ทั้ง 19 หน้าที่ http://localhost:8788
node tools/db/dev-api.mjs --port 5555     # เปลี่ยนพอร์ต dev-api
node tools/db/run.mjs --seed --test rls_  # รันเฉพาะไฟล์ทดสอบที่ขึ้นต้นด้วย rls_
node tools/db/run.mjs --seed --sql "select count(*) from crm.customers"   # ดีบัก SQL หนึ่งคำสั่ง
```

### 1.5 บัญชีทดลองในโหมดพัฒนา

โหมดพัฒนาไม่มีรหัสผ่าน — เลือกว่าจะเป็นใครจากรายชื่อใน seed (`GET http://127.0.0.1:54329/dev/staff` ดูทั้งหมด 14 คน)

| staff_code | ชื่อ | บทบาท | สาขา | ใช้ทดสอบอะไร |
|---|---|---|---|---|
| `ST-0045` | คุณขวัญ | `STAFF` | JP1 | Core Flow หน้างาน (รับลูกค้า · Quick Capture) |
| `ST-0020` | คุณเจ | `BRANCH_MANAGER` | JP1 | สิทธิ์ระดับสาขา · เชิญพนักงาน |
| `ST-0002` | คุณแพร | `BUSINESS_ADMIN` | ทั้งองค์กร | Master Data · PDPA · ตั้งค่าระบบ |

ตรวจสัญญาจริงจาก terminal ได้เลย:

```bash
# อ่านตาราง (schema มาจาก accept-profile)
curl -s "http://127.0.0.1:54329/rest/v1/visits?select=visit_no,status&limit=3" \
  -H 'accept-profile: crm' \
  -H 'authorization: Bearer dev:ST-0045:aal2'

# เรียก RPC ใน schema api
curl -s -X POST "http://127.0.0.1:54329/rest/v1/rpc/get_my_access" \
  -H 'content-type: application/json' \
  -H 'content-profile: api' \
  -H 'authorization: Bearer dev:ST-0045:aal2' -d '{}'
```

> **ถ้าใช้ฐานทดลองร่วมกับคนอื่น:** อ่านได้เต็มที่ · **หลีกเลี่ยงการเรียก RPC ที่เขียนข้อมูล** (`quick_capture` · `open_visit` · `close_visit` …) เพราะจะกระทบตัวเลขของคนอื่น
> อยากทดลองเขียนให้ชัวร์ ให้เปิดฐานของตัวเองด้วย `npm run dev:db:fresh` หรือตั้ง `JCRM_DEV_DB_DIR` ไปโฟลเดอร์อื่น

### 1.6 ปัญหาที่พบบ่อย

| อาการ | สาเหตุ | วิธีแก้ |
|---|---|---|
| `ไม่พบ @electric-sql/pglite` | ยังไม่ได้ `npm install` ที่ราก | `npm install` (หรือตั้ง `PGLITE_DIR` ชี้ไปโฟลเดอร์ pglite ที่มีอยู่) |
| `next: command not found` | ยังไม่ได้ติดตั้ง dependency ของ `web/` | `npm install --prefix web` |
| `ไม่ได้ตั้งค่าตัวแปรสภาพแวดล้อม NEXT_PUBLIC_SUPABASE_URL` | `JCRM_DB_DRIVER=supabase` แต่ยังไม่มีค่าของ Supabase | กลับไปใช้ `JCRM_DB_DRIVER=dev` หรือเติมสองค่าใน §5 |
| `JCRM_DB_DRIVER=dev ใช้ได้เฉพาะ JCRM_ENV=dev เท่านั้น` | ตั้ง `JCRM_ENV=staging/prod` ค้างไว้ | แก้ `web/.env.local` ให้ `JCRM_ENV=dev` |
| `token ของโหมดพัฒนาไม่ถูกต้อง` (401) | หัวข้อ `Authorization` ผิดรูป | ต้องเป็น `Bearer dev:ST-NNNN:aal1` หรือ `:aal2` |
| หน้าเว็บไม่มีสไตล์ | `web/src/app/generated/` ว่าง (อยู่ใน `.gitignore`) | `npm --prefix web run sync:design` |
| ตัวเลขในหน้าจอไม่ตรงข้อ 13 ของ CANONICAL | `.dev-db/` เก่าหรือถูกเขียนทับ | `npm run dev:db:fresh` |
| แก้ migration แล้วไม่เห็นผล | dev-api ใช้ฐานเดิมใน `.dev-db/` | `npm run dev:db:fresh` |

---

## 2. สาม environment: dev · staging · prod

เป้าหมาย: **แยก Supabase project 3 project · แยก secret ทั้งหมด · `app.settings['env']` ต้องตรงกับ project เสมอ** (CANONICAL ข้อ 9.7)

### 2.1 ตารางเปรียบเทียบ

| หัวข้อ | local (เครื่อง Dev) | dev | staging | prod |
|---|---|---|---|---|
| ฐานข้อมูล | PGlite 0.4.1 (PG 17.5) ใน `.dev-db/` | Supabase project แยก | Supabase project แยก | Supabase project แยก |
| region | – | `ap-southeast-1` (Singapore) **[รอยืนยัน Q6 · CANONICAL ข้อ 1.4]** | `ap-southeast-1` **[รอยืนยัน Q6]** | `ap-southeast-1` **[รอยืนยัน Q6]** |
| ตัวต่อของแอป | `JCRM_DB_DRIVER=dev` | `supabase` | `supabase` | `supabase` |
| ข้อมูล | seed สังเคราะห์ | **seed เท่านั้น** | seed หรือสำเนา prod ที่ทำนิรนามแล้ว (`deployment-backup-recovery.md` §8) | ข้อมูลจริง (นำเข้าตาม `data-migration-plan.md`) |
| อีเมลผู้ใช้ | `@example.com` | `@example.com` | `@example.com` | อีเมลจริงของพนักงาน |
| ใครเข้าถึงได้ | เจ้าของเครื่อง | ทีมพัฒนา | ทีมพัฒนา + ผู้ทดสอบ UAT | พนักงาน JAUN เท่านั้น · ทีมพัฒนา **ไม่มีสิทธิ์ prod โดยค่าเริ่มต้น** |
| Supabase org Owner/Admin | – | ทีมพัฒนา | ทีมพัฒนา | **≤ 2 คนที่ระบุชื่อ** · ใช้แบบ break-glass **[รอยืนยัน Q25]** |
| PITR | – | ไม่ต้อง | ไม่ต้อง | **เปิด 7 วัน** |
| logical dump รายสัปดาห์ | – | ไม่ต้อง | ไม่ต้อง | **ต้องมี** (เข้ารหัสฝั่งต้นทาง) |
| Edge Functions | – | ครบตาม CANONICAL ข้อ 9.8 (ยกเว้น `integration-*`) | ครบ | ครบ |
| `pg_cron` | – (PGlite ข้าม `*_cron.sql`) | เปิด · 5 job | เปิด · 5 job | เปิด · 5 job |
| bucket Storage | – | `exports` (private) | `exports` | `exports` |
| อีเมลออก | – | กล่องทดสอบเท่านั้น | กล่องทดสอบเท่านั้น | ผู้ส่งอีเมลจริง **[รอยืนยัน · CANONICAL ข้อ 1.4]** |
| Next.js hosting | `next dev` | สภาพแวดล้อมแยก **[รอยืนยันผู้ให้บริการ]** | แยก | แยก |
| URL | `http://localhost:3000` | **[รอยืนยัน]** | **[รอยืนยัน]** | **[รอยืนยัน]** |

### 2.2 นาฬิกา `app.settings['clock']` — จุดที่ต่างกันมากที่สุด

สูตรเดียวทั้งระบบ (CANONICAL ข้อ 1.2 · `0001_foundation.sql`):

```
app.clock() = coalesce(app.settings['clock'].as_of, now())   เมื่อ app.settings['env'] <> 'prod'
app.clock() = now()                                          เมื่อ app.settings['env'] = 'prod'
```

| environment | `app.settings['env']` | `app.settings['clock']` | ผลที่ได้ |
|---|---|---|---|
| local / test (PGlite) | `"dev"` | `{"as_of":"2026-09-11T10:24:00+07:00"}` | ตัวเลขตรงข้อ 13 ของ CANONICAL ทุกครั้ง — ทดสอบซ้ำได้ผลเดิม |
| dev | `"dev"` | ค่าเดียวกับ seed | เหมือน local |
| staging (โหลด seed) | `"staging"` | ค่าเดียวกับ seed | ตัวเลขตรงข้อ 13 |
| staging (ทดลองเวลาจริง) | `"staging"` | `{"as_of": null}` | `app.clock() = now()` |
| **prod** | `"prod"` | `{"as_of": null}` **บังคับ** | `app.clock() = now()` **เสมอ** แม้มีคนไปตั้ง `as_of` ก็ไม่มีผล |

**สิ่งที่ `app.clock()` ควบคุม:** KPI · คุณภาพข้อมูล · การแจ้งเตือน · การจัดกลุ่ม "วันนี้" · ป้าย "ลูกค้าใหม่" · งานตามเวลา
**สิ่งที่ห้ามใช้ `app.clock()`:** การตัดสินสิทธิ์ — ใช้ `now()` เสมอ (เช่น แก้ interaction ภายใน 24 ชม. · `valid_from/valid_to` · อายุคำเชิญ)

> `0001_foundation.sql` ปฏิบัติตามข้อ 1.2 แล้ว: ไม่พบแถว `env` = ถือเป็น prod · CHECK `settings_clock_value_chk` บังคับให้ `as_of` เป็น `null` หรือสตริง ISO ที่มี offset
> **prod ที่มี `env <> 'prod'` หรือ `clock.as_of` ไม่เป็น null = เหตุวิกฤต** (การแจ้งเตือน AL-07 · `deployment-backup-recovery.md` §9)

### 2.3 กติกาของ environment ที่ห้ามละเมิด

1. **ห้ามนำข้อมูล prod ไปใส่ dev/staging ตรง ๆ** — ทางเดียวคือขั้นตอน restore → ทำนิรนาม → dump ใน `deployment-backup-recovery.md` §8 (CANONICAL ข้อ 9.7 · A35 · B20)
2. secret ของแต่ละ environment **แยกกันทั้งหมด** · ห้ามใช้ key ของ prod ใน preview deployment
3. preview deployment ของ Next.js ชี้ไป dev หรือ staging เท่านั้น
4. `app.settings['env']` ต้องตรงกับ project เสมอ
5. ถ้า prod ใช้ **Team plan** (เพื่อ Password Verification Attempt hook) staging ต้องอยู่บนแพ็กเกจที่มีฟีเจอร์เดียวกัน มิฉะนั้นทดสอบ hook ไม่ได้ · การแยก organization ของ prod ออกจาก dev/staging **[รอยืนยัน Q6 · Q25]**

---

## 3. ตั้ง Supabase จริง — สิ่งที่ต้องทำในคอนโซล

> ส่วนนี้คือ **งานที่ทำด้วยโค้ดใน repo ไม่ได้** ต้องกดในคอนโซลหรือสั่งผ่าน Supabase CLI ด้วยบัญชีที่มีสิทธิ์
> รายละเอียดเต็มพร้อมวิธี "ตรวจ" รายบรรทัดอยู่ที่ `docs/08-delivery/deployment-backup-recovery.md` §2 — ที่นี่คือฉบับลงมือทำเรียงตามลำดับ

### 3.0 ตัดสินใจให้ได้ก่อนสร้าง project

| # | เรื่อง | ค่าที่ใช้ไปก่อน | สถานะ |
|---|---|---|---|
| 1 | แพ็กเกจ | **Pro + PITR** (ถ้าต้องการ Password Verification Attempt hook ต้องเป็น **Team**) | **[รอยืนยัน Q6]** |
| 2 | region | `ap-southeast-1` (Singapore) | **[รอยืนยัน Q6 · ข้อ 1.4]** |
| 3 | ผู้ถือสิทธิ์ Owner/Admin ของ organization prod | ระบุชื่อ **≤ 2 คน** | **[รอยืนยัน Q25]** |
| 4 | แยก organization ของ prod ออกจาก dev/staging หรือไม่ | แยก | **[รอยืนยัน Q6 · Q25]** |
| 5 | องค์กรใช้ Google Workspace หรือ Microsoft 365 (ผลต่อ SSO) | รองรับทั้งสองแบบเฉพาะโดเมนที่อนุญาต | **[รอยืนยัน Q5]** |
| 6 | ผู้ให้บริการ hosting ของ Next.js · โดเมน · ผู้ส่งอีเมล | – | **[รอยืนยัน · ข้อ 1.4]** |
| 7 | ใช้ `pg_cron` + `pg_net` หรือ scheduler ภายนอก | `pg_cron` + `pg_net` | **[รอยืนยัน · ADR-12 · CANONICAL ข้อ 1]** |

สร้าง **3 project แยก** ชื่อชัดเจน (เช่น `jaun-crm-dev` · `jaun-crm-staging` · `jaun-crm-prod`) · ตั้งรหัสผ่าน `postgres` แบบสุ่มยาว และเก็บใน secret manager ของ CI และ runner ของ dump เท่านั้น

### 3.1 Authentication (CANONICAL ข้อ 9.2 · architecture §3.2)

| # | การตั้งค่า | ค่า | ทำที่ไหน | วิธีตรวจ |
|---|---|---|---|---|
| A1 | Allow new users to sign up | **off** (CLI: `[auth] enable_signup = false`) | Dashboard → Authentication → Providers | เรียก `POST /auth/v1/signup` ต้องถูกปฏิเสธ |
| A2 | Anonymous sign-ins · Phone auth | off | เดียวกัน | เปิดหน้า Auth providers |
| A3 | **Before User Created hook** | เปิด → ฟังก์ชันใน schema `app` ที่อนุญาตเฉพาะอีเมลที่มีแถว `core.staff_invitations` | Authentication → Hooks | สร้างผู้ใช้ด้วยอีเมลที่ไม่ได้เชิญ (รวม SSO ครั้งแรก) ต้องล้มเหลว |
| A4 | **Custom Access Token hook** | เปิด · ตรวจ `hd` ∈ `app.settings['allowed_sso_domains']` · SSO เฉพาะบัญชี `ACTIVE` · **ห้ามเพิ่ม claim บทบาท/สิทธิ์** | Authentication → Hooks | decode JWT แล้วต้องไม่มีบทบาท/สิทธิ์ |
| A5 | Password Verification Attempt hook | เปิดเมื่อใช้ **Team plan** · Pro plan ให้ปิดและนับใน Server Action/`staff-code-login` แบบ best-effort · ต่อ IP ตาม `security.login_ip_per_15min` (20) | Authentication → Hooks | กรอกรหัสผิดเกินเกณฑ์ต้องถูกหน่วง/ล็อก · ล็อกครั้งที่ 4 ของวันต้องแจ้ง BUSINESS_ADMIN |
| A6 | Minimum password length | **12** | Auth → Policies | ตั้งรหัส 11 ตัวต้องล้มเหลว |
| A7 | Leaked password protection | **on** (Pro+) | Auth → Policies | ตั้งรหัสที่รั่วแล้วต้องล้มเหลว |
| A8 | Secure password change | **on** | Auth → Policies | เปลี่ยนรหัสต้องยืนยันตัวตนซ้ำ |
| A9 | MFA TOTP | enabled (enroll + verify) — แอปเรียก enroll/challenge/verify ผ่าน Server Action เท่านั้น | Auth → MFA | บัญชี SUPERVISOR ที่ `aal1` ต้องได้ผล "ปฏิเสธ" ตาม CANONICAL ข้อ 13.13 |
| A10 | JWT expiry (access token) | **900 วินาที** | Auth → Sessions | `exp − iat = 900` |
| A11 | Refresh token rotation · reuse interval | on · **10 วินาที** | Auth → Sessions | ใช้ refresh token เก่าหลัง 10 วินาทีต้องล้มเหลว |
| A12 | Session inactivity timeout · time-box | **2 ชม.** · **12 ชม.** (Pro+) | Auth → Sessions | session ที่ไม่ใช้ 2 ชม. refresh ไม่ได้ |
| A13 | Email OTP expiration (อายุลิงก์อีเมล · ค่าเดียวทุกประเภท) | **3600 วินาที** · คำเชิญมีอายุ 24 ชม. ตาม `core.staff_profiles.invite_expires_at` | Auth → Email | ลิงก์อายุเกิน 3600 วินาทีใช้ไม่ได้ |
| A14 | Site URL · Redirect URLs allowlist | URL ของ environment นั้นเท่านั้น (รวม `/auth/confirm`) **[รอยืนยัน URL]** | Auth → URL Configuration | redirect ไปโดเมนอื่นต้องถูกปฏิเสธ |
| A15 | Custom SMTP | ผู้ส่งอีเมลตาม CANONICAL ข้อ 1.4 **[รอยืนยัน]** · dev/staging ส่งกล่องทดสอบ | Auth → SMTP Settings | ส่งคำเชิญทดสอบ |
| A16 | Email templates (ภาษาไทย) | คำเชิญ · รีเซ็ตรหัส · เปลี่ยนอีเมล · reauthentication · **ห้ามมีข้อมูลลูกค้า** · ไม่ใช้ magic link | Auth → Email Templates | อ่านทุกฉบับ |
| A17 | SSO Google | เปิดเมื่อองค์กรใช้ Workspace · `allowed_sso_domains` = โดเมนบริษัท | Auth → Providers | **[รอยืนยัน Q5]** |
| A18 | SSO Microsoft | Azure แบบ **single-tenant** ขององค์กร | Auth → Providers | **[รอยืนยัน Q5]** |
| A19 | ถ้าไม่มี Workspace/M365 | ซ่อนปุ่ม SSO (`allowed_sso_domains = []`) | – | **[รอยืนยัน Q5]** |
| A20 | Auth rate limits (อีเมล/OTP/token) | ต้องไม่ต่ำจนคำเชิญช่วงเปิดสาขาถูกบล็อก | Auth → Rate Limits | **[รอยืนยัน]** |

> **Phase 1 ใช้ทางเลือก C** — CRM ถือบัญชีผู้ใช้เองชั่วคราว (invite-only) แล้วย้ายไป SSO/OIDC ภายหลัง (CANONICAL ข้อ 20.2)
> แม้จะใช้ Supabase Auth ในทางเทคนิค **Frontend และ RLS ต้องอ้างตัวตนผ่าน `app.current_staff_id()` / `api.get_my_access()` เท่านั้น** · ห้ามผูก Business Logic กับ Supabase Auth โดยตรง (IC-1 … IC-5)

### 3.2 Data API (PostgREST · architecture §3.3)

| # | การตั้งค่า | ค่า | วิธีตรวจ |
|---|---|---|---|
| D1 | **Exposed schemas** | **`api, crm, core, ref`** เท่านั้น (ไม่รวม `public` · ไม่รวม `app` `audit` `analytics` `restricted`) | เรียกด้วย `Accept-Profile: app` / `audit` / `analytics` ต้องได้ข้อผิดพลาด schema |
| D2 | **Max rows** | **200** **[รอยืนยัน]** | `GET …?limit=500` ต้องคืน ≤ 200 แถว |
| D3 | GRANT ของ role `anon` | **ไม่มีใน schema ของระบบเลย** (CANONICAL ข้อ 1.1) | เรียกด้วย anon key ต้องได้ 401/403 |
| D4 | GraphQL (`pg_graphql`) | **ไม่เปิดใช้** (ข้อเสนอผู้เขียน — ไม่ได้ใช้และเป็นช่องทางเข้าที่สอง) | `/graphql/v1` ต้องไม่ตอบข้อมูล |

ตั้งที่ Dashboard → Project Settings → API (Exposed schemas · Max rows)

### 3.3 Database

| # | การตั้งค่า | ค่า | dev | stg | prod | วิธีตรวจ |
|---|---|---|:--:|:--:|:--:|---|
| B1 | PostgreSQL major version | **17** (ห้ามใช้ไวยากรณ์ของ PG 18) | ✓ | ✓ | ✓ | `SELECT current_setting('server_version_num')` ขึ้นต้น `17` |
| B2 | Extensions | `pg_trgm` **WITH SCHEMA `extensions`** · `pg_cron` + `pg_net` **[รอยืนยัน ADR-12]** · ไม่ใช้ `citext` `pgcrypto` | ✓ | ✓ | ✓ | `SELECT extname, extnamespace::regnamespace FROM pg_extension` |
| B3 | `app.settings` | ครบทุกคีย์ของ CANONICAL ข้อ 11.2 | ✓ | ✓ | ✓ | `SELECT key, value, editable_by FROM app.settings ORDER BY key` |
| B4 | role `audit_retention` | มาจาก `0008_audit.sql` · NOLOGIN · ใช้เฉพาะงาน retention | ✓ | ✓ | ✓ | `SELECT rolname FROM pg_roles WHERE rolname='audit_retention'` |
| B5 | owner ของทุก object | `postgres` ทั้งหมด | ✓ | ✓ | ✓ | ชุดทดสอบ T4 |
| B6 | SSL enforcement | on | ✓ | ✓ | ✓ | ต่อแบบไม่ใช้ SSL ต้องล้มเหลว |
| B7 | Network restrictions (direct DB) | อนุญาตเฉพาะ IP ของ CI runner และเครื่องทำ dump · Edge Functions **ไม่ต่อฐานข้อมูลตรง** | – | ✓ | ✓ | ต่อจาก IP อื่นต้องล้มเหลว |
| B8 | รหัสผ่าน `postgres` | สุ่มยาว · อยู่ใน secret manager ของ CI และ runner ของ dump เท่านั้น · หมุนเมื่อมีผู้ถือออกจากทีม | ✓ | ✓ | ✓ | – |
| B9 | Compute size | **[รอยืนยัน Q6]** · ประเมินจาก `system-architecture.md` §10 | ✓ | ✓ | ✓ | – |
| B10 | Daily backup | ตามแพ็กเกจ | – | – | ✓ | หน้า Backups แสดงรายการล่าสุด |
| B11 | **PITR** | **7 วัน** | – | – | ✓ | หน้า Backups แสดง PITR เปิด |
| B12 | pg_cron jobs | 5 job ตาม CANONICAL ข้อ 9.6 · รันในฐานะ `postgres` · สร้างจาก `*_cron.sql` เท่านั้น | ✓ | ✓ | ✓ | ดู §4.4 |
| B13 | GRANT ของ `api.svc_*` | EXECUTE **เฉพาะ `service_role`** · ไม่มีให้ `authenticated`/`anon`/PUBLIC | ✓ | ✓ | ✓ | ดู §4.4 |
| B14 | ตัวเรียก `cron-export-cleanup` | **[รอยืนยัน · CANONICAL ข้อ 9.6]** · ถ้าใช้ pg_cron + pg_net ต้องเก็บ secret ของตัวเรียกให้ Edge Function ตรวจ | ✓ | ✓ | ✓ | ไฟล์ `EXPIRED` ถูกลบภายในรอบถัดไป |

**ค่า `app.settings` ต่อ environment** — `0001_foundation.sql` ใส่ `env = "dev"` มาให้ · project ใหม่ต้องตั้งให้ตรง environment ในสคริปต์ bootstrap · หลังจากนั้นแก้ผ่าน `api.update_setting` ตาม `editable_by` เท่านั้น **ห้ามแก้ผ่าน SQL editor** (M10)

| key | ค่าเริ่มต้น | `editable_by` | dev | staging | prod |
|---|---|---|---|---|---|
| `env` | `"dev"` | `settings.system` | `"dev"` | `"staging"` | `"prod"` |
| `clock` | `{"as_of": null}` | `settings.system` | ค่า seed | seed หรือ null | **null บังคับ** |
| `allowed_sso_domains` | `[]` | `settings.system` | ตามทดสอบ | ตามทดสอบ | โดเมนบริษัท **[รอยืนยัน Q5]** |
| `business_hours` | `{"default":["10:00","21:00"]}` | `settings.business` | ค่าเริ่มต้น | ค่าเริ่มต้น | ตามสาขา **[รอยืนยัน Q4]** |
| `sla.*` (5 คีย์) | 15 · 15 · 30 · 15 · 60 | `settings.business` | ค่าเริ่มต้น | ค่าเริ่มต้น | ตาม BA **[รอยืนยัน Q12]** |
| `sla.opportunity_stale_days` · `escalation.overdue_hours` | `[7,14]` · `[24,48]` | `settings.business` | ค่าเริ่มต้น | ค่าเริ่มต้น | ตาม BA |
| `dq.*` (3 คีย์) | 14 · 3 · 7 | `settings.business` | ค่าเริ่มต้น | ค่าเริ่มต้น | ตาม BA |
| `badge.new_customer_days` · `quotation.valid_days` | 30 · 7 | `settings.business` | ค่าเริ่มต้น | ค่าเริ่มต้น | ตาม BA |
| `notify.duplicate_digest_time` · `notify.data_missing_time` | `"18:00"` · `"09:00"` | `settings.business` | ค่าเริ่มต้น | ค่าเริ่มต้น | ตาม BA |
| `export.limits` · `export.link_ttl_hours` · `export.max_downloads` | ตามข้อ 8.2 · 24 · 3 | `settings.business` | ค่าเริ่มต้น | ค่าเริ่มต้น | **[รอยืนยัน Q7 · Q23]** |
| `security.*` (5 คีย์) | 30 · 60 · 20 · 10 · 100 | `settings.business` | ค่าเริ่มต้น | ค่าเริ่มต้น | ตาม BA |
| `session.shared_counter_idle_min` | 10 | `settings.business` | ค่าเริ่มต้น | ค่าเริ่มต้น | ตาม BA |
| `pdpa.current_notice_version` | `"PN-2026-01"` | `settings.business` | ค่าเริ่มต้น | ค่าเริ่มต้น | ฉบับที่ DPO อนุมัติ **[รอยืนยัน Q9]** |
| `security.login_ip_per_15min` | 20 | `settings.business` | ค่าเริ่มต้น | ค่าเริ่มต้น | ตาม BA |
| `dsr.anonymize_per_day` | 20 | `settings.business` | ค่าเริ่มต้น | ค่าเริ่มต้น | **[รอยืนยัน Q8]** |

> **ค้างอยู่:** สามคีย์ที่เพิ่มใน CANONICAL v2.2 (`pdpa.current_notice_version` · `security.login_ip_per_15min` · `dsr.anonymize_per_day`) **ยังไม่อยู่ใน `INSERT INTO app.settings` ของ `0001_foundation.sql`** → ต้องเพิ่มด้วย migration ไฟล์ใหม่ก่อน deploy staging (`deployment-backup-recovery.md` §2.3.1)

### 3.4 Storage

| # | การตั้งค่า | ค่า | วิธีตรวจ |
|---|---|---|---|
| S1 | bucket | **`exports`** · **private** · ไม่มี bucket public · V1 ไม่มีการอัปโหลดไฟล์ของลูกค้า | `SELECT id, public FROM storage.buckets` → มี `exports` แถวเดียว `public = false` |
| S2 | policy ของ `storage.objects` | **ไม่มี policy ใดให้ `authenticated`/`anon` สำหรับ bucket `exports`** — เข้าถึงได้เฉพาะ `service_role` | `SELECT policyname, roles, qual FROM pg_policies WHERE schemaname='storage' AND tablename='objects'` ต้องไม่มีแถวที่อ้าง `exports` · เรียก Storage API ด้วย JWT ผู้ใช้ (list/download/createSignedUrl) ต้องล้มเหลว |
| S3 | signed URL | อายุ **60 วินาที** · ออกหลัง `api.record_export_download` สำเร็จด้วย JWT ของผู้ขอเท่านั้น | URL ใช้ไม่ได้หลัง 60 วินาที · ดาวน์โหลดครั้งที่ 4 ถูกปฏิเสธ |
| S4 | ขนาดไฟล์สูงสุด · MIME ที่อนุญาต | ต้องรองรับ 5,000 แถว (ข้อ 8.2) และแพ็กเกจ DSR JSON/CSV (ข้อ 10.4) | **[รอยืนยัน]** |
| S5 | อายุไฟล์ | ≤ 24 ชม. · **ไม่แนบอีเมล** | ไม่มี object ใน `exports` อายุเกิน 24 ชม. (เผื่อหนึ่งรอบของ `cron-export-cleanup`) |

สร้างที่ Dashboard → Storage → New bucket · ตั้ง private · **อย่าสร้าง policy ใด ๆ**

### 3.5 Edge Functions และ secret (CANONICAL ข้อ 9.8 · architecture §3.5)

**กติกาที่ผิดแล้วเสียหายจริง:** ทุกฟังก์ชันแตะฐานข้อมูลผ่าน **PostgREST เท่านั้น** · **ไม่มี connection string ฐานข้อมูลใน secret ของ Edge Function**

| ฟังก์ชัน | verify JWT | RPC ที่เรียก | secret ที่ต้องมี | dev | stg | prod |
|---|:--:|---|---|:--:|:--:|:--:|
| `invite-staff` | ✓ | `api.can_assign_role` (JWT ผู้เรียก) · `api.svc_prepare_invite` | service_role (อัตโนมัติ) | ✓ | ✓ | ✓ |
| `disable-staff` | ✓ | `api.disable_staff` (JWT ผู้เรียก) · `api.svc_finalize_disable` | service_role | ✓ | ✓ | ✓ |
| `reset-mfa` | ✓ (ต้อง `aal2`) | `api.svc_reset_mfa_authorize` | service_role · SMTP ถ้าส่งอีเมลเอง | ✓ | ✓ | ✓ |
| `staff-code-login` | ✗ (ยังไม่ล็อกอิน) · จำกัดต่อ IP 20 ครั้ง/15 นาที | `api.svc_resolve_staff_code` | service_role | ✓ | ✓ | ✓ |
| `password-reset` | ✗ · ตอบข้อความเดียวกันเสมอ | `api.svc_resolve_staff_code` | service_role | ✓ | ✓ | ✓ |
| `generate-export` | ✓ | `api.svc_build_export_dataset` · `api.svc_mark_export_generated` · `api.record_export_download` | service_role | ✓ | ✓ | ✓ (Phase 3) |
| `cron-export-cleanup` | ✗ · ตรวจ secret ของตัวเรียก **[รอยืนยัน B14]** | `api.svc_expired_export_files` | service_role · secret ของตัวเรียก | ✓ | ✓ | ✓ |
| `integration-*` | ✗ · ตรวจลายเซ็นผู้ส่ง | `api.svc_*` ของ Phase 4 (ชื่อ **[รอยืนยัน]**) | secret ของแต่ละระบบ | Phase 4 | Phase 4 | Phase 4 |

```bash
# ตั้ง secret (ผู้ถือสิทธิ์ของ environment นั้นเป็นผู้รัน · ห้ามพิมพ์ค่า secret ใน log ของ CI)
supabase secrets set --project-ref <ref> SOME_SECRET=...

# deploy ทีละฟังก์ชัน
supabase functions deploy invite-staff --project-ref <ref>
```

> **สถานะปัจจุบัน: ยังไม่ได้เขียน Edge Function สักตัว** — ไม่มีโฟลเดอร์ `supabase/functions/` ใน repo (§7)

### 3.6 Next.js hosting

| # | การตั้งค่า | ค่า |
|---|---|---|
| H1 | env ที่อนุญาต | `JCRM_ENV` · `JCRM_DB_DRIVER` · `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (§5) |
| H2 | **env ที่ห้าม** | service_role key · connection string ฐานข้อมูล · secret ของ Edge Functions |
| H3 | Security headers | CSP แบบ strict (nonce) · `Cache-Control: no-store` · HSTS · `X-Content-Type-Options: nosniff` · `Referrer-Policy` — ส่วนหนึ่งตั้งไว้แล้วใน `web/next.config.ts` |
| H4 | Cookie | HttpOnly · Secure · SameSite=Lax · ทุกการเรียก Supabase ที่ใช้เซสชัน (รวม MFA enroll/challenge/verify) อยู่ฝั่ง server · ตรวจ: bundle ฝั่ง client ต้องไม่สร้าง Supabase client ที่ถือเซสชัน |
| H5 | Service worker | ไม่ cache route ที่ต้องล็อกอิน · ไม่แตะ `/rest/v1` `/rpc` `/auth` · logout ล้าง storage ยกเว้น `device_id` และ `login_id` ที่ "จดจำ" |
| H6 | โดเมน · TLS | **[รอยืนยัน]** |
| H7 | region ของ server runtime | ใกล้ `ap-southeast-1` **[รอยืนยัน · ข้อ 1.4]** |
| H8 | log ของ hosting | ไม่เก็บ body/ข้อมูลลูกค้า · ระยะเก็บ **[รอยืนยัน]** |
| H9 | Web Push VAPID keys | แยกต่อ environment (Phase 2) |

### 3.7 การเข้าถึงแพลตฟอร์ม · PITR · backup

| # | การตั้งค่า | ค่า |
|---|---|---|
| P1 | สมาชิก Supabase organization ของ prod | Owner/Admin **≤ 2 คนที่ระบุชื่อ** · ทีมพัฒนาไม่มีสิทธิ์ prod โดยค่าเริ่มต้น **[รอยืนยัน Q25]** |
| P2 | MFA ของบัญชี Supabase Dashboard และ hosting | **บังคับทุกบัญชี** ที่เข้าถึง staging/prod |
| P3 | CI token (`SUPABASE_ACCESS_TOKEN`) | แยกต่อ environment · สิทธิ์ต่ำสุดที่ deploy ได้ · รอบการหมุน **[รอยืนยัน]** |
| P4 | storage ของ logical dump | versioning + object lock **90 วัน** · **ผู้ดูแล storage ≠ ผู้ถือกุญแจเข้ารหัส** · ทบทวนรายชื่อผู้เข้าถึงทุกไตรมาส |
| P5 | PITR (prod) | **7 วัน** · เปิดที่ Dashboard → Database → Backups |
| P6 | logical dump รายสัปดาห์ (prod) | เข้ารหัสฝั่งต้นทาง (age/GPG) → storage ที่ object lock 90 วัน · ขั้นตอนเต็มใน `deployment-backup-recovery.md` §5.2 |
| P7 | Restore test | **ทุกเดือน** restore ไป project ทดสอบ · ลบ project ภายใน 24 ชม. · บันทึกผล (`deployment-backup-recovery.md` §6) |
| P8 | เป้าหมาย | **RPO ≤ 5 นาที · RTO ≤ 4 ชม.** |

---

## 4. ลำดับการรัน migration และวิธีตรวจว่าขึ้นครบ

### 4.1 ไฟล์ทั้งหมดและลำดับ

ไฟล์ใน `supabase/migrations/` รันเรียงตาม **ชื่อไฟล์** เสมอ (ทั้ง PGlite และ `supabase db push`)

| # | ไฟล์ | เนื้อหา | PGlite/local | Supabase จริง |
|---|---|---|:--:|:--:|
| 1 | `0001_foundation.sql` | schema `app` · `app.settings` · `app.clock()` · `app.running_numbers` · helper พื้นฐาน | ✓ | ✓ |
| 2 | `0002_core.sql` | `core.*` — องค์กร · สาขา · ทีม · พนักงาน · บทบาท · สิทธิ์ · อุปกรณ์ | ✓ | ✓ |
| 3 | `0003_ref.sql` | `ref.*` — lookup 16 ตาราง | ✓ | ✓ |
| 4 | `0004_crm_customer.sql` | `crm.customers` · contacts · addresses · branches · consents · tags · merges · DSR | ✓ | ✓ |
| 5 | `0005_crm_activity.sql` | `crm.visits` · `interactions` · `transaction_refs` | ✓ | ✓ |
| 6 | `0006_crm_sales.sql` | `crm.leads` · `opportunities` · `quotations` · `campaigns` (โครงคงไว้ · หน้าจอเลื่อนเป็น Phase 2) | ✓ | ✓ |
| 7 | `0007_crm_work.sql` | `crm.tasks` · `task_comments` · `ownership_changes` · `notifications` | ✓ | ✓ |
| 8 | `0008_audit.sql` | `audit.*` · role `audit_retention` · trigger `log_row_change` · `deny_change` | ✓ | ✓ |
| 9 | `0009_business_triggers.sql` | trigger กติกาธุรกิจ · `app.enforce_row_transition` | ✓ | ✓ |
| 10 | `0010_security.sql` | helper ข้อ 9.3 · **RLS ทุกตาราง** · column grant | ✓ | ✓ |
| 11 | `0011_api.sql` | RPC ทั้งหมดใน schema `api` (รวม `api.svc_*`) | ✓ | ✓ |
| 12 | `0012_analytics.sql` | view ใน schema `analytics` · `api.get_kpis` · `api.get_report` | ✓ | ✓ |
| 13 | `0013_jobs.sql` | ฟังก์ชัน `app.job_*` 5 ตัว | ✓ | ✓ |
| 14 | `0014_schedule_cron.sql` | **`cron.schedule` เท่านั้น** — ตั้งเวลาให้ `app.job_*` | **ข้าม** | ✓ |

ลำดับตาม dependency: enum/ตาราง → view `analytics.*` → helper/RLS → trigger → RPC (CANONICAL ข้อ 14.6)

**กติกาที่ห้ามละเมิด** (`deployment-backup-recovery.md` §3.3)

| # | กติกา |
|---|---|
| M2 | **ห้ามแก้ไฟล์ที่ apply ไปแล้ว** บน staging/prod — แก้ด้วยไฟล์ใหม่เท่านั้น (forward-only) |
| M4 | เพิ่มค่า ENUM = ไฟล์เดี่ยวที่มีแค่ `ALTER TYPE … ADD VALUE` |
| M5 | ไวยากรณ์ **PG 17** เท่านั้น และต้องรันบน PGlite ได้ ยกเว้น `*_cron.sql` |
| M6 | `*_cron.sql` มีเฉพาะ `cron.schedule`/`cron.unschedule` · unschedule ชื่อเดิมก่อนเสมอ (รันซ้ำได้) · apply โดย role `postgres` |
| M7 | **expand/contract** — release เดียวทำได้แค่ "เพิ่ม" · การลบ/เปลี่ยนชื่อ/บังคับ NOT NULL ทำใน release ถัดไป |
| M10 | แก้ข้อมูลใน prod ทำเป็นไฟล์ migration/สคริปต์ที่ผ่าน review · **ห้ามแก้ผ่าน SQL editor** |
| M11 | `core.role_permissions` เปลี่ยนผ่าน migration เท่านั้น |
| M12 | **`supabase/seed.sql` ห้ามรันบน prod** — seed ตั้ง `clock.as_of` และมีข้อมูลสมมติ |

### 4.2 รันบนเครื่องตัวเอง (PGlite)

```bash
npm run db:migrate            # migration อย่างเดียว
npm run db:test               # migration + seed + ชุดทดสอบทั้งหมด (ต้องผ่าน 100%)
npm run db:test:verbose       # แบบเห็น NOTICE ทุกบรรทัด
node tools/db/run.mjs --seed --test rls_    # เฉพาะชุดทดสอบ RLS
```

`tools/db/run.mjs` ออกด้วย exit code 1 ถ้ามีข้อใดล้มเหลว · แต่ละไฟล์ทดสอบถูกครอบ `BEGIN … ROLLBACK` จึงไม่ทิ้งร่องรอย

### 4.3 รันขึ้น Supabase จริง

```bash
# ครั้งแรกต่อเครื่อง: ล็อกอิน CLI
supabase login

# ผูกกับ project (ทำทีละ environment · ref อยู่ใน Dashboard → Project Settings → General)
supabase link --project-ref <ref ของ environment นั้น>

# ดูก่อนว่าจะรันอะไรบ้าง — ทำทุกครั้ง
supabase db push --dry-run

# รันจริง
supabase db push

# เทียบว่าประวัติใน project ตรงกับไฟล์ใน repo
supabase migration list
```

**ลำดับ deploy ต่อ release: ฐานข้อมูล → Edge Functions → Next.js** (ปลอดภัยเพราะ migration เป็นแบบ expand · M7)

```bash
supabase functions deploy <ชื่อฟังก์ชัน> --project-ref <ref>   # ทีละฟังก์ชันตาม CANONICAL ข้อ 9.8
# แล้วค่อย deploy Next.js
```

สร้าง TypeScript type จาก schema จริงแล้วเทียบกับไฟล์ที่ commit:

```bash
supabase gen types typescript --project-id <ref> --schema api,crm,core,ref
```

### 4.4 ตรวจว่าขึ้นครบ — ชุดคำสั่งที่คัดลอกไปวางได้

รันใน SQL editor ของ project นั้น (หรือผ่าน `psql` จาก IP ที่อนุญาตตาม B7)

```sql
-- 1) เวอร์ชัน Postgres ต้องขึ้นต้น 17
SELECT current_setting('server_version_num');

-- 2) migration ขึ้นครบทั้ง 14 ไฟล์
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;

-- 3) schema ครบ 9 ตัว: api crm core ref app analytics audit restricted extensions
SELECT nspname FROM pg_namespace
WHERE nspname IN ('api','crm','core','ref','app','analytics','audit','restricted','extensions')
ORDER BY nspname;

-- 4) extension: pg_trgm ต้องอยู่ใน schema extensions
SELECT extname, extnamespace::regnamespace AS schema FROM pg_extension ORDER BY extname;

-- 5) RLS เปิดครบทุกตารางใน schema ของระบบ — ต้องคืน 0 แถว
SELECT n.nspname, c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname IN ('crm','core','ref','audit','app')
  AND NOT c.relrowsecurity
ORDER BY 1, 2;

-- 6) owner ของทุก object ต้องเป็น postgres — ต้องคืน 0 แถว
SELECT n.nspname, c.relname, pg_get_userbyid(c.relowner) AS owner
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('api','crm','core','ref','app','analytics','audit','restricted')
  AND pg_get_userbyid(c.relowner) <> 'postgres';

-- 7) api.svc_* ต้อง EXECUTE ได้เฉพาะ service_role (B13)
--    ผลลัพธ์ต้องมีเฉพาะ service_role และ postgres
SELECT p.proname, coalesce(r.rolname, 'PUBLIC') AS grantee
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(p.proacl) a
LEFT JOIN pg_roles r ON r.oid = a.grantee
WHERE n.nspname = 'api' AND p.proname LIKE 'svc\_%' AND a.privilege_type = 'EXECUTE'
ORDER BY 1, 2;

-- 7b) svc_* ที่ proacl IS NULL (สิทธิ์ค่าเริ่มต้น = PUBLIC) ถือว่าไม่ผ่าน — ต้องคืน 0 แถว
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'api' AND p.proname LIKE 'svc\_%' AND p.proacl IS NULL;

-- 8) role audit_retention มีจริง
SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname = 'audit_retention';

-- 9) app.settings ครบทุกคีย์ของ CANONICAL ข้อ 11.2
SELECT key, value, editable_by FROM app.settings ORDER BY key;

-- 10) นาฬิกาและ environment ตรงกัน (prod: env='prod' และ clock.as_of IS NULL)
SELECT (SELECT value FROM app.settings WHERE key = 'env')   AS env,
       (SELECT value FROM app.settings WHERE key = 'clock') AS clock,
       app.clock() AS clock_now, now() AS wall_now;

-- 11) pg_cron: 5 job ตาม CANONICAL ข้อ 9.6 · username ต้องเป็น postgres (B12)
SELECT jobname, schedule, command, username, active FROM cron.job ORDER BY jobname;
```

**ตารางเวลาที่ `cron.job` ต้องตรงทุกบรรทัด** — ค่าด้านล่างคัดจาก `supabase/migrations/0014_schedule_cron.sql` ตัวจริง (เวลา cron เป็น UTC · Asia/Bangkok = UTC+7)

| `jobname` | เวลา (Asia/Bangkok) | `schedule` (UTC) | `command` | `username` |
|---|---|---|---|---|
| `job_close_stale_visits` | 00:05 ทุกวัน | `5 17 * * *` | `SELECT app.job_close_stale_visits(app.clock());` | `postgres` |
| `job_expire_quotations` | 00:10 ทุกวัน | `10 17 * * *` | `SELECT app.job_expire_quotations(app.clock());` | `postgres` |
| `job_retention` | 02:00 ทุกวัน | `0 19 * * *` | `SELECT app.job_retention(app.clock());` | `postgres` |
| `job_expire_exports` | ทุกชั่วโมง นาทีที่ 15 | `15 * * * *` | `SELECT app.job_expire_exports(app.clock());` | `postgres` |
| `job_notifications` | ทุก 5 นาที | `*/5 * * * *` | `SELECT app.job_notifications(app.clock());` | `postgres` |

> **หมายเหตุความไม่ตรงกันของเอกสาร:** `deployment-backup-recovery.md` §2.3 B12 และ `system-architecture.md` §3.7 อ้างชื่อ job ว่า `job_*` และคำสั่งว่า `SELECT app.job_…(app.clock())`
> **แก้แล้ว 23 ก.ย. 2569:** `0014_schedule_cron.sql` เคยตั้งชื่อ job เป็น `jaun_*` ซึ่งไม่ตรงกับ CANONICAL ข้อ 9.6 — เปลี่ยนเป็น `job_*` และใช้คำสั่ง `SELECT app.job_…(app.clock());` ให้ตรงกับเกณฑ์ go-live B12 แล้ว · ใช้ค่าจากตารางนี้ตอนตรวจ

**ตรวจจากฝั่ง HTTP** (ทดแทนชุดทดสอบ T7 บน staging — ดู `system-architecture.md` §12)

```bash
SUPA_URL="https://<ref>.supabase.co"
ANON="<publishable key>"

# schema ที่ไม่เปิด API ต้องเรียกไม่ได้
curl -s -o /dev/null -w '%{http_code}\n' "$SUPA_URL/rest/v1/settings?select=key" \
  -H "apikey: $ANON" -H "accept-profile: app"           # ต้องไม่ใช่ 200

# ค่าเต็มของเบอร์ต้องถูกปฏิเสธ (column grant)
curl -s -o /dev/null -w '%{http_code}\n' "$SUPA_URL/rest/v1/customer_contacts?select=value_raw" \
  -H "apikey: $ANON" -H "accept-profile: crm" -H "authorization: Bearer <JWT ของผู้ใช้>"

# max_rows = 200
curl -s "$SUPA_URL/rest/v1/customers?select=customer_no&limit=500" \
  -H "apikey: $ANON" -H "accept-profile: crm" -H "authorization: Bearer <JWT>" | jq 'length'
```

---

## 5. ตารางตัวแปรสภาพแวดล้อมทุกตัว

> แหล่งจริง: `web/.env.example` · `web/src/lib/env.ts` · `web/src/proxy.ts` · `tools/db/dev-api.mjs` · `tools/db/run.mjs`
> **ห้ามคิดชื่อตัวแปรใหม่** — แอปอ่านตัวแปรทุกตัวผ่าน `web/src/lib/env.ts` ที่เดียว และล้มตั้งแต่บูตพร้อมบอกชื่อตัวแปรถ้าค่าที่จำเป็นหาย

### 5.1 ตัวแปรของแอป Next.js

| ชื่อจริง | ใช้ที่ไหน | บังคับมีเมื่อ | ลับ? | ค่าตัวอย่าง | หมายเหตุ |
|---|---|---|:--:|---|---|
| `JCRM_ENV` | `web/src/lib/env.ts` · `web/src/proxy.ts` | ทุก environment (ไม่ตั้ง = `dev`) | ไม่ | `dev` · `staging` · `prod` | ค่าอื่นนอกสามตัวนี้ = โยน error ตั้งแต่บูต · ควบคุมป้ายเตือนมุมจอ (`ENV_BADGE`) |
| `JCRM_DB_DRIVER` | `web/src/lib/env.ts` · `web/src/proxy.ts` | ทุก environment (ค่าเริ่มต้น: `dev` เมื่อ `JCRM_ENV=dev`, ไม่งั้น `supabase`) | ไม่ | `dev` · `supabase` | `dev` + `JCRM_ENV≠dev` = error · `dev` + `NODE_ENV=production` = error |
| `JCRM_DEV_API_URL` | `web/src/lib/env.ts` (`DEV_API_URL`) | เมื่อ `JCRM_DB_DRIVER=dev` (ไม่ตั้ง = ค่าเริ่มต้น) | ไม่ | `http://127.0.0.1:54329` | ถูกตั้งเป็น `null` อัตโนมัติเมื่อใช้ตัวต่อ `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | `web/src/lib/env.ts` (`supabaseConfig.url`) · `web/src/proxy.ts` | **บังคับ** เมื่อ `JCRM_DB_DRIVER=supabase` | ไม่ (ส่งถึงเบราว์เซอร์อยู่แล้ว) | `https://abcdefghijkl.supabase.co` | Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `web/src/lib/env.ts` (`supabaseConfig.publishableKey`) · `web/src/proxy.ts` | **บังคับ** เมื่อ `JCRM_DB_DRIVER=supabase` | ไม่ (เป็น key สาธารณะ · สิทธิ์จริงตัดสินที่ RLS) | `sb_publishable_xxxxxxxxxxxx` | คือ publishable/anon key · **ไม่ใช่** service_role |
| `NODE_ENV` | Next.js · `web/src/lib/session.ts` · `tools/db/dev-api.mjs` | ตั้งโดย Next.js/Node เอง | ไม่ | `development` · `production` | `production` → cookie ของเซสชันโหมดพัฒนาเป็น `Secure` · dev-api ปฏิเสธไม่ยอมเปิด |

> **แก้แล้ว 23 ก.ย. 2569:** `deployment-backup-recovery.md` §2.6 H1 เคยเขียนชื่อเป็น `NEXT_PUBLIC_SUPABASE_ANON_KEY` — ปรับให้ตรงกับโค้ด (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ใน `web/src/lib/env.ts`) แล้ว

### 5.2 ตัวแปรของเครื่องมือในเครื่อง (ไม่ใช้บน staging/prod)

| ชื่อจริง | ใช้ที่ไหน | ลับ? | ค่าเริ่มต้น | ทำอะไร |
|---|---|:--:|---|---|
| `JCRM_DEV_API_PORT` | `tools/db/dev-api.mjs` | ไม่ | `54329` | เปลี่ยนพอร์ตของ dev-api (หรือใช้ `--port`) |
| `JCRM_DEV_DB_DIR` | `tools/db/dev-api.mjs` | ไม่ | `.dev-db` | ย้ายที่เก็บฐานข้อมูลในเครื่อง — ใช้เมื่ออยากมีฐานส่วนตัวแยกจากทีม |
| `PGLITE_DIR` | `tools/db/run.mjs` · `dev-api.mjs` · `gen-data-dictionary.mjs` | ไม่ | – | path ไปยัง `@electric-sql/pglite` สำรอง เมื่อ `npm install` ที่รากใช้ไม่ได้ |
| `PORT` | `tools/serve-prototype.mjs` | ไม่ | `8788` | พอร์ตของเซิร์ฟเวอร์ดู prototype |

### 5.3 secret ที่อยู่นอกแอป (ห้ามเข้าใกล้ env ของ Next.js)

| ชื่อ/ประเภท | อยู่ที่ไหน | ลับ? | ใครถือ |
|---|---|:--:|---|
| `service_role` key | **secret ของ Edge Function เท่านั้น** (Supabase ใส่ให้อัตโนมัติ) | **ลับสูงสุด** | ไม่มีมนุษย์ถือ |
| connection string ของฐานข้อมูล / รหัสผ่าน `postgres` | secret manager ของ CI (รัน migration) และ runner ของ logical dump | **ลับสูงสุด** | ผู้ดูแล CI · ผู้ทำ dump (B8) |
| `SUPABASE_ACCESS_TOKEN` | secret ของ CI · แยกต่อ environment · สิทธิ์ต่ำสุดที่ deploy ได้ | **ลับ** | ผู้ดูแล CI (P3) |
| secret ของตัวเรียก `cron-export-cleanup` | secret ของ Edge Function · ที่เก็บ **[รอยืนยัน B14]** | **ลับ** | ผู้ดูแลระบบ |
| กุญแจเข้ารหัส logical dump (age/GPG) | นอก Supabase · **ผู้ถือกุญแจ ≠ ผู้ดูแล storage** | **ลับสูงสุด** | บุคคลที่ระบุชื่อ (P4) |
| VAPID keys (Web Push · Phase 2) | env ของ hosting · แยกต่อ environment | **ลับ** | ผู้ดูแลระบบ |

### 5.4 ทำไมแอปถึง **ไม่ใช้** `service_role` key

| เหตุผล | อธิบาย |
|---|---|
| service_role **ข้าม RLS ทั้งหมด** | หลักการที่ห้ามเปลี่ยนข้อ 3 ของ CANONICAL ข้อ 20.7 คือ "Security อยู่ที่ Database/RLS" — key ที่ข้าม RLS ได้ในแอปเท่ากับยกเลิกชั้นความปลอดภัยทั้งชั้น |
| key ในแอป = key ที่รั่วได้ | Next.js มีทั้งโค้ดฝั่ง server และ bundle ฝั่ง client · ความผิดพลาดครั้งเดียวที่ทำให้ key หลุดลง bundle = ใครก็อ่าน/แก้ข้อมูลลูกค้าทุกสาขาได้ |
| งานที่ต้องใช้สิทธิ์นั้นมีที่อยู่ของมันแล้ว | เฉพาะ Edge Functions ที่ระบุชื่อใน CANONICAL ข้อ 9.8 และต้องแตะฐานข้อมูลผ่าน `api.svc_*` ซึ่งบรรทัดแรกตรวจ `auth.role() = 'service_role'` |
| ตรวจได้จริง | CI ขั้น C5 สแกน bundle หาสตริง `service_role` · go-live checklist §11.2 บังคับให้สแกนซ้ำ |

**สิ่งที่แอปใช้แทน:** เซสชันของผู้ใช้ใน **cookie HttpOnly** → ทุกการเรียก Supabase ที่ใช้เซสชันอยู่ฝั่ง server → RLS ตัดสินทุกแถว (ADR-15)
ในโค้ดตอนนี้ทางเข้าฐานข้อมูลมีทางเดียวคือ `web/src/lib/db/index.ts` (`getDb()` · `rpc()`) — **ห้ามสร้าง Supabase client ที่อื่น**

---

## 6. Checklist ก่อนขึ้น pilot ที่ JAUNPHONE 1

> อ้างอิง CANONICAL ข้อ 20.8–20.10 · `deployment-backup-recovery.md` §11 · `phase1-plan.md` แผน pilot 4 ขั้น
> ทุกข้อต้องมีหลักฐาน (ภาพหน้าจอ · ผลคำสั่ง · ลิงก์บันทึก) และผู้ตรวจลงชื่อ

### 6.1 การตัดสินใจที่ต้องได้ก่อน (ค้างอยู่จริง)

- [ ] **รายชื่อ `BUSINESS_ADMIN` 2 คน** — จำเป็นเพราะการลบ/ทำนิรนามใช้ **2-person control** (ผู้ยืนยัน ≠ ผู้ดำเนินการ) · ถ้ามี BA คนเดียวตอน go-live คำขอลบข้อมูลทำไม่ได้เลย **[รอยืนยัน · CANONICAL ข้อ 20.4 · Q26]**
- [ ] **รายชื่อผู้จัดการ (BRANCH_MANAGER) และพนักงานที่ร่วม pilot ที่ JP1** — เจ้าของโครงการยืนยันก่อนขั้นตอนสร้าง Account/Training **[รอยืนยัน · CANONICAL ข้อ 20.8 ข้อ 5]**
- [ ] Q6 แพ็กเกจ Supabase (Pro หรือ Team) และ region **[รอยืนยัน]**
- [ ] Q25 ผู้ถือสิทธิ์ Owner ของ Supabase organization prod ≤ 2 คน **[รอยืนยัน]**
- [ ] Q5 องค์กรใช้ Google Workspace หรือ Microsoft 365 (ผลต่อ SSO) **[รอยืนยัน]**
- [ ] Q8 ระยะเวลาเก็บข้อมูลและผู้ทำหน้าที่ DPO **[รอยืนยัน — ห้ามใช้เป็นเหตุบล็อกการพัฒนา Phase 1 ตาม CANONICAL ข้อ 20.4]**
- [ ] Q9 ข้อความประกาศความเป็นส่วนตัวฉบับ `PN-2026-01` ได้รับอนุมัติ **[รอยืนยัน]**
- [ ] Q17 JAUNPHONE กับ JAUN POWER MONEY เป็นนิติบุคคลเดียวกันหรือไม่ (ผลต่อ consent purpose) **[รอยืนยัน]**
- [ ] Q4 เวลาทำการของ JP1 (`business_hours`) **[รอยืนยัน]**
- [ ] DPO ประเมินผู้ประมวลผลข้อมูลภายนอกตาม CANONICAL ข้อ 1.4 **[รอยืนยัน]**
- [ ] เลือกผู้ให้บริการ hosting · ช่องทางแจ้งเตือน · ตัดสิน ADR-12 (pg_cron หรือ scheduler ภายนอก) **[รอยืนยัน]**
- [ ] ขั้นตอนสำรองเมื่อระบบใช้ไม่ได้ระหว่างเวลาทำการ (บันทึก visit ย้อนหลัง — N4) **[รอยืนยัน]**

### 6.2 การตั้งค่า prod

- [ ] checklist §3.1–§3.7 ครบทุกแถวของคอลัมน์ prod พร้อมผล "ตรวจ"
- [ ] `supabase migration list` ของ prod ตรงกับ repo ณ commit ที่ release
- [ ] `app.settings['env'] = "prod"` · `app.settings['clock'] = {"as_of": null}` · ทุกคีย์ของข้อ 11.2 มีครบ **รวมสามคีย์ใหม่** (`pdpa.current_notice_version` · `security.login_ip_per_15min` · `dsr.anonymize_per_day`)
- [ ] `pg_trgm` อยู่ใน schema `extensions` · `pg_cron` เปิด · 5 job อยู่ใน `cron.job` ด้วยตารางเวลาและ `username = 'postgres'` และรันรอบแรกสำเร็จ
- [ ] Edge Functions ตาม CANONICAL ข้อ 9.8 deploy แล้ว (ยกเว้น `integration-*`) · secret ครบ · **ไม่มี connection string ฐานข้อมูลใน secret ของ Edge Function**
- [ ] `api.svc_*` มี EXECUTE เฉพาะ `service_role` (คำสั่งตรวจข้อ 7 ใน §4.4)
- [ ] bucket `exports` private · ไม่มี storage policy ให้ `authenticated`/`anon`
- [ ] env ของ Next.js **ไม่มี** service_role/connection string · สแกน bundle แล้วไม่พบ

### 6.3 ความปลอดภัยและคุณภาพ

- [ ] CI บน commit ที่ release เขียวทั้งหมด (`npm run check` · typecheck · build)
- [ ] ชุดทดสอบ HTTP บน staging ผ่าน: `value_raw` ถูกปฏิเสธ · schema `app`/`audit`/`analytics` เรียกไม่ได้ · anon ไม่ได้ข้อมูล · `max_rows` ทำงาน · `rpc/svc_*` ด้วย JWT ผู้ใช้ถูกปฏิเสธ · ผู้ใช้สร้าง signed URL เองไม่ได้ · signed URL หมดอายุ 60 วินาที · เกิน `security.reveal_per_hour` ถูกปฏิเสธ
- [ ] ผลตาราง CANONICAL ข้อ 13.13 ผ่านบน staging ด้วยบัญชีตัวอย่าง (aal1/aal2)
- [ ] `core.role_permissions` ตรงตาราง 8.1 · **SYSTEM_ADMIN ไม่มีสิทธิ์ `customer.*` `visit.*` `lead.*` `opportunity.*`**
- [ ] header: CSP · `Cache-Control: no-store` · cookie HttpOnly/Secure/SameSite=Lax · service worker ไม่ cache route ที่ต้องล็อกอิน
- [ ] ไม่มี Supabase browser client ที่ถือเซสชัน · MFA enroll/challenge/verify ทำผ่าน Server Action
- [ ] เทมเพลตอีเมลและ payload push ไม่มีข้อมูลลูกค้า

### 6.4 ข้อมูล

- [ ] prod **ไม่มีข้อมูล seed** (ไม่มีผู้ใช้ `@example.com` · ไม่มีรายการที่ระบุชื่อในข้อ 13)
- [ ] master data `ref.*` ยืนยันโดย BUSINESS_ADMIN **[รอยืนยัน Q13]** · `crm.tags` · ค่า `app.settings` ฝั่งธุรกิจ
- [ ] นำเข้าข้อมูลเดิมของ JP1 ตาม `data-migration-plan.md` เสร็จและตรวจแล้ว · `app.running_numbers` ตั้งให้มากกว่าเลขที่นำเข้า
- [ ] query ตรวจ invariant บน prod (ไม่มีกิจกรรมก่อน `first_seen_at`) คืน 0 แถว
- [ ] ข้อมูลซ้ำคงเหลือ **< 2%** · เบอร์ผิดรูปแบบถูกแก้หมด (เกณฑ์ผ่าน pilot ขั้นที่ 2)

### 6.5 บัญชีผู้ใช้ (ลำดับ bootstrap · `deployment-backup-recovery.md` §4.2)

- [ ] สคริปต์ bootstrap สร้าง **EXECUTIVE คนแรก + SYSTEM_ADMIN คนแรก + บัญชี `INVITED` ของ BUSINESS_ADMIN คนแรก** · ตั้ง `app.settings['env']` ให้ตรง environment
- [ ] บทบาท BA มอบผ่านคำขอ `RG-` ที่ EXECUTIVE อนุมัติ และ EXECUTIVE ยืนยันตัวตนกับ HR แทน BA — **ต้องทำให้จบภายใน 24 ชม. หลัง bootstrap** เพราะคำเชิญหมดอายุ (N10)
- [ ] บัญชี SYSTEM_ADMIN **ไม่มีบทบาทธุรกิจ**
- [ ] `BUSINESS_ADMIN` คนที่ 2 ถูกสร้างและ `ACTIVE` แล้ว (เงื่อนไข 2-person control)
- [ ] BRANCH_MANAGER ของ JP1 และพนักงานสาขา pilot `ACTIVE` · บทบาทที่ `requires_mfa` ลงทะเบียน TOTP ครบ
- [ ] อุปกรณ์ counter ลงทะเบียนใน `core.devices` · ทดสอบล็อกหน้าจอเมื่อ idle 10 นาที
- [ ] สมาชิก Supabase org prod ≤ 2 Owner/Admin ตามชื่อที่ยืนยัน · MFA ครบ

### 6.6 Backup · DR · Monitoring

- [ ] PITR 7 วันเปิด · daily backup แสดงรายการล่าสุด
- [ ] logical dump รายสัปดาห์ครั้งแรกสำเร็จ · เข้ารหัส · อยู่บน storage ที่ object lock 90 วัน · มี manifest sha256
- [ ] ผู้ถือกุญแจระบุชื่อ (≠ ผู้ดูแล storage) · ทดสอบถอดรหัสได้
- [ ] **restore test ครั้งแรกผ่านทั้งส่วน A และ B และบันทึกแล้ว** · RTO ที่วัดได้ ≤ 4 ชม. · project ทดสอบถูกลบภายใน 24 ชม.
- [ ] ทะเบียน `customer_no` + เวลา anonymize เก็บไว้นอกฐานข้อมูล (Q30)
- [ ] การแจ้งเตือน AL-01 ถึง AL-14 ตั้งค่าและทดสอบยิงจริงแล้ว · ผู้รับยืนยันว่าได้รับ
- [ ] รายชื่อติดต่อเหตุฉุกเฉิน · แบบบันทึก break-glass พร้อมใช้

### 6.7 PDPA · UAT · การอบรม

- [ ] ลิงก์ประกาศความเป็นส่วนตัว `PN-2026-01` ใช้งานได้ · ประกาศระบุระยะเก็บ backup (PITR 7 วัน · dump 90 วัน)
- [ ] UAT ชุดคำถามของ Phase 1 ผ่านและลงนาม (`test-cases-uat.md`)
- [ ] Acceptance Criteria 11 ข้อของ Phase 1 ผ่านจากข้อมูลจริงที่ JP1 บันทึก (`phase1-plan.md`)
- [ ] อบรมพนักงาน JP1: รับลูกค้า (07) · Quick Capture (04) · Customer 360 (05) · การเปิดเบอร์และการบันทึก · **ข้อห้ามบันทึกเลขบัตรประชาชน** · การรับคำขอเจ้าของข้อมูล
- [ ] ช่องทางแจ้งปัญหาและผู้ตอบในช่วง hypercare **[รอยืนยัน]**

### 6.8 เกณฑ์ผ่านของ pilot (ตรึงตาม CANONICAL ข้อ 20.10)

| ขั้น | ทำอะไร | ผ่านเมื่อ |
|---|---|---|
| 1. เตรียม | ตั้ง Supabase 3 environment · รัน migration · สร้างบัญชีพนักงาน JP1 · ตั้งเวลาทำการและ master data จริง | ผู้จัดการสาขาเข้าระบบและเชิญพนักงานได้เอง |
| 2. นำเข้าข้อมูลเก่า | นำเข้าลูกค้าเดิมของ JP1 · ตรวจซ้ำ · ออกรายงานคุณภาพ | ข้อมูลซ้ำคงเหลือ < 2% · เบอร์ผิดรูปแบบถูกแก้หมด |
| 3. ทดลองใช้ 1 สัปดาห์ (คู่กับกระดาษ) | ใช้คู่กระดาษเดิม เปรียบตัวเลขทุกเย็น | **Capture Rate ≥ 80%** · บันทึกผล visit **≥ 90%** · ส่วนต่างจากการนับมือ **< 5%** |
| 4. ใช้จริงเต็มสาขา (2 สัปดาห์) | เลิกกระดาษ ใช้ระบบอย่างเดียว | **Capture Rate ≥ 90%** · พนักงานทุกคนใช้ได้เอง · **ไม่มี blocker ค้าง** |
| เป้าองค์กร (หลังระบบและพนักงานนิ่ง) | – | **Capture Rate ≥ 95%** |

**แผนถอย** — ถ้าขั้น 3 หรือ 4 มีปัญหา ให้กลับไปใช้กระดาษคู่ขนานทันที ข้อมูลที่บันทึกไปแล้วยังอยู่ครบ ไม่ต้องลบทิ้ง
**การขยายหลัง pilot** — เพิ่มทีละสาขา ห่างกันอย่างน้อย 1 สัปดาห์ · **ห้ามเปิดพร้อมกันทุกสาขา**

### 6.9 อนุมัติ

- [ ] EXECUTIVE ลงนามอนุมัติ go-live · วันที่ · เวลาเริ่มใช้งาน (Asia/Bangkok)

---

## 7. สิ่งที่ยังทำไม่ได้ตอนนี้ และทำไม

พูดตรง ๆ — ต่อไปนี้คือช่องว่างจริงระหว่างเอกสารกับของที่มีอยู่ใน repo ณ วันที่เขียน

| # | สิ่งที่ยังทำไม่ได้ | สถานะจริง | ทำไม / ติดอะไร | ปลดล็อกด้วย |
|---|---|---|---|---|
| 1 | ตั้ง Supabase project จริงทั้ง 3 ตัว | **ยังไม่มี project ใด ๆ** | ต้องตัดสิน Q6 (แพ็กเกจ + region) และ Q25 (ผู้ถือ Owner) ก่อน · ทั้งสองข้อรอเจ้าของโครงการ | ยืนยัน Q6 · Q25 แล้วทำตาม §3 |
| 2 | รัน `supabase db push` / `supabase functions deploy` | ทำไม่ได้ | **เครื่องนี้ไม่มี Supabase CLI** (`which supabase` ไม่พบ) และไม่มี project ให้ link | ติดตั้ง Supabase CLI บนเครื่องที่จะ deploy + มี project จาก #1 |
| 3 | ทดสอบ `pg_cron` / `*_cron.sql` | ทดสอบไม่ได้ในเครื่อง | PGlite ไม่มี `pg_cron` · `tools/db/run.mjs` และ `dev-api.mjs` **ข้ามไฟล์ `*_cron.sql` โดยตั้งใจ** | ทดสอบบน dev/staging จริงเท่านั้น (§4.4 คำสั่งข้อ 11) |
| 4 | รัน Supabase แบบ local ด้วย `supabase start` | ทำไม่ได้ | **เครื่องนี้ไม่มี Docker** (`which docker` ไม่พบ) — โครงการจึงเลือกทาง PGlite + `dev-api.mjs` ตั้งแต่ต้น | ติดตั้ง Docker (ไม่จำเป็นสำหรับ Phase 1) |
| 5 | Edge Functions ทั้ง 8 ตัว (`invite-staff` · `disable-staff` · `reset-mfa` · `staff-code-login` · `password-reset` · `generate-export` · `cron-export-cleanup` · `integration-*`) | **ยังไม่ได้เขียนสักตัว** — ไม่มีโฟลเดอร์ `supabase/functions/` | เป็นงานที่ยังไม่อยู่ในลำดับที่อนุมัติ (CANONICAL ข้อ 20.9 ให้เริ่มจาก Environment Setup → รับลูกค้า + Quick Capture) | ต้องเขียนก่อนเปิดใช้ล็อกอินด้วย `ST-NNNN` · ก่อนเชิญพนักงานจริง · และก่อน go-live |
| 6 | ล็อกอินจริงด้วยรหัสผ่าน / MFA | โหมดพัฒนา **ไม่ตรวจรหัสผ่าน** — เลือกได้ว่าจะเป็นใครจากรายชื่อ seed | ต้องมี Supabase Auth จริง (#1) + `staff-code-login` (#5) | #1 + #5 |
| 7 | Auth hooks (Before User Created · Custom Access Token · Password Verification Attempt) | ฟังก์ชัน hook **ยังไม่มีใน migration** และชื่อฟังก์ชัน **[รอยืนยัน · `docs/04-security/security-design.md`]** | ชื่อ hook ไม่อยู่ในรายการฟังก์ชันของ CANONICAL ข้อ 9.6 | ยืนยันชื่อ แล้วเขียน migration ไฟล์ใหม่ |
| 8 | สามคีย์ใหม่ของ `app.settings` (`pdpa.current_notice_version` · `security.login_ip_per_15min` · `dsr.anonymize_per_day`) | **ยังไม่อยู่ใน `0001_foundation.sql`** | เพิ่มใน CANONICAL v2.2 หลังเขียน migration แล้ว และ M2 ห้ามแก้ไฟล์ที่ apply ไปแล้ว | เพิ่มด้วย migration ไฟล์ใหม่ **ก่อน deploy staging** |
| 9 | Storage bucket `exports` และไฟล์ export | ยังไม่มี | ต้องมี Supabase project (#1) · ฟีเจอร์ export เป็น **Phase 3** | #1 + Phase 3 |
| 10 | `tools/db/anonymize.sql` (ทำสำเนา prod เป็นข้อมูลนิรนาม) | **ยังไม่มีไฟล์นี้ใน repo** | CANONICAL ข้อ 9.7 อ้างถึงแต่ยังไม่ได้เขียน · ขอบเขตยังค้าง (N6: ต้องครอบ `core.staff_profiles`/`staff_invitations`/`auth` ด้วยหรือไม่) | เขียนไฟล์ + DPO ยืนยันขอบเขต — จำเป็นก่อนนำสำเนา prod ไป staging |
| 11 | CI/CD pipeline จริง | มีแค่ `.github/workflows/deploy-pages.yml` (deploy prototype) | pipeline C1–C5 · S1–S2 · P0–P2 ออกแบบไว้แล้วใน `deployment-backup-recovery.md` §3 แต่ยังไม่ได้สร้าง workflow | สร้าง workflow ตาม §3 ของเอกสารนั้น · เครื่องมือ lint/test ของแอป **[รอยืนยัน]** |
| 12 | บัญชี BUSINESS_ADMIN 2 คน · รายชื่อ pilot | **ยังไม่มีรายชื่อ** | เจ้าของโครงการจะยืนยันก่อนขั้นตอนสร้าง Account/Training (CANONICAL ข้อ 20.4 · 20.8) | รอรายชื่อ |
| 13 | หน้าจอ Phase 1 ส่วนใหญ่ | มีแล้ว: login · reception · quick capture (ร่าง) · dashboard (ร่าง) — ที่เหลือยังไม่ได้เขียน | เป็นงานถัดไปตามลำดับที่อนุมัติ (CANONICAL ข้อ 20.9) | ทำตามลำดับ ชุดที่ 1 → ชุดที่ 2 |
| 14 | ขั้นตอนสำรองเมื่อระบบใช้ไม่ได้ระหว่างเวลาทำการ | **ยังไม่มีกติกา** | `api.open_visit` บันทึกเวลาปัจจุบัน และ CANONICAL ไม่มีกติกาบันทึก visit ย้อนเวลา · **ห้ามแก้ `started_at` ด้วย SQL** (N4) | เจ้าของโครงการตัดสิน แล้วเพิ่มใน api-spec |
| 15 | URL ของ repository · URL ของแต่ละ environment · โดเมน | **[รอยืนยัน]** | ยังไม่เลือกผู้ให้บริการ hosting | ยืนยันผู้ให้บริการและโดเมน |

**สรุปสั้น ๆ ว่าตอนนี้ทำอะไรได้จริง:** ทุกอย่างใน §1 — clone · install · `npm run dev:db` · `npm run dev:web` · `npm run check` · พัฒนาและทดสอบ Core Flow กับ **RLS และ RPC ตัวจริง** ได้เต็มรูปแบบบนเครื่องตัวเอง โดยไม่ต้องมี Docker · Supabase CLI · หรือ Supabase project
สิ่งที่ยังทำไม่ได้คือทุกอย่างที่ต้องแตะ **Supabase จริง** (§3–§4) และ **Edge Functions**

---

## 8. สารบัญย่อ — เอกสารอื่นที่เกี่ยวข้อง

### 8.1 ถ้าอยากรู้เรื่อง… ให้เปิดไฟล์ไหน

| เรื่อง | ไฟล์ | จุดที่ควรอ่าน |
|---|---|---|
| **ค่าทุกค่าของโครงการ** (ตัวเลข · รหัส · สูตร · ข้อความไทย) | `docs/00-brief/CANONICAL.md` | **ข้อ 20** (Direction · บังคับสูงสุด) · ข้อ 1.2–1.3 (เวลา/ตัวเลข) · ข้อ 9 (ความปลอดภัย) · ข้อ 11.2 (`app.settings`) · ข้อ 17 (คำถาม Q1–Q30) |
| บรีฟต้นฉบับของเจ้าของโครงการ | `docs/00-brief/REQUIREMENT.md` | A1–A45 · B1–B27 |
| สถาปัตยกรรม · โครงไฟล์ Next.js · ADR | `docs/02-architecture/system-architecture.md` | §3.2–§3.7 (Auth · Data API · schema · Edge Functions · Storage · งานตามเวลา) · §6 (โครง Next.js) · §9.2 (นาฬิกาต่อ environment) · §12 (ชั้นการทดสอบ) |
| **Deployment · Backup · Recovery · CI/CD** | `docs/08-delivery/deployment-backup-recovery.md` | §2 (checklist ต่อ environment ฉบับเต็ม) · §3 (CI/CD + กติกา migration) · §4.2 (ลำดับ bootstrap) · §5–§7 (backup · restore test · DR) · §8 (สำเนา prod แบบนิรนาม) · §10 (break-glass) · §11 (go-live checklist) |
| **แผน Phase 1 ที่อนุมัติแล้ว** | `docs/08-delivery/phase1-plan.md` | ขอบเขต · หน้าจอ 12 หน้า · Acceptance Criteria 11 ข้อ · แผน pilot 4 ขั้น |
| Roadmap และลำดับ release | `docs/08-delivery/roadmap.md` | – |
| แผนนำเข้าข้อมูลลูกค้าเดิม | `docs/08-delivery/data-migration-plan.md` | – |
| Test case และ UAT | `docs/08-delivery/test-cases-uat.md` | – |
| สิทธิ์รายบทบาท × ขอบเขต | `docs/04-security/permission-matrix.md` | – |
| RLS spec รายตาราง | `docs/04-security/rls-spec.md` | – |
| Security design (รวม Audit · Auth hooks) | `docs/04-security/security-design.md` | ชื่อฟังก์ชัน hook **[รอยืนยัน]** |
| PDPA · DSR · ระยะเก็บข้อมูล | `docs/04-security/pdpa.md` | – |
| สัญญา RPC · Edge Function · Server Action | `docs/07-api/api-spec.md` | – |
| Data dictionary (สร้างจากฐานข้อมูลจริง) | `docs/03-data/data-dictionary.md` | สร้างใหม่ด้วย `npm run db:dictionary` |
| ER diagram · schema notes | `docs/03-data/er-diagram.md` · `docs/03-data/schema-notes.md` | – |
| นิยาม KPI ทุกตัว | `docs/05-analytics/kpi-definitions.md` | – |
| กติกาการแจ้งเตือน | `docs/05-analytics/notification-rules.md` | – |
| Design system · สเปกหน้าจอทั้ง 19 หน้า | `docs/06-ux/design-system.md` · `docs/06-ux/sitemap-screen-specs.md` | – |
| User flow ทุกกระบวนการ | `docs/01-requirement/user-flows.md` | – |

### 8.2 ไฟล์โค้ดที่เกี่ยวกับ environment โดยตรง

| ไฟล์ | หน้าที่ |
|---|---|
| `web/.env.example` | ต้นแบบของ `web/.env.local` · มีคำอธิบายทุกตัวแปรเป็นภาษาไทย |
| `web/src/lib/env.ts` | **ทางเดียว** ที่แอปอ่านตัวแปรสภาพแวดล้อม · บังคับกติกา dev/staging/prod |
| `web/src/lib/db/index.ts` | **ทางเดียว** ที่แอปแตะฐานข้อมูล (`getDb()` · `rpc()` · `RpcError`) |
| `web/src/proxy.ts` | ต่ออายุเซสชัน (Next.js 16 · แทน middleware เดิม) |
| `web/next.config.ts` | security headers · `Cache-Control: no-store` · `typedRoutes` |
| `web/scripts/sync-design.mjs` | คัดลอก CSS จาก `prototype/assets/` → `web/src/app/generated/` |
| `tools/db/dev-api.mjs` | ฐานข้อมูล + PostgREST จำลองสำหรับเครื่องนักพัฒนา (**ห้ามใช้บน staging/prod**) |
| `tools/db/run.mjs` | รัน migration + seed + ชุดทดสอบบน PGlite |
| `tools/db/gen-seed.mjs` | สร้าง `supabase/seed.sql` แบบ deterministic |
| `supabase/migrations/` | โครงฐานข้อมูลทั้งหมด (§4.1) |
| `supabase/tests/` | ชุดทดสอบ schema · RLS รายบทบาท · RPC · acceptance |

---

> **ก่อนแก้เอกสารนี้:** ค่าทุกค่าต้องมีที่มาจาก CANONICAL · migration · หรือ `deployment-backup-recovery.md`
> ถ้ายังไม่มีที่มา ให้เขียน **[รอยืนยัน]** พร้อมหมายเลข Q — **ห้ามเดา และห้ามเปลี่ยน [รอยืนยัน] เป็นข้อสรุปเองโดยไม่มีการยืนยันเป็นลายลักษณ์อักษรจากเจ้าของโครงการ** (CANONICAL ข้อ 17 · 20.5)
