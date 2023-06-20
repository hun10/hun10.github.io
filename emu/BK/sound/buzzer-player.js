class Buzzer extends AudioWorkletProcessor {
    constructor(...args) {
        super(...args)

        const add = (dstBuf, dstIndex, srcBuf, srcIndex) => {
            dstBuf[dstIndex] += srcBuf[srcIndex]
            dstBuf[dstIndex + 1] += srcBuf[srcIndex + 1]
        }
        const addScaled = (dstBuf, dstIndex, srcBuf, srcIndex, scale) => {
            dstBuf[dstIndex] += srcBuf[srcIndex] * scale
            dstBuf[dstIndex + 1] += srcBuf[srcIndex + 1] * scale
        }
        const sub = (dstBuf, dstIndex, srcBuf, srcIndex) => {
            dstBuf[dstIndex] -= srcBuf[srcIndex]
            dstBuf[dstIndex + 1] -= srcBuf[srcIndex + 1]
        }
        const mul = (dstBuf, dstIndex, srcBuf, srcIndex) => {
            const a = dstBuf[dstIndex]
            const bi = dstBuf[dstIndex + 1]
            const c = srcBuf[srcIndex]
            const di = srcBuf[srcIndex + 1]

            dstBuf[dstIndex] = a * c - bi * di
            dstBuf[dstIndex + 1] = a * di + bi * c
        }
        const div = (dstBuf, dstIndex, srcBuf, srcIndex) => {
            const a = dstBuf[dstIndex]
            const bi = dstBuf[dstIndex + 1]
            const c = srcBuf[srcIndex]
            const di = srcBuf[srcIndex + 1]
            const cd = c * c + di * di

            dstBuf[dstIndex] = (a * c + bi * di) / cd
            dstBuf[dstIndex + 1] = (bi * c - a * di) / cd
        }
        const mulByExp = (dstBuf, dstIndex, srcBuf, srcIndex, t) => {
            const eVal = Math.exp(srcBuf[srcIndex] * t)
            const c = eVal * Math.cos(srcBuf[srcIndex + 1] * t)
            const di = eVal * Math.sin(srcBuf[srcIndex + 1] * t)

            const a = dstBuf[dstIndex]
            const bi = dstBuf[dstIndex + 1]

            dstBuf[dstIndex] = a * c - bi * di
            dstBuf[dstIndex + 1] = a * di + bi * c
        }
        const convolve = (srcA, srcK, newK) => {
            const tmp = []
            const dstA = []
            const dstS = [0, 0]
            for (let i = 0; i < srcA.length; i += 2) {
                dstA[i] = tmp[0] = newK[0]
                dstA[i + 1] = tmp[1] = newK[1]

                sub(tmp, 0, srcK, i)
                div(dstA, i, tmp, 0)
                mul(dstA, i, srcA, i)

                add(dstS, 0, dstA, i)
            }
            dstA[srcA.length] = -dstS[0]
            dstA[srcA.length + 1] = -dstS[1]

            return dstA
        }
        const butterworth = (filterOrder, filterFrequency, foLpf, foHpf) => {
            let a = [1, 0]
            const k = [foHpf > 0 ? -foHpf : 0, 0]
            if (foLpf > 0) {
                a = convolve(a, k, [-foLpf, 0])
                k.push(-foLpf)
                k.push(0)
            }
            for (let i = 1; i <= filterOrder; i++) {
                const angle = Math.PI * (2 * i + filterOrder - 1) / (2 * filterOrder)
                const nK = [
                    filterFrequency * Math.cos(angle),
                    filterFrequency * Math.sin(angle),
                ]
                a = convolve(a, k, nK)
                k.push(nK[0])
                k.push(nK[1])
            }
            return { a, k }
        }

        let k, a, state

        const shiftState = dt => {
            for (let i = 0; i < state.length; i += 2) {
                mulByExp(state, i, k, i, dt)
            }
        }
        const addImpulse = amplitude => {
            for (let i = 0; i < state.length; i += 2) {
                addScaled(state, i, a, i, amplitude)
            }
        }

        let nextFrames = []

        let playingBuffer, playingPtr = 0
        let scheduledBuffer
        let buzzerState = false
        let stateTtl = 0

        this.port.onmessage = ({ data: {
            frame
        } }) => {
            if (frame !== undefined) {
                nextFrames.push(frame)
            }
        }

        let lastButterworthCutoff,
            lastButterworthOrder,
            lastFirstOrderLpfCutoff,
            lastFirstOrderHpfCutoff,
            lastGain,
            lastClipped = false

        const clearClipped = () => {
            if (lastClipped) {
                this.port.postMessage({
                    clipped: false
                })
            }
            lastClipped = false
        }
        const setClipped = () => {
            if (!lastClipped) {
                this.port.postMessage({
                    clipped: true
                })
            }
            lastClipped = true
        }

        this.advance = (
            deltaTime,
            butterworthCutoff,
            butterworthOrder,
            firstOrderLpfCutoff,
            firstOrderHpfCutoff,
            gain
        ) => {
            if (lastButterworthCutoff !== butterworthCutoff ||
                lastButterworthOrder !== butterworthOrder ||
                lastFirstOrderLpfCutoff !== firstOrderLpfCutoff ||
                lastFirstOrderHpfCutoff !== firstOrderHpfCutoff ||
                lastGain !== gain
            ) {
                const filter = butterworth(
                    butterworthOrder,
                    2 * Math.PI * butterworthCutoff,
                    2 * Math.PI * firstOrderLpfCutoff,
                    2 * Math.PI * firstOrderHpfCutoff
                )
                k = new Float64Array(filter.k)
                a = new Float64Array(filter.a)
                state = new Float64Array(k.length)

                clearClipped()

                lastButterworthCutoff = butterworthCutoff
                lastButterworthOrder = butterworthOrder
                lastFirstOrderLpfCutoff = firstOrderLpfCutoff
                lastFirstOrderHpfCutoff = firstOrderHpfCutoff
                lastGain = gain
            }

            while (deltaTime > 0) {
                if (scheduledBuffer === undefined) {
                    let remainingTime = stateTtl
                    if (playingBuffer) {
                        for (let i = playingPtr; i < playingBuffer.length; i++) {
                            remainingTime += Math.abs(playingBuffer[i])
                        }
                    }

                    const toSchedule = nextFrames.shift()
                    if (toSchedule) {
                        scheduledBuffer = toSchedule.delta
                        this.port.postMessage({
                            id: toSchedule.id,
                            startTime: currentTime + remainingTime
                        })
                    }
                }

                if (deltaTime > stateTtl) {
                    shiftState(stateTtl)
                    deltaTime -= stateTtl
                    stateTtl = 0

                    if (playingBuffer === undefined) {
                        playingBuffer = scheduledBuffer
                        scheduledBuffer = undefined
                    }

                    if (playingBuffer === undefined) {
                        stateTtl = deltaTime
                    } else {
                        const newBuzzerState = playingBuffer[playingPtr] > 0
                        const newStateTtl = Math.abs(playingBuffer[playingPtr])
                        playingPtr++

                        if (playingPtr >= playingBuffer.length || newStateTtl === 0) {
                            this.port.postMessage({
                                playingBuffer
                            }, [playingBuffer.buffer])

                            playingBuffer = undefined
                            playingPtr = 0
                        }

                        if (newStateTtl > 0) {
                            if (!buzzerState && newBuzzerState) {
                                addImpulse(gain)
                            } else if (buzzerState && !newBuzzerState) {
                                addImpulse(-gain)
                            }
                            buzzerState = newBuzzerState
                            stateTtl = newStateTtl
                        }
                    }
                } else {
                    shiftState(deltaTime)
                    stateTtl -= deltaTime
                    deltaTime = 0
                }
            }

            let sum = 0
            for (let i = 0; i < state.length; i += 2) {
                sum += state[i]
            }
            if (sum > 1) {
                sum = 1
                setClipped()
            }
            if (sum < -1) {
                sum = -1
                setClipped()
            }
            return sum
        }
    }

    process(inputs, outputs, parameters) {
        const channel = outputs[0][0]

        const butterworthCutoff = parameters['butterworthCutoff'][0]
        const butterworthOrder = parameters['butterworthOrder'][0]
        const firstOrderLpfCutoff = parameters['firstOrderLpfCutoff'][0]
        const firstOrderHpfCutoff = parameters['firstOrderHpfCutoff'][0]
        const gain = parameters['gain'][0]

        const sampleLength = 1 / sampleRate
        const advance = this.advance

        for (let i = 0; i < channel.length; i++) {
            channel[i] = advance(
                sampleLength,
                butterworthCutoff,
                butterworthOrder,
                firstOrderLpfCutoff,
                firstOrderHpfCutoff,
                gain
            )
        }

        return true
    }

    static get parameterDescriptors () {
        return [
            {
                name: 'butterworthCutoff',
                defaultValue: 0,
                minValue: 0,
                maxValue: 24000,
                automationRate: 'k-rate'
            },
            {
                name: 'butterworthOrder',
                defaultValue: 0,
                minValue: 0,
                maxValue: 40,
                automationRate: 'k-rate'
            },
            {
                name: 'firstOrderLpfCutoff',
                defaultValue: 0,
                minValue: 0,
                maxValue: 24000,
                automationRate: 'k-rate'
            },
            {
                name: 'firstOrderHpfCutoff',
                defaultValue: 0,
                minValue: 0,
                maxValue: 24000,
                automationRate: 'k-rate'
            },
            {
                name: 'gain',
                defaultValue: 1,
                minValue: 0,
                maxValue: 4,
                automationRate: 'k-rate'
            }
        ]
    }
}

registerProcessor('buzzer', Buzzer)
