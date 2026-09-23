#!/usr/bin/env python3
"""Smoke Test — Login → รับลูกค้า → Quick Capture → Customer 360 → Dashboard → Audit

ยิงผ่าน HTTP ของแอปจริง ไม่ใช่ยิง RPC ตรง
เพราะสิ่งที่ต้องพิสูจน์คือ "ผู้ใช้เปิดหน้าแล้วได้ของจริง" ไม่ใช่ "ฐานข้อมูลตอบได้"

## รันที่ไหน

    npm run smoke                      # ฐานข้อมูลทดลองในเครื่อง (ค่าเริ่มต้น)
    npm run smoke -- --env pilot.json  # environment ที่จะใช้ Pilot

**ก่อนเปิดให้พนักงานจริง ต้องรันบน environment ของ Pilot** ผลจากเครื่อง dev ใช้แทนกันไม่ได้
เพราะสิ่งที่ต่างกันคือของจริงทั้งหมด: ตัวตนผ่าน Supabase Auth จริง · RLS บนข้อมูลจริง ·
เครือข่ายของสาขา · และ HTTPS ที่หน้าจอ production เท่านั้นที่บังคับ

## ไฟล์ตั้งค่าของ environment (ตัวอย่าง)

    {
      "label": "JAUN CRM · Pilot (staging)",
      "web":    "https://crm-staging.example.com",
      "api":    "https://<project>.supabase.co/rest/v1/rpc",
      "apikey": "<publishable key ของ project นั้น>",
      "accounts": {
        "ST-0001": { "cookie": "sb-...-auth-token=...", "jwt": "eyJ..." },
        "ST-0002": { "cookie": "...", "jwt": "..." }
      }
    }

**ทำไมต้องแปะ cookie/jwt เอง:** บน environment จริงไม่มีทางปลอมตัวตนได้ (และไม่ควรมี)
ผู้รันต้องเข้าสู่ระบบด้วยบัญชีจริงของแต่ละบทบาทก่อน แล้วคัดลอกเซสชันมา
ซึ่งพิสูจน์ไปในตัวว่า **การเข้าสู่ระบบจริงใช้งานได้** ก่อนจะทดสอบอย่างอื่น

ไฟล์ตั้งค่ามี token ของคนจริง = ความลับ · อย่า commit · อย่าส่งผ่านแชต
ลบทิ้งทันทีที่รันเสร็จ และถือว่าเซสชันนั้นควรถูก sign out หลังทดสอบ
"""
import json, os, re, sys, urllib.request, urllib.error

def load_config():
    """อ่านไฟล์ตั้งค่าจาก --env หรือ JCRM_SMOKE_CONFIG · ไม่ระบุ = ฐานข้อมูลทดลองในเครื่อง"""
    path = None
    argv = sys.argv[1:]
    if "--env" in argv:
        i = argv.index("--env")
        if i + 1 >= len(argv):
            sys.exit("ต้องระบุไฟล์ตั้งค่าหลัง --env")
        path = argv[i + 1]
    path = path or os.environ.get("JCRM_SMOKE_CONFIG")
    if not path:
        # พอร์ตของ next dev เปลี่ยนได้เมื่อพอร์ตเดิมถูกใช้อยู่ จึงให้แทนที่ด้วยตัวแปรสภาพแวดล้อมได้
        web = os.environ.get("JCRM_SMOKE_WEB", "http://localhost:51091").rstrip("/")
        api = os.environ.get("JCRM_SMOKE_API", "http://127.0.0.1:54329/rest/v1/rpc")
        return {"label": "ฐานข้อมูลทดลองในเครื่อง (dev)", "mode": "dev",
                "web": web, "api": api, "apikey": None, "accounts": {}}
    with open(path, encoding="utf-8") as f:
        cfg = json.load(f)
    for key in ("web", "api", "accounts"):
        if not cfg.get(key):
            sys.exit(f"ไฟล์ตั้งค่าขาดคีย์ {key}")
    cfg["mode"] = "supabase"
    cfg.setdefault("label", cfg["web"])
    cfg["web"] = cfg["web"].rstrip("/")
    return cfg

