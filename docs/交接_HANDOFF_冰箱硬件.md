> **2026-11-07 最新硬件进度**：4.2英寸墨水屏已实测点亮，用户确认测试画面出现。可工作驱动是包内自定义 `GxEPD2_420c_Z96`，不是本文早期示例中的 M01/420。请先阅读 [墨水屏诊断及验收记录](墨水屏诊断_20261107.md) 与 [可工作的测试说明](../firmware/FridgeZ96Diagnostic/README.md)。三按键输入诊断见 `firmware/FridgeButtons`，GPIO4/5/13已确认上拉、低电平按下有效，实体键的空间顺序仍待逐键核实。本文其余内容保留为早期历史，不能据此退回已失败的驱动配置。
# 交接文件：Fridge Display Pebble + Cooking Pebble 硬件落地

> 给"接手继续指导"的 AI 助手（家里电脑的 Hermes / GPT / 其他）。
> 这份文件是**自包含**的：不依赖任何之前的聊天记录。
> 用户：Leiman Pan（潘蕾蔓），HKU MSc(Eng) IDT 一年级，项目 IDAT7211。
> 写于 2026-11-03。仓库：https://github.com/jellyfishhamburger/fridge-decision

---

## 0. 三十秒版

- **产品**：Fridge Decision —— 冰箱遗忘监测 + 今晚吃什么决策的网页 App（GitHub Pages + Supabase）。已有库存、临期、菜谱推荐、做饭模式、小票 OCR、端侧 9 类识别。
- **现在要做**：给它配两个实体硬件。① Cooking Pebble：带圆屏的旋钮，做饭时换步骤/计时；② Fridge Display：冰箱门外的墨水屏，常显"鸡蛋 还剩 1 天"。
- **她的水平**：前端/数据库很强（自己写过 RLS、RPC、Edge Function），**硬件零经验**。会照着一根一根接线，但不懂 GPIO/SPI/烧录。中文沟通。
- **状态**：元件已下单/待收货，**还没有任何一块板子被点亮过**。
- **你接手后的第一件事**：第 4 节的"验货清单"，不是写代码。

---

## 1. 怎么跟她说话（这几条比技术更重要）

| 规则 | 原因 |
|---|---|
| **一次只给一个动作**，给完停下来等结果 | 她说"我真的 0 硬件经验"，一次给 10 步她会卡在第 2 步然后放弃 |
| 每个动作都要写清"**看到什么算成功**" | 她无法判断"是不是正常"，只能靠你告诉她 |
| 出现术语必须用一句人话解释（GPIO = 板子上的一个编号引脚，SPI = 一种四根线的通信方式） | 同上 |
| **不要一次给长报告**；她要的是"今天做这一步" | 她明确说过不要"看起来专业、实际跑不起来"的文档 |
| 价格和链接**没有核实就不写** | 她会照着你给的链接下单；编一个链接等于让她花错钱 |
| 她问"能不能做好"时，先给判断，别顺手把东西做出来 | 越界会被叫停 |
| 视觉类交付必须先用真浏览器截图自查再发 | 她对 UI 敏感，会逐处挑 |
| 中文回复；表格优先于长段落 | 她的阅读习惯 |

**真实用户是她妈妈**：有记忆问题、老花。所以**字号要大**，假设观看距离 80 cm。"看起来能读"和"她妈妈能读"是两件事，用第 5 节的算术判断，不靠感觉。

---

## 2. 代码与数据的事实（已在 2026-11-03 核对过仓库）

| 事实 | 位置 |
|---|---|
| 静态 PWA，无构建步骤，Pages 从 main 发布 | `index.html` 等根目录文件 |
| 296×128 三屏 UI 设计稿（决定页/倒计时页/全景页） | `display.html`（这是 Fridge Display 的设计来源） |
| 内容库：食材保质期 + 菜谱 + 步骤 | `data.js`、`logic.js`、`cook-steps.js` |
| 做饭模式（上一步/下一步/做完了·扣减库存） | `cook.html` + `cook.js` |
| 手部检测 | **在浏览器里**（`gate.html`，MediaPipe WASM，`./vendor/mediapipe/`）——**ESP32 上跑不了，别设计"设备端识手"** |
| 三帧抓拍 + 端侧 9 类 TFLite | `capture.js`（`classifier.js`，`models/food9*.tflite`） |
| 图片上传 | **不存在**（`capture_images.storage_path` 字段建了但客户端从没上传） |
| 设备接口 | **不存在**（`devices` 表有 `secret_hash`，但没有 endpoint） |
| 写库存 | 只有 `confirm_purchase`、`complete_meal` 两个 RPC 改 `qty` |
| 家庭隔离 | `households` + RLS；设备必须走 Edge Function，**不能下发 anon/service key** |

