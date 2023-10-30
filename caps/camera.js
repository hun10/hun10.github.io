const select = document.createElement('select')
document.body.appendChild(select)

const pre = document.createElement('pre')
document.body.appendChild(pre)

async function main() {
    const devices = await navigator.mediaDevices.enumerateDevices()

    devices.filter(dev => dev.kind === 'videoinput').forEach(device => {
        const option = document.createElement('option')
        select.appendChild(option)

        option.label = device.label
        option.value = device.deviceId
    })

    choose()
    select.addEventListener('change', choose)
}

async function choose() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            deviceId: select.value
        }
    })

    const caps = stream.getVideoTracks().map(track => ({[track.label]: track.getCapabilities()}))

    console.log(caps)
    pre.innerText = JSON.stringify(caps, null, 2)
}

main()