const QBusReadDTO = function(v)
{
  /*short*/this.value = v;
  
  return this;
}

export default function(base)
{
  var self = this;
  
  /*Regs*/
  var /*short[]*/r = [0,0,0,0,0,0,0/*SP*/,0/*PC*/];
  /*Flags*/
  var /*short*/psw = 224;
  
  var flagLst = "CVZNT-I-";
  var /*boolean*/trace = false;
  var /*int[]*/opdec = [];
  var CPUState = { BOGUS:0, NORMAL:1, INT:2, RTT:3, WAIT:4 };  
  var /*CPUState*/ state = CPUState.NORMAL;
  var /*boolean*/gotIrq = false;
  var /*short*/intvector = 0;
  var /*QBusReadDTO*/ readDTO = new QBusReadDTO(-1);
  /*long*/self.Cycles = 0;
  var /*int[]*/eaMemCycles = [ 0, 12, 12, 20, 12, 20, 20, 28 ];
  
  this.regs = r;
  
  function gen_opcodes()
  {
    var a = 61440; //MASK_2OP
    var b = 65024; //MASK_2OPR
    var c = 65472; //MASK_1OP
    var d = 65280; //MASK_BRANCH
    var e = 65520; //MASK_COND
    var f = 65528; //MASK_1OPR
    var g = 65535; //MASK_ALL
  
    Op(0,0,1); Op(0,g,3); Op(1,g,4); Op(2,g,5);Op(3,g,6); Op(4,g,7);
    Op(5,g,8); Op(6,g,9); Op(64,c,12); Op(128,f,13); Op(160,e,15);
    Op(176,e,14); Op(192,c,16); Op(256,d,17); Op(512,d,18); Op(768,d,19);
    Op(1024,d,20); Op(1280,d,21); Op(1536,d,22); Op(1792,d,23); Op(2048,b,24);
    Op(2560,c,25); Op(2624,c,26); Op(2688,c,27); Op(2752,c,28); Op(2816,c,29);
    Op(2880,c,30); Op(2944,c,31); Op(3008,c,32); Op(3072,c,33); Op(3136,c,34);
    Op(3200,c,35); Op(3264,c,36); Op(3328,c,37); Op(3520,c,38); Op(4096,a,39);
    Op(8192,a,40); Op(12288,a,41); Op(16384,a,42); Op(20480,a,43); Op(24576,a,44);
    Op(30720,b,45); Op(32256,b,46); Op(32768,d,47); Op(33024,d,48); Op(33280,d,49);
    Op(33536,d,50); Op(33792,d,51); Op(34048,d,52); Op(34304,d,53); Op(34560,d,54);
    Op(34816,d,55); Op(35072,d,56); Op(35328,c,57); Op(35392,c,58); Op(35456,c,59);
    Op(35520,c,60); Op(35584,c,61); Op(35648,c,62); Op(35712,c,63); Op(35776,c,64);
    Op(35840,c,65); Op(35904,c,66); Op(35968,c,67); Op(36032,c,68); Op(36096,c,69);
    Op(36288,c,70); Op(36864,a,71); Op(40960,a,72); Op(45056,a,73); Op(49152,a,74);
    Op(53248,a,75); Op(57344,a,76);
  }

  this.setTrace = function(to) { trace = to; }

  /*void*/function dbgRegs() {
	var s ="",i;
	for(i=0;i<8;i++) s+=Disasm.regnames[i]+'='+r[i].toString(8)+" ";
	s+="PSW = "+pswstr(psw);
	note(s);
  }
  
  /*void*/function dbgTmKey() {
  
	var s="",m;
	var rm = [
	{a:65478,d:"tm_strt"}, {a:65480,d:"tm_cnt"}, {a:65482,d:"tm_cnf"},
	{a:65456,d:"key_stat"}, {a:65458,d:"key_code"} ];
	
	var /*QBusReadDTO*/ rDTO = new QBusReadDTO(-1);
	for(var i=0;i<rm.length;i++) 
	 {
	 m = rm[i];
	 if( base.readWord(m.a,rDTO) )
	   s+=m.d+'#'+m.a.toString(8)+"="+rDTO.value.toString(8)+";";
	 }
	note(s);
  }
  
  /*void*/function dbgMem(addr) {
	var /*QBusReadDTO*/ rDTO = new QBusReadDTO(-1);
	if( base.readWord(addr,rDTO) )
		note('#'+addr.toString(8)+"="+rDTO.value.toString(8));
  }
  
  function /*void*/note(/*String*/what)
  {
    console.log(what);
  }
  
  function pswstr(n)
  {
   var s="";
   for(i=0;i<8;i++) s+=(psw&(1<<i) ? flagLst[i] : "-");
   return s;
  }
  
  function /*void*/noteReg(/*int*/regNum) {
    note(Disasm.regnames[regNum] + " <= " + (r[regNum]).toString(8));
  }

  function /*void*/cycles(/*long*/howMany)
  {
    self.Cycles += howMany;
  }

  /*void*/this.reset = function() {
    note("CPU reset\n");

    base.reset();
    
    for(var i=0;i<8;i++) r[i]=0;
    psw = 224;
    
    /* starting address Bk10 = o100360, Bk11m = o140340*/
    base.readWord(65486, readDTO);
    r[7] = /*(short)*/(readDTO.value & 0xFF00)>>>0;

    state = CPUState.NORMAL;
    self.Cycles = 0;
    gotIrq = false;
    intvector = 0;
  }

  function /*boolean*/N()
  {
    return ((psw & 8) != 0);
  }

  function /*boolean*/Z() {
    return ((psw & 4) != 0);
  }

  function /*boolean*/V() {
    return ((psw & 2) != 0);
  }

  function /*boolean*/C() {
    return ((psw & 1) != 0);
  }
  
  /* FLAGS
   I = 64; T = 16; N = 8; Z = 4; V = 2; C = 1; NZVC = 15;
  */
  this.setPSW = function(n) { psw = n; }  
  this.getPSW = function() { return psw; }  
  
  function /*void*/setNZVC(/*boolean*/n, /*boolean*/z, /*boolean*/v, /*boolean*/c) {
    psw = 
      /*(short)*/(psw & 0xFFF0 | (n ? 8 : 0) | 
      (z ? 4 : 0) | (v ? 2 : 0) | (c ? 1 : 0));
  }

  function /*void*/setNZByWordValue(/*int*/value, /*boolean*/clear, /*int*/also_set)
  {
    var /*int*/n = psw & (clear ? 0xFFF0 : 0xFFF3);
    if ((value & 0x8000) != 0) {
      n |= 8;
    }
    if ((value & 0xFFFF) == 0) {
      n |= 4;
    }
    psw = /*(short)*/(n | also_set);
  }

  function /*void*/setNZVCByWordValue(/*int*/value, /*boolean*/carry)
  {
    var /*int*/n = psw & 0xFFF0;

    if ((value & 0x8000) != 0)
      n |= 0x8 | (carry ? 0 : 2);
    else {
      n |= (carry ? 2 : 0);
    }

    if ((value & 0xFFFF) == 0) {
      n |= 4;
    }
    if (carry) {
      n |= 1;
    }
    psw = /*(short)*/n;
  }

  function /*void*/setNZByByteValue(/*int*/value, /*boolean*/clear, /*int*/also_set)
  {
    var /*int*/n = psw & (clear ? 0xFFF0 : 0xFFF3);
    if ((value & 0x80) != 0) {
      n |= 8;
    }
    if ((value & 0xFF) == 0) {
      n |= 4;
    }
    psw = /*(short)*/(n | also_set);
  }

  function /*void*/setNZVCByByteValue(/*int*/value, /*boolean*/carry)
  {
    var /*int*/n = psw & 0xFFF0;

    if ((value & 0x80) != 0)
      n |= 0x8 | (carry ? 0 : 2);
    else {
      n |= (carry ? 2 : 0);
    }

    if ((value & 0xFF) == 0) {
      n |= 4;
    }
    if (carry) {
      n |= 1;
    }
    psw = /*(short)*/n;
  }

  function /*boolean*/genEA(/*int*/mmode, /*boolean*/by, /*QBusReadDTO*/ result)
  {
    var /*int*/i = mmode & 0x7;
    var /*int*/mode = mmode >>> 3 & 0x7;
    var /*short*/ea = r[i];

    cycles(eaMemCycles[mode]);

    switch (mode)
    {
    case 0:
      return false;
    case 1:
      result.value = ea;
      return true;
    case 2:
      if ((i == 7) || (i == 6)) {
        ea = /*(short)*/(ea & 0xFFFE)>>>0;
        r[i] = /*(short)*/(r[i] + 2)&0xFFFF>>>0;
      }
      else
      {
        r[i] = /*(short)*/(r[i] + (by ? 1 : 2))&0xFFFF>>>0; }
      result.value = ea;
      return true;
    case 3:
	r[i] = /*(short)*/(r[i] + 2)&0xFFFF>>>0;
      return base.readWord(ea, result);
    case 4:
      if ((i == 7) || (i == 6))
      {
        ea = /*(short)*/r[i] = /*(short)*/(r[i] - 2)&0xFFFE>>>0;
      }
      else
      {
        ea = r[i] = /*(short)*/(r[i] - (by ? 1: 2))&0xFFFF>>>0; }
      result.value = ea;
      return true;
    case 5:
      ea = r[i] = /*(short)*/(r[i] - 2)&0xFFFF>>>0;
      return base.readWord(ea, result);
    case 6:
      if (!(base.readWord(r[7], result)))
        return false;
      r[7] = /*(short)*/(r[7] + 2)&0xFFFF>>>0;
      result.value = /*(short)*/(result.value + r[i])&0xFFFF>>>0;
      return true;
    case 7:
      if (!(base.readWord(r[7], result)))
        return false;
      r[7] = /*(short)*/(r[7] + 2)&0xFFFF>>>0;
      ea = /*(short)*/(r[i] + result.value)&0xFFFF>>>0;
      return base.readWord(ea, result);
    }

    return false;
  }

  
  function /*void*/trap(/*int*/vector) {
    state = CPUState.INT;
    intvector = /*(short)*/(vector & 0xFF);
  }

  function /*void*/busError()
  {
  /* on BK0010 ignorable busError on 1140: MOV #42400,@#177662 */
    trap(4);
  }

  /*void*/this.nmi = function()
  {
    r[7] = /*(short)*/(r[7] + 2)&0xFFFF>>>0;
    trap(4);
  }

  /*void*/this.irq = function()
  {
    gotIrq = true;
  }

  function /*boolean*/exec_1op_word(/*short*/insn, /*int*/opcode)
  {
    var /*int*/dd = insn & 0x3F;
    var /*short*/ea = 0;
    var /*int*/src = 0;
    var /*int*/setflags = 0;
    var /*boolean*/carry = false;

    if (dd <= 7) {
      src = r[dd] & 0xFFFF>>>0;
    }
    else {
      if (!(genEA(dd, false, readDTO))) {
        busError();
        return false;
      }
      ea = readDTO.value;
      if ((opcode != 25) && 
        (!(base.readWord(ea, readDTO)))) {
        busError();
        return false;
      }
      src = (readDTO.value & 0xFFFF)>>>0;
    }
    var /*int*/dst;
    switch (opcode)
    {
    case 16: /*SWAB*/
      dst = (src & 0xFF) << 8 | (src & 0xFF00) >>> 8;
      setNZByByteValue(dst, true, 0);
      break;
    case 25: /*CLR*/
      dst = 0;
      setNZByWordValue(dst, true, 0);
      break;
    case 26: /*COM*/
      dst = (src ^ 0xFFFF)>>>0;
      setNZByWordValue(dst, true, 1);
      break;
    case 27: /*INC*/
      setflags = psw & 1;
      dst = src + 1;
      if (src == 32767)
        setflags |= 2;
      setNZByWordValue(dst, true, setflags);
      break;
    case 28: /*DEC*/
      setflags = psw & 1;
      dst = src - 1;
      if (src == 32768)
        setflags |= 2;
      setNZByWordValue(dst, true, setflags);
      break;
    case 29: /*NEG*/
      dst = -src;
      if (src == 32768)
        setflags |= 2;
      if (src != 0)
        setflags |= 1;
      setNZByWordValue(dst, true, setflags);
      break;
    case 30: /*ADC*/
      if (C()) {
        if (src == 32767)
          setflags = 2;
        if (src == 65535)
          setflags |= 1;
        dst = src + 1;
      } else {
        dst = src; }
      setNZByWordValue(dst, true, setflags);
      break;
    case 31: /*SBC*/
      if (C()) {
        if (src == 32768)
          setflags = 2;
        if (src == 0)
          setflags |= 1;
        dst = src - 1;
      } else {
        dst = src; }
      setNZByWordValue(dst, true, setflags);
      break;
    case 32: /*TST*/
      dst = src;
      setNZByWordValue(dst, true, 0);
      return true;
    case 33: /*ROR*/
      carry = (src & 1) != 0;
      dst = src >>> 1 & 0x7FFF;
      if (C())
        dst |= 32768;
      setNZVCByWordValue(dst, carry);
      break;
    case 34: /*ROL*/
      carry = (src & 0x8000) != 0;
      dst = src << 1 & 0xFFFE;
      if (C())
        dst |= 1;
      setNZVCByWordValue(dst, carry);
      break;
    case 35: /*ASR*/
      carry = (src & 1) != 0;
      dst = src >>> 1 | src & 0x8000;
      setNZVCByWordValue(dst, carry);
      break;
    case 36: /*ASL*/
      carry = (src & 0x8000) != 0;
      dst = src << 1;
      setNZVCByWordValue(dst, carry);
      break;
    case 38: /*SXT*/
      if (N()) {
        dst = 65535;
        psw = /*(short)*/(psw & 0xFFF9);
      } else {
        dst = 0;
        psw = /*(short)*/(psw & 0xFFFD | 0x4);
      }
      break;
    case 17: /*BR*/
    case 18: /*BNE*/
    case 19: /*BEQ*/
    case 20: /*BGE*/
    case 21: /*BLT*/
    case 22: /*BGT*/
    case 23: /*BLE*/
    case 24: /*JSR*/
    case 37: /*MARK*/
    default:
      note("Tried to execute unsupported 1-op insn (this shouldn't happen)\n");
      trap(8);
      return false;
    }

    if (dd <= 7) {
      r[dd] = /*(short)*/dst&0xFFFF>>>0;
      if (trace)
        noteReg(dd);
    } else {
      cycles(4);
      if (!(base.writeWord(ea, /*(short)*/dst&0xFFFF>>>0))) {
        busError();
        return false;
      }
    }
    return true;
  }

  function /*boolean*/exec_1op_byte(/*short*/insn, /*int*/opcode)
  {
    var /*int*/dd = insn & 0x3F;
    var /*short*/ea = 0;
    var /*int*/src = 0;
    var /*int*/setflags = 0;
    var /*boolean*/carry = false;

    if (dd <= 7) {
      src = r[dd] & 0xFF>>>0;
    }
    else {
      if (!(genEA(dd, true, readDTO))) {
        busError();
        return false;
      }
      ea = readDTO.value;
      if ((opcode != 57) && (opcode != 70) && 
        (!(base.readByte(ea, readDTO)))) {
        busError();
        return false;
      }
      src = (readDTO.value & 0xFF)>>>0;
    }
    var /*int*/dst;
    switch (opcode)
    {
    case 69: /*MTPS*/
      if (trace && ((src & 0xFF10) != 0))
        note("MTPS: attempt to set unsupported bit(s)");
      psw = /*(short)*/(psw & 0xFF10 | src & 0xEF);
      return true;
    case 70: /*MFPS*/
      dst = /*(byte)*/psw&255>>>0;
      setNZByByteValue(dst, true, psw & 1);
      if (dd <= 7) {
        r[dd] = /*(short)*/dst;
        return true;
      }
      break;
    case 57: /*CLRB*/
      dst = 0;
      setNZByByteValue(dst, true, 0);
      break;
    case 58: /*COMB*/
      dst = (src ^ 0xFFFF)>>>0;
      setNZByByteValue(dst, true, 1);
      break;
    case 59: /*INCB*/
      setflags = psw & 1;
      dst = src + 1;
      if (src == 127)
        setflags |= 2;
      setNZByByteValue(dst, true, setflags);
      break;
    case 60: /*DECB*/
      setflags = psw & 1;
      dst = src - 1;
      if (src == 128)
        setflags |= 2;
      setNZByByteValue(dst, true, setflags);
      break;
    case 61: /*NEGB*/
      dst = -src;
      if (src == 128)
        setflags |= 2;
      if (src != 0)
        setflags |= 1;
      setNZByByteValue(dst, true, setflags);
      break;
    case 62: /*ADCB*/
      if (C()) {
        if (src == 127)
          setflags = 2;
        if (src == 255)
          setflags |= 1;
        dst = src + 1;
      } else {
        dst = src; }
      setNZByByteValue(dst, true, setflags);
      break;
    case 63: /*SBCB*/
      if (C()) {
        if (src == 128)
          setflags = 2;
        if (src == 0)
          setflags |= 1;
        dst = src - 1;
      } else {
        dst = src; }
      setNZByByteValue(dst, true, setflags);
      break;
    case 64: /*TSTB*/
      dst = src;
      setNZByByteValue(dst, true, 0);
      return true;
    case 65: /*RORB*/
      carry = (src & 1) != 0;
      dst = src >>> 1 & 0x7F;
      if (C())
        dst |= 128;
      setNZVCByByteValue(dst, carry);
      break;
    case 66: /*ROLB*/
      carry = (src & 0x80) != 0;
      dst = src << 1 & 0xFE;
      if (C())
        dst |= 1;
      setNZVCByByteValue(dst, carry);
      break;
    case 67: /*ASRB*/
      carry = (src & 1) != 0;
      dst = src >>> 1 | src & 0x80;
      setNZVCByByteValue(dst, carry);
      break;
    case 68: /*ASLB*/
      carry = (src & 0x80) != 0;
      dst = src << 1;
      setNZVCByByteValue(dst, carry);
      break;
    default:
      note("Tried to execute unsupported 1-op insn (this shouldn't happen)\n");
      trap(8);
      return false;
    }

    if (dd <= 7) {
      r[dd] = /*(short)*/(r[dd] & 0xFF00 | dst & 0xFF)>>>0;
      if (trace)
        noteReg(dd);
    } else {
      cycles(4);
      if (!(base.writeByte(ea, /*(byte)*/dst))) {
        busError();
        return false;
      }
    }
    return true;
  }

  function /*boolean*/exec_2op_word(/*short*/insn, /*int*/opcode) {
    var /*int*/ss = (insn & 0xFC0) >>> 6;
    var /*int*/dd = insn & 0x3F;
    var /*short*/ea = 0;

    var /*int*/dst = 0;
    var /*boolean*/samesign = false;
    var /*int*/src;
    if (ss <= 7) {
      src = r[ss] & 0xFFFF>>>0;
    } else {
      if (!(genEA(ss, false, readDTO))) {
        busError();
        return false;
      }
      if (!(base.readWord(readDTO.value, readDTO))) {
        busError();
        return false;
      }
      src = (readDTO.value & 0xFFFF)>>>0;
    }

    if (dd <= 7) {
      dst = r[dd] & 0xFFFF>>>0;
    } else {
      if (!(genEA(dd, false, readDTO))) {
        busError();
        return false;
      }
      ea = readDTO.value;
      if (opcode != 39) {
        if (!(base.readWord(ea, readDTO))) {
          busError();
          return false;
        }
        dst = (readDTO.value & 0xFFFF)>>>0;
      }
    }
    var /*int*/setflags;
    switch (opcode)
    {
    case 39: /*MOV*/
      dst = src;
      setNZByWordValue(src, true, psw & 1);
      break;
    case 40: /*CMP*/
      samesign = ((dst ^ src)>>>0 & 0x8000) == 0;

      src = src + 1 + ((dst ^ 0xFFFF)>>>0);

      setflags = (!samesign && ((((dst ^ src)>>>0) & 0x8000) == 0)) ? 2 : 0;
      if ((src & 0x10000) == 0) {
        setflags |= 1;
      }
      setNZByWordValue(src, true, setflags);

      if (ss <= 7)
        cycles(8);
      return true;
    case 41: /*BIT*/
      dst &= src;
      setNZByWordValue(dst, true, psw & 1);
      if (ss <= 7)
        cycles(8);
      return true;
    case 42: /*BIC*/
      dst &= (src ^ 0xFFFF)>>>0;
      setNZByWordValue(dst, true, psw & 1);
      break;
    case 43: /*BIS*/
      dst |= src;
      setNZByWordValue(dst, true, psw & 1);
      break;
    case 44: /*ADD*/
      samesign = (((dst ^ src)>>>0) & 0x8000) == 0;
      dst = src + dst;

      setflags = (samesign && ((((dst ^ src)>>>0) & 0x8000) != 0)) ? 2 : 0;
      if ((dst & 0x10000) != 0) {
        setflags |= 1;
      }
      setNZByWordValue(dst, true, setflags);
      break;
    case 76: /*SUB*/
      samesign = (((dst ^ src)>>>0) & 0x8000) == 0;

      dst = dst + 1 + ((src ^ 0xFFFF)>>>0);
      setflags = (!samesign && ((((dst ^ src)>>>0) & 0x8000) == 0)) ? 2 : 0;
      if ((dst & 0x10000) == 0) {
        setflags |= 1;
      }
      setNZByWordValue(dst, true, setflags);
      break;
    default:
      note("Tried to execute unsupported 2-op insn (this shouldn't happen)\n");
      trap(8);
      return false;
    }

    if (dd <= 7) {
      r[dd] = /*(short)*/dst&0xFFFF>>>0;
      if (trace)
        noteReg(dd);
    } else {
      if (ss <= 7)
        cycles(8);
      else
        cycles(4);
      if (!(base.writeWord(ea, /*(short)*/dst&0xFFFF>>>0))) {
        busError();
        return false;
      }
    }
    return true;
  }

  function /*boolean*/exec_2op_byte(/*short*/insn, /*int*/opcode) {
    var /*int*/ss = (insn & 0xFC0) >>> 6;
    var /*int*/dd = insn & 0x3F;
    var /*short*/ea = 0;

    var /*int*/dst = 0;
    var /*int*/src;
    if (ss <= 7) {
      src = r[ss] & 0xFF;
    } else {
      if (!(genEA(ss, true, readDTO))) {
        busError();
        return false;
      }
      if (!(base.readByte(readDTO.value, readDTO))) {
        busError();
        return false;
      }
      src = (readDTO.value & 0xFF)>>>0;
    }

    if (dd <= 7) {
      dst = r[dd] & 0xFF;
    } else {
      if (!(genEA(dd, true, readDTO))) {
        busError();
        return false;
      }
      ea = readDTO.value;
      if (opcode != 71) {
        if (!(base.readByte(ea, readDTO))) {
          busError();
          return false;
        }
        dst = (readDTO.value & 0xFF)>>>0;
      }
    }

    switch (opcode)
    {
    case 71: /*MOVB*/
      dst = src;
      setNZByByteValue(dst, true, psw & 1);

      if (dd <= 7) {
        r[dd] = /*(byte)*/(src&128 ? (src|0xFF00) :src&255)>>>0;

        if (trace)
          noteReg(dd);
        cycles(8);
        return true;
      }
      break;
    case 72: /*CMPB*/
      var /*boolean*/samesign = (((dst ^ src)>>>0) & 0x80) == 0;

      src = src + 1 + ((dst ^ 0xFF)>>>0);

      var /*int*/setflags = ((!samesign) &&
	((((dst ^ src)>>>0) & 0x80) == 0)) ? 2 : 0;
      if ((src & 0x100) == 0) {
        setflags |= 1;
      }
      setNZByByteValue(src, true, setflags);

      if (ss <= 7)
        cycles(8);
      return true;
    case 73: /*BITB*/
      dst &= src;
      setNZByByteValue(dst, true, psw & 1);
      if (ss <= 7)
        cycles(8);
      return true;
    case 74: /*BICB*/
      dst &= (src ^ 0xFFFF)>>>0;
      setNZByByteValue(dst, true, psw & 1);
      break;
    case 75: /*BISB*/
      dst |= src;
      setNZByByteValue(dst, true, psw & 1);
      break;
    default:
      note("Tried to execute unsupported 2-op insn (this shouldn't happen)\n");
      trap(8);
      return false;
    }

    if (dd <= 7)
    {
      r[dd] = /*(short)*/(r[dd] & 0xFF00 | dst & 0xFF)>>>0;
      if (trace)
        noteReg(dd);
    } else {
      if (ss <= 7)
        cycles(8);
      else
        cycles(4);
      if (!(base.writeByte(ea, /*(byte)*/dst))) {
        busError();
        return false;
      }
    }
    return true;
  }

  function /*void*/take_branch(/*short*/insn, /*boolean*/condition) {
    cycles(4);

    if (trace) {
      note((N() ? "N" : " ") + (Z() ? "Z" : " ") + (V() ? "V" : " ") + 
        (C() ? "C" : " ") + 
        (condition ? " (taken)" : " (NOT taken)"));
    }
    if (!condition) {
      return;
    }

    var v = insn&0xFF>>>0; if(v&128) v-=256;
    r[7] = /*(short)*/(r[7] + v*2)&0xFFFF>>>0;
  }

  function /*boolean*/exec_mark(/*short*/insn) {
    cycles(24);

    r[6] = /*(short)*/(r[7] + 2 * (insn & 0x3F))&0xFFFF>>>0;
    r[7] = r[5];
    if (!(base.readWord(r[6], readDTO))) {
      busError();
      return false;
    }
    r[5] = readDTO.value;
    r[6] = /*(short)*/(r[6] + 2)&0xFFFF>>>0;
    return true;
  }

  function /*boolean*/exec_xor(/*short*/insn) {
    var /*int*/dd = insn & 0x3F;
    var /*int*/src = r[((insn & 0x1C0) >>> 6)];
    var /*short*/ea = 0;
    var /*int*/dst;
    if (dd <= 7) {
      dst = r[dd] & 0xFFFF>>>0;
    } else {
      if (!(genEA(dd, false, readDTO))) {
        busError();
        return false;
      }
      ea = readDTO.value;
      if (!(base.readWord(ea, readDTO))) {
        busError();
        return false;
      }
      dst = (readDTO.value & 0xFFFF)>>>0;
      cycles(8);
    }

    dst = (dst^src)>>>0;

    setNZByWordValue(dst, true, psw & 1);

    if (dd <= 7) {
      r[dd] = /*(short)*/dst&0xFFFF>>>0;
    } else if (!(base.writeWord(ea, /*(short)*/dst&0xFFFF>>>0))) {
      busError();
      return false;
    }
    return true;
  }
  
  /*void*/this.exec_insn = function()
  {
    if (state == CPUState.BOGUS) {
      return;
    }
    if (state == CPUState.INT) {
      var /*short*/a = /*(short)*/(intvector & 0xFFFC);
      if (trace)
        note("trap to " + a.toString(8));
	
      cycles(56);
      if (base.writeWord(r[6] = /*(short)*/(r[6] - 2), psw)&0xFFFF>>>0)
      {
        if ((base.writeWord(r[6] = /*(short)*/(r[6] - 2), r[7])&0xFFFF>>>0) && 
          (base.readWord(a, readDTO))) {
          r[7] = readDTO.value;
          if (base.readWord(/*(short)*/(a + 2)&0xFFFF>>>0, readDTO))
          {
            psw = readDTO.value;
            if (trace)
              note("New PC is " + 
                r[7].toString(8) + 
                ", PSW is " + pswstr(psw));
            state = CPUState.NORMAL;
            return;
          }
        }
      }

      busError();
      return;
    }

    if ((psw & 0x80) == 0) {
      if (gotIrq) {
        gotIrq = false;
        cycles(56);
        trap(64);
        return;
      }
      if (base.gotInterrupt()) {
        cycles(56);
        trap(base.interruptVector());
        return;
      }
    }
    if (state == CPUState.WAIT)
    {
      cycles(4);
      return;
    }

    if (state == CPUState.RTT) {
      state = CPUState.NORMAL;
    } else if ((psw & 0x10) != 0)
    {
      if (trace)
        note("trace");
      trap(12);
      return;
    }
 
    if (trace) {
      dbgRegs(); dbgTmKey();      
      var s = Disasm.disasm(base, r[7], true);
      note(s);
    }
    
    if (!(base.readWord(r[7], readDTO))) {
      if (trace)
        note("Error reading insn at address " + 
          (r[7]).toString(8));
      busError();
      return;
    }
    var /*short*/insn = readDTO.value;
    r[7] = /*(short)*/(r[7] + 2)&0xFFFF>>>0;

    cycles(12);

    var /*int*/op = opdec[(insn & 0xFFFF)];
    var /*int*/dst;
    switch (op)
    {
    case 10: /*START*/
    case 11: /*STEP*/
      cycles(64);
      trap(4);
      break;
    case 3: /*HALT*/
      cycles(64);
      trap(4);

      break;
    case 4: /*WAIT*/
      if (trace)
        note("Wait");
      state = CPUState.WAIT;
      
      break;
    case 6: /*BPT*/
      trap(12);
      break;
    case 7: /*IOT*/
      trap(16);
      break;
    case 55: /*EMT*/
      trap(24);
      break;
    case 56: /*TRAP*/
      trap(28);
      break;
    case 8: /*RESET*/
      base.reset();
      cycles(8000);
      break;
    case 9: /*RTT*/
      if (trace)
        note("RTT");
      state = CPUState.RTT;
    case 5: /*RTI*/
      cycles(28);
      if (!(base.readWord(r[6], readDTO))) {
        busError();
        return;
      }
      r[7] = readDTO.value;
      if (!(base.readWord(r[6] = /*(short)*/(r[6] + 2)&0xFFFF>>>0, readDTO))) {
        busError();
        return;
      }
      psw = readDTO.value;
      r[6] = /*(short)*/(r[6] + 2)&0xFFFF>>>0;
      break;
    case 12: /*JMP*/
      dst = insn & 0x3F;
      if (dst <= 7) {
        trap(4);
        return;
      }
      if (!(genEA(dst, false, readDTO)))
      {
        busError();
        return;
      }
      cycles(8);
      r[7] = readDTO.value;
      break;
    case 13: /*RTS*/
      cycles(20);
      dst = insn & 0x7;
      if (!(base.readWord(r[6], readDTO))) {
        busError();
        return;
      }
      r[6] = /*(short)*/(r[6] + 2)&0xFFFF>>>0;
      r[7] = r[dst];
      r[dst] = readDTO.value;
      break;
    case 14: /*SCC*/
      psw = /*(short)*/(psw | insn & 0x000F);
      break;
    case 15: /*CCC*/
      psw = /*(short)*/(psw & (0xFFF0 | ((insn ^ 0xFFFF)>>>0)));
      break;
    case 24: /*JSR*/
      dst = insn & 0x3F;
      var /*int*/src = (insn >>> 6) & 0x7;
      if (dst <= 7) {
        trap(4);
        return;
      }
      if (!(genEA(dst, false, readDTO)))
      {
        busError();
        return;
      }
      cycles(20);
      if (!(base.writeWord(r[6] = /*(short)*/(r[6] - 2)&0xFFFF>>>0, r[src])))
      {
        busError();
        return;
      }
      r[src] = r[7];
      r[7] = readDTO.value;
      break;
    case 37: /*MARK*/
      exec_mark(insn);
      break;
    case 45: /*XOR*/
      exec_xor(insn);
      break;
    case 46: /*SOB*/
      cycles(8);
      var /*int*/k = ((insn & 0x1C0) >>> 6);
      if ((r[k] = /*(short)*/(r[k] - 1)&0xFFFF>>>0) != 0)
	r[7] = /*(short)*/(r[7] - ((insn & 0x3F) * 2))&0xFFFF>>>0;
      break;
    case 16: /*SWAB*/
    case 25: /*CLR*/
    case 26: /*COM*/
    case 27: /*INC*/
    case 28: /*DEC*/
    case 29: /*NEG*/
    case 30: /*ADC*/
    case 31: /*SBC*/
    case 32: /*TST*/
    case 33: /*ROR*/
    case 34: /*ROL*/
    case 35: /*ASR*/
    case 36: /*ASL*/
    case 38: /*SXT*/
      exec_1op_word(insn, op);
      break;
    case 57: /*CLRB*/
    case 58: /*COMB*/
    case 59: /*INCB*/
    case 60: /*DECB*/
    case 61: /*NEGB*/
    case 62: /*ADCB*/
    case 63: /*SBCB*/
    case 64: /*TSTB*/
    case 65: /*RORB*/
    case 66: /*ROLB*/
    case 67: /*ASRB*/
    case 68: /*ASLB*/
    case 69: /*MTPS*/
    case 70: /*MFPS*/
      exec_1op_byte(insn, op);
      break;
    case 39: /*MOV*/
    case 40: /*CMP*/
    case 41: /*BIT*/
    case 42: /*BIC*/
    case 43: /*BIS*/
    case 44: /*ADD*/
    case 76: /*SUB*/
      exec_2op_word(insn, op);
      break;
    case 71: /*MOVB*/
    case 72: /*CMPB*/
    case 73: /*BITB*/
    case 74: /*BICB*/
    case 75: /*BISB*/
      exec_2op_byte(insn, op);
      break;
    case 17: /*BR*/
      take_branch(insn, true);
      break;
    case 51: /*BVC*/
      take_branch(insn, !(V()));
      break;
    case 52: /*BVS*/
      take_branch(insn, V());
      break;
    case 53: /*BCC*/
      take_branch(insn, !(C()));
      break;
    case 54: /*BCS*/
      take_branch(insn, C());
      break;
    case 18: /*BNE*/
      take_branch(insn, !(Z()));
      break;
    case 19: /*BEQ*/
      take_branch(insn, Z());
      break;
    case 47: /*BPL*/
      take_branch(insn, !(N()));
      break;
    case 48: /*BMI*/
      take_branch(insn, N());
      break;
    case 20: /*BGE*/
      take_branch(insn, N() == V());
      break;
    case 21: /*BLT*/
      take_branch(insn, (N()^V())>>>0);
      break;
    case 22: /*BGT*/
      take_branch(insn, (N() == V()) && (!(Z())));
      break;
    case 23: /*BLE*/
      take_branch(insn, (N() != V()) || (Z()));
      break;
    case 49: /*BHI*/
      take_branch(insn, (!C()) && (!Z()));
      break;
    case 50: /*BLOS*/
      take_branch(insn, C() || Z());
      break;
    case 0: /*UNKNOWN*/
    case 1: /*ILLEGAL*/
    case 2: /*DUMMY*/
    default:
      cycles(76);
      trap(8);
    }
  }

  this.get_opdec = function(k)
  {
   return opdec[k];
  }
  
  function /*void*/Op(/*int*/opcode, /*int*/mask, /*int*/op_type)
  {
    var /*int*/loc = 0, ma = (mask ^ 0xFFFF)>>>0;
    do
    {
      opdec[((loc | opcode) & 0xFFFF)] = op_type;
      loc = ((loc | mask) + 1) & ma;
      }
    while (loc);
  }
  
  gen_opcodes();
  return this;
}
