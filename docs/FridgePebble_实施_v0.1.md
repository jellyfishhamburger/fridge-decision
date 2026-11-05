# Fridge Pebble 实施文档 v0.1

> 2026-11-03 · 零硬件基础版 · 目标：一周内让冰箱门上出现"鸡蛋 剩 1 天"这样的真实数据
> 价格是 2026-11 的估价（人民币），下单前以页面实价为准；没有查到的不写链接，只写型号和搜索词。

---

## 0. 先给结论

| 问题 | 答案 |
|---|---|
| 好不好做 | **三个里最好做的**。没有摄像头、没有实时性、没有机械结构，内容只有三行字 |
| 用什么屏 | **2.9″ 黑白墨水屏 296×128**（不是彩色、不是圆屏） |
| 用什么板 | ESP32-S3 开发板（和你已经买的那块同款） |
| 要焊吗 | **不用**，8 根杜邦线 |
| 总共多少钱 | **¥145–170**（黑白版）／¥200–230（三色版） |
| 最难的一步 | 不是接线，是"这块小屏到底显示哪三行"——排版 |
| 最大的坑 | 墨水屏"整屏刷新"慢（黑白 2 秒、三色 15 秒），所以**别做按键翻页** |

**核心架构一句话**：设备是哑终端——电脑把 296×128 的画面画好，存成一张 4736 字节的黑白位图，设备下载后原样贴上屏。**固件里没有排版、没有字库、没有中文**，改版只改电脑上的脚本。

---

## 1. 代码核查（这条决定后面怎么做）

| 能力 | 现状 | 对 Fridge Pebble 的影响 |
|---|---|---|
| 296×128 三屏 UI | ✅ `display.html` 已经按这个尺寸画好（决定页 / 倒计时页 / 全景页） | **直接拿来当设计稿**，不用重新想 |
| 数据来源 | ✅ `data.js`（食材保质期）+ `logic.js`（排序规则） | 渲染脚本直接复用，保证"面板不会推荐 App 不知道的东西" |
| 家庭隔离 | ✅ RLS + `households` | 设备侧必须走 Edge Function，不能拿 anon key |
| 设备凭证 | ✅ `devices(id, household_id, name, secret_hash, last_seen, firmware)` | 表已经建好，只差一个端点 |
| 设备接口 | ❌ 没有 | 第一阶段用**静态文件**绕过去，第二阶段再补 |
| 图片/月数据 | — | 与本设备无关 |

---

## 2. 形态 A/B：为什么选矩形

| | A 圆形 IPS（像 Cooking Pebble） | B 矩形墨水屏 2.9″ |
|---|---|---|
| 常亮 | 要持续供电，冰箱门上拖一根线 | 断电不丢画面，**可以完全无线** |
| 反光 | 厨房顶灯会反光 | 哑光，像一张贴纸 |
| 三行"鸡蛋 剩 1 天" | 圆屏四角被切，实际只能放 2 项 | 296×128 刚好三行 |
| 刷新 | 实时 | 黑白整屏 4 s（局部 0.75 s）/ 三色 15 s（无所谓，30 分钟刷一次） |
| 成本 | ¥60–110 | ¥95–170 |
| 加工 | 现成模块 | 现成模块 |
| **判断** | 适合"要动效"的信息 | ✅ **MVP 选 B** |

> 圆屏留给 Cooking Pebble——那里需要"转动就有反馈"，墨水屏给不了。**同一个产品里，两种屏各干各的活，这不是不统一，是分工。**

---

## 3. 屏的选型（含三个技术的横向对比）

| | 墨水屏 e-ink | 小 OLED | 小 IPS |
|---|---|---|---|
| 常亮耗电 | **0（断电保持）** | 高（烧屏风险） | 高 |
| 强光下可读 | ✅ 越好越清楚 | ❌ 反光、看不清 | 一般 |
| 刷新 | 4 s（黑白整屏）/ 15 s（三色） | 毫秒 | 毫秒 |
| 尺寸常见 | 2.9″ 296×128 | 1.3″ 128×64 | 1.28″ 240×240 |
| 能不能显示三行中文 | ✅ | ❌ 字太小 | 勉强 |
| 与 ESP32 兼容 | ✅ SPI，库成熟（GxEPD2） | ✅ I²C | ✅ SPI |
| 价格 | ¥95–170 | ¥30–60 | ¥60–110 |
| **结论** | ✅ **选它** | 不适合常显 | 留给旋钮 |

