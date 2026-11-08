import { desc, eq, sql } from 'drizzle-orm';
import { db } from './index';
import { transactions, monthlyIncomes, NewTransaction } from './schema';

export async function fetchTransactions() {
  return db.select().from(transactions).orderBy(desc(transactions.id));
}

export async function insertTransaction(data: NewTransaction) {
  return db.insert(transactions).values(data).returning();
}

export async function removeTransaction(id: number) {
  return db.delete(transactions).where(eq(transactions.id, id));
}

export async function fetchTotalExpenses() {
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${transactions.nominal}), 0)` })
    .from(transactions);
  return Number(result[0]?.total ?? 0);
}

export async function fetchMonthlyIncome(periode: string) {
  const rows = await db
    .select()
    .from(monthlyIncomes)
    .where(eq(monthlyIncomes.periode, periode))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertMonthlyIncome(periode: string, nominal: number) {
  return db
    .insert(monthlyIncomes)
    .values({ periode, nominalPemasukan: nominal })
    .onConflictDoUpdate({
      target: monthlyIncomes.periode,
      set: { nominalPemasukan: nominal },
    });
}

