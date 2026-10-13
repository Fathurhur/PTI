// dosen.js
// script halaman dosen (contohnya login sbg Dr. Ade Romadhony)

var ME = DOSEN[0];

// pengajuan yg masuk ke dosen ini
// jam = udah berapa jam sejak diajukan
var MASUK = [
  {id:1, mhs:'Aulia Rahma',   nim:'1202230021', judul:'Analisis Sentimen Ulasan Aplikasi Mobile dengan IndoBERT', asal:'Rekomendasi dosen', jam:20,
   abs:'Penelitian ini menerapkan model IndoBERT untuk mengklasifikasikan sentimen ulasan pengguna aplikasi mobile berbahasa Indonesia, dibandingkan dengan SVM dan Naive Bayes.'},
  {id:2, mhs:'Dimas Prasetyo', nim:'1202220077', judul:'Chatbot Layanan Akademik Berbasis NLP', asal:'Usulan mahasiswa', jam:72,
   abs:'Pengembangan chatbot untuk menjawab pertanyaan akademik mahasiswa menggunakan pemrosesan bahasa alami dan intent classification.'},
  {id:3, mhs:'Nabila Putri',   nim:'1202230055', judul:'Klasifikasi Berita Hoaks dengan Transformer', asal:'Rekomendasi dosen', jam:150,
   abs:'Deteksi berita hoaks bahasa Indonesia menggunakan arsitektur transformer serta evaluasi terhadap dataset berita daring.'}
];

// mahasiswa yg udah dibimbing
var BIMBING = [
  {mhs:'Rafi Aditya',   nim:'1202220101', judul:'Deteksi Ujaran Kebencian di Media Sosial', tgl:'2026-09-20', sp:'SP-TA/2026-1/004'},
  {mhs:'Salsa Maharani',nim:'1202220145', judul:'Ringkasan Teks Otomatis Artikel Berita',   tgl:'2026-09-24', sp:'SP-TA/2026-1/009'},
  {mhs:'Fajar Nugroho', nim:'1202230099', judul:'Sistem Tanya Jawab Dokumen Hukum',        tgl:'2026-10-02', sp:'—'},
  {mhs:'Citra Lestari', nim:'1202230112', judul:'Analisis Emosi Ulasan Wisata',            tgl:'2026-10-05', sp:'—'}
];

var KW = ME.kata.slice(); // kata kunci
var TOPIK = [];
for (var i = 0; i < ME.topik.length; i++) {
  var t = Object.assign({}, ME.topik[i]);
  t.aktif = true;
  TOPIK.push(t);
}
var MENERIMA = true;
var tolakId = null; // id pengajuan yg mau ditolak


// sisa waktu buat dosen ngambil keputusan (batasnya 7x24 jam = 168 jam)
function sisaWaktu(jam) {
  var s = 168 - jam;
  if (s <= 24) {
    // kurang dari sehari, dikasih warna merah
    return `<span style="color:var(--red-dark);font-weight:700">${s} jam lagi</span>`;
  }
  return Math.floor(s / 24) + ' hari ' + (s % 24) + ' jam lagi';
}

