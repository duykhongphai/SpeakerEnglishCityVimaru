// ==UserScript==
// @name         Auto Speaking Bot
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Tự động làm bài speaking, không timeout
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(async () => {
  console.clear();

  window.__HOOK_STATE = {
    capturedAudioSrc: null,
    capturedAudioEl: null,
    fakeMicStream: null,
    fakeAudioEl: null,
    fakeAudioCtx: null,
    originalGetUserMedia: null,
    originalPlay: null,
    originalFetch: null,
    originalXHROpen: null,
    running: false,
  };

  const HS = window.__HOOK_STATE;

  if (!HS.originalPlay) {
    HS.originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      try {
        if (this.tagName === "AUDIO") {
          const src = this.currentSrc || this.src || null;
          if (src) { HS.capturedAudioSrc = src; HS.capturedAudioEl = this; }
        }
      } catch (e) {}
      return HS.originalPlay.apply(this, args);
    };
  }

  if (!HS.originalFetch) {
    HS.originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const res = await HS.originalFetch.apply(this, args);
      try {
        const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
        if (url && /\.(mp3|wav|ogg|m4a|webm)(\?|$)/i.test(url)) HS.capturedAudioSrc = url;
      } catch (e) {}
      return res;
    };
  }

  if (!HS.originalXHROpen) {
    HS.originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      try {
        if (url && /\.(mp3|wav|ogg|m4a|webm)(\?|$)/i.test(url)) HS.capturedAudioSrc = url;
      } catch (e) {}
      return HS.originalXHROpen.call(this, method, url, ...rest);
    };
  }

  if (!HS.originalGetUserMedia) {
    HS.originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async function (constraints) {
      if (constraints?.audio && HS.fakeMicStream) return HS.fakeMicStream;
      return HS.originalGetUserMedia(constraints);
    };
  }

  // ===== HELPERS =====
  const findSpeakerBtn = () => document.querySelector("i.fa-volume-up")?.closest("div, button");
  const findMicBtn = () => [...document.querySelectorAll("button.question-type__recordType02")]
    .find(btn => btn.querySelector("i.fa-microphone") && btn.offsetParent !== null);
  const findStopBtn = () => [...document.querySelectorAll("button.question-type__recordType02")]
    .find(btn => btn.querySelector("i.fa-stop") && btn.offsetParent !== null);
  const findNextBtn = () => [...document.querySelectorAll("button.ant-btn.ant-btn-primary")]
    .find(btn => btn.innerText.trim() === "Tiếp tục" && btn.offsetParent !== null);
  const findResult = () => document.querySelector(".ant-progress-circle");

  // waitFor không có timeout — chờ mãi đến khi có
  function waitFor(fn, interval = 150) {
    return new Promise(resolve => {
      const timer = setInterval(() => {
        const el = fn();
        if (el) { clearInterval(timer); resolve(el); }
      }, interval);
    });
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function localizeCapturedAudio() {
    if (!HS.capturedAudioSrc) return null;
    try {
      const res = await HS.originalFetch(HS.capturedAudioSrc);
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch (e) { return HS.capturedAudioSrc; }
  }

  async function prepareFakeMic(audioUrl) {
    if (HS.fakeAudioCtx) { try { await HS.fakeAudioCtx.close(); } catch (e) {} }
    const audio = new Audio(audioUrl);
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";
    await new Promise((resolve, reject) => { audio.oncanplaythrough = resolve; audio.onerror = reject; audio.load(); });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctx.createMediaElementSource(audio);
    const dest = ctx.createMediaStreamDestination();
    source.connect(dest);
    source.connect(ctx.destination);
    HS.fakeMicStream = dest.stream;
    HS.fakeAudioEl = audio;
    HS.fakeAudioCtx = ctx;
  }

  async function runOnce(index) {
    HS.capturedAudioSrc = null;

    console.log(`%c[Câu ${index}] Click speaker...`, "color:deepskyblue");
    const speakerBtn = findSpeakerBtn();
    if (!speakerBtn) throw new Error("Không tìm thấy nút speaker!");
    speakerBtn.click();

    await waitFor(() => HS.capturedAudioSrc);
    console.log(`[Câu ${index}] Captured:`, HS.capturedAudioSrc);

    const audioUrl = await localizeCapturedAudio();
    await prepareFakeMic(audioUrl);

    await waitFor(() => findMicBtn());
    console.log(`%c[Câu ${index}] Click Record...`, "color:lime");
    findMicBtn().click();
    await sleep(200);

    if (HS.fakeAudioCtx?.state === "suspended") await HS.fakeAudioCtx.resume();
    HS.fakeAudioEl.currentTime = 0;
    await new Promise((resolve, reject) => {
      HS.fakeAudioEl.onended = resolve;
      HS.fakeAudioEl.onerror = reject;
      HS.fakeAudioEl.play().catch(reject);
    });

    await sleep(200);
    const stopBtn = findStopBtn();
    if (stopBtn) { stopBtn.click(); await sleep(300); }

    // Chờ màn hình kết quả hiện
    console.log(`%c[Câu ${index}] Chờ kết quả...`, "color:yellow");
    await waitFor(() => findResult());
    await sleep(300);

    // Bấm Tiếp tục
    await waitFor(() => findNextBtn());
    findNextBtn().click();
    console.log(`%c[Câu ${index}] Đã bấm Tiếp tục!`, "color:lime;font-weight:bold");

    // Chờ kết quả biến mất → câu mới load
    await waitFor(() => !findResult());
    await waitFor(() => findSpeakerBtn());
    await sleep(200);
    console.log(`%c[Câu ${index}] Câu mới sẵn sàng!`, "color:lime");
  }

  async function mainLoop() {
    let i = 1;
    HS.running = true;
    while (HS.running) {
      try {
        await runOnce(i++);
      } catch (err) {
        console.error(`Lỗi câu ${i - 1}:`, err.message);
        await sleep(1000);
      }
    }
  }

  // ===== TỰ DETECT VÀ CHẠY =====
  const observer = new MutationObserver(() => {
    if (!HS.running && findSpeakerBtn()) {
      console.log("%c[AUTO] Detect speaker! Bắt đầu...", "color:lime;font-size:14px;font-weight:bold");
      observer.disconnect();
      mainLoop();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  if (findSpeakerBtn()) {
    observer.disconnect();
    mainLoop();
  }
})();
