<?php

namespace App\Services;

use InvalidArgumentException;

/**
 * Service Pemeriksaan Kemiripan Judul & Abstrak
 * Sesuai Dokumen SRS MR-09 (Mendeteksi kesamaan judul dan abstrak pengajuan terhadap seluruh periode)
 * Submodul 9: Pemeriksaan Kemiripan Judul
 *
 * Aturan SRS yang diimplementasikan:
 * - Judul + abstrak pengajuan dibandingkan dengan pengajuan AKTIF seluruh periode
 *   (Menunggu, Antrean, Diterima, Ditetapkan) dan arsip judul TA angkatan sebelumnya
 * - Metode TF-IDF + cosine similarity (Salton & Buckley, 1988)
 * - Skor >= ambang (awal 0,8, dapat diubah koordinator) => pengajuan DITOLAK dengan pesan peringatan
 * - Pesan tidak menampilkan identitas mahasiswa lain; untuk arsip hanya judul dan tahun
 * - Pemeriksaan dijalankan SEBELUM slot dikunci (MR-04)
 * - Arsip judul diimpor koordinator melalui CSV
 * - Target kinerja: <= 5 detik untuk 5.000 judul arsip (indeks terbalik, lihat bangunIndeks())
 *
 * Catatan: tokenisasi & stopword memakai TfIdfService (MR-06) agar praproses teks konsisten.
 */
class KemiripanJudulService
{
    /** Ambang awal kemiripan sesuai SRS MR-09 */
    public const AMBANG_DEFAULT = 0.8;

    /** Rentang ambang yang boleh diatur koordinator */
    public const AMBANG_MIN = 0.5;
    public const AMBANG_MAKS = 1.0;

    /** Status pengajuan yang dianggap aktif (definisi SRS MR-03) */
    public const STATUS_AKTIF = ['Menunggu', 'Antrean', 'Diterima', 'Ditetapkan'];

    public const SUMBER_ARSIP = 'arsip';
    public const SUMBER_PENGAJUAN = 'pengajuan';

    /** Jumlah pembanding teratas yang dikembalikan untuk dicatat ke tabel hasil_kemiripan */
    public const JUMLAH_CATATAN = 5;

    /**
     * Penyeragaman istilah/singkatan agar "IoT" dan "Internet of Things" dihitung sebagai kata yang sama.
     * Bentuk kanonik sengaja dibuat > 2 huruf karena tokenisasi membuang kata pendek.
     */
    public const SINONIM = [
        'internet of things'            => 'internetofthings',
        'iot'                           => 'internetofthings',
        'artificial intelligence'       => 'kecerdasanbuatan',
        'kecerdasan buatan'             => 'kecerdasanbuatan',
        'ai'                            => 'kecerdasanbuatan',
        'machine learning'              => 'machinelearning',
        'pembelajaran mesin'            => 'machinelearning',
        'ml'                            => 'machinelearning',
        'deep learning'                 => 'deeplearning',
        'convolutional neural network'  => 'cnn',
        'sistem pendukung keputusan'    => 'spk',
        'decision support system'       => 'spk',
        'cyber security'                => 'keamanansiber',
        'cybersecurity'                 => 'keamanansiber',
        'keamanan siber'                => 'keamanansiber',
    ];

    protected TfIdfService $tfIdf;

    public function __construct(?TfIdfService $tfIdf = null)
    {
        $this->tfIdf = $tfIdf ?? new TfIdfService();
    }

    /**
     * Normalisasi istilah lalu tokenisasi (case-folding, buang tanda baca & stopword lewat TfIdfService).
     */
    public function tokenize(string $teks): array
    {
        $teks = mb_strtolower($teks, 'UTF-8');
        foreach (self::SINONIM as $istilah => $kanonik) {
            $teks = preg_replace('/\b' . preg_quote($istilah, '/') . '\b/u', $kanonik, $teks);
        }
        return $this->tfIdf->tokenize($teks);
    }

    // =========================================================
    // 1. AMBANG KEMIRIPAN (diatur koordinator)
    // =========================================================

