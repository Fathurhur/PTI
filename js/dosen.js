// dosen.js
// script halaman dosen. data diambil dari backend (pengajuan yg ditujukan ke dosen ini, profil, topik)

var ME = null;          // data dosen yg login (dari dashboard: kuota, terisi)
var PROFIL = null;      // profil lengkap dari /api/dosen-saya/profil (termasuk topik nonaktif)

var tolakId = null;     // id pengajuan yg mau ditolak
var topikEditId = null; // id topik yg lagi diubah, null = tambah baru
var modalTolak = null;
var modalTopik = null;

// draft profil, baru disimpan ke server pas klik "Simpan profil"
var PROF = null;

function salinProfil() {
  PROF = {
    nama: PROFIL.nama,
    peminatan: PROFIL.peminatan_utama,
    bidang: PROFIL.bidang_keahlian.map(idxBidang),
    kata: PROFIL.kata_kunci.slice()
  };
}

async function muatProfil() {
  var r = await Api.get('/dosen-saya/profil');
  if (r.ok) PROFIL = r.data;
  return r.ok;
}


// ===== DATA =====
// pengajuan masuk = status Menunggu, yg paling lama di atas
function pengajuanMasuk() {
  return DB.data.pengajuan.filter(function (p) {
    return p.dosenId === ME.id && p.status == 'Menunggu';
  }).sort(function (a, b) {
    return (a.tgl || 0) - (b.tgl || 0);
  });
}

// mahasiswa bimbingan = pengajuan Diterima (menunggu pengesahan) dan Ditetapkan, per peran
function daftarBimbingan(peran) {
  return DB.data.pengajuan.filter(function (p) {
    return p.dosenId === ME.id && (p.status == 'Diterima' || p.status == 'Ditetapkan') && peranKe(p) === peran;
  }).sort(function (a, b) {
    return (a.tglKeputusan || 0) - (b.tglKeputusan || 0);
  });
}

function jumlahMenunggu(peran) {
  return DB.data.pengajuan.filter(function (p) {
    return p.dosenId === ME.id && p.status == 'Menunggu' && peranKe(p) === peran;
  }).length;
}

// sisa waktu buat dosen ngambil keputusan (batasnya 7x24 jam)
function sisaWaktu(p) {
  var ms = (p.kedaluwarsa || (p.tgl + BATAS_KEPUTUSAN)) - Date.now();
  var s = Math.max(0, Math.floor(ms / JAM));
  if (s <= 24) {
    return `<span style="color:var(--red-dark);font-weight:700">${s} jam lagi</span>`;
  }
  return Math.floor(s / 24) + ' hari ' + (s % 24) + ' jam lagi';
}


// ===== PENGAJUAN MASUK =====
function drawStats() {
  var stats = [
    ['bi-people', '', 'Pembimbing 1 (terisi/kuota)', ME.terisi + '/' + ME.labelKuota],
    ['bi-people-fill', 'g', 'Pembimbing 2 (terisi/kuota)', ME.terisi2 + '/' + ME.labelKuota2],
    ['bi-inbox', 'a', 'Pengajuan masuk', pengajuanMasuk().length]
  ];

  $('#stats').innerHTML = stats.map(function (s) {
    return `<div class="col-12 col-md-4"><div class="card-x stat"><div class="ico ${s[1]}"><i class="bi ${s[0]}"></i></div><div><b>${esc(s[3])}</b><span>${s[2]}</span></div></div></div>`;
  }).join('');
}

