"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";

import { can, getAccess } from "@/lib/access";
import { rpc } from "@/lib/db";

import { captureErrorField, captureErrorMessage } from "./errors";
import { hasIdentifier, identityKey } from "./shared";
import { EMPTY_DUP, type Candidate, type CaptureState, type DupState } from "./types";

/* การเขียนทั้งหมดของหน้า 04 อยู่ในไฟล์นี้ไฟล์เดียว และผ่าน RPC ของ schema `api` เท่านั้น
   - สร้างลูกค้า: api.quick_capture            (CANONICAL ข้อ 6.2 — ทางเดียวที่สร้างลูกค้าได้)
   - ตรวจซ้ำ:    api.find_customer_candidates  (ข้อ 6.5)
   - ผูกสาขา:    api.link_customer_to_branch   (ข้อ 6.6 — ทางเดียวที่ผูกลูกค้าข้ามสาขาได้)
   - เปิด visit:  api.open_visit                (ข้อ 3.3 · 19.3 ข้อ 1)

   สิทธิ์ถูกตัดสินที่ฐานข้อมูลเสมอ การตรวจในไฟล์นี้มีไว้ให้ข้อความผิดพลาดอ่านรู้เรื่องเท่านั้น */

type Intent = "check" | "save" | "queue" | "serve" | "anon" | "use";

type FormValues = {
  mode: "customer" | "visit";
  visitId: string;
  branchId: string;
  channelCode: string;
  firstName: string;
  lastName: string;
  nickname: string;
  phone: string;
  lineId: string;
  email: string;
  provinceCode: string;
  sourceCode: string;
  interestCode: string;
  productTypeCode: string;
  productModel: string;
  note: string;
  privacy: boolean;
  marketing: boolean;
  marketingChannels: string[];
  ageOk: boolean;
  overrideReason: string;
  overrideNote: string;
  candidateId: string;
};

const NOTE_MAX = 2000;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function flag(formData: FormData, name: string): boolean {
  return formData.get(name) === "on" || formData.get(name) === "true";
}

function readValues(formData: FormData): FormValues {
  return {
    mode: text(formData, "mode") === "visit" ? "visit" : "customer",
    visitId: text(formData, "visit_id"),
    branchId: text(formData, "branch_id"),
    channelCode: text(formData, "channel_code"),
    firstName: text(formData, "first_name"),
    lastName: text(formData, "last_name"),
    nickname: text(formData, "nickname"),
    phone: text(formData, "phone"),
    lineId: text(formData, "line_id"),
    email: text(formData, "email"),
    provinceCode: text(formData, "province_code"),
    sourceCode: text(formData, "source_code"),
    interestCode: text(formData, "interest_code"),
    productTypeCode: text(formData, "product_type_code"),
    productModel: text(formData, "product_model"),
    note: text(formData, "note"),
    privacy: flag(formData, "privacy"),
    marketing: flag(formData, "marketing"),
    marketingChannels: formData.getAll("marketing_channels").filter((c): c is string => typeof c === "string"),
    ageOk: flag(formData, "age_ok"),
    overrideReason: text(formData, "override_reason"),
    overrideNote: text(formData, "override_note"),
    candidateId: text(formData, "candidate_id"),
  };
}

function keyOf(v: FormValues): string {
  return identityKey({
    phone: v.phone,
    lineId: v.lineId,
    email: v.email,
    branchId: v.branchId,
    firstName: v.firstName,
    lastName: v.lastName,
  });
}

function base(prev: CaptureState): CaptureState {
  return { ...prev, fieldErrors: {}, formError: null, formWarning: null, success: null, nonce: prev.nonce + 1 };
}

function fail(prev: CaptureState, message: string, fieldErrors: Record<string, string> = {}): CaptureState {
  return { ...base(prev), formError: message, fieldErrors };
}

