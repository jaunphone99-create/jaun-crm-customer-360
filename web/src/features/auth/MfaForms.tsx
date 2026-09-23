"use client";

import { useActionState } from "react";

import { ErrorAlert, OtpField } from "./AuthUi";
import { startTotpEnroll, verifyMfa, verifyTotpEnroll, type EnrollState, type FormState } from "./actions";

/* หน้า 01 ขั้นที่ 2 · ยืนยันตัวตนสองขั้นตอน และการลงทะเบียน TOTP ครั้งแรก
   ทุกการเรียก Supabase Auth เกิดฝั่ง server เพราะเซสชันเป็น cookie HttpOnly (ข้อ 9.8) */

const initialForm: FormState = { ok: false, message: null };
const initialEnroll: EnrollState = { ok: false, message: null };

/** ขั้นที่ 2: กรอกรหัส 6 หลักจากแอป Authenticator */
export function MfaVerifyForm() {
  const [state, action, pending] = useActionState(verifyMfa, initialForm);

  return (
    <form id="mfa-form" className="stack" action={action} noValidate>
      <ErrorAlert id="mfa-error" title="ยืนยันตัวตนไม่สำเร็จ" message={state.message} />
      <OtpField invalid={Boolean(state.message)} describedBy="mfa-error" />
      <button type="submit" className="btn btn--accent btn--lg btn--block" disabled={pending}>
        {pending ? "กำลังยืนยัน…" : "ยืนยันและเข้าสู่ระบบ"}
      </button>
    </form>
  );
}

/** ลงทะเบียน TOTP ครั้งแรก — QR และ secret มาจากฝั่ง server แสดงครั้งเดียว ไม่เก็บไว้ที่ใด */
export function TotpEnrollForm() {
  const [enroll, startAction, starting] = useActionState(startTotpEnroll, initialEnroll);
  const [verify, verifyAction, verifying] = useActionState(verifyTotpEnroll, initialForm);

  if (!enroll.ok || !enroll.factorId) {
    return (
      <>
        <ErrorAlert title="เริ่มลงทะเบียนไม่สำเร็จ" message={enroll.message} />
        <form className="stack" action={startAction}>
          <p className="t-sm">
            เปิดแอป Authenticator (เช่น Google Authenticator หรือ Microsoft Authenticator) บนโทรศัพท์ของคุณไว้ก่อน
            แล้วกดปุ่มด้านล่างเพื่อรับ QR สำหรับสแกน
          </p>
          <button type="submit" className="btn btn--accent btn--lg btn--block" disabled={starting}>
            {starting ? "กำลังเตรียม…" : "เริ่มลงทะเบียน"}
          </button>
        </form>
      </>
    );
  }

  /* qr_code ของ Supabase เป็น SVG — เวอร์ชันเก่าส่งมาเป็นเนื้อ SVG ล้วน ต้องเติมหัว data: เอง */
  const qrSrc = enroll.qrCode
    ? enroll.qrCode.startsWith("data:")
      ? enroll.qrCode
      : `data:image/svg+xml;utf-8,${encodeURIComponent(enroll.qrCode)}`
    : null;

  return (
    <>
      <div className="alert" role="note">
        <span aria-hidden="true">i</span>
        <div>
          <p className="alert__title">แสดงครั้งเดียว</p>
          <p>ถ้าปิดหน้านี้ก่อนยืนยันสำเร็จ ต้องเริ่มลงทะเบียนใหม่ · ระบบไม่เก็บ QR หรือรหัสลับนี้ไว้ที่ใด</p>
        </div>
      </div>

      {qrSrc ? (
        <div style={{ display: "grid", placeItems: "center" }}>
          {/* data: URI ของ SVG — ไม่ต้องผ่านตัวปรับขนาดรูปของ Next.js */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrSrc} alt="QR สำหรับสแกนด้วยแอป Authenticator" width={220} height={220} />
        </div>
      ) : null}

      {enroll.secret ? (
        <div className="field">
          <span className="label">สแกนไม่ได้? กรอกรหัสลับนี้ในแอปแทน</span>
          <p className="code" style={{ wordBreak: "break-all" }}>
            {enroll.secret}
          </p>
        </div>
      ) : null}

      <form className="stack" action={verifyAction} noValidate>
        <input type="hidden" name="factorId" value={enroll.factorId} />
        <ErrorAlert id="enroll-error" title="ยืนยันไม่สำเร็จ" message={verify.message} />
        <OtpField id="enroll-otp" invalid={Boolean(verify.message)} describedBy="enroll-error" />
        <button type="submit" className="btn btn--accent btn--lg btn--block" disabled={verifying}>
          {verifying ? "กำลังยืนยัน…" : "ยืนยันการลงทะเบียน"}
        </button>
      </form>

      <p className="help">
        เมื่อยืนยันสำเร็จ ระบบจะใช้แอปนี้เป็นตัวยืนยันตัวตนของบัญชีคุณ · ถ้าเปลี่ยนเครื่องหรือทำอุปกรณ์หาย
        ติดต่อผู้ดูแลข้อมูลธุรกิจเพื่อรีเซ็ต MFA
      </p>
    </>
  );
}
