---
layout: page
title: WebGPU Particle Systems
subtitle: Particle Lifetime
show_sidebar: false
menubar: particles_menu
toc: true
comments: true
---

<link rel="stylesheet" href="../particles.css">
<script src='../embedded-demos.js'></script>

After the last section we have the ability to do simplistic rendering of a buffer full of particles, as well as move them through a simple, cycilic motion. Our code has a lot of limitations, though.  For example, our particles only reset when they reach a hard-coded boundary. That may be OK for some types of effects like rain but often you want particles to live for a specific amount of time before extinguishing (Think smoke or sparks). Additionally, with our current code we're always rendering every particle every frame, which isn't very flexible. We'd like to have a system where we can emit particles whenever we want, up to some maximum.

In this section we'll investigate how to better control our particle lifetime to enable a wider range of behavior.

## Controlling particle lifetime

At it's most basic, giving particles a fixed lifetime is simply a matter of adding one more variable to our shader struct:

```rs
struct Particle {
  position: vec3f,
  lifetime: f32, // New!
  velocity: vec3f,
  color: vec4f,
}
```

`lifetime` is a scalar value that indicates how much longer the particle has before it resets. It will count down each frame, and reset the particle once it is less than or equal to zero.

We're inserting it after `position` because WGSL alignment rules dictate that there would have been a 4-byte gap between `position` and `velocity` anyway, by virtue of being `vec3f`s. That means that adding a new `f32` value after the `vec3f` doesn't change the struct size! (Similarly, would could add it after `velocity` and get the same behavior.) If we added lifetime after `color` or before `position` the struct size would have changed, and each particle would take an extra 16 bytes of memory. As mentioned earlier, check out the [WebGPU Fundamentals' Offset Computer](https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html) to visualize these types of packing and alignment behaviors.

<a class='demo-link' href='https://toji.github.io/webgpu-particles/4.html'>
  <img src='02-02.png' />
</a>

## Getting the timing right

FIXME

<a class='demo-link' href='https://toji.github.io/webgpu-particles/5.html'>
  <img src='02-03.png' />
</a>

<details markdown=block>
  <summary markdown=span><b>Click here if you want to know why I'm not using the browser's timestamp</b></summary>
  You may have read the above section and wondered why I'm not simply using the timestamp that the browser provides, either through the `requestAnimationFrame()` callback or from the `performance.now()` method. The answer is that I _am_ using them internally to calculate the `delta`, but there's several reasons why I *don't* want to use that directly as the `time` we're passing to the compute shaders.

  First is that I'm doing some work behind the scenes to capture long deltas (greater than 1s) between frames and skip them. This might be due to the user switching tabs or minimizing the windows and then coming back later, or there could just be a long hang as the system does something else. Either way, if the delta suddenly comes back as 20s when the usual expectation is in the realm of 0.016s you can get some strange looking discontinuities. So I'm omitting those from the deltas, but if we passed the browser-provided timestamp to the shader then you'd start having large jumps in the timestamp but NOT the delta, which could lead to it's own issues depending on how the particle system is set up.

  Similarly, our `speedMultiplier` control can affect both the delta _and_ the timestamp if we're tracking the timestamp ourselves, making sure that our system runs the same at half speed or 2x speed.

  And finally, by tracking our own timestamp based off the deltas we can guarantee that it always starts at zero, which is nice both from a predictability standpoint and helps floating point precision if the system runs for a *really* long time.
</details>

## Controlling the rate of emission

FIXME

<a class='demo-link' href='https://toji.github.io/webgpu-particles/6.html'>
  <img src='02-04.png' />
</a>

## Reducing unnecessary compute

FIXME

<a class='demo-link' href='https://toji.github.io/webgpu-particles/7.html'>
  <img src='02-05.png' />
</a>


<a class='button is-primary prev-page' href='../01-setup/'>Setting Up</a>
<a class='button is-primary next-page' href='../03-behavior/'>Particle Behavior</a>
