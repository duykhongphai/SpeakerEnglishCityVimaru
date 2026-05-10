// ==UserScript==
// @name         Auto Speaking Bot
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Tự động làm bài speaking, tự chạy khi detect được speaker
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(async () => {
  console.clear();
  console.log("%c[HOOK] Initializing...", "color:lime;font-weight:bold");

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

  function waitFor(fn, timeout = 15000, interval = 150) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        const el = fn();
        if (el) { clearInterval(timer); resolve(el); }
        else if (Date.now() - start > timeout) { clearInterval(timer); reject(new Error("Timeout")); }
      }, interval);
    });
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function localizeCapturedAudio() {
    if (!HS.capturedAudioSrc) return null;
    try {
      const res = await fetch(HS.capturedAudioSrc);
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

    await waitFor(() => HS.capturedAudioSrc, 8000);
    console.log(`[Câu ${index}] Captured:`, HS.capturedAudioSrc);

    const audioUrl = await localizeCapturedAudio();
    await prepareFakeMic(audioUrl);

    await waitFor(() => findMicBtn(), 30000);
    console.log(`%c[Câu ${index}] Click Record...`, "color:lime");
    findMicBtn().click();
    await sleep(300);

    if (HS.fakeAudioCtx?.state === "suspended") await HS.fakeAudioCtx.resume();
    HS.fakeAudioEl.currentTime = 0;
    await new Promise((resolve, reject) => {
      HS.fakeAudioEl.onended = resolve;
      HS.fakeAudioEl.onerror = reject;
      HS.fakeAudioEl.play().catch(reject);
    });

    await sleep(300);
    const stopBtn = findStopBtn();
    if (stopBtn) { stopBtn.click(); await sleep(800); }

    console.log(`%c[Câu ${index}] Chờ kết quả hiện...`, "color:yellow");
    await waitFor(() => document.querySelector(".ant-progress-circle"), 15000);
    await sleep(1000);
    console.log(`%c[Câu ${index}] Bấm Tiếp tục!`, "color:lime;font-weight:bold");
    const nextBtn = await waitFor(() => findNextBtn(), 10000);
    await sleep(300);
    nextBtn.click();

    await waitFor(() => !findNextBtn(), 10000).catch(() => {});
    await waitFor(() => findSpeakerBtn(), 15000);
    await sleep(800);
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
        await sleep(2000);
      }
    }
    console.log("%cBot đã dừng.", "color:gray;font-size:14px;font-weight:bold");
  }

  // ===== TỰ DETECT VÀ CHẠY =====
  console.log("%cĐang chờ trang có nút speaker...", "color:cyan");
  const observer = new MutationObserver(() => {
    if (!HS.running && findSpeakerBtn()) {
      console.log("%c[AUTO] Detect speaker! Bắt đầu chạy...", "color:lime;font-size:14px;font-weight:bold");
      observer.disconnect();
      mainLoop();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Kiểm tra ngay nếu speaker đã có sẵn
  if (findSpeakerBtn()) {
    console.log("%c[AUTO] Speaker đã có sẵn! Bắt đầu ngay...", "color:lime;font-size:14px;font-weight:bold");
    observer.disconnect();
    mainLoop();
  }
})();
