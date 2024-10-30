import buffersGl from './buffers-gl.js'
import tony_mc_mapface from './tony_mc_mapface.js'
import cie_xyz_2deg from './cie_xyz_2deg.js'
import srgb_spectral_basis from './srgb-spectral-basis.js'
import d65_data from './d65.js'
import glassData from './clear-glass.js'
import waterData from './water.js'
import mirrorData from './silver.js'
import goldData from './gold.js'
import feGlassData from './fe2-glass.js'
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
    power = 1,

    offsetX = 0, //-0.35 //-0.05 // -0.5 // -0.2
    offsetY = 0, //-0.47 //-0.67 // -0.17 // -0.5
    magnification = 0, //9 // 16 // 11

    minT = 1e-5,
    maxT = 1e9,

    lightSize = 0.5,
    pinHole = -9,
    draw = 1,

    ballRadius = 0.1,
    ballX = 0,
    ballY = -0.889,
    ballZ = 3,

    cPos = [
        -0.5899504260424525,
        -0.7399999999999999,
        2.324070581858281
    ],
    cHorizontalTurns = 0.14983333333333415,
    cVerticalTurns =  0.9950000000000003,
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
    const targetMaxSample = numericControl('Target Samples per Pixel', 0, 8192, 1, 0)
    const showCounts = binaryControl('Show Sample Counts', false)
    const capSamples = numericControl('Cap Samples at', 0, 256, 1, 0)
    const allowReuse = binaryControl('Allow Reuse', false)
    const neighReuseProb = numericControl('Neighbor Reuse Probability', 0, 1, 1e-2, 0)
    const reuseCap = numericControl('Reuse Cap', 0, 256, 1, 0)
    const reuseRadius = numericControl('Reuse Radius', 0, 100, 1, 14)
    const exposure = numericControl('Exposure', -24, 24, 1e-3, 0)
    const tmOperators = ['Clip', 'Exponential', 'Simple Reinhard', 'Tony McMapface']
    const tonemapping = selectControl('Tone Mapping', tmOperators, () => {}, tmOperators[0])

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
            width: 4,
            height: 3,
            filter: gl.NEAREST,
            format: gl.R32F,
            access: gl.RED,
            store: gl.FLOAT
        })
        shader(`
            out float result;

            const float half_eps = (uintBitsToFloat(floatBitsToUint(1.0) + 1u) - 1.0) * 0.5;

            void main() {
                result = half_eps;
            }
        `).draw({}, testBuffer)
        const output = new Float32Array(12)
        gl.readPixels(0, 0, 4, 3, gl.RED, gl.FLOAT, output)
        for (let i = 0; i < 3; i++)
        for (let j = 0; j < 4; j++) {
            let r = output[i * 4 + j]
            console.log(r)
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

    const cmf = pixelBuffer({
        width: cie_xyz_2deg.length,
        height: 2,
        filter: gl.LINEAR,
        format: gl.RGBA32F,
        access: gl.RGBA,
        store: gl.FLOAT
    })
    const cmfData = new Float32Array(cmf.bufferSize)
    for (let i = 0, j = 0; i < cie_xyz_2deg.length; i++) {
        const item = cie_xyz_2deg[i]

        while (j + 2 < d65_data.length && !(d65_data[j].wavelength <= item.wavelength && item.wavelength <= d65_data[j + 1].wavelength)) {
            j++
        }
        const a = d65_data[j]
        const b = d65_data[j + 1]
        const lerpAB = (item.wavelength - a.wavelength) / (b.wavelength - a.wavelength)
        const d65_power = (1 - lerpAB) * a.power + lerpAB * b.power

        cmfData[i * 4 + 0] = item.X * d65_power
        cmfData[i * 4 + 1] = item.Y * d65_power
        cmfData[i * 4 + 2] = item.Z * d65_power
        cmfData[i * 4 + 3] = item.wavelength

        cmfData[(i + cie_xyz_2deg.length) * 4 + 0] = item.X * d65_power + (i > 0 ? cmfData[(i - 1 + cie_xyz_2deg.length) * 4 + 0] : 0)
        cmfData[(i + cie_xyz_2deg.length) * 4 + 1] = item.Y * d65_power + (i > 0 ? cmfData[(i - 1 + cie_xyz_2deg.length) * 4 + 1] : 0)
        cmfData[(i + cie_xyz_2deg.length) * 4 + 2] = item.Z * d65_power + (i > 0 ? cmfData[(i - 1 + cie_xyz_2deg.length) * 4 + 2] : 0)
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

    const limeGlass = pixelBuffer({
        width: 830 - 390 + 1,
        height: 5,
        filter: gl.LINEAR,
        format: gl.RGBA32F,
        access: gl.RGBA,
        store: gl.FLOAT
    })
    const limeGlassData = new Float32Array(limeGlass.bufferSize)

    function fillMatLine(line, data) {
        for (let w = 390, i = 0, j = 0; w <= 830; w++) {
            while (i + 2 < data.n.length && !(data.n[i].wavelength <= w && w <= data.n[i + 1].wavelength)) {
                i++
            }
            while (j + 2 < data.k.length && !(data.k[j].wavelength <= w && w <= data.k[j + 1].wavelength)) {
                j++
            }
            const a = data.n[i]
            const b = data.n[i + 1]
            const lerpAB = (w - a.wavelength) / (b.wavelength - a.wavelength)

            const c = data.k[j]
            const d = data.k[j + 1]
            const lerpCD = (w - c.wavelength) / (d.wavelength - c.wavelength)

            limeGlassData[(w - 390 + (830 - 390 + 1) * line) * 4 + 0] = (1 - lerpAB) * a.n + lerpAB * b.n
            limeGlassData[(w - 390 + (830 - 390 + 1) * line) * 4 + 1] = (1 - lerpCD) * c.k + lerpCD * d.k
            limeGlassData[(w - 390 + (830 - 390 + 1) * line) * 4 + 2] = 0
            limeGlassData[(w - 390 + (830 - 390 + 1) * line) * 4 + 3] = w
        }
    }

    fillMatLine(0, glassData);
    fillMatLine(1, waterData);
    fillMatLine(2, mirrorData);
    fillMatLine(3, goldData);
    fillMatLine(4, feGlassData);

    limeGlass.update(limeGlassData)

    const toDitheredSrgb = shader(`
        out vec4 sRgb;

        precision highp sampler2D;
        uniform sampler2D u_source;
        uniform float u_exposure;
        uniform float u_tonemap;

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
            if (uint(${power}) != 1u) {
                fetched.rgb = clamp(1.0 - pow((fetched.a - fetched.rgb) / fetched.a, 1.0 / vec3(float(${power}))), 0.0, 1.0);
            }

            vec4 filterMask = vec4(
                ((scr.x + 1) % 2) * ((scr.y + 1) % 2),
                (scr.x + scr.y) % 2,
                (scr.x % 2) * (scr.y % 2),
                1
            );

            fetched.rgb *= filterMask.rgb * texelFetch(u_cmf, ivec2(8300 - 3900 + 1 - 1, 1), 0).rgb / float(8300 - 3900 + 1);
            return fetched;
        }

        uniform sampler2D u_source_throughput;

        uniform float u_max_samples_per_pixel;

        void main() {
//            float y = texelFetch(u_source, ivec2(gl_FragCoord.xy), 0).g;
//            uint r = floatBitsToUint(texelFetch(u_source, ivec2(gl_FragCoord.xy), 0).b);
//            sRgb = vec4(vec3(float(y)) / pow(2.0, 4.0), 1);
//            return;
            vec4 fetched;
            {
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
                    fetched.rgb = (u_max_samples_per_pixel > 0.0 && fetched.a >= u_max_samples_per_pixel) ? vec3(0, 1, 0) : 1.0 - exp(fetched.a * vec3(-1e-2, -1e-4, -1e-3));
                }
            }

            vec3 exposed = exp2(u_exposure) * fetched.rgb;
            if (u_show_counts == 0.0) {
                exposed = inverse(rgbToXyz(
                    vec2(0.6400, 0.3300),
                    vec2(0.3000, 0.6000),
                    vec2(0.1500, 0.0600),
                    vec2(0.3127, 0.3290)
                )) * exposed;
            }

            float luma = dot(exposed, vec3(0.2126, 0.7152, 0.0722));

            sRgb = ditherFinal(fromLinear(
              (u_tonemap == 3.0) ? tonemap(exposed) : (exposed * tonemap(vec3(luma)) / luma)
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
            if (uint(${power}) != 1u) {
                fetched.rgb = clamp(1.0 - pow((fetched.a - fetched.rgb) / fetched.a, 1.0 / vec3(float(${power}))), 0.0, 1.0);
            }

            vec4 filterMask = vec4(
                ((scr.x + 1) % 2) * ((scr.y + 1) % 2),
                (scr.x + scr.y) % 2,
                (scr.x % 2) * (scr.y % 2),
                1
            );

            fetched.rgb *= filterMask.rgb * texelFetch(u_cmf, ivec2(8300 - 3900 + 1 - 1, 1), 0).rgb / float(8300 - 3900 + 1);
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

    const rnd_utils = (`
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

        struct Basis2D {
            vec3 p1;
            vec3 p2;
        };

        Basis2D basis2D(vec3 n) {
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

            return Basis2D(p1, p2);
        }

        vec3 sampleUnitDisc(vec3 n) {
            float r = sqrt(rnd_uniform());
            float phi = 2.0 * ${Math.PI} * rnd_uniform();

            Basis2D b = basis2D(n);

            return r * (b.p1 * cos(phi) + b.p2 * sin(phi));
        }

        vec3 sampleCosineHemisphere(vec3 n) {
            vec3 disc = sampleUnitDisc(n);
            return disc + n * sqrt(1.0 - dot(disc, disc));
        }
    `)

    const scene = (`
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

            // -1 - polaroid (albedo is direction of polarization)
            // 0 - diffuse solid
            // 1 - air
            // 2 - glass
            // 3 - water
            // 4 - silver
            // 5 - gold
            // 6 - fe-glass
            int upMaterial;
            int downMaterial;
        };

        float insideAabb(vec3 p, vec3 low, vec3 high) {
            return float(all(lessThan(low - minT, p))) * float(all(lessThan(p, high + minT)));
        }

        float aabb(float upperT, Ray ray, vec3 a, vec3 b) {
            vec3 low = min(a, b);
            vec3 high = max(a, b);

            vec3 t1 = clamp((low - ray.start) / ray.direction, 0.0, upperT);
            vec3 t2 = clamp((high - ray.start) / ray.direction, 0.0, upperT);

            return min(1.0,
                   insideAabb(ray.start + ray.direction * t1.x, low, high)
                 + insideAabb(ray.start + ray.direction * t1.y, low, high)
                 + insideAabb(ray.start + ray.direction * t1.z, low, high)
                 + insideAabb(ray.start + ray.direction * t2.x, low, high)
                 + insideAabb(ray.start + ray.direction * t2.y, low, high)
                 + insideAabb(ray.start + ray.direction * t2.z, low, high));
        }

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

        void polaroid(
            inout Intersection event, Ray ray,
            vec3 a, vec3 b, vec3 c, vec3 d
        ) {
            vec3 ab = b - a;
            vec3 ad = d - a;
            vec3 n = normalize(cross(ab, ad));

            if (sign(-dot(n, ray.direction)) < 0.0) {
                n = -n;
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
                event.albedo = normalize(ab);
                event.emits = vec3(0);
                event.upMaterial = -1;
                event.downMaterial = -1;
            }
        }

        int quadFace(
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

            int hit = 0;
            if (L > minT && L < event.t && inside) {
                event.t = L;
                event.surface = p;
                event.n = n;
                event.albedo = vec3(1);
                event.emits = vec3(0);
                event.upMaterial = mat_up;
                event.downMaterial = mat_down;
                hit = 1;
            }

            return hit;
        }

        int brick(
            inout Intersection event, Ray ray,
            vec3 a, vec3 b, vec3 n,
            float width, float depth,
            int mat_up, int mat_down
        ) {
            width *= 0.5;
            depth *= 0.5;

            vec3 s = normalize(cross(b - a, n));
            vec3 abn = normalize(b - a);
            a -= abn * width;
            b += abn * width;

            vec3 a1 = a + width * s + depth * n;
            vec3 a2 = a - width * s + depth * n;
            vec3 a3 = a - width * s - depth * n;
            vec3 a4 = a + width * s - depth * n;

            vec3 b1 = b + width * s + depth * n;
            vec3 b2 = b - width * s + depth * n;
            vec3 b3 = b - width * s - depth * n;
            vec3 b4 = b + width * s - depth * n;

            vec3 low = min(min(min(a1, a2), min(a3, a4)), min(min(b1, b2), min(b3, b4)));
            vec3 high = max(max(max(a1, a2), max(a3, a4)), max(max(b1, b2), max(b3, b4)));
            if (0.0 == aabb(event.t, ray, low, high)) {
                return 0;
            }

            int hit = 0;

            hit += quadFace(
                event, ray,
                a4, a3, a2, a1,
                mat_up, mat_down
            );

            hit += quadFace(
                event, ray,
                b1, b2, b3, b4,
                mat_up, mat_down
            );

            hit += quadFace(
                event, ray,
                a1, a2, b2, b1,
                mat_up, mat_down
            );

            hit += quadFace(
                event, ray,
                a2, a3, b3, b2,
                mat_up, mat_down
            );

            hit += quadFace(
                event, ray,
                a3, a4, b4, b3,
                mat_up, mat_down
            );

            hit += quadFace(
                event, ray,
                a4, a1, b1, b4,
                mat_up, mat_down
            );

            return hit;
        }

        void frame(
            inout Intersection event, Ray ray,
            vec3 a, vec3 b, vec3 c, vec3 d,
            float width, float depth
        ) {
            vec3 ab = b - a;
            vec3 ad = d - a;
            vec3 n = normalize(cross(ab, ad));

            int hit = 0;

            hit += brick(
                event, ray,
                a, b, n,
                width, depth,
                1, 5
            );

            hit += brick(
                event, ray,
                b, c, n,
                width, depth,
                1, 5
            );

            hit += brick(
                event, ray,
                c, d, n,
                width, depth,
                1, 5
            );

            hit += brick(
                event, ray,
                d, a, n,
                width, depth,
                1, 5
            );

            if (hit > 0 && event.downMaterial == 5) {
                event.albedo = vec3(0.5);
                event.downMaterial = 0;
            }
        }

        void framedPolaroid(
            inout Intersection event, Ray ray,
            vec3 a, vec3 b, vec3 c, vec3 d
        ) {
            const float width = 0.01;
            const float depth = 0.002;

            vec3 ab = normalize(b - a);
            vec3 ad = normalize(d - a);
            vec3 n = cross(ab, ad);

            vec3 off = max(
                0.5 * depth * n - 0.5 * width * (ab + ad),
                -0.5 * depth * n - 0.5 * width * (ab + ad)
            );

            vec3 low = min(min(
                min(a - 0.5 * width * (ab + ad) - 0.5 * depth * n, a - 0.5 * width * (ab + ad) + 0.5 * depth * n),
                min(b - 0.5 * width * (-ab + ad) - 0.5 * depth * n, b - 0.5 * width * (-ab + ad) + 0.5 * depth * n)
            ), min(
                min(c + 0.5 * width * (ab + ad) - 0.5 * depth * n, c + 0.5 * width * (ab + ad) + 0.5 * depth * n),
                min(d + 0.5 * width * (-ab + ad) - 0.5 * depth * n, d + 0.5 * width * (-ab + ad) + 0.5 * depth * n)
            ));
            vec3 high = max(max(
                max(a - 0.5 * width * (ab + ad) - 0.5 * depth * n, a - 0.5 * width * (ab + ad) + 0.5 * depth * n),
                max(b - 0.5 * width * (-ab + ad) - 0.5 * depth * n, b - 0.5 * width * (-ab + ad) + 0.5 * depth * n)
            ), max(
                max(c + 0.5 * width * (ab + ad) - 0.5 * depth * n, c + 0.5 * width * (ab + ad) + 0.5 * depth * n),
                max(d + 0.5 * width * (-ab + ad) - 0.5 * depth * n, d + 0.5 * width * (-ab + ad) + 0.5 * depth * n)
            ));

            if (0.0 == aabb(event.t, ray, low, high)) {
                return;
            }

            polaroid(
                event, ray,
                a, b, c, d
            );

            frame(
                event, ray,
                a, b, c, d,
                width, depth
            );
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

        void disc(
            inout Intersection event, Ray ray,
            vec3 center, vec3 axis,
            float radius1, float radius2,
            vec3 albedo, vec3 emits,
            int mat_up, int mat_down
        ) {
            float t = dot(axis, center - ray.start) / dot(ray.direction, axis);
            vec3 s = ray.start + t * ray.direction;
            if (t > minT && t < event.t && distance(s, center) <= radius1 && distance(s, center) >= radius2) {
                event.t = t;
                event.surface = s;
                event.n = axis * sign(-dot(ray.direction, axis));
                event.albedo = albedo;
                event.emits = emits;
                event.upMaterial = dot(ray.direction, axis) < 0.0 ? mat_up : mat_down;
                event.downMaterial = dot(ray.direction, axis) < 0.0 ? mat_down : mat_up;
            }
        }

        void cylinder(
            inout Intersection event, Ray ray,
            vec3 center, vec3 axis,
            float radius, float height,
            vec3 albedo, vec3 emits,
            int mat_up, int mat_down
        ) {
            vec3 flatRay = normalize(ray.direction - dot(ray.direction, axis) * axis);
            vec3 circleCenter = center - ray.start - dot(center - ray.start, axis) * axis;
            vec3 centerRayNormal = circleCenter - dot(flatRay, circleCenter) * flatRay;
            float centerRaySqDist = dot(centerRayNormal, centerRayNormal);

            if (centerRaySqDist <= radius * radius) {
                {
                    float t = dot(flatRay, circleCenter) - sqrt(radius * radius - centerRaySqDist);
                    vec3 n = normalize(flatRay * t - circleCenter);
                    t /= dot(ray.direction, flatRay);
                    vec3 s = ray.start + t * ray.direction;

                    if (t > minT && t < event.t && dot(s - center, axis) >= 0.0 && dot(s - center, axis) <= height) {
                        event.t = t;
                        event.surface = s;
                        event.n = n;
                        event.albedo = albedo;
                        event.emits = emits;
                        event.upMaterial = mat_up;
                        event.downMaterial = mat_down;
                    }
                }
                {
                    float t = dot(flatRay, circleCenter) + sqrt(radius * radius - centerRaySqDist);
                    vec3 n = normalize(flatRay * t - circleCenter);
                    t /= dot(ray.direction, flatRay);
                    vec3 s = ray.start + t * ray.direction;

                    if (t > minT && t < event.t && dot(s - center, axis) >= 0.0 && dot(s - center, axis) <= height) {
                        event.t = t;
                        event.surface = s;
                        event.n = -n;
                        event.albedo = albedo;
                        event.emits = emits;
                        event.upMaterial = mat_down;
                        event.downMaterial = mat_up;
                    }
                }
            }
        }

        void tube(
            inout Intersection event, Ray ray,
            vec3 center, vec3 axis,
            float height,
            float radius1, float radius2,
            int mat_up, int mat_down
        ) {
            cylinder(
                event, ray,
                center, axis,
                radius1, height,
                vec3(1), vec3(0),
                mat_up, mat_down
            );
            cylinder(
                event, ray,
                center, axis,
                radius2, height,
                vec3(1), vec3(0),
                mat_down, mat_up
            );
            disc(
                event, ray,
                center, -axis,
                radius1, radius2,
                vec3(1), vec3(0),
                mat_up, mat_down
            );
            disc(
                event, ray,
                center + axis * height, axis,
                radius1, radius2,
                vec3(1), vec3(0),
                mat_up, mat_down
            );
        }

        void glassOfWater(
            inout Intersection event, Ray ray,
            vec3 center, vec3 axis,
            float height1, float height2, float height3, bool water,
            float radius1, float radius2
        ) {
            vec3 c_low = center - vec3(radius1);
            vec3 c_high = center + vec3(radius1);
            vec3 h_low = center + height1 * axis - vec3(radius1);
            vec3 h_high = center + height1 * axis + vec3(radius1);

            if (0.0 == aabb(event.t, ray, min(min(c_low, c_high), min(h_low, h_high)), max(max(c_low, c_high), max(h_low, h_high)))) {
                return;
            }

            disc(
                event, ray,
                center, -axis,
                radius1, -1.0,
                vec3(1), vec3(0),
                1, 6
            );
            cylinder(
                event, ray,
                center, axis,
                radius1, height1,
                vec3(1), vec3(0),
                1, 6
            );
            disc(
                event, ray,
                center + axis * height1, axis,
                radius1, radius2,
                vec3(1), vec3(0),
                1, 6
            );
            cylinder(
                event, ray,
                center + axis * height2, axis,
                radius2, height1 - height2,
                vec3(1), vec3(0),
                6, 1
            );
            disc(
                event, ray,
                center + axis * height2, axis,
                radius2, -1.0,
                vec3(1), vec3(0),
                1, 6
            );
            if (water) {
                vec3 bottomCenter = center + axis * height2;
                float t = ((bottomCenter.y + height3) - ray.start.y) / ray.direction.y;
                vec3 s = ray.start + t * ray.direction;
                s.y = bottomCenter.y + height3;
                vec3 perp = s - bottomCenter - axis * dot(s - bottomCenter, axis);
                if (t > minT && t < event.t && length(perp) <= radius2 && dot(s - bottomCenter, axis) >= 0.0) {
                    event.t = t;
                    event.surface = s;
                    event.n = vec3(0, 1, 0);
                    event.albedo = vec3(1);
                    event.emits = vec3(0);
                    event.upMaterial = 1;
                    event.downMaterial = 3;
                } else {
                   vec3 bottomCenter = center + axis * height2;
                   vec3 perp2 = event.surface - bottomCenter - axis * dot(event.surface - bottomCenter, axis);
                   if (event.surface.y < (bottomCenter.y + height3) && length(perp2) <= radius2 + minT && dot(event.surface - bottomCenter, axis) >= -minT) {
                       event.upMaterial = event.upMaterial == 1 ? 3 : event.upMaterial;
                       event.downMaterial = event.downMaterial == 1 ? 3 : event.downMaterial;
                   }
               }
            }
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

        uniform float u_polaroids_on;
        uniform float u_polaroid;

        Intersection scene(Ray ray, float timeSample) {
            Intersection event;
            event.t = maxT;

            if (1.0 == aabb(event.t, ray, vec3(0.995, -0.9, 2.1), vec3(1, 0.9, 3.9))) {
                // flat mirror metal layer (needs to be before the wall, because they are in the same plane)
                aaSquare(
                    event, ray,
                    vec3(-1, 0, 0),
                    vec3(1, 0, 3),
                    0.9,
                    vec3(1),
                    vec3(0),
                    2, 4
                );
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
            }

            // floor
            aaSquare(
                event, ray,
                vec3(0, 1, 0),
                vec3(0, -1, 3),
                1.0,
                vec3(0.5),
                vec3(0)
            );

            // ceiling with light
            halfEmitSquare(
                event, ray,
                vec3(0, -1, 0),
                vec3(0, 1, 3),
                1.0,
                vec3(0.5),
                vec3(1),
                lightSize / 2.0
            );

            // red wall (behind curved mirror)
            aaSquare(
                event, ray,
                vec3(1, 0, 0),
                vec3(-1, 0, 3),
                1.0,
                vec3(1.0, 0.1, 0.1) * 0.5,
                vec3(0)
            );

            // grey wall for the mirror
            aaSquare(
                event, ray,
                vec3(-1, 0, 0),
                vec3(1, 0, 3),
                1.0,
                vec3(0.5),
                vec3(0)
            );

            // yellow-black wall
            diagSquare(
                event, ray,
                vec3(0, 0, -1),
                vec3(0, 0, 4),
                1.0,
                vec3(1, 0.5, 0.5) * 0.1,
                vec3(1, 1, 0.1) * 0.5
            );

            // grey wall (used to not exist for cornell box)
            aaSquare(
                event, ray,
                vec3(0, 0, 1),
                vec3(0, 0, 2),
                1.0,
                vec3(0.5),
                vec3(0)
            );

            if (u_polaroids_on > 0.0) { // polaroids
                vec3 center = u_camera_pos + normalize(u_sensor_n) * 0.05;
                Basis2D face = Basis2D(u_sensor_x, u_sensor_y);

                float radius = 0.03;
                face.p1 *= radius;
                face.p2 *= radius;

                float base = u_polaroid;
                float step = float(${Math.PI / 2});

                polaroid(
                    event, ray,
                    center + face.p1 * cos(base + 0.0 * step) + face.p2 * sin(base + 0.0 * step),
                    center + face.p1 * cos(base + 1.0 * step) + face.p2 * sin(base + 1.0 * step),
                    center + face.p1 * cos(base + 2.0 * step) + face.p2 * sin(base + 2.0 * step),
                    center + face.p1 * cos(base + 3.0 * step) + face.p2 * sin(base + 3.0 * step)
                );
            }

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

            {
                bool hitExterior = sphere(
                    event, ray,
                    vec3(float(${ballX}), float(${ballY}), float(${ballZ})),
                    float(${ballRadius}),
                    vec3(1),
                    vec3(0),
                    1, 2
                );
                if (hitExterior) {
                    bool hitInterior = sphere(
                        event, ray,
                        vec3(float(${ballX}), float(${ballY}), float(${ballZ})),
                        float(${ballRadius - 0.005}),
                        vec3(1),
                        vec3(0),
                        2, 3
                    );

                    if (hitInterior) {
                        float c_y = float(${ballY}) + float(${ballRadius - 0.005}) * 0.1;
                        if (event.surface.y > c_y) {
                            if (event.upMaterial == 3) event.upMaterial = 1;
                            if (event.downMaterial == 3) event.downMaterial = 1;
                        }

                        vec3 w_surface = vec3(float(${ballX}), c_y, float(${ballZ}));
                        float t = (w_surface.y - ray.start.y) / ray.direction.y;
                        vec3 s = ray.start + t * ray.direction;
                        s.y = c_y;
                        if (t > minT && t < event.t) {
                            event.t = t;
                            event.surface = s;
                            event.n = vec3(0, -sign(ray.direction.y), 0);
                            event.albedo = vec3(1);
                            event.emits = vec3(0);
                            if (ray.direction.y < 0.0) {
                                event.upMaterial = 1;
                                event.downMaterial = 3;
                            } else {
                                event.upMaterial = 3;
                                event.downMaterial = 1;
                            }
                       }
                    }
                }
            }
            {
                const float fishtankRad = 0.1;
                const float fishtankHeight = 0.2;
                const float fishtankThick = 0.0025;
                const float fishtankBottom = 0.0049;
                float fishtankFill = 0.15;
                const vec3 fishtankPos = vec3(0.2, -0.999, 2.7);

                if (1.0 == aabb(
                    event.t, ray,
                    fishtankPos - vec3(fishtankRad, 0, fishtankRad),
                    fishtankPos + vec3(fishtankRad, fishtankHeight, fishtankRad)
                )) {
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
            }

            if (false) {
                vec3 prismPos = vec3(0, 0, 3.0);

                vec3 thicknessDirection = vec3(0, 0, 1);
                vec3 faceClockUp = vec3(0, 1, 0);
                vec3 faceClockRight = vec3(1, 0, 0);
                const float third = float(${2 * Math.PI / 3});
                float angle = timeSample*0.2;

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

            if (1.0 == aabb(event.t, ray, vec3(-0.21, -0.909, 2.881), vec3(-0.19, -0.891, 2.91))) {
                tube(
                    event, ray,
                    vec3(-0.1 - 0.1, -1.0 + 0.091, 2.85 + 0.05), vec3(0, 1, 0),
                    0.004,
                    0.010, 0.009,
                    1, 5
                );

                float d1 = (0.01 * 0.01 + 0.008 * 0.008 - 0.010 * 0.010) / (2.0 * 0.01);
                float hand = d1 + 0.009;
                float iSin = 0.004 / hand;
                float iCos = sqrt(1.0 - iSin * iSin);

                float lz = d1 * iCos;
                float ly = d1 * iSin;

                tube(
                    event, ray,
                    vec3(-0.1 - 0.1, -0.996 - ly + 0.091, 2.84 + d1 - lz + 0.05), vec3(0, iCos, -iSin),
                    0.004,
                    0.009, 0.008,
                    1, 5
                );
            }

            {
                glassOfWater(
                    event, ray,
                    vec3(0.1, -0.95, 3.15), vec3(sin(0.3), cos(0.3), 0),
                    0.09, 0.01, 0.05, true,
                    0.037, 0.035
                );
                glassOfWater(
                    event, ray,
                    vec3(-0.1, -0.98, 3.15), vec3(0, cos(0.3), sin(0.3)),
                    0.09, 0.01, 0.02, true,
                    0.037, 0.035
                );
                glassOfWater(
                    event, ray,
                    vec3(0.13, -0.94, 2.89), vec3(0, sin(0.8), cos(0.8)),
                    0.09, 0.01, 0.01, true,
                    0.037, 0.035
                );
                glassOfWater(
                    event, ray,
                    vec3(-0.2, -0.999 + 0.09, 2.9), vec3(0, -1, 0),
                    0.09, 0.01, 0.0, false,
                    0.037, 0.035
                );
            }

            return event;
        }
    `)

    const coding = (`
        struct Res {
            float W;
            float M;
            uint sample_seed;
            vec2 mosaic_shift;
        };

        struct Rendering {
            Ray ray;
            vec2 polarization;

            Res own;
            Res alien;

            float cross_value;
            uint state;
            uint count_down;

            uint running_seed;
            bool sample_allowed;
        };

        struct Package {
            vec4 v0;
            vec4 v1;
            vec4 v2;
            vec4 v3;
        };

        Package pack(Rendering r) {
            return Package(
                vec4(
                    r.own.W,
                    r.polarization.x,
                    uintBitsToFloat(r.own.sample_seed),
                    r.own.M
                ),
                vec4(
                    r.polarization.y,
                    uintBitsToFloat(r.running_seed),
                    uintBitsToFloat(
                        r.state +
                        (r.sample_allowed ? 1u : 0u) * 8u +
                        (r.cross_value > 0.0 ? 1u : 0u) * 16u +
                        (uint(floor(r.own.mosaic_shift.x)) % 2u) * 32u +
                        (uint(floor(r.own.mosaic_shift.y)) % 2u) * 64u +
                        (uint(floor(r.alien.mosaic_shift.x)) % 2u) * 128u +
                        (uint(floor(r.alien.mosaic_shift.y)) % 2u) * 256u +
                        r.count_down * 512u
                    ),
                    r.alien.W
                ),
                vec4(
                    r.ray.start,
                    r.alien.M
                ),
                vec4(
                    r.ray.direction,
                    uintBitsToFloat(r.alien.sample_seed)
                )
            );
        }

        Rendering unpack(Package p) {
            uint word = floatBitsToUint(p.v1.z);

            uint state = word % 8u; word /= 8u;
            uint sample_allowed = word % 2u; word /= 2u;
            uint cross_value = word % 2u; word /= 2u;
            uint own_mosaic_shift_x = word % 2u; word /= 2u;
            uint own_mosaic_shift_y = word % 2u; word /= 2u;
            uint alien_mosaic_shift_x = word % 2u; word /= 2u;
            uint alien_mosaic_shift_y = word % 2u; word /= 2u;
            uint count_down = word;

            return Rendering(
                Ray(p.v2.xyz, p.v3.xyz),
                vec2(p.v0.y, p.v1.x),

                Res(
                    p.v0.x,
                    p.v0.w,
                    floatBitsToUint(p.v0.z),
                    vec2(own_mosaic_shift_x, own_mosaic_shift_y)
                ),
                Res(
                    p.v1.w,
                    p.v2.w,
                    floatBitsToUint(p.v3.w),
                    vec2(alien_mosaic_shift_x, alien_mosaic_shift_y)
                ),

                float(cross_value),
                state,
                count_down,

                floatBitsToUint(p.v1.y),
                sample_allowed != 0u
            );
        }
    `)

    const shift = shader(`
        layout(location = 0) out vec4 linearRgb;
        layout(location = 1) out vec4 throughputOut;
        layout(location = 2) out vec4 startOut;
        layout(location = 3) out vec4 directionOut;

        precision highp sampler2D;
        uniform vec2 u_resolution;

        uniform sampler2D u_source;
        uniform sampler2D u_source_throughput;
        uniform sampler2D u_source_start;
        uniform sampler2D u_source_direction;

        uniform float p_pin_hole_radius;
        uniform vec3 p_camera_pos;
        uniform vec3 p_sensor_n;
        uniform vec3 p_sensor_x;
        uniform vec3 p_sensor_y;
        uniform float p_magnification;
        uniform vec2 p_offset;

        uniform float u_pin_hole_radius;
        uniform vec3 u_camera_pos;
        uniform vec3 u_sensor_n;
        uniform vec3 u_sensor_x;
        uniform vec3 u_sensor_y;
        uniform float u_magnification;
        uniform vec2 u_offset;

        uniform uint u_i_seed;

        uniform float u_allow_reuse;
        uniform float u_reuse_cap;

        ${rnd_utils}
        ${scene}
        ${coding}

        vec3 filterMask(vec2 xy) {
            vec2 scr = floor(xy);
            return sign(vec3(
                mod(scr.x + 1.0, 2.0) * mod(scr.y + 1.0, 2.0),
                mod(scr.x + scr.y, 2.0),
                mod(scr.x, 2.0) * mod(scr.y, 2.0)
            ));
        }

        struct Params {
//            vec2 wave_sample;
            float time;

            Ray ray;
            bool sample_allowed;
        };

        Params getParams(vec2 xy, uint sample_seed, bool new_path) {
            uint tmp_seed = rnd_seed;
            rnd_seed = sample_seed;

            vec2 scr = floor(xy);
            vec4 filterMask = sign(vec4(
                mod(scr.x + 1.0, 2.0) * mod(scr.y + 1.0, 2.0),
                mod(scr.x + scr.y, 2.0),
                mod(scr.x, 2.0) * mod(scr.y, 2.0),
                0
            ));

            rnd_uniform(); rnd_uniform();// vec2 ws = sampleXyz(filterMask);
            float timeSample = rnd_uniform();

            Params params;
//            params.wave_sample = ws;
            params.time = timeSample;

            if (new_path) {
                vec2 p = scr + vec2(rnd_uniform(), rnd_uniform());

                vec2 s = (p / u_resolution * 2.0 - 1.0) / u_magnification + u_offset;
                vec3 image = s.x * u_sensor_x + s.y * u_sensor_y - u_sensor_n;

                vec3 norm_sensor_n = normalize(-u_sensor_n);
                Ray ray;
                ray.start = u_pin_hole_radius * sampleUnitDisc(norm_sensor_n);
                ray.direction = ray.start - image;
                ray.start += u_camera_pos;
                params.ray = ray;

                float cameraD2 = dot(ray.direction, ray.direction);
                float cameraCos = dot(ray.direction, norm_sensor_n);
                params.sample_allowed = rnd_uniform() < (cameraCos * cameraCos / (cameraD2 * cameraD2) * ${Math.PI});
            } else {
                rnd_seed = tmp_seed;
            }

            return params;
        }

        Params getPrevParams(vec2 xy, uint sample_seed, bool new_path) {
            uint tmp_seed = rnd_seed;
            rnd_seed = sample_seed;

            vec2 scr = floor(xy);
            vec4 filterMask = sign(vec4(
                mod(scr.x + 1.0, 2.0) * mod(scr.y + 1.0, 2.0),
                mod(scr.x + scr.y, 2.0),
                mod(scr.x, 2.0) * mod(scr.y, 2.0),
                0
            ));

            rnd_uniform(); rnd_uniform();// vec2 ws = sampleXyz(filterMask);
            float timeSample = rnd_uniform();

            Params params;
//            params.wave_sample = ws;
            params.time = timeSample;

            if (new_path) {
                vec2 p = scr + vec2(rnd_uniform(), rnd_uniform());

                vec2 s = (p / u_resolution * 2.0 - 1.0) / p_magnification + p_offset;
                vec3 image = s.x * p_sensor_x + s.y * p_sensor_y - p_sensor_n;

                vec3 norm_sensor_n = normalize(-p_sensor_n);
                Ray ray;
                ray.start = p_pin_hole_radius * sampleUnitDisc(norm_sensor_n);
                ray.direction = ray.start - image;
                ray.start += p_camera_pos;
                params.ray = ray;

                float cameraD2 = dot(ray.direction, ray.direction);
                float cameraCos = dot(ray.direction, norm_sensor_n);
                params.sample_allowed = rnd_uniform() < (cameraCos * cameraCos / (cameraD2 * cameraD2) * ${Math.PI});
            } else {
                rnd_seed = tmp_seed;
            }

            return params;
        }

        void main() {
            rnd_seed = hash2(uvec3(gl_FragCoord.xy, u_i_seed));
            rnd_uniform();
            uint canon_rnd_seed = rnd_seed;

            Intersection event;
            float timeSample;

            {
                vec2 p = (gl_FragCoord.xy - 0.5) + vec2(rnd_uniform(), rnd_uniform());

                vec2 s = (p / u_resolution * 2.0 - 1.0) / u_magnification + u_offset;
                vec3 image = s.x * u_sensor_x + s.y * u_sensor_y - u_sensor_n;

                vec3 norm_sensor_n = normalize(-u_sensor_n);
                Ray ray;

                ray.start = u_pin_hole_radius * sampleUnitDisc(norm_sensor_n);

                ray.direction = ray.start - image;

                ray.start += u_camera_pos;

                timeSample = rnd_uniform();

                event = scene(ray, timeSample);
            }

            ivec2 pu;
            {
                vec3 image_center = p_camera_pos - p_sensor_n;

                vec3 p_aperture = p_camera_pos + p_pin_hole_radius * sampleUnitDisc(normalize(-p_sensor_n));
                vec3 p_dir = normalize(p_aperture - event.surface);

                vec3 image = p_aperture + p_dir * length(p_sensor_n) / dot(p_dir, normalize(-p_sensor_n)) - image_center;
                vec2 s = vec2(
                    dot(p_sensor_x, image),
                    dot(p_sensor_y, image)
                );

                s -= p_offset;
                s *= p_magnification;
                s += 1.0;
                s *= u_resolution / 2.0;

                pu = ivec2(floor(s));
            }

            Rendering rendering;

            if (u_allow_reuse > 0.0 && pu.x >= 0 && pu.y >= 0 && pu.x < int(u_resolution.x) && pu.y < int(u_resolution.y)) {
                uint sample_seed = floatBitsToUint(texelFetch(u_source, pu, 0).z);
                float sampleWeight = texelFetch(u_source, pu, 0).x;
                float sampleConfidence = texelFetch(u_source, pu, 0).a;

                if (u_reuse_cap > 0.0) {
                    sampleConfidence = min(sampleConfidence, u_reuse_cap);
                }

                rendering.own.M = 0.0;
                rendering.own.W = 0.0;
                rendering.own.sample_seed = canon_rnd_seed;

                if (sampleWeight > 0.0) {
                    rendering.state = 4u;

                    rendering.alien.W = sampleWeight;
                    rendering.alien.M = sampleConfidence;
                    rendering.alien.sample_seed = sample_seed;
                    rendering.alien.mosaic_shift = vec2(pu);

                    Params params = getPrevParams(vec2(pu), rendering.own.sample_seed, true);

                    rendering.ray = params.ray;
                    rendering.sample_allowed = params.sample_allowed;
                }
            }

            if (rendering.state == 0u) {
                rendering.state = 1u;
                rendering.count_down = uint(${power});
                Params params = getParams(gl_FragCoord.xy, canon_rnd_seed, true);

                rendering.ray = params.ray;
                rendering.sample_allowed = params.sample_allowed;
                rendering.alien.sample_seed = canon_rnd_seed;
                rendering.alien.W = 1.0;
                rendering.alien.M = 1.0;
                rendering.alien.mosaic_shift = gl_FragCoord.xy;
            }

            rendering.running_seed = rnd_seed;

            Package package = pack(rendering);
            linearRgb = package.v0;
            throughputOut = package.v1;
            startOut = package.v2;
            directionOut = package.v3;
        }
    `)

    const render = shader(`
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

        uniform vec3 u_camera_pos;
        uniform vec3 u_sensor_n;
        uniform vec3 u_sensor_x;
        uniform vec3 u_sensor_y;

        ${rnd_utils}
        ${scene}

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
            if (z.x < 0.0 && z.y == 0.0) {
                return vec2(0, sqrt(-z.x));
            }

            float r = sqrt(complexAbs2(z));
            vec2 zr = z + vec2(r, 0);

            return sqrt(r) * zr / sqrt(complexAbs2(zr));
        }

        struct Fresnel {
            vec2 p_r; // reflected in incidence plane
            vec2 p_t; // transmitted in incidence plane

            vec2 s_r; // reflected in surface plane
            vec2 s_t; // transmitted in surface plane
        };

        // cosTheta_i >= 0 (?)
        // eta = n_i / n_t
        Fresnel fresnel(float cosTheta_i, vec2 eta) {
            float sin2Theta_i = 1.0 - cosTheta_i * cosTheta_i;
            vec2 sin2Theta_t = complexMultiply(vec2(sin2Theta_i, 0), complexMultiply(eta, eta));

            vec2 cosTheta_t = complexSqrt(vec2(1, 0) - sin2Theta_t);

            return Fresnel(
                complexDiv(complexMultiply(eta, cosTheta_t) - vec2(cosTheta_i, 0),
                           complexMultiply(eta, cosTheta_t) + vec2(cosTheta_i, 0)),
                complexDiv(2.0 * eta * cosTheta_i, complexMultiply(eta, cosTheta_t) + vec2(cosTheta_i, 0)),
                complexDiv(eta * cosTheta_i - cosTheta_t, eta * cosTheta_i + cosTheta_t),
                complexDiv(2.0 * eta * cosTheta_i, eta * cosTheta_i + cosTheta_t)
            );
        }

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

//            return 1.0;

//            float temperature = 3000.0;
//            float numerator = 8.0 * 3.14159265359 * 6.62607015e-34 * 3e6;
//            float denominator = pow(wavelength * 1e-9, 5.0) * (exp((6.62607015e-34 * 3e8) / (wavelength * 1e-9 * 1.38064852e-23 * temperature)) - 1.0);
//            return numerator / denominator;
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
                matf /= 5.0;
                return texture(u_glass_data, vec2((wavelength - 390.0 + 0.5) / (830.0 - 390.0 + 1.0), matf)).rg;
            }
        }

        int sensor(inout Ray ray, inout vec2 polarization, float wavelength, float timeSample) {
            Intersection event = scene(ray, timeSample);

            if (event.upMaterial < 0 && event.downMaterial < 0) {
                // polaroid:
                // put polarity into ray basis
                vec3 id = normalize(ray.direction);
                Basis2D id_basis = basis2D(id);

                vec2 pol_xy = vec2(
                    dot(event.albedo, id_basis.p1),
                    dot(event.albedo, id_basis.p2)
                );

                // decide on opacity (decode ray polarity)
                vec2 id_pol_1 = vec2(sqrt(1.0 - complexAbs2(polarization)), 0);
                vec2 id_pol_2 = polarization;

                vec2 dot_product = id_pol_1 * pol_xy.x + id_pol_2 * pol_xy.y;

                id_pol_1 -= dot_product * pol_xy.x;
                id_pol_2 -= dot_product * pol_xy.y;

                if (rnd_uniform() >= (complexAbs2(id_pol_1) + complexAbs2(id_pol_2))) {
                    return 0;
                }

                // change polarization state (encode polarity of the polaroid)
                if (id_pol_1 != vec2(0)) {
                    id_pol_1 = complexDiv(id_pol_1, id_pol_1);
                    id_pol_2 = complexDiv(id_pol_2, id_pol_1);
                }
                polarization = id_pol_2 / sqrt(complexAbs2(id_pol_1) + complexAbs2(id_pol_2));

                ray.start = event.surface;
                return 2;
            }

            vec2 nk_up = sampleGlass(wavelength, event.upMaterial);
            vec2 nk_down = sampleGlass(wavelength, event.downMaterial);

            float extinctionK = -4.0 * ${Math.PI} / (wavelength * 1e-9) * nk_up.y;

            if (rnd_uniform() >= exp(extinctionK * length(event.t*ray.direction))) {
                return 0;
            }

            if (event.t > 0.0 && event.t < maxT) {
                if (event.downMaterial == 0 && event.emits != vec3(0)) {
                    return 1;
                }
            } else {
                return 0;
            }

            if (rnd_uniform() >= sampleSrgb(event.albedo, wavelength)) {
                return 0;
            }

            ray.start = event.surface;

            if (event.upMaterial > 0 && event.downMaterial > 0) {
                vec3 id = normalize(ray.direction);

                vec2 i_pol_s, i_pol_p;
                {
                    vec3 i_s = normalize(cross(id, event.n));
                    vec3 i_p = cross(i_s, id);

                    Basis2D id_basis = basis2D(id);

                    vec2 id_pol_1 = vec2(sqrt(1.0 - complexAbs2(polarization)), 0);
                    vec2 id_pol_2 = polarization;

                    i_pol_s = id_pol_1 * dot(id_basis.p1, i_s) + id_pol_2 * dot(id_basis.p2, i_s);
                    i_pol_p = id_pol_1 * dot(id_basis.p1, i_p) + id_pol_2 * dot(id_basis.p2, i_p);
                }

                vec2 eta = complexDiv(nk_up, nk_down);

                Fresnel f = fresnel(dot(-id, event.n), eta);
                float refProb = (
                    complexAbs2(complexMultiply(i_pol_s, f.s_r)) +
                    complexAbs2(complexMultiply(i_pol_p, f.p_r))
                );

                vec2 t_pol_s, t_pol_p;
                float coin = rnd_uniform();
                if (coin < refProb) {
                    ray.direction = reflect(ray.direction, event.n);
                    t_pol_s = complexMultiply(i_pol_s, f.s_r);
                    t_pol_p = complexMultiply(i_pol_p, f.p_r);
                } else {
                    ray.direction = refract(id, event.n, eta.x);
                    t_pol_s = complexMultiply(i_pol_s, f.s_t);
                    t_pol_p = complexMultiply(i_pol_p, f.p_t);
                }

                {
                    vec3 id = normalize(ray.direction);
                    vec3 t_s = normalize(cross(id, event.n));
                    vec3 t_p = cross(t_s, id);

                    Basis2D id_basis = basis2D(id);

                    vec2 id_pol_1 = t_pol_s * dot(t_s, id_basis.p1) + t_pol_p * dot(t_p, id_basis.p1);
                    vec2 id_pol_2 = t_pol_s * dot(t_s, id_basis.p2) + t_pol_p * dot(t_p, id_basis.p2);

                    if (id_pol_1 != vec2(0)) {
                        id_pol_1 = complexDiv(id_pol_1, id_pol_1);
                        id_pol_2 = complexDiv(id_pol_2, id_pol_1);
                    }

                    polarization = id_pol_2 / sqrt(complexAbs2(id_pol_1) + complexAbs2(id_pol_2));
                }
            } else {
                ray.direction = sampleCosineHemisphere(event.n);
                polarization = vec2(rnd_uniform() < 0.5 ? 1 : 0, 0);
            }

            return 2;
        }

        uniform float u_max_samples_per_pixel;
        uniform float u_pin_hole_radius;
        uniform float u_sample_cap;
        uniform float u_neigh_reuse_prob;
        uniform float u_reuse_cap;
        uniform float u_reuse_radius;

        ${coding}

        struct Params {
            vec2 wave_sample;
            float time;

            Ray ray;
            bool sample_allowed;
        };

        Params getParams(vec2 xy, uint sample_seed, bool new_path) {
            uint tmp_seed = rnd_seed;
            rnd_seed = sample_seed;

            vec2 scr = floor(xy);
            vec4 filterMask = sign(vec4(
                mod(scr.x + 1.0, 2.0) * mod(scr.y + 1.0, 2.0),
                mod(scr.x + scr.y, 2.0),
                mod(scr.x, 2.0) * mod(scr.y, 2.0),
                0
            ));

            vec2 ws = sampleXyz(filterMask);
            float timeSample = rnd_uniform();

            Params params;
            params.wave_sample = ws;
            params.time = timeSample;

            if (new_path) {
                vec2 p = scr + vec2(rnd_uniform(), rnd_uniform());

                vec2 s = (p / u_resolution * 2.0 - 1.0) / u_magnification + u_offset;
                vec3 image = s.x * u_sensor_x + s.y * u_sensor_y - u_sensor_n;

                vec3 norm_sensor_n = normalize(-u_sensor_n);
                Ray ray;
                ray.start = u_pin_hole_radius * sampleUnitDisc(norm_sensor_n);
                ray.direction = ray.start - image;
                ray.start += u_camera_pos;
                params.ray = ray;

                float cameraD2 = dot(ray.direction, ray.direction);
                float cameraCos = dot(ray.direction, norm_sensor_n);
                params.sample_allowed = rnd_uniform() < (cameraCos * cameraCos / (cameraD2 * cameraD2) * ${Math.PI});
            } else {
                rnd_seed = tmp_seed;
            }

            return params;
        }

        Params getParams(vec2 xy, uint sample_seed) {
            return getParams(xy, sample_seed, false);
        }

        void pass(inout Rendering rendering, uint refresh_seed) {
            Params params = getParams(
                rendering.state == 2u || rendering.state == 4u ? rendering.alien.mosaic_shift : gl_FragCoord.xy,
                rendering.state == 2u || rendering.state == 4u ? rendering.own.sample_seed : rendering.alien.sample_seed
            );

            vec2 currentWs = params.wave_sample;
            float timeSample = params.time;

            int hadHit = 0;
            if (rendering.sample_allowed) {
                Ray ray = rendering.ray;
                vec2 polarization = rendering.polarization;
                hadHit = sensor(ray, polarization, currentWs.x, timeSample);

                if (hadHit == 2) {
                    rendering.ray = ray;
                    rendering.polarization = polarization;
                    return;
                }
            }

            // new ray
            rnd_seed = refresh_seed;

            if (rendering.state == 1u) {
                // new canonical sample result received
                float y = hadHit == 1 ? 1.0 : 0.0;
                if (y > 0.0 || rendering.count_down == 0u) {
                    if (uint(${power}) != 1u) {
                        rendering.own.W += y;
                    } else {
                        float m1 = rendering.own.M / (rendering.own.M + 1.0);
                        float m2 = 1.0 / (rendering.own.M + 1.0);

                        float w1 = m1 * rendering.own.W;
                        float w2 = m2 * y;

                        rendering.own.W = w1 + w2;

                        if (rnd_uniform() < w2 / rendering.own.W) {
                            rendering.own.sample_seed = rendering.alien.sample_seed;
                        }
                    }

                    rendering.own.M += 1.0;
                    rendering.state = 0u;
                }
            } else if (rendering.state == 2u) {
                // own sample in alien pixel result received
                rendering.cross_value = hadHit == 1 ? 1.0 : 0.0;
                rendering.state = 3u;

                params = getParams(gl_FragCoord.xy, rendering.alien.sample_seed, true);

                rendering.ray = params.ray;
                rendering.sample_allowed = params.sample_allowed;
                return;
            } else if (rendering.state == 3u) {
                // alien sample in own pixel result received
                float own_y_in_alien = rendering.cross_value;
                float own_y_in_own = rendering.own.W > 0.0 ? 1.0 : 0.0;
                float alien_y_in_alien = rendering.alien.W > 0.0 ? 1.0 : 0.0;
                float alien_y_in_own = hadHit == 1 ? 1.0 : 0.0;

                float p_own_y_in_alien = rendering.alien.M * own_y_in_alien;
                float p_own_y_in_own = rendering.own.M * own_y_in_own;
                float p_alien_y_in_alien = rendering.alien.M * alien_y_in_alien;
                float p_alien_y_in_own = rendering.own.M * alien_y_in_own;

                float m1 = (p_own_y_in_own + p_own_y_in_alien) > 0.0 ? p_own_y_in_own / (p_own_y_in_own + p_own_y_in_alien) : 0.0;
                float m2 = (p_alien_y_in_own + p_alien_y_in_alien) > 0.0 ? p_alien_y_in_alien / (p_alien_y_in_own + p_alien_y_in_alien) : 0.0;

                { // defensive pairwise MIS
                    float m_sum = rendering.own.M + rendering.alien.M;
                    float m_c = rendering.own.M / m_sum;
                    float m_i = rendering.alien.M / m_sum;

                    m1 *= m_i;
                    m1 += m_c;
                    m2 *= m_i;
                }

                float w1 = m1 * rendering.own.W * own_y_in_own;
                float w2 = m2 * rendering.alien.W * alien_y_in_own;

                rendering.own.W = w1 + w2;

                if (rnd_uniform() < w2 / rendering.own.W) {
                    rendering.own.sample_seed = rendering.alien.sample_seed;
                }

                rendering.own.M += rendering.alien.M;
            } else if (rendering.state == 4u) {
                // previous frame reuse (canonical sample in previous frame position received)
                rendering.cross_value = hadHit == 1 ? 1.0 : 0.0;
                rendering.state = 5u;

                params = getParams(gl_FragCoord.xy, rendering.own.sample_seed, true);

                rendering.ray = params.ray;
                rendering.sample_allowed = params.sample_allowed;
                return;
            } else if (rendering.state == 5u) {
                // previous frame reuse (canonical sample in new frame position received)
                rendering.own.W = hadHit == 1 ? 1.0 : 0.0;
                rendering.own.M = 1.0;
                rendering.own.mosaic_shift = gl_FragCoord.xy;

                rendering.state = 3u;

                params = getParams(gl_FragCoord.xy, rendering.alien.sample_seed, true);

                rendering.ray = params.ray;
                rendering.sample_allowed = params.sample_allowed;
                return;
            }

            if (u_sample_cap > 0.0) {
                rendering.own.M = min(rendering.own.M, u_sample_cap);
            }

            if (rendering.own.M > 0.0 && rnd_uniform() < u_neigh_reuse_prob) {
                ivec2 pu = ivec2(vec2(rnd_uniform() - 0.5, rnd_uniform() - 0.5) * 2.0 * u_reuse_radius);
                pu += ivec2(gl_FragCoord.xy);

                uint sample_seed = 0u;
                float sampleWeight = 0.0;
                float sampleConfidence = 0.0;

                if (pu.x >= 0 && pu.y >= 0 && pu.x < int(u_resolution.x) && pu.y < int(u_resolution.y)) {
                    sample_seed = floatBitsToUint(texelFetch(u_source, pu, 0).z);
                    sampleWeight = texelFetch(u_source, pu, 0).x;
                    sampleConfidence = texelFetch(u_source, pu, 0).a;
                }

                if (u_reuse_cap > 0.0) {
                    sampleConfidence = min(sampleConfidence, u_reuse_cap);
                }

                if (abs(2.0 * sampleConfidence / (rendering.own.M + sampleConfidence) - 1.0) < 0.1) {
                    rendering.alien.sample_seed = sample_seed;
                    rendering.alien.W = sampleWeight;
                    rendering.alien.M = sampleConfidence;
                    rendering.alien.mosaic_shift = vec2(pu);
                    rendering.state = 2u;

                    params = getParams(vec2(pu), rendering.own.sample_seed, true);

                    rendering.ray = params.ray;
                    rendering.sample_allowed = params.sample_allowed;
                    return;
                } else {
//                    rendering.state = 0u;
//                    return;
                }
            }

            if (rendering.state == 0u) {
                rendering.count_down = uint(${power});
            }

            {
                uint sample_seed = rnd_seed;
                params = getParams(gl_FragCoord.xy, sample_seed, true);

                rendering.ray = params.ray;
                rendering.sample_allowed = params.sample_allowed;
                rendering.alien.sample_seed = sample_seed;
                rendering.alien.W = 1.0;
                rendering.alien.M = 1.0;
                rendering.alien.mosaic_shift = gl_FragCoord.xy;
                rendering.state = 1u;
                rendering.count_down--;
                rendering.polarization = vec2(rnd_uniform() < 0.5 ? 1 : 0, 0);
            }
        }

        uniform float u_passes_per_frame;
        uniform uint u_i_seed;

        void main() {
            Package package = Package(
                texelFetch(u_source, ivec2(gl_FragCoord.xy), 0),
                texelFetch(u_source_throughput, ivec2(gl_FragCoord.xy), 0),
                texelFetch(u_source_start, ivec2(gl_FragCoord.xy), 0),
                texelFetch(u_source_direction, ivec2(gl_FragCoord.xy), 0)
            );

            Rendering rendering = unpack(package);

            if ((u_max_samples_per_pixel == 0.0 || rendering.own.M < u_max_samples_per_pixel)) {
                uint refresh_seed = u_i_seed;
                rnd_seed = rendering.running_seed;

                int passes = int(u_passes_per_frame);
                for (int i = 0; i < passes; i++) {
                    refresh_seed = hash2(uvec3(gl_FragCoord.xy, refresh_seed));

                    pass(rendering, refresh_seed);

                    if (u_max_samples_per_pixel > 0.0 && rendering.own.M >= u_max_samples_per_pixel) {
                        break;
                    }
                }

                rendering.running_seed = rnd_seed;
            }

            package = pack(rendering);

            linearRgb = package.v0;
            throughputOut = package.v1;
            startOut = package.v2;
            directionOut = package.v3;
        }
    `)

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
            u_xyz: 0.0,
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

    button('Save as SDR DNG', () => {
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

    let controller = {
        rayCount: 0,

        cameraPos: cPos,
        cameraHorizontalTurns: cHorizontalTurns,
        cameraVerticalTurns:  cVerticalTurns,
        cameraHole: pinHole,

        frameMag: magnification,
        frameX: offsetX,
        frameY: offsetY,
    }
    let p_controller = controller

    function incCameraPos(delta, horizAngleDelta = 0, vertAngleDelta = 0, rest) {
        const n_c = {
            cameraPos: []
        }

        for (let i = 0; i < 3; i++) {
            n_c.cameraPos[i] = controller.cameraPos[i] + delta[i]
        }
        n_c.cameraHorizontalTurns = (controller.cameraHorizontalTurns + (horizAngleDelta % 1) + 1) % 1
        n_c.cameraVerticalTurns = (controller.cameraVerticalTurns + (vertAngleDelta % 1) + 1) % 1

        n_c.cameraHole = rest?.cameraHole ?? controller.cameraHole
        n_c.frameMag = rest?.frameMag ?? controller.frameMag
        n_c.frameX = rest?.frameX ?? controller.frameX
        n_c.frameY = rest?.frameY ?? controller.frameY

        const current = parseParameters()
        current.cPos = n_c.cameraPos
        current.cHorizontalTurns = n_c.cameraHorizontalTurns
        current.cVerticalTurns = n_c.cameraVerticalTurns
        current.pinHole = n_c.cameraHole
        current.magnification = n_c.frameMag
        current.offsetX = n_c.frameX
        current.offsetY = n_c.frameY
        location.hash = JSON.stringify(current)

        n_c.rayCount = 0

        controller = n_c
    }

    const polaroidsOnCtrl = binaryControl('Polaroids On', false, () => {
        incCameraPos([0, 0, 0], 0, 0, { })
    })

    const polaroidCtrl = numericControl('Polaroid', 0, 1, 0.001, 0, () => {
        incCameraPos([0, 0, 0], 0, 0, { })
    })

    const magnificationCtrl = numericControl('Magnification', -10, 10, 0.01, magnification, () => {
        incCameraPos([0, 0, 0], 0, 0, { frameMag: magnificationCtrl.value })
    })

    const offsetXCtrl = numericControl('Offset X', -2, 2, 0.001, offsetX, () => {
        incCameraPos([0, 0, 0], 0, 0, { frameX: offsetXCtrl.value })
    })

    const offsetYCtrl = numericControl('Offset Y', -2, 2, 0.001, offsetY, () => {
        incCameraPos([0, 0, 0], 0, 0, { frameY: offsetYCtrl.value })
    })

    const aperture = numericControl('Aperture', -20, 0, 1e-4, pinHole, () => {
        incCameraPos([0, 0, 0], 0, 0, { cameraHole: aperture.value })
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
            incCameraPos([0, 0, 0])
        }
    })

    const demosaicModes = {
        'Malvar-He-Cutler': 2,
        'Bilinear': 1,
        'None': 0,
        'Mono': 3,
    }
    const demosaicSwitch = selectControl('Demosaic', Object.keys(demosaicModes), () => {},  Object.keys(demosaicModes)[0])

    for (
        ; ;
    ) {
        await frame()

        if (p_controller !== controller) {
            const p_cosXZ = Math.cos(p_controller.cameraHorizontalTurns * 2 * Math.PI)
            const p_sinXZ = Math.sin(p_controller.cameraHorizontalTurns * 2 * Math.PI)

            const p_cosYZ = Math.cos(p_controller.cameraVerticalTurns * 2 * Math.PI)
            const p_sinYZ = Math.sin(p_controller.cameraVerticalTurns * 2 * Math.PI)

            const cosXZ = Math.cos(controller.cameraHorizontalTurns * 2 * Math.PI)
            const sinXZ = Math.sin(controller.cameraHorizontalTurns * 2 * Math.PI)

            const cosYZ = Math.cos(controller.cameraVerticalTurns * 2 * Math.PI)
            const sinYZ = Math.sin(controller.cameraVerticalTurns * 2 * Math.PI)

            shift.draw({
                u_allow_reuse: allowReuse.value ? 1.0 : 0.0,
                u_reuse_cap: reuseCap.value,
                u_i_seed: Math.floor(Math.random() * Math.pow(2, 32)),

                u_source: finalBuffer,
                u_source_throughput: rayThroughputBuffer,
                u_source_start: rayStartBuffer,
                u_source_direction: rayDirectionBuffer,
                u_resolution: [finalBuffer.width, finalBuffer.height],


                p_pin_hole_radius: Math.pow(2, p_controller.cameraHole),

                p_camera_pos: p_controller.cameraPos,
                p_sensor_n: [2 * p_sinXZ * p_cosYZ, -2 * p_sinYZ, 2 * p_cosXZ * p_cosYZ],
                p_sensor_x: [-p_cosXZ, 0, p_sinXZ],
                p_sensor_y: [-p_sinXZ * p_sinYZ, -p_cosYZ, -p_cosXZ * p_sinYZ],

                p_magnification: Math.pow(2, p_controller.frameMag),
                p_offset: [p_controller.frameX, p_controller.frameY],


                u_pin_hole_radius: Math.pow(2, controller.cameraHole),

                u_camera_pos: controller.cameraPos,
                u_sensor_n: [2 * sinXZ * cosYZ, -2 * sinYZ, 2 * cosXZ * cosYZ],
                u_sensor_x: [-cosXZ, 0, sinXZ],
                u_sensor_y: [-sinXZ * sinYZ, -cosYZ, -cosXZ * sinYZ],

                u_magnification: Math.pow(2, controller.frameMag),
                u_offset: [controller.frameX, controller.frameY],
            }, deferredBuffer)

            p_controller = controller
        }

        {
            const cosXZ = Math.cos(controller.cameraHorizontalTurns * 2 * Math.PI)
            const sinXZ = Math.sin(controller.cameraHorizontalTurns * 2 * Math.PI)

            const cosYZ = Math.cos(controller.cameraVerticalTurns * 2 * Math.PI)
            const sinYZ = Math.sin(controller.cameraVerticalTurns * 2 * Math.PI)

            const passesToDo = passesPerFrame.value

            render.draw({
                u_cmf: cmf,
                u_srgb_reflect: srgbBasis,
                u_d65: d65,
                u_glass_data: limeGlass,
                u_i_seed: Math.floor(Math.random() * Math.pow(2, 32)),

                u_source: finalBuffer,
                u_source_throughput: rayThroughputBuffer,
                u_source_start: rayStartBuffer,
                u_source_direction: rayDirectionBuffer,
                u_resolution: [finalBuffer.width, finalBuffer.height],

                u_passes_per_frame: passesToDo,
                u_max_samples_per_pixel: targetMaxSample.value,
                u_sample_cap: capSamples.value,
                u_neigh_reuse_prob: neighReuseProb.value,
                u_reuse_cap: reuseCap.value,
                u_reuse_radius: reuseRadius.value,

                u_pin_hole_radius: Math.pow(2, controller.cameraHole),

                u_camera_pos: controller.cameraPos,
                u_sensor_n: [2 * sinXZ * cosYZ, -2 * sinYZ, 2 * cosXZ * cosYZ],
                u_sensor_x: [-cosXZ, 0, sinXZ],
                u_sensor_y: [-sinXZ * sinYZ, -cosYZ, -cosXZ * sinYZ],

                u_polaroids_on: polaroidsOnCtrl.value ? 1.0 : 0.0,
                u_polaroid: polaroidCtrl.value * Math.PI / 2 + Math.PI / 4,
                u_magnification: Math.pow(2, controller.frameMag),
                u_offset: [controller.frameX, controller.frameY],
            }, deferredBuffer)

            controller.rayCount += passesToDo

            div.innerText = `Rays Count: ${controller.rayCount}`
        }

        toDitheredSrgb.draw({
            u_cmf: cmf,
            u_show_counts: showCounts.value ? 1.0 : 0.0,
            u_max_samples_per_pixel: targetMaxSample.value,
            u_source_throughput: rayThroughputBuffer,
            u_source: finalBuffer,
            u_exposure: exposure.value,
            u_tonemap: tmOperators.indexOf(tonemapping.value),
            u_tony_mc_mapface: tonemapBuffer,
            u_demosaic: demosaicModes[demosaicSwitch.value],
        }, screen)
    }
}

function frame() {
    return new Promise(resolve => requestAnimationFrame(resolve))
}

main().catch(e => document.body.innerText = e)
