<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Notifikasi extends Model
{
    protected $table = 'notifikasi';
    protected $guarded = ['id'];
    public $timestamps = false;

    protected $casts = ['dibaca' => 'boolean', 'dibuat_at' => 'datetime'];
}
