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
  function noteParts(item){
    const fields=[
      {text:item.description,em:false},
      {text:item.price?'价格 '+item.price:'',em:true},
      {text:item.surcharge?'加价 '+item.surcharge:'',em:true},
      {text:item.availability,em:true},
      {text:Array.isArray(item.tags)?item.tags.join(' · '):'',em:false},
      {text:item.needs_verification?'识别存疑，请核对':'',em:true}
    ];
    const seen=new Set(),parts=[];
    for(const field of fields){const value=String(field.text??'').trim();if(!value||seen.has(value))continue;seen.add(value);if(parts.length)parts.push({text:'；'});parts.push({text:value,em:field.em});}
    return parts;
  }
  window.MenuDesign=Object.freeze({brand:'#e66e49',backgrounds,themes,mix,emphasisParts,noteParts});
})();
