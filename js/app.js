// app.js
// isinya fungsi2 umum yg dipake di semua halaman
// (navbar, toast, data bersama, pengajuan, antrean, modal ajukan, sesi)

// helper biar ga nulis document.querySelector terus
function $(selector, parent) {
  if (!parent) parent = document;
  return parent.querySelector(selector);
}

function $$(selector, parent) {
  if (!parent) parent = document;
  return Array.from(parent.querySelectorAll(selector));
}

// buat escape karakter html biar aman pas dimasukin ke innerHTML
function esc(teks) {
  var daftar = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(teks).replace(/[&<>"']/g, function (c) {
    return daftar[c];
  });
}

// hitung jumlah kata
function wordCount(teks) {
  if (teks.trim() == '') return 0;
  return teks.trim().split(/\s+/).length;
}

// format tanggal ke bahasa indonesia, contoh: 20 Sep 2026
function fmtDate(tgl) {
  return new Date(tgl).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// localStorage dibungkus try catch, soalnya kadang error kalo mode incognito
function lsGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {}
}

function lsDel(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {}
}

// data user yg login (masih dummy)
var USERS = {
  mhs: { nama: 'Muhammad Fathurrohman', sub: '1202230013', ini: 'MF' },
  dosen: { nama: 'Dr. Khodijah Amiroh, S.ST., M.T', sub: 'NIDN 0412038801', ini: 'KA' },
  koor: { nama: 'Dr. Sari Wulandari', sub: 'Koordinator TA / Kaprodi', ini: 'SW' }
};

// dosen yg login (masih dummy, Dr. Khodijah)
var ID_DOSEN_LOGIN = 1;

// warna avatar dosen
var AV_COLORS = ['#D9132B', '#2457C5', '#12805C', '#7A3FC4', '#C25B00', '#0E7490', '#9D174D', '#4D5B0F'];

function avColor(id) {
  return AV_COLORS[(id - 1) % AV_COLORS.length];
}

// ambil inisial nama, gelar Dr. dibuang dulu
function initials(nama) {
  var kata = nama.replace(/^Dr\.\s*/, '').split(' ');
  var hasil = '';
  for (var i = 0; i < kata.length; i++) {
    if (kata[i] == '') continue;
    hasil += kata[i][0];
    if (hasil.length == 2) break;
  }
  return hasil.toUpperCase();
}

// sisa slot dosen
function sisa(d) {
  return Math.max(0, d.kuota - d.terisi);
}

function statusDosen(d) {
  if (!d.menerima) {
    return 'nonaktif';
  }
  if (sisa(d) > 0) {
    return 'tersedia';
  } else {
    return 'penuh';
  }
}

function avatar(d, cls) {
  if (cls === undefined) cls = '';
  return `<div class="av ${cls}" style="background:${avColor(d.id)}">${initials(d.nama)}</div>`;
}

function findDosen(id) {
  for (var i = 0; i < DOSEN.length; i++) {
    if (DOSEN[i].id === Number(id)) return DOSEN[i];
  }
  return undefined;
}


// ================= TOAST (notif kecil di pojok kanan atas) =================
function toast(msg, type) {
  if (!type) type = 'dark';

  var wadah = $('.toast-wrap');
  if (!wadah) {
    wadah = document.createElement('div');
    wadah.className = 'toast-wrap';
    document.body.appendChild(wadah);
  }

  var ikon = {
    success: 'bi-check-circle-fill',
    danger: 'bi-x-circle-fill',
    warning: 'bi-exclamation-triangle-fill',
    dark: 'bi-info-circle-fill'
  };

  var t = document.createElement('div');
  t.className = 'toast-x ' + type;
  t.innerHTML = `<i class="bi ${ikon[type]}"></i><div>${esc(msg)}</div>`;
  wadah.appendChild(t);

  // hilang sendiri setelah 3.8 detik
  setTimeout(function () {
    t.style.opacity = '0';
    t.style.transition = '.3s';
    setTimeout(function () {
      t.remove();
    }, 300);
  }, 3800);
}



// ================= DATA BERSAMA (DB) =================
// semua data (pengajuan, dosen, notif, periode) disimpan di 1 key localStorage
// jadi halaman mahasiswa, dosen, sama koordinator baca data yg sama
// nanti di laravel ini diganti tabel2 di database

var KEY_DB = 'sd_db_v3';
var KEY_SESI = 'sd_sesi';

var JAM = 60 * 60 * 1000;
var HARI = 24 * JAM;
var BATAS_KEPUTUSAN = 7 * HARI; // dosen punya 7 x 24 jam buat mutusin (MR-05)

// status yg dianggap "aktif" punya mahasiswa (MR-03)
var STATUS_AKTIF = ['Menunggu', 'Antrean', 'Diterima', 'Ditetapkan'];
// status yg makan slot dosen
var STATUS_SLOT = ['Menunggu', 'Diterima', 'Ditetapkan'];

// peran halaman yg lagi dibuka, diisi di buildShell
var ROLE_SAAT_INI = null;

// kirim event biar halaman gambar ulang
function kirimEvent() {
  ['pengajuan:changed', 'live:update', 'notif:changed'].forEach(function (nama) {
    document.dispatchEvent(new Event(nama));
  });
}

// jenis toast ditebak dari ikon notifnya
function tipeNotif(ico) {
  if (/check|patch|arrow-up/.test(ico)) return 'success';
  if (/x-circle/.test(ico)) return 'danger';
  if (/exclamation|hourglass-bottom|calendar-x|question/.test(ico)) return 'warning';
  return 'dark';
}

