import { ROM } from './rom.js';
import { PinTogglingSound } from './pinTogglingSound.js';

const PRESCALER_SIZE = 32768;

const RAM_SIZE = 128;
const SEG_COUNT = 36;
const COM_COUNT = 4;
const GRAM_SIZE = (SEG_COUNT / 4) * COM_COUNT;

const MCLOCK_DIV0 = 4;
const MCLOCK_DIV1 = 16;
const MCLOCK_DIV2 = 20;
const MCLOCK_DIV3 = 24;
const MCLOCK_DIV4 = 32;

export class T7741 {
  constructor(mask, clock, toneGenerator, romBytes) {
    this._ROM = new ROM(romBytes);
    this._sound = new PinTogglingSound(clock, toneGenerator);

    this._set_pin_state = null;

    this._instr_counter = 0;
    this._cycle_counter = 0;
    this._counter = 0;

    this._com_div = mask.com_div;
    this._frame_div = this._com_div * COM_COUNT;

    this._sound_gnd = mask.sound_gnd;

    this._sub_clock_div = mask.sub_clock / clock;

    this._px_div = PRESCALER_SIZE / mask.prescaler_div[0];
    this._py_div = PRESCALER_SIZE / mask.prescaler_div[1];
    this._pz_div = PRESCALER_SIZE / mask.prescaler_div[2];

    this._OUTP = 0;
    this._IOP = 0;

    this._reset();

    this._execute = [
      this._nop.bind(this),
      this._mov_l_b.bind(this),
      this._addc_a_mhl.bind(this),
      this._inc_l.bind(this),
      this._scan_0.bind(this),
      this._nop.bind(this),
      this._ret0.bind(this),
      this._tst_px.bind(this),
      this._tst_py.bind(this),
      this._mov_m1l_a.bind(this),
      this._rorc_mhl.bind(this),
      this._mov_a_m1l.bind(this),
      this._incp10.bind(this),
      this._in_a_ip.bind(this),
      this._rolc_mhl.bind(this),
      this._mov_a_mhl.bind(this),
      this._mov_h_incb.bind(this),
      this._mov_a_b.bind(this),
      this._addc_a_b.bind(this),
      this._inc_b.bind(this),
      this._nop.bind(this),
      this._osc_ext.bind(this),
      this._nop2.bind(this),
      this._nop.bind(this),
      this._wait_frame.bind(this),
      this._mov_b_a.bind(this),
      this._clearm_mhl_dec.bind(this),
      this._out_bz_1.bind(this),
      this._nop2.bind(this),
      this._in_a_iop.bind(this),
      this._nop2.bind(this),
      this._nop.bind(this),
      this._mov_h_a.bind(this),
      this._mov_l_a.bind(this),
      this._subc_a_mhl.bind(this),
      this._dec_l.bind(this),
      this._scan_1.bind(this),
      this._nop.bind(this),
      this._ret1.bind(this),
      this._0027.bind(this),
      this._tst_pz.bind(this),
      this._mov_mhl_a.bind(this),
      this._exe_cf_a.bind(this),
      this._nop.bind(this),
      this._decp10.bind(this),
      this._inc_mhl.bind(this),
      this._nop2.bind(this),
      this._nop.bind(this),
      this._mov_h_dec_b.bind(this),
      this._mov_a_l.bind(this),
      this._subc_a_b.bind(this),
      this._dec_b.bind(this),
      this._nop.bind(this),
      this._osc_int.bind(this),
      this._nop2.bind(this),
      this._0037.bind(this),
      this._wait_com.bind(this),
      this._mov_b_l.bind(this),
      this._clearm_mhl_inc.bind(this),
      this._out_bz_0.bind(this),
      this._nop2.bind(this),
      this._dec_mhl.bind(this),
      this._nop2.bind(this),
      this._nop.bind(this),
      ...new Array(16).fill(this._addc_a_imm.bind(this)),
      ...new Array(16).fill(this._subc_a_imm.bind(this)),
      ...new Array(16).fill(this._mov_mhlinc_imm.bind(this)),
      ...new Array(16).fill(this._mov_mhl_imm.bind(this)),
      ...new Array(16).fill(this._movm_mhlsubi_mhl.bind(this)),
      ...new Array(16).fill(this._movm_mhladdi_mhl.bind(this)),
      ...new Array(16).fill(this._inc_m1i.bind(this)),
      ...new Array(16).fill(this._dec_m1i.bind(this)),
      ...new Array(16).fill(this._addc10m_mhl_mbl.bind(this)),
      ...new Array(16).fill(this._subc10m_mhl_mbl.bind(this)),
      ...new Array(16).fill(this._out_outp_imm.bind(this)),
      ...new Array(16).fill(this._out_iop_imm.bind(this)),
      ...new Array(64).fill(this._sbit_m.bind(this)),
      ...new Array(64).fill(this._rbit_m.bind(this)),
      ...new Array(64).fill(this._tbit_m.bind(this)),
      ...new Array(16).fill(this._outm_lcd_mhl.bind(this)),
      ...new Array(16).fill(this._mov_pch_imm.bind(this)),
      ...new Array(16).fill(this._cmp_mhl_imm.bind(this)),
      ...new Array(16).fill(this._delay_nl_imm.bind(this)),
      ...new Array(16).fill(this._mov_l_imm.bind(this)),
      ...new Array(16).fill(this._call0.bind(this)),
      ...new Array(16).fill(this._mov_a_m0i.bind(this)),
      ...new Array(16).fill(this._call1.bind(this)),
      ...new Array(16).fill(this._mov_b_imm.bind(this)),
      ...new Array(16).fill(this._call0.bind(this)),
      ...new Array(16).fill(this._mov_m0i_a.bind(this)),
      ...new Array(16).fill(this._call1.bind(this)),
      ...new Array(16).fill(this._mov_h_imm.bind(this)),
      ...new Array(16).fill(this._call0.bind(this)),
      ...new Array(16).fill(this._mov_a_m1i.bind(this)),
      ...new Array(16).fill(this._call1.bind(this)),
      ...new Array(16).fill(this._mov_a_imm.bind(this)),
      ...new Array(16).fill(this._call0.bind(this)),
      ...new Array(16).fill(this._mov_m1i_a.bind(this)),
      ...new Array(16).fill(this._call1.bind(this)),
      ...new Array(256).fill(this._bs_imm.bind(this)),
    ];
  }