    /**
     * Validasi ambang kemiripan yang diubah koordinator.
     * Menerima nilai desimal (0,8) maupun persen (80).
     *
     * @return float Ambang dalam bentuk desimal 0..1
     * @throws InvalidArgumentException bila di luar rentang
     */
    public function validasiAmbang(float $ambang): float
    {
        if ($ambang > 1.0) {
            $ambang = $ambang / 100; // input persen, mis. 80 => 0.8
        }

        if ($ambang < self::AMBANG_MIN || $ambang > self::AMBANG_MAKS) {
            throw new InvalidArgumentException(sprintf(
                'Ambang kemiripan harus antara %d%% dan %d%%.',
                self::AMBANG_MIN * 100,
                self::AMBANG_MAKS * 100
            ));
        }

        return round($ambang, 2);
    }

    // =========================================================
    // 2. INDEKS TF-IDF (dibangun sekali, dipakai berulang)
    // =========================================================

    /**
     * Bangun indeks TF-IDF dari seluruh dokumen pembanding.
     * Indeks ini dapat disimpan di cache (mis. Cache::remember) dan dibangun ulang hanya saat
     * arsip diimpor atau pengajuan aktif berubah, sehingga pemeriksaan 5.000 judul tetap < 5 detik.
     *
     * Setiap dokumen diindeks dua kali: judul saja dan gabungan judul + abstrak.
     *
     * @param array $pengajuanAktif Pengajuan seluruh periode:
     *                              [['id', 'mahasiswa_id', 'judul', 'abstrak', 'status', 'periode'?], ...]
     * @param array $arsip          Arsip judul TA: [['id', 'judul', 'abstrak'?, 'tahun'], ...]
     * @return array Indeks siap pakai untuk periksa()
     */
    public function bangunIndeks(array $pengajuanAktif, array $arsip): array
    {
        $dokumen = [];

        foreach ($pengajuanAktif as $p) {
            if (!in_array($p['status'] ?? '', self::STATUS_AKTIF, true)) {
                continue; // Ditolak / Kedaluwarsa tidak lagi mengunci judul
            }
            $dokumen[] = [
                'sumber'       => self::SUMBER_PENGAJUAN,
                'ref_id'       => $p['id'] ?? null,
                'mahasiswa_id' => $p['mahasiswa_id'] ?? null,
                'judul'        => (string) ($p['judul'] ?? ''),
                'abstrak'      => (string) ($p['abstrak'] ?? ''),
                'tahun'        => null,
                'periode'      => $p['periode'] ?? null,
            ];
        }

        foreach ($arsip as $a) {
            $dokumen[] = [
                'sumber'       => self::SUMBER_ARSIP,
                'ref_id'       => $a['id'] ?? null,
                'mahasiswa_id' => null,
                'judul'        => (string) ($a['judul'] ?? ''),
                'abstrak'      => (string) ($a['abstrak'] ?? ''),
                'tahun'        => $a['tahun'] ?? null,
                'periode'      => null,
            ];
        }

        $tokenJudul = [];
        $tokenGabungan = [];
        foreach ($dokumen as $i => $d) {
            $tokenJudul[$i] = $this->tokenize($d['judul']);
            $tokenGabungan[$i] = $this->tokenize($d['judul'] . ' ' . $d['abstrak']);
        }

        return [
            'dokumen'  => $dokumen,
            'judul'    => $this->bangunRuangVektor($tokenJudul),
            'gabungan' => $this->bangunRuangVektor($tokenGabungan),
        ];
    }

    /**
     * Hitung IDF, vektor TF-IDF ternormalisasi (L2), dan indeks terbalik untuk sekumpulan dokumen.
     *
     * TF  = 1 + log(frekuensi kata)          (sublinear TF)
     * IDF = log((N + 1) / (df + 1)) + 1      (smoothed IDF, tidak pernah 0)
     */
    protected function bangunRuangVektor(array $tokenPerDokumen): array
    {
        $n = count($tokenPerDokumen);

        $df = [];
        foreach ($tokenPerDokumen as $tokens) {
            foreach (array_unique($tokens) as $t) {
                $df[$t] = ($df[$t] ?? 0) + 1;
            }
        }

        $idf = [];
        foreach ($df as $t => $jumlah) {
            $idf[$t] = log(($n + 1) / ($jumlah + 1)) + 1;
        }

        $vektor = [];
        $indeksTerbalik = []; // kata => [id dokumen => bobot]
        foreach ($tokenPerDokumen as $i => $tokens) {
            $vektor[$i] = $this->vektorTfIdf($tokens, $idf, $n);
            foreach ($vektor[$i] as $t => $bobot) {
                $indeksTerbalik[$t][$i] = $bobot;
            }
        }

        return [
            'n'       => $n,
            'idf'     => $idf,
            'terbalik' => $indeksTerbalik,
        ];
    }

