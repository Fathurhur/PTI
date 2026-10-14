# Sistem Informasi Ketersediaan Dosen Pembimbing TA/Skripsi — Frontend

Prototipe tampilan (HTML + Bootstrap 5 + JavaScript) dengan data contoh.

## Cara membuka di VS Code
1. Ekstrak zip, buka foldernya di VS Code (File > Open Folder).
2. Pasang ekstensi **Live Server**, klik kanan `login.html` > *Open with Live Server*.
   (Atau cukup klik dua kali `login.html` di File Explorer.)
3. Butuh internet untuk memuat Bootstrap, ikon, dan font dari CDN.

## Halaman
| File | Peran | Isi |
|---|---|---|
| login.html | Semua | Login + pilih peran (isi bebas untuk demo). Tab Koordinator hanya muncul lewat `login.html?peran=koordinator` |
| 403.html | Semua | Akses ditolak bila membuka halaman peran lain |
| dashboard.html | Mahasiswa | Dashboard slot real-time, filter, rekomendasi, status pengajuan |
| cari.html | Mahasiswa | Cari dosen + Top 5 rekomendasi |
| pengajuan.html | Mahasiswa | Status, timeline, posisi antrean, batalkan |
| riwayat.html | Mahasiswa | Riwayat + filter status |
| dosen.html | Dosen | Pengajuan masuk (terima/tolak+alasan), bimbingan, profil & topik |
| koordinator.html | Koordinator | Rekap beban + ekspor CSV, periode, kuota 0–20, pengesahan, impor CSV |

## Struktur
- `css/style.css` — semua gaya. Ganti warna di bagian `:root`.
- `js/data.js` — data contoh dosen. Nanti diganti data dari Laravel.
- `js/app.js` — fungsi inti: navbar, aturan pengajuan & antrean FIFO, modal ajukan.
- `js/mahasiswa.js`, `js/dosen.js`, `js/koordinator.js` — logika per peran.

## Catatan
- Ketiga peran memakai **satu data bersama** di localStorage (key `sd_db_v3`), jadi keputusan dosen/koordinator langsung terlihat di halaman mahasiswa (juga antar-tab). Sesi login disimpan di key `sd_sesi`.
- Satu browser hanya bisa login sebagai satu peran. Untuk berganti peran, klik **Keluar** lalu masuk lagi.
- Sesi berakhir setelah 120 menit tidak aktif. Membuka halaman peran lain diarahkan ke `403.html`.
- Pembaruan real-time memakai polling 5 detik (angka dosen contoh diacak). Di Laravel: ganti dengan `fetch()` ke endpoint JSON.
- **Panel Demo** (kanan bawah): simulasi slot Dr. Helmy/Pak Adib terbuka, slot terakhir Pak Philip direbut (memicu tawaran antrean), sesi habis, dan reset data demo.
