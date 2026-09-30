const MAP_IMAGE='https://beautyshare.2gis.ru/api/v1/image?city=grozny&zoom=17&center=45.593695%2C43.373205';

function fallback(){
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="520" viewBox="0 0 1200 520">
    <rect width="1200" height="520" fill="#e7e7e9"/>
    <path d="M-40 100 1260 190M-20 350 1230 280M150-40 260 560M560-30 650 550M920-30 850 560" stroke="#f8f8f9" stroke-width="38" opacity=".96"/>
    <path d="M0 250h1200M430 0v520" stroke="#d8d8dc" stroke-width="8" opacity=".8"/>
    <circle cx="620" cy="250" r="30" fill="#111"/>
    <circle cx="620" cy="250" r="10" fill="#fff"/>
  </svg>`;
}

module.exports=async function handler(req,res){
  try{
    const upstream=await fetch(MAP_IMAGE,{headers:{'User-Agent':'SushiCrazyMenu/1.0'}});
    if(!upstream.ok)throw new Error('2GIS '+upstream.status);
    const body=Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type',upstream.headers.get('content-type')||'image/png');
    res.setHeader('Cache-Control','public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.status(200).send(body);
  }catch(error){
    res.setHeader('Content-Type','image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control','public, max-age=600, s-maxage=3600');
    res.status(200).send(fallback());
  }
};
