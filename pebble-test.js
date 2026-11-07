(function(){
 'use strict';
 const base='https://blobcadhyoudubcnbdml.supabase.co', $=id=>document.getElementById(id);
 document.title='Cooking Pebble 测试 · 计时修复版2';
 let token=null,uid=null,key='',config=null,state=null,poll=null,busy=false,generation=0;
 const uuid=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s||'');
 const recipes=window.FD_DATA.recipes.slice(0,20);
 recipes.forEach((r,i)=>{const option=document.createElement('option');option.value=i;option.textContent=r.name;$('recipe').append(option);});
 function message(s){$('message').textContent=s;}
 function controls(){$('start').disabled=!token||!config||busy;for(const id of ['prev','next','timer','exit'])$(id).disabled=!token||!state||state.status!=='cooking'||busy;}
 async function api(path,body){
   const r=await fetch(base+path,{method:'POST',headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
   const result=await r.json();if(!r.ok)throw Error(result.message||result.msg||result.error_description||'请求失败 '+r.status);return result;
 }
 window.AUTH={signedIn:()=>!!token,rpc:(name,args)=>api('/rest/v1/rpc/'+name,args)};
 function render(){
   if(!state){$('step').textContent='尚未连接会话';$('clock').textContent='--:--';$('count').textContent='';controls();return;}
   $('step').textContent=state.status==='cooking'?state.steps[state.step_index].text:'会话已结束';
   $('count').textContent=`${state.step_index+1} / ${state.steps.length}`;
   const ms=state.timer_ends_at===null?state.remaining_ms:Math.max(0,state.timer_ends_at-Date.now());
   const n=Math.ceil(ms/1000);$('clock').textContent=state.steps[state.step_index].seconds?String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'):'--:--';controls();
 }
 function membership(){
   if(!uid||!config)return;
   $('membership-sql').value=`-- fridge-pebble-test only\nINSERT INTO public.household_members(household_id,user_id,role)\nVALUES ('${config.household_id}','${uid}','owner')\nON CONFLICT DO NOTHING;`;
   $('membership').hidden=false;
 }
 $('config').onchange=async()=>{try{const file=$('config').files[0];if(!file||file.size>2048)throw Error('配置文件无效');const c=JSON.parse(await file.text());if(!uuid(c.device_id)||!uuid(c.household_id)||c.project_url!==base||Object.keys(c).some(k=>/secret|password/i.test(k)))throw Error('请选择不含密钥的测试手机配置');generation++;clearTimeout(poll);config=c;state=null;membership();controls();message('测试设备配置已载入。');}catch(e){message(e.message);}};
 $('sign-in').onclick=async()=>{try{
   key=$('key').value.trim();if(!key||key.startsWith('sb_secret_'))throw Error('请使用公开客户端key');
   if(key.split('.').length===3){let payload;try{payload=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}catch{throw Error('客户端key格式无效');}if(payload.role!=='anon')throw Error('只允许anon客户端key');}
   const password=$('password').value;$('password').value='';
   const result=await api('/auth/v1/token?grant_type=password',{email:$('email').value.trim(),password});
   token=result.access_token;uid=result.user.id;generation++;$('sign-out').hidden=false;membership();controls();message('已登录。首次使用请完成下方测试家庭授权。');
 }catch(e){message(e.message);}};
 $('sign-out').onclick=()=>{generation++;clearTimeout(poll);token=null;uid=null;key='';state=null;$('key').value='';$('membership').hidden=true;$('sign-out').hidden=true;render();controls();message('本页登录状态已清除。');};
 async function refresh(g){try{const value=await PEBBLE_PHONE.read(config.device_id);if(g!==generation)return;if(!state||!value||state.id!==value.id||value.revision>=state.revision)state=value;render();}catch(e){if(g===generation)message(e.message);}if(g===generation)poll=setTimeout(()=>refresh(g),2000);}
 $('start').onclick=async()=>{if(busy||!config)return;busy=true;controls();const g=++generation;clearTimeout(poll);try{const r=recipes[Number($('recipe').value)];const value=await PEBBLE_PHONE.start(config.device_id,r.id,PEBBLE_STEPS.prepare(r.steps.filter(s=>s&&!/^!\[/.test(s))));if(g!==generation)return;state=value;render();message('菜谱已发送，等待旋钮同步。');refresh(g);}catch(e){if(g===generation)message(e.message);}finally{busy=false;controls();}};
 async function action(type,index){if(busy||!state)return;busy=true;controls();const g=generation;try{const value=await PEBBLE_PHONE.action(config.device_id,state,type,index);if(g===generation){state=value;render();message('操作已确认。');}}catch(e){if(g===generation)message(e.message+'；请等状态刷新后再操作，不要重复点击计时。');}finally{busy=false;controls();}}
 $('prev').onclick=()=>action('set_step',Math.max(0,state.step_index-1));$('next').onclick=()=>action('set_step',Math.min(state.steps.length-1,state.step_index+1));$('timer').onclick=()=>action('toggle_timer');$('exit').onclick=()=>action('exit');
 setInterval(render,250);controls();
})();
