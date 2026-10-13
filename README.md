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
| login.html | Semua | Login + pilih peran (isi bebas untuk demo) |
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
- Pembaruan real-time memakai polling 5 detik (disimulasikan acak). Di Laravel: ganti dengan `fetch()` ke endpoint JSON.
- Klik **Panel Demo** (kanan bawah) untuk reset data atau mensimulasikan slot dosen terbuka.
- Data pengajuan mahasiswa disimpan di localStorage browser, hanya untuk demo.
