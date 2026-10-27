// DevTools initialization script
chrome.devtools.panels.create(
  "API Inspector",
  null,
  "panel.html",
  function(panel) {
    console.log("API Inspector panel created");
  }
);
