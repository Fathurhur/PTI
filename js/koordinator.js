// koordinator.js
// script buat halaman koordinator TA / kaprodi (MR-07, MR-09, MR-10)
// semua perubahan dikirim ke backend, lalu data dimuat ulang

// kuota yg udah diketik tapi belum disimpan (key: idDosen-peran), biar ga ketiban pas polling
var draftKuota = {};

function gambarSemua() {
  drawRekap();
  drawKuota();
  drawPeriode();
  drawSah();
}


// ===== REKAP BEBAN =====
// satu sel beban: angka terisi/kuota, sisa slot, dan bar warna (hijau aman, kuning >=75%, merah penuh)
function selBeban(terisi, kuota, label) {
  var persen = kuota ? Math.min(100, Math.round(terisi / kuota * 100)) : 100;
  var warna = '';
  if (persen >= 100) warna = 'full';
  else if (persen >= 75) warna = 'warn';

  var sisaSlot = Math.max(0, kuota - terisi);
  var labelSisa = sisaSlot === 0 ? 'Penuh' : 'Sisa ' + sisaSlot;

  return `<td class="rk-cell"><div class="rk-top"><b>${terisi}<span class="rk-kuota">/${esc(label)}</span></b><span class="rk-sisa ${warna}">${labelSisa}</span></div>
    <div class="load-bar"><i class="${warna}" style="width:${persen}%"></i></div></td>`;
}

function drawRekap() {
  var total = 0, isi = 0, aktif = 0, sisa1 = 0, sisa2 = 0;
  DOSEN.forEach(function (d) {
    total += d.kuota + d.kuota2;
    isi += d.terisi + d.terisi2;
    sisa1 += sisa(d, 1);
    sisa2 += sisa(d, 2);
    if (d.menerima) aktif++;
  });

  var stats = [
    ['bi-person-badge', '', 'Dosen aktif', aktif],
    ['bi-pie-chart', 'g', 'Slot terisi (total)', isi + '/' + total],
    ['bi-person', 'b', 'Sisa kuota Pembimbing 1', sisa1],
    ['bi-people', 'a', 'Sisa kuota Pembimbing 2', sisa2]
  ];
  $('#stats').innerHTML = stats.map(function (s) {
    return `<div class="col-6 col-lg-3"><div class="card-x stat"><div class="ico ${s[1]}"><i class="bi ${s[0]}"></i></div><div><b>${s[3]}</b><span>${s[2]}</span></div></div></div>`;
  }).join('');

  var urutDosen = DOSEN.slice().sort(function (a, b) {
    return (b.terisi + b.terisi2) / ((b.kuota + b.kuota2) || 1) - (a.terisi + a.terisi2) / ((a.kuota + a.kuota2) || 1);
  });

  var baris = urutDosen.map(function (d) {
    var tidakTerima = d.menerima ? '' : ' <span class="badge-s nonaktif ms-1">Tidak menerima</span>';
    return `<tr><td><div class="d-flex align-items-center gap-2">${avatar(d, 'xs')}<div><div class="fw-semibold">${esc(d.nama)}${tidakTerima}</div><div class="small text-muted">${esc(d.peminatan)}${d.antrean + d.antrean2 ? ' · ' + (d.antrean + d.antrean2) + ' antre' : ''}</div></div></div></td>
      ${selBeban(d.terisi, d.kuota, d.labelKuota)}
      ${selBeban(d.terisi2, d.kuota2, d.labelKuota2)}
      <td class="rk-total"><b>${d.terisi + d.terisi2}</b><span class="text-muted">/${d.kuota + d.kuota2}</span></td></tr>`;
  }).join('');

  $('#bars').innerHTML = `<div style="overflow-x:auto"><table class="table-x rekap-tabel"><thead><tr>
    <th>Dosen</th><th>Pembimbing 1 (terisi/kuota)</th><th>Pembimbing 2 (terisi/kuota)</th><th class="text-end">Total</th></tr></thead><tbody>${baris}</tbody></table></div>`;

}

