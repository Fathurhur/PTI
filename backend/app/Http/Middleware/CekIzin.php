<?php

namespace App\Http\Middleware;

use App\Services\AutentikasiService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * MR-08: pembatasan akses di sisi server berdasarkan matriks HAK_AKSES di AutentikasiService.
 * Pemakaian di route: ->middleware('izin:pengajuan.buat')
 * - Belum login / sesi habis (120 menit tidak aktif) => 401
 * - Login tetapi peran tidak berhak => 403
 */
class CekIzin
{
    public function __construct(protected AutentikasiService $auth)
    {
    }

    public function handle(Request $request, Closure $next, string ...$izin): Response
    {
        $user = $request->user();

        if ($user === null) {
            return response()->json(['pesan' => 'Silakan login terlebih dahulu atau sesi Anda telah berakhir.'], 401);
        }

        if (!$user->aktif) {
            Auth::guard('web')->logout();
            return response()->json(['pesan' => 'Akun Anda tidak aktif. Hubungi Koordinator TA.'], 403);
        }

        foreach ($izin as $i) {
            if ($this->auth->punyaIzin($user->role, $i)) {
                return $next($request);
            }
        }

        return response()->json(['pesan' => 'Anda tidak memiliki hak akses untuk fitur ini.'], AutentikasiService::HTTP_FORBIDDEN);
    }
}
