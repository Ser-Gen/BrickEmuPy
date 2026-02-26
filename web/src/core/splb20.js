import { ROM } from './rom.js';

import { SPLB20Sound } from './splb20Sound.js';

const SUB_CLOCK = 32768;
const MCLOCK_DIV = 1;

const ADDRESS_SPACE_SIZE = 0x10000;

const SFR_OFFSET = 0x40;
const SFR_SIZE = 0x40;
const CPU_RAM_OFFSET = 0x80;
const CPURAM_SIZE = 0x80;
const DATARAM_OFFSET = 0x1000;
const DATARAM_SIZE = 0x800;
const LCDRAM_OFFSET = 0x00;
const LCDRAM_SIZE = 0x40;

const VADDR_NMI = 0xfffa;
const VADDR_RESET = 0xfffc;
const VADDR_IRQ = 0xfffe;

const IO_INT_CFG_T2HZ_INT = 0x01;
const IO_INT_CFG_T128HZ_INT = 0x02;
const IO_INT_CFG_NORMALKEY_INT = 0x08;
const IO_INT_CFG_COUNTER_INT = 0x10;
const IO_INT_CFG_NMI_ENBL = 0x80;

const IO_SYS_CTRL_LCD_ENBL = 0x04;
const IO_SYS_CTRL_TIMER_ENBL = 0x10;
const IO_SYS_CTRL_32K_ENBL = 0x20;
const IO_SYS_CTRL_CPU_STOP = 0x40;
const IO_SYS_CTRL_ROSC_STOP = 0x80;

export class SPLB20 {
  constructor(mask, clock, toneGenerator, romBytes) {
    this._ROM = new ROM(romBytes);
    this._sound = new SPLB20Sound(clock, toneGenerator);

    this._romOffset = ADDRESS_SPACE_SIZE - this._ROM.size();

    this._cycleCounter = 0;

    this._pullupExt = {
      PA: 0,
      ...(mask.port_pullup || {}),
    };

    this._portInput = {
      PA: [0, 0],
    };

    this._instrCounter = 0;
    this._timerCounter = 0;
    this._t2HzCounter = 0;
    this._t128HzCounter = 0;

    this._nonCrystalMode = mask.non_crystal_mode;
    this._subClockDiv = clock / SUB_CLOCK;

    if (!this._nonCrystalMode) {
      this._sound.setClockDiv(this._subClockDiv, this._cycleCounter);
    }

    this._execute = new Array(256).fill(null).map(() => [this._dummy.bind(this), 1]);
    this._buildExecuteTable();

    this.reset();
  }

  _buildExecuteTable() {
    const op = (code, fn, bytes) => { this._execute[code] = [fn.bind(this), bytes]; };

    op(0x05, this._ora_zp, 2);
    op(0x09, this._ora_imm, 2);
    op(0x10, this._bpl, 2);
    op(0x18, this._clc, 1);
    op(0x20, this._jsr_abs, 3);
    op(0x25, this._and_zp, 2);
    op(0x26, this._rol_zp, 2);
    op(0x29, this._and_imm, 2);
    op(0x2a, this._rol_a, 1);
    op(0x30, this._bmi, 2);
    op(0x38, this._sec, 1);
    op(0x40, this._rti, 1);
    op(0x48, this._pha, 1);
    op(0x49, this._eor_imm, 2);
    op(0x4c, this._jmp_abs, 3);
    op(0x60, this._rts, 1);
    op(0x65, this._adc_zp, 2);
    op(0x68, this._pla, 1);
    op(0x69, this._adc_imm, 2);
    op(0x6a, this._ror_a, 1);
    op(0x78, this._sei, 1);
    op(0x81, this._sta_ind_x, 2);
    op(0x85, this._sta_zp, 2);
    op(0x86, this._stx_zp, 2);
    op(0x8a, this._txa, 1);
    op(0x90, this._bcc, 2);
    op(0x95, this._sta_zp_x, 2);
    op(0x9a, this._txs, 1);
    op(0xa1, this._lda_ind_x, 2);
    op(0xa2, this._ldx_imm, 2);
    op(0xa5, this._lda_zp, 2);
    op(0xa6, this._ldx_zp, 2);
    op(0xa9, this._lda_imm, 2);
    op(0xaa, this._tax, 1);
    op(0xb0, this._bcs, 2);
    op(0xbd, this._lda_abs_x, 3);
    op(0xc5, this._cmp_zp, 2);
    op(0xc6, this._dec_zp, 2);
    op(0xc9, this._cmp_imm, 2);
    op(0xca, this._dex, 1);
    op(0xd0, this._bne, 2);
    op(0xe0, this._cpx_imm, 2);
    op(0xe4, this._cpx_zp, 2);
    op(0xe5, this._sbc_zp, 2);
    op(0xe6, this._inc_zp, 2);
    op(0xe8, this._inx, 1);
    op(0xe9, this._sbc_imm, 2);
    op(0xea, this._nop, 1);
    op(0xf0, this._beq, 2);
  }