// download rekap CSV dari server (MR-07)
function exportCSV() {
  if (!DB.data.periode) {
    toast('Belum ada periode aktif untuk direkap.', 'warning');
    return;
  }
  window.location.href = API_BASE + '/koordinator/rekap.csv';
  toast('Rekap beban dosen diekspor ke CSV.', 'success');
}


// ===== TAMBAH DOSEN =====
var modalDosen = null;

function bukaTambahDosen() {
  if (!modalDosen) modalDosen = new bootstrap.Modal('#mTambahDosen');

  $('#tdBidang').innerHTML = BIDANG.map(function (b, i) {
    return `<label class="chip"><input type="checkbox" class="d-none" name="tdBidang" value="${i}">${esc(b)}</label>`;
  }).join('');
  $$('#tdBidang .chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      setTimeout(function () {
        chip.classList.toggle('on', chip.querySelector('input').checked);
      }, 0);
    });
  });

  ['#tdNama', '#tdNidn', '#tdKata', '#tdEmail', '#tdSandi'].forEach(function (s) {
    $(s).value = '';
  });
  var kuotaAwal = DB.data.periode ? DOSEN.reduce(function (m, d) { return Math.max(m, d.kuotaDasar || 0); }, 0) || 6 : 6;
  $('#tdKuota1').value = kuotaAwal;
  $('#tdKuota2').value = kuotaAwal;
  $('#tdMenerima').checked = true;
  $('#tdErr').textContent = '';
  modalDosen.show();
}

async function simpanDosenBaru(btn) {
  var bidang = $$('input[name=tdBidang]:checked').map(function (x) {
    return BIDANG[Number(x.value)];
  });
  var kata = $('#tdKata').value.split(',').map(function (x) {
    return x.trim().toLowerCase();
  }).filter(function (x) {
    return x != '';
  });

  tombolSibuk(btn, true, 'Menyimpan...');
  var r = await Api.post('/koordinator/dosen', {
    nama: $('#tdNama').value.trim(),
    nidn: $('#tdNidn').value.trim(),
    email: $('#tdEmail').value.trim(),
    kata_sandi: $('#tdSandi').value,
    peminatan_utama: $('#tdPeminatan').value,
    bidang_keahlian: bidang,
    kata_kunci: kata,
    kuota_p1: Number($('#tdKuota1').value),
    kuota_p2: Number($('#tdKuota2').value),
    menerima: $('#tdMenerima').checked
  });
  tombolSibuk(btn, false);

  if (!r.ok) {
    $('#tdErr').textContent = pesanError(r);
    return;
  }

  modalDosen.hide();
  await DB.segarkan();
  toast(r.data.pesan, 'success');
}


