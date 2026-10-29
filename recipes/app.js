(() => {
'use strict';
const KEY='mondosupreme.recipes.v1', FKEY='mondosupreme.favs.v1';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const SAMPLES=[
{id:'sample-1',sample:true,title:'Sample: Supreme Tomato Basil Pasta',photo:'https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=900',category:'Dinner',prep:10,cook:20,servings:4,
 ingredients:['400 g spaghetti','4 tbsp olive oil','4 garlic cloves, sliced','800 g canned San Marzano tomatoes','1 handful fresh basil','Salt & pepper','Parmesan, to serve'],
 steps:['Boil spaghetti in well-salted water until al dente.','Warm olive oil and gently cook garlic until fragrant.','Add crushed tomatoes and simmer 15 minutes.','Toss pasta with sauce and torn basil; season.','Serve with grated Parmesan.'],
 notes:'Sample recipe — feel free to delete it.',tags:['pasta','vegetarian','quick']},
{id:'sample-2',sample:true,title:'Sample: Fluffy Buttermilk Pancakes',photo:'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=900',category:'Breakfast',prep:10,cook:15,servings:4,
 ingredients:['2 cups flour','2 tbsp sugar','2 tsp baking powder','1/2 tsp baking soda','1/2 tsp salt','2 cups buttermilk','2 eggs','3 tbsp melted butter'],
 steps:['Whisk the dry ingredients together.','Whisk buttermilk, eggs and butter in a separate bowl.','Fold wet into dry until just combined (lumps are fine).','Cook 1/4 cup portions on a buttered griddle until bubbles form, then flip.','Serve warm with maple syrup.'],
 notes:'Sample recipe — feel free to delete it.',tags:['sweet','brunch','kid-friendly']},
{id:'sample-3',sample:true,title:'Sample: Chickpea Coconut Curry',photo:'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=900',category:'Dinner',prep:15,cook:25,servings:4,
 ingredients:['1 tbsp oil','1 onion, diced','3 garlic cloves','1 tbsp grated ginger','2 tbsp curry powder','2 cans chickpeas, drained','1 can coconut milk','1 can diced tomatoes','2 handfuls spinach','Rice, to serve'],
 steps:['Sauté onion in oil until soft.','Add garlic, ginger and curry powder; cook 1 minute.','Add chickpeas, coconut milk and tomatoes; simmer 20 minutes.','Stir in spinach until wilted and season.','Serve over rice.'],
 notes:'Sample recipe — feel free to delete it.',tags:['vegan','spicy','one-pot']}
];
const PUSHED='mondosupreme.recipes.pushed.v1';
const RULES_BANNER='Server sync waiting on updated Firebase rules — using local storage until published';
const PHOTO_MAX=200000;
let recipes, favs, state={q:'',cat:'',tag:'',fav:false};
let serverLive=false, rulesBlocked=false, isOwner=false, myUid='';
let quota={n:0,day:0}, quotaLoaded=false, quotaStop=false;
let heldCustoms=[], chain=Promise.resolve(), itemsRef=null, syncStarted=false, migrating=false, lastCreate=0;
const pendingCreates=new Set(), unsynced=new Set();
function load(){
  try{recipes=JSON.parse(localStorage.getItem(KEY));}catch{recipes=null}
  if(!Array.isArray(recipes)){recipes=SAMPLES.map(r=>({...r}));save();}
  try{favs=new Set(JSON.parse(localStorage.getItem(FKEY))||[]);}catch{favs=new Set()}
}
function saveCache(){try{localStorage.setItem(KEY,JSON.stringify(recipes));}catch(e){toast('Could not save: storage full?')}}
function saveFavs(){try{localStorage.setItem(FKEY,JSON.stringify([...favs]));}catch(e){toast('Could not save: storage full?')}}
function save(){saveCache();saveFavs()}
function isSample(r){
  return !!(r&&(r.sample||r.id==='sample-1'||r.id==='sample-2'||r.id==='sample-3'||/^Sample:/.test(r.title||'')));
}
function isAdminNow(){return !!(window.MONDO_MEMBER&&window.MONDO_MEMBER.isOwner&&window.MONDO_MEMBER.isOwner())}
function canMutate(){return !serverLive||!!isOwner}
function showRulesBanner(){
  rulesBlocked=true; serverLive=false;
  const el=$('#syncBanner');
  if(el){el.hidden=false;el.textContent=RULES_BANNER;}
  refreshViews();
}
function hideRulesBanner(){
  rulesBlocked=false;
  const el=$('#syncBanner');
  if(el)el.hidden=true;
}
function isDenied(err){
  const code=String((err&&err.code)||'')+' '+String((err&&err.message)||'');
  return /PERMISSION_DENIED|permission[-_ ]denied/i.test(code);
}
function enqueue(fn){
  const run=chain.then(fn,fn);
  chain=run.then(()=>{},()=>{});
  return run;
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function todayStamp(){return Math.floor(Date.now()/86400000)*86400000}
function loadPushed(){try{return new Set(JSON.parse(localStorage.getItem(PUSHED))||[])}catch{return new Set()}}
function rememberPushed(id){
  const s=loadPushed(); s.add(id);
  try{localStorage.setItem(PUSHED,JSON.stringify([...s]))}catch{}
}
function cloneRecipe(r){return {...r,ingredients:[...(r.ingredients||[])],steps:[...(r.steps||[])],tags:[...(r.tags||[])]}}
function toServer(recipe, author, stampCreated){
  let photo='';
  if(recipe.photo&&recipe.photo.startsWith('https://')&&recipe.photo.length<=2000)photo=recipe.photo;
  else if(recipe.photo&&recipe.photo.startsWith('data:image/jpeg;base64,')&&recipe.photo.length<=210000)photo=recipe.photo;
  const body={
    title:clipStr(recipe.title,LIMITS.title).replace(/[\r\n]+/g,' '),
    category:clipStr(recipe.category,LIMITS.category).replace(/[\r\n]+/g,' '),
    ingredients:(recipe.ingredients||[]).join('\n').slice(0,80000),
    steps:(recipe.steps||[]).join('\n').slice(0,80000),
    notes:clipStr(recipe.notes,LIMITS.notes),
    tags:(recipe.tags||[]).map(t=>String(t).trim().toLowerCase()).filter(Boolean).join(',').slice(0,1200),
    photo,
    createdAt:stampCreated?firebase.database.ServerValue.TIMESTAMP:recipe.createdAt,
    updatedAt:firebase.database.ServerValue.TIMESTAMP,
    author
  };
  const prep=clipNum(recipe.prep,0,10000); if(prep!=null)body.prep=prep;
  const cook=clipNum(recipe.cook,0,10000); if(cook!=null)body.cook=cook;
  const servings=clipNum(recipe.servings,1,999); if(servings!=null)body.servings=servings;
  return body;
}
function fromServer(id,v){
  if(!v||typeof v!=='object')return null;
  const title=clipStr(v.title,LIMITS.title);
  if(!title||!/^[A-Za-z0-9_-]{1,64}$/.test(id))return null;
  const recipe={
    id,title,
    category:clipStr(v.category,LIMITS.category),
    notes:clipStr(v.notes,LIMITS.notes),
    ingredients:clipLines(v.ingredients,LIMITS.lines,LIMITS.line),
    steps:clipLines(v.steps,LIMITS.lines,LIMITS.line),
    tags:[...new Set(clipLines(typeof v.tags==='string'?v.tags.split(','):[],LIMITS.tags,LIMITS.tag).map(t=>t.toLowerCase()))],
    photo:safePhoto(v.photo||''),
    author:typeof v.author==='string'?v.author:'',
    createdAt:Number(v.createdAt)||0
  };
  const prep=clipNum(v.prep,0,10000); if(prep!=null)recipe.prep=prep;
  const cook=clipNum(v.cook,0,10000); if(cook!=null)recipe.cook=cook;
  const servings=clipNum(v.servings,1,999); if(servings!=null)recipe.servings=servings;
  return recipe;
}
function byNewest(a,b){return (b.createdAt||0)-(a.createdAt||0)}
function refreshViews(){
  if(typeof document==='undefined'||!$('#listView'))return;
  const editor=$('#editor');
  if(editor&&editor.open)return;
  const m=location.hash.match(/^#\/recipe\/(.+)$/);
  if(m)renderDetail(decodeURIComponent(m[1])); else renderList();
}
function updateOwnerButton(){
  const b=$('#ownerBtn');
  if(!b)return;
  if(!window.MONDO_MEMBER)b.textContent=isOwner?'Sign out':'Owner sign in';
}
async function ensureQuota(){
  if(quotaLoaded||!myUid||typeof firebase==='undefined')return;
  const snap=await firebase.database().ref('recipes/c/'+myUid).once('value');
  const v=snap.val()||{};
  quota={n:Number(v.n)||0,day:Number(v.day)||0};
  quotaLoaded=true;
}
async function preparePhoto(recipe){
  if(!recipe.photo||!recipe.photo.startsWith('data:'))return recipe.photo||'';
  if(recipe.photo.startsWith('data:image/jpeg;base64,')&&recipe.photo.length<=PHOTO_MAX)return recipe.photo;
  const smaller=await shrinkToJpeg(recipe.photo);
  recipe.photo=smaller||'';
  return recipe.photo;
}
async function createNow(id){
  if(rulesBlocked||!serverLive||!myUid||!pendingCreates.has(id))return;
  let recipe=recipes.find(r=>r.id===id);
  if(!recipe||isSample(recipe)){pendingCreates.delete(id);return}
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(id)){pendingCreates.delete(id);unsynced.add(id);toast('That recipe could not be shared');return}
  await preparePhoto(recipe);
  if(!pendingCreates.has(id))return;
  recipe=recipes.find(r=>r.id===id);
  if(!recipe){pendingCreates.delete(id);return}
  const owner=isOwner;
  const body=toServer(recipe,myUid,true);
  const updates={};
  updates['recipes/items/'+id]=body;
  if(!owner){
    await ensureQuota();
    const day=todayStamp();
    const seq=quota.day===day?(quota.n||0)+1:1;
    if(seq>40){
      quotaStop=true; unsynced.add(id); pendingCreates.delete(id);
      toast('That is enough new recipes for today. Try again tomorrow.');
      const err=new Error('quota'); err.code='quota'; throw err;
    }
    const wait=2100-(Date.now()-lastCreate);
    if(lastCreate&&wait>0)await sleep(wait);
    if(!pendingCreates.has(id))return;
    const latest=recipes.find(r=>r.id===id);
    if(!latest){pendingCreates.delete(id);return}
    const fresh=toServer(latest,myUid,true);
    fresh.seq=seq; fresh.day=day;
    updates['recipes/items/'+id]=fresh;
    updates['recipes/rate/'+myUid]=firebase.database.ServerValue.TIMESTAMP;
    updates['recipes/c/'+myUid]={n:seq,day};
    await firebase.database().ref().update(updates);
    lastCreate=Date.now();
    quota={n:seq,day};
  }else{
    await firebase.database().ref().update(updates);
  }
  rememberPushed(id);
}
async function updateNow(id){
  if(rulesBlocked||!serverLive||!isOwner)return;
  if(pendingCreates.has(id))return;
  const recipe=recipes.find(r=>r.id===id);
  if(!recipe||!recipe.author||!recipe.createdAt)return;
  await preparePhoto(recipe);
  const latest=recipes.find(r=>r.id===id)||recipe;
  await firebase.database().ref('recipes/items/'+id).set(toServer(latest,latest.author,false));
}
async function removeNow(id){
  if(rulesBlocked||!serverLive||!isOwner)return;
  await firebase.database().ref('recipes/items/'+id).remove();
}
function shareCreate(id){
  pendingCreates.add(id); unsynced.delete(id);
  return enqueue(()=>createNow(id)).catch(err=>{
    pendingCreates.delete(id);
    if(err&&err.code==='quota'){unsynced.add(id);return}
    unsynced.add(id);
    if(isDenied(err))showRulesBanner();
    else if(serverLive)toast('Could not share that recipe. It is still saved in this browser.');
  });
}
function shareUpdate(id){
  return enqueue(()=>updateNow(id)).catch(err=>{
    if(isDenied(err)){
      if(!isOwner)toast('Only the owner can edit recipes');
      else showRulesBanner();
    }else toast('Could not update that recipe on the server.');
  });
}
function shareRemove(id){
  return enqueue(()=>removeNow(id)).catch(err=>{
    if(isDenied(err))showRulesBanner();
    else toast('Could not delete that recipe on the server.');
  });
}
function applySnapshot(val){
  const remote=[];
  if(val&&typeof val==='object'){
    for(const id of Object.keys(val)){
      const recipe=fromServer(id,val[id]);
      if(recipe)remote.push(recipe);
    }
  }
  const remoteIds=new Set(remote.map(r=>r.id));
  for(const id of [...pendingCreates]) if(remoteIds.has(id))pendingCreates.delete(id);
  for(const id of [...unsynced]) if(remoteIds.has(id))unsynced.delete(id);
  if(remote.length){
    const seen=new Set(remoteIds);
    const top=[];
    const waiting=[
      ...recipes.filter(r=>(pendingCreates.has(r.id)||unsynced.has(r.id))&&!isSample(r)),
      ...heldCustoms.filter(r=>!isSample(r)&&!(r.author&&r.createdAt))
    ];
    for(const r of waiting){
      if(!r||seen.has(r.id)||remoteIds.has(r.id))continue;
      seen.add(r.id); top.push(r);
    }
    recipes=[...top, ...remote.sort(byNewest)];
    saveCache();
  }
  refreshViews();
  migrateHeld(remoteIds);
}
function migrateHeld(remoteIds){
  if(migrating||rulesBlocked||!serverLive||quotaStop)return;
  const pushed=loadPushed();
  const pool=[...heldCustoms, ...recipes.filter(r=>r&&!(r.author&&r.createdAt))];
  const seen=new Set();
  const todo=[];
  for(const r of pool){
    if(!r||!r.id||seen.has(r.id)||remoteIds.has(r.id)||pushed.has(r.id)||isSample(r)||(r.author&&r.createdAt))continue;
    if(!/^[A-Za-z0-9_-]{1,64}$/.test(r.id))continue;
    seen.add(r.id);
    todo.push(r);
  }
  if(!todo.length)return;
  migrating=true;
  (async()=>{
    for(const r of todo){
      if(rulesBlocked||quotaStop)break;
      if(!recipes.some(x=>x.id===r.id))recipes.unshift(cloneRecipe(r));
      try{await shareCreate(r.id)}
      catch{break}
    }
    saveCache();
    migrating=false;
    refreshViews();
  })();
}
function listenItems(){
  if(typeof firebase==='undefined')return;
  if(itemsRef)itemsRef.off();
  itemsRef=firebase.database().ref('recipes/items');
  itemsRef.on('value',snap=>{
    hideRulesBanner();
    serverLive=true;
    applySnapshot(snap.val());
    updateOwnerButton();
  },err=>{
    serverLive=false;
    if(isDenied(err))showRulesBanner();
    else refreshViews();
  });
}
function configured(){
  const c=typeof window!=='undefined'&&window.MONDO_BOARD_CONFIG;
  return !!(c&&c.apiKey&&c.authDomain&&c.databaseURL&&c.projectId&&c.appId);
}
function connectRecipes(){
  if(syncStarted||typeof firebase==='undefined'||!configured())return;
  syncStarted=true;
  try{if(!firebase.apps.length)firebase.initializeApp(window.MONDO_BOARD_CONFIG)}
  catch{return}
  firebase.auth().onAuthStateChanged(async user=>{
    if(!user){
      isOwner=false; myUid='';
      updateOwnerButton();
      try{await firebase.auth().signInAnonymously()}catch{serverLive=false}
      return;
    }
    myUid=user.uid;
    isOwner=isAdminNow();
    if(!connectRecipes.ownerListen){connectRecipes.ownerListen=true;document.addEventListener('mondo-owner',function(){var on=isAdminNow();if(on===isOwner)return;isOwner=on;updateOwnerButton();refreshViews();});}
    quotaLoaded=false;
    updateOwnerButton();
    listenItems();
    refreshViews();
  });
}
async function signInOwner(email,password){
  await firebase.auth().signInWithEmailAndPassword(email,password);
}
async function signOutOwner(){
  isOwner=false;
  try{await firebase.auth().signOut()}catch{}
}
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),2200)}
function safePhoto(url){
  if(typeof url!=='string')return '';
  const u=url.trim();
  if(!u||u.length>500000||/[\u0000-\u001f\u007f]/.test(u))return '';
  if(u.startsWith('https://')){
    try{const parsed=new URL(u);if(parsed.protocol!=='https:'||!parsed.hostname)return '';return u}catch{return ''}
  }
  if(/^data:image\/(?!svg\b)[a-zA-Z0-9.+-]+[;,]/.test(u)&&!/[\s"'()\\<>]/.test(u))return u;
  return '';
}
function paintPhoto(el,url){
  if(!el)return;
  const safe=safePhoto(url);
  el.style.backgroundImage=safe?'url('+JSON.stringify(safe)+')':'';
  if(safe)el.textContent='';
}
const total=r=>(+r.prep||0)+(+r.cook||0);

function fillFilters(){
  const cats=[...new Set(recipes.map(r=>r.category).filter(Boolean))].sort();
  const tags=[...new Set(recipes.flatMap(r=>r.tags||[]))].sort();
  const fill=(sel,arr,label,cur)=>{sel.innerHTML=`<option value="">${label}</option>`+arr.map(v=>`<option${v===cur?' selected':''}>${esc(v)}</option>`).join('');};
  if(!cats.includes(state.cat))state.cat=''; if(!tags.includes(state.tag))state.tag='';
  fill($('#catFilter'),cats,'All categories',state.cat); fill($('#tagFilter'),tags,'All tags',state.tag);
  $('#catList').innerHTML=cats.map(c=>`<option value="${esc(c)}">`).join('');
}
function clipArt(category){
  const c=String(category||'').toLowerCase();
  if(/break|pancake|egg|waffle/.test(c))return '<svg class="clip" viewBox="0 0 64 48" aria-hidden="true"><ellipse cx="32" cy="34" rx="22" ry="8" fill="#e7b15a" stroke="#000"/><ellipse cx="32" cy="26" rx="18" ry="7" fill="#f6d27a" stroke="#000"/><ellipse cx="32" cy="19" rx="14" ry="6" fill="#ffe7a8" stroke="#000"/><rect x="29" y="6" width="6" height="10" fill="#c4553d" stroke="#000"/></svg>';
  if(/dessert|cake|sweet|cookie/.test(c))return '<svg class="clip" viewBox="0 0 64 48" aria-hidden="true"><path d="M10 28h44v12H10z" fill="#f4c7d8" stroke="#000"/><path d="M8 22h48l-6 8H14z" fill="#fff" stroke="#000"/><circle cx="20" cy="18" r="3" fill="#e23"/><circle cx="32" cy="14" r="3" fill="#39c"/><circle cx="44" cy="18" r="3" fill="#fc0"/></svg>';
  if(/drink|bev|smoothie/.test(c))return '<svg class="clip" viewBox="0 0 64 48" aria-hidden="true"><path d="M18 8h28l-4 26H22z" fill="#7fdfff" stroke="#000"/><rect x="29" y="34" width="6" height="8" fill="#ccc" stroke="#000"/><path d="M22 42h20" stroke="#000" stroke-width="2"/><rect x="30" y="2" width="3" height="8" fill="#c4553d"/></svg>';
  return '<svg class="clip" viewBox="0 0 64 48" aria-hidden="true"><path d="M16 18h28l4 16H14z" fill="#c0c0c0" stroke="#000"/><path d="M20 18c0-8 24-8 24 0" fill="none" stroke="#000" stroke-width="2"/><circle cx="24" cy="28" r="3" fill="#c4553d"/><circle cx="34" cy="26" r="3" fill="#2f6f4e"/><circle cx="40" cy="31" r="3" fill="#f28f3b"/></svg>';
}
function renderList(){
  fillFilters();
  const cats=[...new Set(recipes.map(r=>r.category).filter(Boolean))].sort();
  const tabs=$('#fileTabs');
  if(tabs){
    tabs.innerHTML='<button type="button" class="file-tab" data-cat="" aria-pressed="'+(!state.cat)+'">All</button>'+
      cats.map(c=>'<button type="button" class="file-tab" data-cat="'+esc(c)+'" aria-pressed="'+(state.cat===c)+'">'+esc(c)+'</button>').join('');
  }
  const q=state.q.toLowerCase();
  const list=recipes.filter(r=>(!state.cat||r.category===state.cat)&&(!state.tag||(r.tags||[]).includes(state.tag))&&(!state.fav||favs.has(r.id))&&
    (!q||[r.title,r.category,r.notes,...(r.tags||[]),...(r.ingredients||[])].join(' ').toLowerCase().includes(q)));
  $('#grid').innerHTML=list.map(r=>`<article class="card" data-id="${esc(r.id)}" tabindex="0">
    ${r.sample?'<span class="sample">SAMPLE</span>':''}
    <button class="fav" data-fav="${esc(r.id)}" aria-label="Toggle favorite">${favs.has(r.id)?'♥':'♡'}</button>
    <div class="thumb">${clipArt(r.category)}</div>
    <div class="card-body"><div class="cat"><span class="clip-slot">${clipArt(r.category)}</span><span>${esc(r.category||'Uncategorized')}</span></div><h3>${esc(r.title)}</h3>
    <div class="meta">${total(r)?`<span>⏱ ${total(r)} min</span>`:''}${r.servings?`<span>🍽 ${esc(r.servings)} servings</span>`:''}</div>
    <div class="tags">${(r.tags||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join('')}</div>
    <a class="btn grocery-add" href="/grocery/?add=${esc(r.id)}">Add to Grocery List</a></div></article>`).join('');
  $('#grid').querySelectorAll('.thumb').forEach((el,i)=>paintPhoto(el,list[i].photo));
  $('#empty').hidden=list.length>0;
}
const GKEY='mondosupreme.grocery.v1';
const FRACS={'½':1/2,'⅓':1/3,'¼':1/4,'¾':3/4,'⅔':2/3,'⅛':1/8,'⅜':3/8,'⅝':5/8,'⅞':7/8};
const QTY_RE=/^(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|[½⅓¼¾⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?)(?:\s*([-–])\s*(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|[½⅓¼¾⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?))?/;
const UNIT_PLURAL={cup:'cups',tbsp:'tbsp',tsp:'tsp',g:'g',kg:'kg',oz:'oz',lb:'lbs',ml:'ml',l:'l',pinch:'pinches',clove:'cloves',can:'cans',handful:'handfuls',teaspoon:'teaspoons',tablespoon:'tablespoons'};
const UNIT_ONE={};
Object.keys(UNIT_PLURAL).forEach(one=>{UNIT_ONE[one]=one;UNIT_ONE[UNIT_PLURAL[one]]=one;});
let detailScale=1, detailFor='';
function parseQtyToken(token){
  const text=String(token||'').trim();
  if(FRACS[text]!=null)return FRACS[text];
  let m=text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if(m){const d=+m[3];return d?+m[1]+(+m[2]/d):null}
  m=text.match(/^(\d+)\s*\/\s*(\d+)$/);
  if(m){const d=+m[2];return d?+m[1]/d:null}
  const n=Number(text);
  return Number.isFinite(n)?n:null;
}
function formatQty(n){
  if(!Number.isFinite(n)||n<=0)return '0';
  const rounded=Math.round(n*1000)/1000;
  const nearest=Math.round(rounded);
  if(Math.abs(rounded-nearest)<0.001)return String(nearest);
  const whole=Math.floor(rounded+1e-9);
  const frac=rounded-whole;
  const table=[[1,8,'1/8'],[1,4,'1/4'],[1,3,'1/3'],[3,8,'3/8'],[1,2,'1/2'],[5,8,'5/8'],[2,3,'2/3'],[3,4,'3/4'],[7,8,'7/8']];
  let best='',err=0.021;
  table.forEach(row=>{const gap=Math.abs(frac-row[0]/row[1]);if(gap<err){err=gap;best=row[2];}});
  if(frac>0.98)return String(whole+1);
  if(!best)return String(Math.round(rounded*100)/100);
  return whole?whole+' '+best:best;
}
function scaleLine(line,factor){
  const text=String(line??'');
  if(factor===1)return text;
  const m=text.match(QTY_RE);
  if(!m)return text;
  const a=parseQtyToken(m[1]);
  if(a==null)return text;
  const b=m[3]?parseQtyToken(m[3]):null;
  if(m[3]&&b==null)return text;
  const shown=b==null?formatQty(a*factor):formatQty(a*factor)+'-'+formatQty(b*factor);
  return shown+text.slice(m[0].length);
}
function groceryParts(line){
  const text=String(line||'').replace(/\s+/g,' ').trim();
  const m=text.match(QTY_RE);
  if(!m||m[3])return {key:text.toLowerCase(),qty:null,text};
  const qty=parseQtyToken(m[1]);
  if(qty==null)return {key:text.toLowerCase(),qty:null,text};
  let rest=text.slice(m[0].length).replace(/^\s+/, '');
  const unitMatch=rest.match(/^([A-Za-z]+)\b\s*(.*)$/);
  let unit='',tail=rest;
  if(unitMatch&&UNIT_ONE[unitMatch[1].toLowerCase()]){
    unit=UNIT_ONE[unitMatch[1].toLowerCase()];
    tail=unitMatch[2]||'';
  }
  return {key:(unit+'|'+tail).toLowerCase().replace(/\s+/g,' ').trim(),qty,unit,tail,text};
}
function groceryText(parts,qty){
  if(parts.qty==null)return parts.text;
  const word=parts.unit?(Math.abs(qty-1)<0.001?parts.unit:(UNIT_PLURAL[parts.unit]||parts.unit)):'';
  return [formatQty(qty),word,parts.tail].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
}
function loadGrocery(){
  try{const data=JSON.parse(localStorage.getItem(GKEY));if(data&&Array.isArray(data.items))return data;}catch(e){}
  return {items:[]};
}
function saveGrocery(data){try{localStorage.setItem(GKEY,JSON.stringify(data));}catch(e){toast('Could not save Grocery List')}}
function groceryCount(){return loadGrocery().items.length}
function paintGroceryButton(){
  const btn=$('#btnGrocery');
  if(btn)btn.textContent='Grocery List ('+groceryCount()+')';
}
function addGroceryLines(lines,recipe){
  const data=loadGrocery();
  lines.forEach(line=>{
    const text=String(line||'').trim();
    if(!text)return;
    const parts=groceryParts(text);
    const open=data.items.find(item=>!item.checked&&groceryParts(item.text).key===parts.key);
    if(open&&parts.qty!=null&&groceryParts(open.text).qty!=null){
      const prior=groceryParts(open.text);
      open.text=groceryText(prior,prior.qty+parts.qty);
    }else if(open&&parts.qty==null){
      open.text=text;
    }else{
      data.items.push({id:uid(),text,checked:false,recipeId:recipe&&recipe.id||'',recipeTitle:recipe&&recipe.title||'',custom:!recipe});
    }
  });
  saveGrocery(data);
  paintGroceryButton();
}
function renderGrocery(){
  const data=loadGrocery();
  const box=$('#groceryItems');
  const empty=$('#groceryEmpty');
  if(!box)return;
  box.replaceChildren();
  data.items.forEach(item=>{
    const row=document.createElement('label');
    row.className='grocery-row'+(item.checked?' is-checked':'');
    const input=document.createElement('input');
    input.type='checkbox';
    input.checked=!!item.checked;
    input.addEventListener('change',()=>{
      const fresh=loadGrocery();
      const found=fresh.items.find(row=>row.id===item.id);
      if(found)found.checked=input.checked;
      saveGrocery(fresh);
      renderGrocery();
    });
    const span=document.createElement('span');
    span.textContent=item.text;
    row.append(input,span);
    box.append(row);
  });
  if(empty)empty.hidden=data.items.length>0;
  paintGroceryButton();
}
function openGrocery(){
  const dlg=$('#groceryDialog');
  if(dlg&&typeof dlg.showModal==='function'&&!dlg.open)dlg.showModal();
  renderGrocery();
}
function renderDetail(id){
  const r=recipes.find(x=>x.id===id); if(!r){location.hash='#/';return}
  if(detailFor!==id){detailScale=1;detailFor=id;}
  const v=$('#detailView');
  const own=canMutate();
  const lines=(r.ingredients||[]).map(i=>scaleLine(i,detailScale));
  const factors=[[0.5,'½x'],[1,'1x'],[2,'2x'],[3,'3x']];
  v.innerHTML=`<article class="detail"><div class="detail-hero">🍽️</div><div class="detail-inner">
   <div class="dbar"><a href="#/" class="btn ghost">← Back</a><button class="btn ghost" id="dFav">${favs.has(r.id)?'♥ Favorited':'♡ Favorite'}</button>
   <button class="btn ghost" id="dPrint">🖨 Print</button>${own?'<button class="btn ghost" id="dEdit">✎ Edit</button><button class="btn danger" id="dDel">🗑 Delete</button>':''}</div>
   ${serverLive&&!isOwner?'<p class="lock-note">Anyone can add recipes. Only the owner can edit or delete them.</p>':''}
   <div class="cat">${esc(r.category||'Uncategorized')}${r.sample?' · Sample recipe':''}</div><h1>${esc(r.title)}</h1>
   <div class="stats"><div class="stat"><b>${+r.prep||0} min</b><span>Prep</span></div><div class="stat"><b>${+r.cook||0} min</b><span>Cook</span></div>
   <div class="stat"><b>${total(r)} min</b><span>Total</span></div><div class="stat"><b>${esc(r.servings||'–')}</b><span>Servings</span></div></div>
   <div class="tags">${(r.tags||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join('')}</div>
   <div class="cols"><section><h2>Ingredients</h2>
   <div class="scale-bar" role="group" aria-label="Serving scale">${factors.map(([n,label])=>`<button type="button" class="btn ghost scale-btn" data-scale="${n}" aria-pressed="${detailScale===n?'true':'false'}">${label}</button>`).join('')}
   <button type="button" class="btn primary" id="addGrocery">Add to Grocery List</button></div>
   <ul>${lines.map(i=>`<li><label><input type="checkbox"><span>${esc(i)}</span></label></li>`).join('')}</ul></section>
   <section><h2>Steps</h2><ol>${(r.steps||[]).map(s=>`<li>${esc(s)}</li>`).join('')}</ol></section></div>
   ${r.notes?`<div class="notes"><strong>Notes:</strong> ${esc(r.notes)}</div>`:''}</div></article>`;
  paintPhoto(v.querySelector('.detail-hero'),r.photo);
  v.querySelectorAll('.scale-btn').forEach(btn=>{
    btn.onclick=()=>{detailScale=Number(btn.dataset.scale)||1;renderDetail(r.id);};
  });
  $('#addGrocery').onclick=()=>{addGroceryLines(lines,r);toast('Added to Grocery List');openGrocery();};
  $('#dFav').onclick=()=>{toggleFav(r.id);renderDetail(r.id)};
  $('#dPrint').onclick=()=>window.print();
  if($('#dEdit'))$('#dEdit').onclick=()=>openEditor(r);
  if($('#dDel'))$('#dDel').onclick=()=>{
    if(!canMutate()){toast('Only the owner can delete recipes');return}
    if(!confirm(`Delete "${r.title}"?`))return;
    const onServer=!!(r.createdAt&&r.author&&!pendingCreates.has(r.id));
    recipes=recipes.filter(x=>x.id!==r.id);
    favs.delete(r.id); pendingCreates.delete(r.id); unsynced.delete(r.id);
    save();
    if(onServer)shareRemove(r.id);
    toast('Recipe deleted');
    location.hash='#/';
  };
}
function toggleFav(id){favs.has(id)?favs.delete(id):favs.add(id);saveFavs()}
function route(){
  const m=location.hash.match(/^#\/recipe\/(.+)$/);
  $('#listView').hidden=!!m; $('#detailView').hidden=!m;
  if(m)renderDetail(decodeURIComponent(m[1])); else renderList();
  window.scrollTo(0,0);
}
function setPhotoField(url){
  const f=$('#recipeForm');
  const preview=$('#photoPreview');
  const img=$('#photoPreviewImg');
  const safe=safePhoto(url);
  if(safe.startsWith('data:')){
    f.photo.value='';
    f.photoData.value=safe;
    img.src=safe;
    preview.hidden=false;
  }else{
    f.photoData.value='';
    f.photo.value=safe.startsWith('https://')?safe:'';
    img.removeAttribute('src');
    preview.hidden=true;
  }
}
function showScanReview(text, meta){
  const box=$('#scanReview');
  const confEl=$('#scanConfidence');
  const hint=$('#scanHint');
  const retry=$('#scanRetry');
  const compare=$('#scanCompare');
  const photo=$('#scanCompareImg');
  if(!text){
    $('#ocrRaw').textContent='';
    box.hidden=true;
    if(confEl)confEl.hidden=true;
    if(hint)hint.hidden=true;
    if(retry)retry.hidden=true;
    if(compare)compare.hidden=true;
    renderScanWords([]);
    return;
  }
  $('#ocrRaw').textContent=text;
  $('#ocrDetails').open=false;
  box.hidden=false;
  if(retry)retry.hidden=!scanBitmap;
  renderScanWords(meta&&meta.tokens||[]);
  if(compare&&photo&&meta&&meta.photo){photo.src=meta.photo; compare.hidden=false;}
  else if(compare)compare.hidden=true;
  const conf=meta&&Number(meta.confidence);
  if(confEl&&Number.isFinite(conf)){
    const n=Math.max(0,Math.min(100,Math.round(conf)));
    confEl.hidden=false;
    confEl.textContent='Read confidence: '+n+'%';
    if(hint){
      hint.hidden=n>=85;
      hint.textContent=n>=85?'':'This read is uncertain. Yellow words are the ones to check. Brighter light and a tighter crop help. Turn on handwriting enhancement for faint pencil, or corner handles if the card is tilted.';
    }
  }else{
    if(confEl)confEl.hidden=true;
    if(hint)hint.hidden=true;
  }
}
function renderScanWords(tokens){
  const box=$('#scanWords');
  if(!box)return;
  box.replaceChildren();
  (tokens||[]).forEach(tok=>{
    if(tok.break){box.append(document.createElement('br'));return;}
    const conf=Number(tok.confidence);
    const low=Number.isFinite(conf)&&conf<72;
    const el=document.createElement(low?'button':'span');
    if(low){
      el.type='button';
      el.className='is-low';
      el.title='About '+Math.round(conf)+'% sure. Tap to find this word in the form.';
    }
    el.textContent=tok.text;
    box.append(el);
    box.append(document.createTextNode(' '));
  });
}
function focusScanWord(word){
  const f=$('#recipeForm');
  const needle=String(word||'').trim();
  if(!f||needle.length<2)return;
  const fields=[f.title,f.ingredients,f.steps,f.notes];
  for(let i=0;i<fields.length;i++){
    const el=fields[i];
    if(!el)continue;
    const at=el.value.toLowerCase().indexOf(needle.toLowerCase());
    if(at<0)continue;
    el.focus();
    if(el.setSelectionRange)el.setSelectionRange(at,at+needle.length);
    return;
  }
}
function openEditor(r,prefill){
  if(r&&!canMutate()){toast('Only the owner can edit recipes');return}
  const f=$('#recipeForm'); f.reset();
  const scanned=!r&&prefill;
  $('#formTitle').textContent=r?'Edit Recipe':(scanned?'Review scanned recipe':'Add Recipe');
  if(r){f.id.value=r.id;f.title.value=r.title||'';f.category.value=r.category||'';f.servings.value=r.servings||'';
    f.prep.value=r.prep||'';f.cook.value=r.cook||'';f.ingredients.value=(r.ingredients||[]).join('\n');f.steps.value=(r.steps||[]).join('\n');
    f.notes.value=r.notes||'';f.tags.value=(r.tags||[]).join(', ');}
  else f.id.value='';
  let photo=r&&r.photo||'';
  showScanReview('');
  if(prefill){
    if(prefill.title)f.title.value=prefill.title;
    if(prefill.ingredients)f.ingredients.value=prefill.ingredients.join('\n');
    if(prefill.steps)f.steps.value=prefill.steps.join('\n');
    if(prefill.notes)f.notes.value=prefill.notes;
    if(prefill.photo)photo=prefill.photo;
    if(prefill.ocrText)showScanReview(prefill.ocrText,{confidence:prefill.confidence,tokens:prefill.tokens,photo:prefill.photo});
  }
  setPhotoField(photo);
  $('#editor').showModal();
}
function editDistance(a,b){
  if(Math.abs(a.length-b.length)>2)return 3;
  const m=a.length,n=b.length;
  let prev=new Uint8Array(n+1),cur=new Uint8Array(n+1);
  for(let j=0;j<=n;j++)prev[j]=j;
  for(let i=1;i<=m;i++){
    cur[0]=i; let rowMin=cur[0];
    for(let j=1;j<=n;j++){
      const cost=a.charCodeAt(i-1)===b.charCodeAt(j-1)?0:1;
      cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+cost);
      if(cur[j]<rowMin)rowMin=cur[j];
    }
    if(rowMin>2)return 3;
    const swap=prev; prev=cur; cur=swap;
  }
  return prev[n];
}
const HEADER_WORD=/^(ingredients?|directions?|instructions?|steps?|method|preparation|notes?|tips?)$/i;
const HEADER_FUZZY=[['ingredients','ingredients'],['directions','steps'],['instructions','steps'],['preparation','steps'],['method','steps'],['steps','steps'],['notes','notes'],['tips','notes']];
function headerKind(line){
  const core=line.replace(/\([^)]*\)/g,'').replace(/[:.\s]+$/g,'').trim();
  const parts=core.split(/\s*(?:\/|&|,|\+|\band\b)\s*/i).map(s=>s.trim()).filter(Boolean);
  if(!parts.length||parts.length>3)return '';
  if(parts.every(p=>HEADER_WORD.test(p))){
    const w=parts[0].toLowerCase();
    if(w.startsWith('ingredient'))return 'ingredients';
    if(/^notes?$/.test(w)||/^tips?$/.test(w))return 'notes';
    return 'steps';
  }
  const words=core.split(/\s+/).filter(Boolean);
  if(!words.length||words.length>3)return '';
  const w=words[0].toLowerCase().replace(/[^a-z]/g,'');
  if(w.length<4)return '';
  let best='',bestD=99;
  for(const [name,kind] of HEADER_FUZZY){
    const lim=name.length>=8?2:1;
    if(Math.abs(name.length-w.length)>lim)continue;
    const d=editDistance(w,name);
    if(d<=lim&&d<bestD){bestD=d;best=kind;}
  }
  if(!best)return '';
  const rest=words.slice(1).join('');
  return rest.length<=8?best:'';
}
function isNumberedStep(line){return /^(?:step\s+)?\d{1,2}\s*[.):,]\s*[A-Za-z]/.test(line)}
function cleanStep(line){return line.replace(/^(?:step\s+)?\d{1,2}\s*[.):,]\s*/i,'').trim()||line.trim()}
function isIngredientLine(line){
  if(/^[-*•·▪◦‣–—]\s+\S/.test(line))return true;
  return /^(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?|[½¼¾⅓⅔⅛])(?:\s*[a-zA-Zµ]|\s|$)/.test(line);
}
function cleanIngredient(line){return line.replace(/^[-*•·▪◦‣–—]\s+/,'').trim()}
const RECIPE_DICT=new Set(('spaghetti garlic clove cloves olive tomato tomatoes basil crushed simmer minute minutes until dente pasta sauce serve ingredient ingredients direction directions instruction instructions method preparation note notes tip tips tablespoon tablespoons teaspoon teaspoons onion butter flour sugar pepper chicken cheese vanilla baking powder water milk fresh sliced grated canned boil warm cook toss salt '+
'preheat oven degree degrees bake soda cocoa chocolate egg eggs cream broth stock rice noodle noodles bread yeast honey syrup vinegar mustard canola sesame whisk stir combine minced diced chopped melted softened pinch dash dashes cup cups ounce ounces pound pounds parsley oregano thyme rosemary cinnamon nutmeg ginger paprika cumin chili chilli potato potatoes carrot celery beef pork shrimp lemon lime juice zest parmesan mozzarella cheddar yogurt maple ketchup mayonnaise vegetable cornstarch gelatin molasses buttermilk scallion scallions shallot shallots mushroom mushrooms spinach avocado beans bean chickpeas lentils extract brown powdered dough batter frosting icing kosher peppercorn bay saute sauteed simmering boiling').split(/\s+/).filter(Boolean));
function applyCase(sample, lower){
  if(sample&&sample[0]===sample[0].toUpperCase()&&sample[0]!==sample[0].toLowerCase())return lower.charAt(0).toUpperCase()+lower.slice(1);
  return lower;
}
function foldOcrLetters(lower){return lower.replace(/0/g,'o').replace(/1/g,'l').replace(/5/g,'s').replace(/8/g,'b')}
function correctToken(token){
  const m=token.match(/^([^A-Za-z0-9]*)([A-Za-z0-9]+)([^A-Za-z0-9]*)$/);
  if(!m)return token;
  const core=m[2];
  const lower=core.toLowerCase();
  if(RECIPE_DICT.has(lower))return token;
  const folded=foldOcrLetters(lower);
  const letters=folded.replace(/[^a-z]/g,'');
  if(letters!==lower&&letters.length>=3&&RECIPE_DICT.has(letters)&&(lower.match(/[a-z]/g)||[]).length>=3)return m[1]+applyCase(core,letters)+m[3];
  if(letters.length<4||RECIPE_DICT.has(letters))return token;
  let hit='';
  for(const dict of RECIPE_DICT){
    if(dict.length<4||Math.abs(dict.length-letters.length)>1)continue;
    if(editDistance(letters,dict)!==1)continue;
    if(!hit)hit=dict;
    else if(dict.length===letters.length&&hit.length!==letters.length)hit=dict;
    else if(dict.length===hit.length)return token;
  }
  return hit?m[1]+applyCase(core,hit)+m[3]:token;
}
function fixOcrLine(line){
  line=line.replace(/(^|\s)_+(?=\s|\d|[A-Za-z])/g,'$1');
  line=line.replace(/\bfen(?=\s+minutes?\b)/gi,'ten');
  line=line.replace(/\b(\d{3,})9(?=\s+[A-Za-z]{4,})/g,'$1 g');
  line=line.replace(/\b(\d)\s*[lI|]\s*([2348])\b/g,'$1/$2');
  line=line.replace(/\b[lI|]\/([2348])\b/g,'1/$1');
  line=line.replace(/\b(\d)\s*\/\s*(\d)\b/g,'$1/$2');
  line=line.replace(/\b[Oo]\s*\.\s*5\b/g,'0.5');
  line=line.replace(/\b[0-9OoIl|.]*[Oo][0-9OoIl|.]*\b/g,tok=>{
    if(!/\d/.test(tok))return tok;
    return tok.replace(/[Oo]/g,'0').replace(/[Il|]/g,'1');
  });
  line=line.replace(/(^|\s)([lI|])(?=\s+(?:cups?|tbsps?|tablespoons?|tsps?|teaspoons?|oz|ounces?|lbs?|pounds?|kg|mg|ml|pinch(?:es)?|cloves?)\b)/gi,'$11');
  line=line.replace(/\b(\d+)\s*(?:deg(?:rees)?|[°º])\s*F\b/gi,'$1°F');
  line=line.replace(/\btbls\b/gi,'tbsp').replace(/\btbs\b/gi,'tbsp').replace(/\btbps\b/gi,'tbsp');
  line=line.replace(/\btspn\b/gi,'tsp').replace(/\btps\b/gi,'tsp').replace(/\b0z\b/gi,'oz').replace(/\b1b\b/g,'lb');
  return line.split(' ').map(correctToken).join(' ').replace(/[ \t]+/g,' ').trim();
}
function usefulLine(line){
  const compact=line.replace(/\s/g,'');
  if(!compact)return false;
  if(headerKind(line)||isIngredientLine(line)||isNumberedStep(line))return true;
  const words=line.split(/\s+/).filter(Boolean);
  if(!words.some(w=>/[A-Za-z]{4,}/.test(w))&&!/\d/.test(line))return false;
  const alnum=(compact.match(/[A-Za-z0-9]/g)||[]).length;
  return alnum>=3&&alnum/compact.length>=0.45;
}
function fixOcrText(raw){
  let text=String(raw||'').replace(/\u00a0/g,' ');
  try{text=text.normalize('NFKD').replace(/\p{M}/gu,'')}catch(e){}
  const out=[];
  for(let line of text.split(/\r?\n/)){
    line=line.replace(/[ \t]+/g,' ').trim();
    if(!line)continue;
    line=fixOcrLine(line);
    if(usefulLine(line))out.push(line);
  }
  return out.join('\n');
}
function tidyTitle(title){
  const parts=title.split(/\s+/).filter(Boolean);
  const anchored=parts.some(w=>{const bare=w.toLowerCase().replace(/[^a-z]/g,'');return bare.length>=6||RECIPE_DICT.has(bare);});
  if(!anchored)return title;
  while(parts.length>1){
    const bare=parts[parts.length-1].toLowerCase().replace(/[^a-z]/g,'');
    if(bare.length>=5||RECIPE_DICT.has(bare))break;
    parts.pop();
  }
  return parts.join(' ');
}
function parseRecipeText(raw){
  const lines=String(raw||'').replace(/\u00a0/g,' ').split(/\r?\n/).map(l=>l.replace(/[ \t]+/g,' ').trim()).filter(Boolean);
  const ingredients=[],steps=[],notes=[];
  let title='',titleSet=false,mode='';
  for(const line of lines){
    const section=headerKind(line);
    if(section){mode=section;continue}
    if(!titleSet&&!mode){title=tidyTitle(line);titleSet=true;continue}
    if(mode==='ingredients'){ingredients.push(cleanIngredient(line));continue}
    if(mode==='steps'){
      const prev=steps[steps.length-1]||'';
      if(!isNumberedStep(line)&&steps.length&&/^[a-z("]/.test(line)&&!/[.!?:"']$/.test(prev))steps[steps.length-1]=prev+' '+line;
      else steps.push(cleanStep(line));
      continue;
    }
    if(mode==='notes'){notes.push(line);continue}
    if(isNumberedStep(line)){steps.push(cleanStep(line));continue}
    if(isIngredientLine(line)){ingredients.push(cleanIngredient(line));continue}
    notes.push(line);
  }
  return {title,ingredients,steps,notes:notes.join('\n')};
}
let scanToken=0,workerPromise=null,progressHandler=()=>{},scanBitmap=null,cropSession=null,scanDraft=null,cropDrag=null;
function assetURL(path){return new URL('/recipes/'+String(path).replace(/^\//,''),window.location.origin).href}
function setScanProgress(label,pct){
  const n=Math.max(0,Math.min(100,Math.round(pct||0)));
  const status=$('#scanStatus'); if(status)status.textContent=label;
  const bar=$('#scanBar'); if(bar)bar.style.width=n+'%';
  const track=$('#scanBarTrack'); if(track)track.setAttribute('aria-valuenow',String(n));
}
function openProgress(label,pct){setScanProgress(label,pct);const dlg=$('#scanProgress');if(dlg&&!dlg.open)dlg.showModal()}
function closeProgress(){const dlg=$('#scanProgress');if(dlg&&dlg.open)dlg.close()}
let scanStopLock=false;
function releaseBitmap(){try{scanBitmap&&scanBitmap.close&&scanBitmap.close()}catch(e){} scanBitmap=null}
function stopScan(message){
  if(scanStopLock)return;
  scanStopLock=true;
  scanToken++;
  progressHandler=()=>{};
  const pending=workerPromise;
  workerPromise=null;
  if(pending)pending.then(w=>{try{w&&w.terminate()}catch(e){}}).catch(()=>{});
  try{closeProgress()}finally{scanStopLock=false}
  if(message)toast(message);
}
function onTessProgress(m){
  const labels={
    'loading tesseract core':'Loading text recognition…',
    'initializing tesseract':'Starting text recognition…',
    'loading language traineddata':'Downloading language data…',
    'initializing api':'Preparing…',
    'recognizing text':'Reading recipe…'
  };
  const spans={
    'loading tesseract core':[18,32],
    'initializing tesseract':[32,42],
    'loading language traineddata':[42,70],
    'initializing api':[70,76],
    'recognizing text':[76,96]
  };
  const span=spans[m.status]||[20,90];
  const p=span[0]+(span[1]-span[0])*(Number(m.progress)||0);
  setScanProgress(labels[m.status]||'Reading recipe…',p);
}
function loadTesseract(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  if(loadTesseract.pending)return loadTesseract.pending;
  loadTesseract.pending=new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src=assetURL('vendor/tesseract/tesseract.min.js');
    s.async=true;
    s.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(new Error('Text recognition failed to start'));
    s.onerror=()=>reject(new Error('Could not download text recognition. Check your connection and try again.'));
    document.head.appendChild(s);
  }).catch(err=>{loadTesseract.pending=null;throw err});
  return loadTesseract.pending;
}
function getWorker(){
  if(!workerPromise){
    workerPromise=loadTesseract().then(Tesseract=>Tesseract.createWorker('eng',1,{
      workerPath:assetURL('vendor/tesseract/worker.min.js'),
      corePath:assetURL('vendor/tesseract/'),
      langPath:'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int',
      workerBlobURL:true,
      gzip:true,
      logger:m=>{try{progressHandler(m)}catch(e){}}
    })).catch(err=>{workerPromise=null;throw err});
  }
  return workerPromise;
}
function sourceSize(source){return {w:source.naturalWidth||source.width,h:source.naturalHeight||source.height}}
function fitCanvas(img,maxEdge){
  const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
  const longest=Math.max(w,h)||1;
  const minEdge=Math.min(1500,maxEdge);
  let scale=1;
  if(longest>maxEdge)scale=maxEdge/longest;
  else if(longest<minEdge)scale=minEdge/longest;
  const c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(w*scale));
  c.height=Math.max(1,Math.round(h*scale));
  const ctx=c.getContext('2d',{alpha:false,willReadFrequently:true});
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height);
  ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
  ctx.drawImage(img,0,0,c.width,c.height);
  return c;
}
function rotateCanvas(src,degrees){
  if(!degrees)return src;
  const rad=degrees*Math.PI/180;
  const w=src.width,h=src.height;
  const sin=Math.abs(Math.sin(rad)),cos=Math.abs(Math.cos(rad));
  const nw=Math.max(1,Math.ceil(w*cos+h*sin)),nh=Math.max(1,Math.ceil(w*sin+h*cos));
  const c=document.createElement('canvas');
  c.width=nw; c.height=nh;
  const ctx=c.getContext('2d',{alpha:false,willReadFrequently:true});
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,nw,nh);
  ctx.translate(nw/2,nh/2); ctx.rotate(rad); ctx.drawImage(src,-w/2,-h/2);
  return c;
}
function rotateCenter(src,degrees){
  const c=document.createElement('canvas');
  c.width=src.width; c.height=src.height;
  const ctx=c.getContext('2d',{alpha:false,willReadFrequently:true});
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height);
  ctx.translate(c.width/2,c.height/2);
  ctx.rotate(degrees*Math.PI/180);
  ctx.drawImage(src,-src.width/2,-src.height/2);
  return c;
}
function grayOf(canvas){
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const img=ctx.getImageData(0,0,canvas.width,canvas.height);
  const g=new Uint8Array(canvas.width*canvas.height);
  const d=img.data;
  for(let i=0,p=0;i<d.length;i+=4,p++)g[p]=(d[i]*77+d[i+1]*150+d[i+2]*29)>>8;
  return g;
}
function paintGray(g,w,h){
  const c=document.createElement('canvas');
  c.width=w; c.height=h;
  const ctx=c.getContext('2d');
  const img=ctx.createImageData(w,h);
  const d=img.data;
  for(let i=0,p=0;i<g.length;i++,p+=4){const v=g[i]; d[p]=d[p+1]=d[p+2]=v; d[p+3]=255;}
  ctx.putImageData(img,0,0);
  return c;
}
function boxBlur(g,w,h,r){
  if(r<1)return g;
  const tmp=new Float64Array(g.length);
  const out=new Uint8Array(g.length);
  const div=r*2+1;
  for(let y=0;y<h;y++){
    let sum=0;
    for(let k=-r;k<=r;k++)sum+=g[y*w+Math.min(w-1,Math.max(0,k))];
    for(let x=0;x<w;x++){
      tmp[y*w+x]=sum/div;
      sum-=g[y*w+Math.min(w-1,Math.max(0,x-r))];
      sum+=g[y*w+Math.min(w-1,Math.max(0,x+r+1))];
    }
  }
  for(let x=0;x<w;x++){
    let sum=0;
    for(let k=-r;k<=r;k++)sum+=tmp[Math.min(h-1,Math.max(0,k))*w+x];
    for(let y=0;y<h;y++){
      out[y*w+x]=sum/div;
      sum-=tmp[Math.min(h-1,Math.max(0,y-r))*w+x];
      sum+=tmp[Math.min(h-1,Math.max(0,y+r+1))*w+x];
    }
  }
  return out;
}
function stretch(g){
  const hist=new Uint32Array(256);
  for(let i=0;i<g.length;i+=4)hist[g[i]]++;
  let total=0; for(let i=0;i<256;i++)total+=hist[i];
  const cut=total*0.02;
  let lo=0,hi=255,acc=0;
  for(let i=0;i<256;i++){acc+=hist[i]; if(acc>=cut){lo=i;break}}
  acc=0;
  for(let i=255;i>=0;i--){acc+=hist[i]; if(acc>=cut){hi=i;break}}
  if(hi-lo<20)return g;
  const scale=255/(hi-lo);
  const out=new Uint8Array(g.length);
  for(let i=0;i<g.length;i++){
    let v=(g[i]-lo)*scale;
    out[i]=v<0?0:v>255?255:v|0;
  }
  return out;
}
function sauvola(g,w,h,k){
  let win=Math.round(Math.min(w,h)/28);
  if(win%2===0)win++;
  win=Math.max(21,Math.min(81,win));
  const r=win>>1;
  const ii=new Float64Array(w*h);
  const ii2=new Float64Array(w*h);
  for(let y=0,i=0;y<h;y++){
    let row=0,row2=0;
    for(let x=0;x<w;x++,i++){
      const v=g[i];
      row+=v; row2+=v*v;
      ii[i]=row+(y?ii[i-w]:0);
      ii2[i]=row2+(y?ii2[i-w]:0);
    }
  }
  const out=new Uint8Array(g.length);
  const R=128;
  function areaSum(intg,x0,y0,x1,y1){
    const A=(y0>0&&x0>0)?intg[(y0-1)*w+(x0-1)]:0;
    const B=y0>0?intg[(y0-1)*w+x1]:0;
    const C=x0>0?intg[y1*w+(x0-1)]:0;
    return intg[y1*w+x1]-B-C+A;
  }
  for(let y=0;y<h;y++){
    const y0=Math.max(0,y-r),y1=Math.min(h-1,y+r);
    for(let x=0;x<w;x++){
      const x0=Math.max(0,x-r),x1=Math.min(w-1,x+r);
      const area=(x1-x0+1)*(y1-y0+1);
      const s=areaSum(ii,x0,y0,x1,y1);
      const s2=areaSum(ii2,x0,y0,x1,y1);
      const mean=s/area;
      const variance=Math.max(0,s2/area-mean*mean);
      const T=mean*(1+k*((Math.sqrt(variance)/R)-1));
      out[y*w+x]=g[y*w+x]<T?0:255;
    }
  }
  return out;
}
function rowScore(g,w,h){
  let sum=0,sum2=0;
  for(let y=0;y<h;y++){
    let c=0; const row=y*w;
    for(let x=0;x<w;x++)if(g[row+x]<128)c++;
    sum+=c; sum2+=c*c;
  }
  const mean=sum/h;
  return sum2/h-mean*mean;
}
function roughBinary(canvas){
  const g=grayOf(canvas);
  let sum=0; for(let i=0;i<g.length;i+=3)sum+=g[i];
  const t=(sum/Math.ceil(g.length/3))*0.92;
  for(let i=0;i<g.length;i++)g[i]=g[i]<t?0:255;
  return {g,w:canvas.width,h:canvas.height};
}
function cardinal(canvas){
  const small=fitCanvas(canvas,420);
  const a=roughBinary(small);
  const b=roughBinary(rotateCanvas(small,90));
  const s0=rowScore(a.g,a.w,a.h);
  const s90=rowScore(b.g,b.w,b.h);
  return s90>s0*1.18?90:0;
}
function deskewAngle(canvas){
  const small=fitCanvas(canvas,520);
  let best=0,bestScore=-1,zero=0;
  for(let a=-12;a<=12;a+=1){
    const rot=a?rotateCenter(small,a):small;
    const g=sauvola(stretch(grayOf(rot)),rot.width,rot.height,0.34);
    const score=rowScore(g,rot.width,rot.height);
    if(a===0)zero=score;
    if(score>bestScore){bestScore=score;best=a;}
  }
  if(Math.abs(best)<2||!zero||bestScore<zero*1.08)return 0;
  return best;
}
function padCanvas(src,pad){
  const c=document.createElement('canvas');
  c.width=src.width+pad*2; c.height=src.height+pad*2;
  const ctx=c.getContext('2d',{alpha:false});
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height);
  ctx.drawImage(src,pad,pad);
  return c;
}
function unsharp(g,w,h,amount){
  const blur=boxBlur(g,w,h,1);
  const out=new Uint8Array(g.length);
  for(let i=0;i<g.length;i++){
    let v=g[i]+amount*(g[i]-blur[i]);
    out[i]=v<0?0:v>255?255:v|0;
  }
  return out;
}
function flattenIllumination(g,w,h){
  const radius=Math.max(15,Math.round(Math.min(w,h)/10));
  const bg=boxBlur(g,w,h,radius);
  const out=new Uint8Array(g.length);
  for(let i=0;i<g.length;i++){
    const v=g[i]/Math.max(1,bg[i])*255;
    out[i]=v<0?0:v>255?255:v|0;
  }
  return unsharp(out,w,h,0.35);
}
function sauvolaWindow(g,w,h,k,win){
  if(win%2===0)win++;
  win=Math.max(15,win|0);
  const r=win>>1;
  const ii=new Float64Array(w*h);
  const ii2=new Float64Array(w*h);
  for(let y=0,i=0;y<h;y++){
    let row=0,row2=0;
    for(let x=0;x<w;x++,i++){
      const v=g[i];
      row+=v; row2+=v*v;
      ii[i]=row+(y?ii[i-w]:0);
      ii2[i]=row2+(y?ii2[i-w]:0);
    }
  }
  const out=new Uint8Array(g.length);
  const R=128;
  function areaSum(intg,x0,y0,x1,y1){
    const A=(y0>0&&x0>0)?intg[(y0-1)*w+(x0-1)]:0;
    const B=y0>0?intg[(y0-1)*w+x1]:0;
    const C=x0>0?intg[y1*w+(x0-1)]:0;
    return intg[y1*w+x1]-B-C+A;
  }
  for(let y=0;y<h;y++){
    const y0=Math.max(0,y-r),y1=Math.min(h-1,y+r);
    for(let x=0;x<w;x++){
      const x0=Math.max(0,x-r),x1=Math.min(w-1,x+r);
      const area=(x1-x0+1)*(y1-y0+1);
      const s=areaSum(ii,x0,y0,x1,y1);
      const s2=areaSum(ii2,x0,y0,x1,y1);
      const mean=s/area;
      const variance=Math.max(0,s2/area-mean*mean);
      const T=mean*(1+k*((Math.sqrt(variance)/R)-1));
      out[y*w+x]=g[y*w+x]<T?0:255;
    }
  }
  return out;
}
function suppressRuledLines(bin,w,h){
  const out=bin.slice();
  const rowInk=new Uint32Array(h);
  for(let y=0;y<h;y++){
    let c=0;
    for(let x=0;x<w;x++)if(bin[y*w+x]<128)c++;
    rowInk[y]=c;
  }
  for(let y=2;y<h-2;y++){
    if(rowInk[y]<w*0.42)continue;
    const neighbors=(rowInk[y-2]+rowInk[y+2])/2;
    if(rowInk[y]<neighbors*2.1&&rowInk[y]<w*0.7)continue;
    for(let x=0;x<w;x++){
      if(bin[y*w+x]>=128)continue;
      const above=bin[(y-2)*w+x]<128;
      const below=bin[(y+2)*w+x]<128;
      if(!above&&!below)out[y*w+x]=255;
    }
  }
  const minRun=Math.max(40,Math.round(w*0.045));
  for(let y=1;y<h-1;y++){
    let x=0;
    while(x<w){
      if(out[y*w+x]>=128){x++;continue;}
      let x2=x;
      while(x2<w&&out[y*w+x2]<128)x2++;
      if(x2-x>=minRun){
        for(let i=x;i<x2;i++){
          if(out[(y-1)*w+i]>=128&&out[(y+1)*w+i]>=128)out[y*w+i]=255;
        }
      }
      x=Math.max(x2,x+1);
    }
  }
  return out;
}
function passFlatten(canvas){
  const w=canvas.width,h=canvas.height;
  const g=flattenIllumination(grayOf(canvas),w,h);
  return padCanvas(paintGray(g,w,h),24);
}
function passSauvola(canvas,handwriting){
  const w=canvas.width,h=canvas.height;
  let g=stretch(boxBlur(grayOf(canvas),w,h,1));
  g=sauvolaWindow(g,w,h,handwriting?0.16:0.26,(()=>{let win=Math.round(Math.min(w,h)/(handwriting?26:32)); if(win%2===0)win++; return Math.max(25,Math.min(handwriting?51:61,win));})());
  g=suppressRuledLines(g,w,h);
  return padCanvas(paintGray(g,w,h),24);
}
function passHybrid(canvas,handwriting){
  const w=canvas.width,h=canvas.height;
  let g=flattenIllumination(grayOf(canvas),w,h);
  let win=Math.round(Math.min(w,h)/30); if(win%2===0)win++;
  win=Math.max(25,Math.min(55,win));
  g=sauvolaWindow(g,w,h,handwriting?0.15:0.22,win);
  g=suppressRuledLines(g,w,h);
  return padCanvas(paintGray(g,w,h),24);
}
function solveHomography(src, dst){
  const a=[];
  for(let i=0;i<4;i++){
    const x=dst[i].x,y=dst[i].y,u=src[i].x,v=src[i].y;
    a.push([x,y,1,0,0,0,-u*x,-u*y,u]);
    a.push([0,0,0,x,y,1,-v*x,-v*y,v]);
  }
  const n=8;
  for(let c=0;c<n;c++){
    let piv=c;
    for(let r=c+1;r<n;r++)if(Math.abs(a[r][c])>Math.abs(a[piv][c]))piv=r;
    if(Math.abs(a[piv][c])<1e-8)return null;
    const tmp=a[c]; a[c]=a[piv]; a[piv]=tmp;
    const div=a[c][c];
    for(let j=c;j<=n;j++)a[c][j]/=div;
    for(let r=0;r<n;r++){
      if(r===c)continue;
      const f=a[r][c];
      for(let j=c;j<=n;j++)a[r][j]-=f*a[c][j];
    }
  }
  return a.map(row=>row[n]);
}
function warpQuad(canvas, corners){
  const dist=(p,q)=>Math.hypot(p.x-q.x,p.y-q.y);
  const dw=Math.max(1,Math.round(Math.max(dist(corners[0],corners[1]),dist(corners[3],corners[2]))));
  const dh=Math.max(1,Math.round(Math.max(dist(corners[0],corners[3]),dist(corners[1],corners[2]))));
  const dest=[{x:0,y:0},{x:dw-1,y:0},{x:dw-1,y:dh-1},{x:0,y:dh-1}];
  const h=solveHomography(corners, dest);
  if(!h)return canvas;
  const srcCtx=canvas.getContext('2d',{willReadFrequently:true});
  const src=srcCtx.getImageData(0,0,canvas.width,canvas.height);
  const sw=canvas.width,sh=canvas.height,sd=src.data;
  const out=document.createElement('canvas');
  out.width=dw; out.height=dh;
  const ctx=out.getContext('2d');
  const img=ctx.createImageData(dw,dh);
  const d=img.data;
  for(let y=0;y<dh;y++){
    for(let x=0;x<dw;x++){
      const den=h[6]*x+h[7]*y+1;
      if(!den)continue;
      const sx=(h[0]*x+h[1]*y+h[2])/den;
      const sy=(h[3]*x+h[4]*y+h[5])/den;
      const x0=Math.floor(sx), y0=Math.floor(sy);
      const x1=x0+1, y1=y0+1;
      const fx=sx-x0, fy=sy-y0;
      const p=(y*dw+x)*4;
      if(x0<0||y0<0||x1>=sw||y1>=sh){d[p]=d[p+1]=d[p+2]=255; d[p+3]=255; continue;}
      for(let c=0;c<3;c++){
        const i00=sd[(y0*sw+x0)*4+c], i10=sd[(y0*sw+x1)*4+c];
        const i01=sd[(y1*sw+x0)*4+c], i11=sd[(y1*sw+x1)*4+c];
        const v=(i00*(1-fx)+i10*fx)*(1-fy)+(i01*(1-fx)+i11*fx)*fy;
        d[p+c]=v|0;
      }
      d[p+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
  return out;
}
function splitColumns(words, width){
  const items=words.filter(w=>w&&w.text&&String(w.text).trim()&&w.x1>w.x0);
  if(items.length<8||!width)return null;
  const sorted=items.slice().sort((a,b)=>((a.x0+a.x1)/2)-((b.x0+b.x1)/2));
  let bestGap=0,bestI=-1;
  for(let i=2;i<sorted.length-2;i++){
    const gap=((sorted[i].x0+sorted[i].x1)/2)-((sorted[i-1].x0+sorted[i-1].x1)/2);
    if(gap>bestGap){bestGap=gap;bestI=i;}
  }
  if(bestI<0||bestGap<width*0.07)return null;
  const left=sorted.slice(0,bestI), right=sorted.slice(bestI);
  const leftMax=Math.max.apply(null,left.map(w=>w.x1));
  const rightMin=Math.min.apply(null,right.map(w=>w.x0));
  if(rightMin-leftMax<width*0.05)return null;
  const mean=arr=>arr.reduce((s,w)=>s+(w.x0+w.x1)/2,0)/arr.length;
  if(mean(right)-mean(left)<width*0.22)return null;
  return {left,right,split:(leftMax+rightMin)/2};
}
function linesFromWords(words){
  const items=(words||[]).filter(w=>w&&String(w.text||'').trim()).map(w=>({
    text:String(w.text).trim(),
    confidence:Number(w.confidence)||0,
    x0:w.x0||0,x1:w.x1||0,y0:w.y0||0,y1:w.y1||0,
    cx:((w.x0||0)+(w.x1||0))/2,
    cy:((w.y0||0)+(w.y1||0))/2
  }));
  items.sort((a,b)=>a.cy-b.cy||a.cx-b.cx);
  const lines=[];
  items.forEach(w=>{
    const last=lines[lines.length-1];
    const h=Math.max(8,w.y1-w.y0||12);
    if(last&&Math.abs(w.cy-last.cy)<h*0.7){last.words.push(w); last.cy=(last.cy*last.n+w.cy)/(last.n+1); last.n++;}
    else lines.push({cy:w.cy,n:1,words:[w]});
  });
  return lines.map(line=>{
    line.words.sort((a,b)=>a.cx-b.cx);
    const confidence=line.words.reduce((s,w)=>s+w.confidence,0)/line.words.length;
    return {text:line.words.map(w=>w.text).join(' '),confidence,y:line.cy,words:line.words};
  }).filter(l=>l.text);
}
function readingOrder(words, width){
  const split=splitColumns(words, width);
  if(!split)return linesFromWords(words);
  return linesFromWords(split.left).concat(linesFromWords(split.right));
}
function mergeOcrLines(passLines){
  const tagged=[];
  (passLines||[]).forEach((lines,pi)=>(lines||[]).forEach(line=>{
    if(line&&String(line.text||'').trim())tagged.push({text:String(line.text).trim(),confidence:Number(line.confidence)||0,y:Number(line.y)||0,words:line.words||[],pi});
  }));
  tagged.sort((a,b)=>a.y-b.y||a.pi-b.pi);
  const used=new Set();
  const out=[];
  for(let i=0;i<tagged.length;i++){
    if(used.has(i))continue;
    let best=tagged[i];
    used.add(i);
    for(let j=i+1;j<tagged.length;j++){
      if(used.has(j))continue;
      if(tagged[j].y-tagged[i].y>12)break;
      if(tagged[j].pi===tagged[i].pi)continue;
      used.add(j);
      if(tagged[j].confidence>best.confidence)best=tagged[j];
    }
    out.push(best);
  }
  out.sort((a,b)=>a.y-b.y);
  return out;
}
function meanConf(lines){
  if(!lines||!lines.length)return 0;
  return lines.reduce((s,l)=>s+(Number(l.confidence)||0),0)/lines.length;
}
function scoreText(text, confidence){
  const fixed=fixOcrText(text);
  const words=fixed.split(/\s+/).filter(Boolean);
  let known=0;
  words.forEach(w=>{const bare=w.toLowerCase().replace(/[^a-z]/g,''); if(bare&&RECIPE_DICT.has(bare))known++;});
  return (Number(confidence)||0)+(words.length?known/words.length*40:0);
}
function tokensFromLines(lines){
  const tokens=[];
  (lines||[]).forEach((line,idx)=>{
    const fixed=fixOcrLine(line.text);
    const parts=fixed.split(' ').filter(Boolean);
    const src=line.words&&line.words.length?line.words:[{text:line.text,confidence:line.confidence}];
    parts.forEach((text,i)=>{
      const srcWord=src[Math.min(i,src.length-1)];
      tokens.push({text,confidence:srcWord?Number(srcWord.confidence)||0:Number(line.confidence)||0});
    });
    if(idx<lines.length-1)tokens.push({break:true});
  });
  return tokens;
}
function wordsOf(result){
  const words=result&&result.data&&result.data.words||[];
  return words.map(w=>({
    text:String(w.text||'').replace(/\s+/g,' ').trim(),
    confidence:Number(w.confidence)||0,
    x0:w.bbox?w.bbox.x0:0,
    x1:w.bbox?w.bbox.x1:0,
    y0:w.bbox?w.bbox.y0:0,
    y1:w.bbox?w.bbox.y1:0
  })).filter(w=>w.text);
}
function linesOf(result, words){
  const raw=result&&result.data&&result.data.lines||[];
  if(!raw.length)return linesFromWords(words||[]);
  return raw.map(line=>{
    const y0=line.bbox?line.bbox.y0:0, y1=line.bbox?line.bbox.y1:0;
    const mine=(words||[]).filter(w=>w.y1>=y0-2&&w.y0<=y1+2);
    return {text:String(line.text||'').trim(), confidence:Number(line.confidence)||0, y:(y0+y1)/2, words:mine};
  }).filter(l=>l.text);
}
function chooseLines(passes){
  const merged=mergeOcrLines(passes.map(p=>p.lines));
  const best=passes.slice().sort((a,b)=>b.confidence-a.confidence)[0]||{words:[],width:0};
  const split=splitColumns(best.words, best.width);
  if(split){
    const ordered=linesFromWords(split.left).concat(linesFromWords(split.right));
    if(ordered.length)return ordered;
  }
  if(merged.length)return merged;
  return linesFromWords(best.words||[]);
}
function orientedSize(bitmap,rotation){
  return rotation%2?{w:bitmap.height,h:bitmap.width}:{w:bitmap.width,h:bitmap.height};
}
function renderOrientedFull(bitmap,rotation,maxEdge){
  return renderOrientedCrop(bitmap,rotation,{x:0,y:0,w:1,h:1},maxEdge);
}
function renderScanCanvas(bitmap, session, maxEdge){
  if(session.perspective&&session.corners&&session.corners.length===4){
    const oriented=renderOrientedFull(bitmap, session.rotation, maxEdge);
    const pts=session.corners.map(p=>({x:p.x*oriented.width,y:p.y*oriented.height}));
    return warpQuad(oriented, pts);
  }
  return renderOrientedCrop(bitmap, session.rotation, session.norm, maxEdge);
}
function cropColumns(canvas, splitX){
  const leftW=Math.max(1,Math.round(splitX));
  const rightW=Math.max(1,canvas.width-leftW);
  function slice(sx,sw){
    const c=document.createElement('canvas');
    c.width=sw; c.height=canvas.height;
    const ctx=c.getContext('2d',{alpha:false});
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,sw,canvas.height);
    ctx.drawImage(canvas,sx,0,sw,canvas.height,0,0,sw,canvas.height);
    return c;
  }
  return [slice(0,leftW), slice(leftW,rightW)];
}
function renderOrientedCrop(bitmap,rotation,norm,maxEdge){
  const o=orientedSize(bitmap,rotation);
  const sx=norm.x*o.w,sy=norm.y*o.h,sw=Math.max(1,norm.w*o.w),sh=Math.max(1,norm.h*o.h);
  const scale=Math.min(1,maxEdge/Math.max(sw,sh));
  const dw=Math.max(1,Math.round(sw*scale)),dh=Math.max(1,Math.round(sh*scale));
  const c=document.createElement('canvas');
  c.width=dw; c.height=dh;
  const ctx=c.getContext('2d',{alpha:false});
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,dw,dh);
  ctx.save();
  ctx.translate(-sx*scale,-sy*scale);
  ctx.scale(scale,scale);
  ctx.translate(o.w/2,o.h/2);
  ctx.rotate(rotation*Math.PI/2);
  ctx.drawImage(bitmap,-bitmap.width/2,-bitmap.height/2);
  ctx.restore();
  return c;
}
function canvasJpeg(canvas){
  let quality=0.72,cur=canvas,edge=Math.max(canvas.width,canvas.height);
  for(let attempt=0;attempt<6;attempt++){
    let data='';
    try{data=cur.toDataURL('image/jpeg',quality)}catch(e){data=''}
    if(data&&data.length<=PHOTO_MAX&&safePhoto(data))return data;
    if(quality>0.5)quality=Math.round((quality-0.08)*100)/100;
    else{
      edge=Math.round(edge*0.85);
      cur=fitCanvas(cur,edge);
    }
    if(edge<480)break;
  }
  return '';
}
function shrinkToJpeg(url){
  return new Promise(resolve=>{
    if(!url){resolve('');return}
    if(url.startsWith('https://')){resolve(url.length<=2000?url:'');return}
    if(url.startsWith('data:image/jpeg;base64,')&&url.length<=PHOTO_MAX){resolve(url);return}
    if(typeof document==='undefined'){resolve('');return}
    const img=new Image();
    img.onload=()=>{
      const sw=img.naturalWidth||img.width||1, sh=img.naturalHeight||img.height||1;
      const edge=Math.max(sw,sh);
      const maxEdge=Math.min(1600,edge);
      const scale=maxEdge/edge;
      const c=document.createElement('canvas');
      c.width=Math.max(1,Math.round(sw*scale));
      c.height=Math.max(1,Math.round(sh*scale));
      const ctx=c.getContext('2d',{alpha:false});
      ctx.fillStyle='#fff';
      ctx.fillRect(0,0,c.width,c.height);
      ctx.drawImage(img,0,0,c.width,c.height);
      resolve(canvasJpeg(c)||'');
    };
    img.onerror=()=>resolve('');
    img.src=url;
  });
}
function decodeImage(file){
  if(typeof createImageBitmap==='function'){
    return createImageBitmap(file,{imageOrientation:'from-image'}).catch(()=>createImageBitmap(file)).catch(()=>decodeImageElement(file));
  }
  return decodeImageElement(file);
}
function decodeImageElement(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Could not read that image. Try a JPEG or PNG.'))};
    img.src=url;
  });
}
function isImageFile(file){
  if(file.type&&file.type.startsWith('image/'))return true;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|tif|tiff)$/i.test(file.name||'');
}
function applyCropBox(){
  if(!cropSession)return;
  const box=$('#cropBox');
  const quad=$('#cropQuad');
  const handles=$('#quadHandles');
  const perspective=!!cropSession.perspective;
  if(box)box.hidden=perspective;
  if(quad)quad.hidden=!perspective;
  if(handles)handles.hidden=!perspective;
  const n=cropSession.norm;
  if(box&&!perspective){
    box.style.left=(n.x*100)+'%';
    box.style.top=(n.y*100)+'%';
    box.style.width=(n.w*100)+'%';
    box.style.height=(n.h*100)+'%';
  }
  if(!perspective)return;
  const pts=cropSession.corners||[];
  const poly=$('#cropPoly');
  const shade=$('#cropShade');
  const pointStr=pts.map(p=>(p.x*100)+','+(p.y*100)).join(' ');
  if(poly)poly.setAttribute('points', pointStr);
  if(shade)shade.setAttribute('d','M0,0 H100 V100 H0 Z M '+pts.map(p=>(p.x*100)+' '+(p.y*100)).join(' L ')+' Z');
  if(handles){
    handles.querySelectorAll('[data-c]').forEach(el=>{
      const p=pts[Number(el.dataset.c)];
      if(!p)return;
      el.style.left=(p.x*100)+'%';
      el.style.top=(p.y*100)+'%';
    });
  }
}
function cornersFromNorm(n){
  return [{x:n.x,y:n.y},{x:n.x+n.w,y:n.y},{x:n.x+n.w,y:n.y+n.h},{x:n.x,y:n.y+n.h}];
}
function drawCropPreview(){
  if(!scanBitmap||!cropSession)return;
  const stage=$('#cropStage');
  const frame=$('#cropFrame');
  const canvas=$('#cropCanvas');
  const o=orientedSize(scanBitmap,cropSession.rotation);
  const maxW=stage.clientWidth||300;
  const maxH=stage.clientHeight||360;
  const scale=Math.min(maxW/o.w,maxH/o.h);
  const dw=Math.max(1,Math.round(o.w*scale));
  const dh=Math.max(1,Math.round(o.h*scale));
  canvas.width=dw; canvas.height=dh;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#1c1614';
  ctx.fillRect(0,0,dw,dh);
  ctx.save();
  ctx.translate(dw/2,dh/2);
  ctx.rotate(cropSession.rotation*Math.PI/2);
  ctx.drawImage(scanBitmap,-scanBitmap.width*scale/2,-scanBitmap.height*scale/2,scanBitmap.width*scale,scanBitmap.height*scale);
  ctx.restore();
  frame.style.width=dw+'px';
  frame.style.height=dh+'px';
  applyCropBox();
}
function finishCrop(value){
  const resolve=cropSession&&cropSession.resolve;
  cropSession=null;
  const dlg=$('#scanCrop');
  if(dlg&&dlg.open)dlg.close();
  if(resolve)resolve(value);
}
function openCropper(){
  const perspective=$('#perspectiveToggle')&&$('#perspectiveToggle').checked;
  const norm={x:0.06,y:0.06,w:0.88,h:0.88};
  cropSession={rotation:0,norm,perspective,corners:cornersFromNorm(norm),resolve:null};
  const dlg=$('#scanCrop');
  if(!dlg.open)dlg.showModal();
  return new Promise(resolve=>{
    cropSession.resolve=resolve;
    requestAnimationFrame(()=>drawCropPreview());
  });
}
function clampCrop(x,y,w,h){
  const min=0.12;
  w=Math.max(min,Math.min(w,1));
  h=Math.max(min,Math.min(h,1));
  x=Math.max(0,Math.min(x,1-w));
  y=Math.max(0,Math.min(y,1-h));
  return {x,y,w,h};
}
function onCropDown(e){
  if(!cropSession)return;
  const box=$('#cropBox');
  const frame=box.parentElement.getBoundingClientRect();
  cropDrag={handle:e.target.dataset.h||'move',px:e.clientX,py:e.clientY,start:{...cropSession.norm},frame};
  box.setPointerCapture(e.pointerId);
  e.preventDefault();
}
function onCropMove(e){
  if(!cropDrag||!cropSession)return;
  const dx=(e.clientX-cropDrag.px)/cropDrag.frame.width;
  const dy=(e.clientY-cropDrag.py)/cropDrag.frame.height;
  let {x,y,w,h}=cropDrag.start;
  const handle=cropDrag.handle;
  if(handle==='move'){x+=dx;y+=dy;}
  else{
    if(handle.includes('w')){x+=dx;w-=dx;}
    if(handle.includes('e'))w+=dx;
    if(handle.includes('n')){y+=dy;h-=dy;}
    if(handle.includes('s'))h+=dy;
  }
  cropSession.norm=clampCrop(x,y,w,h);
  applyCropBox();
}
function onCropUp(){cropDrag=null}
function onQuadDown(e){
  const handle=e.target.closest('[data-c]');
  if(!handle||!cropSession||!cropSession.perspective)return;
  cropDrag={kind:'quad',index:Number(handle.dataset.c),px:e.clientX,py:e.clientY,start:cropSession.corners.map(p=>({x:p.x,y:p.y})),frame:$('#cropFrame').getBoundingClientRect()};
  handle.setPointerCapture(e.pointerId);
  e.preventDefault();
  e.stopPropagation();
}
function onQuadMove(e){
  if(!cropDrag||cropDrag.kind!=='quad'||!cropSession)return;
  const dx=(e.clientX-cropDrag.px)/cropDrag.frame.width;
  const dy=(e.clientY-cropDrag.py)/cropDrag.frame.height;
  const pts=cropDrag.start.map(p=>({x:p.x,y:p.y}));
  const i=cropDrag.index;
  pts[i]={x:Math.max(0,Math.min(1,pts[i].x+dx)),y:Math.max(0,Math.min(1,pts[i].y+dy))};
  cropSession.corners=pts;
  applyCropBox();
}
function draftFromForm(){
  const f=$('#recipeForm');
  return {
    title:f.title.value,
    ingredients:f.ingredients.value.split('\n').filter(Boolean),
    steps:f.steps.value.split('\n').filter(Boolean),
    notes:f.notes.value,
    photo:f.photoData.value||f.photo.value,
    ocrText:$('#ocrRaw').textContent,
    confidence:($('#scanConfidence').textContent.match(/\d+/)||[])[0]
  };
}
async function recognizePass(worker, canvas, psm){
  try{
    await worker.setParameters({
      tessedit_pageseg_mode:String(psm),
      preserve_interword_spaces:'1',
      user_defined_dpi:'300'
    });
  }catch(e){}
  const result=await worker.recognize(canvas);
  const words=wordsOf(result);
  const lines=linesOf(result, words);
  const confidence=result&&result.data?Number(result.data.confidence)||0:0;
  return {words,lines,confidence,width:canvas.width,text:(result&&result.data&&result.data.text)||''};
}
async function recognizeSession(session){
  const token=++scanToken;
  progressHandler=m=>{if(token===scanToken)onTessProgress(m)};
  openProgress('Preparing photo…',4);
  try{
    const target=session.handwriting?2200:2000;
    await new Promise(r=>setTimeout(r,20));
    if(token!==scanToken)return;
    let color=renderScanCanvas(session.bitmap,session,target);
    setScanProgress('Straightening the photo…',8);
    await new Promise(r=>setTimeout(r,20));
    const turn=cardinal(color);
    if(turn)color=rotateCanvas(color,turn);
    const angle=deskewAngle(color);
    if(angle)color=rotateCanvas(color,angle);
    if(token!==scanToken)return;
    setScanProgress('Cleaning up lighting…',12);
    await new Promise(r=>setTimeout(r,20));
    const flat=passFlatten(color);
    const binary=passSauvola(color,session.handwriting);
    const photo=canvasJpeg(fitCanvas(color,1000));
    if(!photo)throw new Error('Could not prepare that photo.');
    setScanProgress('Starting text recognition…',16);
    const worker=await getWorker();
    if(token!==scanToken)return;
    const psmA=session.handwriting?'4':'6';
    const psmB=session.handwriting?'6':'4';
    setScanProgress('Reading pass 1 of 2…',30);
    const passA=await recognizePass(worker, flat, psmA);
    if(token!==scanToken)return;
    setScanProgress('Reading pass 2 of 2…',58);
    const passB=await recognizePass(worker, binary, psmB);
    if(token!==scanToken)return;
    const passes=[passA,passB];
    let columnLines=null;
    const bestConf=Math.max(passA.confidence, passB.confidence);
    if(bestConf<85){
      const best=passA.confidence>=passB.confidence?passA:passB;
      const bestCanvas=passA.confidence>=passB.confidence?flat:binary;
      const split=splitColumns(best.words, best.width);
      if(split){
        setScanProgress('Reading the two columns…',78);
        const halves=cropColumns(bestCanvas, split.split);
        const left=await recognizePass(worker, halves[0], '6');
        if(token!==scanToken)return;
        const right=await recognizePass(worker, halves[1], '6');
        if(token!==scanToken)return;
        columnLines=left.lines.concat(right.lines);
      }else{
        setScanProgress('Reading a third pass…',78);
        const hybrid=passHybrid(color, session.handwriting);
        const passC=await recognizePass(worker, hybrid, '3');
        if(token!==scanToken)return;
        passes.push(passC);
      }
    }
    let lines=chooseLines(passes);
    if(columnLines&&columnLines.length){
      const current=lines.map(l=>l.text).join('\n');
      const alt=columnLines.map(l=>l.text).join('\n');
      if(scoreText(alt, meanConf(columnLines))>scoreText(current, meanConf(lines))+1)lines=columnLines;
    }
    let confidence=meanConf(lines);
    if(confidence<60){
      setScanProgress('Checking the other way up…',90);
      const flipped=await recognizePass(worker, rotateCanvas(flat,180), psmA);
      if(token!==scanToken)return;
      if(flipped.confidence>confidence+3){lines=flipped.lines.length?flipped.lines:linesFromWords(flipped.words); confidence=Math.max(flipped.confidence, meanConf(lines));}
    }
    const tokens=tokensFromLines(lines);
    const fixed=fixOcrText(lines.map(l=>l.text).join('\n'));
    const parsed=parseRecipeText(fixed);
    closeProgress();
    const prefill={
      title:parsed.title,
      ingredients:parsed.ingredients,
      steps:parsed.steps,
      notes:parsed.notes,
      photo,
      ocrText:fixed.trim()||'(No text recognized)',
      confidence,
      tokens
    };
    scanDraft=prefill;
    openEditor(null,prefill);
    if(!fixed.trim())toast('No text found — you can fill the recipe in yourself');
  }catch(err){
    if(token!==scanToken)return;
    const pending=workerPromise;
    workerPromise=null;
    if(pending)pending.then(w=>{try{w&&w.terminate()}catch(e){}}).catch(()=>{});
    closeProgress();
    toast(err&&err.message?err.message:'Could not read that photo');
    if(scanDraft)openEditor(null,scanDraft);
  }
}
async function onScanFile(e){
  const file=e.target.files&&e.target.files[0];
  e.target.value='';
  const picker=$('#scanPicker');
  if(picker.open)picker.close();
  if(!file)return;
  if(!isImageFile(file)){toast('Please choose an image');return}
  let bitmap;
  try{bitmap=await decodeImage(file)}catch(err){toast(err&&err.message?err.message:'Could not read that image. Try a JPEG or PNG.');return}
  const size=sourceSize(bitmap);
  if(!size.w||!size.h){toast('Could not read that image. Try a JPEG or PNG.');return}
  releaseBitmap();
  scanBitmap=bitmap;
  scanDraft=null;
  const editor=$('#editor');
  if(editor&&editor.open)editor.close();
  const session=await openCropper();
  if(!session){releaseBitmap();return}
  await recognizeSession(session);
}
async function retryScan(){
  if(!scanBitmap){toast('Choose the photo again');return}
  scanDraft=draftFromForm();
  const writing=$('#handwritingToggle').checked;
  $('#editor').close();
  $('#handwritingToggle').checked=writing;
  const session=await openCropper();
  if(!session){if(scanDraft)openEditor(null,scanDraft);return}
  await recognizeSession(session);
}
const lines=s=>s.split('\n').map(x=>x.trim()).filter(Boolean);
async function onSave(e){
  e.preventDefault(); const f=e.target;
  const typedPhoto=f.photo.value.trim();
  let photo='';
  if(typedPhoto){
    photo=safePhoto(typedPhoto);
    if(!photo){toast('Use an https image link');return}
    if(photo.length>2000){toast('That image link is too long');return}
  }
  else photo=safePhoto(f.photoData.value);
  if(photo.startsWith('data:')){
    const had=photo;
    photo=await shrinkToJpeg(photo);
    if(had&&!photo)toast('That photo was too large to keep, so the recipe was saved without it.');
  }
  const data={title:f.title.value.trim(),photo,category:f.category.value.trim(),servings:f.servings.value?+f.servings.value:'',
    prep:+f.prep.value||0,cook:+f.cook.value||0,ingredients:lines(f.ingredients.value),steps:lines(f.steps.value),notes:f.notes.value.trim(),
    tags:[...new Set(f.tags.value.split(',').map(t=>t.trim().toLowerCase()).filter(Boolean))]};
  if(!data.title)return;
  let id=f.id.value;
  if(id){
    if(!canMutate()){toast('Only the owner can edit recipes');return}
    const i=recipes.findIndex(x=>x.id===id);
    if(i<0){toast('That recipe is no longer here');return}
    recipes[i]={...recipes[i],...data};
    save();
    toast('Recipe updated');
    if(serverLive&&!rulesBlocked&&!pendingCreates.has(id)&&recipes[i].createdAt&&recipes[i].author)shareUpdate(id);
  }else{
    id=uid();
    recipes.unshift({id,...data,author:'',createdAt:0});
    save();
    toast(serverLive&&!rulesBlocked?'Recipe added':'Recipe saved on this device');
    if(serverLive&&!rulesBlocked)shareCreate(id);
    else unsynced.add(id);
  }
  $('#editor').close();
  if(location.hash===`#/recipe/${id}`)route(); else location.hash=`#/recipe/${id}`;
}
function exportJSON(){
  const blob=new Blob([JSON.stringify({site:'Mondosupreme.com',version:1,exported:new Date().toISOString(),recipes,favorites:[...favs]},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`mondosupreme-recipes-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Backup exported');
}
const LIMITS={title:200,category:80,notes:4000,line:400,lines:200,tag:40,tags:30,id:64,recipes:500};
function clipStr(v,max){
  if(typeof v==='number'&&Number.isFinite(v))v=String(v);
  if(typeof v!=='string')return '';
  return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max);
}
function clipLines(v,maxLines,maxLen){
  let arr=[];
  if(typeof v==='string')arr=v.split(/\r?\n/);
  else if(Array.isArray(v))arr=v;
  return arr.map(item=>clipStr(item,maxLen)).filter(Boolean).slice(0,maxLines);
}
function clipNum(v,min,max){
  const n=Number(v);
  if(!Number.isFinite(n)||n<min||n>max)return null;
  return Math.round(n);
}
function normalizeRecipe(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const title=clipStr(raw.title,LIMITS.title);
  if(!title)return null;
  let id=clipStr(raw.id,LIMITS.id).replace(/[^A-Za-z0-9_-]/g,'');
  if(!id)id=uid();
  const recipe={
    id,title,
    category:clipStr(raw.category,LIMITS.category),
    notes:clipStr(raw.notes,LIMITS.notes),
    ingredients:clipLines(raw.ingredients,LIMITS.lines,LIMITS.line),
    steps:clipLines(raw.steps,LIMITS.lines,LIMITS.line),
    tags:[...new Set(clipLines(Array.isArray(raw.tags)?raw.tags:(typeof raw.tags==='string'?raw.tags.split(','):[]),LIMITS.tags,LIMITS.tag).map(t=>t.toLowerCase()))],
    photo:safePhoto(raw.photo)
  };
  const servings=clipNum(raw.servings,1,999); if(servings!=null)recipe.servings=servings;
  const prep=clipNum(raw.prep,0,10000); if(prep!=null)recipe.prep=prep;
  const cook=clipNum(raw.cook,0,10000); if(cook!=null)recipe.cook=cook;
  return {recipe,favorite:raw.favorite===true};
}
function parseBackup(data){
  let arr,listed=[];
  if(Array.isArray(data))arr=data;
  else if(data&&typeof data==='object'&&Array.isArray(data.recipes)){
    arr=data.recipes;
    if(Array.isArray(data.favorites))listed=data.favorites;
  }else return null;
  const out=[],favIds=[],seen=new Set();
  for(const item of arr.slice(0,LIMITS.recipes)){
    const n=normalizeRecipe(item);
    if(!n)continue;
    if(seen.has(n.recipe.id))n.recipe.id=uid();
    seen.add(n.recipe.id);
    out.push(n.recipe);
    if(n.favorite)favIds.push(n.recipe.id);
  }
  for(const id of listed){
    const s=clipStr(id,LIMITS.id).replace(/[^A-Za-z0-9_-]/g,'');
    if(s)favIds.push(s);
  }
  if(!out.length)return null;
  return {recipes:out,favorites:favIds};
}
function importJSON(file){
  const rd=new FileReader();
  rd.onload=()=>{
    let parsed;
    try{parsed=parseBackup(JSON.parse(rd.result))}catch{parsed=null}
    if(!parsed){alert("That file isn't a valid recipe backup.");return}
    const clean=parsed.recipes.map(r=>cloneRecipe(r));
    const replace=confirm(`Import ${clean.length} recipe(s).\nOK = replace all current recipes\nCancel = merge with existing`);
    if(!serverLive||rulesBlocked){
      if(replace)recipes=clean; else{const m=new Map(recipes.map(r=>[r.id,r]));clean.forEach(r=>m.set(r.id,r));recipes=[...m.values()];}
    }else{
      const existing=new Map(recipes.map(r=>[r.id,r]));
      if(!isOwner){
        if(replace)toast('Only the owner can replace or delete recipes. New ones will be added.');
        clean.forEach(r=>{
          if(existing.has(r.id))r.id=uid();
          r.author=''; r.createdAt=0;
          recipes.unshift(r);
          shareCreate(r.id);
        });
      }else if(replace){
        const keep=new Set(clean.map(r=>r.id));
        recipes.forEach(r=>{if(!keep.has(r.id)&&r.createdAt&&r.author)shareRemove(r.id)});
        recipes=clean.map(r=>{
          const prev=existing.get(r.id);
          if(prev&&prev.author&&prev.createdAt)return {...r,author:prev.author,createdAt:prev.createdAt};
          return {...r,author:'',createdAt:0};
        });
        recipes.forEach(r=>{
          if(r.createdAt&&r.author)shareUpdate(r.id);
          else shareCreate(r.id);
        });
      }else{
        clean.forEach(r=>{
          const prev=existing.get(r.id);
          if(prev&&prev.author&&prev.createdAt){
            const merged={...prev,...r,author:prev.author,createdAt:prev.createdAt};
            const i=recipes.findIndex(x=>x.id===r.id);
            if(i>=0)recipes[i]=merged;
            shareUpdate(r.id);
          }else{
            if(prev)r.id=uid();
            r.author=''; r.createdAt=0;
            recipes.unshift(r);
            shareCreate(r.id);
          }
        });
      }
    }
    parsed.favorites.forEach(id=>{if(recipes.some(r=>r.id===id))favs.add(id)});
    save();toast(`Imported ${clean.length} recipe(s)`);location.hash='#/';route();
  };
  rd.onerror=()=>alert("That file isn't a valid recipe backup.");
  rd.readAsText(file);
}
function init(){
  if(!$('#btnAdd')||!$('#recipeForm'))return;
  load();
  heldCustoms=recipes.filter(r=>!isSample(r)).map(cloneRecipe);
  $('#yr').textContent=new Date().getFullYear();
  const ownerBtn=$('#ownerBtn');
  if(ownerBtn)ownerBtn.onclick=()=>{
    if(typeof firebase==='undefined'||!firebase.apps||!firebase.apps.length){toast('Shared sign-in is not available yet');return}
    const user=firebase.auth().currentUser;
    if(isAdminNow()){signOutOwner();return}
    $('#ownerError').hidden=true;
    $('#ownerPass').value='';
        $('#ownerDialog').showModal();
  };
  const ownerCancel=$('#ownerCancel');
  if(ownerCancel)ownerCancel.onclick=()=>$('#ownerDialog').close();
  const ownerForm=$('#ownerForm');
  if(ownerForm)ownerForm.addEventListener('submit',async e=>{
    e.preventDefault();
    $('#ownerError').hidden=true;
    try{
      await signInOwner($('#ownerEmail').value.trim(),$('#ownerPass').value);
      $('#ownerPass').value='';
      $('#ownerDialog').close();
    }catch(err){
      $('#ownerPass').value='';
      const code=String(err&&err.code||'');
      $('#ownerError').textContent=code.indexOf('invalid-credential')>=0||code.indexOf('wrong-password')>=0||code.indexOf('user-not-found')>=0
        ?'That email or password is wrong.'
        :'Could not sign in.';
      $('#ownerError').hidden=false;
    }
  });
  $('#btnAdd').onclick=()=>openEditor(null);
  $('#btnScan').onclick=()=>{$('#scanCamera').value='';$('#scanLibrary').value='';$('#scanPicker').showModal()};
  $('#scanPickerCancel').onclick=()=>$('#scanPicker').close();
  $('#scanCamera').addEventListener('change',onScanFile);
  $('#scanLibrary').addEventListener('change',onScanFile);
  $('#cropRotate').onclick=()=>{
    if(!cropSession)return;
    cropSession.rotation=(cropSession.rotation+1)%4;
    cropSession.norm={x:0.06,y:0.06,w:0.88,h:0.88};
    cropSession.corners=cornersFromNorm(cropSession.norm);
    drawCropPreview();
  };
  $('#perspectiveToggle').onchange=()=>{
    if(!cropSession)return;
    cropSession.perspective=$('#perspectiveToggle').checked;
    if(cropSession.perspective)cropSession.corners=cornersFromNorm(cropSession.norm);
    drawCropPreview();
  };
  $('#cropRead').onclick=()=>{
    if(!cropSession||!scanBitmap)return;
    finishCrop({
      bitmap:scanBitmap,
      rotation:cropSession.rotation,
      norm:{...cropSession.norm},
      perspective:!!cropSession.perspective,
      corners:(cropSession.corners||[]).map(p=>({x:p.x,y:p.y})),
      handwriting:$('#handwritingToggle').checked
    });
  };
  $('#cropCancel').onclick=()=>finishCrop(null);
  $('#scanCrop').addEventListener('cancel',e=>{e.preventDefault();finishCrop(null)});
  $('#cropBox').addEventListener('pointerdown',onCropDown);
  $('#cropBox').addEventListener('pointermove',onCropMove);
  $('#cropBox').addEventListener('pointerup',onCropUp);
  $('#cropBox').addEventListener('pointercancel',onCropUp);
  $('#quadHandles').addEventListener('pointerdown',onQuadDown);
  $('#quadHandles').addEventListener('pointermove',onQuadMove);
  $('#quadHandles').addEventListener('pointerup',onCropUp);
  $('#quadHandles').addEventListener('pointercancel',onCropUp);
  $('#scanWords').addEventListener('click',e=>{
    const btn=e.target.closest('button');
    if(btn&&btn.parentElement&&btn.parentElement.id==='scanWords')focusScanWord(btn.textContent);
  });
  $('#scanRetry').onclick=()=>{retryScan()};
  $('#scanCancel').onclick=()=>stopScan('Scan cancelled');
  $('#scanProgress').addEventListener('cancel',e=>{e.preventDefault();stopScan('Scan cancelled')});
  $('#removePhoto').onclick=()=>setPhotoField('');
  $('#cancelEdit').onclick=()=>$('#editor').close();
  $('#recipeForm').addEventListener('submit',onSave);
  $('#btnExport').onclick=exportJSON;
  $('#importFile').onchange=e=>{if(e.target.files[0])importJSON(e.target.files[0]);e.target.value=''};
  $('#search').oninput=e=>{state.q=e.target.value;renderList()};
  $('#catFilter').onchange=e=>{state.cat=e.target.value;renderList()};
  $('#tagFilter').onchange=e=>{state.tag=e.target.value;renderList()};
  $('#favFilter').onclick=e=>{state.fav=!state.fav;e.currentTarget.setAttribute('aria-pressed',state.fav);e.currentTarget.textContent=state.fav?'♥ Favorites':'♡ Favorites';renderList()};
  paintGroceryButton();
  $('#btnGrocery').onclick=openGrocery;
  $('#groceryClose').onclick=()=>$('#groceryDialog').close();
  $('#groceryAdd').onclick=()=>{
    const input=$('#groceryCustom');
    const text=input.value.trim();
    if(!text)return;
    addGroceryLines([text],null);
    input.value='';
    renderGrocery();
  };
  $('#groceryCustom').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#groceryAdd').click();}});
  $('#groceryClear').onclick=()=>{
    const data=loadGrocery();
    data.items=data.items.filter(item=>!item.checked);
    saveGrocery(data);
    renderGrocery();
  };
  $('#groceryCopy').onclick=async()=>{
    const lines=loadGrocery().items.map(item=>(item.checked?'[x] ':'[ ] ')+item.text);
    const text=lines.join('\n')||'Grocery list is empty.';
    let ok=false;
    try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(text);ok=true;}}
    catch(e){ok=false}
    if(!ok){
      const area=document.createElement('textarea');
      area.value=text;
      area.setAttribute('readonly','');
      area.className='copy-buffer';
      document.body.appendChild(area);
      area.focus();
      area.select();
      try{ok=document.execCommand('copy');}catch(err){ok=false}
      area.remove();
    }
    toast(ok?'Grocery List copied':'Could not copy Grocery List');
  };
  const fileTabs=$('#fileTabs');
  if(fileTabs)fileTabs.addEventListener('click',e=>{
    const tab=e.target.closest('[data-cat]');
    if(!tab)return;
    state.cat=tab.dataset.cat||'';
    renderList();
  });
  $('#grid').addEventListener('click',e=>{
    const fb=e.target.closest('[data-fav]'); if(fb){e.stopPropagation();toggleFav(fb.dataset.fav);renderList();return}
    if(e.target.closest('a'))return;
    const c=e.target.closest('.card'); if(c)location.hash='#/recipe/'+encodeURIComponent(c.dataset.id);
  });
  $('#grid').addEventListener('keydown',e=>{
    if(e.target.closest('a,button'))return;
    const c=e.target.closest('.card');if(c&&e.key==='Enter')location.hash='#/recipe/'+encodeURIComponent(c.dataset.id);
  });
  window.addEventListener('hashchange',route); route();
  connectRecipes();
}
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',init);
const recipeOcrApi={parseRecipeText,safePhoto,parseBackup,fixOcrText,fixOcrLine,flattenIllumination,sauvola,sauvolaWindow,suppressRuledLines,solveHomography,splitColumns,readingOrder,mergeOcrLines,linesFromWords,meanConf,scoreText,grayOf,boxBlur,stretch,paintGray,padCanvas,passFlatten,passSauvola,passHybrid,warpQuad,tokensFromLines,chooseLines,RECIPE_DICT};
if(typeof window!=='undefined'){
  window.RecipeOcr=recipeOcrApi;
  window.MONDO_SCALE={scaleLine,formatQty,groceryParts,groceryText};
}
if(typeof module!=='undefined'&&module.exports)module.exports=recipeOcrApi;
})();
