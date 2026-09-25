'use strict';

/* ============================================================
 * Карта изображений товаров (по коду товара из БД)
 * ============================================================ */
const PRODUCT_IMAGES = {
    1:  './Белые перчатки.png',
    2:  './Черные перчатки.jpg',
    3:  './Красный камень.jpg',
    4:  './Чай от Юдера.jpg',
    5:  './Карасик.jpg',
    6:  './Очки Кейлуса.png',
    7:  './Красная нитка от Энона.jpg',
    8:  './Слёзы Киолле.png',
    9:  './Ваза от Канны.jpg',
    10: './Травы от Энона.jpg'
};

/** Заглушка, если картинки для товара нет. */
const PLACEHOLDER_IMAGE = 'https://placehold.co/300x300?text=No+Image';

document.addEventListener('DOMContentLoaded', async () => {
    const user = requireAuth();
    if (!user) return;

    document.getElementById('user-name').textContent = user.fullName;
    const roleLabel = { customer: 'Клиент', manager: 'Менеджер', admin: 'Администратор' };
    const roleEl = document.getElementById('user-role');
    if (roleEl) roleEl.textContent = roleLabel[user.role] || '';

    document.getElementById('back-to-catalog')
        .addEventListener('click', () => { window.location.href = 'catalog.html'; });

    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode') || 'view';
    const isAdmin = store.isAdmin();

    /* ---------- Загрузка БД ---------- */
    let db;
    try {
        db = await loadDatabase();
    } catch (error) {
        showModal('Ошибка загрузки', error.message, 'error');
        return;
    }

    /* ---------- Режим «Создание» — только для админа ---------- */
    if (mode === 'create' && isAdmin) {
        renderCreateForm(db);
        return;
    }

    /* ---------- Режим «Просмотр / Редактирование» ---------- */
    const code = store.getSelectedProduct();
    if (!code) {
        window.location.href = 'catalog.html';
        return;
    }

    const rows = query(db, `SELECT * FROM Products WHERE Product_Code = ${code}`);
    if (rows.length === 0) {
        showModal('Товар не найден', 'Возможно, он был удалён.', 'error');
        setTimeout(() => { window.location.href = 'catalog.html'; }, 1500);
        return;
    }

    const p = rows[0];
    const { finalPrice, discountPercent } = calculateDiscount(p.Price, p.Quantity);

    const product = {
        code: p.Product_Code,
        name: p.Product_Name,
        price: Number(p.Price),
        quantity: p.Quantity,
        finalPrice,
        discountPercent,
        stockLabel: getStockLabel(p.Quantity),
        description: p.Description || null
    };

    if (mode === 'edit' && isAdmin) {
        renderEditForm(db, product);
    } else {
        renderView(db, product, user);
    }
});

/* ============================================================
 * Просмотр товара
 * ============================================================ */
