/* ป้ายภาษาไทยของรหัสที่ใช้ซ้ำหลายหน้า — ค่าทั้งหมดมาจาก CANONICAL
   ถ้าหน้าไหนต้องการป้ายที่ฐานข้อมูลมีอยู่แล้ว (ref.* มี label_th) ให้ใช้ค่าจากฐานข้อมูล
   ไฟล์นี้มีไว้เฉพาะรหัสที่ frontend ต้องแสดงโดยไม่ได้ query มา */

/** บทบาท (CANONICAL ข้อ 7) */
export const ROLE_LABEL: Record<string, string> = {
  STAFF: "พนักงานขาย/แอดมิน",
  SUPERVISOR: "หัวหน้าทีม",
  BRANCH_MANAGER: "ผู้จัดการสาขา",
  MARKETING: "ฝ่ายการตลาด",
  OPERATIONS: "ฝ่ายปฏิบัติการ",
  BUSINESS_ADMIN: "ผู้ดูแลข้อมูลธุรกิจ",
  EXECUTIVE: "ผู้บริหาร",
  SYSTEM_ADMIN: "ผู้ดูแลระบบ (IT)",
};

export const roleLabel = (code: string): string => ROLE_LABEL[code] ?? code;

/** สถานะบัญชีพนักงาน (CANONICAL ข้อ 7.1) */
export const STAFF_STATUS_LABEL: Record<string, string> = {
  INVITED: "รอเปิดใช้งาน",
  ACTIVE: "ใช้งานอยู่",
  SUSPENDED: "ระงับชั่วคราว",
  DISABLED: "ปิดใช้งาน",
};
