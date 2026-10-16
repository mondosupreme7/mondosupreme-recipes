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
const thumbStyle=r=>r.photo?`style="background-image:url('${esc(r.photo).replace(/'/g,'%27')}')"`:'';
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
    <div class="thumb" ${thumbStyle(r)}>${r.photo?'':'🍽️'}</div>
    <div class="card-body"><div class="cat">${esc(r.category||'Uncategorized')}</div><h3>${esc(r.title)}</h3>
    <div class="meta">${total(r)?`<span>⏱ ${total(r)} min</span>`:''}${r.servings?`<span>🍽 ${esc(r.servings)} servings</span>`:''}</div>
    <div class="tags">${(r.tags||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join('')}</div></div></article>`).join('');
  $('#empty').hidden=list.length>0;
}
function renderDetail(id){
  const r=recipes.find(x=>x.id===id); if(!r){location.hash='#/';return}
  const v=$('#detailView');
  v.innerHTML=`<article class="detail"><div class="detail-hero" ${thumbStyle(r)}>${r.photo?'':'🍽️'}</div><div class="detail-inner">
   <div class="dbar"><a href="#/" class="btn ghost">← Back</a><button class="btn ghost" id="dFav">${favs.has(r.id)?'♥ Favorited':'♡ Favorite'}</button>
   <button class="btn ghost" id="dPrint">🖨 Print</button><button class="btn ghost" id="dEdit">✎ Edit</button><button class="btn danger" id="dDel">🗑 Delete</button></div>
   <div class="cat">${esc(r.category||'Uncategorized')}${r.sample?' · Sample recipe':''}</div><h1>${esc(r.title)}</h1>
   <div class="stats"><div class="stat"><b>${+r.prep||0} min</b><span>Prep</span></div><div class="stat"><b>${+r.cook||0} min</b><span>Cook</span></div>
   <div class="stat"><b>${total(r)} min</b><span>Total</span></div><div class="stat"><b>${esc(r.servings||'–')}</b><span>Servings</span></div></div>
   <div class="tags">${(r.tags||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join('')}</div>
   <div class="cols"><section><h2>Ingredients</h2><ul>${(r.ingredients||[]).map(i=>`<li><label><input type="checkbox"><span>${esc(i)}</span></label></li>`).join('')}</ul></section>
   <section><h2>Steps</h2><ol>${(r.steps||[]).map(s=>`<li>${esc(s)}</li>`).join('')}</ol></section></div>
   ${r.notes?`<div class="notes"><strong>Notes:</strong> ${esc(r.notes)}</div>`:''}</div></article>`;
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
function openEditor(r){
  const f=$('#recipeForm'); f.reset();
  $('#formTitle').textContent=r?'Edit Recipe':'Add Recipe';
  if(r){f.id.value=r.id;f.title.value=r.title||'';f.photo.value=r.photo||'';f.category.value=r.category||'';f.servings.value=r.servings||'';
    f.prep.value=r.prep||'';f.cook.value=r.cook||'';f.ingredients.value=(r.ingredients||[]).join('\n');f.steps.value=(r.steps||[]).join('\n');
    f.notes.value=r.notes||'';f.tags.value=(r.tags||[]).join(', ');}
  else f.id.value='';
  $('#editor').showModal();
}
const lines=s=>s.split('\n').map(x=>x.trim()).filter(Boolean);
function onSave(e){
  e.preventDefault(); const f=e.target;
  const data={title:f.title.value.trim(),photo:f.photo.value.trim(),category:f.category.value.trim(),servings:f.servings.value?+f.servings.value:'',
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
function importJSON(file){
  const rd=new FileReader();
  rd.onload=()=>{try{
    const d=JSON.parse(rd.result); const arr=Array.isArray(d)?d:d.recipes;
    if(!Array.isArray(arr))throw new Error('No recipes array');
    const clean=arr.filter(r=>r&&r.title).map(r=>({...r,id:String(r.id||uid()),ingredients:[].concat(r.ingredients||[]),steps:[].concat(r.steps||[]),tags:[].concat(r.tags||[])}));
    const replace=confirm(`Import ${clean.length} recipe(s).\nOK = replace all current recipes\nCancel = merge with existing`);
    if(replace)recipes=clean; else{const m=new Map(recipes.map(r=>[r.id,r]));clean.forEach(r=>m.set(r.id,r));recipes=[...m.values()];}
    if(Array.isArray(d.favorites))d.favorites.forEach(x=>favs.add(x));
    save();toast(`Imported ${clean.length} recipe(s)`);location.hash='#/';route();
  }catch(err){alert('Import failed: '+err.message)}};
  rd.readAsText(file);
}
function init(){
  load(); $('#yr').textContent=new Date().getFullYear();
  $('#btnAdd').onclick=()=>openEditor(null);
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
document.addEventListener('DOMContentLoaded',init);
})();
