(function () {
  function focusables(root) {
    return Array.prototype.slice.call(root.querySelectorAll('a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'))
      .filter(function (node) { return node.getClientRects().length > 0; });
  }

  function close(details, summary, restore) {
    details.open = false;
    if (restore) summary.focus();
  }

  function init(root) {
    var details = root.querySelector("[data-connected-nav]");
    if (!details || details.dataset.connectedNavReady === "true") return;
    details.dataset.connectedNavReady = "true";
    var summary = details.querySelector("summary");
    var panel = details.querySelector(".connected-nav__panel");
    var closeButton = details.querySelector("[data-connected-nav-close]");
    var scrim = details.querySelector("[data-connected-nav-scrim]");
    if (!summary || !panel) return;

    details.addEventListener("toggle", function () {
      if (!details.open) return;
      window.setTimeout(function () {
        var first = closeButton || panel.querySelector("a[href]") || summary;
        first.focus();
      }, 0);
    });

    if (closeButton) closeButton.addEventListener("click", function () { close(details, summary, true); });
    if (scrim) scrim.addEventListener("click", function () { close(details, summary, true); });

    details.addEventListener("keydown", function (event) {
      if (!details.open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close(details, summary, true);
        return;
      }
      if (event.key !== "Tab") return;
      var nodes = focusables(panel);
      if (!nodes.length) return;
      var first = nodes[0];
      var last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  function boot() {
    document.querySelectorAll(".connected-nav-root").forEach(init);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
}());
