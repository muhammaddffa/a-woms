// Daftar permission terpusat. Dipakai oleh seed (mengisi tabel permissions)
// dan oleh guard/decorator, contoh:
//   @Permissions(PERMISSIONS.CASH_ADVANCE_APPROVE.code)
// Menambah fitur baru = menambah permission di sini, lalu jalankan seed lagi.

export const PERMISSIONS = {
  DASHBOARD_VIEW: {
    code: 'dashboard:view',
    module: 'dashboard',
    description: 'Melihat dashboard ringkasan',
  },
  MASTER_MANAGE: {
    code: 'master:manage',
    module: 'master',
    description: 'Mengelola data master (customer, jenis biaya, truk, supir)',
  },

  WORK_ORDER_VIEW: {
    code: 'work_order:view',
    module: 'work_order',
    description: 'Melihat work order',
  },
  WORK_ORDER_CREATE: {
    code: 'work_order:create',
    module: 'work_order',
    description: 'Membuat work order',
  },
  WORK_ORDER_UPDATE: {
    code: 'work_order:update',
    module: 'work_order',
    description: 'Mengubah work order',
  },
  WORK_ORDER_CANCEL: {
    code: 'work_order:cancel',
    module: 'work_order',
    description: 'Membatalkan work order',
  },

  PLANNED_COST_MANAGE: {
    code: 'planned_cost:manage',
    module: 'costing',
    description: 'Mengisi biaya rencana per item',
  },
  WORK_ORDER_COST_CHECK: {
    code: 'work_order_cost:check',
    module: 'costing',
    description: 'Mengecek biaya ops WO',
  },
  WORK_ORDER_COST_APPROVE: {
    code: 'work_order_cost:approve',
    module: 'costing',
    description: 'Menyetujui biaya ops WO',
  },
  CHARGE_VIEW_HIDDEN: {
    code: 'charge:view_hidden',
    module: 'costing',
    description: 'Melihat tarif yang disembunyikan',
  },

  CASH_ADVANCE_VIEW: {
    code: 'cash_advance:view',
    module: 'cash_advance',
    description: 'Melihat uang jalan dan cashbon',
  },
  CASH_ADVANCE_CREATE: {
    code: 'cash_advance:create',
    module: 'cash_advance',
    description: 'Membuat pengajuan uang jalan/cashbon',
  },
  CASH_ADVANCE_CHECK: {
    code: 'cash_advance:check',
    module: 'cash_advance',
    description: 'Mengecek pengajuan dan LPJ',
  },
  CASH_ADVANCE_APPROVE: {
    code: 'cash_advance:approve',
    module: 'cash_advance',
    description: 'Menyetujui pengajuan dana',
  },
  CASH_ADVANCE_PAY: {
    code: 'cash_advance:pay',
    module: 'cash_advance',
    description: 'Mencairkan dana',
  },
  CASH_ADVANCE_SUBMIT_REPORT: {
    code: 'cash_advance:submit_report',
    module: 'cash_advance',
    description: 'Mengisi LPJ',
  },
  CASH_ADVANCE_APPROVE_REPORT: {
    code: 'cash_advance:approve_report',
    module: 'cash_advance',
    description: 'Menyetujui LPJ',
  },

  ADVANCE_RETURN_CREATE: {
    code: 'advance_return:create',
    module: 'cash_advance',
    description: 'Mencatat pengembalian sisa dana',
  },
  ADVANCE_RETURN_RECEIVE: {
    code: 'advance_return:receive',
    module: 'cash_advance',
    description: 'Mengonfirmasi penerimaan pengembalian',
  },

  PROFIT_VIEW: {
    code: 'profit:view',
    module: 'report',
    description: 'Melihat profit WO',
  },

  USER_MANAGE: {
    code: 'user:manage',
    module: 'admin',
    description: 'Mengelola user',
  },
  ROLE_MANAGE: {
    code: 'role:manage',
    module: 'admin',
    description: 'Mengelola role dan permission',
  },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export type PermissionCode = (typeof PERMISSIONS)[PermissionKey]['code'];

export const PERMISSION_LIST = Object.values(PERMISSIONS);
