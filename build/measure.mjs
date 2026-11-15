// Быстрый замер геометрии: node build/measure.mjs <url> <ширина> <selector>
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [, , url, widthArg, selector] = process.argv;
const width = Number(widthArg || 1440);
const port = 9555;
const profile = mkdtempSync(join(tmpdir(), 'cdp-m-'));
const child = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'],
    { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
        const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        wsUrl = pages.find((p) => p.type === 'page')?.webSocketDebuggerUrl;
    } catch { /* ждём */ }
    if (!wsUrl) await sleep(150);
}
const socket = new WebSocket(wsUrl);
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

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
await send('Page.navigate', { url });
await sleep(1800);
const res = await send('Runtime.evaluate', {
    expression: `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return 'нет элемента';
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        const range = document.createRange();
        range.selectNodeContents(el);
        return JSON.stringify({
            rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
            lines: range.getClientRects().length,
            maxWidth: s.maxWidth,
            display: s.display, color: s.color, fontSize: s.fontSize, opacity: s.opacity,
            text: el.textContent.trim().slice(0, 40),
        });
    })()`,
    returnByValue: true,
});
console.log(res.result.value);
socket.close();
child.kill();
