const select = document.createElement('select')
document.body.appendChild(select)

const pre = document.createElement('pre')
document.body.appendChild(pre)

const vid = document.createElement('video')
document.body.appendChild(vid)

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
}

async function choose() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            deviceId: select.value
        }
    })

    vid.src = window.URL.createObjectURL(stream)
    vid.onloadedmetadata = function(e) {
        vid.play()
    }

    const caps = stream.getVideoTracks().map(track => ({[track.label]: track.getCapabilities()}))
    pre.innerText = JSON.stringify(caps, null, 2)

    const sets = stream.getVideoTracks().map(track => ({[track.label]: track.getSettings()}))
    pre.innerText += JSON.stringify(sets, null, 2)

}

window.onload = () => main().catch(alert)
