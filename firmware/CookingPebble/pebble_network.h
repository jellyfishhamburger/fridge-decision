#pragma once
// Connection state only; never prints SSID/password, and never blocks on Wi-Fi.
enum class PebbleNetwork { Unconfigured, Connecting, Connected, Retrying };
void pebbleNetworkBegin();
void pebbleNetworkTick();
PebbleNetwork pebbleNetworkState();
