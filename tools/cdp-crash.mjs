import { close, errors, evaluate, openPage, shot, sleep } from './cdp-client.mjs';

await openPage();
await evaluate(`window.game.startRun(); true`);
await sleep(400);

// Put a stationary car 110px ahead on a clear road and hit it at full speed.
const setup = await evaluate(`(() => {
  const r = game.city.trafficRoutes[0];
  const x = r[0].x + 60;
  const y = r[0].y;
  game.player.x = x;
  game.player.y = y;
  game.player.angle = 0;
  game.player.speed = 345;
  game.camera.snapTo(game.player);
  const car = game.traffic[0];
  car.state = 'driving';
  car.route = [{ x: x + 110, y }, { x: x + 300, y }];
  car.segment = 0;
  car.t = 0;
  car.speed = 0;
  car.stun = 999;
  car.offsetX = 0;
  car.offsetY = 0;
  car.z = 0;
  car.spin = 0;
  car.refresh();
  return {
    player: { x: Math.round(game.player.x), y: Math.round(game.player.y), speed: Math.round(game.player.speed) },
    car: { x: Math.round(car.x), y: Math.round(car.y), state: car.state },
    waitingBefore: game.patients.waiting.length,
    trafficBefore: game.traffic.length
  };
})()`);
console.log('SETUP:', JSON.stringify(setup));

await sleep(320);
const flying = await evaluate(`(() => {
  const car = game.traffic.find(c => c.state === 'wrecking') || game.traffic[0];
  return {
    player: { x: Math.round(game.player.x), y: Math.round(game.player.y), speed: Math.round(game.player.speed) },
    car: { state: car.state, x: Math.round(car.x), y: Math.round(car.y), z: Math.round(car.z), spin: +car.spin.toFixed(2), impact: Math.round(car.wreckImpact || 0) },
    traffic: game.traffic.length,
    waiting: game.patients.waiting.length,
    particles: game.effects.particles.length
  };
})()`);
console.log('FLYING:', JSON.stringify(flying));
await shot('/tmp/nightshift-car-flying.png');

// Keep the ambulance away so crash victims are not magnetized immediately.
await evaluate(`game.player.x += 800; game.player.y += 200; game.camera.snapTo(game.player); true`);
await sleep(1300);
const exploded = await evaluate(`({
  crashVictims: game.patients.waiting.filter(p => p.origin === 'crash').map(p => ({ label: p.label, timer: Math.round(p.remaining), reward: p.reward })),
  waiting: game.patients.waiting.length,
  traffic: game.traffic.length,
  wrecking: game.traffic.filter(c => c.state === 'wrecking').length,
  destroyed: game.traffic.filter(c => c.state === 'destroyed').length,
  particles: game.effects.particles.length,
  money: game.upgrades.money
})`);
console.log('EXPLODED:', JSON.stringify(exploded));
await shot('/tmp/nightshift-car-exploded.png');

// Crash victims are ground patients and must not cost money when ignored.
const groundDeath = await evaluate(`(() => {
  const crash = game.patients.waiting.find(p => p.origin === 'crash');
  if (!crash) return { error: 'no crash victim' };
  const before = game.upgrades.money;
  crash.timer = 0.05;
  return { before, label: crash.label };
})()`);
await sleep(350);
const groundDeathAfter = await evaluate(`({
  money: game.upgrades.money,
  deaths: game.patients.deaths,
  waitingCrash: game.patients.waiting.filter(p => p.origin === 'crash').length,
  cash: document.getElementById('cash-value').textContent,
  toast: [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).slice(-3)
})`);
console.log('GROUND DEATH:', JSON.stringify(groundDeath), '=>', JSON.stringify(groundDeathAfter));

// Low-speed contact should not launch or explode a car.
const lowSpeed = await evaluate(`(() => {
  game.patients.waiting = [];
  const r = game.city.trafficRoutes[1];
  const x = r[0].x + 50;
  const y = r[0].y;
  game.player.x = x;
  game.player.y = y;
  game.player.angle = 0;
  game.player.speed = 120;
  game.camera.snapTo(game.player);
  const car = game.traffic.find(c => c.state === 'driving');
  car.route = [{ x: x + 80, y }, { x: x + 260, y }];
  car.segment = 0;
  car.t = 0;
  car.speed = 0;
  car.stun = 999;
  car.offsetX = 0;
  car.offsetY = 0;
  car.z = 0;
  car.spin = 0;
  car.refresh();
  return { playerSpeed: game.player.speed, carState: car.state, waiting: game.patients.waiting.length };
})()`);
await sleep(1200);
const lowSpeedAfter = await evaluate(`({
  carState: game.traffic.find(c => c.state === 'driving')?.state,
  anyWrecking: game.traffic.some(c => c.state === 'wrecking'),
  waiting: game.patients.waiting.length,
  player: { x: Math.round(game.player.x), y: Math.round(game.player.y), speed: Math.round(game.player.speed) }
})`);
console.log('LOW SPEED:', JSON.stringify(lowSpeed), '=>', JSON.stringify(lowSpeedAfter));

// In-car death still costs the configured fine.
const carDeath = await evaluate(`(() => {
  game.patients.waiting = [];
  game.patients.passengers = [];
  game.patients.spawnCall();
  const p = game.patients.waiting[game.patients.waiting.length - 1];
  p.x = game.player.x + 16;
  p.y = game.player.y;
  game.player.speed = 0;
  const loaded = game.patients.tryLoad(game.player, game.upgrades.stats);
  const passenger = game.patients.passengers[0];
  const before = game.upgrades.money;
  passenger.timer = 0.05;
  return { loaded: loaded.ok, label: passenger.label, before, passengers: game.patients.passengers.length };
})()`);
await sleep(350);
const carDeathAfter = await evaluate(`({
  money: game.upgrades.money,
  passengers: game.patients.passengers.length,
  deaths: game.patients.deaths,
  cash: document.getElementById('cash-value').textContent,
  toast: [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).slice(-2)
})`);
console.log('CAR DEATH:', JSON.stringify(carDeath), '=>', JSON.stringify(carDeathAfter));

console.log('ERRORS:', errors.length, errors.slice(0, 5));
close();
