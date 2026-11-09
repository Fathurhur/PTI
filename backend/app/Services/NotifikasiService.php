<?php

namespace App\Services;

use App\Jobs\KirimEmailNotifikasi;
use App\Models\Notifikasi;
use App\Models\User;

/**
 * Pengiriman notifikasi in-app + email (SRS MR-05).
 * Isi pesan disusun oleh AntreanService::buatNotifikasi agar format konsisten.
 */
class NotifikasiService
{
    public function __construct(protected AntreanService $antrean)
    {
    }

    /**
     * @param User   $penerima
     * @param string $jenis  pengajuan_baru | pengajuan_diterima | pengajuan_ditolak | promosi_antrean | slot_tambahan | lainnya
     * @param array  $data   Data konteks; boleh berisi 'judul' dan 'pesan' untuk jenis di luar daftar
     */
    public function kirim(User $penerima, string $jenis, array $data = []): Notifikasi
    {
        $payload = $this->antrean->buatNotifikasi($jenis, $penerima->nama, $data);

        if (!empty($data['judul_notifikasi'])) {
            $payload['judul'] = $data['judul_notifikasi'];
        }

        $notif = Notifikasi::create([
            'user_id' => $penerima->id,
            'jenis'   => $jenis,
            'judul'   => $payload['judul'],
            'isi'     => $payload['pesan'],
        ]);

        KirimEmailNotifikasi::dispatch($penerima->email, $penerima->nama, $payload['judul'], $payload['pesan'])
            ->afterCommit();

        return $notif;
    }

    /** Pintasan untuk notifikasi bebas (pemindahan, penetapan, kedaluwarsa, dll.) */
    public function kirimPesan(User $penerima, string $jenis, string $judul, string $pesan): Notifikasi
    {
        return $this->kirim($penerima, $jenis, ['judul_notifikasi' => $judul, 'pesan' => $pesan]);
    }
}
