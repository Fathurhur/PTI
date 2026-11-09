<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>{{ $nomor }}</title>
<style>
  body { font-family: DejaVu Sans, sans-serif; font-size: 12px; color: #111; margin: 32px 40px; }
  .kop { text-align: center; border-bottom: 2px solid #b6252a; padding-bottom: 8px; margin-bottom: 20px; }
  .kop h1 { font-size: 16px; margin: 0; }
  .kop p { margin: 2px 0; font-size: 11px; }
  h2 { text-align: center; font-size: 14px; margin: 0; text-decoration: underline; }
  .nomor { text-align: center; margin: 4px 0 20px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  td { padding: 4px 6px; vertical-align: top; }
  td.label { width: 32%; }
  .ttd { width: 45%; margin-left: 55%; margin-top: 40px; }
</style>
</head>
<body>
  <div class="kop">
    <h1>PROGRAM STUDI S1 TEKNOLOGI INFORMASI</h1>
    <p>Universitas Telkom Kampus Surabaya</p>
  </div>

  <h2>SURAT PENETAPAN PEMBIMBING TUGAS AKHIR</h2>
  <p class="nomor">Nomor: {{ $nomor }}</p>

  <p>Koordinator Tugas Akhir Program Studi S1 Teknologi Informasi menetapkan:</p>

  <table>
    <tr><td class="label">Nama Mahasiswa</td><td>: {{ $pengajuan->mahasiswa->user->nama }}</td></tr>
    <tr><td class="label">NIM</td><td>: {{ $pengajuan->mahasiswa->nim }}</td></tr>
    <tr><td class="label">Judul Tugas Akhir</td><td>: {{ $pengajuan->judul }}</td></tr>
    @if ($pengajuan->peminatan)
    <tr><td class="label">Peminatan</td><td>: {{ $pengajuan->peminatan->nama }}</td></tr>
    @endif
    <tr><td class="label">Dosen Pembimbing {{ $pengajuan->peran }}</td><td>: {{ $pengajuan->dosen->user->nama }}</td></tr>
    <tr><td class="label">NIDN</td><td>: {{ $pengajuan->dosen->nidn }}</td></tr>
    <tr><td class="label">Periode</td><td>: {{ $pengajuan->periode->nama }}</td></tr>
  </table>

  <p>sebagai Pembimbing {{ $pengajuan->peran }} Tugas Akhir/Skripsi mahasiswa tersebut. Surat ini berlaku sejak tanggal ditetapkan sampai mahasiswa menyelesaikan Tugas Akhir, kecuali ada perubahan yang ditetapkan kemudian.</p>

  <div class="ttd">
    <p>Surabaya, {{ $tanggal->translatedFormat('d F Y') }}<br>Koordinator Tugas Akhir,</p>
    <br><br><br>
    <p><strong>{{ $koordinator }}</strong></p>
  </div>
</body>
</html>