    /**
     * Ubah token menjadi vektor TF-IDF ternormalisasi L2.
     * Kata yang tidak ada di korpus diberi IDF maksimum (kata langka).
     */
    protected function vektorTfIdf(array $tokens, array $idf, int $n): array
    {
        if (empty($tokens)) {
            return [];
        }

        $idfLangka = log(($n + 1) / 1) + 1;
        $vektor = [];
        foreach (array_count_values($tokens) as $t => $frek) {
            $vektor[$t] = (1 + log($frek)) * ($idf[$t] ?? $idfLangka);
        }

        $norma = sqrt(array_sum(array_map(fn ($w) => $w * $w, $vektor)));
        if ($norma == 0.0) {
            return [];
        }

        foreach ($vektor as $t => $w) {
            $vektor[$t] = $w / $norma;
        }
        return $vektor;
    }

    /**
     * Cosine similarity kueri terhadap seluruh dokumen lewat indeks terbalik.
     * Hanya dokumen yang berbagi minimal satu kata yang dihitung (efisien untuk ribuan arsip).
     *
     * @return array [id dokumen => skor 0..1]
     */
    protected function skorCosine(string $teks, array $ruang): array
    {
        $kueri = $this->vektorTfIdf($this->tokenize($teks), $ruang['idf'], $ruang['n']);

        $skor = [];
        foreach ($kueri as $t => $bobotKueri) {
            foreach ($ruang['terbalik'][$t] ?? [] as $i => $bobotDok) {
                $skor[$i] = ($skor[$i] ?? 0.0) + $bobotKueri * $bobotDok;
            }
        }
        return $skor;
    }

    // =========================================================
    // 3. PEMERIKSAAN KEMIRIPAN (MR-09)
    // =========================================================

