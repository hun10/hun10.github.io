
/*
 BK machine base.
 
 Also display routes.
 Fake tape is .bin file loader only.
*/

import CPUTimer from './CPUTimer.js'
import Keyboard from './Keyboard.js'
import SystemRegs from './SystemRegs.js'
import K1801VM1 from './cpu_K1801VM1.js'
import { monit10_data, basic10_data, focal10_data, mstd } from './SYSROMS.js'

const QBusReadDTO = function (v) {
  /*short*/this.value = v;

  return this;
}

export default function () {
  var self = this;

  const cpu = new K1801VM1(self)
  this.cpu = cpu

  var /*short[106496]*/memory = new Uint16Array(106496);

  var /*int[8]*/mmap = [];
  var /*boolean[8]*/mmap_readable = [];
  var /*boolean[8]*/mmap_writeable = [];
  var /*int*/rom160length = 0;

  var /*short*/syswritereg = 0;
  var /*short*/iowritereg = 0;
  this.ioreadreg = 0;

  var /*short*/scrollReg = 0o1000;

  var /*CPUTimer*/ timer = new CPUTimer(cpu);
  var /*Keyboard*/ keyboard = new Keyboard();
  this.keyboard = keyboard
  var /*SystemRegs*/ sregs = new SystemRegs();
  var plugins = [];

  var /*QBusReadDTO*/ readDTO = new QBusReadDTO(-1);

  this.accMemory = memory
  this.accMmap = {
    mmap_readable,
    mmap_writeable
  }
  this.accTimer = timer

  this.remap = false;

  this.minimizeCycles = function () {
    timer.updateTimer();

    var n = Math.floor(cpu.Cycles / 3e6) * 3e6;
    cpu.Cycles -= n;
    timer.cycles -= n;
  }

  function loadtomem(addr, romarr, skip) {
    var a = addr, n = romarr.length + skip, i = 0;
    while (i < n) memory[a++] = /*(short)*/romarr[i++];
  }

  // Address for Basic,Focal,MSTD ROM 
  function load120000(a) {
    loadtomem(69632, a, 0);
  }

  function load160000(a) {
    loadtomem(65536 + 4096 * 3, a, -64);
  }

  function init() {
    plugins.push(timer);
    plugins.push(keyboard);
    plugins.push(sregs);
  }

  function memLoads0() {
    if (!self.remap) {

      var i;
      for (i = 0; i < 8; i++) {
        mmap_writeable[i] = (i < 4);
        mmap_readable[i] = true;
        mmap[i] = (i > 3 ? 65536 : 0) + (4096 * (i % 4));
      }

      var val = 0, flag = 256;
      for (i = 0; i < 16384; i++, flag--) {
        memory[i] = val
        val = 0xFFFF - val;

        if (flag == 192) {
          val = 0xFFFF - val;
          flag = 256;
        }
      }

      /*
        loading ROM files in mapped memory by pages
      */
      loadtomem(65536, monit10_data, 0);	//8KB addr h8000 @#100000
      loadtomem(69632, basic10_data, -64);	//24KB addr hA000 @#120000
    }
  }

  this.updinternals = function ()	// update internal values
  {
    for (var i = 0, a = 0; i < 0x8000; i++, a += 2) {
      this.readWord(a, readDTO);
      this.writeWord(a, readDTO.value);
    }
  }

  /*void*/this.setBase10Model = function () {
    // memLoads0();
    var m = mmap, r = mmap_readable, w = mmap_writeable;
    m[2] = 8192; m[3] = 12288; m[4] = 65536;
    r[4] = true; r[5] = false; r[6] = false; r[7] = false;
    w[4] = false; w[5] = false; w[6] = false; w[7] = false;
    rom160length = 8064;
  }

  function set10Model() {
    // memLoads0();
    var m = mmap, r = mmap_readable, w = mmap_writeable;
    m[2] = 8192; m[3] = 12288; m[4] = 65536;
    m[5] = 69632; m[6] = 73728; m[7] = 77824;
    r[4] = true; r[5] = true; r[6] = true; r[7] = true;
    w[4] = false; w[5] = false; w[6] = false; w[7] = false;
    rom160length = 8064;
  }

  /*void*/this.setBASIC10Model = function () {
    set10Model();
    loadtomem(65536, monit10_data, 0);	//8KB addr h8000 @#100000
    loadtomem(69632, basic10_data, -64);	//24KB addr hA000 @#120000
  }

  /*void*/this.setFOCAL10Model = function () {
    set10Model();
    load120000(focal10_data);
    load160000(mstd)
    mmap_readable[6] = false;
  }

  /*void*/this.setDebugModel = function () {
    set10Model();
    load160000(mstd)
    mmap_readable[5] = false;
    mmap_readable[6] = false;
  }

  this.startRealTapeRecord = function (record) {
    this.realTapeState = {
      time: 0,
      pwmSum: 0,
      pwmIterator: 0,
      pwmData: record
    }
  }

  this.moveRealTape = function (dCycle) {
    if (this.realTapeState === undefined) {
      return false
    }

    // if (!!(syswritereg & 0x40)) {
    //   syswritereg -= 0x40
    // }

    const realTapeState = this.realTapeState
    const samplePos = realTapeState.time

    if (realTapeState.pwmData !== undefined) {
      if (realTapeState.pwmIterator >= realTapeState.pwmData.length) {
        this.realTapeState = undefined
        return false
      }
      while (realTapeState.pwmSum + Math.abs(realTapeState.pwmData[realTapeState.pwmIterator]) < samplePos) {
        realTapeState.pwmSum += Math.abs(realTapeState.pwmData[realTapeState.pwmIterator])
        realTapeState.pwmIterator++
      }
      if (realTapeState.pwmData[realTapeState.pwmIterator] > 0) {
        // syswritereg |= 0x40
        realTapeState.input = true
      } else {
        realTapeState.input = false
      }
    }

    realTapeState.time += dCycle
    return true
  }

  /*boolean*/this.readWord = function (/*int*/addr, /*QBusReadDTO*/ result) {
    var /*int*/ia = addr & 65535;
    var /*int*/page = ia >>> 13;
    var /*int*/mapped = mmap[page] + ((ia & 0x1FFF) >>> 1);

    if (page < 7) {
      if (mmap_readable[page] != 0) {
        result.value = memory[mapped] & 0xFFFF >>> 0;
        return true;
      }

      return false;	//readWord(addr, result);
    }

    for (var /*QBusSlave*/ pli in plugins) {
      var plugin = plugins[pli];
      var base = plugin.getBaseAddress();
      if (base <= ia) {
        if ((ia - base) / 2 < plugin.getNumWords())
          return plugin.readWord(addr, result);
      }
    }

    if (mmap_readable[7] && (ia < 57344 + rom160length)) {
      result.value = memory[mapped] & 0xFFFF >>> 0;
      return true;
    }

    var C = (ia & 0xFFFE) >>> 0; /*short*/

    if (C == 65484) {
      result.value = this.ioreadreg
      return true;
    }

    if (C == 65486) {
      var /*int*/tape = 0;
      if (this.realTapeState && this.realTapeState.input) {
        tape = 0x20
      }

      result.value = /*(short)*/tape | (keyboard.getKeyDown() ? 0 : 64)
        | 32912;
      return true;
    }

    if (C == 65460) {
      result.value = scrollReg;
      return true;
    }

    return false;
  }

  this.getScrollReg = function () {
    return scrollReg
  }
  this.setScrollReg = function (v) {
    scrollReg = v
  }
  this.getSoundReg = function () {
    return !!(syswritereg & 0x40)
  }
  this.getMotorReg = function () {
    return !(syswritereg & 0x80)
  }
  /*boolean*/this.writeByteAsWord = function (/*int*/addr, /*short*/data) {
    var /*int*/ia = addr & 65535;
    var /*int*/page = ia >>> 13;
    var /*int*/mapped = mmap[page] + ((ia & 0x1FFF) >>> 1);

    var Wo = ((ia & 1) == 0) ?
      ((memory[mapped] & 0xFF00) | (data & 0xFF)) :
      ((memory[mapped] & 0xFF) | (data & 0xFF00));

    if (page < 7) {
      if (mmap_writeable[page] != 0) {
        memory[mapped] = Wo;
        return true;
      }
      return false;	//super.writeWord(addr, data);
    }

    var C = (ia & 0xFFFE) >>> 0; /*short*/

    for (var /*QBusSlave*/ pli in plugins) {
      var plugin = plugins[pli];
      var base = plugin.getBaseAddress();
      if (base <= ia) {
        if ((ia - base) / 2 < plugin.getNumWords()) {
          return plugin.writeByteAsWord(addr, data);
        }
      }
    }

    if ((mmap_writeable[7] != 0) && (ia < 57344 + rom160length)) {
      memory[mapped] = Wo;
      return true;
    }

    if (C == 65484) {
      if ((ia & 1) == 0) {
        iowritereg = /*(short)*/((iowritereg & 0xFF00) | (data & 0xFF));
      } else {
        iowritereg = /*(short)*/((iowritereg & 0xFF) | (data & 0xFF00));
      }
      return true;
    }

    if (ia == 65486) {
      syswritereg = /*(short)*/((syswritereg & 0xFF00) | (data & 0xFF));
      return true;
    }
    if (ia == 65487) {
      syswritereg = /*(short)*/((syswritereg & 0xFF) | (data & 0xFF00));
      return true;
    }

    if (C == 65460) {
      scrollReg = /*(short)*/((scrollReg & 0xFF00) | (data & 0xFF));
      return true;
    }
    return false; //super.writeByteAsWord(addr, data);
  }

  /*boolean*/this.writeByte = function (/*int*/addr, /*byte*/data) {
    var b = data & 0xFF >>> 0;
    return this.writeByteAsWord(addr,
	/*(short)*/(addr & 1) ? ((b << 8) | 0xFF) : (b | 0xFF00));
  }


  /*boolean*/this.readByte = function (/*int*/addr, /*QBusReadDTO*/ result) {
    var /*boolean*/a = this.readWord(addr, result);

    if (addr & 1) {
      result.value = /*(short)*/(result.value >>> 8);
    }
    result.value = /*(short)*/(result.value & 0xFF);
    return a;
  }

  /*boolean*/this.writeWord = function (/*int*/addr, /*short*/data) {
    var /*int*/ia = addr &= 65535;
    var /*int*/page = ia >>> 13;
    var /*int*/mapped = mmap[page] + ((ia & 0x1FFF) >>> 1);
    var d = data & 0xFFFF >>> 0;

    if (page < 7) {
      if (mmap_writeable[page] != 0) {
        memory[mapped] = d;
        return true;
      }
      return false; //super.writeWord(addr, data);
    }

    var C = (ia & 0xFFFE) >>> 0; /*short*/

    for (var /*QBusSlave*/ pli in plugins) {
      var plugin = plugins[pli];
      var base = plugin.getBaseAddress();
      if (base <= ia) {
        if ((ia - base) / 2 < plugin.getNumWords()) {
          return plugin.writeWord(addr, d);
        }
      }
    }

    if ((mmap_writeable[7] != 0) && (ia < 57344 + rom160length)) {
      memory[mapped] = d;
      return true;
    }

    if (C == 65484) {
      iowritereg = d;
      return true;
    }

    if (C == 65486) {
      syswritereg = d;
      return true;
    }

    if (C == 65460) {
      scrollReg = /*(short)*/(d & 0x2FF);
      return true;
    }

    return false; //super.writeWord(addr, data);
  }

  this.lastPrinted = 0
  this.movePrinterHead = function () {
    if (this.printerString === undefined) return;

    const nowPrinted = performance.now()

    if (nowPrinted - this.lastPrinted > 1000 && this.lastPrintedText !== this.printerString) {
      this.lastPrinted = nowPrinted
      this.lastPrintedText = this.printerString
      postMessage({ printerPaper: this.printerString })
    }

    const selfReady = !!(this.ioreadreg & 256)
    const pcReady = !!(iowritereg & 256)

    if (selfReady && pcReady) {
      this.ioreadreg |= 256
      this.ioreadreg -= 256
      this.printerString += String.fromCharCode(iowritereg & 255)
    } else if (!selfReady && !pcReady) {
      this.ioreadreg |= 256
    }
  }

  this.togglePrinter = function (enable) {
    if (enable) {
      this.printerString = ''
      this.lastPrintedText = ''
      this.ioreadreg |= 256
    } else {
      this.printerString = undefined
      this.lastPrintedText = undefined
      this.ioreadreg |= 256
      this.ioreadreg -= 256
    }
  }

 /*int*/this.getBaseAddress = function () {
    return 0;
  }

  /*int*/this.getNumWords = function () {
    return 0;
  }


  /*boolean*/this.gotInterrupt = function () {
    for (var /*QBusSlave*/ pli in plugins) {
      var plugin = plugins[pli];
      if (plugin.gotInterrupt()) return true;
    }
    return false;
  }

  /*byte*/this.interruptVector = function () {
    for (var /*QBusSlave*/ pli in plugins) {
      var plugin = plugins[pli];
      if (plugin.gotInterrupt()) return plugin.interruptVector();
    }
    return -1;
  }

  /*void*/this.reset = function () {
    for (var /*QBusSlave*/ pli in plugins) {
      var plugin = plugins[pli];
      plugin.reset();
    }
  }

  /*
  Can load BASIC,FOCAL,
  
  */

  this.loadROM = function (name, data) {
    var i, j = 0, a = new Uint16Array(data.length / 2);
    for (i in a) a[i] = data[j++] + (data[j++] << 8);
    set10Model();
    load120000(a);
    return;
  }

  init();

  memLoads0();

  self.setBASIC10Model();

  return this;
}
