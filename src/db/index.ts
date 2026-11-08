// src/db/index.ts
import { Platform } from 'react-native';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import * as schema from './schema';

let dbInstance: any;
let setupDatabaseFn: () => void;

if (Platform.OS === 'web') {
  // Web Fallback: Browser modern membatasi SharedArrayBuffer untuk operasi synchronous SQLite.
  // Fallback ini menggunakan localStorage browser sehingga aplikasi dapat langsung di-preview di Web tanpa error.
  const getWebStorage = (key: string): any[] => {
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  };

  const saveWebStorage = (key: string, data: any) => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(data));
      }
    } catch {}
  };

  const getWebIncomes = (): Record<string, any> => {
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem('expense_incomes') : null;
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  };

  const saveWebIncomes = (data: Record<string, any>) => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('expense_incomes', JSON.stringify(data));
      }
    } catch {}
  };

  const parseIncomeVal = (val: any): { nominal: number; anggaran: number } => {
    if (typeof val === 'number') {
      return { nominal: val, anggaran: 0 };
    }
    if (val && typeof val === 'object') {
      return {
        nominal: Number(val.nominal) || 0,
        anggaran: Number(val.anggaran) || 0,
      };
    }
    return { nominal: 0, anggaran: 0 };
  };

  setupDatabaseFn = () => {
    console.log('[Web DB] Menggunakan penyimpanan lokal web (localStorage)');
  };

  dbInstance = {
    select: (fields?: any) => ({
      from: (table: any) => {
        const executor = () => {
          if (table === schema.monthlyIncomes) {
            const incomes = getWebIncomes();
            return Object.entries(incomes).map(([periode, rawVal], idx) => {
              const val = parseIncomeVal(rawVal);
              return {
                id: idx + 1,
                periode,
                nominalPemasukan: val.nominal,
                batasAnggaran: val.anggaran,
              };
            });
          }
          if (table === schema.debts) {
            return getWebStorage('expense_debts');
          }
          if (table === schema.recurringExpenses) {
            return getWebStorage('expense_recurring');
          }
          const trxs = getWebStorage('expense_transactions');
          if (fields && fields.nama) {
            const unique = Array.from(new Set(trxs.map((t: any) => t.namaBarang))).map((nama) => ({ nama }));
            return unique;
          }
          return trxs;
        };

        let whereCondition: any = null;
        const chain: any = {
          orderBy: () => chain,
          groupBy: () => chain,
          where: (cond: any) => {
            whereCondition = cond;
            return chain;
          },
          then: (onfulfilled?: (val: any) => any, onrejected?: (err: any) => any) => {
            let res = executor();
            if (table === schema.monthlyIncomes && whereCondition) {
              const chunks = whereCondition?.queryChunks || [];
              const target =
                chunks.find((c: any) => typeof c === 'string' && /^\d{4}-\d{2}$/.test(c)) ||
                chunks.find((c: any) => typeof c?.value === 'string' && /^\d{4}-\d{2}$/.test(c.value))?.value;
              if (target) {
                res = res.filter((item: any) => item.periode === target);
              }
            }
            if (table === schema.debts && whereCondition) {
              const chunks = whereCondition?.queryChunks || [];
              const raw = chunks.map((c: any) => (typeof c === 'string' ? c : c?.value ?? '')).join('');
              if (raw.includes('is_lunas') && chunks.includes(0)) {
                res = res.filter((d: any) => !d.isLunas);
              }
            }
            return Promise.resolve(res).then(onfulfilled, onrejected);
          },
        };
        return chain;
      },
    }),
    insert: (table: any) => ({
      values: (data: any) => {
        if (table === schema.monthlyIncomes) {
          const incomes = getWebIncomes();
          const prev = parseIncomeVal(incomes[data.periode]);
          incomes[data.periode] = {
            nominal: data.nominalPemasukan !== undefined ? Number(data.nominalPemasukan) || 0 : prev.nominal,
            anggaran: data.batasAnggaran !== undefined ? Number(data.batasAnggaran) || 0 : prev.anggaran,
          };
          saveWebIncomes(incomes);
          return Promise.resolve([{ id: 1, ...data }]);
        }
        if (table === schema.debts) {
          const debtsList = getWebStorage('expense_debts');
          const newDebt = { id: Date.now(), isLunas: 0, ...data };
          debtsList.push(newDebt);
          saveWebStorage('expense_debts', debtsList);
          return Promise.resolve([newDebt]);
        }
        if (table === schema.recurringExpenses) {
          const recurList = getWebStorage('expense_recurring');
          const newRecur = { id: Date.now(), ...data };
          recurList.push(newRecur);
          saveWebStorage('expense_recurring', recurList);
          return Promise.resolve([newRecur]);
        }
        const trxs = getWebStorage('expense_transactions');
        const newRecord = {
          id: Date.now(),
          ...data,
        };
        trxs.unshift(newRecord);
        saveWebStorage('expense_transactions', trxs);
        return Promise.resolve([newRecord]);
      },
    }),
    update: (table: any) => ({
      set: (data: any) => ({
        where: (cond: any) => {
          try {
            const chunks = cond?.queryChunks || [];
            const id = chunks.find((c: any) => typeof c === 'number');
            if (id != null) {
              const storageKey =
              table === schema.debts
                ? 'expense_debts'
                : table === schema.recurringExpenses
                ? 'expense_recurring'
                : 'expense_transactions';
              const items = getWebStorage(storageKey);
              const idx = items.findIndex((t: any) => t.id === id);
              if (idx !== -1) {
                items[idx] = { ...items[idx], ...data };
                saveWebStorage(storageKey, items);
              }
            }
          } catch {}
          return Promise.resolve({ changes: 1 });
        },
      }),
    }),
    delete: (table: any) => ({
      where: (cond: any) => {
        try {
          const chunks = cond?.queryChunks || [];
          const id = chunks.find((c: any) => typeof c === 'number');
          if (id != null) {
            const storageKey =
              table === schema.debts
                ? 'expense_debts'
                : table === schema.recurringExpenses
                ? 'expense_recurring'
                : 'expense_transactions';
            let items = getWebStorage(storageKey);
            items = items.filter((t: any) => t.id !== id);
            saveWebStorage(storageKey, items);
          }
        } catch {}
        return Promise.resolve({ changes: 1 });
      },
    }),
    run: (query: any) => {
      try {
        const getLocalPeriod = () => {
          const d = new Date();
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        };
        const chunks = query?.queryChunks || [];
        const num = chunks.find((c: any) => typeof c === 'number');
        const rawSql = chunks.map((c: any) => (typeof c === 'string' ? c : c?.value || '')).join('');

        if (rawSql.includes('recurring_expenses')) {
          const recurList = getWebStorage('expense_recurring');
          const id = chunks.find((c: any) => typeof c === 'number');
          const str =
            chunks.find((c: any) => typeof c === 'string' && /^\d{4}-\d{2}$/.test(c)) ||
            chunks.find((c: any) => typeof c?.value === 'string' && /^\d{4}-\d{2}$/.test(c.value))?.value;
          if (id != null) {
            const idx = recurList.findIndex((r: any) => r.id === id);
            if (idx !== -1) {
              recurList[idx].bulanTerakhirDiproses = str || getLocalPeriod();
              saveWebStorage('expense_recurring', recurList);
            }
          }
        } else if (num && num > 0) {
          const targetPeriode =
            chunks.find((c: any) => typeof c === 'string' && /^\d{4}-\d{2}$/.test(c)) ||
            chunks.find((c: any) => typeof c?.value === 'string' && /^\d{4}-\d{2}$/.test(c.value))?.value ||
            getLocalPeriod();
          const incomes = getWebIncomes();
          const prev = parseIncomeVal(incomes[targetPeriode]);

          if (rawSql.includes('batas_anggaran')) {
            incomes[targetPeriode] = { ...prev, anggaran: num };
          } else {
            incomes[targetPeriode] = { ...prev, nominal: prev.nominal + num };
          }
          saveWebIncomes(incomes);
        }
      } catch {}
      return Promise.resolve({ changes: 1 });
    },
  };
} else {
  // Mobile (Android / iOS): Berjalan menggunakan engine native C++ SQLite tanpa SharedArrayBuffer
  const expoDb = SQLite.openDatabaseSync('expense.db');
  dbInstance = drizzle(expoDb, { schema });

  setupDatabaseFn = () => {
    expoDb.execSync(`
      CREATE TABLE IF NOT EXISTS monthly_incomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        periode TEXT NOT NULL UNIQUE,
        nominal_pemasukan INTEGER NOT NULL,
        batas_anggaran INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tanggal TEXT NOT NULL,
        nama_barang TEXT NOT NULL,
        nominal INTEGER NOT NULL,
        kategori TEXT NOT NULL,
        metode_pembayaran TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS recurring_expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nama_barang TEXT NOT NULL,
        nominal INTEGER NOT NULL,
        kategori TEXT NOT NULL,
        metode_pembayaran TEXT NOT NULL,
        tanggal_tagihan INTEGER NOT NULL,
        bulan_terakhir_diproses TEXT
      );
      CREATE TABLE IF NOT EXISTS debts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nama_kreditur TEXT NOT NULL,
        nominal INTEGER NOT NULL,
        tanggal_jatuh_tempo TEXT NOT NULL,
        is_lunas INTEGER DEFAULT 0
      );
    `);
  };
}

export const db = dbInstance;
export const setupDatabase = setupDatabaseFn;
