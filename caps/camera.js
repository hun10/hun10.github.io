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

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)

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

    const accumulate = shader(`
        out vec4 rgbc;

        precision highp sampler2D;
        uniform sampler2D u_source;
        uniform sampler2D u_back;

        void main() {
            vec4 sRgbSource = texelFetch(u_source, ivec2(gl_FragCoord.xy), 0);
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

    while (true) {
        await frame()

        sourceBuffer.resize()
        sourceBuffer.update(video)

        finalBuffer.resize()
        if (!accumulation) {
            finalBuffer.update()
        }
        accumulate.draw({
            u_source: sourceBuffer,
            u_back: finalBuffer,
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