function svgIcon(name,cls='svg-icon'){
  const classes=(cls.includes('svg-icon')?cls:('svg-icon '+cls)).trim();
  const common='class="'+classes+'" viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
  const icons={
    plus:`<svg ${common}><path d="M12 5v14M5 12h14"/></svg>`,
    minus:`<svg ${common}><path d="M5 12h14"/></svg>`,
    x:`<svg ${common}><path d="M18 6 6 18M6 6l12 12"/></svg>`,
    search:`<svg ${common}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>`,
    grid:`<svg ${common}><rect x="4" y="4" width="6" height="6" rx="1.3"/><rect x="14" y="4" width="6" height="6" rx="1.3"/><rect x="4" y="14" width="6" height="6" rx="1.3"/><rect x="14" y="14" width="6" height="6" rx="1.3"/></svg>`,
    list:`<svg ${common}><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>`,
    cart:`<svg ${common}><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.1 11.2A2 2 0 0 0 9 16h9.8a2 2 0 0 0 1.9-1.4L22 8H6"/></svg>`,
    share:`<svg ${common}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.7 10.7 15.3 6.3M8.7 13.3l6.6 4.4"/></svg>`,
    heart:`<svg ${common}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>`,
    'chevron-left':`<svg ${common}><path d="m15 18-6-6 6-6"/></svg>`,
    phone:`<svg ${common}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6.1 6.1l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>`,
    map:`<svg ${common}><path d="M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.3"/></svg>`,
    message:`<svg ${common}><path d="M5 6.5A6.5 6.5 0 0 1 11.5 3h1A6.5 6.5 0 0 1 19 9.5v.4a6.5 6.5 0 0 1-6.5 6.5H10l-4.6 3.1.9-4.1A6.5 6.5 0 0 1 5 9.9v-.4Z"/></svg>`,
    trash:`<svg ${common}><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 11v6M14 11v6"/></svg>`,
    whatsapp:`<svg ${common}><path d="M20.5 11.8a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.3-4.7A8.5 8.5 0 1 1 20.5 11.8Z"/><path d="M8.6 8.3c.2-.4.4-.5.7-.5h.5c.2 0 .4.1.5.4l.7 1.7c.1.3 0 .5-.2.7l-.4.5c-.1.1-.2.3-.1.5.5 1 1.3 1.8 2.3 2.3.2.1.4 0 .5-.1l.5-.5c.2-.2.4-.2.7-.1l1.7.8c.3.1.4.3.4.6v.4c0 .4-.2.7-.5.9-.5.3-1.1.4-1.6.4-1 0-3.6-.9-5.5-2.8-1.9-1.9-2.8-4.5-2.8-5.5 0-.6.1-1.1.4-1.6Z"/></svg>`,
    telegram:`<svg ${common}><path d="M21 4 3 11.2l6.6 2.2L17 7.6l-5.8 7.4v4.5l3.2-3.1 4.7 3.5L21 4Z"/></svg>`,
    bowl:`<svg ${common}><path d="M4 12h16a8 8 0 0 1-16 0Z"/><path d="M7 12a5 5 0 0 1 10 0M8 4c1.5 1.2 1.5 2.4 0 3.6M12 3c1.5 1.2 1.5 2.7 0 4M16 4c1.5 1.2 1.5 2.4 0 3.6"/></svg>`,
    fish:`<svg ${common}><path d="M16 12c-2.3 3-6.2 4.3-11 4 1.5-1.4 2.2-2.7 2.2-4S6.5 9.4 5 8c4.8-.3 8.7 1 11 4Z"/><path d="M16 12c1.7-2.3 3.5-3.3 5-3-1 1.6-1 4.4 0 6-1.5.3-3.3-.7-5-3Z"/><circle cx="10" cy="11" r=".5"/></svg>`,
    burger:`<svg ${common}><path d="M4 11c.4-4 3.3-6 8-6s7.6 2 8 6H4Z"/><path d="M4 15h16M5 19h14a2 2 0 0 0 2-2H3a2 2 0 0 0 2 2Z"/><path d="M6 12c1.4 1 2.8 1 4.2 0 1.2-1 2.4-1 3.6 0 1.4 1 2.8 1 4.2 0"/></svg>`,
    pizza:`<svg ${common}><path d="M4 20 20 4c-5.7-1.3-11.3 1-14.2 5.8C3.8 13 3.2 16.6 4 20Z"/><circle cx="11" cy="11" r="1"/><circle cx="15" cy="8" r="1"/><circle cx="8" cy="15" r="1"/><path d="M7 9c3.2 1.2 5.8 3.8 7 7"/></svg>`,
    cup:`<svg ${common}><path d="M6 8h10v7a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V8Z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 4c1 1 1 2 0 3M12 4c1 1 1 2 0 3"/></svg>`,
    hotdog:`<svg ${common}><path d="M4 15c5 2.8 11 2.8 16 0"/><path d="M5 11c4.5-2.4 9.9-2.4 14 0"/><path d="M6 13c4 1.8 8 1.8 12 0"/><path d="M7 12c1 .9 2 .9 3 0s2-.9 3 0 2 .9 3 0"/></svg>`,
    drumstick:`<svg ${common}><path d="M16.8 5.2c2.7 2.7 2.8 6.6.3 9.1-2.2 2.2-5.7 2.4-8.2.7L6.5 17.4a2 2 0 1 1-2.8-2.8l2.4-2.4c-1.7-2.5-1.5-6 .7-8.2 2.5-2.5 7-1.5 10 1.2Z"/><path d="M6.1 12.2 8.8 15"/></svg>`,
    cake:`<svg ${common}><path d="M4 11h16v8H4z"/><path d="M4 15c2 1.2 4 1.2 6 0s4-1.2 6 0 3 .8 4 0M8 8h8v3H8zM12 4v4M10 4h4"/></svg>`,
    utensils:`<svg ${common}><path d="M4 3v7M7 3v7M5.5 10v11M18 3v18M14 3v6a4 4 0 0 0 4 4"/></svg>`,
    box:`<svg ${common}><path d="m3 8 9-5 9 5-9 5-9-5Z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/></svg>`,
    sauce:`<svg ${common}><path d="M10 3h4l1 5H9l1-5ZM9 8h6l1 12H8L9 8Z"/><path d="M10 13h4"/></svg>`,
    drink:`<svg ${common}><path d="M7 3h10l-1.5 18h-7L7 3Z"/><path d="M8 8h8M10 3l2 8 4-8"/></svg>`,
    wrap:`<svg ${common}><path d="M6 5c5 0 9 4 12 11-6 3-11 2-14-2 0-4 .7-7 2-9Z"/><path d="M7 8c2 0 4 1 5 3M8 13c2 .8 4 .7 6-.3"/></svg>`,
    mojito:`<svg ${common}><path d="M7 8h10l-1.2 13H8.2L7 8Z"/><path d="M8 12h8M10 4l2 4M16 3l-4 5M17 3c-3 0-4 1-5 4 3 0 5-1 5-4Z"/></svg>`
  };
  return icons[name]||icons.utensils;
}
function renderSvgSlots(root=document){
  root.querySelectorAll('.svg-slot').forEach(el=>{
    const icon=el.getAttribute('data-icon')||'utensils';
    const cls=el.className.replace('svg-slot','').trim()||'svg-icon';
    const id=el.id;
    let html=svgIcon(icon,cls);
    if(id) html=html.replace('<svg ', `<svg id=\"${id}\" `);
    el.outerHTML=html;
  });
}

