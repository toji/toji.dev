---
layout: page
title: Using WebGPU Compute Shaders with Vertex Data
date: 2024-02-27
menubar_toc: true
comments: true
---

## Introduction

WebGPU compute shaders are powerful tools for doing highly parallel work on large data sets. In order to achieve that performance, however, they have multiple restrictions on how the shaders can input and output data. In many cases it's not too difficult to package the data in such a way that it's compatible with those rules, but in cases where you can't control the format of the data coming in you'll need to find creative workarounds. One common scenario where you'll frequently run into mismatches between the structure of the input data and the requirements of a compute shader is when working with **vertex data**.

This doc is focused on walking through several typical examples of manipulating vertex data in a compute shader and patterns that can be used to overcome some the the restrictions that can make it difficult. The patterns presented are not exclusive to working with vertex data, it just happens to be a good real-world illustration of the issues that you may encounter.

## Vertex Data Overview

First, let's start with a brief primer on how WebGPU uses vertex data for rendering. Feel free to skip this part if you're already solidly familiar with the concepts, or check out a resource like [WebGPU Fundamentals](https://webgpufundamentals.org/webgpu/lessons/webgpu-vertex-buffers.html) if you want a more in-depth review.

For the purposes of this doc, **"Vertex data"** is the information that is fed into shaders when you call one of the `draw*()` commands during a render pass from the `GPUBuffer`s that you specify with `setVertexBuffer()`. This data is supplied to the shader as a set of per-vertex (or per-instance) attributes like position, normal, texture coordinates, color, etc.

Since `GPUBuffer`s are just blobs of binary data, the structure of the attributes within the vertex buffers has to be explicitly defined. This is given when creating a `GPURenderPipeline` like so:

```js
// An extremely simplistic vertex shader for demonstration purposes.
const shaderSrc = `
  struct VertexData {
    @location(0) position: vec3f,
    @location(1) texcoord: vec2f,
    @location(2) normal: vec3f,
  };

  @vertex
  fn vertexMain(vertex : VertexData) -> @builtin(position) position : vec4f {
    return vec4f(vertex.position, 1);
  }
`
const pipeline = device.createRenderPipeline({
  vertex: {
    module: device.createShaderModule({ code: shaderSrc }),
    entryPoint: 'vertexMain',

    buffers: [{
      // Buffer 0
      arrayStride: 20,
      attributes: [{
        shaderLocation: 0, // position
        format: 'float32x3'
        offset: 0,
      }, {
        shaderLocation: 1, // texcoord
        format: 'float32x2'
        offset: 12,
      }]
    }, {
      // Buffer 1
      arrayStride: 16,
      attributes: [{
        shaderLocation: 2 // normal
        offset: 0,
        format: 'float32x3'
      }]
    }]
  }
  // Other properties omitted for brevity.
});
```

This describes a vertex layout where data is split across two buffers. In the first buffer, position and texture coordinate data are "interleaved". The position data for each vertex is 3 floats (`format`), which starts 0 bytes (`offset`) into the buffer. Similarly the texture coordinate data is 2 floats and starts 12 bytes into the buffer, which would put it immediately after the position data (3 floats * 4 bytes per float = 12 bytes). We also specify that the data for each vertex is 20 bytes apart, which means that the 5 floats that make up the position and texture coordinate data for each vertex are tightly packed.

If we were to illustrate it as an array of floats it would look like this:

```js
new Float32Array([p.x, p.y, p.z, t.u, t.v, p.x, p.y, p.z, t.u, t.v, /* ... and so on */]);
```

The second buffer contains just the normal data, staring at byte 0 of the buffer and containing 3 floats each. In this case we specified an array stride of 16, which means that the data isn't tightly packed, and has 4 unused bytes (1 float worth) between every normal values. It would look something like this.

```js
new Float32Array([n.x, n.y, n.z, 0, n.x, n.y, n.z, 0, /* ... and so on */]);
```

Conveniently, we don't have to worry about the exact layout of the data when we're writing our WGSL vertex shader. As long as the `@location()` attributes line up with the `shaderLocation` values in the render pipeline definition the hardware will work out the rest. And as long as the attributes match one of the defined [vertex formats](https://gpuweb.github.io/gpuweb/#enumdef-gpuvertexformat) the data can be packed in a fairly flexible manner.

That flexibility is convenient when it comes to rendering work, but can become quite difficult to deal with should you try to manipulate that same data with a compute shader.

## Compute shader vertex manipulation basics

Let's start with a fairly trivial task: Assume that the normal data from our example above is inverted for some reason, and we want to fix it in a compute shader. That's something you can fix pretty easily at render time in the vertex shader, but it serves as a convenient illustration of how the process would work.

The shader that does the inversion is pretty simple:

```rs
// normalInvertSrc

struct VertexUniforms {
  count: u32,
};
@group(0) @binding(0) var<uniform> vertex: VertexUniforms;

// Warning! This array declaration may not behave the way you expect!
@group(0) @binding(1) var<storage, read_write> normals: array<vec3f>;

@compute @workgroup_size(64)
fn invertNormals(@builtin(global_invocation_id) globalId : vec3u) {
  let index = globalId.x;
  // Return early if the vertex index is higher than the vertex count
  if (index >= vertex.count) { return; }

  // Invert the normal in-place
  normals[index] = normals[index] * -1.0;
}
```

Here we can see that we are passing the `normals` data in as a storage array of `vec3f`s with read/write access. (This requires that the `GPUBuffer` be created with the `GPUBufferUsage.STORAGE` in addition to the usual `GPUBufferUsage.VERTEX`.) Storage buffers are the only way a compute shader can output data, and are usually the most practical way to access large amounts of input data.

We also will want to provide the number of vertices that should be processed, with the `vertex.count` uniform. This is because work dispatched to a compute shader is typically done in workgroup sizes that may not be an exact multiple of the data we're operating on for the sake of making better use of the GPU hardware. Here we've chosen a `@workgroup_size` of 64, which is a good all-around size to pick if you don't have a compelling reason to use something more specific. By comparing the number of vertices we're operating on to the `global_invocation_id` builtin we can determine when we've finished processing all of the vertices and let the remaining shader invocations exit early.

Finally, the operation itself is really simple: We read in the normal vector, multiply it by -1, and save the result back out to the same location in the normal array.

<details markdown=block>
  <summary markdown=span><b>Click here to see how to invoke this shader in JavaScript</b></summary>
  For the sake of brevity I'm not going to provide accompanying JavaScript code for every shader snippet in this doc, but for the sake of reference, here's roughly what the WebGPU calls necessary to dispatch the above shader would look like:

  ```js
  // One time initialization of the pipeline and uniform buffer
  const pipeline = device.createComputePipeline({
    label: 'Normal Inversion Pipeline',
    layout: 'auto',
    compute: {
      module: device.createShaderModule({ code: normalInvertSrc }),
      entryPoint: 'invertNormals',
    }
  });

  const uniformBuffer = device.createBuffer({
    label: 'Normal Inversion Uniform Buffer',
    size: 16, // Minimum uniform buffer size
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  const uniformArray = new Uint32Array(uniformBuffer.size / Uint32Array.BYTES_PER_ELEMENT);

  function updateUniforms(vertexCount) {
    // Write the vertex count into the uniform buffer
    uniformArray[0] = vertexCount;

    device.queue.writeBuffer(uniformBuffer, 0, uniformArray);
  }

  function invertNormals(normalBuffer, vertexCount) {
    updateUniforms(vertexCount);

    // Create a bind group with the normal buffer and uniform buffer
    const bindGroup = device.createBindGroup({
      label: 'Normal Inversion Bind Group',
      layout: pipeline.getBindGroupLayout(0),
      entries: [{
        binding: 0,
        resource: { buffer: uniformBuffer },
      }, {
        binding: 1,
        resource: { buffer: normalBuffer },
      }]
    });

    // Encode a compute pass that executes the compute shader.
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);

    // Dispatch the necessary number of workgroups.
    // Note that we divide the vertex count by the workgroup_size!
    pass.dispatchWorkgroups(Math.ceil(vertexCount / 64));

    pass.end();
    device.queue.submit([ encoder.finish() ]);
  }
  ```
</details><br/>

### Alignment problems

The above compute shader works well, but ONLY if the normal buffer has an `arrayStride` of 16 as our previous example showed. Why? Because WGSL (and the underlying languages it compiles down to) has [strict rules about data alignment](https://gpuweb.github.io/gpuweb/wgsl/#alignment-and-size) in structures and arrays. One of those rules is that `vec3`s of 32 bit values _must_ be aligned to 16 byte offsets. Since three 32 bit values only take up 12 bytes, it's a fairly unusual thing to have an array of them that are spaced 16 bytes apart. It's much more common to see such values tightly packed at 12 byte intervals or interleaved with other values that don't add up to a multiple of 16 bytes either. (Like our position and texture coordinate buffer above, which had a stride of 20 bytes.)

If the normals in the buffer were tightly packed, the above code would still _run_ but it would read and write the values incorrectly. Specifically if your normal buffer contained the following values:

```js
new Float32Array([0, 1, 2, // normal 0
                  3, 4, 5, // normal 1
                  6, 7, 8, // etc...
                  9, 10, 11,
                  12, 13, 14]);
```

They would be read by the compute shader as:

```rs
normals[0] = vec3f(0, 1, 2);
normals[1] = vec3f(4, 5, 6);
normals[2] = vec3f(8, 9, 10);
normals[3] = vec3f(12, 13, 14);
```

Note how every 4th value is missing, and the data quickly gets out of alignment. So how do we solve this?

One way is to ensure all of the data in your buffers fits WGSLs alignment restrictions. If you're generating meshes dynamically and you know that you'll be manipulating the values in a compute shader, it can be worth your time to structure the values in a way that allows them to be cleanly exposed to WGSL. Similarly, if you have the opportunity to pre-process model files beforehand to make the data layout more compute-friendly it's best to do that offline.

But it's difficult to ensure a specific data layout if you're reading the vertex data from an external source (like a glTF model) that you don't control. Similarly, if you are building middleware you can't generally control the data that will be fed to your library. Formatting data for easy compute shader consumption can also waste memory with unnecessary padding. Fortunately, if any of those are a concern for you, there's an alternative.

### Use arrays of scalars instead of vectors

As convenient as vector types are to work with in our shaders, these alignment issues make them unsuitable for reading and writing more flexibly formatted data. Instead, we can use arrays of scalar values as our input/output arrays and construct vectors with them manually to do the operations with. For example, we can update our previous normal inversion shader to the following:

```rs
// normalInvertSrc

struct VertexUniforms {
  count: u32,
  normalStride: u32, // NEW: Number of *floats* between each normal value
};
@group(0) @binding(0) var<uniform> vertex: VertexUniforms;

// UPDATED: Note that this is no longer an array of vec3fs!
@group(0) @binding(1) var<storage, read_write> normals: array<f32>;

// NEW: Get the normal vector at the given index
fn getNormal(index: u32) -> vec3f {
  let offset = index * vertex.normalStride;
  return vec3f(normals[offset],
               normals[offset + 1],
               normals[offset + 2]);
}

// NEW: Set the normal vector at the given index
fn setNormal(index: u32, value: vec3f) {
  let offset = index * vertex.normalStride;
  normals[offset] = value.x;
  normals[offset + 1] = value.y;
  normals[offset + 2] = value.z;
}

@compute @workgroup_size(64)
fn invertNormals(@builtin(global_invocation_id) globalId : vec3u) {
  let index = globalId.x;
  if (index >= vertex.count) { return; }

  // Invert the normal in-place
  let invNormal = getNormal(index) * -1.0;
  setNormal(index, invNormal);
}
```

You can see here how we're reconstructing vectors from the array of floats using the `getNormal()` and `setNormal()` functions, which manually index into the array for each component. This requires us to pass in a new piece of information: the `normalStride`. Knowing the stride between vectors allows us to read the them regardless of if they're tightly packed or interleaved with other data. Here it's most convenient for us to provide the stride in terms of array elements (floats), not bytes like we do when creating a render pipeline. You'd want to do the division at the point that you're populating the uniform buffer.

```js
function updateUniforms(vertexCount, normalStrideInBytes) {
  uniformArray[0] = vertexCount;
  uniformArray[1] = normalStrideInBytes / Float32Array.BYTES_PER_ELEMENT; // NEW

  device.queue.writeBuffer(uniformBuffer, 0, uniformArray);
}
```

But what if the stride isn't evenly divisible by the size of a float (4 bytes)? Well then you've got bigger problems on your hands, because WebGPU [requires vertex buffer strides to be a multiple of 4](https://gpuweb.github.io/gpuweb/#dictdef-gpuvertexbufferlayout:~:text=descriptor.arrayStride%20is%20a%20multiple%20of%204.). So if you find that you have vertex data formatted that way you're going to be forced to reformat it before rendering anyway, and that's beyond the scope of this document.

### Pass buffer offsets as uniforms

Stride isn't the only thing that defines how the values in a vertex buffer are stored, though. As we saw in the render pipeline creation code above, we also need to provide the offset into the buffer that the attribute starts at.

One tempting option for handling the buffer offsets is to supply them during bind group creation time. After all, there _is_ an [`offset`](https://gpuweb.github.io/gpuweb/#dom-gpubufferbinding-offset) property in the buffer binding options. Unfortunately that won't work for the majority of vertex data manipulation uses because the offset is required to be a multiple of the [`minStorageBufferOffsetAlignment` limit](https://gpuweb.github.io/gpuweb/#dom-supported-limits-minstoragebufferoffsetalignment) which is 256 by default. Since the vast majority of attribute offsets will be smaller than that we can't rely on it here.

The solution is to simply pass the offset in as a uniform and factor it into our manual indexing, just like the stride.

```rs
// Partial normalInvertSrc

struct VertexUniforms {
  count: u32,
  normalStride: u32,
  normalOffset: u32, // NEW: Number of *floats* into the array where normal data starts.
};
@group(0) @binding(1) var<uniform> vertex: VertexUniforms;

// Get the normal vector at the given index
fn getNormal(index: u32) -> vec3f {
  // UPDATED: account for the normal offset
  let offset = index * vertex.normalStride + vertex.normalOffset;
  return vec3f(normals[offset],
               normals[offset + 1],
               normals[offset + 2]);
}

// Set the normal vector at the given index
fn setNormal(index: u32, value: vec3f) {
  // UPDATED: account for the normal offset
  let offset = index * vertex.normalStride + vertex.normalOffset;
  normals[offset] = value.x;
  normals[offset + 1] = value.y;
  normals[offset + 2] = value.z;
}
```

And again, it's more convenient to pre-divide the byte offset by 4 when populating the uniform buffer:

```js
function updateUniforms(vertexCount, normalStrideInBytes, normalOffsetInBytes) {
  uniformArray[0] = vertexCount;
  uniformArray[1] = normalStrideInBytes / Float32Array.BYTES_PER_ELEMENT;
  uniformArray[2] = normalOffsetInBytes / Float32Array.BYTES_PER_ELEMENT; // NEW

  device.queue.writeBuffer(uniformBuffer, 0, uniformArray);
}
```

Finally, just like the stride needed to be a multiple of 4, WebGPU render pipelines also requires vertex buffer offsets to be a multiple of at least 4 (for floating point values, anyway), so if your vertex data can be rendered with WebGPU you can rest assured that it'll work here too.

## A more complex example: Compute skinning

As mentioned before, the example of inverting a normal isn't particularly realistic, because it's something that can be trivially done in a vertex shader. So let's take a look at use case that has more real-world application. Compute-based skinning is a solid example.

Skinning, where the vertices of a mesh are transformed to move with an underlying skeleton, is a technique that's been around for a while. Originally it was done on the CPU until vertex shaders become capable enough to handle it at draw time on the GPU. But these days many games opt to do their skinning in a compute shaders prior to rendering rather than at draw time. This has several advantages:
 - If the skeleton isn't animating then the skinned mesh doesn't need to be recomputed every frame.
 - Similarly, it allows skinning to happen at a rate that's disconnected from that of the draw loop, which can be useful for reducing the resources used by objects in the distance.
 - If any multi-pass effects are used the skinning computations don't need to be repeated for each pass.
 - It allows the mesh to be rendered as if it were a static object, potentially reducing the number of pipelines variations needed in the core draw loop.

The biggest downside is that since the skinned mesh values are written to a separate buffer than the unskinned values (because it would make skinning subsequent frames impractical otherwise) this technique does use more GPU memory. It's often a worthwhile tradeoff, though!

So let's look at how to apply the above techniques to a more complex example like compute skinning, and address any additional complications we encounter along the way.

### Vertex shader skinning

To start, we'll look at an example of how skinning would work in a vertex shader as a point of reference.

```rs
// Example vertex skinning shader

struct VertexInput {
  @location(0) position : vec3f,
  @location(1) texcoord : vec2f,
  @location(2) normal : vec3f,
  @location(3) joints : vec4u,
  @location(3) weights : vec4f,
};

struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(0) texcoord : vec2f,
  @location(1) normal : vec3f,
};

@group(0) @binding(0) var<storage> inverseBindMatrices : array<mat4x4f>;
@group(0) @binding(1) var<storage> skinMatrices : array<mat4x4f>;
@group(0) @binding(2) var<uniform> viewProjectionMatrix : array<mat4x4f>;

// To perform skinning, we have to generate a skin matrix to transform the vertex with.
fn getSkinMatrix(joints: vec4u, weights: vec4f) -> mat4x4f {
  // It's fairly common for a skinned mesh to assign up to four joints to each vertex. The joints
  // are given as indices into two arrays of matrices. First is the associated skin matrix, which
  // represents the current animated pose, and second is a "inverse bind matrix", which negates the
  // joint's initial position so that only the delta from the meshes initial pose to the current
  // pose is applied. We multiply those together for each joint to get the transform that joint
  // would apply.
  let joint0 = skinMatrices[input.joints.x] * inverseBindMatrices[input.joints.x];
  let joint1 = skinMatrices[input.joints.y] * inverseBindMatrices[input.joints.y];
  let joint2 = skinMatrices[input.joints.z] * inverseBindMatrices[input.joints.z];
  let joint3 = skinMatrices[input.joints.w] * inverseBindMatrices[input.joints.w];

  // The vertex will assign each joint a weight, determining how much that joint affects the vertex.
  // The total of all the weights should add up to 1.0. This allows the "skeleton" to affect the
  // mesh more realistically. We multiply each joint's transform by the corresponding weight to get
  // the final skinned transform for this vertex.
  return joint0 * input.weights.x +
         joint1 * input.weights.y +
         joint2 * input.weights.z +
         joint3 * input.weights.w;
}

@vertex
fn skinnedVertexMain(input : VertexInput) -> VertexOutput {
  let skinMatrix = getSkinMatrix(input.joints, input.weights);

  var output : VertexOutput;

  // Both the position and the normal need to be multiplied by the skin matrix.
  // The position also needs to be multiplied by the view/projection matrix to display correctly.
  output.position = viewProjectionMatrix * skinMatrix * vec4f(input.position, 1);
  output.normal = (skinMatrix * vec4f(input.normal, 0).xyz;

  // Texture coordinates aren't modified by skinning, so they get passed straight through.
  output.texcoord = input.texcoord;

  return output;
}
```

This shader is somewhat simplified from what you'd typically see in a real vertex shader, but it covers the all of the basic parts that we're concerned about. Specifically, we can see how the `joints` and `weights` vertex attributes are used to generate a transform for that vertex, which is then selectively applied to certain other attributes, like the position and normal. (We're leaving out things like tangents, but they would be affected by the skin too, while attributes like texture coordinates and color aren't.)

### Translating into a compute shader

If we were to take that logic and convert it into a compute shader using the patterns discussed earlier, it would look something like this:

```rs
// Example vertex skinning shader

// Vertex input values
struct VertexUniforms {
  count: u32,
  positionStride: u32,
  positionOffset: u32,
  normalStride: u32,
  normalOffset: u32,
  jointStride: u32,
  jointOffset: u32,
  weightStride: u32,
  weightOffset: u32,
};
@group(0) @binding(0) var<uniform> vertex: VertexUniforms;

@group(0) @binding(0) var<storage> positions: array<f32>;
@group(0) @binding(1) var<storage> normals: array<f32>;
@group(0) @binding(2) var<storage> joints: array<u32>;
@group(0) @binding(3) var<storage> weights: array<f32>;

// Helper functions to read the attributes from the arrays
fn getPosition(index: u32) -> vec3f {
  let offset = index * vertex.positionStride + vertex.positionOffset;
  return vec3f(positions[offset],
               positions[offset + 1],
               positions[offset + 2]);
}

fn getNormal(index: u32) -> vec3f {
  let offset = index * vertex.normalStride + vertex.normalOffset;
  return vec3f(normals[offset],
               normals[offset + 1],
               normals[offset + 2]);
}

fn getJoints(index: u32) -> vec4u {
  let offset = index * vertex.jointStride + vertex.jointOffset;
  return vec4u(joints[offset],
               joints[offset + 1],
               joints[offset + 2],
               joints[offset + 3]);
}

fn getWeights(index: u32) -> vec4f {
  let offset = index * vertex.weightStride + vertex.weightOffset;
  return vec4f(weights[offset],
               weights[offset + 1],
               weights[offset + 2],
               weights[offset + 3]);
}

// Vertex output values
struct VertexOutput {
  position : vec3f,
  normal : vec3f,
};
@group(0) @binding(4) var<storage, read_write> outVerts: array<VertexOutput>;

// Skinning data
@group(1) @binding(0) var<storage> inverseBindMatrices : array<mat4x4f>;
@group(1) @binding(1) var<storage> skinMatrices : array<mat4x4f>;

// This function is identical to the vertex shader version!
fn getSkinMatrix(joints: vec4u, weights: vec4f) -> mat4x4f {
  let joint0 = skinMatrices[input.joints.x] * inverseBindMatrices[input.joints.x];
  let joint1 = skinMatrices[input.joints.y] * inverseBindMatrices[input.joints.y];
  let joint2 = skinMatrices[input.joints.z] * inverseBindMatrices[input.joints.z];
  let joint3 = skinMatrices[input.joints.w] * inverseBindMatrices[input.joints.w];

  return joint0 * input.weights.x +
         joint1 * input.weights.y +
         joint2 * input.weights.z +
         joint3 * input.weights.w;
}

@compute @workgroup_size(64)
fn skinnedComputeMain(input : VertexInput) -> VertexOutput {
  let index = globalId.x;
  if (index >= vertex.count) { return; }

  let position = getPosition(index);
  let normal = getNormal(index);

  let skinMatrix = getSkinMatrix(getJoints(index), getWeights(index));

  outVerts[index].position = (skinMatrix * vec4f(position, 1)).xyz;
  outVerts[index].normal = (skinMatrix * vec4f(normal, 0)).xyz;
}
```

A few things that are worth taking notice of here: First is that it's more code than the vertex shader version, unfortunately, but that's only because we have to manually do a lot of the vertex data lookups that a render pipeline would typically be handling for us. The actual functions that get the data (`getPosition()`, etc) are really straightforward and it's just annoyingly repetitive. Fortunately we only have to pass data for the attributes affected by skinning here and can ignore unskinned attributes, like texture coordinates, entirely. There's no point in duplicating that data when it will stay the same for every instance of the mesh, no matter what pose it's in.

Next, while we can't use a struct for the input here due to the data alignment issues we discussed above, we CAN reliably use one for the vertex data output, as we show here with the `VertexOutput` struct and `outVerts` array. That's because there's no reason to try and keep the exact same vertex layout as the inputs. Using this technique you'll no longer need to pass things like the joints and weights to the vertex shader anyway, so you might as well structure the vertex data in a way that's convenient for you to output to.

That said, the same data alignment issues still apply, and so the above code will waste 8 bytes per vertex by padding both the position and the normal with an extra float. If you want to avoid that and save on memory you'll need to use the same type of pattern as the inputs to push values into an array of scalar floats.

### What if the inputs _aren't_ 32 bit values?

Something that's been ignored up till now is the fact that sometimes vertex data isn't provided as 32 bit values, which causes a problem for WGSL because at the moment it only has 32 bit primitives. For example: If your skinned mesh data happens to come from a glTF file, then [it will contain either 8 bit or 16 bit joint indices](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#skins:~:text=JOINTS_n%3A%20unsigned%20byte%20or%20unsigned%20short), but never 32 bit! In a vertex shader you could simply specify the type as `"uint8x4"` or `"uint16x4"` and it would handle everything for you, but you have no such conversion available for a compute shader. What can be done in those cases?

The answer, unfortunately, is that you're going to end up unpacking the values yourself. For example, if we were to extend our shader above to support 8 and 16 bit joint indices, we'd need to add more variants of `getJoints()` along the lines of the following:

```rs
// NOTE: The joints array will still be passed as an array<u32>, which means that joint stride and
// offset should still be given in terms of 32 bit elements in all cases!
fn getJoints8(index: u32) -> vec4u {
  let offset = index * vertex.jointStride + vertex.jointOffset;
  let packedJoints = joints[offset];
  return vec4u((packedJoints & 0xFF),
               (packedJoints & 0xFF00) >> 8,
               (packedJoints & 0xFF0000) >> 16,
               (packedJoints & 0xFF000000) >> 24);
}

fn getJoints16(index: u32) -> vec4u {
  let offset = index * vertex.jointStride + vertex.jointOffset;
  let packedJoint0 = joints[offset];
  let packedJoint1 = joints[offset + 1];
  return vec4u((packedJoints0 & 0xFFFF),
               (packedJoints0 & 0xFFFF0000) >> 16,
               (packedJoints1 & 0xFFFF),
               (packedJoints1 & 0xFFFF0000) >> 16);
}
```

You'll want to select which of those joint unpacking methods to use at pipeline creation time. See my [WebGPU Dynamic Shader Construction](./dynamic-shader-construction) article for more details on various ways to approach that.

### Unpacking/packing non-32 bit floats

Extracting 8 or 16 bit integer values from 32 bit integer values is pretty straightforward, as you can see above. If you happen to have floating point values that aren't 32 bit, though, you need to take a different approach. Normally the algorithms for unpacking binary16 (or "half") floats into a 32 bit ones from a `u32` value is [a non-trivial operation](https://en.wikipedia.org/wiki/Half-precision_floating-point_format), and beyond the scope of this document. Fortunately WGSL has some functions to help you out here.

First, there's the [`unpack2x16float()` builtin function](https://gpuweb.github.io/gpuweb/wgsl/#unpack2x16float-builtin). This will take a single `u32` value and return a `vec2f` containing the converted 16-bit floats from either half of the `u32` binary value. The [`pack2x16float()` builtin function](https://gpuweb.github.io/gpuweb/wgsl/#pack2x16float-builtin) is also provided to go the other direction, encoding a `vec2f` as a single `u32` value.

Also, eventually most WebGPU implementations are likely to support the [`"shader-f16"`](https://gpuweb.github.io/gpuweb/#shader-f16) feature, which will allow you to use `array<f16>` directly in your shader.

It's also fairly common to work with normalized values, where the full range of an integer value is interpreted as a floating point value with a 0->1 range. So the value of `255` in an 8 bit unsigned int would be treated as `1.0`, the value of `127` would be treated as `0.5`, etc. This is especially common when dealing with color data. These conversions are more trivial, in that you simply have to bitmask out the packed values and divide by the max value for that type, but WGSL also offers convenience functions to help with these conversions too: [`unpack4x8snorm()`, `unpack4x8unorm()`, `unpack2x16snorm()`, and `unpack2x16unorm()`](https://gpuweb.github.io/gpuweb/wgsl/#unpack-builtin-functions), as well as the inverse [packing functions](https://gpuweb.github.io/gpuweb/wgsl/#pack-builtin-functions).

## Final Example: Normal generation

One last example that's worth looking at is generating normals in a compute shader, specifically because it involves synchronization between shader threads.

To be clear: Normals for a mesh are something you almost always want to be handled by an external tool. They will typically do a much better job of it, and can be tweaked by artists if needs be. Even so, there's still cases where you may need to generate some basic normals at runtime. For example: If you are generating a mesh procedurally. Prior to WebGPU you'd usually handle this as a simple JavaScript loop, which obviously requires that the vertex/index data be available on the CPU. But the algorithm is well suited for a compute shader (with a few caveats).

### Normal generation algorithm

In JavaScript, a simplified function to generate normals would look something like this:

```js
// Generate normals for a mesh.
// This assumes that the geometry is indexed rendered as a triangle list.
// positions are given as a list of some generic Vec3 class.
function generateNormals(positions, vertexCount, indices, indexCount) {
  // Initialize the normals array to a list of zero-length vectors
  const normals = [];
  for (let i = 0; i < vertexCount; ++i) {
    normals.push(new Vec3(0, 0, 0));
  }

  // Step 1: Accumulate face normals per-vertex
  for (let i = 0; i < indexCount; i+=3) {
    // Get the three vertex positions for the triangle
    const p0 = positions[indices[i]];
    const p1 = positions[indices[i+1]];
    const p2 = positions[indices[i+2]];

    // Get vectors for the triangle edges
    const edge0 = p1.subtract(p0);
    const edge1 = p2.subtract(p0);

    // The cross product of the edge vectors is the normal of the triangle face
    const faceNormal = edge0.cross(edge1).normalize();

    // Add the face normal to each of the vertex normals
    normals[indices[i]] = normals[indices[i]].add(faceNormal);
    normals[indices[i+1]] = normals[indices[i+1]].add(faceNormal);
    normals[indices[i+2]] = normals[indices[i+2]].add(faceNormal);
  }

  // Step 2: Normalize the accumulated normals.
  for (let i = 0; i < vertexCount; ++i) {
    normals[i] = normals[i].normalize();
  }

  return normals;
}
```

The most important part of the code to understand for our purposes is that it does one pass to accumulate all of the face normals into the vertex normals, and then another pass to normalize those accumulated values. It can do this easily because it's just doing linear loops over the data in a single thread.

### Converting to compute shaders

Let's put together a first pass at an equivalent compute shader. It's going to use the same patters we used above for the vector inputs/outputs. It's also going to be done in two different dispatches: One that accumulates all the face normals, and then another that normalizes all the accumulated values.

```rs
// Naive normal generation shader
// NOTE: THIS VERSION HAS BUGS! DON'T USE IT AS IS!

struct InputUniforms {
  // All offsets are given in elements, not bytes.
  vertexCount: u32,
  positionOffset: u32,
  positionStride: u32,
  indexCount: u32,
  indexOffset: u32, // No need for an index stride, they're always tightly packed.
};

@group(0) @binding(0) var<uniform> input: InputUniforms;
@group(0) @binding(1) var<storage> positions: array<f32>;
@group(0) @binding(2) var<storage> indices: array<u32>;

@group(0) @binding(3) var<storage, read_write> normals: array<vec3f>;

fn getPosition(index: u32) -> vec3f {
  let offset = index * input.positionStride + input.positionOffset;
  return vec3f(positions[offset],
               positions[offset + 1],
               positions[offset + 2]);
}

// Step 1: Accumulate face normals per-vertex
@compute @workgroup_size(64)
fn accumulateNormals(@builtin(global_invocation_id) globalId : vec3u) {
  let face = globalId.x;
  let i = face*3;
  if (i >= input.indexCount) { return; }

  let index0 = indices[i+indexOffset];
  let index1 = indices[i+1+indexOffset];
  let index1 = indices[i+2+indexOffset];

  // Get the three vertex positions for the triangle
  let p0 = getPosition(index0);
  let p1 = getPosition(index1);
  let p2 = getPosition(index2);

  // Get vectors for the triangle edges
  let edge0 = p1 - p0;
  let edge1 = p2 - p0;

  // The cross product of the edge vectors is the normal of the triangle face
  let faceNormal = normalize(cross(pEdge0, pEdge1));

  // Add the face normal to each of the vertex normals
  // (Hint: This isn't gonna work...)
  normals[index0] += faceNormal;
  normals[index1] += faceNormal;
  normals[index2] += faceNormal;
}

// Step 2: Normalize the accumulated normals.
@compute @workgroup_size(64)
fn normalizeNormals(@builtin(global_invocation_id) globalId : vec3u) {
  let i = globalId.x;
  if (i >= input.vertexCount) { return; }

  normals[i] = normalize(normals[i]);
}
```

It's a pretty straightforward analog for the JavaScript version of the same code, modulo the necessary changes for reading in the positions and, of course, removal of the loops. Because shaders, by their very nature, loop through large data sets performing the same operations on each element. And crucially, they do it in a massively parallel fashion.

Turns out, that causes a problem for us. While it's ideal for the shader to be operating on lots of data in parallel, that means that we might (read: almost certainly will) have multiple threads all attempting to add a face normal to the same vertex normal at the same time. This is a classic threading problem, and if you don't take steps to synchronize those operations somehow, you're going to have a Bad Time™️.

### Synchronizing data access with atomics

Fortunately WGSL provides us with [Atomic types and functions](https://gpuweb.github.io/gpuweb/wgsl/#atomic-builtin-functions)! These operations ensure that only one shader thread is allowed to update or read a specific bit of information at a time, which is exactly what we need in this case to stop all those normal accumulations from accidentally stomping on each other. _Unfortunately_ the only types that are allowed to be atomic are scalar `i32` and `u32` values. Which isn't particularly helpful when we definitely want our normals to be vectors of floating point values.

The way that we solve this is to quantize the floating point value into an `i32`, effectively representing it as a fixed point precision value during the accumulation stage. This allows us to expose the normal values as atomics and use operations like [`atomicAdd()`](https://gpuweb.github.io/gpuweb/wgsl/#atomic-rmw) on the individual components.

Worth noting that because atomics can't be vectors, however, we need to fall back to some of the same patterns for writing/reconstructing vectors from flat arrays as we use elsewhere.

```rs
// Synchronized normal generation shader

struct InputUniforms {
  // All offsets are given in elements, not bytes.
  vertexCount: u32,
  positionOffset: u32,
  positionStride: u32,
  indexCount: u32,
  indexOffset: u32, // No need for an index stride, they're always tightly packed.
};

@group(0) @binding(0) var<uniform> input: InputUniforms;
@group(0) @binding(1) var<storage> positions: array<f32>;
@group(0) @binding(2) var<storage> indices: array<u32>;

// UPDATED: Output is now i32 and atomic
@group(0) @binding(3) var<storage, read_write> quantized_normals: array<atomic<i32>>;

// NEW: Utility function to convert and add a vec3f to the quantized normal array
const QUANTIZE_FACTOR = 32768.0;
fn addToOutput(index: u32, value: vec3f) {
  // Converts the floating point vector to a quantized signed integer vector
  let quantizedValue = vec3i(value * QUANTIZE_FACTOR);
  // Add each vector component to the atomic array individually.
  atomicAdd(&quantized_normals[index*3], quantizedValue.x);
  atomicAdd(&quantized_normals[index*3+1], quantizedValue.y);
  atomicAdd(&quantized_normals[index*3+2], quantizedValue.z);
}

fn getPosition(index: u32) -> vec3f {
  let offset = index * input.positionStride + input.positionOffset;
  return vec3f(positions[offset],
               positions[offset + 1],
               positions[offset + 2]);
}

// Step 1: Accumulate face normals per-vertex
@compute @workgroup_size(64)
fn accumulateNormals(@builtin(global_invocation_id) globalId : vec3u) {
  let face = globalId.x;
  let i = face*3;
  if (i >= input.indexCount) { return; }

  let index0 = indices[i+indexOffset];
  let index1 = indices[i+1+indexOffset];
  let index1 = indices[i+2+indexOffset];

  // Get the three vertex positions for the triangle
  let p0 = getPosition(index0);
  let p1 = getPosition(index1);
  let p2 = getPosition(index2);

  // Get vectors for the triangle edges
  let edge0 = p1 - p0;
  let edge1 = p2 - p0;

  // The cross product of the edge vectors is the normal of the triangle face
  let faceNormal = normalize(cross(pEdge0, pEdge1));

  // UPDATED: Add the face normal to each of the vertex normals
  addToOutput(index0, faceNormal);
  addToOutput(index1, faceNormal);
  addToOutput(index2, faceNormal);
}
```

By keeping the atomic logic to a utility function we can keep the shader pretty close in form to our first pass. The quantization of the value is a simple multiply, and we swap out some `+=`s for `atomicAdd()`s, but otherwise it's recognizable as the same logic.

### Dequantizing and normalizing the results

I pulled the entry point for the second step out of the shader above because for the normalization pass we're operating on each vector in isolation and no longer need to worry about synchronizing access between them. As a result we don't need the storage array to be atomic any more. (It _can_ be, but then you'd need to read every value with `atomicLoad()` and that's slower.)

Note that both of these shaders would use the same buffer for the quantized data. In fact you could even use the same bind group for both shaders. The concept of `atomic` values only applies within the WGSL shader itself, and doesn't require any changes to the buffer, bind group layouts, or any other WebGPU calls.

```rs
@group(0) @binding(0) var<uniform> vertexCount: u32;

@group(0) @binding(3) var<storage> quantized_normals: array<i32>;
@group(0) @binding(4) var<storage, read_write> normals: array<vec3f>;

const DEQUANTIIZE_FACTOR = 1.0 / 32768.0;
fn getNormal(index: u32) -> vec3f {
  // Loads the quantized normal values into a vector and dequantizes them.
  return vec3f(f32(quantized_normals[index*3]),
               f32(quantized_normals[index*3+1]),
               f32(quantized_normals[index*3+2])) * DEQUANTIIZE_FACTOR;
}

// Step 2: Normalize the accumulated normals.
@compute @workgroup_size(64)
fn normalizeNormals(@builtin(global_invocation_id) globalId : vec3u) {
  let i = globalId.x;
  if (i >= vertexCount) { return; }

  normals[i] = normalize(getNormal(i));
}
```

You can see that this is really just the reverse of the quantization and destructuring of the normal vectors that was done in the prior shader. We fetch the individual values out of the storage buffer, pack them into a `vec3f`, and multiply by the inverse of the quantization value to get the final, accumulated normal. It's then normalized and written out to the destination buffer, when it can then presumably be used as a vertex attribute accompanying the original buffer with the positions in it.

## Have fun, and make cool stuff!

That's a quick look at some of the patterns that can be used when working with vertex data in compute shaders, though as mentioned earlier they apply to any input data that doesn't perfectly fit with compute shaders data alignment rules.

Compute shaders unlock so many interesting possibilities for WebGPU, both for graphical uses and beyond, so it's a little unfortunate that they can require this type of jumping through hoops to coerce them into working with your data, but it's a manageable task and the performance benefits can be immense!

Good luck on whatever projects are ahead of you, I can't wait to see what the spectacularly creative web community builds!