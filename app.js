'use strict';


const CONFIG = {
    lowStockThreshold: 5,
    manyStockThreshold: 10,
    discountRules: [
        { maxQuantity: 5,        percent: 10 },
        { maxQuantity: 10,       percent: 5  },
        { maxQuantity: Infinity, percent: 0  }
    ]
};


const USERS = {
    'yuder':   'Юдер Айл',
    'kiashir': 'Кишиар Ла Орр',
    'ever':    'Эвер Бэк',
    'hinn':    'Хинн Элдер',
    'finn':    'Финн Элдер'
};


const state = {
    db: null,
    currentUser: null,
    catalog: [],            
    sortKey: 'code-asc',   
    searchQuery: '',
    stockFilter: 'all',
    selectedProduct: null,
    localOrders: []       
};


const dom = {};

function cacheDom() {
    dom.loginScreen     = document.getElementById('screen-login');
    dom.catalogScreen   = document.getElementById('screen-catalog');
    dom.productScreen   = document.getElementById('screen-product');
    dom.ordersScreen    = document.getElementById('screen-orders');

    dom.loginForm       = document.getElementById('login-form');
    dom.loginInput      = document.getElementById('login-input');
    dom.loginError      = document.getElementById('login-error');
    dom.userNames       = document.querySelectorAll(
        '#user-name, #user-name-product, #user-name-orders'
    );
    dom.logoutBtn       = document.getElementById('logout-btn');

    dom.searchInput     = document.getElementById('search-input');
    dom.filterStock     = document.getElementById('filter-stock');
    dom.sortSelect      = document.getElementById('sort-select');
    dom.catalogBody     = document.getElementById('catalog-body');
    dom.catalogEmpty    = document.getElementById('catalog-empty');

    dom.productDetails  = document.getElementById('product-details');
    dom.backToCatalog   = document.getElementById('back-to-catalog');
    dom.backToCatalog2  = document.getElementById('back-to-catalog-2');

    dom.ordersBody      = document.getElementById('orders-body');
    dom.ordersEmpty     = document.getElementById('orders-empty');

    dom.modal           = document.getElementById('modal');
    dom.modalTitle      = document.getElementById('modal-title');
    dom.modalText       = document.getElementById('modal-text');
    dom.modalOk         = document.getElementById('modal-ok');

    dom.toast           = document.getElementById('toast');
}


function executeQuery(sql) {
    const res = state.db.exec(sql);
    if (!res || res.length === 0) return [];

    const { columns, values } = res[0];
    return values.map(row => {
        const record = {};
        columns.forEach((c, i) => record[c] = row[i]);
        return record;
    });
}


function formatPrice(value) {
    if (value === null || value === undefined) return '—';
    return `${Number(value).toFixed(2)} ₽`;
}

function calculateDiscount(price, quantity) {
    const rule = CONFIG.discountRules.find(r => quantity <= r.maxQuantity);
    const discountPercent = rule ? rule.percent : 0;
    return {
        finalPrice: price - (price * discountPercent / 100),
        discountPercent
    };
}

function getStockLabel(quantity) {
    return quantity >= CONFIG.manyStockThreshold ? 'много' : 'мало';
}


function showToast(message, type = 'info') {
    dom.toast.textContent = message;
    dom.toast.className = `toast toast--${type}`;
    dom.toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { dom.toast.hidden = true; }, 2500);
}


function showModal(title, text, type = 'info') {
    const icons = { info: 'ℹ️', warning: '⚠️', error: '⛔' };
    dom.modalTitle.textContent = `${icons[type]} ${title}`;
    dom.modalText.textContent = text;
    dom.modal.hidden = false;
}

function hideModal() {
    dom.modal.hidden = true;
}


function showScreen(screenName) {
    const titles = {
        login:   'Turning Shop — Вход',
        catalog: 'Turning Shop — Каталог',
        product: 'Turning Shop — Товар',
        orders:  'Turning Shop — Мои заказы'
    };
    document.title = titles[screenName] || 'Turning Shop';

    const screens = {
        login:   dom.loginScreen,
        catalog: dom.catalogScreen,
        product: dom.productScreen,
        orders:  dom.ordersScreen
    };
    Object.values(screens).forEach(s => s.classList.remove('screen--active'));
    screens[screenName].classList.add('screen--active');
}


