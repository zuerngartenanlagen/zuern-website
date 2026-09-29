"""Cut the garden scene into depth layers.

Inputs (gen/):
  master.png   the full scene
  plate.png    same scene, pavilion and tree removed
  ground.png   plate with boulder and reeds removed as well

Outputs (lab/layers/, full resolution, for inspection and web export):
  ground.png        continuous ground: master everywhere except removed regions
  depth.png         16-bit relative depth of ground (1 = near)
  castle.png        RGBA pavilion cutout, cropped
  tree.png          RGBA tree cutout, cropped
  boulder.png       RGBA boulder cutout, cropped
  reeds.png         RGBA reeds cutout, cropped
  water.png         pond mask for the ripple shader
  layers.json       crop rects (normalised to the plate) and depths

Run with the venv that has torch + transformers + opencv:
  ~/.cache/scrollcraft-venv/bin/python tools/cut_layers.py
"""

import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
GEN = ROOT / "gen"
OUT = ROOT / "lab" / "layers"
OUT.mkdir(parents=True, exist_ok=True)

# Regions in plate pixels (2720x1530), measured on the master.
BOX_CASTLE = (1600, 230, 2720, 960)
BOX_TREE = (840, 180, 1560, 1060)
TREE_CANOPY_BOTTOM = 720
BOX_BOULDER = (1690, 1110, 2180, 1440)
BOX_REEDS = (0, 1000, 1110, 1530)
# Pavilion silhouette (roof, glass front, deck), same 1400px scale. The castle
# layer is this silhouette plus whatever the difference matte adds (climbers).
CASTLE_POLY = [(843, 236), (1400, 126), (1400, 464), (1000, 464), (926, 452),
               (926, 300), (848, 272)]
# Pond outline, measured on the ground plate at 1400px width, scaled at use.
WATER_POLY = [(160, 650), (300, 630), (460, 618), (600, 610), (720, 616), (770, 640),
              (830, 680), (880, 700), (1000, 760), (1010, 787), (170, 787)]


def load(name):
    return cv2.imread(str(GEN / name), cv2.IMREAD_COLOR).astype(np.float32) / 255.0


def register(ref, img):
    """Affine-align img onto ref with ECC on a downscaled grey copy."""
    small = (680, 383)
    a = cv2.cvtColor(cv2.resize(ref, small), cv2.COLOR_BGR2GRAY)
    b = cv2.cvtColor(cv2.resize(img, small), cv2.COLOR_BGR2GRAY)
    warp = np.eye(2, 3, dtype=np.float32)
    crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6)
    _, warp = cv2.findTransformECC(a, b, warp, cv2.MOTION_AFFINE, crit, None, 5)
    warp[:, 2] *= ref.shape[1] / small[0]
    h, w = ref.shape[:2]
    return cv2.warpAffine(img, warp, (w, h), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP,
                          borderMode=cv2.BORDER_REFLECT)


def colour_match(ref, img, valid):
    """Least-squares 3x4 colour transform img -> ref over valid pixels."""
    x = img[valid].reshape(-1, 3)
    y = ref[valid].reshape(-1, 3)
    xh = np.hstack([x, np.ones((len(x), 1), np.float32)])
    m, *_ = np.linalg.lstsq(xh, y, rcond=None)
    flat = np.hstack([img.reshape(-1, 3), np.ones((img.shape[0] * img.shape[1], 1), np.float32)])
    return np.clip(flat @ m, 0, 1).reshape(img.shape).astype(np.float32)


def diff(a, b, sigma=2.5):
    a = cv2.GaussianBlur(a, (0, 0), sigma)
    b = cv2.GaussianBlur(b, (0, 0), sigma)
    la = cv2.cvtColor(a, cv2.COLOR_BGR2Lab)
    lb = cv2.cvtColor(b, cv2.COLOR_BGR2Lab)
    return np.linalg.norm(la - lb, axis=2)


def box_mask(shape, box):
    m = np.zeros(shape[:2], np.float32)
    x0, y0, x1, y1 = box
    m[y0:y1, x0:x1] = 1
    return m


