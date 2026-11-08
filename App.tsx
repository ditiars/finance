import './global.css';
import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, ScrollView, TouchableOpacity, TextInput, Alert, Platform, Share } from 'react-native';
import { db, setupDatabase } from './src/db';
import {
  transactions,
  monthlyIncomes,
  debts,
  recurringExpenses,
  Transaction,
  Debt,
  RecurringExpense,
} from './src/db/schema';
import { desc, eq, sql } from 'drizzle-orm';

const KATEGORI_LIST = [
  { nama: 'Makanan', icon: '🍔', color: '#f59e0b', bg: '#fef3c7' },
  { nama: 'Transport', icon: '🚗', color: '#3b82f6', bg: '#dbeafe' },
  { nama: 'Belanja', icon: '🛍️', color: '#ec4899', bg: '#fce7f3' },
  { nama: 'Tagihan', icon: '⚡', color: '#8b5cf6', bg: '#ede9fe' },
  { nama: 'Hiburan', icon: '☕', color: '#10b981', bg: '#d1fae5' },
  { nama: 'Lainnya', icon: '📦', color: '#6b7280', bg: '#f3f4f6' },
];

const METODE_LIST = [
  { nama: 'Tunai', icon: '💵' },
  { nama: 'QRIS', icon: '📱' },
  { nama: 'Transfer', icon: '💳' },
  { nama: 'E-Wallet', icon: '👛' },
];