**黑白 vs 三色（BWR）**：

| | 黑白 2.9″（SSD1680） | 三色 2.9″（BWR） |
|---|---|---|
| 价格 | ¥95–110 | ¥150–170 |
| 刷新 | 4 s 整屏、**0.75 s 局部** | 15 s，**不支持局部刷新** |
| 红色 | 无 | 有（你 `display.html` 里的紧急色） |
| 建议 | ✅ **先买这个** | 想要"红色=今天必须吃"再升级 |

黑白版怎么表达紧急？**反白块 + 加粗 + 数字放大**，比红色更抗强光。

---

## 4. BOM（最便宜那一档）

| # | 名称 | 型号 / 规格（下单时看到这些字样） | 数量 | 单价 | 必须 |
|---|---|---|---|---|---|
| 1 | 主控板 | **ESP32-S3-DevKitC-1 兼容板 N8R8**，USB-C，排针已焊 | 1 | ¥23 | ✅ |
| 2 | 墨水屏 | **Waveshare 2.9 inch e-Paper Module**，296×128，黑白，SPI，**8 pin 排针已焊** | 1 | ¥95–110 | ✅ |
| 3 | 杜邦线 | 母对母 20 cm（你已有 40 根） | 8 根 | ¥0 | ✅ |
| 4 | 电源 | USB-C 5V/1A 充电头 + **数据线** | 1 | ¥15 | ✅ |
| 5 | 磁铁 | N35 10×3 mm 圆片 | 2 | ¥4 | 可选 |
| 6 | 双面胶 | 3M VHB 或泡棉胶 | 1 | ¥4 | ✅ |
| 7 | 外壳 | 3D 打印（学校）或亚克力 | 1 | ¥0–30 | 可选 |
| | **合计** | | | **¥141–160** | |

**搜索词**（淘宝）：
`微雪 2.9寸 墨水屏 模块 SPI 296x128`、`ESP32-S3 N8R8 开发板 已焊`
**别买错**：① 一定要"**Module**"（带驱动板），不是裸屏；② 一定要"**排针已焊**"；③ 分辨率写 **296×128**，不是 200×200 或 128×296。

**三色版**：把第 2 项换成 `Waveshare 2.9inch e-Paper Module (B)`，+¥50。

---

## 5. 接线（8 根，逐根）

| 从（墨水屏模块丝印） | 到（ESP32-S3） | 作用 | 注意 |
|---|---|---|---|
| VCC | **3V3** | 供电 | ❌ 不能接 5V |
| GND | GND | 地 | |
| DIN | **GPIO11** | SPI 数据（MOSI） | |
| CLK | **GPIO12** | SPI 时钟（SCK） | |
| CS | **GPIO10** | 片选 | |
| DC | **GPIO9** | 数据/命令 | |
| RST | **GPIO8** | 复位 | |
| BUSY | **GPIO7** | 忙信号（输入） | 这根最容易漏，漏了会卡住 |

（这套脚避开了 GPIO19/20 USB、0 BOOT、45/46 启动脚、26–37 Flash/PSRAM，和你 Cooking Pebble 那份一致。）

**上电前 5 项检查**：
1. VCC 在 3V3，不是 5V；
2. 8 根线没有一根插在相邻两孔之间；
3. BUSY 确实插了（GPIO7）；
4. 万用表/眼睛确认 3V3 与 GND 不短路；
5. 先只插 USB、不接屏，看板子灯亮；再断电接屏。

---

## 6. 软件：第一天只做一件事——让屏上出现字

1. 装 **Arduino IDE 2.x**。
2. 首选项 → 附加开发板管理器网址填：
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
3. 开发板管理器搜 `esp32` → 装 **esp32 by Espressif**。
4. 库管理器装 **GxEPD2**（作者 Jean-Marc Zingg）。
5. 开发板选 **ESP32S3 Dev Module**，端口选新出现的 COM 口。
6. 打开示例 `GxEPD2 → GxEPD2_Example`，把里面 `display(GxEPD2_290_...)` 那一行改成：

