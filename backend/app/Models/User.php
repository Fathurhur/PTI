<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    use Notifiable;

    protected $fillable = ['nama', 'email', 'password', 'role', 'aktif'];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password'          => 'hashed', // bcrypt (MR-08)
            'aktif'             => 'boolean',
        ];
    }

    public function mahasiswa() { return $this->hasOne(Mahasiswa::class); }
    public function dosen() { return $this->hasOne(Dosen::class); }
    public function notifikasi() { return $this->hasMany(Notifikasi::class); }

    /**
     * Data sesi dalam bentuk yang dipakai AutentikasiService (peran + id mahasiswa/dosen).
     */
    public function sesi(): array
    {
        return [
            'token'          => session()->getId(),
            'user_id'        => $this->id,
            'peran'          => $this->role,
            'mahasiswa_id'   => $this->mahasiswa?->id,
            'dosen_id'       => $this->dosen?->id,
            'terakhir_aktif' => time(),
        ];
    }
}
