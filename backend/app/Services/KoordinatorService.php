<?php

namespace App\Services;

use InvalidArgumentException;

/**
 * Service Administrasi Koordinator TA / Kaprodi
 * Sesuai Dokumen SRS MR-07 (Administrasi Periode, Kuota & Penetapan Pembimbing)
 *
 * Aturan SRS yang diimplementasikan:
 * - Kuota otomatis dihitung: ceil(jumlah mahasiswa proposal / jumlah dosen aktif)
 * - Rentang kuota valid: 0 s/d 20 per peran
 * - Kuota TIDAK BISA diturunkan di bawah jumlah yang sudah terisi
 * - Slot tambahan wajib disertai alasan minimal 10 karakter (audit log)
 * - Realokasi pengajuan: hanya ke dosen dengan slot & peminatan yang sama
 */
class KoordinatorService
{
    // =========================================================
    // 1. KUOTA OTOMATIS (MR-07)
    // =========================================================

    /**
     * Hitung kuota dasar otomatis per periode.
     * Rumus SRS: ceil(jumlah_mhs_proposal / jumlah_dosen_aktif)
     *
     * @param int $jumlahMhsProposal Total mahasiswa yang mendaftar di periode ini
     * @param int $jumlahDosenAktif  Jumlah dosen yang berstatus menerima_bimbingan = true
     * @return int Kuota per peran (minimum 1, default 6 jika tidak ada dosen)
     */
    public function hitungKuotaOtomatis(int $jumlahMhsProposal, int $jumlahDosenAktif): int
    {
        if ($jumlahDosenAktif <= 0) {
            return 6; // nilai aman jika belum ada dosen aktif
        }
        $kuota = (int) ceil($jumlahMhsProposal / $jumlahDosenAktif);
        return max(1, $kuota); // minimal 1
    }

    // =========================================================
    // 2. UBAH KUOTA DOSEN (MR-07)
    // =========================================================

    /**
     * Validasi perubahan kuota per peran yang dilakukan koordinator.
     * Kuota harus dalam rentang 0-20 dan tidak boleh lebih kecil dari jumlah terisi.
     *
     * @param int $kuotaBaru    Nilai kuota baru yang diinput koordinator
     * @param int $jumlahTerisi Jumlah mahasiswa yang sudah terdaftar di peran ini
     * @throws InvalidArgumentException jika nilai melanggar aturan SRS
     */
    public function validasiUbahKuota(int $kuotaBaru, int $jumlahTerisi): void
    {
        if ($kuotaBaru < 0 || $kuotaBaru > 20) {
            throw new InvalidArgumentException(
                "Kuota dosen harus berada dalam rentang 0 hingga 20. Nilai yang dimasukkan: {$kuotaBaru}."
            );
        }

        if ($kuotaBaru < $jumlahTerisi) {
            throw new InvalidArgumentException(
                "Kuota tidak dapat diturunkan menjadi {$kuotaBaru} karena sudah ada {$jumlahTerisi} mahasiswa terdaftar pada peran ini."
            );
        }
    }

    // =========================================================
    // 3. SLOT TAMBAHAN (MR-07)
    // =========================================================

    /**
     * Validasi penambahan slot di luar kuota dasar.
     * Alasan wajib diisi minimal 10 karakter untuk pencatatan log audit.
     *
     * @param int    $jumlahSlot Jumlah slot yang ingin ditambahkan
     * @param string $alasan     Alasan penambahan slot (min 10 karakter)
     * @return array Data log yang siap disimpan ke database
     * @throws InvalidArgumentException jika data tidak valid
     */
    public function validasiSlotTambahan(int $jumlahSlot, string $alasan): array
    {
        if ($jumlahSlot <= 0) {
            throw new InvalidArgumentException('Jumlah slot tambahan minimal 1 slot.');
        }

        $alasanTrim = trim($alasan);
        if (mb_strlen($alasanTrim) < 10) {
            throw new InvalidArgumentException(
                'Alasan penambahan slot wajib diisi minimal 10 karakter untuk keperluan log audit.'
            );
        }

        return [
            'slot_tambahan' => $jumlahSlot,
            'alasan'        => $alasanTrim,
            'dicatat_pada'  => date('Y-m-d H:i:s'),
        ];
    }

    // =========================================================
    // 4. REALOKASI / PEMINDAHAN PENGAJUAN (MR-07)
    // =========================================================

