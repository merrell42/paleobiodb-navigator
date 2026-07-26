/**
 * Navigation-tree UI: clickable ancestor and child buttons for the local taxon tree.
 */
var taxaTreeHierarchy = (function () {
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

  function renderChildrenColumn(children, parentName) {
    var panel = document.getElementById("localTaxonChildrenPanel");
    if (!panel) {
      return;
    }

    var parentTotalOccurrences = taxaTree.getTotalOccurrences(parentName);
    panel.innerHTML = "";
    children.forEach(function (taxonName) {
      panel.appendChild(createTaxonButton(taxonName, true, undefined, parentTotalOccurrences));
    });
  }

  function attachHierarchyClickHandlers() {
    $("#localTaxonHierarchy .local-hierarchy-btn").off("click").on("click", function (event) {
      event.preventDefault();
      var taxonName = $(this).attr("data-taxon-name");
      if (taxonName && typeof navMap !== "undefined") {
        navMap.filterByTaxon(taxonName);
      }
    });
  }

  function showHierarchy(name) {
    var panel = document.getElementById("localTaxonHierarchy");
    if (!panel) {
      return;
    }

    return taxaTree.load().then(function () {
      var children = taxaTree.getChildren(name);
      var childrenPanel = document.getElementById("localTaxonChildrenPanel");

      renderAncestorsRow(name);
      renderChildrenColumn(children, name);
      attachHierarchyClickHandlers();

      panel.style.display = "flex";
      if (childrenPanel) {
        childrenPanel.style.display = children.length > 0 ? "flex" : "none";
      }
    });
  }

  function hideHierarchy() {
    var panel = document.getElementById("localTaxonHierarchy");
    if (panel) {
      panel.style.display = "none";
    }
  }

  return {
    showHierarchy: showHierarchy,
    hideHierarchy: hideHierarchy
  };
})();