```cpp
GxEPD2_BW<GxEPD2_290_T94_V2, GxEPD2_290_T94_V2::HEIGHT>
  display(GxEPD2_290_T94_V2(/*CS=*/10, /*DC=*/9, /*RST=*/8, /*BUSY=*/7));
```

> 如果编译报"没有这个构造参数" → 去掉 BUSY，写成 `(10, 9, 8)`；
> 如果刷出来是花屏/条纹 → 把 `T94_V2` 换成 `T94` 再试。这两步是 GxEPD2 最常见的两个坑。

7. 上传。**验收**：屏幕出现示例画面（黑白图形 + 文字），串口打印 `GxEPD2` 版本号。

> 注意这块屏的**原生方向是竖的**（控制器里 128 宽 × 296 高），装上外壳才是横的。所以代码里必须 `display.setRotation(1)`，之后坐标才是 296×128。忘了这一句，画面会横躺或被裁一半。

---

## 7. 第二天：显示你自己画的一帧

### 7.1 先在电脑上画

```python
# tools/frame.py —— 生成 296×128 黑白位图（4736 字节，无文件头）
from PIL import Image, ImageDraw, ImageFont

W, H = 296, 128
img = Image.new("1", (W, H), 1)          # 1 = 白
d = ImageDraw.Draw(img)

big   = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 30)
mid   = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 18)
small = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 14)

# 顶栏
d.text((8, 4), "先吃这些", font=small, fill=0)
d.line((0, 24, W, 24), fill=0)

rows = [("鸡蛋", 1), ("菠菜", 2), ("牛奶", 3)]
y = 30
for name, days in rows:
    d.text((10, y), name, font=mid, fill=0)
    t = f"还剩 {days} 天"
    w = d.textlength(t, font=mid)
    d.text((W - 12 - w, y), t, font=mid, fill=0)
    y += 30

# 底部一行
d.text((8, H - 26), "共 12 样 · 3 样该先吃 · 刚同步", font=small, fill=0)

img.save("frame_preview.png")             # 给人看

# 打包成 1-bit MSB-first（GxEPD2 drawImage 的格式）
px = img.load()
out = bytearray()
for y in range(H):
    for xb in range(0, W, 8):
        b = 0
        for i in range(8):
            if px[xb + i, y] == 0:        # 0 = 黑
                b |= 1 << (7 - i)
        out.append(b)
open("frame.bin", "wb").write(bytes(out))
print("frame.bin", len(out), "bytes")     # 应该是 4736
```

先看 `frame_preview.png` 是否好看——**这一步就是产品设计**，不要跳过。

### 7.2 让设备下载它

第一步不用后端：把 `frame.bin` 传进你的 GitHub 仓库，GitHub Pages 就会给你一个网址
`https://jellyfishhamburger.github.io/fridge-decision/frame.bin`。

```cpp
// fridge_pebble.ino —— 第二阶段：下载一张位图并显示
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <GxEPD2_BW.h>

#define W 296
#define H 128

GxEPD2_BW<GxEPD2_290_T94_V2, GxEPD2_290_T94_V2::HEIGHT>
  display(GxEPD2_290_T94_V2(/*CS=*/10, /*DC=*/9, /*RST=*/8, /*BUSY=*/7));

const char* SSID = "你的2.4G_WiFi";
const char* PASS = "密码";
const char* URL  = "jellyfishhamburger.github.io";
const char* PATH = "/fridge-decision/frame.bin";

static uint8_t buf[W * H / 8];      // 4736 字节

bool download() {
  WiFiClientSecure c;
  c.setInsecure();                  // 原型阶段跳过证书校验；产品阶段换根证书
  if (!c.connect(URL, 443)) { Serial.println("connect fail"); return false; }

  c.print(String("GET ") + PATH + " HTTP/1.1\r\nHost: " + URL +
          "\r\nConnection: close\r\n\r\n");

  // 跳过响应头
  while (c.connected()) {
    String line = c.readStringUntil('\n');
    if (line == "\r") break;
  }
  size_t n = 0;
  uint32_t t0 = millis();
  while (c.connected() && n < sizeof(buf)) {
    if (c.available()) buf[n++] = c.read();
    if (millis() - t0 > 15000) break;
  }
  c.stop();
  Serial.printf("got %u / %u\n", (unsigned)n, (unsigned)sizeof(buf));
  return n == sizeof(buf);
}

void show() {
  display.setFullWindow();
  display.firstPage();
  do {
    display.drawImage(buf, 0, 0, W, H, false, false, false);
  } while (display.nextPage());
}

void setup() {
  Serial.begin(115200);
  display.init(115200, true, 2, false);
  display.setRotation(1);   // 关键：屏原生是 128×296 竖的，转 90° 才是 296×128
  Serial.printf("panel %d x %d\n", display.width(), display.height());  // 应打印 296 x 128

  WiFi.begin(SSID, PASS);
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) delay(300);

  if (download()) show();
  else { Serial.println("keep old frame"); }   // 断网就保留上一帧，什么都不做
  WiFi.mode(WIFI_OFF);
}

void loop() { delay(60000); }
```

