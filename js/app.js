// app.js
// isinya fungsi2 umum yg dipake di semua halaman
// (navbar, toast, pengajuan, antrean, tf-idf, modal ajukan)

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
  dosen: { nama: 'Dr. Ade Romadhony', sub: 'NIDN 0412038801', ini: 'AR' },
  koor: { nama: 'Dr. Sari Wulandari', sub: 'Koordinator TA / Kaprodi', ini: 'SW' }
};

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


// ================= STATE PENGAJUAN =================
// datanya disimpan di localStorage
// sesuai SRS MR-03: mahasiswa cuma boleh punya 1 pengajuan aktif (Menunggu/Antrean/Diterima) per periode

var KEY_P = 'sd_pengajuan';
var KEY_R = 'sd_riwayat';

// pengajuan contoh biar halaman ga kosong waktu pertama dibuka
function seedPengajuan() {
  return {
    seed: true,
    dosenId: 1,
    judul: 'Prediksi Stok Barang Menggunakan Machine Learning',
    abstrak: 'Penelitian ini membahas prediksi kebutuhan stok barang dengan pendekatan machine learning dan analisis data penjualan historis.',
    asal: 'Usulan mahasiswa',
    status: 'Menunggu',
    tgl: Date.now() - 2 * 24 * 60 * 60 * 1000 // 2 hari yg lalu
  };
}

var State = {
  p: null,
  riwayat: [],

  load: function () {
    var raw = lsGet(KEY_P);
    try {
      if (raw === null) {
        this.p = seedPengajuan();
      } else {
        this.p = JSON.parse(raw);
      }
    } catch (e) {
      this.p = seedPengajuan();
    }

    try {
      this.riwayat = JSON.parse(lsGet(KEY_R)) || RIWAYAT_AWAL.slice();
    } catch (e) {
      this.riwayat = RIWAYAT_AWAL.slice();
    }

    // kalo pengajuannya dibuat user sendiri (bukan seed), slot dosennya ikut kepake
    if (this.p && !this.p.seed) {
      var d = findDosen(this.p.dosenId);
      if (d) {
        if (this.p.status == 'Menunggu') {
          d.terisi = Math.min(d.kuota, d.terisi + 1);
        }
        if (this.p.status == 'Antrean') {
          d.antrean = d.antrean + 1;
        }
      }
    }
  },

  save: function () {
    lsSet(KEY_P, JSON.stringify(this.p));
    lsSet(KEY_R, JSON.stringify(this.riwayat));
    document.dispatchEvent(new Event('pengajuan:changed'));
  },

  // cek apakah masih ada pengajuan yg aktif
  aktif: function () {
    if (!this.p) return this.p;
    var statusAktif = ['Menunggu', 'Antrean', 'Diterima'];
    return statusAktif.indexOf(this.p.status) != -1;
  },

  // ini cuma simulasi, nanti di backend pake transaksi (SELECT ... FOR UPDATE) biar ga rebutan slot
  ajukan: function (data) {
    if (this.aktif()) {
      return { ok: false, msg: 'Anda sudah punya 1 pengajuan aktif pada periode ini.' };
    }

    var d = findDosen(data.dosenId);
    if (!d.menerima) {
      return { ok: false, msg: 'Dosen sedang tidak menerima bimbingan.' };
    }

    var pengajuanBaru = {
      dosenId: d.id,
      judul: data.judul,
      abstrak: data.abstrak,
      asal: data.asal,
      tgl: Date.now()
    };

    // masih ada slot -> langsung Menunggu
    if (sisa(d) > 0) {
      d.terisi++;
      pengajuanBaru.status = 'Menunggu';
      this.p = pengajuanBaru;
      this.save();
      return { ok: true, status: 'Menunggu' };
    }

    // slot penuh -> masuk antrean
    d.antrean++;
    pengajuanBaru.status = 'Antrean';
    pengajuanBaru.posisi = d.antrean;
    this.p = pengajuanBaru;
    this.save();
    return { ok: true, status: 'Antrean', posisi: d.antrean };
  },

  batalkan: function () {
    if (!this.p) return;

    var d = findDosen(this.p.dosenId);
    if (this.p.status == 'Menunggu') {
      this.lepasSlot(d.id, true);
    }
    if (this.p.status == 'Antrean') {
      d.antrean = Math.max(0, d.antrean - 1);
    }

    // masukin ke riwayat
    this.riwayat.unshift({
      judul: this.p.judul,
      dosen: d.nama,
      status: 'Dibatalkan',
      tgl: new Date().toISOString(),
      ket: 'Dibatalkan oleh mahasiswa.'
    });

    this.p = null;
    this.save();
  },

  // dipanggil kalau ada slot yg kosong
  // kalau ada antrean, yg urutan 1 otomatis naik (FIFO) sesuai MR-05
  lepasSlot: function (dosenId, silent) {
    var d = findDosen(dosenId);

    if (d.antrean > 0) {
      d.antrean--; // urutan 1 naik jadi Menunggu, jadi slot keisi lagi

      if (this.p && this.p.status == 'Antrean' && this.p.dosenId === d.id) {
        this.p.posisi--;

        if (this.p.posisi <= 0) {
          this.p.status = 'Menunggu';
          delete this.p.posisi;
          if (!silent) {
            toast('Giliran Anda tiba! Pengajuan ke ' + d.nama + ' dipromosikan dari antrean ke Menunggu.', 'success');
          }
        } else if (!silent) {
          toast('Posisi antrean Anda naik menjadi #' + this.p.posisi + ' pada ' + d.nama + '.', 'success');
        }

        this.save();
      }
    } else {
      d.terisi = Math.max(0, d.terisi - 1);
    }

    document.dispatchEvent(new Event('live:update'));
  },

  reset: function () {
    lsDel(KEY_P);
    lsDel(KEY_R);
    location.reload();
  }
};


