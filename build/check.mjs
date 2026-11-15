// Проверка страниц: файлы, якоря, шрифты, вкладки, меню, форма.
// Запуск: node build/check.mjs  (BASE_URL=http://127.0.0.1:8112 при другом порте)
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.env.BASE_URL || 'http://127.0.0.1:8111';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9444;
const profile = mkdtempSync(join(tmpdir(), 'cdp-check-'));
const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let url;
for (let i = 0; i < 60 && !url; i++) {
    try {
        const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        url = pages.find((p) => p.type === 'page')?.webSocketDebuggerUrl;
    } catch { /* ждём */ }
    if (!url) await sleep(150);
}
const socket = new WebSocket(url);
await new Promise((r) => (socket.onopen = r));
let id = 0;
const pending = new Map();
socket.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    socket.send(JSON.stringify({ id: n, method, params }));
});
const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
const open = async (path, width = 1440) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
    await send('Page.navigate', { url: base + path });
    await sleep(1500);
};

const problems = [];

// 1. якоря, дубли id, отсутствующие файлы на всех страницах
for (const page of ['/index.html', '/legal.html', '/kit.html']) {
    await open(page);
    const report = await run(`(() => {
        const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
        const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
        const dead = [...document.querySelectorAll('a[href^="#"]')]
            .map(a => a.getAttribute('href'))
            .filter(h => h !== '#' && !document.getElementById(h.slice(1)));
        const files = [...document.querySelectorAll('a[href$=".html"], a[href$=".pdf"], a[href*=".css"], a[href$=".js"], img[src], link[href]')]
            .map(el => el.getAttribute('href') || el.getAttribute('src'))
            .filter(Boolean);
        return JSON.stringify({ dup, dead, assets: [...new Set(files)] });
    })()`);
    const { dup, dead, assets } = JSON.parse(report);
    if (dup.length) problems.push(`${page}: дубли id ${dup.join(', ')}`);
    if (dead.length) problems.push(`${page}: мёртвые якоря ${dead.join(', ')}`);
    for (const asset of assets) {
        if (/^(https?:|mailto:)/.test(asset)) continue;
        const res = await fetch(`${base}/${asset.replace(/^\.\//, '')}`);
        if (!res.ok) problems.push(`${page}: не найден ${asset} (${res.status})`);
    }
    const title = await run('document.title');
    console.log(`${page} — «${title.slice(0, 60)}…»`);
}

// 1b. файлы шрифтов из @font-face: путь в CSS считается от самой CSS
const fontCss = await (await fetch(`${base}/assets/css/fonts.css`)).text();
for (const [, rel] of fontCss.matchAll(/url\("([^"]+\.woff2)"\)/g)) {
    const res = await fetch(new URL(rel, `${base}/assets/css/fonts.css`));
    if (!res.ok) problems.push(`fonts.css: не найден ${rel} (${res.status})`);
}
console.log(`шрифты: ${fontCss.match(/@font-face/g).length} правил @font-face проверено`);

// 2. вкладки
await open('/index.html');
const tabs = await run(`(async () => {
    const t = [...document.querySelectorAll('[role="tab"]')];
    t[1].click();
    const after = document.getElementById('panel-youth').hidden === false && document.getElementById('panel-main').hidden === true;
    t[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    const back = document.getElementById('panel-main').hidden === false;
    const selected = t[0].getAttribute('aria-selected') === 'true' && t[1].getAttribute('aria-selected') === 'false';
    return JSON.stringify({ after, back, selected });
})()`);
console.log('вкладки:', tabs);
if (!JSON.parse(tabs).after || !JSON.parse(tabs).back || !JSON.parse(tabs).selected) problems.push('вкладки: переключение сломано');

// 3. мобильное меню и форма
await open('/index.html', 390);
const mobile = await run(`(() => {
    const b = document.getElementById('burger');
    const nav = document.getElementById('nav');
    const hiddenBefore = getComputedStyle(nav).display === 'none';
    b.click();
    const shownAfter = getComputedStyle(nav).display === 'block';
    const expanded = b.getAttribute('aria-expanded') === 'true';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const closed = getComputedStyle(nav).display === 'none';
    return JSON.stringify({ hiddenBefore, shownAfter, expanded, closed });
})()`);
console.log('меню:', mobile);
if (Object.values(JSON.parse(mobile)).includes(false)) problems.push('меню: ' + mobile);

const form = await run(`(() => {
    const f = document.getElementById('reg-form');
    f.querySelector('#f-name').value = 'Тест';
    f.querySelector('#f-mail').value = 'no-mail';
    const invalidBlocked = f.checkValidity() === false;
    f.querySelector('#f-mail').value = 'test@example.ru';
    f.querySelector('#f-tel').value = '+7 900 000 00 00';
    f.querySelector('#f-format').value = [...f.querySelector('#f-format').options][1].value;
    f.querySelector('input[name=consent]').checked = true;
    f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    const status = document.getElementById('form-status').textContent;
    return JSON.stringify({ invalidBlocked, status });
})()`);
console.log('форма:', form);
if (!JSON.parse(form).status) problems.push('форма: нет ответа на отправку');

console.log(problems.length ? `\nПРОБЛЕМЫ:\n- ${problems.join('\n- ')}` : '\nВсё чисто.');
socket.close();
child.kill();
process.exit(problems.length ? 1 : 0);
