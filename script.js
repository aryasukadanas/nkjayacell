// ==========================================================
// CORE ENGINE SYSTEM APPS V3.6 - NK JAYA CELL
// ==========================================================
// [FIX] Hapus semua deklarasi URL dan WA_ADMIN. Mereka akan diambil dari config.js.
// Pastikan config.js dimuat sebelum script.js di file HTML.

const iconMap = {
    'PULSA': 'PULSA.png', 'INDOSAT': 'logo_indosat.png', 'XL': 'logo_xl.png', 'TELKOMSEL': 'logo_telkomsel.png',
    'AXIS': 'logo_axis.png', 'TRI': 'logo_tri.png', 'SMARTFREN': 'logo_smartfren.png', 'BY.U': 'logo_byu.png',
    'SHOPEEPAY': 'logo_shopeepay.png', 'GOPAY': 'logo_gopay.jpeg', 'DANA': 'logo_Dana.jpeg', 
    'PLN': 'logo_pln.png', 'TOKEN PLN': 'logo_pln.png', 'LAINNYA': 'PULSA.png'
};

// ==========================================================
// CONFIG TAMBAHAN UNTUK QRIS DINAMIS
// ==========================================================
const MASTER_TEXT_QRIS = "00020101021126570011ID.DANA.WWW011893600915307833630202090783363020303UMI51440014ID.CO.QRIS.WWW0215ID10200446107530303UMI5204549953033605802ID5912NK JAYA CELL6013Kab. Jembrana61058225263045BED"; 

// Fungsi untuk generate CRC16 (Wajib untuk standardisasi QRIS EMVCo)
function kelolaCRC16(str) {
    let crc = 0xFFFF;
    for (let c = 0; c < str.length; c++) {
        let cls = str.charCodeAt(c);
        crc ^= cls << 8;
        for (let i = 0; i < 8; i++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
        }
    }
    crc &= 0xFFFF;
    let hasilCrc = crc.toString(16).toUpperCase();
    return hasilCrc.padStart(4, '0');
}

// Fungsi mengubah QRIS Statis menjadi Dinamis dengan Nominal + Kode Unik
function buatTeksQrisDinamis(nominal) {
    let qrisAwal = MASTER_TEXT_QRIS.substring(0, MASTER_TEXT_QRIS.indexOf("5802ID"));
    let nominalString = nominal.toString();
    let formatNominal = "54" + nominalString.length.toString().padStart(2, '0') + nominalString;
    let qrisSisa = MASTER_TEXT_QRIS.substring(MASTER_TEXT_QRIS.indexOf("5802ID"));
    
    // Potong string bawaan CRC lama di bagian paling akhir (4 karakter terakhir)
    qrisSisa = qrisSisa.substring(0, qrisSisa.length - 4);
    
    let gabunganTeks = qrisAwal + formatNominal + qrisSisa;
    let crcBaru = kelolaCRC16(gabunganTeks);
    
    return gabunganTeks + crcBaru;
}

let rawDatabaseRows = [];
let rawArsipRows = [];
let rawArsipHeaders = [];
let masterPulsaGroup = {};
let masterKuotaGroup = {};
let masterTokenGroup = {}; 

let tabUtamaAktif = "KUOTA";
let operatorAktif = "";     
let keranjangBelanja = null; 
let intervalMainTimer = null;
let listCacheRiwayat = []; 
let petaNamaPelangganPLN = {};
let petaDayaPelangganPLN = {};
let dataStrukAktif = null;

function pecahBarisCSV(row) {
    return row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(value => value.trim().replace(/^"|"$/g, ''));
}

function muatStrukturArsip(teksCSV) {
    const rows = teksCSV.split(/\r?\n/);
    rawArsipHeaders = rows[0] ? pecahBarisCSV(rows[0]).map(value => value.toUpperCase().replace(/[^A-Z0-9]/g, '')) : [];
    rawArsipRows = rows.slice(1);
}

function ambilNilaiArsip(cols, aliases) {
    const index = aliases.map(alias => alias.toUpperCase().replace(/[^A-Z0-9]/g, ''))
        .map(alias => rawArsipHeaders.indexOf(alias)).find(index => index >= 0);
    return index === undefined ? '' : (cols[index] || '').trim();
}

  // ==========================================================
// 1. DEKLARASI FUNGSI INPUT SUARA (TARUH DI ATAS)
// ==========================================================
function aktifkanInputSuaraRealTime(elemenInput, tipeInput) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn("Browser ini tidak mendukung Web Speech API (Input Suara).");
        return;
    }

    if (elemenInput.dataset.sedangMerekam === "true") return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID'; 
    recognition.interimResults = true; // Ketikan langsung muncul real-time
    recognition.continuous = false;   

    const placeholderAsli = elemenInput.placeholder || "";

    recognition.onstart = function() {
        elemenInput.dataset.sedangMerekam = "true";
        elemenInput.placeholder = "🎙️ Mendengarkan...";
        elemenInput.style.backgroundColor = "#1e293b"; // Efek visual saat mic aktif
    };

   // Pastikan di bagian onresult script.js untuk nomor HP seperti ini:
recognition.onresult = function(event) {
    let hasilSuara = "";
    for (let i = event.resultIndex; i < event.results.length; ++i) {
        hasilSuara += event.results[i][0].transcript;
    }

    // Ganti kata-kata angka mandiri yang sering salah ditangkap browser sebelum difilter
    let teksDisempurnakan = hasilSuara.toLowerCase()
        .replace(/kosong/g, '0')
        .replace(/nol/g, '0')
        .replace(/satu/g, '1')
        .replace(/dua/g, '2')
        .replace(/tiga/g, '3')
        .replace(/empat/g, '4')
        .replace(/lima/g, '5')
        .replace(/enam/g, '6')
        .replace(/tujuh/g, '7')
        .replace(/delapan/g, '8')
        .replace(/sembilan/g, '9');

    let angkaBersih = teksDisempurnakan.replace(/[^0-9]/g, '');
    elemenInput.value = angkaBersih;
    
    if (typeof fiturDeteksiOtomatisDanCariProvider === "function") {
        fiturDeteksiOtomatisDanCariProvider(angkaBersih);
    }
    elemenInput.dispatchEvent(new Event('input'));
};

    recognition.onerror = function(event) {
        console.error("Kesalahan input suara:", event.error);
    };

    recognition.onend = function() {
        elemenInput.dataset.sedangMerekam = "false";
        elemenInput.placeholder = placeholderAsli;
        elemenInput.style.backgroundColor = ""; 
        elemenInput.dispatchEvent(new Event('input'));
    };

    recognition.start();
}  

document.addEventListener('DOMContentLoaded', () => {
    // 1. Jalankan fungsi bawaan aplikasi
    muatDataDanPisahKategori();
    muatNamaPelangganPLN();

    // 2. Ambil elemen input nomor HP utama berdasarkan ID yang benar
    const inputNoHp = document.getElementById('search-phone-input') || document.getElementById('no-hp') || document.getElementById('input-tujuan');

    // 3. Pasangkan fitur input suara real-time saat kolom diklik
    if (inputNoHp) {
        inputNoHp.addEventListener('click', function() {
            // [FIX] Panggil fungsi input suara real-time yang sudah disentralisasi
            aktifkanInputSuaraRealTime(this, "angka");
        });
    }
    
    // 4. Jalankan banner slider khusus untuk halaman index.html
    setupBannerSlider();
});

async function muatNamaPelangganPLN() {
    try {
        const response = await fetch(SHEET_NAMA_PLN_URL);
        if (!response.ok) throw new Error('Gagal mengambil data nama PLN');

        const rows = (await response.text()).split(/\r?\n/);
        const headerIndex = rows.findIndex(row => row.toUpperCase().includes('ID PLN') && row.toUpperCase().includes('NAMA'));
        if (headerIndex < 0) throw new Error('Header data nama PLN tidak ditemukan');

        rows.slice(headerIndex + 1).forEach(row => {
            const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(value => value.trim().replace(/^"|"$/g, ''));
            const idPln = (cols[1] || '').replace(/\D/g, '');
            const nama = cols[2] || '';
            const tarifDaya = cols[3] || '';
            if (idPln && nama && !petaNamaPelangganPLN[idPln]) petaNamaPelangganPLN[idPln] = nama;
            if (idPln && tarifDaya) petaDayaPelangganPLN[idPln] = tarifDaya;
        });

        tampilkanNamaPelangganPLN(document.getElementById('search-phone-input')?.value || '');
    } catch (error) {
        console.warn('Data nama pelanggan PLN tidak dapat dimuat:', error);
    }
}

function tampilkanNamaPelangganPLN(idPln) {
    const helperNama = document.getElementById('helper-nama-pln');
    if (!helperNama) return;

    const idBersih = idPln.replace(/\D/g, '');
    const nama = petaNamaPelangganPLN[idBersih];
    if (tabUtamaAktif === 'TOKEN' && nama) {
        helperNama.innerHTML = '<i class="fas fa-user-check"></i> Nama ID PLN: <span class="text-gray-800"></span>';
        helperNama.querySelector('span').textContent = nama;
        helperNama.classList.remove('hidden');
    } else {
        helperNama.classList.add('hidden');
        helperNama.textContent = '';
    }
}

/**
 * 1. AMBIL KONTAK HP NATIVE (CONTACT PICKER API)
 */
