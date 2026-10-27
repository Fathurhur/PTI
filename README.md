# Sistem Dosen Pembimbing TA/Skripsi

Prototipe frontend (HTML + Bootstrap 5 + JavaScript) dengan data contoh. Data disimpan di localStorage, tanpa backend.

## Menjalankan
Buka `login.html` dengan Live Server (atau klik dua kali). Butuh internet untuk memuat Bootstrap dan font dari CDN.

## Peran dan fitur
| Peran | Halaman | Fitur |
|---|---|---|
| Mahasiswa | `dashboard.html`, `cari.html`, `pengajuan.html`, `riwayat.html` | Lihat slot dosen real-time, rekomendasi dosen (topik, judul, abstrak), ajukan Pembimbing 1 dan 2, pantau status |
| Dosen | `dosen.html` | Terima atau tolak pengajuan (alasan minimal 10 karakter), lihat bimbingan, kelola profil dan topik |
| Koordinator | `koordinator.html` | Rekap beban, tambah dosen baru, ubah status menerima/tidak menerima dosen, buka/tutup periode, atur kuota, pantau penetapan, tetapkan pengajuan tanpa menunggu dosen, pindahkan Pembimbing 1/2 mahasiswa ke dosen mana saja (keputusan prodi), impor CSV |

## Aturan utama
- Mahasiswa butuh **2 dosen pembimbing**, masing-masing 1 pengajuan aktif per periode.
- **Pembimbing 1:** mengikuti topik dan keahlian dosen. Rekomendasi dihitung dari kemiripan teks.
- **Pembimbing 2:** bebas memilih dosen mana saja yang masih punya slot. Bisa dipilih setelah Pembimbing 1 diajukan, harus dosen yang berbeda, dan judul/abstrak ikut Pembimbing 1.
- **Kuota per peran:** tiap dosen punya kuota terpisah untuk Pembimbing 1 dan Pembimbing 2 (awal 6 + 6 = 12). Koordinator mengatur keduanya sendiri-sendiri dan sisa kuota ditampilkan per peran.
- **Kuota penuh:** dosen tidak bisa diajukan untuk peran yang penuh dan tidak ada antrean.
- **Judul/topik kembar:** dibandingkan dengan pengajuan mahasiswa lain yang sudah di-ACC dosen dan arsip lulusan (`ARSIP` di `js/data.js`). Judul mirip 60% ke atas **diblokir**, topik mirip 60% ke atas hanya **peringatan**. Abstrak tidak dibandingkan.
- Dosen punya 7×24 jam untuk memutuskan, lewat itu pengajuan **Kedaluwarsa** dan slot dilepas.
- Sesi berakhir setelah 120 menit tidak aktif. Membuka halaman peran lain diarahkan ke `403.html`.

## Coba cepat
1. Login sebagai **Mahasiswa** (isi bebas): coba rekomendasi, ajukan, lalu pilih Pembimbing 2.
2. **Keluar**, login sebagai **Dosen**: terima atau tolak pengajuan.
3. **Keluar**, login sebagai **Koordinator**: pantau daftar penetapan dan pindahkan mahasiswa bila perlu.
4. Kembali ke **Mahasiswa**: cek status dan tanggal penetapan.

Satu browser hanya bisa login sebagai satu peran. Pindah peran lewat **Keluar**. **Panel Demo** (kanan bawah) untuk reset data, simulasi slot terbuka/direbut, dan sesi habis.

## Struktur
- `js/data.js`: data dosen dan periode contoh
- `js/app.js`: inti aplikasi (data bersama, aturan pengajuan, rekomendasi, navbar, sesi)
- `js/mahasiswa.js`, `js/dosen.js`, `js/koordinator.js`: logika per peran
- `css/style.css`: semua gaya
- Data bersama di localStorage key `sd_db_v7`, sesi di `sd_sesi`
