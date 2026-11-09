<?php

namespace App\Services;

use InvalidArgumentException;
use PDO;
use Throwable;

/**
 * Service Peminatan & Kuota Bidang
 * Sesuai Dokumen SRS MR-10 (Membagi slot berdasarkan peminatan IoT, AI, Cyber
 * dan menyarankan bidang lain yang masih tersedia bila suatu bidang penuh)
 * Submodul 10: Peminatan & Kuota Bidang
 *
 * Aturan SRS yang diimplementasikan:
 * - Mahasiswa memilih satu peminatan (IoT, AI, Cyber) saat mengajukan Pembimbing 1,
 *   yang mengikuti peminatan utama dosen tersebut
 * - Pengajuan Pembimbing 2 tidak dibatasi peminatan dan dapat dipilih dari dosen mana pun
 * - Kuota setiap peminatan per periode awalnya dibagi rata dari jumlah mahasiswa
 *   Penulisan Proposal dan dapat diubah koordinator (tidak boleh di bawah jumlah terisi)
 * - Bila kuota peminatan penuh, pengajuan ditolak dan sistem HANYA menyarankan peminatan lain
 *   yang masih tersedia (tidak memindahkan otomatis)
 * - Pengambilan slot dosen dan slot peminatan dalam satu transaksi atomik
 *   (SELECT ... FOR UPDATE, MySQL InnoDB Locking Reads)
 */
class PeminatanService
{
    public const PEMINATAN_IOT   = 'IoT';
    public const PEMINATAN_AI    = 'AI';
    public const PEMINATAN_CYBER = 'Cyber';

    public const DAFTAR_PEMINATAN = [
        self::PEMINATAN_IOT,
        self::PEMINATAN_AI,
        self::PEMINATAN_CYBER,
    ];

    public const PERAN_P1 = '1';
    public const PERAN_P2 = '2';

    /** Batas waktu keputusan dosen 7 x 24 jam (SRS MR-03) */
    public const BATAS_KEPUTUSAN_JAM = 168;

    // =========================================================
    // 1. KUOTA AWAL PEMINATAN (dibagi rata)
    // =========================================================

    /**
     * Hitung kuota awal tiap peminatan per periode: jumlah mahasiswa Penulisan Proposal dibagi rata.
     * Sisa pembagian diberikan ke peminatan paling awal sehingga total kuota = jumlah mahasiswa.
     * Contoh: 40 mahasiswa => IoT 14, AI 13, Cyber 13.
     *
     * @param int   $jumlahMhsProposal Jumlah mahasiswa Penulisan Proposal pada periode
     * @param array $daftarPeminatan   Default IoT, AI, Cyber
     * @return array ['IoT' => int, 'AI' => int, 'Cyber' => int]
     */
    public function hitungKuotaAwal(int $jumlahMhsProposal, array $daftarPeminatan = self::DAFTAR_PEMINATAN): array
    {
        if ($jumlahMhsProposal < 0) {
            throw new InvalidArgumentException('Jumlah mahasiswa Penulisan Proposal tidak boleh negatif.');
        }
        if (empty($daftarPeminatan)) {
            throw new InvalidArgumentException('Daftar peminatan tidak boleh kosong.');
        }

        $jumlahBidang = count($daftarPeminatan);
        $dasar = intdiv($jumlahMhsProposal, $jumlahBidang);
        $sisa = $jumlahMhsProposal % $jumlahBidang;

        $kuota = [];
        foreach (array_values($daftarPeminatan) as $urutan => $peminatan) {
            $kuota[$peminatan] = $dasar + ($urutan < $sisa ? 1 : 0);
        }
        return $kuota;
    }

    // =========================================================
    // 2. UBAH KUOTA PEMINATAN (koordinator)
    // =========================================================

