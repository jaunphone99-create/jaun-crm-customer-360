"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useActionState, startTransition } from "react";

import { int } from "@/lib/format/number";

import { captureAction } from "./actions";
import { digitsOf, hasIdentifier, identityKey, isPhoneComplete, isThaiPhoneShape } from "./shared";
import { INITIAL_CAPTURE_STATE, type Candidate, type CaptureContext, type CaptureRefs } from "./types";

/* หน้า 04 · เพิ่มลูกค้า (Quick Capture)
   โครง ข้อความ และลำดับช่อง ตาม prototype/04-quick-capture.html + sitemap-screen-specs ข้อ 7
   ชื่อ class ทั้งหมดมาจาก generated/app.css และ generated/page-quick-capture.css

   ค่าที่กรอกอยู่ใน state ของ React ล้วน ๆ ไม่ลง URL และไม่ลง storage (ข้อ 7.9)
   การเขียนทุกอย่างเกิดใน Server Action `captureAction` เท่านั้น */

const TABS = [
  { id: "basic", label: "ข้อมูลพื้นฐาน" },
  { id: "interest", label: "ความสนใจ" },
  { id: "more", label: "เพิ่มเติม" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const FIELD_TAB: Record<string, TabId> = {
  phone: "basic",
  first_name: "basic",
  last_name: "basic",
  channel_code: "basic",
  branch_id: "basic",
  privacy: "basic",
  interest_code: "interest",
  product_type_code: "interest",
  product_model: "interest",
  nickname: "more",
  line_id: "more",
  email: "more",
  province_code: "more",
  source_code: "more",
  note: "more",
  marketing: "more",
  marketing_channels: "more",
  age_ok: "more",
};

/** ป้ายไทยของ lifecycle_stage (CANONICAL ข้อ 3.4) */
const LIFECYCLE_LABEL: Record<string, string> = {
  REPEAT: "ลูกค้าซื้อซ้ำ",
  CUSTOMER: "ลูกค้าปัจจุบัน",
  OPPORTUNITY: "มีโอกาสซื้อ",
  LEAD: "สนใจซื้อ",
  LOST: "ไม่สำเร็จ",
  IDENTIFIED: "รู้จักแล้ว",
};

/** ช่องทางของความยินยอม ⊆ {LINE, SMS, PHONE, EMAIL} (CANONICAL ข้อ 10.2 · crm.customer_consents.channels) */
const CONSENT_CHANNELS: Array<{ code: string; label: string }> = [
  { code: "LINE", label: "LINE" },
  { code: "SMS", label: "SMS" },
  { code: "PHONE", label: "โทรศัพท์" },
  { code: "EMAIL", label: "อีเมล" },
];

const NOTE_MAX = 2000;

type Draft = {
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
};

function emptyDraft(ctx: CaptureContext): Draft {
  const onlyBranch = ctx.branches.length === 1 ? ctx.branches[0]?.branch_id ?? "" : "";
  return {
    branchId: ctx.visit?.branch_id ?? onlyBranch,
    channelCode: ctx.visit?.channel_code ?? "",
    firstName: "",
    lastName: "",
    nickname: "",
    phone: "",
    lineId: "",
    email: "",
    provinceCode: "",
    sourceCode: ctx.visit?.source_code ?? "",
    interestCode: ctx.visit?.interest_code ?? "",
    productTypeCode: "",
    productModel: "",
    note: "",
    privacy: false,
    marketing: false,
    marketingChannels: [],
    ageOk: false,
    overrideReason: "",
    overrideNote: "",
  };
}

function toFormData(ctx: CaptureContext, draft: Draft, intent: string, extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("intent", intent);
  fd.set("mode", ctx.mode);
  fd.set("visit_id", ctx.visit?.id ?? "");
  fd.set("branch_id", draft.branchId);
  fd.set("channel_code", draft.channelCode);
  fd.set("first_name", draft.firstName);
  fd.set("last_name", draft.lastName);
  fd.set("nickname", draft.nickname);
  fd.set("phone", draft.phone);
  fd.set("line_id", draft.lineId);
  fd.set("email", draft.email);
  fd.set("province_code", draft.provinceCode);
  fd.set("source_code", draft.sourceCode);
  fd.set("interest_code", draft.interestCode);
  fd.set("product_type_code", draft.productTypeCode);
  fd.set("product_model", draft.productModel);
  fd.set("note", draft.note);
  if (draft.privacy) fd.set("privacy", "on");
  if (draft.marketing) fd.set("marketing", "on");
  for (const channel of draft.marketingChannels) fd.append("marketing_channels", channel);
  if (draft.ageOk) fd.set("age_ok", "on");
  fd.set("override_reason", draft.overrideReason);
  fd.set("override_note", draft.overrideNote);
  for (const [key, value] of Object.entries(extra)) fd.set(key, value);
  return fd;
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p className="error-text" id={id}>
      {message}
    </p>
  );
}

export function QuickCaptureForm({ ctx, refs }: { ctx: CaptureContext; refs: CaptureRefs }) {
  const [state, dispatch, pending] = useActionState(captureAction, INITIAL_CAPTURE_STATE);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(ctx));
  const [tab, setTab] = useState<TabId>("basic");
  const [moreOpen, setMoreOpen] = useState(false);
  const [decideNew, setDecideNew] = useState(false);
  const [askCancel, setAskCancel] = useState(false);
  const autoCheckedKey = useRef<string>("");

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const errors = state.fieldErrors;
  const channel = refs.channels.find((c) => c.code === draft.channelCode) ?? null;
  const interest = refs.interestTypes.find((i) => i.code === draft.interestCode) ?? null;
  const branchLocked = ctx.branches.length === 1 || ctx.visit !== null;
  const channelLocked = ctx.visit !== null;
  const phoneRequired = draft.channelCode === "WALK_IN" || draft.channelCode === "PHONE";
  const identified = hasIdentifier({ phone: draft.phone, lineId: draft.lineId, email: draft.email });

  const key = useMemo(
    () =>
      identityKey({
        phone: draft.phone,
        lineId: draft.lineId,
        email: draft.email,
        branchId: draft.branchId,
        firstName: draft.firstName,
        lastName: draft.lastName,
      }),
    [draft.phone, draft.lineId, draft.email, draft.branchId, draft.firstName, draft.lastName]
  );

  /* กุญแจของ "ตัวระบุ" อย่างเดียว (เบอร์ · LINE ID · อีเมล) ใช้สั่งตรวจซ้ำอัตโนมัติ
     ห้ามใช้ `key` ที่รวมชื่อและสาขา เพราะทุกตัวอักษรที่พิมพ์ในช่องชื่อจะยิง
     api.find_customer_candidates เพิ่มอีกครั้ง กินโควตา ≤ 60 ครั้ง/ชม. (CANONICAL ข้อ 6.5)
     prototype/04-quick-capture.html ก็ตรวจอัตโนมัติจากช่องเบอร์เท่านั้น */
  const contactKey = useMemo(
    () =>
      identityKey({
        phone: draft.phone,
        lineId: draft.lineId,
        email: draft.email,
        branchId: "",
        firstName: "",
        lastName: "",
      }),
    [draft.phone, draft.lineId, draft.email]
  );

  const dupFresh = state.dup.status !== "idle" && state.dup.key === key;
  const candidates = dupFresh ? state.dup.candidates : [];
  const blocked = dupFresh && candidates.length > 0 && !draft.overrideReason;

  const run = (intent: string, extra: Record<string, string> = {}) => {
    startTransition(() => dispatch(toFormData(ctx, draft, intent, extra)));
  };

  /* ตรวจซ้ำอัตโนมัติเมื่อกรอกเบอร์ครบ (sitemap-screen-specs ข้อ 7.5)
     ทำครั้งเดียวต่อค่าชุดหนึ่ง เพื่อไม่กินโควตา ≤ 60 ครั้ง/ชม. ไปเปล่า ๆ */
  useEffect(() => {
    if (pending || state.success) return;
    if (!isPhoneComplete(draft.phone)) return;
    if (autoCheckedKey.current === contactKey) return;
    autoCheckedKey.current = contactKey;
    run("check");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactKey, pending, state.success]);

  useEffect(() => {
    if (!draft.overrideReason) return;
    setDecideNew(true);
  }, [draft.overrideReason]);

  /* สลับไปแท็บแรกที่มีช่องผิด และเปิดส่วน "ข้อมูลเพิ่มเติม" ถ้าช่องผิดซ่อนอยู่ */
  useEffect(() => {
    const names = Object.keys(errors);
    if (names.length === 0) return;
    if (names.some((n) => ["nickname", "line_id", "email", "province_code", "source_code"].includes(n))) {
      setMoreOpen(true);
    }
    const first = TABS.find((t) => names.some((n) => FIELD_TAB[n] === t.id));
    if (first) setTab(first.id);
  }, [errors, state.nonce]);

  const tabHasError = (id: TabId) => Object.keys(errors).some((n) => FIELD_TAB[n] === id);

  /* ---- สำเร็จแล้ว ------------------------------------------------------- */
  if (state.success) {
    const s = state.success;
    return (
      <div className="card stack">
        <div className="alert alert--success" role="status">
          <span aria-hidden="true">✓</span>
          <div>
            <p className="alert__title">{s.message}</p>
            {s.visitNo || s.queueNo != null ? (
              <p className="t-sm">
                {s.visitNo ? `การรับลูกค้า ${s.visitNo}` : ""}
                {s.queueNo != null ? `${s.visitNo ? " · " : ""}คิว ${s.queueNo}` : ""}
              </p>
            ) : null}
          </div>
        </div>
        <p className="t-sm t-muted">
          หน้าข้อมูลลูกค้า (Customer 360) และหน้ารายการลูกค้ายังไม่เปิดใช้งานในรุ่นนี้ จึงยังเปิดดูรายละเอียดต่อไม่ได้
        </p>
        <div className="btn-group">
          <Link className="btn btn--accent" href="/customers/new">
            เพิ่มลูกค้าอีกคน
          </Link>
          {ctx.canReception ? (
            <Link className="btn btn--secondary" href="/reception">
              ไปหน้ารับลูกค้าเข้าร้าน
            </Link>
          ) : null}
          <Link className="btn btn--ghost" href="/dashboard">
            กลับหน้าหลัก
          </Link>
        </div>
      </div>
    );
  }

  /* ---- การ์ดผู้สมัครซ้ำ -------------------------------------------------- */
  const candidateCard = (c: Candidate) => {
    const lifecycle = c.lifecycle_stage ? LIFECYCLE_LABEL[c.lifecycle_stage] : null;
    const walkInChoice = ctx.mode === "visit" && !ctx.visit && draft.channelCode === "WALK_IN";
    const useDisabledReason =
      ctx.mode !== "visit"
        ? c.in_scope
          ? "หน้าข้อมูลลูกค้า (Customer 360) ยังไม่เปิดใช้งานในรุ่นนี้"
          : "ผูกลูกค้าจากสาขาอื่นได้เฉพาะตอนรับลูกค้า"
        : null;

    return (
      <div className="qc-cand" key={c.customer_id} data-out={String(!c.in_scope)}>
        <div className="qc-cand__head">
          <span className="code">{c.customer_no}</span>
          <span className="qc-cand__score">คะแนน {c.score}</span>
        </div>
        <p className="t-medium t-heading">
          คุณ{c.display_name ?? "—"}
          {c.value_masked ? <span className="t-sm t-muted"> · {c.value_masked}</span> : null}
        </p>
        {lifecycle ? (
          <p>
            <span className="badge badge--navy badge--lifecycle">{lifecycle}</span>
          </p>
        ) : null}
        <p className="t-sm">{c.reasons.join(" · ")}</p>
        {c.in_scope ? null : (
          <p className="t-xs t-muted">ลูกค้านอกขอบเขตของคุณ · ไม่แสดงสถานะ สาขา และวันที่ติดต่อ</p>
        )}
        <div className="qc-cand__actions">
          {useDisabledReason ? (
            <button type="button" className="btn btn--primary btn--sm" aria-disabled="true" data-tooltip={useDisabledReason}>
              ใช้ลูกค้าเดิม
            </button>
          ) : walkInChoice ? (
            <>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={pending}
                onClick={() => run("use", { candidate_id: c.customer_id, use_kind: "queue" })}
              >
                ใช้ลูกค้าเดิม · รับเข้าคิว
              </button>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={pending}
                onClick={() => run("use", { candidate_id: c.customer_id, use_kind: "serve" })}
              >
                ใช้ลูกค้าเดิม · เริ่มให้บริการ
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={pending}
              onClick={() => run("use", { candidate_id: c.customer_id, use_kind: "serve" })}
            >
              ใช้ลูกค้าเดิม
            </button>
          )}
        </div>
      </div>
    );
  };

  const dupPanel = () => {
    if (state.dup.status === "limited") {
      return (
        <div className="alert alert--danger" role="status">
          <span aria-hidden="true">!</span>
          <div>{state.dup.message}</div>
        </div>
      );
    }
    if (!dupFresh) {
      return (
        <p className="t-sm t-muted">
          กรอกเบอร์โทร LINE ID หรืออีเมล แล้วกด “ตรวจสอบซ้ำ” · ระบบตรวจอัตโนมัติเมื่อกรอกเบอร์ครบ ·
          ไม่มีการรวมลูกค้าอัตโนมัติและไม่บล็อกการสร้าง
        </p>
      );
    }
    if (candidates.length === 0) {
      return (
        <div className="alert alert--success" role="status">
          <span aria-hidden="true">✓</span>
          <div>ไม่พบข้อมูลที่ซ้ำ</div>
        </div>
      );
    }
    const topScore = candidates[0]?.score ?? 0;
    return (
      <>
        {candidates.map(candidateCard)}
        {decideNew ? (
          <div className="stack-2">
            <p className="t-sm t-medium">ยังต้องการสร้างลูกค้าใหม่</p>
            <div className="field">
              <label className="label" htmlFor="qc-override-reason">
                เหตุผลที่ยังสร้างลูกค้าใหม่<span className="req">*</span>
              </label>
              <select
                className="select"
                id="qc-override-reason"
                value={draft.overrideReason}
                aria-invalid={errors.override_reason ? true : undefined}
                onChange={(e) => set("overrideReason", e.target.value)}
              >
                <option value="">เลือกเหตุผล</option>
                {refs.overrideReasons.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label_th}
                  </option>
                ))}
              </select>
              <FieldError id="qc-override-reason-error" message={errors.override_reason} />
            </div>
            {draft.overrideReason === "OTHER" ? (
              <div className="field">
                <label className="label" htmlFor="qc-override-note">
                  หมายเหตุ<span className="req">*</span>
                </label>
                <textarea
                  className="textarea"
                  id="qc-override-note"
                  rows={2}
                  maxLength={NOTE_MAX}
                  value={draft.overrideNote}
                  aria-invalid={errors.override_note ? true : undefined}
                  onChange={(e) => set("overrideNote", e.target.value)}
                />
                <FieldError id="qc-override-note-error" message={errors.override_note} />
              </div>
            ) : null}
            <p className="help">
              {topScore >= 70
                ? "มีผู้สมัครคะแนน ≥ 70 → ระบบสร้างรายการ “รอตัดสิน” ในศูนย์คุณภาพข้อมูลคู่กับผู้สมัครคะแนนสูงสุด"
                : "ผู้สมัครทุกรายคะแนนต่ำกว่า 70 → ไม่สร้างรายการรอตัดสิน"}
            </p>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setDecideNew(false);
                setDraft((d) => ({ ...d, overrideReason: "", overrideNote: "" }));
              }}
            >
              เลิกสร้างใหม่
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn--secondary btn--block" onClick={() => setDecideNew(true)}>
            ยังต้องการสร้างลูกค้าใหม่
          </button>
        )}
      </>
    );
  };

  /* ---- ปุ่มท้ายฟอร์ม (sitemap-screen-specs ข้อ 7.5) --------------------- */
  const saveButton = (label: string, shortLabel: string, variant: string, intent: string) => (
    <button
      type="button"
      className={`btn btn--${variant}`}
      disabled={pending}
      aria-disabled={blocked ? true : undefined}
      data-tooltip={
        blocked ? "พบข้อมูลที่อาจซ้ำ กรุณาเลือก ‘ใช้ลูกค้าเดิม’ หรือ ‘ยังต้องการสร้างลูกค้าใหม่’" : undefined
      }
      onClick={() => run(intent)}
    >
      <span className="qc-label-long">{label}</span>
      <span className="qc-label-short">{shortLabel}</span>
    </button>
  );

  const walkInFlow = ctx.mode === "visit" && !ctx.visit && (!draft.channelCode || draft.channelCode === "WALK_IN");

  const title = ctx.mode === "visit" ? "รับลูกค้าใหม่" : "เพิ่มลูกค้าใหม่";
  const lead =
    ctx.mode === "visit"
      ? ctx.visit
        ? "สร้างลูกค้าและผูกกับการรับลูกค้าที่เปิดอยู่ (ไม่เปิดรายการใหม่)"
        : "สร้างหรือผูกลูกค้า และเปิดการรับลูกค้า"
      : "สร้างลูกค้าอย่างเดียว ไม่เปิดการรับลูกค้า · กรอกให้เร็วที่สุดแล้วเติมภายหลังได้";

  const dirty = JSON.stringify(draft) !== JSON.stringify(emptyDraft(ctx));

  return (
    <>
      <div className="qc-desktop-head">
        <div className="page__header">
          <div>
            <h1 className="page__title">{title}</h1>
            <p className="page__lead">{lead}</p>
          </div>
        </div>
      </div>
      <div className="qc-mhead">
        <h1>{title}</h1>
        <span className="grow" />
      </div>

      {ctx.notice ? (
        <div className="alert" role="status">
          <span aria-hidden="true">i</span>
          <div>{ctx.notice}</div>
        </div>
      ) : null}

      {ctx.visit ? (
        <div className="alert" role="status">
          <span aria-hidden="true">i</span>
          <div>
            <p className="alert__title">ผูกกับการรับลูกค้า {ctx.visit.visit_no}</p>
            <p>ระบบส่ง visit นี้ไปกับ api.quick_capture และคำนวณผู้สมัครซ้ำใหม่ที่ฝั่งฐานข้อมูล</p>
          </div>
        </div>
      ) : null}

      <form
        className={`qc${moreOpen ? " more-open" : ""}`}
        id="qc"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          run(walkInFlow ? "serve" : "save");
        }}
      >
        {state.formError ? (
          <div className="form-summary alert alert--danger" role="alert">
            <span aria-hidden="true">!</span>
            <div>{state.formError}</div>
          </div>
        ) : null}
        {state.formWarning ? (
          <div className="form-summary alert alert--warning" role="alert">
            <span aria-hidden="true">!</span>
            <div>{state.formWarning}</div>
          </div>
        ) : null}

        <div className="qc-layout">
          <div className="card qc-main">
            <div className="tabs qc-tabs" role="tablist" aria-label="ส่วนของฟอร์ม">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="tab qc-tab"
                  role="tab"
                  id={`qc-tab-${t.id}`}
                  aria-controls={`qc-panel-${t.id}`}
                  aria-selected={t.id === tab}
                  tabIndex={t.id === tab ? 0 : -1}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                  {tabHasError(t.id) ? (
                    <span className="badge badge--danger badge--square">
                      !<span className="sr-only">มีข้อผิดพลาด</span>
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            <div className="qc-panels">
              {/* ---------- แท็บ ข้อมูลพื้นฐาน ---------- */}
              <div
                className={`qc-panel${tab === "basic" ? " is-active" : ""}`}
                id="qc-panel-basic"
                role="tabpanel"
                aria-labelledby="qc-tab-basic"
              >
                <div className="form-grid">
                  <div className="field span-all qc-phone" data-field="phone">
                    <label className="label" htmlFor="qc-phone">
                      เบอร์โทรศัพท์{phoneRequired ? <span className="req">*</span> : null}
                    </label>
                    <div className="input-group">
                      <input
                        className="input"
                        type="tel"
                        id="qc-phone"
                        inputMode="tel"
                        autoComplete="off"
                        placeholder="เช่น 08X-XXX-XXXX"
                        aria-describedby="qc-phone-help"
                        aria-invalid={errors.phone ? true : undefined}
                        value={draft.phone}
                        onChange={(e) => set("phone", e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn--secondary"
                        disabled={pending}
                        aria-disabled={identified ? undefined : true}
                        data-tooltip={identified ? undefined : "กรอกเบอร์โทร LINE ID หรืออีเมลก่อน"}
                        onClick={() => run("check")}
                      >
                        ตรวจสอบซ้ำ
                      </button>
                    </div>
                    <p className="help" id="qc-phone-help">
                      บังคับเมื่อช่องทางที่ติดต่อมาเป็น Walk-in (หน้าร้าน) หรือโทรศัพท์ ·
                      ระบบตรวจข้อมูลซ้ำอัตโนมัติเมื่อกรอกเบอร์ครบ
                    </p>
                    {digitsOf(draft.phone).length >= 9 && !isThaiPhoneShape(draft.phone) ? (
                      <p className="warning-text">
                        เบอร์นี้ไม่ตรงรูปแบบเบอร์มือถือ (06 08 09 · 10 หลัก) หรือเบอร์บ้าน (02–07 · 9 หลัก)
                        ระบบจะบันทึกเป็นเบอร์ไม่ถูกต้อง
                      </p>
                    ) : null}
                    <FieldError id="qc-phone-error" message={errors.phone} />
                  </div>

                  <div className="field" data-field="first_name">
                    <label className="label" htmlFor="qc-first-name">
                      ชื่อ<span className="req">*</span>
                    </label>
                    <input
                      className="input"
                      type="text"
                      id="qc-first-name"
                      autoComplete="off"
                      aria-invalid={errors.first_name ? true : undefined}
                      value={draft.firstName}
                      onChange={(e) => set("firstName", e.target.value)}
                    />
                    <FieldError id="qc-first-name-error" message={errors.first_name} />
                  </div>

                  <div className="field" data-field="last_name">
                    <label className="label" htmlFor="qc-last-name">
                      นามสกุล
                    </label>
                    <input
                      className="input"
                      type="text"
                      id="qc-last-name"
                      autoComplete="off"
                      value={draft.lastName}
                      onChange={(e) => set("lastName", e.target.value)}
                    />
                  </div>

                  <div className="field" data-field="channel">
                    <label className="label" htmlFor="qc-channel">
                      ช่องทางที่ติดต่อมา<span className="req">*</span>
                    </label>
                    <select
                      className="select"
                      id="qc-channel"
                      disabled={channelLocked}
                      aria-invalid={errors.channel_code ? true : undefined}
                      value={draft.channelCode}
                      onChange={(e) => set("channelCode", e.target.value)}
                    >
                      <option value="">เลือกช่องทาง</option>
                      {refs.channels.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label_th}
                        </option>
                      ))}
                    </select>
                    {channelLocked ? <p className="help">ล็อกจากการรับลูกค้าที่เปิดอยู่</p> : null}
                    <FieldError id="qc-channel-error" message={errors.channel_code} />
                  </div>

                  <div className="field" data-field="branch">
                    <label className="label" htmlFor="qc-branch">
                      สาขา<span className="req">*</span>
                    </label>
                    <select
                      className="select"
                      id="qc-branch"
                      disabled={branchLocked}
                      aria-invalid={errors.branch_id ? true : undefined}
                      value={draft.branchId}
                      onChange={(e) => set("branchId", e.target.value)}
                    >
                      <option value="">เลือกสาขา</option>
                      {ctx.branches.map((b) => (
                        <option key={b.branch_id} value={b.branch_id}>
                          {b.name_th}
                        </option>
                      ))}
                    </select>
                    {branchLocked ? (
                      <p className="help">ล็อกตาม{ctx.visit ? "สาขาของการรับลูกค้า" : "สิทธิ์ของคุณ"}</p>
                    ) : null}
                    <FieldError id="qc-branch-error" message={errors.branch_id} />
                  </div>

                  <div className="field span-all" data-field="privacy">
                    <label className="checkbox" htmlFor="qc-privacy">
                      <input
                        type="checkbox"
                        id="qc-privacy"
                        checked={draft.privacy}
                        aria-invalid={errors.privacy ? true : undefined}
                        onChange={(e) => set("privacy", e.target.checked)}
                      />
                      <span className="checkbox__text">
                        แจ้งประกาศความเป็นส่วนตัวให้ลูกค้าแล้ว<span className="req">*</span>
                      </span>
                    </label>
                    <p className="help" data-field="privacyHelp">
                      ฉบับ {ctx.noticeVersion} · เนื้อความของประกาศ รอยืนยัน ·{" "}
                      {draft.channelCode === "WALK_IN" || !draft.channelCode
                        ? "Walk-in บันทึกเป็น “พนักงานบันทึก” · ช่องทางอื่นส่งลิงก์ประกาศให้ลูกค้าก่อนติ๊ก"
                        : "ส่งลิงก์ประกาศให้ลูกค้าก่อนติ๊ก · จะบันทึกเป็น “ส่งลิงก์ประกาศ”"}
                    </p>
                    <FieldError id="qc-privacy-error" message={errors.privacy} />
                  </div>
                </div>
              </div>

              {/* ---------- แท็บ ความสนใจ ---------- */}
              <div
                className={`qc-panel${tab === "interest" ? " is-active" : ""}`}
                id="qc-panel-interest"
                role="tabpanel"
                aria-labelledby="qc-tab-interest"
              >
                <div className="form-grid">
                  <div className="field span-all" data-field="interest">
                    <fieldset className="fieldset">
                      <legend>
                        ความสนใจ<span className="req">*</span>
                      </legend>
                      <div className="chip-group">
                        {refs.interestTypes.map((it) => (
                          <label className="chip-option" key={it.code}>
                            <input
                              type="radio"
                              name="qc-interest"
                              value={it.code}
                              checked={draft.interestCode === it.code}
                              onChange={() => set("interestCode", it.code)}
                            />
                            <span>{it.label_th}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <FieldError id="qc-interest-error" message={errors.interest_code} />
                  </div>

                  <div className="field span-all form-static" data-field="leadHelp">
                    <p className="help">
                      {!interest
                        ? "เลือกความสนใจเพื่อดูว่าระบบจะสร้าง Lead ให้หรือไม่"
                        : !interest.creates_lead
                          ? `ไม่สร้าง Lead (${interest.label_th})`
                          : `ระบบจะสร้าง Lead ให้อัตโนมัติ · ผู้รับผิดชอบ: คุณ · ติดตามครั้งแรก: ติดต่อกลับลูกค้า ภายใน 30 นาที${
                              channel ? ` · ช่องทาง ${channel.label_th}` : ""
                            }`}
                    </p>
                  </div>

                  <div className="field" data-field="product_type">
                    <label className="label" htmlFor="qc-product-type">
                      ประเภทสินค้า
                    </label>
                    <select
                      className="select"
                      id="qc-product-type"
                      value={draft.productTypeCode}
                      onChange={(e) => set("productTypeCode", e.target.value)}
                    >
                      <option value="">เลือกประเภทสินค้า</option>
                      {refs.productTypes.map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.label_th}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field" data-field="product_model">
                    <label className="label" htmlFor="qc-product-model">
                      รุ่นที่สนใจ
                    </label>
                    <input
                      className="input"
                      type="text"
                      id="qc-product-model"
                      maxLength={120}
                      placeholder="เช่น iPhone 17 Pro"
                      value={draft.productModel}
                      onChange={(e) => set("productModel", e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* ---------- แท็บ เพิ่มเติม ---------- */}
              <div
                className={`qc-panel${tab === "more" ? " is-active" : ""}`}
                id="qc-panel-more"
                role="tabpanel"
                aria-labelledby="qc-tab-more"
              >
                <div className="form-grid">
                  <div className="field span-all form-static" data-field="moreToggle">
                    <button
                      type="button"
                      className="btn btn--outline qc-more-toggle"
                      aria-expanded={moreOpen}
                      onClick={() => setMoreOpen((v) => !v)}
                    >
                      ข้อมูลเพิ่มเติม (ชื่อเล่น · LINE ID · อีเมล · จังหวัด · รู้จักร้านจาก)
                    </button>
                  </div>

                  <div className="field" data-field="nickname">
                    <label className="label" htmlFor="qc-nickname">
                      ชื่อเล่น
                    </label>
                    <input
                      className="input"
                      type="text"
                      id="qc-nickname"
                      value={draft.nickname}
                      onChange={(e) => set("nickname", e.target.value)}
                    />
                  </div>

                  <div className="field" data-field="line_id">
                    <label className="label" htmlFor="qc-line-id">
                      LINE ID
                    </label>
                    <input
                      className="input"
                      type="text"
                      id="qc-line-id"
                      autoComplete="off"
                      aria-invalid={errors.line_id ? true : undefined}
                      value={draft.lineId}
                      onChange={(e) => set("lineId", e.target.value)}
                    />
                    <FieldError id="qc-line-id-error" message={errors.line_id} />
                  </div>

                  <div className="field" data-field="email">
                    <label className="label" htmlFor="qc-email">
                      อีเมล
                    </label>
                    <input
                      className="input"
                      type="email"
                      id="qc-email"
                      autoComplete="off"
                      aria-invalid={errors.email ? true : undefined}
                      value={draft.email}
                      onChange={(e) => set("email", e.target.value)}
                    />
                    <FieldError id="qc-email-error" message={errors.email} />
                  </div>

                  <div className="field" data-field="province">
                    <label className="label" htmlFor="qc-province">
                      จังหวัด
                    </label>
                    <select
                      className="select"
                      id="qc-province"
                      value={draft.provinceCode}
                      onChange={(e) => set("provinceCode", e.target.value)}
                    >
                      <option value="">เลือกจังหวัด</option>
                      {refs.provinces.map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.label_th}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field" data-field="source">
                    <label className="label" htmlFor="qc-source">
                      รู้จักร้านจาก
                    </label>
                    <select
                      className="select"
                      id="qc-source"
                      value={draft.sourceCode}
                      onChange={(e) => set("sourceCode", e.target.value)}
                    >
                      <option value="">เลือกแหล่งที่มา</option>
                      {refs.sources.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.label_th}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field span-all" data-field="note">
                    <label className="label" htmlFor="qc-note">
                      รายละเอียดเพิ่มเติม (ถ้ามี)
                    </label>
                    <p className="pii-warn" role="note">
                      <span aria-hidden="true">!</span>
                      <span>ห้ามบันทึกเลขบัตรประชาชน รายได้ ข้อมูลสุขภาพหรือศาสนา</span>
                    </p>
                    <textarea
                      className="textarea"
                      id="qc-note"
                      rows={3}
                      maxLength={NOTE_MAX}
                      aria-invalid={errors.note ? true : undefined}
                      value={draft.note}
                      onChange={(e) => set("note", e.target.value)}
                    />
                    <span className="field__counter">
                      {int(draft.note.length)}/{int(NOTE_MAX)}
                    </span>
                    <FieldError id="qc-note-error" message={errors.note} />
                  </div>

                  {ctx.canConsent ? (
                    <>
                      <div className="field span-all" data-field="marketing">
                        <label className="checkbox" htmlFor="qc-marketing">
                          <input
                            type="checkbox"
                            id="qc-marketing"
                            checked={draft.marketing}
                            onChange={(e) => set("marketing", e.target.checked)}
                          />
                          <span className="checkbox__text">ลูกค้ายินยอมรับข่าวสาร/โปรโมชั่น (ไม่บังคับ)</span>
                        </label>
                        <FieldError id="qc-marketing-error" message={errors.marketing} />
                      </div>

                      {draft.marketing ? (
                        <>
                          <div className="field span-all" data-field="marketing_channels">
                            <fieldset className="fieldset">
                              <legend>
                                ช่องทางรับข่าวสาร<span className="req">*</span>
                              </legend>
                              <div className="chip-group">
                                {CONSENT_CHANNELS.map((c) => (
                                  <label className="checkbox" key={c.code}>
                                    <input
                                      type="checkbox"
                                      checked={draft.marketingChannels.includes(c.code)}
                                      onChange={(e) =>
                                        setDraft((d) => ({
                                          ...d,
                                          marketingChannels: e.target.checked
                                            ? [...d.marketingChannels, c.code]
                                            : d.marketingChannels.filter((x) => x !== c.code),
                                        }))
                                      }
                                    />
                                    <span className="checkbox__text">{c.label}</span>
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                            <FieldError id="qc-marketing-channels-error" message={errors.marketing_channels} />
                          </div>

                          <div className="field span-all" data-field="age_ok">
                            <label className="checkbox" htmlFor="qc-age-ok">
                              <input
                                type="checkbox"
                                id="qc-age-ok"
                                checked={draft.ageOk}
                                onChange={(e) => set("ageOk", e.target.checked)}
                              />
                              <span className="checkbox__text">
                                ลูกค้าอายุ 20 ปีขึ้นไป หรือผู้ใช้อำนาจปกครองยินยอม<span className="req">*</span>
                              </span>
                            </label>
                            <FieldError id="qc-age-ok-error" message={errors.age_ok} />
                          </div>
                        </>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <aside className="card qc-dup" id="qc-dup" aria-label="ตรวจพบข้อมูลที่อาจซ้ำ">
            <details open>
              <summary>
                <span className="qc-dup__title">
                  {dupFresh && candidates.length > 0
                    ? `พบข้อมูลที่อาจเป็นลูกค้าคนเดียวกัน ${candidates.length} รายการ`
                    : "ตรวจพบข้อมูลที่อาจซ้ำ"}
                </span>
              </summary>
              <div className="stack-2" style={{ marginTop: "var(--space-3)" }}>
                {dupPanel()}
                <p className="t-xs t-muted">
                  การตรวจซ้ำบันทึกเป็นประวัติการเข้าถึง (เก็บค่าที่ย่อแล้ว ไม่เก็บค่าจริง) · จำกัดจำนวนครั้งต่อชั่วโมง ·
                  ถึงตรวจไม่ได้ ระบบก็ยังตรวจข้อมูลซ้ำให้อีกครั้งตอนบันทึก
                </p>
              </div>
            </details>
          </aside>
        </div>

        {askCancel ? (
          <div className="alert alert--warning" role="alert">
            <span aria-hidden="true">!</span>
            <div className="stack-2">
              <p className="alert__title">ยกเลิกการเพิ่มลูกค้า? ข้อมูลที่กรอกจะหายไป</p>
              <div className="btn-group">
                <Link className="btn btn--danger-outline btn--sm" href={ctx.canReception ? "/reception" : "/dashboard"}>
                  ยกเลิกการเพิ่มลูกค้า
                </Link>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAskCancel(false)}>
                  กลับไปกรอกต่อ
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="qc-actions" id="qc-actions">
          {dirty ? (
            <button type="button" className="btn btn--ghost qc-cancel" onClick={() => setAskCancel(true)}>
              <span>ยกเลิก</span>
            </button>
          ) : (
            <Link className="btn btn--ghost qc-cancel" href={ctx.canReception ? "/reception" : "/dashboard"}>
              <span>ยกเลิก</span>
            </Link>
          )}
          <span className="spacer" />

          {ctx.mode === "visit" && !ctx.visit ? (
            <button
              type="button"
              className="btn btn--outline"
              disabled={pending}
              title="เปิดการรับลูกค้าโดยยังไม่ระบุตัวตน · ระบุชื่อและเบอร์ภายหลังได้จากหน้ารับลูกค้าเข้าร้าน"
              onClick={() => run("anon")}
            >
              <span className="qc-label-long">บันทึกแบบไม่ระบุตัวตน</span>
              <span className="qc-label-short">ไม่ระบุตัวตน</span>
            </button>
          ) : null}

          {ctx.mode === "customer"
            ? saveButton("บันทึก", "บันทึกลูกค้า", "accent", "save")
            : walkInFlow
              ? (
                  <>
                    {saveButton("รับเข้าคิว", "รับเข้าคิว", "secondary", "queue")}
                    {saveButton("เริ่มให้บริการ", "เริ่มให้บริการ", "accent", "serve")}
                  </>
                )
              : saveButton("บันทึก", "บันทึกลูกค้า", "accent", "save")}
        </div>
      </form>
    </>
  );
}
