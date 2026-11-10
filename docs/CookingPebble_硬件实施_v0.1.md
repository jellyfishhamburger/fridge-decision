# Cooking Pebble 硬件实施报告 v0.1（Phase 0：审计 + 定案 + 采购 + 接线）

> 2026-11-03 · 面向零硬件基础的执行版
> 读法：先看第 0–1 节（这个思路哪里对、哪里必须先改），再按第 4 节下单，其余等元件到货再按阶段做。
> 价格是 2026-11 查到的公开价（USD/EUR），人民币为估算；**没有编造链接，没查到就不给链接**。

---

## 0. 结论：思路成立，但有三个必须先改的地方

**成立的部分**（这些别改）：
- 旋钮是这个项目最对的输入设备：**不用看、不用瞄准、湿手能转**，比触摸屏和语音都适合厨房。
- "旋转预览、按压确认"的动机（防误触）是对的。
- 1.28″ 圆屏 + 灯环的组合很聪明：**文字给近看，光给远看**。
- ESP32-S3 + GC9A01 + EC11 + WS2812B 这套组合在电气上完全可行，元件都成熟。

**必须先改的三处**（不改会白买元件 / 白打印外壳）：

### ① 1.28″ 屏在台面上，站着看不清

- 240 px 圆屏，16 px 中文一行约 13 字，24 px 一行约 9 字。
- 台面 85–90 cm、视线 150–155 cm：俯角 45–55°，屏上文字的**有效高度被压掉 30–45%**；
- 更关键：**你要求一屏同时放 6 样东西**（菜名、03/05、步骤名、说明、计时、进度）。240 px 放不下，硬塞就是每样都小到看不清。

**改法**：屏幕只放三样——**大号步骤号（如 03）+ 一行 8–10 字的动作 + 一圈弧形计时**；菜名只在开场页出现；进度用弧长表示。
**并且**：把 Pebble 定位成"**拿起看、放下转**"的物件——拿在手里 30 cm，16 px 字非常清楚；放在台面上时，靠灯环传达"还剩多久 / 什么状态"，不靠读字。

### ② "整体下压"和"外圈旋转"在机械上冲突

- EC11 的按压开关在**轴**上，而外圈是套在轴上的。你按外圈 = 给编码器轴加轴向力 → 手感变松、轴承磨损、久了会晃。
- 中心屏不在轴的正上方，**按屏幕压不到 EC11 的开关**。

**改法**：分工——**外圈只转，中心盘只按**。
中心盘（带屏）浮在 3 个硅胶垫/小弹簧上，下面正中放一颗 6×6 轻触开关；按下行程 0.8–1.0 mm，有限位台阶，保证玻璃永远不直接顶到开关。
视觉上仍然是"整个顶面按下去"，因为屏是最大的那块面。EC11 自带的按压开关留着不用（或当维修键）。

### ③ 交互：建议把"预览+确认"简化成"旋转即切步，按压即计时"

你原方案每一步要两个动作（转 + 按）。5 步菜就要 10 个动作，而且"预览到的步"和"当前步"在小屏上分不清。

**建议**：
- 旋转 → 直接切步（不改变任何不可逆的东西，转错了转回来就行；800 ms 防抖）
- 短按 → 开始/暂停当前步的计时
- 长按 1.5 s → 退出烹饪（回手机确认）
- 双击 → 重听语音（以后加）

如果你坚持防误触，把"预览+按压确认"做成固件里的一个开关（`bool SELECT_MODE`），两种都能跑。**但默认给简化版**——做饭时少一个动作就是少一次手忙脚乱。

---

## 1. 逐项回答你要核实的 6 个问题

