# AgentEvolver Scope Audit for SpaceBot.Space

Audit window: April 18-19, 2026 (America/Chicago / UTC)
Target server: `159.89.178.205`
Mode: Read-only audit
Deliverable path: `/tmp/agentevolver_scope_spud.md`

## Executive verdict

**NO-GO on the current production server.**

Official AgentEvolver is a **GPU-first RL training framework**, not a lightweight runtime. The current SpaceBot production host has **2 vCPU, 3.8 GiB RAM, no NVIDIA driver, no CUDA, no conda, and no installed AgentEvolver package**, while the repo's own defaults assume **CUDA, flash-attn, vLLM, veRL/Ray, and `trainer.n_gpus_per_node=8`** for 7B/14B training runs.

The good news is that the **useful idea** in AgentEvolver for SpaceBot is still usable: not the weight-training stack, but the **self-navigation / experience reuse loop**. SpaceBot can get "bots that improve over time" much more realistically by combining the already-live **ReMe** and **AgentScope** services with a custom feedback loop.

---

## 1. Project Details

- **Repo:** [modelscope/AgentEvolver](https://github.com/modelscope/AgentEvolver)
- **Docs:** [modelscope.github.io/AgentEvolver](https://modelscope.github.io/AgentEvolver/)
- **Quick start:** [tutorial/quick_start](https://modelscope.github.io/AgentEvolver/tutorial/quick_start/)
- **Paper:** [arXiv:2511.10395](https://arxiv.org/abs/2511.10395)
- **License:** Apache 2.0
- **Version signal:** the README says **"AgentEvolver v1 has been released"** in **November 2025**. I did **not** find a separate PyPI release/versioned package signal in the sources I checked.
- **Current GitHub status (as browsed):** about **1.4k stars**, **161 forks**, **858 commits** on `main`.
- **Maintenance activity:** **active**. The commits page shows activity through **March 28, 2026**.

### Org relationship across all 6 tools

| Tool | Repo / code location | GitHub org | Relationship |
|---|---|---|---|
| ReMe | [agentscope-ai/ReMe](https://github.com/agentscope-ai/ReMe) | `agentscope-ai` | Same org as AgentScope and HiClaw |
| AgentScope | [agentscope-ai/agentscope](https://github.com/agentscope-ai/agentscope) | `agentscope-ai` | Same org as ReMe and HiClaw |
| DeepResearch | [Alibaba-NLP/DeepResearch](https://github.com/Alibaba-NLP/DeepResearch) | `Alibaba-NLP` | Different org |
| AgentEvolver | [modelscope/AgentEvolver](https://github.com/modelscope/AgentEvolver) | `modelscope` | Different org |
| HiClaw | [agentscope-ai/HiClaw](https://github.com/agentscope-ai/HiClaw) | `agentscope-ai` | Same org as ReMe and AgentScope |
| OmniCharacter | [AlibabaResearch/DAMO-ConvAI](https://github.com/AlibabaResearch/DAMO-ConvAI) (`OmniCharacter/` subdir) | `AlibabaResearch` | Different org |

Bottom line: these tools are **Alibaba-adjacent**, but they are **not** all from one GitHub org. AgentEvolver is **not** from `agentscope-ai`; it is from **`modelscope`**.

---

## 2. What It Is

AgentEvolver is an **end-to-end self-evolving agent training framework**.

It is **not** primarily a runtime service for serving production bots. It is a **training system** that combines:

1. **Self-questioning**
   - Explore an environment and generate synthetic tasks automatically instead of relying only on hand-labeled task sets.

2. **Self-navigating**
   - Summarize useful cross-task experience and inject retrieved experience back into future rollouts to guide exploration.

3. **Self-attributing**
   - Use an LLM to assign step-level GOOD/BAD credit inside long trajectories, then fuse that with outcome reward to improve PPO/GRPO-style updates.

### Does it do real RL weight updates?

**Yes.** This is the most important truth to keep straight.

AgentEvolver is **not just prompt improvement**. Its core trainer (`agentevolver.main_ppo`) loads a **local Hugging Face model path**, runs **Ray + veRL + vLLM**, computes advantages, and calls **`update_actor()` / `update_critic()`** on local policy workers. ReMe-based prompting is an auxiliary mechanism inside that loop, not the whole system.

### Does Game Arena apply to SpaceBot?

**Not directly.**

Game Arena is a later add-on for **Avalon/Diplomacy-style multi-agent social reasoning**. It is useful if you want a social deduction / negotiation benchmark or a game playground. It is **not** a fit for SpaceBot's production bot stack unless you explicitly want role-play or social-game evaluation.

---

## 3. How It Works

### High-level pipeline

The code path is roughly:

`launcher.py` -> `agentevolver.main_ppo` -> Ray init -> local model load -> TaskManager build -> `AgentEvolverRayPPOTrainer.init_workers()` -> `fit()`

### Stage-by-stage

#### A. Environment Service

- Runs as a separate HTTP service.
- Provides `/create`, `/step`, `/evaluate`, `/release`, and related APIs.
- Supports environments like `appworld` and `bfcl`.
- This is the execution sandbox where trajectories are produced.

#### B. Task Manager

- Loads seed/original tasks from an environment or dataset.
- Uses an **environment profile** plus an exploration strategy (currently mostly random walk + LLM summarization) to generate synthetic tasks.
- Mixes original tasks and synthetic tasks into the training set.
- In the default configs it uses **DashScope-backed API models** for exploration and grading.

#### C. Experience Manager

- Decides which rollouts are pure exploration vs experience-guided.
- Calls ReMe through `EMClient`.
- During rollout it can retrieve top-k relevant experience and prepend it to the current prompt.
- After rollouts it can summarize trajectories into reusable experience.

#### D. Advantage Processor

- After ordinary GRPO-style outcome reward is computed, ADCA-GRPO can call a strong LLM API to label steps GOOD/BAD.
- It then rewrites the advantages using both process-level and outcome-level signals.

#### E. Policy Update

- The actor/ref/critic workers compute log-probs and values.
- PPO/GRPO updates are applied to the local policy weights.
- This is the part that makes AgentEvolver a **real training framework** rather than only a memory system.

### Where ReMe fits

ReMe is an **external service** used by the Experience Manager.

- Retrieval path: `EMClient.call_context_generator()` -> `POST /retrieve_task_memory`
- Summarization path: `EMClient.call_summarizer()` -> `POST /summary_task_memory`

ReMe is therefore **inside the rollout/training loop**, but **outside** the policy weights themselves.

---

## 4. Hardware Requirements

## Hard truth

The repo does **not** publish a simple official "minimum hardware" table.

What it **does** publish is more revealing:

- `install.sh` requires **conda** and installs **`cuda-toolkit`**.
- It installs **`flash-attn==2.7.4.post1`**, `cupy-cuda12x`, `vllm`, `xformers`, and a pinned `verl` commit.
- The example training scripts use:
  - `Qwen/Qwen2.5-7B-Instruct` or `Qwen/Qwen2.5-14B-Instruct`
  - `max_model_len=25580`
  - `rollout.n=8`
  - `trainer.n_gpus_per_node=8`

That is a giant signal: this is a **real multi-GPU training stack**.

### Practical component-by-component view

| Component | CPU-only? | GPU needed? | Notes |
|---|---|---:|---|
| EnvService | Yes | No | Separate conda env per environment; AppWorld/BFCL setup is still non-trivial |
| Task Manager | Yes | No | Can use API models; CPU orchestration is fine |
| ReMe service | Yes | No | CPU is fine if embeddings/LLM are API-backed |
| Advantage Processor orchestration | Yes | No for orchestration | But it still needs LLM API calls to do semantic attribution |
| Policy update / actor-rollout-ref / critic | **No** | **Yes** | This is the training core; official examples assume 8 GPUs |

### Realistic GPU guidance

- **Published/example-class setup:** **8x 80GB GPUs** is the honest reading of the example configs.
- **Inference from config:** a heavily reduced custom experiment might be squeezed onto **1x or 2x 80GB GPUs** with a smaller local model, shorter context, lower rollout count, and lots of retuning. That is **not** the documented path and not what I would recommend for a production-adjacent deployment.
- **24GB consumer GPUs:** not realistic for the official 7B/14B long-context training configs.
- **CPU-only full training:** no.

### RAM / disk

- **Current server class is nowhere near enough** for the official stack.
- For a proper separate training box, I would budget at least **64-128 GB system RAM** and **200+ GB fast disk** for environments, model weights, logs, and checkpoints.
- **Inference:** checkpoint storage can easily outgrow the current server's free disk, even before considering the fact that the server has no GPU.

---

## 5. ReMe Integration

### Can AgentEvolver connect to our live `reme-mcp` on port 8101?

**Not directly.**

This is a concrete API mismatch, not a vague concern.

### What AgentEvolver expects

`agentevolver/client/em_client.py` expects an HTTP service with:

- `POST /retrieve_task_memory`
- `POST /summary_task_memory`

Its default config points at **`http://127.0.0.1:8001`**.

### What the live SpaceBot ReMe service actually exposes

The live service on **8101** identifies itself as **`reme-mcp`** and exposes:

- `POST /memory/read`
- `POST /memory/write`
- `POST /memory/list`
- `POST /memory/delete`
- `GET /health`

My read-only probes showed:

- `POST /summary_task_memory` on 8101 -> **404**
- `POST /retrieve_task_memory` on 8101 -> **404**
- `http://127.0.0.1:8001/health` -> **nothing listening**

### Conclusion

AgentEvolver expects a **standard ReMe HTTP backend**, not the current SpaceBot **MCP wrapper API**.

### What would be required

One of these would be needed:

1. **Run a separate ReMe HTTP service** compatible with AgentEvolver on port 8001 (or change the base URL).
2. Build a **shim/adapter service** that translates:
   - AgentEvolver `retrieve_task_memory` -> MCP `memory/read`
   - AgentEvolver `summary_task_memory` -> some custom summarization + MCP write flow

The second option is not trivial because the current MCP API does **not** expose AgentEvolver's summarizer contract directly.

---

## 6. AgentScope Integration

### Does AgentEvolver work with AgentScope agents?

**Partially, but not in the way you probably want.**

There is real AgentScope-related code in the repo:

- `agentevolver/utils/agentscope_utils.py`
- `games/agents/agentscope_cmt.py`

That code is mainly for **wrapping AgentScope-style model/message flows**, especially in the **games** subsystem.

### What it does *not* mean

It does **not** mean the current SpaceBot AgentScope service on **port 8090** can be dropped into AgentEvolver as "the evolving agent".

The core AgentEvolver trainer still assumes:

- local HF weights
- local tokenizer
- vLLM/veRL workers
- PPO/GRPO updates on those weights

So:

- **AgentScope the library:** there is some interoperability.
- **AgentScope the running service on 8090:** not a drop-in backend for the official training loop.

### Honest fit for SpaceBot

If your goal is production bot improvement, **AgentScope + ReMe + a custom feedback loop** is much more realistic than trying to make AgentEvolver directly train your existing AgentScope runtime.

---

## 7. API-Only Mode

### Can AgentEvolver improve API-model agents without local weights and without GPU?

**Not as official AgentEvolver, no.**

### What can be API-backed

These parts can use API models:

- Task Manager exploration / synthesis
- ReMe summarization / retrieval support
- Advantage Processor semantic step labeling

### What cannot be API-only in the official trainer

The **policy itself** is loaded from `actor_rollout_ref.model.path` and then updated locally with PPO/GRPO. That means:

- local model weights are required
- local tokenizer is required
- GPU training/inference workers are required

### So what "improvement" is possible without weights?

Only **prompt/context/experience-level improvement**, not true policy learning.

That can still be valuable, but it is **not** the same thing as AgentEvolver's official end-to-end training loop.

### Minimum GPU if you insist on real policy improvement

- **Honest R&D floor:** a **separate 80GB GPU box** for a drastically reduced custom experiment.
- **Closer to repo defaults:** **4-8x 80GB GPUs**, with **8x** matching the example scripts.

---

## 8. Deployment Options for Our Server

### Can full AgentEvolver run on the current 4GB / no-GPU server?

**No.**

Reasons:

- no GPU
- no NVIDIA driver
- no CUDA
- no conda
- 2 vCPU only
- only 3.8 GiB RAM
- production PM2 services already occupying the host

### Can any official subset run there?

**Very little, and I would still not deploy it there.**

In theory, some CPU-only auxiliary pieces could run elsewhere with API-backed models. In practice, this production server is already serving:

- `spacebot`
- `agentscope`
- `reme-mcp`
- `qwen-agent`
- other PM2 services

This is not the place to add a research training stack or multiple extra conda environments.

### What would need to be added

#### Option A: Separate GPU research node

Recommended if you want real AgentEvolver experiments.

Suggested baseline:

- **1x A100/H100 80GB** for small custom proof-of-concept only
- **4-8x A100/H100 80GB** for something closer to the official configs
- **64-128 GB RAM**
- **200+ GB SSD/NVMe**
- separate ReMe HTTP backend (or adapter)

#### Option B: Keep production server as-is, build only the concept

Recommended for SpaceBot right now.

- reuse current AgentScope + ReMe services
- add custom experience logging, summarization, retrieval, and prompt injection
- no CUDA, no conda, no training workers on prod

### GPU rental estimates

Using currently browsed Runpod prices:

| GPU | Approx hourly price | 24h | 30 days 24/7 |
|---|---:|---:|---:|
| A100 PCIe 80GB | ~$1.39/hr | ~$33/day | ~$1,001/mo |
| A100 SXM 80GB | ~$1.49/hr | ~$36/day | ~$1,073/mo |
| H100 SXM 80GB | ~$2.99/hr | ~$72/day | ~$2,153/mo |

For the repo's **8-GPU** default-style setup:

| Cluster | Approx hourly price | 24h | 30 days 24/7 |
|---|---:|---:|---:|
| 8x A100 PCIe 80GB | ~$11.12/hr | ~$267/day | ~$8,010/mo |
| 8x A100 SXM 80GB | ~$11.92/hr | ~$286/day | ~$8,582/mo |
| 8x H100 SXM 80GB | ~$23.92/hr | ~$574/day | ~$17,222/mo |

These numbers are only the **GPU box**. They do not include API usage, engineering time, or checkpoint/object storage.

---

## 9. Alternative Paths

## A) ReMe experience accumulation + AgentScope prompt engineering

**Verdict: YES. Best fit.**

This is the most practical way to get "bots that improve over time" on the current system.

What it gives you:

- bots remember successful strategies
- bots avoid repeating known failure patterns
- similar tasks pull in relevant prior lessons before acting
- no GPU server required

What it does **not** give you:

- weight updates
- benchmark-style RL gains like the paper reports

But for a real production bot product, this is the strongest ROI path.

## B) A lightweight AgentEvolver component without RL training

**Verdict: limited value, mostly as inspiration rather than direct deployment.**

The useful pieces are:

- self-questioning as synthetic task generation / eval generation
- self-navigation as experience retrieval and prompt augmentation

The official codebase is tightly coupled to the training stack, so trying to "just deploy the light part" from the repo is not nearly as clean as it sounds.

## C) A custom experience loop that captures what works and feeds it back

**Verdict: YES. Probably the best overall approach.**

This is the version I would actually build:

1. Capture each bot run: task, plan, tools used, outcome, failure mode.
2. Score it with a rubric.
3. Summarize success/failure patterns into ReMe.
4. Retrieve top-k relevant lessons before the next similar task.
5. Periodically distill high-performing lessons into the system prompt or bot-specific playbooks.

That gets you the most important AgentEvolver behavior, without dragging in the RL training burden.

---

## 10. Cost

## DashScope API pricing signals (official Alibaba Cloud pricing page)

### Relevant current prices (official Alibaba Cloud pricing page)

### Relevant current prices (China mainland region)

- **qwen3-max**
  - `0 < input <= 32K`: **2.5 CNY / 1M input tokens**, **10 CNY / 1M output tokens**
  - `32K < input <= 128K`: **4 CNY / 1M input**, **16 CNY / 1M output**
  - `128K < input <= 252K`: **7 CNY / 1M input**, **28 CNY / 1M output**
- **qwen-max / qwen-max-2025-01-25**
  - **2.4 CNY / 1M input**, **9.6 CNY / 1M output**
- **qwen-plus** (non-thinking)
  - `0 < input <= 128K`: **0.8 CNY / 1M input**, **2 CNY / 1M output**
- **text-embedding-v4**
  - **0.5 CNY / 1M input tokens**

### What that means in practice

For full AgentEvolver-style training, API cost is **not** the primary blocker. GPU cost is.

But API cost can still become meaningful because:

- Task Manager uses API models for task synthesis/grading.
- ReMe summarization/retrieval may use API LLMs + embeddings.
- ADCA step attribution can call a strong model on long trajectories.

### Example cost sketches

#### Example 1: lightweight production improvement loop

If you run a custom ReMe + AgentScope loop and burn, say:

- **10M input tokens/month** on `qwen-max`
- **2M output tokens/month** on `qwen-max`
- **10M embedding tokens/month** on `text-embedding-v4`

Then rough monthly API cost is:

- qwen-max input: `10 x 2.4 = 24 CNY`
- qwen-max output: `2 x 9.6 = 19.2 CNY`
- embeddings: `10 x 0.5 = 5 CNY`
- **Total: ~48.2 CNY/month**

That is cheap.

#### Example 2: heavy attribution batch using qwen3-max

Suppose you semantically evaluate **10,000 trajectories**, each with roughly:

- **10,000 input tokens**
- **500 output tokens**

At the `qwen3-max` <=32K tier, rough cost is:

- input: `100M x 2.5 / 1M = 250 CNY`
- output: `5M x 10 / 1M = 50 CNY`
- **Total: ~300 CNY**

If trajectories are long enough to push requests into the higher pricing tier, this rises fast.

### Storage cost

- **Experience storage:** low compared with GPU/API. ReMe memories are cheap to store.
- **Inference:** tens of thousands of summarized memories are likely in the **hundreds of MB to low single-digit GB** range, depending on text size and vector/index overhead.
- **Training checkpoints:** much more serious. Real RL training can easily require **100GB+** once checkpoints and logs accumulate.

### Realistic monthly operating cost

#### If you do the recommended alternative

- infra: current server + existing services
- API: tens to low hundreds of CNY/month at modest traffic
- storage: negligible

#### If you do full AgentEvolver off-box

- GPU: **$8k-$17k/month** for an 8x A100/H100 class cluster if left up continuously
- API: hundreds to thousands of CNY depending on attribution volume
- extra engineering and checkpoint storage on top

---

## 11. Risk Flags

1. **Hard resource mismatch**
   - The current production server is far below the official stack's needs.

2. **No CUDA / no conda / no GPU**
   - `nvidia-smi`, `nvcc`, and `conda` are all missing on the server.

3. **Research-stack dependency risk**
   - The repo pins GPU-heavy packages: `vllm`, `flash-attn`, `cupy-cuda12x`, `xformers`, `torch==2.6.0`, and a git-pinned `verl` commit.

4. **ReMe API mismatch**
   - Current SpaceBot `reme-mcp` is not wire-compatible with AgentEvolver's expected ReMe HTTP API.

5. **Production-host contamination risk**
   - The prod box already runs multiple PM2 services. Installing conda/CUDA/research deps there is a bad idea.

6. **Long-context cost amplification**
   - The example configs use very large context lengths. This inflates both GPU memory pressure and API attribution cost.

7. **Framework maturity**
   - It is active and improving, but it is still a **research framework**, not a turnkey production feature.

8. **Version drift**
   - The repo is moving: Game Arena, CuES, SeeUPO, env fixes, docs changes. Reproducing paper-like behavior later may require pinning exact commits.

---

## 12. Minimum Viable Ship

### The smallest useful thing I would ship

Not official AgentEvolver.

I would ship a **SpaceBot experience loop** inspired by AgentEvolver's self-navigation:

1. Score each completed bot run.
2. Summarize what worked / failed.
3. Write that summary into ReMe.
4. Retrieve top-k relevant memories before the next similar task.
5. Inject those lessons into the bot prompt or planning context.

### What users would see

- bots repeat fewer mistakes
- bots get better at recurring workflows
- bots remember "what usually works" for specific users or task types
- bots feel more stable over time without any visible "training mode"

### How bots would be different

- fewer dead-end tool calls
- better first-plan quality
- better follow-up behavior on repeated tasks
- gradual improvement from operational history

### Estimated build time

- **Basic version:** **2-4 days** if you reuse the current AgentScope and ReMe services
- **More robust version with scoring/eval dashboards/prompt promotion:** **1-2 weeks**

---

## 13. GO / NO-GO

### Verdict

**NO-GO for deploying official AgentEvolver on the current SpaceBot production server.**

### Why

- the server lacks the baseline hardware/software prerequisites
- the live ReMe service is not API-compatible with AgentEvolver's expected ReMe backend
- the framework is designed for RL training on local weights, not for directly improving your live API-served bots

### Conditional path if you still want AgentEvolver research

Only proceed if **all** of the following are true:

1. You provision a **separate GPU research machine**.
2. You run a **ReMe HTTP backend** compatible with `/retrieve_task_memory` and `/summary_task_memory`.
3. You accept that this is **offline/sidecar training infrastructure**, not something to bolt onto the current prod server.
4. You are willing to tune smaller experiments first rather than jumping straight to the repo defaults.

### Recommended path instead

**Use ReMe + AgentScope + a custom experience loop now.**

That gets you the real product value you want:

- bots improve over time
- no GPU dependency
- no production-host contamination
- fast implementation path
- directly compatible with your already-live services

---

## Server Audit Evidence

### Requested checks

- `free -h`
  - `Mem: 3.8Gi total, 1.3Gi used, 1.7Gi free, 2.5Gi available`
  - `Swap: 6.0Gi total, 1.0Gi used`
- `df -h /`
  - `/dev/vda1 77G total, 22G used, 55G avail`
- `top -bn1`
  - load avg roughly `0.42, 0.62, 0.47`
  - RAM confirms ~`3915.9 MiB total`
- `nproc`
  - `2`
- `nvidia-smi`
  - `command not found`
- `which conda`
  - not found
- `conda --version`
  - `command not found`
- `nvcc --version`
  - `command not found`
- `ls /usr/local/cuda*`
  - no CUDA directories found
- `pm2 list`
  - live services include `spacebot`, `agentscope`, `reme-mcp`, `qwen-agent`, `tool-service`, `ticker-worker`, others
- `curl http://127.0.0.1:8101/health`
  - `200 OK`
  - service=`reme-mcp`
  - chroma path=`/var/www/spacebot/reme-data/chroma`
  - embedder=`dashscope-v4`
- `curl http://127.0.0.1:8090/health`
  - `200 OK`
  - service=`agentscope`
  - version=`1.0.0`
  - model=`qwen3-max`
- `python3 --version`
  - `Python 3.12.3`
- `pip show agentevolver`
  - package not installed

### Extra compatibility probes I ran

- `curl http://127.0.0.1:8101/openapi.json`
  - confirms `reme-mcp` exposes `/memory/read`, `/memory/write`, `/memory/list`, `/memory/delete`
- `POST /summary_task_memory` on `8101`
  - `404 Not Found`
- `POST /retrieve_task_memory` on `8101`
  - `404 Not Found`
- `curl http://127.0.0.1:8001/health`
  - no service listening

---

## Sources

- AgentEvolver repo: <https://github.com/modelscope/AgentEvolver>
- AgentEvolver commits: <https://github.com/modelscope/AgentEvolver/commits/main>
- AgentEvolver docs: <https://modelscope.github.io/AgentEvolver/>
- AgentEvolver quick start: <https://modelscope.github.io/AgentEvolver/tutorial/quick_start/>
- AgentEvolver paper: <https://arxiv.org/abs/2511.10395>
- ReMe repo / org family: <https://github.com/agentscope-ai/ReMe> and <https://github.com/agentscope-ai>
- AgentScope repo: <https://github.com/agentscope-ai/agentscope>
- HiClaw repo: <https://github.com/agentscope-ai/HiClaw>
- DeepResearch repo: <https://github.com/Alibaba-NLP/DeepResearch>
- OmniCharacter code location: <https://github.com/AlibabaResearch/DAMO-ConvAI>
- Alibaba Cloud model pricing: <https://help.aliyun.com/zh/model-studio/model-pricing>
- Runpod A100 PCIe: <https://www.runpod.io/gpu-models/a100-pcie>
- Runpod A100 SXM: <https://www.runpod.io/gpu-models/a100-sxm>
- Runpod H100 SXM: <https://www.runpod.io/gpu-models/h100-sxm>
