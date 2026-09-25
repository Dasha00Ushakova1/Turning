'use strict';

/* ============================================================
 * Пользователи (логин → ФИО)
 * ============================================================ */
const USERS = {
    'yuder':   { fullName: 'Юдер Айл',         role: 'customer' },
    'kiashir': { fullName: 'Кишиар Ла Орр',    role: 'customer' },
    'ever':    { fullName: 'Эвер Бэк',         role: 'customer' },
    'hinn':    { fullName: 'Хинн Элдер',       role: 'customer' },
    'finn':    { fullName: 'Финн Элдер',       role: 'customer' },
    'manager': { fullName: 'Лушан', role: 'manager'  },
    'admin':   { fullName: 'Энон',   role: 'admin'    }
};

/* ============================================================
 * Конфигурация предметной области
 * ============================================================ */
const CONFIG = {
    lowStockThreshold: 5,
    manyStockThreshold: 10,
    discountRules: [
        { maxQuantity: 5,        percent: 10 },
        { maxQuantity: 10,       percent: 5  },
        { maxQuantity: Infinity, percent: 0  }
    ]
};

/* ============================================================
 * Хранилище состояния (localStorage)
 * ============================================================ */
const store = {
    /* ---------- Пользователь ---------- */
    getUser() {
        const raw = localStorage.getItem('user');
        return raw ? JSON.parse(raw) : null;
    },
    setUser(user) {
        localStorage.setItem('user', JSON.stringify(user));
    },
    clearUser() {
        localStorage.removeItem('user');
    },

    /* ---------- Заказы ---------- */
    getOrders() {
        const raw = localStorage.getItem('orders');
        return raw ? JSON.parse(raw) : [];
    },
    setOrders(orders) {
        localStorage.setItem('orders', JSON.stringify(orders));
    },
    addOrder(order) {
        const orders = this.getOrders();
        orders.push(order);
        this.setOrders(orders);
    },

    /* ---------- Параметры каталога ---------- */
    getCatalogPrefs() {
        const raw = localStorage.getItem('catalogPrefs');
        return raw ? JSON.parse(raw) : {
            searchQuery: '',
            stockFilter: 'all',
            sortKey: 'code-asc'
        };
    },
    setCatalogPrefs(prefs) {
        localStorage.setItem('catalogPrefs', JSON.stringify(prefs));
    },

    /* ---------- Выбранный товар ---------- */
    setSelectedProduct(code) {
        localStorage.setItem('selectedProduct', String(code));
    },
    getSelectedProduct() {
        const v = localStorage.getItem('selectedProduct');
        return v ? Number(v) : null;
    },

    /* ---------- Корзина ---------- */
    getCart() {
        const raw = localStorage.getItem('cart');
        return raw ? JSON.parse(raw) : [];
    },
    setCart(items) {
        localStorage.setItem('cart', JSON.stringify(items));
    },
    addToCart(item) {
        const cart = this.getCart();
        const existing = cart.find(
            c => c.code === item.code && c.size === item.size
        );
        if (existing) {
            existing.quantity += item.quantity;
        } else {
            cart.push({ ...item });
        }
        this.setCart(cart);
    },
    removeFromCart(code, size) {
        this.setCart(
            this.getCart().filter(c => !(c.code === code && c.size === size))
        );
    },
    updateCartQuantity(code, size, quantity) {
        const cart = this.getCart();
        const item = cart.find(c => c.code === code && c.size === size);
        if (item) {
            item.quantity = quantity;
            this.setCart(cart);
        }
    },
    clearCart() {
        localStorage.removeItem('cart');
    },
    getCartCount() {
        return this.getCart().reduce((sum, item) => sum + item.quantity, 0);
    }
};
    /* ---------- Роли ---------- */
    isManager() {
        const u = this.getUser();
        return !!u && (u.role === 'manager' || u.role === 'admin');
    },
    isAdmin() {
        const u = this.getUser();
        return !!u && u.role === 'admin';
    },

    /* ---------- Работа с заказами (CRUD) ---------- */
    getOrderByCode(code) {
        return this.getOrders().find(o => o.code === code) || null;
    },
    updateOrder(code, patch) {
        const orders = this.getOrders();
        const idx = orders.findIndex(o => o.code === code);
        if (idx === -1) return;
        orders[idx] = { ...orders[idx], ...patch };
        this.setOrders(orders);
    },
    removeOrderItem(orderCode, itemIndex) {
        const orders = this.getOrders();
        const order = orders.find(o => o.code === orderCode);
        if (!order) return;
        order.items.splice(itemIndex, 1);
        order.total = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
        this.setOrders(orders);
    },
    addOrderItem(orderCode, item) {
        const orders = this.getOrders();
        const order = orders.find(o => o.code === orderCode);
        if (!order) return;
        const existing = order.items.find(
            i => i.productCode === item.productCode && i.size === item.size
        );
        if (existing) {
            existing.quantity += item.quantity;
        } else {
            order.items.push({ ...item });
        }
        order.total = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
        this.setOrders(orders);
    }

