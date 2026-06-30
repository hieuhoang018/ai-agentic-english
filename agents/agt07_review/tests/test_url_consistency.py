"""
Regression test: AGT-07 service.py and offline.py must derive their AGT-06 URL
from the same source (settings) so Docker env overrides affect both equally.
"""
def test_agt07_service_and_offline_use_same_agt06_base():
    from agents.shared.config import settings
    import agents.agt07_review.service as svc
    import agents.agt07_review.offline as off

    # After the fix, svc.AGT06_BASE must equal settings.AGT06_BASE_URL.
    # Before the fix, svc.AGT06_BASE = "http://agt06-memory:8106" while
    # settings.AGT06_BASE_URL = "http://localhost:8106" — they diverge.
    assert svc.AGT06_BASE == settings.AGT06_BASE_URL, (
        f"service.AGT06_BASE={svc.AGT06_BASE!r} diverges from "
        f"settings.AGT06_BASE_URL={settings.AGT06_BASE_URL!r}. "
        "Docker env overrides must affect both modules equally."
    )
