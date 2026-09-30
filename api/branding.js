const ASSETS = {
  banner: 'https://s3.twcstorage.ru/myctlg/catalogs/6305074e-52fe-4079-bb47-8fabcea6a275/branding/bg/6305074e-52fe-4079-bb47-8fabcea6a275/raw/39784c687eea.webp',
  logo: 'https://s3.twcstorage.ru/myctlg/catalogs/6305074e-52fe-4079-bb47-8fabcea6a275/branding/logo/6305074e-52fe-4079-bb47-8fabcea6a275/raw/f163b845b36b.webp'
};

function fallbackSvg(type){
  if(type==='logo'){
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="256" fill="#fff"/><circle cx="256" cy="256" r="210" fill="#111"/><text x="256" y="245" text-anchor="middle" font-family="Arial,sans-serif" font-size="52" font-weight="700" fill="#fff">SUSHI</text><text x="256" y="305" text-anchor="middle" font-family="Arial,sans-serif" font-size="42" font-weight="700" fill="#e74c3c">CRAZY</text></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="500" viewBox="0 0 1600 500"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#111"/><stop offset=".5" stop-color="#272727"/><stop offset="1" stop-color="#111"/></linearGradient></defs><rect width="1600" height="500" fill="url(#g)"/><text x="800" y="235" text-anchor="middle" font-family="Arial,sans-serif" font-size="104" font-weight="800" fill="#fff">SUSHI CRAZY</text><rect x="565" y="270" width="470" height="10" rx="5" fill="#e74c3c"/><text x="800" y="340" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" letter-spacing="9" fill="#ddd">FAST FOOD</text></svg>`;
}

module.exports = async function handler(req,res){
  const type=String(req.query.type||'');
  const url=ASSETS[type];
  if(!url){res.status(404).send('Not found');return;}
  try{
    const upstream=await fetch(url,{headers:{'User-Agent':'SushiCrazyMenu/1.0'}});
    if(!upstream.ok)throw new Error('Upstream '+upstream.status);
    const body=Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type',upstream.headers.get('content-type')||'image/webp');
    res.setHeader('Cache-Control','public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.status(200).send(body);
  }catch(error){
    res.setHeader('Content-Type','image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control','public, max-age=300, s-maxage=3600');
    res.status(200).send(fallbackSvg(type));
  }
};