renderSvgSlots();
const SHOP_PHONE='+77766807860';
const SHOP_PHONE_TEXT='+7 776 680 78 60';
const SHOP_ADDRESS='улица Трудовиков, 2г, Грозный, Чеченская Республика';
const SHOP_ADDRESS_SHORT='ул. Трудовиков, 2г';
const SHOP_MAP_URL='https://yandex.ru/maps/?ll=45.593695%2C43.373205&z=17&pt=45.593695%2C43.373205%2Cpm2rdm';
const SHOP_INSTAGRAM_URL='https://www.instagram.com/sushi_crazy_195/';
const SHOP_INSTAGRAM_HANDLE='@sushi_crazy_195';
const SHOP_SCHEDULE=Object.freeze({open:'11:00',close:'22:40',utcOffsetMinutes:300});
const PICKUP_PREPARATION_MINUTES=40;
const PICKUP_SLOT_STEP_MINUTES=20;
function parseTimeMinutes(time){
  const [hours,minutes]=time.split(':').map(Number);
  return hours*60+minutes;
}
function formatTimeMinutes(minutes){
  const normalized=((minutes%1440)+1440)%1440;
  return String(Math.floor(normalized/60)).padStart(2,'0')+':'+String(normalized%60).padStart(2,'0');
}
function getRestaurantLocalMinutes(date){
  const utcMinutes=date.getUTCHours()*60+date.getUTCMinutes()+date.getUTCSeconds()/60+date.getUTCMilliseconds()/60000;
  return ((utcMinutes+SHOP_SCHEDULE.utcOffsetMinutes)%1440+1440)%1440;
}
function getAvailablePickupSlots(date){
  const open=parseTimeMinutes(SHOP_SCHEDULE.open);
  const close=parseTimeMinutes(SHOP_SCHEDULE.close);
  const ready=getRestaurantLocalMinutes(date)+PICKUP_PREPARATION_MINUTES;
  const first=Math.max(open,open+Math.ceil((ready-open)/PICKUP_SLOT_STEP_MINUTES)*PICKUP_SLOT_STEP_MINUTES);
  const slots=[];
  for(let minutes=first;minutes<=close;minutes+=PICKUP_SLOT_STEP_MINUTES)slots.push(formatTimeMinutes(minutes));
  return slots;
}
function renderShopSchedule(){
  const schedule=document.getElementById('shopSchedule');
  if(schedule)schedule.textContent=`График: с ${SHOP_SCHEDULE.open} до ${SHOP_SCHEDULE.close}`;
}
renderShopSchedule();
const reducedMotionQuery=window.matchMedia?.('(prefers-reduced-motion: reduce)');
function prefersReducedMotion(){return !!reducedMotionQuery?.matches;}
const PICKUP_TIME_SHEET_MEDIA='(max-width:600px), (max-height:600px) and (pointer:coarse)';
const pickupTimeSheetQuery=window.matchMedia?.(PICKUP_TIME_SHEET_MEDIA);
function isPickupTimeSheetMode(){return !!pickupTimeSheetQuery?.matches;}
function runAfterMotion(callback,duration){
  if(prefersReducedMotion()){callback();return;}
  setTimeout(callback,duration);
}
function restartMotionClass(node,cls){
  if(prefersReducedMotion()){node.classList.add(cls);return;}
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

// Свои iOS-иконки клади рядом с HTML в папку icons/ и называй так:
// icons/whatsapp-ios.png, icons/messages-ios.png, icons/phone-ios.png, icons/maps-ios.png
// Можешь заменить пути ниже на свои названия файлов.
const ICON_PATHS={
  whatsapp:'icons/whatsapp-ios.png',
  sms:'icons/messages-ios.png',
  phone:'icons/phone-ios.png',
  map:'icons/maps-ios.png'
};
const PAYMENT_METHOD_LABELS=Object.freeze({
  kaspi_invoice:'Выставить счёт на оплату Kaspi',
  card:'Оплата картой',
  cash:'Оплата наличными'
});
function iosIconImg(service,alt,mini=false){
  const cls=mini?'ios-mini-img':'ios-app-img';
  const src=ICON_PATHS[service]||'';
  return `<img class="${cls}" src="${src}" alt="${alt}" onerror="this.style.display='none';this.parentElement.classList.add('missing-icon')">`;
}
let pendingOrderText='';
let pendingOrderPayload=null;

let popularDidDrag=false;
let popularPointerOpenedAt=0;
function initDragSlider(areaId,onLeft,onRight,onReset,onMove){
  const area=document.getElementById(areaId);
  if(!area)return;
  let down=false,startX=0,lastX=0,w=0,moved=false,downTarget=null,pointerId=null;
  area.addEventListener('pointerdown',e=>{
    popularDidDrag=false;
    down=true;
    moved=false;
    startX=e.clientX;
    lastX=e.clientX;
    w=area.clientWidth||1;
    downTarget=e.target;
    pointerId=e.pointerId;
    area.classList.add('grabbing','dragging');

    // Захватываем указатель сразу, как в исходной рабочей версии:
    // это критично для плавного свайпа карточек пальцем на телефоне.
    if(area.setPointerCapture){
      try{area.setPointerCapture(e.pointerId);}catch(_){}
    }
  });
  area.addEventListener('pointermove',e=>{
    if(!down)return;
    lastX=e.clientX;
    const dx=lastX-startX;
    if(Math.abs(dx)>6)moved=true;
    onMove&&onMove(dx);
  });
  function end(e){
    if(!down)return;
    const dx=lastX-startX;
    const wasMoved=moved;
    const tapTarget=downTarget;
    down=false;
    downTarget=null;
    area.classList.remove('grabbing','dragging');

    if(pointerId!==null&&area.hasPointerCapture?.(pointerId)){
      try{area.releasePointerCapture(pointerId);}catch(_){}
    }
    pointerId=null;

    if(wasMoved)popularDidDrag=true;

    if(Math.abs(dx)>Math.min(90,w*.18)){
      dx<0?onLeft():onRight();
    }else{
      onReset&&onReset();
    }

    // Отдельный короткий тап открывает карточку прямо на pointerup.
    // Свайп при этом не открывает товар, а следующий тап после свайпа работает сразу.
    if(!wasMoved&&e?.type==='pointerup'&&!tapTarget?.closest?.('.cart-add-btn')){
      const detailBtn=tapTarget?.closest?.('.product-details-btn');
      const id=Number(detailBtn?.dataset?.productId);
      if(detailBtn&&Number.isFinite(id)){
        popularDidDrag=false;
        popularPointerOpenedAt=performance.now();
        e.preventDefault();
        openProd(id,detailBtn);
      }
    }
  }
  area.addEventListener('pointerup',end);
  area.addEventListener('pointercancel',end);
  area.addEventListener('lostpointercapture',end);
}
function openPopularItem(id,opener){
  if(performance.now()-popularPointerOpenedAt<700)return;
  if(popularDidDrag){popularDidDrag=false;return;}
  openProd(id,opener);
}

function foodIcon(type){
  const icons={burger:'burger',wrap:'wrap',hotdog:'hotdog',fries:'box',wings:'drumstick',box:'box',roll:'bowl',set:'fish',pizza:'pizza',sauce:'sauce',drink:'drink',tea:'cup',mojito:'mojito',cake:'cake'};
  return svgIcon(icons[type]||'utensils','svg-icon food-icon');
}

const M=[];
const CATS=[{id:'f',l:'Фаст-фуд'},{id:'r',l:'Роллы'},{id:'s',l:'Сеты'},{id:'z',l:'Пицца'},{id:'a',l:'Соусы'},{id:'d',l:'Напитки'}];
const CN={f:'Фаст-фуд',r:'Роллы',s:'Сеты',z:'Пицца',a:'Соусы',d:'Напитки'};
let isGrid=true,activeCat='all',search='',cart={},delMode='d',pickupTime='',popIndex=0,favoritesOnly=false;
let menuReady=false;
let cartRestored=false;
const CART_STORAGE_KEY='sushi-crazy-cart-v1';
const FAVORITES_STORAGE_KEY='sushi-crazy-favorites-v1';
let favorites=new Set();
let favoritesRefreshPending=false;
try{
  const savedFavorites=JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY)||'[]');
  if(Array.isArray(savedFavorites))favorites=new Set(savedFavorites.filter(Boolean).map(String));
}catch(error){favorites=new Set();}
function persistFavorites(){
  try{localStorage.setItem(FAVORITES_STORAGE_KEY,JSON.stringify([...favorites]));}catch(error){}
}
function isFavorite(itemOrId){
  const item=typeof itemOrId==='object'?itemOrId:getItem(itemOrId);
  return !!item&&favorites.has(item.n);
}
function syncFavoritesUi(){
  const toggle=document.getElementById('favToggle');
  const count=document.getElementById('favCount');
  if(count)count.textContent=String(favorites.size);
  document.body.classList.toggle('favorites-mode',favoritesOnly);
  if(toggle){
    toggle.classList.toggle('on',favoritesOnly);
    toggle.classList.toggle('has-favorites',favorites.size>0);
    toggle.setAttribute('aria-pressed',favoritesOnly?'true':'false');
    toggle.setAttribute('aria-label',favoritesOnly?'Показать все товары':'Показать избранное');
  }
  updateProductFavoriteButton();
}
function updateProductFavoriteButton(){
  const btn=document.getElementById('prodFavBtn');
  if(!btn)return;
  const active=isFavorite(activeProductId);
  btn.classList.toggle('is-favorite',active);
  btn.setAttribute('aria-pressed',active?'true':'false');
  btn.setAttribute('aria-label',active?'Убрать товар из избранного':'Добавить товар в избранное');
  btn.title=active?'Убрать из избранного':'В избранное';
}
function toggleFavorite(id,event){
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const item=getItem(id);
  if(!item)return;
  if(favorites.has(item.n)){
    favorites.delete(item.n);
    showToast('Удалено из избранного');
  }else{
    favorites.add(item.n);
    showToast('Добавлено в избранное');
  }
  persistFavorites();
  if(favoritesOnly){
    const productOpen=document.getElementById('prodOv')?.classList.contains('on');
    if(productOpen)favoritesRefreshPending=true;
    else render();
  }
  syncFavoritesUi();
}
function toggleFavoritesFilter(){
  // Если пользователь уже находится в избранном, выход должен работать
  // даже когда последняя сохранённая позиция была удалена.
  if(favoritesOnly){
    favoritesOnly=false;
    render();
    syncFavoritesUi();
    requestAnimationFrame(()=>document.getElementById('menuArea')?.scrollIntoView({behavior:prefersReducedMotion()?'auto':'smooth',block:'start'}));
    return;
  }
  if(!favorites.size){
    showToast('В избранном пока пусто');
    return;
  }
  favoritesOnly=true;
  render();
  syncFavoritesUi();
  requestAnimationFrame(()=>document.getElementById('menuArea')?.scrollIntoView({behavior:prefersReducedMotion()?'auto':'smooth',block:'start'}));
}

function restoreCart(){
  try{
    const saved=JSON.parse(localStorage.getItem(CART_STORAGE_KEY)||'{}');
    const next={};
    Object.entries(saved||{}).forEach(([id,qty])=>{
      const item=getItem(id);
      const count=Math.max(0,Math.floor(Number(qty)||0));
      if(item&&count>0)next[id]=count;
    });
    cart=next;
  }catch(error){cart={};}
  cartRestored=true;
}
function persistCart(){
  if(!cartRestored)return;
  try{localStorage.setItem(CART_STORAGE_KEY,JSON.stringify(cart));}catch(error){}
}
const POPULAR_IDS=[15,1,2,3,10,18];
const REF_CAT_IDS={'Фаст-фуд':'f','Роллы':'r','Сеты':'s','Пицца':'z','Соусы':'a','Напитки':'d'};
const REF_DESC={'Торт из 7 порций':'2 бешеный 2 Калифорния с крабом 1 горячий 1 Филадельфия 1 тори темпура','Бизнес-ланч':'Состав: бургер (булочка, котлета, маринованный огурец, соус), картофель фри, наггетсы, кетчуп Пищевая ценность на порцию: Б33 / Ж45 / У105','Чизбургер (говяжий)':'Состав: булочка, говяжья котлета, сыр, салат, помидор, соус Пищевая ценность на порцию: Б24 / Ж30 / У46','Гиро на тарелке':'Состав: курица (гиро), картофель фри, пита, помидор, огурец, лук, соус (чесночный/дзадзики) Пищевая ценность на порцию: Б38 / Ж45 / У105','Пепперони':'Состав: колбаса, пицца соус, сыр моцарелла Пищевая ценность на порцию: Б52 / Ж60 / У118','Бешеный лосось':'Состав: рис, лосось, нори, сыр, тобико, огурец, карамель, унаги соус Пищевая ценность на порцию: Б19 / Ж24 / У62'};
function rebuildCats(){const el=document.getElementById('catsEl');if(!el)return;el.innerHTML='';CATS.forEach((c,idx)=>{const b=document.createElement('button');b.className='cat'+(idx===0?' on':'');b.textContent=c.l;b.onclick=()=>{document.querySelectorAll('.cat').forEach(x=>x.classList.remove('on'));b.classList.add('on');if(window.muteSpy)window.muteSpy(600);const sec=document.getElementById('sec-'+c.id);if(sec)window.scrollTo(0,Math.max(0,sec.offsetTop-92));};el.appendChild(b);});}
fetch('ref-products-dom.json')
  .then(r=>{if(!r.ok)throw new Error('Menu data '+r.status);return r.json();})
  .then(data=>{
    if(!Array.isArray(data))throw new Error('Invalid menu data');
    M.splice(0,M.length,...data.map((x,i)=>({id:i+1,c:REF_CAT_IDS[x.cat]||'f',n:x.name,w:x.weight,d:x.desc||REF_DESC[x.name]||'',p:x.price,img:x.img,detailImg:x.detailImg||'',i:(REF_CAT_IDS[x.cat]||'f')})));
    CATS.splice(0,CATS.length,...['Фаст-фуд','Роллы','Сеты','Пицца','Соусы','Напитки'].map(x=>({id:REF_CAT_IDS[x],l:x})));
    POPULAR_IDS.splice(0,POPULAR_IDS.length,...['Торт из 7 порций','Бизнес-ланч','Чизбургер (говяжий)','Гиро на тарелке','Пепперони','Бешеный лосось'].map(n=>(M.find(x=>x.n===n)||{}).id).filter(Boolean));
    menuReady=true;restoreCart();rebuildCats();renderPopular();render();syncFavoritesUi();updatePill();openProductFromUrl();
  })
  .catch(error=>{
    console.error(error);menuReady=true;
    const area=document.getElementById('menuArea');
    if(area)area.innerHTML='<div class="menu-load-error"><strong>Не удалось загрузить меню</strong><span>Проверьте соединение и попробуйте ещё раз.</span><button type="button" onclick="location.reload()">Повторить</button></div>';
    const popular=document.getElementById('popularCard');if(popular)popular.innerHTML='';
  });
