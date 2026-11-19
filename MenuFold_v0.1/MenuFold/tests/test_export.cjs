/* Menu export contract, layout bounds and ZIP tests. No browser or API key.
   A minimal Canvas is always used for deterministic layout checks. When
   @napi-rs/canvas is available, the final smoke test also renders real PNGs. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'web/export.js'),'utf8');
const demo=JSON.parse(fs.readFileSync(path.join(root,'web/demo.json'),'utf8'));
const copy=value=>JSON.parse(JSON.stringify(value));
const compact=value=>String(value).replace(/\s+/g,'');
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
let assertions=0;
function check(value,message){assert.ok(value,message);assertions++;}

class MockContext{
  constructor(canvas){this.canvas=canvas;this.font='400 24px sans-serif';this.fillStyle='#000';this.strokeStyle='#000';this.calls=[];this.state=[];}
  measureText(text){const size=Number(this.font.match(/([\d.]+)px/)?.[1]||24);return{width:[...String(text)].reduce((n,ch)=>n+size*(/[\u3400-\u9fff]/.test(ch)?1:/\s/.test(ch)?.28:.55),0)};}
  fillText(text,x,y){const size=Number(this.font.match(/([\d.]+)px/)?.[1]||24);this.calls.push({type:'text',text:String(text),x,y,size,color:this.fillStyle,font:this.font,align:this.textAlign});}
  fillRect(x,y,width,height){this.calls.push({type:'fill',x,y,width,height,color:this.fillStyle});}
  strokeRect(x,y,width,height){this.calls.push({type:'stroke',x,y,width,height,color:this.strokeStyle});}
  beginPath(){} moveTo(){} lineTo(){} quadraticCurveTo(){} closePath(){} rect(){} roundRect(){} fill(){} stroke(){}
  save(){this.state.push({font:this.font,fillStyle:this.fillStyle,strokeStyle:this.strokeStyle,textAlign:this.textAlign});}
  restore(){Object.assign(this,this.state.pop()||{});}
}
class MockCanvas{
  constructor(){this.width=1;this.height=1;this.ctx=new MockContext(this);}
  getContext(){return this.ctx;}
  toBlob(callback){callback(new Blob([PNG],{type:'image/png'}));}
}
function harness(real=false){
  const blobs=[],downloads=[];
  let createCanvas;
  if(real){
    try{
      const canvas=require('@napi-rs/canvas');
      for(const kind of ['Regular','Bold']){const file=`/usr/share/fonts/opentype/noto/NotoSansCJK-${kind}.ttc`;if(fs.existsSync(file))canvas.GlobalFonts.registerFromPath(file,'Noto Sans CJK SC');}
      createCanvas=()=>canvas.createCanvas(1,1);
    }catch{return null;}
  }
  const context={console,Blob,TextEncoder,Uint8Array,DataView,Date,Math,Object,Array,Set,Map,String,Number,Promise,Error,
    document:{fonts:{ready:Promise.resolve()},body:{appendChild(){}},createElement(tag){
      if(tag==='canvas')return real?createCanvas():new MockCanvas();
      return{href:'',download:'',click(){downloads.push({href:this.href,name:this.download});},remove(){}};
    }},
    URL:{createObjectURL(blob){blobs.push(blob);return'blob:'+blobs.length;},revokeObjectURL(){}},setTimeout(){return 1;}
  };
  context.window=context;vm.createContext(context);
  vm.runInContext(source,context,{filename:'export.js'});
  return{api:context.MenuExport,context,blobs,downloads};
}
const textOf=pages=>pages.flatMap(page=>page.ctx.calls.filter(c=>c.type==='text').map(c=>c.text)).join('');
function bounds(pages){
  for(const page of pages){
    check(page.width===1440&&page.height>=820&&page.height<=3200,'all canvases have bounded dimensions');
    for(const draw of page.ctx.calls.filter(c=>c.type==='text')){
      assert.ok(draw.y>=0&&draw.y<=page.height,`vertical overflow: ${draw.text.slice(0,35)} @ ${draw.y}/${page.height}`);
      if(draw.align!=='right')assert.ok(draw.x>=0&&draw.x<page.width,`horizontal start overflow: ${draw.text}`);
    }
  }
}

(async()=>{
  const h=harness();
  const first=await h.api.render(demo,{theme:{primary:'#485a55',secondary:'#5d6680',accent:'#9c4d35'}});
  bounds(first);
  const visible=compact(textOf(first));
  for(const category of demo.categories)for(const item of category.items){
    check(visible.includes(compact(item.order_code)),'all item order codes survive export');
    check(visible.includes(compact(item.original_name)),'all original item names survive export');
    check(visible.includes(compact(item.translated_name)),'all translated item names survive export');
    for(const field of ['description','price','surcharge','availability','source'])if(item[field])check(visible.includes(compact(item[field])),`${field} survives export`);
  }
  for(const rule of demo.rules)check(visible.includes(compact(rule.detail)),'all rules survive export');
  for(const warning of demo.warnings)check(visible.includes(compact(warning)),'all warnings survive export');
  for(const note of demo.coverage.notes)check(visible.includes(compact(note)),'coverage notes survive export');
  const uncertainMenu=copy(demo);
  uncertainMenu.categories[0].items[0].needs_verification=true;
  check(compact(textOf(await h.api.render(uncertainMenu))).includes('识别存疑'),'uncertain items are explicitly marked');
  check(first.some(p=>p.ctx.calls.some(c=>c.type==='text'&&c.color==='#9c4d35'&&/\$|分钟|%/.test(c.text))),'money/time rules use the emphasis color');

  const second=await h.api.render(demo,{theme:{primary:'#716255',secondary:'#5a6e65',accent:'#445f92'}});
  for(const pages of [first,second])for(const page of pages){
    const fills=page.ctx.calls.filter(c=>c.type==='fill');
    check(fills[0].color==='#fffdf7','paper background is fixed across themes');
    check(fills.filter(c=>c.width>10).every(c=>['#fffdf7','#f4f3ed','#faf9f4'].includes(c.color)),'all large-area backgrounds remain fixed');
    check(page.ctx.calls.some(c=>c.type==='text'&&c.text==='MenuFold'&&c.color==='#e66e49'),'every page keeps the fixed orange logo');
    check(page.ctx.calls.some(c=>c.type==='text'&&c.text.includes('虚构示例')),'every demo page has an explicit watermark');
  }
  check(textOf(first)!==textOf(second)||second.some(p=>p.ctx.calls.some(c=>c.color==='#445f92')),'theme updates text colors');

  const full=await h.api.render(demo,{mode:'quick',selectedIds:[]});
  check(compact(textOf(full)).includes(compact(demo.categories.at(-1).items.at(-1).original_name)),'legacy quick/selection options cannot omit menu items');

  const big=copy(demo);big.categories=[{title:'Long Category',subtitle:'',items:[]}];
  for(let i=0;i<100;i++)big.categories[0].items.push({...copy(demo.categories[0].items[0]),id:'long-'+i,order_code:'CODE-'+i,original_name:'ORIGINAL-'+i,translated_name:'菜品'+i,description:'清晰描述和套餐条件',source:'SOURCE-'+i,needs_verification:false});
  const long=await h.api.render(big);bounds(long);
  check(long.length>1,'long menus paginate');
  const longText=compact(textOf(long));
  for(let i=0;i<100;i++)check(longText.includes('ORIGINAL-'+i),'all long-menu items survive pagination');
  check(long.filter(p=>p.ctx.calls.some(c=>c.type==='text'&&c.text.includes('ORIGINAL-'))).every(p=>p.ctx.calls.some(c=>c.type==='text'&&c.text.includes('Long Category'))),'a continuing category is named on every item page');

  const oversized=copy(demo);oversized.categories=[{title:'超长单条',subtitle:'',items:[{...demo.categories[0].items[0],description:'长文'.repeat(3000)+'END_OF_OVERSIZED_ITEM'}]}];
  oversized.rules=[{label:'超长规则',detail:'规则'.repeat(2500)+'END_OF_OVERSIZED_RULE',source:'SOURCE-RULE'}];
  oversized.warnings=['警示'.repeat(1000)+'END_OF_WARNING'];
  oversized.coverage.notes=['覆盖'.repeat(600)+'END_OF_COVERAGE'];
  oversized.source_label='https://example.com/'+('longpath/'.repeat(150))+'END_OF_SOURCE';
  const special=await h.api.render(oversized);bounds(special);
  const specialText=compact(textOf(special));
  for(const marker of ['END_OF_OVERSIZED_ITEM','END_OF_OVERSIZED_RULE','END_OF_WARNING','END_OF_COVERAGE','END_OF_SOURCE'])check(specialText.includes(marker),'oversized fields flow without dropping their tail: '+marker);

  const noDishes=copy(demo);noDishes.categories=[];
  check(compact(textOf(await h.api.render(noDishes))).includes('尚未识别到菜品'),'empty menus are identified explicitly');

  await h.api.download([new MockCanvas(),new MockCanvas()],'MenuFold/测试');
  check(h.downloads.at(-1).name.endsWith('.zip'),'multiple images download as ZIP');
  const zip=new Uint8Array(await h.blobs.at(-1).arrayBuffer()),view=new DataView(zip.buffer);
  check(view.getUint32(0,true)===0x04034b50,'ZIP has a valid local header');
  let offset=0,entries=0;
  function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return(c^0xffffffff)>>>0;}
  while(view.getUint32(offset,true)===0x04034b50){
    const expected=view.getUint32(offset+14,true),length=view.getUint32(offset+18,true),nameLength=view.getUint16(offset+26,true),extraLength=view.getUint16(offset+28,true),start=offset+30+nameLength+extraLength;
    check(crc32(zip.slice(start,start+length))===expected,'every ZIP entry has a matching CRC');
    check((view.getUint16(offset+6,true)&0x800)!==0,'ZIP entry names are UTF-8');
    offset=start+length;entries++;
  }
  check(entries===2,'ZIP contains both PNG entries');
  check(view.getUint32(offset,true)===0x02014b50,'ZIP includes its central directory');
  await h.api.download([new MockCanvas()],'单张');
  check(h.downloads.at(-1).name.endsWith('.png'),'one image downloads as PNG');

  const real=harness(true);
  if(real){const pages=await real.api.render(demo);check(pages.every(p=>p.width===1440&&p.height<=3200),'real Canvas rendering respects dimensions');check(pages[0].toBuffer('image/png').length>1000,'real Canvas produces a nonempty PNG');console.log('Real Canvas smoke test passed.');}
  else console.log('Optional real Canvas smoke test skipped (@napi-rs/canvas not installed).');
  console.log(`PASS: ${assertions} export assertions, no network or API calls.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
