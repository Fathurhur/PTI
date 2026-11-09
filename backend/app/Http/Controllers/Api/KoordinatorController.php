<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ArsipJudul;
use App\Models\Dosen;
use App\Models\KuotaDosen;
use App\Models\LogAktivitas;
use App\Models\Mahasiswa;
use App\Models\Peminatan;
use App\Models\Pengajuan;
use App\Models\Periode;
use App\Models\RiwayatPemindahan;
use App\Models\SuratPenetapan;
use App\Models\User;
use App\Services\DashboardService;
use App\Services\KemiripanJudulService;
use App\Services\KoordinatorService;
use App\Services\NotifikasiService;
use App\Services\PeminatanService;
use App\Services\PengajuanService;
use App\Services\SuratPenetapanService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use InvalidArgumentException;

/**
 * MR-07: administrasi periode, kuota, slot tambahan, pemindahan, pengesahan & surat PDF, rekap CSV.
 * MR-09: impor arsip judul. Impor data pengguna (CSV).
 */
class KoordinatorController extends Controller
{
    public function __construct(
        protected KoordinatorService $koordinator,
        protected PeminatanService $peminatan,
        protected KemiripanJudulService $kemiripan,
        protected SuratPenetapanService $surat,
        protected NotifikasiService $notifikasi,
        protected PengajuanService $pengajuan,
        protected DashboardService $dashboard,
    ) {
    }

    // ---------------------------------------------------------
    // Periode
    // ---------------------------------------------------------

    public function daftarPeriode()
    {
        return response()->json(['periode' => Periode::latest('id')->get()]);
    }

    /**
     * Buka periode: kuota P1 & P2 tiap dosen = ceil(mahasiswa Penulisan Proposal / dosen aktif).
     */
    public function bukaPeriode(Request $request)
    {
        $data = $request->validate([
            'nama'                => ['required', 'string', 'max:50'],
            'kode'                => ['required', 'string', 'max:20', 'regex:/^[A-Za-z0-9\-]+$/', 'unique:periode,kode'],
            'tgl_mulai'           => ['required', 'date'],
            'tgl_selesai'         => ['required', 'date'],
            'jumlah_mhs_proposal' => ['required', 'integer', 'min:0', 'max:2000'],
        ]);

        $this->koordinator->validasiBukaPeriode($data, Periode::where('status', 'aktif')->exists());

        $dosenAktif = Dosen::where('menerima_bimbingan', true)->get();
        $kuota = min(20, $this->koordinator->hitungKuotaOtomatis($data['jumlah_mhs_proposal'], $dosenAktif->count()));

        $periode = DB::transaction(function () use ($data, $kuota) {
            $periode = Periode::create($data + ['kuota_default' => $kuota, 'status' => 'aktif']);

            foreach (Dosen::all() as $dosen) {
                foreach (['1', '2'] as $peran) {
                    KuotaDosen::create([
                        'periode_id' => $periode->id,
                        'dosen_id'   => $dosen->id,
                        'peran'      => $peran,
                        'kuota'      => $dosen->menerima_bimbingan ? $kuota : 0,
                    ]);
                }
            }

            LogAktivitas::catat('buka_periode', ['periode_id' => $periode->id, 'kuota_per_peran' => $kuota]);
            return $periode;
        });

        return response()->json([
            'pesan'           => "Periode {$periode->nama} dibuka. Kuota Pembimbing 1 dan 2 tiap dosen aktif: {$kuota}.",
            'periode'         => $periode,
            'kuota_per_peran' => $kuota,
        ], 201);
    }

