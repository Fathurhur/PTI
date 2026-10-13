// data.js
// data dummy dulu, nanti kalo backend laravel udah jadi diganti ambil dari database
// catatan dari SRS:
//   - kuota rata2 6 mahasiswa per dosen
//   - sisa = kuota - terisi
//   - terisi = jumlah pengajuan yg statusnya Menunggu + Diterima

// daftar bidang keahlian (dipanggil pake index)
var BIDANG = ['Kecerdasan Buatan (AI)','Rekayasa Perangkat Lunak (RPL)','Jaringan & Keamanan','Sistem Informasi','Data Science'];

// data dosen
var DOSEN = [
  { id:1, nama:'Dr. Ade Romadhony', nidn:'0412038801', bidang:[0],
    kata:['nlp','machine learning','text mining','deep learning','klasifikasi teks','analisis sentimen','chatbot'],
    kuota:6, terisi:4, antrean:0, menerima:true,
    topik:[
      {id:'t1', judul:'Analisis Sentimen Ulasan Produk dengan IndoBERT', desk:'Fine-tuning model bahasa Indonesia untuk klasifikasi sentimen ulasan e-commerce.'},
      {id:'t2', judul:'Deteksi Berita Hoaks Bahasa Indonesia Berbasis Transformer', desk:'Klasifikasi teks berita menggunakan pendekatan deep learning dan text mining.'} ]},
  { id:2, nama:'Dr. Gara S. Nugraha', nidn:'0415079002', bidang:[2,1],
    kata:['web','cyber security','penetration testing','laravel','api security','owasp','autentikasi'],
    kuota:6, terisi:6, antrean:3, menerima:true,
    topik:[
      {id:'t3', judul:'Deteksi Kerentanan Aplikasi Web Otomatis dengan OWASP ZAP', desk:'Pengujian keamanan web berbasis OWASP Top 10 pada aplikasi kampus.'},
      {id:'t4', judul:'Rancang Bangun REST API Aman dengan JWT dan Rate Limiting', desk:'Implementasi autentikasi dan pembatasan akses pada layanan API.'} ]},
  { id:3, nama:'Dr. Ursa S. M.', nidn:'0420068503', bidang:[1,3],
    kata:['ui/ux','software engineering','usability','requirement','design thinking','aplikasi mobile'],
    kuota:6, terisi:5, antrean:0, menerima:true,
    topik:[
      {id:'t5', judul:'Evaluasi Usability Aplikasi Akademik dengan System Usability Scale', desk:'Pengukuran usability dan perbaikan antarmuka sistem informasi akademik.'},
      {id:'t6', judul:'Perancangan UI/UX Aplikasi Mobile Layanan Kampus', desk:'Proses design thinking dari riset pengguna hingga prototipe.'} ]},
  { id:4, nama:'Dr. Rina Kusuma', nidn:'0410118804', bidang:[4,0],
    kata:['data mining','forecasting','time series','visualisasi data','prediksi','regresi','machine learning'],
    kuota:6, terisi:3, antrean:0, menerima:true,
    topik:[
      {id:'t7', judul:'Prediksi Permintaan Barang dengan LSTM dan Time Series', desk:'Peramalan stok dan penjualan menggunakan data historis transaksi.'},
      {id:'t8', judul:'Dashboard Analitik Data Akademik Mahasiswa', desk:'Visualisasi data dan data mining untuk pemantauan kinerja akademik.'} ]},
  { id:5, nama:'Dr. Bima Prakoso', nidn:'0407058205', bidang:[2],
    kata:['iot','jaringan komputer','sdn','embedded','monitoring jaringan','mikrokontroler'],
    kuota:6, terisi:6, antrean:1, menerima:true,
    topik:[ {id:'t9', judul:'Sistem Monitoring Kualitas Udara Berbasis IoT', desk:'Sensor, mikrokontroler, dan dashboard pemantauan real-time.'} ]},
  { id:6, nama:'Dr. Sari Wulandari', nidn:'0425098606', bidang:[3],
    kata:['erp','proses bisnis','enterprise architecture','tata kelola ti','cobit','togaf','sistem informasi'],
    kuota:6, terisi:2, antrean:0, menerima:true,
    topik:[
      {id:'t10', judul:'Perancangan Enterprise Architecture dengan TOGAF untuk UMKM', desk:'Pemetaan proses bisnis dan arsitektur sistem informasi organisasi.'},
      {id:'t11', judul:'Evaluasi Tata Kelola TI Menggunakan COBIT 2019', desk:'Pengukuran tingkat kapabilitas proses TI pada instansi.'} ]},
  { id:7, nama:'Dr. Hendra Pratama', nidn:'0402128307', bidang:[0],
    kata:['computer vision','deep learning','pengolahan citra','vision transformer','klasifikasi citra','cnn'],
    kuota:6, terisi:4, antrean:0, menerima:false,
    topik:[ {id:'t12', judul:'Klasifikasi Citra Medis dengan Vision Transformer', desk:'Eksperimen arsitektur ViT dan CNN pada dataset citra.'} ]},
  { id:8, nama:'Dr. Maya Anggraini', nidn:'0430078908', bidang:[1,3],
    kata:['mobile','flutter','agile','devops','pengembangan aplikasi','testing','ci/cd'],
    kuota:6, terisi:5, antrean:0, menerima:true,
    topik:[
      {id:'t13', judul:'Pengembangan Aplikasi Mobile Cross-Platform dengan Flutter', desk:'Rancang bangun aplikasi layanan dengan arsitektur bersih.'},
      {id:'t14', judul:'Penerapan CI/CD dan Automated Testing pada Proyek Agile', desk:'Otomasi pipeline build dan pengujian perangkat lunak.'} ]}
];

