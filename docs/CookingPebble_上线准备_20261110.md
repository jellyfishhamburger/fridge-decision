# Cooking Pebble 上线推进记录 · 2026-11-10

## 硬件体检（COM5）

| 项 | 结果 |
|---|---|
| 芯片 | ESP32-C3 (QFN32) rev v0.4，晶振 40 MHz |
| Flash | 4 MB 内置（XMC），`Detected flash size: 4MB` |
| USB | 原生 USB-Serial-JTAG（`303A:1001`），无需 CH340 |
| 分区表 | `nvs 0x9000/24K`、`phy_init 0xf000/4K`、`fctry 0x10000/24K`、**factory app @0x20000，2500K** |
| 当前固件 | 不是出厂固件，而是本项目 `firmware/CookingPebble` 的构建产物（二进制内含 `...\fridge-decision\firmware\CookingPebble\lvgl_v8_port.cpp` 路径与 `vendor-MD50E\Libraries\ESP32_Display_Panel`），即"离线可用、未联网"的那一版 |

**全片备份**（改动前）：
`Desktop/IDT课程/IDAT7211/pebble/backup/factory_app.bin`，2 560 000 字节 @0x20000，
SHA256 `f7c1d405449f54b7365362504d8c494e28d0193c133bcdded9fe58157c2caeb8`。
恢复：`esptool --port COM5 write_flash 0x20000 factory_app.bin`

## 厂家库

git clone `https://gitee.com/VIEWESMART/UEDX24240013-MD50ESP32_1.3inch-Knob.git`
→ `Desktop/IDT课程/IDAT7211/pebble/vendor-MD50E`（297 MB），`Libraries/` 内含
ESP32_Display_Panel 1.0.3、esp-lib-utils 0.1.2、ESP32_IO_Expander 1.0.1、
ESP32_Knob 0.0.1、ESP32_Button 0.0.1、lvgl 8.4.0、ui 1.0。

## 构建

```
arduino-cli compile --fqbn esp32:esp32:esp32c3 \
  --libraries "<vendor>/Libraries" \
  --build-path <tmp>/pebble-bp \
  --build-property "upload.maximum_size=2560000" \
  --output-dir <tmp>/pebble-build firmware/CookingPebble
```

要点：

- 字体必须先生成（`pebble_zh24.c` / `pebble_zh18.c` 不入 Git）：
  `python tools/make-pebble-font.py --font C:/Windows/Fonts/msyh.ttc --size 24 --name pebble_zh24 --text firmware/CookingPebble/font-text.txt --out firmware/CookingPebble/pebble_zh24.c`
  （18 同理）；否则链接报 `undefined reference to pebble_zh24/zh18`。
- `partitions.csv` 由 sketch 自带，app 区 2500K；但**容量检查来自 board 的 `upload.maximum_size`**，默认 1.31 MB 会报 `text section exceeds available space in board`，必须覆盖成 2560000。
- 写入地址 **0x20000**，不是 Arduino 默认 0x10000。

## 服务端（已完成）

| 项 | 状态 |
|---|---|
| `pebble_sessions` 表（013 草稿内容） | 已建，RLS 仅 service_role |
| `device-api` 函数 | 已部署（自包含 bundle：`pebble-state.js` 复制进函数目录后才可独立部署） |
| 旋钮设备注册 | `devices` 新增 `CookingPebble MD50E`，household = 慧的家，secret 只存 SHA256 |
| 手机侧 RPC | 已执行 `014_pebble_phone.sql`、`015_pebble_phone_action.sql` |
| 接口自测 | `GET /state` → 200 返回当前 session；`GET /inventory` → 200 |

设备私有文件：`Desktop/IDT课程/IDAT7211/pebble/private/pebble-device.local.json`
固件私有头：`firmware/CookingPebble/pebble_secrets.h`、`pebble_sync_config.h`（均已 gitignore）

## 待办

1. 烧录后确认旋钮屏出现步骤文字与倒计时（WAIT PHONE / 步骤页）。
2. 手机端 `pebble-test.html` 目前只在硬件分支，未发布到 main；端到端需要它或等价 UI。
3. 旋钮/按键的物理动作与 RPC 的联调（旋转切步、短按计时、长按退出）。

## 端到端验证（2026-11-11 00:23 UTC+8）

手机侧（本地联调页 `pebble-demo.html`，登录后调 RPC）→ 云端 → 旋钮屏，整条链路打通：

| 动作 | 证据 |
|---|---|
| 手机发出「开始做饭」 | `pebble_sessions` 出现 `recipe_id=demo_spinach`，`revision=0` |
| 旋钮屏显示步骤 | 屏上出现页（用户目视确认） |
| 旋钮转动 / 短按 | `revision 0 → 9`，`step_index 0 → 2`，`timer_ends_at` 被写入 |
| 手机侧改步 | 点「上一步」→ `step_index` 2 → **1**，旋钮屏跟随 |
| 旋钮短按计时 | `timer_ends_at=1794327953814` 写入，`remaining_ms=20000` |

最终实测：`revision=9`、`step_index=1`、`status=cooking`、`timer_ends_at` 有值——两个方向（手机→屏、屏→云端）都验证通过。

接口：`GET /device-api/state`（设备，device_secret 鉴权）与 `POST /rpc/pebble_start|pebble_action|pebble_read`（手机，用户 JWT + 家庭成员校验）。

已知限制：
- `account.html` 在账号已有家庭时隐藏「用邀请码加入」入口，但后端 `join_household` 允许加入多个家；
  `pebble-demo.html` 补了这个入口（预填 `D34MVM`）。
- 旋钮屏字库只有 `font-text.txt` 里的 67 个字形，真实菜谱接入前必须扩大字库，否则出现方框。
- `pebble-test.html` / `pebble-test.js` 指向旧测试项目 `blobcadhyoudubcnbdml.supabase.co`，已不适用。

## 冰箱屏电池版：按键唤醒验收（2026-11-11）

硬件真相：板子上有一个**拨动开关**，之前处于"关"的位置，所以电池不供电；拨到另一边后电池正常（离线也能按）。
白色 JST 旁边丝印是 **5V**，电池应接 **bat+/bat-** 焊盘——实际接法待卖家确认。

按键修复：原先在唤醒后直接 `digitalRead()`，手松得快会读到"已松开"，导致整屏重刷但页面不变。
改用 `esp_sleep_get_gpio_wakeup_status()` 锁存唤醒引脚后实测：

```
BOOT cause=7            ← 7 = ESP_SLEEP_WAKEUP_GPIO
WAKE mask=0x10 prev=1   ← 左键
DRAW page=3/3
...
BOOT cause=7
WAKE mask=0x20 next=1   ← 中键
DRAW page=1/3
```

已知限制：GPIO13（右键）不能作为 C3 深睡唤醒源，电池版只有左/中两个键；刷屏那 4 秒内的按键会被忽略。