// ================= LIVE UPDATE =================
// harusnya polling ke server tiap 5 detik (MR-01)
// sementara datanya diubah random aja buat demo

var Live = {
  last: Date.now(),
  flash: new Set(),

  tick: function () {
    // ambil dosen yg bisa diubah2 (bukan dosen yg lagi diajukan user)
    var pool = [];
    for (var i = 0; i < DOSEN.length; i++) {
      var dsn = DOSEN[i];
      var dosenSaya = State.p && State.p.dosenId === dsn.id;
      if (dsn.menerima && dsn.antrean === 0 && !dosenSaya) {
        pool.push(dsn);
      }
    }

    if (pool.length > 0 && Math.random() < 0.65) {
      var d = pool[Math.floor(Math.random() * pool.length)];
      if (Math.random() < 0.5 && d.terisi < d.kuota) {
        d.terisi++;
      } else if (d.terisi > 1) {
        d.terisi--;
      }
      this.flash.add(d.id);
    }

    this.last = Date.now();
    document.dispatchEvent(new Event('live:update'));

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

    var teksTopik = d.topik.map(function (t) {
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

  // ubah list token jadi vektor tf-idf
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

function buildShell(role, active) {
  var u = USERS[role];

  // menu navbar
  var links = '';
  MENU[role].forEach(function (m) {
    var kelas = m[2] === active ? 'active' : '';
    links += `<li><a href="${m[0]}" class="${kelas}" data-key="${m[2]}">${m[1]}</a></li>`;
  });

  // isi dropdown notif
  var notif = '';
  NOTIF.forEach(function (n) {
    notif += `<div class="notif-item"><i class="bi ${n.ico}"></i><div>${esc(n.t)}<br><small>${n.w}</small></div></div>`;
  });

  // warna avatar beda2 tiap role
  var warnaAv = '#12805C';
  if (role == 'mhs') warnaAv = '#D9132B';
  else if (role == 'dosen') warnaAv = '#2457C5';

  $('#app-nav').innerHTML = `
  <header class="topbar"><div class="inner">
    <a class="brand" href="login.html">
      <span class="brand-mark"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="13" width="4" height="8" rx="1.2" fill="#fff"/><rect x="10" y="8" width="4" height="13" rx="1.2" fill="#fff"/><rect x="17" y="3" width="4" height="18" rx="1.2" fill="#fff" opacity=".7"/></svg></span>
      <span class="brand-text"><small>SISTEM INFORMASI</small><b>DOSEN PEMBIMBING TA &amp; SKRIPSI</b></span></a>
    <ul class="nav-links" id="navLinks">${links}</ul>
    <div class="top-right">
      <div class="dropdown"><button class="icon-btn" data-bs-toggle="dropdown" aria-label="Notifikasi"><i class="bi bi-bell"></i><span class="dot"></span></button>
        <div class="dropdown-menu dropdown-menu-end notif-menu"><div class="px-3 py-2 fw-bold border-bottom">Notifikasi</div>${notif}</div></div>
      <div class="dropdown"><button class="user-chip" data-bs-toggle="dropdown">
        <div class="av sm" style="background:${warnaAv}">${u.ini}</div>
        <div class="meta"><b>${u.nama}</b><span>${u.sub}</span></div><i class="bi bi-chevron-down small text-muted"></i></button>
        <ul class="dropdown-menu dropdown-menu-end"><li><a class="dropdown-item" href="login.html"><i class="bi bi-box-arrow-right me-2"></i>Keluar</a></li></ul></div>
    </div>
    <button class="icon-btn nav-toggle" id="navToggle" aria-label="Menu"><i class="bi bi-list fs-5"></i></button>
  </div></header>`;

  // tombol hamburger di hp
  $('#navToggle').onclick = function () {
    $('#navLinks').classList.toggle('open');
  };

  // tombol panel demo di kanan bawah
  var menuSlot = '';
  if (role == 'mhs') {
    menuSlot = `<li><a class="dropdown-item" href="#" id="demoSlot"><i class="bi bi-unlock me-2"></i>Simulasi: slot Dr. Gara terbuka</a></li>`;
  }

  var fab = document.createElement('div');
  fab.className = 'demo-fab dropup';
  fab.innerHTML = `<button class="btn btn-sm" data-bs-toggle="dropdown"><i class="bi bi-sliders me-1"></i>Panel Demo</button>
    <ul class="dropdown-menu dropdown-menu-end">
      ${menuSlot}
      <li><a class="dropdown-item" href="#" id="demoReset"><i class="bi bi-arrow-counterclockwise me-2"></i>Reset data demo</a></li></ul>`;
  document.body.appendChild(fab);

  $('#demoReset').onclick = function (e) {
    e.preventDefault();
    State.reset();
  };

  var btnSlot = $('#demoSlot');
  if (btnSlot) {
    btnSlot.onclick = function (e) {
      e.preventDefault();
      State.lepasSlot(2);
      toast('Slot Dr. Gara S. Nugraha dilepas. Antrean FIFO diproses otomatis.', 'dark');
    };
  }
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
    var t = dosenDipilih.topik.find(function (x) {
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
    var d = findDosen(dosenId);

    if (State.aktif()) {
      toast('Anda sudah punya 1 pengajuan aktif. Batalkan dulu di halaman Pengajuan Saya.', 'warning');
      return;
    }

    dosenDipilih = d;
    var antre = sisa(d) === 0; // kalo penuh berarti masuk antrean

    if (antre) {
      $('#mjTitle').textContent = 'Masuk Antrean (FIFO)';
      $('#mjSub').textContent = d.nama + ' · antrean saat ini ' + d.antrean + ' orang';
      $('#mjSubmit').textContent = 'Masuk Antrean';
      $('#mjInfo').innerHTML = `<div class="warn-box"><i class="bi bi-people me-1"></i>Slot dosen ini penuh. Anda akan masuk antrean urutan <b>#${d.antrean+1}</b> dan otomatis dipanggil saat slot terbuka.</div>`;
    } else {
      $('#mjTitle').textContent = 'Ajukan Pembimbing';
      $('#mjSub').textContent = d.nama + ' · sisa ' + sisa(d) + ' slot';
      $('#mjSubmit').textContent = 'Kirim Pengajuan';
      $('#mjInfo').innerHTML = `<div class="hint-box"><i class="bi bi-shield-check me-1"></i>Slot akan dikunci untuk Anda saat pengajuan dikirim. Dosen punya 7 × 24 jam untuk memutuskan.</div>`;
    }

    var opsi = '';
    d.topik.forEach(function (t) {
      opsi += `<option value="${t.id}">${esc(t.judul)}</option>`;
    });
    $('#mjTopik').innerHTML = opsi;

    // reset form
    $('#mjJudul').value = '';
    $('#mjAbs').value = '';
    $('#mjErr').textContent = '';
    updateJudulWc();
    updateAbsWc();
    $('input[name=asal][value=sendiri]').checked = true;
    syncAsal();

    // kalo dibuka dari tombol "Pilih topik ini"
    if (opt.topikId) {
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
    var r = State.ajukan({ dosenId: dosenDipilih.id, judul: judul, abstrak: abs, asal: asal });
    if (!r.ok) {
      err.textContent = r.msg;
      return;
    }

    modal.hide();
    if (r.status == 'Menunggu') {
      toast('Pengajuan terkirim. Slot dikunci, menunggu keputusan ' + dosenDipilih.nama + '.', 'success');
    } else {
      toast('Anda masuk antrean #' + r.posisi + ' pada ' + dosenDipilih.nama + '.', 'success');
    }
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
    var topikHTML = d.topik.map(function (t) {
      return `<div class="card-x pad mb-2"><b>${esc(t.judul)}</b><div class="small text-muted my-1">${esc(t.desk)}</div>
        <button class="btn btn-ghost btn-sm" ${disabled} onclick="openAjukan(${d.id},{topikId:'${t.id}'})">Pilih topik ini</button></div>`;
    }).join('');

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
