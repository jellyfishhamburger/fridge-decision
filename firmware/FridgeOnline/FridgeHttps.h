#pragma once
#include <Arduino.h>
#include <time.h>
#include <esp_http_client.h>
#include <esp_tls.h>
#include <mbedtls/error.h>
#include <mbedtls/net_sockets.h>
#include <mbedtls/x509_crt.h>
#include <strings.h>

// No credentials or request URL are logged by this callback.
struct FridgeHttpsDiagnostics {
  char sha[65] = {};
  char format[32] = {};
  bool invalidHeaders = false;
  int socketError = 0;
  int tlsError = 0;
  int verifyFlags = 0;
  esp_err_t transportError = ESP_OK;
};

inline esp_err_t fridgeHttpsEvent(esp_http_client_event_t* event) {
  auto* diag = static_cast<FridgeHttpsDiagnostics*>(event->user_data);
  if (event->event_id == HTTP_EVENT_ON_HEADER) {
    const char* key = event->header_key;
    const char* value = event->header_value;
    if (!key || !value) return ESP_OK;
    if (strcasecmp(key, "x-frame-sha256") == 0) {
      if (diag->sha[0] || strlen(value) != 64) diag->invalidHeaders = true;
      strlcpy(diag->sha, value, sizeof(diag->sha));
    } else if (strcasecmp(key, "x-frame-format") == 0) {
      if (diag->format[0] || strlen(value) >= sizeof(diag->format)) diag->invalidHeaders = true;
      strlcpy(diag->format, value, sizeof(diag->format));
    }
  } else if ((event->event_id == HTTP_EVENT_DISCONNECTED || event->event_id == HTTP_EVENT_ERROR) && event->data) {
    const int socketError = esp_http_client_get_errno(event->client);
    if (socketError) diag->socketError = socketError;
    int code = 0, flags = 0;
    esp_err_t error = esp_tls_get_and_clear_last_error(
        static_cast<esp_tls_error_handle_t>(event->data), &code, &flags);
    // Cleanup may emit a second disconnect; preserve the original failure.
    if (error != ESP_OK) diag->transportError = error;
    if (code) diag->tlsError = code;
    if (flags) diag->verifyFlags = flags;
  }
  return ESP_OK;
}

inline void fridgeHttpsLog(const char* phase, esp_err_t result,
                           esp_http_client_handle_t client,
                           const FridgeHttpsDiagnostics& diag, uint32_t started) {
  char message[160] = {};
  if (diag.tlsError == MBEDTLS_ERR_NET_CONN_RESET) {
    strlcpy(message, "NET_CONN_RESET: connection reset by peer/path", sizeof(message));
  } else if (diag.tlsError) {
    mbedtls_strerror(diag.tlsError, message, sizeof(message));
  }
  Serial.printf("HTTPS phase=%s result=%s transport=0x%x http=%d errno=%d tls=%d verify=0x%x elapsed_ms=%lu heap=%lu stack_min=%lu epoch=%lu\n",
      phase, esp_err_to_name(result), (unsigned)diag.transportError,
      esp_http_client_get_status_code(client), diag.socketError,
      diag.tlsError, (unsigned)diag.verifyFlags,
      (unsigned long)(millis() - started), (unsigned long)ESP.getFreeHeap(),
      (unsigned long)uxTaskGetStackHighWaterMark(nullptr), (unsigned long)time(nullptr));
  if (message[0]) Serial.printf("HTTPS TLS detail=%s\n", message);
  if (diag.verifyFlags) {
    mbedtls_x509_crt_verify_info(message, sizeof(message), "", diag.verifyFlags);
    Serial.printf("HTTPS certificate detail=%s\n", message);
  }
}
