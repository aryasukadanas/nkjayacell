// config.js
const WA_ADMIN = "6285847909692";
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT6mOnYdR8MGwIusehg_plQJHoAVALhdcXNpbgOatMEkuipIoUDfECd5KWe0KAUNl8QTyaKz7PeeigA/pub?gid=0&single=true&output=csv";
const ADMIN_BANK_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT6mOnYdR8MGwIusehg_plQJHoAVALhdcXNpbgOatMEkuipIoUDfECd5KWe0KAUNl8QTyaKz7PeeigA/pub?gid=1584396032&single=true&output=csv"; 
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwQKdBfsrmlEBlKlVZiY02jx8HeIW2AtTQrE4_tcXThibDH6X9py965fHMRj--QBiH-/exec";
const SHEET_REKENING_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT6mOnYdR8MGwIusehg_plQJHoAVALhdcXNpbgOatMEkuipIoUDfECd5KWe0KAUNl8QTyaKz7PeeigA/pub?gid=1939084256&single=true&output=csv";

// Variabel Global
let db = {};
let masterTarifAdmin = []; 
let keranjang = JSON.parse(localStorage.getItem('nk_cart')) || []; // Agar keranjang tidak hilang saat pindah halaman
let totalAkhirDenganKode = 0;