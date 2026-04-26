"""Services package.

Three service patterns are used in this module:

1. Class-based services (DI via constructor, request-scoped):
   DashboardService, RepoService, TaskLifecycleService, TaskPreviewService, UserService

2. Module-level pure functions (stateless, data transformation):
   task_response_builder

3. Module-level executor functions (create own sessions, for background tasks):
   task_preview_executor
"""

from .config_management_service import ConfigManagementService
from .dashboard_service import DashboardService
from .repo_service import RepoService
from .task_lifecycle_service import TaskLifecycleService
from .task_preview_service import TaskPreviewService
from .user_service import UserService

__all__ = [
    "ConfigManagementService",
    "DashboardService",
    "RepoService",
    "TaskLifecycleService",
    "TaskPreviewService",
    "UserService",
]
