<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SaranJudul extends Model
{
    protected $table = 'saran_judul';
    protected $guarded = ['id'];
    protected $casts = ['aktif' => 'boolean'];

    public function dosen() { return $this->belongsTo(Dosen::class); }

    /** ID saran judul yang sedang dipakai pengajuan aktif (tidak bisa dipakai mahasiswa lain). */
    public static function idTerpakai(): array
    {
        return Pengajuan::whereIn('status', Pengajuan::STATUS_AKTIF)
            ->whereNotNull('saran_judul_id')->pluck('saran_judul_id')->all();
    }
}
