---
layout: page
title: Profiling WebGPU
menubar_toc: true
---

## Introduction

Realtime graphics have always been interested in pushing the highest performance levels possible for your device. And even though most people don't immediately associate the web with "high performance", WebGPU is really no different. The API has been designed to allow higher performance in more scenarios than WebGL, making use of many of the patterns of the modern native APIs.

But achiving high performance, no matter what your development environment, is almost impossibly without also having way to accurately observe the performance of your code. WebGPU is no different, but it runs into the unfortunate reality of existing in a stange in-between space of running in a browser but not behaving like most browser-based APIs, while also using many of the same facilities of games and other graphically intense apps while using a significantly different architecture from than those applications traditionally employ. This can make it difficulty to easily profile the performance of your WebGPU code running in a browser.

> Note: This document will focus on using various tools to observe what browser-based WebGPU is doing under the hood. The techniques presented will probably not apply to apps using native WebGPU implementations like [Dawn](https://dawn.googlesource.com/dawn) and [wgpu](https://wgpu.rs/) directly.
>
> Additionally, the profiling techniques shown here are largely going to be Chrome-centric because that's the browser I work on, but I would love to add similar steps for other browsers if anyone wants to reach out and help provide the steps to do so!

## GPU-side profiling

The other side of the performance coin is GPU profiling. That is: measuring how much time your GPU is spending completing the work you give it. The nature of GPU APIs is that they can kick off massive amounts of work with only a few commands, and it doesn't do too much good to see that we only spent 2ms sending those instructions to the GPU if we can't also get a reasonable picture of how much time the GPU spends fullfilling them.

For that we typically need to turn to a different set of specialized tools.

### Timestamp queries

The first tool at our disposal when profiling WebGPU's GPU performance is [timestamp queries](https://gpuweb.github.io/gpuweb/#timestamp). Timestamp queries are an optional feature of WebGPU which may not be avaiable on all browsers or devices, but when they are they can provide good insight into the performance of some operations.

// TODO: Talk more about how they're used.

You can see a simple demonstration of timestamp queries in action in the [Compute Boids sample](https://webgpu.github.io/webgpu-samples/samples/computeBoids)

Timestamp queries, as they're currently exposed, have some significant limitations. They can only measure the being and end times of a compute or render pass, for one. This means that you have no way of measuring time spent on non-pass operations like copies or resource creation, and you have no mechanism for measuring the time spent on subsets of operations within a pass. So while the values they provide can be insightful and it's certainly convenient to be able to query them as part of the application itself without external tools, you'll probably find yourself wanting a deeper picture of your apps performance sooner or later.

### [PIX](./pix)

Microsoft's PIX tool supports D3D11 and D3D12 captures on Windows.


### RenderDoc is unsupported 🥺

RenderDoc is a very popular, open source GPU debugging tool for Vulkan, D3D, and OpenGL. Unfortunately, it appears that the developer has had bad experiences in the past with request for support attaching to Chrome and thus their take is that [debugging Chrome with RenderDoc is "explicitly not endorsed or supported"](https://github.com/baldurk/renderdoc/issues/2030#issuecomment-682434299)

My initial attempts to use RenderDoc with Chrome despite that have been unsucessful nevertheless. While [there is some code in RenderDoc to detect Chrome](https://github.com/baldurk/renderdoc/blob/aeaa2811f6afd411b260e740dce6208de4118e13/renderdoc/core/core.cpp#L316) it appears to only suppress crash handling, and so I don't think it's explicitly blocked, it just happens to be difficult to attach to for the same reasons as described with PIX.

If you have any experience debugging Chrome with RenderDoc that you can share please reach out and I'll publish it here for higher visibility!


