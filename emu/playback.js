import sampleMovie from './sample-mov.js'

import buffersGl from './buffers-gl.js'
import tony_mc_mapface from './tony_mc_mapface.js'
import { numericControl, button, binaryControl, file } from './controls.js'

const audioCtx = new AudioContext()

let maskIsReset = true

function resetMask() {
    maskIsReset = false
}

const squaresCtrl = binaryControl("New Mode", true, () => {
    resetMask()
})
const bilinearCtrl = binaryControl("Bilinear Pixels", false, () => {
    resetMask()
})
const stochasticCtrl = binaryControl("Stochastic Scanlines", true, () => {
    resetMask()
})
const restirMaxCtrl = numericControl("ReSTIR Max M", 1, 1e6, 1, 1e6)
const pixelDensityCtrl = numericControl("Pixel Density", 1, 16, 0.1, devicePixelRatio)
const aaSigmaCtrl = numericControl("AA Gaussian Sigma", 0, 3, 0.001, 1, resetMask)
const aaSamplesCtrl = numericControl("AA Samples", 1, 64, 1, 1, resetMask)
const heightCtrl = numericControl("Height", 0.5, 3.0, 0.00001, 1.11, resetMask)
const widthCtrl = numericControl("Width", 1.0, 4.0, 0.00001, 1.54, resetMask)
const brightCtrl = numericControl("Brightness", -1, 0.5, 0.0001, 0.12, resetMask)
const contrastCtrl = numericControl("Contrast", 0, 2, 0.0001, 1.3, resetMask)
const gammaCtrl = numericControl("Gamma", 1, 5, 0.1, 2.5, resetMask)
const exposureCtrl = numericControl("Exposure", 0.02, 2, 0.0001, 1, resetMask)
const gaussCtrl = numericControl("Gauss Width", 0.001, 0.0032, 0.0001, 0.0015, resetMask)
const gaussCutoffCtrl = numericControl("Gauss Cutoff", 1e-6, 1, 1e-6, 0.007, resetMask)
const repeatsCtrl = numericControl("Repeats", 1, 500, 1, 31, resetMask)
const vFilterCtrl = numericControl("Video Signal Filter", 10000, 12e6, 1, 1500000, resetMask)

let lastVideoParam
const vRgbCtrl = binaryControl('RGB output', true, v => {
    lastVideoParam = null
    resetMask()
})

const horizDispCtrl = numericControl("RGB separation", 0, 0.01, 1e-4, 0.0012, resetMask)
const vSpacingCtrl = numericControl("Vertical Spacing", 0, 10, 1e-4, 3.3, resetMask)

const magnifierCtrl = numericControl("Magnification", 1, 20, 0.01, 1, resetMask)
const shiftXCtrl = numericControl("Shift X", -1, 1, 1e-4, 0)
const shiftYCtrl = numericControl("Shift Y", -1, 1, 1e-4, 0)

const slotMaskCtrl = binaryControl('Slot Mask', false, resetMask)
const slotPowerCtrl = numericControl('Slot Mask Power', 0, 10, 1e-5, 4, resetMask)
const xMaskCtrl = numericControl('Mask Width', 0, 1, 1e-5, 0.66, resetMask)
const yMaskCtrl = numericControl('Mask Height', 0, 10, 1e-5, 2.9, resetMask)

let avFps = 0

let averageMs = 0.0
let lastT0 = performance.now()

let encodedSignal1, encodedSignal2, encodedBuffer, encodedBuffer2

const movie = {
    frames: [],
    running: false
}
const frameQueue = [], reuseBuffers = []
let nextFrame = 0

function oldFormatInit(storage) {
    movie.frames = []

    const audio = [-61440]
    for (let i = 0; i < storage.length; i += 256 * 32) {
        const video = new Uint16Array(256 * 32)
        video.set(storage.subarray(i, i + 256 * 32))

        movie.frames.push({
            video,
            audio
        })
    }
}
oldFormatInit(new Uint16Array(sampleMovie.storage))

const speedCtrl = numericControl('CPU', 3e6, 3686400, 1, 3e6)
const frameCtrl = numericControl('Frame', 0, movie.frames.length - 1, 1, 0, resetMask)

let buzzer
audioCtx.audioWorklet?.addModule('../sound/buzzer-player.js').then(() => {
    buzzer = new AudioWorkletNode(audioCtx, 'buzzer')

    buzzer.connect(audioCtx.destination)

    buzzer.parameters.get('firstOrderLpfCutoff').value = 7444
    buzzer.parameters.get('butterworthCutoff').value = 7444
    buzzer.parameters.get('butterworthOrder').value = 8
    buzzer.parameters.get('firstOrderHpfCutoff').value = 60
    buzzer.parameters.get('gain').value = 0.1

    buzzer.port.onmessage = ({ data }) => {
        if (data.startTime) {
            frameQueue.push(data)
        }
        if (data.playingBuffer) {
            reuseBuffers.push(data.playingBuffer)
        }
    }
})

function obtainAudioBuffer() {
    let obtained = reuseBuffers.shift()
    if (obtained === undefined) {
        obtained = new Float64Array(61440)
    } else {
        obtained.fill(0)
    }
    return obtained
}

function loadFrameAudio() {
    const frameId = nextFrame
    nextFrame = (nextFrame + 1) % (frameCtrl.getMax() + 1)

    const frame = movie.frames[frameId]
    const audio = obtainAudioBuffer()
    for (let i = 0; i < frame.audio.length; i++) {
        audio[i] = frame.audio[i] / speedCtrl.value
    }

    buzzer.port.postMessage({
        frame: {
            id: frameId,
            delta: audio
        }
    }, [audio.buffer])
}

function playBack() {
    frameCtrl.setValue((frameCtrl.value + frameCtrl.getMax()) % (frameCtrl.getMax() + 1))
}
button('Back', playBack)
async function playPause() {
    await audioCtx.resume()

    movie.running = !movie.running

    if (movie.running) {
        nextFrame = frameCtrl.value
        for (let i = 0; i < 3; i++) {
            loadFrameAudio()
        }
    }
}
button('Play/Pause', playPause)
function playForward() {
    frameCtrl.setValue((frameCtrl.value + 1) % (frameCtrl.getMax() + 1))
}
button('Forward', playForward)

