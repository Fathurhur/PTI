// mahasiswa.js
// script buat halaman2 mahasiswa (dashboard, cari, pengajuan, riwayat)

// dipanggil paling awal di tiap halaman mahasiswa
function bootMhs(active) {
  if (!buildShell('mhs', active)) return;
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
    <button class="chip no" data-s="penuh"><i class="bi bi-people"></i>Penuh</button>
    <button class="chip" data-s="nonaktif">Tidak menerima</button>`;

  // urutan tampil: tersedia dulu, terus penuh, terakhir yg ga nerima
  var urutan = { tersedia: 0, penuh: 1, nonaktif: 2 };

  function cocok(d) {
    var q = filter.q.toLowerCase();

    // gabungin semua teks dosen biar bisa dicari
    var namaBidang = d.bidang.map(function (i) { return BIDANG[i]; }).join(' ');
    var judulTopik = topikAktif(d).map(function (t) { return t.judul; }).join(' ');
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
      o.topik.value = CONTOH.topik;
      o.judul.value = CONTOH.judul;
      o.abs.value = CONTOH.abstrak;
      updateWc();
    };
  }

  o.btn.onclick = function () {
    if (!o.topik.value.trim() || !o.judul.value.trim() || wordCount(o.abs.value) < 10) {
      toast('Isi topik, judul, dan abstrak dulu (atau klik "Isi contoh").', 'warning');
      return;
    }

    // loading dulu biar keliatan lagi ngitung
    o.btn.disabled = true;
    o.btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Menghitung...';
    o.result.innerHTML = '';

    setTimeout(function () {
      // judul / topik yg udah dipake mahasiswa lain ga bisa diajukan, rekomendasi ga ditampilin
      DB.segarkan();
      var kembar = cariKembar(o.topik.value, o.judul.value);
      if (kembar.judul) {
        o.result.innerHTML = `<div class="warn-box mt-3"><i class="bi bi-exclamation-octagon me-1"></i><b>Tidak bisa diajukan.</b> ${esc(pesanJudulKembar(kembar.judul))}</div>`;
        o.btn.disabled = false;
        o.btn.innerHTML = '<i class="bi bi-calculator me-2"></i>Hitung Kecocokan';
        return;
      }

      var hasil = recommend(o.topik.value, o.judul.value, o.abs.value);

      var html = '';
      // topik mirip cuma peringatan, rekomendasi tetap ditampilkan
      if (kembar.topik) {
        html += `<div class="warn-box mt-3"><i class="bi bi-exclamation-triangle me-1"></i>${esc(pesanTopikMirip(kembar.topik))}</div>`;
      }
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
// langkah2 buat timeline, cls: done / now / todo / bad
function stepsFor(p) {
  var tgl = fmtDate(p.tgl);
  var mulai = p.tglMenunggu || p.tgl;
  var batas = fmtDate(mulai + BATAS_KEPUTUSAN); // 7 hari
  var kirim = { cls: 'done', t: 'Pengajuan dikirim', sub: tgl + ' · slot terkunci' };
  var pilihLain = { cls: 'now', t: 'Pilih dosen lain', sub: 'Anda bisa langsung mengajukan ke dosen lain' };

  if (p.status == 'Menunggu') {
    return [
      kirim,
      { cls: 'now', t: 'Menunggu keputusan dosen', sub: 'Batas keputusan ' + batas },
      { cls: 'todo', t: 'Diterima dosen', sub: 'Pembimbing resmi ditetapkan' }
    ];
  }

  if (p.status == 'Ditetapkan') {
    return [
      kirim,
      { cls: 'done', t: 'Diterima dosen', sub: fmtDate(p.tglKeputusan) },
      { cls: 'done', t: 'Pembimbing ditetapkan', sub: fmtDate(p.tglSah) }
    ];
  }

  if (p.status == 'Ditolak') {
    return [
      kirim,
      { cls: 'bad', t: 'Ditolak dosen', sub: fmtDate(p.tglKeputusan) },
      pilihLain
    ];
  }

  if (p.status == 'Kedaluwarsa') {
    return [
      kirim,
      { cls: 'bad', t: 'Kedaluwarsa', sub: 'Tidak ada keputusan dosen dalam 7 × 24 jam' },
      pilihLain
    ];
  }

  return [];
}

function tlHTML(steps) {
  var html = '<ul class="tl">';
  for (var i = 0; i < steps.length; i++) {
    var s = steps[i];
    var tanda = '';
    if (s.cls == 'done') tanda = '<i class="bi bi-check"></i>';
    if (s.cls == 'bad') tanda = '<i class="bi bi-x"></i>';
    html += `<li class="${s.cls}"><span class="dot">${tanda}</span><b>${esc(s.t)}</b><small>${esc(s.sub)}</small></li>`;
  }
  html += '</ul>';
  return html;
}

// judul besar di atas status
function judulStatus(p) {
  var judul = {
    Menunggu: 'Menunggu keputusan dosen',
    Ditetapkan: 'Pembimbing resmi ditetapkan',
    Ditolak: 'Pengajuan ditolak dosen',
    Kedaluwarsa: 'Pengajuan kedaluwarsa'
  };
  return judul[p.status] || p.status;
}

// kotak info sesuai status (sisa waktu, alasan tolak, tanggal penetapan, dll)
function infoStatusHTML(p) {
  if (p.status == 'Menunggu') {
    var sisaMs = Math.max(0, (p.tglMenunggu || p.tgl) + BATAS_KEPUTUSAN - Date.now());
    var hari = Math.floor(sisaMs / HARI);
    var jam = Math.floor(sisaMs % HARI / JAM);
    return `<div class="warn-box"><i class="bi bi-clock-history me-1"></i>Sisa waktu keputusan dosen: <b>${hari} hari ${jam} jam</b>. Lewat dari itu pengajuan berstatus <b>Kedaluwarsa</b> dan slot dilepas.</div>`;
  }
  if (p.status == 'Ditetapkan') {
    return `<div class="ok-box"><i class="bi bi-patch-check-fill me-1"></i>Selamat! Pembimbing Anda resmi ditetapkan pada tanggal <b>${fmtDate(p.tglSah)}</b>.</div>`;
  }
  if (p.status == 'Ditolak') {
    return `<div class="warn-box"><i class="bi bi-chat-left-text me-1"></i><b>Alasan penolakan:</b> ${esc(p.alasan)}</div>`;
  }
  if (p.status == 'Kedaluwarsa') {
    return `<div class="warn-box"><i class="bi bi-hourglass-bottom me-1"></i>Dosen tidak memberi keputusan dalam 7 × 24 jam, jadi slot dilepas otomatis. Silakan pilih dosen lain.</div>`;
  }
  return '';
}

// tutup hasil Ditolak/Kedaluwarsa, pindah = langsung ke halaman cari
function pilihDosenLain(pindah, peran) {
  State.tutupHasil(peran || 1);
  if (pindah) location.href = 'cari.html';
}

// tombol aksi sesuai status
function aksiStatusHTML(p, pindah) {
  if (p.status == 'Ditolak' || p.status == 'Kedaluwarsa') {
    return `<button class="btn btn-red w-100" onclick="pilihDosenLain(${pindah ? 'true' : 'false'},${peranKe(p)})"><i class="bi bi-arrow-repeat me-1"></i>Pilih dosen lain</button>`;
  }
  return '';
}

// kartu status di dashboard
function renderStatusCard(el) {
  var p = State.p;
  var p2 = State.p2;

  if (!p) {
    el.innerHTML = `<div class="empty" style="padding:22px 6px"><i class="bi bi-inbox"></i>Belum ada pengajuan aktif.<br><small>Pilih dosen lalu klik Ajukan.</small></div>`;
    return;
  }

  var d = findDosen(p.dosenId);
  var aksi = aksiStatusHTML(p, false);

  // blok pembimbing 2: ringkas aja, detailnya di halaman Pengajuan Saya
  var blokP2 = '';
  if (p2) {
    var d2 = findDosen(p2.dosenId);
    var aksi2 = aksiStatusHTML(p2, false);
    blokP2 = `<hr><div class="small text-muted fw-bold text-uppercase mb-2">Dosen Pembimbing 2</div>
      <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
        <div class="d-flex gap-2 align-items-center">${avatar(d2,'xs')}<div><b>${esc(d2.nama)}</b><div class="small text-muted">${esc(judulStatus(p2))}</div></div></div>
        <span class="sbadge sb-${p2.status}">${p2.status}</span></div>
      <div class="mt-2">${infoStatusHTML(p2)}</div>
      ${aksi2 ? '<div class="mt-2">' + aksi2 + '</div>' : ''}`;
  } else if (STATUS_SLOT.indexOf(p.status) != -1) {
    blokP2 = `<hr><div class="hint-box"><i class="bi bi-person-plus me-1"></i><b>Dosen Pembimbing 2</b> belum dipilih. Pilih dosen mana saja yang masih punya slot lewat tombol "Pilih sbg Pembimbing 2" pada daftar dosen.</div>`;
  }

  el.innerHTML = `<div class="small text-muted fw-bold text-uppercase mb-2">Dosen Pembimbing 1</div>
    <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
      <div class="d-flex gap-2 align-items-center">${avatar(d,'xs')}<div><b>${esc(d.nama)}</b><div class="small text-muted">${esc(p.asal)}</div></div></div>
      <span class="sbadge sb-${p.status}">${p.status}</span></div>
    <div class="fw-bold mb-3">${esc(judulStatus(p))}</div>
    ${tlHTML(stepsFor(p))}
    <div class="mt-3">${infoStatusHTML(p)}</div>
    ${aksi ? '<div class="mt-3">' + aksi + '</div>' : ''}
    ${blokP2}
    <a href="pengajuan.html" class="btn btn-ghost w-100 mt-2">Lihat detail</a>`;
}


// ===== HALAMAN PENGAJUAN SAYA =====
function renderPengajuanPage(el) {
  var p = State.p;
  var p2 = State.p2;

  if (!p && !p2) {
    el.innerHTML = `<div class="card-x empty" style="padding:70px 20px"><i class="bi bi-send-slash"></i><h5 class="fw-bold text-dark">Belum ada pengajuan aktif</h5>
    <p>Cari dosen yang masih punya slot lalu ajukan pembimbing.</p><a class="btn btn-red" href="cari.html">Cari dosen</a></div>`;
    return;
  }

  var html = '';
  if (p) {
    html += '<h5 class="fw-bold mb-3">Dosen Pembimbing 1</h5>' + kartuPengajuan(p);
  }
  if (p2) {
    html += '<h5 class="fw-bold mt-5 mb-3">Dosen Pembimbing 2</h5>' + kartuPengajuan(p2);
  } else if (p && STATUS_SLOT.indexOf(p.status) != -1) {
    html += `<div class="hint-box mt-4"><i class="bi bi-person-plus me-1"></i><b>Dosen Pembimbing 2</b> belum dipilih. Anda bebas memilih dosen mana saja yang masih punya slot, tanpa harus sesuai topik atau keahliannya. <a href="cari.html">Pilih sekarang</a></div>`;
  }
  el.innerHTML = html;
}

// satu kartu pengajuan (pembimbing 1 atau 2)
function kartuPengajuan(p) {
  var peran = peranKe(p);
  var d = findDosen(p.dosenId);

  var namaBidang = d.bidang.map(function (i) {
    return BIDANG[i];
  }).join(' · ');

  // bagian bawah kartu: pengajuan ga bisa dibatalkan mahasiswa, tunggu keputusan dosen (maks. 7 x 24 jam)
  var bawah = '';
  if (p.status == 'Menunggu') {
    bawah = '<div class="small text-muted"><i class="bi bi-lock me-1"></i>Pengajuan tidak dapat dibatalkan. Tunggu keputusan dosen paling lama 7 × 24 jam. Jika ditolak atau kedaluwarsa, Anda bisa langsung memilih dosen lain.</div>';
  } else {
    bawah = aksiStatusHTML(p, true);
  }

  var tglTetap = '';
  if (p.status == 'Ditetapkan') {
    tglTetap = `<div><span class="text-muted">Tanggal penetapan</span><br><b>${fmtDate(p.tglSah)}</b></div>`;
  }

  // pembimbing 2 ikut judul & abstrak pembimbing 1, jadi ga ditampilin lagi
  var blokJudul = '';
  if (peran == 1) {
    blokJudul = `<div class="mb-3"><div class="small text-muted fw-bold text-uppercase">Judul</div><div class="fw-bold">${esc(p.judul)}</div></div>
      <div class="mb-3"><div class="small text-muted fw-bold text-uppercase">Abstrak</div><div class="small" style="line-height:1.6">${esc(p.abstrak)}</div></div>`;
  }

  return `<div class="row g-4">
    <div class="col-lg-7"><div class="card-x pad">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
        <div><div class="text-muted small fw-bold text-uppercase">Status saat ini</div><h4 class="fw-bold mb-0">${esc(judulStatus(p))}</h4></div>
        <span class="sbadge sb-${p.status}">${p.status}</span></div>
      <div class="d-flex gap-3 align-items-center card-x pad mb-3" style="box-shadow:none;background:#FAFAFB">${avatar(d,'sm')}
        <div class="flex-grow-1"><b>${esc(d.nama)}</b><div class="small text-muted">${namaBidang}</div></div>
        <button class="btn btn-ghost btn-sm" data-detail="${d.id}">Profil</button></div>
      ${blokJudul}
      <div class="d-flex gap-4 small flex-wrap"><div><span class="text-muted">Asal topik</span><br><b>${esc(p.asal)}</b></div><div><span class="text-muted">Dikirim</span><br><b>${fmtDate(p.tgl)}</b></div><div><span class="text-muted">Periode</span><br><b>${PERIODE.nama}</b></div>${tglTetap}</div>
      <hr>${bawah}
    </div></div>
    <div class="col-lg-5">
      <div class="card-x pad mb-3"><div class="sec-title"><i class="bi bi-signpost-split"></i>Perjalanan pengajuan</div>${tlHTML(stepsFor(p))}</div>
      <div class="mb-3">${infoStatusHTML(p)}</div>
      <div class="card-x pad small text-muted"><b class="text-dark d-block mb-1">Aturan singkat</b>1 mahasiswa hanya boleh punya 1 pengajuan aktif per periode. Mahasiswa membutuhkan 2 dosen pembimbing. Pembimbing 2 bebas dipilih selama slot dosen masih tersedia. Penolakan dosen selalu disertai alasan.</div>
    </div></div>`;
}


// ===== HALAMAN RIWAYAT =====
// keterangan singkat tiap baris riwayat
function ketRiwayat(p) {
  if (p.status == 'Menunggu') return 'Menunggu keputusan dosen hingga ' + fmtDate((p.tglMenunggu || p.tgl) + BATAS_KEPUTUSAN) + '.';
  if (p.status == 'Ditetapkan') return 'Ditetapkan pada ' + fmtDate(p.tglSah) + '.';
  if (p.status == 'Ditolak') return p.alasan;
  if (p.status == 'Kedaluwarsa') return 'Tidak ada keputusan dosen dalam 7 × 24 jam.';
  return '-';
}

function mountRiwayat(o) {
  var filterAktif = 'Semua';

  function ambilData() {
    var semua = State.semua();
    if (filterAktif == 'Semua') return semua;
    return semua.filter(function (p) {
      return p.status === filterAktif;
    });
  }

  function draw() {
    var data = ambilData();

    if (data.length == 0) {
      o.body.innerHTML = `<tr><td colspan="5"><div class="empty"><i class="bi bi-clock-history"></i>Belum ada riwayat.</div></td></tr>`;
      return;
    }

    var html = '';
    data.forEach(function (p) {
      var d = findDosen(p.dosenId);
      html += `<tr><td class="text-nowrap">${fmtDate(p.tgl)}</td><td><b>${esc(p.judul)}</b></td><td>${esc(d.nama)}<div class="small text-muted">Pembimbing ${peranKe(p)}</div></td>
      <td><span class="sbadge sb-${p.status}">${p.status}</span></td><td class="small text-muted">${esc(ketRiwayat(p))}</td></tr>`;
    });
    o.body.innerHTML = html;
  }

  // chip filter status
  var daftarStatus = ['Semua', 'Menunggu', 'Ditetapkan', 'Ditolak', 'Kedaluwarsa'];
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
