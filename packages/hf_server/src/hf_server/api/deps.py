"""API dependencies."""

from typing import Annotated

from fastapi import Depends

from database import get_db, AsyncSession

# Dependency aliases for cleaner imports
DbDep = Annotated[AsyncSession, Depends(get_db)]
