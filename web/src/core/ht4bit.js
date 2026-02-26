import { ROM } from './rom.js';
import { HT4BITSound } from './ht4bitSound.js';

const TIMER_INT_LOCATION = 4;
const EXTERNAL_INT_LOCATION = 8;

export class HT4BIT {
  constructor(mask, clock, toneGenerator, romBytes, soundRomBytes) {
    this._ROM = new ROM(romBytes);
    this._sound = new HT4BITSound({ ...mask, sound_rom_bytes: soundRomBytes || new Uint8Array() }, clock, toneGenerator);
    this._timerDiv = mask.timer_clock_div;

    this._RAM = [];
    this._execute = this._buildInstructionTable();
    this._reset();
  }

  _buildInstructionTable() {
    return [
      this._rr_a.bind(this),
      this._rl_a.bind(this),
      this._rrc_a.bind(this),
      this._rlc_a.bind(this),
      this._mov_a_r1r0.bind(this),
      this._mov_r1r0_a.bind(this),
      this._mov_a_r3r2.bind(this),
      this._mov_r3r2_a.bind(this),
      this._adc_a_r1r0.bind(this),
      this._add_a_r1r0.bind(this),
      this._sbc_a_r1r0.bind(this),
      this._sub_a_r1r0.bind(this),
      this._inc_r1r0.bind(this),
      this._dec_r1r0.bind(this),
      this._inc_r3r2.bind(this),
      this._dec_r3r2.bind(this),
      this._inc_rn.bind(this), this._dec_rn.bind(this), this._inc_rn.bind(this), this._dec_rn.bind(this),
      this._inc_rn.bind(this), this._dec_rn.bind(this), this._inc_rn.bind(this), this._dec_rn.bind(this),
      this._inc_rn.bind(this), this._dec_rn.bind(this),
      this._and_a_r1r0.bind(this), this._xor_a_r1r0.bind(this), this._or_a_r1r0.bind(this),
      this._and_r1r0_a.bind(this), this._xor_r1r0_a.bind(this), this._or_r1r0_a.bind(this),
      this._mov_rn_a.bind(this), this._mov_a_rn.bind(this), this._mov_rn_a.bind(this), this._mov_a_rn.bind(this),
      this._mov_rn_a.bind(this), this._mov_a_rn.bind(this), this._mov_rn_a.bind(this), this._mov_a_rn.bind(this),
      this._mov_rn_a.bind(this), this._mov_a_rn.bind(this),
      this._clc.bind(this), this._stc.bind(this), this._ei.bind(this), this._di.bind(this),
      this._ret.bind(this), this._reti.bind(this), this._dummy.bind(this), this._inc_a.bind(this),
      this._dummy.bind(this), this._dummy.bind(this), this._dummy.bind(this), this._dummy.bind(this),
      this._daa.bind(this), this._halt.bind(this), this._timer_on.bind(this), this._timer_off.bind(this),
      this._mov_a_tmrl.bind(this), this._mov_a_tmrh.bind(this), this._mov_tmrl_a.bind(this), this._mov_tmrh_a.bind(this),
      this._nop.bind(this), this._dec_a.bind(this), this._add_a_x.bind(this), this._sub_a_x.bind(this),
      this._and_a_x.bind(this), this._xor_a_x.bind(this), this._or_a_x.bind(this), this._sound_n.bind(this),
      this._mov_r4_x.bind(this), this._timer_xx.bind(this), this._sound_one.bind(this), this._sound_loop.bind(this),
      this._sound_off.bind(this), this._sound_a.bind(this), this._read_r4a.bind(this), this._readf_r4a.bind(this),
      this._read_mr0a.bind(this), this._readf_mr0a.bind(this),
      ...new Array(16).fill(this._mov_r1r0_xx.bind(this)),
      ...new Array(16).fill(this._mov_r3r2_xx.bind(this)),
      ...new Array(16).fill(this._mov_a_x.bind(this)),
      ...new Array(32).fill(this._jan_address.bind(this)),
      ...new Array(8).fill(this._jnz_R0_address.bind(this)),
      ...new Array(8).fill(this._jnz_R1_address.bind(this)),
      ...new Array(8).fill(this._jz_a_address.bind(this)),
      ...new Array(8).fill(this._jnz_a_address.bind(this)),
      ...new Array(8).fill(this._jc_address.bind(this)),
      ...new Array(8).fill(this._jnc_address.bind(this)),
      ...new Array(8).fill(this._jtmr_address.bind(this)),
      ...new Array(8).fill(this._jnz_R4_address.bind(this)),
      ...new Array(16).fill(this._jmp_address.bind(this)),
      ...new Array(16).fill(this._call_address.bind(this)),
    ];
  }

