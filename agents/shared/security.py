def assert_internal_secret_is_safe(secret: str, inference_mode: str) -> None:
    """Refuse to proceed with the known-public dev secret once running live.

    ``dev-internal-secret`` is committed in plaintext in infra/docker-compose.yml
    and agents/shared/config.py's default — anyone can read it on GitHub. An
    empty/whitespace secret (e.g. Compose silently substituting "" for an unset
    ``${INTERNAL_SECRET}``) is treated the same way, since it's just as unsafe.
    """
    if inference_mode == "live" and (not secret.strip() or secret == "dev-internal-secret"):
        raise RuntimeError(
            "INTERNAL_SECRET is unset or still the insecure dev default while "
            "INFERENCE_MODE=live. Set a real INTERNAL_SECRET before running in production."
        )
