<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Periode extends Model
{
    protected $table = 'periode';
    protected $guarded = ['id'];
    public $timestamps = true;

    protected $casts = ['tgl_mulai' => 'date', 'tgl_selesai' => 'date', 'ambang_kemiripan' => 'float'];

    public static function aktif(): ?self { return static::where('status', 'aktif')->latest('id')->first(); }

    /** MR-07: pengajuan di luar tanggal periode ditolak */
    public function sedangBerjalan(): bool
    {
        $hariIni = now()->startOfDay();
        return $this->status === 'aktif' && $hariIni->betweenIncluded($this->tgl_mulai, $this->tgl_selesai);
    }
}
