"""Staging (AP-3b): Mails nur an freigegebene Adressen."""

import asyncio

from topstack.config import Settings
from topstack.services import mail as mail_module
from topstack.services.mail import AllowlistMailer, LogMailer, Mail, get_mailer


class Collect:
    def __init__(self) -> None:
        self.sent: list[Mail] = []

    async def send(self, mail: Mail) -> None:
        self.sent.append(mail)


def test_nur_freigegebene_adressen_werden_verschickt(caplog):
    inner = Collect()
    mailer = AllowlistMailer(inner, frozenset({"peter@example.com"}))
    asyncio.run(mailer.send(Mail("Peter@Example.com ", "Anmelden", "link")))
    asyncio.run(mailer.send(Mail("freund@example.com", "Anmelden", "link")))
    assert [m.to for m in inner.sent] == ["Peter@Example.com "]
    assert "zurückgehalten" in caplog.text


def test_allowlist_aus_der_umgebung():
    s = Settings(mail_allowlist=" a@example.com, B@example.com ,,")
    assert s.mail_allowed == frozenset({"a@example.com", "b@example.com"})
    assert Settings(mail_allowlist="").mail_allowed == frozenset()


def test_get_mailer_nutzt_die_allowlist_nur_wenn_gesetzt(monkeypatch):
    monkeypatch.setattr(mail_module, "settings", Settings(resend_api_key=None))
    assert isinstance(get_mailer(), LogMailer)
    monkeypatch.setattr(
        mail_module, "settings", Settings(resend_api_key=None, mail_allowlist="a@example.com")
    )
    assert isinstance(get_mailer(), AllowlistMailer)
