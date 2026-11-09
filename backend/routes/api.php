<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DosenController;
use App\Http\Controllers\Api\KoordinatorController;
use App\Http\Controllers\Api\PengajuanController;
use App\Http\Controllers\Api\SuratController;
use App\Http\Controllers\Api\UmumController;
use Illuminate\Support\Facades\Route;

/*
| Semua route di sini berprefiks /api dan memakai grup middleware "web" (sesi + CSRF).
| Hak akses tiap route dijaga middleware izin:<kode> (AutentikasiService::HAK_AKSES, MR-08).
*/

// Token CSRF untuk frontend: kirim balik di header X-CSRF-TOKEN pada setiap POST/PUT/DELETE
Route::get('/csrf', fn () => response()->json(['csrf_token' => csrf_token()]));

// MR-08: autentikasi (dibatasi 5 percobaan per menit)
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1');
Route::post('/logout', [AuthController::class, 'logout']);
Route::get('/saya', [AuthController::class, 'saya'])->middleware('izin:dashboard.lihat');

// Bersama semua peran
Route::middleware('izin:dashboard.lihat')->group(function () {
    Route::get('/dashboard', [UmumController::class, 'dashboard']);                  // MR-01
    Route::get('/dosen/{dosen}', [UmumController::class, 'profilDosen']);           // MR-02
});
Route::middleware('izin:notifikasi.lihat')->group(function () {
    Route::get('/notifikasi', [UmumController::class, 'notifikasi']);               // MR-05
    Route::post('/notifikasi/baca-semua', [UmumController::class, 'bacaSemuaNotifikasi']);
    Route::post('/notifikasi/{id}/baca', [UmumController::class, 'bacaNotifikasi']);
});
Route::middleware('izin:pengajuan.lihat')->group(function () {
    Route::get('/pengajuan', [PengajuanController::class, 'index']);
    Route::get('/pengajuan/{pengajuan}', [PengajuanController::class, 'show']);
    Route::get('/pengajuan/{pengajuan}/surat', [SuratController::class, 'unduh']);  // MR-07
});

// Mahasiswa
Route::post('/rekomendasi', [PengajuanController::class, 'rekomendasi'])->middleware('izin:rekomendasi.lihat'); // MR-06
Route::middleware('izin:pengajuan.buat')->group(function () {
    Route::post('/pengajuan', [PengajuanController::class, 'store']);                // MR-03, MR-04, MR-10
    Route::post('/cek-kemiripan', [PengajuanController::class, 'cekKemiripan']);    // MR-09
});
Route::middleware('izin:antrean.masuk')->group(function () {
    Route::post('/antrean', [PengajuanController::class, 'masukAntrean']);          // MR-05
    Route::get('/antrean', [PengajuanController::class, 'antreanSaya']);
});

// Dosen
Route::post('/pengajuan/{pengajuan}/putuskan', [PengajuanController::class, 'putuskan'])->middleware('izin:pengajuan.putuskan'); // MR-03
Route::prefix('dosen-saya')->group(function () {
    Route::get('/profil', [DosenController::class, 'profil'])->middleware('izin:profil_dosen.kelola');          // MR-02
    Route::put('/profil', [DosenController::class, 'ubahProfil'])->middleware('izin:profil_dosen.kelola');
    Route::post('/topik', [DosenController::class, 'simpanTopik'])->middleware('izin:topik_dosen.kelola');
    Route::put('/topik/{topik}', [DosenController::class, 'simpanTopik'])->middleware('izin:topik_dosen.kelola');
    Route::delete('/topik/{topik}', [DosenController::class, 'nonaktifkanTopik'])->middleware('izin:topik_dosen.kelola');
    Route::get('/bimbingan', [DosenController::class, 'bimbingan'])->middleware('izin:bimbingan.lihat');
});

// Koordinator (MR-07, MR-09, MR-10)
Route::prefix('koordinator')->group(function () {
    Route::get('/periode', [KoordinatorController::class, 'daftarPeriode'])->middleware('izin:periode.kelola');
    Route::post('/periode', [KoordinatorController::class, 'bukaPeriode'])->middleware('izin:periode.kelola');
    Route::put('/periode/{periode}', [KoordinatorController::class, 'ubahPeriode'])->middleware('izin:periode.kelola');
    Route::post('/periode/{periode}/tutup', [KoordinatorController::class, 'tutupPeriode'])->middleware('izin:periode.kelola');
    Route::put('/periode/{periode}/ambang', [KoordinatorController::class, 'ubahAmbang'])->middleware('izin:ambang_kemiripan.atur');

    Route::post('/dosen', [KoordinatorController::class, 'tambahDosen'])->middleware('izin:data_pengguna.impor');
    Route::put('/dosen/{dosen}/menerima', [KoordinatorController::class, 'ubahMenerima'])->middleware('izin:kuota_dosen.kelola');
    Route::put('/dosen/{dosen}/kuota', [KoordinatorController::class, 'ubahKuotaDosen'])->middleware('izin:kuota_dosen.kelola');
    Route::post('/dosen/{dosen}/slot-tambahan', [KoordinatorController::class, 'slotTambahan'])->middleware('izin:slot_tambahan.beri');
    Route::put('/kuota-peminatan', [KoordinatorController::class, 'ubahKuotaPeminatan'])->middleware('izin:kuota_peminatan.kelola');

    Route::post('/pengajuan/{pengajuan}/pindahkan', [KoordinatorController::class, 'pindahkan'])->middleware('izin:pengajuan.pindahkan');
    Route::post('/pengajuan/{pengajuan}/sahkan', [KoordinatorController::class, 'sahkan'])->middleware('izin:penetapan.sahkan');

    Route::get('/rekap', [KoordinatorController::class, 'rekap'])->middleware('izin:rekap_beban.ekspor');
    Route::get('/rekap.csv', [KoordinatorController::class, 'rekapCsv'])->middleware('izin:rekap_beban.ekspor');
    Route::get('/log', [KoordinatorController::class, 'log'])->middleware('izin:periode.kelola');

    Route::post('/impor/arsip', [KoordinatorController::class, 'imporArsip'])->middleware('izin:arsip_judul.impor');
    Route::post('/impor/pengguna', [KoordinatorController::class, 'imporPengguna'])->middleware('izin:data_pengguna.impor');
});
