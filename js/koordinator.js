// koordinator.js
// script buat halaman koordinator TA / kaprodi
// data kuota, periode, sama penetapan diambil dari DB (app.js)

// kuota yg udah diketik tapi belum disimpan (key nya id dosen)
// biar ga ketiban pas halaman digambar ulang
var draftKuota = {};


// ===== REKAP BEBAN =====
function drawRekap() {
  var total = 0, isi = 0, penuh = 0, antre = 0, aktif = 0;
  for (var i = 0; i < DOSEN.length; i++) {
    var d = DOSEN[i];
    total += d.kuota;
    isi += d.terisi;
    antre += d.antrean;
    if (sisa(d) === 0) penuh++;
    if (d.menerima) aktif++;
  }

  var stats = [
    ['bi-person-badge', '', 'Dosen aktif', aktif],
    ['bi-pie-chart', 'g', 'Slot terisi', isi + '/' + total],
    ['bi-lock', '', 'Dosen penuh', penuh],
    ['bi-people', 'a', 'Dalam antrean', antre]
  ];
  var htmlStats = '';
  stats.forEach(function (s) {
    htmlStats += `<div class="col-6 col-lg-3"><div class="card-x stat"><div class="ico ${s[1]}"><i class="bi ${s[0]}"></i></div><div><b>${s[3]}</b><span>${s[2]}</span></div></div></div>`;
  });
  $('#stats').innerHTML = htmlStats;

  // urutkan dari yg bebannya paling banyak
  var urutDosen = DOSEN.slice();
  urutDosen.sort(function (a, b) {
    return b.terisi / (b.kuota || 1) - a.terisi / (a.kuota || 1);
  });

  var htmlBar = '';
  urutDosen.forEach(function (d) {
    var persen = d.kuota ? Math.min(100, Math.round(d.terisi / d.kuota * 100)) : 100;
    var warna = '';
    if (persen >= 100) warna = 'full';
    else if (persen >= 75) warna = 'warn';

    htmlBar += `<div class="load-row"><div class="d-flex align-items-center gap-2 text-truncate">${avatar(d,'xs')}<span class="text-truncate fw-semibold">${esc(d.nama)}</span></div>
      <div class="load-bar"><i class="${warna}" style="width:${persen}%"></i></div><div class="text-end fw-bold">${d.terisi}/${d.kuota}</div></div>`;
  });
  $('#bars').innerHTML = htmlBar;
}