async function bukaDaftarKontakHP() {
    const props = ['tel'];
    const opts = { multiple: false };

    if ('contacts' in navigator && 'ContactsManager' in window) {
        try {
            const contact = await navigator.contacts.select(props, opts);
            if (contact && contact.length > 0 && contact[0].tel && contact[0].tel.length > 0) {
                let nomorBersih = contact[0].tel[0].replace(/\s+/g, '').replace(/-/g, '').replace(/^\+62/, '0');
                const inputUtama = document.getElementById('search-phone-input');
                if(inputUtama) {
                    inputUtama.value = nomorBersih;
                    fiturDeteksiOtomatisDanCariProvider(nomorBersih);
                }
            }
        } catch (err) {
            console.log("Akses kontak ditolak atau dibatalkan.", err);
        }
    } else {
        showAlert("FITUR TIDAK DIDUKUNG", "Browser Tidak Kompatibel", ["Fitur ambil kontak tidak didukung di browser ini.", "Silakan ketik nomor secara manual."]);
    }
}

/**
 * 2. LOAD DATA SPREADSHEET REAL-TIME (GANTI BLOK INI DENGAN YANG BARU)
 */
async function muatDataDanPisahKategori() {
    console.log("Memulai penataan pangkalan data...");

    // 1. AMBIL DARI MEMORI INTERNAL HP TERLEBIH DAHULU (INSTAN < 1 DETIK)
    const cacheLokalProduk = localStorage.getItem('nk_cache_produk_csv');
    const cacheLokalArsip = localStorage.getItem('nk_cache_arsip_csv'); // Ambil cache arsip jika ada
    
    if (cacheLokalProduk) {
        console.log("Memuat daftar harga dari cache lokal HP...");
        uraiDanProsesTeksCSV(cacheLokalProduk);
        gantiTabUtama("KUOTA");
    }

    if (cacheLokalArsip) {
        muatStrukturArsip(cacheLokalArsip);
    }

    // 2. TETAP SINKRONISASI DATA TERBARU DARI GOOGLE SHEET DI LATAR BELAKANG
    try {
       // Ambil data dari kedua sheet secara paralel (bersamaan)
        const [resProduk, resArsip] = await Promise.all([
            // [UPDATE] Tambahkan cache buster untuk memastikan data produk selalu terbaru.
                fetch(SHEET_PRODUK_URL),
            fetch(SHEET_ARSIP_URL)
        ]);

        if (!resProduk.ok || !resArsip.ok) throw new Error("Gagal mengambil respon dari Google");
        
        const textDataTerbaru = await resProduk.text();
        const textArsipTerbaru = await resArsip.text();

    // Update data produk jika ada perubahan harga
        if (textDataTerbaru !== cacheLokalProduk) {
            localStorage.setItem('nk_cache_produk_csv', textDataTerbaru);
            uraiDanProsesTeksCSV(textDataTerbaru);
            gantiTabUtama(tabUtamaAktif); 
        }

        // Update data arsip status transaksi harian
        localStorage.setItem('nk_cache_arsip_csv', textArsipTerbaru);
        muatStrukturArsip(textArsipTerbaru);
        console.log("Daftar harga & status arsip berhasil diperbarui dari Google Sheets!");

    } catch (error) {
        console.warn("Koneksi lambat/offline. Menggunakan pangkalan data internal HP:", error);
    }
}
/**
 * FUNGSI BANTUAN UNTUK MEMPROSES STRUKTUR DATA BARIS CSV (KODE BARU)
 */
