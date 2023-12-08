---
layout: page
title: WebGPU/WebGL performance comparison best practices
menubar_toc: true
---

## Introduction

If you are developing a WebGPU variant of an existing WebGL application it's natural to want to benchmark the two to determine either where performance needs to be improved or how much faster one is relative the other. There's several easy-to-miss differences between how WebGL and WebGPU behave, though, that can lead to an innacurate comparisons if not taken into account.

This doc covers some simple considerations to take into account when comparing WebGPU and WebGL pages to ensure that you're getting the most accurate, "apples-to-apples" picture of their performance.

## Context and adapter creation

The first step for any WebGPU or WebGL-based page is going to be to get an adapter or context, respectively. It's common for pages to use the defaults for these call:

```js
// Request the default settings for both APIs (bad for performance comparisons!)

// WebGPU
const adapter = await navigator.gpu.requestAdapter();

// WebGL
const gl = canvas.getContext('webgl');
```

Oops! You've already opened the door to an invalid comparison!

### Ensure both APIs use the same GPU

The primary issue with the above code is that in both cases it allows the underlying browers to determine which GPU will be used for the subsequent API calls. If you are on a device with only one GPU that's not a problem, but many laptops have both an integrated and discrete GPU, and they frequently have significantly different performance! Furthermore, the internal logic the browser uses to choose a GPU can be different for each API. For example, Chrome will default to selecting a low-powered GPU for WebGPU if it detects that your laptop is on battery power, and a high-powered GPU if it detects that you're plugged in. The same logic doesn't exist for WebGL, which instead prefers to default to the GPU that is currently being used by Chrome's compositor.

This can lead to situations where, for example, the WebGPU page can select the much more powerful discrete GPU while WebGL gets kicked to the integrated GPU. Unsurprisingly, the WebGPU content is likely to perform much better in this scenario! But that doesn't indicate much about the API being used or the quality of your code calling it. Instead you're mostly measuring the difference in performance between two different pieces of hardware, which probably wasn't your goal.

To mitigate this, you should provide hints to the API about which GPU should be preferred during initialization. In both APIs this is done by specifying a `powerPreference` of either `'high-performance'` or `'low-power'`.

```js
// Request a high-performance GPU for both APIs.

// WebGPU
const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });

// WebGL
const gl = canvas.getContext('webgl', { powerPreference: 'high-performance' });
```

This dramatically increases your chances of getting the same GPU for both APIs! But it should be noted that this is merely a (fairly strong) hint. It's possible that flags provided to the browser, graphics driver utilities, or other external factors could still override this.

### GPU verification

That's why if you are doing performance comparisons it's best to confirm that both APIs are using the same device by logging the GPU information they report to the page or console.

```js
// Log basic GPU identification to the console

// WebGPU
const adapterInfo = await adapter.requestAdapterInfo();
console.log(`WebGPU vendor: ${adapterInfo.vendor}, architecture: ${adapterInfo.architecture}`);
// Outputs something like "vendor: intel, architecture: gen-12lp"

// WebGL
const ext = gl.getExtension('WEBGL_debug_renderer_info');
const vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
console.log(`WebGL vendor: ${vendor}, renderer: ${renderer}`);
// Outputs something like "vendor: Google Inc. (Intel), renderer: ANGLE (Intel, Mesa Intel(R) Graphics (ADL GT2), OpenGL ES 3.2)"
```

It's important to note that the strings given by both of these APIs are not directly comparable! The WebGPU strings are likely to (intentionally) be more terse and higher level. Your best bet is to visually inspect them and gauge whether or not you think they refer to the same device. At the very least if they both show a different vendor then you can be sure that they're not using the same device!

In Chrome you can increase the details returned in the adapter info by navigating to about:flags and enabling the "WebGPU Developer Features" flag. This will provide more complete strings from the driver that can make it easier to compare. You shouldn't expect that flag to be set on user's devices, though, so don't write apps that depend on it.

## Canvas configuration

Once you've ensured you're comparing with the same GPU, the next thing to pay attention to is the defaults for your canvas configuration. This is an area where WebGL and WebGPU differ significantly in their approaches, with WebGL creating and managing a default framebuffer for you which silently handles your color buffer, depth buffer, antialising resolution, and more. WebGPU, on the other hand, leaves the responsibility for much of that in your hands.

This means it's easy to accidentally have your WebGL framebuffer performing more work than your realized.

### Antialiasing

