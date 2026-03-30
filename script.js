const WA_ADMIN = "6285847909692";
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT6mOnYdR8MGwIusehg_plQJHoAVALhdcXNpbgOatMEkuipIoUDfECd5KWe0KAUNl8QTyaKz7PeeigA/pub?gid=0&single=true&output=csv";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwcqLiMzefrps2UntiAtpckm1mwYai0sAdr39mWsiFCZMINyGwRQGo8gF3N9uBuRu3a/exec";

const iconMap = {
    'Indosat': 'logo_indosat.png',
    'XL': 'logo_xl.png',
    'Telkomsel': 'logo_telkomsel.png',
    'Axis': 'logo_axis.png',
    'Tri': 'logo_tri.png',
    'Smartfren': 'logo_smartfren.png',
    'By.U': 'logo_byu.png'
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

let riwayat = JSON.parse(localStorage.getItem('riwayat_trx')) || [];

function sensorNomor(num) {
    if (!num) return "";
    if (num.length < 8) return num; 
    return num.substring(0, 4) + "****" + num.substring(num.length - 4);
}

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
                const promoPrice = parseInt(cols[2].replace(/\D/g, ''));
                const normalPrice = cols[3] ? parseInt(cols[3].replace(/\D/g, '')) : 0; 
                if (!db[cat]) db[cat] = [];
                db[cat].push({ n: name, p: promoPrice, old: normalPrice });
            }
        });
        renderMenu();
    } catch (e) { console.error("Gagal load data"); }
}

function renderMenu() {
    const container = document.getElementById('menu-container');
    if(!container) return;
    container.innerHTML = '';
    Object.keys(db).forEach(cat => {
        const icon = iconMap[cat] || 'logo_default.png';
        container.innerHTML += `
            <div class="menu-item op-card" id="menu-${cat}" onclick="selectCategory('${cat}')">
                <div class="icon-box"><img src="${icon}"></div>
                <div class="menu-label">${cat}</div>
            </div>`;
    });
}

function selectCategory(cat) {
    document.querySelectorAll('.op-card').forEach(el => el.classList.remove('active'));
    const activeMenu = document.getElementById(`menu-${cat}`);
    if(activeMenu) activeMenu.classList.add('active');
    document.getElementById('category-title').innerText = "Produk " + cat;
    const list = document.getElementById('list-paket');
    list.innerHTML = '';
    if(db[cat]) {
        db[cat].forEach(item => {
            let part = item.n.split('|'); 
            let namaPaket = part[0].trim();
            let deskripsi = part[1] ? part[1].trim() : "";
            let htmlHarga = `<div class="text-blue-600 font-black text-[14px]">Rp ${item.p.toLocaleString('id-ID')}</div>`;
            let labelPromo = "";
            if (item.old > 0 && item.old > item.p) {
                htmlHarga = `<div class="text-gray-400 text-[9px] line-through decoration-red-500">Rp ${item.old.toLocaleString('id-ID')}</div>
                             <div class="text-blue-600 font-black text-[14px]">Rp ${item.p.toLocaleString('id-ID')}</div>`;
                labelPromo = `<div class="absolute top-0 right-0 bg-red-600 text-white text-[7px] font-black px-3 py-1 rounded-bl-xl shadow-sm">PROMO</div>`;
            }
            list.innerHTML += `
                <div onclick="tambahKeKeranjang('${item.n}', ${item.p}, '${cat}')" 
                     class="bg-white p-4 rounded-3xl shadow-sm flex justify-between items-center active:scale-95 transition-all border border-gray-100 mb-3 relative overflow-hidden">
                    ${labelPromo}
                    <div class="flex-1 pr-3">
                        <div class="text-[11px] font-black text-gray-800 uppercase leading-tight">${namaPaket}</div>
                        <div class="text-[9px] text-gray-500 font-medium mt-1 italic">${deskripsi}</div>
                    </div>
                    <div class="text-right min-w-[100px]">
                        ${htmlHarga}
                        <div class="text-[8px] text-blue-400 font-bold uppercase mt-1">🛒 Pilih Paket</div>
                    </div>
                </div>`;
        });
    }
}

