#include <SPI.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <LittleFS.h>
#include <mbedtls/sha256.h>
#include <time.h>
#include <GxEPD2_BW.h>
#include "GxEPD2_420c_Z96.h"
#if __has_include("fridge_secrets.h")
#include "fridge_secrets.h"
#else
#include "fridge_secrets.example.h"
#endif
constexpr size_t FRAME_BYTES=15000;
constexpr uint32_t REFRESH_GAP=15000,POLL_MS=300000,RETRY_MS=30000;
constexpr uint8_t KEYS[]={4,5,13};
GxEPD2_BW<GxEPD2_420c_Z96,GxEPD2_420c_Z96::HEIGHT> display(GxEPD2_420c_Z96(7,6,10,0));
struct Frame{uint8_t bytes[FRAME_BYTES];char sha[65];};
Frame current{};
QueueHandle_t frames=nullptr;TaskHandle_t workerHandle=nullptr;
volatile int netState=0,httpCode=0;volatile uint32_t lastSuccess=0;
bool hasFrame=false,cacheReady=false,cacheSaved=false,dirty=true;
uint32_t refreshEnded=0,pressCount[3]={};int page=0,lastNet=-1;
struct Key{int raw=HIGH,stable=HIGH;uint32_t changed=0;}keys[3];
void digest(const uint8_t* bytes,char* hex){uint8_t hash[32];mbedtls_sha256(bytes,FRAME_BYTES,hash,0);for(int i=0;i<32;i++)sprintf(hex+2*i,"%02x",hash[i]);hex[64]=0;}
bool valid(const Frame& frame){char sha[65];digest(frame.bytes,sha);return memcmp(sha,frame.sha,65)==0;}
bool loadCache(){if(!cacheReady)return false;auto f=LittleFS.open("/frame.bin","r");if(!f||f.size()!=FRAME_BYTES+68)return false;char magic[4];bool ok=f.readBytes(magic,4)==4&&memcmp(magic,"FRD1",4)==0&&f.readBytes(current.sha,64)==64;current.sha[64]=0;ok=ok&&f.read(current.bytes,FRAME_BYTES)==FRAME_BYTES;f.close();return ok&&valid(current);}
bool saveCache(){if(!cacheReady)return false;auto f=LittleFS.open("/frame.new","w");if(!f)return false;bool ok=f.write((const uint8_t*)"FRD1",4)==4&&f.write((const uint8_t*)current.sha,64)==64&&f.write(current.bytes,FRAME_BYTES)==FRAME_BYTES;f.flush();f.close();return ok&&LittleFS.rename("/frame.new","/frame.bin");}
bool fetchFrame(char* etag){
 WiFiClientSecure tls;tls.setCACert(FRIDGE_ROOT_CA);tls.setTimeout(15000);
 HTTPClient http;http.setTimeout(15000);http.setConnectTimeout(10000);http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
 String url=String(FRIDGE_FRAME_URL)+"?device_id="+FRIDGE_DEVICE_ID;
 if(!http.begin(tls,url)){httpCode=-10;return false;}
 const char* names[]={"x-frame-sha256","x-frame-format"};http.collectHeaders(names,2);
 http.addHeader("x-device-secret",FRIDGE_DEVICE_SECRET);if(strlen(etag))http.addHeader("If-None-Match",String('"')+etag+'"');
 int code=http.GET();httpCode=code;
 if(code==304){lastSuccess=millis();http.end();return true;}
 if(code!=200||http.getSize()!=FRAME_BYTES||http.header("x-frame-format")!="400x300-msb-black1-v1"){http.end();return false;}
 String sha=http.header("x-frame-sha256");if(sha.length()!=64){http.end();return false;}
 Frame* received=new Frame;strlcpy(received->sha,sha.c_str(),65);
 auto stream=http.getStreamPtr();stream->setTimeout(1500);size_t n=0;uint32_t start=millis();
 while(n<FRAME_BYTES&&uint32_t(millis()-start)<20000){size_t got=stream->readBytes(received->bytes+n,min(size_t(1024),FRAME_BYTES-n));if(!got)break;n+=got;}
 http.end();if(n!=FRAME_BYTES||!valid(*received)){delete received;httpCode=-11;return false;}
 if(xQueueSend(frames,&received,0)!=pdTRUE){delete received;httpCode=-12;return false;}
 strlcpy(etag,sha.c_str(),65);lastSuccess=millis();return true;
}
void networkTask(void*){
 char etag[65]={};if(hasFrame)strlcpy(etag,current.sha,65);
 if(!strlen(FRIDGE_WIFI_SSID)||!strlen(FRIDGE_DEVICE_ID)||!strlen(FRIDGE_DEVICE_SECRET)||!strlen(FRIDGE_ROOT_CA)){netState=-1;vTaskDelete(nullptr);return;}
 WiFi.persistent(false);WiFi.mode(WIFI_STA);WiFi.setAutoReconnect(true);WiFi.begin(FRIDGE_WIFI_SSID,FRIDGE_WIFI_PASSWORD);
 configTime(0,0,"pool.ntp.org","time.cloudflare.com");
 for(;;){
  netState=1;uint32_t start=millis();while(WiFi.status()!=WL_CONNECTED&&millis()-start<20000)vTaskDelay(pdMS_TO_TICKS(200));
  bool ok=false;
  if(WiFi.status()==WL_CONNECTED){netState=2;start=millis();while(time(nullptr)<1700000000&&millis()-start<15000)vTaskDelay(pdMS_TO_TICKS(200));if(time(nullptr)>=1700000000)ok=fetchFrame(etag);else httpCode=-13;}
  else httpCode=-14;
  netState=ok?3:-2;Serial.printf("SYNC result=%s code=%d; previous frame preserved on failure\n",ok?"OK":"FAILED",httpCode);
  uint32_t deadline=millis()+(ok?POLL_MS:RETRY_MS);ulTaskNotifyTake(pdTRUE,pdMS_TO_TICKS(ok?POLL_MS:RETRY_MS));
  // Manual sync is bounded to one attempt per 30 seconds.
  uint32_t elapsed=millis()-start;if(elapsed<RETRY_MS)vTaskDelay(pdMS_TO_TICKS(RETRY_MS-elapsed));(void)deadline;
 }
}
void text(int x,int y,const char* value,int size=2){display.setTextSize(size);display.setCursor(x,y);display.print(value);}
void statusPage(){
 display.fillScreen(GxEPD_WHITE);display.fillRect(0,0,400,35,GxEPD_BLACK);display.setTextColor(GxEPD_WHITE);text(15,9,"FRIDGE / CONNECTION",2);display.setTextColor(GxEPD_BLACK);
 text(16,65,WiFi.status()==WL_CONNECTED?"WiFi connected":"WiFi connecting / offline",2);
 const char* state=netState==3?"SYNC OK":netState==-1?"Setup required":netState==-2?"Retrying; old frame kept":"Connecting securely...";text(16,108,state,2);
 char row[60];snprintf(row,sizeof(row),"HTTP %d   cache %s",httpCode,cacheSaved?"saved":cacheReady?"ready":"unavailable");text(16,151,row,2);
 snprintf(row,sizeof(row),"Last sync: %lu min ago",lastSuccess?(unsigned long)((millis()-lastSuccess)/60000):0UL);text(16,187,lastSuccess?row:"Last sync: not yet",2);
 text(16,232,"GPIO4: page  5: sync",2);text(16,268,"13: home / status",2);
}
void draw(){
 if(!hasFrame&&page==0)page=1;
 display.setFullWindow();display.firstPage();do{if(page==0){display.fillScreen(GxEPD_WHITE);display.drawBitmap(0,0,current.bytes,400,300,GxEPD_BLACK);}else statusPage();}while(display.nextPage());display.hibernate();refreshEnded=millis();dirty=false;
 for(int i=0;i<3;i++){keys[i].raw=keys[i].stable=digitalRead(KEYS[i]);keys[i].changed=millis();}
 Serial.printf("DISPLAY RETURNED page=%d has_frame=%d cache_saved=%d; visual confirmation required\n",page,hasFrame,cacheSaved);
}
void report(){Serial.printf("STATE page=%d net=%d http=%d has_frame=%d cache=%d uptime=%lu\n",page,netState,httpCode,hasFrame,cacheSaved,(unsigned long)millis());}
void action(int key){if(key==1){if(workerHandle&&netState!=-1)xTaskNotifyGive(workerHandle);}else{page=page?0:1;dirty=true;}Serial.printf("KEY GPIO%d action=%s\n",KEYS[key],key==1?"sync":"page");}
void setup(){
 Serial.begin(115200);delay(1500);for(int i=0;i<3;i++)pinMode(KEYS[i],INPUT_PULLUP);
 cacheReady=LittleFS.begin(true);hasFrame=loadCache();cacheSaved=hasFrame;
 SPI.begin(2,-1,3,7);display.epd2.selectSPI(SPI,SPISettings(1000000,MSBFIRST,SPI_MODE0));display.init(115200,true,2,false);display.setRotation(2);display.mirror(true);
 frames=xQueueCreate(1,sizeof(Frame*));if(!frames){netState=-1;page=1;draw();return;}
 if(xTaskCreate(networkTask,"fridge-sync",10000,nullptr,1,&workerHandle)!=pdPASS){workerHandle=nullptr;netState=-1;}
 if(hasFrame)draw();else{dirty=false;refreshEnded=millis();} // Preserve existing physical image while first network attempt runs.
 Serial.printf("BOOT has_cached_frame=%d cache_ready=%d\n",hasFrame,cacheReady);
}
void loop(){
 Frame* next=nullptr;if(frames&&xQueueReceive(frames,&next,0)==pdTRUE){bool changed=!hasFrame||memcmp(current.sha,next->sha,65)!=0;memcpy(&current,next,sizeof(Frame));delete next;hasFrame=true;if(changed){cacheSaved=saveCache();page=0;dirty=true;}}
 if(lastNet!=netState){lastNet=netState;if(page==1)dirty=true;}
 while(Serial.available()){char c=Serial.read();if(c=='s')report();if(c=='n')action(1);if(c=='p')action(0);}
 uint32_t now=millis();for(int i=0;i<3;i++){int level=digitalRead(KEYS[i]);if(level!=keys[i].raw){keys[i].raw=level;keys[i].changed=now;}if(level!=keys[i].stable&&uint32_t(now-keys[i].changed)>=40){keys[i].stable=level;if(level==LOW){++pressCount[i];action(i);}}}
 if(dirty&&uint32_t(now-refreshEnded)>=REFRESH_GAP)draw();delay(2);
}
