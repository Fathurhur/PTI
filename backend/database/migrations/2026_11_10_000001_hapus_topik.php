<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Menghapus fitur topik: tabel topik_dosen, kolom pengajuan.topik_id dan pengajuan.asal_topik,
 * serta mengganti nama arsip_topik menjadi arsip_judul. Aman dijalankan pada database lama
 * maupun baru (instalasi baru sudah tidak memiliki objek-objek tersebut).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('pengajuan', 'topik_id')) {
            Schema::table('pengajuan', function (Blueprint $table) {
                $table->dropForeign(['topik_id']);
                $table->dropColumn('topik_id');
            });
        }
        if (Schema::hasColumn('pengajuan', 'asal_topik')) {
            Schema::table('pengajuan', fn (Blueprint $table) => $table->dropColumn('asal_topik'));
        }
        Schema::dropIfExists('topik_dosen');

        if (Schema::hasTable('arsip_topik') && !Schema::hasTable('arsip_judul')) {
            Schema::rename('arsip_topik', 'arsip_judul');
        }
    }

    public function down(): void
    {
        // Tidak dapat dikembalikan: fitur topik sudah dihapus dari aplikasi.
    }
};
