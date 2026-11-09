<?php

namespace App\Services;

use App\Models\Antrean;
use App\Models\ArsipTopik;
use App\Models\Dosen;
use App\Models\HasilKemiripan;
use App\Models\KuotaDosen;
use App\Models\KuotaPeminatan;
use App\Models\Mahasiswa;
use App\Models\Peminatan;
use App\Models\Pengajuan;
use App\Models\Periode;
use App\Models\TopikDosen;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use PDO;

/**
 * Service Pengajuan Pembimbing & Pencegahan Rebutan Slot
 * Sesuai Dokumen SRS MR-03 (Pengajuan Pembimbing 1/2 dan keputusan dosen)
 * dan MR-04 (Mencegah kuota dosen terlampaui saat banyak mahasiswa mengajukan bersamaan)
 * Submodul 3 & 4, terintegrasi dengan MR-05 (antrean), MR-09 (kemiripan), MR-10 (peminatan).
 *
 * Aturan SRS yang diimplementasikan:
 * - Judul maks. 200 karakter, abstrak 150–300 kata, peran 1/2, peminatan wajib untuk P1 (sesuai dosen)
 * - Satu pengajuan aktif per peran per periode (Menunggu, Antrean, Diterima, Ditetapkan)
 * - P1 dan P2 wajib pada dosen yang berbeda
 * - Pengajuan di luar periode ditolak (MR-07)
 * - Judul mirip ditolak sebelum slot dikunci (MR-09)
 * - Slot dosen + slot peminatan dikunci dalam satu transaksi SELECT ... FOR UPDATE (MR-04, MR-10)
 * - Topik rekomendasi dosen hanya untuk satu mahasiswa (FIFO), dilepas bila Ditolak/Kedaluwarsa
 * - Slot penuh: saran peran lain pada dosen yang sama, atau tawaran masuk antrean
 * - Dosen menerima/menolak (alasan >= 10 karakter); tanpa keputusan 7 x 24 jam => Kedaluwarsa
 * - Mahasiswa tidak dapat membatalkan; slot dilepas hanya saat Ditolak/Kedaluwarsa, lalu antrean dipromosikan
 */
class PengajuanService
{
    public const ABSTRAK_MIN_KATA = 150;
    public const ABSTRAK_MAKS_KATA = 300;
    public const ALASAN_TOLAK_MIN = 10;

    public function __construct(
        protected PeminatanService $peminatan,
        protected KemiripanJudulService $kemiripan,
        protected AntreanService $antrean,
        protected NotifikasiService $notifikasi,
        protected DashboardService $dashboard,
    ) {
    }

    // =========================================================
    // 1. VALIDASI ISI PENGAJUAN (MR-03)
    // =========================================================

    public function hitungKata(string $teks): int
    {
        return count(preg_split('/\s+/u', trim($teks), -1, PREG_SPLIT_NO_EMPTY));
    }

    /**
     * @throws InvalidArgumentException
     */
    public function validasiIsi(array $input): void
    {
        $judul = trim((string) ($input['judul'] ?? ''));
        if ($judul === '' || mb_strlen($judul) > 200) {
            throw new InvalidArgumentException('Judul wajib diisi dan maksimal 200 karakter.');
        }

        $kata = $this->hitungKata((string) ($input['abstrak'] ?? ''));
        if ($kata < self::ABSTRAK_MIN_KATA || $kata > self::ABSTRAK_MAKS_KATA) {
            throw new InvalidArgumentException(
                'Abstrak harus ' . self::ABSTRAK_MIN_KATA . '–' . self::ABSTRAK_MAKS_KATA . " kata (saat ini {$kata} kata)."
            );
        }

        if (!in_array((string) ($input['peran'] ?? ''), ['1', '2'], true)) {
            throw new InvalidArgumentException('Peran pembimbing harus 1 atau 2.');
        }
    }

    /**
     * Periode aktif yang sedang berjalan (MR-07).
     *
     * @throws InvalidArgumentException bila tidak ada periode atau di luar tanggal
     */
    public function periodeBerjalan(): Periode
    {
        $periode = Periode::aktif();
        if ($periode === null || !$periode->sedangBerjalan()) {
            throw new InvalidArgumentException('Pengajuan ditolak: periode pengajuan sedang tidak dibuka.');
        }
        return $periode;
    }

