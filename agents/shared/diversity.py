"""
Lightweight diversity checker for exercise sentence pools.

Uses character-trigram cosine similarity (numpy only — no ML framework, no API calls).
Character trigrams are more sensitive than word-level Jaccard for detecting structural
near-duplicates in short sentences (e.g. "will be reviewed tomorrow" vs "will be
contacted tomorrow" share many trigrams even though no full word is repeated).

Intended usage: one DiversityChecker instance per module, reset between modules.
Calling check_and_add() on every accepted sentence builds up the history so that
later sentences in the same module are checked against all earlier ones.
"""
from __future__ import annotations

import re
from collections import Counter
from typing import NamedTuple

import numpy as np


class DiversityResult(NamedTuple):
    is_diverse: bool          # True  → candidate is sufficiently different from all prior sentences
    nearest_score: float      # cosine similarity to the closest prior sentence (0..1); lower = more diverse
    nearest_label: str | None # label of the closest prior sentence, for logging


class DiversityChecker:
    """
    Tracks accepted sentences within a single ETL module run and rejects candidates
    that are too similar to any already-accepted sentence.

    Args:
        threshold: cosine similarity above which a candidate is considered a near-duplicate.
                   0.72 is conservative — start here and lower if false-positive rate is high.
        n:         character n-gram size. 3 works well for English sentences of 8–30 words.
    """

    def __init__(self, threshold: float = 0.72, n: int = 3) -> None:
        self.threshold = threshold
        self.n = n
        self._history: list[tuple[Counter, str]] = []  # (ngram_counter, label)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _normalise(self, text: str) -> str:
        # Remove fill-blank markers, collapse punctuation to spaces, lowercase.
        cleaned = text.lower().replace("______", " ")
        cleaned = re.sub(r"[^a-z ]", " ", cleaned)
        return re.sub(r" +", " ", cleaned).strip()

    def _ngrams(self, text: str) -> Counter:
        s = self._normalise(text)
        if len(s) < self.n:
            return Counter()
        return Counter(s[i : i + self.n] for i in range(len(s) - self.n + 1))

    @staticmethod
    def _cosine(a: Counter, b: Counter) -> float:
        if not a or not b:
            return 0.0
        keys = list(a.keys() | b.keys())
        va = np.array([a.get(k, 0) for k in keys], dtype=np.float32)
        vb = np.array([b.get(k, 0) for k in keys], dtype=np.float32)
        na, nb = np.linalg.norm(va), np.linalg.norm(vb)
        if na == 0 or nb == 0:
            return 0.0
        return float(np.dot(va, vb) / (na * nb))

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def check(self, text: str, label: str = "") -> DiversityResult:
        """
        Check whether `text` is diverse enough from all previously accepted sentences.
        Does NOT add `text` to history — call add() or check_and_add() for that.
        """
        candidate = self._ngrams(text)
        if not candidate:
            return DiversityResult(True, 0.0, None)

        max_score = 0.0
        max_label: str | None = None
        for stored, stored_label in self._history:
            score = self._cosine(candidate, stored)
            if score > max_score:
                max_score = score
                max_label = stored_label

        return DiversityResult(max_score < self.threshold, max_score, max_label)

    def add(self, text: str, label: str = "") -> None:
        """Add `text` to history unconditionally (even if it failed the diversity check)."""
        ngrams = self._ngrams(text)
        if ngrams:
            self._history.append((ngrams, label or f"item-{len(self._history) + 1}"))

    def check_and_add(self, text: str, label: str = "") -> DiversityResult:
        """Check then add unconditionally. Convenience wrapper for the common pattern."""
        result = self.check(text, label)
        self.add(text, label)
        return result

    def reset(self) -> None:
        """Clear all history. Call between modules to avoid cross-module false positives."""
        self._history.clear()

    def __len__(self) -> int:
        return len(self._history)