    /**
     * Validasi perubahan kuota peminatan oleh koordinator.
     *
     * @throws InvalidArgumentException bila peminatan tidak dikenal, kuota negatif,
     *                                  atau kuota diturunkan di bawah jumlah terisi
     */
    public function validasiUbahKuota(string $peminatan, int $kuotaBaru, int $jumlahTerisi): void
    {
        $this->pastikanPeminatanValid($peminatan);

        if ($kuotaBaru < 0) {
            throw new InvalidArgumentException("Kuota peminatan {$peminatan} tidak boleh negatif.");
        }

        if ($kuotaBaru < $jumlahTerisi) {
            throw new InvalidArgumentException(
                "Kuota peminatan {$peminatan} tidak dapat diturunkan menjadi {$kuotaBaru} karena sudah terisi {$jumlahTerisi} mahasiswa."
            );
        }
    }

    // =========================================================
    // 3. VALIDASI PEMINATAN PADA PENGAJUAN
    // =========================================================

    public function peminatanValid(?string $peminatan): bool
    {
        return in_array($peminatan, self::DAFTAR_PEMINATAN, true);
    }

    /**
     * @throws InvalidArgumentException bila peminatan bukan IoT/AI/Cyber
     */
    public function pastikanPeminatanValid(?string $peminatan): void
    {
        if (!$this->peminatanValid($peminatan)) {
            throw new InvalidArgumentException(
                'Peminatan tidak dikenal. Pilih salah satu: ' . implode(', ', self::DAFTAR_PEMINATAN) . '.'
            );
        }
    }

    /**
     * Tentukan peminatan yang berlaku untuk suatu pengajuan.
     * - Pembimbing 1: wajib memilih peminatan dan harus sama dengan peminatan utama dosen tujuan
     * - Pembimbing 2: peminatan tidak dibatasi (dikembalikan null, tidak memakai kuota peminatan)
     *
     * @param string      $peran          '1' atau '2'
     * @param string|null $peminatanMhs   Peminatan yang dipilih mahasiswa
     * @param array       $dosen          ['nama', 'peminatan_utama']
     * @return string|null Peminatan yang dikunci kuotanya, atau null untuk Pembimbing 2
     * @throws InvalidArgumentException bila aturan dilanggar
     */
    public function tentukanPeminatanPengajuan(string $peran, ?string $peminatanMhs, array $dosen): ?string
    {
        if ($peran === self::PERAN_P2) {
            return null;
        }

        if ($peran !== self::PERAN_P1) {
            throw new InvalidArgumentException('Peran pembimbing harus 1 atau 2.');
        }

        $this->pastikanPeminatanValid($peminatanMhs);

        $peminatanDosen = $dosen['peminatan_utama'] ?? null;
        if ($peminatanMhs !== $peminatanDosen) {
            throw new InvalidArgumentException(sprintf(
                'Pembimbing 1 wajib sesuai peminatan utama dosen. %s berpeminatan %s, sedangkan Anda memilih %s.',
                $dosen['nama'] ?? 'Dosen ini',
                $peminatanDosen ?? '-',
                $peminatanMhs
            ));
        }

        return $peminatanMhs;
    }

    // =========================================================
    // 4. SISA SLOT & SARAN PEMINATAN LAIN
    // =========================================================

    /**
     * Ringkasan slot per peminatan untuk dashboard (Submodul 1 & 10).
     *
     * @param array $kuotaPeminatan ['IoT' => ['kuota' => x, 'terisi' => y], ...]
     * @return array [['peminatan', 'kuota', 'terisi', 'sisa', 'status'], ...]
     */
    public function ringkasanSlot(array $kuotaPeminatan): array
    {
        $hasil = [];
        foreach (self::DAFTAR_PEMINATAN as $peminatan) {
            $kuota = (int) ($kuotaPeminatan[$peminatan]['kuota'] ?? 0);
            $terisi = (int) ($kuotaPeminatan[$peminatan]['terisi'] ?? 0);
            $sisa = max(0, $kuota - $terisi);

            $hasil[] = [
                'peminatan' => $peminatan,
                'kuota'     => $kuota,
                'terisi'    => $terisi,
                'sisa'      => $sisa,
                'status'    => $sisa > 0 ? 'Tersedia' : 'Penuh',
            ];
        }
        return $hasil;
    }