// periode pengajuan yg lagi jalan
var PERIODE = { nama:'Ganjil 2026/2027', kode:'2026-1', mulai:'2026-09-15', selesai:'2026-10-30', buka:true };

// isi notifikasi di navbar
var NOTIF = [
  {ico:'bi-hourglass-split', t:'Pengajuan Anda ke Dr. Ade Romadhony sedang menunggu keputusan.', w:'2 hari lalu'},
  {ico:'bi-people', t:'Antrean Dr. Gara S. Nugraha kini 3 orang.', w:'5 jam lalu'},
  {ico:'bi-calendar-event', t:'Periode pengajuan ditutup 30 Okt 2026.', w:'1 minggu lalu'}
];

// riwayat awal buat halaman riwayat
var RIWAYAT_AWAL = [
  {judul:'Sistem Rekomendasi Buku Perpustakaan', dosen:'Dr. Bima Prakoso', status:'Ditolak', tgl:'2026-09-18', ket:'Topik kurang sesuai dengan bidang keahlian dosen (IoT & jaringan).'},
  {judul:'Aplikasi Peminjaman Ruang Kelas', dosen:'Dr. Hendra Pratama', status:'Kedaluwarsa', tgl:'2026-09-20', ket:'Tidak ada keputusan dosen dalam 7 × 24 jam.'}
];

// teks contoh buat tombol "Isi contoh" di form rekomendasi
var CONTOH = {
  judul:'Analisis Sentimen Ulasan Aplikasi Mobile dengan Deep Learning',
  abstrak:'Penelitian ini membangun model machine learning untuk klasifikasi sentimen ulasan pengguna aplikasi mobile berbahasa Indonesia. Data ulasan dikumpulkan dari toko aplikasi lalu melalui tahap text mining seperti pembersihan teks, tokenisasi, dan pembobotan. Model deep learning berbasis transformer dibandingkan dengan metode klasik untuk menilai akurasi, presisi, dan recall. Hasil penelitian diharapkan membantu pengembang memahami keluhan pengguna secara otomatis dan cepat melalui dashboard visualisasi sehingga keputusan perbaikan aplikasi dapat dilakukan lebih tepat sasaran. Pengujian dilakukan dengan data latih dan data uji terpisah serta validasi silang untuk memastikan model tidak mengalami overfitting pada kumpulan data tertentu.'
};
