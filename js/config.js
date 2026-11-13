// Uygulama sabitleri
export const APP_VERSION = "1.0.0";

// Bir fırın inserti: 8 sıra x 4 = 32 sıcak yemek (tüm uçak tiplerinde aynı)
export const OVEN_CAPACITY = 32;

// Canlı taramada aynı kodun tekrar işlenmeden önce beklenecek süre (ms)
export const LIVE_REPEAT_MS = 5000;

// Saklama anahtarları (sürüm değişirse göç yapılır)
export const STORE_KEY = "koruk.v1";
export const LEGACY_KEYS = ["kk_lists", "kk_sess", "kk_set", "kk_hist", "kk_nolive"];

// Tamamlanan yükleme geçmişinde tutulacak en fazla kayıt
export const HISTORY_LIMIT = 500;
