<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LogAktivitas extends Model
{
    protected $table = 'log_aktivitas';
    protected $guarded = ['id'];
    public $timestamps = false;

    protected $casts = ['data' => 'array'];

    public static function catat(string $aksi, array $data = []): void
    {
        static::create(['user_id' => auth()->id(), 'aksi' => $aksi, 'data' => $data]);
    }
}
