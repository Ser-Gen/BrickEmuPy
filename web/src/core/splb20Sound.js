const SQUARENESS_FACTOR = 5;

export class SPLB20Sound {
  constructor(clock, toneGenerator) {
    this._systemClock = clock;
    this._tcDiv = 1;
    this._clockDiv = 1;
    this._enable = false;
    this._toneGenerator = toneGenerator;
  }

  setClockDiv(clockDiv, currentCycle) {
    this._clockDiv = clockDiv;
    this._tone(currentCycle);
  }

  setTcDiv(tcDiv, currentCycle) {
    this._tcDiv = tcDiv;
    this._tone(currentCycle);
  }

  setEnable(enable, currentCycle) {
    this._enable = enable;
    this._tone(currentCycle);
  }

  _tone(currentCycle) {
    if (this._tcDiv > 0 && this._enable) {
      const freq = this._systemClock / this._clockDiv / this._tcDiv / 2;
      this._toneGenerator.play(freq, false, SQUARENESS_FACTOR, currentCycle / this._systemClock);
    } else {
      this._toneGenerator.stop(currentCycle / this._systemClock);
    }
  }
}
