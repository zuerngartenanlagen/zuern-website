"""Find the pond in every walk frame, for the ripple shader in walk.js.

SegFormer (ADE20K) labels water per frame; neighbouring frames are averaged so
the mask does not flicker, then every mask is packed into one atlas image per
layout (desktop full frame, phone portrait crop), grid order = film order.

  ~/.cache/scrollcraft-venv/bin/python tools/water_masks.py out/frames assets/seq

Writes water-d.webp, water-m.webp and water.json ({cols, count, cell: {d, m}}).
"""

import json
import sys
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image
from transformers import SegformerForSemanticSegmentation

MODEL = "nvidia/segformer-b4-finetuned-ade-512-512"
WATER = [21, 26, 60, 128]          # ADE20K: water, sea, river, lake
PHONE_CROP = (360, 0, 560, 720)    # x, y, w, h in the 1280x720 film (matches make_sequence.sh)
CELL_D = (256, 144)
CELL_M = (128, 164)
COLS = 13


MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)


def preprocess(img):
    """SegFormer ADE preprocessing (resize 512, ImageNet norm) without torchvision."""
    a = np.asarray(img.resize((512, 512), Image.BILINEAR), np.float32) / 255
    return torch.from_numpy(((a - MEAN) / STD).transpose(2, 0, 1))[None]


def probabilities(files, device):
    model = SegformerForSemanticSegmentation.from_pretrained(MODEL).eval().to(device)
    out = []
    for i, f in enumerate(files):
        img = Image.open(f).convert("RGB")
        with torch.inference_mode():
            logits = model(pixel_values=preprocess(img).to(device)).logits
        up = torch.nn.functional.interpolate(logits, size=(img.height, img.width), mode="bilinear")
        prob = up.softmax(1)[0, WATER].sum(0).cpu().numpy()
        out.append(prob.astype(np.float32))
        if i % 40 == 0:
            print(f"{i + 1}/{len(files)}", flush=True)
    return out


def clean(prob):
    m = np.clip((prob - 0.35) / 0.3, 0, 1)
    h = m.shape[0]
    m[: int(h * 0.3)] = 0                                    # never in the sky
    hard = (m > 0.5).astype(np.uint8)
    hard = cv2.morphologyEx(hard, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
    m = np.minimum(m, cv2.dilate(hard, np.ones((15, 15), np.uint8)).astype(np.float32))
    return cv2.GaussianBlur(m, (0, 0), 6)


def atlas(masks, cell, crop=None):
    rows = -(-len(masks) // COLS)
    sheet = np.zeros((rows * cell[1], COLS * cell[0]), np.uint8)
    for i, m in enumerate(masks):
        if crop:
            x, y, w, h = crop
            m = m[y:y + h, x:x + w]
        small = cv2.resize(m, cell, interpolation=cv2.INTER_AREA)
        r, c = divmod(i, COLS)
        sheet[r * cell[1]:(r + 1) * cell[1], c * cell[0]:(c + 1) * cell[0]] = (small * 255).round()
    return sheet


def main(src, dst):
    files = sorted(Path(src).glob("*.png"))
    dst = Path(dst)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    probs = probabilities(files, device)
    # Average over +-2 frames: the model's small per-frame disagreements would flicker.
    smooth = [np.mean(probs[max(0, i - 2):i + 3], axis=0) for i in range(len(probs))]
    masks = [clean(p) for p in smooth]
    cv2.imwrite(str(dst / "water-d.webp"), atlas(masks, CELL_D), [cv2.IMWRITE_WEBP_QUALITY, 85])
    cv2.imwrite(str(dst / "water-m.webp"), atlas(masks, CELL_M, PHONE_CROP), [cv2.IMWRITE_WEBP_QUALITY, 85])
    meta = {"cols": COLS, "count": len(masks), "cell": {"d": CELL_D, "m": CELL_M}}
    (dst / "water.json").write_text(json.dumps(meta))
    cover = [round(float((m > 0.5).mean()), 3) for m in masks]
    print("water cover first/mid/last:", cover[0], cover[len(cover) // 2], cover[-1])


if __name__ == "__main__":
    main(*sys.argv[1:3])
