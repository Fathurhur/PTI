<?php

namespace Database\Seeders;

use App\Models\ArsipTopik;
use App\Models\Dosen;
use App\Models\KuotaDosen;
use App\Models\KuotaPeminatan;
use App\Models\Mahasiswa;
use App\Models\Peminatan;
use App\Models\Pengajuan;
use App\Models\Periode;
use App\Models\TopikDosen;
use App\Models\User;
use App\Services\KoordinatorService;
use App\Services\PeminatanService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Data contoh dari prototipe (js/data.js). Semua akun memakai kata sandi: rahasia123
 * Login dengan email, NIM (mahasiswa), atau NIDN (dosen).
 */
class DatabaseSeeder extends Seeder
{
    public const KATA_SANDI = 'rahasia123';

    public function run(): void
    {
        DB::transaction(function () {
            $peminatan = [];
            foreach (PeminatanService::DAFTAR_PEMINATAN as $nama) {
                $peminatan[$nama] = Peminatan::create(['nama' => $nama])->id;
            }

            User::create([
                'nama' => 'Koordinator TA S1 TI', 'email' => 'koordinator@prodi.test',
                'password' => self::KATA_SANDI, 'role' => 'koordinator',
            ]);

            $dosen = [];
            foreach ($this->dataDosen() as $d) {
                $user = User::create([
                    'nama' => $d['nama'], 'email' => $d['email'], 'password' => self::KATA_SANDI, 'role' => 'dosen',
                ]);
                $model = Dosen::create([
                    'user_id'            => $user->id,
                    'peminatan_id'       => $peminatan[$d['peminatan']],
                    'nidn'               => $d['nidn'],
                    'bidang_keahlian'    => $d['bidang'],
                    'kata_kunci'         => $d['kata'],
                    'menerima_bimbingan' => $d['menerima'],
                ]);
                foreach ($d['topik'] as [$judul, $deskripsi]) {
                    TopikDosen::create(['dosen_id' => $model->id, 'judul' => $judul, 'deskripsi' => $deskripsi]);
                }
                $dosen[$d['kunci']] = $model;
            }

            $mhs = [];
            foreach ($this->dataMahasiswa() as [$nim, $nama, $angkatan]) {
                $user = User::create([
                    'nama' => $nama, 'email' => "{$nim}@mahasiswa.test", 'password' => self::KATA_SANDI, 'role' => 'mahasiswa',
                ]);
                $mhs[$nim] = Mahasiswa::create(['user_id' => $user->id, 'nim' => $nim, 'angkatan' => $angkatan]);
            }

            // Periode aktif: kuota otomatis = ceil(42 mahasiswa / 7 dosen aktif) = 6 per peran
            $jumlahMhs = 42;
            $aktif = collect($dosen)->where('menerima_bimbingan', true)->count();
            $kuota = (new KoordinatorService())->hitungKuotaOtomatis($jumlahMhs, $aktif);

            $periode = Periode::create([
                'nama'                => 'Ganjil 2026/2027',
                'kode'                => '2026-1',
                'tgl_mulai'           => now()->subWeek()->toDateString(),
                'tgl_selesai'         => now()->addWeeks(7)->toDateString(),
                'jumlah_mhs_proposal' => $jumlahMhs,
                'kuota_default'       => $kuota,
                'ambang_kemiripan'    => 0.80,
                'status'              => 'aktif',
            ]);

            foreach ($dosen as $kunci => $d) {
                foreach (['1', '2'] as $peran) {
                    KuotaDosen::create([
                        'periode_id' => $periode->id,
                        'dosen_id'   => $d->id,
                        'peran'      => $peran,
                        // Contoh: kuota P1 Dr. Helmy diturunkan koordinator menjadi 2 agar penuh (demo antrean)
                        'kuota'      => !$d->menerima_bimbingan ? 0 : ($kunci === 'helmy' && $peran === '1' ? 2 : $kuota),
                    ]);
                }
            }

            foreach ((new PeminatanService())->hitungKuotaAwal($jumlahMhs) as $nama => $jumlah) {
                KuotaPeminatan::create(['periode_id' => $periode->id, 'peminatan_id' => $peminatan[$nama], 'kuota' => $jumlah]);
            }

            // Pengajuan contoh
            $topikEdge = TopikDosen::where('judul', 'like', 'Edge AI untuk Deteksi Anomali%')->first();
            $topikHealth = TopikDosen::where('judul', 'Student Health Risk')->first();

            $contoh = [
                ['1202230043', 'khodijah', '1', 'IoT', 'Diterima', 'Monitoring Kualitas Air Hidroponik Berbasis Wireless Sensor Network', null],
                ['1202220432', 'khodijah', '1', 'IoT', 'Diterima', 'Data Fusion Multisensor untuk Estimasi Kelembapan Tanah', null],
                ['1202230053', 'khodijah', '1', 'IoT', 'Menunggu', $topikEdge->judul, $topikEdge->id],
                ['1202220024', 'yohanes', '1', 'AI', 'Diterima', 'Prediksi Student Health Risk dengan Machine Learning', $topikHealth->id],
                ['1202230134', 'farah', '1', 'AI', 'Diterima', 'Klasifikasi Penyakit Daun Tanaman dengan CNN', null],
                ['1202230201', 'helmy', '1', 'IoT', 'Diterima', 'Sistem Manajemen Air Budidaya Kepiting Berbasis IoT', null],
                ['1202230202', 'helmy', '1', 'IoT', 'Diterima', 'Prediksi Waktu Panen Kepiting dari Data Sensor Kolam', null],
                ['1202230043', 'adib', '2', null, 'Diterima', 'Monitoring Kualitas Air Hidroponik Berbasis Wireless Sensor Network', null],
                ['1202230013', 'adib', '1', 'IoT', 'Ditolak', 'Sistem Rekomendasi Buku Perpustakaan', null],
            ];

            foreach ($contoh as [$nim, $kunciDosen, $peran, $bidang, $status, $judul, $topikId]) {
                Pengajuan::create([
                    'mahasiswa_id'   => $mhs[$nim]->id,
                    'peminatan_id'   => $bidang ? $peminatan[$bidang] : null,
                    'dosen_id'       => $dosen[$kunciDosen]->id,
                    'topik_id'       => $topikId,
                    'periode_id'     => $periode->id,
                    'peran'          => $peran,
                    'judul'          => $judul,
                    'abstrak'        => "Abstrak contoh untuk judul \"{$judul}\".",
                    'asal_topik'     => $topikId ? 'Rekomendasi dosen' : 'Topik sendiri',
                    'status'         => $status,
                    'alasan_tolak'   => $status === 'Ditolak' ? 'Topik kurang sesuai dengan bidang keahlian dosen (IoT, embedded system & keamanan jaringan).' : null,
                    'kedaluwarsa_at' => $status === 'Menunggu' ? now()->addDay() : now()->subDays(3),
                    'diputuskan_at'  => in_array($status, ['Diterima', 'Ditolak'], true) ? now()->subDays(2) : null,
                ]);
            }

            // Hitung ulang jumlah terisi dari data pengajuan (Menunggu + Diterima + Ditetapkan)
            foreach (KuotaDosen::where('periode_id', $periode->id)->get() as $kd) {
                $kd->update(['terisi' => Pengajuan::where(['periode_id' => $periode->id, 'dosen_id' => $kd->dosen_id, 'peran' => $kd->peran])
                    ->whereIn('status', Pengajuan::STATUS_SLOT)->count()]);
            }
            foreach (KuotaPeminatan::where('periode_id', $periode->id)->get() as $kp) {
                $kp->update(['terisi' => Pengajuan::where(['periode_id' => $periode->id, 'peminatan_id' => $kp->peminatan_id, 'peran' => '1'])
                    ->whereIn('status', Pengajuan::STATUS_SLOT)->count()]);
            }

            foreach ($this->dataArsip() as [$tahun, $judul]) {
                ArsipTopik::create(['judul' => $judul, 'tahun' => $tahun, 'sumber' => 'Perpustakaan']);
            }
        });
    }

