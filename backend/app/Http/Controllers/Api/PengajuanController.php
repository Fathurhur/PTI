<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Antrean;
use App\Models\Dosen;
use App\Models\KuotaDosen;
use App\Models\Pengajuan;
use App\Models\Periode;
use App\Services\AutentikasiService;
use App\Services\PengajuanService;
use App\Services\TfIdfService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Pengajuan (MR-03, MR-04), antrean (MR-05), rekomendasi (MR-06), kemiripan (MR-09), peminatan (MR-10).
 * Hak akses data dibatasi lewat AutentikasiService (MR-08).
 */
class PengajuanController extends Controller
{
    public function __construct(
        protected PengajuanService $pengajuan,
        protected AutentikasiService $auth,
    ) {
    }

    /**
     * Daftar pengajuan sesuai peran: mahasiswa miliknya, dosen yang ditujukan kepadanya, koordinator semua.
     */
    public function index(Request $request)
    {
        $filter = $request->validate([
            'status'     => ['nullable', Rule::in(['Menunggu', 'Antrean', 'Diterima', 'Ditolak', 'Kedaluwarsa', 'Ditetapkan'])],
            'periode_id' => ['nullable', 'integer'],
        ]);

        $sesi = $request->user()->sesi();

        $query = Pengajuan::with(['mahasiswa.user:id,nama', 'dosen.user:id,nama', 'peminatan', 'periode:id,nama,kode', 'surat'])
            ->latest('id');

        // Saring di query sesuai peran, lalu dipastikan ulang oleh AutentikasiService
        if ($sesi['peran'] === AutentikasiService::PERAN_MAHASISWA) {
            $query->where('mahasiswa_id', $sesi['mahasiswa_id']);
        } elseif ($sesi['peran'] === AutentikasiService::PERAN_DOSEN) {
            $query->where('dosen_id', $sesi['dosen_id']);
        }
        if (!empty($filter['status'])) {
            $query->where('status', $filter['status']);
        }
        if (!empty($filter['periode_id'])) {
            $query->where('periode_id', $filter['periode_id']);
        }

        $daftar = $this->auth->filterPengajuanSesuaiPeran(
            $sesi,
            $query->get()->map(fn ($p) => $this->format($p))->all()
        );

        return response()->json(['pengajuan' => $daftar]);
    }

    public function show(Request $request, Pengajuan $pengajuan)
    {
        $this->auth->pastikanBolehLihatPengajuan($request->user()->sesi(), $pengajuan->toArray());
        $pengajuan->load(['mahasiswa.user:id,nama', 'dosen.user:id,nama', 'peminatan', 'periode:id,nama,kode', 'surat']);

        return response()->json(['pengajuan' => $this->format($pengajuan)]);
    }

    /**
     * MR-03: mahasiswa mengajukan Pembimbing 1 / 2.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'dosen_id'  => ['required', 'integer'],
            'peran'     => ['required', Rule::in(['1', '2'])],
            'peminatan' => ['nullable', Rule::in(['IoT', 'AI', 'Cyber'])],
            'judul'     => ['required_without:topik_id', 'nullable', 'string', 'max:200'],
            'abstrak'   => ['required', 'string'],
            'topik_id'  => ['nullable', 'integer'],
        ]);

        $hasil = $this->pengajuan->ajukan($request->user()->mahasiswa, $data);

        return response()->json($hasil, $hasil['status_http']);
    }

    /**
     * MR-09: pratinjau kemiripan judul sebelum mengajukan.
     */
    public function cekKemiripan(Request $request)
    {
        $data = $request->validate([
            'judul'   => ['required', 'string', 'max:200'],
            'abstrak' => ['nullable', 'string'],
        ]);

        $periode = Periode::aktif();
        abort_if($periode === null, 422, 'Belum ada periode aktif.');

        $hasil = $this->pengajuan->periksaKemiripan($data + ['mahasiswa_id' => $request->user()->mahasiswa->id], $periode);
        unset($hasil['catatan_hasil']); // id pembanding tidak dikirim ke mahasiswa

        return response()->json($hasil);
    }

