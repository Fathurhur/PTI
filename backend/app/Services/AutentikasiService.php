<?php

namespace App\Services;

use InvalidArgumentException;
use RuntimeException;

/**
 * Service Autentikasi & Hak Akses (RBAC)
 * Sesuai Dokumen SRS MR-08 (Membatasi akses data dan fitur sesuai peran pengguna)
 * Submodul 8: Autentikasi dan Hak Akses
 *
 * Aturan SRS yang diimplementasikan:
 * - Pembatasan akses ditegakkan di sisi server untuk 3 peran (Mahasiswa, Dosen, Koordinator)
 * - Akses tanpa hak menghasilkan HTTP 403
 * - Kata sandi disimpan dalam bentuk hash bcrypt
 * - Sesi berakhir setelah 120 menit tidak aktif
 * - Mahasiswa hanya dapat melihat pengajuan miliknya (dosen hanya pengajuan yang ditujukan kepadanya)
 * - Login memakai Email/NIM/NIDN dan kata sandi
 *
 * Standar: OWASP ASVS (V2 Authentication, V3 Session Management, V4 Access Control), UU PDP
 */
class AutentikasiService
{
    public const PERAN_MAHASISWA   = 'mahasiswa';
    public const PERAN_DOSEN       = 'dosen';
    public const PERAN_KOORDINATOR = 'koordinator';

    public const DAFTAR_PERAN = [
        self::PERAN_MAHASISWA,
        self::PERAN_DOSEN,
        self::PERAN_KOORDINATOR,
    ];

    /** Sesi kedaluwarsa setelah 120 menit tidak aktif (SRS MR-08) */
    public const BATAS_SESI_MENIT = 120;

    /** Cost bcrypt. OWASP ASVS menyarankan minimal 10. */
    public const BCRYPT_COST = 12;

    /** HTTP status untuk akses tanpa hak (SRS MR-08) */
    public const HTTP_FORBIDDEN    = 403;
    public const HTTP_UNAUTHORIZED = 401;

    /**
     * Matriks hak akses: kode izin => peran yang boleh.
     * Selain izin yang tercantum di sini, semua akses DITOLAK (deny by default, OWASP ASVS V4.1.3).
     */
    public const HAK_AKSES = [
        // Bersama
        'dashboard.lihat'          => [self::PERAN_MAHASISWA, self::PERAN_DOSEN, self::PERAN_KOORDINATOR],
        'notifikasi.lihat'         => [self::PERAN_MAHASISWA, self::PERAN_DOSEN, self::PERAN_KOORDINATOR],
        'pengajuan.lihat'          => [self::PERAN_MAHASISWA, self::PERAN_DOSEN, self::PERAN_KOORDINATOR], // dibatasi kepemilikan

        // Mahasiswa (MR-01, MR-03, MR-05, MR-06, MR-10)
        'rekomendasi.lihat'        => [self::PERAN_MAHASISWA],
        'pengajuan.buat'           => [self::PERAN_MAHASISWA],
        'antrean.masuk'            => [self::PERAN_MAHASISWA],
        'riwayat.lihat'            => [self::PERAN_MAHASISWA],

        // Dosen (MR-02, MR-03)
        'profil_dosen.kelola'      => [self::PERAN_DOSEN],
        'saran_judul.kelola'       => [self::PERAN_DOSEN],
        'pengajuan.putuskan'       => [self::PERAN_DOSEN],
        'bimbingan.lihat'          => [self::PERAN_DOSEN],

        // Koordinator (MR-07, MR-09, MR-10)
        'periode.kelola'           => [self::PERAN_KOORDINATOR],
        'kuota_dosen.kelola'       => [self::PERAN_KOORDINATOR],
        'slot_tambahan.beri'       => [self::PERAN_KOORDINATOR],
        'pengajuan.pindahkan'      => [self::PERAN_KOORDINATOR],
        'penetapan.sahkan'         => [self::PERAN_KOORDINATOR],
        'rekap_beban.ekspor'       => [self::PERAN_KOORDINATOR],
        'data_pengguna.impor'      => [self::PERAN_KOORDINATOR],
        'arsip_judul.impor'        => [self::PERAN_KOORDINATOR],
    ];

    /**
     * Menu/halaman yang boleh dibuka tiap peran (otorisasi menu, Submodul 8 Output).
     */
    public const MENU_PERAN = [
        self::PERAN_MAHASISWA   => ['dashboard', 'cari', 'pengajuan', 'riwayat'],
        self::PERAN_DOSEN       => ['dosen'],
        self::PERAN_KOORDINATOR => ['koordinator'],
    ];

