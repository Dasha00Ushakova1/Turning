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
const PLACEHOLDER_IMAGE = 'https://placehold.co/300x300?text=No+Image';

/* ---------- Утилита: чтение файла в base64 ---------- */
function readImageAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/* ---------- Утилита: HTML зоны загрузки картинки ---------- */
function imageDropzoneHtml(previewSrc) {
    return `
        <div class="field">
            <span class="field__label">Картинка товара</span>
            <div class="dropzone" id="dropzone">
                <input type="file" id="edit-image" accept="image/*" hidden>
                <img id="image-preview" class="dropzone__preview" src="${previewSrc}" alt="Предпросмотр">
                <div class="dropzone__overlay">
                    <span class="dropzone__icon">🖼</span>
                    <span class="dropzone__text">Перетащите картинку сюда</span>
                    <span class="dropzone__hint">или нажмите, чтобы выбрать файл</span>
                    <span class="dropzone__hint">JPG, PNG · до 2 МБ</span>
                </div>
            </div>
        </div>
    `;
}

/* ---------- Утилита: навесить обработчики на dropzone ---------- */
function bindImageDropzone(onImageReady) {
    const dropzone = document.getElementById('dropzone');
    const input    = document.getElementById('edit-image');
    const preview  = document.getElementById('image-preview');
    if (!dropzone || !input || !preview) return;

    function setImage(file) {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showModal('Ошибка', 'Можно загрузить только изображение.', 'warning');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            showModal('Слишком большой файл',
                'Максимальный размер — 2 МБ. Сожмите изображение.', 'warning');
            return;
        }
        readImageAsDataUrl(file).then(dataUrl => {
            preview.src = dataUrl;
            dropzone.classList.add('dropzone--filled');
            onImageReady(dataUrl);
        });
    }

    // Клик по зоне → открыть выбор файла
    dropzone.addEventListener('click', () => input.click());

    // Выбор файла через диалог
    input.addEventListener('change', e => setImage(e.target.files[0]));

    // Drag & Drop
    ['dragenter', 'dragover'].forEach(evt => {
        dropzone.addEventListener(evt, e => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('dropzone--over');
        });
    });

    ['dragleave', 'drop'].forEach(evt => {
        dropzone.addEventListener(evt, e => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dropzone--over');
        });
    });

    dropzone.addEventListener('drop', e => {
        const file = e.dataTransfer.files[0];
        setImage(file);
    });
}

/* ============================================================
 * Точка входа
 * ============================================================ */
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

    let db;
    try {
        db = await loadDatabase();
    } catch (error) {
        showModal('Ошибка загрузки', error.message, 'error');
        return;
    }

    if (mode === 'create' && isAdmin) {
        renderCreateForm(db);
        return;
    }

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
        description: p.Description || null,
        imageData: p.Image_Data || null
    };

    if (mode === 'edit' && isAdmin) {
        renderEditForm(db, product);
    } else {
        renderView(db, product, user);
    }
});

/* ============================================================
 * Просмотр
 * ============================================================ */
function renderView(db, product, user) {
    let sizes = [];
    try {
        sizes = query(db,
            `SELECT Size FROM Product_Sizes WHERE Product_Code = ${product.code}`
        ).map(r => r.Size);
    } catch (e) { sizes = []; }

    const sizesHtml = sizes.length
        ? `<div class="product__sizes">${sizes.map((s, i) =>
              `<label class="size-option">
                  <input type="radio" name="size" value="${s}" ${i === 0 ? 'checked' : ''}>
                  <span>${s}</span>
              </label>`).join('')}</div>`
        : '<p class="product__no-sizes">Размеры не указаны</p>';

    const imageUrl = product.imageData
        || PRODUCT_IMAGES[product.code]
        || PLACEHOLDER_IMAGE;

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
            `Заказ №${orderCode} на сумму ${formatPrice(order.total)} сохранён.`, 'info');
        document.getElementById('modal-ok').addEventListener('click', () => {
            window.location.href = 'orders.html';
        }, { once: true });
    });
}

/* ============================================================
 * Редактирование (админ)
 * ============================================================ */
function renderEditForm(db, product) {
    const currentImage = product.imageData
        || PRODUCT_IMAGES[product.code]
        || PLACEHOLDER_IMAGE;

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

            ${imageDropzoneHtml(currentImage)}

            <div class="product__actions">
                <button id="save-btn" class="btn btn--primary" type="button">Сохранить</button>
                <button id="cancel-btn" class="btn btn--ghost btn--dark" type="button">Отмена</button>
            </div>
        </div>
    `;

    let newImageData = null;
    bindImageDropzone(dataUrl => { newImageData = dataUrl; });

    document.getElementById('cancel-btn')
        .addEventListener('click', () => { window.location.href = 'catalog.html'; });

    document.getElementById('save-btn').addEventListener('click', () => {
        const name = document.getElementById('edit-name').value.trim();
        const price = Number(document.getElementById('edit-price').value);
        const quantity = Number(document.getElementById('edit-quantity').value);

        if (!name) { showModal('Ошибка', 'Название не может быть пустым.', 'warning'); return; }
        if (!(price >= 0)) { showModal('Ошибка', 'Цена должна быть неотрицательной.', 'warning'); return; }
        if (!Number.isInteger(quantity) || quantity < 0) {
            showModal('Ошибка', 'Количество должно быть целым неотрицательным.', 'warning'); return;
        }

        const patch = {
            Product_Name: name,
            Price: price,
            Quantity: quantity
        };
        if (newImageData) patch.Image_Data = newImageData;

        try {
            editProductCombined(db, product.code, patch);
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
 * Создание (админ)
 * ============================================================ */
function renderCreateForm(db) {
    const nextCode = (getProductsCombined(db).reduce((m, p) => Math.max(m, p.Product_Code), 0)) + 1;

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

            ${imageDropzoneHtml(PLACEHOLDER_IMAGE)}

            <div class="product__actions">
                <button id="save-btn" class="btn btn--primary" type="button">Создать</button>
                <button id="cancel-btn" class="btn btn--ghost btn--dark" type="button">Отмена</button>
            </div>
        </div>
    `;

    let newImageData = null;
    bindImageDropzone(dataUrl => { newImageData = dataUrl; });

    document.getElementById('cancel-btn')
        .addEventListener('click', () => { window.location.href = 'catalog.html'; });

    document.getElementById('save-btn').addEventListener('click', () => {
        const name = document.getElementById('edit-name').value.trim();
        const price = Number(document.getElementById('edit-price').value);
        const quantity = Number(document.getElementById('edit-quantity').value);

        if (!name) { showModal('Ошибка', 'Введите название товара.', 'warning'); return; }
        if (!(price >= 0) || !Number.isInteger(quantity) || quantity < 0) {
            showModal('Ошибка', 'Проверьте цену и количество.', 'warning'); return;
        }

        const newProduct = {
            Product_Code: nextCode,
            Product_Name: name,
            Price: price,
            Quantity: quantity,
            Image_Data: newImageData || null
        };

        try {
            addProductCombined(db, newProduct);
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
