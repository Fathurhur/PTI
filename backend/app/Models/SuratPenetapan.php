<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SuratPenetapan extends Model
{
    protected $table = 'surat_penetapan';
    protected $guarded = ['id'];
    public $timestamps = false;

    protected $casts = ['tgl_terbit' => 'datetime'];

    public function pengajuan() { return $this->belongsTo(Pengajuan::class); }
}