    protected function dataMahasiswa(): array
    {
        return [
            ['1202230013', 'Muhammad Fathurrohman', 2023],
            ['1202220024', 'Zaki Naufal Ali', 2022],
            ['1202220432', 'Liobaldo Naragae', 2022],
            ['1202230043', 'Muhammad Alawi', 2023],
            ['1202230053', 'Bagus Faaza Azhar Amin', 2023],
            ['1202230134', 'Rayyan Nabil Abrary', 2023],
            ['1202230201', 'Mahasiswa Contoh Satu', 2023],
            ['1202230202', 'Mahasiswa Contoh Dua', 2023],
            ['1202230203', 'Mahasiswa Contoh Tiga', 2023],
            ['1202230204', 'Mahasiswa Contoh Empat', 2023],
        ];
    }

    protected function dataArsip(): array
    {
        return [
            [2025, 'Klasifikasi Penyakit Daun Padi Menggunakan Convolutional Neural Network'],
            [2025, 'Rancang Bangun Sistem Informasi Akademik Sekolah Berbasis Web'],
            [2024, 'Prediksi Harga Saham Perbankan Menggunakan LSTM'],
            [2024, 'Monitoring Kelembapan Tanah Pertanian Berbasis Internet of Things'],
            [2024, 'Deteksi Serangan DDoS pada Jaringan Kampus Menggunakan Random Forest'],
            [2023, 'Analisis Sentimen Ulasan Aplikasi Transportasi Online dengan Naive Bayes'],
            [2023, 'Sistem Parkir Cerdas Berbasis RFID dan Internet of Things'],
        ];
    }

