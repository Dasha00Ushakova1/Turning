'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const user = requireAuth();
    if (!user) return;

    document.getElementById('user-name').textContent = user.fullName;
    document.getElementById('back-to-catalog')
        .addEventListener('click', () => window.location.href = 'catalog.html');

    const orders = store.getOrders();
    const body = document.getElementById('orders-body');
    const empty = document.getElementById('orders-empty');

    if (orders.length === 0) {
        empty.hidden = false;
        return;
    }

    orders.forEach(o => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${o.code}</td>
            <td>${o.date}</td>
            <td>${o.productName} — ${o.size}, ${o.quantity} шт.</td>
            <td>${formatPrice(o.total)}</td>
        `;
        body.appendChild(tr);
    });
});
