<?php

namespace App\Services;

/**
 * Service Antrean Otomatis (Waitlist FIFO) & Notifikasi
 * Sesuai Dokumen SRS MR-05 (Antrean & Notifikasi)
 *
 * Aturan SRS yang diimplementasikan:
 * - Antrean berurutan FIFO (First In First Out) per dosen per peran
 * - Saat slot terbuka, mahasiswa urutan pertama yang memenuhi syarat dipromosikan <= 1 menit
 * - Notifikasi in-app dan email dikirim ke semua pihak yang terkait
 * - Mahasiswa P1 yang dipromosikan wajib masih punya kuota peminatan (MR-10)
 * - Mahasiswa tidak boleh sudah punya pengajuan aktif di peran yang sama (MR-03)
 */
class AntreanService
{
    // =========================================================
    // 1. POSISI ANTREAN (MR-05)
    // =========================================================

    /**
     * Hitung posisi urutan mahasiswa dalam antrean FIFO per dosen per peran.
     *
     * @param int    $mahasiswaId   ID mahasiswa yang dicari
     * @param int    $dosenId       ID dosen yang dituju
     * @param string $peran         '1' (Pembimbing 1) atau '2' (Pembimbing 2)
     * @param array  $daftarAntrean Semua antrean, diurutkan created_at ASC dari DB
     * @return int Posisi antrean (mulai dari 1), atau 0 jika tidak ditemukan
     */
    public function getPosisiAntrean(int $mahasiswaId, int $dosenId, string $peran, array $daftarAntrean): int
    {
        $posisi = 1;
        foreach ($daftarAntrean as $item) {
            if ((int)$item['dosen_id'] !== $dosenId || $item['peran'] !== $peran || $item['status'] !== 'menunggu') {
                continue;
            }
            if ((int)$item['mahasiswa_id'] === $mahasiswaId) {
                return $posisi;
            }
            $posisi++;
        }
        return 0;
    }

    // =========================================================
    // 2. CARI KANDIDAT PROMOSI (MR-05)
    // =========================================================

    /**
     * Temukan mahasiswa pertama dalam antrean yang berhak dipromosikan
     * saat ada slot kosong pada dosen & peran tertentu.
     *
     * Syarat promosi:
     * 1. Urutan FIFO (created_at paling lama = paling pertama)
     * 2. Belum punya pengajuan aktif di peran yang sama (MR-03)
     * 3. Jika Pembimbing 1: kuota peminatan mahasiswa masih ada (MR-10)
     *
     * @param int    $dosenId                 ID dosen yang slotnya baru terbuka
     * @param string $peran                   '1' atau '2'
     * @param array  $daftarAntrean           Semua antrean status 'menunggu', urut created_at ASC
     * @param array  $kuotaPeminatan          ['peminatan_id' => ['kuota' => x, 'terisi' => y], ...]
     * @param array  $pengajuanAktifMahasiswa ['1' => [mhs_id, ...], '2' => [mhs_id, ...]]
     * @return array|null Data antrean kandidat, atau null jika tidak ada yang memenuhi syarat
     */
    public function cariKandidatPromosi(
        int    $dosenId,
        string $peran,
        array  $daftarAntrean,
        array  $kuotaPeminatan,
        array  $pengajuanAktifMahasiswa
    ): ?array {
        foreach ($daftarAntrean as $antre) {
            // Filter: hanya antrean ke dosen & peran yang sesuai dan statusnya menunggu
            if ((int)$antre['dosen_id'] !== $dosenId
                || $antre['peran'] !== $peran
                || $antre['status'] !== 'menunggu'
            ) {
                continue;
            }

            $mhsId = (int)$antre['mahasiswa_id'];

            // Syarat 1: Mahasiswa belum punya pengajuan aktif di peran ini (MR-03)
            $aktifDiPeran = $pengajuanAktifMahasiswa[$peran] ?? [];
            if (in_array($mhsId, $aktifDiPeran)) {
                continue;
            }

            // Syarat 2: Jika Pembimbing 1, cek sisa kuota peminatan (MR-10)
            if ($peran === '1') {
                $pidBidang  = $antre['peminatan_id'] ?? null;
                $infoBidang = $kuotaPeminatan[$pidBidang] ?? null;

                if (!$infoBidang) {
                    continue; // Data peminatan tidak ditemukan, lewati
                }

                $sisaBidang = ($infoBidang['kuota'] ?? 0) - ($infoBidang['terisi'] ?? 0);
                if ($sisaBidang <= 0) {
                    continue; // Kuota peminatan penuh, lewati mahasiswa ini
                }
            }

            // Kandidat pertama yang lolos semua syarat (FIFO)
            return $antre;
        }

        return null; // Tidak ada kandidat yang memenuhi syarat
    }

