'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const user = requireAuth();
    if (!user) return;

    document.getElementById('user-name').textContent = user.fullName;

    const roleLabel = { customer: 'Клиент', manager: 'Менеджер', admin: 'Администратор' };
    document.getElementById('user-role').textContent = roleLabel[user.role] || '';

    const isManager = store.isManager();
    const isAdmin   = store.isAdmin();

    // Показываем панель инструментов только менеджеру и админу
    if (isManager) {
        document.getElementById('toolbar').hidden = false;
    }
    // Кнопка «Добавить товар» — только админу
    if (isAdmin) {
        document.getElementById('add-product-btn').hidden = false;
    }

    // Обработчики навигации
    document.getElementById('logout-btn').addEventListener('click', () => {
        store.clearUser();
        window.location.href = 'index.html';
    });
    document.getElementById('goto-orders').addEventListener('click', () => {
        window.location.href = 'orders.html';
    });

    const searchInput  = document.getElementById('search-input');
    const filterStock  = document.getElementById('filter-stock');
    const sortSelect   = document.getElementById('sort-select');
    const catalogBody  = document.getElementById('catalog-body');
    const catalogEmpty = document.getElementById('catalog-empty');

    // Восстанавливаем настройки только для тех, кому они доступны
    if (isManager) {
        const prefs = store.getCatalogPrefs();
        searchInput.value = prefs.searchQuery;
        filterStock.value = prefs.stockFilter;
        sortSelect.value  = prefs.sortKey;
    }

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

        // Поиск/фильтр/сортировка — только для менеджера и админа
        if (isManager) {
            const prefs = store.getCatalogPrefs();

            if (prefs.searchQuery) {
                const q = prefs.searchQuery.toLowerCase();
                items = items.filter(i => i.name.toLowerCase().includes(q));
            }
            if (prefs.stockFilter === 'many') items = items.filter(i => i.stockLabel === 'много');
            else if (prefs.stockFilter === 'few') items = items.filter(i => i.stockLabel === 'мало');

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
            items.sort(sorters[prefs.sortKey] || sorters['code-asc']);
        }

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

            let actionsCell = '';
            if (isAdmin) {
                actionsCell = `
                    <td class="row-actions">
                        <button class="btn btn--ghost btn--dark btn--small edit-btn"
                                data-code="${item.code}" type="button">✎</button>
                        <button class="btn btn--ghost btn--dark btn--small delete-btn"
                                data-code="${item.code}" type="button">🗑</button>
                    </td>
                `;
            } else if (isManager) {
                actionsCell = `
                    <td>
                        <button class="btn btn--primary btn--small add-btn"
                                data-code="${item.code}" type="button">В корзину</button>
                    </td>
                `;
            }

            tr.innerHTML = `
                <td>${item.code}</td>
                <td>${item.name}</td>
                <td>${priceCell}</td>
                <td>${formatPrice(item.finalPrice)}</td>
                <td>${item.quantity}</td>
                <td><span class="badge ${badgeClass}">${item.stockLabel}</span></td>
                ${actionsCell}
            `;

            // Клик по строке открывает карточку товара только у менеджера/админа
            if (isManager) {
                tr.addEventListener('click', e => {
                    if (e.target.closest('button')) return;
                    store.setSelectedProduct(item.code);
                    window.location.href = 'product.html';
                });
            }

            catalogBody.appendChild(tr);
        });

        // Обработчики кнопок в строках
        if (isManager && !isAdmin) {
            catalogBody.querySelectorAll('.add-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const item = catalog.find(i => i.code === Number(btn.dataset.code));
                    if (!item || item.quantity < 1) {
                        showModal('Нет в наличии', 'Товар закончился на складе.', 'warning');
                        return;
                    }
                    store.addToCart({
                        code: item.code,
                        name: item.name,
                        price: item.finalPrice,
                        size: '—',
                        quantity: 1
                    });
                    updateCartBadge();
                    showToast(`«${item.name}» добавлен в корзину`, 'success');
                });
            });
        }

        if (isAdmin) {
            catalogBody.querySelectorAll('.edit-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    store.setSelectedProduct(Number(btn.dataset.code));
                    window.location.href = 'product.html?mode=edit';
                });
            });
            catalogBody.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const code = Number(btn.dataset.code);
                    const item = catalog.find(i => i.code === code);
                    if (!item) return;
                    if (!confirm(`Удалить товар «${item.name}»?`)) return;

                    // Удаляем в памяти (в БД sql.js это живёт до перезагрузки)
                    try {
                        db.run(`DELETE FROM Products WHERE Product_Code = ${code}`);
                        catalog = catalog.filter(i => i.code !== code);
                        render();
                        showToast('Товар удалён', 'success');
                    } catch (e) {
                        showModal('Ошибка удаления', e.message, 'error');
                    }
                });
            });
        }
    }

    // Обработчики тулбара — только если панель видима
    if (isManager) {
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
    }

    // Кнопка «Добавить товар» — только админ
    const addBtn = document.getElementById('add-product-btn');
    addBtn.addEventListener('click', () => {
        window.location.href = 'product.html?mode=create';
    });

    render();
    updateCartBadge();
});
