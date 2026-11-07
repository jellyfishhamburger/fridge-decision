#include <SPI.h>
#include <esp_system.h>
#include <GxEPD2_BW.h>
#include "GxEPD2_420c_Z96.h"
// Verified display configuration, 2026-11-07. Keep vendor driver alongside sketch.
constexpr int EPD_CS=7, EPD_DC=6, EPD_RST=10, EPD_BUSY=0;
constexpr int EPD_SCK=2, EPD_MOSI=3;
constexpr uint8_t BUTTON_PINS[]={4,5,13};
GxEPD2_BW<GxEPD2_420c_Z96,GxEPD2_420c_Z96::HEIGHT> display(GxEPD2_420c_Z96(EPD_CS,EPD_DC,EPD_RST,EPD_BUSY));
struct Button { int raw; int stable; uint32_t changed; } buttons[3];
bool activeHigh=false;
uint32_t transitions[2][3]={};
uint32_t rawTransitions[2][3]={};
uint32_t snapshotsAt=0;
void configureButtons(bool high){
  activeHigh=high;
  for(int i=0;i<3;i++){
    pinMode(BUTTON_PINS[i],high?INPUT_PULLDOWN:INPUT_PULLUP);
    buttons[i].raw=buttons[i].stable=digitalRead(BUTTON_PINS[i]);
    buttons[i].changed=millis();
  }
  Serial.printf("BUTTON MODE: %s; pins 4/5/13 are INPUTS ONLY\n",high?"active HIGH, pulldown":"active LOW, pullup");
  Serial.println("Press each physical button once. v=pulldown, g=pullup, s=levels. No screen refresh per press.");
}
void printLevels(){
  Serial.printf("UPTIME_MS=%lu MODE=%s RESET_REASON=%d\n",(unsigned long)millis(),activeHigh?"HIGH":"LOW",(int)esp_reset_reason());
  for(int m=0;m<2;m++) for(int i=0;i<3;i++) Serial.printf("TOTAL mode=%s GPIO%d raw=%lu stable=%lu\n",m?"HIGH":"LOW",BUTTON_PINS[i],(unsigned long)rawTransitions[m][i],(unsigned long)transitions[m][i]);
  Serial.printf("LEVELS GPIO4=%d GPIO5=%d GPIO13=%d\n",digitalRead(4),digitalRead(5),digitalRead(13));
}
void setup(){
  Serial.begin(115200); delay(2000);
  Serial.println("FRIDGE BUTTON DIAGNOSTIC v2 counters / Z96 verified display driver");
  SPI.begin(EPD_SCK,-1,EPD_MOSI,EPD_CS);
  display.epd2.selectSPI(SPI,SPISettings(1000000,MSBFIRST,SPI_MODE0));
  display.init(115200,true,2,false);
  display.setRotation(2); display.mirror(true); display.setFullWindow();
  uint32_t started=millis();
  display.firstPage();
  do{
    display.fillScreen(GxEPD_WHITE); display.setTextColor(GxEPD_BLACK);
    display.drawRect(0,0,400,300,GxEPD_BLACK);
    display.setTextSize(3); display.setCursor(20,30); display.print("FRIDGE DECISION");
    display.setTextSize(2); display.setCursor(20,100); display.print("BUTTON TEST V2");
    display.setCursor(20,145); display.print("1: GPIO4  2: GPIO5");
    display.setCursor(20,180); display.print("3: GPIO13");
    display.setCursor(20,240); display.print("USB SERIAL: 115200");
  }while(display.nextPage());
  display.hibernate();
  Serial.printf("DISPLAY API returned in %lu ms; visual confirmation required\n",(unsigned long)(millis()-started));
  configureButtons(true); printLevels();
}
void loop(){
  while(Serial.available()){
    char c=Serial.read();
    if(c=='v') configureButtons(true);
    if(c=='g') configureButtons(false);
    if(c=='s') printLevels();
  }
  uint32_t now=millis();
  for(int i=0;i<3;i++){
    int value=digitalRead(BUTTON_PINS[i]);
    if(value!=buttons[i].raw){++rawTransitions[activeHigh?1:0][i]; buttons[i].raw=value; buttons[i].changed=now;}
    if(value!=buttons[i].stable && uint32_t(now-buttons[i].changed)>=40){
      buttons[i].stable=value; ++transitions[activeHigh?1:0][i];
      Serial.printf("BUTTON%d GPIO%d level=%d %s mode=%s t=%lu\n",i+1,BUTTON_PINS[i],value,(value==(activeHigh?HIGH:LOW))?"PRESS":"RELEASE",activeHigh?"HIGH":"LOW",(unsigned long)now);
    }
  }
  if(uint32_t(now-snapshotsAt)>=10000){snapshotsAt=now; printLevels();}
  delay(2);
}
