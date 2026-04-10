const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const requestIp = require('request-ip');

const app = express();
const SECRET_KEY = 'ataypetrol42';

app.use(express.json());
app.use(cookieParser());
app.use(requestIp.mw());
app.use(express.static('public'));

const db = new sqlite3.Database('./database.sqlite');

// WAL modu - kilitlenmeyi önler
db.run("PRAGMA journal_mode=WAL");

// ============ TABLOLAR ============
db.serialize(() => {
    // Kullanıcılar
    db.run(`CREATE TABLE IF NOT EXISTS kullanicilar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    sifre TEXT,
    adsoyad TEXT,
    yetki TEXT DEFAULT 'user',
    aktif INTEGER DEFAULT 1
  )`);

    // Giriş logları
    db.run(`CREATE TABLE IF NOT EXISTS login_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT,
    ip TEXT,
    giris_zamani TEXT
  )`);

    // Ürünler
    db.run(`CREATE TABLE IF NOT EXISTS urunler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ad TEXT UNIQUE
  )`);

    // Alış (Stok girişi - satın alma)
    db.run(`CREATE TABLE IF NOT EXISTS alis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tarih TEXT,
    urun_id INTEGER,
    litre REAL,
    birim_fiyat REAL,
    toplam_tutar REAL,
    tedarikci TEXT
  )`);

    // Satış
    db.run(`CREATE TABLE IF NOT EXISTS satis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tarih TEXT,
    urun_id INTEGER,
    litre REAL,
    birim_fiyat REAL,
    toplam_tutar REAL,
    nakit REAL DEFAULT 0,
    havale REAL DEFAULT 0,
    pos REAL DEFAULT 0,
    borc REAL DEFAULT 0
  )`);

    // Borçlar
    db.run(`CREATE TABLE IF NOT EXISTS borc (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tarih TEXT,
    musteri_adi TEXT,
    urun_id INTEGER,
    miktar_tl REAL,
    kalan_tl REAL,
    aciklama TEXT
  )`);

    // Tahsilat
    db.run(`CREATE TABLE IF NOT EXISTS tahsilat (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tarih TEXT,
    borc_id INTEGER,
    miktar REAL,
    odeme_yontemi TEXT
  )`);

    // Giderler
    db.run(`CREATE TABLE IF NOT EXISTS giderler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tarih TEXT,
    kategori TEXT,
    aciklama TEXT,
    miktar REAL
  )`);

    // Ürünleri ekle
    const urunler = ['Motorin', 'Benzin', 'LPG'];
    for (let i = 0; i < urunler.length; i++) {
        db.run(`INSERT OR IGNORE INTO urunler (ad) VALUES (?)`, [urunler[i]]);
    }

    // Hesaplar
    const hash1 = bcrypt.hashSync('Atay2026', 10);
    const hash2 = bcrypt.hashSync('Diamond42', 10);
    db.run(`INSERT OR IGNORE INTO kullanicilar (email, sifre, adsoyad, yetki) VALUES (?, ?, ?, ?)`, ['atay@gmail.com', hash1, 'Burhan Atay', 'admin']);
    db.run(`INSERT OR IGNORE INTO kullanicilar (email, sifre, adsoyad, yetki) VALUES (?, ?, ?, ?)`, ['izleyici@atay.com', hash2, 'İzleyici', 'user']);
});

// ============ MIDDLEWARE ============
function auth(req, res, next) {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ hata: 'Giriş yapılmamış' });
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ hata: 'Token geçersiz' });
    }
}

function adminOnly(req, res, next) {
    if (req.user.yetki !== 'admin') {
        return res.status(403).json({ hata: 'Admin yetkisi gerekir' });
    }
    next();
}

