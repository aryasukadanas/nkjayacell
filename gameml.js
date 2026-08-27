// ==========================================================
// SYSTEM TOPUP GAME ADVANCED SPREADSHEET CONTROL - NK JAYA CELL
// ==========================================================

// [FIX] Hapus deklarasi variabel yang sudah ada di config.js.
let dbGame = {}; 
let gameDipilih = ''; 
let intervalTimerGlobal = null;
// [REFACTOR] Fungsi input suara sudah disentralisasi di script.js


document.addEventListener('DOMContentLoaded', async () => {
    // 1. Muat data game dari spreadsheet dan TUNGGU hingga selesai.
    await muatDataDariSpreadsheet(); 

    // 2. Setelah data siap, pasang event listener untuk input suara.
    const gameIdEl = document.getElementById('game-id') || document.getElementById('user-id');
    const zoneIdEl = document.getElementById('zone-id') || document.getElementById('server-id');

    // Catatan: Elemen-elemen ini mungkin belum ada saat halaman dimuat, 
    // karena dirender oleh gantiGame(). Event listener akan dipasang ulang di sana.
    // Kode di bawah ini sebagai fallback jika struktur HTML berubah.
    if (gameIdEl) {
        gameIdEl.addEventListener('click', () => {
            aktifkanInputSuaraRealTime(this, 'angka');
        });
    }

    if (zoneIdEl) {
        zoneIdEl.addEventListener('click', () => {
            aktifkanInputSuaraRealTime(this, 'angka');
        });
    }

    // 3. Cek apakah ada permintaan "Beli Lagi" dari halaman lain (via sessionStorage).
    // Ini hanya berjalan saat halaman baru dimuat/di-redirect.
    const dataOrderUlangDariSession = sessionStorage.getItem('order_ulang_game');
    if (dataOrderUlangDariSession && typeof prosesOrderUlangGame === 'function') {
        // Panggil fungsi dengan data dari session storage.
        // Fungsi ini sekarang tidak perlu lagi membaca sessionStorage secara internal.
        prosesOrderUlangGame();
    }    
    // 4. Jalankan banner slider khusus untuk halaman gameml.html
    setupBannerSlider();
});
/**
 * FETCHING DATA DAN SYNC MULTI-KOLOM DARI SPREADSHEET
 */
async function muatDataDariSpreadsheet() {
    const selectEl = document.getElementById('pilih-game');
    const cacheProduk = localStorage.getItem('nk_cache_produk_csv');

    try {
        const response = await fetch(SHEET_PRODUK_URL + '&_v=' + Date.now());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        localStorage.setItem('nk_cache_produk_csv', text);
        isiDatabaseGameDariCSV(text);
        isiPilihanGame(selectEl);
    } catch (error) {
        console.error("Gagal sinkronisasi data game:", error);
        if (cacheProduk) {
            console.warn("Memuat data game dari cache lokal.");
            isiDatabaseGameDariCSV(cacheProduk);
            isiPilihanGame(selectEl);
        } else if (selectEl) {
            selectEl.innerHTML = '<option value="">-- Data game tidak tersedia --</option>';
        }
    }
}

function isiDatabaseGameDariCSV(text) {
    const rows = text.split(/\r?\n/).slice(1);
    dbGame = {};

    rows.forEach(row => {
        if (!row.trim()) return;
        const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
            .map(value => value.trim().replace(/^"|"$/g, ''));
        if (cols.length < 3) return;

        const kategori = cols[0];
        const namaProduk = cols[1];
        if (!kategori || !namaProduk) return;
        const hargaNormal = parseInt(cols[2]?.replace(/\D/g, '')) || 0;
        const hargaPromo = parseInt(cols[3]?.replace(/\D/g, '')) || 0;
        const hargaFlashSale = parseInt(cols[4]?.replace(/\D/g, '')) || 0;
        const waktuMundur = cols[5] || "";

        if (!dbGame[kategori]) dbGame[kategori] = [];
        dbGame[kategori].push({
            name: namaProduk,
            priceNormal: hargaNormal,
            pricePromo: hargaPromo,
            priceFlash: hargaFlashSale,
            endTimer: waktuMundur
        });
    });
}

function isiPilihanGame(selectEl) {
    if (!selectEl) return;
    const blacklistKategori = ['PULSA', 'INDOSAT', 'XL', 'TELKOMSEL', 'AXIS', 'TRI', 'SMARTFREN', 'BY.U', 'SHOPEEPAY', 'GOPAY', 'DANA', 'TOKEN', 'PLN'];
    selectEl.innerHTML = '<option value="">-- Pilih Game --</option>';
    Object.keys(dbGame).forEach(game => {
        if (blacklistKategori.includes(game.toUpperCase())) return;
        const option = document.createElement('option');
        option.value = game;
        option.textContent = game;
        selectEl.appendChild(option);
    });
    if (selectEl.options.length === 1) {
        selectEl.innerHTML = '<option value="">-- Game belum tersedia --</option>';
    }
}

