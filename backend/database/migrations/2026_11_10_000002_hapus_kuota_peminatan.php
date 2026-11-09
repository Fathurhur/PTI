<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/** Menghapus kuota per peminatan (MR-10). Peminatan tetap ada sebagai atribut dosen. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('kuota_peminatan');
    }

    public function down(): void
    {
        // Tidak dapat dikembalikan: fitur kuota peminatan sudah dihapus.
    }
};
