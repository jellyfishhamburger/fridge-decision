import {FONT} from './font.mjs';
const DAY=86400000;

// 由 data.js 的 109 条食材生成：英文名 -> [中文名, 分类]
const FOODS={"shrimp":["虾","protein"],"chicken":["鸡肉","protein"],"pork":["猪肉","protein"],"beef":["牛肉","protein"],"fish":["鱼","protein"],"ham":["火腿","protein"],"eggs":["鸡蛋","protein"],"tofu":["豆腐","protein"],"leafy greens":["青菜","greens"],"broccoli":["西兰花","greens"],"tomato":["番茄","greens"],"green chili":["青椒","veg"],"onion":["洋葱","veg"],"carrot":["胡萝卜","veg"],"potato":["土豆","carb"],"eggplant":["茄子","veg"],"mushrooms":["香菇","veg"],"cooked rice":["米饭","carb"],"noodles":["面条","carb"],"frozen dumplings":["速冻饺子","carb"],"bread":["面包","carb"],"milk":["牛奶","dairy"],"cheese":["芝士","dairy"],"yogurt":["酸奶","dairy"],"cola":["可乐","other"],"napa cabbage":["白菜","greens"],"baby cabbage":["娃娃菜","greens"],"lettuce":["生菜","greens"],"spinach":["菠菜","greens"],"celery":["芹菜","veg"],"chives":["韭菜","greens"],"bean sprouts":["豆芽","veg"],"cucumber":["黄瓜","veg"],"pumpkin":["南瓜","veg"],"wax gourd":["冬瓜","veg"],"luffa":["丝瓜","veg"],"lotus root":["莲藕","veg"],"chinese yam":["山药","veg"],"sweet corn":["玉米","carb"],"green beans":["豆角","veg"],"snow peas":["荷兰豆","veg"],"cauliflower":["花菜","veg"],"enoki mushroom":["金针菇","veg"],"wood ear":["木耳","veg"],"kelp":["海带","veg"],"cherry tomato":["小番茄","greens"],"red chili":["红辣椒","veg"],"chicken wings":["鸡翅","protein"],"pork ribs":["排骨","protein"],"bacon":["培根","protein"],"sausage":["香肠","protein"],"peeled shrimp":["虾仁","protein"],"firm tofu":["豆干","protein"],"duck":["鸭肉","protein"],"lamb":["羊肉","protein"],"steamed bun":["馒头","carb"],"flour":["面粉","carb"],"rice cake":["年糕","carb"],"sweet potato":["红薯","carb"],"purple sweet potato":["紫薯","carb"],"butter":["黄油","dairy"],"cream":["淡奶油","dairy"],"apple":["苹果","fruit"],"banana":["香蕉","fruit"],"mandarin":["砂糖橘","fruit"],"orange":["橙子","fruit"],"grapes":["葡萄","fruit"],"strawberry":["草莓","fruit"],"blueberry":["蓝莓","fruit"],"pear":["梨","fruit"],"watermelon":["西瓜","fruit"],"peach":["桃","fruit"],"kiwi":["猕猴桃","fruit"],"mango":["芒果","fruit"],"dragon fruit":["火龙果","fruit"],"lemon":["柠檬","fruit"],"avocado":["牛油果","fruit"],"cherries":["车厘子","fruit"],"white radish":["白萝卜","veg"],"lamb chops":["羊排","protein"],"taro":["芋头","carb"],"celtuce":["莴笋","veg"],"bamboo shoots":["春笋","veg"],"fermented beans":["豆豉","veg"],"glass noodles":["粉丝","carb"],"bean curd stick":["腐竹","protein"],"tofu skin":["千张","protein"],"century egg":["皮蛋","protein"],"garlic sprouts":["蒜苗","veg"],"red dates":["红枣","other"],"chicken thigh":["鸡腿肉","protein"],"pork belly":["五花肉","protein"],"honey":["蜂蜜","other"],"curry cubes":["咖喱块","other"],"peanuts":["花生","other"],"chestnuts":["板栗","other"],"chinese kale":["芥蓝","greens"],"crown daisy":["茼蒿","greens"],"asparagus":["芦笋","veg"],"okra":["秋葵","veg"],"dried seaweed":["紫菜","other"],"dried shrimp":["虾皮","protein"],"squid":["鱿鱼","protein"],"beef brisket":["牛腩","protein"],"pork trotter":["猪蹄","protein"],"chicken feet":["鸡爪","protein"],"lotus seeds":["莲子","other"],"edamame":["毛豆","veg"],"frozen tangyuan":["汤圆","carb"]};
// 中文名 -> 分类
const CN_TAG={"虾":"protein","鸡肉":"protein","猪肉":"protein","牛肉":"protein","鱼":"protein","火腿":"protein","鸡蛋":"protein","豆腐":"protein","青菜":"greens","西兰花":"greens","番茄":"greens","青椒":"veg","洋葱":"veg","胡萝卜":"veg","土豆":"carb","茄子":"veg","香菇":"veg","米饭":"carb","面条":"carb","速冻饺子":"carb","面包":"carb","牛奶":"dairy","芝士":"dairy","酸奶":"dairy","可乐":"other","白菜":"greens","娃娃菜":"greens","生菜":"greens","菠菜":"greens","芹菜":"veg","韭菜":"greens","豆芽":"veg","黄瓜":"veg","南瓜":"veg","冬瓜":"veg","丝瓜":"veg","莲藕":"veg","山药":"veg","玉米":"carb","豆角":"veg","荷兰豆":"veg","花菜":"veg","金针菇":"veg","木耳":"veg","海带":"veg","小番茄":"greens","红辣椒":"veg","鸡翅":"protein","排骨":"protein","培根":"protein","香肠":"protein","虾仁":"protein","豆干":"protein","鸭肉":"protein","羊肉":"protein","馒头":"carb","面粉":"carb","年糕":"carb","红薯":"carb","紫薯":"carb","黄油":"dairy","淡奶油":"dairy","苹果":"fruit","香蕉":"fruit","砂糖橘":"fruit","橙子":"fruit","葡萄":"fruit","草莓":"fruit","蓝莓":"fruit","梨":"fruit","西瓜":"fruit","桃":"fruit","猕猴桃":"fruit","芒果":"fruit","火龙果":"fruit","柠檬":"fruit","牛油果":"fruit","车厘子":"fruit","白萝卜":"veg","羊排":"protein","芋头":"carb","莴笋":"veg","春笋":"veg","豆豉":"veg","粉丝":"carb","腐竹":"protein","千张":"protein","皮蛋":"protein","蒜苗":"veg","红枣":"other","鸡腿肉":"protein","五花肉":"protein","蜂蜜":"other","咖喱块":"other","花生":"other","板栗":"other","芥蓝":"greens","茼蒿":"greens","芦笋":"veg","秋葵":"veg","紫菜":"other","虾皮":"protein","鱿鱼":"protein","牛腩":"protein","猪蹄":"protein","鸡爪":"protein","莲子":"other","毛豆":"veg","汤圆":"carb"};