**验收**：断电重插，屏上是你画的那三行；拔掉路由器再重插，屏上还是那三行（不闪、不白屏）。

---

## 8. 第三天：让这三行变成真数据

现在 `frame.py` 里的名字是手写的。改成从 Supabase 读：

```python
# tools/frame_live.py —— 只比上面多 20 行
import json, urllib.request, os

SUPA = "https://<你的ref>.supabase.co"
KEY  = os.environ["SUPA_SERVICE_KEY"]      # 只在电脑/CI 上用，绝不进设备

req = urllib.request.Request(
    SUPA + "/rest/v1/items?select=name,days_left&order=days_left.asc&limit=3",
    headers={"apikey": KEY, "Authorization": "Bearer " + KEY})
rows = json.loads(urllib.request.urlopen(req).read())
# rows -> [(name, days), ...] 直接替换上面 rows = [...]
```

**三种跑法，按省事排序：**

| 方案 | 怎么跑 | 优点 | 缺点 |
|---|---|---|---|
| ① 手动 | 你想更新时跑一次，传 `frame.bin` 进仓库 | 今天就能用，零后端 | 不是自动的 |
| ② GitHub Actions 定时 | `cron: '*/30 * * * *'` 跑脚本 → 提交 `frame.bin` | 免费、自动、你电脑关了也行 | 仓库是公开的 → **只能放演示数据** |
| ③ Edge Function + Storage | Action 渲染 → 传 Storage → 设备持 `device_secret` 取 | 真正的家庭隔离 | 多写一个函数（约 60 行） |

**建议顺序：① → ② 先把体验跑通 → ③ 在答辩前一周补上。** 隐私这件事在报告里要写明：②是演示态，③是产品态。

---

## 9. 供电与挂装

**MVP：USB-C 有线。** 一根白色细线，从冰箱**侧面**（不是门板）走到最近的插座。设备装在侧面靠前的位置，开门不影响，线走冰箱背面。

**第二版：电池。** 需要 3.7V 锂电 + 充电模块（要焊接或买带 JST 的成品模块），续航估算：

| 刷新频率 | 每天唤醒 | 估算日耗 | 1200mAh 理论 |
|---|---|---|---|
| 30 分钟 | 48 次 | ≈10 mAh | 3–4 个月 |
| 10 分钟 | 144 次 | ≈30 mAh | 1 个月 |

单次唤醒 ≈ Wi-Fi 3 s（0.09 mAh）+ 刷屏 2 s（0.02 mAh）≈ 0.11 mAh。**这是估算，不是实测**，实测要跑一周。

**挂装**：背面 2 颗 N35 磁铁吸在钢门上；玻璃门/塑料门用 3M VHB。壳背面做两个 10.5 mm 盲孔放磁铁，外面贴一层 0.5 mm 硅胶垫防刮。

---

## 10. 外壳（可选，但答辩加分）

