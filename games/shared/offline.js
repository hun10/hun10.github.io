export default function (resources) {
    self.addEventListener('install', event => {
        const preCache = async () => {
            const cache = await caches.open('offline')
            await cache.addAll(resources)
        }

        event.waitUntil(preCache())
    })

    self.addEventListener('fetch', event => {
        event.respondWith(caches.match(event.request))
    })
}