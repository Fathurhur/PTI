// koordinator.js
// script buat halaman koordinator TA / kaprodi
// data kuota, periode, sama penetapan diambil dari DB (app.js)

// kuota yg udah diketik tapi belum disimpan (key nya id dosen)
// biar ga ketiban pas halaman digambar ulang
var draftKuota = {};


// ===== REKAP BEBAN =====
// satu sel beban: angka terisi/kuota, sisa slot, dan bar warna (hijau aman, kuning >=75%, merah penuh)
function selBeban(terisi, kuota) {
  var persen = kuota ? Math.min(100, Math.round(terisi / kuota * 100)) : 100;
  var warna = '';
  if (persen >= 100) warna = 'full';
  else if (persen >= 75) warna = 'warn';

  var sisaSlot = Math.max(0, kuota - terisi);
  var labelSisa = sisaSlot === 0 ? 'Penuh' : 'Sisa ' + sisaSlot;

  return `<td class="rk-cell"><div class="rk-top"><b>${terisi}<span class="rk-kuota">/${kuota}</span></b><span class="rk-sisa ${warna}">${labelSisa}</span></div>
    <div class="load-bar"><i class="${warna}" style="width:${persen}%"></i></div></td>`;
}

function drawRekap() {
  var total = 0, isi = 0, aktif = 0, sisa1 = 0, sisa2 = 0;
  for (var i = 0; i < DOSEN.length; i++) {
    var d = DOSEN[i];
    total += d.kuota + d.kuota2; // kuota pembimbing 1 + pembimbing 2
    isi += d.terisi + d.terisi2;
    sisa1 += sisa(d, 1);
    sisa2 += sisa(d, 2);
    if (d.menerima) aktif++;
  }

  var stats = [
    ['bi-person-badge', '', 'Dosen aktif', aktif],
    ['bi-pie-chart', 'g', 'Slot terisi (total)', isi + '/' + total],
    ['bi-person', 'b', 'Sisa kuota Pembimbing 1', sisa1],
    ['bi-people', 'a', 'Sisa kuota Pembimbing 2', sisa2]
  ];
  var htmlStats = '';
  stats.forEach(function (s) {
    htmlStats += `<div class="col-6 col-lg-3"><div class="card-x stat"><div class="ico ${s[1]}"><i class="bi ${s[0]}"></i></div><div><b>${s[3]}</b><span>${s[2]}</span></div></div></div>`;
  });
  $('#stats').innerHTML = htmlStats;

  // urutkan dari yg bebannya paling banyak
  var urutDosen = DOSEN.slice();
  urutDosen.sort(function (a, b) {
    return (b.terisi + b.terisi2) / ((b.kuota + b.kuota2) || 1) - (a.terisi + a.terisi2) / ((a.kuota + a.kuota2) || 1);
  });

  var baris = '';
  urutDosen.forEach(function (d) {
    var tidakTerima = d.menerima ? '' : ' <span class="badge-s nonaktif ms-1">Tidak menerima</span>';

    baris += `<tr><td><div class="d-flex align-items-center gap-2">${avatar(d,'xs')}<div class="fw-semibold">${esc(d.nama)}${tidakTerima}</div></div></td>
      ${selBeban(d.terisi, d.kuota)}
      ${selBeban(d.terisi2, d.kuota2)}
      <td class="rk-total"><b>${d.terisi + d.terisi2}</b><span class="text-muted">/${d.kuota + d.kuota2}</span></td></tr>`;
  });

  $('#bars').innerHTML = `<div style="overflow-x:auto"><table class="table-x rekap-tabel"><thead><tr>
    <th>Dosen</th><th>Pembimbing 1 (terisi/kuota)</th><th>Pembimbing 2 (terisi/kuota)</th><th class="text-end">Total</th></tr></thead><tbody>${baris}</tbody></table></div>`;
}

// ===== TAMBAH DOSEN =====
var modalDosen = null;

function bukaTambahDosen() {
  if (!modalDosen) modalDosen = new bootstrap.Modal('#mTambahDosen');

  // pilihan bidang keahlian dari daftar BIDANG di data.js
  var html = '';
  BIDANG.forEach(function (b, i) {
    html += `<label class="chip"><input type="checkbox" class="d-none" name="tdBidang" value="${i}">${esc(b)}</label>`;
  });
  $('#tdBidang').innerHTML = html;
  $$('#tdBidang .chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      // checkbox di dalam label berubah setelah klik, jadi baca statusnya di tick berikutnya
      setTimeout(function () {
        chip.classList.toggle('on', chip.querySelector('input').checked);
      }, 0);
    });
  });

  $('#tdNama').value = '';
  $('#tdNidn').value = '';
  $('#tdKata').value = '';
  $('#tdKuota1').value = 6;
  $('#tdKuota2').value = 6;
  $('#tdMenerima').checked = true;
  $('#tdErr').textContent = '';
  modalDosen.show();
}

