#include <SPI.h>
#include <GxEPD2_BW.h>
#include "GxEPD2_420c_Z96.h"
#include "DemoPages.h"
#if __has_include("InventoryPage.local.h")
#include "InventoryPage.local.h"
#define HAS_INVENTORY_SNAPSHOT 1
#else
#define HAS_INVENTORY_SNAPSHOT 0
#endif
constexpr uint8_t BUTTON_PINS[]={4,5,13};
constexpr uint32_t REFRESH_GAP_MS=15000;
GxEPD2_BW<GxEPD2_420c_Z96,GxEPD2_420c_Z96::HEIGHT> display(GxEPD2_420c_Z96(7,6,10,0));
struct Button{int raw=HIGH,stable=HIGH; uint32_t changed=0,presses=0;} buttons[3];
int requestedPage=0,shownPage=-1;
uint32_t refreshEnded=0,refreshCount=0;
void report(){
  Serial.printf("STATE requested=%d shown=%d refreshes=%lu uptime=%lu gap_ms=%lu\n",requestedPage,shownPage,(unsigned long)refreshCount,(unsigned long)millis(),(unsigned long)REFRESH_GAP_MS);
  for(int i=0;i<3;i++)Serial.printf("GPIO%d presses=%lu level=%d\n",BUTTON_PINS[i],(unsigned long)buttons[i].presses,digitalRead(BUTTON_PINS[i]));
}
void action(char key){
  if(key=='p') requestedPage=(requestedPage+2)%3;
  if(key=='n') requestedPage=(requestedPage+1)%3;
  if(key=='a') requestedPage=requestedPage==1?3:requestedPage==3?1:requestedPage==0?1:0;
  Serial.printf("ACTION %c requested=%d; queued until refresh gap elapsed\n",key,requestedPage);
}
const uint8_t* inventoryPage(){
#if HAS_INVENTORY_SNAPSHOT
  return INVENTORY_PAGE;
#else
  return PAGE_0;
#endif
}
void refreshPage(){
  const int page=requestedPage;
  uint32_t started=millis();
  Serial.printf("REFRESH START page=%d; input polling pauses during display update\n",page);
  display.setFullWindow();display.firstPage();
  do{display.fillScreen(GxEPD_WHITE);display.drawBitmap(0,0,(HAS_INVENTORY_SNAPSHOT && page==0 ? inventoryPage() : PAGES[page]),400,300,GxEPD_BLACK);}while(display.nextPage());
  display.hibernate();shownPage=page;refreshEnded=millis();++refreshCount;
  // Synchronize after blocking refresh: do not replay a key held across refresh.
  for(int i=0;i<3;i++){buttons[i].raw=buttons[i].stable=digitalRead(BUTTON_PINS[i]);buttons[i].changed=millis();}
  Serial.printf("REFRESH RETURNED page=%d elapsed_ms=%lu; visual confirmation required\n",page,(unsigned long)(millis()-started));
  report();
}
void setup(){
  Serial.begin(115200);delay(2000);
  Serial.println("FRIDGE DEMO v1 OFFLINE / sample data only / p prev, n next, a action, s state");
  for(int i=0;i<3;i++)pinMode(BUTTON_PINS[i],INPUT_PULLUP);
  SPI.begin(2,-1,3,7);display.epd2.selectSPI(SPI,SPISettings(1000000,MSBFIRST,SPI_MODE0));
  display.init(115200,true,2,false);display.setRotation(2);display.mirror(true);
  Serial.printf("INVENTORY_SNAPSHOT=%d; other pages remain DEMO\n",HAS_INVENTORY_SNAPSHOT);
  refreshPage();
}
void loop(){
  while(Serial.available()){char c=Serial.read();if(c=='s')report();else if(c=='p'||c=='n'||c=='a')action(c);}
  const uint32_t now=millis();
  for(int i=0;i<3;i++){
    int value=digitalRead(BUTTON_PINS[i]);
    if(value!=buttons[i].raw){buttons[i].raw=value;buttons[i].changed=now;}
    if(value!=buttons[i].stable && uint32_t(now-buttons[i].changed)>=40){
      buttons[i].stable=value;
      if(value==LOW){++buttons[i].presses;Serial.printf("BUTTON GPIO%d PRESS count=%lu\n",BUTTON_PINS[i],(unsigned long)buttons[i].presses);action(i==0?'p':i==1?'n':'a');}
    }
  }
  if(requestedPage!=shownPage && uint32_t(now-refreshEnded)>=REFRESH_GAP_MS)refreshPage();
  delay(2);
}