function renderView(db, product, user) {
    /* Размеры: таблицы Product_Sizes может не быть — не падаем */
    let sizes = [];
    try {
        sizes = query(db,
            `SELECT Size FROM Product_Sizes WHERE Product_Code = ${product.code}`
        ).map(r => r.Size);
    } catch (e) {
        console.warn('Таблица Product_Sizes недоступна:', e.message);
        sizes = [];
    }

    const sizesHtml = sizes.length
        ? `<div class="product__sizes">${sizes.map((s, i) =>
              `<label class="size-option">
                  <input type="radio" name="size" value="${s}" ${i === 0 ? 'checked' : ''}>
                  <span>${s}</span>
              </label>`).join('')}</div>`
        : '<p class="product__no-sizes">Размеры не указаны</p>';

    /* Картинка: сначала — из карты, иначе — заглушка */
    const imageUrl = PRODUCT_IMAGES[product.code] || PLACEHOLDER_IMAGE;

    /* Описание: если в БД нет — берём название товара */
    const description = product.description || product.name;

    const actionsHtml = user.role === 'customer'
        ? `
            <div class="product__actions">
                <button id="place-order" class="btn btn--primary" type="button">Оформить заказ</button>
                <button id="cancel-order" class="btn btn--ghost btn--dark" type="button">Отмена</button>
            </div>
        `
        : `
            <div class="product__actions">
                <button id="cancel-order" class="btn btn--ghost btn--dark" type="button">Назад</button>
            </div>
        `;

    document.getElementById('product-details').innerHTML = `
        <img class="product__image" src="${imageUrl}" alt="${product.name}"
             onerror="this.src='${PLACEHOLDER_IMAGE}'">
        <div class="product__info">
            <h2 class="product__name">${product.name}</h2>
            <p class="product__desc">${description}</p>

            <p class="product__row"><b>Цена:</b> ${formatPrice(product.price)}</p>
            <p class="product__row"><b>Цена со скидкой:</b> ${formatPrice(product.finalPrice)}
                ${product.discountPercent > 0 ? `<small>(-${product.discountPercent}%)</small>` : ''}</p>
            <p class="product__row"><b>Доступно:</b> ${product.quantity} шт.
                <span class="badge ${product.stockLabel === 'много' ? 'badge--many' : 'badge--few'}">
                    ${product.stockLabel}
                </span>
            </p>

            <h3 class="product__section">Размер</h3>
            ${sizesHtml}

            ${user.role === 'customer' ? `
                <h3 class="product__section">Количество</h3>
                <input id="product-quantity" class="field__input" type="number"
                       min="1" max="${product.quantity}" value="1">
                <span class="field__error" id="quantity-error"></span>
            ` : ''}

            ${actionsHtml}
        </div>
    `;

    document.getElementById('cancel-order')
        .addEventListener('click', () => { window.location.href = 'catalog.html'; });

    if (user.role !== 'customer') return;

    /* ---------- Валидация и оформление заказа (только для клиента) ---------- */
    const quantityInput = document.getElementById('product-quantity');
    const quantityError = document.getElementById('quantity-error');

    quantityInput.addEventListener('input', () => {
        const value = Number(quantityInput.value);
        if (!Number.isInteger(value) || value < 1) {
            quantityError.textContent = 'Введите целое число от 1';
        } else if (value > product.quantity) {
            quantityError.textContent = `Доступно только ${product.quantity} шт.`;
        } else {
            quantityError.textContent = '';
        }
    });

    document.getElementById('place-order').addEventListener('click', () => {
        const value = Number(quantityInput.value);
        if (!Number.isInteger(value) || value < 1) {
            showModal('Некорректное значение',
                'Количество должно быть целым числом не меньше 1.', 'warning');
            return;
        }
        if (value > product.quantity) {
            showModal('Недостаточно товара',
                `На складе осталось ${product.quantity} шт.`, 'warning');
            return;
        }

        const sizeInput = document.querySelector('input[name="size"]:checked');
        const size = sizeInput ? sizeInput.value : '—';

        const orderCode = generateOrderCode(db);
        const order = {
            code: orderCode,
            date: new Date().toISOString().slice(0, 10),
            customer: user.fullName,
            customerLogin: user.login,
            items: [{
                productCode: product.code,
                productName: product.name,
                size,
                quantity: value,
                price: product.finalPrice
            }],
            total: product.finalPrice * value
        };

        store.addOrder(order);

        showModal('Заказ оформлен',
            `Заказ №${orderCode} на сумму ${formatPrice(order.total)} сохранён.`,
            'info');
        document.getElementById('modal-ok').addEventListener('click', () => {
            window.location.href = 'orders.html';
        }, { once: true });
    });
}

/* ============================================================
 * Редактирование (только админ)
 * ============================================================ */
