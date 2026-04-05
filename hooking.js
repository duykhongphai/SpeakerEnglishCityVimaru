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

  // ===== HOOK AUDIO PLAY =====
  if (!HS.originalPlay) {
    HS.originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      try {
        if (this.tagName === "AUDIO") {
          const src = this.currentSrc || this.src || null;
          if (src) {
            HS.capturedAudioSrc = src;
            HS.capturedAudioEl = this;
          }
        }
      } catch (e) {}
      return HS.originalPlay.apply(this, args);
    };
  }

  // ===== HOOK FETCH =====
  if (!HS.originalFetch) {
    HS.originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const res = await HS.originalFetch.apply(this, args);
      try {
        const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
        if (url && /\.(mp3|wav|ogg|m4a|webm)(\?|$)/i.test(url)) {
          HS.capturedAudioSrc = url;
        }
      } catch (e) {}
      return res;
    };
  }

  // ===== HOOK XHR =====
  if (!HS.originalXHROpen) {
    HS.originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      try {
        if (url && /\.(mp3|wav|ogg|m4a|webm)(\?|$)/i.test(url)) {
          HS.capturedAudioSrc = url;
        }
      } catch (e) {}
      return HS.originalXHROpen.call(this, method, url, ...rest);
    };
  }

  // ===== HOOK getUserMedia =====
  if (!HS.originalGetUserMedia) {
    HS.originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async function (constraints) {
      if (constraints?.audio && HS.fakeMicStream) {
        return HS.fakeMicStream;
      }
      return HS.originalGetUserMedia(constraints);
    };
  }

  // ===== HELPERS =====
  function findSpeakerBtn() {
    return document.querySelector("i.fa-volume-up")?.closest("div, button");
  }

  function findMicBtn() {
    return [...document.querySelectorAll("button.question-type__recordType02")]
      .find(btn => btn.querySelector("i.fa-microphone") && btn.offsetParent !== null);
  }

  function findStopBtn() {
    return [...document.querySelectorAll("button.question-type__recordType02")]
      .find(btn => btn.querySelector("i.fa-stop") && btn.offsetParent !== null);
  }

  function findNextBtn() {
  return [...document.querySelectorAll(".sc-kpDqfm button.ant-btn.ant-btn-primary")]
    .find(btn => btn.innerText.trim() === "Tiếp tục" && btn.offsetParent !== null)
    ||
    [...document.querySelectorAll("button.ant-btn.ant-btn-primary")]
    .find(btn => btn.innerText.trim() === "Tiếp tục" && btn.offsetParent !== null);
}

  function waitFor(fn, timeout = 15000, interval = 150) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (!HS.running) { clearInterval(timer); reject(new Error("STOPPED")); return; }
        const el = fn();
        if (el) { clearInterval(timer); resolve(el); }
        else if (Date.now() - start > timeout) {
          clearInterval(timer);
          reject(new Error("Timeout: " + fn.name));
        }
      }, interval);
    });
  }

  function sleep(ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      // check stop mỗi 100ms
      const checker = setInterval(() => {
        if (!HS.running) { clearTimeout(t); clearInterval(checker); reject(new Error("STOPPED")); }
      }, 100);
      // khi resolve thì clear checker
      setTimeout(() => clearInterval(checker), ms + 50);
    });
  }

  async function localizeCapturedAudio() {
    if (!HS.capturedAudioSrc) return null;
    try {
      const res = await fetch(HS.capturedAudioSrc);
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch (e) {
      return HS.capturedAudioSrc;
    }
  }

  async function prepareFakeMic(audioUrl) {
    // Reset ctx cũ nếu có
    if (HS.fakeAudioCtx) {
      try { await HS.fakeAudioCtx.close(); } catch (e) {}
    }

    const audio = new Audio(audioUrl);
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";

    await new Promise((resolve, reject) => {
      audio.oncanplaythrough = resolve;
      audio.onerror = reject;
      audio.load();
    });

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

    console.log("%c[1] Click speaker...", "color:deepskyblue");
    const speakerBtn = findSpeakerBtn();
    if (!speakerBtn) throw new Error("Không tìm thấy nút speaker!");
    speakerBtn.click();

    // 2. Chờ capture audio
    console.log("%c[2] Chờ capture audio...", "color:deepskyblue");
    await waitFor(() => HS.capturedAudioSrc, 8000);
    console.log("[2] Captured:", HS.capturedAudioSrc);

    // 3. Chuẩn bị fake mic
    console.log("%c[3] Chuẩn bị fake mic...", "color:deepskyblue");
    const audioUrl = await localizeCapturedAudio();
    await prepareFakeMic(audioUrl);
    console.log("[3] Fake mic OK!");

    // 4. Chờ nút mic hiện (audio speaker phát xong)
    console.log("%c[4] Chờ speaker phát xong...", "color:deepskyblue");
    await waitFor(() => findMicBtn(), 30000);
    console.log("[4] Nút mic đã hiện!");

    // 5. Click mic
    console.log("%c[5] Click Record...", "color:lime");
    findMicBtn().click();
    await sleep(300);

    // 6. Play fake audio vào mic, chờ xong
    if (HS.fakeAudioCtx?.state === "suspended") await HS.fakeAudioCtx.resume();
    HS.fakeAudioEl.currentTime = 0;

    await new Promise((resolve, reject) => {
      HS.fakeAudioEl.onended = resolve;
      HS.fakeAudioEl.onerror = reject;
      HS.fakeAudioEl.play().catch(reject);
    });

    console.log("%c[6] Audio xong!", "color:lime");
    await sleep(300);

    // 7. Click Stop nếu còn hiện
    const stopBtn = findStopBtn();
    if (stopBtn) {
      console.log("%c[7] Click Stop...", "color:orange");
      stopBtn.click();
      await sleep(500);
    } else {
      console.log("[7] Không có nút Stop (trang tự dừng).");
    }

    console.log("%c[8] Đợi bạn bấm Tiếp tục...", "color:yellow;font-weight:bold");
    await waitFor(() => !findSpeakerBtn(), 60000).catch(() => {}); // chờ speaker cũ mất
    await waitFor(() => findSpeakerBtn(), 60000);                  // chờ speaker mới hiện
    await sleep(500);
    console.log("%c[8] Câu mới đã load, tiếp tục!", "color:lime");
  }

  // ===== MAIN LOOP =====
  async function mainLoop() {
    let i = 1;
    while (HS.running) {
      try {
        await runOnce(i++);
      } catch (err) {
        if (err.message === "STOPPED") {
          console.log("%cĐã dừng theo lệnh stop().", "color:gray;font-size:14px");
          break;
        }
        console.error(`Lỗi câu ${i - 1}:`, err.message);
        console.log("%c⚠ Thử lại sau 2s...", "color:yellow");
        await new Promise(r => setTimeout(r, 2000));
        if (!HS.running) break;
      }
    }
    console.log("%cBot đã dừng.", "color:gray;font-size:14px;font-weight:bold");
  }

  // ===== PUBLIC API =====
  window.play = function () {
    if (HS.running) { console.warn("Đang chạy rồi!"); return; }
    HS.running = true;
    console.log("%cBắt đầu tự động! Gõ stop() để dừng.", "color:lime;font-size:14px;font-weight:bold");
    mainLoop();
  };

  window.stop = function () {
    HS.running = false;
    console.log("%cĐang dừng sau bước hiện tại...", "color:orange;font-size:14px;font-weight:bold");
  };

  console.log("%cHOOK READY", "color:lime;font-size:16px;font-weight:bold");
  console.log("%cplay()  — bắt đầu tự động", "color:cyan");
  console.log("%cstop()  — dừng lại", "color:gray");
})();