var DB = {
  data: null,
  raw: null, // isi localStorage terakhir yg kita tau, buat ngecek ada perubahan ga

  // data awal waktu pertama kali dibuka / habis reset
  seed: function () {
    var now = Date.now();
    var mhs = USERS.mhs;

    var data = {
      pengajuan: [],
      dosen: {},
      notif: { mhs: [], dosen: [], koor: [] },
      periode: { mulai: PERIODE.mulai, selesai: PERIODE.selesai, buka: PERIODE.buka },
      nextId: 1,
      nextSp: 10, // nomor surat 004 & 009 udah kepake di data contoh
      rebutNext: null
    };

    function tambah(x) {
      var p = {
        id: data.nextId++, me: false, mhs: '', nim: '', dosenId: 0,
        judul: '', abstrak: '', asal: 'Usulan mahasiswa', status: 'Menunggu',
        tgl: now, tglMenunggu: null, tglKeputusan: null, tglSah: null,
        alasan: '', sp: null, dilihat: false, klarifikasi: false
      };
      data.pengajuan.push(Object.assign(p, x));
    }

    // punya mahasiswa yg login
    tambah({ me: true, mhs: mhs.nama, nim: mhs.sub, dosenId: 5, status: 'Ditolak',
      judul: 'Sistem Rekomendasi Buku Perpustakaan',
      abstrak: 'Penelitian ini membangun sistem rekomendasi buku perpustakaan kampus berdasarkan riwayat peminjaman mahasiswa.',
      tgl: now - 26 * HARI, tglMenunggu: now - 26 * HARI, tglKeputusan: now - 25 * HARI, dilihat: true,
      alasan: 'Topik kurang sesuai dengan bidang keahlian dosen (IoT, embedded system & keamanan jaringan).' });
    tambah({ me: true, mhs: mhs.nama, nim: mhs.sub, dosenId: 7, status: 'Kedaluwarsa',
      judul: 'Aplikasi Peminjaman Ruang Kelas',
      abstrak: 'Rancang bangun aplikasi peminjaman ruang kelas berbasis web untuk mengurangi bentrok jadwal.',
      tgl: now - 24 * HARI, tglMenunggu: now - 24 * HARI, tglKeputusan: now - 17 * HARI, dilihat: true });
    tambah({ me: true, mhs: mhs.nama, nim: mhs.sub, dosenId: 1, status: 'Menunggu',
      judul: 'Prediksi Kebutuhan Irigasi Tanaman Berbasis Sensor IoT',
      abstrak: 'Penelitian ini membahas prediksi kebutuhan irigasi tanaman dari data sensor kelembapan tanah, suhu, dan media tanam dengan pendekatan machine learning.',
      tgl: now - 2 * HARI, tglMenunggu: now - 2 * HARI });

    // punya mahasiswa lain
    tambah({ mhs: 'Bagus Faaza Azhar Amin', nim: '1202230055', dosenId: 1, status: 'Menunggu', asal: 'Rekomendasi dosen',
      judul: 'Edge AI untuk Deteksi Anomali Sensor Smart Greenhouse',
      abstrak: 'Deteksi anomali data sensor smart greenhouse secara real-time menggunakan model ringan yang dijalankan di perangkat edge.',
      tgl: now - 150 * JAM, tglMenunggu: now - 150 * JAM });
    tambah({ mhs: 'Muhammad Alawi', nim: '1202220101', dosenId: 1, status: 'Ditetapkan',
      judul: 'Monitoring Kualitas Air Hidroponik Berbasis Wireless Sensor Network',
      abstrak: 'Pemantauan pH, EC, dan suhu larutan nutrisi hidroponik menggunakan jaringan sensor nirkabel.',
      tgl: now - 26 * HARI, tglMenunggu: now - 26 * HARI, tglKeputusan: now - 24 * HARI, tglSah: now - 23 * HARI, sp: 'SP-TA/2026-1/004' });
    tambah({ mhs: 'Liobaldo', nim: '1202220145', dosenId: 1, status: 'Ditetapkan',
      judul: 'Data Fusion Multisensor untuk Estimasi Kelembapan Tanah',
      abstrak: 'Penggabungan data beberapa sensor untuk meningkatkan akurasi estimasi kelembapan tanah.',
      tgl: now - 22 * HARI, tglMenunggu: now - 22 * HARI, tglKeputusan: now - 20 * HARI, tglSah: now - 18 * HARI, sp: 'SP-TA/2026-1/009' });
    tambah({ mhs: 'Zaky Naufal', nim: '1202230078', dosenId: 4, status: 'Diterima', asal: 'Rekomendasi dosen',
      judul: 'Prediksi Student Health Risk dengan Machine Learning',
      abstrak: 'Klasifikasi risiko kesehatan mahasiswa dari data tabular menggunakan metode dari publikasi terindeks Scopus.',
      tgl: now - 5 * HARI, tglMenunggu: now - 5 * HARI, tglKeputusan: now - 3 * HARI });
    tambah({ mhs: 'Rayyan Nabil Abrary', nim: '1202230134', dosenId: 6, status: 'Diterima', asal: 'Rekomendasi dosen',
      judul: 'Klasifikasi Penyakit Daun Tanaman dengan CNN',
      abstrak: 'Klasifikasi citra daun tanaman untuk mendeteksi penyakit menggunakan convolutional neural network.',
      tgl: now - 4 * HARI, tglMenunggu: now - 4 * HARI, tglKeputusan: now - 2 * HARI });

    // data dosen. baseTerisi = terisi di data.js dikurangi pengajuan yg udah kecatat di atas
    DOSEN.forEach(function (d) {
      var tercatat = data.pengajuan.filter(function (p) {
        return p.dosenId === d.id && STATUS_SLOT.indexOf(p.status) != -1;
      }).length;

      data.dosen[d.id] = {
        nama: d.nama,
        kuota: d.kuota,
        menerima: d.menerima,
        bidang: d.bidang.slice(),
        kata: d.kata.slice(),
        topik: d.topik.map(function (t) {
          return { id: t.id, judul: t.judul, desk: t.desk, aktif: true };
        }),
        baseTerisi: Math.max(0, d.terisi - tercatat),
        baseAntrean: d.antrean
      };
    });

    // notif awal, yg paling baru di atas
    data.notif.mhs = [
      { ico: 'bi-hourglass-split', t: 'Pengajuan Anda ke Dr. Khodijah Amiroh, S.ST., M.T sedang menunggu keputusan.', w: now - 2 * HARI, baca: false },
      { ico: 'bi-x-circle', t: 'Pengajuan Anda ke Muhammad Adib Kamali, S.T., M.Eng ditolak. Alasan: Topik kurang sesuai dengan bidang keahlian dosen (IoT, embedded system & keamanan jaringan).', w: now - 25 * HARI, baca: true },
      { ico: 'bi-calendar-event', t: 'Periode pengajuan Ganjil 2026/2027 dibuka sampai 30 Okt 2026.', w: now - 29 * HARI, baca: true }
    ];
    data.notif.dosen = [
      { ico: 'bi-exclamation-triangle', t: 'Pengajuan Bagus Faaza Azhar Amin kurang dari 24 jam lagi kedaluwarsa.', w: now - 2 * JAM, baca: false },
      { ico: 'bi-inbox', t: 'Pengajuan baru dari ' + mhs.nama + ': "Prediksi Kebutuhan Irigasi Tanaman Berbasis Sensor IoT".', w: now - 2 * HARI, baca: false }
    ];
    data.notif.koor = [
      { ico: 'bi-person-check', t: 'Dr. Farah Zakiyah Rahmanti, S.ST., M.T. menerima Rayyan Nabil Abrary. Menunggu pengesahan.', w: now - 2 * HARI, baca: false },
      { ico: 'bi-person-check', t: 'Yohanes Setiawan, S.Si., M.Kom. menerima Zaky Naufal. Menunggu pengesahan.', w: now - 3 * HARI, baca: false }
    ];

    return data;
  },

  // dipanggil sekali waktu app.js dimuat
  load: function () {
    // key versi lama udah ga dipake
    lsDel('sd_pengajuan');
    lsDel('sd_riwayat');
    lsDel('sd_db_v2');

    this.muat();
    if (!this.data) {
      this.data = this.seed();
      this.simpan();
    } else {
      this.sinkron();
    }
    this.cek();

    // cek kedaluwarsa berkala (halaman dosen & koordinator ga pake Live)
    var self = this;
    setInterval(function () {
      self.segarkan();
      self.cek();
    }, 60000);
  },

  // baca dari localStorage, kalau rusak / kosong data = null
  muat: function () {
    var raw = lsGet(KEY_DB);
    this.raw = raw;
    this.data = null;
    try {
      var hasil = JSON.parse(raw);
      if (hasil && hasil.pengajuan && hasil.dosen && hasil.notif && hasil.periode) {
        this.data = hasil;
      }
    } catch (e) {}
  },

  // ambil data terbaru (siapa tau tab lain udah ngubah). dipanggil sebelum tiap aksi
  segarkan: function () {
    var raw = lsGet(KEY_DB);
    if (raw === null || raw === this.raw) return false;
    try {
      var hasil = JSON.parse(raw);
      if (!hasil || !hasil.pengajuan) return false;
      this.data = hasil;
      this.raw = raw;
      this.sinkron();
      return true;
    } catch (e) {
      return false;
    }
  },

  simpan: function () {
    this.sinkron();
    this.raw = JSON.stringify(this.data);
    lsSet(KEY_DB, this.raw);
    kirimEvent();
  },

  // hitung ulang terisi, antrean, posisi, terus disalin ke array DOSEN
  // biar fungsi lama (sisa, statusDosen, dll) tetep jalan
  sinkron: function () {
    var data = this.data;

    DOSEN.forEach(function (d) {
      var dd = data.dosen[d.id];
      if (!dd) return;
      d.nama = dd.nama;
      d.kuota = dd.kuota;
      d.menerima = dd.menerima;
      d.bidang = dd.bidang;
      d.kata = dd.kata;
      d.topik = dd.topik;
      d.terisi = dd.baseTerisi;
      d.antrean = dd.baseAntrean;
    });

    // diurutin dari waktu pengajuan biar antreannya FIFO
    var urut = data.pengajuan.slice().sort(function (a, b) {
      return a.tgl - b.tgl;
    });
    var nomor = {};
    urut.forEach(function (p) {
      var d = findDosen(p.dosenId);
      if (!d) return;

      if (STATUS_SLOT.indexOf(p.status) != -1) d.terisi++;

      if (p.status == 'Antrean') {
        d.antrean++;
        nomor[d.id] = (nomor[d.id] || 0) + 1;
        p.posisi = data.dosen[d.id].baseAntrean + nomor[d.id];
      } else {
        delete p.posisi;
      }
    });

    PERIODE.mulai = data.periode.mulai;
    PERIODE.selesai = data.periode.selesai;
    PERIODE.buka = data.periode.buka;
  },

  cari: function (id) {
    return this.data.pengajuan.find(function (p) {
      return p.id === Number(id);
    });
  },

  // pengajuan Menunggu yg lewat 7x24 jam jadi Kedaluwarsa, slotnya dilepas
  cek: function () {
    if (!this.data) return false;

    var self = this;
    var now = Date.now();
    var kena = {};
    var berubah = false;

    this.data.pengajuan.forEach(function (p) {
      if (p.status != 'Menunggu') return;
      if (now - (p.tglMenunggu || p.tgl) <= BATAS_KEPUTUSAN) return;

      p.status = 'Kedaluwarsa';
      p.tglKeputusan = now;
      kena[p.dosenId] = true;
      berubah = true;

      var d = findDosen(p.dosenId);
      if (p.me) {
        self.beritahu('mhs', 'bi-hourglass-bottom', 'Pengajuan Anda ke ' + d.nama + ' kedaluwarsa karena tidak ada keputusan dalam 7 × 24 jam. Silakan pilih dosen lain.');
      }
      if (p.dosenId === ID_DOSEN_LOGIN) {
        self.beritahu('dosen', 'bi-hourglass-bottom', 'Pengajuan ' + p.mhs + ' kedaluwarsa (lewat 7 × 24 jam). Slot dilepas.');
      }
    });

    if (berubah) {
      for (var id in kena) {
        this.proses(Number(id));
      }
      this.simpan();
    }
    return berubah;
  },

  // selama masih ada slot kosong & ada antrean, antrean paling depan naik jadi Menunggu (FIFO, MR-05)
  // kalau dosenId ga diisi, semua dosen diproses
  proses: function (dosenId) {
    var self = this;

    if (dosenId === undefined) {
      DOSEN.forEach(function (d) {
        self.proses(d.id);
      });
      return;
    }

    this.sinkron();
    var d = findDosen(dosenId);
    var dd = this.data.dosen[dosenId];

    // posisi antrean mahasiswa sebelum diproses, buat notif "posisi naik"
    var punyaku = this.data.pengajuan.find(function (p) {
      return p.me && p.dosenId === d.id && p.status == 'Antrean';
    });
    var posisiAwal = punyaku ? punyaku.posisi : 0;

    while (sisa(d) > 0 && d.antrean > 0) {
      if (dd.baseAntrean > 0) {
        // yg paling depan antrean contoh (bukan data asli), anggap aja langsung naik
        dd.baseAntrean--;
        dd.baseTerisi++;
      } else {
        var depan = this.data.pengajuan.filter(function (p) {
          return p.dosenId === d.id && p.status == 'Antrean';
        }).sort(function (a, b) {
          return a.tgl - b.tgl;
        })[0];

        depan.status = 'Menunggu';
        depan.tglMenunggu = Date.now();

        if (depan.me) {
          this.beritahu('mhs', 'bi-arrow-up-circle', 'Giliran Anda tiba! Pengajuan ke ' + d.nama + ' naik dari antrean ke Menunggu. Dosen punya 7 × 24 jam untuk memutuskan.');
        }
        if (d.id === ID_DOSEN_LOGIN) {
          this.beritahu('dosen', 'bi-inbox', 'Pengajuan baru dari antrean: ' + depan.mhs + ' – "' + depan.judul + '".');
        }
      }
      this.sinkron();
    }

    if (punyaku && punyaku.status == 'Antrean' && punyaku.posisi < posisiAwal) {
      this.beritahu('mhs', 'bi-arrow-up-circle', 'Posisi antrean Anda pada ' + d.nama + ' naik menjadi #' + punyaku.posisi + '.');
    }
  },

  terima: function (id) {
    this.segarkan();
    var p = this.cari(id);
    if (!p || p.status != 'Menunggu') {
      return { ok: false, msg: 'Pengajuan ini sudah tidak menunggu keputusan.' };
    }

    var d = findDosen(p.dosenId);
    p.status = 'Diterima';
    p.tglKeputusan = Date.now();

    if (p.me) {
      this.beritahu('mhs', 'bi-check-circle', 'Selamat! ' + d.nama + ' menerima pengajuan Anda. Menunggu pengesahan koordinator.');
    }
    this.beritahu('koor', 'bi-person-check', d.nama + ' menerima ' + p.mhs + '. Menunggu pengesahan.');
    this.simpan();
    return { ok: true, p: p };
  },

  tolak: function (id, alasan) {
    alasan = String(alasan || '').trim();
    if (alasan.length < 10) {
      return { ok: false, msg: 'Alasan penolakan minimal 10 karakter (sekarang ' + alasan.length + ').' };
    }

    this.segarkan();
    var p = this.cari(id);
    if (!p || p.status != 'Menunggu') {
      return { ok: false, msg: 'Pengajuan ini sudah tidak menunggu keputusan.' };
    }

    var d = findDosen(p.dosenId);
    p.status = 'Ditolak';
    p.alasan = alasan;
    p.tglKeputusan = Date.now();

    if (p.me) {
      this.beritahu('mhs', 'bi-x-circle', 'Pengajuan Anda ke ' + d.nama + ' ditolak. Alasan: ' + alasan);
    }

    // slot dilepas, antrean maju
    this.proses(p.dosenId);
    this.simpan();
    return { ok: true, p: p };
  },

  // koordinator ngesahin, nomor surat SP-TA/<kode periode>/<urut 3 digit>
  sahkan: function (id) {
    this.segarkan();
    var p = this.cari(id);
    if (!p || p.status != 'Diterima') {
      return { ok: false, msg: 'Hanya pengajuan berstatus Diterima yang bisa disahkan.' };
    }

    var d = findDosen(p.dosenId);
    p.sp = 'SP-TA/' + PERIODE.kode + '/' + String(this.data.nextSp).padStart(3, '0');
    this.data.nextSp++;
    p.status = 'Ditetapkan';
    p.tglSah = Date.now();
    p.klarifikasi = false;

    if (p.me) {
      this.beritahu('mhs', 'bi-patch-check', 'Pembimbing Anda resmi ditetapkan. Surat penetapan ' + p.sp + ' sudah bisa diunduh.');
    }
    if (p.dosenId === ID_DOSEN_LOGIN) {
      this.beritahu('dosen', 'bi-patch-check', 'Penetapan ' + p.mhs + ' disahkan koordinator (' + p.sp + ').');
    }
    this.simpan();
    return { ok: true, p: p };
  },

  klarifikasi: function (id) {
    this.segarkan();
    var p = this.cari(id);
    if (!p || p.status != 'Diterima') {
      return { ok: false, msg: 'Klarifikasi hanya untuk pengajuan berstatus Diterima.' };
    }

    p.klarifikasi = true;
    if (p.dosenId === ID_DOSEN_LOGIN) {
      this.beritahu('dosen', 'bi-question-circle', 'Koordinator meminta klarifikasi atas penerimaan ' + p.mhs + ' ("' + p.judul + '").');
    }
    if (p.me) {
      this.beritahu('mhs', 'bi-question-circle', 'Koordinator meminta klarifikasi kepada dosen atas pengajuan Anda. Pengesahan ditunda sementara.');
    }
    this.simpan();
    return { ok: true, p: p };
  },

  // peta = { idDosen: kuotaBaru }. kalau kuota naik, antrean otomatis maju
  setKuota: function (peta) {
    this.segarkan();
    for (var id in peta) {
      if (this.data.dosen[id]) this.data.dosen[id].kuota = peta[id];
    }
    this.proses();
    this.simpan();
  },

  setPeriode: function (mulai, selesai, buka) {
    this.segarkan();
    var pr = this.data.periode;
    var gantiStatus = pr.buka !== buka;

    pr.mulai = mulai;
    pr.selesai = selesai;
    pr.buka = buka;

    if (gantiStatus) {
      if (buka) {
        this.beritahu('mhs', 'bi-calendar-check', 'Periode pengajuan dibuka koordinator (' + fmtDate(mulai) + ' – ' + fmtDate(selesai) + ').');
      } else {
        this.beritahu('mhs', 'bi-calendar-x', 'Periode pengajuan ditutup koordinator. Pengajuan baru tidak bisa dikirim.');
      }
    }
    this.simpan();
  },

  // ubah data dosen (profil, saklar, topik). fn nerima data dosen di DB
  ubahDosen: function (id, fn) {
    this.segarkan();
    fn(this.data.dosen[id]);
    this.simpan();
  },

  // tambah notif. kalau perannya sama dengan halaman yg dibuka, langsung muncul toast juga
  beritahu: function (role, ikon, teks) {
    var list = this.data.notif[role];
    list.unshift({ ico: ikon, t: teks, w: Date.now(), baca: false });
    if (list.length > 30) list.length = 30;

    if (role === ROLE_SAAT_INI) {
      toast(teks, tipeNotif(ikon));
    }
  },

  // ditandai kebaca waktu dropdown notif dibuka
  // sengaja ga kirim event biar tanda "baru" masih keliatan selama dropdown kebuka
  tandaiBaca: function (role) {
    this.segarkan();
    this.data.notif[role].forEach(function (n) {
      n.baca = true;
    });
    this.raw = JSON.stringify(this.data);
    lsSet(KEY_DB, this.raw);
  },

  reset: function () {
    lsDel(KEY_DB);
    location.reload();
  }
};


