from topstack.domain.life import GameEvent, life_totals


def ev(i, player, delta, seq, device="d1", type_="life", undo_of=None):
    return GameEvent(
        id=i, player_id=player, type=type_, device_id=device, seq=seq, delta=delta, undo_of=undo_of
    )


def test_sum_of_deltas():
    events = [ev("1", "A", -3, 1), ev("2", "A", -2, 2), ev("3", "B", -5, 1, "d2")]
    assert life_totals("AB", events) == {"A": 15, "B": 15}


def test_undo_removes_event():
    events = [ev("1", "A", -7, 1), ev("2", None, None, 2, type_="undo", undo_of="1")]
    assert life_totals("AB", events) == {"A": 20, "B": 20}


def test_duplicates_are_harmless_when_deduplicated_by_id():
    e = ev("1", "A", -1, 1)
    unique = {x.id: x for x in [e, e, e]}.values()
    assert life_totals("A", unique) == {"A": 19}