  set_pin_state_callback(set_pin_state) {
    this._set_pin_state = set_pin_state;
  }

  _set_out(port, value) {
    let prev_value = 0;
    if (port === 'OUTP') {
      prev_value = this._OUTP;
      this._OUTP = value;
    } else if (port === 'IOP') {
      prev_value = this._IOP;
      this._IOP = value;
    }

    if (value !== prev_value && this._set_pin_state) {
      const changed_bits = value ^ prev_value;
      for (let bit = 0; bit < 4; bit += 1) {
        if (changed_bits & (1 << bit)) {
          this._set_pin_state(port, bit, (value >> bit) & 0x1);
        }
      }
    }
  }

  _reset() {
    this._PC = 0xF00;
    this._A = 0;
    this._B = 0;

    this._H = 0;
    this._L = 0;

    this._CF = 0;
    this._nSF = 0;

    this._PZF = 0;
    this._PYF = 0;
    this._PXF = 0;

    this._INP = 0;
    this._BZ = 0;
    this._set_out('OUTP', this._OUTP);
    this._set_out('IOP', this._IOP);

    this._HALT = 0;

    this._GRAM_OFFSET = 0;
    this._SCAN = 1;
    this._PCHTMP = -1;

    this._RAM = new Array(RAM_SIZE).fill(0);
    this._GRAM = new Array(GRAM_SIZE).fill(0);

    this._CLC_SRC = 0;
  }

  reset() {
    this._reset();
  }