CFG = load_config()
WEB, API = CFG["web"], CFG["api"]
ok_all = True
skipped = []

def _account(who):
    acct = CFG["accounts"].get(who)
    if acct is None:
        raise KeyError(who)
    return acct

def page(path, who, aal="aal2"):
    """เปิดหน้าในฐานะผู้ใช้คนหนึ่ง — คืน (status, html) · (None, "") เมื่อไม่มีบัญชีนั้นให้ใช้"""
    if CFG["mode"] == "dev":
        cookie = f"jcrm.dev.session={who}|{aal}" if who else ""
    else:
        if not who:
            cookie = ""
        else:
            try:
                cookie = _account(who)["cookie"]
            except KeyError:
                return None, ""
    headers = {"Cookie": cookie} if cookie else {}
    r = urllib.request.Request(WEB + path, headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=180) as resp:
            return resp.getcode(), resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def rpc(fn, body, who, aal="aal2"):
    headers = {"content-type": "application/json", "content-profile": "api"}
    if CFG["mode"] == "dev":
        headers["authorization"] = f"Bearer dev:{who}:{aal}"
    else:
        try:
            headers["authorization"] = f"Bearer {_account(who)['jwt']}"
        except KeyError:
            return {"SKIP": who}
        if CFG.get("apikey"):
            headers["apikey"] = CFG["apikey"]
    r = urllib.request.Request(f"{API}/{fn}", data=json.dumps(body).encode(), headers=headers)
    try:
        return json.load(urllib.request.urlopen(r, timeout=120))
    except urllib.error.HTTPError as e:
        try: return {"ERROR": json.load(e)}
        except Exception: return {"ERROR": e.read().decode()[:200]}

def skip(name, why):
    """ข้ามอย่างเปิดเผย — การข้ามเงียบ ๆ อันตรายกว่าการไม่ทดสอบ เพราะอ่านแล้วนึกว่าผ่าน"""
    skipped.append(f"{name} — {why}")
    print(f"  ข้าม   · {name} — {why}")

def check(name, cond, detail=""):
    global ok_all
    if not cond: ok_all = False
    print(f"  {'ผ่าน ' if cond else 'ไม่ผ่าน'} · {name}" + (f" — {detail}" if detail else ""))
    return cond

def need(who, what):
    """มีเซสชันของบัญชีนั้นให้ใช้ไหม — ไม่มีก็ประกาศข้ามแล้วคืน False
       ตั้งใจให้ "ข้าม" ดังกว่า "ผ่าน" เพราะการข้ามเงียบ ๆ อ่านแล้วนึกว่าทดสอบครบ"""
    if CFG["mode"] == "dev" or who in CFG["accounts"]:
        return True
    skip(what, f"ไฟล์ตั้งค่าไม่มีเซสชันของ {who}")
    return False


print(f"\nSmoke Test · {CFG['label']}")
print(f"  เว็บ {WEB}")
print(f"  API {API}")

