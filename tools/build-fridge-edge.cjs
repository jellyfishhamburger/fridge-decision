const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'supabase/functions/fridge-frame');
const files=['font.mjs','render.mjs','handler.mjs','index.ts'];
const bundle='// @ts-nocheck\n// Generated fridge-frame bundle. No credentials.\n'+files.map(f=>fs.readFileSync(path.join(dir,f),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'')).join('\n');
const out=path.resolve(process.argv[2]||path.join(root,'../fridge-private/fridge-frame.ts'));fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,bundle);console.log('Prepared standalone Edge Function bundle');
