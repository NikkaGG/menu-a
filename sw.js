const CACHE_NAME='sushi-crazy-shell-v12';
const OFFLINE_URL='/offline.html';
const PRECACHE=[
  '/',
  OFFLINE_URL,
  '/styles.css?v=20260930-contactpair',
  '/app.js?v=20260930-favorites-exit',
  '/manifest.webmanifest',
  '/ref-products-dom.json',
  '/icons/app-192.png',
  '/icons/app-512.png'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))),
    self.clients.claim()
  ]));
});

async function networkFirst(request,fallback){
  const cache=await caches.open(CACHE_NAME);
  try{
    const response=await fetch(request);
    if(response&&response.ok)cache.put(request,response.clone());
    return response;
  }catch(error){
    return (await cache.match(request))||(fallback?await cache.match(fallback):undefined)||Response.error();
  }
}

async function staleWhileRevalidate(request){
  const cache=await caches.open(CACHE_NAME);
  const cached=await cache.match(request);
  const fresh=fetch(request).then(response=>{
    if(response&&response.ok)cache.put(request,response.clone());
    return response;
  }).catch(()=>null);
  return cached||(await fresh)||Response.error();
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(networkFirst(request,OFFLINE_URL));
    return;
  }
  if(url.pathname==='/ref-products-dom.json'){
    event.respondWith(networkFirst(request));
    return;
  }
  if(['/styles.css','/app.js','/manifest.webmanifest'].includes(url.pathname)||url.pathname.startsWith('/icons/')){
    event.respondWith(staleWhileRevalidate(request));
  }
});
