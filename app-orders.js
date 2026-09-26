'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const user = requireAuth();
    if (!user) return;

    const roleLabel = { customer: 'Клиент', manager: 'Менеджер', admin: 'Администратор' };
    document.getElementById('user-name').textContent = user.fullName;
    document.getElementById('user-role').textContent = roleLabel[user.role] || '';

    document.getElementById('back-to-catalog')
        .addEventListener('click', () => { window.location.href = 'catalog.html'; });

    const isManager = store.isManager();

    // Заголовок страницы
    document.getElementById('page-title').textContent =
        isManager ? 'Заказы клиентов' : 'Мои заказы';

    // Поиск: у клиента — по товарам, у менеджера/админа — по ФИО клиента
    const searchInput = document.getElementById('orders-search');
    searchInput.placeholder = isManager
        ? 'Поиск по ФИО клиента...'
        : 'Поиск по товару...';

    const body = document.getElementById('orders-body');
    const empty = document.getElementById('orders-empty');

    let db;
    try {
        db = await loadDatabase();
    } catch (error) {
        showModal('Ошибка загрузки', error.message, 'error');
        return;
    }

    /** Возвращает список заказов в зависимости от роли. */
    function visibleOrders() {
        const all = store.getOrders();
        if (isManager) return all;
        return all.filter(o => o.customer === user.fullName);
    }

    function render() {
        const q = searchInput.value.trim().toLowerCase();
        let orders = visibleOrders();

        if (q) {
            if (isManager) {
                orders = orders.filter(o => (o.customer || '').toLowerCase().includes(q));
            } else {
                orders = orders.filter(o =>
                    (o.items || []).some(i => (i.productName || '').toLowerCase().includes(q))
                );
            }
        }

        body.innerHTML = '';

        if (orders.length === 0) {
            empty.hidden = false;
            return;
        }
        empty.hidden = true;

        orders.forEach(order => {
            const composition = (order.items || [])
                .map(i => {
                    const size = (i.size && i.size !== '—') ? ` (${i.size})` : '';
                    return `${i.productName}${size} × ${i.quantity}`;
                })
                .join('; ');

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${order.code}</td>
                <td>${formatDate(order.date)}</td>
                <td>${order.customer}</td>
                <td>${composition || '—'}</td>
                <td>${formatPrice(order.total)}</td>
                <td>
                    <a class="btn btn--primary btn--small"
                       href="order.html?code=${order.code}">Открыть</a>
                </td>
            `;
            body.appendChild(tr);
        });
    }

    searchInput.addEventListener('input', render);
    render();
});
