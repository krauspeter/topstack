#include <LifeCounter.h>
#include <unity.h>

using topstack::LifeCounter;

void setUp() {}
void tearDown() {}

void test_starts_at_20() {
  LifeCounter c;
  TEST_ASSERT_EQUAL_INT16(20, c.life(0));
  TEST_ASSERT_EQUAL_INT16(20, c.life(1));
}

void test_change_buffers_event() {
  LifeCounter c;
  c.change(1, -3);
  TEST_ASSERT_EQUAL_INT16(17, c.life(1));
  TEST_ASSERT_EQUAL_UINT32(1, c.pending());
  TEST_ASSERT_EQUAL_UINT32(1, c.pendingEvents()[0].seq);
}

void test_ack_removes_confirmed() {
  LifeCounter c;
  c.change(0, -1);
  c.change(0, -1);
  c.change(1, -5);
  c.acknowledgeUpTo(2);
  TEST_ASSERT_EQUAL_UINT32(1, c.pending());
  TEST_ASSERT_EQUAL_UINT32(3, c.pendingEvents()[0].seq);
}

void test_suggests_win_at_zero() {
  LifeCounter c(1);
  uint8_t loser = 99;
  TEST_ASSERT_FALSE(c.suggestsWin(loser));
  c.change(1, -1);
  TEST_ASSERT_TRUE(c.suggestsWin(loser));
  TEST_ASSERT_EQUAL_UINT8(1, loser);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_starts_at_20);
  RUN_TEST(test_change_buffers_event);
  RUN_TEST(test_ack_removes_confirmed);
  RUN_TEST(test_suggests_win_at_zero);
  return UNITY_END();
}
