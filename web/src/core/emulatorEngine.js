import { HT943 } from './ht943.js';
import { T7741 } from './t7741.js';
import { SPLB20 } from './splb20.js';

function createCpu(coreName, maskOptions, clock, toneGenerator, romBytes, soundRomBytes) {
  if (coreName === 'HT943') {
    return new HT943(maskOptions, clock, toneGenerator, romBytes, soundRomBytes);
  }
  if (coreName === 'T7741') {
    return new T7741(maskOptions, clock, toneGenerator, romBytes);
  }
  if (coreName === 'SPLB20') {
    return new SPLB20(maskOptions, clock, toneGenerator, romBytes);
  }
  throw new Error(`Unsupported core: ${coreName}`);
}

export class EmulatorEngine {
  constructor(config, files, toneGenerator) {
    this.config = config;
    this.files = files;
    this.toneGenerator = toneGenerator;

    const romBytes = files.get(config.mask_options.rom_path);
    const soundRomBytes = files.get(config.mask_options.sound_rom_path) || new Uint8Array();
    if (!romBytes) {
      throw new Error('ERR_ROM_MISSING');
    }

    this.cpu = createCpu(config.core, config.mask_options, config.clock, toneGenerator, romBytes, soundRomBytes);
    this._btnMatrixOut = new Map();
    this._btnMatrixIn = new Map();

    if (typeof this.cpu.set_pin_state_callback === 'function') {
      this.cpu.set_pin_state_callback((port, pin, level) => this._setPinState(port, pin, level));
    }

    this.running = false;
    this.speed = 1;
    this.lastTs = 0;
    this.accumulatedCycles = 0;
    this.maxCyclesPerFrame = 20000;
    this.totalCycles = 0;
    this._raf = 0;
    this.onFrame = null;
  }

  emuNowSec() {
    return this.totalCycles / this.config.clock;
  }

  setSpeed(mult) {
    this.speed = mult;
  }

  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    this.lastTs = 0;
    this.toneGenerator.rebaseTimeline(this.emuNowSec());
    this._tick = this._tick.bind(this);
    this._raf = requestAnimationFrame(this._tick);
  }

  pause() {
    if (!this.running) {
      return;
    }
    this.running = false;
    cancelAnimationFrame(this._raf);
    this.toneGenerator.stop(this.emuNowSec());
  }

  reset() {
    this.cpu.reset();
    this.totalCycles = 0;
    this.accumulatedCycles = 0;
    this._btnMatrixOut.clear();
    this._btnMatrixIn.clear();
    this.toneGenerator.rebaseTimeline(this.emuNowSec());
  }

  step(cycles = 1) {
    for (let i = 0; i < cycles; i += 1) {
      const c = this.cpu.clock();
      this.totalCycles += c;
    }
  }

  pressButton(button) {
    if (button && typeof button.level === 'object' && button.level !== null) {
      this._pressMatrixButton(button.port, button.pin, button.level);
    } else {
      this.cpu.pin_set(button.port, button.pin, button.level);
    }
  }

  releaseButton(button) {
    this._releaseButton(button.port, button.pin);
  }

  getFrame() {
    return this.cpu.getVRAM();
  }

  _tick(ts) {
    if (!this.running) {
      return;
    }

    if (!this.lastTs) {
      this.lastTs = ts;
    }
    const dtSec = Math.max(0, (ts - this.lastTs) / 1000);
    this.lastTs = ts;

    this.accumulatedCycles += dtSec * this.config.clock * this.speed;
    let ran = 0;
    while (this.accumulatedCycles > 0 && ran < this.maxCyclesPerFrame) {
      const c = this.cpu.clock();
      this.accumulatedCycles -= c;
      ran += c;
      this.totalCycles += c;
    }

    if (this.onFrame) {
      this.onFrame(this.getFrame());
    }

    this._raf = requestAnimationFrame(this._tick);
  }

  _matrixKey(port, pin) {
    return `${port}:${pin}`;
  }

  _setPinState(port, pin, level) {
    const key = this._matrixKey(port, pin);
    this._btnMatrixOut.set(key, level);
    const linked = this._btnMatrixIn.get(key);
    if (!linked) {
      return;
    }
    for (const target of linked) {
      this.cpu.pin_set(target.port, target.pin, level);
    }
  }

  _pressMatrixButton(port, pin, levelRef) {
    const key = this._matrixKey(levelRef.port, levelRef.pin);
    if (!this._btnMatrixIn.has(key)) {
      this._btnMatrixIn.set(key, new Map());
    }
    const entryMap = this._btnMatrixIn.get(key);
    entryMap.set(this._matrixKey(port, pin), { port, pin });

    if (this._btnMatrixOut.has(key)) {
      this.cpu.pin_set(port, pin, this._btnMatrixOut.get(key));
    }
  }

  _releaseButton(port, pin) {
    const id = this._matrixKey(port, pin);
    for (const [, entryMap] of this._btnMatrixIn) {
      entryMap.delete(id);
    }
    this.cpu.pin_release(port, pin);
  }
}
