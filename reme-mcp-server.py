"""
reme-mcp-server.py
Memory microservice for SpaceBot — wraps ChromaDB + ReMe.
Binds to 127.0.0.1:8101 (loopback only).

Endpoints:
  GET  /health
  POST /memory/read    { workspace_id, query, top_k }
  POST /memory/write   { workspace_id, content, metadata }
  POST /memory/list    { workspace_id }
  POST /memory/delete  { workspace_id, memory_id }

Embedding strategy:
  - If DASHSCOPE_API_KEY is set in env, use DashScope text-embedding-v4 (OpenAI-compatible endpoint).
  - Otherwise, fall back to ChromaDB's default sentence-transformers embedder.
"""
import hashlib
import os
import re
import time
import uuid
from typing import Any, Dict, List, Optional

import chromadb
from chromadb.api.types import EmbeddingFunction, Documents, Embeddings
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

# Load env from spacebot .env.local (DASHSCOPE_API_KEY if present)
load_dotenv("/var/www/spacebot/.env.local")

CHROMA_PATH = "/var/www/spacebot/reme-data/chroma"
DASHSCOPE_KEY = os.getenv("DASHSCOPE_API_KEY", "").strip()
DASHSCOPE_BASE = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
DASHSCOPE_MODEL = "text-embedding-v4"


def workspace_to_collection(workspace_id: str) -> str:
    """Normalize workspace_id into a chromadb-safe collection name."""
    safe = re.sub(r"[^a-zA-Z0-9_-]", "_", workspace_id)
    if len(safe) < 3:
        safe = f"ws_{safe}"
    if len(safe) > 60:
        h = hashlib.sha1(workspace_id.encode()).hexdigest()[:12]
        safe = safe[:48] + "_" + h
    return safe


class DashScopeEmbedder(EmbeddingFunction):
    """OpenAI-compatible client against DashScope embedding endpoint."""

    def __init__(self, api_key: str, model: str = DASHSCOPE_MODEL, base_url: str = DASHSCOPE_BASE):
        try:
            from openai import OpenAI
        except ImportError as e:
            raise RuntimeError("openai package required for DashScopeEmbedder") from e
        self._client = OpenAI(api_key=api_key, base_url=base_url)
        self._model = model

    def __call__(self, input: Documents) -> Embeddings:
        resp = self._client.embeddings.create(model=self._model, input=list(input))
        return [d.embedding for d in resp.data]


def build_embedder():
    if DASHSCOPE_KEY:
        try:
            return DashScopeEmbedder(DASHSCOPE_KEY)
        except Exception as exc:
            print(f"[reme-mcp] DashScope embedder failed ({exc}); falling back to default.", flush=True)
    return None  # None => chromadb uses its default embedder


_embedder = build_embedder()
_client = chromadb.PersistentClient(path=CHROMA_PATH)


def get_collection(workspace_id: str):
    name = workspace_to_collection(workspace_id)
    kwargs: Dict[str, Any] = {"name": name, "metadata": {"workspace_id": workspace_id}}
    if _embedder is not None:
        kwargs["embedding_function"] = _embedder
    return _client.get_or_create_collection(**kwargs)


app = FastAPI(title="reme-mcp", version="1.0.0")


class ReadReq(BaseModel):
    workspace_id: str
    query: str
    top_k: int = 5


class WriteReq(BaseModel):
    workspace_id: str
    content: str
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)


class ListReq(BaseModel):
    workspace_id: str


class DeleteReq(BaseModel):
    workspace_id: str
    memory_id: str


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "reme-mcp",
        "chroma_path": CHROMA_PATH,
        "embedder": "dashscope-v4" if _embedder is not None else "chromadb-default",
        "timestamp": int(time.time()),
    }


@app.post("/memory/read")
def memory_read(req: ReadReq):
    try:
        col = get_collection(req.workspace_id)
        if col.count() == 0:
            return {"success": True, "memories": []}
        res = col.query(query_texts=[req.query], n_results=max(1, min(req.top_k, 50)))
        memories: List[Dict[str, Any]] = []
        ids = res.get("ids", [[]])[0]
        docs = res.get("documents", [[]])[0]
        metas = res.get("metadatas", [[]])[0]
        dists = res.get("distances", [[]])[0]
        for i, mid in enumerate(ids):
            memories.append({
                "id": mid,
                "content": docs[i] if i < len(docs) else "",
                "metadata": metas[i] if i < len(metas) else {},
                "distance": dists[i] if i < len(dists) else None,
            })
        return {"success": True, "memories": memories}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"read failed: {exc}")


@app.post("/memory/write")
def memory_write(req: WriteReq):
    try:
        content = (req.content or "").strip()
        if not content:
            raise HTTPException(status_code=400, detail="empty content")
        col = get_collection(req.workspace_id)
        mid = f"mem_{uuid.uuid4().hex}"
        meta = dict(req.metadata or {})
        meta.setdefault("created_at", int(time.time()))
        meta.setdefault("workspace_id", req.workspace_id)
        col.add(ids=[mid], documents=[content], metadatas=[meta])
        return {"success": True, "memory_id": mid}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"write failed: {exc}")


@app.post("/memory/list")
def memory_list(req: ListReq):
    try:
        col = get_collection(req.workspace_id)
        if col.count() == 0:
            return {"success": True, "memories": []}
        res = col.get()
        memories: List[Dict[str, Any]] = []
        for i, mid in enumerate(res.get("ids", [])):
            memories.append({
                "id": mid,
                "content": res["documents"][i] if i < len(res.get("documents", [])) else "",
                "metadata": res["metadatas"][i] if i < len(res.get("metadatas", [])) else {},
            })
        memories.sort(key=lambda m: m.get("metadata", {}).get("created_at", 0), reverse=True)
        return {"success": True, "memories": memories}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"list failed: {exc}")


@app.post("/memory/delete")
def memory_delete(req: DeleteReq):
    try:
        col = get_collection(req.workspace_id)
        col.delete(ids=[req.memory_id])
        return {"success": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"delete failed: {exc}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8101, log_level="info")
