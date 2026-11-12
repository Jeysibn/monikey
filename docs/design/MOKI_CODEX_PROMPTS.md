# Prompts for generating new Moki poses with Codex

Use these with Codex (or any image tool that accepts a reference image). **Always attach `frontend/src/assets/mascot/source/full-default.png` as the reference** and, for identity checks, the turnaround sheet (`origin/feat/moki-mascot-assets`, `frontend/src/assets/mascot/turnaround-sheet.png`). Text-only generation drifts off-model (two third-party kits were rejected for this).

## Shared brief (paste at the start of every prompt)

> Use the attached image as the exact character reference. This is **Moki**, MoniKey's chibi monkey mascot. Keep it identical: warm brown fur, cream face and inner ears, large brown eyes with a small highlight, small blush, one top hair tuft, a cobalt-blue hoodie with a white drawstring and front pocket, brown pants, white sneakers with blue accents, chibi proportions, clean 2D vector-style linework with a thin dark-brown outline, flat soft shading, and **exactly one tail with a gold key attached to its end**. Full body, centered, facing slightly toward the viewer. **Transparent background (PNG with alpha)**, 1254 x 1254, even margin around the character, no ground shadow, no text, no watermark, no extra characters. Do not redesign any feature; only change the pose, expression and the single prop described below.

## Poses to generate

| File name to save as | Where it will be used | Pose-specific prompt (append to the shared brief) |
|---|---|---|
| `full-reading-chart.png` | Dashboard: the analysis range has no spending | Moki holds a small clipboard with a simple bar chart (three bars, no numbers or letters) in one hand and points at it with the other; head tilted with a curious, calm smile. |
| `full-writing-journal.png` | Kakeibo Reflections: nothing written yet | Moki sits cross-legged and writes in an open notebook with a pencil; soft, focused smile; the key-tail curls up beside it. |
| `full-archive-box.png` | Categories: Archived tab is empty | Moki holds a small open cardboard box with a few tidy blank folders in it and a content, relaxed smile. |
| `full-sorting-tags.png` | Categories: first visit tip | Moki holds two or three small round color tags (blue, green, orange; no text) fanned out like cards and looks at them with interest. |
| `full-celebrate-small.png` | Optional, only if you later want a quiet success moment | Moki gives a small, calm double thumbs-up with a gentle smile; one small sparkle at most. Not jumping, no confetti. |

## After Codex returns the images

1. Compare each next to `full-default.png`: face, colors, hoodie, sneakers, proportions, one attached key-tail, no extra props, clean edges (no halos), transparent background.
2. Save the highest-quality PNG in `frontend/src/assets/mascot/source/` and tell Claude the file names.
3. Claude converts them to 480 px WebP (quality 0.92) in `frontend/public/moki/`, registers each pose in `frontend/src/lib/mokiAssets.ts`, wires it to its moment, updates the size table in `MOKI_ASSET_GUIDE.md`, and runs the unit, browser and accessibility checks.
