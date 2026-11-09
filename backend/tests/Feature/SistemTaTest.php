<?php

namespace Tests\Feature;

use App\Models\Antrean;
use App\Models\Dosen;
use App\Models\KuotaDosen;
use App\Models\Mahasiswa;
use App\Models\Notifikasi;
use App\Models\Pengajuan;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Uji black-box alur utama MR-01 sampai MR-10 lewat API (database SQLite in-memory + data seeder).
 */
class SistemTaTest extends TestCase
{
    use RefreshDatabase;

    protected bool $seed = true;
    protected string $seeder = DatabaseSeeder::class;

    // ---------- helper ----------

    protected function mhs(string $nim): User
    {
        return Mahasiswa::where('nim', $nim)->firstOrFail()->user;
    }

    protected function dosen(string $nidn): Dosen
    {
        return Dosen::where('nidn', $nidn)->firstOrFail();
    }

    protected function koordinator(): User
    {
        return User::where('role', 'koordinator')->firstOrFail();
    }

    /** Abstrak 160 kata (syarat 150–300 kata) */
    protected function abstrak(string $tema = 'sensor kelembapan tanah'): string
    {
        return trim(str_repeat("Penelitian ini membahas {$tema} dengan pendekatan eksperimen terukur. ", 20));
    }

    protected function kuota(string $nidn, string $peran): KuotaDosen
    {
        return KuotaDosen::where(['dosen_id' => $this->dosen($nidn)->id, 'peran' => $peran])->firstOrFail();
    }

    // ---------- MR-08 ----------

    public function test_mr08_login_nim_dan_pesan_gagal_seragam(): void
    {
        $this->postJson('/api/login', ['identitas' => '1202230013', 'kata_sandi' => 'rahasia123'])
            ->assertOk()->assertJsonPath('user.peran', 'mahasiswa');

        $this->postJson('/api/logout')->assertOk();

        $salahSandi = $this->postJson('/api/login', ['identitas' => '1202230013', 'kata_sandi' => 'salah12345'])->assertStatus(401);
        $tidakAda = $this->postJson('/api/login', ['identitas' => '9999999999', 'kata_sandi' => 'salah12345'])->assertStatus(401);
        $this->assertSame($salahSandi->json('pesan'), $tidakAda->json('pesan'));

        $this->postJson('/api/login', ['identitas' => '0412038801', 'kata_sandi' => 'rahasia123'])
            ->assertOk()->assertJsonPath('user.peran', 'dosen');
    }

    public function test_mr08_kata_sandi_tersimpan_bcrypt(): void
    {
        $this->assertStringStartsWith('$2y$', $this->koordinator()->getAuthPassword());
    }

    public function test_mr08_akses_tanpa_hak_403_dan_tanpa_login_401(): void
    {
        $this->getJson('/api/dashboard')->assertStatus(401);

        $this->actingAs($this->mhs('1202230013'))
            ->postJson('/api/koordinator/periode', [])->assertStatus(403);

        $this->actingAs($this->dosen('0412038801')->user)
            ->postJson('/api/pengajuan', [])->assertStatus(403);
    }

    public function test_mr08_mahasiswa_hanya_melihat_pengajuan_miliknya(): void
    {
        $milikAlawi = Pengajuan::where('mahasiswa_id', Mahasiswa::where('nim', '1202230043')->value('id'))->first();

        $res = $this->actingAs($this->mhs('1202230013'))->getJson('/api/pengajuan')->assertOk();
        $this->assertNotEmpty($res->json('pengajuan'));
        foreach ($res->json('pengajuan') as $p) {
            $this->assertSame(Mahasiswa::where('nim', '1202230013')->value('id'), $p['mahasiswa_id']);
        }

        $this->getJson("/api/pengajuan/{$milikAlawi->id}")->assertStatus(403);
    }

    // ---------- MR-01 ----------