export default function App() {
  // Tab Navigasi: 'dashboard' | 'analytics' | 'bills'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'bills'>('dashboard');

  // Periode yang dipilih (Format: "YYYY-MM")
  const [selectedPeriode, setSelectedPeriode] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Modal Visibility States
  const [isAddingTrx, setIsAddingTrx] = useState(false);
  const [isBudgetModal, setIsBudgetModal] = useState(false);
  const [isDebtModal, setIsDebtModal] = useState(false);
  const [isTopUpModal, setIsTopUpModal] = useState(false);
  const [isRecurringModal, setIsRecurringModal] = useState(false);

  // Form States: Transaksi
  const [namaBarang, setNamaBarang] = useState('');
  const [nominalTrx, setNominalTrx] = useState('');
  const [kategori, setKategori] = useState(KATEGORI_LIST[0].nama);
  const [metode, setMetode] = useState(METODE_LIST[0].nama);

  // Form States: Budget & Top Up
  const [inputBudget, setInputBudget] = useState('');
  const [inputTopUp, setInputTopUp] = useState('');

  // Form States: Hutang
  const [namaKreditur, setNamaKreditur] = useState('');
  const [nominalHutang, setNominalHutang] = useState('');
  const [jatuhTempoTanggal, setJatuhTempoTanggal] = useState('');

  // Filter Tampilan Hutang: 'bulan' (Jatuh tempo bulan terpilih) | 'semua' (Semua hutang aktif) | 'lunas' (Riwayat lunas)
  const [debtFilter, setDebtFilter] = useState<'bulan' | 'semua' | 'lunas'>('bulan');

  // Form States: Tagihan Rutin
  const [namaRutin, setNamaRutin] = useState('');
  const [nominalRutin, setNominalRutin] = useState('');
  const [tanggalTagihan, setTanggalTagihan] = useState('20');
  const [kategoriRutin, setKategoriRutin] = useState('Tagihan');
  const [metodeRutin, setMetodeRutin] = useState('Transfer');

  // Data States
  const [history, setHistory] = useState<Transaction[]>([]);
  const [hutangList, setHutangList] = useState<Debt[]>([]);
  const [recurringList, setRecurringList] = useState<RecurringExpense[]>([]);
  const [sisaUang, setSisaUang] = useState(0);
  const [totalPemasukan, setTotalPemasukan] = useState(0);
  const [totalPengeluaran, setTotalPengeluaran] = useState(0);
  const [batasAnggaran, setBatasAnggaran] = useState(0);

  useEffect(() => {
    setupDatabase();
    loadDashboardData();
    checkRecurringExpenses();
  }, [selectedPeriode]);

  // Format Nama Bulan & Tahun (contoh: "November 2026")
  const formattedPeriode = useMemo(() => {
    const [year, month] = selectedPeriode.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  }, [selectedPeriode]);

  // Navigasi Ganti Bulan (Aman dari pergeseran zona waktu)
  const handlePrevMonth = () => {
    let [year, month] = selectedPeriode.split('-').map(Number);
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    const padMonth = String(month).padStart(2, '0');
    setSelectedPeriode(`${year}-${padMonth}`);
  };

  const handleNextMonth = () => {
    let [year, month] = selectedPeriode.split('-').map(Number);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const padMonth = String(month).padStart(2, '0');
    setSelectedPeriode(`${year}-${padMonth}`);
  };

  // 1. Logika Pengeluaran Rutin Otomatis
  const checkRecurringExpenses = async () => {
    try {
      const today = new Date();
      const currentDay = today.getDate();
      const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

      const rutins: RecurringExpense[] = await db.select().from(recurringExpenses);
      setRecurringList(rutins);

      for (const rutin of rutins) {
        if (currentDay >= rutin.tanggalTagihan && rutin.bulanTerakhirDiproses !== currentMonth) {
          await db.insert(transactions).values({
            tanggal: new Date().toISOString(),
            namaBarang: rutin.namaBarang + ' (Otomatis)',
            nominal: rutin.nominal,
            kategori: rutin.kategori,
            metodePembayaran: rutin.metodePembayaran,
          });

          await db.run(
            sql`UPDATE recurring_expenses SET bulan_terakhir_diproses = ${currentMonth} WHERE id = ${rutin.id}`
          );
        }
      }
    } catch (e) {
      console.error('Error tagihan rutin:', e);
    }
  };

  // 2. Muat Data Berdasarkan Periode Terpilih
  const loadDashboardData = async () => {
    try {
      const trxData: Transaction[] = await db
        .select()
        .from(transactions)
        .orderBy(desc(transactions.tanggal));
      setHistory(trxData);

      const hutangData: Debt[] = await db.select().from(debts);
      setHutangList(hutangData);

      const rutins: RecurringExpense[] = await db.select().from(recurringExpenses);
      setRecurringList(rutins);

      const incomes = await db
        .select()
        .from(monthlyIncomes)
        .where(eq(monthlyIncomes.periode, selectedPeriode));

      let pemasukan = 0;
      let anggaran = 0;

      const currentIncome =
        incomes.find((inc: any) => inc.periode === selectedPeriode) || (incomes.length > 0 ? incomes[0] : null);

      if (!currentIncome) {
        await db.insert(monthlyIncomes).values({ periode: selectedPeriode, nominalPemasukan: 0, batasAnggaran: 0 });
      } else {
        pemasukan = Number(currentIncome.nominalPemasukan) || 0;
        anggaran = Number(currentIncome.batasAnggaran) || 0;
      }

      // Filter pengeluaran yang jatuh pada periode bulan terpilih
      const currentMonthTrx = trxData.filter((t: Transaction) => t.tanggal.startsWith(selectedPeriode));
      const pengeluaran = currentMonthTrx.reduce(
        (sum: number, item: Transaction) => sum + (Number(item.nominal) || 0),
        0
      );

      const sisa = pemasukan - pengeluaran;
      setTotalPemasukan(pemasukan);
      setTotalPengeluaran(pengeluaran);
      setSisaUang(isNaN(sisa) ? 0 : sisa);
      setBatasAnggaran(isNaN(anggaran) ? 0 : anggaran);
    } catch (error) {
      console.error('Error load dashboard:', error);
    }
  };

  // 3. Analisis Kategori untuk Bulan Terpilih
  const categoryAnalysis = useMemo(() => {
    const currentMonthTrx = history.filter((t: Transaction) => t.tanggal.startsWith(selectedPeriode));
    const totals: Record<string, number> = {};

    currentMonthTrx.forEach((trx: Transaction) => {
      totals[trx.kategori] = (totals[trx.kategori] || 0) + (Number(trx.nominal) || 0);
    });

    const list = Object.entries(totals)
      .map(([nama, total]) => {
        const found = KATEGORI_LIST.find((k) => k.nama.toLowerCase() === nama.toLowerCase());
        const percentage = totalPengeluaran > 0 ? (total / totalPengeluaran) * 100 : 0;
        return {
          nama,
          total,
          percentage,
          icon: found?.icon || '🏷️',
          color: found?.color || '#6b7280',
          bg: found?.bg || '#f3f4f6',
        };
      })
      .sort((a, b) => b.total - a.total);

    return list;
  }, [history, selectedPeriode, totalPengeluaran]);

  // Transaksi Terfilter Sesuai Bulan
  const filteredHistory = useMemo(() => {
    return history.filter((t: Transaction) => t.tanggal.startsWith(selectedPeriode));
  }, [history, selectedPeriode]);

  // --- FILTER & PENGHITUNGAN DATA HUTANG SESUAI BULAN TERPILIH ---
  // 1. Hutang yang jatuh tempo di bulan terpilih (belum lunas)
  const hutangBulanIni = useMemo(() => {
    return hutangList.filter(
      (h) => !h.isLunas && h.tanggalJatuhTempo.startsWith(selectedPeriode)
    );
  }, [hutangList, selectedPeriode]);

  // 2. Tunggakan: hutang belum lunas yang jatuh tempo sebelum bulan terpilih
  const hutangTunggakan = useMemo(() => {
    return hutangList.filter(
      (h) => !h.isLunas && h.tanggalJatuhTempo < `${selectedPeriode}-01`
    );
  }, [hutangList, selectedPeriode]);

  // 3. Semua hutang yang masih aktif (belum lunas) lintas periode
  const semuaHutangAktif = useMemo(() => {
    return hutangList.filter((h) => !h.isLunas);
  }, [hutangList]);

  // 4. Riwayat hutang yang sudah dilunasi
  const hutangLunas = useMemo(() => {
    return hutangList.filter((h) => !!h.isLunas);
  }, [hutangList]);

  // Total nominal hutang yang jatuh tempo di bulan terpilih
  const totalHutangBulanIni = useMemo(() => {
    return hutangBulanIni.reduce((sum, h) => sum + (Number(h.nominal) || 0), 0);
  }, [hutangBulanIni]);

  // --- AKSI FORM ---

  const handleSimpanTransaksi = async () => {
    if (!namaBarang.trim() || !nominalTrx.trim()) {
      return Alert.alert('Error', 'Nama pengeluaran dan nominal wajib diisi!');
    }
    const nominalNum = parseInt(nominalTrx.replace(/[^0-9]/g, ''), 10);
    if (isNaN(nominalNum) || nominalNum <= 0) {
      return Alert.alert('Error', 'Nominal harus berupa angka valid!');
    }

    try {
      const now = new Date();
      const currentIso = now.toISOString();
      const isCurrentMonth = currentIso.startsWith(selectedPeriode);
      const tanggalTrx = isCurrentMonth ? currentIso : `${selectedPeriode}-01T12:00:00.000Z`;

      await db.insert(transactions).values({
        tanggal: tanggalTrx,
        namaBarang: namaBarang.trim(),
        nominal: nominalNum,
        kategori,
        metodePembayaran: metode,
      });

      setNamaBarang('');
      setNominalTrx('');
      setIsAddingTrx(false);
      loadDashboardData();
    } catch (e) {
      Alert.alert('Error', 'Gagal menyimpan transaksi');
    }
  };

  const handleSimpanBudget = async () => {
    const budgetNum = parseInt(inputBudget.replace(/[^0-9]/g, ''), 10);
    if (isNaN(budgetNum) || budgetNum < 0) {
      return Alert.alert('Error', 'Masukkan nominal anggaran yang valid!');
    }
    try {
      await db.run(
        sql`UPDATE monthly_incomes SET batas_anggaran = ${budgetNum} WHERE periode = ${selectedPeriode}`
      );
      setInputBudget('');
      setIsBudgetModal(false);
      loadDashboardData();
    } catch (e) {
      Alert.alert('Error', 'Gagal mengatur anggaran');
    }
  };

  const handleSimpanTopUp = async () => {
    const amount = parseInt(inputTopUp.replace(/[^0-9]/g, ''), 10);
    if (isNaN(amount) || amount <= 0) return;
    try {
      await db.run(
        sql`UPDATE monthly_incomes SET nominal_pemasukan = nominal_pemasukan + ${amount} WHERE periode = ${selectedPeriode}`
      );
      setInputTopUp('');
      setIsTopUpModal(false);
      loadDashboardData();
    } catch (e) {
      Alert.alert('Error', 'Gagal menambah saldo');
    }
  };

  const handleSimpanHutang = async () => {
    if (!namaKreditur.trim() || !nominalHutang.trim()) {
      return Alert.alert('Error', 'Nama kreditur dan nominal wajib diisi!');
    }
    const nominalNum = parseInt(nominalHutang.replace(/[^0-9]/g, ''), 10);
    if (isNaN(nominalNum) || nominalNum <= 0) {
      return Alert.alert('Error', 'Nominal hutang harus berupa angka valid!');
    }

    let finalTanggal = jatuhTempoTanggal.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(finalTanggal)) {
      // Default ke pertengahan bulan yang sedang dipilih
      finalTanggal = `${selectedPeriode}-15`;
    }

    try {
      await db.insert(debts).values({
        namaKreditur: namaKreditur.trim(),
        nominal: nominalNum,
        tanggalJatuhTempo: finalTanggal,
        isLunas: 0,
      });

      setNamaKreditur('');
      setNominalHutang('');
      setJatuhTempoTanggal('');
      setIsDebtModal(false);
      loadDashboardData();
    } catch (e) {
      Alert.alert('Error', 'Gagal menambahkan hutang');
    }
  };

  const handleBayarHutang = (h: Debt) => {
    const doBayar = async (catatSebagaiPengeluaran: boolean) => {
      await db.update(debts).set({ isLunas: 1 }).where(eq(debts.id, h.id));
      if (catatSebagaiPengeluaran) {
        await db.insert(transactions).values({
          tanggal: new Date().toISOString(),
          namaBarang: `Bayar Hutang: ${h.namaKreditur}`,
          nominal: h.nominal,
          kategori: 'Tagihan',
          metodePembayaran: 'Tunai',
        });
      }
      loadDashboardData();
    };

    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined' && window.confirm(
        `Tandai lunas hutang "${h.namaKreditur}" (Rp ${h.nominal.toLocaleString('id-ID')})?\nKlik OK untuk lunas & catat ke pengeluaran.`
      );
      if (ok) doBayar(true);
    } else {
      Alert.alert(
        'Pelunasan Hutang',
        `Tandai lunas hutang "${h.namaKreditur}" senilai Rp ${h.nominal.toLocaleString('id-ID')}?`,
        [
          { text: 'Batal', style: 'cancel' },
          { text: 'Lunas Saja', onPress: () => doBayar(false) },
          { text: 'Lunas & Catat Pengeluaran', style: 'default', onPress: () => doBayar(true) },
        ]
      );
    }
  };

  const handleDeleteHutang = (id: number, nama: string) => {
    const doDelete = async () => {
      await db.delete(debts).where(eq(debts.id, id));
      loadDashboardData();
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Hapus catatan hutang "${nama}"?`)) {
        doDelete();
      }
    } else {
      Alert.alert('Hapus Hutang', `Hapus catatan hutang "${nama}"?`, [
        { text: 'Batal', style: 'cancel' },
        { text: 'Hapus', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleSimpanRecurring = async () => {
    if (!namaRutin.trim() || !nominalRutin.trim()) {
      return Alert.alert('Error', 'Nama tagihan dan nominal wajib diisi!');
    }
    const nominalNum = parseInt(nominalRutin.replace(/[^0-9]/g, ''), 10);
    const tanggalNum = parseInt(tanggalTagihan, 10) || 1;

    try {
      await db.insert(recurringExpenses).values({
        namaBarang: namaRutin.trim(),
        nominal: nominalNum,
        kategori: kategoriRutin,
        metodePembayaran: metodeRutin,
        tanggalTagihan: Math.min(Math.max(tanggalNum, 1), 31),
        bulanTerakhirDiproses: null,
      });

      setNamaRutin('');
      setNominalRutin('');
      setIsRecurringModal(false);
      checkRecurringExpenses();
    } catch (e) {
      Alert.alert('Error', 'Gagal menambahkan tagihan rutin');
    }
  };

  const handleDeleteRecurring = (id: number, nama: string) => {
    const doDelete = async () => {
      await db.delete(recurringExpenses).where(eq(recurringExpenses.id, id));
      checkRecurringExpenses();
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Hapus langganan rutin "${nama}"?`)) {
        doDelete();
      }
    } else {
      Alert.alert('Hapus Tagihan', `Hapus langganan rutin "${nama}"?`, [
        { text: 'Batal', style: 'cancel' },
        { text: 'Hapus', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleTriggerRecurringManual = async (rutin: RecurringExpense) => {
    try {
      const day = Math.min(Math.max(rutin.tanggalTagihan, 1), 28);
      await db.insert(transactions).values({
        tanggal: `${selectedPeriode}-${String(day).padStart(2, '0')}T12:00:00.000Z`,
        namaBarang: `${rutin.namaBarang} (Tagihan Rutin)`,
        nominal: rutin.nominal,
        kategori: rutin.kategori,
        metodePembayaran: rutin.metodePembayaran,
      });

      await db.run(
        sql`UPDATE recurring_expenses SET bulan_terakhir_diproses = ${selectedPeriode} WHERE id = ${rutin.id}`
      );

      loadDashboardData();
      Alert.alert('Sukses', `Tagihan "${rutin.namaBarang}" berhasil dicatat ke pengeluaran ${formattedPeriode}!`);
    } catch (e) {
      Alert.alert('Error', 'Gagal mencatat tagihan rutin');
    }
  };

  const handleDeleteTransaction = (id: number, nama: string) => {
    const doDelete = async () => {
      await db.delete(transactions).where(eq(transactions.id, id));
      loadDashboardData();
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Hapus pengeluaran "${nama}"?`)) {
        doDelete();
      }
    } else {
      Alert.alert('Hapus Transaksi', `Yakin ingin menghapus pengeluaran "${nama}"?`, [
        { text: 'Batal', style: 'cancel' },
        { text: 'Hapus', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  // Helper Icon Kategori
  const getKategoriIcon = (namaKat: string) => {
    const found = KATEGORI_LIST.find((k) => k.nama.toLowerCase() === namaKat.toLowerCase());
    return found?.icon || '🏷️';
  };

  // --- SUB-VIEW: BUDGET PROGRESS BAR ---
  const renderBudgetBar = () => {
    if (batasAnggaran === 0) {
      return (
        <View className="bg-white p-4 mx-6 mt-4 rounded-2xl shadow-sm border border-dashed border-gray-300 flex-row justify-between items-center">
          <View>
            <Text className="text-gray-700 font-bold text-sm">Batas Anggaran Bulanan</Text>
            <Text className="text-gray-400 text-xs">Belum diatur untuk bulan ini</Text>
          </View>
          <TouchableOpacity
            onPress={() => setIsBudgetModal(true)}
            className="bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200"
          >
            <Text className="text-emerald-700 font-bold text-xs">+ Atur Budget</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const persentase = batasAnggaran > 0 ? Math.min((totalPengeluaran / batasAnggaran) * 100, 100) : 0;
    const barColor = persentase > 90 ? 'bg-red-500' : persentase > 75 ? 'bg-yellow-500' : 'bg-emerald-500';

    return (
      <View className="bg-white p-4 mx-6 mt-4 rounded-2xl shadow-sm border border-gray-100">
        <View className="flex-row justify-between items-center mb-2">
          <View className="flex-row items-center">
            <Text className="text-gray-700 font-bold">Batas Anggaran</Text>
            <TouchableOpacity onPress={() => setIsBudgetModal(true)} className="ml-2">
              <Text className="text-emerald-600 text-xs font-semibold">✏️ Ubah</Text>
            </TouchableOpacity>
          </View>
          <Text className={persentase > 90 ? 'text-red-500 font-bold text-xs' : 'text-gray-500 text-xs'}>
            Rp {totalPengeluaran.toLocaleString('id-ID')} / Rp {batasAnggaran.toLocaleString('id-ID')}
          </Text>
        </View>
        <View className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
          <View className={`h-full ${barColor}`} style={{ width: `${persentase}%` }} />
        </View>
        <View className="flex-row justify-between mt-2">
          <Text className="text-gray-400 text-[11px]">Terpakai {persentase.toFixed(0)}%</Text>
          {persentase > 90 && (
            <Text className="text-red-500 text-[11px] font-semibold italic">
              ⚠️ Pengeluaran hampir melampaui batas!
            </Text>
          )}
        </View>
      </View>
    );
  };

  // --- RENDER SCREEN SESUAI TAB ---

  const renderDashboardTab = () => (
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
      {renderBudgetBar()}

      {/* Pengeluaran Terakhir Bulan Ini */}
      <View className="px-6 pt-6 pb-28">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-gray-800 text-lg font-bold">Pengeluaran {formattedPeriode}</Text>
          <Text className="text-gray-400 text-xs">{filteredHistory.length} transaksi</Text>
        </View>
        <Text className="text-gray-400 text-xs mb-3">Tahan lama (long-press) item untuk menghapus</Text>

        {filteredHistory.length === 0 ? (
          <View className="bg-white p-6 rounded-2xl border border-gray-100 items-center justify-center my-2">
            <Text className="text-3xl mb-1">💸</Text>
            <Text className="text-gray-500 text-sm font-medium">Belum ada pengeluaran di bulan ini.</Text>
            <Text className="text-gray-400 text-xs mt-1">Tekan tombol + di kanan bawah untuk mencatat.</Text>
          </View>
        ) : (
          filteredHistory.slice(0, 10).map((item) => (
            <TouchableOpacity
              key={item.id}
              onLongPress={() => handleDeleteTransaction(item.id, item.namaBarang)}
              className="flex-row justify-between items-center bg-white p-4 rounded-2xl mb-3 shadow-sm border border-gray-100"
            >
              <View className="flex-row items-center flex-1 mr-3">
                <View className="w-10 h-10 rounded-xl bg-gray-100 items-center justify-center mr-3">
                  <Text className="text-lg">{getKategoriIcon(item.kategori)}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-gray-800 text-base font-semibold" numberOfLines={1}>
                    {item.namaBarang}
                  </Text>
                  <Text className="text-gray-400 text-xs mt-0.5">
                    {item.kategori} • {item.metodePembayaran} • {item.tanggal.slice(0, 10)}
                  </Text>
                </View>
              </View>
              <Text className="text-red-500 font-bold text-base">
                - Rp {Number(item.nominal).toLocaleString('id-ID')}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );

  const renderAnalyticsTab = () => (
    <ScrollView className="flex-1 px-6 pt-4 pb-28" showsVerticalScrollIndicator={false}>
      <Text className="text-gray-800 text-xl font-bold mb-1">Analisis Pengeluaran</Text>
      <Text className="text-gray-400 text-xs mb-5">Distribusi pengeluaran per kategori di {formattedPeriode}</Text>

      {/* Card Ringkasan Total */}
      <View className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-6">
        <Text className="text-gray-400 text-xs font-semibold uppercase">Total Belanja Bulan Ini</Text>
        <Text className="text-gray-900 text-3xl font-bold mt-1">
          Rp {totalPengeluaran.toLocaleString('id-ID')}
        </Text>
        <Text className="text-gray-400 text-xs mt-1">
          {categoryAnalysis.length} kategori tercatat
        </Text>
      </View>

      {/* Breakdown Kategori Bar */}
      <Text className="text-gray-800 font-bold text-base mb-3">Persentase Kategori</Text>

      {categoryAnalysis.length === 0 ? (
        <View className="bg-white p-6 rounded-2xl border border-gray-100 items-center justify-center">
          <Text className="text-3xl mb-1">📊</Text>
          <Text className="text-gray-500 text-sm font-medium">Belum ada data pengeluaran untuk dianalisis.</Text>
        </View>
      ) : (
        categoryAnalysis.map((item) => (
          <View key={item.nama} className="bg-white p-4 rounded-2xl mb-3 shadow-sm border border-gray-100">
            <View className="flex-row justify-between items-center mb-2">
              <View className="flex-row items-center">
                <Text className="text-xl mr-2">{item.icon}</Text>
                <Text className="font-bold text-gray-800 text-base">{item.nama}</Text>
              </View>
              <View className="items-end">
                <Text className="font-bold text-gray-900 text-base">
                  Rp {item.total.toLocaleString('id-ID')}
                </Text>
                <Text className="text-emerald-600 font-semibold text-xs">
                  {item.percentage.toFixed(1)}%
                </Text>
              </View>
            </View>

            {/* Visual Bar */}
            <View className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <View
                className="h-full rounded-full"
                style={{
                  width: `${item.percentage}%`,
                  backgroundColor: item.color,
                }}
              />
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );

  const renderBillsTab = () => {
    // Tentukan daftar hutang yang tampil sesuai filter yang aktif
    const displayDebts =
      debtFilter === 'bulan'
        ? hutangBulanIni
        : debtFilter === 'semua'
        ? semuaHutangAktif
        : hutangLunas;

    return (
      <ScrollView className="flex-1 px-6 pt-4 pb-28" showsVerticalScrollIndicator={false}>
        {/* KARTU RINGKASAN HUTANG BULAN INI */}
        <View className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-6">
          <View className="flex-row justify-between items-center mb-1">
            <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
              Hutang Jatuh Tempo ({formattedPeriode})
            </Text>
            <TouchableOpacity
              onPress={() => {
                setJatuhTempoTanggal(`${selectedPeriode}-15`);
                setIsDebtModal(true);
              }}
              className="bg-rose-50 px-3 py-1 rounded-full border border-rose-200"
            >
              <Text className="text-rose-600 font-bold text-xs">+ Tambah Hutang</Text>
            </TouchableOpacity>
          </View>
          <Text className="text-gray-900 text-3xl font-bold mt-1">
            Rp {totalHutangBulanIni.toLocaleString('id-ID')}
          </Text>
          <Text className="text-gray-400 text-xs mt-1">
            {hutangBulanIni.length} hutang jatuh tempo di periode ini
          </Text>
        </View>

        {/* SEKSI 1: DAFTAR HUTANG & CICILAN */}
        <View className="mb-8">
          <Text className="text-gray-800 font-bold text-lg mb-3">⚠️ Catatan Hutang / Cicilan</Text>

          {/* FILTER TAB: Bulan Ini | Semua Aktif | Sudah Lunas */}
          <View className="flex-row bg-gray-100 p-1 rounded-xl mb-4">
            <TouchableOpacity
              onPress={() => setDebtFilter('bulan')}
              className={`flex-1 py-2 rounded-lg items-center ${
                debtFilter === 'bulan' ? 'bg-white shadow-sm' : ''
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  debtFilter === 'bulan' ? 'text-gray-800' : 'text-gray-400'
                }`}
              >
                {formattedPeriode} ({hutangBulanIni.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setDebtFilter('semua')}
              className={`flex-1 py-2 rounded-lg items-center ${
                debtFilter === 'semua' ? 'bg-white shadow-sm' : ''
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  debtFilter === 'semua' ? 'text-gray-800' : 'text-gray-400'
                }`}
              >
                Semua Aktif ({semuaHutangAktif.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setDebtFilter('lunas')}
              className={`flex-1 py-2 rounded-lg items-center ${
                debtFilter === 'lunas' ? 'bg-white shadow-sm' : ''
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  debtFilter === 'lunas' ? 'text-emerald-700' : 'text-gray-400'
                }`}
              >
                Lunas ({hutangLunas.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* TUNGGAKAN DARI BULAN LALU (HANYA DITAMPILKAN PADA TAB BULAN INI) */}
          {debtFilter === 'bulan' && hutangTunggakan.length > 0 && (
            <View className="mb-4 bg-amber-50 p-4 rounded-xl border border-amber-200">
              <View className="flex-row items-center mb-2">
                <Text className="text-base mr-1.5">⚠️</Text>
                <Text className="text-amber-800 font-bold text-sm">
                  Tunggakan dari Bulan Lalu ({hutangTunggakan.length})
                </Text>
              </View>
              <Text className="text-amber-700 text-xs mb-3">
                Ada pinjaman yang jatuh temponya sebelum {formattedPeriode} dan belum terlunasi:
              </Text>

              {hutangTunggakan.map((h) => (
                <View
                  key={h.id}
                  className="bg-white p-3 rounded-lg mb-2 border border-amber-200 flex-row justify-between items-center"
                >
                  <View className="flex-1 mr-2">
                    <Text className="font-bold text-gray-800 text-sm">{h.namaKreditur}</Text>
                    <Text className="text-red-500 font-medium text-[11px]">
                      Jatuh tempo: {h.tanggalJatuhTempo} (Lewat)
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="font-bold text-red-600 text-sm mb-1">
                      Rp {h.nominal.toLocaleString('id-ID')}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleBayarHutang(h)}
                      className="bg-emerald-600 px-2.5 py-1 rounded"
                    >
                      <Text className="text-white text-[10px] font-bold">✓ Bayar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* DAFTAR HUTANG UTAMA */}
          {displayDebts.length === 0 ? (
            <View className="bg-white p-6 rounded-2xl border border-gray-100 items-center justify-center">
              <Text className="text-3xl mb-1">🎉</Text>
              <Text className="text-gray-600 text-sm font-medium">
                {debtFilter === 'bulan'
                  ? `Tidak ada hutang yang jatuh tempo di ${formattedPeriode}.`
                  : debtFilter === 'semua'
                  ? 'Tidak ada catatan hutang aktif.'
                  : 'Belum ada riwayat hutang yang lunas.'}
              </Text>
              {debtFilter === 'bulan' && (
                <Text className="text-gray-400 text-xs mt-1">
                  Gunakan panah ◀ ▶ di atas untuk melihat bulan lain, atau tekan + Tambah Hutang.
                </Text>
              )}
            </View>
          ) : (
            displayDebts.map((h) => {
              const dueTime = new Date(h.tanggalJatuhTempo).getTime();
              const sisaHariRaw = Math.ceil((dueTime - Date.now()) / (1000 * 3600 * 24));
              const sisaHari = isNaN(sisaHariRaw) ? 0 : sisaHariRaw;
              const isWarning = !h.isLunas && sisaHari <= 3;

              return (
                <View
                  key={h.id}
                  className={`p-4 rounded-xl mb-3 border ${
                    h.isLunas
                      ? 'bg-emerald-50/50 border-emerald-200'
                      : isWarning
                      ? 'bg-red-50/70 border-red-200'
                      : 'bg-white border-gray-100 shadow-sm'
                  }`}
                >
                  <View className="flex-row justify-between items-start mb-2">
                    <View className="flex-1 mr-2">
                      <View className="flex-row items-center">
                        <Text className="font-bold text-gray-800 text-base">{h.namaKreditur}</Text>
                        {h.isLunas ? (
                          <View className="ml-2 bg-emerald-100 px-2 py-0.5 rounded">
                            <Text className="text-emerald-700 text-[10px] font-bold">LUNAS</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text
                        className={`${
                          isWarning ? 'text-red-500 font-bold' : 'text-gray-500'
                        } text-xs mt-0.5`}
                      >
                        Jatuh Tempo: {h.tanggalJatuhTempo}{' '}
                        {!h.isLunas && (sisaHari > 0 ? `(${sisaHari} hari lagi)` : '(HARI INI / LEWAT)')}
                      </Text>
                    </View>
                    <Text className={`font-bold text-base ${h.isLunas ? 'text-emerald-700 line-through' : 'text-red-600'}`}>
                      Rp {h.nominal.toLocaleString('id-ID')}
                    </Text>
                  </View>

                  {/* Tombol Aksi */}
                  <View className="flex-row justify-end items-center mt-2 pt-2 border-t border-gray-100">
                    <TouchableOpacity
                      onPress={() => handleDeleteHutang(h.id, h.namaKreditur)}
                      className="bg-gray-100 px-3 py-1.5 rounded-lg mr-2"
                    >
                      <Text className="text-gray-600 text-xs font-medium">Hapus</Text>
                    </TouchableOpacity>
                    {!h.isLunas && (
                      <TouchableOpacity
                        onPress={() => handleBayarHutang(h)}
                        className="bg-emerald-600 px-3 py-1.5 rounded-lg flex-row items-center"
                      >
                        <Text className="text-white text-xs font-bold">✓ Tandai Lunas</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* SEKSI 2: TAGIHAN RUTIN BULANAN */}
        <View>
          <View className="flex-row justify-between items-center mb-3">
            <View>
              <Text className="text-gray-800 font-bold text-lg">🔄 Tagihan Rutin Bulanan</Text>
              <Text className="text-gray-400 text-xs">Pengeluaran langganan per bulan</Text>
            </View>
            <TouchableOpacity
              onPress={() => setIsRecurringModal(true)}
              className="bg-blue-50 px-3 py-1.5 rounded-full border border-blue-200"
            >
              <Text className="text-blue-600 font-bold text-xs">+ Langganan</Text>
            </TouchableOpacity>
          </View>

          {recurringList.length === 0 ? (
            <View className="bg-white p-4 rounded-xl border border-gray-100 items-center justify-center">
              <Text className="text-gray-400 text-xs">Belum ada langganan rutin (WiFi, Netflix, dll).</Text>
            </View>
          ) : (
            recurringList.map((item) => {
              const sudahTercatat = item.bulanTerakhirDiproses === selectedPeriode;
              return (
                <View
                  key={item.id}
                  className="p-4 rounded-xl mb-3 bg-white border border-gray-100 shadow-sm"
                >
                  <View className="flex-row justify-between items-start mb-2">
                    <View className="flex-1 mr-3">
                      <View className="flex-row items-center">
                        <Text className="font-bold text-gray-800 text-base mr-2">{item.namaBarang}</Text>
                        <View
                          className={`px-2 py-0.5 rounded ${
                            sudahTercatat ? 'bg-emerald-100' : 'bg-gray-100'
                          }`}
                        >
                          <Text
                            className={`text-[10px] font-bold ${
                              sudahTercatat ? 'text-emerald-700' : 'text-gray-500'
                            }`}
                          >
                            {sudahTercatat ? '✓ TERCATAT' : `TGL ${item.tanggalTagihan}`}
                          </Text>
                        </View>
                      </View>
                      <Text className="text-gray-400 text-xs mt-0.5">
                        Tagihan tgl {item.tanggalTagihan} • {item.kategori} • {item.metodePembayaran}
                      </Text>
                    </View>
                    <Text className="font-bold text-gray-900 text-base">
                      Rp {item.nominal.toLocaleString('id-ID')}
                    </Text>
                  </View>

                  <View className="flex-row justify-end items-center mt-2 pt-2 border-t border-gray-100">
                    {!sudahTercatat && (
                      <TouchableOpacity
                        onPress={() => handleTriggerRecurringManual(item)}
                        className="bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg mr-2"
                      >
                        <Text className="text-blue-600 text-xs font-semibold">
                          ⚡ Catat ke {formattedPeriode}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => handleDeleteRecurring(item.id, item.namaBarang)}
                      className="bg-gray-100 px-3 py-1.5 rounded-lg"
                    >
                      <Text className="text-red-500 text-xs font-semibold">Hapus</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    );
  };

  // ---------------------------------------------------------
  // RENDER MODAL-MODAL
  // ---------------------------------------------------------

  if (isAddingTrx) {
    return (
      <ScrollView className="flex-1 bg-white px-6 pt-14" keyboardShouldPersistTaps="handled">
        <Text className="text-2xl font-bold text-gray-800 mb-6">Tambah Pengeluaran</Text>

        <Text className="text-gray-500 mb-1 ml-1 text-sm font-semibold">Nama Pengeluaran</Text>
        <TextInput
          className="bg-gray-100 rounded-xl px-4 py-3 mb-4 text-lg text-gray-800"
          placeholder="Cth: Nasi Padang, Bensin..."
          value={namaBarang}
          onChangeText={setNamaBarang}
        />

        <Text className="text-gray-500 mb-1 ml-1 text-sm font-semibold">Nominal (Rp)</Text>
        <TextInput
          className="bg-gray-100 rounded-xl px-4 py-3 mb-4 text-lg text-gray-800"
          placeholder="Cth: 25000"
          keyboardType="numeric"
          value={nominalTrx}
          onChangeText={setNominalTrx}
        />

        <Text className="text-gray-500 mb-2 ml-1 text-sm font-semibold">Kategori</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4 max-h-12">
          {KATEGORI_LIST.map((kat) => (
            <TouchableOpacity
              key={kat.nama}
              onPress={() => setKategori(kat.nama)}
              className={`px-4 py-2 mr-2 rounded-full flex-row items-center border ${
                kategori === kat.nama ? 'bg-emerald-600 border-emerald-600' : 'bg-gray-100 border-gray-200'
              }`}
            >
              <Text className="mr-1">{kat.icon}</Text>
              <Text className={kategori === kat.nama ? 'text-white font-medium' : 'text-gray-700'}>
                {kat.nama}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text className="text-gray-500 mb-2 ml-1 text-sm font-semibold">Metode Pembayaran</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-8 max-h-12">
          {METODE_LIST.map((met) => (
            <TouchableOpacity
              key={met.nama}
              onPress={() => setMetode(met.nama)}
              className={`px-4 py-2 mr-2 rounded-full flex-row items-center border ${
                metode === met.nama ? 'bg-emerald-600 border-emerald-600' : 'bg-gray-100 border-gray-200'
              }`}
            >
              <Text className="mr-1">{met.icon}</Text>
              <Text className={metode === met.nama ? 'text-white font-medium' : 'text-gray-700'}>
                {met.nama}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View className="flex-row justify-between pb-12">
          <TouchableOpacity
            className="flex-1 bg-gray-200 py-4 rounded-xl mr-2 items-center"
            onPress={() => setIsAddingTrx(false)}
          >
            <Text className="text-gray-700 font-bold text-lg">Batal</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 bg-emerald-600 py-4 rounded-xl ml-2 items-center"
            onPress={handleSimpanTransaksi}
          >
            <Text className="text-white font-bold text-lg">Simpan</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (isBudgetModal) {
    return (
      <View className="flex-1 bg-white px-6 pt-16">
        <Text className="text-2xl font-bold text-gray-800 mb-2">Atur Batas Anggaran</Text>
        <Text className="text-gray-500 text-sm mb-6">
          Tentukan batas maksimal belanja untuk periode {formattedPeriode}.
        </Text>

        <Text className="text-gray-600 mb-1 ml-1 text-sm font-semibold">Nominal Batas Anggaran (Rp)</Text>
        <TextInput
          className="bg-gray-100 rounded-xl px-4 py-3 mb-6 text-xl text-gray-800"
          placeholder="Cth: 2000000"
          keyboardType="numeric"
          value={inputBudget}
          onChangeText={setInputBudget}
        />

        <View className="flex-row justify-between">
          <TouchableOpacity
            className="flex-1 bg-gray-200 py-4 rounded-xl mr-2 items-center"
            onPress={() => setIsBudgetModal(false)}
          >
            <Text className="text-gray-700 font-bold text-lg">Batal</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 bg-emerald-600 py-4 rounded-xl ml-2 items-center"
            onPress={handleSimpanBudget}
          >
            <Text className="text-white font-bold text-lg">Simpan Budget</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isDebtModal) {
    return (
      <View className="flex-1 bg-white px-6 pt-16">
        <Text className="text-2xl font-bold text-gray-800 mb-2">Tambah Hutang / Cicilan</Text>
        <Text className="text-gray-500 text-sm mb-6">
          Catat pinjaman atau tagihan jatuh tempo agar tidak terlewat.
        </Text>

        <Text className="text-gray-600 mb-1 ml-1 text-sm font-semibold">Nama Kreditur / Tagihan</Text>
        <TextInput
          className="bg-gray-100 rounded-xl px-4 py-3 mb-4 text-lg text-gray-800"
          placeholder="Cth: Pinjam Teman (Budi), Cicilan Laptop"
          value={namaKreditur}
          onChangeText={setNamaKreditur}
        />

        <Text className="text-gray-600 mb-1 ml-1 text-sm font-semibold">Nominal (Rp)</Text>
        <TextInput
          className="bg-gray-100 rounded-xl px-4 py-3 mb-4 text-lg text-gray-800"
          placeholder="Cth: 150000"
          keyboardType="numeric"
          value={nominalHutang}
          onChangeText={setNominalHutang}
        />

        <Text className="text-gray-600 mb-1 ml-1 text-sm font-semibold">
          Tanggal Jatuh Tempo (YYYY-MM-DD)
        </Text>
        <TextInput
          className="bg-gray-100 rounded-xl px-4 py-3 mb-2 text-lg text-gray-800"
          placeholder={`${selectedPeriode}-15`}
          value={jatuhTempoTanggal}
          onChangeText={setJatuhTempoTanggal}
        />

        {/* Pilihan Cepat Jatuh Tempo */}
        <Text className="text-gray-400 text-xs mb-2 ml-1">Pilihan Cepat Tanggal:</Text>
        <View className="flex-row flex-wrap gap-2 mb-8">
          <TouchableOpacity
            onPress={() => setJatuhTempoTanggal(`${selectedPeriode}-10`)}
            className="bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200"
          >
            <Text className="text-rose-700 text-xs font-semibold">Tgl 10 {formattedPeriode}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setJatuhTempoTanggal(`${selectedPeriode}-20`)}
            className="bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200"
          >
            <Text className="text-rose-700 text-xs font-semibold">Tgl 20 {formattedPeriode}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              const [y, m] = selectedPeriode.split('-').map(Number);
              const lastDay = new Date(y, m, 0).getDate();
              setJatuhTempoTanggal(`${selectedPeriode}-${String(lastDay).padStart(2, '0')}`);
            }}
            className="bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200"
          >
            <Text className="text-rose-700 text-xs font-semibold">Akhir Bulan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              const d = new Date();
              d.setDate(d.getDate() + 3);
              setJatuhTempoTanggal(d.toISOString().slice(0, 10));
            }}
            className="bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200"
          >
            <Text className="text-gray-700 text-xs font-semibold">+3 Hari</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row justify-between">
          <TouchableOpacity
            className="flex-1 bg-gray-200 py-4 rounded-xl mr-2 items-center"
            onPress={() => setIsDebtModal(false)}
          >
            <Text className="text-gray-700 font-bold text-lg">Batal</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 bg-rose-600 py-4 rounded-xl ml-2 items-center"
            onPress={handleSimpanHutang}
          >
            <Text className="text-white font-bold text-lg">Simpan Hutang</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isRecurringModal) {
    return (
      <ScrollView className="flex-1 bg-white px-6 pt-16" keyboardShouldPersistTaps="handled">
        <Text className="text-2xl font-bold text-gray-800 mb-2">Tambah Langganan Rutin</Text>
        <Text className="text-gray-500 text-sm mb-6">
          Pengeluaran rutin akan otomatis dicatat setiap tanggal tagihan tiba.
        </Text>

        <Text className="text-gray-600 mb-1 ml-1 text-sm font-semibold">Nama Langganan</Text>
        <TextInput
          className="bg-gray-100 rounded-xl px-4 py-3 mb-4 text-lg text-gray-800"
          placeholder="Cth: WiFi Indihome, Netflix, BPJS"
          value={namaRutin}
          onChangeText={setNamaRutin}
        />

        <Text className="text-gray-600 mb-1 ml-1 text-sm font-semibold">Nominal per Bulan (Rp)</Text>
        <TextInput
          className="bg-gray-100 rounded-xl px-4 py-3 mb-4 text-lg text-gray-800"
          placeholder="Cth: 350000"
          keyboardType="numeric"
          value={nominalRutin}
          onChangeText={setNominalRutin}
        />

        <Text className="text-gray-600 mb-1 ml-1 text-sm font-semibold">Tanggal Tagihan Tiap Bulan (1-31)</Text>
        <TextInput
          className="bg-gray-100 rounded-xl px-4 py-3 mb-6 text-lg text-gray-800"
          placeholder="Cth: 20 (artinya tanggal 20 setiap bulan)"
          keyboardType="numeric"
          value={tanggalTagihan}
          onChangeText={setTanggalTagihan}
        />

        <View className="flex-row justify-between pb-12">
          <TouchableOpacity
            className="flex-1 bg-gray-200 py-4 rounded-xl mr-2 items-center"
            onPress={() => setIsRecurringModal(false)}
          >
            <Text className="text-gray-700 font-bold text-lg">Batal</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 bg-blue-600 py-4 rounded-xl ml-2 items-center"
            onPress={handleSimpanRecurring}
          >
            <Text className="text-white font-bold text-lg">Simpan Tagihan</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (isTopUpModal) {
    return (
      <View className="flex-1 bg-white px-6 pt-16">
        <Text className="text-2xl font-bold text-gray-800 mb-2">Tambah Pemasukan</Text>
        <Text className="text-gray-500 text-sm mb-6">
          Tambahkan uang masuk atau gaji untuk periode {formattedPeriode}.
        </Text>

        <Text className="text-gray-600 mb-1 ml-1 text-sm font-semibold">Nominal Pemasukan (Rp)</Text>
        <TextInput
          className="bg-gray-100 rounded-xl px-4 py-3 mb-8 text-xl text-gray-800"
          placeholder="Cth: 3000000"
          keyboardType="numeric"
          value={inputTopUp}
          onChangeText={setInputTopUp}
        />

        <View className="flex-row justify-between">
          <TouchableOpacity
            className="flex-1 bg-gray-200 py-4 rounded-xl mr-2 items-center"
            onPress={() => setIsTopUpModal(false)}
          >
            <Text className="text-gray-700 font-bold text-lg">Batal</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 bg-emerald-600 py-4 rounded-xl ml-2 items-center"
            onPress={handleSimpanTopUp}
          >
            <Text className="text-white font-bold text-lg">Tambah Saldo</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------
  // RENDER UTAMA
  // ---------------------------------------------------------
  return (
    <View className="flex-1 bg-gray-50">
      {/* HEADER UTAMA: NAVIGASI BULAN & SALDO */}
      <View className="bg-emerald-600 px-6 pt-16 pb-5 rounded-b-3xl shadow-md">
        {/* Navigasi Periode Bulan */}
        <View className="flex-row justify-between items-center mb-3">
          <TouchableOpacity
            onPress={handlePrevMonth}
            className="bg-emerald-700/60 w-8 h-8 rounded-full items-center justify-center border border-emerald-500"
          >
            <Text className="text-white font-bold text-base">◀</Text>
          </TouchableOpacity>

          <View className="items-center">
            <Text className="text-emerald-100 text-xs font-semibold uppercase tracking-wider">
              Periode
            </Text>
            <Text className="text-white text-base font-bold">{formattedPeriode}</Text>
          </View>

          <TouchableOpacity
            onPress={handleNextMonth}
            className="bg-emerald-700/60 w-8 h-8 rounded-full items-center justify-center border border-emerald-500"
          >
            <Text className="text-white font-bold text-base">▶</Text>
          </TouchableOpacity>
        </View>

        {/* Sisa Saldo */}
        <View className="flex-row justify-between items-end mb-1">
          <View>
            <Text className="text-emerald-200 text-xs font-medium">Sisa Saldo</Text>
            <Text className={`text-4xl font-bold tracking-tight ${sisaUang < 0 ? 'text-rose-200' : 'text-white'}`}>
              Rp {sisaUang.toLocaleString('id-ID')}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setIsTopUpModal(true)}
            className="bg-emerald-500 px-3 py-1.5 rounded-full border border-emerald-400 mb-1"
          >
            <Text className="text-white text-xs font-bold">+ Saldo</Text>
          </TouchableOpacity>
        </View>

        {/* Ringkasan Pemasukan & Pengeluaran */}
        <View className="flex-row mt-4 pt-3 border-t border-emerald-500/50 justify-between">
          <View className="flex-1">
            <Text className="text-emerald-200 text-xs font-medium">Total Pemasukan</Text>
            <Text className="text-white font-semibold text-sm">
              Rp {totalPemasukan.toLocaleString('id-ID')}
            </Text>
          </View>
          <View className="w-[1px] bg-emerald-500/50 mx-3" />
          <View className="flex-1">
            <Text className="text-emerald-200 text-xs font-medium">Total Pengeluaran</Text>
            <Text className="text-rose-200 font-semibold text-sm">
              - Rp {totalPengeluaran.toLocaleString('id-ID')}
            </Text>
          </View>
        </View>
      </View>

      {/* KONTEN TAB SESUAI PILIHAN */}
      {activeTab === 'dashboard' && renderDashboardTab()}
      {activeTab === 'analytics' && renderAnalyticsTab()}
      {activeTab === 'bills' && renderBillsTab()}

      {/* FLOATING ACTION BUTTON (+) HANYA DI TAB DASHBOARD */}
      {activeTab === 'dashboard' && (
        <TouchableOpacity
          className="absolute bottom-20 right-6 bg-emerald-500 w-16 h-16 rounded-full items-center justify-center shadow-xl border-2 border-white"
          onPress={() => setIsAddingTrx(true)}
        >
          <Text className="text-white text-4xl leading-none mt-[-4px]">+</Text>
        </TouchableOpacity>
      )}

      {/* BOTTOM TAB BAR */}
      <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex-row justify-around items-center shadow-lg">
        <TouchableOpacity
          onPress={() => setActiveTab('dashboard')}
          className="items-center py-1 flex-1"
        >
          <Text className="text-xl mb-0.5">🏠</Text>
          <Text
            className={`text-xs font-bold ${
              activeTab === 'dashboard' ? 'text-emerald-600' : 'text-gray-400'
            }`}
          >
            Beranda
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('analytics')}
          className="items-center py-1 flex-1"
        >
          <Text className="text-xl mb-0.5">📊</Text>
          <Text
            className={`text-xs font-bold ${
              activeTab === 'analytics' ? 'text-emerald-600' : 'text-gray-400'
            }`}
          >
            Statistik
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('bills')}
          className="items-center py-1 flex-1"
        >
          <Text className="text-xl mb-0.5">📅</Text>
          <Text
            className={`text-xs font-bold ${
              activeTab === 'bills' ? 'text-emerald-600' : 'text-gray-400'
            }`}
          >
            Tagihan & Hutang
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
