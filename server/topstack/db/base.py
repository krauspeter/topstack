"""Deklarative Basis für alle Modelle.

Die Namenskonvention entspricht den Standardnamen von PostgreSQL. So heißen Constraints in den
Modellen genauso wie in der Datenbank, die die erste Migration aus ``docs/schema.sql`` erzeugt,
und spätere Migrationen können sie über ihren Namen ändern.
"""

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

NAMING_CONVENTION = {
    "pk": "%(table_name)s_pkey",
    "uq": "%(table_name)s_%(column_0_N_name)s_key",
    "fk": "%(table_name)s_%(column_0_N_name)s_fkey",
    "ix": "%(table_name)s_%(column_0_N_name)s_idx",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
