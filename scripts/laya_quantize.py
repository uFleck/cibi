"""Shrinks the fp32 Laya encoder for cibi. Run by scripts/export-laya.ps1; see docs/laya.md.

Two weight-only int8 changes, activations stay fp32:
- the token embedding table (about 200M of the 322M parameters) is stored as int8 with one scale per
  row, and only the rows a batch gathers are dequantized;
- every MatMul weight is stored as int8 with one scale per output column and dequantized through
  DequantizeLinear.
Dynamic activation quantization was tried first and degraded the hidden states too much.

    python laya_quantize.py --src <dir with encoder.onnx> --out <dir> [--verify]
"""
import argparse
import os

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

MIN_ROWS = 10000  # only the vocabulary table is this tall


def quantize_embedding(model: onnx.ModelProto) -> int:
    inits = {i.name: i for i in model.graph.initializer}
    model.graph.initializer.append(numpy_helper.from_array(np.array([-1], dtype=np.int64), name="laya_unsqueeze_axes"))
    nodes = []
    replaced = 0
    for node in model.graph.node:
        table = inits.get(node.input[0]) if node.op_type == "Gather" else None
        if table is None or len(table.dims) != 2 or table.dims[0] < MIN_ROWS:
            nodes.append(node)
            continue
        w = numpy_helper.to_array(table).astype(np.float32)
        scale = np.abs(w).max(axis=1) / 127.0
        scale[scale == 0] = 1.0
        q = np.clip(np.round(w / scale[:, None]), -127, 127).astype(np.int8)
        q_name, s_name = f"{table.name}_int8", f"{table.name}_scale"
        model.graph.initializer.remove(table)
        model.graph.initializer.extend([
            numpy_helper.from_array(q, name=q_name),
            numpy_helper.from_array(scale.astype(np.float32), name=s_name),
        ])
        out, indices = node.output[0], node.input[1]
        nodes += [
            helper.make_node("Gather", [q_name, indices], [f"{out}_q"], name=f"{out}_gather_q"),
            helper.make_node("Gather", [s_name, indices], [f"{out}_s"], name=f"{out}_gather_s"),
            helper.make_node("Cast", [f"{out}_q"], [f"{out}_f"], name=f"{out}_cast", to=TensorProto.FLOAT),
            helper.make_node("Unsqueeze", [f"{out}_s", "laya_unsqueeze_axes"], [f"{out}_su"], name=f"{out}_unsq"),
            helper.make_node("Mul", [f"{out}_f", f"{out}_su"], [out], name=f"{out}_dequant"),
        ]
        inits.pop(table.name)
        replaced += 1
    del model.graph.node[:]
    model.graph.node.extend(nodes)
    return replaced


def quantize_matmul_weights(model: onnx.ModelProto) -> int:
    inits = {i.name: i for i in model.graph.initializer}
    nodes = []
    quantized = 0
    for node in model.graph.node:
        weight = inits.get(node.input[1]) if node.op_type == "MatMul" else None
        if weight is None or len(weight.dims) != 2:
            nodes.append(node)
            continue
        w = numpy_helper.to_array(weight).astype(np.float32)
        scale = np.abs(w).max(axis=0) / 127.0
        scale[scale == 0] = 1.0
        q = np.clip(np.round(w / scale[None, :]), -127, 127).astype(np.int8)
        name = weight.name
        model.graph.initializer.remove(weight)
        model.graph.initializer.extend([
            numpy_helper.from_array(q, name=f"{name}_int8"),
            numpy_helper.from_array(scale.astype(np.float32), name=f"{name}_scale"),
        ])
        nodes.append(helper.make_node(
            "DequantizeLinear", [f"{name}_int8", f"{name}_scale"], [f"{name}_dq"], name=f"{name}_dequant", axis=1,
        ))
        node.input[1] = f"{name}_dq"
        nodes.append(node)
        quantized += 1
    del model.graph.node[:]
    model.graph.node.extend(nodes)
    return quantized


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--src", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--verify", action="store_true", help="compare hidden states with the fp32 encoder")
    args = p.parse_args()
    os.makedirs(args.out, exist_ok=True)
    src = os.path.join(args.src, "encoder.onnx")
    dst = os.path.join(args.out, "encoder.onnx")

    model = onnx.load(src, load_external_data=True)
    embeddings = quantize_embedding(model)
    matmuls = quantize_matmul_weights(model)
    onnx.save(model, dst)
    print(f"quantized: {embeddings} embedding table, {matmuls} MatMul weights")
    print(f"encoder.onnx: {os.path.getsize(dst) / 1e6:.1f} MB")

    if args.verify:
        import onnxruntime as ort

        ids = np.random.default_rng(0).integers(1000, 50000, size=(2, 48), dtype=np.int64)
        feed = {"input_ids": ids, "attention_mask": np.ones_like(ids)}
        ref = ort.InferenceSession(src, providers=["CPUExecutionProvider"]).run(None, feed)[0]
        got = ort.InferenceSession(dst, providers=["CPUExecutionProvider"]).run(None, feed)[0]
        cos = float(np.sum(ref * got) / (np.linalg.norm(ref) * np.linalg.norm(got)))
        print(f"hidden states vs fp32: max abs diff {np.abs(ref - got).max():.4f}, cosine {cos:.5f}")


if __name__ == "__main__":
    main()