    protected function dataDosen(): array
    {
        return [
            [
                'kunci' => 'khodijah', 'nama' => 'Dr. Khodijah Amiroh, S.ST., M.T', 'email' => 'khodijah@dosen.test', 'nidn' => '0412038801',
                'peminatan' => 'IoT', 'menerima' => true,
                'bidang' => ['Internet of Things (IoT)', 'Embedded System & Otomasi', 'Data Science & Statistik'],
                'kata' => ['internet of things', 'embedded system', 'wireless sensor network', 'data fusion', 'smart greenhouse', 'sensor', 'irigasi', 'edge ai', 'prediksi'],
                'topik' => [
                    ['Prediksi Kebutuhan Irigasi Tanaman Berdasarkan Sensor Lingkungan dan Media Tanam', 'Prediksi kebutuhan air tanaman dari data sensor lingkungan dan kondisi media tanam.'],
                    ['Prediksi Kondisi Mikroklimat Smart Greenhouse Menggunakan Transformer Ringan', 'Peramalan suhu, kelembapan, dan mikroklimat greenhouse dengan model transformer ringan.'],
                    ['Optimasi Jadwal Irigasi Smart Greenhouse Menggunakan Reinforcement Learning', 'Penjadwalan irigasi adaptif berbasis reinforcement learning pada smart greenhouse.'],
                    ['Edge AI untuk Deteksi Anomali Sensor Smart Greenhouse Secara Real-Time', 'Deteksi anomali data sensor langsung di perangkat edge secara real-time.'],
                    ['Adaptive Sampling Sensor untuk Mengurangi Konsumsi Energi pada Smart Greenhouse IoT', 'Pengaturan laju sampling sensor secara adaptif untuk menghemat energi node IoT.'],
                ],
            ],
            [
                'kunci' => 'helmy', 'nama' => 'Dr. Helmy Widyantara, S.Kom., M.Eng.', 'email' => 'helmy@dosen.test', 'nidn' => '0415079002',
                'peminatan' => 'IoT', 'menerima' => true,
                'bidang' => ['Internet of Things (IoT)', 'Embedded System & Otomasi'],
                'kata' => ['internet of things', 'computer organization', 'arsitektur komputer', 'industrial automation', 'smart farming', 'peternakan', 'kepiting', 'monitoring'],
                'topik' => [
                    ['Sistem Manajemen Ternak Kepiting Berbasis IoT: Manajemen Air', 'Pemantauan dan pengendalian kualitas air budidaya kepiting berbasis IoT.'],
                    ['Sistem Informasi Average Daily Gain (ADG) pada Peternakan Modern', 'Pencatatan dan analisis pertambahan bobot harian ternak.'],
                ],
            ],
            [
                'kunci' => 'philip', 'nama' => 'Philip Tobianto Daely, S.T., M.Eng., Ph.D.', 'email' => 'philip@dosen.test', 'nidn' => '0420068503',
                'peminatan' => 'Cyber', 'menerima' => true,
                'bidang' => ['Internet of Things (IoT)', 'Jaringan & Keamanan Siber'],
                'kata' => ['internet of things', 'distributed computing', 'cybersecurity', 'blockchain', 'depin', 'desentralisasi', 'kualitas udara', 'cuaca'],
                'topik' => [
                    ['Perancangan Jaringan DePIN untuk Pemantauan Cuaca dan Kualitas Udara Terdesentralisasi', 'Jaringan infrastruktur fisik terdesentralisasi (DePIN) untuk data cuaca dan kualitas udara.'],
                ],
            ],
            [
                'kunci' => 'yohanes', 'nama' => 'Yohanes Setiawan, S.Si., M.Kom.', 'email' => 'yohanes@dosen.test', 'nidn' => '0410118804',
                'peminatan' => 'AI', 'menerima' => true,
                'bidang' => ['Data Science & Statistik', 'Kecerdasan Buatan & Machine Learning', 'Computer Vision'],
                'kata' => ['matematika', 'statistika', 'data analytics', 'machine learning', 'computer vision', 'multimodal', 'fusion', 'klasifikasi', 'deep learning'],
                'topik' => [
                    ['Knee Abnormality Detection', 'Dataset Kaggle RSNA Knee Abnormality Detection. Syarat: bersedia publikasi international conference.'],
                    ['Student Health Risk', 'Dataset Kaggle Playground Series. Metode dari publikasi terindeks Scopus.'],
                    ['Klasifikasi Kanker Kulit Melanoma Menggunakan Multimodal', 'Late fusion atau early fusion, metode dari jurnal terindeks Scopus.'],
                ],
            ],
            [
                'kunci' => 'adib', 'nama' => 'Muhammad Adib Kamali, S.T., M.Eng', 'email' => 'adib@dosen.test', 'nidn' => '0407058205',
                'peminatan' => 'IoT', 'menerima' => true,
                'bidang' => ['Internet of Things (IoT)', 'Embedded System & Otomasi', 'Kecerdasan Buatan & Machine Learning', 'Jaringan & Keamanan Siber'],
                'kata' => ['internet of things', 'signal processing', 'embedded system', 'artificial intelligence', 'keamanan jaringan', 'edge ai', 'smart grid', 'server', 'anomali'],
                'topik' => [
                    ['Deteksi Serangan pada Jaringan IoT Menggunakan Lightweight Machine Learning', 'Model machine learning ringan untuk mendeteksi serangan pada jaringan IoT.'],
                    ['Cybersecurity untuk Smart Grid IoT', 'Pengamanan komunikasi dan perangkat pada smart grid berbasis IoT.'],
                    ['Autoscaling Adaptif pada Server Aplikasi Berdasarkan Prediksi Beban', 'Penambahan/pengurangan sumber daya server otomatis dari hasil prediksi beban.'],
                ],
            ],
            [
                'kunci' => 'farah', 'nama' => 'Dr. Farah Zakiyah Rahmanti, S.ST., M.T.', 'email' => 'farah@dosen.test', 'nidn' => '0425098606',
                'peminatan' => 'AI', 'menerima' => true,
                'bidang' => ['Computer Vision', 'Kecerdasan Buatan & Machine Learning'],
                'kata' => ['computer vision', 'deep learning', 'image processing', 'pengolahan citra', 'machine learning', 'human computer interaction', 'klasifikasi citra'],
                'topik' => [
                    ['Image Processing / Computer Vision dengan Deep Learning', 'Topik image processing/computer vision dengan deep learning.'],
                ],
            ],
            [
                'kunci' => 'mustafa', 'nama' => 'Mustafa Kamal, S.Kom., M.Kom.', 'email' => 'mustafa@dosen.test', 'nidn' => '0402128307',
                'peminatan' => 'AI', 'menerima' => false,
                'bidang' => ['Tata Kelola TI & Manajemen Proyek', 'Kecerdasan Buatan & Machine Learning'],
                'kata' => ['it audit', 'project management', 'deep learning', 'forecasting', 'time series', 'transformer', 'vision transformer', 'rag', 'iklim'],
                'topik' => [
                    ['Spatio Temporal Forecasting for Environment and Climate Change', 'Peramalan spasio-temporal untuk data lingkungan dan perubahan iklim.'],
                ],
            ],
            [
                'kunci' => 'qori', 'nama' => 'Qori Afiata Fiddina, S.Mat., M.Mat', 'email' => 'qori@dosen.test', 'nidn' => '0430078908',
                'peminatan' => 'AI', 'menerima' => true,
                'bidang' => ['Data Science & Statistik'],
                'kata' => ['optimasi', 'statistik', 'data analytics', 'analisis numerik', 'matematika', 'pemodelan'],
                'topik' => [],
            ],
        ];
    }
}
