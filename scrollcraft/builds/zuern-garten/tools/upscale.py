"""Upscale the walk frames 2x with Real-ESRGAN (x2plus), locally on the GPU.

The film is 1280x720 and reads soft full-screen; the ESRGAN pass restores edge
detail on leaves, stone and timber before the web frames are cut.

  ~/.cache/scrollcraft-venv/bin/python tools/upscale.py out/frames out/frames-2x

Weights: RealESRGAN_x2plus.pth (BSD-3, xinntao/Real-ESRGAN), downloaded once to
~/.cache/scrollcraft-models/.
"""

import sys
import urllib.request
from pathlib import Path

import cv2
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F

WEIGHTS_URL = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth"
WEIGHTS = Path.home() / ".cache" / "scrollcraft-models" / "RealESRGAN_x2plus.pth"


class ResidualDenseBlock(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.conv1 = nn.Conv2d(nf, gc, 3, 1, 1)
        self.conv2 = nn.Conv2d(nf + gc, gc, 3, 1, 1)
        self.conv3 = nn.Conv2d(nf + 2 * gc, gc, 3, 1, 1)
        self.conv4 = nn.Conv2d(nf + 3 * gc, gc, 3, 1, 1)
        self.conv5 = nn.Conv2d(nf + 4 * gc, nf, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, inplace=True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, nf, gc=32):
        super().__init__()
        self.rdb1 = ResidualDenseBlock(nf, gc)
        self.rdb2 = ResidualDenseBlock(nf, gc)
        self.rdb3 = ResidualDenseBlock(nf, gc)

    def forward(self, x):
        return self.rdb3(self.rdb2(self.rdb1(x))) * 0.2 + x


class RRDBNet(nn.Module):
    """Real-ESRGAN generator; scale 2 folds the input with pixel_unshuffle."""

    def __init__(self, nf=64, nb=23, gc=32):
        super().__init__()
        self.conv_first = nn.Conv2d(3 * 4, nf, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(nf, gc) for _ in range(nb)])
        self.conv_body = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_hr = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_last = nn.Conv2d(nf, 3, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, inplace=True)

    def forward(self, x):
        feat = self.conv_first(F.pixel_unshuffle(x, 2))
        feat = feat + self.conv_body(self.body(feat))
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode="nearest")))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode="nearest")))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


def load_model(device):
    if not WEIGHTS.exists():
        WEIGHTS.parent.mkdir(parents=True, exist_ok=True)
        print("downloading", WEIGHTS_URL)
        urllib.request.urlretrieve(WEIGHTS_URL, WEIGHTS)
    state = torch.load(WEIGHTS, map_location="cpu", weights_only=True)
    state = state.get("params_ema", state.get("params", state))
    model = RRDBNet()
    model.load_state_dict(state, strict=True)
    return model.eval().to(device).half() if device == "cuda" else model.eval()


def main(src, dst):
    src, dst = Path(src), Path(dst)
    dst.mkdir(parents=True, exist_ok=True)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = load_model(device)
    files = sorted(src.glob("*.png"))
    for i, f in enumerate(files):
        out = dst / f.name
        if out.exists():
            continue
        img = cv2.imread(str(f), cv2.IMREAD_COLOR)[:, :, ::-1].astype(np.float32) / 255
        t = torch.from_numpy(img.copy()).permute(2, 0, 1)[None].to(device)
        if device == "cuda":
            t = t.half()
        with torch.inference_mode():
            y = model(t).float().clamp(0, 1)[0].permute(1, 2, 0).cpu().numpy()
        cv2.imwrite(str(out), (y[:, :, ::-1] * 255).round().astype(np.uint8))
        if i % 20 == 0:
            print(f"{i + 1}/{len(files)}", flush=True)
    print("done", len(files))


if __name__ == "__main__":
    main(*sys.argv[1:3])
