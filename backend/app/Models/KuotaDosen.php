<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class KuotaDosen extends Model
{
    protected $table = 'kuota_dosen';
    protected $guarded = ['id'];
    public $timestamps = false;

    public function dosen() { return $this->belongsTo(Dosen::class); }

    public function kapasitas(): int { return (int) $this->kuota + (int) $this->kuota_tambahan; }
    public function sisa(): int { return max(0, $this->kapasitas() - (int) $this->terisi); }
}
