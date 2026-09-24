// Piezas compartidas del back office (empresa, admin, perfil, privacidad).
export { Sheet } from './Sheet';
export type { SheetProps } from './Sheet';
export { RoleGate, AccessDenied } from './RoleGate';
export { Notice } from './Notice';
export type { NoticeTone, NoticeProps } from './Notice';
export { saveTextFile, describeSave, toCSV, fileStamp } from './exportFile';
export type { SaveResult } from './exportFile';
export { openDocument } from './openDocument';
export {
  fetchAllBookings,
  fetchActiveEmergencyAlerts,
  bookingTime,
  isPaid,
  money,
  ACTIVE_STATUSES,
} from './platformData';
export type { EmergencyAlertRow } from './platformData';
export {
  fullName,
  formatDate,
  formatDateTime,
  todayEyebrow,
  shortId,
  roleLabel,
  ROLE_LABEL,
  kycMeta,
  plural,
  percent,
} from './format';
export { exportMyData } from './exportMyData';
