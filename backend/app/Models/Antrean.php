<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Antrean extends Model
{
    protected $table = 'antrean';
    protected $guarded = ['id'];
    public $timestamps = true;

    public function mahasiswa() { return $this->belongsTo(Mahasiswa::class); }
    public function dosen() { return $this->belongsTo(Dosen::class); }
}