    // =========================================================
    // 3. FORMAT NOTIFIKASI (MR-05)
    // =========================================================

    /**
     * Buat payload notifikasi in-app & email sesuai jenis peristiwa.
     *
     * Jenis yang didukung:
     * - 'pengajuan_baru'    : Dosen mendapat notifikasi pengajuan masuk
     * - 'pengajuan_diterima': Mahasiswa diberitahu pengajuannya diterima
     * - 'pengajuan_ditolak' : Mahasiswa diberitahu pengajuannya ditolak (+ alasan)
     * - 'promosi_antrean'   : Mahasiswa diberitahu ia dipromosikan dari antrean
     * - 'slot_tambahan'     : Dosen diberitahu kuotanya ditambah oleh koordinator
     *
     * @param string $jenis         Kode jenis notifikasi
     * @param string $namaPenerima  Nama lengkap penerima notifikasi
     * @param array  $data          Data konteks (nama_mhs, nama_dosen, peran, judul, alasan, jumlah)
     * @return array Payload notifikasi siap disimpan ke tabel notifikasi
     */
    public function buatNotifikasi(string $jenis, string $namaPenerima, array $data): array
    {
        switch ($jenis) {
            case 'pengajuan_baru':
                $judul = 'Pengajuan Bimbingan Baru Masuk';
                $pesan = "Mahasiswa {$data['nama_mhs']} mengajukan Anda sebagai Pembimbing {$data['peran']} "
                       . "dengan judul: \"{$data['judul']}\".";
                break;

            case 'pengajuan_diterima':
                $judul = 'Pengajuan Diterima oleh Dosen';
                $pesan = "Selamat! Pengajuan Pembimbing {$data['peran']} Anda telah diterima oleh {$data['nama_dosen']}.";
                break;

            case 'pengajuan_ditolak':
                $judul = 'Pengajuan Ditolak oleh Dosen';
                $pesan = "Pengajuan Pembimbing {$data['peran']} ke {$data['nama_dosen']} ditolak. "
                       . "Alasan: \"{$data['alasan']}\".";
                break;

            case 'promosi_antrean':
                $judul = 'Anda Dipromosikan dari Antrean';
                $pesan = "Slot Pembimbing {$data['peran']} untuk {$data['nama_dosen']} kini tersedia. "
                       . "Pengajuan Anda telah dipromosikan otomatis ke status Menunggu Persetujuan.";
                break;

            case 'slot_tambahan':
                $judul = 'Penambahan Kuota Bimbingan';
                $pesan = "Koordinator memberikan tambahan {$data['jumlah']} slot untuk Pembimbing {$data['peran']}.";
                break;

            default:
                $judul = 'Notifikasi Sistem';
                $pesan = $data['pesan'] ?? 'Ada pembaruan terkait bimbingan TA Anda.';
        }

        return [
            'jenis'      => $jenis,
            'penerima'   => $namaPenerima,
            'judul'      => $judul,
            'pesan'      => $pesan,
            'dibaca'     => false,
            'dibuat_at'  => date('Y-m-d H:i:s'),
        ];
    }
}

