<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Saran judul per dosen. Satu saran hanya boleh dipakai satu mahasiswa
 * (pengajuan.saran_judul_id menandai saran yang sedang dipakai).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('saran_judul', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dosen_id')->constrained('dosen')->cascadeOnDelete();
            $table->string('judul', 200);
            $table->string('deskripsi', 1000)->nullable();
            $table->boolean('aktif')->default(true);
            $table->timestamps();
        });

        Schema::table('pengajuan', function (Blueprint $table) {
            $table->foreignId('saran_judul_id')->nullable()->constrained('saran_judul')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('pengajuan', function (Blueprint $table) {
            $table->dropForeign(['saran_judul_id']);
            $table->dropColumn('saran_judul_id');
        });
        Schema::dropIfExists('saran_judul');
    }
};
