import { HT4BIT } from './ht4bit.js';
import { EMPTY_VRAM } from './constants.js';

export class HT943 extends HT4BIT {
  constructor(mask, clock, toneGenerator, romBytes, soundRomBytes) {
    super(mask, clock, toneGenerator, romBytes, soundRomBytes);

    this._PPPullupMask = mask.port_pullup.PP;
    this._PSPullupMask = mask.port_pullup.PS;
    this._PMPullupMask = mask.port_pullup.PM;

    this._PPWakeupMask = mask.port_wakeup.PP;
    this._PSWakeupMask = mask.port_wakeup.PS;
    this._PMWakeupMask = mask.port_wakeup.PM;

    this._reset();
    this._instructionsOverride({
      0b00110000: this._out_pa_a,
      0b00110010: this._in_a_pm,
      0b00110011: this._in_a_ps,
      0b00110100: this._in_a_pp,
    });
  }

  _reset() {
    super._reset();
    this._RAM = new Array(256).fill(0);
    this._PA = 0;
    this._PP = this._PPPullupMask;
    this._PS = this._PSPullupMask;
    this._PM = this._PMPullupMask;
  }

  examine() {
    return {
      ACC: this._ACC,
      PC: this._PC & 0xfff,
      ST: this._STACK,
      TC: this._TC,
      CF: this._CF,
      EF: this._EF,
      TF: this._TF,
      EI: this._EI,
      HALT: this._HALT,
      WR0: this._WR[0],
      WR1: this._WR[1],
      WR2: this._WR[2],
      WR3: this._WR[3],
      WR4: this._WR[4],
      PP: this._PP,
      PM: this._PM,
      PS: this._PS,
      PA: this._PA,
      RAM: [...this._RAM],
    };
  }

  pin_set(port, pin, level) {
    if (port === 'PP') {
      this._PP = (~(1 << pin) & this._PP) | ((level & 1) << pin);
      if (this._HALT && (this._PPWakeupMask & (1 << pin)) && !level) {
        this._EF = 1;
        this._HALT = 0;
      }
    } else if (port === 'PM') {
      this._PM = (~(1 << pin) & this._PM) | ((level & 1) << pin);
      if (this._HALT && (this._PMWakeupMask & (1 << pin)) && !level) {
        this._EF = 1;
        this._HALT = 0;
      }
    } else if (port === 'PS') {
      this._PS = (~(1 << pin) & this._PS) | ((level & 1) << pin);
      if (this._HALT && (this._PSWakeupMask & (1 << pin)) && !level) {
        this._EF = 1;
        this._HALT = 0;
      }
    } else if (port === 'RES') {
      this._reset();
      this._RESET = 1;
    }
  }

  pin_release(port, pin) {
    if (port === 'PP') {
      this._PP &= ~(1 << pin);
      this._PP |= this._PPPullupMask & (1 << pin);
    } else if (port === 'PM') {
      this._PM &= ~(1 << pin);
      this._PM |= this._PMPullupMask & (1 << pin);
    } else if (port === 'PS') {
      this._PS &= ~(1 << pin);
      this._PS |= this._PSPullupMask & (1 << pin);
    } else if (port === 'RES') {
      this._RESET = 0;
    }
  }

  getVRAM() {
    if (this._HALT || this._RESET) {
      return EMPTY_VRAM;
    }
    return Uint8Array.from(this._RAM);
  }

  _out_pa_a() { this._PA = this._ACC; this._PC += 1; return 4; }
  _in_a_pm() { this._ACC = this._PM; this._PC += 1; return 4; }
  _in_a_ps() { this._ACC = this._PS; this._PC += 1; return 4; }
  _in_a_pp() { this._ACC = this._PP; this._PC += 1; return 4; }
}
