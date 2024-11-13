---
layout: page
title: WebGPU Device Loss best practices
last_updated: Oct 23, 2024
date: 2024-10-23
menubar_toc: true
comments: true
---

## Introduction
Device loss (also known as "context loss" in APIs like WebGL/OpenGL) is one of the unfortunate facts of life when working with GPUs. Despite this, it's something that's rarely handled well, if at all, by 3D web apps. This is unfortunate, because while it does require some planning responding appropriately to a device loss can be a significant improvement in your user experience for the unfortunate few that bump into it.

## What is device loss?

Device loss is a failure state for the GPU where, for whatever reason, the driver simply can't continue processing commands any more. There's multiple reasons why it can happen that depend on the hardware, driver, or OS. For example, if there's a crash in the driver this will probably be surfaced to your application as a device loss. It could also be the result of some extreme resource pressure. Many modern GPUs and APIs can handle out-of-memory errors without losing the device, but not all. Extremely long running shaders might also cause a loss. Driver updates or significant changes in device configuration may also be the cause of a device loss.

Additionally, when working in a browser, there may be times when the browser itself triggers a simulated device loss. One such example is that Chrome has a "watchdog" for the GPU process that will kill it (losing the device in the process) if the driver takes too long to complete an operation. (10 seconds or so). It may also be an intentional part of the API: The `GPUDevice` will report that it's been lost after the `destroy()` function is called. In that case it's not unexpected, but the effect on the device is similar to if it had been lost some other way (more details on that later). In either case the resources are destroyed and the device is unusable. The only difference is in how you may want to respond to it.

### What are the consequences of losing the device?

When a device is lost the `GPUDevice` object and any objects created with it all become unusable. The GPU memory associated with them is discarded and doing any further GPU work will require you to get a new `GPUDevice` and upload all the resources again. This includes any buffers, textures, pipelines, etc. Doesn't matter if you've been using the device for rendering, only compute, or a mix. All of it is gone.

Sound annoying? It is! It's aggravating for your users too. If your app doesn't handle the device loss at all they're going to see one of a few different possibilities:
 
 - The canvas goes black.
 - The canvas on their page freezes on the last frame that was rendered.
 - If the page wasn't rendering to a canvas at all, such as if you're only doing compute work with the GPU, then the user may not get any feedback about the problem at all. It'll just... stop.

For the user, best case scenario is that something does visibly go wrong, like a canvas turning black. It at least gives them a hint that they may want to try refreshing the page. But if things just fail with no feedback it can take a long time before they realize something is wrong, and it may not be clear to them on the next run if things are working properly or not. It's a recipe for frustration, over something that may not even be related to your page! Nobody wants aggravated users.

That's why you owe it to them to do SOME form of lost device handling, even if only to acknowledge to them that it happened.

## Listening for Device Loss

Fortunately, with WebGPU recognizing that a device loss happened is pretty simple! The `GPUDevice` has a `lost` attribute on it, which is a promise that resolves if the device becomes lost. Just attach a `then` callback to it and watch for if it ever fulfills. It's often convenient to do so immediately after creating the device:

```js
const adapter = await navigator.gpu.requestAdapter();
if (!adapter) { return; }
const device = await adapter.requestDevice();
device.lost.then((info) => {
  // Device is lost. Do something about it!
});
```

As a quick side note: You'd probably figure this out pretty quickly on your own, but even though `lost` is a promise, you probably don't want to `await` on it. In an ideal situation it'll never be called, so you'll just block forever and your program will hang. If you absolutely MUST use `await` for, I don't know, style reasons? Throw it in a separate async function that you explicitly don't `await` on:

```js
async function listenForDeviceLoss(device) {
    await device.lost;
   // Device is lost. Do something about it!
}

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) { return; }
const device = await adapter.requestDevice();
listenForDeviceLoss(device);
```

### Device Loss Information

When the `lost` promise does resolve it'll give you a [`GPUDeviceLostInfo` object](https://gpuweb.github.io/gpuweb/#gpudevicelostinfo) with two pieces of information: A `reason` enum and a `message`. The `reason` will only ever be `'destroyed'`, if the reason for the loss was the `destroy()` method being called, or `'unknown'` for any other reason why the device may have been lost. This is useful if your app sometimes intentionally destroys the device and you want to detect if the loss is "real".

```js
device.lost.then((info) => {
    if (info.reason == 'unknown') {
        // Handle loss as if it were unexpected.
    } else {
        // Device destroyed as expected.
    }
});

device.destroy(); // Will trigger the "expected" code path
```