    // =========================================================
    // 2. ATURAN PERAN (MR-03), dipakai di luar dan di dalam kunci
    // =========================================================

    /**
     * Cek satu pengajuan aktif per peran dan P1/P2 beda dosen. Mengembalikan pesan pelanggaran atau null.
     */
    public function pelanggaranPeran(int $mahasiswaId, int $periodeId, string $peran, int $dosenId): ?string
    {
        $aktif = Pengajuan::where('mahasiswa_id', $mahasiswaId)
            ->where('periode_id', $periodeId)
            ->whereIn('status', Pengajuan::STATUS_AKTIF)
            ->get(['peran', 'dosen_id']);

        $antre = Antrean::where('mahasiswa_id', $mahasiswaId)
            ->where('periode_id', $periodeId)
            ->where('status', 'menunggu')
            ->get(['peran', 'dosen_id']);

        $semua = $aktif->concat($antre);

        if ($semua->contains(fn ($p) => (string) $p->peran === $peran)) {
            return "Anda sudah memiliki pengajuan aktif atau antrean untuk Pembimbing {$peran} pada periode ini.";
        }

        if ($semua->contains(fn ($p) => (string) $p->peran !== $peran && (int) $p->dosen_id === $dosenId)) {
            return 'Pembimbing 1 dan Pembimbing 2 harus dosen yang berbeda.';
        }

        return null;
    }

    // =========================================================
    // 3. PEMERIKSAAN KEMIRIPAN (MR-09)
    // =========================================================

    public function periksaKemiripan(array $pengajuanBaru, Periode $periode): array
    {
        $aktif = Pengajuan::whereIn('status', Pengajuan::STATUS_AKTIF)
            ->get(['id', 'mahasiswa_id', 'judul', 'abstrak', 'status', 'periode_id'])
            ->map(fn ($p) => $p->toArray() + ['periode' => $p->periode_id])
            ->all();

        $arsip = ArsipTopik::get(['id', 'judul', 'abstrak', 'tahun'])->toArray();

        return $this->kemiripan->periksaLangsung($pengajuanBaru, $aktif, $arsip, (float) $periode->ambang_kemiripan);
    }

    // =========================================================
    // 4. AJUKAN PEMBIMBING (MR-03 + MR-04 + MR-09 + MR-10)
    // =========================================================

