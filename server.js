const express = require('express');
const Database = require('better-sqlite3');
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

const db = new Database('./database.sqlite');

// ============ TABLOLAR ============
db.exec(`
    CREATE TABLE IF NOT EXISTS kullanicilar (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        sifre TEXT,
        adsoyad TEXT,
        yetki TEXT DEFAULT 'user',
        aktif INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS login_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT,
        ip TEXT,
        giris_zamani TEXT
    );

    CREATE TABLE IF NOT EXISTS urunler (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ad TEXT UNIQUE
    );

    CREATE TABLE IF NOT EXISTS alis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tarih TEXT,
        urun_id INTEGER,
        litre REAL,
        birim_fiyat REAL,
        toplam_tutar REAL,
        tedarikci TEXT
    );

    CREATE TABLE IF NOT EXISTS satis (
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
    );

    CREATE TABLE IF NOT EXISTS borc (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tarih TEXT,
        musteri_adi TEXT,
        urun_id INTEGER,
        miktar_tl REAL,
        kalan_tl REAL,
        aciklama TEXT
    );

    CREATE TABLE IF NOT EXISTS tahsilat (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tarih TEXT,
        borc_id INTEGER,
        miktar REAL,
        odeme_yontemi TEXT
    );

    CREATE TABLE IF NOT EXISTS giderler (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tarih TEXT,
        kategori TEXT,
        aciklama TEXT,
        miktar REAL
    );
`);

// Ürünleri ekle
const urunler = ['Motorin', 'Benzin', 'LPG'];
for (let i = 0; i < urunler.length; i++) {
    const stmt = db.prepare(`INSERT OR IGNORE INTO urunler (ad) VALUES (?)`);
    stmt.run(urunler[i]);
}

// Hesaplar
const hash1 = bcrypt.hashSync('Atay2026', 10);
const hash2 = bcrypt.hashSync('Diamond42', 10);
const insertUser = db.prepare(`INSERT OR IGNORE INTO kullanicilar (email, sifre, adsoyad, yetki) VALUES (?, ?, ?, ?)`);
insertUser.run('atay@gmail.com', hash1, 'Burhan Atay', 'admin');
insertUser.run('izleyici@atay.com', hash2, 'İzleyici', 'user');

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

    const user = db.prepare(`SELECT * FROM kullanicilar WHERE email = ? AND aktif = 1`).get(email);
    if (!user) return res.status(401).json({ hata: 'Kullanıcı bulunamadı' });
    if (!bcrypt.compareSync(sifre, user.sifre)) return res.status(401).json({ hata: 'Şifre hatalı' });

    const token = jwt.sign({ id: user.id, email: user.email, yetki: user.yetki }, SECRET_KEY, { expiresIn: '7d' });
    const ip = req.clientIp || req.ip || '127.0.0.1';
    const zaman = new Date().toISOString();

    const insertLog = db.prepare(`INSERT INTO login_log (email, ip, giris_zamani) VALUES (?, ?, ?)`);
    insertLog.run(email, ip, zaman);

    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ mesaj: 'Giriş başarılı', yetki: user.yetki });
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
    const rows = db.prepare(`SELECT * FROM login_log ORDER BY id DESC LIMIT 200`).all();
    res.json(rows || []);
});

// ============ KULLANICILAR ============
app.get('/api/kullanicilar', auth, adminOnly, (req, res) => {
    const rows = db.prepare(`SELECT id, email, adsoyad, yetki, aktif FROM kullanicilar`).all();
    res.json(rows || []);
});

app.post('/api/kullanici', auth, adminOnly, (req, res) => {
    const { email, sifre, adsoyad, yetki } = req.body;
    const hash = bcrypt.hashSync(sifre, 10);
    try {
        const stmt = db.prepare(`INSERT INTO kullanicilar (email, sifre, adsoyad, yetki) VALUES (?, ?, ?, ?)`);
        const info = stmt.run(email, hash, adsoyad, yetki || 'user');
        res.json({ mesaj: 'Kullanıcı eklendi', id: info.lastInsertRowid });
    } catch (err) {
        res.status(400).json({ hata: 'Email mevcut' });
    }
});

app.put('/api/kullanici/:id', auth, adminOnly, (req, res) => {
    const { adsoyad, yetki, aktif } = req.body;
    const stmt = db.prepare(`UPDATE kullanicilar SET adsoyad = ?, yetki = ?, aktif = ? WHERE id = ?`);
    stmt.run(adsoyad, yetki, aktif, req.params.id);
    res.json({ mesaj: 'Kullanıcı güncellendi' });
});

