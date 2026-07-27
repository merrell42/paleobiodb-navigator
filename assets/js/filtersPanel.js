/**
 * Bottom-left filters panel: filter chips, summary info, layout, and undo/redo.
 */
var filtersPanel = (function () {
  var collections = 0;
  var occurrences = 0;
  var undoStack = [];
  var redoStack = [];
  var restoring = false;
  var historyEnabled = false;
  var maxHistory = 50;

  /* via http://stackoverflow.com/questions/2901102/how-to-print-a-number-with-commas-as-thousands-separators-in-javascript */
  function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function cloneFilterState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function getCurrentSnapshot() {
    return cloneFilterState(navMap.filters);
  }

  function hasHistory() {
    return undoStack.length > 0 || redoStack.length > 0;
  }

  function updateUndoRedoButtons() {
    d3.select("#filterUndo").property("disabled", undoStack.length === 0);
    d3.select("#filterRedo").property("disabled", redoStack.length === 0);
  }

  function recordFilterChange() {
    if (restoring || !historyEnabled) {
      return;
    }

    undoStack.push(getCurrentSnapshot());
    if (undoStack.length > maxHistory) {
      undoStack.shift();
    }
    redoStack = [];
    updateUndoRedoButtons();
  }

  function undo() {
    if (undoStack.length === 0) {
      return;
    }

    redoStack.push(getCurrentSnapshot());
    var previous = undoStack.pop();
    restoring = true;
    navMap.applyFilterSnapshot(previous);
    restoring = false;
    updateUndoRedoButtons();
  }

  function redo() {
    if (redoStack.length === 0) {
      return;
    }

    undoStack.push(getCurrentSnapshot());
    var next = redoStack.pop();
    restoring = true;
    navMap.applyFilterSnapshot(next);
    restoring = false;
    updateUndoRedoButtons();
  }

  function isTypingTarget(target) {
    if (!target) {
      return false;
    }

    var tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
  }

  function onHistoryKeydown(event) {
    if (!(event.ctrlKey || event.metaKey) || isTypingTarget(event.target)) {
      return;
    }

    var key = event.key || String.fromCharCode(event.keyCode || event.which);
    if (key === "z" || key === "Z") {
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
    } else if (key === "y" || key === "Y") {
      event.preventDefault();
      redo();
    }
  }

  function enableHistory() {
    historyEnabled = true;
    updateUndoRedoButtons();
  }

  function init() {
    var titleRow = d3.select(".filter-title-row");
    if (titleRow.empty()) {
      return;
    }

    if (titleRow.select(".filter-history-controls").empty()) {
      titleRow.append("span")
        .attr("class", "filter-history-controls")
        .html(
          '<button type="button" class="filter-history-btn" id="filterUndo" title="Undo (Ctrl+Z)" disabled aria-label="Undo filter change">' +
            '<svg class="filter-history-icon" viewBox="0 0 12 8" aria-hidden="true"><path d="M10 4H2M2 4L5 1M2 4L5 7" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          "</button>" +
          '<button type="button" class="filter-history-btn" id="filterRedo" title="Redo (Ctrl+Y)" disabled aria-label="Redo filter change">' +
            '<svg class="filter-history-icon" viewBox="0 0 12 8" aria-hidden="true"><path d="M2 4H10M10 4L7 1M10 4L7 7" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          "</button>"
        );
    }

    d3.select("#filterUndo").on("click", undo);
    d3.select("#filterRedo").on("click", redo);
    document.addEventListener("keydown", onHistoryKeydown);
    updateUndoRedoButtons();
  }

  function hasActiveFilters(filtersExist) {
    for (var key in filtersExist) {
      if (filtersExist.hasOwnProperty(key) && filtersExist[key] === true) {
        return true;
      }
    }
    return false;
  }

  function updateLayout(layout, getTimeScaleHeight) {
    var panelBottom;
    if (window.innerWidth < layout.mobileBreakpointWidth) {
      panelBottom = layout.mobileInfoBottom;
    } else {
      panelBottom = getTimeScaleHeight() + layout.filtersBottomGutter;
    }

    if (window.innerHeight > layout.filtersWideLayoutMinHeight) {
      d3.select(".filters")
        .style("left", layout.filtersPanelLeftGutter + "px")
        .style("top", "inherit")
        .style("bottom", panelBottom + "px");
    } else {
      d3.select(".filters")
        .style("left", (layout.filtersSidebarWidth + layout.filtersPanelLeftGutter) + "px")
        .style("top", 0)
        .style("bottom", "inherit");
    }
  }

  function updateDisplay(filtersExist, layout, getTimeScaleHeight) {
    var hasFilters = hasActiveFilters(filtersExist);
    var showTitleRow = hasFilters || hasHistory();

    d3.select(".filter-title-row")
      .style("display", showTitleRow ? "flex" : "none");

    var infoNode = d3.select(".filters .info").node();
    var infoVisible = infoNode && window.getComputedStyle(infoNode).display !== "none";

    d3.select(".filters")
      .style("display", (hasFilters || infoVisible || hasHistory()) ? "block" : "none")
      .classed("has-active-filters", hasFilters);

    updateLayout(layout, getTimeScaleHeight);
  }

  function setInfoSummary(filtersExist, layout, getTimeScaleHeight) {
    d3.select(".filters .info")
      .style("display", "block")
      .html("<strong>" + collections + " collections</strong><br>" + occurrences + " occurrences");
    updateDisplay(filtersExist, layout, getTimeScaleHeight);
  }

  function summarize(data, filtersExist, layout, getTimeScaleHeight) {
    if (data.records.length > 0) {
      if (typeof data.records[0].oid == "string" && data.records[0].oid.substr(0, 3) === "col") {
        collections = numberWithCommas(data.records.length);
      } else {
        collections = numberWithCommas(d3.sum(data.records, function (d) { return d.nco; }));
      }
      occurrences = numberWithCommas(d3.sum(data.records, function (d) { return d.noc; }));
    } else {
      collections = 0;
      occurrences = 0;
    }

    setInfoSummary(filtersExist, layout, getTimeScaleHeight);
  }

  return {
    hasActiveFilters: hasActiveFilters,
    updateDisplay: updateDisplay,
    updateLayout: updateLayout,
    setInfoSummary: setInfoSummary,
    summarize: summarize,
    init: init,
    enableHistory: enableHistory,
    recordFilterChange: recordFilterChange
  };
})();
