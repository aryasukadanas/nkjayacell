// ==========================================
// LOGIKA TRANSFER BANK - NK JAYA CELL (V3.1 LIVE DATABASES)
// ==========================================

let databaseAdminBank = [];
let databasePelangganSheet = []; // Menampung data nama pemilik rekening dari spreadsheet

// Variabel Global untuk menampung URL Web App Google Apps Script Anda
const URL_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbwQKdBfsrmlEBlKlVZiY02jx8HeIW2AtTQrE4_tcXThibDH6X9py965fHMRj--QBiH-/exec";

/**
 * Fungsi pembantu untuk memecah baris CSV dengan aman meskipun ada tanda koma di dalam nama/teks
 */
function parseCSVRow(row) {
    let insideQuote = false;
    let entries = [];
    let entry = '';
    
    for (let i = 0; i < row.length; i++) {
        let char = row[i];
        if (char === '"') {
            insideQuote = !insideQuote;
        } else if (char === ',' && !insideQuote) {
            entries.push(entry.trim());
            entry = '';
        } else {
            entry += char;
        }
    }
    entries.push(entry.trim());
    return entries;
}

/**
 * Mengambil data tarif admin dan data riwayat/pelanggan dari Google Sheets
 */
async function fetchTarifAdminBank() {
    try {
        // 1. Ambil Data Aturan Bank (Dari ADMIN_BANK_URL)
        const res = await fetch(ADMIN_BANK_URL);
        const text = await res.text();
        const rows = text.split(/\r?\n/).slice(1);
        
        databaseAdminBank = rows.map(row => {
            if (!row.trim()) return null;
            const cols = parseCSVRow(row); 
            return { 
                bank: cols[0]?.toUpperCase(), 
                min: parseInt(cols[1]) || 0, 
                max: parseInt(cols[2]) || 0, 
                fee: parseInt(cols[3]) || 0 
            };
        }).filter(item => item !== null && item.bank !== "" && item.bank !== undefined);

        renderDaftarBank();

        // 2. Ambil Data Riwayat Pelanggan (Dari SHEET_REKENING_URL atau RIWAYAT_SALES_URL)
        const urlRekeningLive = typeof SHEET_REKENING_URL !== 'undefined' ? SHEET_REKENING_URL : (typeof RIWAYAT_SALES_URL !== 'undefined' ? RIWAYAT_SALES_URL : null);
        
        if (urlRekeningLive) {
            const resPelanggan = await fetch(urlRekeningLive);
            const textPelanggan = await resPelanggan.text();
            const rowsPelanggan = textPelanggan.split(/\r?\n/).slice(1);
            
            databasePelangganSheet = rowsPelanggan.map(row => {
                if (!row.trim()) return null;
                const cols = parseCSVRow(row);
                return {
                    // Kolom A (cols[0]) = Nomor Rekening, Kolom B (cols[1]) = Nama Pemilik
                    norek: cols[0]?.replace(/\D/g, '').trim(), 
                    nama: cols[1]?.replace(/"/g, "").trim().toUpperCase()
                };
            }).filter(item => item !== null && item.norek && item.nama);
            
            console.log("Database Nama Rekening Berhasil Dimuat! Total:", databasePelangganSheet.length);
        } else {
            console.warn("URL database rekening (SHEET_REKENING_URL) belum dikonfigurasi di config.js");
        }

    } catch (e) { 
        console.error("Gagal sinkron database bank/pelanggan:", e); 
    }
}

/**
 * Menampilkan daftar bank ke dalam dropdown select
 */
function renderDaftarBank() {
    const selectBank = document.getElementById('bank-tujuan');
    if (!selectBank) return;

    const listBankUnik = [...new Set(databaseAdminBank.map(item => item.bank))];

    if (listBankUnik.length === 0) {
        selectBank.innerHTML = '<option value="">Gagal memuat daftar bank</option>';
        return;
    }

    selectBank.innerHTML = '<option value="">-- PILIH BANK --</option>' + 
        listBankUnik.map(nama => `<option value="${nama}">${nama}</option>`).join('');
    
    hitungTotal();
}

/**
 * Format Nomor Rekening otomatis memberikan spasi setiap 4 digit
 */
function formatSpasiRekening(value) {
    let v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    let matches = v.match(/\d{4,16}/g);
    let match = matches && matches[0] || '';
    let parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
        parts.push(match.substring(i, i + 4));
    }

    if (parts.length > 0) {
        return parts.join(' ');
    } else {
        return v;
    }
}

