#include "pebble_sync.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <cJSON.h>
#include <time.h>
#include <math.h>
#include <lwip/sockets.h>
#if __has_include("pebble_sync_config.h")
#include "pebble_sync_config.h"
#else
#include "pebble_sync.example.h"
#endif
#ifndef PEBBLE_PROXY_HOST
#define PEBBLE_PROXY_HOST ""
#define PEBBLE_PROXY_PORT 18080
#define PEBBLE_PROXY_TOKEN ""
#endif
static volatile int proxyDiagnostic=0;
class ProxyTLS : public WiFiClientSecure {
public:
    using WiFiClientSecure::connect;
    int connect(const char *host,uint16_t port,int32_t timeout) override {
        setTimeout(timeout);return connect(host,port);
    }
    int connect(const char *host,uint16_t port) override {
        if(!strlen(PEBBLE_PROXY_HOST))return WiFiClientSecure::connect(host,port);
        if(strcmp(host,"blobcadhyoudubcnbdml.supabase.co")!=0||port!=443)return 0;
        IPAddress proxy;if(!proxy.fromString(PEBBLE_PROXY_HOST))return 0;
        setPlainStart();proxyDiagnostic=-201;
        // TCP goes to the PC; SNI and certificate validation use the real target.
        if(!WiFiClientSecure::connect(proxy,PEBBLE_PROXY_PORT,host,PEBBLE_ROOT_CA,nullptr,nullptr))return 0;
        proxyDiagnostic=-202;
        String request=String("CONNECT ")+host+":443 HTTP/1.1\r\nHost: "+host+":443\r\nProxy-Authorization: Bearer "+PEBBLE_PROXY_TOKEN+"\r\n\r\n";
        if(lwip_send(sslclient->socket,request.c_str(),request.length(),0)!=(int)request.length()){stop();return 0;}
        String response;uint32_t began=millis();
        // Do not call the core's plain-start read/connected helpers: its
        // peek_net_receive uses an uninitialized fd_set in this SDK version.
        while(!response.endsWith("\r\n\r\n")){
            if(response.length()>=2048||uint32_t(millis()-began)>15000){stop();return 0;}
            fd_set readSet;FD_ZERO(&readSet);FD_SET(sslclient->socket,&readSet);
            timeval wait{0,200000};
            int ready=lwip_select(sslclient->socket+1,&readSet,nullptr,nullptr,&wait);
            if(ready<0){stop();return 0;}if(!ready)continue;
            char byte;if(lwip_recv(sslclient->socket,&byte,1,0)!=1){stop();return 0;}response+=byte;
        }
        if(!response.startsWith("HTTP/1.1 200")){stop();return 0;}
        proxyDiagnostic=-203;
        proxyDiagnostic=-204;
        // Preserve the actual mbedTLS error instead of the wrapper's 0/1 result.
        int result=ssl_starttls_handshake(sslclient.get());
        if(result<0){proxyDiagnostic=result;stop();return 0;}
        _stillinPlainStart=false;proxyDiagnostic=0;return 1;
    }
};

