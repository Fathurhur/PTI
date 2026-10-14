// dosen.js
// script halaman dosen (contohnya login sbg Dr. Khodijah Amiroh)
// semua data diambil dari DB (app.js), jadi keputusan dosen langsung keliatan di halaman mahasiswa

var ME = findDosen(ID_DOSEN_LOGIN);

var tolakId = null;     // id pengajuan yg mau ditolak
var topikEditId = null; // id topik yg lagi diubah, null = tambah baru
var modalTolak = null;
var modalTopik = null;

// draft profil, baru disimpan ke DB pas klik "Simpan profil"
var PROF = null;

function salinProfil() {
  PROF = {
    nama: ME.nama,
    bidang: ME.bidang.slice(),
    kata: ME.kata.slice()
  };
}


// ===== DATA DARI DB =====
// pengajuan masuk = status Menunggu, yg paling lama di atas
function pengajuanMasuk() {
  return DB.data.pengajuan.filter(function (p) {
    return p.dosenId === ME.id && p.status == 'Menunggu';
  }).sort(function (a, b) {
    return (a.tglMenunggu || a.tgl) - (b.tglMenunggu || b.tgl);
  });
}

// mahasiswa bimbingan = Diterima / Ditetapkan
function daftarBimbingan() {
  return DB.data.pengajuan.filter(function (p) {
    return p.dosenId === ME.id && (p.status == 'Diterima' || p.status == 'Ditetapkan');
  }).sort(function (a, b) {
    return a.tglKeputusan - b.tglKeputusan;
  });
}

// sisa waktu buat dosen ngambil keputusan (batasnya 7x24 jam)
function sisaWaktu(p) {
  var ms = (p.tglMenunggu || p.tgl) + BATAS_KEPUTUSAN - Date.now();
  var s = Math.max(0, Math.floor(ms / JAM));
  if (s <= 24) {
    // kurang dari sehari, dikasih warna merah
    return `<span style="color:var(--red-dark);font-weight:700">${s} jam lagi</span>`;
  }
  return Math.floor(s / 24) + ' hari ' + (s % 24) + ' jam lagi';
}


// ===== PENGAJUAN MASUK =====
// kotak statistik di atas
function drawStats() {
  // [ikon, warna, label, angka]
  var stats = [
    ['bi-people', '', 'Kuota', ME.kuota],
    ['bi-person-check', 'g', 'Terisi', ME.terisi],
    ['bi-door-open', 'b', 'Sisa slot', sisa(ME)],
    ['bi-inbox', 'a', 'Pengajuan masuk', pengajuanMasuk().length]
  ];

  var html = '';
  for (var i = 0; i < stats.length; i++) {
    var s = stats[i];
    html += `<div class="col-6 col-lg-3"><div class="card-x stat"><div class="ico ${s[1]}"><i class="bi ${s[0]}"></i></div><div><b>${s[3]}</b><span>${s[2]}</span></div></div></div>`;
  }
  $('#stats').innerHTML = html;
}

// list pengajuan masuk
function drawMasuk() {
  drawStats();

  var masuk = pengajuanMasuk();
  if (masuk.length == 0) {
    $('#masukList').innerHTML = `<div class="card-x empty"><i class="bi bi-inbox"></i>Tidak ada pengajuan yang menunggu keputusan.</div>`;
    return;
  }

  var html = '';
  for (var i = 0; i < masuk.length; i++) {
    var m = masuk[i];
    html += `<div class="card-x pad mb-3">
    <div class="d-flex gap-3 flex-wrap">
      <div class="av sm" style="background:${AV_COLORS[(m.id + 2) % AV_COLORS.length]}">${initials(m.mhs)}</div>
      <div class="flex-grow-1" style="min-width:240px">
        <div class="d-flex justify-content-between flex-wrap gap-2"><div><b>${esc(m.mhs)}</b> <span class="text-muted small">${esc(m.nim)}</span></div>
          <span class="sbadge sb-Menunggu"><i class="bi bi-clock me-1"></i>${sisaWaktu(m)}</span></div>
        <div class="fw-bold mt-2">${esc(m.judul)}</div>
        <div class="small text-muted my-2" style="line-height:1.6">${esc(m.abstrak)}</div>
        <span class="tag">${esc(m.asal)}</span>
        <div class="d-flex gap-2 mt-2"><button class="btn btn-red btn-sm" onclick="terima(${m.id})"><i class="bi bi-check2 me-1"></i>Terima</button>
          <button class="btn btn-ghost btn-sm" onclick="bukaTolak(${m.id})"><i class="bi bi-x me-1"></i>Tolak</button></div>
      </div></div></div>`;
  }
  $('#masukList').innerHTML = html;
}

function terima(id) {
  var r = DB.terima(id);
  if (!r.ok) {
    toast(r.msg, 'danger');
    return;
  }
  toast(r.p.mhs + ' diterima. Menunggu pengesahan koordinator.', 'success');
}

