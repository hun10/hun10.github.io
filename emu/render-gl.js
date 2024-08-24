import buffersGl from './buffers-gl.js'
import tony_mc_mapface from './tony_mc_mapface.js'
import cie_xyz_2deg from './cie_xyz_2deg.js'
import srgb_spectral_basis from './srgb-spectral-basis.js'
import d65_data from './d65.js'
import glassData from './clear-glass.js'
import waterData from './water.js'
import mirrorData from './silver.js'
import { numericControl, button, selectControl, binaryControl } from './controls.js'
import { dngFromRows } from './dng.js'

function parseParameters() {
    try {
        return JSON.parse(decodeURI(location.hash).substring(1))
    } catch (e) {
        return {}
    }
}

const {
    resolution = 512,
    maxSamples = Number.MAX_SAFE_INTEGER,

    offsetX = 0, //-0.35 //-0.05 // -0.5 // -0.2
    offsetY = 0, //-0.47 //-0.67 // -0.17 // -0.5
    magnification = 1, //9 // 16 // 11

    minT = 1e-5,
    maxT = 1e9,

    light = 0.25,
    lightSize = 1,
    sensor = 2,
    pinHole = -9,
    draw = 1,

    aa = 'box',

    ballRadius = 0.2,
    ballX = 0,
    ballY = -0.7,
    ballZ = 3,

    cPos = [
        0.559792645716715,
        -0.6399999999999999,
        2.751294145836268
    ],
    cHorizontalTurns = 0.7166666666666672,
    cVerticalTurns =  0.08333333333333304,
} = parseParameters()

