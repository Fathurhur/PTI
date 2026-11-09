<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AutentikasiService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * MR-08: login dengan Email/NIM/NIDN + kata sandi (bcrypt), sesi 120 menit, logout.
 */
class AuthController extends Controller
{
    public function __construct(protected AutentikasiService $auth)
    {
    }

    public function login(Request $request)
    {
        $data = $request->validate([
            'identitas'  => ['required', 'string', 'max:150'],
            'kata_sandi' => ['required', 'string', 'max:72'],
        ]);

        $identitas = trim($data['identitas']);

        $user = User::with(['mahasiswa', 'dosen'])
            ->where('email', $identitas)
            ->orWhereHas('mahasiswa', fn ($q) => $q->where('nim', $identitas))
            ->orWhereHas('dosen', fn ($q) => $q->where('nidn', $identitas))
            ->first();

        // Data dalam bentuk yang dipakai AutentikasiService::login (pesan gagal seragam, anti enumerasi)
        $daftar = $user ? [[
            'id'           => $user->id,
            'nama'         => $user->nama,
            'email'        => $user->email,
            'password'     => $user->getAuthPassword(),
            'role'         => $user->role,
            'aktif'        => $user->aktif,
            'nim'          => $user->mahasiswa?->nim,
            'nidn'         => $user->dosen?->nidn,
            'mahasiswa_id' => $user->mahasiswa?->id,
            'dosen_id'     => $user->dosen?->id,
        ]] : [];

        $hasil = $this->auth->login($identitas, $data['kata_sandi'], $daftar);

        if (!$hasil['berhasil']) {
            return response()->json(['pesan' => $hasil['pesan']], $hasil['status_http']);
        }

        Auth::login($user);
        $request->session()->regenerate(); // cegah session fixation (OWASP ASVS V3.2.1)

        return response()->json([
            'pesan' => 'Login berhasil.',
            'user'  => $this->profil($user),
        ]);
    }

    public function logout(Request $request)
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['pesan' => 'Anda telah keluar.']);
    }

    public function saya(Request $request)
    {
        return response()->json(['user' => $this->profil($request->user())]);
    }

    protected function profil(User $user): array
    {
        $user->loadMissing(['mahasiswa', 'dosen']);

        return [
            'id'           => $user->id,
            'nama'         => $user->nama,
            'email'        => $user->email,
            'peran'        => $user->role,
            'nim'          => $user->mahasiswa?->nim,
            'nidn'         => $user->dosen?->nidn,
            'mahasiswa_id' => $user->mahasiswa?->id,
            'dosen_id'     => $user->dosen?->id,
            'menu'         => $this->auth->menuSesuaiPeran($user->role),
            'batas_sesi_menit' => AutentikasiService::BATAS_SESI_MENIT,
        ];
    }
}
