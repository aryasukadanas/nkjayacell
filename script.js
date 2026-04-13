// ==========================================
// KONFIGURASI NK JAYA CELL
// ==========================================
const WA_ADMIN = "6285847909692";
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT6mOnYdR8MGwIusehg_plQJHoAVALhdcXNpbgOatMEkuipIoUDfECd5KWe0KAUNl8QTyaKz7PeeigA/pub?gid=0&single=true&output=csv";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwh0lE_0ebqn2ScCWvxioXBJYwLl2qT3aGVHk_W0QHTRP21lWb88djzWMCrihY0ZkHj/exec";

const iconMap = {
    'Pulsa': 'PULSA.png',
    'Indosat': 'logo_indosat.png',
    'XL': 'logo_xl.png',
    'Telkomsel': 'logo_telkomsel.png',
    'Axis': 'logo_axis.png',
    'Tri': 'logo_tri.png',
    'Smartfren': 'logo_smartfren.png',
    'By.U': 'logo_byu.png',
    'ShopeePay': 'logo_shopeepay.png',
    'Gopay': 'logo_gopay.jpeg',
    'Dana': 'logo_Dana.jpeg',
    'MLBB': 'Logo_MLBB.jpeg',
    'FREE FIRE': 'Logo_Free_Fire.jpeg'
};

const prefixMap = {
    'Indosat': ['0814','0815','0816','0855','0856','0857','0858'],
    'Telkomsel': ['0811','0812','0813','0821','0822','0823','0851','0852','0853'],
    'XL': ['0817','0818','0819','0859','0877','0878'],
    'Axis': ['0831','0832','0833','0838'],
    'Tri': ['0895','0896','0897','0898','0899'],
    'Smartfren': ['0881','0882','0883','0884','0885','0886','0887','0888','0889'],
    'By.U': ['0851']
};

let db = {};
let keranjang = [];
let totalAkhirDenganKode = 0;
let currentTab = 'DATA'; 
let currentSelectedCat = ''; 