const S16='16',S32='32';
const g16=ch=>FONT[S16][ch]||FONT[S16]['□'], g32=ch=>FONT[S32][ch]||FONT[S32]['□'];
function measure(value,size){let w=0;for(const ch of value){const g=size===32?g32(ch):g16(ch);if(g)w+=g.w;}return w;}
function fit(value,size,maxWidth){
 if(measure(value,size)<=maxWidth)return value;
 let out=value;
 while(out.length>1&&measure(out+'…',size)>maxWidth)out=out.slice(0,-1);
 return out+'…';
}

// 常见英文写法（data.js 之外）
const EXTRA={
 "fish":["鱼","protein"],"salmon":["三文鱼","protein"],"tuna":["金枪鱼","protein"],
 "cod":["鳕鱼","protein"],"squid":["鱿鱼","protein"],"crab":["蟹","protein"],
 "prawn":["虾","protein"],"prawns":["虾","protein"],"bacon":["培根","protein"],
 "sausage":["香肠","protein"],"dumpling":["饺子","carb"],"dumplings":["饺子","carb"],
 "chicken wings":["鸡翅","protein"],"chicken wing":["鸡翅","protein"],
 "chicken breast":["鸡胸肉","protein"],"steak":["牛排","protein"],
 "minced pork":["猪肉末","protein"],"pork belly":["五花肉","protein"],
 "spinach":["菠菜","greens"],"lettuce":["生菜","greens"],"bok choy":["小白菜","greens"],
 "chinese cabbage":["大白菜","greens"],"cabbage":["卷心菜","greens"],
 "celery":["芹菜","greens"],"kale":["羽衣甘蓝","greens"],
 "tomato":["番茄","veg"],"tomatoes":["番茄","veg"],"potato":["土豆","carb"],
 "potatoes":["土豆","carb"],"sweet potato":["红薯","carb"],
 "carrot":["胡萝卜","veg"],"carrots":["胡萝卜","veg"],"onion":["洋葱","veg"],
 "garlic":["大蒜","veg"],"ginger":["姜","veg"],"cucumber":["黄瓜","veg"],
 "mushroom":["蘑菇","veg"],"mushrooms":["蘑菇","veg"],"broccoli":["西兰花","greens"],
 "corn":["玉米","veg"],"peas":["豌豆","veg"],"bell pepper":["彩椒","veg"],
 "pumpkin":["南瓜","veg"],"eggplant":["茄子","veg"],
 "apple":["苹果","fruit"],"apples":["苹果","fruit"],"banana":["香蕉","fruit"],
 "bananas":["香蕉","fruit"],"orange":["橙子","fruit"],"oranges":["橙子","fruit"],
 "grape":["葡萄","fruit"],"grapes":["葡萄","fruit"],"strawberry":["草莓","fruit"],
 "watermelon":["西瓜","fruit"],"pear":["梨","fruit"],"peach":["桃","fruit"],
 "mango":["芒果","fruit"],"blueberry":["蓝莓","fruit"],"lemon":["柠檬","fruit"],
 "milk":["牛奶","dairy"],"yogurt":["酸奶","dairy"],"yoghurt":["酸奶","dairy"],
 "cheese":["奶酪","dairy"],"butter":["黄油","dairy"],"cream":["奶油","dairy"],
 "bread":["面包","carb"],"rice":["米饭","carb"],"noodles":["面条","carb"],
 "noodle":["面条","carb"],"pasta":["意面","carb"],"flour":["面粉","carb"],
 "egg":["鸡蛋","protein"],"eggs":["鸡蛋","protein"],"tofu":["豆腐","protein"],
 "ham":["火腿","protein"],"leafy greens":["青菜","greens"],
 "snap peas":["荷兰豆","veg"],
};