    /** Ubah tanggal mulai/selesai periode yang sedang aktif. */
    public function ubahPeriode(Request $request, Periode $periode)
    {
        $data = $request->validate([
            'tgl_mulai'   => ['required', 'date'],
            'tgl_selesai' => ['required', 'date', 'after:tgl_mulai'],
        ], ['tgl_selesai.after' => 'Tanggal selesai harus lebih akhir dari tanggal mulai.']);

        if ($periode->status !== 'aktif') {
            throw new InvalidArgumentException('Periode yang sudah ditutup tidak dapat diubah.');
        }

        $periode->update($data);
        LogAktivitas::catat('ubah_tanggal_periode', ['periode_id' => $periode->id] + $data);

        return response()->json(['pesan' => 'Tanggal periode disimpan.', 'periode' => $periode]);
    }

    public function tutupPeriode(Periode $periode)
    {
        $periode->update(['status' => 'ditutup']);
        LogAktivitas::catat('tutup_periode', ['periode_id' => $periode->id]);

        return response()->json(['pesan' => "Periode {$periode->nama} ditutup."]);
    }

    // ---------------------------------------------------------
    // Data dosen
    // ---------------------------------------------------------

    /** Tambah satu akun dosen (alternatif impor CSV), sekaligus kuota pada periode aktif. */
    public function tambahDosen(Request $request)
    {
        $data = $request->validate([
            'nama'              => ['required', 'string', 'min:3', 'max:100'],
            'nidn'              => ['required', 'digits:10', 'unique:dosen,nidn'],
            'email'             => ['required', 'email', 'max:150', 'unique:users,email'],
            'kata_sandi'        => ['required', 'string', 'min:8', 'max:72'],
            'peminatan_utama'   => ['required', Rule::in(PeminatanService::DAFTAR_PEMINATAN)],
            'bidang_keahlian'   => ['required', 'array', 'min:1'],
            'bidang_keahlian.*' => ['string', 'max:100'],
            'kata_kunci'        => ['nullable', 'array', 'max:10'],
            'kata_kunci.*'      => ['string', 'max:50'],
            'kuota_p1'          => ['required', 'integer', 'min:0', 'max:20'],
            'kuota_p2'          => ['required', 'integer', 'min:0', 'max:20'],
            'menerima'          => ['required', 'boolean'],
        ], ['nidn.digits' => 'NIDN harus 10 digit angka.', 'nidn.unique' => 'NIDN sudah terdaftar.']);

        $dosen = DB::transaction(function () use ($data) {
            $user = User::create([
                'nama' => $data['nama'], 'email' => $data['email'], 'password' => $data['kata_sandi'], 'role' => 'dosen',
            ]);
            $dosen = Dosen::create([
                'user_id'            => $user->id,
                'nidn'               => $data['nidn'],
                'peminatan_id'       => Peminatan::where('nama', $data['peminatan_utama'])->value('id'),
                'bidang_keahlian'    => array_values($data['bidang_keahlian']),
                'kata_kunci'         => array_values($data['kata_kunci'] ?? []),
                'menerima_bimbingan' => $data['menerima'],
            ]);

            if ($periode = Periode::aktif()) {
                foreach (['1' => $data['kuota_p1'], '2' => $data['kuota_p2']] as $peran => $kuota) {
                    KuotaDosen::create(['periode_id' => $periode->id, 'dosen_id' => $dosen->id, 'peran' => $peran, 'kuota' => $kuota]);
                }
            }

            LogAktivitas::catat('tambah_dosen', ['dosen_id' => $dosen->id, 'nidn' => $data['nidn']]);
            return $dosen;
        });

        return response()->json(['pesan' => "{$data['nama']} ditambahkan sebagai dosen pembimbing.", 'dosen_id' => $dosen->id], 201);
    }

    /** Koordinator mengubah status menerima / tidak menerima bimbingan dosen. */
    public function ubahMenerima(Request $request, Dosen $dosen)
    {
        $data = $request->validate(['menerima' => ['required', 'boolean']]);

        if ($dosen->menerima_bimbingan !== (bool) $data['menerima']) {
            $dosen->update(['menerima_bimbingan' => $data['menerima']]);
            LogAktivitas::catat('ubah_menerima', ['dosen_id' => $dosen->id, 'menerima' => (bool) $data['menerima']]);
            $this->notifikasi->kirimPesan(
                $dosen->user,
                'status_menerima',
                'Status Bimbingan Diubah Koordinator',
                $data['menerima'] ? 'Koordinator mengaktifkan status Anda: sekarang menerima bimbingan.' : 'Koordinator menonaktifkan status Anda: sekarang tidak menerima bimbingan.'
            );
        }

        return response()->json(['pesan' => 'Status menerima bimbingan diperbarui.', 'menerima' => (bool) $data['menerima']]);
    }

