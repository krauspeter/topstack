// TopStack Steuergerät – Platzhalter bis Phase 6.
// Ablauf später: WLAN -> MQTT (topstack/v1/devices/<id>/...) -> Taster entprellen -> LifeCounter.
#include <Arduino.h>
#include <LifeCounter.h>

static topstack::LifeCounter counter;

void setup() {
  Serial.begin(115200);
  Serial.println("TopStack Steuergeraet 0.1.0");
}

void loop() {
  delay(1000);
}
