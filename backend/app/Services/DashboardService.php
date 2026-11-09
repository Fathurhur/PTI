<?php

namespace App\Services;

use App\Models\Antrean;
use App\Models\Dosen;
use App\Models\KuotaDosen;
use App\Models\Pengajuan;
use App\Models\Periode;
use App\Models\SaranJudul;

/**
 * Service Dashboard Slot Real-time
 * Sesuai Dokumen SRS MR-01 (Menampilkan ketersediaan slot dosen pembimbing secara real-time)
 * Submodul 1: Dashboard Slot Real-time
 *
 * Aturan SRS yang diimplementasikan:
 * - Menampilkan kuota, jumlah terisi, dan sisa slot Pembimbing 1 dan 2 setiap dosen
 * - Label "kuota + tambahan" bila koordinator memberi slot tambahan (MR-07)
 * - Status dosen: tersedia / penuh / tidak menerima, serta jumlah antrean
 * - Sisa slot setiap peminatan (MR-10)
 * - Filter berdasarkan bidang keahlian, peminatan, dan status
 * - Diperbarui <= 5 detik: frontend melakukan polling endpoint ini setiap 5 detik
 * - Target <= 3 detik untuk 100 dosen: data diambil dengan 4 query tetap (tanpa N+1)
 */
class DashboardService
{
    public const STATUS_TERSEDIA = 'tersedia';
    public const STATUS_PENUH = 'penuh';
    public const STATUS_TIDAK_MENERIMA = 'tidak menerima';

    public function __construct(protected PeminatanService $peminatan)
    {
    }

    /**
     * @param Periode|null $periode Periode aktif
     * @param array        $filter  ['bidang' => string, 'peminatan' => 'IoT'|'AI'|'Cyber', 'status' => tersedia|penuh|tidak menerima]
     */
    public function data(?Periode $periode, array $filter = []): array
    {
        $dosenList = Dosen::with([
            'user:id,nama,email',
            'peminatan',
            'saranJudul' => fn ($q) => $q->where('aktif', true)->orderBy('id'),
        ])->get();

        // Saran judul yang sedang dipakai pengajuan aktif tidak bisa dipakai mahasiswa lain
        $saranTerpakai = array_flip(SaranJudul::idTerpakai());

        // Tanpa periode aktif, dosen tetap ditampilkan dengan kuota 0
        $kuota = $periode
            ? KuotaDosen::where('periode_id', $periode->id)->get()->groupBy('dosen_id')->map(fn ($baris) => $baris->keyBy('peran'))
            : collect();

        $antrean = $periode
            ? Antrean::where('periode_id', $periode->id)
                ->where('status', 'menunggu')
                ->selectRaw('dosen_id, peran, COUNT(*) as jumlah')
                ->groupBy('dosen_id', 'peran')
                ->get()
                ->groupBy('dosen_id')
                ->map(fn ($baris) => $baris->pluck('jumlah', 'peran'))
            : collect();

        $hasil = [];
        foreach ($dosenList as $d) {
            $p1 = $this->ringkasPeran($kuota[$d->id]['1'] ?? null);
            $p2 = $this->ringkasPeran($kuota[$d->id]['2'] ?? null);

            if (!$d->menerima_bimbingan) {
                $status = self::STATUS_TIDAK_MENERIMA;
            } elseif ($p1['sisa'] > 0 || $p2['sisa'] > 0) {
                $status = self::STATUS_TERSEDIA;
            } else {
                $status = self::STATUS_PENUH;
            }

            $hasil[] = [
                'id'              => $d->id,
                'nama'            => $d->user->nama,
                'nidn'            => $d->nidn,
                'peminatan_utama' => $d->peminatan->nama,
                'bidang_keahlian' => $d->bidang_keahlian,
                'kata_kunci'      => $d->kata_kunci,
                'menerima'        => $d->menerima_bimbingan,
                'status'          => $status,
                'pembimbing_1'    => $p1 + ['antrean' => (int) ($antrean[$d->id]['1'] ?? 0)],
                'pembimbing_2'    => $p2 + ['antrean' => (int) ($antrean[$d->id]['2'] ?? 0)],
                'saran_judul'     => $d->saranJudul->map(fn ($t) => [
                    'id'        => $t->id,
                    'judul'     => $t->judul,
                    'deskripsi' => $t->deskripsi,
                    'tersedia'  => !isset($saranTerpakai[$t->id]),
                ])->values()->all(),
            ];
        }

        $hasil = $this->saring($hasil, $filter);

        return [
            'periode' => $periode ? [
                'id'               => $periode->id,
                'nama'             => $periode->nama,
                'kode'             => $periode->kode,
                'tgl_mulai'        => $periode->tgl_mulai->toDateString(),
                'tgl_selesai'      => $periode->tgl_selesai->toDateString(),
                'berjalan'         => $periode->sedangBerjalan(),
                'ambang_kemiripan' => (float) $periode->ambang_kemiripan,
                'jumlah_mhs_proposal' => (int) $periode->jumlah_mhs_proposal,
            ] : null,
            'dosen'         => array_values($hasil),
            'interval_polling_detik' => 5,
            'diperbarui_at' => now()->toIso8601String(),
        ];
    }

    protected function ringkasPeran(?KuotaDosen $k): array
    {
        if ($k === null) {
            return ['kuota' => 0, 'tambahan' => 0, 'label_kuota' => '0', 'terisi' => 0, 'sisa' => 0];
        }

        return [
            'kuota'       => (int) $k->kuota,
            'tambahan'    => (int) $k->kuota_tambahan,
            'label_kuota' => $k->kuota_tambahan > 0 ? "{$k->kuota} + {$k->kuota_tambahan}" : (string) $k->kuota,
            'terisi'      => (int) $k->terisi,
            'sisa'        => $k->sisa(),
        ];
    }

    protected function saring(array $dosen, array $filter): array
    {
        $bidang = mb_strtolower(trim((string) ($filter['bidang'] ?? '')));
        $peminatan = $filter['peminatan'] ?? null;
        $status = $filter['status'] ?? null;

        return array_filter($dosen, function ($d) use ($bidang, $peminatan, $status) {
            if ($peminatan && $d['peminatan_utama'] !== $peminatan) {
                return false;
            }
            if ($status && $d['status'] !== $status) {
                return false;
            }
            if ($bidang !== '') {
                $teks = mb_strtolower(implode(' ', array_merge($d['bidang_keahlian'], $d['kata_kunci'])));
                if (!str_contains($teks, $bidang)) {
                    return false;
                }
            }
            return true;
        });
    }
}
