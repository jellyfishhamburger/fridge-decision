// Deterministic offline export; does not edit the recipe database.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {prepare}=require('../pebble-steps.js');
const root=path.resolve(__dirname,'..'),output=path.resolve(process.argv[2]||path.join(root,'..','pebble-content-preview'));
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'data.js'),'utf8'),context);
const db=context.window.FD_DATA;
const recipes=db.recipes.slice(0,20).map(r=>({id:r.id,name:r.name,source:r.src,steps:prepare(r.steps.filter(s=>s&&!/^!\[/.test(String(s).trim())))}));
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'recipes.json'),JSON.stringify({source:db.recipeSource,recipes},null,2));
const ui=fs.readFileSync(path.join(root,'firmware/CookingPebble/font-text.txt'),'utf8');
const text=ui+'\n'+recipes.flatMap(r=>[r.name,...r.steps.map(s=>s.text)]).join('\n');
const unsupported=[...new Set([...text].filter(c=>c.codePointAt(0)>65535))];
if(unsupported.length)throw Error('Non-BMP glyphs require explicit handling: '+unsupported.join(''));
fs.writeFileSync(path.join(output,'font-text.txt'),text);
const rows=recipes.map(r=>`| ${r.name.replaceAll('|','／')} | ${r.steps.length} | ${r.steps.filter(s=>s.pages.length>1).length} | ${r.steps.filter(s=>s.seconds>0).length} | ${r.steps.filter(s=>s.needs_review).length} |`);
const review=recipes.flatMap(r=>r.steps.flatMap((s,i)=>s.needs_review?[`- ${r.name} / 动作${i+1}（${s.review_flags.join(', ')}）：${s.text}`]:[]));
fs.writeFileSync(path.join(output,'review.md'),'# 前20道菜的旋钮内容预览\n\n来源：'+db.recipeSource.url+'（'+db.recipeSource.license+'）。保留原文，自动拆分尚需内容审阅，不等于已完成语义精简。\n\n| 菜名 | 拆分后动作 | 多页动作 | 明确计时动作 | 待审动作 |\n|---|---:|---:|---:|---:|\n'+rows.join('\n')+'\n\n## 待审明细\n\n'+review.join('\n')+'\n');
console.log(JSON.stringify({recipes:recipes.length,characters:new Set([...text]).size,atoms:recipes.reduce((n,r)=>n+r.steps.length,0),over100Steps:recipes.filter(r=>r.steps.length>100).map(r=>r.id)}));
