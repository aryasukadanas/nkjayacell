// ==========================================
// KONFIGURASI NK JAYA CELL
// ==========================================
const WA_ADMIN = "6285847909692";
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT6mOnYdR8MGwIusehg_plQJHoAVALhdcXNpbgOatMEkuipIoUDfECd5KWe0KAUNl8QTyaKz7PeeigA/pub?gid=0&single=true&output=csv";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwh0lE_0ebqn2ScCWvxioXBJYwLl2qT3aGVHk_W0QHTRP21lWb88djzWMCrihY0ZkHj/exec";



const iconMap = {
    'Pulsa': 'PULSA.png', 'Indosat': 'logo_indosat.png', 'XL': 'logo_xl.png', 'Telkomsel': 'logo_telkomsel.png',
    'Axis': 'logo_axis.png', 'Tri': 'logo_tri.png', 'Smartfren': 'logo_smartfren.png', 'By.U': 'logo_byu.png',
    'ShopeePay': 'logo_shopeepay.png', 'Gopay': 'logo_gopay.jpeg', 'Dana': 'logo_Dana.jpeg',
    'MLBB': 'Logo_MLBB.jpeg', 'FREE FIRE': 'Logo_Free_Fire.jpeg'
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
// INISIALISASI DATA (3 LEVEL HARGA)
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
                const normalPrice = parseInt(cols[2].replace(/\D/g, '')) || 0;
                const diskonPrice = cols[3] ? parseInt(cols[3].replace(/\D/g, '')) : 0;
                const flashPrice = cols[4] ? parseInt(cols[4].replace(/\D/g, '')) : 0;
                const flashEnd = cols[5] ? cols[5].trim().replace(/"/g, "") : "";

                if (!db[cat]) db[cat] = [];
                db[cat].push({ 
                    n: name, p: normalPrice, disc: diskonPrice, 
                    fls: flashPrice, flsEnd: flashEnd 
                });
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
            <div class="menu-item op-card flex flex-col items-center justify-center p-2 rounded-2xl bg-white border border-gray-100 shadow-sm active:scale-90 transition-all w-full h-full" id="menu-${cat}" onclick="selectCategory('${cat}')">
                <div class="w-10 h-10 flex items-center justify-center mb-1"><img src="${icon}" class="max-w-full max-h-full object-contain"></div>
                <div class="text-[9px] font-black text-gray-700 uppercase text-center leading-tight w-full break-words">${cat}</div>
            </div>`;
    });
}

// ==========================================
// LOGIKA PRODUK & 3 LEVEL HARGA
// ==========================================
function switchTab(type) {
    currentTab = type;
    const btnPulsa = document.getElementById('tab-pulsa');
    const btnData = document.getElementById('tab-data');
    btnPulsa.className = type === 'PULSA' ? "tab-btn flex-1 py-3 rounded-xl text-[10px] font-black tracking-widest transition-all bg-white text-blue-600 shadow-sm" : "tab-btn flex-1 py-3 rounded-xl text-[10px] font-black tracking-widest transition-all text-gray-500";
    btnData.className = type === 'DATA' ? "tab-btn flex-1 py-3 rounded-xl text-[10px] font-black tracking-widest transition-all bg-white text-blue-600 shadow-sm" : "tab-btn flex-1 py-3 rounded-xl text-[10px] font-black tracking-widest transition-all text-gray-500";
    if (currentSelectedCat) renderListProduk(currentSelectedCat);
}

function selectCategory(cat) {
    currentSelectedCat = cat;
    document.querySelectorAll('.op-card').forEach(el => el.classList.remove('active'));
    const activeMenu = document.getElementById(`menu-${cat}`);
    if(activeMenu) activeMenu.classList.add('active');
    document.getElementById('category-title').innerText = (cat === 'MLBB' || cat === 'FREE FIRE') ? "PRODUK " + cat : `${currentTab} ${cat}`;
    renderListProduk(cat);
}

function renderListProduk(cat) {
    const list = document.getElementById('list-paket');
    list.innerHTML = '';
    if (!db[cat]) return;

    const filteredProduk = db[cat].filter(item => {
        if (cat === 'MLBB' || cat === 'FREE FIRE') return true;
        const nama = item.n.toUpperCase();
        return currentTab === 'PULSA' ? nama.includes('PULSA') : !nama.includes('PULSA');
    });

    filteredProduk.forEach(item => {
        let hargaFinal = item.p;
        let labelHargaCoret = "";
        let badgeTopRight = "";
        let timerHTML = "";
        
        const sekarang = new Date().getTime();
        // Memastikan format tanggal universal
        const tglFormat = item.flsEnd ? item.flsEnd.replace(/[./]/g, '-') : "";
        const flashEnd = tglFormat ? new Date(tglFormat).getTime() : 0;

        // PRIORITAS 1: FLASH SALE (Lebih Menarik)
        if (item.fls > 0 && flashEnd > sekarang) {
            hargaFinal = item.fls;
            labelHargaCoret = `<span class="text-gray-400 text-xs line-through mr-2">Rp ${item.p.toLocaleString('id-ID')}</span>`;
            
            const tId = "timer-" + Math.random().toString(36).substr(2, 9);
            
            badgeTopRight = `<div class="absolute top-0 right-0 badge-flash animate-pulse-soft"><i class="fas fa-bolt mr-1"></i> FLASH SALE</div>`;
            
            timerHTML = `
                <div class="flex items-center gap-1.5 mt-2 bg-red-50 p-1.5 rounded-lg border border-red-100">
                    <i class="fas fa-clock text-red-600 text-xs"></i>
                    <div class="text-[10px] font-black text-red-700" id="${tId}">00:00:00</div>
                </div>`;
                
            setTimeout(() => startCountdown(tglFormat, tId), 100);
        } 
        // PRIORITAS 2: PROMO (Lebih Elegan)
        else if (item.disc > 0) {
            hargaFinal = item.disc;
            labelHargaCoret = `<span class="text-gray-400 text-xs line-through mr-2">Rp ${item.p.toLocaleString('id-ID')}</span>`;
            badgeTopRight = `<div class="absolute top-0 right-0 bg-blue-600 text-white text-[8px] font-black px-3 py-1 rounded-bl-xl shadow-sm"><i class="fas fa-tags mr-1"></i> PROMO</div>`;
        }

        // Split nama produk untuk memisahkan Deskripsi
        let part = item.n.split('|');
        const namaUtama = part[0].trim();
        const deskripsi = part[1] ? part[1].trim() : "";

        list.innerHTML += `
            <div onclick="tambahKeKeranjang('${item.n}', ${hargaFinal}, '${cat}')" 
                 class="bg-white p-5 rounded-3xl shadow-sm hover:shadow-md flex justify-between items-center active:scale-95 transition-all border border-gray-100 mb-4 relative overflow-hidden animate-fade-in group">
                
                ${badgeTopRight}
                
                <div class="flex-1 pr-4">
                    <div class="text-base font-black text-gray-900 uppercase leading-tight group-hover:text-blue-700 transition-colors">
                        ${namaUtama}
                    </div>
                    ${deskripsi ? `<div class="text-[10px] text-gray-500 font-medium mt-1.5 italic bg-gray-50 px-2 py-0.5 rounded-md inline-block">${deskripsi}</div>` : ""}
                    ${timerHTML}
                </div>
                
                <div class="text-right flex flex-col items-end shrink-0">
                    ${labelHargaCoret}
                    <div class="text-blue-600 font-black text-xl tracking-tight">
                        Rp ${hargaFinal.toLocaleString('id-ID')}
                    </div>
                    <div class="text-[9px] text-white font-black uppercase mt-2 px-3 py-1 rounded-full bg-blue-600 shadow-sm group-hover:bg-blue-700 transition-colors">
                        🛒 Pilih
                    </div>
                </div>
            </div>`;
    });
}

// ==========================================
// RIWAYAT TRANSAKSI (SORT TERBARU)
// ==========================================
async function renderRiwayat() {
    const container = document.getElementById('riwayat-list');
    const num = document.getElementById('phone-number').value;
    if(!container || num.length < 10) return;

    try {
        const response = await fetch(`${SCRIPT_URL}?nomor=${num}`);
        const data = await response.json();
        if(!data || data.length === 0) { container.innerHTML = ""; return; }

        container.innerHTML = `<h2 class="text-[10px] font-black text-gray-400 uppercase mb-4 mt-8 tracking-widest ml-2 italic">Riwayat Transaksi</h2>`;
        
        // SORT TERBARU KE LAMA
        data.sort((a, b) => {
            let tglA = new Date(a.tgl.toString().replace(",", "").replace(/\./g, "-").replace(/\//g, "-"));
            let tglB = new Date(b.tgl.toString().replace(",", "").replace(/\./g, "-").replace(/\//g, "-"));
            return tglB - tglA;
        });

        data.forEach(trx => {
            let tglAsli = trx.tgl ? trx.tgl.toString() : "";
            let bersih = tglAsli.replace(",", "").replace(/\./g, ":").replace(/\//g, "-");
            let bagian = bersih.split(" ");
            let tglSaja = bagian[0] || ""; let jamSaja = bagian[1] || "";
            let d = tglSaja.split("-");
            let tglCantik = `${(d[0]||"00").padStart(2,'0')}:${(d[1]||"00").padStart(2,'0')}:${d[2]||"0000"} ${(jamSaja.split(":")[0]||"00").padStart(2,'0')}:${(jamSaja.split(":")[1]||"00").padStart(2,'0')}`;

            let color = trx.status === "Sukses" ? "text-green-600" : (trx.status === "Gagal" ? "text-red-600" : "text-yellow-600");
            container.innerHTML += `
                <div class="bg-white p-4 rounded-3xl shadow-sm border border-gray-50 mb-3 flex justify-between items-center">
                    <div class="flex-1 pr-2">
                        <div class="text-[10px] font-black text-gray-800 uppercase leading-tight">${trx.produk}</div>
                        <div class="text-[8px] text-gray-400 font-bold mt-1 uppercase tracking-tighter"><i class="far fa-clock mr-1"></i> ${tglCantik} WITA</div>
                    </div>
                    <div class="text-right">
                        <div class="text-[11px] font-black text-blue-600">Rp ${parseInt(trx.harga).toLocaleString('id-ID')}</div>
                        <div class="text-[8px] font-black uppercase mt-1 px-2 py-0.5 rounded-full bg-gray-50 inline-block ${color}">${trx.status}</div>
                    </div>
                </div>`;
        });
    } catch (e) { console.log("Gagal memuat riwayat"); }
}

// ==========================================
// KERANJANG & WHATSAPP
// ==========================================
function tambahKeKeranjang(n, p, cat) {
    const num = document.getElementById('phone-number').value;
    if (num.length < 10) { alert("Masukkan Nomor WhatsApp Tujuan!"); return; }
    keranjang.push({ no: num, nama: n, harga: p, kategori: cat });
    updateKeranjangUI();
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
    container.innerHTML = ''; 
    let subtotal = 0;

    keranjang.forEach((item, i) => {
        subtotal += item.harga;
        container.innerHTML += `
            <div class="flex justify-between items-center bg-gray-50 p-4 rounded-2xl border border-gray-100 animate-fade-in">
                <div class="flex-1 pr-3">
                    <div class="text-xs font-black text-gray-800 uppercase leading-tight">${item.nama}</div>
                    <div class="text-[9px] text-blue-600 font-bold mt-1 uppercase italic tracking-tighter">
                        <i class="fas fa-phone-alt mr-1"></i> ${item.no}
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-xs font-black text-gray-900 font-mono">Rp ${item.harga.toLocaleString('id-ID')}</div>
                    <div class="text-[9px] text-red-500 font-black uppercase mt-1 cursor-pointer hover:underline" onclick="hapusItem(${i})">
                        <i class="fas fa-trash"></i> Hapus
                    </div>
                </div>
            </div>`;
    });

    const kodeUnik = Math.floor(Math.random() * 99) + 1;
    totalAkhirDenganKode = subtotal + kodeUnik;

    document.getElementById('m-price').innerHTML = `
        <div class="bg-blue-600 rounded-[2rem] p-6 text-white shadow-xl relative overflow-hidden">
            <div class="relative z-10 text-center">
                <div class="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-1">Total Bayar</div>
                
                <div onclick="salinTotal(${totalAkhirDenganKode})" class="cursor-pointer group relative inline-block">
                    <div class="text-4xl font-black mb-1 tracking-tighter flex items-center justify-center gap-2">
                        <span>Rp ${totalAkhirDenganKode.toLocaleString('id-ID')}</span>
                        <i class="fas fa-copy text-sm opacity-50 group-hover:opacity-100 transition-opacity"></i>
                    </div>
                    <div id="copy-notif" class="text-[9px] font-black uppercase bg-white text-blue-600 px-2 py-1 rounded-full absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 transition-all">Tersalin!</div>
                </div>

                <div class="text-[9px] font-bold italic opacity-90 mt-1">Termasuk kode unik: +Rp ${kodeUnik}</div>
                <p class="text-[8px] mt-3 font-black uppercase tracking-widest opacity-60">*Klik angka untuk salin nominal*</p>
            </div>
            <i class="fas fa-wallet absolute -bottom-4 -right-4 text-7xl opacity-10 rotate-12"></i>
        </div>`;
    document.getElementById('modal-bayar').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function salinTotal(nominal) {
    // Proses Salin
    navigator.clipboard.writeText(nominal).then(() => {
        const notif = document.getElementById('copy-notif');
        
        // Animasi Notifikasi Tersalin
        notif.classList.remove('opacity-0', '-top-8');
        notif.classList.add('opacity-100', '-top-10');
        
        // Kembalikan ke semula setelah 2 detik
        setTimeout(() => {
            notif.classList.remove('opacity-100', '-top-10');
            notif.classList.add('opacity-0', '-top-8');
        }, 2000);
        
        // Getaran ringan (vibrate) jika HP mendukung
        if (navigator.vibrate) navigator.vibrate(50);
    }).catch(err => {
        console.error('Gagal menyalin: ', err);
    });
}



async function kirimWA() {
    if (keranjang.length === 0) return;

    let detailWA = ""; 
    let dataSheet = []; 
    const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' }); // Format WITA

    keranjang.forEach((item, i) => {
        // Format untuk teks WhatsApp
        detailWA += `📦 *PRODUK ${i + 1}*\n`;
        detailWA += `🔹 Layanan: ${item.kategori}\n`;
        detailWA += `🔹 Produk: ${item.nama}\n`;
        detailWA += `🔹 No. Tujuan: *${item.no}*\n`;
        detailWA += `🔹 Harga: Rp ${item.harga.toLocaleString('id-ID')}\n\n`;

        // Data untuk Google Sheets
        dataSheet.push({ 
            tanggal: waktu, 
            nomor: "'" + item.no, 
            produk: item.kategori + " " + item.nama, 
            harga_asli: item.harga, 
            total_transfer: totalAkhirDenganKode, 
            status: "Pending" 
        });
    });

    // Kirim data ke Google Sheets (Database)
    try { 
        await fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(dataSheet) }); 
    } catch (e) { console.error("Gagal simpan ke database"); }

    // Susun Pesan WhatsApp Akhir
    const msg = 
`⚡ *PESANAN BARU - KUOTAKILAT* ⚡
_NK JAYA CELL - Agen BRILink_
--------------------------------------------
${detailWA}--------------------------------------------
💰 *TOTAL TRANSFER: Rp ${totalAkhirDenganKode.toLocaleString('id-ID')}*
--------------------------------------------
📌 *PENTING:*
1. Mohon transfer *TIDAK DIBULATKAN* (sesuai nominal di atas).
2. Lampirkan bukti transfer di bawah ini.
3. Pesanan akan segera diproses.

Terima Kasih 🙏`;

    window.location.href = `https://wa.me/${WA_ADMIN}?text=${encodeURIComponent(msg)}`;
}

// ==========================================
// UTILS & TIMER
// ==========================================
function startCountdown(endTime, elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const interval = setInterval(() => {
        const distance = new Date(endTime.replace(/\./g, '-')).getTime() - new Date().getTime();
        if (distance < 0) { clearInterval(interval); el.innerHTML = "PROMO BERAKHIR"; return; }
        const h = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((distance % (1000 * 60)) / 1000);
        el.innerHTML = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }, 1000);
}

function detectOp(num) {
    const pre = num.substring(0,4);
    for(let op in prefixMap) { if(prefixMap[op].includes(pre)) { selectCategory(op); break; } }
}
function hapusItem(i) { keranjang.splice(i, 1); updateKeranjangUI(); if(keranjang.length === 0) tutupModal(); else bukaModalKeranjang(); }
function tutupModal() { document.getElementById('modal-bayar').classList.remove('active'); document.body.style.overflow = 'auto'; }

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