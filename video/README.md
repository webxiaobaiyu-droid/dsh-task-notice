# Promo film

A ~75-second Chinese promo for `dsh-task-notice`, built from this checkout: no
screen recording, no stock footage, no editor project.

| Output | What it is |
|---|---|
| `out/dsh-task-notice-promo.mp4` | 1920×1080, 30 fps, H.264 High + AAC, ~4.7 MB |
| `out/dsh-task-notice-promo.srt` | the same captions as a sidecar track |
| `out/dsh-task-notice-cover-16x9.png` | 3840×2160, 16:9 upload cover |
| `out/dsh-task-notice-cover-4x3.png` | 3200×2400, 4:3 upload cover |
| `out/title.txt` / `out/description.txt` | publish title and description |
| `out/publish-copy.md` | the same copy with alternate titles and chapter list |

```sh
# once: the same neural voice as the dsh-local-usage film
python3 -m venv video/.venv-tts
video/.venv-tts/bin/pip install edge-tts

node video/build.mjs                 # everything, ~3 minutes
node video/build.mjs --skip-panel    # reuse the captured widget states
node video/build.mjs --skip-frames   # re-encode the existing frames
```

The narration uses **edge-tts / zh-CN-YunxiNeural @ +6%**, the same voice and
pace as the `dsh-local-usage` promo. `video/narration.json` is the script and
the per-scene chrome; `scripts/tts.mjs` measures each line and writes the scene
boundaries to `film/timings.js`, so editing the copy re-times the cuts, captions
and audio together.

## The arrangement

Every scene is the same document:

```
┌──────────────────────────────────────────────────────────┐
│ TASK NOTICE · 开场                    version   0.1.1     │  kicker left,
│                                       license   MIT       │  facts right
│ 跑完了，别让答案等你                                        │  title
│ dsh-task-notice · 每个会话的完成提醒                          │  qualifier
│ ┌──────────────────────────────────────────────────────┐ │
│ │ the shipping widget, the card stack, or the settings │ │  one content layer
│ └──────────────────────────────────────────────────────┘ │
│ ─────────────────── hairline ─────────────────────────── │
│              任务跑完了，人还在等                            │  the spoken line
└──────────────────────────────────────────────────────────┘
```

The widget is the **shipping component**: `video/panel/` mounts
`src/client/NoticeWidget.tsx` with the plugin's own stylesheet and the product's
theme tokens, and feeds it a synthetic workspace and completion records. Every
state is reached through the widget's own affordances — dock click, gear,
completion event, a persisted drag position — so the face in the film is the
face in the app. `scripts/capture-panel.mjs` saves those states as PNGs.

The film page is a pure function of time. `film.js` writes every animated
property inline; `scripts/frames.mjs` walks the timeline at 30 fps; nothing runs
on a CSS transition or a timer, so the picture cannot drift from the audio.

## Changing it

| Want | Edit |
|---|---|
| Copy, captions, section titles, fact corner | `narration.json` |
| Voice or speed | `narration.json` (`engine`, `voice`, `rate`), or `node video/scripts/tts.mjs --voice zh-CN-XiaoxiaoNeural --rate +0%` |
| Demo records and workspace | `panel/main.tsx`, `panel/index.html` |
| Widget states captured | `scripts/capture-panel.mjs` |
| Palette, type, layout | `film/film.css`; scene motion in `film/film.js` |
| Voiceover mix | `scripts/audio.mjs` (`--no-bed` drops the quiet pad) |

`DSH_SRC` points at the Harness checkout whose theme tokens the panel harness
reads; `DSH_PLAYWRIGHT` overrides where `playwright-core` is loaded from. Both
default to the checkout this plugin was developed against.

`frames/`, `probe/`, `assets/`, `.venv-tts/` and `film/timings.js` are generated
and ignored; the pipeline, the copy, the panel harness and the film page are the
sources.
