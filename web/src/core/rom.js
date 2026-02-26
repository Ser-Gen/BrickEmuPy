export class ROM {
  constructor(bytes) {
    if (!(bytes instanceof Uint8Array)) {
      throw new Error('ROM expects Uint8Array');
    }
    this._rom = new Uint8Array(bytes);
    this._romSize = this._rom.length;
    if (this._romSize === 0) {
      throw new Error('ROM must not be empty');
    }
  }

  getByte(address) {
    return this._rom[address % this._romSize];
  }

  getWord(address) {
    const a = address % this._romSize;
    const b = (address + 1) % this._romSize;
    return (this._rom[a] << 8) | this._rom[b];
  }

  getWordLSB(address) {
    const a = address % this._romSize;
    const b = (address + 1) % this._romSize;
    return this._rom[a] | (this._rom[b] << 8);
  }

  getBytes(address, count) {
    let result = 0;
    for (let i = 0; i < count; i += 1) {
      result |= this._rom[(address + i) % this._romSize] << (8 * (count - i - 1));
    }
    return result >>> 0;
  }

  writeByte(address, value) {
    if (address < this._romSize) {
      this._rom[address] = value & 0xff;
    }
  }

  writeWord(address, value) {
    if (address < this._romSize - 1) {
      this._rom[address] = (value >> 8) & 0xff;
      this._rom[address + 1] = value & 0xff;
    }
  }

  size() {
    return this._romSize;
  }

  getMask() {
    return (1 << Math.ceil(Math.log2(this._romSize))) - 1;
  }
}
