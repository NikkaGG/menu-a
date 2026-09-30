const products=require('../../ref-products-dom.json');

function esc(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

module.exports=function handler(req,res){
  const id=Number(req.query.id);
  const item=Number.isInteger(id)&&id>0?products[id-1]:null;
  if(!item){res.statusCode=404;res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><title>Товар не найден — Sushi Crazy</title><p>Товар не найден.</p>');return;}
  const proto=(req.headers['x-forwarded-proto']||'https').split(',')[0];
  const host=req.headers.host;
  const origin=proto+'://'+host;
  const target=origin+'/?product='+id;
  const image=item.detailImg||item.img||'/icons/app-512.png';
  const imageUrl=image.startsWith('http')?image:origin+image;
  const title=item.name+' — Sushi Crazy';
  const description=[item.weight,item.desc,item.price?item.price.toLocaleString('ru-RU')+' ₸':''].filter(Boolean).join(' · ');
  const html=`<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="Sushi Crazy">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(imageUrl)}">
<meta property="og:url" content="${esc(origin+'/product/'+id)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(imageUrl)}">
<link rel="canonical" href="${esc(origin+'/product/'+id)}">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<script>location.replace(${JSON.stringify(target)})</script>
</head><body><p>Открываем «${esc(item.name)}»…</p><p><a href="${esc(target)}">Перейти к товару</a></p></body></html>`;
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('Cache-Control','public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
  res.statusCode=200;
  res.end(html);
};
