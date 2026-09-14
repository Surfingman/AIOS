import base64
import binascii
import os
from datetime import datetime, timezone
from urllib.parse import urlsplit

import httpx
from azure.core.exceptions import ClientAuthenticationError
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Literal

from app.workspace import Workspace, authenticate
from app.safety.mediation import safety_mediation_layer
from app.tasks import task_store, utc_now

router = APIRouter(prefix="/api/workspace/images")
SIZES = {"square": (1024, 1024), "landscape": (1344, 768), "portrait": (768, 1344)}


def configuration():
    endpoint = os.getenv("AZURE_IMAGE_ENDPOINT", "").rstrip("/")
    model = os.getenv("AZURE_IMAGE_MODEL", "flux-2-pro")
    deployment = os.getenv("AZURE_IMAGE_DEPLOYMENT", "")
    mode = os.getenv("AZURE_IMAGE_AUTH_MODE", "aad")
    parsed = urlsplit(endpoint)
    valid = bool(parsed.scheme == "https" and parsed.hostname and not parsed.username
        and not parsed.password and not parsed.query and not parsed.fragment
        and parsed.path in ("", "/providers/blackforestlabs/v1/flux-2-pro")
        and model == "flux-2-pro" and deployment and mode in ("aad", "key")
        and (mode == "aad" or os.getenv("AZURE_IMAGE_API_KEY")))
    return endpoint, deployment, mode, valid


async def generate(prompt, width, height):
    endpoint, deployment, mode, valid = configuration()
    if not valid:
        raise HTTPException(503, "이미지 모델 환경 설정을 확인하세요.")
    if not endpoint.endswith("/providers/blackforestlabs/v1/flux-2-pro"):
        endpoint += "/providers/blackforestlabs/v1/flux-2-pro"
    if mode == "aad":
        from azure.identity.aio import DefaultAzureCredential
        async with DefaultAzureCredential(exclude_managed_identity_credential=True) as credential:
            token = await credential.get_token("https://ai.azure.com/.default")
        headers = {"Authorization": f"Bearer {token.token}"}
    else:
        headers = {"api-key": os.environ["AZURE_IMAGE_API_KEY"]}
    async with httpx.AsyncClient(timeout=httpx.Timeout(120, connect=10)) as client:
        response = await client.post(endpoint, headers=headers, json={
            "model": deployment, "prompt": prompt, "width": width, "height": height,
        })
        response.raise_for_status()
        payload = response.json()
    encoded = payload["data"][0]["b64_json"]
    if not isinstance(encoded, str) or len(encoded) > 20_000_000:
        raise ValueError("Invalid image size")
    try:
        binary = base64.b64decode(encoded, validate=True)
    except binascii.Error as exc:
        raise ValueError("Invalid image data") from exc
    if binary.startswith(b"\x89PNG\r\n\x1a\n"):
        mime = "image/png"
    elif binary.startswith(b"\xff\xd8\xff"):
        mime = "image/jpeg"
    else:
        raise ValueError("Unsupported image format")
    return f"data:{mime};base64,{encoded}"


@router.get("")
def images(workspace: Workspace = Depends(authenticate)):
    endpoint, deployment, mode, valid = configuration()
    return {"configured": valid, "deployment": deployment, "auth_mode": mode,
        "host": urlsplit(endpoint).hostname or "", "busy": workspace.image_busy,
        "items": workspace.images if workspace.consents["images"] else []}


class ImageRequest(BaseModel):
    request_id: str = Field(min_length=16, max_length=80, pattern=r"^[a-zA-Z0-9-]+$")
    prompt: str = Field(min_length=3, max_length=2000)
    size: Literal["square", "landscape", "portrait"] = "square"
    approved: Literal[True]


@router.post("")
async def create_image(request: ImageRequest, workspace: Workspace = Depends(authenticate)):
    workspace.allowed("images")
    if workspace.session.profile.age_group != "adult":
        raise HTTPException(403, "이미지 생성은 현재 성인 프로필에서만 지원합니다.")
    for image in workspace.images:
        if image["id"] == request.request_id:
            if image["prompt"] != request.prompt or image["size"] != request.size:
                raise HTTPException(409, "이미 사용된 생성 요청입니다.")
            return image
    if workspace.image_busy:
        raise HTTPException(409, "이미지 생성이 진행 중입니다. 결과를 기다려 주세요.")
    verdict = safety_mediation_layer.analyze(request.prompt, [], workspace.session.policy)
    if not verdict.allowed:
        raise HTTPException(422, verdict.reason)
    if not configuration()[3]:
        raise HTTPException(503, "이미지 모델 환경 설정을 확인하세요.")
    revision = workspace.revision
    workspace.image_busy = True
    width, height = SIZES[request.size]
    try:
        data_url = await generate(request.prompt, width, height)
        if workspace.revision != revision or workspace.expires <= utc_now():
            raise HTTPException(409, "동의 또는 세션 변경으로 생성 결과를 폐기했습니다.")
        image = {"id": request.request_id, "prompt": request.prompt, "size": request.size,
            "width": width, "height": height, "data_url": data_url,
            "created_at": datetime.now(timezone.utc).isoformat(), "deployment": configuration()[1]}
        workspace.images = [image, *workspace.images][:3]
        task_store.record(workspace.session_id, "image.generated")
        return image
    except HTTPException:
        raise
    except ClientAuthenticationError as exc:
        raise HTTPException(503, "Azure 로그인이 필요합니다. 터미널에서 az login을 실행하거나 서버의 이미지 API 키 인증을 설정하세요.") from exc
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        detail = {400: "프롬프트 또는 모델 지원 크기를 확인하세요. 콘텐츠 필터에 의해 거부될 수도 있습니다.",
            401: "이미지 인증에 실패했습니다.", 403: "이미지 리소스 접근 권한을 확인하세요.",
            404: "이미지 엔드포인트와 배포 이름을 확인하세요.", 429: "이미지 생성 한도에 도달했습니다. 잠시 후 다시 시도하세요."}.get(status, "이미지 서비스가 요청을 완료하지 못했습니다.")
        raise HTTPException(502, detail) from exc
    except httpx.TimeoutException as exc:
        raise HTTPException(504, "응답 시간이 초과됐습니다. 공급자에서 생성·과금됐을 수 있습니다. 자동 재시도하지 않습니다.") from exc
    except Exception as exc:
        raise HTTPException(502, "이미지 생성에 실패했습니다. Azure 로그인·설정·응답 형식을 확인하세요.") from exc
    finally:
        workspace.image_busy = False


@router.delete("/{image_id}")
def delete_image(image_id: str, workspace: Workspace = Depends(authenticate)):
    workspace.images = [image for image in workspace.images if image["id"] != image_id]
    task_store.record(workspace.session_id, "image.deleted")
    return {"status": "deleted"}