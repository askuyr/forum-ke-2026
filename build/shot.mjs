// Скриншот страницы целиком и поиск горизонтального переполнения через CDP.
// Запуск: node build/shot.mjs <url> <ширина> <путь.png>
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [, , url, widthArg, outPath] = process.argv;
const width = Number(widthArg || 1440);
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9333 + (width % 100);
const profile = mkdtempSync(join(tmpdir(), 'cdp-'));
const child = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ws() {
    for (let i = 0; i < 60; i++) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/list`);
            const pages = await res.json();
            const page = pages.find((p) => p.type === 'page');
            if (page) return page.webSocketDebuggerUrl;
        } catch { /* ещё поднимается */ }
        await sleep(150);
    }
    throw new Error('CDP не отвечает');
}

const socket = new WebSocket(await ws());
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
await new Promise((r) => (socket.onopen = r));
const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    socket.send(JSON.stringify({ id: n, method, params }));
});

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await send('Page.navigate', { url });
await sleep(2500);

const overflow = await send('Runtime.evaluate', {
    expression: `JSON.stringify((() => {
        const vw = document.documentElement.clientWidth;
        const bad = [...document.querySelectorAll('body *')]
            .filter(el => el.getBoundingClientRect().right > vw + 1 || el.getBoundingClientRect().left < -1)
            .slice(0, 25)
            .map(el => ({
                tag: el.tagName.toLowerCase(),
                cls: String(el.className).slice(0, 40),
                left: Math.round(el.getBoundingClientRect().left),
                right: Math.round(el.getBoundingClientRect().right),
            }));
        return { vw, scrollW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, bad };
    })())`,
    returnByValue: true,
});
console.log(overflow.result.value);

const metrics = await send('Page.getLayoutMetrics');
const { width: cw, height: ch } = metrics.cssContentSize;
const shot = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: cw, height: ch, scale: 1 },
});
writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
console.log(`saved ${outPath} ${cw}x${ch}`);
socket.close();
child.kill();
