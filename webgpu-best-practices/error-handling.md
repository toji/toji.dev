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

// TODO: EXPLAIN!

## Setting Debug Labels

One of the most powerful tools WebGPU gives you for debugging is the ability to
give every object you create a label. This can be done at creation time as part
of the descriptor.

```js
let device = await adapter.requestDevice({
  label: 'Primary Device'
});

let playerVertices = device.createBuffer({
  label: 'Player Vertices',
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

WebGPU implementations will make use of the labels that you provide when reporting error messages to help you identify the problem faster. There's no specific formatting rules around how they should be incorporated, so each implementation will do it a little differently. We'll use error messages returned from Chrome to demonstrate here, but you should get comprable results from most browsers that implement WebGPU.

Let's look at an example snippet of WebGPU code that has an error in it:

```js
// Create a vertex buffer
const vertexData = new Float32Array([
  0, 1, 1,
  -1, -1, 1,
  1, -1,
]);
const vertexBuffer = device.createBuffer({
  size: vertexData.byteLength,
  usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(vertexBuffer, 0, vertexData);

// Draw
const commandEncoder = device.createCommandEncoder();
const passEncoder = commandEncoder.beginRenderPass(/*...*/);
passEncoder.setPipeline(pipeline);
passEncoder.setVertexBuffer(0, vertexBuffer);
passEncoder.draw(3);
passEncoder.end();

device.queue.submit([commandEncoder.finish()]);
```

Upon running the above code the browser will respond with an error message like the following, either in an enclosing error scope, the unhandled error event, or (if neither of those are present) the browser console.

```
⚠️[Buffer] usage (BufferUsage::(CopyDst|Index)) doesn't include BufferUsage::Vertex.
    - While encoding [RenderPassEncoder].SetVertexBuffer(0, [Buffer], 0).
```

This alone can help you spot the error! It points out that you're using a buffer as a vertex buffer that doesn't have the `VERTEX` usage. If you application is small enough that might be all you need to find and fix the problem.

But many WebGPU applications will be complex enough that simply saying "A buffer has the wrong usage" will be pretty ambiguous. You may have hundreds of buffers! Which one did it mean?

That's where labels come in! If you change the above buffer and render pass declarations to:

```diff
const vertexBuffer = device.createBuffer({
+ label: 'Player Vertices',
  size: vertexData.byteLength,
  usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
});

const passEncoder = commandEncoder.beginRenderPass({
+ label: 'Primary Render Pass'
  /*...*/
});
```

The error message you get back will now look like:

```
⚠️[Buffer "Player Vertices"] usage (BufferUsage::(CopyDst|Index)) doesn't include BufferUsage::Vertex.
    - While encoding [RenderPassEncoder "Primary Render Pass"].SetVertexBuffer(0, [Buffer "Player Vertices"], 0).
```

Because the message now includes _which_ buffer was lacking the correct usage it's much easier for you to locate it and fix the issue. And if your application contained multiple render passes being able to differentiate the failing one can also be a big help while debugging.

## Debug Groups

In some cases even labeling every object may not give you the context you need. In order to help you identify what part of your code a particular error message was generated by, WebGPU also gives you the ability to set Debug Groups. A Debug Group works somewhat like an Error Scope, in that you push and pop them onto a stack, but their sole purpose is to be included in error messages to give you a better sense of where the problem occured. For example:

```js
const commandEncoder = device.createCommandEncoder();
commandEncoder.pushDebugGroup('Main Game Loop');

  const computePass = commandEncoder.beginComputePass({/*...*/});
  computePass.pushDebugGroup('Update Skinning');
    updateSkinning(computePass);
  computePass.popDebugGroup();
  computePass.end();

  const renderPass = commandEncoder.beginRenderPass({/*...*/});
  renderPass.pushDebugGroup('Primary Render Pass');
    renderPass.pushDebugGroup('Render Player');
      renderPlayer(renderPass);
    renderPass.popDebugGroup();

    renderPass.pushDebugGroup('Render Environment');
      renderEnvironment(renderPass);
    renderPass.popDebugGroup();
  renderPass.popDebugGroup();
  renderPass.end();

commandEncoder.popDebugGroup();
device.queue.submit([commandEncoder.finish()]);
```

This code snippet is using debug groups to effectively label the different parts of the command encoder that it's building. If an error occurs while encoding these commands the message will now look something like this:

```
⚠️[Buffer "Player Vertices"] usage (BufferUsage::(CopyDst|Index)) doesn't include BufferUsage::Vertex.
    - While encoding [RenderPassEncoder "Primary Render Pass"].SetVertexBuffer(0, [Buffer "Player Vertices"], 0).

    Debug group stack:
    > "Render Player"
    > "Primary Render Pass"
    > "Main Game Loop"
```

Which tells you pretty clearly that the error happened somewhere in the `renderPlayer()` function.

You can see that debug labels can be set across Command Encoders, Compute Pass Encoders, and Render Pass Encoders. They can go as many levels deep as you want as long as you have a balanced number of `push` and `pop` calls for each encoder. So this isn't valid:

```js
const commandEncoder = device.createCommandEncoder();

const computePass = commandEncoder.beginComputePass({/*...*/});
computePass.pushDebugGroup('Update Skinning');
  updateSkinning(computePass);
computePass.end(); // ERROR! Didn't pop the "Update Skinning" group before ending the pass!

commandEncoder.popDebugGroup(); // ERROR! Didn't push any Debug Groups in commandEncoder.
device.queue.submit([commandEncoder.finish()]);
```

Like labels, setting debug groups is pretty lightweight (assuming you don't go TOO crazy with them). As a result, developers are encouraged to use them as a standard part of their applications and not strip them out prior to release. That way any errors that your users encounter in the wild will have as much information as possible to help your debugging efforts!

## Debug Labels and Groups in native tools

One final thing to note about debug labels and groups is that D3D12, Metal, and Vulkan all have similar mechanisms. This means that WebGPU implementations can pass these values along to the underlying native APIs that they operate on top of. As a result, when using native GPU debugging tools such as [PIX](https://devblogs.microsoft.com/pix/) or [RenderDoc](https://renderdoc.org/) those tools will also be able to make use of the labels and groups that you set!

Fair warning: using such tools with a browser is tricky. The WebGPU data that they capture is likely to be mixed in with rendering commands for the rest of the page and the browser UI, and since WebGPU is not a 1:1 mapping of any of the native APIs the commands you issue to the GPU may be translated in unexpected ways. But having well labeled resources in your WebGPU app can make it much easier to find the corresponding native commands!
