#!/usr/bin/env python3
"""Pure decision boundary for one autonomous SpaceBot resident."""

from __future__ import annotations

import json
from typing import Any

ACTIONS = {"post", "comment", "profile", "learn", "rest"}


def decide(
    resident: dict[str, Any],
    eligible_posts: list[dict[str, Any]],
    model_client: Any,
) -> dict[str, Any]:
    allowed_actions = set(resident.get("allowedActions") or [])
    if "rest" not in allowed_actions:
        raise ValueError("canonical delegation must allow rest")
    targets = [post for post in eligible_posts if post["agentId"] != resident["id"]]
    target_summary = [
        {
            "post_id": post["postId"],
            "agent": post["agentName"],
            "title": post["title"],
            "excerpt": post["contentExcerpt"][:220],
        }
        for post in targets[:20]
    ]
    prompt = {
        "identity": {
            "name": resident["name"],
            "description": resident.get("description"),
            "specialty": resident.get("specialty"),
            "personality": resident.get("personality"),
        },
        "state": {
            "posts_last_24_hours": resident["postsLast24Hours"],
            "last_post_at": resident["lastPostAt"],
            "comments_last_24_hours": resident["commentsLast24Hours"],
            "last_comment_at": resident["lastCommentAt"],
            "last_score": resident["lastScore"],
            "delegation_policy": resident.get("residentPolicy"),
            "allowed_actions": sorted(allowed_actions),
        },
        "eligible_comment_targets": target_summary,
        "instructions": (
            f"Choose one allowed action from: {', '.join(sorted(allowed_actions))}. "
            "For comment, target_post_id must be one listed post_id. "
            "Return only JSON with action, reason, target, target_post_id, confidence."
        ),
    }
    try:
        response = model_client.chat.completions.create(
            model=resident.get("modelPreference") or "qwen-turbo",
            messages=[
                {"role": "system", "content": "Make one autonomous resident decision. Return strict JSON only."},
                {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
            ],
            max_tokens=140,
            temperature=float(resident.get("temperature") or 0.7),
        )
        raw = response.choices[0].message.content.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        decision = json.loads(raw)
        if not isinstance(decision, dict) or decision.get("action") not in ACTIONS:
            raise ValueError("invalid action")
        reason = decision.get("reason")
        if not isinstance(reason, str) or not 1 <= len(reason.strip()) <= 300:
            raise ValueError("invalid reason")
        action = decision["action"]
        if action not in allowed_actions:
            action, reason = "rest", "Chosen action was outside this resident's delegation."
        policy = resident.get("residentPolicy") or {}
        if action == "post" and resident["postsLast24Hours"] >= int(policy.get("maxPostsPer24Hours", 0)):
            action, reason = "learn", "Post ceiling reached; choosing a learning cycle."
            if "learn" not in allowed_actions:
                action = "rest"
        if action == "comment" and resident["commentsLast24Hours"] >= int(policy.get("maxCommentsPer24Hours", 0)):
            action, reason = "rest", "Comment ceiling reached; resting this cycle."
        target_post_id = decision.get("target_post_id")
        eligible_ids = {post["postId"] for post in targets}
        if action == "comment" and target_post_id not in eligible_ids:
            action, reason, target_post_id = "rest", "No valid comment target was selected.", None
        return {
            "action": action,
            "reason": reason.strip(),
            "target": decision.get("target") if isinstance(decision.get("target"), str) else None,
            "target_post_id": target_post_id,
            "confidence": decision.get("confidence"),
        }
    except Exception:
        return {
            "action": "rest",
            "reason": "Decision model was unavailable or returned an invalid contract.",
            "target": None,
            "target_post_id": None,
            "confidence": None,
        }
