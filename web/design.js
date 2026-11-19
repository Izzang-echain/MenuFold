/* Fixed paper backgrounds; themes control only type and rules. */
(() => {
  'use strict';
  const backgrounds=Object.freeze({page:'#f7f6f2',paper:'#fffdf7',frame:'#eceee7',rules:'#f4f3ed',category:'#faf9f4'});
  const themes=Object.freeze([
    {name:'陶土',primary:'#485a55',secondary:'#5d6680',accent:'#9c4d35'},
    {name:'赭黄',primary:'#526673',secondary:'#6d6a5c',accent:'#946126'},
    {name:'莓红',primary:'#5a6b60',secondary:'#65677b',accent:'#984b62'},
    {name:'橄榄',primary:'#6d6478',secondary:'#4e6870',accent:'#65713d'},
    {name:'靛蓝',primary:'#716255',secondary:'#5a6e65',accent:'#445f92'}
  ].map(t=>Object.freeze({...t,ink:'#28362f',muted:'#5d6a60'})));
  function mix(color,background,amount){
    const rgb=h=>h.slice(1).match(/../g).map(v=>parseInt(v,16)),a=rgb(color),b=rgb(background);
    return '#'+a.map((v,i)=>Math.round(v*amount+b[i]*(1-amount)).toString(16).padStart(2,'0')).join('');
  }
  function emphasisParts(value){
    const text=String(value??''),pattern=/[$€£¥￥]\s*\d[\d,]*(?:\.\d+)?|\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*(?:分钟|小时|份|人|次|片|贯|只|天)|\b\d{1,2}:\d{2}\b/g;
    const parts=[];let last=0;
    for(const match of text.matchAll(pattern)){if(match.index>last)parts.push({text:text.slice(last,match.index)});parts.push({text:match[0],em:true});last=match.index+match[0].length;}
    if(last<text.length)parts.push({text:text.slice(last)});
    return parts.length?parts:[{text}];
  }
  const text=value=>String(value??'').replace(/\s+/g,' ').trim();
  const noteKey=value=>{
    const key=text(value).toLowerCase().replace(/^(?:价格|售价)\s*[:：]?\s*/,'').replace(/^(?:加价|另加|加收|加购|追加|附加)\s*[:：]?\s*[+＋]?\s*/,'+').replace(/＋/g,'+').replace(/[\s，,。;；!！?？“”‘’"'（）()·_]/g,'').replace(/\.+$/,'');
    return /^(?:new|新品|新款)$/.test(key)?'new':/^(?:seasonal|季节性?供应)$/.test(key)?'seasonal':key;
  };
  function noteClauses(value){
    // Split complete clauses, never at decimal points or thousands separators.
    return text(value).split(/[。；;!?！？\n]+|[，,](?!\d)|\.(?=\s+[A-Za-z\u4e00-\u9fff]|$)/).map(text).filter(Boolean);
  }
  function diagnosticClause(value){
    return /^(?:[-—–]+|未知|不详|暂无|无|未标注|未注明|未说明|未提供|未识别|未显示|待确认|待核对|待核实|N\/?A|unknown|not\s+(?:specified|provided|shown))$/i.test(value)
      || /^(?:未|没有)(?:标明|说明|提供|注明|标注|显示|给出|列出|识别|写|用文字(?:说明|标注)|能确认|能确定)/.test(value)
      || /^(?:价格|售价|份量|分量|容量|配料|原料|食材|编号|辣度|口味|时段|套餐条件)(?:均|尚|暂)?(?:未标明|未说明|未提供|未注明|未标注|未知|不详|需询问|需咨询)/.test(value)
      || /^(?:本|此|先前|上一)(?:次|批次|批|页|页面|图片|段)(?:中|内)?[^。；;]*(?:未|没有|识别|出现|提取|覆盖|列出)/.test(value)
      || /^(?:图片显示|图中可见|从图片来看|图片中|照片显示|看图|据图|由图片|根据图片|菜单中文标注|菜单上标注)/.test(value)
      || /^(?:菜单|原菜单|原文|图中|图片|照片|页面|截图|原图|该页)(?:中|上)?[^。；;]*(?:仅写|只写|仅列|只列|未提供|未说明|未写|没有|未标|无法|看不|不清|不明确|显示|展示|可见|推测|似为|标注为|标示为)/.test(value)
      || /^(?:来源|识别结果|识别说明|翻译说明|置信度|OCR|source|needs_verification)\s*[:：]/i.test(value)
      || /^(?:第\s*\d+\s*页|page\s*\d+)(?:\s*[/·-]\s*(?:第?\s*\d+\s*页?|page\s*\d+))*$/i.test(value)
      || /(?:识别|翻译|名称)(?:存疑|不清|不确定)|(?:需|待)(?:进一步)?(?:人工)?(?:核对|核实|确认)|^请(?:核对|核实|确认)(?:原|菜|图|价|名)|^请(?:向|咨询|询问).*(?:店员|服务员|餐厅)/.test(value)
      || /^(?:menu|image|photo|source|this\s+batch)\b.*(?:shows?|states?|only|not|missing|unclear|unreadable|identified|recogniz|verif)/i.test(value);
  }
  function cleanNote(value,names=[]){
    const nameKeys=new Set(names.map(noteKey).filter(Boolean)),seen=new Set(),result=[];
    let source=String(value??'').replace(/[ \t\r]+/g,' ').trim().replace(/[（(]([^（）()]*)[）)]/g,(whole,inside)=>diagnosticClause(text(inside))?'':whole);
    const clauses=[];
    for(let sentence of source.split(/[。；;!?！？\n]+|\.(?=\s+[A-Za-z\u4e00-\u9fff]|$)/).map(text).filter(Boolean)){
      sentence=sentence.replace(/^菜单(?:上)?标(?:注|示)为[“"‘']?(?:新品|新款|new)[”"’']?$/i,'新品');
      // An explicit printed fact can retain its ingredient, amount or timing
      // while its source-introduction is removed. Visual guesses are omitted.
      sentence=sentence.replace(/^(?:菜单(?:上)?(?:明确)?(?:标注|标示|注明|写明))\s*(?:为|[:：])\s*/,'').replace(/^(?:原文|印刷说明|印刷文字)\s*[:：]\s*/,'').replace(/^菜单(?:上)?(?:明确)?(?:标注|注明|写明)\s*(?=每|含|不含|可选|限|仅|[+＋$€£¥￥\d])/,'').replace(/适用于本页所列/g,'适用于').trim();
      if(/^(?:菜单[^，,。；;]*(?:展示|图片显示)|图片(?:显示|中)|图中可见|页面图片显示|照片显示|从图片来看|根据图片|看图|据图|由图片|(?:image|photo)\b.*shows?)/i.test(sentence)&&diagnosticClause(sentence)){
        // Keep an explicitly attributed printed instruction, not the pictured
        // ingredients or serving size that precede it.
        const instruction=sentence.match(/并提示\s*[:：]?\s*(.+)$/);
        if(instruction)clauses.push(...noteClauses(instruction[1]));
        continue;
      }
      clauses.push(...noteClauses(sentence));
    }
    for(const clause of clauses){
      const key=noteKey(clause);
      if(!key||nameKeys.has(key)||seen.has(key)||diagnosticClause(clause))continue;
      seen.add(key);result.push(clause);
    }
    return result.join('；');
  }
  function priceLabel(value){
    const label=cleanNote(value);
    if(/^adult\s*[（(]\s*成人\s*[）)]$/i.test(label))return '成人';
    const age=label.match(/^(child|kid)\s*[（(]\s*(\d{1,3})\s*[-–—～~至]\s*(\d{1,3})\s*[）)]\s*[（(]\s*(儿童|幼儿)\s*(\d{1,3})\s*[-–—～~至]\s*(\d{1,3})\s*岁?\s*[）)]$/i);
    if(age&&Number(age[2])===Number(age[5])&&Number(age[3])===Number(age[6])
      &&((age[1].toLowerCase()==='child'&&age[4]==='儿童')||(age[1].toLowerCase()==='kid'&&age[4]==='幼儿')))
      return `${age[4]}${age[5]}–${age[6]}岁`;
    return label;
  }
  function chargeText(value,names=[]){
    // Typed charges must keep their explicit amounts even when an older model
    // response mixed in audit wording. Never derive currency or invent a rate.
    const raw=text(value);
    const amounts=value=>(String(value).match(/[+＋−-]?(?:\b(?:CAD|USD|EUR|GBP|CNY|RMB|AUD|HKD|JPY|SGD|CHF)\s*[$€£¥￥]?\s*\d[\d,]*(?:\.\d+)?|(?:CA?|US|AU|HK)?[$€£¥￥]\s*\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s*(?:\b(?:CAD|USD|EUR|GBP|CNY|RMB|AUD|HKD|JPY|SGD|CHF)\b|人民币|加元|美元|欧元|英镑|日元|港元|澳元|新元|元))/gi)||[]).map(text);
    const containsTokens=(value,expected)=>{
      const remaining=new Map();for(const amount of amounts(value))remaining.set(amount,(remaining.get(amount)||0)+1);
      return expected.every(amount=>{const count=remaining.get(amount)||0;if(!count)return false;remaining.set(amount,count-1);return true;});
    };
    const expected=amounts(raw),hasAll=value=>containsTokens(value,expected);
    const removeAudit=value=>value
      .replace(/^(?:识别(?:说明|结果)|翻译说明|OCR(?:说明)?|来源|source|needs[_ ]verification)\s*[:：]\s*/i,'')
      .replace(/(?:识别存疑|识别不确定|请核对|待核对|待核实|待确认|需确认|needs[_ ]verification)/gi,'')
      .replace(/(?:价格|售价)(?:尚|暂)?(?:未注明|未标注)币种\s*[:：]?\s*/g,'')
      .replace(/^(?:价格|售价)\s*[:：]?\s*/,'').replace(/^[\s：:；;，,]+|[\s：:；;，,]+$/g,'');
    const cleaned=cleanNote(removeAudit(raw),names);
    if(!expected.length||hasAll(cleaned))return cleaned;
    // Recover independently, so an unsupported audit clause cannot erase a
    // valid size/age/time label from the other charge clauses. When its scope
    // cannot be separated safely, print only the literal monetary tokens.
    const parts=[];
    for(const clause of noteClauses(raw)){
      const tokens=amounts(clause),candidate=cleanNote(removeAudit(clause),names);
      if(!tokens.length){if(candidate)parts.push(candidate);continue;}
      parts.push(containsTokens(candidate,tokens)?candidate:tokens.join(' / '));
    }
    const result=parts.join('；');
    return hasAll(result)?result:expected.join(' / ');
  }
  function servingLabelsCovered(availability,prices){
    const labels=noteClauses(availability).flatMap(value=>value.split(/\s*\/\s*/)).map(noteKey).filter(Boolean);
    const servingPatterns={glass:/\bglass\b|单杯/i,单杯:/\bglass\b|单杯/i,pitcher:/\bpitcher\b|整壶/i,整壶:/\bpitcher\b|整壶/i,bottle:/\bbottle\b|瓶装/i,瓶装:/\bbottle\b|瓶装/i};
    return labels.length>0&&labels.every(label=>servingPatterns[label]?.test(prices));
  }
  function presentItem(item={}){
    const names=[item.original_name,item.translated_name,item.order_code];
    const projected={...item,
      description:cleanNote(item.description,names),
      price:chargeText(item.price,names).replace(/^(?:价格|售价)\s*[:：]?\s*/,''),
      surcharge:chargeText(item.surcharge,names).replace(/^加价\s*[:：]\s*/,''),
      availability:cleanNote(item.availability,names),
      tags:[...new Map((Array.isArray(item.tags)?item.tags:[]).map(value=>cleanNote(value,names)).filter(Boolean).map(value=>[noteKey(value),value])).values()],
      source:'',needs_verification:false
    };
    if(servingLabelsCovered(projected.availability,projected.price+' '+projected.surcharge))projected.availability='';
    return projected;
  }
  function presentCategory(category){
    const items=(Array.isArray(category.items)?category.items:[]).map(presentItem),shared={};
    if(items.length>1)for(const field of ['price','surcharge','availability']){
      const value=items[0][field];
      if(value&&items.every(item=>item[field]===value)){
        shared[field]=value;
        for(const item of items)item[field]='';
      }
    }
    const previous=Array.isArray(category.shared_notes)?category.shared_notes.map(part=>({...part})):[],next=noteParts(shared);
    return {...category,items,shared_notes:[...previous,...(previous.length&&next.length?[{text:'；'}]:[]),...next]};
  }
  function ruleText(value){
    const result=text(value);
    // Typed rules are printed restaurant conditions. Unlike item captions,
    // asking staff can be an actual menu instruction and must stay intact.
    if(/^(?:本批次|先前批次|上一批次|识别说明|识别结果|来源索引|覆盖说明|needs_verification|reasoning|this batch)/i.test(result))return '';
    if(/^(?:菜单|原菜单|该页|本页)(?:中|上)?(?:未|没有)(?:标注|注明|说明|提供)/.test(result))return '';
    return result;
  }
  function presentRules(rules){
    const seen=new Set(),result=[];
    for(const rule of Array.isArray(rules)?rules:[]){
      const label=ruleText(rule.label),detail=ruleText(rule.detail);
      if(!detail)continue;
      const key=noteKey(label)+'|'+noteKey(detail);
      if(seen.has(key))continue;
      seen.add(key);result.push({...rule,label,detail,source:''});
    }
    return result;
  }
  function presentMenu(menu={}){
    // This is the common screen/export view. The original response remains
    // available separately for source review; no input object is changed.
    return {...menu,
      pricing:(Array.isArray(menu.pricing)?menu.pricing:[]).map(price=>({...price,label:priceLabel(price.label),value:chargeText(price.value).replace(/^(?:价格|售价)\s*[:：]?\s*/,''),note:cleanNote(price.note),source:''})).filter(price=>price.value),
      rules:presentRules(menu.rules),
      categories:(Array.isArray(menu.categories)?menu.categories:[]).map(presentCategory),
      warnings:[],coverage:{...menu.coverage,notes:[]},source_label:''
    };
  }
  function noteParts(rawItem){
    const item=presentItem(rawItem),fields=[
      {text:item.description,em:false},
      {text:item.price,em:true},
      {text:item.surcharge?(/^(?:[+＋]|加价|另加|加收|加购|追加|附加|额外|extra\b|additional\b|surcharge\b)/i.test(item.surcharge)?item.surcharge:'加价 '+item.surcharge):'',em:true},
      {text:item.availability,em:true},
      ...item.tags.map(value=>({text:value,em:false}))
    ];
    const seen=new Set(),parts=[];
    for(const name of [item.original_name,item.translated_name])if(/\bnew\b|新品|新款/i.test(name||''))seen.add('new');
    for(const field of fields){
      const clauses=noteClauses(field.text).filter(value=>{const key=noteKey(value);if(!key||seen.has(key))return false;seen.add(key);return true;});
      if(!clauses.length)continue;
      if(parts.length)parts.push({text:'；'});parts.push({text:clauses.join('；'),em:field.em});
    }
    return parts;
  }
  window.MenuDesign=Object.freeze({brand:'#e66e49',backgrounds,themes,mix,emphasisParts,presentMenu,noteParts});
})();