    // =========================================================
    // 1. KATA SANDI (MR-08: hash bcrypt)
    // =========================================================

    /**
     * Hash kata sandi memakai bcrypt. Kata sandi asli tidak pernah disimpan.
     *
     * @throws InvalidArgumentException jika kata sandi kurang dari 8 karakter
     */
    public function hashKataSandi(string $kataSandi): string
    {
        if (mb_strlen($kataSandi) < 8) {
            throw new InvalidArgumentException('Kata sandi minimal 8 karakter.');
        }
        // bcrypt hanya membaca 72 byte pertama
        if (strlen($kataSandi) > 72) {
            throw new InvalidArgumentException('Kata sandi maksimal 72 byte.');
        }

        return password_hash($kataSandi, PASSWORD_BCRYPT, ['cost' => self::BCRYPT_COST]);
    }

    /**
     * Cocokkan kata sandi dengan hash bcrypt yang tersimpan (perbandingan waktu-konstan).
     */
    public function verifikasiKataSandi(string $kataSandi, string $hash): bool
    {
        return password_verify($kataSandi, $hash);
    }

    /**
     * true bila hash perlu diperbarui (misalnya cost bcrypt dinaikkan).
     */
    public function perluHashUlang(string $hash): bool
    {
        return password_needs_rehash($hash, PASSWORD_BCRYPT, ['cost' => self::BCRYPT_COST]);
    }

    // =========================================================
    // 2. LOGIN (Submodul 8: Email/NIM/NIDN dan kata sandi)
    // =========================================================

    /**
     * Autentikasi pengguna dengan Email, NIM (mahasiswa), atau NIDN (dosen).
     * Pesan gagal dibuat sama untuk semua kasus agar tidak membocorkan akun mana yang terdaftar.
     *
     * @param string $identitas  Email, NIM, atau NIDN
     * @param string $kataSandi  Kata sandi polos dari form login
     * @param array  $daftarUser Data users dari DB:
     *                           [['id', 'nama', 'email', 'password', 'role', 'nim'?, 'nidn'?,
     *                             'mahasiswa_id'?, 'dosen_id'?, 'aktif'?], ...]
     * @return array ['berhasil' => bool, 'status_http' => int, 'pesan' => string, 'user' => array|null]
     */
    public function login(string $identitas, string $kataSandi, array $daftarUser): array
    {
        $identitas = trim($identitas);
        $gagal = [
            'berhasil'    => false,
            'status_http' => self::HTTP_UNAUTHORIZED,
            'pesan'       => 'Email/NIM/NIDN atau kata sandi salah.',
            'user'        => null,
        ];

        if ($identitas === '' || $kataSandi === '') {
            return $gagal;
        }

        $user = $this->cariUserByIdentitas($identitas, $daftarUser);

        if ($user === null) {
            // Tetap jalankan verifikasi pada hash palsu agar waktu respons setara (mencegah enumerasi akun)
            password_verify($kataSandi, $this->hashPalsu());
            return $gagal;
        }

        if (!$this->verifikasiKataSandi($kataSandi, $user['password'] ?? '')) {
            return $gagal;
        }

        if (array_key_exists('aktif', $user) && !$user['aktif']) {
            return [
                'berhasil'    => false,
                'status_http' => self::HTTP_FORBIDDEN,
                'pesan'       => 'Akun Anda tidak aktif. Hubungi Koordinator TA.',
                'user'        => null,
            ];
        }

        if (!in_array($user['role'] ?? null, self::DAFTAR_PERAN, true)) {
            return [
                'berhasil'    => false,
                'status_http' => self::HTTP_FORBIDDEN,
                'pesan'       => 'Peran akun tidak dikenali.',
                'user'        => null,
            ];
        }

        unset($user['password']); // hash tidak ikut dibawa ke sesi

        return [
            'berhasil'    => true,
            'status_http' => 200,
            'pesan'       => 'Login berhasil.',
            'user'        => $user,
        ];
    }

    /** Hash bcrypt pengganti untuk akun yang tidak ditemukan (dibuat sekali per proses). */
    private ?string $hashPalsu = null;

    private function hashPalsu(): string
    {
        return $this->hashPalsu ??= password_hash(bin2hex(random_bytes(16)), PASSWORD_BCRYPT, ['cost' => self::BCRYPT_COST]);
    }

