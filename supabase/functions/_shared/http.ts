/* ตัวช่วย HTTP ที่ทุก Edge Function ใช้ร่วมกัน
   - รูปแบบคำตอบเดียวกันทั้งระบบ: { ok: true, ... } หรือ { ok: false, message }
   - `message` เป็นภาษาไทยเสมอ และต้องปลอดภัยที่จะแสดงบนหน้าจอ (ดู errors.ts)
   - สถานะ HTTP เป็น 200 เสมอเมื่อเป็น "ปฏิเสธเชิงธุรกิจ" เพื่อให้ supabase-js
     ส่ง body กลับให้แอปอ่านได้ (functions.invoke จะโยน FunctionsHttpError เมื่อ status >= 400
     และแอปจะเข้าไม่ถึง message) · สงวน 4xx/5xx ไว้กับความผิดพลาดระดับโปรโตคอลจริง ๆ */

/** ส่วนหัว CORS — Edge Function เหล่านี้ถูกเรียกจาก Server Action เป็นหลัก
    แต่เปิด CORS ไว้เพื่อให้ทดสอบด้วย curl/เครื่องมือภายนอกได้ */
export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type, x-request-id",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-max-age": "86400",
};

/** ตอบ preflight ให้จบตั้งแต่ต้นทาง · คืน null เมื่อไม่ใช่ OPTIONS */
export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  return null;
}

/** คำตอบ JSON มาตรฐาน — ห้าม cache เพราะทุกเส้นทางนี้เกี่ยวกับตัวตนผู้ใช้ (ข้อ 9.2) */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** สำเร็จ */
export function ok(data: Record<string, unknown> = {}): Response {
  return jsonResponse({ ok: true, ...data });
}

/** ปฏิเสธเชิงธุรกิจ — 200 เสมอ เพื่อให้แอปอ่าน message ได้ (ดูหมายเหตุหัวไฟล์) */
export function fail(message: string): Response {
  return jsonResponse({ ok: false, message });
}

/** ปฏิเสธระดับโปรโตคอล (ไม่มี JWT · เมธอดผิด) — ใช้ status จริงเพื่อให้ตรวจจับได้จาก log */
export function failWithStatus(message: string, status: number): Response {
  return jsonResponse({ ok: false, message }, status);
}

/** รับเฉพาะ POST · เมธอดอื่นคืน 405 */
export function requirePost(req: Request): Response | null {
  if (req.method !== "POST") {
    return failWithStatus("เมธอดนี้ไม่รองรับ", 405);
  }
  return null;
}

/** อ่าน body เป็น JSON · คืน null เมื่อ body ไม่ใช่ JSON ที่เป็นอ็อบเจกต์ */
export async function readJsonBody(
  req: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await req.json();
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** ค่าข้อความจาก body — ตัดช่องว่างหัวท้าย · คืน null เมื่อว่าง */
export function str(body: Record<string, unknown>, key: string): string | null {
  const v = body[key];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** IP ของผู้เรียกเท่าที่ gateway ส่งมา — ใช้นับอัตราเท่านั้น ห้ามใช้ตัดสินสิทธิ์ (ข้อ 9.2) */
export function clientIp(req: Request): string {
  /* x-forwarded-for เป็นรายการที่ต่อกันไปเรื่อย ๆ ผู้เรียกใส่ค่าอะไรไว้ข้างหน้าก็ได้
     ค่าที่เชื่อได้คือ **ตัวท้ายสุด** ซึ่ง proxy ชั้นนอกสุดของ Supabase เป็นคนเติม
     ถ้าอ่านตัวแรกแบบเดิม ใครก็ข้ามเพดาน 20 ครั้ง/15 นาที ได้ด้วยการเปลี่ยน header ทุกคำขอ */
  const direct = req.headers.get("cf-connecting-ip");
  if (direct) return direct.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1]!;
  }
  return "unknown";
}

/** x-request-id ที่ Next.js ส่งมา ใช้ต่อรอย log (ข้อ 9.5 · correlation) */
export function requestId(req: Request): string {
  return req.headers.get("x-request-id") ?? crypto.randomUUID();
}
