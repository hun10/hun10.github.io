import {
    updateParams,
    toggleJoystick,
    mode,
    togglePrinter,
    setTapePwm,
    setTapeState,
    setTapeAudio,
    registerTapeControls,
    returnVideoBuffer,
    setCpuSpeed,
    getVideoFrame,
    saveState,
    loadState,
    directKey0010,
    startMovieRec,
    endMovieRec
} from './BK/BK_MAIN.js'
import { createTapeControls } from './BK/tape-library.js'
import buffersGl from './buffers-gl.js'
import { numericControl, button, binaryControl, selectControl, number } from './controls.js'

button('Toggle Joystick', toggleJoystick)

let blackPadding = false
button('Black Padding', () => {
    const canvas = document.getElementsByTagName('canvas')[0]
    if (!blackPadding) {
        canvas.style.padding = '400px'
        canvas.style.background = 'black'
    } else {
        canvas.style.padding = '27px'
        canvas.style.background = 'black'
    }
    blackPadding = !blackPadding
})

button('Debug', () => mode('DEBUG'))
button('Basic', () => mode('BASIC'))
button('Focal', () => mode('FOCAL'))

button('Toggle Printer', () => togglePrinter())

const aSoundGain = numericControl("Sound Gain", 0, 4, 1e-3, 0.1)
const aSoundHpf = numericControl("Sound HPF Cutoff (0 to turn off)", 20, 5000, 1, 60)
const aSoundFac = numericControl("Sound LPF Cutoff (first order, 0 to turn off)", 0.0, 24000.0, 1, 7444)
const aSoundButtFac = numericControl("Sound LPF Cutoff (Butterworth)", 0.0, 24000.0, 1, 7444)
const aSoundButtOrd = numericControl("Sound LPF Order", 0.0, 40.0, 1, 8)

const heightCtrl = numericControl("Height", 0.5, 3.0, 0.00001, 1.11);
const widthCtrl = numericControl("Width", 0.5, 4.0, 0.00001, 1.54);
const brightCtrl = numericControl("Brightness", -1, 0.5, 0.0001, 0.12);
const contrastCtrl = numericControl("Contrast", 0, 2, 0.0001, 1.5);
const gammaCtrl = numericControl("Gamma", 1, 5, 0.1, 2.8);
const exposureCtrl = numericControl("Exposure", 0.02, 2, 0.0001, 0.64);
const gaussCtrl = numericControl("Gauss Width", 0.001, 0.02, 0.0001, 0.0025);
const gaussCutoffCtrl = numericControl("Gauss Cutoff", 1e-6, 1, 1e-6, 0.007);
const repeatsCtrl = numericControl("Repeats", 1, 500, 1, 31);
const vFilterCtrl = numericControl("Video Signal Filter", 10000, 12e6, 1, 1500000);

let lastVideoParam
const vRgbCtrl = binaryControl('RGB output', false, v => {
    lastVideoParam = null
})

let avFps = 0

selectControl('Animation Smoothing', [
    'None',
    'Video Output Speed-Up Only',
    'Whole Emulation Speed-Up'
], option => {
    const fact = 1000 / avFps * 320 / 15625
    switch (option) {
        case 'None':
            setCpuSpeed(3000000, 1)
            break;
        case 'Video Output Speed-Up Only':
            setCpuSpeed(3000000, fact)
            break;
        case 'Whole Emulation Speed-Up':
            setCpuSpeed(3000000 * fact, 1)
            break;

        default:
            break;
    }
}, 'None')

registerTapeControls(createTapeControls(({ pwm, audio, state }) => {
    if (pwm !== undefined) {
        setTapePwm(pwm)
    }
    if (audio !== undefined) {
        return setTapeAudio(audio)
    }
    if (state !== undefined) {
        setTapeState(state)
    }
}))

const resolution = 1040 / Math.pow(2, 0)
let averageMs = 0.0
let lastT0 = performance.now()

button('Start Rec', () => {
    startMovieRec()
})
button('End Rec', () => {
    const movie = endMovieRec()

    movie.forEach(frame => {
        frame.video = Array.from(frame.video)
        frame.audio = Array.from(frame.audio)
    })
    const blob = new Blob(
        [JSON.stringify(movie)],
        {type: 'application/json'}
    )
    const uri = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = uri
    a.download = 'movie.json'
    a.click()
})

let encodedSignal1, encodedSignal2, encodedBuffer, encodedBuffer2