    /**
     * @param array $input ['dosen_id', 'peran', 'peminatan' (P1), 'judul', 'abstrak', 'topik_id'?]
     * @return array ['berhasil', 'kode', 'pesan', 'pengajuan'?, 'saran'?, 'tawaran_antrean'?, 'kemiripan'?] + 'status_http'
     */
    public function ajukan(Mahasiswa $mhs, array $input): array
    {
        $periode = $this->periodeBerjalan();
        $peran = (string) ($input['peran'] ?? '');

        $dosen = Dosen::with(['user', 'peminatan'])->find($input['dosen_id'] ?? 0);
        if ($dosen === null) {
            throw new InvalidArgumentException('Dosen tidak ditemukan.');
        }

        // Topik rekomendasi dosen: judul & deskripsi ikut topik, abstrak tetap dari mahasiswa
        $topik = null;
        if (!empty($input['topik_id'])) {
            $topik = TopikDosen::where('id', $input['topik_id'])->where('dosen_id', $dosen->id)->where('aktif', true)->first();
            if ($topik === null) {
                throw new InvalidArgumentException('Topik rekomendasi tidak ditemukan atau tidak aktif pada dosen ini.');
            }
            $input['judul'] = $topik->judul;
        }

        $this->validasiIsi($input);

        if (!$dosen->menerima_bimbingan) {
            return $this->gagal(422, 'dosen_tidak_menerima', "{$dosen->user->nama} sedang tidak menerima bimbingan.");
        }

        // MR-10: peminatan P1 wajib sama dengan peminatan utama dosen; P2 bebas
        $namaPeminatan = $this->peminatan->tentukanPeminatanPengajuan($peran, $input['peminatan'] ?? null, [
            'nama'            => $dosen->user->nama,
            'peminatan_utama' => $dosen->peminatan->nama,
        ]);
        $peminatanId = $namaPeminatan ? Peminatan::where('nama', $namaPeminatan)->value('id') : null;

        // MR-03 (cek awal)
        if ($pesan = $this->pelanggaranPeran($mhs->id, $periode->id, $peran, $dosen->id)) {
            return $this->gagal(422, 'aturan_peran', $pesan);
        }

        // MR-09: kemiripan diperiksa sebelum slot dikunci
        $cekMirip = $this->periksaKemiripan([
            'mahasiswa_id' => $mhs->id,
            'judul'        => $input['judul'],
            'abstrak'      => $input['abstrak'],
            'topik_id'     => $topik?->id,
            'asal_topik'   => $topik ? 'Rekomendasi dosen' : 'Topik sendiri',
        ], $periode);

        if (!$cekMirip['lolos']) {
            return $this->gagal(422, 'judul_mirip', $cekMirip['pesan'], ['kemiripan' => $cekMirip]);
        }

        $kuotaPeminatan = $this->dashboard->kuotaPeminatanPerNama($periode);

        // MR-04 + MR-10: kunci slot dosen dan peminatan dalam satu transaksi
        $hasil = $this->peminatan->ambilSlotAtomik(
            DB::connection()->getPdo(),
            [
                'periode_id'   => $periode->id,
                'mahasiswa_id' => $mhs->id,
                'dosen_id'     => $dosen->id,
                'peran'        => $peran,
                'peminatan_id' => $peminatanId,
                'peminatan'    => $namaPeminatan,
                'judul'        => trim($input['judul']),
                'abstrak'      => trim($input['abstrak']),
                'asal_topik'   => $topik ? 'Rekomendasi dosen' : 'Topik sendiri',
                'topik_id'     => $topik?->id,
            ],
            $kuotaPeminatan,
            fn (PDO $pdo, string $kunci) => $this->cekDalamKunci($pdo, $kunci, $mhs->id, $periode->id, $peran, $dosen->id, $topik?->id)
        );

        if (!$hasil['berhasil']) {
            $ekstra = ['saran' => $hasil['saran']];

            if ($hasil['kode'] === 'slot_dosen_penuh') {
                $ekstra['saran_peran_lain'] = $this->saranPeranLain($dosen, $periode, $peran);
                $ekstra['tawaran_antrean'] = true;
                $hasil['status_http'] = 409;
            }

            return $this->gagal($hasil['status_http'] ?? 422, $hasil['kode'], $hasil['pesan'], $ekstra);
        }

        $pengajuan = Pengajuan::find($hasil['pengajuan_id']);

        foreach ($cekMirip['catatan_hasil'] as $c) {
            HasilKemiripan::create([
                'pengajuan_id'            => $pengajuan->id,
                'arsip_id'                => $c['arsip_id'],
                'pembanding_pengajuan_id' => $c['pengajuan_id'],
                'skor'                    => $c['skor'],
                'hasil'                   => $c['hasil'],
            ]);
        }

        $this->notifikasi->kirim($dosen->user, 'pengajuan_baru', [
            'nama_mhs' => $mhs->user->nama,
            'peran'    => $peran,
            'judul'    => $pengajuan->judul,
        ]);

        return [
            'berhasil'    => true,
            'status_http' => 201,
            'kode'        => 'berhasil',
            'pesan'       => $hasil['pesan'],
            'pengajuan'   => $pengajuan,
            'kemiripan'   => ['skor_persen' => $cekMirip['skor_persen'], 'status' => $cekMirip['status']],
        ];
    }

    /**
     * Dijalankan di dalam transaksi ambilSlotAtomik: aturan MR-03 dicek ulang dan topik dosen dikunci (FIFO).
     */
    protected function cekDalamKunci(PDO $pdo, string $kunci, int $mhsId, int $periodeId, string $peran, int $dosenId, ?int $topikId): ?array
    {
        if ($topikId !== null) {
            $pdo->prepare('SELECT id FROM topik_dosen WHERE id = ?' . $kunci)->execute([$topikId]);

            $stmt = $pdo->prepare(
                "SELECT COUNT(*) FROM pengajuan WHERE topik_id = ? AND status IN ('Menunggu','Antrean','Diterima','Ditetapkan')"
            );
            $stmt->execute([$topikId]);
            if ((int) $stmt->fetchColumn() > 0) {
                return ['kode' => 'topik_diambil', 'pesan' => 'Topik ini sudah diambil mahasiswa lain. Silakan pilih topik lain atau ajukan topik sendiri.'];
            }
        }

        if ($pesan = $this->pelanggaranPeran($mhsId, $periodeId, $peran, $dosenId)) {
            return ['kode' => 'aturan_peran', 'pesan' => $pesan];
        }

        return null;
    }