数据库里已存在的关键表：`households`、`household_members`、`items`、`inventory_events`、`meal_sessions`、`capture_sessions`、`capture_images`、`capture_candidates`、`receipts`、`devices`、`rpc_calls`。

---

## 3. 已锁定的技术决策（**不要重新讨论**，除非她主动要求改）

| 项 | 决定 | 理由（被问到时这样解释） |
|---|---|---|
| 分工 | 设备只做"出屏/出图"，识别与判断留在手机+后端 | 手部检测在浏览器里；端侧识别只有 ~50% 准确率，必须人工确认 |
| Fridge 屏 | **4.2″ 400×300 黑白墨水屏**（她买的是成品板，ESP32-C3，1300mAh 电池版） | 80 cm 外 8 mm 字一行能放 10 个字；墨水屏断电保画面 |
| 不做三色 | 不买黑白红三色 | 三色没有局部刷新，每次全屏闪 15–20 s；墨水屏的红偏暗，不如反白块清楚 |
| Fridge 渲染 | **在电脑上渲染成 1-bit 位图**，设备只下载+贴屏 | 固件里不放中文字库、不放排版；改版不重烧 |
| 位图尺寸 | 400×300 → **每行 50 字节 × 300 行 = 15000 字节**，无文件头，MSB-first | GxEPD2 的 `drawImage` 直接吃 |
| Cooking 硬件 | 1.28″ 圆屏旋钮成品模块（型号 UEDX24240013-MD50E，ESP32-C3，240×240，**对外接口 UART**，4MB Flash / 400KB RAM，5V/100mA） | 自带金属壳+旋转+按压+Wi-Fi，比散件少两周工作量 |
| Cooking 交互 | **旋转=切步，短按=开始/暂停计时，长按=退出**（不做"预览+确认"两步） | 做饭时少一个动作就是少一次手忙脚乱 |
| 通信 | **Wi-Fi + HTTPS 轮询 2 s**（不用 BLE、不用 Realtime） | BLE 在 iOS 网页里没有 Web Bluetooth，等于要写原生 App；Realtime 要把 anon key 下放到设备 |
| 设备认证 | `device_id` + `device_secret`，服务端存 sha256，设备不持任何 Supabase key | 现有 `devices.secret_hash` 就是为这个留的 |
| 同步节奏 | **每 6 小时联网一次，中间 30 分钟刷本地缓存** | Wi-Fi 一次 0.11 mAh，刷屏一次 0.02 mAh；省 Wi-Fi 比省刷屏划算 5 倍 |
| 功耗验收 | 充满电静置 24 h，掉电 >5% 判为"深睡是假的" | 这类成品板最常见的坑是 USB 串口芯片一直供电 |

---

## 4. 到货后先做的验货（**不要跳**）

### 4.1 Cooking Pebble（1.28″ 旋钮模块）

- [ ] 包装里有没有：模块本体、USB 转接板、烧录线
- [ ] 插上电脑 → 设备管理器出现新的 **COM 口**（没有就装 CH340/CH343 驱动）
- [ ] 找客服要：**对应型号的 PDF + GitHub 示例 + 源码**（他答应过）
- [ ] 确认：这块能不能用 **Arduino IDE 烧自己的程序**（不是只能用他的串口指令）
- [ ] 确认：主控是 **ESP32-C3**、有 Wi-Fi 和蓝牙（有 → 能连后端）

### 4.2 Fridge Display（4.2″ 墨水屏）

- [ ] **电池容量**（1300 mAh？）、30 分钟刷一次能撑多久
- [ ] **Hello World 源码里有没有屏幕引脚定义和驱动初始化**（发你看一眼）
- [ ] 屏幕驱动 IC 型号（SSD1683 / UC8176 / GDEY042T81）
- [ ] 充满电 → 静置 24 h 不刷新 → 记下掉电百分比（这是第 3 节的功耗验收）
- [ ] 壳子能不能打开、里面有没有 USB 口

> 任何一项答不出来 → 停下来告诉她"这块板只能当玩具，不能二次开发"，再决定退货/换 Waveshare 4.2″ + ESP32 板。

---

## 5. 逐日任务（她回家后照着走，**每次只推进一条**）

### D0 · 开箱与拍照
- 做什么：把两块板正反面拍清楚，连丝印一起拍。
- 看到什么算过：能看清丝印上的引脚名（VCC/GND/CS/DC/RST/BUSY 或 D0/D1…）。
- 失败查什么：拍不清就找卖家要引脚图。

### D1 · 点亮 Cooking 屏（最简单的一步，先建立信心）
- 做什么：装 Arduino IDE 2.x → 开发板管理器装 esp32 → 烧**卖家给的 Hello World**。
- 看到什么算过：圆屏出现他的示例画面。
- 失败查什么：没有 COM 口（驱动）；上传报错（选错开发板：要选 **ESP32C3 Dev Module**）。