animateImageData(resolution, resolution * 4 / 5, gl => {
    gl.disable(gl.BLEND)
    gl.disable(gl.CULL_FACE)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.DITHER)
    gl.disable(gl.POLYGON_OFFSET_FILL)
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE)
    gl.disable(gl.SAMPLE_COVERAGE)
    gl.disable(gl.STENCIL_TEST)
    gl.disable(gl.RASTERIZER_DISCARD)
    gl.disable(gl.SCISSOR_TEST)

    const {
        screen,
        doublePixelBuffer,
        pixelBuffer,
        shader
    } = buffersGl(gl)

    encodedSignal1 = pixelBuffer({
        width: 64,
        height: 256
    })
    encodedSignal2 = pixelBuffer({
        width: 64,
        height: 256
    })
    encodedBuffer = new Uint8Array(encodedSignal1.bufferSize)
    encodedBuffer2 = new Uint8Array(encodedSignal2.bufferSize)

    const byteLookup = pixelBuffer({
        width: 8,
        height: 256
    })

    const scanlinesBuffer = doublePixelBuffer({
        width: resolution * 2,
        height: 256,
        filter: gl.LINEAR
    })
    const scanlines = shader(`
        const float PI = ${Math.PI};
        const float ALPHA = 0.14;
        const float INV_ALPHA = 1.0 / ALPHA;
        const float K = 2.0 / (PI * ALPHA);
        const vec2 resolution = vec2(${scanlinesBuffer.width.toFixed(1)}, ${scanlinesBuffer.height.toFixed(1)});
        const vec2 finalRes = vec2(${gl.drawingBufferWidth.toFixed(1)}, ${gl.drawingBufferHeight.toFixed(1)});

        float inv_error_function(float x)
        {
            float y = log(1.0 - x*x);
            float z = K + 0.5 * y;
            return sqrt(sqrt(z*z - y * INV_ALPHA) - z) * sign(x);
        }

        float gaussian_rand( float x )
        {
            return inv_error_function(x*2.0-1.0)*0.5;
        }

        out vec4 outColor;

        uniform sampler2D u_encoded;
        uniform sampler2D u_lookup;
        uniform float u_count;
        uniform float u_gauss;
        uniform float u_brightness;
        uniform float u_contrast;
        uniform float u_gamma;
        uniform float u_width;
        uniform float u_height;
        uniform float u_exp_perbit;

        const vec3 bitsToRgb[8] = vec3[8](
            vec3(0.0, 0.0, 0.0),
            vec3(0.0, 0.0, 1.0),
            vec3(0.0, 1.0, 0.0),
            vec3(0.0, 1.0, 1.0),
            vec3(1.0, 0.0, 0.0),
            vec3(1.0, 0.0, 1.0),
            vec3(1.0, 1.0, 0.0),
            vec3(1.0, 1.0, 1.0)
        );

        vec3 signal(vec2 u) {
            if (u.x < 0.1 || u.x > 1.0) {
                return vec3(0.0);
            }

            u.x -= 0.1;
            u.x /= 0.8;

            vec4 encoded = texelFetch(u_encoded, ivec2(u * vec2(64.0, 256.0)), 0);
            float bitPosition = mod(u.x * 512.0, 8.0);
            vec4 lookup = texelFetch(u_lookup, ivec2(bitPosition, encoded.a * 255.0), 0);
            vec2 exps = exp(u_exp_perbit * vec2(bitPosition, fract(bitPosition)));

            return vec3(encoded.rgb * exps.x
                       + lookup.rgb * exps.y
                       + bitsToRgb[int(lookup.a * 255.0)] * (1.0 - exps.y));
        }

        void main() {
            vec2 speed = vec2(1.0 / 80.0, -1.0 / (288.0 * 96.0)) * vec2(u_width, u_height);
            float factor = 1.0 / length(speed * 40.0);

            float resWidth = finalRes.x / finalRes.y;
            vec2 uv = gl_FragCoord.xy / resolution;
            uv.x -= 0.5;
            uv.x *= resWidth / u_width;

            vec3 s = vec3(0.0);
            for (float i = 0.0; i < u_count; i++) {
                float shift = gaussian_rand( (i + 0.1) / u_count );
                shift *= u_gauss * factor;
                vec2 u = uv + vec2(shift + 0.5, 0.0);
                s += pow(clamp(u_brightness + u_contrast * signal(u) * 0.7, 0.0, 1.0), vec3(u_gamma));
            }
            s *= factor / u_count;

            outColor = dither(s);
        }
    `)

    const finalBuffer = doublePixelBuffer()
    const finalPass = shader(`
        const vec2 scan_res = vec2(${scanlinesBuffer.width.toFixed(1)}, ${scanlinesBuffer.height.toFixed(1)});
        const vec2 resolution = vec2(${finalBuffer.width.toFixed(1)}, ${finalBuffer.height.toFixed(1)});

        out vec4 outColor;

        uniform sampler2D u_scanlines;
        uniform float u_gauss;
        uniform float u_exposure;
        uniform float u_gauss_cutoff;
        uniform float u_width;
        uniform float u_height;

        void main() {
            vec2 uv = gl_FragCoord.xy / resolution.y;
            float resWidth = resolution.x / resolution.y;
            uv.x -= resWidth / 2.0;

            vec2 speed = vec2(1.0 / 80.0, -1.0 / (288.0 * 96.0)) * vec2(u_width, u_height);
            vec2 dir = normalize(speed);

            vec2 nor = vec2(dir.y, -dir.x);
            float d0 = dot(uv - vec2(0.0, 0.5 - u_height * (0.0 + 0.5) / 288.0), nor);
            float di = dot(vec2(0.0, -u_height / 288.0), nor);

            float firstLine = max(-128.0, ceil((d0 - u_gauss_cutoff) / di));
            float lastLine = min(128.0, ceil((d0 + u_gauss_cutoff) / di));

            vec3 s = vec3(0.0);
            for (float i = firstLine; i < lastLine; i++) {
                float y = (i + 0.5) / 288.0;
                
                vec2 dispos = uv - vec2(0.0, 0.5 - u_height * y);

                float len = dot(dispos, dir);
                
                float d = dot(dispos, nor);
                float dp = d * d;
                
                if (d < u_gauss_cutoff) {
                    float xPos = len * dir.x;
                    s += u_exposure * exp(-dp / u_gauss / u_gauss) * texLerp(u_scanlines, vec2(0, 0), scan_res, vec2((xPos / resWidth + 0.5) * scan_res.x, i + 128.5));
                }
            }

            s = fromLinear(s);
            outColor = ditherFinal(s);
        }
    `)

    return {
        byteLookupBuffer: new Uint8ClampedArray(byteLookup.bufferSize),
        rgbTails: new Float64Array(3),
        byteLookup,
        scanlinesBuffer,
        scanlines,
        finalBuffer,
        finalPass,
        screen: screen()
    }
}, (gl, {
    byteLookup,
    byteLookupBuffer,
    rgbTails,
    scanlinesBuffer,
    scanlines,
    finalPass,
    screen
}, info) => {
    const t0 = performance.now()

    const sinceLast = t0 - lastT0
    lastT0 = t0

    {
        const cFpr = sinceLast
        const trust = 0.99
        avFps = avFps * trust + cFpr * (1 - trust)
    }

    const expVideo = -2 * Math.PI * vFilterCtrl.value

    const hasNewFrame = getVideoFrame(frame => {
        for (let i = 0, rawWord; i < encodedSignal2.size; i++) {
            if (i % 2 == 0) {
                rawWord = frame[i / 2]
            } else {
                rawWord >>= 8
            }
            const rawByte = rawWord & 0xFF
    
            if (i % 64 === 0) {
                for (let j = 0; j < 3; j++) {
                    rgbTails[j] = 0
                }
            }
    
            encodedBuffer[i * 4 + 0] = rgbTails[0] * 255
            encodedBuffer[i * 4 + 1] = rgbTails[1] * 255
            encodedBuffer[i * 4 + 2] = rgbTails[2] * 255
            encodedBuffer[i * 4 + 3] = rawByte
    
            for (let j = 0; j < 3; j++) {
                rgbTails[j] *= Math.exp(expVideo * 7 / (15625 * 96 * 8))
                rgbTails[j] += byteLookupBuffer[rawByte * 8 * 4 + 7 * 4 + j] / 255
                rgbTails[j] *= Math.exp(expVideo / (15625 * 96 * 8))
    
                const high = !!(byteLookupBuffer[rawByte * 8 * 4 + 7 * 4 + 3] & (4 >> j))
                if (high) {
                    rgbTails[j] += 1 - Math.exp(expVideo / (15625 * 96 * 8))
                }
            }
        }    
    })

    if (!hasNewFrame) {
        return
    }

    if (lastVideoParam !== vFilterCtrl.value) {
        lastVideoParam = vFilterCtrl.value
        for (let b = 0; b < 256; b++) {
            if (!vRgbCtrl.value) {
                let tail = 0
                for (let i = 0, w = b; i < 8; i++) {
                    const dith = tail * 255
                    byteLookupBuffer[b * 8 * 4 + i * 4 + 0] = dith
                    byteLookupBuffer[b * 8 * 4 + i * 4 + 1] = dith
                    byteLookupBuffer[b * 8 * 4 + i * 4 + 2] = dith
                    byteLookupBuffer[b * 8 * 4 + i * 4 + 3] = (w & 1) * 7

                    tail *= Math.exp(expVideo / (15625 * 96 * 8))
                    if (w & 1) {
                        tail += 1 - Math.exp(expVideo / (15625 * 96 * 8))
                    }

                    w >>= 1
                }
            } else {
                let tailR = 0
                let tailG = 0
                let tailB = 0
                for (let i = 0, w = b; i < 8; i++) {
                    byteLookupBuffer[b * 8 * 4 + i * 4 + 0] = tailR * 255
                    byteLookupBuffer[b * 8 * 4 + i * 4 + 1] = tailG * 255
                    byteLookupBuffer[b * 8 * 4 + i * 4 + 2] = tailB * 255
                    byteLookupBuffer[b * 8 * 4 + i * 4 + 3] = [0b000, 0b001, 0b010, 0b100][w & 3]
                    tailR *= Math.exp(expVideo / (15625 * 96 * 8))
                    tailG *= Math.exp(expVideo / (15625 * 96 * 8))
                    tailB *= Math.exp(expVideo / (15625 * 96 * 8))
                    if ((w & 3) === 3) {
                        tailR += 1 - Math.exp(expVideo / (15625 * 96 * 8))
                    }
                    if ((w & 3) === 2) {
                        tailG += 1 - Math.exp(expVideo / (15625 * 96 * 8))
                    }
                    if ((w & 3) === 1) {
                        tailB += 1 - Math.exp(expVideo / (15625 * 96 * 8))
                    }

                    if (i % 2 === 1) {
                        w >>= 2
                    }
                }
            }
        }
        byteLookup.update(byteLookupBuffer)
    }

    encodedSignal2.update(encodedBuffer)

    const tes2 = encodedBuffer
    encodedBuffer = encodedBuffer2
    encodedBuffer2 = tes2

    returnVideoBuffer()

    scanlines.draw({
        u_encoded: encodedSignal2,
        u_lookup: byteLookup,
        u_count: repeatsCtrl.value,
        u_gauss: gaussCtrl.value,
        u_brightness: brightCtrl.value,
        u_contrast: contrastCtrl.value,
        u_gamma: gammaCtrl.value,
        u_width: widthCtrl.value,
        u_height: heightCtrl.value,
        u_exp_perbit: expVideo / (15625 * 96 * 8)
    }, scanlinesBuffer)

    const tes = encodedSignal1
    encodedSignal1 = encodedSignal2
    encodedSignal2 = tes

    finalPass.draw({
        u_scanlines: scanlinesBuffer,
        u_gauss: gaussCtrl.value,
        u_gauss_cutoff: gaussCutoffCtrl.value,
        u_exposure: exposureCtrl.value,
        u_width: widthCtrl.value,
        u_height: heightCtrl.value
    }, screen)

    const perfNow = performance.now()

    {
        const t1 = perfNow - t0
        const unbiased_diff = Math.abs(averageMs - t1) / Math.max(averageMs, Math.max(t1, 0.2))
        const unbiased_weight = 1.0 - unbiased_diff;
        const unbiased_weight_sqr = unbiased_weight * unbiased_weight;
        const trust = 0.88 * (1 - unbiased_weight_sqr) + 0.97 * unbiased_weight_sqr
        averageMs = averageMs * trust + t1 * (1 - trust)
    }

    info(`${averageMs.toFixed(1)} ms, between frames ${sinceLast.toFixed(1)} ms, average FPS ${(1000 / avFps).toFixed(1)}`)
})

