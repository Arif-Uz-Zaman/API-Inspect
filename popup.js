// Popup script
document.getElementById('openWindow').addEventListener('click', () => {
  chrome.windows.create({
    url: chrome.runtime.getURL('window.html'),
    type: 'popup',
    width: 1400,
    height: 900
  });
  window.close();
});

document.getElementById('openDevTools').addEventListener('click', () => {
  alert('Please open Chrome DevTools (press F12) and click the "API Inspector" tab');
  window.close();
});
