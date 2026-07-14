import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, jsonify, request, render_template

from tools.serper_client import search_news, search_market_trends, MARKET_QUERIES
from tools.briefing import make_briefing
from tools.store import append_briefings
from tools.staging import StagingBoard
from tools.publisher import publish
from tools.summarizer import get_summarizer


def create_app(briefings_path, repo_dir, board=None):
    app = Flask(__name__)
    app.config["BRIEFINGS_PATH"] = briefings_path
    app.config["REPO_DIR"] = repo_dir
    board = board if board is not None else StagingBoard()

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/trends")
    def trends():
        data = search_market_trends(top_n=3)
        cards = []
        for market, articles in data.items():
            label = MARKET_QUERIES[market]["label"]
            for article in articles:
                b = make_briefing(None, label, [article], mode="serper")
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
            summarizer = get_summarizer(provider=body.get("provider"))
            summary = summarizer.summarize(company, keyword, articles)
            b = make_briefing(company, keyword, articles, mode="llm",
                              provider=body.get("provider") or "claude",
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
        cards = [{k: v for k, v in c.items() if k != "cardId"} for c in board.list()]
        if not cards:
            return jsonify(published=0)
        append_briefings(app.config["BRIEFINGS_PATH"], cards)
        publish(app.config["REPO_DIR"], ["briefings.json"],
                f"add {len(cards)} briefing(s)")
        board.clear()
        return jsonify(published=len(cards))

    return app


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    repo_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    app = create_app(
        briefings_path=os.path.join(repo_dir, "briefings.json"),
        repo_dir=repo_dir,
    )
    app.run(port=5000, debug=True)
