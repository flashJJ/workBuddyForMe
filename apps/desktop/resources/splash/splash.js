(function () {
  'use strict';

  var api = window.wbfmBoot;
  var stage = document.getElementById('stage');
  var phaseText = document.getElementById('phase-text');
  var slowText = document.getElementById('slow-text');
  var versionText = document.getElementById('version');
  var skipButton = document.getElementById('skip');
  var video = document.getElementById('cinema');
  var errorBox = document.getElementById('error');
  var errorTitle = document.getElementById('error-title');
  var errorMessage = document.getElementById('error-message');
  var errorHint = document.getElementById('error-hint');

  if (!stage || !phaseText || !video) return;

  var MIN_VISIBLE_MS = 500;
  var MAX_INTRO_MS = 9000;
  var VIDEO_DECISION_MS = 1000;
  var startedAt = performance.now();
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mode = null;
  var mainReady = false;
  var videoStarted = false;
  var videoEnded = false;
  var exited = false;
  var skipped = false;
  var exitTimer = null;
  var slowTimer = null;
  var verySlowTimer = null;

  function elapsed() {
    return performance.now() - startedAt;
  }

  function setPhaseText(text) {
    phaseText.textContent = text;
  }

  function setSkipVisible(visible) {
    if (!skipButton) return;
    skipButton.hidden = !visible;
  }

  function clearTimers() {
    if (exitTimer) window.clearTimeout(exitTimer);
    if (slowTimer) window.clearTimeout(slowTimer);
    if (verySlowTimer) window.clearTimeout(verySlowTimer);
    exitTimer = null;
    slowTimer = null;
    verySlowTimer = null;
  }

  function enterWaiting() {
    document.body.removeAttribute('data-view');
    try {
      video.pause();
    } catch (_error) {
      // 视频尚未初始化时忽略
    }
    if (mode) setPhaseText(mode.labels.waiting);
    skipButton && (skipButton.hidden = true);
  }

  function exit() {
    if (exited) return;
    exited = true;
    clearTimers();
    document.body.classList.add('leaving');
    window.setTimeout(function () {
      if (api) api.notifyExited();
    }, 240);
  }

  function scheduleExit() {
    if (exited || !mainReady || !mode) return;
    if (exitTimer) {
      window.clearTimeout(exitTimer);
      exitTimer = null;
    }
    var at = elapsed();
    if (mode.intro === 'compact') {
      if (at < MIN_VISIBLE_MS) {
        exitTimer = window.setTimeout(scheduleExit, MIN_VISIBLE_MS - at);
        return;
      }
      exit();
      return;
    }
    if (at >= MAX_INTRO_MS) {
      enterWaiting();
      exit();
      return;
    }
    if (!videoStarted && !videoEnded && !reducedMotion && at < VIDEO_DECISION_MS) {
      exitTimer = window.setTimeout(scheduleExit, 80);
      return;
    }
    if (!videoStarted && !videoEnded && at >= VIDEO_DECISION_MS) {
      videoEnded = true;
    }
    if (videoStarted && !videoEnded && !skipped) {
      exitTimer = window.setTimeout(scheduleExit, Math.max(40, MAX_INTRO_MS - at));
      return;
    }
    if (at < MIN_VISIBLE_MS) {
      exitTimer = window.setTimeout(scheduleExit, MIN_VISIBLE_MS - at);
      return;
    }
    exit();
  }

  function onCanPlay() {
    if (!mode || mode.intro !== 'full') return;
    if (exited || videoStarted || videoEnded) return;
    if (mode.intro === 'full' && elapsed() > VIDEO_DECISION_MS) {
      videoEnded = true;
      return;
    }
    videoStarted = true;
    document.body.dataset.view = 'video';
    var playing = video.play();
    if (playing && typeof playing.catch === 'function') {
      playing.catch(function () {
        onVideoError();
      });
    }
    if (mainReady) scheduleExit();
  }

  function onVideoEnded() {
    videoEnded = true;
    if (mainReady) scheduleExit();
  }

  function onVideoError() {
    videoStarted = false;
    videoEnded = true;
    document.body.removeAttribute('data-view');
    try {
      video.pause();
    } catch (_error) {
      // 忽略
    }
    if (mainReady) scheduleExit();
  }

  function prepareVideo() {
    if (!mode || reducedMotion) return;
    if (mode.intro !== 'full') return;
    video.preload = 'auto';
    video.addEventListener('canplay', onCanPlay, { once: true });
    video.addEventListener('ended', onVideoEnded, { once: true });
    video.addEventListener('error', onVideoError, { once: true });
    video.src = 'cinema.mp4';
    video.load();
  }

  function applyMode(next) {
    mode = next;
    stage.dataset.mode = next.intro;
    document.documentElement.lang = next.lang === 'zh' ? 'zh-CN' : 'en';
    setPhaseText(next.labels.waiting);
    if (versionText) versionText.textContent = next.labels.version + ' ' + next.version;
    if (skipButton) skipButton.textContent = next.labels.skip;
    setSkipVisible(next.intro === 'full');
    prepareVideo();
  }

  function setPhase(event) {
    if (!event || !mode) return;
    stage.dataset.phase = event.id;
    setPhaseText(mode.labels[event.id] || mode.labels.waiting);
  }

  function onDone() {
    mainReady = true;
    scheduleExit();
  }

  function onFail(failure) {
    clearTimers();
    document.body.removeAttribute('data-view');
    try {
      video.pause();
    } catch (_error) {
      // 忽略
    }
    if (!mode) return;
    errorBox.hidden = false;
    errorTitle.textContent = mode.labels.failed;
    errorMessage.textContent = failure && failure.message ? failure.message : '';
    errorHint.textContent = mode.labels.failedHint + (failure && failure.logPath ? failure.logPath : '');
  }

  function skip() {
    if (exited || !mode) return;
    if (errorBox && errorBox.hidden === false) return;
    skipped = true;
    if (api) api.skip();
    if (mainReady) {
      exit();
      return;
    }
    enterWaiting();
  }

  if (api) {
    api.onMode(applyMode);
    api.onPhase(setPhase);
    api.onDone(onDone);
    api.onFail(onFail);
  }

  if (skipButton) {
    skipButton.addEventListener('click', function (event) {
      event.stopPropagation();
      skip();
    });
  }

  document.addEventListener('click', skip);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      skip();
    }
  });

  slowTimer = window.setTimeout(function () {
    if (!mode || exited || errorBox.hidden === false) return;
    slowText.hidden = false;
    slowText.textContent = mode.labels.slow;
  }, 8000);

  verySlowTimer = window.setTimeout(function () {
    if (!mode || exited || errorBox.hidden === false) return;
    slowText.hidden = false;
    slowText.textContent = mode.labels.verySlow;
  }, 20000);
})();
