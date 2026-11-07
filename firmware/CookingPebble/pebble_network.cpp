#include <Arduino.h>
#include <WiFi.h>
#include "pebble_network.h"
#if __has_include("pebble_secrets.h")
#include "pebble_secrets.h"
#else
#include "pebble_secrets.example.h"
#endif

static PebbleNetwork state = PebbleNetwork::Unconfigured;
static uint32_t attemptedAt = 0;
static constexpr uint32_t RETRY_MS = 30000;
static void connect() {
    attemptedAt = millis();
    state = PebbleNetwork::Connecting;
    WiFi.begin(PEBBLE_WIFI_SSID, PEBBLE_WIFI_PASSWORD);
    Serial.println("WiFi connecting");
}
void pebbleNetworkBegin() {
    if (strlen(PEBBLE_WIFI_SSID) == 0) {
        Serial.println("WiFi not configured; local cooking remains available");
        return;
    }
    WiFi.persistent(false);
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    connect();
}
void pebbleNetworkTick() {
    if (state == PebbleNetwork::Unconfigured) return;
    if (WiFi.status() == WL_CONNECTED) {
        if (state != PebbleNetwork::Connected) Serial.println("WiFi connected");
        state = PebbleNetwork::Connected;
        return;
    }
    if (state == PebbleNetwork::Connected) {
        state = PebbleNetwork::Retrying;
        attemptedAt = millis();
        Serial.println("WiFi lost; local cooking remains available");
    }
    if (uint32_t(millis() - attemptedAt) >= RETRY_MS) {
        // Disconnect only network state, never erase credentials or cooking state.
        WiFi.disconnect(false, false);
        connect();
    }
}
PebbleNetwork pebbleNetworkState() { return state; }
