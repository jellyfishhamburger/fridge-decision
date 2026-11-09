# FridgeNetProbe：一次烧录，判定 tls=-80 到底出在哪

## 为什么做这个

`FridgeOnline` 唯一没过的验收是设备端 HTTPS：串口出 `tls=-80 / NET_CONN_RESET`，握手在 240–464 ms 被重置。
电脑在同一个项目上 TLS 正常（2026-11-09 实测：`*.supabase.co` 握手 168 ms、`functions.supabase.co` 返回 401），
所以问题要么在**设备握手的报文**，要么在**设备当时走的那条网络**。

这个固件只做一件事：对 6 个域名各做一次握手，串口打印「成/败 + 错误码」。
不点屏、不读库存、不写缓存、不带 device secret —— **没有密钥泄露风险**。

## 目录

| 文件 | 说明 |
|---|---|
| `FridgeNetProbe.ino` | 主体。顺序测 6 个目标 |
| `FridgeHttps.h` | 从 `FridgeOnline/` 复制，用来解出 TLS 错误码（-80 等） |

## 测试目标

| 标签 | 地址 | 为什么测它 |
|---|---|---|
| A-real-tls12 | `*.functions.supabase.co/fridge-frame`，强制 TLS 1.2 | 正式目标，和 FridgeOnline 完全同一条路 |
| B-real-auto | 同上，不指定版本 | 排除「强制 1.2」这个变量 |
| C-project | `*.supabase.co/` | 换一个 supabase 子域 |
| D-cf-otherzone | `supabase.com/` | 同一家 CDN，另一个站点 |
| E-cf-known | `www.cloudflare.com/` | 已知在板子上成功过的对照 |
| F-non-cf | `jellyfishhamburger.github.io/...` | 完全不同的 CDN（Fastly） |

证书用 ESP-IDF 自带根证书包（`esp_crt_bundle_attach`），校验照开，**不是** `setInsecure()`。

## 烧录

1. 把 `FridgeOnline/fridge_wifi.local.h` 复制到本目录（里面有 Wi-Fi 名和密码，被 git 忽略）。
2. Arduino IDE 打开 `FridgeNetProbe.ino`；开发板 **AirM2M_CORE_ESP32C3**，4MB，端口 COM4。
3. 上传 → 打开 115200 串口监视器。**不用按任何键**，它自己跑完 6 个目标。
4. 跑完会打印 `PROBE DONE`。把 `PROBE START` 到 `PROBE DONE` 的整段发回来。
   想重跑：串口发一个 `r`。

## 怎么判读

| 结果 | 含义 | 下一步 |
|---|---|---|
| **全部 TLS_OK** | 这块设备、这条网络都没问题，之前的 -80 是当时那条网络造成的 | 直接烧回 `FridgeOnline` 重试同步 |
| **A/B/C 失败，D/E/F 成功** | 只有 `supabase.co` 这条主机名被重置 → 域名级阻断，不是板子坏了 | 换入口：自建域名/中转反代，代码只改 `FRIDGE_FRAME_URL` |
| **A/B 失败，C 成功** | 只有 `functions.supabase.co` 这个子域不行 | 同上，或改用 CDN 上的自定义域名 |
| **只 A 失败、B 成功** | 强制 TLS 1.2 是诱因 | 去掉 `config.tls_version` 即可 |
| **全部失败** | 板子侧握手栈或当前 Wi-Fi 出网有问题 | 换网络重测；再取 `PROBE dns` 段确认有没有 DNS 污染 |
| **DNS FAIL / IP 异常** | 解析被劫持 | 改用 8.8.8.8 / 私有大 DNS，再重测 |

`PROBE dns` 段会打印每个域名解析到的 IP。正常应为 Cloudflare 的 `172.64.x.x` / `104.18.x.x`。

## 注意

- 固件里没有 `fridge_wifi.local.h` 时不会联网，只打印一行错误 —— 这是正常的。
- 这个固件不验证 15000 字节画面，只看握手；`http=401` 就代表 TLS 已经通了（没有密钥当然 401）。
