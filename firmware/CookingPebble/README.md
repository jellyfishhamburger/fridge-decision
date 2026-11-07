# Cooking Pebble 本地交互原型

当前实物验证版本已更新为中文演示：7 个动作，第 4 个动作有 15 秒计时，第 7 个动作用于测试两页显示。正文 24px，每行最多 7 字、每页两行；转动先翻同一动作的页面，再切动作。翻页不重置计时。无时长的动作显示 --:--。

## Wi-Fi 准备（尚未实物联网验证）

将 pebble_secrets.example.h 复制为 pebble_secrets.h，仅在本地填写 2.4GHz Wi-Fi 名称及密码。该文件已加入忽略规则。未配置时继续运行本地演示；连接不等待成功，断线不改变步骤及计时，每 30 秒尝试重连。串口只报告连接状态，不打印名称和密码。当前仅有 Wi-Fi 连接层，尚无 HTTPS 同步，不代表已连接手机或云端。

## HTTPS 客户端（尚未端到端验证）

pebble_sync.cpp 增加独立 FreeRTOS 任务，每 2 秒轮询；HTTP 请求不持有 LVGL 锁。按键操作包含 session_id 和 revision，超时后不盲重发 toggle_timer，而是刷新权威状态。分页仍在本地，切动作才发送 set_step。服务器倒计时通过 server_time 换算为本地 millis()，不依赖屏幕刷新次数。

仅在 pebble_sync_config.h 中填写 HTTPS 地址、设备 UUID、设备独立密钥、PEM 根证书后启用。必须有有效网络时间才能校验证书；不会使用 setInsecure 或转发密钥到重定向目标。配置文件不入 Git。不配置时维持本地演示。配置后无会话显示 WAIT PHONE，退出需在手机重新开会话。

该客户端未连接真实接口，也未烧录验收；当前演示字库只覆盖 font-text.txt。开放真实菜谱前还需扩大字库覆盖，并完成数据库隔离/并发和实物 HTTPS 验证。此节取代上文“尚无 HTTPS 同步”的开发阶段描述。

中文字库为本机生成的演示子集，不覆盖所有菜谱。使用 tools/make-pebble-font.py 和 font-text.txt 生成 pebble_zh24.c、pebble_zh18.c；生成文件不入 Git。真实菜谱接入前须解决完整字库覆盖。后文英文版验收记录仅作为此前版本的历史说明。

仅适用于 UEDX24240013-MD50E（ESP32-C3 / GC9A01 / 240×240）。屏幕、旋钮、按键引脚及 LVGL 配置来自已经实物验证的厂家 SquareLinePorting 示例，未重新猜测引脚。

- 旋转：切换步骤；到首尾停止，切步停止并重置计时。
- 短按：开始或暂停；倒计时完成显示 DONE。
- 长按：退出并停止计时；退出后短按重新进入第一步，旋转无效。
- 使用 millis() 计算倒计时，不因屏幕刷新丢秒。
- 当前为五步英文演示数据，未连接手机、Wi-Fi、Supabase，不修改库存。计时不能作为真实菜谱的烹饪依据。断电后重置。

依赖：esp32 core 3.1.0，厂家仓库 Libraries 中的 ESP32_Display_Panel 1.0.3、esp-lib-utils 0.1.2、ESP32_IO_Expander 1.0.1、ESP32_Knob 0.0.1、ESP32_Button 0.0.1、LVGL 8.4.0。

## 构建和烧录注意

开发板 esp32:esp32:esp32c3；通过 CLI 的 --libraries 指向厂家 Libraries。
使用自带 partitions.csv，程序容量检查 upload.maximum_size=2560000。
**程序写入地址必须是 0x20000**，不能使用 Arduino 默认 0x10000。
启动程序位于 0x0，分区表位于 0x8000；此分区不使用默认 OTA boot_app0。
烧录前检查生成的分区二进制并保留原厂全 Flash 备份。

## 实物验收

1. 显示 STEP 01 / 05、Beat the eggs、00:30。
2. 旋转切步，首尾不会越界。
3. 短按开始倒数，再短按暂停；等待数秒仍保持，再短按继续。
4. 计时中切步，新步骤时间重置且暂停。
5. 长按显示 Session ended；松手不自动重启，短按重新进入。

编译通过只代表构建成功，实物验收完成后才能认定交互通过。

配置文件和 lvgl_v8_port.cpp/.h 保留厂家源码中的许可证声明。
