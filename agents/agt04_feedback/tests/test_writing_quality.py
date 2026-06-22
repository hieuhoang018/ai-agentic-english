from agents.agt04_feedback.writing_quality import score_writing


async def test_score_writing_mock_mode_returns_all_rubric_keys():
    result = await score_writing("Hello, I am writing an email.", context="professional email")
    for key in ("grammar", "coherence", "cohesion", "register", "structure"):
        assert key in result, f"Missing key: {key}"


async def test_score_writing_mock_mode_returns_expected_scores():
    result = await score_writing("test text")
    assert result["grammar"] == 0.7
    assert result["coherence"] == 0.65
    assert result["cohesion"] == 0.6
    assert result["register"] == 0.75
    assert result["structure"] == 0.8


async def test_score_writing_mock_mode_has_mock_flag():
    result = await score_writing("test text")
    assert result["mock"] is True


async def test_score_writing_mock_mode_vietnamese_indirectness_is_false():
    result = await score_writing("test text")
    assert result["vietnamese_indirectness"] is False


async def test_score_writing_mock_mode_has_top_issues():
    result = await score_writing("test text")
    assert "top_issues" in result
    assert isinstance(result["top_issues"], list)


async def test_score_writing_scores_in_valid_range():
    result = await score_writing("test text")
    for key in ("grammar", "coherence", "cohesion", "register", "structure"):
        assert 0.0 <= result[key] <= 1.0, f"{key} out of range: {result[key]}"