function drawMasuk() {
  drawStats();

  var masuk = pengajuanMasuk();
  if (masuk.length == 0) {
    $('#masukList').innerHTML = `<div class="card-x empty"><i class="bi bi-inbox"></i>Tidak ada pengajuan yang menunggu keputusan.</div>`;
    return;
  }

  $('#masukList').innerHTML = masuk.map(function (m) {
    return `<div class="card-x pad mb-3">
    <div class="d-flex gap-3 flex-wrap">
      <div class="av sm" style="background:${AV_COLORS[(m.id + 2) % AV_COLORS.length]}">${initials(m.mhs)}</div>
      <div class="flex-grow-1" style="min-width:240px">
        <div class="d-flex justify-content-between flex-wrap gap-2"><div><b>${esc(m.mhs)}</b> <span class="text-muted small">${esc(m.nim)}</span></div>
          <span class="sbadge sb-Menunggu"><i class="bi bi-clock me-1"></i>${sisaWaktu(m)}</span></div>
        <div class="fw-bold mt-2">${esc(m.judul)}</div>
        <div class="small text-muted my-2" style="line-height:1.6">${esc(m.abstrak)}</div>
        <span class="tag">Pembimbing ${peranKe(m)}</span>${m.peminatan ? `<span class="tag">${esc(m.peminatan)}</span>` : ''}<span class="tag">${esc(m.asal)}</span>
        <div class="d-flex gap-2 mt-2"><button class="btn btn-red btn-sm" onclick="terima(${m.id}, this)"><i class="bi bi-check2 me-1"></i>Terima</button>
          <button class="btn btn-ghost btn-sm" onclick="bukaTolak(${m.id})"><i class="bi bi-x me-1"></i>Tolak</button></div>
      </div></div></div>`;
  }).join('');
}

async function terima(id, btn) {
  tombolSibuk(btn, true, 'Menyimpan...');
  var r = await DB.terima(id);
  tombolSibuk(btn, false);
  if (!r.ok) {
    toast(r.msg, 'danger');
    return;
  }
  toast(r.p.mhs + ' diterima. Koordinator akan mengesahkan penetapan.', 'success');
}

function bukaTolak(id) {
  tolakId = id;
  $('#alasan').value = '';
  $('#alasanErr').textContent = '';
  modalTolak.show();
}

async function kirimTolak(btn) {
  tombolSibuk(btn, true, 'Menyimpan...');
  var r = await DB.tolak(tolakId, $('#alasan').value);
  tombolSibuk(btn, false);
  if (!r.ok) {
    $('#alasanErr').textContent = r.msg;
    return;
  }
  modalTolak.hide();
  toast('Pengajuan ' + r.p.mhs + ' ditolak. Slot dilepas dan antrean berikutnya dipanggil otomatis.', 'dark');
}


// ===== BIMBINGAN =====
function panelBimbingan(peran) {
  var terisi = peran == 2 ? ME.terisi2 : ME.terisi;
  var kuota = kuotaPeran(ME, peran);
  var label = peran == 2 ? ME.labelKuota2 : ME.labelKuota;
  var sisaSlot = sisa(ME, peran);
  var list = daftarBimbingan(peran);
  var menunggu = jumlahMenunggu(peran);
  var antre = peran == 2 ? ME.antrean2 : ME.antrean;
  var persen = kuota ? Math.min(100, Math.round(terisi / kuota * 100)) : 100;

  var warna = 'ok';
  if (sisaSlot === 0) warna = 'full';
  else if (persen >= 75) warna = 'warn';
  var labelSisa = sisaSlot === 0 ? 'Kuota penuh' : 'Sisa ' + sisaSlot + ' slot';

  var baris = list.map(function (b) {
    var tetap = b.status == 'Ditetapkan'
      ? `<span class="sbadge sb-Ditetapkan">${fmtDate(b.tglSah)}</span>`
      : '<span class="sbadge sb-Menunggu">Menunggu pengesahan</span>';
    return `<tr><td><div class="d-flex align-items-center gap-2"><div class="av xs" style="background:${AV_COLORS[b.id % AV_COLORS.length]}">${initials(b.mhs)}</div>
      <div><b>${esc(b.mhs)}</b><div class="small text-muted">${esc(b.nim)}</div></div></div></td>
      <td>${esc(b.judul)}</td>
      <td class="text-nowrap">${fmtDate(b.tglKeputusan)}</td>
      <td class="text-nowrap">${tetap}</td></tr>`;
  }).join('');
  if (list.length == 0) {
    baris = `<tr><td colspan="4"><div class="empty"><i class="bi bi-people"></i>Belum ada mahasiswa bimbingan sebagai Pembimbing ${peran}.</div></td></tr>`;
  }

  return `<div class="card-x bb-panel mb-4">
    <div class="bb-head">
      <div class="bb-ico p${peran}"><i class="bi bi-${peran == 2 ? 'people-fill' : 'person-workspace'}"></i></div>
      <div class="flex-grow-1"><h5 class="fw-bold mb-0">Dosen Pembimbing ${peran}</h5>
        <div class="small text-muted">Mahasiswa yang Anda bimbing sebagai Pembimbing ${peran}</div></div>
      <div class="bb-count"><b>${terisi}</b><span>/${esc(label)}</span><small>slot terisi</small></div>
    </div>
    <div class="bb-meter"><div class="slots">${slotHTML(kuota, terisi)}</div>
      <div class="bb-facts">
        <span class="bb-fact"><i class="bi bi-patch-check"></i>${list.length} diterima/ditetapkan</span>
        <span class="bb-fact"><i class="bi bi-hourglass-split"></i>${menunggu} menunggu keputusan</span>
        <span class="bb-fact"><i class="bi bi-list-ol"></i>${antre} di antrean</span>
        <span class="bb-fact ${warna}"><i class="bi bi-door-open"></i>${labelSisa}</span>
      </div></div>
    <div style="overflow-x:auto"><table class="table-x"><thead><tr><th>Mahasiswa</th><th>Judul</th><th>Tanggal diterima</th><th>Tanggal penetapan</th></tr></thead><tbody>${baris}</tbody></table></div>
  </div>`;
}

