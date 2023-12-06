---
layout: page
title: WebGPU Best Practices
---

I've written multiple articles that describe best practices for working with various aspects of the WebGPU API.

It should be noted that these pages are NOT a tutorial for getting started with WebGPU, and instead are focused on the
most effective patterns for working with specific parts of the API, especially if you are a developer that's familiar
with WebGL or one of the native APIs. If you're interested in learning WebGPU, check out the following resources first
(and be sure to come back when you've figured out the basics!)

 - [WebGPU Fundamentals](https://webgpufundamentals.org/) - In-depth walkthroughs of WebGPU concepts with live examples/visualizations
 - [Raw WebGPU](https://alain.xyz/blog/raw-webgpu) - A beautifully presented tutorial
 - [WebGPU: All the cores, none of the canvas](https://surma.dev/things/webgpu/) - A tutorial focused on using compute shaders
 - [WebGPU Samples](https://webgpu.github.io/webgpu-samples/) - Good for those that learn by example
 - [MDN documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API) - Comprehensive API documentation
 - [WebGPU Spec](https://gpuweb.github.io/gpuweb/) - Heavy reading, but a good reference
 - [WGSL Spec](https://gpuweb.github.io/gpuweb/wgsl) - Companion to the WebGPU spec, detailing its shading language

## Best Practices

 - [WebGPU &lt;img&gt;, &lt;canvas&gt;, and &lt;video&gt; texture best practices](./img-textures) - Covers loading textures from images, canvases, and video elements.
 - [WebGPU buffer upload best practices](./buffer-uploads) - Covers pushing data to any type of WebGPU buffer.
 - [WebGPU Bind Group best practices](./bind-groups) - Explains why bind groups are structured the way they are and how to make the best use of them.
 - [WebGPU dynamic shader construction](./dynamic-shader-construction) - Covers patterns for compensating for WGSLs lack of preprocessor statements when building out shader variants.
 - [WebGPU error handling](./error-handling) - Covers different mechanisms for handling errors and improving debugging in WebGPU apps.
 - [Using WebGPU Compute Shaders with Vertex Data](./compute-vertex-data) - Covers patters for working with alignment restrictions to manipulate vertex data (or similarly structured values) in compute shaders.
 - [WebGPU Render Bundle best practices](./render-bundles) - Covers usage of Render Bundles to reduce CPU overhead and how they can accomodate a variety of rendering needs.
 - [WebGPU/WebGL performance comparison best practices](./webgl-performance-comparison) - Covers considerations when comparing the performance of WebGPU and WebGL variants of the same content.

I've also written a much, much longer article about efficiently displaying glTF files in WebGPU. It's not necessarily a "best practices" doc, but it contains many useful WebGPU tips and patterns nonetheless, as well as working samples!
 - [Efficently rendering glTF models: A WebGPU case study ](https://toji.github.io/webgpu-gltf-case-study/)