    public function test_mr01_dashboard_menampilkan_slot_per_peran_dan_saran_judul(): void
    {
        $res = $this->actingAs($this->mhs('1202230013'))->getJson('/api/dashboard')->assertOk();

        $res->assertJsonStructure([
            'periode' => ['nama', 'kode'],
            'dosen' => [['nama', 'status', 'pembimbing_1' => ['kuota', 'terisi', 'sisa', 'antrean'], 'pembimbing_2', 'saran_judul']],
        ]);

        $helmy = collect($res->json('dosen'))->firstWhere('nidn', '0415079002');
        $this->assertSame(0, $helmy['pembimbing_1']['sisa']);

        $mustafa = collect($res->json('dosen'))->firstWhere('nidn', '0402128307');
        $this->assertSame('tidak menerima', $mustafa['status']);

        $this->getJson('/api/dashboard?peminatan=Cyber')->assertOk()->assertJsonCount(1, 'dosen');
    }

    // ---------- MR-03 / MR-04 ----------

    public function test_mr03_ajukan_p1_berhasil_mengunci_slot_dan_notifikasi_dosen(): void
    {
        $sebelum = $this->kuota('0412038801', '1')->terisi;

        $this->actingAs($this->mhs('1202230013'))->postJson('/api/pengajuan', [
            'dosen_id'  => $this->dosen('0412038801')->id,
            'peran'     => '1',
            'peminatan' => 'IoT',
            'judul'     => 'Sistem Peringatan Dini Banjir Rob Berbasis LoRaWAN',
            'abstrak'   => $this->abstrak('peringatan banjir rob pesisir'),
        ])->assertStatus(201)->assertJsonPath('pengajuan.status', 'Menunggu');

        $this->assertSame($sebelum + 1, $this->kuota('0412038801', '1')->terisi);
        $this->assertTrue(Notifikasi::where('user_id', $this->dosen('0412038801')->user_id)->where('jenis', 'pengajuan_baru')->exists());
    }

    public function test_mr03_aturan_satu_pengajuan_per_peran_dan_p1_p2_beda_dosen(): void
    {
        $this->actingAs($this->mhs('1202230013'));
        $khodijah = $this->dosen('0412038801')->id;

        $this->postJson('/api/pengajuan', [
            'dosen_id' => $khodijah, 'peran' => '1', 'peminatan' => 'IoT',
            'judul' => 'Sistem Peringatan Dini Banjir Rob Berbasis LoRaWAN', 'abstrak' => $this->abstrak('banjir rob'),
        ])->assertStatus(201);

        $this->postJson('/api/pengajuan', [
            'dosen_id' => $this->dosen('0415079002')->id, 'peran' => '1', 'peminatan' => 'IoT',
            'judul' => 'Judul Lain Tentang Irigasi Sawah', 'abstrak' => $this->abstrak('irigasi sawah'),
        ])->assertStatus(422)->assertJsonPath('kode', 'aturan_peran');

        $this->postJson('/api/pengajuan', [
            'dosen_id' => $khodijah, 'peran' => '2',
            'judul' => 'Sistem Peringatan Dini Banjir Rob Berbasis LoRaWAN', 'abstrak' => $this->abstrak('banjir rob'),
        ])->assertStatus(422)->assertJsonPath('pesan', 'Pembimbing 1 dan Pembimbing 2 harus dosen yang berbeda.');

        // P2 ke dosen lain dengan judul yang sama (milik sendiri) tetap boleh
        $this->postJson('/api/pengajuan', [
            'dosen_id' => $this->dosen('0410118804')->id, 'peran' => '2',
            'judul' => 'Sistem Peringatan Dini Banjir Rob Berbasis LoRaWAN', 'abstrak' => $this->abstrak('banjir rob'),
        ])->assertStatus(201);
    }

