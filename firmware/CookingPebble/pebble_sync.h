#pragma once
#include <Arduino.h>
struct PebbleRemoteState {
    bool present, active, running;
    char session[37], text[1501];
    uint32_t revision, remainingMs, receivedAt, durationSeconds;
    int index, count;
};
enum class PebbleCommand { SetStep, ToggleTimer, Exit };
bool pebbleSyncConfigured();
void pebbleSyncBegin();
bool pebbleSyncTake(PebbleRemoteState &state);
bool pebbleSyncSend(PebbleCommand command,const PebbleRemoteState &state,int step=0);
