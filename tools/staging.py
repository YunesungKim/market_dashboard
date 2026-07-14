class StagingBoard:
    """배포 전 후보 카드를 담는 서버 메모리 상태."""

    def __init__(self):
        self._cards = {}
        self._counter = 0

    def add(self, briefing):
        self._counter += 1
        card_id = f"card-{self._counter}"
        card = {"cardId": card_id, **briefing}
        self._cards[card_id] = card
        return card

    def list(self):
        return list(self._cards.values())

    def get(self, card_id):
        return self._cards.get(card_id)

    def update(self, card_id, fields):
        if card_id not in self._cards:
            raise KeyError(card_id)
        card = self._cards[card_id]
        for key in ("title", "summary", "detail"):
            if key in fields:
                card[key] = fields[key]
        return card

    def delete(self, card_id):
        return self._cards.pop(card_id, None) is not None

    def clear(self):
        self._cards.clear()
