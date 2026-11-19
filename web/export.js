/* MenuFold — balanced single-image menu export, no external dependencies. */
(() => {
  'use strict';
  const W=1440, M=48, GAP=28, INNER=W-M*2, COL=(INNER-GAP*2)/3, MAX_H=16384, FOOTER=64;
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
    constructor(menu,theme,ctx){
      this.menu=menu;this.t=theme;this.measure=ctx;this.commands=[];this.bottom=0;
      font(this.measure,31,700,FONT_SANS);
      const logoWidth=54+Math.ceil(this.measure.measureText(BRAND_NAME).width);
      const title=this.plain(cleanText(menu.restaurant)||'未命名餐厅',INNER-logoWidth-36,{size:46,weight:700,color:theme.primary,lineHeight:61,family:FONT_SERIF});
      this.y=34+Math.max(48,height(title))+30;
      this.draw(title,M,34);this.commands.push({type:'logo',x:W-M-logoWidth,y:36});
      this.commands.push({type:'line',x:M,y:this.y-15,width:INNER,color:mix(theme.primary,BG.paper,.28)});
    }
    rich(parts,width=INNER,options={}){return measureRich(this.measure,parts,width,{color:this.t.ink,accent:this.t.accent,...options});}
    plain(text,width=INNER,options={}){return this.rich([{text}],width,options);}
    draw(lines,x,y){
      let yy=y;for(const line of lines){let xx=x;for(const run of line.runs){
        this.commands.push({type:'text',...run,x:xx,y:yy+run.size});
        font(this.measure,run.size,run.weight,run.family);xx+=this.measure.measureText(run.text).width;
      }yy+=line.height;}this.bottom=Math.max(this.bottom,yy);return yy;
    }
    prices(prices){
      // A weekday/time condition is stated once over its matching tariffs.
      // Separate conditions and one-off prices retain their own labels/notes.
      const groups=[],byNote=new Map();
      for(const price of prices){
        const note=menuNote(price.note),key=note||Symbol();
        let group=byNote.get(key);if(!group){group={note,prices:[]};groups.push(group);byNote.set(key,group);}
        group.prices.push(price);
      }
      const compactGroups=[];let loose=[];
      const flushLoose=()=>{if(loose.length){compactGroups.push({note:'',prices:loose});loose=[];}};
      for(const group of groups){if(group.note&&group.prices.length>1){flushLoose();compactGroups.push(group);}else loose.push(...group.prices);}
      flushLoose();
      const width=(INNER-GAP*2)/3;
      for(const group of compactGroups){
        const common=!!group.note;
        if(common)this.y=this.draw(this.plain(group.note,INNER,{size:20,lineHeight:27,color:this.t.muted}),M,this.y)+5;
        for(let start=0;start<group.prices.length;start+=3){
          const row=group.prices.slice(start,start+3),ends=[];
          for(let col=0;col<row.length;col++){
            const price=row[col],parts=[];
            if(cleanText(price.label))parts.push({text:cleanText(price.label)+'  ',color:this.t.primary});
            parts.push({text:cleanText(price.value),bold:true,color:this.t.accent});
            const lines=this.rich(parts,width,{size:27,lineHeight:37});
            if(!common&&menuNote(price.note))lines.push(...this.plain(menuNote(price.note),width,{size:20,lineHeight:27,color:this.t.muted}));
            ends.push(this.draw(lines,M+col*(width+GAP),this.y));
          }
          this.y=Math.max(...ends,this.y)+9;
        }
      }
      this.y+=9;
    }
    rules(rules){
      const padding=15,columnGap=30,width=(INNER-padding*2-columnGap)/2;
      const entries=[];
      for(const rule of rules){
        const detail=window.MenuDesign?.presentMenu?cleanText(rule.detail):menuNote(rule.detail);if(!detail)continue;
        const parts=[];if(rule.label)parts.push({text:cleanText(rule.label)+'：',bold:true});parts.push(...emphasisParts(detail));
        const lines=this.rich(parts,width,{size:20,lineHeight:28,color:this.t.muted});
        entries.push({lines,height:height(lines)+6});
      }
      if(!entries.length)return;
      // Keep the reading order: first half down the left, remainder on right.
      // Choose a split from measured lines, so unequal rules stay balanced.
      let split=entries.length,best=Infinity;
      const total=entries.reduce((sum,entry)=>sum+entry.height,0);let before=0;
      for(let i=1;i<=entries.length;i++){
        before+=entries[i-1].height;const cost=Math.max(before,total-before);
        if(cost<best){best=cost;split=i;}
      }
      const boxHeight=best+padding*2-6;
      this.commands.push({type:'rect',x:M,y:this.y,width:INNER,height:boxHeight,fill:BG.rules,stroke:mix(this.t.primary,BG.paper,.28)});
      let left=this.y+padding,right=left;
      entries.forEach((entry,index)=>{if(index<split)left=this.draw(entry.lines,M+padding,left)+6;else right=this.draw(entry.lines,M+padding+width+columnGap,right)+6;});
      this.y+=boxHeight+20;this.bottom=Math.max(this.bottom,this.y);
    }
    categoryHeader(category,index,continued=false){
      const color=index%2?this.t.secondary:this.t.primary;
      const lines=this.plain(`${cleanText(category.title)||'其他菜品'}${continued?' · 续':''}`,COL-24,{size:27,weight:700,color,lineHeight:36,family:FONT_SERIF});
      const result=[{runs:[],height:height(lines)+12,size:0,categoryHeading:lines},gap(10)];
      const shared=(category.shared_notes||[]).map(part=>({...part,text:menuNote(part.text)})).filter(part=>part.text);
      if(shared.length)result.push(...this.rich(shared,COL,{size:20,color:this.t.muted,lineHeight:27}),gap(8));
      if(menuNote(category.subtitle))result.push(...this.plain(menuNote(category.subtitle),COL,{size:20,color:this.t.muted,lineHeight:27}),gap(6));
      return result;
    }
    categoryBlocks(category,index){
      const header=this.categoryHeader(category,index);
      const items=(category.items||[]).map(item=>{
        const main=[{text:item.order_code?string(item.order_code)+' ':'',bold:true,color:this.t.accent,family:FONT_SANS},{text:cleanText(item.translated_name||item.original_name)||'未命名菜品',bold:true,color:this.t.primary,family:FONT_SERIF}];
        const notes=noteParts(item),english=[{text:cleanText(item.original_name)}];
        if(notes.length){
          english.push({text:'（'},...notes.map(part=>({...part})));
          english.at(-1).text+='）';
        }
        const lines=[...this.rich(main,COL,{size:32,weight:700,lineHeight:42}),...this.rich(english,COL,{size:20,color:this.t.muted,lineHeight:27}),gap(12)];
        return{lines,height:height(lines)};
      });
      const blocks=[];
      items.forEach((item,itemIndex)=>{
        const lines=itemIndex===0?[...header,...item.lines]:item.lines;
        blocks.push({lines,height:height(lines),category,index,first:itemIndex===0});
      });
      return blocks;
    }
    categoryColumns(categories){
      const blocks=categories.flatMap((category,index)=>this.categoryBlocks(category,index));
      if(!blocks.length)return;
      const top=this.y;
      // Binary-search the lowest common column height. Categories follow their
      // source order, but a long category can continue in the next column.
      const pack=limit=>{
        const columns=[[]];let used=0,previous=null;
        for(const block of blocks){
          let prefix=[];
          if(columns.at(-1).length&&used+block.height>limit){columns.push([]);used=0;}
          if(!columns.at(-1).length&&!block.first&&previous===block.index)prefix=this.categoryHeader(block.category,block.index,true);
          const addition=height(prefix)+block.height;
          if(addition>limit)return null;
          if(columns.length>3)return null;
          columns.at(-1).push({block,prefix});used+=addition;previous=block.index;
        }
        return columns;
      };
      const continuation=Math.max(...categories.map((category,index)=>height(this.categoryHeader(category,index,true))),0);
      let low=Math.max(...blocks.map(block=>block.height)),high=blocks.reduce((sum,block)=>sum+block.height,0)+continuation*2;
      while(high-low>1){const mid=Math.floor((low+high)/2);if(pack(mid))high=mid;else low=mid;}
      const columns=pack(high);if(!columns)throw Error('菜单排版失败，请重试。');
      for(let col=0;col<columns.length;col++){
        let y=top;const x=M+col*(COL+GAP);
        for(const {block,prefix} of columns[col]){
          y=this.drawCategoryLines([...prefix,...block.lines],x,y,block.index%2?this.t.secondary:this.t.primary);
        }
      }
      this.y=this.bottom;
    }
    drawCategoryLines(lines,x,y,color){
      let yy=y;
      for(const line of lines){
        if(line.categoryHeading){
          this.commands.push({type:'rect',x,y:yy,width:COL,height:line.height,fill:BG.category,stroke:color});
          this.commands.push({type:'rect',x,y:yy,width:4,height:line.height,fill:color});
          this.draw(line.categoryHeading,x+12,yy+5);
        }else this.draw([line],x,yy);
        yy+=line.height;
      }
      this.bottom=Math.max(this.bottom,yy);return yy;
    }
    finish(){
      const imageHeight=Math.max(420,Math.ceil(this.bottom+FOOTER));
      // Browser canvas limits vary; this conservative bound keeps normal long
      // restaurant menus to a single PNG without allocating a blank giant image.
      if(imageHeight>MAX_H)throw Error('菜单内容过多，暂时无法保存为一张图片。请拆分上传后重试。');
      const canvas=document.createElement('canvas');canvas.width=W;canvas.height=imageHeight;
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('此浏览器不支持图片绘制。');
      ctx.fillStyle=BG.paper;ctx.fillRect(0,0,W,canvas.height);
      for(const command of this.commands){
        if(command.type==='text'){font(ctx,command.size,command.weight,command.family);ctx.fillStyle=command.color;ctx.fillText(command.text,command.x,command.y);}
        else if(command.type==='rect'){
          ctx.fillStyle=command.fill;ctx.fillRect(command.x,command.y,command.width,command.height);
          if(command.stroke){ctx.strokeStyle=command.stroke;ctx.lineWidth=1.5;ctx.strokeRect(command.x,command.y,command.width,command.height);}
        }else if(command.type==='line'){
          ctx.strokeStyle=command.color;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(command.x,command.y);ctx.lineTo(command.x+command.width,command.y);ctx.stroke();
        }else if(command.type==='logo')drawLogo(ctx,command.x,command.y);
      }
      const fy=canvas.height-24;
      ctx.strokeStyle=mix(this.t.primary,BG.paper,.28);ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(M,fy-21);ctx.lineTo(W-M,fy-21);ctx.stroke();
      ctx.fillStyle=this.t.muted;font(ctx,18);ctx.fillText(this.menu.is_demo?`${BRAND_NAME} · 虚构示例`:BRAND_NAME,M,fy);
      return [canvas];
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
    const out=new Layout(menu,themeFrom(options.theme),measure);
    if((menu.pricing||[]).length)out.prices(menu.pricing);
    out.rules(menu.rules||[]);
    out.categoryColumns((menu.categories||[]).filter(c=>(c.items||[]).length));
    return out.finish();
  }
  function blobFromCanvas(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片生成失败，请重试。')), 'image/png'));
  }
  async function download(canvases, filename = '我的中文菜单') {
    if (!Array.isArray(canvases) || !canvases.length) throw new Error('还没有可下载的图片。');
    const safe = string(filename).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100) || '中文菜单';
    if(canvases.length!==1)throw new Error('请重新生成菜单后下载单张图片。');
    const blob=await blobFromCanvas(canvases[0]),name=`${safe}.png`;
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  window.MenuExport = Object.freeze({ render, download });
})();