// buka modal tolak
function bukaTolak(id) {
  tolakId = id;
  $('#alasan').value = '';
  $('#alasanErr').textContent = '';
  modalTolak.show();
}

function kirimTolak() {
  // validasi minimal 10 karakter ada di DB.tolak
  var r = DB.tolak(tolakId, $('#alasan').value);
  if (!r.ok) {
    $('#alasanErr').textContent = r.msg;
    return;
  }

  modalTolak.hide();
  toast('Pengajuan ' + r.p.mhs + ' ditolak. Slot dilepas dan antrean diproses.', 'dark');
}


// ===== BIMBINGAN =====
// tabel mahasiswa bimbingan
function drawBimb() {
  var list = daftarBimbingan();
  var html = '';

  for (var i = 0; i < list.length; i++) {
    var b = list[i];

    var statusSP = '';
    if (b.status == 'Ditetapkan') {
      statusSP = `<span class="sbadge sb-Ditetapkan">${esc(b.sp)}</span>`;
    } else {
      statusSP = '<span class="sbadge sb-Menunggu">Menunggu pengesahan</span>';
      if (b.klarifikasi) {
        statusSP += ' <span class="sbadge sb-Ditolak mt-1"><i class="bi bi-question-circle me-1"></i>Klarifikasi diminta</span>';
      }
    }

    html += `<tr><td><div class="d-flex align-items-center gap-2"><div class="av xs" style="background:#2457C5">${initials(b.mhs)}</div><div><b>${esc(b.mhs)}</b><div class="small text-muted">${esc(b.nim)}</div></div></div></td>
    <td>${esc(b.judul)}</td><td class="text-nowrap">${fmtDate(b.tglKeputusan)}</td><td>${statusSP}</td></tr>`;
  }

  if (list.length == 0) {
    html = `<tr><td colspan="4"><div class="empty"><i class="bi bi-people"></i>Belum ada mahasiswa bimbingan.</div></td></tr>`;
  }
  $('#bimbBody').innerHTML = html;

  // terisi = bimbingan + pengajuan yg masih nunggu keputusan (slotnya udah dikunci)
  $('#bimbSisa').textContent = ME.terisi + '/' + ME.kuota + ' slot terisi · sisa ' + sisa(ME);
  $('#bimbSlots').innerHTML = slotHTML(ME.kuota, ME.terisi);
}


// ===== PROFIL =====
function drawProfil() {
  drawSaklar();
  drawFormProfil();
  drawTopik();
}

// saklar "Menerima bimbingan"
function drawSaklar() {
  $('#swTerima').checked = ME.menerima;
}

function setMenerima(nilai) {
  DB.ubahDosen(ME.id, function (dd) {
    dd.menerima = nilai;
  });
  if (nilai) {
    toast('Status: menerima bimbingan. Mahasiswa bisa mengajukan ke Anda.', 'dark');
  } else {
    toast('Status: tidak menerima bimbingan. Tombol ajukan di halaman mahasiswa dinonaktifkan.', 'dark');
  }
}

// form nama, bidang, kata kunci (isinya dari draft PROF)
function drawFormProfil() {
  $('#pNama').value = PROF.nama;

  var bidangHTML = [];
  for (var b = 0; b < BIDANG.length; b++) {
    var on = PROF.bidang.indexOf(b) != -1 ? 'on' : '';
    bidangHTML.push(`<button type="button" class="chip ${on}" onclick="toggleBidang(${b})">${BIDANG[b]}</button>`);
  }
  $('#bidangBox').innerHTML = bidangHTML.join(' ');

  var kwHTML = [];
  for (var i = 0; i < PROF.kata.length; i++) {
    kwHTML.push(`<span class="chip on" style="background:var(--ink)">${esc(PROF.kata[i])}<i class="bi bi-x" style="cursor:pointer" onclick="hapusKw(${i})"></i></span>`);
  }
  $('#kwBox').innerHTML = kwHTML.join(' ');
  $('#kwCount').textContent = PROF.kata.length + '/10 kata kunci';
}

// bidang bisa lebih dari satu, tapi minimal 1
function toggleBidang(i) {
  var idx = PROF.bidang.indexOf(i);
  if (idx == -1) {
    PROF.bidang.push(i);
  } else {
    if (PROF.bidang.length == 1) {
      toast('Minimal 1 bidang keahlian.', 'danger');
      return;
    }
    PROF.bidang.splice(idx, 1);
  }
  drawFormProfil();
}

// tambah kata kunci (max 10)
function addKw() {
  var kata = $('#kwIn').value.trim().toLowerCase();
  if (kata == '') return;

  if (PROF.kata.length >= 10) {
    toast('Maksimal 10 kata kunci.', 'danger');
    return;
  }
  if (PROF.kata.indexOf(kata) == -1) {
    PROF.kata.push(kata);
  }
  $('#kwIn').value = '';
  drawFormProfil();
}