  reset() {
    this._t2HzCounter = 0;
    this._t128HzCounter = 0;

    this._PC = 0;
    this._SP = 0;

    this._A = 0;
    this._X = 0;
    this._Y = 0;

    this._setPS(0x04);

    this._ROSC_ENBL = 1;
    this._CPU_ENBL = 1;
    this._32K_ENBL = 1;

    this._RAM = new Array(CPURAM_SIZE).fill(0);
    this._DATA_RAM = new Array(DATARAM_SIZE).fill(0);
    this._LCDRAM = new Array(LCDRAM_SIZE).fill(0);

    this._PCFG = { PA: 0 };
    this._PDIR = { PA: 0 };
    this._PULLUP = { PA: 0 };
    this._PLATCH = { PA: 0 };

    this._LCD_CFG = 0;
    this._LCD_BIAS = 0;
    this._SYS_CTRL = 0;
    this._INT_CFG = 0;
    this._IREQ = 0;

    this._TC = 0;
    this._TC_PRESET = 0;
    this._PRESCALAR = 0;
    this._KEYSCAN_CTRL = 0;

    this._sound.setEnable(false, 0);
    this._goVector(VADDR_RESET);
  }

  _goVector(addr) {
    this._PC = this._ROM.getWordLSB(addr);
  }

  pc() {
    return this._PC;
  }

  getVRAM() {
    if (this._SYS_CTRL & IO_SYS_CTRL_LCD_ENBL) {
      return Uint8Array.from(this._LCDRAM);
    }
    return new Uint8Array();
  }

  istr_counter() {
    return this._instrCounter;
  }

  pin_set(port, pin, level) {
    this._processPortInput(port, pin, level);
  }

  pin_release(port, pin) {
    this._processPortInput(port, pin, -1);
  }

  _portRead(port) {
    return (
      (~this._PDIR[port] & this._PLATCH[port]) |
      (this._PDIR[port] & (~this._portInput[port][0] & (this._portInput[port][1] | this._PULLUP[port] | this._pullupExt[port])))
    );
  }

  _processPortInput(port, pin, level) {
    if (port === 'RES') {
      if (level === 0) {
        this.reset();
      }
      return;
    }

    const prevPort = this._portRead(port);
    this._portInput[port][0] &= ~pin;
    this._portInput[port][1] &= ~pin;
    if (level >= 0) {
      this._portInput[port][level] |= pin;
    }
    if (prevPort !== this._portRead(port)) {
      if (port === 'PA' && level === 0) {
        if (this._INT_CFG & IO_INT_CFG_NORMALKEY_INT) {
          this._IREQ |= IO_INT_CFG_NORMALKEY_INT;
          this._NMI();
        }
      }
    }
  }

  _IRQ() {
    this._writeMem(this._SP, this._PC >> 8);
    this._SP = (this._SP - 1) & 0xff;
    this._writeMem(this._SP, this._PC & 0xff);
    this._SP = (this._SP - 1) & 0xff;
    this._writeMem(this._SP, this._ps());
    this._SP = (this._SP - 1) & 0xff;
    this._IF = 1;
    this._goVector(VADDR_IRQ);
  }

