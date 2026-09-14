from datetime import timedelta

import pytest

from app.models import ParentPolicy
from app.tasks import TaskError, TaskStore, utc_now


def proposal(store, session="owner", context="work"):
    return store.propose(session, "Follow up", (utc_now() + timedelta(days=1)).isoformat(), 30, context)


def test_approval_is_required_and_idempotent():
    store = TaskStore()
    task = proposal(store)
    assert store.events == {}
    policy = ParentPolicy(child_id="owner")
    first = store.approve("owner", task["id"], task["fingerprint"], policy)
    second = store.approve("owner", task["id"], task["fingerprint"], policy)
    assert first == second
    assert len(store.events["owner"]) == 1


@pytest.mark.parametrize("failure", ["cancel", "expiry", "tamper", "policy", "owner"])
def test_invalid_approval_never_writes(failure):
    store = TaskStore()
    task = proposal(store)
    policy = ParentPolicy(child_id="owner")
    owner = "owner"
    fingerprint = task["fingerprint"]
    if failure == "cancel":
        store.cancel(owner, task["id"])
    elif failure == "expiry":
        store.items[owner][task["id"]]["expires_at"] = (utc_now() - timedelta(seconds=1)).isoformat()
    elif failure == "tamper":
        fingerprint = "changed"
    elif failure == "policy":
        policy.allowed_capabilities = []
    else:
        owner = "other"
    with pytest.raises(TaskError):
        store.approve(owner, task["id"], fingerprint, policy)
    assert store.events == {}


def test_private_event_and_conflict():
    store = TaskStore()
    first = proposal(store, context="personal")
    assert first["arguments"]["title"] == "개인 일정"
    policy = ParentPolicy(child_id="owner")
    store.approve("owner", first["id"], first["fingerprint"], policy)
    second = proposal(store)
    with pytest.raises(TaskError, match="겹칩니다"):
        store.approve("owner", second["id"], second["fingerprint"], policy)
    assert len(store.events["owner"]) == 1


def test_mutated_arguments_require_new_approval():
    store = TaskStore()
    task = proposal(store)
    store.items["owner"][task["id"]]["arguments"]["title"] = "Changed title"
    with pytest.raises(TaskError, match="인자"):
        store.approve("owner", task["id"], task["fingerprint"], ParentPolicy(child_id="owner"))
    assert store.events == {}