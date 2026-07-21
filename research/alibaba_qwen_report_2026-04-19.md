# Alibaba / Qwen Engineering Master Catalog

Date: April 19, 2026

## Scope Note

This is a best-effort official-source sweep across the Alibaba/Qwen surfaces explicitly requested in the expedition prompt: official GitHub orgs, Alibaba Cloud Model Studio docs, Hugging Face org pages, PyPI/npm package pages, and AgentScope/Qwen documentation. The attached TSV catalogs 64 confirmed first-party projects, services, SDKs, benchmarks, and model families.

Important boundary: this report does **not** claim to enumerate every individual checkpoint variant on ModelScope or Hugging Face, and it does not claim mathematical completeness across all mirrors/forks/Gitee/GitLab. It focuses on confirmed first-party engineering artifacts and model families that are clearly attributable to Alibaba, Qwen, AgentScope, ModelScope, FunAudioLLM, Alibaba-NLP, AlibabaResearch, and Alibaba DAMO Academy.

The machine-readable master catalog is here:

- [alibaba_qwen_master_catalog_2026-04-19.tsv](/J:/BigC_Vault/spacebot-production/spacebot-space/research/alibaba_qwen_master_catalog_2026-04-19.tsv)

## Part 1 — Summary Statistics

- Total confirmed items cataloged: 64
- Free/open items: 57
- Freemium items: 6
- Paid-only items: 1
- Items that can run on a 4GB no-GPU server: 26
- Items already on SpaceBot: 5

### Breakdown by Category

- `Language Models (LLM)`: 8
- `Vision & Multimodal`: 4
- `Speech & Audio (TTS, ASR, voice)`: 10
- `Agent Frameworks & Orchestration`: 4
- `Memory & Knowledge`: 4
- `Research & Search`: 5
- `Code & Development Tools`: 2
- `Evaluation & Benchmarking`: 4
- `Training & Fine-tuning`: 3
- `Infrastructure & Deployment`: 5
- `Data Processing & NLP`: 3
- `Robotics & Embodied AI`: 5
- `Image & Video Generation`: 6
- `UI & Studio Tools`: 1

### Breakdown by Type

- `Model`: 27
- `Framework`: 16
- `Tool`: 5
- `API`: 4
- `Agent`: 3
- `Dataset`: 3
- `Library`: 3
- `SDK`: 2
- `MCP Server`: 1

### Items Already On SpaceBot

- `qwen3-max`
- `Qwen-Agent`
- `AgentScope`
- `ReMe`
- `DashScope API`

## Part 2 — The Master Catalog

Part 2 is provided in the TSV so you can sort/filter by category, type, license, GPU needs, free/freemium status, and LEGO flags without fighting a 16-column Markdown table:

- [alibaba_qwen_master_catalog_2026-04-19.tsv](/J:/BigC_Vault/spacebot-production/spacebot-space/research/alibaba_qwen_master_catalog_2026-04-19.tsv)

Interpretation notes:

- `LEGO Flags` are source-backed when the repo/docs/package explicitly name integrations, and inference-backed when the connection is strongly implied by the same ecosystem, packaging extras, or official examples.
- `Already On SpaceBot` is based on local workspace evidence, not guesswork.
- `Runs On 4GB Server` means practical CPU/no-GPU viability for the project itself; large model weights and most image/video stacks are marked `No` or `API-only`.

## Part 3 — LEGO Combination Map

### 1. Memory Forge

- Tools: `AgentScope`, `ReMe`, `text-embedding-v4`, `qwen3-rerank`, `DashScope API`
- Together: this becomes a persistent agent stack that can remember user history, embed/retrieve long-term memories, rerank candidate recalls, and serve them back into live agent reasoning.
- Wow factor: 8/10

### 2. Research Autopilot

- Tools: `DeepResearch`, `Qwen-Agent`, `qwen3-max`, `ZeroSearch`, `CHRONOS`, `MaskSearch`
- Together: this turns Alibaba’s search/research work into a deep-research operating loop: tool-using agent, strong hosted reasoning model, search-capability training ideas, and timeline-style retrieval/summarization.
- Wow factor: 9/10

### 3. Voice Loop

- Tools: `Qwen3-ASR`, `Qwen3-TTS`, `Qwen3-Omni`, `qwen3-livetranslate-flash-realtime`, `AgentScope`, `Fun-Audio-Chat`
- Together: this is a real-time multimodal voice stack for speech input, speech output, live translation, and agent orchestration.
- Wow factor: 9/10

### 4. Coder Cockpit

- Tools: `qwen-code`, `Qwen3-Coder`, `Qwen-Agent`, `qwen3-max`, `CodeElo`, `OpenJudge`
- Together: this becomes a code agent loop that can generate code, use tools, operate in terminal environments, and then benchmark/evaluate the result with first-party judge infrastructure.
- Wow factor: 8/10

### 5. Embodied Rynn Stack

- Tools: `RynnBrain`, `RynnRCP`, `RynnVLA-001`, `RynnVLA-002`, `RynnMotion`
- Together: this is the clearest embodied-AI Lego cluster in the sweep: protocol layer, motion layer, VLA layers, and an embodied foundation model family.
- Wow factor: 10/10

### 6. Video Factory

