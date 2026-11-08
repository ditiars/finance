import React, { useState, useEffect } from 'react';
import { Text, View, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { router } from 'expo-router';
import { db } from '../db';
import { transactions, Transaction } from '../db/schema';
import { desc } from 'drizzle-orm';
import { KATEGORI_LIST, METODE_LIST } from '../constants/categories';

interface FrequentItem {
  nama: string;
  count: number;
  lastPrice: number;
  kategori: string;
  metode: string;
}

export default function AddTransactionScreen() {
  const [namaBarang, setNamaBarang] = useState('');
  const [nominal, setNominal] = useState('');
  const [kategori, setKategori] = useState(KATEGORI_LIST[0].nama);
  const [metode, setMetode] = useState(METODE_LIST[0].nama);

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [frequentItems, setFrequentItems] = useState<FrequentItem[]>([]);

  useEffect(() => {
    loadSuggestionsAndFrequent();
  }, []);

  const loadSuggestionsAndFrequent = async () => {
    try {
      const trxData: Transaction[] = await db
        .select()
        .from(transactions)
        .orderBy(desc(transactions.id));

      // 1. Hitung barang paling sering dibeli
      const freqMap: Record<string, FrequentItem> = {};
      trxData.forEach((trx: Transaction) => {
        if (!freqMap[trx.namaBarang]) {
          freqMap[trx.namaBarang] = {
            nama: trx.namaBarang,
            count: 0,
            lastPrice: trx.nominal,
            kategori: trx.kategori,
            metode: trx.metodePembayaran,
          };
        }
        freqMap[trx.namaBarang].count += 1;
      });

      const topPicks = Object.values(freqMap)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      setFrequentItems(topPicks);

      // 2. Autocomplete suggestions
      const uniqueItems = await db
        .select({ nama: transactions.namaBarang })
        .from(transactions)
        .groupBy(transactions.namaBarang);
      setSuggestions(uniqueItems.map((item: { nama: string }) => item.nama));
    } catch (error) {
      console.error('Error memuat saran barang:', error);
    }
  };

  const handleSimpan = async () => {
    if (!namaBarang.trim() || !nominal.trim()) {
      return Alert.alert('Error', 'Nama dan nominal wajib diisi!');
    }

    const nominalNumber = parseInt(nominal.replace(/[^0-9]/g, ''), 10);
    if (isNaN(nominalNumber) || nominalNumber <= 0) {
      return Alert.alert('Error', 'Nominal harus berupa angka valid!');
    }

    try {
      await db.insert(transactions).values({
        tanggal: new Date().toISOString(),
        namaBarang: namaBarang.trim(),
        nominal: nominalNumber,
        kategori,
        metodePembayaran: metode,
      });

      // Kembali ke dashboard
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Gagal menyimpan transaksi');
    }
  };

  return (
    <ScrollView className="flex-1 bg-white px-6 pt-12" keyboardShouldPersistTaps="handled">
      <View className="flex-row justify-between items-center mb-6">
        <Text className="text-2xl font-bold text-gray-800">Tambah Pengeluaran</Text>
        <TouchableOpacity onPress={() => router.back()} className="p-2">
          <Text className="text-gray-400 text-lg font-bold">✕</Text>
        </TouchableOpacity>
      </View>

      {/* Pintasan: Paling Sering Dibeli */}
      {frequentItems.length > 0 && (
        <View className="mb-6">
          <Text className="text-gray-500 mb-2 ml-1 text-xs font-semibold uppercase tracking-wider">
            Paling Sering Dibeli
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="max-h-12">
            {frequentItems.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => {
                  setNamaBarang(item.nama);
                  setNominal(item.lastPrice.toString());
                  setKategori(item.kategori);
                  setMetode(item.metode);
                }}
                className="bg-emerald-50 px-4 py-2 mr-2 rounded-full border border-emerald-200 items-center justify-center flex-row"
              >
                <Text className="text-emerald-700 font-bold mr-1">{item.nama}</Text>
                <Text className="text-emerald-600 text-xs">(Rp {item.lastPrice.toLocaleString('id-ID')})</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Input Nama Barang */}
      <Text className="text-gray-600 mb-1 ml-1 font-semibold text-sm">Nama Pengeluaran</Text>
      <TextInput
        className="bg-gray-100 rounded-xl px-4 py-3 mb-2 text-lg text-gray-800"
        placeholder="Cth: Nasi Padang, Bensin..."
        value={namaBarang}
        onChangeText={setNamaBarang}
      />

      {/* Autocomplete Suggestions */}
      {namaBarang.length > 0 && !frequentItems.find((i) => i.nama.toLowerCase() === namaBarang.toLowerCase()) && (
        <ScrollView className="max-h-28 mb-4 bg-gray-50 rounded-xl border border-gray-200">
          {suggestions
            .filter((s) => s.toLowerCase().includes(namaBarang.toLowerCase()) && s !== namaBarang)
            .map((saran, idx) => (
              <TouchableOpacity
                key={idx}
                className="p-3 border-b border-gray-100"
                onPress={() => setNamaBarang(saran)}
              >
                <Text className="text-gray-700">{saran}</Text>
              </TouchableOpacity>
            ))}
        </ScrollView>
      )}

      {/* Input Nominal */}
      <Text className="text-gray-600 mb-1 ml-1 font-semibold text-sm mt-2">Nominal (Rp)</Text>
      <TextInput
        className="bg-gray-100 rounded-xl px-4 py-3 mb-5 text-lg text-gray-800"
        placeholder="Cth: 25000"
        keyboardType="numeric"
        value={nominal}
        onChangeText={setNominal}
      />

      {/* Pilihan Kategori */}
      <Text className="text-gray-600 mb-2 ml-1 font-semibold text-sm">Pilih Kategori</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5 max-h-12">
        {KATEGORI_LIST.map((kat) => {
          const isSelected = kategori === kat.nama;
          return (
            <TouchableOpacity
              key={kat.nama}
              onPress={() => setKategori(kat.nama)}
              className={`px-4 py-2 mr-2 rounded-full flex-row items-center border ${
                isSelected ? 'bg-emerald-600 border-emerald-600' : 'bg-gray-100 border-gray-200'
              }`}
            >
              <Text className="mr-1">{kat.icon}</Text>
              <Text className={isSelected ? 'text-white font-medium' : 'text-gray-700'}>
                {kat.nama}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Pilihan Metode Pembayaran */}
      <Text className="text-gray-600 mb-2 ml-1 font-semibold text-sm">Metode Pembayaran</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-8 max-h-12">
        {METODE_LIST.map((met) => {
          const isSelected = metode === met.nama;
          return (
            <TouchableOpacity
              key={met.nama}
              onPress={() => setMetode(met.nama)}
              className={`px-4 py-2 mr-2 rounded-full flex-row items-center border ${
                isSelected ? 'bg-emerald-600 border-emerald-600' : 'bg-gray-100 border-gray-200'
              }`}
            >
              <Text className="mr-1">{met.icon}</Text>
              <Text className={isSelected ? 'text-white font-medium' : 'text-gray-700'}>
                {met.nama}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Tombol Aksi */}
      <View className="flex-row justify-between pb-12">
        <TouchableOpacity
          className="flex-1 bg-gray-200 py-4 rounded-xl mr-2 items-center"
          onPress={() => router.back()}
        >
          <Text className="text-gray-700 font-bold text-lg">Batal</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-1 bg-emerald-600 py-4 rounded-xl ml-2 items-center"
          onPress={handleSimpan}
        >
          <Text className="text-white font-bold text-lg">Simpan</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

