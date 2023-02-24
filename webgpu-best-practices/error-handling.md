---
layout: page
title: WebGPU Error Handling best practices
menubar_toc: true
---

## Introduction

One of the challenges of working with any graphics API is that under the hood they tend to be very asynchronous in nature. The work you send to the GPU isn't completed the moment you call draw or dispatch, but instead is queued up to happen in the near future, once previously scheduled work is complete and the resources your work needs have been flagged as ready. And once your work is done there's even more synchronization that needs to happen before the results can be observed by your application. It's a lot to keep track of, though fortunately WebGPU does most of the heavy lifting for you when it comes to keeping things in sync.

This all happens in a different thread or even different process than the one that's running your JavaScript. That's great for performance, but one unfortunate side effect is that it's extremely difficult for browsers to clearly link any errors that may occur while performing GPU work to the JavaScript calls that ultimately caused those errors. Unlike typical exceptions, you won't be able to pause execution on the offending function and get a nice callstack and inspect variable state at your lesiure. Instead you'll usually get an error message that shows up in the console that has no associated line number.

Given the complex nature of GPU APIs, errors are _going_ to happen during development, so how do you handle them effectively in an environment like that?

## Error Scopes

Error scopes are the primary way for your application to intercept and respond to errors.

## Setting Debug Labels

One of the most powerful tools WebGPU gives you for debugging is the ability to
give every object you create a label. This can be done at creation time as part
of the descriptor.

```js
let device = await adapter.requestDevice({
  label: 'PrimaryDevice'
});

let playerVertices = device.createBuffer({
  label: 'Player Verts',
  size: PLAYER_MESH_VERTEX_SIZE,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
});

let playerTexture = device.createTexture({
  label: 'Player Texture',
  size: [1024, 1024],
  format: 'rgba8unorm',
  usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
});
```

The label can also be retrieved and changed after object creation with the
`.label` attribute:

```js
function recycleTexture(texture, newLabel) {
  console.log(`Recycling ${texture.label} texture as ${newLabel}.`);
  texture.label = newLabel;

  // Update texture data...
}
```

Labels are never required, but can be assigned to every object type in WebGPU: Devices, Pipelines, Shader Modules, Bind Groups, Layouts, etc. Setting a label has very little overhead, and should be done even for release versions of your app. They are allowed to be any string you want, the API does not attempt to interpret them for semantic meaning. The label's only job is to help you, the developer, recognize what object is being referred to.

Once a label is set it makes it easy to identify objects when stepping through code with a debugger or logging messages to the console. Those use cases alone would be enough to justify giving your objects labels, but they could have been accomplished without explicit API support. What makes WebGPU labels special is that they will help you identify problems at a much deeper level.

## Debug Labels in error messages



## Debug Groups



## Debug Groups in error messages



## Debug Labels and Groups in native tools