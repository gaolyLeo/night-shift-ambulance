import { AMBULANCE, PATIENTS, PEDESTRIANS } from '../config.js';
import { clamp, pick, rand } from './math.js';
import { Input } from './Input.js';
import { AudioManager } from './AudioManager.js';
import { Camera } from './Camera.js';
import { City } from '../world/City.js';
import { Ambulance } from '../entities/Ambulance.js';
import { Pedestrian } from '../entities/Pedestrian.js';
import { UpgradeSystem } from '../systems/UpgradeSystem.js';
import { PatientSystem } from '../systems/PatientSystem.js';
import { TrafficSystem } from '../systems/TrafficSystem.js';
import { Effects } from '../systems/Effects.js';
import { Renderer } from '../render/Renderer.js';
import { HUD } from '../ui/HUD.js';
import { Minimap } from '../ui/Minimap.js';
import { Screens } from '../ui/Screens.js';

const DRIVE_KEYS = [
  'KeyW',
  'KeyS',
  'KeyA',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'ShiftLeft',
  'ShiftRight'
];

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.input = new Input();
    this.audio = new AudioManager();
    this.city = new City();
    this.camera = new Camera(this.city);
    this.player = new Ambulance(this.city);
    this.upgrades = new UpgradeSystem(this);
    this.player.setStats(this.upgrades.stats);
    this.effects = new Effects(this);
    this.patients = new PatientSystem(this);
    this.trafficSystem = new TrafficSystem(this);
    this.traffic = this.trafficSystem.cars;

    this.pedestrians = [];
    this.state = 'title';
    this.resetTransientState();
    this.last = performance.now();

    this.renderer = new Renderer(this);
    this.hud = new HUD(this);
    this.minimap = new Minimap(this);
    this.screens = new Screens(this);

    this.player.reset(this.city.getHospitalSpawn());
    this.spawnPedestrians();
    this.trafficSystem.reset();
    this.camera.setViewport(this.renderer.width, this.renderer.height);
    this.camera.snapTo(this.player);
    this.resize();
    this.bindEvents();

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  bindEvents() {
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);

    this.onVisibility = () => {
      if (document.hidden && this.state === 'playing') this.togglePause();
    };
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  resize() {
    this.renderer.resize();
    this.camera.setViewport(this.renderer.width, this.renderer.height);
    this.minimap.resize();
    this.camera.clampToWorld();
  }

  resetTransientState() {
    this.time = 0;
    this.dangerFlash = 0;
    this.crashCooldown = 0;
    this.hitstop = 0;
    this.wasBoosting = false;
    this.lastDriveInputTime = -10;
  }

  spawnPedestrians() {
    this.pedestrians = Array.from(
      { length: PEDESTRIANS.count },
      () => new Pedestrian(this.city, pick(this.city.blocks))
    );
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.033, Math.max(0, (now - this.last) / 1000));
    this.last = now;

    this.tick(dt);
    this.renderer.render();
    this.input.endFrame();
  }

  tick(dt) {
    const input = this.input;

    if (input.wasPressed('KeyM')) {
      this.toggleMute();
    }

    if (this.state === 'playing') {
      if (input.anyPressed('Escape', 'KeyP')) {
        this.togglePause();
        return;
      }

      this.time += dt;

      if (input.wasPressed('KeyF')) this.toggleSiren();
      if (input.wasPressed('KeyE')) this.interact();

      if (this.state !== 'playing') return;
      this.update(dt);
      return;
    }

    if (this.state === 'paused') {
      if (input.anyPressed('Escape', 'KeyP')) this.resume();
      return;
    }

    if (this.state === 'upgrades') {
      if (input.anyPressed('Escape', 'KeyP', 'KeyE')) this.closeUpgrades();
      return;
    }

    if (this.state === 'title') {
      this.time += dt;
      if (input.anyPressed('Space', 'Enter')) {
        this.startRun();
        return;
      }
      this.updateAmbient(dt);
    }
  }

  updateAmbient(dt) {
    for (const pedestrian of this.pedestrians) pedestrian.update(dt);
    for (const car of this.traffic) car.update(dt);
    this.effects.update(dt);
    this.camera.follow(this.player, dt);
    this.camera.update(dt);
    this.minimap.update(dt);
  }

  startRun() {
    this.audio.ensure();
    this.audio.setSiren(false);

    this.upgrades.reset();
    this.player.setStats(this.upgrades.stats);
    this.player.sirenOn = false;
    this.player.reset(this.city.getHospitalSpawn());

    this.patients.reset();
    this.effects.reset();
    this.spawnPedestrians();
    this.trafficSystem.reset();

    this.camera.setViewport(this.renderer.width, this.renderer.height);
    this.camera.snapTo(this.player);
    this.resetTransientState();
    this.state = 'playing';
    this.last = performance.now();

    this.hud.show();
    this.minimap.resize();
    this.screens.hideAll();
    document.body.classList.add('is-playing');
    this.hud.update();
    this.hud.setPrompt(null);
    this.hud.toast('夜班开始 · 靠近病人自动磁吸上车', 'gold');
    this.hud.toast('转向自动漂移 · Shift 氮气冲刺 · 冲回医院自动秒交', 'muted');

    this.patients.spawnCall();
    this.patients.spawnTimer = rand(8, 13);

    this.input.endFrame();
  }

  update(dt) {
    this.crashCooldown = Math.max(0, this.crashCooldown - dt);
    this.dangerFlash = Math.max(0, this.dangerFlash - dt * 1.6);

    if (this.input.anyDown(...DRIVE_KEYS)) {
      this.lastDriveInputTime = this.time;
    }

    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - dt);
      this.camera.update(dt);
      this.effects.update(dt * 0.25);
      this.hud.update();
      return;
    }

    const result = this.player.update(dt, this.input);

    if (this.player.boosting && !this.wasBoosting) {
      this.audio.ensure();
      this.audio.boost();
      this.camera.addZoomPunch(0.025);
    }
    this.wasBoosting = this.player.boosting;

    if (result.driftBoosted) {
      this.audio.ensure();
      this.audio.boost();
      this.camera.addZoomPunch(0.018);
      this.effects.text(this.player.x, this.player.y, '漂移弹射!', '#5de9ff', 15);
      this.effects.spark(this.player.x, this.player.y, '#5de9ff', 16, 155, 8);
    }

    if (this.player.boosting || this.player.driftBoostTimer > 0) {
      this.effects.boostFlame(
        this.player.x,
        this.player.y,
        this.player.angle,
        this.player.driftBoostTimer > 0 && !this.player.boosting
      );
    }

    if (result.wallImpact && this.crashCooldown <= 0) {
      this.crashCooldown = 0.42;
      const intensity = clamp(result.impactSpeed / 320, 0.35, 1.0);
      this.audio.crash();
      const pt = result.impactPoint || {
        x: this.player.x + Math.cos(this.player.angle) * 24,
        y: this.player.y + Math.sin(this.player.angle) * 24,
        nx: 0,
        ny: 1
      };
      this.effects.wallHit(pt.x, pt.y, pt.nx, pt.ny, intensity);
    } else if (result.hit && this.player.totalSpeed > 80 && Math.random() < dt * 24) {
      const pt = result.impactPoint || { x: this.player.x, y: this.player.y };
      this.effects.spark(pt.x, pt.y, '#ffd479', 3, 95, 8);
    }

    const leavingSkids =
      this.player.drifting || (this.player.handbrake && Math.abs(this.player.speed) > 48);
    if (leavingSkids) {
      this.effects.skid(
        this.player.x,
        this.player.y,
        this.player.angle,
        this.player.driftTime >= 0.35 || this.player.boosting
      );
      if (Math.random() < dt * 34) {
        this.effects.tire(this.player.x, this.player.y, this.player.angle);
      }
      if (this.player.driftTime >= 0.35 && Math.random() < dt * 18) {
        this.effects.spark(
          this.player.x - Math.cos(this.player.angle) * 22,
          this.player.y - Math.sin(this.player.angle) * 22,
          '#5de9ff',
          2,
          75,
          4
        );
      }
    } else {
      this.effects.endSkid();
    }

    this.trafficSystem.update(dt);
    this.updatePedestrians(dt);

    const humanDriving = this.lastDriveInputTime >= 0;
    this.patients.updateAutoInteract(this.player, this.upgrades.stats, humanDriving, dt);
    this.patients.update(dt);
    this.effects.update(dt);

    this.camera.follow(this.player, dt);
    this.camera.update(dt);
    this.audio.updateEngine(this.player.speedRatio, this.player.boosting);

    this.updatePrompt();
    this.hud.update();
    this.minimap.update(dt);
  }

  updatePedestrians(dt) {
    const impactSpeed = this.player.totalSpeed;
    for (let i = this.pedestrians.length - 1; i >= 0; i -= 1) {
      const pedestrian = this.pedestrians[i];
      pedestrian.update(dt);

      if (
        pedestrian.state === 'walking' &&
        impactSpeed > AMBULANCE.hitSpeed &&
        this.playerHitsPedestrian(pedestrian)
      ) {
        pedestrian.hit(this.player.angle, impactSpeed * (this.player.boosting ? 1.25 : 1));
        this.effects.blood(pedestrian.x, pedestrian.y, 22, this.player.angle);
        this.effects.spark(pedestrian.x, pedestrian.y, '#ffd9e2', 11, 130, 10);
        this.effects.text(pedestrian.x, pedestrian.y, '撞飞!', '#ff8fa4', 14);
        this.hitstop = Math.max(this.hitstop, 0.024);
        this.camera.addShake(0.28 + Math.min(0.32, impactSpeed / 650));
        this.camera.addZoomPunch(0.028);
        this.audio.hit();
        this.player.addNitro(16);
        this.player.speed *= this.player.boosting ? 0.96 : 0.92;
      }

      if (pedestrian.state === 'downed') {
        this.patients.spawnAccident(pedestrian);
        this.pedestrians.splice(i, 1);
        this.pedestrians.push(new Pedestrian(this.city, pick(this.city.blocks)));
      }
    }
  }

  playerHitsPedestrian(pedestrian) {
    const dx = pedestrian.x - this.player.x;
    const dy = pedestrian.y - this.player.y;
    const cos = Math.cos(this.player.angle);
    const sin = Math.sin(this.player.angle);
    const forward = dx * cos + dy * sin;
    const side = -dx * sin + dy * cos;

    return (
      Math.abs(forward) < AMBULANCE.halfLength + 11 &&
      Math.abs(side) < AMBULANCE.halfWidth + 9 &&
      pedestrian.z < 10
    );
  }

  updatePrompt() {
    const inHospital = this.city.inHospitalZone(this.player.x, this.player.y, 44);
    const passengers = this.patients.passengers.length;

    if (inHospital) {
      if (passengers > 0) {
        this.hud.setPrompt(`自动交付 ${passengers} 名病人`, false);
      } else {
        this.hud.setPrompt('打开医院升级', false);
      }
      return;
    }

    const nearby = this.patients.nearestWaiting(this.player, PATIENTS.magnetRange);
    if (!nearby) {
      this.hud.setPrompt(null);
      return;
    }

    const capacity = this.upgrades.stats.capacity;
    if (passengers >= capacity) {
      this.hud.setPrompt(`担架已满 ${passengers}/${capacity} · 回医院自动交付`, true);
    } else {
      this.hud.setPrompt(
        `磁吸抢救${nearby.patient.label} · ${Math.ceil(nearby.patient.remaining)} 秒`,
        false
      );
    }
  }

  interact() {
    if (this.patients.deliverAtHospital(this.player)) return;

    if (this.city.inHospitalZone(this.player.x, this.player.y, 44)) {
      this.openUpgrades();
      return;
    }

    const result = this.patients.tryLoad(this.player, this.upgrades.stats);
    if (!result.ok && result.reason === 'full') {
      this.hud.toast('担架已满 · 先送回医院', 'gold');
    }
  }

  toggleSiren() {
    this.audio.ensure();
    const on = this.player.toggleSiren();
    this.audio.setSiren(on);
    this.audio.sirenToggle(on);
  }

  toggleMute() {
    this.audio.ensure();
    const muted = this.audio.toggleMuted();
    this.hud.setMuted(muted);
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      document.body.classList.remove('is-playing');
      this.screens.showPause();
      this.audio.suspendLoops();
      this.hud.setPrompt(null);
    } else if (this.state === 'paused') {
      this.resume();
    }
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.last = performance.now();
    this.screens.hideAll();
    document.body.classList.add('is-playing');
    this.audio.ensure();
    this.audio.setSiren(this.player.sirenOn);
    this.input.endFrame();
  }

  openUpgrades() {
    if (this.state !== 'playing') return;
    this.state = 'upgrades';
    document.body.classList.remove('is-playing');
    this.screens.showUpgrades();
    this.audio.suspendLoops();
    this.audio.ui();
    this.hud.setPrompt(null);
  }

  closeUpgrades() {
    if (this.state !== 'upgrades') return;
    this.state = 'playing';
    this.last = performance.now();
    this.screens.hideUpgrades();
    document.body.classList.add('is-playing');
    this.audio.setSiren(this.player.sirenOn);
    this.input.endFrame();
  }

  addMoney(amount) {
    this.upgrades.addMoney(amount);
  }

  penalize(amount) {
    this.upgrades.addMoney(-amount);
    this.addDangerFlash(0.5);
  }

  addDangerFlash(amount) {
    this.dangerFlash = clamp(this.dangerFlash + amount, 0, 1);
  }
}