// ============ GİRİŞ / ÇIKIŞ ============
app.post('/api/login', (req, res) => {
    const { email, sifre } = req.body;

    db.get(`SELECT * FROM kullanicilar WHERE email = ? AND aktif = 1`, [email], (err, user) => {
        if (err || !user) return res.status(401).json({ hata: 'Kullanıcı bulunamadı' });
        if (!bcrypt.compareSync(sifre, user.sifre)) return res.status(401).json({ hata: 'Şifre hatalı' });

        const token = jwt.sign({ id: user.id, email: user.email, yetki: user.yetki }, SECRET_KEY, { expiresIn: '7d' });
        const ip = req.clientIp || req.ip || '127.0.0.1';
        const zaman = new Date().toISOString();

        db.run(`INSERT INTO login_log (email, ip, giris_zamani) VALUES (?, ?, ?)`, [email, ip, zaman]);

        res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
        res.json({ mesaj: 'Giriş başarılı', yetki: user.yetki });
    });
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ mesaj: 'Çıkış yapıldı' });
});

app.get('/api/me', auth, (req, res) => {
    res.json({ email: req.user.email, yetki: req.user.yetki });
});

// ============ LOGLAR ============
app.get('/api/loglar', auth, adminOnly, (req, res) => {
    db.all(`SELECT * FROM login_log ORDER BY id DESC LIMIT 200`, (err, rows) => {
        res.json(rows || []);
    });
});

// ============ KULLANICILAR ============
app.get('/api/kullanicilar', auth, adminOnly, (req, res) => {
    db.all(`SELECT id, email, adsoyad, yetki, aktif FROM kullanicilar`, (err, rows) => {
        res.json(rows || []);
    });
});

app.post('/api/kullanici', auth, adminOnly, (req, res) => {
    const { email, sifre, adsoyad, yetki } = req.body;
    const hash = bcrypt.hashSync(sifre, 10);
    db.run(`INSERT INTO kullanicilar (email, sifre, adsoyad, yetki) VALUES (?, ?, ?, ?)`, [email, hash, adsoyad, yetki || 'user'], function(err) {
        if (err) return res.status(400).json({ hata: 'Email mevcut' });
        res.json({ mesaj: 'Kullanıcı eklendi' });
    });
});

app.put('/api/kullanici/:id', auth, adminOnly, (req, res) => {
    const { adsoyad, yetki, aktif } = req.body;
    db.run(`UPDATE kullanicilar SET adsoyad = ?, yetki = ?, aktif = ? WHERE id = ?`, [adsoyad, yetki, aktif, req.params.id], function(err) {
        if (err) return res.status(400).json({ hata: 'Güncelleme hatası' });
        res.json({ mesaj: 'Kullanıcı güncellendi' });
    });
});

app.delete('/api/kullanici/:id', auth, adminOnly, (req, res) => {
    db.run(`DELETE FROM kullanicilar WHERE id = ?`, [req.params.id], function(err) {
        res.json({ mesaj: 'Kullanıcı silindi' });
    });
});

// ============ ÜRÜNLER ============
app.get('/api/urunler', auth, (req, res) => {
    db.all(`SELECT * FROM urunler`, (err, rows) => {
        res.json(rows || []);
    });
});

// ============ ALIŞ ============
app.post('/api/alis', auth, adminOnly, (req, res) => {
    const { tarih, urun_id, litre, birim_fiyat, tedarikci } = req.body;
    const toplam = litre * birim_fiyat;
    db.run(`INSERT INTO alis (tarih, urun_id, litre, birim_fiyat, toplam_tutar, tedarikci) VALUES (?, ?, ?, ?, ?, ?)`, [tarih, urun_id, litre, birim_fiyat, toplam, tedarikci || ''], function(err) {
        if (err) return res.status(400).json({ hata: 'Alış eklenemedi' });
        res.json({ id: this.lastID, mesaj: 'Alış eklendi' });
    });
});

app.get('/api/alis', auth, (req, res) => {
    db.all(`SELECT alis.*, urunler.ad as urun_adi FROM alis JOIN urunler ON alis.urun_id = urunler.id ORDER BY tarih DESC`, (err, rows) => {
        res.json(rows || []);
    });
});

