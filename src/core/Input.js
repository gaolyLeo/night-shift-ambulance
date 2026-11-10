const GAME_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyC',
  'KeyE',
  'KeyF',
  'KeyQ',
  'KeyP',
  'KeyM',
  'ShiftLeft',
  'ShiftRight',
  'Space',
  'Enter',
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight'
]);

export class Input {
  constructor(target = window) {
    this.down = new Set();
    this.pressed = new Set();

    this.onKeyDown = (event) => {
      if (!GAME_KEYS.has(event.code)) return;
      if (event.repeat) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      this.down.add(event.code);
      this.pressed.add(event.code);
    };

    this.onKeyUp = (event) => {
      if (!GAME_KEYS.has(event.code)) return;
      event.preventDefault();
      this.down.delete(event.code);
    };

    this.onBlur = () => {
      this.down.clear();
      this.pressed.clear();
    };

    target.addEventListener('keydown', this.onKeyDown, { passive: false });
    target.addEventListener('keyup', this.onKeyUp, { passive: false });
    window.addEventListener('blur', this.onBlur);
  }

  isDown(code) {
    return this.down.has(code);
  }

  anyDown(...codes) {
    return codes.some((code) => this.down.has(code));
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  anyPressed(...codes) {
    return codes.some((code) => this.pressed.has(code));
  }

  endFrame() {
    this.pressed.clear();
  }
}