    /**
     * MR-03: bila slot peran penuh tetapi peran lain pada dosen yang sama masih ada, sarankan peran itu.
     */
    public function saranPeranLain(Dosen $dosen, Periode $periode, string $peran): ?array
    {
        $lain = $peran === '1' ? '2' : '1';
        $kuota = KuotaDosen::where(['periode_id' => $periode->id, 'dosen_id' => $dosen->id, 'peran' => $lain])->first();

        if ($kuota === null || $kuota->sisa() <= 0) {
            return null;
        }

        return [
            'peran' => $lain,
            'sisa'  => $kuota->sisa(),
            'pesan' => "Slot Pembimbing {$peran} penuh, tetapi slot Pembimbing {$lain} pada dosen ini masih tersedia ({$kuota->sisa()}).",
        ];
    }

    // =========================================================
    // 5. ANTREAN (MR-05)
    // =========================================================

    /**
     * Masuk antrean FIFO bila slot dosen pada peran itu penuh.
     */
    public function masukAntrean(Mahasiswa $mhs, array $input): array
    {
        $periode = $this->periodeBerjalan();
        $peran = (string) ($input['peran'] ?? '');
        $this->validasiIsi($input);

        $dosen = Dosen::with(['user', 'peminatan'])->findOrFail($input['dosen_id'] ?? 0);

        $namaPeminatan = $this->peminatan->tentukanPeminatanPengajuan($peran, $input['peminatan'] ?? null, [
            'nama'            => $dosen->user->nama,
            'peminatan_utama' => $dosen->peminatan->nama,
        ]);

        $kuota = KuotaDosen::where(['periode_id' => $periode->id, 'dosen_id' => $dosen->id, 'peran' => $peran])->first();
        if ($kuota && $kuota->sisa() > 0) {
            return $this->gagal(422, 'slot_masih_ada', 'Slot dosen masih tersedia, silakan ajukan langsung tanpa antrean.');
        }

        if ($pesan = $this->pelanggaranPeran($mhs->id, $periode->id, $peran, $dosen->id)) {
            return $this->gagal(422, 'aturan_peran', $pesan);
        }

        $cekMirip = $this->periksaKemiripan([
            'mahasiswa_id' => $mhs->id,
            'judul'        => $input['judul'],
            'abstrak'      => $input['abstrak'],
        ], $periode);
        if (!$cekMirip['lolos']) {
            return $this->gagal(422, 'judul_mirip', $cekMirip['pesan'], ['kemiripan' => $cekMirip]);
        }

        $antre = Antrean::create([
            'mahasiswa_id' => $mhs->id,
            'dosen_id'     => $dosen->id,
            'periode_id'   => $periode->id,
            'peminatan_id' => $namaPeminatan ? Peminatan::where('nama', $namaPeminatan)->value('id') : null,
            'peran'        => $peran,
            'judul'        => trim($input['judul']),
            'abstrak'      => trim($input['abstrak']),
            'status'       => 'menunggu',
        ]);

        return [
            'berhasil'    => true,
            'status_http' => 201,
            'kode'        => 'masuk_antrean',
            'pesan'       => 'Anda masuk antrean. Anda akan dipromosikan otomatis saat slot terbuka.',
            'antrean'     => $antre,
            'posisi'      => $this->posisiAntrean($antre),
        ];
    }

    public function posisiAntrean(Antrean $antre): int
    {
        $daftar = Antrean::where('dosen_id', $antre->dosen_id)
            ->where('periode_id', $antre->periode_id)
            ->where('peran', $antre->peran)
            ->where('status', 'menunggu')
            ->orderBy('created_at')->orderBy('id')
            ->get(['mahasiswa_id', 'dosen_id', 'peran', 'status'])
            ->toArray();

        return $this->antrean->getPosisiAntrean($antre->mahasiswa_id, $antre->dosen_id, (string) $antre->peran, $daftar);
    }

