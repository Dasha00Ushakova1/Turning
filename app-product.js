'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const user = requireAuth();
    if (!user) return;

    document.getElementById('user-name').textContent = user.fullName;
    document.getElementById('back-to-catalog')
        .addEventListener('click', () => { window.location.href = 'catalog.html'; });

    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode') || 'view'; // view | edit | create
    const isAdmin = store.isAdmin();

    let db;
    try {
        db = await loadDatabase();
    } catch (error) {
        showModal('Ошибка загрузки', error.message, 'error');
        return;
    }

    // ============ РЕЖИМ СОЗДАНИЯ ============
    if (mode === 'create' && isAdmin) {
        renderCreateForm(db);
        return;
    }

    // ============ РЕЖИМ ПРОСМОТРА / РЕДАКТИРОВАНИЯ ============
    const code = store.getSelectedProduct();
    if (!code) {
        window.location.href = 'catalog.html';
        return;
    }

    const rows = query(db, `SELECT * FROM Products WHERE Product_Code = ${code}`);
    if (rows.length === 0) {
        showModal('Товар не найден', 'Возможно, он был удалён.', 'error');
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
        stockLabel: getStockLabel(p.Quantity)
    };

    if (mode === 'edit' && isAdmin) {
        renderEditForm(db, product);
    } else {
        renderView(db, product);
    }
});

/* ============================================================
 * Просмотр
 * ============================================================ */
function renderView(db, product) {
    const sizes = query(db,
        `SELECT Size FROM Product_Sizes WHERE Product_Code = ${product.code}`
    ).map(r => r.Size);

    const sizesHtml = sizes.length
        ? `<div class="product__sizes">${sizes.map((s, i) =>
              `<label class="size-option">
                  <input type="radio" name="size" value="${s}" ${i === 0 ? 'checked' : ''}>
                  <span>${s}</span>
              </label>`).join('')}</div>`
        : '<p class="product__no-sizes">Размеры не указаны</p>';

    document.getElementById('product-details').innerHTML = `
        <img class="product__image"
             src="https://placehold.co/300x300?text=${encodeURIComponent(product.name)}"
             alt="${product.name}">
        <div class="product__info">
            <h2 class="product__name">${product.name}</h2>
            <p class="product__row"><b>Цена:</b> ${formatPrice(product.price)}</p>
            <p class="product__row"><b>Цена со скидкой:</b> ${formatPrice(product.finalPrice)}
                ${product.discountPercent > 0 ? `<small>(-${product.discountPercent}%)</small>` : ''}</p>
            <p class="product__row"><b>Доступно:</b> ${product.quantity} шт.
                <span class="badge ${product.stockLabel === 'много' ? 'badge--many' : 'badge--few'}">${product.stockLabel}</span></p>

            <h3 class="product__section">Размеры</h3>
            ${sizesHtml}

            <h3 class="product__section">Количество</h3>
            <input id="product-quantity" class="field__input" type="number"
                   min="1" max="${product.quantity}" value="1">
            <span class="field__error" id="quantity-error"></span>

            <div class="product__actions">
                <button id="add-to-cart" class="btn btn--primary" type="button">Добавить в корзину</button>
                <button id="goto-cart" class="btn btn--ghost btn--dark" type="button">Перейти в корзину</button>
                <button id="cancel-order" class="btn btn--ghost btn--dark" type="button">Отмена</button>
            </div>
        </div>
    `;

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

    document.getElementById('cancel-order')
        .addEventListener('click', () => { window.location.href = 'catalog.html'; });

    document.getElementById('add-to-cart').addEventListener('click', () => {
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

        store.addToCart({
            code: product.code,
            name: product.name,
            price: product.finalPrice,
            size,
            quantity: value
        });

        updateCartBadge();
        showToast(`«${product.name}» (${size}, ${value} шт.) добавлен в корзину`, 'success');
    });

    document.getElementById('goto-cart').addEventListener('click', () => {
        window.location.href = 'cart.html';
    });
}

/* ============================================================
 * Редактирование (админ)
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
            showModal('Готово', 'Товар обновлён. Возвращаемся в каталог.', 'info');
            document.getElementById('modal-ok').addEventListener('click', () => {
                window.location.href = 'catalog.html';
            }, { once: true });
        } catch (e) {
            showModal('Ошибка сохранения', e.message, 'error');
        }
    });
}

/* ============================================================
 * Создание (админ)
 * ============================================================ */
function renderCreateForm(db) {
    const nextCode = (query(db, 'SELECT MAX(Product_Code) AS m FROM Products')[0]?.m || 0) + 1;

    document.getElementById('product-details').innerHTML = `
        <div class="product__info" style="grid-column: 1 / -1">
            <h2 class="product__name">Новый товар (код ${nextCode})</h2>

            <label class="field">
                <span class="field__label">Название</span>
                <input id="edit-name" class="field__input" type="text" placeholder="Например, Синие перчатки">
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
            showModal('Готово', `Товар «${name}» добавлен в каталог.`, 'info');
            document.getElementById('modal-ok').addEventListener('click', () => {
                window.location.href = 'catalog.html';
            }, { once: true });
        } catch (e) {
            showModal('Ошибка создания', e.message, 'error');
        }
    });
}