// download rekap jadi file csv
function exportCSV() {
  var rows = [['Nama Dosen', 'NIDN', 'Kuota', 'Terisi', 'Sisa', 'Antrean', 'Status']];
  DOSEN.forEach(function (d) {
    rows.push([d.nama, d.nidn, d.kuota, d.terisi, sisa(d), d.antrean, statusDosen(d)]);
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
// baris tabel dibikin sekali, abis itu cuma angkanya yg diupdate
// biar input yg lagi diketik ga ilang pas data berubah
function drawKuota() {
  var body = $('#kuotaBody');

  if (body.children.length != DOSEN.length) {
    var html = '';
    DOSEN.forEach(function (d) {
      html += `<tr data-row="${d.id}"><td><div class="d-flex align-items-center gap-2">${avatar(d,'xs')}<b class="k-nama">${esc(d.nama)}</b></div></td>
      <td class="k-terisi"></td><td style="width:140px"><input type="number" min="0" max="20" class="form-control form-control-sm" data-k="${d.id}"></td>
      <td class="k-status"></td></tr>`;
    });
    body.innerHTML = html;

    $$('[data-k]', body).forEach(function (input) {
      input.addEventListener('input', function () {
        draftKuota[input.dataset.k] = input.value;
      });
    });
  }

  DOSEN.forEach(function (d) {
    var row = $('[data-row="' + d.id + '"]', body);
    $('.k-nama', row).textContent = d.nama;
    $('.k-terisi', row).textContent = d.terisi + (d.antrean ? ' · antrean ' + d.antrean : '');
    $('.k-status', row).innerHTML = `<span class="badge-s ${statusDosen(d)}">${statusDosen(d)}</span>`;

    var input = $('[data-k]', row);
    if (draftKuota[d.id] === undefined && document.activeElement !== input) {
      input.value = d.kuota;
    }
  });
}

function simpanKuota() {
  DB.segarkan();
  var valid = true;
  var peta = {};

  $$('[data-k]').forEach(function (input) {
    var nilai = Number(input.value);
    var id = Number(input.dataset.k);
    var d = findDosen(id);

    // kuota harus bilangan bulat 0-20 dan ga boleh kurang dari yg udah terisi
    var salah = input.value === '' || !Number.isInteger(nilai) || nilai < 0 || nilai > 20 || nilai < d.terisi;
    input.classList.toggle('is-invalid', salah);

    if (salah) {
      valid = false;
    } else {
      peta[id] = nilai;
    }
  });

  if (!valid) {
    toast('Kuota harus 0–20 dan tidak boleh di bawah jumlah mahasiswa yang sudah terisi.', 'danger');
    return;
  }

  draftKuota = {};
  DB.setKuota(peta); // kalau kuota naik, antrean otomatis maju
  toast('Kuota tersimpan. Antrean diproses otomatis bila ada slot baru.', 'success');
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


// ===== PENGESAHAN =====
function drawSah() {
  // yg belum disahkan di atas, terus yg udah ditetapkan urut nomor surat
  var list = DB.data.pengajuan.filter(function (p) {
    return p.status == 'Diterima' || p.status == 'Ditetapkan';
  }).sort(function (a, b) {
    if (a.status != b.status) return a.status == 'Diterima' ? -1 : 1;
    if (a.status == 'Diterima') return a.tglKeputusan - b.tglKeputusan;
    return a.sp < b.sp ? -1 : 1;
  });

  if (list.length == 0) {
    $('#sahBody').innerHTML = `<tr><td colspan="5"><div class="empty"><i class="bi bi-patch-check"></i>Belum ada pengajuan yang diterima dosen.</div></td></tr>`;
    return;
  }

  var html = '';
  list.forEach(function (p) {
    var d = findDosen(p.dosenId);
    var status, aksi;

    if (p.status == 'Ditetapkan') {
      status = `<span class="sbadge sb-Ditetapkan">${esc(p.sp)}</span>`;
      aksi = `<button class="btn btn-ghost btn-sm" onclick="unduhSurat(${p.id})"><i class="bi bi-file-earmark-pdf me-1"></i>PDF</button>`;
    } else {
      status = '<span class="sbadge sb-Menunggu">Diterima dosen</span>';
      if (p.klarifikasi) {
        status += ' <span class="sbadge sb-Ditolak mt-1">Klarifikasi diminta</span>';
      }
      aksi = `<button class="btn btn-red btn-sm" onclick="sahkan(${p.id})"><i class="bi bi-patch-check me-1"></i>Sahkan</button>
        <button class="btn btn-ghost btn-sm" onclick="mintaKlarifikasi(${p.id})" ${p.klarifikasi ? 'disabled' : ''}><i class="bi bi-question-circle me-1"></i>Minta klarifikasi</button>`;
    }

    html += `<tr><td><b>${esc(p.mhs)}</b><div class="small text-muted">${esc(p.nim)}</div></td><td>${esc(d.nama)}</td><td>${esc(p.judul)}</td>
    <td>${status}</td>
    <td class="text-end text-nowrap">${aksi}</td></tr>`;
  });
  $('#sahBody').innerHTML = html;
}

function sahkan(id) {
  var r = DB.sahkan(id);
  if (!r.ok) {
    toast(r.msg, 'danger');
    return;
  }
  toast('Disahkan. Surat penetapan ' + r.p.sp + ' diterbitkan.', 'success');
}

function mintaKlarifikasi(id) {
  var r = DB.klarifikasi(id);
  if (!r.ok) {
    toast(r.msg, 'danger');
    return;
  }
  toast('Permintaan klarifikasi dikirim ke ' + findDosen(r.p.dosenId).nama + '.', 'dark');
}

function unduhSurat(id) {
  bukaSurat(DB.cari(id));
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