    /**
     * Promosikan antrean FIFO selama slot dosen pada peran itu masih ada (dipanggil saat slot dilepas
     * atau slot tambahan diberikan). Berjalan seketika, sehingga promosi terjadi <= 1 menit.
     *
     * @return int Jumlah mahasiswa yang dipromosikan
     */
    public function promosikanAntrean(int $dosenId, string $peran, int $periodeId): int
    {
        $periode = Periode::find($periodeId);
        $dosen = Dosen::with('user')->find($dosenId);
        if (!$periode || !$dosen) {
            return 0;
        }

        $dipromosikan = 0;
        $dilewati = [];

        for ($putaran = 0; $putaran < 50; $putaran++) {
            $kuota = KuotaDosen::where(['periode_id' => $periodeId, 'dosen_id' => $dosenId, 'peran' => $peran])->first();
            if (!$kuota || $kuota->sisa() <= 0) {
                break;
            }

            $daftar = Antrean::where(['dosen_id' => $dosenId, 'peran' => $peran, 'periode_id' => $periodeId, 'status' => 'menunggu'])
                ->whereNotIn('id', $dilewati)
                ->orderBy('created_at')->orderBy('id')
                ->get();

            // Buang kandidat yang P1/P2-nya sudah di dosen yang sama (MR-03)
            $daftar = $daftar->reject(fn ($a) => Pengajuan::where(['mahasiswa_id' => $a->mahasiswa_id, 'periode_id' => $periodeId, 'dosen_id' => $dosenId])
                ->whereIn('status', Pengajuan::STATUS_AKTIF)->exists());

            $aktifPerPeran = [
                '1' => Pengajuan::where(['periode_id' => $periodeId, 'peran' => '1'])->whereIn('status', Pengajuan::STATUS_AKTIF)->pluck('mahasiswa_id')->all(),
                '2' => Pengajuan::where(['periode_id' => $periodeId, 'peran' => '2'])->whereIn('status', Pengajuan::STATUS_AKTIF)->pluck('mahasiswa_id')->all(),
            ];

            $kuotaPeminatan = KuotaPeminatan::where('periode_id', $periodeId)->get()
                ->mapWithKeys(fn ($k) => [$k->peminatan_id => ['kuota' => $k->kuota, 'terisi' => $k->terisi]])->all();

            $kandidat = $this->antrean->cariKandidatPromosi(
                $dosenId,
                $peran,
                $daftar->map(fn ($a) => $a->toArray() + ['peran' => (string) $a->peran])->values()->all(),
                $kuotaPeminatan,
                $aktifPerPeran
            );

            if ($kandidat === null) {
                break;
            }

            $antre = Antrean::with('mahasiswa.user')->find($kandidat['id']);
            $hasil = $this->peminatan->ambilSlotAtomik(DB::connection()->getPdo(), [
                'periode_id'   => $periodeId,
                'mahasiswa_id' => $antre->mahasiswa_id,
                'dosen_id'     => $dosenId,
                'peran'        => $peran,
                'peminatan_id' => $antre->peminatan_id,
                'judul'        => $antre->judul,
                'abstrak'      => $antre->abstrak,
                'asal_topik'   => 'Antrean',
            ]);

            if (!$hasil['berhasil']) {
                $dilewati[] = $antre->id;
                continue;
            }

            $antre->update(['status' => 'dipromosikan', 'pengajuan_id' => $hasil['pengajuan_id']]);
            $dipromosikan++;

            $this->notifikasi->kirim($antre->mahasiswa->user, 'promosi_antrean', [
                'peran' => $peran, 'nama_dosen' => $dosen->user->nama,
            ]);
            $this->notifikasi->kirim($dosen->user, 'pengajuan_baru', [
                'nama_mhs' => $antre->mahasiswa->user->nama, 'peran' => $peran, 'judul' => $antre->judul,
            ]);
        }

        return $dipromosikan;
    }

    // =========================================================
    // 6. KEPUTUSAN DOSEN, PELEPASAN SLOT, KEDALUWARSA (MR-03)
    // =========================================================