  _NMI() {
    if (!(this._INT_CFG & IO_INT_CFG_NMI_ENBL)) {
      return;
    }
    if (this._ROSC_ENBL && this._CPU_ENBL) {
      this._writeMem(this._SP, this._PC >> 8);
      this._SP = (this._SP - 1) & 0xff;
      this._writeMem(this._SP, this._PC & 0xff);
      this._SP = (this._SP - 1) & 0xff;
      this._writeMem(this._SP, this._ps());
      this._SP = (this._SP - 1) & 0xff;
      this._goVector(VADDR_NMI);
    } else {
      this._CPU_ENBL = 1;
      this._ROSC_ENBL = 1;
      this._goVector(VADDR_RESET);
    }
  }

  _timersClock(execCycles) {
    if (this._SYS_CTRL & IO_SYS_CTRL_TIMER_ENBL) {
      this._timerCounter -= execCycles;
      while (this._timerCounter <= 0) {
        if (this._nonCrystalMode) {
          this._timerCounter += (1 << this._PRESCALAR);
        } else {
          this._timerCounter += this._subClockDiv;
        }
        this._TC -= 1;
        if (this._TC === 0) {
          this._TC = this._TC_PRESET;
          if (this._INT_CFG & IO_INT_CFG_COUNTER_INT) {
            this._IREQ |= IO_INT_CFG_COUNTER_INT;
            this._NMI();
          }
        }
      }
    }

    this._t2HzCounter -= execCycles;
    while (this._t2HzCounter <= 0) {
      if (this._nonCrystalMode) {
        this._t2HzCounter += (1 << this._PRESCALAR) * (SUB_CLOCK / 2);
      } else {
        this._t2HzCounter += this._subClockDiv * (SUB_CLOCK / 2);
      }
      if (this._INT_CFG & IO_INT_CFG_T2HZ_INT) {
        this._IREQ |= IO_INT_CFG_T2HZ_INT;
        this._NMI();
      }
    }

    this._t128HzCounter -= execCycles;
    while (this._t128HzCounter <= 0) {
      if (this._nonCrystalMode) {
        this._t128HzCounter += (1 << this._PRESCALAR) * (SUB_CLOCK / 128);
      } else {
        this._t128HzCounter += this._subClockDiv * (SUB_CLOCK / 128);
      }
      if (this._INT_CFG & IO_INT_CFG_T128HZ_INT) {
        this._IREQ |= IO_INT_CFG_T128HZ_INT;
        this._NMI();
      }
    }
  }

  clock() {
    let execCycles = MCLOCK_DIV;
    if (this._ROSC_ENBL) {
      if (this._CPU_ENBL) {
        const byte = this._ROM.getByte(this._PC - this._romOffset);
        const [fn, bytesCount] = this._execute[byte];
        const opcode = this._ROM.getBytes(this._PC - this._romOffset, bytesCount);
        this._PC = (this._PC + bytesCount) & 0xffff;
        execCycles = fn(opcode);
        this._instrCounter += 1;
      }
      this._timersClock(execCycles);
    } else if (this._SYS_CTRL & IO_SYS_CTRL_32K_ENBL) {
      execCycles = this._subClockDiv;
      this._timersClock(execCycles);
    }

    this._cycleCounter += execCycles;
    return execCycles;
  }

  _writeMem(addr, value) {
    value &= 0xff;
    if (addr >= LCDRAM_OFFSET && addr < LCDRAM_SIZE + LCDRAM_OFFSET) {
      this._LCDRAM[addr - LCDRAM_OFFSET] = value;
      return;
    }
    if (addr >= CPU_RAM_OFFSET && addr < CPURAM_SIZE + CPU_RAM_OFFSET) {
      this._RAM[addr - CPU_RAM_OFFSET] = value;
      return;
    }
    if (addr >= DATARAM_OFFSET && addr < DATARAM_SIZE + DATARAM_OFFSET) {
      this._DATA_RAM[addr - DATARAM_OFFSET] = value;
      return;
    }

    switch (addr) {
      case 0x70: this._LCD_CFG = value; break;
      case 0x71: this._PDIR.PA = value; break;
      case 0x72:
        this._PCFG.PA = value;
        this._sound.setEnable((value & 0xc0) === 0xc0, this._cycleCounter);
        break;
      case 0x73: this._PLATCH.PA = value; break;
      case 0x76: this._LCD_BIAS = value; break;
      case 0x79: this._INT_CFG = value; break;
      case 0x7a: {
        this._ROSC_ENBL = ((this._SYS_CTRL | (~value & 0xff)) & IO_SYS_CTRL_ROSC_STOP) > 0;
        this._CPU_ENBL = ((this._SYS_CTRL | (~value & 0xff)) & IO_SYS_CTRL_CPU_STOP) > 0;
        this._SYS_CTRL = value;
        if ((!this._ROSC_ENBL && this._nonCrystalMode) || !(value & IO_SYS_CTRL_TIMER_ENBL)) {
          this._sound.setEnable(false, this._cycleCounter);
        } else {
          this._sound.setEnable((this._PCFG.PA & 0xc0) === 0xc0, this._cycleCounter);
        }
        break;
      }
      case 0x7b:
        this._TC_PRESET = value;
        this._sound.setTcDiv(value, this._cycleCounter);
        break;
      case 0x7c:
        this._PRESCALAR = value;
        if (this._nonCrystalMode) {
          this._sound.setClockDiv(1 << value, this._cycleCounter);
        }
        break;
      case 0x7e: this._KEYSCAN_CTRL = value; break;
      default: break;
    }
  }