    // ---------------------------------------------------------
    // Kuota dosen, slot tambahan, kuota peminatan
    // ---------------------------------------------------------

    /** Kuota per dosen per peran 0–20, tidak boleh di bawah jumlah terisi. */
    public function ubahKuotaDosen(Request $request, Dosen $dosen)
    {
        $data = $request->validate([
            'peran' => ['required', Rule::in(['1', '2'])],
            'kuota' => ['required', 'integer'],
        ]);
        $periode = $this->periodeAktif();

        $kd = DB::transaction(function () use ($data, $dosen, $periode) {
            $kd = KuotaDosen::where(['periode_id' => $periode->id, 'dosen_id' => $dosen->id, 'peran' => $data['peran']])
                ->lockForUpdate()->firstOrFail();
            $this->koordinator->validasiUbahKuota($data['kuota'], $kd->terisi);
            $lama = $kd->kuota;
            $kd->update(['kuota' => $data['kuota']]);
            LogAktivitas::catat('ubah_kuota_dosen', ['dosen_id' => $dosen->id, 'peran' => $data['peran'], 'dari' => $lama, 'ke' => $data['kuota']]);
            return $kd;
        });

        $dipromosikan = $this->pengajuan->promosikanAntrean($dosen->id, $data['peran'], $periode->id);

        return response()->json(['pesan' => 'Kuota diperbarui.', 'kuota' => $kd, 'antrean_dipromosikan' => $dipromosikan]);
    }

    /** Slot tambahan di luar kuota dasar, alasan minimal 10 karakter, tercatat di log, notifikasi ke dosen. */
    public function slotTambahan(Request $request, Dosen $dosen)
    {
        $data = $request->validate([
            'peran'  => ['required', Rule::in(['1', '2'])],
            'jumlah' => ['required', 'integer', 'min:1', 'max:20'],
            'alasan' => ['required', 'string', 'max:500'],
        ]);
        $periode = $this->periodeAktif();
        $log = $this->koordinator->validasiSlotTambahan($data['jumlah'], $data['alasan']);

        $kd = DB::transaction(function () use ($data, $dosen, $periode, $log) {
            $kd = KuotaDosen::where(['periode_id' => $periode->id, 'dosen_id' => $dosen->id, 'peran' => $data['peran']])
                ->lockForUpdate()->firstOrFail();
            $kd->update([
                'kuota_tambahan'  => $kd->kuota_tambahan + $log['slot_tambahan'],
                'alasan_tambahan' => $log['alasan'],
            ]);
            LogAktivitas::catat('slot_tambahan', ['dosen_id' => $dosen->id, 'peran' => $data['peran']] + $log);
            return $kd;
        });

        $this->notifikasi->kirim($dosen->user, 'slot_tambahan', ['jumlah' => $log['slot_tambahan'], 'peran' => $data['peran']]);
        $dipromosikan = $this->pengajuan->promosikanAntrean($dosen->id, $data['peran'], $periode->id);

        return response()->json([
            'pesan'                => "Slot tambahan diberikan. Kuota sekarang {$kd->kuota} + {$kd->kuota_tambahan}.",
            'kuota'                => $kd,
            'antrean_dipromosikan' => $dipromosikan,
        ]);
    }

    // ---------------------------------------------------------
    // Pemindahan (realokasi) pengajuan
    // ---------------------------------------------------------