/**
 * Membaca buku kontak bawaan Handphone (Android / iOS terupdate)
 */
async function pilihDariKontak() {
    const norekEl = document.getElementById('no-rekening');
    
    if ('contacts' in navigator && 'select' in navigator.contacts) {
        try {
            const props = ['name', 'tel'];
            const opts = { multiple: false };
            const contacts = await navigator.contacts.select(props, opts);
            
            if (contacts.length > 0 && contacts[0].tel && contacts[0].tel.length > 0) {
                let nomorMentah = contacts[0].tel[0].replace(/\D/g, '');
                if(norekEl) {
                    norekEl.value = formatSpasiRekening(nomorMentah);
                    cekNamaPemilikRekening(nomorMentah);
                }
            }
        } catch (err) {
            console.error("Gagal membuka buku kontak:", err);
            alert("Gagal memuat kontak atau izin ditolak.");
        }
    } else {
        alert("Fitur ambil kontak tidak didukung oleh browser/perangkat ini. Silakan ketik manual.");
    }
}

/**
 * SINKRONISASI UTAMA: Mencocokkan nomor rekening otomatis dengan database Live Spreadsheet
 * Menampilkan teks nama tepat di bawah input nomor rekening tujuan
 */
function cekNamaPemilikRekening(nomorMentah) {
    const validArea = document.getElementById('rekening-valid');
    const namaLabel = document.getElementById('nama-pemilik-terdeteksi');
    const rincianTujuan = document.getElementById('rincian-tujuan');
    const namaBaruBox = document.getElementById('input-nama-baru-box');
    const inputNamaBaru = document.getElementById('nama-pelanggan-baru');

    const bank = document.getElementById('bank-tujuan')?.value || "";
    const cleanNorek = nomorMentah.replace(/\s+/g, '').replace(/\D/g, '');

    if (cleanNorek.length < 5) {
        if (validArea) validArea.classList.add('hidden');
        if (namaBaruBox) namaBaruBox.classList.add('hidden');
        if (rincianTujuan) rincianTujuan.innerText = "-";
        return;
    }

    const dataKetemu = databasePelangganSheet.find(p => p.norek === cleanNorek);

    if (dataKetemu) {
        // Jika Rekening Sudah Terdaftar di Spreadsheet
        if (validArea && namaLabel) {
            namaLabel.innerText = dataKetemu.nama;
            validArea.classList.remove('hidden');
        }
        if (namaBaruBox) {
            namaBaruBox.classList.add('hidden'); // Sembunyikan input nama manual
        }
        if (rincianTujuan) rincianTujuan.innerText = `${bank} - ${dataKetemu.nama}`;
    } else {
        // Jika Rekening Belum Ada di Spreadsheet (Pelanggan Baru)
        if (validArea && namaLabel) {
            namaLabel.innerText = "PELANGGAN BARU";
            validArea.classList.remove('hidden');
        }
        if (namaBaruBox) {
            namaBaruBox.classList.remove('hidden'); // TAMPILKAN input nama manual
        }
        
        // Buat rincian dinamis mengikuti input yang diketik user
        let namaKetik = inputNamaBaru ? inputNamaBaru.value.trim().toUpperCase() : "";
        if (rincianTujuan) {
            rincianTujuan.innerText = namaKetik ? `${bank} - ${namaKetik}` : `${bank} (${formatSpasiRekening(cleanNorek)})`;
        }
    }
}

/**
 * Format Angka menjadi Pemisah Titik (Ribuan)
 */
function formatRibuan(angka) {
    let number_string = angka.replace(/[^,\d]/g, '').toString(),
        split = number_string.split(','),
        sisa = split[0].length % 3,
        rupiah = split[0].substr(0, sisa),
        ribuan = split[0].substr(sisa).match(/\d{3}/gi);

    if (ribuan) {
        let separator = sisa ? '.' : '';
        rupiah += separator + ribuan.join('.');
    }
    return split[1] != undefined ? rupiah + ',' + split[1] : rupiah;
}

