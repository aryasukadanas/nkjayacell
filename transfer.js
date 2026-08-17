// ==========================================
// LOGIKA TRANSFER BANK - NK JAYA CELL (V3.1 LIVE DATABASES)
// ==========================================

// [FIX] Hapus deklarasi URL yang berulang. Semua URL akan diambil dari config.js.
let databaseAdminBank = [];
let databasePelangganSheet = []; // Menampung data nama pemilik rekening dari spreadsheet
let databaseArsip = []; // [NEW] Menampung data status transaksi dari sheet arsip

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
    console.log("Memulai sinkronisasi database transfer (V2 Caching)...");

    // [OPTIMASI] 1. Muat data bank dari cache lokal terlebih dahulu untuk tampilan instan
    const cacheBankAdmin = localStorage.getItem('nk_cache_bank_admin');
    if (cacheBankAdmin) {
        console.log("Memuat daftar bank dari cache lokal...");
        const rowsBank = cacheBankAdmin.split(/\r?\n/);
        databaseAdminBank = rowsBank.map(row => {
            if (!row.trim()) return null;
            const cols = parseCSVRow(row);
            return { bank: cols[0]?.toUpperCase(), min: parseInt(cols[1]) || 0, max: parseInt(cols[2]) || 0, fee: parseInt(cols[3]) || 0 };
        }).filter(item => item && item.bank);
        renderDaftarBank(); // Render dropdown secepatnya
    }

    // 2. Lanjutkan mengambil data terbaru dari Google Sheets di latar belakang
    try {
        const [resBank, resPelanggan, resArsip] = await Promise.all([
            fetch(ADMIN_BANK_URL + '&_v=' + Date.now()),
            fetch(SHEET_REKENING_URL + '&_v=' + Date.now()),
            fetch(SHEET_ARSIP_URL + '&_v=' + Date.now()) // [FIX] Tambahkan cache buster
        ]);

        // [OPTIMASI] 3. Proses dan perbarui data bank jika ada perubahan
        const textBank = await resBank.text();
        const rowsBank = textBank.split(/\r?\n/).slice(1);
        
        databaseAdminBank = rowsBank.map(row => {
            if (!row.trim()) return null;
            const cols = parseCSVRow(row); 
            return { 
                bank: cols[0]?.toUpperCase(), 
                min: parseInt(cols[1]) || 0, 
                max: parseInt(cols[2]) || 0, 
                fee: parseInt(cols[3]) || 0 
            };
        }).filter(item => item !== null && item.bank !== "" && item.bank !== undefined);
        
        const newBankDataString = rowsBank.join('\n');
        if (newBankDataString !== localStorage.getItem('nk_cache_bank_admin_raw')) {
            console.log("Pembaruan data bank terdeteksi. Menyimpan ke cache dan me-render ulang.");
            localStorage.setItem('nk_cache_bank_admin_raw', newBankDataString); // Simpan data mentah untuk perbandingan
            localStorage.setItem('nk_cache_bank_admin', rowsBank.join('\n')); // Simpan data bersih untuk render
            renderDaftarBank(); // Render ulang jika ada data baru
        }

        // 4. Proses data lainnya seperti biasa
        const textPelanggan = await resPelanggan.text();
        const rowsPelanggan = textPelanggan.split(/\r?\n/).slice(1);
        databasePelangganSheet = rowsPelanggan.map(row => {
            if (!row.trim()) return null;
            const cols = parseCSVRow(row);
            return {
                norek: cols[0]?.replace(/\D/g, '').trim(), 
                nama: cols[1]?.replace(/"/g, "").trim().toUpperCase()
            };
        }).filter(item => item !== null && item.norek && item.nama);
        console.log("Database Nama Rekening dimuat:", databasePelangganSheet.length, "entri.");

        // 5. [NEW] Proses Data Arsip Status Transaksi
        const textArsip = await resArsip.text();
        databaseArsip = textArsip.split(/\r?\n/).slice(1).map(row => {
            if (!row.trim()) return null;
            return parseCSVRow(row);
        }).filter(Boolean);
        console.log("Database Arsip Status dimuat:", databaseArsip.length, "transaksi.");

    } catch (e) {
        console.error("Gagal sinkron database bank/pelanggan:", e); 
    }
}

/**
 * Menampilkan daftar bank ke dalam dropdown select
 */