function fmt(n){return n.toLocaleString('ru-RU')+' ₸'}
function getItem(id){return M.find(i=>i.id===parseInt(id));}
function priceText(n){return fmt(n).replace(' ₸','');}
function shownQty(id){return cart[id]||0;}
function shownTotal(item){return item.p*Math.max(1,shownQty(item.id));}
function addBtnHtml(id){const q=shownQty(id);return q>0?`<p>${q}</p>`:svgIcon('plus','svg-icon plus-icon');}
function addBtnAria(id){const q=shownQty(id);return q>0?`Добавить ещё. Сейчас в корзине: ${q}`:'Добавить в корзину';}
function cartAddButton(id,cls){
  const q=shownQty(id);
  const action=` onclick="event.preventDefault();event.stopPropagation();addCart(${id})"`;
  return `<button type="button" class="${cls} cart-add-btn${q>0?' in-cart':''}" data-add-id="${id}" onpointerdown="event.stopPropagation()"${action} aria-label="${addBtnAria(id)}">${addBtnHtml(id)}</button>`;
}
function priceMarkup(item,cls){
  const total=shownTotal(item);
  const inner=cls==='pop-price'?`${priceText(total)} <span>₸</span>`:fmt(total);
  return `<div class="${cls} price-live" data-price-id="${item.id}" data-base-price="${item.p}">${inner}</div>`;
}
function qtyPriceHtml(item,cls){return priceMarkup(item,cls);}
function setPriceNodeText(node,item){
  const total=shownTotal(item);
  if(node.classList.contains('pop-price')) node.innerHTML=`${priceText(total)} <span>₸</span>`;
  else node.textContent=fmt(total);
}
function bumpNode(node,cls){
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
  setTimeout(()=>node.classList.remove(cls),360);
}
function syncAddButtons(idFilter=null,animate=false){
  document.querySelectorAll('[data-add-id]').forEach(btn=>{
    const id=parseInt(btn.dataset.addId);
    if(idFilter!==null && id!==parseInt(idFilter))return;
    const q=shownQty(id);
    btn.innerHTML=addBtnHtml(id);
    btn.setAttribute('aria-label',addBtnAria(id));
    btn.classList.toggle('in-cart',q>0);
    btn.setAttribute('onpointerdown','event.stopPropagation()');
    btn.setAttribute('onclick',`event.preventDefault();event.stopPropagation();addCart(${id})`);
    if(animate)bumpNode(btn,'qty-pop');
  });
  updateOrderState();
}
function updatePriceNodes(idFilter=null,animate=false){
  document.querySelectorAll('[data-price-id]').forEach(node=>{
    const id=parseInt(node.dataset.priceId);
    if(idFilter!==null && id!==parseInt(idFilter))return;
    const item=getItem(id);
    if(!item)return;
    setPriceNodeText(node,item);
    if(animate)bumpNode(node,'price-bump');
  });
}
function syncCardState(id=null,animate=false){
  updatePriceNodes(id,animate);
  syncAddButtons(id,animate);
}
function refreshCatalogState(){renderPopular();render();syncCardState();}
function syncPickupTimeControl(){
  const trigger=document.getElementById('pickupTimeTrigger');
  const error=document.getElementById('pickupTimeErr');
  if(trigger){
    trigger.textContent=pickupTime||'Выберите время';
    if(pickupTime)trigger.removeAttribute('aria-invalid');
  }
  if(pickupTime&&error)error.hidden=true;
}
function renderPickupTimeSlots(slots){
  const grid=document.getElementById('pickupTimeSlots');
  const unavailable=document.getElementById('pickupTimeUnavailable');
  if(grid)grid.innerHTML=slots.map(time=>`<button class="pickup-time-slot" type="button" aria-pressed="${time===pickupTime}" onclick="selectPickupTime('${time}')">${time}</button>`).join('');
  if(unavailable)unavailable.hidden=slots.length>0;
}
function positionPickupTimePanel(trigger,sheetMode){
  const panel=document.getElementById('pickupTimePanel');
  if(!panel||sheetMode)return;
  const rect=trigger.getBoundingClientRect();
  const width=Math.min(320,window.innerWidth-24);
  const left=Math.min(Math.max(12,rect.left),window.innerWidth-width-12);
  const panelHeight=Math.min(panel.scrollHeight||420,420);
  const below=rect.bottom+8;
  const top=below+panelHeight<=window.innerHeight-12?below:Math.max(12,rect.top-panelHeight-8);
  panel.style.left=left+'px';
  panel.style.top=top+'px';
}
function openPickupTimePicker(trigger){
  const sheetMode=isPickupTimeSheetMode();
  const slots=getAvailablePickupSlots(new Date());
  if(pickupTime&&!slots.includes(pickupTime)){
    pickupTime='';
    syncPickupTimeControl();
  }
  renderPickupTimeSlots(slots);
  positionPickupTimePanel(trigger,sheetMode);
  trigger.setAttribute('aria-expanded','true');
  openOv('pickupTimeOv',trigger);
}
function selectPickupTime(time){
  const slots=getAvailablePickupSlots(new Date());
  if(!slots.includes(time))return;
  pickupTime=time;
  syncPickupTimeControl();
  renderPickupTimeSlots(slots);
  updateOrderState();
  closeOv('pickupTimeOv');
}
let pickupDragTarget=null,pickupDragPointerId=null,pickupDragStartY=0,pickupDragOffset=0;
function cleanupPickupDrag(){
  if(!pickupDragTarget)return;
  if(pickupDragPointerId!==null&&pickupDragTarget.hasPointerCapture?.(pickupDragPointerId)){
    pickupDragTarget.releasePointerCapture(pickupDragPointerId);
  }
  pickupDragTarget.removeEventListener('pointermove',movePickupDrag);
  pickupDragTarget.removeEventListener('pointerup',endPickupDrag);
  pickupDragTarget.removeEventListener('pointercancel',cancelPickupDrag);
  pickupDragTarget=null;
  pickupDragPointerId=null;
}
function resetPickupDrag(){
  const panel=document.getElementById('pickupTimePanel');
  if(panel)panel.style.transform='';
  pickupDragOffset=0;
  cleanupPickupDrag();
}
function startPickupDrag(event){
  if(!isPickupTimeSheetMode()||event.button!==0)return;
  cleanupPickupDrag();
  pickupDragTarget=event.currentTarget;
  pickupDragPointerId=event.pointerId;
  pickupDragStartY=event.clientY;
  pickupDragOffset=0;
  pickupDragTarget.setPointerCapture(event.pointerId);
  pickupDragTarget.addEventListener('pointermove',movePickupDrag);
  pickupDragTarget.addEventListener('pointerup',endPickupDrag);
  pickupDragTarget.addEventListener('pointercancel',cancelPickupDrag);
}
function movePickupDrag(event){
  if(event.pointerId!==pickupDragPointerId)return;
  pickupDragOffset=Math.max(0,event.clientY-pickupDragStartY);
  const panel=document.getElementById('pickupTimePanel');
  if(panel)panel.style.transform=`translateY(${pickupDragOffset}px)`;
}
function endPickupDrag(event){
  if(event.pointerId!==pickupDragPointerId)return;
  pickupDragTarget?.releasePointerCapture(event.pointerId);
  const shouldClose=pickupDragOffset>96;
  resetPickupDrag();
  if(shouldClose)closeOv('pickupTimeOv');
}
function cancelPickupDrag(event){
  if(event.pointerId!==pickupDragPointerId)return;
  pickupDragTarget?.releasePointerCapture(event.pointerId);
  resetPickupDrag();
}
function updateOrderState(){
  const btn=document.getElementById('orderBtn');
  if(!btn)return;
  const hint=document.getElementById('orderHint');
  const hasItems=Object.keys(cart).some(k=>cart[k]>0);
  const addrInp=document.getElementById('addrInp');
  const phoneInp=document.getElementById('phoneInp');
  const paymentMethodInp=document.getElementById('paymentMethodInp');
  const addr=(addrInp?.value||'').trim();
  const phone=(phoneInp?.value||'').trim();
  const paymentMethod=paymentMethodInp?.value||'';
  const phoneValid=validPhone(phone);
  const addressValid=delMode!=='d'||!!addr;
  const paymentMethodValid=!!PAYMENT_METHOD_LABELS[paymentMethod];
  const pickupTimeValid=delMode!=='p'||getAvailablePickupSlots(new Date()).includes(pickupTime);

  if(phoneValid){
    const phoneErr=document.getElementById('phoneErr');
    if(phoneErr)phoneErr.hidden=true;
    phoneInp?.removeAttribute('aria-invalid');
  }
  if(addressValid){
    const addrErr=document.getElementById('addrErr');
    if(addrErr)addrErr.hidden=true;
    addrInp?.removeAttribute('aria-invalid');
  }
  if(paymentMethodValid){
    const paymentMethodErr=document.getElementById('paymentMethodErr');
    if(paymentMethodErr)paymentMethodErr.hidden=true;
  }
  if(pickupTimeValid){
    const pickupTimeErr=document.getElementById('pickupTimeErr');
    if(pickupTimeErr)pickupTimeErr.hidden=true;
    document.getElementById('pickupTimeTrigger')?.removeAttribute('aria-invalid');
  }

  const valid=hasItems&&phoneValid&&addressValid&&paymentMethodValid&&pickupTimeValid;
  btn.disabled=!valid;
  if(hint){
    let message='';
    if(hasItems){
      if(!phoneValid)message='Укажите номер телефона';
      else if(!addressValid)message='Укажите адрес доставки';
      else if(!pickupTimeValid)message='Выберите время самовывоза';
      else if(!paymentMethodValid)message='Выберите способ оплаты';
    }
    hint.textContent=message;
    hint.hidden=!message;
  }
}

rebuildCats();

