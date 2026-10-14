// data.js
// data dummy dulu, nanti kalo backend laravel udah jadi diganti ambil dari database
// catatan dari SRS:
//   - kuota rata2 6 mahasiswa per dosen
//   - sisa = kuota - terisi
//   - terisi = jumlah pengajuan yg statusnya Menunggu + Diterima + Ditetapkan
// angka terisi & antrean di bawah cuma angka awal, angka aslinya dihitung ulang
// dari data pengajuan di DB (lihat sinkron() di app.js)
// notifikasi & riwayat sekarang diambil dari data bersama (DB), bukan dari sini lagi

// daftar bidang keahlian (dipanggil pake index)
var BIDANG = ['Internet of Things (IoT)','Embedded System & Otomasi','Kecerdasan Buatan & Machine Learning','Computer Vision','Data Science & Statistik','Jaringan & Keamanan Siber','Tata Kelola TI & Manajemen Proyek'];

// data dosen (sumber: slide Penulisan Proposal - bidang keahlian & tawaran judul TA)
// NIDN masih dummy, di slide ga ada
var DOSEN = [
  { id:1, nama:'Dr. Khodijah Amiroh, S.ST., M.T', nidn:'0412038801', bidang:[0,1,4],
    kata:['internet of things','embedded system','wireless sensor network','data fusion','smart greenhouse','sensor','irigasi','edge ai','prediksi'],
    kuota:6, terisi:4, antrean:0, menerima:true,
    topik:[
      {id:'t1', judul:'Prediksi Kebutuhan Irigasi Tanaman Berdasarkan Sensor Lingkungan dan Media Tanam', desk:'Prediksi kebutuhan air tanaman dari data sensor lingkungan dan kondisi media tanam.'},
      {id:'t2', judul:'Prediksi Kondisi Mikroklimat Smart Greenhouse Menggunakan Transformer Ringan', desk:'Peramalan suhu, kelembapan, dan mikroklimat greenhouse dengan model transformer ringan.'},
      {id:'t3', judul:'Optimasi Jadwal Irigasi Smart Greenhouse Menggunakan Reinforcement Learning', desk:'Penjadwalan irigasi adaptif berbasis reinforcement learning pada smart greenhouse.'},
      {id:'t4', judul:'Decision Support System untuk Pengelolaan Nutrisi Smart Greenhouse Berdasarkan Data Multisensor', desk:'Sistem pendukung keputusan pengelolaan nutrisi dari fusi data multisensor.'},
      {id:'t5', judul:'Edge AI untuk Deteksi Anomali Sensor Smart Greenhouse Secara Real-Time', desk:'Deteksi anomali data sensor langsung di perangkat edge secara real-time.'},
      {id:'t6', judul:'Prediksi Kebutuhan Nutrisi Tanaman Berdasarkan Riwayat EC, pH, dan Kondisi Lingkungan', desk:'Model prediksi kebutuhan nutrisi dari riwayat EC, pH, dan data lingkungan.'},
      {id:'t7', judul:'Adaptive Sampling Sensor untuk Mengurangi Konsumsi Energi pada Smart Greenhouse IoT', desk:'Pengaturan laju sampling sensor secara adaptif untuk menghemat energi node IoT.'} ]},
  { id:2, nama:'Dr. Helmy Widyantara, S.Kom., M.Eng.', nidn:'0415079002', bidang:[0,1],
    kata:['internet of things','computer organization','arsitektur komputer','industrial automation','smart farming','peternakan','kepiting','monitoring'],
    kuota:6, terisi:6, antrean:3, menerima:true,
    topik:[
      {id:'t8', judul:'Sistem Manajemen Ternak Kepiting Berbasis IoT: Manajemen Air', desk:'Pemantauan dan pengendalian kualitas air budidaya kepiting berbasis IoT.'},
      {id:'t9', judul:'Sistem Manajemen Ternak Kepiting Berbasis IoT: Prediksi Panen', desk:'Prediksi waktu dan hasil panen kepiting dari data pemantauan IoT.'},
      {id:'t10', judul:'Sistem Pendeteksi Kepadatan Daging Kepiting', desk:'Deteksi tingkat kepadatan daging kepiting untuk menentukan kualitas.'},
      {id:'t11', judul:'Sistem Informasi Average Daily Gain (ADG) pada Peternakan Modern', desk:'Pencatatan dan analisis pertambahan bobot harian ternak.'} ]},
  { id:3, nama:'Philip Tobianto Daely, S.T., M.Eng., Ph.D.', nidn:'0420068503', bidang:[0,5],
    kata:['internet of things','distributed computing','cybersecurity','blockchain','depin','desentralisasi','kualitas udara','cuaca'],
    kuota:6, terisi:5, antrean:0, menerima:true,
    topik:[
      {id:'t12', judul:'Perancangan Jaringan DePIN untuk Pemantauan Cuaca dan Kualitas Udara Terdesentralisasi', desk:'Jaringan infrastruktur fisik terdesentralisasi (DePIN) untuk data cuaca dan kualitas udara.'} ]},
  { id:4, nama:'Yohanes Setiawan, S.Si., M.Kom.', nidn:'0410118804', bidang:[4,2,3],
    kata:['matematika','statistika','data analytics','machine learning','computer vision','multimodal','fusion','klasifikasi','deep learning'],
    kuota:6, terisi:3, antrean:0, menerima:true,
    topik:[
      {id:'t13', judul:'Multimodal Learning (Early Fusion, Late Fusion, Hybrid Fusion) - Studi Kasus Bebas', desk:'Syarat: wajib bersedia publikasi international conference.'},
      {id:'t14', judul:'Knee Abnormality Detection', desk:'Dataset Kaggle RSNA Knee Abnormality Detection. Syarat: wajib bersedia publikasi international conference.'},
      {id:'t15', judul:'Student Health Risk', desk:'Dataset Kaggle Playground Series S6E7. Wajib: metode implementasi dari publikasi terindeks Scopus dan bersedia publikasi international conference.'},
      {id:'t16', judul:'Klasifikasi Kanker Kulit Melanoma Menggunakan Multimodal', desk:'Bisa pakai late fusion ataupun early fusion. Metode wajib dari jurnal terindeks Scopus, bersedia publikasi international conference.'},
      {id:'t17', judul:'Klasifikasi Stunting Berbasis Tabular maupun Multimodal', desk:'Syarat: harus 2 mahasiswa, bersedia mencari mitra dan sudah ambil data paling lambat akhir November 2026 (dana transportasi disediakan), metode dari jurnal internasional terindeks Scopus, bersedia seminar international conference.'} ]},
  { id:5, nama:'Muhammad Adib Kamali, S.T., M.Eng', nidn:'0407058205', bidang:[0,1,2,5],
    kata:['internet of things','signal processing','embedded system','artificial intelligence','keamanan jaringan','edge ai','smart grid','server','anomali'],
    kuota:6, terisi:6, antrean:1, menerima:true,
    topik:[
      {id:'t18', judul:'Deteksi Serangan pada Jaringan IoT Menggunakan Lightweight Machine Learning', desk:'Model machine learning ringan untuk mendeteksi serangan pada jaringan IoT.'},
      {id:'t19', judul:'Code Submission Cheating Detection untuk Praktikum Pemrograman', desk:'Deteksi kecurangan pada pengumpulan kode tugas praktikum.'},
      {id:'t20', judul:'Cybersecurity untuk Smart Grid IoT', desk:'Pengamanan komunikasi dan perangkat pada smart grid berbasis IoT.'},
      {id:'t21', judul:'Deteksi dan Pemulihan Anomali Sensor Smart Greenhouse Berbasis Edge AI', desk:'Deteksi anomali sensor sekaligus pemulihan datanya di perangkat edge.'},
      {id:'t22', judul:'Autoscaling Adaptif pada Server Aplikasi Berdasarkan Prediksi Beban', desk:'Penambahan/pengurangan sumber daya server otomatis dari hasil prediksi beban.'},
      {id:'t23', judul:'Manajemen Energi Server Adaptif untuk Infrastruktur Smart Building', desk:'Pengaturan konsumsi energi server secara adaptif pada smart building.'},
      {id:'t24', judul:'Sistem Failover Adaptif Berbasis Edge untuk Menjaga Ketersediaan Layanan Infrastruktur', desk:'Mekanisme failover di sisi edge agar layanan tetap tersedia saat terjadi gangguan.'} ]},
  { id:6, nama:'Dr. Farah Zakiyah Rahmanti, S.ST., M.T.', nidn:'0425098606', bidang:[3,2],
    kata:['computer vision','deep learning','image processing','pengolahan citra','machine learning','human computer interaction','klasifikasi citra'],
    kuota:6, terisi:2, antrean:0, menerima:true,
    topik:[
      {id:'t25', judul:'Image Processing / Computer Vision dengan Deep Learning', desk:'Topik terkait image processing/computer vision dengan deep learning, atau kasus machine learning/deep learning lainnya.'} ]},
  { id:7, nama:'Mustafa Kamal, S.Kom., M.Kom.', nidn:'0402128307', bidang:[6,2],
    kata:['it audit','project management','deep learning','forecasting','time series','transformer','vision transformer','rag','iklim'],
    kuota:6, terisi:4, antrean:0, menerima:false,
    topik:[
      {id:'t26', judul:'Spatio Temporal Forecasting for Environment and Climate Change', desk:'Peramalan spasio-temporal untuk data lingkungan dan perubahan iklim.'},
      {id:'t27', judul:'Temperature and Climate Forecasting for Solar Renewable Energy', desk:'Peramalan suhu dan iklim untuk mendukung energi terbarukan surya.'},
      {id:'t28', judul:'Computer Vision for Traffic Monitoring and Analysis with Vision Transformer (ViT)', desk:'Pemantauan dan analisis lalu lintas menggunakan Vision Transformer.'},
      {id:'t29', judul:'Location-Aware Retrieval-Augmented Generation (RAG) for Smart City (SurabayaSambat v2)', desk:'RAG berbasis lokasi untuk layanan aduan smart city.'},
      {id:'t30', judul:'Long Transformer Based Time-Series Forecasting for Climate Prediction', desk:'Prediksi iklim dengan model transformer untuk deret waktu panjang.'},
      {id:'t31', judul:'Financial Statement Retrieval-Augmented Generation (RAG) for Explainable Accounting Analysis', desk:'RAG atas laporan keuangan untuk analisis akuntansi yang dapat dijelaskan.'} ]},
  { id:8, nama:'Qori Afiata Fiddina, S.Mat., M.Mat', nidn:'0430078908', bidang:[4],
    kata:['optimasi','statistik','data analytics','analisis numerik','matematika','pemodelan'],
    kuota:6, terisi:5, antrean:0, menerima:true,
    topik:[]}
];

// periode pengajuan yg lagi jalan
var PERIODE = { nama:'Ganjil 2026/2027', kode:'2026-1', mulai:'2026-09-15', selesai:'2026-10-30', buka:true };

// teks contoh buat tombol "Isi contoh" di form rekomendasi
var CONTOH = {
  judul:'Analisis Sentimen Ulasan Aplikasi Mobile dengan Deep Learning',
  abstrak:'Penelitian ini membangun model machine learning untuk klasifikasi sentimen ulasan pengguna aplikasi mobile berbahasa Indonesia. Data ulasan dikumpulkan dari toko aplikasi lalu melalui tahap text mining seperti pembersihan teks, tokenisasi, dan pembobotan. Model deep learning berbasis transformer dibandingkan dengan metode klasik untuk menilai akurasi, presisi, dan recall. Hasil penelitian diharapkan membantu pengembang memahami keluhan pengguna secara otomatis dan cepat melalui dashboard visualisasi sehingga keputusan perbaikan aplikasi dapat dilakukan lebih tepat sasaran. Pengujian dilakukan dengan data latih dan data uji terpisah serta validasi silang untuk memastikan model tidak mengalami overfitting pada kumpulan data tertentu.'
};