  pin_set(port, pin, level) {
    if (port === 'INP') {
      this._INP = (~(1 << pin) & this._INP) | (level << pin);
    } else if (port === 'IOP') {
      this._IOP = (~(1 << pin) & this._IOP) | (level << pin);
    } else if (port === 'RES') {
      this._reset();
      this._HALT = 1;
    }
  }

  pin_release(port, pin) {
    if (port === 'INP') {
      this._INP &= ~(1 << pin);
    } else if (port === 'IOP') {
      this._IOP &= ~(1 << pin);
    } else if (port === 'RES') {
      this._HALT = 0;
    }
  }

  pc() {
    return this._PC & 0xFFF;
  }

  getVRAM() {
    return Uint8Array.from(this._GRAM);
  }

  istr_counter() {
    return this._instr_counter;
  }

  clock() {
    let exec_cycles = MCLOCK_DIV4;
    if (!this._HALT) {
      const opcode = this._ROM.getWord(this._PC << 1);
      this._PC = (this._PC & 0xF00) | ((this._PC + 1) & 0xFF);
      exec_cycles = this._execute[opcode & 0x3FF](opcode);
      this._instr_counter += 1;
    }

    if (this._CLC_SRC) {
      this._counter += exec_cycles;
      exec_cycles /= this._sub_clock_div;
    } else {
      this._counter += exec_cycles * this._sub_clock_div;
    }

    if (this._counter % this._pz_div < exec_cycles * this._sub_clock_div) {
      this._PZF = true;
      if (this._counter % this._py_div < exec_cycles * this._sub_clock_div) {
        this._PYF = true;
        if (this._counter % this._px_div < exec_cycles * this._sub_clock_div) {
          this._PXF = true;
        }
      }
    }

    this._cycle_counter += exec_cycles;
    return exec_cycles;
  }

