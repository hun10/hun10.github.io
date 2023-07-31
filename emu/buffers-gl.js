export default function (gl) {
    if (!(gl instanceof WebGL2RenderingContext)) {
        throw 'Unsupported WebGL context'
    }

    let lastTextureUnit
    let vertexShader

    const screen = () => {
        return {
            out: () => {
                gl.bindFramebuffer(gl.FRAMEBUFFER, null)
                gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
            }
        }
    }

    const sampler3D = ({
        width,
        height,
        depth,
        filter = gl.NEAREST,
        format = gl.RGBA8,
        access = gl.RGBA,
        store = gl.UNSIGNED_BYTE
    }) => {
        if (lastTextureUnit === undefined) {
            lastTextureUnit = gl.TEXTURE0
        } else {
            lastTextureUnit++
        }

        const thisTextureUnit = lastTextureUnit

        const texture = gl.createTexture()
        gl.activeTexture(thisTextureUnit)
        gl.bindTexture(gl.TEXTURE_3D, texture)
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, filter)
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, filter)
        gl.texImage3D(
            gl.TEXTURE_3D,
            0,
            format,
            width,
            height,
            depth,
            0,
            access,
            store,
            null
        )

        const zeroTextureUnit = thisTextureUnit - gl.TEXTURE0

        return {
            update: data => {
                gl.activeTexture(thisTextureUnit)

                gl.texImage3D(
                    gl.TEXTURE_3D,
                    0,
                    format,
                    width,
                    height,
                    depth,
                    0,
                    access,
                    store,
                    data
                )
            },

            width,
            height,
            depth,
            size: width * height * depth,
            bufferSize: width * height * depth * 4,

            textureUnit: () => {
                return zeroTextureUnit
            }
        }
    }

    const pixelBuffer = ({
        width = gl.drawingBufferWidth,
        height = gl.drawingBufferHeight,
        filter = gl.NEAREST,
        format = gl.RGBA8,
        access = gl.RGBA,
        store = gl.UNSIGNED_BYTE
    } = {}) => {
        if (lastTextureUnit === undefined) {
            lastTextureUnit = gl.TEXTURE0
        } else {
            lastTextureUnit++
        }

        const thisTextureUnit = lastTextureUnit

        const texture = gl.createTexture()
        gl.activeTexture(thisTextureUnit)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            format,
            width,
            height,
            0,
            access,
            store,
            null
        )

        const fb = gl.createFramebuffer()
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb)

        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            texture,
            0
        )

        const zeroTextureUnit = thisTextureUnit - gl.TEXTURE0

        const self = {
            update: data => {
                if (data) {
                    gl.activeTexture(thisTextureUnit)

                    gl.texSubImage2D(
                        gl.TEXTURE_2D,
                        0,
                        0,
                        0,
                        self.width,
                        self.height,
                        access,
                        store,
                        data
                    )
                } else {
                    self.out({ x: 0, y: 0 })
                    gl.clearColor(0, 0, 0, 0)
                    gl.clear(gl.COLOR_BUFFER_BIT)
                }
            },

            copy: () => {
                gl.activeTexture(thisTextureUnit)
                gl.copyTexImage2D(gl.TEXTURE_2D, 0, format, 0, 0, self.width, self.height, 0)
            },

            width,
            height,
            size: width * height,
            bufferSize: width * height * 4,

            resize: ({
                width = gl.drawingBufferWidth,
                height = gl.drawingBufferHeight
            } = {}) => {
                if (self.width === width && self.height === height) {
                    return false
                }

                self.width = width
                self.height = height
                self.size = self.width * self.height
                self.bufferSize = self.size * 4

                gl.activeTexture(thisTextureUnit)
                gl.texImage2D(
                    gl.TEXTURE_2D,
                    0,
                    format,
                    self.width,
                    self.height,
                    0,
                    access,
                    store,
                    null
                )
                return true
            },

            textureUnit: () => {
                return zeroTextureUnit
            },
            texture: () => {
                return texture
            },

            out: (params) => {
                gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
                gl.viewport(params.x, params.y, params.width ?? self.width, params.height ?? self.height)
            }
        }

        return self
    }

    const nPixelBuffer = n => params => {
        const nBufs = []
        for (let i = 0; i < n; i++) {
            nBufs[i] = pixelBuffer(params)
        }

        let currentIdx = 0
        let b1 = nBufs[currentIdx]
        let b2 = nBufs[(currentIdx + 1) % nBufs.length]

        const self = {
            width: b1.width,
            height: b1.height,
            size: b1.width * b1.height,
            bufferSize: b1.width * b1.height * 4,

            resize: ({
                width = gl.drawingBufferWidth,
                height = gl.drawingBufferHeight
            } = {}) => {
                if (self.width === width && self.height === height) {
                    return false
                }

                self.width = width
                self.height = height
                self.size = self.width * self.height
                self.bufferSize = self.size * 4

                for (let i = 0; i < n; i++) {
                    nBufs[i].resize({ width, height })
                }
                return true
            },

            update: data => b1.update(data),
            textureUnit: () => b1.textureUnit(),
            swap: () => {
                const pb2 = b2

                currentIdx = (currentIdx + 1) % nBufs.length
                b1 = nBufs[currentIdx]
                b2 = nBufs[(currentIdx + 1) % nBufs.length]

                return pb2
            },
            out: (params) => {
                b2.out(params)

                currentIdx = (currentIdx + 1) % nBufs.length
                b1 = nBufs[currentIdx]
                b2 = nBufs[(currentIdx + 1) % nBufs.length]
            }
        }

        return self
    }

    const doublePixelBuffer = nPixelBuffer(2)

    const multiOutput = (...buffers) => {
        const cache = {}

        while (true) {
            let textures = []
            let cacheKey = ''

            for (let i = 0; i < buffers.length; i++) {
                const tu = buffers[i].swap()
                textures.push(tu.texture())
                cacheKey += `:${tu.textureUnit()}`
            }

            if (cache[cacheKey] === undefined) {
                const drawArray = []

                const fb = gl.createFramebuffer()
                cache[cacheKey] = fb

                gl.bindFramebuffer(gl.FRAMEBUFFER, fb)

                for (let i = 0; i < textures.length; i++) {
                    const tex = textures[i]
                    const attach = gl.COLOR_ATTACHMENT0 + i
                    drawArray.push(attach)

                    gl.framebufferTexture2D(
                        gl.FRAMEBUFFER,
                        attach,
                        gl.TEXTURE_2D,
                        tex,
                        0
                    )
                }

                gl.drawBuffers(drawArray)
            } else {
                break
            }
        }

        const self = {
            out: (params) => {
                let cacheKey = ''
                for (let i = 0; i < buffers.length; i++) {
                    const tu = buffers[i].swap()
                    cacheKey += `:${tu.textureUnit()}`
                }

                gl.bindFramebuffer(gl.FRAMEBUFFER, cache[cacheKey])
                gl.viewport(params.x, params.y, params.width ?? buffers[0].width, params.height ?? buffers[0].height)
            }
        }

        return self
    }

    const shader = src => {
        if (vertexShader === undefined) {
            gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                -1, 1,
                -1, -3,
                3, 1
            ]), gl.STATIC_DRAW)
            gl.enableVertexAttribArray(0)
            gl.vertexAttribPointer(
                0, // layout location = 0
                2, // components per vertex
                gl.FLOAT, // 32 bit floats
                false, // do not normalize
                0, // default stride
                0 // no offset
            )
            vertexShader = gl.createShader(gl.VERTEX_SHADER)
            gl.shaderSource(vertexShader, `#version 300 es
                layout(location = 0) in vec2 a_corner;
        
                void main() {
                    gl_Position = vec4(
                        a_corner,
                        0.0,
                        1.0
                    );
                }
            `)
            gl.compileShader(vertexShader)
        }

        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)
        gl.shaderSource(fragmentShader, `#version 300 es
            precision highp float;
            precision highp int;

            uniform float u_seed;
            uniform float u_prev_seed;

            vec3 fromLinear(vec3 linearRgb) {
                bvec3 cutoff = lessThan(linearRgb, vec3(0.0031308));
                vec3 higher = vec3(1.055) * pow(linearRgb, vec3(1.0 / 2.4)) - vec3(0.055);
                vec3 lower = linearRgb * vec3(12.92);
            
                return mix(higher, lower, cutoff);
            }

            vec3 toLinear(vec3 sRgb) {
                bvec3 cutoff = lessThan(sRgb, vec3(0.04045));
                vec3 higher = pow((sRgb + vec3(0.055)) / vec3(1.055), vec3(2.4));
                vec3 lower = sRgb / vec3(12.92);
            
                return mix(higher, lower, cutoff);
            }

            vec4 floatToRgba(float x) {
                uint repX = floatBitsToUint(x);
                uvec4 iRgba = uvec4(
                    repX,
                    repX >> 8u,
                    repX >> 16u,
                    repX >> 24u
                ) & 0x000000FFu;

                return vec4(iRgba) / 255.0;
            }

            float rgbaToFloat(vec4 rgba) {
                uvec4 iRgba = uvec4(rgba * 255.0);
                uint repX = iRgba[0]
                          | iRgba[1] << 8u
                          | iRgba[2] << 16u
                          | iRgba[3] << 24u;

                return uintBitsToFloat(repX);
            }

            // A single iteration of Bob Jenkins' One-At-A-Time hashing algorithm.
            uint hash( uint x ) {
                x += ( x << 10u );
                x ^= ( x >>  6u );
                x += ( x <<  3u );
                x ^= ( x >> 11u );
                x += ( x << 15u );
                return x;
            }
            
            uint hash(uvec2 v) {
                return hash(v.x ^ hash(v.y));
            }

            uint hash(uvec3 v) {
                return hash(v.x ^ hash(v.yz));
            }

            uint hash(uvec4 v) {
                return hash(v.x ^ hash(v.yzw));
            }
            
            // Construct a float with half-open range [0:1] using low 23 bits.
            // All zeroes yields 0.0, all ones yields the next smallest representable value below 1.0.
            float floatConstruct( uint m ) {
                const uint ieeeMantissa = 0x007FFFFFu; // binary32 mantissa bitmask
                const uint ieeeOne      = 0x3F800000u; // 1.0 in IEEE binary32
            
                m &= ieeeMantissa;                     // Keep only mantissa bits (fractional part)
                m |= ieeeOne;                          // Add fractional part to 1.0
            
                float  f = uintBitsToFloat( m );       // Range [1:2]
                return f - 1.0;                        // Range [0:1]
            }
            
            // Pseudo-random value in half-open range [0:1].
            float random( float x ) { return floatConstruct(hash(floatBitsToUint(x))); }
            float random( vec2  v ) { return floatConstruct(hash(floatBitsToUint(v))); }
            float random( vec3  v ) { return floatConstruct(hash(floatBitsToUint(v))); }
            float random( vec4  v ) { return floatConstruct(hash(floatBitsToUint(v))); }

            float random() {
                return random(vec3(gl_FragCoord.xy, u_seed));
            }

            float uniformWhite() {
                return random(vec3(gl_FragCoord.xy, u_seed)) - 0.5;
            }

            float triangularWhite() {
                float rnd = uniformWhite();

                return sign(rnd)
                     * (1.0 - sqrt(1.0 - 2.0 * abs(rnd)));
            }

            float triangularBlue() {
                return random(vec3(gl_FragCoord.xy, u_seed))
                     - random(vec3(gl_FragCoord.xy, u_prev_seed));
            }

            float triangularBlue(float idx) {
                return random(vec4(gl_FragCoord.xy, u_seed, idx))
                     - random(vec4(gl_FragCoord.xy, u_prev_seed, idx));
            }

            float randomBlue(float idx) {
                float tri = triangularBlue(idx);

                // [0, 1)
                return tri + (1.0 - tri * tri * sign(tri)) / 2.0;
            }

            vec4 dither(vec3 color)
            {
                color = max(vec3(0), color);

                // return vec4(sqrt(color) + triangularBlue() / 255.0, 1.0);

                // return floatToRgba(color.b);

                float mx = max(max(color.r, color.g), color.b);
                float ex = ceil(log2(mx));
                color /= exp2(ex);
                return vec4(color + triangularBlue() / 255.0, (ex + 126.0) / 255.0);
            }
            
            vec3 undither(vec4 dithered) {
                // return dithered.rgb * dithered.rgb;

                // return vec3(rgbaToFloat(dithered));

                return dithered.rgb * exp2(dithered.a * 255.0 - 126.0);
            }

            vec4 ditherFinal(vec3 color)
            {
                color *= 253.0 / 255.0;
                color += 1.0 / 255.0;
                return vec4(color + triangularBlue() / 255.0, 1.0);
            }

            vec3 tex(sampler2D u_source, vec2 u_source_ll, vec2 u_source_ur, vec2 raw) {
                vec2 bb = step(u_source_ll, raw)
                        - step(u_source_ur, raw);
        
                if (bb.x * bb.y > 0.0) {
                    return undither(texelFetch(u_source, ivec2(raw), 0));
                } else {
                    return vec3(0);
                }
            }
        
            vec3 texLerp(sampler2D u_source, vec2 u_source_ll, vec2 u_source_ur, vec2 p) {
                p -= 0.5;
        
                vec2 floored = floor(p);
                p = clamp(p - floored, 0.0, 1.0);
        
                vec3 LL = tex(u_source, u_source_ll, u_source_ur, floored);
                vec3 LR = tex(u_source, u_source_ll, u_source_ur, floored + vec2(1, 0));
                vec3 UL = tex(u_source, u_source_ll, u_source_ur, floored + vec2(0, 1));
                vec3 UR = tex(u_source, u_source_ll, u_source_ur, floored + vec2(1, 1));
        
                vec3 L = mix(LL, LR, p.x);
                vec3 U = mix(UL, UR, p.x);
        
                return mix(L, U, p.y);
            }
        
            ${src}`)
        gl.compileShader(fragmentShader)

        const message = gl.getShaderInfoLog(fragmentShader)
        if (message.length > 0) {
            throw message;
        }

        const program = gl.createProgram()
        gl.attachShader(program, vertexShader)
        gl.attachShader(program, fragmentShader)
        gl.linkProgram(program)

        const uniforms = {}

        let prevRnd = Math.random()

        return {
            draw: (ins, out, { x = 0, y = 0, width, height } = {}) => {
                const newRnd = Math.random()
                ins.u_seed = newRnd
                ins.u_prev_seed = prevRnd
                prevRnd = newRnd

                gl.useProgram(program)

                for (let input in ins) {
                    const value = ins[input]

                    if (uniforms[input] === undefined) {
                        const location = gl.getUniformLocation(program, input)

                        if (typeof value.textureUnit === 'function') {
                            uniforms[input] = v => gl.uniform1i(location, v.textureUnit())
                        } else {
                            if (value.length === 2) {
                                uniforms[input] = ([x, y]) => gl.uniform2f(location, x, y)
                            } else if (value.length === 3) {
                                uniforms[input] = ([x, y, z]) => gl.uniform3f(location, x, y, z)
                            } else if (value.length === 4) {
                                uniforms[input] = ([x, y, z, w]) => gl.uniform4f(location, x, y, z, w)
                            } else {
                                uniforms[input] = gl.uniform1f.bind(gl, location)
                            }
                        }
                    }

                    uniforms[input](value)
                }

                out.out({ x, y, width, height })
                gl.drawArrays(gl.TRIANGLES, 0, 3)
            }
        }
    }

    return {
        screen,
        pixelBuffer,
        doublePixelBuffer,
        nPixelBuffer,
        shader,
        sampler3D,
        multiOutput
    }
}