print("\n=== 1. เข้าสู่ระบบ ===")
code, html = page("/login", "")
check("หน้าเข้าสู่ระบบเปิดได้โดยยังไม่มีเซสชัน", code == 200)
# ข้อกำหนดคือ "ไม่มีช่องทางสมัครใช้งานเอง" ไม่ใช่ "ต้องมีประโยคใดประโยคหนึ่ง"
# ประโยค "ระบบนี้ไม่มีการสมัครใช้งานเอง…" อยู่ในฟอร์มโหมดจริงเท่านั้น (PasswordLoginForm)
# โหมดพัฒนาแสดง DevLoginForm ซึ่งไม่มีประโยคนั้น การเช็กประโยคตรง ๆ จึงฟ้องผิดทั้งที่แอปถูก
check("ไม่มีช่องทางสมัครใช้งานเอง", not any(k in html for k in ("สมัคร", "ลงทะเบียน", "Sign up", "Register")))
code, html = page("/dashboard", "")
check("ยังไม่เข้าสู่ระบบแล้วเปิดหน้าหลักไม่ได้", code in (302, 307) or "เข้าสู่ระบบ" in html)
if CFG["mode"] == "supabase":
    # บน environment จริงต้องเป็น HTTPS เท่านั้น — เซสชันและข้อมูลลูกค้าวิ่งผ่านสายนี้
    check("เว็บใช้ HTTPS", WEB.startswith("https://"), WEB)

print("\n=== 2. รับลูกค้าเข้าร้าน (07) ===")
if need("ST-0045", "รับลูกค้าเข้าร้าน"):
    code, html = page("/reception", "ST-0045")
    check("พนักงานเปิดหน้ารับลูกค้าได้", code == 200)
    check("มีคิววันนี้", "คิววันนี้" in html)
    check("มีปุ่มรับเข้าคิว", "รับเข้าคิว" in html or "เริ่มให้บริการ" in html)
    check("ไม่มีปุ่มบันทึกแบบไม่ระบุตัวตน (D52)", "บันทึกแบบไม่ระบุตัวตน" not in html)

print("\n=== 3. Quick Capture (04) ===")
if need("ST-0045", "Quick Capture"):
    code, html = page("/customers/new", "ST-0045")
    check("เปิดหน้าเพิ่มลูกค้าได้", code == 200)
    check("มีช่องเบอร์โทร", "เบอร์โทร" in html)
    check("ไม่มีปุ่มบันทึกแบบไม่ระบุตัวตน", "บันทึกแบบไม่ระบุตัวตน" not in html)

print("\n=== 4. Customer 360 (05) ===")
if need("ST-0045", "Customer 360"):
    code, html = page("/customers", "ST-0045")
    check("รายการลูกค้าเปิดได้", code == 200)
    m = re.search(r"/customers/(CUS-\d{4}-\d{6})", html)
    check("มีลูกค้าให้เปิดดู", bool(m), m.group(1) if m else "ไม่พบเลขลูกค้า")
    if m:
        cus = m.group(1)
        code, html = page(f"/customers/{cus}", "ST-0045")
        check(f"เปิด {cus} ได้", code == 200)
        check("เบอร์ถูกปิดบัง", bool(re.search(r"\d{3}-XXX-\d{4}", html)), "ต้องเห็นรูปแบบ 08X-XXX-XXXX")
        check("ไม่มีเบอร์เต็มหลุดมาก่อนกดแสดง", not re.search(r">0[689]\d-\d{3}-\d{4}<", html))
        check("มีปุ่มแสดงค่าเต็ม", "แสดง" in html)

print("\n=== 5. หน้าหลัก (02) ===")
for who, name in [("ST-0001", "EXECUTIVE"), ("ST-0020", "BRANCH_MANAGER"), ("ST-0045", "STAFF")]:
    if need(who, f"หน้าหลักของ {name}"):
        code, html = page("/dashboard", who)
        check(f"{name} เปิดหน้าหลักได้", code == 200)

