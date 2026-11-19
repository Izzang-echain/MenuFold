/* MenuFold — compact complete-menu PNG/ZIP export, no external dependencies. */
(() => {
  'use strict';
  const W=1440, M=52, GAP=30, INNER=W-M*2, COL=(INNER-GAP*2)/3, MAX_H=3200, FOOTER=126;
  const BRAND='#e66e49', BRAND_NAME='MenuFold';
  const BG=Object.freeze({paper:'#fffdf7',rules:'#f4f3ed',category:'#faf9f4'});
  const FONT='"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", system-ui, sans-serif';
  const DEFAULT={name:'陶土',primary:'#485a55',secondary:'#5d6680',accent:'#9c4d35',ink:'#28362f',muted:'#5d6a60'};
  const string=value=>value==null?'':String(value);
  const countItems=menu=>(menu.categories||[]).reduce((n,c)=>n+(c.items||[]).length,0);
  function font(ctx,size,weight=400){ctx.font=`${Math.round(weight/100)*100} ${size}px ${FONT}`;}
  function themeFrom(value){
    const out={...DEFAULT};
    if(value&&typeof value==='object')for(const key of ['primary','secondary','accent','ink','muted'])
      if(/^#[0-9a-f]{6}$/i.test(value[key]||''))out[key]=value[key];
    return out;
  }
  function mix(a,b,amount){
    const rgb=h=>h.slice(1).match(/../g).map(x=>parseInt(x,16));const aa=rgb(a),bb=rgb(b);
    return '#'+aa.map((v,i)=>Math.round(v*amount+bb[i]*(1-amount)).toString(16).padStart(2,'0')).join('');
  }
  function emphasisParts(value){
    if(window.MenuDesign?.emphasisParts)return window.MenuDesign.emphasisParts(value);
    const text=string(value),pattern=/[$€£¥￥]\s*\d[\d,.]*|\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*(?:分钟|小时|人|份|轮|贯|件|球|片|只|串|minutes?|mins?|hours?|hrs?)/gi;
    const result=[];let at=0,match;
    while((match=pattern.exec(text))){if(match.index>at)result.push({text:text.slice(at,match.index)});result.push({text:match[0],em:true});at=pattern.lastIndex;}
    if(at<text.length)result.push({text:text.slice(at)});return result.length?result:[{text}];
  }
  function noteParts(item){
    if(window.MenuDesign?.noteParts)return window.MenuDesign.noteParts(item);
    const groups=[];
    const add=(text,em=false)=>{if(string(text).trim())groups.push({text:string(text),em});};
    add(item.description);
    add(item.price?`价格 ${item.price}`:'');
    add(item.surcharge?`加价 ${item.surcharge}`:'',true);
    add(item.availability,true);
    if((item.tags||[]).length)add(`标注：${item.tags.join(' · ')}`);
    if(item.needs_verification)add('待核对：识别存疑',true);
    const parts=[];groups.forEach((group,i)=>{if(i)parts.push({text:'；'});parts.push(group);});return parts;
  }
  function tokenize(value){
    const raw=string(value).match(/\n|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[，。！？、；：）》」』】〕〉”’]+|[^\S\n]+|[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\s，。！？、；：）》」』】〕〉”’]+/gu)||[];
    const result=[];for(const token of raw){if(result.length&&/^[，。！？、；：）》」』】〕〉”’]+$/u.test(token)&&result.at(-1)!=='\n')result[result.length-1]+=token;else result.push(token);}return result;
  }
  function measureRich(ctx,parts,width,options={}){
    const size=options.size||24,lh=options.lineHeight||Math.ceil(size*1.42),weight=options.weight||400,color=options.color||DEFAULT.ink;
    const lines=[];let runs=[],used=0;
    const flush=()=>{while(runs.length&&/^\s+$/.test(runs.at(-1).text))runs.pop();lines.push({runs,height:lh,size});runs=[];used=0;};
    const add=(text,part)=>{
      const run={text,size,weight:part.bold||part.em?700:weight,color:part.color||(part.em?options.accent:color)};
      font(ctx,size,run.weight);const w=ctx.measureText(text).width;
      if(used&&used+w>width)flush();
      if(!used&&!text.trim())return;
      const last=runs.at(-1);if(last&&last.weight===run.weight&&last.color===run.color)last.text+=text;else runs.push(run);used+=w;
    };
    for(const part of parts||[]){for(const token of tokenize(part.text)){
      if(token==='\n'){flush();continue;}
      font(ctx,size,part.bold||part.em?700:weight);
      if(ctx.measureText(token).width>width){for(const ch of Array.from(token))add(ch,part);}else add(token,part);
    }}
    if(runs.length)flush();return lines;
  }
  const gap=height=>({runs:[],height,size:0});
  const height=lines=>lines.reduce((n,line)=>n+line.height,0);

  class Layout{
    constructor(menu,theme,ctx){this.menu=menu;this.t=theme;this.measure=ctx;this.pages=[];this.references=[];this.refs=new Map();this.newPage();}
    source(value){const text=string(value).trim();if(!text)return '';if(!this.refs.has(text)){this.references.push(text);this.refs.set(text,this.references.length);}return `[${this.refs.get(text)}]`;}
    rich(parts,width=INNER,options={}){return measureRich(this.measure,parts,width,{color:this.t.ink,accent:this.t.accent,...options});}
    plain(text,width=INNER,options={}){return this.rich([{text}],width,options);}
    newPage(){
      font(this.measure,31,700);
      const logoWidth=54+Math.ceil(this.measure.measureText(BRAND_NAME).width);
      const title=this.plain(this.menu.restaurant||'未命名餐厅',INNER-logoWidth-44,{size:52,weight:700,color:this.t.primary,lineHeight:70});
      const titleHeight=Math.max(48,height(title));
      if(titleHeight>MAX_H-FOOTER-220)throw Error('餐厅名称过长，无法安全排版，请缩短名称后重试。');
      this.current={commands:[],top:40+titleHeight+42,bottom:0};this.pages.push(this.current);this.y=this.current.top;
      this.draw(title,M,40);
      this.current.commands.push({type:'logo',x:W-M-logoWidth,y:43});
      this.current.commands.push({type:'line',x:M,y:this.current.top-21,width:INNER,color:mix(this.t.primary,BG.paper,.28)});
      this.top=this.current.top;this.bottom=MAX_H-FOOTER;
    }
    draw(lines,x,y){let yy=y;for(const line of lines){let xx=x;for(const run of line.runs){this.current.commands.push({type:'text',...run,x:xx,y:yy+run.size});font(this.measure,run.size,run.weight);xx+=this.measure.measureText(run.text).width;}yy+=line.height;}this.current.bottom=Math.max(this.current.bottom,yy);return yy;}
    available(){return this.bottom-this.y;}
    flow(lines,options={}){
      const padding=options.fill?16:0;
      const pending=lines.slice();
      if(height(pending)+padding*2<=this.bottom-this.top&&height(pending)+padding*2>this.available())this.newPage();
      while(pending.length){
        if(this.available()<padding*2+Math.max(36,pending[0].height))this.newPage();
        let used=padding*2,n=0;
        while(n<pending.length&&used+pending[n].height<=this.available()){used+=pending[n].height;n++;}
        if(!n){this.newPage();continue;}
        if(options.fill)this.current.commands.push({type:'rect',x:M,y:this.y,width:INNER,height:used,fill:options.fill,stroke:options.stroke});
        this.draw(pending.splice(0,n),M+padding,this.y+padding);this.y+=used+(options.after??10);
        if(pending.length)this.newPage();
      }
    }
    prices(prices){
      const blocks=prices.map(price=>[
        ...this.plain(price.label,COL,{size:24,color:this.t.muted}),gap(3),
        ...this.plain(price.value,COL,{size:38,weight:700,color:this.t.accent}),gap(3),
        ...this.plain(price.note,COL,{size:22,color:this.t.muted}),
        ...this.plain(this.source(price.source),COL,{size:18,color:this.t.muted}),gap(12)
      ]);
      this.grid(blocks,3);this.y+=9;
    }
    // Complete blocks (a category heading + its first item) stay on one page.
    // Exceptional oversized entries flow by text line; no data is truncated.
    grid(blocks,cols=3){
      const width=(INNER-GAP*(cols-1))/cols;
      for(let row=0;row<blocks.length;row+=cols){
        const lists=blocks.slice(row,row+cols).map(block=>block.slice());
        const natural=Math.max(...lists.map(height),0);
        if(natural<=this.bottom-this.top&&natural>this.available())this.newPage();
        while(lists.some(list=>list.length)){
          if(this.available()<60)this.newPage();
          const tops=this.y,ends=[];
          for(let col=0;col<lists.length;col++){
            const lines=lists[col];let used=0,n=0;
            while(n<lines.length&&used+lines[n].height<=this.available()){used+=lines[n].height;n++;}
            if(n)this.draw(lines.splice(0,n),M+col*(width+GAP),tops);
            ends.push(tops+used);
          }
          this.y=Math.max(...ends,tops);
          if(lists.some(list=>list.length))this.newPage();
        }
      }
    }
    categoryColumns(categories){
      for(let row=0;row<categories.length;row+=3){
        const columns=categories.slice(row,row+3).map((category,index)=>this.categoryBlocks(category,row+index));
        const natural=Math.max(...columns.map(c=>c.blocks.reduce((n,b)=>n+b.height,0)),0);
        const firstRequired=Math.max(...columns.map(c=>c.blocks[0]?.height||0),0);
        if((natural<=this.bottom-this.top&&natural>this.available())||Math.min(firstRequired,this.bottom-this.top)>this.available())this.newPage();
        let continuation=false;
        while(columns.some(col=>col.blocks.length)){
          const start=this.y,ends=[];let progress=false;
          for(let col=0;col<columns.length;col++){
            const column=columns[col];if(!column.blocks.length){ends.push(start);continue;}
            const x=M+col*(COL+GAP);let yy=start;
            if(continuation){
              const first=column.blocks[0];
              if(!first.header){const head=this.categoryHeader(column.category,column.index,true);first.lines=[...head,...first.lines];first.height=height(first.lines);first.header=true;}
            }
            while(column.blocks.length){
              const block=column.blocks[0],remaining=this.bottom-yy;
              if(block.height<=remaining){this.drawCategoryBlock(block,x,yy,column.color);yy+=block.height;column.blocks.shift();progress=true;continue;}
              if(block.height<=this.bottom-this.top)break;
              let n=0,used=0;
              while(n<block.lines.length&&used+block.lines[n].height<=remaining){used+=block.lines[n].height;n++;}
              if(!n)break;
              const chunk=block.lines.splice(0,n);this.drawCategoryBlock({...block,lines:chunk,height:used},x,yy,column.color);yy+=used;block.height-=used;block.header=false;progress=true;break;
            }
            ends.push(yy);
          }
          this.y=Math.max(...ends,start);
          if(columns.some(col=>col.blocks.length)){
            if(!progress&&this.y===this.top)throw Error('菜单中的单条内容无法排版，请缩短异常字段后重试。');
            this.newPage();continuation=true;
          }
        }
        this.y+=16;
      }
    }
    categoryHeader(category,index,continued=false){
      const color=index%2?this.t.secondary:this.t.primary;
      const lines=this.plain(`${category.title||'其他菜品'}${continued?' · 续':''}  /  ${(category.items||[]).length} 道`,COL-28,{size:29,weight:700,color,lineHeight:41});
      const header={runs:[],height:height(lines)+18,size:0,categoryHeading:lines};
      return [header,gap(14)];
    }
    categoryBlocks(category,index){
      const color=index%2?this.t.secondary:this.t.primary;
      const head=this.categoryHeader(category,index),blocks=[];
      if(category.subtitle)head.push(...this.plain(category.subtitle,COL,{size:21,color:this.t.muted,lineHeight:29}),gap(8));
      const items=(category.items||[]).map(item=>{
        const main=[{text:item.order_code?item.order_code+' ':'',bold:true,color:this.t.accent},{text:item.translated_name||item.original_name||'未命名菜品',bold:true,color:this.t.ink}];
        const notes=noteParts(item),english=[{text:string(item.original_name)}];
        if(notes.length)english.push({text:'（'},...notes,{text:'）'});
        const reference=this.source(item.source);if(reference)english.push({text:' '+reference});
        const lines=[...this.rich(main,COL,{size:35,weight:700,lineHeight:48}),gap(2),...this.rich(english,COL,{size:23,color:this.t.muted,lineHeight:33}),gap(17)];
        return{lines,height:height(lines)};
      });
      if(items.length){const first=items.shift();const lines=[...head,...first.lines];blocks.push({lines,height:height(lines),header:true});blocks.push(...items);}
      else blocks.push({lines:head,height:height(head),header:true});
      return{category,index,color,blocks};
    }
    drawCategoryBlock(block,x,y,color){
      let yy=y;
      for(const line of block.lines){
        if(line.categoryHeading){
          this.current.commands.push({type:'rect',x,y:yy,width:COL,height:line.height,fill:BG.category,stroke:color});
          this.current.commands.push({type:'rect',x,y:yy,width:4,height:line.height,fill:color});
          this.draw(line.categoryHeading,x+14,yy+8);
        }else this.draw([line],x,yy);
        yy+=line.height;
      }
      this.current.bottom=Math.max(this.current.bottom,yy);
    }
    finish(){
      const total=this.pages.length,t=this.t;
      return this.pages.map((page,index)=>{
        const canvas=document.createElement('canvas');canvas.width=W;canvas.height=Math.min(MAX_H,Math.max(820,Math.ceil(page.bottom+FOOTER)));
        const ctx=canvas.getContext('2d');if(!ctx)throw Error('此浏览器不支持图片绘制。');
        ctx.fillStyle=BG.paper;ctx.fillRect(0,0,W,canvas.height);
        for(const command of page.commands){
          if(command.type==='text'){font(ctx,command.size,command.weight);ctx.fillStyle=command.color;ctx.fillText(command.text,command.x,command.y);}
          else if(command.type==='rect'){
            ctx.fillStyle=command.fill;ctx.fillRect(command.x,command.y,command.width,command.height);
            if(command.stroke){ctx.strokeStyle=command.stroke;ctx.lineWidth=1.5;ctx.strokeRect(command.x,command.y,command.width,command.height);}
          }else if(command.type==='line'){
            ctx.strokeStyle=command.color;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(command.x,command.y);ctx.lineTo(command.x+command.width,command.y);ctx.stroke();
          }else if(command.type==='logo')drawLogo(ctx,command.x,command.y);
        }
        const fy=canvas.height-85;
        ctx.strokeStyle=mix(t.primary,BG.paper,.28);ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(M,fy-15);ctx.lineTo(W-M,fy-15);ctx.stroke();
        ctx.fillStyle=this.menu.is_demo?t.accent:t.muted;font(ctx,21,500);
        ctx.fillText(this.menu.is_demo?'虚构示例 · 菜品、价格和规则仅供演示。':'AI 整理，请对照原菜单确认价格、套餐与供应限制。',M,fy+15);
        ctx.fillStyle=t.muted;font(ctx,20);ctx.fillText(`${BRAND_NAME} / ${string(this.menu.generated_at).slice(0,10)||'日期未记录'}`,M,fy+50);
        ctx.textAlign='right';ctx.fillText(`${String(index+1).padStart(2,'0')} / ${String(total).padStart(2,'0')}`,W-M,fy+50);ctx.textAlign='left';
        return canvas;
      });
    }
  }
  function drawLogo(ctx,x,y){
    ctx.save();ctx.fillStyle=BRAND;ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,42,42,10);else ctx.rect(x,y,42,42);ctx.fill();
    ctx.fillStyle='#fffaf2';ctx.beginPath();ctx.moveTo(x+8,y+23);ctx.quadraticCurveTo(x+10,y+35,x+21,y+35);ctx.quadraticCurveTo(x+32,y+35,x+34,y+23);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#fffaf2';ctx.lineWidth=2;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x+14,y+15);ctx.lineTo(x+29,y+8);ctx.moveTo(x+16,y+19);ctx.lineTo(x+32,y+12);ctx.stroke();
    font(ctx,31,700);ctx.fillStyle=BRAND;ctx.fillText(BRAND_NAME,x+54,y+32);ctx.restore();
  }
  async function render(menu,options={}){
    if(!menu||typeof menu!=='object')throw Error('还没有可导出的菜单。');
    if(document.fonts?.ready)await document.fonts.ready;
    const measure=document.createElement('canvas').getContext('2d');if(!measure)throw Error('此浏览器不支持图片绘制。');
    const out=new Layout(menu,themeFrom(options.theme),measure),t=out.t;
    if((menu.pricing||[]).length)out.prices(menu.pricing);
    if((menu.rules||[]).length){
      const lines=[];for(const rule of menu.rules){
        const label=rule.label?`${rule.label}：`:'';
        lines.push(...out.rich([...emphasisParts(label+string(rule.detail)),{text:' '+out.source(rule.source)}],INNER-32,{size:25,lineHeight:36,color:t.muted}),gap(4));
      }
      out.flow(lines,{fill:BG.rules,stroke:mix(t.primary,BG.paper,.28),after:22});
    }
    const categories=(menu.categories||[]).filter(c=>(c.items||[]).length);
    out.categoryColumns(categories);
    if(!countItems(menu))out.flow(out.plain('尚未识别到菜品，请核对菜单内容。',INNER,{size:28,color:t.accent}));
    const cov=menu.coverage||{},meta=[];
    for(const warning of menu.warnings||[])meta.push(...out.rich([{text:'请核对：'+warning,em:true}],INNER,{size:23,lineHeight:33}),gap(3));
    meta.push(...out.plain(`整理覆盖：${Number(cov.processed_pages)||0}/${Number(cov.total_pages)||0} 页/段 · ${countItems(menu)} 道已识别菜品。页数不代表人工确认无遗漏。`,INNER,{size:21,color:t.muted,lineHeight:30}),gap(3));
    for(const note of cov.notes||[])meta.push(...out.plain('覆盖说明：'+note,INNER,{size:21,color:t.muted,lineHeight:30}),gap(3));
    if(menu.source_label)meta.push(...out.plain('菜单来源：'+menu.source_label,INNER,{size:20,color:t.muted,lineHeight:29}),gap(3));
    if(out.references.length){meta.push(...out.plain('原文位置',INNER,{size:23,weight:700,color:t.primary}),gap(3));for(let i=0;i<out.references.length;i++)meta.push(...out.plain(`[${i+1}] ${out.references[i]}`,INNER,{size:19,color:t.muted,lineHeight:27}));}
    out.y+=8;out.flow(meta,{after:0});
    return out.finish();
  }
  function blobFromCanvas(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片生成失败，请重试。')), 'image/png'));
  }
  let crcTable;
  function crc32(bytes) {
    if (!crcTable) crcTable = Array.from({ length: 256 }, (_, n) => {
      let c = n; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
    });
    let crc = 0xffffffff;
    for (const b of bytes) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function makeZip(entries) {
    const encoder = new TextEncoder(), locals = [], directory = [];
    let offset = 0, centralSize = 0;
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const entry of entries) {
      const name = encoder.encode(entry.name), data = entry.data, crc = crc32(data);
      const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x800, true);
      lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true); lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true); local.set(name, 30);
      const central = new Uint8Array(46 + name.length), cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true);
      cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true); cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true); central.set(name, 46);
      locals.push(local, data); directory.push(central); offset += local.length + data.length; centralSize += central.length;
    }
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
    return new Blob([...locals, ...directory, end], { type: 'application/zip' });
  }
  async function download(canvases, filename = '我的中文菜单') {
    if (!Array.isArray(canvases) || !canvases.length) throw new Error('还没有可下载的图片。');
    const safe = string(filename).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100) || '中文菜单';
    const blobs = [];
    for (const canvas of canvases) blobs.push(await blobFromCanvas(canvas));
    let blob, name;
    if (blobs.length === 1) { blob = blobs[0]; name = `${safe}.png`; }
    else {
      const entries = [];
      for (let i = 0; i < blobs.length; i++) entries.push({ name: `${safe}_${String(i + 1).padStart(2, '0')}.png`, data: new Uint8Array(await blobs[i].arrayBuffer()) });
      blob = makeZip(entries); name = `${safe}_${blobs.length}张菜单图.zip`;
    }
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  window.MenuExport = Object.freeze({ render, download });
})();
