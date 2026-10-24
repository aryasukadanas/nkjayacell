# Setup login admin melalui Google Apps Script

## Perubahan yang disiapkan

- `admin.html`, `admin.css`, dan `admin.js` berisi tampilan login username/password, logout, sesi persisten 30 hari yang diperpanjang saat dipakai, serta pembacaan data admin lewat `google.script.run`.
- `apps-script-admin-auth.gs` berisi fungsi server untuk login, validasi/logout sesi, pembatasan percobaan login, pembacaan sheet admin, dan pembaruan status transaksi setelah sesi diverifikasi.
- Panel rekap menampilkan ringkasan transaksi, kartu transaksi responsif, salin ID/nomor, ubah status, edit catatan, dan cetak struk thermal 58 mm. Perubahan status ditulis ke Google Sheets; edit detail lainnya tetap tersimpan lokal di browser/perangkat.
- Cetak Bluetooth dijalankan pada halaman HTTPS mandiri `admin-printer.html`, bukan di iframe Google Apps Script. Panel mengirim isi struk ke tab web printer; printer perlu dihubungkan dari tab tersebut menggunakan browser yang mendukung Web Bluetooth.

Panel HTML ini harus dibuka dari deployment Apps Script, bukan dari file statis/Live Server. Source Apps Script yang ada di akun Google Anda tidak otomatis berubah ketika file lokal diedit.

## Instal panel admin seperti aplikasi (PWA)

PWA admin adalah halaman pembuka `admin-app.html` yang di-host bersama website statis; halaman ini membuka panel Apps Script dan halaman printer mandiri. PWA menyimpan launcher saja, bukan data transaksi atau login offline.

1. Upload `admin-app.html`, `admin-printer.html`, `admin-app.webmanifest`, `admin-app-192.png`, `admin-app-512.png`, `icon.png`, dan `sw.js` versi terbaru ke root hosting website yang sama dan menggunakan HTTPS. Jangan buka PWA dari URL Google Apps Script atau `file://`.
2. Buka URL `https://alamat-website-anda/admin-app.html` di Android Chrome atau iPhone Safari. Pastikan halaman menampilkan status service worker berhasil.
3. Android: tekan **Instal aplikasi** jika browser menawarkannya. Jika tombol menampilkan petunjuk, gunakan menu Chrome → **Instal aplikasi** atau **Tambahkan ke layar utama**. iPhone: menu **Bagikan** Safari → **Tambahkan ke Layar Utama**.
4. Buka `https://alamat-website-anda/admin-printer.html` di Chrome Android untuk memastikan halaman printer bisa dibuka. Hubungkan printer di halaman itu untuk menguji Web Bluetooth.
5. Login di panel admin, buka **Pengaturan printer thermal**, isi URL HTTPS halaman printer (contoh `https://alamat-website-anda/admin-printer.html`), lalu tekan **Simpan URL web printer**.
6. Cetak struk dari panel. Browser membuka tab web printer; bila printer belum terhubung, tekan **Hubungkan printer Bluetooth** atau **Cetak struk yang diterima** di tab tersebut. Biarkan tab printer terbuka untuk cetak berikutnya.

Gunakan hanya URL halaman printer milik website yang Anda percaya, karena data transaksi pada struk dikirim ke domain itu. Tidak semua printer Bluetooth kompatibel: perangkat harus menyediakan koneksi Bluetooth GATT yang dapat ditulis ESC/POS. Panel dan transaksi tetap memerlukan internet.

## Memasang ke project Apps Script

1. Di editor Apps Script, tambahkan isi `apps-script-admin-auth.gs` sebagai file `.gs` baru.
2. Buat file HTML bernama `admin`. Salin isi `admin.html` ke file tersebut. Kode `<?!= ... ?>` di dalamnya harus tetap ada.
3. Buat file HTML bernama `admin-css`. Salin isi `admin.css` ke dalam file tersebut, dibungkus dengan `<style>` dan `</style>`.
4. Buat file HTML bernama `admin-js`. Salin isi `admin.js` ke dalam file tersebut, dibungkus dengan `<script>` dan `</script>`.
5. Pada `doGet(e)` yang sudah ada, tambahkan pemeriksaan berikut sebagai baris pertama di dalam fungsi, sebelum logika riwayat transaksi:

   ```javascript
   if (e && e.parameter && e.parameter.page === 'admin') return serveAdminPanel_();
   ```

   Jangan membuat `doGet` kedua. URL panel akan berbentuk URL deployment `/exec?page=admin`; pemanggilan riwayat lama `?nomor=...` tetap memakai alur yang ada.
6. Di **Project Settings → Script Properties**, tambahkan:
   - `ADMIN_USERNAME` — username admin pilihan Anda.
   - `ADMIN_PASSWORD` — password admin yang kuat. Jangan simpan password di file source.
   - `ADMIN_SHEET_PLN` — nama tab sheet PLN yang sebenarnya, jika bukan `NAMA PLN`.
7. Simpan project lalu deploy ulang sebagai **Web app**, jalankan sebagai akun pemilik spreadsheet, dan beri akses kepada pengguna yang perlu membuka halaman login. Buka deployment dengan `?page=admin`.
8. Jika perlu, ganti tautan `index.html` pada template admin dengan URL homepage website Anda; tautan relatif tersebut tidak otomatis menuju file website dari domain Apps Script.

Saat dropdown status diubah, fungsi `updateAdminTransactionStatus` memvalidasi sesi admin, mencari ID transaksi yang unik, lalu memperbarui sel status di sheet. Header kolom harus bernama `STATUS` atau `STATUS TRANSAKSI`; posisinya harus kolom G untuk `ARSIP` dan kolom J untuk `Transfer`, mengikuti kolom yang dibaca website. ID yang kosong/duplikat atau posisi kolom yang berbeda akan ditolak dengan pesan error, bukan mengubah transaksi yang salah. Setelah fungsi Apps Script dan file admin diperbarui, deploy versi baru. Website membaca status dari CSV publik Google Sheets; perubahan akan tampil setelah data publik tersebut diperbarui dan halaman/riwayat dimuat ulang.

## Catatan cakupan dan keamanan

Pilihan saat ini hanya melindungi akses dari panel admin. Sesuai keputusan untuk mempertahankan alur website yang sudah ada, CSV ARSIP/Transfer/PLN di `config.js` tidak dinonaktifkan. URL CSV yang masih dipublikasikan tetap dapat dibaca siapa pun tanpa login; password panel **tidak** membuat isi sheet tersebut privat. Untuk menutup akses itu, lookup pelanggan di `script.js` dan `transfer.js` perlu lebih dulu dipindahkan ke API yang hanya mengembalikan hasil lookup yang dibutuhkan, lalu publikasi CSV terkait dihentikan.

Jangan membagikan password admin atau token sesi. Sesi disimpan di browser sampai logout, dan kedaluwarsa setelah 30 hari tanpa aktivitas.
