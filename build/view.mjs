// Скриншот одного экрана без captureBeyondViewport: node build/view.mjs <url> <ширина> <высота> <путь.png> [y]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [, , url, w, h, outPath, scrollY] = process.argv;
const width = Number(w), height = Number(h);
const port = 9666;
const profile = mkdtempSync(join(tmpdir(), 'cdp-v-'));
const child = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'],
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
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
await send('Page.navigate', { url });
await sleep(2500);
if (scrollY) {
    await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${Number(scrollY)}); 1` });
    await sleep(1200);
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
console.log('saved', outPath);
socket.close();
child.kill();