function detectOp(num) {
    const pre = num.replace(/\D/g, '').substring(0,4);
    for(let op in prefixMap) { if(prefixMap[op].includes(pre)) { selectCategory(op); break; } }
}

function tambahKeKeranjang(n, p, cat) {
    const num = document.getElementById('phone-number').value;
    if(num.length < 10) return alert("Masukkan Nomor HP!");
    keranjang.push({ no: num, nama: n, harga: p, kategori: cat });
    updateKeranjangUI();
    // Langsung buka modal konfirmasi bayar setelah pilih paket
    bukaModalKeranjang();
}

function updateKeranjangUI() {
    const countEl = document.getElementById('cart-count');
    const cartBtn = document.getElementById('cart-floating');
    if(countEl) countEl.innerText = keranjang.length;
    if(cartBtn) cartBtn.style.display = keranjang.length > 0 ? 'flex' : 'none';
}

function bukaModalKeranjang() {
    const container = document.getElementById('m-pkg');
    let total = 0;
    if(!container) return;
    container.innerHTML = '';
    keranjang.forEach((item, i) => {
        total += item.harga;
        const noAman = sensorNomor(item.no);
        container.innerHTML += `
            <div class="flex justify-between items-start text-[10px] border-b border-dashed border-gray-200 pb-2 mb-2">
                <div class="pr-2 text-left">
                    <b class="uppercase text-gray-800">${item.kategori} - ${item.nama}</b><br>
                    <span class="font-bold text-gray-600">No: ${noAman}</span>
                </div>
                <div class="text-right min-w-[70px]">
                    <b class="text-gray-900">Rp ${item.harga.toLocaleString('id-ID')}</b><br>
                    <span class="text-red-500 font-bold cursor-pointer" onclick="hapusItem(${i})">Hapus</span>
                </div>
            </div>`;
    });

    const hargaFormat = total.toLocaleString('id-ID');
    document.getElementById('m-price').innerHTML = `
        <div class="border-t border-b border-gray-100 bg-gray-50 p-4 rounded-xl my-4 text-center">
            <b class="text-[12px] text-blue-900 uppercase tracking-widest block mb-2">TOTAL BAYAR:</b>
            <div class="flex justify-center items-baseline gap-2">
                <span class="text-blue-600 font-black text-2xl">Rp</span>
                <span class="text-blue-700 font-black text-4xl tracking-tighter">${hargaFormat}</span>
                <button onclick="salinHarga(${total})" class="bg-blue-100 text-blue-700 text-[9px] font-black px-3 py-1.5 rounded-full shadow-sm">
                    <i class="far fa-copy mr-1"></i> SALIN
                </button>
            </div>
            <p class="text-[10px] text-gray-500 font-bold mt-4 leading-relaxed text-center">
                <i class="fas fa-camera mr-1"></i> Scan QRIS di bawah ini melalui Aplikasi<br>Bank atau E-Wallet Anda.
            </p>
        </div>`;
    document.getElementById('qris-box').innerHTML = `<img src="qris.jpeg" alt="QRIS" class="w-64 h-64 object-contain mx-auto shadow-inner rounded-xl border-4 border-white">`;
    document.getElementById('modal-bayar').classList.add('active');
}

function salinHarga(nominal) {
    navigator.clipboard.writeText(nominal).then(() => {
        alert("Harga disalin: Rp " + nominal.toLocaleString('id-ID') + "\n\nSilakan tempel di aplikasi bank Kak Ngurah.");
    }).catch(err => { alert("Gagal menyalin manual saja ya."); });
}

function hapusItem(i) {
    keranjang.splice(i, 1);
    updateKeranjangUI();
    if(keranjang.length === 0) tutupModal();
    else bukaModalKeranjang();
}

