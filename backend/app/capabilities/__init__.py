# Importing this package registers all built-in capabilities into the
# CapabilityRegistry as a side effect, so any code that touches the
# orchestrator (app code, tests, a REPL) gets a fully populated registry.
from app.capabilities import (  # noqa: F401,E402
    calendar_capability,
    device_control_capability,
    files_capability,
    health_capability,
    web_search_capability,
)