function handleLogin(event) {
    event.preventDefault();
    const login = dom.loginInput.value.trim().toLowerCase();

    if (!login) {
        dom.loginError.textContent = 'Введите логин';
        return;
    }

    const fullName = USERS[login];
    if (!fullName) {
        dom.loginError.textContent = 'Пользователь с таким логином не найден';
        showModal('Ошибка входа',
            'Пользователь с указанным логином не найден. Проверьте правильность ввода.',
            'error');
        return;
    }

    dom.loginError.textContent = '';
    state.currentUser = { login, fullName };
    dom.userNames.forEach(el => el.textContent = fullName);

    showScreen('catalog');
    showToast(`Добро пожаловать, ${fullName}!`, 'success');
}

function handleLogout() {
    state.currentUser = null;
    state.searchQuery = '';
    state.stockFilter = 'all';
    state.sortKey = 'code-asc';

    dom.loginInput.value = '';
    dom.searchInput.value = '';
    dom.filterStock.value = 'all';
    dom.sortSelect.value = 'code-asc';

    showScreen('login');
}


function loadCatalogFromDb() {
    const rows = executeQuery('SELECT * FROM Products ORDER BY Product_Code');

    state.catalog = rows.map(p => {
        const { finalPrice, discountPercent } = calculateDiscount(p.Price, p.Quantity);
        return {
            code: p.Product_Code,
            name: p.Product_Name,
            price: Number(p.Price),
            quantity: p.Quantity,
            imageUrl: p.Image_URL || 'https://placehold.co/300x300?text=No+Image',
            description: p.Description || '',
            finalPrice,
            discountPercent,
            stockLabel: getStockLabel(p.Quantity)
        };
    });
}

function applySearchFilterSort() {
    let items = [...state.catalog];

 
    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        items = items.filter(i => i.name.toLowerCase().includes(q));
    }


    if (state.stockFilter === 'many') {
        items = items.filter(i => i.stockLabel === 'много');
    } else if (state.stockFilter === 'few') {
        items = items.filter(i => i.stockLabel === 'мало');
    }


    const sorters = {
        'code-asc':   (a, b) => a.code - b.code,
        'code-desc':  (a, b) => b.code - a.code,
        'name-asc':   (a, b) => a.name.localeCompare(b.name),
        'name-desc':  (a, b) => b.name.localeCompare(a.name),
        'price-asc':  (a, b) => a.price - b.price,
        'price-desc': (a, b) => b.price - a.price,
        'qty-asc':    (a, b) => a.quantity - b.quantity,
        'qty-desc':   (a, b) => b.quantity - a.quantity
    };
    items.sort(sorters[state.sortKey] || sorters['code-asc']);

    renderCatalog(items);
}

function renderCatalog(items) {
    dom.catalogBody.innerHTML = '';

    if (items.length === 0) {
        dom.catalogEmpty.hidden = false;
        return;
    }
    dom.catalogEmpty.hidden = true;

    items.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = item.quantity < CONFIG.lowStockThreshold
            ? 'data-table__row--low' : '';
        tr.dataset.code = item.code;

        const priceCell = item.discountPercent > 0
            ? `${formatPrice(item.price)} <small>(-${item.discountPercent}%)</small>`
            : formatPrice(item.price);

        const badgeClass = item.stockLabel === 'много' ? 'badge--many' : 'badge--few';

        tr.innerHTML = `
            <td>${item.code}</td>
            <td>${item.name}</td>
            <td>${priceCell}</td>
            <td>${formatPrice(item.finalPrice)}</td>
            <td>${item.quantity}</td>
            <td><span class="badge ${badgeClass}">${item.stockLabel}</span></td>
        `;

        tr.addEventListener('click', () => openProductCard(item.code));
        dom.catalogBody.appendChild(tr);
    });
}

function openProductCard(productCode) {
    const product = state.catalog.find(p => p.code === productCode);
    if (!product) return;

    const sizes = executeQuery(
        `SELECT Size FROM Product_Sizes WHERE Product_Code = ${productCode}`
    ).map(r => r.Size);

    state.selectedProduct = product;

    const sizesHtml = sizes.length
        ? `<div class="product__sizes">${sizes.map((s, i) =>
              `<label class="size-option">
                  <input type="radio" name="size" value="${s}" ${i === 0 ? 'checked' : ''}>
                  <span>${s}</span>
              </label>`).join('')}</div>`
        : '<p class="product__no-sizes">Размеры не указаны</p>';

    dom.productDetails.innerHTML = `
        <img class="product__image" src="${product.imageUrl}" alt="${product.name}">
        <div class="product__info">
            <h2 class="product__name">${product.name}</h2>
            <p class="product__desc">${product.description || '—'}</p>
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
                <button id="add-to-order" class="btn btn--primary" type="button">Добавить в заказ</button>
                <button id="cancel-order" class="btn btn--ghost" type="button">Отмена</button>
            </div>
        </div>
    `;

    document.getElementById('add-to-order')
        .addEventListener('click', handleAddToOrder);
    document.getElementById('cancel-order')
        .addEventListener('click', () => showScreen('catalog'));

    document.getElementById('product-quantity')
        .addEventListener('input', validateQuantityInput);

    showScreen('product');
}

