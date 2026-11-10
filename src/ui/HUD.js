import { formatTime } from '../core/math.js';
import { PVP } from '../config.js';
import { moneyParts } from './format.js';

const TOAST_CLASS = {
  money: 'is-money',
  danger: 'is-danger',
  gold: 'is-gold'
};

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('hud');
    this.cash = document.getElementById('cash-value');
    this.cashSymbol = document.querySelector('.cash-symbol');
    this.context = document.getElementById('hud-context');
    this.speed = document.getElementById('speed-value');
    this.nitroGauge = document.getElementById('nitro-gauge');
    this.nitroFill = document.getElementById('nitro-fill');
    this.sirenState = document.getElementById('siren-state');
    this.sirenLabel = document.getElementById('siren-label');
    this.passengerCount = document.getElementById('passenger-count');
    this.passengerPanel = document.getElementById('passenger-panel');
    this.passengerList = document.getElementById('passenger-list');
    this.passengerCapacity = document.getElementById('passenger-capacity');
    this.prompt = document.getElementById('prompt');
    this.promptKey = document.getElementById('prompt-key');
    this.promptText = document.getElementById('prompt-text');
    this.alertChip = document.getElementById('alert-chip');
    this.toasts = document.getElementById('toasts');
    this.muteBtn = document.getElementById('mute-btn');
    this.muteIcon = document.getElementById('mute-icon');
    this.pauseBtn = document.getElementById('pause-btn');
    this.driveModeBtn = document.getElementById('drive-mode-btn');
    this.shiftLabel = document.getElementById('shift-label');
    this.passengerIcon = document.querySelector('.passenger-chip .cross');
    this.rivalPanel = document.getElementById('pvp-rival-panel');
    this.rivalCash = document.getElementById('pvp-rival-cash');
    this.rivalAmmo = document.getElementById('pvp-rival-ammo');

    this.lastMoney = null;
    this.lastSpeed = null;
    this.lastSiren = null;
    this.lastPassengerText = null;
    this.lastPrompt = null;
    this.lastPromptLocked = null;
    this.lastPromptKey = null;
    this.lastAlert = null;
    this.passengerSignature = '';
    this.passengerRows = [];
    this.activeToasts = [];

    this.muteBtn.addEventListener('click', () => {
      this.game.toggleMute();
      this.muteBtn.blur();
    });

    this.pauseBtn.addEventListener('click', () => {
      this.game.togglePause();
      this.pauseBtn.blur();
    });

    this.driveModeBtn.addEventListener('click', () => {
      this.game.toggleMouseDrive();
      this.driveModeBtn.blur();
    });

    this.setMuted(game.audio.muted);
    this.setDriveMode(game.mouseDriveEnabled);
  }

  show() {
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
  }

  setMuted(muted) {
    this.muteIcon.textContent = muted ? '×' : '♪';
    this.muteBtn.setAttribute('aria-label', muted ? '取消静音' : '静音');
    this.muteBtn.classList.toggle('is-muted', muted);
  }

  setDriveMode(mouseEnabled) {
    this.driveModeBtn.textContent = mouseEnabled ? '鼠标' : 'WASD';
    this.driveModeBtn.setAttribute('aria-pressed', String(mouseEnabled));
    this.driveModeBtn.setAttribute(
      'aria-label',
      mouseEnabled ? '切换到键盘驾驶' : '切换到鼠标目标驾驶'
    );
    this.driveModeBtn.title = mouseEnabled ? '切换到 WASD (C)' : '切换到鼠标驾驶 (C)';
    this.driveModeBtn.classList.toggle('is-mouse', mouseEnabled);
  }

  update() {
    const game = this.game;
    const pvpActive = game.pvp.active;
    const money = game.upgrades.money;

    if (money !== this.lastMoney) {
      this.lastMoney = money;
      const parts = moneyParts(money);
      this.cash.textContent = parts.text;
      this.cashSymbol.textContent = parts.symbol;
      this.cash.parentElement.classList.toggle('is-negative', money < 0);
    }
    this.context.textContent = pvpActive ? 'P1 · MONEY = HP' : 'DISTRICT 07 · 夜班';
    this.rivalPanel.hidden = !pvpActive;
    if (pvpActive) {
      this.rivalCash.textContent = moneyParts(game.pvp.opponentMoney).text;
      this.rivalAmmo.textContent = `${game.pvp.ammo[1].length}/${PVP.ammoCapacity}`;
    }

    const speed = game.player.speedKmh;
    if (speed !== this.lastSpeed) {
      this.lastSpeed = speed;
      this.speed.textContent = String(speed).padStart(3, '0');
    }

    if (this.nitroFill) {
      const pct = Math.round((game.player.nitroRatio ?? 1) * 100);
      this.nitroFill.style.width = `${pct}%`;
      this.nitroGauge?.classList.toggle(
        'is-boosting',
        Boolean(game.player.boosting || game.player.driftBoostTimer > 0)
      );
    }

    if (game.player.sirenOn !== this.lastSiren) {
      this.lastSiren = game.player.sirenOn;
      this.sirenState.classList.toggle('is-on', this.lastSiren);
      this.sirenLabel.textContent = this.lastSiren ? '警报开启' : '警报关闭';
    }

    const capacity = game.upgrades.stats.capacity;
    const count = pvpActive ? game.pvp.ammo[0].length : game.patients.passengers.length;
    const passengerText = `${count}/${pvpActive ? PVP.ammoCapacity : capacity}`;
    if (passengerText !== this.lastPassengerText) {
      this.lastPassengerText = passengerText;
      this.passengerCount.textContent = passengerText;
      this.passengerCapacity.textContent = `${count} / ${capacity}`;
      this.passengerPanel.hidden = pvpActive || count === 0;
    }
    this.passengerIcon.textContent = pvpActive ? '➤' : '✚';
    this.passengerChipTitle = pvpActive ? 'P1 弹药' : '车上病人';
    this.passengerIcon.parentElement.title = this.passengerChipTitle;

    this.updatePassengers();

    let alert = false;
    for (const patient of game.patients.passengers) {
      if (patient.remaining < 10) alert = true;
    }
    for (const patient of game.patients.waiting) {
      if (patient.source === 'accident' && patient.remaining < 10) alert = true;
    }
    if (alert !== this.lastAlert) {
      this.lastAlert = alert;
      this.alertChip.hidden = !alert;
    }
    this.shiftLabel.textContent = pvpActive ? 'PVP 对战' : alert ? '病人危重' : '值班中';
  }

  updatePassengers() {
    const passengers = this.game.patients.passengers;
    const signature = passengers.map((patient) => patient.id).join(',');

    if (signature !== this.passengerSignature) {
      this.passengerSignature = signature;
      this.passengerRows = [];
      this.passengerList.innerHTML = '';

      for (const patient of passengers) {
        const row = document.createElement('div');
        row.className = 'passenger-row';

        const name = document.createElement('span');
        name.className = 'passenger-name';
        name.textContent = patient.label;

        const time = document.createElement('span');
        time.className = 'passenger-time';

        const bar = document.createElement('div');
        bar.className = 'passenger-bar';
        const fill = document.createElement('span');
        bar.appendChild(fill);

        row.append(name, time, bar);
        this.passengerList.appendChild(row);
        this.passengerRows.push({ id: patient.id, row, time, fill, patient });
      }
    }

    for (const entry of this.passengerRows) {
      const patient = entry.patient;
      entry.time.textContent = formatTime(patient.remaining);
      entry.fill.style.width = `${Math.max(0, patient.timerRatio * 100)}%`;
      entry.row.classList.toggle('is-critical', patient.remaining < 12);
    }
  }

  setPrompt(text, locked = false, key = 'E') {
    if (!text) {
      if (this.lastPrompt !== null) {
        this.lastPrompt = null;
        this.lastPromptLocked = null;
        this.lastPromptKey = null;
        this.prompt.hidden = true;
      }
      return;
    }

    if (
      text === this.lastPrompt &&
      locked === this.lastPromptLocked &&
      key === this.lastPromptKey
    ) return;

    this.lastPrompt = text;
    this.lastPromptLocked = locked;
    this.lastPromptKey = key;
    this.prompt.hidden = false;
    this.promptKey.textContent = key;
    this.promptText.textContent = text;
    this.prompt.classList.toggle('is-locked', locked);
  }

  toast(message, kind = '') {
    const toast = document.createElement('div');
    toast.className = `toast ${TOAST_CLASS[kind] || ''}`.trim();
    toast.textContent = message;
    this.toasts.appendChild(toast);
    this.activeToasts.push(toast);

    while (this.activeToasts.length > 4) {
      const old = this.activeToasts.shift();
      old.remove();
    }

    window.setTimeout(() => {
      toast.classList.add('is-out');
      window.setTimeout(() => {
        toast.remove();
        this.activeToasts = this.activeToasts.filter((item) => item !== toast);
      }, 280);
    }, 2600);
  }

  refreshUpgrades() {
    this.game.screens?.renderUpgrades();
  }
}
