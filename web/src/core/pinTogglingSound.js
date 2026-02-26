export class PinTogglingSound {
  constructor(clock, toneGenerator) {
    this._clock = clock;
    this._toneGenerator = toneGenerator;
    this._cycleCounter = 0;
  }

  toggle(halfWave1, halfWave2, currentCycle) {
    this._cycleCounter = currentCycle;
    const t = currentCycle / this._clock;
    if (halfWave1) {
      this._toneGenerator.play(0, false, 1, t);
    } else if (halfWave2) {
      this._toneGenerator.play(0, false, -1, t);
    } else {
      this._toneGenerator.stop(t);
    }
  }
}