function validateQuantityInput() {
    const input = document.getElementById('product-quantity');
    const error = document.getElementById('quantity-error');
    const value = Number(input.value);
    const max = state.selectedProduct.quantity;

    if (!Number.isInteger(value) || value < 1) {
        error.textContent = 'Введите целое число от 1';
        return false;
    }
    if (value > max) {
        error.textContent = `Доступно только ${max} шт.`;
        return false;
    }
    error.textContent = '';
    return true;
}

function handleAddToOrder() {
    if (!validateQuantityInput()) {
        showModal('Некорректное значение',
            'Проверьте количество: оно должно быть целым и не превышать доступный остаток.',
            'warning');
        return;
    }

    const quantity = Number(document.getElementById('product-quantity').value);
    const sizeInput = document.querySelector('input[name="size"]:checked');
    const size = sizeInput ? sizeInput.value : '—';
    const product = state.selectedProduct;

    if (quantity > product.quantity) {
        showModal('Недостаточно товара',
            `На складе осталось ${product.quantity} шт. Уменьшите количество.`,
            'warning');
        return;
    }

    const order = {
        code: generateOrderCode(),
        date: new Date().toISOString().slice(0, 10),
        customer: state.currentUser.fullName,
        productCode: product.code,
        productName: product.name,
        size,
        quantity,
        total: product.finalPrice * quantity
    };
    state.localOrders.push(order);

    product.quantity -= quantity;
    product.stockLabel = getStockLabel(product.quantity);

    showModal('Заказ оформлен',
        `Товар «${product.name}» (размер ${size}, ${quantity} шт.) добавлен в заказ №${order.code}.`,
        'info');

    applySearchFilterSort();
    showScreen('catalog');
}

function generateOrderCode() {
    const maxLocal = state.localOrders.reduce((m, o) => Math.max(m, o.code), 0);
    const maxDb = executeQuery('SELECT MAX(Order_Code) AS m FROM Orders')[0]?.m || 0;
    return Math.max(maxLocal, maxDb) + 1;
}

function renderOrders() {
    dom.ordersBody.innerHTML = '';

    if (state.localOrders.length === 0) {
        dom.ordersEmpty.hidden = false;
        return;
    }
    dom.ordersEmpty.hidden = true;

    state.localOrders.forEach(o => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${o.code}</td>
            <td>${o.date}</td>
            <td>${o.productName} — ${o.size}, ${o.quantity} шт.</td>
            <td>${formatPrice(o.total)}</td>
        `;
        dom.ordersBody.appendChild(tr);
    });
}


async function initializeApp() {
    cacheDom();

   
    dom.loginForm.addEventListener('submit', handleLogin);
    dom.logoutBtn.addEventListener('click', handleLogout);
    dom.searchInput.addEventListener('input', e => {
        state.searchQuery = e.target.value;
        applySearchFilterSort();
    });
    dom.filterStock.addEventListener('change', e => {
        state.stockFilter = e.target.value;
        applySearchFilterSort();
    });
    dom.sortSelect.addEventListener('change', e => {
        state.sortKey = e.target.value;
        applySearchFilterSort();
    });
    dom.backToCatalog.addEventListener('click', () => showScreen('catalog'));
    dom.backToCatalog2.addEventListener('click', () => showScreen('catalog'));
    dom.modalOk.addEventListener('click', hideModal);
    dom.modal.addEventListener('click', e => {
        if (e.target === dom.modal) hideModal();
    });

 
    showScreen('login');

    try {
        const SQL = await initSqlJs({ locateFile: file => `./${file}` });
        const response = await fetch('./db.db');
        if (!response.ok) throw new Error(`Не удалось загрузить db.db (HTTP ${response.status})`);

        const buffer = await response.arrayBuffer();
        state.db = new SQL.Database(new Uint8Array(buffer));

        loadCatalogFromDb();
        applySearchFilterSort();
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showModal('Ошибка загрузки', error.message, 'error');
    }

}

document.addEventListener('DOMContentLoaded', initializeApp);
