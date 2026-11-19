/* Application integration checks using only Node's built-ins and a small DOM shim.
   These check event handling, HTML safety and request/export contracts; they do
   not claim to test browser layout, live AI recognition or real Canvas output. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'web/styles.css'), 'utf8');
const designSource = fs.readFileSync(path.join(root, 'web/design.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'web/app.js'), 'utf8');
const sample = JSON.parse(fs.readFileSync(path.join(root, 'web/demo.json'), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const escapeHTML = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const decode = value => String(value).replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, key) => {
  const named = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
  if (Object.hasOwn(named, key.toLowerCase())) return named[key.toLowerCase()];
  return String.fromCodePoint(key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10));
});
const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

function createStyle(element) {
  const values = Object.create(null);
  const record = (property, value) => {
    values[property] = String(value);
    element.ownerDocument?.styleWrites?.push({element, property, value:String(value)});
  };
  return new Proxy({
    setProperty:record,
    getPropertyValue:property => values[property] || '',
    removeProperty:property => {const old=values[property] || '';delete values[property];return old;},
    snapshot:() => ({...values})
  }, {
    get(target, property) {return property in target ? target[property] : values[property] || '';},
    set(_target, property, value) {record(property, value);return true;}
  });
}
class TextNode {
  constructor(text) {this.nodeType=3;this.textContent=String(text);this.parentNode=null;}
}
class Element {
  constructor(tag, document) {
    this.tagName=tag.toUpperCase();this.nodeType=1;this.ownerDocument=document;this.parentNode=null;
    this.children=[];this.attrs={};this.listeners={};this.style=createStyle(this);this.value='';this.files=[];
    this.hidden=false;this.disabled=false;this.checked=false;this.open=false;this.selectionStart=0;
  }
  get id(){return this.attrs.id || '';}
  set id(value){this.attrs.id=String(value);}
  get className(){return this.attrs.class || '';}
  set className(value){this.attrs.class=String(value);}
  get classList(){const element=this;return {
    add(...names){const set=new Set(element.className.split(/\s+/).filter(Boolean));names.forEach(name=>set.add(name));element.className=[...set].join(' ');},
    remove(...names){element.className=element.className.split(/\s+/).filter(name=>name&&!names.includes(name)).join(' ');},
    contains(name){return element.className.split(/\s+/).includes(name);},
    toggle(name, force){const enable=force===undefined?!this.contains(name):Boolean(force);enable?this.add(name):this.remove(name);return enable;}
  };}
  get dataset(){const data={};for(const [key,value] of Object.entries(this.attrs))if(key.startsWith('data-'))data[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;return data;}
  setAttribute(key, value){
    value=String(value);this.attrs[key]=value;
    if(key==='value')this.value=value;
    if(key==='hidden')this.hidden=true;
    if(key==='disabled')this.disabled=true;
    if(key==='checked')this.checked=true;
    if(key==='href'||key==='download')this[key]=value;
    if(key==='style')for(const declaration of value.split(';')){const index=declaration.indexOf(':');if(index>=0)this.style.setProperty(declaration.slice(0,index).trim(),declaration.slice(index+1).trim());}
  }
  getAttribute(key){return this.attrs[key]??null;}
  append(...nodes){for(let node of nodes){if(typeof node==='string')node=new TextNode(node);node.parentNode=this;this.children.push(node);}}
  appendChild(node){this.append(node);return node;}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(node=>node!==this);this.parentNode=null;}
  get textContent(){return this.children.map(child=>child.textContent).join('');}
  set textContent(text){this.replaceChildren(new TextNode(String(text)));}
  get innerHTML(){return this.children.map(serialize).join('');}
  set innerHTML(value){this.children=[];parse(String(value),this);}
  addEventListener(type, callback){(this.listeners[type]||=[]).push(callback);}
  async trigger(type, extra={}){if(this.disabled&&['click','input','change','keydown'].includes(type))return;const event={type,target:this,preventDefault(){},...extra};for(const callback of this.listeners[type]||[])await callback(event);}
  click(){if(this.tagName==='A')this.ownerDocument.downloads.push({href:this.href,name:this.download});return this.trigger('click');}
  focus(){this.ownerDocument.activeElement=this;}
  setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
  scrollIntoView(){this.ownerDocument.scrolledTo=this;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  getBoundingClientRect(){return {left:0,right:1000,top:0,bottom:1000};}
  closest(selector){let element=this;while(element){if(matches(element,selector))return element;element=element.parentNode;}return null;}
  querySelector(selector){return this.querySelectorAll(selector)[0] || null;}
  querySelectorAll(selector){
    const result=[],selectors=selector.split(',').map(value=>value.trim());
    function visit(node){for(const child of node.children||[]){if(child.nodeType!==1)continue;if(selectors.some(value=>matchesPath(child,value)))result.push(child);visit(child);}}
    visit(this);return result;
  }
}
function serialize(node){
  if(node.nodeType===3)return escapeHTML(node.textContent);
  const tag=node.tagName.toLowerCase(),attrs=Object.entries(node.attrs).map(([key,value])=>`${key}="${escapeHTML(value)}"`).join(' ');
  return `<${tag}${attrs?' '+attrs:''}>`+(VOID.has(tag)?'':node.children.map(serialize).join('')+`</${tag}>`);
}
function parse(source, parent){
  const stack=[parent];
  for(const token of source.match(/<!--[\s\S]*?-->|<![^>]*>|<[^>]+>|[^<]+/g)||[]){
    if(token.startsWith('<!--')||token.startsWith('<!'))continue;
    if(token.startsWith('</')){const tag=token.match(/^<\/\s*([\w-]+)/)?.[1]?.toUpperCase();for(let i=stack.length-1;i>0;i--)if(stack[i].tagName===tag){stack.length=i;break;}continue;}
    if(token.startsWith('<')){
      const tag=token.match(/^<\s*([\w-]+)/)?.[1];if(!tag)continue;
      const element=new Element(tag,parent.ownerDocument),attributes=token.slice(token.indexOf(tag)+tag.length).replace(/\/?\s*>$/,'');
      const pattern=/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;let match;
      while((match=pattern.exec(attributes)))element.setAttribute(match[1],decode(match[2]??match[3]??match[4]??''));
      stack.at(-1).append(element);if(!VOID.has(tag.toLowerCase())&&!token.endsWith('/>'))stack.push(element);
    }else stack.at(-1).append(new TextNode(decode(token)));
  }
  for(const textarea of parent.querySelectorAll('textarea'))textarea.value=textarea.textContent;
}
function matches(element, selector){
  if(element.nodeType!==1)return false;let source=selector;
  if(source.endsWith(':first-child')){source=source.slice(0,-12);if(element.parentNode?.children.filter(node=>node.nodeType===1)[0]!==element)return false;}
  const attrs=[];source=source.replace(/\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/g,(_,key,a,b,c)=>{attrs.push([key,a??b??c]);return '';});
  for(const [key,value]of attrs){if(element.getAttribute(key)===null)return false;if(value!==undefined&&element.getAttribute(key)!==value)return false;}
  const id=source.match(/#([\w-]+)/)?.[1];if(id&&element.id!==id)return false;
  for(const match of source.matchAll(/\.([\w-]+)/g))if(!element.classList.contains(match[1]))return false;
  const tag=source.match(/^[\w-]+/)?.[0];return !tag||element.tagName===tag.toUpperCase();
}
function matchesPath(element, selector){
  const parts=selector.split(/\s+/).filter(Boolean);if(!matches(element,parts.pop()))return false;
  let current=element.parentNode;
  while(parts.length){const target=parts.pop();while(current&&!matches(current,target))current=current.parentNode;if(!current)return false;current=current.parentNode;}
  return true;
}
class Document extends Element {
  constructor(source){super('document',null);this.ownerDocument=this;this.styleWrites=[];this.downloads=[];parse(source,this);this.body=this.querySelector('body');}
  createElement(tag){return new Element(tag,this);}
}
class TestFormData {
  constructor(){this.fields=[];}
  append(key,value){this.fields.push([String(key),value]);}
  get(key){return this.fields.find(([name])=>name===key)?.[1]??null;}
  getAll(key){return this.fields.filter(([name])=>name===key).map(([,value])=>value);}
  has(key){return this.fields.some(([name])=>name===key);}
  entries(){return this.fields.values();}
  [Symbol.iterator](){return this.entries();}
}
const response = (data, ok=true) => ({ok,json:async()=>clone(data)});
const file = (name, size=1000) => ({name,size,lastModified:1});
const dishes = menu => menu.categories.flatMap(category=>category.items);
const flush = () => new Promise(resolve=>setImmediate(resolve));
async function harness(options={}){
  const document=new Document(html),calls=[],exports=[],downloads=[];
  let analyzeHandler=options.analyze || (async()=>response({...clone(sample),restaurant:'真实识别菜单',is_demo:false}));
  const health={configured:false,provider:'deepseek',model:'deepseek-flash',max_pages:60,max_bytes:30*1024*1024,...options.health};
  const context={document,console,Blob,FormData:TestFormData,AbortController,URL,Date,Set,Map,Promise,JSON,Number,String,Array,Error,SyntaxError,Math,Object,Boolean,
    setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},innerWidth:1200,
    fetch:async(url,request)=>{
      calls.push({url,options:request});
      if(url==='/api/health'){if(options.healthError)throw Error('service offline');return response(health);}
      if(url==='/demo.json')return response(sample);
      if(url==='/api/analyze')return analyzeHandler(request);
      throw Error(`Unexpected request: ${url}`);
    },
    MenuExport:{
      render:async(menu,settings)=>{exports.push({menu:clone(menu),options:clone(settings)});return [document.createElement('canvas')];},
      download:async(canvases,name)=>downloads.push({count:canvases.length,name})
    }
  };
  context.window=context;
  if(options.offlinePreview)context.MENU_LENS_OFFLINE_PREVIEW=true;
  if(options.inlineDemo)context.MENU_LENS_DEMO_DATA=clone(sample);
  vm.createContext(context);
  vm.runInContext(designSource,context,{filename:'design.js'});
  vm.runInContext(appSource,context,{filename:'app.js'});
  await flush();
  return {document,calls,exports,downloads,context,setAnalyze(handler){analyzeHandler=handler;},q:selector=>document.querySelector(selector),qa:selector=>document.querySelectorAll(selector)};
}
let assertions=0;
function check(value,message){assert.ok(value,message);assertions++;}
function equal(actual,expected,message){assert.deepEqual(actual,expected,message);assertions++;}
function analyzeCalls(h){return h.calls.filter(call=>call.url==='/api/analyze');}
function currentTheme(h){return h.context.MenuDesign.themes.find(theme=>theme.name===h.q('#themeName').textContent);}
function noCredentials(form,message){equal([...form.entries()].map(([key])=>key).filter(key=>/key|token|model|provider/i.test(key)),[],message);}
function assertNoRemovedControls(h){
  for(const selector of ['[data-star]','[data-mode]','[data-edit]','#editMenu','#editDialog','#itemSearch','#saveJson','#importJson','#settingsDialog','#apiKey','#modelName'])check(!h.q(selector),'removed selection, editing, backup and credential controls stay absent: '+selector);
}
function backgroundState(h){
  return ['#menu','#frame','.rules','.prices','.category-title','.poster-logo','.poster-logo-icon'].map(selector=>{
    const element=h.q(selector);return {selector,background:element.style.background,backgroundColor:element.style.backgroundColor,cssBackground:element.style.getPropertyValue('background'),cssBackgroundColor:element.style.getPropertyValue('background-color')};
  });
}

(async()=>{
  check(html.indexOf('src="/design.js"')<html.indexOf('src="/app.js"'),'design module loads before application');
  const h=await harness();
  check(h.q('#urlTab').classList.contains('active')&&h.q('#urlTab').getAttribute('aria-selected')==='true','URL tab is selected by default');
  check(!h.q('#urlPane').hidden&&h.q('#filePane').hidden,'only URL pane is initially visible');
  equal(h.qa('.item').length,dishes(sample).length,'initial result shows every demo item without a 12-item cap');
  check(h.q('#resultBadge').textContent==='虚构示例'&&!h.q('#resultBadge').classList.contains('real'),'initial demo has a visible fictional badge');
  check(h.q('#menu').textContent.includes('虚构示例')&&h.q('#notices').textContent.includes('虚构'),'fictional status is also visible in the menu and notices');
  check(h.q('#sourceInfo').textContent.includes(sample.source_label),'demo source is disclosed');
  assertNoRemovedControls(h);
  await h.q('#fileTab').click();
  check(h.q('#urlPane').hidden&&!h.q('#filePane').hidden,'file tab hides URL pane');
  check(h.q('#fileTab').getAttribute('aria-selected')==='true'&&h.q('#urlTab').getAttribute('aria-selected')==='false','file/URL ARIA selection is mutually exclusive');
  await h.q('#urlTab').click();
  check(!h.q('#urlPane').hidden&&h.q('#filePane').hidden&&h.q('#urlTab').classList.contains('active')&&!h.q('#fileTab').classList.contains('active'),'returning to URL resets visible and active source consistently');
  await h.q('#analyzeButton').click();
  check(!h.q('#error').hidden&&h.q('#error').textContent.includes('网址'),'blank URL gives a clear input error');
  equal(analyzeCalls(h).length,0,'blank URL never sends a request');
  const originalMenu=h.q('#menu').innerHTML;
  h.q('#urlInput').value='https://example.com/menu';await h.q('#analyzeButton').click();
  check(h.q('#error').textContent.includes('DeepSeek API 密钥'),'unconfigured service reports missing DeepSeek credentials');
  equal(analyzeCalls(h).length,0,'missing server key never sends a real request');
  equal(h.q('#menu').innerHTML,originalMenu,'missing key preserves the explicitly marked demo');
  check(!h.q('#toast').textContent.includes('已整理'),'missing key never displays a fake success');

  const offline=await harness({healthError:true,inlineDemo:true});
  offline.q('#urlInput').value='https://example.com/menu';await offline.q('#analyzeButton').click();
  check(offline.q('#error').textContent.includes('未连接'),'offline service gives a connection error');
  equal(analyzeCalls(offline).length,0,'offline service never calls analyze');
  check(offline.q('#resultBadge').textContent==='虚构示例'&&offline.q('#menu').textContent.includes(sample.restaurant),'offline service retains the demo without relabeling it');
  const standalone=await harness({offlinePreview:true,inlineDemo:true});
  equal(standalone.calls.length,0,'embedded offline preview loads its demo without health or demo network requests');
  standalone.q('#urlInput').value='https://example.com/menu';await standalone.q('#analyzeButton').click();
  check(standalone.q('#error').textContent.includes('离线示例预览'),'standalone preview clearly refuses real recognition');
  equal(analyzeCalls(standalone).length,0,'standalone preview cannot silently fake a real analysis');

  const live=await harness({health:{configured:true}});
  check(live.q('#serviceHint').textContent.includes('DeepSeek'),'DeepSeek destination is shown for a configured DeepSeek service');
  const gemini=await harness({health:{configured:true,provider:'gemini'}});
  check(gemini.q('#serviceHint').textContent.includes('Google Gemini'),'Gemini destination is shown only when Gemini is selected');
  const real=clone(sample);real.restaurant='真实餐厅 · River Table';real.is_demo=false;real.source_label='https://example.com/real-menu';
  real.warnings=[];real.coverage.notes=[];real.pricing[0]={label:'晚间套餐',value:'$47.50 / 人',note:'周二至周日 17:00–22:00',source:'第 1 页'};
  real.rules=[{label:'限时',detail:'每桌 110 分钟，最后点单提前 15 分钟；剩食每份 $8。',source:'第 1 页'}];
  Object.assign(real.categories[0].items[0],{order_code:'A99',original_name:'Amberjack Carpaccio',translated_name:'油甘鱼薄切',description:'柚子酱口味',price:'套餐内',surcharge:'+$4 / 份',availability:'仅晚餐',needs_verification:true});
  let pendingResolve;
  live.setAnalyze(async()=>new Promise(resolve=>{pendingResolve=resolve;}));
  live.q('#urlInput').value='example.com/real-menu';
  const pending=live.q('#analyzeButton').click();
  check(live.q('#analyzeButton').disabled&&live.q('#urlTab').disabled&&live.q('#fileTab').disabled&&live.q('#downloadButton').disabled,'active job disables source changes and stale-image export');
  check(!live.q('#staleNotice').hidden&&!live.q('#jobStatus').hidden,'active job explicitly labels the visible previous result');
  const urlRequest=analyzeCalls(live).at(-1).options;
  equal(urlRequest.method,'POST','analysis uses POST');
  equal(urlRequest.body.get('url'),'https://example.com/real-menu','URL input is normalized and sent as the sole source');
  check(!urlRequest.body.has('files'),'URL submission never includes stale upload files');
  noCredentials(urlRequest.body,'browser never submits an API key, token, model or provider');
  pendingResolve(response(real));await pending;
  check(live.q('#resultBadge').textContent==='整理结果'&&live.q('#resultBadge').classList.contains('real'),'real result replaces the fictional badge');
  check(!live.q('#menu').textContent.includes('虚构示例'),'real result has no demo watermark');
  for(const text of [real.restaurant,'$47.50 / 人','周二至周日','110 分钟','$8','A99','油甘鱼薄切','Amberjack Carpaccio'])check(live.q('#menu').textContent.includes(text),'real result preserves menu field: '+text);
  check(live.qa('.rules strong').some(element=>element.textContent==='110 分钟')&&live.qa('.rules strong').some(element=>element.textContent==='$8'),'numeric time and money rules are visually emphasized');
  const note=live.q('.item-note').textContent;
  check(note.startsWith('（')&&note.endsWith('）')&&note.includes('识别存疑，请核对'),'uncertainty appears in an item-level parenthesized note');
  check(note.includes('仅晚餐')&&note.includes('+$4 / 份'),'availability and surcharge remain attached to the item');
  check(live.q('#jobStatus').hidden&&live.q('#staleNotice').hidden&&!live.q('#downloadButton').disabled,'completed job restores usable controls');

  const current=live.q('#menu').innerHTML;
  live.setAnalyze(async()=>response({detail:'DeepSeek 请求频率已达上限，请稍后重试。'},false));await live.q('#analyzeButton').click();
  equal(live.q('#menu').innerHTML,current,'backend failure preserves the last real result');
  check(live.q('#error').textContent==='DeepSeek 请求频率已达上限，请稍后重试。'&&!live.q('#error').hidden,'backend failure is shown clearly');
  check(live.q('#resultBadge').textContent==='整理结果','failed analysis never reverts a real result to demo');
  live.setAnalyze(async()=>({ok:true,json:async()=>{throw Error('invalid JSON');}}));await live.q('#analyzeButton').click();
  check(live.q('#error').textContent.includes('有效结果')&&live.q('#menu').innerHTML===current,'malformed server JSON is rejected without replacing the menu');
  live.setAnalyze(async()=>response(clone(sample)));await live.q('#analyzeButton').click();
  check(live.q('#error').textContent.includes('示例内容')&&live.q('#menu').innerHTML===current,'unexpected demo responses cannot masquerade as successful real recognition');
  live.setAnalyze(async()=>{throw Error('Network disconnected');});await live.q('#analyzeButton').click();
  check(live.q('#error').textContent==='Network disconnected'&&live.q('#menu').innerHTML===current,'network failure keeps the existing result and displays the error');

  await live.q('#fileTab').click();
  live.q('#fileInput').files=[file('first.pdf'),file('second.jpg')];await live.q('#fileInput').trigger('change');
  equal(live.qa('.file-row').length,2,'file picker lists all accepted uploads');
  live.setAnalyze(async request=>{
    equal(request.body.getAll('files').map(value=>value.name),['first.pdf','second.jpg'],'file submission preserves source order');
    check(!request.body.has('url'),'file submission excludes the previously entered URL');
    noCredentials(request.body,'file submission has no browser credentials or model setting');
    return response(real);
  });
  await live.q('#analyzeButton').click();
  await live.q('#urlTab').click();live.setAnalyze(async request=>{check(request.body.has('url')&&!request.body.has('files'),'switching back to URL ignores retained files');return response(real);});await live.q('#analyzeButton').click();
  const beforeInvalid=analyzeCalls(live).length;
  for(const url of ['javascript:alert(1)','https://user:password@example.com/menu']){live.q('#urlInput').value=url;await live.q('#analyzeButton').click();check(live.q('#error').textContent.includes('有效'),'unsafe URL format is rejected: '+url);}
  equal(analyzeCalls(live).length,beforeInvalid,'unsafe URLs never reach the backend');

  const fixedBackgrounds={page:'#f7f6f2',paper:'#fffdf7',frame:'#eceee7',rules:'#f4f3ed',category:'#faf9f4'};
  equal(clone(live.context.MenuDesign.backgrounds),fixedBackgrounds,'shared paper/frame/rules/category backgrounds use the fixed palette');
  equal(live.context.MenuDesign.brand,'#e66e49','brand orange is a separate fixed constant');
  equal(live.context.MenuDesign.themes.length,5,'there are exactly five curated themes');
  const variableNames={page:'page',paper:'paper',frame:'frame',rules:'rules-bg',category:'category-bg'};
  for(const [key,value]of Object.entries(fixedBackgrounds))check(css.includes(`--${variableNames[key]}:${value}`),'CSS shares the fixed '+key+' background');
  for(const match of css.matchAll(/(?:^|[;{])\s*background(?:-color)?\s*:\s*([^;}]+)/g))check(!/var\(\s*--(?:heading|accent|rule|cat)\s*\)/.test(match[1]),'CSS background never depends on a theme text/border variable: '+match[1]);
  check(/\.poster-logo\{[^}]*color:#e66e49\b/.test(css)&&/\.poster-logo-icon\{[^}]*background:#e66e49\b/.test(css),'poster logo text and icon background retain literal brand orange');
  const initialBackgrounds=backgroundState(live),logo=live.q('.poster-logo').innerHTML,names=new Set(),colors=new Set();
  let lastName=live.q('#themeName').textContent;
  for(let index=0;index<5;index++){
    await live.q('#shuffleTheme').click();const theme=currentTheme(live);names.add(theme.name);colors.add(live.q('#menu').style.getPropertyValue('--heading'));
    check(theme.name!==lastName,'theme shuffle avoids an immediate repeat');lastName=theme.name;
    equal(live.q('#menu').style.getPropertyValue('--heading'),theme.primary,'restaurant heading receives the selected theme primary');
    equal(live.q('#menu').style.getPropertyValue('--accent'),theme.accent,'number, amount and rule accent receives the selected theme accent');
    equal(live.qa('[data-category]').slice(0,2).map(element=>element.style.getPropertyValue('--cat')),[theme.primary,theme.secondary],'category borders alternate two distinct auxiliary theme colors');
    equal(backgroundState(live),initialBackgrounds,'shuffle changes no menu, frame, rule, category, price or logo background styles');
    equal(live.q('.poster-logo').innerHTML,logo,'shuffle leaves the orange logo markup untouched');
    await live.q('#downloadButton').click();const exported=live.exports.at(-1);
    equal(clone(exported.options.theme),clone(theme),'export receives the currently selected complete theme');
    equal(dishes(exported.menu).length,dishes(real).length,'export receives all menu items, not a selected subset');
    check(dishes(exported.menu).some(item=>item.order_code===real.categories.at(-1).items.at(-1).order_code),'last category/item survives the export contract');
    check(!Object.hasOwn(exported.options,'selectedIds')&&!Object.hasOwn(exported.options,'mode'),'export has no legacy selection or quick-mode options');
  }
  equal(names.size,5,'one shuffle cycle visits all five themes');
  equal(colors.size,5,'all five themes produce distinct heading colors');
  const forbiddenWrites=live.document.styleWrites.filter(write=>!write.element.closest('#swatches')&&/^(?:background(?:-color|Color)?|--page|--paper|--frame|--rules-bg|--category-bg|--brand|fill)$/.test(write.property));
  equal(forbiddenWrites.length,0,'application never overwrites fixed background or brand styles during rendering or shuffle');
  equal(live.downloads.length,5,'each export is delivered through the download adapter');
  assertNoRemovedControls(live);

  const unsafe=clone(real),attack='<img src=x onerror="globalThis.pwned=true"><script>bad()</script>';
  unsafe.restaurant=attack;Object.assign(unsafe.categories[0].items[0],{translated_name:attack,original_name:attack,description:attack,source:attack});unsafe.rules[0].detail=attack;unsafe.source_label=attack;
  live.q('#urlInput').value='https://example.com/unsafe';live.setAnalyze(async()=>response(unsafe));await live.q('#analyzeButton').click();
  check(live.q('.restaurant').textContent===attack&&live.q('.item-name').textContent===attack,'hostile restaurant and dish HTML survives only as literal text');
  equal(live.qa('#menu img, #menu script, #sourceInfo img, #sourceInfo script').length,0,'untrusted menu fields cannot create image or script elements');
  check(live.q('#menu').innerHTML.includes('&lt;img')&&live.q('#sourceInfo').innerHTML.includes('&lt;img'),'renderer escapes markup in menu and source metadata');
  check(!live.context.pwned,'untrusted menu data never executes');
  console.log(`PASS: ${assertions} frontend interaction assertions (minimal DOM, no browser, network or API calls).`);
})().catch(error=>{console.error(error);process.exitCode=1;});
