chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'SCORE_RESULT') {
    chrome.storage.local.set({
      lastResult: msg.result,
      lastData: msg.data,
      lastTabId: sender.tab?.id,
      lastUrl: sender.tab?.url,
    });
  }
});