  _readMem(addr) {
    if (addr >= LCDRAM_OFFSET && addr < LCDRAM_SIZE + LCDRAM_OFFSET) {
      return this._LCDRAM[addr - LCDRAM_OFFSET];
    }
    if (addr >= CPU_RAM_OFFSET && addr < CPURAM_SIZE + CPU_RAM_OFFSET) {
      return this._RAM[addr - CPU_RAM_OFFSET];
    }
    if (addr >= DATARAM_OFFSET && addr < DATARAM_SIZE + DATARAM_OFFSET) {
      return this._DATA_RAM[addr - DATARAM_OFFSET];
    }
    if (addr >= SFR_OFFSET && addr < SFR_SIZE + SFR_OFFSET) {
      switch (addr) {
        case 0x70: return this._LCD_CFG;
        case 0x71: return this._PDIR.PA;
        case 0x72: return this._PCFG.PA;
        case 0x73: return this._portRead('PA');
        case 0x76: return this._LCD_BIAS;
        case 0x79: {
          const buf = this._IREQ | (this._INT_CFG & 0x80);
          this._IREQ = 0;
          return buf;
        }
        case 0x7a: return this._SYS_CTRL;
        case 0x7b: return this._TC_PRESET;
        case 0x7c: return this._PRESCALAR;
        case 0x7e: return this._KEYSCAN_CTRL;
        default: return 0;
      }
    }
    if (addr >= this._romOffset) {
      return this._ROM.getByte(addr - this._romOffset);
    }
    return 0;
  }

  _ps() {
    return (
      (this._NF << 7) |
      (this._VF << 6) |
      (this._BF << 4) |
      (this._DF << 3) |
      (this._IF << 2) |
      (this._ZF << 1) |
      this._CF
    );
  }

  _setPS(ps) {
    this._NF = ps >> 7;
    this._VF = (ps & 0x40) > 0;
    this._BF = (ps & 0x10) > 0;
    this._DF = (ps & 0x08) > 0;
    this._IF = (ps & 0x04) > 0;
    this._ZF = (ps & 0x02) > 0;
    this._CF = ps & 0x01;
  }

  _dummy() {
    return 2;
  }

  _adc(operand) {
    const A = this._A;
    let newValue = A + operand + this._CF;

    if (this._DF && ((A & 0x0f) + (operand & 0x0f) + this._CF > 9)) {
      newValue += 6;
    }

    this._VF = (~(A ^ operand) & (A ^ newValue)) >> 7;
    this._NF = (newValue >> 7) & 0x1;

    if (this._DF && newValue > 0x99) {
      newValue += 0x60;
    }

    this._ZF = !(newValue & 0xff);
    this._CF = newValue > 0xff;
    this._A = newValue & 0xff;
  }

  _sbc(operand) {
    const A = this._A;
    let newValue = A - operand - (!this._CF);

    if (this._DF) {
      if ((A & 0x0f) - (operand & 0x0f) - (!this._CF) < 0) {
        newValue -= 6;
      }
      if (newValue < 0) {
        newValue -= 0x60;
      }
    }

    this._VF = ((A ^ operand) & (A ^ newValue)) >> 7;
    this._NF = (newValue >> 7) & 0x1;
    this._ZF = !(newValue & 0xff);
    this._CF = newValue >= 0;
    this._A = newValue & 0xff;
  }

