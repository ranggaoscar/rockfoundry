import pytest
from rockfoundry.config import DEFAULT_DENY
from rockfoundry.safety import is_denied, redact


@pytest.mark.parametrize(
    "p",
    [
        "gcp-credentials.json",
        "youtube_token.json",
        ".env.production",
        "apps/api/.env",
        "certs/server.KEY",
        "id_ed25519",
        "auth.json",
        "secrets/notes.md",
    ],
)
def test_denied(p):
    assert is_denied(p, DEFAULT_DENY)


@pytest.mark.parametrize("p", ["README.md", "docs/PRODUCTION-BASELINE.md", "AGENTS.md"])
def test_allowed(p):
    assert not is_denied(p, DEFAULT_DENY)


def test_redacts_ipv4():
    assert "203.0.113.7" not in redact("host 203.0.113.7 ok")


def test_redacts_keys():
    out = redact("sk-abc123def456ghi789 ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 AKIAABCDEFGHIJKLMNOP")
    assert "sk-abc" not in out and "ghp_" not in out and "AKIA" not in out


def test_redacts_assignments():
    assert redact("JWT_SECRET=hunter2") == "JWT_SECRET=[redacted]"


def test_redacts_jwt_and_long_hex():
    assert "eyJ" not in redact("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc")
    long_hex = "8e0bc272fff56ba0a8b432d0be1335c25af34c84f907dd05f916262763dcbbcf"
    assert "8e0bc272" not in redact(f"sha256:{long_hex}")


def test_keeps_dates_and_versions():
    text = "v0.5 rilis 15 Nov 2026, PR 23"
    assert redact(text) == text


def test_redacts_private_key_blocks():
    block = "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----"
    assert "b3BlbnNzaC1rZXkt" not in redact(f"isi:\n{block}\nselesai")
