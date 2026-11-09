<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Dosen extends Model
{
    protected $table = 'dosen';
    protected $guarded = ['id'];
    public $timestamps = false;

    protected $casts = ['bidang_keahlian' => 'array', 'kata_kunci' => 'array', 'menerima_bimbingan' => 'boolean'];

    public function user() { return $this->belongsTo(User::class); }
    public function peminatan() { return $this->belongsTo(Peminatan::class); }
    public function saranJudul() { return $this->hasMany(SaranJudul::class); }
    public function kuota() { return $this->hasMany(KuotaDosen::class); }
}