    /**
     * Daftar peminatan lain yang masih punya sisa slot, diurutkan sisa terbanyak.
     */
    public function saranPeminatanLain(string $peminatanPenuh, array $kuotaPeminatan): array
    {
        $saran = array_filter(
            $this->ringkasanSlot($kuotaPeminatan),
            fn ($r) => $r['peminatan'] !== $peminatanPenuh && $r['sisa'] > 0
        );

        usort($saran, fn ($a, $b) => $b['sisa'] <=> $a['sisa']);

        return array_map(fn ($r) => ['peminatan' => $r['peminatan'], 'sisa' => $r['sisa']], $saran);
    }

    /**
     * Cek ketersediaan kuota peminatan sebelum mengajukan (pemeriksaan awal, belum mengunci).
     * Bila penuh: ditolak dan sistem hanya menyarankan peminatan lain yang tersedia.
     *
     * @return array ['tersedia' => bool, 'sisa' => int, 'pesan' => string, 'saran' => array]
     */
    public function cekKetersediaan(string $peminatan, array $kuotaPeminatan): array
    {
        $this->pastikanPeminatanValid($peminatan);

        $kuota = (int) ($kuotaPeminatan[$peminatan]['kuota'] ?? 0);
        $terisi = (int) ($kuotaPeminatan[$peminatan]['terisi'] ?? 0);
        $sisa = max(0, $kuota - $terisi);

        if ($sisa > 0) {
            return [
                'tersedia' => true,
                'sisa'     => $sisa,
                'pesan'    => "Slot peminatan {$peminatan} masih tersedia ({$sisa} slot).",
                'saran'    => [],
            ];
        }

        $saran = $this->saranPeminatanLain($peminatan, $kuotaPeminatan);

        return [
            'tersedia' => false,
            'sisa'     => 0,
            'pesan'    => $this->pesanPeminatanPenuh($peminatan, $saran),
            'saran'    => $saran,
        ];
    }

    protected function pesanPeminatanPenuh(string $peminatan, array $saran): string
    {
        if (empty($saran)) {
            return "Kuota peminatan {$peminatan} sudah penuh dan tidak ada peminatan lain yang tersedia. Hubungi Koordinator TA.";
        }

        $daftar = implode(', ', array_map(fn ($s) => "{$s['peminatan']} ({$s['sisa']} slot)", $saran));
        return "Kuota peminatan {$peminatan} sudah penuh. Peminatan yang masih tersedia: {$daftar}.";
    }

    // =========================================================
    // 5. PENGAMBILAN SLOT ATOMIK (slot dosen + slot peminatan)
    // =========================================================

