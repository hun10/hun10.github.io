import { webBk0010_01, bk0010, translation, bk0010_01 } from './Keys.js'

const emulator = new Worker('./main-worker.js', {
	type: 'module'
})

let movie = []

function addMovieFrame(frame) {
	movie.push(frame)
}

export function startMovieRec() {
	movie = []

	emulator.postMessage({
		recMovie: true
	})
}

export function endMovieRec() {
	emulator.postMessage({
		recMovie: false
	})

	return movie
}

export function saveState() {
	emulator.postMessage({
		saveState: true
	})
}

export function loadState() {
	emulator.postMessage({
		loadState: JSON.parse(localStorage.getItem('bkState-0'))
	})
}

let overJoystick = 0
export function toggleJoystick() {
	overJoystick ^= 1
}

let buzzer, clippingListeners = []

const videoChannel = new MessageChannel()

emulator.postMessage({
	portForVideo: videoChannel.port2
}, [videoChannel.port2])

const video = {
	v: [
		new Uint16Array(256 * 32),
		new Uint16Array(256 * 32),
		new Uint16Array(256 * 32)
	],
	vFull: [
		false,
		false,
		false
	],
	current: 0,
	receivedBuffer: new Uint16Array(256 * 32)
}

export function getVideoFrame(copier) {
	returnVideoBuffer()

	for (let i = 0; i < video.vFull.length; i++) {
		if (!video.vFull[video.current]) {
			video.current = (video.current + 1) % video.vFull.length
		} else {
			copier(video.v[video.current])
			video.vFull[video.current] = false
			return true
		}
	}

	return false
}

let firstStart = true

videoChannel.port1.onmessage = ({ data }) => {
	video.receivedBuffer = data

	for (let j = 0; j < video.vFull.length; j++) {
		const cur = (video.current + j) % video.vFull.length

		if (!video.vFull[cur]) {
			const vv = video.v[cur]
			for (let i = 0; i < data.length; i++) {
				vv[i] = data[i]
			}
			video.vFull[cur] = true
			break
		}
	}

	if (firstStart) {
		firstStart = false
		loadState()
	}
}

export function returnVideoBuffer() {
	if (video.receivedBuffer !== null) {
		videoChannel.port1.postMessage(video.receivedBuffer, [video.receivedBuffer.buffer])
		video.receivedBuffer = null
	}
}

returnVideoBuffer()

export function setCpuSpeed(HZ, videoFactor) {
	emulator.postMessage({
		setCpuSpeed: HZ,
		setVideoSpeedup: videoFactor
	})
}

const printerFrame = document.createElement('iframe')
let tapeControls

function processPrinterStream(stream) {
	return stream.replaceAll(String.fromCharCode(19), '')
}

emulator.onmessage = ({ data: {
	printerPaper,
	newRecording,
	recordEnded,
	motorRunning,
	ffChanged,
	bkState,
	newMovieFrame
} }) => {
	if (printerPaper !== undefined) {
		const uri = `data:text/plain;charset=koi8-r;base64,${btoa(processPrinterStream(printerPaper))}`
		printerFrame.src = uri
	}

	if (newRecording !== undefined && tapeControls !== undefined) {
		tapeControls.appendRecording(newRecording)
	}
	if (recordEnded !== undefined && tapeControls !== undefined) {
		tapeControls.update({
			ended: true
		})
	}
	if (motorRunning !== undefined && tapeControls !== undefined) {
		tapeControls.update({
			motor: motorRunning
		})
	}
	if (ffChanged !== undefined && tapeControls !== undefined) {
		tapeControls.update({
			ff: ffChanged
		})
	}
	if (bkState !== undefined) {
		localStorage.setItem('bkState-0', JSON.stringify(bkState))
	}
	if (newMovieFrame !== undefined) {
		addMovieFrame(newMovieFrame)
	}
}

export function mode(mode) {
	emulator.postMessage({
		mode,
		keyboard: {
			cpuReset: true,
			action: 'close'
		}
	})
}

let printerEnabled = false
export function togglePrinter() {
	printerEnabled = !printerEnabled

	if (printerEnabled) {
		document.body.appendChild(printerFrame)
	} else {
		document.body.removeChild(printerFrame)
	}

	emulator.postMessage({
		togglePrinter: printerEnabled
	})
}

let audioCtx = new AudioContext()

audioCtx.audioWorklet?.addModule('sound/buzzer.js').then(() => {
	buzzer = new AudioWorkletNode(audioCtx, 'buzzer')

	buzzer.connect(audioCtx.destination)

	buzzer.port.onmessage = ({
		data: {
			clipped
		}
	}) => {
		if (clipped !== undefined) {
			clippingListeners.forEach(listener => listener(clipped))
		}
	}

	const audioChannel = new MessageChannel()

	buzzer.port.postMessage({
		portForAudio: audioChannel.port1
	}, [audioChannel.port1])

	emulator.postMessage({
		portForAudio: audioChannel.port2
	}, [audioChannel.port2])
})

