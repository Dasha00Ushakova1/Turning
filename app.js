
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


let database = null;

function executeQuery(sql) {
    const result = database.exec(sql);
    if (!result || result.length === 0) {
        return [];
    }
    const { columns, values } = result[0];
    return values.map(row => {
        const record = {};
        columns.forEach((column, index) => {
            record[column] = row[index];
        });
        return record;
    });
}

function formatPrice(value) {
    if (value === null || value === undefined) {
        return '—';
    }
    return `${Number(value).toFixed(2)} ₽`;
}


function calculateDiscount(price, quantity) {
    const rule = CONFIG.discountRules.find(r => quantity <= r.maxQuantity);
    const discountPercent = rule ? rule.percent : 0;
    const finalPrice = price - (price * discountPercent / 100);
    return { finalPrice, discountPercent };
}

function getStockLabel(quantity) {
    return quantity >= CONFIG.manyStockThreshold ? 'много' : 'мало';
}

function createTableRow(cells, rowClass = '') {
    const row = document.createElement('tr');
    if (rowClass) {
        row.className = rowClass;
    }
    row.innerHTML = cells.join('');
    return row;
}


function renderTableBody(tbodyId, rows, columnCount) {
    const tbody = document.getElementById(tbodyId);
    tbody.innerHTML = '';

    if (rows.length === 0) {
        tbody.appendChild(createTableRow(
            [`<td colspan="${columnCount}" class="data-table__empty">Нет данных</td>`]
        ));
        return;
    }
    rows.forEach(row => tbody.appendChild(row));
}


function loadCatalog() {
    const products = executeQuery('SELECT * FROM Products ORDER BY Product_Code');

    const rows = products.map(product => {
        const { finalPrice, discountPercent } = calculateDiscount(
            product.Price,
            product.Quantity
        );
        const stockLabel = getStockLabel(product.Quantity);
        const isLowStock = product.Quantity < CONFIG.lowStockThreshold;

        const priceCell = discountPercent > 0
            ? `${formatPrice(product.Price)} <small>(-${discountPercent}%)</small>`
            : formatPrice(product.Price);

        const badgeClass = stockLabel === 'много' ? 'badge--many' : 'badge--few';

        return createTableRow(
            [
                `<td>${product.Product_Code}</td>`,
                `<td>${product.Product_Name}</td>`,
                `<td>${priceCell}</td>`,
                `<td>${formatPrice(finalPrice)}</td>`,
                `<td>${product.Quantity}</td>`,
                `<td><span class="badge ${badgeClass}">${stockLabel}</span></td>`
            ],
            isLowStock ? 'data-table__row--low' : ''
        );
    });

    renderTableBody('catalog-body', rows, 6);
}

function loadOrders() {
    const orders = executeQuery(`
        SELECT
            o.Order_Code,
            o.Order_Date,
            c.First_Name,
            c.Last_Name
        FROM Orders o
        JOIN Customers c ON c.Customer_Code = o.Customer_Code
        ORDER BY o.Order_Code
    `);

    const orderItems = executeQuery(`
        SELECT
            od.Order_Code,
            p.Price,
            od.Quantity
        FROM Order_Details od
        JOIN Products p ON p.Product_Code = od.Product_Code
    `);

    const totalsByOrder = calculateOrderTotals(orderItems);

    const rows = orders.map(order => {
        const total = totalsByOrder[order.Order_Code] ?? 0;

        return createTableRow([
            `<td>${order.Order_Code}</td>`,
            `<td>${order.First_Name} ${order.Last_Name}</td>`,
            `<td>${order.Order_Date}</td>`,
            `<td>${formatPrice(total)}</td>`
        ]);
    });

    renderTableBody('orders-body', rows, 4);
}

function calculateOrderTotals(items) {
    const totals = {};

    items.forEach(item => {
        const { finalPrice } = calculateDiscount(item.Price, item.Quantity);
        totals[item.Order_Code] =
            (totals[item.Order_Code] || 0) + finalPrice * item.Quantity;
    });

    return totals;
}


async function initializeApp() {
    try {
        const SQL = await initSqlJs({
            locateFile: file => `./${file}`
        });

        const response = await fetch('./db.db');
        if (!response.ok) {
            throw new Error(`Не удалось загрузить db.db (HTTP ${response.status})`);
        }

        const buffer = await response.arrayBuffer();
        database = new SQL.Database(new Uint8Array(buffer));

        loadCatalog();
        loadOrders();
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        document.getElementById('catalog-body').innerHTML =
            `<tr><td colspan="6" class="data-table__empty">Ошибка: ${error.message}</td></tr>`;
        document.getElementById('orders-body').innerHTML =
            `<tr><td colspan="4" class="data-table__empty">Ошибка: ${error.message}</td></tr>`;
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);