    public function test_mr03_validasi_abstrak_dan_peminatan_p1(): void
    {
        $this->actingAs($this->mhs('1202230013'));

        $this->postJson('/api/pengajuan', [
            'dosen_id' => $this->dosen('0412038801')->id, 'peran' => '1', 'peminatan' => 'IoT',
            'judul' => 'Judul Pendek', 'abstrak' => 'Terlalu pendek.',
        ])->assertStatus(422);

        $this->postJson('/api/pengajuan', [
            'dosen_id' => $this->dosen('0412038801')->id, 'peran' => '1', 'peminatan' => 'AI',
            'judul' => 'Sistem Peringatan Dini Banjir Rob', 'abstrak' => $this->abstrak(),
        ])->assertStatus(422);
    }

    public function test_mr03_dosen_tolak_wajib_alasan_dan_slot_dilepas(): void
    {
        $bagus = Pengajuan::where('status', 'Menunggu')->firstOrFail();
        $this->actingAs($this->dosen('0412038801')->user);
        $sebelum = $this->kuota('0412038801', '1')->terisi;

        $this->postJson("/api/pengajuan/{$bagus->id}/putuskan", ['keputusan' => 'tolak', 'alasan' => 'pendek'])->assertStatus(422);
        $this->postJson("/api/pengajuan/{$bagus->id}/putuskan", ['keputusan' => 'tolak', 'alasan' => 'Kuota bimbingan sudah terlalu banyak.'])
            ->assertOk()->assertJsonPath('pengajuan.status', 'Ditolak');

        $this->assertSame($sebelum - 1, $this->kuota('0412038801', '1')->terisi);

        // Dosen lain tidak boleh memutuskan pengajuan yang bukan untuknya
        $lain = Pengajuan::where('dosen_id', '!=', $this->dosen('0410118804')->id)->first();
        $this->actingAs($this->dosen('0410118804')->user)
            ->postJson("/api/pengajuan/{$lain->id}/putuskan", ['keputusan' => 'terima'])->assertStatus(403);
    }

    public function test_mr03_saran_judul_dosen_hanya_untuk_satu_mahasiswa(): void
    {
        $dosen = $this->dosen('0412038801');
        $saran = \App\Models\SaranJudul::where('dosen_id', $dosen->id)->firstOrFail();

        $res = $this->actingAs($this->mhs('1202230013'))->postJson('/api/pengajuan', [
            'dosen_id' => $dosen->id, 'peran' => '1', 'peminatan' => 'IoT',
            'saran_judul_id' => $saran->id, 'abstrak' => $this->abstrak('irigasi tanaman'),
        ])->assertStatus(201);
        $this->assertSame($saran->judul, $res->json('pengajuan.judul'));

        $this->actingAs($this->mhs('1202230203'))->postJson('/api/pengajuan', [
            'dosen_id' => $dosen->id, 'peran' => '1', 'peminatan' => 'IoT',
            'saran_judul_id' => $saran->id, 'abstrak' => $this->abstrak('irigasi tanaman'),
        ])->assertStatus(422)->assertJsonPath('kode', 'saran_diambil');

        // saran dosen lain tidak bisa dipakai pada dosen ini
        $lain = \App\Models\SaranJudul::where('dosen_id', '!=', $dosen->id)->firstOrFail();
        $this->postJson('/api/pengajuan', [
            'dosen_id' => $dosen->id, 'peran' => '1', 'peminatan' => 'IoT',
            'saran_judul_id' => $lain->id, 'abstrak' => $this->abstrak('irigasi tanaman'),
        ])->assertStatus(422);
    }

    // ---------- MR-04 + MR-05 ----------

