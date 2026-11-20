"""Fehler als RFC 9457 Problem Details (``application/problem+json``)."""

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

PROBLEM_JSON = "application/problem+json"

TITLES = {
    400: "Ungültige Anfrage",
    401: "Nicht angemeldet",
    403: "Keine Berechtigung",
    404: "Nicht gefunden",
    409: "Konflikt",
    410: "Nicht mehr gültig",
    422: "Ungültige Eingabe",
    429: "Zu viele Anfragen",
}


class Problem(HTTPException):
    """HTTPException mit zusätzlichen Feldern im Problem-Details-Body."""

    def __init__(self, status: int, detail: str | None = None, **extra: object) -> None:
        super().__init__(status_code=status, detail=detail)
        self.extra = extra


def problem(status: int, detail: str | None = None, **extra: object) -> HTTPException:
    """Kurzform für ``raise problem(404, "Gruppe nicht gefunden")``; Zusatzfelder als kwargs."""
    return Problem(status, detail, **extra)


def _body(status: int, detail: object, **extra: object) -> dict[str, object]:
    body: dict[str, object] = {
        "type": "about:blank",
        "title": TITLES.get(status, "Fehler"),
        "status": status,
    }
    if detail:
        body["detail"] = detail
    body.update(extra)
    return body


def install(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_problem(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            _body(
                exc.status_code,
                exc.detail if exc.detail != TITLES.get(exc.status_code) else None,
                **getattr(exc, "extra", {}),
            ),
            status_code=exc.status_code,
            media_type=PROBLEM_JSON,
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_problem(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {"loc": list(err.get("loc", ())), "msg": err.get("msg", "")} for err in exc.errors()
        ]
        return JSONResponse(
            _body(422, "Die Eingabe passt nicht zum erwarteten Format.", errors=errors),
            status_code=422,
            media_type=PROBLEM_JSON,
        )
