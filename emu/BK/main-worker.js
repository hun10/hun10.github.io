import BaseBK001x from './BaseBK001x.js'

const base = new BaseBK001x()
const cpu = base.cpu

let tapeSkipMode = false
let forceMotorMode = false

let audioPort, audioStarted = false

const audioBufMax = 1 + 1 / 120
const audioBufSize = Math.ceil((audioBufMax - 1) * 3e6)
const audioBufState = {
	write: { ptr: 0, buf: new Float64Array(audioBufSize) },
	ready: { ptr: 0, buf: new Float64Array(audioBufSize) },
	received: { ptr: 0, buf: new Float64Array(audioBufSize) },
}

let sendMovieFramesOut = false

const movieFrame = {
	initialized: false,
	video: {
		buf: new Uint16Array(256 * 32),
		ptr: 0
	},
	audio: {
		buf: new Int32Array(3e6),
		state: false,
		curLen: 0,
		ptr: 0
	}
}

function movieFrameCut() {
	if (movieFrame.initialized) {
		if (movieFrame.audio.curLen > 0) {
			movieFrame.audio.buf[movieFrame.audio.ptr++] = movieFrame.audio.curLen * (movieFrame.audio.state ? 1 : -1)
		}

		if (sendMovieFramesOut) {
			const video = new Uint16Array(movieFrame.video.buf)
			const audio = new Int32Array(movieFrame.audio.ptr)
			audio.set(movieFrame.audio.buf.subarray(0, movieFrame.audio.ptr))
			postMessage({
				newMovieFrame: {
					video,
					audio
				}
			}, [video.buffer, audio.buffer])
		}
	}

	movieFrame.video.ptr = 0

	movieFrame.audio.ptr = 0
	movieFrame.audio.curLen = 0

	movieFrame.initialized = true
}
function movieFrameAdvance(cycles) {
	if (movieFrame.initialized) {
		movieFrame.audio.curLen += cycles
	}
}
function movieFrameWti(word) {
	if (movieFrame.initialized) {
		movieFrame.video.buf[movieFrame.video.ptr++] = word
	}
}
function movieFrameBeep(state) {
	if (movieFrame.initialized) {
		if (state !== movieFrame.audio.state) {
			movieFrame.audio.buf[movieFrame.audio.ptr++] = movieFrame.audio.curLen * (movieFrame.audio.state ? 1 : -1)
			movieFrame.audio.state = state
			movieFrame.audio.curLen = 0
		}
	}
}

function acceptAudioBuffer(buf) {
	audioStarted = true
	if (audioBufState.received !== null) {
		return
	}
	audioBufState.received = { ptr: 0, buf }

	emulateTillBuffersAreFull()
	if (audioPort && audioBufState.ready.ptr > 0 && Math.abs(audioBufState.ready.buf[audioBufState.ready.ptr - 1]) === audioBufMax && audioBufState.received !== null) {
		audioPort.postMessage(audioBufState.ready.buf, [audioBufState.ready.buf.buffer])
		audioBufState.ready = audioBufState.received
		audioBufState.received = null
	}
}

let currentBufferT = 1

function putAudio(signedOneShiftedTime) {
	if (Math.abs(signedOneShiftedTime) > audioBufMax) {
		putAudio(Math.sign(signedOneShiftedTime) * audioBufMax)
		currentBufferT = 1
		putAudio(Math.sign(signedOneShiftedTime) * (Math.abs(signedOneShiftedTime) - audioBufMax + 1))
		return
	}

	if (Math.abs(signedOneShiftedTime) <= audioBufMax) {
		audioBufState.write.buf[audioBufState.write.ptr++] = signedOneShiftedTime
	}
	if (Math.abs(signedOneShiftedTime) === audioBufMax) {
		const tmp = audioBufState.ready
		audioBufState.ready = audioBufState.write
		audioBufState.write = tmp
		audioBufState.write.ptr = 0
		audioBufState.write.buf.fill(0)
	}
	if (audioPort && audioBufState.ready.ptr > 0 && Math.abs(audioBufState.ready.buf[audioBufState.ready.ptr - 1]) === audioBufMax && audioBufState.received !== null) {
		audioPort.postMessage(audioBufState.ready.buf, [audioBufState.ready.buf.buffer])
		audioBufState.ready = audioBufState.received
		audioBufState.received = null
	}
}

function putAudioDelta(signedDelta) {
	currentBufferT += Math.abs(signedDelta)
	putAudio(currentBufferT * Math.sign(signedDelta))
}

const vp037state = {
	lowerBits: 0,
	hGate: true,
	upperBits: 0,
	vGate: false,
	line: 0
}

let videoPort

const videoBufSize = 256 * 32
const videoBufState = {
	write: { ptr: 0, buf: new Uint16Array(videoBufSize) },
	ready: { ptr: 0, buf: new Uint16Array(videoBufSize) },
	received: null
}

function acceptVideoBuffer(buf) {
	if (videoBufState.received !== null) {
		return
	}
	videoBufState.received = { ptr: 0, buf }

	emulateTillBuffersAreFull()
	if (videoBufState.ready.ptr === videoBufSize && videoBufState.received !== null) {
		videoPort.postMessage(videoBufState.ready.buf, [videoBufState.ready.buf.buffer])
		videoBufState.ready = videoBufState.received
		videoBufState.received = null
	}
}

