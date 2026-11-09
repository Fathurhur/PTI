# Sistem Informasi Ketersediaan Dosen Pembimbing TA/Skripsi Real-Time

Aplikasi web (HTML + Bootstrap 5 + JavaScript) yang tersambung ke backend **Laravel 11 + MySQL** di folder [`backend/`](backend/README.md). Semua data (dosen, kuota, pengajuan, antrean, notifikasi, periode) disimpan di database, bukan di localStorage.

## Menjalankan

1. Ikuti langkah pemasangan di [`backend/README.md`](backend/README.md), cukup sekali.
2. Buka **Laragon → Terminal**, lalu jalankan:
   ```bash
   cd backend
   php artisan serve
   ```
3. Buka **http://127.0.0.1:8000/login.html**.

Halaman frontend disajikan oleh Laravel supaya halaman dan API ada di origin yang sama (cookie sesi + CSRF). Membuka berkas HTML langsung (klik dua kali atau Live Server) **tidak akan bisa login**. Bootstrap dan font dimuat dari CDN, jadi butuh koneksi internet.

## Akun contoh (kata sandi `rahasia123`)

| Peran | Login dengan |
|---|---|
| Mahasiswa | NIM `1202230013` (belum punya pembimbing), atau `1202230201` sampai `1202230204` |
| Dosen | NIDN `0412038801` (Dr. Khodijah, IoT), `0410118804` (Yohanes, AI), `0420068503` (Philip, Cyber) |
| Koordinator | `koordinator@prodi.test` |

Untuk mengembalikan data ke kondisi awal, jalankan `php artisan migrate:fresh --seed` di folder `backend`.

## Peran dan fitur

| Peran | Halaman | Fitur |
|---|---|---|
| Mahasiswa | `dashboard.html`, `cari.html`, `pengajuan.html`, `riwayat.html` | Slot dosen real-time (polling 5 detik), rekomendasi dosen TF-IDF, cek kemiripan judul langsung saat mengetik, ajukan Pembimbing 1 dan 2, masuk antrean bila slot penuh, pantau status, unduh surat penetapan |
| Dosen | `dosen.html` | Terima atau tolak pengajuan (alasan minimal 10 karakter), lihat bimbingan dan sisa kuota, kelola profil, peminatan, kata kunci, topik rekomendasi, dan status menerima |
| Koordinator | `koordinator.html` | Rekap beban dosen dan peminatan, ekspor CSV, tambah dosen, buka/tutup/ubah periode, kuota dosen per peran, slot tambahan, kuota peminatan, ambang kemiripan, sahkan penetapan dan terbitkan surat PDF, pindahkan pengajuan, impor CSV pengguna dan arsip judul |

## Alur utama (sesuai SRS)

1. **Mahasiswa** mengajukan Pembimbing 1. Peminatan mengikuti peminatan utama dosen. Judul diperiksa kemiripannya, lalu slot dosen dan slot peminatan dikunci dalam satu transaksi. Status menjadi **Menunggu**.
2. Bila slot dosen penuh, mahasiswa bisa **masuk antrean**. Saat slot terbuka (pengajuan ditolak, kedaluwarsa, kuota dinaikkan, atau ada slot tambahan), mahasiswa pertama di antrean dipromosikan otomatis.
3. **Dosen** menerima (status **Diterima**) atau menolak dengan alasan. Pengajuan tanpa keputusan selama 7 × 24 jam menjadi **Kedaluwarsa** dan slotnya dilepas.
4. **Koordinator** mengesahkan pengajuan yang sudah Diterima. Statusnya menjadi **Ditetapkan** dan sistem menerbitkan surat `SP-TA/<periode>/<urut>` dalam format PDF.
5. Pembimbing 2 dipilih setelah Pembimbing 1 aktif, harus dosen yang berbeda, dan judul/abstraknya mengikuti Pembimbing 1.

## Struktur

- `js/app.js`: inti aplikasi (pemanggil API + CSRF, data bersama, polling, navbar, modal ajukan, sesi)
- `js/mahasiswa.js`, `js/dosen.js`, `js/koordinator.js`: logika per peran
- `js/data.js`: daftar bidang keahlian, peminatan, dan teks contoh
- `css/style.css`: semua gaya
- `backend/`: API Laravel, database, aturan bisnis MR-01 sampai MR-10, dan pengujian