/* ============================================================
 * Загрузка БД (кэшируется на время жизни страницы)
 * ============================================================ */
let _dbCache = null;

async function loadDatabase() {
    if (_dbCache) return _dbCache;

    const SQL = await initSqlJs({ locateFile: file => `./${file}` });
    const response = await fetch('./db.db');
    if (!response.ok) {
        throw new Error(`Не удалось загрузить db.db (HTTP ${response.status})`);
    }
    const buffer = await response.arrayBuffer();
    _dbCache = new SQL.Database(new Uint8Array(buffer));
    return _dbCache;
}

/**
 * Выполняет SQL-запрос и возвращает массив объектов { columnName: value }.
 * @param {object} db
 * @param {string} sql
 * @returns {Array<Object>}
 */
function query(db, sql) {
    const res = db.exec(sql);
    if (!res || res.length === 0) return [];

    const { columns, values } = res[0];
    return values.map(row => {
        const obj = {};
        columns.forEach((c, i) => { obj[c] = row[i]; });
        return obj;
    });
}

/* ============================================================
 * Расчёты и форматирование
 * ============================================================ */
function formatPrice(value) {
    if (value === null || value === undefined) return '—';
    return `${Number(value).toFixed(2)} ₽`;
}

function calculateDiscount(price, quantity) {
    const rule = CONFIG.discountRules.find(r => quantity <= r.maxQuantity);
    const percent = rule ? rule.percent : 0;
    return {
        finalPrice: price - (price * percent / 100),
        discountPercent: percent
    };
}

function getStockLabel(quantity) {
    return quantity >= CONFIG.manyStockThreshold ? 'много' : 'мало';
}

/* ============================================================
 * Защита страниц
 * ============================================================ */
function requireAuth() {
    const user = store.getUser();
    if (!user) {
        window.location.href = 'index.html';
        return null;
    }
    return user;
}

/* ============================================================
 * UI-помощники: модальное окно и тост
 * ============================================================ */
function ensureUiHelpers() {
    const modal = document.getElementById('modal');
    const toast = document.getElementById('toast');
    if (!modal || !toast) return;

    const modalTitle = document.getElementById('modal-title');
    const modalText = document.getElementById('modal-text');
    const modalOk = document.getElementById('modal-ok');

    modalOk.addEventListener('click', () => {
        modal.classList.remove('modal--visible');
        modal.hidden = true;
    });
    modal.addEventListener('click', e => {
        if (e.target === modal) {
            modal.classList.remove('modal--visible');
            modal.hidden = true;
        }
    });

    window.showModal = function (title, text, type = 'info') {
        const icons = { info: 'ℹ️', warning: '⚠️', error: '⛔' };
        modalTitle.textContent = `${icons[type]} ${title}`;
        modalText.textContent = text;
        modal.classList.add('modal--visible');
        modal.hidden = false;
    };

    window.showToast = function (message, type = 'info') {
        toast.textContent = message;
        toast.className = `toast toast--${type}`;
        toast.hidden = false;
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => { toast.hidden = true; }, 2500);
    };

    updateCartBadge();
}

/**
 * Обновляет бейдж количества товаров в корзине (элемент #cart-count).
 */
function updateCartBadge() {
    const badge = document.getElementById('cart-count');
    if (!badge) return;

    const count = store.getCartCount();
    badge.textContent = count;
    badge.hidden = count === 0;
}
/** Склонение: 1 товар, 2 товара, 5 товаров. */
function plural(n, one, few, many) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
}

/** Форматирует дату ISO (2026-01-01) в человекочитаемую. */
function formatDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
}

document.addEventListener('DOMContentLoaded', ensureUiHelpers);
