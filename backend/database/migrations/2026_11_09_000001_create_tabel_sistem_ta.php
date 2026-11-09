<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tabel inti sesuai ERD SRS (Gambar 8). Tabel `users` ada di migration bawaan Laravel.
 * Tambahan di luar ERD: `log_aktivitas` untuk mencatat slot tambahan, pemindahan,
 * dan perubahan kuota oleh koordinator (MR-07 "tercatat di log").
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('peminatan', function (Blueprint $table) {
            $table->id();
            $table->string('nama', 20)->unique(); // IoT, AI, Cyber
        });

        Schema::create('mahasiswa', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->string('nim', 20)->unique();
            $table->unsignedSmallInteger('angkatan');
        });

        // MR-02: profil dosen
        Schema::create('dosen', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->foreignId('peminatan_id')->constrained('peminatan'); // peminatan utama
            $table->string('nidn', 20)->unique();
            $table->json('bidang_keahlian');  // minimal 1
            $table->json('kata_kunci');       // maksimal 10
            $table->boolean('menerima_bimbingan')->default(true);
        });

        // MR-07: periode, kuota otomatis, ambang kemiripan (MR-09)
        Schema::create('periode', function (Blueprint $table) {
            $table->id();
            $table->string('nama', 50);
            $table->string('kode', 20)->unique(); // dipakai di nomor surat SP-TA/<kode>/<urut>
            $table->date('tgl_mulai');
            $table->date('tgl_selesai');
            $table->unsignedInteger('jumlah_mhs_proposal')->default(0);
            $table->unsignedTinyInteger('kuota_default')->default(6);
            $table->decimal('ambang_kemiripan', 3, 2)->default(0.80);
            $table->enum('status', ['aktif', 'ditutup'])->default('aktif');
            $table->timestamps();
        });

        // MR-04 & MR-07: kuota per dosen per peran
        Schema::create('kuota_dosen', function (Blueprint $table) {
            $table->id();
            $table->foreignId('periode_id')->constrained('periode')->cascadeOnDelete();
            $table->foreignId('dosen_id')->constrained('dosen')->cascadeOnDelete();
            $table->enum('peran', ['1', '2']);
            $table->unsignedTinyInteger('kuota')->default(6);
            $table->unsignedTinyInteger('kuota_tambahan')->default(0);
            $table->string('alasan_tambahan', 500)->nullable();
            $table->unsignedTinyInteger('terisi')->default(0);
            $table->unique(['periode_id', 'dosen_id', 'peran']);
        });

        // MR-03: pengajuan pembimbing
        Schema::create('pengajuan', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mahasiswa_id')->constrained('mahasiswa')->cascadeOnDelete();
            $table->foreignId('peminatan_id')->nullable()->constrained('peminatan'); // null untuk Pembimbing 2
            $table->foreignId('dosen_id')->constrained('dosen');
            $table->foreignId('periode_id')->constrained('periode');
            $table->enum('peran', ['1', '2']);
            $table->string('judul', 200);
            $table->text('abstrak');
            $table->enum('status', ['Menunggu', 'Antrean', 'Diterima', 'Ditolak', 'Kedaluwarsa', 'Ditetapkan'])->default('Menunggu')->index();
            $table->string('alasan_tolak', 500)->nullable();
            $table->dateTime('kedaluwarsa_at')->nullable()->index();
            $table->dateTime('diputuskan_at')->nullable();
            // default di level DB agar INSERT mentah dari PeminatanService::ambilSlotAtomik tetap terisi
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();
            $table->index(['mahasiswa_id', 'periode_id', 'peran']);
        });

        // MR-05: antrean FIFO per dosen per peran
        Schema::create('antrean', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mahasiswa_id')->constrained('mahasiswa')->cascadeOnDelete();
            $table->foreignId('dosen_id')->constrained('dosen');
            $table->foreignId('periode_id')->constrained('periode');
            $table->foreignId('peminatan_id')->nullable()->constrained('peminatan');
            $table->enum('peran', ['1', '2']);
            $table->string('judul', 200);
            $table->text('abstrak');
            $table->enum('status', ['menunggu', 'dipromosikan', 'batal'])->default('menunggu');
            $table->foreignId('pengajuan_id')->nullable()->constrained('pengajuan')->nullOnDelete();
            $table->timestamps();
            $table->index(['dosen_id', 'peran', 'status', 'created_at']);
        });

        // MR-05: notifikasi in-app (email dikirim lewat queue)
        Schema::create('notifikasi', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('jenis', 40);
            $table->string('judul', 150);
            $table->text('isi');
            $table->boolean('dibaca')->default(false);
            $table->timestamp('dibuat_at')->useCurrent();
            $table->index(['user_id', 'dibaca']);
        });

        // MR-09: arsip judul TA angkatan sebelumnya (impor CSV)
        Schema::create('arsip_judul', function (Blueprint $table) {
            $table->id();
            $table->string('judul', 200);
            $table->text('abstrak')->nullable();
            $table->unsignedSmallInteger('tahun');
            $table->string('sumber', 100)->default('Perpustakaan');
        });

        Schema::create('hasil_kemiripan', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pengajuan_id')->constrained('pengajuan')->cascadeOnDelete();
            $table->foreignId('arsip_id')->nullable()->constrained('arsip_judul')->nullOnDelete();
            $table->foreignId('pembanding_pengajuan_id')->nullable()->constrained('pengajuan')->nullOnDelete();
            $table->decimal('skor', 5, 4);
            $table->enum('hasil', ['lolos', 'ditolak']);
        });

        // MR-07: pemindahan pengajuan oleh koordinator
        Schema::create('riwayat_pemindahan', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pengajuan_id')->constrained('pengajuan')->cascadeOnDelete();
            $table->foreignId('dosen_asal_id')->constrained('dosen');
            $table->foreignId('dosen_tujuan_id')->constrained('dosen');
            $table->foreignId('dipindah_oleh')->constrained('users');
            $table->string('alasan', 500);
            $table->timestamp('dibuat_at')->useCurrent();
        });

        // MR-07: surat penetapan pembimbing
        Schema::create('surat_penetapan', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pengajuan_id')->unique()->constrained('pengajuan')->cascadeOnDelete();
            $table->foreignId('disahkan_oleh')->constrained('users');
            $table->string('nomor_surat', 50)->unique();
            $table->dateTime('tgl_terbit');
            $table->string('berkas_pdf')->nullable();
        });

        Schema::create('log_aktivitas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('aksi', 50);
            $table->json('data')->nullable();
            $table->timestamp('dibuat_at')->useCurrent();
        });
    }

    public function down(): void
    {
        foreach ([
            'log_aktivitas', 'surat_penetapan', 'riwayat_pemindahan', 'hasil_kemiripan', 'arsip_judul',
            'notifikasi', 'antrean', 'pengajuan', 'kuota_dosen', 'periode',
            'dosen', 'mahasiswa', 'peminatan',
        ] as $tabel) {
            Schema::dropIfExists($tabel);
        }
    }
};
