'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const user = requireAuth();
    if (!user) return;

    document.getElementById('user-name').textContent = user.fullName;

    const prefs = store.getCatalogPrefs();
    const searchInput = document.getElementById('search-input');
    const filterStock = document.getElementById('filter-stock');
    const sortSelect  = document.getElementById('sort-select');
    const catalogBody = document.getElementById('catalog-body');
    const catalogEmpty = document.getElementById('catalog-empty');

    searchInput.value = prefs.searchQuery;
    filterStock.value = prefs.stockFilter;
    sortSelect.value  = prefs.sortKey;

    document.getElementById('logout-btn').addEventListener('click', () => {
        store.clearUser();
        window.location.href = 'index.html';
    });
    document.getElementById('goto-orders').addEventListener('click', () => {
        window.location.href = 'orders.html';
    });

    let catalog = [];
    let db;

    try {
        db = await loadDatabase();
        catalog = query(db, 'SELECT * FROM Products ORDER BY Product_Code').map(p => {
            const { finalPrice, discountPercent } = calculateDiscount(p.Price, p.Quantity);
            return {
                code: p.Product_Code,
                name: p.Product_Name,
                price: Number(p.Price),
                quantity: p.Quantity,
                finalPrice,
                discountPercent,
                stockLabel: getStockLabel(p.Quantity)
            };
        });
    } catch (error) {
        console.error(error);
        showModal('Ошибка загрузки', error.message, 'error');
        return;
    }

    function render() {
        let items = [...catalog];
        const { searchQuery, stockFilter, sortKey } = store.getCatalogPrefs();

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            items = items.filter(i => i.name.toLowerCase().includes(q));
        }
        if (stockFilter === 'many') items = items.filter(i => i.stockLabel === 'много');
        else if (stockFilter === 'few') items = items.filter(i => i.stockLabel === 'мало');

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
        items.sort(sorters[sortKey] || sorters['code-asc']);

        catalogBody.innerHTML = '';
        if (items.length === 0) {
            catalogEmpty.hidden = false;
            return;
        }
        catalogEmpty.hidden = true;

        items.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = item.quantity < CONFIG.lowStockThreshold
                ? 'data-table__row--low' : '';

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
            tr.addEventListener('click', () => {
                store.setSelectedProduct(item.code);
                window.location.href = 'product.html';
            });
            catalogBody.appendChild(tr);
        });
    }

    searchInput.addEventListener('input', e => {
        store.setCatalogPrefs({ ...store.getCatalogPrefs(), searchQuery: e.target.value });
        render();
    });
    filterStock.addEventListener('change', e => {
        store.setCatalogPrefs({ ...store.getCatalogPrefs(), stockFilter: e.target.value });
        render();
    });
    sortSelect.addEventListener('change', e => {
        store.setCatalogPrefs({ ...store.getCatalogPrefs(), sortKey: e.target.value });
        render();
    });

    render();
});
