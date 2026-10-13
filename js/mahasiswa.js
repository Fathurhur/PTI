// mahasiswa.js
// script buat halaman2 mahasiswa (dashboard, cari, pengajuan, riwayat)

// dipanggil paling awal di tiap halaman mahasiswa
function bootMhs(active) {
  buildShell('mhs', active);
  State.load();
  injectAjukanUI();
  Live.start();
}


// ===== DAFTAR DOSEN + FILTER (dashboard & cari) =====
// o = kumpulan elemen: list, search, bidang, status, count
function mountDosenList(o) {
  var filter = {
    q: '',
    bidang: new Set(),
    status: new Set()
  };

  // tombol filter bidang
  var tombolBidang = [];
  for (var i = 0; i < BIDANG.length; i++) {
    tombolBidang.push(`<button class="chip" data-b="${i}">${BIDANG[i]}</button>`);
  }
  o.bidang.innerHTML = tombolBidang.join(' ');

  // tombol filter status
  o.status.innerHTML = `<button class="chip ok" data-s="tersedia"><i class="bi bi-check-circle"></i>Tersedia</button>
    <button class="chip no" data-s="penuh"><i class="bi bi-people"></i>Penuh/Antrean</button>
    <button class="chip" data-s="nonaktif">Tidak menerima</button>`;

  // urutan tampil: tersedia dulu, terus penuh, terakhir yg ga nerima
  var urutan = { tersedia: 0, penuh: 1, nonaktif: 2 };

  function cocok(d) {
    var q = filter.q.toLowerCase();

    // gabungin semua teks dosen biar bisa dicari
    var namaBidang = d.bidang.map(function (i) { return BIDANG[i]; }).join(' ');
    var judulTopik = d.topik.map(function (t) { return t.judul; }).join(' ');
    var teks = (d.nama + ' ' + d.kata.join(' ') + ' ' + namaBidang + ' ' + judulTopik).toLowerCase();

    if (q && !teks.includes(q)) return false;

    if (filter.bidang.size > 0) {
      var adaBidang = d.bidang.some(function (i) {
        return filter.bidang.has(i);
      });
      if (!adaBidang) return false;
    }

    if (filter.status.size > 0 && !filter.status.has(statusDosen(d))) return false;

    return true;
  }

  function draw() {
    var list = DOSEN.filter(cocok);
    list.sort(function (a, b) {
      var beda = urutan[statusDosen(a)] - urutan[statusDosen(b)];
      if (beda != 0) return beda;
      return a.nama.localeCompare(b.nama);
    });

    if (list.length > 0) {
      o.list.innerHTML = list.map(dosenCardHTML).join('');
    } else {
      o.list.innerHTML = `<div class="card-x empty"><i class="bi bi-person-x"></i>Tidak ada dosen yang cocok dengan filter.</div>`;
    }

    if (o.count) {
      o.count.textContent = list.length + ' dosen';
    }
  }

  o.search.addEventListener('input', function (e) {
    filter.q = e.target.value;
    draw();
  });

  o.bidang.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-b]');
    if (!btn) return;

    var idx = Number(btn.dataset.b);
    if (filter.bidang.has(idx)) {
      filter.bidang.delete(idx);
    } else {
      filter.bidang.add(idx);
    }
    btn.classList.toggle('on');
    draw();
  });

  o.status.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-s]');
    if (!btn) return;

    var s = btn.dataset.s;
    if (filter.status.has(s)) {
      filter.status.delete(s);
    } else {
      filter.status.add(s);
    }
    btn.classList.toggle('on');
    draw();
  });

  // gambar ulang kalo ada update live / pengajuan berubah
  document.addEventListener('live:update', draw);
  document.addEventListener('pengajuan:changed', draw);

  draw();
}


// ===== FORM REKOMENDASI =====
function mountRekom(o) {
  // update tulisan jumlah kata
  function updateWc() {
    var n = wordCount(o.abs.value);
    var pas = n >= 150 && n <= 300;

    var keterangan = '';
    if (n) {
      keterangan = pas ? ' ✓' : ' (ideal 150–300)';
    }
    o.wc.textContent = n + ' kata' + keterangan;
    o.wc.className = 'wc ' + (pas ? 'good' : '');
  }

  o.abs.addEventListener('input', updateWc);

  if (o.contoh) {
    o.contoh.onclick = function (e) {
      e.preventDefault();
      o.judul.value = CONTOH.judul;
      o.abs.value = CONTOH.abstrak;
      updateWc();
    };
  }

  o.btn.onclick = function () {
    if (!o.judul.value.trim() || wordCount(o.abs.value) < 10) {
      toast('Isi judul dan abstrak dulu (atau klik "Isi contoh").', 'warning');
      return;
    }

    // loading dulu biar keliatan lagi ngitung
    o.btn.disabled = true;
    o.btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Menghitung...';
    o.result.innerHTML = '';

    setTimeout(function () {
      var hasil = recommend(o.judul.value, o.abs.value);

      var html = '';
      if (o.heading) {
        html += `<div class="fw-bold mb-1 mt-3">${o.heading}</div>`;
      }
      html += rekomHTML(hasil, o.max || 5);
      if (o.footer) {
        html += o.footer;
      }
      o.result.innerHTML = html;
      animateScores(o.result);

      o.btn.disabled = false;
      o.btn.innerHTML = '<i class="bi bi-calculator me-2"></i>Hitung Kecocokan';
    }, 650);
  };

  updateWc();
}


