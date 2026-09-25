'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const user = requireAuth();
    if (!user) return;

    document.getElementById('user-name').textContent = user.fullName;
    document.getElementById('back-to-catalog')
        .addEventListener('click', () => window.location.href = 'catalog.html');

    const body = document.getElementById('cart-body');
    const empty = document.getElementById('cart-empty');
    const summary = document.getElementById('cart-summary');
    const totalEl = document.getElementById('cart-total');

    let db;

    try {
        db = await loadDatabase();
    } catch (error) {
        showModal('Ошибка загрузки', error.message, 'error');
        return;
    }

    /** Возвращает максимально доступное количество товара по коду (из БД). */
    function getAvailableQuantity(productCode) {
        const rows = query(db,
            `SELECT Quantity FROM Products WHERE Product_Code = ${productCode}`);
        return rows[0] ? rows[0].Quantity : 0;
    }

    function render() {
        const cart = store.getCart();
        body.innerHTML = '';

        if (cart.length === 0) {
            empty.hidden = false;
            summary.hidden = true;
            updateCartBadge();
            return;
        }
        empty.hidden = true;
        summary.hidden = false;

        let total = 0;

        cart.forEach(item => {
            const sum = item.price * item.quantity;
            total += sum;

            const maxAvailable = getAvailableQuantity(item.code);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.code}</td>
                <td>${item.name}</td>
                <td>${item.size}</td>
                <td>${formatPrice(item.price)}</td>
                <td>
                    <input class="field__input cart-qty" type="number"
                           min="1" max="${maxAvailable}" value="${item.quantity}"
                           data-code="${item.code}" data-size="${item.size}">
                </td>
                <td>${formatPrice(sum)}</td>
                <td>
                    <button class="btn btn--ghost btn--dark btn--small remove-btn"
                            data-code="${item.code}" data-size="${item.size}"
                            type="button">Удалить</button>
                </td>
            `;
            body.appendChild(tr);
        });

        totalEl.textContent = formatPrice(total);

        // Обработчики изменения количества
        body.querySelectorAll('.cart-qty').forEach(input => {
            input.addEventListener('change', () => {
                const code = Number(input.dataset.code);
                const size = input.dataset.size;
                const newQty = Number(input.value);
                const max = getAvailableQuantity(code);

                if (!Number.isInteger(newQty) || newQty < 1) {
                    showModal('Некорректное значение',
                        'Количество должно быть целым числом не меньше 1.', 'warning');
                    input.value = 1;
                    store.updateCartQuantity(code, size, 1);
                } else if (newQty > max) {
                    showModal('Недостаточно товара',
                        `На складе доступно только ${max} шт.`, 'warning');
                    input.value = max;
                    store.updateCartQuantity(code, size, max);
                } else {
                    store.updateCartQuantity(code, size, newQty);
                }
                render();
            });
        });

        // Обработчики удаления
        body.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                store.removeFromCart(Number(btn.dataset.code), btn.dataset.size);
                showToast('Позиция удалена из корзины', 'info');
                render();
            });
        });

        updateCartBadge();
    }

    document.getElementById('clear-cart-btn').addEventListener('click', () => {
        if (store.getCart().length === 0) return;
        store.clearCart();
        showToast('Корзина очищена', 'info');
        render();
    });

       document.getElementById('checkout-btn').addEventListener('click', () => {
        const cart = store.getCart();
        if (cart.length === 0) {
            showModal('Корзина пуста',
                'Добавьте товары перед оформлением заказа.', 'warning');
            return;
        }

        // Если менеджер добавляет позиции в существующий заказ
        const addingTo = localStorage.getItem('addingToOrder');
        if (addingTo) {
            const orderCode = Number(addingTo);
            cart.forEach(i => {
                store.addOrderItem(orderCode, {
                    productCode: i.code,
                    productName: i.name,
                    size: i.size,
                    quantity: i.quantity,
                    price: i.price
                });
            });
            store.clearCart();
            localStorage.removeItem('addingToOrder');
            updateCartBadge();

            showModal('Позиции добавлены',
                `В заказ №${orderCode} добавлено ${cart.length} позиц.`, 'info');
            document.getElementById('modal-ok').addEventListener('click', () => {
                window.location.href = 'orders.html';
            }, { once: true });
            return;
        }

        // Обычное оформление нового заказа (как было)
        // ... ваш существующий код ...
    });

        const orderCode = generateOrderCode(db);
        const order = {
            code: orderCode,
            date: new Date().toISOString().slice(0, 10),
            customer: user.fullName,
            items: cart.map(i => ({
                productCode: i.code,
                productName: i.name,
                size: i.size,
                quantity: i.quantity,
                price: i.price
            })),
            total: cart.reduce((s, i) => s + i.price * i.quantity, 0)
        };

        store.addOrder(order);
        store.clearCart();
        updateCartBadge();

        showModal('Заказ оформлен',
            `Заказ №${orderCode} на сумму ${formatPrice(order.total)} сохранён.`,
            'info');

        document.getElementById('modal-ok').addEventListener('click', () => {
            window.location.href = 'orders.html';
        }, { once: true });
    });

    render();
});

/**
 * Генерирует следующий номер заказа, учитывая уже сохранённые в БД и локально.
 */
function generateOrderCode(db) {
    const local = store.getOrders().reduce((m, o) => Math.max(m, o.code), 0);
    const fromDb = query(db, 'SELECT MAX(Order_Code) AS m FROM Orders')[0]?.m || 0;
    return Math.max(local, fromDb) + 1;
}
