/* จำกัดจำนวนครั้งที่ลองเข้าสู่ระบบต่อ IP (ข้อ 9.2 · security.login_ip_per_15min = 20)

   ข้อจำกัดที่ต้องรู้ (CANONICAL เรียกสิ่งนี้ว่า "best-effort" เองอยู่แล้ว):
   - นับในหน่วยความจำของ isolate · Supabase หมุน isolate และมีหลายตัวขนานกัน
     ตัวเลขจึงเป็นเพดานต่อ isolate ไม่ใช่เพดานทั้งระบบ
   - ผู้โจมตียิง /auth/v1/token ตรงได้โดยไม่ผ่านฟังก์ชันนี้ → ด่านจริงคือ
     Password Verification Attempt hook (Team plan) ตามข้อ 9.2
   - ค่าเริ่มต้น 20 ครั้ง/15 นาที ตรงกับ app.settings['security.login_ip_per_15min']
     ซึ่ง Edge Function อ่านไม่ได้ (ไม่มี api.svc_* สำหรับอ่านค่าตั้ง) จึงให้ override
     ด้วย secret LOGIN_IP_PER_15MIN เมื่อ BUSINESS_ADMIN แก้ค่าในระบบ */

const WINDOW_MS = 15 * 60 * 1000;

function limitPerWindow(): number {
  const raw = Deno.env.get("LOGIN_IP_PER_15MIN");
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 20;
}

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** ลบถังที่หมดอายุ เพื่อไม่ให้ Map โตไม่จำกัดใน isolate ที่อยู่นาน */
function sweep(now: number): void {
  if (buckets.size < 512) return;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

/**
 * นับหนึ่งครั้งสำหรับ IP นี้ · คืน true เมื่อ "ยังทำต่อได้"
 * คืน false เมื่อเกินเพดานในหน้าต่าง 15 นาที
 */
export function allowLoginAttempt(ip: string): boolean {
  const now = Date.now();
  sweep(now);
  const current = buckets.get(ip);
  if (!current || current.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  current.count += 1;
  return current.count <= limitPerWindow();
}
