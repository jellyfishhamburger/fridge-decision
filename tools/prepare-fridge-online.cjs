// Prepare private firmware config. Never logs WiFi credentials or device secret.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const file=process.argv[2];if(!file)throw Error('Usage: node tools/prepare-fridge-online.cjs /private/fridge-device.local.json /private/root-ca.pem');
const device=JSON.parse(fs.readFileSync(file,'utf8')),ca=fs.readFileSync(process.argv[3],'utf8');
if(device.schema_version!==1||!/^https:\/\/zbrvcwxwecorjdzqltxg\.supabase\.co\/functions\/v1\/fridge-frame$/.test(device.frame_url)||!/^[0-9a-f-]{36}$/i.test(device.device_id)||!/^[0-9a-f]{64}$/i.test(device.device_secret))throw Error('Invalid device configuration');
if(!ca.includes('-----BEGIN CERTIFICATE-----'))throw Error('Missing verified CA');
const wifi=fs.readFileSync(path.join(root,'firmware/CookingPebble/pebble_secrets.h'),'utf8');
if(!wifi.includes('PEBBLE_WIFI_SSID')||!wifi.includes('PEBBLE_WIFI_PASSWORD'))throw Error('Local WiFi configuration missing');
const out=path.join(root,'firmware/FridgeOnline');
fs.writeFileSync(path.join(out,'fridge_wifi.local.h'),wifi.replaceAll('PEBBLE_WIFI_','FRIDGE_WIFI_'));
const config='#pragma once\n#include "fridge_wifi.local.h"\n#define FRIDGE_FRAME_URL '+JSON.stringify(device.frame_url)+'\n#define FRIDGE_DEVICE_ID '+JSON.stringify(device.device_id)+'\n#define FRIDGE_DEVICE_SECRET '+JSON.stringify(device.device_secret)+'\n#define FRIDGE_ROOT_CA '+JSON.stringify(ca)+'\n';
fs.writeFileSync(path.join(out,'fridge_secrets.h'),config);console.log('Prepared ignored local WiFi/device/TLS configuration; credentials not printed');