/** ข้อความบังคับกรอกทั้งหมดมาจาก sitemap-screen-specs ข้อ 7.5 */
function validate(v: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!v.branchId) errors.branch_id = "เลือกสาขา";
  if (!v.channelCode) errors.channel_code = "เลือกช่องทางที่ติดต่อมา";
  if (!v.interestCode) errors.interest_code = "เลือกความสนใจ";
  if (!v.firstName && !v.nickname) errors.first_name = "กรอกชื่อหรือชื่อเล่นอย่างน้อยหนึ่งช่อง";

  if ((v.channelCode === "WALK_IN" || v.channelCode === "PHONE") && !v.phone) {
    errors.phone = "ต้องกรอกเบอร์โทรเมื่อลูกค้าติดต่อผ่าน Walk-in หรือโทรศัพท์";
  } else if (!hasIdentifier({ phone: v.phone, lineId: v.lineId, email: v.email })) {
    errors.phone = "ต้องมีช่องทางติดต่ออย่างน้อย 1 รายการ (เบอร์โทร LINE ID หรืออีเมล)";
  }

  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errors.email = "รูปแบบอีเมลไม่ถูกต้อง";
  if (!v.privacy) errors.privacy = "ต้องแจ้งประกาศความเป็นส่วนตัวให้ลูกค้าก่อนบันทึก";
  if (v.note.length > NOTE_MAX) errors.note = "รายละเอียดเพิ่มเติมยาวเกิน 2,000 ตัวอักษร";

  if (v.marketing) {
    if (v.marketingChannels.length === 0) errors.marketing_channels = "เลือกช่องทางรับข่าวสารอย่างน้อย 1 ช่องทาง";
    if (!v.ageOk) errors.age_ok = "ต้องยืนยันอายุหรือความยินยอมของผู้ใช้อำนาจปกครอง";
  }
  if (v.overrideReason === "OTHER" && !v.overrideNote) errors.override_note = "กรอกหมายเหตุเมื่อเลือกอื่น ๆ";
  return errors;
}

type CandidatesResult = { ok: boolean; code?: string; count?: number; candidates?: Candidate[] };

async function runCandidateSearch(v: FormValues): Promise<DupState> {
  const key = keyOf(v);
  const result = await rpc<CandidatesResult>("find_customer_candidates", {
    p_visit_id: v.visitId || null,
    p_phone: v.phone || null,
    p_line_id: v.lineId || null,
    p_email: v.email || null,
    p_first_name: v.firstName || null,
    p_last_name: v.lastName || null,
  });

  /* เกินอัตราที่กำหนด — ไม่ใช่ข้อผิดพลาดของผู้ใช้ และ "ไม่บล็อกการสร้าง" (CANONICAL ข้อ 6.5)
     api.quick_capture คำนวณผู้สมัครซ้ำใหม่ฝั่ง server อยู่แล้ว (ข้อ 19.3 ข้อ 2) */
  if (!result.ok) {
    return {
      status: "limited",
      key,
      candidates: [],
      message: "ตรวจสอบซ้ำครบจำนวนที่กำหนดต่อชั่วโมงแล้ว กรุณารอสักครู่ · ระบบจะตรวจข้อมูลซ้ำอีกครั้งตอนบันทึก",
    };
  }
  return { status: "results", key, candidates: result.candidates ?? [], message: null };
}

/** หน้ารับลูกค้าเข้าร้าน (07) รับข้อความยืนยันผ่าน ?flash= — ค่าที่กรอกไม่ลง URL (ข้อ 7.9) */
function receptionUrl(message: string): Route {
  return `/reception?flash=${encodeURIComponent(message)}` as Route;
}

type QuickCaptureResult = {
  ok: boolean;
  customer_id: string;
  customer_no: string;
  visit_id: string | null;
  visit_no: string | null;
  queue_no: number | null;
  lead_no: string | null;
};

type OpenVisitResult = { ok: boolean; visit_id: string; visit_no: string | null; queue_no: number | null };

type LinkResult = { ok: boolean; customer_no: string; visit_id: string };

