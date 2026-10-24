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
function showScanReview(text){
  const box=$('#scanReview');
  if(text){$('#ocrRaw').textContent=text;$('#ocrDetails').open=false;box.hidden=false;}
  else{$('#ocrRaw').textContent='';box.hidden=true;}
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
    if(prefill.ocrText)showScanReview(prefill.ocrText);
  }
  setPhotoField(photo);
  $('#editor').showModal();
}
const HEADER_WORD=/^(ingredients?|directions?|instructions?|steps?|method|preparation|notes?|tips?)$/i;
function sectionKind(line){
  const core=line.replace(/\([^)]*\)/g,'').replace(/[:.\s]+$/g,'').trim();
  const parts=core.split(/\s*(?:\/|&|,|\+|\band\b)\s*/i).map(s=>s.trim()).filter(Boolean);
  if(!parts.length||parts.some(p=>!HEADER_WORD.test(p)))return '';
  const w=parts[0].toLowerCase();
  if(w.startsWith('ingredient'))return 'ingredients';
  if(/^notes?$/.test(w)||/^tips?$/.test(w))return 'notes';
  return 'steps';
}
function isNumberedStep(line){return /^(?:step\s+)?\d{1,2}\s*[.):]\s+\S/i.test(line)}
function cleanStep(line){return line.replace(/^(?:step\s+)?\d{1,2}\s*[.):]\s+/i,'').trim()||line.trim()}
function isIngredientLine(line){
  if(/^[-*•·▪–—]\s+\S/.test(line))return true;
  return /^(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?|[½¼¾⅓⅔⅛])(?:\s*[a-zA-Zµ]|\s|$)/.test(line);
}
function cleanIngredient(line){return line.replace(/^[-*•·▪–—]\s+/,'').trim()}
function parseRecipeText(raw){
  const lines=String(raw||'').replace(/\u00a0/g,' ').split(/\r?\n/).map(l=>l.replace(/[ \t]+/g,' ').trim()).filter(Boolean);
  const ingredients=[],steps=[],notes=[];
  let title='',titleSet=false,mode='';
  for(const line of lines){
    const section=sectionKind(line);
    if(section){mode=section;continue}
    if(!titleSet&&!mode){title=line;titleSet=true;continue}
    if(mode==='ingredients'){ingredients.push(cleanIngredient(line));continue}
    if(mode==='steps'){steps.push(cleanStep(line));continue}
    if(mode==='notes'){notes.push(line);continue}
    if(isNumberedStep(line)){steps.push(cleanStep(line));continue}
    if(isIngredientLine(line)){ingredients.push(cleanIngredient(line));continue}
    notes.push(line);
  }
  return {title,ingredients,steps,notes:notes.join('\n')};
}
let scanToken=0,workerPromise=null,progressHandler=()=>{};
function assetURL(path){return new URL(path,document.baseURI).href}
function setScanProgress(label,pct){
  const n=Math.max(0,Math.min(100,Math.round(pct||0)));
  const status=$('#scanStatus'); if(status)status.textContent=label;
  const bar=$('#scanBar'); if(bar)bar.style.width=n+'%';
  const track=$('#scanBarTrack'); if(track)track.setAttribute('aria-valuenow',String(n));
}
function openProgress(label,pct){setScanProgress(label,pct);const dlg=$('#scanProgress');if(!dlg.open)dlg.showModal()}
function closeProgress(){const dlg=$('#scanProgress');if(dlg.open)dlg.close()}
let scanStopLock=false;
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
    'loading tesseract core':[8,20],
    'initializing tesseract':[20,32],
    'loading language traineddata':[32,70],
    'initializing api':[70,78],
    'recognizing text':[78,99]
  };
  const span=spans[m.status]||[10,90];
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
function fitSize(w,h,maxEdge){
  const longest=Math.max(w,h)||1;
  const scale=longest>maxEdge?maxEdge/longest:1;
  return {w:Math.max(1,Math.round(w*scale)),h:Math.max(1,Math.round(h*scale))};
}
function drawScaled(source,maxEdge){
  const size=sourceSize(source);
  const box=fitSize(size.w,size.h,maxEdge);
  const canvas=document.createElement('canvas');
  canvas.width=box.w;canvas.height=box.h;
  const ctx=canvas.getContext('2d',{alpha:false});
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,box.w,box.h);
  ctx.drawImage(source,0,0,box.w,box.h);
  return canvas;
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
async function preparePhoto(file){
  const img=await decodeImage(file);
  const size=sourceSize(img);
  if(!size.w||!size.h)throw new Error('Could not read that image. Try a JPEG or PNG.');
  const ocrCanvas=drawScaled(img,1600);
  let edge=1000,quality=0.72,dataUrl='';
  for(let attempt=0;attempt<6;attempt++){
    try{dataUrl=drawScaled(img,edge).toDataURL('image/jpeg',quality)}catch(e){dataUrl=''}
    if(dataUrl&&dataUrl.length<=480000)break;
    if(quality>0.5)quality=Math.round((quality-0.08)*100)/100;
    else edge=Math.round(edge*0.85);
    if(edge<480)break;
  }
  if(img.close)img.close();
  if(!dataUrl||!dataUrl.startsWith('data:image/jpeg'))throw new Error('Could not prepare that photo.');
  return {ocrCanvas,dataUrl};
}
function isImageFile(file){
  if(file.type&&file.type.startsWith('image/'))return true;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|tif|tiff)$/i.test(file.name||'');
}
async function onScanFile(e){
  const file=e.target.files&&e.target.files[0];
  e.target.value='';
  const picker=$('#scanPicker');
  if(picker.open)picker.close();
  if(!file)return;
  if(!isImageFile(file)){toast('Please choose an image');return}
  const token=++scanToken;
  progressHandler=m=>{if(token===scanToken)onTessProgress(m)};
  openProgress('Preparing photo…',4);
  try{
    const prepared=await preparePhoto(file);
    if(token!==scanToken)return;
    setScanProgress('Starting text recognition…',8);
    const worker=await getWorker();
    if(token!==scanToken)return;
    const result=await worker.recognize(prepared.ocrCanvas);
    if(token!==scanToken)return;
    const text=(result&&result.data&&result.data.text)||'';
    const parsed=parseRecipeText(text);
    closeProgress();
    openEditor(null,{
      title:parsed.title,
      ingredients:parsed.ingredients,
      steps:parsed.steps,
      notes:parsed.notes,
      photo:prepared.dataUrl,
      ocrText:text.trim()||'(No text recognized)'
    });
    if(!text.trim())toast('No text found — you can fill the recipe in yourself');
  }catch(err){
    if(token!==scanToken)return;
    const pending=workerPromise;
    workerPromise=null;
    if(pending)pending.then(w=>{try{w&&w.terminate()}catch(e){}}).catch(()=>{});
    closeProgress();
    toast(err&&err.message?err.message:'Could not read that photo');
  }
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
if(typeof module!=='undefined'&&module.exports)module.exports={parseRecipeText,safePhoto,parseBackup};
})();