function simpanDosenBaru() {
  var bidang = $$('input[name=tdBidang]:checked').map(function (x) {
    return Number(x.value);
  });
  var kata = $('#tdKata').value.split(',').map(function (x) {
    return x.trim().toLowerCase();
  }).filter(function (x) {
    return x != '';
  });

  var r = DB.tambahDosen({
    nama: $('#tdNama').value,
    nidn: $('#tdNidn').value,
    bidang: bidang,
    kata: kata,
    kuota1: $('#tdKuota1').value,
    kuota2: $('#tdKuota2').value,
    menerima: $('#tdMenerima').checked
  });

  if (!r.ok) {
    $('#tdErr').textContent = r.msg;
    return;
  }

  modalDosen.hide();
  toast(r.dosen.nama + ' ditambahkan sebagai dosen pembimbing.', 'success');
}

// download rekap jadi file csv
function exportCSV() {
  var rows = [['Nama Dosen', 'NIDN', 'Kuota Pembimbing 1', 'Terisi Pembimbing 1', 'Sisa Pembimbing 1', 'Kuota Pembimbing 2', 'Terisi Pembimbing 2', 'Sisa Pembimbing 2', 'Status']];
  DOSEN.forEach(function (d) {
    rows.push([d.nama, d.nidn, d.kuota, d.terisi, sisa(d, 1), d.kuota2, d.terisi2, sisa(d, 2), statusDosen(d)]);
  });

  var csv = '';
  for (var i = 0; i < rows.length; i++) {
    var baris = rows[i].map(function (c) {
      return '"' + String(c).replace(/"/g, '""') + '"'; // tanda kutip di-escape
    });
    csv += baris.join(',');
    if (i < rows.length - 1) csv += '\n';
  }

  var blob = new Blob([csv], { type: 'text/csv' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'rekap-beban-dosen-' + PERIODE.kode + '.csv';
  a.click();

  toast('Rekap beban dosen diekspor ke CSV.', 'success');
}



// ===== KUOTA =====
// kuota Pembimbing 1 dan Pembimbing 2 diatur sendiri2 per dosen, sisa kuota ikut dihitung per peran
// baris tabel dibikin sekali, abis itu cuma angkanya yg diupdate
// biar input yg lagi diketik ga ilang pas data berubah
function sel_kuota(peran) {
  return peran == 2 ? 'k2' : 'k1';
}

function drawKuota() {
  var body = $('#kuotaBody');

  if (body.children.length != DOSEN.length) {
    var html = '';
    DOSEN.forEach(function (d) {
      html += `<tr data-row="${d.id}"><td><div class="d-flex align-items-center gap-2">${avatar(d,'xs')}<b class="k-nama">${esc(d.nama)}</b></div></td>
      <td><input type="number" min="0" max="20" class="form-control form-control-sm mb-1" style="width:90px" data-k="${d.id}" data-p="1"><div class="small text-muted k-info1"></div></td>
      <td><input type="number" min="0" max="20" class="form-control form-control-sm mb-1" style="width:90px" data-k="${d.id}" data-p="2"><div class="small text-muted k-info2"></div></td>
      <td><div class="d-flex align-items-center gap-2"><div class="form-check form-switch m-0"><input class="form-check-input k-saklar" type="checkbox" role="switch" data-s="${d.id}" title="Menerima bimbingan"></div><span class="k-status"></span></div></td></tr>`;
    });
    body.innerHTML = html;

    // saklar menerima / tidak menerima langsung disimpan (ga nunggu tombol Simpan kuota)
    $$('.k-saklar', body).forEach(function (saklar) {
      saklar.addEventListener('change', function () {
        var d = findDosen(saklar.dataset.s);
        DB.setMenerima(d.id, saklar.checked);
        toast(d.nama + (saklar.checked ? ' sekarang menerima bimbingan.' : ' sekarang tidak menerima bimbingan.'), saklar.checked ? 'success' : 'dark');
      });
    });

    $$('[data-k]', body).forEach(function (input) {
      input.addEventListener('input', function () {
        draftKuota[input.dataset.k + '-' + input.dataset.p] = input.value;
        // sisa ikut berubah langsung pas kuota diketik
        infoKuota(findDosen(input.dataset.k), Number(input.dataset.p), input.value);
      });
    });
  }

  DOSEN.forEach(function (d) {
    var row = $('[data-row="' + d.id + '"]', body);
    $('.k-nama', row).textContent = d.nama;
    $('.k-status', row).innerHTML = `<span class="badge-s ${statusDosen(d)}">${statusDosen(d)}</span>`;
    $('.k-saklar', row).checked = d.menerima;

    [1, 2].forEach(function (peran) {
      var input = $('[data-p="' + peran + '"]', row);
      var kunci = d.id + '-' + peran;
      if (draftKuota[kunci] === undefined && document.activeElement !== input) {
        input.value = kuotaPeran(d, peran);
      }
      infoKuota(d, peran, input.value);
    });
  });
}

// tulisan "Terisi x · Sisa y" di bawah input kuota
function infoKuota(d, peran, nilaiInput) {
  var row = $('[data-row="' + d.id + '"]');
  var terisi = peran == 2 ? d.terisi2 : d.terisi;
  var kuota = nilaiInput === '' ? 0 : Number(nilaiInput);
  var sisaBaru = Math.max(0, kuota - terisi);
  $('.k-info' + peran, row).innerHTML = 'Terisi <b>' + terisi + '</b> · Sisa <b>' + sisaBaru + '</b>';
}

// ubah status semua dosen sekaligus
function setMenerimaSemua(menerima) {
  var n = DB.setMenerima(null, menerima);
  if (n == 0) {
    toast('Semua dosen sudah ' + (menerima ? 'menerima' : 'tidak menerima') + ' bimbingan.', 'dark');
    return;
  }
  toast(n + ' dosen sekarang ' + (menerima ? 'menerima' : 'tidak menerima') + ' bimbingan.', menerima ? 'success' : 'dark');
}

function simpanKuota() {
  DB.segarkan();
  var valid = true;
  var peta = {};

  $$('[data-k]').forEach(function (input) {
    var nilai = Number(input.value);
    var id = Number(input.dataset.k);
    var peran = Number(input.dataset.p);
    var d = findDosen(id);
    var terisi = peran == 2 ? d.terisi2 : d.terisi;

    // kuota harus bilangan bulat 0-20 dan ga boleh kurang dari yg udah terisi di peran itu
    var salah = input.value === '' || !Number.isInteger(nilai) || nilai < 0 || nilai > 20 || nilai < terisi;
    input.classList.toggle('is-invalid', salah);

    if (salah) {
      valid = false;
    } else {
      if (!peta[id]) peta[id] = {};
      peta[id][sel_kuota(peran)] = nilai;
    }
  });

  if (!valid) {
    toast('Kuota harus 0–20 dan tidak boleh di bawah jumlah mahasiswa yang sudah terisi pada pembimbing tersebut.', 'danger');
    return;
  }

  draftKuota = {};
  DB.setKuota(peta);
  toast('Kuota tersimpan.', 'success');
}


// ===== PERIODE =====
// isi input tanggal dari DB (dipanggil pas halaman dibuka & abis disimpan)
function isiTanggalPeriode() {
  $('#pMulai').value = DB.data.periode.mulai;
  $('#pSelesai').value = DB.data.periode.selesai;
}

// ambil & cek tanggal dari input, null kalau ga valid
function bacaTanggalPeriode() {
  var mulai = $('#pMulai').value;
  var selesai = $('#pSelesai').value;

  if (!mulai || !selesai) {
    toast('Tanggal mulai dan selesai wajib diisi.', 'danger');
    return null;
  }
  if (mulai > selesai) {
    toast('Tanggal mulai tidak boleh setelah tanggal selesai.', 'danger');
    return null;
  }
  return { mulai: mulai, selesai: selesai };
}

function simpanPeriode() {
  var t = bacaTanggalPeriode();
  if (!t) return;

  DB.setPeriode(t.mulai, t.selesai, DB.data.periode.buka);
  isiTanggalPeriode();
  toast('Tanggal periode disimpan: ' + fmtDate(t.mulai) + ' – ' + fmtDate(t.selesai) + '.', 'success');
}

function bukaTutupPeriode() {
  var t = bacaTanggalPeriode();
  if (!t) return;

  var buka = !DB.data.periode.buka;
  DB.setPeriode(t.mulai, t.selesai, buka);
  isiTanggalPeriode();
  toast(buka ? 'Periode dibuka.' : 'Periode ditutup. Mahasiswa tidak bisa mengajukan.', 'dark');
}

function drawPeriode() {
  var btn = $('#btnPeriode');
  var pr = DB.data.periode;

  if (!pr.buka) {
    $('#pStatus').innerHTML = '<span class="sbadge sb-Dibatalkan">Periode ditutup</span>';
    btn.textContent = 'Buka periode';
    btn.className = 'btn btn-red w-100';
  } else {
    if (periodeAktif().ok) {
      $('#pStatus').innerHTML = '<span class="live">Periode dibuka</span>';
    } else {
      // dibuka, tapi hari ini di luar tanggal mulai - selesai
      $('#pStatus').innerHTML = '<span class="sbadge sb-Menunggu" title="Mahasiswa tetap tidak bisa mengajukan">Dibuka · di luar rentang tanggal</span>';
    }
    btn.textContent = 'Tutup periode';
    btn.className = 'btn btn-ghost text-danger w-100';
  }
}


// ===== PENETAPAN PEMBIMBING =====
// satu kartu per mahasiswa berisi Pembimbing 1 dan Pembimbing 2, koordinator bisa mindahin keduanya ke dosen mana aja
var kataCariSah = '';

// pembimbing aktif mahasiswa untuk peran tertentu (yg udah Ditetapkan diutamain)
function pembimbingAktif(nim, peran) {
  var cocok = DB.data.pengajuan.filter(function (x) {
    return x.nim === nim && peranKe(x) === peran && STATUS_AKTIF.indexOf(x.status) != -1;
  });
  return cocok.find(function (x) { return x.status == 'Ditetapkan'; }) || cocok[0] || null;
}

function daftarMahasiswaSah() {
  var peta = {};
  DB.data.pengajuan.forEach(function (p) {
    if (STATUS_AKTIF.indexOf(p.status) == -1) return;
    if (!peta[p.nim]) peta[p.nim] = { nim: p.nim, nama: p.mhs };
  });

  var hasil = Object.keys(peta).map(function (nim) {
    var m = peta[nim];
    m.p1 = pembimbingAktif(nim, 1);
    m.p2 = pembimbingAktif(nim, 2);
    m.judul = (m.p1 || m.p2).judul;
    return m;
  });

  var q = kataCariSah.trim().toLowerCase();
  if (q) {
    hasil = hasil.filter(function (m) {
      return (m.nama + ' ' + m.nim + ' ' + m.judul).toLowerCase().indexOf(q) != -1;
    });
  }
  return hasil.sort(function (a, b) {
    return a.nama.localeCompare(b.nama);
  });
}

// kotak satu pembimbing di dalam kartu mahasiswa
function slotPembimbingHTML(m, peran, p) {
  if (!p) {
    var aksi = '';
    if (peran == 2 && m.p1) {
      aksi = `<button class="btn btn-red btn-sm mt-2" onclick="bukaPindah(null, '${m.nim}', 2)"><i class="bi bi-person-plus me-1"></i>Tetapkan Pembimbing 2</button>`;
    }
    return `<div class="pt-slot kosong"><div class="pt-label">Pembimbing ${peran}</div>
      <div class="text-muted small">Belum ada Pembimbing ${peran}.</div>${aksi}</div>`;
  }

  var d = findDosen(p.dosenId);
  var status = p.status == 'Ditetapkan'
    ? `<span class="sbadge sb-Ditetapkan"><i class="bi bi-patch-check me-1"></i>Ditetapkan ${fmtDate(p.tglSah)}</span>`
    : `<span class="sbadge sb-Menunggu"><i class="bi bi-clock me-1"></i>Menunggu dosen</span>`;
  var dipindah = '';
  if (p.riwayatPindah) {
    dipindah = '<span class="pt-tag"><i class="bi bi-arrow-left-right me-1"></i>Keputusan prodi</span>';
  } else if (p.disetujuiKoor) {
    dipindah = '<span class="pt-tag"><i class="bi bi-shield-check me-1"></i>Disetujui koordinator</span>';
  }

  // pengajuan yg masih nunggu dosen bisa langsung ditetapkan koordinator
  var tombolSetuju = '';
  if (p.status == 'Menunggu') {
    tombolSetuju = `<button class="btn btn-red btn-sm w-100 mb-2" onclick="setujuiSekarang(${p.id})"><i class="bi bi-check2-circle me-1"></i>Tetapkan tanpa menunggu dosen</button>`;
  }

  return `<div class="pt-slot"><div class="pt-label">Pembimbing ${peran}</div>
    <div class="d-flex align-items-center gap-2 mb-2">${avatar(d, 'sm')}<div class="min-w-0"><b class="d-block text-truncate">${esc(d.nama)}</b>
      <span class="small text-muted">Sisa kuota Pembimbing ${peran}: ${sisa(d, peran)}</span></div></div>
    <div class="d-flex flex-wrap gap-1 mb-2">${status}${dipindah}</div>
    ${tombolSetuju}<button class="btn btn-ghost btn-sm w-100" onclick="bukaPindah(${p.id})"><i class="bi bi-arrow-left-right me-1"></i>Pindahkan Pembimbing ${peran}</button></div>`;
}

function drawSah() {
  var list = daftarMahasiswaSah();
  var wadah = $('#sahList');
  if (!wadah) return;

  var info = $('#sahCount');
  if (info) info.textContent = list.length + ' mahasiswa';

  if (list.length == 0) {
    wadah.innerHTML = `<div class="col-12"><div class="card-x empty"><i class="bi bi-person-x"></i>Tidak ada mahasiswa yang cocok.</div></div>`;
    return;
  }

  var html = '';
  list.forEach(function (m) {
    html += `<div class="col-lg-6"><div class="card-x pad pt-card">
      <div class="d-flex align-items-center gap-3 mb-3">
        <div class="av sm" style="background:${AV_COLORS[(m.nim.length + m.nama.length) % AV_COLORS.length]}">${initials(m.nama)}</div>
        <div class="min-w-0"><b class="d-block text-truncate">${esc(m.nama)}</b><span class="small text-muted">${esc(m.nim)}</span></div></div>
      <div class="pt-judul"><i class="bi bi-journal-text me-1"></i>${esc(m.judul)}</div>
      <div class="row g-2">
        <div class="col-sm-6">${slotPembimbingHTML(m, 1, m.p1)}</div>
        <div class="col-sm-6">${slotPembimbingHTML(m, 2, m.p2)}</div>
      </div></div></div>`;
  });
  wadah.innerHTML = html;
}

// koordinator nerima pengajuan Menunggu langsung, tanpa nunggu keputusan dosen
function setujuiSekarang(id) {
  var p = DB.cari(id);
  if (!p) return;
  var d = findDosen(p.dosenId);
  if (!confirm('Tetapkan ' + d.nama + ' sebagai Pembimbing ' + peranKe(p) + ' ' + p.mhs + ' sekarang, tanpa menunggu keputusan dosen?')) return;

  var r = DB.setujui(id);
  if (!r.ok) {
    toast(r.msg, 'danger');
    return;
  }
  toast(r.p.mhs + ' resmi ditetapkan dengan ' + r.dosen.nama + ' sebagai Pembimbing ' + peranKe(r.p) + '.', 'success');
}

function cariSah(nilai) {
  kataCariSah = nilai;
  drawSah();
}


// ===== PINDAHKAN / TETAPKAN PEMBIMBING (keputusan prodi) =====
// state modal: id pengajuan yg dipindah, atau nim + peran 2 kalau nambah pembimbing 2 baru
var pindahState = null;
var modalPindah = null;

// bukaPindah(idPengajuan) buat mindahin, bukaPindah(null, nim, 2) buat nambah pembimbing 2
function bukaPindah(id, nim, peran) {
  var p = id ? DB.cari(id) : null;
  var mhs, lama, peranIni, nimIni;

  if (p) {
    mhs = p.mhs;
    nimIni = p.nim;
    peranIni = peranKe(p);
    lama = findDosen(p.dosenId);
    pindahState = { id: p.id, nim: nimIni, peran: peranIni };
  } else {
    var p1 = pembimbingAktif(nim, 1);
    if (!p1) return;
    mhs = p1.mhs;
    nimIni = nim;
    peranIni = peran || 2;
    lama = null;
    pindahState = { id: null, nim: nimIni, peran: peranIni };
  }

  if (!modalPindah) modalPindah = new bootstrap.Modal('#mPindah');

  $('#pindahJudul').textContent = lama ? 'Pindahkan Pembimbing ' + peranIni : 'Tetapkan Pembimbing ' + peranIni;
  $('#pindahInfo').innerHTML = `<div class="pt-alur"><div><span class="small text-muted d-block">Mahasiswa</span><b>${esc(mhs)}</b><div class="small text-muted">${esc(nimIni)}</div></div>
    <div class="pt-panah"><i class="bi bi-arrow-right"></i></div>
    <div><span class="small text-muted d-block">${lama ? 'Dari' : 'Pembimbing 2'}</span><b>${lama ? esc(lama.nama) : 'Belum ada'}</b></div></div>`;

  // dosen yg udah jadi pembimbing lain mahasiswa ini ga bisa dipilih lagi
  var lainnya = DB.data.pengajuan.filter(function (x) {
    return x.nim === nimIni && STATUS_AKTIF.indexOf(x.status) != -1 && (!p || x.id !== p.id);
  }).map(function (x) { return x.dosenId; });

  var html = '';
  DOSEN.forEach(function (d) {
    if (lama && d.id === lama.id) return;
    if (lainnya.indexOf(d.id) != -1) return;

    var s = sisa(d, peranIni);
    var badge;
    if (!d.menerima) badge = '<span class="pick-badge nonaktif">Tidak menerima</span>';
    else if (s === 0) badge = '<span class="pick-badge penuh">Kuota penuh</span>';
    else badge = '<span class="pick-badge ok">Sisa ' + s + ' slot</span>';

    html += `<label class="pick-item"><input type="radio" name="pindahDosen" value="${d.id}">
      ${avatar(d, 'xs')}<div class="flex-grow-1 min-w-0"><b class="d-block text-truncate">${esc(d.nama)}</b>
      <span class="small text-muted">Pembimbing ${peranIni}: ${peranIni == 2 ? d.terisi2 + '/' + d.kuota2 : d.terisi + '/' + d.kuota} terisi</span></div>${badge}</label>`;
  });
  $('#pindahDaftar').innerHTML = html;

  // tandai pilihan yg lagi aktif
  $$('#pindahDaftar .pick-item').forEach(function (item) {
    item.addEventListener('click', function () {
      $$('#pindahDaftar .pick-item').forEach(function (x) {
        x.classList.toggle('on', x === item);
      });
    });
  });

  $('#pindahAlasan').value = '';
  $('#pindahErr').textContent = '';
  $('#pindahSubmit').textContent = lama ? 'Pindahkan' : 'Tetapkan';
  modalPindah.show();
}

function kirimPindah() {
  var terpilih = $('input[name=pindahDosen]:checked');
  var dosenId = terpilih ? terpilih.value : '';
  var alasan = $('#pindahAlasan').value;

  var r;
  if (pindahState.id) {
    r = DB.pindahkan(pindahState.id, dosenId, alasan);
  } else {
    r = DB.tetapkanPembimbing2(pindahState.nim, dosenId, alasan);
  }

  if (!r.ok) {
    $('#pindahErr').textContent = r.msg;
    return;
  }

  modalPindah.hide();
  var kalimat = pindahState.id
    ? r.p.mhs + ' dipindahkan ke ' + r.baru.nama + '.'
    : r.baru.nama + ' ditetapkan sebagai Pembimbing 2 ' + r.p.mhs + '.';
  toast(kalimat + (r.melebihi ? ' Kuota dosen tujuan sudah penuh, jumlah terisi melebihi kuota.' : ''), r.melebihi ? 'warning' : 'success');
}


// ===== IMPOR CSV =====
function initImpor() {
  var dz = $('#dropzone');
  var inp = $('#fileCsv');

  function prosesFile(f) {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) {
      toast('Berkas harus berformat .csv', 'danger');
      return;
    }
    var ukuran = Math.round(f.size / 1024 * 10) / 10; // KB, 1 angka di belakang koma
    $('#fileInfo').innerHTML = `<div class="hint-box mt-3"><i class="bi bi-file-earmark-check me-1"></i><b>${esc(f.name)}</b> (${ukuran} KB) siap diimpor. Di sistem asli, data divalidasi lalu akun dibuat.</div>`;
  }

  dz.onclick = function () {
    inp.click();
  };
  inp.onchange = function () {
    prosesFile(inp.files[0]);
  };

  // efek border merah waktu file di-drag ke kotak
  dz.addEventListener('dragover', function (e) {
    e.preventDefault();
    dz.style.borderColor = 'var(--red)';
  });
  dz.addEventListener('dragenter', function (e) {
    e.preventDefault();
    dz.style.borderColor = 'var(--red)';
  });
  dz.addEventListener('dragleave', function (e) {
    e.preventDefault();
    dz.style.borderColor = '';
  });
  dz.addEventListener('drop', function (e) {
    e.preventDefault();
    dz.style.borderColor = '';
    prosesFile(e.dataTransfer.files[0]);
  });
}
