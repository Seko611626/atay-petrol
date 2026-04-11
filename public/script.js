// Ortak API çağrıları
async function apiCall(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers }
    });
    if (response.status === 401) {
        window.location.href = '/index.html';
        return null;
    }
    return response.json();
}

// Oturum kontrolü
async function checkAuth() {
    const user = await apiCall('/api/me');
    if (!user && !window.location.pathname.includes('index.html')) {
        window.location.href = '/index.html';
    }
    return user;
}

// Logout
async function logout() {
    await apiCall('/api/logout', { method: 'POST' });
    window.location.href = '/index.html';
}

// Format para
function formatMoney(amount) {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
}

// Format tarih
function getToday() {
    return new Date().toISOString().split('T')[0];
}

// Ürünleri getir
async function getUrunler() {
    return await apiCall('/api/urunler');
}