// ================= STATE MAHASISWA =================
// pembungkus DB khusus mahasiswa yg login
// sesuai SRS MR-03: mahasiswa cuma boleh punya 1 pengajuan aktif per periode

var State = {
  // pengajuan aktif, atau hasil terakhir (Ditolak/Kedaluwarsa) yg belum ditutup
  get p() {
    var milikku = this.semua();
    for (var i = 0; i < milikku.length; i++) {
      if (STATUS_AKTIF.indexOf(milikku[i].status) != -1) return milikku[i];
    }
    for (var j = 0; j < milikku.length; j++) {
      var x = milikku[j];
      if ((x.status == 'Ditolak' || x.status == 'Kedaluwarsa') && !x.dilihat) return x;
    }
    return null;
  },

  // semua pengajuan milik mahasiswa, terbaru di atas
  semua: function () {
    if (!DB.data) return [];
    return DB.data.pengajuan.filter(function (p) {
      return p.me;
    }).sort(function (a, b) {
      return b.tgl - a.tgl;
    });
  },

  aktif: function () {
    var p = this.p;
    return !!p && STATUS_AKTIF.indexOf(p.status) != -1;
  },

  // ini cuma simulasi, nanti di backend pake transaksi (SELECT ... FOR UPDATE) biar ga rebutan slot
  ajukan: function (data) {
    DB.segarkan();
    DB.cek();

    // 1. udah punya pengajuan aktif
    if (this.aktif()) {
      return { ok: false, msg: 'Anda sudah punya 1 pengajuan aktif pada periode ini.' };
    }

    // 2. di luar periode
    var per = periodeAktif();
    if (!per.ok) {
      return { ok: false, msg: per.msg };
    }

    // 3. dosen ga nerima
    var d = findDosen(data.dosenId);
    if (!d.menerima) {
      return { ok: false, msg: 'Dosen sedang tidak menerima bimbingan.' };
    }

    // simulasi panel demo: slot terakhir keburu diambil mahasiswa lain
    if (DB.data.rebutNext === d.id) {
      DB.data.rebutNext = null;
      DB.data.dosen[d.id].baseTerisi += sisa(d);
      DB.simpan();
    }

    // 4. slot habis pas dikirim -> tawarin antrean dulu (MR-04)
    if (sisa(d) === 0 && !data.izinAntrean) {
      return { ok: false, penuh: true, antrean: d.antrean };
    }

    // 5. bikin pengajuan
    DB.data.pengajuan.forEach(function (x) {
      if (x.me) x.dilihat = true; // hasil lama ga usah ditampilin lagi
    });

    var now = Date.now();
    var status = sisa(d) > 0 ? 'Menunggu' : 'Antrean';
    var p = {
      id: DB.data.nextId++, me: true, mhs: USERS.mhs.nama, nim: USERS.mhs.sub, dosenId: d.id,
      judul: data.judul, abstrak: data.abstrak, asal: data.asal, status: status,
      tgl: now, tglMenunggu: status == 'Menunggu' ? now : null, tglKeputusan: null, tglSah: null,
      alasan: '', sp: null, dilihat: false, klarifikasi: false
    };
    DB.data.pengajuan.push(p);
    DB.sinkron();

    if (status == 'Menunggu') {
      DB.beritahu('mhs', 'bi-check-circle', 'Pengajuan terkirim. Slot dikunci, menunggu keputusan ' + d.nama + '.');
      if (d.id === ID_DOSEN_LOGIN) {
        DB.beritahu('dosen', 'bi-inbox', 'Pengajuan baru dari ' + p.mhs + ': "' + p.judul + '".');
      }
    } else {
      DB.beritahu('mhs', 'bi-check-circle', 'Anda masuk antrean #' + p.posisi + ' pada ' + d.nama + '. Anda dipanggil otomatis saat slot terbuka.');
    }

    DB.simpan();
    return { ok: true, status: status, posisi: p.posisi };
  },

  // cuma boleh kalau masih Menunggu / Antrean
  batalkan: function () {
    DB.segarkan();
    var p = this.p;
    if (!p || (p.status != 'Menunggu' && p.status != 'Antrean')) return false;

    var d = findDosen(p.dosenId);
    var tadinya = p.status;
    p.status = 'Dibatalkan';
    p.tglKeputusan = Date.now();
    p.dilihat = true;

    DB.beritahu('mhs', 'bi-slash-circle', 'Pengajuan ke ' + d.nama + ' dibatalkan.');
    if (tadinya == 'Menunggu' && d.id === ID_DOSEN_LOGIN) {
      DB.beritahu('dosen', 'bi-slash-circle', p.mhs + ' membatalkan pengajuan "' + p.judul + '".');
    }

    DB.proses(d.id);
    DB.simpan();
    return true;
  },

  // hasil Ditolak / Kedaluwarsa ditutup biar bisa pilih dosen lain
  tutupHasil: function () {
    DB.segarkan();
    var p = this.p;
    if (p && (p.status == 'Ditolak' || p.status == 'Kedaluwarsa')) {
      p.dilihat = true;
      DB.simpan();
    }
  },

  // panel demo: ada mahasiswa lain yg lepas slot dosen ini
  lepasSlot: function (dosenId) {
    DB.segarkan();
    var d = findDosen(dosenId);
    var dd = DB.data.dosen[dosenId];

    if (dd.baseTerisi <= 0) {
      toast('Tidak ada slot contoh yang bisa dilepas pada ' + d.nama + '.', 'warning');
      return;
    }

    dd.baseTerisi--;
    toast('Slot ' + d.nama + ' dilepas. Antrean FIFO diproses otomatis.', 'dark');
    DB.proses(dosenId);
    DB.simpan();
  },

  // panel demo: slot terakhir direbut mahasiswa lain pas kita kirim pengajuan
  rebutNanti: function (dosenId) {
    DB.segarkan();
    var d = findDosen(dosenId);
    DB.data.rebutNext = dosenId;
    DB.simpan();
    toast('Simulasi aktif: saat Anda mengirim pengajuan ke ' + d.nama + ', slot terakhirnya diambil mahasiswa lain lebih dulu.', 'dark');
  },

  reset: function () {
    DB.reset();
  }
};