function uraiDanProsesTeksCSV(teksMentah) {
    rawDatabaseRows = teksMentah.split(/\r?\n/).slice(1);

    masterPulsaGroup = {};
    masterKuotaGroup = {};
    masterTokenGroup = {};

    rawDatabaseRows.forEach(row => {
        if (!row.trim()) return;
        const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        if (cols.length < 3) return;

        const kategoriAsli = cols[0].trim().replace(/"/g, "");
        const namaProduk = cols[1].trim().replace(/"/g, "");
        const hargaNormal = parseInt(cols[2]?.replace(/\D/g, '')) || 0;
        const hargaPromo = parseInt(cols[3]?.replace(/\D/g, '')) || 0;
        const hargaFlash = parseInt(cols[4]?.replace(/\D/g, '')) || 0;
        const waktuMundur = cols[5]?.trim().replace(/"/g, "") || "";

        const upperKat = kategoriAsli.toUpperCase();
        const upperNama = namaProduk.toUpperCase();

        const itemObject = {
            nama: namaProduk, kategoriAsli: kategoriAsli,
            priceNormal: hargaNormal, pricePromo: hargaPromo, priceFlash: hargaFlash,
            endTimer: waktuMundur
        };

        if (upperKat.includes("PLN") || upperKat.includes("TOKEN") || upperNama.includes("PLN") || upperNama.includes("TOKEN")) {
            let opKey = "TOKEN PLN";
            if (!masterTokenGroup[opKey]) masterTokenGroup[opKey] = [];
            masterTokenGroup[opKey].push(itemObject);
        } 
        else if (upperKat.includes("PULSA") || upperNama.includes("PULSA")) {
            let operatorKey = dapatkanOperatorKey(upperKat, upperNama);
            if (operatorKey === "LAINNYA") operatorKey = "PULSA";
            if (!masterPulsaGroup[operatorKey]) masterPulsaGroup[operatorKey] = [];
            masterPulsaGroup[operatorKey].push(itemObject);
        } 
        else {
            let operatorKey = dapatkanOperatorKey(upperKat, upperNama);
            if (!masterKuotaGroup[operatorKey]) masterKuotaGroup[operatorKey] = [];
            masterKuotaGroup[operatorKey].push(itemObject);
        }
    });
}


function dapatkanOperatorKey(upperKat, upperNama) {
    if (upperKat.includes("TELKOMSEL") || upperNama.includes("TELKOMSEL")) return "TELKOMSEL";
    if (upperKat.includes("INDOSAT") || upperKat.includes("ISAT") || upperNama.includes("INDOSAT") || upperNama.includes("ISAT")) return "INDOSAT";
    if (upperKat.includes("XL") || upperNama.includes("XL")) return "XL";
    if (upperKat.includes("AXIS") || upperNama.includes("AXIS")) return "AXIS";
    if (upperKat.includes("TRI") || upperKat.includes("THREE") || upperKat.includes("3") || upperNama.includes("TRI")) return "TRI";
    if (upperKat.includes("SMARTFREN") || upperNama.includes("SMARTFREN")) return "SMARTFREN";
    if (upperKat.includes("BY.U") || upperKat.includes("BYU") || upperNama.includes("BY.U")) return "BY.U";
    if (upperKat.includes("DANA")) return "DANA";
    if (upperKat.includes("GOPAY")) return "GOPAY";
    if (upperKat.includes("SHOPEE")) return "SHOPEEPAY";
    return "LAINNYA";
}

/**
 * 3. ENGINE DETEKSI PROVIDER NOMOR HP (SUDAH DIPERBAIKI)
 */
function fiturDeteksiOtomatisDanCariProvider(noHp) {
    if (tabUtamaAktif === "TOKEN") {
        tampilkanNamaPelangganPLN(noHp);
        return;
    }
    const helper = document.getElementById('helper-deteksi-operator');
    if (!noHp || noHp.length < 4) {
        if(helper) helper.classList.add('hidden');
        return;
    }

    let providerDitemukan = "";
    if (/^(0851)/.test(noHp)) {
        providerDitemukan = "BY.U";
    }
    else if (/^(0811|0812|0813|0821|0822|0823)/.test(noHp)) {
        providerDitemukan = "TELKOMSEL";
    }
    else if (/^(0814|0815|0816|0855|0856|0857|0858)/.test(noHp)) providerDitemukan = "INDOSAT";
    else if (/^(0817|0818|0819|0859|0877|0878)/.test(noHp)) providerDitemukan = "XL";
    else if (/^(0831|0832|0833|0838)/.test(noHp)) providerDitemukan = "AXIS";
    else if (/^(0895|0896|0897|0898|0899)/.test(noHp)) providerDitemukan = "TRI";
    else if (/^(0881|0882|0883|0884|0885|0886|0887|0888|0889)/.test(noHp)) providerDitemukan = "SMARTFREN";

    if (providerDitemukan) {
        if(helper) {
            helper.classList.remove('hidden');
            helper.innerHTML = `<i class="fas fa-robot text-emerald-600"></i> Terdeteksi: <span class="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-black text-[9px]">${providerDitemukan}</span>`;
        }

        // PERBAIKAN LOGIKA DISINI (PULSA ke masterPulsaGroup, KUOTA ke masterKuotaGroup)
        const databaseTarget = (tabUtamaAktif === "PULSA") ? masterPulsaGroup : masterKuotaGroup;
        if (databaseTarget[providerDitemukan]) {
            operatorAktif = providerDitemukan;
            function renderPilihanTombolSliderAktif() {
    const container = document.getElementById('category-container');
    if(!container) return;
    container.innerHTML = "";

    // MEMAKSA KONTAINER AGAR BISA DIGESER SECARA HORIZONTAL VIA TAILWIND
    container.className = "flex flex-row overflow-x-auto snap-x snap-mandatory whitespace-nowrap gap-2 py-2 w-full max-w-full";

    let databaseTarget = {};
    if (tabUtamaAktif === "PULSA") databaseTarget = masterPulsaGroup;
    else if (tabUtamaAktif === "KUOTA") databaseTarget = masterKuotaGroup;
    else if (tabUtamaAktif === "TOKEN") databaseTarget = masterTokenGroup;

    const listOperatorTerdeteksi = Object.keys(databaseTarget);

    listOperatorTerdeteksi.forEach(op => {
        const btn = document.createElement('button');
        // shrink-0 sangat penting agar tombol tidak gepeng/mengecil dan bisa meluber ke kanan agar bisa digeser
        btn.className = `operator-slider-btn shrink-0 font-black text-xs px-4 py-2.5 rounded-xl transition-all border flex items-center gap-2 snap-center ${
            op === operatorAktif ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-700 border-gray-200 shadow-sm'
        }`;

        const fileIcon = iconMap[op] || "PULSA.png";
        btn.innerHTML = `<img src="${fileIcon}" class="w-4 h-4 object-contain rounded" onerror="this.src='PULSA.png'"> <span>${op}</span>`;
        btn.onclick = () => {
            operatorAktif = op;
            renderPilihanTombolSliderAktif();
            renderCardsProduk();
        };
        container.appendChild(btn);
    });
}
            renderCardsProduk();
        }
    } else {
        if(helper) helper.classList.add('hidden');
    }
}

/**
 * 4. KONTROL MULTI-TAB SEAMLESS
 */
function gantiTabUtama(jenisTab) {
    tabUtamaAktif = jenisTab;
    
    const tabs = ['PULSA', 'KUOTA', 'TOKEN'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-${t.toLowerCase()}`);
        if(btn) {
            if (t === jenisTab) {
                btn.className = "py-3 text-[9px] font-black uppercase rounded-xl transition-all bg-blue-600 text-white shadow-sm flex flex-col items-center justify-center gap-1";
            } else {
                btn.className = "py-3 text-[9px] font-black uppercase rounded-xl transition-all text-gray-500 flex flex-col items-center justify-center gap-1";
            }
        }
    });

    const currentPhone = document.getElementById('search-phone-input')?.value || "";
    renderAutoOperatorSliders();
    if (jenisTab === "TOKEN") tampilkanNamaPelangganPLN(currentPhone);
    else if(currentPhone) fiturDeteksiOtomatisDanCariProvider(currentPhone);
}

function renderAutoOperatorSliders() {
    const container = document.getElementById('category-container');
    if (!container) return;
    container.innerHTML = "";

    let databaseTarget = {};
    if (tabUtamaAktif === "PULSA") databaseTarget = masterPulsaGroup;
    else if (tabUtamaAktif === "KUOTA") databaseTarget = masterKuotaGroup;
    else if (tabUtamaAktif === "TOKEN") databaseTarget = masterTokenGroup;

    const listOperatorTerdeteksi = Object.keys(databaseTarget);

    if (listOperatorTerdeteksi.length > 0) {
        operatorAktif = listOperatorTerdeteksi[0];
        renderPilihanTombolSliderAktif();
        renderCardsProduk();
    } else {
        container.innerHTML = `<div class="text-[11px] font-bold text-gray-400 italic px-1 py-2">Tidak ada data penawaran.</div>`;
        document.getElementById('product-grid').innerHTML = "";
    }
}

function renderPilihanTombolSliderAktif() {
    const container = document.getElementById('category-container');
    if(!container) return;
    container.innerHTML = "";

    let databaseTarget = {};
    if (tabUtamaAktif === "PULSA") databaseTarget = masterPulsaGroup;
    else if (tabUtamaAktif === "KUOTA") databaseTarget = masterKuotaGroup;
    else if (tabUtamaAktif === "TOKEN") databaseTarget = masterTokenGroup;

    const listOperatorTerdeteksi = Object.keys(databaseTarget);

    listOperatorTerdeteksi.forEach(op => {
        const btn = document.createElement('button');
        btn.className = `operator-slider-btn shrink-0 font-black text-xs px-4 py-2.5 rounded-xl transition-all border flex items-center gap-2 snap-center ${
            op === operatorAktif ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-700 border-gray-200 shadow-sm'
        }`;

        const fileIcon = iconMap[op] || "PULSA.png";
        btn.innerHTML = `<img src="${fileIcon}" class="w-4 h-4 object-contain rounded" onerror="this.src='PULSA.png'"> <span>${op}</span>`;
        btn.onclick = () => {
            operatorAktif = op;
            renderPilihanTombolSliderAktif();
            renderCardsProduk();
        };
        container.appendChild(btn);
    });
}

function renderCardsProduk() {
    if (intervalMainTimer) clearInterval(intervalMainTimer);

    const gridRegular = document.getElementById('product-grid');
    const gridFlash = document.getElementById('main-flash-grid');
    const sectionFlash = document.getElementById('main-flash-section');
    const badgeCount = document.getElementById('badge-count-produk');

    if (!gridRegular) return;
    gridRegular.innerHTML = "";
    if (gridFlash) gridFlash.innerHTML = "";

    let databaseTarget = {};
    if (tabUtamaAktif === "PULSA") databaseTarget = masterPulsaGroup;
    else if (tabUtamaAktif === "KUOTA") databaseTarget = masterKuotaGroup;
    else if (tabUtamaAktif === "TOKEN") databaseTarget = masterTokenGroup;

    const items = databaseTarget[operatorAktif] || [];
    if (badgeCount) badgeCount.innerText = `${items.length} Item`;

    let adaFlashSale = false;
    let targetTimeFlashGlobal = "";

    items.forEach(item => {
        const fileIcon = iconMap[operatorAktif] || "PULSA.png";

        if (item.priceFlash > 0) {
            adaFlashSale = true;
            if (item.endTimer) targetTimeFlashGlobal = item.endTimer;
            const diskon = Math.round(((item.priceNormal - item.priceFlash) / item.priceNormal) * 100);

            const card = document.createElement('div');
            card.className = "flash-card border-2 border-red-200 bg-white p-4 rounded-2xl flex flex-col items-center text-center cursor-pointer";
            card.onclick = () => tambahKeKeranjang(item.nama, item.priceFlash, `FLASH SALE (-${diskon}%)`);
            card.innerHTML = `
                <div class="absolute top-0 right-0 bg-red-600 text-white font-black text-[8px] px-2 py-0.5 rounded-bl-xl uppercase">-${diskon}%</div>
                <img src="${fileIcon}" class="w-7 h-7 object-contain mb-1.5 rounded-lg" onerror="this.src='PULSA.png'">
                <div class="text-[10px] font-black text-gray-700 uppercase leading-tight">${item.nama}</div>
                <div class="text-[9px] font-bold text-gray-400 line-through mt-1">Rp ${item.priceNormal.toLocaleString('id-ID')}</div>
                <div class="text-[12px] font-black text-red-600">Rp ${item.priceFlash.toLocaleString('id-ID')}</div>
            `;
            if (gridFlash) gridFlash.appendChild(card);
        } 
        else if (item.pricePromo > 0) {
            const diskonPromo = Math.round(((item.priceNormal - item.pricePromo) / item.priceNormal) * 100);

            const card = document.createElement('div');
            card.className = "product-card border border-orange-300 bg-orange-50/20 p-4 rounded-2xl flex flex-col items-center text-center cursor-pointer relative overflow-hidden shadow-sm";
            card.onclick = () => tambahKeKeranjang(item.nama, item.pricePromo, `PROMO (-${diskonPromo}%)`);
            card.innerHTML = `
                <div class="absolute top-0 right-0 bg-orange-500 text-white font-black text-[7px] px-1.5 py-0.5 rounded-bl-lg">PROMO -${diskonPromo}%</div>
                <img src="${fileIcon}" class="w-7 h-7 object-contain mb-1.5 rounded-lg" onerror="this.src='PULSA.png'">
                <div class="text-[10px] font-black text-gray-700 uppercase leading-tight">${item.nama}</div>
                <div class="text-[9px] font-bold text-gray-400 line-through mt-1">Rp ${item.priceNormal.toLocaleString('id-ID')}</div>
                <div class="text-[11px] font-black text-orange-600">Rp ${item.pricePromo.toLocaleString('id-ID')}</div>
            `;
            gridRegular.appendChild(card);
        } 
        else {
            const card = document.createElement('div');
            card.className = "product-card border border-gray-200 bg-white p-4 rounded-2xl flex flex-col items-center text-center cursor-pointer shadow-sm";
            card.onclick = () => tambahKeKeranjang(item.nama, item.priceNormal, "REGULAR");
            card.innerHTML = `
                <img src="${fileIcon}" class="w-7 h-7 object-contain mb-2 rounded-lg" onerror="this.src='PULSA.png'">
                <div class="text-[10px] font-black text-gray-700 uppercase leading-tight">${item.nama}</div>
                <div class="text-[11px] font-black text-blue-600 mt-2">Rp ${item.priceNormal.toLocaleString('id-ID')}</div>
            `;
            gridRegular.appendChild(card);
        }
    });

    if (sectionFlash) {
        if (adaFlashSale) {
            sectionFlash.classList.remove('hidden');
            jalankanTimerMundurDinamis(targetTimeFlashGlobal);
        } else {
            sectionFlash.classList.add('hidden');
        }
    }
}

function jalankanTimerMundurDinamis(targetString) {
    let targetDate = null;
    
    if (targetString && targetString.trim() !== "") {
        try {
            // SISTEM PENGAMAN: Bersihkan teks jika admin salah input di spreadsheet
            let formatBersih = targetString
                .replace(/WITA|WIB|WIT|jam/gi, '') // Hapus tulisan WITA/WIB/Jam
                .replace(/\./g, ':')               // Ubah paksa titik (.) menjadi titik dua (:)
                .trim();
                
            targetDate = new Date(formatBersih);
            
            // Jika hasilnya tetap rusak (NaN), gunakan pengaman waktu default (Jam 12 malam ini)
            if (isNaN(targetDate.getTime())) {
                throw new Error("Format tanggal spreadsheet tidak valid.");
            }
        } catch (e) {
            console.warn("Koreksi otomatis aktif: ", e.message);
            const skrg = new Date();
            targetDate = new Date(skrg.getFullYear(), skrg.getMonth(), skrg.getDate(), 23, 59, 59);
        }
    } else {
        // Jika kolom waktu di spreadsheet dikosongkan, otomatis hitung mundur ke jam 12 malam hari ini
        const skrg = new Date();
        targetDate = new Date(skrg.getFullYear(), skrg.getMonth(), skrg.getDate(), 23, 59, 59);
    }

    // Interval pemicu perubahan teks angka di halaman index.html
    intervalMainTimer = setInterval(() => {
        const kini = new Date();
        const selisih = targetDate - kini;

        if (selisih <= 0) {
    document.getElementById('timer-hour').innerText = "00";
    document.getElementById('timer-min').innerText = "00";
    document.getElementById('timer-sec').innerText = "00";
    clearInterval(intervalMainTimer);
    
    // TAMBAHAN KEAMANAN: Otomatis sembunyikan area Flash Sale di Web NK JAYA CELL
    const sectionFlash = document.getElementById('main-flash-section');
    if (sectionFlash) {
        sectionFlash.classList.add('hidden'); // Menyembunyikan etalase promo dari mata pembeli
    }
    
    return;
}


        const h = Math.floor(selisih / (1000 * 60 * 60));
        const m = Math.floor((selisih / (1000 * 60)) % 60);
        const s = Math.floor((selisih / 1000) % 60);

        document.getElementById('timer-hour').innerText = h < 10 ? '0' + h : h;
        document.getElementById('timer-min').innerText = m < 10 ? '0' + m : m;
        document.getElementById('timer-sec').innerText = s < 10 ? '0' + s : s;
    }, 1000);
}


/**
 * 5. PENGELOLAAN KERANJANG/DRAF TRANSAKSI
 */
function tambahKeKeranjang(nama, harga, label, kategoriOtomatis = null, targetOtomatis = null) {
    // [VALIDASI TERPUSAT] Validasi khusus untuk halaman game.
    if (window.location.pathname.includes('gameml.html')) {
        const gameIdEl = document.getElementById('game_id');
        const zoneIdEl = document.getElementById('zone_id');
        const gameId = gameIdEl ? gameIdEl.value.trim() : "";
        const zoneId = zoneIdEl ? zoneIdEl.value.trim() : "";

        const applyShake = (el) => {
            if (!el) return;
            el.classList.add('shake-effect');
            el.focus();
            setTimeout(() => el.classList.remove('shake-effect'), 600);
        };

        if (!gameId) {
            applyShake(gameIdEl);
            return; // Hentikan proses jika ID Game kosong
        }

        const gameName = kategoriOtomatis.replace('TOPUP ', '').trim().toUpperCase();
        if ((gameName === 'MLBB' || gameName === 'MOBILE LEGENDS' || gameName === 'MOBILE LEGEND') && !zoneId) {
            applyShake(zoneIdEl);
            return; // Hentikan proses jika Zone ID MLBB kosong
        }

        // Jika validasi lolos, gabungkan ID untuk ditampilkan di modal
        targetOtomatis = zoneId ? `${gameId} (${zoneId})` : gameId;
    }

    keranjangBelanja = {
        kategori: kategoriOtomatis || `${tabUtamaAktif} - ${operatorAktif}`,
        produk: nama,
        harga: harga,
        labelType: label
    };
    const cartCountEl = document.getElementById('cart-count');
    if (cartCountEl) cartCountEl.innerText = "1";

    // Tentukan nomor target yang akan diisi di modal
    // Jika dari halaman game, gunakan targetOtomatis. Jika dari index, gunakan input utama.
    const nomorTargetFinal = targetOtomatis || document.getElementById('search-phone-input')?.value.trim() || "";

    bukaModalKeranjang(nomorTargetFinal);
}

function bukaModalKeranjang(nomorTargetOtomatis = "") {
    const modal = document.getElementById('cart-modal');
    const titleModal = document.getElementById('modal-title-dynamic');
    const listContainer = document.getElementById('cart-items-list');
    const totalPriceEl = document.getElementById('cart-total-price');
    const inputModalPhone = document.getElementById('customer-phone');
    
    const checkoutSection = document.getElementById('checkout-payment-section');
    const historySection = document.getElementById('history-view-section');

    if (!modal) return;
    
    if (checkoutSection) checkoutSection.classList.remove('hidden');
    if (historySection) historySection.classList.add('hidden');

    // Otomatis isi nomor target di modal jika ada
    if (inputModalPhone) {
        inputModalPhone.value = nomorTargetOtomatis;
        // Kunci input jika nomor sudah terisi otomatis (baik dari game atau index)
        inputModalPhone.readOnly = !!nomorTargetOtomatis;
    }

    if (titleModal) titleModal.innerHTML = `<i class="fas fa-shopping-basket text-blue-600"></i> Rincian Pembelian`;

    if (!keranjangBelanja) {
        if (listContainer) {
            listContainer.innerHTML = `
                <div class="text-center py-6 text-gray-400 italic text-xs">
                    <i class="fas fa-shopping-basket text-3xl mb-2 text-gray-300 block"></i>
                    Keranjang draf kosong.<br>Silakan tentukan produk Anda!
                </div>
            `;
        }
        if (totalPriceEl) totalPriceEl.innerText = "Rp 0";
    } else {
        if (listContainer) {
            listContainer.innerHTML = `
                <div class="flex justify-between items-center bg-gray-50 p-3.5 rounded-2xl border border-gray-100 text-xs font-bold text-gray-700">
                    <div>
                        <span class="text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded mr-1 uppercase font-black">${keranjangBelanja.kategori}</span>
                        <div class="text-gray-900 font-black mt-1 text-sm leading-tight">${keranjangBelanja.produk}</div>
                        <span class="text-[9px] text-gray-400 font-medium">${keranjangBelanja.labelType}</span>
                    </div>
                    <div class="flex items-center gap-3 shrink-0">
                        <div class="text-blue-600 font-black text-right">Rp ${keranjangBelanja.harga.toLocaleString('id-ID')}</div>
                        <button onclick="hapusItemKeranjang()" class="text-red-400 hover:text-red-600 p-2 text-base transition-colors active:scale-90">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            `;
        }
        if (totalPriceEl) totalPriceEl.innerText = `Rp ${keranjangBelanja.harga.toLocaleString('id-ID')}`;
    }

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('div').classList.remove('translate-y-full');
    }, 10);
}

/**
 * 6. LOG HISTORI RIWAYAT
 */
/**
 * 6. MENAMPILKAN TRANSAKSI DARI LOCALSTORAGE (INSTANT & AKURAT)
 */
function bukaModalRiwayatLangsung() {
    const modal = document.getElementById('cart-modal');
    const titleModal = document.getElementById('modal-title-dynamic');
    const checkoutSection = document.getElementById('checkout-payment-section');
    const historySection = document.getElementById('history-view-section');

    if (!modal) return;

    // Switch View Section
    if (checkoutSection) checkoutSection.classList.add('hidden');
    if (historySection) historySection.classList.remove('hidden');

    if (titleModal) titleModal.innerHTML = `<i class="fas fa-history text-indigo-600"></i> Log Histori Toko`;
    
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('div').classList.remove('translate-y-full');
    }, 10);

    // Langsung ambil data dari LocalStorage
    listCacheRiwayat = JSON.parse(localStorage.getItem('nk_produk_history')) || [];

    // KODE TAMBAHAN: Pastikan database dari lokal/Google Sheet dipetakan ulang sebelum merender status
    const cacheLokalProduk = localStorage.getItem('nk_cache_produk_csv');
    if (cacheLokalProduk && rawDatabaseRows.length === 0) {
        uraiDanProsesTeksCSV(cacheLokalProduk);
    }

    // Jalankan render list dengan filter default 'SEMUA'
    filterRiwayatStatus('SEMUA');
}

function filterRiwayatStatus(filterType) {
    const itemsContainer = document.getElementById('history-items-container');
    if (!itemsContainer) return;

    // Atur Aktif Tombol Filter Tab UI
    const filterButtons = {
        'SEMUA': 'btn-fltr-all', 'SUKSES': 'btn-fltr-sukses', 'PROSES': 'btn-fltr-proses', 'GAGAL': 'btn-fltr-gagal'
    };
    
    Object.keys(filterButtons).forEach(key => {
        const btn = document.getElementById(filterButtons[key]);
        if (btn) {
            if (key === filterType) {
                btn.className = "shrink-0 text-[10px] font-black px-3 py-1.5 rounded-full bg-blue-600 text-white shadow-sm transition-all";
            } else {
                btn.className = "shrink-0 text-[10px] font-black px-3 py-1.5 rounded-full bg-gray-100 text-gray-500 transition-all hover:bg-gray-200";
            }
        }
    });

    // Buat peta (map) status terupdate berdasarkan "Nomor/ID Target" dari sheet ARSIP
    let statusTerupdateMap = {};
    
    rawArsipRows.forEach(row => {
        if (!row.trim()) return;
        const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        
        // Mengambil ID transaksi dari kolom A, target dari kolom C, dan status dari kolom G.
        const idTransaksiSheet = cols[0] ? cols[0].trim().replace(/"/g, "").replace(/'/g, "") : "";
        const noHpTargetSheet = cols[2] ? cols[2].trim().replace(/"/g, "").replace(/'/g, "") : "";
        const noHpTargetKey = noHpTargetSheet.replace(/\D/g, "");
        const statusTransaksiSheet = cols[6] ? cols[6].trim().replace(/"/g, "").toUpperCase() : "";

        if (noHpTargetSheet && statusTransaksiSheet) {
            statusTerupdateMap[noHpTargetSheet] = statusTransaksiSheet;
        }
        if (noHpTargetKey && statusTransaksiSheet) {
            statusTerupdateMap[noHpTargetKey] = statusTransaksiSheet;
        }
        if (idTransaksiSheet && statusTransaksiSheet) {
            statusTerupdateMap[idTransaksiSheet] = statusTransaksiSheet;
        }
    });

    // Proses data riwayat dan perbarui statusnya berdasarkan pencocokan nomor HP target
    let riwayatDiproses = listCacheRiwayat.map(item => {
        let noHpKey = item.target ? item.target.trim() : "";
        let noHpDigitsKey = noHpKey.replace(/\D/g, "");
        // Jika ditemukan status terbaru di sheet ARSIP berdasarkan nomor HP, pakai status itu.
        let statusFinal = statusTerupdateMap[item.id_transaksi]
            || statusTerupdateMap[noHpKey]
            || statusTerupdateMap[noHpDigitsKey]
            || item.statusAwal
            || item.status
            || "PROSES";
        
        // Standarisasi kata status dari Google Sheet ke sistem UI aplikasi Anda
        if (statusFinal.includes("LUNAS") || statusFinal === "SUCCESS") statusFinal = "SUKSES";
        if (statusFinal.includes("PENDING")) statusFinal = "PROSES";
        if (statusFinal.includes("FAILED")) statusFinal = "GAGAL";

        return {
            ...item,
            status: statusFinal
        };
    });

    // Filter berdasarkan tipe status yang dipilih pengguna
    let dataTerfilter = riwayatDiproses;
    if (filterType !== 'SEMUA') {
        dataTerfilter = riwayatDiproses.filter(item => item.status === filterType);
    }

    // Batasi maksimal 20 riwayat teranyar
    const dataFinal = dataTerfilter.slice(0, 20);

    if (dataFinal.length === 0) {
        itemsContainer.innerHTML = `
            <div class="text-center py-10 text-gray-400 italic text-xs bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                <i class="fas fa-folder-open text-3xl mb-2 text-gray-300 block"></i>
                Belum ada transaksi <br>dengan status <b>${filterType.toLowerCase()}</b>.
            </div>
        `;
        return;
    }

    let htmlOutput = "";
    dataFinal.forEach(item => {
        let badgeStyle = "";
        let iconStyle = "fa-spinner animate-spin text-amber-500";
        
        if (item.status === "SUKSES") {
            badgeStyle = "bg-emerald-50 text-emerald-700 border border-emerald-100";
            iconStyle = "fa-check-circle text-emerald-500";
        } else if (item.status === "GAGAL") {
            badgeStyle = "bg-rose-50 text-rose-700 border border-rose-100";
            iconStyle = "fa-times-circle text-rose-500";
        } else {
            badgeStyle = "bg-amber-50 text-amber-700 border border-amber-100 animate-pulse";
            iconStyle = "fa-spinner animate-spin text-amber-500";
        }

        let formatTarget = item.target;
        // PERBAIKAN: Gunakan label produk yang lebih deskriptif dari data riwayat
        let produkLabelTampil = item.produkLengkap || // Gunakan field baru jika ada
                                (item.kategoriLengkap ? `[${item.kategoriLengkap}] ${item.produk}` : item.produk) || // Fallback ke format lama
                                "Produk Tidak Dikenal";

        // Amankan objek item menjadi string JSON yang valid untuk atribut HTML
        const itemJson = JSON.stringify(item).replace(/"/g, "'");

        // [BARU] Tambahkan tombol lihat struk, meniru transfer.js
        const tombolStrukHTML = `
            <button onclick="tampilkanStrukDariRiwayat(${itemJson})" class="w-full text-center bg-emerald-600/10 text-emerald-600 text-[10px] font-bold py-2 rounded-xl hover:bg-emerald-600 hover:text-white transition-all mt-1 flex items-center justify-center gap-1.5">
                <i class="fas fa-receipt"></i> Lihat Struk
            </button>
        `;

        htmlOutput += `
            <div class="p-3.5 bg-white border border-gray-100 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.02)] space-y-2.5 text-left relative overflow-hidden">
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-2">
                        <div class="text-[9px] text-gray-400 font-bold">ID: <span class="text-indigo-500">${item.id_transaksi || '-'}</span></div>
                        <button onclick="copyToClipboard(this, '${item.id_transaksi || ''}')" class="text-gray-400 hover:text-blue-600 text-xs p-1 rounded-full bg-gray-100 active:scale-90 transition-all" title="Salin ID">
                            <i class="far fa-copy"></i>
                        </button>
                    </div>
                    <span class="${badgeStyle} px-2 py-0.5 rounded-lg font-black text-[9px] tracking-wide flex items-center gap-1 uppercase">
                        <i class="fas ${iconStyle}"></i> ${item.status}
                    </span>
                </div>
                
                <div class="font-extrabold text-gray-900 text-xs tracking-tight leading-snug uppercase">
                    ${produkLabelTampil}
                </div>
                <div class="text-[9px] text-gray-400 font-semibold">
                    ${item.tanggal || ''}
                </div>
                
                <div class="flex justify-between items-end pt-1 border-t border-gray-50">
                    <div class="text-[10px] text-gray-400 font-semibold">
                        ID/No Target: <span class="text-gray-700 font-black tracking-wider">${formatTarget}</span>
                    </div>
                    <div class="text-right">
                        <p class="text-[8px] uppercase text-gray-400 font-bold tracking-wider leading-none">Total Bayar</p>
                        <p class="text-xs font-black text-blue-600 mt-0.5">Rp ${item.biaya.toLocaleString('id-ID')}</p>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <button onclick="orderUlangDariRiwayat(${itemJson})" class="w-full text-center bg-blue-600/10 text-blue-600 text-[10px] font-bold py-2 rounded-xl hover:bg-blue-600 hover:text-white transition-all mt-1 flex items-center justify-center gap-1.5">
                        <i class="fas fa-redo-alt"></i> Beli Lagi
                    </button>
                    ${tombolStrukHTML}
                </div>
            </div>
        `;
    });

    itemsContainer.innerHTML = `
        <div class="space-y-2.5">${htmlOutput}</div>
        <div class="pt-2">
            <button onclick="bersihkanRiwayatProduk()" class="w-full py-2 bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-600 text-[10px] font-bold rounded-xl transition-colors border border-dashed">
                <i class="fas fa-trash-alt mr-1"></i> Bersihkan Semua Histori Produk
            </button>
        </div>
    `;
}

/**
 * Fungsi untuk mengisi ulang form dari data riwayat untuk transaksi baru
 */
function orderUlangDariRiwayat(itemRiwayat) {
    // PERBAIKAN: Gunakan properti `gameName` yang sudah ada di riwayat untuk mendeteksi item game.
    // Properti ini akan bernilai nama game (misal: "MLBB", "FF") jika itu adalah transaksi game, dan null jika bukan.
    const isGameTopup = !!itemRiwayat.gameName;

    if (isGameTopup) {
        // Cek apakah kita berada di halaman topup game
        if (!window.location.pathname.includes('gameml.html')) {
            // Jika tidak, simpan data ke session dan arahkan ke halaman game
            sessionStorage.setItem('order_ulang_game', JSON.stringify(itemRiwayat));
            window.location.href = 'gameml.html';
        } else {
            // Jika sudah di halaman game, langsung panggil fungsi untuk mengisi form tanpa refresh
            tutupModalKeranjang();
            // Panggil fungsi yang ada di gameml.js dengan data riwayat sebagai parameter
            if (typeof prosesOrderUlangGame === 'function') {
                prosesOrderUlangGame(itemRiwayat);
            }
        }
    } else {
        // Ini adalah item pulsa/kuota. Cek apakah kita sedang di halaman game.
        if (window.location.pathname.includes('gameml.html')) {
            // Jika di halaman game, simpan data dan redirect ke index.html
            sessionStorage.setItem('order_ulang_non_game', JSON.stringify(itemRiwayat));
            window.location.href = 'index.html';
        } else {
            // Jika sudah di index.html, langsung isi form.
            const elInputTujuan = document.getElementById('search-phone-input');
            if (elInputTujuan && itemRiwayat.target) {
                elInputTujuan.value = itemRiwayat.target;
                fiturDeteksiOtomatisDanCariProvider(itemRiwayat.target);
            }
            tutupModalKeranjang();
        }
    }

    // Gulir ke atas halaman agar pengguna fokus ke input
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
// Fungsi pelengkap untuk menghapus riwayat jika memori penuh
function bersihkanRiwayatProduk() {
    if (confirm("Hapus permanen semua histori transaksi produk di perangkat ini?")) {
        localStorage.removeItem('nk_produk_history');
        bukaModalRiwayatLangsung();
    }
}

function hapusItemKeranjang() {
    if (confirm("Hapus draf transaksi saat ini?")) {
        keranjangBelanja = null;
        document.getElementById('cart-count').innerText = "0";
        tutupModalKeranjang();
    }
}

function tutupModalKeranjang() {
    const modal = document.getElementById('cart-modal');
    if (!modal) return;
    modal.classList.add('opacity-0');
    modal.querySelector('div').classList.add('translate-y-full');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

function toggleMetodePembayaranUI(metode) {
    const lblWa = document.getElementById('label-pay-wa');
    const lblQris = document.getElementById('label-pay-qris');
    const btnCheckout = document.getElementById('btn-checkout');

    const radioWa = document.getElementById('radio-pay-wa');
    const radioQris = document.getElementById('radio-pay-qris');

    if (metode === 'WA') {
        if(radioWa) radioWa.checked = true;
        if(lblWa) lblWa.className = "border-2 border-blue-600 bg-blue-50/50 p-3 rounded-xl flex items-center gap-2.5 cursor-pointer";
        if(lblQris) lblQris.className = "border border-gray-200 p-3 rounded-xl flex items-center gap-2.5 cursor-pointer";
        if(btnCheckout) {
            btnCheckout.innerHTML = `<i class="fab fa-whatsapp text-lg"></i> Beli Lewat WhatsApp`;
            btnCheckout.className = "w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black text-sm py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95";
        }
    } else {
        if(radioQris) radioQris.checked = true;
        if(lblQris) lblQris.className = "border-2 border-blue-600 bg-blue-50/50 p-3 rounded-xl flex items-center gap-2.5 cursor-pointer";
        if(lblWa) lblWa.className = "border border-gray-200 p-3 rounded-xl flex items-center gap-2.5 cursor-pointer";
        if(btnCheckout) {
            btnCheckout.innerHTML = `<i class="fas fa-qrcode text-lg"></i> Tampilkan QRIS Pembayaran`;
            btnCheckout.className = "w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black text-sm py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95";
        }
    }
}

/**
 * 7. PROSES CHECKOUT AKHIR (SUDAH DIOPTIMALKAN & AMAN)
 */
function prosesCheckoutAkhir() {
    const inputHp = document.getElementById('customer-phone');
    const noHp = inputHp ? inputHp.value.trim() : "";

    if (!noHp) {
        showAlert("DATA KURANG", "Lengkapi Nomor Tujuan", ["Anda harus memasukkan Nomor HP atau ID Pelanggan di kolom yang tersedia."]);
        return;
    }
    if (!keranjangBelanja) {
        showAlert("KERANJANG KOSONG", "Pilih Produk Dahulu", ["Keranjang belanja Anda masih kosong.", "Silakan pilih produk yang ingin dibeli."]);
        return;
    }

    const radioTerpilih = document.querySelector('input[name="payment-method"]:checked');
    const metodePilihan = radioTerpilih ? radioTerpilih.value : "WA";

    if (metodePilihan === 'WA') {
        kirimTransaksiKeSheetDanWA(noHp, "Pending (WA)");
    } else {
        // Pembuatan Kode Unik Acak 11-99 Rupiah
        const kodeUnik = Math.floor(Math.random() * 89) + 11; 
        const hargaAsli = keranjangBelanja.harga;
        const totalDenganKodeUnik = hargaAsli + kodeUnik;
        
        keranjangBelanja.hargaDenganKodeUnik = totalDenganKodeUnik;
        keranjangBelanja.kodeUnikTerpakai = kodeUnik;

        // Tampilkan teks rincian nominal pembayaran
        const txtPriceContainer = document.getElementById('qris-price-text');
        if (txtPriceContainer) {
            txtPriceContainer.innerHTML = `
                <div class="text-gray-600 text-xs">Harga Produk: Rp ${hargaAsli.toLocaleString('id-ID')}</div>
                <div class="text-amber-600 text-xs font-bold">Kode Unik: +Rp ${kodeUnik}</div>
                <div class="text-blue-600 font-black text-sm mt-1">TOTAL WAJIB TRANSFER:<br>Rp ${totalDenganKodeUnik.toLocaleString('id-ID')}</div>
                <p class="text-[9px] text-red-500 mt-1 leading-tight">*Mohon transfer sesuai nominal di atas agar sistem mendeteksi otomatis.</p>
            `;
        }

        // Generate QRIS Dinamis melalui API gratis goqr/qrserver
        const stringQrisFinal = buatTeksQrisDinamis(totalDenganKodeUnik);
        const qrImageElement = document.getElementById('qris-image-target'); 
        if (qrImageElement) {
            qrImageElement.src = `https://quickchart.io/qr?size=250&text=${encodeURIComponent(stringQrisFinal)}`;
        }

        tutupModalKeranjang();
        const modalQris = document.getElementById('qris-modal');
        if(modalQris) {
            modalQris.classList.remove('hidden');
            setTimeout(() => modalQris.classList.remove('opacity-0'), 50);
        }
    }
}

async function kirimTransaksiKeSheetDanWA(noHp, statusLabel) {
    const btn = document.getElementById('btn-checkout');
    const txtAsli = btn ? btn.innerHTML : "";
    if(btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner animate-spin"></i> Memproses Nota...`;
    }

    const waktuMks = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' }) + ' WITA';
    
    // Perbaikan: Standarisasi format produk untuk riwayat
    const isGame = keranjangBelanja.kategori.toUpperCase().includes('TOPUP');
    const produkUntukRiwayat = isGame ? `${keranjangBelanja.kategori.replace('TOPUP ', '').trim()} - ${keranjangBelanja.produk}` : `[${keranjangBelanja.kategori}] ${keranjangBelanja.produk}`;
    const fullProdukLabel = `${produkUntukRiwayat} (${keranjangBelanja.labelType})`;

    // Ambil harga final (jika ada kode unik dari sistem QRIS sebelumnya)
    const hargaFinal = keranjangBelanja.hargaDenganKodeUnik ? keranjangBelanja.hargaDenganKodeUnik : keranjangBelanja.harga;

    // [FIX] Susun data sesuai format yang diharapkan oleh Apps Script doPost
    const idTransaksi = 'NKJ' + Date.now().toString().slice(-7);
    const dataSimpan = {
        id_transaksi: idTransaksi,
        tanggal: waktuMks,
        // [FIX] Hapus tanda kutip. Ini menyebabkan ketidakcocokan saat mengambil status riwayat.
        nomor: noHp,
        produk: fullProdukLabel,
        harga_asli: keranjangBelanja.harga,
        total_transfer: hargaFinal,
        status: statusLabel
    };

    // --- 1. SIMPAN KE RIWAYAT LOKAL (SAMA SEPERTI TRANSAKSI TRANSFER) ---
    simpanRiwayatProdukLokal(idTransaksi, waktuMks, noHp, fullProdukLabel, hargaFinal, statusLabel);

    // [UPDATE] Gunakan metode FormData yang sama dengan transfer.js untuk pengiriman data yang lebih andal.
    try {
        // Kirim sebagai JSON, karena Apps Script untuk 'ARSIP' mengharapkan e.postData.contents
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            // Hapus 'mode: no-cors' agar bisa membaca respons
            headers: {
              'Content-Type': 'text/plain;charset=utf-8', // Gunakan text/plain untuk menghindari preflight CORS
            },
            body: JSON.stringify(dataSimpan)
        });

        const textResponse = await response.text();
        if (textResponse.trim().toLowerCase() === 'sukses') {
            console.log(`✅ Data produk (ID: ${idTransaksi}) berhasil terekam di Google Sheets.`);
        } else {
            throw new Error(`Server merespons dengan pesan tak terduga: ${textResponse}`);
        }
    } catch (e) { 
        console.error(`❌ Gagal mengirim data produk (ID: ${idTransaksi}) ke Google Sheets:`, e);
    }

    const textWA = `⚡ *TRANSAKSI BARU - NK JAYA CELL* ⚡\n` +
                   `--------------------------------------------\n` +
                   `*ID Transaksi: ${idTransaksi}*\n\n` +
                   `📱 Kategori: *${keranjangBelanja.kategori}*\n` +
                   `🎯 No HP/ID Target: \`${noHp}\`\n` +
                   `📦 Produk: ${keranjangBelanja.produk}\n` +
                   `🏷️ Jenis: *${keranjangBelanja.labelType}*\n` +
                   `💳 Pembayaran: *${statusLabel}*\n` +
                   `💰 Total Bayar: *Rp ${hargaFinal.toLocaleString('id-ID')}*\n` +
                   `--------------------------------------------\n` +
                   `Mohon segera diproses ya, Terima kasih! 🙏`;

    window.open(`https://wa.me/${WA_ADMIN}?text=${encodeURIComponent(textWA)}`, '_blank');

    // PERBAIKAN: Beri jeda agar pengguna melihat proses selesai sebelum modal ditutup.
    setTimeout(() => {
        const inputPencarian = document.getElementById('search-phone-input');
        if(inputPencarian) inputPencarian.value = "";
        
        const customerPhoneEl = document.getElementById('customer-phone');

        // PERBAIKAN: Tambahkan pembersihan untuk input ID di halaman game.
        const gameIdEl = document.getElementById('game_id');
        const zoneIdEl = document.getElementById('zone_id');
        if (gameIdEl) gameIdEl.value = "";
        if (zoneIdEl) zoneIdEl.value = "";

        if (customerPhoneEl) {
            customerPhoneEl.value = "";
            customerPhoneEl.readOnly = false;
        }
        
        keranjangBelanja = null;
        document.getElementById('cart-count').innerText = "0";
        if(btn) btn.disabled = false; // Cukup aktifkan kembali, teks akan direset saat modal dibuka lagi.
        tutupModalKeranjang();
    }, 1500); // Jeda 1.5 detik
}