    /**
     * Ambil slot dosen (per peran) dan slot peminatan (khusus P1) dalam SATU transaksi.
     * Baris kuota dikunci dengan SELECT ... FOR UPDATE sehingga permintaan bersamaan antre
     * di level database dan jumlah terisi tidak pernah melebihi kuota.
     *
     * Urutan penguncian selalu kuota_dosen lalu kuota_peminatan agar tidak terjadi deadlock.
     *
     * Tabel (ERD SRS):
     * - kuota_dosen(id, periode_id, dosen_id, peran, kuota, kuota_tambahan, terisi)
     * - kuota_peminatan(id, periode_id, peminatan_id, kuota, terisi)
     * - pengajuan(id, mahasiswa_id, peminatan_id, dosen_id, topik_id, periode_id, peran, judul,
     *             abstrak, asal_topik, status, alasan_tolak, kedaluwarsa_at)
     *
     * @param PDO   $pdo  Koneksi MySQL InnoDB (di Laravel: DB::connection()->getPdo())
     * @param array $data ['periode_id', 'mahasiswa_id', 'dosen_id', 'peran' ('1'|'2'),
     *                     'peminatan_id' (wajib untuk P1), 'peminatan' (nama, untuk pesan),
     *                     'judul', 'abstrak', 'asal_topik', 'topik_id'?]
     * @param array $kuotaPeminatanSemua Opsional, untuk menyusun saran bila peminatan penuh
     *                                   ['IoT' => ['kuota','terisi'], ...]
     * @param callable|null $cekDalamKunci Pemeriksaan tambahan yang dijalankan di dalam transaksi
     *                                     SEBELUM kuota dikunci, misalnya aturan MR-03 (satu pengajuan aktif
     *                                     per peran, P1/P2 beda dosen) dan topik dosen FIFO.
     *                                     Signature: fn(PDO $pdo, string $klausaKunci): ?array
     *                                     Kembalikan null untuk lanjut, atau ['kode','pesan','saran'?] untuk batal.
     * @return array ['berhasil' => bool, 'kode' => string, 'pesan' => string,
     *                'pengajuan_id' => int|null, 'saran' => array]
     *               kode: 'berhasil' | 'peminatan_penuh' | 'slot_dosen_penuh' | 'kuota_tidak_ditemukan' | kode dari $cekDalamKunci
     */
    public function ambilSlotAtomik(
        PDO $pdo,
        array $data,
        array $kuotaPeminatanSemua = [],
        ?callable $cekDalamKunci = null
    ): array {
        $peran = (string) $data['peran'];
        $isP1 = $peran === self::PERAN_P1;

        if ($isP1 && empty($data['peminatan_id'])) {
            throw new InvalidArgumentException('Pengajuan Pembimbing 1 wajib memilih peminatan.');
        }

        // FOR UPDATE hanya didukung MySQL/PostgreSQL; SQLite (pengujian) sudah mengunci seluruh DB saat menulis
        $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
        $kunci = in_array($driver, ['mysql', 'pgsql'], true) ? ' FOR UPDATE' : '';

        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->mulaiTransaksi($pdo);

        try {
            // 0) Pemeriksaan tambahan dari pemanggil (di dalam transaksi yang sama)
            if ($cekDalamKunci !== null) {
                $tolak = $cekDalamKunci($pdo, $kunci);
                if (is_array($tolak)) {
                    $this->batalkanTransaksi($pdo);
                    return $this->hasilGagal($tolak['kode'] ?? 'ditolak', $tolak['pesan'] ?? 'Pengajuan ditolak.', $tolak['saran'] ?? []);
                }
            }

            // 1) Kunci baris kuota dosen per peran
            $stmt = $pdo->prepare(
                'SELECT id, kuota, kuota_tambahan, terisi FROM kuota_dosen
                 WHERE periode_id = ? AND dosen_id = ? AND peran = ?' . $kunci
            );
            $stmt->execute([$data['periode_id'], $data['dosen_id'], $peran]);
            $kuotaDosen = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$kuotaDosen) {
                $this->batalkanTransaksi($pdo);
                return $this->hasilGagal('kuota_tidak_ditemukan', 'Kuota dosen untuk periode dan peran ini belum diatur koordinator.');
            }

            // 2) Kunci baris kuota peminatan (khusus Pembimbing 1)
            $kuotaBidang = null;
            if ($isP1) {
                $stmt = $pdo->prepare(
                    'SELECT id, kuota, terisi FROM kuota_peminatan
                     WHERE periode_id = ? AND peminatan_id = ?' . $kunci
                );
                $stmt->execute([$data['periode_id'], $data['peminatan_id']]);
                $kuotaBidang = $stmt->fetch(PDO::FETCH_ASSOC);

                if (!$kuotaBidang) {
                    $this->batalkanTransaksi($pdo);
                    return $this->hasilGagal('kuota_tidak_ditemukan', 'Kuota peminatan untuk periode ini belum diatur koordinator.');
                }

                // 3) Peminatan penuh => tolak dan hanya sarankan peminatan lain (MR-10)
                if ((int) $kuotaBidang['terisi'] >= (int) $kuotaBidang['kuota']) {
                    $this->batalkanTransaksi($pdo);
                    $nama = (string) ($data['peminatan'] ?? 'ini');
                    $saran = $this->saranPeminatanLain($nama, $kuotaPeminatanSemua);
                    return $this->hasilGagal('peminatan_penuh', $this->pesanPeminatanPenuh($nama, $saran), $saran);
                }
            }

            // 4) Slot dosen per peran penuh => tawarkan antrean (MR-04 / MR-05)
            $kapasitas = (int) $kuotaDosen['kuota'] + (int) ($kuotaDosen['kuota_tambahan'] ?? 0);
            if ((int) $kuotaDosen['terisi'] >= $kapasitas) {
                $this->batalkanTransaksi($pdo);
                return $this->hasilGagal(
                    'slot_dosen_penuh',
                    "Slot Pembimbing {$peran} dosen ini sudah penuh. Anda dapat masuk antrean atau memilih peran/dosen lain."
                );
            }

            // 5) Simpan pengajuan berstatus Menunggu (keputusan dosen, batas 7 x 24 jam)
            $kedaluwarsa = date('Y-m-d H:i:s', time() + self::BATAS_KEPUTUSAN_JAM * 3600);
            $stmt = $pdo->prepare(
                'INSERT INTO pengajuan
                 (mahasiswa_id, peminatan_id, dosen_id, topik_id, periode_id, peran, judul, abstrak, asal_topik, status, kedaluwarsa_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $data['mahasiswa_id'],
                $isP1 ? $data['peminatan_id'] : null, // P2 tidak memakai kuota peminatan
                $data['dosen_id'],
                $data['topik_id'] ?? null,
                $data['periode_id'],
                $peran,
                $data['judul'],
                $data['abstrak'],
                $data['asal_topik'] ?? 'Topik sendiri',
                'Menunggu',
                $kedaluwarsa,
            ]);
            $pengajuanId = (int) $pdo->lastInsertId();

            // 6) Tambah jumlah terisi pada kedua kuota dalam transaksi yang sama
            $pdo->prepare('UPDATE kuota_dosen SET terisi = terisi + 1 WHERE id = ?')
                ->execute([$kuotaDosen['id']]);

            if ($isP1) {
                $pdo->prepare('UPDATE kuota_peminatan SET terisi = terisi + 1 WHERE id = ?')
                    ->execute([$kuotaBidang['id']]);
            }

            $this->selesaikanTransaksi($pdo);

            return [
                'berhasil'     => true,
                'kode'         => 'berhasil',
                'pesan'        => "Slot Pembimbing {$peran} berhasil dikunci. Pengajuan menunggu keputusan dosen (maks. 7 hari).",
                'pengajuan_id' => $pengajuanId,
                'saran'        => [],
            ];
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $this->batalkanTransaksi($pdo);
            }
            throw $e;
        }
    }

    /**
     * true bila transaksi dibuka oleh pemanggil (mis. Laravel DB::transaction atau pengujian
     * RefreshDatabase); dalam kondisi itu dipakai SAVEPOINT agar tidak membuka transaksi bersarang.
     */
    private bool $pakaiSavepoint = false;

    private function mulaiTransaksi(PDO $pdo): void
    {
        $this->pakaiSavepoint = $pdo->inTransaction();
        $this->pakaiSavepoint ? $pdo->exec('SAVEPOINT ambil_slot') : $pdo->beginTransaction();
    }

    private function batalkanTransaksi(PDO $pdo): void
    {
        $this->pakaiSavepoint ? $pdo->exec('ROLLBACK TO SAVEPOINT ambil_slot') : $pdo->rollBack();
    }

    private function selesaikanTransaksi(PDO $pdo): void
    {
        $this->pakaiSavepoint ? $pdo->exec('RELEASE SAVEPOINT ambil_slot') : $pdo->commit();
    }

    protected function hasilGagal(string $kode, string $pesan, array $saran = []): array
    {
        return [
            'berhasil'     => false,
            'kode'         => $kode,
            'pesan'        => $pesan,
            'pengajuan_id' => null,
            'saran'        => $saran,
        ];
    }
}
