
export default function () {
  let capitalMode = true
  let rusMode = false
  let escapeHigh = false
  let dcHigh = false
  let rrHigh = false

  let interruptAllowed = false
  let hasInterrupt = 0
  let locked = false
  let ready = false
  let latchedCode = 0

  const grid = []
  let gridCount = 0

  function processGrid() {
    if (locked && gridCount === 0) {
      locked = false
    } else if (!locked && !ready && gridCount > 0) {
      locked = true
      let escape = escapeHigh

      if (!ready) for (let i = 0; i < 32; i++) {
        if (grid[i]) {
          ready = true
          latchedCode = i

          switch (latchedCode) {
            case 0:
            case 1:
            case 2:
            case 4:
            case 5:
            case 6:
            case 7:
            case 9:
            case 11:
            case 17:
              escape = true
              break
            default:
              break
          }

          if (latchedCode === 14) {
            rusMode = true
          }

          if (latchedCode === 15) {
            rusMode = false
          }
          break
        }
      }

      if (!ready) for (let i = 32; i < 48; i++) {
        if (grid[i]) {
          ready = true
          latchedCode = i
          latchedCode += (rrHigh ^ (i < 44)) ? 16 : 0

          break
        }
      }

      if (!ready) for (let i = 48; i <= 79; i++) {
        if (grid[i]) {
          ready = true
          latchedCode = i - 48
          if (!dcHigh) {
            latchedCode += 64
            if (!(rusMode ^ capitalMode) && !rrHigh) {
              latchedCode += 32
            }
          }

          break
        }
      }

      if (interruptAllowed) {
        hasInterrupt = escape ? 0o274 : 0o60
      }
    }
  }

  function setCell(x, y, value) {
    const linear = x * 8 + y
    if (grid[linear] && !value) {
      gridCount--
    }
    if (!grid[linear] && value) {
      gridCount++
    }
    grid[linear] = value

    processGrid()
  }

  /*int*/this.getBaseAddress = function () {
    return 65456;
  }

  /*int*/this.getNumWords = function () {
    return 2;
  }

  /*boolean*/this.readWord = function (/*int*/addr, /*QBusReadDTO*/ result) {
    if (addr == 65456) {
      result.value = (interruptAllowed ? 0 : 0o100) | (ready ? 0o200 : 0);
      return true;
    }
    ready = false
    result.value = latchedCode
    return true;
  }

  /*boolean*/this.writeByteAsWord = function (/*int*/addr, /*short*/data) {
    return this.writeWord(addr, data);
  }

  /*boolean*/this.writeWord = function (/*int*/addr, /*short*/data) {
    if (addr == 65456) {
      interruptAllowed = !(data & 0o100)
      return true;
    }
    return false;
  }

  /*boolean*/this.gotInterrupt = function () {
    return hasInterrupt > 0
  }

  /*byte*/this.interruptVector = function () {
    let vector = hasInterrupt
    hasInterrupt = 0
    return vector;
  }

  /*void*/this.reset = function()
  {
    rusMode = false
    interruptAllowed = false
    hasInterrupt = 0
    locked = false
    ready = false
  }

  this.close = function ({
    x, y,
    escape,
    deviceControl,
    rightRegister
  }) {
    if (escape !== undefined) {
      escapeHigh = escape
    }
    if (deviceControl !== undefined) {
      dcHigh = deviceControl
    }
    if (rightRegister !== undefined) {
      rrHigh = rightRegister
    }

    if (x !== undefined && y !== undefined) {
      setCell(x, y, true)
    }
  }

  this.open = function ({
    x, y,
    escape,
    deviceControl,
    rightRegister
  }) {
    if (escape !== undefined) {
      escapeHigh = false
    }
    if (deviceControl !== undefined) {
      dcHigh = false
    }
    if (rightRegister !== undefined) {
      rrHigh = false
    }

    if (x !== undefined && y !== undefined) {
      setCell(x, y, false)
    }
  }

  this.setCapital = function (mode) {
    capitalMode = mode
  }

  this.releaseAll = function () {
    for (let x = 0; x <= 9; x++) {
      for (let y = 0; y <= 7; y++) {
        this.open({
          x, y,
          escape: false,
          deviceControl: false,
          rightRegister: false
        })
      }
    }
  }

  this.releaseNonCtrl = function () {
    for (let x = 0; x <= 9; x++) {
      for (let y = 0; y <= 7; y++) {
        this.open({
          x, y
        })
      }
    }
  }

  this.getKeyDown = function () {
    return gridCount > 0
  }

  return this;
}