// ===== STATUS PENGAJUAN =====
// langkah2 buat timeline, cls: done / now / todo
function stepsFor(p) {
  var tgl = fmtDate(p.tgl);
  var batas = fmtDate(p.tgl + 7 * 24 * 60 * 60 * 1000); // 7 hari

  if (p.status == 'Antrean') {
    return [
      { cls: 'done', t: 'Masuk antrean', sub: 'Dikirim ' + tgl },
      { cls: 'now', t: 'Menunggu giliran #' + p.posisi, sub: 'Dipanggil otomatis (FIFO) saat slot terbuka' },
      { cls: 'todo', t: 'Dipromosikan ke Menunggu', sub: 'Slot dikunci untuk Anda' },
      { cls: 'todo', t: 'Keputusan dosen', sub: 'Maks. 7 × 24 jam' },
      { cls: 'todo', t: 'Ditetapkan koordinator', sub: 'Surat penetapan PDF' }
    ];
  }

  if (p.status == 'Menunggu') {
    return [
      { cls: 'done', t: 'Pengajuan dikirim', sub: tgl + ' · slot terkunci' },
      { cls: 'now', t: 'Menunggu keputusan dosen', sub: 'Batas keputusan ' + batas },
      { cls: 'todo', t: 'Diterima dosen', sub: '' },
      { cls: 'todo', t: 'Ditetapkan koordinator', sub: 'Surat penetapan PDF' }
    ];
  }

  return [];
}

function tlHTML(steps) {
  var html = '<ul class="tl">';
  for (var i = 0; i < steps.length; i++) {
    var s = steps[i];
    var centang = s.cls == 'done' ? '<i class="bi bi-check"></i>' : '';
    html += `<li class="${s.cls}"><span class="dot">${centang}</span><b>${esc(s.t)}</b><small>${esc(s.sub)}</small></li>`;
  }
  html += '</ul>';
  return html;
}

// kartu status di dashboard
function renderStatusCard(el) {
  var p = State.p;

  if (!p) {
    el.innerHTML = `<div class="empty" style="padding:22px 6px"><i class="bi bi-inbox"></i>Belum ada pengajuan aktif.<br><small>Pilih dosen lalu klik Ajukan.</small></div>`;
    return;
  }

  var d = findDosen(p.dosenId);
  var posisi = p.status == 'Antrean' ? ' #' + p.posisi : '';

  el.innerHTML = `<div class="d-flex justify-content-between align-items-start gap-2 mb-3">
      <div class="d-flex gap-2 align-items-center">${avatar(d,'xs')}<div><b>${esc(d.nama)}</b><div class="small text-muted">${esc(p.asal)}</div></div></div>
      <span class="sbadge sb-${p.status}">${p.status}${posisi}</span></div>
    ${tlHTML(stepsFor(p))}
    <a href="pengajuan.html" class="btn btn-ghost w-100 mt-3">Lihat detail</a>`;
}