struct Request { PebbleCommand command; char session[37]; uint32_t revision; int step; };
static QueueHandle_t incoming=nullptr, outgoing=nullptr;
static volatile int diagnostic=-104;
int pebbleSyncStatus(){return diagnostic;}
static constexpr size_t MAX_RESPONSE_BYTES=64000;
// HTTPClient decodes chunked responses into this sink. Reject oversized bodies
// while receiving them, rather than allocating an unbounded String first.
class BoundedBody : public Stream {
public:
    String data;
    bool failed=false;
    int available() override { return 0; }
    int read() override { return -1; }
    int peek() override { return -1; }
    void flush() override {}
    size_t write(uint8_t byte) override { return write(&byte,1); }
    size_t write(const uint8_t *bytes,size_t count) override {
        if(failed || count>MAX_RESPONSE_BYTES-data.length()){failed=true;return 0;}
        if(!data.concat(reinterpret_cast<const char*>(bytes),count)){failed=true;return 0;}
        return count;
    }
};
bool pebbleSyncConfigured(){return strlen(PEBBLE_API_URL)>8 && String(PEBBLE_API_URL).startsWith("https://") && strlen(PEBBLE_DEVICE_ID)==36 && strlen(PEBBLE_DEVICE_SECRET)==64 && strlen(PEBBLE_ROOT_CA)>0;}
static const cJSON *field(const cJSON *o,const char *name){return cJSON_GetObjectItemCaseSensitive(o,name);}
static bool number(const cJSON *o,const char *name,double &value){const auto *v=field(o,name);if(!cJSON_IsNumber(v))return false;value=v->valuedouble;return isfinite(value);}
static bool parse(const String &body,PebbleRemoteState &result){
    cJSON *root=cJSON_Parse(body.c_str());if(!root)return false;
    const auto *s=field(root,"state");result={};result.receivedAt=millis();
    bool valid=false;
    if(cJSON_IsNull(s)){valid=true;}
    else if(cJSON_IsObject(s)){
        const auto *id=field(s,"id"),*status=field(s,"status"),*steps=field(s,"steps");
        double index,revision,remaining,server;
        if(cJSON_IsString(id)&&strlen(id->valuestring)==36&&cJSON_IsString(status)&&cJSON_IsArray(steps)&&
          number(s,"step_index",index)&&number(s,"revision",revision)&&number(s,"remaining_ms",remaining)&&number(root,"server_time",server)&&
          index==floor(index)&&index>=0&&index<cJSON_GetArraySize(steps)&&cJSON_GetArraySize(steps)<=100&&
          revision==floor(revision)&&revision>=0&&revision<=UINT32_MAX&&remaining>=0&&remaining<=86400000&&
          (strcmp(status->valuestring,"cooking")==0||strcmp(status->valuestring,"exited")==0)){
            const auto *step=cJSON_GetArrayItem(steps,(int)index),*text=field(step,"text");double duration;
            if(cJSON_IsString(text)&&strlen(text->valuestring)<sizeof(result.text)&&number(step,"seconds",duration)&&duration==floor(duration)&&duration>=0&&duration<=86400){
                strcpy(result.session,id->valuestring);strcpy(result.text,text->valuestring);
                result.present=true;result.active=strcmp(status->valuestring,"cooking")==0;
                result.index=index;result.count=cJSON_GetArraySize(steps);result.revision=revision;result.durationSeconds=duration;
                const auto *end=field(s,"timer_ends_at");
                if(!cJSON_IsNull(end)&&(!cJSON_IsNumber(end)||!isfinite(end->valuedouble))){cJSON_Delete(root);return false;}
                result.running=cJSON_IsNumber(end)&&result.active;
                result.remainingMs=result.running?(uint32_t)fmin(86400000.0,fmax(0.0,end->valuedouble-server)):(uint32_t)remaining;
                valid=true;
            }
        }
    }
    cJSON_Delete(root);return valid;
}
static bool exchange(const char *path,const String *payload){
    ProxyTLS tls;tls.setCACert(PEBBLE_ROOT_CA);tls.setHandshakeTimeout(15);
    HTTPClient http;http.setConnectTimeout(10000);http.setTimeout(10000);
    String url=String(PEBBLE_API_URL)+"/"+path+"?device_id="+PEBBLE_DEVICE_ID;
    if(!http.begin(tls,url))return false;
    http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
    http.addHeader("x-device-secret",PEBBLE_DEVICE_SECRET);
    int code;
    if(payload){http.addHeader("Content-Type","application/json");code=http.POST(*payload);}else code=http.GET();
    diagnostic=code<0&&proxyDiagnostic?proxyDiagnostic:code;
    bool ok=false;
    if(code==200 && http.getSize()<=static_cast<int>(MAX_RESPONSE_BYTES)){
        BoundedBody body;
        const int received=http.writeToStream(&body);
        if(received>=0&&!body.failed){PebbleRemoteState s;if(parse(body.data,s)){xQueueOverwrite(incoming,&s);ok=true;}else diagnostic=-103;}
        else diagnostic=-103;
    }
    http.end();return ok;
}
static void worker(void*){
    uint32_t lastPoll=millis()-2000;
    for(;;){
        if(WiFi.status()!=WL_CONNECTED){diagnostic=-101;vTaskDelay(pdMS_TO_TICKS(200));continue;}
        if(time(nullptr)<1700000000){diagnostic=-102;vTaskDelay(pdMS_TO_TICKS(200));continue;}
        Request r;
        if(xQueueReceive(outgoing,&r,0)==pdTRUE){
            cJSON *body=cJSON_CreateObject();
            cJSON_AddStringToObject(body,"session_id",r.session);cJSON_AddNumberToObject(body,"revision",r.revision);
            cJSON_AddStringToObject(body,"action",r.command==PebbleCommand::SetStep?"set_step":r.command==PebbleCommand::ToggleTimer?"toggle_timer":"exit");
            if(r.command==PebbleCommand::SetStep)cJSON_AddNumberToObject(body,"step_index",r.step);
            char *raw=cJSON_PrintUnformatted(body);String payload(raw?raw:"");if(raw)cJSON_free(raw);cJSON_Delete(body);
            exchange("action",&payload);
            // Never retry a toggle after an ambiguous timeout. Refresh authoritative state.
            exchange("state",nullptr);lastPoll=millis();
        }else if(uint32_t(millis()-lastPoll)>=2000){exchange("state",nullptr);lastPoll=millis();}
        vTaskDelay(pdMS_TO_TICKS(50));
    }
}
void pebbleSyncBegin(){
    if(!pebbleSyncConfigured())return;
    incoming=xQueueCreate(1,sizeof(PebbleRemoteState));outgoing=xQueueCreate(1,sizeof(Request));
    if(!incoming||!outgoing){
        if(incoming)vQueueDelete(incoming);if(outgoing)vQueueDelete(outgoing);
        incoming=nullptr;outgoing=nullptr;Serial.println("Sync queue allocation failed");return;
    }
    configTime(0,0,"pool.ntp.org","time.cloudflare.com");
    if(xTaskCreate(worker,"pebble_https",12288,nullptr,1,nullptr)!=pdPASS){
        vQueueDelete(incoming);vQueueDelete(outgoing);incoming=nullptr;outgoing=nullptr;
        Serial.println("Sync task allocation failed");
    }
}
bool pebbleSyncTake(PebbleRemoteState &s){return incoming&&xQueueReceive(incoming,&s,0)==pdTRUE;}
bool pebbleSyncSend(PebbleCommand command,const PebbleRemoteState &s,int step){
    if(!outgoing||!s.present||!s.active)return false;
    Request r{};r.command=command;strcpy(r.session,s.session);r.revision=s.revision;r.step=step;
    return xQueueSend(outgoing,&r,0)==pdTRUE;
}
