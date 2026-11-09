<?php

namespace App\Services;

/**
 * Service Pembuatan Nomor Surat Penetapan dan Ekspor CSV sesuai SRS (MR-07)
 * Format nomor: SP-TA/<periode>/<urut> (contoh: SP-TA/2026-1/001)
 */
class SuratPenetapanService
{
    /**
     * Menghasilkan nomor surat penetapan unik berformat SP-TA/<periode>/<urut>
     */
    public function generateNomorSurat(string $periodeKode, int $nomorUrut): string
    {
        $urutFormat = str_pad($nomorUrut, 3, '0', STR_PAD_LEFT);
        return "SP-TA/{$periodeKode}/{$urutFormat}";
    }

    /**
     * Membuat string CSV untuk Rekap Beban Bimbingan Dosen
     * 
     * @param array $daftarDosen
     * @return string Konten CSV
     */
    public function exportRekapBebanCsv(array $daftarDosen): string
    {
        $output = fopen('php://temp', 'r+');

        // Header CSV
        fputcsv($output, [
            'NIDN',
            'Nama Dosen',
            'Peminatan Utama',
            'Kuota P1',
            'Terisi P1',
            'Sisa P1',
            'Kuota P2',
            'Terisi P2',
            'Sisa P2',
            'Total Bimbingan',
            'Status Menerima'
        ]);

        // Isi baris data
        foreach ($daftarDosen as $d) {
            $sisaP1 = max(0, ($d['kuota_p1'] ?? 6) - ($d['terisi_p1'] ?? 0));
            $sisaP2 = max(0, ($d['kuota_p2'] ?? 6) - ($d['terisi_p2'] ?? 0));
            $total = ($d['terisi_p1'] ?? 0) + ($d['terisi_p2'] ?? 0);

            fputcsv($output, [
                $d['nidn'] ?? '-',
                $d['nama'] ?? '-',
                $d['peminatan_utama'] ?? '-',
                $d['kuota_p1'] ?? 6,
                $d['terisi_p1'] ?? 0,
                $sisaP1,
                $d['kuota_p2'] ?? 6,
                $d['terisi_p2'] ?? 0,
                $sisaP2,
                $total,
                ($d['menerima'] ?? true) ? 'Menerima' : 'Tidak Menerima'
            ]);
        }

        rewind($output);
        $csvContent = stream_get_contents($output);
        fclose($output);

        return $csvContent;
    }
}