// FUNGSI SLIDER BANNER (KHUSUS UNTUK INDEX.HTML)
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

function simpanRiwayatProdukLokal(idTransaksi, waktu, noHp, produk, total, status) {
    let riwayat = JSON.parse(localStorage.getItem('nk_produk_history')) || [];
    
    const isGame = keranjangBelanja.kategori.toUpperCase().includes('TOPUP');
    const gameName = isGame ? keranjangBelanja.kategori.replace('TOPUP ', '').trim() : null;


    // PENYEMPURNAAN: Buat satu field baru yang menyimpan deskripsi lengkap produk
    const produkLengkap = `[${keranjangBelanja.kategori}] ${keranjangBelanja.produk} (${keranjangBelanja.labelType})`;

    const transaksiBaru = {
        id_transaksi: idTransaksi,
        tanggal: waktu,
        target: noHp,
        produk: keranjangBelanja.produk, // Gunakan nama produk bersih
        biaya: total,
        status: status.toUpperCase().includes("LUNAS") ? "SUKSES" : "PROSES", // Tetap 'PROSES' jika bukan LUNAS
        produkLengkap: produkLengkap, // Simpan deskripsi lengkap ke dalam satu field
        gameName: gameName // Properti baru untuk menyimpan nama game yang bersih
    };

    riwayat.unshift(transaksiBaru); // Masukkan ke urutan paling atas
    localStorage.setItem('nk_produk_history', JSON.stringify(riwayat));
}