function renderPopular(){
  const popular=document.getElementById('popularCard');
  if(!menuReady){if(popular)popular.innerHTML='<div class="menu-skeleton popular-skeleton"><span></span><div><b></b><i></i><i></i></div></div>';return;}
  const trackHtml=POPULAR_IDS.map((id,idx)=>{
    const item=getItem(id);
    if(!item)return '';
    return `<div class="popular-slide">
      <div class="pop-card">
        <button type="button" class="product-details-btn" data-product-id="${item.id}" onclick="openPopularItem(${item.id},this)" aria-label="Подробнее о ${item.n}"></button>
        <div class="pop-img">${item.img?`<img class="product-img" src="${item.img}" alt="${item.n}" loading="lazy" decoding="async" fetchpriority="auto">`:foodIcon(item.i)}</div>
        ${cartAddButton(item.id,'add-sq pop-add-top')}
        <div class="pop-body">
          <div class="pop-main">
            <div class="pop-name">${item.n}</div>
            <div class="pop-weight">${item.w}</div>
            <div class="pop-desc">${item.d}</div>
          </div>
          <div class="pop-footer">
            ${qtyPriceHtml(item,'pop-price')}
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
  document.getElementById('popularCard').innerHTML=`<div class="popular-track" id="popularTrack">${trackHtml}</div>`;
  renderPopularDots();
  updatePopular();
}
function setPopular(i){
  popIndex=(i+POPULAR_IDS.length)%POPULAR_IDS.length;
  updatePopular();
}
let popularAuto=null;
renderPopular();
initDragSlider('popularCard',()=>setPopular(popIndex+1),()=>setPopular(popIndex-1),()=>updatePopular(),dx=>updatePopular(dx));

function filtered(){
  let r=M;
  if(favoritesOnly)r=r.filter(item=>favorites.has(item.n));
  const query=search.trim().toLowerCase();
  if(query)r=r.filter(i=>[i.n,i.d,CN[i.c]||i.c].join(' ').toLowerCase().includes(query));
  return r;
}
function menuGridCardHtml(item){
  return `<div class="gc">
    <button type="button" class="product-details-btn" onclick="openProd(${item.id},this)" aria-label="Подробнее о ${item.n}"></button>
    <div class="gc-img">${item.img?`<img class="product-img" src="${item.img}" alt="${item.n}" loading="lazy" decoding="async" fetchpriority="auto">`:foodIcon(item.i)}
      ${cartAddButton(item.id,'gc-plus')}
    </div>
    <div class="gc-foot">
      <div class="gc-name">${item.n}</div>
      <div class="gc-weight">${item.w}</div>
    </div>
    ${qtyPriceHtml(item,'gc-price')}
  </div>`;
}
function menuListCardHtml(item){
  return `<div class="lc">
    <button type="button" class="product-details-btn" onclick="openProd(${item.id},this)" aria-label="Подробнее о ${item.n}"></button>
    <div class="lc-img">${item.img?`<img class="product-img" src="${item.img}" alt="${item.n}" loading="lazy" decoding="async" fetchpriority="auto">`:foodIcon(item.i)}</div>
    <div class="lc-info">
      <div class="lc-name">${item.n}</div>
      <div class="lc-weight">${item.w}</div>
      <div class="lc-desc">${item.d}</div>
    </div>
    <div class="lc-right">
      ${cartAddButton(item.id,'add-sq')}
      ${qtyPriceHtml(item,'lc-price')}
    </div>
  </div>`;
}
function render(){
  if(!menuReady){
    const area=document.getElementById('menuArea');
    if(area)area.innerHTML='<div class="menu-loading-grid">'+Array.from({length:6},()=>'<div class="menu-skeleton card-skeleton"><span></span><b></b><i></i></div>').join('')+'</div>';
    return;
  }
  const items=filtered();

  if(favoritesOnly){
    const allFavoriteCount=[...favorites].filter(name=>M.some(item=>item.n===name)).length;
    const resultText=search.trim()
      ? `${items.length} из ${allFavoriteCount} сохранённых`
      : `${allFavoriteCount} ${allFavoriteCount===1?'товар':allFavoriteCount>=2&&allFavoriteCount<=4?'товара':'товаров'}`;
    let cards='';
    if(items.length){
      cards=isGrid
        ? `<div class="favorites-grid">${items.map(menuGridCardHtml).join('')}</div>`
        : `<div class="favorites-list">${items.map(menuListCardHtml).join('')}</div>`;
    }else{
      cards=`<div class="favorites-empty">
        <div class="favorites-empty-icon">${svgIcon('heart','svg-icon')}</div>
        <strong>${search.trim()?'В избранном ничего не найдено':'В избранном пока пусто'}</strong>
        <span>${search.trim()?'Измените запрос или очистите поиск.':'Откройте блюдо и нажмите сердечко, чтобы сохранить его здесь.'}</span>
        ${search.trim()?'<button type="button" onclick="clearSearch()">Очистить поиск</button>':'<button type="button" onclick="toggleFavoritesFilter()">Вернуться в меню</button>'}
      </div>`;
    }
    document.getElementById('menuArea').innerHTML=`<section class="favorites-view">
      <div class="favorites-view-head">
        <div>
          <span class="favorites-kicker">Сохранённое</span>
          <h2>Избранное</h2>
          <p>${resultText}</p>
        </div>
        <button type="button" class="favorites-back" onclick="toggleFavoritesFilter()">Все меню</button>
      </div>
      ${cards}
    </section>`;
    return;
  }

  const byCat={};
  items.forEach(i=>{if(!byCat[i.c])byCat[i.c]=[];byCat[i.c].push(i)});
  let html='';
  for(const cat in byCat){
    html+=`<h2 class="menu-sec-title" id="sec-${cat}">${CN[cat]||cat}</h2>`;
    if(isGrid){
      html+=`<div class="g4">${byCat[cat].map(menuGridCardHtml).join('')}</div>`;
    }else{
      html+=`<div class="lv">${byCat[cat].map(menuListCardHtml).join('')}</div>`;
    }
  }
  if(!html) html='<div class="empty-search"><strong>Ничего не найдено</strong><span>Попробуйте другой запрос или сбросьте поиск.</span><button type="button" onclick="clearSearch()">Сбросить поиск</button></div>';
  document.getElementById('menuArea').innerHTML=html;
}
render();

function setViewIcon(){
  const btn=document.getElementById('vbtn');
  if(btn) btn.innerHTML=svgIcon(isGrid?'grid':'list','ui-icon');
}
function toggleView(){
  isGrid=!isGrid;
  setViewIcon();
  render();
}
function doSearch(v){search=v;render();}
const viewBtn=document.getElementById('vbtn');
if(viewBtn){
  viewBtn.addEventListener('click',e=>{e.preventDefault();toggleView();});
}
setViewIcon();

function openProd(id,opener,skipHistory=false){
  const item=getItem(id);
  if(!item)return;
  activeProductId=item.id;
  if(!skipHistory)pushMenuOverlayState('prodOv',item.id);
  document.getElementById('prodContent').innerHTML=`
    <div class="ps-img${item.detailImg?' detail-generated':''}">${(item.detailImg||item.img)?`<img class="product-img" src="${item.detailImg||item.img}" alt="${item.n}" decoding="async" fetchpriority="high">`:foodIcon(item.i)}</div>
    <div class="ps-dot" aria-hidden="true"></div>
    <div class="ps-body">
      <div class="ps-name" id="prodTitle">${item.n}</div>
      <div class="ps-weight">${item.w}</div>
      <div class="ps-desc">${item.d}</div>
    </div>
    <div class="ps-footer" style="margin:0 20px 20px">
      ${qtyPriceHtml(item,'ps-price')}
      ${cartAddButton(item.id,'ps-add')}
    </div>`;
  updateProductFavoriteButton();
  openOv('prodOv',opener);
}
function addCart(id){
  cart[id]=(cart[id]||0)+1;
  updatePill();
  syncCardState(id,true);
  if(document.getElementById('cartOv')?.classList.contains('on'))renderCart();
}
function updatePill(){
  const keys=Object.keys(cart).filter(k=>cart[k]>0);
  const total=keys.reduce((s,id)=>{
    const item=getItem(id);
    return s+(item&&cart[id]?item.p*cart[id]:0);
  },0);
  const cnt=keys.reduce((s,k)=>s+cart[k],0);
  const pill=document.getElementById('cpill');
  if(cnt>0){
    pill.classList.add('on');
    document.getElementById('cpBadge').textContent=cnt;
    document.getElementById('cpTotal').textContent=fmt(total);
  } else {
    pill.classList.remove('on');
  }
}
function openCart(skipHistory=false){
  if(!skipHistory)pushMenuOverlayState('cartOv');
  renderCart();syncCartOptionalBlocks();openOv('cartOv');
}

function getCartRecommendations(){
  const keys=Object.keys(cart).filter(k=>cart[k]>0);
  if(!keys.length)return [];
  const inCart=new Set(keys.map(Number));
  const cats=new Set(keys.map(id=>getItem(id)?.c).filter(Boolean));
  const names=[];
  const push=(...values)=>values.forEach(value=>{if(!names.includes(value))names.push(value);});
  if(cats.has('f'))push('Картошка фри','Сырный соус','Добрый Cola','Чесночный соус');
  if(cats.has('r')||cats.has('s'))push('Чесночный соус','Добрый Cola','Сырный соус','ST.OM Black Ice Tea (персик)');
  if(cats.has('z'))push('Сырный соус','Добрый Cola','Чесночный соус','Кисло-сладкий');
  if(cats.has('a'))push('Добрый Cola','Картошка фри');
  if(cats.has('d'))push('Сырный соус','Картошка фри');
  push('Добрый Cola','Сырный соус','Чесночный соус');
  return names.map(name=>M.find(item=>item.n===name)).filter(item=>item&&!inCart.has(item.id)).slice(0,3);
}
function renderCartRecommendations(){
  const host=document.getElementById('cartRecommendations');
  if(!host)return;
  const items=getCartRecommendations();
  if(!items.length){host.innerHTML='';host.hidden=true;return;}
  host.hidden=false;
  host.innerHTML=`<section class="cart-recommendations" aria-labelledby="cartRecommendationsTitle">
    <div class="cart-recommendations-title" id="cartRecommendationsTitle">С этим берут</div>
    <div class="cart-recommendations-list">
      ${items.map(item=>`<div class="cart-rec-item">
        <div class="cart-rec-img">${item.img?`<img src="${item.img}" alt="${item.n}" loading="lazy" decoding="async">`:foodIcon(item.i)}</div>
        <div class="cart-rec-copy"><strong>${item.n}</strong><span>${fmt(item.p)}</span></div>
        <button type="button" class="cart-rec-add" onclick="addCart(${item.id})" aria-label="Добавить ${item.n}">${svgIcon('plus','svg-icon')}</button>
      </div>`).join('')}
    </div>
  </section>`;
}

function renderCart(){
  const keys=Object.keys(cart).filter(k=>cart[k]>0);
  const cartOv=document.getElementById('cartOv');
  cartOv?.classList.toggle('cart-empty',keys.length===0);
  let html='';
  if(!keys.length){
    html=`<div class="empty-cs">
      <div class="empty-cs-icon">${svgIcon('cart','svg-icon')}</div>
      <div class="empty-cs-title">Корзина пуста</div>
      <div class="empty-cs-sub">Добавьте блюда из меню — они появятся здесь.</div>
      <button class="empty-cs-btn" type="button" onclick="closeOv('cartOv')">Вернуться к меню</button>
    </div>`;
  }else keys.forEach(id=>{
    const item=getItem(id);
    if(!item)return;
    const qty=cart[id];
    html+=`<div class="ci ci-card">
      <div class="ci-img">${item.img?`<img class="product-img" src="${item.img}" alt="${item.n}" loading="lazy" decoding="async" fetchpriority="auto">`:foodIcon(item.i)}</div>
      <div class="ci-info">
        <div class="ci-name">${item.n}</div>
        <div class="ci-weight">${item.w}</div>
        <div class="ci-bottom-row">
          <div class="ci-price">${fmt(item.p*qty)}<span>${qty>1?fmt(item.p)+' за шт.':'за позицию'}</span></div>
          <div class="qty-row" aria-label="Количество">
            <button class="qb" onclick="chQ('${id}',-1)" aria-label="Уменьшить количество">${svgIcon('minus','svg-icon plus-icon')}</button>
            <div class="qn">${qty}</div>
            <button class="qb" onclick="chQ('${id}',1)" aria-label="Увеличить количество">${svgIcon('plus','svg-icon plus-icon')}</button>
          </div>
        </div>
      </div>
    </div>`;
  });
  document.getElementById('cartItems').innerHTML=html;
  renderCartRecommendations();
  const total=keys.reduce((s,id)=>{
    const item=getItem(id);
    return s+(item&&cart[id]?item.p*cart[id]:0);
  },0);
  const itemCount=keys.reduce((sum,id)=>sum+(cart[id]||0),0);
  document.getElementById('csTotal').textContent=fmt(total);
  const countNode=document.getElementById('csItemsCount');
  if(countNode)countNode.textContent=itemCount+' '+pluralItems(itemCount);
  updateOrderState();
}
function pluralItems(n){
  const mod10=n%10,mod100=n%100;
  if(mod10===1&&mod100!==11)return 'товар';
  if(mod10>=2&&mod10<=4&&(mod100<12||mod100>14))return 'товара';
  return 'товаров';
}
function chQ(id,d){
  cart[id]=(cart[id]||0)+d;
  if(cart[id]<=0)delete cart[id];
  updatePill();
  syncCardState(id,true);
  if(document.getElementById('cartOv')?.classList.contains('on'))renderCart();
}
function clearCart(){cart={};updatePill();syncCardState(null,true);renderCart();}
function confirmClearCart(){
  if(!Object.keys(cart).some(k=>cart[k]>0))return;
  if(window.confirm('Очистить корзину?'))clearCart();
}
function setPayment(value,btn){
  const input=document.getElementById('paymentMethodInp');
  if(input)input.value=value;
  document.querySelectorAll('#cartOv .payment-opt').forEach(el=>{
    const active=el===btn;
    el.classList.toggle('on',active);
    el.setAttribute('aria-pressed',active?'true':'false');
  });
  updateOrderState();
}
function toggleAddressDetails(btn){
  const block=document.getElementById('addressDetails');
  if(!block)return;
  const opening=block.hidden;
  block.hidden=!opening;
  btn?.setAttribute('aria-expanded',opening?'true':'false');
  if(btn)btn.textContent=opening?'− Скрыть детали адреса':'+ Добавить детали адреса';
}
function toggleCartComment(btn){
  const block=document.getElementById('commentBlock');
  if(!block)return;
  const opening=block.hidden;
  block.hidden=!opening;
  btn?.setAttribute('aria-expanded',opening?'true':'false');
  if(btn)btn.textContent=opening?'− Скрыть комментарий':'+ Добавить комментарий';
  if(opening)document.getElementById('commentTa')?.focus();
}
function syncCartOptionalBlocks(){
  const details=document.getElementById('addressDetails');
  const detailsBtn=document.getElementById('addressDetailsToggle');
  const hasAddressDetails=['entranceInp','floorInp','flatInp','intercomInp'].some(id=>(document.getElementById(id)?.value||'').trim());
  if(details&&detailsBtn&&hasAddressDetails){
    details.hidden=false;
    detailsBtn.setAttribute('aria-expanded','true');
    detailsBtn.textContent='− Скрыть детали адреса';
  }
  const comment=document.getElementById('commentTa');
  const commentBlock=document.getElementById('commentBlock');
  const commentBtn=document.getElementById('commentToggle');
  if(comment&&commentBlock&&commentBtn&&comment.value.trim()){
    commentBlock.hidden=false;
    commentBtn.setAttribute('aria-expanded','true');
    commentBtn.textContent='− Скрыть комментарий';
  }
}
function setDel(m,btn){
  delMode=m;
  document.querySelectorAll('.dopt').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('addrBlock').style.display=m==='d'?'block':'none';
  const pickupBlock=document.getElementById('pickupTimeBlock');
  if(pickupBlock)pickupBlock.hidden=m!=='p';
  if(m==='p'&&pickupTime&&!getAvailablePickupSlots(new Date()).includes(pickupTime)){
    pickupTime='';
    syncPickupTimeControl();
  }
  updateOrderState();
}
function currentTotal(){
  return Object.keys(cart).filter(k=>cart[k]>0).reduce((s,id)=>{
    const item=getItem(id);return s+(item?item.p*cart[id]:0);
  },0);
}
function validPhone(phone){const digits=phone.replace(/\D/g,'');return digits.length===11&&digits.startsWith('7');}
function formatPhoneValue(value){
  let digits=String(value||'').replace(/\D/g,'');
  if(!digits)return '';
  if(digits[0]==='8')digits='7'+digits.slice(1);
  else if(digits[0]!=='7'&&digits.length<=10)digits='7'+digits;
  digits=digits.slice(0,11);
  if(!digits.startsWith('7'))return '+'+digits;
  const body=digits.slice(1);
  let out='+7';
  if(body.length)out+=' '+body.slice(0,3);
  if(body.length>3)out+=' '+body.slice(3,6);
  if(body.length>6)out+=' '+body.slice(6,8);
  if(body.length>8)out+=' '+body.slice(8,10);
  return out;
}
function formatPhoneInput(input){
  if(!input)return;
  input.value=formatPhoneValue(input.value);
  updateOrderState();
}
function buildOrderPayload(){
  const keys=Object.keys(cart).filter(k=>cart[k]>0);
  const items=keys.map(id=>{
    const item=getItem(id);
    if(!item)return null;
    const quantity=cart[id];
    return {
      id:item.id,
      name:item.n,
      quantity,
      unitPrice:item.p,
      lineTotal:item.p*quantity
    };
  }).filter(Boolean);
  const read=id=>(document.getElementById(id)?.value||'').trim();
  return {
    items,
    total:items.reduce((sum,item)=>sum+item.lineTotal,0),
    orderMethod:delMode==='d'?'delivery':'pickup',
    contact:{name:read('nameInp'),phone:read('phoneInp')},
    deliveryAddress:delMode==='d'?{
      address:read('addrInp'),
      entrance:read('entranceInp'),
      floor:read('floorInp'),
      flat:read('flatInp'),
      intercom:read('intercomInp')
    }:null,
    pickupTime:delMode==='p'?pickupTime:null,
    paymentMethod:read('paymentMethodInp'),
    comment:read('commentTa')
  };
}
function buildOrderText(payload=buildOrderPayload()){
  const separator='────────────────';
  const head=title=>`── ${title} ──`;
  const paymentLabel={
    kaspi_invoice:'Счёт в Kaspi',
    card:'Оплата картой',
    cash:'Наличные'
  }[payload.paymentMethod]||PAYMENT_METHOD_LABELS[payload.paymentMethod]||'';

  const formatCustomerPhone=phone=>{
    const raw=String(phone||'').trim();
    const digits=raw.replace(/\D/g,'');
    if(digits.length===11&&(digits.startsWith('7')||digits.startsWith('8'))){
      const normalized=(digits.startsWith('8')?'7'+digits.slice(1):digits);
      return `+7 ${normalized.slice(1,4)} ${normalized.slice(4,7)} ${normalized.slice(7,9)} ${normalized.slice(9,11)}`;
    }
    return raw;
  };

  const lines=['Новый заказ · Sushi Crazy',separator];

  payload.items.forEach(item=>{
    lines.push(`${item.name} × ${item.quantity} — ${fmt(item.lineTotal)}`);
  });

  lines.push(separator);
  lines.push(`Итого ${fmt(payload.total)}`);
  lines.push(`${payload.orderMethod==='delivery'?'Доставка':'Самовывоз'} · ${paymentLabel}`);

  if(payload.orderMethod==='pickup'&&payload.pickupTime){
    lines.push(`Время: ${payload.pickupTime}`);
  }

  lines.push('');
  lines.push(head('КЛИЕНТ'));
  if(payload.contact.name)lines.push(payload.contact.name);
  if(payload.contact.phone)lines.push(formatCustomerPhone(payload.contact.phone));

  if(payload.deliveryAddress){
    lines.push('');
    lines.push(head('АДРЕС'));
    if(payload.deliveryAddress.address)lines.push(payload.deliveryAddress.address);
    const details=[];
    if(payload.deliveryAddress.entrance)details.push(`подъезд ${payload.deliveryAddress.entrance}`);
    if(payload.deliveryAddress.floor)details.push(`этаж ${payload.deliveryAddress.floor}`);
    if(payload.deliveryAddress.flat)details.push(`кв./офис ${payload.deliveryAddress.flat}`);
    if(payload.deliveryAddress.intercom)details.push(`домофон ${payload.deliveryAddress.intercom}`);
    if(details.length)lines.push(details.join(' · '));
  }

  if(payload.comment){
    lines.push('');
    lines.push(head('КОММЕНТАРИЙ'));
    lines.push(payload.comment);
  }

  return lines.join('\n');
}
function setSecondService(labelText='Напишите нам в сообщения'){
  const btn=document.getElementById('shareSecondBtn');
  const icon=document.getElementById('shareSecondIcon');
  const label=document.getElementById('shareSecondLabel');
  if(!btn||!icon||!label)return;
  btn.dataset.service='sms';
  icon.className='ss-icon ios-app ios-custom-icon';
  icon.classList.remove('missing-icon');
  icon.dataset.iconPlace=ICON_PATHS.sms;
  icon.innerHTML=iosIconImg('sms','Сообщения');
  label.textContent=labelText;
}
let activeProductId=null;

function getProductShareData(id=activeProductId){
  const item=getItem(Number(id));
  if(!item)return null;
  const url=new URL('/product/'+item.id,location.origin);
  return {
    id:item.id,
    title:`${item.n} — Sushi Crazy`,
    text:`${item.w} · ${fmt(item.p)}`,
    url:url.toString()
  };
}
function getProductShareMessage(id=activeProductId){
  const data=getProductShareData(id);
  return data?`${data.title}\n${data.text}\n${data.url}`:'';
}
async function shareProduct(){
  const data=getProductShareData();
  if(!data){
    showToast('Не удалось подготовить ссылку на товар');
    return;
  }
  const payload={title:data.title,text:data.text,url:data.url};
  const canNative=typeof navigator.share==='function'&&
    (typeof navigator.canShare!=='function'||navigator.canShare(payload));
  if(canNative){
    try{
      await navigator.share(payload);
      return;
    }catch(error){
      if(error?.name==='AbortError')return;
    }
  }
  openShare('product');
}
function menuBaseUrl(){
  const url=new URL(location.href);url.searchParams.delete('product');if(url.hash==='#cart')url.hash='';return url.pathname+url.search+url.hash;
}
function pushMenuOverlayState(id,productId=null){
  if(history.state?.menuOverlay===id)return;
  const url=new URL(location.href);
  if(id==='prodOv'){url.searchParams.set('product',String(productId));if(url.hash==='#cart')url.hash='';}
  else if(id==='cartOv'){url.searchParams.delete('product');url.hash='cart';}
  history.pushState({menuOverlay:id,productId},'',url.pathname+url.search+url.hash);
}
function replaceMenuBaseState(){history.replaceState({menuBase:true},'',menuBaseUrl());}

function openProductFromUrl(){
  const url=new URL(location.href),raw=url.searchParams.get('product');
  if(raw===null)return;
  const id=Number(raw),item=Number.isInteger(id)?getItem(id):null;
  if(!item){url.searchParams.delete('product');history.replaceState(history.state,'',url.pathname+url.search+url.hash);return;}
  if(history.state?.menuOverlay!=='prodOv'){
    const productUrl=url.pathname+url.search+url.hash;url.searchParams.delete('product');
    history.replaceState({menuBase:true},'',url.pathname+url.search+url.hash);
    history.pushState({menuOverlay:'prodOv',productId:item.id},'',productUrl);
  }
  openProd(item.id,null,true);
}
function clearProductUrlParam(){
  const url=new URL(location.href);
  if(!url.searchParams.has('product'))return;
  url.searchParams.delete('product');
  history.replaceState(history.state,'',url.pathname+url.search+url.hash);
}

function prepareServiceSheet(mode){
  const ov=document.getElementById('shareOv');
  const title=document.getElementById('shareTitle');
  const sub=document.getElementById('shareSub');
  const waLabel=document.getElementById('shareWaLabel');
  const copyLabel=document.getElementById('shareCopyLabel');
  const divider=document.getElementById('shareDivider');
  const callMeta=document.getElementById('shareCallMeta');
  const mapMeta=document.getElementById('shareMapMeta');
  const instagramBtn=document.getElementById('shareInstagramBtn');
  ov.classList.remove('contact-mode','order-mode','product-mode');
  ov.classList.add(mode+'-mode');
  if(callMeta)callMeta.textContent=SHOP_PHONE_TEXT;
  if(mapMeta)mapMeta.textContent=SHOP_ADDRESS_SHORT;
  if(instagramBtn)instagramBtn.hidden=mode!=='contact';
  if(mode==='contact'){
    pendingOrderText='Здравствуйте! Хочу уточнить информацию по меню Sushi Crazy.';
    title.textContent='Связаться с Sushi Crazy';
    sub.textContent='WhatsApp — основной способ связи. Ниже доступны остальные варианты.';
    waLabel.textContent='WhatsApp';
    copyLabel.textContent='Скопировать номер';
    divider.textContent='Другие способы';
    setSecondService('Сообщение');
  }
  if(mode==='order'){
    title.textContent='Куда отправить заказ?';
    sub.textContent='Заказ уже подготовлен. Осталось выбрать способ отправки.';
    waLabel.textContent='WhatsApp';
    copyLabel.textContent='Скопировать текст заказа';
    divider.textContent='Другие способы';
    setSecondService('Сообщение');
  }
  if(mode==='product'){
    const data=getProductShareData();
    const item=data?getItem(data.id):null;
    pendingOrderText=getProductShareMessage();
    title.textContent=item?`Поделиться «${item.n}»`:'Поделиться';
    sub.textContent='Отправьте блюдо через WhatsApp, сообщения или скопируйте ссылку.';
    waLabel.textContent='Отправить в WhatsApp';
    copyLabel.textContent='Скопировать ссылку';
    divider.textContent='или скопируйте ссылку';
    setSecondService('Отправить сообщением');
  }
}
function placeOrder(){
  if(!Object.keys(cart).filter(k=>cart[k]>0).length){showToast('Корзина пуста');return;}
  const phone=(document.getElementById('phoneInp')?.value||'').trim();
  const address=(document.getElementById('addrInp')?.value||'').trim();
  const paymentMethod=document.getElementById('paymentMethodInp')?.value||'';
  const phoneInp=document.getElementById('phoneInp');
  const addrInp=document.getElementById('addrInp');
  const paymentMethodInp=document.getElementById('paymentMethodInp');
  const phoneErr=document.getElementById('phoneErr');
  const addrErr=document.getElementById('addrErr');
  const paymentMethodErr=document.getElementById('paymentMethodErr');
  const pickupTimeTrigger=document.getElementById('pickupTimeTrigger');
  const pickupTimeErr=document.getElementById('pickupTimeErr');
  const phoneInvalid=!validPhone(phone);
  const addressInvalid=delMode==='d'&&!address;
  const paymentMethodInvalid=!PAYMENT_METHOD_LABELS[paymentMethod];
  const pickupTimeInvalid=delMode==='p'&&!getAvailablePickupSlots(new Date()).includes(pickupTime);
  if(phoneErr)phoneErr.hidden=!phoneInvalid;
  if(addrErr)addrErr.hidden=!addressInvalid;
  if(paymentMethodErr)paymentMethodErr.hidden=!paymentMethodInvalid;
  if(pickupTimeErr)pickupTimeErr.hidden=!pickupTimeInvalid;
  if(phoneInvalid)phoneInp?.setAttribute('aria-invalid','true');
  else phoneInp?.removeAttribute('aria-invalid');
  if(addressInvalid)addrInp?.setAttribute('aria-invalid','true');
  else addrInp?.removeAttribute('aria-invalid');
  if(paymentMethodInvalid)paymentMethodInp?.setAttribute('aria-invalid','true');
  else paymentMethodInp?.removeAttribute('aria-invalid');
  if(pickupTimeInvalid){
    pickupTime='';
    syncPickupTimeControl();
    pickupTimeTrigger?.setAttribute('aria-invalid','true');
    if(pickupTimeErr)pickupTimeErr.hidden=false;
  }else pickupTimeTrigger?.removeAttribute('aria-invalid');
  if(phoneInvalid||addressInvalid||paymentMethodInvalid||pickupTimeInvalid){
    updateOrderState();
    (phoneInvalid?phoneInp:addressInvalid?addrInp:pickupTimeInvalid?pickupTimeTrigger:paymentMethodInp)?.focus();
    return;
  }
  pendingOrderPayload=buildOrderPayload();
  pendingOrderText=buildOrderText(pendingOrderPayload);
  prepareServiceSheet('order');
  const transitionOpener=dialogOpeners.get(document.getElementById('cartOv'));
  closeOv('cartOv',false,true);
  if(history.state?.menuOverlay==='cartOv')replaceMenuBaseState();
  openOv('shareOv',transitionOpener);
}
function openShare(mode='contact'){
  prepareServiceSheet(mode);
  openOv('shareOv');
}

async function shareRestaurant(){
  const payload={
    title:'Sushi Crazy',
    text:'Меню Sushi Crazy — суши, роллы, пицца и фастфуд',
    url:new URL('/',location.origin).toString()
  };
  const canNative=typeof navigator.share==='function'&&(typeof navigator.canShare!=='function'||navigator.canShare(payload));
  if(canNative){
    try{await navigator.share(payload);return;}catch(error){if(error?.name==='AbortError')return;}
  }
  try{
    await navigator.clipboard.writeText(payload.url);
    showToast('Ссылка на меню скопирована');
  }catch(error){
    showToast('Не удалось поделиться ссылкой');
  }
}

let deferredInstallPrompt=null;
function appIsStandalone(){
  return window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true;
}
function syncInstallButton(){
  const btn=document.getElementById('installAppBtn');
  if(btn)btn.hidden=!deferredInstallPrompt||appIsStandalone();
}
window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  deferredInstallPrompt=event;
  syncInstallButton();
});
window.addEventListener('appinstalled',()=>{
  deferredInstallPrompt=null;
  syncInstallButton();
  showToast('Sushi Crazy добавлено на главный экран');
});
async function installPwa(){
  if(!deferredInstallPrompt)return;
  deferredInstallPrompt.prompt();
  try{await deferredInstallPrompt.userChoice;}catch(error){}
  deferredInstallPrompt=null;
  syncInstallButton();
}
syncInstallButton();

function shareVia(v){
  const shareOv=document.getElementById('shareOv');
  const isProduct=shareOv?.classList.contains('product-mode');
  if(isProduct){
    const text=getProductShareMessage();
    if(!text){
      showToast('Не удалось подготовить ссылку на товар');
      return;
    }
    if(v==='wa'){
      const opened=window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank');
      if(!opened){
        showToast('Разрешите открытие WhatsApp или скопируйте ссылку');
        return;
      }
    }else if(v==='sms'){
      window.location.href='sms:?body='+encodeURIComponent(text);
      showToast('Открываем сообщения');
    }
    runAfterMotion(()=>closeOv('shareOv'),400);
    return;
  }
  const text=pendingOrderText||'Sushi Crazy: '+SHOP_PHONE_TEXT;
  if(v==='wa'){
    const opened=window.open('https://wa.me/'+SHOP_PHONE.replace('+','')+'?text='+encodeURIComponent(text),'_blank');
    if(!opened){showToast('Разрешите открытие WhatsApp или скопируйте текст заказа');return;}
  }
  if(v==='sms'){
    window.location.href='sms:'+SHOP_PHONE+'?body='+encodeURIComponent(text);
    showToast('Открываем сообщения');
  }
  if(v==='call'){
    window.location.href='tel:'+SHOP_PHONE;
    showToast('Звоним: '+SHOP_PHONE_TEXT);
  }
  if(v==='map'){
    window.open(SHOP_MAP_URL,'_blank','noopener');
    showToast('Открываем адрес на карте');
  }
  runAfterMotion(()=>closeOv('shareOv'),400);
}
function copyOrder(){
  const shareOv=document.getElementById('shareOv');
  const isOrder=shareOv?.classList.contains('order-mode');
  const isProduct=shareOv?.classList.contains('product-mode');
  const isContact=shareOv?.classList.contains('contact-mode');
  const productData=isProduct?getProductShareData():null;
  const text=isOrder?pendingOrderText:isProduct?(productData?.url||location.href):isContact?SHOP_PHONE_TEXT:location.href;
  if(navigator.clipboard){
    navigator.clipboard.writeText(text).then(()=>{
      showToast(isOrder?'Текст заказа скопирован':isContact?'Номер скопирован':'Ссылка скопирована');
      runAfterMotion(()=>closeOv('shareOv'),400);
    }).catch(()=>showToast('Не удалось скопировать — попробуйте другой способ отправки'));
  }else{
    showToast('Копирование недоступно — выберите другой способ отправки');
  }
}
let lockedScrollY=0;
const dialogOpeners=new WeakMap();
const dialogFocusGenerations=new WeakMap();
const dialogSuppressedStates=new WeakMap();
const openDialogs=[];
const dialogFocusableSelector='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function isFocusable(element){
  if(!element||!element.isConnected||!element.matches?.(dialogFocusableSelector))return false;
  const parentDialog=element.closest?.('.ov');
  if(parentDialog&&!parentDialog.classList.contains('on'))return false;
  if(!element.getClientRects().length)return false;
  const style=window.getComputedStyle(element);
  return style.display!=='none'&&style.visibility!=='hidden'&&style.opacity!=='0';
}
function focusElement(element){
  if(!isFocusable(element))return false;
  element.focus();
  return document.activeElement===element;
}
function getDialogFocusable(ov){
  return [...ov.querySelectorAll(dialogFocusableSelector)].filter(isFocusable);
}
function getTopmostOpenDialog(){
  for(let i=openDialogs.length-1;i>=0;i--){
    if(openDialogs[i].classList.contains('on'))return openDialogs[i];
  }
  return null;
}
function setDialogSuppressed(element,suppressed){
  if(suppressed){
    if(dialogSuppressedStates.has(element))return;
    dialogSuppressedStates.set(element,{
      inert:element.inert,
      ariaHidden:element.getAttribute('aria-hidden'),
    });
    element.inert=true;
    element.setAttribute('aria-hidden','true');
    return;
  }
  const previous=dialogSuppressedStates.get(element);
  if(!previous)return;
  element.inert=previous.inert;
  if(previous.ariaHidden===null)element.removeAttribute('aria-hidden');
  else element.setAttribute('aria-hidden',previous.ariaHidden);
  dialogSuppressedStates.delete(element);
}
function syncDialogAccessibility(){
  const topmost=getTopmostOpenDialog();
  [...document.body.children].forEach(element=>{
    setDialogSuppressed(element,!!topmost&&element!==topmost);
  });
}
function focusDialog(ov){
  const initial=ov.querySelector('[data-dialog-initial-focus]');
  const target=isFocusable(initial)?initial:getDialogFocusable(ov)[0];
  if(target)target.focus();
  else{
    ov.setAttribute('tabindex','-1');
    ov.focus();
  }
}
function restoreFocus(opener){
  const topmost=getTopmostOpenDialog();
  if(topmost){
    if(topmost.contains(opener)&&focusElement(opener))return;
    else focusDialog(topmost);
    return;
  }
  if(focusElement(opener))return;
  [...document.querySelectorAll('#cpill.on,.contact-btn')].some(focusElement);
}
function lockPageScroll(){
  if(document.body.classList.contains('modal-lock')) return;
  lockedScrollY=window.scrollY||document.documentElement.scrollTop||0;
  document.body.style.top=`-${lockedScrollY}px`;
  document.body.classList.add('modal-lock');
}
function unlockPageScroll(){
  if(document.querySelector('.ov.on')) return;
  document.body.classList.remove('modal-lock');
  document.body.style.top='';
  window.scrollTo(0,lockedScrollY||0);
}
function openOv(id,openerOverride){
  const ov=document.getElementById(id);
  if(!ov)return;
  const opener=openerOverride||document.activeElement;
  if(openerOverride?opener?.isConnected:isFocusable(opener))dialogOpeners.set(ov,opener);
  lockPageScroll();
  ov.classList.add('on');
  const existingIndex=openDialogs.indexOf(ov);
  if(existingIndex>=0)openDialogs.splice(existingIndex,1);
  openDialogs.push(ov);
  syncDialogAccessibility();
  const focusGeneration=(dialogFocusGenerations.get(ov)||0)+1;
  dialogFocusGenerations.set(ov,focusGeneration);
  requestAnimationFrame(()=>{
    if(dialogFocusGenerations.get(ov)!==focusGeneration||!ov.classList.contains('on')||getTopmostOpenDialog()!==ov)return;
    focusDialog(ov);
    if(!ov.contains(document.activeElement))requestAnimationFrame(()=>{
      if(dialogFocusGenerations.get(ov)===focusGeneration&&ov.classList.contains('on')&&getTopmostOpenDialog()===ov)focusDialog(ov);
    });
  });
}
function closeOv(id,shouldRestoreFocus=true,fromHistory=false){
  const ov=document.getElementById(id);
  if(!ov)return;
  if(!fromHistory&&(id==='prodOv'||id==='cartOv')&&history.state?.menuOverlay===id){history.back();return;}
  const opener=dialogOpeners.get(ov);
  const refreshFavoritesAfterClose=id==='prodOv'&&favoritesRefreshPending;
  if(id==='pickupTimeOv'){
    document.getElementById('pickupTimeTrigger')?.setAttribute('aria-expanded','false');
    resetPickupDrag();
  }
  if(id==='prodOv'){activeProductId=null;if(!fromHistory)clearProductUrlParam();}
  ov.classList.remove('on');
  const openIndex=openDialogs.indexOf(ov);
  if(openIndex>=0)openDialogs.splice(openIndex,1);
  dialogOpeners.delete(ov);
  syncDialogAccessibility();
  if(shouldRestoreFocus&&getTopmostOpenDialog())restoreFocus(opener);
  runAfterMotion(()=>{
    unlockPageScroll();
    if(shouldRestoreFocus&&!getTopmostOpenDialog())restoreFocus(opener);
    if(refreshFavoritesAfterClose){
      favoritesRefreshPending=false;
      const restoreY=lockedScrollY||0;
      render();
      syncFavoritesUi();
      requestAnimationFrame(()=>window.scrollTo(0,restoreY));
    }
  },20);
}
function bgClose(e,id){if(e.target&&e.target.id===id)closeOv(id);}
function handleDialogKeydown(e){
  const topmost=getTopmostOpenDialog();
  if(!topmost)return;
  if(e.key==='Escape'){
    e.preventDefault();
    closeOv(topmost.id);
    return;
  }
  if(e.key!=='Tab')return;
  const focusable=getDialogFocusable(topmost);
  if(!focusable.length){
    e.preventDefault();
    focusDialog(topmost);
    return;
  }
  const first=focusable[0];
  const last=focusable[focusable.length-1];
  if(e.shiftKey&&(document.activeElement===first||!topmost.contains(document.activeElement))){
    e.preventDefault();
    last.focus();
  }else if(!e.shiftKey&&(document.activeElement===last||!topmost.contains(document.activeElement))){
    e.preventDefault();
    first.focus();
  }
}
document.addEventListener('keydown',handleDialogKeydown);
window.addEventListener('popstate',()=>{
  const state=history.state||{},prod=document.getElementById('prodOv'),cartOv=document.getElementById('cartOv');
  if(prod?.classList.contains('on')&&state.menuOverlay!=='prodOv')closeOv('prodOv',true,true);
  if(cartOv?.classList.contains('on')&&state.menuOverlay!=='cartOv')closeOv('cartOv',true,true);
  if(state.menuOverlay==='prodOv'&&!prod?.classList.contains('on')&&menuReady)openProd(state.productId,null,true);
  if(state.menuOverlay==='cartOv'&&!cartOv?.classList.contains('on'))openCart(true);
});
function showToast(msg){
  const el=document.getElementById('toastEl');
  el.textContent=msg;
  restartMotionClass(el,'on');
  setTimeout(()=>el.classList.remove('on'),2600);
}

/* ── USER REQUEST JS: animated popular dots + smart sticky detection ── */
function renderPopularDots(){
  const dots=document.getElementById('popDots');
  if(!dots)return;
  dots.innerHTML=POPULAR_IDS.map((id,idx)=>`<button class="dot-item ${idx===popIndex?'active':''}" onclick="setPopular(${idx})" aria-label="Популярное ${idx+1}"></button>`).join('');
}
function updatePopularDots(progress=0,dir=0){
  const dots=[...document.querySelectorAll('#popDots .dot-item')];
  if(!dots.length)return;
  const total=dots.length;
  const next=dir<0?(popIndex+1)%total:dir>0?(popIndex-1+total)%total:-1;
  dots.forEach((dot,idx)=>{
    dot.classList.toggle('active',idx===popIndex && progress===0);
    dot.style.removeProperty('width');
    dot.style.removeProperty('height');
    dot.style.removeProperty('opacity');
    dot.style.removeProperty('border-radius');
    dot.style.removeProperty('transform');
  });
  if(progress>0){
    const p=Math.max(0,Math.min(1,progress));
    const current=dots[popIndex];
    if(current){
      current.classList.remove('active');
      current.style.width=(96-(42*p))+'px';
      current.style.height='4px';
      current.style.borderRadius='999px';
      current.style.opacity=String(1-.18*p);
    }
    const target=dots[next];
    if(target){
      target.style.width=(5+(64*p))+'px';
      target.style.height=(5-(1*p))+'px';
      target.style.borderRadius='999px';
      target.style.opacity=String(.92+(.08*p));
    }
  }
}
function updatePopular(pxOffset=0){
  const track=document.getElementById('popularTrack');
  if(!track)return;
  track.style.transition=prefersReducedMotion()?'none':'';
  track.style.transform=pxOffset?`translateX(calc(${-popIndex*100}% + ${pxOffset}px))`:`translateX(${-popIndex*100}%)`;
  const area=document.getElementById('popularCard');
  const w=area?(area.clientWidth||1):1;
  const progress=pxOffset?Math.min(1,Math.abs(pxOffset)/Math.min(120,w*.24)):0;
  const dir=pxOffset<0?-1:pxOffset>0?1:0;
  updatePopularDots(progress,dir);
}
function initSmartStickySearch(){
  const bar=document.querySelector('.sticky-bar');
  if(!bar)return;

  const sentinel=document.createElement('div');
  sentinel.className='sticky-sentinel';
  sentinel.setAttribute('aria-hidden','true');
  bar.parentNode.insertBefore(sentinel,bar);

  function stickyTop(){
    const value=parseFloat(window.getComputedStyle(bar).top);
    return Number.isFinite(value)?value:0;
  }
  function update(top=stickyTop()){
    const shouldStick=sentinel.getBoundingClientRect().top<=top;
    if(shouldStick)bar.classList.add('is-stuck');
    else bar.classList.remove('is-stuck');
  }

  if(typeof IntersectionObserver==='function'){
    let observedTop=null;
    let observer=null;
    function syncObserver(){
      const nextTop=stickyTop();
      update(nextTop);
      if(nextTop===observedTop)return;
      observer?.disconnect();
      observedTop=nextTop;
      observer=new IntersectionObserver(()=>update(observedTop),{
        root:null,
        rootMargin:`-${observedTop}px 0px 0px 0px`,
        threshold:0
      });
      observer.observe(sentinel);
    }
    syncObserver();
    window.addEventListener('scrollend',()=>update(observedTop),{passive:true});
    window.addEventListener('resize',syncObserver);
    window.addEventListener('orientationchange',syncObserver);
    window.visualViewport?.addEventListener('resize',syncObserver);
    return;
  }
  let frame=0;
  function scheduleUpdate(){
    if(frame)return;
    frame=requestAnimationFrame(()=>{
      frame=0;
      update();
    });
  }
  update();
  window.addEventListener('scroll',scheduleUpdate,{passive:true});
  window.addEventListener('resize',scheduleUpdate);
  window.addEventListener('orientationchange',scheduleUpdate);
  window.visualViewport?.addEventListener('resize',scheduleUpdate);
}
initSmartStickySearch();

/* ── COOKIE BAR ── */
function acceptCookies(){
  try{localStorage.setItem('cookieOk','1')}catch(e){}
  document.getElementById('cookieBar')?.classList.remove('on');
  document.body.classList.remove('cookie-visible');
}
(function(){
  let ok=false;
  try{ok=!!localStorage.getItem('cookieOk')}catch(e){}
  if(!ok){document.getElementById('cookieBar')?.classList.add('on');document.body.classList.add('cookie-visible');}
})();

/* ── CATEGORY SCROLL-SPY: активная категория следует за секцией при скролле ── */
(function(){
  let lastSpy='';
  let spyMuteUntil=0;
  window.muteSpy=function(ms){spyMuteUntil=Date.now()+ms;};
  function spy(){
    if(Date.now()<spyMuteUntil)return;
    const secs=CATS.map(c=>({id:c.id,el:document.getElementById('sec-'+c.id)})).filter(s=>s.el);
    if(!secs.length)return;
    const y=window.pageYOffset+130;
    let cur=secs[0].id;
    secs.forEach(s=>{if(s.el.offsetTop<=y)cur=s.id});
    if(cur===lastSpy)return;
    lastSpy=cur;
    const btns=[...document.querySelectorAll('#catsEl .cat')];
    btns.forEach((b,i)=>{
      const on=CATS[i]&&CATS[i].id===cur;
      b.classList.toggle('on',on);
      if(on){
        const c=document.getElementById('catsEl');
        if(c)c.scrollTo({left:Math.max(0,b.offsetLeft-16),behavior:prefersReducedMotion()?'auto':'smooth'});
      }
    });
  }
  let tick=false;
  window.addEventListener('scroll',()=>{
    if(tick)return;tick=true;
    requestAnimationFrame(()=>{tick=false;spy();});
  },{passive:true});
})();



/* ── USER REQUEST JS: static counters + cart shell + slow category scroll + animated view switch ── */
(function(){
  const shell=document.getElementById('cpShell');
  const oldUpdatePill=window.updatePill;
  window.updatePill=function(){
    persistCart();
    const keys=Object.keys(cart).filter(k=>cart[k]>0);
    const total=keys.reduce((s,id)=>{const item=getItem(id);return s+(item&&cart[id]?item.p*cart[id]:0);},0);
    const cnt=keys.reduce((s,k)=>s+cart[k],0);
    const pill=document.getElementById('cpill'),shell=document.getElementById('cpShell'),badge=document.getElementById('cpBadge'),totalEl=document.getElementById('cpTotal');
    if(badge)badge.textContent=String(cnt);if(totalEl)totalEl.textContent=fmt(total);
    document.body.classList.toggle('cart-has-items',cnt>0);
    if(cnt>0){pill?.classList.add('on');shell?.classList.add('on');}
    else{pill?.classList.remove('on');shell?.classList.remove('on');if(badge)badge.textContent='0';if(totalEl)totalEl.textContent='0 ₸';}
  };

  window.addCart=function(id){
    cart[id]=(cart[id]||0)+1;
    updatePill();
    syncCardState(id,false);
    if(document.getElementById('cartOv')?.classList.contains('on'))renderCart();
  };
  window.chQ=function(id,d){
    cart[id]=(cart[id]||0)+d;
    if(cart[id]<=0)delete cart[id];
    updatePill();
    syncCardState(id,false);
    if(document.getElementById('cartOv')?.classList.contains('on'))renderCart();
  };
  window.clearCart=function(){
    cart={};
    updatePill();
    syncCardState(null,false);
    renderCart();
  };

  function easeInOutCubic(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
  function slowScrollTo(targetY,duration=520){
    const startY=window.pageYOffset||document.documentElement.scrollTop||0;
    const maxY=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);
    const endY=Math.max(0,Math.min(maxY,targetY));
    if(prefersReducedMotion()){window.scrollTo(0,endY);return;}
    const delta=endY-startY;
    const start=performance.now();
    function step(now){
      const p=Math.min(1,(now-start)/duration);
      window.scrollTo(0,startY+delta*easeInOutCubic(p));
      if(p<1)requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  window.slowScrollTo=slowScrollTo;

  function stickyOffset(){
    const bar=document.querySelector('.sticky-bar');
    const h=bar?bar.offsetHeight:88;
    return Math.min(128,h+18);
  }
  function activateCatButton(btn){
    document.querySelectorAll('#catsEl .cat').forEach(x=>x.classList.remove('on'));
    btn.classList.add('on');
    const wrap=document.getElementById('catsEl');
    if(wrap)wrap.scrollTo({left:Math.max(0,btn.offsetLeft-16),behavior:prefersReducedMotion()?'auto':'smooth'});
  }
  function goToCat(catId,btn){
    const sec=document.getElementById('sec-'+catId);
    if(!sec)return;
    if(window.muteSpy)window.muteSpy(700);
    if(btn)activateCatButton(btn);
    const y=sec.getBoundingClientRect().top+(window.pageYOffset||0)-stickyOffset();
    sec.classList.remove('cat-target-flash');
    slowScrollTo(y,520);
    if(prefersReducedMotion())return;
    setTimeout(()=>{sec.classList.add('cat-target-flash');setTimeout(()=>sec.classList.remove('cat-target-flash'),1000);},300);
  }

  const catsEl=document.getElementById('catsEl');
  if(catsEl){
    catsEl.addEventListener('click',function(e){
      const btn=e.target.closest('.cat');
      if(!btn||!catsEl.contains(btn))return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const buttons=[...catsEl.querySelectorAll('.cat')];
      const idx=buttons.indexOf(btn);
      const cat=CATS[idx];
      if(cat)goToCat(cat.id,btn);
    },true);
  }

  function animateCardsIn(){
    if(prefersReducedMotion())return;
    const cards=[...document.querySelectorAll('#menuArea .gc,#menuArea .lc')];
    cards.forEach((card,i)=>{
      card.classList.remove('card-enter');
      card.style.animationDelay=Math.min(i*28,220)+'ms';
      void card.offsetWidth;
      card.classList.add('card-enter');
      setTimeout(()=>{card.classList.remove('card-enter');card.style.animationDelay='';},780);
    });
  }
  window.animateCardsIn=animateCardsIn;

  let switchingView=false;
  window.toggleView=function(){
    if(switchingView)return;
    const area=document.getElementById('menuArea');
    if(prefersReducedMotion()){
      isGrid=!isGrid;
      setViewIcon();
      render();
      return;
    }
    switchingView=true;
    if(area)area.classList.add('view-switch-out');
    setTimeout(()=>{
      isGrid=!isGrid;
      setViewIcon();
      render();
      if(area)area.classList.remove('view-switch-out');
      requestAnimationFrame(()=>{
        animateCardsIn();
        switchingView=false;
      });
    },165);
  };

  let searchTimer=0;
  function syncSearchUi(){const wrap=document.getElementById('searchWrap');if(wrap)wrap.classList.toggle('has-query',!!search.trim());}
  window.doSearch=function(v){
    search=String(v||'');syncSearchUi();clearTimeout(searchTimer);
    searchTimer=setTimeout(()=>{render();requestAnimationFrame(animateCardsIn);},120);
  };
  window.clearSearch=function(){
    clearTimeout(searchTimer);search='';
    const input=document.getElementById('searchInp');if(input)input.value='';
    syncSearchUi();render();requestAnimationFrame(animateCardsIn);input?.focus();
  };

  // На всякий случай синхронизируем глобальные имена, которые уже используются inline onclick/oninput.
  try{
    updatePill=window.updatePill;
    addCart=window.addCart;
    chQ=window.chQ;
    clearCart=window.clearCart;
    toggleView=window.toggleView;
    doSearch=window.doSearch;
    clearSearch=window.clearSearch;
  }catch(e){}

  updatePill();
})();



/* ── FINAL FIX JS: hide bottom cart while cart sheet is open ── */
(function(){
  const shell=document.getElementById('cpShell');
  const cartOv=document.getElementById('cartOv');
  function syncShell(){
    if(!shell||!cartOv)return;
    const cartOpen=cartOv.classList.contains('on');
    shell.style.display=cartOpen?'none':'';
  }
  const oldOpenCart=window.openCart;
  window.openCart=function(...args){
    if(typeof oldOpenCart==='function') oldOpenCart(...args);
    setTimeout(syncShell,0);
  };
  const oldCloseOv=window.closeOv;
  window.closeOv=function(...args){
    if(typeof oldCloseOv==='function') oldCloseOv(...args);
    setTimeout(syncShell,30);
  };
  const oldUpdatePill=window.updatePill;
  window.updatePill=function(){
    if(typeof oldUpdatePill==='function') oldUpdatePill();
    syncShell();
  };
  try{
    openCart=window.openCart;
    closeOv=window.closeOv;
    updatePill=window.updatePill;
  }catch(e){}
  syncShell();
})();

window.addEventListener('pageshow',event=>{
  if(!event.persisted||!menuReady)return;
  restoreCart();
  updatePill();
  syncCardState(null,false);
  if(document.getElementById('cartOv')?.classList.contains('on'))renderCart();
});

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
}
