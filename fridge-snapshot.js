(function(g){
 'use strict';
 function snapshot(rows,household,now){
  if(!household || typeof household.household_id!=='string')throw Error('请先创建或加入家庭。');
  if(!Array.isArray(rows))throw Error('读取库存失败，请稍后重试。');
  const items=rows.filter(r=>r.household_id===household.household_id && !r.deleted_at && Number.isFinite(Number(r.qty)) && Number(r.qty)>0).map(r=>({
   name:r.name,qty:Number(r.qty),unit:r.unit,life:r.life,added_at:r.added_at,days_left:r.days_left
  }));
  return {schema_version:1,generated_at:now.toISOString(),items};
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={snapshot};return;}
 function drawPreview(data){
  const canvas=document.getElementById('screen');if(!canvas)return;
  const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,400,300);c.fillStyle='#172d20';c.fillRect(0,0,400,30);c.fillStyle='#fff';c.font='13px sans-serif';c.fillText('FRIDGE DECISION / 库存预览',16,20);c.fillStyle='#172d20';c.font='32px sans-serif';c.fillText('先吃这些',16,75);
  if(!data)c.font='16px sans-serif',c.fillText('读取库存后，在这里预览',16,133);
  else{data.items.slice(0,3).forEach((item,i)=>{c.font='25px sans-serif';c.fillText(String(item.name).slice(0,11),16,116+i*48);c.font='13px sans-serif';c.fillStyle='#6c7867';c.fillText('数量 '+item.qty+' '+(item.unit||''),16,137+i*48);c.fillStyle='#172d20';});c.font='13px sans-serif';c.fillText('已读取 '+data.items.length+' 样 · 云端会按临期程度排序',16,285);}
 }
 drawPreview(null);
 const status=document.getElementById('status'),read=document.getElementById('read'),link=document.getElementById('download');
 let objectURL=null;
 if(g.AUTH&&AUTH.signedIn())status.textContent='已登录，可以读取库存。';else status.textContent='请先在这个浏览器完成登录。';
 read.addEventListener('click',async()=>{
  read.disabled=true;link.hidden=true;status.textContent='正在读取…';
  try{
   if(!AUTH.signedIn())throw Error('请先打开登录与家庭页完成登录，再回来读取。');
   const household=await AUTH.myHousehold();
   const data=snapshot(await AUTH.items(),household,new Date());
   if(objectURL)URL.revokeObjectURL(objectURL);
   objectURL=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
   link.href=objectURL;link.hidden=false;
   document.getElementById('preview').textContent=data.items.map(i=>i.name+' × '+i.qty).join('\n')||'当前家庭没有可用库存。';
   drawPreview(data);
   status.textContent='已读取 '+data.items.length+' 样食材；没有修改库存。';
  }catch(e){status.textContent=e.message||'读取失败，请稍后重试。';}
  finally{read.disabled=false;}
 });
 let deviceURL=null;
 document.getElementById('pair')?.addEventListener('click',async function(){
  const message=document.getElementById('pairStatus'),download=document.getElementById('deviceDownload');
  this.disabled=true;message.textContent='正在绑定设备…';download.hidden=true;
  try{
   if(!AUTH.signedIn())throw Error('请先登录，再绑定冰箱屏。');
   const home=await AUTH.myHousehold();if(!home||home.role!=='owner')throw Error('请由家庭创建者绑定设备。');
   const id=crypto.randomUUID(),secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret));
   const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
   await AUTH.rpc('register_fridge_display',{p_id:id,p_secret_hash:hash});
   if(deviceURL)URL.revokeObjectURL(deviceURL);
   const config={schema_version:1,device_id:id,device_secret:secret,frame_url:SYNC.cfg().url+'/functions/v1/fridge-frame'};
   deviceURL=URL.createObjectURL(new Blob([JSON.stringify(config,null,2)],{type:'application/json'}));download.href=deviceURL;download.hidden=false;
   message.textContent='设备已绑定。请下载配置，完成首次烧录；不要重复绑定。';this.dataset.bound='1';
  }catch(e){message.textContent=e.message||'绑定未完成，请稍后重试。';}
  finally{this.disabled=this.dataset.bound==='1';}
 });
})(typeof window==='undefined'?globalThis:window);
