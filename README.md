# Scene Fidelity

**Looking Right Is Not Being Right: Evaluating the Geometry of Agent-Built 3D Scenes**

How accurate are agent-built 3D scenes? Explore three agents’ reconstructions of the same room, compare their geometry with a laser scan, and browse the model benchmark.

- **[Interactive demo](https://albertlongzi.github.io/looking-right-being-right/)**
- **Paper:** submitted to arXiv; public link forthcoming.
- **[Data release repository](https://huggingface.co/datasets/Zylong/looking-right-being-right)** — further releases in preparation.
- Evaluation code and agent harness: release in preparation.

## Interactive demo

The page compares GPT-6.1 Terra, GPT-6.1 Sol, and GPT-6 Astra with video-only and estimated-geometric-input settings. The score atlas includes 72 configurations, including video-only evaluations of GPT-6.2 Sol, GPT-6.2 Astra, and Claude Fable 5.2. Source labels identify different reconstruction setups.

The animation reveals saved final geometry along the input camera path. It is not a replay of online reconstruction or actual agent save times. Use the scan slider to compare aligned geometry at the same viewpoint.

## Run locally

```sh
python3 -m http.server 8000 --directory site
```

Open http://localhost:8000/. For deployment validation, run `python3 tools/check_site.py`.

## Deploy

GitHub Pages uses `.github/workflows/pages.yml`. Pushes run validation only. To publish, open **Actions → Deploy Scene Fidelity → Run workflow**. This explicit deploy step makes it possible to coordinate publication with an arXiv announcement. A previous version can be restored by running the workflow at a previous release branch or reverting a site change.

## Assets and licenses

The non-commercial research demo includes one ARKitScenes capture (47204578), its VSI-Bench video copy, converted camera poses, sampled reference geometry, and agent-produced browser geometry. Original dataset terms remain applicable; these assets are not relicensed under the paper’s CC BY license.

See [sources and licenses](site/credits.html), [ARKitScenes license](site/licenses/ARKitScenes-LICENSE.txt), [Three.js license](site/vendor/THREE-LICENSE.txt), and [Lobe Icons license](site/logos/LICENSE). Brand marks identify evaluated models, without endorsement.