    /**
     * @param string $keputusan 'terima' | 'tolak'
     */
    public function putuskan(Pengajuan $pengajuan, string $keputusan, ?string $alasan = null): Pengajuan
    {
        if ($pengajuan->status !== 'Menunggu') {
            throw new InvalidArgumentException("Pengajuan berstatus {$pengajuan->status} tidak dapat diputuskan lagi.");
        }
        if ($pengajuan->kedaluwarsa_at && $pengajuan->kedaluwarsa_at->isPast()) {
            $this->kedaluwarsakan($pengajuan);
            throw new InvalidArgumentException('Batas waktu keputusan 7 x 24 jam sudah lewat, pengajuan Kedaluwarsa.');
        }

        $pengajuan->loadMissing(['mahasiswa.user', 'dosen.user']);

        if ($keputusan === 'terima') {
            $pengajuan->update(['status' => 'Diterima', 'diputuskan_at' => now()]);
            $this->notifikasi->kirim($pengajuan->mahasiswa->user, 'pengajuan_diterima', [
                'peran' => $pengajuan->peran, 'nama_dosen' => $pengajuan->dosen->user->nama,
            ]);
            return $pengajuan;
        }

        if ($keputusan !== 'tolak') {
            throw new InvalidArgumentException('Keputusan harus "terima" atau "tolak".');
        }

        $alasan = trim((string) $alasan);
        if (mb_strlen($alasan) < self::ALASAN_TOLAK_MIN) {
            throw new InvalidArgumentException('Alasan penolakan wajib diisi minimal ' . self::ALASAN_TOLAK_MIN . ' karakter.');
        }

        $this->lepasSlot($pengajuan, ['status' => 'Ditolak', 'alasan_tolak' => $alasan, 'diputuskan_at' => now()]);

        $this->notifikasi->kirim($pengajuan->mahasiswa->user, 'pengajuan_ditolak', [
            'peran' => $pengajuan->peran, 'nama_dosen' => $pengajuan->dosen->user->nama, 'alasan' => $alasan,
        ]);

        $this->promosikanAntrean($pengajuan->dosen_id, (string) $pengajuan->peran, $pengajuan->periode_id);

        return $pengajuan->fresh();
    }

    /**
     * Ubah status dan kurangi jumlah terisi kuota dosen (+ kuota peminatan untuk P1) secara atomik.
     */
    public function lepasSlot(Pengajuan $pengajuan, array $perubahan): void
    {
        DB::transaction(function () use ($pengajuan, $perubahan) {
            $kd = KuotaDosen::where([
                'periode_id' => $pengajuan->periode_id,
                'dosen_id'   => $pengajuan->dosen_id,
                'peran'      => $pengajuan->peran,
            ])->lockForUpdate()->first();

            $kp = $pengajuan->peminatan_id
                ? KuotaPeminatan::where(['periode_id' => $pengajuan->periode_id, 'peminatan_id' => $pengajuan->peminatan_id])->lockForUpdate()->first()
                : null;

            $segar = Pengajuan::lockForUpdate()->find($pengajuan->id);
            if (!in_array($segar->status, Pengajuan::STATUS_SLOT, true)) {
                return; // sudah dilepas proses lain
            }

            $segar->update($perubahan);

            if ($kd && $kd->terisi > 0) {
                $kd->decrement('terisi');
            }
            if ($kp && $kp->terisi > 0) {
                $kp->decrement('terisi');
            }
        });

        $pengajuan->refresh();
    }

    public function kedaluwarsakan(Pengajuan $pengajuan): void
    {
        $this->lepasSlot($pengajuan, ['status' => 'Kedaluwarsa']);
        $pengajuan->loadMissing(['mahasiswa.user', 'dosen.user']);

        $this->notifikasi->kirimPesan(
            $pengajuan->mahasiswa->user,
            'pengajuan_kedaluwarsa',
            'Pengajuan Kedaluwarsa',
            "Pengajuan Pembimbing {$pengajuan->peran} ke {$pengajuan->dosen->user->nama} kedaluwarsa karena tidak diputuskan dalam 7 x 24 jam. Silakan ajukan ke dosen lain."
        );

        $this->promosikanAntrean($pengajuan->dosen_id, (string) $pengajuan->peran, $pengajuan->periode_id);
    }

    /**
     * Proses semua pengajuan Menunggu yang lewat 7 x 24 jam. Dipanggil scheduler setiap menit.
     *
     * @return int Jumlah pengajuan yang dikedaluwarsakan
     */
    public function prosesKedaluwarsa(): int
    {
        $daftar = Pengajuan::where('status', 'Menunggu')->where('kedaluwarsa_at', '<', now())->get();
        foreach ($daftar as $p) {
            $this->kedaluwarsakan($p);
        }
        return $daftar->count();
    }

    protected function gagal(int $statusHttp, string $kode, string $pesan, array $ekstra = []): array
    {
        return ['berhasil' => false, 'status_http' => $statusHttp, 'kode' => $kode, 'pesan' => $pesan] + $ekstra;
    }
}