async function main() {
    const div = document.createElement('div')
    document.body.appendChild(div)

    const canvas = document.createElement('canvas')
    canvas.width = resolution
    canvas.height = resolution
    canvas.style.height = '94vh'
    document.body.appendChild(canvas)

    const passesPerFrame = numericControl('Passes per Draw', 1, 320, 1, draw)
    const pixelsCorrelate = numericControl('Pixel Correlation', 0, 1, 1e-4, 1)
    const markNegaitve = binaryControl('Mark Negative', false)
    const targetMaxSample = numericControl('Target Samples per Pixel', 0, 8192, 1, 0)
    const targetVariance = numericControl('Target Variance', 0, 1, 1e-6, 0)
    const showVariance = binaryControl('Show Variance', false)
    const showCounts = binaryControl('Show Sample Counts', false)
    const exposure = numericControl('Exposure', -24, 24, 1e-3, 0)
    const tmOperators = ['Clip', 'Exponential', 'Simple Reinhard', 'Tony McMapface']
    const tonemapping = selectControl('Tone Mapping', tmOperators, () => {}, tmOperators[0])
    const lumaBasedTm = binaryControl('Luminance Mapping', true)

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

    const {
        screen,
        pixelBuffer,
        doublePixelBuffer,
        shader,
        sampler3D,
        multiOutput
    } = buffersGl(gl)

    { // tests
        const testBuffer = pixelBuffer({
            width: 3,
            height: 3,
            filter: gl.NEAREST,
            format: gl.R32F,
            access: gl.RED,
            store: gl.FLOAT
        })
        shader(`
            out float result;

//            const float half_eps = (uintBitsToFloat(floatBitsToUint(1.0) + 1u) - 1.0) * 0.5;

            void main() {
                mat3 rec2020 = inverse(rgbToXyz(
                        vec2(0.7080, 0.2920),
                        vec2(0.1700, 0.7970),
                        vec2(0.1310, 0.0460),
                        vec2(0.3127, 0.3290)
                ));
                result = rec2020[int(gl_FragCoord.x)][int(gl_FragCoord.y)];
//                result = half_eps;
            }
        `).draw({}, testBuffer)
        const output = new Float32Array(9)
        gl.readPixels(0, 0, 3, 3, gl.RED, gl.FLOAT, output)
        for (let j = 0; j < 3; j++) {
            console.log(`${output[j * 3]} * xyz[0] + ${output[j * 3 + 1]} * xyz[1] + ${output[j * 3 + 2]} * xyz[2]`)
        }
    }

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

    const cmf = pixelBuffer({
        width: cie_xyz_2deg.length,
        height: 2,
        filter: gl.LINEAR,
        format: gl.RGBA32F,
        access: gl.RGBA,
        store: gl.FLOAT
    })
    const cmfData = new Float32Array(cmf.bufferSize)
    for (let i = 0; i < cie_xyz_2deg.length; i++) {
        const item = cie_xyz_2deg[i]
        cmfData[i * 4 + 0] = item.X
        cmfData[i * 4 + 1] = item.Y
        cmfData[i * 4 + 2] = item.Z
        cmfData[i * 4 + 3] = item.wavelength

        cmfData[(i + cie_xyz_2deg.length) * 4 + 0] = item.X + (i > 0 ? cmfData[(i - 1 + cie_xyz_2deg.length) * 4 + 0] : 0)
        cmfData[(i + cie_xyz_2deg.length) * 4 + 1] = item.Y + (i > 0 ? cmfData[(i - 1 + cie_xyz_2deg.length) * 4 + 1] : 0)
        cmfData[(i + cie_xyz_2deg.length) * 4 + 2] = item.Z + (i > 0 ? cmfData[(i - 1 + cie_xyz_2deg.length) * 4 + 2] : 0)
        cmfData[(i + cie_xyz_2deg.length) * 4 + 3] = item.wavelength
    }
    cmf.update(cmfData)

    const srgbBasis = pixelBuffer({
        width: srgb_spectral_basis.length,
        height: 1,
        filter: gl.LINEAR,
        format: gl.RGBA32F,
        access: gl.RGBA,
        store: gl.FLOAT
    })
    const srgbBasisData = new Float32Array(srgbBasis.bufferSize)
    for (let i = 0; i < srgb_spectral_basis.length; i++) {
        const item = srgb_spectral_basis[i]
        srgbBasisData[i * 4 + 0] = item.R
        srgbBasisData[i * 4 + 1] = item.G
        srgbBasisData[i * 4 + 2] = item.B
        srgbBasisData[i * 4 + 3] = item.wavelength
    }
    srgbBasis.update(srgbBasisData)

    const d65 = pixelBuffer({
        width: d65_data.length,
        height: 1,
        filter: gl.LINEAR,
        format: gl.RGBA32F,
        access: gl.RGBA,
        store: gl.FLOAT
    })
    const d65Data = new Float32Array(d65.bufferSize)
    for (let i = 0; i < d65_data.length; i++) {
        const item = d65_data[i]
        d65Data[i * 4 + 0] = item.power
        d65Data[i * 4 + 1] = item.power
        d65Data[i * 4 + 2] = item.power
        d65Data[i * 4 + 3] = item.wavelength
    }
    d65.update(d65Data)

    const limeGlass = pixelBuffer({
        width: 830 - 390 + 1,
        height: 3,
        filter: gl.LINEAR,
        format: gl.RGBA32F,
        access: gl.RGBA,
        store: gl.FLOAT
    })
    const limeGlassData = new Float32Array(limeGlass.bufferSize)
    for (let w = 390, i = 0, j = 0; w <= 830; w++) {
        while (i + 2 < glassData.n.length && !(glassData.n[i].wavelength <= w && w <= glassData.n[i + 1].wavelength)) {
            i++
        }
        while (j + 2 < glassData.k.length && !(glassData.k[j].wavelength <= w && w <= glassData.k[j + 1].wavelength)) {
            j++
        }
        const a = glassData.n[i]
        const b = glassData.n[i + 1]
        const lerpAB = (w - a.wavelength) / (b.wavelength - a.wavelength)
    
        const c = glassData.k[j]
        const d = glassData.k[j + 1]
        const lerpCD = (w - c.wavelength) / (d.wavelength - c.wavelength)

        limeGlassData[(w - 390) * 4 + 0] = (1 - lerpAB) * a.n + lerpAB * b.n
        limeGlassData[(w - 390) * 4 + 1] = (1 - lerpCD) * c.k + lerpCD * d.k
        limeGlassData[(w - 390) * 4 + 2] = 0
        limeGlassData[(w - 390) * 4 + 3] = w
    }
    for (let w = 390, i = 0, j = 0; w <= 830; w++) {
        while (i + 2 < waterData.n.length && !(waterData.n[i].wavelength <= w && w <= waterData.n[i + 1].wavelength)) {
            i++
        }
        while (j + 2 < waterData.k.length && !(waterData.k[j].wavelength <= w && w <= waterData.k[j + 1].wavelength)) {
            j++
        }
        const a = waterData.n[i]
        const b = waterData.n[i + 1]
        const lerpAB = (w - a.wavelength) / (b.wavelength - a.wavelength)
    
        const c = waterData.k[j]
        const d = waterData.k[j + 1]
        const lerpCD = (w - c.wavelength) / (d.wavelength - c.wavelength)

        limeGlassData[(w - 390 + 830 - 390 + 1) * 4 + 0] = (1 - lerpAB) * a.n + lerpAB * b.n
        limeGlassData[(w - 390 + 830 - 390 + 1) * 4 + 1] = (1 - lerpCD) * c.k + lerpCD * d.k
        limeGlassData[(w - 390 + 830 - 390 + 1) * 4 + 2] = 0
        limeGlassData[(w - 390 + 830 - 390 + 1) * 4 + 3] = w
    }
    for (let w = 390, i = 0, j = 0; w <= 830; w++) {
        while (i + 2 < mirrorData.n.length && !(mirrorData.n[i].wavelength <= w && w <= mirrorData.n[i + 1].wavelength)) {
            i++
        }
        while (j + 2 < mirrorData.k.length && !(mirrorData.k[j].wavelength <= w && w <= mirrorData.k[j + 1].wavelength)) {
            j++
        }
        const a = mirrorData.n[i]
        const b = mirrorData.n[i + 1]
        const lerpAB = (w - a.wavelength) / (b.wavelength - a.wavelength)
    
        const c = mirrorData.k[j]
        const d = mirrorData.k[j + 1]
        const lerpCD = (w - c.wavelength) / (d.wavelength - c.wavelength)

        limeGlassData[(w - 390 + 830 - 390 + 1 + 830 - 390 + 1) * 4 + 0] = (1 - lerpAB) * a.n + lerpAB * b.n
        limeGlassData[(w - 390 + 830 - 390 + 1 + 830 - 390 + 1) * 4 + 1] = (1 - lerpCD) * c.k + lerpCD * d.k
        limeGlassData[(w - 390 + 830 - 390 + 1 + 830 - 390 + 1) * 4 + 2] = 0
        limeGlassData[(w - 390 + 830 - 390 + 1 + 830 - 390 + 1) * 4 + 3] = w
    }
    limeGlass.update(limeGlassData)

    const toDitheredSrgb = shader(`
        out vec4 sRgb;

        precision highp sampler2D;
        uniform sampler2D u_source;
        uniform float u_exposure;
        uniform float u_tonemap;
        uniform float u_use_luma;

        uniform highp sampler3D u_tony_mc_mapface;
        uniform float u_demosaic;

        uniform float u_show_counts;

        vec3 mcMapface(vec3 s) {
            s = max(vec3(0), s);
            vec3 encoded = s / (s + 1.0);

            const float LUT_DIMS = 48.0;
            vec3 uv = encoded * ((LUT_DIMS - 1.0) / LUT_DIMS) + 0.5 / LUT_DIMS;

            return texture(u_tony_mc_mapface, uv).rgb;
        }

        vec3 tonemap(vec3 exposed) {
            if (u_tonemap == 0.0) {
                return exposed;
            } else if (u_tonemap == 1.0) {
                return 1.0 - exp2(-exposed);
            } else if (u_tonemap == 2.0) {
                return exposed / (1.0 + exposed);
            } else if (u_tonemap == 3.0) {
                return mcMapface(exposed);
            }
        }

        uniform sampler2D u_cmf;

        vec3 wavelengthToXyz(float wavelength) {
            return texture(u_cmf, vec2((wavelength - 390.0 + 0.05) / (830.0 - 390.0 + 0.1), 0.5 / 2.0)).rgb;
        }

        vec4 fetch(ivec2 scr) {
            vec4 fetched = texelFetch(u_source, scr, 0).rrra;

            fetched *= vec4(
                ((scr.x + 1) % 2) * ((scr.y + 1) % 2),
                (scr.x + scr.y) % 2,
                (scr.x % 2) * (scr.y % 2),
                1
            );

            return fetched;
        }

        uniform float u_show_variance;
        uniform sampler2D u_source_throughput;

        uniform float u_max_samples_per_pixel;
        uniform float u_target_variance;

        uniform float u_mark_negative;

        void main() {
            vec4 fetched;
            if (u_show_variance > 0.0) {
                fetched = texelFetch(u_source_throughput, ivec2(gl_FragCoord.xy), 0);

                vec4 acc = fetch(ivec2(gl_FragCoord.xy));

                float n = acc.a;
                float variance = fetched.a / (n - 1.0) / n;

                if (variance <= 0.0) {
                    fetched.rgb = vec3(1, 1, 0);
                } else if (variance <= u_target_variance) {
                    fetched.rgb = vec3(0, 0, 1);
                } else {
                    fetched.rgb = vec3(variance);
                }
            } else {
                if (u_demosaic == 1.0) {
                    vec4 a = fetch(ivec2(gl_FragCoord.xy) + ivec2(-1, -1));
                    vec4 b = fetch(ivec2(gl_FragCoord.xy) + ivec2(0, -1));
                    vec4 c = fetch(ivec2(gl_FragCoord.xy) + ivec2(1, -1));

                    vec4 d = fetch(ivec2(gl_FragCoord.xy) + ivec2(-1, 0));
                    vec4 e = fetch(ivec2(gl_FragCoord.xy) + ivec2(0, 0));
                    vec4 f = fetch(ivec2(gl_FragCoord.xy) + ivec2(1, 0));

                    vec4 g = fetch(ivec2(gl_FragCoord.xy) + ivec2(-1, 1));
                    vec4 h = fetch(ivec2(gl_FragCoord.xy) + ivec2(0, 1));
                    vec4 i = fetch(ivec2(gl_FragCoord.xy) + ivec2(1, 1));

                    fetched = e;

                    fetched.rb += 0.5 * (b.rb + d.rb + f.rb + h.rb) + 0.25 * (a.rb + c.rb + g.rb + i.rb);
                    fetched.g += 0.25 * (b.g + d.g + f.g + h.g);
                } else if (u_demosaic == 2.0) {
                    vec4 a = fetch(ivec2(gl_FragCoord.xy) + ivec2(0, -2));

                    vec4 b = fetch(ivec2(gl_FragCoord.xy) + ivec2(-1, -1));
                    vec4 c = fetch(ivec2(gl_FragCoord.xy) + ivec2(0, -1));
                    vec4 d = fetch(ivec2(gl_FragCoord.xy) + ivec2(1, -1));

                    vec4 e = fetch(ivec2(gl_FragCoord.xy) + ivec2(-2, 0));
                    vec4 f = fetch(ivec2(gl_FragCoord.xy) + ivec2(-1, 0));
                    vec4 g = fetch(ivec2(gl_FragCoord.xy) + ivec2(0, 0));
                    vec4 h = fetch(ivec2(gl_FragCoord.xy) + ivec2(1, 0));
                    vec4 i = fetch(ivec2(gl_FragCoord.xy) + ivec2(2, 0));

                    vec4 j = fetch(ivec2(gl_FragCoord.xy) + ivec2(-1, 1));
                    vec4 k = fetch(ivec2(gl_FragCoord.xy) + ivec2(0, 1));
                    vec4 l = fetch(ivec2(gl_FragCoord.xy) + ivec2(1, 1));

                    vec4 m = fetch(ivec2(gl_FragCoord.xy) + ivec2(0, 2));

                    fetched = g;

                    fetched.g += (4.0 * (g.r + g.b) + 2.0 * (c.g + f.g + h.g + k.g) - 1.0 * (a.r + a.b + e.r + e.b + i.r + i.b + m.r + m.b)) / 8.0;
                    fetched.rb += (4.0 * (c.rb + f.rb + h.rb + k.rb) + 2.0 * (b.rb + d.rb + j.rb + l.rb) + 6.0 * g.br - 1.5 * (a.br + e.br + i.br + m.br)) / 8.0;
                    fetched.rb += (5.0 * g.gg - 1.0 * (b.gg + d.gg + j.gg + l.gg + a.gg + e.gg + i.gg + m.gg)) / 8.0;

                    bool r_col = (int(gl_FragCoord.x) % 2 == 0);
                    fetched.r += 1.5 * (r_col ? e.g + i.g : a.g + m.g) / 8.0;
                    fetched.b += 1.5 * (r_col ? a.g + m.g : e.g + i.g) / 8.0;
                } else if (u_demosaic == 3.0) {
                    fetched = fetch(ivec2(gl_FragCoord.xy));
                    fetched.rgb = vec3(fetched.r + fetched.g + fetched.b);
                } else {
                    fetched = fetch(ivec2(gl_FragCoord.xy));
                }

                if (u_show_counts > 0.0) {
                    fetched.rgb = (u_max_samples_per_pixel > 0.0 && fetched.a >= u_max_samples_per_pixel) ? vec3(0, 1, 0) : fetched.aaa;
                }
            }

            vec3 exposed = exp2(u_exposure) * fetched.rgb;
            if (u_show_variance == 0.0 && u_show_counts == 0.0) {
                exposed = inverse(rgbToXyz(
                    vec2(0.6400, 0.3300),
                    vec2(0.3000, 0.6000),
                    vec2(0.1500, 0.0600),
                    vec2(0.3127, 0.3290)
                )) * exposed;
            }

            if (u_mark_negative > 0.0 && exposed != abs(exposed)) {
                exposed -= abs(exposed);
                exposed = abs(sign(exposed));
            }
            float luma = dot(exposed, vec3(0.2126, 0.7152, 0.0722));

            sRgb = ditherFinal(fromLinear(
              (u_use_luma == 0.0 || u_tonemap == 3.0) ? tonemap(exposed) : (exposed * tonemap(vec3(luma)) / luma)
            ));
        }
    `)

    const justCopy = shader(`
        out vec4 verbatim;

        precision highp sampler2D;
        uniform sampler2D u_source;
        uniform float u_exposure;

        uniform sampler2D u_cmf;

        uniform float u_xyz;

        uniform float u_demosaic;

        vec3 wavelengthToXyz(float wavelength) {
            return texture(u_cmf, vec2((wavelength - 390.0 + 0.05) / (830.0 - 390.0 + 0.1), 0.5 / 2.0)).rgb;
        }

        vec4 fetch(ivec2 scr) {
            vec4 fetched = texelFetch(u_source, scr, 0).rrra;

            fetched *= vec4(
                ((scr.x + 1) % 2) * ((scr.y + 1) % 2),
                (scr.x + scr.y) % 2,
                (scr.x % 2) * (scr.y % 2),
                1
            );

            return fetched;
        }

        void main() {
            vec4 fetched;
            if (u_demosaic == 1.0) {
                vec4 a = fetch(ivec2(gl_FragCoord.xy) + ivec2(-1, -1));
                vec4 b = fetch(ivec2(gl_FragCoord.xy) + ivec2(0, -1));
                vec4 c = fetch(ivec2(gl_FragCoord.xy) + ivec2(1, -1));

                vec4 d = fetch(ivec2(gl_FragCoord.xy) + ivec2(-1, 0));
                vec4 e = fetch(ivec2(gl_FragCoord.xy) + ivec2(0, 0));
                vec4 f = fetch(ivec2(gl_FragCoord.xy) + ivec2(1, 0));

                vec4 g = fetch(ivec2(gl_FragCoord.xy) + ivec2(-1, 1));
                vec4 h = fetch(ivec2(gl_FragCoord.xy) + ivec2(0, 1));
                vec4 i = fetch(ivec2(gl_FragCoord.xy) + ivec2(1, 1));

                fetched = e;

                fetched.rb += 0.5 * (b.rb + d.rb + f.rb + h.rb) + 0.25 * (a.rb + c.rb + g.rb + i.rb);
                fetched.g += 0.25 * (b.g + d.g + f.g + h.g);
            } else if (u_demosaic == 2.0) {
                vec4 a = fetch(ivec2(gl_FragCoord.xy) + ivec2(0, -2));

                vec4 b = fetch(ivec2(gl_FragCoord.xy) + ivec2(-1, -1));
                vec4 c = fetch(ivec2(gl_FragCoord.xy) + ivec2(0, -1));
                vec4 d = fetch(ivec2(gl_FragCoord.xy) + ivec2(1, -1));

                vec4 e = fetch(ivec2(gl_FragCoord.xy) + ivec2(-2, 0));
                vec4 f = fetch(ivec2(gl_FragCoord.xy) + ivec2(-1, 0));
                vec4 g = fetch(ivec2(gl_FragCoord.xy) + ivec2(0, 0));
                vec4 h = fetch(ivec2(gl_FragCoord.xy) + ivec2(1, 0));
                vec4 i = fetch(ivec2(gl_FragCoord.xy) + ivec2(2, 0));

                vec4 j = fetch(ivec2(gl_FragCoord.xy) + ivec2(-1, 1));
                vec4 k = fetch(ivec2(gl_FragCoord.xy) + ivec2(0, 1));
                vec4 l = fetch(ivec2(gl_FragCoord.xy) + ivec2(1, 1));

                vec4 m = fetch(ivec2(gl_FragCoord.xy) + ivec2(0, 2));

                fetched = g;

                fetched.g += (4.0 * (g.r + g.b) + 2.0 * (c.g + f.g + h.g + k.g) - 1.0 * (a.r + a.b + e.r + e.b + i.r + i.b + m.r + m.b)) / 8.0;
                fetched.rb += (4.0 * (c.rb + f.rb + h.rb + k.rb) + 2.0 * (b.rb + d.rb + j.rb + l.rb) + 6.0 * g.br - 1.5 * (a.br + e.br + i.br + m.br)) / 8.0;
                fetched.rb += (5.0 * g.gg - 1.0 * (b.gg + d.gg + j.gg + l.gg + a.gg + e.gg + i.gg + m.gg)) / 8.0;

                bool r_col = (int(gl_FragCoord.x) % 2 == 0);
                fetched.r += 1.5 * (r_col ? e.g + i.g : a.g + m.g) / 8.0;
                fetched.b += 1.5 * (r_col ? a.g + m.g : e.g + i.g) / 8.0;
            } else if (u_demosaic == 3.0) {
                fetched = fetch(ivec2(gl_FragCoord.xy));
                fetched.rgb = vec3(fetched.r + fetched.g + fetched.b);
            } else {
                fetched = fetch(ivec2(gl_FragCoord.xy));
            }

            vec3 color = fetched.rgb * exp2(u_exposure);

            if (u_xyz > 0.0) {
                verbatim.rgb = color;
            } else {
                verbatim.rgb = inverse(rgbToXyz(
                    vec2(0.6400, 0.3300),
                    vec2(0.3000, 0.6000),
                    vec2(0.1500, 0.0600),
                    vec2(0.3127, 0.3290)
                )) * color;
            }
        }
    `)

    const finalBuffer = doublePixelBuffer({
        filter: gl.NEAREST,
        format: gl.RGBA32F,
        access: gl.RGBA,
        store: gl.FLOAT
    })
    const rayThroughputBuffer = doublePixelBuffer({
        filter: gl.NEAREST,
        format: gl.RGBA32F,
        access: gl.RGBA,
        store: gl.FLOAT
    })
    const rayStartBuffer = doublePixelBuffer({
        filter: gl.NEAREST,
        format: gl.RGBA32F,
        access: gl.RGBA,
        store: gl.FLOAT
    })
    const rayDirectionBuffer = doublePixelBuffer({
        filter: gl.NEAREST,
        format: gl.RGBA32F,
        access: gl.RGBA,
        store: gl.FLOAT
    })
    const deferredBuffer = multiOutput(
        finalBuffer,
        rayThroughputBuffer,
        rayStartBuffer,
        rayDirectionBuffer,
    )

    const render = shader(`
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

        uint hash2(uvec3 v) {
            uvec3 i = uvec3(0xdeadbeefu + (2u<<2u) + v.z);

            i.xy += v.xy;
            final(i.x, i.y, i.z);
            return i.z;
        }
        uint hash0(uint initval) {
            uvec3 i = uvec3(0xdeadbeefu + (0u<<2u) + initval);

            final(i.x, i.y, i.z);
            return i.z;
        }
        // http://www.burtleburtle.net/bob/c/lookup3.c

        uint rnd_seed;

        float rnd_uniform() {
            rnd_seed = hash0(rnd_seed);
            return floatConstruct(rnd_seed);
        }

        vec2 rnd_normal() {
            float phi = 2.0 * ${Math.PI} * rnd_uniform();
            return sqrt(-2.0 * log(rnd_uniform())) * vec2(cos(phi), sin(phi));
        }

        layout(location = 0) out vec4 linearRgb;
        layout(location = 1) out vec4 throughputOut;
        layout(location = 2) out vec4 startOut;
        layout(location = 3) out vec4 directionOut;

        precision highp sampler2D;
        uniform sampler2D u_source;
        uniform vec2 u_resolution;

        uniform sampler2D u_source_throughput;
        uniform sampler2D u_source_start;
        uniform sampler2D u_source_direction;

        uniform float u_magnification;
        uniform vec2 u_offset;

        vec3 sampleUnitDisc(vec3 n) {
            float r = sqrt(rnd_uniform());
            float phi = 2.0 * ${Math.PI} * rnd_uniform();

            vec3 absN = abs(n);

            float minCos = absN.x;
            vec3 tmp = vec3(1, 0, 0);
            if (absN.y < minCos) {
                minCos = absN.y;
                tmp = vec3(0, 1, 0);
            }
            if (absN.z < minCos) {
                minCos = absN.z;
                tmp = vec3(0, 0, 1);
            }

            vec3 p1 = normalize(cross(n, tmp));
            vec3 p2 = cross(n, p1);

            return r * (p1 * cos(phi) + p2 * sin(phi));
        }

        vec3 sampleCosineHemisphere(vec3 n) {
            vec3 disc = sampleUnitDisc(n);
            return disc + n * sqrt(1.0 - dot(disc, disc));
        }

        struct Ray {
            vec3 start;
            vec3 direction;
        };

        const float maxT = float(${maxT});
        const float minT = float(${minT});
        struct Intersection {
            float t;
            vec3 surface;
            vec3 n;

            vec3 albedo;
            vec3 emits;

            // 0 - diffuse solid
            // 1 - air
            // 2 - glass
            // 3 - water
            // 4 - silver
            int upMaterial;
            int downMaterial;
        };

        void triangleFace(
            inout Intersection event, Ray ray,
            vec3 a, vec3 b, vec3 c
        ) {
            vec3 ab = b - a;
            vec3 ac = c - a;
            vec3 n = normalize(cross(ab, ac));

            int mat_up;
            int mat_down;
            if (sign(-dot(n, ray.direction)) < 0.0) {
                n = -n;

                mat_up = 1;
                mat_down = 2;
            } else {
                mat_up = 2;
                mat_down = 1;
            }

            float L = dot(n, a - ray.start) / dot(n, ray.direction);
            vec3 p = ray.start + L * ray.direction;

            vec3 ap = p - a;
            vec3 bp = p - b;
            vec3 bc = c - b;
            vec3 ba = a - b;
            bool inside = dot(cross(ap, ab), cross(ap, ac)) <= 0.0 && dot(cross(bp, bc), cross(bp, ba)) <= 0.0;

            if (L > minT && L < event.t && inside) {
                event.t = L;
                event.surface = p;
                event.n = n;
                event.albedo = vec3(1);
                event.emits = vec3(0);
                event.upMaterial = mat_up;
                event.downMaterial = mat_down;
            }
        }

        void quadFace(
            inout Intersection event, Ray ray,
            vec3 a, vec3 b, vec3 c, vec3 d,
            int mat_up, int mat_down
        ) {
            vec3 ab = b - a;
            vec3 ad = d - a;
            vec3 n = normalize(cross(ab, ad));

            if (sign(-dot(n, ray.direction)) < 0.0) {
                n = -n;
            } else {
                int tmp = mat_up;
                mat_up = mat_down;
                mat_down = tmp;
            }

            float L = dot(n, a - ray.start) / dot(n, ray.direction);
            vec3 p = ray.start + L * ray.direction;

            vec3 ap = p - a;
            vec3 bp = p - b;
            vec3 cp = p - c;
            vec3 cb = b - c;
            vec3 cd = d - c;
            vec3 ba = a - b;
            vec3 bc = c - b;
            bool inside = dot(cross(ap, ab), cross(ap, ad)) <= 0.0 && dot(cross(bp, ba), cross(bp, bc)) <= 0.0 && dot(cross(cp, cd), cross(cp, cb)) <= 0.0;

            if (L > minT && L < event.t && inside) {
                event.t = L;
                event.surface = p;
                event.n = n;
                event.albedo = vec3(1);
                event.emits = vec3(0);
                event.upMaterial = mat_up;
                event.downMaterial = mat_down;
            }
        }

        void fishtank(
            inout Intersection event, Ray ray,
            vec3 center,
            float radius,
            float height,
            float thickness,
            float bottom,
            float fill
        ) {
            vec3 a = center + vec3(1, 0, 1) * radius;
            vec3 b = center + vec3(1, 0, -1) * radius;
            vec3 c = center + vec3(-1, 0, -1) * radius;
            vec3 d = center + vec3(-1, 0, 1) * radius;

            vec3 ai = center + vec3(1, 0, 1) * (radius - thickness);
            vec3 bi = center + vec3(1, 0, -1) * (radius - thickness);
            vec3 ci = center + vec3(-1, 0, -1) * (radius - thickness);
            vec3 di = center + vec3(-1, 0, 1) * (radius - thickness);

            vec3 ah = a + vec3(0, 1, 0) * height;
            vec3 bh = b + vec3(0, 1, 0) * height;
            vec3 ch = c + vec3(0, 1, 0) * height;
            vec3 dh = d + vec3(0, 1, 0) * height;

            {
                vec3 minc = min(
                    min(
                        min(a, b),
                        min(c, d)
                    ),
                    min(
                        min(ah, bh),
                        min(ch, dh)
                    )
                );
                vec3 maxc = max(
                    max(
                        max(a, b),
                        max(c, d)
                    ),
                    max(
                        max(ah, bh),
                        max(ch, dh)
                    )
                );

                minc -= ray.start;
                minc /= ray.direction;
                maxc -= ray.start;
                maxc /= ray.direction;
                vec3 t0 = vec3(0);
                vec3 t1 = vec3(event.t);

                t0 = max(t0, min(minc, maxc));
                t1 = min(t1, max(minc, maxc));
                if (max(t0.x, max(t0.y, t0.z)) > min(t1.x, min(t1.y, t1.z))) return;
            }

            vec3 ahi = ai + vec3(0, 1, 0) * height;
            vec3 bhi = bi + vec3(0, 1, 0) * height;
            vec3 chi = ci + vec3(0, 1, 0) * height;
            vec3 dhi = di + vec3(0, 1, 0) * height;

            ai.y += bottom;
            bi.y += bottom;
            ci.y += bottom;
            di.y += bottom;

            vec3 afi = ai + vec3(0, 1, 0) * fill;
            vec3 bfi = bi + vec3(0, 1, 0) * fill;
            vec3 cfi = ci + vec3(0, 1, 0) * fill;
            vec3 dfi = di + vec3(0, 1, 0) * fill;

            quadFace(
                event, ray,
                a, b, c, d,
                1, 2
            );

            quadFace(
                event, ray,
                ah, bh, b, a,
                1, 2
            );
            quadFace(
                event, ray,
                bh, ch, c, b,
                1, 2
            );
            quadFace(
                event, ray,
                ch, dh, d, c,
                1, 2
            );
            quadFace(
                event, ray,
                dh, ah, a, d,
                1, 2
            );

            quadFace(
                event, ray,
                dh, ch, chi, dhi,
                1, 2
            );
            quadFace(
                event, ray,
                ch, bh, bhi, chi,
                1, 2
            );
            quadFace(
                event, ray,
                bh, ah, ahi, bhi,
                1, 2
            );
            quadFace(
                event, ray,
                ah, dh, dhi, ahi,
                1, 2
            );

            quadFace(
                event, ray,
                afi, bfi, bhi, ahi,
                1, 2
            );
            quadFace(
                event, ray,
                bfi, cfi, chi, bhi,
                1, 2
            );
            quadFace(
                event, ray,
                cfi, dfi, dhi, chi,
                1, 2
            );
            quadFace(
                event, ray,
                dfi, afi, ahi, dhi,
                1, 2
            );

            quadFace(
                event, ray,
                dfi, cfi, bfi, afi,
                1, 3
            );

            quadFace(
                event, ray,
                ai, bi, bfi, afi,
                3, 2
            );
            quadFace(
                event, ray,
                bi, ci, cfi, bfi,
                3, 2
            );
            quadFace(
                event, ray,
                ci, di, dfi, cfi,
                3, 2
            );
            quadFace(
                event, ray,
                di, ai, afi, dfi,
                3, 2
            );

            quadFace(
                event, ray,
                di, ci, bi, ai,
                3, 2
            );
        }

        void uberSquare(
            inout Intersection event, Ray ray,
            vec3 n, vec3 anchor, float radius,
            vec3 albedo1, vec3 albedo2,
            int mat_up, int mat_down,
            vec3 emits, float emRadius
        ) {
            if (dot(n, ray.direction) * dot(n, anchor - ray.start) > 0.0) {
                if (sign(-dot(n, ray.direction)) < 0.0) {
                    n = -n;

                    int tmp = mat_down;
                    mat_down = mat_up;
                    mat_up = tmp;
                }
                float L = dot(n, anchor - ray.start) / dot(n, ray.direction);

                vec3 p = ray.start + L * ray.direction;
                if (L < event.t) {
                    vec3 other = vec3(1) - abs(n);
                    vec3 d = abs(other * (p - anchor));
                    if (d.x <= radius && d.y <= radius && d.z <= radius) {
                        event.t = L;
                        event.surface = p * other + anchor * abs(n);
                        event.n = n;
                        event.albedo = albedo2 == vec3(0) || (dot(other, vec3(sin(1. + 37.*p.y), cos(-1. + 85.*p.x), 1) * (p - anchor)) < 0.0) ? albedo1 : albedo2;
                        // event.albedo = albedo2 == vec3(0) || (dot(other, vec3(1, -1, 0) * (p - anchor)) < 0.0) ? albedo1 : albedo2;
                        event.emits = (d.x <= emRadius && d.y <= emRadius && d.z <= emRadius) ? emits : vec3(0);
                        event.upMaterial = distance(vec3(-3, -1, 4.5), event.surface) > 3.005 ? mat_up : 2; // curved mirror
                        event.downMaterial = mat_down;
                    }
                }
            }
        }

        void diagSquare(
            inout Intersection event, Ray ray,
            vec3 n, vec3 anchor, float radius,
            vec3 albedo1,
            vec3 albedo2
        ) {
            uberSquare(
                event, ray,
                n, anchor, radius,
                albedo1, albedo2,
                1, 0,
                vec3(0), radius
            );
        }

        void halfEmitSquare(
            inout Intersection event, Ray ray,
            vec3 n, vec3 anchor, float radius,
            vec3 albedo,
            vec3 emits, float emRadius
        ) {
            uberSquare(
                event, ray,
                n, anchor, radius,
                albedo, vec3(0),
                1, 0,
                emits, emRadius
            );
        }

        void aaSquare(
            inout Intersection event, Ray ray,
            vec3 n, vec3 anchor, float radius,
            vec3 albedo,
            vec3 emits
        ) {
            uberSquare(
                event, ray,
                n, anchor, radius,
                albedo, vec3(0),
                1, 0,
                emits, radius
            );
        }

        void aaSquare(
            inout Intersection event, Ray ray,
            vec3 n, vec3 anchor, float radius,
            vec3 albedo,
            vec3 emits,
            int mat_up, int mat_down
        ) {
            uberSquare(
                event, ray,
                n, anchor, radius,
                albedo, vec3(0),
                mat_up, mat_down,
                emits, radius
            );
        }

        bool sphere(
            inout Intersection event, Ray ray,
            vec3 center, float radius,
            vec3 albedo,
            vec3 emits,
            int mat_up, int mat_down
        ) {
            bool result = distance(ray.start, center) < radius + minT;

            vec3 w = normalize(ray.direction);
            vec3 ov = center - ray.start;
            float ov2 = dot(ov, ov);
            float p = dot(ov, w);
            float d2 = radius * radius + p * p - ov2;
            if (d2 > 0.0) {
                float d = sqrt(d2);

                float t = (p - d) / length(ray.direction);
                if (t > minT && t < event.t) {
                    result = true;
                    vec3 p = ray.start + t * ray.direction - center;

                    event.t = t;
                    event.n = normalize(p);
                    event.surface = ray.start + t * ray.direction;
                    event.albedo = albedo;
                    event.emits = emits;
                    event.upMaterial = mat_up;
                    event.downMaterial = mat_down;
                }

                t = (p + d) / length(ray.direction);
                if (t > minT && t < event.t) {
                    result = true;
                    vec3 p = ray.start + t * ray.direction - center;

                    event.t = t;
                    event.n = -normalize(p);
                    event.surface = ray.start + t * ray.direction;
                    event.albedo = albedo;
                    event.emits = emits;
                    event.upMaterial = mat_down;
                    event.downMaterial = mat_up;
                }
            }

            return result;
        }

        void cube(
            inout Intersection event, Ray ray,
            vec3 center, float radius,
            vec3 albedo,
            vec3 emits,
            int mat_up, int mat_down
        ) {
            aaSquare(
                event, ray,
                vec3(1, 0, 0),
                center + vec3(radius, 0, 0),
                radius,
                albedo,
                emits,
                mat_up, mat_down
            );
            aaSquare(
                event, ray,
                vec3(-1, 0, 0),
                center + vec3(-radius, 0, 0),
                radius,
                albedo,
                emits,
                mat_up, mat_down
            );
            aaSquare(
                event, ray,
                vec3(0, 1, 0),
                center + vec3(0, radius, 0),
                radius,
                albedo,
                emits,
                mat_up, mat_down
            );
            aaSquare(
                event, ray,
                vec3(0, -1, 0),
                center + vec3(0, -radius, 0),
                radius,
                albedo,
                emits,
                mat_up, mat_down
            );
            aaSquare(
                event, ray,
                vec3(0, 0, 1),
                center + vec3(0, 0, radius),
                radius,
                albedo,
                emits,
                mat_up, mat_down
            );
            aaSquare(
                event, ray,
                vec3(0, 0, -1),
                center + vec3(0, 0, -radius),
                radius,
                albedo,
                emits,
                mat_up, mat_down
            );
        }

        void lens(inout Intersection event, Ray ray, vec3 c1, vec3 c2, float radius1, float radius2) {
            Intersection tmp;
            tmp.t = maxT;

            sphere(
                tmp, ray,
                c1,
                radius1,
                vec3(1),
                vec3(0),
                1, 2
            );

            if (distance(tmp.surface, c2) < radius2 && tmp.t > minT && tmp.t < event.t) {
                event = tmp;
            }

            tmp.t = maxT;
            sphere(
                tmp, ray,
                c2,
                radius2,
                vec3(1),
                vec3(0),
                1, 2
            );

            if (distance(tmp.surface, c1) < radius1 && tmp.t > minT && tmp.t < event.t) {
                event = tmp;
            }
        }

        const float lightSize = float(${lightSize});

        uniform float u_lens_radius_1;
        uniform float u_lens_radius_2;
        uniform float u_lens_radius_3;
        uniform float u_lens_thick;
        uniform float u_lens_pos;

        void scene(inout Intersection event, Ray ray, float timeSample) {
            event.t = maxT;

            // cornell
            aaSquare(
                event, ray,
                vec3(0, 1, 0),
                vec3(0, -1, 3),
                1.0,
                vec3(0.5),
                vec3(0)
            );

            halfEmitSquare(
                event, ray,
                vec3(0, -1, 0),
                vec3(0, 1, 3),
                1.0,
                vec3(0.5),
                vec3(float(${light})),
                lightSize / 2.0
            );

            aaSquare(
                event, ray,
                vec3(1, 0, 0),
                vec3(-1, 0, 3),
                1.0,
                vec3(1.0, 0.1, 0.1) * 0.5,
                vec3(0)
            );

            aaSquare(
                event, ray,
                vec3(-1, 0, 0),
                vec3(1, 0, 3),
                0.9,
                vec3(1),
                vec3(0),
                2, 4
            );
            aaSquare(
                event, ray,
                vec3(-1, 0, 0),
                vec3(1, 0, 3),
                1.0,
                vec3(0.5),
                vec3(0)
            );
            // uberSquare(
            //     event, ray,
            //     vec3(0, 1, 0),
            //     vec3(0, -1, 3),
            //     10.0,
            //     vec3(1), vec3(0),
            //     0.0,
            //     vec3(2e10), 0.005
            // );
            // aaSquare(
            //     event, ray,
            //     vec3(0, 1, 0),
            //     vec3(0, -0.9, 3),
            //     10.0,
            //     vec3(1),
            //     vec3(0),
            //     1.5
            // );
            // aaSquare(
            //     event, ray,
            //     vec3(0, -1, 0),
            //     vec3(0, -0.999, 3),
            //     10.0,
            //     vec3(1),
            //     vec3(0),
            //     1.5
            // );

            diagSquare(
                event, ray,
                vec3(0, 0, -1),
                vec3(0, 0, 4),
                1.0,
                vec3(1, 0.5, 0.5) * 0.1,
                vec3(1, 1, 0.1) * 0.5
            );

            // fourth wall
            aaSquare(
                event, ray,
                vec3(0, 0, 1),
                vec3(0, 0, 2),
                1.0,
                vec3(0.5),
                vec3(0)
            );

            // purple subject
            vec3 subjShift = vec3(1.895, 0, 0);

            aaSquare(
                event, ray,
                vec3(0, 0, 1),
                vec3(0, 0, 3.9) + subjShift,
                0.9,
                vec3(1),
                vec3(0),
                1, 2
            );
            aaSquare(
                event, ray,
                vec3(0, 0, -1),
                vec3(0, 0, 2.1) + subjShift,
                0.9,
                vec3(1),
                vec3(0),
                1, 2
            );
            aaSquare(
                event, ray,
                vec3(0, 1, 0),
                vec3(0, 0.9, 3) + subjShift,
                0.9,
                vec3(1),
                vec3(0),
                1, 2
            );
            aaSquare(
                event, ray,
                vec3(0, -1, 0),
                vec3(0, -0.9, 3) + subjShift,
                0.9,
                vec3(1),
                vec3(0),
                1, 2
            );
            aaSquare(
                event, ray,
                vec3(-1, 0, 0),
                vec3(-0.9, 0, 3) + subjShift,
                0.9,
                vec3(1),
                vec3(0),
                1, 2
            );


            // curved mirror
            {
                bool hitExterior = sphere(
                   event, ray,
                   vec3(-3, -1, 4.5),
                   3.005,
                   vec3(1),
                   vec3(0),
                   1, 2
               );
               if (hitExterior) {
                   sphere(
                        event, ray,
                        vec3(-3, -1, 4.5),
                        3.0,
                        vec3(1),
                        vec3(0),
                        2, 4
                    );
                }
            }

            // cube(
            //     event, ray,
            //     vec3(-0.35, -0.8, 2.5),
            //     0.2,
            //     vec3(0.9, 0.4, 0.2),
            //     vec3(0),
            //     0.0
            // );

            // cube(
            //     event, ray,
            //     vec3(0.6, -0.79, 2.5),
            //     0.2,
            //     vec3(1),
            //     1.5
            // );
            // cube(
            //     event, ray,
            //     vec3(0.6, -0.6, 2.6),
            //     0.12,
            //     vec3(0.9, 0.1, 1),
            //     0.0
            // );

            // sphere(
            //     event, ray,
            //     vec3(0, 0, 0),
            //     2.995,
            //     vec3(1),
            //     vec3(0),
            //     1.5
            // );
            // sphere(
            //     event, ray,
            //     vec3(0, 0, 0),
            //     6.0,
            //     vec3(0.75),
            //     vec3(0),
            //     0.0
            // );

            // lens
            // sphere(
            //     event, ray,
            //     vec3(${ballX}, ${ballY}, ${ballZ}),
            //     float(${ballRadius}),
            //     vec3(1),
            //     vec3(0),
            //     float(1.5)
            // );

            // vec3 lenPos = vec3(0, 0, u_lens_pos + 3.0);
            // lens(
            //     event, ray,
            //     vec3(0, 0, -u_lens_thick * 0.5) + lenPos,
            //     vec3(0, 0, u_lens_thick * 0.5) + lenPos,
            //     u_lens_radius_1,
            //     u_lens_radius_2
            // );

            {
                bool hitExterior = sphere(
                    event, ray,
                    vec3(float(${ballX}), float(${ballY}), float(${ballZ})),
                    float(${ballRadius}),
                    vec3(1),
                    vec3(0),
                    1, 2
                );
                if (hitExterior) sphere(
                    event, ray,
                    vec3(float(${ballX}), float(${ballY}), float(${ballZ})),
                    float(${ballRadius - 0.005}),
                    vec3(1),
                    vec3(0),
                    2, 3
                );
            }
            {
                const float fishtankRad = 0.1;
                const float fishtankHeight = 0.2;
                const float fishtankThick = 0.0025;
                const float fishtankBottom = 0.0049;
                float fishtankFill = u_lens_radius_3;
                const vec3 fishtankPos = vec3(0.2, -0.999, 2.7);

                fishtank(
                    event, ray,
                    fishtankPos,
                    fishtankRad,
                    fishtankHeight,
                    fishtankThick,
                    fishtankBottom,
                    fishtankFill
                );
            }

            if (true) {
                vec3 prismPos = vec3(0, 0, u_lens_pos + 3.0);

                vec3 thicknessDirection = vec3(0, 0, 1) * u_lens_thick;
                vec3 faceClockUp = vec3(0, 1, 0) * u_lens_radius_1;
                vec3 faceClockRight = vec3(1, 0, 0) * u_lens_radius_1;
                const float third = float(${2 * Math.PI / 3});
                float angle = u_lens_radius_2 + timeSample*5.0;

                vec3 a1 = prismPos - thicknessDirection * 0.5 + faceClockUp * sin(angle + 0.0 * third) + faceClockRight * cos(angle + 0.0 * third);
                vec3 b1 = prismPos - thicknessDirection * 0.5 + faceClockUp * sin(angle + 1.0 * third) + faceClockRight * cos(angle + 1.0 * third);
                vec3 c1 = prismPos - thicknessDirection * 0.5 + faceClockUp * sin(angle + 2.0 * third) + faceClockRight * cos(angle + 2.0 * third);

                vec3 a2 = a1 + thicknessDirection;
                vec3 b2 = b1 + thicknessDirection;
                vec3 c2 = c1 + thicknessDirection;

                triangleFace(
                    event, ray,
                    a1, b1, c1
                );

                quadFace(
                    event, ray,
                    a2, b2, b1, a1,
                    1, 2
                );
                quadFace(
                    event, ray,
                    b2, c2, c1, b1,
                    1, 2
                );
                quadFace(
                    event, ray,
                    c2, a2, a1, c1,
                    1, 2
                );

                triangleFace(
                    event, ray,
                    c2, b2, a2
                );
            }

            // sphere(
            //     event, ray,
            //     vec3(${ballX}, ${ballY}, ${ballZ}),
            //     float(${ballRadius}) - 0.07,
            //     vec3(1),//vec3(0.6, 1.0, 0.2),
            //     vec3(0),
            //     1.333/1.5
            // );
        }

        vec2 complexConjugate(vec2 a) {
            return a * vec2(1, -1);
        }

        vec2 complexMultiply(vec2 a, vec2 b) {
            return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
        }

        float complexAbs2(vec2 a) {
            return dot(a, a);
        }

        vec2 complexDiv(vec2 a, vec2 b) {
            return complexMultiply(a, complexConjugate(b)) / complexAbs2(b);
        }

        vec2 complexSqrt(vec2 z) {
            float r = sqrt(complexAbs2(z));
            vec2 zr = z + vec2(r, 0);

            return sqrt(r) * zr / sqrt(complexAbs2(zr));
        }

        float frDielectric(float cosTheta_i, vec2 eta) {
            float sin2Theta_i = 1.0 - (cosTheta_i * cosTheta_i);
            float sin2Theta_t = sin2Theta_i / (eta.x * eta.x);
            if (sin2Theta_t >= 1.0) return 1.0;

            float cosTheta_t = sqrt(1.0 - sin2Theta_t);

            vec2 r_parl = complexDiv(eta * cosTheta_i - vec2(cosTheta_t, 0),
                           eta * cosTheta_i + vec2(cosTheta_t, 0));
            vec2 r_perp = complexDiv(vec2(cosTheta_i, 0) - eta * cosTheta_t,
                           vec2(cosTheta_i, 0) + eta * cosTheta_t);
            return (complexAbs2(r_parl) + complexAbs2(r_perp)) / 2.0;
        }

        uniform vec3 u_camera_pos;
        uniform vec3 u_sensor_n;
        uniform vec3 u_sensor_x;
        uniform vec3 u_sensor_y;

        uniform sampler2D u_cmf;

        vec3 wavelengthToXyz(float wavelength) {
            return texture(u_cmf, vec2((wavelength - 390.0 + 0.05) / (830.0 - 390.0 + 0.1), 0.5 / 2.0)).rgb;
        }

        vec2 sampleXyz(vec4 selector) {
            float rnd = rnd_uniform();

            int L = -1, R = 8300 - 3900 + 1;

            float maxRnd = dot(texelFetch(u_cmf, ivec2(R - 1, 1), 0), selector);
            rnd *= maxRnd;

            while (R - L > 1) {
                int M = (L + R) / 2;

                if (dot(texelFetch(u_cmf, ivec2(M, 1), 0), selector) <= rnd) {
                    L = M;
                } else {
                    R = M;
                }
            }

            return vec2(texelFetch(u_cmf, ivec2(L, 1), 0).w + rnd_uniform() * 0.1, dot(texelFetch(u_cmf, ivec2(L, 0), 0), selector) / maxRnd * float(8300 - 3900 + 1));
        }

        uniform sampler2D u_srgb_reflect;

        float sampleSrgb(vec3 rgb, float wavelength) {
            return dot(
                rgb,
                texture(u_srgb_reflect, vec2((wavelength - 390.0 + 0.5) / (780.0 - 390.0 + 1.0), 0.5)).rgb
            );
        }

        uniform sampler2D u_d65;

        float sampleD65(float wavelength) {
            return texture(u_d65, vec2((wavelength - 300.0 + 2.5) / (780.0 - 300.0 + 5.0), 0.5)).r;
        }

        uniform sampler2D u_glass_data;

        vec2 sampleGlass(float wavelength, int mat)
        {
            if (mat == 0) {
                return vec2(1, 10);
            } else if (mat == 1) {
                return vec2(1, 0);
            } else {
                float matf = float(mat - 2) + 0.5;
                return texture(u_glass_data, vec2((wavelength - 390.0 + 0.5) / (830.0 - 390.0 + 1.0), matf / 3.0)).rg;
            }
        }

        bool sensor(inout Ray ray, inout float emit, float wavelength, float timeSample) {
            Intersection event;

            scene(event, ray, timeSample);

            vec2 nk_up = sampleGlass(wavelength, event.upMaterial);
            vec2 nk_down = sampleGlass(wavelength, event.downMaterial);

            float extinctionK = -4.0 * ${Math.PI} / (wavelength * 1e-9) * nk_up.y;

            if (rnd_uniform() >= exp(extinctionK * length(event.t*ray.direction))) {
                return false;
            }

            if (event.t > 0.0 && event.t < maxT) {
                float contrib = sampleSrgb(event.emits, wavelength) * sampleD65(wavelength);
                if (event.downMaterial == 0 && !isnan(contrib) && !isinf(contrib)) emit += contrib;
            } else {
                return false;
            }

            if (rnd_uniform() >= sampleSrgb(event.albedo, wavelength)) {
                return false;
            }

            ray.start = event.surface;

            if (event.upMaterial > 0 && event.downMaterial > 0) {
                vec3 id = normalize(ray.direction);
                float refProb = frDielectric(dot(-id, event.n), complexDiv(nk_down, nk_up));
                float coin = rnd_uniform();
                if (coin < refProb) {
                    ray.direction = reflect(ray.direction, event.n);
                } else {
                    ray.direction = refract(id, event.n, complexDiv(nk_up, nk_down).x);
                }
            } else {
                ray.direction = sampleCosineHemisphere(event.n);
            }

            return true;
        }

        uniform float u_max_samples_per_pixel;
        uniform float u_target_variance;
        uniform float u_pin_hole_radius;
        uniform float u_vignette;

        void pass(inout vec2 accumulator, inout vec4 throughput, inout vec4 start, inout vec4 direction, uint refresh_seed) {
            vec4 filterMask = vec4(0, 1, 0, 0);

            {
                vec2 scr = floor(gl_FragCoord.xy);
                filterMask = sign(vec4(
                    mod(scr.x + 1.0, 2.0) * mod(scr.y + 1.0, 2.0),
                    mod(scr.x + scr.y, 2.0),
                    mod(scr.x, 2.0) * mod(scr.y, 2.0),
                    0
                ));
            }

            vec2 currentWs;
            float timeSample;
            {
                uint tmp_seed = rnd_seed;
                rnd_seed = floatBitsToUint(direction.a);
//                rnd_seed = hash2(uvec3(gl_FragCoord.xy, rnd_seed));
                currentWs = sampleXyz(filterMask);
                rnd_uniform(); // time sample
                timeSample = rnd_uniform();
                rnd_seed = tmp_seed;
            }

            if (throughput.r > 0.0) {
                Ray ray = Ray(start.xyz, direction.xyz);
                float emit = 0.0;
                bool hadHit = sensor(ray, emit, currentWs.x, timeSample);
                throughput.b += emit * throughput.r;

                if (hadHit) {
                    start.xyz = ray.start;
                    direction.xyz = ray.direction;
                    return;
                }
            }

            // new ray
            if (direction.xyz != vec3(0)) {
                float x, mean;

                vec3 tmp;
                tmp = throughput.b * (filterMask.rgb * texelFetch(u_cmf, ivec2(8300 - 3900 + 1 - 1, 1), 0).rgb / float(8300 - 3900 + 1));
                x = dot(filterMask.rgb, tmp);
                mean = accumulator.x;

                accumulator.x *= accumulator.y;
                accumulator.x += x;
                accumulator.y += 1.0;
                accumulator.x /= accumulator.y;

                float delta = x - mean;
                mean += delta / accumulator.y;
                float delta2 = x - mean;
                throughput.a += delta * delta2;
            }

            rnd_seed = refresh_seed;
            direction.a = uintBitsToFloat(rnd_seed);

            currentWs = sampleXyz(filterMask);
            {
                uint tmp_seed = rnd_seed;
                rnd_seed = floatBitsToUint(direction.a);
//                rnd_seed = hash2(uvec3(gl_FragCoord.xy, rnd_seed));
                currentWs = sampleXyz(filterMask);
                rnd_seed = tmp_seed;
            }

            float time = rnd_uniform(); // time sample

            ${({
                box: `vec2 p = (gl_FragCoord.xy - 0.5) + vec2(rnd_uniform(), rnd_uniform());`,
                gauss: `vec2 p = gl_FragCoord.xy + rnd_normal();`,
                cauchy: `
                        vec3 hemi = sampleCosineHemisphere(vec3(0, 0, 1));
                        hemi /= hemi.z;
                        vec2 p = gl_FragCoord.xy + hemi.xy;`
            })[aa]}

            vec2 s = (p / u_resolution * 2.0 - 1.0) / u_magnification + u_offset;
            vec3 image = s.x * u_sensor_x + s.y * u_sensor_y - u_sensor_n;

            vec3 norm_sensor_n = normalize(-u_sensor_n);
            Ray ray;
            ray.start = u_pin_hole_radius * sampleUnitDisc(norm_sensor_n);
            ray.direction = ray.start - image;

            float cameraD2 = dot(ray.direction, ray.direction);
            float cameraCos = dot(ray.direction, norm_sensor_n);

            throughput.r = u_vignette > 0.0 ? (cameraCos * cameraCos / (cameraD2 * cameraD2) * ${Math.PI}) : 1.0;

            throughput.b = 0.0;

            if (isnan(throughput.r) || isinf(throughput.r)) {
                throughput.r = 0.0;
                ray.direction = vec3(0);
            }

            ray.start += u_camera_pos;
//            ray.start.y += max(0.0, 2.0 * time - 9.8 * time * time / 2.0);

            start.xyz = ray.start;
            direction.xyz = ray.direction;
        }

        uniform float u_passes_per_frame;
        uniform float u_pixels_correlate;
        uniform uint u_i_seed;

        void main() {
            vec2 accumulator = texelFetch(u_source, ivec2(gl_FragCoord.xy), 0).ra;
            vec4 throughput = texelFetch(u_source_throughput, ivec2(gl_FragCoord.xy), 0);
            vec4 start = texelFetch(u_source_start, ivec2(gl_FragCoord.xy), 0);
            vec4 direction = texelFetch(u_source_direction, ivec2(gl_FragCoord.xy), 0);

            if ((u_max_samples_per_pixel == 0.0 || accumulator.y < u_max_samples_per_pixel)) {
                if (u_target_variance == 0.0 || accumulator.y < 2.0
                    || (throughput.a / (accumulator.y - 1.0) / accumulator.y > u_target_variance)
                    || (throughput.a <= 0.0)
                    || (hash2(uvec3(gl_FragCoord.xy, u_i_seed)) & 0xFu) == 0u
                ) {
                    uint refresh_seed = u_i_seed;
                    rnd_seed = floatBitsToUint(throughput.g);

                    int passes = int(u_passes_per_frame);
                    for (int i = 0; i < passes; i++) {
                        refresh_seed = hash2(uvec3(gl_FragCoord.xy * u_pixels_correlate, refresh_seed));

                        pass(accumulator, throughput, start, direction, refresh_seed);

                        if (u_max_samples_per_pixel > 0.0 && accumulator.y >= u_max_samples_per_pixel) {
                            break;
                        }
                    }

                    throughput.g = uintBitsToFloat(rnd_seed);
                }
            }

            linearRgb.ra = accumulator;
            throughputOut = throughput;
            startOut = start;
            directionOut = direction;
        }
    `)

    const xyzToggle = binaryControl('Export XYZ in EXR', false)

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

        if (xyzToggle.value) {
          string('chromaticities')
          chromaticities(
            1, 0,
            0, 1,
            0, 0,
            1/3, 1/3
          )
        }

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

        justCopy.draw({
            u_source: finalBuffer,
            u_exposure: exposure.value,
            u_cmf: cmf,
            u_xyz: xyzToggle.value ? 1.0 : 0.0,
            u_demosaic: demosaicModes[demosaicSwitch.value],
        }, finalBuffer)
        finalBuffer.swap()
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
        a.download = 'render.exr'
        a.click()
    })

    button('Save as RAW', () => {
        const stream = []
        function int(size, num) {
            for (let i = 0; i < size; i++) {
                stream.push(num & 0xFF)
                num = num >> 8
            }
        }
        function float(num) {
            const f = new Float32Array([num])
            const b = new Uint8Array(f.buffer)
            for (let x of b) {
                stream.push(x)
            }
        }

        justCopy.draw({
            u_source: finalBuffer,
            u_exposure: exposure.value,
            u_cmf: cmf,
            u_xyz: 1.0,
            u_demosaic: 3.0,
        }, finalBuffer)
        finalBuffer.swap()
        const pixels = new Float32Array(finalBuffer.width * finalBuffer.height * 4);
        gl.readPixels(0, 0, finalBuffer.width, finalBuffer.height, gl.RGBA, gl.FLOAT, pixels)

        for (let y = finalBuffer.height - 1; y >= 0; y--) {
            for (let x = 0; x < finalBuffer.width; x++) {
                float(pixels[(y * finalBuffer.width + x) * 4]);
            }
        }

        const blob = new Blob([new Uint8Array(stream)])
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'render.raw'
        a.click()
    })

    button('Save as Linear DNG', () => {
        justCopy.draw({
            u_source: finalBuffer,
            u_exposure: exposure.value,
            u_cmf: cmf,
            u_xyz: 1.0,
            u_demosaic: 3.0,
        }, finalBuffer)
        finalBuffer.swap()
        const pixels = new Float32Array(finalBuffer.width * finalBuffer.height * 4);
        gl.readPixels(0, 0, finalBuffer.width, finalBuffer.height, gl.RGBA, gl.FLOAT, pixels)

        const rows = []
        for (let y = finalBuffer.height - 1; y >= 0; y--) {
            const row = new Uint16Array(finalBuffer.width)
            for (let x = 0; x < finalBuffer.width; x++) {
                let linVal = pixels[(y * finalBuffer.width + x) * 4]
                linVal *= (1 << 16) - 1
                linVal = Math.round(linVal)
                linVal = Math.min(linVal, (1 << 16) - 1)
                linVal = Math.max(linVal, 0)
                row[x] = linVal
            }
            rows.push(row)
        }

        const blob = new Blob([dngFromRows(rows)])
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'render.dng'
        a.click()
    })

    button('Save as HDR DNG', () => {
        justCopy.draw({
            u_source: finalBuffer,
            u_exposure: exposure.value,
            u_cmf: cmf,
            u_xyz: 1.0,
            u_demosaic: 3.0,
        }, finalBuffer)
        finalBuffer.swap()
        const pixels = new Float32Array(finalBuffer.width * finalBuffer.height * 4);
        gl.readPixels(0, 0, finalBuffer.width, finalBuffer.height, gl.RGBA, gl.FLOAT, pixels)

        const rows = []
        for (let y = finalBuffer.height - 1; y >= 0; y--) {
            const row = new Float32Array(finalBuffer.width)
            for (let x = 0; x < finalBuffer.width; x++) {
                let linVal = pixels[(y * finalBuffer.width + x) * 4]
                row[x] = linVal
            }
            rows.push(row)
        }

        const blob = new Blob([dngFromRows(rows)])
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'render.dng'
        a.click()
    })

    const controller = {
        locked: false,

        maxSamples,
        sampleCount: 0,
        totalTime: 0,
        splitIndex: 0,
        splitsFinished: 0,
        splitMaxSize: resolution,

        cameraPos: cPos,
        cameraHorizontalTurns: cHorizontalTurns,
        cameraVerticalTurns:  cVerticalTurns,
        sensor: sensor
    }

    button('Unlock', () => controller.locked = false)

    function incCameraPos(delta, horizAngleDelta = 0, vertAngleDelta = 0, sensor) {
        if (controller.locked) {
            return
        }

        for (let i = 0; i < 3; i++) {
            controller.cameraPos[i] += delta[i]
        }
        controller.cameraHorizontalTurns += (horizAngleDelta % 1) + 1
        controller.cameraHorizontalTurns %= 1
        controller.cameraVerticalTurns += (vertAngleDelta % 1) + 1
        controller.cameraVerticalTurns %= 1

        const current = parseParameters()
        current.cPos = controller.cameraPos
        current.cHorizontalTurns = controller.cameraHorizontalTurns
        current.cVerticalTurns = controller.cameraVerticalTurns
        location.hash = JSON.stringify(current)

        controller.totalTime = 0
        controller.sampleCount = 0
        controller.maxSamples = maxSamples
        controller.splitsFinished = 0

        finalBuffer.update()
        rayThroughputBuffer.update()
        rayStartBuffer.update()
        rayDirectionBuffer.update()

        if (sensor) {
            controller.sensor = sensor
        }
    }

    const lensPos = numericControl('Lens Position', -2, 2, 0.001, -0.7, () => incCameraPos([0, 0, 0]))
    const lensThick = numericControl('Lens Thickness', 0, 4, 0.001, 0.455, () => incCameraPos([0, 0, 0]))
    const lensRadius1 = numericControl('Lens Radius 1', 0, 4, 0.001, 0.1, () => incCameraPos([0, 0, 0]))
    const lensRadius2 = numericControl('Lens Radius 2', 0, 4, 0.001, 0.4, () => incCameraPos([0, 0, 0]))
    const lensRadius3 = numericControl('Lens Radius 3', 0, 4, 0.001, 0.1, () => incCameraPos([0, 0, 0]))

    const magnificationCtrl = numericControl('Magnification', -10, 10, 0.01, Math.log2(magnification), () => {
        incCameraPos([0, 0, 0])
    })

    const offsetXCtrl = numericControl('Offset X', -2, 2, 0.001, offsetX, () => {
        incCameraPos([0, 0, 0])
    })

    const offsetYCtrl = numericControl('Offset Y', -2, 2, 0.001, offsetY, () => {
        incCameraPos([0, 0, 0])
    })

    const aperture = numericControl('Aperture', -20, 0, 1e-4, pinHole, () => {
        incCameraPos([0, 0, 0])
    })

    const vignetteCtrl = binaryControl('Vignette', true, () => {
        incCameraPos([0, 0, 0])
    })

    const cameraDepth = numericControl('Camera Depth', 0, 4, 1e-3, sensor, () => {
        incCameraPos([0, 0, 0], 0, 0, cameraDepth.value)
    })

    document.addEventListener('keydown', e => {
        if (document.activeElement !== document.body) {
            return
        }

        const stepSize = e.shiftKey ? 0.003 : 0.1

        const cosXZ = stepSize * Math.cos(controller.cameraHorizontalTurns * 2 * Math.PI)
        const sinXZ = stepSize * Math.sin(controller.cameraHorizontalTurns * 2 * Math.PI)

        if (e.code === 'KeyW') {
            e.preventDefault()
            incCameraPos([sinXZ, 0, cosXZ])
        } else if (e.code === 'KeyS') {
            e.preventDefault()
            incCameraPos([-sinXZ, 0, -cosXZ])
        } else if (e.code === 'KeyA') {
            e.preventDefault()
            incCameraPos([-cosXZ, 0, sinXZ])
        } else if (e.code === 'KeyD') {
            e.preventDefault()
            incCameraPos([cosXZ, 0, -sinXZ])
        } else if (e.code === 'KeyR') {
            e.preventDefault()
            incCameraPos([0, stepSize, 0])
        } else if (e.code === 'KeyF') {
            e.preventDefault()
            incCameraPos([0, -stepSize, 0])
        } else if (e.code === 'ArrowLeft') {
            e.preventDefault()
            incCameraPos([0, 0, 0], -stepSize / 6)
        } else if (e.code === 'ArrowRight') {
            e.preventDefault()
            incCameraPos([0, 0, 0], stepSize / 6)
        } else if (e.code === 'ArrowUp') {
            e.preventDefault()
            incCameraPos([0, 0, 0], 0, -stepSize / 6)
        } else if (e.code === 'ArrowDown') {
            e.preventDefault()
            incCameraPos([0, 0, 0], 0, stepSize / 6)
        } else if (e.code === 'Space') {
            e.preventDefault()
            controller.locked = true
            if (controller.sampleCount < controller.maxSamples) {
                controller.maxSamples = controller.sampleCount + 1
            } else {
                if (controller.maxSamples < maxSamples) {
                    controller.maxSamples = maxSamples
                } else {
                    controller.maxSamples = Number.MAX_VALUE
                }
            }
        } else if (e.code === 'KeyU' && e.ctrlKey) {
            e.preventDefault()
            controller.locked = false
        }
    })

    document.addEventListener('visibilitychange', e => {
        if (document.visibilityState === "hidden") {
            if (controller.sampleCount < controller.maxSamples) {
                controller.maxSamples = controller.sampleCount + 1
            }
        } else {
            if (controller.maxSamples < maxSamples) {
                controller.maxSamples = maxSamples
            } else {
                controller.maxSamples = Number.MAX_VALUE
            }
        }
    })

    const tilesProgress = binaryControl('Show Tiles Progress', false)
    const tweakedTileSize = numericControl('Tile Size', 1, resolution, 1, resolution)
    const demosaicModes = {
        'Malvar-He-Cutler': 2,
        'Bilinear': 1,
        'None': 0,
        'Mono': 3,
    }
    const demosaicSwitch = selectControl('Demosaic', Object.keys(demosaicModes), () => {},  Object.keys(demosaicModes)[0])

    for (
        let lastNow = performance.now(); ;
    ) {
        await frame()

        const newNow = performance.now()
        const timeDelta = newNow - lastNow
        lastNow = newNow

        if (controller.sampleCount < controller.maxSamples) {
            const cosXZ = Math.cos(controller.cameraHorizontalTurns * 2 * Math.PI)
            const sinXZ = Math.sin(controller.cameraHorizontalTurns * 2 * Math.PI)

            const cosYZ = Math.cos(controller.cameraVerticalTurns * 2 * Math.PI)
            const sinYZ = Math.sin(controller.cameraVerticalTurns * 2 * Math.PI)

            const totalTiles = Math.ceil(resolution / controller.splitMaxSize) * Math.ceil(resolution / controller.splitMaxSize)
            const tilesLenCount = Math.ceil(resolution / controller.splitMaxSize)

            const yTile = Math.floor(controller.splitIndex / tilesLenCount)
            const xTile = controller.splitIndex % tilesLenCount

            const passesToDo = Math.min(controller.maxSamples - controller.sampleCount, passesPerFrame.value)

            render.draw({
                u_cmf: cmf,
                u_srgb_reflect: srgbBasis,
                u_d65: d65,
                u_glass_data: limeGlass,
                u_i_seed: Math.floor(Math.random() * Math.pow(2, 32)),

                u_pixels_correlate: pixelsCorrelate.value,

                u_source: finalBuffer,
                u_source_throughput: rayThroughputBuffer,
                u_source_start: rayStartBuffer,
                u_source_direction: rayDirectionBuffer,
                u_resolution: [finalBuffer.width, finalBuffer.height],

                u_passes_per_frame: passesToDo,
                u_max_samples_per_pixel: targetMaxSample.value,
                u_target_variance: targetVariance.value,

                u_pin_hole_radius: Math.pow(2, aperture.value),
                u_vignette: vignetteCtrl.value ? 1 : 0,

                u_camera_pos: controller.cameraPos,
                u_sensor_n: [controller.sensor * sinXZ * cosYZ, -controller.sensor * sinYZ, controller.sensor * cosXZ * cosYZ],
                u_sensor_x: [-cosXZ, 0, sinXZ],
                u_sensor_y: [-sinXZ * sinYZ, -cosYZ, -cosXZ * sinYZ],

                u_lens_radius_1: lensRadius1.value,
                u_lens_radius_2: lensRadius2.value,
                u_lens_radius_3: lensRadius3.value,
                u_lens_thick: lensThick.value,
                u_lens_pos: lensPos.value,

                u_magnification: Math.pow(2, magnificationCtrl.value),
                u_offset: [offsetXCtrl.value, offsetYCtrl.value]
            }, deferredBuffer, {
                x: controller.splitMaxSize * xTile,
                y: controller.splitMaxSize * yTile,
                width: controller.splitMaxSize,
                height: controller.splitMaxSize
            })
            deferredBuffer.swap()
            controller.splitsFinished++

            controller.splitIndex++
            controller.splitIndex %= totalTiles

            if (controller.splitsFinished >= totalTiles) {
                controller.sampleCount += passesToDo
                controller.splitsFinished = 0
                deferredBuffer.swap()
            }

            if (controller.splitIndex === 0) {
                controller.splitMaxSize = tweakedTileSize.value
            }

            controller.totalTime += timeDelta

            const totalTime = controller.totalTime / 1000
            div.innerText = `Rays Count: ${controller.sampleCount}, Tiles: ${controller.splitsFinished || totalTiles}/${totalTiles} (total ${totalTime.toFixed(1)} seconds)`
        }

        if (tilesProgress.value && controller.splitsFinished > 0) {
            finalBuffer.swap()
        }
        toDitheredSrgb.draw({
            u_cmf: cmf,
            u_mark_negative: markNegaitve.value ? 1.0 : 0.0,
            u_show_counts: showCounts.value ? 1.0 : 0.0,
            u_show_variance: showVariance.value ? 1.0 : 0.0,
            u_max_samples_per_pixel: targetMaxSample.value,
            u_target_variance: targetVariance.value,
            u_source_throughput: rayThroughputBuffer,
            u_source: finalBuffer,
            u_exposure: exposure.value,
            u_tonemap: tmOperators.indexOf(tonemapping.value),
            u_use_luma: lumaBasedTm.value ? 1.0 : 0.0,
            u_tony_mc_mapface: tonemapBuffer,
            u_demosaic: demosaicModes[demosaicSwitch.value],
        }, screen)
        if (tilesProgress.value && controller.splitsFinished > 0) {
            finalBuffer.swap()
        }
    }
}

function frame() {
    return new Promise(resolve => requestAnimationFrame(resolve))
}

main().catch(e => document.body.innerText = e)