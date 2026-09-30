const MAP_IMAGE='https://beautyshare.2gis.ru/api/v1/image?city=grozny&zoom=17&center=45.593695%2C43.373205&title=Sushi%20crazy%2C%20%D0%BA%D0%B0%D1%84%D0%B5&desc=%D0%A3%D0%BB%D0%B8%D1%86%D0%B0%20%D0%A2%D1%80%D1%83%D0%B4%D0%BE%D0%B2%D0%B8%D0%BA%D0%BE%D0%B2%2C%C2%A02%D0%B3%3Cbr%20%2F%3E%D0%93%D1%80%D0%BE%D0%B7%D0%BD%D1%8B%D0%B9';

function fallback(){
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="520" viewBox="0 0 1200 520">
    <rect width="1200" height="520" fill="#ececef"/>
    <path d="M0 110h1200M0 260h1200M0 410h1200M220 0v520M550 0v520M890 0v520" stroke="#fff" stroke-width="26" opacity=".92"/>
    <circle cx="620" cy="250" r="38" fill="#111"/>
    <circle cx="620" cy="250" r="13" fill="#fff"/>
    <text x="620" y="330" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="#222">Sushi Crazy</text>
    <text x="620" y="372" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" fill="#666">ул. Трудовиков, 2г · 2GIS</text>
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