// kotak statistik di atas
function drawStats() {
  var terisi = BIMBING.length;

  // [ikon, warna, label, angka]
  var stats = [
    ['bi-people', '', 'Kuota', ME.kuota],
    ['bi-person-check', 'g', 'Terisi', terisi],
    ['bi-door-open', 'b', 'Sisa slot', ME.kuota - terisi],
    ['bi-inbox', 'a', 'Pengajuan masuk', MASUK.length]
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

  if (MASUK.length == 0) {
    $('#masukList').innerHTML = `<div class="card-x empty"><i class="bi bi-inbox"></i>Tidak ada pengajuan yang menunggu keputusan.</div>`;
    return;
  }

  var html = '';
  for (var i = 0; i < MASUK.length; i++) {
    var m = MASUK[i];
    html += `<div class="card-x pad mb-3">
    <div class="d-flex gap-3 flex-wrap">
      <div class="av sm" style="background:${AV_COLORS[m.id+2]}">${initials(m.mhs)}</div>
      <div class="flex-grow-1" style="min-width:240px">
        <div class="d-flex justify-content-between flex-wrap gap-2"><div><b>${m.mhs}</b> <span class="text-muted small">${m.nim}</span></div>
          <span class="sbadge sb-Menunggu"><i class="bi bi-clock me-1"></i>${sisaWaktu(m.jam)}</span></div>
        <div class="fw-bold mt-2">${m.judul}</div>
        <div class="small text-muted my-2" style="line-height:1.6">${m.abs}</div>
        <span class="tag">${m.asal}</span>
        <div class="d-flex gap-2 mt-2"><button class="btn btn-red btn-sm" onclick="terima(${m.id})"><i class="bi bi-check2 me-1"></i>Terima</button>
          <button class="btn btn-ghost btn-sm" onclick="bukaTolak(${m.id})"><i class="bi bi-x me-1"></i>Tolak</button></div>
      </div></div></div>`;
  }
  $('#masukList').innerHTML = html;
}

// cari pengajuan berdasarkan id terus hapus dari list MASUK
function ambilDariMasuk(id) {
  var m = null;
  for (var i = 0; i < MASUK.length; i++) {
    if (MASUK[i].id === id) {
      m = MASUK[i];
      MASUK.splice(i, 1);
      break;
    }
  }
  return m;
}

function terima(id) {
  if (BIMBING.length >= ME.kuota) {
    toast('Kuota penuh, tidak bisa menerima lagi.', 'danger');
    return;
  }

  var m = ambilDariMasuk(id);
  BIMBING.push({
    mhs: m.mhs,
    nim: m.nim,
    judul: m.judul,
    tgl: new Date().toISOString(),
    sp: '—' // belum ada surat penetapan
  });

  drawMasuk();
  drawBimb();
  toast(m.mhs + ' diterima. Menunggu pengesahan koordinator.', 'success');
}

// buka modal tolak
function bukaTolak(id) {
  tolakId = id;
  $('#alasan').value = '';
  $('#alasanErr').textContent = '';
  modalTolak.show();
}

function kirimTolak() {
  var alasan = $('#alasan').value.trim();

  // alasan wajib diisi minimal 10 karakter
  if (alasan.length < 10) {
    $('#alasanErr').textContent = 'Alasan penolakan minimal 10 karakter (sekarang ' + alasan.length + ').';
    return;
  }

  var m = ambilDariMasuk(tolakId);
  modalTolak.hide();
  drawMasuk();
  toast('Pengajuan ' + m.mhs + ' ditolak. Slot dilepas dan antrean diproses.', 'dark');
}

// tabel mahasiswa bimbingan
function drawBimb() {
  var html = '';
  for (var i = 0; i < BIMBING.length; i++) {
    var b = BIMBING[i];

    var statusSP = '';
    if (b.sp == '—') {
      statusSP = '<span class="sbadge sb-Menunggu">Menunggu pengesahan</span>';
    } else {
      statusSP = `<span class="sbadge sb-Ditetapkan">${b.sp}</span>`;
    }

    html += `<tr><td><div class="d-flex align-items-center gap-2"><div class="av xs" style="background:#2457C5">${initials(b.mhs)}</div><div><b>${b.mhs}</b><div class="small text-muted">${b.nim}</div></div></div></td>
    <td>${b.judul}</td><td class="text-nowrap">${fmtDate(b.tgl)}</td><td>${statusSP}</td></tr>`;
  }
  $('#bimbBody').innerHTML = html;

  var jumlah = BIMBING.length;
  $('#bimbSisa').textContent = jumlah + '/' + ME.kuota + ' slot terisi · sisa ' + (ME.kuota - jumlah);
  $('#bimbSlots').innerHTML = slotHTML(ME.kuota, jumlah);
}

// bagian profil (kata kunci & topik)
function drawProfil() {
  var kwHTML = [];
  for (var i = 0; i < KW.length; i++) {
    kwHTML.push(`<span class="chip on" style="background:var(--ink)">${KW[i]}<i class="bi bi-x" style="cursor:pointer" onclick="hapusKw(${i})"></i></span>`);
  }
  $('#kwBox').innerHTML = kwHTML.join(' ');
  $('#kwCount').textContent = KW.length + '/10 kata kunci';

  var topikHTML = '';
  for (var j = 0; j < TOPIK.length; j++) {
    var t = TOPIK[j];
    topikHTML += `<div class="card-x pad mb-2 ${t.aktif?'':'opacity-50'}"><div class="d-flex justify-content-between gap-2"><div><b>${t.judul}</b><div class="small text-muted">${t.desk}</div></div>
    <div class="form-check form-switch"><input class="form-check-input" type="checkbox" ${t.aktif?'checked':''} onchange="TOPIK[${j}].aktif=this.checked;drawProfil()"></div></div></div>`;
  }
  $('#topikList').innerHTML = topikHTML;
}

function hapusKw(i) {
  KW.splice(i, 1);
  drawProfil();
}
