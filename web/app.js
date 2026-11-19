(() => {
  'use strict';
  const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
  const D=window.MenuDesign;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state={source:'url',files:[],menu:null,theme:0,bag:[],online:false,configured:false,provider:'deepseek',busy:false,controller:null,maxBytes:30*1024*1024,maxPages:60};
  let toastTimer,jobTimer;
  const providerName=()=>state.provider==='gemini'?'Google Gemini':'DeepSeek';
  const items=menu=>(menu?.categories||[]).flatMap(c=>c.items);
  function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4200);}
  function showError(message){$('#error').textContent=message;$('#error').hidden=false;}
  function clearError(){$('#error').hidden=true;$('#error').textContent='';}
  function partsHTML(parts){return parts.map(p=>p.em?'<strong>'+escape(p.text)+'</strong>':escape(p.text)).join('');}
  function validateMenu(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('服务没有返回有效菜单。');
    const str=(value,fallback='')=>{if(value==null)return fallback;if(typeof value!=='string'||value.length>30000)throw Error('菜单数据包含无效文字。');return value;};
    const arr=(value,max=5000)=>{if(!Array.isArray(value)||value.length>max)throw Error('菜单数据格式不正确。');return value;};
    let count=0;
    const categories=arr(raw.categories,150).map((c,ci)=>({title:str(c.title,'其他菜品'),subtitle:str(c.subtitle),items:arr(c.items).map((i,ii)=>{
      if(++count>5000)throw Error('菜单条目过多，请拆成较小的菜单后整理。');
      return {id:`${ci}-${ii}`,order_code:str(i.order_code),original_name:str(i.original_name),translated_name:str(i.translated_name),description:str(i.description),price:str(i.price),surcharge:str(i.surcharge),availability:str(i.availability),tags:arr(i.tags||[],50).map(v=>str(v)),source:str(i.source),needs_verification:i.needs_verification===true};
    })})).filter(c=>c.items.length);
    if(!count)throw Error('没有识别到菜品，请上传包含实际菜名的菜单。');
    const c=raw.coverage;if(!c||!Number.isInteger(c.total_pages)||!Number.isInteger(c.processed_pages)||c.total_pages<1||c.processed_pages<0||c.processed_pages>c.total_pages)throw Error('菜单页数信息无效，未替换当前结果。');
    return {restaurant:str(raw.restaurant,'未命名餐厅'),subtitle:str(raw.subtitle),summary:str(raw.summary),menu_type:str(raw.menu_type,'unknown'),pricing:arr(raw.pricing||[],200).map(p=>({label:str(p.label),value:str(p.value),note:str(p.note),source:str(p.source)})),rules:arr(raw.rules||[],300).map(r=>({label:str(r.label),detail:str(r.detail),source:str(r.source)})),categories,warnings:arr(raw.warnings||[],300).map(v=>str(v)),coverage:{total_pages:c.total_pages,processed_pages:c.processed_pages,notes:arr(c.notes||[],300).map(v=>str(v))},source_label:str(raw.source_label),generated_at:str(raw.generated_at),is_demo:raw.is_demo===true,usage:raw.usage&&typeof raw.usage==='object'?raw.usage:null};
  }
  function applyTheme(){
    const t=D.themes[state.theme];
    for(const [key,value] of Object.entries({heading:t.primary,accent:t.accent,rule:D.mix(t.primary,D.backgrounds.paper,.28)}))$('#menu').style.setProperty('--'+key,value);
    $('#frame').style.borderColor=D.mix(t.primary,D.backgrounds.frame,.22);
    $$('[data-category]').forEach(e=>e.style.setProperty('--cat',Number(e.dataset.category)%2?t.secondary:t.primary));
    $('#themeName').textContent=t.name;
    $('#swatches').innerHTML=[t.primary,t.secondary,t.accent].map(c=>'<i style="background:'+c+'"></i>').join('');
    $('#shuffleTheme').setAttribute('aria-label','随机切换文字与边框配色，当前'+t.name);
  }
  function randomTheme(){
    if(!state.bag.length){state.bag=D.themes.map((_,i)=>i);for(let i=state.bag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[state.bag[i],state.bag[j]]=[state.bag[j],state.bag[i]];}if(state.bag.at(-1)===state.theme)[state.bag[0],state.bag[state.bag.length-1]]=[state.bag.at(-1),state.bag[0]];}
    state.theme=state.bag.pop();applyTheme();
  }
  function renderMenu(){
    const m=state.menu;if(!m)return;const count=items(m).length;
    $('#resultBadge').textContent=m.is_demo?'虚构示例':'整理结果';$('#resultBadge').classList.toggle('real',!m.is_demo);
    $('#resultMeta').textContent=`${count} 道菜 · ${m.categories.length} 类 · 已处理 ${m.coverage.processed_pages}/${m.coverage.total_pages} 页/段`;
    const warnings=[...m.warnings];
    if(m.coverage.processed_pages<m.coverage.total_pages)warnings.unshift('本次存在未完成的页面，请对照原菜单核对遗漏。');
    $('#notices').hidden=!warnings.length;
    $('#notices').innerHTML=warnings.map(w=>'<p>↳ '+escape(w)+'</p>').join('');
    $('#sourceInfo').innerHTML='<p>来源：'+escape(m.source_label||'未记录')+'</p>'+m.coverage.notes.map(n=>'<p>'+escape(n)+'</p>').join('')+'<p>已处理页数表示完成了识别请求，不代表已人工确认没有漏菜。价格、套餐范围和存疑项目请对照原菜单。</p>';
    const originSources=[...new Set(m.categories.flatMap(c=>c.items.map(i=>i.source)).filter(Boolean))];
    if(originSources.length)$('#sourceInfo').innerHTML+='<p>菜品来源：'+originSources.map(escape).join('；')+'</p>';
    $('#menu').innerHTML=`
      <div class="menu-heading"><h3 class="restaurant">${escape(m.restaurant||'未命名餐厅')}</h3><div class="poster-logo" aria-label="MenuFold"><span class="poster-logo-icon"><svg width="23" height="23" aria-hidden="true"><use href="#bowl"/></svg></span>MenuFold</div></div>
      ${m.pricing.length?'<div class="prices">'+m.pricing.map(p=>'<div><div class="price-label">'+escape(p.label)+'</div><div class="price-value">'+escape(p.value||'未注明')+'</div><div class="price-time">'+escape(p.note)+'</div></div>').join('')+'</div>':'<div class="no-pricing">未识别到套餐或统一收费信息，请核对原菜单及各菜品价格。</div>'}
      <div class="rules">${m.rules.length?m.rules.map(r=>'<p><span class="rule-label">'+escape(r.label)+(r.label?'：':'')+'</span>'+partsHTML(D.emphasisParts(r.detail))+'</p>').join(''):'<p>菜单中未识别到明确用餐规则，请向店员确认。</p>'}</div>
      <div class="categories">${m.categories.map((c,index)=>'<section class="category" data-category="'+index+'"><h4 class="category-title">'+escape(c.title)+'<small>'+c.items.length+' 道</small></h4>'+c.items.map(i=>{
        const notes=D.noteParts(i);
        return '<div class="item"><div class="item-main">'+(i.order_code?'<span class="item-code">'+escape(i.order_code)+'</span>':'')+'<span class="item-name">'+escape(i.translated_name||i.original_name||'名称待核对')+'</span></div><div class="item-en">'+escape(i.original_name)+(notes.length?' <span class="item-note">（'+partsHTML(notes)+'）</span>':'')+'</div></div>';
      }).join('')+'</section>').join('')}</div>
      <div class="menu-footer"><span>${count} 道菜 · 中英对照 · 完整分类</span><span>${m.is_demo?'虚构示例，菜品、价格与规则仅供演示':'AI 整理，请核对原菜单；过敏原请询问店员。'}</span></div>`;
    applyTheme();$('#downloadButton').disabled=state.busy;
  }
  function setMenu(menu){state.menu=menu;clearError();renderMenu();}
  function updateService(){
    $('#serviceStatus').textContent=window.MENU_LENS_OFFLINE_PREVIEW?'免安装示例预览':!state.online?'整理服务未连接':state.configured?'可以开始整理':'识别服务尚未配置';
    $('#serviceHint').textContent=window.MENU_LENS_OFFLINE_PREVIEW?'这是离线排版预览，可换色与导出示例；真实识别请启动完整版服务。':!state.online?'请通过完整版服务打开网页；当前可以先体验示例。':!state.configured?'识别服务尚未配置密钥，可先体验示例。':`提交后菜单将发送至 ${providerName()} 识别，请勿上传无关个人资料。`;
  }
  async function readDemo(){if(window.MENU_LENS_DEMO_DATA)return JSON.parse(JSON.stringify(window.MENU_LENS_DEMO_DATA));const r=await fetch('/demo.json');if(!r.ok)throw Error('示例加载失败。');return r.json();}
  async function init(){
    applyTheme();
    const results=await Promise.allSettled([
      window.MENU_LENS_OFFLINE_PREVIEW?Promise.reject(Error('offline preview')):fetch('/api/health').then(r=>{if(!r.ok)throw Error();return r.json();}),readDemo()
    ]);
    if(results[0].status==='fulfilled'){
      const health=results[0].value;state.online=true;state.configured=health.configured===true;state.provider=health.provider==='gemini'?'gemini':'deepseek';
      if(Number.isFinite(health.max_bytes)&&health.max_bytes>0)state.maxBytes=health.max_bytes;
      if(Number.isInteger(health.max_pages)&&health.max_pages>0)state.maxPages=health.max_pages;
      $('#uploadLimits').textContent=`PDF · JPG · PNG · WEBP / 共 ${Math.round(state.maxBytes/1048576)} MB 内`;
    }
    if(results[1].status==='fulfilled'){try{setMenu(validateMenu(results[1].value));}catch(e){showError(e.message);}}
    else{$('#menu').innerHTML='<div class="empty-state">上传菜单或粘贴网址，开始整理。</div>';$('#downloadButton').disabled=true;}
    updateService();
  }
  function setSource(source){
    state.source=source;$('#urlPane').hidden=source!=='url';$('#filePane').hidden=source!=='files';
    [['#urlTab','url'],['#fileTab','files']].forEach(([s,value])=>{$(s).classList.toggle('active',source===value);$(s).setAttribute('aria-selected',String(source===value));});clearError();
  }
  function renderFiles(){
    $('#fileList').innerHTML=state.files.map((f,i)=>'<div class="file-row"><small>'+String(i+1).padStart(2,'0')+'</small><span title="'+escape(f.name)+'">'+escape(f.name)+'</span><button data-up="'+i+'" aria-label="上移 '+escape(f.name)+'" '+(i===0||state.busy?'disabled':'')+'>↑</button><button data-remove="'+i+'" aria-label="移除 '+escape(f.name)+'" '+(state.busy?'disabled':'')+'>×</button></div>').join('');
    $$('[data-remove]').forEach(b=>b.addEventListener('click',()=>{state.files.splice(Number(b.dataset.remove),1);renderFiles();}));
    $$('[data-up]').forEach(b=>b.addEventListener('click',()=>{const i=Number(b.dataset.up);[state.files[i-1],state.files[i]]=[state.files[i],state.files[i-1]];renderFiles();}));
  }
  function addFiles(incoming){
    if(state.busy)return;clearError();const list=[...incoming];
    if(list.some(f=>!(/\.(pdf|jpe?g|png|webp)$/i.test(f.name)))){showError('请选择 PDF、JPG、PNG 或 WEBP 菜单；HEIC 照片请先转成 JPG。');return;}
    if(list.some(f=>!f.size)){showError('文件中有空文件，请重新选择。');return;}
    const next=[...state.files];list.forEach(f=>{if(!next.some(x=>x.name===f.name&&x.size===f.size&&x.lastModified===f.lastModified))next.push(f);});
    if(next.length>state.maxPages||next.reduce((n,f)=>n+f.size,0)>state.maxBytes){showError(`一次最多 ${state.maxPages} 个文件，总大小不能超过 ${Math.round(state.maxBytes/1048576)} MB；PDF 总页数也有上限。`);return;}
    state.files=next;renderFiles();
  }
  function setBusy(value){
    state.busy=value;$('#jobStatus').hidden=!value;$('#staleNotice').hidden=!value||!state.menu;
    ['#analyzeButton','#urlTab','#fileTab','#urlInput','#fileInput','#demoButton'].forEach(s=>$(s).disabled=value);
    $('#downloadButton').disabled=value||!state.menu;$('#analyzeButton span:first-child').textContent=value?'正在整理…':'整理成中文菜单';renderFiles();
    if(!value)clearInterval(jobTimer);
  }
  async function analyze(){
    if(state.busy)return;clearError();const form=new FormData();
    if(state.source==='url'){
      const value=$('#urlInput').value.trim();if(!value){showError('先粘贴餐厅菜单的网址。');$('#urlInput').focus();return;}
      try{const u=new URL(/^[a-z][a-z0-9+.-]*:/i.test(value)?value:'https://'+value);if(!['http:','https:'].includes(u.protocol)||!u.hostname||u.username||u.password)throw Error();$('#urlInput').value=u.href;form.append('url',u.href);}catch{showError('请输入有效的 HTTP/HTTPS 菜单网址。');return;}
    }else{if(!state.files.length){showError('先上传一份菜单 PDF 或菜单照片。');return;}state.files.forEach(f=>form.append('files',f));}
    if(!state.online){showError(window.MENU_LENS_OFFLINE_PREVIEW?'这是离线示例预览。请启动完整版服务后使用真实菜单识别。':'未连接整理服务，请检查网站服务是否已启动。');return;}
    if(!state.configured){showError(`识别服务尚未配置 ${providerName()} API 密钥。网站管理员配置后即可使用，当前可先体验示例。`);return;}
    state.controller=new AbortController();setBusy(true);const started=Date.now();
    $('#jobDetail').textContent='长菜单按批次处理，可能需要几分钟。';
    jobTimer=setInterval(()=>$('#jobDetail').textContent=`已等待 ${Math.floor((Date.now()-started)/1000)} 秒 · 正在处理菜单，请保留页面。`,1000);
    const timeout=setTimeout(()=>state.controller?.abort('timeout'),15*60*1000);
    try{
      const response=await fetch('/api/analyze',{method:'POST',body:form,signal:state.controller.signal});
      let data;try{data=await response.json();}catch{throw Error('服务未返回有效结果，请检查服务状态后重试。');}
      if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:Array.isArray(data.detail)?data.detail.map(x=>x.msg).join('；'):'菜单整理失败，请稍后重试。');
      const menu=validateMenu(data);if(menu.is_demo)throw Error('识别接口返回了示例内容，已停止替换真实结果。');
      setMenu(menu);toast(`已整理 ${items(menu).length} 道菜，请先核对价格与规则。`);
      if(innerWidth<721)$('#result').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){
      if(state.controller?.signal.aborted)showError(state.controller.signal.reason==='timeout'?'等待超时，当前预览未更新。已经发出的 AI 请求可能仍占用额度。':'已停止等待，当前预览未更新。已经发出的 AI 请求可能仍占用额度。');
      else showError(e.message||'连接中断，请稍后重试。');
    }finally{clearTimeout(timeout);state.controller=null;setBusy(false);}
  }
  async function download(){
    if(!state.menu||state.busy)return;const b=$('#downloadButton');b.disabled=true;const original=b.textContent;b.textContent='排版中…';
    try{const canvases=await window.MenuExport.render(state.menu,{theme:D.themes[state.theme]});const name=(state.menu.restaurant||'中文菜单').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,70);await window.MenuExport.download(canvases,'MenuFold_'+name+(state.menu.is_demo?'_虚构示例':''));toast(canvases.length>1?`已生成 ${canvases.length} 张菜单图，打包下载。`:'已生成菜单图片，请查看下载列表。');}
    catch(e){toast(e.message||'图片生成失败，请重试。');}finally{b.disabled=state.busy;b.textContent=original;}
  }
  $('#urlTab').addEventListener('click',()=>setSource('url'));$('#fileTab').addEventListener('click',()=>setSource('files'));
  $('#urlInput').addEventListener('input',clearError);$('#urlInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();analyze();}});
  $('#fileInput').addEventListener('change',e=>{addFiles(e.target.files);e.target.value='';});
  const zone=$('#dropZone');['dragenter','dragover'].forEach(type=>zone.addEventListener(type,e=>{e.preventDefault();if(!state.busy)zone.classList.add('over');}));['dragleave','drop'].forEach(type=>zone.addEventListener(type,e=>{e.preventDefault();zone.classList.remove('over');}));zone.addEventListener('drop',e=>addFiles(e.dataTransfer.files));
  $('#analyzeButton').addEventListener('click',analyze);$('#cancelButton').addEventListener('click',()=>state.controller?.abort('user'));
  $('#shuffleTheme').addEventListener('click',randomTheme);$('#downloadButton').addEventListener('click',download);
  $('#demoButton').addEventListener('click',async()=>{try{setMenu(validateMenu(await readDemo()));toast('已加载虚构示例，可换色和导出。');}catch(e){showError(e.message);}});
  init();
})();
