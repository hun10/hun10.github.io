import buffersGl from './buffers-gl.js'
import tony_mc_mapface from './tony_mc_mapface.js'
import { numericControl, button, selectControl, binaryControl } from './controls.js'

function parseParameters() {
    const parameters = {}

    location.search
        .substring(1)
        .split('&')
        .map(kv => kv.split('='))
        .forEach(([k, v]) => parameters[k] = v)

    return parameters
}
// http://localhost/render-gl.html?sensor=-1&ballZ=0.15&maxSamples=3200&ballY=-0.08
const {
    resolution = 512,
    maxSamples = Number.MAX_SAFE_INTEGER,
    tilesPerDraw = 1,
    splitMaxSize = 256,

    offsetX = 0, //-0.35 //-0.05 // -0.5 // -0.2
    offsetY = 0, //-0.47 //-0.67 // -0.17 // -0.5
    magnification = 1, //9 // 16 // 11

    minT = 1e-5,
    maxT = 1e9,

    light = 2,
    lightSize = 1,
    sensor = 2,
    pinHole = -9,
    beta = 0.5,
    minThroughput = 1,
    nee = 'true',

    aa = 'box',

    glass = 1.5,
    ballRadius = 0.2,
    ballX = 0,
    ballY = -0.7,
    ballZ = 3,
} = parseParameters()

