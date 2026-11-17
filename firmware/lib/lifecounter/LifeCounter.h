#pragma once
// Hardwareunabhängige Zähllogik des Steuergeräts.
// Jede Änderung wird als Ereignis mit fortlaufender seq gepuffert, bis der Server
// sie per MQTT-ack bestätigt (siehe docs/schnittstellen.md, Abschnitt MQTT).

#include <cstddef>
#include <cstdint>

namespace topstack {

struct LifeEvent {
  uint32_t seq;
  uint8_t seat;   // 0 = Spieler A, 1 = Spieler B
  int16_t delta;
};

class LifeCounter {
 public:
  static constexpr size_t kSeats = 2;
  static constexpr size_t kBufferSize = 128;

  explicit LifeCounter(int16_t startingLife = 20) { reset(startingLife); }

  void reset(int16_t startingLife) {
    for (auto& l : life_) l = startingLife;
    count_ = 0;
  }

  // Gibt false zurück, wenn der Puffer voll ist (Änderung wird trotzdem gezählt).
  bool change(uint8_t seat, int16_t delta) {
    if (seat >= kSeats || delta == 0) return true;
    life_[seat] += delta;
    if (count_ == kBufferSize) return false;
    buffer_[count_++] = LifeEvent{nextSeq_++, seat, delta};
    return true;
  }

  // Entfernt alle bestätigten Ereignisse bis einschließlich seq.
  void acknowledgeUpTo(uint32_t seq) {
    size_t keep = 0;
    for (size_t i = 0; i < count_; ++i)
      if (buffer_[i].seq > seq) buffer_[keep++] = buffer_[i];
    count_ = keep;
  }

  int16_t life(uint8_t seat) const { return seat < kSeats ? life_[seat] : 0; }
  size_t pending() const { return count_; }
  const LifeEvent* pendingEvents() const { return buffer_; }
  bool suggestsWin(uint8_t& loserSeat) const {
    for (uint8_t s = 0; s < kSeats; ++s)
      if (life_[s] <= 0) { loserSeat = s; return true; }
    return false;
  }

 private:
  int16_t life_[kSeats]{};
  LifeEvent buffer_[kBufferSize]{};
  size_t count_ = 0;
  uint32_t nextSeq_ = 1;
};

}  // namespace topstack
