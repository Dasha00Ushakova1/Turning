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
};

function updateCartBadge() {
    const badge = document.getElementById('cart-count');
    if (!badge) return;
    const count = store.getCartCount();
    badge.textContent = count;
    badge.hidden = count === 0;
}

document.addEventListener('DOMContentLoaded', ensureUiHelpers);
