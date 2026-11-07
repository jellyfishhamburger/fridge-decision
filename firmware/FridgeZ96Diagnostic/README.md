# Z96 独立诊断（实体屏验收通过，2026-11-07）

来源：用户提供 AirM2M ESP32C3 Z96.rar 内 Stock 工程。
GxEPD2_420c_Z96.h/.cpp 为原样复制，未修改驱动命令。头文件内面板注释、panel 枚举并不完全一致，不能当作实际面板型号识别结果。

板：esp32:esp32:AirM2M_CORE_ESP32C3；ESP32 core 3.1.0；GxEPD2 1.6.9；串口 COM4 / 115200。
CS7 DC6 RST10 BUSY0 SCK2 MOSI3；SPI 全局实例，1MHz MODE0；复位2ms；BUSY高电平忙。
使用与卖家股票示例相同的 BW 包装、rotation=2、mirror=true；无联网和股票逻辑。只显示黑块、边框和 FRIDGE DECISION，单次刷新后休眠。

必须看到实体屏闪烁并出现测试图案才能验收。API returned 或上传校验不是实体屏成功证据。若出现 Busy Timeout，保留日志，不自动重复。

实测已编译上传：_Update_Full=4082000us，分页调用4725ms，busy_edges=13。用户已目视确认出现测试画面，实体屏验收通过。

## 编译与上传

在 Arduino IDE 中打开同目录 FridgeZ96Diagnostic.ino，保持本目录 .h/.cpp 一起存在。安装 GxEPD2 1.6.9 和其 Adafruit GFX 依赖；选择 AirM2M_CORE_ESP32C3、4MB Flash、串口 COM4（重新插拔后可能变化）。编译后上传；115200 波特率查看日志。每次启动只测试一次，随后休眠。

成功配置为本目录包内自定义 GxEPD2_420c_Z96，不能仅通过改成 M01 或修改 BUSY 极性替代。该结果确认驱动可用，并未独立核实实体面板准确型号。后续产品固件先复用此配置。