function drawBimb() {
  $('#bimbWrap').innerHTML = panelBimbingan(1) + panelBimbingan(2);
}


// ===== PROFIL (MR-02) =====
function drawProfil() {
  drawSaklar();
  drawFormProfil();
  drawTopik();
}

function drawSaklar() {
  $('#swTerima').checked = ME.menerima;
}

async function setMenerima(nilai) {
  var r = await Api.put('/dosen-saya/profil', { menerima: nilai });
  if (!r.ok) {
    toast(pesanError(r), 'danger');
    drawSaklar();
    return;
  }
  await DB.segarkan();
  toast(nilai ? 'Status: menerima bimbingan. Mahasiswa bisa mengajukan ke Anda.' : 'Status: tidak menerima bimbingan. Tombol ajukan di halaman mahasiswa dinonaktifkan.', 'dark');
}

function drawFormProfil() {
  $('#pNama').value = PROF.nama;
  $('#pNidn').value = PROFIL.nidn;
  $('#pPeminatan').innerHTML = DAFTAR_PEMINATAN.map(function (p) {
    return `<option value="${p}" ${p === PROF.peminatan ? 'selected' : ''}>${p}</option>`;
  }).join('');

  $('#bidangBox').innerHTML = BIDANG.map(function (b, i) {
    var on = PROF.bidang.indexOf(i) != -1 ? 'on' : '';
    return `<button type="button" class="chip ${on}" onclick="toggleBidang(${i})">${esc(b)}</button>`;
  }).join(' ');

  $('#kwBox').innerHTML = PROF.kata.map(function (k, i) {
    return `<span class="chip on" style="background:var(--ink)">${esc(k)}<i class="bi bi-x" style="cursor:pointer" onclick="hapusKw(${i})"></i></span>`;
  }).join(' ');
  $('#kwCount').textContent = PROF.kata.length + '/10 kata kunci';
}

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

function addKw() {
  var kata = $('#kwIn').value.trim().toLowerCase();
  if (kata == '') return;
  if (PROF.kata.length >= 10) {
    toast('Maksimal 10 kata kunci.', 'danger');
    return;
  }
  if (PROF.kata.indexOf(kata) == -1) PROF.kata.push(kata);
  $('#kwIn').value = '';
  drawFormProfil();
}

function hapusKw(i) {
  PROF.kata.splice(i, 1);
  drawFormProfil();
}

async function simpanProfil(btn) {
  var nama = $('#pNama').value.trim();
  if (nama == '' || nama.length > 100) {
    toast('Nama wajib diisi, maksimal 100 karakter.', 'danger');
    return;
  }

  tombolSibuk(btn, true, 'Menyimpan...');
  var r = await Api.put('/dosen-saya/profil', {
    nama: nama,
    peminatan_utama: $('#pPeminatan').value,
    bidang_keahlian: PROF.bidang.map(function (i) { return BIDANG[i]; }),
    kata_kunci: PROF.kata
  });
  tombolSibuk(btn, false);

  if (!r.ok) {
    toast(pesanError(r), 'danger');
    return;
  }

  PROFIL = r.data;
  SESI.user.nama = PROFIL.nama;
  salinProfil();
  drawFormProfil();
  await DB.segarkan();

  $('.user-chip .meta b').textContent = PROFIL.nama;
  $('.user-chip .av').textContent = initials(PROFIL.nama);
  toast('Profil disimpan.', 'success');
}


