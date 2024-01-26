---
layout: page
title: Profiling WebGPU
menubar_toc: true
---

> WARNING: THIS PAGE IS A WORK IN PROGRESS. NOT ALL LINKS ARE COMPLETE.

## Introduction

Realtime graphics have always been interested in pushing the highest performance levels possible for your device. And even though most people don't immediately associate the web with "high performance", WebGPU is really no different. The API has been designed to allow higher performance in more scenarios than WebGL, making use of many of the patterns of the modern native APIs.

But achiving high performance, no matter what your development environment, is almost impossibly without also having way to accurately observe the performance of your code. WebGPU is no different, but it runs into the unfortunate reality of existing in a stange in-between space of running in a browser but not behaving like most browser-based APIs, while also using many of the same facilities of games and other graphically intense apps while using a significantly different architecture from than those applications traditionally employ. This can make it difficulty to easily profile the performance of your WebGPU code running in a browser.

> Note: This document will focus on using various tools to observe what browser-based WebGPU is doing under the hood. The techniques presented will probably not apply to apps using native WebGPU implementations like [Dawn](https://dawn.googlesource.com/dawn) and [wgpu](https://wgpu.rs/) directly.
>
> Additionally, the profiling techniques shown here are largely going to be Chrome-centric because that's the browser I work on, but I would love to add similar steps for other browsers if anyone wants to reach out and help provide the steps to do so!

## CPU-side profiling

While we are using a GPU API, it's worth noting that your first stop when monitoring performance should be to ensure the _CPU_ side of things is running smoothly. After all, if you are trying to run your rendering at 60 frames per second but you're spending 30ms in JavaScript to submit the commands for each frame then you're simply never going to hit your target no matter how fast your GPU is!

### [Chrome Devtools and Perfetto](./chrome-devtools)

Chrome's built in dev tools are great for monitoring JavaScript performance, while the Perfetto tracing tool offers more insight into what's happening internally.

## GPU profiling

The other side of the performance coin is GPU profiling. That is: measuring how much time your GPU is spending completing the work you give it. The nature of GPU APIs is that they can kick off massive amounts of work with only a few commands, and it doesn't do too much good to see that we only spent 2ms sending those instructions to the GPU if we can't also get a reasonable picture of how much time the GPU spends fullfilling them.

For that we typically need to turn to a different set of specialized tools:

### [Timestamp queries](./timestamp-queries)

WebGPU's built-in timestamp queries can provide pass-level GPU timings.

### [PIX](./pix)

Microsoft's PIX tool supports D3D11 and D3D12 captures on Windows for more detailed timing and debugging.

### XCode Metal Debugger

[Coming Soon]

### RenderDoc is unsupported 🥺

RenderDoc is a popular open source GPU debugging tool for Vulkan, D3D, and OpenGL. Unfortunately, it appears that the developer has had bad experiences in the past with request for Chrome support stated that [debugging Chrome with RenderDoc is "explicitly not endorsed or supported"](https://github.com/baldurk/renderdoc/issues/2030#issuecomment-682434299)

While [there is some code in RenderDoc to detect Chrome](https://github.com/baldurk/renderdoc/blob/aeaa2811f6afd411b260e740dce6208de4118e13/renderdoc/core/core.cpp#L316) it appears to only suppress crash handling, and so I don't think it's explicitly blocked, it just happens to be difficult to attach to due to architectural reasons. My initial attempts to use RenderDoc with Chrome have been unsucessful nevertheless.

If you have any experience debugging Chrome with RenderDoc that you can share please reach out and I'll publish it here for higher visibility!


