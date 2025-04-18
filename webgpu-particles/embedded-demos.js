// Scan through the full document, find any images that link to demo pages,
// then convert them into iframes which will show the demo inline.

// Wait till the document is loaded before scanning.
window.addEventListener('load', () => {
  const menu = document.querySelector('aside');

  const isLocalhost = window.location.hostname === 'localhost';

  const localSampleHostname = 'http://localhost:8080/'

  const autoplayCheckbox = document.createElement('input');
  autoplayCheckbox.type = 'checkbox';
  autoplayCheckbox.id = 'autoplaySamples';
  autoplayCheckbox.checked = true;
  const autoplayLabel = document.createElement('label');
  autoplayLabel.for = 'autoplaySamples';
  autoplayLabel.innerText = ' Autoplay Samples';

  menu.parentElement.appendChild(autoplayCheckbox);
  menu.parentElement.appendChild(autoplayLabel);

  // Use an IntersectionObserver to determine when samples are scrolled off the
  // and shut them down so that the user doesn't end up with 50 separate samples
  // all using WebGPU resources at the same time.
  const sampleElements = new Map();
  const intersectionObserver = new IntersectionObserver((entries) => {
    for (entry of entries) {
      const sample = sampleElements.get(entry.target);
      if (sample) {
        if (!entry.isIntersecting) {
          sample.stop();
        } else if (autoplayCheckbox.checked) {
          sample.start();
        }
      }
    }
  });

  const demoLinks = document.querySelectorAll('.demo-link');
  for (const link of demoLinks) {
    let href = new URL(link.href);
    if (isLocalhost) {
      href = new URL(`${localSampleHostname}${href.pathname}`);
    }
    const container = document.createElement('div');
    container.classList.add('embedded-demo');

    const iframe = document.createElement('iframe');

    const backgroundImg = link.querySelector('img');
    if (backgroundImg) {
      iframe.style.backgroundImage = `url(${backgroundImg.src})`;
    }
    container.appendChild(iframe);

    const runButton = document.createElement('button');
    runButton.classList.add('run-button');
    runButton.title='Run Example';
    runButton.innerText = '▶️';
    container.appendChild(runButton);

    const stopButton = document.createElement('button');
    stopButton.classList.add('stop-button');
    stopButton.title='Close Example';
    stopButton.innerText = '❎';
    stopButton.style.display = 'none';
    container.appendChild(stopButton);

    const start = () => {
      // Load up the iframe when you click the button
      runButton.style.display = 'none';
      stopButton.style.display = '';
      iframe.src = href.toString();
    };
    runButton.addEventListener('click', start);

    const stop = () => {
      // Unload the iframe when you click the button
      runButton.style.display = '';
      stopButton.style.display = 'none';
      iframe.src = '';
    };
    stopButton.addEventListener('click', stop);

    sampleElements.set(iframe, { start, stop });
    intersectionObserver.observe(iframe);

    const newTab = document.createElement('a');
    newTab.href = href.toString();
    newTab.target = '_blank';
    newTab.innerText = 'Open in new tab';
    container.appendChild(newTab);

    link.replaceWith(container);
  }
});