// ================= LIVE UPDATE =================
// harusnya polling ke server tiap 5 detik (MR-01)
// sementara angka contohnya diubah random aja buat demo

var Live = {
  last: Date.now(),
  flash: new Set(),

  tick: function () {
    DB.segarkan();
    DB.cek();

    // yg diacak cuma dosen yg nerima, ga ada antrean, dan belum ada pengajuan kecatat
    // biar angka di demo ga berantakan
    var pool = [];
    DOSEN.forEach(function (d) {
      var tercatat = DB.data.pengajuan.some(function (p) {
        return p.dosenId === d.id;
      });
      if (d.menerima && d.antrean === 0 && !tercatat && DB.data.rebutNext !== d.id) {
        pool.push(d);
      }
    });

    var berubah = false;
    if (pool.length > 0 && Math.random() < 0.65) {
      var d = pool[Math.floor(Math.random() * pool.length)];
      var dd = DB.data.dosen[d.id];
      if (Math.random() < 0.5 && d.terisi < d.kuota) {
        dd.baseTerisi++;
        berubah = true;
      } else if (dd.baseTerisi > 1) {
        dd.baseTerisi--;
        berubah = true;
      }
      if (berubah) this.flash.add(d.id);
    }

    this.last = Date.now();
    if (berubah) {
      DB.simpan();
    } else {
      document.dispatchEvent(new Event('live:update'));
    }

    var self = this;
    setTimeout(function () {
      self.flash.clear();
    }, 100);
  },

  start: function () {
    var self = this;

    setInterval(function () {
      self.tick();
    }, 5000);

    // update tulisan "x dtk lalu"
    setInterval(function () {
      var detik = Math.round((Date.now() - self.last) / 1000);
      var el = $$('.live-ago');
      for (var i = 0; i < el.length; i++) {
        if (detik <= 1) {
          el[i].textContent = 'baru saja';
        } else {
          el[i].textContent = detik + ' dtk lalu';
        }
      }
    }, 1000);
  }
};




// ================= TF-IDF + COSINE SIMILARITY (MR-06) =================
// ini versi js buat demo, nanti di backend laravel rumusnya sama

// kata2 umum yg ga dihitung
var STOP = new Set('yang dan di ke dari untuk dengan pada ini itu adalah dalam atau akan oleh sebagai juga dapat serta agar sehingga lebih para telah ada tidak tahap hasil penelitian berbasis menggunakan melalui antara kemudian lalu secara'.split(' '));

function tokenize(teks) {
  var kata = teks.toLowerCase().replace(/[^a-z0-9\s/]/g, ' ').split(/\s+/);
  var hasil = [];
  for (var i = 0; i < kata.length; i++) {
    if (kata[i].length > 2 && !STOP.has(kata[i])) {
      hasil.push(kata[i]);
    }
  }
  return hasil;
}