app.delete('/api/kullanici/:id', auth, adminOnly, (req, res) => {
    const stmt = db.prepare(`DELETE FROM kullanicilar WHERE id = ?`);
    stmt.run(req.params.id);
    res.json({ mesaj: 'Kullanıcı silindi' });
});

// ============ ÜRÜNLER ============
app.get('/api/urunler', auth, (req, res) => {
    const rows = db.prepare(`SELECT * FROM urunler`).all();
    res.json(rows || []);
});

// ============ ALIŞ ============
app.post('/api/alis', auth, adminOnly, (req, res) => {
    const { tarih, urun_id, litre, birim_fiyat, tedarikci } = req.body;
    const toplam = litre * birim_fiyat;
    const stmt = db.prepare(`INSERT INTO alis (tarih, urun_id, litre, birim_fiyat, toplam_tutar, tedarikci) VALUES (?, ?, ?, ?, ?, ?)`);
    const info = stmt.run(tarih, urun_id, litre, birim_fiyat, toplam, tedarikci || '');
    res.json({ id: info.lastInsertRowid, mesaj: 'Alış eklendi' });
});

app.get('/api/alis', auth, (req, res) => {
    const rows = db.prepare(`SELECT alis.*, urunler.ad as urun_adi FROM alis JOIN urunler ON alis.urun_id = urunler.id ORDER BY tarih DESC`).all();
    res.json(rows || []);
});

app.put('/api/alis/:id', auth, adminOnly, (req, res) => {
    const { tarih, urun_id, litre, birim_fiyat, tedarikci } = req.body;
    const toplam = litre * birim_fiyat;
    const stmt = db.prepare(`UPDATE alis SET tarih = ?, urun_id = ?, litre = ?, birim_fiyat = ?, toplam_tutar = ?, tedarikci = ? WHERE id = ?`);
    stmt.run(tarih, urun_id, litre, birim_fiyat, toplam, tedarikci, req.params.id);
    res.json({ mesaj: 'Alış güncellendi' });
});

app.delete('/api/alis/:id', auth, adminOnly, (req, res) => {
    const stmt = db.prepare(`DELETE FROM alis WHERE id = ?`);
    stmt.run(req.params.id);
    res.json({ mesaj: 'Alış silindi' });
});

