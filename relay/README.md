# 中转（Relay）：让国内网络也能拉到冰箱屏的画面

## 为什么需要

设备从深圳家宽直连 `*.supabase.co` 时，TLS 握手在 240–464 ms 被重置（`tls=-80`）；
同一 IP 换成 `www.cloudflare.com` 则正常 → 是线路按域名重置，不是证书或代码问题。
ESP32 不能走代理，所以只能在「入口」上想办法。

## 两条路线

| 路线 | 费用 | 国内可达 | 说明 |
|---|---|---|---|
| **Cloudflare Worker（先用这个试）** | ¥0 | ⚠️ 用 `*.workers.dev` 在国内会被阻断；绑自有域名后一般可用 | 10 万次/天免费额度，我们每天约 288 次 |
| 香港小 VPS + Caddy 反代 | 域名 ¥30–80/年 + VPS ¥99/年 | ✅ 稳 | 长期方案，一台可服务几十台设备 |

## 免费试用的部署步骤（5 步，不需要信用卡）

1. 打开 <https://dash.cloudflare.com> → 注册/登录 → 左侧 **Workers & Pages**
2. **Create** → **Worker** → 名字填 `fridge-relay` → Deploy
3. 点 **Edit code**，把 `fridge-relay-worker.js` 全文粘进去，覆盖默认代码 → **Deploy**
4. 记下地址：`https://fridge-relay.<你的账号>.workers.dev`
5. 本机自测（把两个值换成你的）：

```bash
curl -sS -D - -o frame.bin \
  -H "x-device-secret: <设备密钥>" \
  "https://fridge-relay.<账号>.workers.dev/?device_id=<设备UUID>" | head -20
```

成功应当看到 `HTTP/1.1 200`、`content-length: 45000`、`x-frame-pages: 3`；
再请求一次（带上 `-H 'if-none-match: "<上一步的 etag>"'`）应当返回 **304**。

## 接到设备上

只需要把固件里的入口换成 Worker 地址（其余逻辑完全不变）：

- `firmware/FridgeOnline/fridge_secrets.h` 与 `firmware/FridgeSleep/fridge_secrets.h` 里的
  `FRIDGE_FRAME_URL` 改成 `https://fridge-relay.<账号>.workers.dev/?device_id=...` 的**基址**部分
  （固件会自己拼 `?device_id=`，所以基址不要带查询串）
- 根证书 `FRIDGE_ROOT_CA` 保持不变（上游仍是 supabase 的证书，Worker 透传）

> 注意 Worker 前面的 `?device_id=` 由设备拼接，Worker 原样转发，所以基址形如
> `https://fridge-relay.xxx.workers.dev` 即可。

## 安全边界

- Worker 只接受 `x-device-secret` 透传，不记录、不存储密钥；
- 它能看到设备密钥明文（透传必然如此），自用没问题，给别人家用要在报告里写明；
- 上游地址写死在代码里，避免被当成开放代理。

## 什么时候换 VPS

- 需要**国内稳定**：`*.workers.dev` 在大陆基本不可用，必须绑自有域名，而 CF 在国内的线路时好时坏；
- 需要服务多个家庭：一台香港轻量（¥99/年，1 TB/月流量）足够几百台设备。

换的时候设备侧只改一个宏，`FRIDGE_FRAME_URL` 指向 `https://fridge.你的域名`。
