import {FONT} from './font.mjs';
const DAY=86400000;
export function inventoryRows(items,now){
 const today=Math.floor((now+8*3600000)/DAY);
 return items.filter(i=>Number.isFinite(Number(i.qty))&&Number(i.qty)>0).map(i=>{
  let days=null;
  if(typeof i.added_at==='string'&&/^\d{4}-\d{2}-\d{2}/.test(i.added_at)&&Number.isFinite(i.life)){
   const added=Date.parse(i.added_at.slice(0,10)+'T00:00:00Z');if(Number.isFinite(added))days=i.life-(today-Math.floor(added/DAY));
  }
  if(days===null&&Number.isFinite(i.days_left))days=i.days_left;
  return {name:String(i.name||'未命名食材').replace(/[\r\n\t]/g,' ').slice(0,64),days};
 }).sort((a,b)=>(a.days===null)-(b.days===null)||(a.days??0)-(b.days??0)||a.name.localeCompare(b.name,'zh'));
}
export function renderFrame(items,now=Date.now()){
 const frame=new Uint8Array(15000),rows=inventoryRows(items,now);
 function pixel(x,y,black=true){if(x<0||y<0||x>=400||y>=300)return;const n=y*50+(x>>3),mask=128>>(x&7);if(black)frame[n]|=mask;else frame[n]&=~mask;}
 function rect(x,y,w,h,black=true){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)pixel(xx,yy,black);}
 function text(value,x,y,size=16,width=376,black=true){
  const start=x;
  for(const ch of value){const glyph=FONT[size][ch]||FONT[size]['□'];if(!glyph)continue;if(x+glyph.w>start+width)break;
   const raw=Uint8Array.from(atob(glyph.b),c=>c.charCodeAt(0)),stride=Math.ceil(glyph.w/8);
   for(let yy=0;yy<size+4;yy++)for(let xx=0;xx<glyph.w;xx++)if(raw[yy*stride+(xx>>3)]&(128>>(xx&7)))pixel(x+xx,y+yy,black);
   x+=glyph.w;
  }
 }
 rect(0,0,400,29);text('FRIDGE DECISION',16,4,16,368,false);
 text('先吃这些',16,41,32);
 if(!rows.length)text('当前没有可用库存',16,125,16);
 rows.slice(0,3).forEach((r,index)=>{
  const y=91+index*52;const urgent=r.days!==null&&r.days<=1;
  rect(16,y+5,4,31);text(r.name,30,y,32,220);
  const label=r.days===null?'日期待确认':r.days<0?'已过期 '+Math.abs(r.days)+' 天':r.days===0?'今天到期':'还剩 '+r.days+' 天';
  text(label,32,y+32,16,346);
  if(urgent)rect(362,y+5,20,20);
 });
 rect(16,251,368,1);
 const stamp=new Date(Math.floor(now/(30*60000))*30*60000+8*3600000).toISOString().slice(5,16).replace('T',' ');
 text('更新 '+stamp+'   共 '+rows.length+' 样',16,261,16);
 text('请核实包装与食材状态',16,283,16);
 return frame;
}
