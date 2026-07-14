"""API dependencies."""

from typing import Annotated

from fastapi import Depends

from database import unit_of_work, AsyncSession

# Dependency aliases for cleaner imports
DbDep = Annotated[AsyncSession, Depends(unit_of_work)]