// ===== KUOTA DOSEN (MR-07) =====
// baris tabel dibikin sekali, abis itu cuma angkanya yg diupdate biar input yg lagi diketik ga ilang
function drawKuota() {
  var body = $('#kuotaBody');

  var idBaris = $$('tr[data-row]', body).map(function (tr) { return tr.dataset.row; }).join(',');
  var idDosen = DOSEN.map(function (d) { return String(d.id); }).join(',');

  if (idBaris !== idDosen) {
    body.innerHTML = DOSEN.map(function (d) {
      return `<tr data-row="${d.id}"><td><div class="d-flex align-items-center gap-2">${avatar(d, 'xs')}<div><b class="k-nama">${esc(d.nama)}</b><div class="small text-muted">${esc(d.peminatan)}</div></div></div></td>
      <td><input type="number" min="0" max="20" class="form-control form-control-sm mb-1" style="width:90px" data-k="${d.id}" data-p="1"><div class="small text-muted k-info1"></div></td>
      <td><input type="number" min="0" max="20" class="form-control form-control-sm mb-1" style="width:90px" data-k="${d.id}" data-p="2"><div class="small text-muted k-info2"></div></td>
      <td><div class="d-flex align-items-center gap-2"><div class="form-check form-switch m-0"><input class="form-check-input k-saklar" type="checkbox" role="switch" data-s="${d.id}" title="Menerima bimbingan"></div><span class="k-status"></span></div></td>
      <td><button class="btn btn-ghost btn-sm text-nowrap" onclick="bukaSlot(${d.id})"><i class="bi bi-plus-circle me-1"></i>Slot tambahan</button></td></tr>`;
    }).join('');

    // saklar menerima / tidak menerima langsung disimpan
    $$('.k-saklar', body).forEach(function (saklar) {
      saklar.addEventListener('change', async function () {
        var d = findDosen(saklar.dataset.s);
        var r = await Api.put('/koordinator/dosen/' + d.id + '/menerima', { menerima: saklar.checked });
        if (!r.ok) {
          toast(pesanError(r), 'danger');
        } else {
          toast(d.nama + (saklar.checked ? ' sekarang menerima bimbingan.' : ' sekarang tidak menerima bimbingan.'), saklar.checked ? 'success' : 'dark');
        }
        DB.segarkan();
      });
    });

    $$('[data-k]', body).forEach(function (input) {
      input.addEventListener('input', function () {
        draftKuota[input.dataset.k + '-' + input.dataset.p] = input.value;
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
      input.disabled = !DB.data.periode;
      if (draftKuota[kunci] === undefined && document.activeElement !== input) {
        input.value = peran == 2 ? d.kuotaDasar2 : d.kuotaDasar;
      }
      infoKuota(d, peran, input.value);
    });
  });
}

// tulisan "Terisi x · Sisa y" di bawah input kuota
function infoKuota(d, peran, nilaiInput) {
  var row = $('[data-row="' + d.id + '"]');
  var terisi = peran == 2 ? d.terisi2 : d.terisi;
  var tambahan = peran == 2 ? d.tambahan2 : d.tambahan;
  var kuota = nilaiInput === '' ? 0 : Number(nilaiInput);
  var sisaBaru = Math.max(0, kuota + tambahan - terisi);
  $('.k-info' + peran, row).innerHTML = 'Terisi <b>' + terisi + '</b> · Sisa <b>' + sisaBaru + '</b>' + (tambahan ? ' · <span style="color:var(--green)">+' + tambahan + ' tambahan</span>' : '');
}

async function setMenerimaSemua(menerima) {
  var ubah = DOSEN.filter(function (d) { return d.menerima !== menerima; });
  if (ubah.length == 0) {
    toast('Semua dosen sudah ' + (menerima ? 'menerima' : 'tidak menerima') + ' bimbingan.', 'dark');
    return;
  }
  await Promise.all(ubah.map(function (d) {
    return Api.put('/koordinator/dosen/' + d.id + '/menerima', { menerima: menerima });
  }));
  await DB.segarkan();
  toast(ubah.length + ' dosen sekarang ' + (menerima ? 'menerima' : 'tidak menerima') + ' bimbingan.', menerima ? 'success' : 'dark');
}

async function simpanKuota(btn) {
  if (!DB.data.periode) {
    toast('Buka periode terlebih dahulu.', 'warning');
    return;
  }

  // validasi dulu: 0-20 dan tidak di bawah jumlah terisi
  var ubah = [];
  var valid = true;
  $$('[data-k]').forEach(function (input) {
    var d = findDosen(input.dataset.k);
    var peran = Number(input.dataset.p);
    var nilai = Number(input.value);
    var terisi = peran == 2 ? d.terisi2 : d.terisi;
    var salah = input.value === '' || !Number.isInteger(nilai) || nilai < 0 || nilai > 20 || nilai < terisi;
    input.classList.toggle('is-invalid', salah);
    if (salah) valid = false;
    else if (nilai !== (peran == 2 ? d.kuotaDasar2 : d.kuotaDasar)) ubah.push({ d: d, peran: peran, kuota: nilai });
  });

  if (!valid) {
    toast('Kuota harus 0–20 dan tidak boleh di bawah jumlah mahasiswa yang sudah terisi pada peran tersebut.', 'danger');
    return;
  }
  if (ubah.length == 0) {
    toast('Tidak ada perubahan kuota.', 'dark');
    return;
  }

  tombolSibuk(btn, true, 'Menyimpan...');
  var gagal = [];
  var promosi = 0;
  for (var i = 0; i < ubah.length; i++) {
    var u = ubah[i];
    var r = await Api.put('/koordinator/dosen/' + u.d.id + '/kuota', { peran: String(u.peran), kuota: u.kuota });
    if (!r.ok) gagal.push(u.d.nama + ': ' + pesanError(r));
    else promosi += r.data.antrean_dipromosikan || 0;
  }
  tombolSibuk(btn, false);

  draftKuota = {};
  await DB.segarkan();
  if (gagal.length) toast(gagal.join(' '), 'danger');
  else toast(ubah.length + ' kuota tersimpan.' + (promosi ? ' ' + promosi + ' mahasiswa dari antrean dipromosikan.' : ''), 'success');
}


// ===== SLOT TAMBAHAN (MR-07) =====
var slotDosenId = null;
var modalSlot = null;

function bukaSlot(id) {
  if (!DB.data.periode) {
    toast('Buka periode terlebih dahulu.', 'warning');
    return;
  }
  if (!modalSlot) modalSlot = new bootstrap.Modal('#mSlot');
  var d = findDosen(id);
  slotDosenId = id;
  $('#slotDosen').textContent = d.nama + ' · P1 ' + d.terisi + '/' + d.labelKuota + ' · P2 ' + d.terisi2 + '/' + d.labelKuota2;
  $('#slotPeran').value = sisa(d, 1) === 0 ? '1' : sisa(d, 2) === 0 ? '2' : '1';
  $('#slotJumlah').value = 1;
  $('#slotAlasan').value = '';
  $('#slotErr').textContent = '';
  modalSlot.show();
}

async function kirimSlot(btn) {
  var alasan = $('#slotAlasan').value.trim();
  if (alasan.length < 10) {
    $('#slotErr').textContent = 'Alasan minimal 10 karakter (sekarang ' + alasan.length + ').';
    return;
  }
  tombolSibuk(btn, true, 'Menyimpan...');
  var r = await Api.post('/koordinator/dosen/' + slotDosenId + '/slot-tambahan', {
    peran: $('#slotPeran').value,
    jumlah: Number($('#slotJumlah').value),
    alasan: alasan
  });
  tombolSibuk(btn, false);

  if (!r.ok) {
    $('#slotErr').textContent = pesanError(r);
    return;
  }
  modalSlot.hide();
  await DB.segarkan();
  toast(r.data.pesan + (r.data.antrean_dipromosikan ? ' ' + r.data.antrean_dipromosikan + ' mahasiswa dari antrean dipromosikan.' : ''), 'success');
}


// ===== PERIODE (MR-07) =====
// kartu periode cuma digambar ulang kalau periodenya ganti, biar isian yg lagi diketik ga ilang
var kunciPeriode = null;

function drawPeriode() {
  var pr = DB.data.periode;
  var kunci = pr ? 'p' + pr.id : 'kosong';

  if (kunci !== kunciPeriode) {
    kunciPeriode = kunci;
    if (pr) {
      $('#periodeCard').innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-1"><b>${esc(pr.nama)}</b><span id="pStatus"></span></div>
        <div class="small text-muted mb-3">Kode ${esc(pr.kode)} · ${pr.jumlahMhs} mahasiswa Penulisan Proposal</div>
        <label class="form-label fw-bold">Tanggal mulai</label><input type="date" class="form-control mb-3" id="pMulai" value="${pr.mulai}">
        <label class="form-label fw-bold">Tanggal selesai</label><input type="date" class="form-control mb-3" id="pSelesai" value="${pr.selesai}">
        <div class="small text-muted mb-3">Pengajuan di luar periode ditolak sistem.</div>
        <button class="btn btn-ghost w-100 mb-2" onclick="simpanPeriode(this)"><i class="bi bi-save me-1"></i>Simpan tanggal</button>
        <button class="btn btn-ghost text-danger w-100" onclick="tutupPeriode(this)"><i class="bi bi-lock me-1"></i>Tutup periode</button>`;
    } else {
      var thn = new Date().getFullYear();
      $('#periodeCard').innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3"><b>Belum ada periode aktif</b><span class="sbadge sb-Dibatalkan">Ditutup</span></div>
        <label class="form-label fw-bold">Nama periode</label><input class="form-control mb-3" id="bNama" placeholder="Contoh: Genap ${thn}/${thn + 1}">
        <label class="form-label fw-bold">Kode <span class="text-muted fw-normal">(dipakai di nomor surat)</span></label><input class="form-control mb-3" id="bKode" placeholder="Contoh: ${thn}-2">
        <label class="form-label fw-bold">Tanggal mulai</label><input type="date" class="form-control mb-3" id="bMulai" value="${tglLokal()}">
        <label class="form-label fw-bold">Tanggal selesai</label><input type="date" class="form-control mb-3" id="bSelesai">
        <label class="form-label fw-bold">Jumlah mahasiswa Penulisan Proposal</label><input type="number" min="0" class="form-control mb-2" id="bJumlah" placeholder="Contoh: 42">
        <div class="small text-muted mb-3">Kuota Pembimbing 1 dan 2 tiap dosen dihitung otomatis: jumlah mahasiswa ÷ dosen aktif (dibulatkan ke atas).</div>
        <button class="btn btn-red w-100" onclick="bukaPeriode(this)"><i class="bi bi-unlock me-1"></i>Buka periode</button>`;
    }
  }

  if (pr && $('#pStatus')) {
    $('#pStatus').innerHTML = periodeAktif().ok
      ? '<span class="live">Periode dibuka</span>'
      : '<span class="sbadge sb-Menunggu" title="Mahasiswa tetap tidak bisa mengajukan">Di luar rentang tanggal</span>';
  }
}

async function simpanPeriode(btn) {
  var mulai = $('#pMulai').value;
  var selesai = $('#pSelesai').value;
  if (!mulai || !selesai || mulai >= selesai) {
    toast('Tanggal mulai dan selesai wajib diisi, dan tanggal selesai harus setelah tanggal mulai.', 'danger');
    return;
  }
  tombolSibuk(btn, true, 'Menyimpan...');
  var r = await Api.put('/koordinator/periode/' + DB.data.periode.id, { tgl_mulai: mulai, tgl_selesai: selesai });
  tombolSibuk(btn, false);
  if (!r.ok) {
    toast(pesanError(r), 'danger');
    return;
  }
  await DB.segarkan();
  toast('Tanggal periode disimpan: ' + fmtDate(mulai) + ' – ' + fmtDate(selesai) + '.', 'success');
}

async function tutupPeriode(btn) {
  var pr = DB.data.periode;
  if (!confirm('Tutup periode ' + pr.nama + '? Mahasiswa tidak bisa mengajukan lagi, dan periode baru harus dibuka untuk melanjutkan.')) return;
  tombolSibuk(btn, true, 'Menutup...');
  var r = await Api.post('/koordinator/periode/' + pr.id + '/tutup');
  tombolSibuk(btn, false);
  if (!r.ok) {
    toast(pesanError(r), 'danger');
    return;
  }
  await DB.segarkan();
  toast('Periode ditutup. Mahasiswa tidak bisa mengajukan.', 'dark');
}

async function bukaPeriode(btn) {
  var body = {
    nama: $('#bNama').value.trim(),
    kode: $('#bKode').value.trim(),
    tgl_mulai: $('#bMulai').value,
    tgl_selesai: $('#bSelesai').value,
    jumlah_mhs_proposal: Number($('#bJumlah').value)
  };
  tombolSibuk(btn, true, 'Membuka...');
  var r = await Api.post('/koordinator/periode', body);
  tombolSibuk(btn, false);
  if (!r.ok) {
    toast(pesanError(r), 'danger');
    return;
  }
  await DB.segarkan();
  toast(r.data.pesan, 'success');
}


// ===== PENETAPAN PEMBIMBING (MR-07) =====
var kataCariSah = '';
var filterSah = 'semua';

// pembimbing aktif mahasiswa untuk peran tertentu
function pembimbingAktif(nim, peran) {
  var cocok = DB.data.pengajuan.filter(function (x) {
    return x.nim === nim && peranKe(x) === peran && STATUS_SLOT.indexOf(x.status) != -1;
  });
  return cocok.find(function (x) { return x.status == 'Ditetapkan'; }) || cocok[0] || null;
}

function daftarMahasiswaSah() {
  var peta = {};
  DB.data.pengajuan.forEach(function (p) {
    if (STATUS_SLOT.indexOf(p.status) == -1) return;
    if (!peta[p.nim]) peta[p.nim] = { nim: p.nim, nama: p.mhs };
  });

  var hasil = Object.keys(peta).map(function (nim) {
    var m = peta[nim];
    m.p1 = pembimbingAktif(nim, 1);
    m.p2 = pembimbingAktif(nim, 2);
    m.judul = (m.p1 || m.p2).judul;
    return m;
  });

  if (filterSah === 'sahkan') {
    hasil = hasil.filter(function (m) {
      return [m.p1, m.p2].some(function (p) { return p && p.status == 'Diterima'; });
    });
  }

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

function slotPembimbingHTML(m, peran, p) {
  if (!p) {
    return `<div class="pt-slot kosong"><div class="pt-label">Pembimbing ${peran}</div>
      <div class="text-muted small">Belum ada Pembimbing ${peran}.</div></div>`;
  }

  var d = dosenAtau(p.dosenId);
  var status = '';
  var aksi = '';

  if (p.status == 'Ditetapkan') {
    status = `<span class="sbadge sb-Ditetapkan"><i class="bi bi-patch-check me-1"></i>Ditetapkan ${fmtDate(p.tglSah)}</span>`;
    aksi = `<a class="btn btn-ghost btn-sm w-100" target="_blank" href="${API_BASE}/pengajuan/${p.id}/surat"><i class="bi bi-file-earmark-pdf me-1"></i>${esc(p.nomorSurat || 'Unduh surat')}</a>`;
  } else if (p.status == 'Diterima') {
    status = `<span class="sbadge sb-Diterima"><i class="bi bi-check2 me-1"></i>Diterima dosen ${fmtDate(p.tglKeputusan)}</span>`;
    aksi = `<button class="btn btn-red btn-sm w-100" onclick="sahkan(${p.id}, this)"><i class="bi bi-patch-check me-1"></i>Sahkan &amp; terbitkan surat</button>`;
  } else {
    status = `<span class="sbadge sb-Menunggu"><i class="bi bi-clock me-1"></i>Menunggu dosen</span>`;
    aksi = `<button class="btn btn-ghost btn-sm w-100" onclick="bukaPindah(${p.id})"><i class="bi bi-arrow-left-right me-1"></i>Pindahkan Pembimbing ${peran}</button>`;
  }

  return `<div class="pt-slot"><div class="pt-label">Pembimbing ${peran}${p.peminatan ? ' · ' + esc(p.peminatan) : ''}</div>
    <div class="d-flex align-items-center gap-2 mb-2">${avatar(d, 'sm')}<div class="min-w-0"><b class="d-block text-truncate">${esc(d.nama)}</b>
      <span class="small text-muted">Sisa kuota Pembimbing ${peran}: ${sisa(d, peran)}</span></div></div>
    <div class="d-flex flex-wrap gap-1 mb-2">${status}</div>
    ${aksi}</div>`;
}

function drawSah() {
  var wadah = $('#sahList');
  if (!wadah) return;

  var semua = DB.data.pengajuan.filter(function (p) { return p.status == 'Diterima'; }).length;
  $('#sahFilter').innerHTML = `<button class="chip ${filterSah == 'semua' ? 'on' : ''}" onclick="setFilterSah('semua')">Semua</button>
    <button class="chip ${filterSah == 'sahkan' ? 'on' : ''}" onclick="setFilterSah('sahkan')">Perlu disahkan (${semua})</button>`;

  var list = daftarMahasiswaSah();
  $('#sahCount').textContent = list.length + ' mahasiswa';

  if (list.length == 0) {
    wadah.innerHTML = `<div class="col-12"><div class="card-x empty"><i class="bi bi-person-x"></i>Tidak ada mahasiswa yang cocok.</div></div>`;
    return;
  }

  wadah.innerHTML = list.map(function (m) {
    return `<div class="col-lg-6"><div class="card-x pad pt-card">
      <div class="d-flex align-items-center gap-3 mb-3">
        <div class="av sm" style="background:${AV_COLORS[(m.nim.length + m.nama.length) % AV_COLORS.length]}">${initials(m.nama)}</div>
        <div class="min-w-0"><b class="d-block text-truncate">${esc(m.nama)}</b><span class="small text-muted">${esc(m.nim)}</span></div></div>
      <div class="pt-judul"><i class="bi bi-journal-text me-1"></i>${esc(m.judul)}</div>
      <div class="row g-2">
        <div class="col-sm-6">${slotPembimbingHTML(m, 1, m.p1)}</div>
        <div class="col-sm-6">${slotPembimbingHTML(m, 2, m.p2)}</div>
      </div></div></div>`;
  }).join('');
}

function setFilterSah(f) {
  filterSah = f;
  drawSah();
}

function cariSah(nilai) {
  kataCariSah = nilai;
  drawSah();
}

async function sahkan(id, btn) {
  var p = DB.cari(id);
  var d = dosenAtau(p.dosenId);
  if (!confirm('Sahkan ' + d.nama + ' sebagai Pembimbing ' + peranKe(p) + ' ' + p.mhs + ' dan terbitkan surat penetapan?')) return;

  tombolSibuk(btn, true, 'Menerbitkan...');
  var r = await Api.post('/koordinator/pengajuan/' + id + '/sahkan');
  tombolSibuk(btn, false);
  if (!r.ok) {
    toast(pesanError(r), 'danger');
    return;
  }
  await DB.segarkan();
  toast('Penetapan disahkan. Nomor surat: ' + r.data.surat.nomor_surat + '.', 'success');
}


// ===== PINDAHKAN PENGAJUAN (MR-07) =====
var pindahState = null;
var modalPindah = null;

function bukaPindah(id) {
  var p = DB.cari(id);
  if (!p) return;
  var peran = peranKe(p);
  var lama = dosenAtau(p.dosenId);
  pindahState = { id: p.id };

  if (!modalPindah) modalPindah = new bootstrap.Modal('#mPindah');

  $('#pindahJudul').textContent = 'Pindahkan Pembimbing ' + peran;
  $('#pindahInfo').innerHTML = `<div class="pt-alur"><div><span class="small text-muted d-block">Mahasiswa</span><b>${esc(p.mhs)}</b><div class="small text-muted">${esc(p.nim)}</div></div>
    <div class="pt-panah"><i class="bi bi-arrow-right"></i></div>
    <div><span class="small text-muted d-block">Dari</span><b>${esc(lama.nama)}</b>${p.peminatan ? '<div class="small text-muted">Peminatan ' + esc(p.peminatan) + '</div>' : ''}</div></div>`;

  // dosen yg udah jadi pembimbing lain mahasiswa ini ga bisa dipilih
  var lainnya = DB.data.pengajuan.filter(function (x) {
    return x.nim === p.nim && STATUS_SLOT.indexOf(x.status) != -1 && x.id !== p.id;
  }).map(function (x) { return x.dosenId; });

  $('#pindahDaftar').innerHTML = DOSEN.filter(function (d) {
    return d.id !== lama.id && lainnya.indexOf(d.id) == -1;
  }).map(function (d) {
    var s = sisa(d, peran);
    var alasan = '';
    if (peran == 1 && p.peminatan && d.peminatan !== p.peminatan) alasan = 'Peminatan ' + d.peminatan;
    else if (s === 0) alasan = 'Kuota penuh';

    var badge = alasan
      ? `<span class="pick-badge penuh">${esc(alasan)}</span>`
      : `<span class="pick-badge ok">Sisa ${s} slot</span>`;

    return `<label class="pick-item ${alasan ? 'opacity-50' : ''}"><input type="radio" name="pindahDosen" value="${d.id}" ${alasan ? 'disabled' : ''}>
      ${avatar(d, 'xs')}<div class="flex-grow-1 min-w-0"><b class="d-block text-truncate">${esc(d.nama)}</b>
      <span class="small text-muted">${esc(d.peminatan)} · Pembimbing ${peran}: ${peran == 2 ? d.terisi2 + '/' + d.labelKuota2 : d.terisi + '/' + d.labelKuota} terisi</span></div>${badge}</label>`;
  }).join('');

  $$('#pindahDaftar .pick-item').forEach(function (item) {
    item.addEventListener('click', function () {
      if (item.querySelector('input').disabled) return;
      $$('#pindahDaftar .pick-item').forEach(function (x) {
        x.classList.toggle('on', x === item);
      });
    });
  });

  $('#pindahAlasan').value = '';
  $('#pindahErr').textContent = '';
  modalPindah.show();
}

async function kirimPindah(btn) {
  var terpilih = $('input[name=pindahDosen]:checked');
  var alasan = $('#pindahAlasan').value.trim();

  if (!terpilih) {
    $('#pindahErr').textContent = 'Pilih dosen tujuan terlebih dahulu.';
    return;
  }
  if (alasan.length < 10) {
    $('#pindahErr').textContent = 'Alasan pemindahan minimal 10 karakter (sekarang ' + alasan.length + ').';
    return;
  }

  tombolSibuk(btn, true, 'Memindahkan...');
  var r = await Api.post('/koordinator/pengajuan/' + pindahState.id + '/pindahkan', { dosen_tujuan_id: Number(terpilih.value), alasan: alasan });
  tombolSibuk(btn, false);

  if (!r.ok) {
    $('#pindahErr').textContent = pesanError(r);
    return;
  }
  modalPindah.hide();
  await DB.segarkan();
  toast('Pengajuan dipindahkan ke ' + findDosen(terpilih.value).nama + '. Notifikasi dikirim ke mahasiswa dan kedua dosen.', 'success');
}


// ===== IMPOR CSV =====
var KOLOM_IMPOR = {
  pengguna: 'Kolom: peran, nama, email, kata_sandi, nim, angkatan, nidn, peminatan (mahasiswa isi nim + angkatan, dosen isi nidn + peminatan)',
  arsip: 'Kolom: judul, tahun, abstrak (opsional), sumber (opsional). Dipakai untuk pemeriksaan kemiripan judul.'
};

function jenisImpor() {
  return $('input[name=jenisImpor]:checked').value;
}

function initImpor() {
  var dz = $('#dropzone');
  var inp = $('#fileCsv');

  function syncJenis() {
    $$('#jenisImpor .chip').forEach(function (c) {
      c.classList.toggle('on', c.querySelector('input').checked);
    });
    $('#kolomImpor').textContent = KOLOM_IMPOR[jenisImpor()];
  }
  $$('input[name=jenisImpor]').forEach(function (r) {
    r.addEventListener('change', syncJenis);
  });
  syncJenis();

  async function prosesFile(f) {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) {
      toast('Berkas harus berformat .csv', 'danger');
      return;
    }

    var info = $('#fileInfo');
    info.innerHTML = `<div class="hint-box mt-3"><span class="spinner-border spinner-border-sm me-2"></span>Mengimpor <b>${esc(f.name)}</b>...</div>`;

    var fd = new FormData();
    fd.append('berkas', f);
    var r = await Api.post('/koordinator/impor/' + jenisImpor(), fd);
    inp.value = '';

    if (!r.ok) {
      info.innerHTML = `<div class="warn-box mt-3"><i class="bi bi-x-circle me-1"></i>${esc(pesanError(r))}</div>`;
      return;
    }

    var galat = r.data.galat || [];
    var tabel = galat.length
      ? `<div class="mt-2 small"><b>${galat.length} baris dilewati:</b><ul class="mb-0">${galat.slice(0, 20).map(function (g) { return '<li>Baris ' + g.baris + ': ' + esc(g.pesan) + '</li>'; }).join('')}</ul></div>`
      : '';
    info.innerHTML = `<div class="${galat.length ? 'warn-box' : 'ok-box'} mt-3"><i class="bi bi-file-earmark-check me-1"></i><b>${esc(f.name)}</b>: ${esc(r.data.pesan)}${tabel}</div>`;
    DB.segarkan();
  }

  dz.onclick = function () {
    inp.click();
  };
  inp.onchange = function () {
    prosesFile(inp.files[0]);
  };

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