    /**
     * Periksa kemiripan judul & abstrak pengajuan baru.
     * Skor akhir tiap pembanding = maks(skor judul vs judul, skor judul+abstrak vs judul+abstrak),
     * sehingga judul yang sama persis maupun isi yang sama dengan judul berbeda tetap terdeteksi.
     *
     * @param array      $pengajuanBaru ['judul', 'abstrak', 'mahasiswa_id', 'id'?]
     * @param array      $indeks        Hasil bangunIndeks()
     * @param float|null $ambang        Ambang dari pengaturan periode, default 0,8
     * @return array [
     *   'lolos' => bool, 'status' => 'lolos'|'ditolak',
     *   'skor_tertinggi' => float, 'skor_persen' => float, 'ambang' => float,
     *   'pesan' => string, 'pembanding' => array|null,
     *   'catatan_hasil' => array  // untuk disimpan ke tabel hasil_kemiripan
     * ]
     */
    public function periksa(array $pengajuanBaru, array $indeks, ?float $ambang = null): array
    {
        $ambang = $ambang === null ? self::AMBANG_DEFAULT : $this->validasiAmbang($ambang);

        $judul = trim((string) ($pengajuanBaru['judul'] ?? ''));
        $abstrak = trim((string) ($pengajuanBaru['abstrak'] ?? ''));
        if ($judul === '') {
            throw new InvalidArgumentException('Judul pengajuan wajib diisi sebelum pemeriksaan kemiripan.');
        }

        $skorJudul = $this->skorCosine($judul, $indeks['judul']);
        $skorGabungan = $this->skorCosine($judul . ' ' . $abstrak, $indeks['gabungan']);

        $mhsId = $pengajuanBaru['mahasiswa_id'] ?? null;
        $idPengajuan = $pengajuanBaru['id'] ?? null;

        $hasil = [];
        foreach (array_keys($skorJudul + $skorGabungan) as $i) {
            $dok = $indeks['dokumen'][$i];

            if ($dok['sumber'] === self::SUMBER_PENGAJUAN) {
                // Pengajuan milik mahasiswa yang sama (P1 & P2 memakai judul yang sama) tidak dihitung
                if ($mhsId !== null && (int) $dok['mahasiswa_id'] === (int) $mhsId) {
                    continue;
                }
                // Pengajuan itu sendiri (mis. saat diperiksa ulang) tidak dihitung
                if ($idPengajuan !== null && (int) $dok['ref_id'] === (int) $idPengajuan) {
                    continue;
                }
            }

            $skor = max($skorJudul[$i] ?? 0.0, $skorGabungan[$i] ?? 0.0);
            $hasil[] = ['i' => $i, 'skor' => min(1.0, round($skor, 4))];
        }

        usort($hasil, fn ($a, $b) => $b['skor'] <=> $a['skor']);

        $catatan = [];
        foreach (array_slice($hasil, 0, self::JUMLAH_CATATAN) as $h) {
            $dok = $indeks['dokumen'][$h['i']];
            $catatan[] = [
                'sumber'       => $dok['sumber'],
                'arsip_id'     => $dok['sumber'] === self::SUMBER_ARSIP ? $dok['ref_id'] : null,
                'pengajuan_id' => $dok['sumber'] === self::SUMBER_PENGAJUAN ? $dok['ref_id'] : null,
                'skor'         => $h['skor'],
                'hasil'        => $h['skor'] >= $ambang ? 'ditolak' : 'lolos',
            ];
        }

        $teratas = $hasil[0] ?? null;
        $skorTertinggi = $teratas['skor'] ?? 0.0;
        $skorPersen = round($skorTertinggi * 100, 1);

        if ($teratas === null || $skorTertinggi < $ambang) {
            return [
                'lolos'          => true,
                'status'         => 'lolos',
                'skor_tertinggi' => $skorTertinggi,
                'skor_persen'    => $skorPersen,
                'ambang'         => $ambang,
                'pesan'          => 'Judul lolos pemeriksaan kemiripan.',
                'pembanding'     => null,
                'catatan_hasil'  => $catatan,
            ];
        }

        $pembanding = $this->pembandingAman($indeks['dokumen'][$teratas['i']], $skorPersen);

        return [
            'lolos'          => false,
            'status'         => 'ditolak',
            'skor_tertinggi' => $skorTertinggi,
            'skor_persen'    => $skorPersen,
            'ambang'         => $ambang,
            'pesan'          => $this->pesanPeringatan($pembanding),
            'pembanding'     => $pembanding,
            'catatan_hasil'  => $catatan,
        ];
    }

    /**
     * Pintasan: bangun indeks lalu periksa dalam satu panggilan (cocok untuk data kecil/pengujian).
     */
    public function periksaLangsung(
        array $pengajuanBaru,
        array $pengajuanAktif,
        array $arsip,
        ?float $ambang = null
    ): array {
        return $this->periksa($pengajuanBaru, $this->bangunIndeks($pengajuanAktif, $arsip), $ambang);
    }

    /**
     * Data pembanding yang boleh ditampilkan ke mahasiswa (UU PDP / SRS MR-09):
     * - Arsip: hanya judul dan tahun
     * - Pengajuan aktif: tanpa nama, NIM, maupun judul mahasiswa lain
     */
    protected function pembandingAman(array $dok, float $skorPersen): array
    {
        if ($dok['sumber'] === self::SUMBER_ARSIP) {
            return [
                'sumber' => self::SUMBER_ARSIP,
                'judul'  => $dok['judul'],
                'tahun'  => $dok['tahun'] ?? 'Terdahulu',
                'skor'   => $skorPersen . '%',
            ];
        }

        return [
            'sumber' => self::SUMBER_PENGAJUAN,
            'judul'  => null,
            'tahun'  => null,
            'skor'   => $skorPersen . '%',
        ];
    }