async function main() {
    const div = document.createElement('div')
    document.body.appendChild(div)

    const canvas = document.createElement('canvas')
    canvas.width = resolution
    canvas.height = resolution
    document.body.appendChild(canvas)

    const passesPerFrame = numericControl('Passes per Draw', 1, 320, 1, 1)
    const targetMaxSample = numericControl('Target Samples per Pixel', 0, 8192, 1, 0)
    const showThroughput = binaryControl('Show Throughput', false)
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
            width: 1,
            height: 1,
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
        const output = new Float32Array(1)
        gl.readPixels(0, 0, 1, 1, gl.RED, gl.FLOAT, output)
        console.log(`half-eps: ${output[0]}, its log: ${Math.log2(output[0])}`)
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

    const toDitheredSrgb = shader(`
        out vec4 sRgb;

        precision highp sampler2D;
        uniform sampler2D u_source;
        uniform float u_exposure;
        uniform float u_tonemap;
        uniform float u_use_luma;

        uniform highp sampler3D u_tony_mc_mapface;
        uniform float u_mosaic_mode;
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

        vec4 fetch(ivec2 scr) {
            vec4 fetched = texelFetch(u_source, scr, 0);

            if (u_mosaic_mode == 1.0) {
                fetched *= vec4(
                    ((scr.x + 1) % 2) * ((scr.y + 1) % 2),
                    (scr.x + scr.y) % 2,
                    (scr.x % 2) * (scr.y % 2),
                    1
                );
            }

            return fetched;
        }

        uniform float u_show_throughput;
        uniform sampler2D u_source_throughput;

        void main() {
            vec4 fetched;
            if (u_show_throughput > 0.0) {
                fetched = texelFetch(u_source_throughput, ivec2(gl_FragCoord.xy), 0);
                // if (fetched.rgb == vec3(0)) {
                //     fetched.rgb = vec3(0, 1, 0);
                // } else {
                //     fetched.rgb = vec3(1, 0, 0);
                // }
            } else {
                if (u_demosaic == 1.0 && u_mosaic_mode == 1.0) {
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
                } else if (u_demosaic == 2.0 && u_mosaic_mode == 1.0) {
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
                } else if (u_demosaic == 3.0 && u_mosaic_mode == 1.0) {
                    fetched = fetch(ivec2(gl_FragCoord.xy));
                    fetched.rgb = vec3(fetched.r + fetched.g + fetched.b);
                } else {
                    fetched = fetch(ivec2(gl_FragCoord.xy));
                }

                if (u_show_counts > 0.0) {
                    fetched.rgb = fetched.a < 0.0 ? vec3(0, 1, 0) : fetched.aaa;
                }
            }

            vec3 exposed = exp2(u_exposure) * fetched.rgb;

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

        void main() {
            verbatim = texelFetch(u_source, ivec2(gl_FragCoord.xy), 0);
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
        rayDirectionBuffer
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
            float eta;
        };

        void uberSquare(
            inout Intersection event, Ray ray,
            vec3 n, vec3 anchor, float radius,
            vec3 albedo1, vec3 albedo2,
            float eta,
            vec3 emits, float emRadius
        ) {
            if (dot(n, ray.direction) * dot(n, anchor - ray.start) > 0.0) {
                if (sign(-dot(n, ray.direction)) < 0.0) {
                    n = -n;
                } else {
                    eta = eta > 0.0 ? 1.0 / eta : eta;
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
                        event.eta = eta;
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
                0.0,
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
                0.0,
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
                0.0,
                emits, radius
            );
        }

        void aaSquare(
            inout Intersection event, Ray ray,
            vec3 n, vec3 anchor, float radius,
            vec3 albedo,
            vec3 emits,
            float eta
        ) {
            uberSquare(
                event, ray,
                n, anchor, radius,
                albedo, vec3(0),
                eta,
                emits, radius
            );
        }

        void sphere(
            inout Intersection event, Ray ray,
            vec3 center, float radius,
            vec3 albedo,
            vec3 emits,
            float eta
        ) {
            vec3 w = normalize(ray.direction);
            vec3 ov = center - ray.start;
            float ov2 = dot(ov, ov);
            float p = dot(ov, w);
            float d2 = radius * radius + p * p - ov2;
            if (d2 > 0.0) {
                float d = sqrt(d2);

                float t = (p - d) / length(ray.direction);
                if (t > minT && t < event.t) {
                    vec3 p = ray.start + t * ray.direction - center;

                    event.t = t;
                    event.n = normalize(p);
                    event.surface = ray.start + t * ray.direction;
                    event.albedo = albedo;
                    event.emits = emits;
                    event.eta = eta != 0.0 ? 1.0 / eta : 0.0;
                }

                t = (p + d) / length(ray.direction);
                if (t > minT && t < event.t) {
                    vec3 p = ray.start + t * ray.direction - center;

                    event.t = t;
                    event.n = -normalize(p);
                    event.surface = ray.start + t * ray.direction;
                    event.albedo = albedo;
                    event.emits = emits;
                    event.eta = eta;
                }
            }
        }

        void cube(
            inout Intersection event, Ray ray,
            vec3 center, float radius,
            vec3 albedo,
            float eta
        ) {
            aaSquare(
                event, ray,
                vec3(1, 0, 0),
                center + vec3(radius, 0, 0),
                radius,
                albedo,
                vec3(0),
                eta
            );
            aaSquare(
                event, ray,
                vec3(-1, 0, 0),
                center + vec3(-radius, 0, 0),
                radius,
                albedo,
                vec3(0),
                eta
            );
            aaSquare(
                event, ray,
                vec3(0, 1, 0),
                center + vec3(0, radius, 0),
                radius,
                albedo,
                vec3(0),
                eta
            );
            aaSquare(
                event, ray,
                vec3(0, -1, 0),
                center + vec3(0, -radius, 0),
                radius,
                albedo,
                vec3(0),
                eta
            );
            aaSquare(
                event, ray,
                vec3(0, 0, 1),
                center + vec3(0, 0, radius),
                radius,
                albedo,
                vec3(0),
                eta
            );
            aaSquare(
                event, ray,
                vec3(0, 0, -1),
                center + vec3(0, 0, -radius),
                radius,
                albedo,
                vec3(0),
                eta
            );
        }

        void lens(inout Intersection event, Ray ray, vec3 c1, vec3 c2, float radius) {
            Intersection tmp;
            tmp.t = maxT;

            sphere(
                tmp, ray,
                c1,
                radius,
                vec3(1),
                vec3(0),
                float(${glass})
            );

            if (distance(tmp.surface, c2) < radius && tmp.t > minT && tmp.t < event.t) {
                event = tmp;
            }

            tmp.t = maxT;
            sphere(
                tmp, ray,
                c2,
                radius,
                vec3(1),
                vec3(0),
                float(${glass})
            );

            if (distance(tmp.surface, c1) < radius && tmp.t > minT && tmp.t < event.t) {
                event = tmp;
            }
        }

        const float lightSize = float(${lightSize});

        void scene(inout Intersection event, Ray ray) {
            event.t = maxT;

            // cornell
            aaSquare(
                event, ray,
                vec3(0, 1, 0),
                vec3(0, -1, 3),
                1.0,
                vec3(1),
                vec3(0)
            );

            halfEmitSquare(
                event, ray,
                vec3(0, -1, 0),
                vec3(0, 1, 3),
                1.0,
                vec3(1),
                vec3(float(${light})),
                lightSize / 2.0
            );

            aaSquare(
                event, ray,
                vec3(1, 0, 0),
                vec3(-1, 0, 3),
                1.0,
                vec3(1.0, 0.1, 0.1),
                vec3(0)
            );

            aaSquare(
                event, ray,
                vec3(-1, 0, 0),
                vec3(1, 0, 3),
                0.9,
                vec3(1),
                vec3(0),
                -1.0
            );
            aaSquare(
                event, ray,
                vec3(-1, 0, 0),
                vec3(1, 0, 3),
                1.0,
                vec3(1),
                vec3(0),
                0.0
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
                vec3(1, 0.5, 0) * 0.1,
                vec3(1, 1, 0)
            );

            // fourth wall
            aaSquare(
                event, ray,
                vec3(0, 0, -1),
                vec3(0, 0, 2),
                1.0,
                vec3(1),
                vec3(0)
            );

            // purple subject
            const vec3 glassTint = vec3(1);//= vec3(0.99, 1.0, 0.99);
            vec3 subjShift = vec3(1.895, 0, 0);

            aaSquare(
                event, ray,
                vec3(0, 0, 1),
                vec3(0, 0, 3.9) + subjShift,
                0.9,
                glassTint,
                vec3(0),
                1.5
            );
            aaSquare(
                event, ray,
                vec3(0, 0, -1),
                vec3(0, 0, 2.1) + subjShift,
                0.9,
                glassTint,
                vec3(0),
                1.5
            );
            aaSquare(
                event, ray,
                vec3(0, 1, 0),
                vec3(0, 0.9, 3) + subjShift,
                0.9,
                glassTint,
                vec3(0),
                1.5
            );
            aaSquare(
                event, ray,
                vec3(0, -1, 0),
                vec3(0, -0.9, 3) + subjShift,
                0.9,
                glassTint,
                vec3(0),
                1.5
            );
            aaSquare(
                event, ray,
                vec3(-1, 0, 0),
                vec3(-0.9, 0, 3) + subjShift,
                0.9,
                glassTint,
                vec3(0),
                1.5
            );


            // curved mirror
            sphere(
                event, ray,
                vec3(-3, -1, 4.5),
                3.0,
                vec3(1),
                vec3(0),
                -1.0
            );
            sphere(
                event, ray,
                vec3(-3, -1, 4.5),
                3.005,
                glassTint,
                vec3(0),
                1.5
            );

            cube(
                event, ray,
                vec3(-0.35, -0.8, 2.5),
                0.2,
                vec3(0.9, 0.4, 0.2),
                0.0
            );

            cube(
                event, ray,
                vec3(0.6, -0.8, 2.5),
                0.2,
                glassTint,
                1.5
            );
            cube(
                event, ray,
                vec3(0.6, -0.6, 2.6),
                0.12,
                vec3(0.9, 0.1, 1),
                0.0
            );

            // sphere(
            //     event, ray,
            //     vec3(0, 0, 0),
            //     2.995,
            //     glassTint,
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
            sphere(
                event, ray,
                vec3(${ballX}, ${ballY}, ${ballZ}),
                float(${ballRadius}),
                glassTint,
                vec3(0),
                float(${glass})
            );
            // const vec3 lenPos = vec3(${ballX}, ${ballY}, ${ballZ});
            // lens(
            //     event, ray,
            //     vec3(0, 0, -0.99) + lenPos,
            //     vec3(0, 0, +0.99) + lenPos,
            //     1.0
            // );

            // sphere(
            //     event, ray,
            //     vec3(${ballX}, ${ballY}, ${ballZ}),
            //     float(${ballRadius}) - 0.07,
            //     vec3(1),//vec3(0.6, 1.0, 0.2),
            //     vec3(0),
            //     1.333/1.5
            // );
        }

        float frDielectric(float cosTheta_i, float eta) {
            cosTheta_i = clamp(cosTheta_i, -1.0, 1.0);
            if (cosTheta_i < 0.0) {
                eta = 1.0 / eta;
                cosTheta_i = -cosTheta_i;
            }

            float sin2Theta_i = 1.0 - (cosTheta_i * cosTheta_i);
            float sin2Theta_t = sin2Theta_i / (eta * eta);
            if (sin2Theta_t >= 1.0) return 1.0;

            float cosTheta_t = sqrt(1.0 - sin2Theta_t);
        
            float r_parl = (eta * cosTheta_i - cosTheta_t) /
                           (eta * cosTheta_i + cosTheta_t);
            float r_perp = (cosTheta_i - eta * cosTheta_t) /
                           (cosTheta_i + eta * cosTheta_t);
            return ((r_parl * r_parl) + (r_perp * r_perp)) / 2.0;
        }

        uniform vec3 u_camera_pos;
        uniform vec3 u_sensor_n;
        uniform vec3 u_sensor_x;
        uniform vec3 u_sensor_y;

        bool sensor(inout Ray ray, inout vec3 throughput, inout vec4 accumulator, inout bool alreadySampledEmitters) {
            Intersection event;
            const bool nextEventEst = ${nee};

            scene(event, ray);

            vec3 extinctionK = (event.eta < 0.0 || event.eta == 1.5) ? -vec3(4, 1.5, 4) : vec3(0);

            if (event.t > 0.0 && event.t < maxT) {
                throughput *= exp2(extinctionK * length(event.t*ray.direction));
                if (!alreadySampledEmitters) accumulator.rgb += event.emits * throughput;
            } else {
                return false;
            }
            throughput *= event.albedo;

            ray.start = event.surface;
            alreadySampledEmitters = false;

            if (event.eta == -1.0) {
                ray.direction = reflect(ray.direction, event.n);
            } else if (event.eta > 0.0) {
                // vec3 rf = refract(normalize(ray.direction), event.n, event.eta);
                // if (rf == vec3(0)) {
                //     ray.direction = reflect(ray.direction, event.n);
                // } else {
                //     ray.direction = rf;
                // }

                vec3 id = normalize(ray.direction);
                float refProb = frDielectric(dot(id, event.n), event.eta);
                float coin = rnd_uniform();
                if (coin < refProb) {
                    ray.direction = reflect(ray.direction, event.n);
                } else {
                    ray.direction = refract(id, event.n, event.eta);
                }
            } else {
                if (nextEventEst) {
                    // hardcoded light source
                    vec3 lightSample = vec3(rnd_uniform() - 0.5, 0.0, rnd_uniform() - 0.5) * lightSize + vec3(0, 1, 3);

                    vec3 shadowRay = lightSample - ray.start;
                    if (dot(event.n, ray.direction) * dot(event.n, shadowRay) < 0.0) {
                        Intersection shadow;
                        scene(shadow, Ray(ray.start, shadowRay));

                        if (shadow.t > 0.0 && shadow.t < maxT) {
                            float r2 = dot(shadowRay, shadowRay);
                            float cosSurfaceOverR = dot(shadowRay, event.n) / r2;
                            float cosEmitterOverR = dot(shadowRay, -shadow.n) / r2;
                            float brdf = ${1.0 / Math.PI};

                            accumulator.rgb += lightSize * lightSize * shadow.emits * throughput * cosSurfaceOverR * cosEmitterOverR * brdf * exp2(extinctionK * sqrt(r2));
                        }
                    }
                    alreadySampledEmitters = true;
                }

                ray.direction = sampleCosineHemisphere(event.n);
            }

            return true;
        }

        uniform float u_max_samples_per_pixel;
        uniform float u_pin_hole_radius;

        void pass(inout vec4 accumulator, inout vec4 throughput, inout vec4 start, inout vec4 direction) {
            const float beta = float(${beta});
            const float minThroughput = float(${minThroughput});

            float lightContribution = float(${light});
            bool enoughThroughput = length(throughput.rgb) * lightContribution * accumulator.a >= minThroughput;
            bool roulette = rnd_uniform() < beta;

            if (throughput.a > 0.0 && throughput.rgb != vec3(0) && (enoughThroughput || roulette)) {
                if (!enoughThroughput) {
                    throughput.rgb /= beta;
                }
                throughput.a += 1.0;

                Ray ray = Ray(start.xyz, direction.xyz);

                bool sampledLight = start.a > 0.0;
                bool hadHit = sensor(ray, throughput.rgb, accumulator, sampledLight);

                if (hadHit) {
                    start.xyz = ray.start;
                    start.a = sampledLight ? 1.0 : 0.0;
                    direction.xyz = ray.direction;
                    return;
                }
            }

            if (u_max_samples_per_pixel > 0.0 && accumulator.w >= u_max_samples_per_pixel) {
                accumulator.w = -accumulator.w;
                return;
            }

            // new ray
            accumulator.rgb *= accumulator.w / (accumulator.w + 1.0);
            accumulator.w += 1.0;

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

            throughput.a = 1.0;
            throughput.rgb = vec3(cameraCos * cameraCos / (cameraD2 * cameraD2) * ${Math.PI});
            throughput.rgb /= accumulator.w;

            ray.start += u_camera_pos;

            start.xyz = ray.start;
            start.a = 0.0;
            direction.xyz = ray.direction;
            direction.a = 0.0;
        }

        uniform float u_passes_per_frame;

        void main() {
            vec4 accumulator = texelFetch(u_source, ivec2(gl_FragCoord.xy), 0);
            vec4 throughput = texelFetch(u_source_throughput, ivec2(gl_FragCoord.xy), 0);
            vec4 start = texelFetch(u_source_start, ivec2(gl_FragCoord.xy), 0);
            vec4 direction = texelFetch(u_source_direction, ivec2(gl_FragCoord.xy), 0);

            if (accumulator.w >= 0.0) {
                rnd_seed = hash2(floatBitsToUint(vec3(gl_FragCoord.xy, u_seed)));

                int passes = int(u_passes_per_frame);
                for (int i = 0; i < passes; i++) {
                    pass(accumulator, throughput, start, direction);

                    if (accumulator.w < 0.0) {
                        break;
                    }
                }
            } else if (u_max_samples_per_pixel == 0.0 || u_max_samples_per_pixel > -accumulator.w) {
                accumulator.w = -accumulator.w;
            }

            linearRgb = accumulator;
            throughputOut = throughput;
            startOut = start;
            directionOut = direction;
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
        a.download = 'render.exr'
        a.click()
    })

    button('Save as DNG', () => {
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
        }
        function ifdHead(tag, type, count) {
            int(2, tag)
            int(2, type)
            int(4, count)
        }


        string('II') // little-endian
        int(2, 42) // An arbitrary but carefully chosen number

        int(4, 8) // first IFD
        int(2, 14) // number of entries

        ifdHead(254, 4, 1) // long new subfile type
        int(4, 0)

        ifdHead(256, 4, 1) // long width
        int(4, 4)

        ifdHead(257, 4, 1) // long height
        int(4, 4)

        ifdHead(258, 3, 1) // bits per sample
        int(2, 16)
        int(2, 0)

        ifdHead(259, 3, 1) // compression
        int(2, 1)
        int(2, 0)

        ifdHead(262, 3, 1) // photometric interpretation
        int(2, 34892) // linear raw [32803 = CFA (Color Filter Array).]
        int(2, 0)

        ifdHead(274, 3, 1) // orientation
        int(2, 1)
        int(2, 0)

        ifdHead(277, 3, 1) // samples per pixel
        int(2, 1)
        int(2, 0)

        ifdHead(322, 4, 1) // tile width
        int(4, 4)

        ifdHead(323, 4, 1) // tile length
        int(4, 4)

        ifdHead(324, 4, 1) // tile offsets
        int(4, 256)

        ifdHead(325, 4, 1) // tile byte counts
        int(4, 2 * 4 * 4)

        ifdHead(50706, 1, 4) // DNGVersion
        int(1, 1)
        int(1, 7)
        int(1, 0)
        int(1, 0)

        ifdHead(50708, 2, 3) // ucam model
        string('RAW')
        int(1, 0)

        int(4, 0) // end of IFD

        while (stream.length < 256) {
            stream.push(0)
        }

        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) {
                int(2, 0)
            }
        }

        const blob = new Blob([new Uint8Array(stream)])
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'render.DNG'
        a.click()
    })

    const controller = {
        locked: false,

        maxSamples,
        sampleCount: 0,
        tilesPerDraw,
        totalTime: 0,
        splitIndex: 0,
        splitsFinished: 0,
        splitMaxSize,

        cameraPos: [
            0.7220716160588411,
            0,
            2.0467412161796172
        ],
        cameraHorizontalTurns: 0.8666666666666667,
        cameraVerticalTurns: 0.08333333333333304,
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
                controller.tilesPerDraw = 1
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
        }
    })

    const tilesProgress = binaryControl('Show Tiles Progress', false)
    const tweakedTileSize = numericControl('Tile Size', 1, resolution, 1, resolution)
    const mosaicMode = binaryControl('Mosaic', false)
    const demosaicModes = {
        'Bilinear': 1,
        'Malvar-He-Cutler': 2,
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

            for (let i = 0; (i < controller.tilesPerDraw) && (controller.sampleCount < controller.maxSamples); i++) {
                const totalTiles = Math.ceil(resolution / controller.splitMaxSize) * Math.ceil(resolution / controller.splitMaxSize)
                const tilesLenCount = Math.ceil(resolution / controller.splitMaxSize)

                const yTile = Math.floor(controller.splitIndex / tilesLenCount)
                const xTile = controller.splitIndex % tilesLenCount

                const passesToDo = Math.min(controller.maxSamples - controller.sampleCount, passesPerFrame.value)

                render.draw({
                    u_source: finalBuffer,
                    u_source_throughput: rayThroughputBuffer,
                    u_source_start: rayStartBuffer,
                    u_source_direction: rayDirectionBuffer,
                    u_resolution: [finalBuffer.width, finalBuffer.height],

                    u_passes_per_frame: passesToDo,
                    u_max_samples_per_pixel: targetMaxSample.value,

                    u_pin_hole_radius: Math.pow(2, aperture.value),

                    u_camera_pos: controller.cameraPos,
                    u_sensor_n: [controller.sensor * sinXZ * cosYZ, -controller.sensor * sinYZ, controller.sensor * cosXZ * cosYZ],
                    u_sensor_x: [-cosXZ, 0, sinXZ],
                    u_sensor_y: [-sinXZ * sinYZ, -cosYZ, -cosXZ * sinYZ],

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
                    if (tweakedTileSize.value > controller.splitMaxSize) {
                        controller.tilesPerDraw = 1
                    }
                    controller.splitMaxSize = tweakedTileSize.value
                }
            }

            controller.totalTime += timeDelta

            const totalTiles = Math.ceil(resolution / controller.splitMaxSize) * Math.ceil(resolution / controller.splitMaxSize)
            const totalTime = controller.totalTime / 1000
            div.innerText = `Ray Segments Count: ${controller.sampleCount}, Tiles per Draw: ${controller.tilesPerDraw}, Tiles: ${controller.splitsFinished || totalTiles}/${totalTiles} (total ${totalTime.toFixed(1)} seconds)`

            if (timeDelta < 1000 / 60) {
                controller.tilesPerDraw++
            } else {
                controller.tilesPerDraw = Math.max(1, controller.tilesPerDraw - 1)
            }
        }

        if (tilesProgress.value && controller.splitsFinished > 0) {
            finalBuffer.swap()
        }
        toDitheredSrgb.draw({
            u_show_counts: showCounts.value ? 1.0 : 0.0,
            u_show_throughput: showThroughput.value ? 1.0 : 0.0,
            u_source_throughput: rayThroughputBuffer,
            u_source: finalBuffer,
            u_exposure: exposure.value,
            u_tonemap: tmOperators.indexOf(tonemapping.value),
            u_use_luma: lumaBasedTm.value ? 1.0 : 0.0,
            u_tony_mc_mapface: tonemapBuffer,
            u_mosaic_mode: mosaicMode.value ? 1.0 : 0.0,
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