function recommend(judul, abstrak) {
  // 1. bikin "dokumen" utk tiap dosen dari kata kunci, topik, sama bidangnya
  var docs = [];
  for (var i = 0; i < DOSEN.length; i++) {
    var d = DOSEN[i];
    if (!d.menerima) continue;

    var teksTopik = topikAktif(d).map(function (t) {
      return t.judul + ' ' + t.desk;
    });
    var teksBidang = d.bidang.map(function (b) {
      return BIDANG[b];
    }).join(' ');

    // kata kunci dimasukin 2x biar bobotnya lebih gede
    var gabungan = [].concat(d.kata, d.kata, teksTopik, teksBidang).join(' ');
    docs.push({ d: d, tokens: tokenize(gabungan) });
  }

  // 2. query dari judul + abstrak, judulnya juga dikali 2
  var q = tokenize(judul + ' ' + judul + ' ' + abstrak);

  // 3. hitung df (berapa dokumen yg punya kata itu)
  var N = docs.length;
  var df = {};
  docs.forEach(function (doc) {
    new Set(doc.tokens).forEach(function (w) {
      df[w] = (df[w] || 0) + 1;
    });
  });

  function idf(w) {
    return Math.log((N + 1) / ((df[w] || 0) + 1)) + 1;
  }

  // ubah list token jadi vektor
  function vec(tokens) {
    var tf = {};
    tokens.forEach(function (w) {
      tf[w] = (tf[w] || 0) + 1;
    });
    var v = {};
    for (var w in tf) {
      v[w] = (tf[w] / tokens.length) * idf(w);
    }
    return v;
  }

  // cosine similarity
  function cos(a, b) {
    var dot = 0, na = 0, nb = 0;
    for (var k in a) {
      na += a[k] * a[k];
      if (b[k]) dot += a[k] * b[k];
    }
    for (var k2 in b) {
      nb += b[k2] * b[k2];
    }
    if (na == 0 || nb == 0) return 0;
    return dot / Math.sqrt(na * nb);
  }

  var qv = vec(q);
  var hasil = [];
  docs.forEach(function (doc) {
    var skor = Math.round(cos(qv, vec(doc.tokens)) * 100);
    if (skor > 0) {
      hasil.push({ d: doc.d, skor: skor });
    }
  });
  // console.log(hasil);

  // sesuai SRS: dosen yg masih ada slot ditaruh di atas, baru diurutkan skornya. max 5
  hasil.sort(function (a, b) {
    var adaSlotA = sisa(a.d) > 0 ? 1 : 0;
    var adaSlotB = sisa(b.d) > 0 ? 1 : 0;
    if (adaSlotA != adaSlotB) return adaSlotB - adaSlotA;
    return b.skor - a.skor;
  });

  return hasil.slice(0, 5);
}

// tampilan list hasil rekomendasi
function rekomHTML(list, max) {
  if (max === undefined) max = 5;

  if (list.length == 0) {
    return `<div class="empty"><i class="bi bi-search"></i>Belum ada dosen yang cocok. Coba perpanjang abstrak atau tambah kata kunci.</div>`;
  }

  var html = '';
  var data = list.slice(0, max);
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var st = statusDosen(r.d);

    var infoSlot = '';
    if (st == 'tersedia') {
      infoSlot = `<span style="color:var(--green);font-weight:700">Sisa ${sisa(r.d)} slot</span>`;
    } else {
      infoSlot = '<span style="color:var(--red-dark);font-weight:700">Penuh – masuk antrean</span>';
    }

    html += `<div class="rek-item">
      <div class="rek-rank">${i+1}</div>${avatar(r.d,'xs')}
      <div class="flex-grow-1 min-w-0">
        <div class="d-flex justify-content-between align-items-center gap-2"><b class="text-truncate">${esc(r.d.nama)}</b><span class="score-num">${r.skor}%</span></div>
        <div class="score"><i style="width:0" data-w="${r.skor}"></i></div>
        <div class="mt-1" style="font-size:12px;color:var(--muted)">${infoSlot}
          · <a href="#" data-detail="${r.d.id}" class="text-decoration-none" style="color:var(--red)">Lihat</a></div>
      </div></div>`;
  }
  return html;
}

// animasi bar skor, pake 2x requestAnimationFrame biar transisinya jalan
function animateScores(root) {
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      $$('.score i[data-w]', root).forEach(function (el) {
        el.style.width = el.dataset.w + '%';
      });
    });
  });
}


// ================= NAVBAR + PANEL DEMO =================
// format: [link, label, key]
var MENU = {
  mhs: [
    ['dashboard.html', 'Dashboard', 'dashboard'],
    ['cari.html', 'Cari Dosen & Rekomendasi', 'cari'],
    ['pengajuan.html', 'Pengajuan Saya', 'pengajuan'],
    ['riwayat.html', 'Riwayat', 'riwayat']
  ],
  dosen: [
    ['#masuk', 'Pengajuan Masuk', 'masuk'],
    ['#bimbingan', 'Bimbingan Saya', 'bimbingan'],
    ['#profil', 'Profil & Topik', 'profil']
  ],
  koor: [
    ['#rekap', 'Rekap Beban', 'rekap'],
    ['#periode', 'Periode & Kuota', 'periode'],
    ['#penetapan', 'Penetapan', 'penetapan'],
    ['#impor', 'Impor Data', 'impor']
  ]
};

// halaman utama tiap peran
var HALAMAN_PERAN = {
  mhs: 'dashboard.html',
  dosen: 'dosen.html',
  koor: 'koordinator.html'
};

function buildShell(role, active) {
  ROLE_SAAT_INI = role;
  if (!jagaSesi(role)) return false;

  var u = Object.assign({}, USERS[role]);
  if (role == 'dosen') {
    // nama dosen bisa diubah di profil, jadi ambil dari DB
    u.nama = findDosen(ID_DOSEN_LOGIN).nama;
    u.ini = initials(u.nama);
  }

  // menu navbar
  var links = '';
  MENU[role].forEach(function (m) {
    var kelas = m[2] === active ? 'active' : '';
    links += `<li><a href="${m[0]}" class="${kelas}" data-key="${m[2]}">${m[1]}</a></li>`;
  });

  // warna avatar beda2 tiap role
  var warnaAv = '#12805C';
  if (role == 'mhs') warnaAv = '#D9132B';
  else if (role == 'dosen') warnaAv = '#2457C5';

  $('#app-nav').innerHTML = `
  <header class="topbar"><div class="inner">
    <a class="brand" href="${HALAMAN_PERAN[role]}">
      <span class="brand-mark"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="13" width="4" height="8" rx="1.2" fill="#fff"/><rect x="10" y="8" width="4" height="13" rx="1.2" fill="#fff"/><rect x="17" y="3" width="4" height="18" rx="1.2" fill="#fff" opacity=".7"/></svg></span>
      <span class="brand-text"><small>SISTEM INFORMASI</small><b>DOSEN PEMBIMBING TA &amp; SKRIPSI</b></span></a>
    <ul class="nav-links" id="navLinks">${links}</ul>
    <div class="top-right">
      <div class="dropdown" id="notifDrop"><button class="icon-btn" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-label="Notifikasi"><i class="bi bi-bell"></i><span class="dot" id="notifDot" hidden></span></button>
        <div class="dropdown-menu dropdown-menu-end notif-menu"><div class="px-3 py-2 fw-bold border-bottom">Notifikasi</div>
          <div id="notifList"></div>
          <div class="notif-foot"><i class="bi bi-envelope me-1"></i>Notifikasi juga dikirim ke email Anda.</div></div></div>
      <div class="dropdown"><button class="user-chip" data-bs-toggle="dropdown">
        <div class="av sm" style="background:${warnaAv}">${u.ini}</div>
        <div class="meta"><b>${esc(u.nama)}</b><span>${u.sub}</span></div><i class="bi bi-chevron-down small text-muted"></i></button>
        <ul class="dropdown-menu dropdown-menu-end"><li><a class="dropdown-item" href="#" id="btnKeluar"><i class="bi bi-box-arrow-right me-2"></i>Keluar</a></li></ul></div>
    </div>
    <button class="icon-btn nav-toggle" id="navToggle" aria-label="Menu"><i class="bi bi-list fs-5"></i></button>
  </div></header>`;

  // tombol hamburger di hp
  $('#navToggle').onclick = function () {
    $('#navLinks').classList.toggle('open');
  };

  $('#btnKeluar').onclick = function (e) {
    e.preventDefault();
    keluar();
  };

  // notif: pas dropdown dibuka semua ditandai kebaca, pas ditutup tanda "baru" diilangin
  var notifTerbuka = false;
  renderNotif();
  $('#notifDrop').addEventListener('shown.bs.dropdown', function () {
    notifTerbuka = true;
    DB.tandaiBaca(role);
    $('#notifDot').hidden = true;
  });
  $('#notifDrop').addEventListener('hidden.bs.dropdown', function () {
    notifTerbuka = false;
    renderNotif();
  });
  document.addEventListener('notif:changed', function () {
    if (!notifTerbuka) renderNotif();
  });

  // tombol panel demo di kanan bawah
  var menuSlot = '';
  if (role == 'mhs') {
    menuSlot = `<li><a class="dropdown-item" href="#" id="demoGara"><i class="bi bi-unlock me-2"></i>Simulasi: slot Dr. Helmy terbuka</a></li>
      <li><a class="dropdown-item" href="#" id="demoBima"><i class="bi bi-unlock me-2"></i>Simulasi: slot Pak Adib terbuka</a></li>
      <li><a class="dropdown-item" href="#" id="demoUrsa"><i class="bi bi-lightning me-2"></i>Simulasi: slot terakhir Pak Philip direbut</a></li>
      <li><hr class="dropdown-divider"></li>`;
  }

  var fab = document.createElement('div');
  fab.className = 'demo-fab dropup';
  fab.innerHTML = `<button class="btn btn-sm" data-bs-toggle="dropdown"><i class="bi bi-sliders me-1"></i>Panel Demo</button>
    <ul class="dropdown-menu dropdown-menu-end">
      ${menuSlot}
      <li><a class="dropdown-item" href="#" id="demoSesi"><i class="bi bi-clock-history me-2"></i>Simulasi: sesi habis (120 menit)</a></li>
      <li><a class="dropdown-item" href="#" id="demoReset"><i class="bi bi-arrow-counterclockwise me-2"></i>Reset data demo</a></li></ul>`;
  document.body.appendChild(fab);

  function klik(id, fn) {
    var el = $(id);
    if (!el) return;
    el.onclick = function (e) {
      e.preventDefault();
      fn();
    };
  }

  klik('#demoGara', function () { State.lepasSlot(2); });
  klik('#demoBima', function () { State.lepasSlot(5); });
  klik('#demoUrsa', function () { State.rebutNanti(3); });
  klik('#demoReset', function () { State.reset(); });
  klik('#demoSesi', function () {
    // mundurin waktu aktivitas terakhir jadi 121 menit lalu
    var s = bacaSesi();
    if (s) {
      s.last = Date.now() - 121 * 60 * 1000;
      simpanSesi(s);
    }
    cekSesi(role);
  });

  return true;
}