// ============ SATIŞ ============
app.post('/api/satis', auth, adminOnly, (req, res) => {
    const { tarih, urun_id, litre, birim_fiyat, nakit, havale, pos, borc } = req.body;
    const toplam = (parseFloat(nakit) || 0) + (parseFloat(havale) || 0) + (parseFloat(pos) || 0) + (parseFloat(borc) || 0);
    const stmt = db.prepare(`INSERT INTO satis (tarih, urun_id, litre, birim_fiyat, toplam_tutar, nakit, havale, pos, borc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const info = stmt.run(tarih, urun_id, litre, birim_fiyat, toplam, nakit || 0, havale || 0, pos || 0, borc || 0);
    res.json({ id: info.lastInsertRowid, mesaj: 'Satış eklendi' });
});

app.get('/api/satis', auth, (req, res) => {
    const rows = db.prepare(`SELECT satis.*, urunler.ad as urun_adi FROM satis JOIN urunler ON satis.urun_id = urunler.id ORDER BY tarih DESC`).all();
    res.json(rows || []);
});

app.put('/api/satis/:id', auth, adminOnly, (req, res) => {
    const { tarih, urun_id, litre, birim_fiyat, nakit, havale, pos, borc } = req.body;
    const toplam = (parseFloat(nakit) || 0) + (parseFloat(havale) || 0) + (parseFloat(pos) || 0) + (parseFloat(borc) || 0);
    const stmt = db.prepare(`UPDATE satis SET tarih = ?, urun_id = ?, litre = ?, birim_fiyat = ?, toplam_tutar = ?, nakit = ?, havale = ?, pos = ?, borc = ? WHERE id = ?`);
    stmt.run(tarih, urun_id, litre, birim_fiyat, toplam, nakit || 0, havale || 0, pos || 0, borc || 0, req.params.id);
    res.json({ mesaj: 'Satış güncellendi' });
});

app.delete('/api/satis/:id', auth, adminOnly, (req, res) => {
    const stmt = db.prepare(`DELETE FROM satis WHERE id = ?`);
    stmt.run(req.params.id);
    res.json({ mesaj: 'Satış silindi' });
});

// ============ BORÇ ============
app.post('/api/borc', auth, adminOnly, (req, res) => {
    const { tarih, musteri_adi, urun_id, miktar_tl, aciklama } = req.body;
    const stmt = db.prepare(`INSERT INTO borc (tarih, musteri_adi, urun_id, miktar_tl, kalan_tl, aciklama) VALUES (?, ?, ?, ?, ?, ?)`);
    const info = stmt.run(tarih, musteri_adi, urun_id, miktar_tl, miktar_tl, aciklama || '');
    res.json({ id: info.lastInsertRowid, mesaj: 'Borç eklendi' });
});

app.get('/api/borc', auth, (req, res) => {
    const rows = db.prepare(`SELECT borc.*, urunler.ad as urun_adi FROM borc JOIN urunler ON borc.urun_id = urunler.id WHERE kalan_tl > 0 ORDER BY tarih DESC`).all();
    res.json(rows || []);
});

app.get('/api/borc/tum', auth, adminOnly, (req, res) => {
    const rows = db.prepare(`SELECT borc.*, urunler.ad as urun_adi FROM borc JOIN urunler ON borc.urun_id = urunler.id ORDER BY tarih DESC`).all();
    res.json(rows || []);
});

app.put('/api/borc/:id', auth, adminOnly, (req, res) => {
    const { musteri_adi, urun_id, miktar_tl, aciklama } = req.body;
    const stmt = db.prepare(`UPDATE borc SET musteri_adi = ?, urun_id = ?, miktar_tl = ?, kalan_tl = ?, aciklama = ? WHERE id = ?`);
    stmt.run(musteri_adi, urun_id, miktar_tl, miktar_tl, aciklama, req.params.id);
    res.json({ mesaj: 'Borç güncellendi' });
});

app.delete('/api/borc/:id', auth, adminOnly, (req, res) => {
    const stmt = db.prepare(`DELETE FROM borc WHERE id = ?`);
    stmt.run(req.params.id);
    res.json({ mesaj: 'Borç silindi' });
});

// ============ TAHSİLAT ============
app.post('/api/tahsilat', auth, adminOnly, (req, res) => {
    const { tarih, borc_id, miktar, odeme_yontemi } = req.body;
    const insertStmt = db.prepare(`INSERT INTO tahsilat (tarih, borc_id, miktar, odeme_yontemi) VALUES (?, ?, ?, ?)`);
    insertStmt.run(tarih, borc_id, miktar, odeme_yontemi);
    
    const updateStmt = db.prepare(`UPDATE borc SET kalan_tl = kalan_tl - ? WHERE id = ?`);
    updateStmt.run(miktar, borc_id);
    
    res.json({ mesaj: 'Tahsilat eklendi' });
});

app.get('/api/tahsilat', auth, (req, res) => {
    const rows = db.prepare(`SELECT tahsilat.*, borc.musteri_adi FROM tahsilat JOIN borc ON tahsilat.borc_id = borc.id ORDER BY tarih DESC`).all();
    res.json(rows || []);
});

// ============ GİDERLER ============
app.post('/api/gider', auth, adminOnly, (req, res) => {
    const { tarih, kategori, aciklama, miktar } = req.body;
    const stmt = db.prepare(`INSERT INTO giderler (tarih, kategori, aciklama, miktar) VALUES (?, ?, ?, ?)`);
    const info = stmt.run(tarih, kategori, aciklama, miktar);
    res.json({ id: info.lastInsertRowid, mesaj: 'Gider eklendi' });
});

app.get('/api/giderler', auth, (req, res) => {
    const rows = db.prepare(`SELECT * FROM giderler ORDER BY tarih DESC`).all();
    res.json(rows || []);
});

app.delete('/api/gider/:id', auth, adminOnly, (req, res) => {
    const stmt = db.prepare(`DELETE FROM giderler WHERE id = ?`);
    stmt.run(req.params.id);
    res.json({ mesaj: 'Gider silindi' });
});

// ============ DASHBOARD İSTATİSTİK ============
app.get('/api/istatistik', auth, (req, res) => {
    const gun = new Date().toISOString().slice(0, 10);
    const ayBaslangic = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-01';

    const bugunAlis = db.prepare(`SELECT SUM(toplam_tutar) as toplam FROM alis WHERE tarih = ?`).get(gun);
    const bugunSatis = db.prepare(`SELECT SUM(toplam_tutar) as toplam FROM satis WHERE tarih = ?`).get(gun);
    const bugunBorc = db.prepare(`SELECT SUM(miktar_tl) as toplam FROM borc WHERE tarih = ?`).get(gun);
    const aylikAlis = db.prepare(`SELECT SUM(toplam_tutar) as toplam FROM alis WHERE tarih >= ?`).get(ayBaslangic);
    const aylikSatis = db.prepare(`SELECT SUM(toplam_tutar) as toplam FROM satis WHERE tarih >= ?`).get(ayBaslangic);

    const alislar = db.prepare(`SELECT urun_id, SUM(litre) as toplam FROM alis GROUP BY urun_id`).all();
    const satislar = db.prepare(`SELECT urun_id, SUM(litre) as toplam FROM satis GROUP BY urun_id`).all();
    const urunlerList = db.prepare(`SELECT id, ad FROM urunler`).all();

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

    const stokListe = [];
    for (let i = 0; i < urunlerList.length; i++) {
        stokListe.push({
            id: urunlerList[i].id,
            ad: urunlerList[i].ad,
            stok: stokMap[urunlerList[i].id] || 0
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

// ============ RAPOR ============
app.get('/api/rapor', auth, (req, res) => {
    const { baslangic, bitis } = req.query;

    const satis = db.prepare(`SELECT SUM(toplam_tutar) as toplam FROM satis WHERE tarih BETWEEN ? AND ?`).get(baslangic, bitis);
    const alis = db.prepare(`SELECT SUM(toplam_tutar) as toplam FROM alis WHERE tarih BETWEEN ? AND ?`).get(baslangic, bitis);
    const gider = db.prepare(`SELECT SUM(miktar) as toplam FROM giderler WHERE tarih BETWEEN ? AND ?`).get(baslangic, bitis);
    const odeme = db.prepare(`SELECT SUM(nakit) as nakit, SUM(havale) as havale, SUM(pos) as pos, SUM(borc) as borc FROM satis WHERE tarih BETWEEN ? AND ?`).get(baslangic, bitis);
    const gunlukSatislar = db.prepare(`SELECT tarih, SUM(toplam_tutar) as toplam FROM satis WHERE tarih BETWEEN ? AND ? GROUP BY tarih ORDER BY tarih`).all(baslangic, bitis);

    res.json({
        toplamSatis: (satis && satis.toplam) ? satis.toplam : 0,
        toplamAlis: (alis && alis.toplam) ? alis.toplam : 0,
        toplamGider: (gider && gider.toplam) ? gider.toplam : 0,
        toplamKar: ((satis && satis.toplam) || 0) - ((alis && alis.toplam) || 0) - ((gider && gider.toplam) || 0),
        odemeYontemleri: odeme ? odeme : { nakit: 0, havale: 0, pos: 0, borc: 0 },
        gunlukSatislar: gunlukSatislar || []
    });
});

// ============ ÖDEME RAPORU ============
app.get('/api/odeme-rapor', auth, (req, res) => {
    const { baslangic, bitis } = req.query;
    const rows = db.prepare(`SELECT SUM(nakit) as nakit, SUM(havale) as havale, SUM(pos) as pos, SUM(borc) as borc FROM satis WHERE tarih BETWEEN ? AND ?`).get(baslangic, bitis);
    res.json(rows ? [rows] : []);
});

// ============ KAR HESAPLAMA ============
app.get('/api/kar', auth, (req, res) => {
    const { baslangic, bitis } = req.query;

    const satislar = db.prepare(`SELECT s.*, u.ad as urun_adi FROM satis s JOIN urunler u ON s.urun_id = u.id WHERE s.tarih BETWEEN ? AND ?`).all(baslangic, bitis);
    const alislar = db.prepare(`SELECT a.*, u.ad as urun_adi FROM alis a JOIN urunler u ON a.urun_id = u.id WHERE a.tarih BETWEEN ? AND ?`).all(baslangic, bitis);
    const giderler = db.prepare(`SELECT * FROM giderler WHERE tarih BETWEEN ? AND ?`).all(baslangic, bitis);

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