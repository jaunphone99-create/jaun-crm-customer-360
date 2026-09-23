#!/usr/bin/env python3
"""Smoke Test ก่อนเปิด Pilot — Login → รับลูกค้า → Quick Capture → Customer 360 → Dashboard → Audit

ยิงผ่าน HTTP ของแอปจริงที่ localhost:51091 (ไม่ใช่ยิง RPC ตรง)
เพราะสิ่งที่ต้องพิสูจน์คือ "ผู้ใช้เปิดหน้าแล้วได้ของจริง" ไม่ใช่ "ฐานข้อมูลตอบได้"
"""
import json, re, sys, urllib.request, urllib.error

WEB = "http://localhost:51091"
API = "http://127.0.0.1:54329/rest/v1/rpc"
ok_all = True

def page(path, who, aal="aal2"):
    r = urllib.request.Request(WEB + path, headers={"Cookie": f"jcrm.dev.session={who}|{aal}"})
    try:
        with urllib.request.urlopen(r, timeout=180) as resp:
            return resp.getcode(), resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def rpc(fn, body, who, aal="aal2"):
    r = urllib.request.Request(f"{API}/{fn}", data=json.dumps(body).encode(),
        headers={"content-type": "application/json", "content-profile": "api",
                 "authorization": f"Bearer dev:{who}:{aal}"})
    try:
        return json.load(urllib.request.urlopen(r, timeout=120))
    except urllib.error.HTTPError as e:
        try: return {"ERROR": json.load(e)}
        except Exception: return {"ERROR": e.read().decode()[:200]}

def check(name, cond, detail=""):
    global ok_all
    if not cond: ok_all = False
    print(f"  {'ผ่าน ' if cond else 'ไม่ผ่าน'} · {name}" + (f" — {detail}" if detail else ""))
    return cond

print("\n=== 1. เข้าสู่ระบบ ===")
code, html = page("/login", "", )
check("หน้าเข้าสู่ระบบเปิดได้โดยยังไม่มีเซสชัน", code == 200)
# ข้อกำหนดคือ "ไม่มีช่องทางสมัครใช้งานเอง" ไม่ใช่ "ต้องมีประโยคใดประโยคหนึ่ง"
# ประโยค "ระบบนี้ไม่มีการสมัครใช้งานเอง…" อยู่ในฟอร์มโหมดจริงเท่านั้น (PasswordLoginForm)
# โหมดพัฒนาแสดง DevLoginForm ซึ่งไม่มีประโยคนั้น การเช็กประโยคตรง ๆ จึงฟ้องผิดทั้งที่แอปถูก
check("ไม่มีช่องทางสมัครใช้งานเอง", not any(k in html for k in ("สมัคร", "ลงทะเบียน", "Sign up", "Register")))
code, html = page("/dashboard", "")
check("ยังไม่เข้าสู่ระบบแล้วเปิดหน้าหลักไม่ได้", code in (302, 307) or "เข้าสู่ระบบ" in html)

print("\n=== 2. รับลูกค้าเข้าร้าน (07) ===")
code, html = page("/reception", "ST-0045")
check("พนักงานเปิดหน้ารับลูกค้าได้", code == 200)
check("มีคิววันนี้", "คิววันนี้" in html)
check("มีปุ่มรับเข้าคิว", "รับเข้าคิว" in html or "เริ่มให้บริการ" in html)
check("ไม่มีปุ่มบันทึกแบบไม่ระบุตัวตน (D52)", "บันทึกแบบไม่ระบุตัวตน" not in html)

print("\n=== 3. Quick Capture (04) ===")
code, html = page("/customers/new", "ST-0045")
check("เปิดหน้าเพิ่มลูกค้าได้", code == 200)
check("มีช่องเบอร์โทร", "เบอร์โทร" in html)
check("ไม่มีปุ่มบันทึกแบบไม่ระบุตัวตน", "บันทึกแบบไม่ระบุตัวตน" not in html)