// ===== HALAMAN PENGAJUAN SAYA =====
function renderPengajuanPage(el) {
  var p = State.p;

  if (!p) {
    el.innerHTML = `<div class="card-x empty" style="padding:70px 20px"><i class="bi bi-send-slash"></i><h5 class="fw-bold text-dark">Belum ada pengajuan aktif</h5>
    <p>Cari dosen yang masih punya slot lalu ajukan pembimbing.</p><a class="btn btn-red" href="cari.html">Cari dosen</a></div>`;
    return;
  }

  var d = findDosen(p.dosenId);

  // hitung sisa waktu sampe batas 7 hari
  var SATU_HARI = 24 * 60 * 60 * 1000;
  var SATU_JAM = 60 * 60 * 1000;
  var batas = p.tgl + 7 * SATU_HARI;
  var sisaMs = Math.max(0, batas - Date.now());
  var hari = Math.floor(sisaMs / SATU_HARI);
  var jam = Math.floor(sisaMs % SATU_HARI / SATU_JAM);

  var judulStatus = '';
  if (p.status == 'Antrean') {
    judulStatus = 'Dalam antrean #' + p.posisi;
  } else {
    judulStatus = 'Menunggu keputusan dosen';
  }

  var namaBidang = d.bidang.map(function (i) {
    return BIDANG[i];
  }).join(' · ');

  var infoBox = '';
  if (p.status == 'Menunggu') {
    infoBox = `<div class="warn-box mb-3"><i class="bi bi-clock-history me-1"></i>Sisa waktu keputusan dosen: <b>${hari} hari ${jam} jam</b>. Lewat dari itu pengajuan berstatus <b>Kedaluwarsa</b> dan slot dilepas.</div>`;
  } else {
    infoBox = `<div class="hint-box mb-3"><i class="bi bi-bell me-1"></i>Anda akan menerima notifikasi in-app dan email saat giliran Anda tiba.</div>`;
  }

  el.innerHTML = `<div class="row g-4">
    <div class="col-lg-7"><div class="card-x pad">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
        <div><div class="text-muted small fw-bold text-uppercase">Status saat ini</div><h4 class="fw-bold mb-0">${esc(judulStatus)}</h4></div>
        <span class="sbadge sb-${p.status}">${p.status}</span></div>
      <div class="d-flex gap-3 align-items-center card-x pad mb-3" style="box-shadow:none;background:#FAFAFB">${avatar(d,'sm')}
        <div class="flex-grow-1"><b>${esc(d.nama)}</b><div class="small text-muted">${namaBidang}</div></div>
        <button class="btn btn-ghost btn-sm" data-detail="${d.id}">Profil</button></div>
      <div class="mb-3"><div class="small text-muted fw-bold text-uppercase">Judul</div><div class="fw-bold">${esc(p.judul)}</div></div>
      <div class="mb-3"><div class="small text-muted fw-bold text-uppercase">Abstrak</div><div class="small" style="line-height:1.6">${esc(p.abstrak)}</div></div>
      <div class="d-flex gap-4 small flex-wrap"><div><span class="text-muted">Asal topik</span><br><b>${esc(p.asal)}</b></div><div><span class="text-muted">Dikirim</span><br><b>${fmtDate(p.tgl)}</b></div><div><span class="text-muted">Periode</span><br><b>${PERIODE.nama}</b></div></div>
      <hr><button class="btn btn-ghost text-danger" id="btnBatal"><i class="bi bi-x-circle me-1"></i>Batalkan pengajuan</button>
    </div></div>
    <div class="col-lg-5">
      <div class="card-x pad mb-3"><div class="sec-title"><i class="bi bi-signpost-split"></i>Perjalanan pengajuan</div>${tlHTML(stepsFor(p))}</div>
      ${infoBox}
      <div class="card-x pad small text-muted"><b class="text-dark d-block mb-1">Aturan singkat</b>1 mahasiswa hanya boleh punya 1 pengajuan aktif per periode. Penolakan dosen selalu disertai alasan.</div>
    </div></div>`;

  $('#btnBatal').onclick = function () {
    if (confirm('Batalkan pengajuan ini? Slot akan dilepas.')) {
      State.batalkan();
      toast('Pengajuan dibatalkan.', 'dark');
    }
  };
}


// ===== HALAMAN RIWAYAT =====
function mountRiwayat(o) {
  var filterAktif = 'Semua';

  function ambilData() {
    var semua = [];

    // pengajuan yg masih aktif ditaruh paling atas
    if (State.p) {
      semua.push({
        judul: State.p.judul,
        dosen: findDosen(State.p.dosenId).nama,
        status: State.p.status,
        tgl: State.p.tgl,
        ket: 'Pengajuan aktif saat ini.'
      });
    }
    semua = semua.concat(State.riwayat);

    if (filterAktif == 'Semua') return semua;
    return semua.filter(function (r) {
      return r.status === filterAktif;
    });
  }

  function draw() {
    var data = ambilData();

    if (data.length == 0) {
      o.body.innerHTML = `<tr><td colspan="5"><div class="empty"><i class="bi bi-clock-history"></i>Belum ada riwayat.</div></td></tr>`;
      return;
    }

    var html = '';
    data.forEach(function (x) {
      html += `<tr><td class="text-nowrap">${fmtDate(x.tgl)}</td><td><b>${esc(x.judul)}</b></td><td>${esc(x.dosen)}</td>
      <td><span class="sbadge sb-${x.status}">${x.status}</span></td><td class="small text-muted">${esc(x.ket||'-')}</td></tr>`;
    });
    o.body.innerHTML = html;
  }

  // chip filter status
  var daftarStatus = ['Semua', 'Menunggu', 'Antrean', 'Ditolak', 'Kedaluwarsa', 'Dibatalkan'];
  var chips = [];
  daftarStatus.forEach(function (s) {
    chips.push(`<button class="chip ${s===filterAktif?'on':''}" data-f="${s}">${s}</button>`);
  });
  o.chips.innerHTML = chips.join(' ');

  o.chips.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-f]');
    if (!btn) return;

    filterAktif = btn.dataset.f;
    $$('.chip', o.chips).forEach(function (c) {
      c.classList.toggle('on', c === btn);
    });
    draw();
  });

  document.addEventListener('pengajuan:changed', draw);
  draw();
}