file('Movie', async (file) => {
    if (file.type === 'application/json') {
        const reader = new FileReader()
        reader.onload = () => {
            const result = JSON.parse(reader.result)
            if (Array.isArray(result)) {
                movie.frames = []
                result.forEach(frame => {
                    movie.frames.push({
                        video: new Uint16Array(frame.video),
                        audio: new Int32Array(frame.audio)
                    })
                })
            } else {
                oldFormatInit(new Uint16Array(result.storage))
            }
            nextFrame = 0
            frameCtrl.setMax(movie.frames.length - 1)
            frameCtrl.setValue(0)
        }
        reader.readAsText(file)
    }
})

const prevParams = {
    magnifierCtrlvalue: 0,
    shiftXCtrlvalue: 0,
    shiftYCtrlvalue: 0,
}

const denoiseCtrl = numericControl('Denoising sample count', 1, 1000, 1, 1)
let encoder, frameTtl = 0, frameTs = 0

animateImageData(gl => {
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

    gl.getExtension('EXT_color_buffer_float')
    gl.getExtension('OES_texture_float_linear')

    const {
        screen,
        doublePixelBuffer,
        pixelBuffer,
        shader,
        sampler3D,
        multiOutput
    } = buffersGl(gl)

    const nativeNearestMono = pixelBuffer({
        width: 512 + 2,
        height: 256 + 2,
        filter: gl.NEAREST
    })
    const nativeNearestColor = pixelBuffer({
        width: 256 + 2,
        height: 256 + 2,
        filter: gl.NEAREST
    })
    const nativeLinearMono = pixelBuffer({
        width: 512 + 2,
        height: 256 + 2,
        filter: gl.LINEAR
    })
    const nativeLinearColor = pixelBuffer({
        width: 256 + 2,
        height: 256 + 2,
        filter: gl.LINEAR
    })
    const native = shader(`
        out vec4 outColor;

        uniform float u_color;
        uniform lowp usampler2D u_bytes;

        const vec3 bitsToRgb[4] = vec3[4](
            vec3(0.0, 0.0, 0.0),
            vec3(0.0, 0.0, 1.0),
            vec3(0.0, 1.0, 0.0),
            vec3(1.0, 0.0, 0.0)
        );

        vec3 color(ivec2 p) {
            int b = p.x % 8;
            b /= 2;

            p.x /= 8;
            uint byte = texelFetch(u_bytes, p, 0).r;
            byte >>= b * 2;
            byte %= 4u;

            return bitsToRgb[byte];
        }

        vec3 mono(ivec2 p) {
            int b = p.x % 8;

            p.x /= 8;
            uint byte = texelFetch(u_bytes, p, 0).r;
            byte >>= b;
            byte %= 2u;

            return vec3(byte);
        }

        void main() {
            ivec2 uv = ivec2(gl_FragCoord.xy);

            uv -= 1;

            if (u_color > 0.0) {
                uv.x *= 2;
                outColor.rgb = color(uv);
            } else {
                outColor.rgb = mono(uv);
            }
        }
    `)

    const squaresSignal = pixelBuffer({
        width: 64,
        height: 256,
        format: gl.R8UI,
        access: gl.RED_INTEGER,
        store: gl.UNSIGNED_BYTE
    })
    const squaresSignalBuffer = new Uint8Array(64 * 256)
    const squares = shader(`
        const float PI = ${Math.PI};

        out vec4 outColor;

        uniform lowp sampler2D u_pixels;
        uniform highp sampler2D u_feedback;

        uniform vec2 u_resolution;
        uniform float u_aa_samples;
        uniform float u_aa_sigma;
        uniform float u_magnification;
        uniform vec2 u_shake;
        uniform float u_magnification_prev;
        uniform vec2 u_shake_prev;

        uniform float u_width;
        uniform float u_height;
        uniform float u_brightness;
        uniform float u_contrast;
        uniform float u_gamma;

        uniform highp sampler3D u_tony_mc_mapface;
        uniform float u_exposure;

        vec3 tonemap(vec3 s) {
            s = max(vec3(0), s) * u_exposure;
            vec3 encoded = s / (s + 1.0);

            const float LUT_DIMS = 48.0;
            vec3 uv = encoded * ((LUT_DIMS - 1.0) / LUT_DIMS) + 0.5 / LUT_DIMS;

            return texture(u_tony_mc_mapface, uv).rgb;
        }

        vec4 prevSmpl(vec2 xy) {
            float resWidth = u_resolution.x / u_resolution.y;

            vec2 prevUv = xy / u_resolution.y;
            prevUv.x -= resWidth / 2.0;
            prevUv.y -= 0.5;

            prevUv /= u_magnification;
            prevUv -= u_shake;
            prevUv += u_shake_prev;
            prevUv *= u_magnification_prev;

            prevUv.x += resWidth / 2.0;
            prevUv.y += 0.5;

            prevUv *= u_resolution.y / u_resolution;
            vec2 tooFar = step(0.0, prevUv) * (1.0 - step(1.0, prevUv));
            float tf = tooFar.x * tooFar.y;

            return texture(u_feedback, prevUv) * tf;
        }

        void main() {
            float resWidth = u_resolution.x / u_resolution.y;

            vec3 s = vec3(0);

            for (float i = 0.0; i < u_aa_samples; i++) {
                vec2 aa_shake = vec2(
                    random(vec4(gl_FragCoord.xy, u_seed, 1.0 + i * 2.0)),
                    random(vec4(gl_FragCoord.xy, u_seed, 2.0 + i * 2.0))
                );
                aa_shake = vec2(
                    sqrt(-2.0 * log(aa_shake.x)) * cos(2.0 * PI * aa_shake.y),
                    sqrt(-2.0 * log(aa_shake.x)) * sin(2.0 * PI * aa_shake.y)
                ) * u_aa_sigma;

                vec2 uv = (gl_FragCoord.xy + aa_shake) / u_resolution.y;
                uv.x -= resWidth / 2.0;

                uv.y -= 0.5;
                uv /= u_magnification;
                uv.y += 0.5;
    
                uv -= u_shake;

                uv.y -= 0.5;
                uv.x /= u_width;
                uv.y /= -u_height;
                uv += 0.5;

                s += tonemap(
                    pow(u_brightness + u_contrast * texture(u_pixels, uv).rgb * 0.7, vec3(u_gamma))
                );
            }
            s /= u_aa_samples;

            vec4 f = prevSmpl(gl_FragCoord.xy);
            outColor = vec4((f.rgb * f.a + s) / (f.a + 1.0), f.a + 1.0);
        }
    `)

    const stochastic = shader(`
        const float PI = ${Math.PI};

        layout(location = 0) out vec4 outColor;
        layout(location = 1) out vec4 restirOut;

        uniform lowp sampler2D u_pixels;
        uniform highp sampler2D u_feedback;
        uniform highp sampler2D u_restir_feedback;

        uniform float u_restir_max;

        uniform float u_gauss;
        uniform float u_exp_perbit;

        uniform vec2 u_resolution;
        uniform float u_aa_samples;
        uniform float u_aa_sigma;
        uniform float u_magnification;
        uniform vec2 u_shake;
        uniform float u_magnification_prev;
        uniform vec2 u_shake_prev;

        uniform float u_width;
        uniform float u_height;
        uniform float u_brightness;
        uniform float u_contrast;
        uniform float u_gamma;

        uniform highp sampler3D u_tony_mc_mapface;
        uniform float u_exposure;

        vec3 tonemap(vec3 s) {
            s = max(vec3(0), s) * u_exposure;
            vec3 encoded = s / (s + 1.0);

            const float LUT_DIMS = 48.0;
            vec3 uv = encoded * ((LUT_DIMS - 1.0) / LUT_DIMS) + 0.5 / LUT_DIMS;

            return texture(u_tony_mc_mapface, uv).rgb;
        }

        vec4 prevSmpl(vec2 xy) {
            float resWidth = u_resolution.x / u_resolution.y;

            vec2 prevUv = xy / u_resolution.y;
            prevUv.x -= resWidth / 2.0;
            prevUv.y -= 0.5;

            prevUv /= u_magnification;
            prevUv -= u_shake;
            prevUv += u_shake_prev;
            prevUv *= u_magnification_prev;

            prevUv.x += resWidth / 2.0;
            prevUv.y += 0.5;

            prevUv *= u_resolution.y / u_resolution;
            vec2 tooFar = step(0.0, prevUv) * (1.0 - step(1.0, prevUv));
            float tf = tooFar.x * tooFar.y;

            return texture(u_feedback, prevUv) * tf;
        }

        vec4 prevRestir(vec2 xy) {
            float resWidth = u_resolution.x / u_resolution.y;

            vec2 prevUv = xy / u_resolution.y;
            prevUv.x -= resWidth / 2.0;
            prevUv.y -= 0.5;

            prevUv /= u_magnification;
            prevUv -= u_shake;
            prevUv += u_shake_prev;
            prevUv *= u_magnification_prev;

            prevUv.x += resWidth / 2.0;
            prevUv.y += 0.5;

            prevUv *= u_resolution.y / u_resolution;
            vec2 tooFar = step(0.0, prevUv) * (1.0 - step(1.0, prevUv));
            float tf = tooFar.x * tooFar.y;

            return texture(u_restir_feedback, prevUv) * tf;
        }

        // http://www.burtleburtle.net/bob/c/lookup3.c
        #define rot(x,k) (((x)<<(k)) | ((x)>>(32-(k))))

        #define final(a,b,c) \
        { \
            c ^= b; c -= rot(b,14); \
            a ^= c; a -= rot(c,11); \
            b ^= a; b -= rot(a,25); \
            c ^= b; c -= rot(b,16); \
            a ^= c; a -= rot(c,4);  \
            b ^= a; b -= rot(a,14); \
            c ^= b; c -= rot(b,24); \
        }

        uint hash2(uvec2 v, uint initval) {
            uvec3 i = uvec3(0xdeadbeefu + (2u<<2u) + initval);

            i.xy += v;
            final(i.x, i.y, i.z);
            return i.z;
        }
        uint hash0(uint initval) {
            uvec3 i = uvec3(0xdeadbeefu + (0u<<2u) + initval);

            final(i.x, i.y, i.z);
            return i.z;
        }

        uint rnd_seed;

        float rnd_uniform() {
            rnd_seed = hash0(rnd_seed);
            return floatConstruct(rnd_seed);
        }

        vec2 rnd_normal() {
            vec2 s;
            float bigS = 2.0;

            while (bigS >= 1.0) {
                s = vec2(
                    rnd_uniform(),
                    rnd_uniform()
                );
                bigS = dot(s, s);
            }

            if (rnd_uniform() < 0.5) {
                s.x = -s.x;
            }
            if (rnd_uniform() < 0.5) {
                s.y = -s.y;
            }

            return sqrt(-2.0 * log(bigS) / bigS) * s;
        }

        vec2 rnd_vars() {
            float i_r = rnd_uniform() * 258.0;
            return vec2(
                fract(i_r),
                (floor(i_r) + 0.5) / 258.0
            );
        }

        vec2 rnd_vars(uint seed) {
            uint prev_seed = rnd_seed;

            rnd_seed = seed;
            vec2 s_s = rnd_vars();
            rnd_seed = prev_seed;

            return s_s;
        }

        uint big_Seed = 0u;
        float big_W = 0.0;
        float big_P = 0.0;
        float big_M = 0.0;
        float w_sum = 0.0;

        vec2 targetP(vec2 uv, vec2 s_s) {
            vec2 b_p = (s_s - 0.5) * vec2(
                u_width,
                -u_height
            );
            b_p -= uv;

            b_p /= u_gauss;
            float sub_integral = exp(-dot(b_p, b_p) * 0.5) / u_gauss / u_gauss / 2.0 / PI * 0.0027;

            // float g = u_gauss;
            // float sub_integral = (g*g / (g*g + dot(b_p, b_p))) * 100.0;

            return vec2(
                sub_integral * 258.0,
                sub_integral
            );
        }

        void combine(uint seed, float m, float ww, float p, vec2 uv) {
            vec2 s_s = rnd_vars(seed);
            vec2 g = targetP(uv, s_s);
            float w = p == 0.0 ? 0.0 : ww * m * g.y / p;

            w_sum += w;
            if (rnd_uniform() < w / w_sum) {
                big_Seed = seed;
                big_P = g.y;
            }

            big_M += m;
            big_W = w_sum / big_M;
        }

        void main() {
            uvec3 g_seed = floatBitsToUint(vec3(gl_FragCoord.xy, u_seed));
            rnd_seed = hash2(g_seed.xy, g_seed.z);

            vec2 uv = (gl_FragCoord.xy + rnd_normal() * u_aa_sigma) / u_resolution.y;
            float resWidth = u_resolution.x / u_resolution.y;
            uv.x -= resWidth / 2.0;

            uv.y -= 0.5;
            uv /= u_magnification;
            uv.y += 0.5;

            uv -= u_shake;
            uv.y -= 0.5;

            vec2 s_s;
            const float M = 16.0;
            for (float i = 0.0; i < M; i++) {
                uint seed = rnd_seed;

                s_s = rnd_vars();
                vec2 g = targetP(uv, s_s);

                w_sum += g.x;
                if (rnd_uniform() < g.x / w_sum) {
                    big_Seed = seed;
                    big_P = g.y;
                }
            }
            big_M = M;
            big_W = w_sum / big_M;

            vec4 restirIn = prevRestir(gl_FragCoord.xy);
            combine(floatBitsToUint(restirIn.x), restirIn.y, restirIn.z, restirIn.w, uv);

            s_s = rnd_vars(big_Seed);
            vec4 sig_t;
            vec2 sig_s;

            sig_s = vec2(
                s_s.x + log(1.0 - rnd_uniform()) / u_exp_perbit,
                s_s.y
            );
            sig_t = texture(u_pixels, sig_s);
            vec3 signal = u_brightness + u_contrast * 0.7 * sig_t.rgb;

            sig_s = vec2(
                s_s.x + log(1.0 - rnd_uniform()) / u_exp_perbit,
                s_s.y
            );
            sig_t = texture(u_pixels, sig_s);
            signal *= u_brightness + u_contrast * 0.7 * sig_t.rgb; // gamma = 2.0

            vec3 s = signal * big_W;

            vec4 f = prevSmpl(gl_FragCoord.xy) * 0.0;

            outColor = vec4((f.rgb * f.a + s) / (f.a + 1.0), f.a + 1.0);
            restirOut = vec4(uintBitsToFloat(big_Seed), min(big_M, u_restir_max), big_W, big_P);
        }
    `)

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
        width: 2048,
        height: 256,
        filter: gl.LINEAR,
        format: gl.RGBA32F,
        access: gl.RGBA,
        store: gl.FLOAT
    })
    const scanlines = shader(`
        const float PI = ${Math.PI};
        const float ALPHA = 0.14;
        const float INV_ALPHA = 1.0 / ALPHA;
        const float K = 2.0 / (PI * ALPHA);
        const vec2 resolution = vec2(${scanlinesBuffer.width.toFixed(1)}, ${scanlinesBuffer.height.toFixed(1)});

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

        out vec3 outColor;

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
        uniform float u_aspect;

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

            vec2 uv = gl_FragCoord.xy / resolution;
            uv.x -= 0.5;
            uv.x *= u_aspect / u_width;

            vec3 s = vec3(0.0);
            for (float i = 0.0; i < u_count; i++) {
                float shift = gaussian_rand( (i + 0.1) / u_count );
                shift *= u_gauss * factor * sqrt(2.0);
                vec2 u = uv + vec2(shift + 0.5, 0.0);
                s += pow(u_brightness + u_contrast * signal(u) * 0.7, vec3(u_gamma));
            }
            s *= factor / u_count / u_gauss / sqrt(2.0 * PI) * 0.0017;

            outColor = s;
        }
    `)

    const finalBuffer = doublePixelBuffer({
        filter: gl.LINEAR,
        format: gl.RGBA32F,
        access: gl.RGBA,
        store: gl.FLOAT
    })
    const finalPass = shader(`
        const vec2 scan_res = vec2(${scanlinesBuffer.width.toFixed(1)}, ${scanlinesBuffer.height.toFixed(1)});
        const float PI = ${Math.PI};

        out vec4 outColor;

        precision highp sampler2D;
        uniform sampler2D u_scanlines;

        uniform sampler2D u_feedback;

        uniform vec2 u_resolution;

        uniform float u_gauss;
        uniform float u_gauss_cutoff;
        uniform float u_width;
        uniform float u_height;

        uniform float u_horiz_disp;
        uniform float u_slot_mask;
        uniform float u_slot_power;
        uniform vec2 u_mask_size;
        uniform float u_v_spacing;

        uniform vec2 u_shake;
        uniform float u_magnification;
        uniform vec2 u_shake_prev;
        uniform float u_magnification_prev;

        uniform float u_aa_sigma;
        uniform float u_aa_samples;

        float mask(int c, vec2 uv) {
            float xDiv = float(c - 1) * u_horiz_disp;

            float hps = mod(uv.x + u_horiz_disp / 2.0 - xDiv, u_horiz_disp * 3.0);
            float xMask = 1.0 - step(u_mask_size.x * u_horiz_disp, hps);

            float vFact = u_v_spacing;
            float sps = mod(uv.x + u_horiz_disp / 2.0 - xDiv, u_horiz_disp * 6.0);
            float vps = mod(uv.y + step(u_horiz_disp * 3.0, sps) * vFact / 2.0 * u_horiz_disp, vFact * u_horiz_disp);
            float yMask = 1.0 - step(u_mask_size.y * u_horiz_disp, vps);

            float xDist = 1.0 - abs(hps / (u_mask_size.x * u_horiz_disp) * 2.0 - 1.0);
            float yDist = 1.0 - abs(vps / (u_mask_size.y * u_horiz_disp) * 2.0 - 1.0);
            float body = step(1.0, yDist * u_mask_size.y / u_mask_size.x);
            vec2 rd = vec2(1.0 - xDist, 1.0 - yDist * u_mask_size.y / u_mask_size.x);
            float caps = (1.0 - body) * (1.0 - step(1.0, dot(rd, rd)));

            return xMask * yMask * (body + caps);
        }

        vec3 smpl(vec2 xy, float iter) {
            float resWidth = u_resolution.x / u_resolution.y;

            vec3 msk = vec3(1);
            int c = 1;

            vec2 aa_shake = vec2(
                random(vec4(xy, u_seed, 1.0 + iter * 2.0)),
                random(vec4(xy, u_seed, 2.0 + iter * 2.0))
            );
            aa_shake = vec2(
                sqrt(-2.0 * log(aa_shake.x)) * cos(2.0 * PI * aa_shake.y),
                sqrt(-2.0 * log(aa_shake.x)) * sin(2.0 * PI * aa_shake.y)
            ) * u_aa_sigma;

            vec2 uv = (xy + aa_shake) / u_resolution.y;
            uv.x -= resWidth / 2.0;

            uv.y -= 0.5;
            uv /= u_magnification;
            uv.y += 0.5;

            if (u_slot_mask > 0.0) {
                float hps = mod(uv.x - u_shake.x + 3.0 * u_horiz_disp / 2.0, u_horiz_disp * 3.0);
                hps /= u_horiz_disp;
                hps = floor(hps);
                c = int(hps);

                float sampleW = mask(c, uv - u_shake);
                msk = vec3(0);
                msk[c] = sampleW * u_slot_power;
            }

            vec2 speed = vec2(1.0 / 80.0, -1.0 / (288.0 * 96.0)) * vec2(u_width, u_height);
            vec2 dir = normalize(speed);
            
            vec2 nor = vec2(dir.y, -dir.x);
            float d0 = dot(uv - vec2(0.0, 0.5 - u_height * (0.0 + 0.5) / 288.0) - u_shake, nor);
            float di = dot(vec2(0.0, -u_height / 288.0), nor);

            float firstLine = max(-128.0, ceil((d0 - u_gauss_cutoff) / di));
            float lastLine = min(128.0, ceil((d0 + u_gauss_cutoff) / di));

            vec3 s = vec3(0.0);
            for (float i = firstLine; i < lastLine; i++) {
                float y = (i + 0.5) / 288.0;
                float xDiv = float(c - 1) * u_horiz_disp;
                
                vec2 dispos = uv - vec2(xDiv, 0.5 - u_height * y) - u_shake;

                float len = dot(dispos, dir);

                float d = dot(dispos, nor);
                float dp = d * d;

                if (d < u_gauss_cutoff) {
                    float xPos = len * dir.x;
                    vec3 sig = texture(u_scanlines, vec2((xPos / resWidth + 0.5), (i + 128.5) / 256.0)).rgb;
                    s += exp(-dp / u_gauss / u_gauss * 0.5) * sig * msk;
                }
            }

            return s;
        }

        vec4 prevSmpl(vec2 xy) {
            float resWidth = u_resolution.x / u_resolution.y;

            vec2 prevUv = xy / u_resolution.y;
            prevUv.x -= resWidth / 2.0;
            prevUv.y -= 0.5;

            prevUv /= u_magnification;
            prevUv -= u_shake;
            prevUv += u_shake_prev;
            prevUv *= u_magnification_prev;

            prevUv.x += resWidth / 2.0;
            prevUv.y += 0.5;

            prevUv *= u_resolution.y / u_resolution;
            vec2 tooFar = step(0.0, prevUv) * (1.0 - step(1.0, prevUv));
            float tf = tooFar.x * tooFar.y;

            return texture(u_feedback, prevUv) * tf;
        }

        precision highp sampler3D;
        uniform sampler3D u_tony_mc_mapface;

        uniform float u_exposure;

        vec3 tonemap(vec3 s) {
            s = max(vec3(0), s) * u_exposure;
            vec3 encoded = s / (s + 1.0);

            const float LUT_DIMS = 48.0;
            vec3 uv = encoded * ((LUT_DIMS - 1.0) / LUT_DIMS) + 0.5 / LUT_DIMS;

            return texture(u_tony_mc_mapface, uv).rgb;
        }

        vec3 smpl(vec2 xy) {
            vec3 result = vec3(0);
            for (float i = 0.0; i < u_aa_samples; i++) {
                result += tonemap(smpl(xy, i));
            }
            return result / u_aa_samples;
        }

        void main() {
            vec3 s = smpl(gl_FragCoord.xy);
            vec4 f = prevSmpl(gl_FragCoord.xy);

            outColor = vec4((f.rgb * f.a + s) / (f.a + 1.0), f.a + 1.0);
        }
    `)

    const restirBuffer = doublePixelBuffer({
        filter: gl.NEAREST,
        format: gl.RGBA32F,
        access: gl.RGBA,
        store: gl.FLOAT
    })
    const finalOut = multiOutput(finalBuffer, restirBuffer)

    const tonemapBuffer = sampler3D({
        width: 48,
        height: 48,
        depth: 48,
        filter: gl.LINEAR,
        format: gl.RGBA32F,
        access: gl.RGBA,
        store: gl.FLOAT
    })
    tonemapBuffer.update(tony_mc_mapface)

    const toDitheredSrgb = shader(`
        out vec4 outColor;

        precision highp sampler2D;
        uniform sampler2D u_source;

        void main() {
            vec3 s = texelFetch(u_source, ivec2(gl_FragCoord.xy), 0).rgb;

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
        finalPass,
        finalBuffer,
        toDitheredSrgb,
        tonemapBuffer,
        squaresSignal,
        squaresSignalBuffer,
        stochastic,
        squares,
        native,
        nativeLinearMono,
        nativeNearestMono,
        nativeLinearColor,
        nativeNearestColor,
        finalOut,
        restirBuffer,
        screen: screen
    }
}, (gl, {
    byteLookup,
    byteLookupBuffer,
    rgbTails,
    scanlinesBuffer,
    scanlines,
    finalPass,
    finalBuffer,
    toDitheredSrgb,
    tonemapBuffer,
    squaresSignal,
    squaresSignalBuffer,
    squares,
    stochastic,
    native,
    nativeLinearMono,
    nativeNearestMono,
    nativeLinearColor,
    nativeNearestColor,
    finalOut,
    restirBuffer,
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

    if (squaresCtrl.value) {
        for (let i = 0, rawWord; i < squaresSignalBuffer.length; i++) {
            if (i % 2 == 0) {
                rawWord = movie.frames[frameCtrl.value].video[Math.floor(i / 2)]
            } else {
                rawWord >>= 8
            }
            const rawByte = rawWord & 0xFF

            squaresSignalBuffer[i] = rawByte
        }
        squaresSignal.update(squaresSignalBuffer)

        let nativeDrawer
        if (vRgbCtrl.value) {
            if (bilinearCtrl.value) {
                nativeDrawer = nativeLinearColor
            } else {
                nativeDrawer = nativeNearestColor
            }
        } else {
            if (bilinearCtrl.value) {
                nativeDrawer = nativeLinearMono
            } else {
                nativeDrawer = nativeNearestMono
            }
        }

        finalBuffer.resize()
        restirBuffer.resize()

        if (stochasticCtrl.value) {
            native.draw({
                u_bytes: squaresSignal,
                u_color: vRgbCtrl.value ? 1.0 : 0.0,
            }, vRgbCtrl.value ? nativeNearestColor : nativeNearestMono, {
                x: 1, y: 1,
                width: vRgbCtrl.value ? 256 : 512, height: 256
            })

            stochastic.draw({
                u_pixels: vRgbCtrl.value ? nativeNearestColor : nativeNearestMono,
                u_resolution: [gl.drawingBufferWidth, gl.drawingBufferHeight],

                u_exp_perbit: 2 * Math.PI * vFilterCtrl.value / (15625 * 96 * 8) * 512,
                u_gauss: gaussCtrl.value,

                u_width: widthCtrl.value,
                u_height: heightCtrl.value,
                u_brightness: brightCtrl.value,
                u_contrast: contrastCtrl.value,
                u_gamma: gammaCtrl.value,

                u_magnification: magnifierCtrl.value,
                u_shake: [shiftXCtrl.value, shiftYCtrl.value],
                u_magnification_prev: prevParams.magnifierCtrlvalue,
                u_shake_prev: [prevParams.shiftXCtrlvalue, prevParams.shiftYCtrlvalue],
                u_mask_size: [xMaskCtrl.value, yMaskCtrl.value],
                u_feedback: finalBuffer,

                u_restir_feedback: restirBuffer,
                u_restir_max: restirMaxCtrl.value,

                u_aa_sigma: aaSigmaCtrl.value,
                u_aa_samples: aaSamplesCtrl.value,

                u_tony_mc_mapface: tonemapBuffer,
                u_source: finalBuffer,
                u_exposure: exposureCtrl.value,

                u_width: widthCtrl.value * 0.8 * (vRgbCtrl.value ? 258 / 256 : 514 / 512),
                u_height: heightCtrl.value * (256 / 288) * (258 / 256),
            }, finalOut)
        } else {
            if (!maskIsReset) {
                finalBuffer.update(null)
                restirBuffer.update(null)
                maskIsReset = true
            }

            native.draw({
                u_bytes: squaresSignal,
                u_color: vRgbCtrl.value ? 1.0 : 0.0,
            }, nativeDrawer, {
                x: 1, y: 1,
                width: vRgbCtrl.value ? 256 : 512, height: 256
            })

            squares.draw({
                u_pixels: nativeDrawer,
                u_resolution: [gl.drawingBufferWidth, gl.drawingBufferHeight],

                u_width: widthCtrl.value,
                u_height: heightCtrl.value,
                u_brightness: brightCtrl.value,
                u_contrast: contrastCtrl.value,
                u_gamma: gammaCtrl.value,

                u_magnification: magnifierCtrl.value,
                u_shake: [shiftXCtrl.value, shiftYCtrl.value],
                u_magnification_prev: prevParams.magnifierCtrlvalue,
                u_shake_prev: [prevParams.shiftXCtrlvalue, prevParams.shiftYCtrlvalue],
                u_mask_size: [xMaskCtrl.value, yMaskCtrl.value],
                u_feedback: finalBuffer,

                u_aa_sigma: aaSigmaCtrl.value,
                u_aa_samples: aaSamplesCtrl.value,

                u_tony_mc_mapface: tonemapBuffer,
                u_source: finalBuffer,
                u_exposure: exposureCtrl.value,

                u_width: widthCtrl.value * 0.8 * (vRgbCtrl.value ? 258 / 256 : 514 / 512),
                u_height: heightCtrl.value * (256 / 288) * (258 / 256),
            }, finalBuffer)
            restirBuffer.swap()
        }
    } else {
        const expVideo = -2 * Math.PI * vFilterCtrl.value

        {
            for (let i = 0, rawWord; i < encodedSignal2.size; i++) {
                if (i % 2 == 0) {
                    rawWord = movie.frames[frameCtrl.value].video[Math.floor(i / 2)]
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
            u_exp_perbit: expVideo / (15625 * 96 * 8),
            u_aspect: gl.drawingBufferWidth / gl.drawingBufferHeight
        }, scanlinesBuffer)

        const tes = encodedSignal1
        encodedSignal1 = encodedSignal2
        encodedSignal2 = tes

        if (!maskIsReset) {
            finalBuffer.update(null)
            restirBuffer.update(null)
            maskIsReset = true
        }

        finalBuffer.resize()
        restirBuffer.resize()
        finalPass.draw({
            u_resolution: [gl.drawingBufferWidth, gl.drawingBufferHeight],
            u_scanlines: scanlinesBuffer,
            u_gauss: gaussCtrl.value,
            u_gauss_cutoff: gaussCutoffCtrl.value,
            u_width: widthCtrl.value,
            u_height: heightCtrl.value,
            u_horiz_disp: horizDispCtrl.value,
            u_slot_mask: slotMaskCtrl.value ? 1.0 : 0.0,
            u_slot_power: slotPowerCtrl.value,
            u_magnification: magnifierCtrl.value,
            u_shake: [shiftXCtrl.value, shiftYCtrl.value],
            u_magnification_prev: prevParams.magnifierCtrlvalue,
            u_shake_prev: [prevParams.shiftXCtrlvalue, prevParams.shiftYCtrlvalue],
            u_mask_size: [xMaskCtrl.value, yMaskCtrl.value],
            u_v_spacing: vSpacingCtrl.value,
            u_feedback: finalBuffer,

            u_aa_sigma: aaSigmaCtrl.value,
            u_aa_samples: aaSamplesCtrl.value,

            u_tony_mc_mapface: tonemapBuffer,
            u_source: finalBuffer,
            u_exposure: exposureCtrl.value,
        }, finalBuffer)
        restirBuffer.swap()

    }

    prevParams.magnifierCtrlvalue = magnifierCtrl.value
    prevParams.shiftXCtrlvalue = shiftXCtrl.value
    prevParams.shiftYCtrlvalue = shiftYCtrl.value

    toDitheredSrgb.draw({
        u_source: finalBuffer,
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

function animateImageData(init, animator) {
    const canvas = document.createElement("canvas")
    canvas.style = 'width: 100%; height: 100vh'

    canvas.onwheel = e => {
        e.preventDefault()
        if (e.ctrlKey) {
            let x = (e.offsetX - 0.5 * canvas.clientWidth) / canvas.clientHeight
            let y = e.offsetY / canvas.clientHeight - 0.5

            shiftXCtrl.setValue(shiftXCtrl.value - x / magnifierCtrl.value)
            shiftYCtrl.setValue(shiftYCtrl.value + y / magnifierCtrl.value)

            magnifierCtrl.setValue(magnifierCtrl.value * (1 - e.deltaY * 1e-2))

            shiftXCtrl.setValue(shiftXCtrl.value + x / magnifierCtrl.value)
            shiftYCtrl.setValue(shiftYCtrl.value - y / magnifierCtrl.value)
        } else {
            shiftXCtrl.setValue(shiftXCtrl.value - e.deltaX / canvas.clientHeight / magnifierCtrl.value)
            shiftYCtrl.setValue(shiftYCtrl.value + e.deltaY / canvas.clientHeight / magnifierCtrl.value)
        }
    }

    let byteChunks = []
    let audioSampler

    document.addEventListener('keydown', e => {
        if (e.code === 'KeyZ') {
            magnifierCtrl.setValue(1)
            shiftXCtrl.setValue(0)
            shiftYCtrl.setValue(0)
        } else if (e.code === 'KeyC') {
            vRgbCtrl.toggle()
        } else if (e.code === 'KeyS') {
            slotMaskCtrl.toggle()
        } else if (e.code === 'KeyB') {
            bilinearCtrl.toggle()
        } else if (e.code === 'KeyP') {
            squaresCtrl.toggle()
        } else if (e.code === 'KeyR') {
            stochasticCtrl.toggle()
        } else if (e.code === 'Space') {
            e.preventDefault()
            playPause()
        } else if (e.code === 'BracketLeft') {
            playBack()
        } else if (e.code === 'BracketRight') {
            playForward()
        } else if (e.code === 'KeyN') {
            audioSampler = createSampler({
                firstOrderHpfCutoff: 0,
                firstOrderLpfCutoff: 7444,
                gain: 0.1
            })

            frameTtl = denoiseCtrl.value
            frameTs = 0
            byteChunks = []
            encoder = new VideoEncoder({
                output: chunk => {
                    const chunkData = new Uint8Array(chunk.byteLength)
                    chunk.copyTo(chunkData)
                    byteChunks.push(chunkData)
                },
                error: (e) => {
                    console.log(e.message)
                }
            })
            encoder.configure({
                codec: "vp09.00.61.08",
                width: canvas.width,
                height: canvas.height,
                bitrate: 150_000_000,
                framerate: 25 * 25 * 25 / 320
            })
        } else if (e.code === 'KeyA') {
            if (audioSampler) {
                const targetHz = 3_000_000 / 8
                const audioFrames = []

                const singleFloat = new Float32Array(1)
                const floatBytes = new Uint8Array(singleFloat.buffer)

                while (true) {
                    const a = audioSampler.moveAndSample(1 / targetHz)
                    if (a === null) break;

                    singleFloat[0] = a

                    audioFrames.push(floatBytes[0])
                    audioFrames.push(floatBytes[1])
                    audioFrames.push(floatBytes[2])
                    audioFrames.push(floatBytes[3])
                }

                audioSampler = null

                const blob = new Blob([toWavFile(audioFrames, targetHz, 32)])
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'audio.wav'
                a.click()
            }
        } else if (e.code === 'KeyD') {
            if (encoder) {
                encoder.close()
                encoder = undefined

                let total = 32
                for (let i = 0; i < byteChunks.length; i++) {
                    total += byteChunks[i].length + 12
                }

                const stream = new Uint8Array(total)
                let offset = 0
                function write(data) {
                    stream.set(data, offset)
                    offset += data.length
                }
                function fourCC(txt) {
                    const res = new Uint8Array(4)
                    for (let i = 0; i < 4; i++) {
                        res[i] = txt.charCodeAt(i)
                    }
                    write(res)
                }
                function number(size, num) {
                    const res = new Uint8Array(size)
                    for (let i = 0; i < size; i++) {
                        res[i] = num & 0xFF
                        num = num >> 8
                    }
                    write(res)
                }

                fourCC('DKIF')
                number(2, 0)                 // version
                number(2, 32)                // header length
                fourCC('VP90')
                number(2, canvas.width)
                number(2, canvas.height)
                number(4, 25 * 25 * 25)                // time step denominator
                number(4, 320)                 // time step numerator
                number(4, byteChunks.length) // number of frames
                number(4, 0)                 // unused
                for (let i = 0; i < byteChunks.length; i++) {
                    number(4, byteChunks[i].length)
                    number(8, i)
                    write(byteChunks[i])
                }

                const blob = new Blob([stream])
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'video.ivf'
                a.click()
            }
        } else if (e.code === 'KeyV') {
            if (encoder) {
                const frameFromCanvas = new VideoFrame(canvas, {
                    timestamp: frameTs,
                    duration: 20480
                })
                frameTs += frameFromCanvas.duration
                encoder.encode(frameFromCanvas, { keyFrame: true })
                frameFromCanvas.close()
            }
        }
    })

    const gl = canvas.getContext(
        "webgl2",
        {
            depth: false,
            antialias: false,
            preserveDrawingBuffer: true
        }
    )

    const ext = init(gl)

    document.body.appendChild(canvas)

    const div = document.createElement("div")
    document.body.appendChild(div)

    function draw(ts) {
        requestAnimationFrame(draw)

        const desiredWidth = Math.ceil(canvas.clientWidth * pixelDensityCtrl.value)
        const desiredHeight = Math.ceil(canvas.clientHeight * pixelDensityCtrl.value)

        if (desiredWidth !== canvas.width || desiredHeight !== canvas.height) {
            canvas.width = desiredWidth
            canvas.height = desiredHeight
        }

        if (encoder && movie.running) {
            if (frameTtl <= 0) {
                const srcAudio = movie.frames[frameCtrl.value].audio
                audioSampler?.enqueue(new Float64Array(srcAudio).map(s => s / speedCtrl.value))

                frameTtl = denoiseCtrl.value

                const frameFromCanvas = new VideoFrame(canvas, {
                    timestamp: frameTs,
                    duration: 20480
                })
                frameTs += frameFromCanvas.duration
                encoder.encode(frameFromCanvas, { keyFrame: frameFromCanvas.timestamp === 0 })
                frameFromCanvas.close()

                let newFrameId = frameCtrl.value
                newFrameId = (newFrameId + 1) % (frameCtrl.getMax() + 1)
                frameCtrl.setValue(newFrameId)
            } else {
                frameTtl -= 1
            }
        } else {
            let skipCount = 0
            let newFrameId = frameCtrl.value
            while (frameQueue.length > 0 && frameQueue[0].startTime <= audioCtx.currentTime) {
                newFrameId = frameQueue[0].id
                frameQueue.shift()
                skipCount++
            }
            frameCtrl.setValue(newFrameId)

            if (movie.running) {
                for (let i = 0; i < skipCount; i++) {
                    loadFrameAudio()
                }
            }
        }

        animator(gl, ext, f => div.innerText = `${canvas.width} x ${canvas.height}, ${f}`)
    }

    draw()
}

function createSampler({
    firstOrderHpfCutoff,
    firstOrderLpfCutoff,
    gain
}) {
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
    const basicFilter = (foHpf, foLpf) => {
        let a = [1, 0]
        const k = [foHpf > 0 ? -foHpf : 0, 0]
        if (foLpf > 0) {
            a = convolve(a, k, [-foLpf, 0])
            k.push(-foLpf)
            k.push(0)
        }
        return { a, k }
    }

    const filter = basicFilter(
        2 * Math.PI * firstOrderHpfCutoff,
        2 * Math.PI * firstOrderLpfCutoff
    )

    let k = new Float64Array(filter.k)
    let a = new Float64Array(filter.a)
    let state = new Float64Array(k.length)

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
    let buzzerState = false
    let stateTtl = 0

    return {
        enqueue: delta => {
            nextFrames.push(delta)
        },
        moveAndSample: deltaTime => {
            if (playingBuffer === undefined && nextFrames.length === 0) {
                return null
            }

            while (deltaTime > 0) {
                if (deltaTime > stateTtl) {
                    shiftState(stateTtl)
                    deltaTime -= stateTtl
                    stateTtl = 0

                    if (playingBuffer === undefined) {
                        playingBuffer = nextFrames.shift()
                    }

                    if (playingBuffer === undefined) {
                        stateTtl = deltaTime
                    } else {
                        const newBuzzerState = playingBuffer[playingPtr] > 0
                        const newStateTtl = Math.abs(playingBuffer[playingPtr])
                        playingPtr++

                        if (playingPtr >= playingBuffer.length || newStateTtl === 0) {
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
            return sum
        }
    }
}

function toWavFile(soundBytes, sampleRate, bitsPerSample) {
    var channelCount = 1;
    var subChunk1Size = 16;
    var subChunk2Size = soundBytes.length;
    var chunkSize = 4 + (8 + subChunk1Size) + (8 + subChunk2Size);
    var blockAlign = channelCount * (bitsPerSample / 8);
    var byteRate = sampleRate * blockAlign;
    var data = [
        82, 73, 70, 70,               // "RIFF" in ASCII
        chunkSize & 0xff,             // Chunk Size
        (chunkSize >> 8) & 0xff,
        (chunkSize >> 16) & 0xff,
        (chunkSize >> 24) & 0xff,
        87, 65, 86, 69,               // "WAVE" in ASCII
        102, 109, 116, 32,            // "fmt " in ASCII
        subChunk1Size, 0, 0, 0,       // Sub chunk 1 size (always 16)
        3, 0,                         // Audio format (1 == PCM, 3 = WAVE_FORMAT_IEEE_FLOAT)
        channelCount & 0xff,          // Number Channels
        (channelCount >> 8) & 0xff,
        sampleRate & 0xff,            // Sample Rate
        (sampleRate >> 8) & 0xff,
        (sampleRate >> 16) & 0xff,
        (sampleRate >> 24) & 0xff,
        byteRate & 0xff,              // Byte Rate
        (byteRate >> 8) & 0xff,
        (byteRate >> 16) & 0xff,
        (byteRate >> 24) & 0xff,
        blockAlign & 0xff,            // Block Align
        (blockAlign >> 8) & 0xff,
        bitsPerSample & 0xff,         // Bits per sample
        (bitsPerSample >> 8) & 0xff,
        100, 97, 116, 97,             // "data" in ASCII
        subChunk2Size & 0xff,         // Sub chunk 1 size
        (subChunk2Size >> 8) & 0xff,
        (subChunk2Size >> 16) & 0xff,
        (subChunk2Size >> 24) & 0xff
    ].concat(soundBytes);

    return new Uint8Array(data);
}
