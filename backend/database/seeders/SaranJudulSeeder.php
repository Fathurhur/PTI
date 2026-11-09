<?php

namespace Database\Seeders;

use App\Models\Dosen;
use App\Models\SaranJudul;
use Illuminate\Database\Seeder;

/**
 * Saran judul tiap dosen (dari data awal). Aman dijalankan ulang: judul yang sudah ada tidak digandakan.
 * Jalankan: php artisan db:seed --class=SaranJudulSeeder
 */
class SaranJudulSeeder extends Seeder
{
    public function run(): void
    {
        foreach ($this->data() as $nidn => $daftar) {
            $dosen = Dosen::where('nidn', $nidn)->first();
            if ($dosen === null) {
                continue;
            }
            foreach ($daftar as [$judul, $deskripsi]) {
                SaranJudul::firstOrCreate(['dosen_id' => $dosen->id, 'judul' => $judul], ['deskripsi' => $deskripsi]);
            }
        }
    }

    protected function data(): array
    {
        return [
            '0412038801' => [
                ['Prediksi Kebutuhan Irigasi Tanaman Berdasarkan Sensor Lingkungan dan Media Tanam', 'Prediksi kebutuhan air tanaman dari data sensor lingkungan dan kondisi media tanam.'],
                ['Prediksi Kondisi Mikroklimat Smart Greenhouse Menggunakan Transformer Ringan', 'Peramalan suhu, kelembapan, dan mikroklimat greenhouse dengan model transformer ringan.'],
                ['Optimasi Jadwal Irigasi Smart Greenhouse Menggunakan Reinforcement Learning', 'Penjadwalan irigasi adaptif berbasis reinforcement learning pada smart greenhouse.'],
                ['Edge AI untuk Deteksi Anomali Sensor Smart Greenhouse Secara Real-Time', 'Deteksi anomali data sensor langsung di perangkat edge secara real-time.'],
                ['Adaptive Sampling Sensor untuk Mengurangi Konsumsi Energi pada Smart Greenhouse IoT', 'Pengaturan laju sampling sensor secara adaptif untuk menghemat energi node IoT.'],
            ],
            '0415079002' => [
                ['Sistem Manajemen Ternak Kepiting Berbasis IoT: Manajemen Air', 'Pemantauan dan pengendalian kualitas air budidaya kepiting berbasis IoT.'],
                ['Sistem Informasi Average Daily Gain (ADG) pada Peternakan Modern', 'Pencatatan dan analisis pertambahan bobot harian ternak.'],
            ],
            '0420068503' => [
                ['Perancangan Jaringan DePIN untuk Pemantauan Cuaca dan Kualitas Udara Terdesentralisasi', 'Jaringan infrastruktur fisik terdesentralisasi (DePIN) untuk data cuaca dan kualitas udara.'],
            ],
            '0410118804' => [
                ['Knee Abnormality Detection', 'Dataset Kaggle RSNA Knee Abnormality Detection. Syarat: bersedia publikasi international conference.'],
                ['Student Health Risk', 'Dataset Kaggle Playground Series. Metode dari publikasi terindeks Scopus.'],
                ['Klasifikasi Kanker Kulit Melanoma Menggunakan Multimodal', 'Late fusion atau early fusion, metode dari jurnal terindeks Scopus.'],
            ],
            '0407058205' => [
                ['Deteksi Serangan pada Jaringan IoT Menggunakan Lightweight Machine Learning', 'Model machine learning ringan untuk mendeteksi serangan pada jaringan IoT.'],
                ['Cybersecurity untuk Smart Grid IoT', 'Pengamanan komunikasi dan perangkat pada smart grid berbasis IoT.'],
                ['Autoscaling Adaptif pada Server Aplikasi Berdasarkan Prediksi Beban', 'Penambahan/pengurangan sumber daya server otomatis dari hasil prediksi beban.'],
            ],
            '0425098606' => [
                ['Image Processing / Computer Vision dengan Deep Learning', 'Topik image processing/computer vision dengan deep learning.'],
            ],
            '0402128307' => [
                ['Spatio Temporal Forecasting for Environment and Climate Change', 'Peramalan spasio-temporal untuk data lingkungan dan perubahan iklim.'],
            ],
            '0430078908' => [
            ],
        ];
    }
}
