from abc import ABC, abstractmethod

from app.models import QueryResult, SchemaInfo, SourceType


class DataSource(ABC):
    """Common interface every connected data source (file/sql/live) must satisfy.

    The LLM/query layer only ever talks to this interface, so it never needs
    to know whether it's querying a DuckDB-backed file, a buffered live feed,
    or a real external SQL database.
    """

    @abstractmethod
    def id(self) -> str: ...

    @abstractmethod
    def source_type(self) -> SourceType: ...

    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    def connect(self) -> None:
        """Establish the connection / load the data. Idempotent."""

    @abstractmethod
    def get_schema(self) -> SchemaInfo: ...

    @abstractmethod
    def get_sample_rows(self, table: str, n: int = 5) -> list[dict]: ...

    @abstractmethod
    def execute_query(self, sql: str, timeout_s: float, max_rows: int) -> QueryResult: ...

    def is_read_only(self) -> bool:
        return True

    def is_alive(self) -> bool:
        """Whether this source's underlying connection still actually works. True by
        default (a loaded file has nothing external to lose); sources with a real network
        connection (e.g. an attached SQL database) should override this."""
        return True

    def refresh(self) -> None:
        """Re-load this source's data from its origin (e.g. re-read a file from disk).
        A no-op by default — sources that read live (like an attached SQL database) are
        never stale in the first place and don't need one."""

    @abstractmethod
    def close(self) -> None: ...