app.put('/api/alis/:id', auth, adminOnly, (req, res) => {
    const { tarih, urun_id, litre, birim_fiyat, tedarikci } = req.body;
    const toplam = litre * birim_fiyat;
    db.run(`UPDATE alis SET tarih = ?, urun_id = ?, litre = ?, birim_fiyat = ?, toplam_tutar = ?, tedarikci = ? WHERE id = ?`, [tarih, urun_id, litre, birim_fiyat, toplam, tedarikci, req.params.id], function(err) {
        if (err) return res.status(400).json({ hata: 'Güncelleme hatası' });
        res.json({ mesaj: 'Alış güncellendi' });
    });
});

app.delete('/api/alis/:id', auth, adminOnly, (req, res) => {
    db.run(`DELETE FROM alis WHERE id = ?`, [req.params.id], function(err) {
        res.json({ mesaj: 'Alış silindi' });
    });
});

// ============ SATIŞ ============
app.post('/api/satis', auth, adminOnly, (req, res) => {
    const { tarih, urun_id, litre, birim_fiyat, nakit, havale, pos, borc } = req.body;
    const toplam = (parseFloat(nakit) || 0) + (parseFloat(havale) || 0) + (parseFloat(pos) || 0) + (parseFloat(borc) || 0);

    db.run(`INSERT INTO satis (tarih, urun_id, litre, birim_fiyat, toplam_tutar, nakit, havale, pos, borc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [tarih, urun_id, litre, birim_fiyat, toplam, nakit || 0, havale || 0, pos || 0, borc || 0], function(err) {
        if (err) return res.status(400).json({ hata: 'Satış eklenemedi' });
        res.json({ id: this.lastID, mesaj: 'Satış eklendi' });
    });
});

app.get('/api/satis', auth, (req, res) => {
    db.all(`SELECT satis.*, urunler.ad as urun_adi FROM satis JOIN urunler ON satis.urun_id = urunler.id ORDER BY tarih DESC`, (err, rows) => {
        res.json(rows || []);
    });
});

app.put('/api/satis/:id', auth, adminOnly, (req, res) => {
    const { tarih, urun_id, litre, birim_fiyat, nakit, havale, pos, borc } = req.body;
    const toplam = (parseFloat(nakit) || 0) + (parseFloat(havale) || 0) + (parseFloat(pos) || 0) + (parseFloat(borc) || 0);

    db.run(`UPDATE satis SET tarih = ?, urun_id = ?, litre = ?, birim_fiyat = ?, toplam_tutar = ?, nakit = ?, havale = ?, pos = ?, borc = ? WHERE id = ?`, [tarih, urun_id, litre, birim_fiyat, toplam, nakit || 0, havale || 0, pos || 0, borc || 0, req.params.id], function(err) {
        if (err) return res.status(400).json({ hata: 'Güncelleme hatası' });
        res.json({ mesaj: 'Satış güncellendi' });
    });
});

app.delete('/api/satis/:id', auth, adminOnly, (req, res) => {
    db.run(`DELETE FROM satis WHERE id = ?`, [req.params.id], function(err) {
        res.json({ mesaj: 'Satış silindi' });
    });
});

// ============ BORÇ ============
app.post('/api/borc', auth, adminOnly, (req, res) => {
    const { tarih, musteri_adi, urun_id, miktar_tl, aciklama } = req.body;
    db.run(`INSERT INTO borc (tarih, musteri_adi, urun_id, miktar_tl, kalan_tl, aciklama) VALUES (?, ?, ?, ?, ?, ?)`, [tarih, musteri_adi, urun_id, miktar_tl, miktar_tl, aciklama || ''], function(err) {
        if (err) return res.status(400).json({ hata: 'Borç eklenemedi' });
        res.json({ id: this.lastID, mesaj: 'Borç eklendi' });
    });
});

app.get('/api/borc', auth, (req, res) => {
    db.all(`SELECT borc.*, urunler.ad as urun_adi FROM borc JOIN urunler ON borc.urun_id = urunler.id WHERE kalan_tl > 0 ORDER BY tarih DESC`, (err, rows) => {
        res.json(rows || []);
    });
});

app.get('/api/borc/tum', auth, adminOnly, (req, res) => {
    db.all(`SELECT borc.*, urunler.ad as urun_adi FROM borc JOIN urunler ON borc.urun_id = urunler.id ORDER BY tarih DESC`, (err, rows) => {
        res.json(rows || []);
    });
});

app.put('/api/borc/:id', auth, adminOnly, (req, res) => {
    const { musteri_adi, urun_id, miktar_tl, aciklama } = req.body;
    db.run(`UPDATE borc SET musteri_adi = ?, urun_id = ?, miktar_tl = ?, kalan_tl = ?, aciklama = ? WHERE id = ?`, [musteri_adi, urun_id, miktar_tl, miktar_tl, aciklama, req.params.id], function(err) {
        if (err) return res.status(400).json({ hata: 'Güncelleme hatası' });
        res.json({ mesaj: 'Borç güncellendi' });
    });
});

app.delete('/api/borc/:id', auth, adminOnly, (req, res) => {
    db.run(`DELETE FROM borc WHERE id = ?`, [req.params.id], function(err) {
        res.json({ mesaj: 'Borç silindi' });
    });
});

// ============ TAHSİLAT ============
app.post('/api/tahsilat', auth, adminOnly, (req, res) => {
    const { tarih, borc_id, miktar, odeme_yontemi } = req.body;
    db.run(`INSERT INTO tahsilat (tarih, borc_id, miktar, odeme_yontemi) VALUES (?, ?, ?, ?)`, [tarih, borc_id, miktar, odeme_yontemi], function(err) {
        if (err) return res.status(400).json({ hata: 'Tahsilat eklenemedi' });
        db.run(`UPDATE borc SET kalan_tl = kalan_tl - ? WHERE id = ?`, [miktar, borc_id]);
        res.json({ mesaj: 'Tahsilat eklendi' });
    });
});

app.get('/api/tahsilat', auth, (req, res) => {
    db.all(`SELECT tahsilat.*, borc.musteri_adi FROM tahsilat JOIN borc ON tahsilat.borc_id = borc.id ORDER BY tarih DESC`, (err, rows) => {
        res.json(rows || []);
    });
});

// ============ GİDERLER ============
app.post('/api/gider', auth, adminOnly, (req, res) => {
    const { tarih, kategori, aciklama, miktar } = req.body;
    db.run(`INSERT INTO giderler (tarih, kategori, aciklama, miktar) VALUES (?, ?, ?, ?)`, [tarih, kategori, aciklama, miktar], function(err) {
        if (err) return res.status(400).json({ hata: 'Gider eklenemedi' });
        res.json({ id: this.lastID, mesaj: 'Gider eklendi' });
    });
});

app.get('/api/giderler', auth, (req, res) => {
    db.all(`SELECT * FROM giderler ORDER BY tarih DESC`, (err, rows) => {
        res.json(rows || []);
    });
});

app.delete('/api/gider/:id', auth, adminOnly, (req, res) => {
    db.run(`DELETE FROM giderler WHERE id = ?`, [req.params.id], function(err) {
        res.json({ mesaj: 'Gider silindi' });
    });
});

// ============ DASHBOARD İSTATİSTİK ============
app.get('/api/istatistik', auth, (req, res) => {
    const gun = new Date().toISOString().slice(0, 10);
    const ayBaslangic = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-01';

    // Bugünkü Alış
    db.get(`SELECT SUM(toplam_tutar) as toplam FROM alis WHERE tarih = ?`, [gun], (err, bugunAlis) => {
        // Bugünkü Satış
        db.get(`SELECT SUM(toplam_tutar) as toplam FROM satis WHERE tarih = ?`, [gun], (err, bugunSatis) => {
            // Bugünkü Borç
            db.get(`SELECT SUM(miktar_tl) as toplam FROM borc WHERE tarih = ?`, [gun], (err, bugunBorc) => {
                // Aylık Alış
                db.get(`SELECT SUM(toplam_tutar) as toplam FROM alis WHERE tarih >= ?`, [ayBaslangic], (err, aylikAlis) => {
                    // Aylık Satış
                    db.get(`SELECT SUM(toplam_tutar) as toplam FROM satis WHERE tarih >= ?`, [ayBaslangic], (err, aylikSatis) => {

                        // Stok durumu
                        db.all(`SELECT urun_id, SUM(litre) as toplam FROM alis GROUP BY urun_id`, (err, alislar) => {
                            db.all(`SELECT urun_id, SUM(litre) as toplam FROM satis GROUP BY urun_id`, (err, satislar) => {
                                const stokMap = {};
                                if (alislar) {
                                    for (let i = 0; i < alislar.length; i++) {
                                        stokMap[alislar[i].urun_id] = alislar[i].toplam;
                                    }
                                }
                                if (satislar) {
                                    for (let i = 0; i < satislar.length; i++) {
                                        if (stokMap[satislar[i].urun_id]) {
                                            stokMap[satislar[i].urun_id] -= satislar[i].toplam;
                                        } else {
                                            stokMap[satislar[i].urun_id] = -satislar[i].toplam;
                                        }
                                    }
                                }

                                db.all(`SELECT id, ad FROM urunler`, (err, urunler) => {
                                    const stokListe = [];
                                    for (let i = 0; i < urunler.length; i++) {
                                        stokListe.push({
                                            id: urunler[i].id,
                                            ad: urunler[i].ad,
                                            stok: stokMap[urunler[i].id] || 0
                                        });
                                    }

                                    res.json({
                                        bugunAlis: (bugunAlis && bugunAlis.toplam) ? bugunAlis.toplam : 0,
                                        bugunSatis: (bugunSatis && bugunSatis.toplam) ? bugunSatis.toplam : 0,
                                        bugunBorc: (bugunBorc && bugunBorc.toplam) ? bugunBorc.toplam : 0,
                                        aylikAlis: (aylikAlis && aylikAlis.toplam) ? aylikAlis.toplam : 0,
                                        aylikSatis: (aylikSatis && aylikSatis.toplam) ? aylikSatis.toplam : 0,
                                        stoklar: stokListe
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// ============ RAPOR ============
app.get('/api/rapor', auth, (req, res) => {
    const { baslangic, bitis } = req.query;

    db.get(`SELECT SUM(toplam_tutar) as toplam FROM satis WHERE tarih BETWEEN ? AND ?`, [baslangic, bitis], (err, satis) => {
        db.get(`SELECT SUM(toplam_tutar) as toplam FROM alis WHERE tarih BETWEEN ? AND ?`, [baslangic, bitis], (err, alis) => {
            db.get(`SELECT SUM(miktar) as toplam FROM giderler WHERE tarih BETWEEN ? AND ?`, [baslangic, bitis], (err, gider) => {

                // Ödeme yöntemlerine göre satış
                db.all(`SELECT SUM(nakit) as nakit, SUM(havale) as havale, SUM(pos) as pos, SUM(borc) as borc FROM satis WHERE tarih BETWEEN ? AND ?`, [baslangic, bitis], (err, odeme) => {

                    // Günlük satışlar (grafik için)
                    db.all(`SELECT tarih, SUM(toplam_tutar) as toplam FROM satis WHERE tarih BETWEEN ? AND ? GROUP BY tarih ORDER BY tarih`, [baslangic, bitis], (err, gunlukSatislar) => {

                        res.json({
                            toplamSatis: (satis && satis.toplam) ? satis.toplam : 0,
                            toplamAlis: (alis && alis.toplam) ? alis.toplam : 0,
                            toplamGider: (gider && gider.toplam) ? gider.toplam : 0,
                            toplamKar: ((satis && satis.toplam) || 0) - ((alis && alis.toplam) || 0) - ((gider && gider.toplam) || 0),
                            odemeYontemleri: odeme && odeme[0] ? odeme[0] : { nakit: 0, havale: 0, pos: 0, borc: 0 },
                            gunlukSatislar: gunlukSatislar || []
                        });
                    });
                });
            });
        });
    });
});

// ============ ÖDEME RAPORU ============
app.get('/api/odeme-rapor', auth, (req, res) => {
    const { baslangic, bitis } = req.query;
    db.all(`SELECT 
    SUM(nakit) as nakit, 
    SUM(havale) as havale, 
    SUM(pos) as pos, 
    SUM(borc) as borc 
    FROM satis WHERE tarih BETWEEN ? AND ?`, [baslangic, bitis], (err, rows) => {
        res.json(rows || []);
    });
});

// ============ KAR HESAPLAMA ============
app.get('/api/kar', auth, (req, res) => {
    const { baslangic, bitis } = req.query;

    db.all(`SELECT s.*, u.ad as urun_adi FROM satis s JOIN urunler u ON s.urun_id = u.id WHERE s.tarih BETWEEN ? AND ?`, [baslangic, bitis], (err, satislar) => {
        db.all(`SELECT a.*, u.ad as urun_adi FROM alis a JOIN urunler u ON a.urun_id = u.id WHERE a.tarih BETWEEN ? AND ?`, [baslangic, bitis], (err, alislar) => {
            db.all(`SELECT * FROM giderler WHERE tarih BETWEEN ? AND ?`, [baslangic, bitis], (err, giderler) => {

                let toplamSatis = 0;
                let toplamMaliyet = 0;
                let toplamGider = 0;
                let urunBazli = {};

                if (satislar) {
                    for (let i = 0; i < satislar.length; i++) {
                        toplamSatis += satislar[i].toplam_tutar;
                        if (!urunBazli[satislar[i].urun_adi]) urunBazli[satislar[i].urun_adi] = { satis: 0, maliyet: 0, kar: 0, litre: 0 };
                        urunBazli[satislar[i].urun_adi].satis += satislar[i].toplam_tutar;
                        urunBazli[satislar[i].urun_adi].litre += satislar[i].litre;
                    }
                }

                if (alislar) {
                    for (let i = 0; i < alislar.length; i++) {
                        toplamMaliyet += alislar[i].toplam_tutar;
                        if (urunBazli[alislar[i].urun_adi]) {
                            urunBazli[alislar[i].urun_adi].maliyet += alislar[i].toplam_tutar;
                        }
                    }
                }

                if (giderler) {
                    for (let i = 0; i < giderler.length; i++) {
                        toplamGider += giderler[i].miktar;
                    }
                }

                for (let urun in urunBazli) {
                    urunBazli[urun].kar = urunBazli[urun].satis - urunBazli[urun].maliyet;
                    if (urunBazli[urun].litre > 0) {
                        urunBazli[urun].ortalamaSatisFiyati = urunBazli[urun].satis / urunBazli[urun].litre;
                        urunBazli[urun].ortalamaMaliyet = urunBazli[urun].maliyet / urunBazli[urun].litre;
                    }
                }

                res.json({
                    toplamSatis: toplamSatis,
                    toplamMaliyet: toplamMaliyet,
                    toplamGider: toplamGider,
                    toplamKar: toplamSatis - toplamMaliyet - toplamGider,
                    urunBazli: urunBazli
                });
            });
        });
    });
});

app.listen(3000, () => {
    console.log('');
    console.log('🔥 ATAY PETROL SATIŞ TAKİP SİSTEMİ');
    console.log('================================');
    console.log('📍 http://localhost:3000');
    console.log('👤 Admin: atay@gmail.com / Atay2026');
    console.log('👤 İzleyici: izleyici@atay.com / Diamond42');
    console.log('================================');
    console.log('');
});