export async function captureAction(prev: CaptureState, formData: FormData): Promise<CaptureState> {
  const raw = text(formData, "intent");
  const intent: Intent = (["check", "save", "queue", "serve", "anon", "use"] as const).includes(raw as Intent)
    ? (raw as Intent)
    : "save";
  const v = readValues(formData);

  const access = await getAccess();
  if (!access) return fail(prev, "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");

  const wantsVisit = v.mode === "visit" && can(access, "visit.create", v.branchId || null);
  const backToReception = can(access, "visit.read", v.branchId || null);

  /* ---- ตรวจสอบซ้ำ (ไม่สร้างอะไร) --------------------------------------- */
  if (intent === "check") {
    if (!hasIdentifier({ phone: v.phone, lineId: v.lineId, email: v.email })) {
      return { ...base(prev), formWarning: "กรอกเบอร์โทร LINE ID หรืออีเมลก่อน" };
    }
    try {
      return { ...base(prev), dup: await runCandidateSearch(v) };
    } catch (error) {
      return fail(prev, captureErrorMessage(error));
    }
  }

  /* ---- รับลูกค้าโดยยังไม่ระบุตัวตน — เปิด visit เปล่า ------------------- */
  if (intent === "anon") {
    if (!wantsVisit) {
      return fail(prev, "รับลูกค้าแบบไม่ระบุตัวตนทำได้เฉพาะตอนรับลูกค้าเข้าร้าน (ต้องมีสิทธิ์เปิด visit)");
    }
    const errors: Record<string, string> = {};
    if (!v.branchId) errors.branch_id = "เลือกสาขา";
    if (!v.channelCode) errors.channel_code = "เลือกช่องทางที่ติดต่อมา";
    if (!v.interestCode) errors.interest_code = "เลือกความสนใจ";
    if (Object.keys(errors).length > 0) {
      return { ...base(prev), fieldErrors: errors, formError: "กรุณาแก้ไขช่องที่ทำเครื่องหมายไว้" };
    }

    let opened: OpenVisitResult;
    try {
      opened = await rpc<OpenVisitResult>("open_visit", {
        p: {
          branch_id: v.branchId,
          channel_code: v.channelCode,
          interest_code: v.interestCode,
          source_code: v.sourceCode || null,
        },
      });
    } catch (error) {
      return fail(prev, captureErrorMessage(error));
    }

    const message = `รับลูกค้าแล้วโดยยังไม่ระบุตัวตน · ${opened.visit_no ?? ""}`.trim();
    if (backToReception) redirect(receptionUrl(`${message} · ระบุชื่อและเบอร์ภายหลังได้จากคิวนี้`));
    return {
      ...base(prev),
      dup: EMPTY_DUP,
      success: {
        message,
        customerNo: null,
        visitNo: opened.visit_no,
        queueNo: opened.queue_no,
        leadNo: null,
      },
    };
  }

  /* ---- ใช้ลูกค้าเดิม ---------------------------------------------------- */
  if (intent === "use") {
    if (!v.candidateId) return fail(prev, "ไม่พบลูกค้าที่เลือก กรุณาตรวจสอบซ้ำอีกครั้ง");
    if (!wantsVisit) {
      return fail(
        prev,
        "ผูกลูกค้าเดิมทำได้เฉพาะตอนรับลูกค้าเข้าร้าน · หน้าข้อมูลลูกค้า (Customer 360) ยังไม่เปิดใช้งานในรุ่นนี้"
      );
    }

    let visitId = v.visitId;
    let visitNo: string | null = null;
    let queueNo: number | null = null;
    let linked: LinkResult;

    try {
      if (!visitId) {
        /* ยังไม่มี visit → เปิด visit ของสาขาตัวเองก่อน แล้วตรวจซ้ำใหม่ด้วย visit นั้น
           เพราะ api.link_customer_to_branch ยอมรับเฉพาะลูกค้าที่ถูกคืนจากผลตรวจซ้ำของ visit นี้
           ภายใน 30 นาที (CANONICAL ข้อ 6.6 · sitemap-screen-specs ข้อ 7.5) */
        const opened = await rpc<OpenVisitResult>("open_visit", {
          p: {
            branch_id: v.branchId,
            channel_code: v.channelCode,
            interest_code: v.interestCode || null,
            source_code: v.sourceCode || null,
            visit_mode: text(formData, "use_kind") === "queue" ? "QUEUE" : "SERVICE",
          },
        });
        visitId = opened.visit_id;
        visitNo = opened.visit_no;
        queueNo = opened.queue_no;
        await runCandidateSearch({ ...v, visitId });
      }

      linked = await rpc<LinkResult>("link_customer_to_branch", {
        p_customer_id: v.candidateId,
        p_visit_id: visitId,
      });
    } catch (error) {
      return fail(prev, captureErrorMessage(error));
    }

    /* redirect() ของ Next ทำงานด้วยการโยน error (digest = NEXT_REDIRECT)
       จึงต้องเรียก "นอก" try เสมอ ไม่งั้น catch จะกลืนไป แล้วผู้ใช้เห็นว่าล้มเหลวทั้งที่บันทึกสำเร็จแล้ว */
    const message = `ผูก ${linked.customer_no} เข้ากับการรับลูกค้าแล้ว${visitNo ? ` · ${visitNo}` : ""}`;
    if (backToReception) redirect(receptionUrl(message));
    return {
      ...base(prev),
      dup: EMPTY_DUP,
      success: { message, customerNo: linked.customer_no, visitNo, queueNo, leadNo: null },
    };
  }

  /* ---- บันทึก (สร้างลูกค้าใหม่) ----------------------------------------- */
  const errors = validate(v);
  if (Object.keys(errors).length > 0) {
    return { ...base(prev), fieldErrors: errors, formError: "กรุณาแก้ไขช่องที่ทำเครื่องหมายไว้" };
  }

  /* ต้องตัดสินเรื่องข้อมูลซ้ำก่อนบันทึกเสมอ — ถ้ายังไม่เคยตรวจด้วยค่าชุดนี้ ให้ตรวจให้
     (ไม่มีการรวมลูกค้าอัตโนมัติ และไม่บล็อกถาวร ผู้ใช้เลือก "ใช้ลูกค้าเดิม" หรือให้เหตุผล) */
  let dup = prev.dup;
  if (!v.overrideReason) {
    const key = keyOf(v);
    if (dup.status !== "results" || dup.key !== key) {
      try {
        dup = await runCandidateSearch(v);
      } catch (error) {
        return fail(prev, captureErrorMessage(error));
      }
    }
    if (dup.status === "results" && dup.candidates.length > 0) {
      return {
        ...base(prev),
        dup,
        formWarning: "พบข้อมูลที่อาจซ้ำ กรุณาเลือก ‘ใช้ลูกค้าเดิม’ หรือ ‘ยังต้องการสร้างลูกค้าใหม่’ ก่อนบันทึก",
      };
    }
  }

  const payload: Record<string, unknown> = {
    branch_id: v.branchId,
    channel_code: v.channelCode,
    interest_code: v.interestCode,
    first_name: v.firstName || null,
    last_name: v.lastName || null,
    nickname: v.nickname || null,
    phone: v.phone || null,
    line_id: v.lineId || null,
    email: v.email || null,
    province_code: v.provinceCode || null,
    source_code: v.sourceCode || null,
    product_type_code: v.productTypeCode || null,
    product_model: v.productModel || null,
    note: v.note || null,
    privacy_notice_ack: true,
    open_visit: wantsVisit,
    visit_mode: intent === "queue" ? "QUEUE" : "SERVICE",
  };
  if (v.visitId) payload.visit_id = v.visitId;
  if (v.marketing) {
    payload.marketing = { granted: true, age_ack: v.ageOk, channels: v.marketingChannels };
  }
  if (v.overrideReason) {
    payload.duplicate_override_reason_code = v.overrideReason;
    payload.duplicate_override_note = v.overrideNote || null;
  }

  let created: QuickCaptureResult;
  try {
    created = await rpc<QuickCaptureResult>("quick_capture", { p: payload });
  } catch (error) {
    const message = captureErrorMessage(error);
    const field = captureErrorField(message);
    return {
      ...base(prev),
      dup,
      formError: message,
      fieldErrors: field ? { [field]: message } : {},
    };
  }

  const parts = [
    intent === "queue" && created.queue_no != null
      ? `รับเข้าคิวแล้ว · คิว ${created.queue_no}`
      : wantsVisit
        ? "เริ่มให้บริการแล้ว"
        : "บันทึกลูกค้าแล้ว",
    created.customer_no,
  ];
  if (created.lead_no) parts.push(`ระบบสร้าง Lead ${created.lead_no} ให้อัตโนมัติ`);
  const message = parts.filter(Boolean).join(" · ");

  if (wantsVisit && backToReception) redirect(receptionUrl(message));

  return {
    ...base(prev),
    dup: EMPTY_DUP,
    success: {
      message,
      customerNo: created.customer_no,
      visitNo: created.visit_no,
      queueNo: created.queue_no,
      leadNo: created.lead_no,
    },
  };
}