// isi dropdown notif dari DB.data.notif[role]
function renderNotif() {
  var wadah = $('#notifList');
  if (!wadah || !DB.data) return;

  var list = DB.data.notif[ROLE_SAAT_INI] || [];
  if (list.length == 0) {
    wadah.innerHTML = '<div class="notif-item text-muted">Belum ada notifikasi.</div>';
  } else {
    var html = '';
    list.slice(0, 15).forEach(function (n) {
      html += `<div class="notif-item ${n.baca ? '' : 'baru'}"><i class="bi ${n.ico}"></i><div>${esc(n.t)}<br><small>${waktuLalu(n.w)}</small></div></div>`;
    });
    wadah.innerHTML = html;
  }

  // titik merah cuma kalau ada yg belum dibaca
  var adaBaru = list.some(function (n) {
    return !n.baca;
  });
  $('#notifDot').hidden = !adaBaru;
}


// buat halaman yg pake tab (dosen & koordinator)
// section yg tampil sesuai #hash di url
function initViews(defaultKey) {
  function tampilkan() {
    var key = location.hash ? location.hash.slice(1) : defaultKey;

    $$('.view').forEach(function (v) {
      v.classList.toggle('show', v.id === key);
    });
    $$('#navLinks a').forEach(function (a) {
      a.classList.toggle('active', a.dataset.key === key);
    });

    var nav = $('#navLinks');
    if (nav) nav.classList.remove('open');
  }

  window.addEventListener('hashchange', tampilkan);
  tampilkan();
}