| # | 问题 | 结论 | 依据 / 注意 |
|---|---|---|---|
| 1 | ESP32-S3 能否同时驱动圆屏、编码器、灯环 | **能，绰绰有余** | 屏走 SPI（DMA），灯环走 RMT，编码器走 PCNT，三者互不抢 CPU |
| 2 | GC9A01 驱动是否成熟 | **非常成熟** | LovyanGFX / TFT_eSPI / Arduino_GFX 都内置支持；240×240 SPI，40 MHz 够用 |
| 3 | EC11 能否实现"外圈转 + 整体按" | **只能实现"外圈转"** | 按压必须另加中心微动 + 弹簧，见 0-② |
| 4 | WS2812B 是否需要电阻/电容/独立供电 | **需要三样** | 5V 供电、数据 3.3V→5V 要电平转换（74AHCT125）、DIN 串 330Ω、灯环两端并 1000µF |
| 5 | 电压/电流/引脚冲突 | **有 3 个坑** | 屏必须 3.3V；灯环必须 5V 且不能从 3V3 取电；S3 的 GPIO19/20（USB）、0（BOOT）、45/46（strapping）、26–37（Flash/PSRAM）不能用 |
| 6 | 是否需要电源管理/稳压/滤波 | **MVP 不需要** | 开发板自带 5V→3.3V LDO 和 USB 保护；只需给灯环加电容 + 电平转换。上电池才需要充电管理（不建议） |

**关于"更适合初学者的替代"**：
- 屏：**别买 SPI 焊排针的裸屏**，买"已焊好排针的 GC9A01 模块"（40 mm 圆板、8 pin）。
- 驱动库：**LovyanGFX** 比 TFT_eSPI 更适合初学者——TFT_eSPI 要手改 `User_Setup.h`（最常见的劝退点），LovyanGFX 在代码里配置，出错信息也清楚。
- 板子：**ESP32-S3-DevKitC-1**（官方板，USB-C，引脚全引出、有丝印）。XIAO ESP32S3 更小但引脚少，等 MVP 跑通再换。

---

## 2. 保留 / 更换清单

| 你的候选 | 结论 | 说明 |
|---|---|---|
| ESP32-S3 开发板 | ✅ 保留 | 指定 **DevKitC-1 N8R8 或 N16R8**（8MB Flash 起） |
| GC9A01 1.28″ 240×240 | ✅ 保留 | 买"模块"（排针焊好），别买裸屏 |
| EC11 带按压 | ✅ 保留（按压不用） | 20 定位/圈，轴长 20 mm；建议买"带 PULL-UP 的模块版" |
| WS2812B 灯环 | ✅ 保留 | 12 颗、5V；**必须加 74AHCT125 + 330Ω + 1000µF** |
| 3D 打印外壳 | ✅ 保留 | 见第 8 节，MVP 先打印"环 + 底座"两件 |
| USB-C 5V 电源 | ✅ 保留 | 5V/2A（不是 1A：Wi-Fi 峰值 + 灯环） |
| —— 增加 | **中心轻触开关 6×6×5** | 实现"整体下压" |
| —— 增加 | **硅胶垫/小弹簧 ×3** | 中心盘回弹 |
| —— 增加 | **74AHCT125 电平转换模块** | 灯环数据电平 |
| —— 增加 | **万用表**（工具） | 没有它不要上电 |

---

## 3. 采购清单（BOM）

汇率按 1 USD ≈ 7.2 CNY ≈ 7.8 HKD（2026-11 估）。**下单前请以页面实时价为准。**

### 方案 A · 最低成本可运行原型

