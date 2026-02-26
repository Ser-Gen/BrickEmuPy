const SINGLE_SIZE_CHANNEL_SIZE = 32;
const SINGLE_SIZE_CHANNEL_COUNT = 12;
const SROM_SIZE = SINGLE_SIZE_CHANNEL_SIZE * 20;
const SQUARENESS_FACTOR = 5;

const LFSR2DIV = [
  0, 2, 123, 3, 124, 75, 117, 4, 125, 101, 111, 76, 118, 42, 69, 5, 126, 66, 63, 102, 112, 86, 36, 77, 119,
  21, 95, 43, 70, 25, 105, 6, 127, 115, 99, 67, 64, 34, 19, 103, 113, 17, 15, 87, 37, 55, 89, 78, 120, 39,
  60, 22, 96, 52, 57, 44, 71, 91, 30, 26, 106, 47, 80, 7, 1, 122, 74, 116, 100, 110, 41, 68, 65, 62, 85, 35,
  20, 94, 24, 104, 114, 98, 33, 18, 16, 14, 54, 88, 38, 59, 51, 56, 90, 29, 46, 79, 121, 73, 109, 40, 61, 84,
  93, 23, 97, 32, 13, 53, 58, 50, 28, 45, 72, 108, 83, 92, 31, 12, 49, 27, 107, 82, 11, 48, 81, 10, 9, 8,
];

export class HT4BITSound {
  constructor(mask, clock, toneGenerator) {
    this._systemClock = clock;
    this._clockCounter = 0;
    this._noteCounter = 0;
    this._channel = 0;
    this._repeatCycle = false;
    this._soundOn = false;
    this._freqDiv = mask.sound_freq_div;
    this._speedDiv = mask.sound_speed_div;
    this._channelEffect = mask.sound_effect;
    this._cycleCounter = 0;
    this._toneGenerator = toneGenerator;

    const source = mask.sound_rom_bytes || new Uint8Array();
    this._sROM = new Uint8Array(SROM_SIZE);
    this._sROM.set(source.slice(0, SROM_SIZE));
  }

  clock(execCycles) {
    this._cycleCounter += execCycles;
    if (!this._soundOn) {
      return;
    }

    this._clockCounter -= execCycles;
    if (this._clockCounter <= 0) {
      this._clockCounter += LFSR2DIV[this._speedDiv[this._channel]] * this._freqDiv * 16;
      const channelSize = SINGLE_SIZE_CHANNEL_SIZE * (this._channel >= SINGLE_SIZE_CHANNEL_COUNT ? 2 : 1);
      const freq = this._getFreq();
      const sec = this._cycleCounter / this._systemClock;
      if (freq > 0) {
        this._toneGenerator.play(freq, (this._channelEffect[this._channel] & 0x1) === 1, SQUARENESS_FACTOR, sec);
      } else {
        this._toneGenerator.stop(sec);
      }
      this._noteCounter = (this._noteCounter + 1) % channelSize;
      if (this._noteCounter === 0 && !this._repeatCycle) {
        this._soundOn = false;
        this._toneGenerator.stop(sec);
      }
    }
  }

  _getFreq() {
    let channelOffset = this._channel * SINGLE_SIZE_CHANNEL_SIZE;
    if (this._channel > SINGLE_SIZE_CHANNEL_COUNT) {
      channelOffset += (this._channel - SINGLE_SIZE_CHANNEL_COUNT) * SINGLE_SIZE_CHANNEL_SIZE;
    }
    const note = this._sROM[channelOffset + this._noteCounter];
    if (note === 0) {
      return 0;
    }
    return (this._systemClock / this._freqDiv / LFSR2DIV[note]) * 2;
  }

  setSoundOff() {
    this._soundOn = false;
    this._toneGenerator.stop(this._cycleCounter / this._systemClock);
  }

  setSoundChannel(channel) {
    this._soundOn = true;
    this._noteCounter = 0;
    this._channel = channel & 0xf;
  }

  setOneCycle() {
    this._repeatCycle = false;
  }

  setRepeatCycle() {
    this._repeatCycle = true;
  }
}
