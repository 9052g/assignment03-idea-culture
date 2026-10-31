# Idea Culture / 念头培养皿

An interactive artwork for people exploring unfamiliar connections between ideas. Plant words on a digital petri dish and watch slime-mould-inspired networks grow. When networks meet, a local language model proposes a new idea at the intersection; that colony can grow in turn.

## Interaction

Click a blank area, enter a word or short phrase and select **种下** (plant). Repeat nearby. Wait for the networks to meet, then click a new idea to read its explanation or choose **换个想法** to try another. Pause or clear the dish using the bottom controls; **种下示例** plants examples. If the model is unavailable, the interface offers a retry.

## Run locally

Requirements: Python 3, [uv](https://docs.astral.sh/uv/getting-started/installation/), [Ollama](https://ollama.com/), and enough storage and memory for `qwen3:8b`. Python code uses only the standard library; there are no pip packages to install. With Ollama installed and running, open a terminal in this folder:

```sh
ollama pull qwen3:8b
uv run --no-project python server.py
```

Open <http://127.0.0.1:8767/>. Stop the server with Ctrl+C. Input is sent to Ollama on your own computer, not to a cloud API. Download size and generation speed depend on the machine; a GPU is helpful but not required.

## Limitations

This is a local prototype: GitHub Pages cannot run its Python server or local model. The model may take time, fail, or produce weak associations. If the service is unavailable, users can plant and watch networks grow, but new associations require Ollama. A screenshot or recording and a dependency-free demonstration are not yet included.

## Credits

Visual inspiration: observations of slime mould and fungal networks, including reference images supplied during design. The idea strategy was informed by [Idea Generator](https://github.com/ludi-uni/idea-generator-skill) (MIT); no code was copied. The visualisation, prompts and interface were developed with help from OpenAI Codex. See [PROCESS.md](PROCESS.md).