/**
 * MENGATUR FILTERING GEOMETRI FORM & TIMER MUNDUR SPREADSHEET
 */
function gantiGame(val) {
    gameDipilih = val;

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

    // Pasang ulang event listener untuk input suara setiap kali input ID diganti
    const newGameIdEl = document.getElementById('game_id');
    const newZoneIdEl = document.getElementById('zone_id');
    if (newGameIdEl) {
        newGameIdEl.addEventListener('click', () => aktifkanInputSuaraRealTime(newGameIdEl, 'angka'));
    }
    if (newZoneIdEl) {
        newZoneIdEl.addEventListener('click', () => aktifkanInputSuaraRealTime(newZoneIdEl, 'angka'));
    }
    // Pemrosesan Pemisahan Item Berdasarkan Kolom Spreadsheet
    if (gridRegular && gridFlash && sectionFlash) {
        gridRegular.innerHTML = '';
        gridFlash.innerHTML = '';
        
        const namaGameUpper = gameDipilih.toUpperCase();
        const kunciGame = dbGame[gameDipilih] ? gameDipilih :
            (namaGameUpper === 'MLBB' ? 'MOBILE LEGENDS' :
            (namaGameUpper === 'MOBILE LEGENDS' || namaGameUpper === 'MOBILE LEGEND' ? 'MLBB' : gameDipilih));
        const listProduk = dbGame[kunciGame] || [];
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
                card.onclick = () => tambahKeKeranjang(item.name, item.priceFlash, `FLASH SALE (-${persenPotongan}% OFF)`, `TOPUP ${gameDipilih}`);
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
                card.onclick = () => tambahKeKeranjang(item.name, item.pricePromo, `PROMO (${persenPotonganPromo}% OFF)`, `TOPUP ${gameDipilih}`);
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
                card.onclick = () => tambahKeKeranjang(item.name, item.priceNormal, "REGULAR", `TOPUP ${gameDipilih}`);
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
 * FUNGSI BARU: Memproses "Beli Lagi" khusus untuk Top Up Game
 * Fungsi ini akan membaca data dari sessionStorage dan mengisi form.
 */
function prosesOrderUlangGame(itemFromHistory = null) {
    let item = null;

    if (itemFromHistory) {
        // Jika data dikirim langsung dari fungsi orderUlangDariRiwayat (tanpa refresh)
        item = itemFromHistory;
    } else {
        // Fallback: Ambil dari sessionStorage jika halaman baru saja dimuat/di-redirect
        const dataOrderUlang = sessionStorage.getItem('order_ulang_game');
        if (dataOrderUlang) {
            item = JSON.parse(dataOrderUlang);
            sessionStorage.removeItem('order_ulang_game'); // Hapus hanya jika data diambil dari session
        }
    }

    if (item) {
        try {
            // 1. Ambil nama game langsung dari properti 'gameName' yang sudah bersih
            const gameName = item.gameName;
            if (!gameName) {
                console.error("Data riwayat tidak memiliki 'gameName'.");
                return;
            }

            // 2. Pilih game yang sesuai di dropdown
            const selectGameEl = document.getElementById('pilih-game');
            if (selectGameEl) {
                selectGameEl.value = gameName;
                // Panggil gantiGame() untuk merender input ID dan daftar produk yang benar
                gantiGame(gameName);
            }

            // 3. Ekstrak ID dan Zone ID dari target.
            // Karena gantiGame() berjalan secara sinkron, elemen input ID seharusnya sudah ada.
            // Kita beri sedikit jeda (timeout 0) untuk memastikan DOM selesai di-update.
            setTimeout(() => {
                const target = item.target || ""; // e.g., "12345678 (9101)" atau "12345678"
                const match = target.match(/(\d+)\s*\((\d+)\)/); // Cari pola ID (Zone)

                const gameIdEl = document.getElementById('game_id');
                const zoneIdEl = document.getElementById('zone_id');

                if (match && gameIdEl && zoneIdEl) { // Jika ada ID dan Zone ID (contoh: Mobile Legends)
                    gameIdEl.value = match[1];
                    zoneIdEl.value = match[2];
                } else if (gameIdEl) { // Jika hanya ada ID Game
                    gameIdEl.value = target.replace(/\s*\(.*\)/, ''); // Ambil hanya ID, buang bagian (zone) jika ada
                }
            }, 0); // Jeda singkat untuk memastikan elemen dirender
        } catch (e) {
            console.error("Gagal memproses data order ulang game:", e);
        }
    }
}

// FUNGSI SLIDER BANNER (KHUSUS UNTUK GAMEML.HTML)
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