  _instructionsOverride(overrides) {
    for (const [indexRaw, instruction] of Object.entries(overrides)) {
      const index = Number(indexRaw);
      if (Array.isArray(instruction)) {
        instruction.forEach((m, i) => {
          if (index + i < this._execute.length) {
            this._execute[index + i] = m.bind(this);
          }
        });
      } else if (index < this._execute.length) {
        this._execute[index] = instruction.bind(this);
      }
    }
  }

  _reset() {
    this._ACC = 0;
    this._WR = [0, 0, 0, 0, 0];
    this._PC = 0;
    this._STACK = 0;
    this._EI = 0;
    this._CF = 0;
    this._TF = 0;
    this._EF = 0;
    this._HALT = 0;
    this._RESET = 0;
    this._TIMERF = 0;
    this._TC = 0;
    this._timerClockCounter = 0;
    this._instrCounter = 0;
    this._sound.setSoundOff();
    this._sound.setOneCycle();
  }

  reset() { this._reset(); }
  pc() { return this._PC; }
  getROM() { return this._ROM; }
  istrCounter() { return this._instrCounter; }

  clock() {
    if (!this._HALT || this._RESET) {
      if (this._EI && this._STACK === 0) {
        if (this._EF) {
          this._EF = 0;
          this._interrupt(EXTERNAL_INT_LOCATION);
        } else if (this._TF) {
          this._TF = 0;
          this._interrupt(TIMER_INT_LOCATION);
        }
      }

      const opcode = this._ROM.getByte(this._PC);
      const execCycles = this._execute[opcode](opcode);
      this._sound.clock(execCycles);

      this._timerClockCounter -= execCycles;
      while (this._timerClockCounter <= 0) {
        this._timerClockCounter += this._timerDiv;
        if (this._TIMERF) {
          this._TC = (this._TC + 1) & 0xff;
          if (this._TC === 0) {
            this._TF = 1;
          }
        }
      }

      this._instrCounter += 1;
      return execCycles;
    }
    return 8;
  }

  _interrupt(location) {
    this._STACK = ((this._CF & 1) << 12) | (this._PC & 0xfff);
    this._PC = (this._PC & 0xf000) | location;
  }

  _read_RAM(rp) { return this._RAM[(this._WR[rp + 1] << 4) | this._WR[rp]]; }
  _write_RAM(rp, value) { this._RAM[(this._WR[rp + 1] << 4) | this._WR[rp]] = value & 0xf; }

