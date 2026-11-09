<?php

use Illuminate\Support\Facades\Route;

/*
| Frontend (HTML + Bootstrap + JS di folder induk PTI-main) disajikan lewat Laravel
| agar halaman dan API berada di origin yang sama (cookie sesi + CSRF, MR-08).
| Buka: http://127.0.0.1:8000/login.html
*/

Route::get('/', fn () => redirect('/login.html'));

Route::get('/{berkas}', function (string $berkas) {
    $tipe = [
        'html' => 'text/html; charset=UTF-8',
        'js'   => 'application/javascript; charset=UTF-8',
        'css'  => 'text/css; charset=UTF-8',
        'png'  => 'image/png',
        'jpg'  => 'image/jpeg',
        'svg'  => 'image/svg+xml',
        'ico'  => 'image/x-icon',
    ];

    $akar = realpath(config('app.frontend_path'));
    $ekstensi = strtolower(pathinfo($berkas, PATHINFO_EXTENSION));
    $jalur = $akar ? realpath($akar . DIRECTORY_SEPARATOR . $berkas) : false;

    // Hanya berkas statis di dalam folder frontend, bukan folder backend (cegah path traversal)
    $backend = realpath(base_path());
    abort_if(
        !$jalur
            || !isset($tipe[$ekstensi])
            || !str_starts_with($jalur, $akar . DIRECTORY_SEPARATOR)
            || str_starts_with($jalur, $backend . DIRECTORY_SEPARATOR)
            || !is_file($jalur),
        404
    );

    return response()->file($jalur, [
        'Content-Type'  => $tipe[$ekstensi],
        'Cache-Control' => 'no-cache',
    ]);
})->where('berkas', '(?!api/).+');