function renderDaftarBank() {
    const selectEl = document.getElementById('bank-tujuan');
    if (!selectEl) return;

    // Hancurkan instance TomSelect yang ada jika ada, untuk pembaruan
    if (selectEl.tomselect) {
        selectEl.tomselect.destroy();
    }

    const listBank = [...new Set(databaseAdminBank.map(item => item.bank.toUpperCase()))];

    if (listBank.length === 0) {
        selectEl.innerHTML = '<option value="">Gagal memuat daftar bank</option>';
        return;
    }

    // Inisialisasi Tom-Select
    new TomSelect(selectEl, {
        create: false,
        sortField: {
            field: "text",
            direction: "asc"
        },
        placeholder: 'PILIH BANK / E-WALLET TUJUAN', // Hapus spasi di awal
        options: listBank.map(bank => ({
            value: bank,
            text: bank
        })),
        onChange: function() {
            // [FIX] Panggil hitungTotal setiap kali bank diganti untuk update biaya admin
            hitungTotal();
        },
        render: {
            option: function(data, escape) {
                // Mendapatkan path ikon berdasarkan nama bank (pastikan nama file ikon sesuai)
                const iconPath = `img/bank/${data.value.toLowerCase().replace(/ /g, '-')}.png`;
                return `<div class="flex items-center gap-3 p-2">
                            <img src="${iconPath}" class="w-8 h-5 object-contain" alt="${escape(data.text)}" onerror="this.style.display='none'">
                            <span class="font-bold text-sm">${escape(data.text)}</span>
                        </div>`;
            },
            item: function(item, escape) {
                const iconPath = `img/bank/${item.value.toLowerCase().replace(/ /g, '-')}.png`;
                return `<div class="flex items-center gap-2">
                            <img src="${iconPath}" class="w-6 h-4 object-contain" alt="${escape(item.text)}" onerror="this.style.display='none'">
                            <span>${escape(item.text)}</span>
                        </div>`;
            }
        }
    });
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
    const elRincianContainer = document.getElementById('rincian-pembayaran-container');

    if (elRincianNominal) elRincianNominal.innerText = 'Rp ' + nominal.toLocaleString('id-ID');
    if (elRincianAdmin) elRincianAdmin.innerText = 'Rp ' + admin.toLocaleString('id-ID');
    if (elRincianTotal) elRincianTotal.innerText = 'Rp ' + total.toLocaleString('id-ID');

    const norekValue = document.getElementById('no-rekening')?.value || "";
    cekNamaPemilikRekening(norekValue);

    // [NEW] Logika untuk menampilkan rincian dengan animasi
    const bankDipilih = document.getElementById('bank-tujuan')?.value;
    const norekBersih = norekValue.replace(/\s+/g, '');

    if (elRincianContainer) {
        if (bankDipilih && norekBersih.length >= 5 && nominal >= 10000) {
            elRincianContainer.classList.remove('hidden');
            elRincianContainer.classList.add('rincian-muncul');
        } else {
            elRincianContainer.classList.add('hidden');
            elRincianContainer.classList.remove('rincian-muncul');
        }
    }
}

/**
 * Menyimpan transaksi sukses ke riwayat lokal browser
 */
function simpanKeRiwayat(idTransaksi, bank, norek, nama, nominal, admin) {
    // [STANDALONE] Kembalikan logika riwayat transfer ke file ini.
    let riwayat = JSON.parse(localStorage.getItem('nk_transfer_history')) || [];
    
    const waktuHariIni = new Date();
    const tanggalFormat = waktuHariIni.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    const jamFormat = waktuHariIni.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WITA';

    const transaksiBaru = {
        id: idTransaksi,
        nama: nama,
        bank: bank,
        norek: norek,
        tanggal: tanggalFormat,
        nominal: nominal,
        admin: admin, // Biaya admin juga disimpan
        waktu: jamFormat // Waktu juga disimpan
    };

    riwayat.unshift(transaksiBaru);
    // Simpan maksimal 20 riwayat terakhir untuk menjaga performa
    if (riwayat.length > 20) {
        riwayat = riwayat.slice(0, 20);
    }
    localStorage.setItem('nk_transfer_history', JSON.stringify(riwayat));
}

/**
 * Merender daftar riwayat ke HTML
 */