function tutupModalQris() {
    const modal = document.getElementById('qris-modal');
    if(modal) {
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

function konfirmasiSudahBayarQris() {
    // Perbaikan: Ambil nomor target dari input yang benar.
    // Input ini sudah diisi otomatis baik dari halaman game maupun index.
    const inputTarget = document.getElementById('customer-phone');
    const noHp = inputTarget ? inputTarget.value.trim() : "";
    tutupModalQris();
    
    if(keranjangBelanja && keranjangBelanja.hargaDenganKodeUnik) {
        keranjangBelanja.harga = keranjangBelanja.hargaDenganKodeUnik; 
    }
    
    kirimTransaksiKeSheetDanWA(noHp, "Lunas (Scan QRIS Dinamis)");
}

/**
 * ==========================================================
 * [BARU] FUNGSI-FUNGSI STRUK (DIADAPTASI DARI TRANSFER.JS)
 * ==========================================================
 */

/**
 * Fungsi jembatan untuk menampilkan struk dari data riwayat produk
 */
function tampilkanStrukDariRiwayat(item) {
    const kolomEdit = JSON.parse(localStorage.getItem('nk_token_receipt_edits') || '{}')[item.id_transaksi] || {};
    const barisArsip = cariBarisArsipUntukStruk(item);
    const ambilArsip = aliases => ambilNilaiArsip(barisArsip, aliases);
    const produk = item.produkLengkap || item.produk || '';
    const gabunganProduk = `${produk} ${ambilArsip(['PRODUK', 'NAMA PRODUK'])}`.toUpperCase();
    const token = {
        idTrx: kolomEdit.idTrx || item.id_transaksi || ambilArsip(['ID TRANSAKSI', 'ID TRX', 'ID']),
        idPln: kolomEdit.idPln || item.target || ambilArsip(['ID PLN', 'IDPEL', 'NOMOR METER', 'NOMOR']),
        produk: kolomEdit.produk || ambilArsip(['PRODUK', 'NAMA PRODUK']) || produk,
        nama: kolomEdit.nama || ambilArsip(['NAMA', 'NAMA PELANGGAN', 'PELANGGAN']) || petaNamaPelangganPLN[(item.target || '').replace(/\D/g, '')] || '-',
        tarifDaya: kolomEdit.tarifDaya || petaDayaPelangganPLN[(item.target || '').replace(/\D/g, '')] || '-',
        jumlahDaya: kolomEdit.jumlahDaya || ambilArsip(['JUMLAH DAYA', 'DAYA TERISI', 'JUMLAH NOMINAL', 'NOMINAL']) || '-',
        harga: kolomEdit.harga || ambilArsip(['HARGA', 'TOTAL TRANSFER', 'TOTAL BAYAR']) || item.biaya,
        serial: kolomEdit.serial || ambilArsip(['SERIAL NUMBER', 'NOMOR TOKEN', 'ANGKA TOKEN', 'TOKEN', 'SN']) || '-'
    };
    tampilkanStruk({
        id: item.id_transaksi,
        tanggal: item.tanggal,
        target: item.target,
        produkLengkap: produk,
        total: item.biaya,
        status: item.status,
        isToken: gabunganProduk.includes('TOKEN') || gabunganProduk.includes('PLN'),
        token
    });
}

function cariBarisArsipUntukStruk(item) {
    const idItem = String(item.id_transaksi || '').replace(/['\s]/g, '').toUpperCase();
    const targetItem = String(item.target || '').replace(/\D/g, '');
    const barisArsip = rawArsipRows.map(pecahBarisCSV);
    const barisDenganId = barisArsip.find(cols => {
        const idArsip = ambilNilaiArsip(cols, ['ID TRANSAKSI', 'ID TRX', 'ID']).replace(/['\s]/g, '').toUpperCase();
        return idItem && idArsip === idItem;
    });
    if (barisDenganId) return barisDenganId;
    return barisArsip.find(cols => {
        const targetArsip = ambilNilaiArsip(cols, ['ID PLN', 'IDPEL', 'NOMOR METER', 'NOMOR', 'TARGET']).replace(/\D/g, '');
        return targetItem && targetArsip === targetItem;
    }) || [];
}

/**
 * Menampilkan modal struk dengan data transaksi
 */
function tampilkanStruk(data) {
    const modal = document.getElementById('struk-modal');
    if (!modal) return;
    dataStrukAktif = data;

    const judulEl = document.getElementById('struk-status-judul');
    if (data.status === 'SUKSES') {
        judulEl.innerText = 'TRANSAKSI BERHASIL';
        judulEl.className = 'font-black text-green-600 text-lg';
    } else if (data.status === 'GAGAL') {
        judulEl.innerText = 'TRANSAKSI GAGAL';
        judulEl.className = 'font-black text-red-600 text-lg';
    } else {
        judulEl.innerText = 'TRANSAKSI DIPROSES';
        judulEl.className = 'font-black text-amber-600 text-lg';
    }

    document.getElementById('struk-waktu').innerText = data.tanggal || new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
    document.getElementById('struk-penerima').innerText = data.produkLengkap;
    document.getElementById('struk-total').innerText = 'Rp ' + Number(data.total || 0).toLocaleString('id-ID');

    const tokenSection = document.getElementById('struk-token');
    const umumSection = document.getElementById('struk-umum');
    if (data.isToken && tokenSection && umumSection) {
        umumSection.classList.add('hidden');
        tokenSection.classList.remove('hidden');
        const tokenFields = {
            'token-id-trx': data.token.idTrx,
            'token-id-pln': data.token.idPln,
            'token-produk': data.token.produk,
            'token-nama': data.token.nama,
            'token-tarif-daya': data.token.tarifDaya,
            'token-jumlah-daya': data.token.jumlahDaya,
            'token-harga': formatHarga(data.token.harga),
            'token-serial': data.token.serial
        };
        Object.entries(tokenFields).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.innerText = value || '-';
        });
    } else if (tokenSection && umumSection) {
        tokenSection.classList.add('hidden');
        umumSection.classList.remove('hidden');
    }

    // Menampilkan detail target (No HP/ID Game)
    const targetDetailEl = document.getElementById('struk-target-detail');
    targetDetailEl.innerHTML = `
        <div class="flex justify-between">
            <span class="text-gray-500 font-medium">ID Transaksi:</span>
            <span class="font-bold text-gray-800">${data.id || '-'}</span>
        </div>
        <div class="flex justify-between">
            <span class="text-gray-500 font-medium">ID/No. Target:</span>
            <span class="font-bold text-gray-800">${data.target}</span>
        </div>
    `;

    // Sembunyikan rincian admin yang tidak relevan untuk produk
    document.getElementById('struk-rincian-biaya').classList.add('hidden');

    const actionsContainer = document.getElementById('struk-actions');
    actionsContainer.innerHTML = `
        ${data.isToken ? `<button onclick="aktifkanEditStrukToken('${data.id}')" class="col-span-2 w-full py-2.5 bg-amber-100 text-amber-700 font-black text-xs rounded-xl active:scale-95 transition-all"><i class="fas fa-pen mr-1"></i> Edit Struk Token</button>` : ''}
        <button onclick="downloadStruk('${data.id}')" class="w-full py-3 bg-gray-200 text-gray-800 font-bold text-xs rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2">
            <i class="fas fa-download"></i> Download
        </button>
        <button onclick="bagikanStrukWA()" class="w-full py-3 bg-green-500 text-white font-black text-xs rounded-xl shadow-md active:scale-95 transition-all flex items-center justify-center gap-2">
            <i class="fab fa-whatsapp"></i> Bagikan WA
        </button>
        <button onclick="printStruk58mm()" class="col-span-2 w-full py-2.5 bg-slate-900 text-white font-black text-xs rounded-xl active:scale-95 transition-all"><i class="fas fa-print mr-1"></i> Print Struk 58mm</button>
        <button onclick="tutupModalStruk()" class="col-span-2 w-full py-2 bg-transparent text-gray-500 font-bold text-xs rounded-xl active:scale-95 transition-all">
            Tutup
        </button>
    `;

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('div').classList.remove('scale-95');
    }, 10);
}

function formatHarga(value) {
    const angka = Number(String(value || '').replace(/\D/g, ''));
    return angka ? 'Rp ' + angka.toLocaleString('id-ID') : (value || '-');
}

function nilaiStrukToken(id) {
    return document.getElementById(id)?.innerText.trim() || '-';
}

function bagikanStrukWA() {
    if (!dataStrukAktif) return;
    shareStruk(dataStrukAktif.id);
}

let printerBluetoothCharacteristic = null;

async function printStruk58mm() {
    if (!dataStrukAktif?.isToken) {
        alert('Printer Bluetooth 58mm saat ini khusus untuk struk token listrik.');
        return;
    }
    if (!navigator.bluetooth) {
        alert('Web Bluetooth tidak didukung. Gunakan Chrome di Android melalui HTTPS atau localhost.');
        return;
    }

    try {
        if (!printerBluetoothCharacteristic) {
            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [
                    '0000ffe0-0000-1000-8000-00805f9b34fb',
                    '0000ff00-0000-1000-8000-00805f9b34fb',
                    '000018f0-0000-1000-8000-00805f9b34fb'
                ]
            });
            const server = await device.gatt.connect();
            const services = await server.getPrimaryServices();
            for (const service of services) {
                const characteristics = await service.getCharacteristics();
                printerBluetoothCharacteristic = characteristics.find(characteristic =>
                    characteristic.properties.write || characteristic.properties.writeWithoutResponse
                );
                if (printerBluetoothCharacteristic) break;
            }
        }
        if (!printerBluetoothCharacteristic) throw new Error('Characteristic printer tidak ditemukan.');

        const esc = '\x1B';
        const gs = '\x1D';
        const nilai = id => nilaiStrukToken(id);
        const bungkusTeks = (value, lebar) => {
            const kata = String(value || '-').split(/\s+/);
            const baris = [];
            let barisAktif = '';
            kata.forEach(kataAktif => {
                if ((barisAktif + ' ' + kataAktif).trim().length <= lebar) {
                    barisAktif = (barisAktif + ' ' + kataAktif).trim();
                } else {
                    if (barisAktif) baris.push(barisAktif);
                    while (kataAktif.length > lebar) {
                        baris.push(kataAktif.slice(0, lebar));
                        kataAktif = kataAktif.slice(lebar);
                    }
                    barisAktif = kataAktif;
                }
            });
            if (barisAktif || !baris.length) baris.push(barisAktif || '-');
            return baris;
        };
        const field = (label, value) => {
            const awalan = `${label}: `;
            const barisNilai = bungkusTeks(value, 32 - awalan.length);
            return [awalan + barisNilai[0], ...barisNilai.slice(1).map(baris => ' '.repeat(awalan.length) + baris)];
        };
        const isi = [
            `${esc}@`, `${esc}a\x01`, `${esc}E\x01`, 'NK JAYA CELL', `${esc}E\x00`,
            'STRUK TOKEN LISTRIK', `${esc}a\x00`, '--------------------------------',
            ...field('ID TRX', nilai('token-id-trx')),
            ...field('ID PLN', nilai('token-id-pln')),
            ...field('PRODUK', nilai('token-produk')),
            ...field('NAMA', nilai('token-nama')),
            ...field('TARIF/DAYA', nilai('token-tarif-daya')),
            ...field('JUMLAH DAYA', nilai('token-jumlah-daya')),
            ...field('HARGA', nilai('token-harga')),
            '--------------------------------', `${esc}a\x01`, 'NOMOR TOKEN', `${esc}a\x00`,
            `${gs}!\x11`, ...bungkusTeks(nilai('token-serial'), 16), `${gs}!\x00`,
            `${esc}a\x01`, 'Terima kasih', `${esc}a\x00`, '\n\n\n'
        ].join('\n');
        await kirimDataBluetooth(new TextEncoder().encode(isi));
    } catch (error) {
        printerBluetoothCharacteristic = null;
        console.error('Gagal mencetak ke printer Bluetooth:', error);
        alert(`Gagal mencetak Bluetooth: ${error.message}`);
    }
}