/**
 * Menghitung biaya admin secara otomatis berdasarkan Bank & Nominal
 */
function hitungAdminSpesifik() {
    const bankDipilih = document.getElementById('bank-tujuan')?.value.toUpperCase();
    const inputNominal = document.getElementById('nominal-transfer');
    
    const nominalRaw = inputNominal?.value.replace(/\./g, '') || "0";
    const nominal = parseInt(nominalRaw) || 0;

    const tarif = databaseAdminBank.find(t => 
        t.bank === bankDipilih && 
        nominal >= t.min && 
        nominal <= t.max
    );

    return tarif ? tarif.fee : 5000;
}

/**
 * Menghitung Total dan Menyinkronkan Tampilan Rincian ke Bawah
 */
function hitungTotal() {
    const inputNominal = document.getElementById('nominal-transfer')?.value || "0";
    const nominalRaw = inputNominal.replace(/\./g, '');
    const nominal = parseInt(nominalRaw) || 0;
    
    const admin = hitungAdminSpesifik();
    const total = nominal + admin;

    const elRincianNominal = document.getElementById('rincian-nominal');
    const elRincianAdmin = document.getElementById('rincian-admin');
    const elRincianTotal = document.getElementById('rincian-total');

    if (elRincianNominal) elRincianNominal.innerText = 'Rp ' + nominal.toLocaleString('id-ID');
    if (elRincianAdmin) elRincianAdmin.innerText = 'Rp ' + admin.toLocaleString('id-ID');
    if (elRincianTotal) elRincianTotal.innerText = 'Rp ' + total.toLocaleString('id-ID');

    const norekValue = document.getElementById('no-rekening')?.value || "";
    cekNamaPemilikRekening(norekValue);
}

/**
 * Menyimpan transaksi sukses ke riwayat lokal browser
 */
function simpanKeRiwayat(bank, norek, nominal, admin) {
    let riwayat = JSON.parse(localStorage.getItem('nk_transfer_history')) || [];
    
    const waktuHariIni = new Date();
    const jamFormat = waktuHariIni.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WITA';

    const transaksiBaru = {
        bank: bank,
        norek: norek,
        nominal: nominal,
        admin: admin,
        waktu: jamFormat
    };

    riwayat.unshift(transaksiBaru);
    localStorage.setItem('nk_transfer_history', JSON.stringify(riwayat));
    renderRiwayatUI();
}

/**
 * Merender daftar riwayat ke HTML
 */
function renderRiwayatUI() {
    const sectionRiwayat = document.getElementById('section-riwayat');
    const containerDaftar = document.getElementById('daftar-riwayat');
    if (!containerDaftar || !sectionRiwayat) return;

    const riwayat = JSON.parse(localStorage.getItem('nk_transfer_history')) || [];

    if (riwayat.length === 0) {
        sectionRiwayat.classList.add('hidden');
        return;
    }

    sectionRiwayat.classList.remove('hidden');
    containerDaftar.innerHTML = riwayat.map(item => `
        <div class="bg-slate-950 p-4 rounded-2xl flex justify-between items-center shadow-md relative border-l-4 border-green-500">
            <div>
                <span class="block text-[8px] font-black text-green-400 uppercase tracking-widest">${item.waktu} - SUCCESS</span>
                <span class="text-white font-black text-xs uppercase">${item.bank}</span>
                <span class="text-gray-400 font-bold text-[10px] block tracking-wider">${item.norek}</span>
            </div>
            <div class="text-right">
                <span class="block text-white font-black text-sm">Rp ${item.nominal.toLocaleString('id-ID')}</span>
                <span class="text-gray-400 font-bold text-[9px]">Admin: Rp ${item.admin.toLocaleString('id-ID')}</span>
            </div>
        </div>
    `).join('');
}

/**
 * Menghapus seluruh isi riwayat
 */
function bersihkanRiwayat() {
    if (confirm("Apakah Anda yakin ingin menghapus semua riwayat transfer?")) {
        localStorage.removeItem('nk_transfer_history');
        renderRiwayatUI();
    }
}

/**
 * Memproses transaksi dan mengirimkan data akhir ke WhatsApp Admin (ANTI DOUBLE-CLICK + ANIMASI)
 */