function renderRiwayatUI() {
    // [STANDALONE] Kembalikan fungsi render UI riwayat.
    const containerDaftar = document.getElementById('daftar-riwayat');
    if (!containerDaftar) return;

    const riwayat = JSON.parse(localStorage.getItem('nk_transfer_history')) || [];

    if (riwayat.length === 0) {
        containerDaftar.innerHTML = `
            <div class="text-center py-10 text-gray-400 italic text-xs bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                <i class="fas fa-folder-open text-3xl mb-2 text-gray-300 block"></i>
                Belum ada riwayat transfer.
            </div>
        `;
        return;
    }

    // [NEW] Buat peta status terbaru dari databaseArsip
    const statusMap = {};
    databaseArsip.forEach(cols => {
        // [FIX] Sesuaikan dengan struktur sheet "Transfer"
        // Kolom A (indeks 0) adalah ID, Kolom J (indeks 9) adalah Status
        const idTransaksi = cols[0]?.trim();
        const status = cols[9]?.trim().toUpperCase();
        if (idTransaksi && status) {
            statusMap[idTransaksi] = status;
        }
    });

    const riwayatHTML = riwayat.map(item => {
        const noRekRiwayat = item.norek.replace(/\D/g, ''); // [FIX] Hapus SEMUA karakter selain angka agar formatnya bersih dan konsisten.
        let statusFinal = statusMap[item.id] || statusMap[noRekRiwayat] || "PROSES"; // Prioritaskan pencocokan via ID Transaksi

        // [FIX] Standarisasi label status
        if (statusFinal.includes("LUNAS") || statusFinal.includes("SUKSES")) statusFinal = "SUKSES";
        if (statusFinal.includes("PENDING")) statusFinal = "PROSES";
        if (statusFinal.includes("GAGAL") || statusFinal.includes("FAILED")) statusFinal = "GAGAL";

        let badgeClass = "bg-amber-50 text-amber-700 border-amber-100 animate-pulse";
        let iconClass = "fa-spinner animate-spin";

        if (statusFinal === "SUKSES") {
            badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-100";
            iconClass = "fa-check-circle";
        } else if (statusFinal === "GAGAL") {
            badgeClass = "bg-rose-50 text-rose-700 border-rose-100";
            iconClass = "fa-times-circle";
        }

        // [FIX] Siapkan tombol struk agar selalu tampil, apa pun statusnya
        const itemJson = JSON.stringify(item).replace(/"/g, "'");
        const tombolStrukHTML = `
            <button onclick="tampilkanStrukDariRiwayat(${itemJson}, '${statusFinal}')" class="w-full text-center bg-emerald-600/10 text-emerald-600 text-[10px] font-bold py-2 rounded-xl hover:bg-emerald-600 hover:text-white transition-all mt-1 flex items-center justify-center gap-1.5">
                <i class="fas fa-receipt"></i> Lihat Struk
            </button>
        `;

        return `
        <div class="p-3.5 bg-white border border-gray-100 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.02)] space-y-2.5 text-left relative overflow-hidden">
            <div class="flex justify-between items-center">
                <div class="flex items-center gap-2">
                    <div class="text-[9px] text-gray-400 font-bold">ID: <span class="text-indigo-500">${item.id || '-'}</span></div>
                    <button onclick="copyToClipboard(this, '${item.id || ''}')" class="text-gray-400 hover:text-blue-600 text-xs p-1 rounded-full bg-gray-100 active:scale-90 transition-all" title="Salin ID">
                        <i class="far fa-copy"></i>
                    </button>
                </div>
                <span class="${badgeClass} px-2 py-0.5 rounded-lg font-black text-[9px] tracking-wide flex items-center gap-1 uppercase">
                    <i class="fas ${iconClass}"></i> ${statusFinal}
                </span>
            </div>
            <div class="font-extrabold text-gray-900 text-xs tracking-tight leading-snug uppercase">
                ${item.bank} - ${item.nama}
            </div>
            <div class="text-[9px] text-gray-400 font-semibold">
                ${item.tanggal || ''} - ${item.waktu || ''}
            </div>
            <div class="flex justify-between items-end pt-1 border-t border-gray-50">
                <div class="text-[10px] text-gray-400 font-semibold">
                    No. Rek: <span class="text-gray-700 font-black tracking-wider">${item.norek}</span>
                </div>
                <div class="text-right">
                    <p class="text-[8px] uppercase text-gray-400 font-bold tracking-wider leading-none">Total Bayar</p>
                    <p class="text-xs font-black text-blue-600 mt-0.5">Rp ${(item.nominal + item.admin).toLocaleString('id-ID')}</p>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <button onclick="gunakanLagiDariRiwayat('${item.bank}', '${item.norek}', '${item.nama}')" class="w-full text-center bg-blue-600/10 text-blue-600 text-[10px] font-bold py-2 rounded-xl hover:bg-blue-600 hover:text-white transition-all mt-1 flex items-center justify-center gap-1.5">
                    <i class="fas fa-redo-alt"></i> Gunakan Lagi
                </button>
                ${tombolStrukHTML}
            </div>
        </div>
    `}).join('');

    containerDaftar.innerHTML = `
        <div class="space-y-2.5">${riwayatHTML}</div>
        <div class="pt-2">
            <button onclick="bersihkanRiwayat()" class="w-full py-2 bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-600 text-[10px] font-bold rounded-xl transition-colors border border-dashed">
                <i class="fas fa-trash-alt mr-1"></i> Bersihkan Riwayat Transfer
            </button>
        </div>
    `;
}

/**
 * Menghapus seluruh isi riwayat
 */
function bersihkanRiwayat() {
    // [STANDALONE] Kembalikan logika pembersihan riwayat transfer.
    if (confirm("Apakah Anda yakin ingin menghapus semua riwayat transfer?")) {
        localStorage.removeItem('nk_transfer_history');
        renderRiwayatUI(); // Render ulang UI untuk menampilkan keadaan kosong
    }
}

/**
 * [NEW] Menampilkan modal peringatan kustom yang baru
 * @param {string} title - Judul utama modal.
 * @param {string} header - Judul di dalam kotak peringatan.
 * @param {string[]} listItems - Array berisi pesan-pesan yang akan ditampilkan sebagai daftar.
 */
function showAlert(title, header, listItems) {
    // [ANIMASI] Logika untuk memunculkan modal dengan animasi
    const modal = document.getElementById('customModal');
    const modalTitle = modal.querySelector('.modal-title');
    const alertHeader = modal.querySelector('.alert-header span');
    const alertList = modal.querySelector('.alert-list');

    if (modalTitle) modalTitle.innerText = title;
    if (alertHeader) alertHeader.innerText = header;

    if (alertList) {
        alertList.innerHTML = ''; // Kosongkan daftar sebelumnya
        listItems.forEach(itemText => {
            const li = document.createElement('li');
            li.textContent = itemText;
            alertList.appendChild(li);
        });
    }

    modal.style.visibility = 'visible';
    modal.style.opacity = '1';
    if (modal.querySelector('.modal-card')) {
        modal.querySelector('.modal-card').style.transform = 'scale(1)';
    }
}

/**
 * [NEW] Menutup modal peringatan kustom
 */
function closeAlert() {
    // [ANIMASI] Logika untuk menutup modal dengan animasi
    const modal = document.getElementById('customModal');
    modal.style.opacity = '0';
    setTimeout(() => { modal.style.visibility = 'hidden'; }, 300); // Sesuaikan dengan durasi transisi CSS
}

/**
 * [FIX] Memproses transaksi dan mengirimkan data akhir ke WhatsApp Admin (ANTI DOUBLE-CLICK + ANIMASI)
 */
async function prosesTransfer() {
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

    // Validasi input satu per satu untuk pesan error yang spesifik
    const pesanError = [];
    if (!bank) {
        pesanError.push("Pastikan Bank/E-wallet telah dipilih.");
    }
    if (norekTanpaSpasi.length < 5) {
        pesanError.push("No. Rekening Tujuan harus diisi (minimal 5 digit).");
    }
    if (nominal < 10000) {
        pesanError.push("Jumlah kirim minimal Rp 10.000.");
    }

    if (pesanError.length > 0) {
        showAlert("VERIFIKASI GAGAL", "DATA BELUM LENGKAP!", pesanError);
        return;
    }

    // Tentukan nama pemilik akhir yang akan dipakai
    let namaPemilik = namaPelangganEl ? namaPelangganEl.innerText : "PELANGGAN BARU";
    
    // VALIDASI: Jika kolom input nama baru sedang aktif, user wajib mengisi nama!
    if (namaBaruBox && !namaBaruBox.classList.contains('hidden')) {
        const namaKetik = inputNamaBaruEl ? inputNamaBaruEl.value.trim().toUpperCase() : "";
        if (!namaKetik) {
            showAlert("NAMA WAJIB DIISI", "REKENING BARU TERDETEKSI!", ["Silakan isi kolom Nama Pemilik sesuai buku tabungan."]);
            if(inputNamaBaruEl) inputNamaBaruEl.focus();
            return;
        }
        namaPemilik = namaKetik; // Setel nama hasil ketikan manual pelanggan
    }

    // --- MULAI KUNCI TOMBOL & ANIMASI ---
    const btnTransfer = document.querySelector('button[onclick="prosesTransfer()"]');
    if (btnTransfer) {
        btnTransfer.disabled = true;
        btnTransfer.innerHTML = `<i class="fas fa-spinner animate-spin mr-2"></i> Memproses Transfer...`;
        btnTransfer.style.opacity = "0.6";
        btnTransfer.style.cursor = "not-allowed";
    }

    const idTransaksi = 'TRF' + Date.now().toString().slice(-7);
    let pesan = `✨ *NK JAYA CELL - TRANSFER BANK* ✨
==================================
*ID Transaksi: ${idTransaksi}*
Halo Admin, saya ingin melakukan transfer dengan rincian berikut:

📝 *DETAIL TRANSAKSI*
•💸*Kategori* : KIRIM UANG
•🏛️*Bank Tujuan* : ${bank}
•💳*No. Rekening* : \`${norekTanpaSpasi}\`
•👤*Nama Pemilik* : *${namaPemilik}*

💵 *RINCIAN BIAYA*
•💰*Nominal* : Rp ${nominal.toLocaleString('id-ID')}
•⚡*Biaya Admin* : Rp ${admin.toLocaleString('id-ID')}
-----------------------------------
💰 *TOTAL BAYAR : Rp ${total.toLocaleString('id-ID')}*
==================================

_Mohon segera diproses ya, terima kasih!_ 🙏✨`;
    
    // PROSES PENYIMPANAN DATA
    await simpanKeSpreadsheet(idTransaksi, namaPemilik);
    simpanKeRiwayat(idTransaksi, bank, norekDenganSpasi, namaPemilik, nominal, admin);

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
            btnTransfer.innerHTML = `<i class="fab fa-whatsapp text-lg"></i> KIRIM DATA TRANSFER KE ADMIN`; 
            btnTransfer.style.opacity = "1";
            btnTransfer.style.cursor = "pointer";
        }
    }, 2000);
}
/**
 * [NEW] Menampilkan modal struk dengan data transaksi
 */
