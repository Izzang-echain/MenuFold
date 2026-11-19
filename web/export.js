/* MenuFold — compact complete-menu PNG/ZIP export, no external dependencies. */
(() => {
  'use strict';
  const W=1440, M=52, GAP=30, INNER=W-M*2, COL=(INNER-GAP*2)/3, MAX_H=3200, FOOTER=82;
  const BRAND='#e66e49', BRAND_NAME='MenuFold';
  const BG=Object.freeze({paper:'#fffdf7',rules:'#f4f3ed',category:'#faf9f4'});
  const FONT_SANS='"MenuFold Sans", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", system-ui, sans-serif';
  const FONT_SERIF='"MenuFold Serif", "Songti SC", "SimSun", "Noto Serif CJK SC", "Noto Serif SC", serif';
  const DEFAULT={name:'陶土',primary:'#485a55',secondary:'#5d6680',accent:'#9c4d35',ink:'#28362f',muted:'#5d6a60'};
  const string=value=>value==null?'':String(value);
  function font(ctx,size,weight=400,family=FONT_SANS){ctx.font=`${Math.round(weight/100)*100} ${size}px ${family}`;}
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
  // Audit fields never belong on the printable menu. This fallback also keeps
  // the standalone exporter useful when the shared presentation module is absent.
  function cleanText(value){
    return string(value).replace(/\[\s*\d+(?:\s*[,，–—-]\s*\d+)*\s*\]/g,'')
      .replace(/https?:\/\/[^\s）)；;]+/gi,'').trim();
  }
  function menuNote(value){
    const diagnostic=/needs[_ ]verification|source(?:s| index)?\s*[:：]|coverage|reasoning|OCR|(?:待|需|请)核对|识别(?:存疑|不确定|失败)|无法(?:确认|识别)|未(?:提供|显示|注明|列出|识别)|推测|来源|原文位置|覆盖说明|仅供参考|not (?:visible|legible|provided|specified|shown)|no (?:data|information)|uncertain|verify|verification/i;
    const text=cleanText(value);if(!diagnostic.test(text))return text;
    return text.split(/[；;。\n]+/).map(part=>{
      const match=diagnostic.exec(part);if(!match)return part.trim();
      // Keep genuine facts even when an OCR/audit qualifier was appended in the
      // same clause. The qualifier itself must never become a printed note.
      const prefix=part.slice(0,match.index).replace(/[，,：:（(\s]+$/g,'').trim();
      const facts=part.match(/[$€£¥￥]\s*\d[\d,.]*(?:\s*\/\s*(?:份|人|人次|person|serving))?|\d+(?:\.\d+)?\s*(?:%|片|份|贯|件|球|只|串|块|个|pcs?\b|pieces?\b|servings?\b)|(?:仅限|只限|仅|限)?(?:晚餐|午餐|周末|工作日)|(?:dinner|lunch|weekends?)\s+only/gi)||[];
      const kept=prefix?[prefix]:[];for(const fact of facts)if(!kept.some(value=>value.replace(/\s/g,'').includes(fact.replace(/\s/g,''))))kept.push(fact);
      return kept.join('；');
    }).filter(Boolean).join('；');
  }
  function noteParts(item){
    if(window.MenuDesign?.noteParts)return window.MenuDesign.noteParts(item).map(part=>({...part,text:menuNote(part.text)})).filter(part=>part.text);
    const groups=[],seen=new Set();
    const add=(value,em=false)=>{const text=menuNote(value),key=text.replace(/\s+/g,'').toLowerCase();if(text&&!seen.has(key)){seen.add(key);groups.push({text,em});}};
    add(item.description);
    add(item.price);
    add(item.surcharge,true);
    add(item.availability,true);
    for(const tag of item.tags||[])add(tag);
    const parts=[];groups.forEach((group,i)=>{if(i)parts.push({text:'；'});parts.push(group);});return parts;
  }
  function tokenize(value){
    const raw=string(value).match(/\n|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[，。！？、；：）》」』】〕〉”’]+|[^\S\n]+|[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\s，。！？、；：）》」』】〕〉”’]+/gu)||[];
    const result=[];for(const token of raw){if(result.length&&/^[，。！？、；：）》」』】〕〉”’]+$/u.test(token)&&result.at(-1)!=='\n')result[result.length-1]+=token;else result.push(token);}return result;
  }
  function measureRich(ctx,parts,width,options={}){
    const size=options.size||24,lh=options.lineHeight||Math.ceil(size*1.42),weight=options.weight||400,color=options.color||DEFAULT.ink,family=options.family||FONT_SANS;
    const lines=[];let runs=[],used=0;
    const flush=()=>{while(runs.length&&/^\s+$/.test(runs.at(-1).text))runs.pop();lines.push({runs,height:lh,size});runs=[];used=0;};
    const add=(text,part)=>{
      const run={text,size,weight:part.bold||part.em?700:weight,color:part.color||(part.em?options.accent:color),family:part.family||family};
      font(ctx,size,run.weight,run.family);const w=ctx.measureText(text).width;
      if(used&&used+w>width)flush();
      if(!used&&!text.trim())return;
      const last=runs.at(-1);if(last&&last.weight===run.weight&&last.color===run.color&&last.family===run.family)last.text+=text;else runs.push(run);used+=w;
    };
    for(const part of parts||[]){for(const token of tokenize(part.text)){
      if(token==='\n'){flush();continue;}
      font(ctx,size,part.bold||part.em?700:weight,part.family||family);
      if(ctx.measureText(token).width>width){for(const ch of Array.from(token))add(ch,part);}else add(token,part);
    }}
    if(runs.length)flush();return lines;
  }
  const gap=height=>({runs:[],height,size:0});
  const height=lines=>lines.reduce((n,line)=>n+line.height,0);

  class Layout{
    constructor(menu,theme,ctx){this.menu=menu;this.t=theme;this.measure=ctx;this.pages=[];this.newPage();}
    rich(parts,width=INNER,options={}){return measureRich(this.measure,parts,width,{color:this.t.ink,accent:this.t.accent,...options});}
    plain(text,width=INNER,options={}){return this.rich([{text}],width,options);}
    newPage(){
      font(this.measure,31,700,FONT_SANS);
      const logoWidth=54+Math.ceil(this.measure.measureText(BRAND_NAME).width);
      const title=this.plain(cleanText(this.menu.restaurant)||'未命名餐厅',INNER-logoWidth-44,{size:52,weight:700,color:this.t.primary,lineHeight:70,family:FONT_SERIF});
      const titleHeight=Math.max(48,height(title));
      if(titleHeight>MAX_H-FOOTER-220)throw Error('餐厅名称过长，无法安全排版，请缩短名称后重试。');
      this.current={commands:[],top:40+titleHeight+42,bottom:0};this.pages.push(this.current);this.y=this.current.top;
      this.draw(title,M,40);
      this.current.commands.push({type:'logo',x:W-M-logoWidth,y:43});
      this.current.commands.push({type:'line',x:M,y:this.current.top-21,width:INNER,color:mix(this.t.primary,BG.paper,.28)});
      this.top=this.current.top;this.bottom=MAX_H-FOOTER;
    }
    draw(lines,x,y){let yy=y;for(const line of lines){let xx=x;for(const run of line.runs){this.current.commands.push({type:'text',...run,x:xx,y:yy+run.size});font(this.measure,run.size,run.weight,run.family);xx+=this.measure.measureText(run.text).width;}yy+=line.height;}this.current.bottom=Math.max(this.current.bottom,yy);return yy;}
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
        ...this.plain(cleanText(price.label),COL,{size:23,color:this.t.muted,lineHeight:31}),
        ...this.plain(cleanText(price.value),COL,{size:31,weight:700,color:this.t.accent,lineHeight:41}),
        ...this.plain(menuNote(price.note),COL,{size:21,color:this.t.muted,lineHeight:29}),gap(10)
      ]);
      this.grid(blocks,3);this.y+=6;
    }
    // Pricing rows stay compact; exceptionally long fields still flow safely.
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
      // Each column advances independently, so the next category fills the
      // shortest column instead of waiting for the tallest category in a row.
      let cursors=[this.y,this.y,this.y];
      const freshPage=()=>{this.newPage();cursors=[this.y,this.y,this.y];};
      const shortest=()=>cursors.indexOf(Math.min(...cursors));
      const leadingHeight=lines=>{
        let used=0;for(const line of lines){used+=line.height;if(line.runs.length&&!line.categoryLegend)return used;}return used;
      };
      for(let index=0;index<categories.length;index++){
        const column=this.categoryBlocks(categories[index],index),blocks=column.blocks;
        let col=shortest(),continued=false,needsHeader=false;
        while(blocks.length){
          const block=blocks[0],prefix=needsHeader?this.categoryHeader(column.category,index,true):[];
          const lines=[...prefix,...block.lines],needed=height(lines),remaining=this.bottom-cursors[col];
          if(needed<=remaining){
            this.drawCategoryBlock({...block,lines,height:needed},M+col*(COL+GAP),cursors[col],column.color);
            cursors[col]+=needed;blocks.shift();continued=true;needsHeader=false;
            continue;
          }
          const fullHeight=this.bottom-this.top;
          if(needed>fullHeight&&leadingHeight(lines)<=remaining){
            // A single exceptional note can span columns, but a category label
            // always stays with at least its first line of menu content.
            let n=0,used=height(prefix);
            while(n<block.lines.length&&used+block.lines[n].height<=remaining){used+=block.lines[n].height;n++;}
            this.drawCategoryBlock({...block,lines:[...prefix,...block.lines.splice(0,n)],height:used},M+col*(COL+GAP),cursors[col],column.color);
            cursors[col]+=used;
            while(block.lines.length&&!block.lines[0].runs.length&&!block.lines[0].categoryHeading)block.lines.shift();
            block.height=height(block.lines);block.header=false;
            if(!block.lines.length)blocks.shift();
            continued=true;
          }
          if(!blocks.length)break;
          const next=blocks[0],head=continued?this.categoryHeader(column.category,index,true):[];
          const candidate=[...head,...next.lines],candidateHeight=height(candidate);
          const required=candidateHeight<=fullHeight?candidateHeight:leadingHeight(candidate);
          const fit=cursors.map((y,i)=>({i,y})).filter(c=>this.bottom-c.y>=required).sort((a,b)=>a.y-b.y)[0];
          if(fit)col=fit.i;
          else{freshPage();col=0;}
          needsHeader=continued&&!next.header;
        }
        this.y=Math.max(...cursors);
      }
      this.y=Math.max(...cursors);
    }
    categoryHeader(category,index,continued=false){
      const color=index%2?this.t.secondary:this.t.primary;
      const lines=this.plain(`${cleanText(category.title)||'其他菜品'}${continued?' · 续':''}`,COL-28,{size:29,weight:700,color,lineHeight:41,family:FONT_SERIF});
      const header={runs:[],height:height(lines)+18,size:0,categoryHeading:lines};
      const shared=(category.shared_notes||[]).map(part=>({...part,text:menuNote(part.text)})).filter(part=>part.text);
      if(!shared.length)return [header,gap(14)];
      const legend=this.rich(shared,COL,{size:22,color:this.t.muted,lineHeight:31}).map(line=>({...line,categoryLegend:true}));
      return [header,gap(8),...legend,gap(10)];
    }
    categoryBlocks(category,index){
      const color=index%2?this.t.secondary:this.t.primary;
      const head=this.categoryHeader(category,index),blocks=[];
      if(menuNote(category.subtitle))head.push(...this.plain(menuNote(category.subtitle),COL,{size:21,color:this.t.muted,lineHeight:29}),gap(8));
      const items=(category.items||[]).map(item=>{
        const main=[{text:item.order_code?string(item.order_code)+' ':'',bold:true,color:this.t.accent,family:FONT_SANS},{text:cleanText(item.translated_name||item.original_name)||'未命名菜品',bold:true,color:this.t.ink,family:FONT_SERIF}];
        const notes=noteParts(item),english=[{text:cleanText(item.original_name)}];
        if(notes.length)english.push({text:'（'},...notes,{text:'）'});
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
          if(command.type==='text'){font(ctx,command.size,command.weight,command.family);ctx.fillStyle=command.color;ctx.fillText(command.text,command.x,command.y);}
          else if(command.type==='rect'){
            ctx.fillStyle=command.fill;ctx.fillRect(command.x,command.y,command.width,command.height);
            if(command.stroke){ctx.strokeStyle=command.stroke;ctx.lineWidth=1.5;ctx.strokeRect(command.x,command.y,command.width,command.height);}
          }else if(command.type==='line'){
            ctx.strokeStyle=command.color;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(command.x,command.y);ctx.lineTo(command.x+command.width,command.y);ctx.stroke();
          }else if(command.type==='logo')drawLogo(ctx,command.x,command.y);
        }
        const fy=canvas.height-30;
        ctx.strokeStyle=mix(t.primary,BG.paper,.28);ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(M,fy-23);ctx.lineTo(W-M,fy-23);ctx.stroke();
        ctx.fillStyle=t.muted;font(ctx,18);
        ctx.fillText(this.menu.is_demo?`${BRAND_NAME} · 虚构示例`:BRAND_NAME,M,fy);
        ctx.textAlign='right';ctx.fillText(`${String(index+1).padStart(2,'0')} / ${String(total).padStart(2,'0')}`,W-M,fy);ctx.textAlign='left';
        return canvas;
      });
    }
  }
  function drawLogo(ctx,x,y){
    ctx.save();ctx.fillStyle=BRAND;ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,42,42,10);else ctx.rect(x,y,42,42);ctx.fill();
    ctx.fillStyle='#fffaf2';ctx.beginPath();ctx.moveTo(x+8,y+23);ctx.quadraticCurveTo(x+10,y+35,x+21,y+35);ctx.quadraticCurveTo(x+32,y+35,x+34,y+23);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#fffaf2';ctx.lineWidth=2;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x+14,y+15);ctx.lineTo(x+29,y+8);ctx.moveTo(x+16,y+19);ctx.lineTo(x+32,y+12);ctx.stroke();
    font(ctx,31,700,FONT_SANS);ctx.fillStyle=BRAND;ctx.fillText(BRAND_NAME,x+54,y+32);ctx.restore();
  }
  function printableFontText(menu){
    // unicode-range faces load only the chunks used by the supplied text. Keep
    // every printable code point, including generated labels, without repeating
    // long menu fields or pulling source images/audit data into font requests.
    const characters=new Set(),add=value=>{for(const character of string(value))characters.add(character);};
    add(`${BRAND_NAME} · 虚构示例未命名餐厅其他菜品未命名菜品续0123456789 /：；（）`);
    add(cleanText(menu.restaurant));
    for(const price of menu.pricing||[]){add(cleanText(price.label));add(cleanText(price.value));add(menuNote(price.note));}
    for(const rule of menu.rules||[]){
      add(cleanText(rule.label));add(window.MenuDesign?.presentMenu?cleanText(rule.detail):menuNote(rule.detail));
    }
    for(const category of menu.categories||[]){
      if(!(category.items||[]).length)continue;
      add(cleanText(category.title));add(menuNote(category.subtitle));
      for(const part of category.shared_notes||[])add(menuNote(part.text));
      for(const item of category.items||[]){
        add(item.order_code);add(cleanText(item.translated_name||item.original_name));add(cleanText(item.original_name));
        for(const part of noteParts(item))add(part.text);
      }
    }
    return [...characters].join('');
  }
  async function render(menu,options={}){
    if(!menu||typeof menu!=='object')throw Error('还没有可导出的菜单。');
    if(window.MenuDesign?.presentMenu)menu=window.MenuDesign.presentMenu(menu);
    const fontText=printableFontText(menu);
    try{
      if(document.fonts?.load)await Promise.all([document.fonts.load('400 24px "MenuFold Sans"',fontText),document.fonts.load('700 35px "MenuFold Sans"',fontText),document.fonts.load('700 35px "MenuFold Serif"',fontText)]);
      if(document.fonts?.ready)await document.fonts.ready;
    }catch(error){throw Error('菜单字体加载失败，请检查网络后重试。');}
    const measure=document.createElement('canvas').getContext('2d');if(!measure)throw Error('此浏览器不支持图片绘制。');
    const out=new Layout(menu,themeFrom(options.theme),measure),t=out.t;
    if((menu.pricing||[]).length)out.prices(menu.pricing);
    if((menu.rules||[]).length){
      const lines=[];for(const rule of menu.rules){
        const detail=window.MenuDesign?.presentMenu?cleanText(rule.detail):menuNote(rule.detail);if(!detail)continue;
        const label=rule.label?`${cleanText(rule.label)}：`:'';
        lines.push(...out.rich(emphasisParts(label+detail),INNER-32,{size:22,lineHeight:31,color:t.muted}),gap(3));
      }
      if(lines.length)out.flow(lines,{fill:BG.rules,stroke:mix(t.primary,BG.paper,.28),after:18});
    }
    out.categoryColumns((menu.categories||[]).filter(c=>(c.items||[]).length));
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
