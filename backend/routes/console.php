<?php

use App\Services\PengajuanService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

/*
| MR-03 / MR-05: pengajuan tanpa keputusan 7 x 24 jam menjadi Kedaluwarsa, slot dilepas,
| dan antrean berikutnya dipromosikan. Dijalankan setiap menit (promosi <= 1 menit).
| Jalankan scheduler lokal dengan: php artisan schedule:work
*/
Artisan::command('pengajuan:kedaluwarsa', function (PengajuanService $service) {
    $jumlah = $service->prosesKedaluwarsa();
    $this->info("{$jumlah} pengajuan dikedaluwarsakan.");
})->purpose('Kedaluwarsakan pengajuan yang lewat 7 x 24 jam dan promosikan antrean');

Schedule::command('pengajuan:kedaluwarsa')->everyMinute()->withoutOverlapping();