| # | 中文名 | 英文/型号 | 规格 | 数量 | 单价 | 小计 | 必须 | 购买注意 |
|---|---|---|---|---|---|---|---|---|
| 1 | 主控板 | ESP32-S3-DevKitC-1 | N8R8（8MB Flash/8MB PSRAM），USB-C | 1 | $19.95 / ¥90 | ¥90 | ✅ | 官方板；认准 "DevKitC-1"，不是 S3-Zero |
| 2 | 圆屏模块 | GC9A01 1.28″ round IPS | 240×240，SPI，**排针已焊**，40 mm 圆板 | 1 | $10.76 / ¥35 | ¥35 | ✅ | 要 8 pin（VCC/GND/SCL/SDA/RES/DC/CS/BLK） |
| 3 | 旋转编码器 | EC11 | 带按压，20 定位/圈，轴长 20 mm，6 mm 轴径 | 1 | ¥3 | ¥3 | ✅ | 买"带上下拉电阻的模块"更省事 |
| 4 | 灯环 | WS2812B Ring 12 | 5V，12 颗 5050，外径 37–50 mm | 1 | €4 / ¥15 | ¥15 | ✅ | 数据方向单向：**DIN 进**，DOUT 出 |
| 5 | 电平转换 | 74AHCT125（模块或芯片） | 3.3V→5V，四路 | 1 | ¥5 | ¥5 | ✅ | 也可用 TXS0108E 模块（更便宜但慢，灯环够用） |
| 6 | 电阻 | 330Ω 1/4W | 串在 DIN | 1 | ¥0.5 | ¥0.5 | ✅ | |
| 7 | 电容 | 1000µF 10V 电解 | 灯环 5V/GND | 1 | ¥2 | ¥2 | ✅ | 靠近灯环放 |
| 8 | 轻触开关 | 6×6×5 mm | 160 gf | 2 | ¥1 | ¥2 | ✅ | 一颗用，一颗备 |
| 9 | 硅胶垫/小弹簧 | — | 3 个，回弹中心盘 | 3 | ¥1 | ¥3 | ✅ | 也可用泡棉双面胶叠三层 |
| 10 | 杜邦线 | 母对母/公对母 | 20 cm，40 根 | 1 套 | ¥10 | ¥10 | ✅ | 别买太细的 |
| 11 | 电源 | USB-C 5V/2A | 带开关更好 | 1 | ¥30 | ¥30 | ✅ | 1A 会在 Wi-Fi 峰值时掉压重启 |
| 12 | 万用表 | 数字万用表 | 带蜂鸣档 | 1 | ¥40 | ¥40 | ✅（工具） | 没有它不要第一次上电 |
| **合计** | | | | | | **≈ ¥235** | | 不含 3D 打印（学校有打印机 = 0） |

### 方案 B · 推荐展示原型

| 追加项 | 说明 | 价格 |
|---|---|---|
| 备用 GC9A01 屏 ×1 | 第一次拆装最容易弄坏排线 | ¥35 |
| 备用 S3 板 ×1 | 焊错/烧 IO 的保险 | ¥90 |
| 1 mm 亚克力圆片（屏保护） | 或直接用屏自带玻璃 | ¥15 |
| M3 螺丝 + 铜柱 + 硅胶脚垫 | 结构件 | ¥25 |
| 补土 + 哑光喷漆 | 外壳质感（"磨砂塑料"） | ¥45 |
| 更好看的电源（编织线/带开关） | 展示用 | ¥40 |
| **方案 B 合计** | 方案 A + 追加 | **≈ ¥485（HK$530）** |

### 不买清单（现在）
- 定制 PCB（MVP 用开发板 + 杜邦线）
- 锂电池/充电管理（厨房常供电，电池反而增加风险）
- 触摸屏（旋钮已经解决输入）
- 大屏（1.28″ 是刻意选的，见 0-①）

---

## 4. 引脚表（ESP32-S3-DevKitC-1 实测可用引脚）

| ESP32-S3 引脚 | 接什么 | 元件引脚 | 作用 | 备注 |
|---|---|---|---|---|
| 3V3 | 圆屏 | VCC | 屏供电 | **绝对不能接 5V** |
| GND | 圆屏 | GND | 地 | 共地 |
| GPIO12 | 圆屏 | SCL / SCK | SPI 时钟 | |
| GPIO11 | 圆屏 | SDA / MOSI | SPI 数据 | |
| GPIO9 | 圆屏 | DC | 数据/命令 | |
| GPIO10 | 圆屏 | CS | 片选 | |
| GPIO8 | 圆屏 | RES / RST | 复位 | |
| 3V3 | 圆屏 | BLK | 背光常亮 | 想调光就接 GPIO7 + PWM |
| 3V3 | 编码器 | + (模块版) | 上拉供电 | 裸 EC11 不需要 |
| GND | 编码器 | GND | 地 | |
| GPIO4 | 编码器 | CLK / A | 旋转 A 相 | |
| GPIO5 | 编码器 | DT / B | 旋转 B 相 | 方向反了就在代码里对调 |
| GPIO6 | 编码器 | SW | 按压 | `INPUT_PULLUP`，按下为 LOW |
| GPIO21 | 74AHCT125 | 输入 A | 灯环数据（3.3V） | 别用 GPIO48：多数 S3 开发板板载 RGB 灯就挂在那 |
| 5V（板载） | 74AHCT125 | VCC | 5V 供电 | |
| 74AHCT125 输出 | 330Ω → 灯环 | DIN | 灯环数据（5V） | |
| 5V（板载） | 灯环 | 5V | 灯环供电 | 与 1000µF 并联 |
| GND | 灯环 | GND | 地 | **必须共地** |

