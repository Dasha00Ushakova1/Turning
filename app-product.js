'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const user = requireAuth();
    if (!user) return;

    document.getElementById('user-name').textContent = user.fullName;
    document.getElementById('back-to-catalog')
        .addEventListener('click', () => window.location.href = 'catalog.html');

    const code = store.getSelectedProduct();
    if (!code) {
        window.location.href = 'catalog.html';
        return;
    }

    let db;
    let product;

    try {
        db = await loadDatabase();
        const rows = query(db, `SELECT * FROM Products WHERE Product_Code = ${code}`);
        if (rows.length === 0) {
            showModal('Товар не найден', 'Возможно, он был удалён.', 'error');
            return;
        }
        const p = rows[0];
        const { finalPrice, discountPercent } = calculateDiscount(p.Price, p.Quantity);
        product = {
            code: p.Product_Code,
            name: p.Product_Name,
            price: Number(p.Price),
            quantity: p.Quantity,
            finalPrice,
            discountPercent,
            stockLabel: getStockLabel(p.Quantity)
        };
    } catch (error) {
        showModal('Ошибка загрузки', error.message, 'error');
        return;
    }

    const sizes = query(db,
        `SELECT Size FROM Product_Sizes WHERE Product_Code = ${code}`
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

            <h3 class="product__section">Выберите размер</h3>
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
        .addEventListener('click', () => window.location.href = 'catalog.html');

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

        showModal('Заказ оформлен',
            `«${product.name}», размер ${size}, ${value} шт. — добавлено в заказ №${order.code}.`,
            'info');

        // Кнопка OK в модалке отправит обратно в каталог
        document.getElementById('modal-ok').addEventListener('click', () => {
            window.location.href = 'catalog.html';
        }, { once: true });
    });
});

function generateOrderCode(db) {
    const local = store.getOrders().reduce((m, o) => Math.max(m, o.code), 0);
    const fromDb = query(db, 'SELECT MAX(Order_Code) AS m FROM Orders')[0]?.m || 0;
    return Math.max(local, fromDb) + 1;
}
