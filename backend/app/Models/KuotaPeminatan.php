<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class KuotaPeminatan extends Model
{
    protected $table = 'kuota_peminatan';
    protected $guarded = ['id'];
    public $timestamps = false;

    public function peminatan() { return $this->belongsTo(Peminatan::class); }
}
