// ==========================================================
// SYSTEM TOPUP GAME ADVANCED SPREADSHEET CONTROL - NK JAYA CELL
// ==========================================================

const FINAL_WA_ADMIN = typeof WA_ADMIN !== 'undefined' ? WA_ADMIN : "6285847909692";
const FINAL_CSV_URL = typeof SHEET_CSV_URL !== 'undefined' ? SHEET_CSV_URL : "https://docs.google.com/spreadsheets/d/e/2PACX-1vT6mOnYdR8MGwIusehg_plQJHoAVALhdcXNpbgOatMEkuipIoUDfECd5KWe0KAUNl8QTyaKz7PeeigA/pub?gid=0&single=true&output=csv";

let dbGame = {}; 
let gameDipilih = ''; 
let diamondDipilih = null;
let intervalTimerGlobal = null;

document.addEventListener('DOMContentLoaded', () => {
    muatDataDariSpreadsheet();
});

/**
 * FETCHING DATA DAN SYNC MULTI-KOLOM DARI SPREADSHEET
 */
async function muatDataDariSpreadsheet() {
    const selectEl = document.getElementById('pilih-game');
    try {
        const response = await fetch(FINAL_CSV_URL);
        const text = await response.text();
        const rows = text.split(/\r?\n/).slice(1);

        dbGame = {};

        rows.forEach(row => {
            if (!row.trim()) return;
            const cols = row.split(',');
            if (cols.length < 3) return;

            const kategori = cols[0].trim().replace(/"/g, "");
            const namaProduk = cols[1].trim().replace(/"/g, "");
            
            // Baca baris kolom C, D, E, F secara berurutan
            const hargaNormal = parseInt(cols[2]?.replace(/\D/g, '')) || 0;
            const hargaPromo = parseInt(cols[3]?.replace(/\D/g, '')) || 0;
            const hargaFlashSale = parseInt(cols[4]?.replace(/\D/g, '')) || 0;
            const waktuMundur = cols[5]?.trim().replace(/"/g, "") || "";

            if (!dbGame[kategori]) {
                dbGame[kategori] = [];
            }
            
            dbGame[kategori].push({ 
                name: namaProduk, 
                priceNormal: hargaNormal,
                pricePromo: hargaPromo,
                priceFlash: hargaFlashSale,
                endTimer: waktuMundur
            });
        });

        if (selectEl) {
            selectEl.innerHTML = '<option value="">-- Pilih Game --</option>';
            Object.keys(dbGame).forEach(game => {
                const blacklistKategori = ['PULSA', 'INDOSAT', 'XL', 'TELKOMSEL', 'AXIS', 'TRI', 'SMARTFREN', 'BY.U', 'SHOPEEPAY', 'GOPAY', 'DANA','TOKEN','PLN'];
                if(blacklistKategori.includes(game.toUpperCase())) return;
                selectEl.innerHTML += `<option value="${game}">${game}</option>`;
            });
        }
    } catch (error) {
        console.error("Gagal sinkronisasi data:", error);
    }
}

/**
 * MENGATUR FILTERING GEOMETRI FORM & TIMER MUNDUR SPREADSHEET
 */
function gantiGame(val) {
    gameDipilih = val;
    diamondDipilih = null; 
    
    // Clear timer aktif sebelumnya jika ganti game
    if (intervalTimerGlobal) clearInterval(intervalTimerGlobal);

    const containerID = document.getElementById('container-input-id');
    const gridRegular = document.getElementById('diamond-grid');
    const gridFlash = document.getElementById('flash-grid');
    const sectionFlash = document.getElementById('flash-sale-section');

    if (!gameDipilih) {
        if (containerID) containerID.innerHTML = '<div class="text-xs font-bold text-gray-400 italic">Silakan pilih game terlebih dahulu...</div>';
        if (gridRegular) gridRegular.innerHTML = '<div class="col-span-2 text-center py-6 text-xs font-bold text-gray-400">Silakan pilih game di atas.</div>';
        if (sectionFlash) sectionFlash.classList.add('hidden');
        return;
    }

    // Mengatur Layout Input ID Target
    const gameUpper = gameDipilih.toUpperCase();
    if (gameUpper === 'MLBB' || gameUpper === 'MOBILE LEGENDS' || gameUpper === 'MOBILE LEGEND') {
        containerID.className = "grid grid-cols-3 gap-3";
        containerID.innerHTML = `
            <input type="number" id="game_id" placeholder="User ID" inputmode="numeric" class="col-span-2 p-4 rounded-2xl bg-gray-50 border border-gray-200 text-sm font-bold focus:outline-none focus:border-blue-600 transition-colors">
            <input type="number" id="zone_id" placeholder="(Zone)" inputmode="numeric" class="col-span-1 p-4 rounded-2xl bg-gray-50 border border-gray-200 text-sm font-bold text-center focus:outline-none focus:border-blue-600 transition-colors">
        `;
    } else {
        containerID.className = "grid grid-cols-1";
        containerID.innerHTML = `
            <input type="number" id="game_id" placeholder="Masukkan Player ID ${gameDipilih}" inputmode="numeric" class="w-full p-4 rounded-2xl bg-gray-50 border border-gray-200 text-sm font-bold focus:outline-none focus:border-blue-600 transition-colors">
        `;
    }

    const gid = document.getElementById('game_id');
    const zid = document.getElementById('zone_id');
    if (gid) gid.addEventListener('input', function() { this.value = this.value.replace(/[^0-9]/g, ''); });
    if (zid) zid.addEventListener('input', function() { this.value = this.value.replace(/[^0-9]/g, ''); });

    // Pemrosesan Pemisahan Item Berdasarkan Kolom Spreadsheet
    if (gridRegular && gridFlash && sectionFlash) {
        gridRegular.innerHTML = '';
        gridFlash.innerHTML = '';
        
        const listProduk = dbGame[gameDipilih] || [];
        let adaFlashSaleActive = false;
        let waktuTargetFlashSaleGlobal = "";

        listProduk.forEach(item => {
            const warnaIcon = gameUpper === 'FF' ? 'text-orange-500' : (gameUpper === 'MLBB' ? 'text-blue-500' : 'text-green-500');

            // 1. KONDISI JIKA ITEM MEMILIKI HARGA FLASH SALE (KOLOM E)
            if (item.priceFlash > 0) {
                adaFlashSaleActive = true;
                if (item.endTimer) waktuTargetFlashSaleGlobal = item.endTimer; // Ambil target waktu dari sheet

                // Hitung persen penurunan Flash Sale dari Harga Normal (Kolom C ke E)
                const persenPotongan = Math.round(((item.priceNormal - item.priceFlash) / item.priceNormal) * 100);

                const card = document.createElement('div');
                card.className = "flash-card border-2 border-red-200 bg-white p-4 rounded-2xl flex flex-col items-center text-center cursor-pointer active:scale-95";
                card.onclick = () => tandaiPilihanItem(card, item.name, item.priceFlash, `FLASH SALE (${persenPotongan}% OFF)`);
                card.innerHTML = `
                    <div class="absolute top-0 right-0 bg-red-600 text-white font-black text-[8px] px-2 py-0.5 rounded-bl-xl tracking-wider uppercase">-${persenPotongan}%</div>
                    <i class="fas fa-bolt text-amber-500 mb-1.5 text-base"></i>
                    <div class="text-[10px] font-black text-gray-700 uppercase leading-tight">${item.name}</div>
                    <div class="text-[9px] font-bold text-gray-400 line-through mt-1">Rp ${item.priceNormal.toLocaleString('id-ID')}</div>
                    <div class="text-[12px] font-black text-red-600">Rp ${item.priceFlash.toLocaleString('id-ID')}</div>
                `;
                gridFlash.appendChild(card);
            } 
            
            // 2. KONDISI JIKA ITEM MEMILIKI HARGA PROMO BIASA (KOLOM D)
            else if (item.pricePromo > 0) {
                // Hitung persen penurunan Promo dari Harga Normal (Kolom C ke D)
                const persenPotonganPromo = Math.round(((item.priceNormal - item.pricePromo) / item.priceNormal) * 100);

                const card = document.createElement('div');
                card.className = "diamond-card border border-orange-300 bg-orange-50/30 p-4 rounded-2xl flex flex-col items-center text-center cursor-pointer active:scale-95 relative overflow-hidden";
                card.onclick = () => tandaiPilihanItem(card, item.name, item.pricePromo, `PROMO (${persenPotonganPromo}% OFF)`);
                card.innerHTML = `
                    <div class="absolute top-0 right-0 bg-orange-500 text-white font-black text-[7px] px-1.5 py-0.5 rounded-bl-lg tracking-wider">PROMO -${persenPotonganPromo}%</div>
                    <i class="fas fa-tags text-orange-500 mb-2 text-xs"></i>
                    <div class="text-[10px] font-black text-gray-700 uppercase leading-tight">${item.name}</div>
                    <div class="text-[9px] font-bold text-gray-400 line-through mt-1">Rp ${item.priceNormal.toLocaleString('id-ID')}</div>
                    <div class="text-[11px] font-black text-orange-600">Rp ${item.pricePromo.toLocaleString('id-ID')}</div>
                `;
                gridRegular.appendChild(card);
            } 
            
            // 3. KONDISI UTAMA: HARGA REGULAR BIASA (KOLOM C)
            else if (item.priceNormal > 0) {
                const card = document.createElement('div');
                card.className = "diamond-card border border-gray-200 bg-white p-4 rounded-2xl flex flex-col items-center text-center cursor-pointer active:scale-95";
                card.onclick = () => tandaiPilihanItem(card, item.name, item.priceNormal, "REGULAR");
                card.innerHTML = `
                    <i class="fas fa-gem ${warnaIcon} mb-2 text-xs"></i>
                    <div class="text-[10px] font-black text-gray-700 uppercase leading-tight">${item.name}</div>
                    <div class="text-[11px] font-black text-blue-600 mt-2">Rp ${item.priceNormal.toLocaleString('id-ID')}</div>
                `;
                gridRegular.appendChild(card);
            }
        });

        // Manajemen Trigger Kontainer Tampilan Flash Sale & Hitung Mundur
        if (adaFlashSaleActive) {
            sectionFlash.classList.remove('hidden');
            mulaiHitungMundurDinamis(waktuTargetFlashSaleGlobal);
        } else {
            sectionFlash.classList.add('hidden');
        }

        if (gridRegular.innerHTML === '') {
            gridRegular.innerHTML = '<div class="col-span-2 text-center py-6 text-xs font-bold text-gray-400">Belum ada produk biasa tersedia.</div>';
        }
    }
}

/**
 * SISTEM TIMER HITUNG MUNDUR MENGACU PADA DATA SPREADSHEET KOLOM F
 */
function mulaiHitungMundurDinamis(targetString) {
    if (intervalTimerGlobal) clearInterval(intervalTimerGlobal);

    // Jika di kolom F spreadsheet kosong, sistem otomatis pakai fallback default jam 23:59:59 hari ini
    let targetWaktu = null;
    if (targetString) {
        targetWaktu = new Date(targetString.replace(/-/g, "/")); // Mengatasi kompatibilitas parsing safari/chrome
    } else {
        const skr = new Date();
        targetWaktu = new Date(skr.getFullYear(), skr.getMonth(), skr.getDate(), 23, 59, 59);
    }

    intervalTimerGlobal = setInterval(() => {
        const sekarang = new Date();
        const selisihWaktu = targetWaktu - sekarang;
        
        if (selisihWaktu <= 0) {
            document.getElementById('timer-hour').innerText = "00";
            document.getElementById('timer-min').innerText = "00";
            document.getElementById('timer-sec').innerText = "00";
            clearInterval(intervalTimerGlobal);
            return;
        }

        const jam = Math.floor((selisihWaktu / (1000 * 60 * 60)));
        const menit = Math.floor((selisihWaktu / (1000 * 60)) % 60);
        const detik = Math.floor((selisihWaktu / 1000) % 60);

        document.getElementById('timer-hour').innerText = jam < 10 ? '0' + jam : jam;
        document.getElementById('timer-min').innerText = menit < 10 ? '0' + menit : menit;
        document.getElementById('timer-sec').innerText = detik < 10 ? '0' + detik : detik;
    }, 1000);
}

/**
 * UNIFIED SELECTOR ITEM DIAMOND
 */
function tandaiPilihanItem(el, name, price, typeLabel) {
    document.querySelectorAll('.diamond-card, .flash-card').forEach(c => {
        c.classList.remove('active');
    });
    el.classList.add('active');
    diamondDipilih = { name, price, label: typeLabel };
}

/**
 * SIMPAN SPREADSHEET & KIRIM DATA FORMAT MONOSPACE WHATSAPP
 */
async function bayarGame() {
    if (!gameDipilih) return alert("Silakan pilih game terlebih dahulu!");
    
    const gameIdEl = document.getElementById('game_id');
    const zoneIdEl = document.getElementById('zone_id');

    const gameId = gameIdEl ? gameIdEl.value.trim() : "";
    const zoneId = zoneIdEl ? zoneIdEl.value.trim() : "";

    if (!gameId) return alert("Masukkan ID Game!");
    if ((gameDipilih.toUpperCase() === 'MLBB' || gameDipilih.toUpperCase() === 'MOBILE LEGENDS') && !zoneId) {
        return alert("Masukkan Zone ID Mobile Legends Anda!");
    }
    if (!diamondDipilih) return alert("Silakan pilih item terlebih dahulu!");

    const btnBayar = document.getElementById('btn-bayar-game');
    if (btnBayar) {
        btnBayar.disabled = true;
        btnBayar.innerHTML = `<i class="fas fa-spinner animate-spin mr-2"></i> Memproses...`;
        btnBayar.style.opacity = "0.6";
    }

    const gabungID = zoneId ? `${gameId} (${zoneId})` : gameId;
    document.getElementById('ani-game').innerText = gameDipilih;
    document.getElementById('ani-id').innerText = gabungID;
    document.getElementById('ani-item').innerText = diamondDipilih.name;
    document.getElementById('ani-harga').innerText = `Rp ${diamondDipilih.price.toLocaleString('id-ID')}`;

    const modal = document.getElementById('modal-animasi-wa');
    const boxStruk = document.getElementById('box-struk');
    const progressBar = document.getElementById('progress-bar-wa');

    if (modal && boxStruk && progressBar) {
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.classList.add('opacity-100');
        boxStruk.classList.remove('scale-90');
        boxStruk.classList.add('scale-100');
        progressBar.style.width = '100%'; 
    }

    // BACKGROUND AUTO SAVE DATABASE KE GOOGLE SHEETS
    const waktuMks = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' });
    const labelProduk = `TOPUP ${gameDipilih.toUpperCase()} - ${diamondDipilih.name} (${diamondDipilih.label})`;
    
    const dataKirimSheet = [{
        tanggal: waktuMks,
        nomor: "'" + gabungID,
        produk: labelProduk,
        harga_asli: diamondDipilih.price,
        total_transfer: diamondDipilih.price,
        status: "Pending"
    }];

    try {
        const targetAppsScriptUrl = typeof SCRIPT_URL !== 'undefined' ? SCRIPT_URL : "https://script.google.com/macros/s/AKfycbwh0lE_0ebqn2ScCWvxioXBJYwLl2qT3aGVHk_W0QHTRP21lWb88djzWMCrihY0ZkHj/exec";
        await fetch(targetAppsScriptUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataKirimSheet)
        });
    } catch (error) {
        console.error("Gagal save spreadsheet:", error);
    }

    // FORMAT PESAN WHATSAPP (ID BISA DI-COPY SEKALI TAP & DILENGKAPI LABEL PERSEN)
    const formatPesan = `⚡ *TOP UP GAME - NK JAYA CELL* ⚡\n` +
                        `--------------------------------------------\n` +
                        `🎮 Game: *${gameDipilih}*\n` +
                        `🆔 ID Game: \`${gameId}\` ${zoneId ? 'Zone: `' + zoneId + '`' : ''}\n` +
                        `💎 Produk: ${diamondDipilih.name}\n` +
                        `🏷️ Jenis: *${diamondDipilih.label}*\n` +
                        `💰 Harga: *Rp ${diamondDipilih.price.toLocaleString('id-ID')}*\n` +
                        `--------------------------------------------\n` +
                        `Mohon segera diproses ya, Terima kasih! 🙏`;

    const tautanWA = `https://wa.me/${FINAL_WA_ADMIN}?text=${encodeURIComponent(formatPesan)}`;

    setTimeout(() => {
        window.open(tautanWA, '_blank');

        if (modal && boxStruk && progressBar) {
            modal.classList.remove('opacity-100');
            modal.classList.add('opacity-0', 'pointer-events-none');
            boxStruk.classList.remove('scale-100');
            boxStruk.classList.add('scale-90');
            progressBar.style.width = '0%'; 
        }

        if (gameIdEl) gameIdEl.value = "";
        if (zoneIdEl) zoneIdEl.value = "";
        document.querySelectorAll('.diamond-card, .flash-card').forEach(c => { c.classList.remove('active'); });
        diamondDipilih = null;

        if (btnBayar) {
            btnBayar.disabled = false;
            btnBayar.innerHTML = `<i class="fab fa-whatsapp text-lg"></i> Top Up via WhatsApp`;
            btnBayar.style.opacity = "1";
        }
    }, 2000); 
}
