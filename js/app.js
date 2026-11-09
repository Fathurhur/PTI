// app.js
// isinya fungsi2 umum yg dipake di semua halaman
// (API backend Laravel, navbar, toast, data bersama, modal ajukan, sesi)

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
  return String(teks == null ? '' : teks).replace(/[&<>"']/g, function (c) {
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
  if (!tgl) return '-';
  return new Date(tgl).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// localStorage dibungkus try catch, soalnya kadang error kalo mode incognito
// (sekarang cuma dipakai buat preferensi tampilan, data asli ada di server)
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

// warna avatar dosen
var AV_COLORS = ['#D9132B', '#2457C5', '#12805C', '#7A3FC4', '#C25B00', '#0E7490', '#9D174D', '#4D5B0F'];

function avColor(id) {
  return AV_COLORS[(Math.abs(Number(id) || 1) - 1) % AV_COLORS.length];
}

// ambil inisial nama, gelar Dr. dibuang dulu
function initials(nama) {
  var kata = String(nama || '?').replace(/^Dr\.\s*/, '').split(' ');
  var hasil = '';
  for (var i = 0; i < kata.length; i++) {
    if (kata[i] == '') continue;
    hasil += kata[i][0];
    if (hasil.length == 2) break;
  }
  return hasil.toUpperCase();
}

// kuota dosen per peran (sudah termasuk slot tambahan koordinator): kuota = pembimbing 1, kuota2 = pembimbing 2
function kuotaPeran(d, peran) {
  return peran == 2 ? d.kuota2 : d.kuota;
}

// sisa slot dosen per peran
function sisa(d, peran) {
  var terisi = peran == 2 ? d.terisi2 : d.terisi;
  return Math.max(0, kuotaPeran(d, peran) - terisi);
}

function statusDosen(d) {
  if (!d.menerima) return 'nonaktif';
  if (sisa(d, 1) > 0 || sisa(d, 2) > 0) return 'tersedia';
  return 'penuh';
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

// dosen yg ga ketemu (misal belum dimuat) diganti data kosong biar tampilan ga error
function dosenAtau(id) {
  return findDosen(id) || { id: Number(id) || 0, nama: 'Dosen', nidn: '-', bidang: [], kata: [], topik: [], kuota: 0, kuota2: 0, terisi: 0, terisi2: 0, menerima: false, peminatan: '-' };
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

  setTimeout(function () {
    t.style.opacity = '0';
    t.style.transition = '.3s';
    setTimeout(function () {
      t.remove();
    }, 300);
  }, 4500);
}

// ================= API BACKEND (Laravel) =================
// halaman disajikan Laravel di origin yang sama (http://127.0.0.1:8000/login.html),
// jadi cookie sesi ikut terkirim otomatis. Setiap POST/PUT/DELETE wajib membawa token CSRF (MR-08).
var API_BASE = window.API_BASE || 'api';

var Api = {
  token: null,

  csrf: async function (paksa) {
    if (this.token && !paksa) return this.token;
    var res = await fetch(API_BASE + '/csrf', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    var data = await res.json();
    this.token = data.csrf_token;
    return this.token;
  },

  // hasil: { ok, status, data } ; pesan error dari server ada di data.pesan / data.message / data.errors
  req: async function (method, path, body, opt) {
    opt = opt || {};
    var headers = { Accept: 'application/json' };
    var isi = undefined;

    if (body instanceof FormData) {
      isi = body;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      isi = JSON.stringify(body);
    }
    if (method !== 'GET') {
      headers['X-CSRF-TOKEN'] = await this.csrf();
    }

    var res;
    try {
      res = await fetch(API_BASE + path, { method: method, headers: headers, body: isi, credentials: 'same-origin' });
    } catch (e) {
      return { ok: false, status: 0, data: { pesan: 'Tidak bisa terhubung ke server. Pastikan "php artisan serve" sedang berjalan.' } };
    }

    // token CSRF kedaluwarsa (mis. setelah login ulang): ambil token baru lalu coba sekali lagi
    if (res.status === 419 && !opt.ulang) {
      await this.csrf(true);
      return this.req(method, path, body, Object.assign({}, opt, { ulang: true }));
    }

    var data = {};
    var tipe = res.headers.get('content-type') || '';
    if (tipe.indexOf('application/json') !== -1) {
      data = await res.json();
    }

    if (res.status === 401 && !opt.bolehTanpaLogin) {
      sesiHabis();
    }

    return { ok: res.ok, status: res.status, data: data };
  },

  get: function (path, opt) { return this.req('GET', path, undefined, opt); },
  post: function (path, body, opt) { return this.req('POST', path, body === undefined ? {} : body, opt); },
  put: function (path, body, opt) { return this.req('PUT', path, body, opt); },
  del: function (path, opt) { return this.req('DELETE', path, undefined, opt); }
};

// ambil pesan error yg enak dibaca dari respons server
function pesanError(r, cadangan) {
  var d = r.data || {};
  if (d.errors) {
    var semua = [];
    Object.keys(d.errors).forEach(function (k) {
      semua = semua.concat(d.errors[k]);
    });
    if (semua.length) return semua.join(' ');
  }
  return d.pesan || d.message || cadangan || 'Terjadi kesalahan (kode ' + r.status + ').';
}

// ================= DATA BERSAMA (DB) =================
// semua data diambil dari backend. halaman cuma baca dari DB.data / DOSEN / PERIODE
// lalu digambar ulang tiap ada event 'pengajuan:changed' / 'live:update'

var JAM = 60 * 60 * 1000;
var HARI = 24 * JAM;
var BATAS_KEPUTUSAN = 7 * HARI; // dosen punya 7 x 24 jam buat mutusin (MR-03)

// status yg dianggap "aktif" punya mahasiswa (MR-03)
var STATUS_AKTIF = ['Menunggu', 'Antrean', 'Diterima', 'Ditetapkan'];
// status yg makan slot dosen (MR-04)
var STATUS_SLOT = ['Menunggu', 'Diterima', 'Ditetapkan'];

// peran halaman yg lagi dibuka (mhs / dosen / koor), diisi di siapkan()
var ROLE_SAAT_INI = null;
var SESI = { user: null };
var PERAN_API = { mahasiswa: 'mhs', dosen: 'dosen', koordinator: 'koor' };

var IKON_NOTIF = {
  pengajuan_baru: 'bi-inbox',
  pengajuan_diterima: 'bi-patch-check',
  pengajuan_ditolak: 'bi-x-circle',
  pengajuan_kedaluwarsa: 'bi-hourglass-bottom',
  promosi_antrean: 'bi-arrow-up-circle',
  slot_tambahan: 'bi-plus-circle',
  pemindahan: 'bi-arrow-left-right',
  penetapan: 'bi-patch-check',
  status_menerima: 'bi-toggle-on'
};

// kirim event biar halaman gambar ulang
function kirimEvent() {
  ['pengajuan:changed', 'live:update', 'notif:changed'].forEach(function (nama) {
    document.dispatchEvent(new Event(nama));
  });
}

// jenis toast ditebak dari ikon notifnya
function tipeNotif(ico) {
  if (/check|patch|arrow-up|plus/.test(ico)) return 'success';
  if (/x-circle/.test(ico)) return 'danger';
  if (/exclamation|hourglass-bottom|calendar-x|question/.test(ico)) return 'warning';
  return 'dark';
}

// index bidang keahlian di BIDANG, bidang yg belum ada otomatis ditambahin
function idxBidang(nama) {
  var i = BIDANG.indexOf(nama);
  if (i === -1) {
    BIDANG.push(nama);
    i = BIDANG.length - 1;
  }
  return i;
}

function waktuMs(iso) {
  return iso ? Date.parse(iso) : null;
}

var DB = {
  data: {
    pengajuan: [],
    antrean: [],
    notif: { mhs: [], dosen: [], koor: [] },
    periode: null,
    peminatan: []
  },
  terakhir: Date.now(),
  notifTerlihat: null, // id notif yg sudah pernah ditampilkan (biar toast cuma untuk yg baru)

  // MR-01: dashboard slot real-time (dipolling tiap 5 detik)
  muatDashboard: async function () {
    var r = await Api.get('/dashboard');
    if (!r.ok) return false;

    var lama = {};
    DOSEN.forEach(function (d) {
      lama[d.id] = d;
    });

    var baru = r.data.dosen.map(function (x) {
      var p1 = x.pembimbing_1;
      var p2 = x.pembimbing_2;
      var d = lama[x.id] || { id: x.id };

      // kasih efek kedip kalo jumlah terisinya berubah
      if (lama[x.id] && (lama[x.id].terisi !== p1.terisi || lama[x.id].terisi2 !== p2.terisi)) {
        Live.flash.add(x.id);
      }

      return Object.assign(d, {
        nama: x.nama,
        nidn: x.nidn,
        peminatan: x.peminatan_utama,
        bidangNama: x.bidang_keahlian || [],
        bidang: (x.bidang_keahlian || []).map(idxBidang),
        kata: x.kata_kunci || [],
        menerima: !!x.menerima,
        kuota: p1.kuota + p1.tambahan,
        kuota2: p2.kuota + p2.tambahan,
        kuotaDasar: p1.kuota,
        kuotaDasar2: p2.kuota,
        tambahan: p1.tambahan,
        tambahan2: p2.tambahan,
        labelKuota: p1.label_kuota,
        labelKuota2: p2.label_kuota,
        terisi: p1.terisi,
        terisi2: p2.terisi,
        antrean: p1.antrean,
        antrean2: p2.antrean,
        topik: (x.topik || []).map(function (t) {
          return { id: t.id, judul: t.judul, desk: t.deskripsi || '-', aktif: true, tersedia: t.tersedia };
        })
      });
    });

    DOSEN.length = 0;
    baru.forEach(function (d) {
      DOSEN.push(d);
    });

    var pr = r.data.periode;
    this.data.periode = pr ? {
      id: pr.id, nama: pr.nama, kode: pr.kode, mulai: pr.tgl_mulai, selesai: pr.tgl_selesai,
      buka: true, berjalan: pr.berjalan, ambang: pr.ambang_kemiripan, jumlahMhs: pr.jumlah_mhs_proposal
    } : null;
    PERIODE = this.data.periode || { nama: '-', kode: '-', mulai: '', selesai: '', buka: false };
    this.data.peminatan = r.data.peminatan || [];
    return true;
  },

  // pengajuan sesuai peran (mahasiswa miliknya, dosen yg ditujukan, koordinator semua) - MR-08
  muatPengajuan: async function () {
    var r = await Api.get('/pengajuan');
    if (!r.ok) return false;

    var tutup = idTertutup();
    var mhsId = SESI.user ? SESI.user.mahasiswa_id : null;

    this.data.pengajuan = r.data.pengajuan.map(function (x) {
      return {
        id: x.id,
        me: mhsId !== null && x.mahasiswa_id === mhsId,
        peran: Number(x.peran),
        mhs: x.mahasiswa,
        nim: x.nim,
        mahasiswaId: x.mahasiswa_id,
        dosenId: x.dosen_id,
        topik: x.judul,
        topikId: x.topik_id,
        judul: x.judul,
        abstrak: x.abstrak,
        asal: x.asal_topik,
        peminatan: x.peminatan,
        status: x.status,
        tgl: waktuMs(x.dibuat_at),
        tglMenunggu: waktuMs(x.dibuat_at),
        kedaluwarsa: waktuMs(x.kedaluwarsa_at),
        tglKeputusan: waktuMs(x.diputuskan_at),
        tglSah: waktuMs(x.tgl_sah),
        nomorSurat: x.nomor_surat,
        alasan: x.alasan_tolak || '',
        dilihat: tutup.indexOf(x.id) !== -1
      };
    });
    return true;
  },

  // MR-05: antrean milik mahasiswa, ditampilkan sebagai pengajuan berstatus "Antrean"
  muatAntrean: async function () {
    var r = await Api.get('/antrean');
    if (!r.ok) return false;
    this.data.antrean = r.data.antrean.filter(function (a) {
      return a.status === 'menunggu';
    }).map(function (a) {
      var d = DOSEN.find(function (x) { return x.nama === a.dosen; });
      return {
        id: 'a' + a.id, antreanId: a.id, me: true, peran: Number(a.peran), mhs: SESI.user.nama, nim: SESI.user.nim,
        dosenId: d ? d.id : 0, topik: a.judul, judul: a.judul, abstrak: '', asal: 'Antrean (FIFO)', status: 'Antrean',
        posisi: a.posisi, tgl: waktuMs(a.masuk_at), tglMenunggu: waktuMs(a.masuk_at), alasan: '', dilihat: false
      };
    });
    return true;
  },

  // MR-05: notifikasi in-app
  muatNotif: async function () {
    var r = await Api.get('/notifikasi');
    if (!r.ok || !ROLE_SAAT_INI) return false;

    var list = r.data.notifikasi.map(function (n) {
      return { id: n.id, ico: IKON_NOTIF[n.jenis] || 'bi-bell', judul: n.judul, t: n.isi, w: waktuMs(n.dibuat_at), baca: !!n.dibaca };
    });

    // toast untuk notif baru yg muncul sejak polling sebelumnya
    if (this.notifTerlihat) {
      var self = this;
      list.filter(function (n) {
        return !n.baca && !self.notifTerlihat.has(n.id);
      }).slice(0, 3).forEach(function (n) {
        toast(n.t, tipeNotif(n.ico));
      });
    }
    this.notifTerlihat = new Set(list.map(function (n) { return n.id; }));

    this.data.notif[ROLE_SAAT_INI] = list;
    return true;
  },

  // ambil semua data yg dibutuhkan halaman ini, lalu kabari halaman buat gambar ulang
  segarkan: async function () {
    await Promise.all([this.muatDashboard(), this.muatPengajuan(), this.muatNotif()]);

    // antrean butuh daftar dosen buat nyari id dosennya
    if (ROLE_SAAT_INI === 'mhs') await this.muatAntrean();

    this.terakhir = Date.now();

    // halaman cuma digambar ulang kalau datanya beneran berubah
    var jejak = JSON.stringify([DOSEN, this.data.pengajuan, this.data.antrean, this.data.periode, this.data.peminatan, this.data.notif]);
    if (jejak !== this.jejak) {
      this.jejak = jejak;
      kirimEvent();
    }
    setTimeout(function () {
      Live.flash.clear();
    }, 100);
  },

  cari: function (id) {
    return this.data.pengajuan.find(function (p) {
      return p.id === Number(id);
    });
  },

  // MR-03: dosen menerima / menolak (alasan min. 10 karakter)
  putuskan: async function (id, keputusan, alasan) {
    var r = await Api.post('/pengajuan/' + id + '/putuskan', { keputusan: keputusan, alasan: alasan || null });
    if (!r.ok) return { ok: false, msg: pesanError(r) };
    await this.segarkan();
    return { ok: true, p: this.cari(id) };
  },

  terima: function (id) {
    return this.putuskan(id, 'terima');
  },

  tolak: function (id, alasan) {
    alasan = String(alasan || '').trim();
    if (alasan.length < 10) {
      return Promise.resolve({ ok: false, msg: 'Alasan penolakan minimal 10 karakter (sekarang ' + alasan.length + ').' });
    }
    return this.putuskan(id, 'tolak', alasan);
  },

  // ditandai kebaca waktu dropdown notif dibuka
  tandaiBaca: function () {
    var list = this.data.notif[ROLE_SAAT_INI] || [];
    if (!list.some(function (n) { return !n.baca; })) return;
    list.forEach(function (n) {
      n.baca = true;
    });
    Api.post('/notifikasi/baca-semua');
  }
};

// id pengajuan Ditolak/Kedaluwarsa yg kartunya sudah ditutup mahasiswa (preferensi tampilan per akun)
function kunciTutup() {
  return 'sd_tutup_' + (SESI.user ? SESI.user.id : 0);
}

function idTertutup() {
  try {
    return JSON.parse(lsGet(kunciTutup())) || [];
  } catch (e) {
    return [];
  }
}

// pengajuan ini buat pembimbing ke-berapa
function peranKe(p) {
  return p.peran || 1;
}

// dosen ini bisa dipilih jadi pembimbing 2: pembimbing 1 udah aktif, pembimbing 2 belum ada,
// dosennya beda, dan masih ada slot. topik / keahlian dosen ga dipertimbangin (MR-10)
function bisaPembimbing2(d) {
  var p1 = State.p;
  if (!p1 || STATUS_SLOT.indexOf(p1.status) == -1) return false;
  if (State.aktif(2)) return false;
  if (p1.dosenId === d.id) return false;
  return d.menerima && sisa(d, 2) > 0;
}

// ================= STATE MAHASISWA =================
// pembungkus DB khusus mahasiswa yg login
// SRS MR-03: 1 pengajuan aktif per peran per periode (Menunggu, Antrean, Diterima, Ditetapkan)

var State = {
  get p() {
    return this.pilih(1);
  },

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

  // semua pengajuan + antrean milik mahasiswa, terbaru di atas
  semua: function () {
    return DB.data.pengajuan.filter(function (p) {
      return p.me;
    }).concat(DB.data.antrean).sort(function (a, b) {
      return (b.tgl || 0) - (a.tgl || 0);
    });
  },

  aktif: function (peran) {
    var p = this.pilih(peran || 1);
    return !!p && STATUS_AKTIF.indexOf(p.status) != -1;
  },

  // MR-03/04/09/10: kirim pengajuan. data = { dosenId, peran, judul, abstrak, topikId }
  ajukan: async function (data) {
    var d = findDosen(data.dosenId);
    var body = {
      dosen_id: data.dosenId,
      peran: String(data.peran || 1),
      peminatan: data.peran == 2 ? null : d.peminatan, // P1 mengikuti peminatan utama dosen
      judul: data.judul,
      abstrak: data.abstrak,
      topik_id: data.topikId || null
    };

    var r = await Api.post('/pengajuan', body);
    if (!r.ok) {
      return {
        ok: false,
        msg: pesanError(r),
        kode: r.data.kode,
        saran: r.data.saran || [],
        saranPeran: r.data.saran_peran_lain || null,
        tawaranAntrean: !!r.data.tawaran_antrean
      };
    }

    toast(r.data.pesan, 'success');
    await DB.segarkan();
    return { ok: true };
  },

  // MR-05: masuk antrean FIFO saat slot dosen penuh
  masukAntrean: async function (data) {
    var d = findDosen(data.dosenId);
    var r = await Api.post('/antrean', {
      dosen_id: data.dosenId,
      peran: String(data.peran || 1),
      peminatan: data.peran == 2 ? null : d.peminatan,
      judul: data.judul,
      abstrak: data.abstrak
    });
    if (!r.ok) return { ok: false, msg: pesanError(r), kode: r.data.kode };

    toast(r.data.pesan + ' Posisi Anda: ' + r.data.posisi + '.', 'success');
    await DB.segarkan();
    return { ok: true };
  },

  // hasil Ditolak / Kedaluwarsa ditutup biar bisa pilih dosen lain (cuma tampilan)
  tutupHasil: function (peran) {
    var p = this.pilih(peran || 1);
    if (p && (p.status == 'Ditolak' || p.status == 'Kedaluwarsa')) {
      var daftar = idTertutup();
      daftar.push(p.id);
      lsSet(kunciTutup(), JSON.stringify(daftar));
      p.dilihat = true;
      kirimEvent();
    }
  }
};

// ================= LIVE UPDATE (MR-01) =================
// polling ke server tiap 5 detik
var Live = {
  flash: new Set(),
  jalan: false,

  start: function () {
    if (this.jalan) return;
    this.jalan = true;

    setInterval(function () {
      if (!document.hidden) DB.segarkan();
    }, 5000);

    // update tulisan "x dtk lalu"
    setInterval(function () {
      var detik = Math.round((Date.now() - DB.terakhir) / 1000);
      $$('.live-ago').forEach(function (el) {
        el.textContent = detik <= 1 ? 'baru saja' : detik + ' dtk lalu';
      });
    }, 1000);
  }
};

// ================= REKOMENDASI DOSEN (MR-06) =================
// dihitung di server (TF-IDF + cosine similarity), di sini cuma ditampilkan
async function rekomendasiApi(topik, judul, abstrak) {
  var r = await Api.post('/rekomendasi', { judul: judul, abstrak: (topik + ' ' + abstrak).trim(), peran: '1' });
  if (!r.ok) return { ok: false, msg: pesanError(r) };

  var hasil = [];
  r.data.rekomendasi.forEach(function (x) {
    var d = findDosen(x.id);
    if (d && x.skor_persen > 0) hasil.push({ d: d, skor: Math.round(x.skor_persen) });
  });
  return { ok: true, hasil: hasil };
}

// ================= CEK KEMIRIPAN JUDUL (MR-09) =================
async function cekKemiripanApi(judul, abstrak) {
  var r = await Api.post('/cek-kemiripan', { judul: judul, abstrak: abstrak || '' });
  if (!r.ok) return { lolos: true, pesan: '', skor_persen: 0, gagal: true };
  return r.data;
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
      infoSlot = '<span style="color:var(--red-dark);font-weight:700">Penuh – masuk antrian</span>';
    }

    html += `<div class="rek-item">
      <div class="rek-rank">${i + 1}</div>${avatar(r.d, 'xs')}
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

// ================= NAVBAR =================
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

// MR-08: cek sesi ke server, cocokkan peran, muat data, lalu bikin navbar
// hasil Promise<boolean>: false kalau halaman dialihkan (belum login / beda peran)
async function siapkan(role, active) {
  ROLE_SAAT_INI = role;
  document.documentElement.style.visibility = 'hidden';

  var r = await Api.get('/saya', { bolehTanpaLogin: true });
  if (r.status === 401) {
    location.replace('login.html');
    return false;
  }
  if (!r.ok) {
    document.documentElement.style.visibility = '';
    document.body.innerHTML = `<main class="page"><div class="card-x pad text-center"><h5 class="fw-bold">Server tidak dapat dihubungi</h5><p class="text-muted">${esc(pesanError(r))}</p></div></main>`;
    return false;
  }

  SESI.user = r.data.user;
  if (PERAN_API[SESI.user.peran] !== role) {
    location.replace('403.html');
    return false;
  }

  await DB.segarkan();
  bangunNavbar(role, active);
  document.documentElement.style.visibility = '';
  return true;
}

function bangunNavbar(role, active) {
  var u = SESI.user;
  var sub = role == 'mhs' ? u.nim : role == 'dosen' ? 'NIDN ' + u.nidn : 'Koordinator TA / Kaprodi';

  var links = '';
  MENU[role].forEach(function (m) {
    var kelas = m[2] === active ? 'active' : '';
    links += `<li><a href="${m[0]}" class="${kelas}" data-key="${m[2]}">${m[1]}</a></li>`;
  });

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
        <div class="av sm" style="background:${warnaAv}">${initials(u.nama)}</div>
        <div class="meta"><b>${esc(u.nama)}</b><span>${esc(sub)}</span></div><i class="bi bi-chevron-down small text-muted"></i></button>
        <ul class="dropdown-menu dropdown-menu-end"><li><a class="dropdown-item" href="#" id="btnKeluar"><i class="bi bi-box-arrow-right me-2"></i>Keluar</a></li></ul></div>
    </div>
    <button class="icon-btn nav-toggle" id="navToggle" aria-label="Menu"><i class="bi bi-list fs-5"></i></button>
  </div></header>`;

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
    DB.tandaiBaca();
    $('#notifDot').hidden = true;
  });
  $('#notifDrop').addEventListener('hidden.bs.dropdown', function () {
    notifTerbuka = false;
    renderNotif();
  });
  document.addEventListener('notif:changed', function () {
    if (!notifTerbuka) renderNotif();
  });
}

// isi dropdown notif
function renderNotif() {
  var wadah = $('#notifList');
  if (!wadah) return;

  var list = DB.data.notif[ROLE_SAAT_INI] || [];
  if (list.length == 0) {
    wadah.innerHTML = '<div class="notif-item text-muted">Belum ada notifikasi.</div>';
  } else {
    var html = '';
    list.slice(0, 15).forEach(function (n) {
      html += `<div class="notif-item ${n.baca ? '' : 'baru'}"><i class="bi ${n.ico}"></i><div><b>${esc(n.judul)}</b><br>${esc(n.t)}<br><small>${waktuLalu(n.w)}</small></div></div>`;
    });
    wadah.innerHTML = html;
  }

  $('#notifDot').hidden = !list.some(function (n) {
    return !n.baca;
  });
}

// buat halaman yg pake tab (dosen & koordinator), section yg tampil sesuai #hash di url
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

// tombol loading sementara request jalan
function tombolSibuk(btn, sibuk, teksSibuk) {
  if (!btn) return;
  if (sibuk) {
    btn.dataset.teks = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${teksSibuk || 'Memproses...'}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.teks) btn.innerHTML = btn.dataset.teks;
  }
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
      <div class="mb-3" id="mjAsalWrap"><label class="form-label fw-bold">Asal topik</label>
        <div class="d-flex gap-2 flex-wrap">
          <label class="chip" id="lblSendiri"><input type="radio" name="asal" value="sendiri" class="d-none" checked><i class="bi bi-lightbulb"></i> Usulan saya sendiri</label>
          <label class="chip" id="lblRek"><input type="radio" name="asal" value="rekom" class="d-none"><i class="bi bi-bookmark-star"></i> Topik rekomendasi dosen</label></div>
        <select id="mjTopik" class="form-select mt-2 d-none"></select></div>
      <div class="mb-3"><div class="d-flex justify-content-between"><label class="form-label fw-bold">Judul TA</label><span class="wc" id="mjJudulWc">0/200</span></div>
        <input id="mjJudul" class="form-control" maxlength="200" placeholder="Tulis judul tugas akhir"></div>
      <div class="mb-1"><div class="d-flex justify-content-between"><label class="form-label fw-bold">Abstrak</label><span class="wc" id="mjAbsWc">0 kata (wajib 150–300)</span></div>
        <textarea id="mjAbs" rows="7" class="form-control" placeholder="Tulis abstrak 150–300 kata"></textarea></div>
      </div>
      <div class="hint-box mb-2" id="mjWarn" hidden></div>
      <div class="invalid-feedback d-block" id="mjErr"></div>
      <div id="mjAksiLain" class="mt-2"></div>
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
  var pembimbingKe = 1;   // 1 atau 2
  var modeAntrean = false; // true = masuk antrean (slot penuh), false = ajukan langsung
  var timerMirip = null;
  var nomorCek = 0;

  function pakaiRekom() {
    return $('input[name=asal]:checked').value == 'rekom';
  }

  function topikTerpilih() {
    var idTopik = Number($('#mjTopik').value);
    return topikAktif(dosenDipilih).find(function (x) {
      return x.id === idTopik;
    });
  }

  function updateJudulWc() {
    $('#mjJudulWc').textContent = $('#mjJudul').value.length + '/200';
  }

  function updateAbsWc() {
    var n = wordCount($('#mjAbs').value);
    var el = $('#mjAbsWc');
    el.textContent = n + ' kata (wajib 150–300)';
    var kelas = '';
    if (n > 0) kelas = n >= 150 && n <= 300 ? 'good' : 'bad';
    el.className = 'wc ' + kelas;
  }

  // judul otomatis keisi kalo pilih topik rekomendasi
  function isiTopik() {
    var t = topikTerpilih();
    if (t) {
      $('#mjJudul').value = t.judul;
      updateJudulWc();
    }
    jadwalCekMirip();
  }

  // MR-09: cek kemiripan ke server (ditunda 700 ms biar ga tiap ketikan)
  function jadwalCekMirip() {
    clearTimeout(timerMirip);
    $('#mjAksiLain').innerHTML = '';
    var judul = $('#mjJudul').value.trim();

    if (pembimbingKe == 2 || !judul || (pakaiRekom() && !modeAntrean)) {
      $('#mjErr').textContent = '';
      $('#mjWarn').hidden = !(pakaiRekom() && !modeAntrean && pembimbingKe == 1);
      $('#mjWarn').innerHTML = '<i class="bi bi-bookmark-check me-1"></i>Topik rekomendasi dosen tidak diperiksa kemiripannya. Topik ini hanya bisa diambil satu mahasiswa (yang pertama mengajukan).';
      $('#mjSubmit').disabled = false;
      return;
    }

    timerMirip = setTimeout(async function () {
      var nomor = ++nomorCek;
      var hasil = await cekKemiripanApi(judul, $('#mjAbs').value);
      if (nomor !== nomorCek) return; // sudah ada ketikan baru

      if (!hasil.lolos) {
        $('#mjErr').textContent = hasil.pesan;
        $('#mjWarn').hidden = true;
        $('#mjSubmit').disabled = true;
      } else {
        $('#mjErr').textContent = '';
        $('#mjSubmit').disabled = false;
        $('#mjWarn').hidden = !!hasil.gagal;
        $('#mjWarn').innerHTML = `<i class="bi bi-shield-check me-1"></i>Judul lolos pemeriksaan kemiripan (kemiripan tertinggi ${hasil.skor_persen}%, ambang ${Math.round(hasil.ambang * 100)}%).`;
      }
    }, 700);
  }

  function syncAsal() {
    var rek = pakaiRekom();
    $('#lblRek').classList.toggle('on', rek);
    $('#lblSendiri').classList.toggle('on', !rek);
    $('#mjTopik').classList.toggle('d-none', !rek);
    $('#mjJudul').readOnly = rek;
    if (rek) isiTopik();
    else jadwalCekMirip();
  }

  $$('input[name=asal]').forEach(function (r) {
    r.addEventListener('change', syncAsal);
  });
  $('#mjTopik').addEventListener('change', isiTopik);
  $('#mjJudul').addEventListener('input', function () {
    updateJudulWc();
    jadwalCekMirip();
  });
  $('#mjAbs').addEventListener('input', function () {
    updateAbsWc();
    jadwalCekMirip();
  });

  function aturMode(antrean) {
    modeAntrean = antrean;
    var d = dosenDipilih;
    var peran = pembimbingKe;

    $('#mjTitle').textContent = (antrean ? 'Masuk antrean ' : 'Ajukan ') + 'Pembimbing ' + peran;
    $('#mjSub').textContent = d.nama + (antrean
      ? ' · slot Pembimbing ' + peran + ' penuh · ' + (peran == 2 ? d.antrean2 : d.antrean) + ' mahasiswa di antrean'
      : ' · sisa ' + sisa(d, peran) + ' slot Pembimbing ' + peran);
    $('#mjSubmit').textContent = antrean ? 'Masuk antrean' : 'Kirim Pengajuan';

    var info = '';
    if (antrean) {
      info = `<div class="hint-box"><i class="bi bi-hourglass-split me-1"></i>Slot dosen ini sedang penuh. Anda masuk antrean berurutan (yang lebih dulu masuk dipanggil lebih dulu). Saat slot terbuka, pengajuan Anda dikirim otomatis dan Anda mendapat notifikasi.</div>`;
    } else if (peran == 2) {
      info = `<div class="hint-box"><i class="bi bi-people me-1"></i>Pembimbing 2 bebas dipilih tanpa harus sesuai peminatan atau keahlian dosen. Judul dan abstrak mengikuti pengajuan Pembimbing 1 Anda. Slot dikunci saat pengajuan dikirim dan dosen punya 7 × 24 jam untuk memutuskan.</div>`;
    } else {
      info = `<div class="hint-box"><i class="bi bi-shield-check me-1"></i>Slot dikunci untuk Anda saat pengajuan dikirim. Dosen punya 7 × 24 jam untuk memutuskan.</div>`;
    }

    if (peran == 1) {
      var bidang = DB.data.peminatan.find(function (x) { return x.peminatan === d.peminatan; });
      info += `<div class="small mt-2"><i class="bi bi-diagram-3 me-1"></i>Peminatan: <b>${esc(d.peminatan)}</b> (mengikuti peminatan utama dosen)${bidang ? ' · sisa slot peminatan ' + bidang.sisa + ' dari ' + bidang.kuota : ''}</div>`;
    }
    $('#mjInfo').innerHTML = info;

    // antrean ga bisa pakai topik rekomendasi dosen
    var daftarTopik = topikAktif(d).filter(function (t) { return t.tersedia; });
    $('#lblRek').classList.toggle('d-none', daftarTopik.length == 0 || antrean);
    if (antrean && pakaiRekom()) {
      $('input[name=asal][value=sendiri]').checked = true;
    }
    syncAsal();
  }

  // buka modal ajukan. opt = { peran, topikId, antrean }
  window.openAjukan = function (dosenId, opt) {
    if (!opt) opt = {};
    var d = findDosen(dosenId);
    if (!d) return;

    var per = periodeAktif();
    if (!per.ok) {
      toast(per.msg, 'warning');
      return;
    }

    var peran = opt.peran || 1;
    pembimbingKe = peran;

    if (State.aktif(peran)) {
      var p = State.pilih(peran);
      var namaDosen = dosenAtau(p.dosenId).nama;
      var ket = p.status == 'Antrean' ? 'dalam antrean ' + namaDosen : p.status.toLowerCase() + ' (' + namaDosen + ')';
      toast('Anda sudah punya pengajuan aktif untuk Pembimbing ' + peran + ': ' + ket + '. Satu peran hanya boleh satu pengajuan aktif.', 'warning');
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
    } else if (State.p2 && STATUS_AKTIF.indexOf(State.p2.status) != -1 && State.p2.dosenId === d.id) {
      toast('Pembimbing 1 dan Pembimbing 2 harus dosen yang berbeda.', 'warning');
      return;
    }

    if (!d.menerima) {
      toast(d.nama + ' sedang tidak menerima bimbingan.', 'warning');
      return;
    }

    dosenDipilih = d;
    $('#mjFormTA').hidden = peran == 2;

    var daftarTopik = topikAktif(d).filter(function (t) { return t.tersedia; });
    $('#mjTopik').innerHTML = daftarTopik.map(function (t) {
      return `<option value="${t.id}">${esc(t.judul)}</option>`;
    }).join('');

    // reset form
    $('#mjJudul').value = '';
    $('#mjAbs').value = '';
    $('#mjErr').textContent = '';
    $('#mjAksiLain').innerHTML = '';
    $('#mjWarn').hidden = true;
    $('#mjSubmit').disabled = false;
    updateJudulWc();
    updateAbsWc();
    $('input[name=asal][value=sendiri]').checked = true;

    // kalo dibuka dari tombol "Pilih topik ini"
    if (opt.topikId && daftarTopik.length > 0) {
      $('input[name=asal][value=rekom]').checked = true;
      $('#mjTopik').value = opt.topikId;
    }

    aturMode(!!opt.antrean || sisa(d, peran) === 0);

    offcanvas.hide();
    modal.show();
  };

  // data form yg dikirim ke server
  function dataForm() {
    if (pembimbingKe == 2) {
      // pembimbing 2: judul & abstrak ikut pembimbing 1
      var p1 = State.p;
      return { dosenId: dosenDipilih.id, peran: 2, judul: p1.judul, abstrak: p1.abstrak };
    }
    var t = pakaiRekom() && !modeAntrean ? topikTerpilih() : null;
    return {
      dosenId: dosenDipilih.id,
      peran: 1,
      judul: $('#mjJudul').value.trim(),
      abstrak: $('#mjAbs').value,
      topikId: t ? t.id : null
    };
  }

  async function kirim() {
    var err = $('#mjErr');
    var data = dataForm();
    err.textContent = '';
    $('#mjAksiLain').innerHTML = '';

    if (pembimbingKe == 1) {
      var n = wordCount(data.abstrak);
      if (!data.judul) {
        err.textContent = 'Judul wajib diisi.';
        return;
      }
      if (n < 150 || n > 300) {
        err.textContent = 'Abstrak harus 150–300 kata (sekarang ' + n + ' kata).';
        return;
      }
    }

    tombolSibuk($('#mjSubmit'), true, modeAntrean ? 'Memasukkan antrean...' : 'Mengunci slot...');
    var r = modeAntrean ? await State.masukAntrean(data) : await State.ajukan(data);
    tombolSibuk($('#mjSubmit'), false);

    if (r.ok) {
      modal.hide();
      return;
    }

    err.textContent = r.msg;

    // MR-04/05: slot keburu penuh -> tawarkan antrean / peran lain
    if (r.kode === 'slot_dosen_penuh') {
      var html = '';
      if (r.saranPeran) {
        html += `<div class="hint-box mb-2"><i class="bi bi-lightbulb me-1"></i>${esc(r.saranPeran.pesan)}</div>`;
      }
      html += `<button class="btn btn-outline-dark btn-sm" id="mjKeAntrean"><i class="bi bi-hourglass-split me-1"></i>Masuk antrean dengan data ini</button>`;
      $('#mjAksiLain').innerHTML = html;
      $('#mjKeAntrean').onclick = async function () {
        await DB.segarkan();
        aturMode(true);
        kirim();
      };
    }

    // MR-10: peminatan penuh -> hanya saran peminatan lain
    if (r.kode === 'peminatan_penuh' && r.saran.length) {
      $('#mjAksiLain').innerHTML = `<div class="hint-box"><i class="bi bi-signpost-split me-1"></i>Peminatan yang masih tersedia: ${r.saran.map(function (s) { return '<b>' + esc(s.peminatan) + '</b> (' + s.sisa + ' slot)'; }).join(', ')}. Pilih dosen dengan peminatan tersebut di daftar dosen.</div>`;
    }

    DB.segarkan();
  }

  $('#mjSubmit').onclick = kirim;

  // panel samping profil dosen
  window.openDetail = function (id) {
    var d = findDosen(id);
    if (!d) return;
    var st = statusDosen(d);

    var labelStatus = 'Tidak menerima';
    if (st == 'tersedia') labelStatus = 'Tersedia';
    else if (st == 'penuh') labelStatus = 'Penuh';

    var bidangHTML = d.bidang.map(function (i) {
      return `<span class="tag">${esc(BIDANG[i])}</span>`;
    }).join('');

    var kataHTML = d.kata.map(function (k) {
      return `<span class="tag">${esc(k)}</span>`;
    }).join('');

    var bisaP1 = d.menerima && sisa(d, 1) > 0;
    var topikHTML = topikAktif(d).map(function (t) {
      var tombolTopik = !t.tersedia
        ? '<button class="btn btn-ghost btn-sm" disabled>Sudah diambil mahasiswa lain</button>'
        : `<button class="btn btn-ghost btn-sm" ${bisaP1 ? '' : 'disabled'} onclick="openAjukan(${d.id},{topikId:${t.id}})">Pilih topik ini</button>`;
      return `<div class="card-x pad mb-2"><b>${esc(t.judul)}</b><div class="small text-muted my-1">${esc(t.desk)}</div>${tombolTopik}</div>`;
    }).join('');
    if (!topikHTML) {
      topikHTML = '<div class="small text-muted">Dosen belum menawarkan topik.</div>';
    }

    var tombol = '';
    if (!d.menerima) {
      tombol = '<button class="btn btn-ghost" disabled>Dosen tidak menerima bimbingan</button>';
    } else if (!bisaP1) {
      tombol = `<button class="btn btn-outline-dark" onclick="openAjukan(${d.id},{antrean:true})"><i class="bi bi-hourglass-split me-1"></i>Penuh – masuk antrean Pembimbing 1 (${d.antrean} antre)</button>`;
    } else {
      tombol = `<button class="btn btn-red" onclick="openAjukan(${d.id})">Ajukan dengan topik sendiri</button>`;
    }

    $('#ocBody').innerHTML = `
      <div class="d-flex gap-3 align-items-center mb-3">${avatar(d, 'lg')}<div><h5 class="fw-bold mb-1">${esc(d.nama)}</h5><div class="text-muted small">NIDN ${esc(d.nidn)} · Peminatan ${esc(d.peminatan)}</div>
        <span class="badge-s ${st} mt-2 d-inline-block">${labelStatus}</span></div></div>
      <div class="card-x pad mb-3"><div class="d-flex justify-content-between"><b>Kuota Pembimbing 1</b><span>${d.terisi}/${esc(d.labelKuota)}</span></div>
        <div class="slots">${slotHTML(d.kuota, d.terisi)}</div>
        <div class="small text-muted mb-3">Sisa ${sisa(d, 1)} slot${d.antrean ? ' · ' + d.antrean + ' di antrean' : ''}</div>
        <div class="d-flex justify-content-between"><b>Kuota Pembimbing 2</b><span>${d.terisi2}/${esc(d.labelKuota2)}</span></div>
        <div class="slots">${slotHTML(d.kuota2, d.terisi2)}</div>
        <div class="small text-muted">Sisa ${sisa(d, 2)} slot${d.antrean2 ? ' · ' + d.antrean2 + ' di antrean' : ''}</div></div>
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
      // MR-05: kuota penuh -> masuk antrean
      tombol = `<button class="btn btn-outline-dark" onclick="openAjukan(${d.id},{antrean:true})"><i class="bi bi-hourglass-split me-1"></i>Penuh – masuk antrean P1</button>`;
    }
  }

  // pembimbing 2 bebas pilih dosen mana aja yg masih ada slot
  if (bisaPembimbing2(d)) {
    tombol += `<button class="btn btn-outline-dark" onclick="openAjukan(${d.id},{peran:2})"><i class="bi bi-person-plus me-1"></i>Pilih sbg Pembimbing 2</button>`;
  }

  var bidangHTML = d.bidang.map(function (i) {
    return `<span class="tag">${esc(BIDANG[i])}</span>`;
  }).join('');

  function antre(n) {
    return n ? ` · Antrean <b>${n}</b>` : '';
  }

  return `<div class="card-x dosen-card ${st == 'tersedia' ? 'ok' : ''} ${flash}" data-id="${d.id}">
    ${avatar(d)}
    <div class="flex-grow-1 min-w-0">
      <div class="d-flex justify-content-between align-items-start gap-2"><div><h4>${esc(d.nama)}</h4><div class="nidn">NIDN ${esc(d.nidn)} · ${esc(d.peminatan)}</div></div><span class="badge-s ${st}">${badge}</span></div>
      <div class="mt-2">${bidangHTML}</div>
      <div class="slots">${slotHTML(d.kuota, d.terisi)}</div>
      <div class="slot-text"><b>Pembimbing 1</b> · Terisi <b>${d.terisi}</b> · Sisa <b>${sisa(d, 1)}</b> / Kuota <b>${esc(d.labelKuota)}</b>${antre(d.antrean)}</div>
      <div class="slots">${slotHTML(d.kuota2, d.terisi2)}</div>
      <div class="slot-text"><b>Pembimbing 2</b> · Terisi <b>${d.terisi2}</b> · Sisa <b>${sisa(d, 2)}</b> / Kuota <b>${esc(d.labelKuota2)}</b>${antre(d.antrean2)}</div>
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

// MR-07: periode aktif = ada periode berstatus aktif DAN hari ini ada di antara mulai - selesai
function periodeAktif() {
  var pr = DB.data.periode;
  var hariIni = tglLokal();

  if (!pr) {
    return { ok: false, label: 'belum dibuka', msg: 'Periode pengajuan sedang ditutup oleh koordinator.' };
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
  el.innerHTML = `<i class="bi bi-calendar-event me-1"></i>Periode ${esc(PERIODE.nama)} · ${per.label}`;
  el.classList.toggle('tutup', !per.ok);
}

// topik yg dinonaktifkan dosen ga ditampilin ke mahasiswa
function topikAktif(d) {
  return (d.topik || []).filter(function (t) {
    return t.aktif !== false;
  });
}

// ================= SESI (MR-08) =================
// sesi disimpan di server (cookie), berakhir setelah 120 menit tidak aktif

async function keluar() {
  await Api.post('/logout', {}, { bolehTanpaLogin: true });
  location.href = 'login.html';
}

var sudahDialihkan = false;
function sesiHabis() {
  if (sudahDialihkan) return;
  sudahDialihkan = true;
  location.replace('login.html?sesi=habis');
}
