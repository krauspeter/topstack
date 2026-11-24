"""Feedback aus der App auf dem Heimserver ansehen (Phase 4, AP-5).

Beispiele auf dem Heimserver (im Ordner ``~/topstack/infra``)::

    docker compose --env-file .env exec api python -m topstack.scripts.feedback list
    docker compose --env-file .env exec api python -m topstack.scripts.feedback show <id>
    docker compose --env-file .env exec -T api python -m topstack.scripts.feedback \
        screenshot <id> > screenshot.png
    docker compose --env-file .env exec api python -m topstack.scripts.feedback resend

``list`` zeigt die letzten Einträge mit Issue-Nummer oder dem letzten Fehler, ``show`` den Text
mit Absender (nur hier, nie im Issue), ``screenshot`` schreibt das Bild auf die Standardausgabe,
``resend`` schickt offene Einträge sofort an GitHub.
"""

import argparse
import asyncio
import sys
import uuid

from sqlalchemy import select

from topstack.db.models import AppUser, Feedback
from topstack.db.session import get_sessionmaker
from topstack.services import feedback


async def list_entries(limit: int) -> None:
    async with get_sessionmaker()() as db:
        rows = await db.scalars(select(Feedback).order_by(Feedback.created_at.desc()).limit(limit))
        for fb in rows:
            state = f"Issue #{fb.issue_number}" if fb.sent_at else f"offen ({fb.attempts} Versuche)"
            shot = " · Screenshot" if fb.screenshot else ""
            first = fb.message.splitlines()[0][:50] if fb.message else ""
            print(f"{fb.id}  {fb.created_at:%d.%m. %H:%M}  {fb.category:5}  {state}{shot}  {first}")
            if fb.last_error and not fb.sent_at:
                print(f"    letzter Fehler: {fb.last_error}")


async def show(entry_id: uuid.UUID) -> int:
    async with get_sessionmaker()() as db:
        fb = await db.get(Feedback, entry_id)
        if fb is None:
            print("Kein Feedback mit dieser ID.", file=sys.stderr)
            return 1
        user = await db.get(AppUser, fb.app_user_id) if fb.app_user_id else None
        print(
            f"Von: {user.display_name if user else 'Konto gelöscht'} "
            f"(im Issue: {feedback.anon_id(fb.app_user_id)})"
        )
        print(feedback.render(fb).body)
        return 0


async def screenshot(entry_id: uuid.UUID) -> int:
    async with get_sessionmaker()() as db:
        fb = await db.get(Feedback, entry_id)
        if fb is None or not fb.screenshot:
            print("Kein Screenshot zu dieser ID.", file=sys.stderr)
            return 1
        sys.stdout.buffer.write(fb.screenshot)
        return 0


async def resend() -> int:
    if not feedback.enabled():
        print("TOPSTACK_GITHUB_TOKEN ist nicht gesetzt.", file=sys.stderr)
        return 1
    sent = await feedback.deliver_pending()
    print(f"{sent} Einträge übertragen.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_list = sub.add_parser("list", help="letzte Einträge")
    p_list.add_argument("--limit", type=int, default=20)
    sub.add_parser("show", help="ein Eintrag mit Absender").add_argument("id", type=uuid.UUID)
    sub.add_parser("screenshot", help="Bild auf die Standardausgabe").add_argument(
        "id", type=uuid.UUID
    )
    sub.add_parser("resend", help="offene Einträge sofort an GitHub")
    args = parser.parse_args()
    if args.cmd == "list":
        asyncio.run(list_entries(args.limit))
        return 0
    if args.cmd == "show":
        return asyncio.run(show(args.id))
    if args.cmd == "screenshot":
        return asyncio.run(screenshot(args.id))
    return asyncio.run(resend())


if __name__ == "__main__":
    sys.exit(main())
