import json
import pytest
from unittest.mock import MagicMock
from tools.summarizer import ClaudeSummarizer, get_summarizer, Summarizer

ARTICLES = [{"title": "기사1", "url": "u", "snippet": "내용1", "publishedDate": "", "source": "한경"}]


def _fake_client(text):
    client = MagicMock()
    block = MagicMock()
    block.text = text
    client.messages.create.return_value = MagicMock(content=[block])
    return client


def test_claude_summarizer_parses_json():
    payload = json.dumps({"title": "T", "summary": "S", "detail": "D"}, ensure_ascii=False)
    s = ClaudeSummarizer(model="claude-sonnet-5", client=_fake_client(payload))
    out = s.summarize("삼성전자", "HBM", ARTICLES)
    assert out == {"title": "T", "summary": "S", "detail": "D"}
    # 모델이 전달됐는지
    _, kwargs = s.client.messages.create.call_args
    assert kwargs["model"] == "claude-sonnet-5"


def test_get_summarizer_unknown_provider_raises():
    with pytest.raises(ValueError):
        get_summarizer(provider="unknown")


def test_claude_is_summarizer_subclass():
    assert issubclass(ClaudeSummarizer, Summarizer)