    public function pindahkan(Request $request, Pengajuan $pengajuan)
    {
        $data = $request->validate([
            'dosen_tujuan_id' => ['required', 'integer', 'exists:dosen,id'],
            'alasan'          => ['required', 'string', 'max:500'],
        ]);

        $pengajuan->load(['peminatan', 'mahasiswa.user', 'dosen.user']);
        $tujuan = Dosen::with(['user', 'peminatan'])->findOrFail($data['dosen_tujuan_id']);
        $asalId = $pengajuan->dosen_id;
        $peran = (string) $pengajuan->peran;

        // P1 dan P2 tetap harus dosen berbeda (MR-03)
        $bentrok = Pengajuan::where(['mahasiswa_id' => $pengajuan->mahasiswa_id, 'periode_id' => $pengajuan->periode_id, 'dosen_id' => $tujuan->id])
            ->where('id', '!=', $pengajuan->id)->whereIn('status', Pengajuan::STATUS_AKTIF)->exists();
        if ($bentrok) {
            throw new InvalidArgumentException('Dosen tujuan sudah menjadi pembimbing lain mahasiswa ini. P1 dan P2 harus berbeda.');
        }

        $log = DB::transaction(function () use ($pengajuan, $tujuan, $asalId, $peran, $data) {
            // Kunci kedua baris kuota berurutan id agar tidak deadlock
            $baris = KuotaDosen::where(['periode_id' => $pengajuan->periode_id, 'peran' => $peran])
                ->whereIn('dosen_id', [$asalId, $tujuan->id])
                ->orderBy('id')->lockForUpdate()->get()->keyBy('dosen_id');

            $kdTujuan = $baris[$tujuan->id] ?? throw new InvalidArgumentException('Kuota dosen tujuan belum diatur pada periode ini.');
            $segar = Pengajuan::lockForUpdate()->find($pengajuan->id);

            $log = $this->koordinator->validasiPemindahan(
                [
                    'id'        => $segar->id,
                    'status'    => $segar->status,
                    'dosen_id'  => (int) $segar->dosen_id,
                    'peran'     => $peran,
                    'peminatan' => $pengajuan->peminatan?->nama,
                ],
                [
                    'id'              => (int) $tujuan->id,
                    'nama'            => $tujuan->user->nama,
                    'peminatan_utama' => $tujuan->peminatan->nama,
                    'kuota_p1'        => $peran === '1' ? $kdTujuan->kuota : 0,
                    'kuota_tambahan'  => $peran === '1' ? $kdTujuan->kuota_tambahan : 0,
                    'terisi_p1'       => $peran === '1' ? $kdTujuan->terisi : 0,
                    'kuota_p2'        => $peran === '2' ? $kdTujuan->kapasitas() : 0,
                    'terisi_p2'       => $peran === '2' ? $kdTujuan->terisi : 0,
                ],
                $data['alasan']
            );

            $segar->update(['dosen_id' => $tujuan->id]);
            if (isset($baris[$asalId]) && $baris[$asalId]->terisi > 0) {
                $baris[$asalId]->decrement('terisi');
            }
            $kdTujuan->increment('terisi');

            RiwayatPemindahan::create([
                'pengajuan_id'    => $segar->id,
                'dosen_asal_id'   => $asalId,
                'dosen_tujuan_id' => $tujuan->id,
                'dipindah_oleh'   => auth()->id(),
                'alasan'          => $log['alasan'],
            ]);
            LogAktivitas::catat('pindahkan_pengajuan', $log);

            return $log;
        });

        $asal = $pengajuan->dosen;
        $pesan = "Pengajuan Pembimbing {$peran} \"{$pengajuan->judul}\" ({$pengajuan->mahasiswa->user->nama}) dipindahkan dari {$asal->user->nama} ke {$tujuan->user->nama}. Alasan: {$log['alasan']}";
        foreach ([$pengajuan->mahasiswa->user, $asal->user, $tujuan->user] as $penerima) {
            $this->notifikasi->kirimPesan($penerima, 'pemindahan', 'Pengajuan Dipindahkan Koordinator', $pesan);
        }

        $this->pengajuan->promosikanAntrean($asalId, $peran, $pengajuan->periode_id);

        return response()->json(['pesan' => 'Pengajuan berhasil dipindahkan.', 'log' => $log]);
    }

