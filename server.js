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

// TABLOLAR
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

    CREATE TABLE IF NOT EXISTS satis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tarih TEXT,
        urun_id INTEGER,
        litre REAL,
        alis_fiyat REAL,
        satis_fiyat REAL,
        kar REAL,
        saat TEXT
    );

    CREATE TABLE IF NOT EXISTS gun_sonu (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tarih TEXT UNIQUE,
        nakit REAL DEFAULT 0,
        havale REAL DEFAULT 0,
        pos REAL DEFAULT 0,
        borc REAL DEFAULT 0,
        toplam REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS borc (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tarih TEXT,
        musteri_adi TEXT,
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
    db.prepare(`INSERT OR IGNORE INTO urunler (ad) VALUES (?)`).run(urunler[i]);
}

// Hesaplar
const hash1 = bcrypt.hashSync('Atay2026', 10);
const hash2 = bcrypt.hashSync('Diamond42', 10);
db.prepare(`INSERT OR IGNORE INTO kullanicilar (email, sifre, adsoyad, yetki) VALUES (?, ?, ?, ?)`).run('atay@gmail.com', hash1, 'Burhan Atay', 'admin');
db.prepare(`INSERT OR IGNORE INTO kullanicilar (email, sifre, adsoyad, yetki) VALUES (?, ?, ?, ?)`).run('izleyici@atay.com', hash2, 'İzleyici', 'user');

// MIDDLEWARE
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
    if (req.user.yetki !== 'admin') return res.status(403).json({ hata: 'Admin yetkisi gerekir' });
    next();
}

