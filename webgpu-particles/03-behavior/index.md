---
layout: page
title: WebGPU Particle Systems
subtitle: Particle Behavior
show_sidebar: false
menubar: particles_menu
toc: true
comments: true
---

<link rel="stylesheet" href="../particles.css">
<script src='../embedded-demos.js'></script>

At this point we have a pretty reasonable framework for emitting, updating, and killing particles. But thus far any changes we want to make to the behavior of the particles has had to be done directly in the shader code. Sometimes, for very specific effects, that'll be the best way to do it! But in many other cases you'll want easier ways to update the behavior of your particles, especially if you want artists to have more control over their appearance.

So next lets take a look at ways that we can configure how our particle system works without changing the shader code every time!

## Intervals

FIXME

<a class='demo-link' href='https://toji.github.io/webgpu-particles/8.html'>
  <img src='03-01.png' />
</a>

## Bezier Curves

FIXME

<a class='demo-link' href='https://toji.github.io/webgpu-particles/9.html'>
  <img src='03-02.png' />
</a>

<a class='button is-primary prev-page' href='../02-lifetime/'>Particle Lifetime</a>
