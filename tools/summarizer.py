import json
import os
import re
from abc import ABC, abstractmethod


class Summarizer(ABC):
    @abstractmethod
    def summarize(self, company, keyword, articles):
        """-> {'title':..., 'summary':..., 'detail':...}"""


class ClaudeSummarizer(Summarizer):
    def __init__(self, api_key=None, model=None, client=None):
        self.model = model or os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")
        if client is not None:
            self.client = client
        else:
            import anthropic
            self.client = anthropic.Anthropic(
                api_key=api_key or os.environ.get("ANTHROPIC_API_KEY"))

    def summarize(self, company, keyword, articles):
        prompt = _build_prompt(company, keyword, articles)
        resp = self.client.messages.create(
            model=self.model,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        return _parse_summary(_response_text(resp))


def get_summarizer(provider=None, **kwargs):
    provider = provider or os.environ.get("LLM_PROVIDER", "claude")
    if provider == "claude":
        return ClaudeSummarizer(**kwargs)
    raise ValueError(f"지원하지 않는 provider: {provider}")


def _build_prompt(company, keyword, articles):
    lines = "\n".join(f"- {a['title']}: {a['snippet']} ({a['source']})" for a in articles)
    return (
        f"다음은 '{company or ''} {keyword or ''}' 관련 뉴스 기사들이다.\n{lines}\n\n"
        "이를 종합해 한국어 증시 브리핑을 작성하라. "
        '반드시 아래 JSON만 출력하라(추가 텍스트 금지):\n'
        '{"title": "...", "summary": "1~2문장 핵심 요약", "detail": "상세 본문"}'
    )


def _response_text(resp):
    """응답 content에서 텍스트 블록만 골라 합친다 (thinking 블록 등은 제외)."""
    parts = [b.text for b in resp.content if getattr(b, "type", None) == "text"]
    return "".join(parts)


def _parse_summary(text):
    match = re.search(r"\{.*\}", text, re.DOTALL)
    data = json.loads(match.group(0) if match else text)
    return {"title": data["title"], "summary": data["summary"], "detail": data["detail"]}
