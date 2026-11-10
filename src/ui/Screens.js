import { UPGRADES } from '../config.js';
import { moneyParts } from './format.js';

export class Screens {
  constructor(game) {
    this.game = game;
    this.overlay = document.getElementById('overlay');
    this.titleScreen = document.getElementById('screen-title');
    this.pauseScreen = document.getElementById('screen-pause');
    this.matchOverOverlay = document.getElementById('match-over-overlay');
    this.matchResult = document.getElementById('match-result');
    this.pauseInstructions = document.getElementById('pause-instructions');
    this.upgradeOverlay = document.getElementById('upgrade-overlay');
    this.upgradeList = document.getElementById('upgrade-list');
    this.upgradeCash = document.getElementById('upgrade-cash');
    this.upgradeCashSymbol = document.getElementById('upgrade-cash-symbol');

    document.getElementById('start-btn').addEventListener('click', (event) => {
      event.currentTarget.blur();
      this.game.startRun();
    });

    document.getElementById('pvp-btn').addEventListener('click', (event) => {
      event.currentTarget.blur();
      this.game.startRun('pvp');
    });

    document.getElementById('resume-btn').addEventListener('click', (event) => {
      event.currentTarget.blur();
      this.game.resume();
    });

    document.getElementById('restart-btn').addEventListener('click', (event) => {
      event.currentTarget.blur();
      this.game.startRun(this.game.mode);
    });

    document.getElementById('pvp-rematch-btn').addEventListener('click', (event) => {
      event.currentTarget.blur();
      this.game.startRun('pvp');
    });

    document.getElementById('pvp-title-btn').addEventListener('click', (event) => {
      event.currentTarget.blur();
      this.game.state = 'title';
      this.game.pvp.reset();
      this.game.hud.hide();
      document.body.classList.remove('is-playing');
      this.matchOverOverlay.hidden = true;
      this.showTitle();
    });

    document.getElementById('close-upgrades').addEventListener('click', (event) => {
      event.currentTarget.blur();
      this.game.closeUpgrades();
    });

    this.upgradeList.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-upgrade]');
      if (!button) return;
      button.blur();
      this.game.upgrades.buy(button.dataset.upgrade);
    });

    this.showTitle();
  }

  showTitle() {
    this.overlay.hidden = false;
    this.titleScreen.hidden = false;
    this.pauseScreen.hidden = true;
    this.matchOverOverlay.hidden = true;
    this.upgradeOverlay.hidden = true;
  }

  showPause() {
    this.overlay.hidden = false;
    this.titleScreen.hidden = true;
    this.pauseScreen.hidden = false;
    this.matchOverOverlay.hidden = true;
    this.upgradeOverlay.hidden = true;
    const driveHint = this.game.mouseDriveEnabled
      ? '鼠标驾驶 · 移动光标控制车辆目标'
      : 'WASD 驾驶 · 按 C 切换鼠标';
    this.pauseInstructions.textContent = this.game.pvp.active
      ? `Esc / P 继续 · ${driveHint} · Shift 氮气 · Q 投掷伤员 · E 装载`
      : `Esc / P 继续 · ${driveHint} · Shift 氮气 · F 警报 · 医院按 E 升级`;
  }

  showMatchOver(winner) {
    this.overlay.hidden = true;
    this.upgradeOverlay.hidden = true;
    this.matchResult.textContent = winner === 0 ? 'P1 获胜' : 'AI 获胜';
    this.matchOverOverlay.hidden = false;
  }

  hideAll() {
    this.overlay.hidden = true;
    this.matchOverOverlay.hidden = true;
    this.upgradeOverlay.hidden = true;
  }

  showUpgrades() {
    this.overlay.hidden = true;
    this.upgradeOverlay.hidden = false;
    this.renderUpgrades();
  }

  hideUpgrades() {
    this.upgradeOverlay.hidden = true;
  }

  renderUpgrades() {
    const game = this.game;
    const cash = moneyParts(game.upgrades.money);
    this.upgradeCash.textContent = cash.text;
    this.upgradeCashSymbol.textContent = cash.symbol;

    let html = '';

    for (const [id, definition] of Object.entries(UPGRADES)) {
      const level = game.upgrades.getLevel(id);
      const maxed = level >= definition.maxLevel;
      const cost = game.upgrades.getNextCost(id);
      const affordable = cost != null && game.upgrades.money >= cost;
      const costText = cost == null ? '' : moneyParts(cost).text;
      const bars = Array.from({ length: definition.maxLevel }, (_, index) => {
        return `<i class="${index < level ? 'is-on' : ''}"></i>`;
      }).join('');

      html += `
        <article class="upgrade-item ${maxed ? 'is-max' : ''}">
          <div class="u-top">
            <div class="u-name"><span class="u-icon" style="color:${definition.accent}">${definition.icon}</span>${definition.name}</div>
            <span class="u-level">LV.${level}/${definition.maxLevel}</span>
          </div>
          <p class="u-desc">${definition.desc}</p>
          <div class="u-bars">${bars}</div>
          <div class="u-action">
            <span class="u-price">${maxed ? 'MAX' : `$${costText}`}</span>
            <button class="u-buy" data-upgrade="${id}" ${maxed || !affordable ? 'disabled' : ''}>
              ${maxed ? '已满级' : affordable ? '升级' : '资金不足'}
            </button>
          </div>
        </article>
      `;
    }

    this.upgradeList.innerHTML = html;
  }
}
