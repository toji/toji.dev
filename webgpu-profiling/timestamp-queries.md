---
layout: page
title: Profiling WebGPU - Timestamp Queries
menubar_toc: true
---

## Timestamp queries

The first tool at your disposal when profiling WebGPU's GPU performance is [timestamp queries](https://gpuweb.github.io/gpuweb/#timestamp). Timestamp queries are an optional feature of WebGPU which may not be avaiable on all browsers or devices, but when they are they can provide good insight into the performance of some operations.

// TODO: Talk more about how they're used.

You can see a simple demonstration of timestamp queries in action in the [Compute Boids sample](https://webgpu.github.io/webgpu-samples/samples/computeBoids)

Timestamp queries, as they're currently exposed, have some significant limitations. They can only measure the being and end times of a compute or render pass, for one. This means that you have no way of measuring time spent on non-pass operations like copies or resource creation, and you have no mechanism for measuring the time spent on subsets of operations within a pass. So while the values they provide can be insightful and it's certainly convenient to be able to query them as part of the application itself without external tools, you'll probably find yourself wanting a deeper picture of your apps performance sooner or later.