- Tools: `DiffSynth-Studio`, `Lumos`, `Lumos-Custom`, `Uni3C`, `Qwen-Image`, `Qwen-Image-Layered`
- Together: this combines base image generation, editable image decomposition, controllable video generation, and 3D/camera/motion control into a serious creative media pipeline.
- Wow factor: 9/10

## Part 4 — Hidden Gems

### E2Rank

Low-star but directly relevant to retrieval quality. It is exactly the kind of quiet reranking component that makes downstream agent memory/search systems feel much smarter.

### modelscope-mcp-server

Only 18 stars in the official org page snapshot, but it matters strategically because it is ModelScope’s own MCP surface. That makes it a natural bridge into tool ecosystems.

### RynnRCP

This is the most “protocol-shaped” robotics Lego block in the sweep. Protocols are where ecosystems snap together, and this one is still low-visibility.

### RynnMotion

Very low stars, but highly practical: prototyping, teleoperation, motion primitives, deployment. If you want embodied workflows instead of papers, this is the sort of repo that matters.

### CHRONOS

Not flashy, but it targets news retrieval and timeline summarization, which is a reusable pattern for research agents, monitoring products, and event reconstruction tools.

### Qwen3-ASR-Toolkit

The models get the attention; the official API toolkit is the faster path to actually shipping ASR in products without self-hosting large audio weights.

### ProcessBench

Under-discussed compared with big model repos, but process-level reasoning evaluation is exactly the kind of benchmark that helps train or judge stronger agent loops.

## Part 5 — What’s Missing

### Unified First-Party Safety Platform

Alibaba/Qwen has `Qwen3Guard`, but in this sweep I did not find a fully unified open-source safety platform that combines policy authoring, red-teaming, eval, gateway enforcement, and runtime monitoring in one product-shaped stack.

### A Single Official Cross-Org Catalog

The ecosystem is powerful but fragmented across `QwenLM`, `agentscope-ai`, `modelscope`, `Alibaba-NLP`, `AlibabaResearch`, `FunAudioLLM`, and `alibaba-damo-academy`. Discoverability is a real gap.

### Lightweight Local End-to-End Agent Bundle

There are many frameworks and API paths, but not a clearly unified “runs well on a tiny CPU box, first-party, batteries-included” agent bundle from Alibaba/Qwen.

### Open-Source Vector / Memory Backbone Standard

There are strong memory pieces (`ReMe`, embeddings, rerankers), but not a single canonical first-party memory backend standard that the whole ecosystem visibly converges on.

### Productized Workflow Builder

AgentScope Studio is promising, but the official open-source surfaces still feel more developer-centric than polished no-code/low-code orchestration products.

## Sources Used

- [QwenLM GitHub org](https://github.com/QwenLM)
- [agentscope-ai GitHub org](https://github.com/agentscope-ai)
- [modelscope GitHub org](https://github.com/modelscope)
- [Alibaba-NLP GitHub org](https://github.com/Alibaba-NLP)
- [AlibabaResearch GitHub org](https://github.com/AlibabaResearch)
- [FunAudioLLM GitHub org](https://github.com/FunAudioLLM)
- [alibaba-damo-academy GitHub org](https://github.com/alibaba-damo-academy)
- [Alibaba Cloud Model Studio model list](https://www.alibabacloud.com/help/en/model-studio/models)
- [Qwen-Coder docs](https://www.alibabacloud.com/help/en/model-studio/qwen-coder)
- [Qwen-ASR docs](https://www.alibabacloud.com/help/en/model-studio/qwen-asr-api-reference)
- [Qwen-TTS docs](https://www.alibabacloud.com/help/en/model-studio/qwen-tts)
- [Qwen-Omni docs](https://www.alibabacloud.com/help/en/model-studio/qwen-omni)
- [Qwen realtime translation docs](https://www.alibabacloud.com/help/en/model-studio/qwen3-livetranslate-flash-realtime)
- [AgentScope docs](https://doc.agentscope.io/)
- [PyPI: agentscope](https://pypi.org/project/agentscope/)
- [PyPI: agentscope-runtime](https://pypi.org/project/agentscope-runtime/)
- [PyPI: modelscope](https://pypi.org/project/modelscope/)
- [PyPI: dashscope](https://pypi.org/project/dashscope/)
- [PyPI: qwen-agent](https://pypi.org/project/qwen-agent/)
- [PyPI: funasr](https://pypi.org/project/funasr/)
- [npm: @agentscope/studio](https://www.npmjs.com/package/@agentscope/studio)
- [npm: @qwen-code/qwen-code](https://www.npmjs.com/package/@qwen-code/qwen-code)
- [Hugging Face: modelscope](https://huggingface.co/modelscope)
- [Hugging Face: FunAudioLLM](https://huggingface.co/FunAudioLLM)
- [OpenRouter provider page for Alibaba Cloud Int.](https://openrouter.ai/provider/alibaba)
- [OpenRouter Qwen page](https://openrouter.ai/qwen)

## Local SpaceBot Evidence

The `Already On SpaceBot` field was cross-checked against the local workspace, especially:

- [docs/agentevolver_scope_spud.md](/J:/BigC_Vault/spacebot-production/spacebot-space/docs/agentevolver_scope_spud.md)
- [scripts/qwen-tool-service.py](/J:/BigC_Vault/spacebot-production/spacebot-space/scripts/qwen-tool-service.py)
- [dorylus/config.ts](/J:/BigC_Vault/spacebot-production/spacebot-space/dorylus/config.ts)