def guided(guide, src, r=8, eps=1e-3):
    """Grey guided filter (He et al.), to snap a rough alpha to image edges."""
    g = cv2.cvtColor(guide, cv2.COLOR_BGR2GRAY)
    box = lambda v: cv2.boxFilter(v, -1, (r, r))
    mg, ms = box(g), box(src)
    a = (box(g * src) - mg * ms) / (box(g * g) - mg * mg + eps)
    b = ms - a * mg
    return np.clip(box(a) * g + box(b), 0, 1)


def matte(d, box, lo, hi, keep_largest=1, close=9):
    """Soft alpha from a difference map inside a box, largest blobs only."""
    m = np.clip((d - lo) / (hi - lo), 0, 1) * box_mask(d.shape, box)
    hard = (m > 0.5).astype(np.uint8)
    hard = cv2.morphologyEx(hard, cv2.MORPH_CLOSE, np.ones((close, close), np.uint8))
    _, lab, stats, _ = cv2.connectedComponentsWithStats(hard, 8)
    order = np.argsort(-stats[1:, cv2.CC_STAT_AREA])[:keep_largest] + 1
    keep = cv2.dilate(np.isin(lab, order).astype(np.uint8), np.ones((5, 5), np.uint8))
    return m * keep


def solid(alpha, close=41, hull=False):
    """Close gaps and fill holes in a matte of a solid object."""
    hard = (alpha > 0.4).astype(np.uint8)
    hard = cv2.morphologyEx(hard, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close, close)))
    if hull:
        pts = cv2.findNonZero(hard)
        hard = cv2.fillConvexPoly(np.zeros_like(hard), cv2.convexHull(pts), 1)
    return fill_holes(np.maximum(alpha, hard.astype(np.float32)))


def fill_holes(alpha):
    hard = (alpha > 0.5).astype(np.uint8)
    n, lab = cv2.connectedComponents(1 - hard, 4)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    holes = np.isin(lab, [i for i in range(1, n) if i not in border])
    out = alpha.copy()
    out[holes] = 1
    return out


def save_rgba(name, img, alpha, box):
    x0, y0, x1, y1 = box
    rgba = np.dstack([img, alpha])[y0:y1, x0:x1]
    cv2.imwrite(str(OUT / name), (rgba * 255).round().astype(np.uint8))


def depth_map(img):
    from PIL import Image
    from transformers import pipeline
    import torch

    pipe = pipeline("depth-estimation", model="depth-anything/Depth-Anything-V2-Base-hf",
                    device=0 if torch.cuda.is_available() else -1)
    rgb = Image.fromarray((cv2.cvtColor(img, cv2.COLOR_BGR2RGB) * 255).astype(np.uint8))
    d = np.array(pipe(rgb)["predicted_depth"].squeeze().cpu().numpy(), np.float32)
    d = cv2.resize(d, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_CUBIC)
    d = (d - np.percentile(d, 1)) / (np.percentile(d, 99.5) - np.percentile(d, 1))
    return np.clip(d, 0, 1)


