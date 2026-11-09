<?php

use App\Http\Middleware\CekIzin;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        then: function () {
            // API memakai grup "web" agar autentikasi berbasis sesi + CSRF (MR-08)
            Route::middleware('web')->prefix('api')->group(base_path('routes/api.php'));
        },
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->alias(['izin' => CekIzin::class]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*') || $request->expectsJson());

        // Pelanggaran aturan bisnis dari service => 422 dengan pesan yang bisa ditampilkan
        $exceptions->render(function (InvalidArgumentException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json(['pesan' => $e->getMessage()], 422);
            }
        });

        // AutentikasiService::pastikan...() melempar RuntimeException kode 403
        $exceptions->render(function (RuntimeException $e, Request $request) {
            if ($request->is('api/*') && $e->getCode() === 403) {
                return response()->json(['pesan' => $e->getMessage()], 403);
            }
        });
    })->create();
