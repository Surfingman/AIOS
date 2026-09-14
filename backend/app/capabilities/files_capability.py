from app.capabilities.base import capability_registry
from app.memory.store import SessionState
from app.models import Intent


class FilesCapability:
    id = "files"

    def execute(self, intent: Intent, session: SessionState) -> dict:
        if intent.action == "search_file":
            query = intent.parameters.get("query", "")
            matches = [f for f in session.files if query in f["name"]] or session.files
            return {"title": "파일 찾기 결과", "kind": "file_list", "items": matches}

        return {"title": "내 파일", "kind": "file_list", "items": session.files}


capability_registry.register(FilesCapability())
