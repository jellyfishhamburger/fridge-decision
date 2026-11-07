# FridgeOnline HTTPS 修复与验收 · 2026-11-08

## 后续现场实测：COM4 已上传，目标路径仍被重置

用户开启热点后，已实际烧录修复版并通过写入哈希校验。设备的 Wi-Fi 状态为 WL_CONNECTED、时间有效，正式请求仍在约 240–464ms 返回连接重置，没有收到 Supabase HTTP 状态。

### 受控对比结果

所有连接都保留证书和主机名验证，未发送设备密钥进行探测；诊断程序不改写屏幕或 LittleFS 缓存，已从设备移除。

| 板端测试 | 结果 |
|---|---|
| 正式域名 + 172.64.149.246:443 | -80，握手被重置 |
| 正式域名 + 104.18.38.10:443 | -80，握手被重置 |
| 正式域名，有/无 HTTP/1.1 ALPN | 均被重置 |
| 官方 `<project>.functions.supabase.co` 函数域名 | 仍被重置 |
| IDF 默认密码套件 / 仅 ECDHE-ECDSA-AES128-GCM-SHA256 | 均被重置 |
| **同一目标 IP 172.64.149.246:443，合法控制域名 www.cloudflare.com，配套有效 ISRG Root X1** | **板端证书验证成功，HTTP/1.1 200 OK** |

电脑在同一时段使用正式目标、相同 IP 和 GTS Root R4，通过直接套接字和既有代理均能严格校验成功；但电脑与设备可能走不同接入路径，这不等于手机热点可用。电脑测试 8443/2053 可建立受信 TLS，但服务返回 403，因此没有把这些端口作为生产配置。

**可确认的故障位置：当前设备访问路径对 Supabase 目标主机名的 TLS 连接发生选择性重置。** 证据不支持 CA 损坏、RAM 不足、缺少 ALPN 或仅 Arduino HTTPS 封装问题。未做链路抓包，不能断言重置由运营商、防火墙、手机或远端哪一方产生，也不能声称用代码已经恢复独立直连。

### 本次正式固件补正与状态

- ESP-TLS 的错误存储接口可能返回正数绝对值（本机为 80），现统一规范为负数后解码；串口已经实测输出 `tls=-80` 和 `NET_CONN_RESET: connection reset by peer/path`。
- 增加串口 `f`：保留当前屏幕和缓存，仅清除网络任务的 ETag，使下一次请求尝试获取完整 200 响应。`n` 仍为正常条件请求；通知改用位标志合并；限频从实际 HTTPS 开始计时，避免 NTP 等待缩短两次请求之间至少 30 秒的间隔。未删除或修改家庭库存。
- 最新正式固件已重新编译并上传 COM4；Flash 1150952 字节（87%）、静态 RAM 66988 字节（20%）。实体设备已恢复正式 FridgeOnline，未停留在一次性诊断程序。
- 重启后串口确认 `has_cached_frame=1`、`cache_saved=1`、`cache_ready=1`；失败保留旧画面。`f` 的缓存保留行为也已通过串口触发验证。屏幕图像本身不以串口返回代替目视验收。
- **Supabase 的板端 200/304 仍未取得，不能标记 HTTPS 同步验收完成。** 下一步需要可达网络/自定义 HTTPS 入口；也可经用户选择使用受限电脑 CONNECT 中转做端到端验证，但这会引入电脑依赖，不能冒充独立联网。

以上现场结果取代下文初次提交时“暂不开放热点、尚未烧录”的历史检查点。完整原始诊断日志只留本机 tmp，不上传带私人配置的二进制或本机配置。


## 结论与证据边界

已确认旧日志的 `-80 / UNKNOWN ERROR CODE (0050)` 对应 `MBEDTLS_ERR_NET_CONN_RESET`：TLS 底层连接被对端或中间路径重置。`-23` 是项目自行赋予的连接失败状态，不是 Supabase HTTP 返回码。DNS 和 TCP 443 成功不代表 TLS 成功。

已确认的代码缺陷：旧版本先建立独立 TLS 探测连接，随后 `stop()`，再让 HTTPClient 建立第二次连接；探测失败会直接阻止正式请求。移除此流程，改成一次正式 HTTPS 请求。

**仍不能断言引起第一次握手重置的唯一因素。** 正确的主机名重载本来就设置 SNI，不能把旧调用简单认定为缺少 SNI。证书实查有效，也不能将连接重置解释为 CA 过期或损坏。新实现是兼容当前工具链的传输实现修复；板端是否消除 `-80`，必须通过现场 200/304 验收。用户本次要求先完成源码和 GitHub 上传，暂不开放热点实测。

## 实际配置与证书审查