  _zp(opcode) { return opcode & 0xff; }
  _imm(opcode) { return opcode & 0xff; }
  _abs(opcode) { return ((opcode >> 8) & 0xff) | ((opcode & 0xff) << 8); }
  _zpX(opcode) { return ((opcode & 0xff) + this._X) & 0xff; }
  _indX(opcode) {
    const i = ((opcode & 0xff) + this._X) & 0xff;
    return this._readMem(i) | (this._readMem((i + 1) & 0xff) << 8);
  }

  _branch(opcode, cond) {
    if (cond) {
      const prevPC = this._PC;
      this._PC = (this._PC + (opcode & 0xff) - ((opcode & 0x80) << 1)) & 0xffff;
      return 3 + ((this._PC ^ prevPC) > 255 ? 1 : 0);
    }
    return 2;
  }

  _ora_zp(opcode) { this._A |= this._readMem(this._zp(opcode)); this._NF = this._A >> 7; this._ZF = !this._A; return 3; }
  _ora_imm(opcode) { this._A |= this._imm(opcode); this._NF = this._A >> 7; this._ZF = !this._A; return 2; }
  _and_zp(opcode) { this._A &= this._readMem(this._zp(opcode)); this._NF = this._A >> 7; this._ZF = !this._A; return 3; }
  _and_imm(opcode) { this._A &= this._imm(opcode); this._NF = this._A >> 7; this._ZF = !this._A; return 2; }
  _eor_imm(opcode) { this._A ^= this._imm(opcode); this._NF = this._A >> 7; this._ZF = !this._A; return 2; }

  _rol_zp(opcode) {
    const addr = this._zp(opcode);
    const newValue = (this._readMem(addr) << 1) | this._CF;
    this._writeMem(addr, newValue & 0xff);
    this._NF = (newValue & 0x80) > 0;
    this._ZF = !(newValue & 0xff);
    this._CF = newValue > 0xff;
    return 5;
  }

  _rol_a() {
    const newValue = (this._A << 1) | this._CF;
    this._A = newValue & 0xff;
    this._NF = (newValue & 0x80) > 0;
    this._ZF = !(newValue & 0xff);
    this._CF = newValue > 0xff;
    return 2;
  }

  _ror_a() {
    const newValue = (this._A >> 1) | (this._CF << 7);
    const prevValue = this._A;
    this._A = newValue & 0xff;
    this._NF = this._CF;
    this._ZF = !newValue;
    this._CF = prevValue & 0x1;
    return 2;
  }

  _adc_zp(opcode) { this._adc(this._readMem(this._zp(opcode))); return 3; }
  _adc_imm(opcode) { this._adc(this._imm(opcode)); return 2; }
  _sbc_zp(opcode) { this._sbc(this._readMem(this._zp(opcode))); return 3; }
  _sbc_imm(opcode) { this._sbc(this._imm(opcode)); return 2; }

  _jsr_abs(opcode) {
    const pc = (this._PC - 1) & 0xffff;
    this._writeMem(this._SP, (pc >> 8) & 0xff);
    this._SP = (this._SP - 1) & 0xff;
    this._writeMem(this._SP, pc & 0xff);
    this._SP = (this._SP - 1) & 0xff;
    this._PC = this._abs(opcode);
    return 6;
  }

  _rts() {
    this._SP = (this._SP + 1) & 0xff;
    this._PC = this._readMem(this._SP);
    this._SP = (this._SP + 1) & 0xff;
    this._PC |= this._readMem(this._SP) << 8;
    this._PC = (this._PC + 1) & 0xffff;
    return 6;
  }

  _rti() {
    this._SP = (this._SP + 1) & 0xff;
    this._setPS(this._readMem(this._SP));
    this._SP = (this._SP + 1) & 0xff;
    this._PC = this._readMem(this._SP);
    this._SP = (this._SP + 1) & 0xff;
    this._PC |= this._readMem(this._SP) << 8;
    return 6;
  }

  _jmp_abs(opcode) { this._PC = this._abs(opcode); return 3; }

