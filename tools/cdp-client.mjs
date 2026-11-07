import fs from 'node:fs';

const host = process.env.CDP_HOST ?? '127.0.0.1';
const port = process.env.CDP_PORT ?? '9222';

const list = await fetch(`http://${host}:${port}/json/list`).then((r) => r.json());
const page = list.find((item) => item.type === 'page' && item.url.includes('5173'));
if (!page) throw new Error(`Game page not found on CDP port ${port}`);

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
export const errors = [];
export const logs = [];

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    pending.get(message.id)?.(message);
    pending.delete(message.id);
    return;
  }

  if (message.method === 'Runtime.exceptionThrown') {
    const detail = message.params.exceptionDetails;
    const description = detail.exception?.description || detail.text;
    errors.push(description);
    console.log('EXCEPTION:', description);
  }
  if (message.method === 'Runtime.consoleAPICalled') {
    const text = message.params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(' ');
    logs.push(`${message.params.type}: ${text}`);
    if (message.params.type === 'error') console.log('CONSOLE ERROR:', text);
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    const entry = message.params.entry;
    errors.push(`${entry.url || entry.source || ''} ${entry.text}`.trim());
    console.log('LOG ERROR:', entry.source, entry.text);
  }
});

await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));

export function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

export async function evaluate(expression) {
  const response = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (response.result?.exceptionDetails) {
    console.log(
      'EVAL EXCEPTION:',
      response.result.exceptionDetails.exception?.description || response.result.exceptionDetails.text
    );
    return null;
  }
  return response.result?.result?.value;
}

export async function shot(name) {
  const response = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(name, Buffer.from(response.result.data, 'base64'));
  console.log('saved', name);
}

export function key(type, code, keyName, vk) {
  return send('Input.dispatchKeyEvent', {
    type,
    code,
    key: keyName,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk
  });
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function openPage({ reload = true, settle = 400 } = {}) {
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');

  if (reload) {
    const loaded = new Promise((resolve) => {
      const handler = (event) => {
        if (JSON.parse(event.data).method === 'Page.loadEventFired') {
          ws.removeEventListener('message', handler);
          resolve();
        }
      };
      ws.addEventListener('message', handler);
    });
    await send('Page.reload', { ignoreCache: true });
    await loaded;
  }

  await sleep(settle);
}

export function close() {
  ws.close();
}