**为什么避开这些脚**：GPIO19/20 = USB；GPIO0 = BOOT；GPIO45/46 = strapping（上电电平决定启动模式）；GPIO26–37 在 N8R8/N16R8 上被 Flash/PSRAM 占用；GPIO48 多数 S3 开发板用来驱动板载 RGB 灯（用了会两个灯一起亮）。上表全部避开。

---

## 5. 接线教程（逐根）

> 顺序很重要：**先屏 → 再编码器 → 最后灯环**。每接完一组，先上电测一次，别一次接完。

### 5.1 圆屏（8 根）
1. 屏 `VCC` → 板 `3V3`
2. 屏 `GND` → 板 `GND`
3. 屏 `SCL`（丝印也可能是 `SCK` / `CLK`）→ `GPIO12`
4. 屏 `SDA`（丝印也可能是 `MOSI` / `DIN`）→ `GPIO11`
5. 屏 `DC` → `GPIO9`
6. 屏 `CS` → `GPIO10`
7. 屏 `RES`（或 `RST`）→ `GPIO8`
8. 屏 `BLK`（背光）→ `3V3`
   - 为什么：屏是 3.3V 器件，接 5V 会烧驱动 IC。BLK 接 3V3 就是常亮。

### 5.2 编码器（5 根，模块版）
1. `+` → `3V3`
2. `GND` → `GND`
3. `CLK`（A）→ `GPIO4`
4. `DT`（B）→ `GPIO5`
5. `SW` → `GPIO6`
   - 裸 EC11（没有模块板）：A/B/SW 各串一个 **10kΩ 上拉到 3V3**，A/B 各并一个 **100nF 到 GND**（消抖）；公共端接 GND。
   - 风险：A/B 接反只会让方向相反，不会烧。

### 5.3 灯环（3 根 + 2 个保护件）
1. `5V` → 板 `5V`
2. `GND` → 板 `GND`
3. `DIN` → 330Ω → 74AHCT125 的**输出**
4. 74AHCT125 的**输入** → `GPIO21`；它的 `VCC` → 5V，`GND` → GND；芯片上的 `/OE`（输出使能，低有效）接 GND，不用的输入也接 GND
5. 1000µF 电容并在灯环的 5V 与 GND 之间（**注意极性：长脚 +**）
   - 为什么：WS2812B 的输入高电平门槛是 0.7×5V = 3.5V，ESP32 只有 3.3V，不转换会出现"随机闪、颜色乱、第一颗之后不亮"。330Ω 抑制振铃，电容吸收上电瞬间的电流冲击。
   - 烧坏风险：**灯环接反 5V/GND 会立刻烧**；插线前一定核对丝印。

### 5.4 电源
- USB-C 5V/2A → 开发板 USB 口。板子把这路 5V 直接引到 `5V` 引脚给灯环。
- 不要同时用两个电源（USB + 外部 5V）给板子供电。

---

## 6. 上电前检查（缺一不可）

