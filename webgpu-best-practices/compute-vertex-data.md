---
layout: page
title: Using WebGPU Compute Shaders with Vertex Data
menubar_toc: true
---

## Introduction

WebGPU compute shaders are powerful tools for doing highly parallel work on large data sets. In order to achive that performance, however, they have multiple restrictions on how the shaders can input and output data. In many cases it's not too difficult to package the data in such a way that it's compatible with those rules, but in cases where you can't control the format of the data coming in you'll need to find creative workarounds. One common scenario where you'll frequently run into mismatches between the structure of the input data and the requirements of compute shaders is when working with vertex data.

This doc is focused on walking through several typical examples of manipulating vertex data in a compute shader and patterns that can be used to overcome some the the restrictions that can make it difficult. (The patterns presented are not exclusive to working with vertex data, it just happens to be a good real-world illustration of the issues that you may encounter.

## Vertex Data Overview

First, lets start with a brief primer on how WebGPU uses vertex data for rendering. Feel free to skip this part if you're already solidly familiar with the concepts, or check out a resource like [WebGPU Fundamentals](https://webgpufundamentals.org/webgpu/lessons/webgpu-vertex-buffers.html) if you want a more in-depth review.

For the purposes of this doc, **"Vertex data"** is the information that is fed into shaders when you call one of the `draw*()` commands during a render pass from the `GPUBuffer`s that you specify with `setVertexBuffer()`. This data is supplied to the shader as a set of per-vertex (or per-instance) attributes like position, normal, texture coordinates, color, etc.

Since `GPUBuffer`s are just blobs of binary data, the structure of the attributes within the vertex buffers has to be explicitly defined. This is given when creating a `GPURenderPipeline` like so:

```js
// An extremly simplistic vertex shader for demonstration purposes.
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

This describes a vertex layout where data is split across two buffers. In the first buffer, position and texture coordinate data are "interleaved", with the position data (`shaderLocation`) for each vertex is 3 floats (`format`), starting 0 bytes (`offset`) into the buffer. Similarly the texture coordinate data is 2 floats and starts 12 bytes into the buffer, which would put it immediately after the position data (3 floats * 4 bytes per float = 12 bytes). We also specify that the data for each vertex is 20 bytes apart, which means that the 5 floats that make up the position and texture coordinate data are tightly packed.

If we were to illustrate it as an array of floats it would look like this:

```js
new Float32Array([p.x, p.y, p.z, t.u, t.v, p.x, p.y, p.z, t.u, t.v, /* ... and so on */]);
```

The second buffer contains just the normal data, staring at byte 0 of the buffer and containing 3 floats a piece. In this case we specified an array stride of 16, which means that the data isn't tightly packed, and would look something like this.

```js
new Float32Array([n.x, n.y, n.z, 0, n.x, n.y, n.z, 0, /* ... and so on */]);
```

Conveniently, we don't have to worry about the exact layout of the data when we're writing our vertex shader, as long as the `@location()` attributes line up with the `shaderLocation` values in the render pipeline definition the hardware will work out the rest. And as long as the attributes match one of the defined [vertex formats](https://gpuweb.github.io/gpuweb/#enumdef-gpuvertexformat) the data can be packed in a fairly flexible manner.

That flexibility is convenient when it comes to rendering work, but can become quite difficult to deal with should you try to manipulate that same data with a compute shader.

## Compute shader vertex manipluation basics

Let's start with a fairly trivial task: Assume that the normal data from our example above is inverted for some reason, and we want to fix it in a compute shader. That's something you can fix pretty easily at render time in the vertex shader, but it serves as a convenient illustration of how the process would work.

The shader that does the inversion is pretty simple:

```rs
// normalInvertSrc

@group(0) @binding(0) var<storage, read_write> normals: array<vec3f>;

struct VertexUniforms {
  count: u32,
};
@group(0) @binding(1) var<uniform> vertex: VertexUniforms;

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

While we won't discuss it in-depth, invoking the compute shader from JavaScript would look something like this:

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
      resource: { buffer: normalBuffer },
    }, {
      binding: 1,
      resource: { buffer: uniformBuffer },
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

### Alignment problems

The above compute shader works well, but ONLY if the normal buffer has a stride of 16 as our previous example showed. Why? Because WGSL (and the underlying languages it compiles down to) has [strict rules about data alignment](https://gpuweb.github.io/gpuweb/wgsl/#alignment-and-size) in structures and arrays. One of those rules is that `vec3`s of 32 bit values must be aligned to 16 byte offsets. Since three 32 bit values only take up 12 bytes, it's a fairly unusual thing to have an array of them that are spaced 16 bytes apart. It's much more common to see such values tightly packed at 12 byte intervals or interleaved with other values (like another `vec3`) with a stride that's not a multiple of 16.

If the normals in the buffer were tightly packed, the above code would still run but it would read and write the values incorrectly. Specifically if your normal buffer contained the following values:

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

One way is to ensure all of the data in your buffers fits WGSLs alignment restrictions, but that's difficult to ensure if you're reading the vertex data from an external source (like a glTF model). It also can waste memory with unnecessary padding. Fortunately there's an alternative.

### Use arrays of scalars instead of vectors

As convenient as vector types are to work with in our shaders, these alignment issues make them unsuitable for reading and writing more flexibly formatted data. Instead, we can use arrays of scalar values as our input/output arrays and construct vectors with them manually to do the operations with. For example, we can update our previous normal inversion shader to the following:

```rs
// normalInvertSrc

// Note that this is no longer an array of vec3fs!
@group(0) @binding(0) var<storage, read_write> normals: array<f32>;

struct VertexUniforms {
  count: u32,
  normalStride: u32, // NEW: Number of *floats* between each normal value
};
@group(0) @binding(1) var<uniform> vertex: VertexUniforms;

// Get the normal vector at the given index
fn getNormal(index: u32) -> vec3f {
  let offset = index * vertex.normalStride;
  return vec3f(normals[offset],
               normals[offset + 1],
               normals[offset + 2]);
}

// Set the normal vector at the given index
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

You can see here how we're reconstructing vectors from the array of floats using the `getNormal` and `setNormal` functions manually indexing into the array for each component. This requires us to pass in a new piece of information: the `normalStride`. This allows us to read the vectors regardless of if they're tightly packed or interleaved with other data. Here it's most convenient for us to provide the stride in terms of array elements (floats), not bytes like we do when creating a render pipeline, so you'd want to do the division at the point that you're populating the uniform buffer.

```js
function updateUniforms(vertexCount, normalStrideInBytes) {
  uniformArray[0] = vertexCount;
  uniformArray[1] = normalStrideInBytes / Float32Array.BYTES_PER_ELEMENT; // NEW

  device.queue.writeBuffer(uniformBuffer, 0, uniformArray);
}
```

But what if the stride isn't evenly divisible by the size of a float (4 bytes)? Well then you've got bigger problems on your hands, because WebGPU [requires vertex buffer strides to be a multiple of 4](https://gpuweb.github.io/gpuweb/#dictdef-gpuvertexbufferlayout:~:text=descriptor.arrayStride%20is%20a%20multiple%20of%204.). So if you find that you have vertex data formatted that way you're going to be forced to reformat it before rendering anyway, and that's beyond the scope of this document.

### Pass buffer offsets as uniforms

Stride isn't the only thing that defines how the values in a vertex buffer are packed, though. As we saw in the render pipeline creation code above, we also need to provide the offset into the buffer that the attribute starts at.

One tempting option for handling the buffer offsets is to supply them during bind group creation time. After all, there _is_ an [`offset`](https://gpuweb.github.io/gpuweb/#dom-gpubufferbinding-offset) property in the buffer binding options. Unfortunately that won't work for the majority of vertex data manipulation uses because the offset is required to be a multiple of the [`minStorageBufferOffsetAlignment` limit](https://gpuweb.github.io/gpuweb/#dom-supported-limits-minstoragebufferoffsetalignment) which is 256 by default. Since the vast majority of attribute offsets will be smaller than that we can't rely on it here.

The solution is simply pass the offset in as a uniform and factor it into our manual indexing, just like the stride.

```rs
// Parial normalInvertSrc

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

