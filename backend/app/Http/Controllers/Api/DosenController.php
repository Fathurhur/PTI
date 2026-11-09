<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\KuotaDosen;
use App\Models\Peminatan;
use App\Models\Pengajuan;
use App\Models\Periode;
use App\Models\SaranJudul;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * MR-02: dosen mengelola profil, peminatan, kata kunci keahlian,
 * dan status menerima/tidak menerima bimbingan. Juga daftar bimbingan + sisa kuota.
 */
class DosenController extends Controller
{
    public function profil(Request $request)
    {
        $dosen = $request->user()->dosen->load(['user:id,nama,email', 'peminatan', 'saranJudul']);

        return response()->json([
            'nama'            => $dosen->user->nama,
            'email'           => $dosen->user->email,
            'nidn'            => $dosen->nidn,
            'peminatan_utama' => $dosen->peminatan->nama,
            'bidang_keahlian' => $dosen->bidang_keahlian,
            'kata_kunci'      => $dosen->kata_kunci,
            'menerima'        => $dosen->menerima_bimbingan,
            'saran_judul'     => $dosen->saranJudul,
        ]);
    }

    /**
     * Nama maks. 100 karakter, 1 peminatan utama, minimal 1 bidang keahlian, maksimal 10 kata kunci.
     */
    public function ubahProfil(Request $request)
    {
        $data = $request->validate([
            'nama'              => ['sometimes', 'string', 'max:100'],
            'peminatan_utama'   => ['sometimes', Rule::in(['IoT', 'AI', 'Cyber'])],
            'bidang_keahlian'   => ['sometimes', 'array', 'min:1'],
            'bidang_keahlian.*' => ['string', 'max:100'],
            'kata_kunci'        => ['sometimes', 'array', 'max:10'],
            'kata_kunci.*'      => ['string', 'max:50'],
            'menerima'          => ['sometimes', 'boolean'],
        ], [
            'kata_kunci.max'      => 'Kata kunci keahlian maksimal 10.',
            'bidang_keahlian.min' => 'Minimal 1 bidang keahlian.',
        ]);

        $dosen = $request->user()->dosen;

        if (isset($data['nama'])) {
            $request->user()->update(['nama' => $data['nama']]);
        }

        $dosen->fill(array_filter([
            'peminatan_id'       => isset($data['peminatan_utama']) ? Peminatan::where('nama', $data['peminatan_utama'])->value('id') : null,
            'bidang_keahlian'    => $data['bidang_keahlian'] ?? null,
            'kata_kunci'         => isset($data['kata_kunci']) ? array_values(array_unique(array_map('trim', $data['kata_kunci']))) : null,
            'menerima_bimbingan' => $data['menerima'] ?? null,
        ], fn ($v) => $v !== null))->save();

        return $this->profil($request);
    }

    /**
     * Saran judul: judul maks. 200, deskripsi maks. 1.000 karakter.
     */
    public function simpanSaranJudul(Request $request, ?SaranJudul $saran = null)
    {
        $data = $request->validate([
            'judul'     => [$saran ? 'sometimes' : 'required', 'string', 'max:200'],
            'deskripsi' => ['nullable', 'string', 'max:1000'],
            'aktif'     => ['sometimes', 'boolean'],
        ]);

        $dosenId = $request->user()->dosen->id;

        if ($saran) {
            abort_unless($saran->dosen_id === $dosenId, 403, 'Saran judul ini bukan milik Anda.');
            $saran->update($data);
        } else {
            $saran = SaranJudul::create($data + ['dosen_id' => $dosenId]);
        }

        return response()->json(['pesan' => 'Saran judul disimpan.', 'saran_judul' => $saran], 201);
    }

    /** Menonaktifkan saran judul (tidak dihapus agar riwayat pengajuan tetap utuh). */
    public function nonaktifkanSaranJudul(Request $request, SaranJudul $saran)
    {
        abort_unless($saran->dosen_id === $request->user()->dosen->id, 403, 'Saran judul ini bukan milik Anda.');
        $saran->update(['aktif' => false]);

        return response()->json(['pesan' => 'Saran judul dinonaktifkan.']);
    }

    /** Daftar bimbingan dan sisa kuota per peran pada periode aktif. */
    public function bimbingan(Request $request)
    {
        $dosen = $request->user()->dosen;
        $periode = Periode::aktif();

        $kuota = $periode
            ? KuotaDosen::where(['periode_id' => $periode->id, 'dosen_id' => $dosen->id])->get()
                ->map(fn ($k) => ['peran' => $k->peran, 'kuota' => $k->kuota, 'tambahan' => $k->kuota_tambahan, 'terisi' => $k->terisi, 'sisa' => $k->sisa()])
            : [];

        $bimbingan = Pengajuan::with('mahasiswa.user:id,nama', 'mahasiswa')
            ->where('dosen_id', $dosen->id)
            ->when($periode, fn ($q) => $q->where('periode_id', $periode->id))
            ->whereIn('status', ['Diterima', 'Ditetapkan'])
            ->get()
            ->map(fn ($p) => [
                'id'     => $p->id,
                'nama'   => $p->mahasiswa->user->nama,
                'nim'    => $p->mahasiswa->nim,
                'peran'  => $p->peran,
                'judul'  => $p->judul,
                'status' => $p->status,
            ]);

        return response()->json(['kuota' => $kuota, 'bimbingan' => $bimbingan]);
    }
}
