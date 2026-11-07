import { close, errors, evaluate, logs, openPage, shot, sleep } from './cdp-client.mjs';

await openPage({ settle: 500 });

const initial = await evaluate(`({
  hasGame: !!window.game,
  state: window.game?.state,
  size: [innerWidth, innerHeight],
  canvas: [document.getElementById('game')?.width, document.getElementById('game')?.height],
  buildings: window.game?.city?.buildings?.length,
  peds: window.game?.pedestrians?.length,
  traffic: window.game?.traffic?.length,
  overlay: !document.getElementById('overlay')?.hidden,
  hudHidden: document.getElementById('hud')?.hidden
})`);
console.log('INITIAL:', JSON.stringify(initial));

await shot('/tmp/nightshift-title.png');

await evaluate(`window.game.startRun(); true`);
await sleep(1200);

const started = await evaluate(`({
  state: window.game.state,
  money: window.game.upgrades.money,
  patients: window.game.patients.waiting.length,
  passengers: window.game.patients.passengers.length,
  peds: window.game.pedestrians.length,
  player: { x: Math.round(window.game.player.x), y: Math.round(window.game.player.y), speed: Math.round(window.game.player.speed) },
  hudHidden: document.getElementById('hud')?.hidden,
  overlayHidden: document.getElementById('overlay')?.hidden,
  minimap: [document.getElementById('minimap')?.width, document.getElementById('minimap')?.height],
  prompt: document.getElementById('prompt-text')?.textContent,
  promptHidden: document.getElementById('prompt')?.hidden
})`);
console.log('STARTED:', JSON.stringify(started));

await shot('/tmp/nightshift-playing.png');

await evaluate(`window.game.hud.toast('测试提示', 'gold'); window.game.player.speed = 200; window.game.player.x += 100; true`);
await sleep(300);
await shot('/tmp/nightshift-moving.png');

console.log('ERROR COUNT:', errors.length);
console.log('LOGS:', logs.slice(-10).join('\n'));
close();
