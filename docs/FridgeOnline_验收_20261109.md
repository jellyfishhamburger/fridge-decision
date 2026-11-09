# FridgeOnline 端到端验收：2026-11-09

## 结论

设备端 HTTPS 同步**已跑通并取得板端 200**，是这块屏第一次完成「服务器渲染 → TLS 严格校验 → SHA256 校验 → 全刷显示」的完整链路。
之前记录在案的 `tls=-80` 不再是阻塞项。

## 现场证据（COM4，115200）

```
HTTPS START client=esp_http_client tls=1.2 http=1.1 verify=required connect_timeout_ms=15000
HTTPS HEADERS http=200 content_length=15000 chunked=0
HTTPS phase=verified-frame result=ESP_OK transport=0x0 http=200 errno=0 tls=0 verify=0x0 elapsed_ms=3467
SYNC result=OK code=200
_Update_Full : 4081998
DISPLAY RETURNED page=0 has_frame=1 cache_saved=1
```

随后的条件请求：

```
HTTPS HEADERS http=304 content_length=0 chunked=1
HTTPS phase=not-modified result=ESP_OK ... elapsed_ms=2292
SYNC result=OK code=304
```

即：200 → 校验 → 全刷 4.08 s；同一帧再请求 → 304 → 跳过刷新。ETag 生效。

## 定位过程（为什么之前的 -80 不是设备问题）

1. 电脑与设备同一项目，`curl --tlsv1.2 --no-alpn` 五个目标全部握手成功。
2. 新增 `firmware/FridgeNetProbe`，在设备上做 6 域名握手矩阵，结果 **6/6 TLS_OK**，其中正式接口返回 HTTP 401（预期，探针不带密钥）。
3. 因此 `-80` 发生在当时那条网络路径上，与证书、根证书、TLS 版本、ALPN、板子堆栈都无关。

## 现场环境（本次验收）

| 项 | 值 |
|---|---|
| Wi-Fi | TP-Link_365D（2.4 GHz，ch8，rssi −67） |
| 设备 IP | 192.168.0.104 |
| 板子 | AirM2M_CORE_ESP32C3，COM4，ESP32 core 3.1.0 / GxEPD2 1.6.9 |
| 构建 | Flash 1 135 810 字节（86%），静态 RAM 66 988 字节（20%） |
| 云端 | `functions/v1/fridge-frame`，设备 secret 认证，200 / 15 000 字节 / SHA256 一致，二次 304 |

**注意**：`TP-Link_365D_5G` 是 5 GHz 频段，ESP32-C3 看不到，必须用 2.4 GHz 的 `TP-Link_365D`。
`jellyfish` 这个 SSID 在设备扫描结果中不存在（推测为 5 GHz 或隐藏 SSID），本次未使用。

## 尚未验收

| 项 | 状态 |
|---|---|
| 5 分钟自动轮询跑满一轮 | ✅ 400 秒串口连续记录：21.2 s 与 324.4 s 各一次请求，间隔 303 s；均 304，未触发重刷 |
| 断电重插从 LittleFS 缓存恢复 | 已在启动日志见到 `has_cached_frame=1 cache_ready=1`，未做冷启动对比 |
| 服务端换帧后设备自动更新（非手动 `n`） | 未验证 |
| 断网保留旧画面 | 历史已验证，本次未复验 |

## 自动轮询实测（2026-11-09 深夜）

```
 18.6s  HTTPS START ... 
 21.2s  HTTPS HEADERS http=304   SYNC result=OK code=304
321.2s  HTTPS START ...
324.4s  HTTPS HEADERS http=304   SYNC result=OK code=304
```

间隔 303 s，符合 5 分钟轮询；两次都是 304，均未触发全刷（无 `DISPLAY REFRESH`）。

## 渲染排版已改版（commit 5b8d7bc，未部署）

1. 食材名与倒计时改为同一行左右对齐，消除行内重叠；
2. 英文食材名映射中文（109 条 `data.js` + 60 条常见写法）；
3. 新增 44×44 分类图标（叶菜 / 鱼 / 蛋 / 骨头 / 豆腐块 / 牛奶 / 饭碗 / 苹果 / 包裹）；
4. 到期项使用反白块。

`node tools/test-fridge-frame.mjs` 通过。**线上仍是旧版**，需 `supabase functions deploy fridge-frame` 后才生效。

## 版面 v3：只显示未过期 + 今晚推荐（commit 0391737，已部署）

- **过期食材不再上屏**：只保留 `days >= 0` 的条目，按剩余天数升序取前 2 条。
- **新增「今晚做这个」**：服务器侧沿用 `logic.js` 的 `evaluate()` 规则评分（最先坏的主轴、青菜 +4、超过 20 分钟按时长扣分、缺一样料扣 10），只在一道菜都不成立时才显示「库存还不够做一道菜」。
- 库存查询增加 `cat` 字段（`index.ts` 的 select），推荐用食材 id 匹配 `data.js` 的 `needs`，不靠名字。
- 线上实测：HTTP 200 / 15000 字节 / ETag `1ae6a7b7…`；设备 `SYNC result=OK code=200` 后整刷 4.08 s。
- `tools/test-fridge-frame.mjs`、`test-fridge-inventory.mjs`、`test-fridge-snapshot.cjs` 全部 PASS。

取舍待确认：临期只放 2 行（把下半屏让给推荐），推荐只出 1 道。
