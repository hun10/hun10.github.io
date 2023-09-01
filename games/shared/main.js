navigator.serviceWorker.register('../shared/service-worker.js', {
    scope: '../shared/',
    type: 'module'
})

navigator.serviceWorker.register('service-worker.js', {
    type: 'module'
})

function button(caption, handler) {
    const button = document.createElement('button')
    button.innerText = caption
    button.addEventListener('click', handler)

    document.body.appendChild(button)
    return button
}

button('Check Persistence', () => {
    navigator.storage.persisted().then(persisted => {
        alert(`Persisted: ${persisted}`)
    })
})

button('Request Persistence', () => {
    navigator.storage.persisted().then(persisted => {
        if (persisted) {
            alert('Already persisted!')
        } else {
            return navigator.storage.persist().then(result => {
                if (result) {
                    alert('Success!')
                } else {
                    alert('Request rejected!')
                }
            })
        }
    })
})

button('Read from Local Storage', () => {
    alert(localStorage.getItem('same-key'))
})

button('Save Random to Local Storage', () => {
    localStorage.setItem('same-key', Math.random())
})