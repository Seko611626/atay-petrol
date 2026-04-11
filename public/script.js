// Atay Petrol - Ortak Fonksiyonlar

function formatMoney(amount) {
    if (amount === undefined || amount === null) amount = 0;
    return amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
}

function formatLiter(litre) {
    if (litre === undefined || litre === null) litre = 0;
    return litre.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' L';
}

function formatDate(dateString) {
    if (!dateString) return '-';
    let parts = dateString.split('-');
    if (parts.length === 3) {
        return parts[2] + '.' + parts[1] + '.' + parts[0];
    }
    return dateString;
}

function showToast(message, type) {
    alert(message);
}

function setTodayDate(inputId) {
    let input = document.getElementById(inputId);
    if (input && !input.value) {
        input.value = new Date().toISOString().slice(0, 10);
    }
}