    public function test_mr05_slot_penuh_masuk_antrean_lalu_dipromosikan_saat_slot_dilepas(): void
    {
        $helmy = $this->dosen('0415079002');
        $input = [
            'dosen_id' => $helmy->id, 'peran' => '1', 'peminatan' => 'IoT',
            'judul' => 'Otomasi Pemberian Pakan Kepiting Soka', 'abstrak' => $this->abstrak('pakan kepiting soka'),
        ];

        $res = $this->actingAs($this->mhs('1202230203'))->postJson('/api/pengajuan', $input)
            ->assertStatus(409)->assertJsonPath('kode', 'slot_dosen_penuh')->assertJsonPath('tawaran_antrean', true);
        $this->assertSame('2', $res->json('saran_peran_lain.peran'));

        $this->postJson('/api/antrean', $input)->assertStatus(201)->assertJsonPath('posisi', 1);

        // Dosen menolak salah satu bimbingan Menunggu → slot terbuka → antrean dipromosikan
        $p = Pengajuan::where(['dosen_id' => $helmy->id, 'peran' => '1'])->first();
        $p->update(['status' => 'Menunggu', 'kedaluwarsa_at' => now()->addDay()]);

        $this->actingAs($helmy->user)->postJson("/api/pengajuan/{$p->id}/putuskan", [
            'keputusan' => 'tolak', 'alasan' => 'Mahasiswa diminta mencari judul lain.',
        ])->assertOk();

        $mhsId = Mahasiswa::where('nim', '1202230203')->value('id');
        $this->assertSame('dipromosikan', Antrean::where('mahasiswa_id', $mhsId)->value('status'));
        $this->assertTrue(Pengajuan::where(['mahasiswa_id' => $mhsId, 'dosen_id' => $helmy->id, 'status' => 'Menunggu'])->exists());
        $this->assertTrue(Notifikasi::where('user_id', $this->mhs('1202230203')->id)->where('jenis', 'promosi_antrean')->exists());
        $this->assertSame(2, $this->kuota('0415079002', '1')->terisi);
    }

    public function test_mr03_kedaluwarsa_7_hari_melepas_slot(): void
    {
        $p = Pengajuan::where('status', 'Menunggu')->firstOrFail();
        $p->update(['kedaluwarsa_at' => now()->subMinute()]);
        $sebelum = $this->kuota('0412038801', '1')->terisi;

        $this->artisan('pengajuan:kedaluwarsa')->assertSuccessful();

        $this->assertSame('Kedaluwarsa', $p->fresh()->status);
        $this->assertSame($sebelum - 1, $this->kuota('0412038801', '1')->terisi);
    }

    // ---------- MR-06 ----------

    public function test_mr06_rekomendasi_maksimal_5_dosen_dan_yang_bersisa_slot_lebih_dulu(): void
    {
        $res = $this->actingAs($this->mhs('1202230013'))->postJson('/api/rekomendasi', [
            'judul' => 'Deteksi Anomali Sensor Smart Greenhouse dengan Edge AI',
            'abstrak' => 'internet of things sensor greenhouse edge ai anomali',
        ])->assertOk();

        $daftar = $res->json('rekomendasi');
        $this->assertLessThanOrEqual(5, count($daftar));
        $this->assertSame('Dr. Khodijah Amiroh, S.ST., M.T', $daftar[0]['nama']);
    }

    // ---------- MR-07 ----------

    public function test_mr07_buka_periode_ditolak_bila_masih_ada_periode_aktif(): void
    {
        $this->actingAs($this->koordinator())->postJson('/api/koordinator/periode', [
            'nama' => 'Genap', 'kode' => '2027-2', 'tgl_mulai' => '2027-02-01', 'tgl_selesai' => '2027-03-01', 'jumlah_mhs_proposal' => 40,
        ])->assertStatus(422);
    }