    // ---------------------------------------------------------
    // Pengesahan & surat penetapan PDF
    // ---------------------------------------------------------

    public function sahkan(Pengajuan $pengajuan)
    {
        if ($pengajuan->status !== 'Diterima') {
            throw new InvalidArgumentException('Hanya pengajuan berstatus Diterima yang dapat disahkan.');
        }

        $pengajuan->load(['mahasiswa.user', 'dosen.user', 'periode', 'peminatan']);

        $surat = DB::transaction(function () use ($pengajuan) {
            Periode::lockForUpdate()->find($pengajuan->periode_id); // nomor urut unik per periode
            $urut = SuratPenetapan::whereHas('pengajuan', fn ($q) => $q->where('periode_id', $pengajuan->periode_id))->count() + 1;
            $nomor = $this->surat->generateNomorSurat($pengajuan->periode->kode, $urut);

            $berkas = 'surat/' . str_replace('/', '-', $nomor) . '.pdf';
            $pdf = Pdf::loadView('surat.penetapan', [
                'nomor'     => $nomor,
                'pengajuan' => $pengajuan,
                'tanggal'   => now(),
                'koordinator' => auth()->user()->nama,
            ]);
            Storage::disk('local')->put($berkas, $pdf->output());

            $pengajuan->update(['status' => 'Ditetapkan']);

            return SuratPenetapan::create([
                'pengajuan_id'  => $pengajuan->id,
                'disahkan_oleh' => auth()->id(),
                'nomor_surat'   => $nomor,
                'tgl_terbit'    => now(),
                'berkas_pdf'    => $berkas,
            ]);
        });

        $pesan = "Penetapan Pembimbing {$pengajuan->peran} ({$pengajuan->dosen->user->nama}) untuk {$pengajuan->mahasiswa->user->nama} telah disahkan. Nomor surat: {$surat->nomor_surat}.";
        $this->notifikasi->kirimPesan($pengajuan->mahasiswa->user, 'penetapan', 'Pembimbing Ditetapkan', $pesan);
        $this->notifikasi->kirimPesan($pengajuan->dosen->user, 'penetapan', 'Pembimbing Ditetapkan', $pesan);

        return response()->json(['pesan' => 'Penetapan disahkan.', 'surat' => $surat]);
    }

    // ---------------------------------------------------------
    // Rekap beban & log
    // ---------------------------------------------------------

    public function rekap()
    {
        return response()->json($this->dashboard->data(Periode::aktif()));
    }

    /** Rekap beban dosen + peminatan ke CSV. */
    public function rekapCsv()
    {
        $periode = $this->periodeAktif();
        $data = $this->dashboard->data($periode);

        $dosen = array_map(fn ($d) => [
            'nidn'            => $d['nidn'],
            'nama'            => $d['nama'],
            'peminatan_utama' => $d['peminatan_utama'],
            'kuota_p1'        => $d['pembimbing_1']['kuota'] + $d['pembimbing_1']['tambahan'],
            'terisi_p1'       => $d['pembimbing_1']['terisi'],
            'kuota_p2'        => $d['pembimbing_2']['kuota'] + $d['pembimbing_2']['tambahan'],
            'terisi_p2'       => $d['pembimbing_2']['terisi'],
            'menerima'        => $d['menerima'],
        ], $data['dosen']);

        $csv = $this->surat->exportRekapBebanCsv($dosen);

        return response($csv, 200, [
            'Content-Type'        => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="rekap-beban-' . $periode->kode . '.csv"',
        ]);
    }

    public function log()
    {
        return response()->json(['log' => LogAktivitas::latest('id')->limit(100)->get()]);
    }

    // ---------------------------------------------------------
    // Impor CSV
    // ---------------------------------------------------------