function prosesTransfer() {
    const bankEl = document.getElementById('bank-tujuan');
    const norekEl = document.getElementById('no-rekening');
    const nominalEl = document.getElementById('nominal-transfer');
    const namaPelangganEl = document.getElementById('nama-pemilik-terdeteksi');
    const inputNamaBaruEl = document.getElementById('nama-pelanggan-baru');
    const namaBaruBox = document.getElementById('input-nama-baru-box');

    const bank = bankEl ? bankEl.value : "";
    const norekDenganSpasi = norekEl ? norekEl.value : "";
    const norekTanpaSpasi = norekDenganSpasi.replace(/\s+/g, '');
    
    const nominalRaw = nominalEl ? nominalEl.value.replace(/\./g, '') : "0";
    const nominal = parseInt(nominalRaw) || 0;
    const admin = hitungAdminSpesifik();
    const total = nominal + admin;

    if (!bank || norekTanpaSpasi.length < 5 || nominal < 10000) {
        alert("⚠️ Data tidak lengkap! Pastikan Bank dipilih, No. Rekening diisi minimal 5 digit, dan nominal minimal Rp 10.000");
        return;
    }

    // Tentukan nama pemilik akhir yang akan dipakai
    let namaPemilik = namaPelangganEl ? namaPelangganEl.innerText : "PELANGGAN BARU";
    
    // VALIDASI: Jika kolom input nama baru sedang aktif, user wajib mengisi nama!
    if (namaBaruBox && !namaBaruBox.classList.contains('hidden')) {
        const namaKetik = inputNamaBaruEl ? inputNamaBaruEl.value.trim().toUpperCase() : "";
        if (!namaKetik) {
            alert("⚠️ Rekening baru terdeteksi! Silakan isi kolom Nama Pemilik terlebih dahulu.");
            if(inputNamaBaruEl) inputNamaBaruEl.focus();
            return;
        }
        namaPemilik = namaKetik; // Setel nama hasil ketikan manual pelanggan
    }

    // --- MULAI KUNCI TOMBOL & ANIMASI ---
    const btnTransfer = document.getElementById('btn-proses-transfer') || document.querySelector('button[onclick="prosesTransfer()"]');
    if (btnTransfer) {
        btnTransfer.disabled = true;
        btnTransfer.innerHTML = `<i class="fas fa-spinner animate-spin mr-2"></i> Memproses Transfer...`;
        btnTransfer.style.opacity = "0.6";
        btnTransfer.style.cursor = "not-allowed";
    }

           let pesan = `✨ *NK JAYA CELL - TRANSFER BANK* ✨
==================================

Halo Admin, saya ingin melakukan transfer dengan rincian berikut:

📝 *DETAIL TRANSAKSI*
•💸*Kategori* : KIRIM UANG
•🏛️*Bank Tujuan* : ${bank}
•💳*No. Rekening* : \`${norekTanpaSpasi}\`
•👤*Nama Pemilik* : *${namaPemilik}*

💵 *RINCIAN BIAYA*
•💰*Nominal* : Rp ${nominal.toLocaleString('id-ID')}
•⚡*Biaya Admin* : Rp ${admin.toLocaleString('id-ID')}
----------------------------------
💰 *TOTAL BAYAR : Rp ${total.toLocaleString('id-ID')}*
==================================

_Mohon segera diproses ya, terima kasih!_ 🙏✨`;

// PROSES PENYIMPANAN DATA
   simpanKeRiwayat(bank, norekDenganSpasi, nominal, admin);
    // Kirim data yang valid (termasuk nama baru yang diketik) ke Google Sheets
    simpanKeSpreadsheet(namaPemilik);

 // KUNCI UTAMA: Menggunakan encodeURIComponent agar Emoji & Enter di atas tidak rusak/hilang
const url = `https://wa.me/${WA_ADMIN}?text=${encodeURIComponent(pesan)}`;
window.open(url, '_blank');
   
    // Reset Form Input
    if(norekEl) norekEl.value = "";
    if(nominalEl) nominalEl.value = "";
    if(inputNamaBaruEl) inputNamaBaruEl.value = "";
    if(namaBaruBox) namaBaruBox.classList.add('hidden');
    if(namaPelangganEl) namaPelangganEl.innerText = "-";
    
    hitungTotal();

    setTimeout(() => {
        if (btnTransfer) {
            btnTransfer.disabled = false;
            btnTransfer.innerHTML = `Kirim Uang Sekarang`; 
            btnTransfer.style.opacity = "1";
            btnTransfer.style.cursor = "pointer";
        }
    }, 2000);
}

