(() => {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
        await registration.update();
      } catch {}
    });
  }

})();
