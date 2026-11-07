/* Conservative content preparation: preserve every word and source index.
 * Punctuation outside parentheses separates actions; long actions become display
 * pages, not invented cooking actions. No automatic deletion of safety notes. */
(function(g){
  'use strict';
  function split(text){
    const parts=[]; let part='',depth=0;
    for(const ch of String(text)){
      if('（(['.includes(ch))depth++;
      if('）)]'.includes(ch))depth=Math.max(0,depth-1);
      if(depth===0 && '，。；;\n'.includes(ch)) {if(part.trim())parts.push(part.trim());part='';}
      else part+=ch;
    }
    if(part.trim())parts.push(part.trim());
    const actions=[];
    const ingredients=/^(?:盐|糖|白糖|生抽|老抽|料酒|醋|胡椒粉|淀粉|蚝油|食用油|香油|鸡精|味精)(?:\s*[\d.]+\s*(?:克|g|毫升|ml|勺))?$/i;
    const qualifier=/^(?:否则|以免|避免|注意|确保|尽量|不要|无需|量为|或使用|或者|至少|最多)/;
    const condition=s=>/(?:后|之前|以后|时候|时)$/.test(s)||/^(?:如果|若|当|待|直到)/.test(s)&&!/[炒煮蒸煎烤焖炖切拌倒放加入]/.test(s);
    let prefix='';
    for(const fragment of parts){
      if(condition(fragment)){prefix+=(prefix?'，':'')+fragment;continue;}
      const item=prefix?prefix+'，'+fragment:fragment;prefix='';
      if(actions.length && (qualifier.test(item)||ingredients.test(item)))actions[actions.length-1]+='，'+item;
      else actions.push(item);
    }
    if(prefix){if(actions.length)actions[actions.length-1]+='，'+prefix;else actions.push(prefix);}
    return actions;
  }
  function duration(text){
    const matches=[...text.matchAll(/(?<![\d.])(\d+)\s*(秒|分钟|seconds?|minutes?)(?![a-z])/gi)];
    if(matches.length!==1 || /\d\s*[-~～至到–—.]\s*\d/.test(text) || /约|大概|大约|至少|最多|以上|以下|左右|不少于|不超过|approximately|about|at least|up to/i.test(text))return 0;
    const n=Number(matches[0][1])*(/分钟|minute/i.test(matches[0][2])?60:1);
    return n<=86400?n:0;
  }
  function prepare(steps){
    return steps.flatMap((source,source_index)=>split(source).map(text=>{
      const chars=Array.from(text),pages=[];
      // 24px font: 7 characters per line, 2 lines per page. Preserve all text.
      for(let i=0;i<chars.length;i+=14)pages.push([chars.slice(i,i+7).join(''),chars.slice(i+7,i+14).join('')].filter(Boolean));
      const seconds=duration(text);
      const flags=[];
      if(chars.length>14)flags.push('long_action');
      if(/\d+\s*(秒|分钟|seconds?|minutes?)/i.test(text)&&seconds===0)flags.push('ambiguous_timer');
      if(/可选|或者|或使用|补充|并行|建议/.test(text))flags.push('editorial_review');
      return {text,seconds,source_index,pages,needs_review:flags.length>0,review_flags:flags};
    }));
  }
  const api={prepare,duration};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else g.PEBBLE_STEPS=api;
})(typeof globalThis!=='undefined'?globalThis:this);
