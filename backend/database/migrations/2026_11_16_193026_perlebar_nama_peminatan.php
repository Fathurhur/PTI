<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('peminatan', function (Blueprint $table) {
            $table->string('nama', 50)->change();
        });
    }

    public function down(): void
    {
        Schema::table('peminatan', function (Blueprint $table) {
            $table->string('nama', 20)->change();
        });
    }
};
