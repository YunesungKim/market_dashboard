from unittest.mock import patch, MagicMock
from tools.serper_client import search_news, search_market_trends


def _fake_response(payload):
    resp = MagicMock()
    resp.json.return_value = payload
    resp.raise_for_status.return_value = None
    return resp


def test_search_news_normalizes_fields():
    payload = {"news": [
        {"title": "삼성전자 HBM 공급", "link": "https://a.com",
         "snippet": "요약문", "date": "1 day ago", "source": "한경"}
    ]}
    with patch("tools.serper_client.requests.post", return_value=_fake_response(payload)) as post:
        result = search_news("삼성전자 HBM", api_key="k")
    assert result == [{
        "title": "삼성전자 HBM 공급", "url": "https://a.com",
        "snippet": "요약문", "publishedDate": "1 day ago", "source": "한경",
    }]
    # 요청 페이로드 검증
    _, kwargs = post.call_args
    assert kwargs["json"] == {"q": "삼성전자 HBM", "gl": "kr", "hl": "ko", "num": 10}
    assert kwargs["headers"]["X-API-KEY"] == "k"


def test_search_news_missing_key_raises():
    import pytest
    with patch.dict("os.environ", {}, clear=True):
        with pytest.raises(RuntimeError):
            search_news("query")


def test_search_market_trends_returns_top_n_per_market():
    def fake_search_news(query, gl="kr", hl="ko", num=10, api_key=None):
        return [{"title": f"{gl}-{i}", "url": "u", "snippet": "s",
                 "publishedDate": "", "source": "x"} for i in range(num)]

    with patch("tools.serper_client.search_news", side_effect=fake_search_news):
        trends = search_market_trends(top_n=3, api_key="k")
    assert set(trends.keys()) == {"us", "kr"}
    assert len(trends["us"]) == 3
    assert len(trends["kr"]) == 3
    assert trends["us"][0]["title"] == "us-0"