1. **断电**，万用表蜂鸣档：`5V` 与 `GND` 不响（不短路）。
2. `3V3` 与 `GND` 不响。
3. 屏的 VCC 在 `3V3`，不在 `5V`。
4. 灯环的 5V 在板 `5V`，不在 `3V3`。
5. 所有 GND 都回到同一个 GND（屏/编码器/灯环/板子）。
6. 74AHCT125 的输入接 GPIO21，输出接 330Ω，`/OE` 接 GND，别接反（反了不工作，但不会烧）。
7. 电解电容极性正确。
8. 杜邦线没有半插、没有相邻短路（用眼睛顺着每根线看一遍）。

**第一次上电**：
- 先**只接屏**，插 USB，看是否点亮（不亮就先别接别的）。
- 屏正常后断电，接编码器，上电看串口有没有乱跳。
- 最后接灯环，上电先只点亮 1 颗（代码里先 `leds[0]`），确认方向和数据没问题再点全环。

---

## 7. 台架测试固件（完整可编译）

依赖库（Arduino IDE → 库管理器装）：
`LovyanGFX`、`ESP32Encoder`、`FastLED`

```cpp
// 01_bench.ino — 屏 + 旋钮 + 按压 + 灯环 一起测
#define LGFX_USE_V1
#include <LovyanGFX.hpp>
#include <ESP32Encoder.h>
#include <FastLED.h>

// ---------- 引脚（与第 4 节一致） ----------
static const int PIN_SCLK = 12;
static const int PIN_MOSI = 11;
static const int PIN_DC   = 9;
static const int PIN_CS   = 10;
static const int PIN_RST  = 8;
static const int PIN_ENC_A  = 4;
static const int PIN_ENC_B  = 5;
static const int PIN_ENC_SW = 6;
static const int PIN_LED    = 21;
static const int NUM_LEDS   = 12;

class LGFX : public lgfx::LGFX_Device {
  lgfx::Panel_GC9A01 _panel;
  lgfx::Bus_SPI      _bus;
public:
  LGFX() {
    {
      auto cfg = _bus.config();
      cfg.spi_host   = SPI2_HOST;
      cfg.spi_mode   = 0;
      cfg.freq_write = 40000000;
      cfg.freq_read  = 16000000;
      cfg.spi_3wire  = true;
      cfg.use_lock   = true;
      cfg.dma_channel = SPI_DMA_CH_AUTO;
      cfg.pin_sclk = PIN_SCLK;
      cfg.pin_mosi = PIN_MOSI;
      cfg.pin_miso = -1;
      cfg.pin_dc   = PIN_DC;
      _bus.config(cfg);
      _panel.setBus(&_bus);
    }
    {
      auto cfg = _panel.config();
      cfg.pin_cs   = PIN_CS;
      cfg.pin_rst  = PIN_RST;
      cfg.pin_busy = -1;
      cfg.panel_width  = 240;
      cfg.panel_height = 240;
      cfg.offset_x = 0;
      cfg.offset_y = 0;
      cfg.readable = false;
      cfg.invert   = true;    // 颜色整体反相就把这里改成 false
      cfg.rgb_order = false;  // 红蓝互换就把这里改成 true
      cfg.dlen_16bit = false;
      cfg.bus_shared = false;
      _panel.config(cfg);
    }
    setPanel(&_panel);
  }
};

LGFX tft;
ESP32Encoder encoder;
CRGB leds[NUM_LEDS];

const int STEP_COUNT = 5;
int  stepIndex = 0;
long lastPos   = 0;
bool lastBtn   = HIGH;
uint32_t lastDebounce = 0;

void drawScreen() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextDatum(middle_center);

  // 外圈：进度弧
  int endAngle = 360 * (stepIndex + 1) / STEP_COUNT;
  tft.drawArc(120, 120, 116, 110, 0, endAngle, TFT_GREEN, TFT_DARKGREY);

  // 中间：03/05
  tft.setFont(&fonts::FreeSansBold24pt7b);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.drawString(String(stepIndex + 1) + "/" + String(STEP_COUNT), 120, 104);

  // 下面：一句动作（≤10 字）
  tft.setFont(&fonts::efontCN_16);
  tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
  tft.drawString("翻炒 30 秒", 120, 152);
}

void drawLeds() {
  fill_solid(leds, NUM_LEDS, CRGB::Black);
  int lit = (stepIndex + 1) * NUM_LEDS / STEP_COUNT;
  for (int i = 0; i < lit; i++) leds[i] = CRGB(0, 90, 60);
  FastLED.show();
}

void setup() {
  Serial.begin(115200);

  tft.init();
  tft.setRotation(0);
  tft.fillScreen(TFT_BLACK);

  encoder.attachHalfQuad(PIN_ENC_A, PIN_ENC_B);  // 半正交：每个定位 2 个计数
  encoder.setCount(0);
  pinMode(PIN_ENC_SW, INPUT_PULLUP);

  FastLED.addLeds<WS2812B, PIN_LED, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(40);   // 12 颗全白约 700mA，压到 ~25%
  FastLED.clear(true);

  drawScreen();
  drawLeds();
  Serial.println("bench ready");
}

void loop() {
  long pos = encoder.getCount() / 2;
  if (pos != lastPos) {
    int delta = (pos > lastPos) ? 1 : -1;
    int next  = stepIndex + delta;
    if (next < 0) next = 0;
    if (next > STEP_COUNT - 1) next = STEP_COUNT - 1;
    if (next != stepIndex) {
      stepIndex = next;
      drawScreen();
      drawLeds();
      Serial.printf("step %d\n", stepIndex + 1);
    }
    lastPos = pos;
  }

  bool btn = digitalRead(PIN_ENC_SW);
  if (btn == LOW && lastBtn == HIGH && millis() - lastDebounce > 250) {
    lastDebounce = millis();
    for (int i = 0; i < NUM_LEDS; i++) leds[i] = CRGB(0, 120, 0);
    FastLED.show();
    delay(120);
    drawLeds();
  }
  lastBtn = btn;

  delay(5);
}
```