/**
 * Fungsi Rekam Data Transaksi ke Google Sheets
 */
function simpanKeSpreadsheet(namaFinalDariForm) {
    const bankEl = document.getElementById('bank-tujuan');
    const norekEl = document.getElementById('no-rekening');
    const nominalEl = document.getElementById('nominal-transfer');

    const bank = bankEl ? bankEl.value : "";
    const norekMentah = norekEl ? norekEl.value : "";
    const nominalRaw = nominalEl ? nominalEl.value.replace(/\./g, '') : "0";

    const norekBersih = norekMentah.replace(/\s+/g, ''); 
    const nominal = parseInt(nominalRaw) || 0;
    const admin = hitungAdminSpesifik();
    const totalBayar = nominal + admin;
    
    // Gunakan nama final yang dilempar dari fungsi pemroses utama
    const namaPemilik = namaFinalDariForm || "PELANGGAN BARU";

    if (!bank || norekBersih.length < 5 || nominal < 10000) return; 

    const formData = new FormData();
    formData.append('tanggal', new Date().toLocaleString('id-ID'));
    formData.append('kategori', 'KIRIM UANG');
    formData.append('bank', bank);
    formData.append('rekening', norekBersih); 
    formData.append('nama_pemilik', namaPemilik);
    formData.append('nominal', nominal);
    formData.append('admin', admin);
    formData.append('total', totalBayar);

    fetch(URL_APPS_SCRIPT, {
        method: 'POST',
        body: formData,
        mode: 'no-cors'
    })
    .then(() => console.log("✅ Berhasil terekam di Google Sheets."))
    .catch((error) => console.error("❌ Gagal ke Google Sheets:", error));
}

/**
 * Inisialisasi utama saat seluruh komponen halaman siap
 */
window.addEventListener('load', () => {
    const elBank = document.getElementById('bank-tujuan');
    const elNorek = document.getElementById('no-rekening');
    const elNominal = document.getElementById('nominal-transfer');

    renderRiwayatUI();

    if (elBank) {
        fetchTarifAdminBank();
        elBank.addEventListener('change', hitungTotal);
    }

    if (elNorek) {
        elNorek.addEventListener('input', function() {
            let cleanVal = this.value.replace(/[^0-9]/g, '');
            this.value = formatSpasiRekening(cleanVal);
            cekNamaPemilikRekening(this.value);
        });
    }

    if (elNominal) {
        elNominal.setAttribute('type', 'text');
        elNominal.setAttribute('inputmode', 'numeric');
        
        elNominal.addEventListener('input', function() {
            this.value = formatRibuan(this.value);
            hitungTotal();
        });
    }

    // Tambahkan baris ini di dalam window.addEventListener('load') pada transfer.js Anda
    const inputNamaBaru = document.getElementById('nama-pelanggan-baru');
    if (inputNamaBaru) {
        inputNamaBaru.addEventListener('input', () => {
        const norekValue = document.getElementById('no-rekening')?.value || "";
        cekNamaPemilikRekening(norekValue);
    });
}
});

