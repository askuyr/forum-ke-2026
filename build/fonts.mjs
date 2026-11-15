// Что реально применено: node build/fonts.mjs <url>
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2];
const port = 9777;
const profile = mkdtempSync(join(tmpdir(), 'cdp-f-'));
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
await send('Page.navigate', { url });
await sleep(2500);
const res = await send('Runtime.evaluate', {
    expression: `(async () => {
        await document.fonts.ready;
        const faces = [...document.fonts].map(f => f.family + ' ' + f.weight + ' ' + f.style + ' — ' + f.status);
        const h1 = document.querySelector('.hero__h1');
        const probe = (family, weight) => {
            const c = document.createElement('canvas').getContext('2d');
            c.font = weight + ' 40px ' + family;
            return Math.round(c.measureText('Креативная экономика').width);
        };
        return JSON.stringify({
            faces,
            h1: getComputedStyle(h1).fontFamily + ' / ' + getComputedStyle(h1).fontWeight,
            widthCormorant: probe('"Cormorant Garamond"', 500),
            widthTimes: probe('"Times New Roman"', 500),
            widthGolos: probe('"Golos Text"', 400),
            widthSegoe: probe('"Segoe UI"', 400),
            body: getComputedStyle(document.body).fontFamily,
        }, null, 1);
    })()`,
    returnByValue: true,
    awaitPromise: true,
});
console.log(res.result.value);
socket.close();
child.kill();