    /** MR-09: impor arsip judul TA (kolom: judul, tahun, abstrak?, sumber?). */
    public function imporArsip(Request $request)
    {
        $request->validate(['berkas' => ['required', 'file', 'mimes:csv,txt', 'max:5120']]);

        $hasil = $this->kemiripan->imporArsipCsv(file_get_contents($request->file('berkas')->getRealPath()));

        $baru = 0;
        foreach ($hasil['valid'] as $baris) {
            $arsip = ArsipJudul::firstOrCreate(['judul' => $baris['judul'], 'tahun' => $baris['tahun']], $baris);
            $baru += $arsip->wasRecentlyCreated ? 1 : 0;
        }
        LogAktivitas::catat('impor_arsip', ['baru' => $baru, 'galat' => count($hasil['galat'])]);

        return response()->json([
            'pesan' => "{$baru} judul arsip baru diimpor.",
            'galat' => $hasil['galat'],
        ]);
    }

    /**
     * Impor akun mahasiswa/dosen.
     * Kolom: peran,nama,email,kata_sandi,nim,angkatan,nidn,peminatan
     * (mahasiswa: nim + angkatan; dosen: nidn + peminatan)
     */
    public function imporPengguna(Request $request)
    {
        $request->validate(['berkas' => ['required', 'file', 'mimes:csv,txt', 'max:5120']]);

        $baris = array_map('str_getcsv', preg_split('/\r\n|\n|\r/', trim(file_get_contents($request->file('berkas')->getRealPath()))));
        $header = array_map(fn ($h) => mb_strtolower(trim(preg_replace('/^\xEF\xBB\xBF/', '', $h))), array_shift($baris));

        $berhasil = 0;
        $galat = [];

        foreach ($baris as $i => $kolom) {
            $r = array_combine($header, array_pad($kolom, count($header), ''));
            $nomor = $i + 2;

            $validator = validator($r, [
                'peran'      => ['required', Rule::in(['mahasiswa', 'dosen'])],
                'nama'       => ['required', 'max:100'],
                'email'      => ['required', 'email', 'unique:users,email'],
                'kata_sandi' => ['required', 'min:8', 'max:72'],
                'nim'        => ['required_if:peran,mahasiswa', 'nullable', 'unique:mahasiswa,nim'],
                'angkatan'   => ['required_if:peran,mahasiswa', 'nullable', 'integer'],
                'nidn'       => ['required_if:peran,dosen', 'nullable', 'unique:dosen,nidn'],
                'peminatan'  => ['required_if:peran,dosen', 'nullable', Rule::in(PeminatanService::DAFTAR_PEMINATAN)],
            ]);

            if ($validator->fails()) {
                $galat[] = ['baris' => $nomor, 'pesan' => implode(' ', $validator->errors()->all())];
                continue;
            }

            DB::transaction(function () use ($r) {
                $user = User::create([
                    'nama' => $r['nama'], 'email' => $r['email'], 'password' => $r['kata_sandi'], 'role' => $r['peran'],
                ]);
                if ($r['peran'] === 'mahasiswa') {
                    Mahasiswa::create(['user_id' => $user->id, 'nim' => $r['nim'], 'angkatan' => (int) $r['angkatan']]);
                } else {
                    Dosen::create([
                        'user_id'         => $user->id,
                        'nidn'            => $r['nidn'],
                        'peminatan_id'    => Peminatan::where('nama', $r['peminatan'])->value('id'),
                        'bidang_keahlian' => [$r['peminatan']],
                        'kata_kunci'      => [],
                    ]);
                }
            });
            $berhasil++;
        }

        LogAktivitas::catat('impor_pengguna', ['berhasil' => $berhasil, 'galat' => count($galat)]);

        return response()->json(['pesan' => "{$berhasil} akun diimpor.", 'galat' => $galat]);
    }

    protected function periodeAktif(): Periode
    {
        return Periode::aktif() ?? throw new InvalidArgumentException('Belum ada periode aktif.');
    }
}