async function kirimDataBluetooth(data) {
    for (let posisi = 0; posisi < data.length; posisi += 180) {
        const potongan = data.slice(posisi, posisi + 180);
        if (printerBluetoothCharacteristic.properties.writeWithoutResponse) {
            await printerBluetoothCharacteristic.writeValueWithoutResponse(potongan);
        } else {
            await printerBluetoothCharacteristic.writeValue(potongan);
        }
    }
}

function printStruk() {
    const isiStruk = document.getElementById('struk-content');
    if (!isiStruk) return;
    const jendelaPrint = window.open('', '_blank', 'width=420,height=760');
    if (!jendelaPrint) {
        alert('Pop-up print diblokir browser. Izinkan pop-up lalu coba lagi.');
        return;
    }
    jendelaPrint.document.write(`<!doctype html><html lang="id"><head><base href="${window.location.href}"><meta charset="utf-8"><title>Struk NK JAYA CELL</title><style>
        *{box-sizing:border-box}body{margin:0;padding:16px;background:#fff;color:#111;font-family:Arial,sans-serif}#struk-content{width:100%;max-width:380px;margin:auto;padding:20px;background:#fff}img{max-width:64px;display:block;margin:0 auto 8px}button{display:none!important}.hidden{display:none!important}.text-center{text-align:center}.flex{display:flex}.justify-between{justify-content:space-between}.text-right{text-align:right}.break-all{word-break:break-all}.text-2xl{font-size:24px}.text-3xl{font-size:30px}.font-black,.font-bold{font-weight:700}.text-gray-500,.text-gray-400{color:#666}.border-t,.border-t-2{border-top:1px dashed #bbb;margin-top:12px;padding-top:12px}.border-t-2{border-top:2px solid #333}.space-y-2>*+*{margin-top:8px}.space-y-2\.5>*+*{margin-top:10px}@media print{body{padding:0}}
    </style></head><body>${isiStruk.outerHTML}</body></html>`);
    jendelaPrint.document.close();
    jendelaPrint.focus();
    setTimeout(() => { jendelaPrint.print(); jendelaPrint.close(); }, 300);
}

