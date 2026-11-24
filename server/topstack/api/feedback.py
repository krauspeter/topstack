"""Feedback-Button der App (Phase 4, AP-5, TC-108 und TC-109)."""

import uuid
from typing import Literal

from fastapi import APIRouter, Request, status
from pydantic import BaseModel, Field

from topstack.api.deps import CurrentUser, Db
from topstack.api.problems import problem
from topstack.config import settings
from topstack.services import feedback

router = APIRouter(tags=["Feedback"])


class FeedbackBody(BaseModel):
    category: Literal["bug", "wish", "other"]
    message: str = Field(min_length=3, max_length=4000)
    context: str | None = Field(default=None, max_length=2000)
    app_version: str = Field(default="", max_length=40)
    build: str = Field(default="", max_length=40)
    # data:image/…;base64,… — höchstens 2 MB Bild, Base64 ist etwa ein Drittel größer
    screenshot: str | None = Field(default=None, max_length=2_800_000)


class FeedbackReceived(BaseModel):
    id: uuid.UUID


@router.post("/feedback", status_code=status.HTTP_201_CREATED)
async def send_feedback(
    body: FeedbackBody, request: Request, user: CurrentUser, db: Db
) -> FeedbackReceived:
    if not body.message.strip():
        raise problem(422, "Bitte beschreibe kurz, worum es geht.")
    try:
        shot = feedback.decode_screenshot(body.screenshot) if body.screenshot else None
    except feedback.BadScreenshot as exc:
        raise problem(422, str(exc)) from exc
    try:
        fb = await feedback.submit(
            db,
            user.id,
            category=body.category,
            message=body.message,
            context=body.context,
            app_version=body.app_version,
            build=body.build,
            user_agent=request.headers.get("user-agent", ""),
            screenshot=shot,
        )
    except feedback.TooMany as exc:
        raise problem(
            429, f"Du hast heute schon {settings.feedback_per_day}-mal Feedback geschickt. Danke!"
        ) from exc
    await db.commit()
    feedback.schedule()
    return FeedbackReceived(id=fb.id)