function animateImageData(width, height, init, animator) {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    canvas.style.padding = '27px'
    canvas.style.backgroundColor = 'black'
    canvas.style.float = 'left'

    const gl = canvas.getContext(
        "webgl2",
        {
            depth: false,
            antialias: false
        }
    )

    const ext = init(gl)

    document.body.appendChild(canvas)

    const div = document.createElement("div")
    document.body.appendChild(div)

    function draw(ts) {
        requestAnimationFrame(draw)

        animator(gl, ext, f => div.innerText = f)

        updateParams({
            lpfCutoff: aSoundFac.value,
            buttCutoff: aSoundButtFac.value,
            buttOrder: aSoundButtOrd.value,
            hpfCutoff: aSoundHpf.value,
            gainVal: aSoundGain.value,
            ctrls: [
                aSoundFac,
                aSoundButtFac,
                aSoundButtOrd,
                aSoundHpf,
                aSoundGain
            ]
        })
    }

    draw()
}

const flatKeyboard = document.createElement('div')

const flatKeyboardImg = document.createElement('img')
flatKeyboardImg.src = 'flat_keyboard.png'
flatKeyboardImg.style.width = '100vw'
flatKeyboard.appendChild(flatKeyboardImg)
// flatKeyboard.style.webkitTouchCallout = 'none'
// flatKeyboard.style.webkitUserSelect = 'none'

