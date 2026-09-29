const CACHE='oporumbo-static-v20.1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const name of await caches.keys())if(name.startsWith('oporumbo-')&&name!==CACHE)await caches.delete(name);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 // Authenticated data must always come from the server; never cache API responses.
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(!(url.pathname.startsWith('/static/')||url.pathname==='/'||url.pathname==='/manifest.webmanifest'))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  try{const response=await fetch(request,{cache:'no-cache'});if(response.ok){try{await cache.put(request,response.clone());}catch{ /* Quota errors must not discard a fresh network response. */ }}return response;}
  catch{const cached=await cache.match(request);return cached||new Response('Sin conexión. Vuelve a intentarlo cuando recuperes la red.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}
 })());
});