### D2 · 点亮 Fridge 屏
- 做什么：烧卖家的 Hello World。
- 看到什么算过：墨水屏整屏刷一次，出现画面（4.2″ 单色整刷约 1.6 s）。
- 失败查什么：全白（BUSY 没接/没定义）；花屏（面板类不对）。

### D3 · Fridge：显示**你自己生成**的一帧
- 做什么：电脑上跑下面的 Python，生成 `frame.bin`，传到 GitHub 仓库，设备下载显示。
- 看到什么算过：屏上是"先吃这些 / 鸡蛋 还剩 1 天 / …"，跟电脑上的 `frame_preview.png` 一致。
- 失败查什么：画面横躺（rotation）；右半边空白（宽度不是 8 的倍数）。

```python
# tools/frame.py  —— 400×300 单色，输出 15000 字节
from PIL import Image, ImageDraw, ImageFont
W, H = 400, 300
img = Image.new("1", (W, H), 1)            # 1=白 0=黑
d = ImageDraw.Draw(img)
big   = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 44)
mid   = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 30)
small = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 20)

d.text((16, 10), "先吃这些", font=small, fill=0)
d.line((0, 42, W, 42), fill=0)
rows = [("鸡蛋", 1), ("菠菜", 2), ("牛奶", 3)]
y = 56
for name, days in rows:
    d.text((18, y), name, font=big, fill=0)
    t = f"还剩 {days} 天"
    d.text((W - 18 - d.textlength(t, font=big), y), t, font=big, fill=0)
    y += 62
d.text((16, H - 40), "共 12 样 · 3 样该先吃 · 刚同步", font=small, fill=0)
img.save("frame_preview.png")               # 先给人看这一张

px = img.load(); out = bytearray()
for yy in range(H):
    for xb in range(0, W, 8):
        b = 0
        for i in range(8):
            if px[xb + i, yy] == 0: b |= 1 << (7 - i)
        out.append(b)
open("frame.bin", "wb").write(bytes(out))
print("frame.bin", len(out))                # 必须是 15000
```

```cpp
// Fridge 固件骨架（把四个星号换成卖家 Hello World 里的引脚）
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <GxEPD2_BW.h>

#define W 400
#define H 300
// 4.2″ 400×300 单色在 GxEPD2 里是 GxEPD2_420（原生横屏，不用旋转）
GxEPD2_BW<GxEPD2_420, GxEPD2_420::HEIGHT>
  display(GxEPD2_420(/*CS=*/ *, /*DC=*/ *, /*RST=*/ *, /*BUSY=*/ *));

const char* HOST = "jellyfishhamburger.github.io";
const char* PATH = "/fridge-decision/frame.bin";
static uint8_t buf[W * H / 8];               // 15000

bool pull() {
  WiFiClientSecure c; c.setInsecure();       // 原型阶段；产品阶段换根证书
  if (!c.connect(HOST, 443)) return false;
  c.print(String("GET ") + PATH + " HTTP/1.1\r\nHost: " + HOST + "\r\nConnection: close\r\n\r\n");
  while (c.connected()) { if (c.readStringUntil('\n') == "\r") break; }
  size_t n = 0; uint32_t t0 = millis();
  while (c.connected() && n < sizeof(buf)) {
    if (c.available()) buf[n++] = c.read();
    if (millis() - t0 > 20000) break;
  }
  c.stop();
  return n == sizeof(buf);
}

void show() {
  display.setFullWindow(); display.firstPage();
  do { display.drawImage(buf, 0, 0, W, H, false, false, false); } while (display.nextPage());
}
```

### D4 · Fridge：从 Supabase 拉真数据
- 做什么：`frame.py` 里的 `rows` 改成读 Supabase（`items` 表按 `days_left` 升序取 3 条）。
- 看到什么算过：App 里删掉一样食材，下一次刷新后屏上消失。
- 注意：服务端 key 只能放电脑/CI，**绝不进固件**。

### D5 · Cooking：旋钮 → 手机步骤同步
- 做什么：先只做"旋钮转一下，串口打印 step 3"，再接到 `/state`。
- 看到什么算过：手机点"开始做饭"，2 秒内旋钮屏显示 `03/05`。
- 失败查什么：卡在"卖家示例怎么改"→ 让他把示例工程的结构（文件树 + 主函数）发出来，再逐行定位。

### D6 · 外壳与挂装
- Fridge：磁铁 + 双面胶吸在冰箱**门外侧或侧面靠前**；别装在门轴那一侧。
- Cooking：先用卖家的金属壳，别急着打印。

### D7 · 稳定性
- 连续跑 8 小时不重启；拔电重插恢复；断网保留上一帧；面板站立 1 m 外可读。

---

## 6. 后端增量（只在 D4/D5 才需要动）

