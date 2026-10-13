// koordinator.js
// script buat halaman koordinator TA / kaprodi

// simpan kuota tiap dosen (key nya id dosen)
var KUOTA = {};
DOSEN.forEach(function (d) {
  KUOTA[d.id] = d.kuota;
});

// daftar yg perlu disahkan, sp = nomor surat penetapan (null kalo belum)
var SAH = [
  {id:1, mhs:'Rafi Aditya',   dosen:'Dr. Ade Romadhony',  judul:'Deteksi Ujaran Kebencian di Media Sosial', sp:null},
  {id:2, mhs:'Salsa Maharani',dosen:'Dr. Ade Romadhony',  judul:'Ringkasan Teks Otomatis Artikel Berita', sp:'SP-TA/2026-1/009'},
  {id:3, mhs:'Kevin Hartono', dosen:'Dr. Rina Kusuma',    judul:'Prediksi Permintaan Barang dengan LSTM', sp:null},
  {id:4, mhs:'Putri Ayu',     dosen:'Dr. Sari Wulandari', judul:'Enterprise Architecture TOGAF untuk UMKM', sp:null}
];
var urut = 9; // nomor urut surat berikutnya


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
    return b.terisi / b.kuota - a.terisi / a.kuota;
  });

  var htmlBar = '';
  urutDosen.forEach(function (d) {
    var persen = Math.round(d.terisi / d.kuota * 100);
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
function drawKuota() {
  var html = '';
  DOSEN.forEach(function (d) {
    html += `<tr><td><div class="d-flex align-items-center gap-2">${avatar(d,'xs')}<b>${esc(d.nama)}</b></div></td>
    <td>${d.terisi}</td><td style="width:140px"><input type="number" min="0" max="20" class="form-control form-control-sm" value="${KUOTA[d.id]}" data-k="${d.id}"></td>
    <td><span class="badge-s ${statusDosen(d)}">${statusDosen(d)}</span></td></tr>`;
  });
  $('#kuotaBody').innerHTML = html;
}

function simpanKuota() {
  var valid = true;

  $$('[data-k]').forEach(function (input) {
    var nilai = Number(input.value);
    var id = Number(input.dataset.k);
    var d = findDosen(id);

    // kuota harus bilangan bulat 0-20 dan ga boleh kurang dari yg udah terisi
    var salah = !Number.isInteger(nilai) || nilai < 0 || nilai > 20 || nilai < d.terisi;
    input.classList.toggle('is-invalid', salah);

    if (salah) {
      valid = false;
    } else {
      KUOTA[id] = nilai;
    }
  });

  if (!valid) {
    toast('Kuota harus 0–20 dan tidak boleh di bawah jumlah mahasiswa yang sudah terisi.', 'danger');
    return;
  }

  DOSEN.forEach(function (d) {
    d.kuota = KUOTA[d.id];
  });
  drawRekap();
  drawKuota();
  toast('Kuota tersimpan.', 'success');
}


// ===== PERIODE =====
var periodeBuka = PERIODE.buka;

function drawPeriode() {
  var btn = $('#btnPeriode');
  if (periodeBuka) {
    $('#pStatus').innerHTML = '<span class="live">Periode dibuka</span>';
    btn.textContent = 'Tutup periode';
    btn.className = 'btn btn-ghost text-danger';
  } else {
    $('#pStatus').innerHTML = '<span class="sbadge sb-Dibatalkan">Periode ditutup</span>';
    btn.textContent = 'Buka periode';
    btn.className = 'btn btn-red';
  }
}


// ===== PENGESAHAN =====
function drawSah() {
  var html = '';
  for (var i = 0; i < SAH.length; i++) {
    var s = SAH[i];
    var status, aksi;

    if (s.sp) {
      status = `<span class="sbadge sb-Ditetapkan">${s.sp}</span>`;
      aksi = `<button class="btn btn-ghost btn-sm" onclick="unduh('${s.sp}')"><i class="bi bi-file-earmark-pdf me-1"></i>PDF</button>`;
    } else {
      status = '<span class="sbadge sb-Menunggu">Diterima dosen</span>';
      aksi = `<button class="btn btn-red btn-sm" onclick="sahkan(${s.id})"><i class="bi bi-patch-check me-1"></i>Sahkan</button>`;
    }

    html += `<tr><td><b>${s.mhs}</b></td><td>${s.dosen}</td><td>${s.judul}</td>
    <td>${status}</td>
    <td class="text-end text-nowrap">${aksi}</td></tr>`;
  }
  $('#sahBody').innerHTML = html;
}

function sahkan(id) {
  var s = SAH.find(function (x) {
    return x.id === id;
  });

  // format nomor: SP-TA/<periode>/<urut 3 digit>
  var noUrut = String(urut).padStart(3, '0');
  urut++;
  s.sp = 'SP-TA/' + PERIODE.kode + '/' + noUrut;

  drawSah();
  toast('Disahkan. Surat penetapan ' + s.sp + ' diterbitkan.', 'success');
}

function unduh(no) {
  // belum beneran download, cuma demo
  toast('Demo: di sistem asli ini mengunduh PDF ' + no + '.', 'dark');
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
