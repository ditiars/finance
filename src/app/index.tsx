import React, { useCallback, useState } from 'react';
import { Alert, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { db } from '../db';
import { monthlyIncomes, Transaction, transactions } from '../db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { getKategoriIcon } from '../constants/categories';

const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const categories = [
  { name: 'Makanan', amount: 1850000, percent: 55, color: 'bg-emerald-500' },
  { name: 'Transport', amount: 720000, percent: 21, color: 'bg-amber-400' },
  { name: 'Tagihan', amount: 520000, percent: 15, color: 'bg-sky-500' },
  { name: 'Belanja', amount: 310000, percent: 9, color: 'bg-rose-400' },
];
const bills = [
  { name: 'Internet rumah', date: 'Tiap tanggal 20', amount: 350000 },
  { name: 'Listrik', date: 'Tiap tanggal 25', amount: 170000 },
];
const debts = [
  { name: 'Raka', amount: 250000, due: 'Jatuh tempo 2 hari lagi', urgent: true },
  { name: 'Dina', amount: 150000, due: 'Jatuh tempo 18 Nov', urgent: false },
];

const formatRupiah = (value: number) => `Rp ${value.toLocaleString('id-ID')}`;

export default function DashboardScreen() {
  const [activeTab, setActiveTab] = useState<'home' | 'stats' | 'bills'>('home');
  const [history, setHistory] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState(0);
  const [income, setIncome] = useState(0);
  const [spent, setSpent] = useState(0);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [showTopUp, setShowTopUp] = useState(false);

  const currentPeriod = new Date().toISOString().slice(0, 7);
  const monthLabel = `${monthNames[new Date().getMonth()]} ${new Date().getFullYear()}`;

  const loadDashboardData = useCallback(async () => {
    try {
      const allTransactions: Transaction[] = await db.select().from(transactions).orderBy(desc(transactions.id));
      const incomeRows = await db.select().from(monthlyIncomes).where(eq(monthlyIncomes.periode, currentPeriod));
      const monthlyIncome = incomeRows[0]?.nominalPemasukan ?? 0;
      if (!incomeRows.length) await db.insert(monthlyIncomes).values({ periode: currentPeriod, nominalPemasukan: 0 });
      const monthlyTransactions = allTransactions.filter((item) => item.tanggal.startsWith(currentPeriod));
      const monthlySpent = monthlyTransactions.reduce((sum, item) => sum + item.nominal, 0);
      setHistory(monthlyTransactions.slice(0, 5)); setIncome(monthlyIncome); setSpent(monthlySpent); setBalance(monthlyIncome - monthlySpent);
    } catch (error) { console.error('Error memuat data dashboard:', error); }
  }, [currentPeriod]);

  useFocusEffect(useCallback(() => { loadDashboardData(); }, [loadDashboardData]));

  const handleTopUp = async () => {
    const amount = parseInt(topUpAmount.replace(/[^0-9]/g, ''), 10);
    if (!amount) return;
    await db.run(sql`UPDATE monthly_incomes SET nominal_pemasukan = nominal_pemasukan + ${amount} WHERE periode = ${currentPeriod}`);
    setTopUpAmount(''); setShowTopUp(false); loadDashboardData();
  };

  const renderHome = () => {
    const budget = income || 5000000;
    const progress = Math.min(spent / budget, 1);
    return <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
      <View className="flex-row items-center justify-between pt-5 pb-4">
        <View><Text className="text-xs font-bold uppercase tracking-widest text-emerald-700">Ringkasan bulan</Text><Text className="mt-1 text-2xl font-bold text-slate-900">{monthLabel}</Text></View>
        <View className="flex-row gap-2"><TouchableOpacity className="size-9 items-center justify-center rounded-full bg-white" accessibilityLabel="Bulan sebelumnya"><Text className="text-lg text-slate-500">‹</Text></TouchableOpacity><TouchableOpacity className="size-9 items-center justify-center rounded-full bg-white" accessibilityLabel="Bulan berikutnya"><Text className="text-lg text-slate-500">›</Text></TouchableOpacity></View>
      </View>
      <View className="rounded-[28px] bg-slate-950 p-6 shadow-lg"><View className="flex-row items-center justify-between"><Text className="text-sm font-medium text-slate-400">Sisa uang</Text><TouchableOpacity onPress={() => setShowTopUp(!showTopUp)} className="rounded-full bg-emerald-400 px-3 py-2"><Text className="text-xs font-bold text-slate-950">+ Saldo</Text></TouchableOpacity></View><Text className="mt-2 text-4xl font-bold tracking-tight text-white">{formatRupiah(balance)}</Text><View className="mt-6 flex-row gap-8 border-t border-slate-800 pt-4"><View><Text className="text-xs text-slate-500">Pemasukan</Text><Text className="mt-1 font-semibold text-emerald-300">{formatRupiah(income)}</Text></View><View><Text className="text-xs text-slate-500">Pengeluaran</Text><Text className="mt-1 font-semibold text-rose-300">-{formatRupiah(spent)}</Text></View></View>{showTopUp && <View className="mt-4 flex-row gap-2"><TextInput className="flex-1 rounded-xl bg-slate-800 px-3 py-2 text-white" placeholder="Jumlah saldo" placeholderTextColor="#94a3b8" keyboardType="numeric" value={topUpAmount} onChangeText={setTopUpAmount} /><TouchableOpacity onPress={handleTopUp} className="rounded-xl bg-white px-4 py-2"><Text className="font-bold text-slate-900">Isi</Text></TouchableOpacity></View>}</View>
      <View className="mt-5 rounded-3xl bg-white p-5"><View className="flex-row items-center justify-between"><View><Text className="text-base font-bold text-slate-900">Batas anggaran</Text><Text className="mt-1 text-xs text-slate-500">{formatRupiah(spent)} dari {formatRupiah(budget)}</Text></View><Text className={`font-bold ${progress > .9 ? 'text-rose-500' : 'text-emerald-600'}`}>{Math.round(progress * 100)}%</Text></View><View className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><View className={`h-full rounded-full ${progress > .9 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.max(progress * 100, 3)}%` }} /></View><Text className="mt-3 text-xs text-slate-500">{progress > .9 ? 'Anggaran hampir habis, yuk lebih hemat.' : 'Kamu masih di jalur yang aman bulan ini.'}</Text></View>
      <View className="mt-7 flex-row items-center justify-between"><Text className="text-xl font-bold text-slate-900">Transaksi terakhir</Text><Text className="text-xs font-semibold text-emerald-700">Lihat semua</Text></View>
      <View className="mt-3 gap-3">{history.length ? history.map((item) => <TouchableOpacity key={item.id} className="flex-row items-center rounded-2xl bg-white p-4" onLongPress={() => Platform.OS === 'web' && window.confirm(`Hapus ${item.namaBarang}?`) && db.delete(transactions).where(eq(transactions.id, item.id)).then(loadDashboardData)}><View className="size-11 items-center justify-center rounded-2xl bg-emerald-50"><Text className="text-xl">{getKategoriIcon(item.kategori)}</Text></View><View className="ml-3 flex-1"><Text className="font-bold text-slate-900">{item.namaBarang}</Text><Text className="mt-1 text-xs text-slate-500">{item.kategori}  ·  {item.tanggal.slice(8, 10)} Nov</Text></View><Text className="font-bold text-rose-500">-{formatRupiah(item.nominal)}</Text></TouchableOpacity>) : <Text className="rounded-2xl bg-white p-6 text-center text-slate-400">Belum ada transaksi bulan ini.</Text>}</View>
    </ScrollView>;
  };

  const renderStats = () => <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 120 }}><Text className="pt-6 text-xs font-bold uppercase tracking-widest text-emerald-700">Analisis pengeluaran</Text><Text className="mt-1 text-3xl font-bold text-slate-900">Ke mana uangmu pergi?</Text><View className="mt-5 rounded-3xl bg-emerald-600 p-5"><Text className="text-sm text-emerald-100">Total pengeluaran November</Text><Text className="mt-2 text-3xl font-bold text-white">{formatRupiah(spent || 3400000)}</Text><Text className="mt-2 text-xs text-emerald-100">55% digunakan untuk kebutuhan harian</Text></View><Text className="mt-8 text-xl font-bold text-slate-900">Kategori</Text><View className="mt-3 gap-4">{categories.map((category) => <View key={category.name} className="rounded-2xl bg-white p-4"><View className="flex-row justify-between"><Text className="font-bold text-slate-900">{category.name}</Text><Text className="font-bold text-slate-500">{category.percent}%</Text></View><View className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><View className={`h-full rounded-full ${category.color}`} style={{ width: `${category.percent}%` }} /></View><Text className="mt-2 text-xs text-slate-500">{formatRupiah(category.amount)}</Text></View>)}</View></ScrollView>;

  const renderBills = () => <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 120 }}><Text className="pt-6 text-xs font-bold uppercase tracking-widest text-emerald-700">Kewajiban</Text><Text className="mt-1 text-3xl font-bold text-slate-900">Tagihan & catatan</Text><View className="mt-8 flex-row items-center justify-between"><Text className="text-xl font-bold text-slate-900">Tagihan rutin bulanan</Text><TouchableOpacity><Text className="font-bold text-emerald-700">+ Tambah</Text></TouchableOpacity></View><View className="mt-3 gap-3">{bills.map((bill) => <View key={bill.name} className="flex-row items-center rounded-2xl bg-white p-4"><View className="size-11 items-center justify-center rounded-2xl bg-sky-50"><Text className="text-lg text-sky-600">↻</Text></View><View className="ml-3 flex-1"><Text className="font-bold text-slate-900">{bill.name}</Text><Text className="mt-1 text-xs text-slate-500">{bill.date}</Text></View><Text className="font-bold text-slate-900">{formatRupiah(bill.amount)}</Text></View>)}</View><View className="mt-8 flex-row items-center justify-between"><Text className="text-xl font-bold text-slate-900">Catatan hutang</Text><TouchableOpacity><Text className="font-bold text-emerald-700">+ Tambah</Text></TouchableOpacity></View><View className="mt-3 gap-3">{debts.map((debt) => <View key={debt.name} className={`flex-row items-center rounded-2xl p-4 ${debt.urgent ? 'border border-rose-100 bg-rose-50' : 'bg-white'}`}><View className={`size-11 items-center justify-center rounded-2xl ${debt.urgent ? 'bg-rose-100' : 'bg-amber-50'}`}><Text className="font-bold text-slate-700">{debt.name.slice(0, 1)}</Text></View><View className="ml-3 flex-1"><Text className="font-bold text-slate-900">{debt.name}</Text><Text className={`mt-1 text-xs ${debt.urgent ? 'font-bold text-rose-500' : 'text-slate-500'}`}>{debt.due}</Text></View><Text className="font-bold text-slate-900">{formatRupiah(debt.amount)}</Text></View>)}</View></ScrollView>;

  return <View className="flex-1 bg-[#f4f7f5]"><View className="flex-1">{activeTab === 'home' ? renderHome() : activeTab === 'stats' ? renderStats() : renderBills()}</View><TouchableOpacity onPress={() => router.push('/add')} className="absolute bottom-24 right-5 size-16 items-center justify-center rounded-full bg-emerald-500 shadow-lg"><Text className="text-4xl font-light leading-none text-slate-950">+</Text></TouchableOpacity><View className="flex-row justify-around border-t border-slate-200 bg-white px-3 pb-7 pt-3"><TouchableOpacity onPress={() => setActiveTab('home')} className="items-center gap-1 px-5"><Text className={`text-xl ${activeTab === 'home' ? 'text-emerald-600' : 'text-slate-400'}`}>⌂</Text><Text className={`text-xs font-bold ${activeTab === 'home' ? 'text-emerald-700' : 'text-slate-400'}`}>Beranda</Text></TouchableOpacity><TouchableOpacity onPress={() => setActiveTab('stats')} className="items-center gap-1 px-5"><Text className={`text-xl ${activeTab === 'stats' ? 'text-emerald-600' : 'text-slate-400'}`}>▥</Text><Text className={`text-xs font-bold ${activeTab === 'stats' ? 'text-emerald-700' : 'text-slate-400'}`}>Statistik</Text></TouchableOpacity><TouchableOpacity onPress={() => setActiveTab('bills')} className="items-center gap-1 px-5"><Text className={`text-xl ${activeTab === 'bills' ? 'text-emerald-600' : 'text-slate-400'}`}>▤</Text><Text className={`text-xs font-bold ${activeTab === 'bills' ? 'text-emerald-700' : 'text-slate-400'}`}>Tagihan</Text></TouchableOpacity></View></View>;
}
