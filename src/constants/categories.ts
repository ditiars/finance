export interface KategoriItem {
  nama: string;
  icon: string;
}

export interface MetodeItem {
  nama: string;
  icon: string;
}

export const KATEGORI_LIST: KategoriItem[] = [
  { nama: 'Makanan', icon: '🍔' },
  { nama: 'Transport', icon: '🚗' },
  { nama: 'Belanja', icon: '🛍️' },
  { nama: 'Tagihan', icon: '⚡' },
  { nama: 'Hiburan', icon: '☕' },
  { nama: 'Lainnya', icon: '📦' },
];

export const METODE_LIST: MetodeItem[] = [
  { nama: 'Tunai', icon: '💵' },
  { nama: 'QRIS', icon: '📱' },
  { nama: 'Transfer', icon: '💳' },
  { nama: 'E-Wallet', icon: '👛' },
];

export function getKategoriIcon(namaKategori: string): string {
  const found = KATEGORI_LIST.find(
    (k) => k.nama.toLowerCase() === namaKategori.toLowerCase()
  );
  return found?.icon || '🏷️';
}