const flatKeys = [
    [
        'НР', 'СУ', 'СТОП', 'ШАГ', 'ИНД СУ', 'БЛОК РЕД', 'ГРАФ', 'ЗАП', 'СТИР', 'УСТ ТАБ', 'СБР ТАБ', 'КТ', 'ВС', 'СБР', 'ГТ', 'СБРОС ЧАСТИ СТРОКИ'
    ],
    [
        ';', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', 'ВЛЕВО-ВВЕРХ', 'ВВЕРХ', 'ВПРАВО-ВВЕРХ', 'ПОВТ'
    ],
    [
        'Й', 'Ц', 'У', 'К', 'Е', 'Н', 'Г', 'Ш', 'Щ', 'З', 'Х', ':', 'ВЛЕВО', 'В НАЧАЛО', 'ВПРАВО'
    ],
    [
        'Ф', 'Ы', 'В', 'А', 'П', 'Р', 'О', 'Л', 'Д', 'Ж', 'Э', '.', 'ВЛЕВО-ВНИЗ', 'ВНИЗ', 'ВПРАВО-ВНИЗ'
    ],
    [
        'Я', 'Ч', 'С', 'М', 'И', 'Т', 'Ь', 'Б', 'Ю', ',', '/', 'Ъ', 'СДВИЖКА В СТРОКЕ', 'УДАЛЕНИЕ СИМВОЛА', 'РАЗДВИЖКА В СТРОКЕ'
    ],
    [
        'ПР', 'ЗАГЛ', 'РУС', 'РУС', 'ПРОБЕЛ', 'ПРОБЕЛ', 'ПРОБЕЛ', 'ПРОБЕЛ', 'ЛАТ', 'ЛАТ', 'СТР', 'ПР', 'ТАБ', 'ВВОД', 'ВВОД'
    ]
]

