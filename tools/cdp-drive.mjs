import { close, errors, evaluate, key, openPage, shot, sleep } from './cdp-client.mjs';

await openPage();
await evaluate(`window.game.startRun(); true`);
await sleep(300);

console.log('BEFORE:', JSON.stringify(await evaluate(`({ x: Math.round(game.player.x), y: Math.round(game.player.y), angle: +game.player.angle.toFixed(2), speed: game.player.speedKmh })`)));

await key('keyDown', 'ShiftLeft', 'Shift', 16);
await sleep(300);
console.log('NITRO:', JSON.stringify(await evaluate(`({ boosting: game.player.boosting, nitro: Math.round(game.player.nitro), tracked: game.input.isDown('ShiftLeft') })`)));
await key('keyUp', 'ShiftLeft', 'Shift', 16);

await key('keyDown', 'KeyW', 'w', 87);
await sleep(1200);
console.log('W 1.2s:', JSON.stringify(await evaluate(`({ x: Math.round(game.player.x), y: Math.round(game.player.y), angle: +game.player.angle.toFixed(2), speed: game.player.speedKmh, hudSpeed: document.getElementById('speed-value').textContent, camera: { x: Math.round(game.camera.x), y: Math.round(game.camera.y) } })`)));
await key('keyDown', 'KeyD', 'd', 68);
await sleep(800);
await key('keyUp', 'KeyD', 'd', 68);
await key('keyDown', 'KeyA', 'a', 65);
await sleep(500);
await key('keyUp', 'KeyA', 'a', 65);
await key('keyUp', 'KeyW', 'w', 87);
console.log('DRIVE:', JSON.stringify(await evaluate(`({ x: Math.round(game.player.x), y: Math.round(game.player.y), angle: +game.player.angle.toFixed(2), speed: game.player.speedKmh })`)));
await shot('/tmp/nightshift-drive.png');

await key('keyDown', 'KeyF', 'f', 70);
await key('keyUp', 'KeyF', 'f', 70);
await sleep(400);
console.log('SIREN:', JSON.stringify(await evaluate(`({ siren: game.player.sirenOn, label: document.getElementById('siren-label').textContent, cls: document.getElementById('siren-state').className })`)));
await shot('/tmp/nightshift-siren.png');

// Handbrake.
await key('keyDown', 'KeyW', 'w', 87);
await sleep(700);
await key('keyDown', 'Space', ' ', 32);
await sleep(300);
await key('keyUp', 'Space', ' ', 32);
await key('keyUp', 'KeyW', 'w', 87);
console.log('HANDBRAKE:', JSON.stringify(await evaluate(`({ speed: game.player.speedKmh, particles: game.effects.particles.length })`)));

// FPS probe.
const fps = await evaluate(`new Promise((resolve) => {
  let frames = 0;
  const start = performance.now();
  function tick() {
    frames += 1;
    const elapsed = performance.now() - start;
    if (elapsed < 1500) requestAnimationFrame(tick);
    else resolve(+(frames / (elapsed / 1000)).toFixed(1));
  }
  requestAnimationFrame(tick);
})`);
console.log('FPS:', fps);

// Occlusion fade test.
const fadeSetup = await evaluate(`(() => {
  const b = game.city.buildings.find(b => !b.isHospital && b.w > 120);
  if (!b) return null;
  game.player.x = b.x + b.w / 2;
  game.player.y = b.y - 18;
  game.player.speed = 0;
  game.player.angle = Math.PI / 2;
  game.camera.snapTo(game.player);
  return { building: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) }, player: { x: Math.round(game.player.x), y: Math.round(game.player.y) } };
})()`);
console.log('FADE SETUP:', JSON.stringify(fadeSetup));
await sleep(500);
await shot('/tmp/nightshift-fade.png');

console.log('ERRORS:', errors.length, errors.slice(0, 5));
close();
