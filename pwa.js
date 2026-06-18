(() => {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
        await registration.update();
      } catch {}
    });
  }

  let installPrompt;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    const button = document.createElement("button");
    button.className = "pwa-install-button";
    button.textContent = "安装到设备";
    button.addEventListener("click", async () => {
      await installPrompt.prompt();
      installPrompt = null;
      button.remove();
    });
    document.body.appendChild(button);
  });
})();
