'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('login-form');
    const input = document.getElementById('login-input');
    const error = document.getElementById('login-error');

    form.addEventListener('submit', event => {
        event.preventDefault();
        const login = input.value.trim().toLowerCase();

        if (!login) {
            error.textContent = 'Введите логин';
            return;
        }

        const fullName = USERS[login];
        if (!fullName) {
            error.textContent = 'Пользователь с таким логином не найден';
            if (typeof showModal === 'function') {
                showModal(
                    'Ошибка входа',
                    'Пользователь с указанным логином не найден. Проверьте правильность ввода.',
                    'error'
                );
            }
            return;
        }

        error.textContent = '';
        store.setUser({ login, fullName });
        window.location.href = 'catalog.html';
    });
});