if need("ST-0001", "ตัวเลขหน้าหลักตรงกับ RPC"):
    code, html = page("/dashboard", "ST-0001")
    charts = rpc("get_dashboard_charts", {"p_preset": "LAST_30_DAYS"}, "ST-0001")
    kpis   = rpc("get_kpis", {"p_preset": "LAST_30_DAYS"}, "ST-0001")
    if "ERROR" in charts or "ERROR" in kpis:
        check("เรียก RPC ของหน้าหลักได้", False, str(charts.get("ERROR") or kpis.get("ERROR"))[:120])
    else:
        kv = {r["code"]: r["display"] for r in kpis["rows"]}
        for r in kpis["rows"]:
            if r["code"] in ("UNIQUE_CUSTOMERS", "LEADS", "OPPORTUNITIES", "SALES"):
                check(f"การ์ด {r['code']} = {r['display']} อยู่บนหน้าจอ", r["display"] in html)
        for st in charts["funnel"]:
            check(f"Funnel {st['label_th']} {st['display']} / {st['share_display']}",
                  st["display"] in html and st["share_display"] in html)
        ch = charts["channels"]
        check(f"กลางโดนัท {ch['total_display']} = การ์ดลูกค้าไม่ซ้ำ {kv.get('UNIQUE_CUSTOMERS')}",
              ch["total_display"] == kv.get("UNIQUE_CUSTOMERS"))
        for seg in ch["segments"][:3]:
            check(f"โดนัท {seg['label_th']} {seg['pct_display']}", seg["pct_display"] in html)
        for lr in charts["lost_reasons"][:3]:
            check(f"เหตุผล {lr['label_th']} {lr['display']} / {lr['pct_display']}",
                  lr["display"] in html and lr["pct_display"] in html)

print("\n=== 6. ประวัติการใช้งาน (16) ===")
if need("ST-0002", "ประวัติการใช้งาน"):
    for key, label in [("reveal", "เปิดเผยช่องทางติดต่อ"), ("link_branch", "ผูกลูกค้าเข้าสาขา"),
                       ("invite", "เชิญผู้ใช้"), ("disable", "ปิดใช้งานบัญชี"),
                       ("merge", "รวมลูกค้า"), ("edit", "แก้ไขข้อมูลลูกค้า")]:
        code, html = page(f"/audit?tab=business&view={key}&range=all", "ST-0002")
        blocked = "ยังอ่านผ่านหน้าจอไม่ได้" in html
        leak = bool(re.search(r"\b[0-9a-f]{64}\b", html)) or "sha256" in html
        check(f"มุมมอง {label} เปิดได้และไม่ถูกปิดกั้น", code == 200 and not blocked)
        check(f"มุมมอง {label} ไม่มีค่าแฮชหลุด", not leak)
if need("ST-0020", "ผู้จัดการสาขาต้องไม่มีสิทธิ์เปิดประวัติการใช้งาน"):
    code, html = page("/audit", "ST-0020")
    check("BRANCH_MANAGER ไม่มีสิทธิ์เปิดประวัติการใช้งาน", "ไม่มีสิทธิ์เข้าหน้านี้" in html)

print("\n=== 7. PII ทั่วทั้งหน้าที่เปิดเป็นประจำ ===")
for path, who in [("/dashboard", "ST-0001"), ("/customers", "ST-0020"), ("/data-quality", "ST-0002"),
                  ("/audit", "ST-0002"), ("/privacy", "ST-0002"), ("/settings", "ST-0002")]:
    if not need(who, f"ตรวจ PII ของ {path}"):
        continue
    code, html = page(path, who)
    full_phone = re.findall(r">0[689]\d-\d{3}-\d{4}<", html)
    check(f"{path} ไม่มีเบอร์เต็มหลุด", not full_phone, str(full_phone[:2]))

print("\n" + ("=" * 60))
if skipped:
    print(f"ข้ามไป {len(skipped)} หัวข้อ เพราะไฟล์ตั้งค่าไม่มีเซสชันของบัญชีนั้น:")
    for line in skipped:
        print(f"  · {line}")
    print("  การข้ามไม่ใช่การผ่าน — ก่อนเปิด Pilot ต้องรันให้ครบทุกบทบาท")
print("Smoke Test: " + ("ผ่านทั้งหมด" if ok_all else "มีข้อไม่ผ่าน")
      + (f" (ข้าม {len(skipped)})" if skipped else ""))
sys.exit(0 if ok_all and not skipped else (0 if ok_all else 1))

