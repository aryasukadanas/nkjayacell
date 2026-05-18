<script src="config.js"></script> <script>
    // 1. Ambil Parameter dari URL (MLBB atau FF)
    const urlParams = new URLSearchParams(window.location.search);
    const gameType = urlParams.get('type') || 'MLBB'; 

    let selectedDiamond = null;

    // 2. Jalankan saat halaman dimuat
    document.addEventListener('DOMContentLoaded', () => {
        // Sesuaikan UI
        if (gameType === 'FF') {
            document.getElementById('zone_id').classList.add('hidden');
            document.getElementById('game_id').placeholder = "Masukkan Player ID";
            document.getElementById('game_id').parentElement.classList.remove('grid-cols-3');
            document.getElementById('game_id').parentElement.classList.add('grid-cols-1');
        }
        
        // PANGGIL DATA DARI GOOGLE SHEETS
        loadGameProducts();
    });

    // 3. Ambil Data dari Google Sheets (CSV_URL diambil dari config.js)
    async function loadGameProducts() {
        const grid = document.getElementById('diamond-grid');
        grid.innerHTML = '<div class="col-span-2 text-center py-10 text-xs font-bold text-gray-400">Loading Produk...</div>';

        try {
            const response = await fetch(CSV_URL); 
            const data = await response.text();
            const rows = data.split('\n').slice(1); 

            grid.innerHTML = ''; 

            rows.forEach(row => {
                const cols = row.split(',');
                if (cols.length < 3) return;

                const kategori = cols[0].trim();
                const namaProduk = cols[1].trim();
                const harga = parseInt(cols[2]);

                if (kategori === gameType) {
                    const card = document.createElement('div');
                    card.className = "diamond-card border-2 border-gray-100 bg-white p-4 rounded-3xl flex flex-col items-center text-center cursor-pointer transition-all active:scale-95";
                    card.onclick = () => selectDiamond(card, namaProduk, harga);
                    card.innerHTML = `
                        <i class="fas fa-gem ${gameType === 'FF' ? 'text-orange-500' : 'text-blue-500'} mb-2 text-xl"></i>
                        <div class="text-[10px] font-black text-gray-800 uppercase leading-tight">${namaProduk}</div>
                        <div class="text-[11px] font-black text-blue-600 mt-2">Rp ${harga.toLocaleString('id-ID')}</div>
                    `;
                    grid.appendChild(card);
                }
            });
        } catch (error) {
            grid.innerHTML = '<div class="col-span-2 text-red-500 text-center text-xs font-bold">Gagal memuat produk. Periksa koneksi atau CSV_URL.</div>';
        }
    }

    function selectDiamond(el, name, price) {
        document.querySelectorAll('.diamond-card').forEach(c => {
            c.classList.remove('active', 'border-blue-600', 'bg-blue-50');
            c.style.borderColor = '#f1f5f9';
        });
        el.classList.add('active', 'border-blue-600', 'bg-blue-50');
        el.style.borderColor = '#2563eb';
        selectedDiamond = { name, price };
    }

    // 4. Fungsi Kirim Pesan ke WhatsApp
    function bayarGame() {
        const gameId = document.getElementById('game_id').value;
        const zoneId = document.getElementById('zone_id').value;

        if (!gameId) return alert("Masukkan ID Game!");
        if (gameType === 'MLBB' && !zoneId) return alert("Masukkan Zone ID!");
        if (!selectedDiamond) return alert("Pilih Nominal Diamond!");

        const pesan = `Halo NK JAYA CELL, saya mau Top Up Game:\n\n` +
                      `🎮 Game: ${gameType}\n` +
                      `🆔 ID: ${gameId} ${zoneId ? '('+zoneId+')' : ''}\n` +
                      `💎 Produk: ${selectedDiamond.name}\n` +
                      `💰 Harga: Rp ${selectedDiamond.price.toLocaleString('id-ID')}\n\n` +
                      `Mohon segera diproses ya!`;

        const linkWA = `https://wa.me/${NOMOR_WA}?text=${encodeURIComponent(pesan)}`;
        window.open(linkWA, '_blank');
    }
</script>