function aktifkanEditStrukToken(id) {
    const fields = Array.from(document.querySelectorAll('#struk-token [data-editable="true"]'));
    const sedangEdit = fields[0]?.isContentEditable;
    if (sedangEdit) return;
    fields.forEach(field => {
        field.contentEditable = 'true';
        field.classList.toggle('rounded', !sedangEdit);
        field.classList.toggle('bg-amber-50', !sedangEdit);
        field.classList.toggle('outline-none', !sedangEdit);
    });
    const actions = document.getElementById('struk-actions');
    actions.insertAdjacentHTML('afterbegin', `<button id="token-save-button" onclick="simpanEditStrukToken('${id}')" class="col-span-2 w-full py-2.5 bg-emerald-600 text-white font-black text-xs rounded-xl"><i class="fas fa-save mr-1"></i> Simpan Perubahan</button>`);
}

function simpanEditStrukToken(id) {
    const edit = {};
    const fieldMap = {
        'token-id-trx': 'idTrx', 'token-id-pln': 'idPln', 'token-produk': 'produk', 'token-nama': 'nama',
        'token-tarif-daya': 'tarifDaya', 'token-jumlah-daya': 'jumlahDaya', 'token-harga': 'harga', 'token-serial': 'serial'
    };
    Object.entries(fieldMap).forEach(([elementId, key]) => { edit[key] = document.getElementById(elementId)?.innerText.trim() || ''; });
    const edits = JSON.parse(localStorage.getItem('nk_token_receipt_edits') || '{}');
    edits[id] = edit;
    localStorage.setItem('nk_token_receipt_edits', JSON.stringify(edits));
    document.querySelectorAll('#struk-token [data-editable="true"]').forEach(field => {
        field.contentEditable = 'false';
        field.classList.remove('rounded', 'bg-amber-50', 'outline-none');
    });
    document.getElementById('token-save-button')?.remove();
    showAlert('STRUK TERSIMPAN', 'Perubahan struk token disimpan di perangkat ini.', ['Data arsip asli tetap tidak berubah.']);
}

