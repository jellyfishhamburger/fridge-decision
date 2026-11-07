(function(g){
 'use strict';
 function snapshot(rows,household,now){
  if(!household || typeof household.id!=='string')throw Error('请先创建或加入家庭。');
  if(!Array.isArray(rows))throw Error('读取库存失败，请稍后重试。');
  const items=rows.filter(r=>r.household_id===household.id && !r.deleted_at && Number.isFinite(Number(r.qty)) && Number(r.qty)>0).map(r=>({
   name:r.name,qty:Number(r.qty),unit:r.unit,life:r.life,added_at:r.added_at,days_left:r.days_left
  }));
  return {schema_version:1,generated_at:now.toISOString(),items};
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={snapshot};return;}
 const status=document.getElementById('status'),read=document.getElementById('read'),link=document.getElementById('download');
 let objectURL=null;
 if(g.AUTH&&AUTH.signedIn())status.textContent='已登录，可以读取库存。';
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
   status.textContent='已读取 '+data.items.length+' 样食材；没有修改库存。';
  }catch(e){status.textContent=e.message||'读取失败，请稍后重试。';}
  finally{read.disabled=false;}
 });
})(typeof window==='undefined'?globalThis:window);