**验收标准**：转旋钮 → 数字 1→5 变化、弧变长、灯环亮的颗数变多；按压 → 灯环全绿闪一下；串口打印 step。

**Wi-Fi 单独测**（15 行，先别混进主程序）：
```cpp
#include <WiFi.h>
void setup() {
  Serial.begin(115200);
  WiFi.begin("你的SSID", "你的密码");     // 只支持 2.4GHz
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println();
  Serial.println(WiFi.localIP());
}
void loop() {}
```

---

## 8. 与 Fridge Decision App 的连接（基于真实代码）

### 8.1 现在的真实结构（已核对仓库）
- 前端：GitHub Pages 静态 PWA，无构建步骤；`data.js`（118 种食材 + 373 道菜谱 + 步骤，另有 151 道本地菜词表）、`logic.js`（决策与日期）、`cook.html`/`cook.js`（做饭模式，已有"上一步/下一步/做完了 · 扣减库存"）。
- 后端：Supabase Auth（邮箱密码）+ Postgres + RLS + RPC（`confirm_purchase`、`reserve_meal`、`complete_meal`）。
- 已有 `devices` 表：`id / household_id / name / secret_hash / last_seen / firmware`。
- `capture_sessions.device_id` 已存在，说明"设备写入"这条设计早就预留了。

### 8.2 缺什么（必须补，但不改现有流程）
1. **没有步骤状态表**：做饭模式的状态只在前端内存里，关掉就没了。
2. **没有设备接口**：设备无法读"当前第几步"，也无法写回。
3. **没有配对流程**：`devices` 表有 `secret_hash`，但前端没有生成/展示配对码的页面。

### 8.3 最小增量（3 个新文件 + 2 处小改）
| 文件 | 类型 | 作用 |
|---|---|---|
| `migrations/013_cook_sessions.sql` | 新增 | 建表 `cook_sessions(id, household_id, device_id, recipe_id, step_index, step_count, timer_ends_at, status, updated_at)`；RLS 只允许 service role（设备与 Edge Function 走） |
| `supabase/functions/device-api/index.ts` | 新增 | `POST /pair`、`GET /state`、`POST /step`、`POST /timer`；校验 `x-device-secret` = sha256 后与 `devices.secret_hash` 比对 |
| `firmware/` | 新增 | 见第 9 节 |
| `cook.js` | 小改 | 点"开始做饭"时调一次 `device-api`（或 RPC）建 session；轮询/订阅回显旋钮的步数 |
| `settings.html` | 小改 | 加"配对一个旋钮"：显示 6 位码 + 设备名，写入 `devices` |