// ================= MODAL AJUKAN + DETAIL DOSEN =================
// dipake di halaman2 mahasiswa
function injectAjukanUI() {
  var wrap = document.createElement('div');
  wrap.innerHTML = `
  <div class="modal fade" id="mAjukan" tabindex="-1"><div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
    <div class="modal-header"><div><h5 class="modal-title fw-bold" id="mjTitle">Ajukan Pembimbing</h5><div class="small text-muted" id="mjSub"></div></div><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div id="mjInfo" class="mb-3"></div>
      <div class="mb-3"><label class="form-label fw-bold">Asal topik</label>
        <div class="d-flex gap-2 flex-wrap">
          <label class="chip" id="lblSendiri"><input type="radio" name="asal" value="sendiri" class="d-none" checked><i class="bi bi-lightbulb"></i> Usulan saya sendiri</label>
          <label class="chip" id="lblRek"><input type="radio" name="asal" value="rekom" class="d-none"><i class="bi bi-bookmark-star"></i> Topik rekomendasi dosen</label></div>
        <select id="mjTopik" class="form-select mt-2 d-none"></select></div>
      <div class="mb-3"><div class="d-flex justify-content-between"><label class="form-label fw-bold">Judul TA</label><span class="wc" id="mjJudulWc">0/200</span></div>
        <input id="mjJudul" class="form-control" maxlength="200" placeholder="Tulis judul tugas akhir"></div>
      <div class="mb-1"><div class="d-flex justify-content-between"><label class="form-label fw-bold">Abstrak</label><span class="wc" id="mjAbsWc">0 kata (wajib 150–300)</span></div>
        <textarea id="mjAbs" rows="7" class="form-control" placeholder="Tulis abstrak 150–300 kata"></textarea></div>
      <div class="invalid-feedback d-block" id="mjErr"></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" data-bs-dismiss="modal">Batal</button><button class="btn btn-red" id="mjSubmit">Kirim Pengajuan</button></div>
  </div></div></div>

  <div class="offcanvas offcanvas-end" tabindex="-1" id="ocDetail" style="width:440px;max-width:100vw">
    <div class="offcanvas-header"><h5 class="offcanvas-title fw-bold">Profil Dosen</h5><button class="btn-close" data-bs-dismiss="offcanvas"></button></div>
    <div class="offcanvas-body" id="ocBody"></div></div>`;
  document.body.appendChild(wrap);

  var modal = new bootstrap.Modal('#mAjukan');
  var offcanvas = new bootstrap.Offcanvas('#ocDetail');
  var dosenDipilih = null;

  // true kalau mahasiswa udah setuju masuk antrean (MR-04)
  var izinAntrean = false;

  function pakaiRekom() {
    return $('input[name=asal]:checked').value == 'rekom';
  }

  function updateJudulWc() {
    $('#mjJudulWc').textContent = $('#mjJudul').value.length + '/200';
  }

  function updateAbsWc() {
    var n = wordCount($('#mjAbs').value);
    var el = $('#mjAbsWc');
    el.textContent = n + ' kata (wajib 150–300)';

    var kelas = '';
    if (n > 0) {
      if (n >= 150 && n <= 300) kelas = 'good';
      else kelas = 'bad';
    }
    el.className = 'wc ' + kelas;
  }

  // judul otomatis keisi kalo pilih topik rekomendasi
  function isiTopik() {
    var idTopik = $('#mjTopik').value;
    var t = topikAktif(dosenDipilih).find(function (x) {
      return x.id === idTopik;
    });
    if (t) {
      $('#mjJudul').value = t.judul;
      updateJudulWc();
    }
  }

  function syncAsal() {
    var rek = pakaiRekom();
    $('#lblRek').classList.toggle('on', rek);
    $('#lblSendiri').classList.toggle('on', !rek);
    $('#mjTopik').classList.toggle('d-none', !rek);
    if (rek) isiTopik();
  }

  $$('input[name=asal]').forEach(function (r) {
    r.addEventListener('change', syncAsal);
  });
  $('#mjTopik').addEventListener('change', isiTopik);
  $('#mjJudul').addEventListener('input', updateJudulWc);
  $('#mjAbs').addEventListener('input', updateAbsWc);

  // buka modal ajukan
  window.openAjukan = function (dosenId, opt) {
    if (!opt) opt = {};
    DB.segarkan();
    var d = findDosen(dosenId);

    var per = periodeAktif();
    if (!per.ok) {
      toast(per.msg, 'warning');
      return;
    }

    if (State.aktif()) {
      var p = State.p;
      var namaDosen = findDosen(p.dosenId).nama;
      if (p.status == 'Menunggu' || p.status == 'Antrean') {
        toast('Anda sudah punya 1 pengajuan aktif (' + p.status + ' ke ' + namaDosen + '). Batalkan dulu di halaman Pengajuan Saya.', 'warning');
      } else {
        toast('Pengajuan Anda sudah ' + p.status.toLowerCase() + ' oleh ' + namaDosen + '. Tidak bisa mengajukan lagi pada periode ini.', 'warning');
      }
      return;
    }

    if (!d.menerima) {
      toast(d.nama + ' sedang tidak menerima bimbingan.', 'warning');
      return;
    }

    dosenDipilih = d;
    var antre = sisa(d) === 0; // kalo penuh berarti masuk antrean
    izinAntrean = antre; // dari awal udah milih antrean, jadi ga perlu ditawarin lagi

    if (antre) {
      $('#mjTitle').textContent = 'Masuk Antrean (FIFO)';
      $('#mjSub').textContent = d.nama + ' · antrean saat ini ' + d.antrean + ' orang';
      $('#mjSubmit').textContent = 'Masuk Antrean';
      $('#mjSubmit').className = 'btn btn-amber';
      $('#mjInfo').innerHTML = `<div class="warn-box"><i class="bi bi-people me-1"></i>Slot dosen ini penuh. Anda akan masuk antrean urutan <b>#${d.antrean+1}</b> dan otomatis dipanggil saat slot terbuka.</div>`;
    } else {
      $('#mjTitle').textContent = 'Ajukan Pembimbing';
      $('#mjSub').textContent = d.nama + ' · sisa ' + sisa(d) + ' slot';
      $('#mjSubmit').textContent = 'Kirim Pengajuan';
      $('#mjSubmit').className = 'btn btn-red';
      $('#mjInfo').innerHTML = `<div class="hint-box"><i class="bi bi-shield-check me-1"></i>Slot akan dikunci untuk Anda saat pengajuan dikirim. Dosen punya 7 × 24 jam untuk memutuskan.</div>`;
    }

    // topik yg dinonaktifkan dosen ga ditampilin
    var daftarTopik = topikAktif(d);
    var opsi = '';
    daftarTopik.forEach(function (t) {
      opsi += `<option value="${t.id}">${esc(t.judul)}</option>`;
    });
    $('#mjTopik').innerHTML = opsi;
    $('#lblRek').classList.toggle('d-none', daftarTopik.length == 0);

    // reset form
    $('#mjJudul').value = '';
    $('#mjAbs').value = '';
    $('#mjErr').textContent = '';
    updateJudulWc();
    updateAbsWc();
    $('input[name=asal][value=sendiri]').checked = true;
    syncAsal();

    // kalo dibuka dari tombol "Pilih topik ini"
    if (opt.topikId && daftarTopik.length > 0) {
      $('input[name=asal][value=rekom]').checked = true;
      $('#mjTopik').value = opt.topikId;
      syncAsal();
    }

    offcanvas.hide();
    modal.show();
  };

  // tombol kirim pengajuan
  $('#mjSubmit').onclick = function () {
    var judul = $('#mjJudul').value.trim();
    var abs = $('#mjAbs').value;
    var n = wordCount(abs);
    var err = $('#mjErr');

    // validasi
    if (!judul) {
      err.textContent = 'Judul wajib diisi.';
      return;
    }
    if (n < 150 || n > 300) {
      err.textContent = 'Abstrak harus 150–300 kata (sekarang ' + n + ' kata).';
      return;
    }

    var asal = pakaiRekom() ? 'Rekomendasi dosen' : 'Usulan mahasiswa';
    var r = State.ajukan({ dosenId: dosenDipilih.id, judul: judul, abstrak: abs, asal: asal, izinAntrean: izinAntrean });

    // slot keburu diambil orang lain pas dikirim -> tawarin antrean (MR-04)
    if (!r.ok && r.penuh) {
      izinAntrean = true;
      $('#mjTitle').textContent = 'Slot Baru Saja Penuh';
      $('#mjSub').textContent = dosenDipilih.nama + ' · antrean saat ini ' + r.antrean + ' orang';
      $('#mjSubmit').textContent = 'Masuk Antrean';
      $('#mjSubmit').className = 'btn btn-amber';
      $('#mjInfo').innerHTML = `<div class="warn-box"><i class="bi bi-exclamation-triangle me-1"></i>Slot terakhir <b>${esc(dosenDipilih.nama)}</b> baru saja diambil mahasiswa lain sesaat sebelum pengajuan Anda masuk.
        Klik <b>Masuk Antrean</b> sekali lagi untuk masuk antrean urutan <b>#${r.antrean+1}</b>, atau tutup jendela ini untuk memilih dosen lain.</div>`;
      err.textContent = '';
      $('#mjInfo').scrollIntoView({ block: 'nearest' });
      return;
    }

    if (!r.ok) {
      err.textContent = r.msg;
      return;
    }

    // toast sukses udah muncul dari DB.beritahu
    modal.hide();
  };

  // panel samping profil dosen
  window.openDetail = function (id) {
    var d = findDosen(id);
    var st = statusDosen(d);

    var labelStatus = 'Tidak menerima';
    if (st == 'tersedia') labelStatus = 'Tersedia';
    else if (st == 'penuh') labelStatus = 'Penuh';

    var antreanTxt = d.antrean ? ` · antrean ${d.antrean} orang` : '';

    var bidangHTML = d.bidang.map(function (i) {
      return `<span class="tag">${BIDANG[i]}</span>`;
    }).join('');

    var kataHTML = d.kata.map(function (k) {
      return `<span class="tag">${esc(k)}</span>`;
    }).join('');

    var disabled = st == 'nonaktif' ? 'disabled' : '';
    var topikHTML = topikAktif(d).map(function (t) {
      return `<div class="card-x pad mb-2"><b>${esc(t.judul)}</b><div class="small text-muted my-1">${esc(t.desk)}</div>
        <button class="btn btn-ghost btn-sm" ${disabled} onclick="openAjukan(${d.id},{topikId:'${t.id}'})">Pilih topik ini</button></div>`;
    }).join('');
    if (!topikHTML) {
      topikHTML = '<div class="small text-muted">Dosen belum menawarkan topik.</div>';
    }

    var tombol = '';
    if (st == 'nonaktif') {
      tombol = '<button class="btn btn-ghost" disabled>Dosen tidak menerima bimbingan</button>';
    } else if (st == 'penuh') {
      tombol = `<button class="btn btn-amber" onclick="openAjukan(${d.id})">Masuk Antrean (FIFO)</button>`;
    } else {
      tombol = `<button class="btn btn-red" onclick="openAjukan(${d.id})">Ajukan dengan topik sendiri</button>`;
    }

    $('#ocBody').innerHTML = `
      <div class="d-flex gap-3 align-items-center mb-3">${avatar(d,'lg')}<div><h5 class="fw-bold mb-1">${esc(d.nama)}</h5><div class="text-muted small">NIDN ${d.nidn}</div>
        <span class="badge-s ${st} mt-2 d-inline-block">${labelStatus}</span></div></div>
      <div class="card-x pad mb-3"><div class="d-flex justify-content-between"><b>Kuota bimbingan</b><span>${d.terisi}/${d.kuota}</span></div>
        <div class="slots">${slotHTML(d.kuota, d.terisi)}</div>
        <div class="small text-muted">Sisa ${sisa(d)} slot${antreanTxt}</div></div>
      <div class="filter-label mt-0">Bidang keahlian</div>${bidangHTML}
      <div class="filter-label">Kata kunci</div>${kataHTML}
      <div class="filter-label">Topik yang ditawarkan</div>
      ${topikHTML}
      <div class="d-grid mt-3">${tombol}</div>`;

    offcanvas.show();
  };

  // semua elemen yg punya data-detail bisa diklik buat buka profil dosen
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-detail]');
    if (a) {
      e.preventDefault();
      openDetail(a.dataset.detail);
    }
  });
}


// kotak2 kecil indikator slot
function slotHTML(kuota, terisi) {
  var html = '';
  for (var i = 0; i < kuota; i++) {
    html += `<i class="${i < terisi ? 'on' : ''}"></i>`;
  }
  return html;
}


// ================= KARTU DOSEN (dashboard & cari) =================
function dosenCardHTML(d) {
  var st = statusDosen(d);
  var flash = Live.flash.has(d.id) ? 'flash' : '';

  var badge = '';
  var tombol = '';
  if (st == 'tersedia') {
    badge = 'TERSEDIA';
    tombol = `<button class="btn btn-red" onclick="openAjukan(${d.id})"><i class="bi bi-send me-1"></i>Ajukan</button>`;
  } else if (st == 'penuh') {
    badge = 'PENUH';
    tombol = `<button class="btn btn-amber" onclick="openAjukan(${d.id})"><i class="bi bi-people me-1"></i>Masuk Antrean (FIFO)</button>`;
  } else {
    badge = 'TIDAK MENERIMA';
    tombol = `<button class="btn btn-ghost" disabled>Tidak menerima</button>`;
  }

  var bidangHTML = '';
  for (var i = 0; i < d.bidang.length; i++) {
    bidangHTML += `<span class="tag">${BIDANG[d.bidang[i]]}</span>`;
  }

  var antreanTxt = '';
  if (d.antrean) {
    antreanTxt = ` · <span style="color:var(--amber);font-weight:700">Antrean ${d.antrean}</span>`;
  }

  return `<div class="card-x dosen-card ${st=='tersedia'?'ok':''} ${flash}" data-id="${d.id}">
    ${avatar(d)}
    <div class="flex-grow-1 min-w-0">
      <div class="d-flex justify-content-between align-items-start gap-2"><div><h4>${esc(d.nama)}</h4><div class="nidn">NIDN ${d.nidn}</div></div><span class="badge-s ${st}">${badge}</span></div>
      <div class="mt-2">${bidangHTML}</div>
      <div class="slots">${slotHTML(d.kuota, d.terisi)}</div>
      <div class="slot-text">Terisi <b>${d.terisi}</b> · Sisa <b>${sisa(d)}</b> / Kuota <b>${d.kuota}</b>${antreanTxt}</div>
      <div class="d-flex gap-2 flex-wrap mt-3">${tombol}<button class="btn btn-ghost" data-detail="${d.id}"><i class="bi bi-person-lines-fill me-1"></i>Profil &amp; Topik</button></div>
    </div></div>`;
}


