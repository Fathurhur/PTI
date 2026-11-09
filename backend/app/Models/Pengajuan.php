<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Pengajuan extends Model
{
    protected $table = 'pengajuan';
    protected $guarded = ['id'];
    public $timestamps = true;

    public const STATUS_AKTIF = ['Menunggu', 'Antrean', 'Diterima', 'Ditetapkan'];
    /** Status yang memakai slot dosen (MR-04: Menunggu + Diterima + Ditetapkan) */
    public const STATUS_SLOT = ['Menunggu', 'Diterima', 'Ditetapkan'];

    protected $casts = ['kedaluwarsa_at' => 'datetime', 'diputuskan_at' => 'datetime'];

    public function mahasiswa() { return $this->belongsTo(Mahasiswa::class); }
    public function dosen() { return $this->belongsTo(Dosen::class); }
    public function peminatan() { return $this->belongsTo(Peminatan::class); }
    public function periode() { return $this->belongsTo(Periode::class); }
    public function saranJudul() { return $this->belongsTo(SaranJudul::class, 'saran_judul_id'); }
    public function surat() { return $this->hasOne(SuratPenetapan::class); }
}
