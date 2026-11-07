const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const inputs=['tools/pebble-test-bootstrap.sql','migrations/013_pebble_sessions.sql','migrations/014_pebble_phone.sql','migrations/015_pebble_phone_action.sql'];
const sql='-- EMPTY TEST PROJECT ONLY. Do not run on the existing fridge database.\nBEGIN;\n'+inputs.map(f=>'\n-- SOURCE: '+f+'\n'+fs.readFileSync(path.join(root,f),'utf8').replace(/^\s*(begin|commit);\s*$/gim,'')).join('\n')+'\nCOMMIT;\n';
const output=path.resolve(process.argv[2]||path.join(root,'../pebble-content-preview/initialize-test-project.sql'));
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,sql);console.log(output);
