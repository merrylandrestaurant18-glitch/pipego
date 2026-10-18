from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool


class Base(DeclarativeBase):
    pass


def make_session_factory(database_url: str) -> tuple[object, sessionmaker[Session]]:
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    engine_options: dict[str, object] = {
        "connect_args": connect_args,
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }
    if database_url in {"sqlite://", "sqlite:///:memory:"}:
        engine_options["poolclass"] = StaticPool
    engine = create_engine(database_url, **engine_options)
    return engine, sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def session_dependency(factory: sessionmaker[Session]):
    def get_session() -> Generator[Session, None, None]:
        with factory() as session:
            yield session

    return get_session