const WA_ADMIN = "6285847909692";
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT6mOnYdR8MGwIusehg_plQJHoAVALhdcXNpbgOatMEkuipIoUDfECd5KWe0KAUNl8QTyaKz7PeeigA/pub?gid=0&single=true&output=csv";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwcqLiMzefrps2UntiAtpckm1mwYai0sAdr39mWsiFCZMINyGwRQGo8gF3N9uBuRu3a/exec"; // Pastikan diisi URL Apps Script Bapak

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
                const price = parseInt(cols[2].replace(/\D/g, ''));
                if (!db[cat]) db[cat] = [];
                db[cat].push({ n: name, p: price });
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

function detectOp(num) {
    const pre = num.replace(/\D/g, '').substring(0,4);
    for(let op in prefixMap) { if(prefixMap[op].includes(pre)) { selectCategory(op); break; } }
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
            list.innerHTML += `
                <div onclick="tambahKeKeranjang('${item.n}', ${item.p}, '${cat}')" class="bg-white p-4 rounded-3xl shadow-sm flex justify-between items-center active:scale-95 transition-all border border-gray-50">
                    <div><b class="text-xs font-black text-gray-800 uppercase">${item.n}</b></div>
                    <div class="text-right"><div class="text-blue-600 font-black text-sm">Rp ${item.p.toLocaleString('id-ID')}</div></div>
                </div>`;
        });
    }
}

function tambahKeKeranjang(n, p, cat) {
    const num = document.getElementById('phone-number').value;
    if(num.length < 10) return alert("Masukkan Nomor HP!");
    // Simpan data dengan nama properti yang konsisten
    keranjang.push({ no: num, nama: n, harga: p, kategori: cat });
    updateKeranjangUI();
    alert("Ditambah: " + n + " untuk " + num);
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
        container.innerHTML += `
            <div class="flex justify-between items-center text-[10px] border-b border-dashed pb-2 mb-2">
                <div>
                    <b class="uppercase text-blue-600">${item.kategori} - ${item.nama}</b><br>
                    <span class="font-bold text-gray-600">No: ${item.no}</span>
                </div>
                <div class="text-right">
                    <b>Rp ${item.harga.toLocaleString('id-ID')}</b><br>
                    <span class="text-red-500 font-bold cursor-pointer" onclick="hapusItem(${i})">Hapus</span>
                </div>
            </div>`;
    });
    document.getElementById('m-price').innerText = "Rp " + total.toLocaleString('id-ID');
    document.getElementById('modal-bayar').classList.add('active');
}

function hapusItem(i) {
    keranjang.splice(i, 1);
    updateKeranjangUI();
    if(keranjang.length === 0) {
        tutupModal();
    } else {
        bukaModalKeranjang();
    }
}

function tutupModal() { 
    document.getElementById('modal-bayar').classList.remove('active'); 
}

async function kirimWA() {
    if (keranjang.length === 0) return;
    let total = 0; 
    let detailWA = ""; 
    let dataSheet = [];

    keranjang.forEach((item, i) => {
        total += item.harga;
        // Format WhatsApp agar nomor HP muncul di setiap produk
        detailWA += `${i+1}. ${item.kategori} ${item.nama}\n   No: ${item.no}\n   Harga: Rp ${item.harga.toLocaleString('id-ID')}\n\n`;
        
        dataSheet.push({ 
            nomor: item.no, 
            produk: item.kategori + " " + item.nama, 
            harga: item.harga 
        });
    });

    const btn = document.getElementById('btn-wa');
    if(btn) { btn.innerText = "Menyimpan..."; btn.disabled = true; }

    try {
        await fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(dataSheet) });
    } catch (e) { console.log("Gagal simpan ke Sheet 2"); }

    const msg = `*PESANAN BARU - NK JAYA CELL*\n------------------------------\n*RINCIAN PESANAN:*\n\n${detailWA}------------------------------\n*TOTAL BAYAR: Rp ${total.toLocaleString('id-ID')}*\n------------------------------`;
    
    window.location.href = `https://wa.me/${WA_ADMIN}?text=${encodeURIComponent(msg)}`;
    if(btn) { btn.innerText = "KONFIRMASI WHATSAPP"; btn.disabled = false; }
}

window.onload = init;