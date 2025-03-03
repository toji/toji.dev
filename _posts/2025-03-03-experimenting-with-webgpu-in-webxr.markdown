---
layout: post
title: Experimenting with WebGPU in WebXR
tags: webxr webgpu
---

For the last few months I've been working on implementing experimental support for WebGPU/WebXR integration in Chrome, and now it's ready for developers to try on Windows and Android!

<!--more-->

To enable Chrome's experimental WebGPU/WebXR integration, navigate to about:flags and enable **both** the "WebXR Projection Layers" and "WebXR/WebGPU Bindings" flags. This should be available in Chrome Canary starting with version 135.0.7047.0.

![WebGPU/WebXR integration flags](/blog/media/webgpu-webxr-flags.png)

To see WebGPU in WebXR in action you can try the new [WebGPU Barebones examples](https://immersive-web.github.io/webxr-samples/webgpu/) on the official WebXR Samples page. These are not particularly complex, they just show a few floating triangles in VR or AR, but they're intended to show the most basic requirements for displaying WebGPU content on an XR device.

![WebGPU/WebXR barebones demo](/blog/media/webgpu-webxr-barebones.gif)

To provide a more complex example, I've also updated my existing [WebGPU Metaballs demo](https://toji.github.io/webgpu-metaballs) to support WebXR. This required [multiple changes to the original code](https://github.com/toji/webgpu-metaballs/commits/main/?since=2024-12-03&until=2024-12-06) and I want to write more about it in the future!

For developers, there isn't a proper spec for the feature yet, but [this explainer](https://github.com/immersive-web/WebXR-WebGPU-Binding/blob/main/explainer.md) runs through the basic usage of the API and has been kept up-to-date. It should be noted that only `XRProjectionLayer` has been implemented at this time.

It's also worth keeping in mind that there are known optimization opportunites in the browser for this feature. There's at least one texture copy happening internally that we'd like to avoid in the future, so performance still have some room to improve. WebGPU bindings with WebXR are not necessarily expected to be an automatic performance win vs. WebGL at this point as a result.

In addition to WebGPU support, we've also added support for WebGL `XRProjectionLayer`s to Chrome. This feature, which has been available in the Quest browser for a while, is the minimal required feature set from the [WebXR Layers API](https://immersive-web.github.io/layers/), which offers a bit more flexibility than the standard [`XRWebGLLayer`](https://immersive-web.github.io/webxr/#xrwebgllayer-interface) that is available in Chrome today. It does _not_ include, however, other layer types such as Quad layers and Cube layers, or multi-layer support. We would still love to enable those features but they will require larger scale changes to Chrome's internals before we can support them.

To test Chrome's WebGL `XRProjectionLayer` support you can try the [Projection Layer Sample](https://immersive-web.github.io/webxr-samples/layers-samples/proj-layer.html) from the official WebXR Samples page. This requires only the "WebXR Projection Layers" flag to be enabled in about:flags.

Both of these features are considered experimental and as such you may encounter unexpected issues while developing with them. Please let us known about any problems you encounter by filing bugs at [https://crbug.com](https://crbug.com)!