from __future__ import annotations

import json
import json5
import os
import random
import time
from datetime import date
from typing import Any, Callable

from openai import APIConnectionError, APIError, APITimeoutError, OpenAI

from prompt import SYSTEM_PROMPT
from tools.dashscope_file_parser import FileParser
from tools.dashscope_scholar import Scholar
from tools.dashscope_search import Search
from tools.dashscope_visit import Visit

OBS_START = "<tool_response>"
OBS_END = "\n</tool_response>"

MAX_LLM_CALL_PER_RUN = int(os.getenv("MAX_LLM_CALL_PER_RUN", "20"))
MISSION_TIMEOUT_SECONDS = int(os.getenv("MISSION_TIMEOUT", "180"))
MAX_CONTEXT_TOKENS = int(os.getenv("MAX_CONTEXT_TOKENS", str(110 * 1024)))

TOOL_CLASS = [
    FileParser(),
    Scholar(),
    Visit(),
    Search(),
]
TOOL_MAP = {tool.name: tool for tool in TOOL_CLASS}


def today_date() -> str:
    return date.today().strftime("%Y-%m-%d")


class MultiTurnReactAgent:
    def __init__(
        self,
        function_list: list[str] | None = None,
        llm: dict[str, Any] | None = None,
        event_callback: Callable[[dict[str, Any]], None] | None = None,
        **kwargs,
    ):
        llm_cfg = llm or {}
        self.llm_generate_cfg = llm_cfg.get("generate_cfg", {})
        self.model = llm_cfg.get("model", os.getenv("MODEL_NAME", "qwen3-max"))
        self.base_url = os.getenv(
            "DASHSCOPE_BASE_URL",
            "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        )
        self.api_key = os.getenv("DASHSCOPE_API_KEY", "")
        self.event_callback = event_callback

    def emit_event(self, payload: dict[str, Any]) -> None:
        if not self.event_callback:
            return
        try:
            self.event_callback(payload)
        except Exception:
            return

    def call_server(self, msgs: list[dict[str, str]], max_tries: int = 6) -> str:
        if not self.api_key:
            raise RuntimeError("DASHSCOPE_API_KEY is not configured")

        client = OpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
            timeout=90.0,
        )

        base_sleep_time = 1.0
        for attempt in range(max_tries):
            try:
                response = client.chat.completions.create(
                    model=self.model,
                    messages=msgs,
                    stop=["\n<tool_response>", "<tool_response>"],
                    temperature=self.llm_generate_cfg.get("temperature", 0.2),
                    top_p=self.llm_generate_cfg.get("top_p", 0.9),
                    max_tokens=4096,
                    presence_penalty=self.llm_generate_cfg.get(
                        "presence_penalty",
                        0.6,
                    ),
                    extra_body={"enable_thinking": False},
                )
                content = response.choices[0].message.content or ""
                if content.strip():
                    return content.strip()
            except (APIError, APIConnectionError, APITimeoutError):
                pass
            except Exception:
                pass

            if attempt < max_tries - 1:
                sleep_time = min(base_sleep_time * (2 ** attempt) + random.uniform(0, 1), 10.0)
                time.sleep(sleep_time)

        return "DeepResearch model call failed after multiple retries."

    def count_tokens(self, messages: list[dict[str, str]]) -> int:
        content = "\n".join(message.get("content", "") for message in messages)
        return max(1, len(content) // 4)

    def _extract_question_and_answer(self, data: dict[str, Any]) -> tuple[str, str]:
        item = data.get("item") or {}
        question = str(item.get("question") or "").strip()
        answer = str(item.get("answer") or "").strip()
        if question:
            return question, answer

        raw_messages = item.get("messages") or []
        if len(raw_messages) > 1:
            raw_msg = str(raw_messages[1].get("content") or "")
            if "User:" in raw_msg:
                question = raw_msg.split("User:", 1)[1].strip()
            else:
                question = raw_msg.strip()
        return question, answer

    def _build_result(
        self,
        *,
        question: str,
        answer: str,
        messages: list[dict[str, str]],
        prediction: str,
        termination: str,
    ) -> dict[str, Any]:
        return {
            "question": question,
            "answer": answer,
            "messages": messages,
            "prediction": prediction,
            "termination": termination,
        }

    def _run(self, data: dict[str, Any], model: str, **kwargs) -> dict[str, Any]:
        self.model = model or self.model
        question, answer = self._extract_question_and_answer(data)
        if not question:
            raise ValueError("DeepResearch question is required")

        start_time = time.time()
        messages = [
            {
                "role": "system",
                "content": f"{SYSTEM_PROMPT}{today_date()}",
            },
            {"role": "user", "content": question},
        ]
        round_count = 0
        remaining_calls = MAX_LLM_CALL_PER_RUN
        file_root_path = data.get("file_root_path")

        while remaining_calls > 0:
            if time.time() - start_time > MISSION_TIMEOUT_SECONDS:
                return self._build_result(
                    question=question,
                    answer=answer,
                    messages=messages,
                    prediction="No answer found before the mission timeout was reached.",
                    termination="mission timeout",
                )

            round_count += 1
            remaining_calls -= 1
            self.emit_event(
                {
                    "type": "phase",
                    "phase": "reasoning",
                    "round": round_count,
                    "message": f"Research reasoning round {round_count}.",
                }
            )

            content = self.call_server(messages)
            if OBS_START in content:
                content = content.split(OBS_START, 1)[0]
            content = content.strip()
            messages.append({"role": "assistant", "content": content})

            if "<tool_call>" in content and "</tool_call>" in content:
                tool_call_str = content.split("<tool_call>", 1)[1].split("</tool_call>", 1)[0]
                try:
                    tool_call = json5.loads(tool_call_str)
                    tool_name = str(tool_call.get("name") or "").strip()
                    tool_args = tool_call.get("arguments") or {}
                    self.emit_event(
                        {
                            "type": "tool_start",
                            "tool": tool_name,
                            "arguments": tool_args,
                        }
                    )
                    result = self.custom_call_tool(
                        tool_name,
                        tool_args,
                        file_root_path=file_root_path,
                        question=question,
                    )
                except Exception as exc:
                    tool_name = "unknown"
                    result = (
                        "Error: Tool call is not valid JSON or the tool failed to execute. "
                        f"Details: {exc}"
                    )

                self.emit_event(
                    {
                        "type": "tool_result",
                        "tool": tool_name,
                        "preview": result[:600],
                    }
                )
                messages.append(
                    {
                        "role": "user",
                        "content": f"{OBS_START}\n{result}\n</tool_response>",
                    }
                )

            if "<answer>" in content and "</answer>" in content:
                prediction = content.split("<answer>", 1)[1].split("</answer>", 1)[0].strip()
                return self._build_result(
                    question=question,
                    answer=answer,
                    messages=messages,
                    prediction=prediction,
                    termination="answer",
                )

            if self.count_tokens(messages) > MAX_CONTEXT_TOKENS:
                messages.append(
                    {
                        "role": "user",
                        "content": (
                            "You are nearing the maximum context length. Stop making tool calls. "
                            "Use the evidence gathered so far and return your best final answer in "
                            "<think></think> and <answer></answer> tags."
                        ),
                    }
                )
                content = self.call_server(messages)
                messages.append({"role": "assistant", "content": content.strip()})
                prediction = content
                termination = "context limit reached"
                if "<answer>" in content and "</answer>" in content:
                    prediction = content.split("<answer>", 1)[1].split("</answer>", 1)[0].strip()
                return self._build_result(
                    question=question,
                    answer=answer,
                    messages=messages,
                    prediction=prediction,
                    termination=termination,
                )

        last_content = messages[-1]["content"] if messages else ""
        prediction = "No answer found."
        if "<answer>" in last_content and "</answer>" in last_content:
            prediction = last_content.split("<answer>", 1)[1].split("</answer>", 1)[0].strip()
        return self._build_result(
            question=question,
            answer=answer,
            messages=messages,
            prediction=prediction,
            termination="exceed available llm calls",
        )

    def custom_call_tool(
        self,
        tool_name: str,
        tool_args: dict[str, Any],
        **kwargs,
    ) -> str:
        if tool_name not in TOOL_MAP:
            return f"Error: Tool {tool_name} not found"

        if tool_name == "parse_file":
            result = TOOL_MAP[tool_name].call(
                tool_args,
                file_root_path=kwargs.get("file_root_path"),
            )
        else:
            result = TOOL_MAP[tool_name].call(tool_args, **kwargs)

        if isinstance(result, str):
            return result
        try:
            return json.dumps(result, ensure_ascii=False)
        except Exception:
            return str(result)
