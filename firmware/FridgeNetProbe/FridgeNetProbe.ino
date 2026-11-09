// FridgeNetProbe —— 只测「这台设备能不能对这个域名完成 TLS 握手」
// 不显示画面、不改库存、不写缓存。输出全部在串口（115200）。
// 目的：判定 tls=-80（connection reset）是「所有域名都失败」还是「只有 supabase 域名失败」。
#include <WiFi.h>
#include <esp_http_client.h>
#include <esp_crt_bundle.h>
#include <time.h>
#include "FridgeHttps.h"

#if __has_include("fridge_wifi.local.h")
#include "fridge_wifi.local.h"
#endif
#ifndef FRIDGE_WIFI_SSID
#define FRIDGE_WIFI_SSID ""
#endif
#ifndef FRIDGE_WIFI_PASSWORD
#define FRIDGE_WIFI_PASSWORD ""
#endif

// ESP32-C3 只能看 2.4 GHz。允许最多两组候选 SSID，按顺序试。
struct WifiCandidate { const char* ssid; const char* pass; };
static const WifiCandidate WIFI_CANDIDATES[] = {
  {FRIDGE_WIFI_SSID, FRIDGE_WIFI_PASSWORD},
#ifdef FRIDGE_WIFI_SSID_2
  {FRIDGE_WIFI_SSID_2, FRIDGE_WIFI_PASSWORD_2},
#endif
#ifdef FRIDGE_WIFI_SSID_3
  {FRIDGE_WIFI_SSID_3, FRIDGE_WIFI_PASSWORD_3},
#endif
};
static const int NWIFI = sizeof(WIFI_CANDIDATES) / sizeof(WIFI_CANDIDATES[0]);

struct Target {
  const char* label;
  const char* url;
  bool forceTls12;
};

// 顺序有意义：前两个是真实目标，后面是逐步放宽的对照。
static const Target TARGETS[] = {
  {"A-real-tls12",  "https://zbrvcwxwecorjdzqltxg.functions.supabase.co/fridge-frame", true},
  {"B-real-auto",   "https://zbrvcwxwecorjdzqltxg.functions.supabase.co/fridge-frame", false},
  {"C-project",     "https://zbrvcwxwecorjdzqltxg.supabase.co/", true},
  {"D-cf-otherzone","https://supabase.com/", true},
  {"E-cf-known",    "https://www.cloudflare.com/", true},
  {"F-non-cf",      "https://jellyfishhamburger.github.io/fridge-decision/", true},
};
static const int NTARGETS = sizeof(TARGETS) / sizeof(TARGETS[0]);

static void resolveAll() {
  Serial.println("PROBE DNS");
  for (int i = 0; i < NTARGETS; i++) {
    String url(TARGETS[i].url);
    int start = url.indexOf("://") + 3;
    int end = url.indexOf('/', start);
    String host = url.substring(start, end < 0 ? url.length() : end);
    IPAddress ip;
    uint32_t t0 = millis();
    bool ok = WiFi.hostByName(host.c_str(), ip);
    Serial.printf("PROBE dns %s -> %s (%lu ms)\n", host.c_str(), ok ? ip.toString().c_str() : "FAIL",
                  (unsigned long)(millis() - t0));
  }
}