function hapusKw(i) {
  PROF.kata.splice(i, 1);
  drawFormProfil();
}

function simpanProfil() {
  var nama = $('#pNama').value.trim();

  if (nama == '') {
    toast('Nama wajib diisi.', 'danger');
    return;
  }
  if (nama.length > 100) {
    toast('Nama maksimal 100 karakter.', 'danger');
    return;
  }
  if (PROF.bidang.length < 1) {
    toast('Pilih minimal 1 bidang keahlian.', 'danger');
    return;
  }
  if (PROF.kata.length > 10) {
    toast('Maksimal 10 kata kunci.', 'danger');
    return;
  }

  PROF.nama = nama;
  DB.ubahDosen(ME.id, function (dd) {
    dd.nama = PROF.nama;
    dd.bidang = PROF.bidang.slice();
    dd.kata = PROF.kata.slice();
  });

  // nama di navbar ikut diganti
  $('.user-chip .meta b').textContent = ME.nama;
  $('.user-chip .av').textContent = initials(ME.nama);
  toast('Profil disimpan.', 'success');
}


// ===== TOPIK =====
function drawTopik() {
  var html = '';
  ME.topik.forEach(function (t) {
    var aktif = t.aktif !== false;
    html += `<div class="card-x pad mb-2 ${aktif ? '' : 'opacity-50'}"><div class="d-flex justify-content-between gap-2"><div><b>${esc(t.judul)}</b><div class="small text-muted">${esc(t.desk)}</div></div>
    <div class="d-flex align-items-start gap-2"><button class="btn btn-ghost btn-sm text-nowrap" onclick="bukaTopik('${t.id}')"><i class="bi bi-pencil me-1"></i>Ubah</button>
    <div class="form-check form-switch m-0" title="Aktif / nonaktif"><input class="form-check-input" type="checkbox" ${aktif ? 'checked' : ''} onchange="setTopikAktif('${t.id}', this.checked)"></div></div></div></div>`;
  });

  if (!html) {
    html = '<div class="card-x empty"><i class="bi bi-bookmark"></i>Belum ada rekomendasi topik.</div>';
  }
  $('#topikList').innerHTML = html;
}

// id kosong = tambah topik baru
function bukaTopik(id) {
  topikEditId = id || null;
  var t = null;
  if (topikEditId) {
    t = ME.topik.find(function (x) {
      return x.id === topikEditId;
    });
  }

  $('#tTitle').textContent = t ? 'Ubah rekomendasi topik' : 'Tambah rekomendasi topik';
  $('#tJudul').value = t ? t.judul : '';
  $('#tDesk').value = t && t.desk != '-' ? t.desk : '';
  modalTopik.show();
}

function simpanTopik() {
  var judul = $('#tJudul').value.trim();
  if (!judul) {
    toast('Judul topik wajib diisi.', 'danger');
    return;
  }

  var desk = $('#tDesk').value.trim();
  if (desk == '') desk = '-';

  var editId = topikEditId;
  DB.ubahDosen(ME.id, function (dd) {
    if (editId) {
      var t = dd.topik.find(function (x) {
        return x.id === editId;
      });
      if (t) {
        t.judul = judul;
        t.desk = desk;
      }
    } else {
      dd.topik.unshift({ id: 'x' + Date.now(), judul: judul, desk: desk, aktif: true });
    }
  });

  modalTopik.hide();
  toast(editId ? 'Topik diperbarui.' : 'Topik ditambahkan.', 'success');
}

function setTopikAktif(id, nilai) {
  DB.ubahDosen(ME.id, function (dd) {
    var t = dd.topik.find(function (x) {
      return x.id === id;
    });
    if (t) t.aktif = nilai;
  });
  toast(nilai ? 'Topik diaktifkan, tampil di halaman mahasiswa.' : 'Topik dinonaktifkan, disembunyikan dari mahasiswa.', 'dark');
}


// ===== MULAI =====
function initDosen() {
  modalTolak = new bootstrap.Modal('#mTolak');
  modalTopik = new bootstrap.Modal('#mTopik');

  salinProfil();
  drawMasuk();
  drawBimb();
  drawProfil();

  // ketikan nama langsung masuk draft, biar ga ilang pas form digambar ulang
  $('#pNama').addEventListener('input', function () {
    PROF.nama = this.value;
  });

  $('#kwAdd').onclick = addKw;
  $('#kwIn').addEventListener('keydown', function (e) {
    if (e.key == 'Enter') {
      e.preventDefault();
      addKw();
    }
  });
}

// dipanggil tiap data berubah. form profil sengaja ga digambar ulang biar ketikan ga ilang
function gambarUlangDosen() {
  drawMasuk();
  drawBimb();
  drawSaklar();
  drawTopik();
}
