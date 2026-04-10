// ========== ATAY PETROL - ORTAK JAVASCRIPT FONKSİYONLARI ==========

// Kullanıcı bilgileri
let currentUser = {
    email: '',
    yetki: '',
    adsoyad: ''
};

// Sayfa yüklendiğinde çalışacak ortak fonksiyonlar
document.addEventListener('DOMContentLoaded', function() {
    // Çıkış butonu
    var cikisBtn = document.getElementById('cikisBtn');
    if (cikisBtn) {
        cikisBtn.addEventListener('click', async function() {
            var res = await fetch('/api/logout', { method: 'POST' });
            if (res.ok) {
                showToast('Çıkış yapıldı', 'success');
                setTimeout(function() {
                    window.location.href = '/';
                }, 500);
            }
        });
    }

    // Kullanıcı bilgilerini al
    loadCurrentUser();
});

// Mevcut kullanıcı bilgilerini yükle
async function loadCurrentUser() {
    try {
        var res = await fetch('/api/me');
        if (res.ok) {
            currentUser = await res.json();
        }
    } catch (e) {
        console.error('Kullanıcı bilgisi alınamadı');
    }
    return currentUser;
}

// Bugünün tarihini input'a set et
function setTodayDate(inputId) {
    var input = document.getElementById(inputId);
    if (input && !input.value) {
        var today = new Date().toISOString().slice(0, 10);
        input.value = today;
    }
}

// Tarihi formatla (YYYY-MM-DD -> DD.MM.YYYY)
function formatDate(dateString) {
    if (!dateString) return '-';
    var parts = dateString.split('-');
    if (parts.length === 3) {
        return parts[2] + '.' + parts[1] + '.' + parts[0];
    }
    return dateString;
}

// Para formatla (TL)
function formatMoney(amount) {
    if (amount === undefined || amount === null) amount = 0;
    return amount.toLocaleString('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + ' ₺';
}

// Litre formatla
function formatLiter(litre) {
    if (litre === undefined || litre === null) litre = 0;
    return litre.toLocaleString('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + ' L';
}

// Sayı formatla
function formatNumber(number) {
    if (number === undefined || number === null) number = 0;
    return number.toLocaleString('tr-TR');
}

// Toast mesajı göster
function showToast(message, type) {
    // Eski toastları temizle
    var oldToasts = document.querySelectorAll('.toast-notify');
    for (var i = 0; i < oldToasts.length; i++) {
        oldToasts[i].remove();
    }

    var toast = document.createElement('div');
    var icon = '';
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '❌';
    else if (type === 'warning') icon = '⚠️';
    else icon = 'ℹ️';

    toast.className = 'fixed bottom-4 right-4 px-5 py-3 rounded-xl shadow-lg toast-notify z-[9999] flex items-center gap-2 font-medium';

    if (type === 'success') toast.classList.add('bg-green-500', 'text-white');
    else if (type === 'error') toast.classList.add('bg-red-500', 'text-white');
    else if (type === 'warning') toast.classList.add('bg-yellow-500', 'text-white');
    else toast.classList.add('bg-blue-500', 'text-white');

    toast.innerHTML = icon + ' ' + message;
    document.body.appendChild(toast);

    setTimeout(function() {
        toast.style.animation = 'slideInRight 0.3s ease-out reverse';
        setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
}

// Loading göster
function showLoading(containerId) {
    var container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = '<div class="flex justify-center items-center py-8"><div class="spinner"></div><span class="ml-3 text-gray-500">Yükleniyor...</span></div>';
    }
}

// Confirm dialog
function showConfirm(message, onConfirm) {
    if (confirm(message)) {
        onConfirm();
    }
}

// Excel export
function exportToExcel(data, filename) {
    if (!data || data.length === 0) {
        showToast('Veri yok', 'warning');
        return;
    }

    var csv = '';
    // Headers
    var headers = Object.keys(data[0]);
    csv += headers.join(',') + '\n';
    // Rows
    for (var i = 0; i < data.length; i++) {
        var row = data[i];
        var values = [];
        for (var j = 0; j < headers.length; j++) {
            var val = row[headers[j]];
            if (val === undefined || val === null) val = '';
            if (typeof val === 'string' && (val.indexOf(',') !== -1 || val.indexOf('"') !== -1)) {
                val = '"' + val.replace(/"/g, '""') + '"';
            }
            values.push(val);
        }
        csv += values.join(',') + '\n';
    }

    var blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    var url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', filename + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Dosya indiriliyor', 'success');
}

// Admin kontrolü
function isAdmin() {
    return currentUser.yetki === 'admin';
}

// Sayfa yenileme
function refreshPage() {
    window.location.reload();
}

// Scroll to top
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Rastgele renk üret
function getRandomColor() {
    var letters = '0123456789ABCDEF';
    var color = '#';
    for (var i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// Bugünün tarihini al
function getToday() {
    return new Date().toISOString().slice(0, 10);
}

// Ayın ilk günü
function getFirstDayOfMonth() {
    var today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
}

// Yüzde hesapla
function calculatePercentage(value, total) {
    if (!total || total === 0) return 0;
    return (value / total) * 100;
}

// Telefon formatla
function formatPhone(phone) {
    if (!phone) return '';
    var cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
        return '0' + cleaned.slice(0, 3) + ' ' + cleaned.slice(3, 6) + ' ' + cleaned.slice(6, 10);
    }
    if (cleaned.length === 11) {
        return cleaned.slice(0, 4) + ' ' + cleaned.slice(4, 7) + ' ' + cleaned.slice(7, 11);
    }
    return phone;
}

// Sayfa başlığını güncelle
function updatePageTitle(title) {
    document.title = title + ' | Atay Petrol';
}

// Scroll butonu ekle
function addScrollTopButton() {
    var btn = document.createElement('button');
    btn.innerHTML = '⬆️';
    btn.className = 'fixed bottom-6 right-6 bg-[#0A2F6C] text-white w-12 h-12 rounded-full shadow-lg hover:bg-[#1E4D8C] transition-all hover:scale-110 z-50 hidden';
    btn.id = 'scrollTopBtn';
    document.body.appendChild(btn);

    window.addEventListener('scroll', function() {
        if (window.scrollY > 300) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    });

    btn.addEventListener('click', scrollToTop);
}

// Sayfa yüklendiğinde scroll butonunu ekle
document.addEventListener('DOMContentLoaded', function() {
    addScrollTopButton();
});