  _rr_a() { this._CF = this._ACC & 1; this._ACC = (this._CF << 3) | (this._ACC >> 1); this._PC += 1; return 4; }
  _rl_a() { this._CF = this._ACC >> 3; this._ACC = this._CF | ((this._ACC << 1) & 0xf); this._PC += 1; return 4; }
  _rrc_a() { const n = this._ACC & 1; this._ACC = (this._CF << 3) | (this._ACC >> 1); this._CF = n; this._PC += 1; return 4; }
  _rlc_a() { const n = this._ACC >> 3; this._ACC = this._CF | ((this._ACC << 1) & 0xf); this._CF = n; this._PC += 1; return 4; }
  _mov_a_r1r0() { this._ACC = this._read_RAM(0); this._PC += 1; return 4; }
  _mov_r1r0_a() { this._write_RAM(0, this._ACC); this._PC += 1; return 4; }
  _mov_a_r3r2() { this._ACC = this._read_RAM(2); this._PC += 1; return 4; }
  _mov_r3r2_a() { this._write_RAM(2, this._ACC); this._PC += 1; return 4; }
  _adc_a_r1r0() { this._ACC += this._read_RAM(0) + this._CF; this._CF = this._ACC > 15 ? 1 : 0; this._ACC &= 0xf; this._PC += 1; return 4; }
  _add_a_r1r0() { this._ACC += this._read_RAM(0); this._CF = this._ACC > 15 ? 1 : 0; this._ACC &= 0xf; this._PC += 1; return 4; }
  _sbc_a_r1r0() { this._ACC += (~this._read_RAM(0) & 0xf) + this._CF; this._CF = this._ACC > 15 ? 1 : 0; this._ACC &= 0xf; this._PC += 1; return 4; }
  _sub_a_r1r0() { this._ACC += (~this._read_RAM(0) & 0xf) + 1; this._CF = this._ACC > 15 ? 1 : 0; this._ACC &= 0xf; this._PC += 1; return 4; }
  _inc_r1r0() { this._write_RAM(0, (this._read_RAM(0) + 1) & 0xf); this._PC += 1; return 4; }
  _dec_r1r0() { this._write_RAM(0, (this._read_RAM(0) - 1) & 0xf); this._PC += 1; return 4; }
  _inc_r3r2() { this._write_RAM(2, (this._read_RAM(2) + 1) & 0xf); this._PC += 1; return 4; }
  _dec_r3r2() { this._write_RAM(2, (this._read_RAM(2) - 1) & 0xf); this._PC += 1; return 4; }
  _inc_rn(opcode) { const i = (opcode >> 1) & 0x7; this._WR[i] = (this._WR[i] + 1) & 0xf; this._PC += 1; return 4; }
  _dec_rn(opcode) { const i = (opcode >> 1) & 0x7; this._WR[i] = (this._WR[i] - 1) & 0xf; this._PC += 1; return 4; }
  _and_a_r1r0() { this._ACC &= this._read_RAM(0); this._PC += 1; return 4; }
  _xor_a_r1r0() { this._ACC ^= this._read_RAM(0); this._PC += 1; return 4; }
  _or_a_r1r0() { this._ACC |= this._read_RAM(0); this._PC += 1; return 4; }
  _and_r1r0_a() { this._write_RAM(0, this._read_RAM(0) & this._ACC); this._PC += 1; return 4; }
  _xor_r1r0_a() { this._write_RAM(0, this._read_RAM(0) ^ this._ACC); this._PC += 1; return 4; }
  _or_r1r0_a() { this._write_RAM(0, this._read_RAM(0) | this._ACC); this._PC += 1; return 4; }
  _mov_rn_a(opcode) { this._WR[(opcode >> 1) & 0x7] = this._ACC; this._PC += 1; return 4; }
  _mov_a_rn(opcode) { this._ACC = this._WR[(opcode >> 1) & 0x7]; this._PC += 1; return 4; }
  _clc() { this._CF = 0; this._PC += 1; return 4; }
  _ei() { this._EI = 1; this._PC += 1; return 4; }
  _di() { this._EI = 0; this._PC += 1; return 4; }
  _ret() { this._PC = (this._PC & 0xf000) | (this._STACK & 0xfff); this._STACK = 0; return 4; }
  _reti() { this._PC = (this._PC & 0xf000) | (this._STACK & 0xfff); this._CF = this._STACK >> 12; this._STACK = 0; return 4; }
  _stc() { this._CF = 1; this._PC += 1; return 4; }
  _inc_a() { this._ACC = (this._ACC + 1) & 0xf; this._PC += 1; return 4; }
  _dummy() { this._PC += 1; return 4; }
  _daa() { if (this._ACC > 9 || this._CF) { this._ACC = (this._ACC + 6) & 0xf; this._CF = 1; } this._PC += 1; return 4; }
  _halt() { this._PC += 2; this._HALT = 1; this._EF = 0; this._sound.setSoundOff(); return 8; }
  _timer_on() { this._TIMERF = 1; this._PC += 1; return 4; }
  _timer_off() { this._TIMERF = 0; this._PC += 1; return 4; }
  _mov_a_tmrl() { this._ACC = this._TC & 0xf; this._PC += 1; return 4; }
  _mov_a_tmrh() { this._ACC = (this._TC >> 4) & 0xf; this._PC += 1; return 4; }
  _mov_tmrl_a() { this._TC = (this._TC & 0xf0) | this._ACC; this._PC += 1; return 4; }
  _mov_tmrh_a() { this._TC = (this._TC & 0x0f) | (this._ACC << 4); this._PC += 1; return 4; }
  _nop() { this._PC += 1; return 4; }
  _dec_a() { this._ACC = (this._ACC - 1) & 0xf; this._PC += 1; return 4; }
  _add_a_x() { this._ACC += this._ROM.getByte(this._PC + 1) & 0xf; this._CF = this._ACC > 15 ? 1 : 0; this._ACC &= 0xf; this._PC += 2; return 8; }
  _sub_a_x() { this._ACC += (~this._ROM.getByte(this._PC + 1) & 0xf) + 1; this._CF = this._ACC > 15 ? 1 : 0; this._ACC &= 0xf; this._PC += 2; return 8; }
  _and_a_x() { this._ACC &= this._ROM.getByte(this._PC + 1) & 0xf; this._PC += 2; return 8; }
  _xor_a_x() { this._ACC ^= this._ROM.getByte(this._PC + 1) & 0xf; this._PC += 2; return 8; }
  _or_a_x() { this._ACC |= this._ROM.getByte(this._PC + 1) & 0xf; this._PC += 2; return 8; }
  _sound_n() { this._sound.setSoundChannel(this._ROM.getByte(this._PC + 1) & 0xf); this._PC += 2; return 8; }
  _mov_r4_x() { this._WR[4] = this._ROM.getByte(this._PC + 1) & 0xf; this._PC += 2; return 8; }
  _timer_xx() { this._TC = this._ROM.getByte(this._PC + 1); this._PC += 2; return 8; }
  _sound_one() { this._sound.setOneCycle(); this._PC += 1; return 4; }
  _sound_loop() { this._sound.setRepeatCycle(); this._PC += 1; return 4; }
  _sound_off() { this._sound.setSoundOff(); this._PC += 1; return 4; }
  _sound_a() { this._sound.setSoundChannel(this._ACC); this._PC += 1; return 4; }
  _read_r4a() { this._PC += 1; const byte = this._ROM.getByte((this._PC & 0xff00) | (this._ACC << 4) | this._read_RAM(0)); this._ACC = byte & 0xf; this._WR[4] = (byte >> 4) & 0xf; return 8; }
  _readf_r4a() { this._PC += 1; const byte = this._ROM.getByte((this._PC & 0xf000) | 0xf00 | (this._ACC << 4) | this._read_RAM(0)); this._ACC = byte & 0xf; this._WR[4] = (byte >> 4) & 0xf; return 8; }
  _read_mr0a() { this._PC += 1; const byte = this._ROM.getByte((this._PC & 0xff00) | (this._ACC << 4) | this._WR[4]); this._ACC = byte & 0xf; this._write_RAM(0, (byte >> 4) & 0xf); return 8; }
  _readf_mr0a() { this._PC += 1; const byte = this._ROM.getByte((this._PC & 0xf000) | 0xf00 | (this._ACC << 4) | this._WR[4]); this._ACC = byte & 0xf; this._write_RAM(0, (byte >> 4) & 0xf); return 8; }
  _mov_r1r0_xx(opcode) { this._WR[0] = opcode & 0xf; this._WR[1] = this._ROM.getByte(this._PC + 1) & 0xf; this._PC += 2; return 8; }
  _mov_r3r2_xx(opcode) { this._WR[2] = opcode & 0xf; this._WR[3] = this._ROM.getByte(this._PC + 1) & 0xf; this._PC += 2; return 8; }
  _mov_a_x(opcode) { this._ACC = opcode & 0xf; this._PC += 1; return 4; }
  _jan_address(opcode) { const al = this._ROM.getByte(this._PC + 1); this._PC += 2; if (this._ACC & (1 << ((opcode >> 3) & 0x3))) { this._PC = (this._PC & 0xf800) | ((opcode & 0x7) << 8) | al; } return 8; }
  _jnz_R0_address(opcode) { const al = this._ROM.getByte(this._PC + 1); this._PC += 2; if (this._WR[0]) { this._PC = (this._PC & 0xf800) | ((opcode & 0x7) << 8) | al; } return 8; }
  _jnz_R1_address(opcode) { const al = this._ROM.getByte(this._PC + 1); this._PC += 2; if (this._WR[1]) { this._PC = (this._PC & 0xf800) | ((opcode & 0x7) << 8) | al; } return 8; }
  _jz_a_address(opcode) { const al = this._ROM.getByte(this._PC + 1); this._PC += 2; if (this._ACC === 0) { this._PC = (this._PC & 0xf800) | ((opcode & 0x7) << 8) | al; } return 8; }
  _jnz_a_address(opcode) { const al = this._ROM.getByte(this._PC + 1); this._PC += 2; if (this._ACC) { this._PC = (this._PC & 0xf800) | ((opcode & 0x7) << 8) | al; } return 8; }
  _jc_address(opcode) { const al = this._ROM.getByte(this._PC + 1); this._PC += 2; if (this._CF) { this._PC = (this._PC & 0xf800) | ((opcode & 0x7) << 8) | al; } return 8; }
  _jnc_address(opcode) { const al = this._ROM.getByte(this._PC + 1); this._PC += 2; if (!this._CF) { this._PC = (this._PC & 0xf800) | ((opcode & 0x7) << 8) | al; } return 8; }
  _jtmr_address(opcode) { const al = this._ROM.getByte(this._PC + 1); this._PC += 2; if (this._TF) { this._PC = (this._PC & 0xf800) | ((opcode & 0x7) << 8) | al; this._TF = 0; } return 8; }
  _jnz_R4_address(opcode) { const al = this._ROM.getByte(this._PC + 1); this._PC += 2; if (this._WR[4]) { this._PC = (this._PC & 0xf800) | ((opcode & 0x7) << 8) | al; } return 8; }
  _jmp_address(opcode) { this._PC = (this._PC & 0xf000) | ((opcode & 0xf) << 8) | this._ROM.getByte(this._PC + 1); return 8; }
  _call_address(opcode) { this._STACK = (this._PC + 2) & 0xfff; this._PC = (this._PC & 0xf000) | ((opcode & 0xf) << 8) | this._ROM.getByte(this._PC + 1); return 8; }
}
