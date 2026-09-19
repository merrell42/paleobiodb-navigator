var timeBars = (function() {

  var barHeight = 15,
      layoutWidth = 960,
      sourceRecords = [],
      filteredSourceRecords = null,
      currentRequest = null,
      filteredRequest = null,
      fetchGeneration = 0,
      MIN_RATE_DURATION_MYR = 0.1,
      MIN_BAR_WIDTH = 3,
      MIN_BAR_HEIGHT = 1,
      LOG_SCALE = true,
      RESCALE_ON_TIME_FILTER = false;

  function getContainerWidth() {
    var graphics = document.getElementById("graphics");
    if (graphics && graphics.clientWidth) {
      return graphics.clientWidth;
    }
    var mapContainer = document.getElementById("mapContainer");
    if (mapContainer && mapContainer.clientWidth) {
      return mapContainer.clientWidth;
    }
    return parseInt(d3.select("#graphics").style("width"), 10);
  }

  function getLayoutScale(containerWidth) {
    return containerWidth / layoutWidth;
  }

  function getInterval(id) {
    return timeScale.interval_hash[String(id).replace("int:", "")];
  }

  function getFocus() {
    var focus = timeScale.currentInterval;
    if (!focus) {
      return null;
    }
    if (focus.early_age != null && focus.late_age != null) {
      return focus;
    }
    return getInterval(focus.id) || focus;
  }

  function intervalDuration(interval) {
    if (!interval || interval.early_age == null || interval.late_age == null) {
      return 0;
    }
    return interval.early_age - interval.late_age;
  }

  function ratePerMyr(count, duration) {
    if (!duration || duration <= 0 || !count) {
      return 0;
    }
    return count / duration;
  }

  function rateForBarHeight(count, duration) {
    return ratePerMyr(count, Math.max(duration, MIN_RATE_DURATION_MYR));
  }

  function overlapDuration(a, b) {
    if (!a || !b) {
      return 0;
    }

    var overlapEarly = Math.min(a.early_age, b.early_age);
    var overlapLate = Math.max(a.late_age, b.late_age);

    if (overlapLate >= overlapEarly) {
      return 0;
    }

    return overlapEarly - overlapLate;
  }

  function getRecordSourceInterval(record) {
    if (!record.cxi) {
      return null;
    }
    var interval = getInterval(record.cxi);
    if (interval && interval.early_age != null && interval.late_age != null) {
      return interval;
    }
    return null;
  }

  function isDescendantOfBar(barId, ancestorId) {
    var id = String(barId).replace("int:", "");
    var root = String(ancestorId).replace("int:", "");
    var guard = 0;

    while (id && id !== "0" && guard++ < 24) {
      if (id === root) {
        return true;
      }
      var interval = getInterval(id);
      if (!interval) {
        return false;
      }
      id = String(interval.pid);
    }

    return false;
  }

  function getDeepestLevelUnder(node) {
    if (!node) {
      return 0;
    }
    if (!node.children || !node.children.length) {
      return node.level || 0;
    }

    var deepest = 0;
    node.children.forEach(function(child) {
      deepest = Math.max(deepest, getDeepestLevelUnder(child));
    });
    return deepest;
  }

  function getBarLevel() {
    var focus = getFocus();
    if (!focus) {
      return 5;
    }

    var deepest = getDeepestLevelUnder(focus);
    if (deepest >= 5) {
      return 5;
    }
    if (deepest >= 4) {
      return 4;
    }
    return deepest || 3;
  }

  function getQuickdivReso() {
    var level = getBarLevel();
    if (level >= 5) {
      return "stage";
    }
    if (level === 4) {
      return "epoch";
    }
    if (level === 3) {
      return "period";
    }
    if (level === 2) {
      return "era";
    }
    return "period";
  }

  // Stage/epoch requests omit Precambrian: those eons have no ages. Also
  // fetch coarser bins so Proterozoic periods and Archean eras are counted.
  function getQuickdivResolutions() {
    var primary = getQuickdivReso();
    var resols = [primary];
    if (primary === "stage" || primary === "epoch") {
      resols.push("period", "era");
    } else if (primary === "period") {
      resols.push("era");
    }
    return resols;
  }

  function getMapBounds() {
    var sw = { lng: -180, lat: -90 },
        ne = { lng: 180, lat: 90 };

    if (typeof map !== "undefined" && map && map.getBounds) {
      var bounds = map.getBounds();
      sw = bounds.getSouthWest();
      ne = bounds.getNorthEast();
    }

    if (parseInt(d3.select("#map").style("height"), 10) < 1) {
      sw = { lng: -180, lat: -90 };
      ne = { lng: 180, lat: 90 };
    }

    return { sw: sw, ne: ne };
  }

  function isQuickdivData(records) {
    return records.length && records[0].oid != null && records[0].cxi == null;
  }

  function collectIntervalsAtLevel(node, level, results) {
    if (!node) {
      return;
    }
    if (node.level === level) {
      results.push(node);
      return;
    }
    if (node.children && node.children.length) {
      node.children.forEach(function(child) {
        collectIntervalsAtLevel(child, level, results);
      });
      return;
    }
    // Precambrian branches often stop at period/era. Still draw a bar there.
    if (node.level && node.early_age != null && node.late_age != null) {
      results.push(node);
    }
  }

  function getTimescaleRoot() {
    if (typeof timeScale !== "undefined" && timeScale.interval_hash) {
      return timeScale.interval_hash[0] || timeScale.interval_hash["0"];
    }
    return null;
  }

  function getBarIntervals() {
    var root = getTimescaleRoot() || getFocus();
    if (!root) {
      return [];
    }

    var level = getBarLevel();
    var intervals = [];
    collectIntervalsAtLevel(root, level, intervals);

    if (!intervals.length) {
      var focus = getFocus();
      if (focus && focus.early_age != null && focus.late_age != null) {
        intervals = [focus];
      }
    }

    return intervals;
  }

  function isBarUnderFocus(bar) {
    var focus = getFocus();
    if (!focus || focus.id == null || String(focus.id) === "0" || !focus.level) {
      return true;
    }
    return isDescendantOfBar(bar.id, focus.id);
  }

  function barGeometry(interval) {
    var barRect = d3.select("#t" + interval.id);
    if (!barRect.empty()) {
      return {
        x: parseFloat(barRect.attr("x")) || 0,
        width: parseFloat(barRect.attr("width")) || 0
      };
    }

    // Fallback before timeline layout is ready
    var focus = getFocus();
    if (!focus || interval.early_age == null || interval.late_age == null) {
      return { x: 0, width: 0 };
    }

    var focusRect = d3.select("#t" + focus.id);
    if (focusRect.empty()) {
      return { x: 0, width: 0 };
    }

    var fx = parseFloat(focusRect.attr("x")) || 0;
    var fw = parseFloat(focusRect.attr("width")) || 0;
    var focusEarly = focus.early_age;
    var focusLate = focus.late_age;
    var span = focusEarly - focusLate;

    if (span <= 0 || fw <= 0) {
      return { x: 0, width: 0 };
    }

    var left = fx + fw * (focusEarly - interval.early_age) / span;
    var right = fx + fw * (focusEarly - interval.late_age) / span;

    return {
      x: left,
      width: Math.max(0, right - left)
    };
  }

  // Very short intervals (e.g. Holocene ages) can be sub-pixel wide on a Phanerozoic
  // view. Give bars with data a minimum width, anchored to the young (right) edge.
  function barDisplayGeometry(interval, hasData) {
    var geom = barGeometry(interval);
    if (!hasData || geom.width >= MIN_BAR_WIDTH) {
      return geom;
    }
    var right = geom.x + geom.width;
    return {
      x: Math.max(0, right - MIN_BAR_WIDTH),
      width: MIN_BAR_WIDTH
    };
  }

  function descendantBars(cxi, barIntervals) {
    var descendants = [];
    barIntervals.forEach(function(bar) {
      if (isDescendantOfBar(bar.id, cxi)) {
        descendants.push(bar);
      }
    });
    return descendants;
  }

  function distributeByDuration(cxi, noc, barIntervals, counts) {
    var descendants = descendantBars(cxi, barIntervals);
    if (!descendants.length) {
      return 0;
    }

    var totalDuration = 0;
    descendants.forEach(function(bar) {
      totalDuration += intervalDuration(bar);
    });

    if (totalDuration <= 0) {
      return 0;
    }

    var placed = 0;
    descendants.forEach(function(bar) {
      var duration = intervalDuration(bar);
      var share = noc * (duration / totalDuration);
      counts[String(bar.id)] += share;
      placed += share;
    });
    return placed;
  }

  // Spread each map bin across finer bars in proportion to time overlap.
  // A bin tagged at period/epoch level is divided by duration; age-tagged bins stay local.
  function aggregateRecords(records, barIntervals) {
    var counts = {};
    var rates = {};

    barIntervals.forEach(function(bar) {
      counts[String(bar.id)] = 0;
    });

    records.forEach(function(record) {
      var source = getRecordSourceInterval(record);
      var sourceDuration = intervalDuration(source);
      var noc = +(record.noc || 0);
      var placed = 0;

      if (!noc || !record.cxi) {
        return;
      }
      if (!source || sourceDuration <= 0) {
        return;
      }

      barIntervals.forEach(function(bar) {
        if (!isDescendantOfBar(bar.id, record.cxi)) {
          return;
        }

        var overlap = overlapDuration(source, bar);
        if (overlap > 0) {
          var share = noc * (overlap / sourceDuration);
          counts[String(bar.id)] += share;
          placed += share;
        }
      });

      if (placed <= 0) {
        distributeByDuration(record.cxi, noc, barIntervals, counts);
      }
    });

    barIntervals.forEach(function(bar) {
      var duration = intervalDuration(bar);
      var count = counts[String(bar.id)] || 0;
      rates[String(bar.id)] = rateForBarHeight(count, duration);
    });

    return {
      counts: counts,
      rates: rates
    };
  }

  // Occurrence counts per geological interval from /occs/quickdiv.json.
  // Finest bins first. Coarser Precambrian bins fill gaps that have no ages.
  function aggregateQuickdiv(records, barIntervals) {
    var counts = {};
    var rates = {};

    barIntervals.forEach(function(bar) {
      counts[String(bar.id)] = 0;
    });

    var sorted = records.slice().sort(function(a, b) {
      return intervalLevelForOid(b.oid) - intervalLevelForOid(a.oid);
    });

    sorted.forEach(function(record) {
      var noc = +(record.noc || 0);
      var oid = String(record.oid);

      if (!noc || !record.oid) {
        return;
      }

      if (quickdivAlreadyCovered(oid, barIntervals, counts)) {
        return;
      }

      if (counts.hasOwnProperty(oid)) {
        counts[oid] += noc;
        return;
      }

      var descendants = descendantBars(record.oid, barIntervals);
      if (descendants.length) {
        distributeByDuration(record.oid, noc, barIntervals, counts);
      }
    });

    barIntervals.forEach(function(bar) {
      var duration = intervalDuration(bar);
      var count = counts[String(bar.id)] || 0;
      rates[String(bar.id)] = rateForBarHeight(count, duration);
    });

    return {
      counts: counts,
      rates: rates
    };
  }

  function intervalLevelForOid(oid) {
    var interval = getInterval(oid);
    return (interval && interval.level) ? interval.level : 0;
  }

  // Skip a coarser bin (period/era) when finer descendant bars already have counts.
  function quickdivAlreadyCovered(oid, barIntervals, counts) {
    var selfId = String(oid);
    var descendants = descendantBars(oid, barIntervals);
    var i;
    for (i = 0; i < descendants.length; i++) {
      var id = String(descendants[i].id);
      if (id !== selfId && (counts[id] || 0) > 0) {
        return true;
      }
    }
    return false;
  }

  function aggregateData(records, barIntervals) {
    if (isQuickdivData(records)) {
      return aggregateQuickdiv(records, barIntervals);
    }
    return aggregateRecords(records, barIntervals);
  }

  function getTimeFilterId() {
    if (typeof navMap === "undefined" || !navMap.filters || !navMap.filters.exist.selectedInterval) {
      return null;
    }
    var oid = navMap.filters.selectedInterval.oid;
    return oid ? String(oid) : null;
  }

  function isBarInTimeFilter(bar) {
    var filterId = getTimeFilterId();
    if (!filterId) {
      return true;
    }
    return isDescendantOfBar(bar.id, filterId);
  }

  function abortPendingRequests() {
    fetchGeneration += 1;
    function abortOne(req) {
      if (req && req.abort) {
        req.abort();
      }
    }
    if (Array.isArray(currentRequest)) {
      currentRequest.forEach(abortOne);
    } else if (currentRequest) {
      abortOne(currentRequest);
    }
    currentRequest = null;
    if (Array.isArray(filteredRequest)) {
      filteredRequest.forEach(abortOne);
    } else if (filteredRequest) {
      abortOne(filteredRequest);
    }
    filteredRequest = null;
  }

  function buildQuickdivUrl(skipTimeFilter, reso) {
    var bounds = getMapBounds();
    var url = paleo_nav.dataUrl + paleo_nav.dataService + "/occs/quickdiv.json?";
    url = skipTimeFilter
      ? navMap.parseURL(url, { skipFilters: ["selectedInterval"] })
      : navMap.parseURL(url);
    url += "&lngmin=" + bounds.sw.lng.toFixed(1) +
      "&lngmax=" + bounds.ne.lng.toFixed(1) +
      "&latmin=" + bounds.sw.lat.toFixed(1) +
      "&latmax=" + bounds.ne.lat.toFixed(1);
    url += "&count=genera&time_reso=" + (reso || getQuickdivReso());
    return url;
  }

  function loadQuickdivLayers(skipTimeFilter, generation, callback) {
    var resols = getQuickdivResolutions();
    var remaining = resols.length;
    var layers = new Array(resols.length);
    var requests = [];

    resols.forEach(function(reso, i) {
      var req = d3.json(buildQuickdivUrl(skipTimeFilter, reso), function(error, data) {
        if (generation !== fetchGeneration) {
          return;
        }
        layers[i] = (!error && data && data.records) ? data.records : [];
        remaining--;
        if (remaining === 0) {
          var merged = [];
          layers.forEach(function(recs) {
            merged = merged.concat(recs);
          });
          callback(merged);
        }
      });
      requests.push(req);
    });

    return requests;
  }

  function mergeFilteredCounts(contextAgg, filteredAgg, intervals) {
    var counts = {};
    var rates = {};
    var hasFilter = getTimeFilterId() && filteredAgg;

    intervals.forEach(function(bar) {
      var id = String(bar.id);
      var duration = intervalDuration(bar);
      var count;
      var inFilter = isBarInTimeFilter(bar);

      if (hasFilter && inFilter) {
        count = filteredAgg.counts[id] || 0;
      } else {
        count = contextAgg.counts[id] || 0;
      }

      counts[id] = count;
      rates[id] = rateForBarHeight(count, duration);
    });

    return { counts: counts, rates: rates };
  }

  function maxValue(values, intervals, barFilter) {
    var max = 0;
    intervals.forEach(function(bar) {
      if (barFilter && !barFilter(bar)) {
        return;
      }
      var value = values[String(bar.id)] || 0;
      if (value > max) {
        max = value;
      }
    });
    return max;
  }

  // Min and max of positive bar values.
  // Zeros are excluded, since on a log scale they would go to -Infinity.
  function nonZeroBounds(values, intervals, barFilter) {
    var min = Infinity;
    var max = 0;
    intervals.forEach(function(bar) {
      if (barFilter && !barFilter(bar)) {
        return;
      }
      var value = values[String(bar.id)] || 0;
      if (value > 0) {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    });
    return {
      min: isFinite(min) ? min : 0,
      max: max
    };
  }

  function updateOverlayVisibility() {
    var overlay = d3.select("#timeBars");
    if (overlay.empty()) {
      return;
    }

    var timeEl = d3.select("#time");
    var reconstructEl = d3.select("#reconstructMap");
    var timeVisible = timeEl.empty() || timeEl.style("visibility") !== "hidden";
    var reconstructHidden = reconstructEl.empty() || reconstructEl.style("display") !== "block";

    overlay.style("display", timeVisible && reconstructHidden ? "block" : "none");
  }

  function scaleToFullHeightLinear(value, peak) {
    var maxHeight = barHeight - 4;
    if (!peak || peak <= 0 || !value || value <= 0) {
      return 0;
    }
    return (value / peak) * maxHeight;
  }

  function scaleToFullHeightLog(value, logBounds) {
    var maxHeight = barHeight - 4;

    if (!logBounds || logBounds.min <= 0 || logBounds.max <= 0) {
      return 0;
    }

    var clamped = !value || value <= 0 ? logBounds.min : value;
    clamped = Math.max(logBounds.min, Math.min(logBounds.max, clamped));

    if (logBounds.min === logBounds.max) {
      return maxHeight;
    }

    var logMin = Math.log(logBounds.min);
    var logMax = Math.log(logBounds.max);
    return ((Math.log(clamped) - logMin) / (logMax - logMin)) * maxHeight;
  }

  function init() {
    if (d3.select("#timeBars").empty()) {
      return;
    }

    d3.select("#timeBars").attr("class", "timeBars");

    d3.select("#timeBars").append("svg:svg")
      .attr("width", layoutWidth)
      .attr("height", barHeight)
      .append("g")
      .attr("class", "timeBarsGroup");

    resize();
  }

  function setData(records) {
    sourceRecords = records || [];
    draw();
    setTimeout(draw, 100);
    setTimeout(draw, 850);
  }

  function refresh() {
    if (typeof paleo_nav === "undefined" || typeof navMap === "undefined") {
      return;
    }

    abortPendingRequests();
    filteredSourceRecords = null;

    var generation = fetchGeneration;
    var needsFiltered = RESCALE_ON_TIME_FILTER && !!getTimeFilterId();

    currentRequest = loadQuickdivLayers(true, generation, function(records) {
      currentRequest = null;
      sourceRecords = records || [];

      if (!needsFiltered) {
        setData(sourceRecords);
        return;
      }

      filteredRequest = loadQuickdivLayers(false, generation, function(filterRecords) {
        filteredRequest = null;
        filteredSourceRecords = filterRecords || [];
        draw();
        setTimeout(draw, 100);
        setTimeout(draw, 850);
      });
    });
  }

  function redraw() {
    draw();
  }

  function draw() {
    if (d3.select(".timeBarsGroup").empty()) {
      return;
    }

    updateOverlayVisibility();

    var intervals = getBarIntervals();
    if (!intervals.length || !sourceRecords.length) {
      return;
    }

    var aggregated = aggregateData(sourceRecords, intervals);
    var filteredAgg = RESCALE_ON_TIME_FILTER && filteredSourceRecords
      ? aggregateData(filteredSourceRecords, intervals)
      : null;
    var merged = mergeFilteredCounts(aggregated, filteredAgg, intervals);
    var counts = merged.counts;
    var rates = merged.rates;
    // Scale from the current zoom (and optional time filter), not off-screen bars.
    var scaleBarFilter = function(bar) {
      if (RESCALE_ON_TIME_FILTER && getTimeFilterId() && !isBarInTimeFilter(bar)) {
        return false;
      }
      return isBarUnderFocus(bar);
    };
    var peak = maxValue(rates, intervals, scaleBarFilter);

    if (peak <= 0) {
      peak = maxValue(counts, intervals, scaleBarFilter);
    }

    if (peak <= 0) {
      d3.select(".timeBarsGroup").selectAll("rect.timeBar").remove();
      return;
    }

    var useRates = maxValue(rates, intervals) > 0;
    var scaleValues = useRates ? rates : counts;
    var logBounds = LOG_SCALE ? nonZeroBounds(scaleValues, intervals, scaleBarFilter) : null;

    function barScaleHeight(value) {
      if (!value || value <= 0) {
        return 0;
      }
      var height = LOG_SCALE
        ? scaleToFullHeightLog(value, logBounds)
        : scaleToFullHeightLinear(value, peak);
      return Math.max(MIN_BAR_HEIGHT, height);
    }

    var group = d3.select(".timeBarsGroup"),
        bars = group.selectAll("rect.timeBar")
          .data(intervals, function(d) { return d.id; });

    bars.enter()
      .append("svg:rect")
      .attr("class", "timeBar")
      .on("click", function(d) {
        navMap.filterByTime(d.name);
        navMap.refresh("reset");
      });

    bars.attr("class", function(d) {
        var value = useRates ? (rates[String(d.id)] || 0) : (counts[String(d.id)] || 0);
        var classes = isBarInTimeFilter(d) ? "timeBar" : "timeBar timeBar--outside";
        if (value > 0 && barScaleHeight(value) <= MIN_BAR_HEIGHT) {
          classes += " timeBar--min";
        }
        return classes;
      })
      .attr("x", function(d) {
        var value = useRates ? (rates[String(d.id)] || 0) : (counts[String(d.id)] || 0);
        return barDisplayGeometry(d, value > 0).x;
      })
      .attr("width", function(d) {
        var value = useRates ? (rates[String(d.id)] || 0) : (counts[String(d.id)] || 0);
        return barDisplayGeometry(d, value > 0).width;
      })
      .attr("y", function(d) {
        var value = useRates ? (rates[String(d.id)] || 0) : (counts[String(d.id)] || 0);
        return barHeight - barScaleHeight(value);
      })
      .attr("height", function(d) {
        var value = useRates ? (rates[String(d.id)] || 0) : (counts[String(d.id)] || 0);
        return barScaleHeight(value);
      })
      .style("opacity", function(d) {
        var value = useRates ? (rates[String(d.id)] || 0) : (counts[String(d.id)] || 0);
        return value > 0 ? 1 : 0.25;
      });

    bars.each(function(d) {
      var count = counts[String(d.id)] || 0;
      var duration = intervalDuration(d);
      var trueRate = ratePerMyr(count, duration);
      var title = d3.select(this).select("title");
      if (title.empty()) {
        title = d3.select(this).append("svg:title");
      }
      title.text(
        d.name + ": " + Math.round(count).toLocaleString() + " occurrences" +
        " (" + trueRate.toFixed(1) + " per Myr)"
      );
    });

    bars.exit().remove();
    syncTransform();
  }

  function syncTransform() {
    var timeScaleGroup = d3.select(".timeScale g");
    var barsGroup = d3.select(".timeBarsGroup");
    if (timeScaleGroup.empty() || barsGroup.empty()) {
      return;
    }
    var transform = timeScaleGroup.attr("transform");
    if (transform) {
      barsGroup.attr("transform", transform);
    }
  }

  function resize() {
    updateOverlayVisibility();

    var containerWidth = getContainerWidth(),
        scale = getLayoutScale(containerWidth),
        svg = d3.select(".timeBars svg");

    if (svg.empty()) {
      return;
    }

    svg.style("width", containerWidth + "px")
      .style("height", Math.ceil(barHeight * scale) + "px");

    syncTransform();
    draw();
  }

  function getHeight() {
    return 0;
  }

  return {
    init: init,
    setData: setData,
    refresh: refresh,
    redraw: redraw,
    draw: draw,
    resize: resize,
    syncTransform: syncTransform,
    getHeight: getHeight
  };

})();