function tutupModalStruk() {
    const modal = document.getElementById('struk-modal');
    if (modal) {
        modal.classList.add('opacity-0');
        modal.querySelector('div').classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

async function downloadStruk(ref) {
    const strukElement = document.getElementById('struk-content');
    try {
        const canvas = await html2canvas(strukElement, { scale: 3, backgroundColor: '#ffffff' });
        const link = document.createElement('a');
        link.download = `struk-pembelian-${ref}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (error) {
        console.error('Gagal membuat gambar struk:', error);
    }
}

async function shareStruk(ref) {
    const strukElement = document.getElementById('struk-content');
    const originalBg = strukElement.style.backgroundColor;
    strukElement.style.backgroundColor = 'white'; // Pastikan background putih untuk gambar

    try {
        const canvas = await html2canvas(strukElement, { scale: 2 });
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('Gambar struk gagal dibuat.');
        const file = new File([blob], `struk-token-${ref}.png`, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: `Struk Token ${ref}` });
        } else {
            alert('Browser tidak mendukung berbagi file. Silakan gunakan tombol Download, lalu kirim gambar ke WhatsApp.');
        }
    } catch (error) {
        console.error('Gagal berbagi struk:', error);
        alert('Gagal membuat atau membagikan gambar struk. Silakan coba lagi.');
    } finally {
        strukElement.style.backgroundColor = originalBg; // Kembalikan background
    }
}

/**
 * [BARU] Fungsi untuk menyalin teks ke clipboard
 */
function copyToClipboard(button, text) {
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
        showAlert("GAGAL MENYALIN", "Terjadi Kesalahan", ["Gagal menyalin ID Transaksi ke clipboard."]);
    });
}



// ==========================================================
// LOGIKA INSTALASI APLIKASI (PWA FLOATING BUTTON)
// ==========================================================
let deferredPrompt;
const btnInstallFloating = document.getElementById('btn-install-floating');

window.addEventListener('beforeinstallprompt', (e) => {
    // Mencegah browser menampilkan prompt bawaan secara otomatis
    e.preventDefault();
    // Simpan event agar bisa dipicu nanti
    deferredPrompt = e;
    // Munculkan tombol melayang dari persembunyian
    if (btnInstallFloating) {
        btnInstallFloating.classList.remove('hidden');
    }
});

if (btnInstallFloating) {
    btnInstallFloating.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        // Tampilkan prompt instalasi ke pengguna
        deferredPrompt.prompt();
        // Tunggu jawaban pengguna
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        // Reset variabel prompt karena hanya bisa digunakan sekali
        deferredPrompt = null;
        // Sembunyikan kembali tombolnya
        btnInstallFloating.classList.add('hidden');
    });
}

window.addEventListener('appinstalled', () => {
    console.log('Aplikasi NK JAYA CELL berhasil diinstal!');
    if (btnInstallFloating) {
        btnInstallFloating.classList.add('hidden');
    }
});
