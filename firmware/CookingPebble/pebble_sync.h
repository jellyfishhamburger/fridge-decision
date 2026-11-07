#pragma once
#include <Arduino.h>
struct PebbleRemoteState {
    bool present, active, running, syncing;
    char session[37], text[1501];
    uint32_t revision, remainingMs, receivedAt, durationSeconds;
    int index, count;
};
enum class PebbleCommand { SetStep, ToggleTimer, Exit };
bool pebbleSyncConfigured();
int pebbleSyncStatus(); // -101 Wi-Fi, -102 clock, -103 response, -104 idle; HTTP codes otherwise
void pebbleSyncBegin();
bool pebbleSyncTake(PebbleRemoteState &state);
bool pebbleSyncSend(PebbleCommand command,const PebbleRemoteState &state,int step=0);
bool pebbleSyncPreview(PebbleRemoteState &state,int step);