// ===== TOPIK REKOMENDASI (MR-02) =====
function drawTopik() {
  var html = PROFIL.topik.map(function (t) {
    var aktif = !!t.aktif;
    return `<div class="card-x pad mb-2 ${aktif ? '' : 'opacity-50'}"><div class="d-flex justify-content-between gap-2"><div><b>${esc(t.judul)}</b><div class="small text-muted">${esc(t.deskripsi || '-')}</div></div>
    <div class="d-flex align-items-start gap-2"><button class="btn btn-ghost btn-sm text-nowrap" onclick="bukaTopik(${t.id})"><i class="bi bi-pencil me-1"></i>Ubah</button>
    <div class="form-check form-switch m-0" title="Aktif / nonaktif"><input class="form-check-input" type="checkbox" ${aktif ? 'checked' : ''} onchange="setTopikAktif(${t.id}, this.checked)"></div></div></div></div>`;
  }).join('');

  $('#topikList').innerHTML = html || '<div class="card-x empty"><i class="bi bi-bookmark"></i>Belum ada rekomendasi topik.</div>';
}

function bukaTopik(id) {
  topikEditId = id || null;
  var t = topikEditId ? PROFIL.topik.find(function (x) { return x.id === topikEditId; }) : null;

  $('#tTitle').textContent = t ? 'Ubah rekomendasi topik' : 'Tambah rekomendasi topik';
  $('#tJudul').value = t ? t.judul : '';
  $('#tDesk').value = t ? (t.deskripsi || '') : '';
  modalTopik.show();
}

async function simpanTopik(btn) {
  var judul = $('#tJudul').value.trim();
  if (!judul) {
    toast('Judul topik wajib diisi.', 'danger');
    return;
  }

  var body = { judul: judul, deskripsi: $('#tDesk').value.trim() || null };
  tombolSibuk(btn, true, 'Menyimpan...');
  var r = topikEditId ? await Api.put('/dosen-saya/topik/' + topikEditId, body) : await Api.post('/dosen-saya/topik', body);
  tombolSibuk(btn, false);

  if (!r.ok) {
    toast(pesanError(r), 'danger');
    return;
  }

  modalTopik.hide();
  await muatProfil();
  drawTopik();
  DB.segarkan();
  toast(topikEditId ? 'Topik diperbarui.' : 'Topik ditambahkan.', 'success');
}

async function setTopikAktif(id, nilai) {
  var r = await Api.put('/dosen-saya/topik/' + id, { aktif: nilai });
  if (!r.ok) {
    toast(pesanError(r), 'danger');
  } else {
    toast(nilai ? 'Topik diaktifkan, tampil di halaman mahasiswa.' : 'Topik dinonaktifkan, disembunyikan dari mahasiswa.', 'dark');
  }
  await muatProfil();
  drawTopik();
}


// ===== MULAI =====
async function initDosen() {
  ME = findDosen(SESI.user.dosen_id);
  await muatProfil();

  modalTolak = new bootstrap.Modal('#mTolak');
  modalTopik = new bootstrap.Modal('#mTopik');

  salinProfil();
  drawMasuk();
  drawBimb();
  drawProfil();

  $('#pNama').addEventListener('input', function () {
    PROF.nama = this.value;
  });
  $('#pPeminatan').addEventListener('change', function () {
    PROF.peminatan = this.value;
  });

  $('#kwAdd').onclick = addKw;
  $('#kwIn').addEventListener('keydown', function (e) {
    if (e.key == 'Enter') {
      e.preventDefault();
      addKw();
    }
  });
}

// dipanggil tiap data berubah (polling 5 detik). form profil sengaja ga digambar ulang biar ketikan ga ilang
function gambarUlangDosen() {
  ME = findDosen(SESI.user.dosen_id) || ME;
  drawMasuk();
  drawBimb();
  drawSaklar();
}