def main():
    master = load("master.png")
    plate = register(master, load("plate.png"))
    ground = register(master, load("ground.png"))

    # Colour-match the edits to the master, fitted on pixels that did not change.
    plate = colour_match(master, plate, diff(master, plate) < 6)
    ground = colour_match(master, ground, diff(master, ground) < 6)

    d_mp = diff(master, plate)
    d_pg = diff(plate, ground)

    k = master.shape[1] / 1400
    house = cv2.fillPoly(np.zeros(master.shape[:2], np.float32),
                         [np.array([(x * k, y * k) for x, y in CASTLE_POLY], np.int32)], 1)
    a_castle = guided(master, np.maximum(solid(matte(d_mp, BOX_CASTLE, 7, 16)), house), r=4)
    a_tree = guided(master, matte(d_mp, BOX_TREE, 6, 14, close=5), r=4, eps=4e-4)
    a_boulder = guided(master, solid(matte(d_pg, BOX_BOULDER, 8, 18), hull=True), r=4)
    a_reeds = guided(master, matte(d_pg, BOX_REEDS, 6, 14, keep_largest=3, close=5), r=4, eps=4e-4)

    # Continuous ground: master everywhere except under the lifted layers.
    # Behind castle and tree the clean plate, behind boulder and reeds the ground edit.
    def lift(a):
        return cv2.GaussianBlur(cv2.dilate(a, np.ones((25, 25), np.uint8)), (0, 0), 6)[..., None]
    up_far = lift(np.maximum(a_castle, a_tree))
    up_near = lift(np.maximum(a_boulder, a_reeds))
    ground_final = master * (1 - up_far) + plate * up_far
    ground_final = ground_final * (1 - up_near) + ground * up_near

    # Behind the canopy the edit invented a pale tree. Nothing there is ever seen
    # sharply, only glimpsed past moving leaves, so make it a soft dark backdrop
    # that cannot visibly stretch.
    veil = cv2.dilate((a_tree > 0.08).astype(np.uint8), np.ones((61, 61), np.uint8)).astype(np.float32)
    veil[TREE_CANOPY_BOTTOM:] = 0
    veil = cv2.GaussianBlur(veil, (0, 0), 20)[..., None]
    soft = cv2.GaussianBlur(ground_final, (0, 0), 12)
    ground_final = ground_final * (1 - veil) + soft * veil

    depth = depth_map(ground_final)
    depth_s = cv2.bilateralFilter(depth, 9, 0.08, 12)

    # Pond mask from the measured outline, feathered.
    poly = np.array([(x * k, y * k) for x, y in WATER_POLY], np.int32)
    water = cv2.fillPoly(np.zeros(master.shape[:2], np.float32), [poly], 1)
    water = cv2.GaussianBlur(water, (0, 0), 14)

    cv2.imwrite(str(OUT / "ground.png"), (ground_final * 255).round().astype(np.uint8))
    cv2.imwrite(str(OUT / "depth.png"), (depth_s * 65535).astype(np.uint16))
    cv2.imwrite(str(OUT / "water.png"), (water * 255).astype(np.uint8))
    save_rgba("castle.png", master, a_castle, BOX_CASTLE)
    save_rgba("tree.png", master, a_tree, BOX_TREE)
    save_rgba("boulder.png", master, a_boulder, BOX_BOULDER)
    save_rgba("reeds.png", master, a_reeds, BOX_REEDS)
    cv2.imwrite(str(OUT / "master.png"), (master * 255).round().astype(np.uint8))

    def contact_depth(alpha):
        """Ground depth just below a card's contact line."""
        ys, xs = np.nonzero(alpha > 0.5)
        y = min(int(np.percentile(ys, 98)) + 6, depth_s.shape[0] - 5)
        x = int(np.median(xs))
        return float(np.median(depth_s[y - 4:y + 4, max(x - 40, 0):x + 40]))

    h, w = master.shape[:2]
    cards = [("castle", a_castle, BOX_CASTLE), ("tree", a_tree, BOX_TREE),
             ("boulder", a_boulder, BOX_BOULDER), ("reeds", a_reeds, BOX_REEDS)]
    meta = {"size": [w, h], "layers": {}}
    for name, a, box in cards:
        x0, y0, x1, y1 = box
        meta["layers"][name] = {"rect": [x0 / w, y0 / h, (x1 - x0) / w, (y1 - y0) / h],
                                "depth": round(contact_depth(a), 3)}

    # Whatever the ground shows behind a lifted card lies behind that card, so the
    # shader's depth test never lets rebuilt background occlude it.
    pushed = depth_s.copy()
    for name, a, _ in cards:
        region = cv2.dilate((a > 0.08).astype(np.uint8), np.ones((31, 31), np.uint8)) > 0
        pushed[region] = np.minimum(pushed[region], meta["layers"][name]["depth"] - 0.05)
    # The plate grew a pale background tree behind the real canopy. Against the sky
    # any in-between depth stretches it, so its whole area rides at sky depth.
    canopy = cv2.dilate((a_tree > 0.08).astype(np.uint8), np.ones((161, 161), np.uint8)) > 0
    canopy[TREE_CANOPY_BOTTOM:] = False
    pushed[canopy] = np.minimum(pushed[canopy], 0.03)
    pushed = cv2.GaussianBlur(pushed, (0, 0), 10)
    # Heavy blur: the ground should bend, never tear. Sharp near objects are cards.
    pushed = cv2.GaussianBlur(pushed, (0, 0), 16)
    cv2.imwrite(str(OUT / "depth.png"), (np.clip(pushed, 0, 1) * 65535).astype(np.uint16))
    (OUT / "layers.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
