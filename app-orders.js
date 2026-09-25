'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const user = requireAuth();
    if (!user) return;

    document.getElementById('user-name').textContent = user.fullName;

    const roleLabel = { customer: 'Клиент', manager: 'Менеджер', admin: 'Администратор' };
    document.getElementById('user-role').textContent = roleLabel[user.role] || '';

    document.getElementById('back-to-catalog')
        .addEventListener('click', () => { window.location.href = 'catalog.html'; });

    const isManager = store.isManager();
    const isAdmin = store.isAdmin();

    const newOrderBtn = document.getElementById('new-order-btn');
    if (isManager) newOrderBtn.hidden = false;
    newOrderBtn.addEventListener('click', () => {
        // «Новый заказ» = выбрать товары из каталога.
        // Простейший сценарий: уходим в каталог, где пользователь
        // набирает корзину и нажимает «Оформить заказ».
        store.clearCart();
        window.location.href = 'catalog.html';
    });

    const body = document.getElementById('orders-body');
    const empty = document.getElementById('orders-empty');
    const searchInput = document.getElementById('orders-search');

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
        if (isManager) return all;                               // менеджер/админ видят все
        return all.filter(o => o.customer === user.fullName);    // клиент — только свои
    }

    function render() {
        const q = searchInput.value.trim().toLowerCase();
        let orders = visibleOrders();

        if (q) {
            orders = orders.filter(o =>
                (o.customer || '').toLowerCase().includes(q)
            );
        }

        body.innerHTML = '';

        if (orders.length === 0) {
            empty.hidden = false;
            return;
        }
        empty.hidden = true;

        orders.forEach(order => {
            const composition = (order.items || [])
                .map(i => `${i.productName} (${i.size}) × ${i.quantity}`)
                .join('; ');

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${order.code}</td>
                <td>${formatDate(order.date)}</td>
                <td>${order.customer}</td>
                <td>${composition || '—'}</td>
                <td>${formatPrice(order.total)}</td>
                <td>
                    <button class="btn btn--primary btn--small view-btn"
                            data-code="${order.code}" type="button">Открыть</button>
                </td>
            `;
            tr.querySelector('.view-btn').addEventListener('click', () => {
                openOrderCard(order.code);
            });
            body.appendChild(tr);
        });
    }

    /* ============================================================
     * Модальное окно с составом заказа
     * ============================================================ */
    const orderModal = document.getElementById('order-modal');
    const orderModalTitle = document.getElementById('order-modal-title');
    const orderModalContent = document.getElementById('order-modal-content');

    document.getElementById('order-modal-close').addEventListener('click', () => {
        orderModal.hidden = true;
        render();
    });
    orderModal.addEventListener('click', e => {
        if (e.target === orderModal) {
            orderModal.hidden = true;
            render();
        }
    });

    function openOrderCard(orderCode) {
        const order = store.getOrderByCode(orderCode);
        if (!order) return;

        orderModalTitle.textContent = `Заказ №${order.code}`;

        let html = `
            <p class="order-card__row"><b>Дата:</b>
                ${isAdmin
                    ? `<input id="order-date-input" class="field__input" type="date" value="${order.date}">`
                    : formatDate(order.date)}
            </p>
            <p class="order-card__row"><b>Клиент:</b> ${order.customer}</p>

            <h4 class="order-card__subtitle">Состав заказа</h4>
            <table class="data-table">
                <thead class="data-table__head">
                    <tr>
                        <th>Модель</th>
                        <th>Размер</th>
                        <th>Кол-во</th>
                        <th>Цена</th>
                        <th>Сумма</th>
                        ${isManager ? '<th></th>' : ''}
                    </tr>
                </thead>
                <tbody>
        `;

        if (!order.items || order.items.length === 0) {
            html += `<tr><td colspan="${isManager ? 6 : 5}" class="data-table__empty">Позиций нет</td></tr>`;
        } else {
            order.items.forEach((item, idx) => {
                const sum = item.price * item.quantity;
                html += `
                    <tr>
                        <td>${item.productName}</td>
                        <td>${item.size}</td>
                        <td>${item.quantity}</td>
                        <td>${formatPrice(item.price)}</td>
                        <td>${formatPrice(sum)}</td>
                        ${isManager
                            ? `<td><button class="btn btn--ghost btn--dark btn--small remove-item-btn"
                                       data-idx="${idx}" type="button">Удалить</button></td>`
                            : ''}
                    </tr>
                `;
            });
        }

        html += `
                </tbody>
            </table>
            <p class="order-card__total"><b>Итого:</b> ${formatPrice(order.total)}</p>
        `;

        if (isManager) {
            html += `
                <button id="add-item-btn" class="btn btn--primary" type="button"
                        style="margin-top:12px">+ Добавить позицию</button>
            `;
        }

        if (isAdmin) {
            html += `
                <button id="save-date-btn" class="btn btn--primary" type="button"
                        style="margin-top:12px;margin-left:8px">Сохранить дату</button>
            `;
        }

        orderModalContent.innerHTML = html;
        orderModal.hidden = false;

        // Обработчики внутри модалки
        orderModalContent.querySelectorAll('.remove-item-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.dataset.idx);
                store.removeOrderItem(order.code, idx);
                showToast('Позиция удалена', 'info');
                openOrderCard(order.code);      // перерисовываем модалку
            });
        });

        const addBtn = document.getElementById('add-item-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                // Закрываем модалку и переходим в каталог для добавления товара
                orderModal.hidden = true;
                localStorage.setItem('addingToOrder', String(order.code));
                window.location.href = 'catalog.html';
            });
        }

        const saveDateBtn = document.getElementById('save-date-btn');
        if (saveDateBtn) {
            saveDateBtn.addEventListener('click', () => {
                const input = document.getElementById('order-date-input');
                const newDate = input.value;
                if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
                    showModal('Некорректная дата',
                        'Дата должна быть в формате ГГГГ-ММ-ДД.', 'warning');
                    return;
                }
                store.updateOrder(order.code, { date: newDate });
                showToast('Дата заказа обновлена', 'success');
                openOrderCard(order.code);
            });
        }
    }

    // Поиск по ФИО клиента
    searchInput.addEventListener('input', render);

    render();
});
