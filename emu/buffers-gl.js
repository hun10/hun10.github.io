export default function (gl) {
    let lastTextureUnit
    let vertexShader

    const screen = ({
        width = gl.drawingBufferWidth,
        height = gl.drawingBufferHeight
    } = {}) => {
        return {
            out: () => {
                gl.bindFramebuffer(gl.FRAMEBUFFER, null)
                gl.viewport(0, 0, width, height)
            }
        }
    }

    const pixelBuffer = ({
        width = gl.drawingBufferWidth,
        height = gl.drawingBufferHeight,
        filter = gl.NEAREST
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
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            width,
            height,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
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

        return {
            update: data => {
                gl.activeTexture(thisTextureUnit)
                gl.bindTexture(gl.TEXTURE_2D, texture)

                gl.texImage2D(
                    gl.TEXTURE_2D,
                    0,
                    gl.RGBA,
                    width,
                    height,
                    0,
                    gl.RGBA,
                    gl.UNSIGNED_BYTE,
                    data
                )
            },

            width,
            height,
            size: width * height,
            bufferSize: width * height * 4,

            textureUnit: () => {
                return zeroTextureUnit
            },

            out: () => {
                gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
                gl.viewport(0, 0, width, height)
            }
        }
    }

    const doublePixelBuffer = params => {
        let b1 = pixelBuffer(params)
        let b2 = pixelBuffer(params)

        return {
            width: b1.width,
            height: b1.height,
            size: b1.width * b1.height,
            bufferSize: b1.width * b1.height * 4,

            update: data => b1.update(data),
            textureUnit: () => b1.textureUnit(),
            out: () => {
                b2.out()

                let t = b1
                b1 = b2
                b2 = t
            }
        }
    }

    const shader = src => {
        if (vertexShader === undefined) {
            gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                -1, 1,
                -1, -1,
                1, 1,
                1, -1
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
    
            // A single iteration of Bob Jenkins' One-At-A-Time hashing algorithm.
            uint hash( uint x ) {
                x += ( x << 10u );
                x ^= ( x >>  6u );
                x += ( x <<  3u );
                x ^= ( x >> 11u );
                x += ( x << 15u );
                return x;
            }
            
            // Compound versions of the hashing algorithm I whipped together.
            uint hash( uvec2 v ) { return hash( v.x ^ hash(v.y)                         ); }
            uint hash( uvec3 v ) { return hash( v.x ^ hash(v.y) ^ hash(v.z)             ); }
            uint hash( uvec4 v ) { return hash( v.x ^ hash(v.y) ^ hash(v.z) ^ hash(v.w) ); }
            
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
    
            ${src}`)
        gl.compileShader(fragmentShader)

        const program = gl.createProgram()
        gl.attachShader(program, vertexShader)
        gl.attachShader(program, fragmentShader)
        gl.linkProgram(program)

        const uniforms = {}

        return {
            draw: (ins, out) => {
                gl.useProgram(program)

                for (let input in ins) {
                    const value = ins[input]

                    if (uniforms[input] === undefined) {
                        const location = gl.getUniformLocation(program, input)

                        if (typeof value.textureUnit === 'function') {
                            uniforms[input] = v => gl.uniform1i(location, v.textureUnit())
                        } else {
                            uniforms[input] = gl.uniform1f.bind(gl, location)
                        }
                    }

                    uniforms[input](value)
                }

                out.out()
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
            }
        }
    }

    return {
        screen,
        pixelBuffer,
        doublePixelBuffer,
        shader
    }
}