In WebGL, if you don't explicitly specify otherwise the default framebuffer will be antialiased. In contrast, the textures provided by a WebGPU canvas context are always single sampled.

```js
// Canvas setup (bad for performance comparisons!)

// WebGPU - Single sampled
const context = canvas.getContext('webgpu');
context.configure({
    device: device,
    format: 'bgra8unorm'
});

// WebGL - Multisampled
const gl = canvas.getContext('webgl', { powerPreference: 'high-performance' })
```

In order to perform antialiasing in WebGPU you have to explicitly create multisampled color and depth textures, bind them as render pass targets, and bind the canvas' current texture as the color resolve target. If you are already doing this work then great! You can leave the WebGL default in place. Otherwise you should explicitly disable antialiasing on the WebGL context to ensure that it doesn't need to do additional rasterization work compared to WebGPU.

```js
// WebGL - Single sampled (matches WebGPU default)
const gl = canvas.getContext('webgl', {
    powerPreference: 'high-performance',
    antialias: false,
});
```

### Preferred Color Format

WebGL handles many aspects of the default framebuffer opaquely, and that includes choosing an optimal format for the device. WebGPU, on the other hand, requires you to select a texture format for the canvas-provided textures. The WebGPU spec guarantees that both `'bgra8unorm'` and `'rgba8unorm'` will work on any device, but every device also has a "preferred format", which can be queried by calling `navigator.gpu.getPreferredCanvasFormat()`. This is the format you should always use when comparing performance between WebGL and WebGPU (or, really, any time you're using WebGPU)!

```js
// WebGPU - Explicitly use the preferred format
const context = canvas.getContext('webgpu');
context.configure({
    device: device,
    format: navigator.gpu.getPreferredCanvasFormat(),
});

// WebGL - Preferred format implicitly selected
const gl = canvas.getContext('webgl', {
    powerPreference: 'high-performance',
    antialias: false,
});
```

The consequence of not using the preferred format is that on some systems (for Chrome it's Android and Mac specifically) an extra texture copy will be needed before the rendered image can be displayed on the page. This eats into your available fillrate and can result in lower performance relative to WebGL.

### Use equivalent depth/stencil settings

WebGL contexts are created with a depth buffer but no stencil buffer by default, controlled using the `depth` and `stencil` booleans during context creation. WebGPU does not automatically handle creation of depth/stencil textures for you, but instead requires you to create one manually and provide it to the [`GPUDepthStencilAttachment`](https://gpuweb.github.io/gpuweb/#depth-stencil-attachments) when beginning a render pass.

Whether or not your application needs a depth or stencil buffer is app-specific, but if your app doesn't require them ensure that you explicitly set `depth` and/or `stencil` to false when creating the WebGL context.

```js
// WebGL - Create a context without a depth/stencil buffer
const gl = canvas.getContext('webgl', {
    powerPreference: 'high-performance',
    antialias: false,
    depth: false,
    stencil: false,
});
```

Conversely, if a depth/stencil buffer is used in WebGL ensure that you are passing an equivalent WebGPU depth/stencil texture to the appropriate render passes.

Unfortunately the [WebGL spec is unclear on exactly what format of depth/stencil buffer will be allocated](https://registry.khronos.org/webgl/specs/latest/1.0/#WEBGLCONTEXTATTRIBUTES), it merely says that any depth buffer will be at least 16 bits and any stencil buffer will be at least 8 bits.  You can query the exact precision by calling `gl.getParamter(gl.DEPTH_BITS)` and `gl.getParamter(gl.STENCIL_BITS)`. In Chrome, at least, this is very likely to be a [ `GL_DEPTH24_STENCIL8_OES`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/platform/graphics/gpu/drawing_buffer.cc;drc=8ee9326b165ffd2d2575df34b054b435f0253871;l=1320) renderbuffer (even if stencil wasn't explicitly requested, as a compatibility workaround.)

The equivalent [WebGPU depth/stencil format](https://gpuweb.github.io/gpuweb/#depth-formats) would be a `'depth24plus-stencil8'` texture, though you can use a `'depth24plus'` texture if no stencil is required and `'stencil8'` if no depth is required.

Regardless of the format used, don't enable depth or stencil operations in your WebGPU render passes if the WebGL context does not explicitly enable the same.

### Alpha Blending

Both WebGL and WebGPU have the option of specifying that the canvas be alpha-blended with the rest of the page, which can have some performance implications. The defaults for each API are different, though. In WebGPU the default behavior, specified through the `alphaMode` [canvas configuration option](https://gpuweb.github.io/gpuweb/#canvas-configuration), is `'opaque'`, which does no blending with the page but _might_ incur an extra step to clear the alpha channel on some platforms. In WebGL the default behavior is to do premultiplied alpha blending with the page, which is specified through a combination of the `alpha` and `premultiplied` booleans during context creation.

Whether you use alpha blending for the canvas or not is up to your application, but it should be explicitly stated for both APIs to ensure equivalent workloads.

```js
// For alpha blended canvases:

// WebGPU
const context = canvas.getContext('webgpu');
context.configure({
    device: device,
    format: navigator.gpu.getPreferredCanvasFormat(),
    alpha: 'premultiplied',
});

// WebGL
const gl = canvas.getContext('webgl', {
    powerPreference: 'high-performance',
    antialias: false,
    alpha: true,
    premultiplied: true,
});

// For opaque canvases:

// WebGPU
const context = canvas.getContext('webgpu');
context.configure({
    device: device,
    format: navigator.gpu.getPreferredCanvasFormat(),
    alpha: 'opaque',
});

// WebGL
const gl = canvas.getContext('webgl', {
    powerPreference: 'high-performance',
    antialias: false,
    alpha: false,
    // premultiplied is ignored when alpha is false
});
```

Do not use `{ alpha: true, premultiplied: false }` with WebGL when doing performance comparisons, as there is no equivalent WebGPU canvas blending mode.

### Do not use preserveDrawingBuffer

The `preserveDrawingBuffer` option for WebGL contexts does not have an equivalent mode in WebGPU, and thus should be avoided when doing performance comparisons. It defaults to `false` so as long as you avoid setting it or explicitly set it to `false` you're fine.

If `preserveDrawingBuffer`-like behavior is required for your app to perform correctly it must be emulated in WebGPU by rendering to an intermediate color target without clearing each frame. (Use `loadOp: 'load'` in the render pass [GPURenderPassColorAttachments](https://gpuweb.github.io/gpuweb/#color-attachments)) This texture then need to be manually copied to the canvas' current texture each frame.

## Match resolutions

A surprisingly common issue I've seen as I've looked at a variety of WebGL vs. WebGPU comparisons is not running the content being compared at the same resolution. Sometimes this may be due to a quirk of the page layout: If one version of the page has slightly longer text, for example, it may leave less room for the canvas and thus cause it to render at a reduced resolution. I've also heard of cases where one version of the page takes the `devicePixelRatio` into account while the other doesn't, which could lead to a 2-3x difference in resolution!

Differences in resolution can also lead to differences in aspect ratio for the page's virtual cameras, which can change how much geometry is in frame, further skewing the results.

Something to consider is that the resolution that WebGL and WebGPU render at is independent of the size of the content on the page. The rendered results will always scale up or down to fit into the canvas, even if that results in some image stretching. That's generally OK for performance comparisons, though, so consider setting the canvas to a fixed size for both pages.

```html
<!--
Both WebGL and WebGPU determine the output texture size based on the width
and height attributes of the canvas element, not the CSS-adjusted client size.
Setting them to a static value ensures a fair comparison.
-->
<canvas width='1920' height='1080'></canvas>
```

## General: Ensure equivalent content

Of course, there's bound to be _some_ differences between an otherwise equivalent WebGL and WebGPU app, otherwise why bother porting it? For example, if a WebGPU app moves what was previously CPU work to a compute shader, that will definitely have a performance impact! In general, though, to get the best sense of how those intentional changes have impacted your performance you want to reduce as many other variables as you can.

This means obvious things like using the same resources in both, keeping instance and light counts the same, viewing from the same camera angles, etc. Unless the goal is to show, for example, that the WebGPU app can handle XX% more lights at the same performance. In all cases you want to try to isolate the variable you want to highlight as much as possible from other potential differences.

## Sometimes it's not you

Having said all that, sometimes you may do everything you can to make the workloads equivalent and still find that the WebGPU code is slower than expected. (It's supposed to be the new, fast thing, right?) It's possible you've just hit a poorly optimized path in our implementation! WebGPU, as of this writing, is still relatively new so it's expected that there's some wrinkles that'll show up. And we want to hear about it when you find them! File bugs at [https://crbug.com](https://crbug.com) telling us about the behavior you are seeing. We'll be able to help out best if you can also include live links that demonstrate the problem (and access to the source code behind it is always a huge plus!)

Good luck in your future porting efforts, and thanks for helping make WebGPU even better through your feedback!


