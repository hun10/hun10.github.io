export default function(cpu)
{
  const self = this;
  
  let start = 0o177777
  let count = 0o177777
  let internalCounter = 0
  let hasDecrementedOne = false

  let FL, D4, D16, RUN, OS, MON, CAP, SP
  
  self.cycles = 0;

  /*int*/this.getBaseAddress = function()
  {
    return 0o177706;
  }

  /*int*/this.getNumWords = function()
  {
    return 3;
  }

  /*boolean*/this.gotInterrupt = function()
  {
    return false;
  }

  /*byte*/this.interruptVector = function()
  {
    return 0;
  }

  /*boolean*/this.readWord = function(/*int*/addr, /*QBusReadDTO*/ result)
  {
    self.updateTimer();

    switch (addr)
    {
    case 0o177706:
      result.value = start;
      return true;
    case 0o177710:
      result.value = count;
      return true;
    case 0o177712:
      result.value = getConfig()
      return true;
    case 0o177707:
    case 0o177711:
      console.warn('Time odd address read')
    }
    return false;
  }

  /*boolean*/this.writeByteAsWord = function(/*int*/addr, /*short*/data)
  {
    self.updateTimer();
    console.warn('Timer byte write')
    return true;
  }

  /*boolean*/this.writeWord = function(/*int*/addr, /*short*/data)
  {
    self.updateTimer();
    
    switch (addr) {
    case 0o177706:
      start = data&0xFFFF>>>0;
      return true;
    case 0o177710:
      return true;
    case 0o177712:
      setConfig(data);
      return true;
    case 0o177707:
    case 0o177711:
      console.warn('Time odd address write') }
    return false;
  }

  /*void*/this.reset = function()
  {
    hasDecrementedOne = false

    FL = false
    D4 = false
    D16 = false
    RUN = false
    OS = false
    MON = false
    CAP = false
    SP = false
  }

  function getConfig() {
    let result = 0o177400

    if (FL) result |= 0o200
    if (D4) result |= 0o100
    if (D16) result |= 0o40
    if (RUN) result |= 0o20
    if (OS) result |= 0o10
    if (MON) result |= 0o4
    if (CAP) result |= 0o2
    if (SP) result |= 0o1

    return result
  }

  function /*void*/setConfig(/*short*/data) {
    count = start
    hasDecrementedOne = false

    FL = !!(data & 0o200)
    D4 = !!(data & 0o100)
    D16 = !!(data & 0o40)
    RUN = !!(data & 0o20)
    OS = !!(data & 0o10)
    MON = !!(data & 0o4)
    CAP = !!(data & 0o2)
    SP = !!(data & 0o1)
  }

  function advance(delta) {
    const speed = (D4 ? 1 : 4) * (D16 ? 1 : 16)

    if (hasDecrementedOne && delta >= 4) {
      hasDecrementedOne = false

      if (!CAP && RUN && !SP) {
        count = start

        if (OS) {
          RUN = false
        }

        if (MON) {
          FL = true
        }
      }

      self.cycles += 4
      internalCounter += 4 * speed

      return true
    } else if (delta * speed >= (8192 - internalCounter)) {
      if (count === 1 && RUN && !SP) {
        count--
        hasDecrementedOne = true
      } else if (RUN && !SP) {
        count--
        hasDecrementedOne = false
        if (count < 0) {
          count = 0o177777
        }
      }

      self.cycles += (8192 - internalCounter) / speed
      internalCounter = 0

      return true
    }

    return false
  }

  this.updateTimer = function()
  {
    while (advance(cpu.Cycles - self.cycles));
  }

  return self;
}
