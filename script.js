// ==========================================================
// CORE ENGINE SYSTEM APPS V3.6 - NK JAYA CELL
// ==========================================================
const WA_ADMIN = "6285847909692";
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT6mOnYdR8MGwIusehg_plQJHoAVALhdcXNpbgOatMEkuipIoUDfECd5KWe0KAUNl8QTyaKz7PeeigA/pub?gid=0&single=true&output=csv";
const SHEET_ARSIP_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT6mOnYdR8MGwIusehg_plQJHoAVALhdcXNpbgOatMEkuipIoUDfECd5KWe0KAUNl8QTyaKz7PeeigA/pub?gid=702573697&single=true&output=csv"
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwh0lE_0ebqn2ScCWvxioXBJYwLl2qT3aGVHk_W0QHTRP21lWb88djzWMCrihY0ZkHj/exec";

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
let masterPulsaGroup = {};
let masterKuotaGroup = {};
let masterTokenGroup = {}; 

let tabUtamaAktif = "KUOTA";
let operatorAktif = "";     
let keranjangBelanja = null; 
let intervalMainTimer = null;
let listCacheRiwayat = []; 

document.addEventListener('DOMContentLoaded', () => {
    muatDataDanPisahKategori();
});

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
        alert("Browser Anda tidak mendukung Contact Picker. Silakan ketik nomor secara manual.");
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
        rawArsipRows = cacheLokalArsip.split(/\r?\n/).slice(1);
    }

    // 2. TETAP SINKRONISASI DATA TERBARU DARI GOOGLE SHEET DI LATAR BELAKANG
    try {
       // Ambil data dari kedua sheet secara paralel (bersamaan)
        const [resProduk, resArsip] = await Promise.all([
            fetch(SHEET_CSV_URL),
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
        rawArsipRows = textArsipTerbaru.split(/\r?\n/).slice(1);
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
    if (tabUtamaAktif === "TOKEN") return; 
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
    if(currentPhone && jenisTab !== "TOKEN") fiturDeteksiOtomatisDanCariProvider(currentPhone);
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
function tambahKeKeranjang(nama, harga, label) {
    const nomorHpDariPencarian = document.getElementById('search-phone-input').value.trim();

    keranjangBelanja = {
        kategori: `${tabUtamaAktif} - ${operatorAktif}`,
        produk: nama,
        harga: harga,
        labelType: label
    };
    document.getElementById('cart-count').innerText = "1";

    bukaModalKeranjang();

    if (nomorHpDariPencarian) {
        const inputModalPhone = document.getElementById('customer-phone');
        if(inputModalPhone) {
            inputModalPhone.value = nomorHpDariPencarian;
            inputModalPhone.readOnly = true; 
        }
    }
}

function bukaModalKeranjang() {
    const modal = document.getElementById('cart-modal');
    const titleModal = document.getElementById('modal-title-dynamic');
    const listContainer = document.getElementById('cart-items-list');
    const totalPriceEl = document.getElementById('cart-total-price');
    
    const checkoutSection = document.getElementById('checkout-payment-section');
    const historySection = document.getElementById('history-view-section');

    if (!modal) return;
    
    if (checkoutSection) checkoutSection.classList.remove('hidden');
    if (historySection) historySection.classList.add('hidden');

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
        
        // PENTING: Sesuaikan indeks di bawah ini sesuai urutan kolom pada Sheet "ARSIP" Anda!
        // Contoh di bawah berasumsi: Kolom 2 (indeks 1) adalah Nomor HP Target, dan Kolom 6 (indeks 5) adalah Statusnya.
        const noHpTargetSheet = cols[1] ? cols[1].trim().replace(/"/g, "").replace(/'/g, "") : "";
        const statusTransaksiSheet = cols[5] ? cols[5].trim().replace(/"/g, "").toUpperCase() : "";

        if (noHpTargetSheet && statusTransaksiSheet) {
            statusTerupdateMap[noHpTargetSheet] = statusTransaksiSheet;
        }
    });

    // Proses data riwayat dan perbarui statusnya berdasarkan pencocokan nomor HP target
    let riwayatDiproses = listCacheRiwayat.map(item => {
        let noHpKey = item.target ? item.target.trim() : "";
        // Jika ditemukan status terbaru di sheet ARSIP berdasarkan nomor HP, pakai status itu.
        let statusFinal = statusTerupdateMap[noHpKey] || item.statusAwal || item.status || "PROSES";
        
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
        let iconStyle = "";
        
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
        let produkLabelTampil = item.kategoriLengkap || item.produk;

        htmlOutput += `
            <div class="p-3.5 bg-white border border-gray-100 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.02)] space-y-2.5 text-left relative overflow-hidden">
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-1.5 text-[9px] text-gray-400 font-bold">
                        <i class="far fa-clock text-indigo-500"></i>
                        <span>${item.tanggal}</span>
                    </div>
                    <span class="${badgeStyle} px-2 py-0.5 rounded-lg font-black text-[9px] tracking-wide flex items-center gap-1 uppercase">
                        <i class="fas ${iconStyle}"></i> ${item.status}
                    </span>
                </div>
                
                <div class="font-extrabold text-gray-900 text-xs tracking-tight leading-snug uppercase">
                    ${produkLabelTampil}
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

    if (metode === 'WA') {
        if(lblWa) lblWa.className = "border-2 border-blue-600 bg-blue-50/50 p-3 rounded-xl flex items-center gap-2.5 cursor-pointer";
        if(lblQris) lblQris.className = "border border-gray-200 p-3 rounded-xl flex items-center gap-2.5 cursor-pointer";
        if(btnCheckout) {
            btnCheckout.innerHTML = `<i class="fab fa-whatsapp text-lg"></i> Beli Lewat WhatsApp`;
            btnCheckout.className = "w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black text-sm py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95";
        }
    } else {
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

    if (!noHp) return alert("Masukkan Nomor HP / ID Pelanggan!");
    if (!keranjangBelanja) return alert("Draf Transaksi Kosong!");

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
    const fullProdukLabel = `[${keranjangBelanja.kategori}] ${keranjangBelanja.produk} (${keranjangBelanja.labelType})`;

    // Ambil harga final (jika ada kode unik dari sistem QRIS sebelumnya)
    const hargaFinal = keranjangBelanja.hargaDenganKodeUnik ? keranjangBelanja.hargaDenganKodeUnik : keranjangBelanja.harga;

    const dataSimpan = [{
        tanggal: waktuMks, nomor: "'" + noHp, produk: fullProdukLabel,
        harga_asli: keranjangBelanja.harga, total_transfer: hargaFinal, status: statusLabel
    }];

    // --- 1. SIMPAN KE RIWAYAT LOKAL (SAMA SEPERTI TRANSAKSI TRANSFER) ---
    simpanRiwayatProdukLokal(waktuMks, noHp, fullProdukLabel, hargaFinal, statusLabel);

    try {
        await fetch(SCRIPT_URL, {
            method: 'POST', mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataSimpan)
        });
    } catch (e) { console.error(e); }

    const textWA = `⚡ *TRANSAKSI BARU - NK JAYA CELL* ⚡\n` +
                   `--------------------------------------------\n` +
                   `📱 Kategori: *${keranjangBelanja.kategori}*\n` +
                   `🎯 No HP/ID Target: \`${noHp}\`\n` +
                   `📦 Produk: ${keranjangBelanja.produk}\n` +
                   `🏷️ Jenis: *${keranjangBelanja.labelType}*\n` +
                   `💳 Pembayaran: *${statusLabel}*\n` +
                   `💰 Total Bayar: *Rp ${hargaFinal.toLocaleString('id-ID')}*\n` +
                   `--------------------------------------------\n` +
                   `Mohon segera diproses ya, Terima kasih! 🙏`;

    window.open(`https://wa.me/${WA_ADMIN}?text=${encodeURIComponent(textWA)}`, '_blank');

    const inputPencarian = document.getElementById('search-phone-input');
    if(inputPencarian) inputPencarian.value = "";
    document.getElementById('customer-phone').value = "";
    document.getElementById('customer-phone').readOnly = false;
    keranjangBelanja = null;
    document.getElementById('cart-count').innerText = "0";
    if(btn) {
        btn.disabled = false;
        btn.innerHTML = txtAsli;
    }
    tutupModalKeranjang();
}

// Fungsi internal baru untuk mendata ke LocalStorage
function simpanRiwayatProdukLokal(waktu, noHp, produk, total, status) {
    let riwayat = JSON.parse(localStorage.getItem('nk_produk_history')) || [];
    
    const transaksiBaru = {
        tanggal: waktu,
        target: noHp,
        produk: produk,
        biaya: total,
        status: status.toUpperCase().includes("LUNAS") ? "SUKSES" : "PROSES"
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
    const inputHp = document.getElementById('customer-phone');
    const noHp = inputHp ? inputHp.value.trim() : "";
    tutupModalQris();
    
    if(keranjangBelanja && keranjangBelanja.hargaDenganKodeUnik) {
        keranjangBelanja.harga = keranjangBelanja.hargaDenganKodeUnik; 
    }
    
    kirimTransaksiKeSheetDanWA(noHp, "Lunas (Scan QRIS Dinamis)");
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