function tampilkanStruk(data) {
    // [STANDALONE] Kembalikan fungsi tampilkan struk.
    const modal = document.getElementById('struk-modal');
    if (!modal) return;

    // [NEW] Logika untuk mengubah judul dan warna struk berdasarkan status
    const judulEl = document.getElementById('struk-status-judul');
    if (data.status === 'SUKSES') {
        judulEl.innerText = 'TRANSFER BERHASIL';
        judulEl.className = 'font-black text-green-600 text-lg';
    } else if (data.status === 'GAGAL') {
        judulEl.innerText = 'TRANSFER GAGAL';
        judulEl.className = 'font-black text-red-600 text-lg';
    } else {
        judulEl.innerText = 'TRANSFER DIPROSES';
        judulEl.className = 'font-black text-amber-600 text-lg';
    }

    // Isi data ke elemen struk
    document.getElementById('struk-waktu').innerText = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
    document.getElementById('struk-penerima').innerText = `${data.bank} - ${data.nama} (${data.norek})`;
    
    // [NEW] Isi rincian biaya
    document.getElementById('struk-nominal').innerText = 'Rp ' + data.nominal.toLocaleString('id-ID');
    document.getElementById('struk-admin').innerText = 'Rp ' + data.admin.toLocaleString('id-ID');
    document.getElementById('struk-total').innerText = 'Rp ' + data.total.toLocaleString('id-ID');
    
    // [MODIFIKASI] Tambahkan ID Transaksi dengan tombol copy
    document.getElementById('struk-id-container').innerHTML = `
        <div class="flex justify-between">
            <span class="text-gray-500 font-medium">ID Transaksi:</span>
            <span class="font-bold text-gray-800">${data.id || '-'}</span>
        </div>
    `;

    // Siapkan tombol aksi
    const actionsContainer = document.getElementById('struk-actions');
    actionsContainer.innerHTML = `
        <button onclick="downloadStruk('${data.id}')" class="w-full py-3 bg-gray-200 text-gray-800 font-bold text-xs rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2">
            <i class="fas fa-download"></i> Download
        </button>
        <button onclick="shareStruk('${data.id}')" class="w-full py-3 bg-green-500 text-white font-black text-xs rounded-xl shadow-md active:scale-95 transition-all flex items-center justify-center gap-2">
            <i class="fab fa-whatsapp"></i> Bagikan
        </button>
        <button onclick="tutupModalStruk()" class="col-span-2 w-full py-2 bg-transparent text-gray-500 font-bold text-xs rounded-xl active:scale-95 transition-all">
            Tutup
        </button>
    `;

    // Tampilkan modal dengan animasi
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('div').classList.remove('scale-95');
    }, 10);
}
/**
 * [NEW] Fungsi jembatan untuk menampilkan struk dari data riwayat
 */
