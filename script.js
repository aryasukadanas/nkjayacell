const WA_ADMIN = "6285847909692";
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT6mOnYdR8MGwIusehg_plQJHoAVALhdcXNpbgOatMEkuipIoUDfECd5KWe0KAUNl8QTyaKz7PeeigA/pub?gid=0&single=true&output=csv";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwh0lE_0ebqn2ScCWvxioXBJYwLl2qT3aGVHk_W0QHTRP21lWb88djzWMCrihY0ZkHj/exec";

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
let totalAkhirDenganKode = 0;
function bukaModalKeranjang() {
    const container = document.getElementById('m-pkg');
    let subtotal = 0;
    if(!container) return;
    container.innerHTML = '';
    
    keranjang.forEach((item, i) => {
        subtotal += item.harga;
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

    // --- LOGIKA KODE UNIK ---
    // Membuat angka acak 1-99
    const kodeUnik = Math.floor(Math.random() * 99) + 1;
    totalAkhirDenganKode = subtotal + kodeUnik;
    const hargaFormat = totalAkhirDenganKode.toLocaleString('id-ID');

    document.getElementById('m-price').innerHTML = `
        <div class="border-t border-b border-gray-100 bg-gray-50 p-4 rounded-xl my-4 text-center">
            <b class="text-[10px] text-blue-900 uppercase tracking-widest block mb-1">TOTAL BAYAR (+KODE UNIK):</b>
            <div class="flex justify-center items-baseline gap-2">
                <span class="text-blue-600 font-black text-2xl">Rp</span>
                <span class="text-blue-700 font-black text-4xl tracking-tighter">${hargaFormat}</span>
                <button onclick="salinHarga(${totalAkhirDenganKode})" class="bg-blue-100 text-blue-700 text-[9px] font-black px-3 py-1.5 rounded-full shadow-sm">
                    <i class="far fa-copy mr-1"></i> SALIN
                </button>
            </div>
            <p class="text-[10px] text-red-600 font-black mt-3 italic">
                <i class="fas fa-clock mr-1"></i> TRANSFER SESUAI NOMINAL HINGGA 2 DIGIT TERAKHIR!<br>
                Pembayaran berlaku selama 24 Jam.
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
    // 1. Validasi keranjang
    if (keranjang.length === 0) return;
    
    let detailWA = ""; 
    let dataSheet = [];
    const waktuSekarang = new Date().toLocaleString('id-ID');
    
    // totalAkhirDenganKode diambil dari variabel global yang dihitung di bukaModalKeranjang()
    const totalFix = typeof totalAkhirDenganKode !== 'undefined' ? totalAkhirDenganKode : 0;

    // 2. Menyusun detail pesanan dan data untuk Spreadsheet
    keranjang.forEach((item, i) => {
        // Format teks untuk WhatsApp
        detailWA += `${i+1}. ${item.kategori} ${item.nama}\n   No: ${item.no}\n   Harga: Rp ${item.harga.toLocaleString('id-ID')}\n\n`;
        
        // Data objek untuk dikirim ke Google Apps Script
        dataSheet.push({ 
            tanggal: waktuSekarang,
            nomor: item.no, 
            produk: item.kategori + " " + item.nama, 
            harga_asli: item.harga,
            total_transfer: totalFix,
            status: "Pending" 
        });

        // Update riwayat transaksi lokal (LocalStorage)
        riwayat.unshift({
            tgl: waktuSekarang,
            produk: item.kategori + " " + item.nama,
            nomor: item.no,
            harga: totalFix,
            status: "Pending"
        });
    });

    // Simpan maksimal 10 riwayat terakhir di memori HP
    localStorage.setItem('riwayat_trx', JSON.stringify(riwayat.slice(0, 10)));
    
    // 3. Efek visual tombol saat proses simpan
    const btn = document.getElementById('btn-wa');
    if(btn) { 
        btn.innerText = "⏳ Menyimpan..."; 
        btn.disabled = true; 
    }

    // 4. Proses kirim data ke Google Sheets secara Background
    try {
        await fetch(SCRIPT_URL, { 
            method: 'POST', 
            mode: 'no-cors', // Mode no-cors digunakan untuk Apps Script agar tidak terhalang kebijakan CORS
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataSheet) 
        });
    } catch (e) { 
        console.error("Gagal sinkronisasi ke Spreadsheet:", e); 
    }

    // 5. Menyusun format pesan akhir untuk WhatsApp
    const msg = `*PESANAN BARU - NK JAYA CELL*\n` +
                `------------------------------\n` +
                `*RINCIAN PESANAN:*\n\n` +
                `${detailWA}` +
                `------------------------------\n` +
                `*TOTAL BAYAR: Rp ${totalFix.toLocaleString('id-ID')}*\n` +
                `_(Mohon transfer sesuai nominal di atas)_\n` +
                `------------------------------\n` +
                `*Status:* Pending (Menunggu Bayar)\n` +
                `*Batas Waktu:* 24 Jam\n` +
                `------------------------------\n` +
                `_Silakan kirim bukti bayar ke chat ini._`;

    // 6. Eksekusi pengalihan ke WhatsApp Admin
    window.location.href = `https://wa.me/${WA_ADMIN}?text=${encodeURIComponent(msg)}`;
    
    // Reset tombol jika pengguna kembali ke halaman
    if(btn) { 
        btn.innerText = "KONFIRMASI WHATSAPP"; 
        btn.disabled = false; 
    }
}

async function renderRiwayat() {
    const container = document.getElementById('riwayat-list');
    const num = document.getElementById('phone-number').value;
    
    // Hanya cari jika nomor HP sudah diisi minimal 10 digit
    if(!container || num.length < 10) return;

    container.innerHTML = `<p class="text-[8px] text-center text-gray-400 animate-pulse">Memeriksa status transaksi...</p>`;

    try {
        // Ambil data terbaru langsung dari Google Sheets
        const response = await fetch(`${SCRIPT_URL}?nomor=${num}`);
        const dataTerbaru = await response.json();

        if(dataTerbaru.length === 0) {
            container.innerHTML = "";
            return;
        }

        container.innerHTML = `<h2 class="text-[10px] font-black text-gray-400 uppercase mb-4 tracking-widest ml-2 mt-8">Status Transaksi Anda</h2>`;
        
        dataTerbaru.forEach(trx => {
            // Tentukan warna berdasarkan status
            let colorClass = "text-yellow-600"; // Default Pending
            if(trx.status === "Sukses") colorClass = "text-green-600";
            if(trx.status === "Gagal") colorClass = "text-red-600";
            if(trx.status === "Refund") colorClass = "text-blue-600";

            container.innerHTML += `
                <div class="bg-white p-3 rounded-2xl shadow-sm border border-gray-50 mb-2 flex justify-between items-center">
                    <div>
                        <div class="text-[9px] font-black text-gray-800 uppercase">${trx.produk}</div>
                        <div class="text-[8px] text-gray-400 font-bold">${trx.tgl}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-[10px] font-black text-gray-900">Rp ${trx.harga.toLocaleString('id-ID')}</div>
                        <div class="text-[8px] font-black uppercase ${colorClass}">${trx.status}</div>
                    </div>
                </div>`;
        });
    } catch (e) {
        container.innerHTML = "";
        console.log("Belum ada riwayat untuk nomor ini.");
    }
}
window.onload = async () => {
    await init();
    if (typeof renderRiwayat === "function") renderRiwayat(); 

        document.getElementById('phone-number').addEventListener('input', function(e) {
        if(this.value.length >= 10) {
        renderRiwayat();
        }
    });
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