  _pha() { this._writeMem(this._SP, this._A); this._SP = (this._SP - 1) & 0xff; return 3; }
  _pla() { this._SP = (this._SP + 1) & 0xff; this._A = this._readMem(this._SP); this._NF = this._A >> 7; this._ZF = !this._A; return 4; }

  _sei() { this._IF = 1; return 2; }
  _clc() { this._CF = 0; return 2; }
  _sec() { this._CF = 1; return 2; }
  _nop() { return 2; }

  _sta_ind_x(opcode) { this._writeMem(this._indX(opcode), this._A); return 6; }
  _sta_zp(opcode) { this._writeMem(this._zp(opcode), this._A); return 3; }
  _sta_zp_x(opcode) { this._writeMem(this._zpX(opcode), this._A); return 4; }
  _stx_zp(opcode) { this._writeMem(this._zp(opcode), this._X); return 3; }

  _lda_ind_x(opcode) { this._A = this._readMem(this._indX(opcode)); this._NF = this._A >> 7; this._ZF = !this._A; return 6; }
  _lda_zp(opcode) { this._A = this._readMem(this._zp(opcode)); this._NF = this._A >> 7; this._ZF = !this._A; return 3; }
  _lda_imm(opcode) { this._A = this._imm(opcode); this._NF = this._A >> 7; this._ZF = !this._A; return 2; }
  _lda_abs_x(opcode) {
    const addr = (this._abs(opcode) + this._X) & 0xffff;
    this._A = this._readMem(addr);
    this._NF = this._A >> 7;
    this._ZF = !this._A;
    return 4 + ((this._PC ^ addr) > 255 ? 1 : 0);
  }

  _ldx_imm(opcode) { this._X = this._imm(opcode); this._NF = this._X >> 7; this._ZF = !this._X; return 2; }
  _ldx_zp(opcode) { this._X = this._readMem(this._zp(opcode)); this._NF = this._X >> 7; this._ZF = !this._X; return 3; }

  _tax() { this._X = this._A; this._NF = this._X >> 7; this._ZF = !this._X; return 2; }
  _txa() { this._A = this._X; this._NF = this._A >> 7; this._ZF = !this._A; return 2; }
  _txs() { this._SP = this._X; return 2; }

  _cmp(v) {
    const newValue = this._A - v;
    this._NF = (newValue >> 7) & 0x1;
    this._ZF = !(newValue & 0xff);
    this._CF = newValue >= 0;
  }

  _cpx(v) {
    const newValue = this._X - v;
    this._NF = (newValue >> 7) & 0x1;
    this._ZF = !(newValue & 0xff);
    this._CF = newValue >= 0;
  }

  _cmp_zp(opcode) { this._cmp(this._readMem(this._zp(opcode))); return 3; }
  _cmp_imm(opcode) { this._cmp(this._imm(opcode)); return 2; }
  _cpx_imm(opcode) { this._cpx(this._imm(opcode)); return 2; }
  _cpx_zp(opcode) { this._cpx(this._readMem(this._zp(opcode))); return 3; }

  _dec_zp(opcode) {
    const addr = this._zp(opcode);
    const newValue = (this._readMem(addr) - 1) & 0xff;
    this._writeMem(addr, newValue);
    this._NF = newValue >> 7;
    this._ZF = !newValue;
    return 5;
  }

  _inc_zp(opcode) {
    const addr = this._zp(opcode);
    const newValue = (this._readMem(addr) + 1) & 0xff;
    this._writeMem(addr, newValue);
    this._NF = newValue >> 7;
    this._ZF = !newValue;
    return 5;
  }

  _dex() { this._X = (this._X - 1) & 0xff; this._NF = this._X >> 7; this._ZF = !this._X; return 2; }
  _inx() { this._X = (this._X + 1) & 0xff; this._NF = this._X >> 7; this._ZF = !this._X; return 2; }

  _bpl(opcode) { return this._branch(opcode, !this._NF); }
  _bmi(opcode) { return this._branch(opcode, !!this._NF); }
  _bcc(opcode) { return this._branch(opcode, !this._CF); }
  _bcs(opcode) { return this._branch(opcode, !!this._CF); }
  _bne(opcode) { return this._branch(opcode, !this._ZF); }
  _beq(opcode) { return this._branch(opcode, !!this._ZF); }
}
