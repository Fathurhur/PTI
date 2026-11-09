# Backend Laravel: Sistem Informasi Ketersediaan Dosen Pembimbing TA

Backend API (Laravel 11, PHP 8.2+, MySQL) untuk MR-01 sampai MR-10 pada SRS.

> **Catatan versi:** Laravel 11 sudah tidak menerima tambalan keamanan, sehingga Composer akan menolak memasangnya. Di `composer.json` sudah ada `config.policy.advisories.ignore: ["laravel/framework"]` supaya pemasangan tetap bisa jalan. Konfigurasi ini cukup aman untuk demo lokal, tetapi jangan dipasang di server publik sebelum dinaikkan ke Laravel 12.

## Prasyarat (sudah tersedia di Laragon)

- PHP 8.2 atau lebih baru (Laragon: PHP 8.3) dengan ekstensi `pdo_mysql`, `mbstring`, `openssl`, `fileinfo`, `gd`
- Composer 2
- MySQL 8 (Laragon: user `root` tanpa kata sandi)

Paling mudah, buka **Laragon → Terminal** (Cmder). Di sana `php`, `composer`, dan `mysql` sudah ada di PATH.

## Pemasangan pertama kali

```bash
cd backend
composer install                 # lewati bila folder vendor/ sudah ada
copy .env.example .env           # Windows (Linux/macOS: cp .env.example .env)
php artisan key:generate
```

Buat database `sistem_dosen_ta`, bisa lewat HeidiSQL atau perintah berikut:

```bash
mysql -uroot -e "CREATE DATABASE IF NOT EXISTS sistem_dosen_ta CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
```

Buat tabel dan isi data contoh:

```bash
php artisan migrate:fresh --seed
```

## Menjalankan

Terminal 1 (wajib), server API sekaligus frontend:

```bash
php artisan serve
```

Lalu buka **http://127.0.0.1:8000/login.html**. File HTML/JS/CSS di folder induk (`PTI-main/`) disajikan oleh `routes/web.php`, supaya halaman dan API berada di origin yang sama. Hanya file `.html`, `.js`, `.css`, dan gambar yang disajikan; folder `backend/` tidak bisa diakses dari browser. Lokasi folder frontend bisa diubah lewat `FRONTEND_PATH` di `.env`.

Terminal 2 (opsional), pengirim email notifikasi dengan percobaan ulang 3 kali (MR-05):

```bash
php artisan queue:work --tries=3
```

Terminal 3 (opsional), memproses kedaluwarsa 7 x 24 jam setiap menit (MR-03/MR-05):

```bash
php artisan schedule:work
```

Tanpa terminal 3, kedaluwarsa tetap diproses paling lama sekali per menit setiap kali dashboard dibuka. Email memakai `MAIL_MAILER=log`, jadi isinya ditulis ke `storage/logs/laravel.log`. Kalau ingin melihat email di kotak masuk uji, nyalakan Mailpit dari Laragon lalu ubah `.env` menjadi `MAIL_MAILER=smtp`, `MAIL_PORT=1025`, dan buka http://localhost:8025.

## Akun contoh (kata sandi semua: `rahasia123`)

| Peran | Login dengan |
|---|---|
| Koordinator | `koordinator@prodi.test` |
| Dosen | NIDN, misalnya `0412038801` (Dr. Khodijah, IoT), `0410118804` (Yohanes, AI), `0420068503` (Philip, Cyber) |
| Mahasiswa | NIM, misalnya `1202230013` (Muhammad Fathurrohman, belum punya pembimbing) |

Kondisi data contoh: kuota P1 Dr. Helmy dibuat penuh untuk demo antrean, Mustafa Kamal berstatus tidak menerima, dan ada 1 pengajuan Menunggu dengan topik rekomendasi dosen.

## Pengujian

```bash
php artisan test
```

Ada 21 uji black-box untuk MR-01 sampai MR-10, ditambah uji penyajian frontend (termasuk memastikan folder backend tidak bisa diakses). Pengujian memakai SQLite in-memory, jadi database MySQL tidak tersentuh.

## Cara memanggil API

Semua endpoint ada di bawah `/api` dan memakai **sesi cookie + CSRF**:

1. `GET /api/csrf` → ambil `csrf_token`
2. Setiap `POST`/`PUT`/`DELETE` mengirim header `X-CSRF-TOKEN: <token>` dan `Accept: application/json`
3. `POST /api/login` dengan `{"identitas": "<email/NIM/NIDN>", "kata_sandi": "..."}`. Setelah login, ambil token baru karena sesi diperbarui.

