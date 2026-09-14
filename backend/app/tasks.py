import hashlib
import json
import threading
import uuid
from copy import deepcopy
from datetime import datetime, timedelta, timezone

from app.safety.mediation import safety_mediation_layer


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class TaskError(ValueError):
    pass


class TaskStore:
    def __init__(self):
        self.lock = threading.RLock()
        self.items = {}
        self.events = {}
        self.audit = {}

    def record(self, session_id, action, task_id=None):
        self.audit.setdefault(session_id, []).append({
            "id": str(uuid.uuid4()), "action": action, "task_id": task_id,
            "at": utc_now().isoformat(),
        })
        self.audit[session_id] = self.audit[session_id][-200:]

    def propose(self, session_id, title, start, minutes, context="work", evidence="", source="manual"):
        try:
            begins = datetime.fromisoformat(start)
        except ValueError as exc:
            raise TaskError("날짜와 시간을 지정하세요.") from exc
        if begins.tzinfo is None:
            raise TaskError("시간대가 포함된 날짜가 필요합니다.")
        if begins <= utc_now():
            raise TaskError("미래 시간을 선택하세요.")
        if not 5 <= minutes <= 180:
            raise TaskError("일정 길이는 5~180분입니다.")
        arguments = {
            "title": "개인 일정" if context == "personal" else title.strip(),
            "start": begins.isoformat(), "minutes": minutes,
            "calendar": "local", "visibility": "private", "context": context,
        }
        if not arguments["title"]:
            raise TaskError("제목이 필요합니다.")
        fingerprint = hashlib.sha256(json.dumps(arguments, sort_keys=True).encode()).hexdigest()
        task = {
            "id": str(uuid.uuid4()), "arguments": arguments, "fingerprint": fingerprint,
            "status": "pending", "source": source, "evidence": evidence,
            "created_at": utc_now().isoformat(),
            "expires_at": (utc_now() + timedelta(minutes=15)).isoformat(),
            "receipt": None, "error": None,
        }
        with self.lock:
            if len(self.items.get(session_id, {})) >= 100:
                raise TaskError("작업은 세션당 100개까지 만들 수 있습니다. 기록을 지워 주세요.")
            self.items.setdefault(session_id, {})[task["id"]] = task
            self.record(session_id, "task.proposed", task["id"])
        return deepcopy(task)

    def list(self, session_id):
        with self.lock:
            for task in self.items.get(session_id, {}).values():
                if task["status"] == "pending" and datetime.fromisoformat(task["expires_at"]) <= utc_now():
                    task["status"] = "expired"
            return deepcopy(list(self.items.get(session_id, {}).values()))

    def approve(self, session_id, task_id, fingerprint, policy):
        with self.lock:
            task = self.items.get(session_id, {}).get(task_id)
            if task is None:
                raise TaskError("작업을 찾을 수 없습니다.")
            if fingerprint != task["fingerprint"]:
                raise TaskError("승인 내용이 변경됐습니다. 작업을 다시 확인하세요.")
            current_fingerprint = hashlib.sha256(json.dumps(task["arguments"], sort_keys=True).encode()).hexdigest()
            if current_fingerprint != fingerprint:
                raise TaskError("실행 인자가 변경됐습니다. 새 승인이 필요합니다.")
            if task["status"] == "succeeded":
                return deepcopy(task)
            if task["status"] != "pending":
                raise TaskError("승인 가능한 작업이 아닙니다.")
            if datetime.fromisoformat(task["expires_at"]) <= utc_now():
                task["status"] = "expired"
                raise TaskError("승인이 만료됐습니다. 새 작업을 제안하세요.")
            if "calendar" not in policy.allowed_capabilities:
                raise TaskError("일정 기능이 정책에서 차단돼 있습니다.")
            verdict = safety_mediation_layer.vet_payload(task["arguments"], policy)
            if verdict is not None and not verdict.allowed:
                task["status"] = "blocked"
                task["error"] = verdict.reason
                self.record(session_id, "task.blocked", task_id)
                raise TaskError(verdict.reason)
            arguments = task["arguments"]
            begins = datetime.fromisoformat(arguments["start"])
            ends = begins + timedelta(minutes=arguments["minutes"])
            if begins <= utc_now():
                raise TaskError("예정 시간이 지났습니다. 새 작업을 제안하세요.")
            for event in self.events.get(session_id, []):
                existing_start = datetime.fromisoformat(event["start"])
                existing_end = existing_start + timedelta(minutes=event["minutes"])
                if begins < existing_end and ends > existing_start:
                    raise TaskError("기존 일정과 겹칩니다. 다른 시간으로 새 작업을 제안하세요.")
            event = {"id": str(uuid.uuid4()), "task_id": task_id, **deepcopy(arguments)}
            self.events.setdefault(session_id, []).append(event)
            task["status"] = "succeeded"
            task["receipt"] = {"event_id": event["id"], "adapter": "local-calendar", "at": utc_now().isoformat()}
            self.record(session_id, "task.succeeded", task_id)
            return deepcopy(task)

    def cancel(self, session_id, task_id):
        with self.lock:
            task = self.items.get(session_id, {}).get(task_id)
            if task is None or task["status"] != "pending":
                raise TaskError("대기 중인 작업만 취소할 수 있습니다.")
            task["status"] = "cancelled"
            self.record(session_id, "task.cancelled", task_id)
            return deepcopy(task)

    def clear(self, session_id):
        with self.lock:
            self.items.pop(session_id, None)
            self.events.pop(session_id, None)
            self.audit.pop(session_id, None)


task_store = TaskStore()