function renderEditForm(db, product) {
    document.getElementById('product-details').innerHTML = `
        <div class="product__info" style="grid-column: 1 / -1">
            <h2 class="product__name">Редактирование товара №${product.code}</h2>

            <label class="field">
                <span class="field__label">Название</span>
                <input id="edit-name" class="field__input" type="text" value="${product.name}">
            </label>
            <label class="field">
                <span class="field__label">Цена, ₽</span>
                <input id="edit-price" class="field__input" type="number" min="0" step="0.01"
                       value="${product.price}">
            </label>
            <label class="field">
                <span class="field__label">Количество</span>
                <input id="edit-quantity" class="field__input" type="number" min="0"
                       value="${product.quantity}">
            </label>

            <div class="product__actions">
                <button id="save-btn" class="btn btn--primary" type="button">Сохранить</button>
                <button id="cancel-btn" class="btn btn--ghost btn--dark" type="button">Отмена</button>
            </div>
        </div>
    `;

    document.getElementById('cancel-btn')
        .addEventListener('click', () => { window.location.href = 'catalog.html'; });

    document.getElementById('save-btn').addEventListener('click', () => {
        const name = document.getElementById('edit-name').value.trim();
        const price = Number(document.getElementById('edit-price').value);
        const quantity = Number(document.getElementById('edit-quantity').value);

        if (!name) {
            showModal('Ошибка', 'Название не может быть пустым.', 'warning');
            return;
        }
        if (!(price >= 0)) {
            showModal('Ошибка', 'Цена должна быть неотрицательным числом.', 'warning');
            return;
        }
        if (!Number.isInteger(quantity) || quantity < 0) {
            showModal('Ошибка', 'Количество должно быть целым неотрицательным числом.', 'warning');
            return;
        }

        const safeName = name.replace(/'/g, "''");
        try {
            db.run(`UPDATE Products SET
                        Product_Name = '${safeName}',
                        Price = ${price},
                        Quantity = ${quantity}
                    WHERE Product_Code = ${product.code}`);
            showModal('Готово', 'Товар обновлён.', 'info');
            document.getElementById('modal-ok').addEventListener('click', () => {
                window.location.href = 'catalog.html';
            }, { once: true });
        } catch (e) {
            showModal('Ошибка сохранения', e.message, 'error');
        }
    });
}

/* ============================================================
 * Создание (только админ)
 * ============================================================ */
function renderCreateForm(db) {
    const nextCode = (query(db, 'SELECT MAX(Product_Code) AS m FROM Products')[0]?.m || 0) + 1;

    document.getElementById('product-details').innerHTML = `
        <div class="product__info" style="grid-column: 1 / -1">
            <h2 class="product__name">Новый товар (код ${nextCode})</h2>

            <label class="field">
                <span class="field__label">Название</span>
                <input id="edit-name" class="field__input" type="text"
                       placeholder="Например, Синие перчатки">
            </label>
            <label class="field">
                <span class="field__label">Цена, ₽</span>
                <input id="edit-price" class="field__input" type="number" min="0" step="0.01" value="100">
            </label>
            <label class="field">
                <span class="field__label">Количество</span>
                <input id="edit-quantity" class="field__input" type="number" min="0" value="1">
            </label>

            <div class="product__actions">
                <button id="save-btn" class="btn btn--primary" type="button">Создать</button>
                <button id="cancel-btn" class="btn btn--ghost btn--dark" type="button">Отмена</button>
            </div>
        </div>
    `;

    document.getElementById('cancel-btn')
        .addEventListener('click', () => { window.location.href = 'catalog.html'; });

    document.getElementById('save-btn').addEventListener('click', () => {
        const name = document.getElementById('edit-name').value.trim();
        const price = Number(document.getElementById('edit-price').value);
        const quantity = Number(document.getElementById('edit-quantity').value);

        if (!name) {
            showModal('Ошибка', 'Введите название товара.', 'warning');
            return;
        }
        if (!(price >= 0) || !Number.isInteger(quantity) || quantity < 0) {
            showModal('Ошибка', 'Проверьте цену и количество.', 'warning');
            return;
        }

        const safeName = name.replace(/'/g, "''");
        try {
            db.run(`INSERT INTO Products (Product_Code, Product_Name, Price, Quantity)
                    VALUES (${nextCode}, '${safeName}', ${price}, ${quantity})`);
            showModal('Готово', `Товар «${name}» добавлен.`, 'info');
            document.getElementById('modal-ok').addEventListener('click', () => {
                window.location.href = 'catalog.html';
            }, { once: true });
        } catch (e) {
            showModal('Ошибка создания', e.message, 'error');
        }
    });
}

/* ============================================================
 * Утилита: следующий код заказа
 * ============================================================ */
function generateOrderCode(db) {
    const local = store.getOrders().reduce((m, o) => Math.max(m, o.code), 0);
    const fromDb = query(db, 'SELECT MAX(Order_Code) AS m FROM Orders')[0]?.m || 0;
    return Math.max(local, fromDb) + 1;
}