static void probeOne(const Target& target) {
  FridgeHttpsDiagnostics diag;
  esp_http_client_config_t config = {};
  config.url = target.url;
  config.crt_bundle_attach = esp_crt_bundle_attach;   // 内置根证书包，不需要单独 PEM
  config.skip_cert_common_name_check = false;
  config.timeout_ms = 12000;
  config.disable_auto_redirect = true;
  config.buffer_size = 512;
  config.buffer_size_tx = 512;
  config.event_handler = fridgeHttpsEvent;
  config.user_data = &diag;
  if (target.forceTls12) config.tls_version = ESP_HTTP_CLIENT_TLS_VER_TLS_1_2;

  auto client = esp_http_client_init(&config);
  if (!client) { Serial.printf("PROBE %s init=FAIL(alloc)\n", target.label); return; }

  esp_http_client_set_header(client, "Connection", "close");
  const uint32_t started = millis();
  esp_err_t error = esp_http_client_open(client, 0);
  if (error != ESP_OK) {
    const int socketError = esp_http_client_get_errno(client);
    if (socketError) diag.socketError = socketError;
    esp_http_client_close(client);
    fridgeHttpsLog(target.label, error, client, diag, started);
    esp_http_client_cleanup(client);
    Serial.printf("PROBE %s verdict=HANDSHAKE_FAIL\n\n", target.label);
    return;
  }
  int64_t length = esp_http_client_fetch_headers(client);
  int status = esp_http_client_get_status_code(client);
  Serial.printf("PROBE %s verdict=TLS_OK http=%d content_length=%lld elapsed_ms=%lu\n\n",
                target.label, status, (long long)length, (unsigned long)(millis() - started));
  esp_http_client_close(client);
  esp_http_client_cleanup(client);
}

static void runAll() {
  Serial.printf("PROBE START heap=%lu rssi=%d ip=%s gw=%s\n", (unsigned long)ESP.getFreeHeap(),
                WiFi.RSSI(), WiFi.localIP().toString().c_str(), WiFi.gatewayIP().toString().c_str());
  Serial.printf("PROBE TIME epoch=%lu\n", (unsigned long)time(nullptr));
  resolveAll();
  for (int i = 0; i < NTARGETS; i++) {
    probeOne(TARGETS[i]);
    delay(1500);
  }
  Serial.println("PROBE DONE — 把从 PROBE START 到 PROBE DONE 的整段贴回来");
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("\nFRIDGE NET PROBE v1 (no display, no secrets)");
  if (!strlen(FRIDGE_WIFI_SSID)) {
    Serial.println("PROBE ERROR: 缺 fridge_wifi.local.h（把 FridgeOnline 目录里那份复制过来）");
    return;
  }
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true, true);
  delay(300);

  // 先扫一遍：ESP32-C3 看得到的只有 2.4 GHz 网络
  int found = WiFi.scanNetworks();
  Serial.printf("PROBE SCAN count=%d (只能看到 2.4G)\n", found);
  for (int i = 0; i < found; i++) {
    Serial.printf("PROBE SCAN ssid=%s rssi=%d ch=%d enc=%d\n",
                  WiFi.SSID(i).c_str(), WiFi.RSSI(i), WiFi.channel(i), (int)WiFi.encryptionType(i));
  }
  WiFi.scanDelete();

  bool connected = false;
  for (int i = 0; i < NWIFI && !connected; i++) {
    if (!strlen(WIFI_CANDIDATES[i].ssid)) continue;
    Serial.printf("PROBE WIFI try ssid=%s\n", WIFI_CANDIDATES[i].ssid);
    WiFi.begin(WIFI_CANDIDATES[i].ssid, WIFI_CANDIDATES[i].pass);
    uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) delay(250);
    connected = WiFi.status() == WL_CONNECTED;
    if (!connected) {
      Serial.printf("PROBE WIFI fail ssid=%s status=%d\n", WIFI_CANDIDATES[i].ssid, (int)WiFi.status());
      WiFi.disconnect(true, true);
      delay(500);
    }
  }
  if (!connected) {
    Serial.println("PROBE ERROR: 两组候选 SSID 都没连上（Wi-Fi 名/密码/2.4G 频段三选一有问题）");
    return;
  }
  Serial.printf("PROBE WIFI connected ssid=%s rssi=%d\n", WiFi.SSID().c_str(), WiFi.RSSI());
  configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
  uint32_t t0 = millis();
  while (time(nullptr) < 1700000000 && millis() - t0 < 15000) delay(250);
  runAll();
}

void loop() {
  if (Serial.available() && Serial.read() == 'r') {
    Serial.println("PROBE rerun");
    runAll();
  }
  delay(100);
}
