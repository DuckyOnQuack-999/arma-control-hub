import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass
from typing import Optional
from src.config import settings


@dataclass
class ArmagetronAuthChallenge:
    challenge: str
    expires_at: int


@dataclass
class ArmagetronAuthResult:
    success: bool
    auth_id: Optional[str] = None
    username: Optional[str] = None
    error: Optional[str] = None


class ArmagetronAuthService:
    def __init__(self):
        self.challenges: dict[str, ArmagetronAuthChallenge] = {}
        self.cleanup_interval = 300
        self.last_cleanup = time.time()

    def generate_challenge(self, username: str) -> ArmagetronAuthChallenge:
        self._cleanup_expired()
        challenge = secrets.token_urlsafe(32)
        expires_at = int(time.time()) + 300
        auth_challenge = ArmagetronAuthChallenge(challenge=challenge, expires_at=expires_at)
        self.challenges[username.lower()] = auth_challenge
        return auth_challenge

    def verify_response(self, username: str, response: str) -> ArmagetronAuthResult:
        self._cleanup_expired()
        username_lower = username.lower()
        challenge_data = self.challenges.get(username_lower)
        if not challenge_data:
            return ArmagetronAuthResult(success=False, error="No challenge found for user")
        if time.time() > challenge_data.expires_at:
            del self.challenges[username_lower]
            return ArmagetronAuthResult(success=False, error="Challenge expired")
        expected_response = self._compute_response(challenge_data.challenge, username)
        if not hmac.compare_digest(response, expected_response):
            return ArmagetronAuthResult(success=False, error="Invalid authentication response")
        auth_id = self._generate_auth_id(username)
        del self.challenges[username_lower]
        return ArmagetronAuthResult(success=True, auth_id=auth_id, username=username)

    def _compute_response(self, challenge: str, username: str) -> str:
        key = settings.armagetron_auth_secret.encode()
        message = f"{challenge}:{username}".encode()
        return hmac.new(key, message, hashlib.sha256).hexdigest()

    def _generate_auth_id(self, username: str) -> str:
        timestamp = str(int(time.time() * 1000))
        random_part = secrets.token_hex(8)
        return hashlib.sha256(f"{username}:{timestamp}:{random_part}".encode()).hexdigest()[:32]

    def _cleanup_expired(self) -> None:
        now = time.time()
        if now - self.last_cleanup < self.cleanup_interval:
            return
        expired = [k for k, v in self.challenges.items() if now > v.expires_at]
        for k in expired:
            del self.challenges[k]
        self.last_cleanup = now


armagetron_auth_service = ArmagetronAuthService()