  _nop() { this._nSF = 0; return MCLOCK_DIV1; }
  _mov_a_m1l() { this._A = this._RAM[0x10 | this._L]; this._nSF = 0; return MCLOCK_DIV1; }
  _addc_a_mhl() { const a = this._A + this._RAM[(this._H << 4) | this._L]; this._A = a & 0xF; this._nSF = this._CF = a > 15; return MCLOCK_DIV1; }
  _inc_l() { const l = this._L + 1; this._L = l & 0xF; this._nSF = l > 15; return MCLOCK_DIV1; }
  _scan_0() { this._SCAN = 0; this._nSF = 0; return MCLOCK_DIV1; }
  _mov_l_b() { this._L = this._B; this._nSF = 0; return MCLOCK_DIV1; }
  _ret0() { this._PC = (this._RAM[0x70] << 8) | (this._RAM[0x71] << 4) | this._RAM[0x72]; this._L = 0; this._nSF = 0; return MCLOCK_DIV4; }
  _tst_px() { this._nSF = this._PXF; this._PXF = false; return MCLOCK_DIV1; }
  _tst_py() { this._nSF = this._PYF; this._PYF = false; return MCLOCK_DIV1; }
  _mov_m1l_a() { this._RAM[0x10 | this._L] = this._A; this._nSF = 0; return MCLOCK_DIV1; }
  _rorc_mhl() { const hl = (this._H << 4) | this._L; const cf = this._RAM[hl] & 0x1; this._A = this._RAM[hl] = (this._CF << 3) | (this._RAM[hl] >> 1); this._CF = cf; this._nSF = 0; return MCLOCK_DIV1; }
  _incp10() { const hll = (this._H << 4) | this._L; this._L = (this._L + 1) & 0xF; const hlh = (this._H << 4) | this._L; let mh = this._RAM[hlh]; this._RAM[hll] += 1; if (this._RAM[hll] > 9) { this._RAM[hll] = (this._RAM[hll] + 6) & 0xF; mh += 1; this._RAM[hlh] = mh & 0xF; } this._A = this._RAM[hlh]; this._nSF = this._CF = mh > 15; return MCLOCK_DIV4; }
  _in_a_ip() { this._A = this._INP; this._nSF = this._CF = 0; return MCLOCK_DIV1; }
  _rolc_mhl() { const hl = (this._H << 4) | this._L; const cf = this._RAM[hl] >> 3; this._A = this._RAM[hl] = (this._CF | (this._RAM[hl] << 1)) & 0xF; this._CF = cf; this._nSF = 0; return MCLOCK_DIV1; }
  _mov_h_incb() { const b = this._B + 1; this._B = b & 0xF; this._H = b & 0x7; this._nSF = b > 15; return MCLOCK_DIV1; }
  _mov_a_b() { this._A = this._B; this._nSF = this._CF = 0; return MCLOCK_DIV1; }
  _addc_a_b() { const a = this._A + this._B + this._CF; this._A = a & 0xF; this._nSF = this._CF = a > 15; return MCLOCK_DIV1; }
  _inc_b() { const b = this._B + 1; this._B = b & 0xF; this._nSF = b > 15; return MCLOCK_DIV1; }
  _osc_ext() { this._CLC_SRC = 1; this._nSF = 0; return MCLOCK_DIV1; }
  _out_bz_1() { this._BZ = 1; this._sound.toggle(this._sound_gnd ^ this._BZ, 0, this._cycle_counter); this._nSF = 0; return MCLOCK_DIV1; }
  _delay_nl_imm(opcode) { const delay = MCLOCK_DIV1 + MCLOCK_DIV0 * (15 - this._L); this._L = opcode & 0xF; this._nSF = 0; return delay; }
  _wait_frame() { if (this._SCAN === 0) { this._GRAM = new Array(GRAM_SIZE).fill(0xF); } this._GRAM_OFFSET = 0; this._nSF = 0; return this._frame_div - (this._cycle_counter % this._frame_div); }
  _mov_b_a() { this._B = this._A; this._nSF = 0; return MCLOCK_DIV1; }
  _clearm_mhl_dec() { const count = this._B + 1; for (let i = 0; i < count; i += 1) { this._L = (this._L - 1) & 0xF; this._RAM[(this._H << 4) | this._L] = 0; } this._A = 0; this._B = 15; this._nSF = this._CF = 0; return MCLOCK_DIV1 + MCLOCK_DIV1 * count; }
  _nop2() { this._nSF = 0; return MCLOCK_DIV4; }
  _in_a_iop() { this._A = this._IOP; this._CF = this._nSF = 0; return MCLOCK_DIV1; }
  _mov_h_a() { this._H = this._A & 0x7; this._nSF = 0; return MCLOCK_DIV1; }
  _mov_a_mhl() { this._A = this._RAM[(this._H << 4) | this._L]; this._nSF = 0; return MCLOCK_DIV1; }
  _subc_a_mhl() { const a = this._RAM[(this._H << 4) | this._L] - this._A - this._CF; this._A = a & 0xF; this._CF = this._nSF = a < 0; return MCLOCK_DIV1; }
  _dec_l() { const l = this._L - 1; this._L = l & 0xF; this._nSF = l < 0; return MCLOCK_DIV1; }
  _scan_1() { this._SCAN = 1; this._nSF = 0; return MCLOCK_DIV1; }
  _mov_l_a() { this._L = this._A; this._nSF = 0; return MCLOCK_DIV1; }
  _ret1() { this._PC = (this._RAM[0x73] << 8) | (this._RAM[0x74] << 4) | this._RAM[0x75]; this._L = 0; this._nSF = 0; return MCLOCK_DIV4; }
  _0027() { this._nSF = 0; return MCLOCK_DIV1; }
  _tst_pz() { this._nSF = this._PZF; this._PZF = false; return MCLOCK_DIV1; }
  _mov_mhl_a() { this._RAM[(this._H << 4) | this._L] = this._A; this._nSF = 0; return MCLOCK_DIV1; }
  _exe_cf_a() { const addr = ((this._PC & 0xFE0) | ((this._CF << 4) | this._A)) << 1; let opcode = this._ROM.getWord(this._PC << 1); let exec_cycles = this._execute[opcode & 0x3FF](opcode); this._PC = (this._PC & 0xF00) | ((this._PC + 1) & 0xFF); opcode = this._ROM.getWord(addr); exec_cycles += this._execute[opcode & 0x3FF](opcode); return exec_cycles + MCLOCK_DIV4; }
  _decp10() { const hl = (this._H << 4) | this._L; this._L = (this._L + 1) & 0xF; const hl1 = (this._H << 4) | this._L; let mh = this._RAM[hl1]; this._RAM[hl] = (this._RAM[hl] - 1) & 0xF; if (this._RAM[hl] > 9) { this._RAM[hl] = (this._RAM[hl] + 10) & 0xF; mh -= 1; this._RAM[hl1] = mh & 0xF; } this._A = this._RAM[hl1]; this._nSF = this._CF = mh < 0; return MCLOCK_DIV4; }
  _inc_mhl() { const hl = (this._H << 4) | this._L; const res = this._RAM[hl] + 1; this._A = this._RAM[hl] = res & 0xF; this._nSF = this._CF = res > 15; return MCLOCK_DIV1; }
  _mov_h_dec_b() { const res = this._B - 1; this._B = res & 0xF; this._H = res & 0x7; this._nSF = res < 0; return MCLOCK_DIV1; }
  _mov_a_l() { this._A = this._L; this._CF = this._nSF = 0; return MCLOCK_DIV1; }
  _subc_a_b() { const a = this._B - this._A - this._CF; this._A = a & 0xF; this._CF = this._nSF = a < 0; return MCLOCK_DIV1; }
  _dec_b() { const b = this._B - 1; this._B = b & 0xF; this._nSF = b < 0; return MCLOCK_DIV1; }
  _osc_int() { this._CLC_SRC = 0; this._nSF = 0; return MCLOCK_DIV1; }
  _out_bz_0() { this._BZ = 0; this._sound.toggle(this._sound_gnd ^ this._BZ, 0, this._cycle_counter); this._nSF = 0; return MCLOCK_DIV1; }
  _0037() { this._nSF = 0; return MCLOCK_DIV1; }
  _wait_com() { this._GRAM_OFFSET = (this._GRAM_OFFSET + SEG_COUNT / 4) % GRAM_SIZE; this._nSF = 0; return this._com_div - (this._cycle_counter % this._com_div); }
  _mov_b_l() { this._B = this._L; this._nSF = 0; return MCLOCK_DIV1; }
  _clearm_mhl_inc() { const count = this._B + 1; for (let i = 0; i < count; i += 1) { this._L = (this._L + 1) & 0xF; this._RAM[(this._H << 4) | this._L] = 0; } this._A = 0; this._B = 15; this._nSF = this._CF = 0; return MCLOCK_DIV1 + MCLOCK_DIV1 * count; }
  _dec_mhl() { const hl = (this._H << 4) | this._L; const res = this._RAM[hl] - 1; this._A = this._RAM[hl] = res & 0xF; this._nSF = this._CF = res < 0; return MCLOCK_DIV1; }
  _mov_mhlinc_imm(opcode) { this._RAM[(this._H << 4) | this._L] = opcode & 0xF; const l = this._L + 1; this._L = l & 0xF; this._nSF = l > 15; return MCLOCK_DIV1; }
  _mov_mhl_imm(opcode) { this._RAM[(this._H << 4) | this._L] = opcode & 0xF; const b = this._B + 1; this._B = b & 0xF; this._H = b & 0x7; this._nSF = b > 15; return MCLOCK_DIV1; }
  _movm_mhlsubi_mhl(opcode) { const i = opcode & 0xF; const count = 16 - this._B; for (let j = 0; j < count; j += 1) { this._RAM[(this._H << 4) | ((this._L - i) & 0xF)] = this._RAM[(this._H << 4) | this._L]; this._L = (this._L + 1) & 0xF; } this._B = (i - 1) & 0xF; this._CF = 0; this._nSF = i === 0; return MCLOCK_DIV3 * (count - 1) + MCLOCK_DIV4; }
  _movm_mhladdi_mhl(opcode) { const i = opcode & 0xF; const count = 16 - this._B; for (let j = 0; j < count; j += 1) { this._RAM[(this._H << 4) | ((this._L + i) & 0xF)] = this._RAM[(this._H << 4) | this._L]; this._L = (this._L - 1) & 0xF; } this._B = (i - 1) & 0xF; this._CF = 0; this._nSF = i === 0; return MCLOCK_DIV3 * (count - 1) + MCLOCK_DIV4; }
  _inc_m1i(opcode) { const hl = 0x10 | (opcode & 0xF); const res = this._RAM[hl] + 1; this._A = this._RAM[hl] = res & 0xF; this._nSF = this._CF = res > 15; return MCLOCK_DIV1; }
  _dec_m1i(opcode) { const hl = 0x10 | (opcode & 0xF); const res = this._RAM[hl] - 1; this._A = this._RAM[hl] = res & 0xF; this._nSF = this._CF = res < 0; return MCLOCK_DIV1; }
  _addc10m_mhl_mbl(opcode) { let count = 16 - (opcode & 0xF) - this._L + 1; if (count <= 0) count = 1; for (let j = 0; j < count; j += 1) { const hl = (this._H << 4) | this._L; let res = this._RAM[hl] + this._RAM[((this._B & 0x7) << 4) | this._L] + this._CF; if (res > 9) { res += 6; this._CF = 1; } else { this._CF = 0; } this._A = this._RAM[hl] = res & 0xF; this._L = (this._L + 1) & 0xF; } this._nSF = 0; return MCLOCK_DIV4 + MCLOCK_DIV2 * (count - 1); }
  _subc10m_mhl_mbl(opcode) { let count = 16 - (opcode & 0xF) - this._L + 1; if (count <= 0) count = 1; for (let j = 0; j < count; j += 1) { const hl = (this._H << 4) | this._L; let res = this._RAM[hl] - this._RAM[((this._B & 0x7) << 4) | this._L] - this._CF; if (res < 0 || res > 9) { res += 10; this._CF = 1; } else { this._CF = 0; } this._A = this._RAM[hl] = res & 0xF; this._L = (this._L + 1) & 0xF; } this._nSF = 0; return MCLOCK_DIV4 + MCLOCK_DIV2 * (count - 1); }
  _out_outp_imm(opcode) { this._A = opcode & 0xF; this._set_out('OUTP', this._A); this._CF = this._nSF = 0; return MCLOCK_DIV1; }
  _out_iop_imm(opcode) { this._A = opcode & 0xF; this._set_out('IOP', this._A); this._CF = this._nSF = 0; return MCLOCK_DIV1; }
  _sbit_m(opcode) { const bb = (opcode >> 4) & 0x3; if (opcode & 0x8) { const hl = (this._H << 4) | this._L; if (bb === 1) { this._A = this._RAM[hl] = this._RAM[hl] | this._B; } else { this._A = this._RAM[hl]; } } else { const hl = opcode & 0x7; this._A = this._RAM[hl] = this._RAM[hl] | (1 << bb); } this._CF = this._nSF = 0; return MCLOCK_DIV1; }
  _rbit_m(opcode) { const bb = (opcode >> 4) & 0x3; if (opcode & 0x8) { const hl = (this._H << 4) | this._L; if (bb === 1) { this._A = this._RAM[hl] = this._RAM[hl] & ~this._B; } else { this._A = this._RAM[hl]; } } else { const hl = opcode & 0x7; this._A = this._RAM[hl] = this._RAM[hl] & ~(1 << bb); } this._CF = this._nSF = 0; return MCLOCK_DIV1; }
  _tbit_m(opcode) { const bb = (opcode >> 4) & 0x3; if (opcode & 0x8) { const hl = (this._H << 4) | this._L; if (bb === 1) { this._nSF = this._RAM[hl] >= (this._RAM[hl] | this._B); } else { this._nSF = 1; } } else { this._nSF = (this._RAM[opcode & 0x7] >> bb) & 0x1; } return MCLOCK_DIV1; }
  _outm_lcd_mhl(opcode) { let count = this._L - (opcode & 0xF) + 2; if (count <= 0) count = 1; for (let j = 0; j < count; j += 1) { this._GRAM[this._GRAM_OFFSET] = this._RAM[(this._H << 4) | this._L]; this._GRAM_OFFSET = (this._GRAM_OFFSET + 1) % GRAM_SIZE; this._L = (this._L - 1) & 0xF; } this._A = (this._A + 1) & 0xF; this._H = this._A & 0x7; this._L = 0xF; this._CF = this._nSF = this._A === 0; return MCLOCK_DIV4 + MCLOCK_DIV1 * (count - 1); }
  _mov_pch_imm(opcode) { if (!this._nSF) this._PCHTMP = opcode & 0xF; return MCLOCK_DIV1; }
  _cmp_mhl_imm(opcode) { const a = this._RAM[(this._H << 4) | this._L] - (opcode & 0xF); this._A = a & 0xF; this._CF = a < 0; this._nSF = a !== 0; return MCLOCK_DIV4; }
  _addc_a_imm(opcode) { const a = this._A + (opcode & 0xF) + this._CF; this._A = a & 0xF; this._CF = this._nSF = a > 15; return MCLOCK_DIV1; }
  _subc_a_imm(opcode) { const a = (opcode & 0xF) - this._A - this._CF; this._A = a & 0xF; this._CF = this._nSF = a < 0; return MCLOCK_DIV1; }
  _mov_l_imm(opcode) { this._L = opcode & 0xF; this._nSF = 0; return MCLOCK_DIV1; }
  _call0(opcode) { this._RAM[0x70] = (this._PC >> 8) & 0xF; this._RAM[0x71] = (this._PC >> 4) & 0xF; this._RAM[0x72] = this._PC & 0xF; this._PC = ((opcode & 0xC0) << 4) | 0x1F0 | (opcode & 0xF); this._L = 0; this._nSF = 0; return MCLOCK_DIV4; }
  _mov_a_m0i(opcode) { this._A = this._RAM[opcode & 0xF]; this._CF = this._nSF = 0; return MCLOCK_DIV1; }
  _call1(opcode) { this._RAM[0x73] = (this._PC >> 8) & 0xF; this._RAM[0x74] = (this._PC >> 4) & 0xF; this._RAM[0x75] = this._PC & 0xF; this._PC = ((opcode & 0xC0) << 4) | 0x3F0 | (opcode & 0xF); this._L = 0; this._nSF = 0; return MCLOCK_DIV4; }
  _mov_b_imm(opcode) { this._B = opcode & 0xF; this._nSF = 0; return MCLOCK_DIV1; }
  _mov_m0i_a(opcode) { this._RAM[opcode & 0xF] = this._A; this._nSF = 0; return MCLOCK_DIV1; }
  _mov_h_imm(opcode) { this._H = opcode & 0x7; this._nSF = 0; return MCLOCK_DIV1; }
  _mov_a_m1i(opcode) { this._A = this._RAM[0x10 | (opcode & 0xF)]; this._CF = this._nSF = 0; return MCLOCK_DIV1; }
  _mov_a_imm(opcode) { this._A = opcode & 0xF; this._CF = this._nSF = 0; return MCLOCK_DIV1; }
  _mov_m1i_a(opcode) { this._RAM[0x10 | (opcode & 0xF)] = this._A; this._nSF = 0; return MCLOCK_DIV1; }
  _bs_imm(opcode) { if (!this._nSF) { if (this._PCHTMP >= 0) { this._PC = (this._PCHTMP << 8) | (opcode & 0xFF); } else { this._PC = (this._PC & 0xF00) | (opcode & 0xFF); } } this._PCHTMP = -1; this._nSF = 0; return MCLOCK_DIV1; }
}