// ================= PERIODE, TOPIK, WAKTU =================

// tanggal hari ini (zona lokal) format YYYY-MM-DD, biar bisa dibandingin sama input date
function tglLokal(ts) {
  var t = ts ? new Date(ts) : new Date();
  var bln = String(t.getMonth() + 1).padStart(2, '0');
  var hr = String(t.getDate()).padStart(2, '0');
  return t.getFullYear() + '-' + bln + '-' + hr;
}

// '2026-10-30' -> '30 Okt'
function tglPendek(str) {
  var a = String(str).split('-');
  var t = new Date(Number(a[0]), Number(a[1]) - 1, Number(a[2]));
  return t.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

// contoh: 5 menit lalu, 2 hari lalu
function waktuLalu(ts) {
  var detik = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (detik < 60) return 'baru saja';
  var menit = Math.floor(detik / 60);
  if (menit < 60) return menit + ' menit lalu';
  var jam = Math.floor(menit / 60);
  if (jam < 24) return jam + ' jam lalu';
  var hari = Math.floor(jam / 24);
  if (hari < 7) return hari + ' hari lalu';
  if (hari < 30) return Math.floor(hari / 7) + ' minggu lalu';
  return fmtDate(ts);
}

// periode aktif = dibuka koordinator DAN hari ini ada di antara mulai - selesai
function periodeAktif() {
  var pr = DB.data.periode;
  var hariIni = tglLokal();

  if (!pr.buka) {
    return { ok: false, label: 'ditutup', msg: 'Periode pengajuan sedang ditutup oleh koordinator.' };
  }
  if (hariIni < pr.mulai) {
    return { ok: false, label: 'dibuka ' + tglPendek(pr.mulai), msg: 'Periode pengajuan baru dibuka ' + fmtDate(pr.mulai) + '.' };
  }
  if (hariIni > pr.selesai) {
    return { ok: false, label: 'berakhir ' + tglPendek(pr.selesai), msg: 'Periode pengajuan sudah berakhir pada ' + fmtDate(pr.selesai) + '.' };
  }
  return { ok: true, label: 'ditutup ' + tglPendek(pr.selesai), msg: '' };
}

// chip periode di dashboard mahasiswa
function renderChipPeriode() {
  var el = $('#chipPeriode');
  if (!el) return;
  var per = periodeAktif();
  el.innerHTML = `<i class="bi bi-calendar-event me-1"></i>Periode ${PERIODE.nama} · ${per.label}`;
  el.classList.toggle('tutup', !per.ok);
}

// topik yg dinonaktifkan dosen ga ditampilin ke mahasiswa
function topikAktif(d) {
  return d.topik.filter(function (t) {
    return t.aktif !== false;
  });
}


// ================= SURAT PENETAPAN =================
// dibuka di tab baru, terus mahasiswa/koordinator bisa cetak atau simpan jadi PDF
function bukaSurat(p) {
  if (!p || p.status != 'Ditetapkan') {
    toast('Surat penetapan belum tersedia.', 'warning');
    return;
  }

  var d = findDosen(p.dosenId);
  var w = window.open('', '_blank');
  if (!w) {
    toast('Pop-up diblokir browser. Izinkan pop-up untuk membuka surat.', 'warning');
    return;
  }

  var html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Surat Penetapan ${esc(p.sp)}</title>
  <style>
    body { font-family: 'Times New Roman', serif; color: #111; background: #f3f4f6; margin: 0; padding: 24px; }
    .kertas { background: #fff; max-width: 720px; margin: 0 auto; padding: 48px 56px; box-shadow: 0 2px 12px rgba(0,0,0,.12); }
    .kop { text-align: center; border-bottom: 3px double #111; padding-bottom: 10px; margin-bottom: 24px; }
    .kop b { display: block; font-size: 18px; letter-spacing: .04em; }
    h1 { font-size: 17px; text-align: center; text-decoration: underline; margin: 0; }
    .no { text-align: center; margin: 4px 0 24px; }
    table { border-collapse: collapse; margin: 14px 0 18px; width: 100%; }
    td { padding: 5px 4px; vertical-align: top; }
    td:first-child { width: 170px; }
    .ttd { margin-top: 48px; margin-left: auto; width: 260px; }
    .ttd .nama { margin-top: 70px; font-weight: bold; text-decoration: underline; }
    .aksi { text-align: center; margin-bottom: 18px; }
    .aksi button { font: 600 14px sans-serif; padding: 10px 18px; border: 0; border-radius: 8px; background: #D9132B; color: #fff; cursor: pointer; }
    @media print { body { background: #fff; padding: 0; } .kertas { box-shadow: none; padding: 0; } .aksi { display: none; } }
  </style></head><body>
  <div class="aksi"><button onclick="window.print()">Cetak / Simpan sebagai PDF</button></div>
  <div class="kertas">
    <div class="kop"><b>PROGRAM STUDI S1 TEKNOLOGI INFORMASI</b>Kampus Surabaya</div>
    <h1>SURAT PENETAPAN DOSEN PEMBIMBING TUGAS AKHIR</h1>
    <div class="no">Nomor: ${esc(p.sp)}</div>
    <p>Koordinator Tugas Akhir Program Studi S1 Teknologi Informasi dengan ini menetapkan:</p>
    <table>
      <tr><td>Nama mahasiswa</td><td>: ${esc(p.mhs)}</td></tr>
      <tr><td>NIM</td><td>: ${esc(p.nim)}</td></tr>
      <tr><td>Judul tugas akhir</td><td>: ${esc(p.judul)}</td></tr>
      <tr><td>Dosen pembimbing</td><td>: ${esc(d.nama)} (NIDN ${esc(d.nidn)})</td></tr>
      <tr><td>Periode</td><td>: ${esc(PERIODE.nama)}</td></tr>
    </table>
    <p>Penetapan ini berlaku sejak tanggal ditetapkan sampai tugas akhir selesai, kecuali ada perubahan yang disahkan koordinator.</p>
    <div class="ttd">Surabaya, ${fmtDate(p.tglSah)}<br>Koordinator TA / Kaprodi
      <div class="nama">${esc(USERS.koor.nama)}</div></div>
  </div></body></html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
}


// ================= SESI & HAK AKSES (MR-08) =================
var SESI_MAKS = 120 * 60 * 1000; // 120 menit ga aktif = sesi habis

function bacaSesi() {
  try {
    return JSON.parse(lsGet(KEY_SESI));
  } catch (e) {
    return null;
  }
}

function simpanSesi(s) {
  lsSet(KEY_SESI, JSON.stringify(s));
}

function keluar() {
  lsDel(KEY_SESI);
  location.href = 'login.html';
}

// true kalau boleh lanjut, false kalau dilempar ke halaman lain
function cekSesi(role) {
  var s = bacaSesi();
  if (!s || !s.role) {
    location.replace('login.html');
    return false;
  }
  if (Date.now() - (s.last || 0) > SESI_MAKS) {
    lsDel(KEY_SESI);
    location.replace('login.html?sesi=habis');
    return false;
  }
  if (s.role !== role) {
    location.replace('403.html');
    return false;
  }
  return true;
}

function jagaSesi(role) {
  if (!cekSesi(role)) {
    // sembunyiin halaman biar ga sempet keliatan sebelum pindah
    document.documentElement.style.visibility = 'hidden';
    return false;
  }

  var terakhirTulis = 0;
  function perpanjang() {
    // dibatesin tiap 5 detik biar ga nulis localStorage tiap ketikan
    if (Date.now() - terakhirTulis < 5000) return;
    var s = bacaSesi();
    if (!s) return;
    s.last = Date.now();
    simpanSesi(s);
    terakhirTulis = Date.now();
  }
  perpanjang();

  // klik atau ngetik = masih aktif
  document.addEventListener('click', perpanjang);
  document.addEventListener('keydown', perpanjang);

  // dicek ulang tiap 30 detik
  setInterval(function () {
    cekSesi(role);
  }, 30000);

  return true;
}


// ================= SINKRON ANTAR TAB =================
// kalau tab lain (misal halaman dosen) ngubah data, tab ini ikut ke-update
window.addEventListener('storage', function (e) {
  if (e.key !== KEY_DB || e.newValue === null) return;

  // notif sebelum update, buat nyari mana yg baru
  var lama = {};
  if (DB.data && ROLE_SAAT_INI) {
    DB.data.notif[ROLE_SAAT_INI].forEach(function (n) {
      lama[n.w + '|' + n.t] = true;
    });
  }

  if (!DB.segarkan()) return;
  kirimEvent();

  if (ROLE_SAAT_INI) {
    var baru = DB.data.notif[ROLE_SAAT_INI].filter(function (n) {
      return !n.baca && !lama[n.w + '|' + n.t];
    });
    baru.slice(0, 3).forEach(function (n) {
      toast(n.t, tipeNotif(n.ico));
    });
  }
});


// data dimuat paling akhir, setelah semua fungsi di atas siap
DB.load();
