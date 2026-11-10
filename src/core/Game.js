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
import { PvpSystem } from '../systems/PvpSystem.js';
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
    this.pvp = new PvpSystem(this);
    this.trafficSystem = new TrafficSystem(this);
    this.traffic = this.trafficSystem.cars;

    this.pedestrians = [];
    this.state = 'title';
    this.mouseDriveEnabled = true;
    document.body.classList.add('is-mouse-driving');
    this.mousePointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
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

    this.onPointerMove = (event) => {
      this.mousePointer = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener('pointermove', this.onPointerMove);
  }

  screenToWorld(x, y) {
    return {
      x: this.camera.x + (x - this.camera.viewW / 2 - this.camera.shakeX) / this.camera.zoom,
      y: this.camera.y +
        (y - this.camera.viewH / 2 - this.camera.shakeY) / (this.camera.zoom * this.camera.yScale)
    };
  }

  resolveMouseTarget(point) {
    return this.city.resolveFreePoint(point.x, point.y, AMBULANCE.radius + 6);
  }

  getMouseDriveTarget() {
    if (!this.mouseDriveEnabled) return null;
    return this.resolveMouseTarget(this.screenToWorld(this.mousePointer.x, this.mousePointer.y));
  }

  toggleMouseDrive() {
    this.mouseDriveEnabled = !this.mouseDriveEnabled;
    this.pvp.mouseNav = this.pvp.createNavigatorState();
    document.body.classList.toggle('is-mouse-driving', this.mouseDriveEnabled);
    this.hud?.setDriveMode(this.mouseDriveEnabled);
    if (this.state === 'playing') {
      this.hud.toast(
        this.mouseDriveEnabled
          ? '鼠标目标驾驶已开启 · 移动光标控制车辆目标'
          : 'WASD 驾驶已开启',
        'gold'
      );
    }
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

    if (this.state === 'playing' && input.wasPressed('KeyC')) {
      this.toggleMouseDrive();
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

    if (this.state === 'matchOver') return;

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

  startRun(mode = 'classic') {
    this.audio.ensure();
    this.audio.setSiren(false);

    this.pvp.reset();
    this.mode = mode;
    this.upgrades.reset();
    this.player.setStats(this.upgrades.stats);
    this.player.sirenOn = false;
    this.player.reset(this.city.getHospitalSpawn());

    this.patients.reset();
    this.effects.reset();
    this.spawnPedestrians();
    this.trafficSystem.reset();
    if (mode === 'pvp') this.pvp.start();

    this.camera.setViewport(this.renderer.width, this.renderer.height);
    this.camera.dynamicZoom = 1;
    this.camera.zoomPunch = 0;
    this.camera.zoom = this.camera.baseZoom;
    this.camera.snapTo(this.pvp.active ? this.pvp.getCameraTarget() : this.player);
    this.resetTransientState();
    this.state = 'playing';
    this.last = performance.now();

    this.hud.show();
    this.minimap.resize();
    this.screens.hideAll();
    document.body.classList.add('is-playing');
    this.hud.update();
    this.hud.setPrompt(null);
    if (this.pvp.active) {
      this.hud.toast('PvP 开始 · 双方现金为生命值，击中扣 $150', 'danger');
      this.hud.toast('默认鼠标跟随 · 移动光标驾驶 · C 切换 WASD · Q 投掷', 'gold');
    } else {
      this.hud.toast('默认鼠标跟随 · 移动光标驾驶 · C 切换 WASD', 'gold');
      this.hud.toast('转向自动漂移 · Shift 氮气冲刺 · 冲回医院自动秒交', 'muted');
    }

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

    const mouseTarget = this.getMouseDriveTarget();
    if (mouseTarget) this.lastDriveInputTime = this.time;

    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - dt);
      this.camera.update(dt);
      this.effects.update(dt * 0.25);
      this.hud.update();
      return;
    }

    const playerInput = this.mouseDriveEnabled
      ? this.pvp.getMouseInput(mouseTarget, dt)
      : this.pvp.active
        ? this.pvp.getPlayerInput()
        : this.input;
    const result = this.player.update(dt, playerInput);

    if (this.pvp.active) {
      const rivalResult = this.pvp.opponent.update(dt, this.pvp.getBotInput(dt));
      if (rivalResult.wallImpact && this.crashCooldown <= 0) {
        this.audio.crash();
        const pt = rivalResult.impactPoint || {
          x: this.pvp.opponent.x,
          y: this.pvp.opponent.y
        };
        this.effects.wallHit(pt.x, pt.y, pt.nx || 0, pt.ny || 1, 0.45);
      }
      if (rivalResult.driftBoosted) {
        this.effects.text(this.pvp.opponent.x, this.pvp.opponent.y, '漂移弹射!', '#ff5f9e', 13);
      }
    }

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
    if (!this.pvp.active) {
      this.patients.updateAutoInteract(this.player, this.upgrades.stats, humanDriving, dt);
    }
    this.patients.update(dt);
    this.pvp.update(dt);
    if (this.state !== 'playing') {
      this.effects.update(dt);
      this.hud.update();
      return;
    }
    this.effects.update(dt);

    if (this.pvp.active) this.camera.followPair(this.player, this.pvp.opponent, dt);
    else this.camera.follow(this.player, dt);
    this.camera.update(dt);
    this.audio.updateEngine(this.player.speedRatio, this.player.boosting);

    this.updatePrompt();
    this.hud.update();
    this.minimap.update(dt);
  }

  updatePedestrians(dt) {
    const vehicles = this.pvp.active ? [this.player, this.pvp.opponent] : [this.player];
    for (let i = this.pedestrians.length - 1; i >= 0; i -= 1) {
      const pedestrian = this.pedestrians[i];
      pedestrian.update(dt);

      const hitter = vehicles.find(
        (vehicle) =>
          pedestrian.state === 'walking' &&
          vehicle.totalSpeed > AMBULANCE.hitSpeed &&
          this.vehicleHitsPedestrian(vehicle, pedestrian)
      );

      if (hitter) {
        const impactSpeed = hitter.totalSpeed;
        pedestrian.hit(hitter.angle, impactSpeed * (hitter.boosting ? 1.25 : 1));
        this.effects.blood(pedestrian.x, pedestrian.y, 22, hitter.angle);
        this.effects.spark(pedestrian.x, pedestrian.y, '#ffd9e2', 11, 130, 10);
        this.effects.text(pedestrian.x, pedestrian.y, '撞飞!', '#ff8fa4', 14);
        this.hitstop = Math.max(this.hitstop, 0.024);
        this.camera.addShake(0.28 + Math.min(0.32, impactSpeed / 650));
        this.camera.addZoomPunch(0.028);
        this.audio.hit();
        hitter.addNitro(16);
        hitter.speed *= hitter.boosting ? 0.96 : 0.92;
      }

      if (pedestrian.state === 'downed') {
        this.patients.spawnAccident(pedestrian);
        this.pedestrians.splice(i, 1);
        this.pedestrians.push(new Pedestrian(this.city, pick(this.city.blocks)));
      }
    }
  }

  playerHitsPedestrian(pedestrian) {
    return this.vehicleHitsPedestrian(this.player, pedestrian);
  }

  vehicleHitsPedestrian(vehicle, pedestrian) {
    const dx = pedestrian.x - vehicle.x;
    const dy = pedestrian.y - vehicle.y;
    const cos = Math.cos(vehicle.angle);
    const sin = Math.sin(vehicle.angle);
    const forward = dx * cos + dy * sin;
    const side = -dx * sin + dy * cos;

    return (
      Math.abs(forward) < AMBULANCE.halfLength + 11 &&
      Math.abs(side) < AMBULANCE.halfWidth + 9 &&
      pedestrian.z < 10
    );
  }

  updatePrompt() {
    if (this.pvp.active) {
      this.hud.setPrompt('靠近伤员自动装弹 · 按 Q 投掷 · AI 自动攻击', false, 'PvP');
      return;
    }

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
    if (this.pvp.active) {
      this.pvp.tryPickup(this.player, 0);
      return;
    }

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
    if (this.pvp.active) return;
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
