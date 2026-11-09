// data.js
// Data dosen, periode, pengajuan, dan arsip sekarang diambil dari backend Laravel (lihat js/app.js -> Api, DB).
// File ini hanya berisi daftar pilihan dan teks contoh yang dipakai antarmuka.

// daftar bidang keahlian (dipanggil pake index). Bidang baru dari database otomatis ditambahkan ke daftar ini.
var BIDANG = ['Internet of Things (IoT)', 'Embedded System & Otomasi', 'Kecerdasan Buatan & Machine Learning', 'Computer Vision', 'Data Science & Statistik', 'Jaringan & Keamanan Siber', 'Tata Kelola TI & Manajemen Proyek'];

// peminatan sesuai SRS MR-10
var DAFTAR_PEMINATAN = ['IoT', 'AI', 'Cyber'];

// diisi dari GET /api/dashboard
var DOSEN = [];
var PERIODE = { nama: '-', kode: '-', mulai: '', selesai: '', buka: false };

// teks contoh buat tombol "Isi contoh" di form rekomendasi
var CONTOH = {
  topik: 'Analisis sentimen',
  judul: 'Analisis Sentimen Ulasan Aplikasi Mobile dengan Deep Learning',
  abstrak: 'Penelitian ini membangun model machine learning untuk klasifikasi sentimen ulasan pengguna aplikasi mobile berbahasa Indonesia. Data ulasan dikumpulkan dari toko aplikasi lalu melalui tahap text mining seperti pembersihan teks, tokenisasi, dan pembobotan. Model deep learning berbasis transformer dibandingkan dengan metode klasik untuk menilai akurasi, presisi, dan recall. Hasil penelitian diharapkan membantu pengembang memahami keluhan pengguna secara otomatis dan cepat melalui dashboard visualisasi sehingga keputusan perbaikan aplikasi dapat dilakukan lebih tepat sasaran. Pengujian dilakukan dengan data latih dan data uji terpisah serta validasi silang untuk memastikan model tidak mengalami overfitting pada kumpulan data tertentu. Selain itu penelitian ini juga menganalisis kata kunci yang paling sering muncul pada ulasan negatif dan positif, memetakan aspek layanan yang paling banyak dikeluhkan, serta menyusun rekomendasi prioritas perbaikan bagi tim pengembang berdasarkan frekuensi dan tingkat sentimen setiap aspek yang ditemukan. Hasil akhir penelitian berupa purwarupa layanan analisis sentimen yang dapat dipanggil aplikasi lain melalui antarmuka pemrograman sehingga mudah diintegrasikan ke sistem pemantauan ulasan milik pengembang.'
};