The `message` is a human readable string describing the reason for the loss. This is mostly for debugging, as it may hint at what went wrong and either help you understand if it's something you can influence or not. You should _not_ try parsing the `message` string as it's implementation specific, has no guaranteed structure, and could change at any time.

<!--TODO: Example of a device loss message here?-->

### Devices that start out lost

On initialization WebGPU may return a `null` adapter from `navigator.gpu.requestAdapter()` but `adapter.requestDevice()` will _always_ return a `GPUDevice`. That device is not guaranteed to be valid, though! And if a valid device can't be returned for any reason you'll instead get back a `GPUDevice` where the `lost` promise is already resolved. If this happens it's likely because of some internal failure which may be temporary (if you got an adapter then you can at least assume that the browser and hardware are WebGPU-capable), and you can simply try again.

There is one scenario where a device may lost on creation due to an application error, however: `GPUAdapters` have a concept of being ["consumed" or "expired"](https://gpuweb.github.io/gpuweb/#dom-adapter-state-slot). They are "consumed" after being used to create a `GPUDevice`, and they may be expired after some implementation-specific duration. In either case, calling `adapter.requestDevice()` on an adapter that was consumed or expired will return a lost device.

Because of this, the simple best practice is to always get a new adapter right before you request a device! Don't hold onto adapter objects any longer than necessary.

(It's worth noting that if you request a device with an invalid feature or limit you won't get back a lost device, instead `adapter.requestDevice()` will reject with an error.)

## Responding to a Device Loss

Now that you're listening for the loss, what should you do if one happens? This is the tricky part, because it depends on what your app actually does, how robust you want it to be, and how willing you are to architect it around handling device loss gracefully.

### The bare minimum

A decent percentage of the time that you encounter a device loss you may be able to recover from it by simply trying again. You can either build this into your code or, at the minimum, tell the user to do it.

For some apps surfacing a message to the user that says "An error occurred. Refreshing the page may resolve the issue." could be sufficient. This is especially effective if the app doesn't have any user state that may be lost during the refresh. It's not particularly elegant and nobody likes being told that something broke, but at the very least it puts them on the right track!

If you want to be a little bit fancier about it you can use `location.reload()` to trigger a reload yourself, but you should be more careful when that route. You should probably still show a message to the user and indicate that the page will reload after a short delay or when they click a link rather than immediately reload on failure, otherwise the user will simply see the whole page flicker and load again and not know why, making it feel even _more_ broken.

### Restart just the GPU content

Often times WebGPU content will either be contained to a single element on a larger page or run compute work in the background without a direct, user-visible output. In those cases it can make sense to reload just the GPU portion of the application rather than refresh the entire page, even if it means losing some user state for the GPU content.

For example, for a WebGPU-based data visualization or background effect, you could simply restart it again from the beginning. (With an appropriate message to the user to explain why, of course!) Similarly with a compute-based experience you may want to simply restart whatever work you were doing again, such as re-loading an LLM and asking the user to re-submit their query.

This is easier in WebGPU than WebGL, for what it's worth. Because WebGL contexts were tightly tied to a canvas element a context loss either meant going through a [series of event handling steps](https://registry.khronos.org/webgl/specs/latest/1.0/#5.15.2) to have the canvas re-issue a new context, or simply delete the canvas from the page and place a new one with a new WebGL context in it's place.

With WebGPU, the `GPUDevice` is independent of the canvas that it renders to. Because of this, to restore a WebGPU device you simply create another one and re-configure the canvas to use it instead.

```js
context = canvas.getContext('webgpu');

async function initWebGPU() {
    adapter = await navigator.gpu.requestAdapter();
    if (!adapter) { return; }
    device = await adapter.requestDevice();
    context.configure({
        device,
        format: navigator.gpu.getPreferredCanvasFormat(),
    });

    // If we lose the device start the WebGPU content over again.
    device.lost.then((info) => {
        initWebGPU();
    });

    // Load WebGPU resources and start content.
}

initWebGPU(); // Will trigger the "unexpected" code path.
```

As mentioned above, you should always get a new adapter when requesting a new device. In addition to the adapter expiration explained previously, the reason for the device loss may have been that something fundamental about the adapter has changed, like the GPU you were using was unplugged. In which case any cached adapters, even if they haven't been consumed by retrieving a device yet, may be invalid.

### Restore with app state

Simply restarting becomes more aggravating for the user in cases where the user has some state on the page that they would lose when doing so. For example: A game where progress would be lost on restart or a product configuration tool where the defaults are restored when the WebGPU content is reloaded. In these cases you want to consider saving the user's state and restoring it when re-building the GPU resources.

This takes significantly more effort because it requires your application to track all of the applicable state needed to restore the user back to a specific point. Anything that is tracked exclusively on the GPU (uniform buffers and such) will be lost, so you'll need to be syncing out restorable state to JavaScript (and ideally saving it to some sort of persistent storage mechanism like [localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)).

Because of this it's best if you build your app from the ground up with the ability to restore the user's progress in mind. For existing apps, hopefully you have already been doing that for other reasons (saving progress across browser sessions, filling out order forms, etc.)

You should consider which aspects of your app are important to restore if needed. The exact position of every particle in a particle system is unlikely to be important to the user, for example, but the color that they chose for a product or the position of a game character in the world are more important to preserve.

## What if restoring the Device fails?

Something to be aware of is that there may be times where a Device Loss happens and you simply can't get another device back. This may happen because either the OS or the browser has determined that further use of the GPU is not allowed. For example: In Chrome if the GPU crashes a certain number of times in a given timespan it will stop allowing new adapters to be returned. ([See below](#chrome-specific-testing) for more details.) 

For WebGPU this will surface as request adapter failing. It will return null, and you won't get any additional information about why. If this happens **after a device loss**, consider recommending that the user restart their browser or possibly device in order to fix the issue.

That said, please be careful to _not_ recommend that users restart simply because they don't have WebGPU support. A page failing to get a `GPUAdapter` is not necessarily unusual, and could be the result of incompatible hardware, browser configuration, or simply because WebGPU support is still being developed for several major browsers and OSes. If you fail to get an adapter on page start it's best to either fall back to a non-WebGPU path or notify the user that WebGPU is not supported, rather than trying to get them to restart.

## Testing Device Loss handling

"Real" device losses are (hopefully) a rare thing for you that's hard to trigger. So how can you test that you're handling them well without inflicting unspeakable horrors on your hardware in hopes of making it break?

The easiest way is to simply call `destroy()` on your device! As mentioned previously, `destroy()` does trigger the `lost` promise and _mostly_ mimics the behavior of a device loss triggered in some other way. The only thing you have to do is either not check the `reason` that the loss reports or save some additional piece of data that indicates that this `destroy()` is meant for testing, like so:

```js
let simulatedLoss = false;
function simulateDeviceLoss() {
    simulatedLoss = true;
    device.destroy();
}

device.lost.then((info) => {
    if (info.reason == 'unknown' || simulatedLoss) {
        simulatedLoss = false;
        // Handle loss as if it were unexpected.
    } else {
        // Device destroyed as expected.
    }
});

simulateDeviceLoss(); // Will trigger the "unexpected" code path.
```

Note that this [won't replicate the _exact_ conditions of an actual device loss.](https://github.com/gpuweb/gpuweb/issues/4177). Namely:

 - `destroy()` unmaps mapped buffers, while a real device loss will not.
 - You can always create a new device after calling `destroy()`, while a real device loss may prevent it.

Despite this, it should be good enough for most testing, and there's a possibility that we might add a feature to force an actual device loss for testing, [like we have for WebGL](https://registry.khronos.org/webgl/extensions/WEBGL_lose_context/). No guarantees or timelines have been given for such a feature, though.

### Chrome specific testing

In Chrome a more manual way to test a more realistic device loss is to open up a separate tab from your WebGPU page and navigate to "about:gpucrash". This will kill the entire GPU process and bring it back up again, losing any WebGPU (and WebGL!) devices in the process.

Please note that crashing the GPU process, either intentionally or via some driver/system bug, triggers some rules limiting whether or not you'll be able to get a new WebGPU adapters (or WebGL contexts, for that matter):

 - The first time the GPU process crashes you should be able to get a new adapter/device.
 - If the GPU process crashes a second time within two minutes of the first crash, your page won't be able to get a new adapter. This limit is reset if the page is refreshed.
 - If the GPU process crashes three times within two minutes then _all pages_ will be blocked from getting new adapters/devices. The only way to reset this limit is to wait for two minutes or restart the browser.
 - There's a platform-specific crash frequency (something like 3-6 times within 5 minutes) beyond which the GPU process stops trying to come back at all. Once that limit is hit then the ONLY way to request new WebGPU adapters is to restart the browser.

These limits can be avoided by starting the browser with the command line arguments `--disable-domain-blocking-for-3d-apis --disable-gpu-process-crash-limit`, at which point you can crash the GPU process with reckless abandon!
