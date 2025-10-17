---
layout: page
title: WebGPU Pipeline caching best practices
date: 2025-10-17
menubar_toc: true
comments: true
---

## Introduction

This article addresses patterns for minimizing the impact of pipeline creation overhead on your WebGPU applications. If you are already familiar with the cause and effects of pipeline creation-related performance issues (like shader stutter) feel free to [skip ahead](#pipeline-creation-performance) to the part where we cover best practices. For everybody else, let's talk about the reason why this topic needs discussing in the first place.

### In which we observe the dreaded Shader Stutter

You have probably encountered "shader stutter" before when using many types of realtime 3D software, especially games. Brief hitches in performance that usually correspond to something new being displayed for the first time, such as an object with a unique material, a new character, or a previously unseen effect. This can happen because a render or compute pipeline was created immediately before the application needed it, such as just prior to the first time the object became visible. Pipelines are typically the most expensive single task you can perform with a GPU API, and frequently their creation will take longer than a single frame. While other work CAN happen in parallel, if the pipeline is used as part of a draw or dispatch call before it has finished compiling the entire GPU workload will stall and wait for it to finish before continuing. This manifests to the user as dropped frames and stuttery performance.

There's a [more comprehensive description of the problem here](https://www.unrealengine.com/en-US/tech-blog/game-engines-and-shader-stuttering-unreal-engines-solution-to-the-problem). That article frames its discussion around the Unreal Engine, but the principles apply to almost all realtime rendering.

Needless to say, this is typically seen as a fairly objectionable artifact, and a lot of work on the part of GPU manufacturers, software devs, and users has been sunk into trying to minimize the problem. WebGPU is, of course, not immune to the issue either. In fact, there are a couple of factors which can make WebGPU *more* prone to pipeline creation stalls than it's native counterparts. This article aims to provide tools and patterns to mitigate some of those challenges.

### Mitigating pipeline creation stalls in native apps

There are several patterns that native applications (those using APIs like Vulkan, D3D12, and Metal directly) can use to try and avoid this class of performance issue, some of which apply to WebGPU and others that don't.

In the simplest scenario, some applications only need a small, fixed number of pipelines for the lifetime of the app. If this is the case it may be practical to create all the pipelines needed from scratch while the application is loading. Easy, right?

Of course, many realtime applications are not nearly so straightforward. Given how complex render pipelines can be, and how many variables they take during creation, it's not unusual for an application to need thousands of individual pipelines over it's lifetime! (The Unreal article linked above cites an example of Fortnight using 10,000+ pipelines for a match.) And it can be difficult to know ahead of time what pipelines are even needed! Especially if you are working with arbitrary assets provided by artists or external users. It creates a situation where compiling every possible pipeline your application may require ahead of time may result in _millions_ of possibilities. Since that's obviously not sustainable, it's understandable why a lot of apps wait until they've identified that a pipeline _will_ be needed before they begin compiling it.

To that end, one of the most effective tools that native applications have to manage these scenarios is **Pipeline caches** (also referred to as a "Shader cache" or "PSO (Pipeline State Object) cache"). These caches work by building the final, compiled binary code that the GPU will execute for a given set of pipeline arguments (which includes things like the shaders, buffer input layouts, render output formats, blending behavior, etc.) They then save that binary with the pipeline arguments as a key, so that the next time an identical set of arguments is provided the cache can return the pre-built binary instead of compiling it again from scratch.

This is great for making things run smoother over the long run. It means that, for example, in a game you'll only see a hitch the first time a specific effect is used instead of _every_ time it's used.

But that still leaves us with potential performance issues the first time a user is interacting with the software. First impressions matter a lot, and if someone's first experience with your application is full of hitches and stutters then it often doesn't matter that it eventually smooths out, you've still left an early impression of performing poorly.

In the world of gaming consoles, this can be helped by shipping pre-compiled binaries for shaders that you know will be used with the software to prime the cache. This is practical because, given the nature of game consoles, you know exactly what hardware every user will be using.

On PC and mobile it's not so simple, because the final binary code produced for a given pipeline depends on a lot of variables:

 - The shader code and pipeline args, obviously.
 - The user's OS, and the version of that OS.
 - The make and model of the user's GPU.
 - The version of their GPU driver.
 - Any third party tools that may be observing and manipulating GPU API calls.

So generally it's considered impractical to try and deliver shader binaries on PC/mobile. (Although there are [efforts](https://devblogs.microsoft.com/directx/introducing-advanced-shader-delivery/) [underway](https://github.com/ValveSoftware/Fossilize) to allow developers to do it for well known hardware configurations, such as handheld gaming devices like the Steam Deck.)

Instead, applications will fall back to an extended loading screen the first time they run where pipeline combinations that are known to be needed are compiled and cached prior to the application starting. Nobody likes long loading screens, but it makes it easier to swallow if it only occurs once, at which point it feels more like an extension of the install process. The downside is that you may have to go through a similar process again in the future if something like a driver update invalidates your previously cached binaries.

### Pipeline compilation in WebGPU


 of pre-compiled pipelines along with their games (the way consoles typically handle it), but for this to be effective you generally have to have a large-ish population of users with the same hardware configuration to make building and delivering the cache practical. That's why these tools typically target handheld gaming devices, because they come in a limited number of configurations.

Unfortunately for web developers the very thing that makes the platform so powerful (reach to a truly massive variety of devices) also makes this approach a non-starter. The final, binary pipeline representation created by the API simply depends on too many variables that can affect the output:
 
 

So the only practical approach for a web app is to compile the pipelines from source for each device they run on. If you are attempting to avoid shader stutter, that sounds like a worst-case scenario, right? Fortunately, there are some practical ways to avoid pipeline creation-induced hitches.

## Pipeline Creation Performance 


### Pipeline cache privacy considerations

It should be noted that, at least in Chrome, pipeline caches are isolated based on the page's origin. This means that if, say, https://toji.dev and https://example.com both used identical pipelines they would still have to compile and cache them separately. Multiple pages under a single domain will share their pipeline cache, however!

This is done to preserve user privacy, as otherwise you may be able to guess at whether a visitor to your site has visited another page by creating a known pipeline used by that page and observing the time it takes to create.

Similarly, when using Chrome in incognito mode pipelines are still cached, but they only use an in-memory cache that will be discarded once the browser is closed.

## Disabling browser pipeline caches

While the "silent" pipeline caching provided by the browsers is great for ensuring that users have a smooth experience, it does make it difficult to test your page from the perspective of a first-time user. Ideally you should be testing your page on a regular basis with a "cold" pipeline cache so you can observe where any pipeline creation-related performance issues come up.

Sadly there is not a single unified way to turn off or clear the pipeline cache for every browser on every OS. There are methods available for each scenario, though:

### Chrome

To disable Chrome's pipeline cache on any platform, run it with the following command line flag:

```
--enable-dawn-features=disable_blob_cache
```

(Yes, you're disabling something by enabling the disable flag, and also it mixes dashes and underscores. It bugs me too!)

This will prevent Chrome from loading any cached objects from disk. It will not, however, disable the "frontend" cache, which handles duplicate objects created by the same GPUDevice. So if you create the same pipeline 5 times with a single device, you should expect that it'll only do a "real" compile for the first one.

### Safari

I reached out to an Apple engineer to learn more about how Safari handles pipeline caches. According to them Apple's browser relies entirely on Metal's built-in pipeline cache, and doesn't do any pipeline caching of it's own. As a result, there is no way to disable that caching through Safari specifically. Instead, you can follow the steps below to [clear the Metal cache](#macosmetal).

### Firefox

As far as I can tell at the time of writing Firefox does not appear to directly perform pipeline caching. The underlying wgpu library does support it, but Firefox [doesn't supply the necessary interface](https://searchfox.org/firefox-main/rev/dcdbc805276cd5bf131cac2dbf53dda1538a32d5/gfx/wgpu_bindings/src/client.rs#1668) when creating a pipeline. Any caching that may happen at the driver level still applies, however.

I will glady update this article with more details if/when I hear that Firefox begins caching them.

## Disabling or clearing system pipeline caches

As discussed earlier, many times drivers will also manage their own cache. If you want to ensure that you're fully testing the first-run experience you'll want to disable or clear these pipeline caches as well. Please note, however, that disabling these caches will almost certainly have deterimental effects on other GPU-based applications on your system, and will prevent duplicate pipelines created by the same page from taking advantage of the driver-level cache. As a result, it is recommended that these steps are only taken when benchmarking pipeline loading and avoided or reverted for all other uses.

### DirectX

To clear the DirectX pipeline cache, you can use the Windows Disk Cleanup tool:
  - Open Start Menu
  - Search for and open "Disk Cleanup"
  - Check the "DirectX shader cache" option
  - Click "Clean up System Files" (Will require admin approval)

### Nvidia

To disable the Nvidia pipeline cache:
  - Open the NVIDIA Control Panel from the system tray. 
  - Click Manage 3D settings. 
  - On the Global Settings tab, set "Shader Cache Size" to "Disabled". 
  - Click Apply.

/* TODO: Can we clear the cache without disabling? */ 

### AMD

/* TODO: https://www.amd.com/en/resources/support-articles/faqs/DH-012.html */

### MacOS/Metal

My contact at Apple suggested that the Metal shader cache for an application could be cleared by deleting the relevant directories found via:

```
find $(getconf DARWIN_USER_CACHE_DIR) -name 'com.apple.metal'
```

/* TODO: Figure out if that has an impact on other apps or can be scoped to Safari only. */

And also deleting any `com.apple.metal` paths found under `/private/var`. For example, searching for "Safari":

```
find /private/var -name com.apple.metal 2> /dev/null | grep Safari
```

May return results like these for Safari's GPU process:

```
/private/var/folders/_w/4v5063yj36b15by9xgr11t8m0000gn/C/com.apple.WebKit.GPU+com.apple.Safari.WebApp/com.apple.WebKit.GPU/com.apple.metal

/private/var/folders/_w/4v5063yj36b15by9xgr11t8m0000gn/C/com.apple.WebKit.GPU+com.apple.Safari/com.apple.WebKit.GPU/com.apple.metal
```

Unfortunately they had no such suggestions for clearing the pipeline cache on iOS. If anyone knows of a method please let me know and I'll document it here!

There is apparently also an undocumented environment variable that can be used to disable the shader cache entirely, [according to this post](https://developer.apple.com/forums/thread/659856?answerId=653477022#653477022)

```
export MTL_SHADER_CACHE_SIZE=0
```