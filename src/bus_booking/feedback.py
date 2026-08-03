from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable


_POSITIVE_WORDS = {
    "good",
    "great",
    "clean",
    "comfortable",
    "smooth",
    "friendly",
    "easy",
    "on-time",
    "punctual",
    "excellent",
    "helpful",
    "fast",
    "safe",
}

_NEGATIVE_WORDS = {
    "bad",
    "late",
    "dirty",
    "rude",
    "crowded",
    "slow",
    "broken",
    "uncomfortable",
    "cancelled",
    "delay",
    "worst",
    "poor",
    "issue",
}

_TOPIC_KEYWORDS = {
    "seat": "seating",
    "seats": "seating",
    "driver": "staff",
    "staff": "staff",
    "bus": "vehicle",
    "ac": "amenities",
    "wifi": "amenities",
    "booking": "booking",
    "refund": "refund",
    "clean": "cleanliness",
    "cleanliness": "cleanliness",
    "late": "punctuality",
    "delay": "punctuality",
}


@dataclass(slots=True)
class FeedbackAnalysis:
    sentiment: str
    confidence: float
    score: int
    summary: str
    topics: list[str]
    recommended_action: str


class FeedbackAnalyzer:
    def analyze(self, text: str) -> FeedbackAnalysis:
        normalized = text.lower().strip()
        tokens = re.findall(r"[a-z0-9']+", normalized)
        token_set = set(tokens)

        positive_hits = self._count_hits(token_set, _POSITIVE_WORDS)
        negative_hits = self._count_hits(token_set, _NEGATIVE_WORDS)
        score = positive_hits - negative_hits

        if score > 0:
            sentiment = "positive"
        elif score < 0:
            sentiment = "negative"
        else:
            sentiment = "neutral"

        confidence = min(0.99, 0.5 + (abs(score) * 0.12) + (min(len(tokens), 40) / 200))
        topics = self._extract_topics(tokens)
        summary = self._build_summary(sentiment, topics, normalized)
        recommended_action = self._recommend_action(sentiment, topics)

        return FeedbackAnalysis(
            sentiment=sentiment,
            confidence=round(confidence, 2),
            score=score,
            summary=summary,
            topics=topics,
            recommended_action=recommended_action,
        )

    def _count_hits(self, tokens: set[str], lexicon: Iterable[str]) -> int:
        return sum(1 for word in lexicon if word in tokens)

    def _extract_topics(self, tokens: list[str]) -> list[str]:
        topics: list[str] = []
        for token in tokens:
            topic = _TOPIC_KEYWORDS.get(token)
            if topic and topic not in topics:
                topics.append(topic)
        return topics[:4]

    def _build_summary(self, sentiment: str, topics: list[str], original: str) -> str:
        topic_part = ", ".join(topics) if topics else "general service"
        if sentiment == "positive":
            return f"Positive feedback about {topic_part}."
        if sentiment == "negative":
            return f"Negative feedback focused on {topic_part}."
        if original:
            return f"Mixed or neutral feedback about {topic_part}."
        return "No feedback text provided."

    def _recommend_action(self, sentiment: str, topics: list[str]) -> str:
        if sentiment == "negative":
            if "refund" in topics:
                return "Review refund turnaround and communication."
            if "punctuality" in topics:
                return "Investigate dispatch delays and update ETAs."
            return "Escalate for manual service review."
        if sentiment == "positive":
            return "Highlight this route and preserve the current service standard."
        return "Monitor for patterns and collect more feedback."
