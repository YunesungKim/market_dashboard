import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, jsonify, request, render_template
from werkzeug.exceptions import HTTPException

from tools.serper_client import search_news, search_market_trends, MARKET_QUERIES
from tools.briefing import make_briefing
from tools.store import append_briefings, load_briefings, remove_briefings
from tools.staging import StagingBoard
from tools.publisher import publish
from tools.summarizer import get_summarizer


DEFAULT_THEMES = [
    {"label": cfg["label"], "query": cfg["query"], "gl": cfg["gl"], "hl": cfg["hl"], "count": 3}
    for cfg in MARKET_QUERIES.values()
]


def create_app(briefings_path, repo_dir, board=None):
    app = Flask(__name__)
    app.config["BRIEFINGS_PATH"] = briefings_path
    app.config["REPO_DIR"] = repo_dir
    board = board if board is not None else StagingBoard()

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.post("/api/trends")
    def trends():
        body = request.get_json(force=True, silent=True) or {}
        themes = body.get("themes") or DEFAULT_THEMES
        cards = []
        for t in themes:
            count = max(1, int(t.get("count", 3)))
            articles = search_news(t.get("query", ""), gl=t.get("gl", "kr"),
                                   hl=t.get("hl", "ko"), num=count)
            for article in articles[:count]:
                b = make_briefing(None, t.get("label"), [article], mode="serper")
                b["title"] = article["title"]  # 개별 기사 제목을 카드 제목으로
                cards.append(board.add(b))
        return jsonify(cards=cards)

    @app.post("/api/search")
    def search():
        body = request.get_json(force=True) or {}
        company = body.get("company") or None
        keyword = body.get("keyword") or None
        mode = body.get("mode", "serper")
        query = " ".join(x for x in (company, keyword) if x) or "증시"
        articles = search_news(query)
        if mode == "llm":
            provider = body.get("provider") or os.environ.get("LLM_PROVIDER", "claude")
            model = body.get("model") or None
            summarizer = get_summarizer(provider=provider, model=model)
            summary = summarizer.summarize(company, keyword, articles)
            b = make_briefing(company, keyword, articles, mode="llm",
                              provider=provider,
                              model=getattr(summarizer, "model", None), summary=summary)
        else:
            b = make_briefing(company, keyword, articles, mode="serper")
        return jsonify(card=board.add(b))

    @app.get("/api/cards")
    def list_cards():
        return jsonify(cards=board.list())

    @app.patch("/api/cards/<card_id>")
    def update_card(card_id):
        try:
            card = board.update(card_id, request.get_json(force=True) or {})
        except KeyError:
            return jsonify(error="not found"), 404
        return jsonify(card=card)

    @app.delete("/api/cards/<card_id>")
    def delete_card(card_id):
        return jsonify(deleted=board.delete(card_id))

    @app.post("/api/publish")
    def publish_cards():
        body = request.get_json(force=True, silent=True) or {}
        ids = body.get("cardIds")
        all_cards = board.list()
        if ids is None:
            selected = all_cards
        else:
            idset = set(ids)
            selected = [c for c in all_cards if c["cardId"] in idset]
        if not selected:
            return jsonify(published=0)
        cards = [{k: v for k, v in c.items() if k != "cardId"} for c in selected]
        append_briefings(app.config["BRIEFINGS_PATH"], cards)
        publish(app.config["REPO_DIR"], ["briefings.json"],
                f"add {len(cards)} briefing(s)")
        for c in selected:
            board.delete(c["cardId"])
        return jsonify(published=len(cards))

    @app.get("/api/briefings")
    def list_briefings():
        return jsonify(briefings=load_briefings(app.config["BRIEFINGS_PATH"]))

    @app.post("/api/briefings/delete")
    def delete_briefings():
        body = request.get_json(force=True, silent=True) or {}
        ids = body.get("ids") or []
        removed = remove_briefings(app.config["BRIEFINGS_PATH"], ids)
        if removed:
            publish(app.config["REPO_DIR"], ["briefings.json"],
                    f"remove {removed} briefing(s)")
        return jsonify(removed=removed)

    @app.errorhandler(Exception)
    def handle_unexpected(e):
        if isinstance(e, HTTPException):
            return e
        return jsonify(error=str(e)), 500

    return app


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    repo_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    app = create_app(
        briefings_path=os.path.join(repo_dir, "briefings.json"),
        repo_dir=repo_dir,
    )
    app.run(port=5000, debug=False)