- 目录：`firmware/FridgeOnline`；开发板 `esp32:esp32:AirM2M_CORE_ESP32C3`，4MB。
- 实际安装版本：Arduino ESP32 core **3.1.0**，ESP-IDF **v5.3.2-174-g083aad99cf**；GxEPD2 **1.6.9**。
- 从本机忽略文件中的 `FRIDGE_ROOT_CA` 单独解析，未输出 Wi-Fi 密码或设备密钥。证书为自签 CA **GTS Root R4**，PEM 763 字符；有效期 UTC **2016-06-22 至 2036-06-22**。
- 根证书 SHA256：`34:9D:FA:40:58:C5:E2:63:12:3B:39:8A:E7:95:57:3C:4E:13:13:C8:3F:E6:8F:93:55:6C:D5:E8:03:1B:3C:7D`。
- 2026-11-08 经本机既有代理对正式主机执行 TLS 1.2 严格校验，使用的信任锚就是上述 PEM，`authorized=true`。链为 `supabase.co → WE1 → GTS Root R4`。叶证书截止 UTC 2027-01-22；WE1 截止 UTC 2029-02-20；服务器还提供了 GlobalSign 交叉签名的 R4，截止 UTC 2028-01-28。交叉签名证书与本机自签 R4 字节不同不代表根证书错误。
- 电脑直接出站在本次受限执行环境被拒绝；代理校验结果只能证明所观察到的链可验证，不能代表设备网络路径成功。
- core 3.1.0 的 `NetworkClientSecure::connect(const char*, uint16_t)` 会保留 hostname 并调用 `mbedtls_ssl_set_hostname`；`setCACert` 路径使用 `MBEDTLS_SSL_VERIFY_REQUIRED`。其 `setTimeout(15000)` 实际继承 Stream，只设置流读取等待，未修改 NetworkClient 的连接超时；连接超时应使用 `setConnectionTimeout(ms)` 或带超时的 connect 重载。`setHandshakeTimeout` 单位为秒。原代码未单独设握手超时，默认握手等待可达 120 秒；不能把原 setTimeout 当成 15 秒握手上限。本修复绕过这一易混淆的封装，使用 SDK 的毫秒 timeout_ms。
- 当前 C3 预编译配置启用 TLS 1.2，未启用 TLS 1.3。因此本次不能宣称根因是 TLS 1.3 协商失败。IDF 5.3 的 `esp_http_client_config_t` 没有 `alpn_protos` 字段；最终实现使用该版本实际提供的 API，HTTP 客户端发送 HTTP/1.1。

## 最终实现

`FridgeOnline.ino` 使用内置 `esp_http_client` 的流式流程：

`init → 设置请求头 → open → fetch_headers → read → close → cleanup`

- `cert_pem = FRIDGE_ROOT_CA`；明确 TLS 1.2；保留 URL 域名以供 SNI 和主机名匹配；`skip_cert_common_name_check=false`。未使用 `setInsecure`，未关闭任何证书校验。
- 每轮只有一次正式连接，没有 DNS/TCP/TLS 额外探测，也没有应用内隐藏重连。禁止重定向，密钥仅发往配置的 HTTPS 地址。URL 不允许用户信息、查询串或 fragment。
- 连接/握手和响应头使用 15000ms 网络超时。正文每次读最多 1024 字节，空闲等待最多 1500ms，并在读循环检查 20000ms 正文截止时间、限制下一次读取的等待时间。该截止检查发生在 SDK 读取调用之间，不宣称严格的整请求墙钟上限；DNS 和 SDK 内部分段读取仍受底层实现影响。
- 只接受 200 + Content-Length=15000 + 非 chunked + 正确格式 + 64 位小写十六进制 SHA256；拒绝缺失、重复、过长或非法元数据。数据完整且 SHA256 匹配后才交给显示任务。
- 304 仅在本次确实携带已有 ETag 时接受；不刷新未变化画面。保留 5 分钟轮询、失败 30 秒重试、缓存及失败保留原画面。
- 对分配失败和队列满显式处理。`FridgeHttps.h` 在 ERROR/DISCONNECTED 事件中读取底层 TLS 错误及证书验证位，关闭连接采集错误后再记录，避免 cleanup 后错误丢失。
- 日志只包含阶段、结果、HTTP 状态、errno、TLS 错误、验证位、耗时、堆、任务剩余栈及时间戳，不输出设备身份、密钥、请求头或完整 URL。使用默认关闭详细调试的构建；不要开启可能打印请求信息的 SDK verbose 日志后公开上传日志。

## 串口判读

