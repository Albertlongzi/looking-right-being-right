# Looking Right Is Not Being Right

**Evaluating the Geometry of Agent-Built 3D Scenes**

A convincing rendering does not establish an accurate reconstruction. This project studies the geometry of editable 3D scenes built by coding agents: what they recover from video, how they use geometric inputs, and whether their revisions correct geometric errors.

We evaluate scene geometry against laser scans and study geometric feedback that compares saved scenes with the points available to the agent.

## Project resources

- [Hugging Face release repository](https://huggingface.co/datasets/Zylong/looking-right-being-right)
- Paper: arXiv submission in preparation.
- Interactive demo: public deployment in preparation. The local prototype compares Terra, Sol, and Astra on the same room and input video, with camera-synchronized surface reveal.
- Evaluation code and agent harness: release in preparation.

The demo's progressive reveal visualizes the final saved reconstruction using the input camera and occlusion checks; it is not a replay of online reconstruction or actual agent save times.

## Release status

This repository currently contains the project overview. Code, documentation, and downloadable artifacts will be added as they are prepared. Links and availability will be updated here.

The study uses ARKitScenes. Obtain original data from the [official ARKitScenes repository](https://github.com/apple/ARKitScenes) under its applicable terms; this project overview does not redistribute source videos or scans.