Contoh dengan `fetch` dari frontend (origin yang sama):

```js
const { csrf_token } = await (await fetch('/api/csrf')).json();
await fetch('/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': csrf_token },
  body: JSON.stringify({ identitas: '1202230013', kata_sandi: 'rahasia123' }),
});
```

| Metode & URL | Peran | MR |
|---|---|---|
| `POST /api/login`, `POST /api/logout`, `GET /api/saya` | semua | 08 |
| `GET /api/dashboard?bidang=&peminatan=&status=` (polling 5 detik) | semua | 01, 10 |
| `GET /api/dosen/{id}` (profil + topik) | semua | 02 |
| `GET /api/notifikasi`, `POST /api/notifikasi/{id}/baca`, `POST /api/notifikasi/baca-semua` | semua | 05 |
| `GET /api/pengajuan`, `GET /api/pengajuan/{id}` (disaring sesuai peran) | semua | 03, 08 |
| `GET /api/pengajuan/{id}/surat` (PDF) | pemilik, dosen, koordinator | 07 |
| `POST /api/rekomendasi` | mahasiswa | 06 |
| `POST /api/cek-kemiripan` | mahasiswa | 09 |
| `POST /api/pengajuan` | mahasiswa | 03, 04, 09, 10 |
| `POST /api/antrean`, `GET /api/antrean` | mahasiswa | 05 |
| `POST /api/pengajuan/{id}/putuskan` (`terima`/`tolak` + `alasan`) | dosen | 03 |
| `GET/PUT /api/dosen-saya/profil`, `POST/PUT/DELETE /api/dosen-saya/topik/{id}`, `GET /api/dosen-saya/bimbingan` | dosen | 02 |
| `GET/POST /api/koordinator/periode`, `PUT .../periode/{id}` (tanggal), `POST .../periode/{id}/tutup`, `PUT .../periode/{id}/ambang` | koordinator | 07, 09 |
| `POST /api/koordinator/dosen` (tambah dosen), `PUT .../dosen/{id}/menerima` | koordinator | 07 |
| `PUT /api/koordinator/dosen/{id}/kuota`, `POST .../dosen/{id}/slot-tambahan`, `PUT .../kuota-peminatan` | koordinator | 07, 10 |
| `POST /api/koordinator/pengajuan/{id}/pindahkan`, `POST .../pengajuan/{id}/sahkan` | koordinator | 07 |
| `GET /api/koordinator/rekap`, `GET .../rekap.csv`, `GET .../log` | koordinator | 07 |
| `POST /api/koordinator/impor/arsip` (CSV: `judul,tahun,abstrak,sumber`) | koordinator | 09 |
| `POST /api/koordinator/impor/pengguna` (CSV: `peran,nama,email,kata_sandi,nim,angkatan,nidn,peminatan`) | koordinator | 07 |

Lihat semua route dengan `php artisan route:list --path=api`.

## Peta kode ke MR

| MR | File |
|---|---|
| 01 Dashboard real-time | `app/Services/DashboardService.php`, `UmumController@dashboard` |
| 02 Profil & topik dosen | `Api/DosenController.php` |
| 03 Pengajuan & keputusan | `app/Services/PengajuanService.php`, `Api/PengajuanController.php` |
| 04 Cegah rebutan slot | `PeminatanService::ambilSlotAtomik()` (SELECT ... FOR UPDATE) |
| 05 Antrean & notifikasi | `AntreanService.php`, `PengajuanService::promosikanAntrean()`, `NotifikasiService.php`, `Jobs/KirimEmailNotifikasi.php` |
| 06 Rekomendasi dosen | `TfIdfService::rekomendasiDosen()` |
| 07 Administrasi | `KoordinatorService.php`, `SuratPenetapanService.php`, `Api/KoordinatorController.php`, `resources/views/surat/penetapan.blade.php` |
| 08 Hak akses | `AutentikasiService.php`, `Http/Middleware/CekIzin.php`, `Api/AuthController.php` |
| 09 Kemiripan judul | `KemiripanJudulService.php` |
| 10 Peminatan & kuota bidang | `PeminatanService.php` |

Struktur tabel mengikuti ERD SRS (`database/migrations/2026_11_09_000001_create_tabel_sistem_ta.php`). Satu-satunya tambahan adalah tabel `log_aktivitas`, untuk mencatat slot tambahan, pemindahan, dan perubahan kuota.