    /**
     * Cari user berdasarkan email (tidak peka huruf besar), NIM, atau NIDN.
     */
    public function cariUserByIdentitas(string $identitas, array $daftarUser): ?array
    {
        $identitasLower = mb_strtolower($identitas);

        foreach ($daftarUser as $user) {
            if (mb_strtolower($user['email'] ?? '') === $identitasLower) {
                return $user;
            }
            if (($user['role'] ?? '') === self::PERAN_MAHASISWA && ($user['nim'] ?? null) === $identitas) {
                return $user;
            }
            if (($user['role'] ?? '') === self::PERAN_DOSEN && ($user['nidn'] ?? null) === $identitas) {
                return $user;
            }
        }
        return null;
    }

    // =========================================================
    // 3. SESI (MR-08: berakhir setelah 120 menit tidak aktif)
    // =========================================================

    /**
     * Buat data sesi baru setelah login berhasil.
     * Token acak 256-bit; di Laravel padankan dengan $request->session()->regenerate().
     *
     * @param array $user Data user hasil login()
     * @param int|null $sekarang Timestamp (untuk pengujian), default time()
     */
    public function buatSesi(array $user, ?int $sekarang = null): array
    {
        $sekarang = $sekarang ?? time();

        return [
            'token'          => bin2hex(random_bytes(32)),
            'user_id'        => $user['id'],
            'peran'          => $user['role'],
            'mahasiswa_id'   => $user['mahasiswa_id'] ?? null,
            'dosen_id'       => $user['dosen_id'] ?? null,
            'dibuat_at'      => $sekarang,
            'terakhir_aktif' => $sekarang,
        ];
    }

    /**
     * Cek apakah sesi masih berlaku (belum 120 menit tidak aktif).
     */
    public function sesiMasihBerlaku(array $sesi, ?int $sekarang = null): bool
    {
        $sekarang = $sekarang ?? time();
        $terakhir = (int) ($sesi['terakhir_aktif'] ?? 0);

        return ($sekarang - $terakhir) <= self::BATAS_SESI_MENIT * 60;
    }

    /**
     * Validasi sesi pada setiap request; bila masih berlaku, waktu aktivitas diperbarui.
     *
     * @return array ['valid' => bool, 'status_http' => int, 'pesan' => string, 'sesi' => array|null]
     */
    public function validasiSesi(?array $sesi, ?int $sekarang = null): array
    {
        $sekarang = $sekarang ?? time();

        if (empty($sesi) || empty($sesi['token']) || empty($sesi['peran'])) {
            return [
                'valid'       => false,
                'status_http' => self::HTTP_UNAUTHORIZED,
                'pesan'       => 'Silakan login terlebih dahulu.',
                'sesi'        => null,
            ];
        }

        if (!$this->sesiMasihBerlaku($sesi, $sekarang)) {
            return [
                'valid'       => false,
                'status_http' => self::HTTP_UNAUTHORIZED,
                'pesan'       => 'Sesi Anda berakhir karena tidak aktif selama ' . self::BATAS_SESI_MENIT . ' menit. Silakan login kembali.',
                'sesi'        => null,
            ];
        }

        $sesi['terakhir_aktif'] = $sekarang;

        return [
            'valid'       => true,
            'status_http' => 200,
            'pesan'       => 'Sesi valid.',
            'sesi'        => $sesi,
        ];
    }

    // =========================================================
    // 4. OTORISASI FITUR (MR-08: RBAC, tanpa hak => 403)
    // =========================================================

    /**
     * Cek apakah peran boleh memakai izin/fitur tertentu. Izin yang tidak terdaftar selalu ditolak.
     */
    public function punyaIzin(string $peran, string $izin): bool
    {
        $perannya = self::HAK_AKSES[$izin] ?? [];
        return in_array($peran, $perannya, true);
    }

    /**
     * Hasil otorisasi untuk dipakai controller/middleware.
     *
     * @return array ['diizinkan' => bool, 'status_http' => 200|403, 'pesan' => string]
     */
    public function otorisasi(array $sesi, string $izin): array
    {
        $peran = $sesi['peran'] ?? '';

        if ($this->punyaIzin($peran, $izin)) {
            return ['diizinkan' => true, 'status_http' => 200, 'pesan' => 'Akses diizinkan.'];
        }

        return [
            'diizinkan'   => false,
            'status_http' => self::HTTP_FORBIDDEN,
            'pesan'       => 'Anda tidak memiliki hak akses untuk fitur ini.',
        ];
    }

