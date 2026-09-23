"use client";

import { useActionState, useState } from "react";

import { openVisit, type ActionState } from "./actions";
import type { RefItem } from "./queries";

/* การ์ดซ้าย: รับลูกค้าเข้าร้าน

   ปุ่มสามปุ่มตาม prototype หน้า 07
   - รับลูกค้าด่วน  = ไม่ต้องกรอกอะไร กดแล้วเกิด visit ทันที (Capture First)
   - รับเข้าคิว     = walk-in ที่ยังไม่มีผู้รับ → สถานะ WAITING มีเลขคิว
   - เริ่มให้บริการ = รับเองเดี๋ยวนี้ → IN_SERVICE โดยผู้กดเป็นผู้รับ */

const initial: ActionState = { ok: false, message: null };

/* สถานะของปุ่มสร้าง visit ตามกติกาแสดงปุ่มตามสิทธิ์
   "allowed" = กดได้ · "mfa" = มีสิทธิ์แต่ยังไม่ยืนยันตัวตน (แสดงแบบกดไม่ได้พร้อมเหตุผล) ·
   "none" = ไม่มีสิทธิ์เลย (ซ่อนปุ่มทั้งหมด) */
export type CreateState = "allowed" | "mfa" | "none";

export function ReceptionForm({
  branchCode,
  interests,
  sources,
  createState,
}: {
  branchCode: string;
  interests: RefItem[];
  sources: RefItem[];
  createState: CreateState;
}) {
  const blocked = createState !== "allowed";
  const [state, action, pending] = useActionState(openVisit, initial);
  const [interest, setInterest] = useState("");

  return (
    <section className="card rc-form-col" aria-labelledby="rc-form-title">
      <div className="rc-card-head">
        <h2 className="card__title" id="rc-form-title">
          รับลูกค้าเข้าร้าน
        </h2>
        <span className="t-xs t-muted">visit เกิดเมื่อกด &ldquo;รับเข้าคิว&rdquo; หรือ &ldquo;เริ่มให้บริการ&rdquo; แม้ยังไม่รู้ตัวตน</span>
      </div>

      {state.message ? (
        <div className={`alert ${state.ok ? "alert--success" : "alert--danger"}`} role="status">
          <span aria-hidden="true">{state.ok ? "✓" : "!"}</span>
          <div>
            <p className="alert__title">{state.ok ? "บันทึกแล้ว" : "ทำรายการไม่สำเร็จ"}</p>
            <p>{state.message}</p>
          </div>
        </div>
      ) : null}

      <form action={action} noValidate>
        <input type="hidden" name="branchCode" value={branchCode} />
        <input type="hidden" name="interest_code" value={interest} />

        <div className="field">
          <label className="label" htmlFor="party_size">
            จำนวนลูกค้า
          </label>
          <input
            className="input"
            id="party_size"
            name="party_size"
            type="number"
            inputMode="numeric"
            min={1}
            defaultValue={1}
            style={{ maxWidth: "10ch" }}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="source_code">
            รู้จักร้านจาก
          </label>
          <select className="input" id="source_code" name="source_code" defaultValue="">
            <option value="">ไม่ระบุ</option>
            {sources.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label_th}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <span className="label" id="rc-interest-label">
            วัตถุประสงค์หลัก
          </span>
          <div className="row" role="group" aria-labelledby="rc-interest-label" style={{ flexWrap: "wrap", gap: "var(--space-1)" }}>
            {interests.map((i) => (
              <button
                type="button"
                key={i.code}
                className={`chip${interest === i.code ? " chip--selected" : ""}`}
                aria-pressed={interest === i.code}
                onClick={() => setInterest((cur) => (cur === i.code ? "" : i.code))}
              >
                {i.label_th}
              </button>
            ))}
          </div>
        </div>

        {createState === "none" ? null : (
        <div className="rc-actions">
          {/* ค่าของปุ่มที่กดถูกส่งไปกับฟอร์มโดยเบราว์เซอร์เอง (name/value ของ submitter)
              ห้ามใช้ state ตั้งค่าตอน onClick แล้วหวังว่าจะทันฟอร์ม — React อัปเดต state หลังจากฟอร์มถูกส่งไปแล้ว */}
          <button
            type="submit"
            name="intent"
            value="express"
            className="btn btn--outline btn--lg"
            aria-disabled={blocked || pending}
            disabled={pending}
          >
            รับลูกค้าด่วน
          </button>
          <button type="submit" name="intent" value="queue" className="btn btn--secondary btn--lg" aria-disabled={blocked || pending}
            disabled={pending}>
            รับเข้าคิว
          </button>
          <button type="submit" name="intent" value="service" className="btn btn--accent btn--lg" aria-disabled={blocked || pending}
            disabled={pending}>
            เริ่มให้บริการ
          </button>
        </div>
        )}

        {createState === "none" ? (
          <p className="help">บัญชีนี้ไม่มีสิทธิ์เปิด visit ในสาขานี้</p>
        ) : createState === "mfa" ? (
          <p className="help">ต้องยืนยันตัวตนสองขั้นตอน (MFA) ก่อน</p>
        ) : (
          <p className="help">
            <strong>รับลูกค้าด่วน</strong> = ไม่ต้องกรอกอะไรเลย สร้าง visit ทันทีแล้วเติมข้อมูลภายหลัง ·{" "}
            <strong>รับเข้าคิว</strong> = ให้เลขคิวไว้ก่อน ยังไม่มีผู้รับ · <strong>เริ่มให้บริการ</strong> = รับเองเดี๋ยวนี้
            <br />
            ยังไม่รู้ว่าลูกค้าเป็นใครก็กดได้เลย — เก็บก่อน เติมทีหลัง (Capture First–Enrich Later)
          </p>
        )}
      </form>
    </section>
  );
}
