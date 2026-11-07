// Hardware initialization and pins from the verified VIEWE MD50E example.
// Local interaction prototype; no network, pairing or inventory writes.
#include <Arduino.h>
#include <esp_display_panel.hpp>
#include <lvgl.h>
#include "lvgl_v8_port.h"
#include <ESP_Knob.h>
#include <Button.h>
#include "pebble_network.h"
#include "pebble_sync.h"

LV_FONT_DECLARE(pebble_zh24);
LV_FONT_DECLARE(pebble_zh18);
struct Step { const char *text; uint32_t seconds; };
static const Step steps[] = {{"重新开火",0},{"倒入5ml油",0},{"油热后放入菠菜",0},{"大火翻炒15秒",15},{"倒入鸡蛋块",0},{"翻炒均匀",0},{"关小火并确认鸡蛋块已熟透后再出锅",0}};
static constexpr int stepCount = sizeof(steps)/sizeof(steps[0]);
static int current = 0, page = 0;
static bool active = true, running = false;
static uint32_t remaining = 0, startedAt = 0;
static lv_obj_t *heading, *action, *clockLabel, *statusLabel, *networkLabel;
static uint32_t lastShown = UINT32_MAX;
static PebbleRemoteState remote{};
static const char *currentText(){return pebbleSyncConfigured()?remote.text:steps[current].text;}
static uint32_t currentDuration(){return pebbleSyncConfigured()?remote.durationSeconds:steps[current].seconds;}
// Seven 24px Chinese characters fit a 190px label. Two lines per page.
static int characters(const char *s) { int n=0; for(;*s;s++)if((*s&0xc0)!=0x80)n++; return n; }
static int pages(int step) { return max(1,(characters(pebbleSyncConfigured()?remote.text:steps[step].text)+13)/14); }
static String pageText(const char *s,int index) {
    String result; int character=0, shown=0;
    while(*s) {
        int bytes=(*s&0x80)==0?1:(*s&0xe0)==0xc0?2:(*s&0xf0)==0xe0?3:4;
        if(character>=index*14 && character<(index+1)*14) {
            if(shown==7)result+='\n';
            for(int i=0;i<bytes;i++)result+=s[i];
            shown++;
        }
        s+=bytes;character++;
    }
    return result;
}
static uint32_t timeLeft() {
    if (!running) return remaining;
    uint32_t elapsed = millis() - startedAt;
    return elapsed >= remaining ? 0 : remaining - elapsed;
}
static void render() {
    if(pebbleSyncConfigured()&&!remote.present){
        lv_label_set_text(heading,"WAIT PHONE");lv_label_set_text(action,"");
        lv_label_set_text(clockLabel,"--:--");lv_label_set_text(statusLabel,"");return;
    }
    uint32_t ms = timeLeft();
    if (running && ms == 0) { running = false; remaining = 0; }
    if(active)lv_label_set_text_fmt(heading,"%02d / %02d   %d/%d",current+1,pebbleSyncConfigured()?remote.count:stepCount,page+1,pages(current));
    else lv_label_set_text(heading,"COOKING PEBBLE");
    lv_label_set_text(action, active ? pageText(currentText(),page).c_str() : "已退出");
    uint32_t seconds = (ms + 999)/1000;
    if(active && !currentDuration())lv_label_set_text(clockLabel,"--:--");
    else lv_label_set_text_fmt(clockLabel,"%02lu:%02lu",(unsigned long)(seconds/60),(unsigned long)(seconds%60));
    lv_label_set_text(statusLabel, !active ? (pebbleSyncConfigured()?"已退出":"短按重来") : !currentDuration() ? "此步无计时" : running ? "计时中" : ms == 0 ? "计时完成" : "已暂停");
    lastShown = seconds;
}
static void moveStep(int direction) {
    lvgl_port_lock(-1);
    if (active) {
        if(direction>0 && page+1<pages(current)){page++;render();lvgl_port_unlock();return;}
        if(direction<0 && page>0){page--;render();lvgl_port_unlock();return;}
        int next = current + direction;
        if(pebbleSyncConfigured()){
            if(remote.present && next>=0 && next<remote.count)pebbleSyncSend(PebbleCommand::SetStep,remote,next);
            lvgl_port_unlock();return;
        }
        if (next >= 0 && next < stepCount) {
            current = next; page=direction>0?0:pages(current)-1; running = false; remaining = steps[current].seconds*1000; render();
        }
    }
    lvgl_port_unlock();
}
static void left(int,void*) { moveStep(-1); }
static void right(int,void*) { moveStep(1); }
static void click(void*,void*) {
    lvgl_port_lock(-1);
    if(pebbleSyncConfigured()){pebbleSyncSend(PebbleCommand::ToggleTimer,remote);lvgl_port_unlock();return;}
    if (!active) { active=true; current=0; page=0; remaining=steps[0].seconds*1000; running=false; }
    else if (running) { remaining=timeLeft(); running=false; }
    else if (remaining) { startedAt=millis(); running=true; }
    render(); lvgl_port_unlock();
}
static void longPress(void*,void*) {
    lvgl_port_lock(-1);
    if(pebbleSyncConfigured()){pebbleSyncSend(PebbleCommand::Exit,remote);lvgl_port_unlock();return;}
    active=false; running=false; remaining=0; render();
    lvgl_port_unlock();
}
static lv_obj_t *label(int y,const lv_font_t *font) {
    lv_obj_t *obj=lv_label_create(lv_scr_act());
    lv_obj_set_width(obj,190); lv_obj_set_style_text_align(obj,LV_TEXT_ALIGN_CENTER,0);
    lv_obj_set_style_text_font(obj,font,0); lv_obj_align(obj,LV_ALIGN_TOP_MID,0,y); return obj;
}
void setup() {
    Serial.begin(115200);
    auto *board = new esp_panel::board::Board();
    board->init(); assert(board->begin());
    lvgl_port_init(board->getLCD(),board->getTouch());
    lvgl_port_lock(-1);
    lv_obj_set_style_bg_color(lv_scr_act(),lv_color_hex(0x152923),0);
    lv_obj_set_style_text_color(lv_scr_act(),lv_color_hex(0xFFF5DF),0);
    networkLabel=label(18,&lv_font_montserrat_14);
    lv_label_set_text(networkLabel,"WIFI ...");
    heading=label(38,&lv_font_montserrat_16);
    action=label(72,&pebble_zh24);
    clockLabel=label(136,&lv_font_montserrat_32);
    statusLabel=label(182,&pebble_zh18);
    render();
    lvgl_port_unlock();
    auto *knob=new ESP_Knob(7,6); knob->begin();
    knob->attachLeftEventCallback(left); knob->attachRightEventCallback(right);
    auto *button=new Button(GPIO_NUM_9,false);
    button->attachSingleClickEventCb(click,nullptr);
    button->attachLongPressStartEventCb(longPress,nullptr);
    pebbleNetworkBegin();
    pebbleSyncBegin();
}
void loop() {
    pebbleNetworkTick();
    lvgl_port_lock(-1);
    PebbleRemoteState update;
    if(pebbleSyncTake(update)){
        if(strcmp(remote.session,update.session)!=0 || remote.index!=update.index)page=0;
        remote=update;current=remote.index;active=remote.present&&remote.active;
        running=remote.running;remaining=remote.remainingMs;startedAt=remote.receivedAt;
        page=min(page,pages(current)-1);render();
    }
    static int lastNetwork=-1;
    int network=static_cast<int>(pebbleNetworkState());
    if(network!=lastNetwork){
        const bool connected=pebbleNetworkState()==PebbleNetwork::Connected;
        lv_label_set_text(networkLabel,connected?"WIFI OK":pebbleNetworkState()==PebbleNetwork::Unconfigured?"WIFI OFF":"WIFI ...");
        lv_obj_set_style_text_color(networkLabel,lv_color_hex(connected?0x9DE8A9:0xE8CE94),0);
        lastNetwork=network;
    }
    if ((timeLeft()+999)/1000 != lastShown) render();
    lvgl_port_unlock();
    delay(30);
}