### 8.4 通信方式比较

| 方案 | 延迟 | 设备端复杂度 | 安全性 | 结论 |
|---|---|---|---|---|
| **Wi-Fi + HTTPS 轮询（2 s）** | 0–2 s | 低（一次 GET） | 高（secret 在 header，TLS） | ✅ **选它** |
| Wi-Fi + Supabase Realtime | 0.3–1 s | 高（WS + anon key + RLS） | 中（anon key 要下发） | 以后升级 |
| BLE | <0.1 s | 中（但需要网关 App） | 高 | ❌ iOS Safari 不支持 Web Bluetooth，等于要写原生 App |
| Wi-Fi + 自建 WebSocket | 低 | 高（要服务器 + 心跳） | 中 | ❌ 多一个要维护的服务 |

### 8.5 数据格式（真实字段）

设备读：
```json
GET /functions/v1/device-api/state?device_id=<uuid>
Header: x-device-secret: <64位十六进制>

{
  "session_id": "9f1c...",
  "recipe": { "id": "tomato_egg", "name": "番茄炒蛋" },
  "step_index": 2,
  "step_count": 5,
  "step_text": "下蛋液，中火翻炒 30 秒",
  "timer": { "seconds_left": 18, "running": true },
  "status": "cooking",
  "updated_at": "2026-11-03T12:34:56Z"
}
```

设备写：
```json
POST /functions/v1/device-api/step
{ "device_id": "<uuid>", "action": "set_step", "step_index": 3 }
```
`action` 取值：`set_step` / `timer_start` / `timer_pause` / `exit`。

**字段解释**
- `step_index` 从 0 开始；屏上显示 `step_index + 1`。
- `timer.seconds_left` 由服务端按 `timer_ends_at` 算，**设备不依赖本地时钟**（设备没网也能用 NTP 校准；断网就本地倒数）。
- `status`: `idle` / `cooking` / `paused` / `done`。

### 8.6 安全与断网
- 设备只持 `device_id + secret`，**不持任何 Supabase key**；Edge Function 内部用 service role。
- 配对时前端生成 secret，只显示一次，服务端存 `sha256`。
- 家庭隔离：`device.household_id` 决定它能读哪个 session。
- 断网：设备把最后一次 state 存 NVS，开机先显示缓存，联网后以服务端为准。
- 不做：AI 识别、菜谱推荐、写库存（都在服务端/手机）。

---

## 9. 机械结构

### 9.1 尺寸建议
- 底座：Ø72 × 18 mm，4 个硅胶脚
- 外圈：Ø62 × 12 mm，滚花，内孔 Ø6（D 轴或加 M3 顶丝）
- 中心盘：Ø42 × 6 mm，装 40 mm 圆屏
- 总高：约 34 mm

### 9.2 三处关键机构
1. **外圈 → EC11 轴**：D 形轴 + 顶丝；外圈只受扭矩，不受轴向力。
2. **中心盘 → 按压**：3 个 120° 分布的硅胶垫（或 0.6 mm 弹簧）支撑，中心一颗 6×6 轻触；行程 0.8–1.0 mm，底座有硬限位，屏玻璃不接触开关。
3. **防转**：中心盘背面两个小凸台插进底座的槽里，只允许上下移动，不允许旋转。

### 9.3 3D 打印
- 材料：PETG（比 PLA 耐热、耐油）；颜色选奶油白/暖灰。
- 参数：0.2 mm 层高、3 圈壁、20% 填充；外圈单独打、0.12 mm 层高让滚花更细。
- 后处理：400 目砂纸 → 补土 → 哑光透明漆，得到"磨砂塑料"。

