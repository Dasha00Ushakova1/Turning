'use strict';

const USERS = {
    'yuder':   'Юдер Айл',
    'kiashir': 'Кишиар Ла Орр',
    'ever':    'Эвер Бэк',
    'hinn':    'Хинн Элдер',
    'finn':    'Финн Элдер'
};

const CONFIG = {
    lowStockThreshold: 5,
    manyStockThreshold: 10,
    discountRules: [
        { maxQuantity: 5,        percent: 10 },
        { maxQuantity: 10,       percent: 5  },
        { maxQuantity: Infinity, percent: 0  }
    ]
};



const store = {
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


    setSelectedProduct(code) {
        localStorage.setItem('selectedProduct', String(code));
    },
    getSelectedProduct() {
        const v = localStorage.getItem('selectedProduct');
        return v ? Number(v) : null;
    }
};

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


function query(db, sql) {
    const res = db.exec(sql);
    if (!res || res.length === 0) return [];
    const { columns, values } = res[0];
    return values.map(row => {
        const obj = {};
        columns.forEach((c, i) => obj[c] = row[i]);
        return obj;
    });
}

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


function requireAuth() {
    const user = store.getUser();
    if (!user) {
        window.location.href = 'index.html';
        return null;
    }
    return user;
}


function goTo(page) {
    window.location.href = page;
}


function ensureUiHelpers() {
    if (!document.getElementById('modal')) return;

    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalText = document.getElementById('modal-text');
    const modalOk = document.getElementById('modal-ok');
    const toast = document.getElementById('toast');

    modalOk.addEventListener('click', () => modal.hidden = true);
    modal.addEventListener('click', e => {
        if (e.target === modal) modal.hidden = true;
    });

    window.showModal = function (title, text, type = 'info') {
        const icons = { info: 'ℹ️', warning: '⚠️', error: '⛔' };
        modalTitle.textContent = `${icons[type]} ${title}`;
        modalText.textContent = text;
        modal.hidden = false;
    };

    window.showToast = function (message, type = 'info') {
        toast.textContent = message;
        toast.className = `toast toast--${type}`;
        toast.hidden = false;
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => toast.hidden = true, 2500);
    };
}
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
        this.setCart(this.getCart().filter(c => !(c.code === code && c.size === size)));
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
function updateCartBadge() {
    const badge = document.getElementById('cart-count');
    if (!badge) return;
    const count = store.getCartCount();
    badge.textContent = count;
    badge.hidden = count === 0;
}

document.addEventListener('DOMContentLoaded', ensureUiHelpers);
