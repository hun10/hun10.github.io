export function dngFromRows(rows) {
    const height = rows.length
    const width = rows[0].length
    const bitsPerSample = rows[0].BYTES_PER_ELEMENT * 8
    const sampleFormat = (rows[0] instanceof Float32Array) ? 3 : 1

    const rowOffsets = new Uint32Array(height)
    const rowByteCount = new Uint32Array(height)

    const idf = [
        [0x00FE, new Uint32Array([ 0 ])],             // main IDF
        [0x0100, new Uint32Array([ width ])],
        [0x0101, new Uint32Array([ height ])],
        [0x0102, new Uint16Array([ bitsPerSample ])],
        [0x0103, new Uint16Array([ 1 ])],             // no compression
        [0x0106, new Uint16Array([ 32803 ])],         // CFA
        [0x0111, rowOffsets],
        [0x0112, new Uint16Array([ 1 ])],             // normal orientation
        [0x0115, new Uint16Array([ 1 ])],             // one sample per pixel
        [0x0117, rowByteCount],
        [0x011C, new Uint16Array([ 1 ])],             // default planar configuration
        [0x0153, new Uint16Array([ sampleFormat ])],
        [0x828D, new Uint16Array([ 2, 2 ])],          // CFA pattern size
        [0x828E, new Uint8Array([ 1, 2, 0, 1 ])],     // CFA pattern
        [0xC612, new Uint8Array([ 1, 3, 0, 0 ])],     // DNG version
        [0xC614, "XYZ Spectral Renderer JS"],         // unique camera model
        [0xC621, [                                    // XYZ
            new Int32Array([ 1, 1 ]), new Int32Array([ 0, 1 ]), new Int32Array([ 0, 1 ]),
            new Int32Array([ 0, 1 ]), new Int32Array([ 1, 1 ]), new Int32Array([ 0, 1 ]),
            new Int32Array([ 0, 1 ]), new Int32Array([ 0, 1 ]), new Int32Array([ 1, 1 ]),
        ]],
        [0xC628, [                                    // D65 white balance
            new Uint32Array([ 9504, 10000 ]),
            new Uint32Array([ 10000, 10000 ]),
            new Uint32Array([ 10888, 10000 ]),
        ]],
        [0xC65A, new Uint16Array([ 21 ])],            // calibrated to D65
        [0xC6FC, new Float32Array([ 0, 0, 1, 1 ])],   // tone curve
    ]

    const stream = [73, 73, 42, 0, 8, 0, 0, 0, idf.length, 0] // II, 42, start at 8, size
    let dataAllocator = stream.length + 4 + 12 * idf.length // IDF table + ending 32-bit zero

    for (let i = 0; i < height; i++) {
        const byteLength = rows[i].byteLength

        rowOffsets[i] = dataAllocator
        rowByteCount[i] = byteLength

        dataAllocator += byteLength
    }

    function num(count, n) {
        for (let i = 0; i < count; i++) {
            stream.push(n & 0xFF)
            n = n >> 8
        }
    }

    idf.forEach(entry => {
        num(2, entry[0])
        let chunk = entry[1]
        let count = chunk.length

        if (chunk instanceof Uint8Array) {
            num(2, 1)
        } else if (chunk instanceof Uint16Array) {
            num(2, 3)
        } else if (chunk instanceof Uint32Array) {
            num(2, 4)
        } else if (chunk instanceof Float32Array) {
            num(2, 11)
        } else if (typeof chunk === "string") {
            num(2, 2)

            const coded = []
            for (let c of chunk) {
                coded.push(c.charCodeAt(0))
            }
            coded.push(0)

            count = coded.length
            chunk = new Uint8Array(coded)
        } else if (chunk[0] instanceof Uint32Array) {
            num(2, 5)

            const ns = []
            chunk.forEach(n => {
                ns.push(n[0])
                ns.push(n[1])
            })

            chunk = new Uint32Array(ns)
        } else if (chunk[0] instanceof Int32Array) {
            num(2, 10)

            const ns = []
            chunk.forEach(n => {
                ns.push(n[0])
                ns.push(n[1])
            })

            chunk = new Int32Array(ns)
        }

        num(4, count)

        if (chunk.byteLength <= 4) {
            const bb = new Uint8Array(chunk.buffer)
            for (let i = 0; i < 4; i++) {
                if (i < bb.length) {
                    stream.push(bb[i])
                } else {
                    stream.push(0)
                }
            }
        } else {
            num(4, dataAllocator)
            dataAllocator += chunk.byteLength
            rows.push(chunk)
        }
    })

    num(4, 0)

    rows.forEach(row => {
        const bb = new Uint8Array(row.buffer)
        for (let i = 0; i < bb.length; i++) {
            stream.push(bb[i])
        }
    })

    return new Uint8Array(stream)
}