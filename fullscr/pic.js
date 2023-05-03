const canvas = document.getElementById('canvas')

const ctx = canvas.getContext('2d')

const lastSize = {
    width: 300,
    height: 150
}

function redraw() {
    if (canvas.clientWidth !== lastSize.width || canvas.clientHeight !== lastSize.height) {
        lastSize.width = canvas.clientWidth
        lastSize.height = canvas.clientHeight

        canvas.width = lastSize.width
        canvas.height = lastSize.height

        const pic = ctx.createImageData(canvas.width, canvas.height)
        for (let y = 0, a = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                pic.data[a++] = 255
                pic.data[a++] = 0
                pic.data[a++] = (x === 0 || y === 0 || x === canvas.width - 1 || y === canvas.height - 1) ? 255 : 0
                pic.data[a++] = 255
            }
        }
        ctx.putImageData(pic, 0, 0)
    }

    requestAnimationFrame(redraw)
}

redraw()
