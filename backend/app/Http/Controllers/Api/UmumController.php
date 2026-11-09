<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Dosen;
use App\Models\KuotaDosen;
use App\Models\Notifikasi;
use App\Models\Periode;
use App\Services\DashboardService;
use App\Services\PengajuanService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\Rule;

/**
 * Endpoint bersama semua peran: dashboard slot (MR-01), profil & topik dosen (MR-02), notifikasi (MR-05).
 */
class UmumController extends Controller
{
    public function __construct(
        protected DashboardService $dashboard,
        protected PengajuanService $pengajuan,
    ) {
    }

    /**
     * MR-01: dipolling frontend setiap 5 detik.
     */
    public function dashboard(Request $request)
    {
        $filter = $request->validate([
            'bidang'    => ['nullable', 'string', 'max:100'],
            'peminatan' => ['nullable', Rule::in(['IoT', 'AI', 'Cyber'])],
            'status'    => ['nullable', Rule::in(['tersedia', 'penuh', 'tidak menerima'])],
        ]);

        // Cadangan bila scheduler tidak jalan: proses kedaluwarsa paling sering sekali per menit
        if (Cache::add('cek_kedaluwarsa', true, 60)) {
            $this->pengajuan->prosesKedaluwarsa();
        }

        return response()->json($this->dashboard->data(Periode::aktif(), $filter));
    }

    /**
     * MR-02: profil dosen beserta katalog topik rekomendasi aktif.
     */
    public function profilDosen(Dosen $dosen)
    {
        $dosen->load(['user:id,nama', 'peminatan', 'topik' => fn ($q) => $q->where('aktif', true)]);
        $periode = Periode::aktif();

        $topikDiambil = \App\Models\Pengajuan::whereIn('status', \App\Models\Pengajuan::STATUS_AKTIF)
            ->whereNotNull('topik_id')->pluck('topik_id')->all();

        return response()->json([
            'id'              => $dosen->id,
            'nama'            => $dosen->user->nama,
            'nidn'            => $dosen->nidn,
            'peminatan_utama' => $dosen->peminatan->nama,
            'bidang_keahlian' => $dosen->bidang_keahlian,
            'kata_kunci'      => $dosen->kata_kunci,
            'menerima'        => $dosen->menerima_bimbingan,
            'kuota'           => $periode ? KuotaDosen::where(['periode_id' => $periode->id, 'dosen_id' => $dosen->id])->get()
                ->map(fn ($k) => ['peran' => $k->peran, 'kuota' => $k->kuota, 'tambahan' => $k->kuota_tambahan, 'terisi' => $k->terisi, 'sisa' => $k->sisa()]) : [],
            'topik'           => $dosen->topik->map(fn ($t) => [
                'id'        => $t->id,
                'judul'     => $t->judul,
                'deskripsi' => $t->deskripsi,
                'tersedia'  => !in_array($t->id, $topikDiambil, true),
            ]),
        ]);
    }

    public function notifikasi(Request $request)
    {
        $daftar = Notifikasi::where('user_id', $request->user()->id)->latest('dibuat_at')->latest('id')->limit(50)->get();

        return response()->json([
            'belum_dibaca' => $daftar->where('dibaca', false)->count(),
            'notifikasi'   => $daftar,
        ]);
    }

    public function bacaSemuaNotifikasi(Request $request)
    {
        Notifikasi::where('user_id', $request->user()->id)->where('dibaca', false)->update(['dibaca' => true]);
        return response()->json(['pesan' => 'Semua notifikasi ditandai sudah dibaca.']);
    }

    public function bacaNotifikasi(Request $request, int $id)
    {
        Notifikasi::where('user_id', $request->user()->id)->where('id', $id)->update(['dibaca' => true]);
        return response()->json(['pesan' => 'Notifikasi ditandai sudah dibaca.']);
    }
}