export function localize(name){
 const raw=String(name||'').replace(/[\r\n\t]/g,' ').trim().slice(0,64);
 if(!raw)return {label:'未命名食材',tag:'other'};
 const key=raw.toLowerCase();
 if(EXTRA[key])return {label:EXTRA[key][0],tag:EXTRA[key][1]};
 if(FOODS[key])return {label:FOODS[key][0],tag:FOODS[key][1]};
 if(CN_TAG[raw])return {label:raw,tag:CN_TAG[raw]};
 return {label:raw,tag:tagOf(raw)};
}

function tagOf(text){
 const t=text.toLowerCase();
 if(/鱼|虾|蟹|贝|海鲜|fish|shrimp|salmon|tuna|prawn/.test(t))return 'protein';
 if(/蛋|egg/.test(t))return 'protein';
 if(/豆|tofu|bean/.test(t))return 'protein';
 if(/菜|菠菜|生菜|白菜|青菜|芹|韭|greens|spinach|lettuce|cabbage|celery/.test(t))return 'greens';
 if(/奶|芝士|奶酪|酸奶|黄油|milk|cheese|yogurt|butter|cream/.test(t))return 'dairy';
 if(/米|面|馒头|面包|土豆|红薯|rice|noodle|bread|potato|pasta/.test(t))return 'carb';
 if(/果|apple|banana|orange|grape|berry|melon|peach|pear/.test(t))return 'fruit';
 if(/肉|鸡|猪|牛|羊|鸭|ham|chicken|beef|pork|lamb|meat/.test(t))return 'protein';
 if(/椒|茄|瓜|菇|葱|姜|蒜|萝卜|tomato|pepper|onion|garlic|mushroom|cucumber|carrot/.test(t))return 'veg';
 return 'other';
}