    public function test_mr07_kuota_tidak_bisa_di_bawah_terisi_dan_slot_tambahan(): void
    {
        $this->actingAs($this->koordinator());
        $khodijah = $this->dosen('0412038801');

        $this->putJson("/api/koordinator/dosen/{$khodijah->id}/kuota", ['peran' => '1', 'kuota' => 1])->assertStatus(422);
        $this->putJson("/api/koordinator/dosen/{$khodijah->id}/kuota", ['peran' => '1', 'kuota' => 21])->assertStatus(422);

        $this->postJson("/api/koordinator/dosen/{$khodijah->id}/slot-tambahan", ['peran' => '1', 'jumlah' => 1, 'alasan' => 'singkat'])->assertStatus(422);
        $this->postJson("/api/koordinator/dosen/{$khodijah->id}/slot-tambahan", ['peran' => '1', 'jumlah' => 2, 'alasan' => 'Banyak mahasiswa IoT belum dapat pembimbing.'])
            ->assertOk();

        $dash = $this->getJson('/api/dashboard')->json('dosen');
        $this->assertSame('6 + 2', collect($dash)->firstWhere('nidn', '0412038801')['pembimbing_1']['label_kuota']);
        $this->assertTrue(Notifikasi::where('user_id', $khodijah->user_id)->where('jenis', 'slot_tambahan')->exists());
    }

    public function test_mr07_pindahkan_pengajuan_menunggu_ke_dosen_lain(): void
    {
        $p = Pengajuan::where('status', 'Menunggu')->firstOrFail();
        $adib = $this->dosen('0407058205');

        // Pembimbing 1 tidak boleh dipindah ke peminatan berbeda
        $this->actingAs($this->koordinator())->postJson("/api/koordinator/pengajuan/{$p->id}/pindahkan", [
            'dosen_tujuan_id' => $this->dosen('0410118804')->id, 'alasan' => 'Pemerataan beban',
        ])->assertStatus(422);

        $this->postJson("/api/koordinator/pengajuan/{$p->id}/pindahkan", [
            'dosen_tujuan_id' => $adib->id, 'alasan' => 'Pemerataan beban dosen IoT',
        ])->assertOk();

        $this->assertSame($adib->id, $p->fresh()->dosen_id);
        $this->assertDatabaseHas('riwayat_pemindahan', ['pengajuan_id' => $p->id, 'dosen_tujuan_id' => $adib->id]);
    }

    public function test_mr07_sahkan_menerbitkan_surat_pdf_bernomor_unik(): void
    {
        Storage::fake('local');
        $p = Pengajuan::where('status', 'Diterima')->orderBy('id')->firstOrFail();

        $this->actingAs($this->koordinator())->postJson("/api/koordinator/pengajuan/{$p->id}/sahkan")
            ->assertOk()->assertJsonPath('surat.nomor_surat', 'SP-TA/2026-1/001');

        $this->assertSame('Ditetapkan', $p->fresh()->status);

        $kedua = Pengajuan::where('status', 'Diterima')->orderBy('id')->firstOrFail();
        $this->postJson("/api/koordinator/pengajuan/{$kedua->id}/sahkan")->assertJsonPath('surat.nomor_surat', 'SP-TA/2026-1/002');

        $this->actingAs($p->mahasiswa->user)->get("/api/pengajuan/{$p->id}/surat")
            ->assertOk()->assertHeader('content-type', 'application/pdf');
        $this->actingAs($this->mhs('1202230013'))->getJson("/api/pengajuan/{$p->id}/surat")->assertStatus(403);
    }

    public function test_mr07_rekap_csv(): void
    {
        $res = $this->actingAs($this->koordinator())->get('/api/koordinator/rekap.csv')->assertOk();
        $this->assertStringContainsString('NIDN,"Nama Dosen"', $res->getContent());
    }

    // ---------- MR-09 ----------

    public function test_mr09_judul_mirip_arsip_ditolak_tanpa_identitas(): void
    {
        $res = $this->actingAs($this->mhs('1202230013'))->postJson('/api/pengajuan', [
            'dosen_id' => $this->dosen('0412038801')->id, 'peran' => '1', 'peminatan' => 'IoT',
            'judul' => 'Monitoring Kelembapan Tanah Pertanian Berbasis IoT', 'abstrak' => $this->abstrak('kelembapan tanah'),
        ])->assertStatus(422)->assertJsonPath('kode', 'judul_mirip');

        $this->assertSame('arsip', $res->json('kemiripan.pembanding.sumber'));
        $this->assertSame(2024, $res->json('kemiripan.pembanding.tahun'));
    }
}