    protected function pesanPeringatan(array $pembanding): string
    {
        if ($pembanding['sumber'] === self::SUMBER_ARSIP) {
            return "Judul/abstrak Anda mirip {$pembanding['skor']} dengan judul TA tahun {$pembanding['tahun']}: "
                 . "\"{$pembanding['judul']}\". Pengajuan ditolak, silakan ganti judul atau ubah fokus penelitian Anda.";
        }

        return "Judul/abstrak Anda mirip {$pembanding['skor']} dengan pengajuan mahasiswa lain yang sedang aktif. "
             . 'Pengajuan ditolak, silakan ganti judul atau ubah fokus penelitian Anda.';
    }

    // =========================================================
    // 4. IMPOR ARSIP JUDUL TA (CSV oleh koordinator)
    // =========================================================

    /**
     * Parse & validasi CSV arsip judul TA dari kampus/perpustakaan.
     * Kolom wajib: judul, tahun. Kolom opsional: abstrak, sumber.
     * Baris dengan judul ganda (setelah dinormalisasi) hanya disimpan sekali.
     *
     * @param string $isiCsv Isi berkas CSV (pemisah koma atau titik koma)
     * @return array ['valid' => [['judul','abstrak','tahun','sumber'], ...], 'galat' => [['baris' => n, 'pesan' => ...], ...]]
     */
    public function imporArsipCsv(string $isiCsv): array
    {
        $isiCsv = preg_replace('/^\xEF\xBB\xBF/', '', $isiCsv); // buang BOM Excel
        $baris = preg_split('/\r\n|\n|\r/', trim($isiCsv));

        if (empty($baris) || trim($baris[0]) === '') {
            throw new InvalidArgumentException('Berkas CSV kosong.');
        }

        $pemisah = substr_count($baris[0], ';') > substr_count($baris[0], ',') ? ';' : ',';
        $header = array_map(fn ($h) => mb_strtolower(trim($h)), str_getcsv($baris[0], $pemisah, '"', '\\'));

        $kolomJudul = array_search('judul', $header, true);
        $kolomTahun = array_search('tahun', $header, true);
        if ($kolomJudul === false || $kolomTahun === false) {
            throw new InvalidArgumentException('Header CSV wajib memuat kolom "judul" dan "tahun".');
        }
        $kolomAbstrak = array_search('abstrak', $header, true);
        $kolomSumber = array_search('sumber', $header, true);

        $tahunSekarang = (int) date('Y');
        $valid = [];
        $galat = [];
        $sudahAda = [];

        for ($n = 1; $n < count($baris); $n++) {
            if (trim($baris[$n]) === '') {
                continue;
            }
            $kolom = str_getcsv($baris[$n], $pemisah, '"', '\\');
            $nomorBaris = $n + 1;

            $judul = trim($kolom[$kolomJudul] ?? '');
            $tahun = trim($kolom[$kolomTahun] ?? '');

            if ($judul === '') {
                $galat[] = ['baris' => $nomorBaris, 'pesan' => 'Judul kosong.'];
                continue;
            }
            if (mb_strlen($judul) > 200) {
                $galat[] = ['baris' => $nomorBaris, 'pesan' => 'Judul melebihi 200 karakter.'];
                continue;
            }
            if (!preg_match('/^\d{4}$/', $tahun) || (int) $tahun < 1990 || (int) $tahun > $tahunSekarang) {
                $galat[] = ['baris' => $nomorBaris, 'pesan' => "Tahun \"{$tahun}\" tidak valid (1990-{$tahunSekarang})."];
                continue;
            }

            $kunci = implode(' ', $this->tokenize($judul)) ?: mb_strtolower($judul);
            if (isset($sudahAda[$kunci])) {
                $galat[] = ['baris' => $nomorBaris, 'pesan' => 'Judul duplikat dengan baris ' . $sudahAda[$kunci] . ', dilewati.'];
                continue;
            }
            $sudahAda[$kunci] = $nomorBaris;

            $valid[] = [
                'judul'   => $judul,
                'abstrak' => $kolomAbstrak !== false ? trim($kolom[$kolomAbstrak] ?? '') : '',
                'tahun'   => (int) $tahun,
                'sumber'  => $kolomSumber !== false && trim($kolom[$kolomSumber] ?? '') !== ''
                    ? trim($kolom[$kolomSumber])
                    : 'Perpustakaan',
            ];
        }

        return ['valid' => $valid, 'galat' => $galat];
    }
}
