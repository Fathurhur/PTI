// app.js
// isinya fungsi2 umum yg dipake di semua halaman
// (navbar, toast, data bersama, pengajuan, modal ajukan, sesi)

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

// kuota dosen per peran: kuota = pembimbing 1, kuota2 = pembimbing 2
function kuotaPeran(d, peran) {
  return peran == 2 ? d.kuota2 : d.kuota;
}

// sisa slot dosen. peran 1 = pembimbing 1 (default), peran 2 = pembimbing 2. kuota dihitung terpisah per peran
function sisa(d, peran) {
  var terisi = peran == 2 ? d.terisi2 : d.terisi;
  return Math.max(0, kuotaPeran(d, peran) - terisi);
}

function statusDosen(d) {
  if (!d.menerima) {
    return 'nonaktif';
  }
  // tersedia kalau salah satu kuota (pembimbing 1 atau 2) masih ada
  if (sisa(d, 1) > 0 || sisa(d, 2) > 0) {
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

var KEY_DB = 'sd_db_v7';
var KEY_SESI = 'sd_sesi';

var JAM = 60 * 60 * 1000;
var HARI = 24 * JAM;
var BATAS_KEPUTUSAN = 7 * HARI; // dosen punya 7 x 24 jam buat mutusin (MR-05)

// status yg dianggap "aktif" punya mahasiswa (MR-03)
var STATUS_AKTIF = ['Menunggu', 'Ditetapkan'];
// status yg makan slot dosen
var STATUS_SLOT = ['Menunggu', 'Ditetapkan'];

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
      rebutNext: null
    };

    function tambah(x) {
      var p = {
        id: data.nextId++, me: false, mhs: '', nim: '', dosenId: 0,
        peran: 1, topik: '', judul: '', abstrak: '', asal: 'Usulan mahasiswa', status: 'Menunggu',
        tgl: now, tglMenunggu: null, tglKeputusan: null, tglSah: null,
        alasan: '', dilihat: false
      };
      data.pengajuan.push(Object.assign(p, x));
    }

    // punya mahasiswa yg login
    tambah({ me: true, mhs: mhs.nama, nim: mhs.sub, dosenId: 5, status: 'Ditolak',
      topik: 'Sistem rekomendasi',
      judul: 'Sistem Rekomendasi Buku Perpustakaan',
      abstrak: 'Penelitian ini membangun sistem rekomendasi buku perpustakaan kampus berdasarkan riwayat peminjaman mahasiswa.',
      tgl: now - 26 * HARI, tglMenunggu: now - 26 * HARI, tglKeputusan: now - 25 * HARI, dilihat: true,
      alasan: 'Topik kurang sesuai dengan bidang keahlian dosen (IoT, embedded system & keamanan jaringan).' });
    tambah({ me: true, mhs: mhs.nama, nim: mhs.sub, dosenId: 7, status: 'Kedaluwarsa',
      topik: 'Sistem informasi akademik',
      judul: 'Aplikasi Peminjaman Ruang Kelas',
      abstrak: 'Rancang bangun aplikasi peminjaman ruang kelas berbasis web untuk mengurangi bentrok jadwal.',
      tgl: now - 24 * HARI, tglMenunggu: now - 24 * HARI, tglKeputusan: now - 17 * HARI, dilihat: true });
    tambah({ me: true, mhs: mhs.nama, nim: mhs.sub, dosenId: 1, status: 'Menunggu',
      topik: 'Prediksi kebutuhan irigasi tanaman',
      judul: 'Prediksi Kebutuhan Irigasi Tanaman Berbasis Sensor IoT',
      abstrak: 'Penelitian ini membahas prediksi kebutuhan irigasi tanaman dari data sensor kelembapan tanah, suhu, dan media tanam dengan pendekatan machine learning.',
      tgl: now - 2 * HARI, tglMenunggu: now - 2 * HARI });

    // punya mahasiswa lain
    tambah({ mhs: 'Bagus Faaza Azhar Amin', nim: '1202230055', dosenId: 1, status: 'Menunggu', asal: 'Rekomendasi dosen',
      topik: 'Edge AI untuk deteksi anomali sensor smart greenhouse',
      judul: 'Edge AI untuk Deteksi Anomali Sensor Smart Greenhouse',
      abstrak: 'Deteksi anomali data sensor smart greenhouse secara real-time menggunakan model ringan yang dijalankan di perangkat edge.',
      tgl: now - 150 * JAM, tglMenunggu: now - 150 * JAM });
    tambah({ mhs: 'Muhammad Alawi', nim: '1202220101', dosenId: 1, status: 'Ditetapkan',
      topik: 'Wireless sensor network hidroponik',
      judul: 'Monitoring Kualitas Air Hidroponik Berbasis Wireless Sensor Network',
      abstrak: 'Pemantauan pH, EC, dan suhu larutan nutrisi hidroponik menggunakan jaringan sensor nirkabel.',
      tgl: now - 26 * HARI, tglMenunggu: now - 26 * HARI, tglKeputusan: now - 24 * HARI, tglSah: now - 23 * HARI });
    tambah({ mhs: 'Liobaldo', nim: '1202220145', dosenId: 1, status: 'Ditetapkan',
      topik: 'Data fusion multisensor',
      judul: 'Data Fusion Multisensor untuk Estimasi Kelembapan Tanah',
      abstrak: 'Penggabungan data beberapa sensor untuk meningkatkan akurasi estimasi kelembapan tanah.',
      tgl: now - 22 * HARI, tglMenunggu: now - 22 * HARI, tglKeputusan: now - 20 * HARI, tglSah: now - 18 * HARI });
    tambah({ mhs: 'Zaky Naufal', nim: '1202230078', dosenId: 4, status: 'Ditetapkan', asal: 'Rekomendasi dosen',
      topik: 'Student Health Risk',
      judul: 'Prediksi Student Health Risk dengan Machine Learning',
      abstrak: 'Klasifikasi risiko kesehatan mahasiswa dari data tabular menggunakan metode dari publikasi terindeks Scopus.',
      tgl: now - 5 * HARI, tglMenunggu: now - 5 * HARI, tglKeputusan: now - 3 * HARI, tglSah: now - 3 * HARI });
    tambah({ mhs: 'Rayyan Nabil Abrary', nim: '1202230134', dosenId: 6, status: 'Ditetapkan', asal: 'Rekomendasi dosen',
      topik: 'Image Processing / Computer Vision dengan Deep Learning',
      judul: 'Klasifikasi Penyakit Daun Tanaman dengan CNN',
      abstrak: 'Klasifikasi citra daun tanaman untuk mendeteksi penyakit menggunakan convolutional neural network.',
      tgl: now - 4 * HARI, tglMenunggu: now - 4 * HARI, tglKeputusan: now - 2 * HARI, tglSah: now - 2 * HARI });

    // data dosen. baseTerisi = terisi di data.js dikurangi pengajuan yg udah kecatat di atas
    DOSEN.forEach(function (d) {
      var tercatat = data.pengajuan.filter(function (p) {
        return p.dosenId === d.id && peranKe(p) === 1 && STATUS_SLOT.indexOf(p.status) != -1;
      }).length;
      var tercatat2 = data.pengajuan.filter(function (p) {
        return p.dosenId === d.id && peranKe(p) === 2 && STATUS_SLOT.indexOf(p.status) != -1;
      }).length;

      data.dosen[d.id] = {
        nama: d.nama,
        nidn: d.nidn,
        kuota: d.kuota,
        kuota2: d.kuota2,
        menerima: d.menerima,
        bidang: d.bidang.slice(),
        kata: d.kata.slice(),
        topik: d.topik.map(function (t) {
          return { id: t.id, judul: t.judul, desk: t.desk, aktif: true };
        }),
        baseTerisi: Math.max(0, d.terisi - tercatat),
        baseTerisi2: Math.max(0, d.terisi2 - tercatat2)
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
      { ico: 'bi-person-check', t: 'Dr. Farah Zakiyah Rahmanti, S.ST., M.T. menerima Rayyan Nabil Abrary. Pembimbing resmi ditetapkan.', w: now - 2 * HARI, baca: false },
      { ico: 'bi-person-check', t: 'Yohanes Setiawan, S.Si., M.Kom. menerima Zaky Naufal. Pembimbing resmi ditetapkan.', w: now - 3 * HARI, baca: false }
    ];

    return data;
  },

  // dipanggil sekali waktu app.js dimuat
  load: function () {
    // key versi lama udah ga dipake
    lsDel('sd_pengajuan');
    lsDel('sd_riwayat');
    lsDel('sd_db_v2');
    lsDel('sd_db_v3');
    lsDel('sd_db_v4');
    lsDel('sd_db_v5');
    lsDel('sd_db_v6');

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

  // hitung ulang terisi terus disalin ke array DOSEN
  // biar fungsi lama (sisa, statusDosen, dll) tetep jalan
  sinkron: function () {
    var data = this.data;

    // dosen yg ditambah koordinator ada di data bersama tapi belum ada di array DOSEN (data.js)
    for (var id in data.dosen) {
      if (!findDosen(id)) {
        var dd0 = data.dosen[id];
        DOSEN.push({ id: Number(id), nama: dd0.nama, nidn: dd0.nidn, bidang: [], kata: [], kuota: 0, kuota2: 0, terisi: 0, terisi2: 0, menerima: true, topik: [] });
      }
    }

    DOSEN.forEach(function (d) {
      var dd = data.dosen[d.id];
      if (!dd) return;
      d.nama = dd.nama;
      if (dd.nidn) d.nidn = dd.nidn;
      d.kuota = dd.kuota;
      d.kuota2 = dd.kuota2;
      d.menerima = dd.menerima;
      d.bidang = dd.bidang;
      d.kata = dd.kata;
      d.topik = dd.topik;
      d.terisi = dd.baseTerisi;
      d.terisi2 = dd.baseTerisi2;
    });

    data.pengajuan.forEach(function (p) {
      var d = findDosen(p.dosenId);
      if (!d || STATUS_SLOT.indexOf(p.status) == -1) return;
      if (peranKe(p) === 2) d.terisi2++;
      else d.terisi++;
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
    var berubah = false;

    this.data.pengajuan.forEach(function (p) {
      if (p.status != 'Menunggu') return;
      if (now - (p.tglMenunggu || p.tgl) <= BATAS_KEPUTUSAN) return;

      p.status = 'Kedaluwarsa';
      p.tglKeputusan = now;
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
      this.simpan();
    }
    return berubah;
  },

  terima: function (id) {
    this.segarkan();
    var p = this.cari(id);
    if (!p || p.status != 'Menunggu') {
      return { ok: false, msg: 'Pengajuan ini sudah tidak menunggu keputusan.' };
    }

    // dosen terima = langsung selesai, resmi ditetapkan tanpa nunggu koordinator (tanggal penetapan = tglSah)
    var d = findDosen(p.dosenId);
    p.status = 'Ditetapkan';
    p.tglKeputusan = Date.now();
    p.tglSah = p.tglKeputusan;

    if (p.me) {
      this.beritahu('mhs', 'bi-patch-check', 'Selamat! ' + d.nama + ' menerima pengajuan Anda. Pembimbing resmi ditetapkan pada ' + fmtDate(p.tglSah) + '.');
    }
    this.beritahu('koor', 'bi-person-check', d.nama + ' menerima ' + p.mhs + '. Pembimbing resmi ditetapkan.');
    this.simpan();
    return { ok: true, p: p };
  },

  // koordinator langsung nerima pengajuan yg masih Menunggu tanpa nunggu keputusan dosen (bypass, keputusan prodi)
  // hasilnya sama kayak dosen nerima: status jadi Ditetapkan dengan tanggal penetapan hari ini
  setujui: function (id) {
    this.segarkan();
    var p = this.cari(id);
    if (!p || p.status != 'Menunggu') {
      return { ok: false, msg: 'Pengajuan ini sudah tidak menunggu keputusan dosen.' };
    }

    var d = findDosen(p.dosenId);
    var now = Date.now();
    p.status = 'Ditetapkan';
    p.tglKeputusan = now;
    p.tglSah = now;
    p.disetujuiKoor = true;

    var ket = 'Pembimbing ' + peranKe(p);
    if (p.me) {
      this.beritahu('mhs', 'bi-patch-check', 'Koordinator menetapkan ' + d.nama + ' sebagai ' + ket + ' Anda sesuai keputusan prodi, tanpa menunggu keputusan dosen (tanggal penetapan ' + fmtDate(now) + ').');
    }
    if (d.id === ID_DOSEN_LOGIN) {
      this.beritahu('dosen', 'bi-patch-check', p.mhs + ' ditetapkan koordinator menjadi bimbingan Anda (' + ket + ') tanpa menunggu keputusan Anda.');
    }
    this.simpan();
    return { ok: true, p: p, dosen: d };
  },

  // koordinator mindahin pembimbing (1 atau 2) milik mahasiswa ke dosen mana aja sesuai keputusan prodi
  // bypass persetujuan dosen: boleh walau masih Menunggu / udah Ditetapkan, boleh ke dosen yg kuotanya penuh
  // atau lagi ga nerima bimbingan. yg ga boleh cuma dosen yg sama / dosen yg udah jadi pembimbing lain mahasiswa itu
  // hasil: status jadi Ditetapkan dengan tanggal penetapan hari ini
  pindahkan: function (id, dosenBaruId, alasan) {
    alasan = String(alasan || '').trim();
    if (alasan.length < 10) {
      return { ok: false, msg: 'Dasar keputusan prodi minimal 10 karakter (sekarang ' + alasan.length + ').' };
    }

    this.segarkan();
    var p = this.cari(id);
    if (!p || STATUS_AKTIF.indexOf(p.status) == -1) {
      return { ok: false, msg: 'Pembimbing ini sudah tidak aktif sehingga tidak bisa dipindahkan.' };
    }

    var baru = findDosen(dosenBaruId);
    if (!baru) {
      return { ok: false, msg: 'Pilih dosen tujuan terlebih dahulu.' };
    }
    if (baru.id === p.dosenId) {
      return { ok: false, msg: 'Dosen tujuan sama dengan dosen sekarang.' };
    }

    // mahasiswa yg sama ga boleh dapet dosen yg sama dua kali (pembimbing 1 & 2)
    var kembar = this.data.pengajuan.some(function (x) {
      return x.id !== p.id && x.nim === p.nim && x.dosenId === baru.id && STATUS_AKTIF.indexOf(x.status) != -1;
    });
    if (kembar) {
      return { ok: false, msg: p.mhs + ' sudah punya ' + baru.nama + ' sebagai pembimbing lain.' };
    }

    var lama = findDosen(p.dosenId);
    var now = Date.now();
    var melebihi = sisa(baru, peranKe(p)) === 0; // kuota dosen tujuan udah penuh, tetep diloloskan koordinator

    p.riwayatPindah = (p.riwayatPindah || []).concat([{ dari: lama.id, ke: baru.id, alasan: alasan, tgl: now, statusLama: p.status, tglSahLama: p.tglSah }]);
    p.dosenId = baru.id;
    p.status = 'Ditetapkan';
    p.tglKeputusan = p.tglKeputusan || now;
    p.tglSah = now;

    var ket = 'Pembimbing ' + peranKe(p);
    if (p.me) {
      this.beritahu('mhs', 'bi-arrow-left-right', 'Koordinator memindahkan ' + ket + ' Anda dari ' + lama.nama + ' ke ' + baru.nama + ' sesuai keputusan prodi (tanggal penetapan ' + fmtDate(p.tglSah) + ').');
    }
    if (lama.id === ID_DOSEN_LOGIN) {
      this.beritahu('dosen', 'bi-arrow-left-right', p.mhs + ' dipindahkan koordinator ke ' + baru.nama + ' (keputusan prodi). Slot Anda dilepas.');
    }
    if (baru.id === ID_DOSEN_LOGIN) {
      this.beritahu('dosen', 'bi-person-plus', p.mhs + ' ditetapkan koordinator menjadi bimbingan Anda (' + ket + ') sesuai keputusan prodi.');
    }
    this.simpan();
    return { ok: true, p: p, lama: lama, baru: baru, melebihi: melebihi };
  },

  // koordinator langsung menetapkan Pembimbing 2 untuk mahasiswa yg belum punya (judul & abstrak ikut pembimbing 1)
  tetapkanPembimbing2: function (nim, dosenId, alasan) {
    alasan = String(alasan || '').trim();
    if (alasan.length < 10) {
      return { ok: false, msg: 'Dasar keputusan prodi minimal 10 karakter (sekarang ' + alasan.length + ').' };
    }

    this.segarkan();
    var daftar = this.data.pengajuan.filter(function (x) {
      return x.nim === nim && STATUS_AKTIF.indexOf(x.status) != -1;
    });
    var p1 = daftar.find(function (x) { return peranKe(x) === 1; });
    var p2 = daftar.find(function (x) { return peranKe(x) === 2; });

    if (!p1) {
      return { ok: false, msg: 'Mahasiswa ini belum punya Pembimbing 1.' };
    }
    if (p2) {
      return { ok: false, msg: 'Mahasiswa ini sudah punya Pembimbing 2. Gunakan tombol Pindahkan.' };
    }

    var d = findDosen(dosenId);
    if (!d) {
      return { ok: false, msg: 'Pilih dosen tujuan terlebih dahulu.' };
    }
    if (d.id === p1.dosenId) {
      return { ok: false, msg: 'Pembimbing 2 harus dosen yang berbeda dari Pembimbing 1.' };
    }

    var now = Date.now();
    var melebihi = sisa(d, 2) === 0;

    // hasil Ditolak / Kedaluwarsa pembimbing 2 yg lama ga usah ditampilin lagi
    this.data.pengajuan.forEach(function (x) {
      if (x.nim === nim && peranKe(x) === 2) x.dilihat = true;
    });

    var p = {
      id: this.data.nextId++, me: p1.me, peran: 2, mhs: p1.mhs, nim: p1.nim, dosenId: d.id,
      topik: p1.topik, judul: p1.judul, abstrak: p1.abstrak, asal: 'Ditetapkan koordinator (keputusan prodi)', status: 'Ditetapkan',
      tgl: now, tglMenunggu: now, tglKeputusan: now, tglSah: now,
      alasan: '', dilihat: false,
      riwayatPindah: [{ dari: null, ke: d.id, alasan: alasan, tgl: now, statusLama: null, tglSahLama: null }]
    };
    this.data.pengajuan.push(p);

    if (p.me) {
      this.beritahu('mhs', 'bi-person-plus', 'Koordinator menetapkan ' + d.nama + ' sebagai Pembimbing 2 Anda sesuai keputusan prodi (tanggal penetapan ' + fmtDate(now) + ').');
    }
    if (d.id === ID_DOSEN_LOGIN) {
      this.beritahu('dosen', 'bi-person-plus', p.mhs + ' ditetapkan koordinator menjadi bimbingan Anda (Pembimbing 2) sesuai keputusan prodi.');
    }
    this.simpan();
    return { ok: true, p: p, baru: d, melebihi: melebihi };
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

    // slot otomatis kosong lagi (Ditolak ga makan slot)
    this.simpan();
    return { ok: true, p: p };
  },

  // koordinator nambah dosen baru. data = { nama, nidn, bidang: [index BIDANG], kata: [..], kuota1, kuota2, menerima }
  tambahDosen: function (data) {
    this.segarkan();

    var nama = String(data.nama || '').trim();
    var nidn = String(data.nidn || '').trim();

    if (nama.length < 3) {
      return { ok: false, msg: 'Nama dosen wajib diisi (minimal 3 karakter).' };
    }
    if (!/^\d{10}$/.test(nidn)) {
      return { ok: false, msg: 'NIDN harus 10 digit angka.' };
    }
    var sudahAda = DOSEN.some(function (d) {
      return d.nidn === nidn;
    });
    if (sudahAda) {
      return { ok: false, msg: 'NIDN ' + nidn + ' sudah terdaftar.' };
    }
    if (!data.bidang || data.bidang.length == 0) {
      return { ok: false, msg: 'Pilih minimal satu bidang keahlian.' };
    }
    var k1 = Number(data.kuota1);
    var k2 = Number(data.kuota2);
    if (!Number.isInteger(k1) || !Number.isInteger(k2) || k1 < 0 || k1 > 20 || k2 < 0 || k2 > 20) {
      return { ok: false, msg: 'Kuota Pembimbing 1 dan 2 harus bilangan bulat 0–20.' };
    }

    var idBaru = 0;
    for (var id in this.data.dosen) {
      idBaru = Math.max(idBaru, Number(id));
    }
    idBaru++;

    this.data.dosen[idBaru] = {
      nama: nama,
      nidn: nidn,
      kuota: k1,
      kuota2: k2,
      menerima: !!data.menerima,
      bidang: data.bidang.slice(),
      kata: (data.kata || []).slice(),
      topik: [],
      baseTerisi: 0,
      baseTerisi2: 0
    };
    this.simpan();
    return { ok: true, dosen: findDosen(idBaru) };
  },

  // koordinator ngubah status menerima / tidak menerima bimbingan. id = satu dosen, id kosong = semua dosen
  setMenerima: function (id, menerima) {
    this.segarkan();
    var ubah = [];

    for (var key in this.data.dosen) {
      if (id !== null && Number(key) !== Number(id)) continue;
      if (this.data.dosen[key].menerima === menerima) continue;
      this.data.dosen[key].menerima = menerima;
      ubah.push(Number(key));
    }

    if (ubah.indexOf(ID_DOSEN_LOGIN) != -1) {
      if (menerima) {
        this.beritahu('dosen', 'bi-toggle-on', 'Koordinator mengaktifkan status Anda: sekarang menerima bimbingan.');
      } else {
        this.beritahu('dosen', 'bi-toggle-off', 'Koordinator menonaktifkan status Anda: sekarang tidak menerima bimbingan.');
      }
    }
    if (ubah.length > 0) this.simpan();
    return ubah.length;
  },

  // peta = { idDosen: { k1: kuota pembimbing 1, k2: kuota pembimbing 2 } }
  setKuota: function (peta) {
    this.segarkan();
    for (var id in peta) {
      if (!this.data.dosen[id]) continue;
      this.data.dosen[id].kuota = peta[id].k1;
      this.data.dosen[id].kuota2 = peta[id].k2;
    }
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

// pengajuan ini buat pembimbing ke-berapa (data lama ga punya field peran, berarti 1)
function peranKe(p) {
  return p.peran || 1;
}

// dosen ini bisa dipilih jadi pembimbing 2: pembimbing 1 udah aktif, pembimbing 2 belum ada,
// dosennya beda, dan masih ada slot. topik / keahlian dosen ga dipertimbangin
function bisaPembimbing2(d) {
  if (!DB.data) return false;
  var p1 = State.p;
  if (!p1 || STATUS_SLOT.indexOf(p1.status) == -1) return false;
  if (State.aktif(2)) return false;
  if (p1.dosenId === d.id) return false;
  return d.menerima && sisa(d, 2) > 0;
}

// ================= STATE MAHASISWA =================
// pembungkus DB khusus mahasiswa yg login
// sesuai SRS MR-03: mahasiswa cuma boleh punya 1 pengajuan aktif per periode

var State = {
  // pengajuan aktif, atau hasil terakhir (Ditolak/Kedaluwarsa) yg belum ditutup
  // pembimbing 1
  get p() {
    return this.pilih(1);
  },

  // pembimbing 2
  get p2() {
    return this.pilih(2);
  },

  // pengajuan aktif / hasil terakhir untuk pembimbing ke-berapa (1 atau 2)
  pilih: function (peran) {
    var milikku = this.semua().filter(function (x) {
      return peranKe(x) === peran;
    });
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

  aktif: function (peran) {
    var p = this.pilih(peran || 1);
    return !!p && STATUS_AKTIF.indexOf(p.status) != -1;
  },

  // ini cuma simulasi, nanti di backend pake transaksi (SELECT ... FOR UPDATE) biar ga rebutan slot
  // data.peran = 1 (default) atau 2. pembimbing 2 bebas pilih dosen apa aja, judul/abstrak ikut pembimbing 1
  ajukan: function (data) {
    DB.segarkan();
    DB.cek();

    var peran = data.peran || 1;

    // 1. udah punya pengajuan aktif untuk peran ini
    if (this.aktif(peran)) {
      return { ok: false, msg: 'Anda sudah punya 1 pengajuan aktif untuk pembimbing ' + peran + ' pada periode ini.' };
    }

    // 2. di luar periode
    var per = periodeAktif();
    if (!per.ok) {
      return { ok: false, msg: per.msg };
    }

    if (peran == 2) {
      // pembimbing 2 baru bisa dipilih kalau pembimbing 1 udah diajukan (aktif)
      var p1 = this.p;
      if (!p1 || STATUS_SLOT.indexOf(p1.status) == -1) {
        return { ok: false, msg: 'Ajukan Dosen Pembimbing 1 terlebih dahulu sebelum memilih Pembimbing 2.' };
      }
      if (p1.dosenId === Number(data.dosenId)) {
        return { ok: false, msg: 'Pembimbing 2 harus dosen yang berbeda dari Pembimbing 1.' };
      }
      data.topik = p1.topik;
      data.judul = p1.judul;
      data.abstrak = p1.abstrak;
      data.asal = 'Pembimbing 2 (pilihan bebas)';
    } else {
      // judul / topik udah dipake mahasiswa lain
      var kembar = cariKembar(data.topik, data.judul);
      if (kembar.judul) {
        return { ok: false, msg: pesanJudulKembar(kembar.judul) };
      }
    }

    // 3. dosen ga nerima
    var d = findDosen(data.dosenId);
    if (!d.menerima) {
      return { ok: false, msg: 'Dosen sedang tidak menerima bimbingan.' };
    }

    // simulasi panel demo: slot terakhir keburu diambil mahasiswa lain
    if (DB.data.rebutNext === d.id) {
      DB.data.rebutNext = null;
      if (peran == 2) DB.data.dosen[d.id].baseTerisi2 += sisa(d, 2);
      else DB.data.dosen[d.id].baseTerisi += sisa(d, 1);
      DB.simpan();
    }

    // 4. kuota dosen penuh (termasuk keburu diambil mahasiswa lain) -> ditolak
    if (sisa(d, peran) === 0) {
      return { ok: false, msg: 'Kuota Pembimbing ' + peran + ' ' + d.nama + ' sudah penuh, pengajuan tidak bisa dikirim. Silakan pilih dosen lain yang masih punya slot.' };
    }

    // 5. bikin pengajuan
    DB.data.pengajuan.forEach(function (x) {
      if (x.me && peranKe(x) === peran) x.dilihat = true; // hasil lama ga usah ditampilin lagi
    });

    var now = Date.now();
    var p = {
      id: DB.data.nextId++, me: true, peran: peran, mhs: USERS.mhs.nama, nim: USERS.mhs.sub, dosenId: d.id,
      topik: data.topik, judul: data.judul, abstrak: data.abstrak, asal: data.asal, status: 'Menunggu',
      tgl: now, tglMenunggu: now, tglKeputusan: null, tglSah: null,
      alasan: '', dilihat: false
    };
    DB.data.pengajuan.push(p);
    DB.sinkron();

    var label = peran == 2 ? 'Pengajuan Pembimbing 2' : 'Pengajuan';
    DB.beritahu('mhs', 'bi-check-circle', label + ' terkirim. Slot dikunci, menunggu keputusan ' + d.nama + '.');
    if (d.id === ID_DOSEN_LOGIN) {
      DB.beritahu('dosen', 'bi-inbox', 'Pengajuan baru' + (peran == 2 ? ' (sebagai Pembimbing 2)' : '') + ' dari ' + p.mhs + ': "' + p.judul + '".');
    }

    DB.simpan();
    return { ok: true, status: p.status };
  },

  // hasil Ditolak / Kedaluwarsa ditutup biar bisa pilih dosen lain
  tutupHasil: function (peran) {
    DB.segarkan();
    var p = this.pilih(peran || 1);
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
    toast('Slot ' + d.nama + ' dilepas, sekarang bisa diajukan lagi.', 'dark');
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

    // yg diacak cuma dosen yg nerima dan belum ada pengajuan kecatat
    // biar angka di demo ga berantakan
    var pool = [];
    DOSEN.forEach(function (d) {
      var tercatat = DB.data.pengajuan.some(function (p) {
        return p.dosenId === d.id;
      });
      if (d.menerima && !tercatat && DB.data.rebutNext !== d.id) {
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

// ================= CEK KESAMAAN JUDUL / TOPIK =================
// pembanding: (1) pengajuan mahasiswa lain yg udah di-ACC dosen pembimbing 1 (Ditetapkan)
// dan (2) arsip judul & topik mahasiswa yg udah lulus (ARSIP di data.js)
// kemiripan = jaccard antar kata (udah tanpa stopword)
// judul >= batas -> DIBLOKIR (udah dipake), topik >= batas -> cuma PERINGATAN, tetep boleh diajukan
var BATAS_MIRIP = 0.6;
var STATUS_ACC = ['Ditetapkan'];

function jaccard(a, b) {
  var himA = new Set(tokenize(a));
  var himB = new Set(tokenize(b));
  if (himA.size == 0 || himB.size == 0) return 0;

  var irisan = 0;
  himA.forEach(function (w) {
    if (himB.has(w)) irisan++;
  });
  return irisan / (himA.size + himB.size - irisan);
}

// semua judul & topik yg udah "terpakai": pengajuan di-ACC mahasiswa lain + arsip lulusan
function daftarTerpakai() {
  var hasil = [];

  if (DB.data) {
    DB.data.pengajuan.forEach(function (p) {
      if (p.me || peranKe(p) !== 1 || STATUS_ACC.indexOf(p.status) == -1) return;
      hasil.push({ judul: p.judul, topik: p.topik, ket: 'pengajuan mahasiswa lain berstatus ' + p.status });
    });
  }

  ARSIP.forEach(function (a) {
    hasil.push({ judul: a.judul, topik: a.topik, ket: 'arsip TA lulusan ' + a.tahun });
  });
  return hasil;
}

// balikin { judul: cocok / null, topik: cocok / null }, cocok = { teks, ket, skor } yg paling mirip
function cariKembar(topik, judul) {
  topik = String(topik || '').trim();
  judul = String(judul || '').trim();

  var hasil = { judul: null, topik: null };
  daftarTerpakai().forEach(function (x) {
    var sJudul = judul && x.judul ? jaccard(judul, x.judul) : 0;
    if (sJudul >= BATAS_MIRIP && (!hasil.judul || sJudul > hasil.judul.skor)) {
      hasil.judul = { teks: x.judul, ket: x.ket, skor: sJudul };
    }

    var sTopik = topik && x.topik ? jaccard(topik, x.topik) : 0;
    if (sTopik >= BATAS_MIRIP && (!hasil.topik || sTopik > hasil.topik.skor)) {
      hasil.topik = { teks: x.topik, ket: x.ket, skor: sTopik };
    }
  });
  return hasil;
}

function pesanJudulKembar(m) {
  return 'Judul ini sudah digunakan (' + m.ket + ': "' + m.teks + '", kemiripan ' + Math.round(m.skor * 100) + '%) sehingga tidak bisa diajukan. Ganti judul Anda.';
}

function pesanTopikMirip(m) {
  return 'Peringatan: topik Anda mirip ' + Math.round(m.skor * 100) + '% dengan topik yang sudah ada (' + m.ket + ': "' + m.teks + '"). Tetap boleh diajukan, pastikan judul dan fokus penelitian Anda berbeda.';
}

function recommend(topik, judul, abstrak) {
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

  // 2. query dari topik + judul + abstrak, topik & judul dikali 2
  var q = tokenize(topik + ' ' + topik + ' ' + judul + ' ' + judul + ' ' + abstrak);

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

  // sesuai SRS: dosen yg masih ada slot ditaruh di atas, baru diurutkan skornya. max 5
  hasil.sort(function (a, b) {
    var adaSlotA = sisa(a.d, 1) > 0 ? 1 : 0;
    var adaSlotB = sisa(b.d, 1) > 0 ? 1 : 0;
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

    var infoSlot = '';
    if (sisa(r.d, 1) > 0) {
      infoSlot = `<span style="color:var(--green);font-weight:700">Sisa ${sisa(r.d, 1)} slot Pembimbing 1</span>`;
    } else {
      infoSlot = '<span style="color:var(--red-dark);font-weight:700">Kuota Pembimbing 1 penuh</span>';
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
      <div id="mjFormTA">
      <div class="mb-3"><label class="form-label fw-bold">Asal topik</label>
        <div class="d-flex gap-2 flex-wrap">
          <label class="chip" id="lblSendiri"><input type="radio" name="asal" value="sendiri" class="d-none" checked><i class="bi bi-lightbulb"></i> Usulan saya sendiri</label>
          <label class="chip" id="lblRek"><input type="radio" name="asal" value="rekom" class="d-none"><i class="bi bi-bookmark-star"></i> Topik rekomendasi dosen</label></div>
        <select id="mjTopik" class="form-select mt-2 d-none"></select></div>
      <div class="mb-3"><label class="form-label fw-bold">Topik</label>
        <input id="mjTopikTeks" class="form-control" maxlength="100" placeholder="Contoh: Klasifikasi citra medis"></div>
      <div class="mb-3"><div class="d-flex justify-content-between"><label class="form-label fw-bold">Judul TA</label><span class="wc" id="mjJudulWc">0/200</span></div>
        <input id="mjJudul" class="form-control" maxlength="200" placeholder="Tulis judul tugas akhir"></div>
      <div class="mb-1"><div class="d-flex justify-content-between"><label class="form-label fw-bold">Abstrak</label><span class="wc" id="mjAbsWc">0 kata (wajib 150–300)</span></div>
        <textarea id="mjAbs" rows="7" class="form-control" placeholder="Tulis abstrak 150–300 kata"></textarea></div>
      </div>
      <div class="warn-box mb-2" id="mjWarn" hidden></div>
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
  var pembimbingKe = 1; // 1 atau 2, diisi waktu modal dibuka

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
      $('#mjTopikTeks').value = t.judul;
      updateJudulWc();
      cekKembarForm();
    }
  }

  // cek langsung pas ngetik: kalau judul/topik udah dipake mahasiswa lain, tombol kirim dimatiin
  function cekKembarForm() {
    DB.segarkan();
    var k = cariKembar($('#mjTopikTeks').value, $('#mjJudul').value);
    $('#mjErr').textContent = k.judul ? pesanJudulKembar(k.judul) : '';
    $('#mjSubmit').disabled = !!k.judul;

    // topik mirip cuma peringatan, tombol kirim tetap aktif
    var warn = $('#mjWarn');
    warn.hidden = !k.topik;
    if (k.topik) warn.textContent = pesanTopikMirip(k.topik);
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
  $('#mjJudul').addEventListener('input', function () {
    updateJudulWc();
    cekKembarForm();
  });
  $('#mjTopikTeks').addEventListener('input', cekKembarForm);
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

    var peran = opt.peran || 1;
    pembimbingKe = peran;

    if (State.aktif(peran)) {
      var p = State.pilih(peran);
      var namaDosen = findDosen(p.dosenId).nama;
      if (p.status == 'Menunggu') {
        toast('Anda sudah punya 1 pengajuan aktif untuk pembimbing ' + peran + ' (' + p.status + ' ke ' + namaDosen + '). Tunggu keputusan dosen (maks. 7 × 24 jam) sebelum mengajukan lagi.', 'warning');
      } else {
        toast('Pembimbing ' + peran + ' Anda sudah ' + p.status.toLowerCase() + ' oleh ' + namaDosen + '. Tidak bisa mengajukan lagi pada periode ini.', 'warning');
      }
      return;
    }

    if (peran == 2) {
      var p1 = State.p;
      if (!p1 || STATUS_SLOT.indexOf(p1.status) == -1) {
        toast('Ajukan Dosen Pembimbing 1 terlebih dahulu sebelum memilih Pembimbing 2.', 'warning');
        return;
      }
      if (p1.dosenId === d.id) {
        toast('Pembimbing 2 harus dosen yang berbeda dari Pembimbing 1.', 'warning');
        return;
      }
    }

    if (!d.menerima) {
      toast(d.nama + ' sedang tidak menerima bimbingan.', 'warning');
      return;
    }

    // kuota penuh = ga bisa diajukan sama sekali
    if (sisa(d, peran) === 0) {
      toast('Kuota Pembimbing ' + peran + ' ' + d.nama + ' sudah penuh, tidak bisa mengajukan. Pilih dosen lain yang masih punya slot.', 'warning');
      return;
    }

    dosenDipilih = d;
    $('#mjTitle').textContent = peran == 2 ? 'Ajukan Pembimbing 2' : 'Ajukan Pembimbing';
    $('#mjSub').textContent = d.nama + ' · sisa ' + sisa(d, peran) + ' slot Pembimbing ' + peran;
    $('#mjSubmit').textContent = 'Kirim Pengajuan';
    $('#mjSubmit').className = 'btn btn-red';
    if (peran == 2) {
      // pembimbing 2 bebas, ga perlu cocok topik / keahlian. judul & abstrak ikut pembimbing 1
      $('#mjInfo').innerHTML = `<div class="hint-box"><i class="bi bi-people me-1"></i>Pembimbing 2 bebas dipilih tanpa harus sesuai topik atau keahlian dosen. Judul dan abstrak mengikuti pengajuan Pembimbing 1 Anda. Slot dikunci saat pengajuan dikirim dan dosen punya 7 × 24 jam untuk memutuskan.</div>`;
    } else {
      $('#mjInfo').innerHTML = `<div class="hint-box"><i class="bi bi-shield-check me-1"></i>Slot akan dikunci untuk Anda saat pengajuan dikirim. Dosen punya 7 × 24 jam untuk memutuskan.</div>`;
    }
    $('#mjFormTA').hidden = peran == 2;

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
    $('#mjTopikTeks').value = '';
    $('#mjAbs').value = '';
    $('#mjErr').textContent = '';
    $('#mjWarn').hidden = true;
    $('#mjSubmit').disabled = false;
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
    var err = $('#mjErr');

    // pembimbing 2: cukup dosennya, sisanya diisi otomatis di State.ajukan
    if (pembimbingKe == 2) {
      var r2 = State.ajukan({ dosenId: dosenDipilih.id, peran: 2 });
      if (!r2.ok) {
        err.textContent = r2.msg;
        return;
      }
      modal.hide();
      return;
    }

    var topik = $('#mjTopikTeks').value.trim();
    var judul = $('#mjJudul').value.trim();
    var abs = $('#mjAbs').value;
    var n = wordCount(abs);

    // validasi
    if (!topik) {
      err.textContent = 'Topik wajib diisi.';
      return;
    }
    if (!judul) {
      err.textContent = 'Judul wajib diisi.';
      return;
    }
    if (n < 150 || n > 300) {
      err.textContent = 'Abstrak harus 150–300 kata (sekarang ' + n + ' kata).';
      return;
    }

    var asal = pakaiRekom() ? 'Rekomendasi dosen' : 'Usulan mahasiswa';
    var r = State.ajukan({ dosenId: dosenDipilih.id, topik: topik, judul: judul, abstrak: abs, asal: asal });

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

    var bidangHTML = d.bidang.map(function (i) {
      return `<span class="tag">${BIDANG[i]}</span>`;
    }).join('');

    var kataHTML = d.kata.map(function (k) {
      return `<span class="tag">${esc(k)}</span>`;
    }).join('');

    var bisaP1 = d.menerima && sisa(d, 1) > 0;
    var disabled = bisaP1 ? '' : 'disabled';
    var topikHTML = topikAktif(d).map(function (t) {
      return `<div class="card-x pad mb-2"><b>${esc(t.judul)}</b><div class="small text-muted my-1">${esc(t.desk)}</div>
        <button class="btn btn-ghost btn-sm" ${disabled} onclick="openAjukan(${d.id},{topikId:'${t.id}'})">Pilih topik ini</button></div>`;
    }).join('');
    if (!topikHTML) {
      topikHTML = '<div class="small text-muted">Dosen belum menawarkan topik.</div>';
    }

    var tombol = '';
    if (!d.menerima) {
      tombol = '<button class="btn btn-ghost" disabled>Dosen tidak menerima bimbingan</button>';
    } else if (!bisaP1) {
      tombol = '<button class="btn btn-ghost" disabled>Kuota Pembimbing 1 penuh</button>';
    } else {
      tombol = `<button class="btn btn-red" onclick="openAjukan(${d.id})">Ajukan dengan topik sendiri</button>`;
    }

    $('#ocBody').innerHTML = `
      <div class="d-flex gap-3 align-items-center mb-3">${avatar(d,'lg')}<div><h5 class="fw-bold mb-1">${esc(d.nama)}</h5><div class="text-muted small">NIDN ${d.nidn}</div>
        <span class="badge-s ${st} mt-2 d-inline-block">${labelStatus}</span></div></div>
      <div class="card-x pad mb-3"><div class="d-flex justify-content-between"><b>Kuota Pembimbing 1</b><span>${d.terisi}/${d.kuota}</span></div>
        <div class="slots">${slotHTML(d.kuota, d.terisi)}</div>
        <div class="small text-muted mb-3">Sisa ${sisa(d, 1)} slot</div>
        <div class="d-flex justify-content-between"><b>Kuota Pembimbing 2</b><span>${d.terisi2}/${d.kuota2}</span></div>
        <div class="slots">${slotHTML(d.kuota2, d.terisi2)}</div>
        <div class="small text-muted">Sisa ${sisa(d, 2)} slot</div></div>
      <div class="filter-label mt-0">Bidang keahlian</div>${bidangHTML}
      <div class="filter-label">Kata kunci</div>${kataHTML}
      <div class="filter-label">Topik yang ditawarkan</div>
      ${topikHTML}
      <div class="d-grid gap-2 mt-3">${tombol}${bisaPembimbing2(d) ? `<button class="btn btn-outline-dark" onclick="openAjukan(${d.id},{peran:2})">Pilih sebagai Pembimbing 2</button>` : ''}</div>`;

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
  if (st == 'nonaktif') {
    badge = 'TIDAK MENERIMA';
    tombol = `<button class="btn btn-ghost" disabled>Tidak menerima</button>`;
  } else {
    badge = st == 'tersedia' ? 'TERSEDIA' : 'PENUH';
    if (sisa(d, 1) > 0) {
      tombol = `<button class="btn btn-red" onclick="openAjukan(${d.id})"><i class="bi bi-send me-1"></i>Ajukan Pembimbing 1</button>`;
    } else {
      tombol = `<button class="btn btn-ghost" disabled>Kuota Pembimbing 1 penuh</button>`;
    }
  }

  // pembimbing 2 bebas pilih dosen mana aja yg masih ada slot
  if (bisaPembimbing2(d)) {
    tombol += `<button class="btn btn-outline-dark" onclick="openAjukan(${d.id},{peran:2})"><i class="bi bi-person-plus me-1"></i>Pilih sbg Pembimbing 2</button>`;
  }

  var bidangHTML = '';
  for (var i = 0; i < d.bidang.length; i++) {
    bidangHTML += `<span class="tag">${BIDANG[d.bidang[i]]}</span>`;
  }

  return `<div class="card-x dosen-card ${st=='tersedia'?'ok':''} ${flash}" data-id="${d.id}">
    ${avatar(d)}
    <div class="flex-grow-1 min-w-0">
      <div class="d-flex justify-content-between align-items-start gap-2"><div><h4>${esc(d.nama)}</h4><div class="nidn">NIDN ${d.nidn}</div></div><span class="badge-s ${st}">${badge}</span></div>
      <div class="mt-2">${bidangHTML}</div>
      <div class="slots">${slotHTML(d.kuota, d.terisi)}</div>
      <div class="slot-text"><b>Pembimbing 1</b> · Terisi <b>${d.terisi}</b> · Sisa <b>${sisa(d, 1)}</b> / Kuota <b>${d.kuota}</b></div>
      <div class="slots">${slotHTML(d.kuota2, d.terisi2)}</div>
      <div class="slot-text"><b>Pembimbing 2</b> · Terisi <b>${d.terisi2}</b> · Sisa <b>${sisa(d, 2)}</b> / Kuota <b>${d.kuota2}</b></div>
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
