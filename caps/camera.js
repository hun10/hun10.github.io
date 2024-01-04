import buffersGl from './buffers-gl.js'
import { numericControl, button } from './controls.js'

const canvas = document.createElement('canvas')
document.body.appendChild(canvas)

const select = document.createElement('select')
document.body.appendChild(select)

const pre = document.createElement('pre')
document.body.appendChild(pre)

async function main() {
    const devices = await navigator.mediaDevices.enumerateDevices()

    devices.filter(dev => dev.kind === 'videoinput').forEach(device => {
        const option = document.createElement('option')
        select.appendChild(option)

        option.innerText = device.label
        option.value = device.deviceId
    })

    choose()
    select.addEventListener('change', choose)

    const gl = canvas.getContext('webgl2', {
        depth: false,
        antialias: false
    })
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

    // gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)

    const {
        screen,
        pixelBuffer,
        doublePixelBuffer,
        shader,
    } = buffersGl(gl)

    const sourceBuffer = pixelBuffer({
        filter: gl.NEAREST,
        format: gl.RGBA32F,
        access: gl.RGBA,
        store: gl.FLOAT
    })
    const finalBuffer = doublePixelBuffer({
        filter: gl.NEAREST,
        format: gl.RGBA32F,
        access: gl.RGBA,
        store: gl.FLOAT
    })

    const justCopy = shader(`
        out vec4 verbatim;

        precision highp sampler2D;
        uniform sampler2D u_source;

        void main() {
            verbatim = texelFetch(u_source, ivec2(gl_FragCoord.xy), 0);
        }
    `)

    const accumulate = shader(`
        out vec4 rgbc;

        precision highp sampler2D;
        uniform sampler2D u_source;
        uniform sampler2D u_back;
        uniform vec2 u_resolution;

        void main() {
            vec4 sRgbSource = texelFetch(u_source, ivec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y), 0);
            vec4 linearBack = texelFetch(u_back, ivec2(gl_FragCoord.xy), 0);

            vec3 linearRgb = toLinear(sRgbSource.rgb);
            linearBack.rgb *= linearBack.a / (linearBack.a + 1.0);
            linearBack.rgb += linearRgb / (linearBack.a + 1.0);
            linearBack.a += 1.0;

            rgbc = linearBack;
        }
    `)

    const toDitheredSrgb = shader(`
        out vec4 sRgb;

        precision highp sampler2D;
        uniform sampler2D u_source;
        uniform float u_exposure;

        void main() {
            vec4 fetched = texelFetch(u_source, ivec2(gl_FragCoord.xy), 0);
            vec3 exposed = u_exposure * fetched.rgb;

            sRgb = ditherFinal(fromLinear(
                exposed
            ));
        }
    `)

    const video = document.getElementById('preview')

    const exposure = numericControl('Exposure', -10, 10, 0.001, 0)
    let accumulation = false
    button('Toggle Accumulation', () => {
        accumulation = !accumulation
    })

    button('Save as OpenEXR', () => {
        const stream = []
        function int(size, num) {
            for (let i = 0; i < size; i++) {
                stream.push(num & 0xFF)
                num = num >> 8
            }
        }
        function string(txt) {
            for (let c of txt) {
                stream.push(c.charCodeAt(0))
            }
            stream.push(0)
        }
        function compression(mode) {
            string('compression')
            int(4, 1)
            int(1, mode)
        }
        function box2i(xMin, yMin, xMax, yMax) {
            string('box2i')
            int(4, 16)
            int(4, xMin)
            int(4, yMin)
            int(4, xMax)
            int(4, yMax)
        }
        function chlist(channels) {
            string('chlist')
            let size = 1
            for (let channel of channels) {
                const {
                    name
                } = channel
                size += name.length + 1
                size += 4
                size += 4
                size += 4
                size += 4
            }
            int(4, size)
            for (let channel of channels) {
                const {
                    name,
                    pixelType = 2, // FLOAT 32-bit
                    pLinear = 0,
                    xSampling = 1,
                    ySampling = 1
                } = channel
                string(name)
                int(4, pixelType)
                int(4, pLinear)
                int(4, xSampling)
                int(4, ySampling)
            }
            int(1, 0)
        }
        function lineOrder(mode) {
            string('lineOrder')
            int(4, 1)
            int(1, mode) // INCREASING_Y = 0, DECREASING_Y = 1
        }
        function float(num) {
            string('float')
            int(4, 4)
            const f = new Float32Array([num])
            const b = new Uint8Array(f.buffer)
            for (let x of b) {
                stream.push(x)
            }
        }
        function v2f(f1, f2) {
            string('v2f')
            int(4, 8)
            const f = new Float32Array([f1, f2])
            const b = new Uint8Array(f.buffer)
            for (let x of b) {
                stream.push(x)
            }
        }
        function chromaticities(redX, redY, greenX, greenY, blueX, blueY, whiteX, whiteY) {
            string('chromaticities')
            int(4, 8 * 4)
            const f = new Float32Array([redX, redY, greenX, greenY, blueX, blueY, whiteX, whiteY])
            const b = new Uint8Array(f.buffer)
            for (let x of b) {
                stream.push(x)
            }
        }

        int(4, 20000630) // magic number
        int(4, 2) // version and flags

        string('channels')
        chlist([
            { name: 'R' },
            { name: 'G' },
            { name: 'B' },
        ])

        // string('chromaticities')
        // chromaticities(
        //     1, 0,
        //     0, 1,
        //     0, 0,
        //     1/3, 1/3
        // )

        string('compression')
        compression(0) // NO_COMPRESSION

        string('dataWindow')
        box2i(0, 0, finalBuffer.width - 1, finalBuffer.height - 1)

        string('displayWindow')
        box2i(0, 0, finalBuffer.width - 1, finalBuffer.height - 1)

        string('lineOrder')
        lineOrder(1)

        string('pixelAspectRatio')
        float(1)

        string('screenWindowCenter')
        v2f(0, 0)

        string('screenWindowWidth')
        float(1)

        int(1, 0) // end of header

        for (let y = 0, o = stream.length + 8 * finalBuffer.height; y < finalBuffer.height; y++) {
            int(8, o)
            o += 3 * finalBuffer.width * 4 + 8
        }

        justCopy.draw({ u_source: finalBuffer }, finalBuffer)
        const pixels = new Float32Array(finalBuffer.width * finalBuffer.height * 4);
        gl.readPixels(0, 0, finalBuffer.width, finalBuffer.height, gl.RGBA, gl.FLOAT, pixels)
        const byteView = new Uint8Array(pixels.buffer)

        for (let y = 0; y < finalBuffer.height; y++) {
            int(4, y)
            int(4, 3 * finalBuffer.width * 4)
            for (let c = 0; c < 3; c++) {
                for (let x = 0; x < finalBuffer.width; x++) {
                    for (let i = 0; i < 4; i++) {
                        int(1, byteView[((y * finalBuffer.width + x) * 4 + c) * 4 + i])
                    }
                }
            }
        }

        const blob = new Blob([new Uint8Array(stream)])
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'photo.exr'
        a.click()
    })

    while (true) {
        await frame()

        sourceBuffer.resize()
        if (video.readyState >= 2) {
            sourceBuffer.update(video)
        }

        finalBuffer.resize()
        if (!accumulation) {
            finalBuffer.update()
        }
        accumulate.draw({
            u_source: sourceBuffer,
            u_back: finalBuffer,
            u_resolution: [finalBuffer.width, finalBuffer.height]
        }, finalBuffer)

        toDitheredSrgb.draw({
            u_source: finalBuffer,
            u_exposure: Math.pow(2, exposure.value)
        }, screen)
    }
}

async function choose() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            deviceId: select.value,
            width: 1e9,
            height: 1e9
        }
    })

    const caps = stream.getVideoTracks().map(track => ({[track.label]: track.getCapabilities()}))

    console.log(caps)
    pre.innerText = JSON.stringify(caps, null, 2)

    const video = document.getElementById('preview')
    const trackSettings = stream.getVideoTracks()[0].getSettings()
    pre.innerText += JSON.stringify(trackSettings, null, 2)

    canvas.width = trackSettings.width
    canvas.height = trackSettings.height

    video.srcObject = stream
}

function frame() {
    return new Promise(resolve => requestAnimationFrame(resolve))
}

main().catch(e => document.body.innerText = e)