export function inventoryRows(items,now){
 const today=Math.floor((now+8*3600000)/DAY);
 return items.filter(i=>Number.isFinite(Number(i.qty))&&Number(i.qty)>0).map(i=>{
  let days=null;
  if(typeof i.added_at==='string'&&/^\d{4}-\d{2}-\d{2}/.test(i.added_at)&&Number.isFinite(i.life)){
   const added=Date.parse(i.added_at.slice(0,10)+'T00:00:00Z');if(Number.isFinite(added))days=i.life-(today-Math.floor(added/DAY));
  }
  if(days===null&&Number.isFinite(i.days_left))days=i.days_left;
  const local=localize(i.name);
  return {name:local.label,tag:local.tag,days};
 }).sort((a,b)=>(a.days===null)-(b.days===null)||(a.days??0)-(b.days??0)||a.name.localeCompare(b.name,'zh'));
}

export function renderFrame(items,now=Date.now()){
 const frame=new Uint8Array(15000),rows=inventoryRows(items,now);
 const pixel=(x,y,black=true)=>{if(x<0||y<0||x>=400||y>=300)return;const n=y*50+(x>>3),mask=128>>(x&7);if(black)frame[n]|=mask;else frame[n]&=~mask;};
 const rect=(x,y,w,h,black=true)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)pixel(xx,yy,black);};
 const text=(value,x,y,size=S16,width=376,black=true)=>{
  const start=x;const pick=size===32?g32:g16;
  for(const ch of value){
   const g=pick(ch);if(!g)continue;
   if(x+g.w>start+width)break;
   const raw=Uint8Array.from(atob(g.b),c=>c.charCodeAt(0)),stride=Math.ceil(g.w/8),h=size+4;
   for(let yy=0;yy<h;yy++)for(let xx=0;xx<g.w;xx++)if(raw[yy*stride+(xx>>3)]&(128>>(xx&7)))pixel(x+xx,y+yy,black);
   x+=g.w;
  }
 };
 const textRight=(value,right,y,size=S16,black=true)=>text(value,right-measure(value,size),y,size,400,black);

 // ---- 44×44 图标（由 design44.py 生成并内嵌 base64） ----