    /**
     * MR-06: rekomendasi maksimal 5 dosen berdasarkan judul & abstrak.
     */
    public function rekomendasi(Request $request, TfIdfService $tfIdf)
    {
        $data = $request->validate([
            'judul'   => ['required', 'string', 'max:200'],
            'abstrak' => ['nullable', 'string'],
            'peran'   => ['nullable', Rule::in(['1', '2'])],
        ]);

        $peran = $data['peran'] ?? '1';
        $periode = Periode::aktif();
        $kuota = $periode
            ? KuotaDosen::where(['periode_id' => $periode->id, 'peran' => $peran])->get()->keyBy('dosen_id')
            : collect();

        $daftarDosen = Dosen::with(['user:id,nama', 'peminatan', 'topik' => fn ($q) => $q->where('aktif', true)])
            ->where('menerima_bimbingan', true)
            ->get()
            ->map(fn ($d) => [
                'id'              => $d->id,
                'nama'            => $d->user->nama,
                'nidn'            => $d->nidn,
                'peminatan_utama' => $d->peminatan->nama,
                'bidang_keahlian' => implode(', ', $d->bidang_keahlian),
                'kata_kunci'      => $d->kata_kunci,
                'topik_dosen'     => $d->topik->map(fn ($t) => $t->judul . ' ' . $t->deskripsi)->implode(' '),
                'sisa_slot'       => isset($kuota[$d->id]) ? $kuota[$d->id]->sisa() : 0,
            ])->all();

        $mulai = microtime(true);
        $hasil = $tfIdf->rekomendasiDosen($data['judul'], $data['abstrak'] ?? '', $daftarDosen);

        return response()->json([
            'peran'        => $peran,
            'rekomendasi'  => $hasil,
            'waktu_proses_ms' => round((microtime(true) - $mulai) * 1000),
        ]);
    }

    /**
     * MR-05: masuk antrean bila slot dosen penuh.
     */
    public function masukAntrean(Request $request)
    {
        $data = $request->validate([
            'dosen_id'  => ['required', 'integer'],
            'peran'     => ['required', Rule::in(['1', '2'])],
            'peminatan' => ['nullable', Rule::in(['IoT', 'AI', 'Cyber'])],
            'judul'     => ['required', 'string', 'max:200'],
            'abstrak'   => ['required', 'string'],
        ]);

        $hasil = $this->pengajuan->masukAntrean($request->user()->mahasiswa, $data);

        return response()->json($hasil, $hasil['status_http']);
    }

    public function antreanSaya(Request $request)
    {
        $daftar = Antrean::with('dosen.user:id,nama')
            ->where('mahasiswa_id', $request->user()->mahasiswa->id)
            ->latest('id')->get()
            ->map(fn ($a) => [
                'id'      => $a->id,
                'dosen'   => $a->dosen->user->nama,
                'peran'   => $a->peran,
                'judul'   => $a->judul,
                'status'  => $a->status,
                'posisi'  => $a->status === 'menunggu' ? $this->pengajuan->posisiAntrean($a) : null,
                'masuk_at' => $a->created_at,
            ]);

        return response()->json(['antrean' => $daftar]);
    }

    /**
     * MR-03: dosen menerima / menolak pengajuan yang ditujukan kepadanya.
     */
    public function putuskan(Request $request, Pengajuan $pengajuan)
    {
        $this->auth->pastikanBolehPutuskan($request->user()->sesi(), $pengajuan->toArray());

        $data = $request->validate([
            'keputusan' => ['required', Rule::in(['terima', 'tolak'])],
            'alasan'    => ['nullable', 'string', 'max:500'],
        ]);

        $hasil = $this->pengajuan->putuskan($pengajuan, $data['keputusan'], $data['alasan'] ?? null);

        return response()->json([
            'pesan'     => $data['keputusan'] === 'terima' ? 'Pengajuan diterima.' : 'Pengajuan ditolak dan slot dilepas.',
            'pengajuan' => $this->format($hasil->load(['mahasiswa.user:id,nama', 'dosen.user:id,nama', 'peminatan', 'periode:id,nama,kode', 'surat'])),
        ]);
    }

    protected function format(Pengajuan $p): array
    {
        return [
            'id'             => $p->id,
            'mahasiswa_id'   => $p->mahasiswa_id,
            'dosen_id'       => $p->dosen_id,
            'mahasiswa'      => $p->mahasiswa?->user?->nama,
            'nim'            => $p->mahasiswa?->nim,
            'dosen'          => $p->dosen?->user?->nama,
            'topik_id'       => $p->topik_id,
            'peran'          => $p->peran,
            'peminatan'      => $p->peminatan?->nama,
            'periode'        => $p->periode?->nama,
            'judul'          => $p->judul,
            'abstrak'        => $p->abstrak,
            'asal_topik'     => $p->asal_topik,
            'status'         => $p->status,
            'alasan_tolak'   => $p->alasan_tolak,
            'kedaluwarsa_at' => $p->kedaluwarsa_at?->toIso8601String(),
            'diputuskan_at'  => $p->diputuskan_at?->toIso8601String(),
            'dibuat_at'      => $p->created_at?->toIso8601String(),
            'nomor_surat'    => $p->surat?->nomor_surat,
            'tgl_sah'        => $p->surat?->tgl_terbit?->toIso8601String(),
        ];
    }
}
