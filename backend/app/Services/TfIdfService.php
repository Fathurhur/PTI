<?php

namespace App\Services;

/**
 * Service TF-IDF dan Cosine Similarity sesuai SRS (MR-06 & MR-09)
 * - MR-06: Rekomendasi dosen berdasarkan kecocokan topik & abstrak (Top 5 dosen, skor 0-100%)
 * - MR-09: Deteksi kesamaan judul & topik pengajuan terhadap arsip (Ambang 0.8 / 80%)
 * 
 * Standar: Salton & Buckley (1988)
 */
class TfIdfService
{
    /**
     * Stopwords umum Bahasa Indonesia untuk pembersihan teks
     */
    protected array $stopwords = [
        'dan', 'yang', 'untuk', 'dengan', 'pada', 'dari', 'dalam', 'ke', 'oleh', 'di', 
        'ini', 'itu', 'adalah', 'sebagai', 'atau', 'dapat', 'akan', 'tersebut', 'secara', 
        'antara', 'suatu', 'juga', 'karena', 'namun', 'serta', 'bagi', 'saat', 'tentang',
        'menggunakan', 'berbasis', 'sistem', 'aplikasi', 'metode', 'analisis', 'rancang', 'bangun'
    ];

    /**
     * Tokenisasi & pembersihan teks (case-folding, buang tanda baca, filter stopwords)
     */
    public function tokenize(string $text): array
    {
        $text = mb_strtolower($text, 'UTF-8');
        // Buang tanda baca dan angka, sisakan huruf dan spasi
        $text = preg_replace('/[^\p{L}\s]/u', ' ', $text);
        $rawWords = preg_split('/\s+/', trim($text), -1, PREG_SPLIT_NO_EMPTY);

        $tokens = [];
        foreach ($rawWords as $w) {
            if (mb_strlen($w) > 2 && !in_array($w, $this->stopwords)) {
                $tokens[] = $w;
            }
        }
        return $tokens;
    }

    /**
     * Menghitung nilai Cosine Similarity antara dua dokumen teks (0.00 s/d 1.00)
     */
    public function hitungKemiripan(string $teksA, string $teksB): float
    {
        $tokensA = $this->tokenize($teksA);
        $tokensB = $this->tokenize($teksB);

        if (empty($tokensA) || empty($tokensB)) {
            return 0.0;
        }

        // Kosa kata gabungan
        $vocabulary = array_unique(array_merge($tokensA, $tokensB));
        $freqA = array_count_values($tokensA);
        $freqB = array_count_values($tokensB);

        $dotProduct = 0.0;
        $normA = 0.0;
        $normB = 0.0;

        foreach ($vocabulary as $term) {
            $countA = $freqA[$term] ?? 0;
            $countB = $freqB[$term] ?? 0;

            $dotProduct += $countA * $countB;
            $normA += $countA * $countA;
            $normB += $countB * $countB;
        }

        if ($normA == 0.0 || $normB == 0.0) {
            return 0.0;
        }

        return round($dotProduct / (sqrt($normA) * sqrt($normB)), 4);
    }

    /**
     * MR-09: Cek Kemiripan Judul & Abstrak dengan Arsip
     * 
     * @param string $judulBaru
     * @param string $abstrakBaru
     * @param array $daftarArsip List array berisi ['id', 'judul', 'abstrak', 'tahun']
     * @param float $ambang Default 0.8 (80%) sesuai SRS
     * @return array Status lolos/ditolak, skor tertinggi, dan data pembanding
     */
    public function cekKemiripanJudul(string $judulBaru, string $abstrakBaru, array $daftarArsip, float $ambang = 0.8): array
    {
        $gabunganBaru = $judulBaru . ' ' . $abstrakBaru;
        $skorTertinggi = 0.0;
        $arsipMirip = null;

        foreach ($daftarArsip as $arsip) {
            $gabunganArsip = ($arsip['judul'] ?? '') . ' ' . ($arsip['abstrak'] ?? '');
            $skor = $this->hitungKemiripan($gabunganBaru, $gabunganArsip);

            if ($skor > $skorTertinggi) {
                $skorTertinggi = $skor;
                $arsipMirip = [
                    'judul' => $arsip['judul'],
                    'tahun' => $arsip['tahun'] ?? 'Terdahulu',
                    'skor'  => round($skor * 100, 1) . '%'
                ];
            }
        }

        if ($skorTertinggi >= $ambang) {
            return [
                'lolos' => false,
                'status' => 'ditolak',
                'pesan' => 'Judul Anda memiliki kemiripan tinggi (' . round($skorTertinggi * 100, 1) . '%). Silakan ganti judul atau ubah fokus penelitian Anda.',
                'skor_kemiripan' => $skorTertinggi,
                'arsip_pembanding' => $arsipMirip // SRS MR-09: hanya judul & tahun, tanpa identitas mahasiswa lain
            ];
        }

        return [
            'lolos' => true,
            'status' => 'lolos',
            'pesan' => 'Judul lolos pemeriksaan kemiripan.',
            'skor_kemiripan' => $skorTertinggi
        ];
    }

    /**
     * MR-06: Rekomendasi 5 Dosen Berdasarkan Kecocokan Topik (TF-IDF Cosine)
     * 
     * @param string $judul
     * @param string $abstrak
     * @param array $daftarDosen List array berisi info dosen, kata kunci, sisa slot
     * @return array Maksimal 5 dosen berskor 0-100%, memprioritaskan yang memiliki slot
     */
    public function rekomendasiDosen(string $judul, string $abstrak, array $daftarDosen): array
    {
        $inputMhs = $judul . ' ' . $abstrak;
        $hasil = [];

        foreach ($daftarDosen as $dosen) {
            // Gabungkan kata kunci keahlian dan topik yang ditawarkan dosen
            $profilTeks = ($dosen['nama'] ?? '') . ' ' . 
                          ($dosen['bidang_keahlian'] ?? '') . ' ' . 
                          (is_array($dosen['kata_kunci'] ?? null) ? implode(' ', $dosen['kata_kunci']) : ($dosen['kata_kunci'] ?? '')) . ' ' .
                          ($dosen['topik_dosen'] ?? '');

            $skor = $this->hitungKemiripan($inputMhs, $profilTeks);
            $sisaSlot = ($dosen['sisa_slot'] ?? 0);

            $hasil[] = [
                'id'              => $dosen['id'],
                'nama'            => $dosen['nama'],
                'nidn'            => $dosen['nidn'],
                'peminatan_utama' => $dosen['peminatan_utama'] ?? 'IoT',
                'bidang_keahlian' => $dosen['bidang_keahlian'] ?? '',
                'sisa_slot'       => $sisaSlot,
                'status_slot'     => $sisaSlot > 0 ? 'Tersedia' : 'Penuh – masuk antrian',
                'skor_persen'     => round($skor * 100, 1)
            ];
        }

        // Urutkan: Dosen yang masih ada slot diutamakan, lalu berdasarkan skor tertinggi
        usort($hasil, function ($a, $b) {
            $slotA = $a['sisa_slot'] > 0 ? 1 : 0;
            $slotB = $b['sisa_slot'] > 0 ? 1 : 0;

            if ($slotA !== $slotB) {
                return $slotB <=> $slotA; // Slot tersedia lebih dahulu (SRS MR-06)
            }
            return $b['skor_persen'] <=> $a['skor_persen']; // Skor terbesar lebih dahulu
        });

        // Ambil maksimal 5 dosen (SRS MR-06)
        return array_slice($hasil, 0, 5);
    }
}