**最小改动，三个新文件 + 两处小改，不要重构：**

| 文件 | 作用 |
|---|---|
| `migrations/013_devices_state.sql` | `cook_sessions(id, household_id, device_id, recipe_id, step_index, step_count, timer_ends_at, status, updated_at)`；RLS 只允许 service role |
| `supabase/functions/device-api/index.ts` | `GET /state`、`POST /step`、`GET /frame`、`POST /pair`；校验 `x-device-secret` 与 `devices.secret_hash` 的 sha256 |
| `firmware/` | 两个设备的固件 |
| `cook.js` | 点"开始做饭"时建 session；轮询回显旋钮的步数 |
| `settings.html` | 加"配对一个旋钮"：显示 6 位码，写入 `devices` |

**契约示例**

```json
GET /device-api/state?device_id=<uuid>
Header: x-device-secret: <hex>

{
  "session_id": "...",
  "recipe": { "id": "tomato_egg", "name": "番茄炒蛋" },
  "step_index": 2,
  "step_count": 5,
  "step_text": "下蛋液 中火翻炒",
  "timer": { "seconds_left": 18, "running": true },
  "status": "cooking",
  "updated_at": "2026-11-03T12:34:56Z"
}
```

```json
POST /device-api/step
{ "device_id": "...", "action": "set_step", "step_index": 3 }
```

**红线**：设备不持 Supabase key；不绕过 RLS；用户确认前不改库存；图片不长期保存。

---

## 7. 内容侧的唯一硬要求

她截图里的步骤是长散文，例如：
> 重新开火，倒入5ml油，油热后，放入菠菜，大火翻炒15秒后，倒入鸡蛋块，翻炒均匀

**300 px 宽的屏一行放不下。** 规则（不要让她手工重写 400 道菜）：

1. 按 `，。；` 拆成"动作原子"，每段 ≤10 字；
2. 把"大火/中火/小火 + 秒/分钟"抽出来当计时段；
3. 解释性的话丢弃（留在 App 和语音里）；
4. **只手工润色前 20 道**，其余全自动拆。

拆完大约是：`重新开火` → `倒 5ml 油` → `油热下菠菜` → `大火翻炒（15 秒）` → `倒入鸡蛋块` → `翻炒均匀`。

---

## 8. 她现在最可能卡住的三件事（提前准备答案）

| 卡点 | 你的处理 |
|---|---|
| "他说只能用他的 App/固件" | 那这块板不能二次开发。让她退货，换 Waveshare 4.2″ 模块 + ESP32-S3 板（我们全程按 GxEPD2 写） |
| "烧录报错/找不到 COM 口" | 先装 CH340/CH343 驱动；换一根**能传数据**的 USB-C 线；开发板选 ESP32C3 Dev Module |
| "屏上什么也没有" | 90% 是 BUSY 没接或没定义；10% 是面板类选错（`GxEPD2_420` ↔ `GxEPD2_420_M01`） |

---

## 9. 她给你的反馈格式（让她这样回，能省一半时间）

```
1) 我做了什么：
2) 屏上现在是什么样：（照片）
3) 串口最后 15 行：
4) 卡在哪一句：
```

---

## 10. 文件索引（都在仓库 `docs/` 下，家里电脑 `git pull` 就能拿到）

| 文件 | 内容 |
|---|---|
| `docs/FridgePebble_实施_v0.1.md` | 墨水屏方案：BOM、接线、Python 生成器、固件、供电、外壳、验收（原写 2.9″，若改 4.2″ 只需换尺寸与面板类） |
| `docs/CookingPebble_硬件实施_v0.1.md` | 旋钮方案：选型、接线、阶段测试、与 App 的连接、机械结构 |
| `docs/硬件方案_20261103.md` | 三个设备的整体架构、device-ingest 契约、BOM |
| `docs/同类方案调研_20261103.md` | 别人做到哪一步（引用给别人看很有用） |
| `docs/屏_1.28寸_真实尺寸.html` | 1.28″ 屏 1:1 尺寸对照，用来解释"为什么字看不清" |

---

## 11. 未决问题（按优先级）

1. Cooking 模块能不能用 Arduino 烧自己的程序？（决定后面全部工作）
2. Fridge 板的 Hello World 里有没有引脚定义和驱动初始化？
3. Fridge 板深睡电流（24 h 掉电法测）。
4. 两个设备的配对码怎么展示（手机端还是设备端显示）。
5. 4.2″ 版的 `display.html` 三屏要不要重排（400×300 能放 5 行，比 3 行更宽松）。

---

## 12. 一句话给接手的人

**她不需要一份漂亮的架构文档，她需要"今天这一步怎么做、做完看到什么算成功"。**
把每个动作压到 30 分钟以内能完成、能看见结果，她就能自己做下去。