function tampilkanStrukDariRiwayat(item, status) {
    // [STANDALONE] Fungsi ini sekarang menjadi jembatan ke `tampilkanStruk` di file ini.
    tampilkanStruk({
        id: item.id,
        bank: item.bank,
        norek: item.norek,
        nama: item.nama,
        nominal: item.nominal,
        admin: item.admin,
        total: item.nominal + item.admin,
        status: status // Kirim status ke fungsi utama
    });
}

/**
 * [NEW] Menutup modal struk dan mengaktifkan kembali tombol proses
 */
function tutupModalStruk() {
    // [STANDALONE] Kembalikan fungsi tutup modal struk.
    const modal = document.getElementById('struk-modal');
    if (modal) {
        modal.classList.add('opacity-0');
        modal.querySelector('div').classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }

    // Aktifkan kembali tombol proses utama
    const btnTransfer = document.getElementById('btn-proses-transfer') || document.querySelector('button[onclick="prosesTransfer()"]');
    if (btnTransfer) {
        btnTransfer.disabled = false;
        btnTransfer.innerHTML = `KIRIM DATA TRANSFER KE ADMIN`;
        btnTransfer.style.opacity = "1";
        btnTransfer.style.cursor = "pointer";
    }
}

/**
 * [NEW] Mengubah HTML struk menjadi gambar dan mengunduhnya
 */