async function prosesTransferKeSheet() {
  // 1. Ambil nilai data dari elemen-elemen input form Anda
  const bankInput = document.getElementById('bank-select')?.value || 'BRI'; // Contoh id dropdown bank
  const rekeningInput = document.getElementById('account-number')?.value || '';
  const namaInput = document.getElementById('nama-penerima-text')?.innerText || 'PELANGGAN BARU';
  const nominalInput = parseInt(document.getElementById('transfer-amount')?.value) || 0;
  
  // Validasi data minimal sebelum dikirim
  if (!rekeningInput || nominalInput <= 0) {
      alert("Mohon isi nomor rekening dan nominal transfer dengan benar!");
      return;
  }

  // 计算 (Hitung rincian pembayaran)
  const biayaAdmin = 5000; 
  const totalBayar = nominalInput + biayaAdmin;
  const waktuWita = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' }); // Jam WITA NK Jaya Cell

  // 2. Susun data menjadi format JSON paket objek
  const dataTransfer = {
      tanggal: waktuWita,
      bank: bankInput,
      rekening: "'" + rekeningInput, // Tambah tanda petik (') agar angka 0 di depan tidak hilang di Excel/Sheets
      nama: namaInput,
      nominal: nominalInput,
      admin: biayaAdmin,
      total: totalBayar,
      status: "Pending" // Status awal sebelum dikonfirmasi admin
  };

  try {
      // 3. Kirim data ke Google Sheets menggunakan Fetch API
      await fetch(SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors', // Penting untuk menghindari eror CORS lintas domain
          headers: {
              'Content-Type': 'application/json'
          },
          body: JSON.stringify(dataTransfer)
      });

      alert("Data transaksi transfer berhasil dicatat ke Sheets!");
      
      // Setelah data masuk ke sheet, lanjut pemicu buka WhatsApp jika diperlukan
      bukaWhatsAppTransfer(dataTransfer);

  } catch (error) {
      console.error("Gagal mengirim data ke spreadsheet:", error);
      alert("Gagal mencatat transaksi, tapi proses tetap dilanjutkan.");
  }
}

/**
 * ==========================================
 * FITUR INPUT SUARA (SPEECH RECOGNITION)
 * ==========================================
 */

/**
 * Fungsi Utama untuk Mengaktifkan Perekam Suara (Mic)
 * @param {string} tipe - 'norek' atau 'nominal'
 */
function mulaiInputSuara(tipe) {
    // Cek apakah browser mendukung Web Speech API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Fitur input suara tidak didukung di browser ini. Silakan gunakan Google Chrome atau Safari terbaru.");
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID'; // Setel ke Bahasa Indonesia
    recognition.interimResults = false; // Hanya mengambil hasil akhir setelah selesai bicara
    recognition.maxAlternatives = 1;

    const micIcon = document.getElementById(`mic-icon-${tipe}`);
    
    // Beri efek visual/animasi saat mikrofon sedang aktif merekam
    if (micIcon) {
        micIcon.classList.remove('text-gray-400');
        micIcon.classList.add('text-red-500', 'animate-pulse');
    }

    // Mulai mendengarkan suara
    recognition.start();

    // Event ketika suara berhasil dikenali dan diubah menjadi teks
    recognition.onresult = function(event) {
        let hasilSuara = event.results[0][0].transcript.toLowerCase().trim();
        console.log(`[Voice Input] Hasil Suara (${tipe}): "${hasilSuara}"`);

        if (tipe === 'norek') {
            const elNorek = document.getElementById('no-rekening');
            // Ambil hanya karakter angka saja dari suara
            let angkaNorek = hasilSuara.replace(/\D/g, '');
            if (elNorek && angkaNorek) {
                elNorek.value = formatSpasiRekening(angkaNorek);
                // Trigger fungsi bawaan NK Jaya Cell untuk cek nama di spreadsheet
                cekNamaPemilikRekening(elNorek.value);
            }
        } 
        else if (tipe === 'nominal') {
            const elNominal = document.getElementById('nominal-transfer');
            if (elNominal) {
                // Konversi teks ucapan bahasa Indonesia menjadi angka matematika mentah
                let angkaNominal = parsingTeksKeAngka(hasilSuara);
                
                if (angkaNominal > 0) {
                    // Format angka mentah menjadi berpemisah titik (ribuan)
                    elNominal.value = formatRibuan(angkaNominal.toString());
                    // Trigger fungsi bawaan NK Jaya Cell untuk kalkulasi total + admin
                    hitungTotal();
                } else {
                    alert(`Gagal memproses nominal. Suara terdeteksi: "${hasilSuara}". Harap ucapkan dengan jelas (Contoh: "Dua puluh lima juta ratus ribu").`);
                }
            }
        }
    };

    // Event jika terjadi error (misal: izin mic ditolak atau mic tidak mendeteksi suara)
    recognition.onerror = function(event) {
        console.error("Speech Recognition Error:", event.error);
        if (event.error === 'not-allowed') {
            alert("Akses mikrofon ditolak. Silakan izinkan mikrofon pada pengaturan browser Anda.");
        } else {
            alert("Gagal mengenali suara, silakan coba lagi dengan suara lebih jelas.");
        }
    };

    // Event ketika proses perekaman selesai (baik sukses maupun error)
    recognition.onend = function() {
        // Kembalikan tampilan ikon mic ke kondisi semula
        if (micIcon) {
            micIcon.classList.remove('text-red-500', 'animate-pulse');
            micIcon.classList.add('text-gray-400');
        }
    };
}