export async function setTapeAudio(audio) {
	const audioBuffer = await audioCtx.decodeAudioData(audio)
	const sampleRate = audioBuffer.sampleRate
	const rawData = audioBuffer.getChannelData(0)

	const pwm = [1]
	for (let i = 0, pp = 0; i < rawData.length; i++) {
		const sample = rawData[i]

		if (sample > 0 && pwm[pp] > 0) {
			pwm[pp] += 3e6 / sampleRate
		}
		if (sample < 0 && pwm[pp] < 0) {
			pwm[pp] -= 3e6 / sampleRate
		}

		if (sample > 0 && pwm[pp] < 0) {
			pwm.push(3e6 / sampleRate)
			pp++
		}
		if (sample < 0 && pwm[pp] > 0) {
			pwm.push(-3e6 / sampleRate)
			pp++
		}
	}

	setTapePwm(pwm)
}

export function setTapePwm(pwm) {
	emulator.postMessage({
		setTapePwm: pwm
	})
}

export function setTapeState({
	ignoringRemote,
	fastForward,
	mode
}) {
	emulator.postMessage({
		ignoreTapeRemoteControl: ignoringRemote,
		tapeFastForward: fastForward,
		setTapeMode: mode
	})
}

export function registerTapeControls(controls) {
	tapeControls = controls
}

export function updateParams({ lpfCutoff, buttCutoff, buttOrder, hpfCutoff, gainVal, ctrls }) {
	if (buzzer) {
		buzzer.parameters.get('firstOrderLpfCutoff').value = lpfCutoff
		buzzer.parameters.get('butterworthCutoff').value = buttCutoff
		buzzer.parameters.get('butterworthOrder').value = buttOrder
		buzzer.parameters.get('firstOrderHpfCutoff').value = hpfCutoff
		buzzer.parameters.get('gain').value = gainVal

		if (clippingListeners.length < 1) {
			clippingListeners = ctrls.map(vc => vc.markInvalid)
		}
	}
}

const joystick = {
	port: 0,
	'ArrowUp': 1024,
	'KeyW': 1024,
	'ArrowLeft': 512,
	'KeyA': 512,
	'ArrowDown': 32,
	'KeyS': 32,
	'ArrowRight': 16,
	'KeyD': 16,
	'Space': 2,
	'KeyQ': 1,
	'MetaLeft': 1,
	'KeyE': 16384,
	'MetaRight': 16384
}

let classicKeyboard = true
export function toggleClassicKeyboard() {
	classicKeyboard ^= true

	emulator.postMessage({
		keyboard: {
			action: 'releaseAll'
		}
	})
}

let nonClassicLayout = false
function ensureLayout(rus, action, fallback) {
	if (rus !== undefined && nonClassicLayout !== rus) {
		emulator.postMessage({
			keyboard: {
				...rus ? bk0010_01['РУС'] : bk0010_01['ЛАТ'],
				action
			}
		})
		if (action === 'open') {
			nonClassicLayout = rus

			emulator.postMessage({
				keyboard: {
					...fallback,
					action: 'close'
				}
			})
			emulator.postMessage({
				keyboard: {
					...fallback,
					action: 'open'
				}
			})
		}
	} else {
		emulator.postMessage({
			keyboard: {
				...fallback,
				action
			}
		})
	}
}

export function directKey0010(code, action) {
	audioCtx.resume()

	const bkKey = bk0010[code]

	emulator.postMessage({
		keyboard: {
			...bkKey,
			action
		}
	})
}

let lastCapsState = null
function keyact(e, action) {
	if (document.activeElement === document.body) {
		if (!e.repeat) {
			if (!classicKeyboard && action === 'close') {
				emulator.postMessage({
					keyboard: {
						action: 'releaseNonCtrl'
					}
				})
			}

			if (overJoystick && joystick[e.code]) {
				if (action === 'open') {
					joystick.port &= ~joystick[e.code]
				}

				if (action === 'close') {
					joystick.port |= joystick[e.code]
				}

				emulator.postMessage({
					ioRegister: joystick.port
				})
			} else if (!classicKeyboard && !e.ctrlKey && !e.altKey && translation[e.key]) {
				const t = translation[e.key]
				ensureLayout(t.rus, action, t.key)
			} else {
				if (!classicKeyboard) {
					if (e.code === 'MetaLeft') {
						nonClassicLayout = true
					} else if (e.code === 'MetaRight') {
						nonClassicLayout = false
					}
				}

				const bkKey = webBk0010_01[e.code]

				const newCapsState = e.getModifierState("CapsLock")
				let setCapital
				if (lastCapsState === null) {
					lastCapsState = newCapsState
				}
				if (lastCapsState !== newCapsState) {
					lastCapsState = newCapsState
					setCapital = newCapsState
				}

				emulator.postMessage({
					keyboard: {
						...bkKey,
						setCapital,
						action
					}
				})
			}
		}

		e.preventDefault()
		e.stopPropagation()
	}
}

document.addEventListener('keydown', e => {
	audioCtx.resume()

	keyact(e, 'close')
})

document.addEventListener('keyup', e => keyact(e, 'open'))

const revive = () => {
	audioCtx.resume()

	emulator.postMessage({
		keyboard: {
			action: 'releaseAll'
		}
	})
}

document.body.onclick = revive
document.body.onfocus = revive
document.body.onblur = () => {
	saveState()
	audioCtx.suspend()
}
