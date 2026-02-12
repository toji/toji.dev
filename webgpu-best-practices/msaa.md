---
layout: page
title: WebGPU Multisampling (MSAA) best practices
date: 2026-02-09
menubar_toc: true
comments: true
---

## Multisampling in WebGPU

Muli-Sampled Anti Aliasing (MSAA, also referred to as simply "multisampling") is an anti-aliasing technique that has been built into all GPU hardware for the last couple of decades, going all the way back to the introduction of the [ARB_multisample](https://registry.khronos.org/OpenGL/extensions/ARB/ARB_multisample.txt) OpenGL extension, introduced in 1999! The details of how it works are beyond the scope of this article, but there and many great resources online, [like this one](https://therealmjp.github.io/posts/msaa-overview/), that do an excellent job of explaining the technique.

In recent years MSAA has fallen out of favor with modern console and PC games in favor of upscaling techniques like [DLSS](https://www.nvidia.com/en-us/geforce/technologies/dlss/) and [FSR](https://www.amd.com/en/products/graphics/technologies/fidelityfx/super-resolution.html). But given that those techniques have yet to be exposed to WebGPU, and the fact that MSAA is ["almost free"](https://medium.com/androiddevelopers/multisampled-anti-aliasing-for-almost-free-on-tile-based-rendering-hardware-21794c479cb9) on mobile devices, MSAA still has a lot to offer when building 3D web content.

This article will cover how to get the most out of using MSAA with your WebGPU content.

## Basic multisampled rendering

There's a few minor differences that need to be taken into account when doing multisampled rendering with WebGPU.

First, when creating render pipelines, the number of samples must be specified.

```js
const msaaRenderPipeline = device.createRenderPipeline({
    label: `Multisampled pipeline`,
    vertex: {/*...*/},
    primitive: {/*...*/}
    depthStencil: {/*...*/},
    
    // This is the important bit!
    multisample: { count: 4, }

    fragment: {/*...*/},
})

```

(While this could in theory take in a variety of sample counts, functionally no browsers support anything other than 4.)

This pipeline can now only be used render to textures that also use 4 samples:

```js
const msaaColorTarget = device.createTexture({
    label: `Multisample Color Texture`,
    format: navigator.gpu.getPreferredCanvasFormat(),
    usage: GPUTextureUsage.RENDER_ATTACHMENT
    sampleCount: 4,
    size: { width: 1024, height: 1024 }
});

const msaaDepthTarget = device.createTexture({
    label: `Multisample Depth Texture`,
    format: `depth24plus`,
    usage: GPUTextureUsage.RENDER_ATTACHMENT
    sampleCount: 4,
    size: { width: 1024, height: 1024 }
});
```

Specifying a `sampleCount` of 4 creates a texture where each pixel is stored in memory as 4 "samples". Basically a texture that's 4x the size, but each group of 4 colors is treated as a single pixel. (And yes, it does take up 4x the memory. We'll talk about that in a bit.)

These textures can then be used as attachments for a render pass. The `sampleCount` of every texture attachment for the pass must match. You can't, for example, have a color target with 4 samples while your depth/stencil target only has 1.

```js
const commandEncoder = device.createCommandEncoder();
const msaaRenderPass = commandEncoder.beginRenderPass({
    label: `Multisample Render Pass`,
    colorTargets: [{
        view: msaaColorTarget.createView(),
        clearValue: [0, 0, 0, 0],
        loadOp: 'clear',
        storeOp: 'store',
    }],
    depthStencilAttachment: {
        view: msaaDepthTarget.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
    }
});

msaaRenderPass.usePipeline(msaaRenderPipeline);
msaaRenderPass.draw(3);

msaaRenderPass.end();
device.queue.submit([commandEncoder.finish()]);
```

This will fill the multisampled textures with the typical color and depth information from your rendering, just with 4 samples per-fragment instead of 1. This by itself isn't very useful, however. Most of the time you want to display the images you are rendering on the screen, and in the browser that means you have to render to the textures provided to you by a `GPUCanvasContext`. Unfortunately for us, you can't have the `GPUCanvasContext` produce multisampled textures!

Instead, you have to "resolve" the multisampled textures into a single sampled image first. To do this first you'll configure the canvas context to produce textures with the same size and format as the multisampled targets:

```js
canvas.width = 1024;
canvas.height = 1024;

const context = canvas.getContext('webgpu');
context.configure({
    format: navigator.gpu.getPreferredCanvasFormat(),
    // Canvas context textures default to a usage of RENDER_ATTACHMENT
});
```

Alternatively you can also resolve to a texture you create normally via `device.createTexture()`, it just won't show up in the canvas.

```js
const colorTexture = context.configure({
    format: navigator.gpu.getPreferredCanvasFormat(),
    usage: GPUTextureUsage.RENDER_ATTACHMENT, // Required to use as a resolve target
    size: { width: 1024, height: 1024 }
    // sampleCount defaults to 1
});
```

Then you provide a texture view for that texture as the `resolve` argument of one of the `colorTargets`.

```js
const outputTexture = context.getCurrentTexture();

const commandEncoder = device.createCommandEncoder();
const msaaRenderPass = commandEncoder.beginRenderPass({
    label: `Multisample Render Pass with Resolve`,
    colorTargets: [{
        view: msaaColorTarget.createView(),
        resolve: outputTexture.createView(),  // <-- This is the new bit!
        clearValue: [0, 0, 0, 0],
        loadOp: 'clear',
        storeOp: 'store`, // Oops! We'll talk about why this isn't good in a bit.
    }],
    depthStencilAttachment: {
        view: msaaDepthTarget.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
    }
});

msaaRenderPass.usePipeline(msaaRenderPipeline);
msaaRenderPass.draw(3);

msaaRenderPass.end();
device.queue.submit([commandEncoder.finish()]);
```

What this does is wait till the end of the render pass, then copies the contents of the multisample `view` texture over to the single sample `resolve` texture. As it does so, it averages the color value of the 4 samples in the multisample texture and writes that averaged value into the single sampled texture. This is what gives the final image it's nice, antialiased appearance!

TODO:

And that's it! Easy, right?

## 
