<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Mahasiswa extends Model
{
    protected $table = 'mahasiswa';
    protected $guarded = ['id'];
    public $timestamps = false;

    public function user() { return $this->belongsTo(User::class); }
    public function pengajuan() { return $this->hasMany(Pengajuan::class); }
}
