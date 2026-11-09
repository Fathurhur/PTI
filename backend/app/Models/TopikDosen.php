<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TopikDosen extends Model
{
    protected $table = 'topik_dosen';
    protected $guarded = ['id'];
    public $timestamps = true;

    protected $casts = ['aktif' => 'boolean'];

    public function dosen() { return $this->belongsTo(Dosen::class); }
}
