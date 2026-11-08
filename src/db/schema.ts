import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const monthlyIncomes = sqliteTable('monthly_incomes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  periode: text('periode').notNull().unique(), 
  nominalPemasukan: integer('nominal_pemasukan').notNull(),
  batasAnggaran: integer('batas_anggaran').default(0), // FITUR 1: Budgeting
});

export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tanggal: text('tanggal').notNull(),
  namaBarang: text('nama_barang').notNull(),
  nominal: integer('nominal').notNull(),
  kategori: text('kategori').notNull(),
  metodePembayaran: text('metode_pembayaran').notNull(),
});

// FITUR 2: Pengeluaran Rutin (Recurring)
export const recurringExpenses = sqliteTable('recurring_expenses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  namaBarang: text('nama_barang').notNull(),
  nominal: integer('nominal').notNull(),
  kategori: text('kategori').notNull(),
  metodePembayaran: text('metode_pembayaran').notNull(),
  tanggalTagihan: integer('tanggal_tagihan').notNull(), // Tanggal 1-31
  bulanTerakhirDiproses: text('bulan_terakhir_diproses'), // Cth: "2026-10"
});

// FITUR 3: Pengingat Hutang
export const debts = sqliteTable('debts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  namaKreditur: text('nama_kreditur').notNull(), // Hutang ke siapa
  nominal: integer('nominal').notNull(),
  tanggalJatuhTempo: text('tanggal_jatuh_tempo').notNull(),
  isLunas: integer('is_lunas').default(0), // 0 = Belum, 1 = Lunas
});

export type MonthlyIncome = typeof monthlyIncomes.$inferSelect;
export type NewMonthlyIncome = typeof monthlyIncomes.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

export type RecurringExpense = typeof recurringExpenses.$inferSelect;
export type NewRecurringExpense = typeof recurringExpenses.$inferInsert;

export type Debt = typeof debts.$inferSelect;
export type NewDebt = typeof debts.$inferInsert;
