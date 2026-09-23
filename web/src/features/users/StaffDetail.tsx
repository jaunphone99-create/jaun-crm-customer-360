import Link from "next/link";

import type { Access } from "@/lib/access";
import { dateTime } from "@/lib/format/date";
import { DASH } from "@/lib/format/number";
import { roleLabel, STAFF_STATUS_LABEL } from "@/lib/labels";

import { resetMfaState, revokeState, staffActionState, topScope } from "./scope";
import { AssignRoleForm, DisableForm, ProfileForm, ResetMfaForm, RevokeRoleForm } from "./StaffForms";
import type { AssignOption, StaffRow } from "./types";

/* การ์ดรายละเอียดบัญชีหนึ่งคน — เปิดด้วย ?staff=ST-NNNN จึงแชร์ลิงก์ให้ดูด้วยกันได้

   ทุกส่วนที่ "ทำอะไรกับบัญชีนี้ได้" ถูกตัดสินสองชั้น:
   ชั้นแรกที่นี่เพื่อไม่ให้ผู้ใช้กรอกฟอร์มยาวแล้วไปโดนปฏิเสธ
   ชั้นจริงที่ฐานข้อมูล (app.staff_admin_denial · app.assign_role_denial) ซึ่งข้ามไม่ได้ */

/* ป้ายบทบาทถูกส่งเป็นข้อมูลเข้า client component เพราะ roleLabel เป็นฟังก์ชัน ส่งข้ามขอบ server/client ไม่ได้ */
const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  [
    "STAFF",
    "SUPERVISOR",
    "BRANCH_MANAGER",
    "MARKETING",
    "OPERATIONS",
    "BUSINESS_ADMIN",
    "EXECUTIVE",
    "SYSTEM_ADMIN",
  ].map((code) => [code, roleLabel(code)])
);

const DL_STYLE = {
  display: "grid",
  gridTemplateColumns: "max-content minmax(0, 1fr)",
  gap: "var(--space-2) var(--space-4)",
  margin: 0,
  fontSize: "var(--fs-sm)",
} as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt style={{ color: "var(--text-secondary)" }}>{label}</dt>
      <dd style={{ margin: 0, minWidth: 0, overflowWrap: "anywhere" }}>{children}</dd>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} style={{ marginTop: "var(--space-5)" }}>
      <h3 className="section__title">{title}</h3>
      {children}
    </section>
  );
}

export function StaffDetail({
  access,
  staff,
  branchNames,
  assignOptions,
  closeHref,
}: {
  access: Access;
  staff: StaffRow;
  branchNames: Record<string, string>;
  assignOptions: AssignOption[];
  closeHref: { pathname: "/users"; query: Record<string, string> };
}) {
  const updateState = staffActionState(access, "user.update", staff, {
    selfText: "แก้โปรไฟล์ของตนเองที่หน้าตั้งค่าบัญชี",
  });
  const assignState = staffActionState(access, "role.assign", staff, { selfText: "มอบบทบาทให้ตนเองไม่ได้" });
  const disableState = staffActionState(access, "user.disable", staff, { selfText: "ปิดใช้งานตนเองไม่ได้" });
  const mfaState = resetMfaState(access, staff);
  const canEditEmail = topScope(access, "user.update") === "ORGANIZATION";
  const label = `${staff.display_name} (${staff.staff_code})`;

  return (
    <section className="card" aria-labelledby="u-detail-title" style={{ marginTop: "var(--space-5)" }}>
      <div className="card__header">
        <div>
          <h2 className="card__title" id="u-detail-title">
            {label}
          </h2>
          <p className="card__subtitle">จัดการบทบาท โปรไฟล์ และสถานะของบัญชีนี้</p>
        </div>
        <Link className="btn btn--ghost btn--sm" href={closeHref} scroll={false}>
          ปิด
        </Link>
      </div>

      <dl style={DL_STYLE}>
        <Row label="สถานะ">{STAFF_STATUS_LABEL[staff.status] ?? staff.status}</Row>
        <Row label="อีเมล">{staff.email}</Row>
        <Row label="ชื่อเล่น">{staff.nickname ?? DASH}</Row>
        <Row label="เบอร์โทร">{staff.phone ?? DASH}</Row>
        <Row label="รหัสพนักงาน (HR)">{staff.employee_code ?? DASH}</Row>
        <Row label="ทีม">
          {staff.teams.length
            ? staff.teams.map((t) => `${t.code}${t.is_leader ? " (หัวหน้า)" : ""}`).join(" · ")
            : DASH}
        </Row>
        {staff.status === "INVITED" ? (
          <Row label="คำเชิญหมดอายุ">{dateTime(staff.invite_expires_at)}</Row>
        ) : null}
      </dl>

      <Section title="บทบาทที่มีผล">
        {staff.roles.length === 0 ? (
          <p className="t-sm t-muted">
            {staff.status === "DISABLED"
              ? "บทบาททั้งหมดสิ้นสุดเมื่อปิดใช้งาน"
              : "ยังไม่มีบทบาท — บทบาทของคำเชิญจะมีผลเมื่อบัญชีเปิดใช้งาน"}
          </p>
        ) : (
          <div className="stack-2">
            {staff.roles.map((r) => {
              const scope = r.branch_id ? (branchNames[r.branch_id] ?? r.branch_id) : "องค์กร";
              const text = `${roleLabel(r.role_code)} @ ${scope}`;
              const state = revokeState(access, staff, r.role_code, r.branch_id);
              return (
                <div
                  key={r.assignment_id}
                  className="row-between"
                  style={{ padding: "var(--space-2) 0", borderBottom: "1px solid var(--border-subtle)" }}
                >
                  <span>{text}</span>
                  {state.visible ? (
                    state.allowed ? (
                      <RevokeRoleForm assignmentId={r.assignment_id} roleText={text} />
                    ) : (
                      <span className="help">{state.reason}</span>
                    )
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {assignState.visible ? (
        <Section title="มอบบทบาท">
          <AssignRoleForm
            staffId={staff.staff_id}
            options={assignState.allowed ? assignOptions : []}
            roleLabels={ROLE_LABELS}
            blockedReason={assignState.reason}
          />
        </Section>
      ) : null}

      {updateState.visible ? (
        <Section title="แก้ไขโปรไฟล์">
          <ProfileForm
            staff={{
              staff_id: staff.staff_id,
              display_name: staff.display_name,
              nickname: staff.nickname,
              phone: staff.phone,
              employee_code: staff.employee_code,
              email: staff.email,
            }}
            canEditEmail={canEditEmail}
            blockedReason={updateState.reason}
          />
        </Section>
      ) : null}

      {mfaState.visible ? (
        <Section title="รีเซ็ตการยืนยันตัวตนสองขั้นตอน">
          <ResetMfaForm staffId={staff.staff_id} blockedReason={mfaState.reason} />
        </Section>
      ) : null}

      {disableState.visible && staff.status !== "DISABLED" ? (
        <Section title="ปิดใช้งานบัญชี">
          <DisableForm staffId={staff.staff_id} staffLabel={label} blockedReason={disableState.reason} />
        </Section>
      ) : null}

      <p className="help" style={{ marginTop: "var(--space-4)" }}>
        ทุกการเชิญ แก้ไข ปิดใช้งาน มอบ ถอน ยื่น และตัดสิน ถูกบันทึกประวัติพร้อมเหตุผล (ข้อ 9.5) · ห้ามลบบัญชี
      </p>
    </section>
  );
}
