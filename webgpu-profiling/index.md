---
layout: page
title: Profiling WebGPU
menubar_toc: true
---

## Introduction

Realtime graphics have always been interested in pushing the highest performance levels possible for your device. And even though most people don't immediately associate the web with "high performance", WebGPU is really no different. The API has been designed to allow higher performance in more scenarios than WebGL, making use of many of the patterns of the modern native APIs.

But achiving high performance, no matter what your development environment, is almost impossibly without also having way to accurately observe the performance of your code. WebGPU is no different, but it runs into the unfortunate reality of existing in a stange in-between space of running in a browser but not behaving like most browser-based APIs, while also using many of the same facilities of games and other graphically intense apps while using a significantly different architecture from than those applications traditionally employ. This can make it difficulty to easily profile the performance of your WebGPU code running in a browser. These guides should at least help you get started, though.

> Note: This document will focus on using various tools to observe what browser-based WebGPU is doing under the hood. The techniques presented will probably not apply to apps using native WebGPU implementations like [Dawn](https://dawn.googlesource.com/dawn) and [wgpu](https://wgpu.rs/) directly.

## GPU profiling Tools

### [PIX](./pix)

Microsoft's PIX tool supports D3D11 and D3D12 captures on Windows for more detailed timing and debugging.

### [Xcode Metal Debugger](./xcode)

Apple's Xcode IDE supports Metal captures on MacOS for more detailed timing and debugging.

### [RenderDoc](./renderdoc)

RenderDoc is a popular open source GPU debugging tool for Vulkan, D3D, and OpenGL. At the moment it has limited support for capturing WebGPU content with Chrome on Windows + D3D12.
