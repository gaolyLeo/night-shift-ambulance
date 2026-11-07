import { close, errors, evaluate, openPage, shot, sleep } from './cdp-client.mjs';

await openPage();
await evaluate(`window.game.startRun(); true`);
await sleep(400);

// Put the ambulance next to the first patient and load them.
const loadedPatient = await evaluate(`(() => {
  const p = game.patients.waiting[0];
  if (!p) return { error: 'no patient' };
  game.player.x = p.x + 24;
  game.player.y = p.y;
  game.player.speed = 0;
  game.player.angle = Math.PI;
  game.interact();
  return {
    waiting: game.patients.waiting.length,
    passengers: game.patients.passengers.map(x => ({ label: x.label, timer: Math.round(x.timer), source: x.source }))
  };
})()`);
console.log('LOAD:', JSON.stringify(loadedPatient));
await sleep(300);
await shot('/tmp/nightshift-passenger.png');

// Deliver at the hospital.
const delivered = await evaluate(`(() => {
  const h = game.city.hospital.center;
  game.player.x = h.x;
  game.player.y = h.y;
  game.player.speed = 0;
  game.interact();
  return {
    money: game.upgrades.money,
    passengers: game.patients.passengers.length,
    delivered: game.patients.delivered,
    earned: game.patients.totalEarned
  };
})()`);
console.log('DELIVER:', JSON.stringify(delivered));
await sleep(300);
await shot('/tmp/nightshift-delivered.png');

// Open upgrades with enough money, buy one, then close.
const upgrades = await evaluate(`(() => {
  game.upgrades.addMoney(1200);
  const h = game.city.hospital.center;
  game.player.x = h.x;
  game.player.y = h.y;
  game.player.speed = 0;
  game.openUpgrades();
  return {
    state: game.state,
    visible: !document.getElementById('upgrade-overlay').hidden,
    cards: document.querySelectorAll('.upgrade-item').length,
    money: game.upgrades.money
  };
})()`);
console.log('UPGRADES OPEN:', JSON.stringify(upgrades));
await sleep(250);
await shot('/tmp/nightshift-upgrades.png');

const bought = await evaluate(`(() => {
  const result = game.upgrades.buy('engine');
  return {
    result,
    level: game.upgrades.levels.engine,
    money: game.upgrades.money,
    maxSpeed: game.upgrades.stats.maxSpeed,
    state: game.state
  };
})()`);
console.log('BUY:', JSON.stringify(bought));
await sleep(250);
await shot('/tmp/nightshift-upgrades-bought.png');

await evaluate(`game.closeUpgrades(); true`);
await sleep(200);

// Hit a pedestrian.
const accident = await evaluate(`(() => {
  const p = game.pedestrians.find(ped => ped.state === 'walking');
  if (!p) return { error: 'no pedestrian' };
  game.player.x = p.x - 42;
  game.player.y = p.y;
  game.player.angle = 0;
  game.player.speed = 230;
  return { ped: { x: Math.round(p.x), y: Math.round(p.y) }, playerSpeed: game.player.speed };
})()`);
console.log('HIT SETUP:', JSON.stringify(accident));
await sleep(2600);
const accidentResult = await evaluate(`({
  peds: game.pedestrians.length,
  waiting: game.patients.waiting.map(p => ({ source: p.source, timer: Math.round(p.remaining), reward: p.reward })),
  passengerCount: game.patients.passengers.length,
  playerX: Math.round(game.player.x),
  playerY: Math.round(game.player.y),
  playerSpeed: Math.round(game.player.speed)
})`);
console.log('HIT RESULT:', JSON.stringify(accidentResult));
await shot('/tmp/nightshift-accident.png');

// Ground accident patients die without a fine.
const death = await evaluate(`(() => {
  const p = game.patients.waiting.find(p => p.source === 'accident');
  if (!p) return { error: 'no accident patient' };
  const before = game.upgrades.money;
  p.timer = 0.05;
  return { before, money: before };
})()`);
await sleep(400);
const deathResult = await evaluate(`({
  money: game.upgrades.money,
  deaths: game.patients.deaths,
  waiting: game.patients.waiting.length,
  flash: game.dangerFlash
})`);
console.log('GROUND DEATH:', JSON.stringify(death), '=>', JSON.stringify(deathResult));
await shot('/tmp/nightshift-ground-death.png');

// Pause / resume sanity.
console.log('PAUSE:', JSON.stringify(await evaluate(`(() => { game.togglePause(); const a = game.state; game.resume(); return { paused: a, resumed: game.state }; })()`)));
await sleep(150);

const final = await evaluate(`({
  state: game.state,
  money: game.upgrades.money,
  peds: game.pedestrians.length,
  waiting: game.patients.waiting.length,
  passengers: game.patients.passengers.length,
  buildings: game.city.buildings.length,
  audio: game.audio.available,
  fpsHint: performance.now()
})`);
console.log('FINAL:', JSON.stringify(final));
console.log('ERRORS:', errors.length, errors.slice(0, 5));
close();
