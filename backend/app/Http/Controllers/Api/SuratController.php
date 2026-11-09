<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pengajuan;
use App\Services\AutentikasiService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * MR-07: unduh surat penetapan PDF. Hanya mahasiswa pemilik, dosen pembimbing, atau koordinator (MR-08).
 */
class SuratController extends Controller
{
    public function unduh(Request $request, Pengajuan $pengajuan, AutentikasiService $auth)
    {
        $auth->pastikanBolehLihatPengajuan($request->user()->sesi(), $pengajuan->toArray());

        $surat = $pengajuan->surat;
        abort_if($surat === null || !Storage::disk('local')->exists($surat->berkas_pdf), 404, 'Surat penetapan belum diterbitkan.');

        return Storage::disk('local')->download($surat->berkas_pdf, basename($surat->berkas_pdf), ['Content-Type' => 'application/pdf']);
    }
}