function hasNotFullBuffers() {
	if (audioStarted) {
		return audioBufState.ready.ptr === 0 || Math.abs(audioBufState.ready.buf[audioBufState.ready.ptr - 1]) < audioBufMax
	} else {
		return videoBufState.ready.ptr < videoBufSize
	}
}

function putVideo(word) {
	if (videoBufState.write.ptr < videoBufSize) {
		videoBufState.write.buf[videoBufState.write.ptr++] = word
	}
	if (videoBufState.write.ptr === videoBufSize) {
		const tmp = videoBufState.ready
		videoBufState.ready = videoBufState.write
		videoBufState.write = tmp
		videoBufState.write.ptr = 0
	}
	if (videoBufState.ready.ptr === videoBufSize && videoBufState.received !== null) {
		videoPort.postMessage(videoBufState.ready.buf, [videoBufState.ready.buf.buffer])
		videoBufState.ready = videoBufState.received
		videoBufState.received = null
	}
}

function simulateWtiPulse() {
	const reg = base.getScrollReg()

	let vWord = 0
	if (vp037state.hGate && vp037state.vGate && ((reg & 0x200) !== 0 || (vp037state.line & 0xC0) === 0xC0)) {
		const vAddr = (vp037state.upperBits << 5) | vp037state.lowerBits | 0o20000
		vWord = base.accMemory[vAddr]
	}

	if (vp037state.hGate && vp037state.vGate) {
		if (vp037state.lowerBits === 0 && vp037state.line === 255) {
			movieFrameCut()
		}
		movieFrameWti(vWord)
		putVideo(vWord)
	}

	vp037state.lowerBits += 1
	if (vp037state.hGate) {
		if (vp037state.lowerBits >= 32) {
			vp037state.hGate = false
			vp037state.lowerBits = 0
		}
	} else {
		if (vp037state.lowerBits >= 16) {
			vp037state.hGate = true
			vp037state.lowerBits = 0

			vp037state.line -= 1
			vp037state.upperBits = (vp037state.upperBits + 1) & 0xFF
		}
	}

	if (vp037state.vGate) {
		if (vp037state.line < 0) {
			vp037state.vGate = false
			vp037state.line = 63
		}
	} else {
		if (vp037state.line === 40 || vp037state.line === 39) {
			vp037state.upperBits = reg & 0xFF
		} else if (vp037state.line < 0) {
			vp037state.vGate = true
			vp037state.line = 255
		}
	}
}

let pSound, pTime = 0, cTime = 0
let tapeMode = 'stopped', record = [], motorRunning = false

let cpuSpeed = 3e6
let videoSpeedup = 1

let totalCycles
let startMoment

function emulateTillBuffersAreFull() {
	if (!totalCycles && audioStarted) {
		totalCycles = 0
		startMoment = performance.now()
	}

	const initCyc = cpu.Cycles
	let eightCycle = cpu.Cycles;
	while (hasNotFullBuffers() || (tapeSkipMode && (tapeMode === 'playing' || (tapeMode === 'recording' && !forceMotorMode)))) {
		const prevCyc = cpu.Cycles
		cpu.exec_insn();

		const sTime = cpu.Cycles - prevCyc
		movieFrameAdvance(sTime) // may diverge from the video stream
		const wSound = base.getSoundReg()
		movieFrameBeep(wSound)

		cTime += sTime
		if (wSound !== pSound) {
			if (tapeMode === 'recording' && (base.getMotorReg() || forceMotorMode)) {
				record.push((cTime - pTime) * (pSound ? 1 : -1))
			} else if (tapeSkipMode && tapeMode === 'recording' && !base.getMotorReg()) {
				tapeSkipMode = false
				postMessage({
					ffChanged: false
				})
			}

			pSound = wSound
			pTime = cTime
		}

		if ((base.getMotorReg() || forceMotorMode) && tapeMode === 'playing') {
			if (!base.moveRealTape(sTime)) {
				if (tapeSkipMode) {
					tapeSkipMode = false
					postMessage({
						ffChanged: false
					})
				}
				tapeMode = 'stopped'
				postMessage({
					recordEnded: true
				})
			}
		}
		if (tapeSkipMode && !base.getMotorReg() && tapeMode === 'playing') {
			tapeSkipMode = false
			postMessage({
				ffChanged: false
			})
		}

		if (!tapeSkipMode) {
			if (motorRunning && !base.getMotorReg() && !forceMotorMode) {
				motorRunning = false
				postMessage({
					motorRunning
				})
			} else if (!motorRunning && (base.getMotorReg() || forceMotorMode) && tapeMode !== 'stopped') {
				motorRunning = true
				postMessage({
					motorRunning
				})
			}

			putAudioDelta((wSound ? 1 : -1) * sTime / cpuSpeed)

			const vidLength = 4 / videoSpeedup
			let dif = Math.floor(cpu.Cycles / vidLength) - Math.floor(eightCycle / vidLength)
			if (dif > 0) {
				while (dif > 0) {
					simulateWtiPulse()
					dif -= 1
				}
				eightCycle = cpu.Cycles
			}

			base.movePrinterHead()
		}
	}

	if (audioStarted) {
		totalCycles += cpu.Cycles - initCyc
		// console.log(totalCycles / (performance.now() - startMoment))
	}

	base.minimizeCycles()
}