| 输出/状态 | 意义 |
|---|---|
| `HTTPS START ... verify=required` | 开始唯一一次正式 HTTPS 连接 |
| `phase=connect`、`code=-23` | 正式连接/握手/发送请求头失败，看 transport、errno、tls 和 verify |
| `tls=-80`、`NET_CONN_RESET` | 连接重置；不是“未知错误”，也不能仅凭它判断 CA 失败 |
| `verify` 非 0 | 有证书验证失败，紧接着输出具体原因 |
| `code=-24` | 响应头读取失败 |
| `code=-16` | 状态为 200/304 但响应契约不符 |
| `code=-17` | 正文读取超时 |
| `code=-11` | 正文不完整或 SHA256 不符 |
| `code=-15` | 内存分配失败 |
| `code=-13` | 时钟同步等待 15 秒后仍未达到可验证证书的时间 |
| `code=-14` | 本轮没有已连接的 Wi-Fi；尚未运行 HTTPS |
| `phase=verified-frame`、`SYNC result=OK code=200` | TLS/格式/长度/哈希均通过，画面已入队 |
| `phase=not-modified`、`SYNC result=OK code=304` | TLS 和条件请求成功，保留已有画面 |

HTTP 401/403 是设备认证问题；HTTP 503 是服务端问题。两者均已越过 TLS 阶段，不应继续修改根证书。`DISPLAY RETURNED` 只表明显示驱动返回，实体图像仍需目视确认。

## 一组连续现场步骤

1. 开启设备现有配置对应的热点，保持冰箱屏通过 USB 接到本机；不需要重新提供截图或改 Wi-Fi 配置。
2. Arduino IDE 打开 `firmware/FridgeOnline/FridgeOnline.ino`，保留本机被忽略的 `fridge_secrets.h`、`fridge_wifi.local.h`；开发板选择 AirM2M_CORE_ESP32C3，core 3.1.0，4MB，调试级别 None，端口确认是该设备的 COM4。不要把含本机配置的二进制上传 GitHub。
3. 关闭其他串口监视器，点击上传；完成后打开 115200 串口监视器。若上传停在 Connecting，按住 BOOT 再短按 RESET，连接开始后松开 BOOT。不要擦除全部 Flash。
4. 等待一次自动同步，预期 `HTTPS START` 只出现一次，随后 `phase=verified-frame` 和 `SYNC result=OK code=200`；若缓存已有相同 ETag，首次返回 304 也正常。
5. 距上次尝试至少 30 秒后，发送 `n` 请求同步；预期 304 且不重复全刷。发送 `s` 查看状态；确认已有画面、缓存保存成功。按 RESET 后确认旧画面能从缓存恢复。
6. 若失败，只需保留这一轮从 `HTTPS START` 到 `SYNC` 的文字诊断；不需要重复 DNS/TCP 探测或截图。若仍为 -80，则握手重置原因仍待现场路径诊断，不能将本次提交标记为设备 HTTPS 验收通过。

## 编译与测试结果

- 最终带本机配置构建通过：Flash **1150544 / 1310720 字节（87%）**；静态 RAM **66988 / 327680 字节（20%）**。
- 公开源码无配置构建通过：Flash 970488 字节（74%）、静态 RAM 65020 字节（19%）；只复制 .ino、HTTPS 辅助头、自定义屏驱动和空白示例配置到独立临时目录，未带私人头或库存快照。
- `node tools/test-fridge-frame.mjs`：通过认证/家庭隔离、15000 字节格式、SHA256、304、稳定刷新窗口、错误保留契约。
- `node tools/test-fridge-inventory.mjs`：通过认证、只读/方法限制、家庭隔离、字段白名单和失败关闭契约。
- 仅四个源码/说明文件进入发布列表，已与本机设备身份、设备密钥、Wi-Fi 密码比对，未发现私人值；Git 确认私有头和库存快照仍被忽略。未上传固件二进制。
- 本次未向设备烧录新固件，未取得修复后板端 200/304，原始连接重置的最终根因仍未确认。

## 参考依据

- [Arduino ESP32 3.1.0 NetworkClientSecure 实现](https://github.com/espressif/arduino-esp32/blob/3.1.0/libraries/NetworkClientSecure/src/NetworkClientSecure.cpp)
- [Arduino ESP32 3.1.0 TLS 实现](https://github.com/espressif/arduino-esp32/blob/3.1.0/libraries/NetworkClientSecure/src/ssl_client.cpp)
- [ESP-IDF 5.3 ESP32-C3 HTTP Client 文档](https://docs.espressif.com/projects/esp-idf/en/v5.3/esp32c3/api-reference/protocols/esp_http_client.html)
- [ESP-IDF 5.3.2 HTTP Client 错误事件和关闭流程](https://github.com/espressif/esp-idf/blob/v5.3.2/components/esp_http_client/esp_http_client.c)
- 错误码另核对本机 SDK 的 `mbedtls/net_sockets.h`：`MBEDTLS_ERR_NET_CONN_RESET = -0x0050`。
