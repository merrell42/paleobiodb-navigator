/**
 * Bottom-left filters panel: filter chips, summary info, and layout.
 */
var filtersPanel = (function () {
  var collections = 0;
  var occurrences = 0;

  /* via http://stackoverflow.com/questions/2901102/how-to-print-a-number-with-commas-as-thousands-separators-in-javascript */
  function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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
    d3.select(".filter-title-row")
      .style("display", hasFilters ? "block" : "none");

    var infoNode = d3.select(".filters .info").node();
    var infoVisible = infoNode && window.getComputedStyle(infoNode).display !== "none";

    d3.select(".filters")
      .style("display", (hasFilters || infoVisible) ? "block" : "none")
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
    summarize: summarize
  };
})();