/**
 * Mesin Penerjemah Teks Ucapan ke Angka Matematika (Nominal Rupiah)
 * Mendukung pembacaan: ratusan, ribuan, jutaan, hingga puluhan juta rupiah.
 * @param {string} teks - Kalimat hasil tangkapan microphone
 * @returns {number} Hasil konversi berupa angka murni
 */
function parsingTeksKeAngka(teks) {
    // Jalur pintas: Jika Google langsung menerjemahkan suara menjadi angka digital tulisan (misal: "50000" atau "2.500.000")
    let langsungAngka = teks.replace(/\./g, '').replace(/[^0-9]/g, '');
    if (langsungAngka.length > 0 && !isNaN(langsungAngka) && teks.indexOf('juta') === -1 && teks.indexOf('ribu') === -1) {
        return parseInt(langsungAngka);
    }

    // Kamus dasar angka Bahasa Indonesia
    const kamusAngka = {
        'se': 1, 'satu': 1, 'dua': 2, 'tiga': 3, 'empat': 4, 'lima': 5,
        'enam': 6, 'tujuh': 7, 'delapan': 8, 'sembilan': 9, 'sepuluh': 10,
        'sebelas': 11
    };

    let total = 0;
    let tempJuta = 0;
    let tempRibu = 0;
    let tempRatus = 0;
    let bilanganSaatIni = 0;

    // Pecah teks suara menjadi potongan kata per kata
    const kataKata = teks.replace(/-/g, ' ').split(/\s+/);

    for (let i = 0; i < kataKata.length; i++) {
        let kata = kataKata[i];

        // 1. Ambil nilai dasar angka dari kamus
        if (kamusAngka[kata] !== undefined) {
            bilanganSaatIni = kamusAngka[kata];
        } else if (kata.match(/^\d+$/)) {
            bilanganSaatIni = parseInt(kata);
        }
        // Kondisi khusus awalan "se" (seratus, seribu)
        else if (kata.startsWith('se') && kata !== 'sembilan' && kata !== 'sepuluh' && kata !== 'sebelas') {
            bilanganSaatIni = 1;
            let sisaKata = kata.substring(2);
            if (sisaKata === 'ratus') { tempRatus = 100; bilanganSaatIni = 0; continue; }
            if (sisaKata === 'ribu') { tempRibu = 1000; bilanganSaatIni = 0; continue; }
        }

        // 2. Kalkulasi berdasarkan pengali satuan (puluh, belas, ratus, ribu, juta)
        if (kata === 'belas') {
            bilanganSaatIni += 10;
        } 
        else if (kata === 'puluh') {
            bilanganSaatIni *= 10;
        } 
        else if (kata === 'ratus') {
            if (bilanganSaatIni === 0) bilanganSaatIni = 1; 
            tempRatus = bilanganSaatIni * 100;
            bilanganSaatIni = 0;
        } 
        else if (kata === 'ribu') {
            if (bilanganSaatIni === 0 && tempRatus === 0) bilanganSaatIni = 1;
            tempRibu = (tempRatus + bilanganSaatIni) * 1000;
            tempRatus = 0;
            bilanganSaatIni = 0;
        } 
        else if (kata === 'juta') {
            if (bilanganSaatIni === 0 && tempRatus === 0 && tempRibu === 0) bilanganSaatIni = 1;
            // Kunci utama: kumpulkan seluruh nilai sementara sebelum dikalikan satu juta
            tempJuta = (tempRibu + tempRatus + bilanganSaatIni) * 1000000;
            tempRibu = 0;
            tempRatus = 0;
            bilanganSaatIni = 0;
        }
    }

    // Gabungkan sisa angka di barisan belakang kalimat jika ada
    total = tempJuta + tempRibu + tempRatus + bilanganSaatIni;
    return total;
}