    /**
     * Validasi pemindahan pengajuan mahasiswa ke dosen lain oleh koordinator.
     * Hanya pengajuan berstatus 'Menunggu' yang bisa dipindahkan.
     * Dosen tujuan harus punya slot kosong dan peminatan yang sama (jika P1).
     *
     * @param array  $pengajuan   Data pengajuan yang akan dipindahkan
     * @param array  $dosenTujuan Data dosen tujuan beserta kuota & terisi
     * @param string $alasan      Alasan pemindahan oleh koordinator
     * @return array Log pemindahan siap disimpan ke tabel riwayat_pemindahan
     * @throws InvalidArgumentException jika kondisi tidak memenuhi aturan SRS
     */
    public function validasiPemindahan(array $pengajuan, array $dosenTujuan, string $alasan): array
    {
        // Hanya boleh memindahkan pengajuan yang masih Menunggu
        if ($pengajuan['status'] !== 'Menunggu') {
            throw new InvalidArgumentException(
                "Hanya pengajuan berstatus 'Menunggu' yang dapat dipindahkan. Status saat ini: {$pengajuan['status']}."
            );
        }

        // Tidak boleh pindah ke dosen yang sama
        if ($pengajuan['dosen_id'] === $dosenTujuan['id']) {
            throw new InvalidArgumentException('Dosen tujuan tidak boleh sama dengan dosen asal.');
        }

        $peran = $pengajuan['peran']; // '1' atau '2'

        // Hitung sisa slot dosen tujuan sesuai peran
        if ($peran === '1') {
            $kapasitas = ($dosenTujuan['kuota_p1'] ?? 0) + ($dosenTujuan['kuota_tambahan'] ?? 0);
            $sisaSlot  = $kapasitas - ($dosenTujuan['terisi_p1'] ?? 0);

            // Jika Pembimbing 1: peminatan dosen tujuan harus sama dengan pengajuan
            if (($dosenTujuan['peminatan_utama'] ?? '') !== ($pengajuan['peminatan'] ?? '')) {
                throw new InvalidArgumentException(
                    "Peminatan dosen tujuan ({$dosenTujuan['peminatan_utama']}) berbeda dengan peminatan pengajuan ({$pengajuan['peminatan']}). Pembimbing 1 wajib sesuai peminatan."
                );
            }
        } else {
            $sisaSlot = ($dosenTujuan['kuota_p2'] ?? 0) - ($dosenTujuan['terisi_p2'] ?? 0);
        }

        if ($sisaSlot <= 0) {
            throw new InvalidArgumentException(
                "Dosen tujuan ({$dosenTujuan['nama']}) tidak memiliki sisa slot untuk Pembimbing {$peran}."
            );
        }

        $alasanTrim = trim($alasan);
        if (empty($alasanTrim)) {
            throw new InvalidArgumentException('Alasan pemindahan wajib diisi untuk catatan program studi.');
        }

        return [
            'pengajuan_id'    => $pengajuan['id'],
            'dosen_asal_id'   => $pengajuan['dosen_id'],
            'dosen_tujuan_id' => $dosenTujuan['id'],
            'alasan'          => $alasanTrim,
            'dicatat_pada'    => date('Y-m-d H:i:s'),
        ];
    }

    // =========================================================
    // 5. BUKA / TUTUP PERIODE (MR-07)
    // =========================================================

    /**
     * Validasi data sebelum membuka periode pengajuan baru.
     * Pastikan hanya ada satu periode aktif di satu waktu.
     *
     * @param array $dataPeriode ['nama', 'tgl_mulai', 'tgl_selesai', 'kuota_default']
     * @param bool  $adaPeriodeAktif true jika sudah ada periode aktif sebelumnya
     * @throws InvalidArgumentException jika melanggar aturan
     */
    public function validasiBukaPeriode(array $dataPeriode, bool $adaPeriodeAktif): void
    {
        if ($adaPeriodeAktif) {
            throw new InvalidArgumentException(
                'Sudah ada periode aktif. Tutup periode yang berjalan sebelum membuka periode baru.'
            );
        }

        if (empty($dataPeriode['nama'])) {
            throw new InvalidArgumentException('Nama periode wajib diisi.');
        }

        $mulai   = strtotime($dataPeriode['tgl_mulai'] ?? '');
        $selesai = strtotime($dataPeriode['tgl_selesai'] ?? '');

        if (!$mulai || !$selesai) {
            throw new InvalidArgumentException('Tanggal mulai dan selesai periode harus valid.');
        }

        if ($selesai <= $mulai) {
            throw new InvalidArgumentException('Tanggal selesai harus lebih akhir dari tanggal mulai.');
        }
    }
}