// GİRİŞ
app.post('/api/login', (req, res) => {
    const { email, sifre } = req.body;
    const user = db.prepare(`SELECT * FROM kullanicilar WHERE email = ? AND aktif = 1`).get(email);
    if (!user) return res.status(401).json({ hata: 'Kullanıcı bulunamadı' });
    if (!bcrypt.compareSync(sifre, user.sifre)) return res.status(401).json({ hata: 'Şifre hatalı' });

    const token = jwt.sign({ id: user.id, email: user.email, yetki: user.yetki }, SECRET_KEY, { expiresIn: '7d' });
    const ip = req.clientIp || req.ip || '127.0.0.1';
    db.prepare(`INSERT INTO login_log (email, ip, giris_zamani) VALUES (?, ?, ?)`).run(email, ip, new Date().toISOString());

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

// LOGLAR
app.get('/api/loglar', auth, adminOnly, (req, res) => {
    res.json(db.prepare(`SELECT * FROM login_log ORDER BY id DESC LIMIT 200`).all());
});

// KULLANICILAR
app.get('/api/kullanicilar', auth, adminOnly, (req, res) => {
    res.json(db.prepare(`SELECT id, email, adsoyad, yetki, aktif FROM kullanicilar`).all());
});

app.post('/api/kullanici', auth, adminOnly, (req, res) => {
    const { email, sifre, adsoyad, yetki } = req.body;
    try {
        const info = db.prepare(`INSERT INTO kullanicilar (email, sifre, adsoyad, yetki) VALUES (?, ?, ?, ?)`).run(email, bcrypt.hashSync(sifre, 10), adsoyad, yetki || 'user');
        res.json({ mesaj: 'Kullanıcı eklendi', id: info.lastInsertRowid });
    } catch (err) {
        res.status(400).json({ hata: 'Email mevcut' });
    }
});

app.put('/api/kullanici/:id', auth, adminOnly, (req, res) => {
    const { adsoyad, yetki, aktif } = req.body;
    db.prepare(`UPDATE kullanicilar SET adsoyad = ?, yetki = ?, aktif = ? WHERE id = ?`).run(adsoyad, yetki, aktif, req.params.id);
    res.json({ mesaj: 'Kullanıcı güncellendi' });
});

app.delete('/api/kullanici/:id', auth, adminOnly, (req, res) => {
    db.prepare(`DELETE FROM kullanicilar WHERE id = ?`).run(req.params.id);
    res.json({ mesaj: 'Kullanıcı silindi' });
});

// ÜRÜNLER
app.get('/api/urunler', auth, (req, res) => {
    res.json(db.prepare(`SELECT * FROM urunler`).all());
});

// SATIŞ
app.post('/api/satis', auth, adminOnly, (req, res) => {
    const { tarih, urun_id, litre, alis_fiyat, satis_fiyat, saat } = req.body;
    const kar = litre * (satis_fiyat - alis_fiyat);
    const info = db.prepare(`INSERT INTO satis (tarih, urun_id, litre, alis_fiyat, satis_fiyat, kar, saat) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(tarih, urun_id, litre, alis_fiyat, satis_fiyat, kar, saat || new Date().toLocaleTimeString('tr-TR'));
    res.json({ id: info.lastInsertRowid, mesaj: 'Satış eklendi', kar: kar });
});

app.get('/api/satis', auth, (req, res) => {
    const rows = db.prepare(`SELECT satis.*, urunler.ad as urun_adi FROM satis JOIN urunler ON satis.urun_id = urunler.id ORDER BY tarih DESC, saat DESC`).all();
    res.json(rows);
});

app.get('/api/satis/tarih', auth, (req, res) => {
    const { tarih } = req.query;
    const rows = db.prepare(`SELECT satis.*, urunler.ad as urun_adi FROM satis JOIN urunler ON satis.urun_id = urunler.id WHERE satis.tarih = ? ORDER BY saat DESC`).all(tarih);
    res.json(rows);
});

app.delete('/api/satis/:id', auth, adminOnly, (req, res) => {
    db.prepare(`DELETE FROM satis WHERE id = ?`).run(req.params.id);
    res.json({ mesaj: 'Satış silindi' });
});

// GÜN SONU
app.post('/api/gun-sonu', auth, adminOnly, (req, res) => {
    const { tarih, nakit, havale, pos, borc } = req.body;
    const toplam = nakit + havale + pos + borc;
    db.prepare(`INSERT OR REPLACE INTO gun_sonu (tarih, nakit, havale, pos, borc, toplam) VALUES (?, ?, ?, ?, ?, ?)`).run(tarih, nakit, havale, pos, borc, toplam);
    res.json({ mesaj: 'Gün sonu kaydedildi' });
});

app.get('/api/gun-sonu', auth, (req, res) => {
    res.json(db.prepare(`SELECT * FROM gun_sonu ORDER BY tarih DESC`).all());
});

app.get('/api/gun-sonu/tarih', auth, (req, res) => {
    const { tarih } = req.query;
    const row = db.prepare(`SELECT * FROM gun_sonu WHERE tarih = ?`).get(tarih);
    res.json(row || { nakit: 0, havale: 0, pos: 0, borc: 0, toplam: 0 });
});

// DASHBOARD İSTATİSTİK
app.get('/api/istatistik', auth, (req, res) => {
    const gun = new Date().toISOString().slice(0, 10);
    const { tarih } = req.query;
    const secilenTarih = tarih || gun;

    const gunlukSatis = db.prepare(`SELECT SUM(litre * satis_fiyat) as satis, SUM(litre * alis_fiyat) as alis, SUM(kar) as kar FROM satis WHERE tarih = ?`).get(secilenTarih);
    const gunSonu = db.prepare(`SELECT * FROM gun_sonu WHERE tarih = ?`).get(secilenTarih);

    res.json({
        tarih: secilenTarih,
        toplamSatis: gunlukSatis ? gunlukSatis.satis : 0,
        toplamAlis: gunlukSatis ? gunlukSatis.alis : 0,
        toplamKar: gunlukSatis ? gunlukSatis.kar : 0,
        nakit: gunSonu ? gunSonu.nakit : 0,
        havale: gunSonu ? gunSonu.havale : 0,
        pos: gunSonu ? gunSonu.pos : 0,
        borc: gunSonu ? gunSonu.borc : 0,
        tahsilat: gunSonu ? gunSonu.toplam : 0
    });
});

// ÖDEME RAPORU (Grafik için)
app.get('/api/odeme-rapor', auth, (req, res) => {
    const rows = db.prepare(`SELECT SUM(nakit) as nakit, SUM(havale) as havale, SUM(pos) as pos, SUM(borc) as borc FROM gun_sonu`).get();
    res.json(rows ? [rows] : [{ nakit: 0, havale: 0, pos: 0, borc: 0 }]);
});

// BORÇ
app.post('/api/borc', auth, adminOnly, (req, res) => {
    const { tarih, musteri_adi, miktar_tl, aciklama } = req.body;
    const info = db.prepare(`INSERT INTO borc (tarih, musteri_adi, miktar_tl, kalan_tl, aciklama) VALUES (?, ?, ?, ?, ?)`).run(tarih, musteri_adi, miktar_tl, miktar_tl, aciklama || '');
    res.json({ id: info.lastInsertRowid, mesaj: 'Borç eklendi' });
});

app.get('/api/borc', auth, (req, res) => {
    res.json(db.prepare(`SELECT * FROM borc WHERE kalan_tl > 0 ORDER BY tarih DESC`).all());
});

app.put('/api/borc/:id', auth, adminOnly, (req, res) => {
    const { musteri_adi, miktar_tl, aciklama } = req.body;
    db.prepare(`UPDATE borc SET musteri_adi = ?, miktar_tl = ?, kalan_tl = ?, aciklama = ? WHERE id = ?`).run(musteri_adi, miktar_tl, miktar_tl, aciklama, req.params.id);
    res.json({ mesaj: 'Borç güncellendi' });
});

app.delete('/api/borc/:id', auth, adminOnly, (req, res) => {
    db.prepare(`DELETE FROM borc WHERE id = ?`).run(req.params.id);
    res.json({ mesaj: 'Borç silindi' });
});

// TAHSİLAT
app.post('/api/tahsilat', auth, adminOnly, (req, res) => {
    const { tarih, borc_id, miktar, odeme_yontemi } = req.body;
    db.prepare(`INSERT INTO tahsilat (tarih, borc_id, miktar, odeme_yontemi) VALUES (?, ?, ?, ?)`).run(tarih, borc_id, miktar, odeme_yontemi);
    db.prepare(`UPDATE borc SET kalan_tl = kalan_tl - ? WHERE id = ?`).run(miktar, borc_id);
    res.json({ mesaj: 'Tahsilat eklendi' });
});

app.get('/api/tahsilat', auth, (req, res) => {
    res.json(db.prepare(`SELECT tahsilat.*, borc.musteri_adi FROM tahsilat JOIN borc ON tahsilat.borc_id = borc.id ORDER BY tarih DESC`).all());
});

// GİDER
app.post('/api/gider', auth, adminOnly, (req, res) => {
    const { tarih, kategori, aciklama, miktar } = req.body;
    const info = db.prepare(`INSERT INTO giderler (tarih, kategori, aciklama, miktar) VALUES (?, ?, ?, ?)`).run(tarih, kategori, aciklama, miktar);
    res.json({ id: info.lastInsertRowid, mesaj: 'Gider eklendi' });
});

app.get('/api/giderler', auth, (req, res) => {
    res.json(db.prepare(`SELECT * FROM giderler ORDER BY tarih DESC`).all());
});

app.delete('/api/gider/:id', auth, adminOnly, (req, res) => {
    db.prepare(`DELETE FROM giderler WHERE id = ?`).run(req.params.id);
    res.json({ mesaj: 'Gider silindi' });
});

app.listen(3000, () => {
    console.log('🔥 ATAY PETROL çalışıyor: http://localhost:3000');
    console.log('👤 Admin: atay@gmail.com / Atay2026');
    console.log('👤 İzleyici: izleyici@atay.com / Diamond42');
});