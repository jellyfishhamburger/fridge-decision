#include <SPI.h>
#include <GxEPD2_BW.h>
#include "GxEPD2_420c_Z96.h"
constexpr int EPD_CS=7, EPD_DC=6, EPD_RST=10, EPD_BUSY=0, EPD_SCK=2, EPD_MOSI=3;
GxEPD2_BW<GxEPD2_420c_Z96, GxEPD2_420c_Z96::HEIGHT> display(GxEPD2_420c_Z96(EPD_CS,EPD_DC,EPD_RST,EPD_BUSY));
volatile uint32_t edges=0;
void IRAM_ATTR busyEdge(){ ++edges; }
void sample(const char* phase){
  uint32_t high=0,low=0,start=millis(),before=edges;
  while(millis()-start<1000){ if(digitalRead(EPD_BUSY)) ++high; else ++low; delay(1); }
  Serial.printf("%s: high_samples=%lu low_samples=%lu edges=%lu\n",phase,(unsigned long)high,(unsigned long)low,(unsigned long)(edges-before));
}
void setup(){
  Serial.begin(115200); delay(2000);
  Serial.println("FRIDGE Z96 vendor driver; reset=2ms; BUSY active HIGH; one test only");
  Serial.println("EPD_CS=7 EPD_DC=6 EPD_RST=10 EPD_BUSY=0 EPD_SCK=2 EPD_MOSI=3; no unknown power GPIO driven");
  pinMode(EPD_BUSY,INPUT); attachInterrupt(digitalPinToInterrupt(EPD_BUSY),busyEdge,CHANGE);
  sample("before init");
  SPI.begin(EPD_SCK,-1,EPD_MOSI,EPD_CS);
  display.epd2.selectSPI(SPI,SPISettings(1000000,MSBFIRST,SPI_MODE0));
  display.init(115200,true,2,false);
  sample("after init");
  display.setRotation(2); display.mirror(true); display.setFullWindow();
  uint32_t start=millis(),before=edges;
  display.firstPage();
  do{
    display.fillScreen(GxEPD_WHITE);
    display.drawRect(0,0,display.width(),display.height(),GxEPD_BLACK);
    display.fillRect(20,25,80,60,GxEPD_BLACK);
    display.setTextColor(GxEPD_BLACK); display.setTextSize(3);
    display.setCursor(20,130); display.print("FRIDGE");
    display.setCursor(20,170); display.print("DECISION");
  }while(display.nextPage());
  Serial.printf("API returned: elapsed_ms=%lu busy_edges=%lu level=%d; VISUAL CONFIRMATION REQUIRED\n",(unsigned long)(millis()-start),(unsigned long)(edges-before),digitalRead(EPD_BUSY));
  sample("after refresh"); display.hibernate();
  Serial.println("One attempt only. No automatic refresh loop.");
}
void loop(){delay(1000);}
