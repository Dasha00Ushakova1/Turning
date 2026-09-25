'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const user = requireAuth();
    if (!user) return;

    const roleLabel = { customer: 'Клиент', manager: 'Менеджер', admin: 'Администратор' };
    document.getElementById('user-name').textContent = user.fullName;
    const roleEl = document.getElementById('user-role');
    if (roleEl) roleEl.textContent = roleLabel[user.role] || '';

    document.getElementById('back-to-orders')
        .addEventListener('click', () => { window.location.href = 'orders.html'; });

    const orderCode = Number(new URLSearchParams(window.location.search).get('code'));
    if (!orderCode) {
        showModal('Ошибка', 'Не указан номер заказа.', 'error');
        setTimeout(() => { window.location.href = 'orders.html'; }, 1500);
        return;
    }

    const order = store.getOrderByCode(orderCode);
    if (!order) {
        showModal('Заказ не найден', 'Такого заказа нет в системе.', 'error');
        setTimeout(() => { window.location.href = 'orders.html'; }, 1500);
        return;
    }

    // Доступ: клиент — только свой заказ; менеджер/админ — любой
    if (!store.isManager() && order.customer !== user.fullName) {
        showModal('Доступ запрещён', 'Вы можете просматривать только свои заказы.', 'error');
        setTimeout(() => { window.location.href = 'orders.html'; }, 1500);
        return;
    }

    let db;
    try {
        db = await loadDatabase();
    } catch (error) {
        showModal('Ошибка загрузки', error.message, 'error');
        return;
    }

    const isManager = store.isManager();
    const isAdmin   = store.isAdmin();

    document.getElementById('page-title').textContent = `Заказ №${order.code}`;

    // Информация о клиенте (из БД, если есть)
    const customerRows = query(db,
        `SELECT * FROM Customers WHERE First_Name || ' ' || Last_Name = '${order.customer.replace(/'/g, "''")}'`
    );
    const customerInfo = customerRows[0] || null;

    // Собираем карточки товаров заказа
    const itemsHtml = (order.items || []).map((item, idx) => {
        const sum = item.price * item.quantity;
        const imgUrl = `https://placehold.co/160x160?text=${encodeURIComponent(item.productName)}`;

        return `
            <div class="order-item">
                <img class="order-item__image" src="${imgUrl}" alt="${item.productName}">
                <div class="order-item__body">
                    <h4 class="order-item__title">${item.productName}</h4>
                    <p class="order-item__desc">${item.productName}</p>
                    <p class="order-item__row"><b>Размер:</b> ${item.size}</p>
                    <p class="order-item__row"><b>Кол-во:</b> ${item.quantity}</p>
                    <p class="order-item__row"><b>Цена:</b> ${formatPrice(item.price)}</p>
                    <p class="order-item__row"><b>Сумма:</b> ${formatPrice(sum)}</p>
                </div>
                <div class="order-item__actions">
                    ${isManager
                        ? `<button class="btn btn--ghost btn--dark btn--small remove-item-btn"
                                   data-idx="${idx}" type="button">Удалить</button>`
                        : ''}
                    ${user.role === 'customer'
                        ? `<button class="btn btn--primary btn--small reorder-btn"
                                   data-idx="${idx}" type="button">Заказать ещё</button>`
                        : ''}
                </div>
            </div>
        `;
    }).join('') || '<p class="data-table__empty">Позиций нет</p>';

    // Поле даты — редактируемое только для админа
    const dateHtml = isAdmin
        ? `<input id="order-date-input" class="field__input" type="date" value="${order.date}">
           <button id="save-date-btn" class="btn btn--primary btn--small" type="button"
                   style="margin-left:8px">Сохранить дату</button>`
        : formatDate(order.date);

    // Информация о клиенте
    let customerHtml = `<p class="order-card__row"><b>Клиент:</b> ${order.customer}</p>`;
    if (customerInfo) {
        customerHtml += `
            <p class="order-card__row"><b>Дата рождения:</b> ${formatDate(customerInfo.Birth_Date)}</p>
            <p class="order-card__row"><b>Адрес:</b> ${customerInfo.Address || '—'}</p>
            <p class="order-card__row"><b>Телефон:</b> ${customerInfo.Phone || '—'}</p>
        `;
    }

    document.getElementById('order-wrapper').innerHTML = `
        <div class="order-card">
            <div class="order-card__header">
                <p class="order-card__row"><b>Дата:</b> ${dateHtml}</p>
                ${customerHtml}
            </div>

            <h3 class="order-card__subtitle">Состав заказа</h3>
            <div class="order-items">${itemsHtml}</div>

            <div class="order-card__footer">
                <p class="order-card__total"><b>Итого:</b> ${formatPrice(order.total)}</p>
                ${isManager
                    ? `<button id="add-item-btn" class="btn btn--primary" type="button">
                           + Добавить позицию
                       </button>`
                    : ''}
            </div>
        </div>
    `;

    /* ---------- Обработчики ---------- */

    // Сохранение даты (админ)
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
            window.location.reload();
        });
    }

    // Удаление позиции (менеджер и админ)
    document.querySelectorAll('.remove-item-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.idx);
            if (!confirm('Удалить позицию из заказа?')) return;
            store.removeOrderItem(order.code, idx);
            showToast('Позиция удалена', 'info');
            window.location.reload();
        });
    });

    // «Заказать ещё» — клиент добавляет ту же позицию в новый заказ
    document.querySelectorAll('.reorder-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.idx);
            const item = order.items[idx];
            if (!item) return;

            const newCode = generateOrderCode(db);
            const newOrder = {
                code: newCode,
                date: new Date().toISOString().slice(0, 10),
                customer: user.fullName,
                customerLogin: user.login,
                items: [{
                    productCode: item.productCode,
                    productName: item.productName,
                    size: item.size,
                    quantity: item.quantity,
                    price: item.price
                }],
                total: item.price * item.quantity
            };
            store.addOrder(newOrder);
            showModal('Заказ оформлен',
                `Создан заказ №${newCode} на сумму ${formatPrice(newOrder.total)}.`, 'info');
            document.getElementById('modal-ok').addEventListener('click', () => {
                window.location.href = 'orders.html';
            }, { once: true });
        });
    });

    // Добавление позиции (менеджер/админ)
    const addItemBtn = document.getElementById('add-item-btn');
    if (addItemBtn) {
        addItemBtn.addEventListener('click', () => {
            localStorage.setItem('addingToOrder', String(order.code));
            window.location.href = 'catalog.html';
        });
    }
});

/** Генерирует следующий номер заказа. */
function generateOrderCode(db) {
    const local = store.getOrders().reduce((m, o) => Math.max(m, o.code), 0);
    const fromDb = query(db, 'SELECT MAX(Order_Code) AS m FROM Orders')[0]?.m || 0;
    return Math.max(local, fromDb) + 1;
}
