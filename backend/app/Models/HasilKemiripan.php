<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HasilKemiripan extends Model
{
    protected $table = 'hasil_kemiripan';
    protected $guarded = ['id'];
    public $timestamps = false;

}