### 9.4 MVP 与最终产品的差别
- **MVP**：开发板 + 杜邦线，外壳只打"环 + 底座"，屏用热熔胶固定，按压靠中心盘压微动。**能转、能按、能显示**就算过。
- **最终**：定制 PCB（把 S3 模组 + 屏座 + 灯环做在一块板上）、更薄的壳、隐藏走线。**课程项目不做 PCB**。

---

## 10. 十阶段路线（每阶段验收后再进下一步）

| 阶段 | 目标 | 关键动作 | 验收标准 | 预计 |
|---|---|---|---|---|
| 0 | 采购 | 按第 3 节下单 | 元件到齐、型号对 | 1 天 + 物流 |
| 1 | 环境 | Arduino IDE 2.x + ESP32 core + 库 | 板子能烧 Blink，串口有输出 | 0.5 天 |
| 2 | 屏 | 只接屏，跑第 7 节代码的屏部分 | 屏出现 03/05 和一个圆弧 | 1 天 |
| 3 | 旋钮 | 接 EC11 | 转一格数字变一次，不跳格 | 0.5 天 |
| 4 | 按压 | 接 SW | 按下串口打印、灯环闪绿 | 0.5 天 |
| 5 | 灯环 | 接 74AHCT125 + 电容 | 12 颗颜色一致、不闪不跳 | 0.5 天 |
| 6 | 本地整合 | 状态机 + 计时 + 断网缓存 | 5 步走完、计时到点灯环呼吸 | 1–2 天 |
| 7 | 服务端 | 表 + Edge Function | 用 curl 能读写 state | 1–2 天 |
| 8 | 联调 | 手机选菜 → 旋钮显示 | 手机上点开始，2 s 内旋钮变 | 1–2 天 |
| 9 | 外壳 | 打印 + 组装 | 能单手转、按下去有"咔"、无晃动 | 2–3 天 |
| 10 | 稳定性 | 连续 2 小时 + 断电重启 | 不重启、不丢步、恢复正确 | 1 天 |

---

## 11. 常见故障

| 现象 | 最可能的原因 | 处理 |
|---|---|---|
| 屏全白/花屏 | DC/CS/RST 接错，或 SPI 太快 | 核对引脚；`freq_write` 降到 20 MHz |
| 颜色反相 | 面板默认反色 | `cfg.invert = !cfg.invert` |
| 红蓝互换 | RGB/BGR | `cfg.rgb_order = true` |
| 旋钮跳格/反向 | 半正交 vs 全正交 | 换 `attachFullQuad`；或 A/B 对调 |
| 按压无反应 | 没开上拉 / SW 没接 GND | `INPUT_PULLUP`，SW 接 GND |
| 灯环只亮第一颗 | DIN/DOUT 接反 | 数据从 DIN 进 |
| 灯环随机闪 | 3.3V 驱动 5V 数据 | 加 74AHCT125 + 330Ω + 共地 |
| 一插 USB 就重启 | 电流不够（Wi-Fi 峰值 + 灯环） | 换 5V/2A；灯环亮度降到 40 |
| Wi-Fi 连不上 | 5GHz / 密码错 | ESP32 只支持 2.4GHz |
| 屏幕过一会儿黑 | 背光 BLK 接触不良 | BLK 直接接 3V3 |

---

## 12. 下一步（按你的"分阶段"要求）

这份是 **Phase 0**：定案 + BOM + 接线 + 台架代码。
元件到货后按 Phase 1→5 逐个点亮，**每个阶段你把串口输出或照片发我，我确认后再给下一段**。
Phase 6（整合固件）和 Phase 7（Edge Function + 建表 SQL）我会给完整文件，但不在现在一次性堆给你——那样你只会得到一份"看起来很专业、实际上跑不起来"的报告。

**现在就可以做的两件事**：
1. 按第 3 节下单（方案 A 约 ¥235）。
2. 用纸板剪一个 Ø72 的圆，放在台面上，站着看它——**先确认"拿起看"这个动作你愿意做**；如果不愿意，我们就得把屏改成挂墙，方案要重做。