    /**
     * Versi yang melempar exception (kode 403) agar mudah dipakai di middleware:
     *   try { $auth->pastikanIzin($sesi, 'periode.kelola'); } catch (RuntimeException $e) { abort($e->getCode()); }
     *
     * @throws RuntimeException kode 403 bila tidak berhak
     */
    public function pastikanIzin(array $sesi, string $izin): void
    {
        $hasil = $this->otorisasi($sesi, $izin);
        if (!$hasil['diizinkan']) {
            throw new RuntimeException($hasil['pesan'], self::HTTP_FORBIDDEN);
        }
    }

    /**
     * Cek apakah peran boleh membuka halaman/menu tertentu (mis. mahasiswa membuka koordinator.html => 403).
     */
    public function bolehBukaMenu(string $peran, string $menu): bool
    {
        return in_array($menu, self::MENU_PERAN[$peran] ?? [], true);
    }

    /**
     * Daftar menu yang ditampilkan sesuai peran.
     */
    public function menuSesuaiPeran(string $peran): array
    {
        return self::MENU_PERAN[$peran] ?? [];
    }

    // =========================================================
    // 5. OTORISASI DATA (MR-08: mahasiswa hanya melihat pengajuan miliknya)
    // =========================================================

    /**
     * Cek kepemilikan satu pengajuan (mencegah IDOR, OWASP ASVS V4.2.1).
     * - Mahasiswa: hanya pengajuan dengan mahasiswa_id miliknya
     * - Dosen: hanya pengajuan yang ditujukan kepadanya (dosen_id)
     * - Koordinator: seluruh pengajuan
     */
    public function bolehLihatPengajuan(array $sesi, array $pengajuan): bool
    {
        switch ($sesi['peran'] ?? '') {
            case self::PERAN_KOORDINATOR:
                return true;

            case self::PERAN_MAHASISWA:
                return isset($sesi['mahasiswa_id'], $pengajuan['mahasiswa_id'])
                    && (int) $sesi['mahasiswa_id'] === (int) $pengajuan['mahasiswa_id'];

            case self::PERAN_DOSEN:
                return isset($sesi['dosen_id'], $pengajuan['dosen_id'])
                    && (int) $sesi['dosen_id'] === (int) $pengajuan['dosen_id'];

            default:
                return false;
        }
    }

    /**
     * Saring daftar pengajuan sesuai peran. Dipakai sebelum data dikirim ke tampilan/API.
     */
    public function filterPengajuanSesuaiPeran(array $sesi, array $daftarPengajuan): array
    {
        return array_values(array_filter(
            $daftarPengajuan,
            fn (array $p) => $this->bolehLihatPengajuan($sesi, $p)
        ));
    }

    /**
     * Ambil satu pengajuan dengan pengecekan kepemilikan.
     *
     * @throws RuntimeException kode 403 bila pengajuan bukan milik pengguna
     */
    public function pastikanBolehLihatPengajuan(array $sesi, array $pengajuan): array
    {
        if (!$this->bolehLihatPengajuan($sesi, $pengajuan)) {
            throw new RuntimeException('Anda tidak memiliki hak akses ke pengajuan ini.', self::HTTP_FORBIDDEN);
        }
        return $pengajuan;
    }

    /**
     * Dosen hanya boleh memutuskan pengajuan yang ditujukan kepadanya.
     *
     * @throws RuntimeException kode 403 bila bukan dosen tujuan
     */
    public function pastikanBolehPutuskan(array $sesi, array $pengajuan): void
    {
        $this->pastikanIzin($sesi, 'pengajuan.putuskan');

        if ((int) ($sesi['dosen_id'] ?? 0) !== (int) ($pengajuan['dosen_id'] ?? -1)) {
            throw new RuntimeException('Pengajuan ini tidak ditujukan kepada Anda.', self::HTTP_FORBIDDEN);
        }
    }

    /**
     * Sembunyikan data pribadi pengguna lain sesuai UU PDP (prinsip minimisasi data).
     * Mahasiswa yang melihat data mahasiswa lain (mis. daftar bimbingan dosen) hanya mendapat nama tersamar.
     */
    public function samarkanDataMahasiswa(array $sesi, array $mahasiswa): array
    {
        $milikSendiri = ($sesi['peran'] ?? '') === self::PERAN_MAHASISWA
            && (int) ($sesi['mahasiswa_id'] ?? 0) === (int) ($mahasiswa['id'] ?? -1);

        if (($sesi['peran'] ?? '') !== self::PERAN_MAHASISWA || $milikSendiri) {
            return $mahasiswa;
        }

        $nama = (string) ($mahasiswa['nama'] ?? '');
        return [
            'id'   => null,
            'nama' => $nama === '' ? '-' : mb_substr($nama, 0, 1) . str_repeat('*', max(0, mb_strlen($nama) - 1)),
        ];
    }
}