async function downloadStruk(ref) {
    // [STANDALONE] Kembalikan fungsi download struk.
    const strukElement = document.getElementById('struk-content');
    const originalBg = strukElement.style.backgroundColor;
    strukElement.style.backgroundColor = 'white'; // Pastikan background putih

    try {
        const canvas = await html2canvas(strukElement, { scale: 3 }); // Tingkatkan skala untuk kualitas lebih baik
        const link = document.createElement('a');
        link.download = `struk-transfer-${ref}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (error) {
        console.error('Gagal membuat gambar struk:', error);
        alert('Gagal mengunduh struk.');
    } finally {
        strukElement.style.backgroundColor = originalBg; // Kembalikan background
    }
}

/**
 * [NEW] Membagikan gambar struk ke aplikasi lain (terutama WhatsApp)
 */
async function shareStruk(ref) {
    // [STANDALONE] Kembalikan fungsi share struk.
    const strukElement = document.getElementById('struk-content');
    const originalBg = strukElement.style.backgroundColor;
    strukElement.style.backgroundColor = 'white';

    try {
        const canvas = await html2canvas(strukElement, { scale: 2 });
        canvas.toBlob(async (blob) => {
            const file = new File([blob], `struk-transfer-${ref}.png`, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: `Bukti Transfer ${ref}`,
                    text: `Berikut adalah bukti transfer untuk no. ref ${ref}.`
                });
            } else {
                alert('Browser Anda tidak mendukung fitur berbagi file. Silakan download struk terlebih dahulu.');
            }
        }, 'image/png');
    } catch (error) {
        console.error('Gagal berbagi struk:', error);
        alert('Gagal membagikan struk.');
    } finally {
        strukElement.style.backgroundColor = originalBg;
    }
}

/**
 * [BARU] Fungsi untuk menyalin teks ke clipboard
 */
function copyToClipboard(button, text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        const icon = button.querySelector('i');
        const originalIconClass = icon.className;
        icon.className = 'fas fa-check text-green-500';
        button.disabled = true;
        setTimeout(() => {
            icon.className = originalIconClass;
            button.disabled = false;
        }, 1500);
    }).catch(err => {
        console.error('Gagal menyalin teks: ', err);
        alert('Gagal menyalin ID Transaksi.');
    });
}

/**
 * Fungsi Rekam Data Transaksi ke Google Sheets
 */
async function simpanKeSpreadsheet(idTransaksi, namaFinalDariForm) {
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

    // [FIX] Gunakan FormData untuk mengirim data ke e.parameter di Apps Script
    const formData = new FormData();
    // [SINKRONISASI] Kirim ID Transaksi yang sudah dibuat di web
    formData.append('id_transaksi', idTransaksi);
    formData.append('tanggal', new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' }));
    formData.append('kategori', 'KIRIM UANG'); // Sesuai dengan e.parameter.kategori
    formData.append('bank', bank); // Sesuai dengan e.parameter.bank
    formData.append('rekening', norekBersih); // Sesuai dengan e.parameter.rekening
    formData.append('nama_pemilik', namaPemilik); // Sesuai dengan e.parameter.nama_pemilik
    formData.append('nominal', nominal); // Sesuai dengan e.parameter.nominal
    formData.append('admin', admin); // Sesuai dengan e.parameter.admin
    formData.append('total', totalBayar); // Sesuai dengan e.parameter.total

    try {
        // [FIX] Hapus 'mode: no-cors' agar bisa menerima respons dari Apps Script
        const response = await fetch(SCRIPT_URL, { // [REFACTOR] Langsung gunakan SCRIPT_URL dari config.js
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result && result.status === "sukses") {
            console.log(`✅ Berhasil terekam di Google Sheets dengan ID: ${result.id_transaksi}`);
            return result.id_transaksi;
        } else {
            console.error("❌ Gagal ke Google Sheets (Respons Server):", result ? result.message : "Respons tidak valid");
            return null;
        }
    } catch (error) {
        console.error("❌ Gagal ke Google Sheets (Error Fetch):", error);
        return null;
    }
}

/**
 * Mengisi ulang form dari data riwayat untuk transaksi baru
 */
function gunakanLagiDariRiwayat(bank, norek, nama) {
    const elBank = document.getElementById('bank-tujuan'); // Ini adalah elemen <select> asli
    const elNorek = document.getElementById('no-rekening');
    const elNominal = document.getElementById('nominal-transfer');

    // [FIX] Gunakan API dari Tom-Select untuk mengatur nilai, bukan .value biasa.
    // Tom-Select menempelkan dirinya pada elemen select asli.
    if (elBank && elBank.tomselect) {
        elBank.tomselect.setValue(bank);
    }

    if (elNorek) {
        elNorek.value = norek;
        cekNamaPemilikRekening(norek.replace(/\s+/g, '')); // [FIX] Kirim nomor rekening yang sudah bersih dari spasi
    }
    if (elNominal) elNominal.focus(); // Fokus ke input nominal

    // Gulir ke atas halaman
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // [FIX] Tutup modal riwayat setelah data diisi ulang
    tutupModalRiwayat();
}

async function bukaModalRiwayat() {
    // [STANDALONE] Kembalikan logika buka modal riwayat.
    const modal = document.getElementById('history-modal');
    if (!modal) return;

    // Selalu ambil data status terbaru dari spreadsheet setiap kali modal dibuka
    try {
        const loadingEl = document.getElementById('daftar-riwayat');
        if (loadingEl) loadingEl.innerHTML = `<div class="text-center py-10 text-gray-400 italic text-xs"><i class="fas fa-spinner animate-spin mr-2"></i> Memperbarui status...</div>`;

        // [UPDATE] Gunakan konstanta SHEET_TRANSFER_URL dari config.js untuk mengambil status.
        const resArsip = await fetch(SHEET_TRANSFER_URL + '&_v=' + Date.now());
        const textArsip = await resArsip.text();
        databaseArsip = textArsip.split(/\r?\n/).slice(1).map(row => {
            if (!row.trim()) return null;
            return parseCSVRow(row);
        }).filter(Boolean);
    } catch (e) {
        console.error("Gagal mengambil status terbaru:", e);
    }

    renderRiwayatUI(); // Render ulang dengan data status yang sudah diperbarui

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('div').classList.remove('translate-y-full');
    }, 10);
}

function tutupModalRiwayat() {
    // [STANDALONE] Kembalikan logika tutup modal riwayat.
    const modal = document.getElementById('history-modal');
    if (!modal) return;
    modal.classList.add('opacity-0');
    modal.querySelector('div').classList.add('translate-y-full');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

/**
 * [NEW] FUNGSI SLIDER BANNER (KHUSUS UNTUK INDEX2.HTML)
 * Dipindahkan dari script.js agar halaman transfer mandiri.
 */
function setupBannerSlider() {
    const slider = document.getElementById('banner-slider');
    const dotsContainer = document.getElementById('banner-dots');
    if (!slider || !dotsContainer) return;

    const slides = Array.from(slider.children).filter(el => el.classList.contains('w-full'));
    const totalSlides = slides.length;
    if (totalSlides === 0) return;
    let currentSlide = 0;

    dotsContainer.innerHTML = '';
    for (let i = 0; i < totalSlides; i++) {
        const dot = document.createElement('button');
        dot.classList.add('w-2', 'h-2', 'rounded-full', 'transition-all', 'duration-300');
        dot.classList.add(i === 0 ? 'bg-white' : 'bg-white/50');
        dot.addEventListener('click', () => goToSlide(i));
        dotsContainer.appendChild(dot);
    }

    const dots = dotsContainer.children;

    function goToSlide(slideIndex) {
        currentSlide = slideIndex;
        slider.style.transform = `translateX(-${currentSlide * 100}%)`;
        for (let i = 0; i < totalSlides; i++) {
            dots[i].classList.toggle('bg-white', i === currentSlide);
            dots[i].classList.toggle('bg-white/50', i !== currentSlide);
        }
    }

    function nextSlide() {
        goToSlide((currentSlide + 1) % totalSlides);
    }

    setInterval(nextSlide, 3000);
}

/**
 * Inisialisasi utama saat seluruh komponen halaman siap
 */
// [OPTIMASI] Ganti 'load' dengan 'DOMContentLoaded' agar pengambilan data bank
// dimulai lebih awal tanpa harus menunggu semua gambar banner selesai dimuat.
document.addEventListener('DOMContentLoaded', () => {
    const elBank = document.getElementById('bank-tujuan');
    const elNorek = document.getElementById('no-rekening');
    const elNominal = document.getElementById('nominal-transfer');

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

    // Jalankan banner slider khusus untuk halaman transfer (index2.html)
    setupBannerSlider();

    // [FIX] Panggil fetch data setelah semua elemen DOM siap
    // Ini memastikan semua data (bank, status) diambil dari awal.
    if (elBank) {
        fetchTarifAdminBank();
    }
});

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

// FUNGSI SLIDER BANNER (KHUSUS UNTUK INDEX2.HTML)
function setupBannerSlider() {
    const slider = document.getElementById('banner-slider');
    const dotsContainer = document.getElementById('banner-dots');
    if (!slider || !dotsContainer) return; // Jika tidak ada slider di halaman ini, hentikan

    const slides = Array.from(slider.children).filter(el => el.classList.contains('w-full'));
    const totalSlides = slides.length;
    if (totalSlides === 0) return;
    let currentSlide = 0;

    // Buat dots navigasi
    dotsContainer.innerHTML = ''; // Kosongkan dulu jika ada
    for (let i = 0; i < totalSlides; i++) {
        const dot = document.createElement('button');
        dot.classList.add('w-2', 'h-2', 'rounded-full', 'transition-all', 'duration-300');
        dot.classList.add(i === 0 ? 'bg-white' : 'bg-white/50');
        dot.addEventListener('click', () => {
            goToSlide(i);
        });
        dotsContainer.appendChild(dot);
    }

    const dots = dotsContainer.children;

    function goToSlide(slideIndex) {
        currentSlide = slideIndex;
        slider.style.transform = `translateX(-${currentSlide * 100}%)`;
        
        // Update active dot
        for (let i = 0; i < totalSlides; i++) {
            dots[i].classList.toggle('bg-white', i === currentSlide);
            dots[i].classList.toggle('bg-white/50', i !== currentSlide);
        }
    }

    function nextSlide() {
        goToSlide((currentSlide + 1) % totalSlides);
    }

    setInterval(nextSlide, 3000); // Ganti slide setiap 3 detik
}