// ==========================================
// INISIALISASI DATA
// ==========================================
async function init() {
    try {
        const res = await fetch(SHEET_CSV_URL);
        const text = await res.text();
        const rows = text.split(/\r?\n/).slice(1);
        db = {};
        rows.forEach(row => {
            let cols = row.split(',');
            if (cols.length >= 3) {
                const cat = cols[0].trim().replace(/"/g, "");
                const name = cols[1].trim().replace(/"/g, "");
                const promoPrice = parseInt(cols[2].replace(/\D/g, '')) || 0;
                const normalPrice = cols[3] ? parseInt(cols[3].replace(/\D/g, '')) : 0; 
                if (!db[cat]) db[cat] = [];
                db[cat].push({ n: name, p: promoPrice, old: normalPrice });
            }
        });
        renderMenu();
    } catch (e) { console.error("Gagal sinkron data produk"); }
}

function renderMenu() {
    const container = document.getElementById('menu-container');
    if(!container) return;
    container.innerHTML = '';
    Object.keys(db).forEach(cat => {
        if (cat === 'MLBB' || cat === 'FREE FIRE') return;
             const icon = iconMap[cat] || 'logo_default.png';
            container.innerHTML += `
         <div class="menu-item op-card flex flex-col items-center justify-center p-2 rounded-2xl bg-white border border-gray-100 shadow-sm active:scale-90 transition-all w-full h-full" 
         id="menu-${cat}" 
         onclick="selectCategory('${cat}')">
        
            <div class="w-10 h-10 flex items-center justify-center mb-1">
            <img src="${icon}" class="max-w-full max-h-full object-contain">
            </div>

            <div class="text-[9px] font-black text-gray-700 uppercase text-center leading-tight w-full break-words">
            ${cat}
            </div>
        </div>`;
    });
}

// ==========================================
// LOGIKA TAB & PRODUK
// ==========================================
function switchTab(type) {
    currentTab = type;
    const btnPulsa = document.getElementById('tab-pulsa');
    const btnData = document.getElementById('tab-data');
    
    if (type === 'PULSA') {
        btnPulsa.className = "tab-btn flex-1 py-3 rounded-xl text-[10px] font-black tracking-widest transition-all bg-white text-blue-600 shadow-sm";
        btnData.className = "tab-btn flex-1 py-3 rounded-xl text-[10px] font-black tracking-widest transition-all text-gray-500";
    } else {
        btnData.className = "tab-btn flex-1 py-3 rounded-xl text-[10px] font-black tracking-widest transition-all bg-white text-blue-600 shadow-sm";
        btnPulsa.className = "tab-btn flex-1 py-3 rounded-xl text-[10px] font-black tracking-widest transition-all text-gray-500";
    }
    
    if (currentSelectedCat) {
        renderListProduk(currentSelectedCat);
    }
}

function selectCategory(cat) {
    currentSelectedCat = cat;
    document.querySelectorAll('.op-card').forEach(el => el.classList.remove('active'));
    const activeMenu = document.getElementById(`menu-${cat}`);
    if(activeMenu) activeMenu.classList.add('active');
    
    if (cat !== 'MLBB' && cat !== 'FREE FIRE') {
        const gameArea = document.getElementById('game-input-area');
        if(gameArea) gameArea.classList.add('hidden');
        document.getElementById('category-title').innerText = `${currentTab} ${cat}`;
    } else {
        document.getElementById('category-title').innerText = "PRODUK " + cat;
    }
    
    renderListProduk(cat);
}

function renderListProduk(cat) {
    const list = document.getElementById('list-paket');
    list.innerHTML = '';
    
    if (db[cat]) {
        const filteredProduk = db[cat].filter(item => {
            if (cat === 'MLBB' || cat === 'FREE FIRE') return true;
            const nama = item.n.toUpperCase();
            return currentTab === 'PULSA' ? nama.includes('PULSA') : !nama.includes('PULSA');
        });

        if (filteredProduk.length === 0) {
            list.innerHTML = `<div class="text-center py-10 text-gray-400 text-[10px] font-bold italic uppercase">Produk ${currentTab} belum tersedia untuk ${cat}</div>`;
            return;
        }

        filteredProduk.forEach(item => {
            let part = item.n.split('|'); 
            let namaPaket = part[0].trim();
            let deskripsi = part[1] ? part[1].trim() : "";
            let htmlHarga = `<div class="text-blue-600 font-black text-[18px]">Rp ${item.p.toLocaleString('id-ID')}</div>`;
            let labelPromo = "";
            
            if (item.old > 0 && item.old > item.p) {
                htmlHarga = `<div class="text-gray-400 text-[15px] line-through decoration-red-500">Rp ${item.old.toLocaleString('id-ID')}</div>
                             <div class="text-blue-600 font-black text-[18px]">Rp ${item.p.toLocaleString('id-ID')}</div>`;
                labelPromo = `<div class="absolute top-0 right-0 bg-red-600 text-white text-[7px] font-black px-3 py-1 rounded-bl-xl shadow-sm">PROMO</div>`;
            }

            list.innerHTML += `
                <div onclick="tambahKeKeranjang('${item.n}', ${item.p}, '${cat}')" 
                     class="bg-white p-4 rounded-3xl shadow-sm flex justify-between items-center active:scale-95 transition-all border border-gray-100 mb-3 relative overflow-hidden animate-fade-in">
                    ${labelPromo}
                    <div class="flex-1 pr-3">
                        <div class="text-[18px] font-black text-gray-800 uppercase leading-tight">${namaPaket}</div>
                        <div class="text-[9px] text-gray-500 font-medium mt-1 italic">${deskripsi}</div>
                    </div>
                    <div class="text-right min-w-[100px]">
                        ${htmlHarga}
                        <div class="text-[12px] text-blue-400 font-bold uppercase mt-1">🛒 Pilih</div>
                    </div>
                </div>`;
        });
    }
}

// ==========================================
// GAME, KONTAK, & RIWAYAT
// ==========================================
function bukaHalamanGame() {
    document.getElementById('modal-game').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function tutupHalamanGame() {
    document.getElementById('modal-game').classList.remove('active');
    document.body.style.overflow = 'auto';
}

function pilihGameLanjut(namaGame) {
    tutupHalamanGame();
    const gameArea = document.getElementById('game-input-area');
    const inputID = document.getElementById('game-id');
    const helpText = document.getElementById('game-help');
    if(gameArea) gameArea.classList.remove('hidden');
    
    if (namaGame === 'MLBB') {
        inputID.placeholder = "ID (Server). Contoh: 1234567 (2001)";
        helpText.innerHTML = "*Masukkan <b>User ID</b> dan <b>Server</b> Mobile Legends Anda.";
    } else {
        inputID.placeholder = "Player ID. Contoh: 87654321";
        helpText.innerHTML = "*Masukkan <b>Player ID</b> Free Fire Anda.";
    }
    selectCategory(namaGame);
    if(inputID) inputID.focus();
}

async function ambilKontak() {
    const supported = ('contacts' in navigator && 'ContactsManager' in window);
    if (supported) {
        try {
            const contacts = await navigator.contacts.select(['tel'], { multiple: false });
            if (contacts.length > 0 && contacts[0].tel.length > 0) {
                let cleanNo = contacts[0].tel[0].replace(/\D/g, '');
                if (cleanNo.startsWith('62')) cleanNo = '0' + cleanNo.slice(2);
                document.getElementById('phone-number').value = cleanNo;
                detectOp(cleanNo);
                renderRiwayat();
            }
        } catch (err) { console.log("Akses kontak ditolak"); }
    } else { alert("Browser tidak mendukung fitur ambil kontak."); }
}


async function renderRiwayat() {
    const container = document.getElementById('riwayat-list');
    const num = document.getElementById('phone-number').value;
    if(!container || num.length < 10) return;

    try {
        const response = await fetch(`${SCRIPT_URL}?nomor=${num}`);
        const data = await response.json();
        if(!data || data.length === 0) { container.innerHTML = ""; return; }

        container.innerHTML = `<h2 class="text-[10px] font-black text-gray-400 uppercase mb-4 mt-8 tracking-widest ml-2">Riwayat Anda</h2>`;
        
        data.reverse().forEach(trx => {
            // --- BAGIAN PERBAIKAN FORMAT TITIK ---
            // 1. Ambil teks asli (contoh: "13.04.2026 22.15")
            let tglAsli = trx.tgl.toString();
            
            // 2. Ubah titik menjadi tanda hubung agar dimengerti sistem (13-04-2026)
            // Namun kita sisakan bagian jam agar tetap bisa diproses
            let tglStandar = tglAsli.replace(/\./g, '-'); 
            
            const tglMentah = new Date(tglStandar);
            let tglCantik;

            // 3. Cek apakah sistem berhasil membaca tanggal tersebut
            if (!isNaN(tglMentah)) {
                tglCantik = tglMentah.toLocaleDateString('id-ID', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }).replace(/\//g, ':'); // Mengubah garis miring menjadi TITIK DUA
            } else {
                // Jika sistem gagal baca (Invalid Date), kita paksa ubah simbolnya saja
                tglCantik = tglAsli.replace(/[\.\/-]/g, ':');
            }

            let color = trx.status === "Sukses" ? "text-green-600" : (trx.status === "Gagal" ? "text-red-600" : "text-yellow-600");
            
            container.innerHTML += `
                <div class="bg-white p-4 rounded-3xl shadow-sm border border-gray-50 mb-3 flex justify-between items-center animate-fade-in">
                    <div class="flex-1 pr-2">
                        <div class="text-[10px] font-black text-gray-800 uppercase leading-tight">${trx.produk}</div>
                        <div class="text-[8px] text-gray-400 font-bold mt-1 uppercase tracking-tighter">
                            <i class="far fa-clock mr-1"></i> ${tglCantik} WITA
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-[11px] font-black text-blue-600">Rp ${parseInt(trx.harga).toLocaleString('id-ID')}</div>
                        <div class="text-[8px] font-black uppercase mt-1 px-2 py-0.5 rounded-full bg-gray-50 inline-block ${color}">
                            ${trx.status}
                        </div>
                    </div>
                </div>`;
        });
    } catch (e) { 
        console.log("Riwayat tidak ditemukan atau koneksi lambat"); 
    }
}


// ==========================================
// TRANSAKSI & WHATSAPP
// ==========================================
function tambahKeKeranjang(n, p, cat) {
    const numInput = document.getElementById('phone-number');
    const num = numInput ? numInput.value : "";
    const idGameInput = document.getElementById('game-id');
    const idGame = idGameInput ? idGameInput.value : "";

    // VALIDASI: Nomor HP tetap wajib diisi
    if (num.length < 10) {
        alert("Silakan masukkan Nomor WhatsApp Tujuan di atas!");
        if(numInput) numInput.focus();
        return;
    }

    let identitasTujuan = num;
    if (cat === 'MLBB' || cat === 'FREE FIRE') {
        if (!idGame) {
            alert("Harap isi ID Game Anda!");
            if(idGameInput) idGameInput.focus();
            return;
        }
        identitasTujuan = `ID: ${idGame} (WA: ${num})`;
    }

    // PERUBAHAN DISINI: Menggunakan .push agar bisa tambah banyak
    keranjang.push({ 
        no: identitasTujuan, 
        nama: n, 
        harga: p, 
        kategori: cat 
    });
    
    // Update UI (Angka di ikon keranjang akan bertambah)
    updateKeranjangUI();
    
    // Opsional: Berikan notifikasi kecil agar pelanggan tahu barang masuk keranjang
    alert("Produk berhasil ditambah ke keranjang!");
}
function updateKeranjangUI() {
    const cartBtn = document.getElementById('cart-floating');
    const countEl = document.getElementById('cart-count');
    if(countEl) countEl.innerText = keranjang.length;
    if(cartBtn) cartBtn.style.display = keranjang.length > 0 ? 'flex' : 'none';
}

function bukaModalKeranjang() {
    const container = document.getElementById('m-pkg');
    if(!container) return; 
    container.innerHTML = '';
    
    let subtotal = 0;
    keranjang.forEach((item, i) => {
        subtotal += item.harga;
        container.innerHTML += `
            <div class="flex justify-between items-center bg-white p-3 rounded-xl mb-2 shadow-sm border border-gray-50">
                <div class="flex-1 pr-2">
                    <div class="text-[10px] font-black text-gray-800 uppercase leading-tight">${item.nama}</div>
                    <div class="text-[8px] text-gray-400 font-bold mt-1 uppercase italic">Tujuan: ${item.no}</div>
                </div>
                <div class="text-right">
                    <div class="text-[10px] font-black text-blue-600">Rp ${item.harga.toLocaleString('id-ID')}</div>
                    <div class="text-[8px] text-red-500 font-black uppercase mt-1 cursor-pointer" onclick="hapusItem(${i})">Hapus</div>
                </div>
            </div>`;
    });

    const kodeUnik = Math.floor(Math.random() * 99) + 1;
    totalAkhirDenganKode = subtotal + kodeUnik;

    // Bagian Keterangan Pembayaran
    document.getElementById('m-price').innerHTML = `
        <div class="bg-blue-50 p-4 rounded-2xl my-4 border border-blue-100">
            <b class="text-[10px] text-blue-900 uppercase tracking-widest block text-center mb-2">Total yang Harus Dibayar:</b>
            <div class="flex justify-center items-center gap-3">
                <span class="text-blue-700 font-black text-4xl tracking-tighter">${totalAkhirDenganKode.toLocaleString('id-ID')}</span>
                <button onclick="salinHarga(${totalAkhirDenganKode})" class="bg-blue-600 text-white text-[10px] font-black px-4 py-2 rounded-full shadow-sm active:scale-90">SALIN</button>
            </div>
            
            <div class="mt-4 pt-3 border-t border-blue-200">
                <p class="text-[9px] text-gray-600 font-bold uppercase mb-2"><i class="fas fa-info-circle mr-1"></i> Cara Pembayaran:</p>
                <ul class="text-[8px] text-gray-500 space-y-1 font-bold uppercase italic">
                    <li>1. Scan QRIS di bawah ini dengan aplikasi Bank/E-Wallet</li>
                    <li>2. Masukkan nominal <span class="text-red-600">PRESISI</span> hingga angka terakhir</li>
                    <li>3. Screenshot bukti bayar & klik tombol WhatsApp</li>
                </ul>
            </div>
        </div>`;
    
    // Bagian QRIS dengan Label Nama Toko
    document.getElementById('qris-box').innerHTML = `
        <div class="text-center">
            <div class="inline-block p-2 bg-white border-2 border-gray-100 rounded-3xl shadow-inner">
                <img src="qris.jpeg" alt="QRIS NK JAYA CELL" class="w-64 h-64 mx-auto rounded-xl">
            </div>
            <p class="mt-2 text-[10px] font-black text-gray-800 uppercase italic">NM: NK JAYA CELL / AGEN BRILINK</p>
        </div>`;
    
    document.getElementById('modal-bayar').classList.add('active');

    document.getElementById('modal-bayar').classList.add('active');
    
    // Kunci scroll layar utama
    document.body.style.overflow = 'hidden'; 
}

async function kirimWA() {
    if (keranjang.length === 0) return;
    const btn = document.getElementById('btn-wa');
    if(btn) { btn.innerText = "⏳ Memproses..."; btn.disabled = true; }
    let detailWA = ""; let dataSheet = [];
    const waktu = new Date().toLocaleString('id-ID');
    keranjang.forEach((item, i) => {
        detailWA += `${i+1}. ${item.kategori} ${item.nama}\n   Tujuan: ${item.no}\n   Harga: Rp ${item.harga.toLocaleString('id-ID')}\n\n`;
        dataSheet.push({ tanggal: waktu, nomor: "'" + item.no, produk: item.kategori + " " + item.nama, harga_asli: item.harga, total_transfer: totalAkhirDenganKode, status: "Pending" });
    });
    try {
        await fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dataSheet) });
    } catch (e) { }
    const msg = `*PESANAN BARU - NK JAYA CELL*\n------------------------------\n*RINCIAN:*\n${detailWA}*TOTAL BAYAR: Rp ${totalAkhirDenganKode.toLocaleString('id-ID')}*\n------------------------------\n_Silakan kirim bukti bayar ke sini._`;
    window.location.href = `https://wa.me/${WA_ADMIN}?text=${encodeURIComponent(msg)}`;
}

// ==========================================
// UTILS
// ==========================================
function detectOp(num) {
    const pre = num.replace(/\D/g, '').substring(0,4);
    for(let op in prefixMap) { if(prefixMap[op].includes(pre)) { selectCategory(op); break; } }
}
function salinHarga(nominal) { navigator.clipboard.writeText(nominal).then(() => alert("Nominal disalin!")); }
function hapusItem(i) { keranjang.splice(i, 1); updateKeranjangUI(); if(keranjang.length === 0) tutupModal(); else bukaModalKeranjang(); }
function tutupModal() { document.getElementById('modal-bayar').classList.remove('active'); 
    document.getElementById('modal-bayar').classList.remove('active');
    
    // Kembalikan scroll layar utama
    document.body.style.overflow = 'auto';
}




window.onload = async () => {
    await init();
    const phoneInput = document.getElementById('phone-number');
    if (phoneInput) {
        phoneInput.addEventListener('input', function() {
            this.value = this.value.replace(/[^0-9]/g, ''); 
            if(this.value.length >= 10) { detectOp(this.value); renderRiwayat(); }
        });
    }
};