- 尺寸：**110 × 60 × 14 mm**（屏可视区 66.9 × 29.1 mm，模块板约 90 × 40 mm）
- 前框压边 1.5 mm，屏用 0.5 mm 泡棉双面胶粘在前框背面（**不要用热熔胶**，会把排线顶弯）
- 背面：两个磁铁盲孔 + 一条走线槽
- 侧边：USB-C 开孔（充电时不用拆）
- 打印：PETG，0.2 mm 层高，3 圈壁，20% 填充；奶油白/暖灰，打完喷一层哑光透明漆
- 先验证：**纸板剪一个 110×60 的片**贴在门上，站远看三天，再决定要不要打印

---

## 11. 一周节奏与验收

| 天 | 做什么 | 完成的标准 |
|---|---|---|
| D1 | 下单 + 装 Arduino + 装 GxEPD2 | IDE 里能看到 ESP32S3 开发板 |
| D2 | 接线 + 烧官方示例 | 屏出现示例画面，不花屏 |
| D3 | 写 `frame.py`，出 `frame_preview.png` | 电脑上看着已经像"产品"了 |
| D4 | 上传 bin + 烧第二段代码 | 设备显示你自己的三行 |
| D5 | 接 Supabase，`frame_live.py` | 三行是真数据 |
| D6 | 挂上门 + 断网/断电/长时间跑 | 断网保帧、断电恢复、8 小时不死机 |
| D7 | 外壳（纸板 → 打印） | 能单手取下来 |

**必须通过的 9 条**（对应你任务书 3.7）：
1. 显示 1–3 项临期食材，按剩余天数排序；
2. App 改库存 → 下一次刷新后设备变化；
3. 删除食材 → 设备不再显示它；
4. 断网 → 保留上一帧，不白屏；
5. 恢复网络 → 自动更新；
6. 另一个家的设备读不到这个家的数据（③ 方案才成立）；
7. 连续跑 8 小时不重启；
8. 拔电重插 → 自动恢复；
9. 面板上的字，站在 1 米外能读。

---

## 12. 常见故障

| 现象 | 原因 | 处理 |
|---|---|---|
| 全白 / 全黑 | 缺 BUSY 或 RST 接错 | 补 BUSY，核对 8 根线 |
| 花屏、条纹、上下错位 | GxEPD2 的面板类选错 | `T94_V2` ↔ `T94` 互换 |
| 画面横躺 90° / 只显示一半 | 屏原生是 128×296，忘了转 | 加 `display.setRotation(1)`；若仍错位，就在 PIL 里 `img.rotate(90, expand=True)` 生成 128×296 的图，并把 setRotation 改回 0 |
| 文字缺一半 / 右边被裁 | 位图宽度不是 8 的倍数 | 296 = 37×8 ✓；如果你改了宽度，必须凑成 8 的倍数 |
| 编译报构造参数错误 | 库版本不同 | 去掉 BUSY 参数 |
| 刷一半卡住 | BUSY 没接或接错脚 | 必须 GPIO7 |
| 下载 0 字节 | HTTPS 证书 / 重定向 | 先用 `setInsecure()`；确认是 `https` 443 |
| 连不上 Wi-Fi | 5 GHz | 只能用 2.4 G |
| 显示一会儿变淡 | 正常（墨水屏特性） | 每 20 次刷新做一次全刷 |
| 中文变方块 | 你用的是设备字库 | **别在设备上排中文**，走位图 |

---

## 13. 和另外两个设备的关系

| 设备 | 端点 | 共用 |
|---|---|---|
| Fridge Pebble | `GET /frame` | `devices` 表、`device_secret`、配网代码、`device-ingest` 函数 |
| Camera Pebble | `POST /capture` | 同上 |
| Cooking Pebble | `GET /state`、`POST /step` | 同上 |

所以**先做 Fridge 的回报最大**：配网、设备凭证、端点模式都在它身上跑通，后面两个各只需 1/3 的工作量。

---

## 14. 下一步

这份文档到"能显示真数据"为止。等你把 D2（点亮）跑通，我再给你：
- `device-ingest` Edge Function 的完整代码 + 建表 SQL（家庭隔离那条）；
- GitHub Actions 的 workflow 文件（定时渲染 + 上传）；
- 三色屏版本（如果你决定要红色）。

**现在就可以做的两件事**：① 按第 4 节下单（¥145 左右）；② 用纸板剪一个 110×60 贴在冰箱上，站远看三天——先确认这个位置你真的会去看它。
