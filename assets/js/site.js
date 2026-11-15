/* Меню, вкладки программы, появление блоков и демонстрационный режим формы. */
(function () {
    'use strict';

    /* --- меню на узких экранах --- */
    var hdr = document.getElementById('hdr');
    var burger = document.getElementById('burger');
    var nav = document.getElementById('nav');

    if (burger && hdr && nav) {
        burger.addEventListener('click', function () {
            var open = hdr.classList.toggle('is-open');
            burger.setAttribute('aria-expanded', String(open));
        });
        nav.addEventListener('click', function (e) {
            if (e.target.closest('a')) {
                hdr.classList.remove('is-open');
                burger.setAttribute('aria-expanded', 'false');
            }
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && hdr.classList.contains('is-open')) {
                hdr.classList.remove('is-open');
                burger.setAttribute('aria-expanded', 'false');
                burger.focus();
            }
        });
    }

    /* --- вкладки: деловая программа и молодёжная секция --- */
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));

    function selectTab(tab) {
        tabs.forEach(function (t) {
            var panel = document.getElementById(t.getAttribute('aria-controls'));
            var on = t === tab;
            t.setAttribute('aria-selected', String(on));
            t.tabIndex = on ? 0 : -1;
            if (panel) panel.hidden = !on;
        });
    }

    tabs.forEach(function (tab, i) {
        tab.addEventListener('click', function () { selectTab(tab); });
        tab.addEventListener('keydown', function (e) {
            var next = null;
            if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
            if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
            if (e.key === 'Home') next = tabs[0];
            if (e.key === 'End') next = tabs[tabs.length - 1];
            if (next) {
                e.preventDefault();
                selectTab(next);
                next.focus();
            }
        });
    });

    /* --- мягкое появление секций --- */
    var items = document.querySelectorAll('.sec, .band, .night, .ftr');
    if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-in');
                    io.unobserve(entry.target);
                }
            });
        }, { rootMargin: '0px 0px -12% 0px' });
        items.forEach(function (el) {
            el.classList.add('reveal');
            io.observe(el);
        });
    }

    /* --- форма: отправка подключается к почте или CRM, сейчас демо-режим --- */
    var form = document.getElementById('reg-form');
    var status = document.getElementById('form-status');

    if (form && status) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (!form.checkValidity()) {
                form.reportValidity();
                status.textContent = 'Проверьте отмеченные поля.';
                return;
            }
            status.textContent = 'Форма работает в демонстрационном режиме: отправку заявок подключаем к почте оргкомитета.';
        });
    }
})();
