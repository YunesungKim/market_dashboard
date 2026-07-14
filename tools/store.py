import json
import os


def load_briefings(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        content = f.read().strip()
    return json.loads(content) if content else []


def append_briefings(path, briefings):
    existing = load_briefings(path)
    used_ids = {b["id"] for b in existing}
    for b in briefings:
        b = dict(b)
        b["id"] = _unique_id(b["id"], used_ids)
        used_ids.add(b["id"])
        existing.append(b)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)
    return existing


def _unique_id(base, used):
    if base not in used:
        return base
    n = 2
    while f"{base}-{n}" in used:
        n += 1
    return f"{base}-{n}"


def remove_briefings(path, ids):
    """briefings.json에서 id가 ids에 속한 항목 제거. 삭제된 개수 반환."""
    existing = load_briefings(path)
    ids = set(ids)
    kept = [b for b in existing if b.get("id") not in ids]
    removed = len(existing) - len(kept)
    if removed:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(kept, f, ensure_ascii=False, indent=2)
    return removed