function tutupModal() { 
    document.getElementById('modal-bayar').classList.remove('active'); 
}

async function kirimWA() {
    if (keranjang.length === 0) return;
    let total = 0; let detailWA = ""; let dataSheet = [];
    keranjang.forEach((item, i) => {
        total += item.harga;
        detailWA += `${i+1}. ${item.kategori} ${item.nama}\n   No: ${item.no}\n   Harga: Rp ${item.harga.toLocaleString('id-ID')}\n\n`;
        dataSheet.push({ nomor: item.no, produk: item.kategori + " " + item.nama, harga: item.harga });
        riwayat.unshift({
            tgl: new Date().toLocaleString('id-ID'),
            produk: item.kategori + " " + item.nama,
            nomor: item.no,
            harga: item.harga
        });
    });
    // Simpan ke memori HP (LocalStorage)
    localStorage.setItem('riwayat_trx', JSON.stringify(riwayat.slice(0, 10)));
    const btn = document.getElementById('btn-wa');
    if(btn) { btn.innerText = "Menyimpan..."; btn.disabled = true; }
    try {
        await fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(dataSheet) });
    } catch (e) { console.log("Gagal simpan"); }
    const msg = `*PESANAN BARU - NK JAYA CELL*\n------------------------------\n*RINCIAN PESANAN:*\n\n${detailWA}------------------------------\n*TOTAL BAYAR: Rp ${total.toLocaleString('id-ID')}*\n------------------------------`;
    window.location.href = `https://wa.me/${WA_ADMIN}?text=${encodeURIComponent(msg)}`;
    if(btn) { btn.innerText = "KONFIRMASI WHATSAPP"; btn.disabled = false; }
}

function renderRiwayat() {
    const container = document.getElementById('riwayat-list');
    if(!container || riwayat.length === 0) return;
    container.innerHTML = `<h2 class="text-[10px] font-black text-gray-400 uppercase mb-4 tracking-widest ml-2 mt-8">Transaksi Terakhir</h2>`;
    riwayat.forEach(trx => {
        container.innerHTML += `
            <div class="bg-white p-3 rounded-2xl shadow-sm border border-gray-50 mb-2 flex justify-between items-center opacity-80">
                <div>
                    <div class="text-[9px] font-black text-gray-800 uppercase">${trx.produk}</div>
                    <div class="text-[8px] text-gray-400 font-bold">${sensorNomor(trx.nomor)} • ${trx.tgl}</div>
                </div>
                <div class="text-[10px] font-black text-green-600">Rp ${trx.harga.toLocaleString('id-ID')}</div>
            </div>`;
    });
}

window.onload = async () => {
    await init();
    if (typeof renderRiwayat === "function") renderRiwayat(); 
};

// --- LOGIKA INSTAL APLIKASI (PWA) ---
let deferredPrompt;
const installBanner = document.getElementById('install-banner');
const btnInstall = document.getElementById('btn-install');

window.addEventListener('beforeinstallprompt', (e) => {
    // Mencegah Chrome menampilkan prompt otomatis
    e.preventDefault();
    // Simpan event agar bisa dipicu nanti
    deferredPrompt = e;
    // Munculkan tombol instal buatan kita
    if (installBanner) installBanner.style.display = 'flex';
});

if (btnInstall) {
    btnInstall.addEventListener('click', async () => {
        if (deferredPrompt) {
            // Jalankan prompt instalasi
            deferredPrompt.prompt();
            // Cek pilihan pengguna
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                console.log('User menginstal aplikasi');
            }
            // Sembunyikan tombol setelah diklik
            deferredPrompt = null;
            installBanner.style.display = 'none';
        }
    });
}

// Sembunyikan tombol jika aplikasi sudah terinstal
window.addEventListener('appinstalled', () => {
    if (installBanner) installBanner.style.display = 'none';
    console.log('Aplikasi NK JAYA CELL sudah terinstal');
});