# Laya category classifier

cibi can pick a category for a transaction from its description. Rules come first. When the rules
have no answer, the Laya model (https://github.com/NandhaKishorM/laya, Apache-2.0) is asked, on
device. The model is optional: without it cibi uses the rules only and Settings says so.

## Install the model

Run once, from the repo root (about 0.7 GB of downloads and about 1 GB for torch, in a temp folder
that is deleted at the end unless `-KeepTemp` is passed):

    powershell -ExecutionPolicy Bypass -File scripts\export-laya.ps1

It needs the `py` launcher with Python 3.13 (or 3.12). It exports `convaiinnovations/laya-multilingual`
to ONNX, stores the token embeddings and the MatMul weights as int8 (see `scripts/laya_quantize.py`),
checks the result against fp32, and copies these files to:

    %APPDATA%\com.ufleck.cibi\models\laya\
        encoder.onnx        about 311 MB (int8)
        head.onnx           about 258 KB + head.onnx.data about 60 MB (fp32)
        tokenizer.json      about 34 MB
        rl_agent_config.json

The head sidecar (`head.onnx.data`) is copied only when the export wrote one. Restart cibi. Settings > Categories then shows "Classifier: rules, then the on-device Laya model.".
Without the folder it shows "Laya model not found in ...".

## How a category is chosen

1. `rulesClassifier` (src/domain/classifier/rules.ts). When it answers, that answer is used.
2. Otherwise `createLayaClassifier` (src/domain/classifier/laya.ts) asks one `choice` question:
   the instruction is "Which spending category fits this payment?", the state is
   `Pagamento: <title>` or, when the transaction has a description, `Pagamento: <title>. <description>`, and the criteria map each category label to its description (the label itself when it has none).
   The answer is the top probability. It is offered only at or above `LAYA_MIN_CONFIDENCE`
   (0.8), which the answer carries as its own `minConfidence`, so it does not use the rules
   threshold `MIN_CONFIDENCE`.
3. A missing model, a load error or a prediction error gives no answer. A save is never failed by
   the classifier.

The model loads once, in the background: when the category field opens and when a backfill starts.
A save never waits for it. When a new expense is saved without a category, Laya is asked only if it is already
loaded; otherwise the rules alone decide. A backfill waits up to 60 s for the load and 3 s per description, and yields to the
event loop between rows. The model runs in a Web Worker (src/lib/laya.worker.ts, reached through
src/lib/layaWorkerAgent.ts), so loading it and classifying never block the UI thread. Inference uses
onnxruntime-web on WASM only (the 0.8 threshold was calibrated on WASM). The
runtime is vendored from the upstream TypeScript source at commit
`4ac226d5ee88ed6df8db288a05c766d7a34ee682` (src/vendor/laya, see its NOTICE).

## Evaluation

47 Portuguese merchant descriptions with a hand-written expected category (the set is in
`cases.ts` of the evaluation harness; it was not kept in the repo). Run on the int8 model.

| | Answered | Correct |
|---|---|---|
| Rules | 40 | 39 |
| Laya alone, all answers | 47 | 19 (prompt v1), 22 (final prompt) |
| Laya at threshold 0.8 | 12 | 11 |
| Rules, then Laya at 0.8 | 40 | 39 |

Laya's precision by threshold (final prompt, all 47 cases):

| threshold | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 |
|---|---|---|---|---|---|---|---|
| Laya answers | 34 | 25 | 22 | 20 | 19 | 12 | 9 |
| precision | 0.53 | 0.68 | 0.73 | 0.80 | 0.79 | 0.92 | 1.00 |

Calibration: 0.8 is the lowest threshold at which Laya is at least 90% right. On the seven
descriptions the rules do not answer, Laya at 0.8 adds no answer. Its confidence there is mostly
0.2 to 0.35, and the one wrong answer above 0.7 (Gympass, 0.77) stays below 0.8. Treat this as a
small sample: 47 descriptions and 7 rules-null cases.

Quantization: with the first prompt, fp32 and int8 gave the same answer on 45 of 47 descriptions
(they differ on "Aluguel" and "Posto Ipiranga"). Dynamic activation quantization was tried and
rejected (hidden-state cosine 0.985, against 0.998 for the weight-only int8 used now).

## Costs measured here (Windows, CPU only)

- Encoder int8 311 MB on disk; fp32 export 1.23 GB. The total installed folder is about 0.41 GB.
- Node (onnxruntime-node): load 1.7 s, RSS about 830 MB after load, predict p50 350 to 360 ms.
- Chromium (onnxruntime-web, WASM): load 4.4 s, JS heap about 120 MB after load (WASM memory is
  not included), predict p50 430 ms, first call 1.3 s.
  These were measured on the main thread, before the worker. In the worker (installed app, 8 categories
  without descriptions): load 5.9 s, predict about 0.72 s. A backfill of 34 descriptions with the real
  category list took 81 s with the model already loaded, and the UI thread had no stall over 100 ms.

## Limits

- Zero-shot accuracy is low on these categories. Use the rules-first order and keep the threshold.
- The Settings button "Categorize uncategorized transactions" stores the answers it accepts without
  review, so a wrong answer is saved as a category. The 0.8 threshold keeps this rare, not absent.
- The loader caches the model bytes in CacheStorage, so the WebView keeps a second copy on disk.
- Registration runs at startup, so a model installed while cibi is open is used after a restart.
- Activation probes encoder.onnx, head.onnx, tokenizer.json and rl_agent_config.json (and the head
  sidecar when present) before Laya is registered. A partial install reads as missing.