function flatKey(offsetX, offsetY) {
    const xStart = 0.021527777777777778
    const xTotal = 0.9791666666666666 - xStart

    const yStart = 0.056140350877192984
    const yTotal = 0.9473684210526315 - yStart

    const x = (offsetX / flatKeyboardImg.clientWidth - xStart) / xTotal
    const y = (offsetY / flatKeyboardImg.clientHeight - yStart) / yTotal

    const column = Math.floor(16 * x)
    const row = Math.floor(6 * y)

    return flatKeys[row][column]
}

flatKeyboard.addEventListener('contextmenu', e => {
    e.preventDefault()
    e.stopPropagation()
})

flatKeyboard.addEventListener('touchstart', e => {
    e.preventDefault()
    e.stopPropagation()
})

const activePointers = {}

flatKeyboard.addEventListener('pointerdown', e => {
    const code = flatKey(e.offsetX, e.offsetY)
    if (code !== undefined) {
        activePointers[e.pointerId] = code
        directKey0010(code, 'close')
    }
    e.preventDefault()
    e.stopPropagation()
})

flatKeyboard.addEventListener('pointerup', e => {
    const code = activePointers[e.pointerId]
    if (code !== undefined) {
        activePointers[e.pointerId] = undefined
        directKey0010(code, 'open')
    }
    e.preventDefault()
    e.stopPropagation()
})

document.body.appendChild(flatKeyboard)
