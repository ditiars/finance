import React, { useState, useCallback } from 'react';
import { Text, View, ScrollView, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { db } from '../db';
import { transactions, monthlyIncomes, Transaction } from '../db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { getKategoriIcon } from '../constants/categories';

export default function DashboardScreen() {
  const [isTopUpMode, setIsTopUpMode] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');

  // State Data
  const [history, setHistory] = useState<Transaction[]>([]);
  const [sisaUang, setSisaUang] = useState(0);
  const [totalPemasukan, setTotalPemasukan] = useState(0);
  const [totalPengeluaran, setTotalPengeluaran] = useState(0);

  const currentPeriode = new Date().toISOString().slice(0, 7);

  const loadDashboardData = useCallback(async () => {
    try {
      const trxData: Transaction[] = await db
        .select()
        .from(transactions)
        .orderBy(desc(transactions.id));
      setHistory(trxData);

      const currentMonthIncomes = await db
        .select()
        .from(monthlyIncomes)
        .where(eq(monthlyIncomes.periode, currentPeriode));
      let pemasukanBulanIni = 0;

      if (currentMonthIncomes.length === 0) {
        await db.insert(monthlyIncomes).values({ periode: currentPeriode, nominalPemasukan: 0 });
      } else {
        pemasukanBulanIni = currentMonthIncomes[0].nominalPemasukan;
      }

      const currentMonthTrx = trxData.filter((t: Transaction) => t.tanggal.startsWith(currentPeriode));
      const pengeluaranBulanIni = currentMonthTrx.reduce(
        (sum: number, item: Transaction) => sum + item.nominal,
        0
      );

      setTotalPemasukan(pemasukanBulanIni);
      setTotalPengeluaran(pengeluaranBulanIni);
      setSisaUang(pemasukanBulanIni - pengeluaranBulanIni);
    } catch (error) {
      console.error('Error memuat data dashboard:', error);
    }
  }, [currentPeriode]);

  // Refresh data saat layar kembali aktif dari form tambah
  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [loadDashboardData])
  );

  const handleTopUp = async () => {
    const amount = parseInt(topUpAmount.replace(/[^0-9]/g, ''), 10);
    if (isNaN(amount) || amount <= 0) return;
    try {
      await db.run(
        sql`UPDATE monthly_incomes SET nominal_pemasukan = nominal_pemasukan + ${amount} WHERE periode = ${currentPeriode}`
      );
      setTopUpAmount('');
      setIsTopUpMode(false);
      loadDashboardData();
    } catch (error) {
      Alert.alert('Error', 'Gagal menambah saldo');
    }
  };

  const confirmDelete = (id: number, nama: string) => {
    const doDelete = async () => {
      await db.delete(transactions).where(eq(transactions.id, id));
      loadDashboardData();
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Hapus pengeluaran '${nama}'?`)) {
        doDelete();
      }
    } else {
      Alert.alert('Hapus Transaksi', `Yakin ingin membatalkan pengeluaran '${nama}'?`, [
        { text: 'Batal', style: 'cancel' },
        { text: 'Hapus', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header Finansial */}
      <View className="bg-emerald-600 px-6 pt-16 pb-6 rounded-b-3xl shadow-md">
        <View className="flex-row justify-between items-center mb-1">
          <Text className="text-emerald-100 text-sm font-medium">Sisa Saldo ({currentPeriode})</Text>
          <TouchableOpacity
            onPress={() => setIsTopUpMode(!isTopUpMode)}
            className="bg-emerald-500 px-3 py-1 rounded-full border border-emerald-400"
          >
            <Text className="text-white text-xs font-bold">+ Saldo</Text>
          </TouchableOpacity>
        </View>

        <Text className={`text-4xl font-bold tracking-tight ${sisaUang < 0 ? 'text-rose-200' : 'text-white'}`}>
          Rp {sisaUang.toLocaleString('id-ID')}
        </Text>

        {/* Input Top Up Saldo */}
        {isTopUpMode && (
          <View className="mt-4 flex-row items-center">
            <TextInput
              className="bg-white/20 text-white rounded-lg px-3 py-2 flex-1 mr-2"
              placeholder="Jumlah pemasukan..."
              placeholderTextColor="#a7f3d0"
              keyboardType="numeric"
              value={topUpAmount}
              onChangeText={setTopUpAmount}
            />
            <TouchableOpacity onPress={handleTopUp} className="bg-white px-4 py-2 rounded-lg">
              <Text className="text-emerald-700 font-bold">Isi</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Mini Ringkasan */}
        <View className="flex-row mt-5 pt-4 border-t border-emerald-500/50 justify-between">
          <View className="flex-1">
            <Text className="text-emerald-200 text-xs font-medium">Total Pemasukan</Text>
            <Text className="text-white font-semibold text-base">
              Rp {totalPemasukan.toLocaleString('id-ID')}
            </Text>
          </View>
          <View className="w-[1px] bg-emerald-500/50 mx-3" />
          <View className="flex-1">
            <Text className="text-emerald-200 text-xs font-medium">Total Pengeluaran</Text>
            <Text className="text-rose-200 font-semibold text-base">
              - Rp {totalPengeluaran.toLocaleString('id-ID')}
            </Text>
          </View>
        </View>
      </View>

      {/* Riwayat Pengeluaran */}
      <ScrollView className="flex-1 px-6 pt-5">
        <View className="flex-row justify-between items-center mb-1">
          <Text className="text-gray-800 text-lg font-bold">Pengeluaran Terakhir</Text>
          <Text className="text-gray-400 text-xs">{history.length} transaksi</Text>
        </View>
        <Text className="text-gray-400 text-xs mb-4">Tahan lama (long-press) item untuk menghapus</Text>

        {history.length === 0 ? (
          <View className="items-center justify-center py-12">
            <Text className="text-4xl mb-2">💸</Text>
            <Text className="text-gray-500 font-medium">Belum ada pengeluaran dicatat.</Text>
            <Text className="text-gray-400 text-xs mt-1">Tekan tombol + di bawah untuk mulai mencatat.</Text>
          </View>
        ) : (
          history.map((item) => (
            <TouchableOpacity
              key={item.id}
              onLongPress={() => confirmDelete(item.id, item.namaBarang)}
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
                - Rp {item.nominal.toLocaleString('id-ID')}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Floating Action Button (+) Navigasi ke /add */}
      <TouchableOpacity
        className="absolute bottom-10 right-8 bg-emerald-500 w-16 h-16 rounded-full items-center justify-center shadow-lg"
        onPress={() => router.push('/add')}
      >
        <Text className="text-white text-4xl leading-none mt-[-4px]">+</Text>
      </TouchableOpacity>
    </View>
  );
}