print("\n=== 4. Customer 360 (05) ===")
code, html = page("/customers", "ST-0045")
check("รายการลูกค้าเปิดได้", code == 200)
m = re.search(r'/customers/(CUS-\d{4}-\d{6})', html)
check("มีลูกค้าให้เปิดดู", bool(m), m.group(1) if m else "ไม่พบเลขลูกค้า")
if m:
    cus = m.group(1)
    code, html = page(f"/customers/{cus}", "ST-0045")
    check(f"เปิด {cus} ได้", code == 200)
    check("เบอร์ถูกปิดบัง", bool(re.search(r'\d{3}-XXX-\d{4}', html)), "ต้องเห็นรูปแบบ 08X-XXX-XXXX")
    check("ไม่มีเบอร์เต็มหลุดมาก่อนกดแสดง", not re.search(r'>0[689]\d-\d{3}-\d{4}<', html))
    check("มีปุ่มแสดงค่าเต็ม", "แสดง" in html)

print("\n=== 5. หน้าหลัก (02) ===")
for who, name in [("ST-0001","EXECUTIVE"), ("ST-0020","BRANCH_MANAGER"), ("ST-0045","STAFF")]:
    code, html = page("/dashboard", who)
    check(f"{name} เปิดหน้าหลักได้", code == 200)
code, html = page("/dashboard", "ST-0001")
charts = rpc("get_dashboard_charts", {"p_preset": "LAST_30_DAYS"}, "ST-0001")
kpis   = rpc("get_kpis", {"p_preset": "LAST_30_DAYS"}, "ST-0001")
if "ERROR" not in charts and "ERROR" not in kpis:
    kv = {r["code"]: r["display"] for r in kpis["rows"]}
    for r in kpis["rows"]:
        if r["code"] in ("UNIQUE_CUSTOMERS","LEADS","OPPORTUNITIES","SALES"):
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
else:
    check("เรียก RPC กราฟได้", False, str(charts.get("ERROR") or kpis.get("ERROR"))[:120])

print("\n=== 6. ประวัติการใช้งาน (16) ===")
for key, label in [("reveal","เปิดเผยช่องทางติดต่อ"), ("link_branch","ผูกลูกค้าเข้าสาขา"),
                   ("invite","เชิญผู้ใช้"), ("disable","ปิดใช้งานบัญชี"),
                   ("merge","รวมลูกค้า"), ("edit","แก้ไขข้อมูลลูกค้า")]:
    code, html = page(f"/audit?tab=business&view={key}&range=all", "ST-0002")
    blocked = "ยังอ่านผ่านหน้าจอไม่ได้" in html
    leak = bool(re.search(r'\b[0-9a-f]{64}\b', html)) or "sha256" in html
    check(f"มุมมอง {label} เปิดได้และไม่ถูกปิดกั้น", code == 200 and not blocked)
    check(f"มุมมอง {label} ไม่มีค่าแฮชหลุด", not leak)
code, html = page("/audit", "ST-0020")
check("BRANCH_MANAGER ไม่มีสิทธิ์เปิดประวัติการใช้งาน", "ไม่มีสิทธิ์เข้าหน้านี้" in html)

print("\n=== 7. PII ทั่วทั้งหน้าที่เปิดเป็นประจำ ===")
for path, who in [("/dashboard","ST-0001"), ("/customers","ST-0020"), ("/data-quality","ST-0002"),
                  ("/audit","ST-0002"), ("/privacy","ST-0002"), ("/settings","ST-0002")]:
    code, html = page(path, who)
    full_phone = re.findall(r'>0[689]\d-\d{3}-\d{4}<', html)
    check(f"{path} ไม่มีเบอร์เต็มหลุด", not full_phone, str(full_phone[:2]))

print("\n" + ("=" * 60))
print("Smoke Test: " + ("ผ่านทั้งหมด" if ok_all else "มีข้อไม่ผ่าน"))
sys.exit(0 if ok_all else 1)