const ICONS={"leaf":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAfwAAAAAD/8AAAAAf/+AAAAD//+AAAAH//+AAAAP/9+AAAAf/5+AAAAf/z8AAAA//n8AAAB//v8AAAD//f4AAAD/+/4AAAH/8/4AAAP/5/wAAAf/z3wAAAf/nnwAAAP/vvgAAAP/ffAAAAP++eAAAAP888AAAAH594AAAAHz7wAAAAH/zgAAAAD/nAAAAAD/uAAAAAD/8AAAAAD/4AAAAAB/wAAAAAB/AAAAAAB+AAAAAAD4AAAAAAHwAAAAAAHAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","bone":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH4AAfgAAP+AA/4AAf+AB/4AA//AD/8AA//AD/8AA//AD/8AA//AD/8AA//AD/8AAf/AB/8AAf////4AAP////wAAH////gAAA///+AAAA///8AAAB///+AAAH////wAAP////4AAf/AB/8AA//AD/8AA//AD/8AA//AD/8AA//AD/8AA//AD/8AAf/AB/8AAf+AB/4AAP8AA/wAADwAAPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","cube":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAB8AAAAAAD+AAAAAAP/gAAAAA//wAAAAD//8AAAAH//+AAAAf///gAAB////wAAD////gAAD///+IAAI///84AAOf//z4AAPn//H4AAPx/8f4AAP8/5/4AAP+Pn/4AAP/mP/4AAP/4//4AAP/9//4AAP/9//4AAP/9//4AAP/9//4AAP/9//4AAP/9//gAAD/9//AAAB/9/8AAAAf9/wAAAAP9/gAAAAD9+AAAAAA94AAAAAAdgAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","fish":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAHAAAAAAAPAAAHgAAfAAD//AA/AAP//wB/AA///8D/AB///+H/AD8///P/AH4f////AHwP////AH4f////AP4f////AP//////AH//////AH////v/AD////H/AB///+D/AA///8B/AAf//4A/AAD//gAfAAAf4AAPAAAAAAAHAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","egg":"AAAAAAAAAAAAAAAAAAAGAAAAAAA/wAAAAAB/4AAAAAD/8AAAAAH/+AAAAAH//AAAAAP//AAAAAP//gAAAAeH/gAAAAcD/gAAAA8D/wAAAA8D/wAAAA8D/wAAAA8D/4AAAB+H/4AAAB///4AAAB///4AAAB///4AAAB///4AAAB///4AAAB///4AAAB///4AAAB///4AAAB///4AAAB///4AAAB///4AAAA///4AAAA///wAAAA///wAAAA///wAAAAf//gAAAAf//gAAAAP//gAAAAP//AAAAAH//AAAAAH/+AAAAAD/8AAAAAB/4AAAAAA/wAAAAAAGAAAAAAAAAAAAAAAAAAAA","milk":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB//8AAAADgP8AAAAHgP8AAAAPgP8AAAAPgP8AAAAfgP8AAAA/gP8AAAB///8AAAB///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","bowl":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AAAAAf//gAAAB///4AAAD///8AAAH///+AAAH///+AAAP////AAAP////AAAH///+AAAH///+AAAH///+AAf//////gf//////gf//////gf//////gP//////AAAAAAAAAAAAAAAAAP//////AP//////AH/////+AH/////+AH/////+AH/////+AD/////8AD/////8AB/////4AB/////4AA/////wA","apple":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH8AAAAAHv/AAAAAH//AAAAAH//gAAAAH//gAAAAH//AAAAAHv/AAAAAHn8AAAAAHgAAAAAAPgAAAAAH/+AAAAAf//gAAAB///4AAAD///8AAAH///+AAAP////AAAf////gAA/////wAA/////wAA/j///wAB/B///4AB+A///4AB+A///4AB+A///4AB+A///4AB+A///4AB/B///4AA/j///wAA/////wAA/////wAAf////gAAP////AAAH///+AAAD///8AAAB///4AAAAf//gAAAAH/+AAAAAAPAAAAAAAAAAAAAAAAAAAA","box":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA////+AAA////8AAA////4QAA////xwAA////jwAA+A//HwAA+A/+PwAA+A/8fwAA+A/4/wAA+A/x/wAA+A/j/wAA///H/wAA//+P/wAA//8f/wAA//4//wAA//x//wAA//j//wAA//H//wAA/+P//wAA/8f//wAA/4///wAA/x///wAA/D///wAA+H///wAA8P///wAA4f///wAAw////wAAh////wAAD////wAAP////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"};
const ICON=44, ICON_STRIDE=6;
 function drawIcon(kind,X,Y){
  const b=ICONS[kind]||ICONS.box;
  const raw=Uint8Array.from(atob(b),c=>c.charCodeAt(0));
  for(let y=0;y<ICON;y++)for(let x=0;x<ICON;x++)if(raw[y*ICON_STRIDE+(x>>3)]&(128>>(x&7)))pixel(X+x,Y+y);
 }
 function iconFor(tag,label){
  if(tag==='greens'||tag==='veg')return 'leaf';
  if(tag==='carb')return 'bowl';
  if(tag==='dairy')return 'milk';
  if(tag==='fruit')return 'apple';
  if(tag==='protein'){
   if(/鱼|虾|蟹|贝|鱿/.test(label))return 'fish';
   if(/蛋/.test(label))return 'egg';
   if(/豆/.test(label))return 'cube';
   return 'bone';
  }
  return 'box';
 }

 // ---- 版式 400×300 ----
 rect(0,0,400,28);
 text('FRIDGE DECISION',14,3,16,240,false);
 textRight('共 '+rows.length+' 样',386,3,16,false);

 text('先吃这些',16,36,16,200);
 rect(88,44,60,1);

 if(!rows.length)text('当前没有可用库存',16,150,16);

 rows.slice(0,3).forEach((r,index)=>{
  const y=58+index*62;
  const urgent=r.days!==null&&r.days<=1;
  drawIcon(iconFor(r.tag,r.name),8,y+10);
  const label=r.days===null?'日期待确认':r.days<0?'已过期 '+Math.abs(r.days)+' 天':r.days===0?'今天到期':'还剩 '+r.days+' 天';
  const lw=measure(label,S16);
  const name=fit(r.name,32,384-64-lw-16);
  text(name,64,y,32,384-64-lw-16);
  const ly=y+9;
  if(urgent){
   rect(384-lw-6,ly-2,lw+12,21);
   text(label,384-lw,ly,16,400,false);
  }else{
   text(label,384-lw,ly,16,400);
  }
 });

 rect(16,246,368,1);
 const stamp=new Date(Math.floor(now/(30*60000))*30*60000+8*3600000).toISOString().slice(5,16).replace('T',' ');
 text('更新 '+stamp,16,252,16,220);
 text('请核实包装与食材状态',16,278,16);
 return frame;
}
