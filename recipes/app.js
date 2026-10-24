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
let recipes, favs, state={q:'',cat:'',tag:'',fav:false};
function load(){
  try{recipes=JSON.parse(localStorage.getItem(KEY));}catch{recipes=null}
  if(!Array.isArray(recipes)){recipes=SAMPLES.map(r=>({...r}));save();}
  try{favs=new Set(JSON.parse(localStorage.getItem(FKEY))||[]);}catch{favs=new Set()}
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(recipes));localStorage.setItem(FKEY,JSON.stringify([...favs]));}catch(e){toast('Could not save: storage full?')}}
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
function renderList(){
  fillFilters();
  const q=state.q.toLowerCase();
  const list=recipes.filter(r=>(!state.cat||r.category===state.cat)&&(!state.tag||(r.tags||[]).includes(state.tag))&&(!state.fav||favs.has(r.id))&&
    (!q||[r.title,r.category,r.notes,...(r.tags||[]),...(r.ingredients||[])].join(' ').toLowerCase().includes(q)));
  $('#grid').innerHTML=list.map(r=>`<article class="card" data-id="${esc(r.id)}" tabindex="0">
    ${r.sample?'<span class="sample">SAMPLE</span>':''}
    <button class="fav" data-fav="${esc(r.id)}" aria-label="Toggle favorite">${favs.has(r.id)?'♥':'♡'}</button>
    <div class="thumb">🍽️</div>
    <div class="card-body"><div class="cat">${esc(r.category||'Uncategorized')}</div><h3>${esc(r.title)}</h3>
    <div class="meta">${total(r)?`<span>⏱ ${total(r)} min</span>`:''}${r.servings?`<span>🍽 ${esc(r.servings)} servings</span>`:''}</div>
    <div class="tags">${(r.tags||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join('')}</div></div></article>`).join('');
  $('#grid').querySelectorAll('.thumb').forEach((el,i)=>paintPhoto(el,list[i].photo));
  $('#empty').hidden=list.length>0;
}
function renderDetail(id){
  const r=recipes.find(x=>x.id===id); if(!r){location.hash='#/';return}
  const v=$('#detailView');
  v.innerHTML=`<article class="detail"><div class="detail-hero">🍽️</div><div class="detail-inner">
   <div class="dbar"><a href="#/" class="btn ghost">← Back</a><button class="btn ghost" id="dFav">${favs.has(r.id)?'♥ Favorited':'♡ Favorite'}</button>
   <button class="btn ghost" id="dPrint">🖨 Print</button><button class="btn ghost" id="dEdit">✎ Edit</button><button class="btn danger" id="dDel">🗑 Delete</button></div>
   <div class="cat">${esc(r.category||'Uncategorized')}${r.sample?' · Sample recipe':''}</div><h1>${esc(r.title)}</h1>
   <div class="stats"><div class="stat"><b>${+r.prep||0} min</b><span>Prep</span></div><div class="stat"><b>${+r.cook||0} min</b><span>Cook</span></div>
   <div class="stat"><b>${total(r)} min</b><span>Total</span></div><div class="stat"><b>${esc(r.servings||'–')}</b><span>Servings</span></div></div>
   <div class="tags">${(r.tags||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join('')}</div>
   <div class="cols"><section><h2>Ingredients</h2><ul>${(r.ingredients||[]).map(i=>`<li><label><input type="checkbox"><span>${esc(i)}</span></label></li>`).join('')}</ul></section>
   <section><h2>Steps</h2><ol>${(r.steps||[]).map(s=>`<li>${esc(s)}</li>`).join('')}</ol></section></div>
   ${r.notes?`<div class="notes"><strong>Notes:</strong> ${esc(r.notes)}</div>`:''}</div></article>`;
  paintPhoto(v.querySelector('.detail-hero'),r.photo);
  $('#dFav').onclick=()=>{toggleFav(r.id);renderDetail(r.id)};
  $('#dPrint').onclick=()=>window.print();
  $('#dEdit').onclick=()=>openEditor(r);
  $('#dDel').onclick=()=>{if(confirm(`Delete "${r.title}"?`)){recipes=recipes.filter(x=>x.id!==r.id);favs.delete(r.id);save();toast('Recipe deleted');location.hash='#/'}};
}
function toggleFav(id){favs.has(id)?favs.delete(id):favs.add(id);save()}
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
  if(!text){
    $('#ocrRaw').textContent='';
    box.hidden=true;
    if(confEl)confEl.hidden=true;
    if(hint)hint.hidden=true;
    if(retry)retry.hidden=true;
    return;
  }
  $('#ocrRaw').textContent=text;
  $('#ocrDetails').open=false;
  box.hidden=false;
  if(retry)retry.hidden=!scanBitmap;
  const conf=meta&&Number(meta.confidence);
  if(confEl&&Number.isFinite(conf)){
    const n=Math.max(0,Math.min(100,Math.round(conf)));
    confEl.hidden=false;
    confEl.textContent='Read confidence: '+n+'%';
    if(hint){
      hint.hidden=n>=80;
      hint.textContent=n>=80?'':'This read is uncertain. Brighter, even light and a tighter crop help. Printed text and neat handwriting work best — cursive is often missed. Turn on Enhance for handwriting if the letters are faint, then try again.';
    }
  }else{
    if(confEl)confEl.hidden=true;
    if(hint)hint.hidden=true;
  }
}
function openEditor(r,prefill){
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
    if(prefill.ocrText)showScanReview(prefill.ocrText,{confidence:prefill.confidence});
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
const RECIPE_DICT=new Set('spaghetti garlic clove cloves olive tomato tomatoes basil crushed simmer minute minutes until dente pasta sauce serve ingredient ingredients direction directions instruction instructions method preparation note notes tip tips tablespoon tablespoons teaspoon teaspoons onion butter flour sugar pepper chicken cheese vanilla baking powder water milk fresh sliced grated canned boil warm cook toss salt'.split(' '));
function correctToken(token){
  const m=token.match(/^([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)$/);
  if(!m)return token;
  const lower=m[2].toLowerCase();
  if(lower.length<4||RECIPE_DICT.has(lower))return token;
  let hit='';
  for(const dict of RECIPE_DICT){
    if(dict.length<4||Math.abs(dict.length-lower.length)>1)continue;
    if(editDistance(lower,dict)!==1)continue;
    if(!hit)hit=dict;
    else if(dict.length===lower.length&&hit.length!==lower.length)hit=dict;
    else if(dict.length===hit.length)return token;
  }
  return hit?m[1]+hit+m[3]:token;
}
function fixOcrLine(line){
  line=line.replace(/\bfen(?=\s+minutes?\b)/gi,'ten');
  line=line.replace(/\b(\d{3,})9(?=\s+[A-Za-z]{4,})/g,'$1 g');
  line=line.replace(/\b[lI|]\/([2348])\b/g,'1/$1');
  line=line.replace(/\b(\d)\s*\/\s*(\d)\b/g,'$1/$2');
  line=line.replace(/\b[0-9OoIl|.]*[Oo][0-9OoIl|.]*\b/g,tok=>{
    if(!/\d/.test(tok))return tok;
    return tok.replace(/[Oo]/g,'0').replace(/[Il|]/g,'1');
  });
  line=line.replace(/(^|\s)([lI|])(?=\s+(?:cups?|tbsps?|tablespoons?|tsps?|teaspoons?|oz|ounces?|lbs?|pounds?|kg|mg|ml|pinch(?:es)?|cloves?|cans?)\b)/gi,'$11');
  line=line.replace(/\btbps\b/gi,'tbsp').replace(/\btps\b/gi,'tsp').replace(/\b0z\b/gi,'oz');
  return line.split(' ').map(correctToken).join(' ');
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
function binarize(canvas,handwriting){
  const w=canvas.width,h=canvas.height;
  let g=boxBlur(grayOf(canvas),w,h,1);
  g=stretch(g);
  if(handwriting){
    const blur=boxBlur(g,w,h,1);
    const sharp=new Uint8Array(g.length);
    for(let i=0;i<g.length;i++){
      let v=g[i]+0.9*(g[i]-blur[i]);
      sharp[i]=v<0?0:v>255?255:v|0;
    }
    g=sauvola(sharp,w,h,0.2);
  }else g=sauvola(g,w,h,0.34);
  return padCanvas(paintGray(g,w,h),24);
}
function orientedSize(bitmap,rotation){
  return rotation%2?{w:bitmap.height,h:bitmap.width}:{w:bitmap.width,h:bitmap.height};
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
    if(data&&data.length<=480000&&safePhoto(data))return data;
    if(quality>0.5)quality=Math.round((quality-0.08)*100)/100;
    else{
      edge=Math.round(edge*0.85);
      cur=fitCanvas(cur,edge);
    }
    if(edge<480)break;
  }
  return '';
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
  const n=cropSession.norm;
  const box=$('#cropBox');
  box.style.left=(n.x*100)+'%';
  box.style.top=(n.y*100)+'%';
  box.style.width=(n.w*100)+'%';
  box.style.height=(n.h*100)+'%';
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
  cropSession={rotation:0,norm:{x:0.03,y:0.03,w:0.94,h:0.94},resolve:null};
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
async function recognizeSession(session){
  const token=++scanToken;
  progressHandler=m=>{if(token===scanToken)onTessProgress(m)};
  openProgress('Preparing photo…',4);
  try{
    const target=session.handwriting?2500:2200;
    await new Promise(r=>setTimeout(r,20));
    if(token!==scanToken)return;
    let color=renderOrientedCrop(session.bitmap,session.rotation,session.norm,target);
    setScanProgress('Straightening the photo…',8);
    await new Promise(r=>setTimeout(r,20));
    const turn=cardinal(color);
    if(turn)color=rotateCanvas(color,turn);
    const angle=deskewAngle(color);
    if(angle)color=rotateCanvas(color,angle);
    if(token!==scanToken)return;
    setScanProgress('Cleaning up lighting…',14);
    await new Promise(r=>setTimeout(r,20));
    const ocrCanvas=binarize(color,session.handwriting);
    const photo=canvasJpeg(fitCanvas(color,1000));
    if(!photo)throw new Error('Could not prepare that photo.');
    setScanProgress('Starting text recognition…',18);
    const worker=await getWorker();
    if(token!==scanToken)return;
    try{
      await worker.setParameters({
        tessedit_pageseg_mode:session.handwriting?'4':'6',
        preserve_interword_spaces:'1',
        user_defined_dpi:'300'
      });
    }catch(e){}
    let result=await worker.recognize(ocrCanvas);
    if(token!==scanToken)return;
    let confidence=result&&result.data?Number(result.data.confidence)||0:0;
    if(confidence<75){
      setScanProgress('Checking the other way up…',90);
      const flipped=await worker.recognize(rotateCanvas(ocrCanvas,180));
      if(token!==scanToken)return;
      const confidence2=flipped&&flipped.data?Number(flipped.data.confidence)||0:0;
      if(confidence2>confidence+3){result=flipped;confidence=confidence2;}
    }
    const text=(result&&result.data&&result.data.text)||'';
    const fixed=fixOcrText(text);
    const parsed=parseRecipeText(fixed);
    closeProgress();
    const prefill={
      title:parsed.title,
      ingredients:parsed.ingredients,
      steps:parsed.steps,
      notes:parsed.notes,
      photo,
      ocrText:fixed.trim()||'(No text recognized)',
      confidence
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
function onSave(e){
  e.preventDefault(); const f=e.target;
  const typedPhoto=f.photo.value.trim();
  let photo='';
  if(typedPhoto){photo=safePhoto(typedPhoto);if(!photo){toast('Use an https image link');return}}
  else photo=safePhoto(f.photoData.value);
  const data={title:f.title.value.trim(),photo,category:f.category.value.trim(),servings:f.servings.value?+f.servings.value:'',
    prep:+f.prep.value||0,cook:+f.cook.value||0,ingredients:lines(f.ingredients.value),steps:lines(f.steps.value),notes:f.notes.value.trim(),
    tags:[...new Set(f.tags.value.split(',').map(t=>t.trim().toLowerCase()).filter(Boolean))]};
  if(!data.title)return;
  let id=f.id.value;
  if(id){const i=recipes.findIndex(x=>x.id===id);recipes[i]={...recipes[i],...data};toast('Recipe updated')}
  else{id=uid();recipes.unshift({id,...data});toast('Recipe added')}
  save(); $('#editor').close();
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
    const clean=parsed.recipes;
    const replace=confirm(`Import ${clean.length} recipe(s).\nOK = replace all current recipes\nCancel = merge with existing`);
    if(replace)recipes=clean; else{const m=new Map(recipes.map(r=>[r.id,r]));clean.forEach(r=>m.set(r.id,r));recipes=[...m.values()];}
    parsed.favorites.forEach(id=>{if(recipes.some(r=>r.id===id))favs.add(id)});
    save();toast(`Imported ${clean.length} recipe(s)`);location.hash='#/';route();
  };
  rd.onerror=()=>alert("That file isn't a valid recipe backup.");
  rd.readAsText(file);
}
function init(){
  load(); $('#yr').textContent=new Date().getFullYear();
  $('#btnAdd').onclick=()=>openEditor(null);
  $('#btnScan').onclick=()=>{$('#scanCamera').value='';$('#scanLibrary').value='';$('#scanPicker').showModal()};
  $('#scanPickerCancel').onclick=()=>$('#scanPicker').close();
  $('#scanCamera').addEventListener('change',onScanFile);
  $('#scanLibrary').addEventListener('change',onScanFile);
  $('#cropRotate').onclick=()=>{
    if(!cropSession)return;
    cropSession.rotation=(cropSession.rotation+1)%4;
    cropSession.norm={x:0.03,y:0.03,w:0.94,h:0.94};
    drawCropPreview();
  };
  $('#cropRead').onclick=()=>{
    if(!cropSession||!scanBitmap)return;
    finishCrop({bitmap:scanBitmap,rotation:cropSession.rotation,norm:{...cropSession.norm},handwriting:$('#handwritingToggle').checked});
  };
  $('#cropCancel').onclick=()=>finishCrop(null);
  $('#scanCrop').addEventListener('cancel',e=>{e.preventDefault();finishCrop(null)});
  $('#cropBox').addEventListener('pointerdown',onCropDown);
  $('#cropBox').addEventListener('pointermove',onCropMove);
  $('#cropBox').addEventListener('pointerup',onCropUp);
  $('#cropBox').addEventListener('pointercancel',onCropUp);
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
  $('#grid').addEventListener('click',e=>{
    const fb=e.target.closest('[data-fav]'); if(fb){e.stopPropagation();toggleFav(fb.dataset.fav);renderList();return}
    const c=e.target.closest('.card'); if(c)location.hash='#/recipe/'+encodeURIComponent(c.dataset.id);
  });
  $('#grid').addEventListener('keydown',e=>{const c=e.target.closest('.card');if(c&&e.key==='Enter')location.hash='#/recipe/'+encodeURIComponent(c.dataset.id)});
  window.addEventListener('hashchange',route); route();
}
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',init);
if(typeof module!=='undefined'&&module.exports)module.exports={parseRecipeText,safePhoto,parseBackup,fixOcrText};
})();
