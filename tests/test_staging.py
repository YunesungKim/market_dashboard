import pytest
from tools.staging import StagingBoard


def test_add_assigns_unique_cardid_and_lists():
    b = StagingBoard()
    c1 = b.add({"title": "A"})
    c2 = b.add({"title": "B"})
    assert c1["cardId"] != c2["cardId"]
    assert c1["title"] == "A"
    assert len(b.list()) == 2


def test_update_only_content_fields():
    b = StagingBoard()
    c = b.add({"title": "A", "summary": "s", "detail": "d"})
    updated = b.update(c["cardId"], {"title": "새제목", "ignore": "x"})
    assert updated["title"] == "새제목"
    assert "ignore" not in updated


def test_update_unknown_raises():
    b = StagingBoard()
    with pytest.raises(KeyError):
        b.update("nope", {"title": "x"})


def test_delete_and_clear():
    b = StagingBoard()
    c = b.add({"title": "A"})
    assert b.delete(c["cardId"]) is True
    assert b.delete(c["cardId"]) is False
    b.add({"title": "B"})
    b.clear()
    assert b.list() == []
