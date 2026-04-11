const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'atay-petrol-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 saat
}));

// Veritabanı
const db = new sqlite3.Database('./atay-petrol.db');

// Yetki kontrol middleware
function isLoggedIn(req, res, next) {
    if (req.session.user) return next();
    res.status(401).json({ error: 'Oturum açmanız gerekiyor' });
}

function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.rol === 'admin') return next();
    res.status(403).json({ error: 'Admin yetkisi gerekli' });
}

// Tabloları oluştur
db.serialize(() => {
    // Kullanıcılar
    db.run(`CREATE TABLE IF NOT EXISTS kullanicilar (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        sifre TEXT,
        rol TEXT,
        ad_soyad TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Login logları
    db.run(`CREATE TABLE IF NOT EXISTS login_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT,
        ip TEXT,
        zaman DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Ürünler
    db.run(`CREATE TABLE IF NOT EXISTS urunler (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ad TEXT UNIQUE,
        stok REAL DEFAULT 0,
        birim_fiyat REAL
    )`);

    // Alış
    db.run(`CREATE TABLE IF NOT EXISTS alis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tarih TEXT,
        urun_id INTEGER,
        litre REAL,
        fiyat REAL,
        tedarikci TEXT,
        FOREIGN KEY(urun_id) REFERENCES urunler(id)
    )`);

    // Satış
    db.run(`CREATE TABLE IF NOT EXISTS satis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tarih TEXT,
        urun_id INTEGER,
        litre REAL,
        fiyat REAL,
        FOREIGN KEY(urun_id) REFERENCES urunler(id)
    )`);

    // Borç
    db.run(`CREATE TABLE IF NOT EXISTS borc (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        musteri TEXT,
        urun TEXT,
        tutar REAL,
        kalan REAL,
        aciklama TEXT,
        tarih TEXT,
        durum TEXT DEFAULT 'devam'
    )`);

    // Tahsilat
    db.run(`CREATE TABLE IF NOT EXISTS tahsilat (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        borc_id INTEGER,
        miktar REAL,
        odeme_turu TEXT,
        tarih TEXT,
        FOREIGN KEY(borc_id) REFERENCES borc(id)
    )`);

    // Giderler
    db.run(`CREATE TABLE IF NOT EXISTS giderler (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kategori TEXT,
        aciklama TEXT,
        miktar REAL,
        tarih TEXT
    )`);

    // Gün sonu ödemeleri
    db.run(`CREATE TABLE IF NOT EXISTS gun_sonu (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tarih TEXT UNIQUE,
        nakit REAL DEFAULT 0,
        havale REAL DEFAULT 0,
        pos REAL DEFAULT 0,
        borc REAL DEFAULT 0
    )`);

    // Varsayılan ürünler
    db.run(`INSERT OR IGNORE INTO urunler (id, ad, stok, birim_fiyat) VALUES 
        (1, 'Motorin', 5000, 43.50),
        (2, 'Benzin', 3000, 45.00),
        (3, 'LPG', 2000, 22.50)`);

    // Varsayılan admin kullanıcısı
    const hashedPassword = bcrypt.hashSync('Atay2026', 10);
    db.run(`INSERT OR IGNORE INTO kullanicilar (email, sifre, rol, ad_soyad) VALUES 
        ('atay@gmail.com', ?, 'admin', 'Atay Petrol'),
        ('izleyici@atay.com', ?, 'izleyici', 'İzleyici Kullanıcı')`, [hashedPassword, bcrypt.hashSync('Diamond42', 10)]);
});

// ============= API ENDPOINTS =============

// Login
app.post('/api/login', (req, res) => {
    const { email, sifre, ip } = req.body;
    db.get('SELECT * FROM kullanicilar WHERE email = ?', [email], (err, user) => {
        if (err || !user) {
            res.status(401).json({ error: 'Kullanıcı bulunamadı' });
            return;
        }
        if (bcrypt.compareSync(sifre, user.sifre)) {
            req.session.user = { id: user.id, email: user.email, rol: user.rol, ad_soyad: user.ad_soyad };
            db.run('INSERT INTO login_log (email, ip) VALUES (?, ?)', [email, ip]);
            res.json({ success: true, rol: user.rol });
        } else {
            res.status(401).json({ error: 'Şifre hatalı' });
        }
    });
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Mevcut kullanıcı
app.get('/api/me', isLoggedIn, (req, res) => {
    res.json(req.session.user);
});

// Ürünler
app.get('/api/urunler', isLoggedIn, (req, res) => {
    db.all('SELECT * FROM urunler', [], (err, rows) => {
        res.json(rows);
    });
});

// Satış Ekle
app.post('/api/satis', isAdmin, (req, res) => {
    const { tarih, urun_id, litre, fiyat } = req.body;
    db.run('INSERT INTO satis (tarih, urun_id, litre, fiyat) VALUES (?, ?, ?, ?)', [tarih, urun_id, litre, fiyat], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        // Stok düş
        db.run('UPDATE urunler SET stok = stok - ? WHERE id = ?', [litre, urun_id]);
        res.json({ id: this.lastID });
    });
});

// Satış Listesi
app.get('/api/satis', isLoggedIn, (req, res) => {
    const { tarih } = req.query;
    let query = `SELECT s.*, u.ad as urun_adi FROM satis s JOIN urunler u ON s.urun_id = u.id`;
    if (tarih) query += ` WHERE s.tarih = '${tarih}'`;
    query += ` ORDER BY s.id DESC`;
    db.all(query, [], (err, rows) => {
        res.json(rows);
    });
});

// Satış Sil
app.delete('/api/satis/:id', isAdmin, (req, res) => {
    db.get('SELECT litre, urun_id FROM satis WHERE id = ?', [req.params.id], (err, satis) => {
        if (satis) {
            db.run('UPDATE urunler SET stok = stok + ? WHERE id = ?', [satis.litre, satis.urun_id]);
            db.run('DELETE FROM satis WHERE id = ?', [req.params.id], () => {
                res.json({ success: true });
            });
        }
    });
});

// Alış Ekle
app.post('/api/alis', isAdmin, (req, res) => {
    const { tarih, urun_id, litre, fiyat, tedarikci } = req.body;
    db.run('INSERT INTO alis (tarih, urun_id, litre, fiyat, tedarikci) VALUES (?, ?, ?, ?, ?)', [tarih, urun_id, litre, fiyat, tedarikci], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        db.run('UPDATE urunler SET stok = stok + ? WHERE id = ?', [litre, urun_id]);
        res.json({ id: this.lastID });
    });
});

// Alış Listesi
app.get('/api/alis', isLoggedIn, (req, res) => {
    const { tarih } = req.query;
    let query = `SELECT a.*, u.ad as urun_adi FROM alis a JOIN urunler u ON a.urun_id = u.id`;
    if (tarih) query += ` WHERE a.tarih = '${tarih}'`;
    query += ` ORDER BY a.id DESC`;
    db.all(query, [], (err, rows) => {
        res.json(rows);
    });
});

// Alış Sil
app.delete('/api/alis/:id', isAdmin, (req, res) => {
    db.get('SELECT litre, urun_id FROM alis WHERE id = ?', [req.params.id], (err, alis) => {
        if (alis) {
            db.run('UPDATE urunler SET stok = stok - ? WHERE id = ?', [alis.litre, alis.urun_id]);
            db.run('DELETE FROM alis WHERE id = ?', [req.params.id], () => {
                res.json({ success: true });
            });
        }
    });
});

// Borç Ekle
app.post('/api/borc', isAdmin, (req, res) => {
    const { musteri, urun, tutar, aciklama, tarih } = req.body;
    db.run('INSERT INTO borc (musteri, urun, tutar, kalan, aciklama, tarih) VALUES (?, ?, ?, ?, ?, ?)', [musteri, urun, tutar, tutar, aciklama, tarih], function(err) {
        res.json({ id: this.lastID });
    });
});

// Borç Listesi
app.get('/api/borc', isLoggedIn, (req, res) => {
    db.all('SELECT * FROM borc WHERE kalan > 0 ORDER BY id DESC', [], (err, rows) => {
        res.json(rows);
    });
});

// Borç Sil
app.delete('/api/borc/:id', isAdmin, (req, res) => {
    db.run('DELETE FROM borc WHERE id = ?', [req.params.id], () => {
        res.json({ success: true });
    });
});

// Tahsilat Ekle
app.post('/api/tahsilat', isAdmin, (req, res) => {
    const { borc_id, miktar, odeme_turu, tarih } = req.body;
    db.run('INSERT INTO tahsilat (borc_id, miktar, odeme_turu, tarih) VALUES (?, ?, ?, ?)', [borc_id, miktar, odeme_turu, tarih], function(err) {
        db.run('UPDATE borc SET kalan = kalan - ? WHERE id = ?', [miktar, borc_id]);
        res.json({ id: this.lastID });
    });
});

// Gider Ekle
app.post('/api/gider', isAdmin, (req, res) => {
    const { kategori, aciklama, miktar, tarih } = req.body;
    db.run('INSERT INTO giderler (kategori, aciklama, miktar, tarih) VALUES (?, ?, ?, ?)', [kategori, aciklama, miktar, tarih], function(err) {
        res.json({ id: this.lastID });
    });
});

// Gider Listesi
app.get('/api/gider', isLoggedIn, (req, res) => {
    const { tarih } = req.query;
    let query = 'SELECT * FROM giderler';
    if (tarih) query += ` WHERE tarih = '${tarih}'`;
    query += ` ORDER BY id DESC`;
    db.all(query, [], (err, rows) => {
        res.json(rows);
    });
});

// Gider Sil
app.delete('/api/gider/:id', isAdmin, (req, res) => {
    db.run('DELETE FROM giderler WHERE id = ?', [req.params.id], () => {
        res.json({ success: true });
    });
});

// Gün Sonu Ödemeleri
app.post('/api/gun-sonu', isAdmin, (req, res) => {
    const { tarih, nakit, havale, pos, borc } = req.body;
    db.run(`INSERT OR REPLACE INTO gun_sonu (tarih, nakit, havale, pos, borc) VALUES (?, ?, ?, ?, ?)`, [tarih, nakit, havale, pos, borc], () => {
        res.json({ success: true });
    });
});

app.get('/api/gun-sonu', isLoggedIn, (req, res) => {
    const { tarih } = req.query;
    db.get('SELECT * FROM gun_sonu WHERE tarih = ?', [tarih], (err, row) => {
        res.json(row || { nakit: 0, havale: 0, pos: 0, borc: 0 });
    });
});

// Dashboard İstatistik
app.get('/api/istatistik', isLoggedIn, (req, res) => {
    const { tarih } = req.query;
    const bugun = tarih || new Date().toISOString().split('T')[0];

    db.get(`SELECT COALESCE(SUM(litre * fiyat), 0) as bugun_satis FROM satis WHERE tarih = ?`, [bugun], (err, satis) => {
        db.get(`SELECT COALESCE(SUM(litre * fiyat), 0) as aylik_satis FROM satis WHERE strftime('%Y-%m', tarih) = strftime('%Y-%m', date('now'))`, [], (err, aylik) => {
            db.get(`SELECT COALESCE(SUM(miktar), 0) as bugun_gider FROM giderler WHERE tarih = ?`, [bugun], (err, gider) => {
                db.get(`SELECT COALESCE(SUM(tutar), 0) as toplam_borc FROM borc WHERE kalan > 0`, [], (err, borc) => {
                    db.all(`SELECT u.ad, u.stok FROM urunler u`, [], (err, stoklar) => {
                        res.json({
                            bugun_satis: satis.bugun_satis || 0,
                            aylik_satis: aylik.aylik_satis || 0,
                            bugun_gider: gider.bugun_gider || 0,
                            toplam_borc: borc.toplam_borc || 0,
                            stoklar: stoklar
                        });
                    });
                });
            });
        });
    });
});

// Ödeme Dağılımı Grafiği
app.get('/api/odeme-rapor', isLoggedIn, (req, res) => {
    const { tarih } = req.query;
    db.get('SELECT nakit, havale, pos, borc FROM gun_sonu WHERE tarih = ?', [tarih], (err, row) => {
        if (row) res.json(row);
        else res.json({ nakit: 0, havale: 0, pos: 0, borc: 0 });
    });
});

// Tüm Rapor
app.get('/api/rapor/tum', isLoggedIn, (req, res) => {
    db.all('SELECT * FROM satis ORDER BY id DESC LIMIT 100', [], (err, satislar) => {
        db.all('SELECT * FROM alis ORDER BY id DESC LIMIT 100', [], (err, alislar) => {
            db.all('SELECT * FROM borc ORDER BY id DESC LIMIT 100', [], (err, borclar) => {
                db.all('SELECT * FROM giderler ORDER BY id DESC LIMIT 100', [], (err, giderler) => {
                    res.json({ satislar, alislar, borclar, giderler });
                });
            });
        });
    });
});

// Kullanıcı Yönetimi (Admin)
app.get('/api/kullanicilar', isAdmin, (req, res) => {
    db.all('SELECT id, email, rol, ad_soyad, created_at FROM kullanicilar', [], (err, rows) => {
        res.json(rows);
    });
});

app.post('/api/kullanicilar', isAdmin, (req, res) => {
    const { email, sifre, rol, ad_soyad } = req.body;
    const hashed = bcrypt.hashSync(sifre, 10);
    db.run('INSERT INTO kullanicilar (email, sifre, rol, ad_soyad) VALUES (?, ?, ?, ?)', [email, hashed, rol, ad_soyad], function(err) {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ id: this.lastID });
    });
});

app.put('/api/kullanicilar/:id', isAdmin, (req, res) => {
    const { email, rol, ad_soyad } = req.body;
    db.run('UPDATE kullanicilar SET email = ?, rol = ?, ad_soyad = ? WHERE id = ?', [email, rol, ad_soyad, req.params.id], () => {
        res.json({ success: true });
    });
});

app.delete('/api/kullanicilar/:id', isAdmin, (req, res) => {
    db.run('DELETE FROM kullanicilar WHERE id = ? AND rol != "admin"', [req.params.id], () => {
        res.json({ success: true });
    });
});

// Loglar (Admin)
app.get('/api/loglar', isAdmin, (req, res) => {
    db.all('SELECT * FROM login_log ORDER BY zaman DESC LIMIT 100', [], (err, rows) => {
        res.json(rows);
    });
});

// Excel Export (CSV)
app.get('/api/export/:tablo', isLoggedIn, (req, res) => {
    const tablo = req.params.tablo;
    db.all(`SELECT * FROM ${tablo}`, [], (err, rows) => {
        res.json(rows);
    });
});

app.listen(PORT, () => {
    console.log(`🚀 ATAY PETROL SİSTEMİ çalışıyor: http://localhost:${PORT}`);
});