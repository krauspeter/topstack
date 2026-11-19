"""E-Mail-Versand über Resend (Entscheidung E2).

Ohne ``TOPSTACK_RESEND_API_KEY`` schreibt der ``LogMailer`` die Mail nur ins Log. So
funktioniert die Anmeldung auch lokal; den Link kopiert man aus ``docker compose logs api``.
"""

import logging
from dataclasses import dataclass
from typing import Protocol

import httpx

from topstack.config import settings

log = logging.getLogger("topstack.mail")


@dataclass(frozen=True)
class Mail:
    to: str
    subject: str
    text: str


class MailError(RuntimeError):
    pass


class Mailer(Protocol):
    async def send(self, mail: Mail) -> None: ...


class LogMailer:
    async def send(self, mail: Mail) -> None:
        log.warning(
            "E-Mail nicht verschickt (kein Resend-Schlüssel) an %s: %s\n%s",
            mail.to,
            mail.subject,
            mail.text,
        )


class ResendMailer:
    url = "https://api.resend.com/emails"

    def __init__(self, api_key: str, sender: str) -> None:
        self._api_key = api_key
        self._sender = sender

    async def send(self, mail: Mail) -> None:
        payload = {
            "from": self._sender,
            "to": [mail.to],
            "subject": mail.subject,
            "text": mail.text,
        }
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                self.url, json=payload, headers={"Authorization": f"Bearer {self._api_key}"}
            )
        if response.status_code >= 300:
            raise MailError(f"Resend antwortet {response.status_code}: {response.text[:200]}")


def get_mailer() -> Mailer:
    """FastAPI-Abhängigkeit; Tests ersetzen sie durch einen Mailer, der Mails sammelt."""
    if settings.resend_api_key:
        return ResendMailer(settings.resend_api_key, settings.mail_from)
    return LogMailer()