function processKey({
	cpuReset,
	triggerStopMode,
	setCapital,
	action,
	x,
	y,
	rightRegister,
	escape,
	deviceControl
}) {
	if (cpuReset && action === 'close') {
		cpu.reset()
	}

	if (triggerStopMode && action === 'close') {
		cpu.nmi()
	}

	if (setCapital !== undefined) {
		base.keyboard.setCapital(setCapital)
	}

	if (action !== undefined) {
		const payload = {
			x, y,
			escape,
			deviceControl,
			rightRegister
		}
		if (action === 'close') {
			base.keyboard.close(payload)
		}
		if (action === 'open') {
			base.keyboard.open(payload)
		}
		if (action === 'releaseAll') {
			base.keyboard.releaseAll()
		}
		if (action === 'releaseNonCtrl') {
			base.keyboard.releaseNonCtrl()
		}
	}
}

function assign(a, b) {
	for (let i = 0; i < b.length; i++) {
		a[i] = b[i]
	}
}

onmessage = ({ data: {
	portForVideo,
	portForAudio,
	keyboard,
	ioRegister,
	mode,
	togglePrinter,
	setTapePwm,
	ignoreTapeRemoteControl,
	tapeFastForward,
	setTapeMode,
	setCpuSpeed,
	setVideoSpeedup,
	loadState,
	saveState,
	recMovie
} }) => {
	if (portForVideo !== undefined) {
		videoPort = portForVideo
		videoPort.onmessage = e => acceptVideoBuffer(e.data)
		cpu.reset()
	}

	if (portForAudio !== undefined) {
		audioPort = portForAudio
		audioPort.onmessage = e => acceptAudioBuffer(e.data)
	}

	if (mode !== undefined) {
		switch (mode) {
			case 'DEBUG':
				base.setDebugModel()
				break;
			case 'BASIC':
				base.setBASIC10Model()
				break;
			case 'FOCAL':
				base.setFOCAL10Model()
				break;
			default:
		}
	}

	if (keyboard !== undefined) {
		processKey(keyboard)
	}

	if (ioRegister !== undefined) {
		base.ioreadreg = ioRegister
	}

	if (tapeFastForward !== undefined) {
		tapeSkipMode = tapeFastForward
	}
	if (ignoreTapeRemoteControl !== undefined) {
		forceMotorMode = ignoreTapeRemoteControl
	}
	if (setTapePwm !== undefined) {
		base.startRealTapeRecord(setTapePwm)
	}
	if (setTapeMode !== undefined) {
		if (setTapeMode === 'play' && tapeMode !== 'playing') {
			tapeMode = 'playing'
		} else if (setTapeMode === 'stop' && tapeMode !== 'stopped') {
			if (tapeMode === 'recording') {
				postMessage({
					newRecording: record
				})
	
				record = []
			}
			tapeMode = 'stopped'
		} else if (setTapeMode === 'record' && tapeMode !== 'recording') {
			tapeMode = 'recording'
			record = []
		}
	}

	if (togglePrinter !== undefined) {
		base.togglePrinter(togglePrinter)
	}

	if (setCpuSpeed !== undefined) {
		cpuSpeed = setCpuSpeed
	}
	if (setVideoSpeedup !== undefined) {
		videoSpeedup = setVideoSpeedup
	}

	if (saveState !== undefined) {
		const bkState = {
			memory: [],
			readable: [],
			writeable: [],
			scrollReg: base.getScrollReg(),
			cpuRegs: [],
			cpuPsw: base.cpu.getPSW(),
			timerStart: base.accTimer.getStart(),
			timerCount: base.accTimer.getCount(),
			timerConfig: base.accTimer.getConfig(),
			keyInt: base.keyboard.isInterruptAllowed()
		}

		assign(bkState.cpuRegs, base.cpu.regs)
		assign(bkState.memory, base.accMemory)
		assign(bkState.readable, base.accMmap.mmap_readable)
		assign(bkState.writeable, base.accMmap.mmap_writeable)

		postMessage({
			bkState
		})
	}

	if (loadState !== undefined) {
		assign(base.accMemory, loadState.memory)
		assign(base.accMmap.mmap_readable, loadState.readable)
		assign(base.accMmap.mmap_writeable, loadState.writeable)
		base.setScrollReg(loadState.scrollReg)
		assign(base.cpu.regs, loadState.cpuRegs)
		base.cpu.setPSW(loadState.cpuPsw)
		base.accTimer.setStart(loadState.timerStart)
		base.accTimer.setCount(loadState.timerCount)
		base.accTimer.setConfig(loadState.timerConfig)
		base.keyboard.setInterruptAllowed(loadState.keyInt)
	}

	if (recMovie !== undefined) {
		sendMovieFramesOut = recMovie
	}
}
