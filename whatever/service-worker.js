self.addEventListener('fetch', event => {
    const responder = async cached => {
        if (cached) {
            return cached
        }

        return fetch(event.request)
    }

    event.respondWith(caches.match(event.request).then(responder))
})

self.addEventListener('message', async event => {
    const {
        request,
        body,
        headers
    } = event.data

    const cache = await caches.open('whatever')
    await cache.put(
        request,
        new Response(body, headers)
    )
})