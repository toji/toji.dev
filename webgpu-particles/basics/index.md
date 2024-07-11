---
layout: page
title: WebGPU Particle Systems
subtitle: Particle Basics
show_sidebar: false
menubar: particles_menu
toc: true
comments: true
---

<link rel="stylesheet" href="../particles.css">

Now that we have a simple environment to work in, let's get started on the star of the show: the particles!

## Initializing Particles
As a first step, we're only going to initialize a set of particles to some easy-to-verify state and draw them as simple white squares. Not particularly exciting or pretty, but it'll give us a good starting point to layer more interesting features onto!

FIXME

<a class='demo-link' href='https://toji.github.io/webgpu-particles/1.html'>
  <img src='media/sample-01.png' />
</a>

As you can see, this isn't particularly attractive but it _does_ demonstrate that we are able to place the particles where we want in the compute shader and then render them without the particle data ever touching the CPU! So it's a good start.

## Textured billboards
While there may be some visual styles where flat shaded quads as particles may fit well, most particle systems you see render their particles as **textured billboards** to achieve the effect that they want. "Billboard" in this case means a quad that is always rotated so that it faces towards the camera. (Enemies in the original Doom were billboards, for example.) By billboarding our particles we can better hide the fact that they're simply flat planes, especially if the texture used is roughly spherical in appearance, since that makes it even harder to tell that they're rotating to face the camera all the time.

FIXME

<a class='demo-link' href='https://toji.github.io/webgpu-particles/2.html'>
  <img src='media/sample-02.png' />
</a>

It's worth noting that some particle effect may not want this billboarded appearance! For example, you can imagine a system where the particles were leaves falling from a tree: allowing the particles to render as flat quads that rotated and flutter as they fall could be exactly what you want! Also, the particles don't _have_ to be quads, they could be full meshes and the instancing would work exactly the same. We're just rendering them as quads here for simplicity.

## Putting it in motion
Of course, particles that just sit there aren't much fun. We want them to move! And to that end we'll introduce a new compute function to our program: `particleUpdate()`.

Like `particleInit()` this will also be dispatched for every particle in the buffer, but instead of being called once at startup it'll be called every frame. That will allow us to animate the particles by tweaking their position (or any other particle attributes) over time.

To keep things simple initially let's try an effect that resembles rain or snow: The particles will move downward until they reach the bottom of our grid box, then reappear at the top again.

FIXME

<a class='demo-link' href='https://toji.github.io/webgpu-particles/3.html'>
  <img src='../media/sample-03.png' />
</a>

## Controlling particle lifetime

FIXME

<a class='demo-link' href='https://toji.github.io/webgpu-particles/4.html'>
  <img src='../media/sample-04.png' />
</a>

## Getting the timing right

FIXME

<a class='demo-link' href='https://toji.github.io/webgpu-particles/5.html'>
  <img src='../media/sample-05.png' />
</a>

## Controlling the rate of emission

FIXME

<a class='demo-link' href='https://toji.github.io/webgpu-particles/6.html'>
  <img src='../media/sample-06.png' />
</a>

<a class='button is-primary prev-page' href='../'>Introduction</a>
<a class='button is-primary next-page' href='../basics'>Particle Basics</a>

<!--Must be at the bottom of the article or it won't pick up the demo links-->
<script src='../embedded-demos.js'></script>