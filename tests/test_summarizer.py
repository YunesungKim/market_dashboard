import json
import pytest
from unittest.mock import MagicMock
from tools.summarizer import ClaudeSummarizer, get_summarizer, Summarizer

ARTICLES = [{"title": "기사1", "url": "u", "snippet": "내용1", "publishedDate": "", "source": "한경"}]


def _text_block(text):
    b = MagicMock()
    b.type = "text"
    b.text = text
    return b


def _thinking_block(thinking="reasoning..."):
    b = MagicMock()
    b.type = "thinking"
    b.thinking = thinking
    return b


def _fake_client(content):
    client = MagicMock()
    client.messages.create.return_value = MagicMock(content=content)
    return client


def test_claude_summarizer_parses_json():
    payload = json.dumps({"title": "T", "summary": "S", "detail": "D"}, ensure_ascii=False)
    s = ClaudeSummarizer(model="claude-sonnet-5", client=_fake_client([_text_block(payload)]))
    out = s.summarize("삼성전자", "HBM", ARTICLES)
    assert out == {"title": "T", "summary": "S", "detail": "D"}
    # 모델이 전달됐는지
    _, kwargs = s.client.messages.create.call_args
    assert kwargs["model"] == "claude-sonnet-5"


def test_claude_summarizer_skips_thinking_block():
    # 확장 사고(thinking) 모델은 content[0]이 ThinkingBlock일 수 있다 → 텍스트 블록만 파싱해야 함
    payload = json.dumps({"title": "T", "summary": "S", "detail": "D"}, ensure_ascii=False)
    content = [_thinking_block(), _text_block(payload)]
    s = ClaudeSummarizer(model="claude-sonnet-5", client=_fake_client(content))
    out = s.summarize("삼성전자", "HBM", ARTICLES)
    assert out == {"title": "T", "summary": "S", "detail": "D"}


def test_get_summarizer_unknown_provider_raises():
    with pytest.raises(ValueError):
        get_summarizer(provider="unknown")


def test_claude_is_summarizer_subclass():
    assert issubclass(ClaudeSummarizer, Summarizer)
