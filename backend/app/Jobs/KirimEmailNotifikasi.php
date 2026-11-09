<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Mail;

/**
 * MR-05: email notifikasi dikirim lewat queue dan dicoba ulang maksimal 3 kali bila gagal.
 */
class KirimEmailNotifikasi implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** Maksimal 3 kali percobaan (SRS MR-05) */
    public int $tries = 3;

    /** Jeda antar percobaan (detik) */
    public array $backoff = [30, 60];

    public function __construct(
        public string $email,
        public string $nama,
        public string $judul,
        public string $isi,
    ) {
    }

    public function handle(): void
    {
        Mail::raw("Yth. {$this->nama},\n\n{$this->isi}\n\nSistem Informasi Ketersediaan Dosen Pembimbing TA", function ($pesan) {
            $pesan->to($this->email, $this->nama)->subject('[Pembimbing TA] ' . $this->judul);
        });
    }
}
