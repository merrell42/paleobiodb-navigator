/**
 * Navigation-tree UI: clickable ancestor and child buttons for the local taxon tree.
 */
var taxaTreeHierarchy = (function () {
  var CHILDREN_DISPLAY_LIMIT = 10;
  var ANCESTOR_SHIFT_MS = 600;
  var CHILD_ROW_TRANSITION_MS = 600;
  var CHILD_ENTER_MS = 600;

  var currentTaxonName = null;
  var isAnimating = false;
  var animatingToName = null;
  var animationPromise = null;

  function getOccurrencePercentValue(occurrences, total) {
    if (occurrences == null || total == null || total === 0) {
      return null;
    }
    return (occurrences / total) * 100;
  }

  function formatOccurrencePercentage(occurrences, total) {
    var percent = getOccurrencePercentValue(occurrences, total);
    if (percent == null) {
      return "unknown";
    }
    if (percent < 1) {
      return "";
    }
    return Math.round(percent) + "%";
  }

  function capitalizeName(name) {
    return name.split(" ").map(function (word) {
      if (!word) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(" ");
  }

  function getIconUrl(iconId) {
    if (!iconId || typeof paleo_nav === "undefined") {
      return null;
    }
    return paleo_nav.dataUrl + paleo_nav.dataService + "/taxa/thumb.png?id=" + iconId;
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function captureRect(el) {
    return el.getBoundingClientRect();
  }

  function findTaxonButton(container, taxonName) {
    if (!container) {
      return null;
    }
    var buttons = container.querySelectorAll(".local-hierarchy-btn");
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].getAttribute("data-taxon-name") === taxonName) {
        return buttons[i];
      }
    }
    return null;
  }

  function isDirectChild(parentName, childName) {
    return taxaTree.getParent(childName) === parentName;
  }

  function getPanelGap(panel) {
    var styles = window.getComputedStyle(panel);
    var gap = parseFloat(styles.columnGap || styles.gap || "0");
    return isNaN(gap) ? 4 : gap;
  }

  function removeAnimClones() {
    var clones = document.querySelectorAll(".local-hierarchy-anim-clone");
    for (var i = 0; i < clones.length; i++) {
      clones[i].parentNode.removeChild(clones[i]);
    }
  }

  function createFixedClone(sourceEl, rect) {
    var clone = sourceEl.cloneNode(true);
    clone.classList.add("local-hierarchy-anim-clone");
    clone.style.position = "fixed";
    clone.style.left = rect.left + "px";
    clone.style.top = rect.top + "px";
    clone.style.width = rect.width + "px";
    clone.style.height = rect.height + "px";
    clone.style.margin = "0";
    clone.style.zIndex = "200";
    clone.style.boxSizing = "border-box";
    clone.style.pointerEvents = "none";
    clone.style.transform = "none";
    clone.style.transition = "none";
    clone.style.visibility = "visible";
    clone.style.opacity = "1";
    clone.style.display = "block";
    document.body.appendChild(clone);
    return clone;
  }

  function measureContentWidth(el) {
    var range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect().width;
  }

  function copyVisualStyles(el) {
    var cs = window.getComputedStyle(el);
    return {
      backgroundColor: cs.backgroundColor,
      borderTopWidth: cs.borderTopWidth,
      borderRightWidth: cs.borderRightWidth,
      borderBottomWidth: cs.borderBottomWidth,
      borderLeftWidth: cs.borderLeftWidth,
      borderTopStyle: cs.borderTopStyle,
      borderRightStyle: cs.borderRightStyle,
      borderBottomStyle: cs.borderBottomStyle,
      borderLeftStyle: cs.borderLeftStyle,
      borderTopColor: cs.borderTopColor,
      borderRightColor: cs.borderRightColor,
      borderBottomColor: cs.borderBottomColor,
      borderLeftColor: cs.borderLeftColor,
      borderRadius: cs.borderRadius,
      paddingTop: cs.paddingTop,
      paddingRight: cs.paddingRight,
      paddingBottom: cs.paddingBottom,
      paddingLeft: cs.paddingLeft,
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
      textAlign: cs.textAlign,
      color: cs.color
    };
  }

  function applyVisualStyles(el, styles) {
    el.style.backgroundColor = styles.backgroundColor;
    el.style.borderTopWidth = styles.borderTopWidth;
    el.style.borderRightWidth = styles.borderRightWidth;
    el.style.borderBottomWidth = styles.borderBottomWidth;
    el.style.borderLeftWidth = styles.borderLeftWidth;
    el.style.borderTopStyle = styles.borderTopStyle || "solid";
    el.style.borderRightStyle = styles.borderRightStyle || "solid";
    el.style.borderBottomStyle = styles.borderBottomStyle || "solid";
    el.style.borderLeftStyle = styles.borderLeftStyle || "solid";
    el.style.borderTopColor = styles.borderTopColor;
    el.style.borderRightColor = styles.borderRightColor;
    el.style.borderBottomColor = styles.borderBottomColor;
    el.style.borderLeftColor = styles.borderLeftColor;
    el.style.borderRadius = styles.borderRadius;
    el.style.paddingTop = styles.paddingTop;
    el.style.paddingRight = styles.paddingRight;
    el.style.paddingBottom = styles.paddingBottom;
    el.style.paddingLeft = styles.paddingLeft;
    el.style.fontSize = styles.fontSize;
    el.style.lineHeight = styles.lineHeight;
    el.style.textAlign = styles.textAlign;
    el.style.color = styles.color;
  }

  function mergeBorderWidths(targetStyles, sourceStyles) {
    targetStyles.borderTopWidth = sourceStyles.borderTopWidth;
    targetStyles.borderRightWidth = sourceStyles.borderRightWidth;
    targetStyles.borderBottomWidth = sourceStyles.borderBottomWidth;
    targetStyles.borderLeftWidth = sourceStyles.borderLeftWidth;
    targetStyles.borderTopStyle = sourceStyles.borderTopStyle || "solid";
    targetStyles.borderRightStyle = sourceStyles.borderRightStyle || "solid";
    targetStyles.borderBottomStyle = sourceStyles.borderBottomStyle || "solid";
    targetStyles.borderLeftStyle = sourceStyles.borderLeftStyle || "solid";
    return targetStyles;
  }

  function morphTransitionProps(duration) {
    return [
      "left " + duration + "ms cubic-bezier(0.4, 0, 0.2, 1)",
      "top " + duration + "ms cubic-bezier(0.4, 0, 0.2, 1)",
      "width " + duration + "ms cubic-bezier(0.4, 0, 0.2, 1)",
      "height " + duration + "ms cubic-bezier(0.4, 0, 0.2, 1)",
      "background-color " + duration + "ms ease",
      "border-top-color " + duration + "ms ease",
      "border-right-color " + duration + "ms ease",
      "border-bottom-color " + duration + "ms ease",
      "border-left-color " + duration + "ms ease",
      "border-radius " + duration + "ms ease",
      "padding-top " + duration + "ms ease",
      "padding-right " + duration + "ms ease",
      "padding-bottom " + duration + "ms ease",
      "padding-left " + duration + "ms ease",
      "font-size " + duration + "ms ease",
      "line-height " + duration + "ms ease",
      "color " + duration + "ms ease"
    ];
  }

  function animateMorphClone(el, toRect, toStyles, duration) {
    return new Promise(function (resolve) {
      el.style.transition = "none";
      el.offsetHeight;
      el.style.transition = morphTransitionProps(duration).join(", ");
      applyVisualStyles(el, toStyles);
      el.style.left = toRect.left + "px";
      el.style.top = toRect.top + "px";
      el.style.width = toRect.width + "px";
      el.style.height = toRect.height + "px";
      setTimeout(resolve, duration);
    });
  }

  function measureAncestorAppearance(taxonName, panel) {
    var probe = createTaxonButton(taxonName, false, false);
    probe.style.visibility = "hidden";
    probe.style.position = "absolute";
    probe.style.pointerEvents = "none";
    panel.appendChild(probe);
    var appearance = {
      width: probe.offsetWidth,
      height: probe.offsetHeight,
      styles: copyVisualStyles(probe)
    };
    panel.removeChild(probe);
    return appearance;
  }

  function measureSelectedLabelAppearance(width, height, panel) {
    var probe = document.createElement("span");
    probe.className = "local-hierarchy-current-label";
    probe.textContent = "X";
    probe.style.visibility = "hidden";
    probe.style.position = "absolute";
    probe.style.width = width + "px";
    probe.style.height = height + "px";
    panel.appendChild(probe);
    var styles = copyVisualStyles(probe);
    panel.removeChild(probe);
    return styles;
  }

  function promoteElementFixed(el, rect) {
    el.style.position = "fixed";
    el.style.left = rect.left + "px";
    el.style.top = rect.top + "px";
    el.style.width = rect.width + "px";
    el.style.height = rect.height + "px";
    el.style.margin = "0";
    el.style.zIndex = "200";
    el.style.boxSizing = "border-box";
    el.style.pointerEvents = "none";
    el.style.transform = "none";
    el.style.transition = "none";
    document.body.appendChild(el);
  }

  function clearRowMotionStyles(panel) {
    if (!panel) {
      return;
    }
    var elements = panel.querySelectorAll(".local-hierarchy-btn, .local-hierarchy-current-label");
    for (var i = 0; i < elements.length; i++) {
      elements[i].style.transition = "";
      elements[i].style.transform = "";
      elements[i].style.opacity = "";
      elements[i].style.visibility = "";
    }
  }

  function createTaxonButton(taxonName, showOccurrences, showCommonName, parentTotalOccurrences) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-default btn-xs local-hierarchy-btn";
    button.setAttribute("data-taxon-name", taxonName);

    var common = showCommonName !== false ? taxaTree.getCommonName(taxonName) : null;
    var percent = "";
    var percentValue = null;
    if (showOccurrences) {
      var occurrences = taxaTree.getTotalOccurrences(taxonName);
      percentValue = getOccurrencePercentValue(occurrences, parentTotalOccurrences);
      percent = formatOccurrencePercentage(occurrences, parentTotalOccurrences);
      button.classList.add(percentValue != null && percentValue >= 1
        ? "local-hierarchy-text-large"
        : "local-hierarchy-text-small");
    }

    var primaryLine = document.createElement("span");
    primaryLine.className = "local-hierarchy-primary-line";
    primaryLine.textContent = taxonName;

    if (showOccurrences && percentValue != null && percentValue >= 1) {
      var iconId = taxaTree.getIcon(taxonName);
      var iconUrl = getIconUrl(iconId);
      if (iconUrl) {
        var icon = document.createElement("img");
        icon.className = "local-hierarchy-icon";
        icon.src = iconUrl;
        icon.alt = "";
        button.appendChild(icon);
      }
    }

    button.appendChild(primaryLine);

    if (common) {
      var secondaryText = capitalizeName(common);
      if (percent) {
        secondaryText += " " + percent;
      }
      var secondaryLine = document.createElement("span");
      secondaryLine.className = "local-hierarchy-secondary-line";
      secondaryLine.textContent = secondaryText;
      button.appendChild(secondaryLine);
    } else if (percent) {
      primaryLine.textContent = taxonName + " " + percent;
    }

    return button;
  }

  function renderAncestorsRow(name) {
    var panel = document.getElementById("localTaxonAncestorsPanel");
    if (!panel) {
      return;
    }

    panel.innerHTML = "";
    var ancestors = taxaTree.getAncestors(name).slice().reverse();

    ancestors.forEach(function (taxonName) {
      panel.appendChild(createTaxonButton(taxonName, false, false));
    });

    var label = document.createElement("span");
    label.className = "local-hierarchy-current-label";
    label.textContent = name;
    panel.appendChild(label);
  }

  function getQualifyingChildren(children, parentTotalOccurrences) {
    return children.filter(function (taxonName) {
      var occurrences = taxaTree.getTotalOccurrences(taxonName);
      var percentValue = getOccurrencePercentValue(occurrences, parentTotalOccurrences);
      return percentValue != null && percentValue >= 1;
    });
  }

  function getChildrenPanelBoundaryTop() {
    var timeEl = document.getElementById("time");
    if (timeEl) {
      var timeScale = document.querySelector(".timeScale");
      if (!timeScale || window.getComputedStyle(timeScale).visibility !== "hidden") {
        return timeEl.getBoundingClientRect().top;
      }
    }

    var graphics = document.getElementById("graphics");
    if (graphics) {
      return graphics.getBoundingClientRect().bottom;
    }

    var map = document.getElementById("map");
    if (map) {
      return map.getBoundingClientRect().bottom;
    }

    return null;
  }

  function updateChildrenPanelMaxHeight() {
    var childrenPanel = document.getElementById("localTaxonChildrenPanel");
    if (!childrenPanel || childrenPanel.style.display === "none") {
      return;
    }

    var gap = 4;
    var boundaryTop = getChildrenPanelBoundaryTop();

    if (boundaryTop == null) {
      childrenPanel.style.maxHeight = "";
      return;
    }

    var maxHeight = boundaryTop - childrenPanel.getBoundingClientRect().top - gap;
    if (maxHeight > 0) {
      childrenPanel.style.maxHeight = Math.floor(maxHeight) + "px";
    } else {
      childrenPanel.style.maxHeight = "";
    }
  }

  function renderChildrenColumn(children, parentName, expanded, animateEnter) {
    var panel = document.getElementById("localTaxonChildrenPanel");
    if (!panel) {
      return panel;
    }

    var parentTotalOccurrences = taxaTree.getTotalOccurrences(parentName);
    panel.innerHTML = "";
    panel.classList.remove("local-hierarchy-children-revealing");
    panel.style.height = "";

    var visibleChildren = expanded || children.length <= CHILDREN_DISPLAY_LIMIT
      ? children
      : children.slice(0, CHILDREN_DISPLAY_LIMIT);

    var container = panel;
    if (animateEnter) {
      panel.classList.add("local-hierarchy-children-revealing");
      container = document.createElement("div");
      container.className = "local-hierarchy-children-inner";
      panel.appendChild(container);
    }

    visibleChildren.forEach(function (taxonName) {
      container.appendChild(createTaxonButton(taxonName, true, undefined, parentTotalOccurrences));
    });

    if (!expanded && children.length > CHILDREN_DISPLAY_LIMIT) {
      var moreButton = document.createElement("button");
      moreButton.type = "button";
      moreButton.className = "btn btn-default btn-xs local-hierarchy-more-btn";
      moreButton.textContent = "▼";
      moreButton.addEventListener("click", function (event) {
        event.preventDefault();
        renderChildrenColumn(children, parentName, true);
        attachHierarchyClickHandlers();
      });
      container.appendChild(moreButton);
    }

    if (animateEnter) {
      var items = container.querySelectorAll(".local-hierarchy-btn, .local-hierarchy-more-btn");
      var lastItem = items.length ? items[items.length - 1] : null;
      var startOffset = lastItem ? lastItem.offsetTop : 0;

      panel.style.height = container.offsetHeight + "px";
      container.style.transition = "none";
      container.style.transform = "translateY(-" + startOffset + "px)";

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          container.style.transition = "transform " + CHILD_ENTER_MS + "ms cubic-bezier(0.4, 0, 0.2, 1)";
          container.style.transform = "translateY(0)";
        });
      });
    }

    requestAnimationFrame(updateChildrenPanelMaxHeight);
    return panel;
  }

  function finishChildrenReveal(panel) {
    if (!panel) {
      return;
    }
    var inner = panel.querySelector(".local-hierarchy-children-inner");
    if (inner) {
      inner.style.transition = "";
      inner.style.transform = "";
    }
    panel.classList.remove("local-hierarchy-children-revealing");
    panel.style.height = "";
  }

  function waitForChildrenEnter(panel) {
    if (!panel) {
      return Promise.resolve();
    }
    var inner = panel.querySelector(".local-hierarchy-children-inner");
    if (!inner) {
      return Promise.resolve();
    }
    return wait(CHILD_ENTER_MS).then(function () {
      finishChildrenReveal(panel);
    });
  }

  function attachHierarchyClickHandlers() {
    $("#localTaxonHierarchy .local-hierarchy-btn").off("click").on("click", function (event) {
      event.preventDefault();
      if (isAnimating) {
        return;
      }

      var taxonName = $(this).attr("data-taxon-name");
      if (!taxonName || typeof navMap === "undefined") {
        return;
      }

      var childrenPanel = document.getElementById("localTaxonChildrenPanel");
      var ancestorsPanel = document.getElementById("localTaxonAncestorsPanel");
      var fromName = currentTaxonName;
      if (!fromName && ancestorsPanel) {
        var currentLabel = ancestorsPanel.querySelector(".local-hierarchy-current-label");
        fromName = currentLabel ? currentLabel.textContent : null;
      }

      var clickedInChildren = childrenPanel && childrenPanel.contains(this);
      if (clickedInChildren && fromName && isDirectChild(fromName, taxonName) && !prefersReducedMotion()) {
        animateChildSelection(fromName, taxonName);
      }

      navMap.filterByTaxon(taxonName, false, true);
    });
  }

  function showHierarchyInstant(name) {
    var panel = document.getElementById("localTaxonHierarchy");
    if (!panel) {
      return Promise.resolve();
    }

    return taxaTree.load().then(function () {
      var children = taxaTree.getChildren(name);
      var childrenPanel = document.getElementById("localTaxonChildrenPanel");
      var parentTotalOccurrences = taxaTree.getTotalOccurrences(name);
      var qualifyingChildren = getQualifyingChildren(children, parentTotalOccurrences);

      function finishRender() {
        removeAnimClones();
        clearRowMotionStyles(document.getElementById("localTaxonAncestorsPanel"));
        renderAncestorsRow(name);
        renderChildrenColumn(children, name);
        attachHierarchyClickHandlers();
        currentTaxonName = name;

        panel.style.display = "flex";
        if (childrenPanel) {
          childrenPanel.style.display = children.length > 0 ? "flex" : "none";
        }
        requestAnimationFrame(updateChildrenPanelMaxHeight);
      }

      return taxaTree.fetchIcons(qualifyingChildren).then(finishRender).catch(finishRender);
    });
  }

  function animateChildSelection(fromName, toName) {
    var panel = document.getElementById("localTaxonHierarchy");
    var ancestorsPanel = document.getElementById("localTaxonAncestorsPanel");
    var childrenPanel = document.getElementById("localTaxonChildrenPanel");

    if (!panel || !ancestorsPanel || !childrenPanel || isAnimating) {
      return Promise.resolve();
    }

    var currentLabel = ancestorsPanel.querySelector(".local-hierarchy-current-label");
    var selectedChild = findTaxonButton(childrenPanel, toName);

    if (!currentLabel || !selectedChild || currentLabel.textContent !== fromName) {
      return Promise.resolve();
    }

    isAnimating = true;
    animatingToName = toName;
    panel.classList.add("local-hierarchy-animating");
    removeAnimClones();

    var currentRect = captureRect(currentLabel);
    var childRect = captureRect(selectedChild);

    var siblingButtons = childrenPanel.querySelectorAll(".local-hierarchy-btn, .local-hierarchy-more-btn");
    for (var i = 0; i < siblingButtons.length; i++) {
      if (siblingButtons[i] !== selectedChild) {
        siblingButtons[i].parentNode.removeChild(siblingButtons[i]);
      }
    }

    selectedChild.style.visibility = "hidden";
    var childClone = createFixedClone(selectedChild, childRect);
    applyVisualStyles(childClone, copyVisualStyles(selectedChild));

    var slotPlaceholder = document.createElement("span");
    slotPlaceholder.className = "local-hierarchy-current-label local-hierarchy-slot-placeholder";
    slotPlaceholder.setAttribute("aria-hidden", "true");
    slotPlaceholder.style.visibility = "hidden";
    slotPlaceholder.style.boxSizing = "border-box";
    slotPlaceholder.style.width = currentRect.width + "px";
    slotPlaceholder.style.height = currentRect.height + "px";
    slotPlaceholder.style.flexShrink = "0";
    ancestorsPanel.appendChild(slotPlaceholder);

    var currentStartStyles = copyVisualStyles(currentLabel);
    var currentTextWidth = measureContentWidth(currentLabel);
    var currentStartPad = Math.max(0, (currentRect.width - currentTextWidth) / 2);
    promoteElementFixed(currentLabel, currentRect);
    applyVisualStyles(currentLabel, currentStartStyles);
    currentLabel.style.textAlign = "left";
    currentLabel.style.paddingLeft = currentStartPad + "px";
    currentLabel.style.whiteSpace = "nowrap";
    currentLabel.style.overflow = "hidden";

    var gap = getPanelGap(ancestorsPanel);
    var ancestorAppearance = measureAncestorAppearance(fromName, ancestorsPanel);
    var shiftX = -(ancestorAppearance.width + gap);

    var childPrimary = childClone.querySelector(".local-hierarchy-primary-line");
    if (childPrimary) {
      childPrimary.textContent = toName;
    }

    var childIcon = childClone.querySelector(".local-hierarchy-icon");
    if (childIcon) {
      var sourceIcon = selectedChild.querySelector(".local-hierarchy-icon");
      childIcon.style.height = sourceIcon
        ? window.getComputedStyle(sourceIcon).height
        : "28px";
    }

    var childSecondary = childClone.querySelector(".local-hierarchy-secondary-line");
    if (childSecondary) {
      childSecondary.style.transition = "opacity " + CHILD_ROW_TRANSITION_MS + "ms ease, max-height " + CHILD_ROW_TRANSITION_MS + "ms ease";
      childSecondary.style.opacity = "0";
      childSecondary.style.maxHeight = "0";
      childSecondary.style.overflow = "hidden";
    }

    var childTarget = {
      left: currentRect.left,
      top: currentRect.top,
      width: currentRect.width,
      height: currentRect.height
    };
    var currentTarget = {
      left: currentRect.left + shiftX,
      top: currentRect.top,
      width: ancestorAppearance.width,
      height: ancestorAppearance.height
    };

    var childEndStyles = measureSelectedLabelAppearance(currentRect.width, currentRect.height, ancestorsPanel);
    var currentEndStyles = mergeBorderWidths(
      ancestorAppearance.styles,
      currentStartStyles
    );
    currentEndStyles.paddingLeft = ancestorAppearance.styles.paddingLeft;
    currentEndStyles.paddingRight = ancestorAppearance.styles.paddingRight;

    var dataPromise = taxaTree.load().then(function () {
      var children = taxaTree.getChildren(toName);
      var qualifyingChildren = getQualifyingChildren(children, taxaTree.getTotalOccurrences(toName));
      return taxaTree.fetchIcons(qualifyingChildren).catch(function () {
        return null;
      }).then(function () {
        return children;
      });
    });

    var rowPromise = new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          var ancestorButtons = ancestorsPanel.querySelectorAll(".local-hierarchy-btn");
          for (var k = 0; k < ancestorButtons.length; k++) {
            ancestorButtons[k].style.transition = "transform " + ANCESTOR_SHIFT_MS + "ms cubic-bezier(0.4, 0, 0.2, 1)";
            ancestorButtons[k].style.transform = "translateX(" + shiftX + "px)";
          }

          if (childIcon) {
            childIcon.style.transition = "height " + CHILD_ROW_TRANSITION_MS + "ms cubic-bezier(0.4, 0, 0.2, 1), opacity " + CHILD_ROW_TRANSITION_MS + "ms ease, margin " + CHILD_ROW_TRANSITION_MS + "ms ease";
            childIcon.style.height = "0";
            childIcon.style.opacity = "0";
            childIcon.style.marginBottom = "0";
          }

          Promise.all([
            animateMorphClone(childClone, childTarget, childEndStyles, CHILD_ROW_TRANSITION_MS),
            animateMorphClone(currentLabel, currentTarget, currentEndStyles, ANCESTOR_SHIFT_MS)
          ]).then(resolve);
        });
      });
    });

    animationPromise = rowPromise.then(function () {
      return dataPromise;
    }).then(function (children) {
      removeAnimClones();
      if (currentLabel.parentNode) {
        currentLabel.style.visibility = "hidden";
      }
      renderAncestorsRow(toName);
      if (currentLabel.parentNode) {
        currentLabel.parentNode.removeChild(currentLabel);
      }
      clearRowMotionStyles(ancestorsPanel);
      if (selectedChild.parentNode) {
        selectedChild.parentNode.removeChild(selectedChild);
      }
      attachHierarchyClickHandlers();
      currentTaxonName = toName;

      if (children.length > 0) {
        childrenPanel.style.display = "flex";
        renderChildrenColumn(children, toName, false, true);
        attachHierarchyClickHandlers();
        return waitForChildrenEnter(childrenPanel).then(function () {
          requestAnimationFrame(updateChildrenPanelMaxHeight);
        });
      }

      childrenPanel.innerHTML = "";
      childrenPanel.style.display = "none";
      requestAnimationFrame(updateChildrenPanelMaxHeight);
    }).catch(function () {
      removeAnimClones();
      return showHierarchyInstant(toName);
    }).then(function () {
      isAnimating = false;
      animatingToName = null;
      animationPromise = null;
      panel.classList.remove("local-hierarchy-animating");
    });

    return animationPromise;
  }

  function showHierarchy(name) {
    var panel = document.getElementById("localTaxonHierarchy");
    if (!panel) {
      return Promise.resolve();
    }

    if (isAnimating && animatingToName === name && animationPromise) {
      return animationPromise;
    }

    if (isAnimating) {
      return animationPromise || Promise.resolve();
    }

    if (currentTaxonName === name) {
      var ancestorsPanel = document.getElementById("localTaxonAncestorsPanel");
      var currentLabel = ancestorsPanel && ancestorsPanel.querySelector(".local-hierarchy-current-label");
      if (currentLabel && currentLabel.textContent === name) {
        return Promise.resolve();
      }
    }

    return showHierarchyInstant(name);
  }

  if (window) {
    window.addEventListener("resize", updateChildrenPanelMaxHeight);
    if (ResizeObserver) {
      var timeEl = document.getElementById("time");
      if (timeEl) {
        var resizeObserver = new ResizeObserver(updateChildrenPanelMaxHeight);
        resizeObserver.observe(timeEl);
      }
    }
  }

  function hideHierarchy() {
    var panel = document.getElementById("localTaxonHierarchy");
    if (panel) {
      panel.style.display = "none";
      panel.classList.remove("local-hierarchy-animating");
    }
    removeAnimClones();
    currentTaxonName = null;
    isAnimating = false;
    animatingToName = null;
    animationPromise = null;
  }

  return {
    showHierarchy: showHierarchy,
    hideHierarchy: hideHierarchy
  };
})();
